"use client";

import { useState } from "react";
import { Crosshair, MousePointerClick, Scissors, Sparkles, Trash2 } from "lucide-react";
import type { VideoClip, VideoProject, VideoTrack } from "@/lib/types";
import { TRACK_META, fmtTC } from "@/lib/ai/video";
import { Button, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { r1 } from "./edit";

const EFFECTS: NonNullable<VideoClip["effect"]>[] = ["none", "zoom", "punch-in", "transition", "whoosh", "logo", "cta"];

export function Inspector({ project, track, clip, writable, onPatch, onSplit, onDelete, onSeek }: {
  project: VideoProject;
  track?: VideoTrack;
  clip?: VideoClip;
  writable: boolean;
  onPatch: (p: Partial<VideoClip>) => void;
  onSplit: () => void;
  onDelete: () => void;
  onSeek: (t: number) => void;
}) {
  if (!clip || !track) return <EmptyState icon={<MousePointerClick className="size-5" />} title="Select a clip" description="Click any clip on the timeline to edit its timing, effect and text." />;
  return <ClipForm key={clip.id} {...{ project, track, clip, writable, onPatch, onSplit, onDelete, onSeek }} />;
}

function ClipForm({ project, track, clip, writable, onPatch, onSplit, onDelete, onSeek }: Parameters<typeof Inspector>[0] & { track: VideoTrack; clip: VideoClip }) {
  const [label, setLabel] = useState(clip.label);
  const [text, setText] = useState(clip.text ?? "");
  const asset = project.assets.find((a) => a.id === clip.assetId);
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) ? r1(Number(v)) : fallback);
  return (
    <div className="space-y-3">
    <fieldset disabled={!writable} className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-sm" style={{ background: TRACK_META[track.kind].color }} />
        <span className="text-xs font-medium text-fg-2">{TRACK_META[track.kind].label} clip</span>
        <span className="ml-auto font-mono text-[11px] text-fg-3">{(clip.end - clip.start).toFixed(1)}s</span>
      </div>
      <Field label="Label">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== clip.label && onPatch({ label })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start (s)">
          <Input key={`s${clip.start}`} type="number" step={0.1} min={0} defaultValue={clip.start} onBlur={(e) => { const s = Math.max(0, Math.min(num(e.target.value, clip.start), clip.end - 0.2)); if (s !== clip.start) onPatch({ start: s }); }} />
        </Field>
        <Field label="End (s)">
          <Input key={`e${clip.end}`} type="number" step={0.1} min={0} defaultValue={clip.end} onBlur={(e) => { const en = Math.max(clip.start + 0.2, num(e.target.value, clip.end)); if (en !== clip.end) onPatch({ end: en }); }} />
        </Field>
      </div>
      <Field label="Effect">
        <Select value={clip.effect ?? "none"} onChange={(e) => onPatch({ effect: e.target.value as VideoClip["effect"] })}>
          {EFFECTS.map((x) => <option key={x}>{x}</option>)}
        </Select>
      </Field>
      {(track.kind === "caption" || track.kind === "overlay" || clip.text !== undefined) && (
        <Field label={track.kind === "caption" ? "Caption text" : "Overlay text"}>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== (clip.text ?? "") && onPatch({ text })} className="min-h-16" />
        </Field>
      )}
      {(asset || clip.srcIn !== undefined) && (
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-2">
          <p><span className="text-fg-3">Source:</span> {asset?.name ?? "—"}</p>
          {clip.srcIn !== undefined && <p><span className="text-fg-3">In-point:</span> {fmtTC(clip.srcIn)} → {fmtTC(clip.srcIn + clip.end - clip.start)}</p>}
        </div>
      )}
      {clip.aiReason && (
        <div className="rounded-lg border border-accent/30 bg-accent-soft/50 px-3 py-2 text-xs text-fg-2">
          <p className="mb-0.5 flex items-center gap-1 font-medium text-accent-text"><Sparkles className="size-3" /> Why the AI placed this</p>
          {clip.aiReason}
        </div>
      )}
    </fieldset>
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button size="xs" variant="outline" type="button" onClick={() => onSeek(clip.start)} icon={<Crosshair className="size-3.5" />}>Go to clip</Button>
        {writable && <Button size="xs" variant="outline" type="button" onClick={onSplit} icon={<Scissors className="size-3.5" />}>Split at playhead</Button>}
        {writable && <Button size="xs" variant="ghost" type="button" onClick={onDelete} icon={<Trash2 className="size-3.5" />} className="text-danger">Delete</Button>}
      </div>
    </div>
  );
}
