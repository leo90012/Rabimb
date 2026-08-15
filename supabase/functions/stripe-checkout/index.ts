// Rabimbox – Supabase Edge Function: stripe-checkout
// Ustvari Stripe Checkout sejo (enkratno plačilo prvega meseca) za dano naročilo.
// Znesek se VEDNO izračuna na strežniku iz naročila (ne zaupamo klientu).
//
// Skrivnosti (Supabase -> Project Settings -> Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY  – tajni ključ iz Stripe (sk_test_... / sk_live_...)
// (SUPABASE_URL in SUPABASE_SERVICE_ROLE_KEY sta na voljo samodejno.)

import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const stripe = new Stripe(STRIPE_SECRET, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Cenik (mora se ujemati s checkout.js)
function znesekZa(o: any): number {
  const tip = String(o.tip || "").toLowerCase();
  const n = Number(o.st_boxov) || 0;
  if (tip.includes("izpos")) {
    const m: Record<number, number> = { 20: 49, 40: 89, 60: 119, 80: 149 };
    return m[n] ?? 0;
  }
  // skladiščenje: cena/box glede na količino
  const per = n <= 10 ? 3.90 : n <= 25 ? 3.60 : 3.30;
  return Math.round(n * per * 100) / 100;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { ref, pageUrl } = await req.json();
    if (!ref) throw new Error("Manjka ref (številka naročila).");

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: o, error } = await sb.from("narocila").select("*").eq("stevilka", ref).order("id", { ascending: false }).limit(1).maybeSingle();
    if (error || !o) throw new Error("Naročilo ni najdeno.");

    const znesek = znesekZa(o);
    if (znesek <= 0) throw new Error("Neveljaven znesek za to naročilo.");

    const base = String(pageUrl || "").split("?")[0] || "https://rabimbox.si/narocilo/index.html";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: o.email || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: Math.round(znesek * 100),
          product_data: { name: (o.paket || "Rabimbox") + " – prvi mesec" },
        },
      }],
      metadata: { ref: String(ref) },
      success_url: base + "?placilo=uspeh&ref=" + encodeURIComponent(String(ref)),
      cancel_url: base + "?placilo=preklic&ref=" + encodeURIComponent(String(ref)),
    });

    return new Response(JSON.stringify({ url: session.url }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
