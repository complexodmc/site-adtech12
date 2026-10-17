// Tamanhos dos assets carregados pela home (bytes por tipo), desktop e mobile
// Uso: node docs/dmc/audit/tools/baseline-assets.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/dmchagas/Site_Complexo_DMC';
const OUT = path.join(ROOT, 'docs/dmc/audit/2026-10-17/metricas-baseline');
const PAGE_URL = 'http://127.0.0.1:8080/complexodmc.com.br/index.html';

const browser = await chromium.launch();
const report = {};

for (const [label, vp] of [['desktop-1440', { width: 1440, height: 900, isMobile: false }], ['mobile-390', { width: 390, height: 844, isMobile: true }]]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile });
  const page = await ctx.newPage();
  const entries = [];
  page.on('response', async (res) => {
    const req = res.request();
    let size = 0;
    try { const b = await res.body(); size = b.length; } catch { /* streams/redirects */ }
    const h = res.headers();
    entries.push({ url: res.url(), type: req.resourceType(), status: res.status(), bytes: size, contentLength: +(h['content-length'] || 0), contentType: h['content-type'] || '' });
  });
  await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  // rolar para disparar lazy-load
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(2500);

  const byType = {};
  for (const e of entries) {
    const b = e.bytes || e.contentLength || 0;
    byType[e.type] ??= { count: 0, bytes: 0 };
    byType[e.type].count++; byType[e.type].bytes += b;
  }
  const total = Object.values(byType).reduce((a, t) => a + t.bytes, 0);
  const top = [...entries].sort((a, b) => (b.bytes || b.contentLength) - (a.bytes || a.contentLength)).slice(0, 15).map((e) => ({ url: e.url.replace('http://127.0.0.1:8080/complexodmc.com.br', ''), type: e.type, bytes: e.bytes || e.contentLength, contentLength: e.contentLength }));
  report[label] = { requests: entries.length, totalBytes: total, byType, top15: top, thirdParty: [...new Set(entries.filter((e) => !e.url.startsWith('http://127.0.0.1')).map((e) => new URL(e.url).host))] };
  console.log(label, 'requests', entries.length, 'total', (total / 1024 / 1024).toFixed(2), 'MB');
  for (const [t, v] of Object.entries(byType)) console.log(`  ${t.padEnd(12)} ${String(v.count).padStart(3)}  ${(v.bytes / 1024).toFixed(0).padStart(7)} KB`);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'assets-home.json'), JSON.stringify(report, null, 2));
console.log('saved', path.join(OUT, 'assets-home.json'));
