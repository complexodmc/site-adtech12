// Uso: node shots.cjs <outDir>
// Screenshots da home (390/1440, topo e seção dos seis eixos) em produção e local,
// e de 3 páginas internas em produção.
const { chromium } = require('playwright');
const path = require('path');
const outDir = process.argv[2];
const PROD = 'https://www.complexodmc.com.br/';
const LOCAL = 'http://127.0.0.1:8080/complexodmc.com.br/';

async function shotHome(ctx, base, tag, width) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, `home-${tag}-${width}-topo.png`) });
  const sel = await page.evaluate(() => {
    for (const s of ['.np-axes', '#eixos', '.np-pillars', '#features']) { if (document.querySelector(s)) return s; }
    return null;
  });
  if (sel) {
    const el = await page.$(sel);
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    // força .reveal visível
    await page.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('active', 'is-visible', 'revealed')));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, `home-${tag}-${width}-eixos.png`) });
    // seção completa dos eixos (elemento + banners)
    const section = await page.$(sel + '') ;
    const box = await section.boundingBox();
    const full = await page.$(await page.evaluate(s => { const e = document.querySelector(s); const sec = e.closest('section') ; if (sec) { sec.id = sec.id || 'np-eixos-sec'; return '#' + sec.id; } return s; }, sel));
    await full.screenshot({ path: path.join(outDir, `home-${tag}-${width}-eixos-secao.png`) }).catch(e => console.log('secao', e.message));
    console.log(tag, width, 'eixos selector', sel, box);
  } else console.log(tag, width, 'sem seção de eixos');
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  for (const [base, tag] of [[PROD, 'prod'], [LOCAL, 'local']]) {
    for (const w of [390, 1440]) await shotHome(ctx, base, tag, w);
  }
  const internas = ['pages/planejamento-sucessorio.html', 'pages/contabilidade.html', 'pages/tecnologia.html'];
  for (const p of internas) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROD + p, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('active', 'is-visible', 'revealed')));
    await page.screenshot({ path: path.join(outDir, 'prod-' + p.replace(/[\/.]/g, '_') + '-1440-full.png'), fullPage: true });
    await page.close();
  }
  // local: página E6 nova (não existe em produção) para comparação
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LOCAL + 'solucoes/consultoria-trabalhista/ciclo-fechado.html', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, 'local-solucoes_ciclo-fechado-1440-full.png'), fullPage: true });
  await browser.close();
})();
