-- Return a conflict sentinel instead of a retryable SQL serialization exception.
begin;
create or replace function public.save_crm_library(p_owner uuid,p_revision bigint,p_operation uuid,p_data jsonb)
returns bigint language plpgsql security invoker set search_path='' as $$
declare result bigint;
begin
  if p_owner is null or p_operation is null or p_revision is null or p_revision<0 or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000000 then
    raise exception 'Invalid CRM library' using errcode='22023';
  end if;
  -- A retried save must never duplicate data or count as a competing device.
  select revision into result from public.crm_libraries where owner_id=p_owner and last_operation=p_operation;
  if found then return result; end if;
  if p_revision=0 then
    insert into public.crm_libraries(owner_id,revision,data,last_operation) values(p_owner,1,p_data,p_operation)
    on conflict(owner_id) do nothing returning revision into result;
  else
    update public.crm_libraries set data=p_data,revision=revision+1,last_operation=p_operation,updated_at=now()
    where owner_id=p_owner and revision=p_revision returning revision into result;
  end if;
  if result is null then return -1; end if;
  return result;
end; $$;
notify pgrst,'reload schema';
commit;
