import {recordAudit} from "@/lib/auditServer";
import { z } from "zod";
import { reportIdentity, sameOrigin } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { dbError } from "@/lib/db";
import { ownedLibrary, boundedJSON } from "@/lib/outreachServer";
import { mutateMedia } from "@/lib/mediaServer";
import { workerReady } from "@/lib/automationServer";
import { approveReport, generateClientReport, getClientReport, reportDeliveryReady, reportEmail, reporting, ReportError, sendClientReport, tickClientReporting } from "@/lib/clientReportingServer";
import { exportClientReport, exportFormats, reportFilename, reportMime } from "@/lib/clientReportExports";
import { clientDay, reportSelection, reportWindow } from "@/lib/domain/clientReporting";
import { investigationSources } from "@/lib/domain/analyticsInvestigation";
import type { CRMLibrary } from "@/lib/domain/crmLibrary";

export const maxDuration = 100;
const headers = { "Cache-Control":"private, no-store" };
const reply = (data: unknown, status = 200) => Response.json(data,{status,headers});
const errorReply = (error: unknown) => error instanceof ReportError ? reply({error:error.message},error.status) : dbError(error);
const actionSchema = z.discriminatedUnion("action", [
  z.object({action:z.literal("generate"),id:z.string().uuid(),selection:reportSelection,ai:z.boolean()}),
  z.object({action:z.literal("schedule"),id:z.string().uuid(),config:reportSelection.omit({date:true}),due:z.string().datetime()}),
  z.object({action:z.literal("toggle"),id:z.string().uuid(),enabled:z.boolean()}),
  ...(["approve","revoke","send","delete"] as const).map(action => z.object({action:z.literal(action),id:z.string().min(1).max(64)})),
  z.object({action:z.literal("runDue")}),
]);
function access(data: CRMLibrary | undefined, owner: string, write = false): asserts data is CRMLibrary {
  if (!data) throw new ReportError("Save a client in Client Management before opening the reporting library.",404);
  const actor = data.team.find(p => p.id === owner);
  if (!actor || actor.status !== "active" || actor.role === "client" || !can(actor.role,"reports",write ? "write" : "read")) throw new ReportError("Your role does not have access to client reporting.",403);
}

export async function GET(req: Request) {
  try {
    const user = await reportIdentity(req), data = await ownedLibrary(user.userId);
    if (!data) return reply({reports:[],schedules:[],delivery:false,worker:false,writable:false});
    access(data,user.userId);
    const params = new URL(req.url).searchParams;
    const id = params.get("id");
    if (id) {
      const report = getClientReport(data,id);
      const format = z.enum(exportFormats).safeParse(params.get("format"));
      if (!format.success) return reply({error:"Choose PDF, PowerPoint or Excel."},400);
      let bytes;
      try { bytes = await exportClientReport(report,format.data); }
      catch (error) { return reply({error:format.data === "pdf" && error instanceof Error && error.message.startsWith("The PDF font") ? error.message : "The report export could not be created."},422); }
      return new Response(new Uint8Array(bytes),{headers:{...headers,"Content-Type":reportMime[format.data],"Content-Disposition":'attachment; filename="' + reportFilename(report,format.data) + '"'}});
    }
    const state = reporting(data);
    return reply({...state,reports:state.reports.map(r=>({...r,email:reportEmail(r),status:r.status === "Sending" && Date.now()-Date.parse(r.attemptedAt??"")>120000?"Delivery unknown":r.status})),
      delivery:reportDeliveryReady(),worker:workerReady(user.userId),writable:can(data.team.find(p=>p.id===user.userId)!.role,"reports","write")});
  } catch(error) { return errorReply(error); }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply({error:"Request origin is not allowed."},403);
  try {
    const user = await reportIdentity(req), data = await ownedLibrary(user.userId);
    access(data,user.userId,true);
    let body;
    try { body = await boundedJSON(req,14000); } catch { return reply({error:"Invalid reporting request."},400); }
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return reply({error:"Check the report dates, feed and recipient addresses."},400);
    const input = parsed.data;
    if (input.action === "generate") {
      if (reportWindow(input.selection.date,input.selection.frequency).end >= clientDay()) return reply({error:"Choose a date in a completed week or month."},400);
      const id = await generateClientReport(user.userId,data,input.selection,input.id,input.ai);
      return reply({id});
    }
    if (input.action === "runDue") return reply({id:await tickClientReporting(user.userId,false)});
    if (input.action === "send") { await sendClientReport(user.userId,input.id); return reply({ok:true}); }
    await mutateMedia(user.userId,crypto.randomUUID(),next => {
      access(next,user.userId,true);
      const state = reporting(next);
      if (input.action === "schedule") {
        if (state.schedules.some(s=>s.id===input.id)) return next;
        if (state.schedules.length>=30) throw new ReportError("This account has reached the report schedule limit.");
        const client = next.clients.find(c=>c.id===input.config.clientId);
        const recipients = [...new Set(input.config.recipients)];
        if (!client || !investigationSources(next,client.id).some(s=>s.id===input.config.source) || !recipients.length ||
            recipients.some(email=>!client.contacts.some(c=>c.email?.trim().toLowerCase()===email))) throw new ReportError("Choose a measured feed and recipients from this client's saved contacts.");
        if (Date.parse(input.due)<=Date.now()) throw new ReportError("Choose a future first delivery time.");
        state.schedules.unshift({id:input.id,config:{...input.config,recipients},due:input.due,anchor:input.due,enabled:true});
      } else if (input.action === "toggle") {
        const schedule = state.schedules.find(s=>s.id===input.id);
        if (!schedule) throw new ReportError("Schedule not found.",404);
        schedule.enabled=input.enabled;
      } else {
        const report = getClientReport(next,input.id);
        if (input.action === "approve") {
          approveReport(next,input.id,user.userId);
          next.activities.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),actor:"human",actorId:user.userId,entity:"automation",entityId:input.id,action:"Approved client report",detail:report.frequency+" client report"});
          next.activities=next.activities.slice(0,2000);
          recordAudit(next,{actor:"human",actorId:user.userId,agent:"reporting",clientId:report.clientId,entity:"report",entityId:report.id,action:"Approved client report",sources:[report.facts.source],approvedBy:user.userId,approvedAt:report.approved?.at,before:"Draft",after:"Approved",outcome:"Approved"});
        }
        if (input.action === "revoke") {
          if (report.status!=="Approved") throw new ReportError("Only an unsent approval can be revoked.",409);
          report.approved=undefined;report.status="Draft";
        }
        if (input.action === "delete") {
          if (report.status!=="Draft") throw new ReportError("Only unapproved drafts can be removed.",409);
          state.reports=state.reports.filter(r=>r.id!==input.id);
        }
      }
      return next;
    });
    return reply({ok:true});
  } catch(error) { return errorReply(error); }
}
