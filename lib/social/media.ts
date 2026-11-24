// Post media lives in a public Cloudflare R2 bucket so Instagram, Threads and Facebook can fetch it by link.
// The browser uploads straight to R2 with a short-lived signed link: files never pass through the app server
// (Vercel limits request bodies to 4.5 MB). Size and type are part of the signature, so R2 rejects anything else.
import "server-only";
import {createHash,createHmac} from "node:crypto";

export const MEDIA_TYPES:Record<string,{ext:string;max:number;kind:"image"|"video"}>={
  "image/jpeg":{ext:"jpg",max:20e6,kind:"image"},"image/png":{ext:"png",max:20e6,kind:"image"},"image/webp":{ext:"webp",max:20e6,kind:"image"},"image/gif":{ext:"gif",max:15e6,kind:"image"},
  "video/mp4":{ext:"mp4",max:500e6,kind:"video"},"video/quicktime":{ext:"mov",max:500e6,kind:"video"},
};
const env=(k:string)=>process.env[k]?.trim()||"";
export function mediaStorageReady(){return !!(env("R2_ACCOUNT_ID")&&env("R2_ACCESS_KEY_ID")&&env("R2_SECRET_ACCESS_KEY")&&env("SOCIAL_MEDIA_BUCKET")&&/^https:\/\//.test(env("SOCIAL_MEDIA_PUBLIC_URL")));}
export const mediaStorageMissing=()=>["R2_ACCOUNT_ID","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","SOCIAL_MEDIA_BUCKET","SOCIAL_MEDIA_PUBLIC_URL"].filter(k=>!env(k));

const enc=(s:string)=>encodeURIComponent(s).replace(/[!'()*]/g,c=>"%"+c.charCodeAt(0).toString(16).toUpperCase());
const hmac=(key:Buffer|string,data:string)=>createHmac("sha256",key).update(data).digest();
/** AWS Signature V4 query-string presign for a PUT, as R2's S3 API expects. Pure for testing: pass `now`. */
export function presignPut(o:{account:string;accessKey:string;secret:string;bucket:string;key:string;contentType:string;size:number;expires:number;now?:Date}){
  const host=`${o.account}.r2.cloudflarestorage.com`,path=`/${o.bucket}/${o.key.split("/").map(enc).join("/")}`;
  const now=o.now??new Date(),amz=now.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,""),day=amz.slice(0,8),scope=`${day}/auto/s3/aws4_request`;
  const signed="content-length;content-type;host";
  const q:Record<string,string>={"X-Amz-Algorithm":"AWS4-HMAC-SHA256","X-Amz-Credential":`${o.accessKey}/${scope}`,"X-Amz-Date":amz,"X-Amz-Expires":String(o.expires),"X-Amz-SignedHeaders":signed};
  const query=Object.keys(q).sort().map(k=>`${enc(k)}=${enc(q[k])}`).join("&");
  const canonical=["PUT",path,query,`content-length:${o.size}\ncontent-type:${o.contentType}\nhost:${host}\n`,signed,"UNSIGNED-PAYLOAD"].join("\n");
  const toSign=["AWS4-HMAC-SHA256",amz,scope,createHash("sha256").update(canonical).digest("hex")].join("\n");
  const key=hmac(hmac(hmac(hmac("AWS4"+o.secret,day),"auto"),"s3"),"aws4_request");
  return `https://${host}${path}?${query}&X-Amz-Signature=${createHmac("sha256",key).update(toSign).digest("hex")}`;
}
export function uploadTarget(owner:string,clientId:string,contentType:string,size:number){
  const type=MEDIA_TYPES[contentType];
  if(!type)throw new Error("Upload JPG, PNG, WebP or GIF images, or MP4 or MOV videos.");
  if(!Number.isInteger(size)||size<=0||size>type.max)throw new Error(`${type.kind==="video"?"Videos":"Images"} can be up to ${Math.round(type.max/1e6)} MB.`);
  const hash=createHash("sha256").update(owner).digest("hex").slice(0,16),key=`social/${hash}/${clientId.replace(/[^A-Za-z0-9_-]/g,"").slice(0,64)}/${crypto.randomUUID()}.${type.ext}`;
  return {uploadUrl:presignPut({account:env("R2_ACCOUNT_ID"),accessKey:env("R2_ACCESS_KEY_ID"),secret:env("R2_SECRET_ACCESS_KEY"),bucket:env("SOCIAL_MEDIA_BUCKET"),key,contentType,size,expires:900}),
    publicUrl:`${env("SOCIAL_MEDIA_PUBLIC_URL").replace(/\/+$/,"")}/${key}`,kind:type.kind};
}
