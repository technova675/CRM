import type { ClientKnowledge, ContentBrief, InsightItem, SeoIssue, SeoKeyword, SeoProject } from "../types";
import { rng } from "../utils";

// Local SEO engine (pure — no store imports, safe to use from seeds).
// It only reasons over data stored on the SeoProject. Anything that would need a
// keyword data provider or crawler is explicitly labelled as an estimate.

export const SEVERITY_WEIGHT: Record<SeoIssue["severity"], number> = { Critical: 7, Warning: 3, Notice: 1 };
export const ISSUE_CATEGORIES: SeoIssue["category"][] = ["Technical", "On-page", "Content", "Performance", "Links"];
export const ISSUE_SEVERITIES: SeoIssue["severity"][] = ["Critical", "Warning", "Notice"];

// Brief with the extra internal-links field the UI shows (structurally compatible with ContentBrief).
export type ContentBriefX = ContentBrief & { internalLinks?: string[]; source?: "gsc" | "estimate" };

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function issuePenalty(i: SeoIssue) {
  if (i.status === "Fixed") return 0;
  const base = SEVERITY_WEIGHT[i.severity] + Math.min(2, i.affectedUrls / 60);
  return i.status === "In Progress" ? base * 0.5 : base;
}

export function scoreFromIssues(issues: SeoIssue[]) {
  return Math.round(clamp(100 - issues.reduce((a, i) => a + issuePenalty(i), 0), 12, 100));
}

export interface AuditResult {
  score: number;
  bySeverity: Record<SeoIssue["severity"], number>; // open + in progress
  byCategory: Record<SeoIssue["category"], number>;
  fixed: number;
  insights: InsightItem[];
}

// Re-scores site health from the project's current issue list (open issues cost points,
// in-progress issues cost half, fixed issues cost nothing).
export function runAudit(project: Pick<SeoProject, "issues" | "healthScore" | "domain">): AuditResult {
  const open = project.issues.filter((i) => i.status !== "Fixed");
  const bySeverity = { Critical: 0, Warning: 0, Notice: 0 } as AuditResult["bySeverity"];
  const byCategory = { Technical: 0, "On-page": 0, Content: 0, Performance: 0, Links: 0 } as AuditResult["byCategory"];
  open.forEach((i) => {
    bySeverity[i.severity]++;
    byCategory[i.category]++;
  });
  const score = scoreFromIssues(project.issues);
  const delta = score - project.healthScore;
  const worstCat = [...ISSUE_CATEGORIES].sort((a, b) => byCategory[b] - byCategory[a])[0]!;
  const insights: InsightItem[] = [
    { kind: "data", text: `${open.length} open issue${open.length === 1 ? "" : "s"} on ${project.domain}: ${bySeverity.Critical} critical, ${bySeverity.Warning} warnings, ${bySeverity.Notice} notices.`, source: "Latest crawl" },
    { kind: "data", text: `Health score ${score}/100${delta ? ` (${delta > 0 ? "+" : ""}${delta} vs previous)` : " (unchanged)"}.`, source: "Issue-weighted score" },
    { kind: "assumption", text: "Score weights: critical −7, warning −3, notice −1 (+ up to −2 for URL spread); in-progress issues count half." },
  ];
  if (byCategory[worstCat] > 0) insights.push({ kind: "recommendation", text: `Most open issues are ${worstCat.toLowerCase()} (${byCategory[worstCat]}). Batch these into one sprint.` });
  const crit = open.filter((i) => i.severity === "Critical").sort((a, b) => b.affectedUrls - a.affectedUrls)[0];
  if (crit) insights.push({ kind: "recommendation", text: `Fix first: “${crit.title}” (${crit.affectedUrls} URLs) — ${crit.fix}` });
  return { score, bySeverity, byCategory, fixed: project.issues.length - open.length, insights };
}

// ---------- Keyword research ----------
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function intentOf(kw: string): SeoKeyword["intent"] {
  const t = kw.toLowerCase();
  if (/\b(how|what|why|when|is|are|guide|tips|symptoms|syllabus|meaning|vs|normal range|notes|papers)\b/.test(t)) return "Informational";
  if (/\b(fees|fee|cost|price|book|appointment|buy|admission|enrol|enroll|packages?|register)\b/.test(t)) return "Transactional";
  if (/\b(best|top|near me|reviews?|compare|affordable)\b/.test(t)) return "Commercial";
  return "Commercial";
}

const MODS_BY_INDUSTRY: Record<string, string[]> = {
  Education: ["best {s} in {city}", "{s} fees {city}", "{s} near me", "online {s}", "{s} crash course", "top {s} institutes in {city}", "{s} for droppers", "how to choose {s}", "{s} reviews", "{s} demo class", "is {s} worth it", "{s} timings {city}"],
  Healthcare: ["best {s} in {city}", "{s} near me", "{s} cost in {city}", "{s} appointment", "{s} specialist {city}", "what is {s}", "{s} symptoms", "affordable {s} {city}", "{s} reviews", "{s} packages", "how to prepare for {s}", "{s} recovery time"],
  "Real Estate": ["{s} in {city}", "{s} price {city}", "new {s} near me", "best {s} {city}", "{s} for sale {city}", "how to buy {s}", "{s} reviews", "ready to move {s} {city}"],
  "D2C / E-commerce": ["buy {s} online", "best {s} in india", "{s} price", "{s} reviews", "organic {s}", "{s} benefits", "how to use {s}", "{s} near me"],
};
const GENERIC_MODS = ["best {s} in {city}", "{s} near me", "{s} cost", "{s} {city}", "how to choose {s}", "{s} reviews", "affordable {s} {city}", "what is {s}", "top 10 {s}", "{s} for beginners"];

export interface KeywordIdea {
  keyword: string;
  volume: number; // estimated monthly searches
  difficulty: number; // estimated 0..100
  intent: SeoKeyword["intent"];
  estimate: true; // always an estimate until a keyword data provider is connected
}

// Deterministic keyword ideas from a seed. Volumes and difficulty are ESTIMATES
// (heuristic, hash-based) — never present them as measured data.
export function keywordIdeas(seedKeyword: string, industry: string, city: string): KeywordIdea[] {
  const s = seedKeyword.trim().toLowerCase();
  if (!s) return [];
  const c = (city || "india").split(/[ ,/]/)[0]!.toLowerCase();
  const mods = MODS_BY_INDUSTRY[industry] ?? GENERIC_MODS;
  const seen = new Set<string>();
  const out: KeywordIdea[] = [];
  [s, ...mods.map((m) => m.replace("{s}", s).replace("{city}", c))].forEach((kw) => {
    if (seen.has(kw)) return;
    seen.add(kw);
    const r = rng(hash(kw));
    const intent = intentOf(kw);
    const local = kw.includes(c) || kw.includes("near me");
    const words = kw.split(" ").length;
    const base = intent === "Informational" ? 2400 : intent === "Commercial" ? 1300 : 700;
    const volume = Math.max(20, Math.round((base * (0.3 + r() * 1.4)) / Math.max(1, words - 2) / (local ? 2.2 : 1) / 10) * 10);
    const difficulty = Math.round(clamp((local ? 22 : 40) + r() * 40 - (words - 3) * 4, 5, 95));
    out.push({ keyword: kw, volume, difficulty, intent, estimate: true });
  });
  return out.sort((a, b) => b.volume - a.volume);
}

// ---------- Content brief ----------
const title = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());

export interface BriefDraft {
  keyword: string;
  title: string;
  outline: string[]; // "H2: …" / "H3: …"
  wordCount: number;
  questions: string[];
  internalLinks: string[];
  insights: InsightItem[];
}

export function contentBrief(keyword: string, project: Pick<SeoProject, "keywords" | "contentGaps" | "domain" | "gscConnected">, knowledge?: ClientKnowledge | null, now = new Date()): BriefDraft {
  const kw = keyword.trim().toLowerCase();
  const tokens = kw.split(" ").filter((t) => t.length > 3 && !["best", "near", "with", "from", "that", "top"].includes(t));
  const tracked = project.keywords.find((k) => k.keyword.toLowerCase() === kw);
  const gap = project.contentGaps.find((g) => g.keyword.toLowerCase() === kw);
  const intent = intentOf(kw);
  const idea = keywordIdeas(kw, "", "")[0];
  const volume = tracked?.volume ?? gap?.volume ?? idea?.volume ?? 0;
  const difficulty = tracked?.difficulty ?? idea?.difficulty ?? 40;
  const year = now.getFullYear();
  const T = title(kw);

  const heading =
    intent === "Informational" ? `${T}: The Complete Guide (${year})` : intent === "Transactional" ? `${T} — Prices, Process & What to Expect (${year})` : `${T}: How to Choose the Right Option in ${year}`;

  const outline: string[] = [`H2: What to know about ${kw}`];
  if (intent === "Commercial") outline.push("H2: How to compare your options", "H3: Criteria that actually matter", "H3: Red flags to avoid", `H2: Our shortlist for ${kw}`);
  if (intent === "Transactional") outline.push("H2: Pricing & what's included", "H3: Factors that change the cost", "H2: Step-by-step process", "H3: Documents / preparation checklist");
  if (intent === "Informational") outline.push("H2: Key concepts explained", "H3: Common mistakes", "H2: Step-by-step approach", "H3: Tools & resources");
  (knowledge?.products ?? []).slice(0, 2).forEach((p) => outline.push(`H2: How ${p.name} helps${p.usp ? ` — ${p.usp}` : ""}`));
  outline.push("H2: Frequently asked questions", "H2: Next steps (CTA)");

  const related = project.keywords.filter((k) => k.keyword.toLowerCase() !== kw && tokens.some((t) => k.keyword.toLowerCase().includes(t)));
  const questions = [
    ...related.filter((k) => k.intent === "Informational").slice(0, 3).map((k) => `${title(k.keyword)}?`),
    intent === "Transactional" ? `How much does ${kw} cost?` : `What is the best way to approach ${kw}?`,
    `Is ${kw} worth it?`,
    `How long does it take to see results with ${kw}?`,
  ].slice(0, 6);

  const internalLinks = [...new Set(related.filter((k) => k.url).map((k) => k.url!))].slice(0, 5);
  const wordCount = Math.round((1100 + difficulty * 14 + (intent === "Informational" ? 300 : 0)) / 100) * 100;
  const live = project.gscConnected;

  const insights: InsightItem[] = [];
  if (tracked) insights.push({ kind: "data", text: `“${kw}” — ${volume.toLocaleString("en-IN")} searches/mo, difficulty ${difficulty}, current position ${tracked.position ?? "not ranking"}.`, source: live ? "Search Console + keyword tracker" : "Keyword tracker (estimate)" });
  else insights.push({ kind: "assumption", text: `Volume ~${volume.toLocaleString("en-IN")}/mo and difficulty ~${difficulty} are estimates — connect a keyword data provider for measured numbers.` });
  if (gap) insights.push({ kind: "data", text: `Content gap: ${gap.competitor} ranks for this keyword and ${project.domain} does not.`, source: "Competitor gap analysis" });
  insights.push({ kind: "assumption", text: `Target length ${wordCount.toLocaleString("en-IN")} words is a heuristic based on difficulty and intent (${intent}).` });
  if (internalLinks.length) insights.push({ kind: "recommendation", text: `Link internally from/to ${internalLinks.length} related ranking page${internalLinks.length > 1 ? "s" : ""} to pass relevance.` });
  if (knowledge?.brandVoice) insights.push({ kind: "recommendation", text: `Write in the brand voice: ${knowledge.brandVoice}${knowledge.toneWords.length ? ` (${knowledge.toneWords.slice(0, 4).join(", ")})` : ""}.`, source: "Client knowledge base" });
  if (knowledge?.rejectedConcepts.length) insights.push({ kind: "recommendation", text: `Avoid previously rejected angles: ${knowledge.rejectedConcepts.slice(0, 2).join("; ")}.`, source: "Client knowledge base" });

  return { keyword: kw, title: heading, outline, wordCount, questions, internalLinks, insights };
}

// ---------- AI content recommendations ----------
export function movement(k: Pick<SeoKeyword, "position" | "prevPosition">) {
  if (k.position == null && k.prevPosition == null) return 0;
  if (k.position == null) return -100; // dropped out
  if (k.prevPosition == null) return 100; // new ranking
  return k.prevPosition - k.position; // positive = improved
}

// Rough expected CTR by organic position (industry curve) — an assumption, used only for estimates.
const CTR = [0, 0.28, 0.16, 0.11, 0.08, 0.065, 0.05, 0.04, 0.032, 0.027, 0.023];
export const ctrAt = (pos: number) => (pos <= 10 ? CTR[Math.max(1, Math.round(pos))]! : 0.01);

export function seoRecommendations(project: SeoProject, live: boolean) {
  const src = live ? "Search Console · last 28 days" : "Keyword tracker (estimate)";
  const quickWins = project.keywords
    .filter((k) => k.tracked && k.position != null && k.position >= 4 && k.position <= 15)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 6);
  const drops = project.keywords.filter((k) => k.tracked && movement(k) <= -3).sort((a, b) => movement(a) - movement(b)).slice(0, 4);
  const openCrit = project.issues.filter((i) => i.status !== "Fixed" && i.severity === "Critical");
  const gaps = [...project.contentGaps].sort((a, b) => b.volume - a.volume).slice(0, 3);
  const insights: InsightItem[] = [];
  if (quickWins.length) {
    const gain = quickWins.reduce((a, k) => a + k.volume * (ctrAt(3) - ctrAt(k.position!)), 0);
    insights.push({ kind: "data", text: `${quickWins.length} keywords sit on positions 4–15 (quick wins): ${quickWins.slice(0, 3).map((k) => `“${k.keyword}” #${k.position}`).join(", ")}.`, source: src });
    insights.push({ kind: "assumption", text: `Moving them to position 3 could add ~${Math.round(gain).toLocaleString("en-IN")} clicks/mo (standard CTR curve — estimate).` });
    insights.push({ kind: "recommendation", text: "Refresh those pages: tighten title/H1 to the query, add FAQ schema and 2–3 internal links from high-authority pages." });
  }
  drops.forEach((k) =>
    insights.push({ kind: "data", text: `“${k.keyword}” ${k.position == null ? `dropped out of the top 100 (was #${k.prevPosition})` : `fell #${k.prevPosition} → #${k.position}`}${k.url ? ` · ${k.url}` : ""}.`, source: src }),
  );
  if (drops.length) insights.push({ kind: "recommendation", text: "Check the dropped URLs for recent content changes, cannibalisation or new competitor pages before editing." });
  if (openCrit.length) insights.push({ kind: "recommendation", text: `${openCrit.length} critical technical issue${openCrit.length > 1 ? "s" : ""} still open — fix before publishing new content (e.g. “${openCrit[0]!.title}”).` });
  gaps.forEach((g) => insights.push({ kind: "recommendation", text: `Content gap: create a page for “${g.keyword}” (${g.volume.toLocaleString("en-IN")}/mo) — ${g.competitor} ranks, you don't.`, source: "Competitor gap analysis" }));
  return { quickWins, drops, insights };
}
