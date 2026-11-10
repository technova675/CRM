import type { CRMLibrary } from "./crmLibrary";
import { visibleSyncRun } from "./integrationRuns";
import { knowledgeAccess } from "./clientKnowledge";
import type { Notification, NotificationCategory } from "../types";

export function accountNotifications(data:CRMLibrary, userId:string, now=Date.now()):Notification[] {
  const access = (module:Parameters<typeof knowledgeAccess>[2]) => knowledgeAccess(data,userId,module);
  const read = new Set(data.readNotificationIds ?? []);
  const events:Notification[] = [];
  const recent = now - 14 * 86400000;
  const today = new Date(now+19800000).toISOString().slice(0,10);
  function add(category:NotificationCategory,id:string,at:string,title:string,body:string,href:string,kind:Notification["kind"]="info") {
    const time=Date.parse(at);
    if (!Number.isFinite(time) || time<recent || time>now+86400000) return;
    events.push({id,category,at,title,body,href,kind,read:read.has(id)});
  }

  if(access("leads"))for(const lead of data.leads ?? [])
    add("New leads","lead:"+lead.id,lead.createdAt,"New lead · "+lead.name,lead.company,"/leads/"+encodeURIComponent(lead.id));
  if(access("inbox")){
    const conversations = new Map((data.conversations ?? []).map(item=>[item.id,item]));
    for(const message of data.messages ?? []){
      if(message.direction!=="inbound" || !conversations.has(message.conversationId))continue;
      const subject = conversations.get(message.conversationId)?.subject;
      add("Replies","reply:"+message.id,message.sentAt,"New reply",subject || "Open the conversation to review the reply.","/inbox?c="+encodeURIComponent(message.conversationId));
    }
  }
  if(access("meetings"))for(const meeting of data.meetings ?? []){
    const start=Date.parse(meeting.startsAt);
    if(meeting.outcome!=="Pending" || start<now || start>now+86400000)continue;
    add("Meetings","meeting:"+meeting.id+":"+meeting.startsAt,meeting.startsAt,"Upcoming meeting · "+meeting.title,"Starts within 24 hours.","/meetings");
  }
  if(access("pipeline"))for(const deal of data.deals ?? [])
    add("Deals","deal:"+deal.id,deal.createdAt,"New deal · "+deal.title,deal.company,"/pipeline");

  if(access("creative"))for(const review of data.creativeReviews ?? []){
    for(const version of review.revisions){
      const decision=version.decision;
      if(decision?.by!=="Client")continue;
      add("Client approvals","review:"+review.id+":"+version.version,decision.at,"Client "+decision.status.toLowerCase()+" · "+version.title,"Creative review · version "+version.version,"/creative/reviews",decision.status==="Approved"?"success":"warning");
    }
  }
  if(access("campaigns") || access("integrations"))for(const run of data.integrationRuns ?? []){
    if(visibleSyncRun(run,now).status!=="Failed")continue;
    add("Campaign issues","sync:"+run.id,run.finishedAt??run.startedAt,run.platform+" sync failed",run.campaignName,access("integrations")?"/integrations?tab=history":"/campaigns?c="+encodeURIComponent(run.campaignId),"warning");
  }
  if(access("performance"))for(const recommendation of data.recommendations ?? []){
    if(recommendation.status==="Dismissed")continue;
    const anomaly=["Anomaly","Loser","Budget","Fatigue"].includes(recommendation.category);
    const category=anomaly?"Performance anomalies":"AI recommendations";
    add(category,"recommendation:"+recommendation.id,recommendation.createdAt,recommendation.title,recommendation.finding,"/performance",anomaly?"warning":"ai");
  }
  if(access("tasks"))for(const task of data.tasks ?? []){
    if(task.assigneeId!==userId || task.status==="Done")continue;
    add("Tasks","task:"+task.id+":"+task.assigneeId,task.createdAt,"Assigned task · "+task.title,"Open Tasks for details.","/tasks");
    if(task.dueDate && task.dueDate.slice(0,10)<today)
      add("Tasks","overdue:"+task.id+":"+task.dueDate,task.dueDate,"Overdue task · "+task.title,"Open Reminders for details.","/tasks?tab=reminders","warning");
  }
  if(access("reports")){
    for(const report of data.clientReporting?.reports ?? [])
      add("Reports","client-report:"+report.id,report.createdAt,report.frequency+" report · "+report.facts.company,"Client report generated.","/reports?view=client");
    for(const report of data.reports ?? [])
      add("Reports","report:"+report.id,report.createdAt,"Report generated",report.period,"/reports?view=client");
  }
  if(access("payments"))for(const invoice of data.invoices ?? []){
    for(const payment of invoice.payments ?? [])
      add("Payments","payment:"+invoice.id+":"+payment.id,payment.receivedOn,"Payment recorded · "+invoice.number,"See the invoice for payment details.","/payments","success");
    if(invoice.paidAt && !invoice.payments?.length)
      add("Payments","payment:"+invoice.id,invoice.paidAt,"Payment recorded · "+invoice.number,"See the invoice for payment details.","/payments","success");
    if(invoice.paid<invoice.amount && invoice.dueDate.slice(0,10)<today)
      add("Payments","invoice-due:"+invoice.id+":"+invoice.dueDate,invoice.dueDate,"Overdue invoice · "+invoice.number,"An outstanding balance remains.","/payments","warning");
  }
  return events.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,150);
}
