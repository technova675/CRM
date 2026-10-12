// Parses an uploaded Excel/CSV of ad performance (one row per day, optionally per campaign)
// into daily metric rows. Pure: no store or DOM access, so it can be tested on its own.

export interface ImportedMetricRow {
  date: string; // YYYY-MM-DD
  campaign: string;
  platform: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  conversions: number;
  revenue: number;
}

export type MetricField = keyof ImportedMetricRow;
export type DateOrder = "auto" | "dmy" | "mdy";

// Order matters: the first unused target whose pattern matches a header wins, so the specific
// patterns (revenue, leads) sit ahead of the loose ones (conversions, spend).
// Patterns cover the default column names of Meta Ads Manager and Google Ads exports.
export const METRIC_TARGETS: { key: MetricField; label: string; required?: boolean; guess: RegExp }[] = [
  { key: "date", label: "Date", required: true, guess: /^(date|day|report(ing)?[ _-]?(date|starts?))$/i },
  { key: "campaign", label: "Campaign", guess: /^campaign([ _-]?name)?$/i },
  { key: "platform", label: "Platform", guess: /^(platform|channel|network|source|publisher[ _-]?platform)$/i },
  { key: "revenue", label: "Revenue", guess: /revenue|conv(ersion)?s?\.?[ _-]?value|purchases?[ _-]?(conversion[ _-]?)?value|^sales$/i },
  { key: "leads", label: "Leads", guess: /^(leads?|form[ _-]?leads?|on-facebook leads|website leads)$/i },
  { key: "spend", label: "Spend", required: true, guess: /^(amount[ _-]?spent|spend|cost|ad[ _-]?spend)([ _-]*\(.*\))?$/i },
  { key: "impressions", label: "Impressions", guess: /^impr(essions|\.)?$/i },
  { key: "reach", label: "Reach", guess: /^reach$/i },
  { key: "clicks", label: "Clicks", guess: /^(link[ _-]?)?clicks?([ _-]*\(all\))?$/i },
  { key: "conversions", label: "Conversions", guess: /^(conversions?|conv\.?|purchases?|results?|orders?)$/i },
];

export function guessMapping(headers: string[]): Record<number, MetricField | "skip"> {
  const used = new Set<string>();
  const map: Record<number, MetricField | "skip"> = {};
  headers.forEach((h, i) => {
    const t = METRIC_TARGETS.find((t) => !used.has(t.key) && t.guess.test(h.trim()));
    if (t) used.add(t.key);
    map[i] = t ? t.key : "skip";
  });
  return map;
}

// "₹1,23,456.50", "1.2%", "(300)", "—" → number. Anything unreadable counts as 0.
export function parseNumber(v: string | undefined): number {
  if (!v) return 0;
  const neg = /^\(.*\)$/.test(v.trim());
  const n = Number(v.replace(/[^0-9.\-eE]/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

const pad = (n: number) => String(n).padStart(2, "0");
// A real calendar date: rejects 31/02 and month 13.
const valid = (y: number, m: number, d: number) => y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();

export function parseDate(raw: string | undefined, order: Exclude<DateOrder, "auto">): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const iso = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return valid(+iso[1]!, +iso[2]!, +iso[3]!) ? `${iso[1]}-${pad(+iso[2]!)}-${pad(+iso[3]!)}` : null;
  const parts = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/);
  if (parts) {
    const y = parts[3]!.length === 2 ? 2000 + +parts[3]! : +parts[3]!;
    const [d, m] = order === "dmy" ? [+parts[1]!, +parts[2]!] : [+parts[2]!, +parts[1]!];
    return valid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }
  // "12 Sep 2026", "Sep 12, 2026" — only when a month name is present, so stray numbers aren't read as dates.
  if (/[a-z]{3}/i.test(v)) {
    const t = new Date(v);
    if (!Number.isNaN(t.getTime()) && valid(t.getFullYear(), t.getMonth() + 1, t.getDate())) return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }
  return null;
}

// 13/09/2026 can only be day-first and 09/13/2026 only month-first; when every value is ambiguous, assume day-first.
export function detectDateOrder(values: string[]): Exclude<DateOrder, "auto"> {
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) continue;
    if (+m[1]! > 12) return "dmy";
    if (+m[2]! > 12) return "mdy";
  }
  return "dmy";
}

export interface ParsedMetrics {
  rows: ImportedMetricRow[]; // one per campaign per day (duplicate days are summed)
  skipped: number; // rows without a readable date
  campaigns: string[];
  from: string;
  to: string;
  dateOrder: Exclude<DateOrder, "auto">;
}

export function parseMetricRows(headers: string[], data: string[][], map: Record<number, string>, opts: { dateOrder: DateOrder; fallbackCampaign: string }): ParsedMetrics {
  const col = (k: MetricField) => headers.findIndex((_, i) => map[i] === k);
  const idx = Object.fromEntries(METRIC_TARGETS.map((t) => [t.key, col(t.key)])) as Record<MetricField, number>;
  const cell = (r: string[], k: MetricField) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
  const dateOrder = opts.dateOrder === "auto" ? detectDateOrder(data.map((r) => cell(r, "date"))) : opts.dateOrder;

  const merged = new Map<string, ImportedMetricRow>();
  let skipped = 0;
  for (const r of data) {
    const date = parseDate(cell(r, "date"), dateOrder);
    if (!date) {
      skipped++;
      continue;
    }
    const campaign = cell(r, "campaign") || opts.fallbackCampaign;
    const key = `${campaign.toLowerCase()}|${date}`;
    const cur = merged.get(key) ?? { date, campaign, platform: cell(r, "platform") || "Uploaded data", spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, conversions: 0, revenue: 0 };
    for (const k of ["spend", "impressions", "reach", "clicks", "leads", "conversions", "revenue"] as const) cur[k] += parseNumber(cell(r, k));
    merged.set(key, cur);
  }
  const rows = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { rows, skipped, campaigns: [...new Set(rows.map((r) => r.campaign))], from: rows[0]?.date ?? "", to: rows.at(-1)?.date ?? "", dateOrder };
}

export const METRICS_TEMPLATE_CSV = `Date,Campaign,Platform,Spend,Impressions,Reach,Clicks,Leads,Conversions,Revenue
2026-09-01,Diwali Sale - Prospecting,Meta,12500,310000,190000,4200,96,11,41800
2026-09-01,Brand Search,Google,6400,42000,30000,1900,54,9,36500
2026-09-02,Diwali Sale - Prospecting,Meta,13100,325000,198000,4350,101,12,45200
2026-09-02,Brand Search,Google,6150,40500,29000,1820,49,8,31900
`;
