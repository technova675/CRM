# Adbibe OS — AI-native Marketing Agency Operating System

One platform for the whole agency flow:
**Lead generation → AI research → Sales → Client onboarding → Strategy → Creative → Media buying → Social → Influencer → SEO → Automation → Analytics → Reporting → Billing → Retention → Upselling.**

It is built to answer four questions continuously — **What is happening?** (analytics) · **Why?** (AI intelligence) · **What should we do?** (AI recommendations) · **How do we execute it?** (automation + human approval) — with humans controlling strategy and consequential decisions while specialised AI agents handle research, analysis, production and repetitive work.

Built with Next.js 16 (App Router), React 19, Tailwind CSS 4, Zustand, Recharts and AI SDK 7.

## Run it

```bash
npm install
npm run dev          # http://localhost:3011
```

It works immediately with realistic demo data (140 leads, 8 clients, 17 campaigns, 33 ads, creatives, videos, social posts, SEO projects, assets, expenses…) saved in your browser's localStorage. **Settings → Data → Reset demo data** starts over.

Use the user switcher (bottom-left) to try all 13 roles — Founder/Admin, Sales, Account Manager, Performance Marketer, Creative Strategist, Video Editor, Designer, SEO, Social Media Manager, Influencer Manager, Finance, AI/Automation Team — and **Client** (the client portal).

### Turn on real AI (optional)

Copy `.env.example` to `.env.local` and set one provider key: `GROQ_API_KEY` or `OPENROUTER_API_KEY` (both have free tiers), or `AI_GATEWAY_API_KEY`. The first provider with a key is used, or set `AI_PROVIDER`; the Reporting agent falls back to the next provider when the first one fails. The top-bar pill changes from **AI local** to **AI live**. Every agent then calls the model through `/api/ai/agent` (plus the existing research/draft/assistant routes) with only the data the current user is authorised to see; without a key each agent runs a deterministic local engine over your real data. Either way, every AI output line is tagged **Data** (with its source) / **Assumption** / **Recommendation**.

### Reports from uploaded files

The company dropdown opens the latest uploaded workbook for that company. All worksheets appear together on one dashboard, with source-labelled KPI cards, category comparisons, share-of-total donuts, date trends and value distributions chosen from the actual columns. Sheets are not added together, preventing duplicate totals across summary/detail worksheets. Each worksheet has metric/grouping controls and an expandable Source data section for search, sorting, original cells and CSV export; there are no sheet tabs. Older workbooks remain stored, while the company dashboard always uses the newest upload.

**Reports → Upload file** accepts Excel (`.xlsx`, every worksheet), CSV, PowerPoint (`.pptx`) and text-based PDF (`.pdf`, tables recovered from page layout; scanned PDFs are not read). PDF reports need `supabase/migrations/202611010005_report_pdf.sql` applied once in the Supabase SQL Editor. Reports have no dependency on demo CRM companies, schedules, campaign figures or generated reports. The company filter is built from uploads saved in Supabase. A company name is suggested only when a recognized company/client column contains one distinct name; otherwise enter it in the upload preview.

No fixed column schema is required. Review the suggested header row for each sheet, select a different row, or choose no headers for complex layouts. All sheets are saved together; the original file, raw cell grids, and interpreted columns/rows are retained. With R2 enabled, their contents live in a private R2 bucket; Supabase stores account ownership, sheet metadata and object receipts. Older Supabase-backed reports remain readable. The original binary preserves formulas, formatting and other workbook details; the report uses extracted cell values, not an Excel calculation engine. You can switch between interpreted data and original worksheet cells. Mixed independent tables on a single sheet can be preserved as a raw grid; they are not automatically treated as independent datasets.

The dashboard generates metric cards, up to three charts, source information, searchable/sortable tables, pagination, selected-sheet CSV export and print/PDF from each saved sheet. Identifier columns are not summed. Rates and unit costs default to explicitly labeled unweighted averages; aggregation can be changed to sum, average, minimum or maximum. Missing data, targets and prior periods are never invented. Legacy `.xls` / `.ppt` and encrypted workbooks must be converted first.

Set `NEXT_PUBLIC_SUPABASE_URL` (or server-only `SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. A new-format key can use `SUPABASE_SECRET_KEY` instead. Open your Supabase project’s **SQL Editor**, run all SQL files in `supabase/migrations/` in filename order, then run `npm run db:init:reports` to verify connectivity. The migration creates `report_companies`, `report_files`, `report_tables` and the atomic `save_report_upload` function. RLS is enabled, browser roles have no direct table/function access, and only server routes use the service key. This uses Supabase’s HTTPS Data API; no PostgreSQL connection URL or Neon driver is needed. Runtime requests do not execute DDL. Existing Neon data is not moved automatically; import a database export or re-upload original reports. Uploads accept original files up to **200 MB (200,000,000 bytes)**. The browser sends original bytes and parsed/raw rows in bounded chunks, with three concurrent requests, retry-safe part writes and upload progress. The report becomes visible only after all chunks are validated and committed. Original bytes and table chunks are stored separately, and source data is read back in bounded requests. Incomplete staging uploads expire after 24 hours and are cleaned on the next upload. Worksheet limits remain 60 sheets/tables, 200 columns and 50,000 source rows per sheet; an individual serialized row must fit a 750 KB chunk. With Supabase storage, the older single-request API remains supported for payloads up to 4 MB; R2 uploads use the chunked report uploader. Oversized files/rows are rejected explicitly instead of silently truncated.

Reports now require **Supabase email/password authentication**. Open `/login`, create an app account, confirm the email, and sign in with the same account on each laptop. Sessions use HttpOnly cookies; the server verifies Supabase JWT claims before deriving a stable account workspace. New uploads carry the verified user's ID. Other accounts cannot read, mutate, or claim these reports. The former demo user selector has been replaced with the actual signed-in email and sign-out.

To recover earlier uploads, sign in using the **same browser and URL used to upload them**, open Reports, and click **Link reports from this browser**. Linking verifies the live user and the existing HttpOnly workspace cookie, preserves file IDs and all source data, merges company entries into the account library, then clears the legacy cookie. Repeat on each browser containing old uploads. Reports from unrelated browser workspaces are never claimed globally. A lost/deleted legacy cookie requires an administrator-assisted ownership recovery; matching a demo display name is not proof of ownership.

Apply `supabase/migrations/202611010003_report_accounts.sql` after the earlier migrations. Enable Email auth and keep email confirmation enabled. Configure your exact `/auth/callback` URLs in Supabase Auth URL Configuration; temporary tunnel URLs must be updated when they change. Supabase's default email service may restrict recipients and rate-limit confirmations; configure custom SMTP for regular use outside the project's authorized recipients. No service key or password belongs in the browser bundle.

Verification: `npm run test:reports` tests parsing, aggregation, workspace filters, Supabase request handling and the actual PostgreSQL migration in a local PGlite test database. It checks atomic rollback, raw-cell/original-file retention, cascade deletion and browser-role restrictions without writing to your hosted project. With the app running on port 3011, `npm run test:reports:integration` verifies real Supabase login, two sessions sharing an account, cross-account denial, browser-report linking, original-file retention and cleanup of its temporary data. `npm run test:reports:large` verifies a 5 MB chunked upload, retries, chunk reads and cleanup. The exact 200 MB acceptance boundary and over-limit rejection are also covered by local SQL tests.

### Private report storage in Cloudflare R2

The server's Supabase HTTP client also handles hotspot DNS failures. If the system resolver stalls, it queries Cloudflare's DNS-over-HTTPS resolver for the public hostname and caches IPv4 answers for at most 60 seconds. NAT64 answers can supply an IPv4 connection candidate. HTTPS still verifies the original Supabase hostname; no Supabase IPs or passwords are pinned or sent to the DNS resolver. Reads and password verification can retry network failures; account creation and other writes are not automatically replayed. `node --env-file=.env.local scripts/check-report-auth.mjs` verifies login, report access and forwarded HTTPS cookies using a temporary account on ports 3011 and 3012.

Create a private R2 bucket and a bucket-scoped **Object Read & Write** S3 API token. In `.env.local`, fill `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`; set `REPORT_FILE_STORAGE=r2` to require R2 for new uploads. The account ID is the Cloudflare account ID, not a bucket ID. The app uses the standard `https://<account-id>.r2.cloudflarestorage.com` endpoint with region `auto`. Keep Supabase URL and auth/server keys: R2 holds file contents, while Supabase still provides login and the report catalogue. Never use `NEXT_PUBLIC_` for R2 keys. Do not enable public bucket access; browser requests go through authenticated server routes, so bucket CORS rules are unnecessary.

Apply `supabase/migrations/202611010004_report_r2.sql` after migrations 001–003, then restart the server (rebuild before `next start`). If no R2 configuration is present, uploads continue using Supabase during setup. A partial R2 configuration produces an explicit error rather than silently saving large payloads back to Supabase. Each upload session pins its backend, so in-progress Supabase uploads can finish after R2 is enabled.

Both original bytes and parsed/raw worksheet data are stored as private, bounded R2 objects under `reports/<upload-session-uuid>/`. Originals use ordered binary parts, rather than one directly browsable `.xlsx` object. Supabase holds small receipts with object keys, SHA-256 hashes, sizes and row counts, with no original bytes or worksheet cell payloads for new R2 uploads. Reads verify hashes and report a storage error when contents cannot be read; failures never become blank worksheets. Existing reports stay in Supabase until separately migrated or re-uploaded; enabling R2 does not by itself free their occupied space.

Run `npm run storage:check` to verify a tiny write/read/hash/delete against your bucket. With the app running, `npm run test:reports:r2` checks authenticated uploads, retries, cross-device visibility and cross-account denial using temporary accounts and report objects. Set `REPORTS_TEST_URL` to test a port other than 3011. `npm run test:reports` runs offline R2 adapter and PostgreSQL receipt/ownership/cleanup tests without accessing your bucket.

Deleting a report queues its R2 prefix transactionally and attempts cleanup immediately. Account deletion, expired transfers and interrupted cleanup also leave durable jobs. A second sweep waits ten minutes so that cancelled in-flight writes cannot leave orphaned objects. Run `npm run storage:cleanup` regularly to remove expired transfer data and drain eligible jobs; no scheduler is installed automatically. Do not add a blanket R2 lifecycle expiry for the `reports/` prefix: saved report objects live there too.

### Account-owned Leads & CRM

`/leads` includes Name, Company, Website, Email, Phone, LinkedIn, Instagram, Industry, Location, Company size, Lead source, Services required, Assigned salesperson, Lead score, Status, Notes, Communication history, AI research, Deal value, tags and custom fields. The linked pipeline uses **New → Researching → Qualified → Contacted → Replied → Meeting → Proposal → Negotiation → Won / Lost**. New and imported leads get linked opportunities; status changes stay aligned with the board.

Apply migrations `202611010005_crm_library.sql` and `202611010006_crm_conflict_result.sql` after the report migrations. Supabase Auth owns each CRM library. Leads, opportunities, salesperson profiles, communication records, activity, saved views and custom-field definitions sync between laptops using the same login. Other accounts cannot access them. The library starts empty rather than copying demo leads. The old browser snapshot is retained under `adbibe-crm-browser-backup-v1` for recovery and is never automatically assigned to an account.

Edits save automatically after a short delay. The sync indicator shows pending changes and failures. A second device refreshes on focus or within 15 seconds. Revision checks prevent stale snapshots from overwriting newer changes; conflicting local edits can be exported before explicitly reloading the cloud copy. Saves have idempotency keys so retries do not duplicate writes. Signing out waits for pending CRM changes to save.

Import CSV or `.xlsx`, or paste a CSV bulk list. Download the template from Import, map columns, review the preview, and import. The importer supports every profile field, existing custom fields, assigned salesperson name/email/ID, semicolon-separated services/tags, and imported research summaries marked as unverified. Exact normalized email or phone duplicates are skipped within the import and against existing leads. Invalid rows are reported, with no silent source/status/service substitutions. Missing company sizes use Unknown. Import limits are 20 MB / 10,000 rows per batch; the account library currently supports up to 10,000 leads and an 8 MB save payload. This snapshot architecture is intended for a small CRM; larger libraries should move to paginated per-record storage.

Communication history can store earlier calls/emails as notes and retains messages entered through existing CRM workflows. Email, WhatsApp and social delivery still require their respective integrations; this change does not connect outbound channels. AI research uses the configured provider when available, with the existing local engine otherwise. The rest of the CRM demo modules have not all been moved to hosted storage.

Run `npm run test:crm` for import, duplicate, pipeline, revision, retry and permission checks in local PGlite. With the app running on 3011, `npm run test:crm:integration` checks real account isolation, cross-session sharing, saved views, custom fields, validation, conflicts and deletion using temporary accounts.

### AI Lead Research Agent

`/research` and each lead profile can run public-source research for a saved, account-owned lead. The new-lead automation also invokes it when that automation is enabled; CSV imports remain in the queue for deliberate batch research. The server loads the lead from the authenticated account, rather than trusting client-supplied company information. The collector reads the supplied homepage, up to three linked about/product/service/content pages, and supplied LinkedIn/Instagram profiles when publicly readable. It does not sign in, bypass access checks, execute page scripts or treat a login wall as company content.

The assessment covers website, social presence, business model, products, target audience, marketing, publicly observable advertising, content, competitors and growth opportunities. It produces AI Company Summary, Marketing Audit, Potential Problems, Growth Opportunities, Recommended Services and Personalized Outreach Angle. Each result has a source ledger, timestamps, explicit access limitations and per-topic evidence coverage.

Verified excerpts must match fetched source text; a model's paraphrase is never promoted to a verified fact. AI inferences need a matched basis and conditional language. CRM-supplied fields have their own label and are not independent public verification. Unsupported model findings, fabricated source references and guaranteed percentage-uplift recommendations are omitted. Competitor findings need explicit comparison language; active-ad evidence must come from a recognised public transparency page. A tracking tag is a technical observation, not proof of active campaigns, spend or performance. Recommendations do not silently populate the CRM's Services required field. Outreach drafts no longer invent prior website visits or promise percentage gains.

Configure the existing AI provider keys for synthesis. The agent falls back to labelled public evidence or CRM-only information if a page/model is unavailable; it does not present a failed synthesis as a completed AI audit. Add optional server-only `TAVILY_API_KEY` for broader public competitor/ad discovery; search result URLs are fetched and checked before their text can support findings. Without that key, search-dependent coverage stays explicitly unverified. Do not infer inactivity from missing or blocked information.

Public fetching is limited to credential-free HTTP/HTTPS on ports 80/443. Literal IPs, DNS answers and every redirect are checked against private, loopback, link-local, mapped/NAT64-internal and reserved ranges; DNS validation happens at connection time. Page size, duration, redirects, model context and per-account concurrent requests are bounded. Requests for the same lead share an in-flight job. Research runs in the current app session and saves through CRM sync; an interrupted session is marked retryable after three minutes rather than left running indefinitely. This is not a durable background worker.

Run `npm run test:research` for public-fetch and evidence-grounding checks. `npm run test:research:integration` uses temporary accounts, checks authorization and private-source blocking, and runs the public `example.com` page through the configured AI provider. A live run may use provider quota. The result reports whether AI synthesis succeeded or only source evidence was available.

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
| Reports | `/reports` | Upload-driven companies and dashboards from Excel/CSV/PPTX/PDF, original-file/raw-cell preservation in private R2 or Supabase, header preview, charts, CSV and print/PDF |
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

## AI outreach engine

Open **Outreach** (`/outreach`) in the sidebar. Campaigns, templates, follow-up sequences and suppressions are saved in the account CRM library and sync to the same login on other laptops. Campaign creation supports industry, company size, tags, pipeline status and minimum score filters; recipients can also be selected from Leads & CRM. AI reads each lead's saved public research, or runs research first, then generates personalized drafts in batches of 10. Unusable AI responses become clearly labeled CRM-personalized fallback drafts. Every first message and follow-up needs explicit human approval. An edit to the message, destination, channel or sequence touch invalidates its signed approval. A/B tests split recipients between a personalized first-message draft and a rendered template; reply statistics are descriptive and do not establish statistical significance.

**Delivery is integration-ready and disabled until configured.** Configure server-only `OUTREACH_DELIVERY_URL` (HTTPS), `OUTREACH_DELIVERY_TOKEN`, `OUTREACH_APPROVED_CHANNELS` (comma-separated `Email,LinkedIn,WhatsApp,Instagram` as supported by your approved provider) and `OUTREACH_WEBHOOK_SECRET`. The Channel connections tab shows configuration, rather than claiming a provider connection has been verified. The adapter must respect each platform's supported capabilities, contact permissions and opt-out requirements. No browser automation or real external messages are used in verification.

The send endpoint dispatches up to 10 explicitly approved messages per click. It rechecks account ownership, current content and destination, suppression, replies, bounces, opt-outs, campaign pause, UTC send window, due offsets, open conditions and an account-wide daily cap. Supabase migration `202611010007_outreach_delivery.sql` provides a private delivery ledger and idempotent claims. A message is counted as accepted only after the adapter acknowledges it; acceptance is distinct from delivered/opened/replied. Unknown outcomes are never automatically resent. Check the provider before creating another campaign or delivery attempt.

Adapter contract: accept an authenticated HTTPS POST with `Authorization: Bearer <OUTREACH_DELIVERY_TOKEN>` and `Idempotency-Key: <delivery UUID>`. JSON includes `deliveryId`, `channel`, `to`, `body`, optional `subject`, `campaignId`, `variant`, `stepIndex` and `approval` (actor and time). Deduplicate by delivery UUID and return `{ "accepted": true, "messageId": "provider-reference" }` only after provider acceptance. Never acknowledge a queued request as delivered. The adapter must safely honor duplicate UUIDs across process restarts.

Report confirmed events to `/api/outreach/webhook` with JSON `{ "eventId": "globally-unique-provider-event", "deliveryId": "UUID", "kind": "delivered|opened|replied|bounced|unsubscribed", "occurredAt": "ISO timestamp" }`. Set `x-outreach-timestamp` to Unix seconds and `x-outreach-signature` to the hex HMAC-SHA256 of `<timestamp>.<exact raw JSON body>` using `OUTREACH_WEBHOOK_SECRET`. Requests expire after 5 minutes; events are deduplicated. Replies, bounces and unsubscribes stop further dispatches for the lead. The provider must convert inbound stop/unsubscribe requests into `unsubscribed` events. The webhook uses signature authentication instead of browser cookies.

Follow-ups are **prepared for review when requested**, respecting sequence day offsets; they are not a durable background scheduler. UTC send windows and the daily account cap are checked again at dispatch. Use a queue/worker later for scheduled preparation while retaining per-message approval. Tracking displays up to the latest 1,000 attempts; open data is only shown when a provider supplies it. Other demo modules do not automatically use this adapter.

Validation: `npm run test:outreach` covers suppression normalization, content-bound approvals, due offsets/windows, opt-out text, ledger idempotency, daily caps, event deduplication, RLS and browser-role denial. `npm run test:outreach:integration` uses disposable Supabase accounts to verify cross-laptop sync, isolation, approval, AI/fallback drafts and blocked sending without a configured adapter. It does not send messages.

## What's required to take this to production

Other modules still use demo data. To run the complete platform for real teams and external customers you need:

1. **Database & multi-tenancy** — Extend the reporting Supabase PostgreSQL database to other CRM modules. Every table carries `organization_id`; enforce isolation with row-level security. `lib/types.ts` maps to tables; replace localStorage persistence with server actions.
2. **Organization authorization** — Supabase email/password sign-in and account-owned reports are implemented. Add organization membership, production role enforcement, client-portal scoping, SSO and MFA before using the remaining demo CRM modules with real teams. Local demo roles do not grant access to another account’s reports.
3. **AI provider** — `AI_GATEWAY_API_KEY` (already wired); move credit metering server-side.
4. **Integrations** (each needs platform approval/verification) — Meta Marketing API (app review), Google Ads API (developer token), GA4 Data API, Search Console API, LinkedIn Marketing API, DV360, Amazon Ads, Shopify/WooCommerce, WhatsApp Business Cloud API, Instagram/Facebook publishing, YouTube, Slack, Google Drive/Calendar/Sheets. Store OAuth tokens encrypted at rest (`TOKEN_ENCRYPTION_KEY` or a KMS), never in the browser.
5. **Background jobs** — Vercel Cron + Queues/Workflow for follow-up sequences, daily media audits, anomaly detection, scheduled reports, reminders and syncs.
6. **File storage & video rendering** — Vercel Blob / S3 for assets and uploads; a render backend (FFmpeg worker or cloud render service) to turn the AI Video Editor's edit decision lists into final files; transcription for real captions/silence detection.
7. **Email & messaging** — Gmail/Workspace OAuth or Resend/SMTP with SPF/DKIM/DMARC; unsubscribe handling (modelled via opt-out + suppression).
8. **Billing** — Razorpay/Stripe for client invoices and SaaS plans/credits.
9. **Compliance** — DPDP Act 2023, GDPR, CAN-SPAM; per-channel rate limits; data-retention and backup policy (settings modelled under Security).

**From Adbibe:** brand assets, the real service catalogue + price book, onboarding checklists per service, scoring weights, tone/templates, team roster & roles, per-client knowledge base content, and which integrations to launch first.
