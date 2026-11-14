"use client";

import {useEffect,useState} from "react";
import {useCRM} from "@/lib/store";
import {Button,Card,CardHeader,Field,Input,PageHeader,Select,Textarea} from "@/components/ui";
import type {VisibilityPrompt,VisibilitySample,VisibilityProvider} from "@/lib/domain/aiVisibility";

type Summary={promptCount:number;sampleCount:number;mentionRate:number|null;citationRate:number|null;shareOfVoice:number|null;sources:{domain:string;count:number}[];trend:{day:string;rate:number;total:number}[];alert:string|null;recommendations:string[]};
type View={prompts:VisibilityPrompt[];samples:VisibilitySample[];summary:Summary};
const providers:VisibilityProvider[]=["ChatGPT","Gemini","Perplexity","Google AI"];

export default function AIVisibilityPage(){
  const clients=useCRM(state=>state.clients);
  const [clientId,setClientId]=useState(""),[view,setView]=useState<View>();
  const [category,setCategory]=useState("General"),[question,setQuestion]=useState(""),[competitors,setCompetitors]=useState("");
  const [promptId,setPromptId]=useState(""),[provider,setProvider]=useState<VisibilityProvider>("ChatGPT"),[answer,setAnswer]=useState(""),[citations,setCitations]=useState(""),[sentiment,setSentiment]=useState<VisibilitySample["sentiment"]>("neutral");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const selected=clientId||clients[0]?.id||"";
  useEffect(()=>{
    if(!selected)return;
    let active=true;
    fetch("/api/ai-visibility?clientId="+encodeURIComponent(selected),{cache:"no-store"}).then(async response=>{
      const body=await response.json();if(!response.ok)throw new Error(body.error);return body as View;
    }).then(data=>{if(active){setView(data);setPromptId(data.prompts[0]?.id??"");}},cause=>{if(active)setError(cause.message);});
    return()=>{active=false;};
  },[selected,clients.length]);
  async function save(payload:unknown){
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/ai-visibility",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      const refreshed=await fetch("/api/ai-visibility?clientId="+encodeURIComponent(selected),{cache:"no-store"});
      const data=await refreshed.json();if(!refreshed.ok)throw new Error(data.error);
      setView(data);setPromptId(data.prompts[0]?.id??"");setQuestion("");setAnswer("");setCitations("");setNotice("Saved to this client’s AI search visibility workspace.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not save this entry.");}finally{setBusy(false);}
  }
  const summary=view?.summary;
  return <div className="space-y-5">
    <PageHeader title="AI Search Visibility" description="Track how often a client appears in sampled AI answers, which sources are cited, and how visibility changes."/>
    <Card className="space-y-3 p-4">
      <Field label="Client"><Select className="min-h-11" value={selected} onChange={event=>{setClientId(event.target.value);setView(undefined);setError("");}}>
        {clients.map(client=><option key={client.id} value={client.id}>{client.company}</option>)}
      </Select></Field>
      <p className="text-xs text-fg-3">Results are sampled estimates. AI answers change between runs. Add several answers for each question and provider before interpreting a trend.</p>
    </Card>
    {!clients.length?<Card className="p-5 text-sm text-fg-2">Add a client in Clients to start tracking AI visibility.</Card>:<>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["Questions",summary?.promptCount??0],["Answer samples",summary?.sampleCount??0],["Brand mention rate",summary?.mentionRate===null||summary?.mentionRate===undefined?"—":summary.mentionRate+"%"],["Share of voice estimate",summary?.shareOfVoice===null||summary?.shareOfVoice===undefined?"—":summary.shareOfVoice+"%"]].map(([label,value])=><Card key={label} className="p-4"><p className="text-xs text-fg-2">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></Card>)}
      </div>
      {summary?.alert&&<Card className="border-warning p-4 text-sm" role="alert"><strong>Visibility change</strong><p className="mt-1">{summary.alert}</p></Card>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="Prompt set" subtitle="Questions your audience may ask AI assistants."/><form className="space-y-3 px-4 pb-4" onSubmit={event=>{event.preventDefault();void save({action:"prompt",clientId:selected,category,question,competitors:competitors.split(",").map(item=>item.trim()).filter(Boolean)});}}>
          <Field label="Category"><Input className="min-h-11" value={category} maxLength={100} required onChange={event=>setCategory(event.target.value)}/></Field>
          <Field label="Question"><Textarea value={question} minLength={8} maxLength={1000} required onChange={event=>setQuestion(event.target.value)}/></Field>
          <Field label="Competitor brands, comma separated"><Input className="min-h-11" value={competitors} onChange={event=>setCompetitors(event.target.value)}/></Field>
          <Button type="submit" disabled={busy}>Add question</Button>
        </form><div className="divide-y divide-border px-4 pb-4">{view?.prompts.map(prompt=><div key={prompt.id} className="flex items-start justify-between gap-3 py-3 text-sm"><div><span className="text-xs text-fg-3">{prompt.category}</span><p className="font-medium">{prompt.question}</p><p className="text-xs text-fg-3">{view.samples.filter(sample=>sample.promptId===prompt.id).length} samples</p></div><Button disabled={busy} onClick={()=>{if(window.confirm("Delete this question and its answer samples?"))void save({action:"deletePrompt",promptId:prompt.id});}}>Delete</Button></div>)}</div></Card>
        <Card><CardHeader title="Record an AI answer" subtitle="Paste the complete answer from a named platform. Keep its citations for review."/><form className="space-y-3 px-4 pb-4" onSubmit={event=>{event.preventDefault();void save({action:"sample",promptId,provider,rawAnswer:answer,citations:citations.split(/\r?\n/).map(item=>item.trim()).filter(Boolean),sentiment});}}>
          <Field label="Question"><Select className="min-h-11" value={promptId} required onChange={event=>setPromptId(event.target.value)}>{view?.prompts.map(prompt=><option key={prompt.id} value={prompt.id}>{prompt.question}</option>)}</Select></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Platform"><Select className="min-h-11" value={provider} onChange={event=>setProvider(event.target.value as VisibilityProvider)}>{providers.map(name=><option key={name}>{name}</option>)}</Select></Field><Field label="Tone when brand is mentioned"><Select className="min-h-11" value={sentiment} onChange={event=>setSentiment(event.target.value as VisibilitySample["sentiment"])}><option value="neutral">Neutral</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="unmentioned">Unmentioned</option></Select></Field></div>
          <Field label="Raw answer"><Textarea rows={7} value={answer} required maxLength={20000} onChange={event=>setAnswer(event.target.value)}/></Field>
          <Field label="Citation URLs, one per line"><Textarea rows={3} value={citations} onChange={event=>setCitations(event.target.value)}/></Field>
          <Button type="submit" disabled={busy||!promptId}>Save answer sample</Button>
        </form></Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="Visibility trend" subtitle="Daily brand mention rate with sample counts."/><div className="px-4 pb-4">{summary?.trend.length?<div className="flex items-end gap-2 overflow-x-auto" role="img" aria-label="Daily sampled brand mention rates">{summary.trend.slice(-14).map(point=><div key={point.day} className="flex min-w-12 flex-col items-center gap-1"><span className="text-xs font-semibold">{point.rate}%</span><div className="w-7 rounded-t bg-accent" style={{height:Math.max(4,point.rate*0.8)}}/><span className="text-[11px] text-fg-3">{point.day.slice(5)}</span><span className="text-[11px] text-fg-3">n={point.total}</span></div>)}</div>:<p className="text-sm text-fg-3">Record answer samples to see a trend.</p>}</div></Card>
        <Card><CardHeader title="Sources and next steps" subtitle="Cited publisher domains and suggestions based on saved samples."/><div className="space-y-3 px-4 pb-4 text-sm"><p>Answers citing the brand: {summary?.citationRate??"—"}{summary?.citationRate===null||summary?.citationRate===undefined?"":"%"}</p><ul className="space-y-1">{summary?.sources.slice(0,8).map(source=><li key={source.domain} className="flex justify-between"><span>{source.domain}</span><span>{source.count} citations</span></li>)}</ul>{summary?.recommendations.map(item=><p key={item} className="rounded-lg bg-surface-2 p-3">{item}</p>)}{!summary?.recommendations.length&&<p className="text-fg-3">Add at least three samples to generate evidence based suggestions.</p>}</div></Card>
      </div>
      <Card><CardHeader title="Raw answer archive" subtitle="Review each recorded output and source link. Brand mentions are detected from the client name."/><div className="divide-y divide-border px-4 pb-4">{view?.samples.slice().reverse().map(sample=><details key={sample.id} className="py-3 text-sm"><summary className="cursor-pointer font-medium">{sample.provider} · {new Date(sample.capturedAt).toLocaleString()} · {sample.brandMention?"Brand mentioned":"No brand mention"} · {sample.sentiment}</summary><p className="mt-2 whitespace-pre-wrap">{sample.rawAnswer}</p><ul className="mt-2 space-y-1">{sample.citations.map(url=><li key={url}><a className="break-all text-accent-text underline" href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>)}</ul></details>)}{!view?.samples.length&&<p className="py-3 text-sm text-fg-3">No answer samples recorded.</p>}</div></Card>
    </>}
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}{notice&&<p role="status" className="text-sm text-success">{notice}</p>}
  </div>;
}
