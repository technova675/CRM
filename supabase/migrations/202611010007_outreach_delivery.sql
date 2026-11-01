begin;
create table if not exists public.outreach_deliveries (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 campaign_id text not null, lead_id text not null, step_index integer not null check(step_index between 0 and 20),
 channel text not null, content_hash text not null, status text not null check(status in ('sending','accepted','failed','unknown')),
 provider_message_id text, error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,campaign_id,lead_id,step_index)
);
create table if not exists public.outreach_events (
 event_id text primary key, delivery_id uuid not null references public.outreach_deliveries(id) on delete cascade,
 kind text not null check(kind in ('delivered','opened','replied','bounced','unsubscribed')),
 occurred_at timestamptz not null, received_at timestamptz not null default now()
);
alter table public.outreach_deliveries enable row level security;
alter table public.outreach_events enable row level security;
revoke all on public.outreach_deliveries,public.outreach_events from public,anon,authenticated;
grant select,insert,update,delete on public.outreach_deliveries,public.outreach_events to service_role;
create index if not exists outreach_delivery_owner_time on public.outreach_deliveries(owner_id,created_at);

create or replace function public.claim_outreach_delivery(p_id uuid,p_owner uuid,p_campaign text,p_lead text,p_step integer,p_channel text,p_hash text,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row public.outreach_deliveries; n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,72));
 select * into row from public.outreach_deliveries where owner_id=p_owner and campaign_id=p_campaign and lead_id=p_lead and step_index=p_step;
 if found then return jsonb_build_object('claimed',false,'delivery',to_jsonb(row)); end if;
 select count(*) into n from public.outreach_deliveries where owner_id=p_owner and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' and status in ('sending','accepted','unknown');
 if n>=least(greatest(p_limit,1),1000) then return jsonb_build_object('claimed',false,'error','Daily account delivery limit reached'); end if;
 insert into public.outreach_deliveries(id,owner_id,campaign_id,lead_id,step_index,channel,content_hash,status)
 values(p_id,p_owner,p_campaign,p_lead,p_step,p_channel,p_hash,'sending') returning * into row;
 return jsonb_build_object('claimed',true,'delivery',to_jsonb(row));
end; $$;
create or replace function public.finish_outreach_delivery(p_id uuid,p_owner uuid,p_status text,p_provider text,p_error text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_status not in ('accepted','failed','unknown') then raise exception 'Invalid delivery state'; end if;
 update public.outreach_deliveries set status=p_status,provider_message_id=coalesce(p_provider,provider_message_id),error=left(p_error,500),updated_at=now()
 where id=p_id and owner_id=p_owner and status='sending';
end; $$;
create or replace function public.record_outreach_event(p_event text,p_delivery uuid,p_kind text,p_occurred timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 insert into public.outreach_events(event_id,delivery_id,kind,occurred_at) values(p_event,p_delivery,p_kind,p_occurred) on conflict(event_id) do nothing;
 return found;
end; $$;
revoke all on function public.claim_outreach_delivery(uuid,uuid,text,text,integer,text,text,integer),public.finish_outreach_delivery(uuid,uuid,text,text,text),public.record_outreach_event(text,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_outreach_delivery(uuid,uuid,text,text,integer,text,text,integer),public.finish_outreach_delivery(uuid,uuid,text,text,text),public.record_outreach_event(text,uuid,text,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
