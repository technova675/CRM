"use client";

import { useRef, useState } from "react";
import { Download, Eye, History, Tag, Trash2, Upload, X } from "lucide-react";
import { useCRM } from "@/lib/store";
import { ASSET_FOLDERS, type AssetFolder } from "@/lib/types";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { Badge, Button, Drawer, Field, Input, MemberAvatar, Select, Toggle } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { addVersion, deleteAsset, FileIcon, fmtSize, moveFolder, setClientVisible, setTags, type LibraryItem } from "./assets";

export function AssetDrawer({ item, onClose, writable }: { item?: LibraryItem; onClose: () => void; writable: boolean }) {
  const clients = useCRM((s) => s.clients);
  const [tag, setTag] = useState("");
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  if (!item) return null;
  const editable = writable && !item.legacy;
  const client = clients.find((c) => c.id === item.clientId);
  const latest = item.versions[item.versions.length - 1];

  const addTag = () => {
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t || item.tags.includes(t)) return setTag("");
    setTags(item.id, [...item.tags, t]);
    setTag("");
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width={520}
      title={item.name}
      subtitle={`${client?.company ?? "Agency library"} · ${item.folder}${item.legacy ? " · from client profile (read-only)" : ""}`}
      footer={
        <>
          <Button variant="ghost" icon={<Download className="size-3.5" />} onClick={() => toast("File storage not connected", "Connect Google Drive / cloud storage in Integrations to download the actual file. Only metadata is stored here.", "info")}>
            Download
          </Button>
          {editable && (
            <Button
              variant="danger"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => {
                if (!confirm(`Delete “${item.name}” and all its versions?`)) return;
                deleteAsset(item.id);
                onClose();
                toast("Asset deleted", item.name);
              }}
            >
              Delete
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <FileIcon ext={item.ext} size="lg" />
          <div className="grid flex-1 grid-cols-2 gap-2 text-[13px]">
            <div>
              <p className="text-[11px] text-fg-3">Type</p>
              <p className="font-medium uppercase">{item.ext}</p>
            </div>
            <div>
              <p className="text-[11px] text-fg-3">Size</p>
              <p className="font-medium">{item.sizeKb ? fmtSize(item.sizeKb) : "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-fg-3">Uploaded by</p>
              <MemberAvatar id={item.uploadedBy} showName size={18} />
            </div>
            <div>
              <p className="text-[11px] text-fg-3">Updated</p>
              <p className="font-medium">{fmtDate(item.updatedAt)}</p>
            </div>
          </div>
        </div>

        {editable && (
          <Field label="Folder">
            <Select value={item.folder} onChange={(e) => moveFolder(item.id, e.target.value as AssetFolder)}>
              {ASSET_FOLDERS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          </Field>
        )}

        {item.clientId && !item.legacy && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <Eye className="size-3.5 text-fg-3" /> Visible in client portal
              </p>
              <p className="text-xs text-fg-3">{item.clientVisible ? `${client?.company} users can see and request this file.` : "Internal only — hidden from the client."}</p>
            </div>
            {editable ? <Toggle checked={item.clientVisible} onChange={(v) => setClientVisible(item.id, v)} label="Visible in client portal" /> : <Badge tone={item.clientVisible ? "success" : "neutral"}>{item.clientVisible ? "Visible" : "Internal"}</Badge>}
          </div>
        )}

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-2">
            <Tag className="size-3.5" /> Tags
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {item.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-2">
                {t}
                {editable && (
                  <button onClick={() => setTags(item.id, item.tags.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="text-fg-3 hover:text-fg">
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
            {!item.tags.length && <span className="text-xs text-fg-3">No tags</span>}
          </div>
          {editable && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addTag();
              }}
            >
              <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add tag, e.g. diwali" className="flex-1" />
              <Button type="submit" size="sm">Add</Button>
            </form>
          )}
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-2">
            <History className="size-3.5" /> Versions <span className="text-fg-3">· current v{latest?.v ?? 1}</span>
          </p>
          <ol className="space-y-2">
            {[...item.versions].reverse().map((v) => (
              <li key={v.v} className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2">
                <Badge tone={v.v === latest?.v ? "accent" : "neutral"}>v{v.v}</Badge>
                <div className="min-w-0 flex-1 text-[13px]">
                  <p className="text-fg-2">{v.note}</p>
                  <p className="text-[11px] text-fg-3">{fmtDateTime(v.at)}</p>
                </div>
                <MemberAvatar id={v.by} size={18} />
              </li>
            ))}
          </ol>
          {editable && (
            <div className="mt-3 space-y-2 rounded-lg border border-dashed border-border-strong p-3">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed? e.g. Updated colours per feedback" />
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  addVersion(item.id, note.trim() || (f ? `Uploaded ${f.name}` : ""), f ? Math.max(1, Math.ceil(f.size / 1024)) : undefined);
                  setNote("");
                  e.target.value = "";
                  toast("New version uploaded", item.name);
                }}
              />
              <Button size="sm" icon={<Upload className="size-3.5" />} onClick={() => fileRef.current?.click()}>
                Upload new version
              </Button>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
