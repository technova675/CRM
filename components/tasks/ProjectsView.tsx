"use client";

import { useMemo, useState } from "react";
import { AlarmClock, FolderKanban, Plus } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import type { Project, Task } from "@/lib/types";
import { cn, DAY, fmtShort, isPast, uid } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, Field, Input, MemberAvatar, Modal, Progress, Segmented, Select, StatusBadge, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";

const P_STATUSES: Project["status"][] = ["Planning", "Active", "On Hold", "Completed"];

export function projectProgress(p: Project, tasks: Task[]) {
  const mine = tasks.filter((t) => t.projectId === p.id);
  const done = mine.filter((t) => t.status === "Done").length;
  const overdue = mine.filter((t) => t.status !== "Done" && isPast(t.dueDate)).length;
  return { total: mine.length, done, overdue, pct: mine.length ? (done / mine.length) * 100 : p.status === "Completed" ? 100 : 0 };
}

function ProjectCard({ p, onOpen }: { p: Project; onOpen: () => void }) {
  const tasks = useCRM((s) => s.tasks);
  const client = useCRM((s) => s.clients.find((c) => c.id === p.clientId));
  const pr = projectProgress(p, tasks);
  return (
    <button onClick={onOpen} className="w-full rounded-lg border border-border bg-surface p-3 text-left shadow-card transition hover:border-border-strong">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{p.name}</p>
          <p className="truncate text-[11px] text-fg-3">{client?.company ?? "—"}</p>
        </div>
        <MemberAvatar id={p.ownerId} size={20} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Progress value={pr.pct} tone={pr.pct === 100 ? "success" : pr.overdue ? "warning" : "accent"} className="flex-1" />
        <span className="text-[11px] tabular-nums text-fg-3">{pr.done}/{pr.total}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-fg-3">
        <span className={cn(p.status !== "Completed" && isPast(p.dueDate) && "text-danger")}>Due {fmtShort(p.dueDate)}</span>
        {pr.overdue > 0 && <Badge tone="danger"><AlarmClock className="size-3" /> {pr.overdue} overdue</Badge>}
      </div>
    </button>
  );
}

export function ProjectsView({ writable, onOpenProject }: { writable: boolean; onOpenProject: (id: string) => void }) {
  const projects = useCRM((s) => s.projects);
  const tasks = useCRM((s) => s.tasks);
  const clients = useCRM((s) => s.clients);
  const patch = useCRM((s) => s.patch);
  const [view, setView] = useState<"board" | "list">("board");
  const [clientId, setClientId] = useState("All");
  const [creating, setCreating] = useState(false);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "—";
  const list = useMemo(() => projects.filter((p) => clientId === "All" || p.clientId === clientId).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [projects, clientId]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }]} />
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-48"><option value="All">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</Select>
        <span className="text-xs text-fg-3">{list.length} projects · progress from linked tasks</span>
        {writable && <Button className="ml-auto" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>New project</Button>}
      </div>
      {list.length === 0 ? (
        <Card><EmptyState icon={<FolderKanban className="size-5" />} title="No projects yet" description="Group tasks for a client into a project to track progress." /></Card>
      ) : view === "board" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {P_STATUSES.map((st) => {
            const col = list.filter((p) => p.status === st);
            return (
              <div key={st} className="min-h-40 rounded-xl border border-border bg-surface-2/60 p-2"
                onDragOver={(e) => writable && e.preventDefault()}
                onDrop={(e) => { const id = e.dataTransfer.getData("text/project"); if (id && writable) patch("projects", id, { status: st }, { entity: "task", action: "Project status changed", field: "status" }); }}>
                <div className="mb-1 flex items-center justify-between px-1.5 py-1"><StatusBadge status={st} /><span className="text-xs tabular-nums text-fg-3">{col.length}</span></div>
                <div className="space-y-2">
                  {col.map((p) => (
                    <div key={p.id} draggable={writable} onDragStart={(e) => e.dataTransfer.setData("text/project", p.id)}><ProjectCard p={p} onOpen={() => onOpenProject(p.id)} /></div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table>
            <thead><tr><Th>Project</Th><Th>Client</Th><Th>Owner</Th><Th>Status</Th><Th className="w-40">Progress</Th><Th>Start</Th><Th>Due</Th></tr></thead>
            <tbody>
              {list.map((p) => {
                const pr = projectProgress(p, tasks);
                return (
                  <tr key={p.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => onOpenProject(p.id)}>
                    <Td className="font-medium">{p.name}</Td>
                    <Td className="text-fg-2">{clientName(p.clientId)}</Td>
                    <Td><MemberAvatar id={p.ownerId} showName /></Td>
                    <Td>
                      <Select disabled={!writable} onClick={(e) => e.stopPropagation()} value={p.status} onChange={(e) => patch("projects", p.id, { status: e.target.value as Project["status"] }, { entity: "task", action: "Project status changed", field: "status" })} className="h-7 w-32 text-xs">
                        {P_STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </Select>
                    </Td>
                    <Td><div className="flex items-center gap-2"><Progress value={pr.pct} className="w-20" /><span className="text-[11px] tabular-nums text-fg-3">{pr.done}/{pr.total}</span></div></Td>
                    <Td className="text-xs text-fg-2">{fmtShort(p.startDate)}</Td>
                    <Td className={cn("text-xs", p.status !== "Completed" && isPast(p.dueDate) ? "text-danger" : "text-fg-2")}>{fmtShort(p.dueDate)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
      {creating && <NewProjectModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const clients = useCRM((s) => s.clients);
  const team = useCRM((s) => s.team);
  const upsert = useCRM((s) => s.upsert);
  const log = useCRM((s) => s.log);
  const [f, setF] = useState(() => ({ name: "", clientId: clients[0]?.id ?? "", ownerId: me.id, status: "Planning" as Project["status"], start: new Date().toISOString().slice(0, 10), due: new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10) }));
  const submit = () => {
    if (!f.name.trim() || !f.clientId) return toast("Name and client are required", undefined, "warning");
    const p: Project = { id: uid("prj"), name: f.name.trim(), clientId: f.clientId, ownerId: f.ownerId, status: f.status, startDate: new Date(`${f.start}T09:00:00`).toISOString(), dueDate: new Date(`${f.due}T18:00:00`).toISOString(), createdAt: new Date().toISOString() };
    upsert("projects", p);
    log({ actor: "human", actorId: me.id, entity: "task", entityId: p.id, action: "Created project", detail: p.name });
    toast("Project created", "Link tasks to it from the task drawer.");
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="New project" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Create</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" className="col-span-2"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Q4 Performance Sprint" /></Field>
        <Field label="Client"><Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>{clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</Select></Field>
        <Field label="Owner"><Select value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>{team.filter((t) => t.role !== "client").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Project["status"] })}>{P_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <div />
        <Field label="Start"><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="Due"><Input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
