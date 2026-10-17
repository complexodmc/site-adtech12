// Abre cada página no Chromium (servidor local), extrai o JSON-LD como o Google o leria
// (script[type=application/ld+json] já no DOM), conta verbos de atos privativos no texto
// VISÍVEL (document.body.innerText, não no fonte) e fotografa as seções de "entregas" de
// E5/E6. Evidências em docs/dmc/audit/2026-10-17/conformidade-schema/.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const BASE = 'http://127.0.0.1:8080/complexodmc.com.br/';
const ROOT = '/Users/dmchagas/Site_Complexo_DMC/complexodmc.com.br';
const OUTDIR = '/Users/dmchagas/Site_Complexo_DMC/docs/dmc/audit/2026-10-17/conformidade-schema';
fs.mkdirSync(OUTDIR, { recursive: true });
const list = (dir, pre) => fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.html')).sort().map(f => pre + f);
const pages = ['index.html', ...list('pages', 'pages/'), ...list('solucoes/consultoria-trabalhista', 'solucoes/consultoria-trabalhista/'), ...list('plataforma-ead', 'plataforma-ead/')];
const TERMS = {
  'execução': /execu[çc][ãa]o/gi, penhora: /penhora/gi, bloqueio: /bloqueio/gi, 'audiência': /audi[êe]ncia/gi,
  'contestação': /contesta[çc][ãa]o/gi, recurso: /\brecursos?\b/gi, ajuizar: /ajuiz/gi, defesa: /\bdefesa\b/gi,
  embargos: /\bembargos\b/gi, 'impugnação': /impugna[çc][ãa]o/gi, advogado: /advogad/gi, 'escritório': /escrit[óo]rio/gi, parceiro: /parceir/gi,
};
const typesOf = (node, acc = []) => { if (Array.isArray(node)) node.forEach(n => typesOf(n, acc)); else if (node && typeof node === 'object') { if (node['@type']) acc.push(...[].concat(node['@type'])); Object.values(node).forEach(v => typesOf(v, acc)); } return acc; };
const providersOf = (node, acc = []) => { if (Array.isArray(node)) node.forEach(n => providersOf(n, acc)); else if (node && typeof node === 'object') { if (node.provider && typeof node.provider === 'object') acc.push({ type: node.provider['@type'] || null, name: node.provider.name || null }); Object.values(node).forEach(v => providersOf(v, acc)); } return acc; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  const results = [];
  for (const rel of pages) {
    const url = BASE + rel; const r = { file: rel, url };
    try {
      const resp = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      r.status = resp ? resp.status() : null; r.finalUrl = page.url();
      await page.waitForTimeout(600);
      r.title = await page.title();
      r.metaDescription = await page.$eval('meta[name="description"]', m => m.content).catch(() => null);
      r.jsonld = await page.$$eval('script[type="application/ld+json"]', els => els.map(e => { try { return { ok: true, data: JSON.parse(e.textContent) }; } catch (err) { return { ok: false, error: String(err), raw: e.textContent.slice(0, 300) }; } }));
      r.tiposSchema = [...new Set(r.jsonld.filter(b => b.ok).flatMap(b => typesOf(b.data)))];
      r.providers = r.jsonld.filter(b => b.ok).flatMap(b => providersOf(b.data));
      const text = await page.evaluate(() => document.body ? document.body.innerText : '');
      r.textoVisivelChars = text.length;
      r.verbosNoTextoVisivel = {};
      for (const [k, re] of Object.entries(TERMS)) { const n = (text.match(re) || []).length; if (n) r.verbosNoTextoVisivel[k] = n; }
    } catch (e) { r.error = String(e); }
    results.push(r);
    console.log(`${rel} status=${r.status} tipos=${(r.tiposSchema || []).join('/') || '-'} providers=${(r.providers || []).map(p => p.type).join('/') || '-'} verbos=${JSON.stringify(r.verbosNoTextoVisivel || {})}${r.error ? ' ERRO=' + r.error : ''}`);
  }
  fs.writeFileSync(path.join(OUTDIR, 'jsonld-renderizado.json'), JSON.stringify(results, null, 2));

  const shots = [
    { file: 'pages/recuperacao-ativos.html', text: 'Bloqueio e Penhora', name: 'recuperacao-ativos-entregas.png' },
    { file: 'pages/recuperacao-ativos.html', text: 'Pedidos de bloqueio, penhora e indisponibilidade', name: 'recuperacao-ativos-fases.png' },
    { file: 'solucoes/consultoria-trabalhista/defesa-empresarial.html', text: 'A empresa defendida em todo litígio trabalhista', name: 'defesa-empresarial-hero.png' },
    { file: 'solucoes/consultoria-trabalhista/defesa-empresarial.html', text: 'Execução, sócios e grupo', name: 'defesa-empresarial-frentes.png' },
    { file: 'solucoes/consultoria-trabalhista/defesa-empresarial.html', text: 'Prova montada antes da audiência', name: 'defesa-empresarial-entregas.png' },
    { file: 'index.html', text: 'Bloqueio e penhora conduzidos até o fim', name: 'home-card-e5.png' },
  ];
  for (const s of shots) {
    try {
      await page.goto(BASE + s.file, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(600);
      const loc = page.getByText(s.text, { exact: false }).first();
      await loc.scrollIntoViewIfNeeded({ timeout: 8000 });
      await page.waitForTimeout(1200);
      // força .reveal visível para a foto
      await page.addStyleTag({ content: '.reveal{opacity:1!important;transform:none!important}' });
      const section = loc.locator('xpath=ancestor::section[1]');
      if (await section.count()) await section.first().screenshot({ path: path.join(OUTDIR, s.name), timeout: 15000 });
      else await page.screenshot({ path: path.join(OUTDIR, s.name) });
      console.log('shot', s.name);
    } catch (e) { console.log('shot FALHOU', s.name, String(e).slice(0, 160)); try { await page.screenshot({ path: path.join(OUTDIR, s.name) }); } catch {} }
  }
  await browser.close();
})();
