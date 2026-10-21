// AI summary for the admin dashboard.
// Checks the admin password through the database, builds TOTALS ONLY (no names or emails),
// and asks Claude for a short written summary with audience personas.
// Needs ANTHROPIC_API_KEY in Netlify. Optional: ANTHROPIC_MODEL.
const SB_URL = "https://ukneifazkwdjljswxoab.supabase.co";
const SB_KEY = "sb_publishable_45MaLGTuGjW493HuzgwQ5w_YFossgrZ";
const DAY = 864e5;

const count = (list, fn) => {
  const c = {};
  list.forEach((r) => [].concat(fn(r) || []).forEach((v) => { if (v) c[v] = (c[v] || 0) + 1; }));
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
};

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  const out = (code, body) => ({ statusCode: code, headers, body: JSON.stringify(body) });
  if (event.httpMethod !== "POST") return out(405, { error: "Method not allowed" });
  let data;
  try { data = JSON.parse(event.body || "{}"); } catch (e) { return out(400, { error: "Bad request" }); }

  const r = await fetch(SB_URL + "/rest/v1/rpc/admin_responses", {
    method: "POST",
    headers: { apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_password: String(data.password || "") }),
  });
  const res = await r.json().catch(() => null);
  if (!res || !res.ok) return out(401, { error: (res && res.error) || "Please sign in again." });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return out(503, { code: "no_key", error: "AI summaries are not switched on yet." });

  const days = Math.max(0, Math.min(3650, Number(data.days) || 0));
  const since = days ? Date.now() - days * DAY : 0;
  const rows = (res.rows || []).filter((x) => new Date(x.created_at).getTime() > since);
  const by = (k) => rows.filter((x) => x.kind === k);
  const dl = by("download"), pu = by("purchase"), re = by("research"), wl = by("waitlist");
  const cents = pu.map((x) => x.amount_cents || 0).sort((a, b) => a - b);
  const seasons = count(re, (x) => x.season);

  const totals = {
    period: days ? `last ${days} days` : "all time",
    free_downloads: dl.length,
    payments: pu.length,
    raised_usd: cents.reduce((a, b) => a + b, 0) / 100,
    median_payment_usd: cents.length ? cents[Math.floor((cents.length - 1) / 2)] / 100 : 0,
    setup_profiles_answered: re.length,
    called_to_create_waitlist: wl.length,
    waitlist_from_course_page: wl.filter((x) => x.focus === "Called to Create page").length,
    season_counts: Object.fromEntries(seasons),
    rebuilding_focus_counts: Object.fromEntries(count(re, (x) => x.focus)),
    skills_wanted_counts: Object.fromEntries(count(re, (x) => x.skills)),
    learning_format_counts: Object.fromEntries(count(re, (x) => x.learn)),
    by_season: Object.fromEntries(seasons.map(([s, n]) => {
      const g = re.filter((x) => x.season === s);
      return [s, { people: n, top_focus: count(g, (x) => x.focus).slice(0, 3), top_skills: count(g, (x) => x.skills).slice(0, 3), top_formats: count(g, (x) => x.learn).slice(0, 2) }];
    })),
  };

  const prompt = `You are a sharp, warm marketing analyst for "Broke to B.L.I.N.G. Declarations", a free (pay-what-you-want) faith-based devotional app by Crystal Archie for women rebuilding their lives with God. Gifts also support The Treasured Foundation in Ethiopia. Crystal is also building a waitlist for "Called to Create", her course on growing a faith-based Instagram following without ads.

Here are aggregate numbers only (no personal data):
${JSON.stringify(totals, null, 2)}

Write a concise summary for Crystal and her team. Use this exact structure in simple markdown:
## The big picture
2–3 sentences on what is happening, with the key numbers and percentages.
## Who's showing up
2–4 personas based on the season, focus, skills and learning-format data. For each: a bullet starting with a bold persona name and its share (e.g. **The Fresh Start (40%)**), then one sentence on who she is and what she needs.
## What to do next
3 specific, practical bullets (content ideas, offers, or Called to Create positioning) grounded in the data.

Rules: be honest about small sample sizes (under ~30 people means "early signal"). Never invent numbers. Plain, encouraging language. Under 300 words.`;

  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 900, messages: [{ role: "user", content: prompt }] }),
  });
  const j = await ai.json().catch(() => ({}));
  if (!ai.ok) return out(502, { error: "The AI service returned an error: " + ((j.error && j.error.message) || ai.status) });
  const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
  return out(200, { summary: text, people: re.length });
};
