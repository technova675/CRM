"use client";

import { Check } from "lucide-react";
import type { VideoProject } from "@/lib/types";
import { ASPECTS, BRAND_TEMPLATES, CAPTION_STYLES, MUSIC_OPTIONS, PACES, WORKFLOW, workflowState, type Settings } from "@/lib/ai/video";
import { cn } from "@/lib/utils";
import { Badge, Field, Input, Segmented, Select, Toggle, type Tone } from "@/components/ui";

const STATUS_TONE: Record<VideoProject["status"], Tone> = {
  Uploading: "neutral", Analyzing: "accent", "Draft Ready": "info", "In Review": "warning", Revising: "accent", Approved: "success", Exported: "success",
};
export function VideoStatus({ status }: { status: VideoProject["status"] }) {
  return <Badge tone={STATUS_TONE[status]} dot>{status}</Badge>;
}

// Raw Files + Script + Reel Plan + Brand Guidelines → analysis → timeline → draft → review → revision → export
export function WorkflowTracker({ project }: { project: VideoProject }) {
  const st = workflowState(project);
  const firstOpen = WORKFLOW.findIndex((s) => !st[s]);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {WORKFLOW.map((s, i) => {
        const done = st[s];
        const input = i < 4;
        return (
          <div key={s} className="flex items-center gap-1 shrink-0">
            {i > 0 && <span className="px-0.5 text-fg-3 text-xs">{i <= 3 ? "+" : "→"}</span>}
            <span
              title={input ? "Input" : "AI / review step"}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium border",
                done ? "border-transparent bg-accent-soft text-accent-text" : i === firstOpen ? "border-accent text-fg bg-surface" : "border-border text-fg-3 bg-surface-2",
              )}
            >
              {done ? <Check className="size-3" /> : <span className="tabular-nums text-[10px]">{i + 1}</span>}
              {s}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function SettingsFields({ value, onChange, disabled }: { value: Settings; onChange: (s: Settings) => void; disabled?: boolean }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...value, [k]: v });
  return (
    <fieldset disabled={disabled} className="grid grid-cols-2 gap-3 disabled:opacity-70">
      <Field label="Aspect ratio" className="col-span-2">
        <Segmented value={value.aspect} onChange={(v) => set("aspect", v)} options={ASPECTS.map((a) => ({ value: a, label: a }))} />
      </Field>
      <Field label="Target duration (s)">
        <Input type="number" min={5} max={600} value={value.targetDurationSec} onChange={(e) => set("targetDurationSec", Math.max(5, Math.min(600, Number(e.target.value) || 5)))} />
      </Field>
      <Field label="Pace">
        <Select value={value.pace} onChange={(e) => set("pace", e.target.value as Settings["pace"])}>{PACES.map((p) => <option key={p}>{p}</option>)}</Select>
      </Field>
      <Field label="Caption style">
        <Select value={value.captionStyle} onChange={(e) => set("captionStyle", e.target.value as Settings["captionStyle"])}>{CAPTION_STYLES.map((p) => <option key={p}>{p}</option>)}</Select>
      </Field>
      <Field label="Brand template">
        <Select value={value.brandTemplate} onChange={(e) => set("brandTemplate", e.target.value)}>{BRAND_TEMPLATES.map((p) => <option key={p}>{p}</option>)}</Select>
      </Field>
      <Field label="Music" className="col-span-2">
        <Select value={value.music} onChange={(e) => set("music", e.target.value)}>{MUSIC_OPTIONS.map((p) => <option key={p}>{p}</option>)}</Select>
      </Field>
      <div className="col-span-2 space-y-2 rounded-lg border border-border p-3">
        {([["removeSilences", "Silence removal", "Cut dead air and pauses"], ["autoBroll", "Auto B-roll", "Suggest and insert cutaways"], ["hookOptimization", "Hook optimization", "Open on the strongest moment"]] as const).map(([k, label, hint]) => (
          <div key={k} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium">{label}</p>
              <p className="text-[11px] text-fg-3">{hint}</p>
            </div>
            <Toggle checked={value[k]} onChange={(v) => !disabled && set(k, v)} label={label} />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
