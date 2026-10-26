/* ============================================================
   COMPLEXO DMC — Rede neural (módulo ES, Canvas 2D, sem dependência)

   1) Seção "Sobre" (#conheca):
      - controlador(): a lista .casa__eixos (tablist) é a fonte da
        verdade. Seleção (clique, setas, Home/End ou clique num nó)
        troca o foco .casa__foco-item; passar o cursor/foco num eixo
        marca o nó correspondente (is-hover). Funciona antes da rede.
      - casa(fig, ctrl): a rede em [data-rede="casa"] — seis eixos
        ligados a um anel central onde fica o rinoceronte (vídeo
        .casa__marca), anel externo com arco lento, linhas finas,
        pulsos nas ligações, paralaxe suave ao cursor e rótulos
        desenhados (número + nome curto; só o número abaixo de
        768px). No anel central, um arco no acento aponta o eixo
        ativo. Enquanto ninguém mexe, o foco avança sozinho a cada
        5 s (para na primeira interação) e o fio da aba ativa marca
        esse tempo (--casa-t na lista, classe is-auto).
      - marca(video): escolhe a fonte com alfa (HEVC no WebKit, WebM
        VP9 nos demais), só baixa e toca com a rede rodando; com
        reduce, Save-Data ou sem JS fica o pôster (quadro 0).
      - requestAnimationFrame só com a rede visível e a aba ativa;
        inicia perto da viewport, não no load. < 768px: menos nós,
        ~30 fps, DPR ≤ 1.5. prefers-reduced-motion: um quadro
        estático, redesenhado só na interação, sem avanço automático.
        Sem JS/canvas: o SVG .casa__fallback do HTML.
      - Nível 3 (2026-10-17, pedido do CEO): as soluções de cada eixo
        (assets/js/data/eixos-servicos.js) são nós que se expandem em
        leque a partir do eixo aberto (cursor > foco > seleção), em malha
        triangulada, com rótulos que são links reais (.casa__subs, por
        cima do canvas: teclado, leitor de tela, clique). Cor única: o
        dourado institucional (--casa-ouro / --casa-ouro-hi) nos seis.
        < 768px: os rótulos saem do canvas e viram lista no painel do
        eixo (.casa__foco-subs).
   2) .np-spot-stage (painel dos eixos): malha estática em SVG por eixo,
      gerada uma vez, na cor do eixo (currentColor = --np-accent).
   ============================================================ */

import { SERVICOS } from './data/eixos-servicos.js?v=1';

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
const AUTO_MS = 5000; // avanço automático do eixo em foco

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

  // fio da aba ativa como relógio do avanço automático (k de 0 a 1; null = cheio)
  function progress(k) {
    const on = k !== null && !touched;
    list.classList.toggle('is-auto', on);
    if (on) list.style.setProperty('--casa-t', k.toFixed(3));
    else list.style.removeProperty('--casa-t');
  }

  function select(n, opts) {
    const o = opts || {};
    n = ((n - 1 + N) % N) + 1;
    if (o.user !== false && !touched) { touched = true; progress(null); }
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
    progress,
    on(fn) { subs.add(fn); }
  };
}

/* ---------- 1b. O rinoceronte do centro (vídeo com alfa) ---------- */
function marca(video) {
  if (!video) return { play() {}, pause() {} };
  const save = !!(navigator.connection && navigator.connection.saveData);
  // WebKit (Safari e todo navegador no iOS) não desenha o alfa do VP9; HEVC com alfa, sim
  const webkit = /Apple/.test(navigator.vendor || '');
  const src = webkit ? video.dataset.hevc : video.dataset.webm;
  let loaded = false;
  return {
    play() {
      if (save || reduce.matches || !src) return;
      if (!loaded) { loaded = true; video.src = src; }
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    },
    pause() { if (loaded && !video.paused) video.pause(); }
  };
}

/* ---------- 1c. A rede ---------- */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (v) => 1 - Math.pow(1 - v, 3);

function casa(fig, ctrl) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.setAttribute('aria-hidden', 'true');
  const video = fig.querySelector('.casa__marca');
  // o canvas entra por baixo do rinoceronte
  fig.insertBefore(canvas, video);
  const rino = marca(video);

  const items = ctrl ? ctrl.items : [];
  // cor única do componente: o dourado institucional (tokens locais de .casa)
  const css = getComputedStyle(fig);
  const GOLD = triplet(css.getPropertyValue('--casa-ouro'), [198, 161, 91]);
  const GOLD_HI = triplet(css.getPropertyValue('--casa-ouro-hi'), [227, 198, 137]);
  const TEXT = [150, 150, 150];
  const TEXT_HI = [242, 242, 240];
  const NOME = [];
  for (let n = 1; n <= 6; n++) {
    const li = items.find((el) => el.dataset.hub === String(n));
    NOME.push(li ? li.dataset.curto || '' : '');
  }

  // ---- camada das soluções: links reais por cima do canvas (teclado, leitor de tela, clique)
  const layer = document.createElement('div');
  layer.className = 'casa__subs';
  const groups = [];
  SERVICOS.forEach((eixo) => {
    const ul = document.createElement('ul');
    ul.className = 'casa__subs-grupo';
    ul.setAttribute('aria-label', `Soluções do eixo E${eixo.n}, ${eixo.nome}`);
    const links = eixo.servicos.map((s, i) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'casa__sub';
      a.href = s.href;
      a.textContent = s.nome;
      a.style.setProperty('--i', i);
      li.appendChild(a);
      ul.appendChild(li);
      return a;
    });
    layer.appendChild(ul);
    groups[eixo.n] = { ul, links };
  });
  fig.appendChild(layer);

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
  let autoT = 0;
  let lastT = 0;
  let pointerOnFig = false;
  let focusInFig = false;
  let arcAng = null;
  let SUB = []; // SUB[n] = nós de solução do eixo n
  let linkHot = null; // solução sob o cursor/foco no link
  let beadHot = null; // solução sob o cursor no canvas
  let lastHover = 0;
  let lingerUntil = 0;
  let open = 0; // eixo com as soluções abertas
  const glow = [0, 0, 0, 0, 0, 0, 0];
  const exp = [0, 0, 0, 0, 0, 0, 0]; // abertura da rede de soluções (0–1)
  const nameA = [1, 1, 1, 1, 1, 1, 1]; // opacidade do nome do eixo no canvas
  const ptr = { x: 0, y: 0, tx: 0, ty: 0, px: -1e4, py: -1e4, on: false };
  let R_HUB = 0.31; // raio do anel dos eixos (fração do lado); maior quando há espaço para os rótulos
  let RING_F = 0; // raio do anel central em volta do rinoceronte (fração do lado); 0 = selo "DMC"
  let RO = 0.4; // raio da órbita das soluções (nível 3), por fora do anel dos eixos

  const hot = () => linkHot || beadHot;

  function build() {
    lite = narrow.matches;
    const r = rng(7);
    nodes = [];
    edges = [];
    hubs = [];
    pulses = [];
    // o centro não se move: o rinoceronte (DOM) fica parado sobre ele
    center = { x: 0.5, y: 0.5, z: RING_F ? 0 : 0.5, amp: 0, ph: 0, kind: 'center', hub: 0 };
    const keep = Math.max(0.14, RING_F + 0.04); // nada solto dentro do anel central
    nodes.push(center);

    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      const h = { x: 0.5 + Math.cos(a) * R_HUB, y: 0.5 + Math.sin(a) * R_HUB, z: 0.8, amp: 0.003, ph: r() * TAU, kind: 'hub', hub: i + 1, ang: a };
      hubs.push(h);
      nodes.push(h);
      edges.push({ a: center, b: h, kind: 'spine', hub: i + 1 });
    }

    // textura: poucos satélites por eixo (a rede de soluções é a estrutura principal)
    const loose = [];
    hubs.forEach((h) => {
      const k = lite ? 3 : 4;
      for (let j = 0; j < k; j++) {
        const a = h.ang + (r() - 0.5) * 2.2 + (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2) * (0.35 + r() * 0.65);
        const d = 0.05 + r() * 0.08;
        const s = { x: h.x + Math.cos(a) * d, y: h.y + Math.sin(a) * d, z: 0.35 + r() * 0.6, amp: 0.003 + r() * 0.006, ph: r() * TAU, kind: 'sat', hub: h.hub };
        const L = Math.hypot(s.x - 0.5, s.y - 0.5);
        if (L < keep) { s.x = 0.5 + ((s.x - 0.5) / L) * keep; s.y = 0.5 + ((s.y - 0.5) / L) * keep; }
        nodes.push(s);
        loose.push(s);
        edges.push({ a: h, b: s, kind: 'leaf', hub: h.hub });
      }
    });
    const free = lite ? 4 : 8;
    for (let tries = 0, made = 0; made < free && tries < 400; tries++) {
      const x = 0.08 + r() * 0.84;
      const y = 0.08 + r() * 0.84;
      if (Math.hypot(x - 0.5, y - 0.5) < keep) continue;
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

    // nível 3: as soluções do eixo, sobre a órbita externa (RO). O ângulo de cada
    // uma sai de layout(), a partir do tamanho real dos rótulos; aqui fica um leque
    // padrão (é o que vale no celular, onde o canvas não tem rótulo).
    SUB = [];
    hubs.forEach((h) => {
      const g = groups[h.hub];
      if (!g) return;
      SUB[h.hub] = g.links.map((link, i) => ({ x: 0.5, y: 0.5, z: 0.8, amp: 0, ph: 0, ang: h.ang, i, hub: h.hub, link, p: 0 }));
      setFan(h, lite ? 17 : 20);
    });
  }

  // distribui as soluções do eixo na órbita, simétricas em volta da direção dele
  function setFan(h, stepDeg) {
    const subs = SUB[h.hub];
    const k = subs.length;
    subs.forEach((s) => {
      s.ang = h.ang + ((s.i - (k - 1) / 2) * stepDeg * Math.PI) / 180;
      s.x = 0.5 + Math.cos(s.ang) * RO;
      s.y = 0.5 + Math.sin(s.ang) * RO;
    });
  }

  function size() {
    // o canvas pode ser mais largo que o quadrado da rede (margem para os rótulos)
    const w = canvas.clientWidth || fig.clientWidth;
    const h = canvas.clientHeight || fig.clientHeight;
    if (!w || !h) return false;
    W = w;
    H = h;
    dpr = Math.min(window.devicePixelRatio || 1, narrow.matches ? 1.5 : 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    S = Math.min(W, H);
    ox = (W - S) / 2;
    oy = (H - S) / 2;
    // raio do anel dos eixos: maior quando o canvas sobra dos lados para os rótulos
    // três órbitas: rinoceronte (centro), eixos (R_HUB) e soluções (RO). No celular
    // não há rótulo de solução no canvas, então o anel dos eixos fica mais aberto.
    const r = narrow.matches ? (S >= 400 ? 0.33 : 0.32) : 0.29;
    // anel central: 52% da largura do vídeo (a cabeça inteira cabe dentro)
    const ring = video && video.offsetWidth ? Math.round(video.offsetWidth * 0.52) / S : 0;
    if (r !== R_HUB || narrow.matches !== lite || Math.abs(ring - RING_F) > 0.002) {
      R_HUB = r;
      RO = r + (narrow.matches ? 0.085 : 0.11);
      RING_F = ring;
      build();
    }
    layout();
    return true;
  }

  // nomes dos outros eixos e os próprios nós: áreas que os rótulos não cobrem
  function hubBoxes(open) {
    const out = [];
    ctx.font = `400 12px "Hanken Grotesk", system-ui, sans-serif`;
    hubs.forEach((h) => {
      const x0 = ox + h.x * S;
      const y0 = oy + h.y * S;
      if (h.hub === open) { out.push({ x: x0 - 30, y: y0 - 30, w: 60, h: 60 }); return; }
      out.push({ x: x0 - 12, y: y0 - 12, w: 24, h: 24 });
      const near = Math.abs(h.hub - open) === 1 || Math.abs(h.hub - open) === 5;
      const dx = Math.cos(h.ang);
      const dy = Math.sin(h.ang);
      const lx = x0 + dx * 22;
      const ly = y0 + dy * 22;
      const vertical = Math.abs(dx) < 0.2;
      const name = NOME[h.hub - 1];
      let w = 18;
      let hh = 14;
      if (!near) {
        if (vertical) { w = ctx.measureText(name).width; hh = 30; }
        else {
          const mid = name.length / 2;
          let cut = -1;
          let best = 99;
          for (let i = 0; i < name.length; i++) if (name[i] === ' ' && Math.abs(i - mid) < best) { best = Math.abs(i - mid); cut = i; }
          const lines = cut > 0 ? [name.slice(0, cut), name.slice(cut + 1)] : [name];
          w = Math.max(...lines.map((l) => ctx.measureText(l).width));
          hh = 15 * (lines.length + 1);
        }
      }
      const x = vertical ? lx - w / 2 : dx > 0 ? lx : lx - w;
      const y = vertical ? (dy < 0 ? ly - hh : ly) : ly - hh / 2;
      out.push({ x: x - 4, y: y - 4, w: w + 8, h: hh + 8 });
    });
    return out;
  }

  // Rótulos das soluções: para cada eixo, abre o leque na órbita só o necessário
  // para que nenhum rótulo encoste em outro (folga de 12px), num nome de eixo ou
  // num nó; rótulo sem espaço na horizontal quebra em mais linhas. Nada sai do
  // canvas nem da janela.
  function layout() {
    if (!SUB.length || !layer.offsetWidth) return; // celular: leque padrão, lista no painel
    const PAD = 4;
    const GAP = 12;
    const cr = canvas.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    let minX = Math.max(PAD, 8 - cr.left);
    const maxR = Math.min(W - PAD, vw - 8 - cr.left);
    // desktop: coluna de texto à esquerda da rede — os rótulos guardam 24px dela
    const col = fig.closest('.casa__grid');
    const txt = col && col.querySelector('.casa__eixos');
    if (txt) {
      const tr = txt.getBoundingClientRect();
      if (tr.right <= cr.left + W / 2 && tr.bottom > cr.top) minX = Math.max(minX, tr.right + 24 - cr.left);
    }
    const cx = ox + S / 2;
    const cy = oy + S / 2;
    const hit = (a, b, m) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
    hubs.forEach((h) => {
      const subs = SUB[h.hub];
      if (!subs) return;
      const k = subs.length;
      const obst = hubBoxes(h.hub);
      // rede pequena (notebook baixo, 1024px): letra 1px menor
      layer.classList.toggle('is-compacta', S < 500);
      // largura natural e a da maior palavra (abaixo dela o nome vazaria do rótulo)
      ctx.font = `500 ${S < 500 ? 12 : 13}px "Hanken Grotesk", system-ui, sans-serif`;
      subs.forEach((s) => {
        s.link.style.maxWidth = '';
        s.mw = 0;
        s.nw = s.link.offsetWidth;
        s.ww = Math.ceil(Math.max(...s.link.textContent.split(/\s+/).map((wd) => ctx.measureText(wd).width))) + 16;
        s.lh1 = parseFloat(getComputedStyle(s.link).lineHeight) || 17.5;
      });
      const boxesAt = (step) => {
        setFan(h, step);
        return subs.map((s) => {
          const bx = cx + Math.cos(s.ang) * RO * S;
          const by = cy + Math.sin(s.ang) * RO * S;
          const c = Math.cos(s.ang);
          const put = (mode, shift) => {
            const avail = mode === 'r' ? maxR - (bx + 12) : mode === 'l' ? bx - 12 - minX : 2 * Math.min(bx - minX, maxR - bx);
            const mw = Math.max(76, s.ww, Math.floor(avail));
            if (s.mw !== mw) { s.mw = mw; s.link.style.maxWidth = mw < s.nw ? `${mw}px` : ''; }
            const w = s.link.offsetWidth;
            const hh = s.link.offsetHeight;
            let x = mode === 'r' ? bx + 12 : mode === 'l' ? bx - 12 - w : bx - w / 2;
            const up = Math.sin(s.ang) < 0;
            let y = mode === 'c' || shift ? (up ? by - 9 - hh : by + 9) : by - hh / 2;
            x = Math.max(minX, Math.min(maxR - w, x));
            y = Math.max(PAD, Math.min(H - PAD - hh, y));
            return { s, x, y, w, h: hh, bx, by };
          };
          const side = Math.abs(c) < 0.22 ? 'c' : c > 0 ? 'r' : 'l';
          const b = put(side);
          // sem espaço ao lado do nó (borda da janela ou coluna de texto): o nome
          // fica do mesmo lado, encostado na borda, e sobe ou desce para fora do nó
          const covers = side === 'r' ? b.x < bx + 8 : side === 'l' ? b.x + b.w > bx - 8 : false;
          return covers ? put(side, true) : b;
        });
      };
      // pontuação: cada colisão pesa 10; cada rótulo com mais de 2 linhas, 1
      const score = (boxes) => {
        let n = 0;
        boxes.forEach((A, i) => {
          for (let j = i + 1; j < boxes.length; j++) if (hit(A, boxes[j], GAP)) n += 10;
          obst.forEach((o) => { if (hit(A, o, 3)) n += 10; });
          boxes.forEach((B) => { if (hit(A, { x: B.bx - 8, y: B.by - 8, w: 16, h: 16 }, B === A ? 2 : 0)) n += 10; });
          if (A.h > A.s.lh1 * 2.5 + 8) n += 1;
        });
        return n;
      };
      let best = null;
      for (let step = k <= 3 ? 28 : k === 4 ? 24 : 20; ; step += 2) {
        const sc = score(boxesAt(step));
        if (!best || sc < best.sc) best = { step, sc };
        if (sc === 0 || k < 2 || ((step + 2) * (k - 1)) / 2 > 80) break;
      }
      const boxes = boxesAt(best.step);
      // sobra de sobreposição (tela muito pequena): empurra na vertical
      for (let it = 0; best.sc >= 10 && it < 60; it++) {
        let moved = false;
        boxes.sort((a, b) => a.y - b.y);
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const A = boxes[i];
            const B = boxes[j];
            if (A.x + A.w + GAP <= B.x || B.x + B.w + GAP <= A.x) continue;
            const ov = A.y + A.h + GAP / 2 - B.y;
            if (ov > 0) { A.y -= ov / 2; B.y += ov / 2; moved = true; }
          }
        }
        boxes.forEach((b) => { b.y = Math.max(PAD, Math.min(H - PAD - b.h, b.y)); });
        if (!moved) break;
      }
      boxes.forEach((b) => {
        b.s.lx = b.x;
        b.s.ly = b.y;
        b.s.lw = b.w;
        b.s.lh = b.h;
        b.s.link.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px)`;
      });
    });
  }

  // ponto onde a espinha nasce: a borda do anel central
  function spineFrom(e, rc) {
    const dx = e.b.px - center.px;
    const dy = e.b.py - center.py;
    const L = Math.hypot(dx, dy) || 1;
    return [center.px + (dx / L) * rc, center.py + (dy / L) * rc];
  }

  const sel = () => (ctrl ? ctrl.selected : 0);
  const hov = () => hoverHub || (ctrl ? ctrl.hover : 0);

  // eixo aberto: solução em foco > eixo sob o cursor (com 700 ms de tolerância
  // para o cursor atravessar até o rótulo) > eixo selecionado na lista
  function whichOpen() {
    const h = hot();
    if (h) return h.hub;
    const hv = hov();
    const now = performance.now();
    if (hv) { lastHover = hv; lingerUntil = now + 700; return hv; }
    if (lastHover && now < lingerUntil) return lastHover;
    return sel();
  }

  function syncOpen() {
    const n = whichOpen();
    const preview = !!(ctrl && !ctrl.touched && !hov() && !hot() && !focusInFig);
    layer.classList.toggle('is-preview', preview);
    if (n === open) return;
    open = n;
    groups.forEach((g, k) => { if (g) g.ul.classList.toggle('is-open', k === n); });
  }

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
    // metade dos sinais corre para as soluções do eixo aberto (energia na rede de produtos)
    const subs = SUB[open];
    if (subs && exp[open] > 0.9 && Math.random() < 0.5) {
      const s = subs[Math.floor(Math.random() * subs.length)];
      pulses.push({ e: { kind: 'sub', a: hubs[open - 1], b: s, hub: open }, t0: performance.now(), dur: 1100 + Math.random() * 600, back: false });
      return;
    }
    const pool = edges.filter((e) => (e.kind === 'spine' || e.kind === 'leaf') && (!open || Math.random() < 0.3 || e.hub === open));
    const e = pool[Math.floor(Math.random() * pool.length)];
    if (!e) return;
    // espinha: do centro para o eixo (sinal da casa); folha: do satélite para o eixo
    pulses.push({ e, t0: performance.now(), dur: 1400 + Math.random() * 900, back: e.kind === 'leaf' ? true : Math.random() < 0.25 });
  }

  // solução em foco: um sinal sai do núcleo, chega ao eixo e segue até o nó
  function pulseTo(s) {
    if (!running || !s) return;
    const now = performance.now();
    const spine = edges.find((e) => e.kind === 'spine' && e.hub === s.hub);
    if (spine) pulses.push({ e: spine, t0: now, dur: 650, back: false });
    pulses.push({ e: { kind: 'sub', a: hubs[s.hub - 1], b: s, hub: s.hub }, t0: now + 600, dur: 600, back: false });
  }

  function label(h, g) {
    const n = h.hub;
    const a = h.ang;
    const off = 22 + g * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const lx = h.px + dx * off;
    const ly = h.py + dy * off;
    const vertical = Math.abs(dx) < 0.2;
    const numFont = `500 11px "Hanken Grotesk", system-ui, sans-serif`;
    const nameFont = `400 12px "Hanken Grotesk", system-ui, sans-serif`;
    const lead = n === open;
    ctx.textBaseline = 'middle';
    const vis = 1 - exp[n]; // o eixo aberto cede o lugar à órbita das soluções
    if (vis < 0.02) return;
    const numA = (0.55 + 0.45 * Math.max(g, exp[n])) * vis;

    if (lite) {
      ctx.font = numFont;
      ctx.textAlign = vertical ? 'center' : dx > 0 ? 'left' : 'right';
      ctx.fillStyle = rgba(lead ? GOLD_HI : GOLD, numA);
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
    // com o nome oculto, o número fica no lugar do bloco inteiro (centro do rótulo)
    const shown = nameA[n] > 0.02 ? lines.length + 1 : 1;
    const total = lh * shown;
    let y0;
    if (vertical) y0 = dy < 0 ? ly - total + lh / 2 : ly + lh / 2;
    else y0 = ly - total / 2 + lh / 2;
    ctx.textAlign = vertical ? 'center' : dx > 0 ? 'left' : 'right';
    ctx.font = numFont;
    ctx.fillStyle = rgba(lead ? GOLD_HI : GOLD, numA);
    ctx.fillText('E' + n, lx, y0);
    if (shown === 1) return;
    ctx.font = nameFont;
    ctx.fillStyle = rgba(TEXT, 0.95 * nameA[n] * vis);
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], lx, y0 + lh * (i + 1));
  }

  function line(ax, ay, bx, by) {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  function draw(t, settle) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < nodes.length; i++) place(nodes[i], t);
    syncOpen();

    const act = sel();
    const hv = hov();
    const H0 = hot();
    for (let k = 1; k <= 6; k++) {
      const target = k === open ? 1 : k === hv ? 0.6 : 0;
      glow[k] = settle ? target : glow[k] + (target - glow[k]) * 0.1;
      const et = k === open ? 1 : 0;
      exp[k] = settle ? et : exp[k] + (et - exp[k]) * (et ? 0.075 : 0.12);
      if (Math.abs(exp[k] - et) < 0.002) exp[k] = et;
      // nome oculto no eixo aberto e nos dois vizinhos (as soluções ocupam esse espaço)
      const near = open && (k === open || Math.abs(k - open) === 1 || Math.abs(k - open) === 5);
      const nt = near ? 0 : 1;
      nameA[k] = settle ? nt : nameA[k] + (nt - nameA[k]) * 0.14;
    }
    const cx = center.px;
    const cy = center.py;
    const R = S * R_HUB;
    const R_CENTER = RING_F ? RING_F * S : lite ? 15 : 18;
    // deslocamento do paralaxe (a camada de links acompanha os nós)
    const pdx = ptr.x * 0.035 * 0.8 * S;
    const pdy = ptr.y * 0.035 * 0.8 * S;
    layer.style.transform = `translate(${pdx.toFixed(2)}px, ${pdy.toFixed(2)}px)`;

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
      grad.addColorStop(0.18, rgba(GOLD, 0.45));
      grad.addColorStop(0.22, rgba(GOLD, 0));
      grad.addColorStop(1, rgba(GOLD, 0));
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();
    }

    // ligações (satélites do eixo aberto recuam: a rede de soluções toma o lugar)
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const g = e.hub ? glow[e.hub] : 0;
      const quiet = e.kind !== 'spine' && e.hub ? 1 - exp[e.hub] * 0.85 : 1;
      let base;
      let width = 1;
      if (e.kind === 'spine') base = 0.16;
      else if (e.kind === 'leaf') { base = 0.1; width = 0.75; }
      else { base = 0.06; width = 0.75; }
      let alpha = (base + g * (e.kind === 'spine' ? 0.5 : e.kind === 'leaf' ? 0.25 : 0.08)) * quiet;
      if (ptr.on) {
        const mx = (e.a.px + e.b.px) / 2 - ptr.px;
        const my = (e.a.py + e.b.py) / 2 - ptr.py;
        const d = Math.hypot(mx, my);
        if (d < R * 0.6) alpha += (1 - d / (R * 0.6)) * 0.1 * quiet;
      }
      const col = e.kind === 'mesh' && !e.hub ? TEXT : GOLD;
      let ax = e.a.px;
      let ay = e.a.py;
      if (e.kind === 'spine') {
        // nasce na borda do anel central
        [ax, ay] = spineFrom(e, R_CENTER);
        if (g > 0.05) {
          ctx.lineWidth = 5;
          ctx.strokeStyle = rgba(GOLD, 0.08 * g);
          line(ax, ay, e.b.px, e.b.py);
        }
      }
      ctx.lineWidth = width;
      ctx.strokeStyle = rgba(col, alpha);
      line(ax, ay, e.b.px, e.b.py);
    }

    // nível 3: a órbita das soluções do eixo aberto — arco externo que some nas
    // pontas, filamentos curvos do eixo até cada nó (o nó viaja pela curva ao
    // abrir) e uma treliça fina entre a órbita e o anel dos eixos
    const ccx = ox + S / 2 + pdx;
    const ccy = oy + S / 2 + pdy;
    hubs.forEach((h) => {
      const e = exp[h.hub];
      const subs = SUB[h.hub];
      if (!subs || e < 0.01) return;
      const k = subs.length;
      const pull = (RO - R_HUB) * S * 0.6;
      const hx = h.px;
      const hy = h.py;
      const qx = hx + Math.cos(h.ang) * pull;
      const qy = hy + Math.sin(h.ang) * pull;
      subs.forEach((s) => {
        place(s, t);
        s.p = easeOut(clamp01(e * 1.45 - s.i * 0.08));
        s.qx = qx;
        s.qy = qy;
        const u = s.p;
        const v = 1 - u;
        s.dx = v * v * hx + 2 * v * u * qx + u * u * s.px;
        s.dy = v * v * hy + 2 * v * u * qy + u * u * s.py;
      });
      const a0 = subs[0].ang - 0.18;
      const a1 = subs[k - 1].ang + 0.18;
      const SEG = 32;
      ctx.lineWidth = 1;
      for (let j = 0; j < SEG; j++) {
        const f0 = j / SEG;
        const f1 = (j + 1) / SEG;
        ctx.strokeStyle = rgba(GOLD, 0.3 * Math.sin((Math.PI * (f0 + f1)) / 2) * e);
        ctx.beginPath();
        ctx.arc(ccx, ccy, RO * S, a0 + (a1 - a0) * f0, a0 + (a1 - a0) * f1);
        ctx.stroke();
      }
      for (let i = 0; i + 1 < k; i++) {
        const A = subs[i];
        const B = subs[i + 1];
        const pm = Math.min(A.p, B.p);
        if (pm < 0.02) continue;
        const am = (A.ang + B.ang) / 2;
        const rm = (RO - 0.05) * S;
        const mx = ccx + Math.cos(am) * rm;
        const my = ccy + Math.sin(am) * rm;
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = rgba(GOLD, 0.16 * pm);
        ctx.beginPath();
        ctx.moveTo(A.dx, A.dy);
        ctx.lineTo(mx, my);
        ctx.lineTo(B.dx, B.dy);
        ctx.stroke();
        ctx.fillStyle = rgba(GOLD, 0.5 * pm);
        ctx.beginPath();
        ctx.arc(mx, my, 1.3, 0, TAU);
        ctx.fill();
      }
      subs.forEach((s) => {
        const on = H0 === s;
        ctx.lineWidth = on ? 1.5 : 0.9;
        ctx.strokeStyle = rgba(on ? GOLD_HI : GOLD, (on ? 0.95 : 0.42) * Math.min(1, s.p * 1.4));
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(hx + (qx - hx) * s.p, hy + (qy - hy) * s.p, s.dx, s.dy);
        ctx.stroke();
      });
    });

    // pulsos
    const now = performance.now();
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      let k = (now - p.t0) / p.dur;
      if (k < 0) continue;
      if (k >= 1) { pulses.splice(i, 1); continue; }
      if (p.e.kind === 'sub' && exp[p.e.hub] < 0.5) { pulses.splice(i, 1); continue; }
      const fade = Math.sin(Math.PI * k);
      if (p.back) k = 1 - k;
      const [sx, sy] = p.e.kind === 'spine' ? spineFrom(p.e, R_CENTER) : [p.e.a.px, p.e.a.py];
      let x;
      let y;
      if (p.e.kind === 'sub') {
        const v = 1 - k;
        x = v * v * sx + 2 * v * k * p.e.b.qx + k * k * p.e.b.dx;
        y = v * v * sy + 2 * v * k * p.e.b.qy + k * k * p.e.b.dy;
      } else {
        x = sx + (p.e.b.px - sx) * k;
        y = sy + (p.e.b.py - sy) * k;
      }
      ctx.fillStyle = rgba(p.e.kind === 'sub' ? GOLD_HI : GOLD, fade * 0.9);
      ctx.beginPath();
      ctx.arc(x, y, p.e.kind === 'sub' ? 1.9 : 1.6, 0, TAU);
      ctx.fill();
    }

    // nós soltos
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.kind === 'sat' || n.kind === 'free') {
        const g = n.hub ? glow[n.hub] : 0;
        const quiet = n.kind === 'sat' ? 1 - exp[n.hub] * 0.85 : 1;
        const col = n.kind === 'sat' ? GOLD : TEXT;
        ctx.fillStyle = rgba(col, ((n.kind === 'sat' ? 0.28 : 0.2) + g * 0.3) * quiet);
        ctx.beginPath();
        ctx.arc(n.px, n.py, (n.kind === 'sat' ? 1.3 : 1.1) + g * 0.5, 0, TAU);
        ctx.fill();
      }
    }

    // nós das soluções: ponto, anel fino e halo na solução em foco
    hubs.forEach((h) => {
      const subs = SUB[h.hub];
      if (!subs || exp[h.hub] < 0.01) return;
      subs.forEach((s) => {
        if (s.p < 0.02) return;
        const on = H0 === s;
        if (on) {
          const halo = ctx.createRadialGradient(s.dx, s.dy, 0, s.dx, s.dy, 18);
          halo.addColorStop(0, rgba(GOLD_HI, 0.35));
          halo.addColorStop(1, rgba(GOLD_HI, 0));
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(s.dx, s.dy, 18, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = rgba(on ? GOLD_HI : GOLD, s.p);
        ctx.beginPath();
        ctx.arc(s.dx, s.dy, (on ? 3.2 : 2.6) * s.p, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(on ? GOLD_HI : GOLD, (on ? 0.7 : 0.3) * s.p);
        ctx.beginPath();
        ctx.arc(s.dx, s.dy, (on ? 9 : 6.5) * s.p, 0, TAU);
        ctx.stroke();
      });
    });

    // eixos: o mesmo dourado nos seis; o aberto acende, os outros ficam mais baixos
    hubs.forEach((h) => {
      const g = Math.max(glow[h.hub], exp[h.hub]);
      const lift = 0.55 + 0.45 * g;
      const halo = ctx.createRadialGradient(h.px, h.py, 0, h.px, h.py, 26 + g * 12);
      halo.addColorStop(0, rgba(GOLD_HI, 0.05 + g * 0.2));
      halo.addColorStop(1, rgba(GOLD_HI, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(h.px, h.py, 26 + g * 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(g > 0.5 ? GOLD_HI : GOLD, lift);
      ctx.beginPath();
      ctx.arc(h.px, h.py, 3.5 + g * 1.5, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(GOLD, (0.25 + g * 0.45) * lift);
      ctx.beginPath();
      ctx.arc(h.px, h.py, 10 + g * 3, 0, TAU);
      ctx.stroke();
      if (g > 0.05) {
        ctx.strokeStyle = rgba(GOLD, 0.16 * g);
        ctx.beginPath();
        ctx.arc(h.px, h.py, 17 + g * 3, 0, TAU);
        ctx.stroke();
      }
      label(h, g);
    });

    // centro com o rinoceronte: luz baixa por trás, dois anéis finos e um arco
    // virado para o eixo aberto (gira pelo caminho mais curto)
    if (RING_F) {
      const lit = ctx.createRadialGradient(cx, cy, R_CENTER * 0.2, cx, cy, R_CENTER * 1.15);
      lit.addColorStop(0, rgba(GOLD, 0.09));
      lit.addColorStop(1, rgba(GOLD, 0));
      ctx.fillStyle = lit;
      ctx.beginPath();
      ctx.arc(cx, cy, R_CENTER * 1.15, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(GOLD, 0.32);
      ctx.beginPath();
      ctx.arc(cx, cy, R_CENTER, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = rgba(GOLD, 0.1);
      ctx.beginPath();
      ctx.arc(cx, cy, R_CENTER + 8, 0, TAU);
      ctx.stroke();
      const lead = open || act;
      if (lead) {
        const target = -Math.PI / 2 + ((lead - 1) * Math.PI) / 3;
        if (arcAng === null || settle) arcAng = target;
        else arcAng += Math.atan2(Math.sin(target - arcAng), Math.cos(target - arcAng)) * 0.12;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgba(GOLD_HI, 0.9);
        ctx.beginPath();
        ctx.arc(cx, cy, R_CENTER, arcAng - 0.32, arcAng + 0.32);
        ctx.stroke();
      }
      return;
    }

    // centro sem o rinoceronte: anel com a marca
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
    // avanço automático até a primeira interação; cursor ou foco na rede pausa o relógio
    if (ctrl && !ctrl.touched) {
      const dt = lastT ? Math.min(t - lastT, 100) : 0;
      if (!pointerOnFig && !focusInFig) autoT += dt;
      if (autoT >= AUTO_MS) { autoT = 0; ctrl.select(ctrl.selected + 1, { user: false }); }
      ctrl.progress(autoT / AUTO_MS);
    }
    lastT = t;
    spawn(t);
    draw(t, false);
  }

  function still() { draw(0, true); }

  function start() {
    if (!inView || document.hidden) return;
    if (reduce.matches) { still(); return; }
    if (running) return;
    running = true;
    autoT = 0;
    lastT = 0;
    raf = requestAnimationFrame(loop);
    rino.play();
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    rino.pause();
    if (ctrl) ctrl.progress(null);
  }

  const redraw = () => { if (!running) still(); };
  if (ctrl) ctrl.on(redraw);

  // links das soluções: cursor e foco acendem o nó e a ligação correspondentes
  const subOf = (a) => {
    for (const subs of SUB) if (subs) for (const s of subs) if (s.link === a) return s;
    return null;
  };
  const setLinkHot = (s) => {
    if (linkHot === s) return;
    if (linkHot) linkHot.link.classList.remove('is-hot');
    linkHot = s;
    if (s) { s.link.classList.add('is-hot'); pulseTo(s); }
    redraw();
  };
  layer.addEventListener('pointerover', (e) => { const a = e.target.closest('.casa__sub'); if (a) setLinkHot(subOf(a)); });
  layer.addEventListener('pointerout', (e) => {
    const a = e.target.closest('.casa__sub');
    if (a && !a.contains(e.relatedTarget)) setLinkHot(null);
  });
  fig.addEventListener('focusin', (e) => {
    focusInFig = true;
    const a = e.target.closest && e.target.closest('.casa__sub');
    setLinkHot(a ? subOf(a) : null);
  });
  fig.addEventListener('focusout', (e) => {
    if (!fig.contains(e.relatedTarget)) { focusInFig = false; setLinkHot(null); }
  });

  function nearestHub(x, y) {
    let near = 0;
    let best = Math.max(24, S * 0.07);
    hubs.forEach((h) => {
      const d = Math.hypot(h.px - x, h.py - y);
      if (d < best) { best = d; near = h.hub; }
    });
    return near;
  }
  function nearestBead(x, y) {
    const subs = SUB[open];
    if (!subs || exp[open] < 0.9) return null;
    let near = null;
    let best = 14;
    subs.forEach((s) => {
      const d = Math.hypot(s.dx - x, s.dy - y);
      if (d < best) { best = d; near = s; }
    });
    return near;
  }

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
    const overLink = e.target.closest && e.target.closest('.casa__sub');
    const b = overLink ? null : nearestBead(x, y);
    if (b !== beadHot) {
      if (beadHot && beadHot !== linkHot) beadHot.link.classList.remove('is-hot');
      beadHot = b;
      if (b) { b.link.classList.add('is-hot'); pulseTo(b); }
    }
    const near = overLink || b ? 0 : nearestHub(x, y);
    fig.classList.toggle('is-pointer', !!(near || b));
    if (near !== hoverHub) {
      hoverHub = near;
      if (ctrl) ctrl.setHover(near);
    }
    redraw();
  }, { passive: true });
  fig.addEventListener('pointerleave', () => {
    pointerOnFig = false;
    ptr.on = false;
    ptr.tx = 0;
    ptr.ty = 0;
    ptr.px = -1e4;
    ptr.py = -1e4;
    if (beadHot) { if (beadHot !== linkHot) beadHot.link.classList.remove('is-hot'); beadHot = null; }
    if (hoverHub) {
      hoverHub = 0;
      if (ctrl) ctrl.setHover(0);
    }
    fig.classList.remove('is-pointer');
    redraw();
  });
  // clique (ou toque) num eixo abre as soluções dele; num nó de solução, segue o link
  fig.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.casa__sub')) return;
    const box = canvas.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const b = nearestBead(x, y);
    if (b) { b.link.click(); return; }
    const n = nearestHub(x, y);
    if (n && ctrl) ctrl.select(n);
  });

  build();
  if (!size()) return;
  still();
  fig.classList.add('is-live');
  // as larguras dos rótulos dependem da fonte da web
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layout(); redraw(); });

  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { if (size()) redraw(); }).observe(fig);
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

/* ---------- 1d. Celular: as soluções do eixo em lista, no painel do eixo ---------- */
function listasDoFoco() {
  document.querySelectorAll('.casa__foco-item').forEach((item, i) => {
    const eixo = SERVICOS[i];
    if (!eixo || item.querySelector('.casa__foco-subs')) return;
    const ul = document.createElement('ul');
    ul.className = 'casa__foco-subs';
    ul.setAttribute('aria-label', `Soluções do eixo E${eixo.n}`);
    ul.innerHTML = eixo.servicos.map((s) => `<li><a href="${s.href}">${s.nome}</a></li>`).join('');
    const cta = item.querySelector('.dmc-btn--link');
    item.insertBefore(ul, cta || null);
  });
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
listasDoFoco();
const fig = document.querySelector('[data-rede="casa"]');
if (fig) whenNear(fig, () => casa(fig, ctrl), '300px 0px');

const painel = document.getElementById('features');
if (painel) whenNear(painel, stages, '600px 0px');
