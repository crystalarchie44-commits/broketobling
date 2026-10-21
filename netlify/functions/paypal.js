// PayPal + Venmo checkout (PayPal Orders v2, live).
// Needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in Netlify (secret never in the site code).
// POST {action:"config"} -> {clientId}
// POST {action:"create", amount(cents), mode, name, email, pub} -> {id}
// POST {action:"capture", id} -> {ok, amount, kind, name, email}  (records the payment in Supabase once)
const API = "https://api-m.paypal.com";
const SB_URL = "https://ukneifazkwdjljswxoab.supabase.co";
const SB_KEY = "sb_publishable_45MaLGTuGjW493HuzgwQ5w_YFossgrZ";

async function token(id, secret) {
  const r = await fetch(API + "/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(id + ":" + secret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const j = await r.json();
  if (!r.ok) throw new Error("PayPal sign-in failed");
  return j.access_token;
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  const out = (code, body) => ({ statusCode: code, headers, body: JSON.stringify(body) });
  if (event.httpMethod !== "POST") return out(405, { error: "Method not allowed" });
  const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) return out(503, { error: "PayPal is not set up yet" });
  let d;
  try { d = JSON.parse(event.body || "{}"); } catch (e) { return out(400, { error: "Bad request" }); }

  if (d.action === "config") return out(200, { clientId: id });

  try {
    const t = await token(id, secret);
    const H = { Authorization: "Bearer " + t, "Content-Type": "application/json" };

    if (d.action === "create") {
      const cents = Math.round(Number(d.amount));
      if (!Number.isFinite(cents) || cents < 100 || cents > 1000000) return out(400, { error: "Amount must be between $1 and $10,000" });
      const gift = d.mode === "gift";
      const meta = JSON.stringify({ k: gift ? "gift" : "product", n: String(d.name || "").trim().slice(0, 60), e: String(d.email || "").trim().slice(0, 200), p: d.pub ? 1 : 0 }).slice(0, 255);
      const r = await fetch(API + "/v2/checkout/orders", {
        method: "POST", headers: H,
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            amount: { currency_code: "USD", value: (cents / 100).toFixed(2) },
            description: gift ? "Sow a Seed · Broke to B.L.I.N.G." : "The Broke to B.L.I.N.G. Declarations",
            custom_id: meta,
          }],
          application_context: { brand_name: "Broke to B.L.I.N.G.", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" },
        }),
      });
      const j = await r.json();
      if (!r.ok) return out(502, { error: (j.details && j.details[0] && j.details[0].description) || j.message || "PayPal error" });
      return out(200, { id: j.id });
    }

    if (d.action === "capture") {
      if (!/^[A-Z0-9]{8,40}$/.test(String(d.id || ""))) return out(400, { error: "Bad order" });
      let r = await fetch(API + "/v2/checkout/orders/" + d.id + "/capture", { method: "POST", headers: H, body: "{}" });
      let j = await r.json();
      if (!r.ok && j.details && j.details[0] && j.details[0].issue === "ORDER_ALREADY_CAPTURED") {
        r = await fetch(API + "/v2/checkout/orders/" + d.id, { headers: H }); j = await r.json();
      }
      if (!r.ok) return out(502, { error: (j.details && j.details[0] && j.details[0].description) || j.message || "PayPal error" });
      const pu = (j.purchase_units || [])[0] || {};
      const cap = ((pu.payments || {}).captures || [])[0] || {};
      if (j.status !== "COMPLETED" || cap.status !== "COMPLETED") return out(200, { ok: false, status: cap.status || j.status });
      let m = {}; try { m = JSON.parse(pu.custom_id || "{}"); } catch (e) {}
      const payer = j.payer || {};
      const name = m.n || [payer.name && payer.name.given_name].filter(Boolean).join(" ") || null;
      const email = m.e || payer.email_address || null;
      const cents = Math.round(Number((cap.amount || {}).value || 0) * 100);
      await fetch(SB_URL + "/rest/v1/bling_responses", {
        method: "POST",
        headers: { apikey: SB_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ kind: "purchase", email, name, amount_cents: cents, ref: "paypal_" + cap.id, show_public: !!m.p, focus: m.k === "gift" ? "Gift (Sow a Seed) via PayPal" : "Pay what you want via PayPal" }),
      }).catch(() => {});
      return out(200, { ok: true, amount: cents, kind: m.k || "product", name, email });
    }
    return out(400, { error: "Unknown action" });
  } catch (e) {
    return out(502, { error: "PayPal is unavailable right now. Please try again." });
  }
};
