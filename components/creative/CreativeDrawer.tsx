"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, Columns2, Lock, MessageSquare, RotateCcw, Send, Upload } from "lucide-react";
import { useCRM } from "@/lib/store";
import { CREATIVE_STATUSES, type Creative, type CreativeStatus } from "@/lib/types";
import { SWATCHES } from "@/lib/ai/creative";
import { cn, fmtDateTime, money, relTime } from "@/lib/utils";
import { AIBadge, Badge, Button, Card, CardHeader, Checkbox, Drawer, Field, Input, MemberAvatar, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { addComment, sendToClient, toggleResolved, uploadVersion } from "./actions";
import { CREATIVE_TONE, CreativePreview } from "./Preview";

export function toastSend(r: ReturnType<typeof sendToClient>) {
  if (r === "sent") toast("Sent to client", "The client has been notified in their portal.");
  else if (r === "approval") toast("Approval required", "AI-generated creative — approve it in Automations → Approvals before it reaches the client.", "warning");
  else toast("Already awaiting approval", "This AI creative has a pending approval request.", "warning");
}

export function CreativeDrawer({ creative: c, onClose, clientMode, writable }: { creative: Creative; onClose: () => void; clientMode: boolean; writable: boolean }) {
  const clients = useCRM((s) => s.clients);
  const team = useCRM((s) => s.team);
  const campaigns = useCRM((s) => s.campaigns);
  const setCreativeStatus = useCRM((s) => s.setCreativeStatus);
  const latest = c.versions.length;
  const [sel, setSel] = useState(latest);
  const [compare, setCompare] = useState(false);
  const [cmpA, setCmpA] = useState(Math.max(1, latest - 1));
  const [scope, setScope] = useState<"version" | "all">("all");
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const client = clients.find((x) => x.id === c.clientId);
  const campaign = campaigns.find((x) => x.id === c.campaignId);
  const version = c.versions.find((v) => v.v === sel) ?? c.versions[latest - 1]!;

  const comments = useMemo(
    () => c.comments.filter((x) => (!clientMode || !x.internal) && (scope === "all" || x.version === sel)).sort((a, b) => a.at.localeCompare(b.at)),
    [c.comments, clientMode, scope, sel],
  );
  const name = (id: string) => team.find((t) => t.id === id)?.name ?? "—";

  const post = () => {
    if (!body.trim()) return;
    addComment(c, body.trim(), sel, !clientMode && internal);
    setBody("");
    toast(internal && !clientMode ? "Internal note added" : "Comment added");
  };
  const clientDecision = (status: "Approved" | "Changes Requested") => {
    if (status === "Changes Requested" && !body.trim()) return toast("Tell us what to change", "Add a comment describing the changes.", "warning");
    setCreativeStatus(c.id, status, body.trim() || undefined);
    setBody("");
    toast(status === "Approved" ? "Creative approved — thank you!" : "Change request sent to the team");
  };
  const move = (status: CreativeStatus) => {
    if (status === c.status) return;
    if (status === "Client Review") return toastSend(sendToClient(c));
    setCreativeStatus(c.id, status);
    toast(`Moved to ${status}`);
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width={880}
      title={c.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-1.5">
          {client?.company} · {c.type} · {c.platform} · {c.format}
          <Badge tone={CREATIVE_TONE[c.status]} dot>{c.status}</Badge>
          {c.aiGenerated && !clientMode && <AIBadge>AI generated</AIBadge>}
        </span>
      }
    >
      <div className="space-y-4">
        {/* Actions */}
        {clientMode ? (
          c.status === "Client Review" && (
            <Card className="p-3 space-y-2">
              <p className="text-[13px] font-medium">Your review</p>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment (required when requesting changes)…" className="min-h-16" />
              <div className="grid grid-cols-2 gap-2">
                <Button size="md" variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={() => clientDecision("Approved")}>Approve</Button>
                <Button size="md" variant="outline" icon={<RotateCcw className="size-4" />} onClick={() => clientDecision("Changes Requested")}>Request changes</Button>
              </div>
              <div className="flex justify-end"><Button size="xs" variant="ghost" disabled={!body.trim()} onClick={post}>Comment only</Button></div>
            </Card>
          )
        ) : (
          writable && (
            <div className="flex flex-wrap items-center gap-2">
              {c.status === "Draft" && <Button variant="primary" icon={<Send className="size-3.5" />} onClick={() => move("Internal Review")}>Send to internal review</Button>}
              {["Internal Review", "Changes Requested", "Draft"].includes(c.status) && <Button variant={c.status === "Draft" ? "secondary" : "primary"} icon={<Send className="size-3.5" />} onClick={() => move("Client Review")}>Send to client</Button>}
              {c.status === "Client Review" && <Button onClick={() => move("Approved")} icon={<CheckCircle2 className="size-3.5" />}>Mark approved (on client&apos;s behalf)</Button>}
              {c.status === "Approved" && <Button variant="primary" onClick={() => move("Live")}>Mark live</Button>}
              <Select value={c.status} onChange={(e) => move(e.target.value as CreativeStatus)} className="ml-auto w-44" aria-label="Status">
                {CREATIVE_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </div>
          )
        )}

        {/* Versions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-fg-3 mr-1">Versions</span>
          {c.versions.map((v) => (
            <button key={v.v} onClick={() => setSel(v.v)} className={cn("h-7 rounded-md border px-2.5 text-xs font-medium", sel === v.v ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-2 hover:bg-surface-2")}>
              v{v.v}{v.v === latest && <span className="ml-1 text-[10px] text-fg-3">latest</span>}
            </button>
          ))}
          {latest > 1 && <Button size="xs" variant={compare ? "primary" : "ghost"} icon={<Columns2 className="size-3" />} onClick={() => setCompare(!compare)} className="ml-auto">Compare</Button>}
        </div>

        {compare ? (
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-fg-3">
              Compare
              <Select value={cmpA} onChange={(e) => setCmpA(Number(e.target.value))} className="w-20 h-7">{c.versions.map((v) => <option key={v.v} value={v.v}>v{v.v}</option>)}</Select>
              with
              <Select value={sel} onChange={(e) => setSel(Number(e.target.value))} className="w-20 h-7">{c.versions.map((v) => <option key={v.v} value={v.v}>v{v.v}</option>)}</Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[cmpA, sel].map((n, i) => {
                const v = c.versions.find((x) => x.v === n)!;
                const other = c.versions.find((x) => x.v === (i === 0 ? sel : cmpA))!;
                const diff = (k: "headline" | "body" | "cta") => v[k] !== other[k];
                return (
                  <div key={i} className="space-y-2 min-w-0">
                    <CreativePreview creative={c} version={v} />
                    <div className="text-xs space-y-1">
                      <p className="font-medium">v{v.v} · {v.note}</p>
                      {(["headline", "body", "cta"] as const).map((k) => (
                        <p key={k} className={cn("rounded px-1", diff(k) && "bg-warning-soft")}><span className="text-fg-3 capitalize">{k}: </span>{v[k] || "—"}</p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,300px)_1fr]">
            <CreativePreview creative={c} version={version} />
            <div className="space-y-3 min-w-0">
              <div className="text-xs space-y-1">
                <p className="text-[13px] font-medium">v{version.v} — {version.note}</p>
                <p className="text-fg-3">{version.createdBy === "ai" ? "AI Creative Agent" : name(version.createdBy)} · {fmtDateTime(version.createdAt)}</p>
                {version.headline && <p><span className="text-fg-3">Headline: </span>{version.headline}</p>}
                {version.body && <p className="whitespace-pre-line"><span className="text-fg-3">Copy / script: </span>{version.body}</p>}
                {version.cta && <p><span className="text-fg-3">CTA: </span>{version.cta}</p>}
                {c.angle && <p><span className="text-fg-3">Angle: </span>{c.angle}</p>}
                {c.hook && <p><span className="text-fg-3">Hook: </span>{c.hook}</p>}
                {!clientMode && campaign && <p><span className="text-fg-3">Campaign: </span><Link href={`/campaigns?c=${campaign.id}`} className="text-accent-text hover:underline">{campaign.name}</Link></p>}
                {!clientMode && <p className="flex items-center gap-1"><span className="text-fg-3">Owner: </span><MemberAvatar id={c.ownerId} size={16} showName /></p>}
              </div>
              {!clientMode && c.performance && (
                <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
                  {[["Spend (7d)", money(c.performance.spend)], ["CTR", `${c.performance.ctr.toFixed(2)}%`], ["Hook rate", c.performance.hookRate ? `${c.performance.hookRate.toFixed(0)}%` : "—"], ["CPA", c.performance.cpa ? money(c.performance.cpa) : "—"], ["ROAS", `${c.performance.roas.toFixed(2)}x`], ["Frequency", c.performance.frequency.toFixed(1)]].map(([l, v]) => (
                    <div key={l} className="bg-surface p-2"><p className="text-[10px] text-fg-3">{l}</p><p className="font-semibold tabular-nums">{v}</p></div>
                  ))}
                </div>
              )}
              {!clientMode && writable && (uploading ? <UploadForm creative={c} onDone={() => { setUploading(false); setSel(c.versions.length + 1); }} onCancel={() => setUploading(false)} /> : <Button icon={<Upload className="size-3.5" />} onClick={() => setUploading(true)}>Upload new version</Button>)}
            </div>
          </div>
        )}

        {/* Comments */}
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-1.5"><MessageSquare className="size-3.5 text-fg-3" />Comments</span>}
            subtitle={clientMode ? "Visible to you and the agency team" : "Internal notes are hidden from the client portal"}
            action={<Select value={scope} onChange={(e) => setScope(e.target.value as "version" | "all")} className="h-7 w-36"><option value="all">All versions</option><option value="version">v{sel} only</option></Select>}
          />
          <div className="px-4 pb-4 space-y-3">
            {comments.length === 0 && <p className="text-xs text-fg-3">No comments yet.</p>}
            {comments.map((x) => {
              const author = team.find((t) => t.id === x.authorId);
              return (
                <div key={x.id} className={cn("flex gap-2", x.resolved && "opacity-60")}>
                  <MemberAvatar id={x.authorId} size={24} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-medium">{author?.name ?? "—"}</span>
                      {author?.role === "client" && <Badge tone="info">Client</Badge>}
                      <Badge>v{x.version}</Badge>
                      {x.internal && <Badge tone="warning"><Lock className="size-2.5" /> Internal</Badge>}
                      {x.resolved && <Badge tone="success">Resolved</Badge>}
                      <span className="text-fg-3">{relTime(x.at)}</span>
                    </p>
                    <p className={cn("text-[13px] text-fg-2 whitespace-pre-line", x.resolved && "line-through")}>{x.body}</p>
                  </div>
                  {writable && !clientMode && <button onClick={() => toggleResolved(c, x.id)} className="self-start text-[11px] text-accent-text hover:underline">{x.resolved ? "Reopen" : "Resolve"}</button>}
                </div>
              );
            })}
            {(clientMode ? c.status === "Changes Requested" : writable) && (
              <div className="space-y-2 border-t border-border pt-3">
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Comment on v${sel}…`} className="min-h-16" />
                <div className="flex items-center justify-between gap-2">
                  {!clientMode ? (
                    <label className="inline-flex items-center gap-1.5 text-xs text-fg-2"><Checkbox checked={internal} onChange={setInternal} /> Internal only (hidden from client)</label>
                  ) : <span />}
                  <Button size="sm" variant="primary" disabled={!body.trim()} onClick={post}>Post comment</Button>
                </div>
              </div>
            )}
            {clientMode && (c.status === "Approved" || c.status === "Live") && (
              <p className="text-[11px] text-fg-3">This creative is {c.status.toLowerCase()} — comments are closed.</p>
            )}
          </div>
        </Card>

        {/* History */}
        <Card>
          <CardHeader title="Version history" />
          <ol className="px-4 pb-4 space-y-2">
            {[...c.versions].reverse().map((v) => (
              <li key={v.v} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 size-3 shrink-0 rounded" style={{ background: v.swatch ?? "#8b5cf6" }} />
                <button onClick={() => { setSel(v.v); setCompare(false); }} className="min-w-0 flex-1 text-left hover:underline">
                  <span className="font-medium">v{v.v}</span> — {v.note}{v.fileName && <span className="text-fg-3"> · {v.fileName}</span>}
                </button>
                <span className="text-fg-3 whitespace-nowrap">{v.createdBy === "ai" ? "AI" : name(v.createdBy).split(" ")[0]} · {relTime(v.createdAt)}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </Drawer>
  );
}

function UploadForm({ creative: c, onDone, onCancel }: { creative: Creative; onDone: () => void; onCancel: () => void }) {
  const last = c.versions[c.versions.length - 1];
  const [f, setF] = useState({ note: "", headline: last?.headline ?? "", body: last?.body ?? "", cta: last?.cta ?? "", swatch: SWATCHES[(c.versions.length * 3) % SWATCHES.length]! });
  const [file, setFile] = useState<File | undefined>();
  const submit = () => {
    if (!f.note.trim()) return toast("Add a version note", "Describe what changed.", "warning");
    uploadVersion(c, { note: f.note.trim(), headline: f.headline || undefined, body: f.body || undefined, cta: f.cta || undefined, fileName: file?.name, swatch: f.swatch }, file);
    toast(`Uploaded v${c.versions.length + 1}`, c.status === "Changes Requested" ? "Moved back to Internal Review." : undefined);
    onDone();
  };
  return (
    <Card className="p-3 space-y-2">
      <p className="text-[13px] font-medium">New version (v{c.versions.length + 1})</p>
      <Field label="What changed?"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. New hook, captions added" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Headline"><Input value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} /></Field>
        <Field label="CTA"><Input value={f.cta} onChange={(e) => setF({ ...f, cta: e.target.value })} /></Field>
      </div>
      <Field label="Copy / script"><Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} className="min-h-14" /></Field>
      <Field label="File" hint="Preview works in this session; only the file name is saved."><input type="file" accept="image/*,video/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0])} className="block w-full text-xs text-fg-2 file:mr-2 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-2 file:py-1 file:text-xs" /></Field>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-fg-3 mr-1">Placeholder</span>
        {SWATCHES.map((s) => <button key={s} onClick={() => setF({ ...f, swatch: s })} aria-label={`Colour ${s}`} className={cn("size-5 rounded-full border-2", f.swatch === s ? "border-fg" : "border-transparent")} style={{ background: s }} />)}
      </div>
      <div className="flex justify-end gap-2"><Button onClick={onCancel}>Cancel</Button><Button variant="primary" onClick={submit}>Upload v{c.versions.length + 1}</Button></div>
    </Card>
  );
}
