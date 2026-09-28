"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AlarmClock, Bot, CheckCircle2, Circle, Lock, MessageSquare, Paperclip, Plus, Repeat, User, Workflow, X } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import type { Task, TaskStatus } from "@/lib/types";
import { cn, fmtShort, isPast, isSameDay } from "@/lib/utils";
import { Badge, Button, Card, Checkbox, EmptyState, MemberAvatar, PageHeader, Readonly, SearchInput, Segmented, Select, StatusBadge, Table, Tabs, Td, Th } from "@/components/ui";
import { TaskDrawer, PRIORITIES, TASK_STATUSES } from "@/components/tasks/TaskDrawer";
import { isBlockedByDeps, REL_TYPES, useRelatedIndex } from "@/components/tasks/related";
import { ProjectsView } from "@/components/tasks/ProjectsView";
import { WorkloadView } from "@/components/tasks/WorkloadView";

type Tab = "tasks" | "projects" | "workload";

function CreatedBy({ by }: { by: Task["createdBy"] }) {
  const Icon = by === "ai" ? Bot : by === "automation" ? Workflow : User;
  return (
    <span title={`Created by ${by}`} className={cn("inline-flex items-center gap-1 text-[11px]", by === "ai" ? "text-accent-text" : by === "automation" ? "text-info" : "text-fg-3")}>
      <Icon className="size-3" />
      {by === "ai" ? "AI" : by === "automation" ? "Auto" : "Human"}
    </span>
  );
}

function TaskMeta({ t, blocked, clientView }: { t: Task; blocked: boolean; clientView: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-3">
      {blocked && t.status !== "Done" && <Badge tone="danger"><Lock className="size-3" /> Blocked</Badge>}
      {t.recurring && t.recurring !== "none" && <span title={`Repeats ${t.recurring}`}><Repeat className="size-3" /></span>}
      {!clientView && (t.comments?.length ?? 0) > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="size-3" />{t.comments!.length}</span>}
      {(t.attachments?.length ?? 0) > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip className="size-3" />{t.attachments!.length}</span>}
    </span>
  );
}

function TasksInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const tasks = useCRM((s) => s.tasks);
  const team = useCRM((s) => s.team);
  const projects = useCRM((s) => s.projects);
  const updateTask = useCRM((s) => s.updateTask);
  const related = useRelatedIndex();
  const clientView = me.role === "client";
  const writable = can(me.role, "tasks", "write") && !clientView;

  const [tab, setTab] = useState<Tab>("tasks");
  const [view, setView] = useState<"list" | "board">("list");
  const [q, setQ] = useState("");
  const [assignee, setAssignee] = useState("All");
  const [priority, setPriority] = useState("All");
  const [status, setStatus] = useState("Open");
  const [relType, setRelType] = useState("All");
  const [mine, setMine] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const projectId = params.get("project") ?? "All";
  const creating = params.get("new") === "1";
  const setParam = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => (v === null ? sp.delete(k) : sp.set(k, v)));
    router.replace(`/tasks${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  };

  // Client portal: only tasks attached to their own client record, read-only.
  const scoped = useMemo(() => (clientView ? tasks.filter((t) => t.related?.type === "client" && t.related.id === me.clientId) : tasks), [tasks, clientView, me.clientId]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const overdue = useMemo(() => scoped.filter((t) => t.status !== "Done" && isPast(t.dueDate) && !isSameDay(t.dueDate)), [scoped]);
  const dueToday = useMemo(() => scoped.filter((t) => t.status !== "Done" && isSameDay(t.dueDate)), [scoped]);
  const blockedCount = useMemo(() => scoped.filter((t) => t.status !== "Done" && isBlockedByDeps(t, byId)).length, [scoped, byId]);

  const list = useMemo(
    () =>
      scoped
        .filter((t) => {
          if (q && !`${t.title} ${t.description}`.toLowerCase().includes(q.toLowerCase())) return false;
          if (mine && t.assigneeId !== me.id) return false;
          if (assignee !== "All" && t.assigneeId !== assignee) return false;
          if (priority !== "All" && t.priority !== priority) return false;
          if (projectId !== "All" && t.projectId !== projectId) return false;
          if (view === "list") {
            if (status === "Open" && t.status === "Done") return false;
            if (status !== "Open" && status !== "All" && t.status !== status) return false;
          }
          if (relType !== "All" && t.related?.type !== relType) return false;
          if (overdueOnly && !(t.status !== "Done" && isPast(t.dueDate))) return false;
          if (blockedOnly && !(t.status !== "Done" && isBlockedByDeps(t, byId))) return false;
          return true;
        })
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [scoped, q, mine, me.id, assignee, priority, status, relType, overdueOnly, blockedOnly, view, projectId, byId],
  );

  const toggleDone = (t: Task) => {
    if (!writable) return;
    updateTask(t.id, { status: t.status === "Done" ? "Todo" : "Done" });
  };
  const project = projects.find((p) => p.id === projectId);

  return (
    <div>
      <PageHeader
        title={clientView ? "Tasks" : "Tasks & projects"}
        description={clientView ? "Work the agency is doing on your account." : "Tasks for clients, campaigns, creatives, SEO, influencer projects and deals — with dependencies, recurring tasks, projects and team workload."}
        actions={
          <>
            {tab === "tasks" && <Segmented value={view} onChange={setView} options={[{ value: "list", label: "List" }, { value: "board", label: "Board" }]} />}
            {writable && <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setParam({ new: "1" })}>New task</Button>}
          </>
        }
      />
      {clientView && <Readonly>Showing tasks related to your account (read-only).</Readonly>}
      {!clientView && (
        <div className="mb-4">
          <Tabs value={tab} onChange={setTab} tabs={[{ value: "tasks", label: "Tasks", count: list.length }, { value: "projects", label: "Projects", count: projects.length }, { value: "workload", label: "Team workload" }]} />
        </div>
      )}

      {tab === "projects" && !clientView ? (
        <ProjectsView writable={writable} onOpenProject={(id) => { setTab("tasks"); setParam({ project: id }); }} />
      ) : tab === "workload" && !clientView ? (
        <WorkloadView onPickMember={(id) => { setAssignee(id); setTab("tasks"); }} />
      ) : (
        <>
          {(overdue.length > 0 || dueToday.length > 0 || blockedCount > 0) && (
            <div className="mb-4 grid gap-2 sm:grid-cols-3">
              {overdue.length > 0 && (
                <button onClick={() => { setOverdueOnly(true); setStatus("Open"); }} className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-left">
                  <AlarmClock className="size-4 shrink-0 text-danger" />
                  <span className="min-w-0 text-[13px]"><b className="text-danger">{overdue.length} overdue</b> <span className="line-clamp-1 text-fg-2">{overdue.slice(0, 2).map((t) => t.title).join(", ")}</span></span>
                </button>
              )}
              {dueToday.length > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3">
                  <AlarmClock className="size-4 shrink-0 text-warning" />
                  <span className="text-[13px]"><b className="text-warning">{dueToday.length} due today</b></span>
                </div>
              )}
              {blockedCount > 0 && !clientView && (
                <button onClick={() => setBlockedOnly((v) => !v)} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left">
                  <Lock className="size-4 shrink-0 text-fg-3" />
                  <span className="text-[13px]"><b>{blockedCount} waiting on dependencies</b> <span className="text-fg-3">{blockedOnly ? "· showing" : "· show"}</span></span>
                </button>
              )}
            </div>
          )}

          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <SearchInput value={q} onChange={setQ} placeholder="Search tasks…" className="w-full sm:w-56" />
              {!clientView && (
                <>
                  <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-36">
                    <option value="All">All assignees</option>
                    {team.filter((t) => t.role !== "client").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                  <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-32"><option value="All">Any priority</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</Select>
                </>
              )}
              {view === "list" && (
                <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-32"><option value="Open">Open</option><option value="All">All statuses</option>{TASK_STATUSES.map((p) => <option key={p}>{p}</option>)}</Select>
              )}
              {!clientView && (
                <>
                  <Select value={relType} onChange={(e) => setRelType(e.target.value)} className="w-40"><option value="All">Any link</option>{REL_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select>
                  <Select value={projectId} onChange={(e) => setParam({ project: e.target.value === "All" ? null : e.target.value })} className="w-44"><option value="All">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
                  <label className="flex items-center gap-1.5 text-xs text-fg-2"><Checkbox checked={mine} onChange={setMine} /> My tasks</label>
                </>
              )}
              <label className="flex items-center gap-1.5 text-xs text-fg-2"><Checkbox checked={overdueOnly} onChange={setOverdueOnly} /> Overdue</label>
              <span className="ml-auto text-xs text-fg-3">{list.length} tasks</span>
            </div>
            {project && (
              <div className="flex items-center gap-2 border-b border-border bg-accent-soft/40 px-3 py-2 text-xs">
                Project: <b className="font-medium">{project.name}</b>
                <button onClick={() => setParam({ project: null })} className="ml-auto inline-flex items-center gap-1 text-fg-3 hover:text-fg"><X className="size-3" /> Clear</button>
              </div>
            )}

            {view === "list" ? (
              list.length === 0 ? (
                <EmptyState icon={<CheckCircle2 className="size-5" />} title="Nothing here" description="No tasks match these filters." />
              ) : (
                <Table>
                  <thead><tr><Th className="w-8" /><Th>Task</Th><Th className="hidden md:table-cell">Related to</Th><Th>Assignee</Th><Th>Priority</Th><Th>Due</Th><Th>Status</Th><Th className="hidden lg:table-cell">Source</Th></tr></thead>
                  <tbody>
                    {list.map((t) => {
                      const rel = related.get(t.related);
                      const late = t.status !== "Done" && isPast(t.dueDate) && !isSameDay(t.dueDate);
                      const blocked = isBlockedByDeps(t, byId);
                      return (
                        <tr key={t.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => setEditing(t)}>
                          <Td>
                            <button onClick={(e) => { e.stopPropagation(); toggleDone(t); }} aria-label="Toggle done" disabled={!writable} className="text-fg-3 hover:text-success disabled:hover:text-fg-3">
                              {t.status === "Done" ? <CheckCircle2 className="size-4 text-success" /> : blocked ? <Lock className="size-4" /> : <Circle className="size-4" />}
                            </button>
                          </Td>
                          <Td className="max-w-80">
                            <span className={cn("line-clamp-1 font-medium", t.status === "Done" && "text-fg-3 line-through")}>{t.title}</span>
                            <TaskMeta t={t} blocked={blocked} clientView={clientView} />
                          </Td>
                          <Td className="hidden md:table-cell text-xs">{rel ? <Link onClick={(e) => e.stopPropagation()} href={clientView ? "/dashboard" : rel.href} className="text-fg-2 hover:text-accent-text hover:underline"><span className="text-fg-3">{REL_TYPES.find((r) => r.value === t.related?.type)?.label}: </span>{rel.label}</Link> : <span className="text-fg-3">—</span>}</Td>
                          <Td><MemberAvatar id={t.assigneeId} showName /></Td>
                          <Td><StatusBadge status={t.priority} /></Td>
                          <Td className={cn("whitespace-nowrap text-xs tabular-nums", late ? "font-medium text-danger" : isSameDay(t.dueDate) ? "font-medium text-warning" : "text-fg-2")}>{isSameDay(t.dueDate) ? "Today" : fmtShort(t.dueDate)}</Td>
                          <Td>
                            {writable ? (
                              <Select onClick={(e) => e.stopPropagation()} value={t.status} onChange={(e) => updateTask(t.id, { status: e.target.value as TaskStatus })} className="h-7 w-32 text-xs">
                                {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
                              </Select>
                            ) : <StatusBadge status={blocked && t.status !== "Done" ? "Blocked" : t.status} />}
                          </Td>
                          <Td className="hidden lg:table-cell"><CreatedBy by={t.createdBy} /></Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )
            ) : (
              <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
                {TASK_STATUSES.map((col) => {
                  // Tasks waiting on dependencies are shown in the Blocked column.
                  const items = list.filter((t) => (col === "Blocked" ? t.status === "Blocked" || (t.status !== "Done" && isBlockedByDeps(t, byId)) : t.status === col && !(t.status !== "Done" && isBlockedByDeps(t, byId))));
                  return (
                    <div
                      key={col}
                      onDragOver={(e) => writable && e.preventDefault()}
                      onDrop={() => {
                        if (dragId && writable) updateTask(dragId, { status: col });
                        setDragId(null);
                      }}
                      className="min-h-60 rounded-xl border border-border bg-surface-2/60 p-2"
                    >
                      <div className="mb-1 flex items-center justify-between px-1.5 py-1">
                        <StatusBadge status={col} />
                        <span className="text-xs tabular-nums text-fg-3">{items.length}</span>
                      </div>
                      <div className="space-y-2">
                        {items.map((t) => {
                          const rel = related.get(t.related);
                          const late = t.status !== "Done" && isPast(t.dueDate) && !isSameDay(t.dueDate);
                          const blocked = isBlockedByDeps(t, byId);
                          return (
                            <div key={t.id} draggable={writable} onDragStart={() => setDragId(t.id)} onClick={() => setEditing(t)} className={cn("cursor-pointer rounded-lg border border-border bg-surface p-2.5 shadow-card hover:border-border-strong", dragId === t.id && "opacity-50")}>
                              <p className="text-[13px] font-medium leading-snug">{t.title}</p>
                              {rel && <p className="mt-1 truncate text-[11px] text-fg-3">{rel.label}</p>}
                              <div className="mt-1"><TaskMeta t={t} blocked={blocked} clientView={clientView} /></div>
                              <div className="mt-2 flex items-center gap-2">
                                <StatusBadge status={t.priority} />
                                <span className={cn("text-[11px] tabular-nums", late ? "text-danger" : "text-fg-3")}>{fmtShort(t.dueDate)}</span>
                                <span className="ml-auto flex items-center gap-1.5"><CreatedBy by={t.createdBy} /><MemberAvatar id={t.assigneeId} size={18} /></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {(editing || creating) && (
        <TaskDrawer
          key={editing?.id ?? "new"}
          task={editing}
          writable={writable}
          clientView={clientView}
          defaults={projectId !== "All" ? { projectId, related: project ? { type: "client", id: project.clientId } : undefined } : undefined}
          onClose={() => { setEditing(null); if (creating) setParam({ new: null }); }}
        />
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense>
      <TasksInner />
    </Suspense>
  );
}
