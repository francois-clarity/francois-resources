/* Cloudflare Pages Function: GET /api/aikey?key=tree-of-clarity
 *
 * Serves the full text of a free AI key to its page's copy button.
 *
 * His word, 29 Oct 2026 (via Mark): no email address and no PDF. People open
 * the page, copy the whole key, paste it into whatever AI they use, and the
 * free session starts. The text lives here, outside the static site, so it
 * isn't a file anyone can forward or a page a search engine reads; the page
 * fetches it when it loads and the button puts it on the clipboard.
 *
 * Each key's text is a .txt next to this file (functions/api/keys/), the
 * pasted version of his .md: "paste" wherever the PDF said "slot" or "file".
 */

import treeOfClarity from './keys/tree-of-clarity.txt';

/* Each key this endpoint may hand out. Adding one is a deliberate act. */
const KEYS = {
  'tree-of-clarity': treeOfClarity,
};

export async function onRequestGet({ request }) {
  const name = new URL(request.url).searchParams.get('key') || '';
  const text = Object.prototype.hasOwnProperty.call(KEYS, name) ? KEYS[name] : null;
  if (!text) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
