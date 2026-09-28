"use client";

import { useMemo, useState } from "react";
import { Brain, Plus, Save, Trash2, X } from "lucide-react";
import { useCRM } from "@/lib/store";
import type { Client, ClientKnowledge } from "@/lib/types";
import { AGENTS } from "@/lib/ai/agents";
import { knowledgeCompleteness, performanceMemory } from "@/lib/ai/client-success";
import { cn, relTime } from "@/lib/utils";
import { AgentChip, Badge, Button, Card, CardHeader, Field, Input, InsightList, Progress, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";

const empty = (clientId: string): ClientKnowledge => ({ id: clientId, clientId, brandVoice: "", toneWords: [], products: [], audience: "", competitors: [], approvedMessaging: [], rejectedConcepts: [], preferences: [], guidelines: "", history: [], updatedAt: "" });

function ChipList({ items, onChange, placeholder, editable, long }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; editable: boolean; long?: boolean }) {
  const [v, setV] = useState("");
  const add = () => {
    const t = v.trim();
    if (t && !items.includes(t)) onChange([...items, t]);
    setV("");
  };
  return (
    <div className="space-y-2">
      {long ? (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it} className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/50 px-2.5 py-1.5 text-[13px] text-fg-2">
              <span className="flex-1">{it}</span>
              {editable && (
                <button onClick={() => onChange(items.filter((x) => x !== it))} className="text-fg-3 hover:text-danger" aria-label="Remove">
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span key={it} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-fg-2">
              {it}
              {editable && (
                <button onClick={() => onChange(items.filter((x) => x !== it))} className="text-fg-3 hover:text-danger" aria-label={`Remove ${it}`}>
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!items.length && <p className="text-xs text-fg-3">Nothing yet.</p>}
      {editable && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="flex-1" />
          <Button type="submit" size="sm" icon={<Plus className="size-3.5" />}>
            Add
          </Button>
        </form>
      )}
    </div>
  );
}

export function KnowledgeEditor({ client, editable }: { client: Client; editable: boolean }) {
  const stored = useCRM((s) => s.knowledge.find((k) => k.clientId === client.id));
  const campaigns = useCRM((s) => s.campaigns);
  const ads = useCRM((s) => s.ads);
  const [draft, setDraft] = useState<ClientKnowledge>(() => stored ?? empty(client.id));
  const [dirty, setDirty] = useState(false);
  const set = <K extends keyof ClientKnowledge>(k: K, v: ClientKnowledge[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  const memory = useMemo(() => performanceMemory(client.id, campaigns, ads), [client.id, campaigns, ads]);
  const completeness = knowledgeCompleteness(draft);

  const save = () => {
    const s = useCRM.getState();
    const next = { ...draft, id: client.id, clientId: client.id, updatedAt: new Date().toISOString() };
    s.upsert("knowledge", next);
    s.log({ actor: "human", actorId: s.currentUserId, entity: "knowledge", entityId: client.id, action: stored ? "Updated client knowledge base" : "Created client knowledge base", detail: `${client.company} · ${knowledgeCompleteness(next).pct}% complete` });
    setDraft(next);
    setDirty(false);
    toast("Knowledge base saved", "Agents will use the updated memory on their next run.");
  };

  const users = [AGENTS.strategy, AGENTS.creative, AGENTS.social, AGENTS.reporting];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-accent-soft p-2 text-accent-text">
              <Brain className="size-4" />
            </span>
            <div>
              <p className="text-[13px] font-semibold">Client knowledge base (AI memory)</p>
              <p className="text-xs text-fg-3">Internal only — never shown in the client portal. {draft.updatedAt ? `Updated ${relTime(draft.updatedAt)}.` : "Not saved yet."}</p>
            </div>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-1.5 sm:justify-end">
            <span className="text-[11px] text-fg-3">Used by:</span>
            {users.map((a) => (
              <AgentChip key={a.id} name={a.short} color={a.color} />
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Progress value={completeness.pct} tone={completeness.pct >= 80 ? "success" : completeness.pct >= 50 ? "accent" : "warning"} className="flex-1" />
          <span className="text-xs font-medium tabular-nums">{completeness.pct}% complete</span>
        </div>
        {completeness.missing.length > 0 && <p className="mt-1.5 text-[11px] text-fg-3">Missing: {completeness.missing.join(", ")}</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Brand voice & tone" />
          <div className="space-y-3 px-4 pb-4">
            <Field label="Brand voice">
              <Textarea value={draft.brandVoice} disabled={!editable} onChange={(e) => set("brandVoice", e.target.value)} placeholder="e.g. Warm, honest and ingredient-first" className="min-h-16" />
            </Field>
            <div>
              <p className="mb-1 text-xs font-medium text-fg-2">Tone words</p>
              <ChipList items={draft.toneWords} onChange={(v) => set("toneWords", v)} placeholder="Add a tone word" editable={editable} />
            </div>
            <Field label="Brand guidelines">
              <Textarea value={draft.guidelines} disabled={!editable} onChange={(e) => set("guidelines", e.target.value)} placeholder="Colours, typography, logo usage, compliance notes…" className="min-h-16" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Audience & competitors" />
          <div className="space-y-3 px-4 pb-4">
            <Field label="Target audience">
              <Textarea value={draft.audience} disabled={!editable} onChange={(e) => set("audience", e.target.value)} placeholder="Who buys, where, and why" className="min-h-16" />
            </Field>
            <div>
              <p className="mb-1 text-xs font-medium text-fg-2">Competitors</p>
              <ChipList items={draft.competitors} onChange={(v) => set("competitors", v)} placeholder="Add competitor" editable={editable} />
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Products & services" subtitle="Name, price and unique selling point" />
          <div className="space-y-2 px-4 pb-4">
            {draft.products.map((p, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1.2fr_0.6fr_2fr_auto]">
                <Input value={p.name} disabled={!editable} onChange={(e) => set("products", draft.products.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Product" />
                <Input value={p.price ?? ""} disabled={!editable} onChange={(e) => set("products", draft.products.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} placeholder="₹ price" />
                <Input value={p.usp} disabled={!editable} onChange={(e) => set("products", draft.products.map((x, j) => (j === i ? { ...x, usp: e.target.value } : x)))} placeholder="USP" />
                {editable && (
                  <Button variant="ghost" size="sm" aria-label="Remove product" onClick={() => set("products", draft.products.filter((_, j) => j !== i))} icon={<Trash2 className="size-3.5" />} />
                )}
              </div>
            ))}
            {!draft.products.length && <p className="text-xs text-fg-3">No products yet.</p>}
            {editable && (
              <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => set("products", [...draft.products, { name: "", price: "", usp: "" }])}>
                Add product
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Approved messaging" subtitle="Claims and lines the client has signed off" />
          <div className="px-4 pb-4">
            <ChipList long items={draft.approvedMessaging} onChange={(v) => set("approvedMessaging", v)} placeholder="Add approved message" editable={editable} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Rejected concepts" subtitle="Agents avoid these angles" />
          <div className="px-4 pb-4">
            <ChipList long items={draft.rejectedConcepts} onChange={(v) => set("rejectedConcepts", v)} placeholder="Add rejected concept" editable={editable} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Client preferences" />
          <div className="px-4 pb-4">
            <ChipList long items={draft.preferences} onChange={(v) => set("preferences", v)} placeholder="e.g. Founder approves all hero creatives" editable={editable} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Previous campaigns & learnings" />
          <div className="px-4 pb-4">
            <ChipList long items={draft.history} onChange={(v) => set("history", v)} placeholder="Add a learning from a past campaign" editable={editable} />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Performance memory" subtitle="Auto-derived from this client's campaigns and ads · read-only" action={<Badge tone="info">Live data</Badge>} />
          <div className="px-4 pb-4">
            <InsightList items={memory.items} />
          </div>
        </Card>
      </div>

      {editable && (
        <div className={cn("sticky bottom-3 z-10 flex items-center justify-end gap-2 rounded-xl border border-border bg-surface/95 p-2 shadow-pop backdrop-blur transition", !dirty && "opacity-70")}>
          <span className="mr-auto pl-2 text-xs text-fg-3">{dirty ? "Unsaved changes" : "All changes saved"}</span>
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(stored ?? empty(client.id));
                setDirty(false);
              }}
            >
              Discard
            </Button>
          )}
          <Button variant="primary" disabled={!dirty} icon={<Save className="size-3.5" />} onClick={save}>
            Save knowledge
          </Button>
        </div>
      )}
    </div>
  );
}
