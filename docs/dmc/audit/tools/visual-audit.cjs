// Auditoria visual/frontend — screenshots, cobertura de CSS, fontes, cores, landmarks, foco.
// Uso: node docs/dmc/audit/tools/visual-audit.js <outDir>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8080/complexodmc.com.br/';
const PAGES = [
  ['home', 'index.html'],
  ['planejamento-sucessorio', 'pages/planejamento-sucessorio.html'],
  ['consultoria-imobiliaria', 'pages/consultoria-imobiliaria.html'],
  ['ciclo-fechado', 'solucoes/consultoria-trabalhista/ciclo-fechado.html'],
];
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

(async () => {
  const outDir = process.argv[2];
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const result = {};

  for (const [name, rel] of PAGES) {
    result[name] = {};
    for (const [vp, size] of Object.entries(VIEWPORTS)) {
      const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const consoleErrors = [];
      const resources = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
      page.on('requestfailed', (r) => consoleErrors.push('REQFAIL ' + r.url().slice(0, 140)));
      page.on('response', async (r) => {
        try {
          const h = r.headers();
          const u = r.url();
          const t = (h['content-type'] || '').split(';')[0];
          let size = Number(h['content-length'] || 0);
          if (!size && r.status() === 200) { try { size = (await r.body()).length; } catch (e) {} }
          resources.push({ url: u.replace(BASE, ''), type: t, size });
        } catch (e) {}
      });
      if (vp === 'desktop') await page.coverage.startCSSCoverage();
      try { await page.goto(BASE + rel, { waitUntil: 'load', timeout: 45000 }); } catch (e) { consoleErrors.push('GOTO ' + e.message.slice(0, 80)); }
      await page.waitForTimeout(1500);
      // scroll para disparar lazy/reveal
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, `${name}-${vp}.png`), fullPage: true });
      await page.screenshot({ path: path.join(outDir, `${name}-${vp}-fold.png`), fullPage: false });

      const info = await page.evaluate(() => {
        const cs = (el) => el ? getComputedStyle(el) : null;
        const fonts = [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family} ${f.weight} ${f.style}`);
        const h1 = document.querySelector('h1');
        const sample = (sel) => { const el = document.querySelector(sel); const s = cs(el); return s ? { sel, fontFamily: s.fontFamily, fontSize: s.fontSize, color: s.color, bg: s.backgroundColor } : null; };
        // contagem de cores computadas (text color + bg) em elementos visíveis
        const colorCount = {};
        const all = document.querySelectorAll('body *');
        let n = 0;
        for (const el of all) {
          if (n++ > 4000) break;
          const s = cs(el);
          for (const c of [s.color, s.backgroundColor, s.borderTopColor]) {
            if (!c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent') continue;
            colorCount[c] = (colorCount[c] || 0) + 1;
          }
        }
        const topColors = Object.entries(colorCount).sort((a, b) => b[1] - a[1]).slice(0, 15);
        const landmarks = {
          main: document.querySelectorAll('main, [role=main]').length,
          header: document.querySelectorAll('header, [role=banner]').length,
          nav: document.querySelectorAll('nav, [role=navigation]').length,
          footer: document.querySelectorAll('footer, [role=contentinfo]').length,
          h1: document.querySelectorAll('h1').length,
          skipLink: !!document.querySelector('a[href="#main"], a[href="#conteudo"], .skip-link'),
        };
        const headings = [...document.querySelectorAll('h1,h2,h3,h4')].map(h => h.tagName).join(' ');
        const focusables = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(el => el.offsetParent !== null);
        const hiddenOpacity0 = [...document.querySelectorAll('.reveal')].filter(el => cs(el).opacity === '0').length;
        const hScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;
        const gradientsInUse = [...all].filter(el => (cs(el).backgroundImage || '').includes('gradient')).length;
        const backdrop = [...all].filter(el => (cs(el).backdropFilter || cs(el).webkitBackdropFilter || 'none') !== 'none').length;
        const menuToggle = document.querySelector('#menuToggle');
        const rootVars = {};
        const rs = cs(document.documentElement);
        for (const v of ['--np-accent','--primary-cyan','--primary-green','--bg-primary','--text-primary','--font-primary','--font-display','--gradient-primary']) rootVars[v] = rs.getPropertyValue(v).trim().slice(0, 80);
        const bodyVars = {}; const bs = cs(document.body);
        for (const v of ['--np-accent','--np-accent-deep','--primary-cyan','--primary-green']) bodyVars[v] = bs.getPropertyValue(v).trim();
        return { title: document.title, bodyClass: document.body.className, fonts, h1: sample('h1'), body: sample('body'), h2: sample('h2'), btn: sample('.btn-primary, .np-btn, .cta-button, .page-hero__cta a, a.btn'), topColors, landmarks, headingsSeq: headings.slice(0, 200), focusableCount: focusables.length, revealOpacity0: hiddenOpacity0, totalRevealEls: document.querySelectorAll('.reveal').length, horizontalScroll: hScroll, scrollWidth: document.documentElement.scrollWidth, gradientsInUse, backdropFilterEls: backdrop, menuToggleAria: menuToggle ? { expanded: menuToggle.getAttribute('aria-expanded'), controls: menuToggle.getAttribute('aria-controls') } : null, rootVars, bodyVars, domNodes: document.getElementsByTagName('*').length };
      });

      // foco visível: Tab 6x e verificar outline/box-shadow do elemento ativo
      const focusTrace = [];
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab');
        focusTrace.push(await page.evaluate(() => { const el = document.activeElement; const s = getComputedStyle(el); return { tag: el.tagName, cls: (el.className || '').toString().slice(0, 40), outline: s.outlineStyle + ' ' + s.outlineWidth, boxShadow: s.boxShadow === 'none' ? 'none' : 'set' }; }));
      }

      let coverage = null;
      if (vp === 'desktop') {
        const cov = await page.coverage.stopCSSCoverage();
        coverage = cov.map(e => { const used = e.ranges.reduce((a, r) => a + r.end - r.start, 0); return { url: e.url.replace(BASE, '').replace(/\?.*$/, ''), total: e.text.length, used, usedPct: Math.round(100 * used / e.text.length) }; }).filter(c => c.total > 2000);
      }
      const byType = {};
      for (const r of resources) { const k = r.type || 'other'; byType[k] = byType[k] || { count: 0, bytes: 0 }; byType[k].count++; byType[k].bytes += r.size; }
      const biggest = resources.sort((a, b) => b.size - a.size).slice(0, 10).map(r => `${r.size} ${r.url.slice(0, 90)}`);
      const totalBytes = resources.reduce((a, r) => a + r.size, 0);
      result[name][vp] = { ...info, focusTrace, coverage, consoleErrors: consoleErrors.slice(0, 10), resourcesByType: byType, biggest, totalBytes, requests: resources.length };
      await ctx.close();
      console.log(name, vp, 'ok', totalBytes, 'bytes', resources.length, 'req');
    }
  }
  fs.writeFileSync(path.join(outDir, 'visual-audit.json'), JSON.stringify(result, null, 2));
  await browser.close();
})();
