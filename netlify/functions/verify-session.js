// Confirms a finished Stripe Checkout session and records the payment once in Supabase.
// Needs STRIPE_SECRET_KEY in Netlify. Uses the public (insert-only) Supabase key, so no database secret is stored here.
const SB_URL = "https://ukneifazkwdjljswxoab.supabase.co";
const SB_KEY = "sb_publishable_45MaLGTuGjW493HuzgwQ5w_YFossgrZ";

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  const key = process.env.STRIPE_SECRET_KEY;
  const id = (event.queryStringParameters || {}).session_id || "";
  if (!key) return { statusCode: 503, headers, body: JSON.stringify({ error: "Payments are not set up yet" }) };
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad session" }) };

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(id), {
    headers: { Authorization: "Bearer " + key },
  });
  const s = await r.json();
  if (!r.ok) return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };

  const paid = s.payment_status === "paid";
  const email = (s.customer_details && s.customer_details.email) || s.customer_email || null;
  const name = (s.metadata && s.metadata.first_name) || (s.customer_details && s.customer_details.name) || null;
  const kind = (s.metadata && s.metadata.kind) === "gift" ? "gift" : "product";

  if (paid) {
    // The ref column is unique, so reloading the thank-you page never records the same payment twice.
    await fetch(SB_URL + "/rest/v1/bling_responses", {
      method: "POST",
      headers: { apikey: SB_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ kind: "purchase", email, name: name ? String(name).slice(0, 60) : null, amount_cents: s.amount_total, ref: s.id, focus: kind === "gift" ? "Gift (Sow a Seed)" : "Pay what you want" }),
    }).catch(() => {});
  }
  return { statusCode: 200, headers, body: JSON.stringify({ paid, kind, amount: s.amount_total, email, name: (s.metadata && s.metadata.first_name) || null }) };
};
