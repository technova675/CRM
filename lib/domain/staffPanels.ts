import type { Module } from "../permissions";

// Sections of the staff workspace (/staff). Safe to import from client and server code.
export const STAFF_PANELS = ["tasks", "leads", "clients", "campaigns", "documents", "reports", "invoices"] as const;
export type StaffPanel = (typeof STAFF_PANELS)[number];

export const STAFF_PANEL_LABEL: Record<StaffPanel, string> = {
  tasks: "My tasks", leads: "Leads", clients: "Clients", campaigns: "Campaigns", documents: "Documents", reports: "Reports", invoices: "Invoices",
};

// Role permissions are defined per CRM module; each panel reads from one module.
export const STAFF_PANEL_MODULE: Record<StaffPanel, Module> = {
  tasks: "tasks", leads: "leads", clients: "clients", campaigns: "campaigns", documents: "documents", reports: "reports", invoices: "payments",
};

export type PanelOverrides = Partial<Record<StaffPanel, boolean>>;

// Sections of the client portal. A portal client sees every section by default; the owner can hide any of them.
export const PORTAL_PANELS = ["campaigns", "performance", "reports", "creatives", "tasks", "documents", "invoices", "meetings", "messages"] as const;
export type PortalPanel = (typeof PORTAL_PANELS)[number];

export const PORTAL_PANEL_LABEL: Record<PortalPanel, string> = {
  campaigns: "Campaigns", performance: "Performance", reports: "Reports", creatives: "Creative approvals", tasks: "Tasks",
  documents: "Documents", invoices: "Invoices", meetings: "Meetings", messages: "Messages",
};

// Tab names used by the portal page.
export const PORTAL_PANEL_TAB: Record<PortalPanel, string> = { ...PORTAL_PANEL_LABEL };

// A user counts as online if their last heartbeat is newer than this.
export const ONLINE_WINDOW_MS = 150_000;
