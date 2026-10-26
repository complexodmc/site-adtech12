// Monta os filmes dos heróis da Central de Parcerias a partir dos PNG de
// render-video.mjs: WebM (VP9) e MP4 (H.264) sem áudio. O cartaz de cada
// página tem de ser o quadro 0 — onde o laço começa e termina — senão o
// vídeo salta ao entrar por cima dele; quem regrava o cartaz é
// `render.mjs --ovr` com a câmera do quadro 0, pelo build.mjs oficial.
//
//   node tools/media/parcerias/render-video.mjs --scene pl
//   node tools/media/parcerias/build-video.mjs --scene pl
//
// Saídas: complexodmc.com.br/assets/videos/parcerias-<cena>-hero.{webm,mp4}
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, '..', '..', '..');
const videos = path.join(raiz, 'complexodmc.com.br', 'assets', 'videos');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

const SCENE = arg('scene', 'hub');
const FPS = Number(arg('fps', 24));
const frames = path.resolve(arg('frames-dir', path.join(here, 'out', 'video', SCENE)));

const n = (await fs.readdir(frames)).filter((f) => /^f-\d+\.png$/.test(f)).length;
if (!n) throw new Error(`sem quadros em ${frames} — rode render-video.mjs --scene ${SCENE} antes`);
console.log(`[${SCENE}] ${n} quadros · ${(n / FPS).toFixed(1)}s a ${FPS} fps`);

const entrada = ['-framerate', String(FPS), '-i', path.join(frames, 'f-%04d.png')];
const kb = async (p) => ((await fs.stat(p)).size / 1024).toFixed(0) + ' KB';

// WebM (VP9): o menor dos dois; é o primeiro <source> da página.
const webm = path.join(videos, `parcerias-${SCENE}-hero.webm`);
await run(FFMPEG, ['-y', '-loglevel', 'error', ...entrada, '-an',
  '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0', '-row-mt', '1',
  '-g', String(FPS * 2), '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', webm]);
console.log('webm:', await kb(webm));

// MP4 (H.264): compatibilidade; faststart para começar sem baixar tudo.
const mp4 = path.join(videos, `parcerias-${SCENE}-hero.mp4`);
await run(FFMPEG, ['-y', '-loglevel', 'error', ...entrada, '-an',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-profile:v', 'high',
  '-g', String(FPS * 2), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
console.log('mp4: ', await kb(mp4));
