// Renderiza as imagens da Central de Parcerias (PNG mestre) em Chromium
// headless com GPU (ANGLE/Metal; cai para SwiftShader se não houver).
// Uso:
//   node tools/media/parcerias/render.mjs                 # todos os quadros
//   node tools/media/parcerias/render.mjs --only pl-painel,bp-hero --spp 16 --scale 0.5
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('out', path.join(here, 'out', 'png')));
const only = arg('only') ? arg('only').split(',') : null;
const sppArg = arg('spp') ? Number(arg('spp')) : null;
const scale = Number(arg('scale', 1));

// nome → cena, formato, largura, altura, amostras
export const JOBS = [
  ['pl-painel', 'pl', 'painel', 1200, 1500, 96],
  ['pl-painel-800', 'pl', 'painel', 800, 1000, 96],
  ['bp-painel', 'bp', 'painel', 1200, 1500, 96],
  ['bp-painel-800', 'bp', 'painel', 800, 1000, 96],
  ['pl-hero', 'pl', 'hero', 1920, 1080, 96],
  ['pl-hero-960', 'pl', 'hero', 960, 540, 96],
  ['bp-hero', 'bp', 'hero', 1920, 1080, 96],
  ['bp-hero-960', 'bp', 'hero', 960, 540, 96],
  ['hub-hero', 'hub', 'hero', 1920, 1080, 96],
  ['hub-hero-960', 'hub', 'hero', 960, 540, 96],
  ['og-partner-lawyers', 'pl', 'og', 1200, 630, 96],
  ['og-business-partner', 'bp', 'og', 1200, 630, 96],
  ['og-parcerias', 'hub', 'og', 1200, 630, 96],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
    } catch (e) { if (browser) await browser.close(); browser = null; }
  }
  if (!browser) throw new Error('nenhum backend WebGL2 disponível');
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', (e) => { console.error('pageerror', e.message); process.exitCode = 1; });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); });
  await page.goto(pathToFileURL(path.join(here, 'scene.html')).href);
  if (process.argv.includes('--probe')) await page.evaluate(() => { window.PROBE = true; });
  const ovr = arg('ovr'); // JSON de ajuste fino para estudos: {"pl-hero": {...}}
  if (ovr) await page.evaluate((o) => { window.OVR = JSON.parse(o); }, ovr);
  const suffix = arg('suffix', '');
  for (const [name, scene, fmt, W, H, spp] of JOBS) {
    if (only && !only.includes(name)) continue;
    const w = Math.round(W * scale), h = Math.round(H * scale);
    const r = await page.evaluate(async ([scene, fmt, w, h, spp, W]) => {
      const S = window.DMC_SCENES[scene](fmt, w, h, { nominalW: W });
      if (window.PROBE) return { probe: S.probe };
      return window.DMC_ENGINE.render({ ...S, w, h, spp });
    }, [scene, fmt, w, h, sppArg || spp, W]);
    if (r.probe) { console.log(name, JSON.stringify(r.probe)); continue; }
    await fs.writeFile(path.join(out, name + suffix + '.png'), Buffer.from(r.png, 'base64'));
    console.log(`${name}: ${w}x${h} ${sppArg || spp} spp, ${r.segs} segmentos, ${(r.ms / 1000).toFixed(1)} s`);
  }
  await browser.close();
}
