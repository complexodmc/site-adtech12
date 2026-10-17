// Renderiza a cena procedural quadro a quadro (tempo controlado) em
// Chromium headless e grava PNGs. Uso:
//   node tools/media/hero/render.mjs --layout wide --fps 25 --out tools/media/hero/out/wide
//   node tools/media/hero/render.mjs --layout wide --times 0,2,4.5 --out /tmp/stills [--no-grain]
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);

const layout = arg('layout', 'wide');
const fps = Number(arg('fps', 25));
const out = path.resolve(arg('out', path.join(here, 'out', layout)));
const workers = Number(arg('workers', 4));
const grain = !flag('no-grain');
const L = 12;
const times = arg('times') ? arg('times').split(',').map(Number) : null;
const frames = times ? times.map((t, i) => ({ t, name: `t${t.toFixed(2)}.png` }))
  : Array.from({ length: Math.round(L * fps) }, (_, i) => ({ t: i / fps, name: `f${String(i).padStart(4, '0')}.png` }));

await fs.mkdir(out, { recursive: true });
const logo = await fs.readFile(path.join(root, 'complexodmc.com.br/assets/images/LOGO_RINOCERONTE.png'));
const logoUrl = 'data:image/png;base64,' + logo.toString('base64');

const browser = await chromium.launch({ args: ['--disable-gpu', '--force-color-profile=srgb', '--disable-lcd-text'] });
const t0 = Date.now();
let done = 0;
async function worker(list) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => { console.error('pageerror', e); process.exitCode = 1; });
  await page.goto(pathToFileURL(path.join(here, 'scene.html')).href);
  const info = await page.evaluate(([l, u]) => window.DMC_HERO.setup({ layout: l, logo: u }), [layout, logoUrl]);
  if (list === parts[0]) console.log('cena', layout, JSON.stringify(info));
  for (const f of list) {
    const b64 = await page.evaluate(([t, g]) => window.DMC_HERO.frame(t, { grain: g }), [f.t, grain]);
    await fs.writeFile(path.join(out, f.name), Buffer.from(b64, 'base64'));
    done++;
    if (done % 25 === 0) console.log(`${done}/${frames.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  await page.close();
}
const n = Math.max(1, Math.min(workers, frames.length));
const parts = Array.from({ length: n }, (_, k) => frames.filter((_, i) => i % n === k));
await Promise.all(parts.map(worker));
await browser.close();
console.log(`ok: ${frames.length} quadros em ${out} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
