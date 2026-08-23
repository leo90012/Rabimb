/* Rabimbox - uporabniski panel (SPA). Svetla tema. Namizje = sidebar, telefon = tabbar. */
(function () {
  "use strict";
  const CFG = window.RABIMBOX_CONFIG || {};
  const APP = document.getElementById("app");
  const LOGO = "Slike/5.png";
  const FOOTER = `<footer class="site-footer">
    <nav class="foot-nav">
      <a href="https://rabimbox.si/skladiscenje/" target="_blank" rel="noopener">Skladiščenje</a>
      <a href="https://rabimbox.si/izposoja/" target="_blank" rel="noopener">Izposoja</a>
      <a href="https://rabimbox.si/cenik/" target="_blank" rel="noopener">Cenik</a>
      <a href="https://rabimbox.si/o-nas/" target="_blank" rel="noopener">O nas</a>
      <a href="https://rabimbox.si/blog/" target="_blank" rel="noopener">Blog</a>
      <a href="https://rabimbox.si/pravila-in-pogoji/" target="_blank" rel="noopener">Pravila in pogoji</a>
    </nav>
    <div class="foot-copy">&copy;2024 Rabimbox. Vse pravice pridržane.</div>
  </footer>`;
  const state = { sb: null, session: null, kupec: null, tab: "nadzor", hasRacuni: null, boxView: null, narocnine: null };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  const ICON = {
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6h11v9H3z"/><path d="M14 9h3.5L21 12v3h-7z"/><circle cx="7" cy="18" r="1.7"/><circle cx="17.5" cy="18" r="1.7"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9.5 8h5M9.5 12h5"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.4-5.6 7-5.6s7 2 7 5.6"/></svg>',
  };

  function fmtDate(d, wt = false) {
    if (!d) return "-";
    const dt = new Date(d);
    if (isNaN(dt)) return esc(d);
    const opt = wt ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", year: "numeric" };
    return dt.toLocaleDateString("sl-SI", opt);
  }
  function money(v, cur = "EUR") {
    if (v == null || v === "") return "-";
    try { return new Intl.NumberFormat("sl-SI", { style: "currency", currency: cur }).format(v); } catch { return v + " " + cur; }
  }
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2600);
  }
  // Interni statusi skladišča -> kaj vidi stranka (glej sql/integracija.sql)
  const BOX_STATUS = {
    na_zalogi:    { label: "Pripravljeno za dostavo", color: "blue" },
    rezervirana:  { label: "Pripravljeno za dostavo", color: "blue" },
    v_transportu: { label: "Na poti",                 color: "amber" },
    pri_stranki:  { label: "Pri vas",                 color: "green" },
    v_skladiscu:  { label: "V skladišču",             color: "blue" },
    poskodovana:  { label: "V pregledu",              color: "gray" },
    umaknjena:    { label: "Umaknjeno",               color: "gray" },
  };
  // Boxi, ki jih stranki ne prikazujemo
  const BOX_SKRIJ = new Set(["umaknjena"]);
  function boxStatusBadge(s) {
    const key = String(s || "").toLowerCase();
    const m = BOX_STATUS[key];
    if (m) return `<span class="badge ${m.color}">${esc(m.label)}</span>`;
    // varovalo za morebitne stare/nepoznane vrednosti
    let c = "gray";
    if (key.includes("prost")) c = "green";
    else if (key.includes("zaseden") || key.includes("skladi")) c = "blue";
    else if (key.includes("dostav") || key.includes("izpos")) c = "amber";
    return `<span class="badge ${c}">${esc(s || "neznano")}</span>`;
  }

  const REQ_STATUS = {
    nova:        { label: "Oddano",      color: "amber" },
    novo:        { label: "Oddano",      color: "amber" },
    potrjena:    { label: "Potrjeno",    color: "blue" },
    potrjeno:    { label: "Potrjeno",    color: "blue" },
    v_izvajanju: { label: "V izvajanju", color: "blue" },
    zakljucena:  { label: "Zaključeno",  color: "green" },
    zakljuceno:  { label: "Zaključeno",  color: "green" },
    preklicana:  { label: "Preklicano",  color: "red" },
    preklicano:  { label: "Preklicano",  color: "red" },
  };
  function reqStatusBadge(s) {
    const key = String(s || "nova").toLowerCase();
    const m = REQ_STATUS[key];
    if (m) return `<span class="badge ${m.color}">${esc(m.label)}</span>`;
    let c = "gray";
    if (key.includes("nov") || key.includes("caka") || key.includes("čaka")) c = "amber";
    else if (key.includes("obdel") || key.includes("potrj")) c = "blue";
    else if (key.includes("zakljuc") || key.includes("zaključ") || key.includes("dostavlj")) c = "green";
    else if (key.includes("preklic") || key.includes("zavrn")) c = "red";
    return `<span class="badge ${c}">${esc(s || "nova")}</span>`;
  }

  const SUB_STATUS = {
    aktivna:    { label: "Aktivna",    color: "green" },
    pavza:      { label: "Na pavzi",   color: "amber" },
    neaktivna:  { label: "Neaktivna",  color: "red" },
    zakljucena: { label: "Zaključena", color: "gray" },
    preklicana: { label: "Preklicana", color: "red" },
  };
  function subStatusBadge(s) {
    const key = String(s || "").toLowerCase();
    const m = SUB_STATUS[key];
    if (m) return `<span class="badge ${m.color}">${esc(m.label)}</span>`;
    let c = "gray";
    if (key.includes("preklic") || key.includes("potek") || key.includes("neaktiv")) c = "red";
    else if (key.includes("dostav")) c = "amber";
    else if (key.includes("aktiv")) c = "green";
    else if (key.includes("caka") || key.includes("čaka") || key.includes("nov")) c = "amber";
    return `<span class="badge ${c}">${esc(s || "-")}</span>`;
  }
  async function subBadgeFor(k) {
    try {
      const email = (state.session && state.session.user && state.session.user.email) || (k && k.email) || "";
      const { data } = await state.sb.from("narocila").select("placano,status").eq("email", email);
      const orders = data || [];
      const unpaid = orders.some((o) => o.placano !== true && !((o.status || "").toLowerCase().includes("preklic")));
      const started = (state.narocnine || []).some((x) => x.datum_od && String(x.status || "").toLowerCase() === "aktivna");
      if (unpaid) return subStatusBadge("neaktivna");
      if (started) return subStatusBadge("aktivna");
      if (orders.length) return subStatusBadge("v dostavi");
    } catch (e) {}
    return subStatusBadge(k.status_narocnine);
  }
  const render = (h) => { APP.innerHTML = h; };
  const isStorage = (b) => (b.tip_storitve || "").toLowerCase().includes("sklad");
  const cleanLoc = (l) => (l && l !== "NULL" && l !== "EMPTY") ? l : null;

  function configOk() {
    return CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && CFG.SUPABASE_ANON_KEY !== "TUKAJ_PRILEPI_ANON_PUBLIC_KLJUC" && CFG.SUPABASE_ANON_KEY.length > 20;
  }
  function showSetup() {
    render(`<div class="auth-wrap"><div class="auth-logo"><img src="${LOGO}" alt="Rabimbox" /><h1>Nastavitev povezave</h1></div>
      <div class="auth-card"><div class="alert info">Vpiši svoj <b>anon (public)</b> ključ v datoteko <code>js/config.js</code>.</div>
      <ol class="muted" style="font-size:13.5px;line-height:1.7;padding-left:18px;margin:0"><li>Supabase &rarr; <b>Project Settings &rarr; API Keys &rarr; Legacy</b>.</li><li>Kopiraj vrednost <b>anon public</b>.</li><li>Prilepi jo v <code>js/config.js</code> in osveži stran.</li></ol></div></div>`);
  }

  function showAuth(mode = "login", msg = null, mt = "err") {
    const isReg = mode === "register", isMagic = mode === "magic";
    render(`<div class="auth-wrap"><div class="auth-logo"><img src="${LOGO}" alt="Rabimbox" /><p>Moj račun za najem in skladiščenje</p></div>
      <div class="auth-card">
        <div class="seg"><button data-mode="login" class="${mode === "login" ? "active" : ""}">Prijava</button><button data-mode="register" class="${isReg ? "active" : ""}">Registracija</button></div>
        ${msg ? `<div class="alert ${mt}">${msg}</div>` : ""}
        <form id="authForm">
          <div class="field"><label>E-poštni naslov</label><input type="email" id="email" autocomplete="email" required placeholder="ime@primer.si" />${isReg ? `<div class="hint">Uporabi isti e-naslov, ki ga imaš v evidenci Rabimbox.</div>` : ""}</div>
          ${!isMagic ? `<div class="field"><label>Geslo</label><input type="password" id="password" autocomplete="${isReg ? "new-password" : "current-password"}" required minlength="6" placeholder="********" /></div>` : `<div class="hint" style="margin-bottom:14px">Poslali ti bomo povezavo za prijavo brez gesla.</div>`}
          ${isReg ? `<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;color:#7b8794;margin:2px 0 14px;cursor:pointer"><input type="checkbox" id="agree" style="margin-top:2px" /> <span>Soglašam s <a href="../pravila-in-pogoji/index.html" target="_blank" rel="noopener">pogoji poslovanja</a>.</span></label>` : ""}
          <button class="btn primary" type="submit" id="authBtn">${isMagic ? "Pošlji povezavo" : isReg ? "Ustvari račun" : "Prijava"}</button>
        </form>
        ${mode === "login" ? `<button class="btn ghost mt" id="forgot">Pozabljeno geslo?</button>` : ""}
      </div></div>`);
    $$(".seg button").forEach((b) => b.addEventListener("click", () => showAuth(b.dataset.mode)));
    const f = $("#forgot"); if (f) f.addEventListener("click", onForgot);
    $("#authForm").addEventListener("submit", (e) => onAuthSubmit(e, mode));
  }
  async function onAuthSubmit(e, mode) {
    e.preventDefault();
    const btn = $("#authBtn"), email = $("#email").value.trim(), pass = mode === "magic" ? null : $("#password").value;
    btn.disabled = true; btn.textContent = "Prosim počakaj...";
    try {
      if (mode === "register") {
        const agree = $("#agree");
        if (!agree || !agree.checked) { showAuth("register", "Za registracijo moraš soglašati s pogoji poslovanja.", "err"); return; }
        const { error } = await state.sb.auth.signUp({ email, password: pass });
        if (error) throw error;
        showAuth("login", "Račun ustvarjen. Če je vključena potrditev e-pošte, preveri predal, nato se prijavi.", "ok"); return;
      }
      if (mode === "magic") {
        const { error } = await state.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
        if (error) throw error;
        showAuth("login", "Povezava za prijavo je poslana na tvoj e-naslov.", "ok"); return;
      }
      const { error } = await state.sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
    } catch (err) { showAuth(mode, translateAuthError(err), "err"); }
  }
  async function onForgot() {
    const email = ($("#email") && $("#email").value.trim()) || prompt("Vpiši svoj e-naslov:");
    if (!email) return;
    const { error } = await state.sb.auth.resetPasswordForEmail(email, { redirectTo: location.href });
    if (error) showAuth("login", translateAuthError(error), "err");
    else showAuth("login", "Navodila za ponastavitev gesla so poslana na e-naslov.", "ok");
  }
  function translateAuthError(err) {
    const m = (err && err.message) || String(err);
    if (/invalid login/i.test(m)) return "Napačen e-naslov ali geslo.";
    if (/already registered|already exists/i.test(m)) return "Ta e-naslov je že registriran. Poskusi s prijavo.";
    if (/email not confirmed/i.test(m)) return "E-naslov še ni potrjen. Preveri svoj predal.";
    if (/rate limit|too many/i.test(m)) return "Preveč poskusov. Počakaj minuto in poskusi znova.";
    return esc(m);
  }

  async function loadKupec() {
    const email = state.session.user.email;
    const { data, error } = await state.sb.from("kupci").select("*").ilike("email", email).limit(1).maybeSingle();
    if (error) console.warn(error);
    state.kupec = data || null;
  }
  function showNotLinked() {
    const email = state.session.user.email;
    render(`<div class="auth-wrap"><div class="auth-logo"><img src="${LOGO}" alt="Rabimbox" /><h1>Račun ni povezan</h1></div>
      <div class="auth-card"><div class="alert info">Prijava je uspela (<b>${esc(email)}</b>), a tega e-naslova ni v naši evidenci strank.</div>
      <p class="muted" style="font-size:14px">Verjetno je pri tebi v evidenci zapisan drug e-naslov. Piši nam in uredili bomo povezavo.</p>
      <a class="btn primary" href="mailto:${esc(CFG.SUPPORT_EMAIL || "")}?subject=Povezava%20panela%20-%20${encodeURIComponent(email)}">Kontaktiraj podporo</a>
      <button class="btn ghost mt" id="logout">Odjava</button></div></div>`);
    $("#logout").addEventListener("click", doLogout);
  }
  async function doLogout() { await state.sb.auth.signOut(); state.kupec = null; state.session = null; }

  const NAV = [
    { id: "nadzor", label: "Nadzorna plošča", short: "Pregled", icon: "grid", title: "Nadzorna plošča" },
    { id: "narocila", label: "Naročila", short: "Naročila", icon: "truck", title: "Naročila" },
    { id: "racuni", label: "Računi", short: "Računi", icon: "receipt", title: "Računi in plačila" },
    { id: "profil", label: "Profil", short: "Profil", icon: "user", title: "Profil" },
  ];
  function shell(inner) {
    const k = state.kupec, ime = [k.ime, k.priimek].filter(Boolean).join(" ") || state.session.user.email;
    render(`<div class="layout">
      <aside class="sidebar">
        <div class="side-brand"><img src="${LOGO}" alt="Rabimbox" /></div>
        <div class="side-user">${esc(ime)}<span class="sub">${esc(k.email || "")}</span></div>
        <nav class="side-nav">${NAV.map((t) => `<a href="#" data-tab="${t.id}" class="${state.tab === t.id ? "active" : ""}">${esc(t.label)}</a>`).join("")}</nav>
        <div class="side-foot"><a href="#" data-logout>Odjava</a></div>
      </aside>
      <div class="main-col">
        <header class="topbar"><div class="brand"><img src="${LOGO}" alt="Rabimbox" /></div><div class="who">${esc(ime)}</div></header>
        <main class="content" id="view">${inner}</main>
      </div></div>
      <nav class="tabbar">${NAV.map((t) => `<button data-tab="${t.id}" class="${state.tab === t.id ? "active" : ""}">${ICON[t.icon]}<span>${esc(t.short)}</span></button>`).join("")}</nav>`);
    $$("[data-tab]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); go(b.dataset.tab); }));
    $$("[data-logout]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); doLogout(); }));
  }
  function go(tab) { state.tab = tab; window.scrollTo(0, 0); renderTab(); }
  function pageHead(id) { return `<h1 class="page-title">${esc(NAV.find((x) => x.id === id).title)}</h1>`; }
  const loading = () => `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;

  async function renderTab() {
    shell(loading());
    const view = $("#view");
    try {
      if (state.tab === "nadzor") { view.innerHTML = await viewNadzor(); wireNadzor(); }
      else if (state.tab === "narocila") { view.innerHTML = await viewNarocila(); wireNarocila(); }
      else if (state.tab === "racuni") view.innerHTML = await viewRacuni();
      else if (state.tab === "profil") { view.innerHTML = await viewProfil(); wireProfil(); }
    } catch (err) {
      console.error(err);
      view.innerHTML = pageHead(state.tab) + `<div class="alert err">Napaka pri nalaganju: ${esc(err.message || err)}</div>`;
    }
  }
  const q = {
    // pogled moje_skatle doda datume naročnine (sql/integracija.sql); ob napaki pade nazaj na skatle
    boxi: async () => {
      const v = await state.sb.from("moje_skatle").select("*").eq("kupec_id", state.kupec.id).order("id");
      if (!v.error) return v;
      return state.sb.from("skatle").select("*").eq("kupec_id", state.kupec.id).order("id");
    },
    narocila: () => state.sb.from("zahteve_dostave").select("*").eq("kupec_id", state.kupec.id).order("datum_zahteve", { ascending: false }),
    narocnine: () => state.sb.from("narocnine").select("*").eq("kupec_id", state.kupec.id).order("datum_do", { ascending: false }),
  };
  // Veljavnost naročnine: vir resnice je tabela narocnine, kupci.* je samo odsev
  function narocninaDo(box) {
    if (box && box.narocnina_do) return box.narocnina_do;
    const n = (state.narocnine || []).filter((x) => (x.status || "") === "aktivna");
    if (box && box.narocnina_id) {
      const m = (state.narocnine || []).find((x) => Number(x.id) === Number(box.narocnina_id));
      if (m) return m.datum_do;
    }
    if (n.length) return n.map((x) => x.datum_do).filter(Boolean).sort().pop();
    return state.kupec ? state.kupec.datum_konca_narocnine : null;
  }
  function narocninaOd() {
    const n = (state.narocnine || []).filter((x) => (x.status || "") === "aktivna");
    if (n.length) return n.map((x) => x.datum_od).filter(Boolean).sort()[0];
    return state.kupec ? state.kupec.datum_zacetka_narocnine : null;
  }

  async function viewNadzor() {
    const k = state.kupec;
    const [{ data: boxiAll = [] }, { data: narocila = [] }, narRes] = await Promise.all([q.boxi(), q.narocila(), Promise.resolve(q.narocnine()).catch(() => ({ data: [] }))]);
    state.narocnine = (narRes && narRes.data) || [];
    const boxi = (boxiAll || []).filter((b) => !BOX_SKRIJ.has(String(b.status || "").toLowerCase()));
    const email = (state.session && state.session.user && state.session.user.email) || k.email || "";
    let neplacani = [], ordersAll = [];
    try {
      const { data: ordersK } = await state.sb.from("narocila").select("*").eq("email", email).order("id", { ascending: false });
      ordersAll = ordersK || [];
      neplacani = ordersAll.filter((o) => o.placano !== true && !((o.status || "").toLowerCase().includes("preklic")));
    } catch (e) {}
    const subStarted = (state.narocnine || []).some((x) => x.datum_od && String(x.status || "").toLowerCase() === "aktivna");
    const subBadge = neplacani.length ? subStatusBadge("neaktivna") : (subStarted ? subStatusBadge("aktivna") : (ordersAll.length ? subStatusBadge("v dostavi") : subStatusBadge(k.status_narocnine)));
    const parseAmt = (txt) => { if (!txt) return 0; const before = String(txt).split("/mesec")[0]; const nums = before.match(/\d+(?:[.,]\d+)?/g); if (!nums) return 0; const v = parseFloat(nums[nums.length - 1].replace(/\./g, "").replace(",", ".")); return isNaN(v) ? 0 : v; };
    const badgeUnpaid = `<span style="background:#fdeceb;color:#a01810;border-radius:20px;padding:2px 9px;font-size:11px;font-weight:700;margin-left:4px">Ni plačano</span>`;
    const orderLine = (o) => `<label class="row selectable"><input type="checkbox" class="check unpaid-check" value="${o.id}" data-amount="${parseAmt(o.cena_opis)}" data-ref="${esc(o.stevilka || "")}" />
      <span class="main"><span class="t">Naročilo ${esc(o.stevilka || ("#" + o.id))} ${badgeUnpaid}</span>
      <span class="s">${esc(o.paket || "")}${o.cena_opis ? " - " + esc(o.cena_opis) : ""}</span></span></label>`;
    const neplacanoSection = neplacani.length ? `<div class="card" style="border-radius:6px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><h3 style="margin:0">Neplačana naročila</h3><button class="btn outline small" id="selAllUnpaid" type="button">Izberi vsa neplačana</button></div>
      ${neplacani.map(orderLine).join("")}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;flex-wrap:wrap"><div class="muted" id="unpaidTotal">Izbrano: 0,00 €</div><button class="btn primary" id="payUnpaid" disabled>Plačilo izbranih (0)</button></div>
    </div>` : "";
    const skl = boxi.filter(isStorage), naj = boxi.filter((b) => !isStorage(b));
    const aktivna = narocila.filter((z) => { const s = (z.status || "").toLowerCase(); return !s.includes("zakljuc") && !s.includes("zaključ") && !s.includes("preklic") && !s.includes("dostavlj"); }).length;
    const rowH = (b) => `<label class="row selectable"><input type="checkbox" class="check box-check" value="${b.id}" />
      <span class="main"><span class="t">Box #${b.id}${b.velikost ? ` <span class="muted">- ${esc(b.velikost)}</span>` : ""}</span>
      <span class="s">${cleanLoc(b.lokacija) ? esc(b.lokacija) : "Lokacija ni določena"}${narocninaDo(b) ? ` · Naročnina do: ${fmtDate(narocninaDo(b))}` : ""}</span></span>
      <span class="end">${boxStatusBadge(b.status)}</span></label>`;
    const group = (title, arr, gkey) => arr.length ? `<div class="section-title">${title} (${arr.length})${gkey === "skl" ? ` <button class="btn outline small" id="selAllSkl" type="button" style="margin-left:8px">Izberi vse v skladišču</button>` : ""}</div><div class="card"${gkey ? ` data-group="${gkey}"` : ""}>${arr.map(rowH).join("")}</div>` : "";
    let boxiSection;
    if (!boxi.length) {
      boxiSection = `<p class="page-sub">Pregled tvojih boxov in naročnine.</p><div class="empty"><p>Trenutno nimaš aktivnih boxov.</p><button class="btn primary auto mt" id="newOrderEmpty" style="margin:12px auto 0">Naroči dostavo</button></div>`;
    } else if (state.boxView === "skl") {
      boxiSection = `<p class="page-sub">Boxi v skladišču — izberi in oddaj naročilo za dostavo.</p>${group("V skladišču", skl, "skl")}`;
    } else if (state.boxView === "naj") {
      boxiSection = `<p class="page-sub">Boxi v najemu — izberi in oddaj naročilo za dostavo.</p>${group("V najemu / izposoji", naj, "naj")}`;
    } else {
      boxiSection = `<p class="page-sub">Klikni <b>Izposoja</b> ali <b>Skladiščenje</b> zgoraj za prikaz svojih boxov.</p>`;
    }
    const choiceCards = `<div class="nadzor-choice"><div class="nchoice${state.boxView === "naj" ? " active" : ""}" data-view="naj"><span class="cnt">${naj.length}</span><span class="t">Izposoja</span><span class="d">Boxi v najemu</span></div><div class="nchoice${state.boxView === "skl" ? " active" : ""}" data-view="skl"><span class="cnt">${skl.length}</span><span class="t">Skladiščenje</span><span class="d">Boxi v skladišču</span></div></div>`;
    return `${pageHead("nadzor")}
      ${neplacanoSection}
      ${choiceCards}
      <div class="card"><h3>Naročnina</h3>
        <div class="kv"><span class="k">Status</span><span class="v">${subBadge}</span></div>
        <div class="kv"><span class="k">Začetek</span><span class="v">${fmtDate(narocninaOd())}</span></div>
        <div class="kv"><span class="k">Poteče / obnova</span><span class="v">${fmtDate(narocninaDo())}</span></div>
      </div>
      ${boxiSection}
      <div class="deliver-bar" id="deliverBar"><div class="inner"><button class="btn gray" id="deliverBtn" disabled>Naroči dostavo izbranih</button></div></div>`;
  }
  function wireNadzor() {
    const bar = $("#deliverBar"), btn = $("#deliverBtn"), empty = $("#newOrderEmpty");
    if (empty) empty.addEventListener("click", () => newOrder());
    $$(".nchoice[data-view]").forEach((c) => c.addEventListener("click", () => {
      const v = c.getAttribute("data-view");
      state.boxView = (state.boxView === v) ? null : v;
      renderTab();
    }));
    const update = () => {
      const sel = $$(".box-check:checked");
      if (!btn) return;
      if (sel.length) { btn.disabled = false; btn.classList.remove("gray"); btn.classList.add("success"); btn.textContent = `Naroči dostavo izbranih (${sel.length})`; }
      else { btn.disabled = true; btn.classList.add("gray"); btn.classList.remove("success"); btn.textContent = "Naroči dostavo izbranih"; }
    };
    $$(".box-check").forEach((c) => c.addEventListener("change", update));
    if (btn) btn.addEventListener("click", () => newOrder($$(".box-check:checked").map((c) => Number(c.value))));
    const selAllSkl = $("#selAllSkl");
    if (selAllSkl) selAllSkl.addEventListener("click", () => {
      const checks = $$('[data-group="skl"] .box-check');
      const allChecked = checks.length > 0 && checks.every((c) => c.checked);
      checks.forEach((c) => { c.checked = !allChecked; });
      update();
    });
    const unpaidChecks = $$(".unpaid-check"), payUnpaid = $("#payUnpaid"), totalEl = $("#unpaidTotal"), selAllUnpaid = $("#selAllUnpaid");
    const updUnpaid = () => {
      const sel = $$(".unpaid-check:checked");
      const total = sel.reduce((sum, c) => sum + (parseFloat(c.getAttribute("data-amount")) || 0), 0);
      if (totalEl) totalEl.textContent = "Izbrano: " + total.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
      if (payUnpaid) { payUnpaid.disabled = sel.length === 0; payUnpaid.textContent = "Plačilo izbranih (" + sel.length + ")"; }
    };
    unpaidChecks.forEach((c) => c.addEventListener("change", updUnpaid));
    if (selAllUnpaid) selAllUnpaid.addEventListener("click", () => {
      const allChecked = unpaidChecks.length > 0 && unpaidChecks.every((c) => c.checked);
      unpaidChecks.forEach((c) => { c.checked = !allChecked; });
      updUnpaid();
    });
    if (payUnpaid) payUnpaid.addEventListener("click", async () => {
      const sel = $$(".unpaid-check:checked");
      const refs = sel.map((c) => c.getAttribute("data-ref")).filter((x) => x);
      if (!refs.length) { toast("Izberi vsaj eno neplačano naročilo."); return; }
      const ref = refs[0];
      if (refs.length > 1) toast("Plačilo poteka po enem naročilu. Preusmerjam na plačilo prvega izbranega; ostala plačaj po vrnitvi.");
      payUnpaid.disabled = true; payUnpaid.textContent = "Preusmerjam...";
      const slugs = ["rapid-api", "stripe-checkout", "Stripe-checkout"];
      let lastErr = null;
      for (const slug of slugs) {
        try {
          const res = await state.sb.functions.invoke(slug, { body: { ref: ref, pageUrl: location.origin + location.pathname } });
          if (res && !res.error && res.data && res.data.url) { window.location.href = res.data.url; return; }
          lastErr = res && res.error ? (res.error.message || "stripe") : "stripe";
        } catch (e) { lastErr = (e && e.message) ? e.message : String(e); }
      }
      console.warn("Stripe plačilo (panel) ni uspelo:", lastErr);
      toast("Plačila trenutno ni mogoče začeti. Poskusi znova čez trenutek.");
      payUnpaid.disabled = false; payUnpaid.textContent = "Plačilo izbranih (" + refs.length + ")";
    });
    updUnpaid();
  }

  async function viewNarocila() {
    const email = (state.session && state.session.user && state.session.user.email) || (state.kupec && state.kupec.email) || "";
    let orders = [];
    try { const { data } = await state.sb.from("narocila").select("*").eq("email", email).order("id", { ascending: false }); orders = (data || []).filter((o) => !((o.status || "").toLowerCase().includes("preklic"))); } catch (e) {}
    let zahteve = [];
    try { const { data } = await q.narocila(); zahteve = data || []; } catch (e) {}
    const narocilaCard = orders.length ? `<div class="section-title">Moja naročila</div><div class="card">${orders.map(narociloRow).join("")}</div>` : "";
    const zahteveCard = zahteve.length ? `<div class="section-title">Zahteve za dostavo / prevzem</div><div class="card">${zahteve.map(orderRow).join("")}</div>` : "";
    const prazno = (!orders.length && !zahteve.length) ? `<div class="empty"><p>Še nimaš oddanih naročil.</p></div>` : "";
    return `${pageHead("narocila")}<p class="page-sub">Pregled tvojih naročil ter zahtev za dostavo, prevzem in vrnitev boxov.</p>
      <button class="btn primary auto" id="newOrderBtn" style="margin-bottom:16px">Novo naročilo</button>
      ${narocilaCard}${zahteveCard}${prazno}`;
  }
  function narociloRow(o) {
    const paid = o.placano === true;
    const badge = paid ? `<span class="badge green">Plačano</span>` : `<span class="badge red">Ni plačano</span>`;
    const termin = o.datum_dostave ? (fmtDate(o.datum_dostave) + (o.cas_dostave ? " " + o.cas_dostave : "")) : "";
    return `<div class="row"><span class="ico">${ICON.receipt}</span>
      <div class="main"><div class="t">Naročilo ${esc(o.stevilka || ("#" + o.id))} ${badge}</div>
      <div class="s">${esc(o.paket || "")}${o.cena_opis ? " · " + esc(o.cena_opis) : ""}${termin ? " · Termin: " + esc(termin) : ""}</div></div></div>`;
  }
  function wireNarocila() { const b = $("#newOrderBtn"); if (b) b.addEventListener("click", () => { window.location.href = "../narocilo/index.html"; }); }
  function orderRow(z) {
    return `<div class="row"><span class="ico">${ICON.truck}</span>
      <div class="main"><div class="t">Naročilo #${z.id}${z.brezplacna ? ` <span class="badge green">brezplačno</span>` : ""}</div>
      <div class="s">Oddano: ${fmtDate(z.datum_zahteve, true)}${z.datum_dostave ? " - Dostava: " + fmtDate(z.datum_dostave) : ""}</div>
      ${z.opomba ? `<div class="s">${esc(z.opomba)}</div>` : ""}</div>
      <div class="end">${reqStatusBadge(z.status)}</div></div>`;
  }
  function todayISO() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  async function orderBlocked(date) {
    const b = {};
    try { const r = await state.sb.rpc("zasedeni_termini", { d: date }); if (!r.error && r.data) r.data.forEach((t) => { const h = parseInt(String(t).slice(0, 2), 10); if (!isNaN(h)) b[h] = 1; }); } catch (e) {}
    return b;
  }
  async function loadOrderTimes() {
    const sel = $("#oTime"), hint = $("#oTimeHint"), date = $("#oDate") ? $("#oDate").value : "";
    if (!sel) return;
    if (!date) { sel.innerHTML = '<option value="">Najprej izberi datum</option>'; return; }
    if (hint) hint.textContent = "Preverjam razpoložljivost...";
    const bl = await orderBlocked(date);
    let o = '<option value="">Izberi uro</option>';
    for (let h = 10; h <= 14; h++) { const t = String(h).padStart(2, "0") + ":00"; const dis = bl[h] ? " disabled" : ""; o += `<option value="${t}"${dis}>${t}${dis ? " (zasedeno)" : ""}</option>`; }
    sel.innerHTML = o;
    if (hint) hint.textContent = "Zasedeni termini so onemogočeni (dostava traja 1 uro).";
  }
  async function newOrder() {
    openSheet(`<h3>Vračilo</h3><form id="orderForm">
      <div class="field"><label>Naslov vračila</label><input id="oAddr" placeholder="Ulica in hišna številka, kraj" value="${esc((state.kupec && state.kupec.naslov) || "")}" /></div>
      <div class="field"><label>Datum</label><input type="date" id="oDate" min="${todayISO()}" /></div>
      <div class="field"><label>Ura</label><select id="oTime"><option value="">Najprej izberi datum</option></select><div class="hint" id="oTimeHint"></div></div>
      <div class="field"><label>Opomba</label><textarea id="oNote" rows="3" placeholder="Posebnosti, št. boxov, ..."></textarea></div>
      <button class="btn primary" type="submit" id="oSubmit">Naroči vračilo</button>
      <button class="btn ghost mt" type="button" data-close>Prekliči</button></form>`);
    const de = $("#oDate"); if (de) de.addEventListener("change", loadOrderTimes);
    $("#orderForm").addEventListener("submit", submitOrder);
  }
  async function submitOrder(e) {
    e.preventDefault();
    const btn = $("#oSubmit");
    const addr = $("#oAddr").value.trim(), date = $("#oDate").value || null, time = $("#oTime").value, note = $("#oNote").value.trim();
    if (!addr || !date || !time) { alert("Prosim vpiši naslov, datum in uro vračila."); return; }
    btn.disabled = true; btn.textContent = "Pošiljam...";
    const opomba = ["Vračilo", "Naslov: " + addr, "Ura: " + time, note].filter(Boolean).join(" | ");
    try {
      const { error } = await state.sb.from("zahteve_dostave").insert({ kupec_id: state.kupec.id, status: "nova", brezplacna: false, datum_zahteve: new Date().toISOString(), datum_dostave: date, opomba });
      if (error) throw error;
      closeSheet(); toast("Vračilo naročeno"); state.tab = "narocila"; renderTab();
    } catch (err) { alert("Napaka: " + (err.message || err)); btn.disabled = false; btn.textContent = "Naroči vračilo"; }
  }

  async function viewRacuni() {
    const k = state.kupec;
    const statusBadge = await subBadgeFor(k);
    if (!state.narocnine) { const nr = await Promise.resolve(q.narocnine()).catch(() => ({ data: [] })); state.narocnine = (nr && nr.data) || []; }
    const subCard = `<div class="card"><h3>Naročnina</h3>
      <div class="kv"><span class="k">Status</span><span class="v">${statusBadge}</span></div>
      <div class="kv"><span class="k">Začetek</span><span class="v">${fmtDate(narocninaOd())}</span></div>
      <div class="kv"><span class="k">Naslednja obnova / potek</span><span class="v">${fmtDate(narocninaDo())}</span></div></div>`;
    let racuni = null;
    try {
      const { data, error } = await state.sb.from("racuni").select("*").eq("kupec_id", k.id).order("datum_izdaje", { ascending: false });
      if (!error) { racuni = data || []; state.hasRacuni = true; } else state.hasRacuni = false;
    } catch { state.hasRacuni = false; }
    let body;
    if (racuni && racuni.length) body = `<div class="section-title">Računi</div><div class="card">${racuni.map(racRow).join("")}</div>`;
    else if (state.hasRacuni) body = `<div class="empty"><p>Trenutno ni izdanih računov.</p></div>`;
    else body = `<div class="alert info">Modul za posamezne račune še ni vključen. V bazi lahko dodaš tabelo <code>racuni</code> (SQL je v <code>sql/setup.sql</code>) in računi se bodo samodejno prikazali tukaj.</div><a class="btn outline auto" href="mailto:${esc(CFG.SUPPORT_EMAIL || "")}?subject=Vprašanje%20glede%20računa">Vprašanje glede plačila</a>`;
    return pageHead("racuni") + subCard + body;
  }
  function racRow(r) {
    const paid = /plac|plač|paid/i.test(r.status || "");
    const overdue = !paid && r.datum_zapadlosti && (new Date(r.datum_zapadlosti) < new Date(new Date().toDateString()));
    const naziv = (paid ? "Račun" : "Predračun") + " " + (r.stevilka || ("#" + r.id));
    const badge = paid ? racStatusBadge(r.status) : (overdue ? `<span class="badge red">zapadlo</span>` : `<span class="badge amber">Predračun</span>`);
    return `<div class="row"><span class="ico">${ICON.receipt}</span>
      <div class="main"><div class="t">${esc(naziv)}</div>
      <div class="s">Izdan: ${fmtDate(r.datum_izdaje)}${r.datum_zapadlosti ? " - Zapadlost: " + fmtDate(r.datum_zapadlosti) : ""}</div></div>
      <div class="end"><div style="font-weight:700;color:var(--heading)">${money(r.znesek, r.valuta || "EUR")}</div>
      <div style="margin-top:4px">${badge}</div>
      ${r.url_pdf ? `<div style="margin-top:6px"><a href="${esc(r.url_pdf)}" target="_blank" rel="noopener">PDF</a></div>` : ""}</div></div>`;
  }
  function racStatusBadge(s) {
    const v = (s || "").toLowerCase(); let c = "amber";
    if (v.includes("plac") || v.includes("plač") || v.includes("paid")) c = "green";
    else if (v.includes("zapadl") || v.includes("neplac") || v.includes("overdue")) c = "red";
    return `<span class="badge ${c}">${esc(s || "odprt")}</span>`;
  }

  async function viewProfil() {
    const k = state.kupec;
    return `${pageHead("profil")}
      <div class="card"><h3>Moji podatki</h3><form id="profForm">
        <div class="rowflex"><div class="field"><label>Ime</label><input id="p_ime" value="${esc(k.ime || "")}" /></div>
        <div class="field"><label>Priimek</label><input id="p_priimek" value="${esc(k.priimek || "")}" /></div></div>
        <div class="field"><label>Telefon</label><input id="p_telefon" value="${esc(k.telefon || "")}" placeholder="+386..." /></div>
        <input type="hidden" id="p_naslov" value="${esc(k.naslov || "")}" />
        <div class="rowflex"><div class="field"><label>Poštna številka</label><input id="p_posta" value="${esc(k.postna_stevilka || "")}" placeholder="1000" /></div>
        <div class="field"><label>Kraj</label><input id="p_kraj" value="${esc(k.kraj || "")}" placeholder="Ljubljana" /></div></div>
        <div class="field"><label>E-pošta</label><input value="${esc(k.email || state.session.user.email)}" disabled /><div class="hint">E-naslov je vezan na prijavo in ga tu ni mogoče spremeniti.</div></div>
        <button class="btn primary auto" type="submit" id="profSave">Shrani spremembe</button></form></div>
      <button class="btn danger auto" id="logoutBtn">Odjava</button>`;
  }
  function wireProfil() { $("#profForm").addEventListener("submit", saveProfil); $("#logoutBtn").addEventListener("click", doLogout); }
  async function saveProfil(e) {
    e.preventDefault();
    const btn = $("#profSave"); btn.disabled = true; btn.textContent = "Shranjujem...";
    const patch = {
      ime: $("#p_ime").value.trim() || null, priimek: $("#p_priimek").value.trim() || null, telefon: $("#p_telefon").value.trim() || null,
      naslov: $("#p_naslov").value.trim() || null, postna_stevilka: $("#p_posta").value.trim() || null, kraj: $("#p_kraj").value.trim() || null,
    };
    const { error } = await state.sb.from("kupci").update(patch).eq("id", state.kupec.id);
    if (error) { alert("Napaka: " + error.message); btn.disabled = false; btn.textContent = "Shrani spremembe"; return; }
    Object.assign(state.kupec, patch); toast("Shranjeno"); btn.disabled = false; btn.textContent = "Shrani spremembe";
  }

  function openSheet(html) {
    closeSheet();
    const bd = document.createElement("div"); bd.className = "sheet-backdrop"; bd.id = "sheet";
    bd.innerHTML = `<div class="sheet"><div class="grip"></div>${html}</div>`;
    bd.addEventListener("click", (e) => { if (e.target === bd) closeSheet(); });
    document.body.appendChild(bd);
    $$("[data-close]", bd).forEach((b) => b.addEventListener("click", closeSheet));
  }
  function closeSheet() { const s = document.getElementById("sheet"); if (s) s.remove(); }

  async function boot() {
    if (!configOk()) { showSetup(); return; }
    if (!window.supabase || !window.supabase.createClient) {
      render(`<div class="auth-wrap"><div class="auth-card"><div class="alert err">Ni bilo mogoče naložiti Supabase knjižnice (preveri internetno povezavo).</div></div></div>`); return;
    }
    state.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    state.sb.auth.onAuthStateChange(async (_e, session) => { state.session = session; await routeBySession(); });
    const { data } = await state.sb.auth.getSession();
    state.session = data.session; await routeBySession();
  }
  async function routeBySession() {
    if (!state.session) { state.kupec = null; showAuth("login"); return; }
    if (!state.kupec) { APP.innerHTML = `<div class="boot"><div class="spinner"></div></div>`; await loadKupec(); }
    if (!state.kupec) { showNotLinked(); return; }
    await handlePlacilo();
    renderTab();
  }
  function orderAmount(o) {
    const tip = String(o.tip || "").toLowerCase(); const n = Number(o.st_boxov) || 0;
    if (tip.includes("izpos")) { const m = { 20: 49, 40: 89, 60: 119, 80: 149 }; return m[n] || 0; }
    const per = n <= 10 ? 3.90 : n <= 25 ? 3.60 : 3.30; return Math.round(n * per * 100) / 100;
  }
  async function handlePlacilo() {
    if (state._placiloDone) return;
    const qp = new URLSearchParams(location.search);
    const pl = qp.get("placilo"), ref = qp.get("ref");
    if (!pl) return;
    state._placiloDone = true;
    try { history.replaceState({}, "", location.pathname); } catch (e) {}
    if (pl === "preklic") { toast("Plačilo je bilo preklicano. Naročilo ni potrjeno."); return; }
    if (pl !== "uspeh" || !ref) return;
    // 1) Strežniška potrditev (service-role -> obide RLS; preveri sejo pri Stripe)
    const sid = qp.get("session_id");
    if (sid) {
      for (const slug of ["rapid-api", "stripe-checkout", "Stripe-checkout"]) {
        try {
          const cr = await state.sb.functions.invoke(slug, { body: { confirm: true, session_id: sid } });
          if (cr && !cr.error && cr.data && cr.data.ok) { toast("Plačilo uspešno. Naročilo je označeno kot plačano."); return; }
        } catch (e) {}
      }
    }
    // 2) Rezerva: posodobitev iz brskalnika
    try {
      const { data: o } = await state.sb.from("narocila").select("*").eq("stevilka", ref).order("id", { ascending: false }).limit(1).maybeSingle();
      if (o) {
        if (o.placano !== true) await state.sb.from("narocila").update({ placano: true, status: "placano" }).eq("stevilka", ref);
        const { data: ex } = await state.sb.from("racuni").select("id").eq("stevilka", ref).limit(1).maybeSingle();
        if (!ex) {
          const total = orderAmount(o);
          const osnova = Math.round((total / 1.22) * 100) / 100, ddv = Math.round((total - osnova) * 100) / 100;
          const zap = new Date(); zap.setDate(zap.getDate() + 8);
          const zapStr = zap.getFullYear() + "-" + String(zap.getMonth() + 1).padStart(2, "0") + "-" + String(zap.getDate()).padStart(2, "0");
          const ri = await state.sb.from("racuni").insert({ stevilka: ref, osnova, ddv, znesek: total, valuta: "EUR", opis: (o.paket || "Rabimbox") + " - prvi mesec", status: "placan", email: o.email, ime: o.ime || null, priimek: o.priimek || null, datum_izdaje: todayISO(), datum_zapadlosti: zapStr });
          if (!ri.error) { try { await state.sb.functions.invoke("poslji-racun", { body: { stevilka: ref } }); } catch (e) {} }
        }
      }
      toast("Plačilo uspešno. Naročilo je označeno kot plačano.");
    } catch (e) { console.warn("handlePlacilo:", e); toast("Plačilo prejeto. Osvežujem status…"); }
  }
  boot();
})();
