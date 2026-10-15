/* Cloudflare Pages Function: GET /api/sales
 *
 * What the books have earned, read from a ledger we write ourselves.
 *
 * Two earlier attempts are worth recording, because both looked right.
 *
 * Paystack's transaction list: asked on 15 Oct 2026 it returned 99
 * transactions, every one carrying Paystack's own reference and not one of
 * ours, and it skipped the day of the only real book sale. Wrong source.
 *
 * Reconciling our order records against verify: an order record is written
 * when a checkout STARTS, so the set is full of abandoned carts, and asking
 * Paystack about each one is a pile of calls to learn mostly nothing.
 *
 * So a sale is written down at the moment it is known to be a sale, by the
 * two places that already prove a payment: /api/download, which verifies
 * before releasing a book, and the Paystack webhook, which is signed. Both
 * key on the reference, so a sale recorded twice is still one sale.
 *
 * That makes this endpoint a read, nothing more. No Paystack calls, no
 * guessing, and it cannot report money that was not taken.
 *
 * Env: SALES_KEY. Bindings: FUNNEL.
 */

const BOOKS = {
  responsibility: { title: 'The Empowering Truth of Responsibility', price: 14700 },
  habits:         { title: '10 Habits of Happy Relationships',       price: 19700 },
};

export async function onRequestGet({ request, env }) {
  const given = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.SALES_KEY || !given || given !== env.SALES_KEY) {
    return json({ ok: false, error: 'Not allowed.' }, 401);
  }
  if (!env.FUNNEL) return json({ ok: false, error: 'Not configured.' }, 503);

  const names = [];
  let cursor;
  for (let round = 0; round < 10; round++) {
    const page = await env.FUNNEL.list({ prefix: 'sale:', limit: 1000, cursor });
    names.push(...page.keys.map(k => k.name));
    if (page.list_complete) break;
    cursor = page.cursor;
  }

  const sales = [];
  for (let i = 0; i < names.length; i += 20) {
    const batch = await Promise.all(names.slice(i, i + 20).map(async (n) => {
      try { return JSON.parse(await env.FUNNEL.get(n) || 'null'); } catch { return null; }
    }));
    sales.push(...batch.filter(Boolean));
  }

  const perBook = {};
  for (const slug of Object.keys(BOOKS)) {
    perBook[slug] = { title: BOOKS[slug].title, sales: 0, gross: 0, withCourse: 0 };
  }
  let gross = 0, bumpGross = 0, upsellGross = 0, unmatched = 0;
  for (const s of sales) {
    const amount = Number(s.amount) || 0;
    gross += amount;
    const slug = String(s.book || '').toLowerCase();
    if (!perBook[slug]) { unmatched += amount; continue; }
    perBook[slug].sales += 1;
    perBook[slug].gross += amount;
    if (s.upsell) { upsellGross += amount; continue; }
    const over = amount - BOOKS[slug].price;
    if (over > 0) { perBook[slug].withCourse += 1; bumpGross += over; }
  }

  const recent = sales
    .slice()
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, 12)
    .map(s => ({
      at: s.at || null, amount: Number(s.amount) || 0, channel: s.channel || null,
      book: s.book || null, upsell: s.upsell || null, name: s.name || null,
      reference: s.reference || null, via: s.via || null,
    }));

  return json({
    ok: true,
    sales: sales.length,
    gross,
    bookGross: gross - bumpGross - upsellGross - unmatched,
    bumpGross,
    upsellGross,
    unmatched,
    perBook,
    recent,
    note: 'Every amount is in cents and every one was really paid. A sale is '
        + 'written down when a payment is proven, either by the download '
        + 'releasing a book or by Paystack telling us directly, so nothing '
        + 'here is a checkout somebody abandoned.',
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
