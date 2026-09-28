"use client";

import { useMemo, useState } from "react";
import { useCRM } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/permissions";
import type { Priority } from "@/lib/types";
import { cn, isPast, isSameDay } from "@/lib/utils";
import { Badge, Card, CardHeader, MemberAvatar, Progress, Table, Td, Th } from "@/components/ui";

// Estimated effort per open task by priority (hours). Used only for the capacity estimate.
const EFFORT: Record<Priority, number> = { Low: 1, Medium: 2, High: 4, Urgent: 6 };
const PRI: Priority[] = ["Urgent", "High", "Medium", "Low"];

export function WorkloadView({ onPickMember }: { onPickMember: (id: string) => void }) {
  const tasks = useCRM((s) => s.tasks);
  const team = useCRM((s) => s.team);
  const [now] = useState(() => Date.now());
  const rows = useMemo(() => {
    const weekEnd = now + 7 * 86_400_000;
    return team
      .filter((m) => m.role !== "client" && m.status !== "disabled")
      .map((m) => {
        const open = tasks.filter((t) => t.assigneeId === m.id && t.status !== "Done");
        const byPri = Object.fromEntries(PRI.map((p) => [p, open.filter((t) => t.priority === p).length])) as Record<Priority, number>;
        const overdue = open.filter((t) => isPast(t.dueDate) && !isSameDay(t.dueDate)).length;
        const dueWeek = open.filter((t) => new Date(t.dueDate).getTime() <= weekEnd);
        const hours = dueWeek.reduce((a, t) => a + EFFORT[t.priority], 0);
        const capacity = m.capacityHours ?? 40;
        return { m, open: open.length, byPri, overdue, hours, capacity, load: capacity ? (hours / capacity) * 100 : 0 };
      })
      .sort((a, b) => b.load - a.load || b.open - a.open);
  }, [tasks, team, now]);
  const over = rows.filter((r) => r.load > 100).length;

  return (
    <Card>
      <CardHeader title="Team workload" subtitle={`Open tasks by priority, overdue and estimated load vs weekly capacity${over ? ` · ${over} over capacity` : ""}`} />
      <Table>
        <thead>
          <tr>
            <Th>Member</Th>
            <Th className="text-right">Open</Th>
            {PRI.map((p) => <Th key={p} className="hidden sm:table-cell text-right">{p}</Th>)}
            <Th className="text-right">Overdue</Th>
            <Th className="w-56">Load this week</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.m.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => onPickMember(r.m.id)}>
              <Td>
                <div className="flex items-center gap-2">
                  <MemberAvatar id={r.m.id} size={24} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{r.m.name}{r.m.freelancer && <Badge className="ml-1.5">Freelancer</Badge>}</p>
                    <p className="truncate text-[11px] text-fg-3">{r.m.title ?? ROLE_LABEL[r.m.role]}</p>
                  </div>
                </div>
              </Td>
              <Td className="text-right tabular-nums font-medium">{r.open}</Td>
              {PRI.map((p) => <Td key={p} className={cn("hidden sm:table-cell text-right tabular-nums", r.byPri[p] ? (p === "Urgent" ? "text-danger" : p === "High" ? "text-warning" : "text-fg-2") : "text-fg-3")}>{r.byPri[p]}</Td>)}
              <Td className={cn("text-right tabular-nums", r.overdue ? "text-danger font-medium" : "text-fg-3")}>{r.overdue}</Td>
              <Td>
                <div className="flex items-center gap-2">
                  <Progress value={r.load} tone={r.load > 100 ? "danger" : r.load > 80 ? "warning" : "success"} className="flex-1" />
                  <span className="w-20 text-right text-[11px] tabular-nums text-fg-3">{r.hours}h / {r.capacity}h</span>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="px-4 py-2.5 text-[11px] text-fg-3">Load is an estimate: tasks due in the next 7 days × effort by priority (Low 1h · Medium 2h · High 4h · Urgent 6h) against each member&apos;s weekly capacity (Team settings, default 40h).</p>
    </Card>
  );
}
