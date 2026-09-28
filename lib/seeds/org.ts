import type { AITask, Integration, Organization, Plan, UsageKey } from "../types";
import { ago, ahead } from "./context";

// -1 = unlimited. Enforced client-side today via consumeUsage(); the same limits must be enforced server-side.
export const PLAN_LIMITS: Record<Plan, Record<UsageKey, number>> = {
  Starter: { aiCredits: 2000, leads: 1000, clients: 5, campaigns: 25, reports: 20, videoMinutes: 30, storageGb: 10, teamMembers: 3 },
  Growth: { aiCredits: 10000, leads: 10000, clients: 20, campaigns: 150, reports: 100, videoMinutes: 180, storageGb: 100, teamMembers: 10 },
  Agency: { aiCredits: 40000, leads: 50000, clients: 75, campaigns: 750, reports: 500, videoMinutes: 900, storageGb: 500, teamMembers: 40 },
  Enterprise: { aiCredits: -1, leads: -1, clients: -1, campaigns: -1, reports: -1, videoMinutes: -1, storageGb: -1, teamMembers: -1 },
};
export const PLAN_PRICE: Record<Plan, number> = { Starter: 7999, Growth: 24999, Agency: 69999, Enterprise: 0 };

export function seedOrganization(counts: { leads: number; clients: number; campaigns: number; team: number }): Organization {
  return {
    id: "org_adbibe",
    name: "Adbibe",
    slug: "adbibe",
    plan: "Agency",
    limits: PLAN_LIMITS.Agency,
    usage: { aiCredits: 12840, leads: counts.leads, clients: counts.clients, campaigns: counts.campaigns, reports: 46, videoMinutes: 212, storageGb: 38, teamMembers: counts.team },
    billingEmail: "finance@adbibe.com",
    region: "India (Mumbai)",
    createdAt: ago(420),
    renewsAt: ahead(18),
    security: { sso: false, enforce2fa: true, sessionTimeoutMin: 720, ipAllowlist: [], dataRetentionDays: 730, backupsEnabled: true, lastBackupAt: ago(0, 5) },
    sessions: [
      { id: "ses_1", userId: "u_admin", device: "Chrome · Windows", location: "Mumbai, IN", lastActiveAt: ago(0), current: true },
      { id: "ses_2", userId: "u_admin", device: "Safari · iPhone", location: "Mumbai, IN", lastActiveAt: ago(0, 6) },
      { id: "ses_3", userId: "u_sales1", device: "Chrome · macOS", location: "Pune, IN", lastActiveAt: ago(0, 1) },
      { id: "ses_4", userId: "u_mkt1", device: "Edge · Windows", location: "Bengaluru, IN", lastActiveAt: ago(1) },
    ],
    apiKeys: [{ id: "key_1", name: "Zapier bridge", prefix: "adb_live_7f3a", createdAt: ago(60), lastUsedAt: ago(0, 3), scopes: ["leads:write", "clients:read"] }],
  };
}

const i = (x: Omit<Integration, "status" | "scopes"> & Partial<Pick<Integration, "status" | "scopes">>): Integration => ({ status: "available", scopes: [], ...x });

// Integration registry — the framework treats every platform as a connector entry
// (auth type, scopes, capabilities) instead of hard-coding each one.
export function seedIntegrations(): Integration[] {
  return [
    i({ key: "meta", name: "Meta Ads", category: "Ads", status: "connected", auth: "OAuth 2.0", connectedAt: ago(90), lastSyncAt: ago(0, 1), scopes: ["ads_read", "ads_management", "business_management"], capabilities: ["read", "write", "sync"], accounts: ["act_2231 · Bloom Organics", "act_8812 · Cedar Realty", "act_1190 · Ember Kitchen", "act_5520 · Zen Fitness"], description: "Campaign, ad set and ad performance; budget changes after approval.", phase: 2 }),
    i({ key: "google_ads", name: "Google Ads", category: "Ads", status: "connected", auth: "OAuth 2.0", connectedAt: ago(80), lastSyncAt: ago(0, 2), scopes: ["adwords"], capabilities: ["read", "write", "sync"], accounts: ["712-331-9921 · Cedar Realty", "118-220-4431 · Lumen Academy", "902-114-7781 · Atlas Health"], description: "Search, PMax and YouTube performance via the Google Ads API.", phase: 2 }),
    i({ key: "linkedin_ads", name: "LinkedIn Ads", category: "Ads", auth: "OAuth 2.0", scopes: ["r_ads", "r_ads_reporting", "rw_ads"], capabilities: ["read", "write"], description: "B2B campaign performance and lead-gen forms.", phase: 3 }),
    i({ key: "dv360", name: "Display & Video 360", category: "Ads", status: "connected", auth: "OAuth 2.0", connectedAt: ago(40), lastSyncAt: ago(0, 4), scopes: ["display-video"], capabilities: ["read", "sync"], accounts: ["Orbit Finance · Advertiser 44102"], description: "Programmatic line items, reach and viewability.", phase: 3 }),
    i({ key: "tiktok_ads", name: "TikTok Ads", category: "Ads", auth: "OAuth 2.0", scopes: ["ad.read", "ad.manage", "report.read"], capabilities: ["read", "write", "sync"], description: "Spark Ads and in-feed performance; budget changes after approval.", phase: 4 }),
    i({ key: "ga4", name: "Google Analytics 4", category: "Analytics", status: "connected", auth: "OAuth 2.0", connectedAt: ago(80), lastSyncAt: ago(0, 1), scopes: ["analytics.readonly"], capabilities: ["read", "sync"], description: "Sessions, conversions and funnel data per property.", phase: 2 }),
    i({ key: "gsc", name: "Google Search Console", category: "Analytics", status: "connected", auth: "OAuth 2.0", connectedAt: ago(30), lastSyncAt: ago(0, 8), scopes: ["webmasters.readonly"], capabilities: ["read", "sync"], description: "Queries, clicks, impressions and positions for the SEO module.", phase: 3 }),
    i({ key: "gmail", name: "Email (Gmail / SMTP)", category: "Messaging", status: "connected", auth: "OAuth 2.0", connectedAt: ago(100), scopes: ["gmail.send", "gmail.readonly"], capabilities: ["read", "write", "webhooks"], description: "Outbound sequences and the unified inbox.", phase: 1 }),
    i({ key: "whatsapp", name: "WhatsApp Business", category: "Messaging", auth: "API Key", scopes: ["messages"], capabilities: ["write", "webhooks"], description: "Template messages and replies via the Cloud API (Meta approval required).", phase: 2 }),
    i({ key: "linkedin", name: "LinkedIn (messaging assist)", category: "Messaging", auth: "OAuth 2.0", scopes: ["w_member_social"], capabilities: ["publish"], description: "Automated DMs aren't permitted by LinkedIn — used for manual-assist and company page posts.", phase: 3 }),
    i({ key: "instagram", name: "Instagram", category: "Social", status: "error", auth: "OAuth 2.0", scopes: ["instagram_basic", "instagram_content_publish", "instagram_manage_messages"], capabilities: ["read", "publish", "webhooks"], description: "Publishing, insights and DMs within Meta's messaging window. Token expired — reconnect.", phase: 3 }),
    i({ key: "facebook_pages", name: "Facebook Pages", category: "Social", status: "connected", auth: "OAuth 2.0", connectedAt: ago(70), scopes: ["pages_manage_posts", "pages_read_engagement"], capabilities: ["read", "publish"], description: "Scheduling and page insights.", phase: 3 }),
    i({ key: "youtube", name: "YouTube", category: "Social", auth: "OAuth 2.0", scopes: ["youtube.upload", "yt-analytics.readonly"], capabilities: ["read", "publish"], description: "Shorts and long-form publishing + analytics.", phase: 3 }),
    i({ key: "calendar", name: "Google Calendar", category: "Productivity", status: "connected", auth: "OAuth 2.0", connectedAt: ago(100), scopes: ["calendar.events"], capabilities: ["read", "write"], description: "Meeting booking and sync.", phase: 1 }),
    i({ key: "slack", name: "Slack", category: "Productivity", status: "connected", auth: "OAuth 2.0", connectedAt: ago(50), scopes: ["chat:write", "channels:read"], capabilities: ["write", "webhooks"], description: "Alerts for anomalies, approvals and wins.", phase: 2 }),
    i({ key: "sheets", name: "Google Sheets", category: "Productivity", status: "connected", auth: "OAuth 2.0", connectedAt: ago(60), scopes: ["spreadsheets"], capabilities: ["read", "write"], description: "Lead import and report exports.", phase: 1 }),
    i({ key: "webhooks", name: "Custom webhooks", category: "Productivity", auth: "Webhook", scopes: [], capabilities: ["webhooks"], description: "Receive signed events from any system — website forms, landing-page builders, client CRMs.", phase: 1 }),
    i({ key: "zapier", name: "Zapier / Make", category: "Productivity", status: "connected", auth: "API Key", connectedAt: ago(60), lastSyncAt: ago(0, 3), scopes: ["leads:write", "clients:read"], capabilities: ["write", "webhooks"], description: "No-code bridges that use an Adbibe API key (see API keys).", phase: 2 }),
    i({ key: "drive", name: "Google Drive", category: "Storage", auth: "OAuth 2.0", scopes: ["drive.file"], capabilities: ["read", "write", "sync"], description: "Sync client asset libraries.", phase: 2 }),
    i({ key: "s3", name: "Cloud storage (S3 / Vercel Blob)", category: "Storage", auth: "API Key", scopes: ["objects"], capabilities: ["read", "write"], description: "Raw video, creatives and report PDFs.", phase: 3 }),
    i({ key: "shopify", name: "Shopify", category: "Ecommerce", status: "connected", auth: "OAuth 2.0", connectedAt: ago(35), lastSyncAt: ago(0, 2), scopes: ["read_orders", "read_products"], capabilities: ["read", "sync", "webhooks"], accounts: ["bloomorganics.myshopify.com"], description: "Orders, revenue and products for true ROAS.", phase: 2 }),
    i({ key: "woocommerce", name: "WooCommerce", category: "Ecommerce", auth: "API Key", scopes: ["orders:read"], capabilities: ["read", "sync"], description: "Orders and revenue.", phase: 3 }),
    i({ key: "amazon_ads", name: "Amazon Ads", category: "Commerce Media", auth: "OAuth 2.0", scopes: ["advertising::campaign_management"], capabilities: ["read", "write"], description: "Sponsored products / brands performance.", phase: 3 }),
    i({ key: "blinkit", name: "Blinkit / Zepto Ads", category: "Commerce Media", auth: "API Key", scopes: ["reports"], capabilities: ["read"], description: "Quick-commerce ad reports (partner API / report upload).", phase: 4 }),
    i({ key: "hubspot", name: "HubSpot / Salesforce", category: "CRM", auth: "OAuth 2.0", scopes: ["crm.objects"], capabilities: ["read", "write", "sync"], description: "Two-way sync with a client's CRM for offline conversions.", phase: 4 }),
    i({ key: "influencer_db", name: "Influencer data provider", category: "Influencer", auth: "API Key", scopes: ["creators:read"], capabilities: ["read"], description: "Creator audience and engagement data.", phase: 3 }),
    i({ key: "razorpay", name: "Razorpay", category: "Payments", auth: "API Key", scopes: ["invoices", "payments"], capabilities: ["write", "webhooks"], description: "Payment links and reconciliation.", phase: 4 }),
    i({ key: "stripe", name: "Stripe", category: "Payments", auth: "API Key", scopes: ["invoices"], capabilities: ["write", "webhooks"], description: "International invoicing and SaaS billing.", phase: 4 }),
    i({ key: "ai_gateway", name: "AI Provider (Vercel AI Gateway)", category: "AI", auth: "API Key", scopes: ["models"], capabilities: ["read"], description: "LLM access for every agent. Set AI_GATEWAY_API_KEY.", phase: 1 }),
  ];
}

export function seedAITasks(): AITask[] {
  return [
    { id: "ait_1", agent: "sales", title: "Researched 12 new leads", input: "Batch research — LinkedIn import", status: "done", credits: 24, createdAt: ago(0, 2), completedAt: ago(0, 2) },
    { id: "ait_2", agent: "media", title: "Daily media audit — 31 ads", input: "Scheduled 08:00", status: "done", credits: 5, createdAt: ago(0, 5), completedAt: ago(0, 5) },
    { id: "ait_3", agent: "reporting", title: "Drafted monthly report — Bloom Organics", input: "Report schedule", status: "awaiting_approval", credits: 8, clientId: "c_1", createdAt: ago(0, 9) },
    { id: "ait_4", agent: "client_success", title: "Client health scan", input: "Weekly", status: "done", credits: 3, createdAt: ago(1), completedAt: ago(1) },
    { id: "ait_5", agent: "creative", title: "10 hook variations — Zen Fitness", input: "Creative brief", status: "done", credits: 6, clientId: "c_8", createdAt: ago(1, 4), completedAt: ago(1, 4) },
  ];
}
