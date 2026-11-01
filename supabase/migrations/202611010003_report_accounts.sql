-- Verified Supabase users get a stable report workspace across devices.
-- Browser uploads are moved only after their cookie holder explicitly claims them.
begin;
alter table public.report_files add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.report_transfer_sessions add column if not exists owner_id uuid references auth.users(id) on delete cascade;
create index if not exists report_files_owner_idx on public.report_files(owner_id, created_at desc);
create table if not exists public.report_legacy_claims (
  workspace_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
);
alter table public.report_legacy_claims enable row level security;
revoke all on public.report_legacy_claims from public, anon, authenticated;
grant select, insert, update, delete on public.report_legacy_claims to service_role;

create or replace function public.report_user_workspace(p_user uuid)
returns text language sql immutable strict security invoker set search_path = '' as $$
  select encode(sha256(convert_to('adbibe-report-user:' || p_user::text, 'UTF8')), 'hex');
$$;

create or replace function public.save_report_upload(p_workspace text, p_file_id text, p_upload jsonb, p_owner uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare saved_id text;
begin
  if p_owner is null or p_workspace is distinct from public.report_user_workspace(p_owner) then raise exception 'Account workspace mismatch' using errcode='42501'; end if;
  saved_id := public.save_report_upload(p_workspace,p_file_id,p_upload);
  update public.report_files set owner_id=p_owner where id=saved_id and workspace_id=p_workspace;
  return saved_id;
end;
$$;

create or replace function public.begin_report_transfer(p_workspace text, p_upload jsonb, p_owner uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare session_id uuid;
begin
  if p_owner is null or p_workspace is distinct from public.report_user_workspace(p_owner) then raise exception 'Account workspace mismatch' using errcode='42501'; end if;
  session_id := public.begin_report_transfer(p_workspace,p_upload);
  update public.report_transfer_sessions set owner_id=p_owner where id=session_id;
  return session_id;
end;
$$;

create or replace function public.put_report_transfer_part(p_workspace text, p_session uuid, p_part jsonb, p_owner uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_owner is null or p_workspace is distinct from public.report_user_workspace(p_owner) or not exists (
    select 1 from public.report_transfer_sessions s where s.id=p_session and s.owner_id=p_owner
  ) then raise exception 'Upload is not owned by this account' using errcode='42501'; end if;
  perform public.put_report_transfer_part(p_workspace,p_session,p_part);
end;
$$;

create or replace function public.complete_report_transfer(p_workspace text, p_session uuid, p_owner uuid)
returns text language plpgsql security invoker set search_path = '' set statement_timeout='120s' as $$
declare saved_id text;
begin
  if p_owner is null or p_workspace is distinct from public.report_user_workspace(p_owner) or not exists (
    select 1 from public.report_transfer_sessions s where s.id=p_session and s.owner_id=p_owner
  ) then raise exception 'Upload is not owned by this account' using errcode='42501'; end if;
  saved_id := public.complete_report_transfer(p_workspace,p_session);
  update public.report_files set owner_id=p_owner where id=saved_id and workspace_id=p_workspace;
  return saved_id;
end;
$$;

create or replace function public.cancel_report_transfer(p_workspace text, p_session uuid, p_owner uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_owner is null or p_workspace is distinct from public.report_user_workspace(p_owner) or not exists (
    select 1 from public.report_transfer_sessions s where s.id=p_session and s.owner_id=p_owner
  ) then raise exception 'Upload is not owned by this account' using errcode='42501'; end if;
  perform public.cancel_report_transfer(p_workspace,p_session);
end;
$$;

create or replace function public.claim_browser_reports(p_owner uuid, p_legacy_workspace text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare target_workspace text; claimant uuid; company record; new_company text; linked integer := 0; affected integer;
begin
  if p_owner is null or p_legacy_workspace is null or p_legacy_workspace !~ '^[a-f0-9]{64}$' then raise exception 'Invalid browser workspace' using errcode='22023'; end if;
  target_workspace := public.report_user_workspace(p_owner);
  if target_workspace=p_legacy_workspace then return 0; end if;
  insert into public.report_legacy_claims(workspace_id,owner_id) values(p_legacy_workspace,p_owner)
  on conflict(workspace_id) do nothing;
  select owner_id into claimant from public.report_legacy_claims where workspace_id=p_legacy_workspace for update;
  if claimant is distinct from p_owner then raise exception 'Browser reports are already linked to another account' using errcode='42501'; end if;
  for company in select distinct c.id,c.name from public.report_companies c join public.report_files f on f.client_id=c.id
    where f.workspace_id=p_legacy_workspace and f.owner_id is null
  loop
    insert into public.report_companies(id,name,name_key)
    values('rc_'||gen_random_uuid()::text,company.name,target_workspace||':'||lower(company.name))
    on conflict(name_key) do update set name=report_companies.name returning id into new_company;
    update public.report_files set workspace_id=target_workspace,owner_id=p_owner,client_id=new_company
      where workspace_id=p_legacy_workspace and owner_id is null and client_id=company.id;
    get diagnostics affected = row_count;
    linked := linked+affected;
    delete from public.report_companies c where c.id=company.id and not exists(select 1 from public.report_files f where f.client_id=c.id);
  end loop;
  update public.report_transfer_sessions s set workspace_id=target_workspace,owner_id=p_owner
    where s.workspace_id=p_legacy_workspace and s.completed_file_id in (select f.id from public.report_files f where f.owner_id=p_owner);
  return linked;
end;
$$;

revoke all on function public.report_user_workspace(uuid), public.save_report_upload(text,text,jsonb,uuid),
  public.begin_report_transfer(text,jsonb,uuid), public.put_report_transfer_part(text,uuid,jsonb,uuid),
  public.complete_report_transfer(text,uuid,uuid), public.cancel_report_transfer(text,uuid,uuid),
  public.claim_browser_reports(uuid,text) from public,anon,authenticated;
grant execute on function public.report_user_workspace(uuid), public.save_report_upload(text,text,jsonb,uuid),
  public.begin_report_transfer(text,jsonb,uuid), public.put_report_transfer_part(text,uuid,jsonb,uuid),
  public.complete_report_transfer(text,uuid,uuid), public.cancel_report_transfer(text,uuid,uuid),
  public.claim_browser_reports(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
