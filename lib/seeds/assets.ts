import type { Asset, AssetFolder, ClientKnowledge } from "../types";
import { ago, makeRand, type SeedCtx } from "./context";

// Owned by the Documents & Assets + Knowledge base module.

type A = [clientIdx: number | null, name: string, folder: AssetFolder, tags: string[], clientVisible: boolean, versions?: number];

const ASSETS: A[] = [
  // Bloom Organics (c_1)
  [0, "Bloom-Organics-Logo-Primary.svg", "Logos", ["logo", "primary"], true, 2],
  [0, "Bloom-Organics-Logo-Mono.png", "Logos", ["logo", "mono"], true],
  [0, "Bloom Organics – Brand Guidelines v2.pdf", "Brand guidelines", ["brand", "typography", "colour"], true, 2],
  [0, "Hero-Serum-Lifestyle-01.jpg", "Images", ["product", "lifestyle", "serum"], true],
  [0, "Hero-Serum-Lifestyle-02.jpg", "Images", ["product", "lifestyle", "serum"], false],
  [0, "UGC-Unboxing-Riya-9x16.mp4", "Videos", ["ugc", "reel", "creator"], false],
  [0, "Diwali-Gift-Box-Static-1x1.png", "Creatives", ["diwali", "meta", "static"], true, 3],
  [0, "Oct Performance Report.pdf", "Reports", ["monthly", "performance"], true],
  [0, "Sep Performance Report.pdf", "Reports", ["monthly", "performance"], true],
  [0, "Q4 Growth Strategy – Bloom.pptx", "Strategy", ["q4", "strategy"], false, 2],
  [0, "Influencer Contract Template.docx", "Contracts", ["influencer", "template"], false],
  // Cedar Realty (c_2)
  [1, "Cedar-Realty-Logo.svg", "Logos", ["logo"], true],
  [1, "Cedar Realty – Brand Guidelines v3.pdf", "Brand guidelines", ["brand", "guidelines"], true, 3],
  [1, "Hinjewadi-Tower-Render-Night.jpg", "Images", ["render", "project", "hinjewadi"], true],
  [1, "Site-Walkthrough-Drone-16x9.mp4", "Videos", ["drone", "walkthrough"], true, 2],
  [1, "Lead-Form-Carousel-v4.png", "Creatives", ["lead-gen", "carousel", "meta"], false, 4],
  [1, "Master Services Agreement – Cedar Realty.pdf", "Contracts", ["msa", "signed"], true],
  [1, "AI Lead Qualification Proposal.pdf", "Proposals", ["ai-automation", "upsell"], true],
  [1, "Monthly Review – Sep.pptx", "Presentations", ["review", "monthly"], true],
  // Lumen Academy (c_3)
  [2, "Lumen-Academy-Logo-Horizontal.svg", "Logos", ["logo"], true],
  [2, "Lumen Brand Book 2026.pdf", "Brand guidelines", ["brand"], true, 2],
  [2, "Topper-Testimonial-Ananya.mp4", "Videos", ["testimonial", "neet"], true],
  [2, "NEET-Scholarship-Test-Search-Ads.xlsx", "Creatives", ["google-ads", "copy", "neet"], false, 2],
  [2, "SEO Keyword Map – Bengaluru Centres.xlsx", "Strategy", ["seo", "keywords"], false, 3],
  [2, "SEO Audit – Aug.pdf", "Reports", ["seo", "audit"], true],
  [2, "Admissions Season Plan.pptx", "Presentations", ["admissions", "plan"], true],
  // Coral Stays (c_4)
  [3, "Coral-Stays-Logo-Wave.png", "Logos", ["logo"], true],
  [3, "Villa-Poolside-Sunset.jpg", "Images", ["villa", "sunset", "goa"], true],
  [3, "Monsoon-Getaway-Reel-v2.mp4", "Videos", ["reel", "monsoon"], false, 2],
  [3, "Creator Brief – Weekend Staycations.pdf", "Strategy", ["influencer", "brief"], false],
  [3, "Coral Stays Proposal – Social + Creators.pdf", "Proposals", ["proposal"], true],
  // Atlas Health (c_5)
  [4, "Atlas-Health-Logo.svg", "Logos", ["logo"], true],
  [4, "Atlas Health – Brand & Compliance Guide.pdf", "Brand guidelines", ["brand", "compliance", "medical"], true, 2],
  [4, "Doctor-Profiles-Photoshoot.zip", "Images", ["doctors", "photoshoot"], false],
  [4, "Local SEO Strategy – Hyderabad Clinics.docx", "Strategy", ["seo", "local"], false, 2],
  [4, "Health Checkup Landing Page Copy.docx", "Creatives", ["landing-page", "copy"], false],
  [4, "Oct SEO & Ads Report.pdf", "Reports", ["monthly", "seo"], true],
  // Ember Kitchen (c_6)
  [5, "Ember-Kitchen-Logo.png", "Logos", ["logo"], true],
  [5, "Menu-Shoot-Butter-Chicken.jpg", "Images", ["food", "menu"], true],
  [5, "Weekend-Offer-Story-9x16.png", "Creatives", ["story", "offer"], false, 2],
  [5, "Renewal Proposal – Ember Kitchen.pdf", "Proposals", ["renewal"], false],
  // Orbit Finance (c_7)
  [6, "Orbit-Finance-Logo-Primary.svg", "Logos", ["logo"], true],
  [6, "Orbit Finance – Brand Guidelines v5.pdf", "Brand guidelines", ["brand", "regulated"], true, 2],
  [6, "Programmatic Media Plan – Q4.xlsx", "Strategy", ["programmatic", "media-plan"], false, 2],
  [6, "Brand Campaign Deck – Credit Card Launch.pptx", "Presentations", ["launch", "brand"], true, 3],
  [6, "Statement of Work – FY27.pdf", "Contracts", ["sow"], true],
  // Zen Fitness (c_8)
  [7, "Zen-Fitness-Logo.svg", "Logos", ["logo"], true],
  [7, "Trainer-Transformation-Reel.mp4", "Videos", ["reel", "transformation"], false],
  [7, "7-Day-Trial-Static-Ad.png", "Creatives", ["trial", "meta"], false, 2],
  [7, "Retention Plan – Zen Fitness.pdf", "Strategy", ["retention", "churn"], false],
  // Agency library (no client)
  [null, "Adbibe Credentials Deck 2026.pptx", "Presentations", ["sales", "credentials"], false, 4],
  [null, "Adbibe-Logo-Kit.zip", "Logos", ["agency", "logo"], false],
  [null, "MSA Template – Standard.docx", "Contracts", ["template", "legal"], false, 2],
  [null, "Monthly Report Template.pptx", "Reports", ["template"], false, 3],
  [null, "Proposal Template – Performance Retainer.docx", "Proposals", ["template"], false, 2],
  [null, "Creative Brief Template.docx", "Strategy", ["template", "creative"], false],
];

const SIZE_BY_EXT: Record<string, [number, number]> = {
  svg: [8, 60], png: [180, 2400], jpg: [600, 5200], mp4: [18000, 240000], pdf: [300, 9000], pptx: [2500, 28000], docx: [40, 900], xlsx: [30, 1200], zip: [20000, 180000],
};
const NOTES = ["Initial upload", "Updated colours per client feedback", "Final — client approved", "Refreshed with Q4 numbers", "Minor copy fixes", "New logo lock-ups added"];

export function seedAssets(ctx: SeedCtx): Asset[] {
  const { int, pick } = makeRand(7707);
  const staff = ctx.team.filter((t) => t.role !== "client").map((t) => t.id);
  const uploader = (folder: AssetFolder) =>
    folder === "Reports" || folder === "Presentations" ? "u_am1" : folder === "Creatives" || folder === "Images" || folder === "Logos" ? (staff.includes("u_des1") ? "u_des1" : "u_admin") : folder === "Videos" ? (staff.includes("u_ve1") ? "u_ve1" : "u_admin") : folder === "Contracts" ? "u_admin" : pick(staff.length ? staff : ["u_admin"]);
  return ASSETS.flatMap(([ci, name, folder, tags, clientVisible, nv = 1], i) => {
    const client = ci == null ? undefined : ctx.clients[ci];
    if (ci != null && !client) return [];
    const ext = name.split(".").pop()!.toLowerCase();
    const [lo, hi] = SIZE_BY_EXT[ext] ?? [50, 2000];
    const created = int(20, 160);
    const by = uploader(folder);
    const versions = Array.from({ length: nv }, (_, v) => ({ v: v + 1, at: ago(Math.max(0, created - v * int(4, 18))), by, note: v === 0 ? NOTES[0]! : NOTES[1 + ((i + v) % (NOTES.length - 1))]! }));
    return [
      {
        id: `as_${i + 1}`,
        clientId: client?.id,
        name,
        folder,
        ext,
        sizeKb: int(lo, hi),
        tags,
        versions,
        uploadedBy: by,
        createdAt: versions[0]!.at,
        updatedAt: versions[versions.length - 1]!.at,
        clientVisible,
      },
    ];
  });
}

type K = Omit<ClientKnowledge, "id" | "clientId" | "updatedAt">;

const KNOWLEDGE: K[] = [
  {
    brandVoice: "Warm, honest and ingredient-first — like a knowledgeable friend, never preachy",
    toneWords: ["warm", "honest", "clean", "science-backed", "playful"],
    products: [
      { name: "Vitamin C Glow Serum", price: "₹899", usp: "15% stabilised vitamin C, fragrance-free" },
      { name: "Ubtan Face Wash", price: "₹349", usp: "Traditional ubtan with turmeric & saffron, sulphate-free" },
      { name: "Night Repair Oil", price: "₹1,199", usp: "Cold-pressed kumkumadi blend" },
    ],
    audience: "Women 24–40 in metros, clean-beauty curious, research ingredients before buying, shop on Nykaa & the website",
    competitors: ["Plum", "Minimalist", "Mamaearth"],
    approvedMessaging: ["Clean ingredients you can pronounce", "Visible glow in 14 days", "Made in small batches in Maharashtra"],
    rejectedConcepts: ["Before/after skin-whitening comparisons", "Discount-led 'flat 50%' creatives"],
    preferences: ["Founder Meera approves all hero creatives", "No celebrity endorsements", "Show real skin texture — no heavy retouching"],
    guidelines: "Primary palette sage green + cream; Fraunces for headlines, Inter for body. Logo clear space = height of the 'B'.",
    history: ["UGC unboxing reels beat studio shoots on CPA by ~30% (Q2)", "Diwali gift box drove the highest AOV of the year last season"],
  },
  {
    brandVoice: "Trustworthy, premium and precise — facts first, no hype",
    toneWords: ["premium", "trustworthy", "clear", "aspirational"],
    products: [
      { name: "Cedar Heights 2 & 3 BHK, Hinjewadi", price: "₹78L onwards", usp: "10 min to Phase 1 IT park, RERA registered" },
      { name: "Cedar Greens Villas, Baner", price: "₹2.4Cr onwards", usp: "Private gardens, gated community" },
    ],
    audience: "IT professionals and NRIs 30–50 buying their first or upgrade home in Pune",
    competitors: ["Kolte Patil", "Godrej Properties", "VTP Realty"],
    approvedMessaging: ["RERA registered, possession on schedule", "Walk to work — 10 minutes to Hinjewadi Phase 1", "Book a site visit this weekend"],
    rejectedConcepts: ["'Last few units left' urgency claims", "Stock photography of families"],
    preferences: ["All price claims must say 'onwards' + RERA number", "Leads to be called within 15 minutes", "Weekly lead-quality review on Mondays"],
    guidelines: "Deep green + gold accents, serif headlines. Always show RERA number in the footer of ads.",
    history: ["Lead form ads cheaper than landing page, but LP leads convert to site visits 2x better", "WhatsApp follow-up automation lifted site visits 18%"],
  },
  {
    brandVoice: "Encouraging, expert and results-driven — speak to both parents and students",
    toneWords: ["encouraging", "expert", "credible", "focused"],
    products: [
      { name: "NEET 2-Year Classroom Programme", price: "₹1,65,000", usp: "Small batches of 40, AIIMS-alumni faculty" },
      { name: "NEET Repeater Batch", price: "₹95,000", usp: "Daily tests + personal mentor" },
      { name: "Online Test Series", price: "₹4,999", usp: "All-India rank with NTA-pattern analytics" },
    ],
    audience: "Parents 38–50 and aspirants 16–19 in Bengaluru preparing for NEET / JEE / KCET",
    competitors: ["BrightPath NEET", "Vidyapeeth Bangalore", "Rankers Den"],
    approvedMessaging: ["Small batches, personal mentoring", "Results you can verify — topper list with roll numbers", "Free scholarship test every Sunday"],
    rejectedConcepts: ["Guaranteed selection claims", "Fear-based 'your child will fall behind' messaging"],
    preferences: ["Use real toppers only, with written consent", "Kannada + English ad variants for Tier-2 Karnataka", "No ads during board exam week"],
    guidelines: "Navy + saffron palette. Logo horizontal on web, stacked on social. Faculty photos in lab coats only.",
    history: ["Scholarship-test campaigns drive the cheapest qualified leads (Jan–Mar)", "SEO centre pages now bring ~35% of enquiries"],
  },
  {
    brandVoice: "Relaxed, sensory and inviting — slow travel, never salesy",
    toneWords: ["relaxed", "sensory", "boutique", "sunny"],
    products: [
      { name: "Poolside Villa (Assagao)", price: "₹18,500/night", usp: "Private pool, chef on call" },
      { name: "Monsoon Escape Package", price: "₹32,000 for 2 nights", usp: "Spa + curated food trail" },
    ],
    audience: "Couples and friend groups 25–40 from Mumbai, Pune and Bengaluru planning weekend getaways",
    competitors: ["StayVista", "Airbnb Luxe", "SaffronStays"],
    approvedMessaging: ["Your private corner of Goa", "Monsoon is the best-kept secret", "Book direct for complimentary breakfast"],
    rejectedConcepts: ["Party-centric imagery", "Crowded beach shots"],
    preferences: ["Creators must stay 2 nights before posting", "Golden-hour shots only for hero content"],
    guidelines: "Coral + sand tones, hand-drawn wave motif. Photography: natural light, no heavy filters.",
    history: ["Creator stays drove 40% of direct bookings in monsoon season", "Reels with villa walk-throughs outperform static posts 3x on saves"],
  },
  {
    brandVoice: "Calm, caring and clinically accurate — reassure without overpromising",
    toneWords: ["caring", "reassuring", "clinical", "accessible"],
    products: [
      { name: "Executive Health Checkup", price: "₹4,999", usp: "70+ tests, same-day doctor consult" },
      { name: "Knee Replacement Package", price: "₹2,10,000 onwards", usp: "Robotic-assisted, 3-day stay" },
      { name: "Home Sample Collection", price: "₹0 above ₹999", usp: "Within 60 minutes across Hyderabad" },
    ],
    audience: "Adults 30–60 and caregivers within 10 km of Banjara Hills, Gachibowli and Kondapur clinics",
    competitors: ["CareWell Hospitals", "Medinova Hyderabad", "Sunrise Health"],
    approvedMessaging: ["Specialists you can book today", "Transparent package pricing", "NABH-accredited care"],
    rejectedConcepts: ["Symptom-scare headlines", "Before/after surgical imagery"],
    preferences: ["All medical claims reviewed by Dr. Rao before publishing", "No patient photos without signed consent", "Blog posts must cite sources"],
    guidelines: "Teal + white. Doctor photos on light backgrounds. Follow the medical advertising compliance checklist.",
    history: ["Health checkup search ads convert best on weekends", "Local SEO clinic pages rank top-5 for 12 area keywords"],
  },
  {
    brandVoice: "Bold, hungry and fun — food-lover talk, a little cheeky",
    toneWords: ["bold", "cheeky", "indulgent", "local"],
    products: [
      { name: "Signature Butter Chicken Bowl", price: "₹349", usp: "Slow-cooked 12 hours, tandoor-smoked" },
      { name: "Weekend Family Feast", price: "₹1,299", usp: "Serves 4, free dessert" },
    ],
    audience: "Foodies 21–35 in Delhi NCR ordering on Swiggy/Zomato 2–3 times a week",
    competitors: ["Behrouz Biryani", "Wow! Momo", "local cloud kitchens"],
    approvedMessaging: ["Smoky. Buttery. Worth it.", "Free dessert on weekend feasts"],
    rejectedConcepts: ["Diet / calorie messaging", "Generic stock food photos"],
    preferences: ["Shoot real menu items only", "Offers must match live app pricing"],
    guidelines: "Charcoal + ember orange. Handwritten headline font on social.",
    history: ["Story offers drove order spikes but low repeat rate", "Reels with chef close-ups had best engagement"],
  },
  {
    brandVoice: "Confident, clear and compliant — make money simple without jargon",
    toneWords: ["confident", "clear", "modern", "compliant"],
    products: [
      { name: "Orbit Platinum Credit Card", price: "₹0 joining fee", usp: "5% cashback on travel, lounge access" },
      { name: "Orbit Invest (mutual funds)", price: "Direct plans, 0 commission", usp: "SIP from ₹500" },
      { name: "Instant Personal Loan", price: "From 10.99% p.a.", usp: "Disbursal in 10 minutes" },
    ],
    audience: "Salaried professionals 25–45 in metros with credit-card and investing intent",
    competitors: ["Jupiter", "Fi Money", "OneCard"],
    approvedMessaging: ["Zero joining fee, real rewards", "Invest in minutes, commission-free", "Transparent rates, no hidden charges"],
    rejectedConcepts: ["'Guaranteed returns' language", "Get-rich-quick visuals"],
    preferences: ["Legal sign-off on every ad (48h SLA)", "Mandatory disclaimers: 'Mutual fund investments are subject to market risks'", "Brand-safe placements only"],
    guidelines: "Deep indigo + electric blue. Always include RBI/SEBI disclaimers where applicable.",
    history: ["Programmatic video drove +22% brand search during the card launch", "Contextual finance placements beat broad audiences on CPA"],
  },
  {
    brandVoice: "Motivating, inclusive and energetic — progress over perfection",
    toneWords: ["motivating", "inclusive", "energetic"],
    products: [
      { name: "Monthly Membership", price: "₹2,499/month", usp: "All classes + gym floor" },
      { name: "7-Day Free Trial", price: "Free", usp: "No card required" },
    ],
    audience: "Fitness-curious 22–38 in Chennai, beginners and lapsed gym-goers",
    competitors: ["Cult.fit", "Anytime Fitness", "Gold's Gym"],
    approvedMessaging: ["Start where you are", "Your first week is on us"],
    rejectedConcepts: ["Body-shaming before/after photos"],
    preferences: ["Feature real members and trainers", "Tamil + English captions"],
    guidelines: "",
    history: ["Trial offer ads drove sign-ups but low paid conversion — needs nurture"],
  },
];

export function seedKnowledge(ctx: SeedCtx): ClientKnowledge[] {
  const { int } = makeRand(7708);
  return ctx.clients.slice(0, KNOWLEDGE.length).map((c, i) => ({ id: c.id, clientId: c.id, ...KNOWLEDGE[i]!, updatedAt: ago(int(2, 40)) }));
}
