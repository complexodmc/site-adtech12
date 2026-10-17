// Rotas: sitemap → 200, redirects do vercel.json, arquivos que nunca podem
// responder 200, sub-recursos sem 4xx/5xx, links internos (crawl) → 200.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { PAGINAS, PUBLICO, abrir, rolarTudo, ehRuido, causa, pagina, anexar } from './_site.js';

// Segue redirects manualmente para registrar a cadeia.
async function statusFinal(request, url) {
  const cadeia = [];
  let atual = url;
  for (let i = 0; i < 6; i++) {
    const r = await request.get(atual, { maxRedirects: 0, failOnStatusCode: false });
    cadeia.push({ url: atual, status: r.status() });
    const loc = r.headers().location;
    if (r.status() >= 300 && r.status() < 400 && loc) { atual = new URL(loc, atual).href; continue; }
    return { status: r.status(), cadeia, tipo: r.headers()['content-type'] || '', corpo: r.status() === 200 && /html/.test(r.headers()['content-type'] || '') ? await r.text() : null };
  }
  return { status: 'loop', cadeia };
}

test.describe('sitemap → 200', () => {
  for (const p of PAGINAS) {
    test(p.caminho, async ({ request }) => {
      pagina(p.caminho);
      const r = await request.get(p.caminho, { maxRedirects: 0, failOnStatusCode: false });
      if (r.status() !== 200) causa(`URL do sitemap responde ${r.status()}`);
      expect(r.status(), p.loc).toBe(200);
      expect(r.headers()['content-type']).toContain('text/html');
    });
  }
});

// Comportamento esperado (não derivado do vercel.json, para não ser tautológico).
const REDIRECTS = [
  ['/index.html', 301, '/'],
  ['/complexodmc.com.br', 301, '/'],
  ['/complexodmc.com.br/index.html', 301, '/'],
  ['/complexodmc.com.br/pages/tecnologia.html', 301, '/pages/tecnologia.html'],
  ['/em-construcao.html', 301, '/'],
  ['/pages/planejamento-sucessorio-empresarial.html', 301, '/pages/planejamento-sucessorio.html'],
  ['/pages/Sobre.html', 301, '/'],
  ['/pages/Apresenta%C3%A7%C3%A3o.html', 301, '/pages/consultoria-imobiliaria.html'],
  ['/pages/Consultoria%20Imobiili%C3%A1ria.html', 301, '/pages/consultoria-imobiliaria.html'],
  ['/pages/Jur%C3%ADdico%20Imobili%C3%A1rio.html', 301, '/pages/juridico-imobiliario.html'],
  ['/pages/Jur%C3%ADdico%20Vendas.html', 301, '/pages/juridico-vendas.html'],
  ['/solucoes/consultoria-trabalhista', 301, '/solucoes/consultoria-trabalhista/ciclo-fechado'],
  ['/solucoes/consultoria-trabalhista/defesa-e-capital', 301, '/solucoes/consultoria-trabalhista/defesa-empresarial']
];

test.describe('redirects do vercel.json', () => {
  for (const [de, status, para] of REDIRECTS) {
    test(`${decodeURIComponent(de)} → ${status} ${para}`, async ({ request, baseURL }) => {
      pagina(de);
      const r = await request.get(de, { maxRedirects: 0, failOnStatusCode: false });
      if (r.status() !== status) causa(`redirect responde ${r.status()} (esperado ${status})`);
      expect(r.status()).toBe(status);
      expect(new URL(r.headers().location, baseURL).pathname).toBe(para);
      const fim = await statusFinal(request, new URL(r.headers().location, baseURL).href);
      if (fim.status !== 200) causa(`destino do redirect responde ${fim.status}`);
      expect(fim.status, JSON.stringify(fim.cadeia)).toBe(200);
    });
  }
  test('/solucoes/<vertical>/<slug> sem .html → rewrite 200 (não redirect)', async ({ request }) => {
    const r = await request.get('/solucoes/consultoria-trabalhista/quitacao-anual', { maxRedirects: 0 });
    expect(r.status()).toBe(200);
    expect(r.headers()['x-qa-arquivo']).toBe('solucoes/consultoria-trabalhista/quitacao-anual.html');
  });
});

const PROIBIDAS = [
  '/server/.env', '/server/.env.bak-atlas', '/server/.env.local', '/server/.env.example', '/server/src/config.js',
  '/server/package.json', '/server/uploads/', '/.env', '/.env.local', '/package.json', '/package-lock.json',
  '/vercel.json', '/.vercelignore', '/api/%5B...path%5D.js', '/docs/dmc/BRIEF.md', '/tests/server/serve.mjs',
  '/.git/config', '/node_modules/express/package.json'
];
const SEGREDO = /MONGODB_URI|JWT_SECRET|mongodb(\+srv)?:\/\/[^\s"'<]+:[^\s"'<]+@|RESEND_API_KEY|-----BEGIN [A-Z ]*PRIVATE KEY-----/;

test.describe('arquivos internos nunca 200', () => {
  for (const u of PROIBIDAS) {
    test(u, async ({ request }) => {
      pagina(u);
      const r = await request.get(u, { maxRedirects: 0, failOnStatusCode: false });
      if (r.status() === 200) causa('arquivo interno publicado (200)');
      expect(r.status()).not.toBe(200);
      const seguido = await request.get(u, { failOnStatusCode: false });
      const corpo = await seguido.text();
      expect(SEGREDO.test(corpo), 'corpo final contém marcador de segredo').toBe(false);
    });
  }

  test('varredura da pasta pública: nenhum segredo/token em arquivo servido', async () => {
    const PADROES = {
      'URI Mongo com credencial': /mongodb(\+srv)?:\/\/[^\s"'<>]+:[^\s"'<>]+@/,
      'JWT_SECRET=': /JWT_SECRET\s*[=:]\s*\S{8,}/,
      'chave Resend': /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/,
      'chave privada PEM': /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      'AWS access key': /\bAKIA[0-9A-Z]{16}\b/,
      'token GitHub': /\bgh[pousr]_[A-Za-z0-9]{36}\b/,
      'Stripe live': /\bsk_live_[A-Za-z0-9]{16,}/,
      'Slack token': /\bxox[baprs]-[A-Za-z0-9-]{10,}/
    };
    const achados = [];
    const andar = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) { andar(f); continue; }
        if (/^\.env/.test(e.name)) { achados.push({ arquivo: path.relative(PUBLICO, f), tipo: 'arquivo .env na pasta pública' }); continue; }
        if (!/\.(html?|js|mjs|css|json|xml|txt|svg|webmanifest|map)$/i.test(e.name)) continue;
        const txt = fs.readFileSync(f, 'utf8');
        for (const [tipo, re] of Object.entries(PADROES)) if (re.test(txt)) achados.push({ arquivo: path.relative(PUBLICO, f), tipo });
      }
    };
    andar(PUBLICO);
    await anexar('segredos.json', achados);
    for (const a of achados) causa(`segredo em arquivo público: ${a.tipo}`);
    expect(achados).toEqual([]);
  });
});

test.describe('sub-recursos sem 4xx/5xx', () => {
  for (const p of PAGINAS) {
    test(p.caminho, async ({ page, baseURL }) => {
      pagina(p.caminho);
      const ruins = [];
      const ignorados = [];
      page.on('response', (r) => {
        if (r.status() < 400) return;
        const ru = ehRuido(r.url());
        (ru ? ignorados : ruins).push({ url: r.url(), status: r.status(), tipo: r.request().resourceType(), ...(ru ? { motivo: ru.motivo } : {}) });
      });
      page.on('requestfailed', (rq) => {
        const falha = rq.failure()?.errorText || '';
        // ERR_ABORTED: o navegador cancelou (troca de <source>, range de mídia, navegação). Não é 4xx/5xx.
        if (/ERR_ABORTED/.test(falha)) return;
        const ru = ehRuido(rq.url(), falha);
        (ru ? ignorados : ruins).push({ url: rq.url(), falha, tipo: rq.resourceType(), ...(ru ? { motivo: ru.motivo } : {}) });
      });
      const resp = await abrir(page, p.caminho);
      expect(resp.status()).toBe(200);
      await rolarTudo(page);
      await page.waitForTimeout(500);
      await anexar('sub-recursos.json', { ruins, ignorados });
      for (const r of ruins) causa(`sub-recurso ${r.status || r.falha}: ${r.url.replace(baseURL, '')}`);
      expect(ruins).toEqual([]);
    });
  }
});

// ---------- Links internos ----------
const cacheHtml = new Map();
async function idsDaPagina(request, url) {
  const sem = url.split('#')[0];
  if (!cacheHtml.has(sem)) {
    const fim = await statusFinal(request, sem);
    const ids = new Set([...(fim.corpo || '').matchAll(/\s(?:id|name)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]));
    cacheHtml.set(sem, { fim, ids });
  }
  return cacheHtml.get(sem);
}

async function linksRenderizados(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('a[href], area[href]')).map((a) => ({ href: a.getAttribute('href'), abs: a.href })));
}

test.describe('links internos → 200', () => {
  for (const p of PAGINAS) {
    test(p.caminho, async ({ page, request, baseURL }) => {
      pagina(p.caminho);
      await abrir(page, p.caminho);
      await page.waitForTimeout(300);
      const links = await linksRenderizados(page);
      const idsAqui = new Set(await page.evaluate(() => Array.from(document.querySelectorAll('[id], a[name]')).map((e) => e.id || e.getAttribute('name'))));
      const problemas = [];
      const vistos = new Set();
      for (const l of links) {
        if (!l.abs.startsWith(baseURL)) continue; // externos (mailto, tel, wa.me, ad-tech) fora do escopo local
        if (vistos.has(l.abs)) continue;
        vistos.add(l.abs);
        const u = new URL(l.abs);
        const hash = decodeURIComponent(u.hash.slice(1));
        const mesmaPagina = u.pathname === new URL(page.url()).pathname;
        if (!mesmaPagina || !hash) {
          const { fim, ids } = await idsDaPagina(request, u.origin + u.pathname + u.search);
          if (fim.status !== 200) { problemas.push({ causa: `link interno quebrado (${fim.status})`, href: l.href, cadeia: fim.cadeia }); continue; }
          if (fim.cadeia.length > 1) problemas.push({ causa: `link interno passa por redirect ${fim.cadeia[0].status}`, href: l.href, cadeia: fim.cadeia });
          if (hash && !mesmaPagina && !ids.has(hash)) problemas.push({ causa: 'âncora inexistente na página de destino', href: l.href });
        }
        if (hash && mesmaPagina && !idsAqui.has(hash)) problemas.push({ causa: 'âncora inexistente na própria página', href: l.href });
      }
      await anexar('links.json', { total: vistos.size, problemas });
      for (const c of new Set(problemas.map((x) => x.causa))) causa(c);
      expect(problemas, JSON.stringify(problemas.slice(0, 5), null, 1)).toEqual([]);
    });
  }

  test('crawl a partir do sitemap: todo link interno alcançável → 200', async ({ page, request, baseURL }) => {
    test.setTimeout(300_000);
    const fila = PAGINAS.map((p) => baseURL + p.caminho);
    const visitadas = new Set();
    const status = new Map();
    const origem = new Map();
    const foraDoSitemap = new Set();
    const noSitemap = new Set(PAGINAS.map((p) => baseURL + p.caminho));
    while (fila.length && visitadas.size < 150) {
      const url = fila.shift();
      if (visitadas.has(url)) continue;
      visitadas.add(url);
      await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
      await page.waitForTimeout(200);
      for (const l of await linksRenderizados(page)) {
        if (!l.abs.startsWith(baseURL)) continue;
        const sem = l.abs.split('#')[0];
        if (!origem.has(sem)) origem.set(sem, new Set());
        origem.get(sem).add(url.replace(baseURL, ''));
        if (status.has(sem)) continue;
        const fim = await statusFinal(request, sem);
        status.set(sem, fim);
        const final = fim.cadeia.at(-1).url;
        const ehHtml = fim.status === 200 && /text\/html/.test(fim.tipo);
        if (ehHtml && !new URL(final).pathname.startsWith('/api/') && !visitadas.has(final)) {
          if (!noSitemap.has(final)) foraDoSitemap.add(final.replace(baseURL, ''));
          fila.push(final);
        }
      }
    }
    const quebrados = [...status].filter(([, f]) => f.status !== 200).map(([u, f]) => ({ url: u.replace(baseURL, ''), status: f.status, de: [...origem.get(u)].slice(0, 5) }));
    await anexar('crawl.json', { paginasVisitadas: visitadas.size, linksUnicos: status.size, foraDoSitemap: [...foraDoSitemap], quebrados });
    if (foraDoSitemap.size) test.info().annotations.push({ type: 'info', description: `páginas alcançáveis fora do sitemap: ${[...foraDoSitemap].join(', ')}` });
    for (const q of quebrados) causa(`crawl: ${q.url} → ${q.status}`);
    expect(quebrados).toEqual([]);
  });
});
