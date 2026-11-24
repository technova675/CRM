// Talent pool: creator applications stored in the creators table. Pure helpers shared by the API, the page and the importer.
import type {Influencer} from "../types.ts";

export const CREATOR_STATUSES=["pending","approved","featured","rejected","archived"] as const;
export const TALENT_TYPES=["influencer","creator","both","model"] as const;
export type CreatorStatus=typeof CREATOR_STATUSES[number];
export type TalentType=typeof TALENT_TYPES[number];
export const STATUS_LABEL:Record<CreatorStatus,string>={pending:"Pending review",approved:"Approved",featured:"Featured",rejected:"Rejected",archived:"Archived"};
export const TALENT_LABEL:Record<TalentType,string>={influencer:"Influencer",creator:"UGC creator",both:"Influencer + UGC",model:"Model"};

/** Columns the CRM reads. submitted_ip and submitted_user_agent are deliberately left out. */
export const CREATOR_COLUMNS="id,created_at,updated_at,full_name,display_name,email,phone,whatsapp,profile_photo_path,bio,city,state,country,languages,primary_genre,secondary_genres,content_formats,instagram_handle,youtube_handle,tiktok_handle,x_handle,linkedin_url,portfolio_url,instagram_followers,youtube_subscribers,tiktok_followers,x_followers,avg_reel_views,engagement_rate,verified_at,audience_female_pct,audience_age_band,audience_top_cities,currency,rate_reel,rate_story,rate_static_post,rate_youtube_integration,rate_video,barter_open,past_brands,notable_work_urls,showcase_media_paths,status,internal_notes,quality_score,managed_exclusively,talent_type,turnaround_days,roster_influencer_id,effective_followers,effective_engagement_rate,is_verified";

export type CreatorRow={id:string;created_at:string;updated_at:string;full_name:string;display_name:string|null;email:string;phone:string|null;whatsapp:string|null;profile_photo_path:string|null;bio:string|null;city:string|null;state:string|null;country:string;languages:string[];primary_genre:string;secondary_genres:string[];content_formats:string[];instagram_handle:string|null;youtube_handle:string|null;tiktok_handle:string|null;x_handle:string|null;linkedin_url:string|null;portfolio_url:string|null;instagram_followers:number|null;youtube_subscribers:number|null;tiktok_followers:number|null;x_followers:number|null;avg_reel_views:number|null;engagement_rate:number|string|null;verified_at:string|null;audience_female_pct:number|string|null;audience_age_band:string|null;audience_top_cities:string[];currency:string;rate_reel:number|null;rate_story:number|null;rate_static_post:number|null;rate_youtube_integration:number|null;rate_video:number|null;barter_open:boolean;past_brands:string[];notable_work_urls:string[];showcase_media_paths:string[];status:CreatorStatus;internal_notes:string|null;quality_score:number|null;managed_exclusively:boolean;talent_type:TalentType;turnaround_days:number|null;roster_influencer_id:string|null;effective_followers:number|null;effective_engagement_rate:number|string|null;is_verified:boolean};

export type Media={url:string;kind:"image"|"video"|"file"};
export type Creator={
  id:string;createdAt:string;updatedAt:string;name:string;displayName?:string;email:string;phone?:string;whatsapp?:string;photo?:string;bio?:string;
  city?:string;state?:string;country:string;languages:string[];genre:string;otherGenres:string[];formats:string[];
  handles:{instagram?:string;youtube?:string;tiktok?:string;x?:string;linkedin?:string;portfolio?:string};
  followers:{instagram:number|null;youtube:number|null;tiktok:number|null;x:number|null;best:number};avgReelViews:number|null;engagement:number|null;verified:boolean;
  audience:{femalePct:number|null;ageBand?:string;topCities:string[]};currency:string;
  rates:{reel:number|null;story:number|null;post:number|null;youtube:number|null;video:number|null};barter:boolean;turnaroundDays:number|null;
  pastBrands:string[];workLinks:string[];showcase:Media[];status:CreatorStatus;notes:string;quality:number|null;exclusive:boolean;type:TalentType;rosterId?:string;
};

const n=(v:number|string|null)=>v===null||v===""?null:Number(v);
const opt=(v:string|null)=>v?.trim()||undefined;
const kindOf=(path:string):Media["kind"]=>/\.(jpe?g|png|webp|gif|avif)$/i.test(path)?"image":/\.(mp4|mov|webm|m4v)$/i.test(path)?"video":"file";
/** Files are object keys on the old site's public media host; the base address is configuration. */
export function mediaUrl(base:string|undefined,path:string|null|undefined){
  if(!path)return undefined;
  if(/^https:\/\//i.test(path))return path;
  const b=base?.trim().replace(/\/+$/,"");
  return b&&/^https:\/\//i.test(b)?`${b}/${path.replace(/^\/+/,"").split("/").map(encodeURIComponent).join("/")}`:undefined;
}
const safeLink=(v:string|null|undefined)=>{const s=v?.trim();if(!s)return undefined;try{const u=new URL(/^https?:\/\//i.test(s)?s:`https://${s}`);return u.protocol==="https:"||u.protocol==="http:"?u.href:undefined;}catch{return undefined;}};

export function toCreator(r:CreatorRow,mediaBase?:string):Creator{
  return {id:r.id,createdAt:r.created_at,updatedAt:r.updated_at,name:r.full_name,displayName:opt(r.display_name),email:r.email,phone:opt(r.phone),whatsapp:opt(r.whatsapp),photo:mediaUrl(mediaBase,r.profile_photo_path),bio:opt(r.bio),
    city:opt(r.city),state:opt(r.state),country:r.country,languages:r.languages??[],genre:r.primary_genre,otherGenres:(r.secondary_genres??[]).filter(g=>g!==r.primary_genre),formats:r.content_formats??[],
    handles:{instagram:opt(r.instagram_handle)?.replace(/^@/,""),youtube:opt(r.youtube_handle),tiktok:opt(r.tiktok_handle),x:opt(r.x_handle),linkedin:safeLink(r.linkedin_url),portfolio:safeLink(r.portfolio_url)},
    followers:{instagram:r.instagram_followers,youtube:r.youtube_subscribers,tiktok:r.tiktok_followers,x:r.x_followers,best:r.effective_followers??0},avgReelViews:r.avg_reel_views,engagement:n(r.effective_engagement_rate),verified:r.is_verified,
    audience:{femalePct:n(r.audience_female_pct),ageBand:opt(r.audience_age_band),topCities:r.audience_top_cities??[]},currency:r.currency,
    rates:{reel:r.rate_reel,story:r.rate_story,post:r.rate_static_post,youtube:r.rate_youtube_integration,video:r.rate_video},barter:r.barter_open,turnaroundDays:r.turnaround_days,
    pastBrands:r.past_brands??[],workLinks:(r.notable_work_urls??[]).map(safeLink).filter((u):u is string=>!!u),
    showcase:(r.showcase_media_paths??[]).flatMap(p=>{const url=mediaUrl(mediaBase,p);return url?[{url,kind:kindOf(p)}]:[];}),
    status:r.status,notes:r.internal_notes??"",quality:r.quality_score,exclusive:r.managed_exclusively,type:r.talent_type,rosterId:opt(r.roster_influencer_id)};
}

/** The roster profile created from an application. Figures the creator typed are kept, labelled as self-reported. */
export function rosterRecord(c:Creator,id:string,at:string):Influencer{
  const followers=c.followers.best||null,price=c.rates.reel??c.rates.post??c.rates.video??c.rates.story??c.rates.youtube;
  const platform=c.handles.instagram?"Instagram":c.handles.youtube?"YouTube":c.handles.x?"X":c.handles.linkedin?"LinkedIn":"Instagram";
  const rates=[["Reel",c.rates.reel],["Story",c.rates.story],["Static post",c.rates.post],["YouTube integration",c.rates.youtube],["UGC video",c.rates.video]].filter(([,v])=>v!==null).map(([k,v])=>`${k}: ₹${Number(v).toLocaleString("en-IN")}`);
  return {id,crmVersion:2,updatedAt:at,name:c.displayName||c.name,platform,
    profileUrl:c.handles.instagram?`https://www.instagram.com/${c.handles.instagram}/`:c.handles.portfolio??"",
    instagram:c.handles.instagram?`@${c.handles.instagram}`:undefined,youtube:c.handles.youtube,email:c.email,phone:c.phone,
    category:[c.genre,...c.otherGenres].join(", "),location:[c.city,c.state].filter(Boolean).join(", ")||c.country,
    followers:followers??0,engagement:c.engagement??0,pricePerPost:price??0,performanceScore:0,
    profileData:{followers,engagement:c.engagement,pricePerPost:price,performanceScore:null,source:"Talent pool application · self-reported",sourceUrl:"",observedOn:c.createdAt.slice(0,10)},
    contentTypes:c.formats,availability:"Available",verification:c.verified?"Verified":"Unverified",previousProjects:c.pastBrands,
    audienceNotes:[c.audience.ageBand&&`Age ${c.audience.ageBand}`,c.audience.femalePct!==null&&`${c.audience.femalePct}% female`,c.audience.topCities.length&&`Top cities: ${c.audience.topCities.join(", ")}`].filter(Boolean).join(" · "),
    pricingNotes:[...rates,c.barter&&"Open to barter",c.turnaroundDays&&`Turnaround ${c.turnaroundDays} days`].filter(Boolean).join(" · "),
    notes:[c.bio,c.notes&&`Internal: ${c.notes}`].filter(Boolean).join("\n\n")};
}

/** Parses one row of the old site's CSV export (Supabase "Download as CSV"): arrays come as JSON text, empty cells as "". */
export function creatorFromCsv(raw:Record<string,string>,owner:string){
  const list=(v:string)=>{if(!v?.trim())return[];try{const p=JSON.parse(v);return Array.isArray(p)?p.map(String).map(s=>s.trim()).filter(Boolean):[];}catch{return v.replace(/^\{|\}$/g,"").split(",").map(s=>s.replace(/^"|"$/g,"").trim()).filter(Boolean);}};
  const text=(v:string)=>v?.trim()?v.trim():null;
  const int=(v:string)=>v?.trim()?Math.round(Number(v)):null;
  const dec=(v:string)=>v?.trim()?Number(v):null;
  const bool=(v:string)=>v==="true"||v==="t";
  const date=(v:string)=>v?.trim()?new Date(v.replace(" ","T").replace(/\+00$/,"Z")).toISOString():null;
  const status=(CREATOR_STATUSES as readonly string[]).includes(raw.status)?raw.status:"pending";
  const type=raw.talent_type==="ugc_creator"?"creator":(TALENT_TYPES as readonly string[]).includes(raw.talent_type)?raw.talent_type:"influencer";
  return {id:raw.id,owner_id:owner,created_at:date(raw.created_at)??new Date().toISOString(),updated_at:date(raw.updated_at)??new Date().toISOString(),
    full_name:raw.full_name.trim(),display_name:text(raw.display_name),email:raw.email.trim(),phone:text(raw.phone),whatsapp:text(raw.whatsapp),profile_photo_path:text(raw.profile_photo_path),bio:text(raw.bio),
    city:text(raw.city),state:text(raw.state),country:text(raw.country)??"India",languages:list(raw.languages),primary_genre:text(raw.primary_genre)??"Other",secondary_genres:list(raw.secondary_genres),content_formats:list(raw.content_formats),
    instagram_handle:text(raw.instagram_handle),youtube_handle:text(raw.youtube_handle),tiktok_handle:text(raw.tiktok_handle),x_handle:text(raw.x_handle),linkedin_url:text(raw.linkedin_url),portfolio_url:text(raw.portfolio_url),
    instagram_followers:int(raw.instagram_followers),youtube_subscribers:int(raw.youtube_subscribers),tiktok_followers:int(raw.tiktok_followers),x_followers:int(raw.x_followers),avg_reel_views:int(raw.avg_reel_views),engagement_rate:dec(raw.engagement_rate),
    verified_instagram_followers:int(raw.verified_instagram_followers),verified_youtube_subscribers:int(raw.verified_youtube_subscribers),verified_engagement_rate:dec(raw.verified_engagement_rate),verified_at:date(raw.verified_at),
    audience_female_pct:dec(raw.audience_female_pct),audience_age_band:text(raw.audience_age_band),audience_top_cities:list(raw.audience_top_cities),currency:text(raw.currency)??"INR",
    rate_reel:int(raw.rate_reel),rate_story:int(raw.rate_story),rate_static_post:int(raw.rate_static_post),rate_youtube_integration:int(raw.rate_youtube_integration),rate_video:int(raw.rate_video),
    barter_open:bool(raw.barter_open),past_brands:list(raw.past_brands),notable_work_urls:list(raw.notable_work_urls),showcase_media_paths:list(raw.showcase_media_paths),
    status,internal_notes:text(raw.internal_notes),quality_score:int(raw.quality_score),managed_exclusively:bool(raw.managed_exclusively),talent_type:type,turnaround_days:int(raw.turnaround_days),
    talent_type_changed_at:date(raw.talent_type_changed_at),submitted_ip:text(raw.submitted_ip),submitted_user_agent:text(raw.submitted_user_agent)};
}
