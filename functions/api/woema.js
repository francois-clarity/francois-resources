/* Cloudflare Pages Function: POST /api/woema
 *
 * Seat reservations for WOEMA, the three-hour live workshop. Built 15 Sep 2026.
 * Card payment through Paystack and the member price added 16 Sep 2026.
 * Same afternoon, his call: one card option on the page (Paystack's popup,
 * no choice of methods), and when the card does not go through, "Having
 * trouble with the payment? No problem. Make your booking to secure your
 * spot, and I'll send you an invoice."
 * Later still, his redesign: only the next date on the page, a programme
 * question that reveals the member saving, and "bring a friend for R500
 * more" so two people pay R1,000 each.
 *
 * Prices, decided HERE and never in the browser:
 *   R1,500 a seat; R900 when the email belongs to a Clarity Quest or Personal
 *   Growth Weekly member (memberPrice below); plus R500 for a friend's seat.
 *   A member bringing a friend pays R900 + R500.
 *
 * Four actions:
 *
 *   {action: 'quote', email}
 *     Is this email a member? Powers the "Surprise" reveal on the page. Capped
 *     per IP address so nobody can run a list of emails through it.
 *
 *   {action: 'reserve', pay: 'card'|'invoice', date, name, email, phone, notes,
 *    programme, friend, friend_name, friend_email}
 *     1. KV first, always. A reservation is somebody's intention to pay him,
 *        and it must not depend on Mailchimp, Gmail or Paystack being up.
 *     2. pay 'card': Paystack initialises a transaction for the total. The
 *        page opens it in Paystack's popup with the access_code (the
 *        authorization_url is the fallback if the popup script fails).
 *        Nothing is emailed yet, because nothing is paid yet.
 *     3. pay 'invoice' (a date still to be set, or a card that never
 *        started): Mailchimp tags, the confirmation, the friend's
 *        confirmation, and a note to Francois, who sends the invoice by hand.
 *
 *   {action: 'invoice', booking}
 *     The card did not go through and they chose "Make my booking". Turns the
 *     same KV row into an invoice booking and sends the same emails as pay
 *     'invoice'. Paystack refuses foreign cards on this account (closed since
 *     31 Jul 2026), so this is also how overseas people book.
 *
 *   {action: 'verify', reference}
 *     After Paystack's popup (or its own page) the page calls this. It asks
 *     Paystack whether that reference really was paid, in ZAR, for at least
 *     the amount stored with the reservation, then marks the KV row paid,
 *     tags Mailchimp, and sends the confirmations and the note. A second call
 *     for the same reference changes nothing and sends nothing.
 *
 * The friend's email is a booking confirmation, because they now have a seat.
 * They go into Mailchimp as transactional, never as a marketing subscriber.
 *
 * Card attempts are capped per IP address, because the old public Paystack
 * payment page was hit by a card-testing attack on 31 Jul 2026.
 *
 * His own address is a test (standing rule): stored, tagged test and never
 * the real WOEMA tags, the confirmation still comes to him so he can see it,
 * the note to him says TEST, and a friend's confirmation goes to him instead
 * of the friend.
 *
 * Env (already set on the project): MAILCHIMP_API_KEY, MAILCHIMP_AUDIENCE,
 * RESULTS_MAILER_URL, RESULTS_MAILER_KEY, PAYSTACK_SECRET_KEY.
 * KV binding: FUNNEL. Read everything back with:
 *   npx wrangler kv key list --binding FUNNEL --prefix woema:
 */

const NOTIFY = 'francois@francoisesterhuizen.com';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];
const TBC = 'To be confirmed';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const FULL_CENTS = 150000;    // R1,500
const MEMBER_CENTS = 90000;   // R900, R600 off
const FRIEND_CENTS = 50000;   // R500 for a friend's seat
// Paystack plans whose subscribers pay the member price, matched on the plan
// name, and the subscription states that still count. 'attention' is a
// failed renewal, which is what the overseas members' cards show since July.
const MEMBER_PLANS = ['personal growth weekly', 'clarity quest'];
const MEMBER_STATES = ['active', 'non-renewing', 'attention'];
// Members who pay by invoice or EFT are not on Paystack. Tag them in Mailchimp
// with this, and they get the member price too.
const MEMBER_TAG = 'member-price';
const CARD_TRIES_PER_HOUR = 6;
const QUOTES_PER_HOUR = 20;

export async function onRequestPost({ request, env }) {
  let p;
  try { p = await request.json(); }
  catch { return json({ ok: false, error: 'bad json' }, 400); }

  if (p.action === 'quote') return quote(p, request, env);
  if (p.action === 'verify') return verify(p, env);
  if (p.action === 'invoice') return invoice(p, env);
  return reserve(p, request, env);
}

export async function onRequestGet() { return json({ ok: true, use: 'POST' }); }

async function quote(p, request, env) {
  const email = String(p.email || '').trim().toLowerCase();
  if (!EMAIL.test(email)) return json({ ok: false, error: 'That email does not look right.' }, 400);
  if (!(await underLimit(env, request, 'rl:woemaq:', QUOTES_PER_HOUR))) {
    return json({ ok: false, error: 'Too many checks from here. Try again in an hour.' }, 429);
  }
  return json({ ok: true, member: await memberPrice(env, email) });
}

async function reserve(p, request, env) {
  const name  = clip(p.name, 80);
  const email = String(p.email || '').trim().toLowerCase();
  const phone = clip(p.phone, 40);
  const notes = clip(p.notes, 600);
  const date  = clip(p.date, 40);
  const pay   = p.pay === 'card' ? 'card' : 'invoice';
  const programme = clip(p.programme, 40);
  const withFriend = !!p.friend;
  const friendName = withFriend ? clip(p.friend_name, 80) : '';
  const friendEmail = withFriend ? String(p.friend_email || '').trim().toLowerCase() : '';

  if (!name) return json({ ok: false, error: 'I need your name.' }, 400);
  if (!EMAIL.test(email)) return json({ ok: false, error: 'That email does not look right.' }, 400);
  if (phone.replace(/\D/g, '').length < 9) {
    return json({ ok: false, error: 'That phone number looks too short.' }, 400);
  }
  if (withFriend && !friendName) return json({ ok: false, error: "I need your friend's name." }, 400);
  if (withFriend && !EMAIL.test(friendEmail)) {
    return json({ ok: false, error: "Your friend's email does not look right." }, 400);
  }
  if (withFriend && friendEmail === email) {
    return json({ ok: false, error: 'Your friend needs their own email address.' }, 400);
  }
  const iso = date === TBC ? 'tbc' : isoDate(date);
  if (!iso) return json({ ok: false, error: 'That date is not one I recognise. Refresh the page and try again.' }, 400);
  if (!env.FUNNEL) return json({ ok: false, error: 'not configured' }, 503);

  // nobody can pay for a date that is not set yet
  const card = pay === 'card' && iso !== 'tbc';
  if (card && !(await underLimit(env, request, 'rl:woema:', CARD_TRIES_PER_HOUR))) {
    return json({ ok: false, error: 'Too many attempts from here. Try again in an hour, or WhatsApp me on 082 444 1831.' }, 429);
  }

  const isTest = email.indexOf('francois@') === 0;
  const member = await memberPrice(env, email);
  const cents = (member ? MEMBER_CENTS : FULL_CENTS) + (withFriend ? FRIEND_CENTS : 0);
  const first = name.split(/\s+/)[0];
  const row = {
    timestamp: new Date().toISOString(),
    date, iso, name, email, phone, notes, test: isTest,
    programme, member, seats: withFriend ? 2 : 1,
    friend: withFriend ? { name: friendName, email: friendEmail } : null,
    pay: card ? 'card' : 'invoice', amount: cents / 100, paid: false,
    source: clip(p.source, 80) || 'woema page',
  };

  // 1. KV first
  const key = 'woema:' + iso + ':' + row.timestamp + ':' + Math.random().toString(36).slice(2, 8);
  try {
    await env.FUNNEL.put(key, JSON.stringify(row));
  } catch {
    return json({ ok: false, error: 'That did not save. Try again in a moment.' }, 500);
  }

  // 2. card: set up the Paystack transaction, and say nothing to anyone until it is paid
  if (card) {
    if (!env.PAYSTACK_SECRET_KEY) return json({ ok: false, trouble: true, booking: key }, 503);
    try {
      const origin = new URL(request.url).origin;
      const r = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          amount: cents,
          currency: 'ZAR',
          callback_url: origin + '/woema/',
          metadata: {
            purpose: 'WOEMA workshop',
            woema_key: key,
            date, name, phone, member, seats: row.seats,
            friend_name: friendName || undefined,
            custom_fields: [
              { display_name: 'Workshop', variable_name: 'workshop', value: 'WOEMA ' + date },
              { display_name: 'Seats', variable_name: 'seats', value: String(row.seats) },
              { display_name: 'Price', variable_name: 'price', value: member ? 'Member price' : 'Full price' },
            ],
          },
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.status) throw new Error('init');
      row.reference = d.data.reference;
      await env.FUNNEL.put(key, JSON.stringify(row));
      await tag(env, email, first, isTest ? ['test'] : ['woema-checkout']);
      return json({ ok: true, pay: 'card', access_code: d.data.access_code, url: d.data.authorization_url,
                    booking: key, amount: cents / 100, member, seats: row.seats });
    } catch {
      // the page offers the invoice booking for this same row
      return json({ ok: false, trouble: true, booking: key }, 502);
    }
  }

  // 3. invoice, or a date still to be set: the reservation stands on its own
  return confirmInvoice(env, key, row);
}

async function invoice(p, env) {
  const key = clip(p.booking, 120);
  if (!env.FUNNEL || key.indexOf('woema:') !== 0) return json({ ok: false, error: 'That booking was not found.' }, 400);
  const raw = await env.FUNNEL.get(key);
  if (!raw) return json({ ok: false, error: 'That booking was not found.' }, 404);
  const row = JSON.parse(raw);
  if (row.paid) return json({ ok: true, paid: true, date: row.date, seats: row.seats || 1 });
  if (row.pay === 'invoice') return json({ ok: true, date: row.date, seats: row.seats || 1, again: true });
  row.pay = 'invoice';
  row.invoice_at = new Date().toISOString();
  await env.FUNNEL.put(key, JSON.stringify(row));
  return confirmInvoice(env, key, row, true);
}

/* The booking stands without payment: tags, the confirmations and the note to
   Francois, who sends the invoice. */
async function confirmInvoice(env, key, row, afterCard) {
  const { date, iso, name, email, phone, notes, member } = row;
  const isTest = row.test;
  const first = name.split(/\s+/)[0];
  const tags = isTest ? ['test']
    : ['woema-reserved', 'woema-' + iso].concat(iso === 'tbc' ? [] : ['woema-invoice'], member ? ['woema-member'] : [],
                                                row.friend ? ['woema-brought-friend'] : []);
  const captured = await tag(env, email, first, tags);

  const short = date === TBC ? '' : date.replace(/\s\d{4}$/, '');
  const subject = iso === 'tbc' ? "WOEMA: you're on the list" : 'Your WOEMA seat: ' + short;
  const seatLine = row.friend
    ? 'Your seats at WOEMA on ' + date + ' are reserved, one for you and one for ' + row.friend.name + '.'
    : 'Your seat at WOEMA on ' + date + ' is reserved.';
  const body = iso === 'tbc'
    ? ['Hi ' + first, '',
       "You're on the list for the next WOEMA workshop. As soon as the date is set, I'll email you.",
       '', 'Much love,', 'Francois'].join('\n')
    : ['Hi ' + first, '',
       seatLine + ' We start at 09:00 South African time and finish at 12:00, on Zoom.',
       '',
       "I'll send you an invoice (" + priceText(row) + ') and the Zoom link in a separate email.' +
         (row.friend ? " I've let " + row.friend.name.split(/\s+/)[0] + ' know too.' : ''),
       '', 'See you there.', '', 'Much love,', 'Francois'].join('\n');
  const emailed = await mail(env, email, subject, body);
  const friendTold = iso === 'tbc' ? false : await tellFriend(env, row, false);

  const note = [
    (isTest ? 'TEST reservation, from your own address. Nothing real to do.'
            : afterCard ? 'New WOEMA booking. The card payment did not go through, so they asked for an invoice.'
                        : 'New WOEMA reservation, to be invoiced.'),
    '',
    'Date: ' + date,
    'Name: ' + name,
    'Email: ' + email,
    'Phone: ' + phone,
    'Programme they chose: ' + (row.programme || 'none') + (member ? ' (member price confirmed)' : ''),
    row.friend ? 'Friend: ' + row.friend.name + ', ' + row.friend.email : 'Friend: none',
    'Total: ' + rand(row.amount) + ' for ' + (row.seats || 1) + (row.seats === 2 ? ' seats' : ' seat'),
    'What keeps getting in their way: ' + (notes || '(left blank)'),
    '',
    iso === 'tbc' ? 'Next step: let them know when the next date is set.'
                  : 'Next step: send the invoice (' + rand(row.amount) + ') and the Zoom link' + (row.friend ? ' to both of them.' : '.'),
    'Confirmation email to them: ' + (emailed ? 'sent' : 'NOT sent, the mailer failed'),
    row.friend ? 'Confirmation to the friend: ' + (friendTold ? 'sent' : 'NOT sent') : '',
    'Mailchimp: ' + (captured ? 'tagged ' + tags.join(', ') : 'NOT tagged'),
    'Saved in KV as ' + key,
  ].filter(l => l !== '').join('\n');
  await mail(env, NOTIFY, (isTest ? 'TEST ' : '') + 'WOEMA reservation: ' + name + ', ' + (short || 'next date TBC'), note);

  return json({ ok: true, pay: 'invoice', emailed, captured, member, amount: row.amount, seats: row.seats || 1,
                friend: row.friend ? row.friend.name : null, date, test: isTest });
}

async function verify(p, env) {
  const ref = clip(p.reference, 120);
  if (!ref) return json({ ok: false, error: 'no reference' }, 400);
  if (!env.PAYSTACK_SECRET_KEY || !env.FUNNEL) return json({ ok: false, error: 'not configured' }, 503);

  let tx;
  try {
    const r = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(ref), {
      headers: { Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY },
    });
    const d = await r.json();
    if (!r.ok || !d.status || !d.data) return json({ ok: true, paid: false });
    tx = d.data;
  } catch {
    return json({ ok: false, error: 'Could not reach Paystack.' }, 502);
  }

  const key = tx.metadata && tx.metadata.woema_key;
  const raw = key && String(key).indexOf('woema:') === 0 ? await env.FUNNEL.get(key) : null;
  if (!raw) return json({ ok: true, paid: false });
  const row = JSON.parse(raw);
  const out = { date: row.date, seats: row.seats || 1, friend: row.friend ? row.friend.name : null };

  const expected = Math.round(row.amount * 100);
  const paid = tx.status === 'success' && tx.currency === 'ZAR' && tx.amount >= expected;
  if (!paid) return json(Object.assign({ ok: true, paid: false, booking: key }, out));
  if (row.paid) return json(Object.assign({ ok: true, paid: true, again: true }, out));

  row.paid = true;
  row.paid_at = tx.paid_at || new Date().toISOString();
  row.reference = tx.reference;
  await env.FUNNEL.put(key, JSON.stringify(row));

  const first = row.name.split(/\s+/)[0];
  const tags = row.test ? ['test']
    : ['woema-reserved', 'woema-paid', 'woema-' + row.iso].concat(row.member ? ['woema-member'] : [],
                                                                   row.friend ? ['woema-brought-friend'] : []);
  const captured = await tag(env, row.email, first, tags);

  const short = row.date.replace(/\s\d{4}$/, '');
  const seatLine = row.friend
    ? 'Your payment of ' + priceText(row) + ' came through, so your seats at WOEMA on ' + row.date +
      ' are confirmed, one for you and one for ' + row.friend.name + '.'
    : 'Your payment of ' + priceText(row) + ' came through, so your seat at WOEMA on ' + row.date + ' is confirmed.';
  const body = ['Hi ' + first, '',
    seatLine + ' We start at 09:00 South African time and finish at 12:00, on Zoom.',
    '',
    "I'll send you the Zoom link before the day." + (row.friend ? " I've let " + row.friend.name.split(/\s+/)[0] + ' know too.' : ''),
    '', 'See you there.', '', 'Much love,', 'Francois'].join('\n');
  const emailed = await mail(env, row.email, 'Your WOEMA seat is confirmed: ' + short, body);
  const friendTold = await tellFriend(env, row, true);

  const note = [
    (row.test ? 'TEST payment, from your own address.' : 'WOEMA seat PAID by card.'),
    '',
    'Date: ' + row.date,
    'Name: ' + row.name,
    'Email: ' + row.email,
    'Phone: ' + row.phone,
    'Programme they chose: ' + (row.programme || 'none') + (row.member ? ' (member price confirmed)' : ''),
    row.friend ? 'Friend: ' + row.friend.name + ', ' + row.friend.email : 'Friend: none',
    'Paid: R' + (tx.amount / 100) + ' for ' + (row.seats || 1) + (row.seats === 2 ? ' seats' : ' seat'),
    'Paystack reference: ' + tx.reference,
    'What keeps getting in their way: ' + (row.notes || '(left blank)'),
    '',
    'Next step: send the Zoom link before the day' + (row.friend ? ', to both of them.' : '.'),
    'Confirmation email to them: ' + (emailed ? 'sent' : 'NOT sent, the mailer failed'),
    row.friend ? 'Confirmation to the friend: ' + (friendTold ? 'sent' : 'NOT sent') : '',
    'Mailchimp: ' + (captured ? 'tagged ' + tags.join(', ') : 'NOT tagged'),
    'Saved in KV as ' + key,
  ].filter(l => l !== '').join('\n');
  await mail(env, NOTIFY, (row.test ? 'TEST ' : '') + 'WOEMA PAID: ' + row.name + ', ' + short, note);

  return json(Object.assign({ ok: true, paid: true, emailed }, out));
}

/* The friend has a seat, so they get their own confirmation. For a test booking
   it goes to Francois instead, and the friend is never added to Mailchimp. */
async function tellFriend(env, row, paid) {
  if (!row.friend) return false;
  const f = row.friend;
  const friendFirst = f.name.split(/\s+/)[0];
  const bookerFirst = row.name.split(/\s+/)[0];
  if (!row.test) {
    await tag(env, f.email, friendFirst,
      ['woema-reserved', 'woema-friend', 'woema-' + row.iso].concat(paid ? ['woema-paid'] : []), 'transactional');
  }
  const body = ['Hi ' + friendFirst, '',
    row.name + ' has booked you a seat at WOEMA, my three-hour live workshop on getting out of your own way. ' +
      "It's on " + row.date + ', from 09:00 to 12:00 South African time, on Zoom.',
    '',
    "I'll send you the Zoom link before the day.",
    '', 'See you there.', '', 'Much love,', 'Francois'].join('\n');
  return mail(env, row.test ? NOTIFY : f.email,
    (row.test ? 'TEST ' : '') + bookerFirst + ' booked you a seat at WOEMA', body);
}

function priceText(row) {
  if (row.friend) return rand(row.amount) + ' for two seats';
  return row.member ? 'R900, the member price' : 'R1,500';
}

function rand(amount) {
  return 'R' + String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

/* True when this email pays the member price. Paystack first: a customer with
   a live subscription on a Personal Growth Weekly or Clarity Quest plan. Then
   Mailchimp, for members who pay outside Paystack and carry MEMBER_TAG. Any
   failure means full price, never an error in front of the person. */
async function memberPrice(env, email) {
  try {
    if (env.PAYSTACK_SECRET_KEY) {
      const auth = { Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY };
      const c = await fetch('https://api.paystack.co/customer/' + encodeURIComponent(email), { headers: auth });
      if (c.ok) {
        const cust = (await c.json()).data;
        const s = await fetch('https://api.paystack.co/subscription?perPage=50&customer=' + cust.id, { headers: auth });
        const subs = s.ok ? ((await s.json()).data || []) : [];
        const hit = subs.some(x => MEMBER_STATES.includes(String(x.status)) &&
          MEMBER_PLANS.some(n => String((x.plan && x.plan.name) || '').toLowerCase().includes(n)));
        if (hit) return true;
      }
    }
  } catch { /* fall through to Mailchimp */ }
  try {
    const apiKey = env.MAILCHIMP_API_KEY || '', aud = env.MAILCHIMP_AUDIENCE || '';
    if (!apiKey || !aud) return false;
    const dc = apiKey.split('-').pop();
    const url = 'https://' + dc + '.api.mailchimp.com/3.0/lists/' + aud + '/members/' + await md5(email) + '?fields=tags';
    const r = await fetch(url, { headers: { Authorization: 'Basic ' + btoa('any:' + apiKey) } });
    if (!r.ok) return false;
    const m = await r.json();
    return (m.tags || []).some(t => String(t.name).toLowerCase() === MEMBER_TAG);
  } catch {
    return false;
  }
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

/* "Friday 16 October 2026" -> "2026-10-16", or '' when it is not a real date */
function isoDate(s) {
  const m = /^[A-Za-z]+day (\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(s);
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
