import {recordAudit} from "./auditServer";
import { effectiveApprovalMode } from "@/lib/domain/approvalPolicy";
import { generateText, Output } from "ai";
import { aiConfigured, SAFETY_RULES, withModelFallback } from "./ai/provider";
import { mutateMedia } from "./mediaServer";
import { ownedLibrary } from "./outreachServer";
import { workflowHash } from "./automationServer";
import { clientDay, reportFacts, reportWindow, copySchema, emptyReporting, nextClientReportDue, scheduledPeriod, type ClientReport, type ReportSelection } from "./domain/clientReporting";
import { reportFilename, reportMime, reportPDF } from "./clientReportExports";
import { can } from "./permissions";
import type { CRMLibrary } from "./domain/crmLibrary";

export class ReportError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export function reportDeliveryReady() {
  try {
    const url = new URL(process.env.CLIENT_REPORT_DELIVERY_URL ?? "");
    return url.protocol === "https:" && !url.username && !url.password && !!process.env.CLIENT_REPORT_DELIVERY_TOKEN;
  } catch { return false; }
}
export const reporting = (data: CRMLibrary) => data.clientReporting ??= emptyReporting();
export function getClientReport(data: CRMLibrary, id: string) {
  const report = reporting(data).reports.find(item => item.id === id);
  if (!report) throw new ReportError("Report not found in this account.", 404);
  return report;
}
const approvalHash = (r: ClientReport) => workflowHash({ id:r.id, client:r.clientId, due:r.due, recipients:r.recipients, facts:r.facts, copy:r.copy, format:"PDF" });
export const reportEmail = (r: ClientReport) => ({
  to:r.recipients, subject:r.frequency + " performance report · " + r.facts.window.end,
  body:"Hello,\n\nPlease find attached your " + r.frequency.toLowerCase() + " performance report for " + r.facts.window.start + " to " + r.facts.window.end + ".\n\nAdbibe",
});
const validRecipients = (data: CRMLibrary, clientId: string, recipients: string[]) => {
  const client = data.clients.find(c => c.id === clientId);
  if (!client) throw new ReportError("Client not found in this account.",404);
  const allowed = new Set(client.contacts.map(c => c.email?.trim().toLowerCase()));
  if (recipients.some(email => !allowed.has(email))) throw new ReportError("Use email addresses saved on the selected client’s contacts.");
};

export async function prepareClientReport(owner:string,data: CRMLibrary, selection: ReportSelection, id: string, ai: boolean, schedule?: { id:string; due:string }) {
  const recipients = [...new Set(selection.recipients)];
  validRecipients(data, selection.clientId, recipients);
  const facts = reportFacts(data, selection);
  if (!facts) throw new ReportError("No measured data was found for the selected client, feed and reporting period.",422);
  let model: string | undefined;
  let copy: ClientReport["copy"] = {
    summary:"This report summarizes the selected feed. The metrics table shows recorded values and coverage for the reporting period.",
    insights:[],recommendations:[],plan:[],
  };
  if (ai && aiConfigured()) try {
    const evidence = facts.stats.filter(s => s.current !== null).map(s => ({ ...s,id:s.key }));
    const ids = new Set(evidence.map(s => s.id));
    const generated = await withModelFallback(owner,async (model, source) => {
      const res = await generateText({
        model, output:Output.object({schema:copySchema}),maxOutputTokens:2700,maxRetries:0,
        abortSignal:AbortSignal.timeout(30000),
        providerOptions:source.startsWith("groq") ? {groq:{reasoningEffort:"low"}} : undefined,
        instructions:SAFETY_RULES + " Draft a client report using only the supplied calculated aggregates. Keep the executive summary concise. Separate measured findings from hypotheses. Cite only the supplied metric IDs in insights. A null change means there is no valid comparison; do not infer a trend or a cause. Do not invent measurements, names, goals, or results. Prioritize next actions and propose a next-month plan as future work. Use metric names in the summary rather than repeating numeric values. This is a draft for human review.",
        prompt:JSON.stringify({evidence,frequency:selection.frequency,days:facts.days,previousDays:facts.previousDays,currency:facts.currency,rowCount:facts.rowCount}),
      });
      if (!res.output || res.output.insights.some(item => item.evidence.some(id => !ids.has(id as typeof evidence[number]["id"])))) throw new Error("Invalid evidence references");
      return {copy:res.output,model:source};
    });
    ({copy,model} = generated);
  } catch { /* The measured draft stays available when generation fails. */ }
  return {id,clientId:selection.clientId,frequency:selection.frequency,createdAt:new Date().toISOString(),recipients,facts,copy,model,
    status:"Draft",due:schedule?.due,scheduleId:schedule?.id} satisfies ClientReport;
}

export async function generateClientReport(owner: string, data: CRMLibrary, input: ReportSelection, id: string, ai: boolean) {
  if (reporting(data).reports.some(r => r.id === id)) return id;
  const report = await prepareClientReport(owner,data,input,id,ai);
  await mutateMedia(owner,id,next => {
    validRecipients(next,input.clientId,report.recipients);
    const state = reporting(next);
    if (state.reports.some(r => r.id === id)) return next;
    if (state.reports.length >= 100) throw new ReportError("Remove an unused draft before creating more reports.");
    state.reports.unshift(report);
    applyAutomaticReportApproval(next,report,owner);
    recordReportGeneration(next,report,owner);
    return next;
  });
  return id;
}

function recordReportGeneration(data:CRMLibrary,report:ClientReport,owner:string){
  recordAudit(data,{actor:report.model?"ai":"api",actorId:owner,agent:"reporting",entity:"report",entityId:report.id,clientId:report.clientId,
    action:"Generated client report",sources:[report.facts.source+" · "+report.facts.window.start+" to "+report.facts.window.end],
    detail:report.frequency+" client report",after:report.status,outcome:report.status==="Approved"?"Released automatically":"Draft saved"});
}

function applyAutomaticReportApproval(data:CRMLibrary,report:ClientReport,owner:string){
  if(effectiveApprovalMode(data.aiApprovalPolicy,"Reports")!=="Automatic")return;
  approveReport(data,report.id,owner);
  data.activities.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),actor:"ai",agent:"reporting",entity:"automation",entityId:report.id,action:"Automatically approved report",detail:report.frequency+" client report"});
  data.activities=data.activities.slice(0,2000);
}

export function approveReport(data: CRMLibrary, id: string, owner: string) {
  const report = getClientReport(data,id);
  if (report.status !== "Draft") throw new ReportError("Only a draft can be approved.",409);
  validRecipients(data,report.clientId,report.recipients);
  report.approved = {by:owner,at:new Date().toISOString(),hash:approvalHash(report)};
  report.status = "Approved";
}

export async function sendClientReport(owner: string, id: string) {
  const current = await ownedLibrary(owner);
  if (!current) throw new ReportError("Reporting library unavailable.",404);
  const report = getClientReport(current,id);
  if (report.status === "Sending" && Date.now() - Date.parse(report.attemptedAt ?? "") > 120000) {
    await mutateMedia(owner,crypto.randomUUID(),data => {
      const saved = getClientReport(data,id);
      if (saved.status === "Sending") saved.status = "Delivery unknown";
      return data;
    });
    return;
  }
  if (report.status !== "Approved" || !report.approved || report.approved.hash !== approvalHash(report)) throw new ReportError("Approve this exact report before sending.",409);
  if (report.due && Date.parse(report.due) > Date.now()) throw new ReportError("The scheduled delivery time has not arrived.",409);
  if (!report.recipients.length) throw new ReportError("This report has no approved recipients.");
  validRecipients(current,report.clientId,report.recipients);
  if (!reportDeliveryReady()) throw new ReportError("Email delivery is not configured. The approved report is saved.",503);
  let bytes: Uint8Array;
  try { bytes = await reportPDF(report); } catch(error) { throw new ReportError((error as Error).message,422); }
  const key = "client-report-" + id;
  await mutateMedia(owner,crypto.randomUUID(),data => {
    const live = getClientReport(data,id);
    const actor = data.team.find(p=>p.id===owner);
    if (!actor || actor.status!=="active" || actor.role==="client" || !can(actor.role,"reports","write")) throw new ReportError("You need write access to Reports.",403);
    validRecipients(data,live.clientId,live.recipients);
    if (live.scheduleId && !reporting(data).schedules.some(s=>s.id===live.scheduleId&&s.enabled)) throw new ReportError("Resume the schedule before sending this report.",409);
    if (live.status !== "Approved" || live.approved?.hash !== report.approved!.hash || approvalHash(live) !== report.approved!.hash) throw new ReportError("Approval or report changed before dispatch.",409);
    live.status = "Sending";
    live.attemptedAt = new Date().toISOString();
    return data;
  });
  let receipt: string | undefined;
  try {
    const response = await fetch(process.env.CLIENT_REPORT_DELIVERY_URL!, {
      method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),
      headers:{Authorization:"Bearer " + process.env.CLIENT_REPORT_DELIVERY_TOKEN,"Content-Type":"application/json","Idempotency-Key":key},
      body:JSON.stringify({ ownerId:owner, reportId:id, channel:"Email", purpose:"Client report", ...reportEmail(report),
        approval:report.approved, attachments:[{filename:reportFilename(report,"pdf"),contentType:reportMime.pdf,contentBase64:Buffer.from(bytes).toString("base64")}] }),
    });
    const result = await response.json();
    if (response.ok && result.accepted === true && typeof result.messageId === "string" && result.messageId.length > 0 && result.messageId.length <= 500) receipt = result.messageId;
  } catch { /* An interrupted receipt must never cause an automatic retry. */ }
  await mutateMedia(owner,crypto.randomUUID(),data => {
    const live = getClientReport(data,id);
    if (["Sending","Delivery unknown"].includes(live.status)) {
      live.status = receipt ? "Accepted" : "Delivery unknown";
      live.receipt = receipt;
    }
    return data;
  });
}

export async function tickClientReporting(owner: string, deliver: boolean) {
  const data = await ownedLibrary(owner);
  const actor = data?.team.find(p=>p.id===owner);
  if (!data || !actor || actor.status!=="active" || actor.role==="client" || !can(actor.role,"reports","write")) return null;
  const { reports, schedules } = reporting(data);
  if (deliver) {
    const ready = reports.find(r => r.scheduleId && (
      r.status === "Sending" && Date.now() - Date.parse(r.attemptedAt ?? "") > 120000 ||
      reportDeliveryReady() && r.status === "Approved" && Date.parse(r.due ?? "") <= Date.now() &&
      schedules.some(s => s.id === r.scheduleId && s.enabled) &&
      r.recipients.length && data.clients.some(c => c.id === r.clientId && r.recipients.every(email => c.contacts.some(contact => contact.email?.trim().toLowerCase() === email)))
    ));
    if (ready) { await sendClientReport(owner,ready.id); return ready.id; }
  }
  const today = clientDay();
  const due = schedules.find(s => s.enabled && scheduledPeriod(s.due,s.config.frequency) < today &&
    (!s.lease || Date.parse(s.lease.expires) <= Date.now()));
  if (!due) return null;
  const lease = crypto.randomUUID();
  let claimed = false;
  await mutateMedia(owner,lease,next => {
    claimed = false;
    const saved = reporting(next).schedules.find(s => s.id === due.id);
    if (!saved?.enabled || saved.due !== due.due || saved.lease && Date.parse(saved.lease.expires) > Date.now()) return next;
    saved.lease = {id:lease,expires:new Date(Date.now()+120000).toISOString()};
    claimed = true;
    return next;
  });
  if (!claimed) return null;
  const date = scheduledPeriod(due.due,due.config.frequency);
  const id = workflowHash({ schedule:due.id, period:reportWindow(date,due.config.frequency).start });
  let report: ClientReport | undefined, error: string | undefined;
  try { report = await prepareClientReport(owner,data,{...due.config,date},id,true,{id:due.id,due:due.due}); }
  catch(e) { error = e instanceof ReportError ? e.message : "Scheduled draft generation failed."; }
  await mutateMedia(owner,crypto.randomUUID(),next => {
    const state = reporting(next), saved = state.schedules.find(s => s.id === due.id);
    if (!saved || saved.lease?.id !== lease || saved.due !== due.due) return next;
    if (!saved.enabled) { saved.lease = undefined; return next; }
    if (!report || state.reports.length >= 100) {
      saved.error = error ?? "Remove an unused draft before creating more reports.";
      saved.lease = {id:lease,expires:new Date(Date.now()+900000).toISOString()};
      return next;
    }
    if (!state.reports.some(r => r.id === id)) {state.reports.unshift(report);applyAutomaticReportApproval(next,report,owner);recordReportGeneration(next,report,owner);}
    saved.due = nextClientReportDue(saved.due,saved.anchor,saved.config.frequency);
    saved.error = undefined;
    saved.lease = undefined;
    return next;
  });
  return report ? id : null;
}
