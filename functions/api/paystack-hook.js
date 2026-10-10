/* Cloudflare Pages Function: POST /api/paystack-hook
 *
 * Paystack tells us directly that a payment went through, so the course a
 * buyer added does not depend on their browser.
 *
 * Why this exists. /api/claim runs when the thank-you page loads, which is
 * the happy path and most of the time. It is not all of the time: a buyer who
 * pays and closes the tab, or whose phone drops the connection on the way
 * back, never loads that page. The money is taken and the course is never
 * opened, and nothing anywhere says so. This closes that, because Paystack
 * reports the payment to us whether or not anybody is still watching.
 *
 * Paystack signs the body with HMAC SHA512 under the secret key. An unsigned
 * or wrongly signed request is somebody pretending to be Paystack, so it is
 * refused without reading the body as anything but bytes.
 *
 * Always answers 200 to a genuine Paystack event, even on our own failure.
 * A non-200 makes Paystack retry for hours, and a bug here would turn into a
 * flood. What we cannot do, we record.
 *
 * Set the URL in the Paystack dashboard, Settings, API Keys and Webhooks:
 *   https://resources.francoisesterhuizen.com/api/paystack-hook
 *
 * Env: PAYSTACK_SECRET_KEY, AUTOMATION_KEY, optional PLATFORM_URL,
 *      RESULTS_MAILER_URL and RESULTS_MAILER_KEY for the alert.
 * Bindings: FUNNEL.
 */

const COURSES = {
  'book-responsibility-course': { title: 'Clarity Fundamentals', slug: 'clarity-fundamentals', lessons: 16 },
  'book-habits-course':         { title: 'Relationship Dynamics', slug: 'relationship-growth', lessons: 5 },
};

export async function onRequestPost({ request, env }) {
  const raw = await request.text();

  if (!env.PAYSTACK_SECRET_KEY) return new Response('ok');   // nothing to verify against
  const given = request.headers.get('x-paystack-signature') || '';
  const want = await hmacSha512Hex(env.PAYSTACK_SECRET_KEY, raw);
  if (!given || !timingSafeEqual(given.toLowerCase(), want)) return new Response('no', { status: 401 });

  let ev;
  try { ev = JSON.parse(raw); } catch { return new Response('ok'); }
  if (!ev || ev.event !== 'charge.success' || !ev.data) return new Response('ok');

  const ref = String(ev.data.reference || '').trim();
  if (!ref || !env.FUNNEL) return new Response('ok');

  // The thank-you page may have got there first. Either is fine, neither twice.
  if (await env.FUNNEL.get('claimed:' + ref)) return new Response('ok');

  const raws = await env.FUNNEL.get('order:' + ref);
  if (!raws) return new Response('ok');          // not one of our book orders
  let order;
  try { order = JSON.parse(raws); } catch { return new Response('ok'); }
  const course = COURSES[order.programme];
  if (!course) return new Response('ok');        // book only

  /* The amount is the one Paystack just reported paid, not one we were told.
     Signed by Paystack and checked above, so this is as good as a verify. */
  if (typeof ev.data.amount === 'number' && Number(order.amount) && ev.data.amount < Number(order.amount)) {
    await note(env, ref, 'the payment was short: ' + ev.data.amount + ' cents of ' + order.amount, order);
    return new Response('ok');
  }

  let enrolled = false;
  if (env.AUTOMATION_KEY) {
    const platform = (env.PLATFORM_URL || 'https://clarity.francoisesterhuizen.com').replace(/\/+$/, '');
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
    } catch { /* recorded below */ }
  }

  await env.FUNNEL.put('claimed:' + ref, JSON.stringify({ course, enrolled, via: 'webhook' }),
    { expirationTtl: 60 * 60 * 24 * 90 }).catch(() => {});
  /* Paid for and not handed over. Kept where he can find it rather than lost
     in a log nobody reads. */
  if (!enrolled) await note(env, ref, 'the platform did not accept the enrolment for ' + order.programme, order);
  return new Response('ok');
}

/* A paid order that did not get what it paid for. Kept in KV AND emailed to
   him, because a note in a store nobody opens is the same as losing it. */
async function note(env, ref, what, order) {
  await env.FUNNEL.put('stuck:' + ref, JSON.stringify({ what, at: Date.now() }),
    { expirationTtl: 60 * 60 * 24 * 180 }).catch(() => {});
  if (!env.RESULTS_MAILER_URL) return;
  const lines = [
    'A book order paid for a course and did not get it.',
    '',
    'What happened: ' + what,
    'Reference: ' + ref,
    order ? 'Buyer: ' + (order.name || '') + ' <' + (order.email || '') + '>' : '',
    order ? 'Book: ' + (order.book || '') : '',
    '',
    'They have the book. Open the course by hand on Clarity, under People,',
    'and add them to the group for that course. Then reply to them.',
  ].filter(Boolean);
  try {
    await fetch(env.RESULTS_MAILER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: env.REPORT_TO || 'francois@francoisesterhuizen.com',
        subject: 'Book order needs you: course not opened (' + ref + ')',
        body: lines.join('\n'),
        key: env.RESULTS_MAILER_KEY || '',
      }),
    });
  } catch { /* KV already has it */ }
}

async function hmacSha512Hex(secret, body) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Compares in constant time, so a wrong signature cannot be guessed a byte at a time.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
