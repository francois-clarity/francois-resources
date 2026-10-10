/* Cloudflare Pages Function: POST /api/upsell  { ref, offer }
 *
 * The one-click offer after a book is paid for.
 *
 * Paystack hands back an authorization with the successful card payment. If
 * it is reusable, that card can be charged again without sending the buyer
 * through a checkout, which is the whole point: a second yes should cost one
 * click, not a second set of card details.
 *
 * THE RAIL IS BUILT, THE PRODUCTS ARE NOT ATTACHED. Every offer below is
 * disabled. Nothing on this endpoint can take a cent until Francois picks
 * what goes in bump two and bump three, and `enabled` is set to true with a
 * `deliver` that actually hands the thing over. A disabled offer refuses and
 * says so, rather than charging for something nobody can deliver.
 *
 * What it checks, in order, refusing on the first failure:
 *   1. the offer exists, is enabled, and belongs to the book that was bought
 *   2. this buyer has not already taken it
 *   3. the parent payment is real, and Paystack says it succeeded
 *   4. the offer window has not closed
 *   5. the card is one Paystack will let us charge again
 * Then it charges, records it, and delivers.
 *
 * Deliberately refuses rather than guesses. A buyer who cannot be charged in
 * one click is sent to an ordinary checkout instead, which always works.
 *
 * Env: PAYSTACK_SECRET_KEY, AUTOMATION_KEY, optional PLATFORM_URL,
 *      RESULTS_MAILER_URL and RESULTS_MAILER_KEY for the alert.
 * Bindings: FUNNEL.
 */

/* How long after paying a one-click offer stays chargeable. A page left open
   overnight must not be able to charge a card the next morning: by then the
   buyer has forgotten the offer and the charge looks like fraud to them. */
const WINDOW_MINUTES = 45;

const OFFERS = {
  /* Bump two. Waiting on Q15 and Q16. */
  'attachment-couples': {
    enabled: false,
    forBooks: ['habits'],
    price: 19700,
    title: 'Attachment Style, the couples read',
    blurb: 'Both of you do it, and the result puts you on one grid and names the dance your two styles make.',
    deliver: null,
  },
  'past-still-lives': {
    enabled: false,
    forBooks: ['responsibility'],
    price: 19700,
    title: 'Where the Past Still Lives',
    blurb: 'Which old wounds are still running the decisions you make today.',
    deliver: null,
  },
  /* Bump three, the other book. Waiting on Q17. */
  'other-book-habits': {
    enabled: false,
    forBooks: ['responsibility'],
    price: 9700,
    title: '10 Habits of Happy Relationships',
    blurb: 'The other book, at R97 instead of R197, because you have already bought one.',
    deliver: { kind: 'book', book: 'habits', match: '10 habits' },
  },
  'other-book-responsibility': {
    enabled: false,
    forBooks: ['habits'],
    price: 9700,
    title: 'The Empowering Truth of Responsibility',
    blurb: 'The other book, at R97 instead of R147, because you have already bought one.',
    deliver: { kind: 'book', book: 'responsibility', match: 'empowering truth' },
  },
};

/* GET /api/upsell?ref=...  What, if anything, to show this buyer.
 *
 * The page asks rather than being told, so a buyer who bought the other
 * book, or who has already taken the offer, never sees a button that would
 * fail when they press it. It does not call Paystack: this is a read, and
 * the POST does the real checking before a cent moves. */
export async function onRequestGet({ request, env }) {
  const ref = String(new URL(request.url).searchParams.get('ref') || '').trim().slice(0, 120);
  if (!ref || !env.FUNNEL) return json({ ok: true, offer: null });

  const raw = await env.FUNNEL.get('order:' + ref);
  if (!raw) return json({ ok: true, offer: null });
  let order;
  try { order = JSON.parse(raw); } catch { return json({ ok: true, offer: null }); }

  for (const [key, o] of Object.entries(OFFERS)) {
    if (!o.enabled || !o.deliver) continue;
    if (!o.forBooks.includes(order.book)) continue;
    if (await env.FUNNEL.get('upsell:' + ref + ':' + key)) continue;   // already theirs
    return json({ ok: true, offer: { key, title: o.title, blurb: o.blurb, price: o.price } });
  }
  return json({ ok: true, offer: null });
}

export async function onRequestPost({ request, env }) {
  let p;
  try { p = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
  const ref = String(p.ref || '').trim().slice(0, 120);
  const key = String(p.offer || '').trim().slice(0, 60);
  if (!ref || !key) return json({ ok: false, error: 'Nothing to add.' }, 400);
  if (!env.FUNNEL) return json({ ok: false, error: 'Not configured.' }, 503);

  const offer = OFFERS[key];
  if (!offer) return json({ ok: false, error: 'Unknown offer.' }, 400);
  if (!offer.enabled || !offer.deliver) {
    return json({ ok: false, error: 'That is not on sale yet.' }, 409);
  }

  // 2. Already taken. Say what they got rather than charging twice.
  const takenKey = 'upsell:' + ref + ':' + key;
  const already = await env.FUNNEL.get(takenKey);
  if (already) {
    try { return json({ ok: true, existed: true, ...JSON.parse(already) }); }
    catch { return json({ ok: true, existed: true }); }
  }

  const raw = await env.FUNNEL.get('order:' + ref);
  if (!raw) return json({ ok: false, error: 'That order is not one of ours.' }, 403);
  let order;
  try { order = JSON.parse(raw); } catch { return json({ ok: false, error: 'That order is not one of ours.' }, 403); }
  if (!offer.forBooks.includes(order.book)) {
    return json({ ok: false, error: 'That offer does not go with this book.' }, 403);
  }

  // 3. The parent payment has to be real and paid.
  if (!env.PAYSTACK_SECRET_KEY) return json({ ok: false, error: 'Not configured.' }, 503);
  let tx;
  try {
    const res = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(ref),
      { headers: { Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY } });
    const v = await res.json();
    if (!res.ok || !v || v.status !== true || !v.data) return json({ ok: false, error: 'Payment not found.' }, 403);
    tx = v.data;
  } catch {
    return json({ ok: false, error: 'Could not reach the payment provider.' }, 502);
  }
  if (String(tx.status).toLowerCase() !== 'success') return json({ ok: false, error: 'Payment not completed.' }, 403);

  // 4. The window.
  const paidAt = Date.parse(tx.paid_at || tx.paidAt || tx.created_at || '') || order.at || 0;
  if (paidAt && Date.now() - paidAt > WINDOW_MINUTES * 60 * 1000) {
    return json({ ok: false, expired: true, error: 'This offer has closed.' }, 410);
  }

  /* 5. A card Paystack will let us charge again. A buyer who paid by
     SnapScan, Scan to Pay or EFT has no reusable authorization, which is not
     a failure, just a different route: they get an ordinary checkout. */
  const auth = tx.authorization || {};
  if (!auth.authorization_code || auth.reusable !== true) {
    return json({ ok: false, needsCheckout: true, price: offer.price,
                  error: 'That payment method cannot be charged again in one click.' }, 409);
  }

  const upRef = 'up_' + key.slice(0, 8).replace(/[^a-z0-9]/g, '') + '_' + rid();
  let charge;
  try {
    const res = await fetch('https://api.paystack.co/transaction/charge_authorization', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorization_code: auth.authorization_code,
        email: order.email,
        amount: offer.price,
        currency: 'ZAR',
        reference: upRef,
        metadata: {
          upsell: key, parent: ref, book: offer.deliver.book || null,
          name: order.name || null, phone: order.phone || null,
          custom_fields: [
            { display_name: 'Added after paying', variable_name: 'upsell', value: offer.title },
            { display_name: 'With order', variable_name: 'parent', value: ref },
          ],
        },
      }),
    });
    charge = await res.json();
    if (!res.ok || !charge || charge.status !== true || !charge.data) {
      return json({ ok: false, declined: true, error: 'The card was not charged. Nothing has been taken.' }, 402);
    }
  } catch {
    return json({ ok: false, error: 'Could not reach the payment provider. Nothing has been taken.' }, 502);
  }
  if (String(charge.data.status).toLowerCase() !== 'success') {
    return json({ ok: false, declined: true, error: 'The card was not charged. Nothing has been taken.' }, 402);
  }

  /* Paid. From here the money is taken, so nothing below may refuse: whatever
     cannot be handed over automatically is recorded and emailed to him. */
  const got = await deliver(env, offer, order, upRef);
  const record = { offer: key, title: offer.title, price: offer.price, reference: upRef, ...got };
  await env.FUNNEL.put(takenKey, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 90 }).catch(() => {});
  if (!got.delivered) await alert(env, upRef, order, offer);
  return json({ ok: true, ...record });
}

/* Hands over what was bought. A book is released by /api/download against
   this new reference, which verifies it with Paystack exactly as it does for
   a first purchase, so nothing here has to be trusted. */
async function deliver(env, offer, order, upRef) {
  const d = offer.deliver;
  if (d.kind === 'book') {
    return { delivered: true, kind: 'book',
             url: '/api/download?book=' + encodeURIComponent(d.book) + '&ref=' + encodeURIComponent(upRef) };
  }
  if (d.kind === 'course') {
    if (!env.AUTOMATION_KEY) return { delivered: false, kind: 'course' };
    const platform = (env.PLATFORM_URL || 'https://clarity.francoisesterhuizen.com').replace(/\/+$/, '');
    try {
      const res = await fetch(platform + '/api/automation/enrol', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.AUTOMATION_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: order.email, name: order.name || null,
                               programme: d.programme, reference: upRef,
                               plan: 'book-upsell', amount_cents: offer.price }),
      });
      const out = await res.json().catch(() => ({}));
      return { delivered: !!(res.ok && out && out.ok === true), kind: 'course' };
    } catch { return { delivered: false, kind: 'course' }; }
  }
  return { delivered: false, kind: d.kind || 'unknown' };
}

async function alert(env, upRef, order, offer) {
  await env.FUNNEL.put('stuck:' + upRef, JSON.stringify({
    what: 'paid for ' + offer.title + ' and did not get it', at: Date.now(),
  }), { expirationTtl: 60 * 60 * 24 * 180 }).catch(() => {});
  if (!env.RESULTS_MAILER_URL) return;
  const lines = ['Somebody paid for an add-on and did not get it.', '',
    'What: ' + offer.title + ', R' + (offer.price / 100),
    'Reference: ' + upRef,
    'Buyer: ' + (order.name || '') + ' <' + (order.email || '') + '>',
    order.phone ? 'Phone: ' + order.phone : '', '',
    'The money is taken. Hand it over by hand and reply to them.'].filter(Boolean);
  try {
    await fetch(env.RESULTS_MAILER_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: env.REPORT_TO || 'francois@francoisesterhuizen.com',
        subject: 'Add-on paid for and not delivered (' + upRef + ')',
        body: lines.join('\n'), key: env.RESULTS_MAILER_KEY || '' }),
    });
  } catch { /* KV already has it */ }
}

function rid() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
