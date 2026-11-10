import {recordAudit} from "@/lib/auditServer";
import { z } from "zod";
import { reportIdentity,sameOrigin } from "@/lib/auth/server";
import { can } from "@/lib/permissions";
import { dbError,supabaseRequest } from "@/lib/db";
import { ownedLibrary } from "@/lib/outreachServer";
import { mutateMedia } from "@/lib/mediaServer";
import { emptyCRMLibrary,type CRMLibrary } from "@/lib/domain/crmLibrary";
import { ASSET_FOLDERS,type Asset,type AssetFile } from "@/lib/types";
import { assetDownload } from "@/lib/assetDownload";
import { MAX_LIBRARY_ASSET_BYTES } from "@/lib/domain/assetLibrary";
import { contentHash,writeLibraryAsset,removeLibraryAsset } from "@/lib/reportR2";

export const maxDuration=180;
const input=z.object({
  name:z.string().trim().min(1).max(255).refine(value=>!/[\\/\u0000-\u001f\u007f]/.test(value)),
  clientId:z.string().min(1).max(150).optional(),folder:z.enum(ASSET_FOLDERS),
  assetId:z.string().min(1).max(150).optional(),expected:z.number().int().min(1).optional(),
  note:z.string().trim().max(500).optional(),
});
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
class AssetError extends Error{constructor(message:string,readonly status=400){super(message);}}
const fail=(e:unknown)=>e instanceof AssetError?reply({error:e.message},e.status):dbError(e);

function requireAccess(data:CRMLibrary,owner:string,write=false) {
  if(!data.team.some(member=>member.id===owner&&member.role!=="client"&&(member.status??"active")==="active"&&can(member.role,"documents",write?"write":"read")))
    throw new AssetError("Documents & Assets access is required.",403);
}
async function readBody(req:Request) {
  const reader=req.body?.getReader();
  if(!reader)throw new AssetError("Choose a file to upload.");
  const chunks:Uint8Array[]=[];
  let total=0;
  while(true){
    const part=await reader.read();
    if(part.done)break;
    total+=part.value.length;
    if(total>MAX_LIBRARY_ASSET_BYTES){await reader.cancel();throw new AssetError("Each file can be up to 100 MB.",413);}
    chunks.push(part.value);
  }
  if(!total)throw new AssetError("The selected file is empty.");
  return Buffer.concat(chunks,total);
}

export async function GET(req:Request){
  try{
    const user=await reportIdentity(req),data=await ownedLibrary(user.userId);
    if(!data)return reply({error:"File not found."},404);
    requireAccess(data,user.userId);
    const params=new URL(req.url).searchParams;
    const asset=data.assets?.find(item=>item.id===params.get("asset"));
    return await assetDownload(asset,user.userId,params.has("version")?Number(params.get("version")):null);
  }catch(error){return fail(error);}
}
export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req);
    let raw:unknown;
    try {raw=JSON.parse(decodeURIComponent(req.headers.get("x-asset-meta")??""));}
    catch {return reply({error:"Invalid upload details."},400);}
    const parsed=input.safeParse(raw);
    if(!parsed.success)return reply({error:"Check the filename, folder and version details."},400);
    const meta=parsed.data;
    const existing=await ownedLibrary(user.userId);
    const initial=existing??emptyCRMLibrary({id:user.userId,email:user.email});
    requireAccess(initial,user.userId,true);
    if(meta.clientId&&!initial.clients.some(client=>client.id===meta.clientId))return reply({error:"Client library not found."},404);
    const locate=(data:CRMLibrary)=>meta.assetId
      ? data.assets?.find(item=>item.id===meta.assetId)
      : data.assets?.find(item=>!item.archivedAt&&item.clientId===meta.clientId&&item.folder===meta.folder&&item.name.toLowerCase()===meta.name.toLowerCase());
    const previous=locate(initial);
    if(meta.assetId&&(!previous||previous.archivedAt||previous.clientId!==meta.clientId))return reply({error:"Asset not found."},404);
    const version=previous?.versions.at(-1)?.v??0;
    if(meta.expected!==undefined&&meta.expected!==version)return reply({error:"A newer version exists. Refresh before uploading."},409);
    if((previous?.versions.length??0)>=100)return reply({error:"This asset has reached the 100-version limit."},409);
    if(Number(req.headers.get("content-length"))>MAX_LIBRARY_ASSET_BYTES)return reply({error:"Each file can be up to 100 MB."},413);
    const bytes=await readBody(req),assetId=previous?.id??crypto.randomUUID();
    const file:AssetFile={id:crypto.randomUUID(),name:meta.name,size:bytes.length,sha256:contentHash(bytes)};
    if(!existing)await supabaseRequest<number>("rpc/save_crm_library",{method:"POST",body:{p_owner:user.userId,p_revision:0,p_operation:crypto.randomUUID(),p_data:initial}});
    try{
      await writeLibraryAsset(user.userId,assetId,file,bytes);
      await mutateMedia(user.userId,file.id,data=>{
        requireAccess(data,user.userId,true);
        if(meta.clientId&&!data.clients.some(client=>client.id===meta.clientId))throw new AssetError("Client library not found.",404);
        const latest=locate(data);
        if(latest?.id!==previous?.id||(latest?.versions.at(-1)?.v??0)!==version||latest?.archivedAt)
          throw new AssetError("The library changed during the upload. Refresh before retrying.",409);
        if(!latest&&(data.assets?.length??0)>=10000)throw new AssetError("The asset library limit has been reached.",409);
        const at=new Date().toISOString(), ext=/\.([a-z0-9]+)$/i.exec(meta.name)?.[1].toLowerCase()??"file";
        const asset:Asset=latest??{id:assetId,clientId:meta.clientId,name:meta.name,ext,folder:meta.folder,sizeKb:0,tags:[],
          versions:[],createdAt:at,updatedAt:at,uploadedBy:user.userId,clientVisible:false};
        asset.ext=ext;
        asset.sizeKb=Math.ceil(file.size/1024);
        asset.updatedAt=at;
        for(const version of asset.versions)if(version.file)delete version.file.knowledgeText;
        asset.versions.push({v:version+1,at,by:user.userId,note:meta.note||(version?"Uploaded "+meta.name:"Initial upload"),file});
        if(!latest)(data.assets??=[]).unshift(asset);
        recordAudit(data,{actor:"api",actorId:user.userId,entity:"document",entityId:assetId,clientId:meta.clientId,action:version?"Uploaded document version":"Uploaded document",sources:[meta.folder],detail:meta.name,before:version?"Version "+version:undefined,after:"Version "+(version+1),outcome:"Stored"});
        return data;
      });
      return reply({id:assetId,version:version+1},201);
    }catch(error){
      // A timed out save can still have committed. Verify before removing bytes.
      const saved=await ownedLibrary(user.userId).then(data=>!!data?.assets?.find(a=>a.id===assetId)?.versions.some(v=>v.file?.id===file.id)).catch(()=>undefined);
      if(saved)return reply({id:assetId,version:version+1},201);
      if(saved===false)await removeLibraryAsset(user.userId,assetId,file).catch(()=>{});
      throw error;
    }
  }catch(error){return fail(error);}
}
