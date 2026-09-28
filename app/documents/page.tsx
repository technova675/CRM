"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { Eye, FileStack, FolderOpen, History } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { PageHeader, Readonly, Stat } from "@/components/ui";
import { AssetLibrary } from "@/components/documents/AssetLibrary";
import { fmtSize } from "@/components/documents/assets";

function DocumentsInner() {
  const me = useMe();
  const params = useSearchParams();
  const assets = useCRM((s) => s.assets);
  const isClient = me.role === "client";
  const writable = !isClient && can(me.role, "documents", "write");

  const stats = useMemo(() => {
    const mine = isClient ? assets.filter((a) => a.clientId === me.clientId && a.clientVisible) : assets;
    return {
      total: mine.length,
      shared: mine.filter((a) => a.clientVisible && a.clientId).length,
      versioned: mine.filter((a) => a.versions.length > 1).length,
      size: mine.reduce((a, x) => a + x.sizeKb, 0),
    };
  }, [assets, isClient, me.clientId]);

  return (
    <div>
      <PageHeader
        icon={<FolderOpen className="size-5 text-fg-3" />}
        title={isClient ? "Shared files" : "Documents & Assets"}
        description={isClient ? "Files your agency team has shared with you." : "Central asset library per client — logos, guidelines, creatives, contracts, reports and more. Folders, tags and versions."}
      />
      {!isClient && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Assets" value={stats.total} icon={<FileStack className="size-3.5" />} />
          <Stat label="Shared in client portal" value={stats.shared} icon={<Eye className="size-3.5" />} tone="success" />
          <Stat label="With multiple versions" value={stats.versioned} icon={<History className="size-3.5" />} />
          <Stat label="Library size (metadata)" value={fmtSize(stats.size)} hint="files live in cloud storage" icon={<FolderOpen className="size-3.5" />} />
        </div>
      )}
      {!isClient && !writable && <Readonly>You have read-only access to Documents & Assets.</Readonly>}
      <AssetLibrary initialScope={params.get("client") ?? undefined} />
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsInner />
    </Suspense>
  );
}
