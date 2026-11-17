import type { Role } from "@/lib/types";

export interface TourStep {
  /** Matches an element with data-tour="<target>". Omit for a centered step. */
  target?: string;
  title: string;
  description: string;
  roles?: (role: Role) => boolean;
}

export interface PageTour {
  /** Page name shown in the welcome step. */
  name: string;
  /** One or two sentences on what this page is for. */
  summary: string;
  /** Replaces the auto-built steps entirely (used where the page has its own markers). */
  steps?: TourStep[];
  /** Optional page-specific wording for the shared steps. */
  hints?: Partial<Record<"stats" | "search" | "views" | "tabs" | "table" | "actions", string>>;
  /** Include the sidebar/Ask AI walkthrough (first pages a user lands on). */
  shell?: boolean;
}

const canWrite = (role: Role) => role !== "client";

const CLIENTS_STEPS: TourStep[] = [
  { title: "Welcome to Clients", description: "Every active client in one place. This 30-second tour shows how to read it." },
  { target: "clients-stats", title: "Your agency at a glance", description: "Total clients, monthly retainers (MRR), managed ad spend, onboarding in progress, and how many clients are at risk with unpaid invoices." },
  { target: "clients-filters", title: "Find a client fast", description: "Search by company, industry or location. Filter by health (Healthy, At Risk, Churn Risk) or by service." },
  { target: "clients-view", title: "Cards or table", description: "Switch between the card grid and a compact table showing renewal dates, upsell hints and outstanding invoices side by side." },
  { target: "clients-add", title: "Add a client", description: "Create a client directly with contacts, services and an account manager. A won deal from Sales also appears here automatically.", roles: canWrite },
  { target: "clients-import", title: "Bulk import", description: "Bringing clients from a spreadsheet? Import them all at once.", roles: canWrite },
  { target: "clients-list", title: "Open a client", description: "Each card shows health score, retainer, active campaigns, outstanding invoices, onboarding progress and renewal date. Click one to open the full profile." },
  { target: "app-tour", title: "Need this again?", description: "Click this button any time to replay the tour for the page you are on." },
];

/** Keyed by route. Dynamic detail pages use "<section>/[id]". */
export const PAGE_TOURS: Record<string, PageTour> = {
  command: { name: "AI Command Center", summary: "Ask anything about the agency. Specialised agents answer from the data you're authorized to see and show their work.", shell: true },
  dashboard: { name: "Dashboard", summary: "The headline numbers for your workspace: campaigns, performance, pipeline and what needs attention today.", shell: true },
  leads: { name: "Leads & CRM", summary: "Your lead and account library: contacts, pipeline status, communication history and AI research in one list.", hints: { search: "Search leads by name, company or email, and narrow the list with the filters beside it.", table: "Click a lead to open its full record: contacts, activity, research and next steps." } },
  "leads/[id]": { name: "Lead record", summary: "Everything about one lead: contacts, activity, AI research, and the next step to move it forward." },
  pipeline: { name: "Pipeline", summary: "Lead → Qualified → Meeting → Proposal → Negotiation → Won / Lost. Drag a card or use its move menu. Moving a deal to Won starts client onboarding.", hints: { actions: "Create deals and adjust the board from here." } },
  research: { name: "AI Research", summary: "Analyses publicly available information about each lead and company, then scores and summarises it. Review the evidence before you act on it." },
  outreach: { name: "Outreach", summary: "Research → Personalize → Generate → Review → Approve → Send → Track → Follow-up. Every outbound message needs human approval before it is sent." },
  inbox: { name: "Inbox", summary: "All email and messaging conversations in one place. Pick a conversation on the left to read and reply." },
  proposals: { name: "Proposals", summary: "AI-generated proposals from discovery notes, strategy and your price book, reviewed internally before they reach the client." },
  "proposals/[id]": { name: "Proposal", summary: "Review and edit this proposal before it goes to the client." },
  meetings: { name: "Meetings", summary: "Schedule calls, capture notes and outcomes. Outcomes update the pipeline automatically." },
  clients: { name: "Clients", summary: "", steps: CLIENTS_STEPS },
  "clients/[id]": { name: "Client profile", summary: "Everything for one client: contacts, services, campaigns, invoices, onboarding and reports." },
  "clients/portal-access": { name: "Client portal access", summary: "Create a separate client login and choose which records appear in that client's workspace." },
  onboarding: { name: "Client onboarding", summary: "Deal won → welcome → onboarding form → info, assets, access and tracking → workspace and team → strategy → campaign setup → launch." },
  strategy: { name: "Marketing Strategy", summary: "AI strategy workspace covering personas, funnel, channels, budget, testing and KPIs. Humans review and approve before execution." },
  documents: { name: "Documents & Assets", summary: "Central asset library per client: logos, guidelines, creatives, contracts and reports, with folders, tags and versions." },
  knowledge: { name: "AI Knowledge Base", summary: "Search client documents, SOPs, brand memory and past work. Ask questions and open the evidence behind each answer." },
  campaigns: { name: "Campaign Management", summary: "Plan campaign goals, channels, budget, assets, team and measurement." },
  performance: { name: "Performance", summary: "How campaigns are performing against their goals, with trends you can filter by client and period." },
  creative: { name: "Creative Studio", summary: "Creative approvals, AI concepts and creative intelligence: Draft → Internal Review → Client Review → Approved → Live." },
  "creative/reviews": { name: "Creative review queue", summary: "Request feedback and approval for each creative version." },
  video: { name: "AI Video Editor", summary: "Upload raw footage, scripts and reel plans. The Video Agent builds an editable timeline, you review, it revises." },
  "video/[id]": { name: "Video project", summary: "Review the AI-built timeline for this project and ask for revisions." },
  social: { name: "Social", summary: "Plan, schedule and review social content across your clients' channels." },
  influencers: { name: "Influencers", summary: "Track influencer partners, outreach and campaign projects." },
  seo: { name: "SEO", summary: "Keyword, ranking and site health work for your clients." },
  "india-commerce": { name: "India Commerce", summary: "Plan marketplace activity, consent-based WhatsApp work, regional creative, seasonal budgets and Indian invoice details." },
  "ai-visibility": { name: "AI Search Visibility", summary: "Track how often a client appears in sampled AI answers, which sources are cited, and how visibility changes." },
  analytics: { name: "Analytics", summary: "Trends and breakdowns across clients, campaigns and channels." },
  reports: { name: "Reports", summary: "Upload an Excel, CSV, PowerPoint or PDF report and read it as one dashboard. No demo data is used." },
  tasks: { name: "Tasks & projects", summary: "Tasks for clients, campaigns, creatives, SEO and deals, with dependencies, recurring tasks, projects and team workload." },
  payments: { name: "Finance & Billing", summary: "Revenue, invoices, expenses, profitability and cash-flow forecast." },
  team: { name: "Team", summary: "Members, roles and permissions, and workload across the agency." },
  automations: { name: "Automations", summary: "Rules that do routine work for you. Review what each one does before switching it on." },
  audit: { name: "Activity & AI Audit Log", summary: "Trace workspace changes, specialist actions and approval decisions." },
  approvals: { name: "AI Approvals", summary: "Review work the AI has prepared and see who made each decision. Nothing runs until it is approved." },
  integrations: { name: "Integrations", summary: "Authorize supported platforms, verify their status, and review or retry campaign syncs." },
  settings: { name: "Settings", summary: "Workspace configuration, AI guardrails, security, plan and audit trail." },
};

const SHARED_HINTS = {
  stats: "These cards summarise the key numbers for this page. They update as your data changes.",
  search: "Search and filter to find a record quickly.",
  views: "Switch between views of the same data.",
  tabs: "Move between the sections of this page.",
  table: "Each row is a record. Click one to open its details.",
  actions: "The main actions for this page live here, such as creating or importing records.",
};

export function resolveTourKey(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return null;
  const exact = parts.join("/");
  if (PAGE_TOURS[exact]) return exact;
  if (parts.length > 1) {
    const dynamic = `${parts[0]}/[id]`;
    if (PAGE_TOURS[dynamic]) return dynamic;
  }
  return null;
}

export function buildSteps(key: string): TourStep[] {
  const tour = PAGE_TOURS[key];
  if (!tour) return [];
  if (tour.steps) return tour.steps;
  const hint = { ...SHARED_HINTS, ...tour.hints };
  const steps: TourStep[] = [{ title: `Welcome to ${tour.name}`, description: tour.summary }];
  if (tour.shell) {
    steps.push(
      { target: "app-nav", title: "Navigation", description: "Every area of the CRM is in this sidebar, grouped by what you are doing: sales, accounts, execution, intelligence and operations." },
      { target: "app-ai", title: "Ask AI anywhere", description: "Open the assistant from any page to ask questions about your data or get help with a task." },
    );
  }
  steps.push(
    { target: "page-actions", title: "Main actions", description: hint.actions },
    { target: "page-stat", title: "Key numbers", description: hint.stats },
    { target: "page-tabs", title: "Sections", description: hint.tabs },
    { target: "page-segmented", title: "Views", description: hint.views },
    { target: "page-search", title: "Search and filter", description: hint.search },
    { target: "page-table", title: "Your records", description: hint.table },
    { target: "app-tour", title: "Need this again?", description: "Click this button any time to replay the tour for the page you are on." },
  );
  return steps;
}
