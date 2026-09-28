"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Sparkles, Wand2 } from "lucide-react";
import type { VideoProject, VideoTrack } from "@/lib/types";
import { AGENTS } from "@/lib/ai/agents";
import { featureChecklist, fmtDuration, fmtTC } from "@/lib/ai/video";
import { useCRM } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AgentChip, Button, InsightLegend, InsightList, ScorePill } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { analyzeVideo, draftMinutes, generateDraft } from "./actions";

export function AIPanel({ project, writable, onTracksReplaced }: { project: VideoProject; writable: boolean; onTracksReplaced: (t: VideoTrack[]) => void }) {
  const [busy, setBusy] = useState<"analyze" | "draft" | null>(null);
  const credits = useCRM((s) => s.settings.aiCreditCost.video ?? 2);
  const a = project.analysis;
  const features = featureChecklist(project);
  const hasRaw = project.assets.some((x) => x.kind === "Raw video");
  const hasTimeline = project.tracks.some((t) => t.clips.length);

  const analyze = async () => {
    setBusy("analyze");
    const ok = await analyzeVideo(project.id);
    setBusy(null);
    if (ok) toast("Analysis complete", "Scenes, silences, highlights and hook score updated.", "ai");
  };
  const draft = async () => {
    if (hasTimeline && !window.confirm("Regenerating replaces the current timeline (you can undo it). Continue?")) return;
    setBusy("draft");
    const tracks = await generateDraft(project.id);
    setBusy(null);
    if (tracks) {
      onTracksReplaced(tracks);
      toast(hasTimeline ? "Draft regenerated" : "First draft ready", "Review it on the timeline, then add notes for the AI to revise.", "ai");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <AgentChip name={AGENTS.video.name} color={AGENTS.video.color} />
        <span className="text-[11px] text-fg-3">{credits} credits / job</span>
      </div>
      {writable && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={analyze} loading={busy === "analyze"} disabled={!!busy || !project.assets.length} icon={<Sparkles className="size-3.5" />}>Analyze</Button>
          <Button variant="ai" onClick={draft} loading={busy === "draft"} disabled={!!busy} icon={<Wand2 className="size-3.5" />}>{hasTimeline ? "Regenerate" : "Generate first draft"}</Button>
          <p className="col-span-2 text-[11px] text-fg-3">Drafts use {draftMinutes(project)} video minute{draftMinutes(project) > 1 ? "s" : ""} + AI credits.{!hasRaw && " No raw footage yet — the draft will use placeholder shots from the reel plan."}</p>
        </div>
      )}

      {a ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-surface-2 p-2"><p className="text-fg-3">Source footage</p><p className="text-sm font-semibold tabular-nums">{fmtDuration(a.sourceDurationSec)}</p></div>
            <div className="rounded-lg bg-surface-2 p-2"><p className="text-fg-3">Scenes</p><p className="text-sm font-semibold tabular-nums">{a.scenes}</p></div>
            <div className="rounded-lg bg-surface-2 p-2"><p className="text-fg-3">Silence removed <span className="text-[10px]">(est.)</span></p><p className="text-sm font-semibold tabular-nums">{a.silencesRemovedSec}s</p></div>
            <div className="rounded-lg bg-surface-2 p-2"><p className="text-fg-3 mb-1">Hook score</p><ScorePill score={a.hookScore} /></div>
          </div>
          {a.highlights.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-fg-2">Highlights <span className="font-normal text-fg-3">(source time, heuristic)</span></p>
              <ul className="space-y-1">
                {a.highlights.map((h, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-[10px] text-fg-3 w-10">{fmtTC(h.at, false)}</span>
                    <span className="truncate flex-1 text-fg-2">{h.label}</span>
                    <span className="tabular-nums text-fg-3">{h.score}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <InsightList items={a.notes} compact />
          <InsightLegend />
        </div>
      ) : (
        <p className="text-xs text-fg-3 rounded-lg border border-dashed border-border p-3">Not analyzed yet. The Video Agent reads file metadata, the script and the reel plan — it doesn&apos;t see pixels or hear audio, so moment scores are labelled as estimates.</p>
      )}

      <div>
        <p className="mb-1.5 text-xs font-medium text-fg-2">Features applied in this draft <span className="font-normal text-fg-3">· {features.filter((f) => f.applied).length}/{features.length}</span></p>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {features.map((f) => (
            <li key={f.feature} className="flex items-start gap-1.5 text-[11px]" title={f.detail}>
              {f.applied ? <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" /> : <Circle className="mt-px size-3.5 shrink-0 text-fg-3" />}
              <span className="min-w-0">
                <span className={cn(f.applied ? "text-fg" : "text-fg-3")}>{f.feature}</span>
                <span className="block truncate text-fg-3">{f.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
