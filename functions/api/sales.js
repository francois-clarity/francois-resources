/* Cloudflare Pages Function: GET /api/sales
 *
 * What the books have actually earned, read from Paystack, which is the only
 * thing that knows what was really paid.
 *
 * Not from our own order records. Those are written when a checkout STARTS,
 * so counting them would count abandoned carts as sales and tell Francois he
 * had made money he had not. On 12 Oct there were five order records and one
 * real payment.
 *
 * Protected, because this is revenue. Send the key as a bearer token. It is a
 * key of its own, not the automation key, so the page that shows the numbers
 * never needs the one that can enrol people.
 *
 * Env: PAYSTACK_SECRET_KEY, SALES_KEY.
 *
 * Returns totals per book, what the bumps added, and the most recent sales,
 * all in cents, with `since` echoed back so a number can never be read
 * without knowing the window it covers.
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
  if (!env.PAYSTACK_SECRET_KEY) return json({ ok: false, error: 'Not configured.' }, 503);

  const url = new URL(request.url);
  if (!env.FUNNEL) return json({ ok: false, error: 'Not configured.' }, 503);

  /* Every order we ever started, then ask Paystack about each one.
   *
   * The obvious way was Paystack's transaction list, and it does not work
   * here: asked on 15 Oct 2026 it returned 99 transactions, all carrying
   * Paystack's own references (T3004..., long hex), none of ours, and it
   * skipped the day of his real book purchase entirely. Meanwhile verify on
   * that same reference answers success, which is how his book was released.
   *
   * So this reconciles the other way round. We know every reference we
   * minted, because we wrote it down when the checkout started, and verify
   * is the call already proven to work on them. A record with no successful
   * payment is an abandoned checkout and counts as nothing.
   */
  const keys = [];
  let cursor;
  for (let round = 0; round < 10; round++) {
    const page = await env.FUNNEL.list({ prefix: 'order:', limit: 1000, cursor });
    keys.push(...page.keys.map(k => k.name));
    if (page.list_complete) break;
    cursor = page.cursor;
  }

  const scanned = keys.length;
  const mine = [];
  /* A handful at a time, so a worker is never waiting on a hundred calls
     at once. */
  for (let i = 0; i < keys.length; i += 6) {
    const batch = keys.slice(i, i + 6);
    const got = await Promise.all(batch.map(async (name) => {
      const ref = name.slice('order:'.length);
      let order = null;
      try { order = JSON.parse(await env.FUNNEL.get(name) || 'null'); } catch { /* keep going */ }
      try {
        const res = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(ref),
          { headers: { Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY } });
        const v = await res.json();
        if (!res.ok || !v || v.status !== true || !v.data) return null;
        const t = v.data;
        if (String(t.status).toLowerCase() !== 'success') return null;
        return {
          reference: ref,
          amount: Number(t.amount) || 0,
          at: t.paid_at || t.created_at || null,
          channel: t.channel || null,
          book: (order && order.book) || (t.metadata || {}).book || null,
          bump: (order && order.bump) || null,
          name: (order && order.name) || null,
          upsell: (t.metadata || {}).upsell || null,
        };
      } catch { return null; }
    }));
    mine.push(...got.filter(Boolean));
  }

  const perBook = {};
  for (const slug of Object.keys(BOOKS)) {
    perBook[slug] = { title: BOOKS[slug].title, sales: 0, gross: 0, withCourse: 0 };
  }
  let gross = 0, bumpGross = 0, upsellGross = 0, unmatched = 0;
  for (const t of mine) {
    gross += t.amount;
    const slug = String(t.book || '').toLowerCase();
    if (!perBook[slug]) { unmatched += t.amount; continue; }
    perBook[slug].sales += 1;
    perBook[slug].gross += t.amount;
    if (t.upsell) { upsellGross += t.amount; continue; }
    const over = t.amount - BOOKS[slug].price;
    if (over > 0) { perBook[slug].withCourse += 1; bumpGross += over; }
  }

  if (url.searchParams.get('debug') === '1') {
    return json({ ok: true, scanned, matched: mine.length,
      sample: mine.slice(0, 25).map(t => ({ reference: t.reference, at: (t.at || '').slice(0, 10), book: t.book })) });
  }

  const recent = mine
    .slice()
    .sort((a, b) => String(b.paid_at || b.created_at || '').localeCompare(String(a.paid_at || a.created_at || '')))
    .slice(0, 12)
    .map(t => ({
      at: t.paid_at || t.created_at || null,
      amount: Number(t.amount) || 0,
      channel: t.channel || null,
      book: (t.metadata || {}).book || null,
      upsell: (t.metadata || {}).upsell || null,
      name: (t.metadata || {}).name || null,
      reference: t.reference,
    }));

  /* With ?debug=1, the references and dates it looked at and nothing else.
     No amounts, no names. It exists because the first run scanned 99
     transactions and matched none, and a count cannot tell you why. */
  if (url.searchParams.get('debug') === '1') {
    return json({
      ok: true, scanned, matched: mine.length, since: from,
      sample: rows.slice(0, 25).map(t => ({
        reference: t.reference,
        at: (t.paid_at || t.created_at || '').slice(0, 10),
        status: t.status,
      })),
    });
  }

  return json({
    ok: true,
    since: 'every order recorded, which is thirty days of them',
    scanned,
    counted: mine.length,
    gross,
    bookGross: gross - bumpGross - upsellGross - unmatched,
    bumpGross,
    upsellGross,
    unmatched,
    perBook,
    recent,
    note: 'Every amount is in cents, and every one of them was really paid. '
        + 'Each one was checked with Paystack one at a time, so an abandoned '
        + 'checkout counts as nothing. Order records last thirty days, so this '
        + 'is the last thirty days of sales.',
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
