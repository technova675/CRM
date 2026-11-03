# SEO Management (Section 19)

Open **Execution → SEO**, or `/seo`. Start a project for a client using its actual public website. Existing legacy records remain stored; sample metrics are not copied into the new measured workspace. Data persists in the existing account-scoped Supabase `crm_libraries` JSON library and syncs across same-login laptops. No SQL migration is required.

## Using the workspace

- **Overview:** sampled health history, measured check breakdown, daily clicks, CTR and impression-weighted average position for the selected data source and dates. Empty datasets stay unknown. Historical checklist scores are comparable only when the same pages/checks were sampled. Imported site totals and native Search Console snapshots stay separate.
- **Audit & technical:** a robots-aware, bounded HTTP/HTML check of up to three same-origin public pages. It observes HTTP status, HTTPS, title, description, H1, canonical presence, noindex directives, language, viewport and missing image alt attributes; robots/sitemap availability is also reported when accessible. This is not a complete crawl, JavaScript rendering, Core Web Vitals measurement, Google indexing test or guaranteed SEO diagnosis. No website writes occur. Marking an issue Reported resolved records task progress; it cannot improve the observed score without re-auditing.
- **Keywords & rankings:** real AI keyword hypotheses with unknown volume/difficulty, plus dated keyword/rank imports from a named source. Rankings compare only matching keyword/country/device/source contexts. A blank position is unknown; it does not mean an unranked zero. No random search volumes or difficulty scores are generated.
- **Competitors & gaps:** import competitor keyword observations. Gaps mean a term is absent from the tracked keyword library, not proven absent from the website or Google index. AI recommendations distinguish these research opportunities from measured issues.
- **Content briefs:** generate a brief from a keyword, audience and objective or write one manually. Edit title, metadata, outline, questions, internal links and suggested word count. Submit for review, approve, mark Writing and record actual publication outside the app. Editing resets the brief to Draft and clears approval. AI internal links are limited to observed site URLs.
- **Backlinks:** import linking pages, destination URLs, rel/status, observation date and source. The dashboard reports the recorded sample and referring domains, not an exhaustive index or invented toxicity score. Reimports upsert observations instead of duplicating links. History reflects the imported sample, not independently measured internet growth.
- **Search Console:** native read-only Google service-account integration and daily export import. Final web-search data uses Google's Pacific Time reporting dates. Choose up to 93 days; daily totals are fetched separately from up to 3,000 top query/page combinations. Google can omit anonymized/other queries; query rows are never summed into site totals. Native average positions are not presented as discrete SERP ranking checks.

## CSV records

Use **Import SEO data**; paste CSV or choose a file up to 600 KB / 3,000 rows per request. Dates are `YYYY-MM-DD`. Each row needs an explicit `source`. Source labels and numeric imports are user-reported and are not independently verified.

- Keywords: `keyword,volume,difficulty,intent,url,country,date,source`
- Rankings: `keyword,position,url,country,device,date,source` (`desktop`, `mobile`, `tablet`, `all`)
- Traffic: `date,clicks,impressions,position,source` (one daily site-total row; no query/page aggregation)
- Competitors: `competitor,keyword,url,position,country,date,source`
- Backlinks: `from,to,status,rel,date,source` (`Live`/`Lost`, `Follow`/`Nofollow`/`Unknown`)

Adapt vendor/Google exports to these headers before importing. Destination URLs must belong to the project website. Optional metrics can be blank. Duplicate dated traffic observations replace previous values, not add to them. AI keyword generation and manual imports work without a paid SEO data provider. Live keyword-volume, competitor-rank and backlink discovery require a provider/export; no provider is connected by a cosmetic Integrations toggle.

## Native Google Search Console setup

1. Enable the Search Console API in a Google Cloud project and create a service account.
2. Grant that service account access to the appropriate Search Console property.
3. Store its JSON credentials in server-only `GSC_SERVICE_ACCOUNT_JSON` in `.env.local` (quote/escape the JSON as required by dotenv). Do not paste the private key into chat or browser settings.
4. Set `GSC_ALLOWED_OWNER_ID` to the authenticated CRM account's Supabase user UUID. This explicit owner binding prevents other account libraries from using the agency's server credential. Restart Next.js.
5. In SEO → Search Console, select an authorized property that covers the project website and choose **Sync Search Console**. The server verifies property access and requests only the `webmasters.readonly` scope. Private keys and access tokens remain server-side and are never stored in the shared CRM library. This implements service-account authorization, not an end-user OAuth login wizard. Credentials are currently not configured in this project.

Native queries apply the project URL prefix as a page filter, including for domain properties, so another subdomain's traffic is not silently mixed into this project's dashboard.

Reference: [Google service-account authorization](https://developers.google.com/identity/protocols/oauth2/service-account), [Search Analytics query API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).

## Verification

`node --test scripts/seo.test.mjs` covers parsed evidence, missing/zero metrics, weighted position, CSV validation/upserts, contextual ranking changes and property scoping. Integration/browser tests use disposable account libraries, never publish to websites and never change Search Console settings. Native live Google sync requires the owner-bound service-account configuration above; it cannot be verified against a real property until those credentials and access exist.

The UI/UX Pro Max lookup returned no verified match for missing-data chart behavior after a focused retry. General fallback guidance was used: show unknown metrics explicitly, require actual observations for charts, preserve true zero and expose data tables alongside chart summaries.

Live AI/public-site verification passed after explicit user approval. The script used disposable synthetic accounts and a read-only example.com audit, verified real HTML observations and dated health history, generated AI keyword hypotheses with unknown volume/difficulty, created an editable AI brief and saved grounded AI recommendations. Account isolation, source-labelled imports, approval reset and same-login sharing also passed. Real client records were not used; disposable accounts were removed after the test. Native Google sync remains unverified until owner-bound service-account credentials and property access are configured.
