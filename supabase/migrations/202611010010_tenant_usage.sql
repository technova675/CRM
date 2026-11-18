begin;

-- Monthly usage counters (AI credits, video minutes) per workspace.
-- Kept outside crm_libraries so that an AI call never changes the CRM revision:
-- otherwise every AI request looks like an edit from another device.
create table if not exists public.tenant_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  ai_credits numeric not null default 0 check (ai_credits >= 0),
  video_minutes numeric not null default 0 check (video_minutes >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, period)
);

-- Atomically adds usage. Returns the new total, or -1 when the addition would exceed p_limit
-- (p_limit < 0 means unlimited). Concurrent requests from several devices cannot overshoot.
create or replace function public.reserve_tenant_usage(p_owner uuid, p_period text, p_key text, p_amount numeric, p_limit numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  current_total numeric;
begin
  if p_key not in ('aiCredits', 'videoMinutes') or p_amount is null or p_amount <= 0 then
    raise exception 'Invalid usage reservation' using errcode = '22023';
  end if;
  insert into public.tenant_usage (owner_id, period) values (p_owner, p_period)
    on conflict (owner_id, period) do nothing;
  select case when p_key = 'aiCredits' then ai_credits else video_minutes end into current_total
    from public.tenant_usage where owner_id = p_owner and period = p_period for update;
  if p_limit >= 0 and current_total + p_amount > p_limit then
    return -1;
  end if;
  if p_key = 'aiCredits' then
    update public.tenant_usage set ai_credits = ai_credits + p_amount, updated_at = now() where owner_id = p_owner and period = p_period;
  else
    update public.tenant_usage set video_minutes = video_minutes + p_amount, updated_at = now() where owner_id = p_owner and period = p_period;
  end if;
  return current_total + p_amount;
end;
$$;

alter table public.tenant_usage enable row level security;
revoke all on public.tenant_usage from public, anon, authenticated;
grant select, insert, update, delete on public.tenant_usage to service_role;
revoke all on function public.reserve_tenant_usage(uuid, text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.reserve_tenant_usage(uuid, text, text, numeric, numeric) to service_role;

notify pgrst, 'reload schema';
commit;
