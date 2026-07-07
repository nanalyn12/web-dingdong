create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dingdong-reengagement-push') then
    perform cron.unschedule('dingdong-reengagement-push');
  end if;
end$$;

select cron.schedule(
  'dingdong-reengagement-push',
  '0 9 * * *',
  $cron$
  select net.http_post(
    url := coalesce(current_setting('app.settings.site_url', true), '') || '/api/public/hooks/reengagement-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', coalesce(current_setting('app.settings.publishable_key', true), '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);