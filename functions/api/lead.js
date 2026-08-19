/* Cloudflare Pages Function: POST /api/lead
 *
 * Lead capture for the resources funnel. Syncs to Mailchimp with
 * tags that encode which path and which tool the person chose.
 *
 * Body:
 *   { name, email, path: 'personal'|'relational', tool: <key>, answer: <key> }
 *
 * Tags applied:
 *   resources-funnel        (always)
 *   path:personal | path:relational
 *   tool:<tool-key>
 *   answer:<answer-key>
 *
 * Env (set in Cloudflare Pages → Settings → Environment variables):
 *   MAILCHIMP_API_KEY, MAILCHIMP_AUDIENCE
 *
 * Never throws back to the client. A Mailchimp failure does not block
 * the user from reaching their tool.
 */

const BASE_TAG = 'resources-funnel';

export async function onRequestPost({ request, env }) {
  let payload;
  try { payload = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  const name   = String(payload.name || '').trim().slice(0, 80);
  const email  = String(payload.email || '').trim().toLowerCase();
  const path   = payload.path === 'relational' ? 'relational' : 'personal';
  const tool   = sanitizeKey(payload.tool);
  const answer = sanitizeKey(payload.answer);

  if (!isEmail(email)) {
    return json({ ok: false, error: 'Invalid email' }, 400);
  }

  const apiKey = env.MAILCHIMP_API_KEY || '';
  const audienceId = env.MAILCHIMP_AUDIENCE || '';
  if (!apiKey || !audienceId) {
    console.warn('Mailchimp env vars not set; skipping sync.');
    return json({ ok: true, mailchimp: 'skipped' });
  }

  const dc = apiKey.split('-').pop();
  if (!dc || !/^[a-z0-9]{2,8}$/i.test(dc)) {
    return json({ ok: true, mailchimp: 'error' });
  }

  const auth = 'Basic ' + btoa(`anystring:${apiKey}`);
  const base = `https://${dc}.api.mailchimp.com/3.0`;
  const subscriberHash = await md5(email);
  const memberUrl = `${base}/lists/${audienceId}/members/${subscriberHash}`;

  const tags = [BASE_TAG, `path:${path}`];
  if (tool)   tags.push(`tool:${tool}`);
  if (answer) tags.push(`answer:${answer}`);

  try {
    const lookup = await fetch(memberUrl, { headers: { Authorization: auth } });

    if (lookup.status === 200) {
      await applyTags(base, audienceId, subscriberHash, auth, tags);
      return json({ ok: true, mailchimp: 'updated', alreadyOnList: true });
    }

    if (lookup.status === 404) {
      const firstName = name.split(/\s+/)[0] || '';
      const putRes = await fetch(memberUrl, {
        method: 'PUT',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_address: email,
          status_if_new: 'subscribed',
          status: 'subscribed',
          merge_fields: firstName ? { FNAME: firstName } : {},
          tags
        })
      });
      if (!putRes.ok) {
        console.error('Mailchimp PUT failed:', putRes.status, await putRes.text());
        return json({ ok: true, mailchimp: 'error' });
      }
      return json({ ok: true, mailchimp: 'created', alreadyOnList: false });
    }

    console.error('Mailchimp lookup unexpected status:', lookup.status);
    return json({ ok: true, mailchimp: 'error' });
  } catch (e) {
    console.error('Mailchimp request failed:', e);
    return json({ ok: true, mailchimp: 'error' });
  }
}

async function applyTags(base, audienceId, subscriberHash, auth, tags) {
  const url = `${base}/lists/${audienceId}/members/${subscriberHash}/tags`;
  const body = { tags: tags.map(name => ({ name, status: 'active' })) };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) console.warn('Tag apply failed:', res.status, await res.text());
}

function sanitizeKey(v) {
  return String(v || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/* MD5 for Mailchimp subscriber hash. Workers Web Crypto has no MD5. */
async function md5(input) {
  return md5Bytes(new TextEncoder().encode(input));
}
function md5Bytes(bytes) {
  const bitLen = bytes.length * 8;
  const padLen = ((bytes.length + 8) >>> 6) + 1 << 6;
  const padded = new Uint8Array(padLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  new DataView(padded.buffer).setUint32(padLen - 8, bitLen >>> 0, true);
  new DataView(padded.buffer).setUint32(padLen - 4, Math.floor(bitLen / 0x100000000), true);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  const K = [0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391];
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const view = new DataView(padded.buffer);
  for (let offset = 0; offset < padLen; offset += 64) {
    const M = new Array(16);
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(offset + i * 4, true);
    let A = a, B = b, C = c, D = d;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16)      { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D;           g = (3 * i + 5) % 16; }
      else             { F = C ^ (B | ~D);        g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + (((F << S[i]) | (F >>> (32 - S[i]))) >>> 0)) >>> 0;
    }
    a = (a + A) >>> 0; b = (b + B) >>> 0; c = (c + C) >>> 0; d = (d + D) >>> 0;
  }
  return [a, b, c, d].map(v => {
    let s = '';
    for (let i = 0; i < 4; i++) s += ((v >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    return s;
  }).join('');
}
