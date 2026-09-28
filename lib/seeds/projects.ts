import type { Project, SavedView } from "../types";
import { ago, ahead, makeRand, type SeedCtx } from "./context";

// Owned by the Tasks & Projects module.
const PROJECT_TEMPLATES: Record<string, string[]> = {
  "Meta Ads": ["Q4 Performance Sprint", "Festive creative refresh"],
  "Google Ads": ["Search restructure & bidding", "Q4 Performance Sprint"],
  SEO: ["Website SEO revamp", "Content cluster build-out"],
  "Social Media": ["Always-on social calendar", "Reels growth sprint"],
  "Influencer Marketing": ["Creator seeding programme"],
  "AI Automation": ["Lead-to-CRM automation rollout"],
  Programmatic: ["Programmatic brand-lift test"],
  "Brand Strategy": ["Brand positioning refresh"],
};

export function seedProjects(ctx: SeedCtx): Project[] {
  const { pick, int, R } = makeRand(26_001);
  const out: Project[] = [];
  ctx.clients.forEach((c, ci) => {
    const names = [...new Set(c.services.flatMap((s) => PROJECT_TEMPLATES[s] ?? []))];
    const count = c.health === "Churn Risk" ? 1 : Math.min(names.length, R() > 0.4 ? 2 : 1);
    for (let i = 0; i < count; i++) {
      const name = names[i] ?? "Quarterly growth plan";
      const started = int(5, 60);
      out.push({
        id: `prj_${ci + 1}_${i + 1}`,
        name: `${name}`,
        clientId: c.id,
        ownerId: c.accountManagerId || pick(["u_am1", "u_admin"]),
        status: c.health === "Churn Risk" && i === 0 ? "On Hold" : started > 45 && R() > 0.6 ? "Completed" : started < 10 ? "Planning" : "Active",
        startDate: ago(started),
        dueDate: ahead(int(10, 75)),
        createdAt: ago(started + 2),
      });
    }
  });
  return out;
}

export function seedSavedViews(ctx: SeedCtx): SavedView[] {
  const sales = ctx.team.find((t) => t.role === "sales")?.id ?? "u_admin";
  return [
    { id: "sv_hot_d2c", module: "leads", name: "Hot D2C leads", filters: { industry: "D2C / E-commerce", tier: "Hot" }, ownerId: "u_admin", shared: true },
    { id: "sv_mumbai_founders", module: "leads", name: "Mumbai founders", filters: { location: "Mumbai", q: "founder" }, ownerId: sales, shared: true },
    { id: "sv_followup_week", module: "leads", name: "Follow-up this week", filters: { followups: "week" }, ownerId: sales, shared: false },
    { id: "sv_qualified_unassigned", module: "leads", name: "Qualified · Referral", filters: { status: "Qualified", source: "Referral" }, ownerId: "u_admin", shared: true },
  ];
}
