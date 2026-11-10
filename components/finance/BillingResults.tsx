"use client";

import { useMemo,useState } from "react";
import { Card,CardHeader,Field,Input,Stat,Table,Td,Th } from "@/components/ui";
import { useCRM } from "@/lib/store";
import { billingMonth } from "@/lib/domain/billing";
import { useRelatedIndex } from "@/components/tasks/related";
import { useDeadlineToday } from "@/components/tasks/useDeadlineToday";
import { money } from "@/lib/utils";

export function BillingResults({details=false}:{details?:boolean}){
  const clients=useCRM(s=>s.clients),invoices=useCRM(s=>s.invoices),expenses=useCRM(s=>s.expenses);
  const team=useCRM(s=>s.team),projects=useCRM(s=>s.projects),tasks=useCRM(s=>s.tasks),timeEntries=useCRM(s=>s.timeEntries);
  const today=useDeadlineToday();
  const related=useRelatedIndex();
  const taskClients=useMemo(()=>new Map(tasks.flatMap(task=>{const client=related.get(task.related)?.clientId;return client?[[task.id,client] as const]:[];})),[related,tasks]);
  const [picked,setPicked]=useState("");
  const month=picked||today.slice(0,7);
  const results=useMemo(()=>billingMonth({clients,invoices,expenses,team,projects,tasks,timeEntries,taskClients},month,today),
    [clients,invoices,expenses,team,projects,tasks,timeEntries,taskClients,month,today]);
  const {total}=results,cost=total.expenses+total.labor,margin=total.billed-cost;
  const rows=(title:string,entities:{id:string;name:string}[],values:typeof results.clients)=><Card>
    <CardHeader title={title} subtitle="Billed revenue less expenses and estimated cost of logged work."/>
    <Table><thead><tr><Th>Name</Th><Th>Billed</Th><Th>Expenses</Th><Th>Labor estimate</Th><Th>Contribution</Th><Th>Unpriced time</Th><Th>Outstanding</Th></tr></thead>
      <tbody>{entities.map(entity=>{
        const row=values.get(entity.id);
        return row&&<tr key={entity.id}><Td>{entity.name}</Td><Td>{money(row.billed)}</Td><Td>{money(row.expenses)}</Td><Td>{money(row.labor)}</Td>
          <Td>{money(row.billed-row.expenses-row.labor)}</Td><Td>{row.unpricedMinutes} min</Td><Td>{money(row.outstanding)}</Td></tr>;
      })}</tbody>
    </Table>
    {!entities.length&&<p className="p-4 text-sm text-fg-2">No records for this view.</p>}
  </Card>;
  return <div className="min-w-0 space-y-4">
    <Card>
      <CardHeader title="Billing dashboard" subtitle="Revenue, cost, margin, outstanding balances and profitability" />
      <div className="px-4 pb-4"><Field label="Reporting month" className="max-w-xs"><Input type="month" className="min-h-11" value={month} onChange={event=>setPicked(event.target.value)}/></Field></div>
      <div className="grid grid-cols-2 gap-2 px-4 pb-4 lg:grid-cols-5">
        <Stat label="Revenue" value={money(total.billed)} hint="Invoices issued"/>
        <Stat label="Cost" value={money(cost)} hint="Expenses and allocated labor"/>
        <Stat label="Gross margin" value={total.billed?Math.round(margin/total.billed*100)+"%":"—"} hint="On recorded billing"/>
        <Stat label="Outstanding" value={money(total.outstanding)} hint={money(results.overdue)+" overdue · all dates"}/>
        <Stat label="Profitability" value={money(margin)} hint="Contribution before unallocated costs"/>
      </div>
      <div className="flex flex-wrap gap-4 border-t border-border p-4 text-sm text-fg-2">
        <p>Payments received <strong>{money(total.collected)}</strong></p><p>Active monthly retainers <strong>{money(results.mrr)}</strong></p>
        {total.unpricedMinutes>0&&<p>{total.unpricedMinutes} minutes have no cost rate.</p>}
      </div>
    </Card>
    {details&&<>
      {rows("Client profitability",clients.map(c=>({id:c.id,name:c.company})),results.clients)}
      {rows("Project profitability",projects,results.projects)}
      <p className="text-sm text-fg-2">Labor estimates use logged time and the current monthly team or freelancer cost and capacity. Project results require linked invoices, expenses, and time entries. Outstanding balances span all dates.</p>
    </>}
  </div>;
}
