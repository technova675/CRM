"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ArrowRight, CalendarClock, ExternalLink, Palette, Plus, Search, Target, Users } from "lucide-react";
import { useCRM } from "@/lib/store";
import type { Client, CreativeStatus } from "@/lib/types";
import { movement } from "@/lib/ai/seo";
import { compact, compactMoney, isPast, fmtDateTime, fmtShort, relTime, sum } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, EmptyState, StatusBadge, Table, Td, Th } from "@/components/ui";
import { startProject } from "@/components/seo/actions";

const CREATIVE_TONE: Record<CreativeStatus, "neutral" | "info" | "warning" | "success" | "danger" | "accent"> = {
  Draft: "neutral", "Internal Review": "info", "Client Review": "warning", "Changes Requested": "danger", Approved: "success", Live: "accent", Archived: "neutral",
};
export const CLIENT_VISIBLE_CREATIVE: CreativeStatus[] = ["Client Review", "Changes Requested", "Approved", "Live"];

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-fg-3">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </Card>
  );
}

export function CreativeTab({ client, isClient }: { client: Client; isClient: boolean }) {
  const all = useCRM((s) => s.creatives);
  const creatives = useMemo(
    () => all.filter((c) => c.clientId === client.id && (!isClient || CLIENT_VISIBLE_CREATIVE.includes(c.status))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [all, client.id, isClient],
  );
  const pending = creatives.filter((c) => c.status === "Client Review").length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label="Creatives" value={creatives.length} />
        <Mini label={isClient ? "Awaiting your approval" : "In client review"} value={pending} />
        <Mini label="Approved / live" value={creatives.filter((c) => c.status === "Approved" || c.status === "Live").length} />
        <Mini label="Changes requested" value={creatives.filter((c) => c.status === "Changes Requested").length} />
      </div>
      <Card>
        <CardHeader title="Creatives" action={<Button href="/creative" size="xs" variant="ghost" icon={<Palette className="size-3" />}>Open Creative Studio</Button>} />
        {creatives.length === 0 ? (
          <EmptyState title="No creatives yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Creative</Th>
                <Th>Type</Th>
                <Th>Platform · format</Th>
                <Th>Status</Th>
                <Th>Version</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {creatives.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2">
                  <Td>
                    <Link href={`/creative?c=${c.id}`} className="font-medium hover:underline">
                      {c.title}
                    </Link>
                    {!isClient && c.aiGenerated && <Badge tone="accent" className="ml-1.5">AI</Badge>}
                  </Td>
                  <Td className="text-fg-2">{c.type}</Td>
                  <Td className="text-xs text-fg-2">{c.platform} · {c.format}</Td>
                  <Td><Badge tone={CREATIVE_TONE[c.status]} dot>{c.status}</Badge></Td>
                  <Td className="tabular-nums">v{c.versions.length}</Td>
                  <Td className="text-fg-2">{relTime(c.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export function SocialTab({ client }: { client: Client }) {
  const all = useCRM((s) => s.socialPosts);
  const posts = useMemo(() => all.filter((p) => p.clientId === client.id), [all, client.id]);
  const upcoming = useMemo(() => posts.filter((p) => p.stage !== "Published" && p.scheduledAt && !isPast(p.scheduledAt)).sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!)), [posts]);
  const published = useMemo(() => posts.filter((p) => p.stage === "Published").sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")), [posts]);
  const withMetrics = published.filter((p) => p.metrics);
  const reach = sum(withMetrics.map((p) => p.metrics!.reach));
  const er = withMetrics.length ? sum(withMetrics.map((p) => p.metrics!.er)) / withMetrics.length : 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label="Scheduled / upcoming" value={upcoming.length} />
        <Mini label="Awaiting approval" value={posts.filter((p) => p.stage === "Awaiting Approval").length} />
        <Mini label="Published" value={published.length} />
        <Mini label="Avg. engagement" value={withMetrics.length ? `${er.toFixed(1)}%` : "—"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Upcoming posts" action={<Button href={`/social?client=${client.id}`} size="xs" variant="ghost" icon={<CalendarClock className="size-3" />}>Open calendar</Button>} />
          {upcoming.length === 0 ? (
            <p className="px-4 pb-4 text-xs text-fg-3">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
                  <Badge>{p.platform}</Badge>
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  <StatusBadge status={p.stage} />
                  <span className="whitespace-nowrap text-xs text-fg-3">{fmtDateTime(p.scheduledAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recently published" subtitle={withMetrics.length ? `${compact(reach)} total reach` : undefined} />
          {published.length === 0 ? (
            <p className="px-4 pb-4 text-xs text-fg-3">No published posts yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {published.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
                  <Badge>{p.platform}</Badge>
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  {p.metrics && <span className="text-xs tabular-nums text-fg-2">{compact(p.metrics.reach)} reach · {p.metrics.er.toFixed(1)}%</span>}
                  <span className="whitespace-nowrap text-xs text-fg-3">{fmtShort(p.publishedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export function SeoTab({ client, canStart }: { client: Client; canStart: boolean }) {
  const router = useRouter();
  const project = useCRM((s) => s.seoProjects.find((p) => p.clientId === client.id));
  const summary = useMemo(() => {
    if (!project) return null;
    const cur = project.traffic.slice(-28);
    const tracked = project.keywords.filter((k) => k.tracked);
    return {
      clicks: sum(cur.map((d) => d.clicks)),
      top10: tracked.filter((k) => k.position != null && k.position <= 10).length,
      up: tracked.filter((k) => movement(k) > 0).length,
      down: tracked.filter((k) => movement(k) < 0).length,
      open: project.issues.filter((i) => i.status !== "Fixed"),
      top: [...tracked].filter((k) => k.position != null).sort((a, b) => b.volume - a.volume).slice(0, 6),
    };
  }, [project]);
  if (!project || !summary)
    return (
      <Card>
        <EmptyState
          icon={<Search className="size-5" />}
          title="No SEO project"
          description={client.services.includes("SEO") ? "SEO is on contract — start the project to track health and rankings." : "SEO isn't part of this client's services yet."}
          action={
            canStart ? (
              <Button onClick={() => router.push(`/seo?p=${startProject(client)}`)} icon={<Plus className="size-3.5" />}>
                Start SEO project
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Mini label="SEO health" value={project.healthHistory.length ? `${project.healthScore}/100` : "—"} />
        <Mini label="Organic clicks (28d)" value={compact(summary.clicks)} />
        <Mini label="Top-10 keywords" value={summary.top10} />
        <Mini label="Rank changes" value={<span><span className="text-success">↑{summary.up}</span> <span className="text-danger">↓{summary.down}</span></span>} />
        <Mini label="Open issues" value={summary.open.length} />
      </div>
      <Card>
        <CardHeader
          title={project.domain}
          subtitle={`${project.gscConnected ? "Search Console linked" : "Estimates — Search Console not linked"} · last audit ${project.lastAuditAt ? relTime(project.lastAuditAt) : "never"}`}
          action={<Button href={`/seo?p=${project.id}`} size="xs" variant="ghost" icon={<ArrowRight className="size-3" />}>Open SEO</Button>}
        />
        {summary.top.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Keyword</Th>
                <Th className="text-right">Volume</Th>
                <Th className="text-right">Position</Th>
                <Th className="text-right">Change</Th>
              </tr>
            </thead>
            <tbody>
              {summary.top.map((k) => {
                const m = movement(k);
                return (
                  <tr key={k.id}>
                    <Td className="font-medium">{k.keyword}</Td>
                    <Td className="text-right tabular-nums">{compact(k.volume)}</Td>
                    <Td className="text-right tabular-nums">{k.position}</Td>
                    <Td className={`text-right tabular-nums ${m > 0 ? "text-success" : m < 0 ? "text-danger" : "text-fg-3"}`}>{m === 0 ? "—" : Math.abs(m) === 100 ? (m > 0 ? "New" : "Lost") : `${m > 0 ? "↑" : "↓"}${Math.abs(m)}`}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export function InfluencersTab({ client }: { client: Client }) {
  const all = useCRM((s) => s.engagements);
  const influencers = useCRM((s) => s.influencers);
  const rows = useMemo(() => all.filter((e) => e.clientId === client.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [all, client.id]);
  const name = (id: string) => influencers.find((i) => i.id === id);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label="Creators engaged" value={rows.length} />
        <Mini label="Live" value={rows.filter((r) => r.stage === "Live" || r.stage === "Paid").length} />
        <Mini label="Total fees" value={compactMoney(sum(rows.map((r) => r.agreedFee)))} />
        <Mini label="Attributed sales" value={sum(rows.map((r) => r.results?.sales ?? 0))} />
      </div>
      <Card>
        <CardHeader title="Influencer engagements" action={<Button href="/influencers" size="xs" variant="ghost" icon={<Users className="size-3" />}>Open influencers</Button>} />
        {rows.length === 0 ? (
          <EmptyState title="No influencer engagements" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Creator</Th>
                <Th>Stage</Th>
                <Th>Deliverables</Th>
                <Th className="text-right">Fee</Th>
                <Th>Payment</Th>
                <Th className="text-right">Views · sales</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const inf = name(r.influencerId);
                return (
                  <tr key={r.id}>
                    <Td>
                      <p className="font-medium">{inf?.name ?? r.influencerId}</p>
                      <p className="text-xs text-fg-3">{inf?.instagram ?? inf?.category}</p>
                    </Td>
                    <Td><StatusBadge status={r.stage} /></Td>
                    <Td className="tabular-nums text-fg-2">{r.deliverables.filter((d) => d.done).length}/{r.deliverables.length}</Td>
                    <Td className="text-right tabular-nums">{compactMoney(r.agreedFee)}</Td>
                    <Td><Badge tone={r.paymentStatus === "Paid" ? "success" : r.paymentStatus === "Unpaid" ? "warning" : "info"}>{r.paymentStatus}</Badge></Td>
                    <Td className="text-right tabular-nums text-fg-2">{r.results ? `${compact(r.results.views)} · ${r.results.sales}` : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export function StrategyTab({ client, writable }: { client: Client; writable: boolean }) {
  const all = useCRM((s) => s.strategies);
  const rows = useMemo(() => all.filter((s) => s.clientId === client.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [all, client.id]);
  return (
    <Card>
      <CardHeader
        title="Marketing strategies"
        subtitle="Built by the Strategy agent from the client knowledge base"
        action={writable ? <Button href={`/strategy?new=1&client=${client.id}`} size="xs" variant="primary" icon={<Plus className="size-3" />}>New strategy</Button> : undefined}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<Target className="size-5" />} title="No strategies yet" />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((s) => (
            <li key={s.id}>
              <Link href={`/strategy?id=${s.id}`} className="flex items-center gap-3 px-4 py-3 text-[13px] hover:bg-surface-2">
                <Target className="size-4 text-fg-3" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.title}</p>
                  <p className="truncate text-xs text-fg-3">{s.summary}</p>
                </div>
                <Badge tone={s.status === "Approved" ? "success" : s.status === "In Review" ? "warning" : "neutral"}>{s.status}</Badge>
                <span className="hidden text-xs text-fg-3 sm:inline">v{s.version} · {relTime(s.updatedAt)}</span>
                <ExternalLink className="size-3 text-fg-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
