/* Cloudflare Pages Function: POST /api/woema
 *
 * Seat reservations for WOEMA, the three-hour live workshop (R1,500, three
 * Friday mornings every school term, three weeks apart). Built 15 Sep 2026.
 *
 * Order matters, for the same reason as /api/waitlist:
 *   1. KV, first and always. A reservation is somebody's intention to pay
 *      him, and it must not depend on Mailchimp or Gmail being up. The
 *      caller is told it worked as soon as this succeeds.
 *   2. Mailchimp: upsert the person and tag woema-reserved plus
 *      woema-YYYY-MM-DD, so each workshop's list can be pulled by date.
 *   3. The confirmation to the person, plain text, through the Gmail-backed
 *      results mailer.
 *   4. A note to Francois with everything they typed. Payment details still
 *      go out by hand: Paystack cannot take international cards on this
 *      account, so there is no card wall on the page.
 *
 * His own address is a test (standing rule): stored, tagged test and never
 * the real WOEMA tags, the confirmation still comes to him so he can see
 * it, and the note to him says TEST in the subject.
 *
 * Env (already set on the project): MAILCHIMP_API_KEY, MAILCHIMP_AUDIENCE,
 * RESULTS_MAILER_URL, RESULTS_MAILER_KEY. KV binding: FUNNEL.
 * Read everything back with:
 *   npx wrangler kv key list --binding FUNNEL --prefix woema:
 */

const NOTIFY = 'francois@francoisesterhuizen.com';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];
const TBC = 'To be confirmed';

export async function onRequestPost({ request, env }) {
  let p;
  try { p = await request.json(); }
  catch { return json({ ok: false, error: 'bad json' }, 400); }

  const name  = clip(p.name, 80);
  const email = String(p.email || '').trim().toLowerCase();
  const phone = clip(p.phone, 40);
  const notes = clip(p.notes, 600);
  const date  = clip(p.date, 40);

  if (!name) return json({ ok: false, error: 'I need your name.' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: 'That email does not look right.' }, 400);
  }
  if (phone.replace(/\D/g, '').length < 9) {
    return json({ ok: false, error: 'That phone number looks too short.' }, 400);
  }
  const iso = date === TBC ? 'tbc' : isoDate(date);
  if (!iso) return json({ ok: false, error: 'Choose one of the dates in the list.' }, 400);

  const isTest = email.indexOf('francois@') === 0;
  const first = name.split(/\s+/)[0];
  const row = {
    timestamp: new Date().toISOString(),
    date, iso, name, email, phone, notes, test: isTest,
    source: clip(p.source, 80) || 'woema page',
  };

  if (!env.FUNNEL) return json({ ok: false, error: 'not configured' }, 503);

  // 1. KV first, and the answer to the caller depends only on this
  const key = 'woema:' + iso + ':' + row.timestamp + ':' + Math.random().toString(36).slice(2, 8);
  try {
    await env.FUNNEL.put(key, JSON.stringify(row));
  } catch {
    return json({ ok: false, error: 'That did not save. Try again in a moment.' }, 500);
  }

  // 2. Mailchimp, best effort
  let captured = false;
  try {
    const apiKey = env.MAILCHIMP_API_KEY || '', aud = env.MAILCHIMP_AUDIENCE || '';
    if (apiKey && aud) {
      const dc = apiKey.split('-').pop();
      const auth = 'Basic ' + btoa('any:' + apiKey);
      const hash = await md5(email);
      const memberUrl = 'https://' + dc + '.api.mailchimp.com/3.0/lists/' + aud + '/members/' + hash;
      const merge = { FNAME: first };
      const put = await fetch(memberUrl, {
        method: 'PUT',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_address: email, status_if_new: 'subscribed', merge_fields: merge }),
      });
      if (put.ok) {
        const tags = isTest ? ['test'] : ['woema-reserved', 'woema-' + iso];
        const tr = await fetch(memberUrl + '/tags', {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: tags.map(t => ({ name: t, status: 'active' })) }),
        });
        captured = tr.ok;
      }
    }
  } catch { /* KV has it */ }

  // 3. the confirmation to the person
  let emailed = false;
  const short = date === TBC ? '' : date.replace(/\s\d{4}$/, '');
  const subject = iso === 'tbc' ? "WOEMA: you're on the list" : 'Your WOEMA seat: ' + short;
  const body = iso === 'tbc'
    ? ['Hi ' + first, '',
       "You're on the list for the next WOEMA workshop. As soon as the date is set, I'll email you.",
       '', 'Much love,', 'Francois'].join('\n')
    : ['Hi ' + first, '',
       'Your seat at WOEMA on ' + date + ' is reserved. We start at 09:00 South African time and finish at 12:00, on Zoom.',
       '',
       "I'll send you the payment details (R1,500) and the Zoom link in a separate email.",
       '', 'See you there.', '', 'Much love,', 'Francois'].join('\n');
  emailed = await mail(env, email, subject, body);

  // 4. the note to Francois
  const note = [
    (isTest ? 'TEST reservation, from your own address. Nothing real to do.' : 'New WOEMA reservation.'),
    '',
    'Date: ' + date,
    'Name: ' + name,
    'Email: ' + email,
    'Phone: ' + phone,
    'What keeps getting in their way: ' + (notes || '(left blank)'),
    '',
    iso === 'tbc' ? 'Next step: let them know when the next date is set.'
                  : 'Next step: send the payment details (R1,500) and the Zoom link.',
    'Confirmation email to them: ' + (emailed ? 'sent' : 'NOT sent, the mailer failed'),
    'Mailchimp: ' + (captured ? (isTest ? 'tagged test' : 'tagged woema-reserved and woema-' + iso) : 'NOT tagged'),
    'Saved in KV as ' + key,
  ].join('\n');
  await mail(env, NOTIFY, (isTest ? 'TEST ' : '') + 'WOEMA reservation: ' + name + ', ' + (short || 'next date TBC'), note);

  return json({ ok: true, emailed, captured, test: isTest });
}

export async function onRequestGet() { return json({ ok: true, use: 'POST' }); }

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
