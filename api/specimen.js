// Making a specimen, in two steps so the name can be printed on the photo before it uploads.
//   POST /api/specimen            body {"parent": "<slug>"|null}  -> reserves a name (joins the parent's lineage)
//   PUT  /api/specimen?s=&t=      body: the finished, labeled JPEG -> attaches it and returns the link
// Only filtered photos made on joinspore.com/filter are sent here; the original never leaves the device.

import { SUPA_URL, SUPA_KEY, SLUG_RE, rpc, toBase64, json } from './_specimen.js';

export const config = { runtime: 'edge' };

const MAX = 2 * 1024 * 1024;

export default async function handler(req) {
  if (!SUPA_URL || !SUPA_KEY) return json({ error: 'Not configured.' }, 500);
  const url = new URL(req.url);

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const parent = typeof body.parent === 'string' && SLUG_RE.test(body.parent) ? body.parent : null;
    const res = await rpc('reserve_specimen', { p_parent: parent });
    if (!res.ok) {
      const text = await res.text();
      if (/not found/i.test(text)) return json({ error: 'That specimen does not exist.' }, 404);
      return json({ error: 'Could not name your specimen.' }, 502);
    }
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
