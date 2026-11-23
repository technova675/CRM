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

// Column names that ad platforms and analytics tools use in their own exports, in priority order per field.
// Matching ignores case, punctuation and a trailing currency such as "(INR)", so a Meta, Google Ads or LinkedIn
// export can be imported without rebuilding it in a spreadsheet.
const COLUMN_ALIASES: Record<string, string[]> = {
  date: ["date", "day", "reporting starts", "start date", "week", "month"],
  campaign: ["campaign", "campaign name"],
  ad: ["ad", "ad name"],
  creative: ["creative", "creative name", "ad creative"],
  audience: ["audience", "ad set name", "ad set", "ad group", "ad group name", "audience segment"],
  geography: ["geography", "region", "country", "city", "location", "country territory"],
  product: ["product", "product name", "item", "item name"],
  placement: ["placement", "platform position", "network"],
  landingPage: ["landingpage", "landing page", "final url", "website url", "page path", "landing page path"],
  spend: ["spend", "amount spent", "cost", "spent", "total spent", "media cost"],
  revenue: ["revenue", "purchases conversion value", "conversion value", "total conv value", "conv value", "purchase revenue", "total revenue"],
  reach: ["reach"],
  impressions: ["impressions", "impr"],
  clicks: ["clicks", "link clicks", "clicks all", "outbound clicks"],
  leads: ["leads", "website leads", "on facebook leads", "lead form completions"],
  conversions: ["conversions", "purchases", "all conv", "results", "key events", "total conversions"],
  sessions: ["sessions", "visits"],
  orders: ["orders", "transactions"],
};
const headerKey = (header: string) => header.toLowerCase().replace(/\((?:[a-z]{3}|[^)]*currency[^)]*)\)\s*$/i, "").replace(/[^a-z0-9]+/g, " ").trim();
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** ISO dates pass through. "Nov 1, 2026", "1 Nov 2026" and day-first "01/11/2026" (the Indian default) become YYYY-MM-DD. */
export function exportDate(raw: string) {
  const text = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  let m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = text.match(/^([a-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/i) ?? text.match(/^(\d{1,2}) ([a-z]{3})[a-z]*\.?,? (\d{4})$/i);
  if (m) {
    const [day, month] = /^\d/.test(m[1]) ? [+m[1], m[2]] : [+m[2], m[1]];
    const index = MONTHS.indexOf(month.toLowerCase());
    if (index >= 0) return `${m[3]}-${pad(index + 1)}-${pad(day)}`;
  }
  return text;
}
/** "₹4,250.50", "1,234", "12%" and "--" (no data) as exported by ad platforms. */
const exportNumber = (raw: string) => {
  const text = raw.trim().replace(/^[^\d.-]+/, "").replace(/[,\s%]/g, "");
  if (!text || /^-+$/.test(text)) return undefined;
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
};

export function parseAnalyticsCsvReport(csv: string): { rows: AnalyticsRow[]; ignored: string[]; skipped: number } {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: "greedy" });
  if (parsed.errors.some(error => error.type !== "FieldMismatch" || error.code !== "TooFewFields") || Object.keys(parsed.meta.renamedHeaders ?? {}).length) throw new Error("Check CSV headers, field counts and quoting. Headers must be unique.");
  const headers = parsed.meta.fields ?? [];
  const byKey = new Map(headers.map(header => [headerKey(header), header]));
  const source: Partial<Record<string, string>> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const found = aliases.find(alias => byKey.has(alias));
    if (found) source[field] = byKey.get(found);
  }
  // Meta exports carry both a reporting range and a Day column; the day is the row's date.
  if (source.date && byKey.has("day")) source.date = byKey.get("day");
  if (!source.date) throw new Error("Add a date column (such as Date, Day or Reporting starts) so each row has a date.");
  // Meta's "Results" counts whatever the campaign optimises for; its result indicator says when that is leads.
  const indicator = byKey.get("result indicator") ?? byKey.get("result type");
  if (!source.leads && source.conversions && headerKey(source.conversions) === "results" && indicator && parsed.data.some(row => /lead/i.test(row[indicator] ?? ""))) {
    source.leads = source.conversions; delete source.conversions;
  }
  const used = new Set(Object.values(source));
  const ignored = headers.filter(header => !used.has(header));
  const rows: AnalyticsRow[] = [];
  let skipped = 0;
  parsed.data.forEach((raw, index) => {
    const date = raw[source.date!]?.trim() ?? "";
    // Exports end with totals or notes rows that have no date; they are not measurements.
    if (!date || /^(total|totals|grand total|summary)/i.test(date)) { skipped++; return; }
    const input: Record<string, unknown> = { date: exportDate(date) };
    for (const [field, header] of Object.entries(source)) {
      if (field === "date" || !header) continue;
      const cell = raw[header]?.trim() ?? "";
      if (!cell || /^-+$/.test(cell)) continue;
      input[field] = (detailKeys as readonly string[]).includes(field) ? cell : exportNumber(cell);
      if (input[field] === undefined) delete input[field];
    }
    const result = analyticsRow.safeParse(input);
    if (!result.success) throw new Error("Row " + (index + 2) + ": check the date and use plain non-negative numbers for metrics.");
    rows.push(result.data);
  });
  if (!rows.length || rows.length > 3000) throw new Error("Import 1–3,000 dated rows per file.");
  return { rows, ignored, skipped };
}

export function parseAnalyticsCsv(csv: string): AnalyticsRow[] {
  return parseAnalyticsCsvReport(csv).rows;
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

/**
 * The numbers that matter for what a report actually measures: revenue reports lead with ROAS, lead reports with CPL,
 * conversion reports with CPA, otherwise delivery. Metrics whose total is zero (for example Revenue ₹0 in a lead campaign) are left out.
 */
export function goalMetrics(rows: Pick<AnalyticsRow, "revenue" | "leads" | "conversions" | "orders">[]): Metric[] {
  const total = (key: "revenue" | "leads" | "conversions" | "orders") => rows.reduce((sum, row) => sum + (row[key] ?? 0), 0);
  if (total("revenue") > 0) return ["roas", "spend", "revenue", total("orders") > 0 ? "orders" : "conversions"];
  if (total("leads") > 0) return ["cpl", "spend", "leads", "ctr"];
  if (total("conversions") > 0) return ["cpa", "spend", "conversions", "ctr"];
  return ["spend", "impressions", "clicks", "ctr"];
}
/** Largest comparison window for which two consecutive windows fit in the data. */
export function windowFor(dates: number): 1 | 7 | 14 | 30 {
  return ([30, 14, 7] as const).find(days => dates >= days * 2) ?? 1;
}
