import assert from "node:assert/strict";
import test from "node:test";
import { campaignFacts, crmFacts, mergeAnalyticsFeed, metricValue, parseAnalyticsCsv, validateAnalyticsRows } from "../lib/domain/analyticsEngine.ts";

test("blank metrics, measured zero, duplicates and mixed breakdowns", () => {
  const rows = parseAnalyticsCsv("date,ad,clicks,spend\n2026-11-10,A,0,\n2026-11-10,B,1,20");
  assert.equal(validateAnalyticsRows(rows), "ad");
  assert.equal(rows[0].clicks, 0);
  assert.equal(rows[0].spend, undefined);
  assert.throws(() => validateAnalyticsRows([...rows, rows[0]]), /Duplicate/);
  assert.throws(() => validateAnalyticsRows([...rows, { date: "2026-11-10", clicks: 1 }]), /one breakdown/);
  assert.throws(() => parseAnalyticsCsv("date,clicks\n2026-02-30,1"), /Row 2/);
  assert.throws(() => parseAnalyticsCsv("date,clicks,clicks\n2026-11-10,1,2"), /unique/);
});

test("ratios use only jointly measured rows and aggregate weighted sums", () => {
  const shared = { date: "2026-11-10", clientId: "c", platform: "Meta Ads", origin: "CSV import" };
  const rows = [{ ...shared, clicks: 10, impressions: 100 }, { ...shared, clicks: 10, impressions: 300 }, { ...shared, impressions: 3000 }];
  assert.deepEqual(metricValue(rows, "ctr"), { value: 5, measured: 2 });
  assert.deepEqual(metricValue([{ ...shared, clicks: 0, impressions: 0 }], "ctr"), { value: null, measured: 1 });
  assert.deepEqual(metricValue(rows, "revenue"), { value: null, measured: 0 });
});

test("reimport replaces a date's full breakdown without deleting other dates", () => {
  const feed = { id: "f", clientId: "c", platform: "Meta Ads", account: "account", report: "Report", method: "CSV import", updatedAt: "now", currency: "INR", grain: "ad" };
  const first = { ...feed, rows: [{ date: "2026-11-09", ad: "A", clicks: 10 }, { date: "2026-11-10", ad: "B", clicks: 11 }] };
  const next = { ...feed, rows: [{ date: "2026-11-10", ad: "C", clicks: 5 }] };
  assert.deepEqual(mergeAnalyticsFeed(first, next).rows, [first.rows[0], next.rows[0]]);
  assert.throws(() => mergeAnalyticsFeed(first, { ...next, currency: "USD" }), /currency/);
});

test("paid totals exclude overlapping ad detail and ad breakdown excludes rollups", () => {
  const common = { date: "2026-11-10", platform: "Meta Ads", source: "CSV import", clicks: 20 };
  const campaign = { id: "cam", clientId: "client", name: "Test", performanceRows: [common, { ...common, adId: "a", clicks: 7 }] };
  assert.equal(metricValue(campaignFacts([campaign], [], [], false), "clicks").value, 20);
  assert.equal(metricValue(campaignFacts([campaign], [], [], true), "clicks").value, 7);
});

test("CRM uses created dates and only links a lead with an unambiguous client", () => {
  const createdAt = "2026-11-10T13:00:00Z";
  const lead = { id: "lead", createdAt };
  const first = { leadId: lead.id, clientId: "client", createdAt };
  assert.equal(crmFacts([lead], [first]).find(r => r.leads === 1).clientId, "client");
  const facts = crmFacts([lead], [first, { ...first, clientId: "other" }]);
  assert.equal(facts.find(r => r.leads === 1).clientId, "");
  assert.equal(metricValue(facts, "deals").value, 2);
});
