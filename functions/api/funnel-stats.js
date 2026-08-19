/* Cloudflare Pages Function: GET /api/funnel-stats?key=<ANALYTICS_KEY>&days=<N>
 *
 * Returns the funnel counters from KV for the last N days (default 14).
 * Protected by a shared secret in env.ANALYTICS_KEY so the counts are not public.
 *
 * Response:
 *   { ok:true, days:[...], events:{ <event>: { total:N, byDay:{...}, byValue:{...} } } }
 */

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '14', 10)));

  if (!env.ANALYTICS_KEY || key !== env.ANALYTICS_KEY) {
    return json({ ok: false, error: 'unauthorised' }, 401);
  }
  if (!env.FUNNEL) {
    return json({ ok: false, error: 'FUNNEL KV not bound' }, 500);
  }

  // Build the date list for the window
  const today = new Date();
  const dayList = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    dayList.push(d.toISOString().slice(0, 10));
  }

  const events = {};
  for (const day of dayList) {
    const rawList = await env.FUNNEL.get(`funnel:${day}:_events`);
    let list = [];
    try { list = rawList ? JSON.parse(rawList) : []; } catch { list = []; }
    for (const entry of list) {
      // entry is "event" or "event:value"
      const sep = entry.indexOf(':');
      const ev = sep >= 0 ? entry.slice(0, sep) : entry;
      const val = sep >= 0 ? entry.slice(sep + 1) : '';
      const k = val ? `funnel:${day}:${ev}:${val}` : `funnel:${day}:${ev}`;
      const n = parseInt(await env.FUNNEL.get(k) || '0', 10);
      if (!events[ev]) events[ev] = { total: 0, byDay: {}, byValue: {} };
      events[ev].total += n;
      events[ev].byDay[day] = (events[ev].byDay[day] || 0) + n;
      if (val) events[ev].byValue[val] = (events[ev].byValue[val] || 0) + n;
    }
  }

  return json({ ok: true, days: dayList, events }, 200);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
