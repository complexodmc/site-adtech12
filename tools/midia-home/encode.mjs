// Codifica posters (AVIF/WebP) e loops (WebM/MP4) a partir de out/ e grava nos caminhos finais.
//   node tools/midia-home/encode.mjs            # tudo
//   node tools/midia-home/encode.mjs --only terras --skip-video
// Orçamentos (HOME_REDESIGN §4): poster desktop ≤110 KB AVIF/≤150 KB WebP (construção) e
// ≤90/≤120 KB (demais); mobile ≤60/≤80 KB; vídeo ≤1 MB cada. Se estourar, aperta e repete.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const SITE = path.join(ROOT, 'complexodmc.com.br');
const IMG = path.join(SITE, 'assets/images/home');
const VID = path.join(SITE, 'assets/videos/home');
const FF = '/opt/homebrew/bin/ffmpeg';
const CWEBP = '/opt/homebrew/bin/cwebp';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const only = arg('only') ? arg('only').split(',') : null;
const FPS = Number(arg('fps', 24));
const KB = 1024;
const SLUGS = ['construcao', 'familias', 'grupos', 'patrimonio', 'terras'];
const BUDGET = {
  construcao: { avif: 110 * KB, webp: 150 * KB }, default: { avif: 90 * KB, webp: 120 * KB },
  mobile: { avif: 60 * KB, webp: 80 * KB }, video: 1024 * KB,
};
fs.mkdirSync(IMG, { recursive: true }); fs.mkdirSync(VID, { recursive: true });
const sz = (f) => fs.statSync(f).size;
const run = (cmd, a) => execFileSync(cmd, a, { stdio: ['ignore', 'ignore', 'pipe'] });
const report = []; // {arquivo, bytes, limite, cmd}

function avif(src, dst, limit) {
  for (const crf of [22, 26, 30, 34, 38, 42]) {
    const a = ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-frames:v', '1', '-c:v', 'libsvtav1', '-crf', String(crf), '-preset', '2', '-pix_fmt', 'yuv420p', '-svtav1-params', 'tune=0:film-grain-denoise=0', dst];
    run(FF, a);
    if (sz(dst) <= limit) return { bytes: sz(dst), cmd: `ffmpeg -i in.png -frames:v 1 -c:v libsvtav1 -crf ${crf} -preset 2 -pix_fmt yuv420p -svtav1-params tune=0:film-grain-denoise=0 out.avif` };
  }
  return { bytes: sz(dst), cmd: 'ffmpeg libsvtav1 crf 42 (ESTOUROU)' };
}
function webp(src, dst, limit) {
  for (const q of [78, 72, 66, 60, 54]) {
    run(CWEBP, ['-quiet', '-q', String(q), '-m', '6', '-sharp_yuv', '-mt', src, '-o', dst]);
    if (sz(dst) <= limit) return { bytes: sz(dst), cmd: `cwebp -q ${q} -m 6 -sharp_yuv in.png -o out.webp` };
  }
  return { bytes: sz(dst), cmd: 'cwebp q54 (ESTOUROU)' };
}
function webm(dir, dst, limit) {
  for (const crf of [36, 40, 44, 48]) {
    const a = ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'f_%04d.png'), '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-g', '60', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '1', '-pix_fmt', 'yuv420p', dst];
    run(FF, a);
    if (sz(dst) <= limit) return { bytes: sz(dst), cmd: `ffmpeg -framerate ${FPS} -i f_%04d.png -an -c:v libvpx-vp9 -b:v 0 -crf ${crf} -g 60 -row-mt 1 -deadline good -cpu-used 1 -pix_fmt yuv420p out.webm` };
  }
  return { bytes: sz(dst), cmd: 'vp9 crf 48 (ESTOUROU)' };
}
function mp4(dir, dst, limit) {
  for (const crf of [24, 27, 30, 33, 36]) {
    const a = ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'f_%04d.png'), '-an', '-c:v', 'libx264', '-preset', 'slow', '-tune', 'film', '-crf', String(crf), '-g', '60', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-movflags', '+faststart', dst];
    run(FF, a);
    if (sz(dst) <= limit) return { bytes: sz(dst), cmd: `ffmpeg -framerate ${FPS} -i f_%04d.png -an -c:v libx264 -preset slow -tune film -crf ${crf} -g 60 -pix_fmt yuv420p -profile:v high -level 4.1 -movflags +faststart out.mp4` };
  }
  return { bytes: sz(dst), cmd: 'x264 crf 36 (ESTOUROU)' };
}

for (const slug of SLUGS) {
  if (only && !only.includes(slug)) continue;
  const B = BUDGET[slug] || BUDGET.default;
  for (const [suffix, lim] of [['', B], ['-m', BUDGET.mobile]]) {
    const src = path.join(here, 'out/stills', `${slug}${suffix}.png`);
    if (!fs.existsSync(src)) { console.warn('faltando', src); continue; }
    const base = path.join(IMG, `vertical-${slug}${suffix}`);
    const a = avif(src, base + '.avif', lim.avif); report.push({ arquivo: `assets/images/home/vertical-${slug}${suffix}.avif`, bytes: a.bytes, limite: lim.avif, cmd: a.cmd });
    const w = webp(src, base + '.webp', lim.webp); report.push({ arquivo: `assets/images/home/vertical-${slug}${suffix}.webp`, bytes: w.bytes, limite: lim.webp, cmd: w.cmd });
    console.log(`${slug}${suffix}: avif ${(a.bytes / KB).toFixed(1)} KB · webp ${(w.bytes / KB).toFixed(1)} KB`);
  }
  if (argv.includes('--skip-video')) continue;
  const dir = path.join(here, 'out/frames', slug);
  if (!fs.existsSync(dir)) { console.warn('faltando quadros', dir); continue; }
  const wm = webm(dir, path.join(VID, `vertical-${slug}.webm`), BUDGET.video); report.push({ arquivo: `assets/videos/home/vertical-${slug}.webm`, bytes: wm.bytes, limite: BUDGET.video, cmd: wm.cmd });
  const m4 = mp4(dir, path.join(VID, `vertical-${slug}.mp4`), BUDGET.video); report.push({ arquivo: `assets/videos/home/vertical-${slug}.mp4`, bytes: m4.bytes, limite: BUDGET.video, cmd: m4.cmd });
  console.log(`${slug}: webm ${(wm.bytes / KB).toFixed(0)} KB · mp4 ${(m4.bytes / KB).toFixed(0)} KB`);
}
const pj = path.join(here, 'out', 'pesos.json');
const prev = fs.existsSync(pj) ? JSON.parse(fs.readFileSync(pj, 'utf8')) : [];
const feitos = new Set(report.map((r) => r.arquivo));
fs.writeFileSync(pj, JSON.stringify([...prev.filter((r) => !feitos.has(r.arquivo)), ...report].sort((x, y) => x.arquivo.localeCompare(y.arquivo)), null, 2));
console.log('→ out/pesos.json');
