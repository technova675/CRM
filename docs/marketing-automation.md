# Marketing Automation (Section 20)

Open **Operations → Automations**, or `/automations`. Four templates cover new-lead research/score/outreach, campaign performance decline/recommendation, client-report due/collection/drafting, and overdue-invoice notification/reminders.

## Builder and approval workflow

1. Choose **New workflow**, select a template and edit typed steps, thresholds, metric windows and client scope. Steps can be moved using labelled buttons, including on touch devices; dragging is not required. Condition false/unknown branches stop the run. Supported operations are an allowlist, not arbitrary scripts, URLs or tool calls.
2. **Save workflow** creates a paused account-synced definition. Changes create a new version, pause the workflow and cancel unfinished runs on the old version. Already dispatched messages cannot be recalled.
3. Select a target and **Preview without executing**. A preview stores an explicit plan without researching, invoking AI, creating tasks, approving or sending. No simulated external success is reported.
4. **Enable workflow**, then **Start real run** or **Scan enabled triggers**. Enabling arms the definition; it does not claim a scheduler is installed. New-lead scanning considers records created from initial activation onward. Invoice/report triggers use real due records. Campaign decline requires comparable, dated imported/synced measurements and valid denominators; undated demo numbers do not trigger it. Event receipts prevent repeat queueing for the same event.
5. **Runs & approvals** shows completed checkpoints, calculated evidence, real AI source labels, exact recipients/subject/body, errors and provider acceptance. Conditions, AI review and approval have distinct outcomes. AI decisions can request human review or stop; they cannot bypass conditions or sending approval.
6. **Approve exact message** authorizes the displayed payload against the current source/version. **Continue until checkpoint** resumes execution. Changed source data blocks the run; start a fresh run using current evidence. Editing or regenerating a message requires fresh approval. The final send rechecks destinations, opt-outs/suppressions and relevant source data.

Lead research reads attributed public evidence and exposes gaps; it does not manufacture audit findings. Lead fit scoring uses the existing CRM scoring rules/manual override and is labelled calculated, not verified intent. AI produces personalized outreach, campaign explanations/recommendations, client report text and invoice reminders. Reports collect saved measured campaign rows, not imaginary platform connections. Internal notifications create actual assigned **Tasks**, with an active relevant team member or the account owner as fallback. They do not claim Slack/email delivery. Campaign recommendations never execute ad-budget, bidding or status changes.

## Running continuously

Manual runs and the optional **Process enabled workflows while this page is open** watcher work without a background service. The watcher stops when the page closes. For durable processing while the browser is closed:

- Set server-only `AUTOMATION_WORKER_SECRET` to a strong random secret.
- Set `AUTOMATION_WORKER_OWNER_IDS` to a comma-separated list of authorized Supabase account UUIDs, and `AUTOMATION_WORKER_BASE_URL` to the reachable Next.js base URL.
- Start `node --env-file=.env.local scripts/automation-worker.mjs` on an always-on host. It polls the scoped tick API and advances one checkpoint per owner per pass. Alternatively a trusted scheduler can POST `{ownerId}` to `/api/automations/tick` with `Authorization: Bearer AUTOMATION_WORKER_SECRET`.

The worker cannot approve messages. It only advances enabled workflows and stops at approval, missing data, paused definitions or disconnected services. Scheduled waits are persisted as due timestamps. Runs and receipts survive server/browser restarts. Concurrent processing uses persisted step leases and optimistic revision checks. Interrupted non-sending steps can be recovered; interrupted sending becomes an unknown outcome rather than an automatic resend.

## Approved Email delivery adapter

Set server-only `AUTOMATION_DELIVERY_URL` (HTTPS) and `AUTOMATION_DELIVERY_TOKEN`. No delivery adapter is currently connected. The app sends only after explicit human approval; a browser-local Automatic setting cannot override this.

The adapter receives POST `{ownerId,workflowId,runId,channel:"Email",to,subject,body,purpose,source,approval}` with bearer authorization and `Idempotency-Key: workflow-<runId>-<stepId>`. It must authenticate the server credential, enforce the owner/sender binding, and process each idempotency key exactly once. Return `{accepted:true,messageId:"durable-provider-reference"}` only after the provider accepts the message. Server requests disable redirects and time out after 15 seconds.

Provider acceptance is not proof of inbox delivery. Failed/uncertain responses retain a claimed attempt and block resending. Check the provider first; the UI can record an operator-confirmed acceptance reference without sending again. That reconciliation is labelled human-recorded, not independently verified. Inbox delivery/bounce callbacks are not yet implemented. Report schedules advance after provider acceptance. The app does not mark invoices paid or execute a bank transfer.

## Storage, limits and existing data

Definitions and checkpoint history use the account-owned Supabase JSON library under `marketingAutomations`; no migration or new package is needed. Old open browser bundles preserve this extension during sync. Generic CRM saves cannot forge run/approval state. Old browser-only automation designs remain available for export in Setup and do not run automatically for authenticated accounts.

Limits: 100 definitions, 20 steps each, 100 retained runs per definition and 2,000 event receipts. Archive finished runs to remove detailed history while preserving deduplication receipts. Receipts are never silently evicted to trigger old messages again. All account data remains subject to the existing 8 MB library limit.

## Verification

`node --test scripts/automation.test.mjs`

`node --env-file=.env.local scripts/automation-integration.mjs`

Set `AUTOMATION_TEST_LIVE=1` for a disposable synthetic invoice's actual AI reminder draft. That test never invokes email delivery, even when an adapter exists. Browser verification uses `scripts/automation-ui.mjs`. No real messages or payment actions are performed by these tests.
