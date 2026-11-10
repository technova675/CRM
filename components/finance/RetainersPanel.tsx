"use client";

import { useDeadlineToday } from "@/components/tasks/useDeadlineToday";
import { useState,type FormEvent } from "react";
import { Button,Card,CardHeader,Field,Input,Modal,Table,Td,Th } from "@/components/ui";
import { useCRM } from "@/lib/store";
import { retainerCovers,rupeeAmount } from "@/lib/domain/billing";
import { deadlineDay,offsetDeadlineDay } from "@/lib/domain/projectTasks";
import { money } from "@/lib/utils";
import { toast } from "@/components/shell/toast";
import type { Client } from "@/lib/types";

export function RetainersPanel({writable}:{writable:boolean}){
  const clients=useCRM(s=>s.clients),invoices=useCRM(s=>s.invoices),update=useCRM(s=>s.updateClient),add=useCRM(s=>s.addInvoice);
  const today=useDeadlineToday();
  const [month,setMonth]=useState(today.slice(0,7));
  const [editing,setEditing]=useState<Client>();
  const save=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!editing)return;
    const value=Number(new FormData(event.currentTarget).get("retainer"));
    if(!Number.isFinite(value)||value<0||value>1e12)return;
    update(editing.id,{retainer:rupeeAmount(value)});setEditing(undefined);toast("Retainer saved");
  };
  return <Card>
    <CardHeader title="Client retainers" subtitle="Set monthly recurring revenue and create a retainer invoice for the selected billing month."/>
    <div className="p-4"><Field label="Retainer billing month" className="max-w-xs"><Input type="month" className="min-h-11" value={month} max={today.slice(0,7)} onChange={event=>setMonth(event.target.value)}/></Field></div>
    <Table><thead><tr><Th>Client</Th><Th>Monthly retainer</Th><Th>Recurring status</Th><Th>Invoice for {month}</Th></tr></thead>
      <tbody>{clients.map(client=>{
        const invoice=invoices.find(item=>item.clientId===client.id&&item.retainerMonth===month);
        const starts=deadlineDay(client.contractStart),ends=deadlineDay(client.contractEnd);
        const eligible=!!month&&month<=today.slice(0,7)&&client.retainer>0&&(!starts||starts.slice(0,7)<=month)&&(!ends||ends.slice(0,7)>=month);
        return <tr key={client.id}><Td>{client.company}</Td><Td>{money(client.retainer)} {writable&&<Button className="min-h-11" variant="ghost" onClick={()=>setEditing(client)}>Edit retainer</Button>}</Td>
          <Td>{retainerCovers(client,today)?"Active":"Inactive"}</Td><Td>{invoice?invoice.number:writable&&eligible?<Button className="min-h-11" onClick={()=>{
            add({clientId:client.id,amount:client.retainer,issuedAt:new Date().toISOString(),dueDate:offsetDeadlineDay(today,15),description:"Monthly retainer · "+month,retainerMonth:month});
            toast("Retainer invoice created");
          }}>Create retainer invoice</Button>:"—"}</Td></tr>;
      })}</tbody>
    </Table>
    {!clients.length&&<p className="p-4 text-sm text-fg-2">Add a client to manage a retainer.</p>}
    {editing&&<Modal open title={"Edit retainer · "+editing.company} onClose={()=>setEditing(undefined)}>
      <form onSubmit={save} className="space-y-3"><Field label="Monthly retainer amount"><Input type="number" min={0} max={1e12} step="0.01" name="retainer" defaultValue={editing.retainer} required/></Field>
        <Button variant="primary" type="submit" className="min-h-11">Save retainer</Button></form>
    </Modal>}
  </Card>;
}
