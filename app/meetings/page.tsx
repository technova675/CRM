"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, ListTodo, Plus, Video } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import type { Meeting, MeetingOutcome } from "@/lib/types";
import { cn, DAY, fmtDate, fmtShort, fmtTime, isSameDay, startOfDay } from "@/lib/utils";
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, MemberAvatar, Modal, PageHeader, Segmented, Select, StatusBadge, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";

const OUTCOMES: MeetingOutcome[] = ["Pending", "Positive", "Needs Follow-up", "Not Interested", "No Show"];
const OUTCOME_EFFECT: Record<MeetingOutcome, string> = {
  Pending: "No change yet.",
  Positive: "Lead moves to Proposal and a “Send proposal” task is created.",
  "Needs Follow-up": "A follow-up task is created for the owner.",
  "Not Interested": "Lead moves to Lost.",
  "No Show": "A follow-up task is created to reschedule.",
};

function useMeetingTarget(m: Meeting) {
  const lead = useCRM((s) => (m.leadId ? s.leads.find((l) => l.id === m.leadId) : undefined));
  const client = useCRM((s) => (m.clientId ? s.clients.find((c) => c.id === m.clientId) : undefined));
  return lead ? { label: `${lead.name} · ${lead.company}`, href: `/leads/${lead.id}` } : client ? { label: client.company, href: `/clients/${client.id}` } : null;
}

function MeetingRow({ m, onOpen, isClient }: { m: Meeting; onOpen: () => void; isClient?: boolean }) {
  const target = useMeetingTarget(m);
  const [now] = useState(() => Date.now());
  const live = new Date(m.startsAt).getTime() <= now && now <= new Date(m.startsAt).getTime() + m.durationMin * 60_000;
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
      <div className="w-14 shrink-0 text-center">
        <p className="text-[11px] uppercase text-fg-3">{new Date(m.startsAt).toLocaleDateString("en-IN", { weekday: "short" })}</p>
        <p className="text-lg font-semibold leading-tight tabular-nums">{new Date(m.startsAt).getDate()}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{m.title}</p>
        <p className="truncate text-xs text-fg-3">
          {fmtTime(m.startsAt)} · {m.durationMin} min{target && !isClient && <> · {target.label}</>}
        </p>
      </div>
      {live && <Badge tone="danger" dot>Live</Badge>}
      {!isClient && <StatusBadge status={m.outcome} className="hidden sm:inline-flex" />}
      <MemberAvatar id={m.ownerId} size={22} />
    </button>
  );
}

function WeekGrid({ meetings, onOpen }: { meetings: Meeting[]; onOpen: (id: string) => void }) {
  const [offset, setOffset] = useState(0);
  const start = useMemo(() => {
    const d = startOfDay();
    const dow = (d.getDay() + 6) % 7; // Monday first
    return new Date(d.getTime() - dow * DAY + offset * 7 * DAY);
  }, [offset]);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY));
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-[13px] font-semibold">
          {fmtShort(days[0]!.toISOString())} – {fmtDate(days[6]!.toISOString())}
        </p>
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" onClick={() => setOffset((o) => o - 1)} aria-label="Previous week" icon={<ChevronLeft className="size-3.5" />} />
          <Button size="xs" variant="ghost" onClick={() => setOffset(0)}>
            Today
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setOffset((o) => o + 1)} aria-label="Next week" icon={<ChevronRight className="size-3.5" />} />
        </div>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-7 sm:divide-x sm:divide-y-0">
        {days.map((d) => {
          const items = meetings.filter((m) => isSameDay(m.startsAt, d)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
          const today = isSameDay(d);
          return (
            <div key={d.toISOString()} className="min-h-24 p-2 sm:min-h-64">
              <p className={cn("mb-2 flex items-center gap-1.5 text-xs", today ? "font-semibold text-accent-text" : "text-fg-3")}>
                {d.toLocaleDateString("en-IN", { weekday: "short" })}
                <span className={cn("grid size-5 place-items-center rounded-full tabular-nums", today && "bg-accent text-white")}>{d.getDate()}</span>
              </p>
              <div className="space-y-1.5">
                {items.map((m) => (
                  <button key={m.id} onClick={() => onOpen(m.id)} className={cn("block w-full rounded-md border-l-2 px-2 py-1.5 text-left text-[11px] hover:opacity-80", m.clientId ? "border-success bg-success-soft" : "border-accent bg-accent-soft")}>
                    <span className="block font-medium tabular-nums text-fg">{fmtTime(m.startsAt)}</span>
                    <span className="line-clamp-2 text-fg-2">{m.title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ScheduleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const leads = useCRM((s) => s.leads);
  const clients = useCRM((s) => s.clients);
  const deals = useCRM((s) => s.deals);
  const team = useCRM((s) => s.team);
  const addMeeting = useCRM((s) => s.addMeeting);
  const me = useMe();
  const [kind, setKind] = useState<"lead" | "client">("lead");
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [dealId, setDealId] = useState("");
  const [date, setDate] = useState(() => new Date(Date.now() + DAY).toISOString().slice(0, 10));
  const [time, setTime] = useState("11:00");
  const [duration, setDuration] = useState(30);
  const [link, setLink] = useState("");
  const [owner, setOwner] = useState(me.id);
  const targetDeals = deals.filter((d) => (kind === "lead" ? d.leadId === target : d.clientId === target));
  const targetName = kind === "lead" ? leads.find((l) => l.id === target)?.company : clients.find((c) => c.id === target)?.company;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule meeting"
      subtitle="Booking a meeting with a lead stops any running follow-up sequence."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!target}
            onClick={() => {
              addMeeting({
                title: title || `${kind === "lead" ? "Discovery call" : "Client review"} — ${targetName}`,
                leadId: kind === "lead" ? target : undefined,
                clientId: kind === "client" ? target : undefined,
                dealId: dealId || undefined,
                startsAt: new Date(`${date}T${time}:00`).toISOString(),
                durationMin: duration,
                link: link || undefined,
                ownerId: owner,
                notes: "",
                outcome: "Pending",
              });
              toast("Meeting scheduled", kind === "lead" ? "Lead moved to Meeting and follow-ups stopped." : undefined);
              onClose();
            }}
          >
            Schedule
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="With" className="col-span-2">
          <Segmented
            value={kind}
            onChange={(v) => {
              setKind(v);
              setTarget("");
              setDealId("");
            }}
            options={[
              { value: "lead", label: "Lead" },
              { value: "client", label: "Client" },
            ]}
          />
        </Field>
        <Field label={kind === "lead" ? "Lead" : "Client"} className="col-span-2">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Select…</option>
            {kind === "lead"
              ? leads
                  .filter((l) => !["Won", "Lost"].includes(l.status))
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.company} · {l.name}
                    </option>
                  ))
              : clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company}
                  </option>
                ))}
          </Select>
        </Field>
        <Field label="Title" className="col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={targetName ? `Discovery call — ${targetName}` : "Discovery call"} />
        </Field>
        {targetDeals.length > 0 && (
          <Field label="Deal" className="col-span-2">
            <Select value={dealId} onChange={(e) => setDealId(e.target.value)}>
              <option value="">— None —</option>
              {targetDeals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Duration">
          <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {[15, 30, 45, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Owner">
          <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
            {team
              .filter((t) => t.role !== "client")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Meeting link" className="col-span-2" hint="Google Meet / Zoom — calendar integration can generate this automatically.">
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/…" />
        </Field>
      </div>
    </Modal>
  );
}

function MeetingDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const meeting = useCRM((s) => s.meetings.find((m) => m.id === id));
  const updateMeeting = useCRM((s) => s.updateMeeting);
  const setOutcome = useCRM((s) => s.setMeetingOutcome);
  const addTask = useCRM((s) => s.addTask);
  const me = useMe();
  const canWrite = can(me.role, "meetings", "write") && me.role !== "client";
  const [pending, setPending] = useState<MeetingOutcome | null>(null);
  if (!meeting) return null;
  // Client portal: only their own meetings (never another client's), without internal notes or outcomes.
  if (me.role === "client" && meeting.clientId !== me.clientId) return null;
  return <MeetingDrawerBody key={meeting.id} meeting={meeting} onClose={onClose} canWrite={canWrite} isClient={me.role === "client"} pending={pending} setPending={setPending} updateMeeting={updateMeeting} setOutcome={setOutcome} addTask={addTask} />;
}

function MeetingDrawerBody({
  meeting,
  onClose,
  canWrite,
  pending,
  setPending,
  updateMeeting,
  setOutcome,
  addTask,
  isClient,
}: {
  isClient?: boolean;
  meeting: Meeting;
  onClose: () => void;
  canWrite: boolean;
  pending: MeetingOutcome | null;
  setPending: (o: MeetingOutcome | null) => void;
  updateMeeting: (id: string, p: Partial<Meeting>) => void;
  setOutcome: (id: string, o: MeetingOutcome, notes?: string) => void;
  addTask: ReturnType<typeof useCRM.getState>["addTask"];
}) {
  const target = useMeetingTarget(meeting);
  const [notes, setNotes] = useState(meeting.notes);
  const chosen = pending ?? meeting.outcome;
  return (
    <Drawer
      open
      onClose={() => {
        setPending(null);
        onClose();
      }}
      title={meeting.title}
      subtitle={`${fmtDate(meeting.startsAt)} · ${fmtTime(meeting.startsAt)} · ${meeting.durationMin} min`}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {meeting.link && (
            <Button href={meeting.link} external variant="primary" icon={<Video className="size-3.5" />}>
                Join meeting
              </Button>
          )}
          {target && !isClient && (
            <Button href={target.href}>{target.label}</Button>
          )}
          <MemberAvatar id={meeting.ownerId} showName />
        </div>
        {meeting.link && (
          <Field label="Meeting link">
            <Input disabled={!canWrite} value={meeting.link} onChange={(e) => updateMeeting(meeting.id, { link: e.target.value })} />
          </Field>
        )}
        {isClient ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-2">Your account manager will share the agenda and a summary after the meeting.</p>
        ) : (<>
        <Field label="Meeting notes">
          <Textarea disabled={!canWrite} rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== meeting.notes && updateMeeting(meeting.id, { notes })} placeholder="Goals, budget, objections, decision process…" />
        </Field>
        <div>
          <p className="mb-2 text-xs font-medium text-fg-2">Outcome</p>
          <div className="flex flex-wrap gap-1.5">
            {OUTCOMES.map((o) => (
              <button key={o} disabled={!canWrite} onClick={() => setPending(o)} className={cn("rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-60", chosen === o ? "border-accent bg-accent-soft text-accent-text" : "border-border hover:bg-surface-2")}>
                {o}
              </button>
            ))}
          </div>
          <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-2">
            <strong>Automation:</strong> {OUTCOME_EFFECT[chosen]}
            {!meeting.leadId && " (Only applies to lead meetings.)"}
          </p>
          {canWrite && pending && pending !== meeting.outcome && (
            <Button
              className="mt-2"
              variant="primary"
              onClick={() => {
                setOutcome(meeting.id, pending, notes);
                toast(`Outcome saved: ${pending}`, meeting.leadId ? OUTCOME_EFFECT[pending] : undefined);
                setPending(null);
              }}
            >
              Save outcome
            </Button>
          )}
        </div>
        </>)}
        {canWrite && (
          <Button
            icon={<ListTodo className="size-3.5" />}
            onClick={() => {
              addTask({
                title: `Follow up: ${meeting.title}`,
                description: notes,
                assigneeId: meeting.ownerId,
                priority: "Medium",
                dueDate: new Date(Date.now() + 2 * DAY).toISOString(),
                status: "Todo",
                related: meeting.leadId ? { type: "lead", id: meeting.leadId } : meeting.clientId ? { type: "client", id: meeting.clientId } : undefined,
              });
              toast("Follow-up task created", "Due in 2 days");
            }}
          >
            Create follow-up task
          </Button>
        )}
      </div>
    </Drawer>
  );
}

export default function MeetingsPage() {
  const all = useCRM((s) => s.meetings);
  const me = useMe();
  const canWrite = can(me.role, "meetings", "write") && me.role !== "client";
  const [view, setView] = useState<"agenda" | "week">("agenda");
  const [tab, setTab] = useState<"today" | "upcoming" | "past">("upcoming");
  const [open, setOpen] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const [now] = useState(() => Date.now());
  const meetings = useMemo(() => (me.role === "client" ? all.filter((m) => m.clientId === me.clientId) : all), [all, me]);
  const groups = useMemo(() => {
    const sorted = [...meetings].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return {
      today: sorted.filter((m) => isSameDay(m.startsAt)),
      upcoming: sorted.filter((m) => new Date(m.startsAt).getTime() >= now),
      past: sorted.filter((m) => new Date(m.startsAt).getTime() < now).reverse(),
    };
  }, [meetings, now]);
  const needsOutcome = groups.past.filter((m) => m.outcome === "Pending").length;
  const list = groups[tab];

  return (
    <div>
      <PageHeader
        title="Meetings"
        description="Schedule calls, capture notes and outcomes — outcomes update the pipeline automatically."
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "agenda", label: "Agenda" },
                { value: "week", label: "Week" },
              ]}
            />
            {canWrite && (
              <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setScheduling(true)}>
                Schedule
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-xs text-fg-3">Today</p>
          <p className="text-xl font-semibold tabular-nums">{groups.today.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-fg-3">Upcoming</p>
          <p className="text-xl font-semibold tabular-nums">{groups.upcoming.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-fg-3">Needs outcome</p>
          <p className={cn("text-xl font-semibold tabular-nums", needsOutcome > 0 && "text-warning")}>{needsOutcome}</p>
        </Card>
      </div>
      {view === "week" ? (
        <WeekGrid meetings={meetings} onOpen={setOpen} />
      ) : (
        <Card>
          <div className="flex gap-1 border-b border-border p-2">
            {(["today", "upcoming", "past"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn("h-7 rounded-md px-2.5 text-xs font-medium capitalize", tab === t ? "bg-fg text-bg" : "text-fg-2 hover:bg-surface-2")}>
                {t} <span className="opacity-60 tabular-nums">{groups[t].length}</span>
              </button>
            ))}
          </div>
          {list.length === 0 ? (
            <EmptyState icon={tab === "today" ? <Clock className="size-5" /> : <CalendarDays className="size-5" />} title={`No ${tab} meetings`} />
          ) : (
            <div className="divide-y divide-border">
              {list.map((m) => (
                <MeetingRow key={m.id} m={m} onOpen={() => setOpen(m.id)} isClient={me.role === "client"} />
              ))}
            </div>
          )}
        </Card>
      )}
      <MeetingDrawer id={open} onClose={() => setOpen(null)} />
      <ScheduleModal key={scheduling ? "open" : "closed"} open={scheduling} onClose={() => setScheduling(false)} />
    </div>
  );
}
