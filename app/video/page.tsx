"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Clapperboard, Film, Plus } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import type { VideoProject } from "@/lib/types";
import { STATUS_FLOW, fmtDuration, timelineEnd } from "@/lib/ai/video";
import { relTime } from "@/lib/utils";
import { AIBadge, Badge, Button, Card, EmptyState, MemberAvatar, PageHeader, Readonly, SearchInput, Segmented, Select, Table, Td, Th } from "@/components/ui";
import { VideoStatus, WorkflowTracker } from "@/components/video/common";
import { NewProjectModal } from "@/components/video/NewProjectModal";

const durationOf = (v: VideoProject) => (v.tracks.length ? timelineEnd(v.tracks) : v.settings.targetDurationSec);

export default function VideoProjectsPage() {
  const me = useMe();
  const router = useRouter();
  const videos = useCRM((s) => s.videos);
  const clients = useCRM((s) => s.clients);
  const usedMin = useCRM((s) => s.organization.usage.videoMinutes);
  const limitMin = useCRM((s) => s.organization.limits.videoMinutes);
  const writable = can(me.role, "video", "write") && me.role !== "client";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("All");
  const [clientId, setClientId] = useState("All");
  const [view, setView] = useState<"table" | "cards">("table");
  const [creating, setCreating] = useState(false);

  const scoped = useMemo(() => (me.role === "client" ? videos.filter((v) => v.clientId === me.clientId) : videos), [videos, me]);
  const visible = useMemo(
    () =>
      scoped
        .filter((v) => (status === "All" || v.status === status) && (clientId === "All" || v.clientId === clientId) && (!q || `${v.title} ${v.objective}`.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [scoped, status, clientId, q],
  );
  const clientName = (id?: string) => clients.find((c) => c.id === id)?.company ?? "Internal";
  const stats = useMemo(() => ({
    active: scoped.filter((v) => v.status !== "Exported").length,
    review: scoped.filter((v) => v.status === "In Review").length,
    exported: scoped.filter((v) => v.status === "Exported").length,
    versions: scoped.reduce((a, v) => a + v.versions.length, 0),
  }), [scoped]);

  return (
    <div>
      <PageHeader
        icon={<Clapperboard className="size-5 text-accent-text" />}
        title="AI Video Editor"
        description="Upload raw footage, scripts and reel plans — the Video Agent builds an editable timeline, you review, it revises."
        actions={
          <>
            <Segmented value={view} onChange={setView} options={[{ value: "table", label: "Table" }, { value: "cards", label: "Cards" }]} />
            {writable && <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>New video project</Button>}
          </>
        }
      />
      {!writable && <Readonly>You have read-only access to video projects.</Readonly>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Card className="p-3"><p className="text-xs text-fg-3">Active projects</p><p className="text-xl font-semibold tabular-nums mt-1">{stats.active}</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">In review</p><p className="text-xl font-semibold tabular-nums mt-1">{stats.review}</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">Exported</p><p className="text-xl font-semibold tabular-nums mt-1">{stats.exported}</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">Versions</p><p className="text-xl font-semibold tabular-nums mt-1">{stats.versions}</p></Card>
        <Card className="p-3 col-span-2 lg:col-span-1"><p className="text-xs text-fg-3">Video minutes used</p><p className="text-xl font-semibold tabular-nums mt-1">{usedMin}<span className="text-xs text-fg-3 font-normal"> / {limitMin === -1 ? "∞" : limitMin}</span></p></Card>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2 p-3 border-b border-border">
          <SearchInput value={q} onChange={setQ} placeholder="Search video projects…" className="w-full sm:w-64" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            <option value="All">All statuses</option>
            {STATUS_FLOW.map((s) => <option key={s}>{s}</option>)}
          </Select>
          {me.role !== "client" && (
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-44">
              <option value="All">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </Select>
          )}
          <span className="ml-auto self-center text-xs text-fg-3">{visible.length} projects</span>
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={<Film className="size-5" />} title="No video projects" description={writable ? "Create a project and upload raw footage to get an AI first draft." : undefined} action={writable && <Button variant="primary" onClick={() => setCreating(true)}>New video project</Button>} />
        ) : view === "table" ? (
          <Table>
            <thead>
              <tr>
                <Th>Project</Th>
                <Th>Status</Th>
                <Th>Aspect</Th>
                <Th>Duration</Th>
                <Th>Assets</Th>
                <Th>Versions</Th>
                <Th>Open notes</Th>
                <Th>Owner</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((v) => (
                <tr key={v.id} onClick={() => router.push(`/video/${v.id}`)} className="cursor-pointer hover:bg-surface-2/60">
                  <Td>
                    <p className="font-medium">{v.title}</p>
                    <p className="text-xs text-fg-3">{clientName(v.clientId)}</p>
                  </Td>
                  <Td><VideoStatus status={v.status} /></Td>
                  <Td><Badge>{v.settings.aspect}</Badge></Td>
                  <Td className="tabular-nums">{fmtDuration(durationOf(v))}{!v.tracks.length && <span className="text-[11px] text-fg-3"> target</span>}</Td>
                  <Td className="tabular-nums text-fg-2">{v.assets.length}</Td>
                  <Td className="tabular-nums text-fg-2">{v.versions.length}{v.versions.some((x) => x.exported) && <span className="ml-1 text-[11px] text-success">· {v.versions.filter((x) => x.exported).length} exported</span>}</Td>
                  <Td className="tabular-nums text-fg-2">{v.reviewNotes.filter((n) => !n.resolved).length || "—"}</Td>
                  <Td><MemberAvatar id={v.ownerId} showName /></Td>
                  <Td className="text-xs text-fg-3 whitespace-nowrap">{relTime(v.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((v) => (
              <Link key={v.id} href={`/video/${v.id}`} className="block rounded-xl border border-border bg-surface p-3 hover:bg-surface-2/60 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-[13px] truncate">{v.title}</p>
                    <p className="text-xs text-fg-3 truncate">{clientName(v.clientId)} · {v.objective}</p>
                  </div>
                  <VideoStatus status={v.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-fg-2">
                  <Badge>{v.settings.aspect}</Badge>
                  <Badge>{fmtDuration(durationOf(v))}</Badge>
                  <Badge>{v.versions.length} versions</Badge>
                  {v.analysis && <AIBadge>Hook {v.analysis.hookScore}</AIBadge>}
                </div>
                <div className="mt-3 scale-[0.92] origin-left pointer-events-none"><WorkflowTracker project={v} /></div>
                <div className="mt-2 flex items-center justify-between text-xs text-fg-3">
                  <MemberAvatar id={v.ownerId} showName />
                  <span>{relTime(v.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
      <NewProjectModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
