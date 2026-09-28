"use client";

import { File, FileArchive, FileImage, FileSpreadsheet, FileText, FileVideo, Presentation } from "lucide-react";
import { useCRM } from "@/lib/store";
import { ASSET_FOLDERS, type Asset, type AssetFolder, type Client } from "@/lib/types";
import { cn, uid } from "@/lib/utils";

// Helpers + actions for the Documents & Assets module. Only metadata is ever persisted
// (name, extension, size) — never file contents.

export type LibraryItem = Asset & { legacy?: boolean };

const S = () => useCRM.getState();

export function extOf(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1]!.toLowerCase() : "file";
}

export function kindOf(ext: string): "image" | "video" | "pdf" | "sheet" | "slides" | "archive" | "doc" | "other" {
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "heic", "psd", "ai", "fig"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  if (["xlsx", "xls", "csv", "numbers"].includes(ext)) return "sheet";
  if (["pptx", "ppt", "key"].includes(ext)) return "slides";
  if (["zip", "rar", "7z"].includes(ext)) return "archive";
  if (["doc", "docx", "txt", "md", "rtf", "pages"].includes(ext)) return "doc";
  return "other";
}

export function FileIcon({ ext, size = "md" }: { ext: string; size?: "sm" | "md" | "lg" }) {
  const k = kindOf(ext);
  const Icon = k === "image" ? FileImage : k === "video" ? FileVideo : k === "sheet" ? FileSpreadsheet : k === "slides" ? Presentation : k === "archive" ? FileArchive : k === "pdf" || k === "doc" ? FileText : File;
  const tone = k === "image" ? "text-info bg-info-soft" : k === "video" ? "text-danger bg-danger-soft" : k === "pdf" ? "text-warning bg-warning-soft" : k === "sheet" ? "text-success bg-success-soft" : k === "slides" ? "text-accent-text bg-accent-soft" : "text-fg-3 bg-surface-2";
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-lg", tone, size === "sm" ? "size-7" : size === "md" ? "size-9" : "size-14")}>
      <Icon className={size === "lg" ? "size-7" : size === "md" ? "size-4.5" : "size-3.5"} />
    </span>
  );
}

export const fmtSize = (kb: number) => (kb >= 1024 * 1024 ? `${(kb / 1024 / 1024).toFixed(1)} GB` : kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`);

export function guessFolder(name: string, fallback?: AssetFolder): AssetFolder {
  const n = name.toLowerCase();
  const k = kindOf(extOf(name));
  if (/logo/.test(n)) return "Logos";
  if (/guideline|brand ?book|style ?guide/.test(n)) return "Brand guidelines";
  if (/contract|agreement|msa|sow|nda|statement of work/.test(n)) return "Contracts";
  if (/proposal/.test(n)) return "Proposals";
  if (/report|audit/.test(n)) return "Reports";
  if (/strategy|plan|brief|keyword map/.test(n)) return "Strategy";
  if (fallback) return fallback;
  if (k === "video") return "Videos";
  if (k === "image") return /ad|creative|static|story|carousel|banner/.test(n) ? "Creatives" : "Images";
  if (k === "slides") return "Presentations";
  return "Strategy";
}

const LEGACY_FOLDER: Record<string, AssetFolder> = { Contract: "Contracts", Proposal: "Proposals", "Brand asset": "Brand guidelines", Report: "Reports", Invoice: "Contracts" };

// Existing client.documents entries surface as read-only library items.
export function legacyItems(clients: Client[]): LibraryItem[] {
  return clients.flatMap((c) =>
    c.documents.map((d, i) => ({
      id: `legacy_${c.id}_${i}`,
      clientId: c.id,
      name: d.name,
      folder: LEGACY_FOLDER[d.kind] ?? guessFolder(d.name),
      ext: extOf(d.name),
      sizeKb: 0,
      tags: [d.kind.toLowerCase()],
      versions: [{ v: 1, at: d.addedAt, by: c.accountManagerId, note: "Added from client profile" }],
      uploadedBy: c.accountManagerId,
      createdAt: d.addedAt,
      updatedAt: d.addedAt,
      clientVisible: true,
      legacy: true,
    })),
  );
}

export function uploadFiles(files: { name: string; size: number }[], clientId: string | undefined, folder?: AssetFolder) {
  const me = S().currentUserId;
  const now = new Date().toISOString();
  let added = 0;
  let versioned = 0;
  files.forEach((f) => {
    const target = folder ?? guessFolder(f.name);
    const sizeKb = Math.max(1, Math.ceil(f.size / 1024));
    const existing = S().assets.find((a) => a.clientId === clientId && a.name === f.name);
    if (existing) {
      addVersion(existing.id, "Re-uploaded with the same name", sizeKb);
      versioned++;
      return;
    }
    const asset: Asset = { id: uid("as"), clientId, name: f.name, folder: target, ext: extOf(f.name), sizeKb, tags: [], versions: [{ v: 1, at: now, by: me, note: "Initial upload" }], uploadedBy: me, createdAt: now, updatedAt: now, clientVisible: false };
    S().upsert("assets", asset);
    S().log({ actor: "human", actorId: me, entity: "document", entityId: asset.id, action: "Uploaded asset", detail: `${f.name} → ${target}${clientId ? ` · ${S().clients.find((c) => c.id === clientId)?.company ?? ""}` : " · Agency library"}` });
    added++;
  });
  return { added, versioned };
}

export function addVersion(id: string, note: string, sizeKb?: number) {
  const a = S().assets.find((x) => x.id === id);
  if (!a) return;
  const me = S().currentUserId;
  const now = new Date().toISOString();
  const v = (a.versions[a.versions.length - 1]?.v ?? 0) + 1;
  S().patch("assets", id, { versions: [...a.versions, { v, at: now, by: me, note: note || `Version ${v}` }], updatedAt: now, ...(sizeKb ? { sizeKb } : {}) });
  S().log({ actor: "human", actorId: me, entity: "document", entityId: id, action: "Uploaded new version", detail: `${a.name} · v${v}${note ? ` — ${note}` : ""}`, before: `v${v - 1}`, after: `v${v}` });
}

export function setTags(id: string, tags: string[]) {
  S().patch("assets", id, { tags, updatedAt: new Date().toISOString() }, { entity: "document", action: "Edited tags", field: "tags" });
}

export function setClientVisible(id: string, v: boolean) {
  S().patch("assets", id, { clientVisible: v }, { entity: "document", action: v ? "Shared in client portal" : "Hidden from client portal", field: "clientVisible" });
}

export function moveFolder(id: string, folder: AssetFolder) {
  S().patch("assets", id, { folder }, { entity: "document", action: "Moved asset", field: "folder" });
}

export function deleteAsset(id: string) {
  const a = S().assets.find((x) => x.id === id);
  if (!a) return;
  S().remove("assets", id);
  S().log({ actor: "human", actorId: S().currentUserId, entity: "document", entityId: id, action: "Deleted asset", detail: a.name });
}

export { ASSET_FOLDERS };
