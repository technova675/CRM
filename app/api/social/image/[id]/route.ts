import {reportIdentity} from "@/lib/auth/server";
import {ownedLibrary} from "@/lib/outreachServer";
import {dbError} from "@/lib/db";
import {readLibraryAsset} from "@/lib/reportR2";
import {knowledgeAccess} from "@/lib/domain/clientKnowledge";
import {studioState} from "@/lib/domain/socialStudio";
export const runtime="nodejs";

// Generated images are private: served only to signed-in members of the owning account.
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=await reportIdentity(req),{id}=await params,library=await ownedLibrary(user.userId);
    if(!library||!knowledgeAccess(library,user.userId,"social"))return Response.json({error:"Image not found."},{status:404});
    const image=studioState(library.socialStudio).images.find(i=>i.id===id);
    if(!image)return Response.json({error:"Image not found."},{status:404});
    const stream=await readLibraryAsset(user.userId,image.id,{id:image.fileId,sha256:image.sha256,size:image.size});
    const download=new URL(req.url).searchParams.has("download");
    return new Response(stream,{headers:{"Content-Type":"image/jpeg","Content-Length":String(image.size),"Cache-Control":"private, max-age=86400",
      ...(download?{"Content-Disposition":`attachment; filename="social-${image.id.slice(0,8)}.jpg"`}:{})}});
  }catch(error){return dbError(error);}
}
