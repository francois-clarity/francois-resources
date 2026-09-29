/* GET /api/shot/:id
 *
 * Hands back a screenshot somebody pasted into the "Something not working?"
 * box. The id is 32 random hex characters and appears nowhere except the one
 * email that carries it, which is the same standing the result links on this
 * site already have: unguessable rather than access-controlled.
 *
 * These images can hold somebody's own answers, so they expire after thirty
 * days on their own and nothing lists them.
 */
export async function onRequestGet({ params, env }) {
  const id = String(params.id || '');
  if (!/^[0-9a-f]{32}$/.test(id) || !env.FUNNEL) return notFound();

  const { value, metadata } = await env.FUNNEL.getWithMetadata('shot:' + id, { type: 'arrayBuffer' });
  if (!value) return notFound();

  return new Response(value, {
    headers: {
      'Content-Type': (metadata && metadata.type) || 'image/png',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'",
    },
  });
}

function notFound() {
  return new Response('Not found. Screenshots are kept for thirty days.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
