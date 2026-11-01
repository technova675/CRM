import { columnUnit, toNumber, type ReportTable } from "./reportFiles.ts";
import { isMissingCell } from "./reportView.ts";
import { dashboardSheet } from "./workbookDashboard.ts";

// Finds advertising columns (campaign, cost, impressions, clicks, conversions, revenue, date) in an uploaded
// table by their names and builds the figures for a marketing overview. Every figure is computed from the
// uploaded rows: ratios come from summed totals (never an average of averages), and a "change" only exists
// when the file really contains the previous period. Pure: no DOM or framework code.

export type Measure = "cost" | "impressions" | "clicks" | "conversions" | "revenue";
export type Totals = Record<Measure, number> & { ctr: number | null; cpc: number | null; cpm: number | null; costPerConversion: number | null; conversionRate: number | null; roas: number | null };
export type OverviewModel = { campaign: number; date: number; measures: Partial<Record<Measure, number>>; rows: { campaign: string; date: string | null; values: Partial<Record<Measure, number>> }[]; currency: string; bounds: { min: string; max: string } | null };
export type OverviewFilter = { campaigns: string[] | null; from: string | null; to: string | null };

const ratioName = /(\bper\b|\/|\bavg\b|\baverage\b|cpc|cpm|cpa|cpl|cpv|roas|ctr|rate|%|ratio|share)/i;
const MEASURE_PATTERNS: Record<Measure, RegExp[]> = {
  cost: [/\b(cost|spend|spent)\b/i],
  impressions: [/\bimpr(essions?)?\b/i],
  clicks: [/\bclicks?\b/i],
  conversions: [/\bconversions?\b/i, /\b(leads|results|purchases|orders|sign-?ups)\b/i],
  revenue: [/\b(revenue|sales|conversion value|purchase value)\b/i],
};
const CAMPAIGN_PATTERNS = [/^campaign( name)?$/i, /^ad ?(set|group)( name)?$/i, /^ad( name)?$/i, /^(channel|platform|source|medium)$/i];

const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

// Returns null when the table does not look like advertising data (fewer than two of cost, impressions, clicks, conversions).
export function overviewModel(table: ReportTable): OverviewModel | null {
  const sheet = dashboardSheet(table);
  const numeric = sheet.types.flatMap((type, i) => type === "number" ? [i] : []);
  const measures: Partial<Record<Measure, number>> = {};
  for (const measure of Object.keys(MEASURE_PATTERNS) as Measure[]) {
    for (const pattern of MEASURE_PATTERNS[measure]) {
      const found = numeric.find((i) => !ratioName.test(sheet.columns[i]) && pattern.test(sheet.columns[i]) && !Object.values(measures).includes(i));
      if (found !== undefined) { measures[measure] = found; break; }
    }
  }
  if (["cost", "impressions", "clicks", "conversions"].filter((m) => measures[m as Measure] !== undefined).length < 2) return null;
  const textColumns = sheet.types.flatMap((type, i) => type === "text" ? [i] : []);
  let campaign = -1;
  for (const pattern of CAMPAIGN_PATTERNS) {
    campaign = textColumns.find((i) => pattern.test(sheet.columns[i].trim())) ?? -1;
    if (campaign >= 0) break;
  }
  if (campaign < 0) campaign = sheet.category;
  const rows = sheet.rows.map((row) => {
    const values: Partial<Record<Measure, number>> = {};
    for (const [measure, column] of Object.entries(measures) as [Measure, number][]) values[measure] = toNumber(row[column]) ?? 0;
    const dateCell = sheet.date >= 0 ? row[sheet.date] : null;
    return { campaign: campaign >= 0 && !isMissingCell(row[campaign]) ? String(row[campaign]).trim() : "All data", date: typeof dateCell === "string" ? dateCell.slice(0, 10) : null, values };
  });
  if (rows.length < 2) return null;
  const dates = rows.flatMap((row) => row.date ? [row.date] : []).sort();
  const costColumn = measures.cost;
  return {
    campaign, date: sheet.date, measures, rows,
    currency: costColumn !== undefined ? columnUnit(sheet.rows, costColumn) : "",
    bounds: dates.length ? { min: dates[0], max: dates[dates.length - 1] } : null,
  };
}

const ratio = (a: number, b: number, scale = 1) => b > 0 ? a / b * scale : null;
function derive(sum: Record<Measure, number>): Totals {
  return { ...sum, ctr: ratio(sum.clicks, sum.impressions, 100), cpc: ratio(sum.cost, sum.clicks), cpm: ratio(sum.cost, sum.impressions, 1000), costPerConversion: ratio(sum.cost, sum.conversions), conversionRate: ratio(sum.conversions, sum.clicks, 100), roas: ratio(sum.revenue, sum.cost) };
}
const empty = (): Record<Measure, number> => ({ cost: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });
function add(target: Record<Measure, number>, values: Partial<Record<Measure, number>>) {
  for (const key of Object.keys(target) as Measure[]) target[key] += values[key] ?? 0;
}

export type OverviewData = {
  totals: Totals;
  previous: Totals | null;
  series: { x: string; totals: Totals }[];
  campaigns: ({ name: string } & Totals)[];
  donut: { name: string; value: number }[];
  donutMeasure: Measure;
  campaignNames: string[];
};

export function overviewData(model: OverviewModel, filter: OverviewFilter): OverviewData {
  const keep = (row: OverviewModel["rows"][number], from: string | null, to: string | null) =>
    (!filter.campaigns || filter.campaigns.includes(row.campaign)) && (!from || !row.date || row.date >= from) && (!to || !row.date || row.date <= to) && !(model.date >= 0 && (from || to) && !row.date);
  const current = model.rows.filter((row) => keep(row, filter.from, filter.to));
  const sum = empty();
  const byDate = new Map<string, Record<Measure, number>>();
  const byCampaign = new Map<string, Record<Measure, number>>();
  for (const row of current) {
    add(sum, row.values);
    if (row.date) add(byDate.get(row.date) ?? byDate.set(row.date, empty()).get(row.date)!, row.values);
    add(byCampaign.get(row.campaign) ?? byCampaign.set(row.campaign, empty()).get(row.campaign)!, row.values);
  }
  const rank = (totals: Totals) => model.measures.cost !== undefined ? totals.cost : model.measures.conversions !== undefined ? totals.conversions : totals.clicks;
  const campaigns = [...byCampaign].map(([name, values]) => ({ name, ...derive(values) })).sort((a, b) => rank(b) - rank(a));
  const donutMeasure: Measure = model.measures.conversions !== undefined ? "conversions" : model.measures.clicks !== undefined ? "clicks" : "cost";
  const byShare = [...campaigns].sort((a, b) => b[donutMeasure] - a[donutMeasure]).filter((c) => c[donutMeasure] > 0);
  const donut = byShare.slice(0, 5).map((c) => ({ name: c.name, value: c[donutMeasure] }));
  const rest = byShare.slice(5).reduce((n, c) => n + c[donutMeasure], 0);
  if (rest > 0) donut.push({ name: "Others", value: rest });

  let previous: Totals | null = null;
  if (filter.from && filter.to && model.bounds) {
    const length = Math.round((day(filter.to) - day(filter.from)) / DAY) + 1;
    const prevTo = iso(day(filter.from) - DAY), prevFrom = iso(day(filter.from) - length * DAY);
    // Only compare when the file covers the whole previous window; a partial window would mislead.
    if (length > 0 && model.bounds.min <= prevFrom) {
      const earlier = model.rows.filter((row) => keep(row, prevFrom, prevTo));
      if (earlier.length) { const total = empty(); for (const row of earlier) add(total, row.values); previous = derive(total); }
    }
  }
  return {
    totals: derive(sum), previous,
    series: [...byDate].sort((a, b) => a[0].localeCompare(b[0])).map(([x, values]) => ({ x, totals: derive(values) })),
    campaigns, donut, donutMeasure,
    campaignNames: [...new Set(model.rows.map((row) => row.campaign))].sort((a, b) => a.localeCompare(b)),
  };
}

// Percentage change between two totals, or undefined when there is nothing to compare against.
export const change = (current: number | null, previous: number | null | undefined) => current === null || previous == null || previous === 0 ? undefined : (current - previous) / Math.abs(previous) * 100;

// A date range counted back from the newest date in the file (not from today), or the whole file when days is null.
export function presetRange(bounds: { min: string; max: string }, days: number | null) {
  if (days === null) return { from: bounds.min, to: bounds.max };
  const from = iso(Math.max(day(bounds.min), day(bounds.max) - (days - 1) * DAY));
  return { from, to: bounds.max };
}
