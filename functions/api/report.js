/* Cloudflare Pages Function: POST /api/report
 *
 * The "Something not working?" box on every assessment posts here.
 *
 * Francois, 28 Sep 2026: "A little space that says something not working,
 * where people can click on it, they can tell me exactly what's not working,
 * take a screenshot, paste it. You get that message immediately."
 *
 * What it does:
 *   1. Puts any pasted screenshot in KV under an unguessable key, so the
 *      email can carry a link to it rather than a megabyte of base64.
 *   2. Emails him at once through the same Apps Script that sends the
 *      result emails, with what they typed AND what the page knew about
 *      itself.
 *
 * THE AUTOMATIC DETAIL IS THE POINT. What somebody types is usually "it
 * doesn't work". What actually fixes it is the item number, the browser and
 * the error the page threw. A client reported "I selected but I can't
 * continue" on the Vision assessment in September; a screenshot and a
 * conversation were needed to find it. This would have said which item and
 * what the console said.
 *
 * Screenshots live for thirty days and then expire. They can contain
 * somebody's own answers, so the key is 32 random hex characters and is
 * never listed anywhere. Unguessable rather than access-controlled, which
 * is the same standing this site's result links already have.
 *
 * Env: FUNNEL (KV), RESULTS_MAILER_URL, RESULTS_MAILER_KEY, REPORT_TO
 */

const SHOT_TTL = 60 * 60 * 24 * 30;      // thirty days
const MAX_SHOT = 4 * 1024 * 1024;        // 4MB of decoded image
const DEFAULT_TO = 'francois@francoisesterhuizen.com';

export async function onRequestPost({ request, env }) {
  let p;
  try { p = await request.json(); }
  catch { return json({ ok: false, error: 'bad json' }, 400); }

  const said = clip(p.said, 2000);
  if (!said) return json({ ok: false, error: 'nothing said' }, 400);

  /* Their own words first, then everything the page knew without being
     asked. Kept to one screen so he can read it on a phone. */
  const where = clip(p.url, 400);
  const lines = [
    said,
    '',
    '---',
    'Tool:     ' + (clip(p.tool, 60) || 'unknown'),
    'Screen:   ' + (clip(p.screen, 120) || 'unknown'),
    'Page:     ' + where,
    'Browser:  ' + clip(p.ua, 200),
    'Screen size: ' + clip(p.viewport, 40),
    'When:     ' + new Date().toISOString(),
  ];
  if (p.name || p.email) lines.push('From:     ' + [clip(p.name, 60), clip(p.email, 120)].filter(Boolean).join(', '));

  const errors = Array.isArray(p.errors) ? p.errors.slice(0, 6).map(e => clip(e, 300)) : [];
  if (errors.length) {
    lines.push('', 'What the page threw:');
    errors.forEach(e => lines.push('  ' + e));
  }

  /* Store the screenshot, if there is one. A failure here must not lose the
     report: the email still goes, and says the screenshot did not make it. */
  let shotNote = 'No screenshot.';
  if (typeof p.shot === 'string' && p.shot.startsWith('data:image/')) {
    const stored = await storeShot(env, p.shot, request);
    shotNote = stored.ok ? 'Screenshot: ' + stored.url
                         : 'A screenshot was pasted but it did not save (' + stored.why + ').';
  }
  lines.push('', shotNote);

  let emailed = false;
  if (env.RESULTS_MAILER_URL) {
    try {
      const res = await fetch(env.RESULTS_MAILER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: env.REPORT_TO || DEFAULT_TO,
          subject: 'Not working: ' + (clip(p.tool, 40) || 'an assessment'),
          body: lines.join('\n'),
          key: env.RESULTS_MAILER_KEY || '',
        }),
      });
      const out = await res.json().catch(() => null);
      emailed = !!(res.ok && out && out.ok);
    } catch { emailed = false; }
  }

  /* Kept in KV as well as emailed, so a report is not lost if the mailer is
     down, and so there is something to look through later. */
  try {
    if (env.FUNNEL) {
      const id = rid();
      await env.FUNNEL.put('report:' + id, JSON.stringify({ said, where, at: Date.now(), tool: clip(p.tool, 60) }),
        { expirationTtl: SHOT_TTL });
    }
  } catch { /* the email is the one that matters */ }

  return json({ ok: true, emailed });
}

async function storeShot(env, dataUrl, request) {
  if (!env.FUNNEL) return { ok: false, why: 'no storage configured' };
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(5, comma);          // image/png;base64
  const type = meta.split(';')[0];
  if (!/^image\/(png|jpeg|webp|gif)$/.test(type)) return { ok: false, why: 'not an image' };
  const b64 = dataUrl.slice(comma + 1);
  if (b64.length * 3 / 4 > MAX_SHOT) return { ok: false, why: 'over 4MB' };
  try {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const id = rid();
    await env.FUNNEL.put('shot:' + id, bin, {
      expirationTtl: SHOT_TTL,
      metadata: { type },
    });
    const origin = new URL(request.url).origin;
    return { ok: true, url: origin + '/api/shot/' + id };
  } catch (e) {
    return { ok: false, why: 'could not decode' };
  }
}

function rid() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

function clip(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
