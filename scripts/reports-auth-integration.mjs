import assert from "node:assert/strict";
import { supabaseRequest } from "../lib/db.ts";
import { saveReportFile } from "../lib/reportsRepository.ts";
import { gridToTable } from "../lib/domain/reportFiles.ts";
import { createTestAccount, TestBrowser } from "./reportAuthFixture.mjs";

const endpoint = "/api/reports/uploads";
const company = `Account verification ${crypto.randomUUID()}`;
const files = [];
let owner, other;
const fixture = { companyName: company, name: "verification.csv", kind: "csv", size: 5, uploadedBy: "Test", originalBase64: "aGVsbG8=", tables: [gridToTable("Data", [["Value"], [0], [null], [5]]),gridToTable("Headerless", [[1,2],[3,4]])] };
try {
  const anonymous = new TestBrowser();
  assert.equal((await anonymous.request(endpoint)).status, 401);
  assert.equal((await anonymous.request(endpoint, { headers: { "x-user-id": crypto.randomUUID() } })).status, 401);
  owner = await createTestAccount(); other = await createTestAccount();
  const laptopA = new TestBrowser(), laptopB = new TestBrowser(), differentAccount = new TestBrowser();
  await laptopA.signIn(owner); await laptopB.signIn(owner); await differentAccount.signIn(other);
  assert.ok(laptopA.lastSetCookies.some((cookie) => cookie.includes("auth-token") && /httponly/i.test(cookie)), "Session tokens are HttpOnly");
  const csrf = await laptopA.request("/api/auth", { method: "POST", headers: { origin: "https://untrusted.example", "content-type": "application/json" }, body: JSON.stringify({ action: "signout" }) });
  assert.equal(csrf.status,403);
  const session = await laptopA.request("/api/auth");
  assert.equal((await session.json()).user.id, owner.id);
  const saved = await laptopA.request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fixture) });
  assert.equal(saved.status, 201, JSON.stringify(await saved.clone().json()));
  const id = (await saved.json()).id; files.push(id);
  assert.equal((await laptopB.request(`${endpoint}/${id}`)).status, 200);
  const invalid = await laptopA.request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...fixture, companyName: " " }) });
  assert.equal(invalid.status,400);
  const library = (await (await laptopB.request(endpoint)).json()).files;
  assert.ok(library.some((file) => file.id === id));
  assert.equal((await differentAccount.request(`${endpoint}/${id}`)).status, 404);
  assert.equal((await differentAccount.request(`${endpoint}/${id}`, { method: "DELETE" })).status, 404);
  assert.deepEqual((await (await differentAccount.request(endpoint)).json()).files, []);
  const [stored] = await supabaseRequest("report_files", { query: { select: "owner_id,original_base64,uploaded_by", id: `eq.${id}` } });
  assert.equal(stored.owner_id, owner.id);
  assert.equal(stored.original_base64, fixture.originalBase64);
  assert.equal(stored.uploaded_by, owner.email);

  // A disposable old-style upload models the cookie already present on the client laptop.
  const legacy = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const oldId = `rf_${crypto.randomUUID()}`; files.push(oldId);
  await saveReportFile(legacy, oldId, fixture);
  laptopA.cookies.set("adbibe-report-workspace", legacy);
  assert.equal((await (await laptopA.request("/api/reports/account")).json()).legacyCount, 1);
  const linked = await laptopA.request("/api/reports/account", { method: "POST" });
  assert.equal(linked.status, 200, JSON.stringify(await linked.clone().json()));
  assert.equal((await linked.json()).linked, 1);
  assert.ok(!laptopA.cookies.has("adbibe-report-workspace"));
  const linkedFile = await laptopB.request(`${endpoint}/${oldId}`);
  assert.equal(linkedFile.status, 200);
  assert.deepEqual((await linkedFile.json()).file.tables[0].rawRows, fixture.tables[0].rawRows);
  differentAccount.cookies.set("adbibe-report-workspace", legacy);
  assert.equal((await differentAccount.request("/api/reports/account", { method: "POST" })).status, 403);
  assert.equal((await differentAccount.request(`${endpoint}/${oldId}`)).status, 404);
  const logout = await laptopA.request("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "signout" }) });
  assert.equal(logout.status, 200);
  assert.equal((await laptopA.request(endpoint)).status, 401);
  assert.equal((await laptopB.request(`${endpoint}/${id}`)).status, 200);
  console.log("PASS: verified login, two independent sessions sharing one account, cross-account denial, legacy report linking, source preservation, cookie clearing and local sign-out.");
} finally {
  for (const id of files) await supabaseRequest("report_files", { method: "DELETE", query: { id: `eq.${id}` } });
  await supabaseRequest("report_companies", { method: "DELETE", query: { name: `eq.${company}` } });
  if (owner) await owner.remove(); if (other) await other.remove();
  console.log("Disposable verification accounts and reports cleaned up.");
}
