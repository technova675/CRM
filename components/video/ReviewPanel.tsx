"use client";

import { useState } from "react";
import { Check, MessageSquarePlus, RotateCcw, Trash2, Wand2 } from "lucide-react";
import type { VideoProject, VideoTrack } from "@/lib/types";
import { fmtTC, type RevisionResult } from "@/lib/ai/video";
import { useCRM, useMe } from "@/lib/store";
import { cn, relTime, uid } from "@/lib/utils";
import { Button, MemberAvatar, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { draftMinutes, reviseVideo } from "./actions";

const KEYWORDS = ["shorter / tighten", "faster", "remove intro", "stronger hook", "more b-roll", "bigger captions", "change music", "add CTA"];

export function ReviewPanel({ project, tracks, time, writable, onSeek, onTracksReplaced }: { project: VideoProject; tracks: VideoTrack[]; time: number; writable: boolean; onSeek: (t: number) => void; onTracksReplaced: (t: VideoTrack[]) => void }) {
  const me = useMe();
  const patch = useCRM((s) => s.patch);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<RevisionResult | null>(null);
  const notes = [...project.reviewNotes].sort((a, b) => Number(!!a.resolved) - Number(!!b.resolved) || (a.timecode ?? 0) - (b.timecode ?? 0));
  const open = project.reviewNotes.filter((n) => !n.resolved);

  const add = () => {
    if (!body.trim()) return;
    patch("videos", project.id, {
      reviewNotes: [...project.reviewNotes, { id: uid("vn"), authorId: me.id, at: new Date().toISOString(), body: body.trim(), timecode: Math.round(time * 10) / 10 }],
      status: project.status === "Draft Ready" || project.status === "Approved" ? "In Review" : project.status,
      updatedAt: new Date().toISOString(),
    });
    setBody("");
  };
  const setNote = (id: string, p: Partial<VideoProject["reviewNotes"][number]> | null) =>
    patch("videos", project.id, { reviewNotes: p ? project.reviewNotes.map((n) => (n.id === id ? { ...n, ...p } : n)) : project.reviewNotes.filter((n) => n.id !== id) });

  const revise = async () => {
    setBusy(true);
    const res = await reviseVideo(project.id, tracks);
    setBusy(false);
    if (!res) return;
    setLast(res);
    onTracksReplaced(res.tracks);
    toast(res.changes.length ? `AI applied ${res.changes.length} change${res.changes.length > 1 ? "s" : ""}` : "No notes matched a known edit", res.unmatched.length ? `${res.unmatched.length} note(s) need a manual edit.` : undefined, "ai");
  };

  return (
    <div className="space-y-3">
      {writable && (
        <div className="space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. Make it faster — the middle drags" className="min-h-16" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add(); }} />
          <div className="flex items-center gap-2">
            <Button size="xs" variant="outline" onClick={add} disabled={!body.trim()} icon={<MessageSquarePlus className="size-3.5" />}>Add note at {fmtTC(time)}</Button>
            <Button size="xs" variant="ai" className="ml-auto" onClick={revise} loading={busy} disabled={!open.length || !tracks.length} icon={<Wand2 className="size-3.5" />}>AI revise ({open.length})</Button>
          </div>
          <p className="text-[11px] text-fg-3">AI understands: {KEYWORDS.join(" · ")}. Each revision uses {draftMinutes(project)} video min and bumps a version.</p>
        </div>
      )}

      {last && (
        <div className="rounded-lg border border-accent/30 bg-accent-soft/40 p-2.5 text-xs">
          <p className="font-medium text-accent-text mb-1">Last revision</p>
          {last.changes.length ? <ul className="list-disc pl-4 space-y-0.5 text-fg-2">{last.changes.map((c, i) => <li key={i}>{c}</li>)}</ul> : <p className="text-fg-3">No changes applied.</p>}
          {last.unmatched.length > 0 && <p className="mt-1 text-warning">{last.unmatched.length} note(s) weren&apos;t understood — edit manually on the timeline.</p>}
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-xs text-fg-3 text-center py-6">No review notes yet. Scrub to a moment and add a note.</p>
      ) : (
        <ul className="space-y-1.5">
          {notes.map((n) => (
            <li key={n.id} className={cn("rounded-lg border border-border p-2", n.resolved && "opacity-60")}>
              <div className="flex items-center gap-2">
                <MemberAvatar id={n.authorId} size={18} />
                {n.timecode !== undefined && <button onClick={() => onSeek(n.timecode!)} className="rounded bg-surface-2 px-1.5 font-mono text-[10px] text-accent-text hover:bg-accent-soft">{fmtTC(n.timecode)}</button>}
                <span className="text-[10px] text-fg-3">{relTime(n.at)}</span>
                {writable && (
                  <span className="ml-auto flex items-center gap-0.5">
                    <button onClick={() => setNote(n.id, { resolved: !n.resolved })} className="rounded p-0.5 text-fg-3 hover:bg-surface-2 hover:text-fg" title={n.resolved ? "Reopen" : "Resolve"} aria-label={n.resolved ? "Reopen note" : "Resolve note"}>{n.resolved ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}</button>
                    {n.authorId === me.id && <button onClick={() => setNote(n.id, null)} className="rounded p-0.5 text-fg-3 hover:bg-danger-soft hover:text-danger" title="Delete" aria-label="Delete note"><Trash2 className="size-3.5" /></button>}
                  </span>
                )}
              </div>
              <p className={cn("mt-1 text-xs text-fg-2", n.resolved && "line-through")}>{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
