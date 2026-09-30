/* Cloudflare Pages Function: POST /api/openday
 *
 * Registrations for the free Clarity Quest Open Day, Tue 13 Oct 2026, 08:00
 * to 09:00 SAST, which opens the "7 Weeks to Clarity" cohort.
 *
 * Why it lives here and not on the clarity-quest project, where the page is.
 * The page is at clarityquest.francoisesterhuizen.com/7-weeks/, but that
 * Pages project has no KV binding and no mailer secrets, so it can store
 * nothing and send nothing. This project has both, proven this week by
 * /api/woema. So the page posts across to here, and CORS below names the one
 * origin allowed to do it.
 *
 * His call, 29 Sep 2026: "I don't want them to book on Calendly. Let's make
 * it much simpler so they can book on the page." The Calendly event also had
 * no availability on 13 October, so that route would have failed anyway.
 * Calendly used to send the confirmation and the reminders; now this does.
 *
 *   {action: 'register', name, email, phone, stuck, source}
 *     1. KV first, so a registration does not depend on Mailchimp or Gmail.
 *     2. Mailchimp tags, so he can write to the room before and after.
 *     3. A confirmation to them, saying what happens and that the Zoom link
 *        follows closer to the day.
 *     4. A note to him, carrying their answer to the one question that
 *        matters: what is keeping them from their potential. That question is
 *        his, lifted from the Calendly event it replaces.
 *
 * His own address is a test (standing rule): stored, tagged test rather than
 * the real tags, the confirmation still comes to him so he can see what
 * people get, and the note says TEST.
 *
 * Env: MAILCHIMP_API_KEY, MAILCHIMP_AUDIENCE, RESULTS_MAILER_URL,
 * RESULTS_MAILER_KEY. KV binding: FUNNEL. Read them back with:
 *   npx wrangler kv key list --binding FUNNEL --prefix openday:
 */

const NOTIFY = 'francois@francoisesterhuizen.com';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ALLOWED = 'https://clarityquest.francoisesterhuizen.com';
const WHEN = 'Tuesday 13 October, 08:00 to 09:00 SAST';
const TAG_DAY = 'openday-2026-10-13';
const PAGE = 'https://clarityquest.francoisesterhuizen.com/7-weeks/';
const SIGNUPS_PER_HOUR = 8;

/* The open day join link. Empty until the Zoom room exists, and while it is
 * empty the confirmation says the link follows closer to the day, which is
 * what it said before. Put the join URL here and every confirmation from that
 * moment carries it, along with the recording promise.
 *
 * Anybody who registered while this was empty still has to be sent the link by
 * hand. They are in KV under the prefix openday:2026-10-13:
 *
 * Settings for the room are in the content engine, at
 * marketing/campaigns/2026-t4-cohort/zoom-setup.md
 */
const ZOOM_JOIN = 'https://us02web.zoom.us/j/81623485167?pwd=TXAmKbQH6HSsQAqhGGKGRcv4y3lF2n.1';

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED ? ALLOWED : ALLOWED,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request.headers.get('Origin')) });
}

export async function onRequestGet({ request }) {
  return json({ ok: true, use: 'POST' }, 200, request);
}

export async function onRequestPost({ request, env }) {
  let p;
  try { p = await request.json(); }
  catch { return json({ ok: false, error: 'bad json' }, 400, request); }

  const name  = clip(p.name, 80);
  const email = String(p.email || '').trim().toLowerCase();
  const phone = clip(p.phone, 40);
  const stuck = clip(p.stuck, 600);

  if (!name) return json({ ok: false, error: 'I need your name.' }, 400, request);
  if (!EMAIL.test(email)) return json({ ok: false, error: 'That email does not look right.' }, 400, request);
  if (phone.replace(/\D/g, '').length < 9) {
    return json({ ok: false, error: 'That phone number looks too short.' }, 400, request);
  }
  if (!env.FUNNEL) return json({ ok: false, error: 'not configured' }, 503, request);
  if (!(await underLimit(env, request, 'rl:openday:', SIGNUPS_PER_HOUR))) {
    return json({ ok: false, error: 'Too many registrations from here. Try again in an hour, or WhatsApp me on 082 444 1831.' }, 429, request);
  }

  const isTest = email.indexOf('francois@') === 0;
  const first = name.split(/\s+/)[0];
  const row = {
    timestamp: new Date().toISOString(),
    event: 'Clarity Quest Open Day', when: WHEN,
    name, email, phone, stuck, test: isTest,
    source: clip(p.source, 80) || '7-weeks page',
  };

  // 1. KV first
  const key = 'openday:2026-10-13:' + row.timestamp + ':' + Math.random().toString(36).slice(2, 8);
  try {
    await env.FUNNEL.put(key, JSON.stringify(row));
  } catch {
    return json({ ok: false, error: 'That did not save. Try again in a moment.' }, 500, request);
  }

  // 2. Mailchimp
  const tags = isTest ? ['test'] : ['openday-registered', TAG_DAY];
  const captured = await tag(env, email, first, tags);

  // 3. the confirmation
  const body = ['Hi ' + first, '',
    'You have a seat at the Clarity Quest Open Day on ' + WHEN + '. It is online, it is free, and it runs for one hour.',
    '',
    'What happens in that hour: I walk you through 7 Weeks to Clarity, the seven Tuesday mornings that start on 20 October. ' +
      'A few people who have done it will tell you what it was actually like. Then you can ask me anything you want, ' +
      'including whether it is right for you, and I will tell you honestly if it is not.',
    '',
    ZOOM_JOIN
      ? 'Here is your joining link. Put the hour in your diary now, with the link in it, so something else does not take it.\n\n' +
        ZOOM_JOIN +
        '\n\nThe hour is recorded. If something comes up on the morning, come anyway if you can, and if you cannot I will send you the recording.'
      : 'I will send you the Zoom link closer to the day. Put the hour in your diary now so something else does not take it.',
    '',
    'See you there.', '', 'Much love,', 'Francois'].join('\n');
  const emailed = await mail(env, email, 'Your seat at the Clarity Quest Open Day', body);

  // 4. the note to him
  const note = [
    isTest ? 'TEST registration, from your own address. Nothing real to do.' : 'New Open Day registration.',
    '',
    'Event: Clarity Quest Open Day, ' + WHEN,
    'Name: ' + name,
    'Email: ' + email,
    'Phone: ' + phone,
    '',
    'What is keeping them from their potential:',
    stuck || '(left blank)',
    '',
    'Confirmation email to them: ' + (emailed ? 'sent' : 'NOT sent, the mailer failed'),
    'Mailchimp: ' + (captured ? 'tagged ' + tags.join(', ') : 'NOT tagged'),
    'Saved in KV as ' + key,
    'Page: ' + PAGE,
  ].join('\n');
  await mail(env, NOTIFY, (isTest ? 'TEST ' : '') + 'Open Day registration: ' + name, note);

  return json({ ok: true, emailed, captured, when: WHEN, test: isTest }, 200, request);
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

async function md5(str) {
  const buf = await crypto.subtle.digest('MD5', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function clip(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }

function json(body, status = 200, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign(
      { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      cors(request && request.headers.get('Origin'))
    ),
  });
}
