/* Cloudflare Pages Function: GET or POST /api/track?event=<name>
 *
 * Increments a daily counter in KV for each funnel event. No cookies,
 * no PII, no IP storage. Designed for a 7-event funnel, not general
 * analytics. Pair with Cloudflare Web Analytics for page-view baseline.
 *
 * Event names are allowlisted to prevent KV bloat from garbage hits.
 *
 * KV binding required: FUNNEL (create in Cloudflare dashboard, bind to
 * Pages project under Settings → Functions → KV namespace bindings).
 *
 * Storage shape:
 *   funnel:<YYYY-MM-DD>:<event>   → integer count
 *   funnel:<YYYY-MM-DD>:_events   → JSON array of event names seen that day
 *   funnel:_days                  → JSON array of YYYY-MM-DD strings seen
 */

const ALLOWED = new Set([
  // Landing
  'landing_view',
  'landing_choice_personal',
  'landing_choice_relational',
  'landing_library_click',
  // Qualifier
  'qualifier_view_personal',
  'qualifier_view_relational',
  'qualifier_answer_personal',
  'qualifier_answer_relational',
  // Lead capture
  'optin_submit_personal',
  'optin_submit_relational',
  // Delivery
  'thankyou_view_personal',
  'thankyou_view_relational',
  'tool_open_personal',
  'tool_open_relational',
  // Paid tease
  'paid_tease_click_personal',
  'paid_tease_click_relational',
  // Later: checkout events
  'checkout_view',
  'bump_added',
  'purchase',
  'oto_view',
  'oto_purchase'
]);

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  let event = url.searchParams.get('event') || '';
  let extra = url.searchParams.get('v') || '';

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      event = body.event || event;
      extra = body.v || extra;
    } catch { /* fall through to query params */ }
  }

  event = String(event).trim().slice(0, 64);
  extra = String(extra).trim().slice(0, 64).replace(/[^a-z0-9_-]/gi, '');

  if (!ALLOWED.has(event)) {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (!env.FUNNEL) {
    console.warn('FUNNEL KV not bound; skipping track for', event);
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const day = new Date().toISOString().slice(0, 10);
  const key = extra ? `funnel:${day}:${event}:${extra}` : `funnel:${day}:${event}`;

  try {
    // KV has no atomic increment; read-modify-write is acceptable at this volume.
    const cur = parseInt(await env.FUNNEL.get(key) || '0', 10);
    await env.FUNNEL.put(key, String(cur + 1));

    // Maintain index of days and events-per-day for the dashboard
    await indexUpsert(env.FUNNEL, 'funnel:_days', day);
    await indexUpsert(env.FUNNEL, `funnel:${day}:_events`, extra ? `${event}:${extra}` : event);
  } catch (e) {
    console.error('track write failed:', e);
  }

  return new Response(null, { status: 204, headers: corsHeaders() });
}

async function indexUpsert(kv, indexKey, value) {
  const raw = await kv.get(indexKey);
  let arr = [];
  try { arr = raw ? JSON.parse(raw) : []; } catch { arr = []; }
  if (!arr.includes(value)) {
    arr.push(value);
    await kv.put(indexKey, JSON.stringify(arr));
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };
}
