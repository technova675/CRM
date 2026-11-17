begin;

-- Per-user overrides for the sections of the staff workspace.
-- A row means "this user always sees (allowed=true) or never sees (allowed=false) the panel".
-- No row means the user's role decides.
create table if not exists public.user_panel_access (
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  panel text not null check (panel in ('tasks','leads','clients','campaigns','documents','reports','invoices')),
  allowed boolean not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, user_id, panel)
);

-- Last heartbeat per signed-in user, used by the admin "who is active" view.
create table if not exists public.user_presence (
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('agency','staff','portal')),
  current_page text check (current_page is null or char_length(current_page) <= 200),
  last_seen_at timestamptz not null default now(),
  primary key (owner_id, user_id)
);
create index if not exists user_presence_owner_seen_idx on public.user_presence(owner_id, last_seen_at desc);

alter table public.user_panel_access enable row level security;
alter table public.user_presence enable row level security;
revoke all on public.user_panel_access from public, anon, authenticated;
revoke all on public.user_presence from public, anon, authenticated;
grant select, insert, update, delete on public.user_panel_access to service_role;
grant select, insert, update, delete on public.user_presence to service_role;

notify pgrst, 'reload schema';
commit;
