// Core domain model for the Adbibe CRM.
// Every entity has a stable string id and ISO timestamps so the store can be
// swapped for a real database (Postgres + Drizzle/Prisma) without UI changes.

import type { AgentReportContent } from "./ai/reporting";

export type ID = string;

export type Role =
  | "admin"
  | "sales"
  | "account_manager"
  | "marketing" // Performance Marketer
  | "creative_strategist"
  | "video_editor"
  | "designer"
  | "seo"
  | "social_media"
  | "influencer_manager"
  | "finance"
  | "ai_automation"
  | "client";

export interface TeamMember {
  staffAuthId?: ID;
  id: ID;
  name: string;
  email: string;
  role: Role;
  avatarColor: string;
  clientId?: ID; // only for role === "client"
  title?: string;
  capacityHours?: number; // weekly capacity for workload planning
  monthlyCost?: number; // loaded cost, used for client/project profitability
  freelancer?: boolean;
  status?: "active" | "invited" | "disabled";
}

export const LEAD_STATUSES = [
  "New",
  "Researching",
  "Qualified",
  "Contacted",
  "Replied",
  "Meeting",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const SERVICES = [
  "Meta Ads",
  "Google Ads",
  "LinkedIn Ads",
  "Programmatic",
  "Retail Media",
  "Quick Commerce",
  "SEO",
  "AI Search Visibility (GEO / AEO)",
  "Social Media",
  "Influencer Marketing",
  "AI Automation",
  "Video Production",
  "Brand Strategy",
  "Consulting",
] as const;
export type Service = (typeof SERVICES)[number];

export const LEAD_SOURCES = ["LinkedIn", "Website", "Referral", "Instagram", "Cold List", "Event", "Google Ads", "Partner"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const CHANNELS = ["Email", "LinkedIn", "WhatsApp", "Instagram", "Phone"] as const;
export type Channel = (typeof CHANNELS)[number];

export type CompanySize = "Unknown" | "1-10" | "11-50" | "51-200" | "201-1000" | "1000+";

export interface ScoreFactor {
  key: string;
  label: string;
  points: number; // contribution to score
  max: number;
  reason: string;
}

export interface LeadScore {
  value: number; // 0..100
  factors: ScoreFactor[];
  override?: number;
  overrideReason?: string;
  scoredAt: string;
}

export interface ResearchFinding {
  text: string;
  kind: "verified" | "assumption" | "recommendation" | "record" | "unavailable";
  source?: string;
  evidenceQuote?: string;
}

export interface LeadResearch {
  status: "idle" | "running" | "done" | "failed";
  generatedAt?: string;
  summary?: string;
  sections: {
    key: string;
    title: string;
    findings: ResearchFinding[];
  }[];
  recommendedServices: Service[];
  outreachAngle?: string;
  mode?: "public_ai" | "public_evidence" | "crm_only";
  model?: string;
  startedAt?: string;
  error?: string;
  sources?: { id:string;url:string;title:string;status:"ok"|"unavailable";checkedAt:string;reason?:string }[];
  coverage?: {topic:string;label:string;status:"evidence"|"inference"|"unavailable"}[];
  limitations?: string[];
}

export interface Lead {
  id: ID;
  name: string;
  company: string;
  jobTitle: string;
  email: string;
  phone: string;
  linkedin?: string;
  instagram?: string;
  website?: string;
  location: string;
  industry: string;
  companySize: CompanySize;
  source: LeadSource;
  createdAt: string;
  ownerId: ID;
  status: LeadStatus;
  score?: LeadScore;
  services: Service[];
  notes: string;
  communicationHistory?: string; // imported or manually recorded communication context
  tags: string[];
  research?: LeadResearch;
  optedOut?: boolean;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  dealValue?: number; // expected deal size (₹)
  customFields?: Record<string, string>;
}

export type MessageDirection = "outbound" | "inbound";
export interface Message {
  id: ID;
  conversationId: ID;
  direction: MessageDirection;
  channel: Channel;
  body: string;
  sentAt: string;
  author: "ai" | "human" | "contact";
  authorId?: ID;
  status: "draft" | "pending_approval" | "scheduled" | "sent" | "delivered" | "opened" | "failed";
  sentiment?: "positive" | "neutral" | "negative";
}

export interface Conversation {
  id: ID;
  leadId?: ID;
  clientId?: ID;
  channel: Channel;
  ownerId: ID;
  campaignId?: ID; // outreach campaign
  status: "open" | "waiting" | "needs_human" | "closed";
  handledBy: "ai" | "human";
  unread: number;
  lastMessageAt: string;
  subject?: string;
}

export const DEAL_STAGES = LEAD_STATUSES;
export type DealStage = (typeof DEAL_STAGES)[number];

export type PaymentStatus = "Pending" | "Partially Paid" | "Paid" | "Overdue";

export interface Activity {
  clientId?: ID;
  sources?: string[];
  approvedBy?: ID;
  approvedAt?: string;
  outcome?: string;
  origin?: "server";
  id: ID;
  at: string;
  actor: "ai" | "human" | "system" | "api";
  actorId?: ID;
  agent?: AgentId; // which AI agent acted, when actor === "ai"
  entity:
    | "lead" | "deal" | "client" | "campaign" | "task" | "invoice" | "proposal" | "meeting" | "automation" | "settings" | "outreach"
    | "analytics" | "report" | "strategy" | "creative" | "video" | "social" | "seo" | "document" | "influencer" | "recommendation" | "expense" | "integration" | "knowledge" | "organization";
  entityId?: ID;
  action: string;
  detail?: string;
  before?: string; // audit: value before the change
  after?: string; // audit: value after the change
}

export interface Deal {
  id: ID;
  clientRemoved?: boolean;
  title: string;
  leadId?: ID;
  clientId?: ID;
  company: string;
  value: number;
  services: Service[];
  probability: number;
  expectedClose: string;
  ownerId: ID;
  stage: DealStage;
  notes: string;
  proposalId?: ID;
  paymentStatus: PaymentStatus;
  createdAt: string;
  lostReason?: string;
}

export type MeetingOutcome = "Pending" | "Positive" | "Needs Follow-up" | "Not Interested" | "No Show";
export interface Meeting {
  id: ID;
  title: string;
  leadId?: ID;
  clientId?: ID;
  dealId?: ID;
  startsAt: string;
  durationMin: number;
  link?: string;
  ownerId: ID;
  notes: string;
  outcome: MeetingOutcome;
}

export const PROPOSAL_STATUSES = ["Draft", "Internal Review", "Sent", "Viewed", "Accepted", "Rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export interface ProposalLine {
  service: Service;
  description: string;
  price: number;
  billing: "one-time" | "monthly";
}
export interface Proposal {
  id: ID;
  dealId: ID;
  title: string;
  company: string;
  lines: ProposalLine[];
  status: ProposalStatus;
  sentAt?: string;
  expiresAt: string;
  approval: "Not Required" | "Awaiting" | "Approved";
  createdAt: string;
  // AI proposal generator inputs/outputs (optional so older proposals stay valid)
  discoveryNotes?: string;
  strategySummary?: string;
  deliverables?: string[];
  timeline?: { phase: string; weeks: string; detail: string }[];
  viewedAt?: string;
  durationMonths?: number;
  terms?: string[];
  generationSource?: string;
  clientSnapshot?: {company:string;contactName?:string;industry?:string;location?:string;website?:string};
  workflowHistory?: {status:ProposalStatus;at:string;actorId:string;source:"manual"}[];
  approvedBy?: string;
  approvedAt?: string;
}

export interface OnboardingStep {
  key: string;
  label: string;
  done: boolean;
  doneAt?: string;
}

export interface ClientContact {
  name: string;
  email: string;
  phone?: string;
  role: string;
}

export interface Client {
  socialProfiles?: { platform: string; handle: string }[];
  creativeIntelligence?: CreativeIntelligenceReport[];
  id: ID;
  company: string;
  industry: string;
  website?: string;
  location: string;
  contacts: ClientContact[];
  services: Service[];
  retainer: number; // monthly
  contractStart: string;
  contractEnd: string;
  accountManagerId: ID;
  health: "Healthy" | "At Risk" | "Churn Risk";
  fromDealId?: ID;
  onboarding: OnboardingStep[];
  createdAt: string;
  lastReportAt?: string;
  documents: { name: string; kind: string; addedAt: string; url?:string }[];
  contracts?: {id:string;title:string;status:"Draft"|"Active"|"Expired"|"Ended";startsAt?:string;endsAt?:string;value?:number;documentUrl?:string;notes?:string}[];
  reportCompanyId?: string;
  onboardingWorkspace?: ClientOnboarding;
  monthlyAdSpend?: number; // client media spend managed by Adbibe (₹/mo)
  upsellNotes?: string;
}

export interface ClientOnboarding {
 version:1; startedAt:string;updatedAt:string;
 welcome:{to:string;subject:string;body:string;status:"Draft"|"Approved"|"Sent externally";approvedAt?:string;approvedBy?:string;sentAt?:string;sentBy?:string;deliveryNote?:string};
 form:{company:string;website:string;contactName:string;contactEmail:string;contactPhone:string;goals:string;audience:string;products:string;brandVoice:string;competitors:string;marketing:string;budget:string;launchDate:string;trackingNotes:string;status:"Draft"|"Submitted";submittedAt?:string;submittedBy?:string};
 assets:{id:string;name:string;category:string;required:boolean;url:string;status:"Requested"|"Received"|"Approved";notes:string;reviewedAt?:string;reviewedBy?:string;file?:{id:string;name:string;type:string;size:number;sha256:string;uploadedAt:string}}[];
 access:{id:string;platform:string;accountId:string;requestTo:string;status:"Not requested"|"Requested"|"Granted"|"Verified"|"Not required";notes:string;verifiedAt?:string;verifiedBy?:string}[];
 assignments:{id:string;responsibility:string;memberId?:string}[];
 history:{id:string;at:string;actorId:string;action:string}[];
}

export type CampaignStatus = "Planning" | "Active" | "Paused" | "Completed";
export interface CampaignKPI {
  label: string;
  target: number;
  actual: number;
  unit?: string;
  direction?: "higher" | "lower";
  measurementRecorded?: boolean;
}
export interface DailyMetric {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  conversions: number;
  revenue: number;
}
export interface Campaign {
  creatorMatch?: import("./domain/influencerWorkspace").CreatorMatchReport;
  performanceRows?: MediaMetricRow[];
  id: ID;
  name: string;
  clientId: ID;
  service: Service;
  platform: string;
  objective: string;
  budget: number;
  startDate: string;
  endDate: string;
  teamIds: ID[];
  status: CampaignStatus;
  kpis: CampaignKPI[];
  metrics: DailyMetric[];
  influencerIds: ID[];
  campaignType?: CampaignType;
  audience?: string;
  landingPage?: string;
  tracking?: string; // e.g. "Meta Pixel + CAPI, GA4 purchase event"
  ownerId?: ID;
  creativeIds?: ID[];
  adAccountId?: string;
  dataSource?: "upload"; // metrics came from an Excel/CSV upload rather than a connected platform
  goals?: string;
  channels?: string[];
  budgetPeriod?: "Monthly" | "Total";
  trackingStatus?: "Not configured" | "Configured" | "Verified";
  trackingVerifiedAt?: string;
  trackingVerifiedBy?: ID;
  createdAt?: string;
  updatedAt?: string;
}

export const CAMPAIGN_TYPES = ["Lead Generation", "Brand Awareness", "Conversion", "Retargeting", "Ecommerce", "App Installs", "Traffic"] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

// Ad-level rows pulled from ad platforms; used by the Media agent & analytics.
export interface AdStats {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  leads: number;
}
export interface AdRow {
  id: ID;
  campaignId: ID;
  clientId: ID;
  name: string;
  platform: "Meta" | "Google" | "LinkedIn" | "Programmatic" | "Amazon" | "Blinkit";
  creativeId?: ID;
  format: "Video" | "Static" | "Carousel" | "Search" | "UGC";
  hook?: string;
  audience: string;
  placement: string;
  geography: string;
  status: "Active" | "Paused";
  // Two consecutive 7-day periods so agents can compare "this week vs last week".
  prev: AdStats;
  curr: AdStats;
  frequency: number;
}

export type TaskStatus = "Todo" | "In Progress" | "Blocked" | "Done";
export type Priority = "Low" | "Medium" | "High" | "Urgent";
export interface Task {
  id: ID;
  title: string;
  description: string;
  assigneeId: ID;
  priority: Priority;
  dueDate: string;
  status: TaskStatus;
  related?: { type: TaskRelatedType; id: ID };
  createdAt: string;
  createdBy: "ai" | "human" | "automation";
  dependsOn?: ID[];
  comments?: { id: ID; authorId: ID; body: string; at: string }[];
  attachments?: { name: string; addedAt: string; url?: string }[];
  recurring?: "none" | "daily" | "weekly" | "monthly";
  recurrenceSeries?: ID;
  recurrenceAnchor?: number;
  projectId?: ID;
  onboardingKey?: string;
}
export type TaskRelatedType = "lead" | "deal" | "client" | "campaign" | "creative" | "seo" | "influencer" | "social" | "video" | "strategy";

export interface ProjectMilestone {
  id: ID;
  title: string;
  dueDate: string;
  completedAt?: string;
}

export interface Project {
  milestones?: ProjectMilestone[];
  id: ID;
  name: string;
  clientId: ID;
  ownerId: ID;
  status: "Planning" | "Active" | "On Hold" | "Completed";
  startDate: string;
  dueDate: string;
  createdAt: string;
}

export interface InvoicePayment { id: ID; amount: number; receivedOn: string; reference?: string }

export interface Invoice {
  payments?: InvoicePayment[];
  projectId?: ID;
  retainerMonth?: string;
  id: ID;
  number: string;
  clientId: ID;
  amount: number;
  paid: number;
  issuedAt: string;
  dueDate: string;
  paidAt?: string;
  status: PaymentStatus;
  remindersSent: number;
  description: string;
}

export interface Influencer {
  crmVersion?: 2;
  updatedAt?: string;
  profileUrl?: string;
  phone?: string;
  audienceNotes?: string;
  pricingNotes?: string;
  profileData?: {followers:number|null;engagement:number|null;pricePerPost:number|null;performanceScore:number|null;source:string;sourceUrl:string;observedOn:string};
  id: ID;
  name: string;
  instagram?: string;
  youtube?: string;
  category: string;
  location: string;
  followers: number;
  engagement: number; // %
  contentTypes: string[];
  pricePerPost: number;
  availability: "Available" | "Busy" | "Unavailable";
  verification: "Verified" | "Pending" | "Unverified";
  previousProjects: string[];
  performanceScore: number; // 0..10
  notes: string;
  platform?: "Instagram" | "YouTube" | "LinkedIn" | "X" | "Moj";
  audience?: { topCity: string; ageBand: string; femalePct: number };
  email?: string;
}

export const INFLUENCER_STAGES = ["Shortlisted", "Outreach", "Negotiation", "Contracted", "Content Submitted", "Approved", "Live", "Paid"] as const;
export type InfluencerStage = (typeof INFLUENCER_STAGES)[number];
export interface InfluencerEngagement {
  crmVersion?: 2;
  negotiation?: string;
  feeKnown?: boolean;
  amountPaid?: number | null;
  paymentReference?: string;
  paymentDue?: string;
  outreachLog?: {id:string;at:string;channel:string;status:"Draft"|"Contacted"|"Replied"|"Declined";body:string}[];
  outreachDraft?: {body:string;source:string;at:string};
  contentApproval?: {url:string;at:string;by:string};
  liveUrl?: string;
  performanceSnapshot?: {start:string;end:string;source:string;views:number|null;engagements:number|null;clicks:number|null;sales:number|null;revenue:number|null};
  id: ID;
  influencerId: ID;
  campaignId: ID;
  clientId: ID;
  stage: InfluencerStage;
  agreedFee: number;
  deliverables: { label: string; due: string; done: boolean }[];
  contentUrl?: string;
  paymentStatus: "Unpaid" | "Advance Paid" | "Paid";
  results?: { views: number; engagements: number; clicks: number; sales: number };
  matchScore?: number;
  notes: string;
  updatedAt: string;
}

// ---------- Outreach ----------
export interface SequenceStep {
  id: ID;
  dayOffset: number;
  channel: Channel;
  template: string; // may contain {{first_name}}, {{company}}, {{angle}}, {{service}}
  condition: "always" | "no_reply" | "opened_no_reply";
}

export interface StopRules {
  onReply: boolean;
  onMeetingBooked: boolean;
  onOptOut: boolean;
  onNotInterested: boolean;
  onManualPause: boolean;
}

export interface Sequence {
  id: ID;
  name: string;
  steps: SequenceStep[];
  stopRules: StopRules;
  sendWindow: { startHour: number; endHour: number; weekdaysOnly: boolean };
  dailyLimit: number;
}

export interface OutreachRecipient {
  leadId: ID;
  state: "queued" | "researching" | "drafted" | "approved" | "sent" | "replied" | "stopped" | "bounced";
  stepIndex: number;
  draft?: string;
  angle?: string;
  service?: Service;
  stopReason?: string;
  lastSentAt?: string;
  variant?: "A" | "B";
  approvalToken?: string;
  approvedAt?: string;
  approvedBy?: ID;
  draftSource?: string;
  draftStartedAt?: string;
  error?: string;
  deliveryId?: string;
  nextDueAt?: string;
}

export interface OutreachCampaign {
  id: ID;
  name: string;
  sequenceId: ID;
  createdAt: string;
  ownerId: ID;
  status: "Draft" | "Review" | "Running" | "Paused" | "Completed";
  recipients: OutreachRecipient[];
  channel: Channel;
  abTest?: { variantB: { label: string; template: string } };
}

export interface OutreachTemplate { id: ID; label: string; template: string }

// ---------- Automations ----------
export type AutomationNodeType = "trigger" | "condition" | "ai_decision" | "ai_action" | "approval" | "action" | "wait";
export interface AutomationNode {
  id: ID;
  type: AutomationNodeType;
  label: string;
  config: Record<string, string | number | boolean>;
}
export interface Automation {
  id: ID;
  name: string;
  description: string;
  enabled: boolean;
  nodes: AutomationNode[];
  runs: number;
  lastRunAt?: string;
}

// ---------- Settings ----------
export type ApprovalMode = "Automatic" | "Approval Required" | "Manual";
// Manual = AI recommends, human executes · Approval Required = AI prepares, human approves · Automatic = AI executes.
export const AI_ACTIONS = [
  "Outreach",
  "Follow-ups",
  "Campaign changes", // budget / bid / status changes on ad platforms
  "Campaign recommendations",
  "Client communication",
  "Reports",
  "Payment reminders",
  "Creative generation",
  "Social publishing",
  "Video exports",
  "Strategy documents",
  "Proposals",
  "Task creation",
  "SEO changes",
  "Influencer outreach",
] as const;
export type AIActionKind = (typeof AI_ACTIONS)[number];

export interface ScoringCriterion {
  key: string;
  label: string;
  weight: number; // 0..30
  enabled: boolean;
}

export interface OnboardingTemplate {
  service: Service | "Default";
  steps: string[];
}

export interface ApprovalRequest {
  reviewUpdatedAt?: string;
  id: ID;
  kind: AIActionKind;
  title: string;
  detail: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
  ref?: { type: string; id: ID };
  payload?: Record<string, string | number>; // change to apply on approval
  // Generic patch applied to any collection on approval (keeps approvals extensible per module).
  apply?: { collection: CollectionKey; id: ID; patch: Record<string, unknown> };
  agent?: AgentId;
  requestedBy?: ID;
  resolvedBy?: ID;
  resolvedAt?: string;
}

export interface Integration {
  key: string;
  name: string;
  category: IntegrationCategory;
  status: "connected" | "available" | "error";
  auth: "OAuth 2.0" | "API Key" | "Webhook";
  connectedAt?: string;
  scopes: string[];
  description?: string;
  capabilities?: ("read" | "write" | "webhooks" | "publish" | "sync")[];
  lastSyncAt?: string;
  accounts?: string[]; // connected ad accounts / properties
  phase?: 1 | 2 | 3 | 4;
}
export const INTEGRATION_CATEGORIES = ["Ads", "Analytics", "Messaging", "Social", "Productivity", "Ecommerce", "Commerce Media", "Influencer", "CRM", "Payments", "Storage", "AI"] as const;
export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

export interface ReportSchedule {
  id: ID;
  clientId: ID;
  frequency: "Weekly" | "Monthly";
  format: "Dashboard" | "PDF" | "Excel" | "Presentation";
  recipients: string[];
  nextRunAt: string;
  enabled: boolean;
}

export interface GeneratedReport {
  id: ID;
  clientId: ID;
  period: string;
  format: ReportSchedule["format"];
  createdAt: string;
  sent: boolean;
  // Reports written by the Reporting agent carry their content and an approval status.
  status?: "Draft" | "Awaiting approval" | "Approved" | "Rejected";
  content?: AgentReportContent;
}

export interface Notification {
  id: ID;
  at: string;
  title: string;
  body: string;
  href?: string;
  read: boolean;
  kind: "info" | "warning" | "success" | "ai";
  category?: NotificationCategory;
}
export const NOTIFICATION_CATEGORIES = ["New leads", "Replies", "Meetings", "Deals", "Client approvals", "Campaign issues", "Performance anomalies", "Tasks", "Reports", "Payments", "AI recommendations"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationPrefs = Record<NotificationCategory, { inApp: boolean; email: boolean; slack: boolean }>;

export interface Suppression {
  value: string; // email / phone / domain
  reason: string;
  addedAt: string;
}

// =====================================================================
// Agency Operating System — entities added on top of the core CRM.
// =====================================================================

// ---------- AI agents ----------
// Specialised agents (not one giant agent). Each shares controlled access to the client knowledge base.
export const AGENT_IDS = ["sales", "strategy", "media", "creative", "video", "social", "seo", "analytics", "reporting", "client_success", "finance", "automation"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

// Every AI output line is tagged so users can tell data from inference.
export type InsightKind = "data" | "assumption" | "recommendation";
export interface InsightItem {
  text: string;
  kind: InsightKind;
  source?: string; // e.g. "Meta Ads · last 7 days", "Client knowledge base"
}

export interface AITask {
  id: ID;
  agent: AgentId;
  title: string;
  input: string;
  status: "queued" | "running" | "done" | "failed" | "awaiting_approval";
  output?: string;
  clientId?: ID;
  credits: number;
  createdAt: string;
  completedAt?: string;
  requestedBy?: ID;
  ref?: { type: string; id: ID };
}

// ---------- AI recommendations / insights ----------
// Finding → Evidence → Recommendation → Priority, then Recommendation → Human approval → Execution.
export type RecommendationCategory =
  | "Winner" | "Loser" | "Fatigue" | "Scaling" | "Budget" | "Audience" | "Creative" | "Funnel" | "Landing Page"
  | "Upsell" | "Retention" | "SEO" | "Social" | "Finance" | "Anomaly";
export interface Recommendation {
  mediaPlan?: {signature:string;fingerprint:string;campaignId:string;rangeStart:string;rangeEnd:string;action:"budget_change"|"create_task";budget?:number;source:string};
  mediaApprovedAt?: string;
  mediaApprovedBy?: ID;
  mediaExecution?: {at:string;actorId:ID;kind:"internal_budget"|"task";taskId?:string;note:string};
  id: ID;
  agent: AgentId;
  clientId?: ID;
  campaignId?: ID;
  adId?: ID;
  title: string;
  category: RecommendationCategory;
  finding: string; // What happened
  why?: string; // Why it happened (AI reasoning — assumption unless evidenced)
  evidence: { label: string; value: string; source: string }[];
  assumptions?: string[];
  recommendation: string; // What we should do
  test?: string; // What we should test
  priority: "High" | "Medium" | "Low";
  impact?: string; // estimated impact (always an estimate)
  status: "New" | "Awaiting Approval" | "Approved" | "Executed" | "Dismissed";
  action?: { type: "budget_change" | "pause_ad" | "create_task" | "refresh_creative" | "none"; value?: number; label?: string };
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: ID;
}
export interface MediaMetricRow {
 id:string;date:string;platform:string;adId?:string;adName?:string;source:"CSV import"|"Platform sync";importedAt:string;
 spend:number|null;impressions:number|null;reach:number|null;clicks:number|null;leads:number|null;conversions:number|null;revenue:number|null;frequency?:number|null;
}

// ---------- Marketing strategy ----------
export interface StrategyInputs {
  business: string;
  product: string;
  audience: string;
  geography: string;
  goals: string;
  monthlyBudget: number;
  currentPerformance: string;
  competitors: string;
  channels: string;
}
export interface StrategyPersona {
  name: string;
  profile: string;
  pains: string[];
  motivations: string[];
  channels: string[];
}
export interface StrategySection {
  key: string; // strategy | funnel | channels | campaigns | creative | pillars | testing | kpis
  title: string;
  items: InsightItem[];
}
export interface StrategyDoc {
  id: ID;
  clientId?: ID;
  leadId?: ID;
  title: string;
  status: "Draft" | "In Review" | "Approved";
  inputs: StrategyInputs;
  summary: string;
  sections: StrategySection[];
  personas: StrategyPersona[];
  funnel: { stage: "Awareness" | "Consideration" | "Conversion" | "Retention"; objective: string; channels: string[]; kpi: string }[];
  budget: { channel: string; pct: number; amount: number; rationale: string }[];
  kpis: { metric: string; target: string; stage: string }[];
  testing: { week: string; test: string; hypothesis: string }[];
  ownerId: ID;
  version: number;
  createdAt: string;
  updatedAt: string;
  approvedBy?: ID;
  approvedAt?: string;
  generationSource?: string;
  generatedAt?: string;
  generationInputs?: StrategyInputs;
  reviewHistory?: {status: "Draft" | "In Review" | "Approved"; at: string; actorId: ID; note?: string}[];
}

// ---------- Creative ----------
export const CREATIVE_STATUSES = ["Draft", "Internal Review", "Client Review", "Changes Requested", "Approved", "Live", "Archived"] as const;
export type CreativeStatus = (typeof CREATIVE_STATUSES)[number];
export type CreativeType = "Image" | "Video" | "Carousel" | "Copy" | "Ad" | "Landing Page" | "Campaign";
export interface CreativeVersion {
  storyboard?: string[];
  v: number;
  note: string;
  createdAt: string;
  createdBy: ID | "ai";
  headline?: string;
  body?: string; // copy / script / description
  cta?: string;
  fileName?: string;
  swatch?: string; // placeholder preview colour until a real file is attached
}
export interface CreativeComment {
  id: ID;
  authorId: ID;
  body: string;
  at: string;
  version: number;
  resolved?: boolean;
  internal?: boolean; // hidden from the client portal
}
export interface Creative {
  performanceLinks?: {campaignId:ID;platform:string;adId:string}[];
  fromConceptId?: ID;
  id: ID;
  clientId: ID;
  campaignId?: ID;
  title: string;
  type: CreativeType;
  platform: string;
  format: string; // e.g. "9:16 Reel", "1:1 Static"
  status: CreativeStatus;
  angle?: string;
  hook?: string;
  versions: CreativeVersion[];
  comments: CreativeComment[];
  ownerId: ID;
  tags: string[];
  aiGenerated: boolean;
  performance?: { spend: number; ctr: number; hookRate: number; cpa: number; roas: number; frequency: number };
  createdAt: string;
  updatedAt: string;
}
export interface CreativeConcept {
  batchId?: string;
  generationSource?: string;
  brief?: {brand:string;product:string;audience:string;offer:string;platform:string;objective:string;existing:string};
  existingCreativeIds?: ID[];
  reviewedAt?: string;
  reviewedBy?: ID;
  id: ID;
  clientId: ID;
  kind: "Video" | "Static" | "UGC" | "Carousel";
  platform: string;
  title: string;
  angle: string;
  hook: string;
  headline: string;
  script?: string;
  storyboard?: string[];
  cta: string;
  rationale: InsightItem[];
  createdAt: string;
  savedAsCreativeId?: ID;
}
export interface CreativeIntelligenceReport {
 id:ID;clientId:ID;createdAt:string;start:string;end:string;source:string;creativeIds:ID[];
 sections:{key:string;title:string;observations:{kind:"record"|"inference"|"unavailable";text:string;evidence:string[]}[];recommendations:string[]}[];
 limits:string[];
}

// ---------- AI Video Editor ----------
export type VideoAssetKind = "Raw video" | "Script" | "Dialogue" | "Captions" | "Brand asset" | "Logo" | "Music" | "Reference video" | "Reel plan";
export interface VideoAsset {
  id: ID;
  name: string;
  kind: VideoAssetKind;
  durationSec?: number;
  sizeMb: number;
  addedAt: string;
  text?: string; // for scripts / plans / captions
}
export type VideoTrackKind = "video" | "broll" | "caption" | "music" | "sfx" | "overlay";
export interface VideoClip {
  id: ID;
  label: string;
  start: number; // seconds on the timeline
  end: number;
  assetId?: ID;
  srcIn?: number; // in-point inside the source asset
  effect?: "zoom" | "punch-in" | "transition" | "whoosh" | "logo" | "cta" | "none";
  text?: string; // caption text / overlay copy
  aiReason?: string; // why the AI placed this clip
}
export interface VideoTrack {
  id: ID;
  kind: VideoTrackKind;
  label: string;
  clips: VideoClip[];
  muted?: boolean;
}
export interface VideoProject {
  id: ID;
  clientId?: ID;
  title: string;
  objective: string;
  status: "Uploading" | "Analyzing" | "Draft Ready" | "In Review" | "Revising" | "Approved" | "Exported";
  assets: VideoAsset[];
  settings: {
    aspect: "9:16" | "1:1" | "16:9";
    targetDurationSec: number;
    captionStyle: "Dynamic word-by-word" | "Clean subtitles" | "Bold kinetic" | "None";
    brandTemplate: string;
    music: string;
    pace: "Fast" | "Medium" | "Calm";
    removeSilences: boolean;
    autoBroll: boolean;
    hookOptimization: boolean;
  };
  analysis?: {
    scenes: number;
    silencesRemovedSec: number;
    sourceDurationSec: number;
    hookScore: number; // 0..100
    highlights: { at: number; label: string; score: number }[];
    notes: InsightItem[];
  };
  tracks: VideoTrack[];
  versions: { id: ID; label: string; aspect: "9:16" | "1:1" | "16:9"; durationSec: number; createdAt: string; note: string; exported?: boolean }[];
  reviewNotes: { id: ID; authorId: ID; at: string; body: string; timecode?: number; resolved?: boolean }[];
  ownerId: ID;
  createdAt: string;
  updatedAt: string;
}

// ---------- Social ----------
export const SOCIAL_STAGES = ["Idea", "Draft", "AI Review", "Awaiting Approval", "Scheduled", "Published"] as const;
export type SocialStage = (typeof SOCIAL_STAGES)[number];
export type SocialPlatform = "Instagram" | "LinkedIn" | "Facebook" | "X" | "YouTube";
export interface SocialPost {
  id: ID;
  clientId: ID;
  platform: SocialPlatform;
  format: "Reel" | "Carousel" | "Static" | "Story" | "Text" | "Short";
  stage: SocialStage;
  pillar: string;
  title: string;
  hook: string;
  caption: string;
  hashtags: string[];
  scheduledAt?: string;
  publishedAt?: string;
  ownerId: ID;
  aiReview?: { score: number; notes: InsightItem[] };
  metrics?: { reach: number; impressions: number; likes: number; comments: number; shares: number; saves: number; er: number };
  creativeId?: ID;
  createdAt: string;
  workflowVersion?: 2;
  mediaUrls?: string[];
  brief?: string;
  strategyId?: ID;
  contentPlan?: string;
  generationSource?: string;
  updatedAt?: string;
  review?: { digest: string; at: string; source: string; score: number; notes: string[] };
  humanApproval?: { digest: string; at: string; by: ID };
  scheduleTimezone?: string;
  delivery?: { key: string; status: "pending" | "accepted" | "unknown"; providerId?: string; url?: string; at: string };
  publication?: { url: string; source: "Human recorded"; by: ID; at: string };
  analytics?: { source: "Human entered"; recordedAt: string; start: string; end: string; reach: number | null; impressions: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null };
}

// ---------- SEO ----------
export interface SeoIssue {
  id: ID;
  severity: "Critical" | "Warning" | "Notice";
  category: "Technical" | "On-page" | "Content" | "Performance" | "Links";
  title: string;
  affectedUrls: number;
  fix: string;
  status: "Open" | "In Progress" | "Fixed";
}
export interface SeoKeyword {
  id: ID;
  keyword: string;
  volume: number;
  difficulty: number; // 0..100
  intent: "Informational" | "Commercial" | "Transactional" | "Navigational";
  position: number | null;
  prevPosition: number | null;
  url?: string;
  tracked: boolean;
}
export interface ContentBrief {
  id: ID;
  keyword: string;
  title: string;
  outline: string[];
  wordCount: number;
  questions: string[];
  status: "Draft" | "Approved" | "Writing" | "Published";
  createdAt: string;
}
export interface SeoProject {
  workspace?: import("./domain/seoWorkspace").SeoWorkspaceData;
  id: ID;
  clientId: ID;
  domain: string;
  healthScore: number;
  healthHistory: { date: string; score: number }[];
  issues: SeoIssue[];
  keywords: SeoKeyword[];
  backlinks: { total: number; referringDomains: number; newLast30: number; lostLast30: number; toxic: number; history: { date: string; domains: number }[] };
  competitors: { domain: string; overlap: number; traffic: number; keywords: number }[];
  contentGaps: { keyword: string; volume: number; competitor: string }[];
  briefs: ContentBrief[];
  traffic: { date: string; clicks: number; impressions: number }[];
  gscConnected: boolean;
  lastAuditAt: string;
}

// ---------- Documents & assets ----------
export const ASSET_FOLDERS = ["Logos", "Brand guidelines", "Images", "Videos", "Creatives", "Contracts", "Reports", "Proposals", "Presentations", "Strategy"] as const;
export type AssetFolder = (typeof ASSET_FOLDERS)[number];
export interface AssetFile { id: ID; name: string; size: number; sha256: string; knowledgeText?: string }

export interface Asset {
  archivedAt?: string;
  id: ID;
  clientId?: ID; // undefined = agency-level asset
  name: string;
  folder: AssetFolder;
  ext: string;
  sizeKb: number;
  tags: string[];
  versions: { v: number; at: string; by: ID; note: string; file?: AssetFile }[];
  uploadedBy: ID;
  createdAt: string;
  updatedAt: string;
  clientVisible: boolean;
}

// ---------- Client knowledge base (AI memory) ----------
export interface ClientKnowledge {
  id: ID; // = clientId
  clientId: ID;
  brandVoice: string;
  toneWords: string[];
  products: { name: string; price?: string; usp: string }[];
  audience: string;
  competitors: string[];
  approvedMessaging: string[];
  rejectedConcepts: string[];
  preferences: string[];
  guidelines: string;
  history: string[]; // learnings from previous campaigns
  updatedAt: string;
}

// ---------- Influencer / projects / finance ----------
export interface Expense {
  projectId?: ID;
  id: ID;
  date: string;
  category: "Team" | "Freelancer" | "Software" | "Production" | "Influencer" | "Media" | "Office" | "Other";
  vendor: string;
  amount: number;
  clientId?: ID;
  description: string;
  billable: boolean;
}

// ---------- Saved views / custom fields ----------
export interface SavedView {
  id: ID;
  module: "leads" | "clients" | "campaigns" | "tasks";
  name: string;
  filters: Record<string, string>;
  ownerId: ID;
  shared: boolean;
}
export interface CustomFieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  options?: string[];
}

// ---------- Command Center threads ----------
export interface CommandMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
  agent?: AgentId;
  items?: { label: string; sub?: string; href?: string }[];
  insights?: InsightItem[];
  steps?: string[]; // what the agent did (find clients → pull data → analyze …)
  recommendationIds?: ID[];
}
export interface CommandThread {
  id: ID;
  title: string;
  agent?: AgentId; // pinned agent, undefined = auto-route
  messages: CommandMessage[];
  createdAt: string;
  ownerId: ID;
}

// ---------- Organization / SaaS ----------
export const PLANS = ["Starter", "Growth", "Agency", "Enterprise"] as const;
export type Plan = (typeof PLANS)[number];
export const USAGE_KEYS = ["aiCredits", "leads", "clients", "campaigns", "reports", "videoMinutes", "storageGb", "teamMembers"] as const;
export type UsageKey = (typeof USAGE_KEYS)[number];
export interface Organization {
  id: ID;
  name: string;
  slug: string;
  plan: Plan;
  limits: Record<UsageKey, number>; // -1 = unlimited
  usage: Record<UsageKey, number>;
  billingEmail: string;
  region: "India (Mumbai)" | "Singapore" | "EU (Frankfurt)" | "US (Virginia)";
  createdAt: string;
  renewsAt: string;
  security: {
    sso: boolean;
    enforce2fa: boolean;
    sessionTimeoutMin: number;
    ipAllowlist: string[];
    dataRetentionDays: number;
    backupsEnabled: boolean;
    lastBackupAt?: string;
  };
  sessions: { id: ID; userId: ID; device: string; location: string; lastActiveAt: string; current?: boolean }[];
  apiKeys: { id: ID; name: string; prefix: string; createdAt: string; lastUsedAt?: string; scopes: string[] }[];
}

// Collections the generic store helpers (upsert / patch / remove / approval.apply) can target.
export type CollectionKey =
  | "leads" | "deals" | "clients" | "campaigns" | "tasks" | "invoices" | "influencers" | "proposals" | "meetings"
  | "strategies" | "creatives" | "concepts" | "videos" | "socialPosts" | "seoProjects" | "assets" | "knowledge"
  | "aiTasks" | "recommendations" | "expenses" | "engagements" | "projects" | "savedViews" | "ads" | "threads" | "reports";
