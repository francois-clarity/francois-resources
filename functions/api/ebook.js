/* Cloudflare Pages Function: POST /api/ebook
 *
 * Gives The Empowering Truth of Responsibility away in exchange for an email
 * address. His call, 30 Sep 2026: the book becomes the lead magnet rather than
 * a R270 product, so that somebody leaving a page still has a reason to say
 * who they are.
 *
 * The PDF lives in private KV and is not served by the site, which is how the
 * paid route was built. So this does not hand over a file. It mints a one-time
 * token, and /api/download trades that token for the PDF once.
 *
 *   { action: 'gift', name, email, source }
 *     1. Mailchimp first, because the email address IS the point of this.
 *     2. A token in KV, single use, good for 24 hours.
 *     3. The link back to the caller, and the same link by email so a lost tab
 *        does not lose the book.
 *
 * The token is not a security boundary. The book is free now, so anybody
 * sharing a link costs nothing. It exists so the download URL cannot be posted
 * somewhere and quietly replace the page that asks for the email.
 *
 * His own address is a test, the standing rule: tagged test, nothing else.
 *
 * Env: MAILCHIMP_API_KEY, MAILCHIMP_AUDIENCE, RESULTS_MAILER_URL,
 * RESULTS_MAILER_KEY. KV binding: FUNNEL.
 */

const NOTIFY = 'francois@francoisesterhuizen.com';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const BOOK = 'responsibility';
const TITLE = 'The Empowering Truth of Responsibility';
const SITE = 'https://resources.francoisesterhuizen.com';
const TTL = 60 * 60 * 24;          // a day is plenty to click a link
const GIFTS_PER_HOUR = 10;

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}
export async function onRequestGet({ request }) {
  return json({ ok: true, use: 'POST' }, 200);
}

export async function onRequestPost({ request, env }) {
  let p;
  try { p = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }

  const name = clip(p.name, 80);
  const email = clip(p.email, 160).toLowerCase();
  if (!EMAIL.test(email)) return json({ ok: false, error: 'That email does not look right.' }, 400);
  if (!await underLimit(env, request, 'giftrate:', GIFTS_PER_HOUR)) {
    return json({ ok: false, error: 'Too many requests. Try again shortly.' }, 429);
  }

  const isTest = email === NOTIFY;
  const first = (name.split(/\s+/)[0] || '').trim();

  // 1. Mailchimp. This is the whole reason the page exists.
  const tags = isTest ? ['test'] : ['ebook-responsibility', 'lead-magnet'];
  const captured = await tag(env, email, first, tags);

  // 2. a single-use token
  const token = crypto.randomUUID().replace(/-/g, '');
  if (env.FUNNEL) {
    await env.FUNNEL.put('gift:' + token,
      JSON.stringify({ book: BOOK, email, name, at: new Date().toISOString(),
                       source: clip(p.source, 80) || 'unknown' }),
      { expirationTtl: TTL });
  }
  const link = SITE + '/api/download?book=' + BOOK + '&gift=' + token;

  // 3. the same link by email, so a closed tab does not lose the book
  const body = [first ? 'Hi ' + first : 'Hello', '',
    'Here is ' + TITLE + '.', '', link, '',
    'The link works once and lasts a day. If it expires before you get to it, ' +
    'reply to this and I will send the book straight through.',
    '', 'Much love,', 'Francois'].join('\n');
  const emailed = await mail(env, email, TITLE, body);

  if (!isTest) {
    await mail(env, NOTIFY, 'Ebook: ' + (name || email),
      ['Someone took the free ebook.', '', 'Name: ' + (name || '(not given)'),
       'Email: ' + email, 'From: ' + (clip(p.source, 80) || 'unknown'),
       'Mailchimp: ' + (captured ? 'tagged' : 'NOT tagged'),
       'Email to them: ' + (emailed ? 'sent' : 'NOT sent')].join('\n'));
  }

  return json({ ok: true, url: link, emailed, captured, test: isTest }, 200);
}

async function underLimit(env, request, prefix, max) {
  if (!env.FUNNEL) return true;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const k = prefix + ip + ':' + new Date().toISOString().slice(0, 13);
  const n = parseInt(await env.FUNNEL.get(k) || '0', 10) + 1;
  await env.FUNNEL.put(k, String(n), { expirationTtl: 3600 });
  return n <= max;
}

async function tag(env, email, first, tags) {
  if (!env.MAILCHIMP_API_KEY || !env.MAILCHIMP_AUDIENCE) return false;
  const dc = env.MAILCHIMP_API_KEY.split('-')[1];
  if (!dc) return false;
  const hash = await md5(email);
  const base = 'https://' + dc + '.api.mailchimp.com/3.0/lists/' + env.MAILCHIMP_AUDIENCE + '/members/' + hash;
  const auth = 'Basic ' + btoa('anystring:' + env.MAILCHIMP_API_KEY);
  try {
    await fetch(base, { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_address: email, status_if_new: 'subscribed',
                             merge_fields: first ? { FNAME: first } : {} }) });
    await fetch(base + '/tags', { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: tags.map(t => ({ name: t, status: 'active' })) }) });
    return true;
  } catch { return false; }
}

async function mail(env, to, subject, body) {
  if (!env.RESULTS_MAILER_URL) return false;
  try {
    const res = await fetch(env.RESULTS_MAILER_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body, key: env.RESULTS_MAILER_KEY || '' }),
    });
    const out = await res.json().catch(() => null);
    return !!(res.ok && out && out.ok);
  } catch { return false; }
}

async function md5(str) {
  const buf = await crypto.subtle.digest('MD5', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function clip(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }
function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
           'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
}
function json(o, s) {
  return new Response(JSON.stringify(o), { status: s,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors() } });
}
