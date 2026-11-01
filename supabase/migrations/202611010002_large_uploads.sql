-- 200 MB originals and worksheet data transferred in bounded, idempotent requests.
begin;
alter table public.report_tables add column if not exists chunked boolean not null default false;
alter table public.report_tables add column if not exists row_parts integer not null default 0;
alter table public.report_tables add column if not exists raw_parts integer not null default 0;

create table if not exists public.report_transfer_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null check (workspace_id ~ '^[a-f0-9]{64}$'),
  upload jsonb not null,
  completed_file_id text,
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists report_transfer_expiry_idx on public.report_transfer_sessions(expires_at);
create table if not exists public.report_transfer_parts (
  session_id uuid not null references public.report_transfer_sessions(id) on delete cascade,
  kind text not null check (kind in ('original','rows','raw')),
  table_position integer not null,
  part_index integer not null check (part_index >= 0),
  payload jsonb not null,
  byte_count integer not null,
  primary key (session_id, kind, table_position, part_index)
);
create table if not exists public.report_original_parts (
  file_id text not null references public.report_files(id) on delete cascade,
  part_index integer not null,
  data text not null,
  byte_count integer not null,
  primary key (file_id, part_index)
);
create table if not exists public.report_table_parts (
  file_id text not null references public.report_files(id) on delete cascade,
  table_id text not null references public.report_tables(id) on delete cascade,
  kind text not null check (kind in ('rows','raw')),
  part_index integer not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'array'),
  primary key (table_id, kind, part_index)
);
create index if not exists report_table_parts_file_idx on public.report_table_parts(file_id);
alter table public.report_transfer_sessions enable row level security;
alter table public.report_transfer_parts enable row level security;
alter table public.report_original_parts enable row level security;
alter table public.report_table_parts enable row level security;
revoke all on public.report_transfer_sessions, public.report_transfer_parts, public.report_original_parts, public.report_table_parts from public, anon, authenticated;
grant select, insert, update, delete on public.report_transfer_sessions, public.report_transfer_parts, public.report_original_parts, public.report_table_parts to service_role;

create or replace function public.begin_report_transfer(p_workspace text, p_upload jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare session_id uuid; item jsonb;
begin
  if p_workspace is null or p_workspace !~ '^[a-f0-9]{64}$' or
     coalesce((p_upload->>'size')::bigint, 0) not between 1 and 200000000 or
     coalesce(char_length(btrim(p_upload->>'companyName')), 0) not between 1 and 300 or
     coalesce(char_length(p_upload->>'name'), 0) not between 1 and 300 or
     coalesce(p_upload->>'kind', '') not in ('excel','csv','pptx') or
     jsonb_typeof(p_upload->'tables') is distinct from 'array' then
    raise exception 'Invalid upload metadata or file exceeds 200 MB' using errcode = '22023';
  end if;
  if jsonb_array_length(p_upload->'tables') not between 1 and 60 then
    raise exception 'Invalid sheet count' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_upload->'tables') loop
    if jsonb_typeof(item->'columns') is distinct from 'array' then
      raise exception 'Invalid columns' using errcode = '22023';
    end if;
    if jsonb_array_length(item->'columns') not between 1 and 200 or
       coalesce(char_length(item->>'name'),0) not between 1 and 300 or
       coalesce((item->>'rowCount')::integer,-1) not between 0 and 50000 or
       coalesce((item->>'rawRowCount')::integer,-1) not between 0 and 50000 or
       coalesce((item->>'rowParts')::integer,-1) not between 0 and (item->>'rowCount')::integer or
       coalesce((item->>'rawParts')::integer,-1) not between 0 and (item->>'rawRowCount')::integer or
       ((item->>'rowCount')::integer > 0 and (item->>'rowParts')::integer = 0) or
       ((item->>'rawRowCount')::integer > 0 and (item->>'rawParts')::integer = 0) then
      raise exception 'Invalid sheet limits' using errcode = '22023';
    end if;
  end loop;
  -- Remove abandoned staging data after 24 hours, on the next upload. Saved reports are untouched.
  delete from public.report_transfer_sessions where expires_at < now();
  insert into public.report_transfer_sessions(workspace_id, upload) values(p_workspace,p_upload) returning id into session_id;
  return session_id;
end;
$$;

create or replace function public.put_report_transfer_part(p_workspace text, p_session uuid, p_part jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare session public.report_transfer_sessions%rowtype; part_kind text := p_part->>'kind';
  sheet integer := (p_part->>'tableIndex')::integer; idx integer := (p_part->>'partIndex')::integer;
  bytes integer; expected integer; item jsonb;
begin
  select * into session from public.report_transfer_sessions where id=p_session and workspace_id=p_workspace and expires_at>now() for update;
  if not found or session.completed_file_id is not null then raise exception 'Upload session unavailable' using errcode='22023'; end if;
  if part_kind='original' then
    expected := ceil((session.upload->>'size')::numeric / 750000)::integer;
    if sheet is distinct from -1 or jsonb_typeof(p_part->'payload') is distinct from 'string' then raise exception 'Invalid original chunk' using errcode='22023'; end if;
    bytes := octet_length(decode(p_part->>'payload','base64'));
    if bytes <> least(750000, (session.upload->>'size')::integer - coalesce(idx,-1)*750000) then raise exception 'Original chunk size mismatch' using errcode='22023'; end if;
  elsif part_kind in ('rows','raw') then
    if sheet is null or sheet < 0 or sheet >= jsonb_array_length(session.upload->'tables') or jsonb_typeof(p_part->'payload') is distinct from 'array' then raise exception 'Invalid worksheet chunk' using errcode='22023'; end if;
    item := session.upload->'tables'->sheet;
    expected := (item->>(case when part_kind='rows' then 'rowParts' else 'rawParts' end))::integer;
    bytes := octet_length((p_part->'payload')::text);
    -- JSONB adds whitespace when serialized; transport itself is bounded to 1.1 MB by the API.
    if bytes > 1100000 or jsonb_array_length(p_part->'payload') < 1 or exists (
      select 1 from jsonb_array_elements(p_part->'payload') r where jsonb_typeof(r) <> 'array'
    ) then raise exception 'Invalid row data' using errcode='22023'; end if;
  else raise exception 'Invalid chunk kind' using errcode='22023'; end if;
  if idx is null or idx < 0 or idx >= expected then raise exception 'Unexpected chunk index' using errcode='22023'; end if;
  insert into public.report_transfer_parts(session_id,kind,table_position,part_index,payload,byte_count)
  values(p_session,part_kind,sheet,idx,p_part->'payload',bytes)
  on conflict(session_id,kind,table_position,part_index) do update set payload=excluded.payload, byte_count=excluded.byte_count;
end;
$$;

create or replace function public.complete_report_transfer(p_workspace text, p_session uuid)
returns text language plpgsql security invoker set search_path = '' set statement_timeout = '120s' as $$
declare session public.report_transfer_sessions%rowtype; file_id text; company_id text;
  item jsonb; sheet integer := 0; table_id text; expected integer; actual bigint; populated bigint; part_kind text;
begin
  select * into session from public.report_transfer_sessions where id=p_session and workspace_id=p_workspace and expires_at>now() for update;
  if not found then raise exception 'Upload session unavailable' using errcode='22023'; end if;
  if session.completed_file_id is not null then return session.completed_file_id; end if;
  select count(*), coalesce(sum(byte_count),0) into actual,populated from public.report_transfer_parts where session_id=p_session and kind='original';
  if actual <> ceil((session.upload->>'size')::numeric / 750000)::integer or populated <> (session.upload->>'size')::bigint then raise exception 'Original upload incomplete' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(session.upload->'tables') loop
    foreach part_kind in array array['rows','raw'] loop
      expected := (item->>(case when part_kind='rows' then 'rowParts' else 'rawParts' end))::integer;
      select count(*),coalesce(sum(jsonb_array_length(p.payload)),0) into actual,populated
      from public.report_transfer_parts p where p.session_id=p_session and p.table_position=sheet and p.kind=part_kind;
      if actual <> expected or populated <> (item->>(case when part_kind='rows' then 'rowCount' else 'rawRowCount' end))::integer then raise exception 'Worksheet upload incomplete' using errcode='22023'; end if;
    end loop;
    sheet := sheet+1;
  end loop;
  insert into public.report_companies(id,name,name_key)
  values('rc_'||gen_random_uuid()::text,btrim(session.upload->>'companyName'),p_workspace||':'||lower(btrim(session.upload->>'companyName')))
  on conflict(name_key) do update set name=report_companies.name returning id into company_id;
  file_id := 'rf_'||gen_random_uuid()::text;
  insert into public.report_files(id,client_id,workspace_id,name,kind,size,uploaded_by)
  values(file_id,company_id,p_workspace,session.upload->>'name',session.upload->>'kind',(session.upload->>'size')::integer,coalesce(session.upload->>'uploadedBy',''));
  insert into public.report_original_parts(file_id,part_index,data,byte_count)
  select file_id,p.part_index,p.payload#>>'{}',p.byte_count from public.report_transfer_parts p where p.session_id=p_session and p.kind='original';
  sheet := 0;
  for item in select value from jsonb_array_elements(session.upload->'tables') loop
    table_id := 'rt_'||gen_random_uuid()::text;
    insert into public.report_tables(id,file_id,position,name,columns,rows,header_row,row_count,column_count,chunked,row_parts,raw_parts)
    values(table_id,file_id,sheet,item->>'name',item->'columns','[]'::jsonb,(item->>'headerRow')::integer,
      (item->>'rowCount')::integer,jsonb_array_length(item->'columns'),true,(item->>'rowParts')::integer,(item->>'rawParts')::integer);
    insert into public.report_table_parts(file_id,table_id,kind,part_index,payload)
    select file_id,table_id,p.kind,p.part_index,p.payload from public.report_transfer_parts p where p.session_id=p_session and p.table_position=sheet and p.kind in ('rows','raw');
    sheet := sheet+1;
  end loop;
  update public.report_transfer_sessions set completed_file_id=file_id where id=p_session;
  delete from public.report_transfer_parts where session_id=p_session;
  return file_id;
end;
$$;

create or replace function public.cancel_report_transfer(p_workspace text, p_session uuid)
returns void language sql security invoker set search_path = '' as $$
  delete from public.report_transfer_sessions where id=p_session and workspace_id=p_workspace and completed_file_id is null;
$$;
revoke all on function public.begin_report_transfer(text,jsonb), public.put_report_transfer_part(text,uuid,jsonb), public.complete_report_transfer(text,uuid), public.cancel_report_transfer(text,uuid) from public,anon,authenticated;
grant execute on function public.begin_report_transfer(text,jsonb), public.put_report_transfer_part(text,uuid,jsonb), public.complete_report_transfer(text,uuid), public.cancel_report_transfer(text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
