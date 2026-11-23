"use client";
import {useState,type ReactNode} from "react";
import type {SocialPost} from "@/lib/types";
import {socialPlatforms,socialFormats} from "@/lib/domain/socialWorkspace";
import type {StudioTool} from "@/lib/domain/socialStudio";
import {Badge,Button,Card,Field,Input,Select,Textarea} from "@/components/ui";
import type {useStudio} from "./useStudio";

type Studio=ReturnType<typeof useStudio>;
type Output={title:string;hook:string;caption:string;cta:string;hashtags:string[];plan:string;items:{label:string;text:string;options:string[]}[];versions:{platform:string;format:string;title:string;hook:string;caption:string;hashtags:string[]}[];score:number|null;issues:string[]};
const TOOLS:{tool:StudioTool;label:string;topic:string;format:typeof socialFormats[number]}[]=[
  {tool:"script",label:"Reel / Short script",topic:"What is the video about?",format:"Reel"},
  {tool:"carousel",label:"Carousel",topic:"What should the carousel teach or show?",format:"Carousel"},
  {tool:"story",label:"Story sequence",topic:"What should the Stories cover?",format:"Story"},
  {tool:"poll",label:"Polls & quizzes",topic:"Topic for the polls or quizzes",format:"Story"},
  {tool:"headlines",label:"Hooks & headlines",topic:"Topic or post you need hooks for",format:"Static"},
  {tool:"cta",label:"Calls to action",topic:"What do you want people to do, and for what?",format:"Static"},
  {tool:"hashtags",label:"Hashtag research",topic:"Topic, product or post",format:"Static"},
  {tool:"repurpose",label:"Repurpose content",topic:"Paste the original content (caption, blog, script)",format:"Text"},
  {tool:"translate",label:"Translate",topic:"Paste the content to translate",format:"Static"},
  {tool:"voice-check",label:"Brand voice check",topic:"Paste the text to check",format:"Static"},
];
const LANGUAGES=["Hindi","Hinglish","Bengali","Tamil","Telugu","Marathi","Gujarati","Kannada","Malayalam","Punjabi","English"];

/** Content Studio: AI writing tools, saved ideas and drafts, generated images, bulk upload and brand voice memory. */
export function StudioTab({clientId,posts,studio,writable,cards,onGenerate}:{clientId:string;posts:SocialPost[];studio:Studio;writable:boolean;cards:(p:SocialPost[])=>ReactNode;onGenerate:()=>void}){
  const {data,act,busy}=studio;
  const [tool,setTool]=useState<StudioTool>("script"),[platform,setPlatform]=useState<typeof socialPlatforms[number]>("Instagram"),[targets,setTargets]=useState<string[]>(["LinkedIn","Facebook"]);
  const [topic,setTopic]=useState(""),[language,setLanguage]=useState("Hindi"),[count,setCount]=useState(5),[result,setResult]=useState<{output:Output;source:string;tool:StudioTool;claimWarnings:string[]}|null>(null);
  const [voiceDraft,setVoice]=useState<string|null>(null),[imagePrompt,setImagePrompt]=useState(""),[imagePost,setImagePost]=useState(""),[removing,setRemoving]=useState("");
  const voice=voiceDraft??data?.settings.brandVoice??"";
  const meta=TOOLS.find(t=>t.tool===tool)!,drafts=posts.filter(p=>["Idea","Draft"].includes(p.stage));
  const run=async()=>{setResult(null);const r=await act<{output:Output;source:string;claimWarnings:string[]}>("studio",{clientId,tool,platform,platforms:targets,topic,language,count});if(r)setResult({...r,tool});};
  const saveAs=(o:{title:string;hook:string;caption:string;hashtags:string[];plan?:string},p=platform,f=meta.format)=>act("save-studio",{clientId,platform:p,format:f,title:o.title||topic.slice(0,80),hook:o.hook,caption:[o.caption,result?.output.cta].filter(Boolean).join("\n\n"),hashtags:o.hashtags.map(h=>h.startsWith("#")?h:"#"+h),plan:o.plan??"",pillar:"General",source:result?.source??"AI studio"},"Saved as a draft post. Find it under Ideas & drafts below.");
  if(!data)return <p className="text-sm text-fg-2">Loading studio…</p>;
  const o=result?.output;
  return <div className="space-y-5">
    {writable&&<Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">AI writing tools</h2><p className="mt-1 text-sm text-fg-2">Every tool uses the client profile, AI knowledge base and brand voice notes below. Check facts and claims before approval.</p></div><Button className="min-h-11" variant="primary" onClick={onGenerate}>Generate full post ideas</Button></div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Writing tool">{TOOLS.map(t=><Button key={t.tool} className="min-h-11" size="sm" variant={tool===t.tool?"primary":"secondary"} aria-pressed={tool===t.tool} onClick={()=>{setTool(t.tool);setResult(null);}}>{t.label}</Button>)}</div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={tool==="repurpose"?"Original platform":"Platform"}><Select className="min-h-11" value={platform} onChange={e=>setPlatform(e.target.value as typeof platform)}>{socialPlatforms.map(p=><option key={p}>{p}</option>)}</Select></Field>
        {tool==="translate"&&<Field label="Language"><Select className="min-h-11" value={language} onChange={e=>setLanguage(e.target.value)}>{LANGUAGES.map(l=><option key={l}>{l}</option>)}</Select></Field>}
        {["poll","headlines","cta"].includes(tool)&&<Field label="How many"><Input className="min-h-11" type="number" min={1} max={10} value={count} onChange={e=>setCount(Math.min(10,Math.max(1,Number(e.target.value)||1)))}/></Field>}
      </div>
      {tool==="repurpose"&&<fieldset><legend className="mb-2 text-sm font-medium">Repurpose into</legend><div className="flex flex-wrap gap-2">{socialPlatforms.map(p=><label key={p} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm"><input type="checkbox" checked={targets.includes(p)} onChange={()=>setTargets(t=>t.includes(p)?t.filter(x=>x!==p):[...t,p])}/>{p}</label>)}</div></fieldset>}
      <Field label={meta.topic}><Textarea rows={tool==="repurpose"||tool==="translate"||tool==="voice-check"?6:3} value={topic} onChange={e=>setTopic(e.target.value)}/></Field>
      <Button className="min-h-11" variant="primary" loading={busy==="studio"} disabled={!!busy||topic.trim().length<3||!data.ai||(tool==="repurpose"&&!targets.length)} onClick={run}>Write {meta.label.toLowerCase()}</Button>
    </Card>}
    {o&&result&&<Card className="space-y-3 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{TOOLS.find(t=>t.tool===result.tool)?.label} · result</h3><span className="text-xs text-fg-2">{result.source} · AI draft</span></div>
      {result.claimWarnings.length>0&&<p role="note" className="rounded-lg border border-warning/40 p-3 text-sm text-warning">Check before sharing: {result.claimWarnings.join(", ")} {result.claimWarnings.length>1?"are":"is"} not in the client&apos;s profile or knowledge base. Remove {result.claimWarnings.length>1?"them":"it"} unless the client confirms.</p>}
      {o.score!==null&&<p className="text-sm"><Badge tone={o.score>=75?"success":o.score>=50?"warning":"danger"}>Brand voice {o.score}/100</Badge> <span className="text-xs text-fg-2">AI opinion</span></p>}
      {o.issues.length>0&&<div><h4 className="text-sm font-semibold">Issues</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{o.issues.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}
      {!o.versions.length&&<>
      {o.title&&<p className="text-sm"><span className="font-medium">Title:</span> {o.title}</p>}
      {o.hook&&<p className="text-sm"><span className="font-medium">Hook:</span> {o.hook}</p>}
      {o.plan&&<div><h4 className="text-sm font-semibold">{result.tool==="carousel"?"Slides":result.tool==="story"?"Frames":"Scenes"}</h4><p className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm leading-6">{o.plan}</p></div>}
      {o.caption&&<div><h4 className="text-sm font-semibold">{result.tool==="voice-check"?"Rewritten in the brand voice":"Caption"}</h4><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{o.caption}</p></div>}
      {o.cta&&<p className="text-sm"><span className="font-medium">CTA:</span> {o.cta}</p>}
      {o.hashtags.length>0&&<p className="text-sm text-accent-text">{o.hashtags.map(h=>h.startsWith("#")?h:"#"+h).join(" ")}</p>}
      </>}
      {o.items.length>0&&<ul className="space-y-2">{o.items.map((x,i)=><li key={i} className="rounded-lg border border-border p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><span><span className="text-xs text-fg-2">{x.label}</span><br/>{x.text}</span><button className="min-h-11 text-xs text-accent-text underline" onClick={()=>navigator.clipboard?.writeText([x.text,...x.options].join("\n"))}>Copy</button></div>{x.options.length>0&&<p className="mt-1 text-fg-2">{x.options.join(" · ")}</p>}</li>)}</ul>}
      {o.versions.length>0&&<div className="grid gap-3 md:grid-cols-2">{o.versions.map((v,i)=><div key={i} className="rounded-lg border border-border p-3 text-sm"><p className="text-xs text-fg-2">{v.platform} · {v.format}</p><p className="mt-1 font-medium">{v.title}</p><p className="mt-1">{v.hook}</p><p className="mt-2 whitespace-pre-wrap leading-6">{v.caption}</p><p className="mt-1 text-accent-text">{v.hashtags.join(" ")}</p>
        {writable&&<Button className="mt-2 min-h-11" size="xs" disabled={!!busy} onClick={()=>saveAs(v,(socialPlatforms.find(p=>p===v.platform)??platform),(socialFormats.find(f=>f===v.format)??"Text"))}>Save {v.platform} version as draft</Button>}</div>)}</div>}
      {writable&&(o.caption||o.plan)&&!o.versions.length&&<Button className="min-h-11" variant="primary" disabled={!!busy} onClick={()=>saveAs({title:o.title,hook:o.hook,caption:o.caption,hashtags:o.hashtags,plan:o.plan})}>Save as draft post</Button>}
    </Card>}
    <section className="space-y-3"><h2 className="font-semibold">Ideas & drafts ({drafts.length})</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{cards(drafts)}</div>{!drafts.length&&<p className="text-sm text-fg-2">No ideas or drafts yet. Generate full post ideas, turn a strategy week into ideas, or save a tool result.</p>}</section>
    <Card className="space-y-4 p-5"><div><h2 className="font-semibold">AI images</h2><p className="mt-1 text-sm text-fg-2">Square images for posts, carousel backgrounds and Reel covers. The model cannot write readable text, so add words in your design tool. Images are private to your account.</p></div>
      {!data.imageReady?<p className="rounded-lg border border-border p-3 text-sm text-fg-2">Image generation is not set up yet. Add a Cloudflare API token with Workers AI access as <code>CLOUDFLARE_AI_TOKEN</code> in the server settings.</p>
      :writable&&<div className="space-y-3"><Field label="Describe the image" hint="Subject, setting, mood and colours. No text."><Textarea rows={2} value={imagePrompt} onChange={e=>setImagePrompt(e.target.value)} placeholder="A glass serum bottle on wet green leaves, morning light, fresh and clean"/></Field>
        <Field label="Attach to post (optional)"><Select className="min-h-11" value={imagePost} onChange={e=>setImagePost(e.target.value)}><option value="">Not attached</option>{posts.filter(p=>p.stage!=="Published").map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</Select></Field>
        <Button className="min-h-11" variant="primary" loading={busy==="image"} disabled={!!busy||imagePrompt.trim().length<5} onClick={async()=>{if(await act("image",{clientId,prompt:imagePrompt,postId:imagePost||undefined},"Image created."))setImagePrompt("");}}>Generate image</Button></div>}
      {data.images.length>0&&<ul className="grid grid-cols-2 gap-3 md:grid-cols-4">{data.images.map(img=><li key={img.id} className="space-y-1 text-xs"><a href={`/api/social/image/${img.id}`} target="_blank" rel="noreferrer"><img src={`/api/social/image/${img.id}`} alt={img.prompt} className="aspect-square w-full rounded-lg border border-border object-cover" loading="lazy"/></a>
        <p className="line-clamp-2 text-fg-2">{img.prompt}</p>{img.postId&&<p>For: {posts.find(p=>p.id===img.postId)?.title??"removed post"}</p>}
        <div className="flex gap-3"><a className="min-h-11 py-3 text-accent-text underline" href={`/api/social/image/${img.id}?download=1`}>Download</a>{writable&&(removing===img.id?<button className="min-h-11 text-danger underline" onClick={async()=>{await act("image-delete",{imageId:img.id},"Image deleted.");setRemoving("");}}>Confirm delete</button>:<button className="min-h-11 text-fg-2 underline" onClick={()=>setRemoving(img.id)}>Delete</button>)}</div></li>)}</ul>}
    </Card>
    {writable&&<div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3 p-5"><h2 className="font-semibold">Brand voice memory</h2><p className="text-sm text-fg-2">Every AI writer follows these notes for this client: tone, words to use or avoid, emoji and language rules.</p>
        <Textarea rows={5} value={voice} onChange={e=>setVoice(e.target.value)} placeholder="Warm, honest, science-light. Say 'skin' not 'flawless'. Max 2 emojis. No 'miracle' or 'guaranteed'. Hinglish allowed on Instagram."/>
        <Button className="min-h-11" loading={busy==="settings"} disabled={!!busy||voice===(data.settings.brandVoice??"")} onClick={async()=>{if(await act("settings",{clientId,requireClientApproval:data.settings.requireClientApproval,brandVoice:voice},"Brand voice saved."))setVoice(null);}}>Save brand voice</Button></Card>
      <Card className="space-y-3 p-5"><h2 className="font-semibold">Bulk upload posts</h2><p className="text-sm text-fg-2">Upload a CSV with columns Title, Platform, Format, Caption, Hook, Hashtags, Pillar, Campaign. Each row becomes a draft (up to 200).</p>
        <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border px-3 text-sm hover:border-accent">{busy==="bulk"?"Uploading…":"Choose CSV file"}<input type="file" accept=".csv,text/csv" className="sr-only" disabled={!!busy} onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;if(file.size>2_000_000){studio.setError("Choose a file under 2 MB.");return;}const r=await act<{created:number;errors:string[]}>("bulk",{clientId,csv:await file.text()});if(r)studio.setNotice(`${r.created} drafts added.${r.errors.length?` ${r.errors.length} rows skipped: ${r.errors.slice(0,2).join(" ")}`:""}`);}}/></label>
        <a className="text-sm text-accent-text underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent("Title,Platform,Format,Caption,Hook,Hashtags,Pillar,Campaign\nMonsoon skin tips,Instagram,Carousel,Five quick fixes for humid days,Humid day? Try this,#skincare #monsoon,Education,Monsoon care\n")}`} download="social-posts-template.csv">Download template</a></Card>
    </div>}
  </div>;
}
