-- Campaign performance: one row per campaign, platform, day and (optionally) ad.
-- Rows used to live inside the crm_libraries JSON document; a table keeps them queryable,
-- lets them grow past the document size limit, and means a metric entry never rewrites the whole CRM.
begin;

create table if not exists public.campaign_metrics (
  owner_id     uuid        not null references auth.users(id) on delete cascade,
  -- Deterministic: sha256(campaign | platform | date | ad or "campaign"), so re-importing a day replaces it.
  id           text        not null check (char_length(id) between 1 and 250),
  campaign_id  text        not null check (char_length(campaign_id) between 1 and 150),
  platform     text        not null check (char_length(platform) between 1 and 100),
  metric_date  date        not null,
  ad_id        text        check (ad_id is null or char_length(ad_id) <= 200),
  ad_name      text        check (ad_name is null or char_length(ad_name) <= 500),
  -- Null means "not reported", never zero.
  spend        numeric(16,2) check (spend is null or spend >= 0),
  impressions  bigint      check (impressions is null or impressions >= 0),
  reach        bigint      check (reach is null or reach >= 0),
  clicks       bigint      check (clicks is null or clicks >= 0),
  leads        bigint      check (leads is null or leads >= 0),
  conversions  numeric(16,2) check (conversions is null or conversions >= 0),
  revenue      numeric(16,2) check (revenue is null or revenue >= 0),
  frequency    numeric(10,4) check (frequency is null or frequency >= 0),
  source       text        not null check (source in ('Manual entry','CSV import','Platform sync')),
  entered_by   uuid,
  imported_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (owner_id, id)
);

create index if not exists campaign_metrics_campaign_date on public.campaign_metrics (owner_id, campaign_id, metric_date);

-- Server-only, like the other CRM tables: the app reads and writes through its API with the service key.
alter table public.campaign_metrics enable row level security;
revoke all on public.campaign_metrics from public, anon, authenticated;
grant select, insert, update, delete on public.campaign_metrics to service_role;

notify pgrst, 'reload schema';
commit;
