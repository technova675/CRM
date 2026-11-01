import test from "node:test";
import assert from "node:assert/strict";
import { gridToTable } from "../lib/domain/reportFiles.ts";
import { overviewModel, overviewData, change, presetRange } from "../lib/domain/marketingOverview.ts";

const iso = (n) => new Date(Date.UTC(2026, 8, 1 + n)).toISOString().slice(0, 10); // 2026-09-01 + n days
// 60 days x 2 campaigns. Alpha: cost 100, 1000 impressions, 50 clicks, 5 conversions, revenue 300 each day. Beta: cost 50, 500, 10, 1, 0.
const grid = [["Date", "Campaign", "Cost", "Impressions", "Clicks", "Conversions", "Revenue", "CTR", "Cost / Conv."]];
for (let d = 0; d < 60; d++) {
  grid.push([iso(d), "Alpha", `₹${100 + (d >= 30 ? 100 : 0)}`, 1000, 50, 5, 300, "5%", "₹20"]);
  grid.push([iso(d), "Beta", 50, 500, 10, 1, 0, "2%", "₹50"]);
}
const table = gridToTable("Ads", grid);

test("advertising columns are found by name and ratio columns are ignored", () => {
  const model = overviewModel(table);
  assert.ok(model);
  assert.deepEqual(Object.keys(model.measures).sort(), ["clicks", "conversions", "cost", "impressions", "revenue"]);
  assert.equal(table.columns[model.measures.cost], "Cost");
  assert.equal(table.columns[model.campaign], "Campaign");
  assert.equal(model.currency, "₹");
  assert.deepEqual(model.bounds, { min: "2026-09-01", max: "2026-10-30" });
});

test("totals and ratios come from summed totals, not averages of averages", () => {
  const { totals } = overviewData(overviewModel(table), { campaigns: null, from: null, to: null });
  assert.equal(totals.cost, 30 * 100 + 30 * 200 + 60 * 50);
  assert.equal(totals.clicks, 60 * 60);
  assert.equal(totals.ctr, totals.clicks / totals.impressions * 100);
  assert.equal(totals.cpc, totals.cost / totals.clicks);
  assert.equal(totals.roas, 18000 / totals.cost);
  assert.equal(totals.conversionRate, 360 / 3600 * 100);
});

test("campaign and date filters apply together, and the table is sorted by cost", () => {
  const model = overviewModel(table);
  const alpha = overviewData(model, { campaigns: ["Alpha"], from: "2026-09-01", to: "2026-09-10" });
  assert.equal(alpha.totals.cost, 1000);
  assert.equal(alpha.series.length, 10);
  assert.deepEqual(alpha.campaigns.map((c) => c.name), ["Alpha"]);
  const all = overviewData(model, { campaigns: null, from: null, to: null });
  assert.deepEqual(all.campaigns.map((c) => c.name), ["Alpha", "Beta"]);
  assert.equal(all.donutMeasure, "conversions");
  assert.deepEqual(all.donut.map((d) => d.name), ["Alpha", "Beta"]);
});

test("a change versus the previous period exists only when the file covers that period", () => {
  const model = overviewModel(table);
  const last30 = presetRange(model.bounds, 30);
  assert.deepEqual(last30, { from: "2026-10-01", to: "2026-10-30" });
  const withPrevious = overviewData(model, { campaigns: ["Alpha"], ...last30 });
  assert.equal(withPrevious.totals.cost, 6000);
  assert.equal(withPrevious.previous.cost, 3000);
  assert.equal(change(withPrevious.totals.cost, withPrevious.previous.cost), 100);
  const noPrevious = overviewData(model, { campaigns: null, ...presetRange(model.bounds, null) });
  assert.equal(noPrevious.previous, null);
  const partial = overviewData(model, { campaigns: null, from: "2026-09-20", to: "2026-10-20" });
  assert.equal(partial.previous, null);
  assert.equal(change(5, undefined), undefined);
  assert.equal(change(5, 0), undefined);
});

test("tables that are not advertising data are left alone", () => {
  assert.equal(overviewModel(gridToTable("People", [["Name", "Age"], ["A", 30], ["B", 41]])), null);
  assert.equal(overviewModel(gridToTable("One metric", [["Campaign", "Clicks"], ["A", 1], ["B", 2]])), null);
});
