"use client";

import { useState, type FormEvent } from "react";
import { Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { useCRM } from "@/lib/store";
import { deadlineDay } from "@/lib/domain/projectTasks";
import { useDeadlineToday } from "./useDeadlineToday";
import type { Project, ProjectMilestone } from "@/lib/types";

export function Milestones({project,writable,onClose}:{project:Project;writable:boolean;onClose:()=>void}) {
  const patch = useCRM(s=>s.patch);
  const today = useDeadlineToday();
  const [editing,setEditing] = useState<ProjectMilestone>();
  const [error,setError] = useState("");
  const rows = project.milestones??[];
  const persist = (milestones:ProjectMilestone[])=>patch("projects",project.id,{milestones},{entity:"task",action:"Updated project milestones",field:"milestones"});
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=new FormData(event.currentTarget), title=String(form.get("title")??"").trim(), day=String(form.get("date")??"");
    const date = new Date(day+"T18:00:00+05:30");
    if(!title||!Number.isFinite(+date)||deadlineDay(+date)!==day){setError("Enter a milestone title and a valid date.");return;}
    if(!editing&&rows.length>=100){setError("A project can have up to 100 milestones.");return;}
    const milestone={...editing,id:editing?.id??crypto.randomUUID(),title,dueDate:date.toISOString()};
    persist(editing?rows.map(row=>row.id===editing.id?milestone:row):[...rows,milestone]);
    setEditing(undefined);setError("");event.currentTarget.reset();
  }
  return <Card>
    <CardHeader title={"Milestones · "+project.name} subtitle={rows.filter(item=>item.completedAt).length+" of "+rows.length+" complete"} action={<Button className="min-h-11" onClick={onClose}>Close milestones</Button>}/>
    {rows.length>0?<ul className="divide-y divide-border">
      {[...rows].sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0"><p className="break-words font-medium">{item.title}</p><p className="text-sm text-fg-2">Due {deadlineDay(item.dueDate)}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={item.completedAt?"success":deadlineDay(item.dueDate)<today?"danger":"neutral"}>{item.completedAt?"Complete":deadlineDay(item.dueDate)<today?"Overdue":"Open"}</Badge>
          {writable&&<>
            <Button className="min-h-11" onClick={()=>persist(rows.map(row=>row.id===item.id?{...row,completedAt:row.completedAt?undefined:new Date().toISOString()}:row))}>{item.completedAt?"Reopen":"Mark complete"}</Button>
            <Button className="min-h-11" onClick={()=>setEditing(item)}>Edit milestone</Button>
          </>}
        </div>
      </li>)}
    </ul>:<p className="px-4 pb-4 text-sm text-fg-2">No milestones yet.</p>}
    {writable&&<form key={editing?.id??"add"} onSubmit={submit} className="space-y-3 border-t border-border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Milestone title"><Input name="title" className="min-h-11" required maxLength={180} defaultValue={editing?.title??""}/></Field>
        <Field label="Milestone deadline"><Input name="date" className="min-h-11 min-w-0" type="date" required defaultValue={editing?deadlineDay(editing.dueDate):""}/></Field>
      </div>
      {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" className="min-h-11">{editing?"Save milestone":"Add milestone"}</Button>
        {editing&&<><Button type="button" className="min-h-11" onClick={()=>setEditing(undefined)}>Cancel</Button>
          <Button type="button" className="min-h-11" onClick={()=>{if(window.confirm("Remove this milestone?")){persist(rows.filter(row=>row.id!==editing.id));setEditing(undefined);}}}>Remove milestone</Button></>}
      </div>
    </form>}
  </Card>;
}
