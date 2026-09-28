"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { useCRM } from "@/lib/store";
import { TASK_HOURS } from "@/lib/ai/finance";
import { ROLE_LABEL } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Avatar, Badge, Card, CardHeader, Progress, Segmented, Table, Td, Th } from "@/components/ui";

export function WorkloadTab() {
  const team = useCRM((s) => s.team);
  const tasks = useCRM((s) => s.tasks);
  const campaigns = useCRM((s) => s.campaigns);
  const clients = useCRM((s) => s.clients);
  const [sort, setSort] = useState<"load" | "overdue" | "name">("load");
  const [now] = useState(() => Date.now());

  const rows = useMemo(() => {
    return team
      .filter((m) => m.role !== "client" && m.status !== "disabled")
      .map((m) => {
        const open = tasks.filter((t) => t.assigneeId === m.id && t.status !== "Done");
        const hours = open.reduce((a, t) => a + TASK_HOURS[t.priority], 0);
        const overdue = open.filter((t) => new Date(t.dueDate).getTime() < now).length;
        const blocked = open.filter((t) => t.status === "Blocked").length;
        const cmps = campaigns.filter((c) => c.status !== "Completed" && (c.teamIds.includes(m.id) || c.ownerId === m.id));
        const clientIds = new Set([...clients.filter((c) => c.accountManagerId === m.id).map((c) => c.id), ...cmps.map((c) => c.clientId)]);
        const capacity = m.capacityHours ?? 40;
        const load = capacity ? (hours / capacity) * 100 : 0;
        return { m, open: open.length, hours, overdue, blocked, campaigns: cmps.length, clients: clientIds.size, capacity, load, urgent: open.filter((t) => t.priority === "Urgent").length };
      })
      .sort((a, b) => (sort === "load" ? b.load - a.load : sort === "overdue" ? b.overdue - a.overdue : a.m.name.localeCompare(b.m.name)));
  }, [team, tasks, campaigns, clients, sort, now]);

  const over = rows.filter((r) => r.load > 100);

  return (
    <div className="space-y-4">
      {over.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[13px] text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Over capacity: <b>{over.map((r) => r.m.name).join(", ")}</b>. Reassign or re-prioritise open tasks.
          </span>
        </div>
      )}
      <Card>
        <CardHeader
          title="Workload"
          subtitle="Open tasks converted to estimated hours vs weekly capacity"
          action={<Segmented value={sort} onChange={setSort} options={[{ value: "load", label: "Load" }, { value: "overdue", label: "Overdue" }, { value: "name", label: "Name" }]} />}
        />
        <Table>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th className="text-right">Open tasks</Th>
              <Th className="text-right">Est. hours</Th>
              <Th className="w-48">Capacity</Th>
              <Th className="text-right">Overdue</Th>
              <Th className="text-right">Campaigns</Th>
              <Th className="text-right">Clients</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.m.id} className={cn("hover:bg-surface-2", r.load > 100 && "bg-danger-soft/40")}>
                <Td>
                  <span className="flex items-center gap-2">
                    <Avatar name={r.m.name} color={r.m.avatarColor} size={24} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-medium">
                        {r.m.name}
                        {r.m.freelancer && <Badge tone="warning">Freelancer</Badge>}
                      </span>
                      <span className="block text-[11px] text-fg-3">{r.m.title ?? ROLE_LABEL[r.m.role]}</span>
                    </span>
                  </span>
                </Td>
                <Td className="text-right tabular-nums">
                  <Link href="/tasks" className="hover:underline">
                    {r.open}
                  </Link>
                  {r.urgent > 0 && <span className="block text-[11px] text-danger">{r.urgent} urgent</span>}
                </Td>
                <Td className="text-right tabular-nums">{r.hours} h</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Progress value={r.load} tone={r.load > 100 ? "danger" : r.load > 80 ? "warning" : "success"} className="flex-1" />
                    <span className={cn("w-16 text-right text-xs tabular-nums", r.load > 100 ? "font-semibold text-danger" : "text-fg-2")}>
                      {r.hours}/{r.capacity}h
                    </span>
                  </div>
                </Td>
                <Td className={cn("text-right tabular-nums", r.overdue ? "font-medium text-danger" : "text-fg-3")}>
                  {r.overdue}
                  {r.blocked > 0 && <span className="block text-[11px] text-warning">{r.blocked} blocked</span>}
                </Td>
                <Td className="text-right tabular-nums text-fg-2">{r.campaigns}</Td>
                <Td className="text-right tabular-nums text-fg-2">{r.clients}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="flex items-start gap-1.5 px-4 py-3 text-xs text-fg-3">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Assumption: each open task takes Urgent {TASK_HOURS.Urgent} h · High {TASK_HOURS.High} h · Medium {TASK_HOURS.Medium} h · Low {TASK_HOURS.Low} h, and the open backlog is compared against one week of capacity. Connect time tracking for actual hours.
        </p>
      </Card>
    </div>
  );
}
