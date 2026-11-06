// GET /api/specimen-info?s=<slug>
// What the filter page needs to continue a lineage: name, number, generation, and lineage size.
// Never returns the photo or any other specimen's slug.

import { SLUG_RE, info, json } from './_specimen.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const slug = (new URL(req.url).searchParams.get('s') || '').toLowerCase();
  if (!SLUG_RE.test(slug)) return json({ error: 'Not found.' }, 404);
  const sp = await info(slug);
  if (!sp) return json({ error: 'Not found.' }, 404);
  return json({
    slug: sp.slug, genus: sp.genus, epithet: sp.epithet, catalog: sp.catalog,
    generation: sp.generation, count: sp.count, max_gen: sp.max_gen, live: sp.live,
  });
}
