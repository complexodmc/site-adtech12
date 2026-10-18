// Geometria procedural das peças (SVG determinístico; sem imagem de terceiros).
// Cada .geo[data-geo] recebe um <svg> do tamanho da prancheta.
// Tipos: fios · aneis · margem (PL)  |  rede · mapa · limiar (BP)
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  function fade(svg, id, dir, stops) {
    const defs = svg.querySelector('defs') || svg.appendChild(el('defs', {}));
    const g = el('linearGradient', Object.assign({ id }, dir));
    stops.forEach(([o, a]) => g.appendChild(el('stop', { offset: o, 'stop-color': '#fff', 'stop-opacity': a })));
    const m = el('mask', { id: id + 'm', maskUnits: 'userSpaceOnUse' });
    m.appendChild(el('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: `url(#${id})` }));
    defs.appendChild(g); defs.appendChild(m);
    return `url(#${id}m)`;
  }

  const T = {
    // Competências que se conectam: nós ligados aos vizinhos mais próximos
    fios(svg, w, h, c, r, o) {
      const n = o.n || 34, y0 = (o.y0 ?? .08) * h, y1 = (o.y1 ?? .58) * h, x0 = (o.x0 ?? .04) * w, x1 = (o.x1 ?? 1.02) * w;
      const pts = [];
      for (let i = 0; i < n; i++) pts.push([x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)]);
      const g = el('g', { mask: fade(svg, 'ff' + o.seed, { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, 1], [.55, .9], [1, 0]]) });
      const seen = new Set();
      pts.forEach((p, i) => {
        const near = pts.map((q, j) => [j, Math.hypot(p[0] - q[0], p[1] - q[1])]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, o.k || 2);
        near.forEach(([j]) => { const key = i < j ? i + '-' + j : j + '-' + i; if (seen.has(key)) return; seen.add(key);
          g.appendChild(el('line', { x1: p[0], y1: p[1], x2: pts[j][0], y2: pts[j][1], stroke: c, 'stroke-opacity': .26, 'stroke-width': 1 })); });
      });
      pts.forEach((p, i) => {
        const hi = i % 7 === 0;
        if (hi) g.appendChild(el('circle', { cx: p[0], cy: p[1], r: 11, fill: 'none', stroke: c, 'stroke-opacity': .35, 'stroke-width': 1 }));
        g.appendChild(el('circle', { cx: p[0], cy: p[1], r: hi ? 3.6 : 2.2, fill: c, 'fill-opacity': hi ? .95 : .55 }));
      });
      svg.appendChild(g);
    },
    // Conhecimento que se amplia: anéis concêntricos + seis nós num anel
    aneis(svg, w, h, c, r, o) {
      const cx = (o.cx ?? .82) * w, cy = (o.cy ?? .2) * h, base = (o.base ?? .06) * Math.min(w, h);
      const g = el('g', {});
      for (let i = 0; i < (o.rings || 9); i++) {
        const rad = base * Math.pow(1.42, i);
        g.appendChild(el('circle', { cx, cy, r: rad, fill: 'none', stroke: c, 'stroke-opacity': Math.max(.05, .42 - i * .045), 'stroke-width': 1 }));
      }
      const rr = base * Math.pow(1.42, o.nodeRing ?? 4);
      for (let k = 0; k < 6; k++) {
        const a = (o.a0 ?? 2.2) + k * (Math.PI / 3);
        const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
        g.appendChild(el('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: c, 'stroke-opacity': .16, 'stroke-width': 1 }));
        g.appendChild(el('circle', { cx: x, cy: y, r: 4, fill: c, 'fill-opacity': .9 }));
      }
      g.appendChild(el('circle', { cx, cy, r: 5, fill: c }));
      svg.appendChild(g);
    },
    // Margem editorial (papel): colunas finas + pequeno cacho de nós no canto
    margem(svg, w, h, c, r, o) {
      const g = el('g', {});
      const cols = o.cols || 6, m = (o.m ?? 88);
      for (let i = 1; i < cols; i++) {
        const x = m + (w - 2 * m) * i / cols;
        g.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: h, stroke: '#0b0c0e', 'stroke-opacity': .045, 'stroke-width': 1 }));
      }
      svg.appendChild(g);
      T.fios(svg, w, h, c, r, Object.assign({ n: 14, x0: .58, x1: 1.0, y0: .03, y1: .26, k: 2 }, o));
    },
    // BP — rede que se abre: um nó de origem irradia para a direita
    rede(svg, w, h, c, r, o) {
      const ox = (o.ox ?? .12) * w, oy = (o.oy ?? .3) * h;
      const g = el('g', { mask: fade(svg, 'fr' + o.seed, { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, 1], [.6, .85], [1, 0]]) });
      const n = o.n || 30, pts = [];
      for (let i = 0; i < n; i++) {
        const a = -1.05 + r() * 2.1, d = (.25 + Math.pow(r(), .7) * .95) * w * (o.reach ?? .9);
        pts.push([ox + Math.cos(a) * d, oy + Math.sin(a) * d * (o.squash ?? .62)]);
      }
      pts.forEach((p, i) => {
        const gold = i % 5 === 0;
        g.appendChild(el('path', { d: `M${ox},${oy} Q${(ox + p[0]) / 2},${oy + (p[1] - oy) * .15} ${p[0]},${p[1]}`, fill: 'none', stroke: gold ? o.gold : c, 'stroke-opacity': gold ? .5 : .22, 'stroke-width': 1 }));
        g.appendChild(el('circle', { cx: p[0], cy: p[1], r: gold ? 3.6 : 2.2, fill: gold ? o.gold : c, 'fill-opacity': gold ? .95 : .6 }));
        if (gold) g.appendChild(el('circle', { cx: p[0], cy: p[1], r: 11, fill: 'none', stroke: o.gold, 'stroke-opacity': .35 }));
      });
      g.appendChild(el('circle', { cx: ox, cy: oy, r: 6, fill: o.gold }));
      g.appendChild(el('circle', { cx: ox, cy: oy, r: 18, fill: 'none', stroke: o.gold, 'stroke-opacity': .4 }));
      svg.appendChild(g);
    },
    // BP — mapa de relacionamento: malha de coordenadas + nó central ligado a seis nós
    // (estrela, nunca linha ascendente: nada que lembre gráfico de ganho)
    mapa(svg, w, h, c, r, o) {
      const step = o.step || 90, g = el('g', { mask: fade(svg, 'fm' + o.seed, { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, .9], [.5, .6], [1, .05]]) });
      for (let x = step / 2; x < w; x += step) g.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: h, stroke: c, 'stroke-opacity': .1 }));
      for (let y = step / 2; y < h; y += step) g.appendChild(el('line', { x1: 0, y1: y, x2: w, y2: y, stroke: c, 'stroke-opacity': .1 }));
      const snap = (v) => step / 2 + Math.round((v - step / 2) / step) * step;
      const cx = snap((o.cx ?? .7) * w), cy = snap((o.cy ?? .22) * h), R = (o.R ?? 2.4) * step;
      for (let i = 0; i < 26; i++) { const x = step / 2 + Math.floor(r() * (w / step)) * step, y = step / 2 + Math.floor(r() * (h / step)) * step;
        g.appendChild(el('circle', { cx: x, cy: y, r: 2.4, fill: c, 'fill-opacity': .5 })); }
      const nodes = [];
      for (let k = 0; k < 6; k++) { const a = (o.a0 ?? .35) + k * Math.PI / 3 + (r() - .5) * .5, d = R * (.75 + r() * .5);
        nodes.push([snap(cx + Math.cos(a) * d), snap(cy + Math.sin(a) * d * .8)]); }
      nodes.forEach((p, i) => { const q = nodes[(i + 1) % 6];
        g.appendChild(el('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: c, 'stroke-opacity': .22 }));
        g.appendChild(el('line', { x1: cx, y1: cy, x2: p[0], y2: p[1], stroke: o.gold, 'stroke-opacity': .5, 'stroke-width': 1.2 })); });
      nodes.forEach((p) => { g.appendChild(el('circle', { cx: p[0], cy: p[1], r: 5, fill: o.gold }));
        g.appendChild(el('circle', { cx: p[0], cy: p[1], r: 15, fill: 'none', stroke: o.gold, 'stroke-opacity': .4 })); });
      g.appendChild(el('circle', { cx, cy, r: 7, fill: c }));
      g.appendChild(el('circle', { cx, cy, r: 24, fill: 'none', stroke: c, 'stroke-opacity': .45 }));
      svg.appendChild(g);
    },
    // BP — limiar: dois planos e uma fresta de luz que se abre (com fade na base)
    limiar(svg, w, h, c, r, o) {
      const defs = svg.querySelector('defs') || svg.appendChild(el('defs', {}));
      const id = 'lg' + o.seed;
      const x = (o.x ?? .72) * w, top = (o.top ?? 0) * h, hh = (o.hh ?? .62) * h;
      const lg = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
      [[0, 0], [.18, .9], [.55, .55], [1, 0]].forEach(([of, a]) => lg.appendChild(el('stop', { offset: of, 'stop-color': o.gold, 'stop-opacity': a })));
      const rg = el('radialGradient', { id: id + 'r', cx: .5, cy: .3, r: .5 });
      [[0, .16], [1, 0]].forEach(([of, a]) => rg.appendChild(el('stop', { offset: of, 'stop-color': o.gold, 'stop-opacity': a })));
      const mg = el('linearGradient', { id: id + 'mg', x1: 0, y1: top, x2: 0, y2: top + hh * 1.15, gradientUnits: 'userSpaceOnUse' });
      [[0, 1], [.55, .85], [1, 0]].forEach(([of, a]) => mg.appendChild(el('stop', { offset: of, 'stop-color': '#fff', 'stop-opacity': a })));
      const mask = el('mask', { id: id + 'm', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: w, height: h });
      mask.appendChild(el('rect', { x: 0, y: 0, width: w, height: h, fill: `url(#${id}mg)` }));
      [lg, rg, mg, mask].forEach((n) => defs.appendChild(n));
      const g = el('g', { mask: `url(#${id}m)` });
      g.appendChild(el('ellipse', { cx: x, cy: top + hh * .35, rx: w * .32, ry: hh * .55, fill: `url(#${id}r)` }));
      g.appendChild(el('rect', { x: x - w * .5, y: top, width: w * .5 - 3, height: hh, fill: '#121416', 'fill-opacity': .55 }));
      g.appendChild(el('rect', { x: x + 3, y: top, width: w, height: hh, fill: '#1a1c1f', 'fill-opacity': .55 }));
      g.appendChild(el('rect', { x: x - 1.5, y: top, width: 3, height: hh, fill: `url(#${id})` }));
      for (let i = 1; i <= 5; i++) {
        const xx = x + i * (o.gap || 54);
        g.appendChild(el('line', { x1: xx, y1: top, x2: xx, y2: top + hh * (1 - i * .12), stroke: c, 'stroke-opacity': .2 - i * .025 }));
      }
      svg.appendChild(g);
    }
  };

  window.desenharGeo = function () {
    document.querySelectorAll('.geo[data-geo]').forEach((g, idx) => {
      const host = g.parentElement, w = host.offsetWidth, h = host.offsetHeight;
      const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, preserveAspectRatio: 'none' });
      const cs = getComputedStyle(host);
      const accRgb = cs.getPropertyValue('--acc-rgb').trim();
      const c = g.dataset.color || `rgb(${accRgb})`;
      const opts = JSON.parse(g.dataset.opts || '{}');
      opts.seed = opts.seed ?? (idx + 7);
      opts.gold = opts.gold || '#d6b069';
      T[g.dataset.geo](svg, w, h, c, rng(opts.seed * 9973), opts);
      g.innerHTML = ''; g.appendChild(svg);
    });
  };
  document.addEventListener('DOMContentLoaded', () => window.desenharGeo());
})();
