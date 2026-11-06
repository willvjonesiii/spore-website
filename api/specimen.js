// Specimens.
//   POST /api/specimen  {"sparkedBy": "<slug>"|null}  -> reserves a new holotype name (Make your own).
//                       {"pass": "<slug>"}            -> a new link for the same photo, one generation deeper (Pass it on).
//   PUT  /api/specimen?s=&t=   body: the finished, labeled JPEG -> attaches it to the reserved name.
// Only filtered photos made on joinspore.com/filter are sent here; the original never leaves the device.

import { SUPA_URL, SUPA_KEY, SLUG_RE, rpc, toBase64, json } from './_specimen.js';

export const config = { runtime: 'edge' };

const MAX = 2 * 1024 * 1024;

export default async function handler(req) {
  if (!SUPA_URL || !SUPA_KEY) return json({ error: 'Not configured.' }, 500);
  const url = new URL(req.url);

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (typeof body.pass === 'string') {
      if (!SLUG_RE.test(body.pass)) return json({ error: 'That specimen does not exist.' }, 404);
      const res = await rpc('pass_specimen', { p_parent: body.pass });
      if (!res.ok) {
        const text = await res.text();
        if (/not live/i.test(text)) return json({ error: 'This specimen has gone fully dormant.' }, 410);
        return json({ error: 'That specimen does not exist.' }, 404);
      }
      const sp = await res.json();
      return json({ ...sp, url: `${url.origin}/specimen/${sp.slug}` }, 201);
    }
    const sparked = typeof body.sparkedBy === 'string' && SLUG_RE.test(body.sparkedBy) ? body.sparkedBy : null;
    const res = await rpc('reserve_specimen', { p_sparked_by: sparked });
    if (!res.ok) return json({ error: 'Could not name your specimen.' }, 502);
    return json(await res.json(), 201);
  }

  if (req.method === 'PUT') {
    const slug = url.searchParams.get('s') || '';
    const token = url.searchParams.get('t') || '';
    if (!SLUG_RE.test(slug) || !/^[0-9a-f]{36}$/.test(token)) return json({ error: 'Bad request.' }, 400);
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.length < 2000) return json({ error: 'That image is empty.' }, 400);
    if (buf.length > MAX) return json({ error: 'That image is too large.' }, 413);
    if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return json({ error: 'Only JPEG images.' }, 415);
    const res = await rpc('attach_specimen_image', { p_slug: slug, p_token: token, p_b64: toBase64(buf) });
    if (!res.ok) return json({ error: 'Could not save your specimen.' }, 403);
    return json({ slug, url: `${url.origin}/specimen/${slug}` }, 200);
  }

  return json({ error: 'Use POST or PUT.' }, 405);
}
