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
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '365', 10) || 365, 1), 3650);
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  /* Paystack pages at 100. Books sell in ones and twos, so five pages is
     ample and the cap stops a runaway loop on a worker. */
  const rows = [];
  for (let page = 1; page <= 5; page++) {
    let res, out;
    try {
      res = await fetch('https://api.paystack.co/transaction?status=success&perPage=100&page=' + page
                        + '&from=' + from,
        { headers: { Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY } });
      out = await res.json();
    } catch {
      return json({ ok: false, error: 'Could not reach Paystack.' }, 502);
    }
    if (!res.ok || !out || out.status !== true || !Array.isArray(out.data)) {
      return json({ ok: false, error: 'Paystack did not answer with a list.' }, 502);
    }
    rows.push(...out.data);
    if (out.data.length < 100) break;
  }

  /* Only ours. A reference we minted starts bk_ for a book and up_ for a
     one-click, so nothing else he sells through Paystack can land in here
     and inflate the number. */
  const mine = rows.filter(t => /^(bk_|up_)/.test(String(t.reference || '')));

  const perBook = {};
  for (const slug of Object.keys(BOOKS)) {
    perBook[slug] = { title: BOOKS[slug].title, sales: 0, gross: 0, withCourse: 0 };
  }
  let gross = 0, bumpGross = 0, upsellGross = 0, unmatched = 0;

  for (const t of mine) {
    const amount = Number(t.amount) || 0;
    gross += amount;
    const meta = t.metadata || {};
    const slug = String(meta.book || '').toLowerCase();
    const isUpsell = !!meta.upsell;
    if (!perBook[slug]) { unmatched += amount; continue; }
    perBook[slug].sales += 1;
    perBook[slug].gross += amount;
    if (isUpsell) { upsellGross += amount; continue; }
    const over = amount - BOOKS[slug].price;
    if (over > 0) { perBook[slug].withCourse += 1; bumpGross += over; }
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

  return json({
    ok: true,
    since: from,
    days,
    counted: mine.length,
    gross,
    bookGross: gross - bumpGross - upsellGross - unmatched,
    bumpGross,
    upsellGross,
    unmatched,
    perBook,
    recent,
    note: 'Every amount is in cents, and every one of them was really paid. '
        + 'Paystack is asked directly, so an abandoned checkout never counts.',
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
