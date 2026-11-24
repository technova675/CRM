// What each social network accepts through its publishing API, by post type, and the checks a post must pass
// before it can go to that network. Used by the post editor, the calendar upload and the publishing step.
import type {SocialPost,SocialPlatform} from "../types.ts";

export const POST_TYPES=["Text only","Image only","Text + images","Video only","Text + video"] as const;
export type PostType=typeof POST_TYPES[number];
export const NETWORKS:SocialPlatform[]=["Instagram","Facebook","LinkedIn","X","Threads","Reddit","YouTube"];

type Rule={ok:boolean;why?:string};
/** Support through each network's official publishing API (not what the phone app allows). */
export const SUPPORT:Record<SocialPlatform,Record<PostType,Rule>>={
  Instagram:{"Text only":{ok:false,why:"Instagram posts need a photo or video."},"Image only":{ok:true},"Text + images":{ok:true},"Video only":{ok:true},"Text + video":{ok:true}},
  Facebook:{"Text only":{ok:true},"Image only":{ok:true},"Text + images":{ok:true},"Video only":{ok:true},"Text + video":{ok:true}},
  LinkedIn:{"Text only":{ok:true},"Image only":{ok:true},"Text + images":{ok:true},"Video only":{ok:true},"Text + video":{ok:true}},
  X:{"Text only":{ok:true},"Image only":{ok:true},"Text + images":{ok:true},"Video only":{ok:true},"Text + video":{ok:true}},
  Threads:{"Text only":{ok:true},"Image only":{ok:true},"Text + images":{ok:true},"Video only":{ok:true},"Text + video":{ok:true}},
  Reddit:{"Text only":{ok:true},"Image only":{ok:true},"Text + images":{ok:true},"Video only":{ok:false,why:"Reddit's API does not support video uploads. Share the video as a link post instead."},"Text + video":{ok:false,why:"Reddit's API does not support video uploads. Share the video as a link post instead."}},
  YouTube:{"Text only":{ok:false,why:"YouTube only accepts video uploads; community text posts cannot be published through its API."},"Image only":{ok:false,why:"YouTube only accepts video uploads."},"Text + images":{ok:false,why:"YouTube only accepts video uploads."},"Video only":{ok:true},"Text + video":{ok:true}},
};
/** Limits that make a post fail at the network. Text is the caption plus hashtags as they will be posted. */
export const LIMITS:Record<SocialPlatform,{text:number;images:number;title?:number}>={
  Instagram:{text:2200,images:10},Facebook:{text:63206,images:10},LinkedIn:{text:3000,images:20},X:{text:280,images:4},
  Threads:{text:500,images:20},Reddit:{text:40000,images:20,title:300},YouTube:{text:5000,images:0,title:100},
};
export const supports=(network:SocialPlatform,type:PostType)=>SUPPORT[network][type].ok;
export const networksFor=(type:PostType)=>NETWORKS.filter(n=>supports(n,type));

const VIDEO=/\.(mp4|mov|m4v|webm)(\?|#|$)/i,IMAGE=/\.(jpe?g|png|webp|gif|heic)(\?|#|$)/i;
export const mediaKind=(url:string)=>VIDEO.test(url)?"video":IMAGE.test(url)?"image":"unknown";
/** Best guess for posts created before post types existed. */
export function postTypeOf(p:Pick<SocialPost,"postType"|"format"|"caption"|"mediaUrls">):PostType{
  if(p.postType)return p.postType;
  const text=!!p.caption?.trim(),media=p.mediaUrls??[];
  const video=["Reel","Short"].includes(p.format)||media.some(u=>mediaKind(u)==="video");
  if(p.format==="Text"&&!media.length)return "Text only";
  return video?(text?"Text + video":"Video only"):(text?"Text + images":"Image only");
}
export const fullText=(p:Pick<SocialPost,"caption"|"hashtags">)=>[p.caption?.trim(),(p.hashtags??[]).join(" ")].filter(Boolean).join("\n\n");

/** Everything that would stop this post from going to its network, in plain words. Empty means ready. */
export function postIssues(p:Pick<SocialPost,"platform"|"postType"|"format"|"title"|"caption"|"hashtags"|"mediaUrls"|"subreddit">):string[]{
  const type=postTypeOf(p),rule=SUPPORT[p.platform]?.[type],limit=LIMITS[p.platform],issues:string[]=[];
  if(!rule)return [`${p.platform} is not a supported network.`];
  if(!rule.ok)return [rule.why!];
  const media=p.mediaUrls??[],kinds=media.map(mediaKind),text=fullText(p);
  const wantsText=type==="Text only"||type.startsWith("Text +"),wantsImages=type.includes("mage"),wantsVideo=type.includes("ideo");
  if(wantsText&&!p.caption?.trim())issues.push("Add the post text.");
  if(!wantsText&&p.caption?.trim()&&p.platform!=="YouTube"&&p.platform!=="Reddit")issues.push(`This is a "${type}" post, so the text will not be published. Change the type to include text.`);
  if(type==="Text only"&&media.length)issues.push("Text-only posts cannot carry media. Remove the files or change the type.");
  if(wantsImages&&!media.length)issues.push("Add at least one image.");
  if(wantsImages&&kinds.includes("video"))issues.push("Image posts cannot include a video file.");
  if(wantsImages&&media.length>limit.images)issues.push(`${p.platform} allows up to ${limit.images} images in one post.`);
  if(wantsVideo&&kinds.filter(k=>k==="video").length!==1&&!(media.length===1&&kinds[0]==="unknown"))issues.push("Add exactly one video file (.mp4 or .mov).");
  if(wantsVideo&&kinds.includes("image"))issues.push("Video posts cannot mix in images.");
  if(text.length>limit.text)issues.push(`${p.platform} allows ${limit.text.toLocaleString("en-IN")} characters; this post has ${text.length.toLocaleString("en-IN")} with hashtags.`);
  if(limit.title&&!p.title?.trim())issues.push(`${p.platform} needs a title.`);
  if(limit.title&&(p.title?.trim().length??0)>limit.title)issues.push(`${p.platform} titles can be up to ${limit.title} characters.`);
  if(p.platform==="Reddit"&&!/^[A-Za-z0-9_]{2,21}$/.test((p.subreddit??"").replace(/^r\//i,"")))issues.push("Choose the subreddit to post in, for example r/IndiaInvestments.");
  return issues;
}

// ---------- Content calendar upload ----------
export type CalendarRow={row:number;title:string;platform:SocialPlatform;postType:PostType;caption:string;hashtags:string[];mediaUrls:string[];subreddit?:string;plannedAt?:string;pillar:string;campaign:string;issues:string[]};
const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const networkOf=(v:string):SocialPlatform|undefined=>{const s=norm(v);return s==="twitter"||s==="x twitter"||s==="x"?"X":s==="ig"?"Instagram":s==="fb"?"Facebook":s==="yt"?"YouTube":NETWORKS.find(n=>norm(n)===s);};
const typeOf=(v:string):PostType|undefined=>{const s=norm(v).replace(/\bwith\b|\band\b|\bplus\b/g," ").replace(/\s+/g," ");
  const text=/text|caption|copy/.test(s),image=/image|photo|picture|carousel|static/.test(s),video=/video|reel|short/.test(s);
  if(video)return text?"Text + video":"Video only";if(image)return text?"Text + images":"Image only";if(text)return "Text only";return undefined;};
/** Date "2026-12-05", "05/12/2026" (day first, as used in India) or "5 Dec 2026", with an optional time "18:30" or "6:30 pm", read in India time. */
export function plannedTime(date:string,time:string,offset="+05:30"):string|null{
  const d=date.trim();if(!d)return null;let y:number,m:number,day:number;
  let x=d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(x){y=+x[1];m=+x[2];day=+x[3];}
  else if((x=d.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))){day=+x[1];m=+x[2];y=+x[3];}
  else{const t=Date.parse(`${d} 12:00 UTC`);if(!Number.isFinite(t))return null;const u=new Date(t);y=u.getUTCFullYear();m=u.getUTCMonth()+1;day=u.getUTCDate();}
  let h=10,min=0;const tm=time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if(time.trim()&&!tm)return null;
  if(tm){h=+tm[1];min=tm[2]?+tm[2]:0;if(tm[3]){if(h>12)return null;h=h%12+(/pm/i.test(tm[3])?12:0);}}
  if(m<1||m>12||day<1||day>31||h>23||min>59)return null;
  const iso=`${y}-${String(m).padStart(2,"0")}-${String(day).padStart(2,"0")}T${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:00${offset}`;
  if(new Date(Date.UTC(y,m-1,day)).getUTCDate()!==day)return null;
  const at=new Date(iso);return Number.isNaN(at.getTime())?null:at.toISOString();
}
/** One row can name several networks ("Instagram, LinkedIn"); each becomes its own post so each can be checked and approved. */
export function calendarRows(rows:string[][],max=500):{posts:CalendarRow[];errors:string[]}{
  if(rows.length<2)return {posts:[],errors:["The file has no rows under the header."]};
  const head=rows[0].map(norm),col=(...names:string[])=>head.findIndex(h=>names.includes(h));
  const c={date:col("date","post date","publish date","day"),time:col("time","post time","publish time"),networks:col("networks","network","platforms","platform","channel","channels"),type:col("post type","type","format","content type"),
    title:col("title","post title","headline"),caption:col("text","caption","copy","post text","body"),hashtags:col("hashtags","tags"),media:col("media","media urls","media url","image urls","video url","images","video","link"),
    subreddit:col("subreddit"),pillar:col("pillar","content pillar","category","theme"),campaign:col("campaign")};
  const errors:string[]=[];
  if(c.networks<0)errors.push("Add a Networks column (for example: Instagram, LinkedIn).");
  if(c.type<0)errors.push("Add a Post type column (Text only, Image only, Text + images, Video only or Text + video).");
  if(errors.length)return {posts:[],errors};
  const posts:CalendarRow[]=[];
  rows.slice(1).forEach((r,i)=>{
    const cell=(k:keyof typeof c)=>c[k]<0?"":(r[c[k]]??"").trim(),row=i+2;
    if(r.every(v=>!v?.trim()))return;
    const type=typeOf(cell("type")),names=cell("networks").split(/[,;|/]+/).map(s=>s.trim()).filter(Boolean);
    if(!type){errors.push(`Row ${row}: post type "${cell("type")||"(blank)"}" is not one of ${POST_TYPES.join(", ")}.`);return;}
    if(!names.length){errors.push(`Row ${row}: no network given.`);return;}
    const plannedAt=cell("date")?plannedTime(cell("date"),cell("time")):undefined;
    if(plannedAt===null){errors.push(`Row ${row}: date or time "${cell("date")} ${cell("time")}" is not readable. Use 2026-12-05 and 18:30.`);return;}
    const media=cell("media").split(/[\s,|]+/).filter(Boolean),bad=media.filter(u=>!/^https:\/\/[^\s]+$/i.test(u));
    const caption=cell("caption").slice(0,15000),title=(cell("title")||caption.split(/\n|\. /)[0]||`${type} post`).slice(0,300);
    for(const name of names){
      const platform=networkOf(name);
      if(!platform){errors.push(`Row ${row}: "${name}" is not a supported network (${NETWORKS.join(", ")}).`);continue;}
      const post={title,platform,postType:type,caption,hashtags:cell("hashtags").split(/[\s,]+/).filter(Boolean).map(h=>h.startsWith("#")?h:"#"+h).slice(0,40),mediaUrls:media.filter(u=>!bad.includes(u)).slice(0,20),
        subreddit:platform==="Reddit"?cell("subreddit").replace(/^r\//i,"")||undefined:undefined,plannedAt:plannedAt??undefined,pillar:(cell("pillar")||"General").slice(0,200),campaign:cell("campaign").slice(0,120),format:"Static" as SocialPost["format"]};
      const issues=[...(bad.length?[`Media links must start with https:// (${bad.length} skipped).`]:[]),...postIssues(post)];
      posts.push({row,...post,issues});
    }
  });
  if(posts.length>max){errors.push(`Only the first ${max} posts are imported. Split the calendar into smaller files.`);posts.length=max;}
  return {posts,errors};
}
/** The legacy format field, kept for older screens and reports. */
export const formatFor=(type:PostType,network:SocialPlatform):SocialPost["format"]=>type==="Text only"?"Text":type.includes("ideo")?(network==="YouTube"?"Short":"Reel"):type==="Image only"||network==="X"?"Static":"Carousel";
