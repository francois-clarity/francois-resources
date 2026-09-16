/* Host routing, added 16 Sep 2026.
 *
 * One Pages project serves two addresses. His words: the URLs should say
 * events.francoisesterhuizen.com, not resources.
 *
 *   events.francoisesterhuizen.com/         the events page (events/index.html)
 *   events.francoisesterhuizen.com/woema/   the WOEMA page
 *   events.francoisesterhuizen.com/api/*    the functions both pages post to
 *
 * Anything else asked of the events address goes to the same path on
 * resources, so a stray link still lands somewhere real. The old addresses
 * on resources (/events/ and /woema/) move permanently to the events address,
 * query string included, so a Paystack return or a shared link keeps working.
 *
 * On a *.pages.dev preview, ?as=events pretends to be the events address, so
 * the routing can be checked before a deploy reaches the real domain.
 */

const EVENTS = 'events.francoisesterhuizen.com';
const RESOURCES = 'resources.francoisesterhuizen.com';
const SHARED = /^\/(api\/|cdn-cgi\/|favicon|apple-touch-icon)/;

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  const path = url.pathname;
  const preview = url.hostname.endsWith('.pages.dev') && url.searchParams.get('as') === 'events';

  if (url.hostname === EVENTS || preview) {
    if (path === '/' || path === '/index.html') {
      return ctx.env.ASSETS.fetch(new Request(new URL('/events/', url).toString(), ctx.request));
    }
    if (path === '/events' || path.startsWith('/events/')) {
      return Response.redirect('https://' + EVENTS + '/' + url.search, 301);
    }
    if (path === '/woema') return Response.redirect('https://' + EVENTS + '/woema/' + url.search, 301);
    if (path.startsWith('/woema/') || SHARED.test(path)) return ctx.next();
    return Response.redirect('https://' + RESOURCES + path + url.search, 302);
  }

  if (url.hostname === RESOURCES) {
    if (path === '/woema' || path.startsWith('/woema/')) {
      const rest = path === '/woema' ? '/woema/' : path;
      return Response.redirect('https://' + EVENTS + rest + url.search, 301);
    }
    if (path === '/events' || path.startsWith('/events/')) {
      return Response.redirect('https://' + EVENTS + '/' + url.search, 301);
    }
  }

  return ctx.next();
}
