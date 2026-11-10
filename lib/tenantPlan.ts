import type {CRMLibrary} from "./domain/crmLibrary";
import {PLANS,type Plan} from "./types";

export function tenantPlan(owner:string,data?:Pick<CRMLibrary,"tenantProfile">):Plan{
  try{
    const entries=JSON.parse(process.env.ADBIBE_TENANT_PLANS??"{}") as Record<string,unknown>;
    const assigned=Object.hasOwn(entries,owner)?entries[owner]:undefined;
    if(PLANS.includes(assigned as Plan))return assigned as Plan;
  }catch{/* Invalid overrides are ignored in favor of the stored baseline. */}
  return data?.tenantProfile?.basePlan??(data?"Agency":"Starter");
}
