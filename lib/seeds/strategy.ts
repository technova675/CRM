import type { StrategyDoc } from "../types";
import { deriveStrategyInputs, generateStrategy } from "../ai/strategy";
import { ago, makeRand, type SeedCtx } from "./context";

// Owned by the Strategy module. Demo strategy documents produced by the same
// deterministic engine the UI uses, with inputs derived from real seeded clients.
export function seedStrategies(ctx: SeedCtx): StrategyDoc[] {
  const { int } = makeRand(5150);
  const defs: { clientId: string; status: StrategyDoc["status"]; version: number; budget?: number; owner: string; days: number }[] = [
    { clientId: "c_1", status: "Approved", version: 2, owner: "u_cs1", days: 12 },
    { clientId: "c_2", status: "In Review", version: 1, owner: "u_am1", days: 3 },
    { clientId: "c_8", status: "Draft", version: 1, budget: 1000000, owner: "u_cs1", days: 1 },
  ];
  const out: StrategyDoc[] = [];
  defs.forEach((d, i) => {
    const client = ctx.clients.find((c) => c.id === d.clientId);
    if (!client) return;
    const campaigns = ctx.campaigns.filter((c) => c.clientId === client.id);
    const inputs = deriveStrategyInputs({ client, campaigns }, d.budget);
    const created = ago(d.days + int(10, 20));
    const doc = generateStrategy({ inputs, industry: client.industry, company: client.company, clientId: client.id, campaigns, ownerId: d.owner, id: `str_${i + 1}`, version: d.version, status: d.status, now: created });
    doc.updatedAt = ago(d.days);
    if (d.status === "Approved") {
      doc.approvedBy = "u_admin";
      doc.approvedAt = ago(d.days);
    }
    if (d.clientId === "c_8") doc.title = `${client.company} — Launch strategy (₹10L / month)`;
    out.push(doc);
  });
  return out;
}
