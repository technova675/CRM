"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Lightbulb, Save, Sparkles, Trash2 } from "lucide-react";
import { useCRM } from "@/lib/store";
import { creativeContextUsed, deriveCreativeInputs, type CreativeInputs } from "@/lib/ai/creative";
import { AGENTS } from "@/lib/ai/agents";
import type { CreativeConcept, InsightItem } from "@/lib/types";
import { relTime } from "@/lib/utils";
import { AgentChip, Badge, Button, Card, CardHeader, EmptyState, Field, Input, InsightLegend, InsightList, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { ContextUsed } from "@/components/strategy/shared";
import { generateConceptsJob, saveConceptAsCreative } from "./actions";

export function ConceptsTab({ initialClientId, initialCount, autoRun, writable, onOpenCreative }: { initialClientId?: string; initialCount?: number; autoRun?: boolean; writable: boolean; onOpenCreative: (id: string) => void }) {
  const clients = useCRM((s) => s.clients);
  const campaigns = useCRM((s) => s.campaigns);
  const creatives = useCRM((s) => s.creatives);
  const ads = useCRM((s) => s.ads);
  const knowledge = useCRM((s) => s.knowledge);
  const strategies = useCRM((s) => s.strategies);
  const concepts = useCRM((s) => s.concepts);
  const remove = useCRM((s) => s.remove);
  const [clientId, setClientId] = useState(initialClientId && clients.some((c) => c.id === initialClientId) ? initialClientId : clients[0]?.id ?? "");
  const [count, setCount] = useState(Math.min(20, Math.max(1, initialCount ?? 6)));
  const derive = (cid: string): CreativeInputs => {
    const client = clients.find((c) => c.id === cid);
    return deriveCreativeInputs({ client, knowledge: knowledge.find((k) => k.clientId === cid), campaigns: campaigns.filter((c) => c.clientId === cid), creatives: creatives.filter((c) => c.clientId === cid), ads: ads.filter((a) => a.clientId === cid) });
  };
  const [f, setF] = useState<CreativeInputs>(() => derive(clientId));
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ ids: string[]; skipped: string[]; commentary?: { summary?: string; insights: InsightItem[] } } | null>(null);
  const [filter, setFilter] = useState<"client" | "all">("client");

  const kb = knowledge.find((k) => k.clientId === clientId);
  const strategy = useMemo(() => strategies.filter((s) => s.clientId === clientId && s.status === "Approved").sort((a, b) => b.version - a.version)[0], [strategies, clientId]);
  const context = useMemo(() => creativeContextUsed(kb, { ads: ads.filter((a) => a.clientId === clientId && a.hook).length, strategy: strategy ? `${strategy.title} v${strategy.version}` : undefined }), [kb, ads, clientId, strategy]);
  const list = useMemo(() => concepts.filter((c) => filter === "all" || c.clientId === clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [concepts, filter, clientId]);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "—";

  const pick = (cid: string) => {
    setClientId(cid);
    setF(derive(cid));
    setLast(null);
  };
  const set = (k: keyof CreativeInputs) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const generate = async () => {
    if (!clientId) return;
    setBusy(true);
    const r = await generateConceptsJob({ inputs: f, clientId, count });
    setBusy(false);
    if (!r) return;
    setLast({ ids: r.concepts.map((c) => c.id), skipped: r.skipped, commentary: r.commentary });
    setFilter("client");
    toast(`${r.concepts.length} concepts generated`, r.skipped.length ? `${r.skipped.length} angle(s) skipped — matched rejected concepts` : "Save the best ones as creatives.", "ai");
  };

  // Deep link (/creative?tab=concepts&client=…&count=…) runs the generator once.
  const ran = useRef(false);
  useEffect(() => {
    if (!autoRun || ran.current || !writable || !clientId) return;
    ran.current = true;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, writable, clientId]);

  const save = (c: CreativeConcept) => {
    const cr = saveConceptAsCreative(c);
    toast("Saved as creative", "Draft v1 created in the approval board.");
    onOpenCreative(cr.id);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="AI Creative Strategy Agent" subtitle="Concepts, hooks, headlines, scripts, storyboards & CTAs" action={<AgentChip name={AGENTS.creative.short} color={AGENTS.creative.color} />} />
          <div className="px-4 pb-4 space-y-2.5">
            <Field label="Client"><Select value={clientId} onChange={(e) => pick(e.target.value)}>{clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</Select></Field>
            <Field label="Brand"><Input value={f.brand} onChange={set("brand")} /></Field>
            <Field label="Product"><Textarea value={f.product} onChange={set("product")} className="min-h-12" /></Field>
            <Field label="Audience"><Textarea value={f.audience} onChange={set("audience")} className="min-h-12" /></Field>
            <Field label="Offer"><Input value={f.offer} onChange={set("offer")} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Platform"><Input value={f.platform} onChange={set("platform")} /></Field>
              <Field label="Objective"><Input value={f.objective} onChange={set("objective")} /></Field>
            </div>
            <Field label="Existing creatives" hint="From live creatives and ad hooks — edit freely."><Textarea value={f.existing} onChange={set("existing")} className="min-h-12" /></Field>
            <Field label="Number of concepts"><Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} /></Field>
            <Button variant="ai" className="w-full" disabled={!writable} loading={busy} icon={<Sparkles className="size-3.5" />} onClick={generate}>Generate {count} concepts</Button>
            {!writable && <p className="text-[11px] text-fg-3">Read-only access — generation is disabled.</p>}
          </div>
        </Card>
        <ContextUsed items={context} />
      </div>

      <div className="space-y-3 min-w-0">
        {last && (last.skipped.length > 0 || last.commentary) && (
          <Card className="p-3 space-y-2">
            {last.commentary?.summary && <p className="text-[13px] text-fg-2">{last.commentary.summary}</p>}
            {last.commentary?.insights.length ? <InsightList items={last.commentary.insights} compact /> : null}
            {last.skipped.length > 0 && <InsightList compact items={last.skipped.map((s) => ({ kind: "data" as const, source: "Client knowledge base · rejected concepts", text: `Skipped angle: ${s}` }))} />}
          </Card>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <InsightLegend />
          <Select value={filter} onChange={(e) => setFilter(e.target.value as "client" | "all")} className="h-7 w-44"><option value="client">This client</option><option value="all">All clients</option></Select>
        </div>
        {list.length === 0 ? (
          <Card><EmptyState icon={<Lightbulb className="size-5" />} title="No concepts yet" description="Generate concepts grounded in the knowledge base, approved strategy and winning hooks." /></Card>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {list.map((c) => (
              <Card key={c.id} className={last?.ids.includes(c.id) ? "ring-2 ring-[var(--ring)]" : undefined}>
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold">{c.title}</p>
                      <p className="text-[11px] text-fg-3">{filter === "all" && `${clientName(c.clientId)} · `}{c.platform} · {relTime(c.createdAt)}</p>
                    </div>
                    <Badge tone="accent">{c.kind}</Badge>
                  </div>
                  <p className="text-[13px]"><span className="text-fg-3 text-xs">Hook </span>&ldquo;{c.hook}&rdquo;</p>
                  <p className="text-xs"><span className="text-fg-3">Headline: </span>{c.headline}</p>
                  <p className="text-xs"><span className="text-fg-3">Angle: </span>{c.angle} · <span className="text-fg-3">CTA: </span>{c.cta}</p>
                  {c.script && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-accent-text">Script</summary>
                      <pre className="mt-1 whitespace-pre-wrap font-sans text-fg-2 leading-relaxed">{c.script}</pre>
                    </details>
                  )}
                  {c.storyboard && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-accent-text">{c.kind === "Carousel" ? "Cards" : "Storyboard"} ({c.storyboard.length})</summary>
                      <ol className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {c.storyboard.map((s, i) => <li key={i} className="rounded-md border border-border bg-surface-2 p-1.5 text-[11px] text-fg-2">{s}</li>)}
                      </ol>
                    </details>
                  )}
                  <InsightList items={c.rationale} compact />
                  {writable && (
                    <div className="flex justify-end gap-2 pt-1">
                      <Button size="xs" variant="ghost" icon={<Trash2 className="size-3" />} onClick={() => remove("concepts", c.id)}>Discard</Button>
                      {c.savedAsCreativeId ? (
                        <Button size="xs" onClick={() => onOpenCreative(c.savedAsCreativeId!)}>Open creative</Button>
                      ) : (
                        <Button size="xs" variant="primary" icon={<Save className="size-3" />} onClick={() => save(c)}>Save as creative</Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
