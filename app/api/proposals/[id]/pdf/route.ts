import {reportIdentity} from "@/lib/auth/server";
import {dbError} from "@/lib/db";
import {ownedLibrary} from "@/lib/outreachServer";
import {proposalPDF} from "@/lib/proposalPdf";
export const runtime="nodejs";
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 try{const user=await reportIdentity(req),{id}=await params,library=await ownedLibrary(user.userId),proposal=library?.proposals.find(p=>p.id===id);if(!proposal)return Response.json({error:"Proposal not found."},{status:404});const bytes=await proposalPDF(proposal);return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="proposal-${id.replace(/[^a-zA-Z0-9_-]/g,"")}.pdf"`,"Cache-Control":"private, no-store"}});}catch(error){if(error instanceof Error&&/font|characters|50-page|too long/i.test(error.message))return Response.json({error:error.message},{status:422});return dbError(error);}
}
