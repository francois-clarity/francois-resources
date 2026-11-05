/* Cloudflare Pages Function: POST /api/cwcclient
 *
 * Free Confidence with Claude seats for existing clients and Clarity Questers
 * (Francois, 5 Nov 2026). He gives them a code; the code opens a short form on
 * the Confidence with Claude page instead of the Paystack button. Only the
 * server decides whether a code is good.
 *
 *   { action: 'check', code }                              is the code live?
 *   { action: 'claim', code, name, email, phone, run }      save the seat
 *     1. KV first, under waitlist:confidence-with-claude-client:, so the
 *        seat sits in the same export as every waiting list.
 *     2. An email to Francois with the details, best effort.
 * Nothing is emailed to the client automatically: the page tells them he
 * will be in touch, and he (or Claudia) sends the preparation note.
 *
 * To end the offer, set CWC_CLIENT_ON to false.
 * Env: RESULTS_MAILER_URL, RESULTS_MAILER_KEY. KV binding: FUNNEL.
 */

export const CWC_CLIENT_ON = true;
const CODES = ['CLARITYCLIENT'];
const NOTIFY = 'francois@francoisesterhuizen.com';
const RUNS = {
  'nov-2026': '17 Nov, 24 Nov and 1 Dec 2026, 09:30 to 12:00',
  '2027': 'A 2027 run (dates to follow)',
};

export async function onRequestPost({ request, env }) {
  let p;
  try { p = await request.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  const code = String(p.code || '').trim().toUpperCase();
  const good = CWC_CLIENT_ON && CODES.includes(code);

  if (p.action === 'check') {
    return json({ ok: good, error: good ? undefined : 'That code does not work. Check it with Francois.' });
  }
  if (p.action !== 'claim') return json({ ok: false, error: 'unknown action' }, 400);
  if (!good) return json({ ok: false, error: 'That code does not work. Check it with Francois.' }, 403);

  const name = clip(p.name, 80);
  const email = String(p.email || '').trim().toLowerCase();
  const phone = clip(p.phone, 40);
  const run = RUNS[p.run] ? p.run : 'nov-2026';
  if (!name) return json({ ok: false, error: 'I need a name.' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: 'That email does not look right.' }, 400);
  if (phone.replace(/\D/g, '').length < 9) return json({ ok: false, error: 'That phone number looks too short.' }, 400);
  if (!env.FUNNEL) return json({ ok: false, error: 'not configured' }, 503);

  const row = {
    timestamp: new Date().toISOString(),
    event: 'Confidence with Claude (client seat, free)', eventKey: 'confidence-with-claude-client',
    name, email, phone, notes: 'Run: ' + RUNS[run] + ' · code ' + code, source: 'client code',
  };
  const id = row.timestamp + ':' + Math.random().toString(36).slice(2, 8);
  try { await env.FUNNEL.put('waitlist:confidence-with-claude-client:' + id, JSON.stringify(row)); }
  catch { return json({ ok: false, error: 'could not save' }, 500); }

  if (env.RESULTS_MAILER_URL) {
    try {
      await fetch(env.RESULTS_MAILER_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: NOTIFY,
          subject: 'Confidence with Claude: free client seat for ' + name,
          body: name + ' claimed a free client seat with code ' + code + '.\n\nRun: ' + RUNS[run] +
            '\nEmail: ' + email + '\nPhone: ' + phone + '\n\nSend them the preparation note.',
          key: env.RESULTS_MAILER_KEY || '',
        }),
      });
    } catch { /* KV has it */ }
  }
  return json({ ok: true });
}

function clip(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
