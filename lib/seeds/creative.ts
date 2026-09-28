import type { AdRow, Creative, CreativeComment, CreativeConcept, CreativeVersion } from "../types";
import { deriveCreativeInputs, generateConcepts, SWATCHES } from "../ai/creative";
import { ago, makeRand, type SeedCtx } from "./context";

// Owned by the Creative Studio module.
type Def = {
  clientId: string;
  title: string;
  type: Creative["type"];
  platform: string;
  format: string;
  status: Creative["status"];
  angle: string;
  hook?: string;
  owner: string;
  versions: { note: string; headline?: string; body?: string; cta?: string; fileName?: string; by?: string }[];
  comments?: { by: string; body: string; v: number; internal?: boolean; resolved?: boolean }[];
  ad?: "Meta" | "Google";
  ai?: boolean;
  days: number;
};

const DEFS: Def[] = [
  // ---- Bloom Organics (client portal user u_client1) ----
  { clientId: "c_1", title: "Clean skin ritual — UGC reel", type: "Video", platform: "Meta", format: "9:16 Reel", status: "Live", angle: "Real results & reviews", hook: "POV: you finally found…", owner: "u_ve1", ad: "Meta", days: 21,
    versions: [{ note: "First cut from creator footage", headline: "Your 3-step clean ritual", body: "Creator morning routine · 25s", cta: "Shop now", fileName: "bloom_ugc_ritual_v1.mp4" }, { note: "Tighter hook, captions burned in", headline: "Your 3-step clean ritual", body: "Opens on the result shot · 22s", cta: "Shop now", fileName: "bloom_ugc_ritual_v2.mp4" }],
    comments: [{ by: "u_cs1", body: "Hook lands at 2.5s — move the result shot to frame one.", v: 1, internal: true, resolved: true }, { by: "u_client1", body: "Love the v2 opening. Approved!", v: 2 }] },
  { clientId: "c_1", title: "Ingredient transparency carousel", type: "Carousel", platform: "Meta", format: "4:5 Carousel", status: "Client Review", angle: "Ingredient education", hook: "3 mistakes everyone makes with…", owner: "u_des1", days: 2,
    versions: [{ note: "5-card draft", headline: "What's really in your moisturiser?", body: "Card 1 hook · Cards 2–4 ingredients · Card 5 offer", cta: "Learn more" }, { note: "Switched to the sage palette, added certifications card", headline: "What's really in your moisturiser?", body: "6 cards incl. certifications", cta: "Shop now", fileName: "bloom_ingredients_v2.pdf" }],
    comments: [{ by: "u_client1", body: "Can we use our sage green instead of beige?", v: 1, resolved: true }, { by: "u_des1", body: "Sage palette applied + certification card added.", v: 2 }, { by: "u_am1", body: "Client is price-sensitive this month — keep the offer card soft.", v: 2, internal: true }] },
  { clientId: "c_1", title: "Founder story — 30s", type: "Video", platform: "Meta", format: "9:16 Reel", status: "Changes Requested", angle: "Founder & sourcing story", hook: "Founder story: why we started", owner: "u_ve1", days: 4,
    versions: [{ note: "Interview cut", headline: "Why Meera started Bloom", body: "Founder to camera + farm b-roll · 30s", cta: "Learn more", fileName: "bloom_founder_v1.mp4" }, { note: "Shorter intro", headline: "Why Meera started Bloom", body: "28s, b-roll first", cta: "Learn more", fileName: "bloom_founder_v2.mp4" }],
    comments: [{ by: "u_client1", body: "Please remove the part about competitor brands and add the farm visit shots.", v: 2 }, { by: "u_ve1", body: "Farm footage requested from the client's drive.", v: 2, internal: true }] },
  { clientId: "c_1", title: "Launch bundle — static", type: "Image", platform: "Meta", format: "1:1 Static", status: "Approved", angle: "Offers & drops", owner: "u_des1", days: 6,
    versions: [{ note: "Bundle hero", headline: "The Glow Bundle — save 20%", body: "Three hero SKUs flat-lay", cta: "Shop now", fileName: "bloom_bundle_1x1.png" }],
    comments: [{ by: "u_client1", body: "Looks great, go ahead.", v: 1 }] },
  { clientId: "c_1", title: "Glow Bundle landing page", type: "Landing Page", platform: "Website", format: "Mobile-first LP", status: "Internal Review", angle: "Offers & drops", owner: "u_des1", days: 1,
    versions: [{ note: "Wireframe → hi-fi", headline: "Everything your skin needs. Nothing it doesn't.", body: "Hero · ingredients · reviews · bundle picker · FAQ", cta: "Buy the bundle" }],
    comments: [{ by: "u_mkt1", body: "Add review stars above the fold — CVR test planned week 3.", v: 1, internal: true }] },
  { clientId: "c_1", title: "Monsoon offer — ad copy set", type: "Copy", platform: "Meta", format: "Primary text × 5", status: "Draft", angle: "Rituals & how-to", owner: "u_cs1", ai: true, days: 0,
    versions: [{ note: "AI draft from creative agent", headline: "Monsoon-proof your skin", body: "5 primary-text variations, 125 chars each", cta: "Shop now", by: "ai" }] },

  // ---- Cedar Realty ----
  { clientId: "c_2", title: "Possession-ready walkthrough", type: "Video", platform: "Meta", format: "9:16 Reel", status: "Live", angle: "Possession certainty", hook: "Before / after in 7 days", owner: "u_ve1", ad: "Meta", days: 30,
    versions: [{ note: "Drone + interiors", headline: "Move in this Diwali", fileName: "cedar_walkthrough_v1.mp4" }, { note: "Added price-lock end card", headline: "Move in this Diwali", cta: "Book site visit", fileName: "cedar_walkthrough_v2.mp4" }, { note: "Hindi captions", headline: "Move in this Diwali", cta: "Book site visit", fileName: "cedar_walkthrough_v3.mp4" }],
    comments: [{ by: "u_am1", body: "Client approved v3 on call.", v: 3, internal: true }] },
  { clientId: "c_2", title: "Search ads — 2BHK Pune", type: "Ad", platform: "Google", format: "RSA 15 headlines", status: "Live", angle: "Location advantage", owner: "u_mkt2", ad: "Google", days: 40,
    versions: [{ note: "RSA set", headline: "2BHK in Baner | Ready to Move", body: "15 headlines, 4 descriptions; pinned brand in H1", cta: "Enquire now" }] },
  { clientId: "c_2", title: "Price-lock offer — static", type: "Image", platform: "Meta", format: "1:1 Static", status: "Client Review", angle: "Price-lock offer", owner: "u_des1", days: 1,
    versions: [{ note: "Offer creative", headline: "Lock 2025 prices till 31 Oct", cta: "Book site visit" }] },
  { clientId: "c_2", title: "Site-visit weekend campaign pack", type: "Campaign", platform: "Meta + Google", format: "Campaign plan", status: "Internal Review", angle: "Virtual site visit", owner: "u_cs1", days: 2,
    versions: [{ note: "Plan + creative list", headline: "Weekend site-visit push", body: "3 ad sets, 6 creatives, WhatsApp follow-up flow" }] },

  // ---- Lumen Academy ----
  { clientId: "c_3", title: "Free demo class reel", type: "Video", platform: "Meta", format: "9:16 Reel", status: "Draft", angle: "Free demo class", owner: "u_ve1", days: 0,
    versions: [{ note: "Script locked, shoot Friday", headline: "Try a NEET class free", body: "Faculty hook → demo clip → CTA" }] },
  { clientId: "c_3", title: "Topper results — static", type: "Image", platform: "Meta", format: "4:5 Static", status: "Approved", angle: "Results & toppers", owner: "u_des1", days: 5,
    versions: [{ note: "Results creative", headline: "42 selections in 2025", cta: "Book a demo" }, { note: "Updated count after final list", headline: "47 selections in 2025", cta: "Book a demo" }] },

  // ---- Coral Stays ----
  { clientId: "c_4", title: "Monsoon getaway carousel", type: "Carousel", platform: "Instagram", format: "4:5 Carousel", status: "Client Review", angle: "Experiences & views", owner: "u_des1", days: 1,
    versions: [{ note: "Villa photos + itinerary", headline: "Goa in the rain hits different", cta: "Book direct" }] },

  // ---- Ember Kitchen ----
  { clientId: "c_6", title: "Signature biryani close-up", type: "Video", platform: "Meta", format: "9:16 Reel", status: "Live", angle: "Signature dishes", hook: "Stop scrolling if you…", owner: "u_ve1", ad: "Meta", days: 35,
    versions: [{ note: "Steam shot", headline: "Dum biryani, done right", cta: "Order now", fileName: "ember_biryani.mp4" }] },
  { clientId: "c_6", title: "Weeknight combo — static", type: "Image", platform: "Meta", format: "1:1 Static", status: "Changes Requested", angle: "Offers & combos", owner: "u_des1", days: 3,
    versions: [{ note: "Combo card", headline: "2 mains + dessert ₹499", cta: "Order now" }],
    comments: [{ by: "u_am1", body: "Client wants the price larger and the Zomato badge added.", v: 1 }] },

  // ---- Orbit Finance ----
  { clientId: "c_7", title: "Tax-season display banners", type: "Image", platform: "DV360", format: "300×250 · 728×90 · 320×50", status: "Archived", angle: "Tax-season urgency", owner: "u_des1", days: 120,
    versions: [{ note: "IAB set", headline: "Save tax in 5 minutes", cta: "Start now" }] },

  // ---- Zen Fitness ----
  { clientId: "c_8", title: "15-minute workout — UGC", type: "Video", platform: "Meta", format: "9:16 Reel", status: "Live", angle: "Quick workouts", hook: "I tried this for 30 days", owner: "u_ve1", ad: "Meta", days: 25,
    versions: [{ note: "Member creator", headline: "No time? 15 minutes is enough", cta: "Claim free week", fileName: "zen_ugc_15min.mp4" }, { note: "New thumbnail", headline: "No time? 15 minutes is enough", cta: "Claim free week", fileName: "zen_ugc_15min_v2.mp4" }] },
  { clientId: "c_8", title: "Free trial week — static", type: "Image", platform: "Meta", format: "1:1 Static", status: "Internal Review", angle: "Trial offers", owner: "u_cs1", ai: true, days: 1,
    versions: [{ note: "AI concept → designer polish", headline: "Your first week is on us", cta: "Claim free week", by: "ai" }],
    comments: [{ by: "u_cs1", body: "AI-generated — needs approval before it goes to the client.", v: 1, internal: true }] },
];

const ctr = (s: AdRow["curr"]) => (s.impressions ? (s.clicks / s.impressions) * 100 : 0);

export function seedCreatives(ctx: SeedCtx): Creative[] {
  const { R, int } = makeRand(7331);
  const used = new Set<string>();
  const findAd = (clientId: string, platform: "Meta" | "Google") => {
    const ad = ctx.ads.find((a) => a.clientId === clientId && a.platform === platform && !used.has(a.id));
    if (ad) used.add(ad.id);
    return ad;
  };
  return DEFS.filter((d) => ctx.clients.some((c) => c.id === d.clientId)).map((d, i) => {
    const id = `cr_${i + 1}`;
    const created = ago(d.days + d.versions.length * 2 + int(1, 4));
    const versions: CreativeVersion[] = d.versions.map((v, j) => ({
      v: j + 1,
      note: v.note,
      createdAt: j === d.versions.length - 1 ? ago(d.days, int(1, 8)) : ago(d.days + (d.versions.length - j) * 2),
      createdBy: v.by === "ai" ? "ai" : v.by ?? d.owner,
      headline: v.headline,
      body: v.body,
      cta: v.cta,
      fileName: v.fileName,
      swatch: SWATCHES[(i * 3 + j) % SWATCHES.length],
    }));
    const comments: CreativeComment[] = (d.comments ?? []).map((c, j) => ({ id: `cc_${i + 1}_${j + 1}`, authorId: c.by, body: c.body, at: ago(d.days, 6 - j), version: c.v, internal: c.internal, resolved: c.resolved }));
    const ad = d.ad ? findAd(d.clientId, d.ad) : undefined;
    const performance = d.status === "Live" && ad
      ? {
          spend: ad.curr.spend,
          ctr: +ctr(ad.curr).toFixed(2),
          hookRate: d.ad === "Google" ? 0 : +Math.min(55, 14 + ctr(ad.curr) * 9 + R() * 6).toFixed(1),
          cpa: ad.curr.conversions ? Math.round(ad.curr.spend / ad.curr.conversions) : 0,
          roas: ad.curr.spend ? +(ad.curr.revenue / ad.curr.spend).toFixed(2) : 0,
          frequency: ad.frequency,
        }
      : undefined;
    return {
      id,
      clientId: d.clientId,
      campaignId: ad?.campaignId ?? ctx.campaigns.find((c) => c.clientId === d.clientId)?.id,
      title: d.title,
      type: d.type,
      platform: d.platform,
      format: d.format,
      status: d.status,
      angle: d.angle,
      hook: d.hook ?? ad?.hook,
      versions,
      comments,
      ownerId: d.owner,
      tags: [d.type.toLowerCase(), ...(ad ? [`ad:${ad.id}`] : []), ...(d.ai ? ["ai-concept"] : [])],
      aiGenerated: !!d.ai,
      performance,
      createdAt: created,
      updatedAt: versions[versions.length - 1]!.createdAt,
    };
  });
}

export function seedConcepts(ctx: SeedCtx): CreativeConcept[] {
  const out: CreativeConcept[] = [];
  (
    [
      ["c_1", 4, 2],
      ["c_8", 3, 1],
    ] as const
  ).forEach(([cid, count, days]) => {
    const client = ctx.clients.find((c) => c.id === cid);
    if (!client) return;
    const campaigns = ctx.campaigns.filter((c) => c.clientId === cid);
    const ads = ctx.ads.filter((a) => a.clientId === cid);
    const inputs = deriveCreativeInputs({ client, campaigns, creatives: [], ads });
    out.push(...generateConcepts({ inputs, clientId: cid, industry: client.industry, ads, count, now: ago(days), idPrefix: `cpt_${cid}` }).concepts);
  });
  return out;
}
