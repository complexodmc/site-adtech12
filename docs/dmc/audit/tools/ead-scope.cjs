// Delimita escopo da plataforma EAD: o que cada página carrega, o que é
// compartilhado com o site institucional, como a home/menu linka para a EAD.
// Uso: node docs/dmc/audit/tools/ead-scope.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8080/complexodmc.com.br/';
const OUT = path.resolve(__dirname, '../2026-10-17/ead');
fs.mkdirSync(OUT, { recursive: true });

const EAD = ['index.html', 'login.html', 'dashboard.html', 'loja.html', 'obrigado.html',
  'certificado.html', 'certificados.html', 'aula.html', 'admin.html', 'meus-cursos.html', 'ao-vivo.html']
  .map((p) => 'plataforma-ead/' + p);
const INST = ['index.html', 'pages/planejamento-sucessorio.html',
  'solucoes/consultoria-trabalhista/ciclo-fechado.html', 'em-construcao.html'];

(async () => {
  const browser = await chromium.launch();
  const result = { ead: {}, institucional: {}, compartilhados: {}, geradoEm: new Date().toISOString() };

  async function visit(rel, opts = {}) {
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const reqs = [];
    const errs = [];
    page.on('response', (r) => {
      const u = r.url();
      if (u.startsWith('http://127.0.0.1:8080')) reqs.push({ url: u.replace('http://127.0.0.1:8080', ''), status: r.status(), type: r.request().resourceType() });
      else reqs.push({ url: u.split('?')[0], status: r.status(), type: r.request().resourceType(), externo: true });
    });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 200)));
    await page.goto(BASE + rel, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => errs.push('goto: ' + e.message.slice(0, 120)));
    await page.waitForTimeout(opts.wait || 1500);
    const info = await page.evaluate(() => ({
      finalPath: location.pathname + location.search,
      title: document.title,
      bodyClass: document.body.className,
      three: window.THREE ? window.THREE.REVISION : null,
      canvases: [...document.querySelectorAll('canvas')].map((c) => ({ id: c.id, w: c.width, h: c.height, cls: c.className })),
      customNavbar: !!document.querySelector('dmc-navbar'),
      linksEad: [...document.querySelectorAll('a[href*="plataforma-ead"], a[href*="em-construcao"], a[href*="adtech-app"]')]
        .map((a) => ({ text: a.textContent.trim().slice(0, 40), href: a.getAttribute('href') })),
      navCursos: (() => { const a = [...document.querySelectorAll('a')].find((x) => x.textContent.trim() === 'Cursos'); return a ? a.getAttribute('href') : null; })(),
    }));
    const shot = path.join(OUT, rel.replace(/[\/]/g, '_').replace('.html', '') + (opts.suffix || '') + '.png');
    await page.screenshot({ path: shot, fullPage: false });
    await ctx.close();
    return { ...info, requests: reqs, consoleErrors: errs, screenshot: path.relative(path.resolve(__dirname, '../..'), shot) };
  }

  for (const p of EAD) {
    result.ead[p] = await visit(p, { wait: p.includes('login') ? 4000 : 1200 });
    console.log('EAD', p, '->', result.ead[p].finalPath, result.ead[p].requests.length, 'reqs');
  }
  result.ead['plataforma-ead/login.html@mobile'] = await visit('plataforma-ead/login.html', { viewport: { width: 390, height: 844 }, wait: 4000, suffix: '_mobile' });
  for (const p of INST) {
    result.institucional[p] = await visit(p, { wait: 1200 });
    console.log('INST', p, result.institucional[p].requests.length, 'reqs');
  }

  // Arquivos pedidos pela EAD fora de /plataforma-ead/ (compartilhados ou externos)
  const shared = {};
  for (const [pg, d] of Object.entries(result.ead)) {
    for (const r of d.requests) {
      const fora = r.externo || !r.url.startsWith('/complexodmc.com.br/plataforma-ead/');
      if (fora) { (shared[r.url] ||= { status: r.status, paginas: [] }).paginas.push(pg); }
    }
  }
  result.compartilhados = shared;
  const instFiles = new Set();
  for (const d of Object.values(result.institucional)) for (const r of d.requests) instFiles.add(r.url);
  result.compartilhadosComInstitucional = Object.keys(shared).filter((u) => instFiles.has(u));

  fs.writeFileSync(path.join(OUT, 'ead-scope.json'), JSON.stringify(result, null, 2));
  console.log('compartilhados:', JSON.stringify(shared, null, 1));
  console.log('tambem carregados pelo institucional:', result.compartilhadosComInstitucional);
  await browser.close();
})();
