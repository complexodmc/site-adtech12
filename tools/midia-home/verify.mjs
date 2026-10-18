// Verifica no Chromium do Playwright: WebM toca, avança e faz loop; MP4/AVIF/WebP carregam
// (Chromium open-source não decodifica H.264 → MP4 é checado por ffprobe; Safari: checagem manual).
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(here, '../../complexodmc.com.br');
const MIME = { '.webm': 'video/webm', '.mp4': 'video/mp4', '.avif': 'image/avif', '.webp': 'image/webp', '.html': 'text/html' };
const srv = http.createServer((req, res) => {
  const p = path.join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(SITE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  const st = fs.statSync(p); const r = req.headers.range;
  if (r) { const [a, b] = r.replace('bytes=', '').split('-'); const s = Number(a), e = b ? Number(b) : st.size - 1;
    res.writeHead(206, { 'content-type': MIME[path.extname(p)], 'content-range': `bytes ${s}-${e}/${st.size}`, 'accept-ranges': 'bytes', 'content-length': e - s + 1 });
    return fs.createReadStream(p, { start: s, end: e }).pipe(res); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'content-length': st.size, 'accept-ranges': 'bytes' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto(base + '/index.html').catch(() => {});
const SLUGS = ['construcao', 'familias', 'grupos', 'patrimonio', 'terras'];
let falhas = 0;
for (const s of SLUGS) {
  const r = await page.evaluate(async ([s, base]) => {
    const out = {};
    const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.src = `${base}/assets/videos/home/vertical-${s}.webm`; document.body.appendChild(v);
    await new Promise((res, rej) => { v.oncanplaythrough = res; v.onerror = () => rej(new Error('erro webm')); setTimeout(() => rej(new Error('timeout webm')), 15000); }).catch((e) => { out.webm = e.message; });
    if (!out.webm) {
      await v.play(); const t0 = v.currentTime; await new Promise((r) => setTimeout(r, 1500));
      out.webm = { duracao: +v.duration.toFixed(3), avancou: v.currentTime > t0 + 1, w: v.videoWidth, h: v.videoHeight };
      v.currentTime = 5.9; await new Promise((r) => setTimeout(r, 600)); out.webm.loopou = v.currentTime < 1.5 && !v.paused;
    }
    out.mp4CanPlay = document.createElement('video').canPlayType('video/mp4; codecs="avc1.640029"') || '(sem H.264 neste Chromium)';
    for (const ext of ['avif', 'webp']) for (const suf of ['', '-m']) {
      const img = new Image(); img.src = `${base}/assets/images/home/vertical-${s}${suf}.${ext}`;
      out[ext + suf] = await new Promise((res) => { img.onload = () => res(`${img.naturalWidth}x${img.naturalHeight}`); img.onerror = () => res('ERRO'); });
    }
    return out;
  }, [s, base]);
  const ok = r.webm?.avancou && r.webm?.loopou && !Object.values(r).includes('ERRO');
  if (!ok) falhas++;
  console.log(ok ? 'OK ' : 'FALHA', s, JSON.stringify(r));
}
await browser.close(); srv.close();
process.exit(falhas ? 1 : 0);
