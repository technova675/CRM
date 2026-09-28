"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Eye, FolderOpen, Folders, LayoutGrid, List, Upload } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { ASSET_FOLDERS, type AssetFolder } from "@/lib/types";
import { cn, fmtShort, relTime } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, MemberAvatar, SearchInput, Segmented, Select, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { AssetDrawer } from "./AssetDrawer";
import { FileIcon, fmtSize, legacyItems, uploadFiles, type LibraryItem } from "./assets";

type Scope = string; // client id | "agency" | "all"

export function AssetLibrary({ fixedClientId, initialScope }: { fixedClientId?: string; initialScope?: string }) {
  const me = useMe();
  const assets = useCRM((s) => s.assets);
  const clients = useCRM((s) => s.clients);
  const isClient = me.role === "client";
  const writable = !isClient && can(me.role, "documents", "write");
  const [scopeState, setScope] = useState<Scope>(initialScope ?? "all");
  const scope = isClient ? me.clientId ?? "none" : fixedClientId ?? scopeState;
  const [folder, setFolder] = useState<AssetFolder | "all">("all");
  const [q, setQ] = useState("");
  const [tags, setTagFilter] = useState<string[]>([]);
  const [view, setView] = useState<"grid" | "list">(isClient ? "list" : "grid");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const legacy = useMemo(() => legacyItems(clients), [clients]);
  const inScope = useMemo(() => {
    const all: LibraryItem[] = [...assets, ...legacy];
    return all.filter((a) => {
      if (isClient) return a.clientId === me.clientId && (a.clientVisible || a.legacy);
      if (scope === "all") return true;
      if (scope === "agency") return !a.clientId;
      return a.clientId === scope;
    });
  }, [assets, legacy, isClient, me.clientId, scope]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    inScope.forEach((a) => (m[a.folder] = (m[a.folder] ?? 0) + 1));
    return m;
  }, [inScope]);

  const topTags = useMemo(() => {
    const m = new Map<string, number>();
    inScope.forEach((a) => a.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t);
  }, [inScope]);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inScope
      .filter((a) => (folder === "all" || a.folder === folder) && (!needle || `${a.name} ${a.tags.join(" ")}`.toLowerCase().includes(needle)) && tags.every((t) => a.tags.includes(t)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [inScope, folder, q, tags]);

  const open = openId ? [...assets, ...legacy].find((a) => a.id === openId) : undefined;
  const clientName = (id?: string) => (id ? clients.find((c) => c.id === id)?.company ?? "—" : "Agency");
  const canUpload = writable && scope !== "all";

  const handleFiles = (list: FileList | null) => {
    if (!list?.length) return;
    if (!canUpload) {
      toast("Choose where to upload", "Select a client or the Agency library first.", "warning");
      return;
    }
    const res = uploadFiles(
      Array.from(list).map((f) => ({ name: f.name, size: f.size })),
      scope === "agency" ? undefined : scope,
      folder === "all" ? undefined : folder,
    );
    toast(`${res.added} file${res.added === 1 ? "" : "s"} added${res.versioned ? `, ${res.versioned} new version${res.versioned > 1 ? "s" : ""}` : ""}`, "Metadata saved — connect cloud storage to keep the actual files.");
  };

  const download = () => toast("File storage not connected", "Downloads are available once cloud storage is connected. Ask your account manager for this file.", "info");

  return (
    <div
      onDragOver={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className="relative"
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/80">
          <p className="flex items-center gap-2 text-sm font-medium text-accent-text">
            <Upload className="size-4" /> Drop files to upload to {clientName(scope === "agency" ? undefined : scope)}
            {folder !== "all" ? ` · ${folder}` : ""}
          </p>
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        {!isClient && !fixedClientId && (
          <Select value={scope} onChange={(e) => { setScope(e.target.value); setTagFilter([]); }} className="sm:w-52">
            <option value="all">All libraries</option>
            <option value="agency">Agency library</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
              </option>
            ))}
          </Select>
        )}
        <SearchInput value={q} onChange={setQ} placeholder="Search names and tags…" className="sm:w-64" />
        <div className="flex items-center gap-2 sm:ml-auto">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "grid", label: <LayoutGrid className="size-3.5" /> },
              { value: "list", label: <List className="size-3.5" /> },
            ]}
          />
          {writable && (
            <>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
              <Button variant="primary" icon={<Upload className="size-3.5" />} onClick={() => (canUpload ? fileRef.current?.click() : toast("Choose where to upload", "Select a client or the Agency library first.", "warning"))}>
                Upload
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
        <Card className="h-fit p-1.5">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col">
            {[{ key: "all" as const, label: "All files", n: inScope.length }, ...ASSET_FOLDERS.map((f) => ({ key: f, label: f, n: counts[f] ?? 0 }))].map((f) => (
              <button
                key={f.key}
                onClick={() => setFolder(f.key)}
                className={cn("flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition", folder === f.key ? "bg-accent-soft font-medium text-accent-text" : "text-fg-2 hover:bg-surface-2")}
              >
                {f.key === "all" ? <Folders className="size-3.5" /> : <FolderOpen className="size-3.5" />}
                <span className="flex-1 whitespace-nowrap">{f.label}</span>
                <span className="text-[11px] tabular-nums text-fg-3">{f.n}</span>
              </button>
            ))}
          </nav>
        </Card>

        <div className="min-w-0 space-y-3">
          {topTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {topTags.map((t) => {
                const on = tags.includes(t);
                return (
                  <button key={t} onClick={() => setTagFilter(on ? tags.filter((x) => x !== t) : [...tags, t])} className={cn("rounded-full border px-2 py-0.5 text-[11px]", on ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-2 hover:bg-surface-2")}>
                    #{t}
                  </button>
                );
              })}
              {tags.length > 0 && (
                <button onClick={() => setTagFilter([])} className="text-[11px] text-fg-3 hover:text-fg">
                  Clear
                </button>
              )}
            </div>
          )}

          {items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FolderOpen className="size-5" />}
                title={inScope.length ? "No files match" : isClient ? "No shared files yet" : "This library is empty"}
                description={isClient ? "Your account team will share files here." : canUpload ? "Drag & drop files here or use Upload. Only file metadata is stored." : "Pick a client or the Agency library to upload."}
              />
            </Card>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((a) => (
                <button key={a.id} onClick={() => (isClient ? download() : setOpenId(a.id))} className="text-left">
                  <Card className="h-full p-3 transition hover:border-border-strong hover:shadow-pop">
                    <div className="flex items-start justify-between gap-2">
                      <FileIcon ext={a.ext} />
                      <div className="flex flex-wrap justify-end gap-1">
                        {a.versions.length > 1 && <Badge>v{a.versions[a.versions.length - 1]!.v}</Badge>}
                        {a.legacy && <Badge tone="neutral">Legacy</Badge>}
                        {!isClient && a.clientVisible && a.clientId && !a.legacy && (
                          <span title="Visible in client portal" className="text-success">
                            <Eye className="size-3.5" />
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[13px] font-medium break-words">{a.name}</p>
                    <p className="mt-0.5 text-[11px] text-fg-3">
                      {a.folder} · {a.sizeKb ? fmtSize(a.sizeKb) : a.ext.toUpperCase()}
                    </p>
                    {scope === "all" && !isClient && <p className="mt-0.5 truncate text-[11px] text-fg-3">{clientName(a.clientId)}</p>}
                    <p className="mt-1 text-[11px] text-fg-3">Updated {relTime(a.updatedAt)}</p>
                  </Card>
                </button>
              ))}
            </div>
          ) : (
            <Card>
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    {scope === "all" && !isClient && <Th>Library</Th>}
                    <Th>Folder</Th>
                    <Th>Tags</Th>
                    <Th className="text-right">Size</Th>
                    <Th>Version</Th>
                    {!isClient && <Th>Portal</Th>}
                    <Th>Updated</Th>
                    {isClient && <Th />}
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id} className={cn(!isClient && "cursor-pointer hover:bg-surface-2")} onClick={() => !isClient && setOpenId(a.id)}>
                      <Td className="min-w-56">
                        <span className="flex items-center gap-2">
                          <FileIcon ext={a.ext} size="sm" />
                          <span className="min-w-0 truncate font-medium">{a.name}</span>
                          {a.legacy && <Badge>Legacy</Badge>}
                        </span>
                      </Td>
                      {scope === "all" && !isClient && <Td className="text-xs text-fg-2">{clientName(a.clientId)}</Td>}
                      <Td className="text-fg-2">{a.folder}</Td>
                      <Td className="max-w-48">
                        <span className="flex flex-wrap gap-1">
                          {a.tags.slice(0, 3).map((t) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                        </span>
                      </Td>
                      <Td className="text-right tabular-nums text-fg-2">{a.sizeKb ? fmtSize(a.sizeKb) : "—"}</Td>
                      <Td className="tabular-nums">v{a.versions[a.versions.length - 1]?.v ?? 1}</Td>
                      {!isClient && <Td>{a.clientId ? <Badge tone={a.clientVisible ? "success" : "neutral"}>{a.clientVisible ? "Visible" : "Internal"}</Badge> : <span className="text-xs text-fg-3">—</span>}</Td>}
                      <Td className="whitespace-nowrap text-fg-2">
                        <span className="inline-flex items-center gap-1.5">
                          {!isClient && <MemberAvatar id={a.versions[a.versions.length - 1]?.by ?? a.uploadedBy} size={18} />}
                          {fmtShort(a.updatedAt)}
                        </span>
                      </Td>
                      {isClient && (
                        <Td className="text-right">
                          <Button size="xs" variant="ghost" icon={<Download className="size-3" />} onClick={download}>
                            Download
                          </Button>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
      </div>

      {!isClient && <AssetDrawer key={open?.id} item={open} onClose={() => setOpenId(null)} writable={writable} />}
    </div>
  );
}
