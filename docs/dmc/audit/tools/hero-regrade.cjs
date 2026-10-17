// Uso: node hero-regrade.cjs <videosDir> <outDir>
// Testa regrade por ffmpeg de rino-hero.mp4 e rino-video-transparent.mp4 para a paleta
// preto/grafite/dourado, com três abordagens:
//   hue-rot    — hue=h=-140 (rotação global: ciano→dourado, mas verde→vermelho)
//   gold-mono  — dessatura e tinge de dourado (monocromático dourado)
//   lut3d      — LUT 3D seletiva gerada aqui: ciano/azul→dourado, verde→grafite (neutro), resto preservado
// Para cada frame de referência mede a distribuição de matiz (antes/depois) e grava
// tiras de comparação (antes | hue-rot | gold-mono | lut3d). Também testa alpha nativo
// (VP9 .webm e HEVC .mov) como substituto do chromakey em JS.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const videosDir = process.argv[2];
const outDir = process.argv[3];
fs.mkdirSync(outDir, { recursive: true });

const GOLD_HUE = 45;
const VIDEOS = [
  { id: 'rino-hero', file: 'rino-hero.mp4', ts: [1.0, 4.0, 8.0], w: 1280, h: 720 },
  { id: 'rino-transparent', file: 'rino-video-transparent.mp4', ts: [1.0, 3.0], w: 480, h: 480 },
];

// ---------- LUT 3D seletiva ----------
function rgb2hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0; if (d > 0) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, max > 0 ? d / max : 0, max];
}
function hsv2rgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}
const smooth = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
// peso 1 dentro de [a,b], transição suave de `f` graus nas bordas
function band(h, a, b, f) { if (h < a - f || h > b + f) return 0; if (h >= a && h <= b) return 1; return h < a ? smooth((h - (a - f)) / f) : smooth(((b + f) - h) / f); }
function remap(r, g, b) {
  const [h, s, v] = rgb2hsv(r, g, b);
  if (s < 0.08) return [r, g, b];
  const wCyan = band(h, 160, 270, 12);   // ciano/azul → dourado
  const wGreen = band(h, 75, 148, 12);   // verde → grafite (quase neutro)
  let out = [r, g, b];
  if (wCyan > 0) { const t = hsv2rgb(GOLD_HUE, Math.min(1, s * 0.9), v); out = out.map((c, i) => c * (1 - wCyan) + t[i] * wCyan); }
  if (wGreen > 0) { const t = hsv2rgb(GOLD_HUE, s * 0.12, v * 0.92); out = out.map((c, i) => c * (1 - wGreen) + t[i] * wGreen); }
  return out;
}
function writeLut(file, N = 33) {
  const lines = ['TITLE "DMC ciano->dourado, verde->grafite"', `LUT_3D_SIZE ${N}`];
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    const [r, g, b] = remap(ri / (N - 1), gi / (N - 1), bi / (N - 1));
    lines.push(`${r.toFixed(5)} ${g.toFixed(5)} ${b.toFixed(5)}`);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
}
const lutFile = path.join(outDir, 'dmc-dourado.cube');
writeLut(lutFile);

const GRADES = {
  'hue-rot': 'hue=h=-140',
  'gold-mono': 'hue=s=0,colorchannelmixer=rr=0.92:gg=0.74:bb=0.36',
  'lut3d': `lut3d=file=${lutFile}:interp=trilinear`,
};

// ---------- estatística de cor de um frame ----------
function ff(args, opts = {}) { return execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 256 * 1024 * 1024, ...opts }); }
function frameStats(input, t, vf, w, h) {
  const args = ['-ss', String(t), '-i', input, '-frames:v', '1'];
  if (vf) args.push('-vf', vf);
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgb24', '-');
  const buf = ff(args);
  const n = buf.length / 3;
  const cat = { preto_lt50: 0, neutro: 0, ciano_azul: 0, verde: 0, dourado_ambar: 0, vermelho_laranja: 0, magenta_roxo: 0 };
  let satSum = 0, chrom = 0;
  for (let i = 0; i < buf.length; i += 3) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 50) { cat.preto_lt50++; continue; }
    const s = (max - min) / max;
    if (s < 0.25) { cat.neutro++; continue; }
    chrom++; satSum += s;
    const [hh] = rgb2hsv(r / 255, g / 255, b / 255);
    if (hh >= 160 && hh < 270) cat.ciano_azul++; else if (hh >= 75 && hh < 160) cat.verde++; else if (hh >= 25 && hh < 75) cat.dourado_ambar++; else if (hh < 25 || hh >= 335) cat.vermelho_laranja++; else cat.magenta_roxo++;
  }
  const pctAll = {}; for (const k in cat) pctAll[k] = +(100 * cat[k] / n).toFixed(1);
  const pctChrom = {}; for (const k of ['ciano_azul', 'verde', 'dourado_ambar', 'vermelho_laranja', 'magenta_roxo']) pctChrom[k] = chrom ? +(100 * cat[k] / chrom).toFixed(1) : 0;
  return { pixels: n, pctDoFrame: pctAll, pctDosCromaticos: pctChrom, satMediaCromaticos: chrom ? +(satSum / chrom).toFixed(2) : 0 };
}

const report = { geradoEm: new Date().toISOString(), lut: path.basename(lutFile), grades: GRADES, videos: [] };
for (const v of VIDEOS) {
  const input = path.join(videosDir, v.file);
  const entry = { id: v.id, arquivo: v.file, bytes: fs.statSync(input).size, frames: [] };
  for (const t of v.ts) {
    const tag = `${v.id}-t${t.toFixed(1)}s`;
    const before = path.join(outDir, `${tag}-antes.png`);
    ff(['-ss', String(t), '-i', input, '-frames:v', '1', '-y', before]);
    const fr = { t, antes: { png: path.basename(before), stats: frameStats(input, t, null, v.w, v.h) }, depois: {} };
    const afterFiles = [];
    for (const [gid, vf] of Object.entries(GRADES)) {
      const after = path.join(outDir, `${tag}-depois-${gid}.png`);
      ff(['-ss', String(t), '-i', input, '-vf', vf, '-frames:v', '1', '-y', after]);
      afterFiles.push(after);
      fr.depois[gid] = { png: path.basename(after), stats: frameStats(input, t, vf, v.w, v.h) };
    }
    // tira de comparação: antes | hue-rot | gold-mono | lut3d (cada 480 px de largura)
    const strip = path.join(outDir, `${tag}-comparacao.png`);
    const inputs = [before, ...afterFiles].flatMap(f => ['-i', f]);
    const fc = [0, 1, 2, 3].map(i => `[${i}:v]scale=480:-2[s${i}]`).join(';') + ';[s0][s1][s2][s3]hstack=inputs=4[o]';
    ff([...inputs, '-filter_complex', fc, '-map', '[o]', '-y', strip]);
    fr.comparacao = path.basename(strip);
    entry.frames.push(fr);
  }
  // clipe regradado completo (lut3d) para avaliar em movimento: tamanho e tempo de encode
  const clip = path.join(outDir, `${v.id}-lut3d-dourado.mp4`);
  const t0 = Date.now();
  ff(['-i', input, '-vf', GRADES.lut3d, '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', '-y', clip]);
  entry.clipeLut3d = { arquivo: path.basename(clip), bytes: fs.statSync(clip).size, encodeMs: Date.now() - t0 };
  report.videos.push(entry);
}

// ---------- alpha nativo em vez de chromakey em JS ----------
const tr = path.join(videosDir, 'rino-video-transparent.mp4');
const alpha = {};
// colorkey: preto, similarity 0.2 ≈ limiar RGB<50 do JS (dist. euclidiana normalizada), blend 0.05 suaviza a borda
const KEY = 'colorkey=0x000000:0.2:0.05';
try {
  const webm = path.join(outDir, 'rino-transparent-alpha-vp9.webm');
  const t0 = Date.now();
  ff(['-i', tr, '-vf', `${KEY},${GRADES.lut3d},format=yuva420p`, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '34', '-deadline', 'good', '-cpu-used', '2', '-an', '-y', webm]);
  alpha.vp9 = { arquivo: path.basename(webm), bytes: fs.statSync(webm).size, encodeMs: Date.now() - t0, filtro: `${KEY},lut3d`, navegadores: 'Chrome/Edge/Firefox/Android (VP9 alpha); Safari não' };
  // frame do webm sobre fundo grafite para provar a transparência
  const over = path.join(outDir, 'rino-transparent-alpha-vp9-sobre-grafite.png');
  ff(['-c:v', 'libvpx-vp9', '-ss', '1', '-i', webm, '-filter_complex', 'color=c=0x2a2a2e:s=480x480:d=1[bg];[bg][0:v]overlay=format=auto[o]', '-map', '[o]', '-frames:v', '1', '-y', over]);
  alpha.vp9.frameSobreGrafite = path.basename(over);
} catch (e) { alpha.vp9 = { erro: String(e.stderr || e.message).slice(0, 400) }; }
try {
  const mov = path.join(outDir, 'rino-transparent-alpha-hevc.mov');
  const t0 = Date.now();
  ff(['-i', tr, '-vf', `${KEY},${GRADES.lut3d},format=bgra`, '-c:v', 'hevc_videotoolbox', '-alpha_quality', '0.8', '-q:v', '55', '-tag:v', 'hvc1', '-an', '-y', mov]);
  alpha.hevc = { arquivo: path.basename(mov), bytes: fs.statSync(mov).size, encodeMs: Date.now() - t0, navegadores: 'Safari/iOS (HEVC alpha); Chrome não' };
} catch (e) { alpha.hevc = { erro: String(e.stderr || e.message).slice(0, 400) }; }
report.alphaNativo = alpha;

fs.writeFileSync(path.join(outDir, 'regrade-stats.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
