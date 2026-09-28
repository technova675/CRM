"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowRight, Bot, BrainCircuit, Check, CircleDashed, Clock, GitBranch, Loader2, Pencil, Play, Plus, ShieldCheck, Sparkles, Trash2, UserCheck, Wand2, X, Zap } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import type { Automation, AutomationNode, AutomationNodeType } from "@/lib/types";
import { AGENTS } from "@/lib/ai/agents";
import { cn, fmtDateTime, relTime, uid } from "@/lib/utils";
import { AgentChip, Badge, Button, Card, CardHeader, EmptyState, Field, Input, MemberAvatar, Modal, PageHeader, Readonly, SearchInput, Select, Tabs, Textarea, Toggle } from "@/components/ui";
import { toast } from "@/components/shell/toast";

const NODE_META: Record<AutomationNodeType, { label: string; icon: typeof Zap; cls: string }> = {
  trigger: { label: "Trigger", icon: Zap, cls: "text-info bg-info-soft" },
  condition: { label: "Condition", icon: GitBranch, cls: "text-warning bg-warning-soft" },
  ai_decision: { label: "AI decision", icon: BrainCircuit, cls: "text-accent-text bg-accent-soft" },
  ai_action: { label: "AI action", icon: Sparkles, cls: "text-accent-text bg-accent-soft" },
  approval: { label: "Human approval", icon: UserCheck, cls: "text-danger bg-danger-soft" },
  action: { label: "Action", icon: Play, cls: "text-success bg-success-soft" },
  wait: { label: "Wait", icon: Clock, cls: "text-fg-2 bg-surface-3" },
};

const n = (type: AutomationNodeType, label: string, config: AutomationNode["config"] = {}): AutomationNode => ({ id: uid("n"), type, label, config });
const TEMPLATES: { name: string; description: string; nodes: () => AutomationNode[] }[] = [
  {
    name: "New lead → research → score → qualified outreach",
    description: "Research and score new leads; if qualified, generate personalised outreach, request approval, then send.",
    nodes: () => [n("trigger", "New lead added", { event: "lead.created" }), n("ai_action", "Sales agent researches lead", { agent: "sales" }), n("ai_action", "Score lead", { agent: "sales" }), n("ai_decision", "If qualified (score ≥ 60)", { agent: "sales", threshold: 60 }), n("ai_action", "Generate personalised outreach", { agent: "sales" }), n("approval", "Request approval", { approver: "Assigned salesperson" }), n("action", "Send message", { channel: "Email" })],
  },
  {
    name: "Campaign performance drops → AI analysis → notify media buyer",
    description: "The Media agent investigates a performance drop and sends a recommendation to the media buyer.",
    nodes: () => [n("trigger", "Campaign metric changes", { event: "campaign.metric_changed", metric: "CPA" }), n("condition", "If CPA up ≥ 20% vs last week", { field: "cpa_change", op: ">=", value: 20 }), n("ai_action", "Media agent analyses the drop", { agent: "media" }), n("ai_decision", "Generate recommendation", { agent: "media" }), n("action", "Notify media buyer", { channel: "Slack" })],
  },
  {
    name: "Client report due → generate → approve → send",
    description: "Collect data, generate the report, request approval, send to the client.",
    nodes: () => [n("trigger", "Report schedule is due", { event: "report.due" }), n("action", "Collect data", { sources: "Connected platforms" }), n("ai_action", "Generate report", { agent: "reporting" }), n("approval", "Request approval", { approver: "Account Manager" }), n("action", "Send to client", { channel: "Email" })],
  },
  {
    name: "Invoice overdue → notify finance → reminder",
    description: "Notify finance, generate a friendly reminder, request approval, send.",
    nodes: () => [n("trigger", "Invoice becomes overdue", { event: "invoice.overdue" }), n("action", "Notify finance", { channel: "In-app" }), n("ai_action", "Generate reminder", { agent: "finance", tone: "Friendly" }), n("approval", "Request approval", { approver: "Finance" }), n("action", "Send reminder", { channel: "Email" })],
  },
  {
    name: "Deal won → onboarding",
    description: "Create the client workspace, send the welcome email + onboarding form and create setup tasks.",
    nodes: () => [n("trigger", "Deal moved to Won", { event: "deal.won" }), n("action", "Create client profile & knowledge base"), n("action", "Send welcome email + onboarding form", { channel: "Email" }), n("action", "Create project & internal tasks", { template: "By service" }), n("action", "Assign account manager", { rule: "Round robin" })],
  },
  {
    name: "No reply in 3 days → follow-up",
    description: "Send a follow-up if the lead hasn't replied within 3 days; stop on reply.",
    nodes: () => [n("trigger", "Outreach message sent", { event: "message.sent" }), n("wait", "Wait 3 days", { days: 3 }), n("condition", "If no reply", { field: "replied", op: "==", value: false }), n("ai_action", "Draft follow-up", { agent: "sales" }), n("action", "Send follow-up", { channel: "Email" })],
  },
  {
    name: "Creative approved → schedule social post",
    description: "When a client approves a creative, the Social agent drafts the caption and schedules it after approval.",
    nodes: () => [n("trigger", "Creative approved by client", { event: "creative.approved" }), n("ai_action", "Social agent writes caption + hashtags", { agent: "social" }), n("approval", "Social manager approval", { approver: "Social Media Manager" }), n("action", "Schedule post", { channel: "Instagram" })],
  },
];

// Automation agent: turns a plain-English description into Trigger → Condition → AI decision → Approval → Action steps.
function buildFromDescription(text: string): { name: string; nodes: AutomationNode[] } {
  const t = text.toLowerCase();
  const nodes: AutomationNode[] = [];
  const triggers: [RegExp, string, string][] = [
    [/new lead|lead (is )?added|lead comes in/, "New lead added", "lead.created"],
    [/deal (is )?won|won deal/, "Deal moved to Won", "deal.won"],
    [/invoice|payment/, "Invoice becomes overdue", "invoice.overdue"],
    [/report/, "Report schedule is due", "report.due"],
    [/cpa|roas|ctr|performance|campaign/, "Campaign metric changes", "campaign.metric_changed"],
    [/reply|replies|responds/, "Reply received", "message.replied"],
    [/creative|approv/, "Creative status changes", "creative.status_changed"],
    [/seo|ranking|keyword/, "Keyword ranking changes", "seo.ranking_changed"],
  ];
  const tr = triggers.find(([re]) => re.test(t));
  nodes.push(n("trigger", tr?.[1] ?? "Manual trigger", { event: tr?.[2] ?? "manual" }));
  const pctM = t.match(/(\d+)\s*%/);
  const days = t.match(/(\d+)\s*days?/);
  if (days) nodes.push(n("wait", `Wait ${days[1]} days`, { days: Number(days[1]) }));
  if (pctM) nodes.push(n("condition", `If change ≥ ${pctM[1]}%`, { op: ">=", value: Number(pctM[1]) }));
  else if (/\bif\b|qualif|score/.test(t)) nodes.push(n("condition", "If condition is met", { field: "score", op: ">=", value: 60 }));
  const agent = /cpa|roas|campaign|budget/.test(t) ? "media" : /report/.test(t) ? "reporting" : /invoice|payment/.test(t) ? "finance" : /social|post|caption/.test(t) ? "social" : /seo|keyword/.test(t) ? "seo" : /creative/.test(t) ? "creative" : "sales";
  if (/analy|investigat|research|draft|write|generate|summar/.test(t) || agent !== "sales") nodes.push(n("ai_action", `${AGENTS[agent].name} analyses & drafts`, { agent }));
  if (/decide|recommend|qualif|choose/.test(t)) nodes.push(n("ai_decision", "AI decision", { agent }));
  if (/approv|review|check/.test(t)) nodes.push(n("approval", "Request approval", { approver: /finance/.test(t) ? "Finance" : "Owner" }));
  if (/notify|alert|slack|tell/.test(t)) nodes.push(n("action", /slack/.test(t) ? "Notify on Slack" : "Send notification", { channel: /slack/.test(t) ? "Slack" : "In-app" }));
  if (/send|email|whatsapp|message/.test(t)) nodes.push(n("action", "Send message", { channel: /whatsapp/.test(t) ? "WhatsApp" : "Email" }));
  if (/task/.test(t)) nodes.push(n("action", "Create task", { assignee: "Owner" }));
  if (/pause/.test(t)) nodes.push(n("action", "Pause ad (after approval)", { platform: "Ads" }));
  if (nodes.length === 1) nodes.push(n("action", "Create task", { assignee: "Owner" }));
  return { name: text.length > 60 ? `${text.slice(0, 57)}…` : text, nodes };
}

function AutomationsInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") ?? "workflows") as "workflows" | "approvals" | "log";
  const setTab = (t: string) => router.replace(`/automations?tab=${t}`, { scroll: false });
  const automations = useCRM((s) => s.automations);
  const approvals = useCRM((s) => s.approvals);
  const activities = useCRM((s) => s.activities);
  const writable = can(me.role, "automations", "write");
  const pending = approvals.filter((a) => a.status === "pending").length;

  return (
    <div>
      <PageHeader title="Automation Builder" description="Trigger → Condition → AI Decision → Approval → Action. Every AI, human and API action is logged." />
      {!writable && <Readonly>Read-only access. Admins can build workflows and resolve approvals.</Readonly>}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "workflows", label: "Workflows", count: automations.length },
          { value: "approvals", label: "Approvals", count: pending },
          { value: "log", label: "Activity log", count: activities.length },
        ]}
      />
      <div className="mt-4">
        {tab === "workflows" && <Workflows writable={writable} />}
        {tab === "approvals" && <Approvals writable={writable} />}
        {tab === "log" && <ActivityLog />}
      </div>
    </div>
  );
}

function Workflows({ writable }: { writable: boolean }) {
  const automations = useCRM((s) => s.automations);
  const update = useCRM((s) => s.updateAutomation);
  const add = useCRM((s) => s.addAutomation);
  const remove = useCRM((s) => s.deleteAutomation);
  const [selectedId, setSelectedId] = useState<string | undefined>(automations[0]?.id);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editNode, setEditNode] = useState<{ index: number; node: AutomationNode; isNew: boolean } | null>(null);
  const [testing, setTesting] = useState<Automation | null>(null);
  const sel = automations.find((a) => a.id === selectedId) ?? automations[0];

  const setNodes = (nodes: AutomationNode[]) => sel && update(sel.id, { nodes });
  const move = (i: number, d: -1 | 1) => {
    if (!sel) return;
    const nodes = [...sel.nodes];
    const j = i + d;
    if (j < 0 || j >= nodes.length) return;
    [nodes[i], nodes[j]] = [nodes[j]!, nodes[i]!];
    setNodes(nodes);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-2">
        {writable && <Button variant="primary" className="w-full" icon={<Plus className="size-3.5" />} onClick={() => setShowTemplates(true)}>New automation</Button>}
        {automations.map((a) => (
          // A div (not <button>) because the card contains the enable Toggle, which is itself a button.
          <div
            key={a.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedId(a.id)}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                setSelectedId(a.id);
              }
            }}
            className={cn("w-full text-left rounded-xl border p-3 transition cursor-pointer", sel?.id === a.id ? "border-accent bg-accent-soft/40" : "border-border bg-surface hover:border-border-strong")}>
            <div className="flex items-start gap-2">
              <p className="flex-1 text-[13px] font-medium leading-snug">{a.name}</p>
              <span onClick={(e) => e.stopPropagation()}>
                <Toggle checked={a.enabled} onChange={(v) => { if (!writable) return; update(a.id, { enabled: v }); toast(v ? "Automation enabled" : "Automation paused"); }} label="Enabled" />
              </span>
            </div>
            <p className="text-xs text-fg-3 mt-1 line-clamp-2">{a.description}</p>
            <div className="mt-2 flex gap-3 text-[11px] text-fg-3">
              <span>{a.runs.toLocaleString()} runs</span>
              <span>Last run {a.lastRunAt ? relTime(a.lastRunAt) : "never"}</span>
              <span>{a.nodes.length} steps</span>
            </div>
          </div>
        ))}
      </div>

      {sel ? (
        <Card className="p-4 sm:p-6">
          <div className="flex flex-wrap items-start gap-3 mb-6">
            <div className="flex-1 min-w-0">
              <Input disabled={!writable} value={sel.name} onChange={(e) => update(sel.id, { name: e.target.value })} className="text-[15px] font-semibold h-9 border-transparent bg-transparent px-1 hover:border-border" />
              <Input disabled={!writable} value={sel.description} onChange={(e) => update(sel.id, { description: e.target.value })} className="text-xs text-fg-3 border-transparent bg-transparent px-1 hover:border-border mt-1" />
            </div>
            <Badge tone={sel.enabled ? "success" : "neutral"} dot>{sel.enabled ? "Live" : "Paused"}</Badge>
            {writable && <Button size="sm" icon={<Play className="size-3.5" />} onClick={() => setTesting(sel)}>Test run</Button>}
            {writable && <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-3.5" />} onClick={() => { remove(sel.id); setSelectedId(undefined); toast("Automation deleted"); }}>Delete</Button>}
          </div>

          <div className="mx-auto max-w-xl">
            {sel.nodes.map((node, i) => {
              const meta = NODE_META[node.type];
              return (
                <div key={node.id}>
                  <div className="group relative flex items-start gap-3 rounded-xl border border-border bg-surface p-3 shadow-card hover:border-border-strong">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", meta.cls)}><meta.icon className="size-4" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-fg-3">{meta.label}</p>
                      <p className="text-[13px] font-medium">{node.label}</p>
                      {Object.keys(node.config).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(node.config).map(([k, v]) => <span key={k} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-2">{k}: {String(v)}</span>)}
                        </div>
                      )}
                    </div>
                    {writable && (
                      <div className="flex gap-0.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => move(i, -1)} className="rounded p-1 text-fg-3 hover:bg-surface-2" aria-label="Move up"><ArrowUp className="size-3.5" /></button>
                        <button onClick={() => move(i, 1)} className="rounded p-1 text-fg-3 hover:bg-surface-2" aria-label="Move down"><ArrowDown className="size-3.5" /></button>
                        <button onClick={() => setEditNode({ index: i, node, isNew: false })} className="rounded p-1 text-fg-3 hover:bg-surface-2" aria-label="Edit"><Pencil className="size-3.5" /></button>
                        <button onClick={() => setNodes(sel.nodes.filter((x) => x.id !== node.id))} className="rounded p-1 text-fg-3 hover:bg-danger-soft hover:text-danger" aria-label="Delete"><Trash2 className="size-3.5" /></button>
                      </div>
                    )}
                  </div>
                  <div className="relative flex h-8 justify-center">
                    <span className="absolute inset-y-0 w-px bg-border-strong" />
                    {writable && (
                      <button onClick={() => setEditNode({ index: i + 1, node: n("action", ""), isNew: true })} className="relative z-[1] my-auto grid size-5 place-items-center rounded-full border border-border bg-surface text-fg-3 hover:border-accent hover:text-accent" aria-label="Add step">
                        <Plus className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {sel.nodes.length === 0 && writable && <Button className="w-full" icon={<Plus className="size-3.5" />} onClick={() => setEditNode({ index: 0, node: n("trigger", ""), isNew: true })}>Add trigger</Button>}
            <div className="flex justify-center"><Badge>End</Badge></div>
          </div>
        </Card>
      ) : (
        <Card><EmptyState icon={<Bot className="size-5" />} title="No automation selected" /></Card>
      )}

      {showTemplates && (
        <Modal open onClose={() => setShowTemplates(false)} title="New automation" subtitle="Describe it, start from a template, or use a blank canvas">
          <DescribeAutomation
            onCreate={(name, nodes) => {
              add({ name, description: "Built by the Automation agent from a description — review each step before enabling.", enabled: false, nodes });
              setSelectedId(useCRM.getState().automations[0]?.id);
              setShowTemplates(false);
              toast("Automation drafted by AI", "Review the steps, then enable it.");
            }}
          />
          <p className="mt-4 mb-2 text-xs font-medium text-fg-2">Templates</p>
          <div className="space-y-2">
            {[...TEMPLATES, { name: "Blank automation", description: "Start with just a trigger.", nodes: () => [n("trigger", "Choose a trigger", { event: "" })] }].map((t) => (
              <button
                key={t.name}
                onClick={() => {
                  add({ name: t.name, description: t.description, enabled: false, nodes: t.nodes() });
                  const latest = useCRM.getState().automations[0];
                  setSelectedId(latest?.id);
                  setShowTemplates(false);
                  toast("Automation created", "It's paused until you enable it.");
                }}
                className="w-full text-left rounded-xl border border-border p-3 hover:border-accent hover:bg-accent-soft/30"
              >
                <p className="text-[13px] font-medium">{t.name}</p>
                <p className="text-xs text-fg-3 mt-0.5">{t.description}</p>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {testing && <TestRunModal automation={testing} onClose={() => setTesting(null)} />}

      {editNode && sel && (
        <NodeModal
          initial={editNode.node}
          isNew={editNode.isNew}
          onClose={() => setEditNode(null)}
          onSave={(node) => {
            const nodes = [...sel.nodes];
            if (editNode.isNew) nodes.splice(editNode.index, 0, node);
            else nodes[editNode.index] = node;
            setNodes(nodes);
            setEditNode(null);
          }}
        />
      )}
    </div>
  );
}

function NodeModal({ initial, isNew, onSave, onClose }: { initial: AutomationNode; isNew: boolean; onSave: (n: AutomationNode) => void; onClose: () => void }) {
  const [type, setType] = useState(initial.type);
  const [label, setLabel] = useState(initial.label);
  const [config, setConfig] = useState(Object.entries(initial.config).map(([k, v]) => `${k}=${v}`).join("\n"));
  const parse = () => {
    const out: AutomationNode["config"] = {};
    config.split("\n").forEach((line) => {
      const [k, ...rest] = line.split("=");
      if (!k?.trim()) return;
      const raw = rest.join("=").trim();
      out[k.trim()] = raw === "true" ? true : raw === "false" ? false : raw !== "" && !isNaN(Number(raw)) ? Number(raw) : raw;
    });
    return out;
  };
  return (
    <Modal open onClose={onClose} title={isNew ? "Add step" : "Edit step"} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!label.trim()} onClick={() => onSave({ ...initial, type, label, config: parse() })}>Save step</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(Object.keys(NODE_META) as AutomationNodeType[]).map((t) => {
            const m = NODE_META[t];
            return (
              <button key={t} onClick={() => setType(t)} className={cn("flex items-center gap-2 rounded-lg border p-2 text-left text-xs font-medium", type === t ? "border-accent bg-accent-soft/40" : "border-border hover:bg-surface-2")}>
                <span className={cn("grid size-6 place-items-center rounded-md", m.cls)}><m.icon className="size-3.5" /></span>
                {m.label}
              </button>
            );
          })}
        </div>
        <Field label="Label"><Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder={type === "wait" ? "Wait 3 days" : type === "condition" ? "If score ≥ 60" : "Describe this step"} /></Field>
        <Field label="Configuration" hint="One key=value per line, e.g. channel=Email or days=3"><Textarea value={config} onChange={(e) => setConfig(e.target.value)} className="font-mono text-xs" /></Field>
        {type === "approval" && <p className="text-xs text-fg-3 flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> The run pauses here until an approver acts in the Approvals tab.</p>}
      </div>
    </Modal>
  );
}

function Approvals({ writable }: { writable: boolean }) {
  const approvals = useCRM((s) => s.approvals);
  const team = useCRM((s) => s.team);
  const resolve = useCRM((s) => s.resolveApproval);
  const pending = approvals.filter((a) => a.status === "pending");
  const history = approvals.filter((a) => a.status !== "pending");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Pending approval" subtitle="AI actions waiting for a human decision" />
        {pending.length === 0 ? (
          <EmptyState icon={<Check className="size-5" />} title="Nothing waiting" description="All AI actions have been reviewed." />
        ) : (
          <div className="divide-y divide-border">
            {pending.map((a) => (
              <div key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent-text"><Sparkles className="size-4" /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone="accent">{a.kind}</Badge>{a.agent && <AgentChip name={AGENTS[a.agent].name} color={AGENTS[a.agent].color} />}<span className="text-[11px] text-fg-3">{relTime(a.createdAt)}</span></div>
                  <p className="text-[13px] font-medium mt-1">{a.title}</p>
                  <p className="text-xs text-fg-3">{a.detail}</p>
                  {a.apply && (
                    <p className="mt-1.5 inline-flex flex-wrap items-center gap-1 rounded-md bg-surface-2 px-2 py-1 font-mono text-[10px] text-fg-2">
                      On approval: {a.apply.collection} · {Object.entries(a.apply.patch).map(([k, v]) => `${k} → ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(", ")}
                    </p>
                  )}
                  {a.requestedBy && <p className="mt-1 flex items-center gap-1 text-[11px] text-fg-3">Requested by <MemberAvatar id={a.requestedBy} size={14} showName /></p>}
                </div>
                {writable && (
                  <div className="flex gap-1.5">
                    <Button size="xs" icon={<X className="size-3" />} onClick={() => { resolve(a.id, false); toast("Rejected", a.title, "info"); }}>Reject</Button>
                    <Button size="xs" variant="primary" icon={<Check className="size-3" />} onClick={() => { resolve(a.id, true); toast("Approved", a.title); }}>Approve</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="History" />
        {history.length === 0 ? (
          <EmptyState title="No decisions yet" />
        ) : (
          <div className="divide-y divide-border">
            {history.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <Badge tone={a.status === "approved" ? "success" : "danger"} dot>{a.status}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] truncate">{a.title}</p>
                  <p className="text-[11px] text-fg-3">{a.kind} · {relTime(a.resolvedAt ?? a.createdAt)}{a.resolvedBy && <> · by {team.find((t) => t.id === a.resolvedBy)?.name.split(" ")[0]}</>}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ActivityLog() {
  const activities = useCRM((s) => s.activities);
  const [actor, setActor] = useState("All");
  const [entity, setEntity] = useState("All");
  const [q, setQ] = useState("");
  const entities = useMemo(() => [...new Set(activities.map((a) => a.entity))].sort(), [activities]);
  const list = useMemo(
    () => activities.filter((a) => (actor === "All" || a.actor === actor) && (entity === "All" || a.entity === entity) && (!q || `${a.action} ${a.detail ?? ""}`.toLowerCase().includes(q.toLowerCase()))),
    [activities, actor, entity, q],
  );
  return (
    <Card>
      <div className="flex flex-wrap gap-2 p-3 border-b border-border">
        <SearchInput value={q} onChange={setQ} placeholder="Search activity…" className="w-full sm:w-64" />
        <Select value={actor} onChange={(e) => setActor(e.target.value)} className="w-32"><option value="All">All actors</option><option value="ai">AI</option><option value="human">Human</option><option value="api">API</option><option value="system">System</option></Select>
        <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="w-36"><option value="All">All entities</option>{entities.map((e) => <option key={e}>{e}</option>)}</Select>
        <span className="ml-auto self-center text-xs text-fg-3">{list.length} events</span>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No activity" />
      ) : (
        <ol className="divide-y divide-border">
          {list.slice(0, 300).map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
              {a.actor === "human" ? (
                <MemberAvatar id={a.actorId} size={24} />
              ) : (
                <span className={cn("grid size-6 place-items-center rounded-full", a.actor === "ai" ? "ai-gradient text-white" : "bg-surface-3 text-fg-2")}>{a.actor === "ai" ? <Sparkles className="size-3" /> : <Bot className="size-3" />}</span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[13px]"><span className="font-medium">{a.action}</span>{a.detail && <span className="text-fg-2"> — {a.detail}</span>}</p>
                {(a.before !== undefined || a.after !== undefined) && (
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
                    <span className="rounded bg-danger-soft px-1 text-danger">{a.before ?? "—"}</span>
                    <ArrowRight className="size-3 text-fg-3" />
                    <span className="rounded bg-success-soft px-1 text-success">{a.after ?? "—"}</span>
                  </p>
                )}
                <p className="text-[11px] text-fg-3">
                  <span className="uppercase tracking-wide">{a.actor === "ai" && a.agent ? AGENTS[a.agent].name : a.actor}</span> · {a.entity} · {fmtDateTime(a.at)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function DescribeAutomation({ onCreate }: { onCreate: (name: string, nodes: AutomationNode[]) => void }) {
  const [text, setText] = useState("");
  const draft = useMemo(() => (text.trim().length > 8 ? buildFromDescription(text.trim()) : null), [text]);
  return (
    <div className="rounded-xl border border-accent/30 bg-accent-soft/30 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-accent-text"><Wand2 className="size-3.5" /> Describe the automation — the Automation agent drafts the steps</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. When a campaign's CPA rises 20%, analyse it, recommend a fix, ask for approval and notify the media buyer on Slack" className="mt-2 min-h-16 bg-surface" />
      {draft && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {draft.nodes.map((x, i) => {
            const m = NODE_META[x.type];
            return (
              <span key={x.id} className="inline-flex items-center gap-1 text-[11px]">
                {i > 0 && <ArrowRight className="size-3 text-fg-3" />}
                <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5", m.cls)}><m.icon className="size-3" />{x.label}</span>
              </span>
            );
          })}
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ai" disabled={!draft} icon={<Sparkles className="size-3.5" />} onClick={() => draft && onCreate(draft.name, draft.nodes)}>Create draft</Button>
      </div>
    </div>
  );
}

// Dry run: walks each step so builders can see what would happen before enabling.
function TestRunModal({ automation, onClose }: { automation: Automation; onClose: () => void }) {
  const update = useCRM((s) => s.updateAutomation);
  const log = useCRM((s) => s.log);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const stoppedAt = automation.nodes.findIndex((x) => x.type === "approval");
  const run = async () => {
    setDone(false);
    const last = stoppedAt >= 0 ? stoppedAt : automation.nodes.length - 1;
    for (let i = 0; i <= last; i++) {
      setStep(i);
      await new Promise((r) => setTimeout(r, 450));
    }
    setDone(true);
    update(automation.id, { runs: automation.runs + 1, lastRunAt: new Date().toISOString() });
    log({ actor: "system", entity: "automation", entityId: automation.id, action: "Test run", detail: automation.name });
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Test run — ${automation.name}`}
      subtitle="Dry run with sample data. No messages are sent and no spend changes are made."
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={<Play className="size-3.5" />} disabled={step >= 0 && !done} onClick={() => void run()}>{step < 0 ? "Start" : "Run again"}</Button>
        </>
      }
    >
      <ol className="space-y-2">
        {automation.nodes.map((x, i) => {
          const m = NODE_META[x.type];
          const state = step < 0 || i > step ? "idle" : i === step && !done ? "running" : i === stoppedAt ? "waiting" : "ok";
          return (
            <li key={x.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <span className={cn("grid size-7 place-items-center rounded-md", m.cls)}><m.icon className="size-3.5" /></span>
              <span className="flex-1 text-[13px]">{x.label}</span>
              {state === "idle" && <CircleDashed className="size-4 text-fg-3" />}
              {state === "running" && <Loader2 className="size-4 animate-spin text-accent" />}
              {state === "ok" && <Check className="size-4 text-success" />}
              {state === "waiting" && <Badge tone="warning">Waits for approval</Badge>}
            </li>
          );
        })}
      </ol>
      {done && stoppedAt >= 0 && <p className="mt-3 text-xs text-fg-3">In a live run, execution pauses at the approval step until someone approves it in the Approvals tab.</p>}
    </Modal>
  );
}

export default function AutomationsPage() {
  return (
    <Suspense>
      <AutomationsInner />
    </Suspense>
  );
}

