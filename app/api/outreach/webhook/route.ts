import {createHmac} from "node:crypto";
import {z} from "zod";
import {supabaseRequest,dbError} from "@/lib/db";
import {matchesSecret} from "@/lib/outreachServer";
export async function POST(req:Request){
 const secret=process.env.OUTREACH_WEBHOOK_SECRET,timestamp=req.headers.get("x-outreach-timestamp")??"",signature=req.headers.get("x-outreach-signature")??"";
 if(!secret||!/^\d{10}$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300)return Response.json({error:"Invalid webhook signature."},{status:401});
 const reader=req.body?.getReader();if(!reader)return Response.json({error:"Missing event."},{status:400});let raw="",size=0;const decoder=new TextDecoder();
 while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>16000){await reader.cancel();return Response.json({error:"Event too large."},{status:413});}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();
 if(!matchesSecret(createHmac("sha256",secret).update(`${timestamp}.${raw}`).digest("hex"),signature))return Response.json({error:"Invalid webhook signature."},{status:401});
 try{const input=z.object({eventId:z.string().min(1).max(150),deliveryId:z.string().uuid(),kind:z.enum(["delivered","opened","replied","bounced","unsubscribed"]),occurredAt:z.string().datetime()}).safeParse(JSON.parse(raw));if(!input.success||Date.parse(input.data.occurredAt)>Date.now()+300000)return Response.json({error:"Invalid event."},{status:400});
 const event=input.data;const recorded=await supabaseRequest<boolean>("rpc/record_outreach_event",{method:"POST",body:{p_event:event.eventId,p_delivery:event.deliveryId,p_kind:event.kind,p_occurred:event.occurredAt}});return Response.json({received:true,recorded});
 }catch(error){if(error instanceof SyntaxError)return Response.json({error:"Invalid event."},{status:400});return dbError(error);}
}
