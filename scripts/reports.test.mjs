import test from "node:test";
import assert from "node:assert/strict";
import { gridToTable, detectCompany, aggregateValues, defaultAggregation, isIdentifier, isTotalLabel, toNumber, tableToCSV } from "../lib/domain/reportFiles.ts";
import { reportWorkspace } from "../lib/reportWorkspace.ts";
import { accountWorkspace, AuthenticationRequiredError } from "../lib/auth/identity.ts";
import { safeReturnPath } from "../lib/auth/redirect.ts";
import { requestOrigin } from "../lib/auth/origin.ts";
import { dashboardSheet, dashboardSeries, dashboardDistribution, latestCompanyReport } from "../lib/domain/workbookDashboard.ts";
import { nat64IPv4, preferReachableAddresses } from "../lib/auth/networkLookup.ts";
import { resilientFetch } from "../lib/auth/resilientFetch.ts";
import readExcelFile from "read-excel-file/node";
import { zipSync, strToU8 } from "fflate";

test("Supabase DNS fallback derives current IPv4 answers without changing native IPv6 addresses",()=>{
  assert.equal(nat64IPv4("64:ff9b::ac40:95f6"),"172.64.149.246");
  assert.equal(nat64IPv4("0064:ff9b:0000:0000:0000:0000:6812:260a"),"104.18.38.10");
  assert.equal(nat64IPv4("64:ff9b::172.64.149.246"),"172.64.149.246");
  assert.equal(nat64IPv4("2001:db8::1"),null); assert.equal(nat64IPv4("invalid"),null);
  const original=[{address:"64:ff9b::ac40:95f6",family:6},{address:"2001:db8::1",family:6}];
  assert.deepEqual(preferReachableAddresses(original),[{address:"172.64.149.246",family:4},...original]);
  assert.equal(original.length,2);
});

test("network recovery retries reads but does not replay account creation or other writes",async(t)=>{
  let calls=0;
  t.mock.method(globalThis,"fetch",async()=>{calls++; if(calls===1) throw new TypeError("fetch failed"); return Response.json({ok:true});});
  assert.equal((await resilientFetch("https://example.com/health")).status,200);
  assert.equal(calls,2);
  calls=0;
  await assert.rejects(resilientFetch("https://example.com/auth/v1/signup",{method:"POST",body:"{}"}),TypeError);
  assert.equal(calls,1);
});

test("workbook dashboard keeps sheets separate, averages rates and preserves zeros", () => {
  const sheet=dashboardSheet({name:"Campaigns",columns:["Channel","Revenue","CTR","Customer ID"],rows:[
    ["Search",100,"10%",123],["Social",0,"20%",456],["Search",null,null,789],["Total",100,"30%",null],[null,null,null,null],
  ]});
  assert.equal(sheet.metrics.length,2); assert.equal(sheet.rows.length,3);
  assert.equal(sheet.metrics[0].value,100); assert.equal(sheet.metrics[0].count,2);
  assert.equal(sheet.metrics[1].mode,"average"); assert.equal(sheet.metrics[1].value,15);
  assert.equal(sheet.totalRows,1);
  assert.deepEqual(dashboardSeries(sheet,sheet.metrics[0],0),[{x:"Search",v:100},{x:"Social",v:0}]);
  assert.equal(dashboardDistribution(sheet,sheet.metrics[0]).reduce((sum,item)=>sum+item.v,0),2);
  const second=dashboardSheet({name:"Independent summary",columns:["Revenue"],rows:[[100]]});
  assert.equal(second.metrics[0].value,100); assert.equal(sheet.metrics[0].value,100);
});

test("dashboard handles currency negatives, missing grouping values and chronological dates",()=>{
  const sheet=dashboardSheet({name:"Dates",columns:["Date","Amount"],rows:[["2026-02-01","₹100"],["2026-01-01","(20)"],[null,"0"]]});
  assert.equal(sheet.date,0); assert.equal(sheet.metrics[0].min,-20);
  assert.deepEqual(dashboardSeries(sheet,sheet.metrics[0],sheet.date),[{x:"2026-01-01",v:-20},{x:"2026-02-01",v:100}]);
  assert.equal(dashboardDistribution(sheet,sheet.metrics[0]).reduce((sum,item)=>sum+item.v,0),3);
});

test("latest company workbook is deterministic and independent of input ordering",()=>{
  const files=[{id:"old",clientId:"a",createdAt:"2026-01-01"},{id:"other",clientId:"b",createdAt:"2026-11-01"},{id:"latest",clientId:"a",createdAt:"2026-10-01"}];
  assert.equal(latestCompanyReport(files,"a").id,"latest");
  assert.equal(latestCompanyReport([...files].reverse(),"a").id,"latest");
  assert.equal(latestCompanyReport(files,"missing"),undefined);
  assert.equal(files[0].id,"old");
});

test("text-only and empty sheets remain part of a dashboard without invented metrics",()=>{
  assert.deepEqual(dashboardSheet({name:"Notes",columns:["Notes"],rows:[["Context"],[null]]}).metrics,[]);
  assert.equal(dashboardSheet({name:"Empty",columns:["Column"],rows:[]}).rows.length,0);
});

test("irregular sheet retains preambles, blanks, duplicate headers and every source cell", () => {
  const input = [["Monthly export"], [], ["Campaign", "Spend", "Spend", "Spend (2)"], ["A", 10, 20, 30], [], ["B", 4, null, 9]];
  const t = gridToTable("Performance", input);
  assert.equal(t.headerRow, 2);
  assert.deepEqual(t.rawRows, input);
  assert.equal(new Set(t.columns).size, 4);
  assert.equal(t.rows.length, 3);
  assert.equal(t.rows[1].length, 4);
  assert.equal(t.rows[1][0], null);
});

test("headerless numeric grids never lose their first data row", () => {
  const t = gridToTable("Numbers", [[1, 2], [3, 4]]);
  assert.equal(t.headerRow, null);
  assert.deepEqual(t.rows, [[1, 2], [3, 4]]);
});

test("explicit header and raw mapping override detection without losing source", () => {
  const raw = [["Title"], ["Group", "Value"], ["x", 3]];
  assert.equal(gridToTable("Custom", raw, 1).columns[0], "Group");
  assert.equal(gridToTable("Custom", raw, null).rows.length, 3);
  assert.deepEqual(gridToTable("Custom", raw, 1).rawRows, raw);
});

test("unsupported size is rejected rather than silently truncated", () => {
  assert.throws(() => gridToTable("Wide", [Array(201).fill("x")]), /exceeds/);
});

test("company detection requires an explicit field and a single company", () => {
  assert.equal(detectCompany([gridToTable("Clients", [["Company", "Spend"], ["User Business", 30]])]), "User Business");
  assert.equal(detectCompany([gridToTable("Clients", [["Client", "Spend"], ["A", 30], ["B", 20]])]), "");
  assert.equal(detectCompany([gridToTable("Unknown", [["Name", "Value"], ["A", 30]])]), "");
});

test("averages, missing values, totals and identifier columns are handled explicitly", () => {
  assert.equal(defaultAggregation("ROAS", ""), "average");
  assert.equal(defaultAggregation("Spend", "₹"), "sum");
  assert.equal(aggregateValues([2, 6], "average"), 4);
  assert.equal(aggregateValues([], "sum"), null);
  assert.equal(isIdentifier("Campaign ID"), true);
  assert.equal(isTotalLabel("Grand total"), true);
  assert.equal(isTotalLabel("Total Fitness Ltd"), false);
  assert.equal(toNumber("₹1,23,456.50"), 123456.5);
  assert.equal(toNumber("(300)"), -300);
});

test("CSV preserves quoted and multiline cells", () => {
  const csv = tableToCSV({ name: "Data", columns: ["Text"], rows: [['a,"b"\nc']] });
  assert.equal(csv, 'Text\n"a,""b""\nc"');
});

test("workspace IDs are accepted only from the correctly formed cookie", () => {
  const token = "a".repeat(64);
  assert.equal(reportWorkspace(new Request("http://localhost?workspace=" + token)), null);
  assert.equal(reportWorkspace(new Request("http://localhost", { headers: { cookie: "adbibe-report-workspace=" + token } })), token);
  assert.equal(reportWorkspace(new Request("http://localhost", { headers: { cookie: "adbibe-report-workspace=bad" } })), null);
});

test("account workspace is stable across devices and return paths cannot redirect off-site", () => {
  const id="12345678-1234-1234-1234-123456789abc";
  assert.equal(accountWorkspace(id),accountWorkspace(id.toUpperCase()));
  assert.match(accountWorkspace(id),/^[a-f0-9]{64}$/);
  assert.throws(()=>accountWorkspace("u_admin"),AuthenticationRequiredError);
  assert.equal(safeReturnPath("/reports?file=example"),"/reports?file=example");
  for(const path of ["//evil.test","https://evil.test","/\\evil.test","/\n/evil.test",null]) assert.equal(safeReturnPath(path),"/reports");
});

test("authentication callbacks retain the external HTTPS origin behind a local tunnel", () => {
  assert.equal(requestOrigin(new Request("http://localhost:3012/auth/callback")),"http://localhost:3012");
  assert.equal(requestOrigin(new Request("http://localhost:3012/auth/callback",{headers:{"x-forwarded-host":"app.example.com","x-forwarded-proto":"https"}})),"https://app.example.com");
  assert.equal(requestOrigin(new Request("http://localhost:3012/auth/callback",{headers:{"x-forwarded-host":"bad.example/path"}})),"http://localhost:3012");
});

test("real Excel reader reads multiple sheets, preambles and empty cells", async () => {
  const files = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Metrics" sheetId="1" r:id="rId1"/><sheet name="Numbers" sheetId="2" r:id="rId2"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Export title</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Campaign</t></is></c><c r="B3" t="inlineStr"><is><t>Spend</t></is></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>User campaign</t></is></c><c r="B4"><v>42</v></c></row></sheetData></worksheet>',
    "xl/worksheets/sheet2.xml": '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c></row></sheetData></worksheet>',
  };
  const buffer = Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));
  const sheets = await readExcelFile(buffer);
  assert.equal(sheets.length, 2);
  const t = gridToTable(sheets[0].sheet, sheets[0].data);
  assert.equal(t.headerRow, 2);
  assert.equal(t.rows[0][1], 42);
  assert.equal(gridToTable(sheets[1].sheet, sheets[1].data).rows[0][0], 1);
});

import { reportView } from '../lib/domain/reportView.ts';
import { worksheetIssues } from '../lib/domain/excelDiagnostics.ts';

test('clean report view hides only fully empty rows and columns, retaining zeros and source data', () => {
  const source = { name: 'Data', columns: ['Group', 'Value', 'Empty'], rows: [['A', 0, null], [null, null, null], ['B', null, '  ']] };
  const clean = reportView(source);
  assert.deepEqual(clean.columns, ['Group', 'Value']);
  assert.deepEqual(clean.rows, [['A', 0], ['B', null]]);
  assert.equal(clean.hiddenRows, 1);
  assert.equal(clean.hiddenColumns, 1);
  assert.equal(clean.missingCells, 1);
  assert.equal(source.rows.length, 3);
  assert.deepEqual(reportView(source, true).rows, source.rows);
  assert.deepEqual(reportView(source, true).columns, source.columns);
});

test('empty and headers-only worksheets produce an explicit empty view', () => {
  const clean = reportView({ name: 'Empty', columns: ['A', 'B'], rows: [[null, null]] });
  assert.equal(clean.rows.length, 0);
  assert.equal(clean.columns.length, 0);
  assert.equal(clean.missingCells, 0);
});

test('Excel diagnostics flag uncached formulas and cell errors but accept zero results', () => {
  const issues = worksheetIssues('sheet1', [
    { address: 'A1', type: null, formula: true, value: null },
    { address: 'A2', type: 'e', formula: true, value: '#DIV/0!' },
    { address: 'A3', type: null, formula: true, value: '0' },
    { address: 'A4', type: null, formula: false, value: null },
    { address: 'A5', type: 'e', formula: false, value: '#REF!' },
  ]);
  assert.deepEqual(issues.map((issue) => issue.cell), ['A1', 'A2', 'A5']);
});

import { reportShares } from '../lib/domain/reportView.ts';
import { MAX_UPLOAD_FILE_BYTES, REPORT_CHUNK_BYTES, rowChunkRanges, validateUploadSize } from '../lib/domain/reportTransfer.ts';
test('200 MB upload boundary and Unicode row chunking retain every source row', () => {
  assert.equal(MAX_UPLOAD_FILE_BYTES, 200_000_000);
  assert.doesNotThrow(() => validateUploadSize(200_000_000));
  assert.throws(() => validateUploadSize(200_000_001), /200 MB/);
  assert.throws(() => validateUploadSize(0), /200 MB/);
  const rows = Array.from({ length: 5000 }, (_, i) => [i, 'द'.repeat(100)]);
  const ranges = rowChunkRanges(rows);
  assert.ok(ranges.length > 1);
  assert.deepEqual(ranges.flatMap(({start,end}) => rows.slice(start,end)), rows);
  for (const {start,end} of ranges) assert.ok(Buffer.byteLength(JSON.stringify(rows.slice(start,end))) <= REPORT_CHUNK_BYTES);
  assert.deepEqual(rowChunkRanges([]), []);
});
test('donut combines all remaining groups without truncating the total or changing the source', () => {
  const points = Array.from({ length: 20 }, (_, i) => ({ x: `Group ${i}`, v: i }));
  const shares = reportShares(points);
  assert.equal(shares.length, 6);
  assert.equal(shares[0].v, 19);
  assert.equal(shares[5].x, 'Other groups (combined)');
  assert.equal(shares.reduce((n, d) => n + d.v, 0), 190);
  assert.equal(points[0].v, 0);
  assert.equal(reportShares(points.slice(0, 6)).length, 6);
});
