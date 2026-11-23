import {reportIdentity} from "@/lib/auth/server";
import {dbError} from "@/lib/db";
import {ownedLibrary} from "@/lib/outreachServer";
import {invoicePDF} from "@/lib/invoicePdf";
import {knowledgeAccess} from "@/lib/domain/clientKnowledge";
export const runtime="nodejs";

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=await reportIdentity(req),{id}=await params,library=await ownedLibrary(user.userId);
    const invoice=library?.invoices.find(item=>item.id===id),client=invoice&&library?.clients.find(item=>item.id===invoice.clientId);
    if(!library||!invoice||!client)return Response.json({error:"Invoice not found."},{status:404});
    if(!knowledgeAccess(library,user.userId,"payments"))return Response.json({error:"Finance access is required."},{status:403});
    const profile=library.tenantProfile;
    const bytes=await invoicePDF(invoice,client,{name:profile?.name||"Agency",email:profile?.billingEmail||user.email,tax:profile?.tax??{}});
    // Shown in the browser so it can be checked, then printed or saved; the file name carries the invoice number.
    return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`inline; filename="${invoice.number.replace(/[^a-zA-Z0-9_-]/g,"")}.pdf"`,"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof Error&&/too long/i.test(error.message))return Response.json({error:error.message},{status:422});
    return dbError(error);
  }
}
