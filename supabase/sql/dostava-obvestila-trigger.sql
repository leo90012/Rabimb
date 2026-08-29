-- ============================================================
-- Rabimbox – obvesti stranko ob dostavi/prevzemu boxa
-- Ko se v skladiščni aplikaciji spremeni status škatle:
--   -> 'pri_stranki'  (dostavljeno)  => e-pošta "Boxi so dostavljeni"
--   'pri_stranki' -> 'v_skladiscu' (prevzeto) => e-pošta "Boxi so prevzeti"
-- E-pošto pošlje Edge funkcija poslji-obvestilo prek pg_net.
--
-- PRED ZAGONOM: zamenjaj <SERVICE_ROLE_KEY> s svojim service_role ključem
-- (Supabase → Project Settings → API → service_role secret).
-- Poženi v Supabase → SQL Editor.
-- ============================================================

create extension if not exists pg_net;

create or replace function public.rb_notify_box_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tip text;
  v_email text;
  v_ime text;
begin
  -- katera sprememba nas zanima
  if (new.status = 'pri_stranki' and coalesce(old.status,'') <> 'pri_stranki') then
    v_tip := 'dostava';
  elsif (new.status = 'v_skladiscu' and coalesce(old.status,'') = 'pri_stranki') then
    v_tip := 'prevzem';
  else
    return new;
  end if;

  select k.email, k.ime into v_email, v_ime
  from public.kupci k where k.id = new.kupec_id;
  if v_email is null then return new; end if;

  perform net.http_post(
    url     := 'https://lvfnumhirarpshpqyoay.supabase.co/functions/v1/poslji-obvestilo',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
               ),
    body    := jsonb_build_object('tip', v_tip, 'email', v_email, 'ime', v_ime, 'box', new.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_box_status_notify on public.skatle;
create trigger trg_box_status_notify
  after update of status on public.skatle
  for each row execute function public.rb_notify_box_status();

-- Preizkus: v Table Editorju spremeni status kakšne škatle (kupec_id z e-pošto)
-- na 'pri_stranki' -> stranka mora prejeti "Boxi so dostavljeni".
