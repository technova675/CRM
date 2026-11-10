import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { reportPresentation, reportSpreadsheet } from "./clientReportOffice";
import { reportSections, type ClientReport } from "./domain/clientReporting";

const draft = (report: ClientReport) => report.approved ? "" : "Draft · Internal review";
const title = (report: ClientReport) => report.facts.company + " · " + report.frequency + " performance";
const dates = (report: ClientReport) => report.facts.window.start + " to " + report.facts.window.end;
export const exportFormats = ["pdf", "pptx", "xlsx"] as const;
export type ExportFormat = typeof exportFormats[number];
export const reportMime: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export const reportFilename = (report: ClientReport, format: ExportFormat) => report.frequency.toLowerCase() + "-report-" + report.facts.window.end + "." + format;

export async function reportPDF(report: ClientReport) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all(["Regular", "Bold"].map(async style =>
    document.embedFont(await readFile(join(process.cwd(), "public", "fonts", "NotoSans-" + style + ".ttf")), { subset: true })));
  const chars = new Set(regular.getCharacterSet());
  const purple = rgb(.34,.23,.69);
  const ink = rgb(.15,.17,.22);
  let page = document.addPage([595,842]), y = 789;
  const write = (raw: string, size = 10, heading = false) => {
    const font = heading ? bold : regular;
    const text = raw.replace(/\s+/g, " ").trim();
    if ([...text].some(char => !chars.has(char.codePointAt(0)!))) throw new Error("The PDF font cannot render some report text. Export the Excel or PowerPoint version.");
    const lines: string[] = [];
    let line = "";
    for (const token of text.split(" ")) {
      const next = line ? line + " " + token : token;
      if (font.widthOfTextAtSize(next,size) <= 499) { line = next; continue; }
      if (line) lines.push(line);
      line = "";
      for (const char of token) {
        if (font.widthOfTextAtSize(line + char,size) > 499) { lines.push(line); line = ""; }
        line += char;
      }
    }
    if (line) lines.push(line);
    for (const item of lines) {
      if (y < 57) { page = document.addPage([595,842]); y = 789; }
      page.drawText(item,{ x:48,y,size,font,color:heading ? purple : ink });
      y -= size * 1.55;
    }
    y -= 3;
  };
  write("ADBIBE  /  CLIENT REPORT", 10, true);
  write(title(report), 23, true);
  write(dates(report));
  if (draft(report)) write(draft(report), 10, true);
  for (const section of reportSections(report)) {
    if (y < 100) { page = document.addPage([595,842]); y = 789; }
    y -= 8;
    write(section.title, 14, true);
    for (const row of section.rows) write(row.join("  |  "));
  }
  const pages = document.getPages();
  pages.forEach((p,i) => {
    p.drawLine({ start:{x:48,y:40},end:{x:547,y:40}, color:rgb(.83,.84,.88), thickness:.5 });
    p.drawText("Adbibe  /  " + (i + 1) + " of " + pages.length, { x:48,y:26,size:8,font:regular,color:ink });
  });
  document.setTitle(title(report));
  return document.save();
}

export async function exportClientReport(report: ClientReport, format: ExportFormat): Promise<Uint8Array> {
  if (format === "pdf") return reportPDF(report);
  return format === "xlsx" ? reportSpreadsheet(report) : reportPresentation(report);
}
