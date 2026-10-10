/* Cloudflare Pages Function: POST /api/claim  { ref }
 *
 * Opens the course a book buyer added to their order.
 *
 * The thank-you page already trades the Paystack reference for the PDF. If
 * the order also carried the course, something has to put that buyer on the
 * platform, and it cannot be the browser: anyone can send this endpoint a
 * reference, so the reference is checked with Paystack and the ORDER is read
 * back from our own record, never from what the caller claims to have bought.
 *
 * The order record is written by /api/checkout the moment the payment starts,
 * so by the time anyone gets here the book, the course and the price are
 * already decided and stored under order:<reference>.
 *
 * It is safe to call more than once. The platform refuses a second enrolment
 * on the same reference, and a claimed: marker here stops the round trip.
 *
 * Env (Pages, Settings, Variables and secrets):
 *   PAYSTACK_SECRET_KEY   as a Secret, the same key /api/download uses
 *   AUTOMATION_KEY        as a Secret, the platform's BOOKS_KEY. A key of its
 *                         own, which may only ever enrol a book buyer into
 *                         the course they bought, so this public web project
 *                         does not hold the keys to the whole platform.
 * Bindings: FUNNEL (holds the order record)
 */

// Must agree with the catalogue in /api/checkout.
const BOOKS = {
  responsibility: { price: 14700, title: 'The Empowering Truth of Responsibility' },
  habits:         { price: 19700, title: '10 Habits of Happy Relationships' },
};

/* What each course is called and where it lives, for the panel the
   thank-you page shows once the course is open. */
const COURSES = {
  'book-responsibility-course': { title: 'Clarity Fundamentals', slug: 'clarity-fundamentals', lessons: 16 },
  'book-habits-course':         { title: 'Relationship Dynamics', slug: 'relationship-growth', lessons: 5 },
};

export async function onRequestPost({ request, env }) {
  let p;
  try { p = await request.json(); } catch { return json({ ok: false }, 400); }
  const ref = String(p.ref || '').trim().slice(0, 120);
  if (!ref) return json({ ok: false, error: 'No reference.' }, 400);
  if (!env.FUNNEL) return json({ ok: false, error: 'Not configured.' }, 503);

  // Already done. Say what they have, and do not touch the platform again.
  const done = await env.FUNNEL.get('claimed:' + ref);
  if (done) { try { return json({ ok: true, ...JSON.parse(done) }); } catch { /* fall through */ } }

  const raw = await env.FUNNEL.get('order:' + ref);
  if (!raw) return json({ ok: true, course: null });   // no record, so nothing was added
  let order;
  try { order = JSON.parse(raw); } catch { return json({ ok: true, course: null }); }

  const course = COURSES[order.programme];
  if (!course) return json({ ok: true, course: null });   // book only, nothing to open

  // The payment has to be real, and for the whole order.
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

  /* Enough for the book AND the course. A buyer who somehow paid only the
     book price gets the book, which /api/download handles on its own, and
     no course. */
  const book = BOOKS[order.book];
  const owed = Number(order.amount) || ((book ? book.price : 0) + 29700);
  if (typeof tx.amount === 'number' && tx.amount < owed) {
    return json({ ok: false, error: 'The course was not part of this payment.' }, 403);
  }

  const platform = (env.PLATFORM_URL || 'https://clarity.francoisesterhuizen.com').replace(/\/+$/, '');
  if (!env.AUTOMATION_KEY) {
    /* The course was paid for, so never deny it. Leave it for him to grant
       by hand and tell the buyer the truth. */
    await mark(env, ref, { course, enrolled: false });
    await alert(env, ref, order);
    return json({ ok: true, course, enrolled: false });
  }

  let enrolled = false;
  try {
    const res = await fetch(platform + '/api/automation/enrol', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.AUTOMATION_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: order.email, name: order.name || null,
        programme: order.programme, reference: ref,
        plan: 'book-bump', amount_cents: 29700,
      }),
    });
    const out = await res.json().catch(() => ({}));
    enrolled = res.ok && out && out.ok === true;
  } catch { /* fall through: the panel still appears, he grants it by hand */ }

  await mark(env, ref, { course, enrolled });
  /* Paid for and not handed over. The buyer is told on the page, and he is
     told by email, because the one thing that must not happen is nobody
     knowing. */
  if (!enrolled) await alert(env, ref, order);
  return json({ ok: true, course, enrolled });
}

async function alert(env, ref, order) {
  await env.FUNNEL.put('stuck:' + ref, JSON.stringify({ what: 'enrolment refused or unreachable', at: Date.now() }),
    { expirationTtl: 60 * 60 * 24 * 180 }).catch(() => {});
  if (!env.RESULTS_MAILER_URL) return;
  const lines = ['A book order paid for a course and did not get it.', '',
    'Reference: ' + ref,
    'Buyer: ' + (order.name || '') + ' <' + (order.email || '') + '>',
    'Book: ' + (order.book || '') + ', course: ' + (order.programme || ''), '',
    'They have the book. Open the course by hand on Clarity, under People,',
    'and add them to the group for that course. Then reply to them.'];
  try {
    await fetch(env.RESULTS_MAILER_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: env.REPORT_TO || 'francois@francoisesterhuizen.com',
        subject: 'Book order needs you: course not opened (' + ref + ')',
        body: lines.join('\n'), key: env.RESULTS_MAILER_KEY || '',
      }),
    });
  } catch { /* KV already has it */ }
}

/* Ninety days, longer than the order record, so a buyer who comes back to
   this page next month still sees their course rather than a blank panel. */
function mark(env, ref, what) {
  return env.FUNNEL.put('claimed:' + ref, JSON.stringify(what), { expirationTtl: 60 * 60 * 24 * 90 })
    .catch(() => {});
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
