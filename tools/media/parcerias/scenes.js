// Cenas da Central de Parcerias. Cada cena devolve { glsl, segs, cam, light,
// grade, ... } para o motor (engine.js). Geometria descrita em dados (lajes
// e fachadas) e convertida em GLSL; as linhas são "assentadas" sobre as
// superfícies pela mesma descrição (heightAt), então caem nos planos certos.
(function () {
  'use strict';
  const { V } = window.DMC_ENGINE;

  // ---------- cor ----------
  const lin = (hex, g = 1) => {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) * g; });
  };
  const PAL = {
    champ: '#e3cfa6', champDeep: '#8c7448', paper: '#f5f3ef',
    gold: '#d6b069', bronze: '#c08a52', bronzeDeep: '#7a5229',
  };
  const f3 = (v) => `vec3(${v.map((x) => (+x).toFixed(5)).join(',')})`;
  const f1 = (x) => (+x).toFixed(5);

  const deepMerge = (a, b) => { if (!b) return JSON.parse(JSON.stringify(a)); const o = JSON.parse(JSON.stringify(a)); for (const k of Object.keys(b)) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && o[k]) ? deepMerge(o[k], b[k]) : b[k]; return o; };
  // ---------- RNG determinístico ----------
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------- lajes (caixas giradas em Y) ----------
  // local = R(a)·(p − c) com R igual ao rotY do shader
  const toLocal = (b, p) => { const c = Math.cos(b.a), s = Math.sin(b.a); const x = p[0] - b.c[0], z = p[2] - b.c[2]; return [c * x + s * z, p[1] - b.c[1], -s * x + c * z]; };
  const toWorld = (b, l) => { const c = Math.cos(b.a), s = Math.sin(b.a); return [c * l[0] - s * l[2] + b.c[0], l[1] + b.c[1], s * l[0] + c * l[2] + b.c[2]]; };
  function slabsGLSL(slabs, occ = []) {
    const o = occ.length ? `  if (gSh){\n${occ.map((b) => `    r = opU(r, vec2(sdBox(rotY(p - ${f3(b.c)}, ${f1(b.a)}), ${f3(b.h)}), 9.));`).join('\n')}\n  }\n` : '';
    return o + slabs.map((b) => `  r = opU(r, vec2(sdRBox(rotY(p - ${f3(b.c)}, ${f1(b.a)}), ${f3(b.h)}, ${f1(b.r || 0.004)}), ${f1(b.m)}));`).join('\n');
  }
  function heightAt(slabs, x, z) {
    let y = 0;
    for (const b of slabs) {
      if (b.noDrape) continue;
      const l = toLocal(b, [x, 0, z]);
      if (Math.abs(l[0]) <= b.h[0] && Math.abs(l[2]) <= b.h[2]) y = Math.max(y, b.c[1] + b.h[1]);
    }
    return y;
  }
  // polilinha em xz → polilinha 3D assentada (degraus verticais nas bordas)
  function drape(slabs, pts, lift = 0.0025, step = 0.01) {
    const out = [];
    const H = (x, z) => heightAt(slabs, x, z) + lift;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const L = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.ceil(L / step));
      let prevH = H(x0, z0);
      if (i === 0) out.push([x0, prevH, z0]);
      let pt = 0;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        const hh = H(x, z);
        if (Math.abs(hh - prevH) > 1e-6) {
          let lo = pt, hi = t;
          for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; const hm = H(x0 + (x1 - x0) * m, z0 + (z1 - z0) * m); if (Math.abs(hm - prevH) < 1e-6) lo = m; else hi = m; }
          const ex = x0 + (x1 - x0) * lo, ez = z0 + (z1 - z0) * lo;
          out.push([ex, prevH, ez], [ex, hh, ez]);
        }
        prevH = hh; pt = t;
      }
      out.push([x1, H(x1, z1), z1]);
    }
    // remove pontos colineares
    const res = [out[0]];
    for (let i = 1; i < out.length - 1; i++) {
      const a = res[res.length - 1], b = out[i], c = out[i + 1];
      const ab = V.sub(b, a), bc = V.sub(c, b);
      const cr = V.len(V.cross(ab, bc));
      if (cr > 1e-7 * (V.len(ab) * V.len(bc) + 1e-12) || V.len(ab) < 1e-9) res.push(b);
    }
    res.push(out[out.length - 1]);
    return res;
  }

  // ---------- segmentos ----------
  function Segs() {
    const list = [];
    const api = {
      list,
      line(a, b, w, alpha, c, kind = 0) { list.push({ a, b, w, alpha, c, kind }); },
      poly(pts, w, alpha, c, closed = false) { for (let i = 0; i < pts.length - 1; i++) api.line(pts[i], pts[i + 1], w, alpha, c); if (closed) api.line(pts[pts.length - 1], pts[0], w, alpha, c); },
      dashed(pts, w, alpha, c, on, off) {
        // tracejado ao longo da polilinha 3D (comprimentos em unidades da cena)
        let acc = 0, drawing = true, left = on;
        for (let i = 0; i < pts.length - 1; i++) {
          let a = pts[i]; const b = pts[i + 1]; let L = V.len(V.sub(b, a));
          while (L > 1e-9) {
            const d = Math.min(left, L);
            const p = V.lerp(a, b, d / V.len(V.sub(b, a)));
            if (drawing) api.line(a, p, w, alpha, c);
            a = p; L -= d; left -= d; acc += d;
            if (left <= 1e-9) { drawing = !drawing; left = drawing ? on : off; }
          }
        }
      },
      dot(p, r, alpha, c) { list.push({ a: p, b: p, w: r, alpha, c, kind: 1 }); },
      ring(p, r, alpha, c) { list.push({ a: p, b: p, w: r, alpha, c, kind: 2 }); },
      halo(p, r, alpha, c) { list.push({ a: p, b: p, w: r, alpha, c, kind: 3 }); },
    };
    return api;
  }
  const arcXZ = (cx, cz, r, a0, a1, n) => { const pts = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } return pts; };

  // =====================================================================
  // PARTNER LAWYERS — geometria de conexão precisa sobre papel e pedra
  // =====================================================================
  const PL_GLSL_MAT = `
Mat getMat(float id, vec3 p, vec3 n){
  Mat m; m.nrm = vec3(0); m.emit = vec3(0); m.ink = 0.; m.metal = 0.;
  if (id < 1.5){ // piso: pedra grafite profunda
    float v = fbm(p*vec3(0.9, 0.9, 0.9));
    m.alb = vec3(0.0105, 0.0112, 0.0125) * (0.85 + 0.3*v); m.rough = 0.62;
  } else if (id < 2.5){ // laje de pedra grafite apicoada
    float v = fbm(p*vec3(2.2, 2.2, 2.2)), s = vnoise(p*95.);
    m.alb = vec3(0.030, 0.031, 0.033) * (0.82 + 0.32*v + 0.08*s); m.rough = 0.62;
    m.nrm = (vec3(vnoise(p*60.), 0., vnoise(p*60. + 9.)) - .5) * 0.010 * step(.9, n.y);
  } else if (id < 3.5){ // papel algodão, branco quente
    vec3 q = p*vec3(70., 70., 52.);
    float fib = vnoise(q) * .6 + vnoise(q*2.7) * .4;
    m.alb = vec3(0.76, 0.71, 0.62) * (0.975 + 0.035*fib); m.rough = 0.9; m.ink = 1.;
    m.nrm = (vec3(vnoise(q*1.3) - .5, 0., vnoise(q*1.3 + 5.) - .5)) * 0.012 * step(.9, n.y);
  } else if (id < 4.5){ // ardósia fina (grafite claro, acetinado)
    float v = fbm(p*vec3(3.0, 3.0, 3.0));
    m.alb = vec3(0.060, 0.059, 0.058) * (0.9 + 0.2*v); m.rough = 0.34;
    m.nrm = (vec3(vnoise(p*48.), 0., vnoise(p*48. + 3.)) - .5) * 0.012 * step(.9, n.y);
  } else { // filete metálico champanhe
    m.alb = vec3(0.78, 0.64, 0.42); m.metal = 1.; m.rough = 0.32;
  }
  return m;
}
`;

  function plWorld(fmt, u = 1, off = [0, 0, 0], rot = 0) {
    const T = 0.28; // topo da laje
    const big = fmt === 'hero' || fmt === 'og';
    let slabs = [
      { c: big ? [-0.6, 0.14, 0.2] : [0, 0.14, 0], h: big ? [9, 0.14, 6] : [2.7, 0.14, 1.75], a: 0.06, r: 0.012, m: 2 },
      { c: [0.72, T + 0.011, -0.12], h: [1.02, 0.011, 1.36], a: -0.17, r: 0.003, m: 3 },
      { c: [-0.62, T + 0.026 + 0.016, 0.42], h: [0.92, 0.016, 1.08], a: 0.27, r: 0.004, m: 4 },
    ];
    // escala/posição/giro (o hub usa as lajes em escala de praça)
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const xf = (p) => [off[0] + u * (cr * p[0] - sr * p[2]), off[1] + u * p[1], off[2] + u * (sr * p[0] + cr * p[2])];
    slabs = slabs.map((b) => ({ ...b, c: xf(b.c), h: b.h.map((x) => x * u), r: b.r * u, a: b.a + rot }));
    return { slabs, T: T * u, xf };
  }

  function plSegs(slabs, opt = {}) {
    const S = Segs();
    const g = opt.ink || 1.6;
    const champ = lin(PAL.champ, g);
    const champSoft = lin(PAL.champ, g * 0.8);
    const k = opt.wk || 1; // escala das larguras (px)
    const u = opt.u || 1;
    const lift = 0.0025 * u;
    const H = (x, z) => heightAt(slabs, x, z) + lift;
    const minY = 0.05 * u; // nada de linha no piso: a geometria mora nos planos
    const P = (pts, w, a, c) => { const d = drape(slabs, pts, lift, 0.01 * u); for (let i = 0; i < d.length - 1; i++) if (Math.min(d[i][1], d[i + 1][1]) > minY) S.line(d[i], d[i + 1], w, a, c); };
    const A2 = opt.A || [0.92, -0.30], B2 = opt.B || [-0.48, 0.52];
    const d = Math.hypot(B2[0] - A2[0], B2[1] - A2[1]);
    const mid = [(A2[0] + B2[0]) / 2, (A2[1] + B2[1]) / 2];
    const ux = (B2[0] - A2[0]) / d, uz = (B2[1] - A2[1]) / d;
    const px = -uz, pz = ux, hgt = d * Math.sqrt(3) / 2;
    const C2 = [mid[0] + px * hgt, mid[1] + pz * hgt];
    const D2 = [mid[0] - px * hgt, mid[1] - pz * hgt];
    const P3 = (q) => [q[0], H(q[0], q[1]), q[1]];
    const ang = (o, q) => Math.atan2(q[1] - o[1], q[0] - o[0]);
    // 1. malha editorial impressa no papel (tinta profunda, muito leve)
    const paper = slabs[1];
    if (opt.paperGrid !== false) {
      const hx = paper.h[0], hz = paper.h[2], mg = 0.14 * u, cols = 6, gut = 0.05 * u;
      const top = paper.h[1] + lift;
      const cw = (2 * (hx - mg) - gut * (cols - 1)) / cols;
      // só onde o papel está à vista (a ardósia por cima corta a malha)
      const yTop = paper.c[1] + paper.h[1] + lift;
      const L = (a, b, w, al) => {
        const A = toWorld(paper, [a[0], top, a[1]]), B = toWorld(paper, [b[0], top, b[1]]);
        const d = drape(slabs, [[A[0], A[2]], [B[0], B[2]]], lift, 0.01 * u);
        for (let i = 0; i < d.length - 1; i++) if (Math.abs(d[i][1] - yTop) < 1e-5 && Math.abs(d[i + 1][1] - yTop) < 1e-5) S.line(d[i], d[i + 1], w, al, champ);
      };
      for (let i = 0; i < cols; i++) {
        const x0 = -hx + mg + i * (cw + gut);
        L([x0, -hz + mg], [x0, hz - mg], 0.75 * k, 0.16); L([x0 + cw, -hz + mg], [x0 + cw, hz - mg], 0.75 * k, 0.16);
      }
      L([-hx + mg, -hz + mg], [hx - mg, -hz + mg], 0.75 * k, 0.2); L([-hx + mg, hz - mg], [hx - mg, hz - mg], 0.75 * k, 0.2);
      for (let j = 1; j < 8; j++) { const z = -hz + mg + j * (2 * (hz - mg)) / 8; L([-hx + mg, z], [hx - mg, z], 0.6 * k, 0.09); }
    }
    // 2. guias de construção que atravessam os planos pelos nós
    const ext = 6 * u;
    // guias riscadas só na pedra: passam por baixo das folhas (sem degrau)
    const slab0 = [slabs[0]];
    const guide = (o, dx, dz, a) => { const d = drape(slab0, [[o[0] - dx * ext, o[1] - dz * ext], [o[0] + dx * ext, o[1] + dz * ext]], lift, 0.01 * u); for (let i = 0; i < d.length - 1; i++) if (Math.min(d[i][1], d[i + 1][1]) > minY) S.line(d[i], d[i + 1], 0.7 * k, a, champSoft); };
    guide(A2, ux, uz, 0.22);
    guide(C2, px, pz, 0.14);
    // 3. compasso: círculos completos tênues + marcas firmes cruzando em C e D
    P(arcXZ(A2[0], A2[1], d, 0, Math.PI * 2, 256), 0.8 * k, 0.2, champSoft);
    P(arcXZ(B2[0], B2[1], d, 0, Math.PI * 2, 256), 0.8 * k, 0.2, champSoft);
    const sw = opt.arcSpan || 0.30;
    for (const [o, q] of [[A2, C2], [B2, C2], [A2, D2], [B2, D2]]) {
      const a = ang(o, q);
      P(arcXZ(o[0], o[1], d, a - sw, a + sw, 48), 1.1 * k, 0.92, champ);
    }
    // 4. triângulo: base firme, lados finos
    P([A2, B2], 1.3 * k, 0.95, champ);
    P([A2, C2], 0.9 * k, 0.6, champ);
    P([B2, C2], 0.9 * k, 0.6, champ);
    S.dashed(drape(slabs, [C2, D2], lift, 0.01 * u).filter((q) => q[1] > minY), 0.8 * k, 0.45, champ, 0.045 * u, 0.035 * u);
    // 5. nós exatos
    for (const q of [A2, B2]) { S.ring(P3(q), 7 * k, 0.9, champ); S.dot(P3(q), 2.0 * k, 1, champ); }
    S.dot(P3(C2), 2.4 * k, 1, champ); S.ring(P3(C2), 4.5 * k, 0.65, champ);
    S.dot(P3(D2), 1.9 * k, 0.85, champ);
    S.dot(P3(mid), 1.5 * k, 0.85, champ);
    return { segs: S.list, nodes: { A: P3(A2), B: P3(B2), C: P3(C2), D: P3(D2), M: P3(mid) } };
  }

  // oclusor só de sombra: "beiral" cuja borda interna passa por (px, hc, pz)
  // parede com vão: a luz passa abaixo da verga (altura hw) — o fundo fica na sombra
  const lintel = (px, pz, a, hw) => ({ c: [px, hw + 10, pz], h: [0.08, 10, 40], a });
  // janela (só sombra): parede perpendicular à luz com um vão retangular.
  // c = centro do vão no chão (x, z); a = giro da parede (normal local x);
  // W = largura do vão; y0..y1 = peitoril e verga.
  function windowOcc(c, a, W, y0, y1, ext = 40) {
    const b = { c: [c[0], 0, c[1]], a };
    const box = (z0, z1, ya, yb) => { const w = toWorld(b, [0, 0, (z0 + z1) / 2]); return { c: [w[0], (ya + yb) / 2, w[2]], h: [0.05, (yb - ya) / 2, (z1 - z0) / 2], a }; };
    const out = [box(-ext, ext, y1, 60), box(W / 2, ext, -1, y1), box(-ext, -W / 2, -1, y1)];
    if (y0 > 0) out.push(box(-W / 2, W / 2, -1, y0));
    return out;
  }
  const orbit = (tgt, dist, az, el) => { const a = az * Math.PI / 180, e = el * Math.PI / 180; return [tgt[0] + dist * Math.cos(e) * Math.sin(a), tgt[1] + dist * Math.sin(e), tgt[2] + dist * Math.cos(e) * Math.cos(a)]; };

  function plScene(fmt, w, h) {
    const presets = {
      painel: {
        tgt: [0.1, 0.28, 0.12], dist: 8.6, az: 18, el: 63, fov: 30, aperture: 0.025, shift: [0, 0],
        light: { pos: [-14, 3.2, -7.5], d0: 15.5, radius: 0.12, shK: 160 },
        win: [-5.2, -2.6, 0.49, 4.2, 0, 1.55],
      },
      hero: {
        tgt: [0.2, 0.28, 0.15], dist: 7.4, az: 12, el: 56, fov: 30, aperture: 0.035, shift: [-0.42, 0.0],
        light: { pos: [15.0, 2.3, -5.0], d0: 15.5, radius: 0.12, shK: 160 },
        win: [5.4, -1.6, -0.32, 2.0, 0, 1.12],
      },
      og: {
        tgt: [0.25, 0.28, 0.15], dist: 7.0, az: 12, el: 54, fov: 30, aperture: 0.03, shift: [-0.12, 0.0],
        light: { pos: [15.0, 2.3, -5.0], d0: 15.5, radius: 0.12, shK: 160 },
        win: [5.4, -1.6, -0.32, 2.0, 0, 1.12],
      },
    };
    const { slabs } = plWorld(fmt);
    const P0 = deepMerge(presets[fmt], (window.OVR || {})['pl-' + fmt]);
    if (P0.win) { const [cx, cz, a, W, y0, y1] = P0.win; P0.occ = windowOcc([cx, cz], a, W, y0, y1); }
    const glsl = `
vec2 map(vec3 p){
  vec2 r = vec2(p.y, 1.);
${slabsGLSL(slabs, P0.occ || [])}
  return r;
}
${PL_GLSL_MAT}`;
    const Pz = P0;
    const cam = { pos: orbit(Pz.tgt, Pz.dist, Pz.az, Pz.el), tgt: Pz.tgt, fov: Pz.fov, aperture: Pz.aperture, shift: Pz.shift };
    const sc = Math.sqrt(Math.min(w, h) / 1080);
    const { segs } = plSegs(slabs, { wk: Math.max(0.8, sc * 1.05) });
    return {
      glsl, segs, cam,
      light: {
        dir: [0, 1, 0], pos: Pz.light.pos, d0: Pz.light.d0, radius: Pz.light.radius, shK: Pz.light.shK || 64,
        col: lin('#fff3e2', P0.lightGain || 3.2),
        ambTop: lin('#1e2024', 0.30), ambBot: lin('#121416', 0.08),
        bgTop: lin('#0b0c0e'), bgBot: lin('#0b0c0e'),
        fogCol: lin('#0b0c0e'), fog: 0.03,
      },
      inkDeep: [0.62, 0.50, 0.30],
      aoScale: 1,
      grade: { exposure: 1.0, grain: 0.010, sat: 1.0 },
    };
  }


  // =====================================================================
  // BUSINESS PARTNER — arquitetura contemporânea + rede que se expande
  // =====================================================================
  // torre: base no chão, núcleo de vidro, brises verticais e vigas em grade
  // (mesma profundidade: treliça rente), tudo por repetição limitada.
  const BP_GLSL_LIB = `
vec2 tower(vec3 p, vec3 c, float a, vec3 hs, vec3 g, float finM, vec2 kind){
  // hs = (meia largura, meia altura, meia profundidade); g = (passo brise, altura do andar, profundidade)
  vec3 q = rotY(p - c, a);
  float bb = sdBox(q, hs + vec3(g.z + 0.1, 0.1, g.z + 0.1));
  if (bb > 0.25*g.y) return vec2(bb, 0.);
  float core = sdBox(q, hs - vec3(0.02, 0., 0.02)*g.x);
  float s = g.x, d = g.z, t = 0.065*g.x;
  float nx = floor(hs.x/s + 0.001), nz = floor(hs.z/s + 0.001);
  float qx = q.x - s*clamp(round(q.x/s), -nx, nx);
  float qz = q.z - s*clamp(round(q.z/s), -nz, nz);
  float fz = sdBox(vec3(qx, q.y, abs(q.z) - hs.z - d*.5), vec3(t, hs.y, d*.5));
  float fx = sdBox(vec3(abs(q.x) - hs.x - d*.5, q.y, qz), vec3(d*.5, hs.y, t));
  float fh = g.y, ny = floor(hs.y/fh + 0.001);
  float qy = q.y - fh*clamp(round(q.y/fh), -ny, ny);
  float bm = sdBox(vec3(q.x, qy, q.z), vec3(hs.x + d, 0.04*g.y, hs.z + d));
  float crown = sdBox(q - vec3(0., hs.y, 0.), vec3(hs.x + d, 0.09*g.y, hs.z + d));
  if (kind.x < .5){ fz = 1e3; fx = 1e3; }
  if (kind.y < .5){ bm = 1e3; }
  vec2 r = vec2(core, kind.x + kind.y < .5 ? 2. : 6.);
  r = opU(r, vec2(min(fz, fx), finM));
  r = opU(r, vec2(min(bm, crown), 8.));
  return r;
}
`;
  const BP_GLSL_MAT = `
Mat getMat(float id, vec3 p, vec3 n){
  Mat m; m.nrm = vec3(0); m.emit = vec3(0); m.ink = 0.; m.metal = 0.;
  if (id < 1.5){ // praça: pedra grafite
    float v = fbm(p*0.35);
    m.alb = vec3(0.014, 0.0145, 0.016)*(0.8 + 0.4*v); m.rough = 0.5;
  } else if (id < 2.5){ // plano/laje de concreto grafite
    float v = fbm(p*0.8);
    m.alb = vec3(0.040, 0.040, 0.041)*(0.85 + 0.3*v); m.rough = 0.7;
  } else if (id < 6.5){ // vidro escuro (reflexo contido)
    float v = hash13(floor(p*vec3(0.9, 0.42, 0.9)));
    m.alb = vec3(0.005, 0.0052, 0.0056)*(0.7 + 0.6*v); m.rough = 0.28 + 0.1*v;
  } else if (id < 7.5){ // brise bronze escuro (pátina)
    m.alb = vec3(0.30, 0.165, 0.075); m.metal = 0.75; m.rough = 0.42 + 0.08*vnoise(p*3.);
  } else if (id < 8.5){ // viga grafite
    m.alb = vec3(0.030, 0.030, 0.030); m.rough = 0.6; m.metal = 0.;
  } else { // brise latão escovado
    m.alb = vec3(0.42, 0.29, 0.12); m.metal = 0.8; m.rough = 0.38 + 0.06*vnoise(p*3.);
  }
  return m;
}
`;
  // torre em dados: c = centro da base
  function towersGLSL(towers) {
    const K = { grid: [1, 1], fins: [1, 0], beams: [0, 1], plain: [0, 0] };
    return towers.map((t) => `  r = opU(r, tower(p, vec3(${f1(t.c[0])}, ${f1((t.y0 || 0) + t.hs[1])}, ${f1(t.c[2])}), ${f1(t.a)}, ${f3(t.hs)}, ${f3(t.g)}, ${f1(t.finM || 7)}, vec2(${(K[t.kind || 'grid']).join('., ')}.)));`).join('\n');
  }
  // ponto da treliça na face externa: face ∈ {'+z','-z','+x','-x'}, i = coluna, j = andar
  function gridPt(t, face, i, j, off) {
    if (off == null) off = 0.011 * t.g[0];
    const [hx, hy, hz] = t.hs, [s, fh, d] = t.g;
    const y = (t.y0 || 0) + Math.max(0, Math.min(2 * hy, hy + (j * fh)));
    let l;
    if (face === '+z') l = [i * s, 0, hz + d + off];
    else if (face === '-z') l = [-i * s, 0, -hz - d - off];
    else if (face === '+x') l = [hx + d + off, 0, -i * s];
    else l = [-hx - d - off, 0, i * s];
    const b = { c: [t.c[0], 0, t.c[2]], a: t.a };
    const w = toWorld(b, l); w[1] = y;
    return w;
  }
  function faceRange(t, face) { const [hx, hy, hz] = t.hs, [s, fh] = t.g; const n = Math.floor(((face[1] === 'z') ? hx : hz) / s + 0.001); return { n, ny: Math.floor(hy / fh + 0.001) }; }

  function bpWorld(fmt) {
    // torres: c (base), a (giro), hs (meias medidas), g (passo do brise, andar, profundidade)
    const towers = [
      { c: [0, 0, 0], a: 0, hs: [11, 34, 5], g: [1.1, 2.4, 0.75], kind: 'fins' },
      { c: [-400, 0, -900], a: 0.55, hs: [7, 40, 7], g: [1.1, 2.6, 0.9], kind: 'plain' }, // (reservada, fora de quadro)
      { c: [95, 0, -70], a: -0.25, hs: [7, 50, 6], g: [1.2, 2.2, 0.6], finM: 7, kind: 'fins' },
      { c: [32, 0, -6], a: 0, hs: [6, 30, 6], g: [1.5, 3.2, 0.12], finM: 8, kind: 'grid' },
      { c: [-500, 0, -900], a: 0.1, hs: [7, 34, 6], g: [1.1, 2.6, 0.8], kind: 'plain' }, // (reservada, fora de quadro)
    ];
    return { towers };
  }

  // rede: nó central na fachada; a treliça acende em losango ao redor dele
  // (distância manhattan → alpha), e vãos retos levam a nós de outras torres.
  function bpSegs(towers, opt = {}) {
    const S = Segs();
    const g0 = opt.ink || 2.0;
    const gold = lin(PAL.gold, g0), goldHot = lin(PAL.gold, g0 * 1.8);
    const k = opt.wk || 1;
    const c0 = opt.center, t0 = towers[c0.t];
    const C = gridPt(t0, c0.face, c0.i, c0.j);
    const R = opt.radius || 6;
    const { n, ny } = faceRange(t0, c0.face);
    const fall = (dd) => Math.pow(Math.max(0, 1 - dd / (R + 0.5)), 1.6);
    // vigas (horizontal) e brises (vertical) dentro do losango
    for (let j = c0.j - R; j <= c0.j + R; j++) {
      for (let i = c0.i - R; i < c0.i + R; i++) {
        if (i < -n || i + 1 > n || j <= -ny || j >= ny) continue;
        const dd = Math.abs(i + 0.5 - c0.i) + Math.abs(j - c0.j);
        const a = fall(dd); if (a < 0.04) continue;
        S.line(gridPt(t0, c0.face, i, j), gridPt(t0, c0.face, i + 1, j), (0.6 + 0.6 * a) * k, 0.85 * a, gold);
      }
    }
    for (let i = c0.i - R; i <= c0.i + R; i++) {
      for (let j = c0.j - R; j < c0.j + R; j++) {
        if (i < -n || i > n || j <= -ny || j + 1 >= ny) continue;
        const dd = Math.abs(i - c0.i) + Math.abs(j + 0.5 - c0.j);
        const a = fall(dd); if (a < 0.04) continue;
        S.line(gridPt(t0, c0.face, i, j), gridPt(t0, c0.face, i, j + 1), (0.6 + 0.6 * a) * k, 0.85 * a, gold);
      }
    }
    // nós no anel do losango
    for (let j = c0.j - R; j <= c0.j + R; j++) for (let i = c0.i - R; i <= c0.i + R; i++) {
      const dd = Math.abs(i - c0.i) + Math.abs(j - c0.j);
      if (dd === 0 || (dd % 2) || i < -n || i > n || j <= -ny || j >= ny) continue;
      const a = fall(dd); if (a < 0.1) continue;
      S.dot(gridPt(t0, c0.face, i, j), (1.2 + 1.2 * a) * k, a, goldHot);
    }
    // rota pela viga até a quina da fachada; de lá, vãos para outras torres
    const edgeI = c0.edge != null ? c0.edge : n;
    const K = gridPt(t0, c0.face, edgeI, c0.j);
    for (let i = c0.i; i < edgeI; i++) S.line(gridPt(t0, c0.face, i, c0.j), gridPt(t0, c0.face, i + 1, c0.j), 1.3 * k, 0.9, gold);
    S.dot(K, 2.4 * k, 1, goldHot); S.ring(K, 5.5 * k, 0.7, gold);
    const rec = (from, list, lvl) => {
      for (const nd of list) {
        const P = gridPt(towers[nd.t], nd.face, nd.i, nd.j);
        S.line(from, P, [1.2, 0.9, 0.7][lvl] * k, [0.8, 0.5, 0.3][lvl], gold);
        S.dot(P, (2.2 - 0.4 * lvl) * k, 1, goldHot);
        if (lvl === 0) S.ring(P, 5 * k, 0.6, gold);
        if (nd.next) rec(P, nd.next, lvl + 1);
      }
    };
    rec(K, opt.ring || [], 0);
    for (const nd of opt.local || []) { const P = gridPt(t0, c0.face, nd.i, nd.j); S.line(C, P, 1.0 * k, 0.6, gold); S.dot(P, 2 * k, 1, goldHot); }
    S.ring(C, 8 * k, 0.9, gold); S.dot(C, 3.0 * k, 1, goldHot);
    return { segs: S.list, C };
  }

  function bpScene(fmt, w, h) {
    const { towers } = bpWorld(fmt);
    const presets = {
      painel: {
        cam: { pos: [-15, 1.7, 21], tgt: [2, 20, 5], fov: 54, roll: -12 },
        sun: [-0.9, 0.25, 0.35],
        center: { t: 0, face: '+z', i: -2, j: -6 }, radius: 6,
        occ: [{ c: [-45, 12, 30], h: [10, 12, 22], a: 0 }],
        ring: [
          { t: 3, face: '-x', i: 2, j: 3, next: [{ t: 3, face: '-x', i: -1, j: 7 }, { t: 3, face: '+z', i: -2, j: 5 }] },
          { t: 3, face: '-x', i: -2, j: -2, next: [{ t: 3, face: '-x', i: 1, j: -6 }] },
          { t: 3, face: '-x', i: 3, j: 0 },
        ],
        local: [{ i: 6, j: 7 }],
      },
      hero: {
        cam: { pos: [-10, 1.7, 26], tgt: [4, 18, 4], fov: 50, roll: -11, shift: [-0.6, 0.0] },
        sun: [-0.9, 0.25, 0.35], bgRange: [0.2, 0.9],
        center: { t: 0, face: '+z', i: -2, j: -5 }, radius: 6,
        occ: [{ c: [-45, 10.5, 30], h: [10, 10.5, 22], a: 0 }],
        ring: [
          { t: 3, face: '+z', i: -2, j: 0, next: [{ t: 3, face: '+z', i: 0, j: 5 }] },
          { t: 3, face: '+z', i: -3, j: -4, next: [{ t: 3, face: '+z', i: 1, j: -7 }] },
        ],
        local: [{ i: 6, j: 7 }],
      },
      og: {
        cam: { pos: [-15, 1.7, 21], tgt: [2, 18, 5], fov: 52, roll: -10, shift: [-0.25, 0.0] },
        sun: [-0.9, 0.25, 0.35],
        center: { t: 0, face: '+z', i: -2, j: -5 }, radius: 6,
        occ: [{ c: [-45, 12, 30], h: [10, 12, 22], a: 0 }],
        ring: [
          { t: 3, face: '-x', i: 2, j: 3, next: [{ t: 3, face: '-x', i: -1, j: 7 }, { t: 3, face: '+z', i: -2, j: 5 }] },
          { t: 3, face: '-x', i: -2, j: -2, next: [{ t: 3, face: '-x', i: 1, j: -6 }] },
          { t: 3, face: '-x', i: 3, j: 0 },
        ],
        local: [{ i: 6, j: 7 }],
      },
    };
    const P0 = deepMerge(presets[fmt], (window.OVR || {})['bp-' + fmt]);
    const occ = (P0.occ || []).map((b) => `    r = opU(r, vec2(sdBox(rotY(p - ${f3(b.c)}, ${f1(b.a)}), ${f3(b.h)}), 9.));`).join('\n');
    const glsl = `${BP_GLSL_LIB}
vec2 map(vec3 p){
  vec2 r = vec2(p.y, 1.);
${occ ? '  if (gSh){\n' + occ + '\n  }' : ''}
${towersGLSL(towers)}
  return r;
}
${BP_GLSL_MAT}`;
    const sc = Math.sqrt(Math.min(w, h) / 1080);
    const { segs } = bpSegs(towers, { center: P0.center, ring: P0.ring, local: P0.local, radius: P0.radius, wk: Math.max(0.8, sc * 1.05) });
    const camP = window.DMC_ENGINE.camera(P0.cam, w, h);
    const pj = (q) => { const r = camP.project(q); return [+(r.x / w).toFixed(2), +(r.y / h).toFixed(2)]; };
    const t3n = []; for (const f of ['-x', '+z']) for (let i = -4; i <= 4; i += 2) for (let j = -8; j <= 8; j += 4) t3n.push(f + ' ' + i + ',' + j + ' ' + JSON.stringify(pj(gridPt(towers[3], f, i, j))));
    const t0edge = pj(gridPt(towers[0], '+z', 10, P0.center.j));
    const probe2 = { t3n, t0edge };
    const probe = towers.map((t, i) => { const pts = [[0, 0, 0], [0, 2 * t.hs[1], 0]].map((q) => { const r = camP.project([t.c[0] + q[0], q[1], t.c[2] + q[2]]); return [+(r.x / w).toFixed(2), +(r.y / h).toFixed(2), +r.z.toFixed(0)]; }); return { i, base: pts[0], top: pts[1] }; });
    return {
      probe: { towers: probe, ...probe2 },
      glsl, segs, cam: P0.cam,
      light: {
        dir: P0.sun, col: lin('#ffd2a0', 2.6), cone: 0.6, shK: 64,
        ambTop: lin('#3a3632', 0.55), ambBot: lin('#1a1c1f', 0.25),
        bgTop: lin('#0b0c0e', 1.0), bgBot: lin('#2b2723', 1.0), bgRange: P0.bgRange || [0.15, 0.85],
        fogCol: lin('#1f1c19', 1.0), fog: 0.009,
      },
      aoScale: 4,
      grade: { exposure: 1.0, grain: 0.010, sat: 1.0 },
    };
  }

  // =====================================================================
  // HUB — as duas linguagens se encontram: lajes champanhe (esq.-centro)
  // em escala de praça, torre de brises bronze (dir.), um traço que une.
  // =====================================================================
  const HUB_GLSL_MAT = PL_GLSL_MAT.replace('Mat getMat(float id, vec3 p, vec3 n){', 'Mat getMatPL(float id, vec3 p, vec3 n){')
    + BP_GLSL_MAT.replace('Mat getMat(float id, vec3 p, vec3 n){', 'Mat getMatBP(float id, vec3 p, vec3 n){') + `
Mat getMat(float id, vec3 p, vec3 n){
  if (id > 5.5) return getMatBP(id, p, n);
  if (id < 1.5) return getMatBP(id, p, n);
  return getMatPL(id, p, n);
}
`;
  // brise bronze em pé (grade de vigas): barras verticais e horizontais com
  // a mesma profundidade (local x), moldura; a luz atravessa as células.
  const LATTICE_GLSL = `
vec2 screen(vec3 p, vec3 c, float a, vec3 hs, float s, float bw){
  vec3 q = rotY(p - c, a);
  float bb = sdBox(q, hs + 0.02);
  if (bb > 0.08) return vec2(bb, 0.);
  float ny = floor(hs.y/s), nz = floor(hs.z/s);
  float qy = q.y - s*clamp(round(q.y/s), -ny, ny);
  float qz = q.z - s*clamp(round(q.z/s), -nz, nz);
  float bv = sdBox(vec3(q.x, q.y, qz), vec3(hs.x, hs.y, bw));
  float bh = sdBox(vec3(q.x, qy, q.z), vec3(hs.x*0.8, bw*0.8, hs.z));
  float fr = max(sdBox(q, hs), -sdBox(q, vec3(hs.x + 0.01, hs.y - bw*2., hs.z - bw*2.)));
  return vec2(min(min(bv, bh), fr), 7.);
}
`;
  function hubScene(fmt, w, h) {
    const presets = {
      hero: { tgt: [0.75, 0.28, 0.05], dist: 8.0, az: 12, el: 52, fov: 30, aperture: 0.03, shift: [-0.34, 0.0] },
      og: { tgt: [0.75, 0.28, 0.05], dist: 7.2, az: 12, el: 50, fov: 30, aperture: 0.03, shift: [-0.05, 0.0] },
    };
    const P0 = deepMerge(presets[fmt] || presets.hero, (window.OVR || {})['hub-' + fmt]);
    const { slabs, T } = plWorld('hero');
    // brise em pé à direita; a luz só entra pelas células dele
    const Ls = { c: [2.5, 0, -0.55], a: -1.0, hs: [0.028, 0.45, 0.96], s: 0.14, bw: 0.008 };
    Ls.c[1] = T + Ls.hs[1];
    // Posição da luz: exposta no preset para o filme do herói poder movê-la
    // (render-video.mjs). O valor padrão é o das imagens estáticas.
    const lightPos = P0.lightPos || [14, 6.2, -6.5];
    // parede invisível (só sombra) no plano do brise, com o vão do tamanho dele
    const wallAt = (lz0, lz1, y0, y1) => { const lc = [0, (y0 + y1) / 2, (lz0 + lz1) / 2]; const wc = toWorld({ c: Ls.c, a: Ls.a }, [0.06, lc[1] - Ls.c[1], lc[2]]); return { c: [wc[0], lc[1], wc[2]], h: [0.06, (y1 - y0) / 2, (lz1 - lz0) / 2], a: Ls.a }; };
    const top = Ls.c[1] + Ls.hs[1], hz = Ls.hs[2];
    const WH = P0.wallH || 9, WZ = 12;
    const occList = [wallAt(-WZ, WZ, top - 0.002, WH), wallAt(hz - 0.002, WZ, 0, top), wallAt(-WZ, -hz + 0.002, 0, top)];
    // parede de pedra grafite visível (a janela com brise está nela) + oclusor alto só de sombra
    const occ = occList.map((b) => `  r = opU(r, vec2(sdBox(rotY(p - ${f3(b.c)}, ${f1(b.a)}), ${f3(b.h)}), 2.));`).join('\n');
    const occHi = [wallAt(-40, 40, WH - 0.01, 40), wallAt(WZ - 0.01, 40, -1, WH), wallAt(-40, -WZ + 0.01, -1, WH)].map((b) => `    r = opU(r, vec2(sdBox(rotY(p - ${f3(b.c)}, ${f1(b.a)}), ${f3(b.h)}), 9.));`).join('\n');
    const glsl = `${LATTICE_GLSL}
vec2 map(vec3 p){
  vec2 r = vec2(p.y, 1.);
  if (gSh){
${occHi}
  }
${occ}
${slabsGLSL(slabs)}
  r = opU(r, screen(p, ${f3(Ls.c)}, ${f1(Ls.a)}, ${f3(Ls.hs)}, ${f1(Ls.s)}, ${f1(Ls.bw)}));
  return r;
}
${HUB_GLSL_MAT}`;
    const sc = Math.sqrt(Math.min(w, h) / 1080);
    const wk = Math.max(0.8, sc * 1.05);
    const pl = plSegs(slabs, { wk });
    // rede ouro sobre a face do brise voltada à câmera: losango a partir do nó central
    const S = Segs();
    const gold = lin(PAL.gold, 2.0), goldHot = lin(PAL.gold, 3.2);
    const lp = (iz, iy) => toWorld({ c: Ls.c, a: Ls.a }, [-Ls.hs[0] - 0.004, iy * Ls.s, iz * Ls.s]);
    const ci = 1, cj = 0, R = 4;
    const nz = Math.floor(Ls.hs[2] / Ls.s), ny = Math.floor(Ls.hs[1] / Ls.s);
    const fall = (dd) => Math.pow(Math.max(0, 1 - dd / (R + 0.5)), 1.5);
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i < ci + R; i++) {
      if (i < -nz || i + 1 > nz || j < -ny || j > ny) continue;
      const a = fall(Math.abs(i + 0.5 - ci) + Math.abs(j - cj)); if (a < 0.05) continue;
      S.line(lp(i, j), lp(i + 1, j), (0.6 + 0.7 * a) * wk, 0.9 * a, gold);
    }
    for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j < cj + R; j++) {
      if (i < -nz || i > nz || j < -ny || j + 1 > ny) continue;
      const a = fall(Math.abs(i - ci) + Math.abs(j + 0.5 - cj)); if (a < 0.05) continue;
      S.line(lp(i, j), lp(i, j + 1), (0.6 + 0.7 * a) * wk, 0.9 * a, gold);
    }
    const Cg = lp(ci, cj);
    S.ring(Cg, 8 * wk, 0.9, gold); S.dot(Cg, 3 * wk, 1, goldHot);
    // o traço que une: champanhe → ouro, do nó A (papel) ao nó central do brise
    const from = pl.nodes.A, to = Cg, N = 40;
    const c1 = lin(PAL.champ, 1.6), c2 = lin(PAL.gold, 2.0);
    for (let i = 0; i < N; i++) S.line(V.lerp(from, to, i / N), V.lerp(from, to, (i + 1) / N), 1.2 * wk, 0.9, V.lerp(c1, c2, (i + 0.5) / N));
    const cam = { pos: orbit(P0.tgt, P0.dist, P0.az, P0.el), tgt: P0.tgt, fov: P0.fov, aperture: P0.aperture, shift: P0.shift };
    const camP = window.DMC_ENGINE.camera(cam, w, h);
    const pr = (q) => { const r = camP.project(q); return [+(r.x / w).toFixed(2), +(r.y / h).toFixed(2)]; };
    return {
      probe: { A: pr(pl.nodes.A), B: pr(pl.nodes.B), C: pr(pl.nodes.C), Cg: pr(Cg) },
      glsl, segs: [...pl.segs, ...S.list], cam,
      light: {
        dir: [0, 1, 0], pos: lightPos, d0: 16, radius: 0.10, shK: 200,
        col: lin('#fff0de', 2.8),
        ambTop: lin('#1e2024', 0.30), ambBot: lin('#121416', 0.08),
        bgTop: lin('#0b0c0e'), bgBot: lin('#0b0c0e'),
        fogCol: lin('#0b0c0e'), fog: 0.03,
      },
      inkDeep: [0.62, 0.50, 0.30],
      aoScale: 1,
      grade: { exposure: 1.0, grain: 0.010, sat: 1.0 },
    };
  }

  window.DMC_SCENES = { pl: plScene, bp: bpScene, hub: hubScene, lin, PAL, Segs, drape, heightAt, rng, toWorld, toLocal, arcXZ, slabsGLSL };
})();
