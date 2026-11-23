import "server-only";
import {ownedLibrary} from "./outreachServer";
import {scanWorkflows,advanceWorkflow} from "./automationServer";
import {tickClientReporting} from "./clientReportingServer";
import {supabaseRequest} from "./db";
import type {CRMLibrary} from "./domain/crmLibrary";

type Workflow=NonNullable<CRMLibrary["marketingAutomations"]>[number];

/** The next run of a workflow that is ready to move: newly queued, a lease that expired mid-step, or a wait that has ended. */
function dueRun(w:Workflow,now=Date.now()){
  return w.history.slice().reverse().find(r=>r.status==="Queued"
    ||["Running","Sending"].includes(r.status)&&Date.parse(r.lease?.expires??"1970-01-01")<=now
    ||r.status==="Waiting time"&&Date.parse(r.waitUntil??"")<=now);
}

/**
 * One pass for one account: queue runs for new matching records, advance at most one run, and prepare due client reports.
 * Approval gates are enforced inside advanceWorkflow, so a scheduled pass can never send or change anything a person has not approved.
 */
export async function automationTick(owner:string){
  const queued=await scanWorkflows(owner),data=await ownedLibrary(owner);
  const processedReport=await tickClientReporting(owner,true).catch(()=>null);
  for(const w of data?.marketingAutomations??[]){
    if(!w.enabled)continue;
    const run=dueRun(w);
    if(run){await advanceWorkflow(owner,w.id,run.id);return {queued,processed:run.id as string|null,processedReport};}
  }
  return {queued,processed:null as string|null,processedReport};
}

/** Accounts with at least one enabled workflow. Paused-only accounts are skipped entirely. */
export async function accountsWithAutomations(limit=500){
  const rows=await supabaseRequest<{owner_id:string}[]>("crm_libraries",{query:{select:"owner_id","data->marketingAutomations":"cs.[{\"enabled\":true}]",limit:String(limit)}});
  return rows.map(row=>row.owner_id);
}
