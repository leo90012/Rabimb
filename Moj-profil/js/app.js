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
  const state = { sb: null, session: null, kupec: null, tab: "nadzor", hasRacuni: null };

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
  function boxStatusBadge(s) {
    const v = (s || "").toLowerCase(); let c = "gray";
    if (v.includes("prost")) c = "green";
    else if (v.includes("zaseden") || v.includes("skladi")) c = "blue";
    else if (v.includes("dostav") || v.includes("izpos")) c = "amber";
    return `<span class="badge ${c}">${esc(s || "neznano")}</span>`;
  }
  function reqStatusBadge(s) {
    const v = (s || "").toLowerCase(); let c = "gray";
    if (v.includes("nov") || v.includes("caka") || v.includes("čaka")) c = "amber";
    else if (v.includes("obdel") || v.includes("potrj") || v.includes("pot")) c = "blue";
    else if (v.includes("zakljuc") || v.includes("zaključ") || v.includes("dostavlj") || v.includes("opravlj")) c = "green";
    else if (v.includes("preklic") || v.includes("zavrn")) c = "red";
    return `<span class="badge ${c}">${esc(s || "nova")}</span>`;
  }
  function subStatusBadge(s) {
    const v = (s || "").toLowerCase(); let c = "gray";
    if (v.includes("aktiv")) c = "green";
    else if (v.includes("preklic") || v.includes("potek") || v.includes("neaktiv")) c = "red";
    else if (v.includes("caka") || v.includes("čaka") || v.includes("nov")) c = "amber";
    return `<span class="badge ${c}">${esc(s || "-")}</span>`;
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
        ${FOOTER}
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
    boxi: () => state.sb.from("skatle").select("*").eq("kupec_id", state.kupec.id).order("id"),
    narocila: () => state.sb.from("zahteve_dostave").select("*").eq("kupec_id", state.kupec.id).order("datum_zahteve", { ascending: false }),
  };

  async function viewNadzor() {
    const k = state.kupec;
    const [{ data: boxi = [] }, { data: narocila = [] }] = await Promise.all([q.boxi(), q.narocila()]);
    const skl = boxi.filter(isStorage), naj = boxi.filter((b) => !isStorage(b));
    const aktivna = narocila.filter((z) => { const s = (z.status || "").toLowerCase(); return !s.includes("zakljuc") && !s.includes("zaključ") && !s.includes("preklic") && !s.includes("dostavlj"); }).length;
    const rowH = (b) => `<label class="row selectable"><input type="checkbox" class="check box-check" value="${b.id}" />
      <span class="main"><span class="t">${esc(b.barkoda || "Box #" + b.id)}${b.velikost ? ` <span class="muted">- ${esc(b.velikost)}</span>` : ""}</span>
      <span class="s">${cleanLoc(b.lokacija) ? esc(b.lokacija) : "Lokacija ni določena"}</span></span>
      <span class="end">${boxStatusBadge(b.status)}</span></label>`;
    const group = (title, arr) => arr.length ? `<div class="section-title">${title} (${arr.length})</div><div class="card">${arr.map(rowH).join("")}</div>` : "";
    const boxiSection = boxi.length
      ? `<p class="page-sub">Izberi bokse, ki jih želiš dostaviti, in oddaj naročilo.</p>${group("V skladišču", skl)}${group("V najemu / izposoji", naj)}`
      : `<p class="page-sub">Pregled tvojih boxov in naročnine.</p><div class="empty"><p>Trenutno nimaš aktivnih boxov.</p><button class="btn primary auto mt" id="newOrderEmpty" style="margin:12px auto 0">Naroči dostavo</button></div>`;
    return `${pageHead("nadzor")}
      <div class="stats">
        <div class="stat"><div class="n">${skl.length}</div><div class="l">V skladišču</div></div>
        <div class="stat"><div class="n">${naj.length}</div><div class="l">V najemu</div></div>
        <div class="stat"><div class="n">${aktivna}</div><div class="l">Aktivna naročila</div></div>
      </div>
      <div class="card"><h3>Naročnina</h3>
        <div class="kv"><span class="k">Status</span><span class="v">${subStatusBadge(k.status_narocnine)}</span></div>
        <div class="kv"><span class="k">Začetek</span><span class="v">${fmtDate(k.datum_zacetka_narocnine)}</span></div>
        <div class="kv"><span class="k">Poteče / obnova</span><span class="v">${fmtDate(k.datum_konca_narocnine)}</span></div>
      </div>
      ${boxiSection}
      <div class="deliver-bar" id="deliverBar"><div class="inner"><button class="btn gray" id="deliverBtn" disabled>Naroči dostavo izbranih</button></div></div>`;
  }
  function wireNadzor() {
    const bar = $("#deliverBar"), btn = $("#deliverBtn"), empty = $("#newOrderEmpty");
    if (empty) empty.addEventListener("click", () => newOrder());
    const update = () => {
      const sel = $$(".box-check:checked");
      if (!btn) return;
      if (sel.length) { btn.disabled = false; btn.classList.remove("gray"); btn.classList.add("success"); btn.textContent = `Naroči dostavo izbranih (${sel.length})`; }
      else { btn.disabled = true; btn.classList.add("gray"); btn.classList.remove("success"); btn.textContent = "Naroči dostavo izbranih"; }
    };
    $$(".box-check").forEach((c) => c.addEventListener("change", update));
    if (btn) btn.addEventListener("click", () => newOrder($$(".box-check:checked").map((c) => Number(c.value))));
  }

  async function viewNarocila() {
    const { data: narocila = [], error } = await q.narocila();
    if (error) throw error;
    return `${pageHead("narocila")}<p class="page-sub">Pregled oddanih naročil za dostavo, prevzem in vrnitev boxov.</p>
      <button class="btn primary auto" id="newOrderBtn" style="margin-bottom:16px">Novo naročilo</button>
      ${narocila.length ? `<div class="card">${narocila.map(orderRow).join("")}</div>` : `<div class="empty"><p>Še nimaš oddanih naročil.</p></div>`}`;
  }
  function wireNarocila() { const b = $("#newOrderBtn"); if (b) b.addEventListener("click", () => { window.location.href = "../narocilo/index.html"; }); }
  function orderRow(z) {
    return `<div class="row"><span class="ico">${ICON.truck}</span>
      <div class="main"><div class="t">Naročilo #${z.id}${z.brezplacna ? ` <span class="badge green">brezplačno</span>` : ""}</div>
      <div class="s">Oddano: ${fmtDate(z.datum_zahteve, true)}${z.datum_dostave ? " - Dostava: " + fmtDate(z.datum_dostave) : ""}</div>
      ${z.opomba ? `<div class="s">${esc(z.opomba)}</div>` : ""}</div>
      <div class="end">${reqStatusBadge(z.status)}</div></div>`;
  }
  async function newOrder(preselIds = []) {
    const { data: boxi = [] } = await q.boxi();
    const pre = new Set(preselIds.map(Number));
    openSheet(`<h3>Novo naročilo</h3><form id="orderForm">
      <div class="field"><label>Vrsta naročila</label><select id="oType">
        <option value="Dostava boxov">Dostava boxov</option><option value="Prevzem / odvoz">Prevzem / odvoz polnih boxov</option>
        <option value="Vrnitev boxov">Vrnitev boxov</option><option value="Drugo">Drugo</option></select></div>
      <div class="field"><label>Želeni datum</label><input type="date" id="oDate" /></div>
      ${boxi.length ? `<div class="field"><label>Izberi bokse (neobvezno)</label>${boxi.map((b) => `<label class="select-box"><input type="checkbox" value="${b.id}" ${pre.has(Number(b.id)) ? "checked" : ""} /><span><span class="t">${esc(b.barkoda || "Box #" + b.id)}</span><span class="s"> - ${esc(b.velikost || "")}${b.status ? " - " + esc(b.status) : ""}</span></span></label>`).join("")}</div>` : ""}
      <div class="field"><label>Opomba</label><textarea id="oNote" rows="3" placeholder="Npr. koliko boxov, naslov, ura, posebnosti..."></textarea></div>
      <button class="btn primary" type="submit" id="oSubmit">Oddaj naročilo</button>
      <button class="btn ghost mt" type="button" data-close>Prekliči</button></form>`);
    $("#orderForm").addEventListener("submit", submitOrder);
  }
  async function submitOrder(e) {
    e.preventDefault();
    const btn = $("#oSubmit"); btn.disabled = true; btn.textContent = "Pošiljam...";
    const type = $("#oType").value, date = $("#oDate").value || null, note = $("#oNote").value.trim();
    const chosen = $$('#orderForm input[type=checkbox]:checked').map((c) => Number(c.value));
    const opomba = [type, note].filter(Boolean).join(" - ");
    try {
      const { data: req, error } = await state.sb.from("zahteve_dostave").insert({ kupec_id: state.kupec.id, status: "nova", brezplacna: false, datum_zahteve: new Date().toISOString(), datum_dostave: date, opomba }).select().single();
      if (error) throw error;
      if (chosen.length) {
        const { error: e2 } = await state.sb.from("zahteve_dostave_skatle").insert(chosen.map((sid) => ({ zahteva_id: req.id, skatla_id: sid })));
        if (e2) console.warn("Povezava boxov ni uspela:", e2);
      }
      closeSheet(); toast("Naročilo oddano"); state.tab = "narocila"; renderTab();
    } catch (err) { alert("Napaka: " + (err.message || err)); btn.disabled = false; btn.textContent = "Oddaj naročilo"; }
  }

  async function viewRacuni() {
    const k = state.kupec;
    const subCard = `<div class="card"><h3>Naročnina</h3>
      <div class="kv"><span class="k">Status</span><span class="v">${subStatusBadge(k.status_narocnine)}</span></div>
      <div class="kv"><span class="k">Začetek</span><span class="v">${fmtDate(k.datum_zacetka_narocnine)}</span></div>
      <div class="kv"><span class="k">Naslednja obnova / potek</span><span class="v">${fmtDate(k.datum_konca_narocnine)}</span></div></div>`;
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
    return `<div class="row"><span class="ico">${ICON.receipt}</span>
      <div class="main"><div class="t">${esc(r.stevilka || "Račun #" + r.id)}</div>
      <div class="s">Izdan: ${fmtDate(r.datum_izdaje)}${r.datum_zapadlosti ? " - Zapadlost: " + fmtDate(r.datum_zapadlosti) : ""}</div></div>
      <div class="end"><div style="font-weight:700;color:var(--heading)">${money(r.znesek, r.valuta || "EUR")}</div>
      <div style="margin-top:4px">${racStatusBadge(r.status)}</div>
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
        <div class="field"><label>Naslov</label><input id="p_naslov" value="${esc(k.naslov || "")}" placeholder="Ulica in hišna številka" /></div>
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
    renderTab();
  }
  boot();
})();
