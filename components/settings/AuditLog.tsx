"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Bot, Cog, Download, History, Plug } from "lucide-react";
import { useCRM } from "@/lib/store";
import { AGENTS } from "@/lib/ai/agents";
import type { Activity } from "@/lib/types";
import { downloadFile, fmtDateTime, relTime, toCSV } from "@/lib/utils";
import { AgentChip, Avatar, Badge, Button, Card, EmptyState, Input, SearchInput, Select, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";

const PAGE = 100;

const hrefFor = (a: Activity): string | undefined => {
  const id = a.entityId;
  switch (a.entity) {
    case "lead":
      return id?.startsWith("l_") ? `/leads/${id}` : "/leads";
    case "client":
      return id?.startsWith("c_") ? `/clients/${id}` : "/clients";
    case "campaign":
      return id?.startsWith("cmp_") ? `/campaigns?c=${id}` : "/campaigns";
    case "invoice":
      return "/payments?tab=invoices";
    case "expense":
      return "/payments?tab=expenses";
    case "deal":
      return "/pipeline";
    case "task":
      return "/tasks";
    case "meeting":
      return "/meetings";
    case "outreach":
      return "/outreach";
    case "automation":
      return "/automations";
    case "influencer":
      return "/influencers";
    case "integration":
      return "/integrations";
    case "organization":
      return "/settings?tab=plan";
    case "settings":
      return "/settings";
    default:
      return undefined;
  }
};

function Who({ a }: { a: Activity }) {
  const member = useCRM((s) => (a.actorId ? s.team.find((t) => t.id === a.actorId) : undefined));
  if (a.actor === "ai") {
    const def = a.agent ? AGENTS[a.agent] : undefined;
    return def ? <AgentChip name={def.name} color={def.color} /> : <Badge tone="accent"><Bot className="size-3" /> AI</Badge>;
  }
  if (a.actor === "api") return <Badge tone="info"><Plug className="size-3" /> API</Badge>;
  if (a.actor === "system") return <Badge><Cog className="size-3" /> System</Badge>;
  if (!member) return <span className="text-xs text-fg-3">Human</span>;
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <Avatar name={member.name} color={member.avatarColor} size={20} />
      <span className="text-[13px]">{member.name}</span>
    </span>
  );
}

export function AuditLog() {
  const activities = useCRM((s) => s.activities);
  const team = useCRM((s) => s.team);
  const [actor, setActor] = useState<Activity["actor"] | "all">("all");
  const [entity, setEntity] = useState<Activity["entity"] | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const entities = useMemo(() => [...new Set(activities.map((a) => a.entity))].sort(), [activities]);
  const nameOf = useMemo(() => new Map(team.map((t) => [t.id, t.name])), [team]);
  const who = (a: Activity) => (a.actor === "ai" ? (a.agent ? AGENTS[a.agent]?.name : "AI") ?? "AI" : a.actor === "human" ? (nameOf.get(a.actorId ?? "") ?? "Human") : a.actor === "api" ? "API" : "System");

  const rows = useMemo(() => {
    const f = from ? new Date(`${from}T00:00:00`).getTime() : 0;
    const t = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;
    const needle = q.toLowerCase();
    return activities
      .filter((a) => {
        const at = new Date(a.at).getTime();
        if (at < f || at > t) return false;
        if (actor !== "all" && a.actor !== actor) return false;
        if (entity !== "all" && a.entity !== entity) return false;
        if (onlyChanges && a.before === undefined && a.after === undefined) return false;
        if (needle && !`${a.action} ${a.detail ?? ""} ${a.before ?? ""} ${a.after ?? ""} ${a.entity} ${nameOf.get(a.actorId ?? "") ?? ""} ${a.agent ?? ""}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [activities, from, to, actor, entity, q, onlyChanges, nameOf]);

  const exportCSV = () => {
    downloadFile(
      `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
      toCSV(rows.map((a) => ({ when: a.at, who: who(a), actor_type: a.actor, agent: a.agent ?? "", action: a.action, entity: a.entity, entity_id: a.entityId ?? "", detail: a.detail ?? "", before: a.before ?? "", after: a.after ?? "" }))),
      "text/csv",
    );
    toast("Audit log exported", `${rows.length} entries`);
  };

  return (
    <Card>
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="Search action, detail, values…" className="lg:w-64" />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Select value={actor} onChange={(e) => setActor(e.target.value as typeof actor)} className="sm:w-32">
              <option value="all">All actors</option>
              <option value="human">Human</option>
              <option value="ai">AI agent</option>
              <option value="api">API</option>
              <option value="system">System</option>
            </Select>
            <Select value={entity} onChange={(e) => setEntity(e.target.value as typeof entity)} className="sm:w-36">
              <option value="all">All entities</option>
              {entities.map((x) => (
                <option key={x} value={x}>
                  {x.charAt(0).toUpperCase() + x.slice(1)}
                </option>
              ))}
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="sm:w-36" aria-label="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="sm:w-36" aria-label="To date" />
          </div>
          <Button size="sm" className="lg:ml-auto" icon={<Download className="size-3.5" />} disabled={!rows.length} onClick={exportCSV}>
            Export CSV
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-fg-2">
          <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} className="size-3.5 accent-[var(--accent)]" />
          Only entries with before/after values
          <span className="ml-auto text-fg-3">{rows.length} entries · last {activities.length} kept locally</span>
        </label>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<History className="size-5" />} title="No activity matches" description="Widen the date range or clear filters." />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Who</Th>
                <Th>What</Th>
                <Th>Entity</Th>
                <Th>When</Th>
                <Th>Before → After</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((a) => {
                const href = hrefFor(a);
                return (
                  <tr key={a.id} className="hover:bg-surface-2">
                    <Td>
                      <Who a={a} />
                    </Td>
                    <Td className="min-w-52">
                      <p className="font-medium">{a.action}</p>
                      {a.detail && <p className="max-w-80 truncate text-xs text-fg-3" title={a.detail}>{a.detail}</p>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {href ? (
                        <Link href={href} className="text-[13px] capitalize text-accent-text hover:underline">
                          {a.entity}
                        </Link>
                      ) : (
                        <span className="capitalize text-fg-2">{a.entity}</span>
                      )}
                      {a.entityId && <span className="block max-w-32 truncate font-mono text-[10px] text-fg-3">{a.entityId}</span>}
                    </Td>
                    <Td className="whitespace-nowrap" >
                      <span className="text-[13px]">{relTime(a.at)}</span>
                      <span className="block text-[11px] text-fg-3">{fmtDateTime(a.at)}</span>
                    </Td>
                    <Td className="min-w-48">
                      {a.before !== undefined || a.after !== undefined ? (
                        <span className="flex flex-wrap items-center gap-1 text-xs">
                          <span className="max-w-40 truncate rounded bg-danger-soft px-1.5 py-0.5 text-danger line-through decoration-danger/40" title={a.before}>
                            {a.before ?? "—"}
                          </span>
                          <ArrowRight className="size-3 text-fg-3" />
                          <span className="max-w-40 truncate rounded bg-success-soft px-1.5 py-0.5 text-success" title={a.after}>
                            {a.after ?? "—"}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-fg-3">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {rows.length > limit && (
            <div className="flex justify-center border-t border-border p-3">
              <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
                Show {Math.min(PAGE, rows.length - limit)} more
              </Button>
            </div>
          )}
        </>
      )}
      <p className="border-t border-border px-4 py-3 text-[11px] text-fg-3">Every human, AI-agent, API and system action is recorded. In production the audit log is append-only and stored server-side for the retention period set in Security.</p>
    </Card>
  );
}
