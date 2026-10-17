// Extrai metadados estruturais de cada página interna via Playwright (DOM renderizado).
// Uso: node docs/dmc/audit/tools/extract-paginas-internas.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = '/Users/dmchagas/Site_Complexo_DMC/complexodmc.com.br';
const BASE = 'http://127.0.0.1:8080/complexodmc.com.br/';
const OUT = '/Users/dmchagas/Site_Complexo_DMC/docs/dmc/audit/2026-10-17/paginas-internas';

const pages = [
  ...fs.readdirSync(path.join(ROOT, 'pages')).filter(f => f.endsWith('.html')).map(f => 'pages/' + f),
  ...fs.readdirSync(path.join(ROOT, 'solucoes/consultoria-trabalhista')).filter(f => f.endsWith('.html')).map(f => 'solucoes/consultoria-trabalhista/' + f),
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const results = [];
  for (const rel of pages) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    try {
      await page.goto(BASE + rel, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(800);
      const data = await page.evaluate(() => {
        const q = s => document.querySelector(s);
        const qa = s => Array.from(document.querySelectorAll(s));
        const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
        const h = qa('h1,h2,h3').map(e => e.tagName + ': ' + txt(e)).slice(0, 60);
        const sections = qa('section, main > div').map(s => ({ tag: s.tagName, id: s.id || null, cls: s.className || null, h: txt(s.querySelector('h1,h2,h3')) }));
        const cta = q('.cta-section');
        const ctaLinks = cta ? Array.from(cta.querySelectorAll('a')).map(a => ({ text: txt(a), href: a.getAttribute('href') })) : [];
        const bodyText = document.body.innerText;
        return {
          title: document.title,
          metaDescription: q('meta[name="description"]')?.getAttribute('content') || null,
          canonical: q('link[rel="canonical"]')?.getAttribute('href') || null,
          robots: q('meta[name="robots"]')?.getAttribute('content') || null,
          h1: qa('h1').map(txt),
          h1Count: qa('h1').length,
          bodyClass: document.body.className,
          stylesheets: qa('link[rel="stylesheet"]').map(l => l.getAttribute('href')),
          scripts: qa('script[src]').map(s => s.getAttribute('src')),
          hasVideoSection: !!q('section#video'),
          hasVideoFrame: !!q('.page-video__frame'),
          videoData: q('.page-video__frame')?.getAttribute('data-video') ?? null,
          hasCtaSection: !!cta,
          ctaLinks,
          allCtaLikeLinks: qa('a.btn, a.cta, a[class*="btn"], a[class*="cta"]').map(a => ({ text: txt(a), href: a.getAttribute('href') })).slice(0, 20),
          headings: h,
          sections,
          hasFaq: !!(q('.faq, [id*="faq"], [class*="faq"], details')),
          wordCount: bodyText.split(/\s+/).filter(Boolean).length,
          navLinks: qa('nav a, header a').map(a => a.getAttribute('href')),
          footerLinks: qa('footer a').map(a => a.getAttribute('href')),
        };
      });
      data.errors = errors;
      data.file = rel;
      const shot = path.join(OUT, 'screens', rel.replace(/\//g, '__').replace('.html', '.png'));
      await page.screenshot({ path: shot, fullPage: false });
      results.push(data);
      console.log('ok', rel, data.title);
    } catch (e) {
      results.push({ file: rel, error: e.message, errors });
      console.log('ERR', rel, e.message);
    }
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'extract.json'), JSON.stringify(results, null, 2));
})();
