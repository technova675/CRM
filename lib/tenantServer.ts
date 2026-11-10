import {ownedLibrary} from "./outreachServer";
import {supabaseRequest} from "./db";
import {mutateMedia} from "./mediaServer";
import {emptyCRMLibrary} from "./domain/crmLibrary";
import {tenantPeriod} from "./domain/tenant";

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

export async function reserveTenantUsage(owner:string,key:"aiCredits"|"videoMinutes",amount:number,email=""){
  await ensureTenant(owner,email);
  await mutateMedia(owner,crypto.randomUUID(),data=>{
    const period=tenantPeriod();
    if(data.tenantMeter?.period!==period)data.tenantMeter={period,aiCredits:0,videoMinutes:0};
    data.tenantMeter[key]+=amount;
    return data;
  });
}
