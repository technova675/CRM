import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {ownedLibrary,boundedJSON} from "@/lib/outreachServer";
import {mutateMedia} from "@/lib/mediaServer";
import {dbError} from "@/lib/db";
import {recordAudit} from "@/lib/auditServer";
import {emptyIndiaCommerce,MARKETPLACES,taxTotals} from "@/lib/domain/indiaCommerce";
import type {IndiaCommerceState} from "@/lib/domain/indiaCommerce";

const id=z.string().min(1).max(150),text=z.string().trim().max(2000),money=z.number().finite().nonnegative().max(1e11);
const gstin=z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/);
const body=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("observation"),platform:z.enum(MARKETPLACES),product:z.string().trim().min(1).max(200),observedOn:z.iso.date(),source:z.string().trim().min(1).max(500),shareOfSearch:z.number().min(0).max(100).nullable(),available:z.boolean(),priceInr:money.nullable(),buyBox:z.boolean().nullable(),promotion:text}),
  z.object({kind:z.literal("consent"),phone:z.string().regex(/^\+[1-9][0-9]{7,14}$/),status:z.enum(["opted_in","opted_out"]),source:z.string().trim().min(1).max(500)}),
  z.object({kind:z.literal("template"),name:z.string().trim().min(1).max(100),language:z.string().trim().min(2).max(100),body:z.string().trim().min(1).max(4000),providerStatus:z.enum(["draft","submitted","approved","rejected"]),reviewedBy:text}),
  z.object({kind:z.literal("draft"),language:z.string().trim().min(2).max(100),copy:z.string().trim().min(1).max(4000),reviewer:z.string().trim().min(1).max(100),status:z.enum(["draft","reviewed"])}),
  z.object({kind:z.literal("plan"),occasion:z.string().trim().min(1).max(150),startDate:z.iso.date(),endDate:z.iso.date(),budgetInr:money,creativePlan:text,channels:text}),
  z.object({kind:z.literal("tax"),invoiceId:id,gstin:gstin,customerGstin:gstin.or(z.literal("")),placeOfSupply:z.string().trim().min(1).max(100),sac:z.string().regex(/^[0-9]{4,8}$/),taxableInr:money,cgstRate:z.number().min(0).max(28),sgstRate:z.number().min(0).max(28),igstRate:z.number().min(0).max(28),tdsInr:money,paymentMethod:z.enum(["UPI","Razorpay","Other"]),paymentReference:text}),
]);
const input=z.object({clientId:id,data:body});
const respond=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
const key={observation:"observations",consent:"consents",template:"templates",draft:"drafts",plan:"plans",tax:"taxWorksheets"} as const;

export async function GET(req:Request){try{
  const user=await reportIdentity(req),data=await ownedLibrary(user.userId),clientId=new URL(req.url).searchParams.get("clientId");
  if(!data||!data.clients.some(client=>client.id===clientId))return respond({error:"Client not found in this organization."},404);
  const state=data.indiaCommerce??emptyIndiaCommerce();
  return respond({clientId,observations:state.observations.filter(row=>row.clientId===clientId),consents:state.consents.filter(row=>row.clientId===clientId),templates:state.templates.filter(row=>row.clientId===clientId),drafts:state.drafts.filter(row=>row.clientId===clientId),plans:state.plans.filter(row=>row.clientId===clientId),taxWorksheets:state.taxWorksheets.filter(row=>row.clientId===clientId).map(row=>({...row,totals:taxTotals(row)}))});
}catch(error){return dbError(error);}}

export async function POST(req:Request){
  if(!sameOrigin(req))return respond({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req),parsed=input.safeParse(await boundedJSON(req,16000).catch(()=>null));
    if(!parsed.success)return respond({error:"Check the required fields and amounts."},400);
    const {clientId,data:entry}=parsed.data,library=await ownedLibrary(user.userId);
    if(!library?.clients.some(client=>client.id===clientId))return respond({error:"Client not found in this organization."},404);
    if(entry.kind==="plan"&&entry.endDate<entry.startDate)return respond({error:"End date must follow start date."},400);
    if(entry.kind==="tax"){
      if(!library.invoices.some(invoice=>invoice.id===entry.invoiceId&&invoice.clientId===clientId))return respond({error:"Invoice not found for this client."},404);
      if(entry.igstRate>0&&(entry.cgstRate>0||entry.sgstRate>0)||entry.tdsInr>entry.taxableInr*(1+(entry.cgstRate+entry.sgstRate+entry.igstRate)/100))return respond({error:"Review the GST split and TDS amount."},400);
    }
    const operation=crypto.randomUUID(),at=new Date().toISOString();
    await mutateMedia(user.userId,operation,next=>{
      if(!next.clients.some(client=>client.id===clientId))throw new Error("Client changed. Reload and retry.");
      if(entry.kind==="tax"&&!next.invoices.some(invoice=>invoice.id===entry.invoiceId&&invoice.clientId===clientId))throw new Error("Invoice changed. Reload and retry.");
      const state:IndiaCommerceState=next.indiaCommerce??=emptyIndiaCommerce();
      const collection=state[key[entry.kind]] as {id:string}[];
      if(collection.length>=1500)throw new Error("This India Commerce collection is full.");
      if(entry.kind==="consent"){
        const previous=state.consents.findLast(row=>row.clientId===clientId&&row.phone===entry.phone);
        if(previous?.status===entry.status)return next;
      }
      if(entry.kind==="draft"&&entry.status==="reviewed"&&!entry.reviewer)throw new Error("Name the native speaker who reviewed this copy.");
      if(entry.kind==="tax"){
        const previous=state.taxWorksheets.find(row=>row.invoiceId===entry.invoiceId);
        if(previous)throw new Error("A tax worksheet already exists for this invoice.");
      }
      const record={...entry,id:operation,clientId,...(entry.kind==="consent"?{recordedAt:at}:{}),...(entry.kind==="draft"?{createdAt:at}:{})};
      collection.push(record);
      recordAudit(next,{actor:"human",actorId:user.userId,entity:entry.kind==="tax"?"invoice":"campaign",entityId:operation,clientId,action:"Recorded India Commerce "+entry.kind,detail:entry.kind==="consent"?entry.status:entry.kind,outcome:"Saved"});
      return next;
    });
    return respond({ok:true});
  }catch(error){return dbError(error);}
}
