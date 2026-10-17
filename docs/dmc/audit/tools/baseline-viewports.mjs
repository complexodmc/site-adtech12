// Playwright: overflow horizontal, erros de console, requisições >=400, screenshots (390/1440)
// Uso: node docs/dmc/audit/tools/baseline-viewports.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/dmchagas/Site_Complexo_DMC';
const OUT = path.join(ROOT, 'docs/dmc/audit/2026-10-17/metricas-baseline');
const SHOTS = path.join(OUT, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://127.0.0.1:8080/complexodmc.com.br';

const PAGES = [
  ['home', `${BASE}/index.html`],
  ['planejamento-sucessorio', `${BASE}/pages/planejamento-sucessorio.html`],
  ['consultoria-imobiliaria', `${BASE}/pages/consultoria-imobiliaria.html`],
  ['ciclo-fechado', `${BASE}/solucoes/consultoria-trabalhista/ciclo-fechado.html`],
];
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];

const browser = await chromium.launch();
const results = [];

for (const [name, url] of PAGES) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: w < 768 ? 844 : 900 },
      deviceScaleFactor: 1,
      isMobile: w < 768,
      hasTouch: w < 768,
    });
    const page = await ctx.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failed = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
    page.on('response', (r) => { if (r.status() >= 400) failed.push({ status: r.status(), url: r.url() }); });
    page.on('requestfailed', (r) => failed.push({ status: 'FAILED', url: r.url(), err: r.failure()?.errorText }));

    let navError = null;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    } catch (e) { navError = String(e.message).slice(0, 200); }
    await page.waitForTimeout(1200);

    const metrics = await page.evaluate(() => {
      const de = document.documentElement;
      const overflow = de.scrollWidth > de.clientWidth;
      // elementos que extrapolam a largura da viewport
      const culprits = [];
      if (overflow) {
        const vw = de.clientWidth;
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed') {
            culprits.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} right=${Math.round(r.right)}`);
            if (culprits.length >= 8) break;
          }
        }
      }
      return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflow, culprits, title: document.title };
    });

    const rec = { page: name, url, width: w, navError, ...metrics, consoleErrors, pageErrors, failedRequests: failed };
    results.push(rec);
    console.log(`${name} @${w}: overflow=${metrics.overflow} (${metrics.scrollWidth}/${metrics.clientWidth}) consoleErr=${consoleErrors.length} pageErr=${pageErrors.length} http>=400=${failed.length}`);

    if (w === 390 || w === 1440) {
      // forçar .reveal visível para a captura full-page
      await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
      await page.waitForTimeout(800);
      await page.evaluate(() => { window.scrollTo(0, 0); });
      await page.waitForTimeout(400);
      await page.addStyleTag({ content: '.reveal{opacity:1!important;transform:none!important}' });
      await page.screenshot({ path: path.join(SHOTS, `${name}-${w}.png`), fullPage: true });
    }
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'viewports.json'), JSON.stringify(results, null, 2));
console.log('saved', path.join(OUT, 'viewports.json'));
