"use client";

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Captions, Eye, EyeOff, Magnet, Maximize2, Music, Plus, Redo2, Scissors, Sparkles, Trash2, Undo2, Volume2, VolumeX, ZoomIn, ZoomOut } from "lucide-react";
import type { VideoClip, VideoTrack } from "@/lib/types";
import { TRACK_META, fmtTC, sortTracks } from "@/lib/ai/video";
import { cn } from "@/lib/utils";
import { Button, Card } from "@/components/ui";
import { addClip, addableKinds, r1, toggleMute, updateClip } from "./edit";

const AUDIO_KINDS = new Set(["music", "sfx"]);
const rowH = (k: string) => (k === "video" ? 46 : 32);

interface Drag {
  clipId: string;
  mode: "move" | "l" | "r";
  x0: number;
  s0: number;
  e0: number;
  src0?: number;
  moved: boolean;
  edges: number[];
}

export function Timeline(props: {
  projectId: string;
  tracks: VideoTrack[];
  time: number;
  duration: number;
  onSeek: (t: number) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCommit: (tracks: VideoTrack[]) => void;
  onSplit: () => void;
  onDelete: () => void;
  writable: boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const { tracks, time, duration, onSeek, selectedId, onSelect, onCommit, writable } = props;
  const [pps, setPps] = useState(36); // pixels per second
  const [snapOn, setSnapOn] = useState(true);
  const [preview, setPreview] = useState<VideoTrack[] | null>(null);
  const drag = useRef<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const shown = sortTracks(preview ?? tracks);
  const width = Math.max(duration, 5) * pps + 80;

  // Keep the playhead in view.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const x = time * pps;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - 80);
  }, [time, pps]);

  const fit = () => {
    const w = scroller.current?.clientWidth ?? 800;
    setPps(Math.max(8, Math.min(240, (w - 60) / Math.max(duration, 5))));
  };
  const tickStep = pps >= 120 ? 0.5 : pps >= 50 ? 1 : pps >= 24 ? 2 : pps >= 12 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 5; t += tickStep) ticks.push(r1(t));

  // ----- ruler scrubbing -----
  const seekFromEvent = (e: RPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(duration, r1((e.clientX - rect.left) / pps))));
  };

  // ----- clip drag / trim -----
  const startDrag = (e: RPointerEvent<HTMLElement>, clip: VideoClip, mode: Drag["mode"]) => {
    e.stopPropagation();
    onSelect(clip.id);
    if (!writable) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const edges = [0, time, ...tracks.flatMap((t) => t.clips.filter((c) => c.id !== clip.id).flatMap((c) => [c.start, c.end]))];
    drag.current = { clipId: clip.id, mode, x0: e.clientX, s0: clip.start, e0: clip.end, src0: clip.srcIn, moved: false, edges };
  };
  const snap = (v: number, edges: number[]) => {
    if (snapOn) {
      const thr = 8 / pps;
      let best: number | undefined;
      for (const ed of edges) if (Math.abs(ed - v) < thr && (best === undefined || Math.abs(ed - v) < Math.abs(best - v))) best = ed;
      if (best !== undefined) return { v: best, snapped: true };
    }
    return { v: r1(v), snapped: false };
  };
  const moveDrag = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 3) return;
    d.moved = true;
    const dx = (e.clientX - d.x0) / pps;
    let s = d.s0;
    let en = d.e0;
    let srcIn = d.src0;
    if (d.mode === "move") {
      const len = d.e0 - d.s0;
      const a = snap(d.s0 + dx, d.edges);
      const b = snap(d.e0 + dx, d.edges);
      s = a.snapped ? a.v : b.snapped ? b.v - len : a.v;
      s = Math.max(0, r1(s));
      en = r1(s + len);
    } else if (d.mode === "l") {
      s = Math.max(0, Math.min(snap(d.s0 + dx, d.edges).v, d.e0 - 0.2));
      if (d.src0 !== undefined) srcIn = Math.max(0, r1(d.src0 + (s - d.s0)));
      s = r1(s);
    } else {
      en = r1(Math.max(snap(d.e0 + dx, d.edges).v, d.s0 + 0.2));
    }
    setPreview(updateClip(tracks, d.clipId, { start: s, end: en, ...(srcIn !== undefined ? { srcIn } : {}) }));
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && preview) onCommit(preview);
    setPreview(null);
  };

  const add = (kind: (typeof addableKinds)[number]) => {
    const r = addClip(tracks, kind, time, props.projectId);
    onCommit(r.tracks);
    if (r.newId) onSelect(r.newId);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
        <span className="text-[13px] font-semibold mr-1">Timeline</span>
        <span className="font-mono text-xs tabular-nums text-fg-2 mr-2">{fmtTC(time)} / {fmtTC(duration)}</span>
        <Button size="xs" variant="ghost" onClick={() => setPps((p) => Math.max(8, p / 1.4))} title="Zoom out" aria-label="Zoom out" icon={<ZoomOut className="size-3.5" />} />
        <input type="range" min={8} max={240} value={Math.round(pps)} onChange={(e) => setPps(Number(e.target.value))} className="w-20 accent-[var(--accent)]" aria-label="Timeline zoom" />
        <Button size="xs" variant="ghost" onClick={() => setPps((p) => Math.min(240, p * 1.4))} title="Zoom in" aria-label="Zoom in" icon={<ZoomIn className="size-3.5" />} />
        <Button size="xs" variant="ghost" onClick={fit} icon={<Maximize2 className="size-3.5" />}>Fit</Button>
        <Button size="xs" variant={snapOn ? "secondary" : "ghost"} onClick={() => setSnapOn((v) => !v)} icon={<Magnet className="size-3.5" />} title="Snap to 0.1s and clip edges">Snap</Button>
        {writable && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            <Button size="xs" variant="ghost" onClick={props.undo} disabled={!props.canUndo} icon={<Undo2 className="size-3.5" />} title="Undo (Ctrl+Z)" aria-label="Undo" />
            <Button size="xs" variant="ghost" onClick={props.redo} disabled={!props.canRedo} icon={<Redo2 className="size-3.5" />} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" />
            <Button size="xs" variant="ghost" onClick={props.onSplit} icon={<Scissors className="size-3.5" />} title="Split at playhead (S)">Split</Button>
            <Button size="xs" variant="ghost" onClick={props.onDelete} disabled={!selectedId} icon={<Trash2 className="size-3.5" />} title="Delete clip (Del)">Delete</Button>
            <span className="mx-1 h-4 w-px bg-border" />
            <Button size="xs" variant="ghost" onClick={() => add("caption")} icon={<Captions className="size-3.5" />}>Caption</Button>
            <Button size="xs" variant="ghost" onClick={() => add("broll")} icon={<Plus className="size-3.5" />}>B-roll</Button>
            <Button size="xs" variant="ghost" onClick={() => add("sfx")} icon={<Music className="size-3.5" />}>SFX</Button>
            <Button size="xs" variant="ghost" onClick={() => add("overlay")} icon={<Plus className="size-3.5" />}>Text</Button>
          </>
        )}
      </div>

      <div className="flex">
        {/* Track headers */}
        <div className="w-28 shrink-0 border-r border-border bg-surface-2/40">
          <div className="h-6 border-b border-border" />
          {shown.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5 border-b border-border px-2" style={{ height: rowH(t.kind) }}>
              <span className="size-2 rounded-sm shrink-0" style={{ background: TRACK_META[t.kind].color }} />
              <span className={cn("text-xs font-medium truncate flex-1", t.muted && "text-fg-3 line-through")}>{TRACK_META[t.kind].label}</span>
              {writable && (
                <button onClick={() => onCommit(toggleMute(tracks, t.id))} className="rounded p-0.5 text-fg-3 hover:bg-surface-2 hover:text-fg" title={t.muted ? "Unmute track" : "Mute track"} aria-label={t.muted ? "Unmute track" : "Mute track"}>
                  {AUDIO_KINDS.has(t.kind) ? t.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" /> : t.muted ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Lanes */}
        <div ref={scroller} className="relative flex-1 overflow-x-auto overflow-y-hidden select-none">
          <div className="relative" style={{ width }}>
            <div
              className="relative h-6 border-b border-border bg-surface-2/40 cursor-col-resize"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                seekFromEvent(e);
              }}
              onPointerMove={(e) => e.buttons & 1 && seekFromEvent(e)}
            >
              {ticks.map((t) => {
                const major = Math.abs(t / (tickStep * 2) - Math.round(t / (tickStep * 2))) < 1e-6 || tickStep >= 5;
                return (
                  <div key={t} className="absolute top-0 h-full" style={{ left: t * pps }}>
                    <div className={cn("w-px bg-border-strong", major ? "h-2.5" : "h-1.5")} />
                    {major && <span className="absolute top-2 left-1 text-[9px] text-fg-3 tabular-nums">{fmtTC(t, false)}</span>}
                  </div>
                );
              })}
            </div>

            {shown.map((t) => (
              <div
                key={t.id}
                className="relative border-b border-border"
                style={{ height: rowH(t.kind) }}
                onPointerDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  onSeek(Math.max(0, Math.min(duration, r1((e.clientX - rect.left) / pps))));
                  onSelect(null);
                }}
              >
                {t.clips.map((c) => {
                  const color = TRACK_META[t.kind].color;
                  const w = Math.max(4, (c.end - c.start) * pps);
                  const sel = c.id === selectedId;
                  return (
                    <div
                      key={c.id}
                      title={`${c.label} · ${fmtTC(c.start)}–${fmtTC(c.end)}${c.aiReason ? `\nAI: ${c.aiReason}` : ""}`}
                      onPointerDown={(e) => startDrag(e, c, "move")}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      className={cn("absolute top-1 bottom-1 rounded-md border overflow-hidden touch-none", writable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", sel && "ring-2 ring-accent z-10", t.muted && "opacity-40")}
                      style={{ left: c.start * pps, width: w, background: `color-mix(in srgb, ${color} ${sel ? 34 : 22}%, var(--surface))`, borderColor: color }}
                    >
                      <div className="flex h-full items-center gap-1 px-1.5 text-[10px] leading-tight text-fg whitespace-nowrap">
                        {c.aiReason && w > 40 && <Sparkles className="size-2.5 shrink-0 text-fg-3" />}
                        <span className="truncate">{t.kind === "caption" ? c.text ?? c.label : c.label}</span>
                        {c.effect && c.effect !== "none" && w > 90 && <span className="ml-auto shrink-0 rounded bg-surface/70 px-1 text-[9px] text-fg-2">{c.effect}</span>}
                      </div>
                      {writable && (
                        <>
                          <span onPointerDown={(e) => startDrag(e, c, "l")} className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize hover:bg-fg/20" />
                          <span onPointerDown={(e) => startDrag(e, c, "r")} className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-fg/20" />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Playhead */}
            <div className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-danger" style={{ left: time * pps }}>
              <span className="absolute -top-0 -left-1.5 size-3 rotate-45 rounded-[2px] bg-danger" />
            </div>
          </div>
        </div>
      </div>
      <p className="px-3 py-1.5 text-[11px] text-fg-3 border-t border-border">
        Drag clips to move · drag edges to trim · click the ruler to scrub · <kbd className="font-mono">Space</kbd> play · <kbd className="font-mono">S</kbd> split · <kbd className="font-mono">Del</kbd> delete · <kbd className="font-mono">Ctrl+Z</kbd> undo
      </p>
    </Card>
  );
}
