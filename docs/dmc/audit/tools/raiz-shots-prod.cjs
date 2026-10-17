// Rodada extra: captura em PRODUÇÃO as 5 páginas HTML da raiz (/pages/*.html) e
// registra para cada uma: status, qual URL o CSS "css/shared.css" e o logo
// "../assets/images/RINO_logo.png" resolveram, status dessas respostas e o
// texto do hero. Só leitura (GET). Saída em audit/2026-10-17/raiz-repositorio/.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const BASE = 'https://www.complexodmc.com.br';
const OUTDIR = '/Users/dmchagas/Site_Complexo_DMC/docs/dmc/audit/2026-10-17/raiz-repositorio';
fs.mkdirSync(OUTDIR, { recursive: true });
const enc = p => p.split('/').map(s => encodeURIComponent(s)).join('/');
const pages = ['/pages/Sobre.html', '/pages/Apresentação.html', '/pages/Jurídico Vendas.html', '/pages/Jurídico Imobiliário.html', '/pages/Consultoria Imobiiliária.html'];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  const relatorio = [];
  for (const p of pages) {
    const page = await ctx.newPage();
    const reqs = [];
    page.on('response', r => { const u = r.url(); if (/shared\.css|RINO_logo|LOGO_RINOCERONTE|rino-video|daniel-mathias/.test(u)) reqs.push({ url: u.replace(BASE, ''), status: r.status(), etag: r.headers()['etag'] || null, len: r.headers()['content-length'] || null }); });
    const url = BASE + enc(p);
    let status = null;
    try { const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 }); status = resp && resp.status(); await page.waitForTimeout(2500); } catch (e) { status = 'ERR ' + e.message.slice(0, 80); }
    const info = await page.evaluate(() => {
      const t = s => (document.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').trim();
      const sheets = [...document.styleSheets].map(s => s.href).filter(Boolean);
      const logo = document.querySelector('img[src*="RINO_logo"]');
      return { title: document.title, h1: t('h1'), primeiroH2: t('h2'), stylesheets: sheets, logoCurrentSrc: logo ? logo.currentSrc : null, logoNatural: logo ? logo.naturalWidth : null, bodyChars: document.body.innerText.length };
    }).catch(e => ({ erro: e.message }));
    const slug = p.replace(/^\/pages\//, '').replace(/\.html$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    const shot = path.join(OUTDIR, `prod-raiz-${slug}-1440-topo.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    relatorio.push({ path: p, url, status, ...info, respostasRelevantes: reqs, screenshot: shot });
    console.log(`${p} → ${status} | title="${info.title}" | css=${JSON.stringify(info.stylesheets)} | logo=${info.logoCurrentSrc} (${info.logoNatural}px)`);
    reqs.forEach(r => console.log(`     ${r.status} ${r.url} etag=${r.etag} len=${r.len}`));
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUTDIR, 'prod-raiz-paginas.json'), JSON.stringify({ geradoEm: new Date().toISOString(), base: BASE, paginas: relatorio }, null, 2));
  console.log('salvo', path.join(OUTDIR, 'prod-raiz-paginas.json'));
})();
