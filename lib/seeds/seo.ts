import type { SeoIssue, SeoKeyword, SeoProject } from "../types";
import { contentBrief, scoreFromIssues, type ContentBriefX } from "../ai/seo";
import { ago, makeRand, type SeedCtx } from "./context";

// Owned by the SEO module. Sample data for the two SEO retainers (Lumen Academy c_3, Atlas Health c_5).

type KW = [keyword: string, volume: number, difficulty: number, intent: SeoKeyword["intent"], path: string];

const LUMEN_KW: KW[] = [
  ["neet coaching in bangalore", 6600, 58, "Commercial", "/neet-coaching-bangalore"],
  ["best neet coaching in bangalore", 4400, 62, "Commercial", "/neet-coaching-bangalore"],
  ["jee coaching bangalore", 3600, 55, "Commercial", "/jee-coaching-bangalore"],
  ["best coaching for jee in bangalore", 1900, 57, "Commercial", "/jee-coaching-bangalore"],
  ["neet coaching fees bangalore", 1300, 34, "Transactional", "/fees"],
  ["neet coaching near me", 8100, 49, "Commercial", "/centres"],
  ["online neet coaching", 5400, 66, "Commercial", "/online-neet"],
  ["neet repeater batch bangalore", 880, 28, "Commercial", "/neet-repeater-batch"],
  ["neet dropper batch", 2400, 41, "Commercial", "/neet-repeater-batch"],
  ["kcet coaching bangalore", 1600, 31, "Commercial", "/kcet-coaching"],
  ["comedk coaching bangalore", 720, 24, "Commercial", "/kcet-coaching"],
  ["jee advanced coaching jayanagar", 320, 18, "Commercial", "/centres/jayanagar"],
  ["neet coaching koramangala", 390, 20, "Commercial", "/centres/koramangala"],
  ["neet coaching whitefield", 480, 22, "Commercial", "/centres/whitefield"],
  ["neet coaching hsr layout", 260, 17, "Commercial", "/centres/hsr-layout"],
  ["class 11 neet foundation course", 1000, 38, "Commercial", "/foundation"],
  ["iit jee foundation class 8", 590, 29, "Commercial", "/foundation"],
  ["neet mock test free", 9900, 52, "Informational", "/mock-tests"],
  ["neet online test series", 2900, 47, "Transactional", "/mock-tests"],
  ["neet previous year papers", 14800, 61, "Informational", "/resources/previous-papers"],
  ["neet syllabus 2026", 22200, 64, "Informational", "/blog/neet-syllabus"],
  ["how to prepare for neet in 1 year", 3600, 44, "Informational", "/blog/neet-1-year-plan"],
  ["jee vs neet", 1300, 36, "Informational", "/blog/jee-vs-neet"],
  ["neet cutoff karnataka", 4400, 50, "Informational", "/blog/neet-cutoff-karnataka"],
  ["neet biology notes", 2400, 42, "Informational", "/resources/biology-notes"],
  ["medical entrance coaching bangalore", 590, 39, "Commercial", "/neet-coaching-bangalore"],
  ["lumen academy", 1600, 5, "Navigational", "/"],
  ["lumen academy fees", 390, 6, "Transactional", "/fees"],
  ["neet crash course bangalore", 1000, 33, "Commercial", "/crash-course"],
  ["jee main crash course", 2900, 48, "Commercial", "/crash-course"],
];

const ATLAS_KW: KW[] = [
  ["best multispeciality hospital in hyderabad", 5400, 67, "Commercial", "/"],
  ["cardiologist in hyderabad", 4400, 55, "Commercial", "/specialities/cardiology"],
  ["orthopedic doctor near me", 12100, 58, "Commercial", "/specialities/orthopedics"],
  ["knee replacement cost in hyderabad", 1900, 41, "Transactional", "/treatments/knee-replacement"],
  ["diabetes specialist hyderabad", 1300, 38, "Commercial", "/specialities/endocrinology"],
  ["full body checkup hyderabad", 3600, 46, "Transactional", "/health-checkups"],
  ["full body checkup price", 6600, 52, "Transactional", "/health-checkups"],
  ["thyroid test cost", 2900, 35, "Transactional", "/lab-tests/thyroid"],
  ["gastroenterologist banjara hills", 480, 24, "Commercial", "/specialities/gastroenterology"],
  ["physiotherapy clinic gachibowli", 390, 19, "Commercial", "/clinics/gachibowli"],
  ["pcos treatment hyderabad", 880, 33, "Commercial", "/treatments/pcos"],
  ["best gynecologist in hyderabad", 2400, 49, "Commercial", "/specialities/gynecology"],
  ["health checkup packages", 4400, 57, "Transactional", "/health-checkups"],
  ["kidney stone treatment hyderabad", 1000, 37, "Commercial", "/treatments/kidney-stones"],
  ["atlas health", 1300, 4, "Navigational", "/"],
  ["atlas health appointment", 320, 6, "Transactional", "/book"],
  ["symptoms of heart attack", 27100, 72, "Informational", "/blog/heart-attack-symptoms"],
  ["hba1c normal range", 18100, 63, "Informational", "/blog/hba1c-normal-range"],
  ["vitamin d deficiency symptoms", 22200, 68, "Informational", "/blog/vitamin-d-deficiency"],
  ["dermatologist kondapur", 590, 23, "Commercial", "/clinics/kondapur"],
  ["ent specialist madhapur", 320, 18, "Commercial", "/clinics/madhapur"],
  ["back pain treatment hyderabad", 1300, 40, "Commercial", "/treatments/back-pain"],
  ["migraine specialist hyderabad", 480, 29, "Commercial", "/specialities/neurology"],
  ["cataract surgery cost hyderabad", 1000, 36, "Transactional", "/treatments/cataract"],
  ["home sample collection hyderabad", 1600, 34, "Transactional", "/lab-tests/home-collection"],
  ["pediatrician jubilee hills", 720, 26, "Commercial", "/clinics/jubilee-hills"],
  ["sleep apnea treatment hyderabad", 260, 21, "Commercial", "/treatments/sleep-apnea"],
  ["how to reduce cholesterol naturally", 9900, 59, "Informational", "/blog/reduce-cholesterol"],
];

type IssueDef = [SeoIssue["severity"], SeoIssue["category"], string, string];
const ISSUES: IssueDef[] = [
  ["Critical", "Technical", "Pages returning 5xx errors", "Check server logs and fix the failing templates; add uptime monitoring."],
  ["Critical", "Technical", "Broken internal links (4xx)", "Update or 301-redirect the broken targets; re-crawl after deploy."],
  ["Critical", "Performance", "LCP above 4s on mobile", "Compress hero images (WebP/AVIF), preload the LCP image and defer third-party scripts."],
  ["Critical", "On-page", "Duplicate title tags", "Write unique, query-led titles (≤ 60 chars) per page."],
  ["Critical", "Technical", "Canonical points to non-indexable URL", "Point canonicals at the 200-status, indexable version."],
  ["Warning", "On-page", "Missing meta descriptions", "Add 140–155 character descriptions with a clear CTA."],
  ["Warning", "Technical", "Redirect chains (3+ hops)", "Collapse chains into a single 301 to the final URL."],
  ["Warning", "Content", "Thin content (< 300 words)", "Expand with FAQs, outcomes and proof, or noindex/merge."],
  ["Warning", "Performance", "CLS above 0.25", "Reserve space for images/embeds and avoid late-loading banners."],
  ["Warning", "Links", "Toxic backlinks detected", "Review and add the worst domains to the disavow file."],
  ["Warning", "On-page", "Missing H1", "Add a single descriptive H1 matching the page intent."],
  ["Warning", "Technical", "Orphan pages (no internal links)", "Link from relevant hub pages or remove from the sitemap."],
  ["Warning", "Content", "Keyword cannibalisation", "Consolidate competing pages; pick one target URL per query."],
  ["Notice", "On-page", "Images missing alt text", "Add descriptive alt text to content images."],
  ["Notice", "Technical", "Missing structured data (FAQ / LocalBusiness)", "Add JSON-LD schema to service and location pages."],
  ["Notice", "Links", "Nofollow on internal links", "Remove nofollow from internal navigation links."],
  ["Notice", "Performance", "Uncompressed text assets", "Enable Brotli/Gzip on the CDN."],
  ["Notice", "Technical", "XML sitemap includes redirected URLs", "Regenerate the sitemap with only 200-status canonical URLs."],
];

function series(days: number, fn: (i: number) => number) {
  return Array.from({ length: days }, (_, k) => {
    const i = days - 1 - k; // days ago
    return { date: ago(i).slice(0, 10), v: fn(k) };
  });
}

function build(ctx: SeedCtx, clientId: string, seed: number, kws: KW[], comps: [string, number][], gaps: [string, number][], gsc: boolean, baseClicks: number): SeoProject | null {
  const client = ctx.clients.find((c) => c.id === clientId);
  if (!client) return null;
  const { R, int, some } = makeRand(seed);
  const domain = (client.website ?? `https://${client.company.toLowerCase().replace(/\s+/g, "")}.in`).replace(/^https?:\/\//, "");

  const keywords: SeoKeyword[] = kws.map(([keyword, volume, difficulty, intent, path], i) => {
    const nav = intent === "Navigational";
    const rankChance = R();
    let position: number | null = nav ? 1 : rankChance < 0.1 ? null : Math.max(1, Math.round(2 + difficulty / 4 + (R() - 0.5) * 22));
    if (position != null && position > 60) position = null;
    const move = int(-6, 7);
    let prevPosition: number | null = position == null ? (R() > 0.5 ? int(35, 70) : null) : Math.max(1, position + move);
    if (nav) prevPosition = 1;
    if (i % 9 === 4 && position != null) prevPosition = Math.max(1, position - int(4, 9)); // a few clear drops
    return { id: `kw_${clientId}_${i}`, keyword, volume, difficulty, intent, position, prevPosition, url: `https://${domain}${path}`, tracked: i % 7 !== 6 };
  });

  const picked = some(ISSUES, 14, 17);
  const issues: SeoIssue[] = picked.map(([severity, category, title, fix], i) => ({
    id: `iss_${clientId}_${i}`,
    severity,
    category,
    title,
    fix,
    affectedUrls: severity === "Critical" ? int(3, 40) : severity === "Warning" ? int(8, 120) : int(12, 260),
    status: i % 4 === 1 ? "Fixed" : i % 5 === 2 ? "In Progress" : "Open",
  }));
  const healthScore = scoreFromIssues(issues);
  const start = Math.max(20, healthScore - int(8, 16));
  const healthHistory = series(90, (k) => Math.round(start + ((healthScore - start) * k) / 89 + (k < 89 ? (R() - 0.5) * 4 : 0))).map((p) => ({ date: p.date, score: Math.min(100, p.v) }));

  const traffic = series(90, (k) => k).map((p) => {
    const k = p.v;
    const d = new Date(p.date).getDay();
    const weekend = d === 0 || d === 6 ? 0.78 : 1;
    const clicks = Math.round(baseClicks * (0.82 + (0.35 * k) / 89) * weekend * (0.9 + R() * 0.2));
    return { date: p.date, clicks, impressions: Math.round(clicks * (26 + R() * 8)) };
  });

  const domainsNow = int(180, 420);
  const history = Array.from({ length: 13 }, (_, w) => ({ date: ago((12 - w) * 7).slice(0, 10), domains: Math.round(domainsNow * (0.84 + (0.16 * w) / 12) + (w < 12 ? int(-4, 4) : 0)) }));

  const project: SeoProject = {
    id: `seo_${clientId}`,
    clientId,
    domain,
    healthScore,
    healthHistory,
    issues,
    keywords,
    backlinks: { total: domainsNow * int(6, 11), referringDomains: domainsNow, newLast30: int(12, 38), lostLast30: int(4, 15), toxic: int(3, 14), history },
    competitors: comps.map(([d, overlap]) => ({ domain: d, overlap, traffic: int(18, 140) * 1000, keywords: int(900, 6500) })),
    contentGaps: gaps.map(([keyword, volume], i) => ({ keyword, volume, competitor: comps[i % comps.length]![0] })),
    briefs: [],
    traffic,
    gscConnected: gsc,
    lastAuditAt: ago(int(1, 6), 3),
  };
  project.briefs = gaps.slice(0, 2).map(([kw], i): ContentBriefX => {
    const b = contentBrief(kw, project, null);
    return { id: `brief_${clientId}_${i}`, keyword: b.keyword, title: b.title, outline: b.outline, wordCount: b.wordCount, questions: b.questions, status: i === 0 ? "Approved" : "Draft", createdAt: ago(int(3, 20)), internalLinks: b.internalLinks };
  });
  return project;
}

export function seedSeoProjects(ctx: SeedCtx): SeoProject[] {
  return [
    build(
      ctx,
      "c_3",
      9301,
      LUMEN_KW,
      [["brightpath-neet.in", 42], ["vidyapeeth-bangalore.in", 35], ["rankersden.co.in", 28], ["apexmedicoaching.com", 21]],
      [["neet coaching electronic city", 590], ["neet scholarship test bangalore", 1900], ["neet hostel facility bangalore", 480], ["neet 2026 exam date", 33100], ["best books for neet biology", 6600], ["neet coaching rajajinagar", 320]],
      true,
      820,
    ),
    build(
      ctx,
      "c_5",
      9305,
      ATLAS_KW,
      [["carewellhospitals.in", 38], ["medinova-hyd.com", 31], ["sunrisehealth.co.in", 26]],
      [["best hospital for knee replacement in hyderabad", 880], ["executive health checkup hyderabad", 1300], ["angioplasty cost in hyderabad", 1600], ["fatty liver diet", 14800], ["24 hour pharmacy gachibowli", 720]],
      false,
      560,
    ),
  ].filter((p): p is SeoProject => !!p);
}
