begin;

-- Client portal users can also have sections hidden by the owner, so allow those panel names too.
alter table public.user_panel_access drop constraint if exists user_panel_access_panel_check;
alter table public.user_panel_access add constraint user_panel_access_panel_check check (panel in (
  'tasks','leads','clients','campaigns','documents','reports','invoices',
  'performance','creatives','meetings','messages'
));

notify pgrst, 'reload schema';
commit;
