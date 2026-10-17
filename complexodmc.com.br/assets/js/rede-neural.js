/* ============================================================
   COMPLEXO DMC — Rede neural (módulo ES, Canvas 2D, sem dependência)

   1) [data-rede="casa"] (seção #conheca): os seis eixos reais ligados
      ao centro da casa. Deriva lenta dos nós, pulsos discretos nas
      ligações e resposta suave ao cursor (paralaxe + realce do eixo
      sob o ponteiro). A lista .casa__eixos ao lado carrega o sentido;
      a rede é decorativa (aria-hidden) e nunca fica atrás de texto.
      - requestAnimationFrame só com a rede visível (IntersectionObserver)
        e com a aba ativa; inicia perto da viewport, não no load.
      - < 768px: menos nós, ~30 fps, DPR ≤ 1.5.
      - prefers-reduced-motion: um quadro estático, redesenhado só na
        interação. Sem JS/canvas: o SVG .casa__fallback do HTML.
   2) .np-spot-stage (painel dos eixos): malha estática em SVG por eixo,
      gerada uma vez, na cor do eixo (currentColor = --np-accent).
   ============================================================ */

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const narrow = window.matchMedia('(max-width: 767px)');

function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function triplet(value, fallback) {
  const parts = String(value || '').split(',').map((v) => parseFloat(v));
  return parts.length === 3 && parts.every((v) => !Number.isNaN(v)) ? parts : fallback;
}

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a < 0 ? 0 : a > 1 ? 1 : a})`;

/* ---------- 1. A rede da casa ---------- */
function casa(fig) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  fig.appendChild(canvas);

  const items = Array.from(document.querySelectorAll('.casa__eixos [data-hub]'));
  const rootCss = getComputedStyle(document.documentElement);
  const GOLD = triplet(rootCss.getPropertyValue('--color-gold-rgb'), [214, 176, 105]);
  const TEXT = [154, 152, 147];
  const TEXT_HI = [245, 243, 240];
  const ACCENT = [1, 2, 3, 4, 5, 6].map((n) => {
    const li = items.find((el) => el.dataset.hub === String(n));
    return li ? triplet(getComputedStyle(li).getPropertyValue('--np-accent'), GOLD) : GOLD;
  });

  let W = 0;
  let H = 0;
  let S = 0;
  let ox = 0;
  let oy = 0;
  let dpr = 1;
  let lite = narrow.matches;
  let nodes = [];
  let edges = [];
  let hubs = [];
  let center = null;
  let pulses = [];
  let lastSpawn = 0;
  let running = false;
  let inView = false;
  let raf = 0;
  let lastFrame = 0;
  let listHub = 0;
  let hoverHub = 0;
  const glow = [0, 0, 0, 0, 0, 0, 0];
  const ptr = { x: 0, y: 0, tx: 0, ty: 0, px: -1e4, py: -1e4, on: false };

  function build() {
    lite = narrow.matches;
    const r = rng(7);
    nodes = [];
    edges = [];
    hubs = [];
    pulses = [];
    center = { x: 0.5, y: 0.5, z: 0.5, amp: 0, ph: 0, kind: 'center', hub: 0 };
    nodes.push(center);

    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      const h = { x: 0.5 + Math.cos(a) * 0.34, y: 0.5 + Math.sin(a) * 0.34, z: 0.8, amp: 0.004, ph: r() * 6.28, kind: 'hub', hub: i + 1 };
      hubs.push(h);
      nodes.push(h);
      edges.push({ a: center, b: h, kind: 'spine', hub: i + 1 });
    }
    for (let i = 0; i < 6; i++) edges.push({ a: hubs[i], b: hubs[(i + 1) % 6], kind: 'ring', hub: 0 });

    const loose = [];
    hubs.forEach((h) => {
      const k = lite ? 4 : 8;
      for (let j = 0; j < k; j++) {
        const a = r() * Math.PI * 2;
        const d = 0.045 + r() * 0.11;
        const s = { x: h.x + Math.cos(a) * d, y: h.y + Math.sin(a) * d, z: 0.35 + r() * 0.6, amp: 0.004 + r() * 0.008, ph: r() * 6.28, kind: 'sat', hub: h.hub };
        nodes.push(s);
        loose.push(s);
        edges.push({ a: h, b: s, kind: 'leaf', hub: h.hub });
      }
    });
    const free = lite ? 6 : 18;
    for (let tries = 0, made = 0; made < free && tries < 400; tries++) {
      const x = 0.07 + r() * 0.86;
      const y = 0.07 + r() * 0.86;
      if (Math.hypot(x - 0.5, y - 0.5) < 0.12) continue;
      let near = 0;
      let best = 9;
      hubs.forEach((h) => {
        const d = Math.hypot(h.x - x, h.y - y);
        if (d < best) { best = d; near = h.hub; }
      });
      if (best < 0.08) continue;
      const n = { x, y, z: 0.2 + r() * 0.4, amp: 0.006 + r() * 0.01, ph: r() * 6.28, kind: 'free', hub: near };
      nodes.push(n);
      loose.push(n);
      made++;
    }
    for (let i = 0; i < loose.length; i++) {
      let c = 0;
      for (let j = i + 1; j < loose.length && c < 2; j++) {
        const d = Math.hypot(loose[i].x - loose[j].x, loose[i].y - loose[j].y);
        if (d < 0.105) {
          edges.push({ a: loose[i], b: loose[j], kind: 'mesh', hub: loose[i].hub === loose[j].hub ? loose[i].hub : 0 });
          c++;
        }
      }
    }
  }

  function size() {
    const w = fig.clientWidth;
    const h = fig.clientHeight;
    if (!w || !h) return false;
    if (narrow.matches !== lite) build();
    W = w;
    H = h;
    dpr = Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    S = Math.min(W, H);
    ox = (W - S) / 2;
    oy = (H - S) / 2;
    return true;
  }

  const activeHub = () => hoverHub || listHub;

  function place(n, t) {
    const dx = Math.sin(t * 0.00035 + n.ph) * n.amp;
    const dy = Math.cos(t * 0.0003 + n.ph * 1.3) * n.amp;
    n.px = ox + (n.x + dx + ptr.x * 0.04 * n.z) * S;
    n.py = oy + (n.y + dy + ptr.y * 0.04 * n.z) * S;
  }

  function spawn(t) {
    const max = lite ? 4 : 8;
    if (pulses.length >= max || t - lastSpawn < (lite ? 1100 : 650)) return;
    lastSpawn = t;
    const act = activeHub();
    const pool = edges.filter((e) => (e.kind === 'spine' || e.kind === 'leaf') && (!act || Math.random() < 0.35 || e.hub === act));
    const e = pool[Math.floor(Math.random() * pool.length)];
    if (e) pulses.push({ e, t0: t, dur: 1500 + Math.random() * 900, back: e.kind === 'leaf' ? Math.random() < 0.5 : Math.random() < 0.6 });
  }

  function draw(t, settle) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < nodes.length; i++) place(nodes[i], t);

    const act = activeHub();
    for (let k = 1; k <= 6; k++) {
      const target = k === act ? 1 : 0;
      glow[k] = settle ? target : glow[k] + (target - glow[k]) * 0.12;
    }
    const R = S * 0.2;

    ctx.lineWidth = 1;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const g = e.hub ? glow[e.hub] : 0;
      let base;
      let col;
      if (e.kind === 'spine') { base = 0.28; col = g > 0.05 ? ACCENT[e.hub - 1] : GOLD; }
      else if (e.kind === 'ring') { base = 0.09; col = TEXT; }
      else if (e.kind === 'leaf') { base = 0.24; col = ACCENT[e.hub - 1]; }
      else { base = 0.08; col = e.hub ? ACCENT[e.hub - 1] : TEXT; }
      let alpha = base + g * (e.kind === 'mesh' ? 0.14 : 0.42);
      if (ptr.on) {
        const mx = (e.a.px + e.b.px) / 2 - ptr.px;
        const my = (e.a.py + e.b.py) / 2 - ptr.py;
        const d = Math.hypot(mx, my);
        if (d < R) alpha += (1 - d / R) * 0.16;
      }
      ctx.strokeStyle = rgba(col, alpha);
      ctx.beginPath();
      ctx.moveTo(e.a.px, e.a.py);
      ctx.lineTo(e.b.px, e.b.py);
      ctx.stroke();
    }

    // pulsos: sinal percorrendo a ligação
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      let k = (t - p.t0) / p.dur;
      if (k >= 1) { pulses.splice(i, 1); continue; }
      if (p.back) k = 1 - k;
      const x = p.e.a.px + (p.e.b.px - p.e.a.px) * k;
      const y = p.e.a.py + (p.e.b.py - p.e.a.py) * k;
      const col = p.e.kind === 'spine' ? GOLD : ACCENT[p.e.hub - 1];
      ctx.fillStyle = rgba(col, Math.sin(Math.PI * ((t - p.t0) / p.dur)) * 0.9);
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.kind === 'sat' || n.kind === 'free') {
        const g = n.hub ? glow[n.hub] : 0;
        const col = n.kind === 'sat' ? ACCENT[n.hub - 1] : TEXT;
        ctx.fillStyle = rgba(col, (n.kind === 'sat' ? 0.55 : 0.4) + g * 0.35);
        ctx.beginPath();
        ctx.arc(n.px, n.py, 1.4 + g * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const cx = center.px;
    const cy = center.py;
    ctx.font = `500 ${lite ? 11 : 12}px "Hanken Grotesk", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    hubs.forEach((h) => {
      const g = glow[h.hub];
      const col = ACCENT[h.hub - 1];
      ctx.fillStyle = rgba(col, 1);
      ctx.beginPath();
      ctx.arc(h.px, h.py, 3.5 + g * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(col, 0.32 + g * 0.4);
      ctx.beginPath();
      ctx.arc(h.px, h.py, 10 + g * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = g > 0.5 ? rgba(TEXT_HI, 1) : rgba(TEXT, 0.95);
      ctx.fillText('E' + h.hub, cx + (h.px - cx) * 1.22, cy + (h.py - cy) * 1.22);
    });

    ctx.fillStyle = rgba(GOLD, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(GOLD, 0.35);
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.stroke();
  }

  function loop(t) {
    raf = 0;
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (lite && t - lastFrame < 32) return;
    lastFrame = t;
    ptr.x += (ptr.tx - ptr.x) * 0.06;
    ptr.y += (ptr.ty - ptr.y) * 0.06;
    spawn(t);
    draw(t, false);
  }

  function still() { draw(0, true); }

  function start() {
    if (!inView || document.hidden) return;
    if (reduce.matches) { still(); return; }
    if (running) return;
    running = true;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function markList(n) {
    items.forEach((li) => li.classList.toggle('is-active', li.dataset.hub === String(n)));
  }

  // Interação: lista → rede
  items.forEach((li) => {
    const n = Number(li.dataset.hub);
    const on = () => { listHub = n; if (!running) still(); };
    const off = () => { if (listHub === n) listHub = 0; if (!running) still(); };
    li.addEventListener('pointerenter', on);
    li.addEventListener('pointerleave', off);
    li.addEventListener('focusin', on);
    li.addEventListener('focusout', off);
  });

  // Cursor sobre a rede: paralaxe suave e realce do eixo mais próximo
  fig.addEventListener('pointermove', (e) => {
    const box = canvas.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    ptr.on = true;
    ptr.px = x;
    ptr.py = y;
    ptr.tx = x / W - 0.5;
    ptr.ty = y / H - 0.5;
    let near = 0;
    let best = Math.max(22, S * 0.05);
    hubs.forEach((h) => {
      const d = Math.hypot(h.px - x, h.py - y);
      if (d < best) { best = d; near = h.hub; }
    });
    if (near !== hoverHub) {
      hoverHub = near;
      fig.classList.toggle('is-pointer', !!near);
      markList(near);
      if (!running) still();
    }
  }, { passive: true });
  fig.addEventListener('pointerleave', () => {
    ptr.on = false;
    ptr.tx = 0;
    ptr.ty = 0;
    ptr.px = -1e4;
    ptr.py = -1e4;
    if (hoverHub) {
      hoverHub = 0;
      fig.classList.remove('is-pointer');
      markList(0);
    }
    if (!running) still();
  });
  fig.addEventListener('click', () => {
    if (!hoverHub) return;
    const link = items[hoverHub - 1] && items[hoverHub - 1].querySelector('a[href]');
    if (link) link.click();
  });

  build();
  if (!size()) return;
  still();
  fig.classList.add('is-live');

  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { if (size()) { if (!running) still(); } }).observe(fig);
  }
  new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      inView = en.isIntersecting;
      if (inView) start(); else stop();
    });
  }, { threshold: 0 }).observe(fig);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  const onReduce = () => { stop(); if (reduce.matches) still(); else start(); };
  if (reduce.addEventListener) reduce.addEventListener('change', onReduce);
}

/* ---------- 2. Malha estática por eixo (painel) ---------- */
function stageNet(seed) {
  const r = rng(seed * 7919 + 13);
  const pts = [];
  for (let gy = 0; gy < 9; gy++) {
    for (let gx = 0; gx < 7; gx++) {
      const cx = 200 + (gx - 3) * 62;
      const cy = 250 + (gy - 4) * 62;
      const fall = Math.hypot((cx - 200) / 200, (cy - 250) / 250);
      if (r() > 1.15 - fall * 0.55) continue;
      const x = cx + (r() - 0.5) * 34;
      const y = cy + (r() - 0.5) * 34;
      if (Math.hypot(x - 200, y - 250) < 64) continue;
      pts.push([x, y, r() > 0.84]);
    }
  }
  const f = (v) => v.toFixed(1);
  let lines = '';
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < 100) lines += `<path d="M${f(pts[i][0])} ${f(pts[i][1])}L${f(pts[j][0])} ${f(pts[j][1])}" stroke-opacity="${(0.56 - d / 220).toFixed(2)}"/>`;
    }
  }
  pts
    .map((p) => [Math.hypot(p[0] - 200, p[1] - 250), p])
    .sort((a, b) => a[0] - b[0])
    .slice(0, 6)
    .forEach(([, p]) => { lines += `<path d="M200 250L${f(p[0])} ${f(p[1])}" stroke-opacity=".5"/>`; });
  let dots = '';
  pts.forEach((p) => { dots += `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${p[2] ? 2.6 : 1.4}" fill-opacity="${p[2] ? 0.95 : 0.6}"/>`; });
  return `<svg class="np-net" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width=".8">${lines}</g><g fill="currentColor">${dots}</g></svg>`;
}

function stages() {
  document.querySelectorAll('.np-flag[data-eixo] .np-spot-stage').forEach((stage) => {
    if (stage.querySelector('.np-net')) return;
    const n = Number(stage.closest('.np-flag').dataset.eixo) || 1;
    stage.insertAdjacentHTML('afterbegin', stageNet(n));
    stage.classList.add('has-net');
  });
}

/* ---------- Início: perto da viewport, nunca no caminho do LCP ---------- */
function whenNear(el, fn, margin) {
  if (!('IntersectionObserver' in window)) { fn(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
  }, { rootMargin: margin });
  io.observe(el);
}

const fig = document.querySelector('[data-rede="casa"]');
if (fig) whenNear(fig, () => casa(fig), '300px 0px');

const painel = document.getElementById('features');
if (painel) whenNear(painel, stages, '600px 0px');
