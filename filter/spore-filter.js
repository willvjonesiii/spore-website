// SPORE filter engine.
// Turns a photo into a spore: frosted-glass blur where only the eyes come through, teal mycelium grown
// by space colonization, drifting spores, and the SPORE glass band with logo and tagline at the bottom.
// Everything runs in the browser. The photo never leaves the device.
//
// Usage:
//   SporeFilter.render(canvas, image, { faces, murk, tagline })
//   faces: [{ x, y, r, eyes: [{x,y},{x,y}] | null }] in image pixels
//   murk: 0..1 (1 = the frosted-glass level Will chose), tagline: 0 or 1
(function () {
  const TAGLINES = ['YOU SPREAD THE CONTENT, NOT AN ALGORITHM', 'PRESENCE IS THE KEY TO UNLOCK'];
  const LOGO_SRC = '/logo.png';

  let cv, ctx, W = 0, H = 0, img = null, faces = [], source = { x: 0, y: 0 };
  let murk = 1, tagIdx = 0;

  function rng(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function sprite(size, stops) {
    const s = document.createElement('canvas'); s.width = s.height = size;
    const g = s.getContext('2d'); const h = size / 2;
    const grd = g.createRadialGradient(h, h, 0, h, h, h);
    for (const [k, c] of stops) grd.addColorStop(k, c);
    g.fillStyle = grd; g.beginPath(); g.arc(h, h, h, 0, Math.PI * 2); g.fill();
    return s;
  }
  const SPORE = sprite(64, [[0, 'rgba(246,244,236,1)'], [0.3, 'rgba(236,238,226,0.9)'], [0.55, 'rgba(200,214,200,0.35)'], [1, 'rgba(180,200,190,0)']]);
  const GLOW = sprite(64, [[0, 'rgba(214,236,224,1)'], [1, 'rgba(120,180,170,0)']]);
  const PUFF = sprite(256, [[0, 'rgba(135,160,160,0.5)'], [0.5, 'rgba(112,138,140,0.22)'], [1, 'rgba(96,118,122,0)']]);

  const LOGO = new Image();
  const logoReady = new Promise(res => { LOGO.onload = res; LOGO.onerror = res; });
  LOGO.src = LOGO_SRC;

  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const eyesOf = f => f.eyes || [{ x: f.x - f.r * 0.3, y: f.y - f.r * 0.12 }, { x: f.x + f.r * 0.3, y: f.y - f.r * 0.12 }];

  // ---------- bottom band layout ----------
  const tagFont = px => `700 ${px.toFixed(1)}px 'Space Grotesk', Inter, sans-serif`;
  function bottomLayout() {
    const m = Math.min(W, H);
    const tag = TAGLINES[tagIdx];
    const ref = 100;
    ctx.save();
    ctx.font = tagFont(ref);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${ref * 0.06}px`;
    const wRef = ctx.measureText(tag).width;
    ctx.restore();
    const tfs = Math.min(m * 0.085, ref * (W * 0.86) / wRef);
    const tagY = H - m * 0.06;
    const lw = m * 0.2, lh = lw;
    const ly = tagY - tfs * 0.74 - m * 0.03 - lh * 0.92;
    return { m, tag, tfs, tagY, lw, lh, lx: (W - lw) / 2, ly, bandTop: ly + lh * 0.08 - m * 0.03 };
  }

  // ---------- photo layers ----------
  let deepBlur, faceBlur, avgColor, grain, fogTex, focus, tint;

  function prepPhoto() {
    const k0 = W / 1125;
    const one = document.createElement('canvas'); one.width = one.height = 1;
    const o = one.getContext('2d'); o.drawImage(img, 0, 0, 1, 1);
    const [r0, g0, b0] = o.getImageData(0, 0, 1, 1).data;
    const rawAvg = `rgb(${r0},${g0},${b0})`;
    avgColor = `rgb(${(r0 * 0.6 + 60) | 0},${(g0 * 0.6 + 90) | 0},${(b0 * 0.6 + 96) | 0})`;
    // Deep blur: shrink, blur, scale back up. A solid base under every blur so edges never go see-through.
    const sm = document.createElement('canvas'); sm.width = Math.max(8, Math.round(W / 6)); sm.height = Math.max(8, Math.round(H / 6));
    const sg = sm.getContext('2d');
    sg.fillStyle = rawAvg; sg.fillRect(0, 0, sm.width, sm.height);
    sg.filter = `blur(${Math.round(26 * k0)}px) saturate(0.55)`;
    sg.drawImage(img, 0, 0, sm.width, sm.height);
    deepBlur = mk(); const dg = deepBlur.getContext('2d'); dg.imageSmoothingQuality = 'high';
    dg.fillStyle = rawAvg; dg.fillRect(0, 0, W, H);
    dg.filter = `blur(${Math.round(20 * k0)}px)`; dg.drawImage(sm, 0, 0, W, H);
    faceBlur = mk(); const fb = faceBlur.getContext('2d');
    fb.drawImage(img, 0, 0, W, H);
    fb.filter = `blur(${Math.round(14 * k0)}px) saturate(0.8)`; fb.drawImage(img, 0, 0, W, H);

    grain = document.createElement('canvas'); grain.width = grain.height = 256;
    const g = grain.getContext('2d'); const id = g.createImageData(256, 256); const r = rng(99);
    for (let i = 0; i < id.data.length; i += 4) { const v = 110 + r() * 90 | 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    g.putImageData(id, 0, 0);

    fogTex = document.createElement('canvas'); fogTex.width = W * 2; fogTex.height = H;
    const f = fogTex.getContext('2d'); const fr = rng(3);
    for (let i = 0; i < 140; i++) {
      const s = (420 + fr() * 760) * k0;
      f.globalAlpha = 0.35 + fr() * 0.4;
      f.drawImage(PUFF, fr() * fogTex.width - s / 2, fr() * H - s / 2, s, s);
    }
  }

  // Face and eye layers depend on where the faces are.
  function prepFaces() {
    const k0 = W / 1125;
    const face = mk(); const fg = face.getContext('2d');
    fg.drawImage(faceBlur, 0, 0);
    const fm = mk(); const fmg = fm.getContext('2d');
    for (const f of faces) {
      const gr = fmg.createRadialGradient(f.x, f.y, f.r * 0.2, f.x, f.y, f.r * 1.05);
      gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      fmg.fillStyle = gr; fmg.fillRect(0, 0, W, H);
    }
    fg.globalCompositeOperation = 'destination-in'; fg.drawImage(fm, 0, 0);

    // Gaussian falloff pulled to exactly zero at the rim: a gradient repeats its last stop across the
    // whole canvas, so anything above zero there would leak the sharp photo everywhere.
    const e1 = Math.exp(-4.5);
    const gauss = (g, x, y, rad, peak) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      for (let i = 0; i <= 10; i++) { const t = i / 10; gr.addColorStop(t, `rgba(0,0,0,${peak * Math.max(0, (Math.exp(-4.5 * t * t) - e1) / (1 - e1))})`); }
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    };
    const masked = (src, scale, peak) => {
      const tmp = mk(); const tg = tmp.getContext('2d');
      for (const f of faces) for (const e of eyesOf(f)) gauss(tg, e.x, e.y, f.r * scale, peak);
      const m = mk(); const mg = m.getContext('2d');
      mg.filter = `blur(${Math.round(18 * k0)}px)`; mg.drawImage(tmp, 0, 0);
      const out = mk(); const og = out.getContext('2d');
      og.drawImage(src, 0, 0, W, H);
      og.globalCompositeOperation = 'destination-in'; og.drawImage(m, 0, 0);
      return out;
    };
    const light = mk(); const lg = light.getContext('2d');
    lg.drawImage(img, 0, 0, W, H);
    lg.filter = `blur(${Math.round(9 * k0)}px)`; lg.drawImage(img, 0, 0, W, H);
    focus = { face, near: masked(light, 0.55, 0.7), eye: masked(img, 0.42, 1) };

    tint = mk(); const tg = tint.getContext('2d');
    tg.fillStyle = '#2BA9AD'; tg.fillRect(0, 0, W, H);
    tg.globalCompositeOperation = 'destination-out';
    for (const f of faces) for (const e of eyesOf(f)) {
      const win = tg.createRadialGradient(e.x, e.y, 0, e.x, e.y, f.r * 0.45);
      win.addColorStop(0, 'rgba(0,0,0,0.85)'); win.addColorStop(1, 'rgba(0,0,0,0)');
      tg.fillStyle = win; tg.fillRect(0, 0, W, H);
    }
  }

  // ---------- mycelium: space colonization ----------
  // Food points are scattered over the frame, dense at the edges and none on faces. Each food point pulls
  // the nearest branch tip; tips grow toward their food and eat it. Thickness follows the pipe model, so
  // trunks thicken on their own and taper into fine veins.
  function growColonization(seed, scaleW, rootCount, foodCount) {
    const r = rng(seed);
    const k = W / 1125;
    const STEP = 5 * k, REACH = 70 * k, EAT = 10 * k;
    const faceFade = (x, y) => {
      let f = 1;
      for (const fc of faces) {
        const d = Math.hypot(x - fc.x, y - fc.y) / fc.r;
        if (d < 1) return 0;
        if (d < 1.8) f = Math.min(f, (d - 1) / 0.8);
      }
      return f;
    };
    const edgeReach = 0.5 * Math.min(W, H);
    const fx = [], fy = [];
    let tries = 0;
    const target = Math.round(foodCount * (W * H) / (1125 * 2000));
    while (fx.length < target && tries++ < target * 40) {
      const x = r() * W, y = r() * H;
      const e = Math.min(x, y, W - x, H - y);
      const p = 0.04 + 0.96 * Math.pow(Math.max(0, 1 - e / edgeReach), 1.3);
      if (r() > p) continue;
      if (faceFade(x, y) < 0.15) continue;
      fx.push(x); fy.push(y);
    }
    const alive = new Uint8Array(fx.length).fill(1);
    const nx = [], ny = [], par = [];
    const grid = new Map();
    const cellOf = (x, y) => `${Math.floor(x / REACH)},${Math.floor(y / REACH)}`;
    const addNode = (x, y, p) => {
      const i = nx.length; nx.push(x); ny.push(y); par.push(p);
      const c = cellOf(x, y); let b = grid.get(c); if (!b) grid.set(c, b = []); b.push(i);
    };
    const per = 2 * (W + H);
    for (let t = 0; t < rootCount; t++) {
      let u = ((t + 0.2 + r() * 0.6) / rootCount) * per, x, y;
      if (u < W) { x = u; y = 1; } else if ((u -= W) < H) { x = W - 1; y = u; }
      else if ((u -= H) < W) { x = W - u; y = H - 1; } else { u -= W; x = 1; y = H - u; }
      addNode(x, y, -1);
    }
    for (let iter = 0; iter < 700; iter++) {
      const pull = new Map();
      for (let a = 0; a < fx.length; a++) {
        if (!alive[a]) continue;
        const cx = Math.floor(fx[a] / REACH), cy = Math.floor(fy[a] / REACH);
        let best = -1, bd = REACH;
        for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const b = grid.get(`${gx},${gy}`); if (!b) continue;
          for (const i of b) { const d = Math.hypot(fx[a] - nx[i], fy[a] - ny[i]); if (d < bd) { bd = d; best = i; } }
        }
        if (best < 0) continue;
        if (bd < EAT) { alive[a] = 0; continue; }
        let v = pull.get(best); if (!v) pull.set(best, v = [0, 0]);
        v[0] += (fx[a] - nx[best]) / bd; v[1] += (fy[a] - ny[best]) / bd;
      }
      if (!pull.size) break;
      for (const [i, v] of pull) {
        const vl = Math.hypot(v[0], v[1]) || 1;
        let hx = 0, hy = 0; const pp = par[i];
        if (pp >= 0) { const dl = Math.hypot(nx[i] - nx[pp], ny[i] - ny[pp]) || 1; hx = (nx[i] - nx[pp]) / dl; hy = (ny[i] - ny[pp]) / dl; }
        const jx = v[0] / vl + hx * 1.6 + (r() - 0.5) * 0.25, jy = v[1] / vl + hy * 1.6 + (r() - 0.5) * 0.25;
        const len = Math.hypot(jx, jy); if (len < 1e-3) continue;
        const x = nx[i] + jx / len * STEP, y = ny[i] + jy / len * STEP;
        if (faceFade(x, y) <= 0) continue;
        addNode(x, y, i);
      }
    }
    const N = nx.length;
    const flow = new Float32Array(N).fill(1);
    const kids = new Uint16Array(N);
    for (let i = N - 1; i >= 0; i--) if (par[i] >= 0) { flow[par[i]] += flow[i]; kids[par[i]]++; }
    const segs = [], beads = [];
    for (let i = 0; i < N; i++) {
      const p = par[i]; if (p < 0) continue;
      const w = Math.min(6.5 * k, (0.45 + 0.32 * Math.pow(flow[i], 0.45)) * k) * scaleW;
      const d = w > 4.4 * k ? 0 : w > 3.4 * k ? 1 : w > 2.6 * k ? 2 : w > 1.9 * k ? 3 : w > 1.4 * k ? 4 : w > 1.05 * k ? 5 : w > 0.8 * k ? 6 : 7;
      const f = Math.min(faceFade(nx[i], ny[i]), faceFade(nx[p], ny[p]));
      if (f <= 0) continue;
      segs.push({ x1: nx[p], y1: ny[p], x2: nx[i], y2: ny[i], w, d, f });
      if (!kids[i] && r() < 0.035) beads.push({ x: nx[i], y: ny[i], s: (1.8 + r() * 2.6) * k, f });
      else if (d <= 2 && r() < 0.006) beads.push({ x: nx[i], y: ny[i], s: (2.4 + r() * 3) * k, f });
    }
    // Fine fuzz off the thin ends.
    const tw = 0.5 * k * scaleW;
    for (let i = 0; i < N; i++) {
      if (par[i] < 0 || flow[i] >= 4 || r() > (kids[i] ? 0.12 : 0.9)) continue;
      if (faceFade(nx[i], ny[i]) <= 0.1) continue;
      const pp = par[i];
      const a = Math.atan2(ny[i] - ny[pp], nx[i] - nx[pp]);
      const n = 1 + ((r() * 3) | 0);
      for (let t = 0; t < n; t++) {
        let x = nx[i], y = ny[i], ang = a + (r() - 0.5) * 2.2, av = 0;
        const steps = 3 + ((r() * 6) | 0);
        for (let q = 0; q < steps; q++) {
          av += (r() - 0.5) * 0.5; av *= 0.8; ang += av;
          const x2 = x + Math.cos(ang) * 2.6 * k, y2 = y + Math.sin(ang) * 2.6 * k;
          const f = faceFade(x2, y2); if (f <= 0) break;
          segs.push({ x1: x, y1: y, x2, y2, w: tw, d: 7, f: f * 0.8 });
          x = x2; y = y2;
        }
      }
    }
    return { segs, beads };
  }

  const HYPHA_COLORS = ['#4FE3DF', '#42D8D5', '#38CACA', '#32BCBF', '#2DAEB4', '#2AA0AA', '#27939F', '#248694'];
  const HYPHA_ALPHA = [0.95, 0.85, 0.72, 0.58, 0.46, 0.38, 0.32, 0.28];
  function paintNetwork(target, net, dim) {
    const g = target.getContext('2d');
    g.lineCap = 'round'; g.lineJoin = 'round';
    const buckets = new Map();
    for (const sg of net.segs) {
      const key = `${sg.d}|${Math.round(sg.w * 2)}|${Math.round(sg.f * 4)}`;
      let b = buckets.get(key); if (!b) buckets.set(key, b = []);
      b.push(sg);
    }
    for (const [key, list] of buckets) {
      const [d, w2, f4] = key.split('|').map(Number);
      g.strokeStyle = HYPHA_COLORS[d];
      g.globalAlpha = HYPHA_ALPHA[d] * (f4 / 4) * dim;
      g.lineWidth = Math.max(0.5, w2 / 2);
      g.beginPath();
      for (const sg of list) { g.moveTo(sg.x1, sg.y1); g.lineTo(sg.x2, sg.y2); }
      g.stroke();
    }
    g.strokeStyle = '#F2FFFC';
    for (const [key, list] of buckets) {
      const [d, w2, f4] = key.split('|').map(Number);
      if (d > 0 || w2 < 6) continue;
      g.globalAlpha = 0.3 * (f4 / 4) * dim;
      g.lineWidth = w2 / 2 * 0.25;
      g.beginPath();
      for (const sg of list) { g.moveTo(sg.x1, sg.y1); g.lineTo(sg.x2, sg.y2); }
      g.stroke();
    }
    for (const b of net.beads) {
      g.globalAlpha = 0.8 * b.f * dim;
      g.drawImage(GLOW, b.x - b.s * 3, b.y - b.s * 3, b.s * 6, b.s * 6);
      g.globalAlpha = 0.95 * b.f * dim;
      g.fillStyle = '#E8FFF2';
      g.beginPath(); g.arc(b.x, b.y, b.s, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
  const blurCopy = (src, px) => { const c = mk(); const g = c.getContext('2d'); g.filter = `blur(${px}px)`; g.drawImage(src, 0, 0); return c; };

  let myc;
  function prepMycelium() {
    const k = W / 1125;
    const farRaw = mk();
    paintNetwork(farRaw, growColonization(31, 0.6, 26, 3800), 0.55);
    const sharp = mk();
    paintNetwork(sharp, growColonization(11, 1, 18, 2600), 1);
    myc = { far: blurCopy(farRaw, Math.round(3.5 * k)), sharp, glowA: blurCopy(sharp, Math.round(5 * k)), glowB: blurCopy(sharp, Math.round(18 * k)) };
  }

  let ambient = [], plume = [];
  function prepSpores() {
    ambient = []; plume = [];
    const r = rng(21);
    const count = Math.round(173 * (W * H) / (1125 * 2000));
    for (let i = 0; i < count; i++) ambient.push({ x: r() * W, y: r() * H, z: 0.3 + r() * 0.7, p: r(), w: r() * 6.28, dir: r() < 0.5 ? -1 : 1 });
    for (let i = 0; i < 80; i++) plume.push({ a: -Math.PI * (0.3 + r() * 0.8), speed: 0.5 + r() * 0.6, phase: r(), wob: r() * 6.28, size: 0.6 + r() * 0.9 });
  }

  // ---------- draw ----------
  const LOOP = 8, STILL_T = 4.6;
  const depth = () => 0.65 + 0.35 * murk;
  function draw(t) {
    const k = W / 1125;
    const lt = t % LOOP, ph = lt / LOOP * Math.PI * 2;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none';

    // Focus: deep blur, lighter blur blended back by murk, flatten, faces, eyes.
    ctx.drawImage(deepBlur, 0, 0);
    ctx.globalAlpha = Math.pow(1 - depth(), 0.8); ctx.drawImage(faceBlur, 0, 0);
    ctx.globalAlpha = 0.25 * depth(); ctx.fillStyle = avgColor; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.drawImage(focus.face, 0, 0); ctx.drawImage(focus.near, 0, 0); ctx.drawImage(focus.eye, 0, 0);

    // Grade.
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.4; ctx.fillStyle = '#A0C2C1'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.4; ctx.fillStyle = '#1C6E73'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = 0.16; ctx.drawImage(tint, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const vig = ctx.createRadialGradient(W * 0.5, H * 0.45, H * 0.2, W * 0.5, H * 0.5, H * 0.78);
    vig.addColorStop(0, 'rgba(7,18,33,0)'); vig.addColorStop(1, 'rgba(7,18,33,0.55)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

    // Fog.
    ctx.globalAlpha = 0.125;
    const sx1 = (lt / LOOP) * W; ctx.drawImage(fogTex, -sx1, 0); ctx.drawImage(fogTex, fogTex.width - sx1, 0);
    ctx.globalAlpha = 0.1;
    const sx2 = W - (lt / LOOP) * W, up = 140 * k;
    ctx.drawImage(fogTex, -sx2, -up, fogTex.width, H + up); ctx.drawImage(fogTex, fogTex.width - sx2, -up, fogTex.width, H + up);
    ctx.globalAlpha = 0.125;
    const low = ctx.createLinearGradient(0, H * 0.45, 0, H);
    low.addColorStop(0, 'rgba(95,135,138,0)'); low.addColorStop(1, 'rgba(95,135,138,0.6)');
    ctx.fillStyle = low; ctx.fillRect(0, 0, W, H);

    // Eyes cut back through the haze.
    ctx.globalAlpha = 0.25; ctx.drawImage(focus.near, 0, 0);
    ctx.globalAlpha = 0.5; ctx.drawImage(focus.eye, 0, 0);

    // Mycelium.
    const breathe = 0.9 + 0.1 * Math.sin(ph);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.55 * breathe; ctx.drawImage(myc.far, 0, 0);
    ctx.globalAlpha = 0.6 * breathe; ctx.drawImage(myc.glowB, 0, 0);
    ctx.globalAlpha = 0.85 * breathe; ctx.drawImage(myc.glowA, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.95 * breathe; ctx.drawImage(myc.sharp, 0, 0);

    // Spores.
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.35;
    const sg = ctx.createRadialGradient(source.x, source.y, 0, source.x, source.y, 260 * k);
    sg.addColorStop(0, 'rgba(214,236,224,0.6)'); sg.addColorStop(1, 'rgba(214,236,224,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    for (const p of ambient) {
      const kk = (lt / LOOP * 0.6 * p.z + p.p) % 1;
      const y = (p.y - kk * 420 * k * p.z + H * 2) % H;
      const x = (p.x + Math.sin(ph * 0.5 + p.w) * 26 * k * p.z + p.dir * kk * 60 * k + W) % W;
      const s = (3 + 9 * p.z) * k * (0.85 + 0.15 * Math.sin(ph * 2 + p.w));
      ctx.globalAlpha = 0.25 + 0.6 * p.z;
      ctx.drawImage(SPORE, x - s / 2, y - s / 2, s, s);
    }
    for (const s of plume) {
      const kk = (lt / LOOP * s.speed * 1.6 + s.phase) % 1;
      const dist = Math.pow(kk, 1.3) * 1300 * k;
      const wob = Math.sin(kk * 8 + s.wob) * 34 * k * kk;
      const x = source.x + Math.cos(s.a) * dist + Math.cos(s.a + Math.PI / 2) * wob;
      const y = source.y + Math.sin(s.a) * dist + Math.sin(s.a + Math.PI / 2) * wob;
      const size = (5 + Math.pow(kk, 2) * 18) * s.size * k;
      ctx.globalAlpha = Math.min(1, kk * 8) * Math.pow(1 - kk, 0.8) * 0.9;
      ctx.drawImage(SPORE, x - size / 2, y - size / 2, size, size);
    }

    // Grain.
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.05;
    const gx = -((t * 997) % 256 | 0), gy = -((t * 571) % 256 | 0);
    for (let y = gy; y < H; y += 256) for (let x = gx; x < W; x += 256) ctx.drawImage(grain, x, y);

    // Glass band: edge to edge, top corners slightly rounded, frosted navy, lit top edge, soft shadow.
    const BL = bottomLayout();
    ctx.globalCompositeOperation = 'source-over';
    const rad = BL.m * 0.028, cy0 = Math.round(BL.bandTop), ch = H - cy0;
    const band = () => { ctx.beginPath(); ctx.roundRect(0, cy0, W, ch + rad, [rad, rad, 0, 0]); };
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'rgba(2,6,12,0.55)'; ctx.shadowBlur = 36 * k; ctx.shadowOffsetY = 6 * k;
    band(); ctx.fillStyle = 'rgba(7,18,33,0.6)'; ctx.fill();
    ctx.restore();
    const frost = mk(); const fg = frost.getContext('2d');
    fg.filter = `blur(${Math.round(22 * k)}px) saturate(1.2)`; fg.drawImage(cv, 0, 0);
    ctx.save();
    band(); ctx.clip();
    ctx.globalAlpha = 1;
    ctx.drawImage(frost, 0, 0);
    ctx.fillStyle = 'rgba(7,18,33,0.8)'; ctx.fillRect(0, cy0, W, ch);
    const sheen = ctx.createLinearGradient(0, cy0, 0, cy0 + ch * 0.45);
    sheen.addColorStop(0, 'rgba(160,230,230,0.09)'); sheen.addColorStop(1, 'rgba(160,230,230,0)');
    ctx.fillStyle = sheen; ctx.fillRect(0, cy0, W, ch);
    ctx.restore();
    const lw2 = Math.max(1, 1.6 * k), e = lw2 / 2;
    ctx.globalAlpha = 1; ctx.lineWidth = lw2; ctx.strokeStyle = 'rgba(190,245,240,0.45)';
    ctx.beginPath();
    ctx.moveTo(0, cy0 + rad + e); ctx.arcTo(0, cy0 + e, rad, cy0 + e, rad);
    ctx.lineTo(W - rad, cy0 + e); ctx.arcTo(W, cy0 + e, W, cy0 + rad + e, rad);
    ctx.stroke();

    // Tagline and logo.
    ctx.globalAlpha = 0.92; ctx.fillStyle = '#F6F4EC';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = tagFont(BL.tfs);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(BL.tfs * 0.06).toFixed(1)}px`;
    ctx.fillText(BL.tag, W / 2, BL.tagY);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if (LOGO.naturalWidth) { ctx.globalAlpha = 1; ctx.drawImage(LOGO, BL.lx, BL.ly, BL.lw, BL.lh); }
    ctx.globalAlpha = 1;
  }

  // ---------- public API ----------
  let lastImg = null, lastFaces = '', lastSize = '';
  async function render(canvas, image, opts = {}) {
    await Promise.all([logoReady, document.fonts.load("700 40px 'Space Grotesk'").catch(() => {})]);
    cv = canvas; ctx = cv.getContext('2d');
    if (opts.murk != null) murk = Math.max(0, Math.min(1, opts.murk));
    if (opts.tagline != null) tagIdx = opts.tagline ? 1 : 0;
    const newPhoto = image !== lastImg || `${image.width}x${image.height}` !== lastSize;
    if (newPhoto) {
      img = image; W = image.width; H = image.height;
      cv.width = W; cv.height = H;
      prepPhoto(); prepSpores();
      lastImg = image; lastSize = `${W}x${H}`; lastFaces = '';
    }
    const fk = JSON.stringify(opts.faces || []);
    if (fk !== lastFaces) {
      faces = opts.faces || [];
      const lowest = faces.length ? Math.max(...faces.map(f => f.y + f.r)) : H * 0.6;
      const mid = faces.length ? faces.reduce((a, f) => a + f.x, 0) / faces.length : W / 2;
      source = { x: mid, y: Math.min(H * 0.82, lowest + Math.min(W, H) * 0.25) };
      prepFaces(); prepMycelium();
      lastFaces = fk;
    }
    draw(STILL_T);
  }

  window.SporeFilter = { render, TAGLINES };
})();
