"use client";

import { useEffect,useState,type FormEvent } from "react";
import { Badge,Button,Card,CardHeader,Field,Input,Select,Textarea } from "@/components/ui";
import { useCRM,useMe } from "@/lib/store";
import { flushCRMChanges } from "@/lib/crmSync";
import { deadlineDay,offsetDeadlineDay } from "@/lib/domain/projectTasks";
import { formatMinutes,minutesInWeek,teamWeek,timeEntryIssue,timeEntrySchema,type TimeEntry } from "@/lib/domain/teamTime";
import { useDeadlineToday } from "@/components/tasks/useDeadlineToday";

export function TimeTab({writable}:{writable:boolean}){
  const team=useCRM(s=>s.team), entries=useCRM(s=>s.timeEntries), projects=useCRM(s=>s.projects),tasks=useCRM(s=>s.tasks);
  const today=useDeadlineToday(), me=useMe();
  const [member,setMember]=useState(me.id),[anchor,setAnchor]=useState(""),[taskId,setTask]=useState(""),[projectId,setProject]=useState("");
  const [mode,setMode]=useState<"manual"|"timer">("manual"),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const [now,setNow]=useState(()=>Date.now());
  const running=entries.find(entry=>entry.memberId===member&&entry.kind==="timer"&&!entry.endedAt);
  useEffect(()=>{
    if(!running)return;
    const timer=setInterval(()=>setNow(Date.now()),15000);
    return ()=>clearInterval(timer);
  },[running]);
  const selected=team.find(person=>person.id===member);
  const active=!!selected&&selected.role!=="client"&&(selected.status??"active")==="active";
  const week=teamWeek(anchor||today);
  const rows=entries.filter(e=>e.memberId===member&&(e.kind==="manual" ? e.day>=week.start&&e.day<week.end : deadlineDay(e.startedAt)<week.end&&deadlineDay(e.endedAt??now)>=week.start));
  const logged=rows.reduce((total,e)=>total+minutesInWeek(e,week.start,week.end,now),0);
  const task=tasks.find(item=>item.id===taskId);
  async function persist(next:TimeEntry[], message:string){
    setError("");setNotice("");
    if(next.length>10000){setError("This workspace has reached its time entry limit.");return;}
    const issue=timeEntryIssue(next);
    if(issue){setError(issue);return;}
    setBusy(true);
    try {
      useCRM.setState({timeEntries:next});
      setNow(Date.now());
      await flushCRMChanges();
      setNotice(message);
    } catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  function log(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!active||!writable)return;
    const form=event.currentTarget, values=new FormData(form);
    const base={id:crypto.randomUUID(),memberId:member,taskId:task?.id,projectId:task?.projectId||projectId||undefined,note:values.get("note")};
    const result=timeEntrySchema.safeParse(mode==="timer"?{...base,kind:"timer",startedAt:new Date().toISOString()}:
      {...base,kind:"manual",day:values.get("day"),minutes:Number(values.get("minutes"))});
    if(!result.success||result.data.kind==="manual"&&result.data.day>today){setError("Enter a valid work date through today and a duration of 1–1,440 minutes.");return;}
    if(mode==="timer"&&running){setError("Stop this member’s timer first.");return;}
    void persist([result.data,...entries],mode==="timer"?"Timer started.":"Time saved.");
    form.reset();
  }
  return <div className="min-w-0 space-y-4">
    <Card>
      <CardHeader title="Time tracking" subtitle="Log time against a team member, with an optional task or project."/>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Team member"><Select className="min-h-11" value={member} disabled={busy} onChange={e=>{setMember(e.target.value);setTask("");setProject("");setError("");setNotice("");}}>
          {team.filter(person=>person.role!=="client").map(person=><option key={person.id} value={person.id}>{person.name}{person.status==="disabled"?" · inactive":""}</option>)}
        </Select></Field>
        <Field label="Week containing"><Input className="min-h-11 min-w-0" type="date" value={anchor||today} onChange={e=>setAnchor(e.target.value)}/></Field>
        <div className="self-center text-sm"><p className="text-fg-2">Logged this week</p><p className="font-semibold tabular-nums">{formatMinutes(logged)}</p></div>
        <div className="self-center text-sm"><p className="text-fg-2">Weekly capacity</p><p className="font-semibold tabular-nums">{selected?.capacityHours??40} h</p></div>
      </div>
      <p className="px-4 pb-4 text-sm text-fg-2">{week.start} to {offsetDeadlineDay(week.end,-1)} · India time</p>
    </Card>
    {error&&<p role="alert" className="rounded-lg border border-border bg-surface p-3 text-sm text-danger">{error}</p>}
    {notice&&<p role="status" className="text-sm text-fg-2">{notice}</p>}
    {running?.kind==="timer"&&<Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div><Badge tone="success">Timer running</Badge><p className="mt-1 text-sm">{formatMinutes(Math.max(0,Math.floor((now-Date.parse(running.startedAt))/60000)))}</p></div>
      {writable&&<Button className="min-h-11" variant="primary" disabled={busy} onClick={()=>{
        const endedAt=new Date(Math.max(Date.now(),Date.parse(running.startedAt)+1)).toISOString();
        void persist(entries.map(entry=>entry.id===running.id?{...running,endedAt}:entry),"Timer stopped.");
      }}>Stop timer</Button>}
    </Card>}
    {writable&&active&&<Card>
      <CardHeader title="Record time"/>
      <form onSubmit={log} className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Entry type"><Select className="min-h-11" value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="manual">Manual entry</option><option value="timer">Timer</option></Select></Field>
          <Field label="Task"><Select className="min-h-11" value={taskId} onChange={e=>{setTask(e.target.value);setProject("");}}>
            <option value="">No task</option>{tasks.filter(item=>item.assigneeId===member).map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
          </Select></Field>
          <Field label="Project"><Select className="min-h-11" value={task?.projectId??projectId} disabled={!!task} onChange={e=>setProject(e.target.value)}>
            <option value="">No project</option>{projects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </Select></Field>
          {mode==="manual"&&<>
            <Field label="Work date"><Input name="day" className="min-h-11 min-w-0" type="date" defaultValue={today} max={today} required/></Field>
            <Field label="Minutes worked"><Input name="minutes" className="min-h-11" type="number" min={1} max={1440} required/></Field>
          </>}
        </div>
        <Field label="Work note"><Textarea name="note" maxLength={1000}/></Field>
        <Button type="submit" className="min-h-11" variant="primary" disabled={busy||mode==="timer"&&!!running}>{mode==="timer"?"Start timer":"Log time"}</Button>
      </form>
    </Card>}
    <Card>
      <CardHeader title="Time log" subtitle="Recorded entries for the selected week"/>
      {rows.length?<ul className="divide-y divide-border">{rows.map(entry=>{
        const linked=tasks.find(t=>t.id===entry.taskId)?.title??projects.find(p=>p.id===entry.projectId)?.name;
        return <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div className="min-w-0"><p className="break-words text-sm font-medium">{linked??"General work"} · {formatMinutes(minutesInWeek(entry,week.start,week.end,now))}</p>
            <p className="text-xs text-fg-2">{entry.kind==="manual"?entry.day:deadlineDay(entry.startedAt)} · {entry.kind==="manual"?"Manual entry":entry.endedAt?"Timer":"Running"}</p>
            {entry.note&&<p className="break-words text-sm">{entry.note}</p>}</div>
          {writable&&(entry.kind==="manual"||entry.endedAt)&&<Button className="min-h-11" disabled={busy} onClick={()=>{if(window.confirm("Remove this time entry?"))void persist(entries.filter(item=>item.id!==entry.id),"Time entry removed.");}}>Remove entry</Button>}
        </li>;
      })}</ul>:<p className="p-4 text-sm text-fg-2">No time recorded this week.</p>}
    </Card>
  </div>;
}
