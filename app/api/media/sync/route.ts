import {recordAudit} from "@/lib/auditServer";
import { z } from "zod";
import { createHash } from "node:crypto";
import { reportIdentity, sameOrigin } from "@/lib/auth/server";
import { boundedJSON, ownedLibrary } from "@/lib/outreachServer";
import { MEDIA_PLATFORMS, mediaMetricSchema, mediaDates } from "@/lib/domain/performance";
import { knowledgeAccess } from "@/lib/domain/clientKnowledge";
import { MAX_SYNC_RUNS, visibleSyncRun, type IntegrationRun } from "@/lib/domain/integrationRuns";
import { callMediaConnector, mediaConnectorConfigured, mutateMedia } from "@/lib/mediaServer";
import { dbError } from "@/lib/db";

export const maxDuration = 90;

const base = z.object({operationId:z.string().uuid()});
const input = z.union([
  base.extend({retryId:z.string().uuid()}),
  base.extend({campaignId:z.string().min(1).max(150),platform:z.enum(MEDIA_PLATFORMS),days:z.number().int().min(1).max(60)}),
]);
const metrics = z.object({currency:z.literal("INR"),rows:z.array(mediaMetricSchema.omit({id:true,platform:true,source:true,importedAt:true})).max(3000)});
const reply = (data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
class SyncError extends Error { constructor(message:string,readonly status:number){super(message);} }

export async function GET(req:Request) {
  try {
    const user = await reportIdentity(req), library = await ownedLibrary(user.userId);
    if (library && !knowledgeAccess(library,user.userId,"integrations")) return reply({error:"Integration access is required."},403);
    return reply({runs:(library?.integrationRuns ?? []).map(run=>visibleSyncRun(run))});
  } catch(error) { return dbError(error); }
}

export async function POST(req:Request) {
  if (!sameOrigin(req)) return reply({error:"Request origin is not allowed."},403);
  try {
    const user = await reportIdentity(req);
    const parsed = input.safeParse(await boundedJSON(req,10000).catch(()=>null));
    if (!parsed.success) return reply({error:"Choose a campaign, platform and valid date range."},400);
    const request = parsed.data;
    const library = await ownedLibrary(user.userId);
    if (!library || (!knowledgeAccess(library,user.userId,"integrations",true) && !knowledgeAccess(library,user.userId,"performance",true)))
      return reply({error:"Integration or performance write access is required."},403);
    if ("retryId" in request && !knowledgeAccess(library,user.userId,"integrations",true))
      return reply({error:"Integration write access is required to retry a sync."},403);
    const prior = (library.integrationRuns ?? []).find(run=>run.id === request.operationId);
    if (prior) return prior.status === "Succeeded" ? reply({synced:prior.rows,run:prior}) : reply({error:"This operation already has a sync run.",run:visibleSyncRun(prior)},409);
    const retry = "retryId" in request ? library.integrationRuns?.find(run=>run.id === request.retryId) : undefined;
    if ("retryId" in request && (!retry || visibleSyncRun(retry).status !== "Failed")) return reply({error:"Failed sync not found."},404);

    const campaignId = "campaignId" in request ? request.campaignId : retry!.campaignId;
    const platform = "platform" in request ? request.platform : retry!.platform;
    const campaign = library.campaigns.find(item=>item.id === campaignId);
    if (!campaign?.adAccountId) return reply({error:"Add the authorized platform account ID to the campaign first."},400);
    if (retry && retry.accountId !== campaign.adAccountId)
      return reply({error:"The campaign account changed. Start a new sync with the current mapping."},409);
    const {start,end} = "days" in request ? mediaDates(request.days) : retry!;
    const run:IntegrationRun = {id:request.operationId,retryOf:retry?.id,platform,campaignId,campaignName:campaign.name,accountId:campaign.adAccountId,start,end,startedAt:new Date().toISOString(),status:"Running"};

    await mutateMedia(user.userId,crypto.randomUUID(),data=>{
      const runs = data.integrationRuns ?? [];
      if (runs.some(item=>item.id === run.id || item.campaignId === campaignId && item.platform === platform && visibleSyncRun(item).status === "Running"))
        throw new SyncError("A sync for this campaign and platform is already running.",409);
      if (retry && runs.some(item=>item.retryOf === retry.id && item.status === "Succeeded"))
        throw new SyncError("This failed sync already has a successful retry.",409);
      data.integrationRuns = [run,...runs.filter(item=>visibleSyncRun(item).status === "Running"),...runs.filter(item=>visibleSyncRun(item).status !== "Running")].slice(0,MAX_SYNC_RUNS);
      return data;
    });
    try {
      if (!(await mediaConnectorConfigured(user.userId))) throw new SyncError("Configure the live media connector before syncing.",503);
      const raw = await callMediaConnector("sync",user.userId,{campaignId,accountId:run.accountId,platform,start,end,currency:"INR"});
      const result = metrics.safeParse(raw);
      if (!result.success || result.data.rows.some(row=>row.date<start || row.date>end))
        throw new SyncError("The connector returned invalid metrics or dates outside the requested window.",502);
      const at = new Date().toISOString();
      const finished:IntegrationRun = {...run,status:"Succeeded",finishedAt:at,rows:result.data.rows.length};
      await mutateMedia(user.userId,request.operationId,data=>{
        const current = data.campaigns.find(item=>item.id === campaignId);
        const index = data.integrationRuns?.findIndex(item=>item.id === run.id && visibleSyncRun(item).status === "Running") ?? -1;
        if (!current || current.adAccountId !== run.accountId || current.clientId !== campaign.clientId || index<0)
          throw new SyncError("The campaign mapping or sync state changed. Start a new sync.",409);
        const map = new Map((current.performanceRows ?? []).map(row=>[row.id,row]));
        for (const row of result.data.rows) {
          const id = createHash("sha256").update(`${campaignId}|${platform}|${row.date}|${row.adId?`ad:${row.adId}`:"campaign"}`).digest("hex");
          map.set(id,{...row,id,platform,source:"Platform sync",importedAt:at});
        }
        if (map.size>10000) throw new SyncError("Campaign row limit exceeded. Reduce the sync window.",409);
        current.performanceRows = [...map.values()];
        current.updatedAt = at;
        data.integrationRuns![index] = finished;
        recordAudit(data,{actor:"api",actorId:user.userId,entity:"campaign",entityId:campaignId,clientId:campaign.clientId,action:"Synced campaign metrics",sources:[platform+" · "+start+" to "+end],outcome:"Succeeded",after:result.data.rows.length+" rows received",detail:campaign.name});
        return data;
      });
      return reply({synced:result.data.rows.length,run:finished});
    } catch(error) {
      const message = error instanceof SyncError ? error.message : "The connector could not complete the sync. Check authorization and retry.";
      const failed:IntegrationRun = {...run,status:"Failed",finishedAt:new Date().toISOString(),error:message};
      const saved = await mutateMedia(user.userId,crypto.randomUUID(),data=>{
        const index = data.integrationRuns?.findIndex(item=>item.id === run.id && item.status === "Running") ?? -1;
        if(index>=0){data.integrationRuns![index] = failed;recordAudit(data,{actor:"api",actorId:user.userId,entity:"campaign",entityId:campaignId,clientId:campaign.clientId,action:"Campaign sync failed",sources:[platform+" · "+start+" to "+end],outcome:"Failed",detail:message});}
        return data;
      });
      const confirmed = saved.data.integrationRuns?.find(item=>item.id === run.id);
      if (confirmed?.status === "Succeeded") return reply({synced:confirmed.rows,run:confirmed});
      return reply({error:message,run:confirmed??failed},error instanceof SyncError?error.status:502);
    }
  } catch(error) {
    return error instanceof SyncError ? reply({error:error.message},error.status) : dbError(error);
  }
}
