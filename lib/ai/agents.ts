import type { AgentId, AIActionKind } from "../types";
import type { Module } from "../permissions";

// Specialised agents — not one giant agent. Each has a scope (modules it reads/writes),
// the approval mode that governs its actions, and controlled access to the shared
// client knowledge base.
export interface AgentDef {
  id: AgentId;
  name: string;
  short: string;
  description: string;
  color: string; // accent used for the agent chip
  modules: Module[];
  capabilities: string[];
  knowledge: string[]; // what shared context it may read
  action: AIActionKind; // approval mode that applies to its output
  examples: string[];
}

export const AGENTS: Record<AgentId, AgentDef> = {
  sales: {
    id: "sales", name: "Sales Agent", short: "Sales", color: "#0ea5e9",
    description: "Researches leads, qualifies them and drafts personalised outreach.",
    modules: ["leads", "research", "outreach", "pipeline", "proposals"],
    capabilities: ["Lead research", "Lead scoring", "Outreach drafts", "Follow-up suggestions", "Proposal drafts"],
    knowledge: ["CRM records", "Public website data", "Service catalogue"], action: "Outreach",
    examples: ["Show me all leads that need follow-up", "Draft an email to Nova Homes", "Create a proposal for Cedar Realty"],
  },
  strategy: {
    id: "strategy", name: "Strategy Agent", short: "Strategy", color: "#8b5cf6",
    description: "Builds marketing strategy, personas, funnels, channel plans and budget allocation.",
    modules: ["strategy", "clients"], capabilities: ["Marketing strategy", "Personas", "Funnel", "Channel & budget plan", "Testing roadmap", "KPI framework"],
    knowledge: ["Client knowledge base", "Historical performance", "Competitors"], action: "Strategy documents",
    examples: ["Create a launch strategy for Zen Fitness with a ₹10 lakh monthly budget", "Create a strategy for this client"],
  },
  media: {
    id: "media", name: "Media Agent", short: "Media", color: "#f97316",
    description: "Analyses paid media, finds winners, losers, fatigue and budget inefficiencies, and proposes changes.",
    modules: ["performance", "campaigns", "analytics"], capabilities: ["Winners / losers", "Fatigue detection", "Scaling opportunities", "Budget reallocation", "Audience & funnel diagnostics"],
    knowledge: ["Ad platform data", "Campaign KPIs", "Client knowledge base"], action: "Campaign changes",
    examples: ["What should the media team optimise today?", "Find campaigns with rising CPA", "Analyze Bloom Organics' Meta and Google Ads"],
  },
  creative: {
    id: "creative", name: "Creative Agent", short: "Creative", color: "#ec4899",
    description: "Generates concepts, hooks, scripts and storyboards; analyses which creatives win and why.",
    modules: ["creative", "social"], capabilities: ["Concepts", "Hooks & headlines", "Scripts & storyboards", "UGC briefs", "Creative performance analysis"],
    knowledge: ["Brand voice & guidelines", "Approved / rejected concepts", "Creative performance"], action: "Creative generation",
    examples: ["Create 10 creative concepts for Bloom Organics", "Which hooks are winning for Zen Fitness?"],
  },
  video: {
    id: "video", name: "Video Agent", short: "Video", color: "#ef4444",
    description: "Turns raw footage, scripts and reel plans into edited timelines and multiple versions.",
    modules: ["video"], capabilities: ["Auto-cut & silence removal", "Highlight & scene detection", "Captions", "B-roll & music", "Reframing 9:16 / 1:1 / 16:9"],
    knowledge: ["Brand templates", "Reel plans", "Creative performance"], action: "Video exports",
    examples: ["Cut a 30-second reel from the latest upload", "Make 1:1 and 16:9 versions"],
  },
  social: {
    id: "social", name: "Social Agent", short: "Social", color: "#f43f5e",
    description: "Plans the content calendar, writes captions and hooks, reviews drafts and analyses performance.",
    modules: ["social"], capabilities: ["Content calendar", "Captions & hashtags", "Reel / carousel ideas", "AI draft review", "Performance analysis"],
    knowledge: ["Content pillars", "Brand voice", "Post performance"], action: "Social publishing",
    examples: ["Create a monthly content calendar for Coral Stays", "Write 5 reel ideas for Ember Kitchen"],
  },
  seo: {
    id: "seo", name: "SEO Agent", short: "SEO", color: "#84cc16",
    description: "Audits sites, researches keywords, finds content gaps and writes content briefs.",
    modules: ["seo"], capabilities: ["Technical audit", "Keyword research", "Content gaps", "Content briefs", "Ranking analysis"],
    knowledge: ["Search Console", "Crawl data", "Competitors"], action: "SEO changes",
    examples: ["Which keywords dropped for Lumen Academy?", "Write a content brief for 'best neet coaching in bangalore'"],
  },
  analytics: {
    id: "analytics", name: "Analytics Agent", short: "Analytics", color: "#14b8a6",
    description: "Explains what happened, why, what to do next and what to test — across every platform.",
    modules: ["analytics", "performance", "reports"], capabilities: ["Anomaly detection", "Root-cause analysis", "Period comparison", "Cross-platform attribution"],
    knowledge: ["Unified metrics", "Historical performance"], action: "Campaign recommendations",
    examples: ["Compare this month's performance with last month", "Why did CPA increase for Cedar Realty?"],
  },
  reporting: {
    id: "reporting", name: "Reporting Agent", short: "Reporting", color: "#6366f1",
    description: "Compiles client reports with executive summary, insights, what changed and next month's plan.",
    modules: ["reports"], capabilities: ["Executive summaries", "Monthly reports", "Performance summaries", "Scheduled delivery"],
    knowledge: ["Unified metrics", "Client goals", "Recommendations"], action: "Reports",
    examples: ["Create a client report for Bloom Organics", "Create a performance summary"],
  },
  client_success: {
    id: "client_success", name: "Client Success Agent", short: "Client Success", color: "#10b981",
    description: "Monitors client health, flags churn risk and finds upsell opportunities.",
    modules: ["clients", "onboarding"], capabilities: ["Health scoring", "Churn risk", "Upsell opportunities", "Renewal tracking", "Client summaries"],
    knowledge: ["Client knowledge base", "Performance", "Billing", "Communication"], action: "Client communication",
    examples: ["Which clients are at risk?", "Which clients can we upsell?", "Summarize Cedar Realty"],
  },
  finance: {
    id: "finance", name: "Finance Agent", short: "Finance", color: "#64748b",
    description: "Monitors invoices and payments, drafts reminders and tracks profitability.",
    modules: ["payments"], capabilities: ["Overdue monitoring", "Reminder drafts", "Profitability", "Cash-flow forecast"],
    knowledge: ["Invoices", "Expenses", "Retainers"], action: "Payment reminders",
    examples: ["Which clients have pending payments?", "Which clients are least profitable?"],
  },
  automation: {
    id: "automation", name: "Automation Agent", short: "Automation", color: "#0891b2",
    description: "Builds and runs workflows: trigger → condition → AI decision → approval → action.",
    modules: ["automations"], capabilities: ["Workflow creation", "Workflow execution", "Routine task creation"],
    knowledge: ["Automations", "Approval modes"], action: "Task creation",
    examples: ["When a campaign's CPA rises 20%, notify the media buyer", "Create a workflow for overdue invoices"],
  },
};

export const AGENT_LIST = Object.values(AGENTS);

// Lightweight intent router for the Command Center: picks the specialised agent for a request.
export function routeToAgent(q: string): AgentId {
  const t = q.toLowerCase();
  if (/(video|reel cut|edit|footage|b-roll|caption.*video|9:16|16:9)/.test(t)) return "video";
  if (/(seo|keyword|backlink|search console|ranking|content brief)/.test(t)) return "seo";
  if (/(creative|concept|hook|headline|script|storyboard|ugc|ad copy)/.test(t)) return "creative";
  if (/(content calendar|social|instagram|caption|carousel|post)/.test(t)) return "social";
  if (/(strategy|persona|funnel|launch plan|budget allocation|channel plan)/.test(t)) return "strategy";
  if (/(report|performance summary|executive summary)/.test(t)) return "reporting";
  if (/(invoice|payment|overdue|profitab|margin|revenue collected)/.test(t)) return "finance";
  if (/(at risk|churn|upsell|renewal|health|underperform|summari[sz]e (this )?client)/.test(t)) return "client_success";
  if (/(roas|cpa|cpc|ctr|campaign|meta|google ads|optimi[sz]e|fatigue|spend|media)/.test(t)) return "media";
  if (/(compare|why did|anomal|trend|this month|last month|analy[sz]e)/.test(t)) return "analytics";
  if (/(workflow|automation|automate|trigger)/.test(t)) return "automation";
  return "sales";
}
