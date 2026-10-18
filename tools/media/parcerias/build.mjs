// Gera as imagens da Central de Parcerias de ponta a ponta:
//   1. render.mjs → PNG mestre em tools/media/parcerias/out/png
//   2. WebP (cwebp) / JPG (ffmpeg) com a maior qualidade que cabe no teto
//   3. medições (dimensão, KB, luminância da metade esquerda dos heróis)
//   4. quadro de contato em docs/dmc/parcerias/imagens-contato.png
// Uso: node tools/media/parcerias/build.mjs [--skip-render]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const PNG = path.join(here, 'out', 'png');
const DEST = path.join(root, 'complexodmc.com.br/assets/images/parcerias');
const SHEET = path.join(root, 'docs/dmc/parcerias/imagens-contato.png');
const FF = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE || '/opt/homebrew/bin/ffprobe';
const CWEBP = process.env.CWEBP || 'cwebp';

// arquivo final → PNG mestre, formato, teto (bytes), herói (mede metade esquerda)
const OUT = [
  ['pl-painel.webp', 'pl-painel', 'webp', 160e3],
  ['pl-painel-800.webp', 'pl-painel-800', 'webp', 90e3],
  ['bp-painel.webp', 'bp-painel', 'webp', 160e3],
  ['bp-painel-800.webp', 'bp-painel-800', 'webp', 90e3],
  ['pl-hero.webp', 'pl-hero', 'webp', 180e3, true],
  ['pl-hero-960.webp', 'pl-hero-960', 'webp', 70e3, true],
  ['bp-hero.webp', 'bp-hero', 'webp', 180e3, true],
  ['bp-hero-960.webp', 'bp-hero-960', 'webp', 70e3, true],
  ['hub-hero.webp', 'hub-hero', 'webp', 180e3, true],
  ['hub-hero-960.webp', 'hub-hero-960', 'webp', 70e3, true],
  ['og-parcerias.jpg', 'og-parcerias', 'jpg', 120e3],
  ['og-partner-lawyers.jpg', 'og-partner-lawyers', 'jpg', 120e3],
  ['og-business-partner.jpg', 'og-business-partner', 'jpg', 120e3],
];

const run = (cmd, args, opt = {}) => {
  const r = spawnSync(cmd, args, { maxBuffer: 1 << 28, ...opt });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}\n${r.stderr}`);
  return r.stdout;
};

if (!process.argv.includes('--skip-render')) {
  const r = spawnSync(process.execPath, [path.join(here, 'render.mjs'), '--out', PNG], { stdio: 'inherit', cwd: root });
  if (r.status !== 0) process.exit(r.status || 1);
}
await fs.mkdir(DEST, { recursive: true });
await fs.mkdir(path.dirname(SHEET), { recursive: true });

async function encode(dst, src, fmt, cap) {
  if (fmt === 'webp') {
    for (let q = 95; q >= 40; q -= 1) {
      run(CWEBP, ['-quiet', '-q', String(q), '-m', '6', '-sharp_yuv', '-mt', '-metadata', 'none', src, '-o', dst]);
      const { size } = await fs.stat(dst);
      if (size <= cap) return { q, size };
    }
  } else {
    for (let q = 2; q <= 20; q++) {
      run(FF, ['-v', 'error', '-y', '-i', src, '-pix_fmt', 'yuvj420p', '-q:v', String(q), '-map_metadata', '-1', dst]);
      const { size } = await fs.stat(dst);
      if (size <= cap) return { q, size };
    }
  }
  throw new Error(`não coube no teto: ${dst}`);
}

// luminância média da metade esquerda: luma Y' (0–1, codificada) e
// luminância relativa WCAG (linear), a partir do arquivo FINAL decodificado
function leftHalf(file) {
  const raw = run(FF, ['-v', 'error', '-i', file, '-vf', 'crop=iw/2:ih:0:0,format=rgb24', '-f', 'rawvideo', '-']);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = new Float64Array(256).map((_, i) => lin(i));
  let y = 0, rl = 0; const n = raw.length / 3;
  for (let i = 0; i < raw.length; i += 3) {
    const r = raw[i], g = raw[i + 1], b = raw[i + 2];
    y += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    rl += 0.2126 * L[r] + 0.7152 * L[g] + 0.0722 * L[b];
  }
  return { luma: y / n, rel: rl / n };
}

const report = [];
for (const [name, master, fmt, cap, hero] of OUT) {
  const dst = path.join(DEST, name);
  const enc = await encode(dst, path.join(PNG, master + '.png'), fmt, cap);
  const dim = run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', dst]).toString().trim();
  const row = { file: path.relative(root, dst), dim, kb: +(enc.size / 1024).toFixed(1), cap_kb: cap / 1000, q: enc.q };
  if (hero) Object.assign(row, Object.fromEntries(Object.entries(leftHalf(dst)).map(([k, v]) => [k, +(v * 100).toFixed(2)])));
  report.push(row);
  console.log(JSON.stringify(row));
}
await fs.writeFile(path.join(here, 'out', 'report.json'), JSON.stringify(report, null, 2));

// quadro de contato (revisão interna; legendas só aqui, nunca nas imagens)
const cell = (f, w) => `<figure><img src="${pathToFileURL(path.join(DEST, f)).href}" style="width:${w}px"><figcaption>${f}</figcaption></figure>`;
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#0b0c0e;color:#9a958c;font:12px/1.3 -apple-system,Helvetica,sans-serif;padding:24px;width:1872px}
.row{display:flex;gap:16px;align-items:flex-start;margin-bottom:20px}figure{margin:0}figcaption{margin-top:6px}img{display:block}
</style>
<div class="row">${cell('pl-painel.webp', 300)}${cell('bp-painel.webp', 300)}${cell('pl-painel-800.webp', 200)}${cell('bp-painel-800.webp', 200)}</div>
<div class="row">${cell('hub-hero.webp', 600)}${cell('pl-hero.webp', 600)}${cell('bp-hero.webp', 600)}</div>
<div class="row">${cell('hub-hero-960.webp', 300)}${cell('pl-hero-960.webp', 300)}${cell('bp-hero-960.webp', 300)}</div>
<div class="row">${cell('og-parcerias.jpg', 600)}${cell('og-partner-lawyers.jpg', 600)}${cell('og-business-partner.jpg', 600)}</div>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1000 } });
const sheetHtml = path.join(here, 'out', 'contato.html');
await fs.writeFile(sheetHtml, html);
await p.goto(pathToFileURL(sheetHtml).href, { waitUntil: 'load' });
await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
await p.screenshot({ path: SHEET, fullPage: true });
await b.close();
console.log('quadro de contato:', path.relative(root, SHEET));
