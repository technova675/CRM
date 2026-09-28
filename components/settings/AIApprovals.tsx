"use client";

import { AlertTriangle, CheckCircle2, Hand, Lock, RotateCcw, ShieldCheck, Zap } from "lucide-react";
import { AI_ACTIONS, useCRM } from "@/lib/store";
import type { AIActionKind, ApprovalMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Toggle } from "@/components/ui";
import { toast } from "@/components/shell/toast";

// Recommended defaults (spec): content & client-facing output needs approval, budget changes need approval,
// routine internal task creation can run automatically.
export const RECOMMENDED_MODES: Record<AIActionKind, ApprovalMode> = {
  Outreach: "Approval Required",
  "Follow-ups": "Automatic",
  "Campaign changes": "Approval Required",
  "Campaign recommendations": "Approval Required",
  "Client communication": "Approval Required",
  Reports: "Approval Required",
  "Payment reminders": "Approval Required",
  "Creative generation": "Approval Required",
  "Social publishing": "Approval Required",
  "Video exports": "Approval Required",
  "Strategy documents": "Approval Required",
  Proposals: "Approval Required",
  "Task creation": "Automatic",
  "SEO changes": "Approval Required",
  "Influencer outreach": "Approval Required",
};

const INFO: Record<AIActionKind, string> = {
  Outreach: "First-touch messages drafted by the Sales Agent",
  "Follow-ups": "Scheduled sequence follow-ups to leads who haven't replied",
  "Campaign changes": "Budget, bid and status changes on ad platforms (spend-affecting)",
  "Campaign recommendations": "Non-spend optimisations from the Media & Analytics agents",
  "Client communication": "Emails and messages sent to clients",
  Reports: "Client performance reports",
  "Payment reminders": "Invoice reminders from the Finance Agent",
  "Creative generation": "Ad creatives, copy and concepts",
  "Social publishing": "Publishing posts to client social accounts",
  "Video exports": "Final video exports from the AI Video Editor",
  "Strategy documents": "Marketing strategies and plans",
  Proposals: "Sales proposals sent to prospects",
  "Task creation": "Routine internal tasks created for the team",
  "SEO changes": "On-site SEO fixes and content changes",
  "Influencer outreach": "Messages to creators",
};

const MODES: { value: ApprovalMode; label: string; help: string; icon: typeof Hand }[] = [
  { value: "Manual", label: "Manual", help: "AI recommends, a human executes", icon: Hand },
  { value: "Approval Required", label: "Approval", help: "AI prepares, a human approves", icon: ShieldCheck },
  { value: "Automatic", label: "Automatic", help: "AI executes and logs it", icon: Zap },
];

const SPEND_ACTIONS: AIActionKind[] = ["Campaign changes"];

export function AIApprovals({ admin }: { admin: boolean }) {
  const modes = useCRM((s) => s.settings.approvalModes);
  const allowSpend = useCRM((s) => s.settings.allowAutonomousSpendChanges);
  const setMode = useCRM((s) => s.setApprovalMode);
  const updateSettings = useCRM((s) => s.updateSettings);
  const log = useCRM((s) => s.log);
  const me = useCRM((s) => s.currentUserId);
  const diff = AI_ACTIONS.filter((k) => modes[k] !== RECOMMENDED_MODES[k]);

  const reset = () => {
    updateSettings({ approvalModes: { ...RECOMMENDED_MODES } });
    log({ actor: "human", actorId: me, entity: "settings", action: "Reset AI approval modes to recommended", before: `${diff.length} custom mode(s)`, after: "recommended" });
    toast("Approval modes reset to recommended");
  };
  const toggleSpend = (v: boolean) => {
    updateSettings({ allowAutonomousSpendChanges: v });
    log({ actor: "human", actorId: me, entity: "settings", action: "Autonomous spend changes", before: allowSpend ? "enabled" : "disabled", after: v ? "enabled" : "disabled" });
    toast(v ? "Autonomous spend changes enabled" : "Autonomous spend changes disabled", v ? "Campaign changes set to Automatic will now execute without approval." : undefined, v ? "warning" : "success");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {MODES.map((m) => (
            <div key={m.value} className="flex items-start gap-2.5">
              <span className="rounded-md bg-accent-soft p-1.5 text-accent-text">
                <m.icon className="size-3.5" />
              </span>
              <div>
                <p className="text-[13px] font-semibold">{m.label}</p>
                <p className="text-xs text-fg-3">{m.help}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-fg-3">
          Recommended: Creative generation → Approval · Client report → Approval · Campaign recommendation → Approval · Campaign budget change → Approval · Routine internal task creation → Automatic. Approvals appear in Automations → Approvals; every AI action is written to the audit log.
        </p>
      </Card>

      <Card className={cn("p-4", allowSpend ? "border-danger/40" : "")}>
        <div className="flex items-start gap-3">
          <span className={cn("rounded-md p-1.5", allowSpend ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
            <AlertTriangle className="size-4" />
          </span>
          <div className="flex-1">
            <p className="text-[13px] font-semibold">Allow autonomous spend changes</p>
            <p className="mt-0.5 text-xs text-fg-2">
              Consequential ad-platform changes (budgets, bids, pausing ads) can&apos;t run Automatic unless this is enabled — they are downgraded to Approval. Enable only if you accept that the AI can change live client spend without a human in the loop.
            </p>
            {!admin && <p className="mt-1 text-[11px] text-fg-3">Admin only.</p>}
          </div>
          <Toggle checked={allowSpend} onChange={toggleSpend} label="Allow autonomous spend changes" />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Human-approval modes"
          subtitle={`${AI_ACTIONS.length} AI actions · ${diff.length ? `${diff.length} differ from recommended` : "all on recommended settings"}`}
          action={
            admin && (
              <Button size="sm" icon={<RotateCcw className="size-3.5" />} disabled={!diff.length} onClick={reset}>
                Reset to recommended
              </Button>
            )
          }
        />
        <div className="divide-y divide-border">
          {AI_ACTIONS.map((k) => {
            const spend = SPEND_ACTIONS.includes(k);
            const current = modes[k];
            const downgraded = spend && current === "Automatic" && !allowSpend;
            return (
              <div key={k} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                    {k}
                    {spend && <Badge tone="warning">Spend</Badge>}
                    {current === RECOMMENDED_MODES[k] ? (
                      <span className="inline-flex items-center gap-0.5 text-[11px] font-normal text-success">
                        <CheckCircle2 className="size-3" /> Recommended
                      </span>
                    ) : (
                      <span className="text-[11px] font-normal text-fg-3">Recommended: {RECOMMENDED_MODES[k] === "Approval Required" ? "Approval" : RECOMMENDED_MODES[k]}</span>
                    )}
                  </p>
                  <p className="text-xs text-fg-3">{INFO[k]}</p>
                  {downgraded && <p className="mt-0.5 text-[11px] text-warning">Runs as Approval until autonomous spend changes are enabled.</p>}
                </div>
                <div className="inline-flex shrink-0 rounded-lg border border-border bg-surface-2 p-0.5" role="radiogroup" aria-label={`${k} mode`}>
                  {MODES.map((m) => {
                    const locked = spend && m.value === "Automatic" && !allowSpend;
                    const active = current === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={!admin || (locked && !active)}
                        title={locked ? "Enable autonomous spend changes first" : m.help}
                        onClick={() => {
                          setMode(k, m.value);
                          toast(`${k}: ${m.label}`, m.help);
                        }}
                        className={cn("inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition disabled:cursor-not-allowed", active ? "bg-surface text-fg shadow-card" : "text-fg-3 hover:text-fg disabled:hover:text-fg-3")}
                      >
                        {locked && <Lock className="size-3" />}
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
