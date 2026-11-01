import test from "node:test";
import assert from "node:assert/strict";
import { pdfToTables } from "../lib/domain/pdfTables.ts";
import { fileKind } from "../lib/domain/reportFiles.ts";

// Builds a small text PDF: each page is a list of [x, y, text] using Helvetica 10 pt.
function buildPdf(pages) {
  const objects = [];
  const add = (body) => objects.push(body) && objects.length;
  const catalog = add("");
  const tree = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids = pages.map((texts) => {
    const stream = texts.map(([x, y, text]) => `BT /F1 10 Tf ${x} ${y} Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`).join("\n");
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`);
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objects[tree - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

async function read(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const content = await (await doc.getPage(number)).getTextContent();
    pages.push({ number, items: content.items.flatMap((item) => "str" in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5], w: item.width, h: item.height || Math.abs(item.transform[3]) }] : []) });
  }
  return pages;
}

const row = (y, ...cells) => cells.map(([x, text]) => [x, y, text]);
const header = (y) => row(y, [72, "Campaign"], [230, "Spend"], [320, "Clicks"], [400, "Leads"]);

test("a PDF is a supported report type", () => {
  assert.deepEqual(fileKind("Monthly.PDF"), { kind: "pdf" });
});

test("tables are recovered from layout and prose is left out of them", async () => {
  const bytes = buildPdf([[
    [72, 740, "Monthly performance summary"],
    [72, 722, "This report covers the month of October for all active campaigns."],
    ...header(680),
    ...row(664, [72, "Brand Search"], [230, "12,400"], [320, "980"], [400, "64"]),
    ...row(648, [72, "Retargeting"], [230, "8,100"], [320, "1,420"], [400, "81"]),
    ...row(632, [72, "Lookalike Audience"], [230, "15,900"], [320, "2,210"], [400, "97"]),
    [72, 580, "Figures are in rupees."],
  ]]);
  const tables = pdfToTables(await read(bytes));
  assert.equal(tables.length, 1);
  const [table] = tables;
  assert.equal(table.name, "Page 1 · Table");
  assert.deepEqual(table.columns, ["Campaign", "Spend", "Clicks", "Leads"]);
  assert.deepEqual(table.rows, [["Brand Search", "12,400", "980", "64"], ["Retargeting", "8,100", "1,420", "81"], ["Lookalike Audience", "15,900", "2,210", "97"]]);
});

test("a table that continues on the next page stays one table and drops the repeated header", async () => {
  const bytes = buildPdf([
    [...header(700), ...row(684, [72, "Alpha"], [230, "1"], [320, "2"], [400, "3"]), ...row(668, [72, "Beta"], [230, "4"], [320, "5"], [400, "6"])],
    [...header(700), ...row(684, [72, "Gamma"], [230, "7"], [320, "8"], [400, "9"])],
  ]);
  const tables = pdfToTables(await read(bytes));
  assert.equal(tables.length, 1);
  assert.equal(tables[0].name, "Pages 1–2 · Table");
  assert.deepEqual(tables[0].rows.map((r) => r[0]), ["Alpha", "Beta", "Gamma"]);
});

test("a PDF with no tables imports its text instead of nothing", async () => {
  const bytes = buildPdf([[[72, 720, "Quarterly review"], [72, 708, "Revenue grew steadily across every region."], [72, 650, "Next steps follow below."]]]);
  const tables = pdfToTables(await read(bytes));
  assert.equal(tables.length, 1);
  assert.equal(tables[0].name, "PDF text");
  assert.deepEqual(tables[0].columns, ["Page", "Text"]);
  assert.match(String(tables[0].rows[0][1]), /Quarterly review Revenue grew steadily/);
  assert.equal(tables[0].rows.length, 2);
});

test("an empty PDF page set produces no tables", () => {
  assert.deepEqual(pdfToTables([{ number: 1, items: [] }]), []);
});
