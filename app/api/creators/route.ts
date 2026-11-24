import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {boundedJSON,ownedLibrary} from "@/lib/outreachServer";
import {mutateMedia} from "@/lib/mediaServer";
import {recordAudit} from "@/lib/auditServer";
import {knowledgeAccess} from "@/lib/domain/clientKnowledge";
import {creatorDuplicateKey} from "@/lib/domain/influencerWorkspace";
import {CREATOR_COLUMNS,CREATOR_STATUSES,STATUS_LABEL,rosterRecord,toCreator,type CreatorRow} from "@/lib/domain/creators";
import {dbError,supabaseRequest,SupabaseDbError} from "@/lib/db";

const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"private, no-store"}});
const mediaBase=()=>process.env.CREATOR_MEDIA_BASE_URL;
const missingTable=(e:unknown)=>e instanceof SupabaseDbError&&["PGRST205","42P01"].includes(e.code);
class InputError extends Error{constructor(message:string,readonly status=400){super(message);}}

async function access(userId:string,write=false){
  const library=await ownedLibrary(userId);
  // A brand-new account has no library yet; its owner is the admin.
  if(library&&!knowledgeAccess(library,userId,"influencers",write))throw new InputError(write?"Influencer edit access is required.":"Influencer access is required.",403);
  return library;
}
async function one(owner:string,id:string){
  const [row]=await supabaseRequest<CreatorRow[]>("creators",{query:{select:CREATOR_COLUMNS,owner_id:`eq.${owner}`,id:`eq.${id}`,limit:"1"}});
  if(!row)throw new InputError("Creator not found in this account.",404);
  return row;
}
const patch=(owner:string,id:string,body:Record<string,unknown>)=>supabaseRequest("creators",{method:"PATCH",query:{owner_id:`eq.${owner}`,id:`eq.${id}`},prefer:"return=minimal",body});

/** The account's talent pool, newest first. Sign-up IP and browser details are never returned. */
export async function GET(req:Request){
  try{
    const user=await reportIdentity(req);await access(user.userId);
    try{
      const rows=await supabaseRequest<CreatorRow[]>("creators",{query:{select:CREATOR_COLUMNS,owner_id:`eq.${user.userId}`,order:"created_at.desc",limit:"2000"},timeoutMs:30_000});
      return reply({creators:rows.map(r=>toCreator(r,mediaBase())),mediaConfigured:!!mediaBase()});
    }catch(error){if(missingTable(error))return reply({creators:[],setupRequired:true});throw error;}
  }catch(error){return error instanceof InputError?reply({error:error.message},error.status):dbError(error);}
}

const uuid=z.uuid();
const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("status"),id:uuid,status:z.enum(CREATOR_STATUSES)}),
  z.object({action:z.literal("review"),id:uuid,notes:z.string().max(4000),quality:z.number().int().min(1).max(5).nullable()}),
  z.object({action:z.literal("roster"),id:uuid,operationId:z.uuid()}),
]);

export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req),parsed=input.safeParse(await boundedJSON(req,8000).catch(()=>null));
    if(!parsed.success)return reply({error:"Invalid request."},400);
    await access(user.userId,true);
    const v=parsed.data,row=await one(user.userId,v.id),at=new Date().toISOString();
    const audit=(action:string,after:string)=>mutateMedia(user.userId,crypto.randomUUID(),data=>{recordAudit(data,{actor:"human",actorId:user.userId,entity:"influencer",entityId:v.id,action,after,outcome:"Saved",detail:row.full_name});return data;}).catch(()=>undefined);

    if(v.action==="status"){
      await patch(user.userId,v.id,{status:v.status});
      await audit("Talent pool status changed",`${STATUS_LABEL[row.status]} → ${STATUS_LABEL[v.status]}`);
      return reply({ok:true});
    }
    if(v.action==="review"){
      await patch(user.userId,v.id,{internal_notes:v.notes.trim()||null,quality_score:v.quality});
      return reply({ok:true});
    }
    // Add to roster: create the CRM creator profile once, then remember which one it is.
    const creator=toCreator(row,mediaBase());
    if(creator.rosterId){
      const library=await ownedLibrary(user.userId);
      if(library?.influencers.some(i=>i.id===creator.rosterId))return reply({ok:true,rosterId:creator.rosterId,already:true});
    }
    const id=crypto.randomUUID(),record=rosterRecord(creator,id,at),key=creatorDuplicateKey(record);
    let rosterId=id;
    await mutateMedia(user.userId,v.operationId,data=>{
      const same=key?data.influencers.find(i=>creatorDuplicateKey(i)===key):undefined;
      if(same){rosterId=same.id;return data;}
      if(data.influencers.length>=10000)throw new InputError("Creator database limit reached.");
      data.influencers.unshift(record);
      recordAudit(data,{actor:"human",actorId:user.userId,entity:"influencer",entityId:id,action:"Added creator to roster from talent pool",outcome:"Saved",detail:record.name});
      return data;
    });
    await patch(user.userId,v.id,{roster_influencer_id:rosterId,...(row.status==="pending"?{status:"approved"}:{})});
    return reply({ok:true,rosterId,linkedExisting:rosterId!==id});
  }catch(error){return error instanceof InputError?reply({error:error.message},error.status):dbError(error);}
}
