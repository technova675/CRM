-- Talent pool: creator and influencer applications, as collected by the earlier influencer sign-up site,
-- now owned per CRM account. Columns follow that site's public.creators table so its rows import as they are.
begin;

do $$ begin
  create type public.creator_status as enum ('pending','approved','featured','rejected','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.talent_type as enum ('influencer','creator','both','model');
exception when duplicate_object then null; end $$;
alter type public.talent_type add value if not exists 'model';

create table if not exists public.creators (
  id                            uuid primary key default gen_random_uuid(),
  owner_id                      uuid not null references auth.users(id) on delete cascade,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  full_name                     text not null check (length(trim(full_name)) between 2 and 120),
  display_name                  text,
  email                         text not null check (position('@' in email) > 1 and position('.' in split_part(email,'@',2)) > 1),
  phone                         text,
  whatsapp                      text,
  profile_photo_path            text,
  bio                           text check (bio is null or length(bio) <= 800),
  city                          text,
  state                         text,
  country                       text not null default 'India',
  languages                     text[] not null default '{}',
  primary_genre                 text not null,
  secondary_genres              text[] not null default '{}',
  content_formats               text[] not null default '{}',
  instagram_handle              text,
  youtube_handle                text,
  tiktok_handle                 text,
  x_handle                      text,
  linkedin_url                  text,
  portfolio_url                 text,
  instagram_followers           integer check (instagram_followers >= 0),
  youtube_subscribers           integer check (youtube_subscribers >= 0),
  tiktok_followers              integer check (tiktok_followers >= 0),
  x_followers                   integer check (x_followers >= 0),
  avg_reel_views                integer check (avg_reel_views >= 0),
  engagement_rate               numeric(5,2) check (engagement_rate between 0 and 100),
  verified_instagram_followers  integer check (verified_instagram_followers >= 0),
  verified_youtube_subscribers  integer check (verified_youtube_subscribers >= 0),
  verified_engagement_rate      numeric(5,2) check (verified_engagement_rate between 0 and 100),
  verified_at                   timestamptz,
  audience_female_pct           numeric(5,2) check (audience_female_pct between 0 and 100),
  audience_age_band             text,
  audience_top_cities           text[] not null default '{}',
  currency                      text not null default 'INR',
  rate_reel                     integer check (rate_reel >= 0),
  rate_story                    integer check (rate_story >= 0),
  rate_static_post              integer check (rate_static_post >= 0),
  rate_youtube_integration      integer check (rate_youtube_integration >= 0),
  rate_video                    integer check (rate_video >= 0),
  barter_open                   boolean not null default false,
  past_brands                   text[] not null default '{}',
  notable_work_urls             text[] not null default '{}',
  showcase_media_paths          text[] not null default '{}',
  status                        public.creator_status not null default 'pending',
  internal_notes                text,
  quality_score                 smallint check (quality_score between 1 and 5),
  managed_exclusively           boolean not null default false,
  talent_type                   public.talent_type not null default 'influencer',
  talent_type_changed_at        timestamptz default now(),
  turnaround_days               smallint check (turnaround_days is null or turnaround_days between 1 and 60),
  -- Kept from the sign-up form for abuse checks; the CRM never sends these to the browser.
  submitted_ip                  inet,
  submitted_user_agent          text,
  -- The CRM roster record created from this application, once someone adds it.
  roster_influencer_id          text,
  effective_followers           integer generated always as (greatest(
                                  coalesce(verified_instagram_followers, instagram_followers, 0),
                                  coalesce(verified_youtube_subscribers, youtube_subscribers, 0),
                                  coalesce(tiktok_followers, 0), coalesce(x_followers, 0))) stored,
  effective_engagement_rate     numeric(5,2) generated always as (coalesce(verified_engagement_rate, engagement_rate)) stored,
  is_verified                   boolean generated always as (verified_at is not null) stored
);

-- One application per email within an account.
create unique index if not exists creators_owner_email on public.creators (owner_id, lower(email));
create index if not exists creators_owner_status   on public.creators (owner_id, status);
create index if not exists creators_owner_created  on public.creators (owner_id, created_at desc);
create index if not exists creators_owner_genre    on public.creators (owner_id, primary_genre);
create index if not exists creators_owner_followers on public.creators (owner_id, effective_followers desc);

create or replace function public.creators_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.talent_type is distinct from old.talent_type then new.talent_type_changed_at := now(); end if;
  return new;
end $$;
drop trigger if exists creators_touch on public.creators;
create trigger creators_touch before update on public.creators for each row execute function public.creators_touch();

alter table public.creators enable row level security;
revoke all on public.creators from public, anon, authenticated;
grant select, insert, update, delete on public.creators to service_role;

notify pgrst, 'reload schema';
commit;
