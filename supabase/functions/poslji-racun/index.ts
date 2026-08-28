// Rabimbox – Supabase Edge Function: poslji-racun
// Pošlje stranki e-mail z računom ali predračunom (prek Resend) + PDF prilogo (pdf-lib).
//
// Vhod (POST JSON):
//   { stevilka: "RB-...", tip: "racun" | "predracun" }
//   - tip = "racun"      -> prebere zapis iz tabele racuni (po stevilki) -> PDF "RAČUN"
//   - tip = "predracun"  -> prebere naročilo iz narocila (po stevilki), izračuna znesek -> PDF "PREDRAČUN"
//   (privzeto tip = "racun"; podprt je tudi { racun_id } za tip=racun)
//
// Skrivnosti (Supabase -> Project Settings -> Edge Functions -> Secrets):
//   RESEND_API_KEY   – API ključ iz resend.com
//   RACUN_FROM       – npr. "Rabimbox <racuni@rabimbox.si>" (domena potrjena v Resend)
// (SUPABASE_URL in SUPABASE_SERVICE_ROLE_KEY sta na voljo samodejno.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FROM = Deno.env.get("RACUN_FROM") ?? "Rabimbox <onboarding@resend.dev>";
const LOGO = "https://rabimbox.si/wp-content/uploads/2024/08/cropped-3-270x270.png";

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
// Helvetica (StandardFonts) ne podpira č/š/ž -> pretvorimo v c/s/z
function ascii(s: unknown) {
  return String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}
function b64(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function d(dt: Date) { return dt.toISOString().slice(0, 10); }

// Cenik (mora se ujemati s checkout.js)
function znesekZa(o: any): number {
  const tip = String(o.tip || "").toLowerCase();
  const n = Number(o.st_boxov) || 0;
  if (tip.includes("izpos")) {
    const m: Record<number, number> = { 20: 49, 40: 89, 60: 119, 80: 149 };
    return m[n] ?? 0;
  }
  const per = n <= 10 ? 3.90 : n <= 25 ? 3.60 : 3.30;
  return Math.round(n * per * 100) / 100;
}

async function makePdf(r: any, kupecNaslov: string, naslovDok: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const M = 50;
  const dark = rgb(0.16, 0.2, 0.26), muted = rgb(0.48, 0.53, 0.58), blue = rgb(0.431, 0.757, 0.894);
  const T = (t: string, x: number, y: number, f = font, size = 10, color = dark) =>
    page.drawText(ascii(t), { x, y, size, font: f, color });
  const R = (t: string, xRight: number, y: number, f = font, size = 10, color = dark) => {
    const s = ascii(t); const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: xRight - w, y, size, font: f, color });
  };

  let y = height - M;
  T(FIRMA.naziv, M, y, bold, 18, blue); y -= 20;
  T(FIRMA.naslov, M, y, font, 9, muted); y -= 12;
  T("ID za DDV: " + FIRMA.ddv + "   Maticna st.: " + FIRMA.matica, M, y, font, 9, muted); y -= 12;
  T("IBAN: " + FIRMA.iban + "   " + FIRMA.email, M, y, font, 9, muted);
  R(naslovDok + " " + (r.stevilka ?? ""), width - M, height - M, bold, 14, dark);

  y -= 34;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 1, color: rgb(0.9, 0.92, 0.95) });
  y -= 22;

  const ime = [r.ime, r.priimek].filter(Boolean).join(" ") || "Stranka";
  T("Kupec", M, y, bold, 10, muted); y -= 15;
  T(ime, M, y, font, 11); y -= 13;
  if (r.email) { T(String(r.email), M, y, font, 10, muted); y -= 13; }
  if (kupecNaslov) { T(kupecNaslov, M, y, font, 10, muted); y -= 13; }

  let yd = height - M - 56;
  R("Datum izdaje: " + (r.datum_izdaje ?? ""), width - M, yd, font, 10, dark); yd -= 15;
  R("Rok placila: " + (r.datum_zapadlosti ?? ""), width - M, yd, font, 10, dark);

  y -= 18;
  const rowH = 22;
  const x0 = M, x1 = width - M;
  const drawRow = (label: string, val: string, f = font, bg = false) => {
    if (bg) page.drawRectangle({ x: x0, y: y - 6, width: x1 - x0, height: rowH, color: rgb(0.95, 0.97, 1) });
    T(label, x0 + 6, y, f, 10); R(val, x1 - 6, y, f, 10); y -= rowH;
  };
  page.drawRectangle({ x: x0, y: y - 6, width: x1 - x0, height: rowH, color: blue });
  T("Opis", x0 + 6, y, bold, 10, rgb(1, 1, 1)); R("Znesek", x1 - 6, y, bold, 10, rgb(1, 1, 1)); y -= rowH;

  const osnova = Number(r.osnova ?? 0), ddv = Number(r.ddv ?? 0), znesek = Number(r.znesek ?? 0);
  drawRow(String(r.opis ?? "Storitev"), eur(osnova, r.valuta || "EUR"));
  drawRow("Osnova (brez DDV)", eur(osnova, r.valuta || "EUR"), font, true);
  drawRow("DDV 22 %", eur(ddv, r.valuta || "EUR"));
  y -= 4;
  page.drawRectangle({ x: x0, y: y - 6, width: x1 - x0, height: rowH + 4, color: rgb(0.93, 0.96, 0.99) });
  T("ZA PLACILO", x0 + 6, y, bold, 12, dark); R(eur(znesek, r.valuta || "EUR"), x1 - 6, y, bold, 13, blue);

  const nogaTxt = naslovDok === "PREDRACUN"
    ? "Predracun ni davcni dokument. Koncni racun prejmete po placilu."
    : "Racun je izdan v elektronski obliki in velja brez podpisa in ziga.";
  T(nogaTxt, M, 60, font, 9, muted);

  return b64(await doc.save());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const inp = await req.json();
    const tip = String(inp.tip || "racun").toLowerCase();
    const predracun = tip === "predracun";
    const naslovDok = predracun ? "PREDRACUN" : "RACUN";
    const labelSlo = predracun ? "Predračun" : "Račun";

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Pripravi zapis "r" (osnova/ddv/znesek/opis/...) glede na tip
    let r: any = null;
    if (predracun) {
      if (!inp.stevilka) throw new Error("Manjka stevilka narocila");
      const { data: o } = await sb.from("narocila").select("*").eq("stevilka", inp.stevilka).order("id", { ascending: false }).limit(1).maybeSingle();
      if (!o) throw new Error("Naročilo ni najdeno");
      const total = znesekZa(o);
      const osnova = Math.round((total / 1.22) * 100) / 100;
      const ddv = Math.round((total - osnova) * 100) / 100;
      const zap = new Date(); zap.setDate(zap.getDate() + 8);
      r = {
        stevilka: o.stevilka, ime: o.ime, priimek: o.priimek, email: o.email,
        opis: (o.paket || "Rabimbox") + " - prvi mesec", osnova, ddv, znesek: total, valuta: "EUR",
        datum_izdaje: d(new Date()), datum_zapadlosti: d(zap),
      };
    } else {
      if (!inp.racun_id && !inp.stevilka) throw new Error("Manjka racun_id ali stevilka");
      let query = sb.from("racuni").select("*");
      query = inp.racun_id ? query.eq("id", inp.racun_id) : query.eq("stevilka", inp.stevilka);
      const { data, error } = await query.single();
      if (error || !data) throw new Error("Račun ni najden");
      r = data;
    }
    if (!r.email) throw new Error("Manjka e-naslov stranke");

    // Naslov kupca (če obstaja v tabeli kupci)
    let kupecNaslov = "";
    try {
      const { data: kup } = await sb.from("kupci").select("naslov, postna_stevilka, kraj").eq("email", r.email).limit(1).maybeSingle();
      if (kup) kupecNaslov = [kup.naslov, [kup.postna_stevilka, kup.kraj].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    } catch (_) { /* ignore */ }

    const ime = [r.ime, r.priimek].filter(Boolean).join(" ") || "stranka";
    const uvod = predracun
      ? "Hvala za vaše naročilo. V prilogi je predračun v PDF obliki. Po plačilu vam pošljemo končni račun."
      : "Hvala za vaše naročilo. Račun v PDF obliki je priložen temu sporočilu, spodaj pa so ključni podatki:";
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#364151;max-width:560px;margin:0 auto">
        <div style="background:#6ec1e4;color:#fff;padding:16px 22px;border-radius:8px 8px 0 0">
          <h2 style="margin:0;font-family:'Lexend',Arial,sans-serif"><img src="${LOGO}" alt="" width="30" height="30" style="vertical-align:middle;margin-right:10px;border-radius:6px" />Rabimbox – ${labelSlo} ${r.stevilka}</h2>
        </div>
        <div style="border:1px solid #e5e8ee;border-top:0;padding:22px;border-radius:0 0 8px 8px">
          <p>Pozdravljeni, ${ime}!</p>
          <p>${uvod}</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px 0;color:#7b8794">Številka</td><td style="text-align:right;font-weight:600">${r.stevilka}</td></tr>
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
    try { pdfB64 = await makePdf(r, kupecNaslov, naslovDok); } catch (e) { console.error("PDF napaka:", e); }

    const fname = (predracun ? "Predracun-" : "Racun-") + r.stevilka + ".pdf";
    const body: Record<string, unknown> = {
      from: FROM, to: [r.email], subject: `${labelSlo} ${r.stevilka} – Rabimbox`, html,
    };
    if (pdfB64) body.attachments = [{ filename: fname, content: pdfB64 }];

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Resend napaka: " + (await res.text()));

    // Le pri pravem računu posodobimo status v tabeli racuni
    if (!predracun && r.id) { try { await sb.from("racuni").update({ status: "poslan" }).eq("id", r.id); } catch (_) { /* ignore */ } }

    return new Response(JSON.stringify({ ok: true, tip, pdf: !!pdfB64 }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
