"use client";

import { FileText, Film, Image as ImageIcon, LayoutTemplate, Megaphone, Paperclip, Rows3, Type } from "lucide-react";
import type { Creative, CreativeStatus, CreativeType, CreativeVersion } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Tone } from "@/components/ui";
import { previewFor } from "./actions";

export const CREATIVE_TONE: Record<CreativeStatus, Tone> = {
  Draft: "neutral", "Internal Review": "info", "Client Review": "warning", "Changes Requested": "danger", Approved: "success", Live: "accent", Archived: "neutral",
};
export const TYPE_ICON: Record<CreativeType, typeof Film> = { Image: ImageIcon, Video: Film, Carousel: Rows3, Copy: Type, Ad: Megaphone, "Landing Page": LayoutTemplate, Campaign: FileText };
export const CREATIVE_TYPES: CreativeType[] = ["Image", "Video", "Carousel", "Copy", "Ad", "Landing Page", "Campaign"];

const aspectFor = (format: string) => (/9:16/.test(format) ? "aspect-[9/16] max-h-[420px]" : /4:5/.test(format) ? "aspect-[4/5] max-h-[380px]" : /1:1/.test(format) ? "aspect-square max-h-[340px]" : /16:9|1\.91/.test(format) ? "aspect-video" : "aspect-[4/3]");

// Visual preview of one version: uploaded file (this session only) or a colour placeholder with the copy.
export function CreativePreview({ creative, version, compact, className }: { creative: Creative; version?: CreativeVersion; compact?: boolean; className?: string }) {
  const v = version ?? creative.versions[creative.versions.length - 1];
  const file = v ? previewFor(creative.id, v.v) : undefined;
  const Icon = TYPE_ICON[creative.type];
  const swatch = v?.swatch ?? "#8b5cf6";
  if (compact) {
    return (
      <div className={cn("relative h-24 w-full overflow-hidden rounded-lg", className)} style={{ background: `linear-gradient(135deg, ${swatch}, color-mix(in oklch, ${swatch} 45%, black))` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- session blob URL */}
        {file?.mime.startsWith("image/") && <img src={file.url} alt="" className="absolute inset-0 size-full object-cover" />}
        <Icon className="absolute left-2 top-2 size-3.5 text-white/85" />
        <span className="absolute right-2 top-2 rounded bg-black/35 px-1 text-[10px] font-medium text-white">v{v?.v ?? 1}</span>
        {v?.headline && <p className="absolute inset-x-2 bottom-2 line-clamp-2 text-[11px] font-semibold leading-tight text-white drop-shadow">{v.headline}</p>}
      </div>
    );
  }
  return (
    <div className={cn("mx-auto w-full overflow-hidden rounded-xl border border-border", aspectFor(creative.format), className)}>
      <div className="relative size-full" style={{ background: `linear-gradient(160deg, ${swatch}, color-mix(in oklch, ${swatch} 40%, black))` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- session blob URL */}
        {file?.mime.startsWith("image/") && <img src={file.url} alt={v?.fileName ?? ""} className="absolute inset-0 size-full object-cover" />}
        {file?.mime.startsWith("video/") && <video src={file.url} controls className="absolute inset-0 size-full object-cover bg-black" />}
        {!file && (
          <div className="absolute inset-0 flex flex-col justify-between p-4 text-white">
            <div className="flex items-center justify-between text-[11px] font-medium opacity-90">
              <span className="inline-flex items-center gap-1"><Icon className="size-3.5" /> {creative.type} · {creative.format}</span>
              <span className="rounded bg-black/30 px-1.5">v{v?.v ?? 1}</span>
            </div>
            <div className="space-y-2">
              {creative.hook && <p className="text-[11px] uppercase tracking-wide opacity-80">Hook: {creative.hook}</p>}
              {v?.headline && <p className="text-lg font-semibold leading-snug drop-shadow">{v.headline}</p>}
              {v?.body && <p className="line-clamp-4 whitespace-pre-line text-xs opacity-90">{v.body}</p>}
              {v?.cta && <span className="inline-block rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-black">{v.cta}</span>}
            </div>
            {v?.fileName && <p className="inline-flex items-center gap-1 text-[10px] opacity-80"><Paperclip className="size-3" /> {v.fileName} <span className="opacity-70">(file preview available in the session it was uploaded)</span></p>}
          </div>
        )}
      </div>
    </div>
  );
}
