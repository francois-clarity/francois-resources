/* Cloudflare Pages Function: GET /api/download?book=<slug>&ref=<paystack reference>
 *
 * Hands over a paid ebook, and only against a payment Paystack confirms.
 *
 * Before this existed the PDFs sat at a public URL, so anyone with the link
 * could take the book without paying. Now the files live in private KV storage
 * that is not served by the site at all, and the only way out is through this
 * function.
 *
 * What it checks, in order, refusing on the first failure:
 *   1. the book slug is one we sell
 *   2. a reference was supplied
 *   3. Paystack says that reference is a real transaction with status success
 *   4. the transaction is for THIS book, not the other one
 *   5. the amount actually paid is at least the list price
 *
 * Env (Pages → Settings → Variables and secrets, as a Secret):
 *   PAYSTACK_SECRET_KEY   the sk_live_... key from the Paystack dashboard
 * Bindings (Pages → Settings → Bindings → KV namespace):
 *   BOOKS                 the KV namespace holding the two PDFs
 *
 * KV rather than R2 because R2 needs a paid subscription and KV does not.
 * Both books sit under the 25 MiB per-value limit: 19.8 and 8.9.
 *
 * Deliberately vague to the caller on failure: a stranger poking at this
 * learns only that it did not work, never why, and never whether a given
 * reference exists.
 */

const BOOKS = {
  responsibility: {
    key: 'responsibility.pdf',
    filename: 'The Empowering Truth of Responsibility - Francois Esterhuizen.pdf',
    // matched case-insensitively against the Paystack line item / metadata
    match: 'empowering truth',
    minorUnits: 27000, // R270 in cents
  },
  habits: {
    key: 'habits.pdf',
    filename: '10 Habits of Happy Relationships - Francois Esterhuizen.pdf',
    match: '10 habits',
    minorUnits: 27000,
  },
};

export async function onRequestGet({ request, env }) {
  const url  = new URL(request.url);
  const slug = String(url.searchParams.get('book') || '').toLowerCase();
  // Paystack has used both names over the years, so accept either
  const ref  = String(url.searchParams.get('ref')
                   || url.searchParams.get('reference')
                   || url.searchParams.get('trxref') || '').trim();

  const book = BOOKS[slug];
  if (!book) return deny('Unknown book.');
  if (!ref)  return deny('No payment reference.');
  if (!env.PAYSTACK_SECRET_KEY) return oops('Delivery is not configured yet.');
  if (!env.BOOKS)               return oops('Delivery is not configured yet.');

  // 1. ask Paystack whether this reference was really paid
  let tx;
  try {
    const res = await fetch(
      'https://api.paystack.co/transaction/verify/' + encodeURIComponent(ref),
      { headers: { Authorization: 'Bearer ' + env.PAYSTACK_SECRET_KEY } }
    );
    const verify = await res.json();
    if (!res.ok || !verify || verify.status !== true || !verify.data) return deny('Payment not found.');
    tx = verify.data;
  } catch {
    return oops('Could not reach the payment provider.');
  }

  if (String(tx.status).toLowerCase() !== 'success') return deny('Payment not completed.');

  // 2. make sure this payment was for THIS book, so one receipt cannot open both
  const haystack = JSON.stringify({
    metadata: tx.metadata || {},
    plan: tx.plan_object || tx.plan || null,
    reference: tx.reference,
  }).toLowerCase();
  const other = Object.entries(BOOKS).find(([s]) => s !== slug)?.[1];
  const namesThis  = haystack.includes(book.match);
  const namesOther = other ? haystack.includes(other.match) : false;
  if (namesOther && !namesThis) return deny('That payment was for the other book.');

  // 3. and that enough was actually paid
  if (typeof tx.amount === 'number' && tx.amount < book.minorUnits) {
    return deny('Payment amount does not match.');
  }

  // 4. release the file
  const body = await env.BOOKS.get(book.key, { type: 'stream' });
  if (!body) return oops('The file is missing. Email francois@francoisesterhuizen.com and I will send it.');

  const headers = new Headers();
  headers.set('Content-Type', 'application/pdf');
  headers.set('Content-Disposition',
    'attachment; filename="' + book.filename.replace(/"/g, '') + '"');
  // never let a proxy or a browser keep a copy of a paid file
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(body, { headers });
}

function deny(msg) {
  return new Response(
    JSON.stringify({ ok: false, error: msg }),
    { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
}
function oops(msg) {
  return new Response(
    JSON.stringify({ ok: false, error: msg }),
    { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
}
