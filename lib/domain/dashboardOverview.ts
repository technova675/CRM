import type {Campaign, Lead} from "../types";
import {campaignMediaRows,mediaDates,mediaTotals} from "./performance";

const dayFormat=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"});
export const dashboardDay=(date:Date)=>dayFormat.format(date);
const shiftDay=(date:string,days:number)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
const validDay=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date));

export function dashboardMetrics(campaigns:Campaign[],leads:Lead[],days:number,today:string){
  let latest="";
  for(const campaign of campaigns)for(const row of [...(campaign.metrics??[]),...(campaign.performanceRows??[])]){
    const day=row.date.slice(0,10);
    if(day<=today&&day>latest&&validDay(day))latest=day;
  }
  const range=mediaDates(days,latest||today);
  const rows=campaigns.flatMap(campaign=>campaignMediaRows(campaign,range.prevStart,range.end));
  const current=rows.filter(row=>row.date&&row.date>=range.start);
  const previous=rows.filter(row=>row.date&&row.date<=range.prevEnd);
  const campaignDays=new Set(current.map(row=>row.date)).size;
  const previousDays=new Set(previous.map(row=>row.date)).size;
  const leadDays=new Map<string,number>();
  for(const lead of leads){
    const stamp=new Date(lead.createdAt);
    if(!Number.isFinite(stamp.getTime()))continue;
    const date=dashboardDay(stamp);
    leadDays.set(date,(leadDays.get(date)??0)+1);
  }
  const step=days>30?7:1;
  const chart=[];
  for(let index=0;index<days;index+=step){
    const start=shiftDay(range.start,index),end=shiftDay(range.start,Math.min(days-1,index+step-1));
    const metric=mediaTotals(current.filter(row=>row.date&&row.date>=start&&row.date<=end));
    let crmLeads=0;
    for(let offset=0;offset<=Math.min(step-1,days-index-1);offset++)crmLeads+=leadDays.get(shiftDay(start,offset))??0;
    chart.push({date:start,end,spend:metric.spend,revenue:metric.revenue,conversions:metric.conversions,leads:metric.leads,crmLeads});
  }
  const platforms=new Map<string,typeof current>();
  for(const row of current){
    const key=row.platform??"Unspecified";
    const group=platforms.get(key)??[];
    group.push(row);
    platforms.set(key,group);
  }
  const spendByPlatform=[...platforms].flatMap(([name,items])=>{
    const spend=mediaTotals(items).spend;
    return spend!==null&&spend>0?[{name,spend}]:[];
  }).sort((a,b)=>b.spend-a.spend);
  const countLeads=(start:string,end:string)=>[...leadDays].reduce((total,[date,count])=>date>=start&&date<=end?total+count:total,0);

  return {range,latest,current:mediaTotals(current),previous:mediaTotals(previous),campaignDays,previousDays,chart,spendByPlatform,
    crmLeads:countLeads(range.start,range.end),previousCrmLeads:countLeads(range.prevStart,range.prevEnd)};
}

export function dashboardChange(current:number|null,previous:number|null){
  return current!==null&&previous!==null&&previous>0?(current-previous)/previous*100:null;
}
