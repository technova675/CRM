import {z} from "zod";
import {reportIdentity} from "@/lib/auth/server";
import {MEDIA_PLATFORMS} from "@/lib/domain/performance";
import {callMediaConnector,mediaConnectorConfigured} from "@/lib/mediaServer";
import {dbError} from "@/lib/db";
const responseSchema=z.object({connections:z.array(z.object({platform:z.enum(MEDIA_PLATFORMS),connected:z.boolean(),accountLabel:z.string().max(500),lastSyncAt:z.string().datetime().optional(),connectUrl:z.url().refine(v=>v.startsWith("https://")).optional()})).max(50)});
export async function GET(req:Request){try{const user=await reportIdentity(req);if(!mediaConnectorConfigured())return Response.json({configured:false,connections:[],note:"Live connector not configured. Import platform CSV data to analyze real metrics."});const result=responseSchema.safeParse(await callMediaConnector("connections",user.userId));if(!result.success)return Response.json({error:"Connector returned an invalid account list."},{status:502});return Response.json({configured:true,...result.data},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return dbError(error);}}
