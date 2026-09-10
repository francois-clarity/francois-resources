/* Cloudflare Pages Function: POST /api/assessment
 *
 * One endpoint for every assessment on this site, rather than one function
 * per tool. A tool posts its result, this upserts the person on the audience
 * with the result written into merge fields, then applies the tag that starts
 * that tool's Mailchimp journey.
 *
 * Body:
 *   { tool, name, email, resultKey, resultName, line, axisA, axisB }
 *
 * Tags applied:
 *   assessment                       (always, so all of these are one segment)
 *   assessment:<tool>                which assessment they did
 *   result:<tool>:<resultKey>        which outcome they got
 *
 * Merge fields:
 *   FNAME      first name
 *   MMERGE2    the tool key, matching how the rest of the site tags source
 *   ARESULT    the human readable result name, for the email subject line
 *   ALINE      the one paragraph description, so the email can open with it
 *
 * The journey per tool is built in Mailchimp against the assessment:<tool>
 * tag. Nothing here sends mail directly, which is deliberate: Resend cannot
 * verify this domain while DNS sits on Wix, and Mailchimp is already the
 * proven route on family-mobile.
 *
 * Env (Pages -> Settings -> Variables and secrets):
 *   MAILCHIMP_API_KEY   "...-us5"  (data centre parsed from the suffix)
 *   MAILCHIMP_AUDIENCE  the Fresh Perspective list id
 *
 * Never throws back to the caller. A Mailchimp outage must not stop somebody
 * seeing results they just spent four minutes earning.
 */

const TOOLS = {
  // subject: what lands in the inbox. `discreet: true` means the page promised
  // a subject line that says nothing about the topic, because an inbox somebody
  // else reads is the exact harm those two tools exist to avoid. If you change
  // a discreet subject, you are breaking a promise made on the page.
  'communication-styles':    { merge: 'communication-styles',    subject: 'Your communication styles results' },
  'windows-and-walls':       { merge: 'windows-and-walls',       subject: 'The results you asked for', discreet: true },
  'two-different-problems':  { merge: 'two-different-problems',  subject: 'The results you asked for', discreet: true },
  'invisible-contracts':     { merge: 'invisible-contracts',     subject: 'Your invisible contract' },
  'tree-of-clarity':         { merge: 'tree-of-clarity',         subject: 'Your Tree of Clarity' },
  'belief-inventory':        { merge: 'belief-inventory',        subject: 'Your belief inventory' },
  'four-voices':             { merge: 'four-voices',             subject: 'The four voices in your head' },
  'emotional-language-wheel':{ merge: 'emotional-language-wheel',subject: 'Your check-in' },
};

/* The email itself. Kept here rather than in the Apps Script so the copy is in
   version control and swept by the same voice rules as everything else. Short
   on purpose: three or four lines and the link. */
function buildEmail(tool, cfg, name, p) {
  const link = String(p.link || '').slice(0, 900);
  const result = clip(p.resultName, 80);
  const lines = ['Hi ' + name, ''];
  if (cfg.discreet) {
    lines.push('Here is the link back to what you worked out. It opens exactly as you left it.');
  } else if (result) {
    lines.push('You came out as ' + result + '. Here is the whole thing again, in your own words.');
  } else {
    lines.push('Here is what you worked out, in your own words.');
  }
  lines.push('', link, '');
  lines.push('Keep the link. It is the only copy.');
  lines.push('', 'Much love,', 'Francois');
  return lines.join('\n');
}

export async function onRequestPost({ request, env }) {
  let p;
  try { p = await request.json(); }
  catch { return json({ ok: false, error: 'bad json' }, 400); }

  const tool = String(p.tool || '').trim().toLowerCase();
  if (!TOOLS[tool]) return json({ ok: false, error: 'unknown tool' }, 400);

  const email = String(p.email || '').trim().toLowerCase();
  const first = clip(p.name, 60);
  if (!first || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: 'missing fields' }, 400);
  }

  const apiKey = env.MAILCHIMP_API_KEY || '';
  const aud    = env.MAILCHIMP_AUDIENCE || '';
  if (!apiKey || !aud) return json({ ok: false, error: 'not configured' }, 503);

  const dc   = apiKey.split('-').pop();
  const auth = 'Basic ' + btoa('any:' + apiKey);
  const base = `https://${dc}.api.mailchimp.com/3.0`;
  const hash = await md5(email);
  const memberUrl = `${base}/lists/${aud}/members/${hash}`;

  const merge = {
    FNAME:   first,
    MMERGE2: TOOLS[tool].merge,
    ARESULT: clip(p.resultName, 80),
    ALINE:   clip(p.line, 255),
  };
  Object.keys(merge).forEach(k => { if (!merge[k]) delete merge[k]; });

  try {
    await fetch(memberUrl, {
      method: 'PUT',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_address: email,
        status_if_new: 'subscribed',
        merge_fields: merge,
      }),
    });

    const key = String(p.resultKey || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    const tags = [
      { name: 'assessment', status: 'active' },
      { name: 'assessment:' + tool, status: 'active' },
    ];
    if (key) tags.push({ name: `result:${tool}:${key}`, status: 'active' });

    await fetch(memberUrl + '/tags', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    });
  } catch {
    // Swallow deliberately. The caller shows results either way.
    return json({ ok: false, emailed: false, error: 'sync failed' }, 200);
  }

  /* Actually send the email.
   *
   * Until 10 Sep 2026 this endpoint returned ok:true as soon as Mailchimp was
   * tagged, and every tool then told the reader "Sent. Check your inbox." No
   * email ever arrived, because sending depended on a Mailchimp journey that
   * was never built. He gave a tool his details, nothing came, and he was
   * right to call it.
   *
   * So the sending happens here, through a Gmail-backed Apps Script web app,
   * and `emailed` reports what actually happened rather than what was hoped
   * for. Resend cannot verify this domain while DNS sits on Wix, and a
   * Mailchimp journey per tool is eight things to build and maintain instead
   * of one.
   */
  let emailed = false;
  if (env.RESULTS_MAILER_URL) {
    try {
      const res = await fetch(env.RESULTS_MAILER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject: TOOLS[tool].subject,
          body: buildEmail(tool, TOOLS[tool], first, p),
          key: env.RESULTS_MAILER_KEY || '',
        }),
      });
      const out = await res.json().catch(() => null);
      emailed = !!(res.ok && out && out.ok);
    } catch {
      emailed = false;
    }
  }

  return json({ ok: true, emailed });
}

function clip(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/* Mailchimp addresses a member by the md5 of their lowercased email, and
   Workers has no md5 in crypto.subtle, so it is implemented here. */
async function md5(str) {
  const msg = new TextEncoder().encode(str);
  const words = [];
  for (let i = 0; i < msg.length; i++) words[i >> 2] = (words[i >> 2] || 0) | (msg[i] << ((i % 4) * 8));
  words[msg.length >> 2] = (words[msg.length >> 2] || 0) | (0x80 << ((msg.length % 4) * 8));
  const bitLen = msg.length * 8;
  const nBlocks = ((bitLen + 64) >>> 9) + 1;
  const x = new Array(nBlocks * 16).fill(0);
  for (let i = 0; i < words.length; i++) x[i] = words[i] | 0;
  x[nBlocks * 16 - 2] = bitLen;

  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
             5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
             4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
             6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const K = [];
  for (let i = 0; i < 64; i++) K[i] = (Math.abs(Math.sin(i + 1)) * 4294967296) | 0;

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const rl = (v, c) => (v << c) | (v >>> (32 - c));

  for (let i = 0; i < x.length; i += 16) {
    let A = a0, B = b0, C = c0, D = d0;
    for (let j = 0; j < 64; j++) {
      let F, g;
      if (j < 16)      { F = (B & C) | (~B & D);         g = j; }
      else if (j < 32) { F = (D & B) | (~D & C);         g = (5 * j + 1) % 16; }
      else if (j < 48) { F = B ^ C ^ D;                  g = (3 * j + 5) % 16; }
      else             { F = C ^ (B | ~D);               g = (7 * j) % 16; }
      F = (F + A + K[j] + (x[i + g] | 0)) | 0;
      A = D; D = C; C = B;
      B = (B + rl(F, S[j])) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }

  const hex = n => {
    let s = '';
    for (let i = 0; i < 4; i++) s += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    return s;
  };
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}
