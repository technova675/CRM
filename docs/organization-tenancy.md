# Organization tenancy

The current boundary is one owner-backed organization per Supabase agency login. The organization ID is the existing stable workspace hash derived on the server from the authenticated account. CRM library reads and compare-and-swap writes use that account UUID. Report queries use the workspace hash. Document storage paths use the account UUID. Client portal access uses its separate owner and client binding.

Application routes resolve scope from the verified session. A browser-supplied workspace ID cannot change that scope. Shared browser caches are partitioned by account. A legacy cache is copied only when its recorded owner matches the signed-in account.

## Plans and usage

New organizations start on Starter. Existing CRM libraries retain an Agency baseline until a platform operator assigns a plan. Configure `ADBIBE_TENANT_PLANS` as a JSON map from owner Supabase Auth UUID to Starter, Growth, Agency, or Enterprise. Restart the server after changes. The application exposes read-only plan assignment and an editable organization name and billing contact.

Counts apply to saved leads, clients, campaigns, generated reports and active or invited agency staff profiles. Document storage counts all stored file versions, including archived files. AI provider calls reserve one credit per metered model job, including attempts that subsequently fail. Video draft and revision requests reserve minutes based on the planned timeline duration. Monthly meters reset on the first UTC day of the month.

Enforcement uses the existing revision-based CRM save RPC. Concurrent writes must validate against the committed revision. An organization already above a limit can still edit or remove records at that usage level.

## External rollout boundaries

- Extend the audited staff routes before opening owner-only modules to staff. A future standalone membership relation can support multiple organization memberships per login.
- Move plan assignments to a subscription ledger before enabling checkout, provider webhooks, payment collection, or billing history. Billing contact is an organization profile field.
- Require each connector to authorize the organization key and isolate credentials. Existing deployment-level connectors remain dependent on their own authorization contract.
- Add transactional reservations across workbook upload paths before treating workbook uploads and document storage as one quota. Current storage limits apply to the Documents & Assets library, and the saved-report limit applies to generated records.
- A server-side video renderer would reserve processing from measured job inputs. Current video minutes meter the application's browser timeline workflow.

## Verification

Open Settings, then Plan & usage. Use separate agency accounts to verify distinct workspace IDs, profile data and usage. The integration script exercises disposable accounts, a quota conflict, and browser-cache separation.

## Shared staff access

The owner can open Team → Staff sign-in, create a 48-hour invitation, and share the resulting link privately. The recipient sets a password, then uses the regular sign-in page. Invitations create new Supabase users. An email already registered to another account requires a different invitation email.

The verified session carries the owner binding. Each staff request reloads the member and checks active status, role, and current permission overrides. Revoking access blocks subsequent requests even if the staff member retains a valid session. Staff use a separate, projected workspace for permitted leads, clients, campaigns, assigned tasks, documents, reports and invoices. Staff writes are limited to authorized lead and assigned-task status changes. Older owner routes and the full CRM snapshot reject staff sessions.

Google OAuth is optional. Enable `NEXT_PUBLIC_GOOGLE_OAUTH=true` at build time after configuring the Google provider and callback allowlist in Supabase. Sign-in and session cookies are managed by Supabase.

Settings → Security provides workspace API keys, a write-only connector vault, and signed JSON backup and restore for the workspace owner. Vault entries are encrypted with AES-256-GCM and authenticated against the owner and connector slot. The media connector uses a workspace token with the deployment-configured HTTPS endpoint. Search Console uses the workspace service account. Legacy environment credentials require the corresponding owner binding.

Set a stable server-only WORKSPACE_VAULT_KEY (32 random bytes encoded as 64 hex characters). Keep a secure offline copy. All instances serving the same project need the same key. Changing it makes previously stored credentials and signed backups unusable. Keep deployment database, storage and authentication backups separately.

Restore accepts only unmodified version 2 exports signed for the same organization. It replaces the listed CRM and analytics collections after a revision-bound preview and owner confirmation. Current access settings, vault entries, audit history, and protected workflow and delivery records stay in place. Restore pauses enabled marketing workflows and removes affected portal shares. It can disable a portal login if the client/contact no longer matches or had already been removed. Version 1 exports are readable archives and cannot be restored through this tool. File contents and separately stored records are outside the JSON restore.
