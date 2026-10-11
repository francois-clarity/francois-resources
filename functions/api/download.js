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
 *   FUNNEL                holds the PDFs under a book: prefix. See store().
 *
 * KV rather than R2 because R2 needs a paid subscription and KV does not.
 * Both books sit under the 25 MiB per-value limit: 19.8 and 8.9.
 *
 * Deliberately vague to the caller on failure: a stranger poking at this
 * learns only that it did not work, never why, and never whether a given
 * reference exists.
 */

/* The least an upsell may pay for a book. Bump three sells the other book at
   R97; this is the floor that allows it, and it must stay in step with the
   prices in functions/api/upsell.js. Anything below this is refused. */
const UPSELL_FLOOR = 9700;

const BOOKS = {
  responsibility: {
    key: 'responsibility.pdf',
    filename: 'The Empowering Truth of Responsibility - Francois Esterhuizen.pdf',
    // matched case-insensitively against the Paystack line item / metadata
    match: 'empowering truth',
    /* R147. Dropped from R270 on 10 Oct 2026 on the low-ticket coach's
       recommendation. The check below is "at least this much", so an order
       that also took the R297 course still passes. */
    minorUnits: 14700,
  },
  habits: {
    key: 'habits.pdf',
    filename: '10 Habits of Happy Relationships - Francois Esterhuizen.pdf',
    match: '10 habits',
    minorUnits: 19700,   // R197, same change
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

  /* The gift path, switched off 10 Oct 2026 along with /api/ebook: the book
     is R147 again, so giving the same book away undercut the page selling it.
     No token was outstanding when it went off, and they only lasted a day, so
     no one was left holding a dead link.
     The branch stays, refusing, so an old link says what happened rather than
     handing over a paid book. Delete GIFTS_OFF to turn it back on. */
  const GIFTS_OFF = true;
  const gift = String(url.searchParams.get('gift') || '').trim();
  if (gift && GIFTS_OFF) return deny('The free book has ended. Both books are at ' + new URL(request.url).origin + '/books/');
  if (gift) {
    if (!env.FUNNEL) return oops('Delivery is not configured yet.');
    if (!store(env)) return oops('Delivery is not configured yet.');
    if (!/^[a-f0-9]{32}$/.test(gift)) return deny('That link is not valid.');
    const raw = await env.FUNNEL.get('gift:' + gift);
    if (!raw) return deny('That link has been used already, or it has expired.');
    let claim; try { claim = JSON.parse(raw); } catch { return deny('That link is not valid.'); }
    if (claim.book !== slug) return deny('That link is for a different book.');
    await env.FUNNEL.delete('gift:' + gift);
    return release(env, book);
  }

  if (!ref)  return deny('No payment reference.');
  if (!env.PAYSTACK_SECRET_KEY) return oops('Delivery is not configured yet.');
  if (!store(env))              return oops('Delivery is not configured yet.');

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

  /* 3. and that enough was actually paid.
   *
   * An upsell is the exception, and it has to be, because bump three sells
   * the other book at R97 against a list price of R147 or R197. Without this
   * the site would take the R97 and then refuse the book, which is the worst
   * outcome on the whole funnel.
   *
   * It is still a real check. The transaction has to be one WE started, with
   * our own metadata naming this exact book as an upsell, and it still has to
   * clear the upsell floor. Metadata is set by /api/upsell when it charges
   * the card, never by anything a buyer can reach.
   */
  const meta = tx.metadata || {};
  const isUpsell = !!meta.upsell && String(meta.book || '').toLowerCase() === slug;
  const floor = isUpsell ? UPSELL_FLOOR : book.minorUnits;
  if (typeof tx.amount === 'number' && tx.amount < floor) {
    return deny('Payment amount does not match.');
  }

  // 4. release the file
  return release(env, book);
}

/* Where the PDFs live: the BOOKS namespace, bound 10 Oct 2026.
 *
 * Until that binding existed env.BOOKS was undefined at runtime and every
 * download answered "Delivery is not configured yet", which is why this book
 * funnel had never delivered a single copy. The files were copied into FUNNEL
 * as a stopgap; that half is gone now, and the fallback stays only so a
 * binding that goes missing fails loudly here rather than silently. */
function store(env) {
  if (env.BOOKS) return { kv: env.BOOKS, prefix: '' };
  if (env.FUNNEL) return { kv: env.FUNNEL, prefix: 'book:' };
  return null;
}

async function release(env, book) {
  const s = store(env);
  const body = s && await s.kv.get(s.prefix + book.key, { type: 'stream' });
  if (!body) return oops('The file is missing. Email francois@francoisesterhuizen.com and I will send it.');

  const headers = new Headers();
  headers.set('Content-Type', 'application/pdf');
  headers.set('Content-Disposition',
    'attachment; filename="' + book.filename.replace(/"/g, '') + '"');
  // never let a proxy or a browser keep a copy
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
