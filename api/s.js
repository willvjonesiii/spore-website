// joinspore.com/s/<code>
// Messages, WhatsApp and friends fetch this to build the preview card, so it
// answers with the spore's own title, line and image, then hands the page to
// the web app exactly as the app's index.html would.

export const config = { runtime: 'edge' };

const APP = 'https://spore-app-umber.vercel.app';

async function peek(code) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/peek_handshake`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function what(counts) {
  if (!counts) return '';
  const parts = [];
  if (counts.photos) parts.push(`${counts.photos} ${counts.photos === 1 ? 'photo' : 'photos'}`);
  if (counts.audio) parts.push(`${counts.audio} ${counts.audio === 1 ? 'track' : 'tracks'}`);
  return parts.join(' and ');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export default async function handler(req) {
  const { searchParams, origin } = new URL(req.url);
  const code = (searchParams.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const [p, appRes] = await Promise.all([peek(code), fetch(`${APP}/index.html`)]);
  let html = await appRes.text();

  const open = p && p.status === 'open';
  const items = what(p?.counts);
  const title = p
    ? open
      ? `${p.host_name} is here with ${items || 'something'} for you`
      : `A spore from ${p.host_name}`
    : 'A spore for you';
  const description = open
    ? 'It only opens with the two of you together. Tap, say your name, and hold.'
    : 'Spore links live for ten minutes and open once, in person.';
  const pageUrl = `${origin}/s/${code}`;
  const image = `${origin}/og.png`;

  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="SPORE">`,
    `<meta property="og:url" content="${esc(pageUrl)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    `<meta name="theme-color" content="#071221">`,
  ].join('\n');

  // Replace the app's generic title and put the card tags right after <head>.
  html = html.replace(/<title>[^<]*<\/title>/i, '').replace(/<head>/i, `<head>\n${tags}`);

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
