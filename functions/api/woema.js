/* Cloudflare Pages Function: POST /api/woema
 *
 * Registrations for WOEMA, the three-hour live workshop. Built 15 Sep 2026,
 * paid with Paystack from 16 Sep.
 *
 * FREE from 28 Sep 2026, his call: "Turn the Vuma into a free event. People
 * register with name, email, and phone number. And also an opportunity to
 * gift this workshop to a friend."
 *
 * So Paystack, the R1,500 seat, the R900 member price and the paid friend's
 * seat are all gone, along with the quote, invoice and verify actions they
 * needed. Nobody pays, so nothing needs verifying and there is no card that
 * can fail. What is left is one action.
 *
 *   {action: 'reserve', date, name, email, phone, gift, notes}
 *     1. KV first, always, so a registration does not depend on Mailchimp or
 *        Gmail being up.
 *     2. Mailchimp tags, so he can write to the room before and after.
 *     3. The confirmation email, which carries the flyer when they said they
 *        want to invite somebody, with a WhatsApp share link so passing it on
 *        is one tap.
 *     4. A note to Francois. When they asked for the flyer it carries a
 *        wa.me link to their own number, so sending it on WhatsApp is a click
 *        from WhatsApp Web. WhatsApp itself cannot be automated here without
 *        a paid Business API account, and he does not want new subscriptions,
 *        so the email goes by itself and the WhatsApp goes by his hand.
 *
 * Registrations are capped per IP address, the same guard the card flow had,
 * because a form that writes to KV and Mailchimp is worth abusing even when
 * there is no money in it.
 *
 * His own address is a test (standing rule): stored, tagged test rather than
 * the real WOEMA tags, the confirmation still comes to him so he can see what
 * people get, and the note to him says TEST.
 *
 * Env (already set on the project): MAILCHIMP_API_KEY, MAILCHIMP_AUDIENCE,
 * RESULTS_MAILER_URL, RESULTS_MAILER_KEY. PAYSTACK_SECRET_KEY is no longer
 * read here. KV binding: FUNNEL. Read everything back with:
 *   npx wrangler kv key list --binding FUNNEL --prefix woema:
 */

const NOTIFY = 'francois@francoisesterhuizen.com';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];
const TBC = 'To be confirmed';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PAGE = 'https://events.francoisesterhuizen.com/woema/';
const FLYER = 'https://events.francoisesterhuizen.com/woema/flyer.png';
const SIGNUPS_PER_HOUR = 8;

export async function onRequestPost({ request, env }) {
  let p;
  try { p = await request.json(); }
  catch { return json({ ok: false, error: 'bad json' }, 400); }
  return reserve(p, request, env);
}

export async function onRequestGet() { return json({ ok: true, use: 'POST' }); }

async function reserve(p, request, env) {
  const name  = clip(p.name, 80);
  const email = String(p.email || '').trim().toLowerCase();
  const phone = clip(p.phone, 40);
  const notes = clip(p.notes, 600);
  const date  = clip(p.date, 40);
  const gift  = !!p.gift;

  if (!name) return json({ ok: false, error: 'I need your name.' }, 400);
  if (!EMAIL.test(email)) return json({ ok: false, error: 'That email does not look right.' }, 400);
  if (phone.replace(/\D/g, '').length < 9) {
    return json({ ok: false, error: 'That phone number looks too short.' }, 400);
  }
  const iso = date === TBC ? 'tbc' : isoDate(date);
  if (!iso) return json({ ok: false, error: 'That date is not one I recognise. Refresh the page and try again.' }, 400);
  if (!env.FUNNEL) return json({ ok: false, error: 'not configured' }, 503);
  if (!(await underLimit(env, request, 'rl:woema:', SIGNUPS_PER_HOUR))) {
    return json({ ok: false, error: 'Too many registrations from here. Try again in an hour, or WhatsApp me on 082 444 1831.' }, 429);
  }

  const isTest = email.indexOf('francois@') === 0;
  const first = name.split(/\s+/)[0];
  const row = {
    timestamp: new Date().toISOString(),
    date, iso, name, email, phone, notes, gift, test: isTest,
    source: clip(p.source, 80) || 'woema page',
  };

  // 1. KV first
  const key = 'woema:' + iso + ':' + row.timestamp + ':' + Math.random().toString(36).slice(2, 8);
  try {
    await env.FUNNEL.put(key, JSON.stringify(row));
  } catch {
    return json({ ok: false, error: 'That did not save. Try again in a moment.' }, 500);
  }

  // 2. Mailchimp
  const tags = isTest ? ['test']
    : ['woema-reserved'].concat(iso === 'tbc' ? [] : ['woema-' + iso], gift ? ['woema-gift'] : []);
  const captured = await tag(env, email, first, tags);

  // 3. the confirmation, with the flyer when they want to invite somebody
  const short = date === TBC ? '' : date.replace(/\s\d{4}$/, '');
  const subject = iso === 'tbc' ? "WOEMA: you're on the list" : 'Your WOEMA seat: ' + short;
  const share = 'https://wa.me/?text=' + encodeURIComponent(
    'Join me at WOEMA on ' + date + ', 09:00 to 12:00 on Zoom. Three hours on getting out of your own way, and it is free. ' + PAGE);
  const lines = iso === 'tbc'
    ? ['Hi ' + first, '',
       "You're on the list for the next WOEMA workshop. As soon as the date is set, I'll email you.",
       '', 'Much love,', 'Francois']
    : ['Hi ' + first, '',
       'Your seat at WOEMA on ' + date + ' is booked. We start at 09:00 South African time and finish at 12:00, on Zoom.',
       '',
       "It costs you nothing. Bring three hours and something to write with, and I'll send the Zoom link closer to the day.",
       ''].concat(gift ? [
       'You said you would like to invite somebody. Here is the flyer:',
       FLYER,
       '',
       'Send it to them on WhatsApp in one tap:',
       share,
       '',
       "Tell them you're going and ask them to join you. Doing this next to somebody you trust is worth more than doing it alone.",
       ''] : []).concat([
       'See you there.', '', 'Much love,', 'Francois']);
  const emailed = await mail(env, email, subject, lines.join('\n'));

  // 4. the note to him, with the WhatsApp already addressed
  const wa = 'https://wa.me/' + waNumber(phone) + '?text=' + encodeURIComponent(
    'Hi ' + first + ', here is the WOEMA flyer for ' + date + '. Send it to a friend and invite them to join you. ' + FLYER);
  const note = [
    isTest ? 'TEST registration, from your own address. Nothing real to do.' : 'New WOEMA registration. Free event, nothing to invoice.',
    '',
    'Date: ' + date,
    'Name: ' + name,
    'Email: ' + email,
    'Phone: ' + phone,
    'Wants to invite a friend: ' + (gift ? 'YES' : 'no'),
    'What keeps getting in their way: ' + (notes || '(left blank)'),
    '',
    gift ? 'They have the flyer by email already. Send it on WhatsApp too:' : 'Nothing to send. They did not ask for the flyer.',
    gift ? wa : '',
    '',
    'Confirmation email to them: ' + (emailed ? 'sent' : 'NOT sent, the mailer failed'),
    'Mailchimp: ' + (captured ? 'tagged ' + tags.join(', ') : 'NOT tagged'),
    'Saved in KV as ' + key,
  ].filter(l => l !== '').join('\n');
  await mail(env, NOTIFY, (isTest ? 'TEST ' : '') + 'WOEMA registration: ' + name + ', ' + (short || 'next date TBC'), note);

  return json({ ok: true, emailed, captured, gift, date, flyer: gift ? FLYER : null, share: gift ? share : null, test: isTest });
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
