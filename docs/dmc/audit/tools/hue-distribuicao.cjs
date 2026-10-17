// Uso: node hue-distribuicao.cjs <outJson> <video1> [video2 ...]
// Amostra 1 frame por segundo de cada vídeo e classifica os pixels por matiz (HSV):
// preto (<50 em RGB, limiar do chromakey em JS), neutro (sat<0,25), ciano/azul 160–270°,
// verde 75–160°, dourado/âmbar 25–75°, vermelho/laranja, magenta/roxo. Agrega por vídeo.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const outJson = process.argv[2];
const videos = process.argv.slice(3);

function probe(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames,r_frame_rate', '-show_entries', 'format=duration,size', '-of', 'json', file]);
  const j = JSON.parse(out); return { w: +j.streams[0].width, h: +j.streams[0].height, dur: +j.format.duration, bytes: +j.format.size, frames: +j.streams[0].nb_frames, fps: j.streams[0].r_frame_rate };
}
function classify(buf, w, h) {
  const n = w * h; const c = { preto_lt50: 0, neutro: 0, ciano_azul: 0, verde: 0, dourado_ambar: 0, vermelho_laranja: 0, magenta_roxo: 0 }; let chrom = 0;
  for (let i = 0; i < buf.length; i += 3) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 50) { c.preto_lt50++; continue; } const s = (mx - mn) / mx; if (s < 0.25) { c.neutro++; continue; } chrom++;
    const d = mx - mn; let hh = 0; if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360;
    if (hh >= 160 && hh < 270) c.ciano_azul++; else if (hh >= 75 && hh < 160) c.verde++; else if (hh >= 25 && hh < 75) c.dourado_ambar++; else if (hh < 25 || hh >= 335) c.vermelho_laranja++; else c.magenta_roxo++;
  }
  return { c, chrom, n };
}
const report = { geradoEm: new Date().toISOString(), amostragem: '1 frame/s (fps=1)', videos: [] };
for (const v of videos) {
  const p = probe(v);
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', v, '-vf', 'fps=1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1024 * 1024 * 1024 });
  const frameBytes = p.w * p.h * 3; const nFrames = Math.floor(raw.length / frameBytes);
  const tot = { preto_lt50: 0, neutro: 0, ciano_azul: 0, verde: 0, dourado_ambar: 0, vermelho_laranja: 0, magenta_roxo: 0 }; let chromTot = 0, nTot = 0; const porFrame = [];
  for (let f = 0; f < nFrames; f++) {
    const { c, chrom, n } = classify(raw.subarray(f * frameBytes, (f + 1) * frameBytes), p.w, p.h);
    for (const k in c) tot[k] += c[k]; chromTot += chrom; nTot += n;
    porFrame.push({ t: f, cromaticos_pct: +(100 * chrom / n).toFixed(1), verde_pct_crom: chrom ? +(100 * c.verde / chrom).toFixed(1) : 0, ciano_pct_crom: chrom ? +(100 * c.ciano_azul / chrom).toFixed(1) : 0, dourado_pct_crom: chrom ? +(100 * c.dourado_ambar / chrom).toFixed(1) : 0 });
  }
  const pctFrame = {}; for (const k in tot) pctFrame[k] = +(100 * tot[k] / nTot).toFixed(1);
  const pctCrom = {}; for (const k of ['ciano_azul', 'verde', 'dourado_ambar', 'vermelho_laranja', 'magenta_roxo']) pctCrom[k] = chromTot ? +(100 * tot[k] / chromTot).toFixed(1) : 0;
  report.videos.push({ arquivo: path.basename(v), ...p, framesAmostrados: nFrames, pctDoVideo: pctFrame, pctDosCromaticos: pctCrom, porFrame });
  console.log(path.basename(v), `${p.w}x${p.h}`, `${p.dur}s`, `${nFrames} frames amostrados`, 'frame:', JSON.stringify(pctFrame), 'cromáticos:', JSON.stringify(pctCrom));
}
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
console.log('salvo', outJson);
