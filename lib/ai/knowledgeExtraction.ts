import "server-only";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import { MAX_KNOWLEDGE_TEXT } from "@/lib/domain/clientKnowledge";

export async function extractKnowledgeText(bytes: Uint8Array, name: string) {
  let text: string;
  if (/\.pdf$/i.test(name)) {
    const require = process.getBuiltinModule("node:module")!.createRequire(resolve("package.json"));
    const moduleUrl = pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href;
    const pdf: typeof import("pdfjs-dist/legacy/build/pdf.mjs") = await import(/* webpackIgnore: true */ moduleUrl);
    const task = pdf.getDocument({data: bytes, stopAtErrors: true});
    try {
      const document = await task.promise;
      const pages: string[] = [];
      let length = 0;
      for (let page = 1; page <= Math.min(document.numPages, 50) && length < MAX_KNOWLEDGE_TEXT; page++) {
        const content = await (await document.getPage(page)).getTextContent();
        const line = content.items.map(item => "str" in item ? item.str : "").join(" ").trim();
        if (line) pages.push("Page " + page + "\n" + line);
        length += line.length;
      }
      text = pages.join("\n\n");
    } finally {
      await task.destroy();
    }
  } else if (/\.docx$/i.test(name)) {
    const xml = unzipSync(bytes, {filter: entry => entry.name === "word/document.xml" && entry.originalSize <= 2_000_000})["word/document.xml"];
    if (!xml) return "";
    const entities: Record<string, string> = {amp:"&", lt:"<", gt:">", quot:'"', apos:"'"};
    text = strFromU8(xml).replace(/<\/w:p>/g, "\n").replace(/<w:tab\s*\/>/g, " ").replace(/<[^>]*>/g, "")
      .replace(/&(amp|lt|gt|quot|apos);/g, (_, key: string) => entities[key]);
  } else {
    text = new TextDecoder("utf-8", {fatal:true}).decode(bytes);
  }
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, MAX_KNOWLEDGE_TEXT);
}
