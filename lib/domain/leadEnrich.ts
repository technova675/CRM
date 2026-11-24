// Reads contact details a company publishes on its own website: phone, email, social profiles,
// location and a short description. Pure functions over HTML so they can be tested without a network.

export type SocialKey = "linkedin" | "instagram" | "facebook" | "twitter" | "youtube" | "whatsapp";
export const SOCIAL_LABELS: Record<SocialKey, string> = { linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", twitter: "X / Twitter", youtube: "YouTube", whatsapp: "WhatsApp" };

export type WebsiteContacts = {
  company?: string;
  description?: string;
  phone?: string;
  email?: string;
  location?: string;
  socials: Partial<Record<SocialKey, string>>;
};

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const clean = (s?: string) => (s ? decode(s).replace(/\s+/g, " ").trim() : undefined) || undefined;

// Profile paths only: share buttons, intents and the platforms' own pages are not the company's profile.
const SOCIAL_PATTERNS: [SocialKey, RegExp, RegExp?][] = [
  ["linkedin", /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in|school|showcase)\/[^/?#\s]+/i],
  ["instagram", /^https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]{2,30}\/?(?:[?#].*)?$/i, /instagram\.com\/(?:p|reel|reels|explore|accounts|stories|tv)\//i],
  ["facebook", /^https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/[^/?#\s]+/i, /facebook\.com\/(?:sharer|share|dialog|plugins|tr|login|groups\/?$)/i],
  ["twitter", /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]{1,15}\/?(?:[?#].*)?$/i, /(?:twitter|x)\.com\/(?:intent|share|home|i)\b/i],
  ["youtube", /^https?:\/\/(?:www\.)?youtube\.com\/(?:@[^/?#\s]+|c\/[^/?#\s]+|channel\/[^/?#\s]+|user\/[^/?#\s]+)/i],
  ["whatsapp", /^https?:\/\/(?:wa\.me\/\d{8,15}|(?:api\.)?whatsapp\.com\/send\/?\?phone=\d{8,15})/i],
];

export function socialFrom(url: string): [SocialKey, string] | null {
  for (const [key, ok, bad] of SOCIAL_PATTERNS) {
    if (ok.test(url) && !(bad && bad.test(url))) return [key, url.replace(/[?#].*$/, "").replace(/\/$/, "")];
  }
  return null;
}

/** A plausible public phone number: 8–15 digits once formatting is removed, not a date or long id. */
export function normalPhone(raw: string) {
  const v = decode(raw).replace(/^tel:/i, "").replace(/%20/g, " ").trim();
  const digits = v.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return undefined;
  if (/^(19|20)\d{6}$/.test(digits)) return undefined;
  return v.replace(/[^\d+()\- ]/g, "").replace(/\s+/g, " ").trim();
}

const BAD_EMAIL = /\.(png|jpe?g|gif|webp|svg|css|js)$|@(?:example|sentry|wixpress|domain|email)\.|^(?:name|your|user)@/i;
export function pickEmail(found: string[], host: string) {
  const list = [...new Set(found.map((e) => decode(e).toLowerCase().replace(/^mailto:/, "").split("?")[0].trim()))].filter((e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e) && !BAD_EMAIL.test(e));
  const base = host.replace(/^www\./, "");
  const own = list.filter((e) => e.endsWith("@" + base) || e.endsWith("." + base));
  const rank = (e: string) => (/^(hello|info|contact|sales|enquir|inquir|business|marketing)/.test(e) ? 0 : /^(support|help|care|team)/.test(e) ? 1 : /^(no-?reply|privacy|legal|abuse|webmaster|careers|jobs|hr)/.test(e) ? 3 : 2);
  return [...(own.length ? own : list)].sort((a, b) => rank(a) - rank(b))[0];
}

type LD = Record<string, unknown>;
function jsonLd(html: string): LD[] {
  const out: LD[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const v = JSON.parse(m[1].trim());
      const walk = (x: unknown) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") { out.push(x as LD); if ((x as LD)["@graph"]) walk((x as LD)["@graph"]); } };
      walk(v);
    } catch { /* invalid JSON-LD is ignored */ }
  }
  return out;
}
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const meta = (html: string, name: string) => html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i"))?.[1];

/** Extracts contacts from one page's HTML. `base` resolves relative links and decides which emails are the company's own. */
export function contactsFromHtml(html: string, base: string): WebsiteContacts {
  const host = (() => { try { return new URL(base).hostname; } catch { return ""; } })();
  const body = html.replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const hrefs = [...body.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => decode(m[1]).trim());
  const text = decode(body.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const ld = jsonLd(html);
  const org = ld.find((x) => /Organization|LocalBusiness|Corporation|Store|Restaurant|Hotel|Brand|Company/i.test(String(x["@type"] ?? ""))) ?? {};

  const socials: WebsiteContacts["socials"] = {};
  const sameAs = Array.isArray(org.sameAs) ? org.sameAs.filter((v): v is string => typeof v === "string") : str(org.sameAs) ? [str(org.sameAs)!] : [];
  for (const raw of [...sameAs, ...hrefs]) {
    let url: string;
    try { url = new URL(raw, base).href; } catch { continue; }
    const hit = socialFrom(url);
    if (hit && !socials[hit[0]]) socials[hit[0]] = hit[1];
  }

  // Plain-text numbers count only when a label like "Phone" or "Call" sits right before them.
  const labelled = text.match(/(?:phone|call(?: us)?|tel|mobile|whatsapp)\s*[:.-]?\s*((?:\+\d{1,3}[\s-]?)?\(?\d{2,5}\)?[\s-]?\d{3,5}[\s-]?\d{3,5})/i)?.[1];
  const phone = [str(org.telephone), ...hrefs.filter((h) => /^tel:/i.test(h)), labelled]
    .filter((v): v is string => !!v).map(normalPhone).find(Boolean);

  const emails = [str(org.email) ?? "", ...hrefs.filter((h) => /^mailto:/i.test(h)), ...(text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [])].filter(Boolean);

  const addr = (org.address ?? ld.find((x) => x.address)?.address) as LD | string | undefined;
  const location = typeof addr === "string" ? clean(addr)?.slice(0, 120) : addr ? clean([str(addr.addressLocality), str(addr.addressRegion), str((addr.addressCountry as LD)?.name) ?? str(addr.addressCountry)].filter(Boolean).join(", ")) : undefined;

  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  return {
    company: clean(str(org.name) ?? meta(html, "og:site_name")) ?? clean(title?.split(/\s[|–—-]\s/)[0]),
    description: clean(meta(html, "description") ?? meta(html, "og:description") ?? str(org.description))?.slice(0, 300),
    phone,
    email: pickEmail(emails, host),
    location,
    socials,
  };
}

/** Combines pages: the first value found wins, so pass the home page first. */
export function mergeContacts(pages: WebsiteContacts[]): WebsiteContacts {
  const out: WebsiteContacts = { socials: {} };
  for (const p of pages) {
    for (const k of ["company", "description", "phone", "email", "location"] as const) out[k] ??= p[k];
    for (const [k, v] of Object.entries(p.socials) as [SocialKey, string][]) out.socials[k] ??= v;
  }
  return out;
}

/** Same-site pages most likely to list contact details, best first. */
export function contactPages(links: string[], base: string) {
  let origin: string;
  try { origin = new URL(base).origin; } catch { return []; }
  const score = (p: string) => (/contact/i.test(p) ? 0 : /about|company|team/i.test(p) ? 1 : /support|help|reach|location|store/i.test(p) ? 2 : 9);
  return [...new Set(links.flatMap((l) => { try { const u = new URL(l, base); return u.origin === origin && u.pathname !== "/" ? [u.origin + u.pathname] : []; } catch { return []; } }))]
    .filter((l) => score(new URL(l).pathname) < 9).sort((a, b) => score(new URL(a).pathname) - score(new URL(b).pathname)).slice(0, 2);
}
