// Checklist rápido de acessibilidade via Playwright (home + 3 internas + todas as páginas públicas, modo leve)
// Uso: node docs/dmc/audit/tools/baseline-a11y.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/dmchagas/Site_Complexo_DMC';
const OUT = path.join(ROOT, 'docs/dmc/audit/2026-10-17/metricas-baseline');
const BASE = 'http://127.0.0.1:8080/complexodmc.com.br';

const PAGES = [
  ['home', `${BASE}/index.html`],
  ['planejamento-sucessorio', `${BASE}/pages/planejamento-sucessorio.html`],
  ['consultoria-imobiliaria', `${BASE}/pages/consultoria-imobiliaria.html`],
  ['ciclo-fechado', `${BASE}/solucoes/consultoria-trabalhista/ciclo-fechado.html`],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const results = [];

for (const [name, url] of PAGES) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
    const lang = document.documentElement.getAttribute('lang');
    const h1s = [...document.querySelectorAll('h1')].map((h) => h.textContent.trim().replace(/\s+/g, ' ').slice(0, 90));
    const imgsNoAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).map((i) => `${describe(i)} src=${(i.getAttribute('src') || '').slice(-60)}`);
    const imgsEmptyAlt = document.querySelectorAll('img[alt=""]').length;
    const accName = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) || el.textContent || '').trim();
    const btnsNoName = [...document.querySelectorAll('button, [role="button"], input[type=submit], input[type=button]')]
      .filter((b) => !accName(b) && !(b.value || '').trim() && !b.querySelector('img[alt]:not([alt=""])'))
      .map(describe);
    const linksNoName = [...document.querySelectorAll('a[href]')].filter((a) => !accName(a) && !a.querySelector('img[alt]:not([alt=""])')).map((a) => `${describe(a)} href=${(a.getAttribute('href') || '').slice(0, 50)}`);
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => h.tagName);
    const skips = [];
    let last = 0;
    for (const h of headings) { const n = +h[1]; if (last && n > last + 1) skips.push(`${'H' + last}→${h}`); last = n; }
    const inputsNoLabel = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select')]
      .filter((i) => !(i.id && document.querySelector(`label[for="${i.id}"]`)) && !i.closest('label') && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby'))
      .map(describe);
    const viewportMeta = document.querySelector('meta[name=viewport]')?.content || null;
    const title = document.title;
    const metaDesc = document.querySelector('meta[name=description]')?.content || null;

    // contraste aproximado do hero: primeiro h1 vs cor de fundo efetiva (sem levar em conta imagem/vídeo)
    function parse(c) { const m = c.match(/[\d.]+/g); return m ? m.slice(0, 4).map(Number) : null; }
    function lum([r, g, b]) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
    function bgOf(el) {
      let e = el;
      while (e) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && (c.length < 4 || c[3] > 0)) return { rgb: c, from: describe(e) };
        e = e.parentElement;
      }
      return { rgb: [255, 255, 255], from: 'default-white' };
    }
    let hero = null;
    const h1 = document.querySelector('h1');
    if (h1) {
      const fg = parse(getComputedStyle(h1).color);
      const bg = bgOf(h1);
      const l1 = lum(fg), l2 = lum(bg.rgb);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const heroSection = h1.closest('section, header, div[class*=hero]');
      const hasMedia = !!heroSection?.querySelector('video, img, picture, canvas') || /url\(/.test(getComputedStyle(heroSection || h1).backgroundImage);
      hero = { h1: h1.textContent.trim().replace(/\s+/g, ' ').slice(0, 80), fg: getComputedStyle(h1).color, bg: `rgb(${bg.rgb.slice(0, 3).join(',')}) via ${bg.from}`, ratio: +ratio.toFixed(2), fontSizePx: parseFloat(getComputedStyle(h1).fontSize), heroHasMediaBehind: hasMedia, note: hasMedia ? 'há mídia/imagem de fundo: contraste real depende do frame' : '' };
    }
    return { lang, title, metaDesc, viewportMeta, h1Count: h1s.length, h1s, imgsTotal: document.querySelectorAll('img').length, imgsNoAlt, imgsEmptyAlt, btnsNoName, linksNoName, headingSkips: skips, inputsNoLabel, hero };
  });
  results.push({ page: name, url, ...r });
  console.log(`${name}: lang=${r.lang} h1=${r.h1Count} imgNoAlt=${r.imgsNoAlt.length} btnNoName=${r.btnsNoName.length} linkNoName=${r.linksNoName.length} inputNoLabel=${r.inputsNoLabel.length} heroContrast=${r.hero?.ratio}`);
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'a11y.json'), JSON.stringify(results, null, 2));
console.log('saved', path.join(OUT, 'a11y.json'));
