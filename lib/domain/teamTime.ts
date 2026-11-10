import { z } from "zod";
import { deadlineDay, offsetDeadlineDay } from "./projectTasks";

const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>deadlineDay(value)===value);
const base=z.object({
  id:z.string().uuid(),
  memberId:z.string().min(1).max(150),
  taskId:z.string().min(1).max(150).optional(),
  projectId:z.string().min(1).max(150).optional(),
  note:z.string().trim().max(1000),
});
export const timeEntrySchema=z.discriminatedUnion("kind",[
  base.extend({kind:z.literal("manual"),day:date,minutes:z.number().int().min(1).max(1440)}),
  base.extend({kind:z.literal("timer"),startedAt:z.string().datetime(),endedAt:z.string().datetime().optional()}),
]);
export type TimeEntry=z.infer<typeof timeEntrySchema>;
export function teamWeek(day:string) {
  const start=offsetDeadlineDay(day,-((new Date(day).getUTCDay()+6)%7));
  return {start,end:offsetDeadlineDay(start,7)};
}
export function minutesInWeek(entry:TimeEntry,start:string,end:string,now:number) {
  if(entry.kind==="manual")return entry.day>=start&&entry.day<end?entry.minutes:0;
  const low=Math.max(Date.parse(entry.startedAt),Date.parse(start+"T00:00:00+05:30"));
  const high=Math.min(entry.endedAt?Date.parse(entry.endedAt):now,Date.parse(end+"T00:00:00+05:30"));
  return Math.max(0,Math.floor((high-low)/60000));
}
export function formatMinutes(value:number) {
  return Math.floor(value/60)+" h "+value%60+" min";
}
export function timeEntryIssue(entries:TimeEntry[]) {
  const ids=new Set<string>(),running=new Set<string>();
  for(const item of entries){
    if(ids.has(item.id))return "Time entry IDs must be unique.";
    ids.add(item.id);
    if(item.kind!=="timer")continue;
    if(item.endedAt&&Date.parse(item.endedAt)<=Date.parse(item.startedAt))return "Timer end must be after its start.";
    if(!item.endedAt){
      if(running.has(item.memberId))return "Each member can have one running timer.";
      running.add(item.memberId);
    }
  }
}
