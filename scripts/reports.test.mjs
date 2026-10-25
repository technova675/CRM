import test from "node:test";
import assert from "node:assert/strict";
import { gridToTable, detectCompany, aggregateValues, defaultAggregation, isIdentifier, isTotalLabel, toNumber, tableToCSV } from "../lib/domain/reportFiles.ts";
import { reportWorkspace } from "../lib/reportWorkspace.ts";
import readExcelFile from "read-excel-file/node";
import { zipSync, strToU8 } from "fflate";

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
