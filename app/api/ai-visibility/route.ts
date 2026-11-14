import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {ownedLibrary,boundedJSON} from "@/lib/outreachServer";
import {mutateMedia} from "@/lib/mediaServer";
import {dbError} from "@/lib/db";
import {recordAudit} from "@/lib/auditServer";
import {visibilityState,visibilitySummary} from "@/lib/domain/aiVisibility";
import type {VisibilitySample} from "@/lib/domain/aiVisibility";

const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
const promptSchema=z.object({action:z.literal("prompt"),clientId:z.string().min(1).max(150),category:z.string().trim().min(1).max(100),question:z.string().trim().min(8).max(1000),competitors:z.array(z.string().trim().min(1).max(100)).max(20)});
const sampleSchema=z.object({action:z.literal("sample"),promptId:z.string().uuid(),provider:z.enum(["ChatGPT","Gemini","Perplexity","Google AI"]),rawAnswer:z.string().trim().min(1).max(20000),citations:z.array(z.url().refine(value=>{try{return ["http:","https:"].includes(new URL(value).protocol);}catch{return false;}})).max(30),sentiment:z.enum(["positive","neutral","negative","unmentioned"])});
const input=z.discriminatedUnion("action",[promptSchema,sampleSchema,z.object({action:z.literal("deletePrompt"),promptId:z.string().uuid()})]);

export async function GET(req:Request){
  try{
    const user=await reportIdentity(req),data=await ownedLibrary(user.userId);
    if(!data)return response({error:"Open the CRM and create a client first."},404);
    const clientId=new URL(req.url).searchParams.get("clientId")??"";
    if(!data.clients.some(client=>client.id===clientId))return response({error:"Client not found in this organization."},404);
    const state=visibilityState(data.aiVisibility),ids=new Set(state.prompts.filter(prompt=>prompt.clientId===clientId).map(prompt=>prompt.id));
    return response({prompts:state.prompts.filter(prompt=>ids.has(prompt.id)),samples:state.samples.filter(sample=>ids.has(sample.promptId)),summary:visibilitySummary(state,clientId)});
  }catch(error){return dbError(error);}
}

export async function POST(req:Request){
  if(!sameOrigin(req))return response({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req),parsed=input.safeParse(await boundedJSON(req,30000).catch(()=>null));
    if(!parsed.success)return response({error:"Check the question, provider, answer, and citation URLs."},400);
    const value=parsed.data,library=await ownedLibrary(user.userId);
    if(!library)return response({error:"Open the CRM and create a client first."},404);
    const current=visibilityState(library.aiVisibility);
    if(value.action==="prompt"&&!library.clients.some(client=>client.id===value.clientId))return response({error:"Client not found in this organization."},404);
    if(value.action!=="prompt"&&!current.prompts.some(prompt=>prompt.id===value.promptId))return response({error:"Question not found in this organization."},404);
    const at=new Date().toISOString(),id=crypto.randomUUID();
    let sample:VisibilitySample|undefined;
    if(value.action==="sample"){
      const prompt=current.prompts.find(item=>item.id===value.promptId)!;
      const answer=value.rawAnswer.toLocaleLowerCase(),brand=library.clients.find(client=>client.id===prompt.clientId)!.company;
      const includes=(name:string)=>name.length>=3&&answer.includes(name.toLocaleLowerCase());
      sample={id,promptId:value.promptId,provider:value.provider,capturedAt:at,rawAnswer:value.rawAnswer,
        brandMention:includes(brand),competitorMentions:prompt.competitors.filter(includes),citations:[...new Set(value.citations)],
        sentiment:includes(brand)?value.sentiment:"unmentioned",source:"manual"};
    }
    await mutateMedia(user.userId,id,data=>{
      const state=data.aiVisibility??={prompts:[],samples:[]};
      if(value.action==="prompt"){
        if(!data.clients.some(client=>client.id===value.clientId))throw new Error("Client changed. Reload and retry.");
        if(state.prompts.length>=500)throw new Error("The question library is full.");
        state.prompts.push({id,clientId:value.clientId,category:value.category,question:value.question,competitors:[...new Set(value.competitors)],createdAt:at});
      }else{
        const prompt=state.prompts.find(item=>item.id===value.promptId);
        if(!prompt)throw new Error("Question changed. Reload and retry.");
        if(value.action==="sample"){
          if(state.samples.length>=2000)throw new Error("The sample library is full. Export the workspace before adding more.");
          state.samples.push(sample!);
        }else{
          state.prompts=state.prompts.filter(item=>item.id!==value.promptId);
          state.samples=state.samples.filter(item=>item.promptId!==value.promptId);
        }
      }
      recordAudit(data,{actor:"human",actorId:user.userId,entity:"seo",entityId:id,action:value.action==="prompt"?"Added AI visibility question":value.action==="sample"?"Recorded AI answer sample":"Deleted AI visibility question",detail:value.action==="sample"?value.provider:"AI search visibility",outcome:"Saved"});
      return data;
    });
    return response({ok:true});
  }catch(error){return dbError(error);}
}
