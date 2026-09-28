"use client";

import { useEffect, useRef } from "react";
import { Pause, Play, SkipBack, StepBack, StepForward } from "lucide-react";
import type { VideoAsset, VideoClip, VideoProject, VideoTrack } from "@/lib/types";
import { ASPECTS, fmtTC, type Aspect } from "@/lib/ai/video";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, Segmented, Toggle } from "@/components/ui";
import { clipAt } from "./edit";
import { useMedia } from "./media";

// Keeps a media element in sync with the timeline playhead.
function useSync(ref: React.RefObject<HTMLMediaElement | null>, desired: number | null, playing: boolean, src?: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el || desired === null) return;
    if (Math.abs(el.currentTime - desired) > 0.35) {
      try {
        el.currentTime = desired;
      } catch {
        /* not seekable yet */
      }
    }
    if (playing && el.paused) void el.play().catch(() => undefined);
    if (!playing && !el.paused) el.pause();
  }, [ref, desired, playing, src]);
}

function Caption({ clip, time, style, aspect }: { clip: VideoClip; time: number; style: VideoProject["settings"]["captionStyle"]; aspect: Aspect }) {
  const text = clip.text ?? clip.label;
  const words = text.split(/\s+/).filter(Boolean);
  const progress = Math.min(0.999, Math.max(0, (time - clip.start) / Math.max(0.1, clip.end - clip.start)));
  const idx = Math.floor(progress * words.length);
  const bottom = aspect === "9:16" ? "24%" : "10%";
  if (style === "None") return null;
  if (style === "Clean subtitles")
    return (
      <div className="absolute inset-x-3 flex justify-center" style={{ bottom }}>
        <span className="rounded bg-black/65 px-2 py-1 text-center text-[13px] leading-snug text-white">{text}</span>
      </div>
    );
  const chunk = style === "Bold kinetic" ? 3 : 5;
  const start = Math.floor(idx / chunk) * chunk;
  const shown = words.slice(start, start + chunk);
  return (
    <div className="absolute inset-x-3 flex flex-wrap justify-center gap-x-1.5 gap-y-0.5" style={{ bottom }}>
      {shown.map((w, i) => {
        const cur = start + i === idx;
        return style === "Bold kinetic" ? (
          <span key={start + i} className={cn("text-xl font-black uppercase tracking-tight text-white [text-shadow:0_2px_0_rgba(0,0,0,.8)] transition-transform", cur && "scale-110 text-[var(--chart-4)]")}>{w}</span>
        ) : (
          <span key={start + i} className={cn("rounded px-1 text-base font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,.9)]", cur && "bg-accent")}>{w}</span>
        );
      })}
    </div>
  );
}

export function Monitor({ project, tracks, time, duration, playing, onToggle, onSeek, aspect, onAspect, safe, onSafe }: {
  project: VideoProject;
  tracks: VideoTrack[];
  time: number;
  duration: number;
  playing: boolean;
  onToggle: () => void;
  onSeek: (t: number) => void;
  aspect: Aspect;
  onAspect: (a: Aspect) => void;
  safe: boolean;
  onSafe: (v: boolean) => void;
}) {
  const urls = useMedia((s) => s.urls);
  const byKind = (k: VideoTrack["kind"]) => tracks.find((t) => t.kind === k);
  const vClip = clipAt(byKind("video"), time);
  const bClip = clipAt(byKind("broll"), time);
  const cap = clipAt(byKind("caption"), time);
  const overlays = (byKind("overlay")?.clips ?? []).filter((c) => !byKind("overlay")?.muted && c.start <= time && c.end > time);
  const music = clipAt(byKind("music"), time);
  const asset = (id?: string): VideoAsset | undefined => project.assets.find((a) => a.id === id);

  // B-roll with a playable file takes over the picture; otherwise the main clip plays.
  const bUrl = bClip?.assetId && urls[bClip.assetId]?.type.startsWith("video") ? urls[bClip.assetId]!.url : undefined;
  const active = bUrl ? bClip : vClip;
  const activeUrl = bUrl ?? (vClip?.assetId && urls[vClip.assetId]?.type.startsWith("video") ? urls[vClip.assetId]!.url : undefined);
  const desired = active ? (active.srcIn ?? 0) + (time - active.start) : null;
  const videoRef = useRef<HTMLVideoElement>(null);
  useSync(videoRef, activeUrl ? desired : null, playing, activeUrl);

  const mUrl = music?.assetId && urls[music.assetId]?.type.startsWith("audio") ? urls[music.assetId]!.url : undefined;
  const audioRef = useRef<HTMLAudioElement>(null);
  useSync(audioRef, mUrl && music ? time - music.start : null, playing, mUrl);

  const zoom = vClip && (vClip.effect === "zoom" || vClip.effect === "punch-in") ? 1 + Math.min(1, (time - vClip.start) / Math.max(0.1, vClip.end - vClip.start)) * (vClip.effect === "punch-in" ? 0.15 : 0.08) : 1;
  const fading = vClip?.effect === "transition" && time - vClip.start < 0.3;
  const logo = overlays.find((o) => o.effect === "logo");
  const cta = overlays.find((o) => o.effect === "cta");
  const texts = overlays.filter((o) => o.effect !== "logo" && o.effect !== "cta");
  const frame = aspect === "9:16" ? { height: 400, aspectRatio: "9 / 16" } : aspect === "1:1" ? { height: 360, aspectRatio: "1 / 1" } : { width: "100%", aspectRatio: "16 / 9" };

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <Segmented value={aspect} onChange={onAspect} options={ASPECTS.map((a) => ({ value: a, label: a }))} />
        <label className="flex items-center gap-2 text-xs text-fg-2">
          Safe zones <Toggle checked={safe} onChange={onSafe} label="Safe zones" />
        </label>
      </div>
      <div className="flex justify-center rounded-lg bg-surface-2 p-2">
        <div className="relative max-w-full overflow-hidden rounded-md bg-black" style={{ ...frame, maxHeight: 420 }}>
          <div className={cn("absolute inset-0 transition-opacity duration-200", fading && "opacity-60")} style={{ transform: `scale(${zoom})` }}>
            {activeUrl ? (
              <video ref={videoRef} src={activeUrl} muted={!!byKind("video")?.muted} playsInline className="h-full w-full object-cover" />
            ) : active ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-4 text-center" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${bClip ? "var(--chart-2)" : "var(--chart-1)"} 55%, #000), #000)` }}>
                <p className="text-sm font-semibold text-white">{active.label}</p>
                {asset(active.assetId) && <p className="text-[11px] text-white/70">{asset(active.assetId)!.name} · in {fmtTC(active.srcIn ?? 0)}</p>}
                <p className="mt-2 max-w-[220px] text-[10px] leading-snug text-white/60">{active.assetId ? "Metadata only — re-attach this file in Assets to preview it this session." : bClip ? "Suggested B-roll — no file attached." : "No footage for this shot."}</p>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-white/50">{tracks.some((t) => t.clips.length) ? "Black — no clip at playhead" : "Generate a draft to build the timeline"}</div>
            )}
          </div>
          {mUrl && <audio ref={audioRef} src={mUrl} muted={!!byKind("music")?.muted} />}

          {bClip && !bUrl && vClip && <Badge tone="info" className="absolute left-2 top-2">{bClip.label}</Badge>}
          {logo && <span className="absolute right-2 top-2 rounded bg-white/85 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black" style={{ top: aspect === "9:16" ? "13%" : undefined }}>{asset(logo.assetId)?.name.replace(/\.[^.]+$/, "") ?? project.settings.brandTemplate}</span>}
          {texts.map((o) => <div key={o.id} className="absolute inset-x-4 top-[30%] text-center text-lg font-bold text-white [text-shadow:0_2px_4px_rgba(0,0,0,.8)]">{o.text ?? o.label}</div>)}
          {cap && <Caption clip={cap} time={time} style={project.settings.captionStyle} aspect={aspect} />}
          {cta && (
            <div className="absolute inset-x-3 bottom-[8%] rounded-lg bg-accent px-3 py-2 text-center text-[13px] font-semibold text-white shadow-lg" style={{ bottom: aspect === "9:16" ? "22%" : "8%" }}>
              {cta.text ?? "Learn more"}
            </div>
          )}
          {safe && (
            <div className="pointer-events-none absolute inset-0">
              {aspect === "9:16" ? (
                <>
                  <div className="absolute inset-x-0 top-0 h-[12%] border-b border-dashed border-white/60 bg-white/10" />
                  <div className="absolute inset-x-0 bottom-0 h-[20%] border-t border-dashed border-white/60 bg-white/10" />
                  <div className="absolute right-0 top-[12%] bottom-[20%] w-[14%] border-l border-dashed border-white/40 bg-white/5" />
                  <span className="absolute left-1 bottom-1 text-[8px] text-white/80">UI zone (caption / CTA overlay)</span>
                </>
              ) : (
                <>
                  <div className="absolute inset-[5%] border border-dashed border-white/50" />
                  <div className="absolute inset-[10%] border border-dashed border-white/30" />
                  <span className="absolute left-[10%] top-[10%] text-[8px] text-white/80">Title safe</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="xs" variant="ghost" onClick={() => onSeek(0)} icon={<SkipBack className="size-3.5" />} aria-label="Go to start" />
        <Button size="xs" variant="ghost" onClick={() => onSeek(Math.max(0, time - 1))} icon={<StepBack className="size-3.5" />} aria-label="Back 1s" />
        <Button size="sm" variant="primary" onClick={onToggle} icon={playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}>{playing ? "Pause" : "Play"}</Button>
        <Button size="xs" variant="ghost" onClick={() => onSeek(Math.min(duration, time + 1))} icon={<StepForward className="size-3.5" />} aria-label="Forward 1s" />
        <span className="font-mono text-xs tabular-nums">{fmtTC(time)} <span className="text-fg-3">/ {fmtTC(duration)}</span></span>
        <span className="ml-auto min-w-0 truncate text-xs text-fg-2">{active ? <>{active.label}{active.effect && active.effect !== "none" && <span className="text-fg-3"> · {active.effect}</span>}</> : "—"}</span>
      </div>
    </Card>
  );
}
