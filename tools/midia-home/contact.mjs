// Contact sheet das cinco cenas (posters desktop, lado a lado) → docs/dmc/home-redesign/midia-contact-sheet.png
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const SLUGS = ['construcao', 'familias', 'grupos', 'patrimonio', 'terras'];
const out = path.join(ROOT, 'docs/dmc/home-redesign/midia-contact-sheet.png');
const inputs = SLUGS.flatMap((s) => ['-i', path.join(here, 'out/stills', s + '.png')]);
const H = 640;
// (sem drawtext: o ffmpeg desta máquina não o compila; ordem = construcao, familias, grupos, patrimonio, terras)
const fc = SLUGS.map((s, i) => `[${i}:v]scale=-2:${H},pad=iw+12:ih:0:0:0x0b0c0e[v${i}]`).join(';')
  + ';' + SLUGS.map((_, i) => `[v${i}]`).join('') + `hstack=inputs=${SLUGS.length}[o]`;
execFileSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', fc, '-map', '[o]', '-frames:v', '1', out]);
console.log('→', out);
