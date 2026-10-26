// Filmes dos heróis da Central de Parcerias: as mesmas cenas de render.mjs,
// com câmera E luz em movimento lento. O que dá vida não é a câmera — é a luz:
// ela varre o papel e a fachada, e a sombra do brise desliza sobre a matéria.
//
//   node tools/media/parcerias/render-video.mjs --scene hub
//   node tools/media/parcerias/render-video.mjs --scene pl --probe-only --frames 4
//
// DUAS REGRAS DO LAÇO
// 1. Todo termo é seno de harmônico inteiro de t (sin t, sin 2t, sin 3t), logo
//    vale 0 em t=0 e em t=2π: o último quadro encosta no primeiro.
// 2. Como todo termo é 0 em t=0, o QUADRO 0 É O PRESET BASE — a mesma
//    composição das imagens estáticas aprovadas. Por isso o cartaz da página
//    (gerado por build.mjs, sem override) serve sem salto, e a emenda do laço
//    cai no ponto de velocidade máxima, onde ninguém a percebe.
// Harmônicos diferentes por eixo desenham uma figura de Lissajous fechada: o
// movimento não se repete a cada volta de um só parâmetro e não parece um bloco.
//
// Saída: out/video/<cena>/*.png → build-video.mjs faz mp4 + webm.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

const SCENE = arg('scene', 'hub');
const W = Number(arg('w', 1600));
const H = Number(arg('h', 900));
const SPP = Number(arg('spp', 40));
const FPS = Number(arg('fps', 24));
const SECS = Number(arg('secs', 15));
const FRAMES = Number(arg('frames', FPS * SECS));
const probeOnly = process.argv.includes('--probe-only');

// Amplitudes calibradas quadro a quadro (estudos em --probe-only). A luz de
// cada cena tem sensibilidade muito diferente: no `pl` a janela é estreita e
// a luz é rasante, então ±0,85 já varre a folha inteira; no `hub` o vão do
// brise é largo e aceita ±2,2 sem perder a mancha de luz.
export const CENAS = {
  hub: {
    tipo: 'orbita',
    base: { tgt: [0.75, 0.28, 0.05], dist: 8.0, az: 12, el: 52, fov: 30, aperture: 0.03, shift: [-0.34, 0.0] },
    cam: { az: 2.0, el: 1.1, dist: 0.26 },
    luz: { base: [14, 6.2, -6.5], z: 2.2, y: 0.5 }
  },
  pl: {
    tipo: 'orbita',
    base: { tgt: [0.2, 0.28, 0.15], dist: 7.4, az: 12, el: 56, fov: 30, aperture: 0.035, shift: [-0.42, 0.0] },
    cam: { az: 1.8, el: 1.0, dist: 0.24 },
    luz: { base: [15.0, 2.3, -5.0], z: 0.85, y: 0.18 }
  },
  bp: {
    // Fachada de brises em contraluz: a câmera faz um arco curto no plano do
    // chão (paralaxe entre as lâminas) e o sol gira, subindo a linha de sombra.
    tipo: 'cam',
    base: { pos: [-10, 1.7, 26], tgt: [4, 18, 4], fov: 50, roll: -11, shift: [-0.6, 0.0] },
    cam: { arcoGraus: 1.0, altura: 0.5, raio: 0.7 },
    sol: { base: [-0.9, 0.25, 0.35], graus: 3.5, y: 0.05 }
  }
};

const r6 = (v) => +v.toFixed(6);

// PULSO DOURADO — a parte que conta a história ("conectamos"). Uma faixa de luz
// atravessa os traços dourados (compasso, fio de ligação, rede do brise) e, ao
// passar, aviva a cor, engrossa o traço e acende um halo nos nós. Corre ao longo
// do eixo de maior extensão da rede, uma vez por laço, dentro de `janela` (fração
// do laço). Fora dela a faixa está longe da rede e o ganho é ~0, então o quadro 0
// continua idêntico ao cartaz e o laço continua sem emenda. A faixa entra e sai
// além das pontas (-0,25 → 1,25) para acender e apagar por suavidade, sem estalo.
export const PULSO = { janela: [0.12, 0.80], largura: 0.07, ganho: 6, halo: 0.5 };

// Posição da faixa (0 = início da rede, 1 = fim) no quadro i; null = apagada.
export function pulsoAt(i, frames = FRAMES) {
  const u = i / frames;
  const [a, b] = PULSO.janela;
  if (u < a || u > b) return null;
  const x = (u - a) / (b - a);
  const s = x * x * (3 - 2 * x); // smoothstep: acelera e desacelera
  return -0.25 + 1.5 * s;
}

// Câmera e luz do quadro i. Um ciclo completo em `frames` quadros.
export function camAt(i, frames = FRAMES, cena = SCENE) {
  const C = CENAS[cena];
  const t = (i / frames) * Math.PI * 2;
  const h1 = Math.sin(t), h2 = Math.sin(2 * t), h3 = Math.sin(3 * t);

  if (C.tipo === 'orbita') {
    const { base: B, cam: A, luz: L } = C;
    return {
      az: r6(B.az + A.az * h1),
      el: r6(B.el + A.el * h2),
      dist: r6(B.dist + A.dist * h3),
      // A luz anda em contrafase com o giro: quando a câmera vai para um lado,
      // a mancha de luz vai para o outro, e a cena nunca fica parada.
      ...(cena === 'hub'
        ? { lightPos: [L.base[0], r6(L.base[1] + L.y * h2), r6(L.base[2] - L.z * h1)] }
        : { light: { pos: [L.base[0], r6(L.base[1] + L.y * h2), r6(L.base[2] - L.z * h1)] } })
    };
  }

  // tipo 'cam': gira `pos` em torno de `tgt` no plano XZ; o sol gira em Y.
  const { base: B, cam: A, sol: S } = C;
  const dx = B.pos[0] - B.tgt[0], dz = B.pos[2] - B.tgt[2];
  const r0 = Math.hypot(dx, dz);
  const a = Math.atan2(dz, dx) + (A.arcoGraus * Math.PI / 180) * h1;
  const r = r0 + A.raio * h3;
  const g = (S.graus * Math.PI / 180) * h1;
  const cg = Math.cos(g), sg = Math.sin(g);
  return {
    cam: {
      pos: [
        r6(B.tgt[0] + r * Math.cos(a)),
        r6(B.pos[1] + A.altura * h2),
        r6(B.tgt[2] + r * Math.sin(a))
      ]
    },
    sun: [
      r6(S.base[0] * cg + S.base[2] * sg),
      r6(S.base[1] + S.y * h2),
      r6(-S.base[0] * sg + S.base[2] * cg)
    ]
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!CENAS[SCENE]) throw new Error(`cena desconhecida: ${SCENE} (use hub, pl ou bp)`);
  const out = path.resolve(arg('out', path.join(here, 'out', 'video', SCENE)));
  await fs.mkdir(out, { recursive: true });

  let browser;
  for (const args of [['--use-angle=metal'], ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']]) {
    try {
      browser = await chromium.launch({ args: [...args, '--force-color-profile=srgb'] });
      const p = await browser.newPage();
      const ok = await p.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
      await p.close();
      if (ok) { console.log('gl:', args[0]); break; }
      await browser.close(); browser = null;
    } catch { if (browser) await browser.close(); browser = null; }
  }
  if (!browser) throw new Error('nenhum backend WebGL2 disponível');

  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', (e) => { console.error('pageerror', e.message); process.exitCode = 1; });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); });
  await page.goto(pathToFileURL(path.join(here, 'scene.html')).href);

  const t0 = Date.now();
  const n = probeOnly ? Number(arg('frames', 6)) : FRAMES;
  const step = probeOnly ? FRAMES / n : 1;
  for (let k = 0; k < n; k++) {
    const i = Math.round(k * step);
    const ovr = { [SCENE + '-hero']: camAt(i, FRAMES, SCENE) };
    const fase = pulsoAt(i, FRAMES);
    const r = await page.evaluate(async ([scene, w, h, spp, ovr, fase, P]) => {
      window.OVR = ovr;
      const S = window.DMC_SCENES[scene]('hero', w, h, { nominalW: 1920 });
      if (fase !== null) {
        // eixo de maior extensão da rede, medido nos pontos médios dos traços
        const mid = (s) => [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, (s.a[2] + s.b[2]) / 2];
        const pts = S.segs.map(mid);
        const ext = [0, 1, 2].map((k) => { const v = pts.map((q) => q[k]); return Math.max(...v) - Math.min(...v); });
        const ax = ext.indexOf(Math.max(...ext));
        const vs = pts.map((q) => q[ax]);
        const lo = Math.min(...vs), hi = Math.max(...vs);
        const sig = (hi - lo) * P.largura, centro = lo + (hi - lo) * fase;
        const halos = [];
        S.segs = S.segs.map((s, j) => {
          const d = (vs[j] - centro) / sig, g = Math.exp(-d * d);
          // halo contínuo (alpha proporcional a g): nada surge ou some de estalo
          if (g > 0.02 && (s.kind === 1 || s.kind === 2)) halos.push({ a: s.a, b: s.b, w: s.w * 4, alpha: P.halo * g, c: s.c.map((x) => x * 1.5), kind: 3 });
          return { ...s, c: s.c.map((x) => x * (1 + P.ganho * g)), w: s.w * (1 + g), alpha: Math.min(1, s.alpha * (1 + 0.8 * g)) };
        });
        S.segs.push(...halos);
      }
      return window.DMC_ENGINE.render({ ...S, w, h, spp });
    }, [SCENE, W, H, SPP, ovr, fase, PULSO]);
    const name = probeOnly ? `probe-${String(i).padStart(4, '0')}.png` : `f-${String(k).padStart(4, '0')}.png`;
    await fs.writeFile(path.join(out, name), Buffer.from(r.png, 'base64'));
    if (k % 24 === 0 || k === n - 1) {
      const s = (Date.now() - t0) / 1000;
      console.log(`[${SCENE}] ${k + 1}/${n} quadros · ${s.toFixed(0)}s · ~${(s / (k + 1) * n).toFixed(0)}s no total`);
    }
  }
  await browser.close();
  console.log(`pronto: ${SCENE} · ${n} PNG em ${out} (${W}x${H}, ${SPP} spp, ${FPS} fps)`);
}
