import type { InsightItem, VideoAsset, VideoAssetKind, VideoClip, VideoProject, VideoTrack, VideoTrackKind } from "../types";

// ---------------------------------------------------------------------------
// AI Video Editor — local, deterministic engine (no store imports, safe for seeds).
// Everything here is derived from uploaded file metadata (names, durations, sizes)
// and uploaded text (scripts, dialogues, captions, reel plans). No pixels or audio
// are analysed: moment "scores" are heuristics and are labelled as assumptions.
// ---------------------------------------------------------------------------

export type Aspect = VideoProject["settings"]["aspect"];
export type Settings = VideoProject["settings"];
export type VideoVersion = VideoProject["versions"][number];
export type ReviewNote = VideoProject["reviewNotes"][number];
export type Analysis = NonNullable<VideoProject["analysis"]>;

export const ASPECTS: Aspect[] = ["9:16", "1:1", "16:9"];
export const ASSET_KINDS: VideoAssetKind[] = ["Raw video", "Script", "Dialogue", "Captions", "Brand asset", "Logo", "Music", "Reference video", "Reel plan"];
export const CAPTION_STYLES: Settings["captionStyle"][] = ["Dynamic word-by-word", "Clean subtitles", "Bold kinetic", "None"];
export const PACES: Settings["pace"][] = ["Fast", "Medium", "Calm"];
export const MUSIC_OPTIONS = ["Upbeat pop", "Lo-fi chill", "Cinematic build", "Corporate light", "Acoustic warm", "No music"];
export const BRAND_TEMPLATES = ["Clean minimal", "Bold D2C", "Premium dark", "Playful pastel", "Corporate", "None"];
export const STATUS_FLOW: VideoProject["status"][] = ["Uploading", "Analyzing", "Draft Ready", "In Review", "Revising", "Approved", "Exported"];

export const TRACK_ORDER: VideoTrackKind[] = ["overlay", "caption", "broll", "video", "sfx", "music"];
export const TRACK_META: Record<VideoTrackKind, { label: string; color: string }> = {
  video: { label: "Video", color: "var(--chart-1)" },
  broll: { label: "B-roll", color: "var(--chart-2)" },
  caption: { label: "Captions", color: "var(--chart-4)" },
  music: { label: "Music", color: "var(--chart-3)" },
  sfx: { label: "SFX", color: "var(--chart-5)" },
  overlay: { label: "Overlay", color: "var(--chart-6)" },
};

const TEXT_KINDS: VideoAssetKind[] = ["Script", "Dialogue", "Captions", "Reel plan"];
export const isTextKind = (k: VideoAssetKind) => TEXT_KINDS.includes(k);

// ---------- small helpers ----------
const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
export function fmtTC(sec: number, withTenths = true) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return withTenths ? `${m}:${rest.toFixed(1).padStart(4, "0")}` : `${m}:${String(Math.floor(rest)).padStart(2, "0")}`;
}
export function fmtDuration(sec?: number) {
  if (!sec && sec !== 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
export function smpte(sec: number, fps = 30) {
  const total = Math.round(Math.max(0, sec) * fps);
  const f = total % fps;
  const s = Math.floor(total / fps);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(f)}`;
}
const letter = (i: number) => String.fromCharCode(65 + (i % 26));
const STOP = new Set(["about", "after", "again", "their", "there", "these", "those", "which", "while", "would", "could", "should", "every", "where", "because", "really", "being", "your", "yours", "with", "this", "that", "from", "have", "just", "into", "what", "when", "will", "them", "then", "than", "they", "only", "also", "more", "most", "very", "here", "make", "made", "like"]);

// ---------- text parsing ----------
export function splitLines(text?: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let l = raw.trim();
    if (!l || /^\d+$/.test(l) || /-->/.test(l) || /^WEBVTT/i.test(l) || /^#+\s*$/.test(l)) continue;
    l = l.replace(/^#+\s*/, "").replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "").replace(/^\[[^\]]*\]\s*/, "");
    l = l.replace(/^[A-Z][A-Za-z ]{0,20}:\s+/, ""); // speaker / beat labels ("HOOK:", "Priya:")
    if (!l) continue;
    for (const s of l.split(/(?<=[.!?])\s+/)) if (s.trim()) out.push(s.trim());
  }
  return out;
}
const words = (s: string) => s.split(/\s+/).filter(Boolean);
export const assetsOf = (p: Pick<VideoProject, "assets">, k: VideoAssetKind) => p.assets.filter((a) => a.kind === k);

export function scriptLines(p: Pick<VideoProject, "assets">) {
  for (const k of ["Script", "Dialogue", "Captions"] as VideoAssetKind[]) {
    const lines = assetsOf(p, k).flatMap((a) => splitLines(a.text));
    if (lines.length) return { lines, source: k };
  }
  return { lines: [] as string[], source: undefined };
}
export function planBeats(p: Pick<VideoProject, "assets">) {
  return assetsOf(p, "Reel plan").flatMap((a) => (a.text ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^#+\s*$/.test(l)).map((l) => l.replace(/^#+\s*/, "").replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "")));
}
function ctaFrom(p: Pick<VideoProject, "assets" | "objective">) {
  const pool = [...scriptLines(p).lines, ...planBeats(p)];
  const hit = pool.find((l) => /\b(cta|call to action|shop|book|sign up|download|order|visit|link in bio|dm us|enrol|enroll|get yours)\b/i.test(l));
  if (hit) return hit.replace(/^cta\s*[:\-–]\s*/i, "").slice(0, 60);
  if (/lead|sign|enrol|book/i.test(p.objective)) return "Book your free consult";
  if (/sale|purchase|shop|launch|product/i.test(p.objective)) return "Shop now — link in bio";
  return "Learn more";
}
function keywordOf(line?: string) {
  if (!line) return undefined;
  const w = words(line.replace(/[^\p{L}\p{N}\s'-]/gu, " ")).filter((x) => x.length > 4 && !STOP.has(x.toLowerCase()));
  return w.sort((a, b) => b.length - a.length)[0]?.toLowerCase();
}

// Heuristic hook score for an opening line (0..100). Deterministic, explainable.
export function hookScoreOf(line?: string) {
  if (!line) return { score: 0, reasons: [] as string[] };
  const reasons: string[] = [];
  let s = 38;
  if (/\?/.test(line)) { s += 14; reasons.push("asks a question"); }
  if (/\d/.test(line)) { s += 12; reasons.push("uses a number"); }
  if (/\byou(r)?\b/i.test(line)) { s += 10; reasons.push("speaks to the viewer"); }
  const n = words(line).length;
  if (n <= 12) { s += 10; reasons.push(`short (${n} words)`); } else reasons.push(`long (${n} words) — hard to read in 2s`);
  if (/\b(stop|secret|mistake|never|why|how|free|new|before|nobody|truth|finally)\b/i.test(line)) { s += 10; reasons.push("pattern-interrupt word"); }
  return { score: clamp(s, 5, 98), reasons };
}

// ---------- source segmentation ----------
// Raw clips are split into windows; each window gets a deterministic "energy" score
// from its position (no audio/vision model is connected, so this is an estimate).
export const windowScore = (assetId: string, srcIn: number) => Math.round(35 + hash(`${assetId}:${Math.round(srcIn * 10)}`) * 62);
const PACE_LEN: Record<Settings["pace"], number> = { Fast: 2.2, Medium: 3.5, Calm: 5 };
const DEFAULT_RAW_SEC = 30;

interface SourceWindow { asset: VideoAsset; idx: number; srcIn: number; len: number; score: number; silent: boolean }
function rawDuration(a: VideoAsset) {
  return a.durationSec && a.durationSec > 0 ? a.durationSec : DEFAULT_RAW_SEC;
}
function sourceWindows(p: VideoProject, len: number): SourceWindow[] {
  const out: SourceWindow[] = [];
  assetsOf(p, "Raw video").forEach((a, idx) => {
    const dur = rawDuration(a);
    const head = p.settings.removeSilences ? Math.min(0.6, dur * 0.05) : 0; // dead air at head/tail
    for (let t = head; t + Math.min(len, 1) <= dur - head; t += len) {
      const srcIn = r1(t);
      const w = Math.min(len, dur - head - t);
      if (w < 0.8) break;
      const score = windowScore(a.id, srcIn);
      out.push({ asset: a, idx, srcIn, len: r1(w), score, silent: score < 44 });
    }
  });
  return out;
}

// ---------- analysis ----------
export function analyzeProject(p: VideoProject): Analysis {
  const raws = assetsOf(p, "Raw video");
  const known = raws.filter((a) => a.durationSec);
  const sourceDurationSec = r1(raws.reduce((a, r) => a + rawDuration(r), 0));
  const len = PACE_LEN[p.settings.pace];
  const wins = sourceWindows(p, len);
  const beats = planBeats(p);
  const { lines, source } = scriptLines(p);
  const notes: InsightItem[] = [];

  // Scenes: from the reel plan when present (data), otherwise one scene per ~6s of footage (assumption).
  const scenes = beats.length ? beats.length : Math.max(raws.length, Math.round(sourceDurationSec / 6));
  const headTail = p.settings.removeSilences ? raws.reduce((a, r) => a + 2 * Math.min(0.6, rawDuration(r) * 0.05), 0) : 0;
  const silencesRemovedSec = p.settings.removeSilences ? r1(headTail + wins.filter((w) => w.silent).reduce((a, w) => a + w.len, 0)) : 0;
  const highlights = [...wins].filter((w) => !w.silent).sort((a, b) => b.score - a.score).slice(0, 6)
    .map((w) => ({ at: r1(raws.slice(0, w.idx).reduce((a, r) => a + rawDuration(r), 0) + w.srcIn), label: `Clip ${letter(w.idx)} @ ${fmtTC(w.srcIn)} — ${w.asset.name}`, score: w.score }));

  const hook = hookScoreOf(lines[0]);
  const hookScore = lines.length ? hook.score : highlights.length ? Math.round(highlights[0]!.score * 0.8) : 0;

  // --- data (facts from uploads) ---
  if (raws.length) notes.push({ kind: "data", text: `${raws.length} raw clip${raws.length > 1 ? "s" : ""} · ${fmtDuration(sourceDurationSec)} of footage (${raws.reduce((a, r) => a + r.sizeMb, 0).toFixed(0)} MB).`, source: "Uploaded file metadata" });
  else notes.push({ kind: "data", text: "No raw footage uploaded yet — timeline will use placeholder shots.", source: "Project assets" });
  if (raws.length && known.length < raws.length) notes.push({ kind: "assumption", text: `${raws.length - known.length} clip(s) have no readable duration; assumed ${DEFAULT_RAW_SEC}s each.`, source: "Uploaded file metadata" });
  if (lines.length) {
    const wc = lines.reduce((a, l) => a + words(l).length, 0);
    notes.push({ kind: "data", text: `${source}: ${lines.length} lines · ${wc} words → ~${Math.round((wc / 150) * 60)}s of speech at 150 wpm (target ${p.settings.targetDurationSec}s).`, source: `Uploaded ${source?.toLowerCase()}` });
    notes.push({ kind: "data", text: `Opening line: "${lines[0]!.slice(0, 90)}" — hook score ${hook.score}/100 (${hook.reasons.join(", ")}).`, source: `${source} line 1` });
    if (wc / 150 * 60 > p.settings.targetDurationSec * 1.15) notes.push({ kind: "recommendation", text: `Script reads longer than the ${p.settings.targetDurationSec}s target — trim ~${Math.round(wc - (p.settings.targetDurationSec / 60) * 150)} words or raise the target duration.` });
  } else notes.push({ kind: "assumption", text: "No script, dialogue or caption file — captions need a transcript (speech-to-text backend not connected). Paste the script to generate captions." });
  if (beats.length) notes.push({ kind: "data", text: `Reel plan: ${beats.length} beats → ${beats.length} scenes. First beat: "${beats[0]!.slice(0, 70)}".`, source: "Uploaded reel plan" });
  else if (raws.length) notes.push({ kind: "assumption", text: `~${scenes} scenes estimated from footage length (one per ~6s) — scene-cut detection model not connected.` });
  const brand = [...assetsOf(p, "Logo"), ...assetsOf(p, "Brand asset")];
  notes.push(brand.length
    ? { kind: "data", text: `Brand kit: ${brand.map((b) => b.name).join(", ")} · template "${p.settings.brandTemplate}".`, source: "Uploaded brand assets" }
    : { kind: "assumption", text: `No logo uploaded — overlays use the "${p.settings.brandTemplate}" template text only.` });

  // --- assumptions (inferred, not measured) ---
  if (p.settings.removeSilences && raws.length) {
    const worst = wins.filter((w) => w.silent).slice(0, 2).map((w) => `Clip ${letter(w.idx)} ${fmtTC(w.srcIn)}`);
    notes.push({ kind: "assumption", text: `Likely ~${silencesRemovedSec}s of silence / dead air${worst.length ? ` (e.g. ${worst.join(", ")})` : ""} — estimated from pacing heuristics, no audio waveform analysis connected.` });
  }
  if (highlights.length) notes.push({ kind: "assumption", text: `Top moment: ${highlights[0]!.label} (score ${highlights[0]!.score}). Highlight scores are heuristic — verify in the preview.` });

  // --- recommendations ---
  if (p.settings.hookOptimization && highlights.length) notes.push({ kind: "recommendation", text: `Open on the highest-scoring moment (${fmtTC(highlights[0]!.at)} in source) and keep the first shot under 2s.` });
  if (hookScore && hookScore < 65) notes.push({ kind: "recommendation", text: "Hook is weak — rewrite the first line as a question or a number-led claim (e.g. \"3 mistakes…\")." });
  if (sourceDurationSec && sourceDurationSec < p.settings.targetDurationSec) notes.push({ kind: "recommendation", text: `Only ${fmtDuration(sourceDurationSec)} of footage for a ${p.settings.targetDurationSec}s target — add B-roll or lower the target.` });
  const refs = assetsOf(p, "Reference video");
  if (refs.length) notes.push({ kind: "recommendation", text: `Match pacing of reference "${refs[0]!.name}" — review it against the ${p.settings.pace.toLowerCase()} pace setting.` });

  return { scenes, silencesRemovedSec, sourceDurationSec, hookScore, highlights, notes };
}

// ---------- timeline ----------
const track = (p: Pick<VideoProject, "id">, kind: VideoTrackKind, clips: VideoClip[]): VideoTrack => ({ id: `${p.id}_trk_${kind}`, kind, label: TRACK_META[kind].label, clips });
export const timelineEnd = (tracks: VideoTrack[]) => {
  const v = tracks.find((t) => t.kind === "video");
  const src = v && v.clips.length ? v.clips : tracks.flatMap((t) => t.clips);
  return r1(src.reduce((a, c) => Math.max(a, c.end), 0));
};

function captionClips(p: VideoProject, end: number): VideoClip[] {
  if (p.settings.captionStyle === "None") return [];
  const { lines, source } = scriptLines(p);
  if (!lines.length || end <= 0) return [];
  const total = lines.reduce((a, l) => a + words(l).length, 0);
  let t = 0;
  return lines.map((l, i) => {
    const d = (words(l).length / total) * end;
    const c: VideoClip = { id: `${p.id}_cap_${i}`, label: words(l).slice(0, 4).join(" "), start: r1(t), end: r1(i === lines.length - 1 ? end : t + d), text: l, effect: "none", aiReason: `${p.settings.captionStyle} · from ${source?.toLowerCase()} line ${i + 1} · ${(words(l).length / Math.max(d, 0.1)).toFixed(1)} words/s` };
    t += d;
    return c;
  });
}

function whooshes(p: Pick<VideoProject, "id">, video: VideoClip[]): VideoClip[] {
  return video.filter((c) => c.effect === "transition" && c.start > 0).map((c, i) => ({ id: `${p.id}_sfx_${i}_${Math.round(c.start * 10)}`, label: "Whoosh", start: r1(Math.max(0, c.start - 0.2)), end: r1(c.start + 0.3), effect: "whoosh" as const, aiReason: `Sound effect on transition at ${fmtTC(c.start)}` }));
}

function overlayClips(p: VideoProject, end: number): VideoClip[] {
  if (end <= 0) return [];
  const out: VideoClip[] = [];
  const logo = assetsOf(p, "Logo")[0];
  if (logo || p.settings.brandTemplate !== "None") out.push({ id: `${p.id}_ov_logo`, label: `Logo · ${p.settings.brandTemplate}`, start: 0, end: r1(Math.max(0, end - 3)), assetId: logo?.id, effect: "logo", aiReason: logo ? `Brand template "${p.settings.brandTemplate}" · ${logo.name} top-right` : `Brand template "${p.settings.brandTemplate}" (no logo file uploaded)` });
  const cta = ctaFrom(p);
  const d = clamp(end * 0.15, 1.5, 3);
  out.push({ id: `${p.id}_ov_cta`, label: "CTA end card", start: r1(end - d), end, effect: "cta", text: cta, aiReason: `End card from ${planBeats(p).length ? "reel plan / script" : "objective"}: "${cta}"` });
  return out;
}

function brollClips(p: VideoProject, video: VideoClip[], captions: VideoClip[], density = 1): VideoClip[] {
  const end = video.reduce((a, c) => Math.max(a, c.end), 0);
  const interval = { Fast: 5, Medium: 7, Calm: 10 }[p.settings.pace] / density;
  const pool = [...assetsOf(p, "Brand asset"), ...assetsOf(p, "Reference video")];
  const cuts = video.slice(1).map((c) => c.start);
  const out: VideoClip[] = [];
  let i = 0;
  for (let t = 3; t < end - 3; t += interval) {
    const near = cuts.reduce<number | undefined>((best, c) => (Math.abs(c - t) < interval / 2 && (best === undefined || Math.abs(c - t) < Math.abs(best - t)) ? c : best), undefined);
    const center = near ?? t;
    const start = r1(clamp(center - 0.9, 0, end - 2));
    if (out.length && start < out[out.length - 1]!.end + 0.5) continue;
    const cap = captions.find((c) => c.start <= center && c.end > center);
    const kw = keywordOf(cap?.text) ?? keywordOf(p.objective) ?? "product";
    const asset = pool.length ? pool[i % pool.length] : undefined;
    out.push({
      id: `${p.id}_br_${i}_${Math.round(start * 10)}`, label: `B-roll: ${kw}`, start, end: r1(start + 1.8), assetId: asset?.id, effect: "none",
      aiReason: `${near !== undefined ? `Masks the jump cut at ${fmtTC(near)}` : `Visual variety at ${fmtTC(t)}`}${cap ? `; line says "${cap.text!.slice(0, 50)}" → show ${kw}` : ""}. ${asset ? `Uses ${asset.name}.` : "Suggested — pick from stock / brand library."}`,
    });
    i++;
  }
  return out;
}

export function buildTimeline(p: VideoProject, analysis?: Analysis): VideoTrack[] {
  const T = p.settings.targetDurationSec;
  const len = PACE_LEN[p.settings.pace];
  const N = Math.max(1, Math.round(T / len));
  const raws = assetsOf(p, "Raw video");
  let video: VideoClip[] = [];

  if (raws.length) {
    const wins = sourceWindows(p, len);
    const usable = p.settings.removeSilences ? wins.filter((w) => !w.silent) : wins;
    let picked = [...usable].sort((a, b) => b.score - a.score).slice(0, N);
    picked.sort((a, b) => a.idx - b.idx || a.srcIn - b.srcIn); // keep narrative order
    if (p.settings.hookOptimization && picked.length > 1) {
      const best = picked.reduce((a, b) => (b.score > a.score ? b : a));
      picked = [best, ...picked.filter((w) => w !== best)];
    }
    const per = T / Math.max(1, picked.length);
    const zoomEvery = { Fast: 2, Medium: 3, Calm: 5 }[p.settings.pace];
    let t = 0;
    video = picked.map((w, i) => {
      const hook = i === 0 && p.settings.hookOptimization;
      const d = Math.max(0.8, Math.min(hook ? Math.min(per, 2) : per, rawDuration(w.asset) - w.srcIn));
      const prev = picked[i - 1];
      const effect: VideoClip["effect"] = hook ? "punch-in" : prev && prev.asset.id !== w.asset.id ? "transition" : i % zoomEvery === 0 ? "zoom" : "none";
      const reason = hook ? `Hook: highest-energy moment (score ${w.score}) moved to open` : effect === "transition" ? `Scene change: ${prev!.asset.name} → ${w.asset.name}` : `Selected window (score ${w.score})${effect === "zoom" ? " · zoom to add motion" : ""}`;
      const c: VideoClip = { id: `${p.id}_v_${i}`, label: `Clip ${letter(w.idx)} · ${fmtTC(w.srcIn, false)}`, start: r1(t), end: r1(t + d), assetId: w.asset.id, srcIn: w.srcIn, effect, aiReason: reason };
      t += d;
      return c;
    });
    // If the hook shot was shortened, stretch the rest to hit the target.
    const got = t;
    if (video.length > 1 && got < T - 0.3) {
      const extra = (T - got) / (video.length - 1);
      let tt = video[0]!.end;
      video = video.map((c, i) => {
        if (i === 0) return c;
        const w = picked[i]!;
        const d = Math.min(c.end - c.start + extra, rawDuration(w.asset) - w.srcIn);
        const nc = { ...c, start: r1(tt), end: r1(tt + d) };
        tt += d;
        return nc;
      });
    }
  } else {
    const beats = planBeats(p);
    const n = beats.length || N;
    const d = T / n;
    video = Array.from({ length: n }, (_, i) => ({ id: `${p.id}_v_${i}`, label: beats[i] ? `Shot ${i + 1}: ${beats[i]!.slice(0, 40)}` : `Shot ${i + 1} (awaiting footage)`, start: r1(i * d), end: r1((i + 1) * d), effect: i > 0 ? ("transition" as const) : ("none" as const), aiReason: beats[i] ? `Placeholder from reel plan beat ${i + 1}` : "Placeholder — upload raw footage to auto-cut" }));
  }

  const end = video.length ? video[video.length - 1]!.end : 0;
  const captions = captionClips(p, end);
  const broll = p.settings.autoBroll ? brollClips(p, video, captions) : [];
  const musicAsset = assetsOf(p, "Music")[0];
  const music: VideoClip[] = p.settings.music !== "No music" && end > 0 ? [{ id: `${p.id}_mus_0`, label: musicAsset ? musicAsset.name : p.settings.music, start: 0, end, assetId: musicAsset?.id, effect: "none", aiReason: `${musicAsset ? "Uploaded track" : `Library style "${p.settings.music}"`} · duck −12 dB under speech (applied by render backend)` }] : [];
  void analysis;
  return [track(p, "overlay", overlayClips(p, end)), track(p, "caption", captions), track(p, "broll", broll), track(p, "video", video), track(p, "sfx", whooshes(p, video)), track(p, "music", music)];
}

// ---------- editing primitives (shared by the UI and the reviser) ----------
export function sortTracks(tracks: VideoTrack[]) {
  return [...tracks].sort((a, b) => TRACK_ORDER.indexOf(a.kind) - TRACK_ORDER.indexOf(b.kind));
}
export function reflow(clips: VideoClip[], from = 0): VideoClip[] {
  let t = from;
  return clips.map((c) => {
    const d = c.end - c.start;
    const n = { ...c, start: r1(t), end: r1(t + d) };
    t += d;
    return n;
  });
}
// Remove [a, b) from every non-video track, shifting later clips left.
function rippleDelete(tracks: VideoTrack[], a: number, b: number): VideoTrack[] {
  const d = b - a;
  return tracks.map((t) => (t.kind === "video" ? t : {
    ...t,
    clips: t.clips.flatMap((c) => {
      if (c.end <= a) return [c];
      if (c.start >= b) return [{ ...c, start: r1(c.start - d), end: r1(c.end - d) }];
      const s = c.start < a ? c.start : a;
      const e = c.end > b ? c.end - d : a;
      return e - s >= 0.3 ? [{ ...c, start: r1(s), end: r1(e) }] : [];
    }),
  }));
}
function clampToEnd(tracks: VideoTrack[]): VideoTrack[] {
  const end = timelineEnd(tracks);
  return tracks.map((t) => (t.kind === "video" ? t : { ...t, clips: t.clips.filter((c) => c.start < end - 0.2).map((c) => (c.end > end ? { ...c, end } : c)) }));
}
function withTrack(tracks: VideoTrack[], kind: VideoTrackKind, fn: (clips: VideoClip[]) => VideoClip[]) {
  return tracks.map((t) => (t.kind === kind ? { ...t, clips: fn(t.clips) } : t));
}
function resyncWhooshes(p: VideoProject, tracks: VideoTrack[]) {
  const video = tracks.find((t) => t.kind === "video")?.clips ?? [];
  return withTrack(tracks, "sfx", (clips) => [...clips.filter((c) => c.effect !== "whoosh"), ...whooshes(p, video)].sort((a, b) => a.start - b.start));
}
function ensureTracks(p: VideoProject, tracks: VideoTrack[]) {
  const have = new Set(tracks.map((t) => t.kind));
  return sortTracks([...tracks, ...TRACK_ORDER.filter((k) => !have.has(k)).map((k) => track(p, k, []))]);
}

// ---------- AI revise ----------
export interface RevisionResult { tracks: VideoTrack[]; settings: Settings; changes: string[]; applied: string[]; unmatched: string[] }

export function reviseTimeline(p: VideoProject, notes: Pick<ReviewNote, "id" | "body" | "timecode">[]): RevisionResult {
  let tracks = ensureTracks(p, p.tracks.length ? p.tracks : buildTimeline(p));
  const settings = { ...p.settings };
  const changes: string[] = [];
  const applied: string[] = [];
  const unmatched: string[] = [];
  const has = (re: RegExp) => notes.filter((n) => re.test(n.body.toLowerCase()));
  const mark = (ns: typeof notes) => ns.forEach((n) => !applied.includes(n.id) && applied.push(n.id));
  const video = () => tracks.find((t) => t.kind === "video")!.clips;

  // 1. Remove intro
  const intro = has(/remove (the )?intro|cut (the )?intro|skip (the )?intro|no intro|drop (the )?intro/);
  if (intro.length && video().length > 1) {
    const first = video()[0]!;
    tracks = rippleDelete(tracks, first.start, first.end);
    tracks = withTrack(tracks, "video", (c) => reflow(c.slice(1)));
    changes.push(`Removed intro shot "${first.label}" (${(first.end - first.start).toFixed(1)}s) and rippled all tracks`);
    mark(intro);
  }
  // 2. Stronger hook
  const hook = has(/stronger hook|better hook|weak hook|hook/);
  if (hook.length && video().length > 1) {
    const v = video();
    const best = v.reduce((a, c) => ((c.assetId ? windowScore(c.assetId, c.srcIn ?? 0) : 0) > (a.assetId ? windowScore(a.assetId, a.srcIn ?? 0) : 0) ? c : a));
    const hooked = { ...best, end: best.start + Math.min(2, best.end - best.start), effect: "punch-in" as const, aiReason: `Hook (revised): strongest moment${best.assetId ? ` (score ${windowScore(best.assetId, best.srcIn ?? 0)})` : ""} moved first, trimmed ≤2s with punch-in` };
    tracks = withTrack(tracks, "video", () => reflow([hooked, ...v.filter((c) => c.id !== best.id)]));
    settings.hookOptimization = true;
    changes.push(`Moved "${best.label}" to open the video as a ≤2s punch-in hook`);
    mark(hook);
  }
  // 3. Faster pace
  const faster = has(/faster|snappier|quicker|speed up|more energy|pacing/);
  if (faster.length) {
    let splits = 0;
    let zooms = 0;
    let eligible = 0;
    tracks = withTrack(tracks, "video", (clips) => reflow(clips.flatMap((c, i) => {
      const d = c.end - c.start;
      if (d < 2.6) {
        if (i > 0 && (!c.effect || c.effect === "none") && eligible++ % 2 === 0) {
          zooms++;
          return [{ ...c, end: c.start + Math.max(0.8, d * 0.85), effect: "zoom" as const, aiReason: "Revision: trimmed 15% and added a zoom for pace" }];
        }
        return [c];
      }
      splits++;
      const mid = r1(d * 0.55);
      return [{ ...c, end: c.start + mid }, { ...c, id: `${c.id}_f`, start: c.start + mid, srcIn: c.srcIn !== undefined ? r1(c.srcIn + mid + 0.4) : undefined, effect: "zoom" as const, aiReason: "Revision: split long shot, skipped 0.4s and added a zoom for pace" }];
    })));
    settings.pace = settings.pace === "Calm" ? "Medium" : "Fast";
    changes.push(`Faster pace: split ${splits} long shot${splits === 1 ? "" : "s"}, trimmed + zoomed ${zooms} more (pace → ${settings.pace})`);
    mark(faster);
  }
  // 4. More b-roll
  const broll = has(/more b-?roll|add b-?roll|cutaways?/);
  if (broll.length) {
    const caps = tracks.find((t) => t.kind === "caption")?.clips ?? [];
    const existing = tracks.find((t) => t.kind === "broll")?.clips ?? [];
    const v = video();
    const end = timelineEnd(tracks);
    const pool = [...assetsOf(p, "Brand asset"), ...assetsOf(p, "Reference video")];
    // Candidate spots: every cut point plus the middle of long shots, away from existing cutaways.
    const spots = [...v.slice(1).map((c) => ({ t: c.start, why: `Masks the cut at ${fmtTC(c.start)}` })), ...v.filter((c) => c.end - c.start > 3).map((c) => ({ t: (c.start + c.end) / 2, why: `Breaks up a ${(c.end - c.start).toFixed(1)}s shot` }))].sort((a, b) => a.t - b.t);
    const placed: VideoClip[] = [];
    const limit = Math.max(2, existing.length);
    for (const sp of spots) {
      if (placed.length >= limit) break;
      if (sp.t < 2 || sp.t > end - 2.5) continue;
      const start = r1(sp.t - 0.9);
      const clash = [...existing, ...placed].some((c) => start < c.end + 0.2 && start + 1.8 > c.start - 0.2);
      if (clash) continue;
      const cap = caps.find((c) => c.start <= sp.t && c.end > sp.t);
      const kw = keywordOf(cap?.text) ?? keywordOf(p.objective) ?? "product";
      const asset = pool.length ? pool[(existing.length + placed.length) % pool.length] : undefined;
      placed.push({ id: `${p.id}_brr_${Math.round(start * 10)}_${existing.length + placed.length}`, label: `B-roll: ${kw}`, start, end: r1(start + 1.8), assetId: asset?.id, effect: "none", aiReason: `Revision (more B-roll): ${sp.why}${cap ? `; line says "${cap.text!.slice(0, 50)}"` : ""}. ${asset ? `Uses ${asset.name}.` : "Suggested — pick from stock / brand library."}` });
    }
    tracks = withTrack(tracks, "broll", (clips) => [...clips, ...placed].sort((a, b) => a.start - b.start));
    settings.autoBroll = true;
    changes.push(placed.length ? `Inserted ${placed.length} more B-roll cutaway${placed.length === 1 ? "" : "s"}` : "No free spots for more B-roll — the cut is already covered");
    mark(broll);
  }
  // 5. Shorter / tighten
  const shorter = has(/shorter|tighten|too long|trim it|cut down|reduce length/);
  if (shorter.length) {
    const before = timelineEnd(tracks);
    tracks = tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, start: r1(c.start * 0.8), end: r1(c.end * 0.8) })) }));
    settings.targetDurationSec = Math.max(5, Math.round(settings.targetDurationSec * 0.8));
    changes.push(`Tightened the cut by 20% (${fmtDuration(before)} → ${fmtDuration(timelineEnd(tracks))})`);
    mark(shorter);
  }
  // 6. Captions
  const caps = has(/bigger caption|larger caption|caption style|captions? (bigger|larger|bolder|style)|bolder caption|captions? (too small|hard to read)/);
  if (caps.length) {
    const next: Settings["captionStyle"] = settings.captionStyle === "Bold kinetic" ? "Dynamic word-by-word" : "Bold kinetic";
    settings.captionStyle = next;
    tracks = withTrack(tracks, "caption", (clips) => clips.map((c) => ({ ...c, aiReason: `${next} · ${c.aiReason?.split(" · ").slice(1).join(" · ") ?? ""}` })));
    changes.push(`Caption style → ${next}`);
    mark(caps);
  }
  // 7. Music
  const music = has(/change (the )?music|different music|new music|music (is|feels|too)|swap (the )?music/);
  if (music.length) {
    const opts = MUSIC_OPTIONS.filter((m) => m !== "No music");
    const next = opts[(opts.indexOf(settings.music) + 1) % opts.length]!;
    settings.music = next;
    const end = timelineEnd(tracks);
    tracks = withTrack(tracks, "music", (clips) => (clips.length ? clips.map((c) => ({ ...c, label: next, assetId: undefined, aiReason: `Revision: music changed to "${next}" (library style)` })) : [{ id: `${p.id}_mus_r`, label: next, start: 0, end, effect: "none", aiReason: `Revision: added "${next}" (library style)` }]));
    changes.push(`Music → ${next}`);
    mark(music);
  }
  // 8. CTA
  const cta = has(/\bcta\b|call to action|end card/);
  if (cta.length) {
    const end = timelineEnd(tracks);
    const text = ctaFrom(p);
    tracks = withTrack(tracks, "overlay", (clips) => [...clips.filter((c) => c.effect !== "cta"), { id: `${p.id}_ov_cta_r`, label: "CTA end card", start: r1(Math.max(0, end - 3)), end, effect: "cta" as const, text, aiReason: `Revision: 3s CTA end card "${text}"` }]);
    changes.push(`Added / extended CTA end card: "${text}"`);
    mark(cta);
  }

  notes.forEach((n) => !applied.includes(n.id) && unmatched.push(n.id));
  tracks = resyncWhooshes(p, clampToEnd(tracks));
  return { tracks, settings, changes, applied, unmatched };
}

// ---------- versions / reframing ----------
const REFRAME: Record<Aspect, string> = {
  "9:16": "Vertical 1080×1920: centre-weighted crop keeps ~32% of a 16:9 frame's width (subject-tracking reframe runs in the render backend); captions raised above the bottom 20% UI zone; logo moved inside the top safe area.",
  "1:1": "Square 1080×1080: crops ~44% of a 16:9 frame's width; captions on the lower third; logo top-right.",
  "16:9": "Landscape 1920×1080: native framing for 16:9 footage; vertical sources get a blurred-fill pillarbox; captions scaled down 20%.",
};
export function makeVersions(p: VideoProject, opts: { aspects: Aspect[]; hookAB?: boolean; now: string }): VideoVersion[] {
  const dur = timelineEnd(p.tracks);
  let n = p.versions.length;
  const id = () => `${p.id}_ver_${++n}`;
  const out: VideoVersion[] = opts.aspects.map((a) => ({ id: id(), label: `${a} ${a === "9:16" ? "Reel / Story" : a === "1:1" ? "Feed" : "YouTube / Web"}`, aspect: a, durationSec: dur, createdAt: opts.now, note: `${REFRAME[a]} Source framing assumed 16:9 unless noted.` }));
  if (opts.hookAB) {
    const v = p.tracks.find((t) => t.kind === "video")?.clips ?? [];
    const alt = v.slice(1).reduce<VideoClip | undefined>((a, c) => (c.assetId && (!a || windowScore(c.assetId, c.srcIn ?? 0) > windowScore(a.assetId!, a.srcIn ?? 0)) ? c : a), undefined);
    out.push({ id: id(), label: "Hook A", aspect: p.settings.aspect, durationSec: dur, createdAt: opts.now, note: `Opens on "${v[0]?.label ?? "current first shot"}" (current cut).` });
    out.push({ id: id(), label: "Hook B", aspect: p.settings.aspect, durationSec: dur, createdAt: opts.now, note: alt ? `Opens on alternate moment "${alt.label}" (score ${windowScore(alt.assetId!, alt.srcIn ?? 0)}) — A/B test hook rate on Meta.` : "Opens on the second shot — A/B test hook rate on Meta." });
  }
  return out;
}

// ---------- workflow & feature checklist ----------
export const WORKFLOW = ["Raw files", "Script", "Reel plan", "Brand guidelines", "AI analysis", "Timeline", "First draft", "User review", "AI revision", "Final export"] as const;
export function workflowState(p: VideoProject): Record<(typeof WORKFLOW)[number], boolean> {
  const hasDraft = p.versions.some((v) => /draft/i.test(v.label)) || ["Draft Ready", "In Review", "Revising", "Approved", "Exported"].includes(p.status);
  return {
    "Raw files": assetsOf(p, "Raw video").length > 0,
    Script: ["Script", "Dialogue", "Captions"].some((k) => assetsOf(p, k as VideoAssetKind).some((a) => a.text)),
    "Reel plan": assetsOf(p, "Reel plan").length > 0,
    "Brand guidelines": assetsOf(p, "Logo").length + assetsOf(p, "Brand asset").length > 0,
    "AI analysis": !!p.analysis,
    Timeline: p.tracks.some((t) => t.clips.length > 0),
    "First draft": hasDraft,
    "User review": p.reviewNotes.length > 0 || ["In Review", "Revising", "Approved", "Exported"].includes(p.status),
    "AI revision": p.versions.some((v) => /revision/i.test(v.label)),
    "Final export": p.status === "Exported" || p.versions.some((v) => v.exported),
  };
}

export const FEATURES = ["Auto-cut", "Silence removal", "Highlight detection", "Scene detection", "Caption generation", "Dynamic captions", "B-roll suggestions", "B-roll insertion", "Music", "Sound effects", "Zooms", "Transitions", "Hook optimization", "Reframing", "9:16 / 1:1 / 16:9 conversion", "Brand templates", "Auto-resizing", "Multiple versions"] as const;
export function featureChecklist(p: VideoProject): { feature: (typeof FEATURES)[number]; applied: boolean; detail: string }[] {
  const clips = (k: VideoTrackKind) => p.tracks.find((t) => t.kind === k)?.clips ?? [];
  const v = clips("video");
  const br = clips("broll");
  const aspects = new Set(p.versions.map((x) => x.aspect));
  const eff = (e: VideoClip["effect"]) => v.filter((c) => c.effect === e).length;
  const a = p.analysis;
  return [
    { feature: "Auto-cut", applied: v.some((c) => c.assetId), detail: v.some((c) => c.assetId) ? `${v.length} cuts from ${new Set(v.map((c) => c.assetId).filter(Boolean)).size} raw clip(s)` : "Needs raw footage" },
    { feature: "Silence removal", applied: p.settings.removeSilences && !!a?.silencesRemovedSec, detail: p.settings.removeSilences ? `~${a?.silencesRemovedSec ?? 0}s estimated` : "Off in settings" },
    { feature: "Highlight detection", applied: !!a?.highlights.length, detail: a?.highlights.length ? `${a.highlights.length} moments (heuristic)` : "Run analysis" },
    { feature: "Scene detection", applied: !!a?.scenes, detail: a ? `${a.scenes} scenes` : "Run analysis" },
    { feature: "Caption generation", applied: clips("caption").length > 0, detail: clips("caption").length ? `${clips("caption").length} caption clips` : "Needs a script / transcript" },
    { feature: "Dynamic captions", applied: clips("caption").length > 0 && ["Dynamic word-by-word", "Bold kinetic"].includes(p.settings.captionStyle), detail: p.settings.captionStyle },
    { feature: "B-roll suggestions", applied: br.length > 0, detail: br.length ? `${br.length} suggested` : p.settings.autoBroll ? "None placed" : "Auto B-roll off" },
    { feature: "B-roll insertion", applied: br.some((c) => c.assetId), detail: br.some((c) => c.assetId) ? `${br.filter((c) => c.assetId).length} from uploaded assets` : "Upload brand / reference clips" },
    { feature: "Music", applied: clips("music").length > 0, detail: clips("music")[0]?.label ?? "None" },
    { feature: "Sound effects", applied: clips("sfx").length > 0, detail: `${clips("sfx").length} SFX` },
    { feature: "Zooms", applied: eff("zoom") + eff("punch-in") > 0, detail: `${eff("zoom") + eff("punch-in")} zooms / punch-ins` },
    { feature: "Transitions", applied: eff("transition") > 0, detail: `${eff("transition")} transitions` },
    { feature: "Hook optimization", applied: p.settings.hookOptimization && v[0]?.effect === "punch-in", detail: a?.hookScore ? `Hook score ${a.hookScore}/100` : p.settings.hookOptimization ? "On" : "Off" },
    { feature: "Reframing", applied: p.versions.some((x) => x.aspect !== p.settings.aspect), detail: `${aspects.size} framing(s)` },
    { feature: "9:16 / 1:1 / 16:9 conversion", applied: aspects.size >= 2, detail: [...aspects].join(", ") || "—" },
    { feature: "Brand templates", applied: clips("overlay").some((c) => c.effect === "logo" || c.effect === "cta"), detail: p.settings.brandTemplate },
    { feature: "Auto-resizing", applied: aspects.size >= 2, detail: aspects.size >= 2 ? "Captions & overlays repositioned per aspect" : "Create versions" },
    { feature: "Multiple versions", applied: p.versions.length >= 2, detail: `${p.versions.length} version(s)` },
  ];
}

// ---------- project factory ----------
export function newVideoProject(input: { id: string; title: string; objective: string; clientId?: string; ownerId: string; settings: Settings; now: string }): VideoProject {
  return { id: input.id, clientId: input.clientId, title: input.title, objective: input.objective, status: "Uploading", assets: [], settings: input.settings, tracks: [], versions: [], reviewNotes: [], ownerId: input.ownerId, createdAt: input.now, updatedAt: input.now };
}
export function guessKind(name: string, mime = ""): VideoAssetKind {
  const n = name.toLowerCase();
  if (mime.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|avi)$/.test(n)) return /ref|reference|inspo/.test(n) ? "Reference video" : /broll|b-roll|brand/.test(n) ? "Brand asset" : "Raw video";
  if (mime.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg)$/.test(n)) return "Music";
  if (mime.startsWith("image/") || /\.(png|jpe?g|svg|webp|gif)$/.test(n)) return /logo/.test(n) ? "Logo" : "Brand asset";
  if (/\.(srt|vtt)$/.test(n)) return "Captions";
  if (/plan|storyboard|beats/.test(n)) return "Reel plan";
  if (/dialog|dialogue|interview|transcript/.test(n)) return "Dialogue";
  if (/\.(txt|md)$/.test(n)) return "Script";
  if (/\.pdf$/.test(n)) return "Brand asset";
  return "Brand asset";
}

// ---------- edit decision lists (what a render backend would consume) ----------
export function toEDLJson(p: VideoProject, assetName: (id?: string) => string | undefined = (id) => p.assets.find((a) => a.id === id)?.name) {
  return JSON.stringify({
    format: "adbibe-edl/1",
    notice: "Edit decision list only. Final pixel rendering requires a render backend (e.g. an FFmpeg worker or a cloud render service), which is not connected.",
    project: { id: p.id, title: p.title, objective: p.objective, status: p.status },
    output: { aspect: p.settings.aspect, fps: 30, durationSec: timelineEnd(p.tracks), captionStyle: p.settings.captionStyle, brandTemplate: p.settings.brandTemplate, music: p.settings.music },
    versions: p.versions,
    tracks: sortTracks(p.tracks).map((t) => ({ kind: t.kind, muted: !!t.muted, clips: t.clips.map((c) => ({ label: c.label, start: c.start, end: c.end, source: assetName(c.assetId) ?? null, srcIn: c.srcIn ?? null, effect: c.effect ?? "none", text: c.text ?? null })) })),
  }, null, 2);
}

export function toCMX(p: VideoProject, fps = 30) {
  const lines = [`TITLE: ${p.title.toUpperCase().slice(0, 60)}`, "FCM: NON-DROP FRAME", `* ASPECT ${p.settings.aspect} · RENDER BACKEND NOT CONNECTED — CONFORM IN NLE OR FFMPEG WORKER`, ""];
  const reel = (id?: string) => {
    const a = p.assets.find((x) => x.id === id);
    return (a ? a.name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8) : "BL").padEnd(8, " ");
  };
  let n = 0;
  const ev = (c: VideoClip, chan: string, comment?: string) => {
    n++;
    const d = c.end - c.start;
    const sIn = c.srcIn ?? 0;
    const trans = c.effect === "transition" ? "D    010" : "C       ";
    lines.push(`${String(n).padStart(3, "0")}  ${reel(c.assetId)} ${chan.padEnd(5, " ")} ${trans} ${smpte(sIn, fps)} ${smpte(sIn + d, fps)} ${smpte(c.start, fps)} ${smpte(c.end, fps)}`);
    const a = p.assets.find((x) => x.id === c.assetId);
    lines.push(`* FROM CLIP NAME: ${a?.name ?? c.label}`);
    if (c.effect && c.effect !== "none" && c.effect !== "transition") lines.push(`* EFFECT: ${c.effect.toUpperCase()}`);
    if (comment) lines.push(`* ${comment}`);
    lines.push("");
  };
  const byKind = (k: VideoTrackKind) => p.tracks.filter((t) => t.kind === k && !t.muted).flatMap((t) => t.clips);
  byKind("video").forEach((c) => ev(c, "V"));
  byKind("broll").forEach((c) => ev(c, "V", `V2 OVERLAY (B-ROLL): ${c.label}`));
  byKind("music").forEach((c) => ev(c, "AA", `MUSIC: ${c.label}`));
  byKind("sfx").forEach((c) => ev(c, "A2", `SFX: ${c.label}`));
  byKind("caption").forEach((c) => lines.push(`* CAPTION ${smpte(c.start, fps)}-${smpte(c.end, fps)}: ${c.text ?? c.label}`));
  byKind("overlay").forEach((c) => lines.push(`* OVERLAY ${smpte(c.start, fps)}-${smpte(c.end, fps)}: ${c.label}${c.text ? ` — ${c.text}` : ""}`));
  return lines.join("\n");
}
