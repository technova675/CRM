import {timingSafeEqual} from "node:crypto";
import {accountsWithAutomations,automationTick} from "@/lib/automationTick";
export const maxDuration=300;

const BUDGET_MS=240_000,RUNS_PER_ACCOUNT=5;

function authorized(header:string|null){
  const secret=process.env.CRON_SECRET;
  if(!secret||secret.length<16||!header?.startsWith("Bearer "))return false;
  const given=Buffer.from(header.slice(7)),expected=Buffer.from(secret);
  return given.length===expected.length&&timingSafeEqual(given,expected);
}

/**
 * Scheduled pass over every account with an enabled workflow. Call it every minute from Vercel Cron (vercel.json),
 * or from any scheduler with "Authorization: Bearer $CRON_SECRET". Each account advances a few runs per pass and
 * the pass stops inside its time budget; the next call continues where it left off.
 */
export async function GET(req:Request){
  if(!authorized(req.headers.get("authorization")))return Response.json({error:"Cron authorization required."},{status:401});
  const started=Date.now(),owners=await accountsWithAutomations();
  let queued=0,advanced=0,failed=0,visited=0;
  for(const owner of owners){
    if(Date.now()-started>BUDGET_MS)break;
    visited++;
    try{
      for(let i=0;i<RUNS_PER_ACCOUNT&&Date.now()-started<BUDGET_MS;i++){
        const result=await automationTick(owner);
        queued+=i===0?result.queued:0;
        if(!result.processed)break;
        advanced++;
      }
    }catch{failed++;}
  }
  return Response.json({accounts:owners.length,visited,queued,advanced,failed,ms:Date.now()-started},{headers:{"Cache-Control":"no-store"}});
}
