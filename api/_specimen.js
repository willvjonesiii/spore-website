// Shared bits for specimens: joinspore.com/specimen/<genus>-<epithet>-<number>, e.g. nocta-stellaris-417.
// The database picks names and tracks lineage. Photos can only be fetched by exact slug while live;
// nothing can be listed or browsed.

export const SUPA_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPA_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const SLUG_RE = /^[a-z]+-[a-z]+-[0-9]{2,4}$/;

export async function rpc(name, args) {
  return fetch(`${SUPA_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
}

// Specimen details plus the anonymous shape of its lineage, or null.
export async function info(slug) {
  if (!SUPA_URL || !SUPA_KEY || !SLUG_RE.test(slug)) return null;
  try {
    const res = await rpc('specimen_info', { p_slug: slug });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');
export const speciesName = sp => `${cap(sp.genus)} ${sp.epithet}`;
export const genLabel = sp => (sp.generation > 1 ? `Gen ${sp.generation}` : 'Holotype');

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
});
