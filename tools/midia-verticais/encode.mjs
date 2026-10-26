// Codifica cartazes (WebP) e loops (WebM VP9 / MP4 H.264) de out/ para os caminhos finais do site.
//   node tools/midia-verticais/encode.mjs                 # tudo
//   node tools/midia-verticais/encode.mjs --only indice --skip-video
// Orçamentos: cartaz 1600×900 ≤ 140 KB; mobile 960×540 ≤ 60 KB; vídeo 1280×720 ≤ 1,5 MB cada.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLUGS } from './slugs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const SITE = path.join(ROOT, 'complexodmc.com.br');
const IMG = path.join(SITE, 'assets/images/verticais');
const VID = path.join(SITE, 'assets/videos/verticais');
const FF = '/opt/homebrew/bin/ffmpeg';
const CWEBP = '/opt/homebrew/bin/cwebp';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const only = arg('only') ? arg('only').split(',') : null;
const FPS = Number(arg('fps', 24));
const KB = 1024;
const BUDGET = { webp: 140 * KB, mobile: 60 * KB, video: 1536 * KB };
fs.mkdirSync(IMG, { recursive: true }); fs.mkdirSync(VID, { recursive: true });
const sz = (f) => fs.statSync(f).size;
const run = (cmd, a) => execFileSync(cmd, a, { stdio: ['ignore', 'ignore', 'pipe'] });
const report = [];

function webp(src, dst, limit) {
  for (const q of [82, 78, 74, 72, 68, 64, 60, 56]) {
    run(CWEBP, ['-quiet', '-q', String(q), '-m', '6', '-sharp_yuv', '-mt', src, '-o', dst]);
    if (sz(dst) <= limit) return { bytes: sz(dst), cmd: `cwebp -q ${q} -m 6 -sharp_yuv` };
  }
  return { bytes: sz(dst), cmd: 'cwebp q56 (ESTOUROU)' };
}
function webm(dir, dst, limit) {
  for (const crf of [34, 38, 42, 46, 50]) {
    run(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'f_%04d.png'), '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-g', '72', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '1', '-pix_fmt', 'yuv420p', dst]);
    if (sz(dst) <= limit) return { bytes: sz(dst), cmd: `vp9 crf ${crf}` };
  }
  return { bytes: sz(dst), cmd: 'vp9 crf 50 (ESTOUROU)' };
}
function mp4(dir, dst, limit) {
  for (const crf of [23, 26, 29, 32, 35]) {
    run(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'f_%04d.png'), '-an', '-c:v', 'libx264', '-preset', 'slow', '-tune', 'film', '-crf', String(crf), '-g', '72', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-movflags', '+faststart', dst]);
    if (sz(dst) <= limit) return { bytes: sz(dst), cmd: `x264 crf ${crf}` };
  }
  return { bytes: sz(dst), cmd: 'x264 crf 35 (ESTOUROU)' };
}

for (const slug of SLUGS) {
  if (only && !only.includes(slug)) continue;
  for (const [suffix, lim] of [['', BUDGET.webp], ['-m', BUDGET.mobile]]) {
    const src = path.join(here, 'out/stills', `${slug}${suffix}.png`);
    if (!fs.existsSync(src)) { console.warn('faltando', src); continue; }
    const dst = path.join(IMG, `${slug}-hero${suffix}.webp`);
    const w = webp(src, dst, lim); report.push({ arquivo: path.relative(SITE, dst), bytes: w.bytes, limite: lim, cmd: w.cmd });
    console.log(`${slug}${suffix}: webp ${(w.bytes / KB).toFixed(1)} KB (${w.cmd})`);
  }
  if (argv.includes('--skip-video')) continue;
  const dir = path.join(here, 'out/frames', slug);
  if (!fs.existsSync(dir)) { console.warn('faltando quadros', dir); continue; }
  const wm = webm(dir, path.join(VID, `${slug}-hero.webm`), BUDGET.video); report.push({ arquivo: `assets/videos/verticais/${slug}-hero.webm`, bytes: wm.bytes, limite: BUDGET.video, cmd: wm.cmd });
  const m4 = mp4(dir, path.join(VID, `${slug}-hero.mp4`), BUDGET.video); report.push({ arquivo: `assets/videos/verticais/${slug}-hero.mp4`, bytes: m4.bytes, limite: BUDGET.video, cmd: m4.cmd });
  console.log(`${slug}: webm ${(wm.bytes / KB).toFixed(0)} KB (${wm.cmd}) · mp4 ${(m4.bytes / KB).toFixed(0)} KB (${m4.cmd})`);
}
const pj = path.join(here, 'out', 'pesos.json');
const prev = fs.existsSync(pj) ? JSON.parse(fs.readFileSync(pj, 'utf8')) : [];
const feitos = new Set(report.map((r) => r.arquivo));
fs.writeFileSync(pj, JSON.stringify([...prev.filter((r) => !feitos.has(r.arquivo)), ...report].sort((x, y) => x.arquivo.localeCompare(y.arquivo)), null, 2));
console.log('→ out/pesos.json');
