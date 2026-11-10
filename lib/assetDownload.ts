import "server-only";
import type { Asset } from "./types";
import { readLibraryAsset } from "./reportR2";

export function assetDownload(asset:Asset|undefined,owner:string,version:number|null) {
  const versions=asset?.versions??[];
  const file=(version===null?[...versions].reverse().find(v=>v.file):versions.find(v=>v.v===version))?.file;
  if(!asset||!file)return Promise.resolve(Response.json({error:"Stored version not found."},{status:404}));
  const name=file.name.replace(/[\u0000-\u001f\u007f]/g,"");
  const fallback=name.replace(/[^a-zA-Z0-9 ._-]/g,"_").trim()||"download";
  const encoded=encodeURIComponent(name).replace(/['()*]/g,c=>"%"+c.charCodeAt(0).toString(16).toUpperCase());
  return readLibraryAsset(owner,asset.id,file).then(body=>new Response(body,{headers:{
    "Content-Type":"application/octet-stream","Content-Length":String(file.size),
    "Content-Disposition":`attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  }}));
}
