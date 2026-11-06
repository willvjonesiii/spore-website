// GET /api/specimen-image?s=<slug>
// Serves one specimen photo by its exact slug while its link is alive. Expired or unknown slugs get 404.

import { SUPA_URL, SLUG_RE, rpc, fromBase64 } from './_specimen.js';

export const config = { runtime: 'edge' };

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export default async function handler(req) {
  const slug = (new URL(req.url).searchParams.get('s') || '').toLowerCase();
  if (!SLUG_RE.test(slug) || !SUPA_URL) return notFound();
  const res = await rpc('dormant_image', { p_slug: slug });
  if (!res.ok) return notFound();
  const b64 = await res.json();
  if (!b64) return notFound();
  return new Response(fromBase64(b64), {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}
