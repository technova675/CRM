"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, FileSearch, Search, Sparkles } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, PageHeader, Select, Textarea } from "@/components/ui";
import { flushCRMChanges, refreshCRMChanges } from "@/lib/crmSync";
import { knowledgeFormats, latestKnowledgeVersion, MAX_KNOWLEDGE_FILE, type KnowledgeSource } from "@/lib/domain/clientKnowledge";
import { can } from "@/lib/permissions";
import { useCRM, useMe } from "@/lib/store";

type Result = {
  sources: KnowledgeSource[];
  paragraphs?: {text:string; kind:string; references:number[]}[];
  missing?:string;
  model?:string;
};

function KnowledgeWorkspace({clientId}:{clientId:string}) {
  const me = useMe();
  const assets = useCRM(state => state.assets);
  const [query,setQuery] = useState("");
  const [result,setResult] = useState<Result>();
  const [pending,setPending] = useState("");
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const writable = can(me.role,"documents","write");
  const documents = assets.filter(asset => asset.clientId === clientId && !asset.archivedAt && latestKnowledgeVersion(asset)?.file);

  async function run(action:"search"|"ask"|"index"|"remove", assetId?:string) {
    if (pending) return;
    setPending(action);
    setError("");
    setNotice("");
    if (!assetId) setResult(undefined);
    try {
      await flushCRMChanges();
      const response = await fetch("/api/knowledge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId,action,query,assetId})});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
      if (assetId) {
        setResult(undefined);
        await refreshCRMChanges();
        setNotice(action === "index" ? "Document text is searchable and available for AI drafts." : "Document text was removed from the knowledge base.");
      } else {
        setResult(payload);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Try again.");
    } finally {
      setPending("");
    }
  }

  function search(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("search");
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        <Card className="p-4 sm:p-5">
          <form onSubmit={search} className="space-y-3">
            <Field label="Search or ask a question" hint="Try “Which claims are approved?” or search for a campaign, product, or SOP.">
              <Textarea value={query} onChange={event=>setQuery(event.target.value)} maxLength={500} placeholder="Enter keywords or a question" className="min-h-24" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!!pending || query.trim().length < 2} className="min-h-11" icon={<Search className="size-4" />}>Search</Button>
              <Button type="button" variant="primary" disabled={!!pending || query.trim().length < 2} className="min-h-11" icon={<Sparkles className="size-4" />} onClick={()=>void run("ask")}>Ask AI</Button>
            </div>
            <p className="text-xs text-fg-3">Ask AI sends matching excerpts from this client to the configured AI provider.</p>
          </form>
        </Card>
        {pending && <p role="status" className="text-sm text-fg-2">{pending === "ask" ? "Reading matching sources…" : "Working…"}</p>}
        {notice && <p role="status" className="text-sm text-fg-2">{notice}</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {result?.paragraphs && (
          <Card>
            <CardHeader title="Answer" subtitle={result.model} />
            <div className="space-y-4 px-4 pb-4 text-sm">
              {result.paragraphs.map((item,index)=><div key={index}>
                <Badge tone="info">{item.kind}</Badge>
                <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{item.text}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {[...new Set(item.references)].map(ref=><a key={ref} href={"#source-"+ref} className="inline-flex min-h-11 items-center text-accent-text underline">Source {ref}</a>)}
                </div>
              </div>)}
              {result.missing && <p className="text-fg-2">{result.missing}</p>}
            </div>
          </Card>
        )}
        {result && (
          <Card>
            <CardHeader title="Sources" subtitle={result.sources.length ? result.sources.length + " matching excerpts" : "No sources matched your query"} />
            <ol className="divide-y divide-border">
              {result.sources.map((source,index)=><li key={source.id} id={"source-"+(index+1)} className="scroll-mt-24 px-4 py-3">
                <a href={source.href} className="inline-flex min-h-11 items-center break-words font-medium text-accent-text hover:underline">{index+1}. {source.title}</a>
                <p className="text-xs text-fg-3">{source.kind}</p>
                <p className="mt-2 break-words text-sm leading-relaxed text-fg-2">{source.excerpt || "Filename or tags matched. Index the document to search its contents."}</p>
              </li>)}
            </ol>
          </Card>
        )}
      </div>
      <Card className="min-w-0">
        <CardHeader title="Client documents" subtitle="Index a document to make its text searchable and available for future drafts." />
        <div className="space-y-3 px-4 pb-4">
          <Button href={"/documents?client="+encodeURIComponent(clientId)} className="min-h-11" icon={<FileSearch className="size-4" />}>Open Documents & Assets</Button>
          <a className="flex min-h-11 items-center text-sm text-accent-text underline" href={"/clients/"+encodeURIComponent(clientId)+"?tab=knowledge"}>Edit client memory</a>
          <p className="text-xs leading-relaxed text-fg-3">Text PDFs, DOCX, TXT, Markdown and CSV up to 5 MB. Each new file version needs to be indexed separately.</p>
          {!documents.length && <p className="text-sm text-fg-2">Upload a client document or SOP to get started.</p>}
          <ul className="divide-y divide-border">
            {documents.map(asset=>{
              const version = latestKnowledgeVersion(asset)!;
              const file = version.file!;
              const indexed = !!file.knowledgeText;
              const supported = knowledgeFormats.test(file.name) && file.size <= MAX_KNOWLEDGE_FILE;
              return <li key={asset.id} className="space-y-2 py-3">
                <p className="break-words text-sm font-medium">{asset.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={indexed ? "success" : "neutral"}>v{version.v} · {indexed ? "Indexed" : supported ? "Ready to index" : "Filename only"}</Badge>
                  {writable && (supported || indexed) && <Button size="sm" className="min-h-11" disabled={!!pending} onClick={()=>void run(indexed ? "remove" : "index",asset.id)}>{indexed ? "Remove from index" : "Index text"}</Button>}
                </div>
              </li>;
            })}
          </ul>
        </div>
      </Card>
    </div>
  );
}

function KnowledgePageContent() {
  const params = useSearchParams();
  const clients = useCRM(state=>state.clients);
  const me = useMe();
  const [choice,setChoice] = useState(params.get("client") ?? "");
  const clientId = clients.some(client=>client.id === choice) ? choice : "";
  if (me.role === "client" || !can(me.role,"documents") || !can(me.role,"clients")) return null;
  return (
    <div>
      <PageHeader icon={<BookOpen className="size-5 text-fg-3" />} title="AI Knowledge Base" description="Search client documents, SOPs, brand memory, and past work. Ask questions and open the evidence behind each answer." />
      <div className="mb-4 max-w-sm">
        <Field label="Client">
          <Select value={clientId} onChange={event=>setChoice(event.target.value)} className="min-h-11">
            <option value="">Select a client</option>
            {clients.map(client=><option key={client.id} value={client.id}>{client.company}</option>)}
          </Select>
        </Field>
      </div>
      {clientId ? <KnowledgeWorkspace key={clientId} clientId={clientId} /> : <Card className="p-5 text-sm text-fg-2">Select a client to open their knowledge base.</Card>}
    </div>
  );
}

export default function KnowledgePage() {
  return <Suspense><KnowledgePageContent /></Suspense>;
}
