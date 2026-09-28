import type { Role } from "./types";

// Module-level RBAC. The server-side equivalent should enforce the same matrix
// in API handlers / row-level security once a database is attached.
export const MODULES = [
  "command", "dashboard",
  "leads", "research", "outreach", "inbox", "pipeline", "proposals", "meetings",
  "clients", "onboarding", "strategy", "documents",
  "campaigns", "performance", "creative", "video", "social", "influencers", "seo",
  "analytics", "reports",
  "tasks", "payments", "team", "automations", "integrations", "settings",
] as const;
export type Module = (typeof MODULES)[number];

export type Access = "full" | "read" | "own" | "none";

export const MODULE_LABEL: Record<Module, string> = {
  command: "AI Command Center", dashboard: "Dashboard", leads: "Leads & CRM", research: "AI Lead Research", outreach: "Outreach",
  inbox: "Communication Inbox", pipeline: "Sales Pipeline", proposals: "Proposals", meetings: "Meetings", clients: "Client Management",
  onboarding: "Client Onboarding", strategy: "Marketing Strategy", documents: "Documents & Assets", campaigns: "Campaign Management",
  performance: "Performance Marketing", creative: "Creative Studio", video: "AI Video Editor", social: "Social Media",
  influencers: "Influencer Marketing", seo: "SEO", analytics: "Analytics & AI Insights", reports: "Reporting", tasks: "Tasks & Projects",
  payments: "Finance & Billing", team: "Team Management", automations: "Automation Builder", integrations: "Integrations", settings: "Settings",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Founder / Admin",
  sales: "Sales",
  account_manager: "Account Manager",
  marketing: "Performance Marketer",
  creative_strategist: "Creative Strategist",
  video_editor: "Video Editor",
  designer: "Designer",
  seo: "SEO",
  social_media: "Social Media Manager",
  influencer_manager: "Influencer Manager",
  finance: "Finance",
  ai_automation: "AI / Automation Team",
  client: "Client",
};

// Builds a full row from a default + overrides so adding a module never leaves a role undefined.
const row = (base: Access, over: Partial<Record<Module, Access>> = {}) =>
  Object.fromEntries(MODULES.map((m) => [m, over[m] ?? base])) as Record<Module, Access>;

export const DEFAULT_PERMISSIONS: Record<Role, Record<Module, Access>> = {
  admin: row("full"),
  sales: row("none", {
    command: "full", dashboard: "full", leads: "full", research: "full", outreach: "full", inbox: "full", pipeline: "full", proposals: "full", meetings: "full",
    clients: "read", onboarding: "read", strategy: "read", documents: "read", influencers: "read", tasks: "full", automations: "read",
  }),
  account_manager: row("read", {
    command: "full", dashboard: "full", outreach: "none", inbox: "full", proposals: "full", meetings: "full", clients: "full", onboarding: "full", strategy: "full",
    documents: "full", campaigns: "full", creative: "full", social: "full", influencers: "full", reports: "full", tasks: "full", settings: "none",
  }),
  marketing: row("none", {
    command: "full", dashboard: "full", meetings: "read", clients: "read", strategy: "read", documents: "read", campaigns: "full", performance: "full",
    creative: "read", video: "read", social: "read", influencers: "read", seo: "read", analytics: "full", reports: "full", tasks: "full", integrations: "read",
  }),
  creative_strategist: row("none", {
    command: "full", dashboard: "full", clients: "read", strategy: "full", documents: "full", campaigns: "read", performance: "read", creative: "full",
    video: "read", social: "full", influencers: "read", analytics: "read", tasks: "full",
  }),
  video_editor: row("none", { command: "full", dashboard: "full", clients: "read", documents: "read", creative: "read", video: "full", social: "read", tasks: "full" }),
  designer: row("none", { command: "full", dashboard: "full", clients: "read", documents: "full", creative: "full", video: "read", social: "read", tasks: "full" }),
  seo: row("none", { command: "full", dashboard: "full", clients: "read", strategy: "read", documents: "read", seo: "full", analytics: "read", reports: "read", tasks: "full" }),
  social_media: row("none", {
    command: "full", dashboard: "full", clients: "read", strategy: "read", documents: "read", creative: "full", video: "read", social: "full", influencers: "read", analytics: "read", tasks: "full",
  }),
  influencer_manager: row("none", {
    command: "full", dashboard: "full", clients: "read", documents: "read", campaigns: "read", creative: "read", social: "read", influencers: "full", analytics: "read", tasks: "full",
  }),
  finance: row("none", {
    command: "full", dashboard: "full", pipeline: "read", proposals: "read", clients: "read", documents: "read", reports: "read", analytics: "read", tasks: "full", payments: "full", team: "read",
  }),
  ai_automation: row("read", { command: "full", dashboard: "full", automations: "full", integrations: "full", tasks: "full", team: "none", payments: "none" }),
  // The client portal: only their own records, never internal notes, margins, prompts or other clients.
  client: row("none", {
    dashboard: "own", clients: "own", campaigns: "own", reports: "own", creative: "own", tasks: "own", documents: "own", payments: "own", meetings: "own", inbox: "own",
  }),
};

// Runtime overrides edited in Team → Permissions. Kept module-level so `can()` stays a pure function call.
let overrides: Partial<Record<Role, Partial<Record<Module, Access>>>> = {};
export const setPermissionOverrides = (o: typeof overrides) => {
  overrides = o ?? {};
};
export const accessFor = (role: Role, m: Module): Access => overrides[role]?.[m] ?? DEFAULT_PERMISSIONS[role][m];
// Back-compat alias for pages that read the matrix directly.
export const PERMISSIONS = DEFAULT_PERMISSIONS;

export const can = (role: Role, m: Module, need: "read" | "write" = "read") => {
  if (role === "admin") return true; // admins can never lock themselves out
  const a = accessFor(role, m);
  if (a === "none") return false;
  if (need === "write") return a === "full" || a === "own";
  return true;
};

export const moduleFromPath = (path: string): Module => {
  const seg = path.split("/")[1] || "dashboard";
  return ((MODULES as readonly string[]).includes(seg) ? seg : "dashboard") as Module;
};
