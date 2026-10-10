/* Cloudflare Pages Function: POST /api/checkout
 *
 * Starts a book purchase, with or without the one-click course added.
 *
 * Why this exists rather than a Paystack buy link. A buy link sells one
 * fixed thing for one fixed price, so there is no way to let somebody tick
 * a box and change what they are paying for. The order bump is the whole
 * point of this page, so the amount has to be worked out here and the
 * transaction started through Paystack's API.
 *
 * THE PRICE IS DECIDED HERE AND NOWHERE ELSE. The browser sends which book
 * and whether the bump was ticked. It never sends an amount, and if it did
 * it would be ignored. Anyone can edit what their own browser sends.
 *
 * What goes to Paystack in metadata is what /api/download reads back when
 * it verifies the payment, so the two have to agree about the slugs.
 *
 * Env: PAYSTACK_SECRET_KEY, and FUNNEL for the pending-order record.
 */

/* Prices in cents, set 10 Oct 2026 on the low-ticket coach's recommendation.
   The bump is priced at or above the book on purpose: the book is the hook,
   the bump is where the margin is. That is the opposite of retail, where a
   bump is a cheap accessory, and it is deliberate. */
const CATALOGUE = {
  responsibility: {
    title: 'The Empowering Truth of Responsibility',
    price: 14700,
    bump: { key: 'clarity-course', price: 29700, programme: 'book-responsibility-course' },
  },
  habits: {
    title: '10 Habits of Happy Relationships',
    price: 19700,
    bump: { key: 'relationship-course', price: 29700, programme: 'book-habits-course' },
  },
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function onRequestPost({ request, env }) {
  let p;
  try { p = await request.json(); }
  catch { return json({ ok: false, error: 'bad json' }, 400); }

  const slug = String(p.book || '').toLowerCase();
  const item = CATALOGUE[slug];
  if (!item) return json({ ok: false, error: 'Unknown book.' }, 400);

  const email = String(p.email || '').trim().toLowerCase();
  const name = String(p.name || '').trim().slice(0, 80);
  if (!EMAIL.test(email)) return json({ ok: false, error: 'That email does not look right.' }, 400);
  if (!name) return json({ ok: false, error: 'I need a name for the receipt.' }, 400);

  const wantsBump = p.bump === true;
  const amount = item.price + (wantsBump ? item.bump.price : 0);

  if (!env.PAYSTACK_SECRET_KEY) return json({ ok: false, error: 'Checkout is not configured yet.' }, 503);

  const origin = new URL(request.url).origin;
  const reference = 'bk_' + slug.slice(0, 4) + '_' + rid();

  let res, out;
  try {
    res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount,
        currency: 'ZAR',
        reference,
        /* Paystack sends them back here with the reference appended. The
           thank-you page then trades it for the file. */
        callback_url: origin + '/thanks/' + slug + '/',
        metadata: {
          book: slug,
          bump: wantsBump ? item.bump.key : null,
          programme: wantsBump ? item.bump.programme : null,
          name,
          /* Shown to him in the Paystack dashboard, so a transaction is
             readable without looking anything up. */
          custom_fields: [
            { display_name: 'Book', variable_name: 'book', value: item.title },
            { display_name: 'Course added', variable_name: 'bump', value: wantsBump ? 'Yes' : 'No' },
          ],
        },
      }),
    });
    out = await res.json();
  } catch {
    return json({ ok: false, error: 'Could not reach the payment page. Try again in a moment.' }, 502);
  }

  if (!res.ok || !out || out.status !== true || !out.data || !out.data.authorization_url) {
    return json({ ok: false, error: 'Could not start the payment. Try again in a moment.' }, 502);
  }

  /* Remember what was ordered, so the thank-you page can grant the course
     without trusting anything the browser says, and so a payment that
     arrives with nobody watching can still be reconciled. Thirty days. */
  if (env.FUNNEL) {
    try {
      await env.FUNNEL.put('order:' + reference, JSON.stringify({
        book: slug, bump: wantsBump ? item.bump.key : null,
        programme: wantsBump ? item.bump.programme : null,
        amount, email, name, at: Date.now(),
      }), { expirationTtl: 60 * 60 * 24 * 30 });
    } catch { /* the Paystack metadata is the real record */ }
  }

  return json({ ok: true, url: out.data.authorization_url, reference, amount });
}

function rid() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
