"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Minus, Plus, Sparkles } from "lucide-react";
import type { Client, SeoKeyword, SeoProject } from "@/lib/types";
import { keywordIdeas, movement, type KeywordIdea } from "@/lib/ai/seo";
import { cn, compact } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, EmptyState, Input, SearchInput, Segmented, Table, Td, Th, Toggle } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { toggleTracked, trackKeyword } from "./actions";

export function Movement({ k }: { k: Pick<SeoKeyword, "position" | "prevPosition"> }) {
  const m = movement(k);
  if (m === 0) return <span className="inline-flex items-center text-fg-3"><Minus className="size-3" /></span>;
  if (m === 100) return <Badge tone="info">New</Badge>;
  if (m === -100) return <Badge tone="danger">Lost</Badge>;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", m > 0 ? "text-success" : "text-danger")}>
      {m > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(m)}
    </span>
  );
}

const INTENT_TONE = { Informational: "info", Commercial: "accent", Transactional: "success", Navigational: "neutral" } as const;
export const IntentBadge = ({ intent }: { intent: SeoKeyword["intent"] }) => <Badge tone={INTENT_TONE[intent]}>{intent}</Badge>;

export function Difficulty({ v }: { v: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", v >= 60 ? "bg-danger" : v >= 35 ? "bg-warning" : "bg-success")} />
      <span className="tabular-nums">{v}</span>
    </span>
  );
}

export function SeoKeywords({ project, client, writable, live }: { project: SeoProject; client?: Client; writable: boolean; live: boolean }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "tracked" | "quick" | "drops">("tracked");
  const [seed, setSeed] = useState("");
  const [ideas, setIdeas] = useState<KeywordIdea[]>([]);

  const rows = useMemo(
    () =>
      project.keywords
        .filter((k) => {
          if (q && !k.keyword.includes(q.toLowerCase())) return false;
          if (filter === "tracked") return k.tracked;
          if (filter === "quick") return k.position != null && k.position >= 4 && k.position <= 15;
          if (filter === "drops") return movement(k) < 0;
          return true;
        })
        .sort((a, b) => (a.position ?? 999) - (b.position ?? 999)),
    [project.keywords, q, filter],
  );
  const tracked = project.keywords.filter((k) => k.tracked);
  const ranked = tracked.filter((k) => k.position != null);
  const top3 = ranked.filter((k) => k.position! <= 3).length;
  const top10 = ranked.filter((k) => k.position! <= 10).length;
  const up = tracked.filter((k) => movement(k) > 0).length;
  const down = tracked.filter((k) => movement(k) < 0).length;

  const research = () => {
    const out = keywordIdeas(seed, client?.industry ?? "", client?.location ?? "");
    setIdeas(out);
    if (!out.length) toast("Enter a seed keyword", undefined, "info");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Tracked keywords", tracked.length],
          ["Top 3 / Top 10", `${top3} / ${top10}`],
          ["Improved", up],
          ["Declined", down],
        ].map(([l, v]) => (
          <Card key={l} className="p-3">
            <p className="text-xs text-fg-3">{l}</p>
            <p className="text-lg font-semibold tabular-nums">{v}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="Filter keywords…" className="sm:w-64" />
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "tracked", label: "Tracked" },
              { value: "all", label: "All" },
              { value: "quick", label: "Quick wins (4–15)" },
              { value: "drops", label: "Declines" },
            ]}
          />
          <span className="text-[11px] text-fg-3 sm:ml-auto">{live ? "Positions from Search Console" : "Positions from rank tracker sample — estimates"}</span>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No keywords here" description="Use keyword research below to add keywords to track." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Keyword</Th>
                <Th>Intent</Th>
                <Th className="text-right">Volume</Th>
                <Th>KD</Th>
                <Th className="text-right">Position</Th>
                <Th>Change</Th>
                <Th>URL</Th>
                <Th>Tracked</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id} className="hover:bg-surface-2">
                  <Td className="font-medium">{k.keyword}</Td>
                  <Td><IntentBadge intent={k.intent} /></Td>
                  <Td className="text-right tabular-nums">{compact(k.volume)}</Td>
                  <Td><Difficulty v={k.difficulty} /></Td>
                  <Td className="text-right tabular-nums font-medium">{k.position ?? <span className="text-fg-3">—</span>}</Td>
                  <Td><Movement k={k} /></Td>
                  <Td className="max-w-56">
                    {k.url ? (
                      <a href={k.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-xs text-fg-2 hover:text-fg">
                        <span className="truncate">{k.url.replace(/^https?:\/\/[^/]+/, "") || "/"}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-xs text-fg-3">Not mapped</span>
                    )}
                  </Td>
                  <Td>{writable ? <Toggle checked={k.tracked} onChange={() => toggleTracked(project.id, k.id)} label="Tracked" /> : k.tracked ? "Yes" : "No"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Keyword research"
          subtitle="Ideas are generated from your seed with industry & city modifiers."
          action={<Badge tone="warning">Estimates — connect a keyword data provider</Badge>}
        />
        <form
          className="flex flex-col gap-2 px-4 pb-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            research();
          }}
        >
          <Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder={client?.industry === "Healthcare" ? "e.g. cardiologist" : "e.g. neet coaching"} className="sm:w-72" />
          <Button type="submit" variant="ai" icon={<Sparkles className="size-3.5" />}>
            Find keywords
          </Button>
        </form>
        {ideas.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Keyword idea</Th>
                <Th>Intent</Th>
                <Th className="text-right">Est. volume</Th>
                <Th>Est. KD</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {ideas.map((i) => {
                const already = project.keywords.some((k) => k.keyword.toLowerCase() === i.keyword);
                return (
                  <tr key={i.keyword}>
                    <Td className="font-medium">{i.keyword}</Td>
                    <Td><IntentBadge intent={i.intent} /></Td>
                    <Td className="text-right tabular-nums">~{compact(i.volume)}</Td>
                    <Td><Difficulty v={i.difficulty} /></Td>
                    <Td className="text-right">
                      {writable && (
                        <Button size="xs" disabled={already} icon={<Plus className="size-3" />} onClick={() => trackKeyword(project.id, i) && toast("Keyword tracked", i.keyword)}>
                          {already ? "Tracked" : "Track"}
                        </Button>
                      )}
                    </Td>
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
