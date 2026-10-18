/* ============================================================
   COMPLEXO DMC — 06 · Presença Nacional (módulo ES, Canvas 2D, autônomo)

   Sobre o SVG inline de [data-rede="brasil"] desenha três planos com
   paralaxe ao cursor: z0 = o próprio SVG (parado) · z.6 = arestas
   SP→26 capitais (quadráticas, controle 8 % perpendicular) · z1 = nós e
   pulsos ouro saindo de SP (máx. 4, a cada 900 ms, 1,6–2,4 s, fade
   senoidal). pointermove realça a aresta mais próxima.
   Gate: só monta em ≥768 px e sem prefers-reduced-motion, perto da
   viewport (IO 300px). rAF só com a figura visível e a aba ativa, ≤ 30 fps,
   DPR ≤ 2. data-motion no container: "running" (animando) · "paused" (pausado:
   fora da viewport/aba oculta) · "still" (sem canvas ou um quadro estático).
   Sem fetch, sem dependência; capitais embutidas (brasil-capitais.js).
   ============================================================ */
import { CAPITAIS, SEDE } from './data/brasil-capitais.js';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const wide = window.matchMedia('(min-width: 768px)');
const FPS = 30;
const FRAME = 1000 / FPS;
const TAU = Math.PI * 2;

/* helpers (copiados de rede-neural.js) */
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
const lerp = (a, b, t) => a + (b - a) * t;

function whenNear(el, fn, margin) {
  if (!('IntersectionObserver' in window)) { fn(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
  }, { rootMargin: margin });
  io.observe(el);
}

function cena(fig) {
  const canvas = document.createElement('canvas');
  canvas.className = 'presenca-mapa__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;
  fig.appendChild(canvas);

  const cs = getComputedStyle(fig);
  const gold = triplet(cs.getPropertyValue('--color-gold-rgb'), [214, 176, 105]);
  const grey = triplet(cs.getPropertyValue('--text-3-rgb'), [154, 152, 147]);

  const sede = CAPITAIS[SEDE];
  const alvos = Object.keys(CAPITAIS).filter((k) => k !== SEDE);
  const random = rng(27);
  // arestas: quadrática SP→capital com controle deslocado 8 % perpendicular
  const arestas = alvos.map((uf, i) => {
    const [x2, y2] = CAPITAIS[uf];
    const dx = x2 - sede[0], dy = y2 - sede[1];
    const len = Math.hypot(dx, dy) || 1;
    const lado = i % 2 ? 1 : -1;
    const cx = (sede[0] + x2) / 2 + (-dy / len) * len * 0.08 * lado;
    const cy = (sede[1] + y2) / 2 + (dx / len) * len * 0.08 * lado;
    return { uf, x2, y2, cx, cy, len };
  });
  const ponto = (a, t) => {
    const u = 1 - t;
    return [u * u * sede[0] + 2 * u * t * a.cx + t * t * a.x2, u * u * sede[1] + 2 * u * t * a.cy + t * t * a.y2];
  };

  let W = 0, H = 0, S = 1, dpr = 1;
  let px = 0, py = 0, tx = 0, ty = 0;     // paralaxe atual/alvo (px)
  let perto = -1;                          // aresta realçada
  let halo = 0, haloAlvo = 0;
  const pulsos = [];
  let ultimoPulso = 0;
  let running = false, inView = false, raf = 0, ultimoQuadro = 0;

  function size() {
    const r = fig.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height; S = W / 1000;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    return true;
  }

  function desenhar(anima) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // plano z .6 — arestas
    ctx.save();
    ctx.translate(px * 0.6, py * 0.6);
    ctx.scale(S, S);
    ctx.lineWidth = 0.9 / S;
    arestas.forEach((a, i) => {
      ctx.beginPath();
      ctx.moveTo(sede[0], sede[1]);
      ctx.quadraticCurveTo(a.cx, a.cy, a.x2, a.y2);
      ctx.strokeStyle = i === perto ? rgba(gold, 0.55) : rgba(grey, 0.14);
      ctx.stroke();
    });
    ctx.restore();
    // plano z 1 — nós, pulsos, sede
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(S, S);
    ctx.fillStyle = rgba(grey, 1);
    arestas.forEach((a, i) => {
      ctx.beginPath();
      ctx.arc(a.x2, a.y2, (i === perto ? 3.2 : 2.5) / Math.max(S, 0.35), 0, TAU);
      ctx.fillStyle = i === perto ? rgba(gold, 1) : rgba(grey, 1);
      ctx.fill();
    });
    if (anima) {
      pulsos.forEach((p) => {
        const t = p.t;
        const [x, y] = ponto(arestas[p.i], t);
        const a = Math.sin(t * Math.PI);
        ctx.beginPath();
        ctx.arc(x, y, 2.2 / Math.max(S, 0.35), 0, TAU);
        ctx.fillStyle = rgba(gold, 0.9 * a);
        ctx.fill();
        // rastro curto
        const [xr, yr] = ponto(arestas[p.i], Math.max(0, t - 0.05));
        ctx.beginPath();
        ctx.moveTo(xr, yr); ctx.lineTo(x, y);
        ctx.lineWidth = 1.2 / S; ctx.strokeStyle = rgba(gold, 0.5 * a); ctx.stroke();
      });
    }
    // sede: halo + anel + ponto
    const h = 0.18 + halo * 0.35;
    const g = ctx.createRadialGradient(sede[0], sede[1], 0, sede[0], sede[1], 34);
    g.addColorStop(0, rgba(gold, h)); g.addColorStop(1, rgba(gold, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sede[0], sede[1], 34, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(sede[0], sede[1], 12, 0, TAU);
    ctx.lineWidth = 1 / S; ctx.strokeStyle = rgba(gold, 0.35 + halo * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.arc(sede[0], sede[1], 5, 0, TAU);
    ctx.fillStyle = rgba(gold, 1); ctx.fill();
    ctx.restore();
  }

  function passo(now) {
    raf = 0;
    if (!running) return;
    raf = requestAnimationFrame(passo);
    if (now - ultimoQuadro < FRAME) return;      // ≤ 30 fps
    const dt = Math.min(100, now - (ultimoQuadro || now));
    ultimoQuadro = now;
    px = lerp(px, tx, 0.06); py = lerp(py, ty, 0.06);
    halo = lerp(halo, haloAlvo, 0.1);
    haloAlvo = Math.max(0, haloAlvo - dt / 1600);
    if (now - ultimoPulso > 900 && pulsos.length < 4) {
      ultimoPulso = now;
      const i = perto >= 0 && random() < 0.5 ? perto : Math.floor(random() * arestas.length);
      pulsos.push({ i, t: 0, dur: 1600 + random() * 800 });
      haloAlvo = 1;
    }
    for (let k = pulsos.length - 1; k >= 0; k--) {
      pulsos[k].t += dt / pulsos[k].dur;
      if (pulsos[k].t >= 1) pulsos.splice(k, 1);
    }
    desenhar(true);
  }

  function still() {
    if (!size()) return;
    px = py = tx = ty = 0; halo = 0; pulsos.length = 0;
    desenhar(false);
    fig.dataset.motion = 'still';
  }
  function start() {
    if (running || !inView || document.hidden || reduce.matches) return;
    running = true; ultimoQuadro = 0;
    fig.dataset.motion = 'running';
    if (!raf) raf = requestAnimationFrame(passo);
  }
  function stop(estado) {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    fig.dataset.motion = estado || 'paused';
  }

  function onMove(e) {
    const r = fig.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    tx = (mx - r.width / 2) * 0.02; ty = (my - r.height / 2) * 0.02;
    // aresta mais próxima do cursor (amostra 8 pontos por curva)
    const ux = mx / S, uy = my / S;
    let best = -1, bd = 40 * 40;
    arestas.forEach((a, i) => {
      for (let s = 1; s <= 8; s++) {
        const [x, y] = ponto(a, s / 8);
        const d = (x - ux) * (x - ux) + (y - uy) * (y - uy);
        if (d < bd) { bd = d; best = i; }
      }
    });
    if (best !== perto) { perto = best; if (!running) desenhar(false); }
  }
  function onLeave() { tx = ty = 0; perto = -1; if (!running) desenhar(false); }

  fig.addEventListener('pointermove', onMove, { passive: true });
  fig.addEventListener('pointerleave', onLeave);

  if (!size()) { canvas.remove(); return null; }
  still();
  fig.classList.add('is-live');

  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { if (size() && !running) desenhar(false); }) : null;
  if (ro) ro.observe(fig);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { inView = en.isIntersecting; if (inView) start(); else stop('paused'); });
  }, { threshold: 0 });
  io.observe(fig);
  const onVis = () => { if (document.hidden) stop('paused'); else start(); };
  document.addEventListener('visibilitychange', onVis);
  const onReduce = () => { stop(); if (reduce.matches) still(); else start(); };
  if (reduce.addEventListener) reduce.addEventListener('change', onReduce);

  return {
    destroy() {
      stop('still');
      io.disconnect(); if (ro) ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (reduce.removeEventListener) reduce.removeEventListener('change', onReduce);
      fig.removeEventListener('pointermove', onMove);
      fig.removeEventListener('pointerleave', onLeave);
      fig.classList.remove('is-live');
      canvas.remove();
    },
  };
}

/** Monta a cena na figura [data-rede="brasil"] da seção #presenca (idempotente). */
export function initPresenca(root) {
  const fig = (root || document).querySelector('[data-rede="brasil"]');
  if (!fig || fig.dataset.brasil) return;
  fig.dataset.brasil = '1';
  fig.dataset.motion = 'still';
  let inst = null;
  const montar = () => {
    if (inst || !wide.matches || reduce.matches) return;
    inst = cena(fig);
  };
  const desmontar = () => { if (inst) { inst.destroy(); inst = null; } fig.dataset.motion = 'still'; };
  const onWide = () => { if (wide.matches) montar(); else desmontar(); };
  if (wide.addEventListener) wide.addEventListener('change', onWide);
  const onReduce = () => { if (!reduce.matches) montar(); };
  if (reduce.addEventListener) reduce.addEventListener('change', onReduce);
  whenNear(fig, montar, '300px 0px');
}

initPresenca(document);
