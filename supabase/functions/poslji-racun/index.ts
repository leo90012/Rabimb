// Rabimbox – Supabase Edge Function: poslji-racun
// Pošlje stranki e-mail z računom (prek Resend) + PDF prilogo (pdf-lib).
//
// Potrebne skrivnosti (Supabase -> Project Settings -> Edge Functions -> Secrets):
//   RESEND_API_KEY   – API ključ iz resend.com
//   RACUN_FROM       – npr. "Rabimbox <racuni@rabimbox.si>" (domena potrjena v Resend)
// (SUPABASE_URL in SUPABASE_SERVICE_ROLE_KEY sta na voljo samodejno.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FROM = Deno.env.get("RACUN_FROM") ?? "Rabimbox <onboarding@resend.dev>";

// Podatki podjetja (fiktivni – šef potrdi kasneje)
const FIRMA = {
  naziv: "Rabimbox d.o.o.",
  naslov: "Tehnološki park 21, 1000 Ljubljana",
  ddv: "SI12345678",
  matica: "1234567000",
  iban: "SI56 1234 5678 9012 345",
  email: "info@rabimbox.si",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function eur(n: number, cur = "EUR") {
  try { return new Intl.NumberFormat("sl-SI", { style: "currency", currency: cur }).format(n); }
  catch { return n + " " + cur; }
}
// Helvetica (StandardFonts) ne podpira č/š/ž -> pretvorimo v c/s/z (NFKD + odstranimo diakritiko)
function ascii(s: unknown) {
  return String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}
function b64(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function makePdf(r: any, kupecNaslov: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const M = 50;
  const dark = rgb(0.16, 0.2, 0.26), muted = rgb(0.48, 0.53, 0.58), blue = rgb(0, 0.4, 1);
  const T = (t: string, x: number, y: number, f = font, size = 10, color = dark) =>
    page.drawText(ascii(t), { x, y, size, font: f, color });
  const R = (t: string, xRight: number, y: number, f = font, size = 10, color = dark) => {
    const s = ascii(t); const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: xRight - w, y, size, font: f, color });
  };

  let y = height - M;
  // Glava podjetja
  T(FIRMA.naziv, M, y, bold, 18, blue); y -= 20;
  T(FIRMA.naslov, M, y, font, 9, muted); y -= 12;
  T("ID za DDV: " + FIRMA.ddv + "   Maticna st.: " + FIRMA.matica, M, y, font, 9, muted); y -= 12;
  T("IBAN: " + FIRMA.iban + "   " + FIRMA.email, M, y, font, 9, muted);
  // Naslov računa (desno zgoraj)
  R("RACUN " + (r.stevilka ?? ""), width - M, height - M, bold, 14, dark);

  y -= 34;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 1, color: rgb(0.9, 0.92, 0.95) });
  y -= 22;

  // Kupec
  const ime = [r.ime, r.priimek].filter(Boolean).join(" ") || "Stranka";
  T("Kupec", M, y, bold, 10, muted); y -= 15;
  T(ime, M, y, font, 11); y -= 13;
  if (r.email) { T(String(r.email), M, y, font, 10, muted); y -= 13; }
  if (kupecNaslov) { T(kupecNaslov, M, y, font, 10, muted); y -= 13; }

  // Datumi (desno)
  let yd = height - M - 56;
  R("Datum izdaje: " + (r.datum_izdaje ?? ""), width - M, yd, font, 10, dark); yd -= 15;
  R("Rok placila: " + (r.datum_zapadlosti ?? ""), width - M, yd, font, 10, dark);

  y -= 18;
  // Tabela zneskov
  const rowH = 22;
  const x0 = M, x1 = width - M;
  const drawRow = (label: string, val: string, f = font, bg = false) => {
    if (bg) page.drawRectangle({ x: x0, y: y - 6, width: x1 - x0, height: rowH, color: rgb(0.95, 0.97, 1) });
    T(label, x0 + 6, y, f, 10); R(val, x1 - 6, y, f, 10); y -= rowH;
  };
  page.drawRectangle({ x: x0, y: y - 6, width: x1 - x0, height: rowH, color: rgb(0, 0.4, 1) });
  T("Opis", x0 + 6, y, bold, 10, rgb(1, 1, 1)); R("Znesek", x1 - 6, y, bold, 10, rgb(1, 1, 1)); y -= rowH;

  const osnova = Number(r.osnova ?? 0), ddv = Number(r.ddv ?? 0), znesek = Number(r.znesek ?? 0);
  drawRow(String(r.opis ?? "Storitev"), eur(osnova, r.valuta || "EUR"));
  drawRow("Osnova (brez DDV)", eur(osnova, r.valuta || "EUR"), font, true);
  drawRow("DDV 22 %", eur(ddv, r.valuta || "EUR"));
  y -= 4;
  page.drawRectangle({ x: x0, y: y - 6, width: x1 - x0, height: rowH + 4, color: rgb(0.93, 0.96, 0.99) });
  T("ZA PLACILO", x0 + 6, y, bold, 12, dark); R(eur(znesek, r.valuta || "EUR"), x1 - 6, y, bold, 13, blue);

  // Noga
  T("Racun je izdan v elektronski obliki in velja brez podpisa in ziga.", M, 60, font, 9, muted);

  return b64(await doc.save());
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

    // Naslov kupca (če obstaja v tabeli kupci)
    let kupecNaslov = "";
    try {
      const { data: kup } = await sb.from("kupci").select("naslov, postna_stevilka, kraj").eq("email", r.email).limit(1).maybeSingle();
      if (kup) kupecNaslov = [kup.naslov, [kup.postna_stevilka, kup.kraj].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    } catch (_) { /* ignore */ }

    const ime = [r.ime, r.priimek].filter(Boolean).join(" ") || "stranka";
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#364151;max-width:560px;margin:0 auto">
        <div style="background:#0067ff;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0">
          <h2 style="margin:0;font-family:'Lexend',Arial,sans-serif">Rabimbox – Račun ${r.stevilka}</h2>
        </div>
        <div style="border:1px solid #e5e8ee;border-top:0;padding:22px;border-radius:0 0 8px 8px">
          <p>Pozdravljeni, ${ime}!</p>
          <p>Hvala za vaše naročilo. Račun v PDF obliki je priložen temu sporočilu, spodaj pa so ključni podatki:</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px 0;color:#7b8794">Številka računa</td><td style="text-align:right;font-weight:600">${r.stevilka}</td></tr>
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

    let pdfB64 = "";
    try { pdfB64 = await makePdf(r, kupecNaslov); } catch (e) { console.error("PDF napaka:", e); }

    const body: Record<string, unknown> = {
      from: FROM, to: [r.email], subject: `Račun ${r.stevilka} – Rabimbox`, html,
    };
    if (pdfB64) body.attachments = [{ filename: "Racun-" + r.stevilka + ".pdf", content: pdfB64 }];

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Resend napaka: " + (await res.text()));

    await sb.from("racuni").update({ status: "poslan" }).eq("id", r.id);
    return new Response(JSON.stringify({ ok: true, pdf: !!pdfB64 }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
