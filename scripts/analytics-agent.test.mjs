import assert from "node:assert/strict";
import test from "node:test";
import { buildInvestigation } from "../lib/domain/analyticsInvestigation.ts";
import { parseAnalyticsCsv } from "../lib/domain/analyticsEngine.ts";
const rows = parseAnalyticsCsv("date,spend,conversions,clicks,creative,audience,placement,landing_page\n2026-11-08,1000,10,100,Short video,Prospects,Feed,Product\n2026-11-09,1270,10,200,Short video,Prospects,Feed,Product");
const feed = { id: "paid", clientId: "client", platform: "Meta Ads", report: "Daily", account: "example", method: "CSV import", currency: "INR", rows };
const library = { clients: [{ id: "client", company: "Example" }], analyticsFeeds: [feed], campaigns: [], ads: [], creatives: [], leads: [], deals: [], seoProjects: [] };
const input = { source: feed.id, clientId: "client", metric: "cpa", days: 1, end: "", explain: false };

test("measured CPA, attribution gaps and comparable segment evidence", () => {
  const brief = buildInvestigation(library, input);
  assert.equal(brief.comparable, true);
  assert.equal(brief.primary.previous.value, 100);
  assert.equal(brief.primary.current.value, 127);
  assert.equal(brief.primary.delta, 27);
  assert.deepEqual(brief.evidence.filter(e => e.grain).map(e => e.topic), ["Creative", "Audience", "Placement", "Landing page"]);
  assert.equal(brief.evidence.find(e => e.metric === "cvr").delta, -50);
  assert.ok(brief.gaps.some(gap => gap.includes("Competition")));
});

test("partial and mismatched coverage does not produce a headline delta", () => {
  assert.equal(buildInvestigation(library, { ...input, days: 7 }).comparable, false);
  const partial = { ...library, analyticsFeeds: [{ ...feed, rows: [...rows, { date: rows[1].date, spend: 50 }] }] };
  assert.equal(buildInvestigation(partial, input).primary.delta, null);
  const zero = { ...library, analyticsFeeds: [{ ...feed, rows: [{ ...rows[0], conversions: 0 }, rows[1]] }] };
  assert.equal(buildInvestigation(zero, input).comparable, false);
  assert.equal(buildInvestigation(library, { ...input, clientId: "other" }), null);
});
