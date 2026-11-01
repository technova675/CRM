import {reportIdentity} from "@/lib/auth/server";
import {dbError} from "@/lib/db";
import {deliveryIntegration,deliveryHistory} from "@/lib/outreachServer";
export async function GET(req:Request){try{const user=await reportIdentity(req);const campaign=new URL(req.url).searchParams.get("campaign")??undefined;if(campaign&&campaign.length>150)return Response.json({error:"Invalid campaign."},{status:400});return Response.json({integration:deliveryIntegration(),...await deliveryHistory(user.userId,campaign)},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return dbError(error);}}
