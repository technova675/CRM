// Posting through each network's official API. Each publisher receives a checked post and a live token, and returns
// the network's id and a link to the live post. Errors from the network are reported in plain words.
import "server-only";
import {fetchPublicMedia} from "../ai/publicResearch";
import {fullText,mediaKind,postTypeOf} from "../domain/socialPublishing";
import type {SocialPost} from "../types";
import {GRAPH,REDDIT_UA,THREADS,TIMEOUT} from "./oauth";
import type {Secret} from "./connections";

export type Published={id:string;url?:string};
/** definite=false means the network may have published even though we saw an error (a timeout on the final call). */
export class PublishError extends Error{readonly definite:boolean;readonly reconnect:boolean;constructor(message:string,definite=true,reconnect=false){super(message);this.definite=definite;this.reconnect=reconnect;}}

const IMAGE_MAX=20e6,VIDEO_MAX=500e6;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function call<T>(url:string,init:RequestInit&{final?:boolean}={}):Promise<T>{
  let r:Response;
  try{r=await fetch(url,{...init,signal:init.signal??AbortSignal.timeout(init.final?90_000:TIMEOUT),cache:"no-store"});}
  catch{throw new PublishError("The network did not answer in time.",!init.final);}
  const text=await r.text(),body=(()=>{try{return text?JSON.parse(text):{};}catch{return {raw:text};}})();
  if(!r.ok){
    const e=body as {error?:{message?:string;error_user_msg?:string}|string;message?:string;detail?:string;errors?:{message?:string}[];json?:{errors?:string[][]}};
    const msg=typeof e.error==="object"?e.error.error_user_msg??e.error.message:e.error||e.detail||e.message||e.errors?.[0]?.message||e.json?.errors?.[0]?.join(" ")||`HTTP ${r.status}`;
    throw new PublishError(String(msg).slice(0,300),true,r.status===401);
  }
  return Object.assign(body,{__headers:r.headers}) as T;
}
const form=(o:Record<string,string|number|boolean|undefined>)=>new URLSearchParams(Object.entries(o).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)]));
const images=(p:SocialPost)=>(p.mediaUrls??[]).filter(u=>mediaKind(u)!=="video");
const video=(p:SocialPost)=>(p.mediaUrls??[]).find(u=>mediaKind(u)==="video")??(p.mediaUrls??[])[0];
const isVideo=(p:SocialPost)=>postTypeOf(p).includes("ideo");
const hasText=(p:SocialPost)=>postTypeOf(p)==="Text only"||postTypeOf(p).startsWith("Text +");
const text=(p:SocialPost)=>hasText(p)?fullText(p):"";

// ---------- Facebook Page (Graph API) ----------
async function facebook(p:SocialPost,s:Secret):Promise<Published>{
  const page=s.accountId,t=s.token,message=text(p);
  if(isVideo(p)){
    const r=await call<{id:string}>(`${GRAPH.replace("graph.","graph-video.")}/${page}/videos`,{method:"POST",body:form({file_url:video(p),description:message,access_token:t}),final:true});
    return {id:r.id,url:`https://www.facebook.com/${page}/videos/${r.id}`};
  }
  const imgs=images(p);
  if(imgs.length===1){const r=await call<{id:string;post_id?:string}>(`${GRAPH}/${page}/photos`,{method:"POST",body:form({url:imgs[0],caption:message,access_token:t}),final:true});return {id:r.post_id??r.id,url:`https://www.facebook.com/${r.post_id??r.id}`};}
  const attached:Record<string,string>={};
  for(const [i,url] of imgs.entries()){const r=await call<{id:string}>(`${GRAPH}/${page}/photos`,{method:"POST",body:form({url,published:false,access_token:t})});attached[`attached_media[${i}]`]=JSON.stringify({media_fbid:r.id});}
  const r=await call<{id:string}>(`${GRAPH}/${page}/feed`,{method:"POST",body:form({message,...attached,access_token:t}),final:true});
  return {id:r.id,url:`https://www.facebook.com/${r.id}`};
}

// ---------- Instagram (content publishing through the Graph API) ----------
async function waitContainer(base:string,id:string,token:string,field:"status_code"|"status"){
  for(let i=0;i<40;i++){
    const r=await call<{status_code?:string;status?:string;error_message?:string}>(`${base}/${id}?${form({fields:field==="status"?"status,error_message":"status_code",access_token:token})}`);
    const st=r[field];if(st==="FINISHED")return;if(st==="ERROR"||st==="EXPIRED")throw new PublishError(`The network could not process the media${r.error_message?`: ${r.error_message}`:"."}`);
    await sleep(i<5?2000:5000);
  }
  throw new PublishError("The network is still processing the video. Try publishing again in a few minutes.");
}
async function instagram(p:SocialPost,s:Secret):Promise<Published>{
  const ig=s.igUserId??s.accountId,t=s.token,caption=text(p);
  let creation:string;
  if(isVideo(p)){
    creation=(await call<{id:string}>(`${GRAPH}/${ig}/media`,{method:"POST",body:form({media_type:"REELS",video_url:video(p),caption,access_token:t})})).id;
    await waitContainer(GRAPH,creation,t,"status_code");
  }else{
    const imgs=images(p);
    if(imgs.length===1)creation=(await call<{id:string}>(`${GRAPH}/${ig}/media`,{method:"POST",body:form({image_url:imgs[0],caption,access_token:t})})).id;
    else{
      const children:string[]=[];
      for(const url of imgs)children.push((await call<{id:string}>(`${GRAPH}/${ig}/media`,{method:"POST",body:form({image_url:url,is_carousel_item:true,access_token:t})})).id);
      creation=(await call<{id:string}>(`${GRAPH}/${ig}/media`,{method:"POST",body:form({media_type:"CAROUSEL",children:children.join(","),caption,access_token:t})})).id;
    }
    await waitContainer(GRAPH,creation,t,"status_code");
  }
  const r=await call<{id:string}>(`${GRAPH}/${ig}/media_publish`,{method:"POST",body:form({creation_id:creation,access_token:t}),final:true});
  const link=await call<{permalink?:string}>(`${GRAPH}/${r.id}?${form({fields:"permalink",access_token:t})}`).catch(()=>({permalink:undefined}));
  return {id:r.id,url:link.permalink};
}

// ---------- Threads ----------
async function threads(p:SocialPost,s:Secret):Promise<Published>{
  const user=s.accountId,t=s.token,body=text(p),type=postTypeOf(p);let creation:string;
  const make=(o:Record<string,string|boolean|undefined>)=>call<{id:string}>(`${THREADS}/${user}/threads`,{method:"POST",body:form({...o,access_token:t})}).then(r=>r.id);
  if(type==="Text only")creation=await make({media_type:"TEXT",text:body});
  else if(isVideo(p))creation=await make({media_type:"VIDEO",video_url:video(p),text:body||undefined});
  else{const imgs=images(p);
    if(imgs.length===1)creation=await make({media_type:"IMAGE",image_url:imgs[0],text:body||undefined});
    else{const kids:string[]=[];for(const url of imgs)kids.push(await make({media_type:"IMAGE",image_url:url,is_carousel_item:true}));creation=await make({media_type:"CAROUSEL",children:kids.join(","),text:body||undefined});}}
  await waitContainer(THREADS,creation,t,"status");
  const r=await call<{id:string}>(`${THREADS}/${user}/threads_publish`,{method:"POST",body:form({creation_id:creation,access_token:t}),final:true});
  const link=await call<{permalink?:string}>(`${THREADS}/${r.id}?${form({fields:"permalink",access_token:t})}`).catch(()=>({permalink:undefined}));
  return {id:r.id,url:link.permalink};
}

// ---------- LinkedIn (Posts API) ----------
const LI="https://api.linkedin.com/rest",liHeaders=(t:string)=>({Authorization:`Bearer ${t}`,"LinkedIn-Version":process.env.LINKEDIN_VERSION||"202510","X-Restli-Protocol-Version":"2.0.0","Content-Type":"application/json"});
/** LinkedIn's "little text" format treats these characters as markup unless escaped. */
export const linkedinText=(s:string)=>s.replace(/[\\|{}@[\]()<>#*_~]/g,c=>"\\"+c);
async function linkedin(p:SocialPost,s:Secret):Promise<Published>{
  const author=s.accountId,t=s.token;let content:unknown;
  if(isVideo(p)){
    const file=await fetchPublicMedia(video(p)!,VIDEO_MAX);
    const init=await call<{value:{video:string;uploadToken:string;uploadInstructions:{uploadUrl:string;firstByte:number;lastByte:number}[]}}>(`${LI}/videos?action=initializeUpload`,{method:"POST",headers:liHeaders(t),body:JSON.stringify({initializeUploadRequest:{owner:author,fileSizeBytes:file.bytes.length,uploadCaptions:false,uploadThumbnail:false}})});
    const etags:string[]=[];
    for(const part of init.value.uploadInstructions){
      const r=await fetch(part.uploadUrl,{method:"PUT",headers:{"Content-Type":"application/octet-stream"},body:new Uint8Array(file.bytes.subarray(part.firstByte,part.lastByte+1)),signal:AbortSignal.timeout(120_000)});
      if(!r.ok)throw new PublishError(`LinkedIn rejected the video upload (HTTP ${r.status}).`);etags.push(r.headers.get("etag")??"");
    }
    await call(`${LI}/videos?action=finalizeUpload`,{method:"POST",headers:liHeaders(t),body:JSON.stringify({finalizeUploadRequest:{video:init.value.video,uploadToken:init.value.uploadToken,uploadedPartIds:etags}})});
    content={media:{title:p.title.slice(0,200),id:init.value.video}};
  }else if(postTypeOf(p)!=="Text only"){
    const ids:string[]=[];
    for(const url of images(p)){
      const file=await fetchPublicMedia(url,IMAGE_MAX);
      const init=await call<{value:{uploadUrl:string;image:string}}>(`${LI}/images?action=initializeUpload`,{method:"POST",headers:liHeaders(t),body:JSON.stringify({initializeUploadRequest:{owner:author}})});
      const r=await fetch(init.value.uploadUrl,{method:"PUT",headers:{Authorization:`Bearer ${t}`,"Content-Type":file.contentType},body:new Uint8Array(file.bytes),signal:AbortSignal.timeout(60_000)});
      if(!r.ok)throw new PublishError(`LinkedIn rejected an image upload (HTTP ${r.status}).`);ids.push(init.value.image);
    }
    content=ids.length===1?{media:{id:ids[0]}}:{multiImage:{images:ids.map(id=>({id}))}};
  }
  const r=await call<{__headers:Headers}>(`${LI}/posts`,{method:"POST",headers:liHeaders(t),final:true,body:JSON.stringify({author,commentary:linkedinText(text(p)),visibility:"PUBLIC",
    distribution:{feedDistribution:"MAIN_FEED",targetEntities:[],thirdPartyDistributionChannels:[]},lifecycleState:"PUBLISHED",isReshareDisabledByAuthor:false,...(content?{content}:{})})});
  const id=r.__headers.get("x-restli-id")??"";return {id,url:id?`https://www.linkedin.com/feed/update/${id}`:undefined};
}

// ---------- X (API v2) ----------
async function xMedia(url:string,t:string,video:boolean){
  const file=await fetchPublicMedia(url,video?VIDEO_MAX:IMAGE_MAX),auth={Authorization:`Bearer ${t}`};
  if(!video){
    const fd=new FormData();fd.append("media",new Blob([new Uint8Array(file.bytes)],{type:file.contentType}));fd.append("media_category","tweet_image");
    return (await call<{data:{id:string}}>("https://api.x.com/2/media/upload",{method:"POST",headers:auth,body:fd})).data.id;
  }
  const init=await call<{data:{id:string}}>("https://api.x.com/2/media/upload/initialize",{method:"POST",headers:{...auth,"Content-Type":"application/json"},body:JSON.stringify({media_type:file.contentType||"video/mp4",total_bytes:file.bytes.length,media_category:"tweet_video"})});
  const id=init.data.id,CHUNK=4*1024*1024;
  for(let i=0,seg=0;i<file.bytes.length;i+=CHUNK,seg++){
    const fd=new FormData();fd.append("media",new Blob([new Uint8Array(file.bytes.subarray(i,i+CHUNK))]));fd.append("segment_index",String(seg));
    await call(`https://api.x.com/2/media/upload/${id}/append`,{method:"POST",headers:auth,body:fd});
  }
  let info=(await call<{data:{processing_info?:{state:string;check_after_secs?:number;error?:{message?:string}}}}>(`https://api.x.com/2/media/upload/${id}/finalize`,{method:"POST",headers:auth})).data.processing_info;
  for(let i=0;info&&info.state!=="succeeded"&&i<40;i++){
    if(info.state==="failed")throw new PublishError(`X could not process the video${info.error?.message?`: ${info.error.message}`:"."}`);
    await sleep((info.check_after_secs??3)*1000);
    info=(await call<{data:{processing_info?:typeof info}}>(`https://api.x.com/2/media/upload?${form({media_id:id,command:"STATUS"})}`,{headers:auth})).data.processing_info;
  }
  if(info&&info.state!=="succeeded")throw new PublishError("X is still processing the video. Try again in a few minutes.");
  return id;
}
async function x(p:SocialPost,s:Secret):Promise<Published>{
  const ids:string[]=[];
  if(isVideo(p))ids.push(await xMedia(video(p)!,s.token,true));
  else if(postTypeOf(p)!=="Text only")for(const url of images(p))ids.push(await xMedia(url,s.token,false));
  const r=await call<{data:{id:string}}>("https://api.x.com/2/tweets",{method:"POST",final:true,headers:{Authorization:`Bearer ${s.token}`,"Content-Type":"application/json"},body:JSON.stringify({...(text(p)?{text:text(p)}:{}),...(ids.length?{media:{media_ids:ids}}:{})})});
  return {id:r.data.id,url:`https://x.com/i/web/status/${r.data.id}`};
}

// ---------- Reddit ----------
const RD="https://oauth.reddit.com",rdHeaders=(t:string)=>({Authorization:`Bearer ${t}`,"User-Agent":REDDIT_UA});
type RedditSubmit={json:{errors:string[][];data?:{url?:string;name?:string;id?:string}}};
function redditResult(r:RedditSubmit):Published{
  if(r.json.errors?.length)throw new PublishError(`Reddit refused the post: ${r.json.errors.map(e=>e.slice(1).join(" ")).join("; ")}`);
  return {id:r.json.data?.name??r.json.data?.id??"",url:r.json.data?.url};
}
async function redditAsset(url:string,t:string){
  const file=await fetchPublicMedia(url,IMAGE_MAX);
  const lease=await call<{args:{action:string;fields:{name:string;value:string}[]};asset:{asset_id:string}}>(`${RD}/api/media/asset.json`,{method:"POST",headers:rdHeaders(t),body:form({filepath:`image.${file.contentType.split("/")[1]??"jpg"}`,mimetype:file.contentType})});
  const fd=new FormData();for(const f of lease.args.fields)fd.append(f.name,f.value);fd.append("file",new Blob([new Uint8Array(file.bytes)],{type:file.contentType}));
  const action=lease.args.action.startsWith("//")?`https:${lease.args.action}`:lease.args.action,up=await fetch(action,{method:"POST",body:fd,signal:AbortSignal.timeout(60_000)});
  if(!up.ok&&up.status!==201)throw new PublishError(`Reddit rejected the image upload (HTTP ${up.status}).`);
  const key=lease.args.fields.find(f=>f.name==="key")?.value;
  return {assetId:lease.asset.asset_id,url:`${action}/${key}`};
}
async function reddit(p:SocialPost,s:Secret):Promise<Published>{
  const sr=(p.subreddit??"").replace(/^r\//i,""),title=p.title.slice(0,300),t=s.token,body=hasText(p)?fullText(p):"";
  if(postTypeOf(p)==="Text only")return redditResult(await call<RedditSubmit>(`${RD}/api/submit`,{method:"POST",final:true,headers:rdHeaders(t),body:form({sr,kind:"self",title,text:body,api_type:"json",resubmit:true})}));
  const assets=[];for(const url of images(p))assets.push(await redditAsset(url,t));
  if(assets.length===1)return redditResult(await call<RedditSubmit>(`${RD}/api/submit`,{method:"POST",final:true,headers:rdHeaders(t),body:form({sr,kind:"image",title,url:assets[0].url,api_type:"json",resubmit:true})}));
  return redditResult(await call<RedditSubmit>(`${RD}/api/submit_gallery_post.json`,{method:"POST",final:true,headers:{...rdHeaders(t),"Content-Type":"application/json"},body:JSON.stringify({sr,title,api_type:"json",show_error_list:true,items:assets.map(a=>({media_id:a.assetId,caption:"",outbound_url:""})),...(body?{text:body}:{})})}));
}

// ---------- YouTube (Data API v3, resumable upload) ----------
async function youtube(p:SocialPost,s:Secret):Promise<Published>{
  const file=await fetchPublicMedia(video(p)!,VIDEO_MAX);
  const meta={snippet:{title:p.title.slice(0,100),description:text(p).slice(0,5000),tags:(p.hashtags??[]).map(h=>h.replace(/^#/,"")).slice(0,15),categoryId:"22"},status:{privacyStatus:"public",selfDeclaredMadeForKids:false}};
  let start:Response;
  try{start=await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",{method:"POST",headers:{Authorization:`Bearer ${s.token}`,"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Type":file.contentType||"video/mp4","X-Upload-Content-Length":String(file.bytes.length)},body:JSON.stringify(meta),signal:AbortSignal.timeout(TIMEOUT)});}
  catch{throw new PublishError("YouTube did not answer in time.");}
  if(!start.ok){const e=await start.json().catch(()=>({})) as {error?:{message?:string}};throw new PublishError(e.error?.message??`YouTube refused the upload (HTTP ${start.status}).`,true,start.status===401);}
  const location=start.headers.get("location");if(!location)throw new PublishError("YouTube did not return an upload address.");
  const r=await call<{id:string}>(location,{method:"PUT",final:true,headers:{"Content-Type":file.contentType||"video/mp4"},body:new Uint8Array(file.bytes),signal:AbortSignal.timeout(240_000)});
  return {id:r.id,url:`https://www.youtube.com/watch?v=${r.id}`};
}

export const PUBLISHERS:Record<SocialPost["platform"],(p:SocialPost,s:Secret)=>Promise<Published>>={Facebook:facebook,Instagram:instagram,Threads:threads,LinkedIn:linkedin,X:x,Reddit:reddit,YouTube:youtube};
