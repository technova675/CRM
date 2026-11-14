import {
  BarChart3,
  Bot,
  BookOpen,
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
  History,
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

export const NAV_GROUPS = ["Overview", "CRM & sales", "Accounts", "Execution", "Intelligence", "Operations"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  module: Module;
  group: NavGroup;
  secondary?: boolean;
  phase?: 1 | 2 | 3 | 4; // roadmap phase from the product plan (shown as a hint only)
}

export const NAV: NavItem[] = [
  { href: "/command", label: "Command Center", icon: BrainCircuit, module: "command", group: "Overview" },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard", group: "Overview" },

  { href: "/leads", label: "CRM", icon: Users, module: "leads", group: "CRM & sales" },
  { href: "/pipeline", label: "Sales", icon: KanbanSquare, module: "pipeline", group: "CRM & sales" },
  { href: "/research", label: "AI Research", icon: Sparkles, module: "research", secondary: true, group: "CRM & sales" },
  { href: "/outreach", label: "Outreach", icon: Send, module: "outreach", secondary: true, group: "CRM & sales" },
  { href: "/inbox", label: "Inbox", icon: Inbox, module: "inbox", secondary: true, group: "CRM & sales" },
  { href: "/proposals", label: "Proposals", icon: FileSignature, module: "proposals", secondary: true, group: "CRM & sales" },
  { href: "/meetings", label: "Meetings", icon: CalendarDays, module: "meetings", secondary: true, group: "CRM & sales" },

  { href: "/clients", label: "Clients", icon: Building2, module: "clients", group: "Accounts" },
  { href: "/onboarding", label: "Onboarding", icon: ClipboardCheck, module: "onboarding", secondary: true, group: "Accounts" },
  { href: "/strategy", label: "Strategy", icon: Target, module: "strategy", group: "Accounts" },
  { href: "/documents", label: "Documents & Assets", icon: FolderOpen, module: "documents", secondary: true, group: "Accounts" },
  { href: "/knowledge", label: "AI Knowledge Base", icon: BookOpen, module: "documents", secondary: true, group: "Accounts" },

  { href: "/campaigns", label: "Campaigns", icon: Megaphone, module: "campaigns", group: "Execution" },
  { href: "/performance", label: "Performance", icon: Gauge, module: "performance", secondary: true, group: "Execution", phase: 2 },
  { href: "/creative", label: "Creative", icon: Palette, module: "creative", group: "Execution", phase: 2 },
  { href: "/video", label: "AI Video", icon: Clapperboard, module: "video", group: "Execution", phase: 3 },
  { href: "/social", label: "Social", icon: Share2, module: "social", group: "Execution", phase: 3 },
  { href: "/influencers", label: "Influencers", icon: Star, module: "influencers", group: "Execution", phase: 3 },
  { href: "/seo", label: "SEO", icon: Search, module: "seo", group: "Execution", phase: 3 },
  { href: "/india-commerce", label: "India Commerce", icon: Megaphone, module: "india-commerce", group: "Execution" },
  { href: "/ai-visibility", label: "AI Search Visibility", icon: Sparkles, module: "ai-visibility", group: "Intelligence" },

  { href: "/analytics", label: "Analytics", icon: LineChart, module: "analytics", group: "Intelligence", phase: 2 },
  { href: "/reports", label: "Reports", icon: FileBarChart, module: "reports", group: "Intelligence" },

  { href: "/tasks", label: "Tasks", icon: CheckSquare, module: "tasks", group: "Operations" },
  { href: "/payments", label: "Finance", icon: Wallet, module: "payments", group: "Operations" },
  { href: "/team", label: "Team", icon: UserCog, module: "team", secondary: true, group: "Operations" },
  { href: "/automations", label: "Automations", icon: Workflow, module: "automations", group: "Operations" },
  { href: "/audit", label: "AI Audit Log", icon: History, module: "settings", secondary: true, group: "Operations" },
  { href: "/approvals", label: "AI Approvals", icon: ClipboardCheck, module: "automations", secondary: true, group: "Operations" },
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
