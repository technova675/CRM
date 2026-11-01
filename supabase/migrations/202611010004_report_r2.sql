-- Private R2 payloads; Supabase retains account ownership and small object receipts.
begin;
alter table public.report_files add column if not exists storage_backend text not null default 'supabase' check(storage_backend in ('supabase','r2'));
alter table public.report_files add column if not exists object_prefix text;
alter table public.report_transfer_sessions add column if not exists storage_backend text not null default 'supabase' check(storage_backend in ('supabase','r2'));
create table if not exists public.report_r2_parts (
  session_id uuid not null references public.report_transfer_sessions(id) on delete cascade,
  kind text not null check(kind in ('original','rows','raw')),
  table_position integer not null, part_index integer not null check(part_index>=0),
  object_key text not null, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  byte_count integer not null check(byte_count between 1 and 1100000),
  row_count integer not null check(row_count between 0 and 50000),
  primary key(session_id,kind,table_position,part_index)
);
create table if not exists public.report_r2_objects (
  file_id text not null references public.report_files(id) on delete cascade,
  table_id text references public.report_tables(id) on delete cascade,
  kind text not null check(kind in ('original','rows','raw')),
  table_position integer not null, part_index integer not null,
  object_key text not null, sha256 text not null,
  byte_count integer not null, row_count integer not null,
  primary key(file_id,kind,table_position,part_index)
);
create table if not exists public.report_r2_cleanup(prefix text primary key, created_at timestamptz not null default now());
alter table public.report_r2_parts enable row level security;
alter table public.report_r2_objects enable row level security;
alter table public.report_r2_cleanup enable row level security;
revoke all on public.report_r2_parts,public.report_r2_objects,public.report_r2_cleanup from public,anon,authenticated;
grant select,insert,update,delete on public.report_r2_parts,public.report_r2_objects,public.report_r2_cleanup to service_role;

create or replace function public.queue_report_r2_cleanup() returns trigger
language plpgsql security invoker set search_path='' as $$
declare prefix text;
begin
  if old.storage_backend='r2' then
    if tg_table_name='report_files' then prefix:=old.object_prefix;
    elsif old.completed_file_id is null then prefix:='reports/'||old.id::text||'/'; end if;
    if prefix is not null then insert into public.report_r2_cleanup(prefix) values(prefix) on conflict do nothing; end if;
  end if;
  return old;
end; $$;
drop trigger if exists report_r2_file_cleanup on public.report_files;
create trigger report_r2_file_cleanup before delete on public.report_files for each row execute function public.queue_report_r2_cleanup();
drop trigger if exists report_r2_session_cleanup on public.report_transfer_sessions;
create trigger report_r2_session_cleanup before delete on public.report_transfer_sessions for each row execute function public.queue_report_r2_cleanup();

create or replace function public.begin_r2_report_transfer(p_workspace text,p_upload jsonb,p_owner uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare sid uuid;
begin
  sid:=public.begin_report_transfer(p_workspace,p_upload,p_owner);
  update public.report_transfer_sessions set storage_backend='r2' where id=sid;
  return sid;
end; $$;

create or replace function public.put_r2_report_part(p_workspace text,p_session uuid,p_part jsonb,p_owner uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare s public.report_transfer_sessions%rowtype; k text:=p_part->>'kind';
  pos integer:=(p_part->>'tableIndex')::integer; idx integer:=(p_part->>'partIndex')::integer;
  bytes integer:=(p_part->>'bytes')::integer; nrows integer:=(p_part->>'rowCount')::integer;
  expected integer; item jsonb;
begin
  if p_owner is null or p_workspace is distinct from public.report_user_workspace(p_owner) then raise exception 'Account workspace mismatch' using errcode='42501'; end if;
  select * into s from public.report_transfer_sessions where id=p_session and owner_id=p_owner and workspace_id=p_workspace and expires_at>now() for update;
  if not found or s.completed_file_id is not null or s.storage_backend<>'r2' then raise exception 'Upload unavailable' using errcode='22023'; end if;
  if k='original' then
    expected:=ceil((s.upload->>'size')::numeric/750000)::integer;
    if pos is distinct from -1 or nrows is distinct from 0 or bytes is distinct from least(750000,(s.upload->>'size')::integer-idx*750000) then raise exception 'Invalid original receipt' using errcode='22023'; end if;
  elsif k in ('rows','raw') then
    if pos is null or pos<0 or pos>=jsonb_array_length(s.upload->'tables') or nrows is null or nrows<1 or bytes is null or bytes not between 1 and 750000 then raise exception 'Invalid sheet receipt' using errcode='22023'; end if;
    item:=s.upload->'tables'->pos;
    expected:=(item->>(case when k='rows' then 'rowParts' else 'rawParts' end))::integer;
  else raise exception 'Invalid part kind' using errcode='22023'; end if;
  if idx is null or idx<0 or idx>=expected or p_part->>'sha256' is null or p_part->>'sha256' !~ '^[a-f0-9]{64}$' or
    p_part->>'key' is distinct from 'reports/'||p_session::text||'/'||k||'/'||pos::text||'/'||idx::text||'-'||(p_part->>'sha256') then
    raise exception 'Invalid R2 object receipt' using errcode='22023';
  end if;
  insert into public.report_r2_parts(session_id,kind,table_position,part_index,object_key,sha256,byte_count,row_count)
  values(p_session,k,pos,idx,p_part->>'key',p_part->>'sha256',bytes,nrows)
  on conflict(session_id,kind,table_position,part_index) do update set object_key=excluded.object_key,sha256=excluded.sha256,byte_count=excluded.byte_count,row_count=excluded.row_count;
end; $$;

create or replace function public.complete_r2_report_transfer(p_workspace text,p_session uuid,p_owner uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare s public.report_transfer_sessions%rowtype; fid text; cid text; tid text; item jsonb;
  pos integer:=0; k text; actual bigint; populated bigint;
begin
  if p_owner is null or p_workspace is distinct from public.report_user_workspace(p_owner) then raise exception 'Account workspace mismatch' using errcode='42501'; end if;
  select * into s from public.report_transfer_sessions where id=p_session and owner_id=p_owner and workspace_id=p_workspace and expires_at>now() for update;
  if not found or s.storage_backend<>'r2' then raise exception 'Upload unavailable' using errcode='22023'; end if;
  if s.completed_file_id is not null then return s.completed_file_id; end if;
  select count(*),coalesce(sum(byte_count),0) into actual,populated from public.report_r2_parts where session_id=p_session and kind='original';
  if actual<>ceil((s.upload->>'size')::numeric/750000)::integer or populated<>(s.upload->>'size')::bigint then raise exception 'Original upload incomplete' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(s.upload->'tables') loop
    foreach k in array array['rows','raw'] loop
      select count(*),coalesce(sum(row_count),0) into actual,populated from public.report_r2_parts where session_id=p_session and table_position=pos and kind=k;
      if actual<>(item->>(case when k='rows' then 'rowParts' else 'rawParts' end))::integer or populated<>(item->>(case when k='rows' then 'rowCount' else 'rawRowCount' end))::integer then raise exception 'Worksheet upload incomplete' using errcode='22023'; end if;
    end loop;
    pos:=pos+1;
  end loop;
  insert into public.report_companies(id,name,name_key)
  values('rc_'||gen_random_uuid()::text,btrim(s.upload->>'companyName'),p_workspace||':'||lower(btrim(s.upload->>'companyName')))
  on conflict(name_key) do update set name=report_companies.name returning id into cid;
  fid:='rf_'||gen_random_uuid()::text;
  insert into public.report_files(id,client_id,workspace_id,name,kind,size,uploaded_by,owner_id,storage_backend,object_prefix)
  values(fid,cid,p_workspace,s.upload->>'name',s.upload->>'kind',(s.upload->>'size')::integer,coalesce(s.upload->>'uploadedBy',''),p_owner,'r2','reports/'||p_session::text||'/');
  insert into public.report_r2_objects(file_id,kind,table_position,part_index,object_key,sha256,byte_count,row_count)
  select fid,p.kind,p.table_position,p.part_index,p.object_key,p.sha256,p.byte_count,p.row_count from public.report_r2_parts p where p.session_id=p_session and p.kind='original';
  pos:=0;
  for item in select value from jsonb_array_elements(s.upload->'tables') loop
    tid:='rt_'||gen_random_uuid()::text;
    insert into public.report_tables(id,file_id,position,name,columns,rows,header_row,row_count,column_count,chunked,row_parts,raw_parts)
    values(tid,fid,pos,item->>'name',item->'columns','[]'::jsonb,(item->>'headerRow')::integer,(item->>'rowCount')::integer,jsonb_array_length(item->'columns'),true,(item->>'rowParts')::integer,(item->>'rawParts')::integer);
    insert into public.report_r2_objects(file_id,table_id,kind,table_position,part_index,object_key,sha256,byte_count,row_count)
    select fid,tid,p.kind,p.table_position,p.part_index,p.object_key,p.sha256,p.byte_count,p.row_count from public.report_r2_parts p where p.session_id=p_session and p.table_position=pos and p.kind in ('rows','raw');
    pos:=pos+1;
  end loop;
  update public.report_transfer_sessions set completed_file_id=fid where id=p_session;
  delete from public.report_r2_parts where session_id=p_session;
  return fid;
end; $$;
revoke all on function public.queue_report_r2_cleanup(),public.begin_r2_report_transfer(text,jsonb,uuid),public.put_r2_report_part(text,uuid,jsonb,uuid),public.complete_r2_report_transfer(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.queue_report_r2_cleanup(),public.begin_r2_report_transfer(text,jsonb,uuid),public.put_r2_report_part(text,uuid,jsonb,uuid),public.complete_r2_report_transfer(text,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
