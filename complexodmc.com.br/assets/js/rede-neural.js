/* ============================================================
   COMPLEXO DMC — Rede neural (módulo ES, Canvas 2D, sem dependência)

   1) Seção "Sobre" (#conheca):
      - controlador(): a lista .casa__eixos (tablist) é a fonte da
        verdade. Seleção (clique, setas, Home/End ou clique num nó)
        troca o foco .casa__foco-item; passar o cursor/foco num eixo
        marca o nó correspondente (is-hover). Funciona antes da rede.
      - casa(fig, ctrl): a rede em [data-rede="casa"] — seis eixos
        ligados ao centro, anel externo com arco lento, brilho sutil
        por gradiente radial, linhas finas, pulsos nas ligações,
        paralaxe suave ao cursor e rótulos desenhados (número + nome
        curto; só o número abaixo de 768px). Enquanto ninguém mexe,
        o foco avança sozinho a cada 5 s (para na primeira interação).
      - requestAnimationFrame só com a rede visível e a aba ativa;
        inicia perto da viewport, não no load. < 768px: menos nós,
        ~30 fps, DPR ≤ 1.5. prefers-reduced-motion: um quadro
        estático, redesenhado só na interação, sem avanço automático.
        Sem JS/canvas: o SVG .casa__fallback do HTML.
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
const TAU = Math.PI * 2;

/* ---------- 1a. Controlador: lista ↔ foco ↔ rede ---------- */
function controlador() {
  const list = document.querySelector('.casa__eixos');
  if (!list) return null;
  const items = Array.from(list.querySelectorAll('[data-hub]'));
  const tabs = items.map((li) => li.querySelector('.casa__tab')).filter(Boolean);
  const focos = Array.from(document.querySelectorAll('.casa__foco-item'));
  const N = tabs.length;
  if (!N) return null;
  const subs = new Set();
  let selected = Math.max(1, tabs.findIndex((b) => b.getAttribute('aria-selected') === 'true') + 1);
  let hover = 0;
  let touched = false;

  const emit = () => subs.forEach((fn) => fn());

  function select(n, opts) {
    const o = opts || {};
    n = ((n - 1 + N) % N) + 1;
    if (o.user !== false) touched = true;
    if (n !== selected) {
      selected = n;
      tabs.forEach((b, i) => {
        const on = i + 1 === n;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      focos.forEach((f, i) => f.classList.toggle('is-active', i + 1 === n));
      emit();
    }
    if (o.focus) tabs[n - 1].focus();
  }

  function setHover(n) {
    if (n === hover) return;
    hover = n;
    items.forEach((li, i) => li.classList.toggle('is-hover', i + 1 === n));
    emit();
  }

  tabs.forEach((b, i) => {
    const n = i + 1;
    b.addEventListener('click', () => select(n));
    b.addEventListener('pointerenter', () => setHover(n));
    b.addEventListener('pointerleave', () => setHover(0));
    b.addEventListener('focus', () => setHover(n));
    b.addEventListener('blur', () => setHover(0));
    b.addEventListener('keydown', (e) => {
      let t = null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') t = n + 1;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') t = n - 1;
      else if (e.key === 'Home') t = 1;
      else if (e.key === 'End') t = N;
      if (t !== null) { e.preventDefault(); select(t, { focus: true }); }
    });
  });

  return {
    items,
    get selected() { return selected; },
    get hover() { return hover; },
    get touched() { return touched; },
    select,
    setHover,
    on(fn) { subs.add(fn); }
  };
}

/* ---------- 1b. A rede ---------- */
function casa(fig, ctrl) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  fig.appendChild(canvas);

  const items = ctrl ? ctrl.items : [];
  const rootCss = getComputedStyle(document.documentElement);
  const GOLD = triplet(rootCss.getPropertyValue('--color-gold-rgb'), [214, 176, 105]);
  const TEXT = [154, 152, 147];
  const TEXT_2 = [191, 189, 185];
  const TEXT_HI = [245, 243, 240];
  const ACCENT = [];
  const NOME = [];
  for (let n = 1; n <= 6; n++) {
    const li = items.find((el) => el.dataset.hub === String(n));
    ACCENT.push(li ? triplet(getComputedStyle(li).getPropertyValue('--np-accent'), GOLD) : GOLD);
    NOME.push(li ? li.dataset.curto || '' : '');
  }

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
  let hoverHub = 0;
  let lastAuto = 0;
  let pointerOnFig = false;
  const glow = [0, 0, 0, 0, 0, 0, 0];
  const ptr = { x: 0, y: 0, tx: 0, ty: 0, px: -1e4, py: -1e4, on: false };
  let R_HUB = 0.31; // raio do anel dos eixos (fração do lado); maior quando há espaço para os rótulos

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
      const h = { x: 0.5 + Math.cos(a) * R_HUB, y: 0.5 + Math.sin(a) * R_HUB, z: 0.8, amp: 0.003, ph: r() * TAU, kind: 'hub', hub: i + 1, ang: a };
      hubs.push(h);
      nodes.push(h);
      edges.push({ a: center, b: h, kind: 'spine', hub: i + 1 });
    }

    const loose = [];
    hubs.forEach((h) => {
      const k = lite ? 4 : 6;
      for (let j = 0; j < k; j++) {
        // satélites espalhados em leque para fora do centro, longe do rótulo
        const a = h.ang + (r() - 0.5) * 2.2 + (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2) * (0.35 + r() * 0.65);
        const d = 0.05 + r() * 0.09;
        const s = { x: h.x + Math.cos(a) * d, y: h.y + Math.sin(a) * d, z: 0.35 + r() * 0.6, amp: 0.003 + r() * 0.006, ph: r() * TAU, kind: 'sat', hub: h.hub };
        nodes.push(s);
        loose.push(s);
        edges.push({ a: h, b: s, kind: 'leaf', hub: h.hub });
      }
    });
    const free = lite ? 5 : 12;
    for (let tries = 0, made = 0; made < free && tries < 400; tries++) {
      const x = 0.08 + r() * 0.84;
      const y = 0.08 + r() * 0.84;
      if (Math.hypot(x - 0.5, y - 0.5) < 0.14) continue;
      let near = 0;
      let best = 9;
      hubs.forEach((h) => {
        const d = Math.hypot(h.x - x, h.y - y);
        if (d < best) { best = d; near = h.hub; }
      });
      if (best < 0.1) continue;
      const n = { x, y, z: 0.2 + r() * 0.4, amp: 0.005 + r() * 0.008, ph: r() * TAU, kind: 'free', hub: near };
      nodes.push(n);
      loose.push(n);
      made++;
    }
    for (let i = 0; i < loose.length; i++) {
      let c = 0;
      for (let j = i + 1; j < loose.length && c < 2; j++) {
        const d = Math.hypot(loose[i].x - loose[j].x, loose[i].y - loose[j].y);
        if (d < 0.1) {
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
    const r = S >= 560 ? 0.36 : S >= 440 ? 0.33 : 0.31;
    if (r !== R_HUB) { R_HUB = r; build(); }
    return true;
  }

  const sel = () => (ctrl ? ctrl.selected : 0);
  const hov = () => hoverHub || (ctrl ? ctrl.hover : 0);

  function place(n, t) {
    const dx = Math.sin(t * 0.00035 + n.ph) * n.amp;
    const dy = Math.cos(t * 0.0003 + n.ph * 1.3) * n.amp;
    n.px = ox + (n.x + dx + ptr.x * 0.035 * n.z) * S;
    n.py = oy + (n.y + dy + ptr.y * 0.035 * n.z) * S;
  }

  function spawn(t) {
    const max = lite ? 4 : 7;
    if (pulses.length >= max || t - lastSpawn < (lite ? 1200 : 700)) return;
    lastSpawn = t;
    const act = sel();
    const pool = edges.filter((e) => (e.kind === 'spine' || e.kind === 'leaf') && (!act || Math.random() < 0.3 || e.hub === act));
    const e = pool[Math.floor(Math.random() * pool.length)];
    if (!e) return;
    // espinha: do centro para o eixo (sinal da casa); folha: do satélite para o eixo
    pulses.push({ e, t0: t, dur: 1400 + Math.random() * 900, back: e.kind === 'leaf' ? true : Math.random() < 0.25 });
  }

  function label(h, g, selectedNow) {
    const n = h.hub;
    const a = h.ang;
    const cx = center.px;
    const cy = center.py;
    const off = 22 + g * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const lx = h.px + dx * off;
    const ly = h.py + dy * off;
    const vertical = Math.abs(dx) < 0.2;
    const numFont = `500 11px "Hanken Grotesk", system-ui, sans-serif`;
    const nameFont = `400 12px "Hanken Grotesk", system-ui, sans-serif`;
    const accent = ACCENT[n - 1];
    const nameCol = selectedNow ? TEXT_HI : TEXT_2;
    ctx.textBaseline = 'middle';

    if (lite) {
      ctx.font = numFont;
      ctx.textAlign = vertical ? 'center' : dx > 0 ? 'left' : 'right';
      ctx.fillStyle = rgba(accent, 0.95);
      ctx.fillText('E' + n, lx, ly);
      return;
    }

    const name = NOME[n - 1];
    let lines;
    if (vertical) lines = [name];
    else {
      // quebra no espaço mais próximo do meio
      const mid = name.length / 2;
      let cut = -1;
      let best = 99;
      for (let i = 0; i < name.length; i++) if (name[i] === ' ' && Math.abs(i - mid) < best) { best = Math.abs(i - mid); cut = i; }
      lines = cut > 0 ? [name.slice(0, cut), name.slice(cut + 1)] : [name];
    }
    const lh = 15;
    const total = lh * (lines.length + 1);
    let y0;
    if (vertical) y0 = dy < 0 ? ly - total + lh / 2 : ly + lh / 2;
    else y0 = ly - total / 2 + lh / 2;
    ctx.textAlign = vertical ? 'center' : dx > 0 ? 'left' : 'right';
    ctx.font = numFont;
    ctx.fillStyle = rgba(accent, 0.95);
    ctx.fillText('E' + n, lx, y0);
    ctx.font = nameFont;
    ctx.fillStyle = rgba(nameCol, selectedNow ? 1 : 0.85);
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], lx, y0 + lh * (i + 1));
    void cx; void cy;
  }

  function draw(t, settle) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < nodes.length; i++) place(nodes[i], t);

    const act = sel();
    const hv = hov();
    for (let k = 1; k <= 6; k++) {
      const target = k === act ? 1 : k === hv ? 0.6 : 0;
      glow[k] = settle ? target : glow[k] + (target - glow[k]) * 0.1;
    }
    const cx = center.px;
    const cy = center.py;
    const R = S * R_HUB;
    const R_CENTER = lite ? 15 : 18;

    // anel externo + arco lento
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(TEXT, 0.12);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    const a0 = (t * 0.00025) % TAU;
    const grad = ctx.createConicGradient ? ctx.createConicGradient(a0, cx, cy) : null;
    if (grad) {
      grad.addColorStop(0, rgba(GOLD, 0));
      grad.addColorStop(0.18, rgba(GOLD, 0.55));
      grad.addColorStop(0.22, rgba(GOLD, 0));
      grad.addColorStop(1, rgba(GOLD, 0));
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();
    }

    // ligações
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const g = e.hub ? glow[e.hub] : 0;
      let base;
      let col;
      let width = 1;
      if (e.kind === 'spine') { base = 0.16; col = g > 0.05 ? ACCENT[e.hub - 1] : GOLD; }
      else if (e.kind === 'leaf') { base = 0.1; col = ACCENT[e.hub - 1]; width = 0.75; }
      else { base = 0.06; col = e.hub ? ACCENT[e.hub - 1] : TEXT; width = 0.75; }
      let alpha = base + g * (e.kind === 'spine' ? 0.5 : e.kind === 'leaf' ? 0.3 : 0.1);
      if (ptr.on) {
        const mx = (e.a.px + e.b.px) / 2 - ptr.px;
        const my = (e.a.py + e.b.py) / 2 - ptr.py;
        const d = Math.hypot(mx, my);
        if (d < R * 0.6) alpha += (1 - d / (R * 0.6)) * 0.12;
      }
      let ax = e.a.px;
      let ay = e.a.py;
      if (e.kind === 'spine') {
        // nasce na borda do anel central
        const dx = e.b.px - cx;
        const dy = e.b.py - cy;
        const L = Math.hypot(dx, dy) || 1;
        ax = cx + (dx / L) * R_CENTER;
        ay = cy + (dy / L) * R_CENTER;
        if (g > 0.05) {
          ctx.lineWidth = 5;
          ctx.strokeStyle = rgba(col, 0.1 * g);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(e.b.px, e.b.py);
          ctx.stroke();
        }
      }
      ctx.lineWidth = width;
      ctx.strokeStyle = rgba(col, alpha);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(e.b.px, e.b.py);
      ctx.stroke();
    }

    // pulsos
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      let k = (t - p.t0) / p.dur;
      if (k >= 1) { pulses.splice(i, 1); continue; }
      if (p.back) k = 1 - k;
      const x = p.e.a.px + (p.e.b.px - p.e.a.px) * k;
      const y = p.e.a.py + (p.e.b.py - p.e.a.py) * k;
      const col = p.e.kind === 'spine' && glow[p.e.hub] < 0.05 ? GOLD : ACCENT[p.e.hub - 1];
      const fade = Math.sin(Math.PI * ((t - p.t0) / p.dur));
      ctx.fillStyle = rgba(col, fade * 0.9);
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, TAU);
      ctx.fill();
    }

    // nós soltos
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.kind === 'sat' || n.kind === 'free') {
        const g = n.hub ? glow[n.hub] : 0;
        const col = n.kind === 'sat' ? ACCENT[n.hub - 1] : TEXT;
        ctx.fillStyle = rgba(col, (n.kind === 'sat' ? 0.3 : 0.22) + g * 0.45);
        ctx.beginPath();
        ctx.arc(n.px, n.py, (n.kind === 'sat' ? 1.3 : 1.1) + g * 0.6, 0, TAU);
        ctx.fill();
      }
    }

    // eixos
    hubs.forEach((h) => {
      const g = glow[h.hub];
      const col = ACCENT[h.hub - 1];
      const halo = ctx.createRadialGradient(h.px, h.py, 0, h.px, h.py, 26 + g * 12);
      halo.addColorStop(0, rgba(col, 0.08 + g * 0.22));
      halo.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(h.px, h.py, 26 + g * 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(col, 1);
      ctx.beginPath();
      ctx.arc(h.px, h.py, 3.5 + g * 1.5, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(col, 0.3 + g * 0.45);
      ctx.beginPath();
      ctx.arc(h.px, h.py, 10 + g * 3, 0, TAU);
      ctx.stroke();
      if (g > 0.05) {
        ctx.strokeStyle = rgba(col, 0.18 * g);
        ctx.beginPath();
        ctx.arc(h.px, h.py, 17 + g * 3, 0, TAU);
        ctx.stroke();
      }
      label(h, g, h.hub === act);
    });

    // centro: anel com a marca
    const ch = ctx.createRadialGradient(cx, cy, 0, cx, cy, 44);
    ch.addColorStop(0, rgba(GOLD, 0.16));
    ch.addColorStop(1, rgba(GOLD, 0));
    ctx.fillStyle = ch;
    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(GOLD, 0.7);
    ctx.beginPath();
    ctx.arc(cx, cy, R_CENTER, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = rgba(GOLD, 0.16);
    ctx.beginPath();
    ctx.arc(cx, cy, R_CENTER + 7, 0, TAU);
    ctx.stroke();
    ctx.font = `600 ${lite ? 9 : 10}px "Hanken Grotesk", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
    ctx.fillStyle = rgba(GOLD, 1);
    ctx.fillText('DMC', cx + 0.75, cy + 0.5);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  function loop(t) {
    raf = 0;
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (lite && t - lastFrame < 32) return;
    lastFrame = t;
    ptr.x += (ptr.tx - ptr.x) * 0.06;
    ptr.y += (ptr.ty - ptr.y) * 0.06;
    // avanço automático até a primeira interação
    if (ctrl && !ctrl.touched && !pointerOnFig) {
      if (!lastAuto) lastAuto = t;
      if (t - lastAuto > 5000) { lastAuto = t; ctrl.select(ctrl.selected + 1, { user: false }); }
    }
    spawn(t);
    draw(t, false);
  }

  function still() { draw(0, true); }

  function start() {
    if (!inView || document.hidden) return;
    if (reduce.matches) { still(); return; }
    if (running) return;
    running = true;
    lastAuto = 0;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  if (ctrl) ctrl.on(() => { if (!running) still(); });

  fig.addEventListener('pointerenter', () => { pointerOnFig = true; });
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
    let best = Math.max(24, S * 0.07);
    hubs.forEach((h) => {
      const d = Math.hypot(h.px - x, h.py - y);
      if (d < best) { best = d; near = h.hub; }
    });
    if (near !== hoverHub) {
      hoverHub = near;
      fig.classList.toggle('is-pointer', !!near);
      if (ctrl) ctrl.setHover(near);
      if (!running) still();
    }
  }, { passive: true });
  fig.addEventListener('pointerleave', () => {
    pointerOnFig = false;
    ptr.on = false;
    ptr.tx = 0;
    ptr.ty = 0;
    ptr.px = -1e4;
    ptr.py = -1e4;
    if (hoverHub) {
      hoverHub = 0;
      fig.classList.remove('is-pointer');
      if (ctrl) ctrl.setHover(0);
    }
    if (!running) still();
  });
  fig.addEventListener('click', () => {
    if (!hoverHub || !ctrl) return;
    ctrl.select(hoverHub);
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

const ctrl = controlador();
const fig = document.querySelector('[data-rede="casa"]');
if (fig) whenNear(fig, () => casa(fig, ctrl), '300px 0px');

const painel = document.getElementById('features');
if (painel) whenNear(painel, stages, '600px 0px');
