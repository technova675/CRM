"use client";

import { useMemo, useState } from "react";
import { Link2, Lock, MessageSquare, Paperclip, Plus, Repeat, Trash2, X } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import type { Priority, Task, TaskRelatedType, TaskStatus } from "@/lib/types";
import { cn, fmtDateTime, fmtShort, isPast, relTime, uid } from "@/lib/utils";
import { Badge, Button, Drawer, Field, Input, MemberAvatar, Select, StatusBadge, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { REL_TYPES, useRelatedIndex } from "./related";

export const TASK_STATUSES: TaskStatus[] = ["Todo", "In Progress", "Blocked", "Done"];
export const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Urgent"];
const RECURRING: NonNullable<Task["recurring"]>[] = ["none", "daily", "weekly", "monthly"];

export function TaskDrawer({ task, onClose, writable, clientView, defaults }: { task: Task | null; onClose: () => void; writable: boolean; clientView?: boolean; defaults?: Partial<Task> }) {
  const me = useMe();
  const team = useCRM((s) => s.team);
  const tasks = useCRM((s) => s.tasks);
  const projects = useCRM((s) => s.projects);
  const addTask = useCRM((s) => s.addTask);
  const updateTask = useCRM((s) => s.updateTask);
  const deleteTask = useCRM((s) => s.deleteTask);
  const related = useRelatedIndex();
  const live = task ? tasks.find((t) => t.id === task.id) ?? task : null;

  const [f, setF] = useState(() => ({
    title: task?.title ?? defaults?.title ?? "",
    description: task?.description ?? "",
    assigneeId: task?.assigneeId ?? defaults?.assigneeId ?? me.id,
    priority: task?.priority ?? ("Medium" as Priority),
    dueDate: (task?.dueDate ?? new Date(Date.now() + 2 * 86400000).toISOString()).slice(0, 10),
    status: task?.status ?? ("Todo" as TaskStatus),
    relType: (task?.related?.type ?? defaults?.related?.type ?? "") as TaskRelatedType | "",
    relId: task?.related?.id ?? defaults?.related?.id ?? "",
    recurring: task?.recurring ?? "none",
    projectId: task?.projectId ?? defaults?.projectId ?? "",
    dependsOn: task?.dependsOn ?? [],
    attachments: task?.attachments ?? [],
  }));
  const [comment, setComment] = useState("");
  const [attachName, setAttachName] = useState("");
  const [depPick, setDepPick] = useState("");

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const deps = f.dependsOn.map((id) => byId.get(id)).filter((t): t is Task => !!t);
  const blocking = deps.filter((d) => d.status !== "Done");
  // Candidates: open tasks, not this one, not tasks that already depend on this one (avoids simple cycles).
  const depCandidates = useMemo(() => {
    const project = f.projectId;
    return tasks
      .filter((t) => t.id !== task?.id && !f.dependsOn.includes(t.id) && !(t.dependsOn ?? []).includes(task?.id ?? "__"))
      .sort((a, b) => Number(!!project && b.projectId === project) - Number(!!project && a.projectId === project) || Number(b.related?.id === f.relId) - Number(a.related?.id === f.relId))
      .slice(0, 150);
  }, [tasks, task, f.dependsOn, f.projectId, f.relId]);
  const options = related.options(f.relType);
  const dependents = task ? tasks.filter((t) => (t.dependsOn ?? []).includes(task.id)) : [];

  const save = () => {
    if (!f.title.trim()) return toast("Title is required", undefined, "warning");
    const payload = {
      title: f.title,
      description: f.description,
      assigneeId: f.assigneeId,
      priority: f.priority,
      dueDate: new Date(`${f.dueDate}T18:00:00`).toISOString(),
      status: f.status,
      related: f.relType && f.relId ? { type: f.relType, id: f.relId } : undefined,
      recurring: f.recurring,
      projectId: f.projectId || undefined,
      dependsOn: f.dependsOn,
      attachments: f.attachments,
    };
    if (task) updateTask(task.id, payload);
    else addTask({ ...payload, comments: [] });
    if (f.status === "Done" && blocking.length) toast("Completed with open dependencies", `${blocking.length} dependency task(s) are not done yet.`, "warning");
    else toast(task ? "Task updated" : "Task created", f.recurring !== "none" ? `Repeats ${f.recurring} — the next one is created when this is completed.` : undefined);
    onClose();
  };

  const addComment = () => {
    if (!live || !comment.trim()) return;
    updateTask(live.id, { comments: [...(live.comments ?? []), { id: uid("tc"), authorId: me.id, body: comment.trim(), at: new Date().toISOString() }] });
    setComment("");
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width={600}
      title={task ? (writable ? "Edit task" : task.title) : "New task"}
      subtitle={task ? <span className="flex flex-wrap items-center gap-2">Created {fmtShort(task.createdAt)} by {task.createdBy === "ai" ? "AI" : task.createdBy === "automation" ? "automation" : "a person"} {blocking.length > 0 && <Badge tone="danger"><Lock className="size-3" /> Blocked by {blocking.length}</Badge>}</span> : undefined}
      footer={
        writable ? (
          <>
            {task && <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="size-3.5" />} onClick={() => { deleteTask(task.id); toast("Task deleted"); onClose(); }}>Delete</Button>}
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save}>{task ? "Save" : "Create task"}</Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="space-y-5">
        <fieldset disabled={!writable} className="grid grid-cols-2 gap-3">
          <Field label="Title" className="col-span-2"><Input autoFocus={!task} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Description" className="col-span-2"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Assignee"><Select value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}>{team.filter((t) => t.role !== "client").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Priority"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
          <Field label="Due date"><Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
          <Field label="Status" hint={blocking.length && f.status !== "Done" ? "Shown as blocked until dependencies are done" : undefined}><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as TaskStatus })}>{TASK_STATUSES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
          {!clientView && (
            <>
              <Field label="Related to"><Select value={f.relType} onChange={(e) => setF({ ...f, relType: e.target.value as TaskRelatedType | "", relId: "" })}><option value="">Nothing</option>{REL_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></Field>
              <Field label="Record">
                <Select disabled={!f.relType || !writable} value={f.relId} onChange={(e) => setF({ ...f, relId: e.target.value })}>
                  <option value="">{f.relType && !options.length ? "No records yet" : "Select…"}</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Project"><Select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field label="Repeat" hint={f.recurring !== "none" ? "Next occurrence is created on completion" : undefined}>
                <Select value={f.recurring} onChange={(e) => setF({ ...f, recurring: e.target.value as NonNullable<Task["recurring"]> })}>{RECURRING.map((r) => <option key={r} value={r}>{r === "none" ? "Does not repeat" : r.charAt(0).toUpperCase() + r.slice(1)}</option>)}</Select>
              </Field>
            </>
          )}
        </fieldset>

        {!clientView && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-3"><Link2 className="size-3.5" /> Dependencies</h4>
            <div className="space-y-1.5">
              {deps.length === 0 && <p className="text-xs text-fg-3">No dependencies — this task can start any time.</p>}
              {deps.map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[13px]">
                  <StatusBadge status={d.status} />
                  <span className={cn("min-w-0 flex-1 truncate", d.status === "Done" && "text-fg-3 line-through")}>{d.title}</span>
                  <MemberAvatar id={d.assigneeId} size={18} />
                  {writable && <button onClick={() => setF({ ...f, dependsOn: f.dependsOn.filter((x) => x !== d.id) })} className="text-fg-3 hover:text-danger" aria-label="Remove dependency"><X className="size-3.5" /></button>}
                </div>
              ))}
              {writable && (
                <div className="flex gap-2">
                  <Select value={depPick} onChange={(e) => setDepPick(e.target.value)} className="flex-1">
                    <option value="">Add a task this depends on…</option>
                    {depCandidates.map((t) => <option key={t.id} value={t.id}>{t.status === "Done" ? "✓ " : ""}{t.title}</option>)}
                  </Select>
                  <Button icon={<Plus className="size-3.5" />} disabled={!depPick} onClick={() => { setF({ ...f, dependsOn: [...f.dependsOn, depPick] }); setDepPick(""); }}>Add</Button>
                </div>
              )}
              {dependents.length > 0 && <p className="text-[11px] text-fg-3">Blocks: {dependents.map((d) => d.title).join(", ")}</p>}
            </div>
          </section>
        )}

        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-3"><Paperclip className="size-3.5" /> Attachments</h4>
          <div className="space-y-1.5">
            {f.attachments.length === 0 && <p className="text-xs text-fg-3">No attachments.</p>}
            {f.attachments.map((a, i) => (
              <div key={`${a.name}-${i}`} className="flex items-center gap-2 text-[13px]">
                <Paperclip className="size-3.5 text-fg-3" />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="text-[11px] text-fg-3">{relTime(a.addedAt)}</span>
                {writable && <button onClick={() => setF({ ...f, attachments: f.attachments.filter((_, j) => j !== i) })} className="text-fg-3 hover:text-danger" aria-label="Remove attachment"><X className="size-3.5" /></button>}
              </div>
            ))}
            {writable && (
              <div className="flex flex-wrap gap-2">
                <Input value={attachName} onChange={(e) => setAttachName(e.target.value)} placeholder="File name or link (metadata only)" className="min-w-0 flex-1" />
                <label className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-border px-3 text-[13px] hover:bg-surface-2">
                  Choose file
                  <input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setF({ ...f, attachments: [...f.attachments, { name: file.name, addedAt: new Date().toISOString() }] }); e.target.value = ""; }} />
                </label>
                <Button disabled={!attachName.trim()} onClick={() => { setF({ ...f, attachments: [...f.attachments, { name: attachName.trim(), addedAt: new Date().toISOString() }] }); setAttachName(""); }}>Add</Button>
              </div>
            )}
            {writable && <p className="text-[11px] text-fg-3">Only file names are stored until file storage is connected (Settings → Integrations).</p>}
          </div>
        </section>

        {task && !clientView && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-3"><MessageSquare className="size-3.5" /> Comments <Badge className="normal-case">Internal</Badge></h4>
            <ul className="space-y-2">
              {(live?.comments ?? []).length === 0 && <li className="text-xs text-fg-3">No comments yet.</li>}
              {(live?.comments ?? []).map((c) => (
                <li key={c.id} className="flex gap-2">
                  <MemberAvatar id={c.authorId} size={22} />
                  <div className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2">
                    <p className="text-[11px] text-fg-3"><b className="font-medium text-fg-2">{team.find((t) => t.id === c.authorId)?.name ?? "Team"}</b> · {fmtDateTime(c.at)}</p>
                    <p className="whitespace-pre-line text-[13px]">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            {writable && (
              <div className="mt-2 flex gap-2">
                <Input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} placeholder="Write a comment… (Enter to post)" className="flex-1" />
                <Button onClick={addComment} disabled={!comment.trim()}>Post</Button>
              </div>
            )}
          </section>
        )}

        {task && task.status !== "Done" && isPast(task.dueDate) && <Badge tone="danger" dot>Overdue</Badge>}
        {task?.recurring && task.recurring !== "none" && <p className="flex items-center gap-1.5 text-xs text-fg-3"><Repeat className="size-3.5" /> Repeats {task.recurring}</p>}
      </div>
    </Drawer>
  );
}

