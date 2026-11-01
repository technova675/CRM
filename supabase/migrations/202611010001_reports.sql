-- Run once in your Supabase project's SQL Editor, or apply with `supabase db push`.
-- No existing Neon data is copied or deleted by this migration.
begin;

create table if not exists public.report_companies (
  id text primary key,
  name text not null,
  name_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.report_files (
  id text primary key,
  client_id text not null references public.report_companies(id),
  workspace_id text not null check (workspace_id ~ '^[a-f0-9]{64}$'),
  name text not null,
  kind text not null check (kind in ('excel', 'csv', 'pptx')),
  size integer not null default 0 check (size >= 0),
  uploaded_by text not null default '',
  original_base64 text,
  created_at timestamptz not null default now()
);

create table if not exists public.report_tables (
  id text primary key,
  file_id text not null references public.report_files(id) on delete cascade,
  position integer not null check (position >= 0),
  name text not null,
  columns jsonb not null check (jsonb_typeof(columns) = 'array'),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  raw_rows jsonb,
  header_row integer,
  row_count integer not null check (row_count >= 0),
  column_count integer not null check (column_count between 1 and 200),
  unique (file_id, position)
);

create index if not exists report_files_client_idx on public.report_files (client_id, created_at desc);
create index if not exists report_files_workspace_idx on public.report_files (workspace_id, created_at desc, id desc);
create index if not exists report_tables_file_idx on public.report_tables (file_id, position);

-- These tables are accessed only by Next.js server routes. Browser keys get no direct access.
alter table public.report_companies enable row level security;
alter table public.report_files enable row level security;
alter table public.report_tables enable row level security;
revoke all on public.report_companies, public.report_files, public.report_tables from public, anon, authenticated;
grant select, insert, update, delete on public.report_companies, public.report_files, public.report_tables to service_role;

create or replace function public.save_report_upload(p_workspace text, p_file_id text, p_upload jsonb)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  company_id text;
  company_name text := btrim(p_upload->>'companyName');
  item jsonb;
  sheet_position integer := 0;
begin
  if p_workspace is null or p_workspace !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid workspace' using errcode = '22023';
  end if;
  if p_file_id is null or p_file_id !~ '^rf_[a-f0-9-]{36}$' then
    raise exception 'Invalid file identifier' using errcode = '22023';
  end if;
  if company_name is null or char_length(company_name) not between 1 and 300 then
    raise exception 'Company name is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_upload->'tables') is distinct from 'array' then
    raise exception 'Tables must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_upload->'tables') not between 1 and 60 then
    raise exception 'Upload must contain 1 to 60 tables' using errcode = '22023';
  end if;

  insert into public.report_companies (id, name, name_key)
  values ('rc_' || gen_random_uuid()::text, company_name, p_workspace || ':' || lower(company_name))
  on conflict (name_key) do update set name = report_companies.name
  returning id into company_id;

  insert into public.report_files (id, client_id, workspace_id, name, kind, size, uploaded_by, original_base64)
  values (p_file_id, company_id, p_workspace, p_upload->>'name', p_upload->>'kind',
    (p_upload->>'size')::integer, coalesce(p_upload->>'uploadedBy', ''), p_upload->>'originalBase64');

  for item in select value from jsonb_array_elements(p_upload->'tables') loop
    if jsonb_typeof(item->'columns') is distinct from 'array' or jsonb_typeof(item->'rows') is distinct from 'array' then
      raise exception 'Invalid worksheet data' using errcode = '22023';
    end if;
    if jsonb_array_length(item->'columns') not between 1 and 200 or jsonb_array_length(item->'rows') > 50000 then
      raise exception 'Worksheet exceeds supported limits' using errcode = '22023';
    end if;
    insert into public.report_tables (id, file_id, position, name, columns, rows, raw_rows, header_row, row_count, column_count)
    values ('rt_' || gen_random_uuid()::text, p_file_id, sheet_position, item->>'name', item->'columns', item->'rows',
      nullif(item->'rawRows', 'null'::jsonb), (item->>'headerRow')::integer,
      jsonb_array_length(item->'rows'), jsonb_array_length(item->'columns'));
    sheet_position := sheet_position + 1;
  end loop;
  return p_file_id;
end;
$$;

revoke all on function public.save_report_upload(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_report_upload(text, text, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
