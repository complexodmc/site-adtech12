// Renderiza posters e quadros dos loops das 5 verticais no Chromium do Playwright.
//   node tools/midia-home/render.mjs                    # tudo (posters + 144 quadros/cena)
//   node tools/midia-home/render.mjs --only terras      # uma cena
//   node tools/midia-home/render.mjs --preview          # 1 quadro/cena a 960 px (iteração)
//   node tools/midia-home/render.mjs --stills           # só posters
//   node tools/midia-home/render.mjs --frames 144 --fps 24
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes('--' + k);
const out = path.resolve(arg('out', path.join(here, 'out')));
const only = arg('only') ? arg('only').split(',') : null;
const FRAMES = Number(arg('frames', 144));
const preview = has('preview');
const stillsOnly = has('stills');

// slug → [poster desktop, poster mobile, vídeo]
export const JOBS = {
  construcao: { poster: [2560, 1097], mobile: [1200, 750], video: [1680, 720] },
  familias:   { poster: [1600, 1000], mobile: [1200, 750], video: [1280, 800] },
  grupos:     { poster: [1600, 1000], mobile: [1200, 750], video: [1280, 800] },
  patrimonio: { poster: [1600, 1000], mobile: [1200, 750], video: [1280, 800] },
  terras:     { poster: [1600, 1000], mobile: [1200, 750], video: [1280, 800] },
};

// servidor estático mínimo (módulos ES não carregam por file://)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const srv = http.createServer((req, res) => {
  const p = path.join(here, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(here) || !fss.existsSync(p) || fss.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fss.createReadStream(p).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;

let browser;
for (const args of [['--use-angle=metal'], ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']]) {
  try {
    browser = await chromium.launch({ args: [...args, '--force-color-profile=srgb', '--ignore-gpu-blocklist'] });
    const p = await browser.newPage();
    const ok = await p.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
    await p.close();
    if (ok) { console.log('gl:', args[0]); break; }
    await browser.close(); browser = null;
  } catch (e) { if (browser) await browser.close(); browser = null; }
}
if (!browser) { srv.close(); throw new Error('nenhum backend WebGL2 disponível'); }

const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => { console.error('pageerror', e.message); process.exitCode = 1; });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('console', m.text()); });
await page.goto(base + '/scene.html' + (arg('q') ? '?' + arg('q') : '')); // --q debug=nokey,nohemi
await page.waitForFunction(() => !!window.DMC);

const save = async (file, dataUrl) => fs.writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

for (const [slug, J] of Object.entries(JOBS)) {
  if (only && !only.includes(slug)) continue;
  const t0 = Date.now();
  if (preview) {
    const [W, H] = J.poster; const w = 960, h = Math.round(H * 960 / W);
    await fs.mkdir(path.join(out, 'preview'), { recursive: true });
    await page.evaluate(([s, w, h]) => window.DMC.init(s, w, h), [slug, w, h]);
    await save(path.join(out, 'preview', `${slug}${arg('suffix', '')}.png`), await page.evaluate(() => window.DMC.frame(0, 1)));
    // e um quadro no meio do loop para conferir o movimento
    await save(path.join(out, 'preview', `${slug}-t50.png`), await page.evaluate(() => window.DMC.frame(0.5, 2)));
    console.log(`${slug}: preview ${w}x${h} (${Date.now() - t0} ms)`);
    continue;
  }
  await fs.mkdir(path.join(out, 'stills'), { recursive: true });
  for (const [kind, [w, h]] of [['poster', J.poster], ['mobile', J.mobile]]) {
    await page.evaluate(([s, w, h]) => window.DMC.init(s, w, h), [slug, w, h]);
    const name = kind === 'poster' ? slug : slug + '-m';
    await save(path.join(out, 'stills', `${name}.png`), await page.evaluate(() => window.DMC.frame(0, 1)));
    console.log(`${slug}: poster ${kind} ${w}x${h}`);
  }
  if (stillsOnly) continue;
  const [w, h] = J.video;
  const dir = path.join(out, 'frames', slug);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  await page.evaluate(([s, w, h]) => window.DMC.init(s, w, h), [slug, w, h]);
  for (let i = 0; i < FRAMES; i++) {
    const d = await page.evaluate(([t, seed]) => window.DMC.frame(t, seed), [i / FRAMES, i + 1]);
    await save(path.join(dir, `f_${String(i).padStart(4, '0')}.png`), d);
  }
  console.log(`${slug}: ${FRAMES} quadros ${w}x${h} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
await browser.close();
srv.close();
