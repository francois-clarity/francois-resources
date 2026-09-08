/* Cloudflare Pages Function: POST /api/waitlist
 *
 * Waiting list signups from the events page. Francois, 8 Sep 2026: name, email
 * and phone number for each event, landing on one Google Sheet so all the
 * waiting lists are in one place.
 *
 * Two destinations, on purpose:
 *
 *   1. KV, always, first. A signup is somebody's intention to give him money
 *      and it must never depend on a third party being up. Written before
 *      anything else is attempted, and the caller is told it worked as soon as
 *      this succeeds.
 *   2. The Google Sheet, through an Apps Script web app, when the URL is
 *      configured. Sheets has no simple append-a-row API that a Worker can use
 *      without a service account and signed JWTs, and a bound Apps Script is
 *      about fifteen lines he pastes once. If it fails, the KV copy is still
 *      there and /api/waitlist?export= reads it back out.
 *
 * Env (Pages -> Settings -> Variables and secrets):
 *   WAITLIST_SHEET_URL   the Apps Script web app URL (a Secret)
 *   WAITLIST_EXPORT_KEY  any long random string, to read the list back
 * Bindings (Pages -> Settings -> Bindings -> KV namespace):
 *   FUNNEL               reuses the namespace the funnel counters already use
 *
 * Keys are waitlist:<event>:<iso timestamp>:<short random> so they sort by
 * event then by time, and two people signing up in the same second cannot
 * overwrite each other.
 */

const EVENTS = {
  'couples-communication': 'The Couples Communication Workshop',
  'confidence-with-claude': 'Confidence with Claude',
  'general': 'Anything new',
};

export async function onRequestPost({ request, env }) {
  let p;
  try { p = await request.json(); }
  catch { return json({ ok: false, error: 'bad json' }, 400); }

  const key = String(p.event || '').trim().toLowerCase();
  const event = EVENTS[key];
  if (!event) return json({ ok: false, error: 'unknown event' }, 400);

  const name  = clip(p.name, 80);
  const email = String(p.email || '').trim().toLowerCase();
  const phone = clip(p.phone, 40);
  const notes = clip(p.notes, 400);

  if (!name)  return json({ ok: false, error: 'I need a name.' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: 'That email does not look right.' }, 400);
  }
  // Loose on purpose. South African numbers get written a dozen ways and
  // refusing a real person over a formatting rule costs more than a messy cell.
  if (phone.replace(/\D/g, '').length < 9) {
    return json({ ok: false, error: 'That phone number looks too short.' }, 400);
  }

  const row = {
    timestamp: new Date().toISOString(),
    event, eventKey: key, name, email, phone, notes,
    source: clip(p.source, 80) || 'events page',
  };

  if (!env.FUNNEL) return json({ ok: false, error: 'not configured' }, 503);

  // 1. KV first, and the answer to the caller depends only on this
  const id = row.timestamp + ':' + Math.random().toString(36).slice(2, 8);
  try {
    await env.FUNNEL.put('waitlist:' + key + ':' + id, JSON.stringify(row));
  } catch {
    return json({ ok: false, error: 'could not save' }, 500);
  }

  // 2. the sheet, best effort, never blocking the reply
  if (env.WAITLIST_SHEET_URL) {
    try {
      await fetch(env.WAITLIST_SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      });
    } catch { /* KV has it; the export endpoint can reconcile */ }
  }

  return json({ ok: true });
}

/* GET /api/waitlist?export=<WAITLIST_EXPORT_KEY>  ->  CSV of everybody so far.
   The safety net: if the sheet was never wired up, or the Apps Script broke
   for a week, nothing is lost and this hands the whole list back. */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const given = url.searchParams.get('export') || '';
  const want = env.WAITLIST_EXPORT_KEY || '';
  if (!want || given !== want) return json({ ok: false }, 404);
  if (!env.FUNNEL) return json({ ok: false, error: 'not configured' }, 503);

  const rows = [];
  let cursor;
  do {
    const list = await env.FUNNEL.list({ prefix: 'waitlist:', cursor, limit: 1000 });
    for (const k of list.keys) {
      const v = await env.FUNNEL.get(k.name);
      if (v) { try { rows.push(JSON.parse(v)); } catch {} }
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  rows.sort((a, b) => (a.event + a.timestamp).localeCompare(b.event + b.timestamp));
  const head = ['Timestamp', 'Event', 'Name', 'Email', 'Phone', 'Notes', 'Source'];
  const csv = [head.join(',')].concat(rows.map(r => [
    r.timestamp, r.event, r.name, r.email, r.phone, r.notes || '', r.source || '',
  ].map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(','))).join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="waiting-list.csv"',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function clip(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
