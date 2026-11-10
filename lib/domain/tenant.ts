import type {Plan,UsageKey} from "../types";
import type {CRMLibrary} from "./crmLibrary";

export const PLAN_LIMITS: Record<Plan,Record<UsageKey,number>> = {
  Starter:{aiCredits:2000,leads:1000,clients:5,campaigns:25,reports:20,videoMinutes:30,storageGb:10,teamMembers:3},
  Growth:{aiCredits:10000,leads:10000,clients:20,campaigns:150,reports:100,videoMinutes:180,storageGb:100,teamMembers:10},
  Agency:{aiCredits:40000,leads:50000,clients:75,campaigns:750,reports:500,videoMinutes:900,storageGb:500,teamMembers:40},
  Enterprise:{aiCredits:-1,leads:-1,clients:-1,campaigns:-1,reports:-1,videoMinutes:-1,storageGb:-1,teamMembers:-1},
};

export type TenantProfile={name:string;billingEmail:string;createdAt:string;basePlan:Plan};
export type TenantMeter={period:string;aiCredits:number;videoMinutes:number};
export const tenantPeriod=(at=new Date())=>at.toISOString().slice(0,7);

export function tenantUsage(data:CRMLibrary,period=tenantPeriod()):Record<UsageKey,number>{
  const meter=data.tenantMeter?.period===period?data.tenantMeter:undefined;
  const files=(data.assets??[]).flatMap(asset=>asset.versions.filter(version=>version.file));
  return {
    aiCredits:meter?.aiCredits??0,videoMinutes:meter?.videoMinutes??0,
    leads:data.leads?.length??0,clients:data.clients?.length??0,campaigns:data.campaigns?.length??0,
    reports:(data.reports?.length??0)+(data.clientReporting?.reports.length??0),
    storageGb:files.reduce((total,version)=>total+(version.file?.size??0),0)/1e9,
    teamMembers:(data.team??[]).filter(member=>member.role!=="client"&&member.status!=="disabled").length,
  };
}

export class TenantQuotaError extends Error{
  readonly key:UsageKey;
  readonly limit:number;
  readonly plan:Plan;
  constructor(key:UsageKey,limit:number,plan:Plan){
    super();
    this.key=key;
    this.limit=limit;
    this.plan=plan;
    this.message=plan+" plan limit reached for "+(({aiCredits:"monthly AI credits",videoMinutes:"monthly video draft minutes",storageGb:"document storage",teamMembers:"team seats"} as Partial<Record<UsageKey,string>>)[key]??key)+".";
  }
}

export function checkTenantQuota(previous:CRMLibrary,next:CRMLibrary,plan:Plan,period=tenantPeriod()){
  const before=tenantUsage(previous,period),after=tenantUsage(next,period),limits=PLAN_LIMITS[plan];
  for(const key of Object.keys(limits) as UsageKey[]){
    if(limits[key]>=0&&after[key]>limits[key]&&after[key]>before[key])throw new TenantQuotaError(key,limits[key],plan);
  }
}
