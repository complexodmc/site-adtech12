// SEO on-page no HTML servido (sem JS, como um robô): <title> e meta description
// presentes e únicos, canonical absoluta = URL do sitemap, JSON-LD que faz parse e
// sem LegalService/ProfessionalService; robots.txt e sitemap.xml.
import { test, expect } from '@playwright/test';
import { PAGINAS, ORIGEM_PROD, causa, pagina, anexar } from './_site.js';

const TIPOS_PROIBIDOS = ['LegalService', 'ProfessionalService', 'Attorney']; // Attorney é subtipo de LegalService

let MAPA = null; // caminho → { title, desc } a partir do HTML cru
async function mapaCru(request) {
  if (MAPA) return MAPA;
  MAPA = {};
  for (const p of PAGINAS) {
    const html = await (await request.get(p.caminho)).text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '';
    const desc = (html.match(/<meta\s+[^>]*name=["']description["'][^>]*>/i) || [''])[0].match(/content\s*=\s*["']([^"']*)["']/i)?.[1]?.trim() || '';
    MAPA[p.caminho] = { title, desc };
  }
  return MAPA;
}

function tiposJsonLd(no, acc = []) {
  if (Array.isArray(no)) { no.forEach((n) => tiposJsonLd(n, acc)); return acc; }
  if (no && typeof no === 'object') {
    const t = no['@type'];
    if (t) (Array.isArray(t) ? t : [t]).forEach((x) => acc.push(String(x)));
    Object.values(no).forEach((v) => tiposJsonLd(v, acc));
  }
  return acc;
}

test.describe('on-page', () => {
  test.use({ javaScriptEnabled: false });
  for (const p of PAGINAS) {
    test(p.caminho, async ({ page, request }) => {
      pagina(p.caminho);
      const mapa = await mapaCru(request);
      await page.goto(p.caminho, { waitUntil: 'domcontentloaded' });
      const d = await page.evaluate(() => ({
        title: document.title.trim(),
        desc: [...document.querySelectorAll('meta[name="description"]')].map((m) => (m.content || '').trim()),
        canon: [...document.querySelectorAll('link[rel="canonical"]')].map((l) => l.getAttribute('href')),
        ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent)
      }));
      const problemas = [];
      if (!d.title) problemas.push('<title> ausente');
      const repetidoT = Object.entries(mapa).filter(([c, v]) => c !== p.caminho && v.title && v.title === d.title).map(([c]) => c);
      if (repetidoT.length) problemas.push(`<title> repetido (${repetidoT.length} páginas)`);
      if (d.desc.length !== 1 || !d.desc[0]) problemas.push(d.desc.length > 1 ? 'meta description duplicada na página' : 'meta description ausente');
      const repetidoD = Object.entries(mapa).filter(([c, v]) => c !== p.caminho && v.desc && v.desc === d.desc[0]).map(([c]) => c);
      if (repetidoD.length) problemas.push(`meta description repetida (${repetidoD.length} páginas)`);
      if (d.canon.length !== 1) problemas.push(d.canon.length ? 'mais de uma canonical' : 'canonical ausente');
      else if (!/^https:\/\/www\.complexodmc\.com\.br\//.test(d.canon[0])) problemas.push('canonical não absoluta em https://www.complexodmc.com.br');
      else if (d.canon[0] !== p.loc) problemas.push('canonical ≠ URL do sitemap');
      const tipos = [];
      d.ld.forEach((txt, i) => {
        try { tiposJsonLd(JSON.parse(txt), tipos); } catch (e) { problemas.push(`JSON-LD #${i + 1} não faz parse`); }
      });
      const proibidos = tipos.filter((t) => TIPOS_PROIBIDOS.includes(t));
      if (proibidos.length) problemas.push(`JSON-LD com ${[...new Set(proibidos)].join('/')}`);
      await anexar('seo.json', { ...d, ld: d.ld.length, tipos, repetidoT, repetidoD, problemas });
      problemas.forEach((x) => causa(x));
      expect(problemas, JSON.stringify({ title: d.title, canon: d.canon, esperado: p.loc })).toEqual([]);
    });
  }
});

test.describe('robots.txt e sitemap.xml', () => {
  test('robots.txt: 200, aponta o sitemap e não bloqueia o site', async ({ request }) => {
    const r = await request.get('/robots.txt', { maxRedirects: 0 });
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toMatch(/text\/plain/);
    const t = await r.text();
    expect(t).toContain(`Sitemap: ${ORIGEM_PROD}/sitemap.xml`);
    expect(t).not.toMatch(/^Disallow:\s*\/\s*$/m);
  });

  test('sitemap.xml: 200, XML, URLs absolutas de produção, sem duplicatas', async ({ request }) => {
    const r = await request.get('/sitemap.xml', { maxRedirects: 0 });
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toMatch(/xml/);
    const locs = PAGINAS.map((p) => p.loc);
    expect(locs.length).toBeGreaterThan(0);
    expect(new Set(locs).size).toBe(locs.length);
    for (const l of locs) expect(l).toMatch(/^https:\/\/www\.complexodmc\.com\.br\//);
  });
});
