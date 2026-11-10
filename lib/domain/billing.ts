import type { Client, Expense, Invoice, Project, Task, TeamMember } from "../types";
import type { TimeEntry } from "./teamTime";
import { minutesInWeek } from "./teamTime";
import { deadlineDay } from "./projectTasks";

export const rupeeAmount=(value:number)=>Math.round(value*100)/100;
export const balance=(invoice:Invoice)=>Math.max(0,rupeeAmount(invoice.amount-invoice.paid));
export function billingStatus(invoice:Invoice,today:string):Invoice["status"] {
  if(balance(invoice)===0)return "Paid";
  const due=deadlineDay(invoice.dueDate);
  if(due&&due<today)return "Overdue";
  return invoice.paid>0?"Partially Paid":"Pending";
}

export function retainerCovers(client:Client,day:string) {
  const start=deadlineDay(client.contractStart),end=deadlineDay(client.contractEnd);
  return client.retainer>0&&(!start||day>=start)&&(!end||day<=end);
}

export function receipts(invoice:Invoice) {
  const recorded=invoice.payments??[];
  const legacy=rupeeAmount(invoice.paid-recorded.reduce((sum,item)=>sum+item.amount,0));
  const day=deadlineDay(invoice.paidAt??"");
  return legacy>0&&day?[...recorded,{id:"legacy-"+invoice.id,amount:legacy,receivedOn:day}]:recorded;
}
export function nextBillingMonth(month:string) {
  const date=new Date(month+"-01T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth()+1);
  return date.toISOString().slice(0,7);
}

type BillingInput={clients:Client[];invoices:Invoice[];expenses:Expense[];team:TeamMember[];projects:Project[];tasks:Task[];timeEntries:TimeEntry[];taskClients?:Map<string,string>};
type Totals={billed:number;collected:number;expenses:number;labor:number;unpricedMinutes:number;outstanding:number};
const blank=():Totals=>({billed:0,collected:0,expenses:0,labor:0,unpricedMinutes:0,outstanding:0});
export function billingMonth(data:BillingInput,month:string,today:string) {
  const total=blank();
  const clients=new Map(data.clients.map(client=>[client.id,blank()]));
  const projects=new Map(data.projects.map(project=>[project.id,blank()]));
  const inMonth=(day:string)=>day.startsWith(month+"-");
  const add=(key:keyof Totals,value:number,clientId?:string,projectId?:string)=>{
    total[key]+=value;
    const client=clientId&&clients.get(clientId),project=projectId&&projects.get(projectId);
    if(client)client[key]+=value;
    if(project)project[key]+=value;
  };
  for(const invoice of data.invoices){
    if(inMonth(deadlineDay(invoice.issuedAt)))add("billed",invoice.amount,invoice.clientId,invoice.projectId);
    add("outstanding",balance(invoice),invoice.clientId,invoice.projectId);
    for(const receipt of receipts(invoice))if(inMonth(receipt.receivedOn))add("collected",receipt.amount,invoice.clientId,invoice.projectId);
  }
  for(const expense of data.expenses)if(inMonth(deadlineDay(expense.date)))add("expenses",expense.amount,expense.clientId,expense.projectId);
  const start=month+"-01",end=nextBillingMonth(month)+"-01";
  const work=data.timeEntries.filter(entry=>entry.kind==="manual"||entry.endedAt)
    .map(entry=>({entry,minutes:minutesInWeek(entry,start,end,0)})).filter(row=>row.minutes>0);
  const minuteTotals=new Map<string,number>();
  for(const {entry,minutes} of work)minuteTotals.set(entry.memberId,(minuteTotals.get(entry.memberId)??0)+minutes);
  for(const {entry,minutes} of work){
    const member=data.team.find(item=>item.id===entry.memberId);
    const task=data.tasks.find(item=>item.id===entry.taskId);
    const project=data.projects.find(item=>item.id===(entry.projectId??task?.projectId));
    const clientId=project?.clientId??(task?data.taskClients?.get(task.id):undefined)??(task?.related?.type==="client"?task.related.id:undefined);
    const capacity=(member?.capacityHours??40)*4.33*60;
    if(member?.monthlyCost===undefined||!capacity)add("unpricedMinutes",minutes,clientId,project?.id);
    else add("labor",member.monthlyCost*minutes/Math.max(capacity,minuteTotals.get(entry.memberId)??0),clientId,project?.id);
  }
  const overdue=data.invoices.filter(invoice=>billingStatus(invoice,today)==="Overdue").reduce((sum,invoice)=>sum+balance(invoice),0);
  return {total,clients,projects,overdue,mrr:data.clients.filter(client=>retainerCovers(client,today)).reduce((sum,client)=>sum+client.retainer,0)};
}
