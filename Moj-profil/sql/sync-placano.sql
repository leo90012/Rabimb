-- ============================================================
-- Rabimbox – uskladi plačila: naročila s plačanim računom označi kot plačana
-- Poženi v Supabase → SQL Editor.
-- ============================================================

update public.narocila n
set placano = true
where placano is not true
  and exists (
    select 1 from public.racuni r
    where r.stevilka = n.stevilka
      and lower(coalesce(r.status, '')) like 'plac%'
  );

-- Preveri:
--   select stevilka, placano, status from public.narocila order by id desc;
