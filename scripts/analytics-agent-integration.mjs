import assert from "node:assert/strict";
import { createTestAccount, TestBrowser } from "./reportAuthFixture.mjs";
import { campaignBrowser } from "./campaignBrowser.mjs";

const request = (api, path, data, method = "POST") => api.request(path, {
  method, headers: { "content-type": "application/json" }, body: JSON.stringify(data),
});
let account, other, browser;
try {
  account = await createTestAccount();
  other = await createTestAccount();
  const api = new TestBrowser(), outsider = new TestBrowser();
  await Promise.all([api.signIn(account), outsider.signIn(other)]);
  const path = "/api/crm/library";
  const library = await (await api.request(path)).json();
  const empty = await (await outsider.request(path)).json();
  assert.equal((await request(outsider, path, { ...empty, operationId: crypto.randomUUID() }, "PUT")).status, 200);
  library.data.clients = [{ id: "agent-client", company: "Synthetic Analytics", industry: "Software", location: "Pune",
    website: "https://example.com", contacts: [], services: ["Meta Ads"], retainer: 0, contractStart: "", contractEnd: "",
    accountManagerId: account.id, health: "Healthy", onboarding: [], createdAt: new Date().toISOString(), documents: [] }];
  assert.equal((await request(api, path, { ...library, operationId: crypto.randomUUID() }, "PUT")).status, 200);
  const csv = "date,spend,conversions,clicks,creative,audience,placement,landingPage\n2026-11-08,1000,10,100,Short video,Prospects,Feed,Product\n2026-11-09,1270,10,200,Short video,Prospects,Feed,Product";
  const upload = await request(api, "/api/analytics", {
    action: "import", operationId: crypto.randomUUID(), currency: "INR", csv,
    feed: { clientId: "agent-client", platform: "Meta Ads", account: "synthetic", report: "Synthetic daily ads" },
  });
  assert.equal(upload.status, 200, await upload.clone().text());
  const { id } = await upload.json();
  const investigate = "/api/analytics/investigate";
  const input = { source: id, clientId: "All", metric: "cpa", days: 1, end: "", explain: false };
  assert.equal((await request(new TestBrowser(), investigate, input)).status, 401);
  assert.equal((await request(outsider, investigate, input)).status, 404);
  const preview = await (await request(api, investigate, input)).json();
  assert.equal(preview.brief.primary.delta, 27);
  assert.equal(preview.narrative, undefined);
  const partial = await (await request(api, investigate, { ...input, days: 7, explain: true })).json();
  assert.equal(partial.brief.comparable, false);
  assert.equal(partial.narrative, undefined);

  browser = await campaignBrowser();
  await browser.command("Network.enable");
  await browser.command("Network.setCookies", { cookies: [...api.cookies].map(([name, value]) => ({ name, value, url: api.base })) });
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await browser.command("Page.navigate", { url: api.base + "/analytics?tab=insights&feed=" + id });
  await browser.wait('document.body.innerText.includes("Investigate a metric")', 60000);
  await browser.fill("Days per window", "1");
  await browser.click("Review measured evidence");
  await browser.wait('document.body.innerText.includes("CPA increased 27%")');
  assert.equal(await browser.evaluate('document.body.innerText.includes("Competition data is unavailable")'), true);
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  assert.equal(await browser.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  console.log("PASS: synthetic browser evidence, exact CPA change, attribution gaps, incomplete coverage, mobile layout and account isolation.");
  if (process.env.ANALYTICS_TEST_LIVE === "1") {
    await browser.wait('Array.from(document.querySelectorAll("button")).some(b => b.textContent === "Run AI investigation" && !b.disabled)');
    await browser.click("Run AI investigation");
    await browser.wait('document.body.innerText.includes("What should we test?") || document.body.innerText.includes("AI explanation could not be completed")', 85000);
    assert.equal(await browser.evaluate('document.body.innerText.includes("What should we test?")'), true, "AI provider returned no valid narrative");
    assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("a[href^=\x27#analytics-\x27]")).every(a => !!document.getElementById(a.hash.slice(1)))'), true);
    assert.equal(await browser.evaluate('document.body.innerText.includes("Why might it have happened?") && document.body.innerText.includes("priority")'), true);
    assert.equal(await browser.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    console.log("PASS: live AI generated cited hypotheses, prioritized recommendations and experiments from synthetic aggregates.");
  }
} finally {
  await browser?.close();
  await Promise.all([account?.remove(), other?.remove()]);
}
