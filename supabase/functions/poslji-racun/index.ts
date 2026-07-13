// Rabimbox – Supabase Edge Function: poslji-racun
// Pošlje stranki e-mail z računom (prek Resend) na podlagi racun_id.
//
// Potrebne skrivnosti (Supabase -> Project Settings -> Edge Functions -> Secrets
// ali `supabase secrets set ...`):
//   RESEND_API_KEY   – API ključ iz resend.com
//   RACUN_FROM       – npr. "Rabimbox <racuni@rabimbox.si>" (domena mora biti potrjena v Resend)
// (SUPABASE_URL in SUPABASE_SERVICE_ROLE_KEY sta na voljo samodejno.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FROM = Deno.env.get("RACUN_FROM") ?? "Rabimbox <onboarding@resend.dev>";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function eur(n: number, cur = "EUR") {
  try { return new Intl.NumberFormat("sl-SI", { style: "currency", currency: cur }).format(n); }
  catch { return n + " " + cur; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { racun_id, stevilka } = await req.json();
    if (!racun_id && !stevilka) throw new Error("Manjka racun_id ali stevilka");

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    let query = sb.from("racuni").select("*");
    query = racun_id ? query.eq("id", racun_id) : query.eq("stevilka", stevilka);
    const { data: r, error } = await query.single();
    if (error || !r) throw new Error("Račun ni najden");

    const ime = [r.ime, r.priimek].filter(Boolean).join(" ") || "stranka";
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#364151;max-width:560px;margin:0 auto">
        <div style="background:#0067ff;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0">
          <h2 style="margin:0;font-family:'Lexend',Arial,sans-serif">Rabimbox – Račun ${r.stevilka}</h2>
        </div>
        <div style="border:1px solid #e5e8ee;border-top:0;padding:22px;border-radius:0 0 8px 8px">
          <p>Pozdravljeni, ${ime}!</p>
          <p>Hvala za vaše naročilo. V nadaljevanju so podatki o računu:</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px 0;color:#7b8794">Številka računa</td><td style="text-align:right;font-weight:600">${r.stevilka}</td></tr>
            <tr><td style="padding:8px 0;color:#7b8794">Opis</td><td style="text-align:right">${r.opis ?? ""}</td></tr>
            <tr><td style="padding:8px 0;color:#7b8794">Datum izdaje</td><td style="text-align:right">${r.datum_izdaje ?? ""}</td></tr>
            <tr><td style="padding:8px 0;color:#7b8794">Rok plačila</td><td style="text-align:right">${r.datum_zapadlosti ?? ""}</td></tr>
            <tr><td colspan="2" style="border-top:1px solid #e5e8ee;padding-top:8px"></td></tr>
            <tr><td style="padding:6px 0;color:#7b8794">Osnova</td><td style="text-align:right">${eur(Number(r.osnova), r.valuta)}</td></tr>
            <tr><td style="padding:6px 0;color:#7b8794">DDV (22%)</td><td style="text-align:right">${eur(Number(r.ddv), r.valuta)}</td></tr>
            <tr><td style="padding:10px 0;font-weight:700">Za plačilo</td><td style="text-align:right;font-weight:700;font-size:18px">${eur(Number(r.znesek), r.valuta)}</td></tr>
          </table>
          <p style="color:#7b8794;font-size:12px;margin-top:18px">Za vprašanja smo dosegljivi na info@rabimbox.si. Lep pozdrav, ekipa Rabimbox.</p>
        </div>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [r.email], subject: `Račun ${r.stevilka} – Rabimbox`, html }),
    });
    if (!res.ok) throw new Error("Resend napaka: " + (await res.text()));

    await sb.from("racuni").update({ status: "poslan" }).eq("id", r.id);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
