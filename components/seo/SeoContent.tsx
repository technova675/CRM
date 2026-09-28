"use client";

import { useState } from "react";
import { FileText, Sparkles, Trash2 } from "lucide-react";
import type { ClientKnowledge, SeoProject } from "@/lib/types";
import { contentBrief, type BriefDraft, type ContentBriefX } from "@/lib/ai/seo";
import { runAgentJob } from "@/lib/ai/client";
import { compact, fmtShort } from "@/lib/utils";
import { AgentChip, Badge, Button, Card, CardHeader, Drawer, EmptyState, Input, InsightList, Select, StatusBadge, Table, Td, Th } from "@/components/ui";
import { AGENTS } from "@/lib/ai/agents";
import { toast } from "@/components/shell/toast";
import { deleteBrief, saveBrief, setBriefStatus } from "./actions";

const BRIEF_STATUSES: ContentBriefX["status"][] = ["Draft", "Approved", "Writing", "Published"];

function Outline({ outline }: { outline: string[] }) {
  return (
    <ul className="space-y-1">
      {outline.map((o, i) => {
        const h3 = o.startsWith("H3:");
        return (
          <li key={i} className={h3 ? "pl-5 text-[13px] text-fg-2" : "text-[13px] font-medium"}>
            <span className="mr-1.5 text-[10px] font-semibold text-fg-3">{h3 ? "H3" : "H2"}</span>
            {o.replace(/^H[23]:\s*/, "")}
          </li>
        );
      })}
    </ul>
  );
}

export function SeoContent({ project, knowledge, writable }: { project: SeoProject; knowledge?: ClientKnowledge; writable: boolean }) {
  const [kw, setKw] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<BriefDraft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = project.briefs.find((b) => b.id === openId) as ContentBriefX | undefined;

  const generate = async (keyword: string) => {
    if (!keyword.trim()) return;
    setBusy(true);
    const out = await runAgentJob({ agent: "seo", title: `Content brief: ${keyword}`, clientId: project.clientId, local: () => contentBrief(keyword, project, knowledge) });
    setBusy(false);
    if (out) setDraft(out);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Content gaps" subtitle="Keywords competitors rank for and this site doesn't" />
          {project.contentGaps.length === 0 ? (
            <EmptyState title="No gap data yet" description="Add competitors and connect a keyword data provider to find gaps." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Keyword</Th>
                  <Th className="text-right">Volume</Th>
                  <Th>Competitor</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {[...project.contentGaps]
                  .sort((a, b) => b.volume - a.volume)
                  .map((g) => (
                    <tr key={g.keyword}>
                      <Td className="font-medium">{g.keyword}</Td>
                      <Td className="text-right tabular-nums">{compact(g.volume)}</Td>
                      <Td className="text-xs text-fg-2">{g.competitor}</Td>
                      <Td className="text-right">
                        {writable && (
                          <Button size="xs" variant="ghost" icon={<Sparkles className="size-3" />} onClick={() => generate(g.keyword)} disabled={busy}>
                            Brief
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="AI content brief" subtitle="Uses tracked keywords, gaps and the client knowledge base" action={<AgentChip name={AGENTS.seo.name} color={AGENTS.seo.color} />} />
          <form
            className="flex gap-2 px-4 pb-3"
            onSubmit={(e) => {
              e.preventDefault();
              void generate(kw);
            }}
          >
            <Input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Target keyword, e.g. neet coaching fees bangalore" className="flex-1" />
            <Button type="submit" variant="ai" loading={busy} disabled={!writable} icon={<Sparkles className="size-3.5" />}>
              Generate
            </Button>
          </form>
          {draft ? (
            <div className="space-y-3 border-t border-border px-4 py-3">
              <div>
                <p className="text-[11px] text-fg-3">Title</p>
                <p className="font-semibold">{draft.title}</p>
                <p className="text-xs text-fg-3">~{draft.wordCount.toLocaleString("en-IN")} words · keyword “{draft.keyword}”</p>
              </div>
              <Outline outline={draft.outline} />
              <div>
                <p className="mb-1 text-xs font-medium text-fg-2">Questions to answer</p>
                <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-fg-2">
                  {draft.questions.map((q) => <li key={q}>{q}</li>)}
                </ul>
              </div>
              {draft.internalLinks.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-fg-2">Internal links</p>
                  <div className="flex flex-wrap gap-1">{draft.internalLinks.map((l) => <Badge key={l}>{l.replace(/^https?:\/\/[^/]+/, "")}</Badge>)}</div>
                </div>
              )}
              <InsightList items={draft.insights} compact />
              <div className="flex justify-end gap-2">
                <Button size="xs" variant="ghost" onClick={() => setDraft(null)}>Discard</Button>
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => {
                    saveBrief(project.id, draft);
                    setDraft(null);
                    setKw("");
                    toast("Brief saved", "Added to content briefs as Draft");
                  }}
                >
                  Save brief
                </Button>
              </div>
            </div>
          ) : (
            <p className="px-4 pb-4 text-xs text-fg-3">Generate a brief for any keyword, or click “Brief” on a content gap.</p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Content briefs" subtitle={`${project.briefs.length} brief${project.briefs.length === 1 ? "" : "s"}`} />
        {project.briefs.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" />} title="No briefs yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Brief</Th>
                <Th>Keyword</Th>
                <Th className="text-right">Words</Th>
                <Th>Created</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {project.briefs.map((b) => (
                <tr key={b.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setOpenId(b.id)}>
                  <Td className="font-medium">{b.title}</Td>
                  <Td className="text-xs text-fg-2">{b.keyword}</Td>
                  <Td className="text-right tabular-nums">{b.wordCount.toLocaleString("en-IN")}</Td>
                  <Td className="text-fg-2">{fmtShort(b.createdAt)}</Td>
                  <Td>
                    <div onClick={(e) => e.stopPropagation()}>
                      {writable ? (
                        <Select className="h-7 w-28 text-xs" value={b.status} onChange={(e) => setBriefStatus(project.id, b.id, e.target.value as ContentBriefX["status"])}>
                          {BRIEF_STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </Select>
                      ) : (
                        <StatusBadge status={b.status} />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Drawer
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.title ?? ""}
        subtitle={open && `Keyword “${open.keyword}” · ~${open.wordCount.toLocaleString("en-IN")} words · ${open.status}`}
        footer={
          writable && open ? (
            <Button
              variant="ghost"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => {
                if (!confirm("Delete this brief?")) return;
                deleteBrief(project.id, open.id);
                setOpenId(null);
              }}
            >
              Delete
            </Button>
          ) : undefined
        }
      >
        {open && (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-fg-2">Outline</p>
              <Outline outline={open.outline} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-fg-2">Questions to answer</p>
              <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-fg-2">
                {open.questions.map((q) => <li key={q}>{q}</li>)}
              </ul>
            </div>
            {!!open.internalLinks?.length && (
              <div>
                <p className="mb-1 text-xs font-medium text-fg-2">Internal links</p>
                <ul className="space-y-0.5 text-xs text-fg-2">{open.internalLinks.map((l) => <li key={l}>{l}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
