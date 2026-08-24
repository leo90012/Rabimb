// Rabimbox – Supabase Edge Function: poslji-obvestilo
// Pošlje stranki e-obvestilo (prek Resend). Trije tipi:
//   tip = "narocilo" -> potrditev oddanega naročila (podatke prebere iz narocila po ref)
//   tip = "placilo"  -> potrditev prejetega plačila (iz narocila po ref)
//   tip = "obnova"   -> opomnik za obnovo naročnine (email, ime, datum_do, paket v telesu)
//
// Skrivnosti (Supabase -> Project Settings -> Edge Functions -> Secrets):
//   RESEND_API_KEY   – API ključ iz resend.com
//   RACUN_FROM       – npr. "Rabimbox <racuni@rabimbox.si>" (domena potrjena v Resend)
// (SUPABASE_URL in SUPABASE_SERVICE_ROLE_KEY sta na voljo samodejno.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FROM = Deno.env.get("RACUN_FROM") ?? "Rabimbox <onboarding@resend.dev>";
const PANEL_URL = "https://leo90012.github.io/Rabimb/Moj-profil/index.html";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m] as string));
}
function fmtDate(d: unknown): string {
  if (!d) return "-";
  const dt = new Date(String(d));
  if (isNaN(dt.getTime())) return esc(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}. ${p(dt.getMonth() + 1)}. ${dt.getFullYear()}`;
}
function eur(v: unknown): string {
  const n = Number(v);
  if (!isFinite(n)) return "-";
  return n.toFixed(2).replace(".", ",") + " €";
}

// Preprosta blagovna predloga e-pošte
function ovoj(naslov: string, telo: string): string {
  return `<div style="background:#f4f6f9;padding:24px 0;font-family:Arial,Helvetica,sans-serif;color:#2a3342">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 22px rgba(16,24,40,.06)">
      <div style="background:#0067ff;padding:18px 26px;color:#fff;font-size:20px;font-weight:700;letter-spacing:.5px">Rabimbox</div>
      <div style="padding:26px">
        <h1 style="font-size:20px;margin:0 0 14px;color:#111">${esc(naslov)}</h1>
        ${telo}
      </div>
      <div style="padding:16px 26px;border-top:1px solid #eef1f6;color:#7b8794;font-size:12px">
        Rabimbox · <a href="mailto:info@rabimbox.si" style="color:#0067ff;text-decoration:none">info@rabimbox.si</a> · +386 (0)40 796 040
      </div>
    </div>
  </div>`;
}
function vrstica(k: string, v: string): string {
  return `<tr><td style="padding:6px 0;color:#7b8794;font-size:13px">${esc(k)}</td><td style="padding:6px 0;text-align:right;color:#2a3342;font-size:14px;font-weight:600">${esc(v)}</td></tr>`;
}
function btn(href: string, label: string): string {
  return `<div style="margin:22px 0 6px"><a href="${esc(href)}" style="display:inline-block;background:#0067ff;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;font-size:14px">${esc(label)}</a></div>`;
}

async function posljiEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) throw new Error("Resend napaka: " + (await res.text()));
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY ni nastavljen.");
    const body = await req.json().catch(() => ({}));
    const tip = String(body.tip || "");
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (tip === "narocilo" || tip === "placilo") {
      const ref = body.ref;
      if (!ref) throw new Error("Manjka ref.");
      const { data: o } = await sb.from("narocila").select("*").eq("stevilka", ref).order("id", { ascending: false }).limit(1).maybeSingle();
      if (!o || !o.email) throw new Error("Naročilo ali e-naslov ni najden.");
      const ime = o.ime ? `, ${esc(o.ime)}` : "";
      const tabela = `<table style="width:100%;border-collapse:collapse;margin-top:6px">
        ${vrstica("Številka naročila", o.stevilka || ("#" + o.id))}
        ${vrstica("Storitev", String(o.tip || "").toLowerCase().includes("izpos") ? "Izposoja" : "Skladiščenje")}
        ${vrstica("Paket", o.paket || "-")}
        ${o.cena_opis ? vrstica("Cena", o.cena_opis) : ""}
        ${o.datum_dostave ? vrstica("Termin dostave", fmtDate(o.datum_dostave) + (o.cas_dostave ? " ob " + o.cas_dostave : "")) : ""}
        ${o.naslov ? vrstica("Naslov", o.naslov + (o.mesto ? ", " + o.mesto : "")) : ""}
      </table>`;

      if (tip === "narocilo") {
        const telo = `<p style="font-size:14px;line-height:1.6;margin:0 0 4px">Pozdravljeni${ime}, hvala za naročilo! Prejeli smo ga in ga obdelujemo.</p>
          ${tabela}
          <p style="font-size:13.5px;color:#7b8794;line-height:1.6;margin:16px 0 0">Kmalu vas kontaktiramo za potrditev termina. Podrobnosti si lahko ogledate v svojem računu.</p>
          ${btn(PANEL_URL, "Moj račun")}`;
        await posljiEmail(o.email, `Potrditev naročila ${o.stevilka || ""} – Rabimbox`, ovoj("Naročilo je prejeto", telo));
        return new Response(JSON.stringify({ ok: true, sent: "narocilo" }), { headers: { ...cors, "Content-Type": "application/json" } });
      } else {
        const telo = `<p style="font-size:14px;line-height:1.6;margin:0 0 4px">Pozdravljeni${ime}, vaše plačilo smo uspešno prejeli. Hvala!</p>
          ${tabela}
          <p style="font-size:13.5px;color:#7b8794;line-height:1.6;margin:16px 0 0">Račun vam pošiljamo v ločenem e-sporočilu. Kmalu vas kontaktiramo glede termina.</p>
          ${btn(PANEL_URL, "Moj račun")}`;
        await posljiEmail(o.email, `Plačilo prejeto – naročilo ${o.stevilka || ""} – Rabimbox`, ovoj("Plačilo je potrjeno", telo));
        return new Response(JSON.stringify({ ok: true, sent: "placilo" }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
    }

    if (tip === "obnova") {
      const to = body.email;
      if (!to) throw new Error("Manjka email za obnovo.");
      const ime = body.ime ? `, ${esc(body.ime)}` : "";
      const telo = `<p style="font-size:14px;line-height:1.6;margin:0 0 10px">Pozdravljeni${ime}, vaša naročnina se izteče <b>${fmtDate(body.datum_do)}</b>.</p>
        ${body.paket ? `<p style="font-size:14px;margin:0 0 10px">Paket: <b>${esc(body.paket)}</b></p>` : ""}
        <p style="font-size:13.5px;color:#7b8794;line-height:1.6;margin:0">Za podaljšanje ali spremembo naročnine obiščite svoj račun ali nas kontaktirajte.</p>
        ${btn(PANEL_URL, "Upravljaj naročnino")}`;
      await posljiEmail(to, "Opomnik: obnova naročnine – Rabimbox", ovoj("Vaša naročnina se kmalu izteče", telo));
      return new Response(JSON.stringify({ ok: true, sent: "obnova" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Paketni opomnik: pošlje vsem naročninam, ki se iztečejo čez N dni (privzeto 5).
    if (tip === "obnova_batch") {
      const dni = Number(body.dni) || 5;
      const cilj = new Date(); cilj.setDate(cilj.getDate() + dni);
      const ciljStr = cilj.toISOString().slice(0, 10);
      const { data: subs } = await sb.from("narocnine").select("id, kupec_id, tip, datum_do, status").eq("status", "aktivna").eq("datum_do", ciljStr);
      let poslano = 0;
      for (const su of (subs || [])) {
        try {
          const { data: k } = await sb.from("kupci").select("email, ime").eq("id", su.kupec_id).limit(1).maybeSingle();
          if (!k || !k.email) continue;
          const ime = k.ime ? `, ${esc(k.ime)}` : "";
          const telo = `<p style="font-size:14px;line-height:1.6;margin:0 0 10px">Pozdravljeni${ime}, vaša naročnina se izteče <b>${fmtDate(su.datum_do)}</b>.</p>
            <p style="font-size:13.5px;color:#7b8794;line-height:1.6;margin:0">Za podaljšanje ali spremembo naročnine obiščite svoj račun ali nas kontaktirajte.</p>
            ${btn(PANEL_URL, "Upravljaj naročnino")}`;
          await posljiEmail(k.email, "Opomnik: obnova naročnine – Rabimbox", ovoj("Vaša naročnina se kmalu izteče", telo));
          poslano++;
        } catch (_) { /* ignore posamezno */ }
      }
      return new Response(JSON.stringify({ ok: true, sent: "obnova_batch", poslano }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    throw new Error("Neznan tip obvestila.");
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
