"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  Activity,
  AIActionKind,
  ApprovalMode,
  ApprovalRequest,
  Automation,
  Campaign,
  Channel,
  Client,
  Deal,
  DealStage,
  Influencer,
  Invoice,
  Lead,
  LeadStatus,
  Meeting,
  MeetingOutcome,
  Message,
  Notification,
  OnboardingTemplate,
  OutreachCampaign,
  Proposal,
  ProposalStatus,
  ReportSchedule,
  GeneratedReport,
  ScoringCriterion,
  Sequence,
  Suppression,
  Task,
  AgentId,
  AITask,
  CollectionKey,
  Creative,
  CreativeStatus,
  CustomFieldDef,
  NotificationPrefs,
  Organization,
  Recommendation,
  UsageKey,
  Role,
} from "./types";
import { AI_ACTIONS, NOTIFICATION_CATEGORIES } from "./types";
import { buildOnboarding, buildSeed, type SeedData } from "./seed";
import type { Access, Module } from "./permissions";
import { DEFAULT_CRITERIA, scoreLead } from "./ai/scoring";
import { runLocalResearch } from "./ai/research";
import { classifyReply, DEFAULT_SEQUENCE, isOptOut, personalizeFirstMessage, renderStep } from "./ai/outreach";
import { DAY, money, uid } from "./utils";

export interface Settings {
  approvalModes: Record<AIActionKind, ApprovalMode>;
  scoringCriteria: ScoringCriterion[];
  qualifyThreshold: number;
  onboardingTemplates: OnboardingTemplate[];
  sequences: Sequence[];
  suppressions: Suppression[];
  agencyName: string;
  currency: "INR";
  notificationPrefs: NotificationPrefs;
  permissionOverrides: Partial<Record<Role, Partial<Record<Module, Access>>>>;
  leadCustomFields: CustomFieldDef[];
  // Safety switch: consequential ad-platform changes may only run "Automatic" when an admin enables this.
  allowAutonomousSpendChanges: boolean;
  aiCreditCost: Partial<Record<AgentId, number>>;
}

const DEFAULT_NOTIFICATION_PREFS = Object.fromEntries(
  NOTIFICATION_CATEGORIES.map((c) => [c, { inApp: true, email: ["Client approvals", "Payments", "Performance anomalies"].includes(c), slack: ["Campaign issues", "Performance anomalies"].includes(c) }]),
) as NotificationPrefs;

const DEFAULT_SETTINGS: Settings = {
  approvalModes: {
    Outreach: "Approval Required",
    "Follow-ups": "Automatic",
    "Campaign changes": "Approval Required",
    "Client communication": "Approval Required",
    Reports: "Approval Required",
    "Payment reminders": "Approval Required",
    "Campaign recommendations": "Approval Required",
    "Creative generation": "Approval Required",
    "Social publishing": "Approval Required",
    "Video exports": "Approval Required",
    "Strategy documents": "Approval Required",
    Proposals: "Approval Required",
    "Task creation": "Automatic",
    "SEO changes": "Approval Required",
    "Influencer outreach": "Approval Required",
  },
  scoringCriteria: DEFAULT_CRITERIA,
  qualifyThreshold: 60,
  onboardingTemplates: [
    { service: "Default", steps: buildOnboarding().map((s) => s.label) },
    { service: "Meta Ads", steps: ["Get Business Manager partner access", "Verify domain & pixel/CAPI", "Collect product catalogue", "Audience research", "Creative brief"] },
    { service: "Google Ads", steps: ["Get Google Ads MCC access", "Link GA4 & set conversions", "Keyword research", "Build campaign structure"] },
    { service: "SEO", steps: ["Search Console access", "Technical SEO audit", "Keyword map", "Content calendar"] },
    { service: "Influencer Marketing", steps: ["Define creator brief", "Shortlist creators", "Negotiate & contract", "Content approvals"] },
  ],
  sequences: [DEFAULT_SEQUENCE],
  suppressions: [
    { value: "competitor-agency.com", reason: "Competitor domain", addedAt: new Date(Date.now() - 30 * DAY).toISOString() },
  ],
  agencyName: "Adbibe",
  currency: "INR",
  notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
  permissionOverrides: {},
  leadCustomFields: [
    { key: "budget_band", label: "Monthly marketing budget", type: "select", options: ["< ₹1L", "₹1–5L", "₹5–20L", "₹20L+"] },
    { key: "decision_maker", label: "Decision maker?", type: "select", options: ["Yes", "No", "Unknown"] },
    { key: "current_agency", label: "Current agency", type: "text" },
  ],
  allowAutonomousSpendChanges: false,
  aiCreditCost: { sales: 2, strategy: 10, media: 5, creative: 6, video: 25, social: 3, seo: 5, analytics: 4, reporting: 8, client_success: 3, finance: 2, automation: 2 },
};

type NewLead = Omit<Lead, "id" | "createdAt" | "status" | "score" | "research" | "tags" | "notes" | "services"> &
  Partial<Pick<Lead, "status" | "tags" | "notes" | "services">>;

export interface CRMState extends SeedData {
  currentUserId: string;
  settings: Settings;
  reports: GeneratedReport[];
  aiEnabled: boolean | null; // null = unknown until /api/ai/status is checked

  setCurrentUser: (id: string) => void;
  setAIEnabled: (v: boolean) => void;
  log: (a: Omit<Activity, "id" | "at">) => void;
  notify: (n: Omit<Notification, "id" | "at" | "read">) => void;
  markNotificationsRead: () => void;
  resetDemo: () => void;

  // Leads
  addLead: (l: NewLead) => Lead;
  importLeads: (ls: NewLead[]) => { added: number; skipped: number };
  updateLead: (id: string, patch: Partial<Lead>) => void;
  deleteLeads: (ids: string[]) => void;
  setLeadStatus: (id: string, status: LeadStatus, actor?: Activity["actor"]) => void;
  researchLead: (id: string) => Promise<void>;
  rescoreLeads: (ids?: string[]) => void;
  overrideScore: (id: string, value: number | undefined, reason?: string) => void;
  optOutLead: (id: string, reason?: string) => void;

  // Deals
  addDeal: (d: Omit<Deal, "id" | "createdAt">) => Deal;
  updateDeal: (id: string, patch: Partial<Deal>) => void;
  moveDeal: (id: string, stage: DealStage) => void;

  // Meetings
  addMeeting: (m: Omit<Meeting, "id">) => void;
  updateMeeting: (id: string, patch: Partial<Meeting>) => void;
  setMeetingOutcome: (id: string, outcome: MeetingOutcome, notes?: string) => void;

  // Proposals
  addProposal: (p: Omit<Proposal, "id" | "createdAt">) => Proposal;
  updateProposal: (id: string, patch: Partial<Proposal>) => void;
  setProposalStatus: (id: string, s: ProposalStatus) => void;

  // Clients
  updateClient: (id: string, patch: Partial<Client>) => void;
  toggleOnboardingStep: (clientId: string, key: string) => void;
  createClientFromDeal: (dealId: string) => string | undefined;

  // Campaigns
  addCampaign: (c: Omit<Campaign, "id" | "metrics" | "kpis" | "influencerIds"> & Partial<Pick<Campaign, "kpis" | "influencerIds">>) => void;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;

  // Tasks
  addTask: (t: Omit<Task, "id" | "createdAt" | "createdBy"> & Partial<Pick<Task, "createdBy">>) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  // Payments
  addInvoice: (i: Omit<Invoice, "id" | "number" | "paid" | "status" | "remindersSent">) => void;
  recordPayment: (id: string, amount: number) => void;
  sendPaymentReminder: (id: string) => void;
  refreshOverdue: () => void;

  // Influencers
  addInfluencer: (i: Omit<Influencer, "id">) => void;
  updateInfluencer: (id: string, patch: Partial<Influencer>) => void;

  // Inbox
  sendMessage: (conversationId: string, body: string, author?: Message["author"]) => void;
  receiveReply: (conversationId: string, body: string) => void;
  takeOverConversation: (id: string) => void;
  handBackToAI: (id: string) => void;
  updateConversation: (id: string, patch: Partial<SeedData["conversations"][number]>) => void;
  markConversationRead: (id: string) => void;

  // Outreach
  createOutreach: (name: string, leadIds: string[], channel: Channel, sequenceId?: string) => string;
  generateDrafts: (campaignId: string) => Promise<void>;
  updateDraft: (campaignId: string, leadId: string, draft: string) => void;
  approveDrafts: (campaignId: string, leadIds: string[]) => void;
  launchOutreach: (campaignId: string) => void;
  setOutreachStatus: (campaignId: string, status: OutreachCampaign["status"]) => void;
  runFollowUps: () => number;

  // Automations
  addAutomation: (a: Omit<Automation, "id" | "runs">) => void;
  updateAutomation: (id: string, patch: Partial<Automation>) => void;
  deleteAutomation: (id: string) => void;

  // Settings & integrations
  updateSettings: (patch: Partial<Settings>) => void;
  setApprovalMode: (k: AIActionKind, m: ApprovalMode) => void;
  setIntegrationStatus: (key: string, status: "connected" | "available") => void;
  addSuppression: (value: string, reason: string) => void;
  removeSuppression: (value: string) => void;
  upsertSequence: (s: Sequence) => void;

  // Approvals
  requestApproval: (r: Omit<ApprovalRequest, "id" | "createdAt" | "status">) => void;
  resolveApproval: (id: string, approve: boolean) => void;

  // Reports
  generateReport: (clientId: string, format: ReportSchedule["format"], period: string) => void;
  upsertSchedule: (s: ReportSchedule) => void;

  // ---------- Generic collection helpers (used by every OS module) ----------
  upsert: <K extends CollectionKey>(k: K, item: CRMState[K][number]) => void;
  patch: <K extends CollectionKey>(k: K, id: string, patch: Partial<CRMState[K][number]>, audit?: { entity: Activity["entity"]; action: string; field?: string }) => void;
  remove: (k: CollectionKey, id: string) => void;

  // AI metering & tasks
  consumeUsage: (key: UsageKey, n?: number) => boolean; // false = plan limit reached
  startAITask: (t: Pick<AITask, "agent" | "title" | "input"> & Partial<Pick<AITask, "clientId" | "ref">>) => string | null;
  finishAITask: (id: string, output: string, status?: AITask["status"]) => void;
  modeFor: (k: AIActionKind) => ApprovalMode;

  // Recommendations: AI recommendation → human approval → execution
  addRecommendations: (rs: Recommendation[]) => void;
  actOnRecommendation: (id: string, decision: "approve" | "dismiss") => void;

  // Creative approvals (team + client portal)
  setCreativeStatus: (id: string, status: CreativeStatus, comment?: string) => void;
  addCreativeComment: (id: string, body: string, internal?: boolean) => void;
  addCreativeVersion: (id: string, v: Omit<Creative["versions"][number], "v" | "createdAt" | "createdBy">) => void;

  // Organization / SaaS
  updateOrganization: (patch: Partial<Organization>) => void;
  setPermissionOverride: (role: Role, m: Module, a: Access | undefined) => void;
}

const now = () => new Date().toISOString();
const short = (v: unknown) => (v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v).slice(0, 120) : String(v).slice(0, 120));

const STATUS_TO_STAGE: Partial<Record<LeadStatus, DealStage>> = {
  Qualified: "Qualified",
  Contacted: "Contacted",
  Replied: "Contacted",
  Meeting: "Meeting",
  Proposal: "Proposal",
  Negotiation: "Negotiation",
  Won: "Won",
  Lost: "Lost",
};
const STAGE_TO_STATUS: Record<DealStage, LeadStatus> = {
  "New Lead": "New",
  Qualified: "Qualified",
  Contacted: "Contacted",
  Meeting: "Meeting",
  Proposal: "Proposal",
  Negotiation: "Negotiation",
  Won: "Won",
  Lost: "Lost",
};
const STAGE_PROB: Record<DealStage, number> = { "New Lead": 10, Qualified: 20, Contacted: 25, Meeting: 40, Proposal: 60, Negotiation: 80, Won: 100, Lost: 0 };

async function callResearchAPI(lead: Lead) {
  try {
    const res = await fetch("/api/ai/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lead }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.research as Lead["research"] | null;
  } catch {
    return null;
  }
}

export const useCRM = create<CRMState>()(
  persist(
    (set, get) => {
      const log: CRMState["log"] = (a) =>
        set((s) => ({ activities: [{ ...a, id: uid("act"), at: now() }, ...s.activities].slice(0, 500) }));
      const notify: CRMState["notify"] = (n) => {
        // Respect per-category in-app preferences (email / Slack delivery happens server-side once wired).
        if (n.category && get().settings.notificationPrefs?.[n.category]?.inApp === false) return;
        set((s) => ({ notifications: [{ ...n, id: uid("nt"), at: now(), read: false }, ...s.notifications].slice(0, 100) }));
      };
      const me = () => get().currentUserId;
      const mode = (k: AIActionKind) => get().settings.approvalModes[k];
      const isSuppressed = (l: Lead) => {
        const sup = get().settings.suppressions;
        const domain = l.email.split("@")[1] ?? "";
        return l.optedOut || sup.some((s) => s.value === l.email || s.value === domain || s.value === l.phone);
      };

      return {
        ...buildSeed(),
        currentUserId: "u_admin",
        settings: DEFAULT_SETTINGS,
        reports: [],
        aiEnabled: null,
        modeFor: (k) => mode(k),

        setCurrentUser: (id) => set({ currentUserId: id }),
        setAIEnabled: (v) => set({ aiEnabled: v }),
        log,
        notify,
        markNotificationsRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
        resetDemo: () => set({ ...buildSeed(), settings: DEFAULT_SETTINGS, reports: [], currentUserId: "u_admin" }),

        // ---------------- Leads ----------------
        addLead: (input) => {
          const lead: Lead = {
            tags: [],
            notes: "",
            services: [],
            ...input,
            id: uid("l"),
            createdAt: now(),
            status: input.status ?? "New",
          };
          lead.score = scoreLead(lead, get().settings.scoringCriteria);
          set((s) => ({ leads: [lead, ...s.leads] }));
          log({ actor: "human", actorId: me(), entity: "lead", entityId: lead.id, action: "Added lead", detail: `${lead.name} · ${lead.company}` });
          // Trigger: "New lead added" automation → research + score
          const auto = get().automations.find((a) => a.enabled && a.nodes[0]?.config.event === "lead.created");
          if (auto) {
            set((s) => ({ automations: s.automations.map((a) => (a.id === auto.id ? { ...a, runs: a.runs + 1, lastRunAt: now() } : a)) }));
            void get().researchLead(lead.id);
          }
          return lead;
        },
        importLeads: (rows) => {
          const existing = new Set(get().leads.map((l) => l.email.toLowerCase()));
          const criteria = get().settings.scoringCriteria;
          const fresh: Lead[] = [];
          let skipped = 0;
          for (const r of rows) {
            const key = (r.email || "").toLowerCase();
            if (!r.name || (key && existing.has(key))) {
              skipped++;
              continue;
            }
            existing.add(key);
            const lead: Lead = { tags: ["imported"], notes: "", services: [], ...r, id: uid("l"), createdAt: now(), status: r.status ?? "New" };
            lead.score = scoreLead(lead, criteria);
            fresh.push(lead);
          }
          set((s) => ({ leads: [...fresh, ...s.leads] }));
          log({ actor: "human", actorId: me(), entity: "lead", action: "Imported leads", detail: `${fresh.length} added, ${skipped} skipped (duplicates / missing name)` });
          return { added: fresh.length, skipped };
        },
        updateLead: (id, patch) => set((s) => ({ leads: s.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
        deleteLeads: (ids) => {
          const set_ = new Set(ids);
          set((s) => ({ leads: s.leads.filter((l) => !set_.has(l.id)) }));
          log({ actor: "human", actorId: me(), entity: "lead", action: "Deleted leads", detail: `${ids.length} lead(s)` });
        },
        setLeadStatus: (id, status, actor = "human") => {
          const lead = get().leads.find((l) => l.id === id);
          if (!lead || lead.status === status) return;
          set((s) => ({ leads: s.leads.map((l) => (l.id === id ? { ...l, status } : l)) }));
          log({ actor, actorId: actor === "human" ? me() : undefined, entity: "lead", entityId: id, action: `Status → ${status}`, detail: lead.company });
          // Keep pipeline in sync: create or move the lead's deal.
          const stage = STATUS_TO_STAGE[status];
          if (!stage) return;
          const deal = get().deals.find((d) => d.leadId === id);
          if (deal) {
            if (deal.stage !== stage) get().moveDeal(deal.id, stage);
          } else {
            get().addDeal({
              title: `${lead.company} — ${lead.services[0] ?? "Growth retainer"}`,
              leadId: id,
              company: lead.company,
              value: 150000,
              services: lead.services.length ? lead.services : lead.research?.recommendedServices ?? ["Meta Ads"],
              probability: STAGE_PROB[stage],
              expectedClose: new Date(Date.now() + 30 * DAY).toISOString(),
              ownerId: lead.ownerId,
              stage,
              notes: "",
              paymentStatus: "Pending",
            });
          }
        },
        researchLead: async (id) => {
          const lead = get().leads.find((l) => l.id === id);
          if (!lead) return;
          set((s) => ({
            leads: s.leads.map((l) =>
              l.id === id ? { ...l, status: l.status === "New" ? "Researching" : l.status, research: { status: "running", sections: [], recommendedServices: [] } } : l,
            ),
          }));
          const remote = get().aiEnabled ? await callResearchAPI(lead) : null;
          if (!remote) await new Promise((r) => setTimeout(r, 900)); // make local mode feel like a job
          const research = remote ?? runLocalResearch(lead);
          const criteria = get().settings.scoringCriteria;
          set((s) => ({
            leads: s.leads.map((l) => {
              if (l.id !== id) return l;
              const next = { ...l, research, services: l.services.length ? l.services : research.recommendedServices.slice(0, 2) };
              next.score = scoreLead(next, criteria);
              const qualified = (next.score.override ?? next.score.value) >= get().settings.qualifyThreshold;
              if (l.status === "New" || l.status === "Researching") next.status = qualified ? "Qualified" : "Researching";
              return next;
            }),
          }));
          const updated = get().leads.find((l) => l.id === id)!;
          log({ actor: "ai", entity: "lead", entityId: id, action: "Researched & scored lead", detail: `${updated.company} — score ${updated.score?.value}${remote ? " (AI provider)" : " (local engine)"}` });
          if (updated.status === "Qualified") {
            const deal = get().deals.find((d) => d.leadId === id);
            if (!deal) get().setLeadStatus(id, "Qualified", "ai");
          }
        },
        rescoreLeads: (ids) => {
          const criteria = get().settings.scoringCriteria;
          const only = ids ? new Set(ids) : null;
          set((s) => ({ leads: s.leads.map((l) => (only && !only.has(l.id) ? l : { ...l, score: scoreLead(l, criteria) })) }));
          log({ actor: "ai", entity: "lead", action: "Re-scored leads", detail: `${ids?.length ?? get().leads.length} lead(s) with current criteria` });
        },
        overrideScore: (id, value, reason) => {
          set((s) => ({
            leads: s.leads.map((l) =>
              l.id === id && l.score ? { ...l, score: { ...l.score, override: value, overrideReason: value === undefined ? undefined : reason } } : l,
            ),
          }));
          log({ actor: "human", actorId: me(), entity: "lead", entityId: id, action: value === undefined ? "Cleared score override" : `Overrode score → ${value}`, detail: reason });
        },
        optOutLead: (id, reason = "Opted out") => {
          const lead = get().leads.find((l) => l.id === id);
          if (!lead) return;
          set((s) => ({
            leads: s.leads.map((l) => (l.id === id ? { ...l, optedOut: true, nextFollowUpAt: undefined } : l)),
            outreach: s.outreach.map((c) => ({
              ...c,
              recipients: c.recipients.map((r) => (r.leadId === id && !["replied", "stopped"].includes(r.state) ? { ...r, state: "stopped", stopReason: reason } : r)),
            })),
            settings: { ...s.settings, suppressions: [{ value: lead.email, reason, addedAt: now() }, ...s.settings.suppressions] },
          }));
          log({ actor: "system", entity: "lead", entityId: id, action: "Opted out & suppressed", detail: `${lead.email} — ${reason}` });
        },

        // ---------------- Deals ----------------
        addDeal: (d) => {
          const deal: Deal = { ...d, id: uid("d"), createdAt: now() };
          set((s) => ({ deals: [deal, ...s.deals] }));
          log({ actor: "human", actorId: me(), entity: "deal", entityId: deal.id, action: "Created deal", detail: deal.title });
          return deal;
        },
        updateDeal: (id, patch) => set((s) => ({ deals: s.deals.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),
        moveDeal: (id, stage) => {
          const deal = get().deals.find((d) => d.id === id);
          if (!deal || deal.stage === stage) return;
          set((s) => ({ deals: s.deals.map((d) => (d.id === id ? { ...d, stage, probability: STAGE_PROB[stage] } : d)) }));
          log({ actor: "human", actorId: me(), entity: "deal", entityId: id, action: `Moved to ${stage}`, detail: deal.title, before: deal.stage, after: stage });
          if (deal.leadId) {
            const status = STAGE_TO_STATUS[stage];
            set((s) => ({ leads: s.leads.map((l) => (l.id === deal.leadId ? { ...l, status } : l)) }));
          }
          if (stage === "Won" && !deal.clientId) {
            const clientId = get().createClientFromDeal(id);
            if (clientId) {
              notify({ title: `Deal won: ${deal.company}`, body: "Client profile created and onboarding started.", href: `/clients/${clientId}`, kind: "success" });
            }
          }
        },

        // ---------------- Meetings ----------------
        addMeeting: (m) => {
          const meeting = { ...m, id: uid("m") };
          set((s) => ({ meetings: [...s.meetings, meeting] }));
          log({ actor: "human", actorId: me(), entity: "meeting", entityId: meeting.id, action: "Scheduled meeting", detail: meeting.title });
          if (m.leadId) {
            const lead = get().leads.find((l) => l.id === m.leadId);
            if (lead && ["New", "Researching", "Qualified", "Contacted", "Replied"].includes(lead.status)) get().setLeadStatus(lead.id, "Meeting");
            // Stop rule: meeting booked → halt sequences
            if (get().settings.sequences[0]?.stopRules.onMeetingBooked) {
              set((s) => ({
                outreach: s.outreach.map((c) => ({
                  ...c,
                  recipients: c.recipients.map((r) => (r.leadId === m.leadId && ["sent", "approved", "drafted"].includes(r.state) ? { ...r, state: "stopped", stopReason: "Meeting booked" } : r)),
                })),
              }));
            }
          }
        },
        updateMeeting: (id, patch) => set((s) => ({ meetings: s.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
        setMeetingOutcome: (id, outcome, notes) => {
          const m = get().meetings.find((x) => x.id === id);
          if (!m) return;
          set((s) => ({ meetings: s.meetings.map((x) => (x.id === id ? { ...x, outcome, notes: notes ?? x.notes } : x)) }));
          log({ actor: "human", actorId: me(), entity: "meeting", entityId: id, action: `Outcome: ${outcome}`, detail: m.title });
          if (m.leadId) {
            if (outcome === "Positive") get().setLeadStatus(m.leadId, "Proposal");
            if (outcome === "Not Interested") get().setLeadStatus(m.leadId, "Lost");
            if (outcome === "Positive" || outcome === "Needs Follow-up" || outcome === "No Show") {
              const lead = get().leads.find((l) => l.id === m.leadId);
              get().addTask({
                title: outcome === "Positive" ? `Send proposal to ${lead?.company}` : `Follow up after meeting — ${lead?.company}`,
                description: notes ?? "",
                assigneeId: m.ownerId,
                priority: outcome === "Positive" ? "High" : "Medium",
                dueDate: new Date(Date.now() + (outcome === "Positive" ? 2 : 3) * DAY).toISOString(),
                status: "Todo",
                related: { type: "lead", id: m.leadId },
                createdBy: "automation",
              });
            }
          }
        },

        // ---------------- Proposals ----------------
        addProposal: (p) => {
          const proposal: Proposal = { ...p, id: uid("p"), createdAt: now() };
          set((s) => ({ proposals: [proposal, ...s.proposals], deals: s.deals.map((d) => (d.id === p.dealId ? { ...d, proposalId: proposal.id } : d)) }));
          log({ actor: "human", actorId: me(), entity: "proposal", entityId: proposal.id, action: "Created proposal", detail: proposal.title });
          return proposal;
        },
        updateProposal: (id, patch) => set((s) => ({ proposals: s.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
        setProposalStatus: (id, status) => {
          const p = get().proposals.find((x) => x.id === id);
          if (!p) return;
          set((s) => ({ proposals: s.proposals.map((x) => (x.id === id ? { ...x, status, sentAt: status === "Sent" ? now() : x.sentAt } : x)) }));
          log({ actor: "human", actorId: me(), entity: "proposal", entityId: id, action: `Proposal ${status}`, detail: p.title });
          const deal = get().deals.find((d) => d.id === p.dealId);
          if (!deal) return;
          if (status === "Sent" && ["New Lead", "Qualified", "Contacted", "Meeting"].includes(deal.stage)) get().moveDeal(deal.id, "Proposal");
          if (status === "Accepted") get().moveDeal(deal.id, "Won");
          if (status === "Rejected") get().moveDeal(deal.id, "Lost");
        },

        // ---------------- Clients ----------------
        updateClient: (id, patch) => {
          const c = get().clients.find((x) => x.id === id);
          set((s) => ({ clients: s.clients.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
          const keys = Object.keys(patch) as (keyof Client)[];
          if (c && keys.length === 1 && ["health", "retainer", "accountManagerId", "services", "contractEnd"].includes(keys[0]!)) {
            log({ actor: "human", actorId: me(), entity: "client", entityId: id, action: `Updated ${String(keys[0])}`, detail: c.company, before: short(c[keys[0]!]), after: short(patch[keys[0]!]) });
          }
        },
        toggleOnboardingStep: (clientId, key) =>
          set((s) => ({
            clients: s.clients.map((c) =>
              c.id === clientId ? { ...c, onboarding: c.onboarding.map((o) => (o.key === key ? { ...o, done: !o.done, doneAt: !o.done ? now() : undefined } : o)) } : c,
            ),
          })),
        createClientFromDeal: (dealId) => {
          const deal = get().deals.find((d) => d.id === dealId);
          if (!deal) return;
          const lead = deal.leadId ? get().leads.find((l) => l.id === deal.leadId) : undefined;
          const existing = get().clients.find((c) => c.company === deal.company);
          if (existing) {
            set((s) => ({ deals: s.deals.map((d) => (d.id === dealId ? { ...d, clientId: existing.id } : d)) }));
            return existing.id;
          }
          const { settings } = get();
          // Onboarding = default checklist + service-specific steps.
          const base = settings.onboardingTemplates.find((t) => t.service === "Default")?.steps ?? [];
          const extra = deal.services.flatMap((svc) => settings.onboardingTemplates.find((t) => t.service === svc)?.steps ?? []);
          const steps = [...base.slice(0, 6), ...extra, ...base.slice(6)];
          const am = get().team.find((t) => t.role === "account_manager")?.id ?? "u_admin";
          const client: Client = {
            id: uid("c"),
            company: deal.company,
            industry: lead?.industry ?? "—",
            website: lead?.website,
            location: lead?.location ?? "—",
            contacts: lead ? [{ name: lead.name, email: lead.email, phone: lead.phone, role: lead.jobTitle }] : [],
            services: deal.services,
            retainer: Math.round(deal.value / 12 / 1000) * 1000 || deal.value,
            contractStart: now(),
            contractEnd: new Date(Date.now() + 365 * DAY).toISOString(),
            accountManagerId: am,
            health: "Healthy",
            fromDealId: dealId,
            onboarding: steps.map((label, i) => ({ key: `ob_${i}`, label, done: i === 0 })),
            createdAt: now(),
            documents: deal.proposalId ? [{ name: "Accepted proposal.pdf", kind: "Proposal", addedAt: now() }] : [],
          };
          set((s) => ({
            clients: [client, ...s.clients],
            deals: s.deals.map((d) => (d.id === dealId ? { ...d, clientId: client.id } : d)),
            automations: s.automations.map((a) => (a.nodes[0]?.config.event === "deal.won" ? { ...a, runs: a.runs + 1, lastRunAt: now() } : a)),
          }));
          // Onboarding automation: internal setup tasks per service.
          const setupTasks = [
            { title: `Kick-off call — ${client.company}`, priority: "High" as const, days: 2 },
            { title: `Collect ad account access — ${client.company}`, priority: "High" as const, days: 3 },
            ...deal.services.map((s) => ({ title: `Set up ${s} — ${client.company}`, priority: "Medium" as const, days: 7 })),
          ];
          setupTasks.forEach((t) =>
            get().addTask({ title: t.title, description: "Created by onboarding automation", assigneeId: am, priority: t.priority, dueDate: new Date(Date.now() + t.days * DAY).toISOString(), status: "Todo", related: { type: "client", id: client.id }, createdBy: "automation" }),
          );
          // Workspace: client knowledge base (AI memory) + onboarding project.
          set((s) => ({
            knowledge: [
              { id: client.id, clientId: client.id, brandVoice: "", toneWords: [], products: [], audience: lead?.research?.sections.find((x) => x.key === "audience")?.findings[0]?.text ?? "", competitors: [], approvedMessaging: [], rejectedConcepts: [], preferences: [], guidelines: "", history: lead?.research?.summary ? [`Pre-sale research: ${lead.research.summary}`] : [], updatedAt: now() },
              ...s.knowledge,
            ],
            projects: [{ id: uid("prj"), name: `${client.company} — Onboarding & launch`, clientId: client.id, ownerId: am, status: "Active", startDate: now(), dueDate: new Date(Date.now() + 21 * DAY).toISOString(), createdAt: now() }, ...s.projects],
          }));
          const welcome = `Welcome email to ${client.contacts[0]?.name ?? client.company}`;
          if (mode("Client communication") === "Automatic") {
            log({ actor: "ai", agent: "client_success", entity: "client", entityId: client.id, action: "Sent welcome email + onboarding form", detail: client.company });
          } else {
            get().requestApproval({ kind: "Client communication", title: welcome, detail: `${client.company} — welcome note with onboarding form link, access checklist and kickoff slots`, ref: { type: "client", id: client.id }, agent: "client_success" });
          }
          log({ actor: "system", entity: "client", entityId: client.id, action: "Client created from won deal", detail: `${client.company} · onboarding started (${steps.length} steps)` });
          return client.id;
        },

        // ---------------- Campaigns ----------------
        addCampaign: (c) => {
          const campaign: Campaign = { kpis: [], influencerIds: [], ...c, id: uid("cmp"), metrics: [] };
          set((s) => ({ campaigns: [campaign, ...s.campaigns] }));
          log({ actor: "human", actorId: me(), entity: "campaign", entityId: campaign.id, action: "Created campaign", detail: campaign.name });
        },
        updateCampaign: (id, patch) => {
          const c = get().campaigns.find((x) => x.id === id);
          set((s) => ({ campaigns: s.campaigns.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
          if (c && patch.status && patch.status !== c.status) log({ actor: "human", actorId: me(), entity: "campaign", entityId: id, action: `Campaign ${patch.status}`, detail: c.name, before: c.status, after: patch.status });
          if (c && patch.budget !== undefined && patch.budget !== c.budget) log({ actor: "human", actorId: me(), entity: "campaign", entityId: id, action: "Changed budget", detail: c.name, before: money(c.budget), after: money(patch.budget) });
        },

        // ---------------- Tasks ----------------
        addTask: (t) => {
          const task: Task = { createdBy: "human", ...t, id: uid("t"), createdAt: now() };
          set((s) => ({ tasks: [task, ...s.tasks] }));
          return task;
        },
        updateTask: (id, patch) => {
          const t = get().tasks.find((x) => x.id === id);
          set((s) => ({ tasks: s.tasks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
          if (!t) return;
          if (patch.status && patch.status !== t.status) log({ actor: "human", actorId: me(), entity: "task", entityId: id, action: "Task status changed", detail: t.title, before: t.status, after: patch.status });
          // Recurring tasks: completing one schedules the next occurrence.
          if (patch.status === "Done" && t.status !== "Done" && t.recurring && t.recurring !== "none") {
            const step = t.recurring === "daily" ? 1 : t.recurring === "weekly" ? 7 : 30;
            const next: Task = { ...t, id: uid("t"), status: "Todo", dueDate: new Date(new Date(t.dueDate).getTime() + step * DAY).toISOString(), createdAt: now(), comments: [], createdBy: "automation" };
            set((s) => ({ tasks: [next, ...s.tasks] }));
          }
        },
        deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

        // ---------------- Payments ----------------
        addInvoice: (i) => {
          const n = 1001 + get().invoices.length;
          set((s) => ({ invoices: [{ ...i, id: uid("inv"), number: `ADB-${n}`, paid: 0, status: "Pending", remindersSent: 0 }, ...s.invoices] }));
          log({ actor: "human", actorId: me(), entity: "invoice", action: "Created invoice", detail: `ADB-${n}` });
        },
        recordPayment: (id, amount) => {
          set((s) => ({
            invoices: s.invoices.map((inv) => {
              if (inv.id !== id) return inv;
              const paid = Math.min(inv.amount, inv.paid + amount);
              const status: Invoice["status"] = paid >= inv.amount ? "Paid" : paid > 0 ? "Partially Paid" : inv.status;
              return { ...inv, paid, status, paidAt: status === "Paid" ? now() : inv.paidAt };
            }),
          }));
          log({ actor: "human", actorId: me(), entity: "invoice", entityId: id, action: "Recorded payment", detail: `₹${amount.toLocaleString("en-IN")}` });
        },
        sendPaymentReminder: (id) => {
          const inv = get().invoices.find((i) => i.id === id);
          const client = get().clients.find((c) => c.id === inv?.clientId);
          if (!inv) return;
          const m = mode("Payment reminders");
          if (m === "Approval Required") {
            get().requestApproval({ kind: "Payment reminders", title: `Send reminder for ${inv.number}`, detail: `${client?.company} — ₹${(inv.amount - inv.paid).toLocaleString("en-IN")} outstanding`, ref: { type: "invoice", id } });
            return;
          }
          set((s) => ({ invoices: s.invoices.map((i) => (i.id === id ? { ...i, remindersSent: i.remindersSent + 1 } : i)) }));
          log({ actor: m === "Automatic" ? "ai" : "human", actorId: me(), entity: "invoice", entityId: id, action: "Sent payment reminder", detail: `${inv.number} · ${client?.company}` });
        },
        refreshOverdue: () =>
          set((s) => ({
            invoices: s.invoices.map((i) => (i.status !== "Paid" && new Date(i.dueDate).getTime() < Date.now() && i.paid < i.amount ? { ...i, status: "Overdue" } : i)),
          })),

        // ---------------- Influencers ----------------
        addInfluencer: (i) => set((s) => ({ influencers: [{ ...i, id: uid("inf") }, ...s.influencers] })),
        updateInfluencer: (id, patch) => set((s) => ({ influencers: s.influencers.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),

        // ---------------- Inbox ----------------
        sendMessage: (conversationId, body, author = "human") => {
          const conv = get().conversations.find((c) => c.id === conversationId);
          if (!conv) return;
          const lead = conv.leadId ? get().leads.find((l) => l.id === conv.leadId) : undefined;
          if (lead && isSuppressed(lead)) {
            notify({ title: "Message blocked", body: `${lead.email} is on the suppression list.`, kind: "warning" });
            return;
          }
          const msg: Message = { id: uid("msg"), conversationId, direction: "outbound", channel: conv.channel, body, sentAt: now(), author, authorId: author === "human" ? me() : undefined, status: "sent" };
          set((s) => ({
            messages: [...s.messages, msg],
            conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, lastMessageAt: msg.sentAt, status: "waiting" } : c)),
            leads: lead ? s.leads.map((l) => (l.id === lead.id ? { ...l, lastContactedAt: msg.sentAt } : l)) : s.leads,
          }));
          log({ actor: author === "ai" ? "ai" : "human", actorId: author === "human" ? me() : undefined, entity: "outreach", entityId: conversationId, action: `Sent ${conv.channel} message`, detail: lead?.company });
        },
        receiveReply: (conversationId, body) => {
          const conv = get().conversations.find((c) => c.id === conversationId);
          if (!conv) return;
          const sentiment = classifyReply(body);
          const msg: Message = { id: uid("msg"), conversationId, direction: "inbound", channel: conv.channel, body, sentAt: now(), author: "contact", status: "delivered", sentiment };
          set((s) => ({
            messages: [...s.messages, msg],
            conversations: s.conversations.map((c) =>
              c.id === conversationId ? { ...c, lastMessageAt: msg.sentAt, unread: c.unread + 1, status: sentiment === "negative" ? "closed" : "needs_human" } : c,
            ),
          }));
          if (!conv.leadId) return;
          const leadId = conv.leadId;
          const lead = get().leads.find((l) => l.id === leadId);
          // Stop rule: reply → stop follow-ups
          set((s) => ({
            outreach: s.outreach.map((c) => ({
              ...c,
              recipients: c.recipients.map((r) => (r.leadId === leadId && !["replied", "stopped"].includes(r.state) ? { ...r, state: "replied", stopReason: "Lead replied" } : r)),
            })),
            leads: s.leads.map((l) => (l.id === leadId ? { ...l, nextFollowUpAt: undefined } : l)),
          }));
          if (isOptOut(body)) {
            get().optOutLead(leadId, /not interested/i.test(body) ? "Not interested" : "Opt-out request");
            get().setLeadStatus(leadId, "Lost", "ai");
          } else if (lead && ["New", "Researching", "Qualified", "Contacted"].includes(lead.status)) {
            get().setLeadStatus(leadId, "Replied", "ai");
          }
          log({ actor: "system", entity: "outreach", entityId: conversationId, action: `Reply received (${sentiment})`, detail: `${lead?.company} — follow-ups stopped` });
          if (sentiment !== "negative") {
            notify({ title: `${sentiment === "positive" ? "Positive reply" : "Reply"} from ${lead?.company}`, body: "Human attention needed — take over the conversation.", href: `/inbox?c=${conversationId}`, kind: "ai" });
          }
        },
        takeOverConversation: (id) => {
          set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, handledBy: "human", ownerId: me(), status: c.status === "needs_human" ? "open" : c.status } : c)) }));
          log({ actor: "human", actorId: me(), entity: "outreach", entityId: id, action: "Took over conversation from AI" });
        },
        handBackToAI: (id) => {
          set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, handledBy: "ai" } : c)) }));
          log({ actor: "human", actorId: me(), entity: "outreach", entityId: id, action: "Handed conversation back to AI" });
        },
        updateConversation: (id, patch) => set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
        markConversationRead: (id) => set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, unread: 0 } : c)) })),

        // ---------------- Outreach ----------------
        createOutreach: (name, leadIds, channel, sequenceId = "seq_default") => {
          const leads = get().leads;
          const recipients = leadIds
            .map((id) => leads.find((l) => l.id === id))
            .filter((l): l is Lead => !!l)
            .map((l) => ({ leadId: l.id, state: isSuppressed(l) ? ("stopped" as const) : ("queued" as const), stepIndex: 0, stopReason: isSuppressed(l) ? "Suppressed / opted out" : undefined }));
          const id = uid("oc");
          set((s) => ({ outreach: [{ id, name, sequenceId, createdAt: now(), ownerId: me(), status: "Draft", recipients, channel }, ...s.outreach] }));
          log({ actor: "human", actorId: me(), entity: "outreach", entityId: id, action: "Created outreach campaign", detail: `${name} · ${recipients.length} leads` });
          return id;
        },
        generateDrafts: async (campaignId) => {
          const camp = get().outreach.find((c) => c.id === campaignId);
          if (!camp) return;
          const queued = camp.recipients.filter((r) => r.state === "queued").map((r) => r.leadId);
          // Research any un-researched leads first (batched to keep the UI responsive).
          set((s) => ({ outreach: s.outreach.map((c) => (c.id === campaignId ? { ...c, status: "Review", recipients: c.recipients.map((r) => (r.state === "queued" ? { ...r, state: "researching" } : r)) } : c)) }));
          await new Promise((r) => setTimeout(r, 600));
          const criteria = get().settings.scoringCriteria;
          const queuedSet = new Set(queued);
          set((s) => {
            const leads = s.leads.map((l) => {
              if (!queuedSet.has(l.id) || l.research?.status === "done") return l;
              const next = { ...l, research: runLocalResearch(l) };
              next.score = scoreLead(next, criteria);
              return next;
            });
            const byId = new Map(leads.map((l) => [l.id, l]));
            return {
              leads,
              outreach: s.outreach.map((c) =>
                c.id !== campaignId
                  ? c
                  : {
                      ...c,
                      recipients: c.recipients.map((r) => {
                        if (r.state !== "researching") return r;
                        const lead = byId.get(r.leadId)!;
                        const d = personalizeFirstMessage(lead, c.channel);
                        return { ...r, state: "drafted", draft: d.body, angle: d.angle, service: d.service };
                      }),
                    },
              ),
            };
          });
          log({ actor: "ai", entity: "outreach", entityId: campaignId, action: "Researched leads & drafted messages", detail: `${queued.length} personalized drafts ready for review` });
          if (mode("Outreach") === "Automatic") {
            get().approveDrafts(campaignId, queued);
            get().launchOutreach(campaignId);
          } else {
            notify({ title: `${queued.length} drafts ready for review`, body: camp.name, href: `/outreach?c=${campaignId}`, kind: "ai" });
          }
        },
        updateDraft: (campaignId, leadId, draft) =>
          set((s) => ({ outreach: s.outreach.map((c) => (c.id === campaignId ? { ...c, recipients: c.recipients.map((r) => (r.leadId === leadId ? { ...r, draft } : r)) } : c)) })),
        approveDrafts: (campaignId, leadIds) => {
          const ids = new Set(leadIds);
          set((s) => ({
            outreach: s.outreach.map((c) => (c.id === campaignId ? { ...c, recipients: c.recipients.map((r) => (ids.has(r.leadId) && r.state === "drafted" ? { ...r, state: "approved" } : r)) } : c)),
          }));
          log({ actor: "human", actorId: me(), entity: "outreach", entityId: campaignId, action: "Approved drafts", detail: `${leadIds.length} message(s)` });
        },
        launchOutreach: (campaignId) => {
          const camp = get().outreach.find((c) => c.id === campaignId);
          if (!camp) return;
          const approved = camp.recipients.filter((r) => r.state === "approved");
          const ts = now();
          const seq = get().settings.sequences.find((s) => s.id === camp.sequenceId) ?? DEFAULT_SEQUENCE;
          const nextOffset = seq.steps[1]?.dayOffset ?? 3;
          const leadsById = new Map(get().leads.map((l) => [l.id, l]));
          const newConvs: SeedData["conversations"] = [];
          const newMsgs: Message[] = [];
          approved.forEach((r) => {
            const lead = leadsById.get(r.leadId);
            if (!lead) return;
            const cid = uid("cv");
            newConvs.push({ id: cid, leadId: lead.id, channel: camp.channel, ownerId: lead.ownerId, campaignId, status: "waiting", handledBy: "ai", unread: 0, lastMessageAt: ts, subject: camp.channel === "Email" ? `Quick idea for ${lead.company}` : undefined });
            newMsgs.push({ id: uid("msg"), conversationId: cid, direction: "outbound", channel: camp.channel, body: r.draft ?? "", sentAt: ts, author: "ai", status: "sent" });
          });
          const approvedIds = new Set(approved.map((r) => r.leadId));
          set((s) => ({
            conversations: [...newConvs, ...s.conversations],
            messages: [...s.messages, ...newMsgs],
            leads: s.leads.map((l) =>
              approvedIds.has(l.id)
                ? { ...l, status: ["New", "Researching", "Qualified"].includes(l.status) ? "Contacted" : l.status, lastContactedAt: ts, nextFollowUpAt: new Date(Date.now() + nextOffset * DAY).toISOString() }
                : l,
            ),
            outreach: s.outreach.map((c) =>
              c.id === campaignId ? { ...c, status: "Running", recipients: c.recipients.map((r) => (r.state === "approved" ? { ...r, state: "sent", stepIndex: 1, lastSentAt: ts } : r)) } : c,
            ),
          }));
          log({ actor: "ai", entity: "outreach", entityId: campaignId, action: "Sent first messages", detail: `${approved.length} via ${camp.channel} · follow-ups scheduled` });
        },
        setOutreachStatus: (campaignId, status) => {
          set((s) => ({ outreach: s.outreach.map((c) => (c.id === campaignId ? { ...c, status } : c)) }));
          log({ actor: "human", actorId: me(), entity: "outreach", entityId: campaignId, action: `Outreach ${status}` });
        },
        runFollowUps: () => {
          // Processes every running sequence: sends the next step to recipients who haven't replied.
          let sent = 0;
          const leadsById = new Map(get().leads.map((l) => [l.id, l]));
          const needsApproval = mode("Follow-ups") !== "Automatic";
          const newMsgs: Message[] = [];
          const outreach = get().outreach.map((c) => {
            if (c.status !== "Running") return c;
            const seq = get().settings.sequences.find((s) => s.id === c.sequenceId) ?? DEFAULT_SEQUENCE;
            return {
              ...c,
              recipients: c.recipients.map((r) => {
                if (r.state !== "sent") return r;
                const lead = leadsById.get(r.leadId);
                if (!lead || isSuppressed(lead)) return { ...r, state: "stopped" as const, stopReason: "Suppressed / opted out" };
                const step = seq.steps[r.stepIndex];
                if (!step) return { ...r, state: "stopped" as const, stopReason: "Sequence completed" };
                if (needsApproval) return r;
                const conv = get().conversations.find((cv) => cv.leadId === lead.id && cv.campaignId === c.id) ?? get().conversations.find((cv) => cv.leadId === lead.id);
                if (conv) {
                  newMsgs.push({ id: uid("msg"), conversationId: conv.id, direction: "outbound", channel: step.channel, body: renderStep(step.template, lead, r.service ?? "Meta Ads", r.angle ?? ""), sentAt: now(), author: "ai", status: "sent" });
                }
                sent++;
                return { ...r, stepIndex: r.stepIndex + 1, lastSentAt: now() };
              }),
            };
          });
          if (needsApproval) {
            const due = get().outreach.flatMap((c) => (c.status === "Running" ? c.recipients.filter((r) => r.state === "sent") : [])).length;
            if (due) get().requestApproval({ kind: "Follow-ups", title: `Send ${due} scheduled follow-ups`, detail: "Follow-ups are set to require approval." });
            return 0;
          }
          set((s) => ({ outreach, messages: [...s.messages, ...newMsgs] }));
          if (sent) log({ actor: "ai", entity: "outreach", action: "Sent follow-ups", detail: `${sent} follow-up(s) across running sequences` });
          return sent;
        },

        // ---------------- Automations ----------------
        addAutomation: (a) => {
          const id = uid("auto");
          set((s) => ({ automations: [{ ...a, id, runs: 0 }, ...s.automations] }));
          log({ actor: "human", actorId: me(), entity: "automation", entityId: id, action: "Created automation", detail: a.name });
        },
        updateAutomation: (id, patch) => set((s) => ({ automations: s.automations.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
        deleteAutomation: (id) => set((s) => ({ automations: s.automations.filter((a) => a.id !== id) })),

        // ---------------- Settings ----------------
        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
        setApprovalMode: (k, m) => {
          set((s) => ({ settings: { ...s.settings, approvalModes: { ...s.settings.approvalModes, [k]: m } } }));
          log({ actor: "human", actorId: me(), entity: "settings", action: "Changed approval mode", detail: `${k} → ${m}` });
        },
        setIntegrationStatus: (key, status) => {
          set((s) => ({ integrations: s.integrations.map((i) => (i.key === key ? { ...i, status, connectedAt: status === "connected" ? now() : undefined } : i)) }));
          log({ actor: "human", actorId: me(), entity: "settings", action: status === "connected" ? "Connected integration" : "Disconnected integration", detail: key });
        },
        addSuppression: (value, reason) => set((s) => ({ settings: { ...s.settings, suppressions: [{ value, reason, addedAt: now() }, ...s.settings.suppressions] } })),
        removeSuppression: (value) => set((s) => ({ settings: { ...s.settings, suppressions: s.settings.suppressions.filter((x) => x.value !== value) } })),
        upsertSequence: (seq) =>
          set((s) => ({
            settings: { ...s.settings, sequences: s.settings.sequences.some((x) => x.id === seq.id) ? s.settings.sequences.map((x) => (x.id === seq.id ? seq : x)) : [...s.settings.sequences, seq] },
          })),

        // ---------------- Approvals ----------------
        requestApproval: (r) => {
          set((s) => ({ approvals: [{ requestedBy: me(), ...r, id: uid("ap"), createdAt: now(), status: "pending" }, ...s.approvals] }));
          notify({ title: "Approval requested", body: r.title, href: "/automations?tab=approvals", kind: "warning", category: r.kind.startsWith("Campaign") ? "AI recommendations" : r.kind === "Creative generation" ? "Client approvals" : undefined });
        },
        resolveApproval: (id, approve) => {
          const ap = get().approvals.find((a) => a.id === id);
          if (!ap) return;
          set((s) => ({ approvals: s.approvals.map((a) => (a.id === id ? { ...a, status: approve ? "approved" : "rejected", resolvedBy: me(), resolvedAt: now() } : a)) }));
          log({ actor: "human", actorId: me(), entity: "automation", entityId: id, action: approve ? "Approved AI action" : "Rejected AI action", detail: ap.title });
          // Linked recommendation follows the approval decision.
          if (ap.ref?.type === "recommendation") {
            set((s) => ({ recommendations: s.recommendations.map((r) => (r.id === ap.ref!.id ? { ...r, status: approve ? "Executed" : "Dismissed", resolvedAt: now(), resolvedBy: me() } : r)) }));
          }
          if (!approve) return;
          if (ap.apply) {
            const { collection, id: targetId, patch } = ap.apply;
            const before = (get()[collection] as { id: string }[]).find((x) => x.id === targetId) as Record<string, unknown> | undefined;
            set((s) => ({ [collection]: (s[collection] as { id: string }[]).map((x) => (x.id === targetId ? { ...x, ...patch } : x)) }) as Partial<CRMState>);
            const field = Object.keys(patch)[0];
            log({ actor: "ai", agent: ap.agent, entity: "automation", entityId: targetId, action: `Executed after approval: ${ap.title}`, detail: collection, before: field ? short(before?.[field]) : undefined, after: field ? short(patch[field]) : undefined });
          }
          if (ap.kind === "Payment reminders" && ap.ref?.type === "invoice") {
            set((s) => ({ invoices: s.invoices.map((i) => (i.id === ap.ref!.id ? { ...i, remindersSent: i.remindersSent + 1 } : i)) }));
          }
          if (ap.kind === "Campaign changes" && ap.ref?.type === "campaign" && ap.payload) {
            const { budget } = ap.payload;
            const c = get().campaigns.find((x) => x.id === ap.ref!.id);
            if (typeof budget === "number" && c) {
              set((s) => ({ campaigns: s.campaigns.map((x) => (x.id === ap.ref!.id ? { ...x, budget } : x)) }));
              log({ actor: "ai", agent: "media", entity: "campaign", entityId: c.id, action: "Budget changed after approval", detail: c.name, before: money(c.budget), after: money(budget) });
            }
          }
          if (ap.kind === "Follow-ups") {
            const prev = get().settings.approvalModes["Follow-ups"];
            set((s) => ({ settings: { ...s.settings, approvalModes: { ...s.settings.approvalModes, "Follow-ups": "Automatic" } } }));
            get().runFollowUps();
            set((s) => ({ settings: { ...s.settings, approvalModes: { ...s.settings.approvalModes, "Follow-ups": prev } } }));
          }
        },

        // ---------------- Reports ----------------
        generateReport: (clientId, format, period) => {
          set((s) => ({
            reports: [{ id: uid("rep"), clientId, period, format, createdAt: now(), sent: mode("Reports") === "Automatic" }, ...s.reports],
            clients: s.clients.map((c) => (c.id === clientId ? { ...c, lastReportAt: now() } : c)),
          }));
          const c = get().clients.find((x) => x.id === clientId);
          log({ actor: "ai", entity: "client", entityId: clientId, action: `Generated ${format} report`, detail: `${c?.company} · ${period}` });
        },
        upsertSchedule: (sch) =>
          set((s) => ({ reportSchedules: s.reportSchedules.some((x) => x.id === sch.id) ? s.reportSchedules.map((x) => (x.id === sch.id ? sch : x)) : [...s.reportSchedules, sch] })),

        // ---------------- Generic collection helpers ----------------
        upsert: (k, item) =>
          set((s) => {
            const list = s[k] as { id: string }[];
            const it = item as { id: string };
            return { [k]: list.some((x) => x.id === it.id) ? list.map((x) => (x.id === it.id ? it : x)) : [it, ...list] } as Partial<CRMState>;
          }),
        patch: (k, id, p, audit) => {
          const before = (get()[k] as { id: string }[]).find((x) => x.id === id) as Record<string, unknown> | undefined;
          set((s) => ({ [k]: (s[k] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...p } : x)) }) as Partial<CRMState>);
          if (audit) {
            const f = audit.field ?? Object.keys(p)[0];
            log({ actor: "human", actorId: me(), entity: audit.entity, entityId: id, action: audit.action, before: f ? short(before?.[f]) : undefined, after: f ? short((p as Record<string, unknown>)[f]) : undefined });
          }
        },
        remove: (k, id) => set((s) => ({ [k]: (s[k] as { id: string }[]).filter((x) => x.id !== id) }) as Partial<CRMState>),

        // ---------------- AI metering ----------------
        consumeUsage: (key, n = 1) => {
          const org = get().organization;
          const limit = org.limits[key];
          if (limit !== -1 && org.usage[key] + n > limit) {
            notify({ title: "Plan limit reached", body: `Your ${org.plan} plan allows ${limit} ${key}. Upgrade in Settings → Plan & usage.`, href: "/settings?tab=plan", kind: "warning" });
            return false;
          }
          set((s) => ({ organization: { ...s.organization, usage: { ...s.organization.usage, [key]: s.organization.usage[key] + n } } }));
          return true;
        },
        startAITask: (t) => {
          const credits = get().settings.aiCreditCost[t.agent] ?? 2;
          if (!get().consumeUsage("aiCredits", credits)) return null;
          const id = uid("ait");
          set((s) => ({ aiTasks: [{ ...t, id, status: "running" as const, credits, createdAt: now(), requestedBy: me() }, ...s.aiTasks].slice(0, 300) }));
          return id;
        },
        finishAITask: (id, output, status = "done") => {
          const t = get().aiTasks.find((x) => x.id === id);
          set((s) => ({ aiTasks: s.aiTasks.map((x) => (x.id === id ? { ...x, output: output.slice(0, 2000), status, completedAt: now() } : x)) }));
          if (t) log({ actor: "ai", agent: t.agent, entity: t.ref?.type === "client" ? "client" : "automation", entityId: t.ref?.id ?? id, action: t.title, detail: `${t.credits} AI credits` });
        },

        // ---------------- Recommendations ----------------
        addRecommendations: (rs) => {
          const existing = new Set(get().recommendations.filter((r) => r.status === "New").map((r) => `${r.agent}|${r.adId ?? r.campaignId ?? r.clientId}|${r.category}`));
          const fresh = rs.filter((r) => !existing.has(`${r.agent}|${r.adId ?? r.campaignId ?? r.clientId}|${r.category}`));
          if (!fresh.length) return;
          set((s) => ({ recommendations: [...fresh, ...s.recommendations].slice(0, 400) }));
          const high = fresh.filter((r) => r.priority === "High").length;
          if (high) notify({ title: `${high} high-priority AI recommendation${high > 1 ? "s" : ""}`, body: fresh[0]!.title, href: "/performance", kind: "ai", category: "AI recommendations" });
        },
        actOnRecommendation: (id, decision) => {
          const r = get().recommendations.find((x) => x.id === id);
          if (!r || r.status === "Executed" || r.status === "Dismissed") return;
          const resolve = (status: Recommendation["status"]) => set((s) => ({ recommendations: s.recommendations.map((x) => (x.id === id ? { ...x, status, resolvedAt: now(), resolvedBy: me() } : x)) }));
          if (decision === "dismiss") {
            resolve("Dismissed");
            log({ actor: "human", actorId: me(), entity: "recommendation", entityId: id, action: "Dismissed AI recommendation", detail: r.title });
            return;
          }
          const type = r.action?.type ?? "none";
          // Spend-affecting changes use the "Campaign changes" mode and can only be Automatic with the admin safety switch.
          const spend = type === "budget_change" || type === "pause_ad";
          let m = mode(spend ? "Campaign changes" : "Campaign recommendations");
          if (spend && m === "Automatic" && !get().settings.allowAutonomousSpendChanges) m = "Approval Required";
          const execute = () => {
            if (type === "budget_change" && r.campaignId && r.action?.value) {
              const c = get().campaigns.find((x) => x.id === r.campaignId);
              if (c) {
                set((s) => ({ campaigns: s.campaigns.map((x) => (x.id === c.id ? { ...x, budget: r.action!.value! } : x)) }));
                log({ actor: "ai", agent: r.agent, entity: "campaign", entityId: c.id, action: "Budget changed (AI recommendation)", detail: c.name, before: money(c.budget), after: money(r.action.value) });
              }
            }
            if (type === "pause_ad" && r.adId) {
              set((s) => ({ ads: s.ads.map((a) => (a.id === r.adId ? { ...a, status: "Paused" } : a)) }));
              log({ actor: "ai", agent: r.agent, entity: "campaign", entityId: r.campaignId, action: "Paused ad (AI recommendation)", detail: r.title, before: "Active", after: "Paused" });
            }
            if (type === "create_task" || type === "refresh_creative" || type === "none") {
              const client = get().clients.find((c) => c.id === r.clientId);
              get().addTask({ title: r.action?.label ?? r.recommendation.slice(0, 90), description: `${r.finding}\n\nRecommendation: ${r.recommendation}`, assigneeId: client?.accountManagerId ?? me(), priority: r.priority === "High" ? "High" : "Medium", dueDate: new Date(Date.now() + 2 * DAY).toISOString(), status: "Todo", related: r.campaignId ? { type: "campaign", id: r.campaignId } : r.clientId ? { type: "client", id: r.clientId } : undefined, createdBy: "ai" });
            }
            resolve("Executed");
          };
          if (m === "Manual") {
            // Manual: AI recommends, a human executes — we hand over a task instead of acting.
            const client = get().clients.find((c) => c.id === r.clientId);
            get().addTask({ title: `Execute: ${r.title}`, description: r.recommendation, assigneeId: client?.accountManagerId ?? me(), priority: r.priority === "High" ? "High" : "Medium", dueDate: new Date(Date.now() + DAY).toISOString(), status: "Todo", related: r.campaignId ? { type: "campaign", id: r.campaignId } : undefined, createdBy: "ai" });
            resolve("Approved");
            log({ actor: "human", actorId: me(), entity: "recommendation", entityId: id, action: "Accepted recommendation (manual execution)", detail: r.title });
            return;
          }
          if (m === "Approval Required" && spend) {
            get().requestApproval({ kind: "Campaign changes", title: r.title, detail: r.recommendation, ref: { type: "recommendation", id }, agent: r.agent, ...(type === "budget_change" && r.campaignId && r.action?.value ? { apply: { collection: "campaigns", id: r.campaignId, patch: { budget: r.action.value } } } : {}), ...(type === "pause_ad" && r.adId ? { apply: { collection: "ads", id: r.adId, patch: { status: "Paused" } } } : {}) });
            resolve("Awaiting Approval");
            return;
          }
          log({ actor: "human", actorId: me(), entity: "recommendation", entityId: id, action: "Approved AI recommendation", detail: r.title });
          execute();
        },

        // ---------------- Creative approvals ----------------
        setCreativeStatus: (id, status, comment) => {
          const c = get().creatives.find((x) => x.id === id);
          if (!c) return;
          const who = get().team.find((t) => t.id === me());
          const comments = comment ? [...c.comments, { id: uid("cc"), authorId: me(), body: comment, at: now(), version: c.versions.length }] : c.comments;
          set((s) => ({ creatives: s.creatives.map((x) => (x.id === id ? { ...x, status, comments, updatedAt: now() } : x)) }));
          log({ actor: "human", actorId: me(), entity: "creative", entityId: id, action: `Creative ${status}`, detail: c.title, before: c.status, after: status });
          if (who?.role === "client" || status === "Client Review") {
            notify({ title: status === "Client Review" ? `Creative sent to client: ${c.title}` : `Client ${status === "Approved" ? "approved" : "requested changes on"} ${c.title}`, body: comment ?? "", href: `/creative?c=${id}`, kind: status === "Changes Requested" ? "warning" : "success", category: "Client approvals" });
          }
        },
        addCreativeComment: (id, body, internal) =>
          set((s) => ({ creatives: s.creatives.map((x) => (x.id === id ? { ...x, comments: [...x.comments, { id: uid("cc"), authorId: me(), body, at: now(), version: x.versions.length, internal }], updatedAt: now() } : x)) })),
        addCreativeVersion: (id, v) => {
          set((s) => ({ creatives: s.creatives.map((x) => (x.id === id ? { ...x, versions: [...x.versions, { ...v, v: x.versions.length + 1, createdAt: now(), createdBy: me() }], status: x.status === "Changes Requested" ? "Internal Review" : x.status, updatedAt: now() } : x)) }));
          log({ actor: "human", actorId: me(), entity: "creative", entityId: id, action: "Uploaded new version", detail: v.note });
        },

        // ---------------- Organization ----------------
        updateOrganization: (p) => {
          const org = get().organization;
          set((s) => ({ organization: { ...s.organization, ...p } }));
          if (p.plan && p.plan !== org.plan) log({ actor: "human", actorId: me(), entity: "organization", action: "Changed plan", before: org.plan, after: p.plan });
        },
        setPermissionOverride: (role, m, a) => {
          const cur = get().settings.permissionOverrides;
          const forRole = { ...(cur[role] ?? {}) };
          if (a === undefined) delete forRole[m];
          else forRole[m] = a;
          set((s) => ({ settings: { ...s.settings, permissionOverrides: { ...cur, [role]: forRole } } }));
          log({ actor: "human", actorId: me(), entity: "settings", action: "Changed permission", detail: `${role} · ${m}`, after: a ?? "default" });
        },
      };
    },
    {
      name: "adbibe-os-v3",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => {
        // Functions are not serializable; persist data only.
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(s)) if (typeof v !== "function" && k !== "aiEnabled") out[k] = v;
        return out as Partial<CRMState>;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CRMState>;
        return {
          ...current,
          ...p,
          settings: {
            ...current.settings,
            ...(p.settings ?? {}),
            approvalModes: { ...current.settings.approvalModes, ...(p.settings?.approvalModes ?? {}) },
            notificationPrefs: { ...current.settings.notificationPrefs, ...(p.settings?.notificationPrefs ?? {}) },
          },
        };
      },
    },
  ),
);

// ---------- Selectors / helpers ----------
export const useMe = () => {
  const id = useCRM((s) => s.currentUserId);
  const team = useCRM((s) => s.team);
  return team.find((t) => t.id === id) ?? team[0]!;
};

export const useMember = (id?: string) => useCRM((s) => s.team.find((t) => t.id === id));

export { AI_ACTIONS };
