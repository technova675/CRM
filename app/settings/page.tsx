"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, Ban, Bell, Building2, CreditCard, Database, FormInput, History, ListChecks, Lock, Plug, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Button, Card, PageHeader, Readonly } from "@/components/ui";
import { DataSection, General, Onboarding, Scoring, Suppression } from "@/components/settings/core";
import { AIApprovals } from "@/components/settings/AIApprovals";
import { NotificationPrefs } from "@/components/settings/NotificationPrefs";
import { PlanUsage } from "@/components/settings/PlanUsage";
import { Security } from "@/components/settings/Security";
import { AuditLog } from "@/components/settings/AuditLog";
import { CustomFields } from "@/components/settings/CustomFields";

type Section = "general" | "ai" | "notifications" | "plan" | "security" | "audit" | "scoring" | "onboarding" | "suppression" | "fields" | "data" | "team" | "integrations";

const SECTIONS: { key: Section; label: string; icon: typeof Users; group: string; href?: string }[] = [
  { key: "general", label: "General", icon: Building2, group: "Workspace" },
  { key: "plan", label: "Plan & usage", icon: CreditCard, group: "Workspace" },
  { key: "notifications", label: "Notifications", icon: Bell, group: "Workspace" },
  { key: "ai", label: "AI approvals", icon: ShieldCheck, group: "AI & safety" },
  { key: "security", label: "Security", icon: Lock, group: "AI & safety" },
  { key: "audit", label: "Audit log", icon: History, group: "AI & safety" },
  { key: "scoring", label: "Lead scoring", icon: SlidersHorizontal, group: "CRM" },
  { key: "fields", label: "Lead custom fields", icon: FormInput, group: "CRM" },
  { key: "onboarding", label: "Onboarding templates", icon: ListChecks, group: "CRM" },
  { key: "suppression", label: "Suppression list", icon: Ban, group: "CRM" },
  { key: "data", label: "Data", icon: Database, group: "CRM" },
  { key: "team", label: "Team & roles", icon: Users, group: "Elsewhere", href: "/team" },
  { key: "integrations", label: "Integrations", icon: Plug, group: "Elsewhere", href: "/integrations" },
];
const GROUPS = ["Workspace", "AI & safety", "CRM", "Elsewhere"];
const TITLES: Partial<Record<Section, { title: string; desc: string }>> = {
  ai: { title: "AI human-approval system", desc: "Decide, per AI action, whether the AI only recommends, prepares for approval, or executes." },
  notifications: { title: "Notifications", desc: "Where each category of event reaches you." },
  plan: { title: "Plan & usage", desc: "Organization, subscription plan and metered usage." },
  security: { title: "Security", desc: "Access control, sessions, network restrictions, retention and backups." },
  audit: { title: "Activity & audit log", desc: "Who did what, when — with before and after values." },
};

function MovedCard({ to, label, desc }: { to: string; label: string; desc: string }) {
  return (
    <Card className="flex flex-col items-start gap-3 p-6">
      <p className="text-[13px] font-semibold">{label} moved</p>
      <p className="text-xs text-fg-3">{desc}</p>
      <Button href={to} variant="primary" icon={<ArrowRight className="size-3.5" />}>
        Open {label}
      </Button>
    </Card>
  );
}

function SettingsInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const admin = me.role === "admin" && can(me.role, "settings", "write");
  const raw = params.get("tab") as Section | null;
  const section: Section = raw && SECTIONS.some((s) => s.key === raw) ? raw : "general";
  const go = (s: Section) => router.replace(s === "general" ? "/settings" : `/settings?tab=${s}`, { scroll: false });
  const head = TITLES[section];
  // The audit log is read-only by nature; its filters stay usable for non-admins.
  const locked = !admin && section !== "audit";

  return (
    <div>
      <PageHeader title="Settings" description="Workspace configuration, AI guardrails, security, plan and audit trail." />
      {!admin && <Readonly>Only admins can change settings — you&apos;re viewing them read-only.</Readonly>}
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:pb-0">
          {GROUPS.map((g) => (
            <div key={g} className="contents lg:block lg:space-y-0.5">
              <p className="hidden px-2.5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-fg-3 first:pt-0 lg:block">{g}</p>
              {SECTIONS.filter((s) => s.group === g).map((s) =>
                s.href ? (
                  <Link key={s.key} href={s.href} className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-transparent px-2.5 text-[13px] font-medium text-fg-2 hover:bg-surface-2">
                    <s.icon className="size-4 text-fg-3" />
                    {s.label}
                    <ArrowRight className="ml-auto size-3 text-fg-3" />
                  </Link>
                ) : (
                  <button
                    key={s.key}
                    onClick={() => go(s.key)}
                    className={cn("flex h-8 w-full shrink-0 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium", section === s.key ? "border border-border bg-surface text-fg shadow-card" : "border border-transparent text-fg-2 hover:bg-surface-2")}
                  >
                    <s.icon className={cn("size-4", section === s.key ? "text-accent" : "text-fg-3")} />
                    {s.label}
                  </button>
                ),
              )}
            </div>
          ))}
        </nav>
        <div className="min-w-0">
          {head && (
            <div className="mb-3">
              <h2 className="text-[15px] font-semibold">{head.title}</h2>
              <p className="text-xs text-fg-3">{head.desc}</p>
            </div>
          )}
          <fieldset disabled={locked} className="min-w-0 space-y-4">
            {section === "general" && <General />}
            {section === "ai" && <AIApprovals admin={admin} />}
            {section === "notifications" && <NotificationPrefs />}
            {section === "plan" && <PlanUsage admin={admin} />}
            {section === "security" && <Security />}
            {section === "audit" && <AuditLog />}
            {section === "scoring" && <Scoring />}
            {section === "fields" && <CustomFields />}
            {section === "onboarding" && <Onboarding />}
            {section === "suppression" && <Suppression />}
            {section === "data" && <DataSection />}
            {section === "team" && <MovedCard to="/team" label="Team" desc="Members, invites, roles & permissions and workload now live on the Team page." />}
            {section === "integrations" && <MovedCard to="/integrations" label="Integrations" desc="Connectors, API keys, webhooks and the integration architecture now live on the Integrations page." />}
          </fieldset>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  );
}
