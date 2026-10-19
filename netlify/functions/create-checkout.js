// Creates a Stripe Checkout session for a pay-what-you-want amount.
// Needs the STRIPE_SECRET_KEY environment variable set in Netlify (never put the key in the site code).
const SITE = process.env.SITE_URL || "https://broketobling.com";

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { statusCode: 503, headers, body: JSON.stringify({ error: "Payments are not set up yet" }) };

  let data;
  try { data = JSON.parse(event.body || "{}"); } catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request" }) }; }
  const amount = Math.round(Number(data.amount));
  const email = String(data.email || "").trim().slice(0, 200);
  const gift = data.mode === "gift";
  if (!Number.isFinite(amount) || amount < 100 || amount > 1000000) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Amount must be between $1 and $10,000" }) };
  }

  const name = gift ? "Sow a Seed · Broke to B.L.I.N.G." : "The Broke to B.L.I.N.G. Declarations";
  const description = gift
    ? "A gift that supports free, faith-building resources from Crystal Archie."
    : "Interactive declarations app with prayers, read by Crystal. Pay what you want.";

  const p = new URLSearchParams();
  p.append("mode", "payment");
  p.append("line_items[0][quantity]", "1");
  p.append("line_items[0][price_data][currency]", "usd");
  p.append("line_items[0][price_data][unit_amount]", String(amount));
  p.append("line_items[0][price_data][product_data][name]", name);
  p.append("line_items[0][price_data][product_data][description]", description);
  p.append("line_items[0][price_data][product_data][images][0]", SITE + "/cover.jpg");
  // Stripe Tax category (required by this account's Managed Payments): electronically supplied service.
  p.append("line_items[0][price_data][product_data][tax_code]", "txcd_10000000");
  p.append("success_url", SITE + "/thanks.html?session_id={CHECKOUT_SESSION_ID}");
  p.append("cancel_url", SITE + "/" + (gift ? "?give=1" : ""));
  p.append("submit_type", gift ? "donate" : "pay");
  p.append("metadata[kind]", gift ? "gift" : "product");
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) p.append("customer_email", email);

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });
  const j = await r.json();
  if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: (j.error && j.error.message) || "Stripe error" }) };
  return { statusCode: 200, headers, body: JSON.stringify({ url: j.url }) };
};
