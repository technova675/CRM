-- Allow PDF reports. Run in the Supabase SQL Editor after the earlier migrations; safe to run again.
begin;

alter table public.report_files drop constraint if exists report_files_kind_check;
alter table public.report_files add constraint report_files_kind_check check (kind in ('excel', 'csv', 'pptx', 'pdf'));

create or replace function public.begin_report_transfer(p_workspace text, p_upload jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare session_id uuid; item jsonb;
begin
  if p_workspace is null or p_workspace !~ '^[a-f0-9]{64}$' or
     coalesce((p_upload->>'size')::bigint, 0) not between 1 and 200000000 or
     coalesce(char_length(btrim(p_upload->>'companyName')), 0) not between 1 and 300 or
     coalesce(char_length(p_upload->>'name'), 0) not between 1 and 300 or
     coalesce(p_upload->>'kind', '') not in ('excel','csv','pptx','pdf') or
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

notify pgrst, 'reload schema';
commit;
