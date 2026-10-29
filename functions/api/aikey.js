/* Cloudflare Pages Function: POST /api/aikey  { key, email, name, letter }
 *
 * Hands over a free AI key for an email address. Built 29 Oct 2026 for the
 * Tree of Clarity AI key, which replaced the RUT Diagnostic as the free call
 * to action (his word, via Mark).
 *
 * The person lands in the main audience, Fresh Perspective (7a7438d8f4),
 * with the key's tag. Nobody is put on the weekly letter unless they tick
 * the box: a new address without the tick is stored as "transactional",
 * which Mailchimp keeps out of every campaign. An address already on the
 * list keeps whatever status it has; only the tag is added.
 *
 * The answer always carries the file's address. A Mailchimp failure is
 * logged and never stands between the person and the key.
 *
 * Env: MAILCHIMP_API_KEY (already set for /api/lead).
 *      AIKEY_DRY_RUN=1 skips Mailchimp, for local testing.
 */

const AUDIENCE = '7a7438d8f4';

/* Each key this endpoint may hand out, and the one tag it writes. Adding a
   key here is a deliberate act; nothing the caller sends can name a tag. */
const KEYS = {
  'tree-of-clarity': {
    tag: 'ai-key-tree-of-clarity',
    file: '/tree-of-clarity-key/tree-of-clarity-ai-key.pdf',
  },
};

const LETTER_TAG = 'weekly-letter-optin';

export async function onRequestPost({ request, env }) {
  let p;
  try { p = await request.json(); } catch { return json({ ok: false, error: 'bad request' }, 400); }

  const key = KEYS[String(p.key || '')];
  if (!key) return json({ ok: false, error: 'unknown key' }, 400);

  const email = String(p.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json({ ok: false, error: 'email' }, 400);
  }
  const first = String(p.name || '').trim().split(/\s+/)[0].slice(0, 40);
  const letter = p.letter === true;

  let mailchimp = 'skipped';
  if (env.AIKEY_DRY_RUN !== '1') mailchimp = await sync(env, email, first, letter, key.tag);
  return json({ ok: true, url: key.file, mailchimp });
}

async function sync(env, email, first, letter, tag) {
  try {
    const apiKey = env.MAILCHIMP_API_KEY || '';
    const dc = apiKey.split('-').pop();
    if (!apiKey || !/^[a-z0-9]{2,8}$/i.test(dc)) { console.warn('aikey: no Mailchimp key'); return 'skipped'; }
    const auth = 'Basic ' + btoa('any:' + apiKey);
    const memberUrl = `https://${dc}.api.mailchimp.com/3.0/lists/${AUDIENCE}/members/${await md5(email)}`;

    const put = await fetch(memberUrl, {
      method: 'PUT',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_address: email,
        status_if_new: letter ? 'subscribed' : 'transactional',
        merge_fields: first ? { FNAME: first } : {},
      }),
    });
    if (!put.ok) { console.error('aikey: member PUT', put.status, await put.text()); return 'error'; }

    const tags = letter ? [tag, LETTER_TAG] : [tag];
    const tr = await fetch(memberUrl + '/tags', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: tags.map(name => ({ name, status: 'active' })) }),
    });
    if (!tr.ok) { console.error('aikey: tags', tr.status, await tr.text()); return 'error'; }
    return 'ok';
  } catch (e) {
    console.error('aikey: Mailchimp request failed', e && e.message);
    return 'error';
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
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
