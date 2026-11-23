import {boundedJSON} from "@/lib/outreachServer";
import {validWorker,WorkflowError} from "@/lib/automationServer";
import {automationTick} from "@/lib/automationTick";
export const maxDuration=120;

// Single-account pass for the self-hosted worker (scripts/automation-worker.mjs). The scheduled route is /api/automations/cron.
export async function POST(req:Request){
  try{
    const body=await boundedJSON(req,2000) as {ownerId?:string};
    if(typeof body.ownerId!=="string"||!validWorker(req.headers.get("authorization")?.replace(/^Bearer /,"")??"",body.ownerId))return Response.json({error:"Worker authorization required."},{status:401});
    return Response.json(await automationTick(body.ownerId));
  }catch(e){return Response.json({error:e instanceof WorkflowError?e.message:"Worker could not complete this tick."},{status:500});}
}
