"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useCRM } from "@/lib/store";
import { deriveStrategyInputs, strategyContextUsed } from "@/lib/ai/strategy";
import { AGENTS } from "@/lib/ai/agents";
import type { StrategyDoc, StrategyInputs } from "@/lib/types";
import { compactMoney } from "@/lib/utils";
import { AgentChip, Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { ContextUsed } from "./shared";
import { generateStrategyDoc } from "./actions";

const EMPTY: StrategyInputs = { business: "", product: "", audience: "", geography: "", goals: "", monthlyBudget: 0, currentPerformance: "", competitors: "", channels: "" };

export function StrategyGenerator({ onClose, initialClientId, initialBudget, onCreated }: { onClose: () => void; initialClientId?: string; initialBudget?: number; onCreated: (doc: StrategyDoc) => void }) {
  const clients = useCRM((s) => s.clients);
  const campaigns = useCRM((s) => s.campaigns);
  const knowledge = useCRM((s) => s.knowledge);
  const [clientId, setClientId] = useState(initialClientId && clients.some((c) => c.id === initialClientId) ? initialClientId : "");
  const derive = (cid: string, budget?: number): StrategyInputs => {
    const client = clients.find((c) => c.id === cid);
    if (!client) return { ...EMPTY, monthlyBudget: budget ?? EMPTY.monthlyBudget };
    return deriveStrategyInputs({ client, campaigns: campaigns.filter((c) => c.clientId === cid), knowledge: knowledge.find((k) => k.clientId === cid) }, budget);
  };
  const [f, setF] = useState<StrategyInputs>(() => derive(clientId, initialBudget));
  const [busy, setBusy] = useState(false);
  const [error,setError]=useState("");

  const context = useMemo(() => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return [{ label: "Inputs only", value: "No client selected — only your brief is used" }];
    return strategyContextUsed({ client, campaigns: campaigns.filter((c) => c.clientId === clientId), knowledge: knowledge.find((k) => k.clientId === clientId) });
  }, [clients, campaigns, knowledge, clientId]);

  const pickClient = (cid: string) => {
    setClientId(cid);
    setF(derive(cid, initialBudget));
  };
  const set = (k: keyof StrategyInputs) => (e: { target: { value: string } }) => setF({ ...f, [k]: k === "monthlyBudget" ? Number(e.target.value) : e.target.value });

  const generate = async (mode:"ai"|"structured"="ai") => {
    const missing=(["business","product","audience","geography","goals"] as const).filter(key=>!f[key].trim());
    if(missing.length){setError(`Complete ${missing.join(", ")} before generation.`);return;}
    if(!Number.isInteger(f.monthlyBudget)||f.monthlyBudget<0||f.monthlyBudget>1e9){setError("Enter a whole-rupee monthly budget between 0 and 1 billion.");return;}
    setBusy(true);setError("");
    try{const doc=await generateStrategyDoc({inputs:f,clientId:clientId||undefined,mode});toast("Strategy draft saved","Review and edit all outputs before approval.","ai");onCreated(doc);}
    catch(error){setError(error instanceof Error?error.message:"Generation failed. Your brief is preserved.");}finally{setBusy(false);}
  };
  return (
    <Modal
      open
      onClose={()=>!busy&&onClose()}
      size="xl"
      title="New marketing strategy"
      subtitle={<span className="inline-flex items-center gap-1.5">Use your brief, client onboarding and saved campaign performance <AgentChip name={AGENTS.strategy.name} color={AGENTS.strategy.color} /></span>}
      footer={
        <>
          <Button disabled={busy} onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={()=>generate("structured")}>Structured planning draft</Button>
          <Button variant="ai" loading={busy} icon={<Sparkles className="size-3.5" />} onClick={()=>generate("ai")}>Generate AI strategy</Button>
        </>
      }
    >
      <fieldset disabled={busy} className="grid min-w-0 gap-4 lg:grid-cols-[1fr_280px] [&_input]:min-h-11 [&_select]:min-h-11">
        {error&&<p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger lg:col-span-2">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Client" className="sm:col-span-2">
            <Select value={clientId} onChange={(e) => pickClient(e.target.value)}>
              <option value="">No client (prospect / custom)</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company} · {c.industry}</option>)}
            </Select>
          </Field>
          <Field label="Business" className="sm:col-span-2"><Input value={f.business} onChange={set("business")} placeholder="Company — industry, location" /></Field>
          <Field label="Product / offer" className="sm:col-span-2"><Textarea value={f.product} onChange={set("product")} className="min-h-14" /></Field>
          <Field label="Audience"><Textarea value={f.audience} onChange={set("audience")} className="min-h-14" /></Field>
          <Field label="Goals"><Textarea value={f.goals} onChange={set("goals")} className="min-h-14" /></Field>
          <Field label="Geography"><Input value={f.geography} onChange={set("geography")} /></Field>
          <Field label="Monthly budget (₹)" hint={f.monthlyBudget ? `${compactMoney(f.monthlyBudget)} / month` : undefined}>
            <Input type="number" min={0} step={1} value={f.monthlyBudget} onChange={set("monthlyBudget")} />
          </Field>
          <Field label="Current performance" className="sm:col-span-2" hint="Saved campaign records from the last 30 calendar days — edit with your latest reported figures."><Textarea value={f.currentPerformance} onChange={set("currentPerformance")} className="min-h-14" /></Field>
          <Field label="Competitors"><Input value={f.competitors} onChange={set("competitors")} placeholder="Comma separated" /></Field>
          <Field label="Existing channels"><Input value={f.channels} onChange={set("channels")} /></Field>
        </div>
        <div className="space-y-3">
          <ContextUsed items={context} />
          <p className="text-[11px] text-fg-3 leading-relaxed">AI drafts all ten outputs from your brief. Personas, allocations and targets are proposals to validate. The source label identifies the model used, or a structured planning fallback. Approval records readiness for the team.</p>
        </div>
      </fieldset>
    </Modal>
  );
}



