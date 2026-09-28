"use client";

// Pre-existing settings sections (general, lead scoring, onboarding templates, suppression list, data).
import { useState } from "react";
import { Download, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useCRM } from "@/lib/store";
import { SERVICES } from "@/lib/types";
import { cn, downloadFile, fmtDate } from "@/lib/utils";
import { Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, Th, Toggle } from "@/components/ui";
import { toast } from "@/components/shell/toast";

export function General() {
  const settings = useCRM((s) => s.settings);
  const update = useCRM((s) => s.updateSettings);
  return (
    <Card className="space-y-3 p-4">
      <CardHeader title="Agency" subtitle="Organization name, slug and data region live in Plan & usage." className="px-0 pt-0" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Agency name">
          <Input value={settings.agencyName} onChange={(e) => update({ agencyName: e.target.value })} />
        </Field>
        <Field label="Currency">
          <Select value={settings.currency} disabled>
            <option>INR</option>
          </Select>
        </Field>
      </div>
    </Card>
  );
}

export function Scoring() {
  const settings = useCRM((s) => s.settings);
  const update = useCRM((s) => s.updateSettings);
  const rescore = useCRM((s) => s.rescoreLeads);
  const total = settings.scoringCriteria.filter((c) => c.enabled).reduce((a, c) => a + c.weight, 0);
  return (
    <Card>
      <CardHeader
        title="Lead scoring criteria"
        subtitle="Weights are normalised to 100. Each lead's score shows the reason for every factor."
        action={
          <Button
            size="sm"
            variant="ai"
            icon={<RotateCcw className="size-3.5" />}
            onClick={() => {
              rescore();
              toast("All leads re-scored", undefined, "ai");
            }}
          >
            Re-score all leads
          </Button>
        }
      />
      <div className="divide-y divide-border">
        {settings.scoringCriteria.map((c) => (
          <div key={c.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:flex-nowrap">
            <Toggle checked={c.enabled} onChange={(v) => update({ scoringCriteria: settings.scoringCriteria.map((x) => (x.key === c.key ? { ...x, enabled: v } : x)) })} label={c.label} />
            <span className={cn("w-40 text-[13px] sm:w-48", !c.enabled && "text-fg-3")}>{c.label}</span>
            <input type="range" min={0} max={30} value={c.weight} disabled={!c.enabled} onChange={(e) => update({ scoringCriteria: settings.scoringCriteria.map((x) => (x.key === c.key ? { ...x, weight: Number(e.target.value) } : x)) })} className="min-w-24 flex-1 accent-[var(--accent)]" />
            <span className="w-10 text-right text-xs tabular-nums">{c.weight}</span>
            <span className="w-12 text-right text-xs tabular-nums text-fg-3">{c.enabled && total ? `${Math.round((c.weight / total) * 100)}%` : "—"}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-border px-4 py-3">
        <span className="text-[13px] font-medium">Qualify threshold</span>
        <input type="range" min={20} max={90} value={settings.qualifyThreshold} onChange={(e) => update({ qualifyThreshold: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
        <span className="w-10 text-right text-sm font-semibold tabular-nums">{settings.qualifyThreshold}</span>
      </div>
      <p className="px-4 pb-3 text-xs text-fg-3">Researched leads at or above the threshold move to Qualified automatically. Sales can override any score manually on the lead.</p>
    </Card>
  );
}

export function Onboarding() {
  const templates = useCRM((s) => s.settings.onboardingTemplates);
  const update = useCRM((s) => s.updateSettings);
  const [active, setActive] = useState(templates[0]?.service ?? "Default");
  const [newStep, setNewStep] = useState("");
  const tpl = templates.find((t) => t.service === active);
  const missing = SERVICES.filter((s) => !templates.some((t) => t.service === s));
  const setSteps = (steps: string[]) => update({ onboardingTemplates: templates.map((t) => (t.service === active ? { ...t, steps } : t)) });
  return (
    <Card>
      <CardHeader title="Onboarding checklists" subtitle="When a deal is won, the Default checklist plus each purchased service's steps are applied to the new client." />
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {templates.map((t) => (
          <button key={t.service} onClick={() => setActive(t.service)} className={cn("rounded-full border px-2.5 py-0.5 text-xs", active === t.service ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-2")}>
            {t.service} <span className="text-fg-3">{t.steps.length}</span>
          </button>
        ))}
        {missing.length > 0 && (
          <Select
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              update({ onboardingTemplates: [...templates, { service: e.target.value as (typeof SERVICES)[number], steps: [] }] });
              setActive(e.target.value as (typeof SERVICES)[number]);
            }}
            className="h-6 w-40 text-xs"
          >
            <option value="">+ Add service…</option>
            {missing.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        )}
      </div>
      {tpl && (
        <div className="space-y-1.5 border-t border-border px-4 py-3">
          {tpl.steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-xs tabular-nums text-fg-3">{i + 1}.</span>
              <Input value={s} onChange={(e) => setSteps(tpl.steps.map((x, j) => (j === i ? e.target.value : x)))} />
              <button onClick={() => setSteps(tpl.steps.filter((_, j) => j !== i))} className="text-fg-3 hover:text-danger" aria-label="Remove step">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newStep.trim()) return;
              setSteps([...tpl.steps, newStep.trim()]);
              setNewStep("");
            }}
            className="flex gap-2 pt-1"
          >
            <Input value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="Add a step…" />
            <Button type="submit" icon={<Plus className="size-3.5" />}>
              Add
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}

export function Suppression() {
  const list = useCRM((s) => s.settings.suppressions);
  const add = useCRM((s) => s.addSuppression);
  const remove = useCRM((s) => s.removeSuppression);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("Requested removal");
  return (
    <Card>
      <CardHeader title="Suppression list" subtitle="Emails, phone numbers or domains that must never be contacted. Opt-outs are added automatically." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim()) return;
          add(value.trim().toLowerCase(), reason);
          setValue("");
          toast("Added to suppression list");
        }}
        className="flex flex-wrap gap-2 px-4 pb-3"
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="email@domain.com, domain.com or +91…" className="min-w-48 flex-1" />
        <Input value={reason} onChange={(e) => setReason(e.target.value)} className="w-48" />
        <Button type="submit" variant="primary" icon={<Plus className="size-3.5" />}>
          Add
        </Button>
      </form>
      <Table>
        <thead>
          <tr>
            <Th>Value</Th>
            <Th>Reason</Th>
            <Th>Added</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {list.map((s) => (
            <tr key={s.value}>
              <Td className="font-mono text-xs">{s.value}</Td>
              <Td className="text-fg-2">{s.reason}</Td>
              <Td className="text-xs text-fg-3">{fmtDate(s.addedAt)}</Td>
              <Td>
                <button onClick={() => remove(s.value)} className="text-fg-3 hover:text-danger" aria-label="Remove">
                  <Trash2 className="size-3.5" />
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

export function DataSection() {
  const resetDemo = useCRM((s) => s.resetDemo);
  const [confirm, setConfirm] = useState(false);
  const exportAll = () => {
    const s = useCRM.getState();
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) if (typeof v !== "function") data[k] = v;
    downloadFile(`adbibe-crm-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
    toast("Export downloaded");
  };
  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="text-[13px] font-medium">Export all data</p>
          <p className="text-xs text-fg-3">Download every record in this workspace as JSON.</p>
        </div>
        <Button icon={<Download className="size-3.5" />} onClick={exportAll}>
          Export JSON
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <div className="flex-1">
          <p className="text-[13px] font-medium text-danger">Reset demo data</p>
          <p className="text-xs text-fg-3">Replaces all local data with a fresh sample dataset. This cannot be undone.</p>
        </div>
        <Button variant="danger" icon={<RotateCcw className="size-3.5" />} onClick={() => setConfirm(true)}>
          Reset
        </Button>
      </div>
      {confirm && (
        <Modal
          open
          size="sm"
          onClose={() => setConfirm(false)}
          title="Reset all data?"
          footer={
            <>
              <Button onClick={() => setConfirm(false)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  resetDemo();
                  setConfirm(false);
                  toast("Demo data reset");
                }}
              >
                Yes, reset
              </Button>
            </>
          }
        >
          <p className="text-[13px] text-fg-2">All leads, deals, clients, tasks and settings in this browser will be replaced.</p>
        </Modal>
      )}
    </Card>
  );
}
