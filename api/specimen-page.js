// GET /specimen/<slug>  (rewritten to /api/specimen-page?s=<slug>)
// The page a specimen link opens: the photo, its specimen label, and how far it has traveled, drawn as mycelium.
// Messages, WhatsApp and friends read this page for the preview card, whose image is the photo itself.

import { SLUG_RE, info, cap, speciesName, genLabel, plural } from './_specimen.js';

export const config = { runtime: 'edge' };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Lineage tree as inline SVG: leaves spread left to right, parents centered over their children.
// Nodes are anonymous; only this specimen and the Source are marked.
function lineageSvg(nodes) {
  if (!nodes || !nodes.length) return '';
  const kids = new Map(), byN = new Map();
  for (const nd of nodes) { byN.set(nd.n, nd); if (!kids.has(nd.n)) kids.set(nd.n, []); }
  const roots = [];
  for (const nd of nodes) { if (nd.p && byN.has(nd.p)) kids.get(nd.p).push(nd.n); else roots.push(nd.n); }
  let leaf = 0;
  const x = new Map();
  const place = n => {
    const ch = kids.get(n);
    if (!ch.length) { x.set(n, leaf++); return; }
    ch.forEach(place);
    x.set(n, ch.reduce((a, c) => a + x.get(c), 0) / ch.length);
  };
  roots.forEach(place);
  const minG = Math.min(...nodes.map(n => n.g)), maxG = Math.max(...nodes.map(n => n.g));
  const W = 340, rowH = 58, padX = 28, top = 26;
  const H = top * 2 + (maxG - minG) * rowH;
  const span = Math.max(1, leaf - 1);
  const px = n => (leaf <= 1 ? W / 2 : padX + (x.get(n) / span) * (W - padX * 2));
  const py = n => top + (byN.get(n).g - minG) * rowH;
  let edges = '', dots = '', marks = '';
  for (const nd of nodes) {
    if (nd.p && byN.has(nd.p)) {
      const x1 = px(nd.p), y1 = py(nd.p), x2 = px(nd.n), y2 = py(nd.n), my = (y1 + y2) / 2;
      edges += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} C${x1.toFixed(1)} ${my.toFixed(1)}, ${x2.toFixed(1)} ${my.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
    }
  }
  for (const nd of nodes) {
    const cx = px(nd.n).toFixed(1), cy = py(nd.n).toFixed(1);
    if (nd.me) {
      dots += `<circle cx="${cx}" cy="${cy}" r="11" class="ring"/><circle cx="${cx}" cy="${cy}" r="6.5" class="me"/>`;
      // Beside the dot, so it never sits on a thread.
      const right = +cx < W - 120;
      marks += `<text x="${(+cx + (right ? 18 : -18)).toFixed(1)}" y="${(+cy + 4).toFixed(1)}" class="lbl" style="text-anchor:${right ? 'start' : 'end'}">this specimen</text>`;
    } else {
      dots += `<circle cx="${cx}" cy="${cy}" r="${nd.g === minG ? 5.5 : 4}" class="dot"/>`;
    }
    if (nd.g === minG && !nd.p) marks += `<text x="${cx}" y="${(+cy - 13).toFixed(1)}" class="lbl src">Source</text>`;
  }
  return `<svg class="tree" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lineage tree">
  <defs><filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g class="edges" filter="url(#glow)">${edges}</g>
  <g filter="url(#glow)">${dots}</g>${marks}</svg>`;
}

export default async function handler(req) {
  const { searchParams, origin } = new URL(req.url);
  const slug = (searchParams.get('s') || '').toLowerCase();
  const sp = SLUG_RE.test(slug) ? await info(slug) : null;

  let title, description, image, pageUrl, body, script = '';
  if (sp) {
    const name = speciesName(sp);
    const gl = genLabel(sp);
    const collected = new Date(sp.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const away = sp.generation - 1;
    const passes = Math.max(0, sp.count - 1);
    const depth = Math.max(0, (sp.max_gen || 1) - 1);
    title = `Specimen No. ${sp.catalog}. Handle in person.`;
    description = `${name} · ${gl}. Some things only unlock in person.`;
    pageUrl = `${origin}/specimen/${sp.slug}`;
    image = sp.live ? `${origin}/api/specimen-image?s=${sp.slug}` : `${origin}/og-filter.png`;
    const make = `/filter?sparked=${esc(sp.slug)}`;
    const journeyStats = passes
      ? `Passed on ${plural(passes, 'time', 'times')} · ${plural(depth, 'SPORE', 'SPORES')} deep`
      : 'Not passed on yet.';
    const meLine = sp.generation > 1
      ? `This link is Gen ${sp.generation}, ${plural(away, 'SPORE', 'SPORES')} from its Source.`
      : 'This is the original. Every time it\'s passed on, its journey grows here.';
    body = `
      <p class="intro">Someone made this with SPORE. You can make your own from any photo.</p>
      ${sp.live ? `<img class="photo" src="${esc(image)}" alt="Specimen ${esc(sp.catalog)}, ${esc(name)}">` : ''}
      <a class="btn btn-primary" href="${make}">Make your own specimen</a>
      <p class="hint">Upload any photo. It goes dormant, gets its own Latin name, and only unlocks in person.</p>
      <section class="label" aria-label="Specimen label">
        <div class="label-top"><span>SPORE Specimen Archive</span><span class="stamp ${sp.live ? '' : 'out'}">${sp.live ? 'Dormant' : 'Fully dormant'}</span></div>
        <div class="no">Specimen No. ${esc(sp.catalog)}</div>
        <div class="species"><em>${esc(name)}</em></div>
        <dl>
          <div><dt>Generation</dt><dd>${esc(gl)}</dd></div>
          <div><dt>Collected</dt><dd>${esc(collected)}</dd></div>
          <div><dt>Unlocks</dt><dd>In person only</dd></div>
        </dl>
        <p class="warn">You can't open this alone. Meet the SPORE who made it.</p>
      </section>
      <section class="journey">
        <h2>How far it has <em>traveled</em></h2>
        <p class="stats">${journeyStats}${sp.sparked ? ` · sparked ${plural(sp.sparked, 'new specimen', 'new specimens')}` : ''}</p>
        ${sp.count > 1 ? lineageSvg(sp.nodes) : ''}
        <p class="away">${meLine}</p>
        ${sp.live ? `
        <button type="button" class="btn btn-ghost" id="pass">Pass this one on</button>
        <p class="hint">Get your own link to this photo and send it to your people. Its journey grows each time.</p>
        <div class="passed" id="passed" hidden>
          <input id="pass-url" readonly aria-label="Your link to pass on">
          <div class="pass-btns">
            <button type="button" id="pass-share">Share</button>
            <a id="pass-sms" href="#">Messages</a>
            <a id="pass-wa" href="#" target="_blank" rel="noopener">WhatsApp</a>
            <button type="button" id="pass-copy">Copy</button>
          </div>
        </div>
        <p class="pass-note" id="pass-note"></p>` : `<p class="hint">This photo has gone fully dormant, so it can't be passed on anymore.</p>`}
      </section>
      <p class="close">Online, a specimen spreads by link. In SPORE, it spreads only in person.</p>
      <p class="fine"><a href="/filter#beta">Get beta access</a> · Specimen links stay live for 30 days.</p>`;
    if (sp.live) script = `<script>
(() => {
  const $ = id => document.getElementById(id), enc = encodeURIComponent;
  const SLUG = ${JSON.stringify(sp.slug)}, CAT = ${JSON.stringify(sp.catalog)};
  let url = null;
  $('pass').addEventListener('click', async () => {
    const btn = $('pass'), note = $('pass-note');
    btn.disabled = true; btn.textContent = 'Getting your link…'; note.textContent = '';
    try {
      const r = await fetch('/api/specimen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: SLUG }) });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || 'failed');
      url = d.url.replace('://www.', '://');
      const line = 'Specimen No. ' + CAT + '. Handle in person.';
      $('pass-url').value = url.replace(/^https?:\\/\\//, '');
      $('pass-sms').href = 'sms:?&body=' + enc(line + ' ' + url);
      $('pass-wa').href = 'https://wa.me/?text=' + enc(line + ' ' + url);
      if (!navigator.share) $('pass-share').style.display = 'none';
      $('pass-share').onclick = () => navigator.share({ title: line, text: line, url }).catch(() => {});
      btn.hidden = true; $('passed').hidden = false;
      note.textContent = 'Your link is Gen ' + d.generation + '. Send it on.';
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Pass this one on';
      note.textContent = 'That did not go through. Try again.';
    }
  });
  $('pass-url').addEventListener('focus', e => e.target.select());
  $('pass-copy').addEventListener('click', async e => {
    try { await navigator.clipboard.writeText(url); } catch { $('pass-url').select(); document.execCommand('copy'); }
    e.currentTarget.textContent = 'Copied'; setTimeout(() => { $('pass-copy').textContent = 'Copy'; }, 1600);
  });
})();
</script>`;
  } else {
    title = 'Some things only unlock in person.';
    description = 'Make any photo go dormant. The full picture is for the people who show up.';
    pageUrl = `${origin}/filter`;
    image = `${origin}/og-filter.png`;
    body = `
      <h1>This specimen is <em>not in the archive.</em></h1>
      <p class="sub">It may have been mistyped. Check the name and number on the photo, or make your own specimen.</p>
      <div class="actions">
        <a class="btn btn-primary" href="/filter">Make it dormant</a>
        <a class="btn btn-ghost" href="/filter#beta">Get beta access</a>
      </div>`;
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" type="image/svg+xml" href="/logo.svg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SPORE">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
${image.endsWith('.png') ? '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' : '<meta property="og:image:type" content="image/jpeg">'}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta name="theme-color" content="#081525">
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&family=Playfair+Display:ital,wght@1,600&display=swap" rel="stylesheet">
<style>
  :root { --navy:#081525; --navy2:#0d1e30; --teal:#3ECFCF; --cream:#FAFAF7; --mid:#8EA8C3; --line:rgba(62,207,207,0.25); }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--navy); color: var(--cream); font-family: Inter, system-ui, sans-serif; line-height: 1.6; min-height: 100vh;
         background-image: radial-gradient(ellipse at 50% -10%, rgba(62,207,207,0.12), transparent 60%); }
  .wrap { max-width: 520px; margin: 0 auto; padding: 0 20px 44px; text-align: center; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 18px 0 8px; text-align: left; }
  .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--cream);
           font-family: 'Space Grotesk', sans-serif; font-weight: 700; letter-spacing: 0.12em; font-size: 16px; }
  .brand img { width: 34px; height: 34px; }
  .brand b { color: var(--teal); }
  .header-link { font-size: 14px; color: var(--mid); text-decoration: none; }
  .photo { display: block; width: 100%; max-height: 70vh; object-fit: contain; margin: 14px auto 22px; border-radius: 6px; box-shadow: 0 24px 60px rgba(0,0,0,0.5); }
  .label { text-align: left; background: linear-gradient(180deg, rgba(13,30,48,0.95), rgba(8,21,37,0.95)); border: 1px solid var(--line);
           border-radius: 14px; padding: 18px 20px; font-family: 'Space Grotesk', sans-serif; margin: 18px 0 30px; }
  .label-top { display: flex; justify-content: space-between; align-items: center; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--mid); margin-bottom: 12px; }
  .stamp { color: var(--teal); border: 1.5px solid var(--teal); border-radius: 6px; padding: 2px 8px; font-weight: 700; transform: rotate(-3deg); }
  .stamp.out { color: var(--mid); border-color: var(--mid); }
  .no { font-weight: 700; font-size: 13px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--teal); }
  .species { font-family: 'Playfair Display', serif; font-size: 34px; line-height: 1.15; margin: 4px 0 14px; }
  .label dl { display: grid; gap: 6px; border-top: 1px solid var(--line); padding-top: 12px; }
  .label dl div { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
  .label dt { color: var(--mid); text-transform: uppercase; letter-spacing: 0.12em; font-size: 12px; }
  .label dd { font-weight: 600; text-align: right; }
  .warn { margin-top: 14px; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--cream); opacity: 0.85; border-top: 1px dashed var(--line); padding-top: 12px; }
  h1, h2 { font-family: 'Space Grotesk', sans-serif; font-weight: 700; line-height: 1.12; }
  h1 { font-size: clamp(30px, 7.5vw, 42px); margin: 26px 0 12px; }
  h2 { font-size: 26px; margin-bottom: 4px; }
  h1 em, h2 em { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 600; color: var(--teal); }
  .sub { color: rgba(250,250,247,0.74); font-size: 17px; margin: 0 auto 24px; max-width: 420px; }
  .stats { color: var(--mid); font-size: 14px; margin-bottom: 8px; }
  .tree { width: 100%; height: auto; max-height: 420px; margin: 4px 0 6px; }
  .tree .edges path { fill: none; stroke: #3ECFCF; stroke-width: 2; stroke-opacity: 0.75; }
  .tree .dot { fill: #8FE3DF; }
  .tree .me { fill: #FAFAF7; }
  .tree .ring { fill: none; stroke: #3ECFCF; stroke-width: 2; }
  .tree .lbl { fill: var(--mid); font: 600 11px 'Space Grotesk', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; text-anchor: middle; }
  .tree .lbl.src { fill: var(--teal); }
  .away { font-size: 15px; color: rgba(250,250,247,0.8); margin-bottom: 26px; }
  .actions { display: grid; gap: 10px; }
  .btn { display: flex; align-items: center; justify-content: center; font: 600 16px Inter, system-ui, sans-serif; border-radius: 100px; padding: 15px 24px; text-decoration: none; border: 1px solid transparent; }
  .btn-primary { background: var(--teal); color: var(--navy); }
  .btn-ghost { color: var(--cream); border-color: rgba(62,207,207,0.45); }
  .close { margin-top: 26px; font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 16px; }
  .fine { font-size: 13px; color: var(--mid); margin-top: 10px; }
  .fine a { color: var(--teal); }
  .intro { font-size: 15px; color: rgba(250,250,247,0.82); margin: 10px auto 4px; max-width: 400px; }
  .hint { font-size: 13px; color: var(--mid); margin: 10px auto 0; max-width: 400px; }
  .wrap > .btn-primary { margin-top: 2px; }
  .journey { margin-top: 6px; }
  .journey .btn { width: 100%; margin-top: 4px; }
  .passed { margin-top: 12px; }
  .passed input { width: 100%; font: 600 15px 'Space Grotesk', Inter, sans-serif; color: var(--teal); text-align: center; background: rgba(62,207,207,0.08);
                  border: 1px solid rgba(62,207,207,0.45); border-radius: 12px; padding: 12px; outline: none; margin-bottom: 8px; }
  .pass-btns { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .pass-btns a, .pass-btns button { display: flex; align-items: center; justify-content: center; font: 600 13px Inter, system-ui, sans-serif; color: var(--cream);
                  text-decoration: none; background: rgba(255,255,255,0.04); border: 1px solid rgba(62,207,207,0.3); border-radius: 12px; padding: 11px 4px; cursor: pointer; }
  .pass-note { font-size: 13px; color: var(--mid); min-height: 18px; margin-top: 8px; }
  .btn:disabled { opacity: .6; }
  button.btn { cursor: pointer; background-color: transparent; width: 100%; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <a class="brand" href="/"><img src="/spore-logo-simple.png" alt=""><span>SP<b>O</b>RE</span></a>
    <a class="header-link" href="/filter">Make yours</a>
  </header>
  ${body}
</div>
${script}
</body>
</html>`;

  return new Response(html, {
    status: sp ? 200 : 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': sp ? 'public, max-age=120' : 'no-store' },
  });
}
