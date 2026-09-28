"use client";

import { useMemo, useRef, useState } from "react";
import { FileAudio, FileText, FileVideo, Image as ImageIcon, Link2, Trash2, Upload } from "lucide-react";
import type { VideoAsset, VideoAssetKind, VideoProject, VideoTrack } from "@/lib/types";
import { ASSET_KINDS, fmtDuration, fmtTC, guessKind, isTextKind, planBeats, splitLines } from "@/lib/ai/video";
import { cn, uid } from "@/lib/utils";
import { Button, Card, Field, Input, Modal, Segmented, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { isTextFile, readMediaMeta, useMedia } from "./media";

const iconFor = (k: VideoAssetKind) => (k === "Music" ? FileAudio : isTextKind(k) ? FileText : k === "Logo" || k === "Brand asset" ? ImageIcon : FileVideo);

async function ingest(file: File): Promise<{ asset: VideoAsset; url?: string }> {
  const kind = guessKind(file.name, file.type);
  const id = uid("va");
  const asset: VideoAsset = { id, name: file.name, kind, sizeMb: Math.round((file.size / 1048576) * 100) / 100, addedAt: new Date().toISOString() };
  const media = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : undefined;
  let url: string | undefined;
  if (media || file.type.startsWith("image/")) url = URL.createObjectURL(file);
  if (media && url) {
    const meta = await readMediaMeta(url, media);
    if (meta.durationSec) asset.durationSec = meta.durationSec;
  }
  if (isTextFile(file) || isTextKind(kind)) {
    try {
      asset.text = (await file.text()).slice(0, 20000);
    } catch {
      /* unreadable */
    }
  }
  return { asset, url };
}

export function AssetsPanel({ project, tracks, time, writable, onChange, onSeek }: {
  project: VideoProject;
  tracks: VideoTrack[];
  time: number;
  writable: boolean;
  onChange: (assets: VideoAsset[], action: string) => void;
  onSeek: (t: number) => void;
}) {
  const urls = useMedia((s) => s.urls);
  const setUrl = useMedia((s) => s.set);
  const dropUrl = useMedia((s) => s.drop);
  const [tab, setTab] = useState<"files" | "script" | "plan">("files");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState(false);
  const [viewing, setViewing] = useState<VideoAsset | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const relinkFor = useRef<string | null>(null);
  const relinkInput = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    const out = await Promise.all(list.map(ingest));
    out.forEach(({ asset, url }) => url && setUrl(asset.id, url, list.find((f) => f.name === asset.name)?.type ?? ""));
    onChange([...project.assets, ...out.map((o) => o.asset)], `Uploaded ${out.length} file${out.length > 1 ? "s" : ""}`);
    setBusy(false);
    toast(`${out.length} file${out.length > 1 ? "s" : ""} added`, "Metadata saved. Previews are available for this browser session only.");
  };

  const relink = async (file: File) => {
    const id = relinkFor.current;
    relinkFor.current = null;
    if (!id) return;
    const url = URL.createObjectURL(file);
    setUrl(id, url, file.type);
    const media = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : undefined;
    if (media) {
      const meta = await readMediaMeta(url, media);
      if (meta.durationSec) onChange(project.assets.map((a) => (a.id === id ? { ...a, durationSec: meta.durationSec } : a)), "Re-attached file");
    }
    toast("File attached for preview", file.name);
  };

  const grouped = useMemo(() => ASSET_KINDS.map((k) => ({ kind: k, items: project.assets.filter((a) => a.kind === k) })).filter((g) => g.items.length), [project.assets]);
  const captions = tracks.find((t) => t.kind === "caption")?.clips ?? [];
  const scriptAsset = project.assets.find((a) => ["Script", "Dialogue", "Captions"].includes(a.kind) && a.text);
  const lines = splitLines(scriptAsset?.text);
  const beats = planBeats(project);
  const curCap = captions.find((c) => c.start <= time && c.end > time);

  return (
    <Card className="flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <h3 className="text-[13px] font-semibold">Assets</h3>
        <Segmented value={tab} onChange={setTab} options={[{ value: "files", label: `Files ${project.assets.length}` }, { value: "script", label: "Script" }, { value: "plan", label: "Plan" }]} />
      </div>

      {tab === "files" && (
        <div className="p-3 space-y-3">
          {writable && (
            <div
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); void addFiles(e.dataTransfer.files); }}
              onClick={() => input.current?.click()}
              className={cn("cursor-pointer rounded-lg border border-dashed p-3 text-center transition", over ? "border-accent bg-accent-soft" : "border-border-strong hover:bg-surface-2")}
            >
              <Upload className="mx-auto size-4 text-fg-3" />
              <p className="mt-1 text-xs font-medium">{busy ? "Reading files…" : "Drop files or click to upload"}</p>
              <p className="text-[11px] text-fg-3">Raw video, music, logo, brand assets, script / reel plan (.txt .md .srt)</p>
              <input ref={input} type="file" multiple hidden accept="video/*,audio/*,image/*,.txt,.md,.srt,.vtt,.pdf" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
            </div>
          )}
          {writable && <Button size="xs" variant="outline" className="w-full" onClick={() => setPaste(true)} icon={<FileText className="size-3.5" />}>Paste script / reel plan</Button>}
          <input ref={relinkInput} type="file" hidden accept="video/*,audio/*,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void relink(f); e.target.value = ""; }} />

          {grouped.length === 0 && <p className="text-xs text-fg-3 text-center py-4">No assets yet.</p>}
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {grouped.map((g) => (
              <div key={g.kind}>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-3">{g.kind} · {g.items.length}</p>
                <ul className="space-y-1">
                  {g.items.map((a) => {
                    const Icon = iconFor(a.kind);
                    const live = !!urls[a.id];
                    const media = !isTextKind(a.kind);
                    return (
                      <li key={a.id} className="group rounded-md border border-border px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <Icon className="size-3.5 shrink-0 text-fg-3" />
                          <button onClick={() => a.text !== undefined && setViewing(a)} className={cn("min-w-0 flex-1 truncate text-left text-xs", a.text !== undefined && "hover:underline")} title={a.name}>{a.name}</button>
                          {media && <span className={cn("size-1.5 rounded-full shrink-0", live ? "bg-success" : "bg-fg-3/40")} title={live ? "Preview available this session" : "Metadata only (file not stored)"} />}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-fg-3">
                          <span className="tabular-nums">{a.durationSec ? fmtDuration(a.durationSec) + " · " : ""}{a.sizeMb < 1 ? `${Math.round(a.sizeMb * 1024)} KB` : `${a.sizeMb.toFixed(0)} MB`}</span>
                          {a.text && <span>· {splitLines(a.text).length} lines</span>}
                          {writable && (
                            <span className="ml-auto flex items-center gap-1">
                              <select value={a.kind} onChange={(e) => onChange(project.assets.map((x) => (x.id === a.id ? { ...x, kind: e.target.value as VideoAssetKind } : x)), "Changed asset kind")} className="h-5 rounded border border-border bg-surface px-1 text-[10px] text-fg-2" aria-label="Asset kind">
                                {ASSET_KINDS.map((k) => <option key={k}>{k}</option>)}
                              </select>
                              {media && !live && (
                                <button onClick={() => { relinkFor.current = a.id; relinkInput.current?.click(); }} className="rounded p-0.5 hover:bg-surface-2 hover:text-fg" title="Re-attach file to preview" aria-label="Re-attach file"><Link2 className="size-3" /></button>
                              )}
                              <button onClick={() => { dropUrl(a.id); onChange(project.assets.filter((x) => x.id !== a.id), `Removed ${a.name}`); }} className="rounded p-0.5 hover:bg-danger-soft hover:text-danger" title="Remove" aria-label="Remove asset"><Trash2 className="size-3" /></button>
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "script" && (
        <div className="p-3">
          {!lines.length ? (
            <p className="text-xs text-fg-3 py-4 text-center">No script, dialogue or captions uploaded.</p>
          ) : (
            <ol className="space-y-1 max-h-[480px] overflow-y-auto">
              {lines.map((l, i) => {
                const c = captions.find((x) => x.text === l);
                const cur = !!curCap && curCap.text === l;
                return (
                  <li key={i}>
                    <button onClick={() => c && onSeek(c.start)} className={cn("w-full rounded-md px-2 py-1.5 text-left text-xs leading-relaxed transition", cur ? "bg-accent-soft text-accent-text" : "hover:bg-surface-2 text-fg-2")}>
                      <span className="mr-1.5 font-mono text-[10px] text-fg-3">{c ? fmtTC(c.start, false) : `${i + 1}.`}</span>
                      {l}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {scriptAsset && <p className="mt-2 text-[11px] text-fg-3">From {scriptAsset.name}. Click a line to jump to its caption.</p>}
        </div>
      )}

      {tab === "plan" && (
        <div className="p-3">
          {!beats.length ? (
            <p className="text-xs text-fg-3 py-4 text-center">No reel plan uploaded.</p>
          ) : (
            <ol className="space-y-1.5">
              {beats.map((b, i) => (
                <li key={i} className="flex gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
                  <span className="font-mono text-[10px] text-fg-3">{i + 1}</span>
                  <span className="text-fg-2">{b}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <PasteModal open={paste} onClose={() => setPaste(false)} onAdd={(a) => onChange([...project.assets, a], `Added ${a.kind.toLowerCase()}`)} />
      {viewing && <TextViewer asset={viewing} writable={writable} onClose={() => setViewing(null)} onSave={(text) => { onChange(project.assets.map((x) => (x.id === viewing.id ? { ...x, text } : x)), `Edited ${viewing.name}`); setViewing(null); }} />}
    </Card>
  );
}

function PasteModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (a: VideoAsset) => void }) {
  const [kind, setKind] = useState<VideoAssetKind>("Script");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return toast("Paste some text first", undefined, "warning");
    onAdd({ id: uid("va"), name: name.trim() || `${kind.toLowerCase().replace(/\s+/g, "_")}_pasted.txt`, kind, sizeMb: Math.round((new Blob([text]).size / 1048576) * 1000) / 1000, addedAt: new Date().toISOString(), text });
    setText("");
    setName("");
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Paste script or reel plan" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={add}>Add</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as VideoAssetKind)}>
              {(["Script", "Reel plan", "Dialogue", "Captions"] as VideoAssetKind[]).map((k) => <option key={k}>{k}</option>)}
            </Select>
          </Field>
          <Field label="Name (optional)"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="script_v1.txt" /></Field>
        </div>
        <Field label="Text" hint="One line per caption / beat. Speaker labels like “HOOK:” or “Priya:” are stripped from captions.">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-48 font-mono text-xs" placeholder={"HOOK: Your serum is probably oxidising.\nHere's how to tell in 3 seconds…"} />
        </Field>
      </div>
    </Modal>
  );
}

function TextViewer({ asset, writable, onClose, onSave }: { asset: VideoAsset; writable: boolean; onClose: () => void; onSave: (t: string) => void }) {
  const [text, setText] = useState(asset.text ?? "");
  return (
    <Modal open onClose={onClose} title={asset.name} subtitle={asset.kind} size="lg" footer={writable ? <><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="primary" onClick={() => onSave(text)}>Save</Button></> : undefined}>
      <Textarea value={text} readOnly={!writable} onChange={(e) => setText(e.target.value)} className="min-h-72 font-mono text-xs" />
    </Modal>
  );
}
