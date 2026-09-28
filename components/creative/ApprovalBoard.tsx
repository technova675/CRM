"use client";

import { useMemo, useState } from "react";
import { MessageSquare, Palette, Plus } from "lucide-react";
import { useCRM } from "@/lib/store";
import { CREATIVE_STATUSES, type Creative, type CreativeStatus, type CreativeType } from "@/lib/types";
import { SWATCHES } from "@/lib/ai/creative";
import { cn, relTime } from "@/lib/utils";
import { AIBadge, Badge, Button, Card, EmptyState, Field, Input, MemberAvatar, Modal, SearchInput, Segmented, Select, Table, Td, Textarea, Th, Toggle } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { createCreative, sendToClient } from "./actions";
import { CREATIVE_TONE, CREATIVE_TYPES, CreativePreview, TYPE_ICON } from "./Preview";
import { toastSend } from "./CreativeDrawer";

export function ApprovalBoard({ creatives, writable, onOpen }: { creatives: Creative[]; writable: boolean; onOpen: (id: string) => void }) {
  const clients = useCRM((s) => s.clients);
  const setCreativeStatus = useCRM((s) => s.setCreativeStatus);
  const [view, setView] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [clientId, setClientId] = useState("All");
  const [type, setType] = useState<CreativeType | "All">("All");
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<CreativeStatus | null>(null);

  const visible = useMemo(
    () =>
      creatives
        .filter((c) => (archived || c.status !== "Archived") && (clientId === "All" || c.clientId === clientId) && (type === "All" || c.type === type) && (!q || `${c.title} ${c.hook ?? ""} ${c.angle ?? ""} ${c.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [creatives, archived, clientId, type, q],
  );
  const statuses = CREATIVE_STATUSES.filter((s) => archived || s !== "Archived");
  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "—";
  const openComments = (c: Creative) => c.comments.filter((x) => !x.resolved).length;

  const drop = (status: CreativeStatus) => {
    const c = creatives.find((x) => x.id === dragId);
    setDragId(null);
    setOver(null);
    if (!c || c.status === status) return;
    if (status === "Client Review") return toastSend(sendToClient(c));
    setCreativeStatus(c.id, status);
    toast(`${c.title} → ${status}`);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search creatives, hooks, tags…" className="w-full sm:w-64" />
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-44">
          <option value="All">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value as CreativeType | "All")} className="w-36">
          <option value="All">All types</option>
          {CREATIVE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </Select>
        <label className="inline-flex items-center gap-1.5 text-xs text-fg-2"><Toggle checked={archived} onChange={setArchived} label="Show archived" /> Archived</label>
        <div className="ml-auto flex items-center gap-2">
          <Segmented value={view} onChange={setView} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }]} />
          {writable && <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>New creative</Button>}
        </div>
      </div>

      {visible.length === 0 ? (
        <Card><EmptyState icon={<Palette className="size-5" />} title="No creatives match these filters" /></Card>
      ) : view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {statuses.map((st) => {
            const items = visible.filter((c) => c.status === st);
            return (
              <div
                key={st}
                onDragOver={(e) => { if (writable && dragId) { e.preventDefault(); setOver(st); } }}
                onDragLeave={() => setOver((o) => (o === st ? null : o))}
                onDrop={() => drop(st)}
                className={cn("w-64 shrink-0 rounded-xl border border-border bg-surface-2/50 p-2 transition", over === st && "border-accent bg-accent-soft/40")}
              >
                <div className="flex items-center justify-between px-1 pb-2">
                  <Badge tone={CREATIVE_TONE[st]} dot>{st}</Badge>
                  <span className="text-xs text-fg-3 tabular-nums">{items.length}</span>
                </div>
                <div className="space-y-2 min-h-16">
                  {items.map((c) => {
                    const Icon = TYPE_ICON[c.type];
                    return (
                      <button
                        key={c.id}
                        draggable={writable}
                        onDragStart={() => setDragId(c.id)}
                        onDragEnd={() => { setDragId(null); setOver(null); }}
                        onClick={() => onOpen(c.id)}
                        className={cn("block w-full text-left rounded-lg border border-border bg-surface p-2 shadow-card hover:border-border-strong transition", dragId === c.id && "opacity-50")}
                      >
                        <CreativePreview creative={c} compact />
                        <p className="mt-2 text-[13px] font-medium leading-snug line-clamp-2">{c.title}</p>
                        <p className="text-[11px] text-fg-3 truncate">{clientName(c.clientId)}</p>
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-fg-3">
                          <Icon className="size-3" /> {c.type}
                          {c.aiGenerated && <AIBadge />}
                          <span className="ml-auto inline-flex items-center gap-2">
                            {openComments(c) > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="size-3" />{openComments(c)}</span>}
                            <MemberAvatar id={c.ownerId} size={16} />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr><Th>Creative</Th><Th>Client</Th><Th>Type</Th><Th>Platform / format</Th><Th>Status</Th><Th>Version</Th><Th>Comments</Th><Th>Owner</Th><Th>Updated</Th></tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} onClick={() => onOpen(c.id)} className="cursor-pointer hover:bg-surface-2/60">
                  <Td className="min-w-56">
                    <div className="flex items-center gap-2">
                      <span className="size-8 shrink-0 rounded-md" style={{ background: c.versions[c.versions.length - 1]?.swatch ?? SWATCHES[0] }} />
                      <div className="min-w-0"><p className="font-medium truncate">{c.title}</p>{c.hook && <p className="text-xs text-fg-3 truncate">{c.hook}</p>}</div>
                      {c.aiGenerated && <AIBadge />}
                    </div>
                  </Td>
                  <Td className="text-fg-2 whitespace-nowrap">{clientName(c.clientId)}</Td>
                  <Td>{c.type}</Td>
                  <Td className="text-xs text-fg-2 whitespace-nowrap">{c.platform} · {c.format}</Td>
                  <Td><Badge tone={CREATIVE_TONE[c.status]} dot>{c.status}</Badge></Td>
                  <Td className="tabular-nums">v{c.versions.length}</Td>
                  <Td className="tabular-nums text-fg-2">{openComments(c)}/{c.comments.length}</Td>
                  <Td><MemberAvatar id={c.ownerId} showName /></Td>
                  <Td className="text-xs text-fg-3 whitespace-nowrap">{relTime(c.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {creating && <NewCreativeModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); onOpen(id); }} />}
    </div>
  );
}

function NewCreativeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const clients = useCRM((s) => s.clients);
  const campaigns = useCRM((s) => s.campaigns);
  const [f, setF] = useState({ clientId: clients[0]?.id ?? "", campaignId: "", title: "", type: "Image" as CreativeType, platform: "Meta", format: "1:1 Static", headline: "", body: "", cta: "", angle: "", hook: "" });
  const [file, setFile] = useState<File | undefined>();
  const submit = () => {
    if (!f.title.trim() || !f.clientId) return toast("Title and client are required", undefined, "warning");
    const c = createCreative({ clientId: f.clientId, campaignId: f.campaignId || undefined, title: f.title.trim(), type: f.type, platform: f.platform, format: f.format, angle: f.angle || undefined, hook: f.hook || undefined, version: { note: "Initial version", headline: f.headline || undefined, body: f.body || undefined, cta: f.cta || undefined, fileName: file?.name, swatch: SWATCHES[Math.floor(Math.random() * SWATCHES.length)] } }, file);
    toast("Creative created", "Draft v1 — send it to internal review when ready.");
    onCreated(c.id);
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="New creative" size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Create draft</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Title" className="sm:col-span-2"><Input value={f.title} onChange={set("title")} placeholder="e.g. Diwali offer — UGC reel" /></Field>
        <Field label="Client"><Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value, campaignId: "" })}>{clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</Select></Field>
        <Field label="Campaign (optional)"><Select value={f.campaignId} onChange={set("campaignId")}><option value="">—</option>{campaigns.filter((c) => c.clientId === f.clientId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Type"><Select value={f.type} onChange={set("type")}>{CREATIVE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Platform"><Input value={f.platform} onChange={set("platform")} /></Field>
        <Field label="Format"><Input value={f.format} onChange={set("format")} placeholder="9:16 Reel, 1:1 Static…" /></Field>
        <Field label="Angle"><Input value={f.angle} onChange={set("angle")} /></Field>
        <Field label="Hook" className="sm:col-span-2"><Input value={f.hook} onChange={set("hook")} /></Field>
        <Field label="Headline"><Input value={f.headline} onChange={set("headline")} /></Field>
        <Field label="CTA"><Input value={f.cta} onChange={set("cta")} /></Field>
        <Field label="Copy / script / description" className="sm:col-span-2"><Textarea value={f.body} onChange={set("body")} /></Field>
        <Field label="File (optional)" hint="Preview is available this session; only the file name is saved." className="sm:col-span-2"><input type="file" accept="image/*,video/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0])} className="block w-full text-xs text-fg-2 file:mr-2 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-2 file:py-1 file:text-xs" /></Field>
      </div>
    </Modal>
  );
}
