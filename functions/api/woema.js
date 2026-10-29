/* Cloudflare Pages Function: /api/woema
 *
 * Seats for WOEMA, the three-hour live workshop. Built 15 Sep 2026, paid with
 * Paystack from 16 Sep, free from 28 Sep, and PAID AGAIN from 17 Oct 2026, his
 * word: "the Vuma workshop is not free. It's 970 Rand. So make sure that you
 * set up Paystack payment there. And I'm only going to do four spots."
 * 29 Oct 2026, his word via Mark: R297 as an impulse buy, and 30 seats,
 * because a workshop needs about 30 people to justify the time.
 *
 * One price for everyone, R297, decided here and never in the browser. Thirty
 * seats a date. Paystack's inline popup on the page, the same pattern as the
 * 7 Weeks checkout (clarity-quest functions/api/enrol7.js):
 *
 *   GET  ?date=Friday 6 November 2026     -> {left, seats, price_cents}
 *   POST {action: 'init', date, name, email, phone, gift, notes}
 *        validates, refuses when no seat is left, starts a Paystack
 *        transaction and returns its access_code for the popup.
 *   POST {action: 'verify', reference}
 *        asks Paystack whether that reference really was paid, in ZAR, for at
 *        least R297, then: KV first, Mailchimp tags, the confirmation (with the
 *        flyer when they want to invite somebody), and a note to him. A second
 *        verify of the same reference sends nothing. If two people pay for the
 *        last seat at once, the second is honoured, marked OVER CAPACITY and
 *        flagged to him: add a seat or refund, his call.
 *
 * Seats taken = paid rows for that date that are not his tests. The free
 * sign-ups from before 17 Oct do not count against the seats.
 *
 * His own address (francois@francoisesterhuizen.com) pays R10 as a test, is
 * tagged test, never takes a seat, and the note says TEST so he refunds it.
 *
 * Env (already set on the project): PAYSTACK_SECRET_KEY, MAILCHIMP_API_KEY,
 * MAILCHIMP_AUDIENCE, RESULTS_MAILER_URL, RESULTS_MAILER_KEY. KV: FUNNEL.
 *   npx wrangler kv key list --binding FUNNEL --prefix woema:
 */

const NOTIFY = 'francois@francoisesterhuizen.com';
const PRICE_CENTS = 29700;      // R297, his word 29 Oct 2026 (was R970 from 17 Oct)
const TEST_CENTS = 1000;        // R10, his own address only; refund it in Paystack
const CURRENCY = 'ZAR';
const SEATS = 30;               // his word 29 Oct 2026 (was four from 17 Oct)
const PURPOSE = 'WOEMA';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PAGE = 'https://events.francoisesterhuizen.com/woema/';
const FLYER = 'https://events.francoisesterhuizen.com/woema/flyer.png';
const SIGNUPS_PER_HOUR = 8;
const FULL = "This workshop is full. Join the waiting list and I'll let you know as soon as the next one is set.";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const iso = isoDate(clip(url.searchParams.get('date'), 40));
  if (!iso || !env.FUNNEL) return json({ ok: true, seats: SEATS, price_cents: PRICE_CENTS, left: null });
  const taken = await seatsTaken(env, iso);
  return json({ ok: true, seats: SEATS, price_cents: PRICE_CENTS, left: Math.max(0, SEATS - taken) });
}

export async function onRequestPost({ request, env }) {
  let p;
  try { p = await request.json(); }
  catch { return json({ ok: false, error: 'bad json' }, 400); }
  const action = String(p.action || '');
  if (action === 'init') return init(p, request, env);
  if (action === 'verify') return verify(p, env);
  // The free 'reserve' action ended on 17 Oct 2026. A page cached from before
  // then lands here instead of booking a seat nobody paid for.
  return json({ ok: false, error: 'Seats are R297 now. Refresh the page to book yours.' }, 410);
}

async function init(p, request, env) {
  const name  = clip(p.name, 80);
  const email = String(p.email || '').trim().toLowerCase();
  const phone = clip(p.phone, 40);
  const notes = clip(p.notes, 600);
  const date  = clip(p.date, 40);
  const iso   = isoDate(date);

  if (!name) return json({ ok: false, error: 'I need your name.' }, 400);
  if (!EMAIL.test(email)) return json({ ok: false, error: 'That email does not look right.' }, 400);
  if (phone.replace(/\D/g, '').length < 9) return json({ ok: false, error: 'That phone number looks too short.' }, 400);
  if (!iso) return json({ ok: false, error: 'That date is not one I recognise. Refresh the page and try again.' }, 400);
  if (!env.FUNNEL || !env.PAYSTACK_SECRET_KEY) return json({ ok: false, error: 'not configured' }, 503);
  if (!(await underLimit(env, request, 'rl:woema:', SIGNUPS_PER_HOUR))) {
    return json({ ok: false, error: 'Too many tries from here. Try again in an hour, or WhatsApp me on 082 444 1831.' }, 429);
  }

  const owner = email === NOTIFY;
  if (!owner && (await seatsTaken(env, iso)) >= SEATS) return json({ ok: false, full: true, error: FULL }, 409);

  try {
    const r = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, amount: owner ? TEST_CENTS : PRICE_CENTS, currency: CURRENCY,
        metadata: { purpose: PURPOSE, iso, date, name, phone, notes, gift: !!p.gift,
                    source: clip(p.source, 80) || 'woema page' },
      }),
    });
    const d = await r.json();
    if (!r.ok || !d.status) return json({ ok: false, error: 'paystack init' }, 502);
    return json({ ok: true, access_code: d.data.access_code, reference: d.data.reference });
  } catch {
    return json({ ok: false, error: 'paystack init' }, 502);
  }
}

async function verify(p, env) {
  const ref = clip(p.reference, 120);
  if (!ref) return json({ ok: false, error: 'no reference' }, 400);
  if (!env.FUNNEL || !env.PAYSTACK_SECRET_KEY) return json({ ok: false, error: 'not configured' }, 503);

  let t;
  try {
    const r = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(ref), {
      headers: { Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY },
    });
    const d = await r.json();
    t = d && d.status && d.data ? d.data : null;
  } catch {
    return json({ ok: false, error: 'paystack verify' }, 502);
  }
  const meta = (t && t.metadata) || {};
  const email = String((t && t.customer && t.customer.email) || '').toLowerCase();
  const owner = email === NOTIFY;
  const paid = !!(t && t.status === 'success' && meta.purpose === PURPOSE && t.currency === CURRENCY &&
                  t.amount >= (owner ? TEST_CENTS : PRICE_CENTS));
  if (!paid) return json({ ok: true, paid: false });

  // Once per payment: a second verify (a refresh, a double tap) sends nothing.
  const refKey = 'woema-ref:' + ref;
  if (await env.FUNNEL.get(refKey)) return json({ ok: true, paid: true, already: true, date: meta.date || '' });

  const iso = String(meta.iso || '');
  const date = String(meta.date || '');
  const name = clip(meta.name, 80);
  const phone = clip(meta.phone, 40);
  const notes = clip(meta.notes, 600);
  const gift = !!meta.gift;
  const first = name.split(/\s+/)[0] || 'there';
  const taken = owner ? 0 : await seatsTaken(env, iso);
  const over = !owner && taken >= SEATS;

  // 1. KV first, so the seat is on record whatever happens next
  const row = {
    timestamp: new Date().toISOString(), date, iso, name, email, phone, notes, gift,
    test: owner, paid: true, reference: ref, amount_cents: t.amount, currency: t.currency, over,
    source: clip(meta.source, 80) || 'woema page',
  };
  const key = 'woema:' + iso + ':' + row.timestamp + ':' + Math.random().toString(36).slice(2, 8);
  try {
    await env.FUNNEL.put(key, JSON.stringify(row));
    await env.FUNNEL.put(refKey, key);
  } catch {
    return json({ ok: true, paid: true, recorded: false, date });
  }

  // 2. Mailchimp
  const tags = owner ? ['test'] : ['woema-reserved', 'woema-paid', 'woema-' + iso].concat(gift ? ['woema-gift'] : []);
  const captured = await tag(env, email, first, tags);

  // 3. the confirmation, with the flyer when they want to invite somebody
  const short = date.replace(/\s\d{4}$/, '');
  const share = 'https://wa.me/?text=' + encodeURIComponent(
    'Join me at WOEMA on ' + date + ', 09:00 to 12:00 on Zoom. Three hours on getting out of your own way. There are 30 seats. ' + PAGE);
  const lines = ['Hi ' + first, '',
    'Your seat at WOEMA on ' + date + ' is booked and paid. We start at 09:00 South African time and finish at 12:00, on Zoom.',
    '',
    "Bring three hours and something to write with, and I'll send the Zoom link closer to the day.",
    ''].concat(gift ? [
    'You said you would like to invite somebody. Here is the flyer:',
    FLYER,
    '',
    'Send it to them on WhatsApp in one tap:',
    share,
    '',
    'There are 30 seats, so tell them to book soon. Doing this next to somebody you trust is worth more than doing it alone.',
    ''] : []).concat(['See you there.', '', 'Much love,', 'Francois']);
  const emailed = await mail(env, email, 'Your WOEMA seat: ' + short, lines.join('\n'));

  // 4. the note to him
  const wa = 'https://wa.me/' + waNumber(phone) + '?text=' + encodeURIComponent(
    'Hi ' + first + ', here is the WOEMA flyer for ' + date + '. Send it to a friend and invite them to join you. ' + FLYER);
  const note = [
    over ? 'OVER CAPACITY: this payment is seat ' + (taken + 1) + ' of ' + SEATS + '. Your call: add a seat, or refund it in Paystack.' : '',
    owner ? 'TEST payment of R10 from your own address. Refund it in Paystack.' : 'New WOEMA seat, paid R' + (t.amount / 100) + '.',
    '',
    'Date: ' + date,
    'Name: ' + name,
    'Email: ' + email,
    'Phone: ' + phone,
    'Wants to invite a friend: ' + (gift ? 'YES' : 'no'),
    'What keeps getting in their way: ' + (notes || '(left blank)'),
    '',
    owner ? '' : 'Seats paid for this date: ' + (taken + 1) + ' of ' + SEATS,
    gift ? 'They have the flyer by email already. Send it on WhatsApp too:' : '',
    gift ? wa : '',
    '',
    'Paystack reference: ' + ref,
    'Confirmation email to them: ' + (emailed ? 'sent' : 'NOT sent, the mailer failed'),
    'Mailchimp: ' + (captured ? 'tagged ' + tags.join(', ') : 'NOT tagged'),
    'Saved in KV as ' + key,
  ].filter(l => l !== '').join('\n');
  await mail(env, NOTIFY, (owner ? 'TEST ' : '') + (over ? 'OVER CAPACITY ' : '') + 'WOEMA seat paid: ' + name + ', ' + short, note);

  return json({ ok: true, paid: true, emailed, captured, gift, date, over,
                flyer: gift ? FLYER : null, share: gift ? share : null, test: owner });
}

/* Paid seats for one date, his tests left out. Free sign-ups from before the
   price came back have no `paid` and do not count. */
async function seatsTaken(env, iso) {
  let n = 0, cursor;
  do {
    const page = await env.FUNNEL.list({ prefix: 'woema:' + iso + ':', cursor });
    for (const k of page.keys) {
      const v = await env.FUNNEL.get(k.name);
      try { const r = JSON.parse(v); if (r && r.paid && !r.test) n++; } catch {}
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return n;
}

/* 082 444 1831 -> 27824441831, so a wa.me link opens the right chat. Anything
   already in international form is left alone. */
function waNumber(phone) {
  let d = String(phone).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '27' + d.slice(1);
  return d;
}

async function underLimit(env, request, prefix, max) {
  if (!env.FUNNEL) return true;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const k = prefix + ip + ':' + new Date().toISOString().slice(0, 13);
  const n = parseInt(await env.FUNNEL.get(k) || '0', 10);
  if (n >= max) return false;
  await env.FUNNEL.put(k, String(n + 1), { expirationTtl: 7200 });
  return true;
}

/* Upsert the person in Mailchimp and add tags. Best effort: KV has it. */
async function tag(env, email, first, tags, status = 'subscribed') {
  try {
    const apiKey = env.MAILCHIMP_API_KEY || '', aud = env.MAILCHIMP_AUDIENCE || '';
    if (!apiKey || !aud) return false;
    const dc = apiKey.split('-').pop();
    const auth = 'Basic ' + btoa('any:' + apiKey);
    const memberUrl = 'https://' + dc + '.api.mailchimp.com/3.0/lists/' + aud + '/members/' + await md5(email);
    const put = await fetch(memberUrl, {
      method: 'PUT',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_address: email, status_if_new: status, merge_fields: { FNAME: first } }),
    });
    if (!put.ok) return false;
    const tr = await fetch(memberUrl + '/tags', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: tags.map(t => ({ name: t, status: 'active' })) }),
    });
    return tr.ok;
  } catch {
    return false;
  }
}

async function mail(env, to, subject, body) {
  if (!env.RESULTS_MAILER_URL) return false;
  try {
    const res = await fetch(env.RESULTS_MAILER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body, key: env.RESULTS_MAILER_KEY || '' }),
    });
    const out = await res.json().catch(() => null);
    return !!(res.ok && out && out.ok);
  } catch {
    return false;
  }
}

/* "Friday 6 November 2026" -> "2026-11-06", or '' when it is not a real date */
function isoDate(s) {
  const m = /^[A-Za-z]+day (\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(String(s || '').trim());
  if (!m) return '';
  const mo = MONTHS.indexOf(m[2].toLowerCase());
  const d = parseInt(m[1], 10);
  if (mo < 0 || d < 1 || d > 31) return '';
  return m[3] + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

async function md5(str) {
  const buf = await crypto.subtle.digest('MD5', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function clip(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
