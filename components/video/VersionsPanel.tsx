"use client";

import { useState } from "react";
import { Download, Info, Layers, Send } from "lucide-react";
import type { VideoProject, VideoTrack } from "@/lib/types";
import { ASPECTS, fmtDuration, toCMX, toEDLJson, type Aspect } from "@/lib/ai/video";
import { useCRM } from "@/lib/store";
import { downloadFile, relTime } from "@/lib/utils";
import { Badge, Button, Checkbox } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { createVersions, requestExport } from "./actions";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export function VersionsPanel({ project, tracks, writable }: { project: VideoProject; tracks: VideoTrack[]; writable: boolean }) {
  const mode = useCRM((s) => s.settings.approvalModes["Video exports"]);
  const approvals = useCRM((s) => s.approvals);
  const [aspects, setAspects] = useState<Aspect[]>(["9:16", "1:1", "16:9"]);
  const [hookAB, setHookAB] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = approvals.find((a) => a.status === "pending" && a.ref?.type === "video" && a.ref.id === project.id);
  const current = { ...project, tracks };
  const hasTimeline = tracks.some((t) => t.clips.length);

  const create = async () => {
    if (!aspects.length && !hookAB) return;
    setBusy(true);
    const ok = await createVersions(project.id, aspects, hookAB);
    setBusy(false);
    if (ok) toast("Versions created", `${aspects.length + (hookAB ? 2 : 0)} new versions`, "ai");
  };
  const exportFinal = () => {
    const r = requestExport(project.id);
    if (r === "approval") toast("Export sent for approval", "Approve it in Automations → Approvals.", "info");
    else if (r === "task") toast("Export task created", "Manual mode — an editor will render and deliver it.", "info");
    else if (r === "done") toast("Marked as exported", "Automatic mode — logged to the audit trail.");
  };

  return (
    <div className="space-y-4">
      {project.versions.length === 0 ? (
        <p className="text-xs text-fg-3 text-center py-4">No versions yet — generate a draft first.</p>
      ) : (
        <ul className="space-y-1.5">
          {[...project.versions].reverse().map((v) => (
            <li key={v.id} className="rounded-lg border border-border p-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{v.label}</span>
                <Badge>{v.aspect}</Badge>
                <span className="text-[11px] tabular-nums text-fg-3">{fmtDuration(v.durationSec)}</span>
                {v.exported && <Badge tone="success">Exported</Badge>}
                <span className="ml-auto text-[10px] text-fg-3">{relTime(v.createdAt)}</span>
              </div>
              {v.note && <p className="mt-1 text-[11px] leading-snug text-fg-3">{v.note}</p>}
            </li>
          ))}
        </ul>
      )}

      {writable && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs font-medium flex items-center gap-1.5"><Layers className="size-3.5" /> Create versions</p>
          <div className="flex flex-wrap gap-3 text-xs">
            {ASPECTS.map((a) => (
              <label key={a} className="flex items-center gap-1.5">
                <Checkbox checked={aspects.includes(a)} onChange={(v) => setAspects((xs) => (v ? [...xs, a] : xs.filter((x) => x !== a)))} /> {a}
              </label>
            ))}
            <label className="flex items-center gap-1.5"><Checkbox checked={hookAB} onChange={setHookAB} /> Hook A/B</label>
          </div>
          <Button size="xs" variant="ai" onClick={create} loading={busy} disabled={!hasTimeline || (!aspects.length && !hookAB)}>Create versions</Button>
          <p className="text-[11px] text-fg-3">Reframes and resizes captions / overlays per aspect. Framing notes assume 16:9 source footage.</p>
        </div>
      )}

      <div className="rounded-lg border border-border p-3 space-y-2">
        <p className="text-xs font-medium">Export</p>
        <div className="flex gap-2 rounded-md bg-warning-soft px-2.5 py-2 text-[11px] leading-snug text-warning">
          <Info className="size-3.5 shrink-0 mt-px" />
          <span>Final pixel rendering needs a render backend (e.g. an FFmpeg worker or a cloud render service), which isn&apos;t connected. The edit decision list below is exactly what that backend — or your NLE — would consume.</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="xs" variant="outline" disabled={!hasTimeline} icon={<Download className="size-3.5" />} onClick={() => downloadFile(`${slug(project.title)}-edl.json`, toEDLJson(current), "application/json")}>EDL (JSON)</Button>
          <Button size="xs" variant="outline" disabled={!hasTimeline} icon={<Download className="size-3.5" />} onClick={() => downloadFile(`${slug(project.title)}.edl`, toCMX(current))}>EDL (CMX 3600)</Button>
        </div>
        {writable && (
          <div className="flex items-center gap-2 pt-1">
            <Button size="xs" variant="primary" disabled={!hasTimeline || !!pending || project.status === "Exported"} onClick={exportFinal} icon={<Send className="size-3.5" />}>
              {project.status === "Exported" ? "Exported" : pending ? "Awaiting approval" : "Final export"}
            </Button>
            <span className="text-[11px] text-fg-3">Mode: <span className="text-fg-2">{mode}</span></span>
          </div>
        )}
        {project.status !== "Approved" && project.status !== "Exported" && writable && <p className="text-[11px] text-fg-3">Tip: approve the cut before the final export.</p>}
      </div>
    </div>
  );
}
