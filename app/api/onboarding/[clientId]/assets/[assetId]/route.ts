import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {dbError} from "@/lib/db";
import {ownedLibrary} from "@/lib/outreachServer";
import {readOnboardingAsset,writeOnboardingAsset} from "@/lib/reportR2";
export const runtime="nodejs";export const maxDuration=90;
type Context={params:Promise<{clientId:string;assetId:string}>};
export async function POST(req:Request,{params}:Context){
 if(!sameOrigin(req))return Response.json({error:"Request origin is not allowed."},{status:403});
 try{const user=await reportIdentity(req),{clientId,assetId}=await params,library=await ownedLibrary(user.userId),asset=library?.clients.find(c=>c.id===clientId)?.onboardingWorkspace?.assets.find(a=>a.id===assetId);if(!asset)return Response.json({error:"Onboarding asset not found."},{status:404});
 let name:string;try{name=decodeURIComponent(req.headers.get("x-file-name")??"");}catch{return Response.json({error:"Invalid file name."},{status:400});}
 const types:Record<string,string>={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",svg:"image/svg+xml",pdf:"application/pdf",zip:"application/zip"},type=types[name.split(".").at(-1)?.toLowerCase()??""];
 if(!name||name.length>300||!type)return Response.json({error:"Upload PNG, JPEG, WebP, SVG, PDF or ZIP brand assets up to 10 MB."},{status:400});
 const fileId=req.headers.get("x-upload-id")??crypto.randomUUID();if(!/^[a-f0-9-]{36}$/i.test(fileId))return Response.json({error:"Invalid upload identifier."},{status:400});
 const reader=req.body?.getReader();if(!reader)return Response.json({error:"Missing file."},{status:400});const parts:Uint8Array[]=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>10*1024*1024){await reader.cancel();return Response.json({error:"Brand assets are limited to 10 MB each."},{status:413});}parts.push(part.value);}if(!size)return Response.json({error:"The selected file is empty."},{status:400});
 const bytes=Buffer.concat(parts),result=await writeOnboardingAsset(user.userId,clientId,assetId,fileId,bytes);return Response.json({file:{id:fileId,name,type,size:result.size,sha256:result.sha256,uploadedAt:new Date().toISOString()}},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return dbError(error);}
}
export async function GET(req:Request,{params}:Context){try{const user=await reportIdentity(req),{clientId,assetId}=await params,library=await ownedLibrary(user.userId),asset=library?.clients.find(c=>c.id===clientId)?.onboardingWorkspace?.assets.find(a=>a.id===assetId);if(!asset?.file)return Response.json({error:"Onboarding file not found."},{status:404});const bytes=await readOnboardingAsset(user.userId,clientId,assetId,asset.file);return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="${asset.file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}"`,"X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox","Cache-Control":"private, no-store"}});}catch(error){return dbError(error);}}
