import Papa from "papaparse";
import { z } from "zod";
import { seoDate } from "./seoWorkspace.ts";
import type { CRMLibrary } from "./crmLibrary";

export const providers = ["Meta Ads", "Google Ads", "Google Analytics", "Search Console", "LinkedIn Ads", "Ecommerce", "Retail Media", "Quick Commerce", "Website Analytics", "Programmatic"] as const;
export const detailKeys = ["campaign", "ad", "creative", "audience", "geography", "product", "placement", "landingPage"] as const;
export const dimensions = ["client", "platform", ...detailKeys, "date"] as const;
export const counts = ["impressions", "clicks", "leads", "conversions", "sessions", "orders", "deals"] as const;
export const baseMetrics = ["spend", "revenue", ...counts] as const;
export const metrics = {
  spend: "Spend", revenue: "Revenue", impressions: "Impressions", clicks: "Clicks", leads: "Leads", conversions: "Conversions",
  sessions: "Sessions", orders: "Orders", deals: "Deals created", ctr: "CTR", cpc: "CPC", cpm: "CPM", cpl: "CPL", cpa: "CPA", roas: "ROAS", cvr: "Click conversion rate",
};
export type Metric = keyof typeof metrics;
export type Dimension = typeof dimensions[number];
const field = z.string().trim().min(1).max(180);
const value = z.number().finite().nonnegative().max(1e12).nullable().optional();
export const currencyCode = z.string().regex(/^[A-Z]{3}$/);
export const analyticsRow = z.object({
  date: seoDate,
  campaign: field.optional(), ad: field.optional(), creative: field.optional(), audience: field.optional(), geography: field.optional(), product: field.optional(), placement: field.optional(), landingPage: field.optional(),
  spend: value, revenue: value, reach: value, impressions: value, clicks: value, leads: value, conversions: value, sessions: value, orders: value,
}).strict().refine(row => baseMetrics.some(key => key !== "deals" && row[key] != null) || row.reach != null, "Provide at least one measured metric");
export const feedSpec = z.object({
  clientId: field, platform: z.enum(providers), account: field, report: field,
});
export type FeedSpec = z.infer<typeof feedSpec>;
export type AnalyticsRow = z.infer<typeof analyticsRow>;
export interface AnalyticsFeed extends FeedSpec {
  id: string;
  currency: string;
  grain: string;
  updatedAt: string;
  method: "CSV import" | "Live sync";
  rows: AnalyticsRow[];
}
export type Fact = Omit<AnalyticsRow, "date"> & {
  date: string; clientId: string; platform: string; currency?: string; deals?: number; origin: string; feed?: string; feedId?: string; dimensionIds?: Partial<Record<Dimension, string>>;
};

export function parseAnalyticsCsv(csv: string): AnalyticsRow[] {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: "greedy", transformHeader: h => { const key = h.trim().toLowerCase(); return key === "landingpage" || key === "landing_page" ? "landingPage" : key; } });
  if (parsed.errors.length || Object.keys(parsed.meta.renamedHeaders ?? {}).length) throw new Error("Check CSV headers, field counts and quoting. Headers must be unique.");
  if (!parsed.data.length || parsed.data.length > 3000) throw new Error("Import 1–3,000 rows per file.");
  const allowed = new Set<string>(["date", ...detailKeys, ...baseMetrics.filter(key => key !== "deals"), "reach"]);
  const unsupported = parsed.meta.fields?.find(key => !allowed.has(key));
  if (unsupported) throw new Error("Unsupported column: " + unsupported + ". Use the downloadable template.");
  return parsed.data.map((raw, index) => {
    const input = Object.fromEntries(Object.entries(raw).filter(([, v]) => v.trim()).map(([k, v]) => [
      k, k === "date" || (detailKeys as readonly string[]).includes(k) ? v.trim() : /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN,
    ]));
    const result = analyticsRow.safeParse(input);
    if (!result.success) throw new Error("Row " + (index + 2) + ": check the date and use plain non-negative numbers for metrics.");
    return result.data;
  });
}

export function validateAnalyticsRows(rows: AnalyticsRow[]) {
  if (!rows.length) throw new Error("The report contains no measured rows.");
  const grain = detailKeys.filter(key => rows[0][key] !== undefined).join(",");
  const seen = new Set<string>();
  for (const row of rows) {
    if (detailKeys.filter(key => row[key] !== undefined).join(",") !== grain) throw new Error("Use one breakdown per report. Every row must supply the same dimension columns.");
    const key = JSON.stringify([row.date, ...detailKeys.map(k => row[k])]);
    if (seen.has(key)) throw new Error("Duplicate date and dimension combination. Export one row per combination.");
    seen.add(key);
  }
  return grain;
}

export function mergeAnalyticsFeed(previous: AnalyticsFeed | undefined, feed: AnalyticsFeed) {
  if (!previous) return feed;
  if (previous.grain !== feed.grain || previous.currency !== feed.currency || previous.method !== feed.method) {
    throw new Error("Report breakdown, currency or ingest method changed. Give this report a different name.");
  }
  const dates = new Set(feed.rows.map(r => r.date));
  const rows = [...previous.rows.filter(r => !dates.has(r.date)), ...feed.rows].sort((a, b) => a.date.localeCompare(b.date));
  return { ...feed, rows };
}

export function campaignFacts(campaigns: CRMLibrary["campaigns"], ads: CRMLibrary["ads"], creatives: CRMLibrary["creatives"], byAd: boolean): Fact[] {
  const adMap = new Map(ads.map(ad => [JSON.stringify([ad.campaignId, ad.id]), ad]));
  const creativeMap = new Map(creatives.map(creative => [creative.id, creative]));
  const mapped = new Map(creatives.flatMap(creative => (creative.performanceLinks ?? []).map(link => [JSON.stringify([link.campaignId, link.platform, link.adId]), creative] as const)));
  const result: Fact[] = [];
  for (const campaign of campaigns) {
    const rows = campaign.performanceRows ?? [];
    const totals = new Set(rows.filter(row => !row.adId).map(row => JSON.stringify([row.date, row.platform])));
    for (const row of rows) {
      if (byAd && !row.adId || !byAd && row.adId && totals.has(JSON.stringify([row.date, row.platform]))) continue;
      const ad = adMap.get(JSON.stringify([campaign.id, row.adId]));
      const creative = mapped.get(JSON.stringify([campaign.id, row.platform, row.adId])) ?? (ad?.creativeId ? creativeMap.get(ad.creativeId) : undefined);
      result.push({ ...row, clientId: campaign.clientId, campaign: campaign.name, currency: "INR", ad: row.adId ? row.adName || ad?.name || row.adId : undefined,
        creative: creative?.clientId === campaign.clientId ? creative.title : undefined, audience: ad?.audience || undefined,
        geography: ad?.geography || undefined, placement: ad?.placement || undefined, origin: row.source,
        dimensionIds: { campaign: campaign.id, ad: row.adId ? JSON.stringify([campaign.id, row.platform, row.adId]) : undefined, creative: creative?.clientId === campaign.clientId ? creative.id : undefined } });
    }
  }
  return result;
}

export function crmFacts(leads: CRMLibrary["leads"], deals: CRMLibrary["deals"]): Fact[] {
  const leadClients = new Map<string, Set<string>>();
  const facts: Fact[] = [];
  for (const deal of deals) {
    if (deal.leadId && deal.clientId) {
      const clients = leadClients.get(deal.leadId) ?? new Set<string>();
      clients.add(deal.clientId);
      leadClients.set(deal.leadId, clients);
    }
    if (seoDate.safeParse(deal.createdAt?.slice(0, 10)).success) facts.push({ date: deal.createdAt.slice(0, 10), clientId: deal.clientId ?? "", platform: "CRM", deals: 1, leads: 0, origin: "CRM records" });
  }
  for (const lead of leads) {
    const clients = leadClients.get(lead.id);
    if (seoDate.safeParse(lead.createdAt?.slice(0, 10)).success) facts.push({ date: lead.createdAt.slice(0, 10), clientId: clients?.size === 1 ? [...clients][0] : "", platform: "CRM", leads: 1, deals: 0, origin: "CRM records" });
  }
  return facts;
}

const ratios = { ctr: ["clicks", "impressions", 100], cpc: ["spend", "clicks", 1], cpm: ["spend", "impressions", 1000],
  cpl: ["spend", "leads", 1], cpa: ["spend", "conversions", 1], roas: ["revenue", "spend", 1], cvr: ["conversions", "clicks", 100] } as const;
export function metricValue(rows: Fact[], metric: Metric): { value: number | null; measured: number } {
  const ratio = Object.hasOwn(ratios, metric) ? ratios[metric as keyof typeof ratios] : undefined;
  const first = ratio?.[0] ?? metric as typeof baseMetrics[number];
  const second = ratio?.[1];
  let numerator = 0, denominator = 0, measured = 0;
  for (const row of rows) {
    const a = row[first], b = second ? row[second] : undefined;
    if (a == null || second && b == null) continue;
    measured++;
    numerator += a;
    denominator += b ?? 0;
  }
  return { value: measured && (!ratio || denominator > 0) ? ratio ? numerator / denominator * ratio[2] : numerator : null, measured };
}
