import { metricDef, type MetricKey } from "@/lib/ai/analytics";
import { compact, money } from "@/lib/utils";

export function fmtVal(k: MetricKey, v: number, short = false) {
  const kind = metricDef(k).kind;
  if (!Number.isFinite(v)) return "—";
  if (kind === "money") return short && Math.abs(v) >= 1e5 ? `₹${compact(v)}` : money(v);
  if (kind === "pct") return `${v.toFixed(2)}%`;
  if (kind === "x") return `${v.toFixed(2)}x`;
  return short ? compact(v) : Math.round(v).toLocaleString("en-IN");
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked — views stay in memory */
  }
}
