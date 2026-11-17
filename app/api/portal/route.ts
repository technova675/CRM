import { z } from "zod";
import { sameOrigin } from "@/lib/auth/server";
import { dbError } from "@/lib/db";
import { boundedJSON } from "@/lib/outreachServer";
import { mutateMedia } from "@/lib/mediaServer";
import { portalState } from "@/lib/domain/clientPortal";
import { ensurePortalMember, portalContext, PortalError, portalView, portalUploads, portalUploadPreview, recordPortalDecision, writePortalMessage } from "@/lib/clientPortalServer";
import { assetDownload } from "@/lib/assetDownload";
import { hiddenPortalPanels } from "@/lib/accessServer";
import { exportClientReport, reportFilename, reportMime } from "@/lib/clientReportExports";

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const failure=(error:unknown)=>error instanceof PortalError ? reply({error:error.message},error.status) : dbError(error);
const action=z.discriminatedUnion("action",[
  z.object({action:z.literal("message"),id:z.string().uuid(),text:z.string().trim().min(1).max(2000)}),
  z.object({action:z.literal("decision"),creativeId:z.string().min(1).max(180),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),verdict:z.enum(["Approved","Changes requested"]),feedback:z.string().trim().max(1000)}),
]);

export async function GET(req:Request) {
  try {
    const {account,data,owner,userId}=await portalContext(req);
    const hidden=await hiddenPortalPanels(owner,userId);
    const params=new URL(req.url).searchParams;
    const assets=(data.assets??[]).filter(asset=>asset.clientId===account.clientId&&asset.clientVisible&&!asset.archivedAt&&asset.versions.some(version=>version.file));
    if(params.has("asset")){if(hidden.has("documents"))return reply({error:"Document not found."},404);return await assetDownload(assets.find(asset=>asset.id===params.get("asset")),owner,null);}
    const upload=params.get("upload");
    if(upload){if(hidden.has("reports"))return reply({error:"Report not found."},404);if(!upload.startsWith("rf_")||!z.string().uuid().safeParse(upload.slice(3)).success)return reply({error:"Report not found."},404);return reply(await portalUploadPreview(data,owner,account.clientId,upload,params.get("table")));}
    const id=params.get("report");
    if (id) {
      const share=!hidden.has("reports")&&portalState(data).shares.some(s=>s.clientId===account.clientId&&s.kind==="report"&&s.id===id);
      const report=data.clientReporting?.reports.find(r=>r.id===id&&r.clientId===account.clientId&&r.approved&&r.status!=="Draft");
      if (!share||!report) return reply({error:"Report not found."},404);
      let bytes;
      try {
        bytes=await exportClientReport({...report,facts:{...report.facts,source:"Measured Analytics Engine data"}},"pdf");
      } catch { return reply({error:"The report PDF could not be generated. Contact your account team."},422); }
      return new Response(new Uint8Array(bytes),{headers:{"Cache-Control":"private, no-store","Content-Type":reportMime.pdf,"Content-Disposition":'attachment; filename="'+reportFilename(report,"pdf")+'"',"X-Content-Type-Options":"nosniff"}});
    }
    const reviewPending=(data.creativeReviews??[]).filter(r=>r.clientId===account.clientId&&r.audience==="Client"&&!r.archived&&!r.revisions.at(-1)?.decision).length;
    const view=portalView(data,account.clientId);
    // Hidden sections are removed on the server so the data never reaches the browser.
    return reply({
      ...view,
      campaigns:hidden.has("campaigns")?[]:view.campaigns,
      performance:hidden.has("performance")?[]:view.performance,
      reports:hidden.has("reports")?[]:view.reports,
      creatives:hidden.has("creatives")?[]:view.creatives,
      tasks:hidden.has("tasks")?[]:view.tasks,
      documents:hidden.has("documents")?[]:view.documents,
      invoices:hidden.has("invoices")?[]:view.invoices,
      meetings:hidden.has("meetings")?[]:view.meetings,
      messages:hidden.has("messages")?[]:view.messages,
      reviewPending:hidden.has("creatives")?0:reviewPending,
      libraryAssets:hidden.has("documents")?[]:assets.map(({id,name,folder})=>({id,name,folder})),
      uploads:hidden.has("reports")?[]:await portalUploads(data,owner,account.clientId,true),
      hiddenSections:[...hidden],
    });
  } catch(error) {return failure(error);}
}
export async function POST(req:Request) {
  if (!sameOrigin(req)) return reply({error:"Request origin is not allowed."},403);
  try {
    const {owner,userId,email}=await portalContext(req);
    const parsed=action.safeParse(await boundedJSON(req,10000).catch(()=>null));
    if (!parsed.success) return reply({error:"Check the message or approval fields."},400);
    const input=parsed.data;
    const hidden=await hiddenPortalPanels(owner,userId);
    if(hidden.has(input.action==="message"?"messages":"creatives")) return reply({error:"This section is not available for your account."},403);
    if(input.action==="decision"&&input.verdict==="Changes requested"&&!input.feedback) return reply({error:"Describe the changes you’re requesting."},400);
    await mutateMedia(owner,input.action==="message"?input.id:crypto.randomUUID(),data=>{
      const {clientId}=ensurePortalMember(data,userId,email);
      if(input.action==="message") writePortalMessage(data,clientId,"Client",input.id,input.text);
      else recordPortalDecision(data,clientId,input.creativeId,input.fingerprint,input.verdict,input.feedback);
      return data;
    });
    return reply({ok:true});
  } catch(error) {return failure(error);}
}
