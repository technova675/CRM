# Social Media AI Agent (Section 17)

Open **Social Media** in the sidebar, or `/social`. Section 16 is unchanged.

1. Create a client under Client Management.
2. In Social Media, select the client and choose **Generate ideas**. Supply a brief, platform, Reel/Carousel/Static/Story/Text/Short format, count and optional approved Marketing Strategy. Each saved idea includes caption, hook, suggested hashtags and a production plan. This does not render images or videos.
3. Open an idea, edit its copy and asset URLs, then **Save draft**. Reopen and **Run AI review**. Review notes and scores are editorial AI opinion, with the actual provider shown.
4. **Request human approval**, then **Approve content**. Review and approval are bound to the exact copy, platform, format, brief, plan and media URLs. Editing clears both and removes the planned date.
5. Set the local planned date. Dates persist as UTC with the IANA timezone. Planning does not publish automatically. **Send to scheduler** requires an authorized server connector. The connector is responsible for platform API support, media validation and durable execution at the approved time. An accepted scheduling receipt is not proof of publication.
6. For posts published manually, explicitly confirm the live platform URL and actual publication time. The record is labelled human-reported and not independently verified. There is no simulated publish action in the new workspace.
7. Enter dated cumulative metrics in a published post. Missing counts stay unknown, true zero stays zero, and rates require a positive impressions denominator plus all engagement components. Saving replaces one snapshot; it does not append or sum overlapping snapshots. Legacy/demo metrics are excluded from new performance analysis.
8. **Listening** generates competitor, content-gap, trend, performance and next-idea sections. Pasted source observations are user-provided and unverified; connector observations include URLs and dates. Without observations the competitor/trend sections explicitly say unavailable. Conclusions are AI inference. No supplied URL is fetched by the AI endpoint itself.

Account data is persisted in the existing Supabase `crm_libraries` JSON library; no new migration is needed. Same-login laptops use that account library. The existing configured AI provider and fallback generate structured outputs. Failures preserve saved content and report an error. No local templates are presented as live research.

## Optional connector contract

Configure `SOCIAL_CONNECTOR_URL` (HTTPS base URL ending in `/`) and server-only `SOCIAL_CONNECTOR_TOKEN`. This is an adapter interface, not a native platform integration. No platform is connected merely because a local Integrations card says so. The adapter must obtain and enforce owner-scoped OAuth authorization and platform permissions; never accept `ownerId` as proof of authorization without the server bearer credential.

- `GET connections?ownerId=...` → `{connections:[{platform:"Instagram",accountName:"Client account",canSchedule:true,canResearch:false}]}`. Platforms use the exact workspace names. The server rechecks this authorization before dispatch.
- `POST research` body `{ownerId,clientId,website}` → `{evidence:[{url:"https://...",observedAt:"ISO timestamp",observation:"Sourced observation",kind:"Trend"|"Competitor"}]}`. Return real observed public facts, no invented activity or unauthorized scraping.
- `POST schedule` body `{ownerId,idempotencyKey,post,scheduledAt,timezone}` → `{providerId:"durable job id",status:"scheduled"}` only after a durable platform scheduling job is accepted. Validate supported formats, assets and destination account. Process the idempotency key exactly once. Credentials must remain inside the adapter.

All calls use `Authorization: Bearer SOCIAL_CONNECTOR_TOKEN`, disable redirects and time out after 25 seconds. Dispatch reserves a pending delivery before the external call. Failure or an uncertain receipt locks the post as unknown; inspect the actual provider job before creating another post. Automatic reconciliation/callbacks and analytics sync are not implemented; publication confirmation and metrics currently use explicit human records. There is no browser timer that claims to publish while the app is closed.

## Verification

`node --test scripts/social.test.mjs`

`node --env-file=.env.local scripts/social-integration.mjs` (disposable accounts, default development port 3011).

Set `SOCIAL_TEST_LIVE=1` to exercise the configured AI provider. No outbound posts are sent during verification.
