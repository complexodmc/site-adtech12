// Carrega páginas no emulador e conta respostas >= 400 de sub-recursos e erros de console.
const { chromium } = await import(new URL('../../../../node_modules/playwright/index.mjs', import.meta.url));
const base = process.argv[2] || 'http://127.0.0.1:8081';
const pages = ['/', '/pages/planejamento-sucessorio.html', '/solucoes/consultoria-trabalhista/ciclo-fechado', '/plataforma-ead/login.html'];
const browser = await chromium.launch();
for (const p of pages) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  const bad = []; const errors = [];
  page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) bad.push(r.status() + ' ' + r.url().slice(base.length)); });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
  page.on('pageerror', e => errors.push('pageerror ' + String(e.message).slice(0, 140)));
  const resp = await page.goto(base + p, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);
  const title = await page.title();
  const h1 = await page.locator('h1').first().textContent().catch(() => '');
  console.log(JSON.stringify({ page: p, status: resp.status(), title, h1: (h1 || '').trim().slice(0, 80), subrecursos_falhos: bad, console_erros: errors }));
  await ctx.close();
}
await browser.close();
