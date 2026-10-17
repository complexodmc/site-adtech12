/* =============================================================
   COMPLEXO DMC · FILME DO HERÓI — cena procedural determinística
   "A inteligência que conecta decisões, negócios e patrimônio."

   Canvas 2D com projeção 3D própria. Nada de mídia de terceiros:
   cidade, rede, organograma, lotes e rinoceronte nascem de código
   (o rinoceronte é triangulado a partir da máscara alfa do logotipo
   da própria DMC). Tempo é parâmetro — frame(t) é função pura de t,
   então o mesmo t sempre dá o mesmo quadro e t=L é igual a t=0.

   Roteiro (L = 12 s, loop):
     0–3    skyline abstrata ao entardecer, luz dourada rasante
     3–5    pontos acendem nas fachadas e viram conexões
     5–8    governança (organograma/holding), malha de lotes, fluxos
     8–11   a rede converge no rinoceronte low-poly
     11–12  dissolve de volta à cidade (emenda sem corte)

   API: await DMC_HERO.setup({ layout:'wide'|'tall', logo:dataURL })
        DMC_HERO.frame(t, { grain:true }) → PNG em base64
   ============================================================= */
(function () {
  'use strict';

  const L = 12;
  const TAU = Math.PI * 2;

  // ---------- paleta (complexodmc.com.br/assets/css/tokens.css) ----------
  const COL = {
    bg: [11, 12, 14],
    face: [10, 11, 13],
    horizon: [33, 29, 23],
    haze: [46, 39, 30],
    gold: [214, 176, 105],
    goldSoft: [231, 211, 177],
    goldDeep: [130, 96, 46],
    warm: [255, 243, 219],
    // acentos dos eixos E1..E6 (só toques)
    eixo: [[118, 183, 193], [136, 184, 157], [140, 174, 215], [212, 157, 127], [214, 151, 161], [179, 158, 219]]
  };
  const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a < 0 ? 0 : a > 1 ? 1 : +a.toFixed(4)) + ')';

  // ---------- matemática ----------
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, k) => a + (b - a) * k;
  const ramp = (t, a, b) => clamp((t - a) / (b - a));
  const smooth = (k) => k * k * (3 - 2 * k);
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }

  // Sol baixo à direita, levemente atrás da cidade: luz rasante nas
  // fachadas frontais e contraluz dourado nas quinas do lado do sol.
  const SUN = norm([0.95, 0.08, 0.30]);          // sombreamento: rasante nas fachadas frontais
  const SKY_SUN = norm([0.93, 0.09, -0.36]);     // brilho do céu: fora de quadro, à direita

  // ---------- enquadramentos ----------
  // Tudo que é "composição" é dado em fração de tela num instante de
  // âncora e projetado de volta ao mundo: o 9:16 é recomposto, não
  // recortado — cada formato tem câmera, cidade e rede próprias.
  const LAYOUTS = {
    wide: {
      W: 1920, H: 1080, s: 1,
      fov: 30, cx: 0.60, cy: 0.50,
      cam: { az0: -0.20, azA: 0.14, el0: 0.125, elA: 0.07, d0: 30, dA: 5.5, tgt: [3, 2.9, -7], tgtA: [0.9, 0.4, 0], phase: 0.5 },
      calm: 'left',
      nodeRegion: [0.47, 0.12, 0.97, 0.80],
      tree: { t: 6.8, k: 0.70, root: [0.725, 0.15], l1: [0.555, 0.895, 0.285], l2gap: 0.026, l2y: 0.415 },
      lots: { t: 6.8, quad: [0.52, 0.66, 0.97, 0.96] },
      rhino: { t: 10.0, k: 0.74, x0: 0.50, x1: 0.93, cy: 0.47 },
      dust: [0.42, 0.98, 0.06, 0.94]
    },
    tall: {
      W: 720, H: 1280, s: 0.92,
      fov: 40, cx: 0.50, cy: 0.40,
      cam: { az0: -0.12, azA: 0.11, el0: 0.15, elA: 0.07, d0: 26, dA: 4.5, tgt: [3.6, 3.8, -8.5], tgtA: [0.5, 0.4, 0], phase: 0.5 },
      calm: 'bottom',
      nodeRegion: [0.05, 0.10, 0.95, 0.56],
      tree: { t: 6.8, k: 0.66, root: [0.50, 0.075], l1: [0.10, 0.90, 0.165], l2gap: 0.045, l2y: 0.255 },
      lots: { t: 6.8, quad: [0.04, 0.42, 0.96, 0.60] },
      rhino: { t: 10.0, k: 0.70, x0: 0.06, x1: 0.94, cy: 0.33 },
      dust: [0.0, 1.0, 0.02, 0.62]
    }
  };

  let LAY, W, H, SC;
  let cvMain, ctx, cvCity, cctx, cvB1, b1, cvB2, b2, cvT1, t1, cvT2, t2, spriteGlow, spriteBokeh, grainPat;
  let CITY, NET, RH;

  // ---------- câmera ----------
  // Órbita fechada no espaço (azimute, distância, elevação): a câmera
  // percorre uma elipse e volta exatamente ao ponto de partida em t=L.
  // Larga e baixa no início (skyline), fechada e alta no meio (lotes,
  // organograma), recuando enquanto o rinoceronte se forma.
  function camAt(t) {
    const P = LAY.cam;
    const ph = TAU * (t - P.phase) / L;
    const az = P.az0 + P.azA * Math.sin(ph);
    const el = P.el0 - P.elA * Math.cos(ph);
    const d = P.d0 + P.dA * Math.cos(ph);
    const tgt = [P.tgt[0] + P.tgtA[0] * Math.sin(ph), P.tgt[1] - P.tgtA[1] * Math.cos(ph), P.tgt[2] + P.tgtA[2] * Math.sin(ph)];
    const pos = [tgt[0] + d * Math.cos(el) * Math.sin(az), tgt[1] + d * Math.sin(el), tgt[2] + d * Math.cos(el) * Math.cos(az)];
    const f = norm(sub(tgt, pos));
    const r = norm(cross(f, [0, 1, 0]));
    const u = cross(r, f);
    return { pos, f, r, u, d, tgt, focal: (H / 2) / Math.tan(LAY.fov * Math.PI / 360), cx: LAY.cx * W, cy: LAY.cy * H };
  }
  function proj(c, p) {
    const v = sub(p, c.pos);
    const z = dot(v, c.f);
    if (z < 0.5) return null;
    return [c.cx + dot(v, c.r) / z * c.focal, c.cy - dot(v, c.u) / z * c.focal, z];
  }
  function unproj(c, sx, sy, z) {
    const x = (sx - c.cx) / c.focal * z, y = -(sy - c.cy) / c.focal * z;
    return add(c.pos, add(mul(c.f, z), add(mul(c.r, x), mul(c.u, y))));
  }
  function groundHit(c, sx, sy) {
    const d = norm(add(c.f, add(mul(c.r, (sx - c.cx) / c.focal), mul(c.u, -(sy - c.cy) / c.focal))));
    if (d[1] >= -1e-4) return null;
    return add(c.pos, mul(d, -c.pos[1] / d[1]));
  }
  function horizonY(c) {
    const h = norm([c.f[0], 0, c.f[2]]);
    return c.cy - c.focal * dot(h, c.u) / dot(h, c.f);
  }
  const fogK = (z) => Math.exp(-Math.max(0, z - 24) / 24);

  // ---------- curvas de tempo (todas fecham em t = L) ----------
  const TL = {
    faces: (t) => 1 - 0.45 * smooth(ramp(t, 4.7, 6.3)) * (1 - smooth(ramp(t, 10.7, 12.0))),
    edges: (t) => 1 - 0.42 * smooth(ramp(t, 4.7, 6.3)) * (1 - smooth(ramp(t, 10.7, 12.0))),
    cityBlur: (t) => 1.5 * smooth(ramp(t, 5.0, 6.8)) * (1 - smooth(ramp(t, 10.8, 11.9))),
    sweep: (t) => lerp(1, 0, ramp(t, 0.2, 3.6)),                     // varredura de luz (fração)
    sweepOn: (t) => smooth(ramp(t, 0.0, 0.6)) * (1 - smooth(ramp(t, 3.0, 3.7))),
    lots: (t) => smooth(ramp(t, 4.9, 6.4)) * (1 - smooth(ramp(t, 8.3, 9.3))),
    flows: (t) => smooth(ramp(t, 5.5, 6.4)) * (1 - smooth(ramp(t, 8.0, 8.9))),
    tree: (t) => 1 - smooth(ramp(t, 8.2, 9.0)),
    rhinoEdges: (t) => 1 - smooth(ramp(t, 10.75, 11.45)),
    rhinoFaces: (t) => smooth(ramp(t, 8.9, 9.9)) * (1 - smooth(ramp(t, 10.7, 11.25))),
    rhinoSweep: (t) => ramp(t, 9.55, 10.75)
  };

  // =============================================================
  // CIDADE
  // =============================================================
  const STEP = 2.6, ROAD = 0.62;

  function makeBox(x0, x1, z0, z1, y0, y1) {
    const P = (x, y, z) => [x, y, z];
    const b = { x0, x1, z0, z1, y0, y1 };
    // faces laterais e teto: [cantos], normal
    b.faces = [
      { n: [1, 0, 0], q: [P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0)] },
      { n: [-1, 0, 0], q: [P(x0, y0, z1), P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1)] },
      { n: [0, 0, 1], q: [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)] },
      { n: [0, 0, -1], q: [P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0)] },
      { n: [0, 1, 0], q: [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)] }
    ];
    b.faces.forEach((f) => { f.c = mul(f.q.reduce((s, p) => add(s, p), [0, 0, 0]), 0.25); });
    // arestas: verticais (faces x,z) e do teto (face lateral + teto)
    b.verts = [
      { x: x1, z: z1, fa: 0, fb: 2 }, { x: x1, z: z0, fa: 0, fb: 3 },
      { x: x0, z: z1, fa: 1, fb: 2 }, { x: x0, z: z0, fa: 1, fb: 3 }
    ];
    b.roof = [
      { a: P(x1, y1, z0), b: P(x1, y1, z1), f: 0 }, { a: P(x0, y1, z1), b: P(x0, y1, z0), f: 1 },
      { a: P(x0, y1, z1), b: P(x1, y1, z1), f: 2 }, { a: P(x1, y1, z0), b: P(x0, y1, z0), f: 3 }
    ];
    return b;
  }

  function buildCity(rng) {
    const ca = camAt(LAY.lots.t);
    const [qx0, qy0, qx1, qy1] = LAY.lots.quad;
    const inQuad = (p) => {
      const s = proj(ca, p);
      return s && s[0] >= qx0 * W && s[0] <= qx1 * W && s[1] >= qy0 * H && s[1] <= qy1 * H;
    };
    const samples = [];
    for (let t = 0; t < L; t += 0.5) samples.push(camAt(t));
    const minDepth = (p) => samples.reduce((m, c) => Math.min(m, dot(sub(p, c.pos), c.f)), 1e9);

    // quarteirões do loteamento
    const lotBlocks = [];
    const blocks = [];
    for (let i = -10; i <= 9; i++) {
      for (let k = -12; k <= 5; k++) {
        const x0 = i * STEP + ROAD / 2, z0 = k * STEP + ROAD / 2, bs = STEP - ROAD;
        const ctr = [x0 + bs / 2, 0, z0 + bs / 2];
        const md = minDepth(ctr);
        if (md < 10) continue;
        const blk = { x0, z0, x1: x0 + bs, z1: z0 + bs, ctr, md };
        if (inQuad(ctr)) lotBlocks.push(blk); else blocks.push(blk);
      }
    }
    // centro do núcleo alto: atrás do loteamento
    let lc = [0, 0, 0];
    lotBlocks.forEach((b) => { lc = add(lc, b.ctr); });
    lc = lotBlocks.length ? mul(lc, 1 / lotBlocks.length) : [3, 0, -4];
    const HC = { x: lc[0] + 1.5, z: lc[2] - 7.5 };

    const heightAt = (x, z) => {
      const core = 8.4 * Math.exp(-(((x - HC.x) ** 2) / 18 + ((z - HC.z) ** 2) / 30));
      const east = 3.8 * Math.exp(-(((x - HC.x - 7) ** 2) / 26 + ((z - HC.z + 4) ** 2) / 44));
      const back = 3.2 * Math.exp(-(((x - HC.x + 7) ** 2) / 34 + ((z - HC.z + 9) ** 2) / 40));
      const h = 1.5 + core + east + back;
      const left = smooth(ramp(x, HC.x - 19, HC.x - 7));
      return h * (0.30 + 0.70 * left);
    };

    // quão dentro da área do texto (calma) o quarteirão cai, nos dois extremos da órbita
    const camsCalm = [camAt(0.5), camAt(6.5)];
    const calmness = (p) => camsCalm.reduce((m, cc) => {
      const s = proj(cc, p); if (!s) return m;
      const k = LAY.calm === 'left' ? smooth(ramp(W * 0.46 - s[0], 0, W * 0.12)) : smooth(ramp(s[1] - H * 0.6, 0, H * 0.08));
      return Math.max(m, k);
    }, 0);
    const towers = [];
    blocks.forEach((blk) => {
      if (rng() < calmness(blk.ctr) * 0.9) return;
      const r = rng();
      const bs = blk.x1 - blk.x0;
      let parts;
      if (r < 0.34) parts = [[0, 0, 1, 1]];
      else if (r < 0.62) parts = [[0, 0, 0.5, 1], [0.5, 0, 1, 1]];
      else if (r < 0.80) parts = [[0, 0, 1, 0.5], [0, 0.5, 1, 1]];
      else parts = [[0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]];
      parts.forEach(([u0, v0, u1, v1]) => {
        if (rng() < 0.10) return;
        const m = 0.08 + rng() * 0.16;
        const x0 = blk.x0 + u0 * bs + m, x1 = blk.x0 + u1 * bs - m;
        const z0 = blk.z0 + v0 * bs + m, z1 = blk.z0 + v1 * bs - m;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        let h = heightAt(cx, cz) * (0.55 + rng() * 0.7);
        // perto da câmera fica baixo: não pode tapar a cena no close
        h *= lerp(0.25, 1, smooth(ramp(blk.md, 12, 21)));
        h *= lerp(1, 0.35, calmness(blk.ctr));
        h = Math.max(0.35, h);
        const boxes = [];
        let setback = 0;
        if (h > 4.0 && rng() < 0.5) {
          setback = h * (0.6 + rng() * 0.16);
          const ins = 0.12 + rng() * 0.12;
          const wx = (x1 - x0) * ins, wz = (z1 - z0) * ins;
          boxes.push(makeBox(x0, x1, z0, z1, 0, setback));
          boxes.push(makeBox(x0 + wx, x1 - wx, z0 + wz, z1 - wz, setback, h));
        } else boxes.push(makeBox(x0, x1, z0, z1, 0, h));
        towers.push({ boxes, h, setback, cx, cz, mast: 0, blink: rng() });
      });
    });
    // antenas nos mais altos (a Paulista tem as suas)
    towers.slice().sort((a, b) => b.h - a.h).slice(0, 4).forEach((tw, i) => { tw.mast = 0.9 + 0.5 * ((i * 37) % 5) / 5; });

    // faixa distante: horizonte de prédios baixos dissolvidos na névoa
    const far = [];
    for (let i = -26; i <= 26; i++) {
      for (let k = 0; k < 3; k++) {
        const x = i * 1.9 + rng() * 1.2;
        const z = -36 - k * 7 - rng() * 5;
        const w = 0.8 + rng() * 1.2, d = 0.8 + rng() * 1.2;
        const leftK = smooth(ramp(x, HC.x - 30, HC.x - 6));
        const h = (0.8 + rng() * 2.6 + 2.4 * Math.exp(-((x - HC.x) ** 2) / 120)) * (0.45 + 0.55 * leftK);
        far.push(makeBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0, h));
      }
    }

    // malha de lotes: subdivide os quarteirões vazios
    const lotSegs = [];   // {a,b,blockEdge,delay}
    const lotFills = [];  // {q:[4 pts], col, a}
    const lotCorners = new Map();
    const addCorner = (x, z) => { const k = x.toFixed(2) + ',' + z.toFixed(2); if (!lotCorners.has(k)) lotCorners.set(k, [x, 0.02, z]); };
    const origin = lotBlocks.length ? lotBlocks.reduce((m, b) => (b.ctr[0] - b.ctr[2] < m[0] - m[2] ? b.ctr : m), lotBlocks[0].ctr) : [0, 0, 0];
    let tint = 0;
    lotBlocks.forEach((b) => {
      const y = 0.02;
      const dly = (Math.hypot(b.ctr[0] - origin[0], b.ctr[2] - origin[2])) / 14;
      const E = (x0, z0, x1, z1, edge) => lotSegs.push({ a: [x0, y, z0], b: [x1, y, z1], edge, delay: dly + rng() * 0.15 });
      E(b.x0, b.z0, b.x1, b.z0, 1); E(b.x1, b.z0, b.x1, b.z1, 1); E(b.x1, b.z1, b.x0, b.z1, 1); E(b.x0, b.z1, b.x0, b.z0, 1);
      [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]].forEach(([x, z]) => addCorner(x, z));
      // faixas ao longo de x, cada faixa cortada em lotes ao longo de z
      const nStrip = 2 + Math.floor(rng() * 2);
      const cuts = [b.x0];
      for (let i = 1; i < nStrip; i++) cuts.push(lerp(b.x0, b.x1, i / nStrip + (rng() - 0.5) * 0.12));
      cuts.push(b.x1);
      for (let i = 1; i < cuts.length - 1; i++) { E(cuts[i], b.z0, cuts[i], b.z1, 0); addCorner(cuts[i], b.z0); addCorner(cuts[i], b.z1); }
      for (let i = 0; i < cuts.length - 1; i++) {
        const nLot = 1 + Math.floor(rng() * 3);
        const zc = [b.z0];
        for (let j = 1; j < nLot; j++) zc.push(lerp(b.z0, b.z1, j / nLot + (rng() - 0.5) * 0.1));
        zc.push(b.z1);
        for (let j = 1; j < zc.length - 1; j++) { E(cuts[i], zc[j], cuts[i + 1], zc[j], 0); addCorner(cuts[i], zc[j]); addCorner(cuts[i + 1], zc[j]); }
        for (let j = 0; j < zc.length - 1; j++) {
          const q = [[cuts[i], y, zc[j]], [cuts[i + 1], y, zc[j]], [cuts[i + 1], y, zc[j + 1]], [cuts[i], y, zc[j + 1]]];
          const ctr = [(cuts[i] + cuts[i + 1]) / 2, y, (zc[j] + zc[j + 1]) / 2];
          // toques mínimos dos acentos: E1 petróleo (patrimonial) e E3 ardósia (imobiliário)
          let col = COL.gold, a = 0.035;
          const r = rng();
          if (r < 0.10) { col = COL.eixo[0]; a = 0.10; tint++; } else if (r < 0.18) { col = COL.eixo[2]; a = 0.09; tint++; }
          lotFills.push({ q, ctr, col, a, delay: dly + 0.3 + rng() * 0.3 });
        }
      }
    });

    return { towers, far, lotBlocks, lotSegs, lotFills, lotCorners: [...lotCorners.values()], HC, blocks };
  }

  // =============================================================
  // RINOCERONTE (a partir da máscara alfa do logotipo DMC)
  // =============================================================
  function delaunay(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(([x, y]) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); });
    const dm = Math.max(maxX - minX, maxY - minY) * 20, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    const P = pts.concat([[mx - dm, my - dm], [mx, my + dm], [mx + dm, my - dm]]);
    const n = pts.length;
    const circ = (a, b, c) => {
      const [ax, ay] = P[a], [bx, by] = P[b], [cx, cy] = P[c];
      const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
      const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
      return { a, b, c, x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
    };
    let tris = [circ(n, n + 1, n + 2)];
    for (let i = 0; i < n; i++) {
      const [x, y] = P[i];
      const keep = [], edges = new Map();
      tris.forEach((t) => {
        if ((x - t.x) ** 2 + (y - t.y) ** 2 < t.r2) {
          [[t.a, t.b], [t.b, t.c], [t.c, t.a]].forEach(([a, b]) => {
            const k = a < b ? a + ',' + b : b + ',' + a;
            edges.set(k, edges.has(k) ? null : [a, b]);
          });
        } else keep.push(t);
      });
      tris = keep;
      edges.forEach((e) => { if (e) tris.push(circ(e[0], e[1], i)); });
    }
    return tris.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c]);
  }

  async function buildRhinoMesh(logoUrl, rng) {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = logoUrl; });
    const MW = 640, MH = Math.round(img.height * MW / img.width);
    const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0, MW, MH);
    const px = c.getImageData(0, 0, MW, MH).data;
    const mask = new Uint8Array(MW * MH);
    let bx0 = MW, by0 = MH, bx1 = 0, by1 = 0;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (px[(y * MW + x) * 4 + 3] > 128) {
        mask[y * MW + x] = 1;
        bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
      }
    }
    const inM = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < MW && y < MH && mask[y * MW + x] === 1; };
    // máscara dilatada (2 px) para testar arestas de contorno
    const dil = new Uint8Array(MW * MH);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (!mask[y * MW + x]) continue;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < MW && Y < MH) dil[Y * MW + X] = 1;
      }
    }
    const inD = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < MW && y < MH && dil[y * MW + x] === 1; };

    // densidade maior na cabeça e nos chifres (onde mora a identidade)
    const sp = (x) => lerp(31, 18, smooth(ramp((x - bx0) / (bx1 - bx0), 0.58, 0.92)));
    const pts = [], isB = [];
    const cell = 8, grid = new Map();
    const key = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
    const near = (x, y, r) => {
      const c0 = Math.floor((x - r) / cell), c1 = Math.floor((x + r) / cell), r0 = Math.floor((y - r) / cell), r1 = Math.floor((y + r) / cell);
      for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) {
        const g = grid.get(i + ',' + j); if (!g) continue;
        for (const k of g) { const p = pts[k]; if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < r * r) return true; }
      }
      return false;
    };
    const put = (x, y, b) => { const k = key(x, y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(pts.length); pts.push([x, y]); isB.push(b); };

    // contorno: pontas (chifres, orelha, patas) primeiro — curvatura alta
    const bnd = [];
    for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
      const i = y * MW + x;
      if (mask[i] && (!mask[i - 1] || !mask[i + 1] || !mask[i - MW] || !mask[i + MW])) {
        // curvatura ~ quão "pouco preenchida" é a vizinhança 9x9
        let fill = 0;
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) fill += mask[(y + dy) * MW + (x + dx)] || 0;
        bnd.push([x, y, fill / 81]);
      }
    }
    shuffle(bnd, rng);
    bnd.sort((a, b) => a[2] - b[2]);   // pontas agudas (pouco preenchidas) entram primeiro
    bnd.forEach(([x, y]) => { if (!near(x, y, sp(x) * 0.52)) put(x, y, 1); });
    const nB = pts.length;
    const cand = [];
    for (let y = by0; y <= by1; y += 3) for (let x = bx0; x <= bx1; x += 3) if (inM(x, y)) cand.push([x + rng() * 2, y + rng() * 2]);
    shuffle(cand, rng);
    cand.forEach(([x, y]) => {
      const r = sp(x);
      if (near(x, y, r)) return;
      // longe do contorno o suficiente para não gerar lascas
      for (let k = 0; k < nB; k++) { const p = pts[k]; if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < (r * 0.72) ** 2) return; }
      put(x, y, 0);
    });

    // triangula e descarta o que cruza vãos (entre patas, sob a barriga)
    const tris = delaunay(pts).filter(([a, b, cc]) => {
      const A = pts[a], B = pts[b], C = pts[cc];
      if (!inM((A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3)) return false;
      for (const [P, Q] of [[A, B], [B, C], [C, A]]) {
        for (const k of [0.25, 0.5, 0.75]) if (!inD(lerp(P[0], Q[0], k), lerp(P[1], Q[1], k))) return false;
      }
      return true;
    });
    const used = new Uint8Array(pts.length);
    tris.forEach((t) => t.forEach((i) => { used[i] = 1; }));
    const remap = new Int32Array(pts.length).fill(-1);
    const V = [];
    pts.forEach((p, i) => { if (used[i]) { remap[i] = V.length; V.push({ x: p[0], y: p[1], b: isB[i] }); } });
    const F = tris.map((t) => t.map((i) => remap[i]));
    const ecount = new Map();
    F.forEach((t) => [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]].forEach(([a, b]) => {
      const k = a < b ? a + ',' + b : b + ',' + a; ecount.set(k, (ecount.get(k) || 0) + 1);
    }));
    const E = [...ecount.entries()].map(([k, n]) => { const [a, b] = k.split(',').map(Number); return { a, b, sil: n === 1 }; });

    // sombreado facetado: luminância e "verde-limão" do logotipo no centróide
    F.forEach((t, i) => {
      const cx = Math.round((V[t[0]].x + V[t[1]].x + V[t[2]].x) / 3), cy = Math.round((V[t[0]].y + V[t[1]].y + V[t[2]].y) / 3);
      const o = (cy * MW + cx) * 4;
      const r = px[o], g = px[o + 1], b = px[o + 2];
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const horn = g > 170 && r > 120 && b < 140 ? 1 : 0;
      F[i] = { v: t, lum, horn };
    });
    // distância ao contorno → volume (relevo de almofada)
    const bpts = V.filter((v) => v.b);
    let maxD = 1;
    V.forEach((v) => { v.dist = v.b ? 0 : Math.sqrt(bpts.reduce((m, p) => Math.min(m, (p.x - v.x) ** 2 + (p.y - v.y) ** 2), 1e12)); maxD = Math.max(maxD, v.dist); });
    V.forEach((v) => { v.bulge = Math.sqrt(v.dist / maxD); v.xn = (v.x - bx0) / (bx1 - bx0); });
    // ponta do chifre principal = vértice mais à direita e alto
    let tip = 0;
    V.forEach((v, i) => { if (v.x - v.y * 0.4 > V[tip].x - V[tip].y * 0.4) tip = i; });
    return { V, F, E, bbox: [bx0, by0, bx1, by1], tip };
  }

  function placeRhino(mesh) {
    const R = LAY.rhino;
    const c = camAt(R.t);
    const [bx0, by0, bx1, by1] = mesh.bbox;
    const scale = (R.x1 - R.x0) * W / (bx1 - bx0);
    const D = c.d * R.k;
    const bulgeW = 1.1;
    mesh.V.forEach((v) => {
      const sx = R.x0 * W + (v.x - bx0) * scale;
      const sy = R.cy * H + (v.y - (by0 + by1) / 2) * scale;
      v.p = unproj(c, sx, sy, D - bulgeW * v.bulge);
    });
    mesh.center = unproj(c, (R.x0 + R.x1) / 2 * W, R.cy * H, D);
    return mesh;
  }

  // =============================================================
  // ESTRUTURAS DO ATO 3 (holding, lotes, fluxos)
  // =============================================================
  function bezier(P0, P1, P2, P3, u) {
    const v = 1 - u;
    return add(add(mul(P0, v * v * v), mul(P1, 3 * v * v * u)), add(mul(P2, 3 * v * u * u), mul(P3, u * u * u)));
  }

  function buildStruct(rng, N) {
    const T = LAY.tree;
    const c = camAt(T.t);
    const D = c.d * T.k;
    const slots = [];
    const treeEdges = [];   // [pai, [filhos]]
    const root = slots.length;
    slots.push({ kind: 'root', p: unproj(c, T.root[0] * W, T.root[1] * H, D), size: 2.4 });
    const l1 = [];
    for (let i = 0; i < 6; i++) {
      const fx = lerp(T.l1[0], T.l1[1], i / 5);
      l1.push(slots.length);
      slots.push({ kind: 'l1', axis: i, fx, p: unproj(c, fx * W, T.l1[2] * H, D), size: 1.8 });
    }
    treeEdges.push([root, l1.slice()]);
    const l2 = [];
    l1.forEach((pi, i) => {
      const kids = [];
      for (let j = -1; j <= 1; j++) {
        const fx = slots[pi].fx + j * T.l2gap;
        kids.push(slots.length); l2.push(slots.length);
        slots.push({ kind: 'l2', axis: i, p: unproj(c, fx * W, T.l2y * H, D), size: 1.25 });
      }
      treeEdges.push([pi, kids]);
    });
    // cantos de lote
    const corners = shuffle(CITY.lotCorners.slice(), rng).slice(0, Math.min(CITY.lotCorners.length, Math.floor(N * 0.42)));
    corners.forEach((p) => slots.push({ kind: 'lot', p, size: 1.0 }));
    // fluxos: de cada folha do organograma até um lote, e entre lotes
    const fills = CITY.lotFills;
    const flows = [];
    const lotCtr = fills.length ? fills : [{ ctr: [3, 0, -2] }];
    l2.filter((_, i) => i % 3 === 1).forEach((si, i) => {
      const P0 = slots[si].p;
      const P3 = lotCtr[Math.floor(((i + 0.5) / 6) * lotCtr.length)].ctr;
      const dy = P0[1] - P3[1];
      flows.push({ P: [P0, add(P0, [0, -dy * 0.55, 0]), add(P3, [0, dy * 0.45, 0]), P3], from: si });
    });
    for (let i = 0; i < 4 && lotCtr.length > 3; i++) {
      const A = lotCtr[Math.floor(rng() * lotCtr.length)].ctr, B = lotCtr[Math.floor(rng() * lotCtr.length)].ctr;
      const dd = len(sub(A, B)); if (dd < 2) continue;
      flows.push({ P: [A, add(A, [0, dd * 0.35, 0]), add(B, [0, dd * 0.35, 0]), B], from: -1 });
    }
    // contas que correm nos fluxos (o resto dos nós)
    let k = 0;
    while (slots.length < N) {
      const f = k % flows.length;
      slots.push({ kind: 'bead', flow: f, u0: 0.04 + 0.42 * ((k * 0.618034) % 1), size: 0.75 });
      k++;
    }
    return { slots, treeEdges, flows, root, l1, l2 };
  }

  function slotPos(s, t) {
    if (s.kind !== 'bead') {
      if (s.kind === 'lot') return s.p;
      // o organograma respira de leve (periódico)
      return add(s.p, [0, 0.05 * Math.sin(TAU * t / L * 2 + s.p[0]), 0]);
    }
    const f = NET.struct.flows[s.flow];
    const u = clamp(s.u0 + 0.11 * (t - 4.8), 0, 0.985);
    return bezier(f.P[0], f.P[1], f.P[2], f.P[3], u);
  }

  // =============================================================
  // ASSINALAMENTO (Hungarian) — cada nó percorre o menor caminho
  // =============================================================
  function hungarian(cost) {
    const n = cost.length, INF = 1e30;
    const u = new Float64Array(n + 1), v = new Float64Array(n + 1), p = new Int32Array(n + 1), way = new Int32Array(n + 1);
    for (let i = 1; i <= n; i++) {
      p[0] = i; let j0 = 0;
      const minv = new Float64Array(n + 1).fill(INF), used = new Uint8Array(n + 1);
      do {
        used[j0] = 1; const i0 = p[j0]; let delta = INF, j1 = 0;
        const row = cost[i0 - 1];
        for (let j = 1; j <= n; j++) {
          if (used[j]) continue;
          const cur = row[j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= n; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const a = new Int32Array(n);
    for (let j = 1; j <= n; j++) a[p[j] - 1] = j - 1;
    return a;
  }

  // =============================================================
  // REDE
  // =============================================================
  function buildNet(rng) {
    const N = RH.V.length;
    // nós de fachada (janelas que acendem) no recorte de ação do formato
    const c4 = camAt(4.0);
    const [rx0, ry0, rx1, ry1] = LAYOUTS[LAY.name].nodeRegion;
    const cand = [];
    CITY.towers.forEach((tw, ti) => {
      if (tw.h < 2.2) return;
      const bx = tw.boxes[tw.boxes.length - 1];
      tw.boxes.forEach((b) => {
        b.faces.forEach((f, fi) => {
          if (fi === 4) return;
          if (dot(f.n, sub(c4.pos, f.c)) <= 0) return;
          const nFl = Math.floor((b.y1 - b.y0) / 0.32);
          for (let k = 1; k < nFl; k++) {
            const y = b.y0 + k * 0.32;
            for (const uu of [0.22, 0.5, 0.78]) {
              const A = f.q[0], B = f.q[1];
              const p = [lerp(A[0], B[0], uu), y, lerp(A[2], B[2], uu)];
              const s = proj(c4, p);
              if (!s || s[0] < rx0 * W || s[0] > rx1 * W || s[1] < ry0 * H || s[1] > ry1 * H) continue;
              cand.push({ p, s, w: (y / 9) + 0.2 * (fi === 2 ? 1 : 0.6), ti, roof: false });
            }
          }
        });
      });
      // cantos de cobertura dos mais altos (base dos arcos)
      if (tw.h > 4.5) {
        const p = [bx.x1, bx.y1, bx.z1];
        const s = proj(c4, p);
        if (s && s[0] > rx0 * W && s[0] < rx1 * W && s[1] > ry0 * H && s[1] < ry1 * H) cand.push({ p, s, w: 3, ti, roof: true });
      }
    });
    // amostragem ponderada com espaçamento mínimo de tela
    shuffle(cand, rng);
    cand.sort((a, b) => b.w * (0.5 + rng()) - a.w * (0.5 + rng()));
    const city = [];
    const minSp = 13 * SC;
    for (const cd of cand) {
      if (city.length >= N) break;
      if (city.some((o) => (o.s[0] - cd.s[0]) ** 2 + (o.s[1] - cd.s[1]) ** 2 < minSp * minSp)) continue;
      city.push(cd);
    }
    while (city.length < N) city.push(cand[Math.floor(rng() * cand.length)]);

    const struct = buildStruct(rng, N);
    NET = { struct };
    // cidade → estrutura
    const Sp = struct.slots.map((s) => slotPos(s, 6.4));
    const cost1 = city.map((cd) => Sp.map((p) => { const d = sub(cd.p, p); return dot(d, d); }));
    const sig = hungarian(cost1);
    // estrutura → rinoceronte
    const Sp2 = struct.slots.map((s) => slotPos(s, 8.4));
    const cost2 = city.map((cd, i) => RH.V.map((v) => { const d = sub(Sp2[sig[i]], v.p); return dot(d, d); }));
    const rho = hungarian(cost2);

    // ondulação: as janelas acendem a partir da torre mais alta
    const tall = city.reduce((m, cd) => (cd.p[1] > m.p[1] ? cd : m), city[0]);
    const maxDs = city.reduce((m, cd) => Math.max(m, Math.hypot(cd.s[0] - tall.s[0], cd.s[1] - tall.s[1])), 1);
    const nodes = city.map((cd, i) => {
      const slot = struct.slots[sig[i]];
      const rv = RH.V[rho[i]];
      const ds = Math.hypot(cd.s[0] - tall.s[0], cd.s[1] - tall.s[1]) / maxDs;
      return {
        i, city: cd.p, roof: cd.roof, slot, si: sig[i], rv, ri: rho[i],
        appear: 2.85 + 1.05 * ds + 0.1 * rng(),
        go1: 4.5 + 0.45 * rng() + ({ root: 0, l1: 0.05, l2: 0.1, lot: 0.15, bead: 0.2 })[slot.kind],
        go2: 7.55 + 0.5 * rv.xn + 0.15 * rng(),
        out: 10.85 + 0.42 * rng(),
        swirl: (rng() - 0.5) * 2,
        lift: 0.4 + rng() * 1.2,
        ph: rng() * TAU,
        tw: 1 + Math.floor(rng() * 3)
      };
    });
    const bySlot = new Int32Array(N), byRv = new Int32Array(N);
    nodes.forEach((n) => { bySlot[n.si] = n.i; byRv[n.ri] = n.i; });

    // conexões na cidade: 2 vizinhos mais próximos + arcos entre coberturas
    const cityEdges = [];
    const seen = new Set();
    nodes.forEach((a) => {
      const ds = nodes.map((b) => ({ b, d: a === b ? 1e9 : len(sub(a.city, b.city)) })).sort((x, y) => x.d - y.d);
      ds.slice(0, 2).forEach(({ b, d }) => {
        if (d > 4.2) return;
        const k = Math.min(a.i, b.i) + ',' + Math.max(a.i, b.i);
        if (seen.has(k)) return; seen.add(k);
        cityEdges.push({ a: a.i, b: b.i, arc: 0, pulse: rng() < 0.35 ? 3.7 + rng() * 0.8 : -1 });
      });
    });
    const roofs = nodes.filter((n) => n.roof).sort((a, b) => b.city[1] - a.city[1]).slice(0, 6);
    let nArc = 0;
    for (let i = 0; i < roofs.length && nArc < 5; i++) for (let j = i + 1; j < roofs.length && nArc < 5; j++) {
      const d = len(sub(roofs[i].city, roofs[j].city));
      if (d > 3.5 && d < 12 && rng() < 0.6) { cityEdges.push({ a: roofs[i].i, b: roofs[j].i, arc: d * 0.22, pulse: 3.6 + rng() * 0.9 }); nArc++; }
    }
    NET = { struct, nodes, bySlot, byRv, cityEdges };
  }

  // estado de um nó no instante t
  function nodeState(n, t) {
    const k1 = ease(ramp(t, n.go1, n.go1 + 1.25));
    const k2 = ease(ramp(t, n.go2, n.go2 + 1.35));
    const k3 = ease(ramp(t, n.out, n.out + 0.7));
    let p;
    if (t < n.go2) {
      const ps = slotPos(n.slot, t);
      p = lerp3(n.city, ps, k1);
      p = add(p, [0, Math.sin(Math.PI * k1) * n.lift, 0]);
    } else if (t < n.out) {
      const ps = slotPos(n.slot, Math.min(t, n.go2 + 0.2));
      const pr = add(n.rv.p, [0, 0.035 * Math.sin(TAU * t / L * 2 + n.ph), 0]);
      p = lerp3(ps, pr, k2);
      // redemoinho leve na convergência
      const side = cross(norm(sub(pr, ps)), [0, 1, 0]);
      p = add(p, mul(side, Math.sin(Math.PI * k2) * n.swirl * 1.3));
    } else {
      const pr = n.rv.p;
      const pd = add(lerp3(pr, n.city, 0.22), [0, -0.6, 0]);
      p = lerp3(pr, pd, k3);
    }
    const a = smooth(ramp(t, n.appear, n.appear + 0.5)) * (1 - smooth(ramp(t, n.out, n.out + 0.7)));
    // fração "na estrutura" e "no rinoceronte" (para arestas)
    const atS = smooth(ramp(k1, 0.72, 1)) * (1 - smooth(ramp(k2, 0, 0.25)));
    const atR = smooth(ramp(k2, 0.6, 1));
    const atC = 1 - smooth(ramp(k1, 0, 0.18));
    const sz = lerp(lerp(1.0, n.slot.size, k1), n.rv.b ? 1.05 : 0.9, k2);
    const tw = 0.86 + 0.14 * Math.sin(TAU * t / L * n.tw * 3 + n.ph);
    return { p, a: a * tw, atS, atR, atC, sz, k1, k2 };
  }

  // =============================================================
  // DESENHO
  // =============================================================
  function makeSprite(size, stops) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return cv;
  }

  function drawSky(g, c, t) {
    const hy = horizonY(c);
    // céu
    let gr = g.createLinearGradient(0, 0, 0, Math.max(hy, 1));
    gr.addColorStop(0, rgba([9, 10, 12], 1));
    gr.addColorStop(0.55, rgba([16, 16, 17], 1));
    gr.addColorStop(1, rgba([44, 37, 28], 1));
    g.fillStyle = gr; g.fillRect(0, 0, W, Math.max(0, hy) + 1);
    // chão
    gr = g.createLinearGradient(0, hy, 0, H);
    gr.addColorStop(0, rgba([30, 26, 21], 1));
    gr.addColorStop(0.22, rgba([15, 15, 15], 1));
    gr.addColorStop(1, rgba([8, 9, 10], 1));
    g.fillStyle = gr; g.fillRect(0, Math.max(0, hy), W, H);
    // brilho do sol abaixo do horizonte, à direita
    const sd = dot(SKY_SUN, c.f);
    const sx = sd > 0.05 ? c.cx + c.focal * dot(SKY_SUN, c.r) / sd : W * 1.2;
    const gx = Math.min(sx, W * 1.15);
    const R = Math.max(W, H) * 0.95;
    gr = g.createRadialGradient(gx, hy, 0, gx, hy, R);
    gr.addColorStop(0, rgba(COL.gold, 0.64));
    gr.addColorStop(0.14, rgba(COL.gold, 0.32));
    gr.addColorStop(0.42, rgba(COL.gold, 0.085));
    gr.addColorStop(1, rgba(COL.gold, 0));
    g.save(); g.translate(gx, hy); g.scale(1, 0.42); g.translate(-gx, -hy);
    g.fillStyle = gr; g.fillRect(-W, -H * 2, W * 3, H * 5);
    g.restore();
    return hy;
  }

  function drawStreets(g, c) {
    g.lineWidth = 0.8 * SC;
    const seg = 3;
    const line = (A, B, a0) => {
      const n = Math.max(1, Math.ceil(len(sub(B, A)) / seg));
      for (let i = 0; i < n; i++) {
        const p = lerp3(A, B, i / n), q = lerp3(A, B, (i + 1) / n);
        const sp = proj(c, p), sq = proj(c, q);
        if (!sp || !sq) continue;
        const a = a0 * fogK((sp[2] + sq[2]) / 2);
        if (a < 0.004) continue;
        g.strokeStyle = rgba(COL.gold, a);
        g.beginPath(); g.moveTo(sp[0], sp[1]); g.lineTo(sq[0], sq[1]); g.stroke();
      }
    };
    for (let i = -14; i <= 13; i++) line([i * STEP, 0, -64], [i * STEP, 0, 14], 0.05);
    for (let k = -24; k <= 5; k++) line([-36, 0, k * STEP], [36, 0, k * STEP], 0.042);
  }

  function drawLots(g, c, t) {
    const v = TL.lots(t);
    if (v <= 0.001) return;
    // preenchimentos (acento mínimo em poucos lotes)
    CITY.lotFills.forEach((f) => {
      const k = smooth(ramp(t, 4.9 + f.delay + 0.5, 4.9 + f.delay + 1.3)) * v;
      if (k <= 0.001) return;
      const sp = f.q.map((p) => proj(c, p));
      if (sp.some((s) => !s)) return;
      g.fillStyle = rgba(f.col, f.a * k);
      g.beginPath(); sp.forEach((s, i) => (i ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]))); g.closePath(); g.fill();
    });
    // divisas desenhadas progressivamente
    CITY.lotSegs.forEach((s) => {
      const k = smooth(ramp(t, 4.9 + s.delay, 4.9 + s.delay + 0.8));
      if (k <= 0.001) return;
      const A = proj(c, s.a), B = proj(c, lerp3(s.a, s.b, k));
      if (!A || !B) return;
      g.strokeStyle = rgba(COL.gold, (s.edge ? 0.42 : 0.24) * v * fogK(A[2]));
      g.lineWidth = (s.edge ? 1.0 : 0.75) * SC;
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
    });
  }

  function drawBox(g, c, b, opts) {
    const { faceA, edgeA, sweepX, sweepOn, simple } = opts;
    const vis = b.faces.map((f) => dot(f.n, sub(c.pos, f.c)) > 0);
    const hf = smooth(ramp(b.y1, 1.0, 9.5));
    const ctrZ = dot(sub([(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2], c.pos), c.f);
    const fk = fogK(ctrZ);
    const sweep = sweepOn > 0 ? 1 + 1.5 * sweepOn * Math.exp(-((((b.x0 + b.x1) / 2 - sweepX) / 2.4) ** 2)) : 1;
    const baseCol = mixc(COL.face, COL.haze, (1 - fk) * 0.8);
    b.faces.forEach((f, fi) => {
      if (!vis[fi]) return;
      const sp = f.q.map((p) => proj(c, p));
      if (sp.some((s) => !s)) return;
      g.beginPath(); sp.forEach((s, i) => (i ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]))); g.closePath();
      g.fillStyle = rgba(baseCol, faceA);
      g.fill();
      if (simple) return;
      // luz rasante: gradiente da quina de sombra (baixo) à quina do sol (alto)
      const lit = fi === 4 ? 0.35 : clamp(dot(f.n, SUN) * 0.55 + 0.42);
      const aMax = 0.44 * lit * hf * (0.35 + 0.65 * fk) * faceA * sweep;
      if (aMax < 0.004) return;
      let gr;
      if (fi === 4) { g.fillStyle = rgba(COL.gold, aMax * 0.5); g.fill(); return; }
      // ponto escuro: base do lado oposto ao sol; claro: topo do lado do sol
      const sunSideIdx = dot(sub(f.q[1], f.q[0]), SUN) > 0 ? 1 : 0;
      const dark = sp[sunSideIdx === 1 ? 0 : 1];
      const lite = sp[sunSideIdx === 1 ? 2 : 3];
      gr = g.createLinearGradient(dark[0], dark[1], lite[0], lite[1]);
      gr.addColorStop(0, rgba(COL.gold, 0));
      gr.addColorStop(0.6, rgba(COL.gold, aMax * 0.25));
      gr.addColorStop(1, rgba(COL.gold, aMax));
      g.fillStyle = gr; g.fill();
      // pavimentos: fios horizontais que só aparecem onde a luz pega
      if (lit > 0.45 && ctrZ < 46 && b.y1 > 2.6) {
        const yA = Math.max(b.y0 + 0.3, b.y1 * 0.45);
        const A0 = f.q[0], B0 = f.q[1];
        g.lineWidth = 0.7 * SC;
        for (let y = Math.ceil(yA / 0.34) * 0.34; y < b.y1 - 0.1; y += 0.34) {
          const k = (y - yA) / (b.y1 - yA);
          const a = aMax * 0.9 * k;
          if (a < 0.006) continue;
          const pa = proj(c, [A0[0], y, A0[2]]), pb = proj(c, [B0[0], y, B0[2]]);
          if (!pa || !pb) continue;
          const lg = g.createLinearGradient(pa[0], pa[1], pb[0], pb[1]);
          const s0 = sunSideIdx === 1 ? 0 : a, s1 = sunSideIdx === 1 ? a : 0;
          lg.addColorStop(0, rgba(COL.goldSoft, s0)); lg.addColorStop(1, rgba(COL.goldSoft, s1));
          g.strokeStyle = lg;
          g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.stroke();
        }
      }
    });
    if (edgeA <= 0.002) return;
    // quinas verticais: contraluz forte do lado do sol, quase nada na base
    b.verts.forEach((e) => {
      if (!vis[e.fa] && !vis[e.fb]) return;
      const A = proj(c, [e.x, b.y0, e.z]), B = proj(c, [e.x, b.y1, e.z]);
      if (!A || !B) return;
      const rim = Math.max(dot(b.faces[e.fa].n, SUN), dot(b.faces[e.fb].n, SUN), 0);
      const sil = vis[e.fa] !== vis[e.fb] ? 1 : 0.75;
      const top = edgeA * (0.2 + 1.0 * rim) * (0.38 + 0.62 * hf) * (0.32 + 0.68 * fk) * sweep * sil;
      if (top < 0.004) return;
      const gr = g.createLinearGradient(A[0], A[1], B[0], B[1]);
      gr.addColorStop(0, rgba(COL.gold, top * 0.05));
      gr.addColorStop(1, rgba(rim > 0.5 ? COL.goldSoft : COL.gold, top));
      g.strokeStyle = gr;
      g.lineWidth = (rim > 0.5 ? 1.3 : 0.9) * SC;
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
    });
    b.roof.forEach((e) => {
      if (!vis[e.f] && !vis[4]) return;
      const A = proj(c, e.a), B = proj(c, e.b);
      if (!A || !B) return;
      const rim = Math.max(dot(b.faces[e.f].n, SUN), 0);
      const a = edgeA * (0.26 + 0.85 * rim) * (0.32 + 0.68 * hf) * (0.32 + 0.68 * fk) * sweep;
      if (a < 0.004) return;
      g.strokeStyle = rgba(rim > 0.5 ? COL.goldSoft : COL.gold, a);
      g.lineWidth = 0.9 * SC;
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
    });
  }

  function drawCity(g, c, t) {
    drawSky(g, c, t);
    // horizonte distante, só silhueta
    const faceA = TL.faces(t), edgeA = TL.edges(t);
    const farSorted = CITY.far.map((b) => ({ b, d: len(sub([(b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2], c.pos)) })).sort((x, y) => y.d - x.d);
    farSorted.forEach(({ b }) => drawBox(g, c, b, { faceA: 1, edgeA: 0.4, sweepX: 0, sweepOn: 0, simple: true }));
    // linha de névoa sobre o horizonte distante
    const hy = horizonY(c);
    const gr = g.createLinearGradient(0, hy - 90 * SC, 0, hy + 30 * SC);
    gr.addColorStop(0, rgba(COL.horizon, 0));
    gr.addColorStop(0.75, rgba(COL.haze, 0.9));
    gr.addColorStop(1, rgba(COL.horizon, 0));
    g.fillStyle = gr; g.fillRect(0, hy - 90 * SC, W, 120 * SC);

    drawStreets(g, c);
    drawLots(g, c, t);

    const sweepX = lerp(CITY.HC.x + 18, CITY.HC.x - 16, 1 - TL.sweep(t));
    const sweepOn = TL.sweepOn(t);
    const towers = CITY.towers.map((tw) => ({ tw, d: Math.hypot(tw.cx - c.pos[0], tw.cz - c.pos[2]) })).sort((x, y) => y.d - x.d);
    towers.forEach(({ tw }) => {
      const order = tw.boxes.length > 1 && c.pos[1] < tw.setback ? tw.boxes.slice().reverse() : tw.boxes;
      order.forEach((b) => drawBox(g, c, b, { faceA, edgeA, sweepX, sweepOn }));
      if (tw.mast) {
        const top = tw.boxes[tw.boxes.length - 1];
        const mx = (top.x0 + top.x1) / 2, mz = (top.z0 + top.z1) / 2;
        const A = proj(c, [mx, tw.h, mz]), B = proj(c, [mx, tw.h + tw.mast, mz]);
        if (A && B) {
          g.strokeStyle = rgba(COL.gold, 0.38 * edgeA * fogK(A[2]));
          g.lineWidth = 0.9 * SC;
          g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
          // luz de obstáculo: pisca devagar (6 ciclos por loop)
          const bl = Math.pow(Math.max(0, Math.sin(TAU * (t / L * 6 + tw.blink))), 12);
          if (bl > 0.01) {
            const r = (10 + 6 * bl) * SC;
            g.globalAlpha = 0.55 * bl * edgeA;
            g.drawImage(spriteGlow, B[0] - r, B[1] - r, r * 2, r * 2);
            g.globalAlpha = 1;
          }
        }
      }
    });
  }

  function drawNet(g, c, t) {
    const nodes = NET.nodes;
    const st = nodes.map((n) => nodeState(n, t));
    const sp = st.map((s) => proj(c, s.p));
    const refZ = c.d;
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';

    // --- conexões da cidade (ato 2)
    NET.cityEdges.forEach((e) => {
      const A = st[e.a], B = st[e.b];
      const t0 = Math.max(nodes[e.a].appear, nodes[e.b].appear) + 0.2;
      const k = smooth(ramp(t, t0, t0 + 0.6));
      const v = k * Math.min(A.atC, B.atC) * Math.min(A.a, B.a);
      if (v < 0.004) return;
      const pa = A.p, pb = B.p;
      const n = e.arc ? 20 : 1;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = (i / n) * k;
        const q = lerp3(pa, pb, u);
        if (e.arc) q[1] += Math.sin(Math.PI * u / Math.max(k, 1e-3) * k) * e.arc;
        pts.push(proj(c, q));
      }
      if (pts.some((p) => !p)) return;
      g.strokeStyle = rgba(COL.gold, (e.arc ? 0.24 : 0.4) * v);
      g.lineWidth = (e.arc ? 0.9 : 0.8) * SC;
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
      // pulso de dado percorrendo a conexão
      if (e.pulse > 0) {
        const u = ramp(t, e.pulse, e.pulse + 0.9);
        if (u > 0 && u < 1 && u < k) {
          const q = lerp3(pa, pb, u);
          if (e.arc) q[1] += Math.sin(Math.PI * u) * e.arc;
          const s = proj(c, q);
          if (s) {
            const r = 9 * SC;
            g.globalAlpha = 0.8 * v * Math.sin(Math.PI * u);
            g.drawImage(spriteGlow, s[0] - r, s[1] - r, r * 2, r * 2);
            g.globalAlpha = 1;
          }
        }
      }
    });

    // --- fluxos (ato 3): trilhas tracejadas
    const fv = TL.flows(t);
    if (fv > 0.004) {
      g.setLineDash([2 * SC, 7 * SC]);
      g.lineWidth = 0.8 * SC;
      NET.struct.flows.forEach((f, fi) => {
        const k = smooth(ramp(t, 5.5 + (fi % 6) * 0.07, 6.5 + (fi % 6) * 0.07));
        const pts = [];
        for (let i = 0; i <= 26; i++) pts.push(proj(c, bezier(f.P[0], f.P[1], f.P[2], f.P[3], (i / 26) * k)));
        if (pts.some((p) => !p)) return;
        g.strokeStyle = rgba(COL.gold, 0.2 * fv);
        g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
      });
      g.setLineDash([]);
    }

    // --- organograma (holding): conectores ortogonais, em tela
    const tv = TL.tree(t);
    if (tv > 0.004) {
      NET.struct.treeEdges.forEach(([pi, kids]) => {
        const P = st[NET.bySlot[pi]], Ps = sp[NET.bySlot[pi]];
        if (!Ps) return;
        const K = kids.map((ki) => ({ s: st[NET.bySlot[ki]], p: sp[NET.bySlot[ki]] })).filter((k) => k.p);
        if (!K.length) return;
        const vAll = Math.min(P.atS, ...K.map((k) => k.s.atS)) * tv;
        if (vAll < 0.004) return;
        const ym = (Ps[1] + Math.min(...K.map((k) => k.p[1]))) / 2;
        g.strokeStyle = rgba(COL.gold, 0.5 * vAll);
        g.lineWidth = 1.0 * SC;
        g.beginPath();
        g.moveTo(Ps[0], Ps[1]); g.lineTo(Ps[0], ym);
        const xs = K.map((k) => k.p[0]);
        g.moveTo(Math.min(...xs, Ps[0]), ym); g.lineTo(Math.max(...xs, Ps[0]), ym);
        K.forEach((k) => { g.moveTo(k.p[0], ym); g.lineTo(k.p[0], k.p[1]); });
        g.stroke();
      });
    }

    // --- rinoceronte: faces facetadas + arestas
    const rf = TL.rhinoFaces(t), re = TL.rhinoEdges(t);
    const [bx0, , bx1] = RH.bbox;
    const sw = TL.rhinoSweep(t);
    const swX = lerp(bx0 - 80, bx1 + 80, sw);
    const swOn = sw > 0 && sw < 1 ? Math.sin(Math.PI * sw) : 0;
    const boost = (mx) => 1 + 1.6 * swOn * Math.exp(-(((mx - swX) / 46) ** 2));
    if (rf > 0.004) {
      RH.F.forEach((f) => {
        const ids = f.v.map((vi) => NET.byRv[vi]);
        const v = Math.min(...ids.map((i) => st[i].atR)) * rf;
        if (v < 0.004) return;
        const P = ids.map((i) => sp[i]);
        if (P.some((p) => !p)) return;
        const mx = (RH.V[f.v[0]].x + RH.V[f.v[1]].x + RH.V[f.v[2]].x) / 3;
        const a = (0.018 + 0.10 * Math.pow(f.lum, 1.6)) * (f.horn ? 1.5 : 1) * v * boost(mx);
        g.fillStyle = rgba(f.horn ? COL.goldSoft : COL.gold, a);
        g.beginPath(); g.moveTo(P[0][0], P[0][1]); g.lineTo(P[1][0], P[1][1]); g.lineTo(P[2][0], P[2][1]); g.closePath(); g.fill();
      });
    }
    if (re > 0.004) {
      RH.E.forEach((e) => {
        const ia = NET.byRv[e.a], ib = NET.byRv[e.b];
        const v = Math.min(st[ia].atR, st[ib].atR) * re;
        if (v < 0.004) return;
        const A = sp[ia], B = sp[ib];
        if (!A || !B) return;
        const mx = (RH.V[e.a].x + RH.V[e.b].x) / 2;
        g.strokeStyle = rgba(e.sil ? COL.goldSoft : COL.gold, (e.sil ? 0.62 : 0.27) * v * boost(mx));
        g.lineWidth = (e.sil ? 1.1 : 0.8) * SC;
        g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
      });
    }

    // --- nós
    nodes.forEach((n, i) => {
      const s = st[i], P = sp[i];
      if (!P || s.a < 0.004) return;
      const dz = clamp(refZ / P[2], 0.6, 1.7);
      const kind = n.slot.kind;
      let a = s.a;
      let size = s.sz * dz;
      // conta em fluxo é mais discreta
      if (kind === 'bead') a *= lerp(1, 0.5, s.atS);
      const mx = n.rv.x;
      if (s.atR > 0.5) a *= Math.min(1.6, boost(mx));
      const gr = (7 + 7 * size) * SC;
      g.globalAlpha = clamp(0.32 * a);
      g.drawImage(spriteGlow, P[0] - gr, P[1] - gr, gr * 2, gr * 2);
      g.globalAlpha = 1;
      g.fillStyle = rgba(COL.warm, clamp(0.9 * a));
      g.beginPath(); g.arc(P[0], P[1], (0.7 + 0.75 * size) * SC, 0, TAU); g.fill();
      // anéis: holding (ouro) e os seis eixos (acento do eixo)
      if (s.atS > 0.01 && (kind === 'root' || kind === 'l1')) {
        const col = kind === 'root' ? COL.gold : COL.eixo[n.slot.axis];
        g.strokeStyle = rgba(col, 0.75 * s.atS * a * TL.tree(t));
        g.lineWidth = 1.0 * SC;
        g.beginPath(); g.arc(P[0], P[1], (kind === 'root' ? 9 : 5.5) * SC * dz, 0, TAU); g.stroke();
      }
    });
    // brilho na ponta do chifre ao fim da varredura
    const tipN = NET.byRv[RH.tip];
    const tipS = st[tipN], tipP = sp[tipN];
    const glint = Math.exp(-(((t - 10.55) / 0.28) ** 2)) * tipS.atR;
    if (tipP && glint > 0.01) {
      const r = 26 * SC;
      g.globalAlpha = 0.75 * glint;
      g.drawImage(spriteGlow, tipP[0] - r, tipP[1] - r, r * 2, r * 2);
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'source-over';
  }

  function drawDust(g, t) {
    const [x0, x1, y0, y1] = LAY.dust;
    g.globalCompositeOperation = 'lighter';
    DUST.forEach((d) => {
      const x = lerp(x0, x1, d.x) * W + 26 * SC * Math.sin(TAU * t / L + d.ph);
      const y = lerp(y0, y1, d.y) * H + 18 * SC * Math.cos(TAU * t / L * 2 + d.ph2) - 10 * SC * Math.sin(TAU * t / L + d.ph);
      const r = d.r * SC;
      g.globalAlpha = d.a * (0.75 + 0.25 * Math.sin(TAU * t / L * 2 + d.ph));
      g.drawImage(spriteBokeh, x - r, y - r, r * 2, r * 2);
    });
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  let DUST = [];

  function post(g, t, opts) {
    // bloom em duas escalas, com limiar suave (contraste)
    b1.globalCompositeOperation = 'copy';
    b1.filter = 'contrast(2.1) brightness(0.95)';
    b1.drawImage(cvMain, 0, 0, cvB1.width, cvB1.height);
    t1.globalCompositeOperation = 'copy';
    t1.filter = 'blur(' + (3 * SC).toFixed(2) + 'px)';
    t1.drawImage(cvB1, 0, 0);
    b2.globalCompositeOperation = 'copy';
    b2.filter = 'none';
    b2.drawImage(cvT1, 0, 0, cvB2.width, cvB2.height);
    t2.globalCompositeOperation = 'copy';
    t2.filter = 'blur(' + (5 * SC).toFixed(2) + 'px)';
    t2.drawImage(cvB2, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.55; g.drawImage(cvT1, 0, 0, W, H);
    g.globalAlpha = 0.45; g.drawImage(cvT2, 0, 0, W, H);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    drawDust(g, t);

    // área do texto calma (o HTML entra por cima)
    let gr;
    if (LAY.calm === 'left') {
      gr = g.createLinearGradient(0, 0, W * 0.5, 0);
      gr.addColorStop(0, rgba(COL.bg, 0.66));
      gr.addColorStop(0.55, rgba(COL.bg, 0.32));
      gr.addColorStop(1, rgba(COL.bg, 0));
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    } else {
      gr = g.createLinearGradient(0, H, 0, H * 0.5);
      gr.addColorStop(0, rgba(COL.bg, 0.9));
      gr.addColorStop(0.45, rgba(COL.bg, 0.5));
      gr.addColorStop(1, rgba(COL.bg, 0));
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    // vinheta
    const vx = LAY.calm === 'left' ? W * 0.64 : W * 0.5, vy = LAY.calm === 'left' ? H * 0.45 : H * 0.34;
    const R = Math.hypot(W, H) * 0.62;
    gr = g.createRadialGradient(vx, vy, R * 0.35, vx, vy, R);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);

    // grão de filme leve (determinístico por quadro)
    if (opts.grain !== false) {
      const fi = opts.grainAnim ? Math.round(t * 25) % 4 : 0;   // grão estático: textura sem custo de bitrate
      g.save();
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = 0.16;
      g.translate((fi * 97) % 256, (fi * 151) % 256);
      g.fillStyle = grainPat;
      g.fillRect(-256, -256, W + 512, H + 512);
      g.restore();
    }
  }

  function frame(t, opts = {}) {
    t = ((t % L) + L) % L;
    const c = camAt(t);
    drawCity(cctx, c, t);
    ctx.globalCompositeOperation = 'copy';
    const bl = TL.cityBlur(t) * SC;
    ctx.filter = bl > 0.05 ? 'blur(' + bl.toFixed(2) + 'px)' : 'none';
    ctx.drawImage(cvCity, 0, 0);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    drawNet(ctx, c, t);
    post(ctx, t, opts);
    if (opts.noEncode) return '';
    return cvMain.toDataURL('image/png').split(',')[1];
  }

  async function setup(o) {
    LAY = Object.assign({ name: o.layout }, LAYOUTS[o.layout]);
    W = LAY.W; H = LAY.H; SC = LAY.s;
    const mk = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
    cvMain = mk(W, H); ctx = cvMain.getContext('2d');
    cvCity = mk(W, H); cctx = cvCity.getContext('2d');
    cvB1 = mk(Math.round(W / 4), Math.round(H / 4)); b1 = cvB1.getContext('2d');
    cvT1 = mk(cvB1.width, cvB1.height); t1 = cvT1.getContext('2d');
    cvB2 = mk(Math.round(W / 8), Math.round(H / 8)); b2 = cvB2.getContext('2d');
    cvT2 = mk(cvB2.width, cvB2.height); t2 = cvT2.getContext('2d');
    if (o.show) document.body.appendChild(cvMain);
    spriteGlow = makeSprite(64, [[0, 'rgba(255,240,210,1)'], [0.12, 'rgba(240,214,160,0.55)'], [0.4, 'rgba(214,176,105,0.14)'], [1, 'rgba(214,176,105,0)']]);
    spriteBokeh = makeSprite(64, [[0, 'rgba(231,211,177,0.9)'], [0.78, 'rgba(231,211,177,0.75)'], [0.92, 'rgba(231,211,177,0.35)'], [1, 'rgba(231,211,177,0)']]);
    // grão
    const rngG = mulberry32(77);
    const gc = mk(256, 256), gg = gc.getContext('2d');
    const id = gg.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const n = (rngG() + rngG() + rngG() - 1.5) * 2;   // ~gauss
      const v = clamp(128 + n * 34, 0, 255);
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255;
    }
    gg.putImageData(id, 0, 0);
    grainPat = ctx.createPattern(gc, 'repeat');

    const rng = mulberry32(2026);
    CITY = buildCity(rng);
    RH = placeRhino(await buildRhinoMesh(o.logo, mulberry32(1517)));
    buildNet(mulberry32(205));
    const rd = mulberry32(31);
    DUST = [];
    for (let i = 0; i < 14; i++) DUST.push({ x: rd(), y: rd(), r: 6 + rd() * 22, a: 0.018 + rd() * 0.035, ph: rd() * TAU, ph2: rd() * TAU });
    return { N: RH.V.length, faces: RH.F.length, edges: RH.E.length, towers: CITY.towers.length, lots: CITY.lotSegs.length, cityEdges: NET.cityEdges.length };
  }

  window.DMC_HERO = { setup, frame, L };
})();
