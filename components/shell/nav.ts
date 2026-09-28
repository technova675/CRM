import {
  BarChart3,
  Bot,
  BrainCircuit,
  Building2,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  Clapperboard,
  FileBarChart,
  FileSignature,
  FolderOpen,
  Gauge,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  LineChart,
  Megaphone,
  Palette,
  Plug,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Star,
  Target,
  UserCog,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Module } from "@/lib/permissions";

export const NAV_GROUPS = ["Overview", "Sales", "Clients", "Execution", "Intelligence", "Operations"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  module: Module;
  group: NavGroup;
  phase?: 1 | 2 | 3 | 4; // roadmap phase from the product plan (shown as a hint only)
}

export const NAV: NavItem[] = [
  { href: "/command", label: "Command Center", icon: BrainCircuit, module: "command", group: "Overview" },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard", group: "Overview" },

  { href: "/leads", label: "Leads & CRM", icon: Users, module: "leads", group: "Sales" },
  { href: "/research", label: "AI Research", icon: Sparkles, module: "research", group: "Sales" },
  { href: "/outreach", label: "Outreach", icon: Send, module: "outreach", group: "Sales" },
  { href: "/inbox", label: "Inbox", icon: Inbox, module: "inbox", group: "Sales" },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare, module: "pipeline", group: "Sales" },
  { href: "/proposals", label: "Proposals", icon: FileSignature, module: "proposals", group: "Sales" },
  { href: "/meetings", label: "Meetings", icon: CalendarDays, module: "meetings", group: "Sales" },

  { href: "/clients", label: "Clients", icon: Building2, module: "clients", group: "Clients" },
  { href: "/onboarding", label: "Onboarding", icon: ClipboardCheck, module: "onboarding", group: "Clients" },
  { href: "/strategy", label: "Strategy", icon: Target, module: "strategy", group: "Clients" },
  { href: "/documents", label: "Documents & Assets", icon: FolderOpen, module: "documents", group: "Clients" },

  { href: "/campaigns", label: "Campaigns", icon: Megaphone, module: "campaigns", group: "Execution" },
  { href: "/performance", label: "Performance", icon: Gauge, module: "performance", group: "Execution", phase: 2 },
  { href: "/creative", label: "Creative Studio", icon: Palette, module: "creative", group: "Execution", phase: 2 },
  { href: "/video", label: "AI Video", icon: Clapperboard, module: "video", group: "Execution", phase: 3 },
  { href: "/social", label: "Social", icon: Share2, module: "social", group: "Execution", phase: 3 },
  { href: "/influencers", label: "Influencers", icon: Star, module: "influencers", group: "Execution", phase: 3 },
  { href: "/seo", label: "SEO", icon: Search, module: "seo", group: "Execution", phase: 3 },

  { href: "/analytics", label: "Analytics & Insights", icon: LineChart, module: "analytics", group: "Intelligence", phase: 2 },
  { href: "/reports", label: "Reports", icon: FileBarChart, module: "reports", group: "Intelligence" },

  { href: "/tasks", label: "Tasks & Projects", icon: CheckSquare, module: "tasks", group: "Operations" },
  { href: "/payments", label: "Finance", icon: Wallet, module: "payments", group: "Operations" },
  { href: "/team", label: "Team", icon: UserCog, module: "team", group: "Operations" },
  { href: "/automations", label: "Automations", icon: Workflow, module: "automations", group: "Operations" },
  { href: "/integrations", label: "Integrations", icon: Plug, module: "integrations", group: "Operations" },
  { href: "/settings", label: "Settings", icon: Settings, module: "settings", group: "Operations" },
];

// Client-portal navigation uses friendlier labels for the same routes.
export const CLIENT_LABELS: Partial<Record<Module, string>> = {
  clients: "My account",
  creative: "Creative approvals",
  payments: "Invoices",
  inbox: "Messages",
  documents: "Documents",
};

export const AssistantIcon = Bot;
export const ChartIcon = BarChart3;
