-- ============================================================
--  RABIMBOX – Integracija spletne strani in skladiščne aplikacije
--  Točke 1, 2 in 3 iz INTEGRACIJA-SKLADISCE.md
--
--  Zaženi v Supabase: Dashboard -> SQL Editor -> prilepi -> Run
--  Skripta je varna za večkraten zagon (idempotentna).
-- ============================================================


-- ============================================================
--  DEL 2) POENOTENJE STATUSOV  (najprej, ker od tega je odvisno ostalo)
-- ============================================================

-- ------------------------------------------------------------
-- 2a) Statusi škatel – uradni slovar
--     na_zalogi | rezervirana | v_transportu | pri_stranki
--     v_skladiscu | poskodovana | umaknjena
--     ("zasedena" opuščena – podvaja "pri_stranki")
-- ------------------------------------------------------------
update public.skatle set status = 'pri_stranki' where lower(status) in ('zasedena','zaseden','zasedeno');
update public.skatle set status = 'na_zalogi'   where lower(status) in ('prost','prosta','prosto','free');
update public.skatle set status = 'v_skladiscu' where lower(status) in ('skladisce','skladišče','v skladiscu','v skladišču');
update public.skatle set status = 'v_transportu' where lower(status) in ('dostava','v dostavi','transport');
update public.skatle set status = 'pri_stranki' where lower(status) in ('izposoja','izposojena','pri kupcu');
update public.skatle set status = 'na_zalogi'   where status is null or btrim(status) = '';

alter table public.skatle drop constraint if exists skatle_status_chk;
alter table public.skatle add constraint skatle_status_chk
  check (status in ('na_zalogi','rezervirana','v_transportu','pri_stranki','v_skladiscu','poskodovana','umaknjena'));

-- ------------------------------------------------------------
-- 2b) Statusi naročnin: aktivna | pavza | zakljucena | preklicana
-- ------------------------------------------------------------
update public.narocnine set status = 'aktivna'    where lower(status) like 'aktiv%';
update public.narocnine set status = 'zakljucena' where lower(status) like 'zaklju%' or lower(status) like 'konc%';
update public.narocnine set status = 'preklicana' where lower(status) like 'preklic%';
update public.narocnine set status = 'pavza'      where lower(status) like 'pavz%' or lower(status) like 'zamrz%';

alter table public.narocnine drop constraint if exists narocnine_status_chk;
alter table public.narocnine add constraint narocnine_status_chk
  check (status in ('aktivna','pavza','zakljucena','preklicana'));

-- ------------------------------------------------------------
-- 2c) Statusi zahtev za dostavo: nova | potrjena | v_izvajanju | zakljucena | preklicana
-- ------------------------------------------------------------
update public.zahteve_dostave set status = 'nova'        where status is null or lower(status) in ('nova','novo','caka','čaka');
update public.zahteve_dostave set status = 'potrjena'    where lower(status) like 'potrj%';
update public.zahteve_dostave set status = 'v_izvajanju' where lower(status) like 'v izvaj%' or lower(status) like 'obdel%';
update public.zahteve_dostave set status = 'zakljucena'  where lower(status) like 'zaklju%' or lower(status) like 'dostavlj%' or lower(status) like 'opravlj%';
update public.zahteve_dostave set status = 'preklicana'  where lower(status) like 'preklic%' or lower(status) like 'zavrn%';

alter table public.zahteve_dostave drop constraint if exists zd_status_chk;
alter table public.zahteve_dostave add constraint zd_status_chk
  check (status in ('nova','potrjena','v_izvajanju','zakljucena','preklicana'));

-- ------------------------------------------------------------
-- 2d) Statusi naročil iz checkouta: novo | potrjeno | v_izvajanju | zakljuceno | preklicano
--     (plačilo je ločen boolean stolpec "placano", ne status!)
-- ------------------------------------------------------------
update public.narocila set status = 'novo'        where status is null or lower(status) in ('novo','nova');
update public.narocila set status = 'potrjeno'    where lower(status) like 'potrj%';
update public.narocila set status = 'v_izvajanju' where lower(status) like 'v izvaj%' or lower(status) like 'obdel%';
update public.narocila set status = 'zakljuceno'  where lower(status) like 'zaklju%';
update public.narocila set status = 'preklicano'  where lower(status) like 'preklic%';

alter table public.narocila drop constraint if exists narocila_status_chk;
alter table public.narocila add constraint narocila_status_chk
  check (status in ('novo','potrjeno','v_izvajanju','zakljuceno','preklicano'));

-- ------------------------------------------------------------
-- 2e) status_narocnine v tabeli kupci (bila mešanica "aktivna"/"Neaktiven")
-- ------------------------------------------------------------
update public.kupci set status_narocnine = 'aktivna'   where lower(status_narocnine) like 'aktiv%';
update public.kupci set status_narocnine = 'neaktivna' where lower(status_narocnine) like 'neaktiv%';
update public.kupci set status_narocnine = 'preklicana' where lower(status_narocnine) like 'preklic%';


-- ============================================================
--  DEL 3) DATUMI NAROČNINE – EN VIR RESNICE (narocnine.datum_od / datum_do)
-- ============================================================

-- ------------------------------------------------------------
-- 3a) Trajanje glede na tip storitve:
--     izposoja      -> 1 mesec
--     skladiscenje  -> 3 mesece (minimalno obdobje po ceniku)
-- ------------------------------------------------------------
create or replace function public.rb_trajanje(p_tip text)
returns interval
language sql
immutable
as $$
  select case when lower(coalesce(p_tip,'')) like 'sklad%'
              then interval '3 months'
              else interval '1 month' end;
$$;

-- ------------------------------------------------------------
-- 3b) Ob vpisu/posodobitvi naročnine samodejno izpolni datum_od in datum_do
-- ------------------------------------------------------------
create or replace function public.rb_narocnina_datumi()
returns trigger
language plpgsql
as $$
begin
  if new.datum_od is null then
    new.datum_od := coalesce(
      (select n.datum_dostave from public.narocila n where n.id = new.narocilo_id),
      current_date
    );
  end if;
  if new.datum_do is null then
    new.datum_do := (new.datum_od + public.rb_trajanje(new.tip))::date;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_narocnina_datumi on public.narocnine;
create trigger trg_narocnina_datumi
  before insert or update on public.narocnine
  for each row execute function public.rb_narocnina_datumi();

-- ------------------------------------------------------------
-- 3c) Dopolni obstoječe naročnine, ki nimajo datum_do
-- ------------------------------------------------------------
update public.narocnine
set datum_od = coalesce(datum_od, (select n.datum_dostave from public.narocila n where n.id = narocnine.narocilo_id), current_date)
where datum_od is null;

update public.narocnine
set datum_do = (datum_od + public.rb_trajanje(tip))::date
where datum_do is null;

-- ------------------------------------------------------------
-- 3d) kupci.datum_zacetka/konca_narocnine sta odslej samo ODSEV
--     najbolj aktualne naročnine (za nazaj združljivost).
--     Pravi vir je vedno tabela narocnine.
-- ------------------------------------------------------------
create or replace function public.rb_sync_kupec_narocnina()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_kupec bigint;
begin
  v_kupec := coalesce(new.kupec_id, old.kupec_id);
  if v_kupec is null then return coalesce(new, old); end if;

  update public.kupci k
  set datum_zacetka_narocnine = s.od,
      datum_konca_narocnine   = s.do_,
      status_narocnine        = case when s.aktivnih > 0 then 'aktivna' else 'neaktivna' end
  from (
    select min(datum_od) filter (where status = 'aktivna') as od,
           max(datum_do) filter (where status = 'aktivna') as do_,
           count(*)      filter (where status = 'aktivna') as aktivnih
    from public.narocnine where kupec_id = v_kupec
  ) s
  where k.id = v_kupec;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_kupec_narocnina on public.narocnine;
create trigger trg_sync_kupec_narocnina
  after insert or update or delete on public.narocnine
  for each row execute function public.rb_sync_kupec_narocnina();

-- Enkratna uskladitev za obstoječe stranke
update public.kupci k
set datum_zacetka_narocnine = s.od,
    datum_konca_narocnine   = s.do_,
    status_narocnine        = case when s.aktivnih > 0 then 'aktivna' else 'neaktivna' end
from (
  select kupec_id,
         min(datum_od) filter (where status = 'aktivna') as od,
         max(datum_do) filter (where status = 'aktivna') as do_,
         count(*)      filter (where status = 'aktivna') as aktivnih
  from public.narocnine group by kupec_id
) s
where k.id = s.kupec_id;

-- ------------------------------------------------------------
-- 3e) Pogled za stranko: škatla + datum veljavnosti njene naročnine
--     (panel bere od tod namesto iz kupci.datum_konca_narocnine)
-- ------------------------------------------------------------
create or replace view public.moje_skatle as
select s.id, s.kupec_id, s.barkoda, s.velikost, s.status, s.lokacija,
       s.tip_storitve, s.narocnina_id, s.opomba, s.updated_at,
       n.datum_od   as narocnina_od,
       n.datum_do   as narocnina_do,
       n.status     as narocnina_status
from public.skatle s
left join public.narocnine n on n.id = s.narocnina_id;

alter view public.moje_skatle set (security_invoker = on);
grant select on public.moje_skatle to authenticated;


-- ============================================================
--  DEL 1) SKLADIŠČNIK VIDI NAROČILA STRANK
--  Nove RPC funkcije po vzoru obstoječih sklad_* (SECURITY DEFINER + is_staff)
-- ============================================================

-- ------------------------------------------------------------
-- 1a) Združen delovni seznam: naročila iz checkouta + zahteve iz panela
--     vir = 'narocilo' | 'zahteva'
-- ------------------------------------------------------------
create or replace function public.sklad_zahteve(p_offset int default 0, p_limit int default 1000)
returns table (
  id              bigint,
  vir             text,
  stevilka        text,
  vrsta           text,
  status          text,
  placano         boolean,
  kupec_id        bigint,
  kupec           text,
  stevilka_stranke text,
  kupec_email     text,
  telefon         text,
  st_boxov        int,
  naslov          text,
  postna_stevilka text,
  mesto           text,
  datum_dostave   date,
  cas_dostave     text,
  opomba          text,
  stopnice        boolean,
  pomoc_polnjenje boolean,
  ustvarjeno      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with zdruzeno as (
    -- naročila iz spletne strani (checkout)
    select n.id,
           'narocilo'::text as vir,
           n.stevilka,
           coalesce(n.paket, n.tip)                       as vrsta,
           n.status,
           n.placano,
           n.kupec_id,
           btrim(coalesce(n.ime,'') || ' ' || coalesce(n.priimek,'')) as kupec,
           k.stevilka_stranke,
           n.email                                        as kupec_email,
           n.telefon,
           n.st_boxov::int,
           btrim(coalesce(n.naslov,'') || case when coalesce(n.enota,'') <> '' then ', enota ' || n.enota else '' end) as naslov,
           n.postna_stevilka,
           n.mesto,
           n.datum_dostave::date,
           n.cas_dostave::text,
           n.opis_lokacije                                as opomba,
           n.stopnice,
           n.pomoc_polnjenje,
           n.created_at                                   as ustvarjeno
    from public.narocila n
    left join public.kupci k on k.id = n.kupec_id

    union all

    -- zahteve za dostavo/prevzem iz panela "Moj profil"
    select z.id,
           'zahteva'::text,
           null::text,
           coalesce(split_part(z.opomba, ' - ', 1), 'Zahteva')  as vrsta,
           z.status,
           null::boolean,
           z.kupec_id,
           btrim(coalesce(k.ime,'') || ' ' || coalesce(k.priimek,'')),
           k.stevilka_stranke,
           k.email,
           k.telefon,
           (select count(*)::int from public.zahteve_dostave_skatle zs where zs.zahteva_id = z.id),
           btrim(coalesce(k.naslov,'')),
           k.postna_stevilka,
           k.kraj,
           z.datum_dostave::date,
           null::text,
           z.opomba,
           null::boolean,
           null::boolean,
           z.datum_zahteve
    from public.zahteve_dostave z
    left join public.kupci k on k.id = z.kupec_id
  )
  select * from zdruzeno
  where public.is_staff()
  order by (status in ('zakljucena','zakljuceno','preklicana','preklicano')),  -- odprte najprej
           datum_dostave nulls last, ustvarjeno desc
  offset p_offset limit p_limit;
$$;

revoke all on function public.sklad_zahteve(int,int) from public, anon;
grant execute on function public.sklad_zahteve(int,int) to authenticated;

-- ------------------------------------------------------------
-- 1b) Škatle, vezane na posamezno zahtevo (za pogled podrobnosti)
-- ------------------------------------------------------------
create or replace function public.sklad_zahteva_skatle(p_zahteva_id bigint)
returns table (id bigint, barkoda text, status text, lokacija text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.barkoda, s.status, s.lokacija
  from public.zahteve_dostave_skatle zs
  join public.skatle s on s.id = zs.skatla_id
  where zs.zahteva_id = p_zahteva_id and public.is_staff()
  order by s.id;
$$;

revoke all on function public.sklad_zahteva_skatle(bigint) from public, anon;
grant execute on function public.sklad_zahteva_skatle(bigint) to authenticated;

-- ------------------------------------------------------------
-- 1c) Sprememba statusa naročila/zahteve iz skladiščne aplikacije
--     p_vir = 'narocilo' ali 'zahteva'
-- ------------------------------------------------------------
create or replace function public.sklad_update_zahteva(
  p_id bigint,
  p_vir text,
  p_status text,
  p_opomba text default null,
  p_datum_dostave date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Nimate dovoljenja.';
  end if;

  if p_vir = 'narocilo' then
    update public.narocila
    set status        = coalesce(p_status, status),
        datum_dostave = coalesce(p_datum_dostave, datum_dostave),
        opis_lokacije = coalesce(p_opomba, opis_lokacije)
    where id = p_id;
  elsif p_vir = 'zahteva' then
    update public.zahteve_dostave
    set status        = coalesce(p_status, status),
        datum_dostave = coalesce(p_datum_dostave, datum_dostave),
        opomba        = coalesce(p_opomba, opomba)
    where id = p_id;
  else
    raise exception 'Neznan vir: %', p_vir;
  end if;

  -- zapiši v dnevnik (če tabela obstaja)
  begin
    insert into public.dnevnik_dejanj (dejanje, opomba, uporabnik, cas)
    values ('status_' || p_vir, p_vir || ' #' || p_id || ' -> ' || coalesce(p_status,'?'),
            coalesce(auth.jwt() ->> 'email', 'sistem'), now());
  exception when others then null;
  end;
end;
$$;

revoke all on function public.sklad_update_zahteva(bigint,text,text,text,date) from public, anon;
grant execute on function public.sklad_update_zahteva(bigint,text,text,text,date) to authenticated;

-- ------------------------------------------------------------
-- 1d) Števci za značke na zavihkih (koliko je odprtega)
-- ------------------------------------------------------------
create or replace function public.sklad_stevci()
returns table (odprta_narocila int, odprte_zahteve int, danes int)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.narocila
      where status not in ('zakljuceno','preklicano') and public.is_staff()),
    (select count(*)::int from public.zahteve_dostave
      where status not in ('zakljucena','preklicana') and public.is_staff()),
    (select count(*)::int from (
        select datum_dostave::date d from public.narocila where status not in ('zakljuceno','preklicano')
        union all
        select datum_dostave::date from public.zahteve_dostave where status not in ('zakljucena','preklicana')
     ) t where d = current_date and public.is_staff());
$$;

revoke all on function public.sklad_stevci() from public, anon;
grant execute on function public.sklad_stevci() to authenticated;


-- ============================================================
--  KONTROLA PO ZAGONU – poženi in preveri izpise
-- ============================================================
-- select status, count(*) from public.skatle group by 1;
-- select id, tip, datum_od, datum_do, status from public.narocnine order by id;
-- select id, status_narocnine, datum_zacetka_narocnine, datum_konca_narocnine from public.kupci order by id;
-- select * from public.sklad_zahteve(0, 50);
-- select * from public.sklad_stevci();
