-- ============================================================
-- Rabimbox – dnevni opomnik za obnovo naročnine
-- Vsak dan ob 8:00 pokliče funkcijo poslji-obvestilo (tip=obnova_batch),
-- ki pošlje e-opomnik vsem naročninam, ki se iztečejo čez 5 dni.
--
-- PRED ZAGONOM: zamenjaj <SERVICE_ROLE_KEY> s svojim service_role ključem
-- (Supabase → Project Settings → API → service_role secret).
-- Poženi v Supabase → SQL Editor.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Če že obstaja, ga najprej odstrani (da ne podvajaš)
select cron.unschedule('rabimbox-obnova-opomnik')
where exists (select 1 from cron.job where jobname = 'rabimbox-obnova-opomnik');

select cron.schedule(
  'rabimbox-obnova-opomnik',
  '0 8 * * *',
  $$
  select net.http_post(
    url     := 'https://lvfnumhirarpshpqyoay.supabase.co/functions/v1/poslji-obvestilo',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
               ),
    body    := jsonb_build_object('tip', 'obnova_batch', 'dni', 5)
  );
  $$
);

-- Preveri, da je opravilo dodano:
--   select jobname, schedule, active from cron.job;
-- Ročni test (pošlje takoj):
--   select net.http_post(
--     url := 'https://lvfnumhirarpshpqyoay.supabase.co/functions/v1/poslji-obvestilo',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <SERVICE_ROLE_KEY>'),
--     body := jsonb_build_object('tip','obnova_batch','dni',5));
