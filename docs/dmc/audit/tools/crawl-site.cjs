// Uso: node crawl-site.js <baseUrl> <outJson> [maxPages]
// Rastreia links internos a partir da home, registra status, redirecionamentos,
// título, h1, erros de console, requisições 404 e formulários.
const { chromium } = require('playwright');
const fs = require('fs');

const base = process.argv[2];
const out = process.argv[3];
const maxPages = Number(process.argv[4] || 80);
const origin = new URL(base).origin;
const basePath = new URL(base).pathname.replace(/index\.html$/, '');

function norm(u, from) {
  try {
    const x = new URL(u, from || base);
    x.hash = '';
    return x.href;
  } catch { return null; }
}
function internal(u) {
  return u && u.startsWith(origin) && !/\.(png|jpe?g|webp|svg|mp4|pdf|css|js|ico)(\?|$)/i.test(u) && !/plataforma-ead\/.*\?/.test(u) && !/adtech/.test(u);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 (DMC-audit Playwright)' });
  const results = {};
  const queue = [norm(base)];
  const seen = new Set(queue);
  while (queue.length && Object.keys(results).length < maxPages) {
    const url = queue.shift();
    const page = await ctx.newPage();
    const consoleErrors = [];
    const failed = [];
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) consoleErrors.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
    page.on('pageerror', e => consoleErrors.push('[pageerror] ' + String(e).slice(0, 300)));
    page.on('response', r => { if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() }); });
    page.on('requestfailed', r => failed.push({ url: r.url(), status: 'failed:' + (r.failure() && r.failure().errorText) }));
    const rec = { url };
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(async e => { rec.gotoError = String(e).slice(0, 200); return page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); });
      rec.status = resp ? resp.status() : null;
      rec.finalUrl = page.url();
      // cadeia de redirecionamento
      const chain = [];
      let req = resp && resp.request();
      while (req && req.redirectedFrom()) { req = req.redirectedFrom(); chain.unshift(req.url()); }
      if (chain.length) rec.redirectChain = chain;
      rec.title = await page.title();
      rec.h1 = await page.$$eval('h1', els => els.map(e => e.innerText.trim().replace(/\s+/g, ' ')).slice(0, 3));
      rec.bodyClass = await page.evaluate(() => document.body.className);
      rec.textLen = await page.evaluate(() => document.body.innerText.length);
      rec.forms = await page.$$eval('form', fs => fs.map(f => ({ id: f.id, action: f.getAttribute('action'), method: f.getAttribute('method'), fields: [...f.querySelectorAll('input,textarea,select')].map(i => i.name || i.id || i.type) })));
      const links = await page.$$eval('a[href]', as => as.map(a => {
        const where = a.closest('nav,header') ? 'nav' : a.closest('footer') ? 'footer' : 'body';
        return { href: a.getAttribute('href'), text: (a.innerText || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80), where };
      }));
      rec.links = links.map(l => ({ ...l, abs: norm(l.href, page.url()) }));
      const txt = await page.evaluate(() => document.body.innerText);
      const txtDir = out.replace(/\.json$/, '-text'); fs.mkdirSync(txtDir, { recursive: true });
      rec.textFile = txtDir + '/' + url.replace(origin, '').replace(/[^a-z0-9.-]+/gi, '_').replace(/^_+/, '') .slice(0, 120) + '.txt';
      fs.writeFileSync(rec.textFile, txt);
      for (const l of rec.links) {
        if (internal(l.abs) && !seen.has(l.abs)) { seen.add(l.abs); queue.push(l.abs); }
      }
    } catch (e) { rec.error = String(e).slice(0, 300); }
    rec.consoleErrors = consoleErrors;
    rec.failedRequests = failed;
    results[url] = rec;
    await page.close();
    console.log(rec.status, url, rec.finalUrl !== url ? '-> ' + rec.finalUrl : '', `console=${consoleErrors.length} fail=${failed.length}`);
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  await browser.close();
})();
