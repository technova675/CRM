import type { Recommendation, Service } from "../types";
import { analyzeMedia } from "../ai/media";
import { ago, makeRand, type SeedCtx } from "./context";

const CONNECTED = ["meta", "google_ads", "dv360"]; // matches the seeded integration registry

// Seeded recommendations are produced by the real media engine from the seeded ads, so
// every number is traceable. A few are resolved to show the approval → execution history.
export function seedRecommendations(ctx: SeedCtx): Recommendation[] {
  const { R, int } = makeRand(9191);
  const all = analyzeMedia(ctx.ads, ctx.campaigns, ctx.clients, { idPrefix: "rec_seed_", connectedPlatforms: CONNECTED });
  // Interleave categories so the seeded queue shows the full range of findings (engine order kept within a category).
  const byCat = new Map<string, Recommendation[]>();
  for (const r of all) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r]);
  const media: Recommendation[] = [];
  while (media.length < 16 && [...byCat.values()].some((l) => l.length)) {
    for (const l of byCat.values()) if (l.length && media.length < 16) media.push(l.shift()!);
  }

  const recs: Recommendation[] = media.map((r) => ({ ...r, createdAt: ago(int(0, 2), int(1, 20)) }));

  // Resolve a few: executed only for task-type actions (so no budget/ad status is implied), dismissed any.
  let executed = 0;
  let dismissed = 0;
  recs.forEach((r, i) => {
    if (i < 3) return; // keep the top of the queue fresh
    const taskType = r.action?.type === "create_task" || r.action?.type === "refresh_creative";
    if (taskType && executed < 3 && R() > 0.35) {
      recs[i] = { ...r, status: "Executed", createdAt: ago(int(4, 8)), resolvedAt: ago(int(1, 3)), resolvedBy: "u_mkt1" };
      executed++;
    } else if (dismissed < 2 && r.priority !== "High" && R() > 0.6) {
      recs[i] = { ...r, status: "Dismissed", createdAt: ago(int(4, 8)), resolvedAt: ago(int(1, 3)), resolvedBy: "u_mkt2" };
      dismissed++;
    }
  });

  // Client-success recommendations derived from client health and services.
  const cs: Recommendation[] = [];
  const atRisk = ctx.clients.filter((c) => c.health !== "Healthy");
  for (const c of atRisk.slice(0, 2)) {
    const camps = ctx.campaigns.filter((x) => x.clientId === c.id);
    const last30 = camps.flatMap((x) => x.metrics.slice(-30));
    const spend = last30.reduce((a, m) => a + m.spend, 0);
    const revenue = last30.reduce((a, m) => a + m.revenue, 0);
    cs.push({
      id: `rec_seed_cs_retention_${c.id}`,
      agent: "client_success",
      clientId: c.id,
      title: `${c.company} is ${c.health} — schedule a retention review`,
      category: "Retention",
      finding: `Client health is "${c.health}" with a ₹${c.retainer.toLocaleString("en-IN")}/mo retainer and contract ending ${c.contractEnd.slice(0, 10)}.`,
      why: "Health status is set by the account team; performance and communication cadence usually drive it.",
      evidence: [
        { label: "Health", value: c.health, source: "Client record" },
        { label: "Services", value: c.services.join(", "), source: "Client record" },
        { label: "Blended ROAS (30d)", value: spend ? `${(revenue / spend).toFixed(2)}x` : "—", source: "Campaign daily metrics · last 30 days" },
      ],
      assumptions: ["Performance is a key factor in the client's sentiment (not confirmed by the client)."],
      recommendation: "Book a performance review with the decision-maker, bring a 30-day recovery plan and agree on 2–3 KPIs.",
      priority: c.health === "Churn Risk" ? "High" : "Medium",
      impact: `Estimate: protects ₹${(c.retainer * 12).toLocaleString("en-IN")} of annual retainer.`,
      status: "New",
      action: { type: "create_task", label: `Retention review — ${c.company}` },
      createdAt: ago(1, int(1, 10)),
    });
  }
  const UPSELL: Service[] = ["Google Ads", "SEO", "Influencer Marketing", "Video Production", "Meta Ads"];
  const healthy = ctx.clients.filter((c) => c.health === "Healthy");
  for (const c of healthy) {
    if (cs.filter((x) => x.category === "Upsell").length >= 1) break;
    const missing = UPSELL.find((s) => !c.services.includes(s));
    if (!missing) continue;
    cs.push({
      id: `rec_seed_cs_upsell_${c.id}`,
      agent: "client_success",
      clientId: c.id,
      title: `Upsell ${missing} to ${c.company}`,
      category: "Upsell",
      finding: `${c.company} is Healthy and currently buys ${c.services.join(", ")} — ${missing} is not part of the retainer.`,
      evidence: [
        { label: "Health", value: c.health, source: "Client record" },
        { label: "Current services", value: c.services.join(", "), source: "Client record" },
        { label: "Retainer", value: `₹${c.retainer.toLocaleString("en-IN")}/mo`, source: "Client record" },
      ],
      assumptions: [`${missing} fits the client's goals (to validate on the next call).`],
      recommendation: `Prepare a short ${missing} proposal with a 90-day pilot and present it at the next monthly review.`,
      priority: "Low",
      impact: "Estimate: +10–20% retainer if the pilot converts.",
      status: "New",
      action: { type: "create_task", label: `Prepare ${missing} pitch — ${c.company}` },
      createdAt: ago(2, int(1, 10)),
    });
  }

  return [...recs, ...cs];
}
