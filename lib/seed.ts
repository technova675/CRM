import type {
  Activity,
  ApprovalRequest,
  Automation,
  Campaign,
  Client,
  CompanySize,
  Conversation,
  DailyMetric,
  Deal,
  DealStage,
  Influencer,
  Integration,
  Invoice,
  Lead,
  LeadSource,
  LeadStatus,
  Meeting,
  Message,
  Notification,
  OutreachCampaign,
  Proposal,
  ReportSchedule,
  Service,
  Task,
  TeamMember,
  AdRow,
  AITask,
  Asset,
  ClientKnowledge,
  CommandThread,
  Creative,
  CreativeConcept,
  Expense,
  InfluencerEngagement,
  Organization,
  Project,
  Recommendation,
  SavedView,
  SeoProject,
  SocialPost,
  StrategyDoc,
  VideoProject,
} from "./types";
import { LEAD_SOURCES, SERVICES } from "./types";
import { DAY, daysFromNow, rng } from "./utils";
import { scoreLead } from "./ai/scoring";
import { runLocalResearch } from "./ai/research";
import { personalizeFirstMessage } from "./ai/outreach";
import type { SeedCtx } from "./seeds/context";
import { EXTRA_TEAM, withTeamMeta } from "./seeds/team";
import { seedAds } from "./seeds/ads";
import { seedAITasks, seedIntegrations, seedOrganization } from "./seeds/org";
import { seedStrategies } from "./seeds/strategy";
import { seedConcepts, seedCreatives } from "./seeds/creative";
import { seedVideos } from "./seeds/video";
import { seedEngagements, seedSocialPosts } from "./seeds/social";
import { seedSeoProjects } from "./seeds/seo";
import { seedAssets, seedKnowledge } from "./seeds/assets";
import { seedRecommendations } from "./seeds/recommendations";
import { seedExpenses } from "./seeds/finance";
import { seedProjects, seedSavedViews } from "./seeds/projects";

const R = rng(20260927);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(R() * xs.length)]!;
const int = (a: number, b: number) => Math.floor(a + R() * (b - a + 1));
const some = <T,>(xs: readonly T[], min = 1, max = 3) => {
  const n = int(min, max);
  const copy = [...xs].sort(() => R() - 0.5);
  return copy.slice(0, n);
};
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

export const TEAM: TeamMember[] = [
  { id: "u_admin", name: "Aarav Mehta", email: "aarav@adbibe.com", role: "admin", avatarColor: "#7c3aed" },
  { id: "u_sales1", name: "Priya Sharma", email: "priya@adbibe.com", role: "sales", avatarColor: "#0ea5e9" },
  { id: "u_sales2", name: "Rohan Kapoor", email: "rohan@adbibe.com", role: "sales", avatarColor: "#f97316" },
  { id: "u_am1", name: "Neha Iyer", email: "neha@adbibe.com", role: "account_manager", avatarColor: "#10b981" },
  { id: "u_mkt1", name: "Kabir Singh", email: "kabir@adbibe.com", role: "marketing", avatarColor: "#ec4899" },
  { id: "u_mkt2", name: "Ananya Rao", email: "ananya@adbibe.com", role: "marketing", avatarColor: "#eab308" },
  { id: "u_fin", name: "Vikram Joshi", email: "vikram@adbibe.com", role: "finance", avatarColor: "#64748b" },
  { id: "u_client1", name: "Meera (Bloom Organics)", email: "meera@bloomorganics.in", role: "client", avatarColor: "#14b8a6", clientId: "c_1" },
];

const FIRST = ["Arjun", "Isha", "Karan", "Sneha", "Dev", "Tara", "Nikhil", "Riya", "Aditya", "Pooja", "Siddharth", "Kavya", "Rahul", "Diya", "Varun", "Meher", "Yash", "Aisha", "Manav", "Zara", "Omar", "Leah", "Ethan", "Sofia", "Daniel", "Hana"];
const LAST = ["Malhotra", "Verma", "Gupta", "Nair", "Reddy", "Bose", "Chopra", "Desai", "Patel", "Khan", "Menon", "Sethi", "Agarwal", "Pillai", "Das", "Fernandes", "Shah", "Carter", "Lee", "Tanaka"];
const COMPANY_A = ["Bloom", "Urban", "Nova", "Kiara", "Saffron", "Peak", "Blue", "Terra", "Lumen", "Aura", "Vista", "Cedar", "Zen", "Coral", "Atlas", "Orbit", "Maple", "Indigo", "Solace", "Ember"];
const COMPANY_B = ["Organics", "Living", "Homes", "Academy", "Clinic", "Wear", "Foods", "Fitness", "Labs", "Studio", "Motors", "Stays", "Beauty", "Finance", "Realty", "Kitchen", "Retail", "Health", "Tech", "Co"];
const INDUSTRY_BY_B: Record<string, string> = {
  Organics: "D2C / E-commerce", Living: "D2C / E-commerce", Homes: "Real Estate", Academy: "Education", Clinic: "Healthcare",
  Wear: "Fashion", Foods: "Food & Beverage", Fitness: "Fitness", Labs: "SaaS", Studio: "Beauty", Motors: "Automotive",
  Stays: "Hospitality", Beauty: "Beauty", Finance: "Fintech", Realty: "Real Estate", Kitchen: "Food & Beverage",
  Retail: "D2C / E-commerce", Health: "Healthcare", Tech: "SaaS", Co: "Consulting",
};
const TITLES = ["Founder", "Co-founder & CEO", "Marketing Manager", "Head of Growth", "CMO", "Brand Manager", "Director of Marketing", "Owner", "Digital Marketing Executive", "VP Marketing", "Operations Manager"];
const CITIES = ["Mumbai", "Bengaluru", "Delhi NCR", "Pune", "Hyderabad", "Chennai", "Ahmedabad", "Jaipur", "Kolkata", "Dubai", "Singapore", "London"];
const SIZES: CompanySize[] = ["1-10", "11-50", "51-200", "201-1000", "1000+"];

const STATUS_WEIGHTS: [LeadStatus, number][] = [
  ["New", 22], ["Researching", 8], ["Qualified", 16], ["Contacted", 22], ["Replied", 8],
  ["Meeting", 7], ["Proposal", 5], ["Negotiation", 3], ["Won", 5], ["Lost", 6],
];
const weightedStatus = () => {
  const total = STATUS_WEIGHTS.reduce((a, [, w]) => a + w, 0);
  let x = R() * total;
  for (const [s, w] of STATUS_WEIGHTS) if ((x -= w) < 0) return s;
  return "New";
};

const SALES = ["u_sales1", "u_sales2", "u_admin"];

function makeLeads(n: number): Lead[] {
  const used = new Set<string>();
  const leads: Lead[] = [];
  for (let i = 0; i < n; i++) {
    let company = "";
    let b = "";
    do {
      b = pick(COMPANY_B);
      company = `${pick(COMPANY_A)} ${b}`;
    } while (used.has(company) && used.size < COMPANY_A.length * COMPANY_B.length);
    used.add(company);
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const slug = company.toLowerCase().replace(/\s+/g, "");
    const status = weightedStatus();
    const createdDaysAgo = i < 6 ? 0 : Math.floor(Math.pow(R(), 1.6) * 120);
    const hasSite = R() > 0.15;
    const lead: Lead = {
      id: `l_${i + 1}`,
      name,
      company,
      jobTitle: pick(TITLES),
      email: `${name.split(" ")[0]!.toLowerCase()}@${slug}.com`,
      phone: `+91 9${int(100000000, 999999999)}`,
      linkedin: R() > 0.25 ? `linkedin.com/in/${name.toLowerCase().replace(/\s+/g, "-")}` : undefined,
      instagram: R() > 0.35 ? `@${slug}` : undefined,
      website: hasSite ? `https://${slug}.com` : undefined,
      location: pick(CITIES),
      industry: INDUSTRY_BY_B[b] ?? "Consulting",
      companySize: pick(SIZES),
      source: pick(LEAD_SOURCES) as LeadSource,
      createdAt: iso(createdDaysAgo * DAY + int(0, 8) * 3_600_000),
      ownerId: pick(SALES),
      status,
      services: some(SERVICES, 0, 3),
      notes: "",
      tags: R() > 0.7 ? ["priority"] : [],
      optedOut: status === "Lost" && R() > 0.6,
    };
    lead.score = scoreLead(lead);
    if (!["New", "Researching"].includes(status)) lead.research = runLocalResearch(lead);
    if (["Contacted", "Replied", "Meeting", "Proposal", "Negotiation"].includes(status)) {
      lead.lastContactedAt = iso(int(1, 12) * DAY);
      lead.nextFollowUpAt = daysFromNow(int(-3, 5), 10);
    }
    leads.push(lead);
  }
  return leads;
}

const stageFromStatus = (s: LeadStatus): DealStage | null =>
  ({ Qualified: "Qualified", Contacted: "Contacted", Replied: "Contacted", Meeting: "Meeting", Proposal: "Proposal", Negotiation: "Negotiation", Won: "Won", Lost: "Lost" } as Partial<Record<LeadStatus, DealStage>>)[s] ?? null;

const PROB: Record<DealStage, number> = { "New Lead": 10, Qualified: 20, Contacted: 25, Meeting: 40, Proposal: 60, Negotiation: 80, Won: 100, Lost: 0 };

function metricsFor(days: number, budget: number, seed: number, conv = 1): DailyMetric[] {
  const r = rng(seed);
  const out: DailyMetric[] = [];
  const daily = budget / 30;
  for (let d = days - 1; d >= 0; d--) {
    const spend = daily * (0.75 + r() * 0.5);
    const impressions = spend * (18 + r() * 10);
    const clicks = impressions * (0.011 + r() * 0.012);
    // Tuned to realistic agency ranges: CPL ≈ ₹50–120, CPA ≈ ₹600–1,300, ROAS ≈ 2–5x.
    const leads = clicks * (0.024 + r() * 0.02) * conv;
    const conversions = leads * (0.055 + r() * 0.045);
    out.push({
      date: new Date(Date.now() - d * DAY).toISOString().slice(0, 10),
      spend: Math.round(spend),
      impressions: Math.round(impressions),
      reach: Math.round(impressions * 0.62),
      clicks: Math.round(clicks),
      leads: Math.round(leads),
      conversions: Math.round(conversions),
      revenue: Math.round(conversions * (2200 + r() * 2600)),
    });
  }
  return out;
}

// Deal Won → Welcome email → Onboarding form → … → Launch
const DEFAULT_ONBOARDING = [
  "Send welcome email",
  "Send onboarding form",
  "Collect business information",
  "Collect brand assets",
  "Collect account access (ads, analytics, website)",
  "Collect tracking requirements",
  "Create client workspace & knowledge base",
  "Create project & internal tasks",
  "Assign team",
  "Strategy approved",
  "Campaign setup",
  "Launch",
];

export function buildOnboarding(done = 0) {
  return DEFAULT_ONBOARDING.map((label, i) => ({
    key: `ob_${i}`,
    label,
    done: i < done,
    doneAt: i < done ? iso((done - i) * DAY) : undefined,
  }));
}

const INFLUENCER_CATS = ["Beauty", "Fashion", "Food", "Fitness", "Tech", "Travel", "Parenting", "Finance", "Lifestyle", "Gaming"];
const CONTENT = ["Reels", "Stories", "YouTube long-form", "Shorts", "Static posts", "Live", "UGC"];

export interface SeedData {
  team: TeamMember[];
  leads: Lead[];
  deals: Deal[];
  meetings: Meeting[];
  proposals: Proposal[];
  clients: Client[];
  campaigns: Campaign[];
  tasks: Task[];
  invoices: Invoice[];
  influencers: Influencer[];
  conversations: Conversation[];
  messages: Message[];
  outreach: OutreachCampaign[];
  automations: Automation[];
  integrations: Integration[];
  reportSchedules: ReportSchedule[];
  notifications: Notification[];
  activities: Activity[];
  approvals: ApprovalRequest[];
  // Agency OS collections
  ads: AdRow[];
  strategies: StrategyDoc[];
  creatives: Creative[];
  concepts: CreativeConcept[];
  videos: VideoProject[];
  socialPosts: SocialPost[];
  engagements: InfluencerEngagement[];
  seoProjects: SeoProject[];
  assets: Asset[];
  knowledge: ClientKnowledge[];
  recommendations: Recommendation[];
  expenses: Expense[];
  projects: Project[];
  savedViews: SavedView[];
  aiTasks: AITask[];
  threads: CommandThread[];
  organization: Organization;
}

export function buildSeed(): SeedData {
  const leads = makeLeads(140);

  // ---- Clients (existing accounts) ----
  const clientDefs: [string, string, Service[], number, string][] = [
    ["Bloom Organics", "D2C / E-commerce", ["Meta Ads", "Influencer Marketing"], 185000, "Mumbai"],
    ["Cedar Realty", "Real Estate", ["Meta Ads", "Google Ads", "AI Automation"], 240000, "Pune"],
    ["Lumen Academy", "Education", ["Google Ads", "SEO"], 140000, "Bengaluru"],
    ["Coral Stays", "Hospitality", ["Social Media", "Influencer Marketing"], 95000, "Goa"],
    ["Atlas Health", "Healthcare", ["SEO", "Google Ads"], 120000, "Hyderabad"],
    ["Ember Kitchen", "Food & Beverage", ["Social Media", "Meta Ads"], 80000, "Delhi NCR"],
    ["Orbit Finance", "Fintech", ["Programmatic", "Brand Strategy"], 310000, "Mumbai"],
    ["Zen Fitness", "Fitness", ["Meta Ads", "Social Media"], 70000, "Chennai"],
  ];
  const clients: Client[] = clientDefs.map(([company, industry, services, retainer, location], i) => {
    const slug = company.toLowerCase().replace(/\s+/g, "");
    const started = int(40, 400);
    return {
      id: `c_${i + 1}`,
      company,
      industry,
      website: `https://${slug}.in`,
      location,
      contacts: [
        { name: i === 0 ? "Meera Kulkarni" : `${pick(FIRST)} ${pick(LAST)}`, email: `hello@${slug}.in`, role: "Founder", phone: `+91 98${int(10000000, 99999999)}` },
        { name: `${pick(FIRST)} ${pick(LAST)}`, email: `marketing@${slug}.in`, role: "Marketing Lead" },
      ],
      services,
      retainer,
      contractStart: iso(started * DAY),
      contractEnd: daysFromNow(365 * Math.ceil((started + 1) / 365) - started), // annual contracts auto-renew, so the end date is always ahead
      accountManagerId: i % 3 === 0 ? "u_admin" : "u_am1",
      health: i === 5 ? "At Risk" : i === 7 ? "Churn Risk" : "Healthy",
      onboarding: buildOnboarding(i === 7 ? 6 : 12),
      createdAt: iso(started * DAY),
      lastReportAt: i % 4 === 3 ? iso(40 * DAY) : iso(int(2, 20) * DAY),
      documents: [
        { name: "Master Services Agreement.pdf", kind: "Contract", addedAt: iso(started * DAY) },
        { name: "Brand Guidelines.pdf", kind: "Brand asset", addedAt: iso((started - 3) * DAY) },
      ],
    };
  });

  // ---- Deals from leads in pipeline stages ----
  const deals: Deal[] = [];
  const proposals: Proposal[] = [];
  leads.forEach((l) => {
    const stage = stageFromStatus(l.status);
    if (!stage) return;
    const value = int(6, 45) * 10000;
    const deal: Deal = {
      id: `d_${l.id}`,
      title: `${l.company} — ${l.services[0] ?? "Growth retainer"}`,
      leadId: l.id,
      company: l.company,
      value,
      services: l.services.length ? l.services : ["Meta Ads"],
      probability: PROB[stage],
      expectedClose: daysFromNow(stage === "Won" || stage === "Lost" ? -int(1, 60) : int(3, 45)),
      ownerId: l.ownerId,
      stage,
      notes: "",
      paymentStatus: stage === "Won" ? pick(["Paid", "Partially Paid", "Pending"] as const) : "Pending",
      createdAt: l.createdAt,
      lostReason: stage === "Lost" ? pick(["Budget", "Went with competitor", "Timing", "No response"]) : undefined,
    };
    if (["Proposal", "Negotiation", "Won", "Lost"].includes(stage)) {
      const pid = `p_${l.id}`;
      const lines = deal.services.map((s) => ({ service: s, description: `${s} management`, price: Math.round(value / deal.services.length / 1000) * 1000, billing: "monthly" as const }));
      proposals.push({
        id: pid,
        dealId: deal.id,
        title: `${l.company} Growth Proposal`,
        company: l.company,
        lines,
        status: stage === "Won" ? "Accepted" : stage === "Lost" ? "Rejected" : stage === "Negotiation" ? "Viewed" : pick(["Draft", "Sent", "Viewed"] as const),
        sentAt: iso(int(2, 20) * DAY),
        expiresAt: daysFromNow(int(-5, 25)),
        approval: stage === "Proposal" && R() > 0.5 ? "Awaiting" : "Approved",
        createdAt: iso(int(5, 25) * DAY),
      });
      deal.proposalId = pid;
    }
    deals.push(deal);
  });
  // Some deals already linked to clients (historic wins)
  clients.forEach((c, i) =>
    deals.push({
      id: `d_client_${i}`,
      title: `${c.company} — Annual retainer`,
      clientId: c.id,
      company: c.company,
      value: c.retainer * 12,
      services: c.services,
      probability: 100,
      expectedClose: c.contractStart,
      ownerId: pick(SALES),
      stage: "Won",
      notes: "Signed annual retainer.",
      paymentStatus: "Paid",
      createdAt: c.createdAt,
    }),
  );

  // ---- Meetings ----
  const meetingLeads = leads.filter((l) => ["Meeting", "Proposal", "Negotiation", "Replied"].includes(l.status));
  const meetings: Meeting[] = meetingLeads.slice(0, 18).map((l, i) => {
    const future = i % 2 === 0;
    return {
      id: `m_${i + 1}`,
      title: `${future ? "Discovery call" : "Strategy review"} — ${l.company}`,
      leadId: l.id,
      dealId: `d_${l.id}`,
      startsAt: future ? daysFromNow(int(0, 10), int(10, 17)) : daysFromNow(-int(1, 14), int(10, 17)),
      durationMin: pick([30, 45, 60]),
      link: `https://meet.google.com/${Math.random().toString(36).slice(2, 5)}-${Math.random().toString(36).slice(2, 6)}-abc`,
      ownerId: l.ownerId,
      notes: future ? "" : "Discussed current ad spend and goals for next quarter.",
      outcome: future ? "Pending" : pick(["Positive", "Needs Follow-up", "Not Interested"] as const),
    };
  });
  clients.slice(0, 4).forEach((c, i) =>
    meetings.push({
      id: `m_c${i}`,
      title: `Monthly review — ${c.company}`,
      clientId: c.id,
      startsAt: daysFromNow(int(1, 12), 15),
      durationMin: 45,
      link: "https://meet.google.com/adb-monthly-rev",
      ownerId: c.accountManagerId,
      notes: "",
      outcome: "Pending",
    }),
  );

  // ---- Campaigns ----
  const PLATFORM: Record<Service, string> = {
    "Meta Ads": "Meta (FB + IG)", "Google Ads": "Google Search + PMax", "LinkedIn Ads": "LinkedIn Campaign Manager", Programmatic: "DV360",
    "Retail Media": "Amazon Ads", "Quick Commerce": "Blinkit + Zepto Ads", SEO: "Organic Search",
    "Social Media": "Instagram + LinkedIn", "Influencer Marketing": "Instagram creators", "AI Automation": "WhatsApp + CRM",
    "Video Production": "Reels + YouTube", "Brand Strategy": "Multi-channel", Consulting: "—",
  };
  const TYPE_BY_OBJECTIVE: Record<string, Campaign["campaignType"]> = { "Lead generation": "Lead Generation", Sales: "Conversion", Awareness: "Brand Awareness", Traffic: "Traffic", "App installs": "App Installs" };
  const AUDIENCE_BY_INDUSTRY: Record<string, string> = {
    "D2C / E-commerce": "Women 24-40, metro, wellness & clean-beauty interests; LAL 1% purchasers",
    "Real Estate": "In-market home buyers 30-50, Pune + Mumbai, income top 20%",
    Education: "Parents 35-50 + aspirants 18-24, Bengaluru, test-prep intent",
    Hospitality: "Couples & friends 25-40, weekend-getaway intent, metro origin",
    Healthcare: "Adults 30-60 within 10km of clinics, symptom-search intent",
    "Food & Beverage": "Foodies 21-35, Delhi NCR, delivery-app users",
    Fintech: "Salaried professionals 25-45, credit-card & investing intent",
    Fitness: "Fitness-curious 22-38, Chennai, gym + home-workout interests",
  };
  const campaigns: Campaign[] = [];
  clients.forEach((c, ci) =>
    c.services.forEach((s, si) => {
      const budget = Math.round((c.retainer * (1.5 + R() * 2)) / 1000) * 1000;
      const status = ci === 7 && si === 0 ? "Paused" : ci === 2 && si === 1 ? "Planning" : "Active";
      const metrics = metricsFor(60, budget, ci * 10 + si + 1, s === "SEO" ? 0.5 : 1);
      const last30 = metrics.slice(-30);
      const leadsCount = last30.reduce((a, m) => a + m.leads, 0);
      campaigns.push({
        id: `cmp_${ci}_${si}`,
        name: `${c.company} · ${s}`,
        clientId: c.id,
        service: s,
        platform: PLATFORM[s],
        objective: pick(["Lead generation", "Sales", "Awareness", "Traffic", "App installs"]),
        budget,
        startDate: c.contractStart,
        endDate: c.contractEnd,
        teamIds: some(["u_mkt1", "u_mkt2", "u_am1"], 1, 2),
        status,
        kpis: [
          { label: "Leads", target: Math.round(leadsCount * (0.9 + R() * 0.3)), actual: leadsCount },
          { label: "ROAS", target: 3, actual: +(last30.reduce((a, m) => a + m.revenue, 0) / Math.max(1, last30.reduce((a, m) => a + m.spend, 0))).toFixed(2), unit: "x" },
          { label: "CPA", target: 900, actual: Math.round(last30.reduce((a, m) => a + m.spend, 0) / Math.max(1, last30.reduce((a, m) => a + m.conversions, 0))), unit: "₹" },
        ],
        metrics,
        influencerIds: [],
        campaignType: TYPE_BY_OBJECTIVE[campaigns.length % 2 ? "Sales" : "Lead generation"],
        audience: AUDIENCE_BY_INDUSTRY[c.industry] ?? "Broad 25-45, India",
        landingPage: `${c.website}/${s === "SEO" ? "" : "lp/"}${s.toLowerCase().replace(/\s+/g, "-")}`,
        tracking: s === "Google Ads" ? "GA4 + Google Ads conversion tag, enhanced conversions" : s === "Meta Ads" ? "Meta Pixel + Conversions API, GA4" : "GA4 events + UTM",
        ownerId: pick(["u_mkt1", "u_mkt2"]),
        creativeIds: [],
      });
    }),
  );
  clients.forEach((c) => (c.monthlyAdSpend = campaigns.filter((x) => x.clientId === c.id && x.status === "Active").reduce((a, x) => a + x.budget, 0)));

  // ---- Influencers ----
  const influencers: Influencer[] = Array.from({ length: 36 }, (_, i) => {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const handle = name.toLowerCase().replace(/\s+/g, ".");
    const followers = Math.round(Math.pow(10, 3.7 + R() * 2.6));
    return {
      id: `inf_${i + 1}`,
      name,
      instagram: `@${handle}`,
      youtube: R() > 0.55 ? `youtube.com/@${handle.replace(".", "")}` : undefined,
      category: pick(INFLUENCER_CATS),
      location: pick(CITIES),
      followers,
      engagement: +(followers > 500000 ? 1 + R() * 2 : 2.5 + R() * 5).toFixed(1),
      contentTypes: some(CONTENT, 1, 3),
      pricePerPost: Math.round((followers * (0.08 + R() * 0.12)) / 500) * 500 + 2000,
      availability: pick(["Available", "Available", "Busy", "Unavailable"] as const),
      verification: pick(["Verified", "Verified", "Pending", "Unverified"] as const),
      previousProjects: R() > 0.4 ? some(clients.map((c) => c.company), 1, 2) : [],
      performanceScore: +(5 + R() * 5).toFixed(1),
      notes: "",
      // Index-derived (not R()) so adding these fields doesn't shift the rest of the seeded data.
      platform: i % 5 === 3 ? "YouTube" : i % 11 === 7 ? "LinkedIn" : "Instagram",
      email: `collab.${handle.replace(/\./g, "")}@gmail.com`,
      audience: { topCity: CITIES[(i * 7) % CITIES.length]!, ageBand: ["18-24", "25-34", "25-34", "35-44"][i % 4]!, femalePct: [72, 58, 44, 81, 35, 63][i % 6]! },
    };
  });
  campaigns.filter((c) => c.service === "Influencer Marketing").forEach((c) => (c.influencerIds = influencers.slice(0, 4).map((i) => i.id)));

  // ---- Tasks ----
  const taskTitles = [
    "Prepare monthly performance report", "Set up conversion API", "Refresh ad creatives", "Keyword research for Q4",
    "Collect Meta Business Manager access", "Draft proposal", "Follow up on invoice", "Audit landing page",
    "Brief creators", "Schedule content calendar", "Review negative keywords", "Set up GA4 events",
  ];
  const tasks: Task[] = Array.from({ length: 34 }, (_, i) => {
    const onClient = i % 3 !== 0;
    const c = pick(clients);
    const l = pick(leads.filter((x) => ["Qualified", "Meeting", "Proposal", "Contacted"].includes(x.status)));
    return {
      id: `t_${i + 1}`,
      title: onClient ? `${pick(taskTitles)} — ${c.company}` : `Follow up with ${l.name} (${l.company})`,
      description: "",
      assigneeId: onClient ? pick(["u_mkt1", "u_mkt2", "u_am1"]) : l.ownerId,
      priority: pick(["Low", "Medium", "Medium", "High", "Urgent"] as const),
      dueDate: daysFromNow(int(-4, 12), 18),
      status: pick(["Todo", "Todo", "In Progress", "Done", "Blocked"] as const),
      related: onClient ? { type: "client", id: c.id } : { type: "lead", id: l.id },
      createdAt: iso(int(1, 20) * DAY),
      createdBy: pick(["human", "ai", "automation"] as const),
    };
  });

  // ---- Invoices (last 6 months) ----
  const invoices: Invoice[] = [];
  let n = 1001;
  clients.forEach((c, ci) => {
    for (let m = 5; m >= 0; m--) {
      const issued = new Date();
      issued.setMonth(issued.getMonth() - m, 1);
      const due = new Date(issued.getTime() + 15 * DAY);
      let status: Invoice["status"] = "Paid";
      let paid = c.retainer;
      if (m === 0) {
        status = due.getTime() < Date.now() ? "Overdue" : "Pending";
        paid = 0;
        if (ci % 3 === 1) { status = "Partially Paid"; paid = Math.round(c.retainer * 0.5); }
        if (ci === 0 || ci === 4) { status = "Paid"; paid = c.retainer; }
      } else if (m === 1 && (ci === 5 || ci === 7)) {
        status = "Overdue";
        paid = 0;
      }
      invoices.push({
        id: `inv_${n}`,
        number: `ADB-${n++}`,
        clientId: c.id,
        amount: c.retainer,
        paid,
        issuedAt: issued.toISOString(),
        dueDate: due.toISOString(),
        paidAt: status === "Paid" ? new Date(issued.getTime() + int(3, 14) * DAY).toISOString() : undefined,
        status,
        remindersSent: status === "Overdue" ? int(1, 3) : 0,
        description: `Monthly retainer — ${c.services.join(", ")}`,
      });
    }
  });

  // ---- Conversations & messages ----
  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  const replies = [
    "Thanks for reaching out — yes, we've been looking at improving our Meta ads. Can you share some details?",
    "Interesting. What would the pricing look like for something like this?",
    "Sounds good, let's talk next week. Tuesday works.",
    "Not interested right now, thanks.",
    "Can you send over a couple of case studies first?",
    "We already work with an agency but open to a second opinion.",
  ];
  leads
    .filter((l) => ["Contacted", "Replied", "Meeting", "Proposal", "Negotiation"].includes(l.status))
    .slice(0, 36)
    .forEach((l, i) => {
      const channel = pick(["Email", "Email", "LinkedIn", "WhatsApp"] as const);
      const cid = `cv_${i + 1}`;
      const replied = l.status !== "Contacted";
      const first = personalizeFirstMessage(l, channel);
      const t0 = Date.now() - int(3, 14) * DAY;
      messages.push({ id: `${cid}_m1`, conversationId: cid, direction: "outbound", channel, body: first.body, sentAt: new Date(t0).toISOString(), author: "ai", status: "delivered" });
      let last = t0;
      if (replied) {
        const body = pick(replies);
        last = t0 + int(1, 48) * 3_600_000;
        messages.push({ id: `${cid}_m2`, conversationId: cid, direction: "inbound", channel, body, sentAt: new Date(last).toISOString(), author: "contact", status: "delivered", sentiment: /not interested/i.test(body) ? "negative" : /pricing|case|details|talk|open/i.test(body) ? "positive" : "neutral" });
      } else {
        last = t0 + 3 * DAY;
        messages.push({ id: `${cid}_m2`, conversationId: cid, direction: "outbound", channel, body: `Hi ${l.name.split(" ")[0]}, bumping this in case it got buried — happy to send the ideas as a short Loom instead.`, sentAt: new Date(last).toISOString(), author: "ai", status: "opened" });
      }
      conversations.push({
        id: cid,
        leadId: l.id,
        channel,
        ownerId: l.ownerId,
        campaignId: i < 20 ? "oc_1" : undefined,
        status: replied ? (i % 3 === 0 ? "needs_human" : "open") : "waiting",
        handledBy: replied && i % 2 === 0 ? "human" : "ai",
        unread: replied ? int(0, 2) : 0,
        lastMessageAt: new Date(last).toISOString(),
        subject: channel === "Email" ? `Quick idea for ${l.company}` : undefined,
      });
    });
  clients.slice(0, 3).forEach((c, i) => {
    const cid = `cv_client_${i}`;
    conversations.push({ id: cid, clientId: c.id, channel: "Email", ownerId: c.accountManagerId, status: "open", handledBy: "human", unread: i === 0 ? 1 : 0, lastMessageAt: iso(int(1, 30) * 3_600_000), subject: `${c.company} — campaign update` });
    messages.push({ id: `${cid}_1`, conversationId: cid, direction: "outbound", channel: "Email", body: `Hi team, sharing this week's performance snapshot. CPA is trending down 12% week-on-week.`, sentAt: iso(2 * DAY), author: "human", authorId: c.accountManagerId, status: "opened" });
    messages.push({ id: `${cid}_2`, conversationId: cid, direction: "inbound", channel: "Email", body: `Great to see! Can we push more budget into the top ad set next week?`, sentAt: iso(int(1, 30) * 3_600_000), author: "contact", status: "delivered", sentiment: "positive" });
  });

  // ---- Outreach campaigns ----
  const outreachLeads = leads.filter((l) => ["Contacted", "Replied", "Meeting"].includes(l.status)).slice(0, 40);
  const outreach: OutreachCampaign[] = [
    {
      id: "oc_1",
      name: "D2C founders — Meta Ads audit",
      sequenceId: "seq_default",
      createdAt: iso(14 * DAY),
      ownerId: "u_sales1",
      status: "Running",
      channel: "Email",
      recipients: outreachLeads.map((l) => ({
        leadId: l.id,
        state: l.status === "Contacted" ? "sent" : "replied",
        stepIndex: l.status === "Contacted" ? int(1, 2) : 1,
        service: l.research?.recommendedServices[0],
        angle: l.research?.outreachAngle,
        lastSentAt: l.lastContactedAt,
        stopReason: l.status !== "Contacted" ? "Lead replied" : undefined,
      })),
    },
  ];

  // ---- Automations ----
  const automations: Automation[] = [
    {
      id: "auto_1",
      name: "New lead → research → qualified outreach",
      description: "Researches and scores every new lead, drafts outreach for qualified ones and waits for approval.",
      enabled: true,
      runs: 412,
      lastRunAt: iso(40 * 60_000),
      nodes: [
        { id: "n1", type: "trigger", label: "New lead added", config: { event: "lead.created" } },
        { id: "n2", type: "ai_action", label: "AI researches lead", config: { agent: "research" } },
        { id: "n3", type: "ai_action", label: "AI scores lead", config: { agent: "scoring" } },
        { id: "n4", type: "condition", label: "If score ≥ 60", config: { field: "score", op: ">=", value: 60 } },
        { id: "n5", type: "ai_action", label: "Generate personalized message", config: { agent: "outreach" } },
        { id: "n6", type: "approval", label: "Request approval", config: { approver: "Assigned salesperson" } },
        { id: "n7", type: "action", label: "Send message", config: { channel: "Email" } },
        { id: "n8", type: "wait", label: "Wait 3 days", config: { days: 3 } },
        { id: "n9", type: "condition", label: "If no response", config: { field: "replied", op: "==", value: false } },
        { id: "n10", type: "action", label: "Send follow-up", config: { channel: "Email" } },
        { id: "n11", type: "action", label: "If response → notify salesperson", config: { notify: "owner" } },
      ],
    },
    {
      id: "auto_2",
      name: "Deal won → client onboarding",
      description: "Creates the client profile, sends onboarding form and creates internal setup tasks.",
      enabled: true,
      runs: 23,
      lastRunAt: iso(6 * DAY),
      nodes: [
        { id: "n1", type: "trigger", label: "Deal moved to Won", config: { event: "deal.won" } },
        { id: "n2", type: "action", label: "Create client profile", config: {} },
        { id: "n3", type: "action", label: "Send onboarding form", config: { channel: "Email" } },
        { id: "n4", type: "action", label: "Create internal tasks", config: { template: "By service" } },
        { id: "n5", type: "action", label: "Assign account manager", config: { rule: "Round robin" } },
      ],
    },
    {
      id: "auto_3",
      name: "Invoice overdue → reminder",
      description: "Sends polite payment reminders at 1, 7 and 14 days overdue — approval required.",
      enabled: true,
      runs: 57,
      lastRunAt: iso(DAY),
      nodes: [
        { id: "n1", type: "trigger", label: "Invoice becomes overdue", config: { event: "invoice.overdue" } },
        { id: "n2", type: "ai_action", label: "Draft reminder", config: { tone: "Friendly" } },
        { id: "n3", type: "approval", label: "Finance approval", config: { approver: "Finance" } },
        { id: "n4", type: "action", label: "Send reminder", config: { channel: "Email" } },
      ],
    },
    {
      id: "auto_4",
      name: "Monthly client report",
      description: "On the 1st of each month, pulls ad data and generates a PDF report for every active client.",
      enabled: false,
      runs: 9,
      lastRunAt: iso(27 * DAY),
      nodes: [
        { id: "n1", type: "trigger", label: "Schedule: 1st of month, 9:00", config: { cron: "0 9 1 * *" } },
        { id: "n2", type: "action", label: "Pull Meta + Google Ads data", config: {} },
        { id: "n3", type: "ai_action", label: "Write performance commentary", config: {} },
        { id: "n4", type: "approval", label: "Account manager review", config: {} },
        { id: "n5", type: "action", label: "Email PDF to client", config: {} },
      ],
    },
    {
      id: "auto_5",
      name: "Campaign performance drops → AI analysis → media buyer",
      description: "When CPA rises 20%+ week over week, the Media agent investigates and sends a recommendation to the media buyer.",
      enabled: true,
      runs: 38,
      lastRunAt: iso(5 * 3_600_000),
      nodes: [
        { id: "n1", type: "trigger", label: "Campaign metric changes", config: { event: "campaign.metric_changed", metric: "CPA" } },
        { id: "n2", type: "condition", label: "If CPA up ≥ 20% vs last week", config: { field: "cpa_change", op: ">=", value: 20 } },
        { id: "n3", type: "ai_action", label: "Media agent analyses creative, audience, placement, funnel", config: { agent: "media" } },
        { id: "n4", type: "ai_decision", label: "AI decides: budget shift, creative refresh or landing-page fix", config: { agent: "media", outputs: "recommendation" } },
        { id: "n5", type: "action", label: "Notify media buyer (Slack + in-app)", config: { channel: "Slack", role: "Performance Marketer" } },
      ],
    },
    {
      id: "auto_6",
      name: "Client report due → generate → approve → send",
      description: "Collects data, drafts the report with AI commentary, waits for the account manager, then sends it to the client.",
      enabled: true,
      runs: 64,
      lastRunAt: iso(2 * DAY),
      nodes: [
        { id: "n1", type: "trigger", label: "Report schedule is due", config: { event: "report.due" } },
        { id: "n2", type: "action", label: "Collect data from connected platforms", config: { sources: "Meta, Google Ads, GA4, Shopify" } },
        { id: "n3", type: "ai_action", label: "Reporting agent writes summary, insights & next month's plan", config: { agent: "reporting" } },
        { id: "n4", type: "approval", label: "Account manager approval", config: { approver: "Account Manager" } },
        { id: "n5", type: "action", label: "Send report to client", config: { channel: "Email", format: "PDF" } },
      ],
    },
  ];

  const integrations: Integration[] = seedIntegrations();

  const reportSchedules: ReportSchedule[] = clients.slice(0, 6).map((c, i) => ({
    id: `rs_${i}`,
    clientId: c.id,
    frequency: i % 2 ? "Weekly" : "Monthly",
    format: (["PDF", "Dashboard", "Excel", "Presentation"] as const)[i % 4],
    recipients: [c.contacts[0]!.email],
    nextRunAt: daysFromNow(int(1, 20), 9),
    enabled: i !== 5,
  }));

  const notifications: Notification[] = [
    { id: "nt_1", at: iso(20 * 60_000), title: "Positive reply from Nova Homes", body: "AI flagged a positive reply — take over the conversation.", href: "/inbox", read: false, kind: "ai" },
    { id: "nt_2", at: iso(2 * 3_600_000), title: "3 outreach drafts awaiting approval", body: "D2C founders — Meta Ads audit", href: "/outreach", read: false, kind: "warning" },
    { id: "nt_3", at: iso(5 * 3_600_000), title: "Invoice ADB-1047 overdue", body: "Ember Kitchen — reminder queued for approval.", href: "/payments", read: false, kind: "warning" },
    { id: "nt_4", at: iso(DAY), title: "Deal won: Cedar Realty expansion", body: "Onboarding automation started.", href: "/clients", read: true, kind: "success" },
  ];

  const approvals: ApprovalRequest[] = [
    { id: "ap_1", kind: "Payment reminders", title: "Send reminder for overdue invoice", detail: "Ember Kitchen — ₹80,000 overdue 12 days", createdAt: iso(5 * 3_600_000), status: "pending" },
    { id: "ap_2", kind: "Campaign changes", title: "Increase budget +15% on top ad set", detail: "Bloom Organics · Meta Ads — ROAS 4.1x over last 7 days", createdAt: iso(9 * 3_600_000), status: "pending" },
    { id: "ap_3", kind: "Client communication", title: "Weekly update email", detail: "Lumen Academy — AI-drafted summary of week 38", createdAt: iso(26 * 3_600_000), status: "pending" },
  ];

  const activities: Activity[] = [
    { id: "a_1", at: iso(15 * 60_000), actor: "ai", entity: "lead", entityId: "l_1", action: "Researched lead", detail: `${leads[0]!.company} — summary generated` },
    { id: "a_2", at: iso(40 * 60_000), actor: "ai", entity: "outreach", action: "Drafted 12 messages", detail: "D2C founders — Meta Ads audit" },
    { id: "a_3", at: iso(2 * 3_600_000), actor: "human", actorId: "u_sales1", entity: "deal", action: "Moved deal to Proposal", detail: deals[3]?.title },
    { id: "a_4", at: iso(4 * 3_600_000), actor: "system", entity: "automation", action: "Stopped follow-ups", detail: "Lead replied — sequence halted" },
    { id: "a_5", at: iso(DAY), actor: "human", actorId: "u_admin", entity: "settings", action: "Changed approval mode", detail: "Follow-ups → Approval Required" },
    { id: "a_6", at: iso(DAY + 3_600_000), actor: "ai", entity: "invoice", action: "Drafted payment reminder", detail: "Ember Kitchen" },
  ];

  // ---- Agency OS data (per-module seeds) ----
  const team = withTeamMeta([...TEAM, ...EXTRA_TEAM]);
  const ads = seedAds(campaigns);
  const ctx: SeedCtx = { team, leads, clients, campaigns, influencers, ads };
  const os = {
    ads,
    strategies: seedStrategies(ctx),
    creatives: seedCreatives(ctx),
    concepts: seedConcepts(ctx),
    videos: seedVideos(ctx),
    socialPosts: seedSocialPosts(ctx),
    engagements: seedEngagements(ctx),
    seoProjects: seedSeoProjects(ctx),
    assets: seedAssets(ctx),
    knowledge: seedKnowledge(ctx),
    recommendations: seedRecommendations(ctx),
    expenses: seedExpenses(ctx),
    projects: seedProjects(ctx),
    savedViews: seedSavedViews(ctx),
    aiTasks: seedAITasks(),
    threads: [] as CommandThread[],
    organization: seedOrganization({ leads: leads.length, clients: clients.length, campaigns: campaigns.length, team: team.filter((t) => t.role !== "client").length }),
  };

  // Link client tasks to that client's first project so project progress is meaningful.
  tasks.forEach((t, i) => {
    if (t.related?.type !== "client") return;
    const ps = os.projects.filter((p) => p.clientId === t.related!.id);
    if (ps.length) t.projectId = ps[i % ps.length]!.id;
  });

  return { team, leads, deals, meetings, proposals, clients, campaigns, tasks, invoices, influencers, conversations, messages, outreach, automations, integrations, reportSchedules, notifications, activities, approvals, ...os };
}
