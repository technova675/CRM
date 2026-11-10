import type { Task } from "../types";

export function taskDependencyIssue(task: Pick<Task,"id"|"dependsOn"|"status">, index: Map<string,Task>) {
  const dependencies=task.dependsOn??[];
  if(dependencies.some(id=>!index.has(id)))return "A dependency no longer exists.";
  const seen=new Set<string>(), pending=[...dependencies];
  while(pending.length){
    const id=pending.pop()!;
    if(id===task.id)return "Task dependencies cannot form a cycle.";
    if(seen.has(id))continue;
    seen.add(id);
    const nested=index.get(id)?.dependsOn;
    if(Array.isArray(nested))for(const dependency of nested)pending.push(dependency);
  }
  if((task.status==="Done"||task.status==="In Progress")&&dependencies.some(id=>index.get(id)?.status!=="Done"))return "Complete the prerequisite tasks first.";
}

export function nextTaskOccurrence(task:Task, at:string):Task|undefined {
  if(!task.recurring||task.recurring==="none"||!Number.isFinite(Date.parse(task.dueDate)))return;
  const offset=19800000;
  const date=new Date(Date.parse(task.dueDate)+offset);
  const anchor=task.recurrenceAnchor??date.getUTCDate();
  if(task.recurring==="monthly"){
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth()+1);
    const end=new Date(date);end.setUTCMonth(end.getUTCMonth()+1,0);
    date.setUTCDate(Math.min(anchor,end.getUTCDate()));
  }else date.setUTCDate(date.getUTCDate()+(task.recurring==="weekly"?7:1));
  const dueDate=new Date(+date-offset).toISOString();
  const series=task.recurrenceSeries??task.id;
  return {...task,id:"repeat-"+series+"-"+date.toISOString().slice(0,10),status:"Todo",dueDate,createdAt:at,
    comments:[],createdBy:"automation",recurrenceSeries:series,recurrenceAnchor:anchor};
}

export function taskChanges(tasks:Task[], previous:Task[]) {
  const index=new Map(tasks.map(task=>[task.id,task])), before=new Map(previous.map(task=>[task.id,task]));
  for(const task of tasks){
    const prior=before.get(task.id);
    const deps=task.dependsOn??[];
    if(!Array.isArray(deps)||deps.some(id=>typeof id!=="string"))return "Task dependencies must be a list of task IDs.";
    if(!prior||prior.status!==task.status||JSON.stringify(prior.dependsOn??[])!==JSON.stringify(deps)||
       deps.some(id=>before.has(id)&&!index.has(id))){
      const issue=taskDependencyIssue(task,index);
      if(issue)return task.title+": "+issue;
    }
  }
}

export function deadlineDay(value: string | number) {
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed + 19_800_000).toISOString().slice(0,10) : "";
}
export function offsetDeadlineDay(day: string, days: number) {
  return new Date(Date.parse(day) + days * 86_400_000).toISOString().slice(0,10);
}
export function deadlineItems(tasks: Task[], projects: import("../types").Project[]) {
  return [
    ...tasks.map(task=>({kind:"Task" as const,id:task.id,projectId:task.projectId,title:task.title,owner:task.assigneeId,day:deadlineDay(task.dueDate),done:task.status==="Done"})),
    ...projects.flatMap(project=>[
      {kind:"Project" as const,id:project.id,projectId:project.id,title:project.name,owner:project.ownerId,day:deadlineDay(project.dueDate),done:project.status==="Completed"},
      ...(project.milestones??[]).map(item=>({kind:"Milestone" as const,id:item.id,projectId:project.id,title:item.title,owner:project.ownerId,day:deadlineDay(item.dueDate),done:!!item.completedAt})),
    ]),
  ].filter(item=>item.day).sort((a,b)=>a.day.localeCompare(b.day)||a.title.localeCompare(b.title));
}

export function taskAttachmentUrl(value?: string) {
  try {
    const url = new URL(value ?? "");
    if (url.protocol==="https:" && !url.username && !url.password) return url.href;
  } catch { /* Existing filename records have no URL. */ }
}
