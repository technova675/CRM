import { aggregateValues, columnUnit, defaultAggregation, isIdentifier, isTotalLabel, toNumber, type Aggregation, type ReportTable } from "./reportFiles.ts";
import { isMissingCell, reportView } from "./reportView.ts";

export type DashboardMetric = { column: number; label: string; unit: string; mode: Aggregation; value: number; count: number; min: number; max: number };
export function dashboardSheet(table: ReportTable) {
  const clean = reportView(table);
  const rows = clean.rows.filter((row) => !row.some(isTotalLabel));
  const types = clean.columns.map((name, column) => {
    if (isIdentifier(name)) return "text";
    let filled = 0, numeric = 0, dates = 0;
    for (const row of rows) {
      const value = row[column];
      if (isMissingCell(value)) continue;
      filled++;
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value) && Number.isFinite(Date.parse(value))) dates++;
      else if (toNumber(value) !== null) numeric++;
    }
    return !filled ? "text" : dates / filled >= .9 ? "date" : numeric / filled >= .9 ? "number" : "text";
  });
  const metrics: DashboardMetric[] = types.flatMap((type, column) => {
    if (type !== "number") return [];
    const values = rows.map((row) => toNumber(row[column])).filter((value): value is number => value !== null);
    const unit = columnUnit(rows, column);
    const mode = defaultAggregation(clean.columns[column], unit);
    const value = aggregateValues(values, mode);
    return value === null ? [] : [{ column, label: clean.columns[column], unit, mode, value, count: values.length, min: values.reduce((a,b) => Math.min(a,b)), max: values.reduce((a,b) => Math.max(a,b)) }];
  });
  const dates = types.flatMap((type, i) => type === "date" ? [i] : []);
  const categories = types.flatMap((type, i) => type === "text" && !isIdentifier(clean.columns[i]) ? [i] : []);
  // Prefer a meaningful, repeated dimension over free text or unique record names.
  const category = categories.map((column) => {
    const distinct = new Set(rows.map((row) => row[column]).filter((value) => !isMissingCell(value))).size;
    return { column, score: distinct < 2 ? Infinity : distinct };
  }).sort((a,b) => a.score-b.score)[0]?.column ?? -1;
  return { ...clean, rows, metrics, types, date: dates[0] ?? -1, category,
    totalRows: clean.rows.length - rows.length };
}
export type DashboardSheet = ReturnType<typeof dashboardSheet>;

export function dashboardSeries(sheet: DashboardSheet, metric: DashboardMetric, dimension: number) {
  const groups = new Map<string, number[]>();
  for (const row of sheet.rows) {
    const value = toNumber(row[metric.column]);
    const label = row[dimension];
    if (value === null || isMissingCell(label)) continue;
    const key = String(label).trim();
    const values = groups.get(key) ?? [];
    values.push(value); groups.set(key, values);
  }
  const data = [...groups].map(([x, values]) => ({ x, v: aggregateValues(values, metric.mode)! }));
  return data.sort((a, b) => sheet.types[dimension] === "date" ? Date.parse(a.x) - Date.parse(b.x) : b.v - a.v);
}

export function dashboardDistribution(sheet: DashboardSheet, metric: DashboardMetric) {
  const values = sheet.rows.map((row) => toNumber(row[metric.column])).filter((value): value is number => value !== null);
  if (!values.length) return [];
  const min = values.reduce((a, b) => Math.min(a, b)), max = values.reduce((a, b) => Math.max(a, b));
  if (min === max) return [{ x: String(min), v: values.length }];
  const count = Math.min(6, Math.ceil(Math.sqrt(values.length)));
  const step = (max - min) / count;
  const format = (n: number) => n.toLocaleString("en-IN", { maximumSignificantDigits: 6 });
  const bins = Array.from({ length: count }, (_, i) => ({ x: `${format(min + i * step)} – ${format(i === count - 1 ? max : min + (i + 1) * step)}`, v: 0 }));
  for (const value of values) bins[Math.min(count - 1, Math.floor((value - min) / step))].v++;
  return bins;
}

export function latestCompanyReport<T extends { id: string; clientId: string; createdAt: string }>(files: T[], companyId: string) {
  return files.filter((file) => file.clientId === companyId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id))[0];
}
