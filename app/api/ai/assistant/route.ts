import { POST as runAgent } from "../agent/route";
import { boundedJSON } from "@/lib/outreachServer";
import { sameOrigin } from "@/lib/auth/server";

export async function POST(req:Request) {
  if(!sameOrigin(req))return Response.json({error:"Request origin is not allowed."},{status:403});
  const body = await boundedJSON(req,80000).catch(()=>null) as {question?:unknown;clientId?:unknown}|null;
  if(typeof body?.question!=="string")return Response.json({error:"A question is required."},{status:400});
  return runAgent(new Request(req.url,{method:"POST",headers:req.headers,signal:req.signal,
    body:JSON.stringify({task:body.question,clientId:body.clientId,format:"text"})}));
}
