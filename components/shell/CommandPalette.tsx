"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BrainCircuit, CornerDownLeft, Filter } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can, type Module } from "@/lib/permissions";
import { hasNLFilters, parseNL, runNLFilter, scopeState } from "@/lib/ai/command";
import { cn, fmtShort } from "@/lib/utils";
import { NAV } from "./nav";
import { useUI } from "./ui-state";

interface Item {
  id: string;
  label: string;
  sub?: string;
  group: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  // Mounting the inner palette only while open resets its query/selection naturally.
  return open ? <Palette /> : null;
}

const GROUP_ORDER = ["AI", "Smart filter", "Go to", "Actions", "Leads", "Clients", "Deals", "Campaigns", "Creatives", "Tasks", "Reports", "Documents", "Conversations", "Influencers", "Strategies", "Social posts", "SEO keywords"];
const PER_GROUP = 5;
// Natural-language questions go to the Command Center first; short look-ups stay search-first.
const looksLikeQuestion = (t: string) => /\?|^(show|find|which|what|who|how|why|list|compare|analy[sz]e|create|draft|summari[sz]e|give|when)\b/.test(t) || t.split(/\s+/).length >= 5;

function Palette() {
  const setOpen = useUI((s) => s.setPalette);
  const openAssistant = useUI((s) => s.openAssistant);
  const router = useRouter();
  const me = useMe();
  const state = useCRM((s) => s);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      router.push(href);
      setOpen(false);
    };
    const t = q.trim().toLowerCase();
    const words = t.split(/\s+/).filter((w) => w.length > 1);
    const match = (hay: string) => {
      const h = hay.toLowerCase();
      return words.length > 0 && words.every((w) => h.includes(w));
    };
    const ok = (m: Module) => can(me.role, m);
    const portal = me.role === "client";
    const mine = <T extends { clientId?: string }>(x: T) => !portal || x.clientId === me.clientId;
    const clientName = (id?: string) => state.clients.find((c) => c.id === id)?.company ?? "";
    const out: Item[] = [];
    const push = (group: string, list: Omit<Item, "group">[]) => list.slice(0, PER_GROUP).forEach((i) => out.push({ ...i, group }));

    if (t) {
      if (ok("command")) out.push({ id: "ask", label: `Ask Command Center: “${q.trim()}”`, group: "AI", run: go(`/command?q=${encodeURIComponent(q.trim())}`) });
      // Smart filter preview for natural-language queries ("clients spending over ₹5L whose ROAS dropped").
      const nl = parseNL(q);
      if (hasNLFilters(nl) && ok("command")) {
        const r = runNLFilter(scopeState(state, me), nl);
        out.push({ id: "nl", label: `${r.matches.length} ${nl.entity} match: ${r.description}`, sub: "Full answer in Command Center", group: "Smart filter", run: go(`/command?q=${encodeURIComponent(q.trim())}`) });
        r.matches.slice(0, 4).forEach((m) => out.push({ id: `nl_${m.id}`, label: m.label, sub: m.sub, group: "Smart filter", run: go(m.href) }));
      }
    }
    NAV.filter((n) => ok(n.module) && (!t || n.label.toLowerCase().includes(t))).slice(0, t ? 4 : 30).forEach((n) => out.push({ id: n.href, label: n.label, group: "Go to", run: go(n.href) }));

    if (!t) {
      if (ok("command")) out.push({ id: "cc", label: "Open AI Command Center", group: "Actions", run: go("/command") });
      if (can(me.role, "leads", "write")) out.push({ id: "new-lead", label: "Add a new lead", group: "Actions", run: go("/leads?new=1") });
      if (can(me.role, "leads", "write")) out.push({ id: "import", label: "Import leads from CSV / Excel", group: "Actions", run: go("/leads?import=1") });
      if (can(me.role, "outreach", "write")) out.push({ id: "outreach", label: "Start an outreach campaign", group: "Actions", run: go("/outreach?new=1") });
      if (can(me.role, "tasks", "write") && !portal) out.push({ id: "task", label: "Create a task", group: "Actions", run: go("/tasks?new=1") });
    } else if (words.length) {
      if (ok("leads") && !portal) push("Leads", state.leads.filter((l) => match(`${l.name} ${l.company} ${l.email} ${l.industry} ${l.location}`)).map((l) => ({ id: l.id, label: `${l.name} · ${l.company}`, sub: l.status, run: go(`/leads/${l.id}`) })));
      if (ok("clients")) push("Clients", state.clients.filter((c) => (!portal || c.id === me.clientId) && match(`${c.company} ${c.industry} ${c.location} ${c.services.join(" ")}`)).map((c) => ({ id: c.id, label: c.company, sub: c.industry, run: go(`/clients/${c.id}`) })));
      if (ok("pipeline") && !portal) push("Deals", state.deals.filter((d) => match(`${d.title} ${d.company}`)).map((d) => ({ id: d.id, label: d.title, sub: d.stage, run: go(`/pipeline?deal=${d.id}`) })));
      if (ok("campaigns")) push("Campaigns", state.campaigns.filter((c) => mine(c) && match(`${c.name} ${c.platform} ${c.objective} ${c.service}`)).map((c) => ({ id: c.id, label: c.name, sub: c.status, run: go(`/campaigns?c=${c.id}`) })));
      if (ok("creative")) push("Creatives", state.creatives.filter((c) => mine(c) && match(`${c.title} ${c.type} ${c.platform} ${c.angle ?? ""} ${c.hook ?? ""} ${c.tags.join(" ")}`)).map((c) => ({ id: c.id, label: c.title, sub: `${c.status} · ${clientName(c.clientId)}`, run: go(`/creative?c=${c.id}`) })));
      if (ok("tasks")) push("Tasks", state.tasks.filter((x) => (!portal || x.related?.id === me.clientId) && match(`${x.title} ${x.description}`)).map((x) => ({ id: x.id, label: x.title, sub: `${x.status} · due ${fmtShort(x.dueDate)}`, run: go(`/tasks?t=${x.id}`) })));
      if (ok("reports")) push("Reports", state.reports.filter((r) => mine(r) && match(`${clientName(r.clientId)} ${r.period} ${r.format} report`)).map((r) => ({ id: r.id, label: `${clientName(r.clientId)} — ${r.period}`, sub: r.format, run: go(`/reports?client=${r.clientId}`) })));
      if (ok("documents")) push("Documents", state.assets.filter((a) => (!portal || (a.clientId === me.clientId && a.clientVisible)) && match(`${a.name} ${a.folder} ${a.tags.join(" ")} ${clientName(a.clientId)}`)).map((a) => ({ id: a.id, label: a.name, sub: `${a.folder}${a.clientId ? ` · ${clientName(a.clientId)}` : ""}`, run: go(`/documents?a=${a.id}`) })));
      if (ok("inbox")) {
        const convs = state.conversations.filter((c) => !portal || c.clientId === me.clientId);
        const byConv = new Map(convs.map((c) => [c.id, c]));
        const leadName = (id?: string) => state.leads.find((l) => l.id === id);
        const hits = new Map<string, string>();
        convs.forEach((c) => {
          const l = leadName(c.leadId);
          if (match(`${c.subject ?? ""} ${l?.name ?? ""} ${l?.company ?? ""} ${clientName(c.clientId)} ${c.channel}`)) hits.set(c.id, c.subject ?? c.channel);
        });
        if (hits.size < PER_GROUP) for (const m of state.messages) if (byConv.has(m.conversationId) && !hits.has(m.conversationId) && match(m.body)) { hits.set(m.conversationId, `“${m.body.slice(0, 60)}…”`); if (hits.size >= PER_GROUP) break; }
        push("Conversations", [...hits.entries()].map(([id, sub]) => {
          const c = byConv.get(id)!;
          const l = leadName(c.leadId);
          return { id, label: l ? `${l.name} · ${l.company}` : clientName(c.clientId) || c.channel, sub, run: go(`/inbox?c=${id}`) };
        }));
      }
      if (ok("influencers") && !portal) push("Influencers", state.influencers.filter((i) => match(`${i.name} ${i.instagram ?? ""} ${i.youtube ?? ""} ${i.category} ${i.location}`)).map((i) => ({ id: i.id, label: i.name, sub: `${i.category} · ${i.location}`, run: go(`/influencers?i=${i.id}`) })));
      if (ok("strategy") && !portal) push("Strategies", state.strategies.filter((x) => match(`${x.title} ${clientName(x.clientId)} ${x.summary}`)).map((x) => ({ id: x.id, label: x.title, sub: `${x.status} · v${x.version}`, run: go(`/strategy?s=${x.id}`) })));
      if (ok("social")) push("Social posts", state.socialPosts.filter((p) => mine(p) && match(`${p.title} ${p.hook} ${p.caption} ${p.pillar} ${p.platform} ${p.hashtags.join(" ")}`)).map((p) => ({ id: p.id, label: p.title, sub: `${p.platform} · ${p.stage} · ${clientName(p.clientId)}`, run: go(`/social?p=${p.id}`) })));
      if (ok("seo") && !portal)
        push("SEO keywords", state.seoProjects.flatMap((sp) => sp.keywords.filter((k) => match(`${k.keyword} ${sp.domain}`)).map((k) => ({ id: `${sp.id}_${k.id}`, label: k.keyword, sub: `${sp.domain} · pos ${k.position ?? "—"} · vol ${k.volume}`, run: go(`/seo?client=${sp.clientId}`) }))));
      if (!ok("command") && !portal) out.push({ id: "ask-drawer", label: `Ask AI: “${q.trim()}”`, group: "AI", run: () => { setOpen(false); openAssistant(q.trim()); } });
    }
    // Keep the question option on top only for natural-language input; otherwise records lead.
    const order = (g: string) => (g === "AI" && t && !looksLikeQuestion(t) && out.length > 3 ? 99 : GROUP_ORDER.indexOf(g));
    return out.map((it, i) => ({ it, i })).sort((a, b) => order(a.it.group) - order(b.it.group) || a.i - b.i).map((x) => x.it);
  }, [q, me, state, router, setOpen, openAssistant]);

  const groups = [...new Set(items.map((i) => i.group))];
  let flat = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="animate-in relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
            if (e.key === "Enter") items[idx]?.run();
          }}
          placeholder="Search everything, or ask: “clients spending over ₹5 lakh whose ROAS dropped”"
          className="h-12 w-full border-b border-border bg-transparent px-4 text-[15px] outline-none placeholder:text-fg-3"
          aria-label="Search or ask"
        />
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {groups.map((g) => (
            <div key={g} className="mb-1">
              <p className="px-2 py-1 text-[11px] font-medium text-fg-3">{g}</p>
              {items.filter((i) => i.group === g).map((i) => {
                flat++;
                const active = flat === idx;
                const my = flat;
                return (
                  <button key={i.id} onMouseEnter={() => setIdx(my)} onClick={i.run} className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px]", active && "bg-surface-2")}>
                    {i.group === "AI" && <BrainCircuit className="size-3.5 shrink-0 text-accent-text" />}
                    {i.id === "nl" && <Filter className="size-3.5 shrink-0 text-accent-text" />}
                    <span className="min-w-0 flex-1 truncate">{i.label}</span>
                    {i.sub && <span className="max-w-[45%] shrink-0 truncate text-xs text-fg-3">{i.sub}</span>}
                    {active && <CornerDownLeft className="size-3 shrink-0 text-fg-3" />}
                  </button>
                );
              })}
            </div>
          ))}
          {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-fg-3">No results</p>}
        </div>
        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[11px] text-fg-3">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span className="ml-auto hidden sm:inline">Results respect your role&apos;s permissions</span>
        </div>
      </div>
    </div>
  );
}
