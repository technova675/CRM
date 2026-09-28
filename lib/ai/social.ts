// Social Media Agent — local, deterministic engine.
// Pure module (no store imports) so seeds can reuse it. Everything derives from real
// inputs: client fields, the client knowledge base, approved strategy pillars and
// the posts' own metrics. Anything not backed by a connected source is labelled.
import type { Client, ClientKnowledge, InsightItem, SocialPlatform, SocialPost, StrategyDoc } from "../types";

export type SocialFormat = SocialPost["format"];

export interface SocialCtx {
  client: Client;
  knowledge?: ClientKnowledge;
  strategies?: StrategyDoc[];
}

// ---------- Deterministic helpers ----------
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const pickBy = <T,>(xs: readonly T[], seed: number) => xs[seed % xs.length]!;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const slugTag = (s: string) => `#${s.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
const city = (c: Client) => c.location.split(/[ ,/]/)[0] ?? c.location;

// ---------- Industry playbooks (fallback when the knowledge base is empty) ----------
interface Playbook {
  pillars: string[];
  tone: string[];
  hashtags: string[];
  audience: string;
  offer: string; // generic CTA object, e.g. "book your stay"
  topics: string[];
  trends: string[];
  competitorArchetypes: string[];
}
const PLAYBOOKS: Record<string, Playbook> = {
  "D2C / E-commerce": {
    pillars: ["Ingredient education", "Real results", "Founder story", "Customer UGC", "Launches & offers"],
    tone: ["warm", "honest", "expert"],
    hashtags: ["#cleanbeauty", "#skincareindia", "#organicskincare", "#d2cindia", "#selfcareroutine"],
    audience: "Women 24–40 in metros who read labels",
    offer: "shop the routine",
    topics: ["your morning routine", "reading an ingredient label", "sensitive skin", "switching to clean products"],
    trends: ["'Get ready with me' routines", "Ingredient deep-dives with on-screen text", "Founder-led unboxing / packing videos", "Dupe & comparison formats (use honestly)"],
    competitorArchetypes: ["Category leader (large D2C brand)", "Ingredient-first challenger", "Marketplace private label"],
  },
  Hospitality: {
    pillars: ["Property tours", "Guest experiences", "Local guides", "Behind the scenes", "Packages & offers"],
    tone: ["relaxed", "inviting", "sunny"],
    hashtags: ["#goadiaries", "#staycation", "#boutiquestay", "#travelindia", "#weekendgetaway"],
    audience: "Couples & friends 25–40 planning weekend getaways",
    offer: "book your stay",
    topics: ["a slow weekend", "sunset spots", "a workation", "monsoon travel"],
    trends: ["Room/villa walkthrough POV reels", "'Things to do in {city}' carousels", "Guest reaction and check-in moments", "Monsoon & off-season value content"],
    competitorArchetypes: ["Premium resort chain", "Villa rental platform", "Boutique homestay collective"],
  },
  "Food & Beverage": {
    pillars: ["Signature dishes", "Kitchen BTS", "Chef stories", "Customer reviews", "Combos & offers"],
    tone: ["bold", "playful", "indulgent"],
    hashtags: ["#foodiesofindia", "#delhifood", "#ncrfoodie", "#foodstagram", "#eatlocal"],
    audience: "Foodies 21–35 who order in and dine out",
    offer: "order now",
    topics: ["the perfect weekend meal", "what goes into our signature dish", "late-night cravings", "a date-night table"],
    trends: ["Close-up 'food ASMR' reels", "Chef-made-it-in-60-seconds", "Menu ranking / 'rate our dishes'", "Street-interview taste tests"],
    competitorArchetypes: ["Cloud-kitchen brand", "Popular casual-dining chain", "Neighbourhood favourite"],
  },
  Fitness: {
    pillars: ["Workout tips", "Member transformations", "Nutrition basics", "Trainer spotlights", "Classes & offers"],
    tone: ["energetic", "supportive", "no-nonsense"],
    hashtags: ["#fitnessmotivation", "#chennaifitness", "#fitindia", "#workouttips", "#homeworkout"],
    audience: "Fitness-curious 22–38 starting or restarting training",
    offer: "book a free trial class",
    topics: ["your first week at the gym", "form mistakes", "protein on a vegetarian diet", "staying consistent"],
    trends: ["Form-check / 'wrong vs right' reels", "30-day challenge series", "Trainer day-in-the-life", "Myth-busting carousels"],
    competitorArchetypes: ["National gym chain", "Boutique studio", "Fitness app with online classes"],
  },
  "Real Estate": {
    pillars: ["Project walkthroughs", "Buyer education", "Location advantages", "Customer stories", "Launches & site visits"],
    tone: ["trustworthy", "clear", "aspirational"],
    hashtags: ["#realestateindia", "#punerealestate", "#homebuyers", "#newlaunch", "#dreamhome"],
    audience: "Home buyers 30–50 comparing projects",
    offer: "book a site visit",
    topics: ["choosing the right floor plan", "home-loan paperwork", "the neighbourhood", "possession timelines"],
    trends: ["Drone + walkthrough reels", "Explainer carousels on RERA and costs", "Resident testimonials"],
    competitorArchetypes: ["Large listed developer", "Property portal", "Local builder"],
  },
  Education: {
    pillars: ["Study tips", "Student results", "Faculty spotlights", "Exam updates", "Admissions"],
    tone: ["encouraging", "credible", "clear"],
    hashtags: ["#studytips", "#examprep", "#bengalurustudents", "#neetprep", "#studygram"],
    audience: "Students 16–24 and their parents",
    offer: "book a free demo class",
    topics: ["last-month revision", "time-table planning", "exam anxiety", "choosing a coaching centre"],
    trends: ["'Study with me' timelapses", "Topper tips series", "Myth vs fact carousels"],
    competitorArchetypes: ["National ed-tech app", "Legacy coaching chain", "YouTube educator"],
  },
  Healthcare: {
    pillars: ["Health education", "Doctor Q&A", "Patient stories", "Preventive care", "Clinic updates"],
    tone: ["caring", "clear", "credible"],
    hashtags: ["#healthtips", "#preventivecare", "#hyderabadhealth", "#askthedoctor", "#wellness"],
    audience: "Adults 30–60 looking for trusted care nearby",
    offer: "book a consultation",
    topics: ["annual health check-ups", "common symptoms to not ignore", "healthy habits", "your first visit"],
    trends: ["Doctor-answers-comments reels", "Symptom explainer carousels", "Myth-busting"],
    competitorArchetypes: ["Hospital chain", "Health-tech platform", "Neighbourhood clinic"],
  },
  Fintech: {
    pillars: ["Money basics", "Product explainers", "Customer stories", "Market updates", "Security & trust"],
    tone: ["clear", "confident", "friendly"],
    hashtags: ["#personalfinance", "#moneytips", "#fintechindia", "#investing101", "#creditscore"],
    audience: "Salaried professionals 25–45 managing money",
    offer: "download the app",
    topics: ["your credit score", "an emergency fund", "your first SIP", "reading your statement"],
    trends: ["Explainer carousels with one idea per slide", "'Money mistakes in your 20s' series", "Founder / expert takes on LinkedIn"],
    competitorArchetypes: ["Large bank's digital arm", "Neo-bank", "Finfluencer"],
  },
};
const DEFAULT_PLAYBOOK: Playbook = {
  pillars: ["Education", "Social proof", "Behind the scenes", "Product spotlight", "Offers"],
  tone: ["friendly", "clear", "helpful"],
  hashtags: ["#smallbusinessindia", "#madeinindia", "#growwithus"],
  audience: "Customers in the client's core market",
  offer: "get in touch",
  topics: ["getting started", "common questions", "what makes us different"],
  trends: ["Short educational reels", "Behind-the-scenes content", "Customer stories"],
  competitorArchetypes: ["Category leader", "Direct competitor", "Marketplace alternative"],
};
export const playbookFor = (industry: string) => PLAYBOOKS[industry] ?? DEFAULT_PLAYBOOK;

// ---------- Platform best practice ----------
export const PLATFORM_FORMATS: Record<SocialPlatform, { format: SocialFormat; weight: number }[]> = {
  Instagram: [{ format: "Reel", weight: 5 }, { format: "Carousel", weight: 3 }, { format: "Static", weight: 1 }, { format: "Story", weight: 1 }],
  Facebook: [{ format: "Reel", weight: 4 }, { format: "Static", weight: 4 }, { format: "Carousel", weight: 2 }],
  LinkedIn: [{ format: "Carousel", weight: 4 }, { format: "Static", weight: 3 }, { format: "Text", weight: 3 }],
  YouTube: [{ format: "Short", weight: 1 }],
  X: [{ format: "Text", weight: 7 }, { format: "Static", weight: 3 }],
};
// Common benchmark windows (industry guidance, not client data) — used until the client has enough history.
export const BEST_HOURS: Record<SocialPlatform, number[]> = {
  Instagram: [12, 19, 21],
  Facebook: [13, 20],
  LinkedIn: [9, 12, 17],
  YouTube: [18, 20],
  X: [9, 13, 18],
};
export const HASHTAG_RANGE: Record<SocialPlatform, [number, number]> = { Instagram: [3, 10], Facebook: [0, 3], LinkedIn: [3, 5], YouTube: [2, 3], X: [0, 2] };
const CAPTION_RANGE: Record<SocialPlatform, [number, number]> = { Instagram: [80, 1200], Facebook: [40, 500], LinkedIn: [150, 1300], YouTube: [20, 300], X: [20, 280] };
const VALID_FORMATS: Record<SocialPlatform, SocialFormat[]> = {
  Instagram: ["Reel", "Carousel", "Static", "Story"],
  Facebook: ["Reel", "Static", "Carousel", "Story", "Text"],
  LinkedIn: ["Carousel", "Static", "Text", "Short"],
  YouTube: ["Short"],
  X: ["Text", "Static"],
};
export function defaultPlatforms(client: Client): SocialPlatform[] {
  if (["Fintech", "Real Estate", "Education"].includes(client.industry)) return ["Instagram", "LinkedIn"];
  if (["Fitness", "Food & Beverage"].includes(client.industry)) return ["Instagram", "Facebook", "YouTube"];
  return ["Instagram", "Facebook"];
}

// ---------- Brand context ----------
export function brandContext(ctx: SocialCtx) {
  const pb = playbookFor(ctx.client.industry);
  const k = ctx.knowledge;
  const tone = k?.toneWords?.length ? k.toneWords : pb.tone;
  const products = k?.products?.length ? k.products : [];
  return {
    pb,
    tone,
    products,
    audience: k?.audience || pb.audience,
    voice: k?.brandVoice || "",
    approved: k?.approvedMessaging ?? [],
    rejected: k?.rejectedConcepts ?? [],
    competitors: k?.competitors ?? [],
    fromKnowledge: !!k,
  };
}

// Content pillars: approved strategy → knowledge base → industry playbook.
export function pillarsFor(ctx: SocialCtx): { pillars: string[]; source: string; note: InsightItem } {
  const approved = (ctx.strategies ?? [])
    .filter((s) => s.clientId === ctx.client.id && s.status === "Approved")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const sec = approved?.sections.find((s) => s.key === "pillars");
  if (sec?.items.length) {
    const pillars = sec.items
      .map((i) => i.text.replace(/^pillar\s*\d*[:.-]\s*/i, "").split(/ — | - |: |\. /)[0]!.trim())
      .filter((p) => p.length > 2)
      .map((p) => (p.length > 40 ? `${p.slice(0, 38)}…` : p))
      .slice(0, 6);
    if (pillars.length) return { pillars, source: `Approved strategy · ${approved!.title}`, note: { kind: "data", text: `Pillars taken from the approved strategy "${approved!.title}" (v${approved!.version}).`, source: "Strategy" } };
  }
  const k = ctx.knowledge;
  const pb = playbookFor(ctx.client.industry);
  if (k && (k.products.length || k.approvedMessaging.length)) {
    const fromProducts = k.products.slice(0, 2).map((p) => `${p.name} spotlight`);
    const pillars = [...new Set([...fromProducts, ...pb.pillars])].slice(0, 5);
    return { pillars, source: "Client knowledge base + industry playbook", note: { kind: "assumption", text: `No approved strategy pillars — built from the knowledge base products (${k.products.map((p) => p.name).slice(0, 2).join(", ") || "none"}) and ${ctx.client.industry} best practice.`, source: "Client knowledge base" } };
  }
  return { pillars: pb.pillars, source: `${ctx.client.industry} playbook`, note: { kind: "assumption", text: `No approved strategy or knowledge base for ${ctx.client.company} — using the ${ctx.client.industry} pillar playbook. Approve a strategy with a pillars section to override.` } };
}

// ---------- Copy generation ----------
function topicFor(ctx: SocialCtx, pillar: string, seed: number) {
  const b = brandContext(ctx);
  const prod = b.products.length ? pickBy(b.products, seed) : undefined;
  if (prod && /spotlight|product|launch|offer/i.test(pillar)) return prod.name;
  return pickBy(b.pb.topics, seed).replace("{city}", city(ctx.client));
}

const HOOK_TEMPLATES = [
  (t: string) => `3 things nobody tells you about ${t}`,
  (t: string) => `Save this before you plan ${t}`,
  (t: string) => `The ${t} mistake most people make`,
  (t: string, c: string) => `${c}, this one's for you`,
  (t: string) => `POV: you finally got ${t} right`,
  (t: string) => `We asked our team about ${t}. Here's what they said`,
  (t: string) => `${t} in 30 seconds`,
  (t: string, _c: string, brand: string) => `What actually happens behind the scenes at ${brand}`,
  (t: string) => `Stop scrolling if ${t} is on your list`,
  (t: string) => `Is ${t} worth it? An honest answer`,
];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function hookOptions(post: Pick<SocialPost, "pillar" | "format" | "id">, ctx: SocialCtx, n = 5, salt = 0): string[] {
  const base = hash(`${post.id}|${post.pillar}|${salt}`);
  const out: string[] = [];
  for (let i = 0; out.length < n && i < HOOK_TEMPLATES.length * 2; i++) {
    const t = topicFor(ctx, post.pillar, base + i);
    const h = cap(HOOK_TEMPLATES[(base + i * 3) % HOOK_TEMPLATES.length]!(t, city(ctx.client), ctx.client.company));
    if (!out.includes(h)) out.push(h);
  }
  return out;
}

const CTA: Record<SocialFormat, string[]> = {
  Reel: ["Follow for more like this.", "Share this with someone who needs it.", "Comment 'YES' and we'll DM you the details."],
  Carousel: ["Save this for later.", "Swipe to the end and tell us which one you'd pick.", "Share it with your planning buddy."],
  Static: ["Tap the link in bio.", "Drop your questions below.", "Tag a friend who'd love this."],
  Story: ["Tap the sticker to vote.", "Reply to this story — we read every one."],
  Text: ["What would you add? Comment below.", "Repost if this was useful."],
  Short: ["Subscribe for weekly tips.", "Watch the full video on our channel."],
};

export function generateCaption(post: Pick<SocialPost, "id" | "pillar" | "format" | "platform" | "hook">, ctx: SocialCtx, variant = 0) {
  const b = brandContext(ctx);
  const seed = hash(`${post.id}|cap|${variant}`);
  const topic = topicFor(ctx, post.pillar, seed);
  const prod = b.products.length ? pickBy(b.products, seed + 1) : undefined;
  const lines: string[] = [post.hook || hookOptions(post, ctx, 1, variant)[0]!];
  const body = [
    `${cap(post.pillar)} is at the heart of what we do at ${ctx.client.company}.`,
    `Here's our take on ${topic} — made for ${b.audience.charAt(0).toLowerCase()}${b.audience.slice(1)}.`,
    `Real talk on ${topic}, the ${b.tone[0] ?? "honest"} way.`,
  ];
  lines.push(pickBy(body, seed));
  if (prod?.usp) lines.push(`${prod.name}: ${prod.usp}.`);
  if (b.approved.length) lines.push(pickBy(b.approved, seed + 2));
  if (post.format === "Carousel") lines.push("Swipe through → each slide is one idea you can use today.");
  if (post.format === "Reel" || post.format === "Short") lines.push("Watch till the end for the best part.");
  lines.push(`${pickBy(CTA[post.format], seed + 3)} ${post.format === "Static" || post.format === "Reel" ? `Ready to ${b.pb.offer}? Link in bio.` : ""}`.trim());
  let text = lines.join("\n\n");
  if (post.platform === "X") text = [lines[0], lines[1], pickBy(CTA.Text, seed)].join(" ").slice(0, 270);
  if (post.platform === "LinkedIn") text = text.replace(/Link in bio\./g, "Link in comments.").replace(/Comment 'YES'.*?details\./, "What's your take?");
  return text;
}

export function hashtagsFor(post: Pick<SocialPost, "pillar" | "platform" | "id">, ctx: SocialCtx, salt = 0): string[] {
  const b = brandContext(ctx);
  const [min, max] = HASHTAG_RANGE[post.platform];
  const target = Math.max(min, Math.min(max, post.platform === "Instagram" ? 7 : max));
  const seed = hash(`${post.id}|tags|${salt}`);
  const pool = [
    slugTag(ctx.client.company),
    slugTag(post.pillar),
    ...[...b.pb.hashtags].sort((x, y) => (hash(x + seed) % 7) - (hash(y + seed) % 7)),
    slugTag(city(ctx.client)),
    ...b.products.slice(0, 2).map((p) => slugTag(p.name)),
  ];
  return [...new Set(pool)].filter((t) => t.length > 2).slice(0, target);
}

// ---------- Calendar generation ----------
export interface CalendarOpts {
  year: number;
  month: number; // 0-based
  platforms: SocialPlatform[];
  postsPerWeek: number; // per platform
  ownerId: string;
  stage?: SocialPost["stage"];
  idPrefix?: string;
}
export function generateCalendar(ctx: SocialCtx, o: CalendarOpts): SocialPost[] {
  const { pillars } = pillarsFor(ctx);
  const daysInMonth = new Date(o.year, o.month + 1, 0).getDate();
  const perPlatform = Math.max(1, Math.round((o.postsPerWeek * daysInMonth) / 7));
  const posts: SocialPost[] = [];
  const createdAt = new Date().toISOString();
  o.platforms.forEach((platform, pi) => {
    const mix = PLATFORM_FORMATS[platform];
    const bag: SocialFormat[] = mix.flatMap((m) => Array(m.weight).fill(m.format) as SocialFormat[]);
    const step = daysInMonth / perPlatform;
    for (let i = 0; i < perPlatform; i++) {
      const day = Math.min(daysInMonth, Math.floor(i * step + 1 + ((pi * 2) % Math.max(1, Math.floor(step)))));
      const hours = BEST_HOURS[platform];
      const hour = hours[(i + pi) % hours.length]!;
      const format = bag[(i * 7 + pi * 3) % bag.length]!;
      const pillar = pillars[(i + pi) % pillars.length]!;
      const id = `${o.idPrefix ?? "sp"}_${ctx.client.id}_${o.year}${o.month}_${platform.slice(0, 2)}${i}_${hash(createdAt + i + platform).toString(36).slice(0, 4)}`;
      const base = { id, pillar, format, platform };
      const hook = hookOptions(base, ctx, 1)[0]!;
      const when = new Date(o.year, o.month, day, hour, 0, 0, 0);
      posts.push({
        id,
        clientId: ctx.client.id,
        platform,
        format,
        stage: o.stage ?? "Draft",
        pillar,
        title: `${format} · ${pillar}`,
        hook,
        caption: generateCaption({ ...base, hook }, ctx),
        hashtags: hashtagsFor(base, ctx),
        scheduledAt: when.toISOString(),
        ownerId: o.ownerId,
        createdAt,
      });
    }
  });
  return posts.sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
}

// ---------- Idea generators ----------
export interface ReelIdea { title: string; pillar: string; hook: string; beats: string[]; note: string }
export interface CarouselIdea { title: string; pillar: string; hook: string; slides: string[] }
export interface StaticIdea { title: string; pillar: string; headline: string; visual: string; caption: string }

export function reelIdeas(ctx: SocialCtx, n = 5, salt = 0): ReelIdea[] {
  const { pillars } = pillarsFor(ctx);
  const b = brandContext(ctx);
  return Array.from({ length: n }, (_, i) => {
    const pillar = pillars[(i + salt) % pillars.length]!;
    const seed = hash(`${ctx.client.id}|reel|${i}|${salt}`);
    const topic = topicFor(ctx, pillar, seed);
    const hook = hookOptions({ id: `reel${i}${salt}`, pillar, format: "Reel" }, ctx, 1, salt)[0]!;
    return {
      title: `${cap(topic)} — ${pillar}`,
      pillar,
      hook,
      beats: [`0–2s: on-screen text "${hook}" over the strongest visual`, `2–8s: show the problem / moment around ${topic}`, `8–20s: 3 quick cuts showing how ${ctx.client.company} handles it`, `20–25s: proof (review, result or team member on camera)`, `25–30s: CTA — ${b.pb.offer}`],
      note: `9:16, 20–30s, captions burned in, trending-style audio (check licence). Tone: ${b.tone.slice(0, 2).join(", ")}.`,
    };
  });
}
export function carouselIdeas(ctx: SocialCtx, n = 3, salt = 0): CarouselIdea[] {
  const { pillars } = pillarsFor(ctx);
  const b = brandContext(ctx);
  return Array.from({ length: n }, (_, i) => {
    const pillar = pillars[(i + 1 + salt) % pillars.length]!;
    const seed = hash(`${ctx.client.id}|car|${i}|${salt}`);
    const topic = topicFor(ctx, pillar, seed);
    const prod = b.products.length ? pickBy(b.products, seed) : undefined;
    return {
      title: `${cap(topic)}: a ${pillar.toLowerCase()} guide`,
      pillar,
      hook: `${cap(topic)}: 5 things to know`,
      slides: [
        `Slide 1 (cover): "${cap(topic)}: 5 things to know" — bold type, brand colour`,
        `Slide 2: the most common question about ${topic}`,
        `Slide 3: tip #1 with a simple visual`,
        `Slide 4: tip #2 — a before/after or comparison`,
        `Slide 5: tip #3 — the one people skip`,
        prod ? `Slide 6: how ${prod.name} helps (${prod.usp})` : `Slide 6: how ${ctx.client.company} helps`,
        `Slide 7: recap in one line`,
        `Slide 8: CTA — save this & ${b.pb.offer}`,
      ],
    };
  });
}
export function staticIdeas(ctx: SocialCtx, n = 3, salt = 0): StaticIdea[] {
  const { pillars } = pillarsFor(ctx);
  const b = brandContext(ctx);
  return Array.from({ length: n }, (_, i) => {
    const pillar = pillars[(i + 2 + salt) % pillars.length]!;
    const seed = hash(`${ctx.client.id}|st|${i}|${salt}`);
    const topic = topicFor(ctx, pillar, seed);
    const headline = pickBy([`${cap(topic)}, simplified.`, `Your guide to ${topic}`, `Made for ${city(ctx.client)}.`, `The ${b.tone[0] ?? "honest"} way to do ${topic}`], seed);
    return {
      title: `${pillar}: ${topic}`,
      pillar,
      headline,
      visual: pickBy(["Product/hero shot on brand-colour background, headline top-left", "Quote card with a customer review (use a real, consented review)", "Clean photo with a single stat or fact from the knowledge base", "Team member portrait with a one-line tip"], seed + 1),
      caption: `${headline} ${pickBy(CTA.Static, seed)}`,
    };
  });
}

// ---------- AI review ----------
const CTA_RE = /(link in bio|link in comments|save|share|comment|book|shop|dm|tap|follow|sign up|visit|order|download|subscribe|reply|swipe|vote)/i;
export function reviewPost(post: SocialPost, ctx: SocialCtx): { score: number; notes: InsightItem[] } {
  const b = brandContext(ctx);
  const notes: InsightItem[] = [];
  let score = 100;
  const hookWords = words(post.hook);
  const len = post.caption.length;
  const [cmin, cmax] = CAPTION_RANGE[post.platform];
  const [hmin, hmax] = HASHTAG_RANGE[post.platform];
  const tags = post.hashtags.length;

  notes.push({ kind: "data", text: `Caption length ${len} characters${post.platform === "Instagram" ? ` · first 125 visible before "more"` : ""} (guide ${cmin}–${cmax}).`, source: "Draft" });
  notes.push({ kind: "data", text: `Hook ${hookWords} words · ${tags} hashtags (guide ${hmin}–${hmax} for ${post.platform}).`, source: "Draft" });

  if (!post.hook.trim()) { score -= 20; notes.push({ kind: "recommendation", text: "Add a hook — the first line decides whether people stop scrolling." }); }
  else if (hookWords > 12) { score -= 12; notes.push({ kind: "recommendation", text: `Hook is ${hookWords} words (> 12) — cut it to 12 or fewer so it fits the first line / first 2 seconds.` }); }
  if (post.platform === "X" && len > 280) { score -= 30; notes.push({ kind: "recommendation", text: `Caption is ${len} characters — X allows 280. Shorten before scheduling.` }); }
  else if (len > cmax) { score -= 8; notes.push({ kind: "recommendation", text: `Caption is long for ${post.platform} (${len} > ${cmax}) — front-load the value and trim.` }); }
  else if (len < cmin) { score -= 6; notes.push({ kind: "recommendation", text: `Caption is thin (${len} < ${cmin}) — add one line of context or value.` }); }
  if (tags > hmax) { score -= 8; notes.push({ kind: "recommendation", text: `${tags} hashtags is above the ${hmax} guideline for ${post.platform} — keep the most specific ones.` }); }
  else if (tags < hmin) { score -= 5; notes.push({ kind: "recommendation", text: `Add ${hmin - tags} more niche hashtag(s) for ${post.platform} discovery.` }); }
  if (!CTA_RE.test(post.caption)) { score -= 10; notes.push({ kind: "recommendation", text: "No clear call to action — end with one action (save, comment, book, link in bio)." }); }
  if (!VALID_FORMATS[post.platform].includes(post.format)) { score -= 15; notes.push({ kind: "recommendation", text: `${post.format} isn't a native format on ${post.platform} — switch to ${VALID_FORMATS[post.platform].join(" / ")}.` }); }
  const lower = `${post.hook} ${post.caption}`.toLowerCase();
  const rejectedHit = b.rejected.find((r) => r && lower.includes(r.toLowerCase().split(/\s+/).slice(0, 3).join(" ")));
  if (rejectedHit) { score -= 20; notes.push({ kind: "recommendation", text: `Resembles a rejected concept in the knowledge base ("${rejectedHit}") — rework the angle.`, source: "Client knowledge base" }); }
  const toneHits = b.tone.filter((t) => lower.includes(t.toLowerCase()));
  notes.push({ kind: "assumption", text: b.fromKnowledge ? `Brand tone words (${b.tone.join(", ")}) are applied via wording, not keywords — ${toneHits.length ? "copy references the tone directly" : "tone judged from phrasing only"}; a human should confirm voice fit.` : `No knowledge base for ${ctx.client.company} — tone checked against the ${ctx.client.industry} default (${b.tone.join(", ")}).` });
  if (post.scheduledAt) {
    const h = new Date(post.scheduledAt).getHours();
    const best = BEST_HOURS[post.platform];
    if (!best.some((x) => Math.abs(x - h) <= 1)) { score -= 4; notes.push({ kind: "recommendation", text: `Scheduled at ${h}:00 — typical ${post.platform} engagement windows are ${best.map((x) => `${x}:00`).join(", ")} (benchmark until the account has its own history).` }); }
  }
  if ((post.format === "Reel" || post.format === "Short") && !/watch|till the end|part 2|wait/i.test(post.caption)) notes.push({ kind: "recommendation", text: "For video, add on-screen text of the hook in the first 2 seconds and burn in captions." });
  if (score >= 85) notes.push({ kind: "recommendation", text: "Ready for human approval." });
  return { score: Math.max(0, Math.min(100, score)), notes };
}

// ---------- Performance analysis ----------
export interface PerfRow { key: string; posts: number; reach: number; avgReach: number; er: number; saves: number; shares: number }
export function aggregateBy(posts: SocialPost[], key: (p: SocialPost) => string): PerfRow[] {
  const m = new Map<string, { posts: number; reach: number; erSum: number; saves: number; shares: number }>();
  posts.forEach((p) => {
    if (!p.metrics) return;
    const k = key(p);
    const cur = m.get(k) ?? { posts: 0, reach: 0, erSum: 0, saves: 0, shares: 0 };
    cur.posts++;
    cur.reach += p.metrics.reach;
    cur.erSum += p.metrics.er;
    cur.saves += p.metrics.saves;
    cur.shares += p.metrics.shares;
    m.set(k, cur);
  });
  return [...m.entries()]
    .map(([k, v]) => ({ key: k, posts: v.posts, reach: v.reach, avgReach: Math.round(v.reach / v.posts), er: +(v.erSum / v.posts).toFixed(2), saves: v.saves, shares: v.shares }))
    .sort((a, b) => b.er - a.er);
}
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function bestPostingTimes(posts: SocialPost[]) {
  const slots = aggregateBy(posts.filter((p) => p.publishedAt), (p) => {
    const d = new Date(p.publishedAt!);
    const h = d.getHours();
    const band = h < 11 ? "Morning (6–11)" : h < 15 ? "Midday (11–15)" : h < 19 ? "Evening (15–19)" : "Night (19–24)";
    return band;
  });
  const days = aggregateBy(posts.filter((p) => p.publishedAt), (p) => DOW[new Date(p.publishedAt!).getDay()]!);
  return { slots, days };
}

export function performanceInsights(posts: SocialPost[], label: string): InsightItem[] {
  const pub = posts.filter((p) => p.metrics);
  const src = `Published post metrics · ${label}`;
  if (pub.length < 3) return [{ kind: "assumption", text: `Only ${pub.length} published post(s) with metrics — need at least 3 for meaningful patterns.`, source: src }];
  const out: InsightItem[] = [];
  const byFormat = aggregateBy(pub, (p) => p.format);
  const byPillar = aggregateBy(pub, (p) => p.pillar);
  const byPlatform = aggregateBy(pub, (p) => p.platform);
  const avgEr = pub.reduce((a, p) => a + p.metrics!.er, 0) / pub.length;
  out.push({ kind: "data", text: `${pub.length} published posts · avg ER ${avgEr.toFixed(2)}% · total reach ${pub.reduce((a, p) => a + p.metrics!.reach, 0).toLocaleString("en-IN")}.`, source: src });
  const bf = byFormat[0], wf = byFormat[byFormat.length - 1];
  if (bf && wf && bf.key !== wf.key) out.push({ kind: "data", text: `${bf.key}s lead on engagement (${bf.er}% ER, n=${bf.posts}) vs ${wf.key}s (${wf.er}% ER, n=${wf.posts}).`, source: src });
  const bp = byPillar[0], wp = byPillar[byPillar.length - 1];
  if (bp && wp && bp.key !== wp.key) out.push({ kind: "data", text: `Top pillar: "${bp.key}" (${bp.er}% ER); weakest: "${wp.key}" (${wp.er}% ER).`, source: src });
  const saveLeader = [...byFormat].sort((a, b) => b.saves / b.posts - a.saves / a.posts)[0];
  if (saveLeader) out.push({ kind: "data", text: `${saveLeader.key}s earn the most saves per post (${Math.round(saveLeader.saves / saveLeader.posts)}).`, source: src });
  if (byPlatform.length > 1) out.push({ kind: "data", text: `By platform: ${byPlatform.map((p) => `${p.key} ${p.er}%`).join(" · ")} ER.`, source: src });
  const { slots } = bestPostingTimes(pub);
  if (slots[0]) out.push({ kind: "data", text: `Best time band so far: ${slots[0].key} (${slots[0].er}% ER across ${slots[0].posts} posts).`, source: src });
  if (bf) out.push({ kind: "assumption", text: `${bf.key}s likely outperform because the platform currently favours this format for non-follower reach; sample sizes are small, so treat as directional.` });
  if (bf && wf && bf.key !== wf.key) out.push({ kind: "recommendation", text: `Shift ~20% of ${wf.key} slots to ${bf.key}s next month and re-check ER after 2 weeks.` });
  if (bp && wp && bp.key !== wp.key) out.push({ kind: "recommendation", text: `Test a new angle for "${wp.key}" (e.g. customer story or carousel format) before cutting it — it may be a format problem, not a topic problem.` });
  if (slots[0]) out.push({ kind: "recommendation", text: `Schedule the next month's hero posts in the ${slots[0].key.toLowerCase()} band.` });
  return out;
}

// ---------- Listening panels (sample until a social-listening integration is connected) ----------
export interface CompetitorSample { name: string; fromKnowledge: boolean; cadence: string; formats: string; themes: string[]; opportunity: string }
export function competitorAnalysis(ctx: SocialCtx): CompetitorSample[] {
  const b = brandContext(ctx);
  const names = b.competitors.length ? b.competitors.slice(0, 4) : b.pb.competitorArchetypes;
  return names.map((name) => {
    const h = hash(name);
    const themes = [...b.pb.pillars].sort((x, y) => (hash(x + name) % 5) - (hash(y + name) % 5)).slice(0, 2);
    return {
      name,
      fromKnowledge: b.competitors.length > 0,
      cadence: `~${3 + (h % 5)} posts/week (illustrative)`,
      formats: pickBy(["Reel-heavy", "Carousel-led", "Mixed Reels + Static", "Static + Stories"], h),
      themes,
      opportunity: pickBy([`Own "${b.pb.pillars[h % b.pb.pillars.length]}" with a recurring weekly series`, "Out-educate them with save-worthy carousels", "Show real people — faces outperform product-only content", "Reply faster in comments and DMs to build community"], h >> 3),
    };
  });
}
export function contentGaps(ctx: SocialCtx, posts: SocialPost[]): InsightItem[] {
  const { pillars } = pillarsFor(ctx);
  const recent = posts.filter((p) => p.clientId === ctx.client.id);
  const out: InsightItem[] = [];
  if (!recent.length) return [{ kind: "assumption", text: "No posts yet for this client — generate a content calendar first." }];
  const byPillar = new Map<string, number>();
  recent.forEach((p) => byPillar.set(p.pillar, (byPillar.get(p.pillar) ?? 0) + 1));
  const missing = pillars.filter((p) => !byPillar.get(p));
  out.push({ kind: "data", text: `Pillar coverage (${recent.length} posts): ${[...byPillar.entries()].map(([k, v]) => `${k} ${v}`).join(" · ")}.`, source: "Social calendar" });
  if (missing.length) out.push({ kind: "recommendation", text: `No posts for pillar(s): ${missing.join(", ")} — add at least 2 per month.` });
  const fmts = new Map<string, number>();
  recent.forEach((p) => fmts.set(p.format, (fmts.get(p.format) ?? 0) + 1));
  const reelShare = ((fmts.get("Reel") ?? 0) + (fmts.get("Short") ?? 0)) / recent.length;
  out.push({ kind: "data", text: `Format mix: ${[...fmts.entries()].map(([k, v]) => `${k} ${Math.round((v / recent.length) * 100)}%`).join(" · ")}.`, source: "Social calendar" });
  if (reelShare < 0.35) out.push({ kind: "recommendation", text: `Short-form video is ${Math.round(reelShare * 100)}% of the mix — aim for 40–50% on Instagram.` });
  if (!fmts.get("Carousel")) out.push({ kind: "recommendation", text: "No carousels planned — they drive saves; add 1–2 educational carousels per week." });
  if (!fmts.get("Story")) out.push({ kind: "recommendation", text: "No Stories planned — use polls/questions to feed comments and DMs." });
  out.push({ kind: "assumption", text: `Competitor themes used for comparison are illustrative (${ctx.client.industry} archetypes / knowledge-base competitor names) until a social listening integration is connected.` });
  return out;
}
export function trendSignals(ctx: SocialCtx) {
  const pb = playbookFor(ctx.client.industry);
  return pb.trends.map((t, i) => ({ trend: t.replace("{city}", city(ctx.client)), fit: ["High", "High", "Medium", "Medium"][i] ?? "Medium", idea: `Adapt for ${ctx.client.company}: ${pillarsFor(ctx).pillars[i % pillarsFor(ctx).pillars.length]}` }));
}
