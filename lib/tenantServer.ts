import {ownedLibrary} from "./outreachServer";
import {supabaseRequest,SupabaseDbError} from "./db";
import {mutateMedia} from "./mediaServer";
import {tenantPlan} from "./tenantPlan";
import {emptyCRMLibrary,type CRMLibrary} from "./domain/crmLibrary";
import {PLAN_LIMITS,TenantQuotaError,tenantPeriod,type TenantMeter} from "./domain/tenant";

export async function ensureTenant(owner:string,email=""){
  const existing=await ownedLibrary(owner);
  if(existing)return existing;
  const initial=emptyCRMLibrary({id:owner,email});
  const result=await supabaseRequest<number>("rpc/save_crm_library",{method:"POST",body:{p_owner:owner,p_revision:0,p_operation:crypto.randomUUID(),p_data:initial}});
  if(result>=0)return initial;
  const latest=await ownedLibrary(owner);
  if(!latest)throw new Error("Could not initialize the workspace.");
  return latest;
}

// Migration 202611010010 adds the usage table. Until it is applied, usage stays in the CRM library.
const MISSING=new Set(["PGRST205","PGRST202","42P01","42883"]);
const missing=(error:unknown)=>error instanceof SupabaseDbError&&MISSING.has(error.code);
const COLUMN={aiCredits:"ai_credits",videoMinutes:"video_minutes"} as const;

/** Usage recorded in the library before the usage table existed still counts for its month. */
const legacyMeter=(data:Pick<CRMLibrary,"tenantMeter">,period:string)=>data.tenantMeter?.period===period?data.tenantMeter:{period,aiCredits:0,videoMinutes:0};

export async function reserveTenantUsage(owner:string,key:"aiCredits"|"videoMinutes",amount:number,email=""){
  const data=await ensureTenant(owner,email),period=tenantPeriod(),plan=tenantPlan(owner,data),limit=PLAN_LIMITS[plan][key];
  try{
    // Counted outside the CRM library, so an AI call never changes the CRM revision other devices save against.
    const total=await supabaseRequest<number>("rpc/reserve_tenant_usage",{method:"POST",body:{p_owner:owner,p_period:period,p_key:key,p_amount:amount,p_limit:limit<0?-1:Math.max(0,limit-legacyMeter(data,period)[key])}});
    if(Number(total)<0)throw new TenantQuotaError(key,limit,plan);
    return;
  }catch(error){if(!missing(error))throw error;}
  await mutateMedia(owner,crypto.randomUUID(),current=>{
    if(current.tenantMeter?.period!==period)current.tenantMeter={period,aiCredits:0,videoMinutes:0};
    current.tenantMeter[key]+=amount;
    return current;
  });
}

/** Library copy whose meter reflects this month's real usage, for usage screens and summaries. */
export async function withTenantMeter<T extends Pick<CRMLibrary,"tenantMeter">>(owner:string,data:T):Promise<T>{
  const period=tenantPeriod(),legacy=legacyMeter(data,period);
  const rows=await supabaseRequest<{ai_credits:number;video_minutes:number}[]>("tenant_usage",{query:{owner_id:`eq.${owner}`,period:`eq.${period}`,select:"ai_credits,video_minutes",limit:"1"}}).catch(error=>{if(missing(error))return [];throw error;});
  const meter:TenantMeter={period,aiCredits:legacy.aiCredits+Number(rows[0]?.[COLUMN.aiCredits]??0),videoMinutes:legacy.videoMinutes+Number(rows[0]?.[COLUMN.videoMinutes]??0)};
  return {...data,tenantMeter:meter};
}
