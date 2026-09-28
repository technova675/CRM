import type { VideoClip, VideoTrack, VideoTrackKind } from "@/lib/types";
import { uid } from "@/lib/utils";

// Pure timeline editing helpers used by the human editing interface.
export const r1 = (n: number) => Math.round(n * 10) / 10;

export function findClip(tracks: VideoTrack[], id?: string | null) {
  if (!id) return undefined;
  for (const t of tracks) {
    const c = t.clips.find((x) => x.id === id);
    if (c) return { track: t, clip: c };
  }
  return undefined;
}

export function updateClip(tracks: VideoTrack[], id: string, patch: Partial<VideoClip>): VideoTrack[] {
  return tracks.map((t) => (t.clips.some((c) => c.id === id) ? { ...t, clips: t.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)).sort((a, b) => a.start - b.start) } : t));
}

export function deleteClip(tracks: VideoTrack[], id: string): VideoTrack[] {
  return tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== id) }));
}

export function clipAt(track: VideoTrack | undefined, t: number) {
  if (!track || track.muted) return undefined;
  // Last clip wins when clips overlap (it's drawn on top).
  let hit: VideoClip | undefined;
  for (const c of track.clips) if (c.start <= t && c.end > t) hit = c;
  return hit;
}

export function splitClip(tracks: VideoTrack[], id: string, at: number): { tracks: VideoTrack[]; newId?: string } {
  const f = findClip(tracks, id);
  if (!f || at <= f.clip.start + 0.1 || at >= f.clip.end - 0.1) return { tracks };
  const t = r1(at);
  const newId = uid("clip");
  const a: VideoClip = { ...f.clip, end: t };
  const b: VideoClip = { ...f.clip, id: newId, start: t, srcIn: f.clip.srcIn !== undefined ? r1(f.clip.srcIn + (t - f.clip.start)) : undefined, effect: f.clip.effect === "punch-in" ? "none" : f.clip.effect, aiReason: f.clip.aiReason ? `Split from "${f.clip.label}"` : undefined };
  return { tracks: tracks.map((tr) => (tr.id === f.track.id ? { ...tr, clips: tr.clips.flatMap((c) => (c.id === id ? [a, b] : [c])) } : tr)), newId };
}

const NEW_CLIP: Partial<Record<VideoTrackKind, (t: number) => Omit<VideoClip, "id">>> = {
  caption: (t) => ({ label: "New caption", text: "New caption", start: t, end: t + 2, effect: "none" }),
  broll: (t) => ({ label: "B-roll: custom", start: t, end: t + 2, effect: "none" }),
  sfx: (t) => ({ label: "Pop", start: t, end: t + 0.5, effect: "none" }),
  overlay: (t) => ({ label: "Text overlay", text: "Your text", start: t, end: t + 2.5, effect: "none" }),
};
export const addableKinds = Object.keys(NEW_CLIP) as VideoTrackKind[];

export function addClip(tracks: VideoTrack[], kind: VideoTrackKind, at: number, projectId: string): { tracks: VideoTrack[]; newId?: string } {
  const make = NEW_CLIP[kind];
  if (!make) return { tracks };
  const newId = uid("clip");
  const base = make(r1(at));
  const clip: VideoClip = { ...base, id: newId, start: r1(base.start), end: r1(base.end) };
  const has = tracks.some((t) => t.kind === kind);
  const next = has
    ? tracks.map((t) => (t.kind === kind ? { ...t, clips: [...t.clips, clip].sort((a, b) => a.start - b.start) } : t))
    : [...tracks, { id: `${projectId}_trk_${kind}`, kind, label: kind, clips: [clip] }];
  return { tracks: next, newId };
}

export function toggleMute(tracks: VideoTrack[], trackId: string): VideoTrack[] {
  return tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t));
}
