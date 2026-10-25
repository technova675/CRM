# Adbibe OS — AI-native Marketing Agency Operating System

One platform for the whole agency flow:
**Lead generation → AI research → Sales → Client onboarding → Strategy → Creative → Media buying → Social → Influencer → SEO → Automation → Analytics → Reporting → Billing → Retention → Upselling.**

It is built to answer four questions continuously — **What is happening?** (analytics) · **Why?** (AI intelligence) · **What should we do?** (AI recommendations) · **How do we execute it?** (automation + human approval) — with humans controlling strategy and consequential decisions while specialised AI agents handle research, analysis, production and repetitive work.

Built with Next.js 16 (App Router), React 19, Tailwind CSS 4, Zustand, Recharts and AI SDK 7.

## Run it

```bash
npm install
npm run dev          # http://localhost:3001
```

It works immediately with realistic demo data (140 leads, 8 clients, 17 campaigns, 33 ads, creatives, videos, social posts, SEO projects, assets, expenses…) saved in your browser's localStorage. **Settings → Data → Reset demo data** starts over.

Use the user switcher (bottom-left) to try all 13 roles — Founder/Admin, Sales, Account Manager, Performance Marketer, Creative Strategist, Video Editor, Designer, SEO, Social Media Manager, Influencer Manager, Finance, AI/Automation Team — and **Client** (the client portal).

### Turn on real AI (optional)

Copy `.env.example` to `.env.local` and set one provider key: `GROQ_API_KEY` or `OPENROUTER_API_KEY` (both have free tiers), or `AI_GATEWAY_API_KEY`. The first provider with a key is used, or set `AI_PROVIDER`; the Reporting agent falls back to the next provider when the first one fails. The top-bar pill changes from **AI local** to **AI live**. Every agent then calls the model through `/api/ai/agent` (plus the existing research/draft/assistant routes) with only the data the current user is authorised to see; without a key each agent runs a deterministic local engine over your real data. Either way, every AI output line is tagged **Data** (with its source) / **Assumption** / **Recommendation**.

### Reports from uploaded files

**Reports → Upload file** accepts Excel (`.xlsx`, every worksheet), CSV and PowerPoint (`.pptx`). Reports have no dependency on demo CRM companies, schedules, campaign figures or generated reports. The company filter is built from uploads saved in Neon. A company name is suggested only when a recognized company/client column contains one distinct name; otherwise enter it in the upload preview.

No fixed column schema is required. Review the suggested header row for each sheet, select a different row, or choose no headers for complex layouts. All sheets are saved together; the original file (base64), raw cell grids, and interpreted columns/rows are retained in Postgres. The original binary preserves formulas, formatting and other workbook details; the report uses extracted cell values, not an Excel calculation engine. You can switch between interpreted data and original worksheet cells. Mixed independent tables on a single sheet can be preserved as a raw grid; they are not automatically treated as independent datasets.

The dashboard generates metric cards, up to three charts, source information, searchable/sortable tables, pagination, selected-sheet CSV export and print/PDF from each saved sheet. Identifier columns are not summed. Rates and unit costs default to explicitly labeled unweighted averages; aggregation can be changed to sum, average, minimum or maximum. Missing data, targets and prior periods are never invented. Legacy `.xls` / `.ppt` and encrypted workbooks must be converted first.

Set `DATABASE_URL` in `.env.local`, then run `npm run db:init:reports` to create or update `report_companies`, `report_files` and `report_tables`. The same idempotent schema setup runs on first API use. Uploads are atomic and bounded to 60 sheets/tables, 200 columns and 50,000 source rows per sheet, with a 4 MB total JSON request including the original file and raw/parsed data. Oversized files are rejected explicitly instead of silently truncated.

Until the app has real authentication, report APIs isolate uploads with an unguessable HttpOnly browser-workspace cookie. This is browser workspace isolation, not organization membership or cross-device login. Keep that cookie to reopen saved reports in the same browser; another browser cannot access them. Older uploads without a workspace assignment are not exposed to new sessions. Public sharing and fake scheduling controls are omitted.

Verification: `npm run test:reports` tests parsing and aggregation. With the app running on port 3001, `npm run test:reports:integration` verifies a real Neon upload/reload/delete cycle, workspace isolation, original-file retention and cleanup of its temporary data.

## Modules

| Area | Route | Highlights |
|---|---|---|
| AI Command Center | `/command` | ChatGPT-style threads, auto-routing to 12 specialised agents, visible "what I did" steps, recommendations → tasks, deep links into modules, agent directory, AI activity, "four questions" home |
| Dashboard | `/dashboard` | Sales · Clients · Marketing · Operations · Finance sections (role-filtered) + client-portal dashboard |
| Leads & CRM | `/leads`, `/leads/[id]` | Custom fields, deal value, duplicate detection & merge, bulk tagging, segments, saved views, CSV/Excel import |
| AI Lead Research & scoring | `/research` | Verified vs inferred findings, explainable score + next action, manual override |
| Outreach | `/outreach` | Research → personalise → review → approve → send → follow-up; A/B variants, templates, sequences, suppression/opt-out |
| Inbox · Meetings | `/inbox`, `/meetings` | Unified inbox with AI → human takeover; meeting outcomes drive the pipeline |
| Sales Pipeline | `/pipeline` | Kanban, deal drawer with activity timeline; **Won → onboarding automatically** |
| Proposals | `/proposals`, `/proposals/[id]` | AI generator (discovery notes, strategy, price book, deliverables, timeline), Draft → Internal Review → Sent → Viewed → Accepted/Rejected, printable PDF |
| Clients (360°) | `/clients`, `/clients/[id]` | One-screen overview, health score, upsell/churn insights, Creative/Social/SEO/Influencer/Strategy tabs, **Knowledge (AI memory)** |
| Onboarding | `/onboarding` | Deal Won → welcome email → form → assets → access → tracking → workspace → project → tasks → team → strategy → setup → launch |
| Strategy | `/strategy` | AI strategy, personas, funnel, channel & budget allocation, pillars, testing roadmap, KPI framework; edit, approve, create campaigns |
| Documents & Assets | `/documents` | Per-client libraries, folders, tags, search, versions, client-portal visibility |
| Campaigns | `/campaigns` | All channels incl. LinkedIn, retail media, quick commerce; objective, audience, landing page, tracking, KPIs |
| Performance Marketing | `/performance` | Media agent: winners, losers, fatigue, rising CPA, scaling, budget pacing → **recommendation → approval → execution** |
| Creative Studio | `/creative` | Concepts/hooks/scripts/storyboards from the knowledge base, creative intelligence, approval board with versions & comments, client approvals |
| AI Video Editor | `/video`, `/video/[id]` | Uploads, AI analysis, auto-generated multi-track timeline, manual drag/trim editor, review notes → AI revise, 9:16/1:1/16:9 versions, EDL export |
| Social | `/social` | Calendar + kanban (Idea → Draft → AI Review → Approval → Scheduled → Published), calendar generator, captions/hooks/hashtags, analytics |
| Influencers | `/influencers` | Creator CRM, AI matching → shortlist, engagement pipeline (outreach → payment → performance) |
| SEO | `/seo` | Health over time, audit issues → tasks, rankings, keyword ideas (estimates), content gaps & briefs, backlinks, Search Console status |
| Analytics & AI Insights | `/analytics` | Unified metrics by client/platform/campaign/ad/creative/audience/geo/date, period compare, anomaly investigation: Finding → Evidence → Recommendation → Priority |
| Reports | `/reports` | Upload-driven companies and dashboards from Excel/CSV/PPTX, original-file/raw-cell preservation in Neon, header preview, charts, CSV and print/PDF |
| Tasks & Projects | `/tasks` | Dependencies, comments, attachments, recurring tasks, projects, team workload |
| Finance | `/payments` | Revenue → Cost → Gross margin → Outstanding → Profitability, invoices, expenses, client/project profitability, forecast |
| Team | `/team` | Members, per-module permission matrix (editable), workload vs capacity |
| Automation Builder | `/automations` | Trigger → Condition → AI Decision → Approval → Action, describe-a-workflow, test runs, approvals queue, activity log |
| Integrations | `/integrations` | Connector framework (auth, scopes, capabilities, accounts, sync), API keys |
| Settings | `/settings` | AI approval modes per action, notification preferences, plan & usage, security, audit log, lead scoring, custom fields, onboarding templates |

Global search (**Ctrl/⌘ K**) covers leads, clients, deals, campaigns, creatives, tasks, reports, documents, conversations, influencers, strategies, posts and keywords, and understands queries like *"clients spending over ₹5 lakh/month whose ROAS dropped this month"*.

## How AI actions are governed

- **12 specialised agents** (`lib/ai/agents.ts`): Sales, Strategy, Media, Creative, Video, Social, SEO, Analytics, Reporting, Client Success, Finance, Automation — each with a scope and controlled access to the shared client knowledge base.
- **Three modes per action** (Settings → AI approvals): **Manual** (AI recommends, a human executes — a task is created), **Approval** (AI prepares, a human approves in Automations → Approvals; the prepared change is applied on approval), **Automatic** (AI executes and logs).
- **Spend safety switch:** campaign budget/status changes can never run Automatic unless an admin explicitly enables it.
- **Audit log:** every human, AI, API and system action is recorded as *Who → What → When → Before → After*.
- **Metering:** AI jobs consume plan credits (and video minutes); limits per plan (Starter/Growth/Agency/Enterprise) are in `lib/seeds/org.ts`.

## Architecture

```
app/                     one folder per module + app/api/ai/* (server AI endpoints, incl. the generic /api/ai/agent)
components/ui.tsx        design system (incl. InsightList / AgentChip for tagged AI output)
components/<module>/     module components
components/shell/        layout, nav, command palette, assistant drawer, toasts
lib/types.ts             domain model (Organization → users, leads, deals, clients, projects, campaigns, ads,
                         creatives, influencers, tasks, conversations, reports, documents, invoices, AI agents,
                         AI tasks, recommendations, automations, integrations)
lib/store.ts             business logic + generic upsert/patch/remove, approvals (with apply-on-approve),
                         recommendations, creative approvals, metering, audit
lib/ai/                  one pure engine per agent (media, analytics, strategy, creative, video, social, seo,
                         finance, proposal, client-success, command…) + provider + client helpers
lib/permissions.ts       13 roles × 28 modules access matrix (+ admin overrides)
lib/seed.ts, lib/seeds/  deterministic demo data, one file per module
```

AI engines in `lib/ai/*` are pure functions over data, so they can move to server actions or background jobs unchanged when the database is added.

## What's required to take this to production

This build is a complete front-end + business logic + AI layer running on local demo data. To run it for real teams and external customers you need:

1. **Database & multi-tenancy** — Postgres (e.g. Neon via the Vercel Marketplace) + Drizzle/Prisma. Every table carries `organization_id`; enforce isolation with row-level security. `lib/types.ts` maps to tables; replace localStorage persistence with server actions.
2. **Authentication** — Clerk / Auth.js / Sign in with Vercel with org membership, SSO for Enterprise, 2FA; enforce `lib/permissions.ts` server-side and scope client-portal users to their client.
3. **AI provider** — `AI_GATEWAY_API_KEY` (already wired); move credit metering server-side.
4. **Integrations** (each needs platform approval/verification) — Meta Marketing API (app review), Google Ads API (developer token), GA4 Data API, Search Console API, LinkedIn Marketing API, DV360, Amazon Ads, Shopify/WooCommerce, WhatsApp Business Cloud API, Instagram/Facebook publishing, YouTube, Slack, Google Drive/Calendar/Sheets. Store OAuth tokens encrypted at rest (`TOKEN_ENCRYPTION_KEY` or a KMS), never in the browser.
5. **Background jobs** — Vercel Cron + Queues/Workflow for follow-up sequences, daily media audits, anomaly detection, scheduled reports, reminders and syncs.
6. **File storage & video rendering** — Vercel Blob / S3 for assets and uploads; a render backend (FFmpeg worker or cloud render service) to turn the AI Video Editor's edit decision lists into final files; transcription for real captions/silence detection.
7. **Email & messaging** — Gmail/Workspace OAuth or Resend/SMTP with SPF/DKIM/DMARC; unsubscribe handling (modelled via opt-out + suppression).
8. **Billing** — Razorpay/Stripe for client invoices and SaaS plans/credits.
9. **Compliance** — DPDP Act 2023, GDPR, CAN-SPAM; per-channel rate limits; data-retention and backup policy (settings modelled under Security).

**From Adbibe:** brand assets, the real service catalogue + price book, onboarding checklists per service, scoring weights, tone/templates, team roster & roles, per-client knowledge base content, and which integrations to launch first.
