"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Select } from "@/components/ui";
import { deadlineItems, offsetDeadlineDay } from "@/lib/domain/projectTasks";
import { useCRM, useMe } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useDeadlineToday } from "./useDeadlineToday";

type Deadline=ReturnType<typeof deadlineItems>[number];
const weekdays=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const monthName=new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric",timeZone:"UTC"});

export function DeadlineView({reminders=false,onOpen}:{reminders?:boolean;onOpen:(item:Deadline)=>void}) {
  const today=useDeadlineToday(), me=useMe();
  const tasks=useCRM(s=>s.tasks), projects=useCRM(s=>s.projects), team=useCRM(s=>s.team);
  const [owner,setOwner]=useState(reminders?me.id:"all");
  const [month,setMonth]=useState(()=>today.slice(0,7));
  const [selected,setSelected]=useState("");
  const rows=useMemo(()=>deadlineItems(tasks,projects),[tasks,projects]);
  const first=month+"-01";
  const moveMonth=(delta:number)=>{
    const date=new Date(first);date.setUTCMonth(date.getUTCMonth()+delta);
    setMonth(date.toISOString().slice(0,7));setSelected("");
  };
  const visible=rows.filter(row=>(owner==="all"||row.owner===owner)&&(reminders?!row.done&&row.day<today:row.day.startsWith(month)));
  const byDay=new Map<string,number>();
  for(const item of visible)byDay.set(item.day,(byDay.get(item.day)??0)+1);
  const gridStart=offsetDeadlineDay(first,-((new Date(first).getUTCDay()+6)%7));
  const agenda=selected?visible.filter(item=>item.day===selected):visible;
  return <div className="space-y-4">
    <Card>
      <CardHeader title={reminders?"Overdue reminders":"Deadline calendar"} subtitle={reminders?"Open tasks, milestones and projects past their deadline.":"Task, milestone and project deadlines in India time."}/>
      <div className="flex flex-wrap items-end justify-between gap-3 p-4">
        <Field label="Assigned to" className="w-full sm:w-52"><Select className="min-h-11" value={owner} onChange={e=>setOwner(e.target.value)}>
          <option value="all">Everyone</option><option value={me.id}>My deadlines</option>
          {team.filter(member=>member.id!==me.id&&member.role!=="client").map(member=><option key={member.id} value={member.id}>{member.name}</option>)}
        </Select></Field>
        {!reminders&&<div className="flex flex-wrap items-center gap-2">
          <Button aria-label="Previous month" className="min-h-11" onClick={()=>moveMonth(-1)} icon={<ChevronLeft size={16}/>}/>
          <span className="min-w-28 text-center text-sm font-medium" aria-live="polite">{monthName.format(new Date(first))}</span>
          <Button aria-label="Next month" className="min-h-11" onClick={()=>moveMonth(1)} icon={<ChevronRight size={16}/>}/>
          <Button className="min-h-11" onClick={()=>{setMonth(today.slice(0,7));setSelected(today);}}>Today</Button>
        </div>}
      </div>
      {!reminders&&<div className="grid grid-cols-7 gap-1 border-t border-border p-2 sm:p-4" aria-label="Month days">
        {weekdays.map(day=><span key={day} className="text-center text-xs text-fg-2">{day}</span>)}
        {Array.from({length:42},(_,i)=>offsetDeadlineDay(gridStart,i)).map(day=>{
          const count=byDay.get(day)??0;
          const inMonth=day.startsWith(month);
          return <button key={day} type="button" aria-label={day+" · "+count+" deadlines"} aria-current={day===today?"date":undefined}
            aria-pressed={day===selected} disabled={!inMonth} onClick={()=>setSelected(selected===day?"":day)}
            className={cn("min-h-11 min-w-0 rounded-lg border border-border px-0.5 text-center text-sm hover:border-accent",
              day===selected&&"bg-accent-soft border-accent",day===today&&"font-semibold",!inMonth&&"opacity-35")}>
            <span>{Number(day.slice(-2))}</span>{count>0&&<span className="block text-xs text-accent-text">{count}</span>}
          </button>;
        })}
      </div>}
    </Card>
    <Card>
      <CardHeader title={reminders?"Past due":selected?"Agenda · "+selected:"Month agenda"} subtitle={agenda.length+" deadlines"}
        action={selected?<Button className="min-h-11" onClick={()=>setSelected("")}>Show month</Button>:undefined}/>
      {agenda.length?<ul className="divide-y divide-border">
        {agenda.map(item=><li key={item.kind+":"+item.projectId+":"+item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0"><p className="break-words text-sm font-medium">{item.title}</p>
            <p className="text-xs text-fg-2">{item.kind} · {item.day} · {team.find(m=>m.id===item.owner)?.name??"Unassigned"}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={item.done?"success":item.day<today?"danger":"neutral"}>{item.done?"Complete":item.day<today?"Overdue":"Open"}</Badge>
            <Button className="min-h-11" onClick={()=>onOpen(item)}>Open {item.kind.toLowerCase()}</Button>
          </div>
        </li>)}
      </ul>:<p className="px-4 pb-4 text-sm text-fg-2">{reminders?"No overdue deadlines for this selection.":"No deadlines for this selection."}</p>}
    </Card>
  </div>;
}
