"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Film } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import type { VideoAsset, VideoClip, VideoProject, VideoTrack } from "@/lib/types";
import { timelineEnd, type Aspect, type Settings } from "@/lib/ai/video";
import { Badge, Button, Card, EmptyState, MemberAvatar, Readonly, Tabs } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { VideoStatus, WorkflowTracker, SettingsFields } from "@/components/video/common";
import { AssetsPanel } from "@/components/video/AssetsPanel";
import { Monitor } from "@/components/video/Monitor";
import { Timeline } from "@/components/video/Timeline";
import { Inspector } from "@/components/video/Inspector";
import { AIPanel } from "@/components/video/AIPanel";
import { ReviewPanel } from "@/components/video/ReviewPanel";
import { VersionsPanel } from "@/components/video/VersionsPanel";
import { clipAt, deleteClip, findClip, splitClip, updateClip } from "@/components/video/edit";

export default function VideoEditorPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const project = useCRM((s) => s.videos.find((v) => v.id === id));
  const me = useMe();
  if (!project || (me.role === "client" && project.clientId !== me.clientId)) {
    return <EmptyState icon={<Film className="size-5" />} title="Video project not found" action={<Button href="/video">Back to projects</Button>} />;
  }
  return <Editor key={project.id} project={project} />;
}

type SideTab = "ai" | "review" | "inspect" | "versions" | "settings";
interface History { past: VideoTrack[][]; present: VideoTrack[]; future: VideoTrack[][] }

function Editor({ project }: { project: VideoProject }) {
  const me = useMe();
  const patch = useCRM((s) => s.patch);
  const log = useCRM((s) => s.log);
  const clients = useCRM((s) => s.clients);
  const writable = can(me.role, "video", "write") && me.role !== "client";

  // ----- timeline history (undo / redo); every committed edit is saved to the store -----
  const [hist, setHist] = useState<History>({ past: [], present: project.tracks, future: [] });
  const tracks = hist.present;
  const save = useCallback((next: VideoTrack[]) => patch("videos", project.id, { tracks: next, updatedAt: new Date().toISOString() }), [patch, project.id]);
  const commit = (next: VideoTrack[]) => {
    setHist((h) => ({ past: [...h.past.slice(-49), h.present], present: next, future: [] }));
    if (next !== project.tracks) save(next);
  };
  const undo = () => {
    if (!hist.past.length) return;
    const prev = hist.past[hist.past.length - 1]!;
    setHist({ past: hist.past.slice(0, -1), present: prev, future: [hist.present, ...hist.future] });
    save(prev);
  };
  const redo = () => {
    if (!hist.future.length) return;
    const next = hist.future[0]!;
    setHist({ past: [...hist.past, hist.present], present: next, future: hist.future.slice(1) });
    save(next);
  };

  // ----- playhead & playback -----
  const end = timelineEnd(tracks);
  const duration = Math.max(end, 1);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(0);
  const seek = useCallback((t: number) => {
    timeRef.current = t;
    setTime(t);
  }, []);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = timeRef.current + (now - last) / 1000;
      last = now;
      if (next >= duration) {
        seek(duration);
        setPlaying(false);
        return;
      }
      seek(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration, seek]);
  const toggle = () => {
    if (!playing && timeRef.current >= duration - 0.05) seek(0);
    setPlaying((p) => !p);
  };

  // ----- selection & edits -----
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<SideTab>(project.tracks.some((t) => t.clips.length) ? "review" : "ai");
  const [aspect, setAspect] = useState<Aspect>(project.settings.aspect);
  const [safe, setSafe] = useState(true);
  const sel = findClip(tracks, selectedId);
  const select = (cid: string | null) => {
    setSelectedId(cid);
    if (cid) setTab("inspect");
  };
  const split = () => {
    const target = sel && sel.clip.start < time && sel.clip.end > time ? sel.clip : clipAt(tracks.find((t) => t.kind === "video"), time);
    if (!target) return toast("Nothing to split", "Place the playhead over a clip.", "warning");
    const r = splitClip(tracks, target.id, time);
    if (r.tracks === tracks) return;
    commit(r.tracks);
    setSelectedId(r.newId ?? null);
  };
  const del = () => {
    if (!selectedId) return;
    commit(deleteClip(tracks, selectedId));
    setSelectedId(null);
  };
  const patchClip = (p: Partial<VideoClip>) => selectedId && commit(updateClip(tracks, selectedId, p));
  const replaced = (next: VideoTrack[]) => {
    commit(next);
    setSelectedId(null);
  };

  // ----- keyboard shortcuts -----
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === " ") { e.preventDefault(); toggle(); }
      else if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); if (!writable) return; if (e.shiftKey) redo(); else undo(); }
      else if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); if (writable) redo(); }
      else if (k === "s" && !e.ctrlKey && !e.metaKey && writable) split();
      else if ((k === "delete" || k === "backspace") && writable && selectedId) { e.preventDefault(); del(); }
      else if (k === "arrowleft") seek(Math.max(0, timeRef.current - (e.shiftKey ? 1 : 0.1)));
      else if (k === "arrowright") seek(Math.min(duration, timeRef.current + (e.shiftKey ? 1 : 0.1)));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const setAssets = (assets: VideoAsset[], action: string) => {
    patch("videos", project.id, { assets, updatedAt: new Date().toISOString() });
    log({ actor: "human", actorId: me.id, entity: "video", entityId: project.id, action, detail: project.title });
  };
  const setSettings = (s: Settings) => {
    patch("videos", project.id, { settings: s, updatedAt: new Date().toISOString() });
    if (s.aspect !== project.settings.aspect) setAspect(s.aspect);
  };
  const approve = () => {
    patch("videos", project.id, { status: "Approved", updatedAt: new Date().toISOString() }, { entity: "video", action: "Approved video cut", field: "status" });
    toast("Cut approved", "Ready for final export.");
  };
  const openNotes = project.reviewNotes.filter((n) => !n.resolved).length;
  const client = clients.find((c) => c.id === project.clientId);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/video" className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg"><ArrowLeft className="size-3" /> Video projects</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
            {project.title} <VideoStatus status={project.status} />
          </h1>
          <p className="text-xs text-fg-3 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{client?.company ?? "Internal"}</span>·<span className="truncate max-w-[420px]">{project.objective}</span>·<MemberAvatar id={project.ownerId} size={16} showName />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{project.settings.aspect} · {project.settings.targetDurationSec}s target</Badge>
          {writable && ["Draft Ready", "In Review"].includes(project.status) && (
            <Button variant="primary" onClick={approve} disabled={openNotes > 0} title={openNotes ? "Resolve open review notes first" : undefined} icon={<CheckCircle2 className="size-3.5" />}>Approve cut</Button>
          )}
        </div>
      </div>

      <Card className="px-3 py-2"><WorkflowTracker project={{ ...project, tracks }} /></Card>
      {!writable && <Readonly>Read-only — your role can view this edit but not change it.</Readonly>}

      <div className="grid gap-3 grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
        <div className="order-3 xl:order-1 min-w-0">
          <AssetsPanel project={project} tracks={tracks} time={time} writable={writable} onChange={setAssets} onSeek={seek} />
        </div>
        <div className="order-1 xl:order-2 min-w-0">
          <Monitor project={project} tracks={tracks} time={time} duration={duration} playing={playing} onToggle={toggle} onSeek={seek} aspect={aspect} onAspect={setAspect} safe={safe} onSafe={setSafe} />
        </div>
        <Card className="order-2 xl:order-3 min-w-0">
          <div className="px-2">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "ai", label: "AI" },
                { value: "review", label: "Review", count: openNotes || undefined },
                { value: "inspect", label: "Inspector" },
                { value: "versions", label: "Versions", count: project.versions.length || undefined },
                { value: "settings", label: "Settings" },
              ]}
            />
          </div>
          <div className="p-3 max-h-[560px] overflow-y-auto">
            {tab === "ai" && <AIPanel project={{ ...project, tracks }} writable={writable} onTracksReplaced={replaced} />}
            {tab === "review" && <ReviewPanel project={project} tracks={tracks} time={time} writable={writable} onSeek={seek} onTracksReplaced={replaced} />}
            {tab === "inspect" && <Inspector project={project} track={sel?.track} clip={sel?.clip} writable={writable} onPatch={patchClip} onSplit={split} onDelete={del} onSeek={seek} />}
            {tab === "versions" && <VersionsPanel project={project} tracks={tracks} writable={writable} />}
            {tab === "settings" && (
              <div className="space-y-3">
                <SettingsFields value={project.settings} onChange={setSettings} disabled={!writable} />
                <p className="text-[11px] text-fg-3">Aspect and caption style update the preview immediately. Other settings apply the next time you generate a draft.</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Timeline
        projectId={project.id}
        tracks={tracks}
        time={time}
        duration={Math.max(duration, project.settings.targetDurationSec)}
        onSeek={seek}
        selectedId={selectedId}
        onSelect={select}
        onCommit={commit}
        onSplit={split}
        onDelete={del}
        writable={writable}
        undo={undo}
        redo={redo}
        canUndo={hist.past.length > 0}
        canRedo={hist.future.length > 0}
      />
    </div>
  );
}
