// Central de Parcerias (complexodmc.com.br/parcerias/**) — auditoria independente.
// Estrutura/SEO/JSON-LD, FAQ por teclado, vídeo antes do CTA, links internos,
// redirects, formulários CONTRA A API REAL (tests/server/serve.mjs sobe um mongod
// descartável; nada vai para produção/Atlas), painel admin e cabeçalho em 7 larguras.
// Sem mongod, a parte de API fica "bloqueado" (skip anotado) — nunca simulada aqui.
import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import { MongoClient } from 'mongodb';
import { abrir, causa, pagina, anexar, estadoServidor, rolarTudo, focoVisivel, VIEWPORTS, ALTURA_VIEWPORT, ORIGEM_PROD } from './_site.js';

const PP = [
  { caminho: '/parcerias/', rotulo: 'central' },
  { caminho: '/parcerias/advogados-parceiros/', rotulo: 'partner-lawyers', programa: 'partner-lawyers', prefixo: 'PL', form: '#pl-form', ids: 'pl', evento: 'partner_lawyers' },
  { caminho: '/parcerias/business-partner/', rotulo: 'business-partner', programa: 'business-partner', prefixo: 'BP', form: '#bp-form', ids: 'bp', evento: 'business_partner' }
];
const FORMS = PP.filter((p) => p.programa);
const API = (programa) => `/api/parcerias/${programa}`;
const ANO = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date());
const reProtocolo = (prefixo) => new RegExp(`^${prefixo}-${ANO}-[2-9A-HJ-NP-Z]{6}$`);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const ipNovo = () => `10.${crypto.randomInt(1, 254)}.${crypto.randomInt(1, 254)}.${crypto.randomInt(1, 254)}`;
const emailNovo = (rotulo) => `qa-pp-${rotulo}-${crypto.randomBytes(4).toString('hex')}@exemplo.com.br`;

// Campos obrigatórios de cada programa (server/README.md, tabela de parcerias).
const OBRIGATORIOS = {
  'partner-lawyers': ['nome', 'oab_numero', 'oab_seccional', 'areas', 'cidade', 'uf', 'email', 'telefone', 'apresentacao', 'consentimento'],
  'business-partner': ['nome', 'cargo', 'segmento', 'experiencia_b2b', 'cidade', 'uf', 'email', 'whatsapp', 'perfil_empresas', 'consentimento']
};
const OPCIONAIS = { 'partner-lawyers': ['escritorio', 'comunicacoes'], 'business-partner': ['empresa', 'mensagem', 'comunicacoes'] };

function corpoValido(programa, extra = {}) {
  const email = extra.email || emailNovo(programa === 'partner-lawyers' ? 'pl' : 'bp');
  const base = programa === 'partner-lawyers'
    ? { nome: 'Ana Advogada QA', oab_numero: '123.456', oab_seccional: 'SP', escritorio: 'Sociedade QA', areas: ['empresarial', 'tributario'], cidade: 'Campinas', uf: 'SP', email, telefone: '(11) 98888-0000', apresentacao: 'Advogada com atuação em direito empresarial há dez anos. Envio de teste automatizado do QA.', consentimento: true, comunicacoes: false, pagina: '/parcerias/advogados-parceiros/' }
    : { nome: 'Bruno Parceiro QA', empresa: 'Rede QA', cargo: 'Diretor comercial', segmento: 'consultoria-empresarial', experiencia_b2b: '5-a-10-anos', cidade: 'Ribeirão Preto', uf: 'SP', email, whatsapp: '(16) 97777-0000', perfil_empresas: 'Indústrias de médio porte e incorporadoras.', mensagem: '', consentimento: true, comunicacoes: false, pagina: '/parcerias/business-partner/' };
  return { ...base, ...extra, email };
}

// ---------- banco descartável ----------
async function candidaturas(filtro) {
  const est = await estadoServidor(null);
  const c = new MongoClient(est.mongo.uri, { serverSelectionTimeoutMS: 3000 });
  try { await c.connect(); return await c.db(est.mongo.db).collection('parcerias_candidaturas').find(filtro).toArray(); }
  finally { await c.close(); }
}
async function comBanco(fn) {
  const est = await estadoServidor(null);
  const c = new MongoClient(est.mongo.uri, { serverSelectionTimeoutMS: 3000 });
  try { await c.connect(); return await fn(c.db(est.mongo.db)); } finally { await c.close(); }
}
async function exigirMongo(request) {
  const est = await estadoServidor(request);
  if (!est.mongo) {
    test.info().annotations.push({ type: 'bloqueado', description: `sem MongoDB descartável: ${est.motivo}` });
    test.skip(true, `bloqueado: ${est.motivo}`);
  }
  return est;
}

// ---------- página ----------
async function gravarEventos(page) {
  await page.addInitScript(() => {
    if (window.__evInstalado) return; // addInitScript acumula entre navegações
    window.__evInstalado = true;
    window.__ev = [];
    window.addEventListener('dmc:analytics', (e) => { window.__ev.push({ t: Math.round(performance.now()), ...e.detail }); });
  });
}
const eventos = (page) => page.evaluate(() => window.__ev || []);

async function abrirForm(page, p, { busca = '', ip = ipNovo() } = {}) {
  pagina(p.caminho + busca);
  await page.setExtraHTTPHeaders({ 'x-qa-cliente': ip });
  await gravarEventos(page);
  await abrir(page, p.caminho + busca);
  const form = page.locator(p.form);
  await expect.poll(() => form.evaluate((f) => f.noValidate)).toBe(true); // parcerias.js assumiu o envio
  await form.scrollIntoViewIfNeeded();
  return form;
}

async function preencherUI(page, programa, d) {
  if (programa === 'partner-lawyers') {
    await page.fill('#pl-nome', d.nome);
    await page.fill('#pl-oab', d.oab_numero);
    await page.selectOption('#pl-seccional', d.oab_seccional);
    await page.fill('#pl-escritorio', d.escritorio || '');
    for (const a of d.areas) await page.locator(`#pl-form input[name="areas"][value="${a}"]`).check();
    await page.fill('#pl-cidade', d.cidade);
    await page.selectOption('#pl-uf', d.uf);
    await page.fill('#pl-email', d.email);
    await page.fill('#pl-telefone', d.telefone);
    await page.fill('#pl-apresentacao', d.apresentacao);
    if (d.consentimento) await page.locator('#pl-consentimento').check();
  } else {
    await page.fill('#bp-nome', d.nome);
    await page.fill('#bp-empresa', d.empresa || '');
    await page.fill('#bp-cargo', d.cargo);
    await page.selectOption('#bp-segmento', d.segmento);
    await page.selectOption('#bp-experiencia', d.experiencia_b2b);
    await page.fill('#bp-cidade', d.cidade);
    await page.selectOption('#bp-uf', d.uf);
    await page.fill('#bp-email', d.email);
    await page.fill('#bp-whatsapp', d.whatsapp);
    await page.fill('#bp-perfil', d.perfil_empresas);
    if (d.mensagem) await page.fill('#bp-mensagem', d.mensagem);
    if (d.consentimento) await page.locator('#bp-consentimento').check();
  }
}

function contarPosts(page) {
  const lista = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/parcerias/')) lista.push(r); });
  return lista;
}
function todasAsUrls(page) {
  const lista = [];
  page.on('request', (r) => lista.push(r.url()));
  return lista;
}
const respostaDe = (page, programa) => page.waitForResponse((r) => r.url().endsWith(API(programa)) && r.request().method() === 'POST');

// Dados pessoais que nunca podem aparecer em URL nem em evento de analytics.
function dadosPessoais(d) {
  return [d.email, encodeURIComponent(d.email), d.nome, encodeURIComponent(d.nome), d.cidade, (d.telefone || d.whatsapp || '').replace(/\D/g, ''), d.oab_numero && d.oab_numero.replace(/\D/g, '')].filter(Boolean);
}

// Largura × altura de um JPEG (marcador SOF).
function dimensoesJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

// =====================================================================
// 1 · Estrutura, SEO e JSON-LD
// =====================================================================
test.describe('parcerias — estrutura e SEO', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  for (const p of PP) {
    test(`${p.caminho}: 200, 1 h1, main#conteudo, canonical, og:image, JSON-LD = texto visível`, async ({ page, request }) => {
      pagina(p.caminho);
      const resp = await abrir(page, p.caminho);
      expect(resp.status()).toBe(200);
      expect(resp.headers()['content-type']).toContain('text/html');
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main#conteudo')).toHaveCount(1);
      expect(await page.locator('meta[name="robots"][content*="noindex"]').count()).toBe(0);

      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toBe(ORIGEM_PROD + p.caminho);
      expect(await page.locator('meta[property="og:url"]').getAttribute('content')).toBe(canonical);

      const og = await page.locator('meta[property="og:image"]').getAttribute('content');
      expect(og.startsWith(ORIGEM_PROD + '/')).toBe(true);
      const ri = await request.get(new URL(og).pathname, { maxRedirects: 0 });
      if (ri.status() !== 200) causa(`og:image ${new URL(og).pathname} → ${ri.status()}`);
      expect(ri.status()).toBe(200);
      expect(ri.headers()['content-type']).toMatch(/^image\//);
      const dim = dimensoesJpeg(await ri.body());
      const declarado = { w: Number(await page.locator('meta[property="og:image:width"]').getAttribute('content')), h: Number(await page.locator('meta[property="og:image:height"]').getAttribute('content')) };
      expect.soft(dim, 'og:image real = og:image:width/height').toEqual(declarado);

      const blocos = await page.locator('script[type="application/ld+json"]').allTextContents();
      const ld = blocos.map((t) => JSON.parse(t)); // lança se não for JSON válido
      const faq = ld.find((x) => x['@type'] === 'FAQPage');
      const bc = ld.find((x) => x['@type'] === 'BreadcrumbList');
      expect(faq, 'FAQPage').toBeTruthy();
      expect(bc, 'BreadcrumbList').toBeTruthy();

      const visivel = await page.evaluate(() => [...document.querySelectorAll('.pp-faq__item')].map((i) => ({
        q: i.querySelector('.pp-faq__q').textContent.replace(/\s+/g, ' ').trim(),
        a: i.querySelector('.pp-faq__a').textContent.replace(/\s+/g, ' ').trim()
      })));
      const doLd = faq.mainEntity.map((q) => ({ q: norm(q.name), a: norm(q.acceptedAnswer && q.acceptedAnswer.text) }));
      if (JSON.stringify(doLd) !== JSON.stringify(visivel)) causa('FAQPage do JSON-LD difere do FAQ visível');
      expect(doLd).toEqual(visivel);

      const itens = bc.itemListElement;
      expect(itens.map((i) => i.position)).toEqual(itens.map((_, k) => k + 1));
      expect(itens.at(-1).item).toBe(canonical);
      for (const i of itens) expect((await request.get(new URL(i.item).pathname, { maxRedirects: 0 })).status(), i.item).toBe(200);
      const trilha = (await page.locator('.pp-trilha li').allTextContents()).map(norm);
      expect(trilha, 'trilha visível = BreadcrumbList').toEqual(itens.map((i) => i.name));
      await anexar('seo.json', { canonical, og, dim, declarado, faq: doLd.length, breadcrumb: itens.map((i) => i.name) });
    });

    test(`${p.caminho}: FAQ em acordeão operável por teclado`, async ({ page }) => {
      pagina(p.caminho);
      await abrir(page, p.caminho);
      const itens = await page.locator('.pp-faq__item').count();
      const btns = page.locator('.pp-faq__btn');
      await expect(btns).toHaveCount(itens);
      for (let i = 0; i < itens; i++) {
        const b = btns.nth(i);
        await expect(b).toHaveAttribute('aria-expanded', 'false');
        const alvo = await b.getAttribute('aria-controls');
        await expect(page.locator(`#${alvo}`)).toBeHidden();
        expect(await b.evaluate((el) => el.parentElement.tagName)).toBe('H3');
      }
      const b0 = btns.nth(0);
      const r0 = page.locator(`#${await b0.getAttribute('aria-controls')}`);
      await b0.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(b0).toBeFocused();
      const foco = await focoVisivel(page);
      if (!foco.visivel) causa('FAQ: foco do teclado invisível no botão');
      expect.soft(foco.visivel, JSON.stringify(foco)).toBe(true);
      await page.keyboard.press('Enter');
      await expect(b0).toHaveAttribute('aria-expanded', 'true');
      await expect(r0).toBeVisible();
      await page.keyboard.press('Space');
      await expect(b0).toHaveAttribute('aria-expanded', 'false');
      await expect(r0).toBeHidden();
      await page.keyboard.press('Tab');
      await expect(btns.nth(1)).toBeFocused();
    });

    test(`${p.caminho}: bloco #video antes do CTA final`, async ({ page }) => {
      pagina(p.caminho);
      await abrir(page, p.caminho);
      const secoes = await page.evaluate(() => [...document.querySelectorAll('main#conteudo > section')].map((s) => ({ id: s.id, cta: s.classList.contains('cta-section') })));
      const iv = secoes.findIndex((s) => s.id === 'video');
      expect(iv, JSON.stringify(secoes)).toBeGreaterThan(-1);
      expect(secoes.at(-1).cta, 'última seção = .cta-section').toBe(true);
      expect(iv, '#video imediatamente antes do CTA').toBe(secoes.length - 2);
      await expect(page.locator('#video .page-video__frame[data-video]')).toHaveCount(1);
    });

    test(`${p.caminho}: links internos → 200 (sem redirect) e âncoras existentes`, async ({ page, request, baseURL }) => {
      pagina(p.caminho);
      await abrir(page, p.caminho);
      await page.waitForSelector('#navbar');
      const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.getAttribute('href'), abs: a.href })));
      const aqui = new URL(page.url()).pathname;
      const idsAqui = new Set(await page.evaluate(() => [...document.querySelectorAll('[id]')].map((e) => e.id)));
      const problemas = [];
      const cache = new Map();
      for (const l of links) {
        if (!l.abs.startsWith(baseURL)) continue;
        const u = new URL(l.abs);
        const hash = decodeURIComponent(u.hash.slice(1));
        if (u.pathname === aqui && !u.search) {
          if (hash && !idsAqui.has(hash)) problemas.push({ causa: 'âncora inexistente na própria página', href: l.href });
          continue;
        }
        const chave = u.pathname + u.search;
        if (!cache.has(chave)) {
          const r = await request.get(chave, { maxRedirects: 0, failOnStatusCode: false });
          cache.set(chave, { status: r.status(), corpo: r.status() === 200 && /html/.test(r.headers()['content-type'] || '') ? await r.text() : '' });
        }
        const alvo = cache.get(chave);
        if (alvo.status !== 200) problemas.push({ causa: `link interno → ${alvo.status}`, href: l.href });
        else if (hash && alvo.corpo && !new RegExp(`id=["']${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(alvo.corpo)) problemas.push({ causa: 'âncora inexistente no destino', href: l.href });
      }
      await anexar('links.json', { total: cache.size, problemas });
      for (const c of new Set(problemas.map((x) => x.causa))) causa(c);
      expect(problemas, JSON.stringify(problemas.slice(0, 6))).toEqual([]);
    });
  }
});

// =====================================================================
// 2 · Redirects (vercel.json) — esperado escrito à mão, não derivado
// =====================================================================
test.describe('parcerias — redirects', () => {
  const REDIR = [
    ['/parcerias', '/parcerias/'],
    ['/parcerias/advogados-parceiros', '/parcerias/advogados-parceiros/'],
    ['/parcerias/business-partner', '/parcerias/business-partner/'],
    ['/parcerias/partner-lawyers', '/parcerias/advogados-parceiros/'],
    ['/parcerias/partner-lawyers/', '/parcerias/advogados-parceiros/']
  ];
  for (const [de, para] of REDIR) {
    test(`${de} → 301 ${para} → 200 (sem laço)`, async ({ request, baseURL }) => {
      pagina(de);
      const r = await request.get(de, { maxRedirects: 0, failOnStatusCode: false });
      expect(r.status()).toBe(301);
      expect(new URL(r.headers().location, baseURL).pathname).toBe(para);
      const fim = await request.get(para, { maxRedirects: 0, failOnStatusCode: false });
      expect(fim.status(), 'destino responde 200 direto, sem novo redirect').toBe(200);
      const comQuery = await request.get(de + '?utm_source=qa', { maxRedirects: 0, failOnStatusCode: false });
      expect.soft(comQuery.headers().location || '', 'query preservada no redirect').toContain('utm_source=qa');
    });
  }
});

// =====================================================================
// 3 · Formulários contra a API real
// =====================================================================
test.describe('parcerias — formulários (UI + API real)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const p of FORMS) {
    test(`${p.prefixo}: envio válido → 201, painel com protocolo ${p.prefixo}-AAAA-XXXXXX, modalidade gravada, evento sem dado pessoal`, async ({ page, request }) => {
      await exigirMongo(request);
      const d = corpoValido(p.programa);
      const form = await abrirForm(page, p);
      const posts = contarPosts(page);
      const urls = todasAsUrls(page);
      await preencherUI(page, p.programa, d);
      const resp = respostaDe(page, p.programa);
      await form.locator('[type="submit"]').click();
      const r = await resp;
      expect(r.status()).toBe(201);
      const corpo = await r.json();
      expect(corpo).toMatchObject({ ok: true, programa: p.programa });
      expect(corpo.protocolo).toMatch(reProtocolo(p.prefixo));

      const painel = page.locator('.pp-confirmacao');
      await expect(painel).toBeVisible();
      await expect(painel.locator('h3')).toBeFocused();
      await expect(painel.locator('[data-protocolo]').first()).toHaveText(corpo.protocolo);
      await expect(page.locator(p.form)).toHaveCount(0);
      expect(posts).toHaveLength(1);
      const enviado = posts[0].postDataJSON();
      expect(enviado.programa, 'o cliente não envia "programa"').toBeUndefined();
      expect(posts[0].headers()['content-type']).toContain('application/json');

      const docs = await candidaturas({ email: d.email });
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({ programa: p.programa, protocolo: corpo.protocolo, status: 'recebido' });
      expect(docs[0].fonte.pagina).toBe(p.caminho);
      expect(docs[0].consentimento.aceito).toBe(true);
      for (const k of ['ip', 'userAgent', 'user_agent', 'referrer', 'referer']) expect(docs[0]).not.toHaveProperty(k);

      const sensiveis = dadosPessoais(d);
      expect(page.url()).toBe(new URL(p.caminho, page.url()).href);
      for (const u of urls) for (const s of sensiveis) expect(u, `dado pessoal na URL: ${u}`).not.toContain(s);

      const ev = await eventos(page);
      const nomes = ev.map((e) => e.event);
      expect(nomes).toContain(`${p.evento}_page_view`);
      expect(nomes).toContain(`${p.evento}_form_start`);
      expect(nomes.filter((n) => n === `${p.evento}_submit_success`)).toHaveLength(1);
      const json = JSON.stringify(ev);
      for (const s of sensiveis) expect(json, `dado pessoal em evento: ${s}`).not.toContain(s);
      expect(json).not.toContain(corpo.protocolo);
      await anexar('envio.json', { protocolo: corpo.protocolo, eventos: ev, gravado: { programa: docs[0].programa, fonte: docs[0].fonte } });
    });

    test(`${p.prefixo}: *_submit_success só depois da resposta 201 (nunca antes, nunca em 400/honeypot)`, async ({ page, request }) => {
      await exigirMongo(request);
      const form = await abrirForm(page, p);
      let statusReal = null;
      let liberar;
      const segura = new Promise((ok) => { liberar = ok; });
      await page.route(`**${API(p.programa)}`, async (route) => {
        const resp = await route.fetch();
        statusReal = resp.status();
        await segura;
        await route.fulfill({ response: resp });
      });
      await preencherUI(page, p.programa, corpoValido(p.programa));
      await form.locator('[type="submit"]').click();
      await expect.poll(() => statusReal).toBe(201);
      await page.waitForTimeout(400);
      let ev = await eventos(page);
      expect(ev.filter((e) => /_submit_success$/.test(e.event)), 'sucesso antes da resposta chegar ao navegador').toHaveLength(0);
      await expect(page.locator(`${p.form} .pp-status`)).toContainText('Enviando');
      await expect(form).toHaveAttribute('aria-busy', 'true');
      await expect(form.locator('[type="submit"]')).toBeDisabled();
      liberar();
      await expect(page.locator('.pp-confirmacao')).toBeVisible();
      ev = await eventos(page);
      expect(ev.filter((e) => e.event === `${p.evento}_submit_success`)).toHaveLength(1);
      await page.unroute(`**${API(p.programa)}`);

      // honeypot (200 sem protocolo) e 400 do servidor: nenhum evento de sucesso
      for (const caso of ['honeypot', '400']) {
        const f = await abrirForm(page, p);
        const d = corpoValido(p.programa);
        await preencherUI(page, p.programa, d);
        if (caso === 'honeypot') await page.locator(`#${p.ids}-website`).fill('http://spam.example', { force: true });
        else await page.route(`**${API(p.programa)}`, (route) => route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), email: 'sem-arroba' }) }));
        const resp = respostaDe(page, p.programa);
        await f.locator('[type="submit"]').click();
        expect((await resp).status()).toBe(caso === 'honeypot' ? 200 : 400);
        await page.waitForTimeout(300);
        ev = await eventos(page);
        expect(ev.filter((e) => /_submit_success$/.test(e.event)), `evento de sucesso em ${caso}`).toHaveLength(0);
        await page.unroute(`**${API(p.programa)}`).catch(() => {});
      }
    });

    test(`${p.prefixo}: reenvio com o mesmo e-mail → duplicidade com o mesmo protocolo`, async ({ page, request }) => {
      await exigirMongo(request);
      const ip = ipNovo();
      const d = corpoValido(p.programa);
      let form = await abrirForm(page, p, { ip });
      await preencherUI(page, p.programa, d);
      let resp = respostaDe(page, p.programa);
      await form.locator('[type="submit"]').click();
      const r1 = await resp;
      expect(r1.status()).toBe(201);
      const { protocolo } = await r1.json();

      form = await abrirForm(page, p, { ip });
      await preencherUI(page, p.programa, { ...d, nome: d.nome + ' Segundo', email: d.email.toUpperCase() });
      resp = respostaDe(page, p.programa);
      await form.locator('[type="submit"]').click();
      const r2 = await resp;
      expect(r2.status()).toBe(200);
      expect(await r2.json()).toMatchObject({ ok: true, duplicada: true, protocolo, programa: p.programa });
      const titulo = page.locator('.pp-confirmacao h3');
      await expect(titulo).toContainText('Já recebemos');
      await expect(titulo).toContainText(protocolo);
      await expect(titulo).toBeFocused();
      expect(await candidaturas({ email: d.email })).toHaveLength(1);
      const ev = await eventos(page);
      expect(ev.filter((e) => /_submit_success$/.test(e.event)), 'duplicada não conta como conversão').toHaveLength(0);
    });

    test(`${p.prefixo}: cliente — obrigatórios vazios → erro por campo (aria-invalid + aria-describedby), foco no 1º, nenhum POST`, async ({ page }) => {
      const form = await abrirForm(page, p);
      const posts = contarPosts(page);
      await form.locator('[type="submit"]').click();
      await page.waitForTimeout(300);
      expect(posts).toHaveLength(0);
      const marcados = await form.evaluate((f) => [...f.querySelectorAll('[aria-invalid="true"]')].map((el) => {
        const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        const erros = ids.map((i) => document.getElementById(i)).filter((e) => e && e.classList.contains('pp-erro'));
        return { nome: el.name, id: el.id, erro: erros.map((e) => e.textContent.trim()).join(' '), visivel: erros.length > 0 && erros.every((e) => e.getClientRects().length > 0) };
      }));
      await anexar('erros-cliente.json', marcados);
      const nomes = [...new Set(marcados.map((m) => m.nome))];
      expect(nomes.sort()).toEqual([...OBRIGATORIOS[p.programa]].sort());
      for (const o of OPCIONAIS[p.programa]) expect(nomes).not.toContain(o);
      const soltos = marcados.filter((m) => !m.erro || !m.visivel);
      if (soltos.length) causa('erro de campo sem texto visível ligado por aria-describedby');
      expect(soltos, JSON.stringify(soltos)).toEqual([]);
      await expect(page.locator(`#${p.ids}-nome`)).toBeFocused();
      await expect(form.locator('.pp-status')).toContainText('Revise os campos');
      // a ajuda original continua ligada junto do erro
      const desc = await page.locator(`#${p.ids}-email`).getAttribute('aria-describedby');
      expect(desc.split(/\s+/)).toEqual(expect.arrayContaining([`${p.ids}-email-ajuda`, `${p.ids}-email-erro`]));
    });

    test(`${p.prefixo}: cliente — e-mail inválido → só o e-mail marcado e focado; corrigir limpa o erro`, async ({ page }) => {
      const form = await abrirForm(page, p);
      const posts = contarPosts(page);
      await preencherUI(page, p.programa, corpoValido(p.programa, { email: 'maria@exemplo' }));
      await form.locator('[type="submit"]').click();
      await page.waitForTimeout(300);
      expect(posts).toHaveLength(0);
      const email = page.locator(`#${p.ids}-email`);
      await expect(email).toHaveAttribute('aria-invalid', 'true');
      await expect(email).toBeFocused();
      expect(await form.locator('[aria-invalid="true"]').count()).toBe(1);
      await expect(page.locator(`#${p.ids}-email-erro`)).toBeVisible();
      await email.fill('maria@exemplo.com.br');
      await expect(email).not.toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator(`#${p.ids}-email-erro`)).toHaveCount(0);
    });

    test(`${p.prefixo}: servidor — 400 com campos quando o cliente é contornado (UI marca e foca; POST direto não grava)`, async ({ page, request }) => {
      await exigirMongo(request);
      // UI: o corpo é adulterado no caminho (passa no cliente, falha no servidor)
      const form = await abrirForm(page, p);
      const tel = p.programa === 'partner-lawyers' ? 'telefone' : 'whatsapp';
      await page.route(`**${API(p.programa)}`, (route) => route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), email: 'x@y', [tel]: '123' }) }));
      await preencherUI(page, p.programa, corpoValido(p.programa));
      const resp = respostaDe(page, p.programa);
      await form.locator('[type="submit"]').click();
      const r = await resp;
      expect(r.status()).toBe(400);
      const c = await r.json();
      expect(Object.keys(c.campos).sort()).toEqual(['email', tel].sort());
      const email = page.locator(`#${p.ids}-email`);
      await expect(email).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator(`#${p.ids}-${tel}`)).toHaveAttribute('aria-invalid', 'true');
      await expect(email).toBeFocused();
      await expect(page.locator(`#${p.ids}-email-erro`)).toContainText('E-mail inválido');

      // POST direto: vazio, tipos errados, opções fora da lista
      const h = { 'x-qa-cliente': ipNovo(), 'content-type': 'application/json' };
      const vazio = await request.post(API(p.programa), { headers: h, data: {} });
      expect(vazio.status()).toBe(400);
      expect(Object.keys((await vazio.json()).campos).sort()).toEqual([...OBRIGATORIOS[p.programa]].sort());
      const emailRuim = emailNovo('ruim');
      const ruim = corpoValido(p.programa, { email: emailRuim, nome: { $ne: 1 }, uf: 'XX', consentimento: 'false' });
      if (p.programa === 'partner-lawyers') Object.assign(ruim, { areas: ['inexistente'], oab_numero: 'abc' });
      else Object.assign(ruim, { segmento: 'advocacia', experiencia_b2b: '99' });
      const r2 = await request.post(API(p.programa), { headers: h, data: ruim });
      expect(r2.status()).toBe(400);
      const c2 = (await r2.json()).campos;
      expect(c2.nome).toBe('Formato inválido.');
      expect(Object.keys(c2)).toEqual(expect.arrayContaining(['nome', 'uf', 'consentimento', ...(p.programa === 'partner-lawyers' ? ['areas', 'oab_numero'] : ['segmento', 'experiencia_b2b'])]));
      expect(await candidaturas({ email: emailRuim })).toHaveLength(0);
    });

    test(`${p.prefixo}: honeypot preenchido → 200 neutro, painel genérico, nada gravado`, async ({ page, request }) => {
      await exigirMongo(request);
      const form = await abrirForm(page, p);
      const hp = page.locator(`#${p.ids}-website`);
      await expect(hp).toHaveAttribute('tabindex', '-1');
      expect(await hp.evaluate((el) => !!el.closest('[aria-hidden="true"]'))).toBe(true);
      const d = corpoValido(p.programa);
      await preencherUI(page, p.programa, d);
      await hp.fill('http://spam.example', { force: true });
      const resp = respostaDe(page, p.programa);
      await form.locator('[type="submit"]').click();
      const r = await resp;
      expect(r.status()).toBe(200);
      const c = await r.json();
      expect(c).toEqual({ ok: true });
      await expect(page.locator('.pp-confirmacao h3')).toHaveText('Candidatura recebida.');
      await expect(page.locator('.pp-confirmacao [data-protocolo]')).toHaveCount(0);
      expect(await candidaturas({ email: d.email })).toHaveLength(0);
      const api = await request.post(API(p.programa), { headers: { 'x-qa-cliente': ipNovo() }, data: corpoValido(p.programa, { email: d.email, website: 'x' }) });
      expect(api.status()).toBe(200);
      expect(await candidaturas({ email: d.email })).toHaveLength(0);
    });

    test(`${p.prefixo}: duplo clique / reenvio durante o envio → um único POST e uma candidatura`, async ({ page, request }) => {
      await exigirMongo(request);
      const form = await abrirForm(page, p);
      const posts = contarPosts(page);
      let liberar;
      const segura = new Promise((ok) => { liberar = ok; });
      await page.route(`**${API(p.programa)}`, async (route) => { const resp = await route.fetch(); await segura; await route.fulfill({ response: resp }); });
      const d = corpoValido(p.programa);
      await preencherUI(page, p.programa, d);
      await form.locator('[type="submit"]').dblclick();
      await page.waitForTimeout(250);
      await form.evaluate((f) => { f.requestSubmit(); f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      liberar();
      await expect(page.locator('.pp-confirmacao')).toBeVisible();
      await page.waitForTimeout(500);
      expect(posts).toHaveLength(1);
      expect(await candidaturas({ email: d.email })).toHaveLength(1);
    });

    test(`${p.prefixo}: UTMs da query chegam saneadas; página sem query; nada pessoal da query vaza`, async ({ page, request }) => {
      await exigirMongo(request);
      const busca = '?utm_source=google&utm_medium=cpc%3Cscript%3E&utm_campaign=lancamento_2026&utm_content=a%20b&email=vazado%40x.com';
      const form = await abrirForm(page, p, { busca });
      const posts = contarPosts(page);
      const d = corpoValido(p.programa);
      await preencherUI(page, p.programa, d);
      const resp = respostaDe(page, p.programa);
      await form.locator('[type="submit"]').click();
      expect((await resp).status()).toBe(201);
      const enviado = posts[0].postDataJSON();
      expect(enviado).toMatchObject({ utm_source: 'google', utm_medium: '', utm_campaign: 'lancamento_2026', utm_content: '', pagina: p.caminho });
      const [doc] = await candidaturas({ email: d.email });
      expect(doc.fonte).toEqual({ pagina: p.caminho, utm_source: 'google', utm_campaign: 'lancamento_2026' });
      expect(JSON.stringify(doc)).not.toContain('vazado');
      // POST direto com UTM suja e página com query: o servidor também limpa
      const e2 = emailNovo('utm');
      const r2 = await request.post(API(p.programa), { headers: { 'x-qa-cliente': ipNovo() }, data: corpoValido(p.programa, { email: e2, utm_source: 'goo gle<b>', utm_medium: 'x'.repeat(200), pagina: '/parcerias/?email=a@b.com#t' }) });
      expect(r2.status()).toBe(201);
      const [d2] = await candidaturas({ email: e2 });
      expect(d2.fonte).toEqual({ pagina: '/parcerias/', utm_source: 'googleb', utm_medium: 'x'.repeat(80) });
    });
  }

  test('modalidade vem da rota: corpo com "programa" do outro é ignorado; formulário de um programa não cria candidatura no outro', async ({ page, request }) => {
    await exigirMongo(request);
    const h = () => ({ 'x-qa-cliente': ipNovo(), 'content-type': 'application/json' });
    const pl = corpoValido('partner-lawyers', { programa: 'business-partner' });
    const r1 = await request.post(API('partner-lawyers'), { headers: h(), data: pl });
    expect(r1.status()).toBe(201);
    expect((await r1.json()).protocolo).toMatch(reProtocolo('PL'));
    expect((await candidaturas({ email: pl.email }))[0].programa).toBe('partner-lawyers');
    const bp = corpoValido('business-partner', { programa: 'partner-lawyers' });
    const r2 = await request.post(API('business-partner'), { headers: h(), data: bp });
    expect(r2.status()).toBe(201);
    expect((await r2.json()).protocolo).toMatch(reProtocolo('BP'));
    expect((await candidaturas({ email: bp.email }))[0].programa).toBe('business-partner');
    // corpo de um programa na rota do outro → 400, nada gravado
    const plNoBp = corpoValido('partner-lawyers');
    const r3 = await request.post(API('business-partner'), { headers: h(), data: plNoBp });
    expect(r3.status()).toBe(400);
    const bpNoPl = corpoValido('business-partner');
    const r4 = await request.post(API('partner-lawyers'), { headers: h(), data: bpNoPl });
    expect(r4.status()).toBe(400);
    expect(await candidaturas({ email: { $in: [plNoBp.email, bpNoPl.email] } })).toHaveLength(0);
    // mesmo e-mail nos dois programas: funis independentes (não é duplicidade)
    const r5 = await request.post(API('business-partner'), { headers: h(), data: corpoValido('business-partner', { email: pl.email }) });
    expect(r5.status()).toBe(201);
    const ambos = await candidaturas({ email: pl.email });
    expect(ambos.map((x) => x.programa).sort()).toEqual(['business-partner', 'partner-lawyers']);
    // cada página só tem o formulário do próprio programa
    for (const p of FORMS) {
      await abrir(page, p.caminho);
      const forms = await page.evaluate(() => [...document.querySelectorAll('form')].map((f) => ({ acao: new URL(f.action).pathname, programa: f.getAttribute('data-pp-form'), metodo: f.method })));
      expect(forms).toEqual([{ acao: API(p.programa), programa: p.programa, metodo: 'post' }]);
      expect(await page.locator('body').getAttribute('data-pp-programa')).toBe(p.programa);
    }
  });

  test('throttle: 6º envio do mesmo IP → 429 com Retry-After (UI mostra o aviso); contato tem contador próprio', async ({ page, request }) => {
    await exigirMongo(request);
    const ip = ipNovo();
    const h = { 'x-qa-cliente': ip, 'content-type': 'application/json' };
    const st = [];
    for (let i = 0; i < 5; i++) st.push((await request.post(API('partner-lawyers'), { headers: h, data: corpoValido('partner-lawyers') })).status());
    expect(st).toEqual([201, 201, 201, 201, 201]);
    const r6 = await request.post(API('partner-lawyers'), { headers: h, data: corpoValido('partner-lawyers') });
    expect(r6.status()).toBe(429);
    expect(Number(r6.headers()['retry-after'])).toBeGreaterThan(0);
    const bp = await request.post(API('business-partner'), { headers: h, data: corpoValido('business-partner') });
    test.info().annotations.push({ type: 'info', description: `após 5 PL do mesmo IP, BP do mesmo IP → ${bp.status()} (contador ${bp.status() === 429 ? 'compartilhado' : 'separado'} entre programas)` });
    const contato = await request.post('/api/contato', { headers: h, data: { nome: 'QA Throttle', email: emailNovo('contato'), perfil: 'investidor', eixo: 'E5', mensagem: 'Teste de contadores separados.', consentimento: true, origem: 'qa' } });
    expect(contato.status(), 'contato não herda o contador das parcerias').toBe(201);
    // UI no mesmo IP: aviso de limite, sem painel de sucesso
    const p = FORMS[0];
    const form = await abrirForm(page, p, { ip });
    await preencherUI(page, p.programa, corpoValido(p.programa));
    const resp = respostaDe(page, p.programa);
    await form.locator('[type="submit"]').click();
    expect((await resp).status()).toBe(429);
    await expect(form.locator('.pp-status')).toContainText('Muitas tentativas');
    await expect(page.locator('.pp-confirmacao')).toHaveCount(0);
    await expect(form.locator('[type="submit"]')).toBeEnabled();
  });

  test('corpo > 16 KB → 413 nos dois programas, sem gravar', async ({ request }) => {
    await exigirMongo(request);
    for (const p of FORMS) {
      const email = emailNovo('grande');
      const r = await request.post(API(p.programa), { headers: { 'x-qa-cliente': ipNovo(), 'content-type': 'application/json' }, data: corpoValido(p.programa, { email, mensagem: 'x'.repeat(20000), apresentacao: 'y'.repeat(20000) }) });
      expect(r.status(), p.programa).toBe(413);
      expect(typeof (await r.json()).error).toBe('string');
      expect(await candidaturas({ email })).toHaveLength(0);
    }
  });

  test('sem JavaScript: envio nativo é POST (nada na URL) e grava com áreas em lista', async ({ browser, request, baseURL }) => {
    await exigirMongo(request);
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL, extraHTTPHeaders: { 'x-qa-cliente': ipNovo() } });
    const page = await ctx.newPage();
    try {
      const p = FORMS[0];
      await page.goto(p.caminho);
      const d = corpoValido(p.programa);
      await preencherUI(page, p.programa, d);
      const [resp] = await Promise.all([page.waitForResponse((r) => r.url().endsWith(API(p.programa))), page.locator(`${p.form} [type="submit"]`).click()]);
      expect(resp.request().method()).toBe('POST');
      expect(resp.request().headers()['content-type']).toContain('application/x-www-form-urlencoded');
      expect(resp.status()).toBe(201);
      for (const s of dadosPessoais(d)) expect(page.url()).not.toContain(s);
      const [doc] = await candidaturas({ email: d.email });
      expect(doc.dados.areas).toEqual(d.areas);
      expect(doc.programa).toBe(p.programa);
      const corpo = await page.locator('body').innerText();
      test.info().annotations.push({ type: 'info', description: `sem JS, a pessoa vê a resposta crua da API: ${corpo.slice(0, 90)}` });
    } finally { await ctx.close(); }
  });
});

// =====================================================================
// 4 · Painel admin (plataforma-ead/parcerias.html)
// =====================================================================
test.describe('parcerias — painel admin', () => {
  test('sem token → redireciona para login.html?next=parcerias.html; noindex', async ({ page }) => {
    pagina('/plataforma-ead/parcerias.html');
    await page.goto('/plataforma-ead/parcerias.html');
    await page.waitForURL(/\/plataforma-ead\/login\.html\?next=parcerias\.html/, { timeout: 10_000 });
    const r = await page.request.get('/plataforma-ead/parcerias.html');
    expect(await r.text()).toMatch(/<meta name="robots" content="noindex, nofollow">/);
  });

  test('API + tela admin: sem token 401; aluno 403; admin lista só o programa pedido', async ({ page, request }) => {
    await exigirMongo(request);
    const ip = ipNovo();
    const semToken = await request.get('/api/parcerias/admin/candidaturas?programa=partner-lawyers', { headers: { 'x-qa-cliente': ip } });
    expect(semToken.status()).toBe(401);
    const email = emailNovo('admin');
    const cad = await request.post('/api/auth/signup', { headers: { 'x-qa-cliente': ip }, data: { email, senha: 'senha-qa-' + crypto.randomBytes(4).toString('hex'), nome: 'Admin QA' } });
    expect(cad.status()).toBe(201);
    const { token } = await cad.json();
    const auth = { 'x-qa-cliente': ip, authorization: `Bearer ${token}` };
    expect((await request.get('/api/parcerias/admin/candidaturas?programa=partner-lawyers', { headers: auth })).status()).toBe(403);
    await comBanco((db) => db.collection('users').updateOne({ email }, { $set: { isAdmin: true } }));
    const pl = corpoValido('partner-lawyers');
    const rpl = await request.post(API('partner-lawyers'), { headers: { 'x-qa-cliente': ipNovo() }, data: pl });
    const { protocolo } = await rpl.json();
    const lista = await request.get('/api/parcerias/admin/candidaturas?programa=partner-lawyers', { headers: auth });
    expect(lista.status()).toBe(200);
    const corpo = await lista.json();
    expect(corpo.itens.every((i) => i.programa === 'partner-lawyers')).toBe(true);
    expect(corpo.itens.map((i) => i.protocolo)).toContain(protocolo);
    const outra = await (await request.get('/api/parcerias/admin/candidaturas?programa=business-partner', { headers: auth })).json();
    expect(outra.itens.map((i) => i.protocolo)).not.toContain(protocolo);
    const det = await (await request.get(`/api/parcerias/admin/candidaturas/${protocolo}`, { headers: auth })).json();
    expect(det.permitidos).toEqual(['validacao-profissional', 'arquivada']);

    // Tela da equipe com a sessão de admin: a candidatura aparece na lista do programa certo
    await page.setExtraHTTPHeaders({ 'x-qa-cliente': ip });
    await page.addInitScript((t) => { try { localStorage.setItem('dmc:token', t); } catch { /* sem storage */ } }, token);
    await page.goto('/plataforma-ead/parcerias.html?programa=partner-lawyers');
    await expect(page.locator(`#pa-linhas [data-protocolo="${protocolo}"]`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#pa-restrito')).toBeHidden();
    await page.goto('/plataforma-ead/parcerias.html?programa=business-partner');
    await expect(page.locator('#pa-app')).toBeVisible();
    await expect(page.locator(`#pa-linhas [data-protocolo="${protocolo}"]`)).toHaveCount(0);
  });

  test('tela da equipe com conta sem admin → "Acesso restrito a administradores"', async ({ page, request }) => {
    await exigirMongo(request);
    const ip = ipNovo();
    const cad = await request.post('/api/auth/signup', { headers: { 'x-qa-cliente': ip }, data: { email: emailNovo('aluno'), senha: 'senha-qa-' + crypto.randomBytes(4).toString('hex'), nome: 'Aluno QA' } });
    const { token } = await cad.json();
    await page.setExtraHTTPHeaders({ 'x-qa-cliente': ip });
    await page.addInitScript((t) => { try { localStorage.setItem('dmc:token', t); } catch { /* sem storage */ } }, token);
    await page.goto('/plataforma-ead/parcerias.html');
    await expect(page.locator('#pa-restrito')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#pa-app')).toBeHidden();
  });
});

// =====================================================================
// 3b · Respostas que não dá para provocar no servidor real sem derrubá-lo
//      (503/rede): só o comportamento do CLIENTE, com a rota interceptada.
// =====================================================================
test.describe('parcerias — cliente diante de 503 e falha de rede (rota interceptada)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  for (const [caso, responder] of [
    ['503', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Não foi possível registrar sua candidatura agora. Tente novamente em instantes.' }) })],
    ['rede', (route) => route.abort('connectionrefused')]
  ]) {
    test(`${caso}: nenhum falso sucesso, orienta tentar de novo + canal alternativo, formulário segue utilizável`, async ({ page }) => {
      const p = FORMS[0];
      const form = await abrirForm(page, p);
      await page.route(`**${API(p.programa)}`, responder);
      await preencherUI(page, p.programa, corpoValido(p.programa));
      await form.locator('[type="submit"]').click();
      const status = form.locator('.pp-status');
      await expect(status).toContainText('Não foi possível concluir o envio');
      await expect(status.locator('a[href^="https://wa.me/"]')).toHaveCount(1);
      await expect(status.locator('a[href="mailto:administrativo@complexodmc.com.br"]')).toHaveCount(1);
      await expect(page.locator('.pp-confirmacao')).toHaveCount(0);
      await expect(form.locator('[type="submit"]')).toBeEnabled();
      await expect(form).not.toHaveAttribute('aria-busy', 'true');
      expect(await page.locator(`#${p.ids}-email`).inputValue()).not.toBe('');
      expect((await eventos(page)).filter((e) => /_submit_success$/.test(e.event))).toHaveLength(0);
    });
  }
});

// Limite conhecido e documentado (server/README.md): a duplicidade é findOne antes do insert.
// Aqui só se MEDE quantas candidaturas dois envios simultâneos do mesmo e-mail geram.
test('medição: dois envios simultâneos do mesmo e-mail (corrida residual documentada)', async ({ request }) => {
  await exigirMongo(request);
  const corpo = corpoValido('partner-lawyers');
  const rs = await Promise.all([1, 2].map(() => request.post(API('partner-lawyers'), { headers: { 'x-qa-cliente': ipNovo() }, data: corpo })));
  const n = (await candidaturas({ email: corpo.email })).length;
  test.info().annotations.push({ type: 'info', description: `corrida: status ${rs.map((r) => r.status()).join('/')} → ${n} candidatura(s) gravada(s)` });
  expect(n).toBeGreaterThanOrEqual(1);
  expect(n).toBeLessThanOrEqual(2);
});

// =====================================================================
// 5 · Cabeçalho e overflow em 7 larguras (3 páginas + tecnologia)
// =====================================================================
const PAGINAS_HEADER = [...PP.map((p) => p.caminho), '/pages/tecnologia.html'];
for (const largura of VIEWPORTS) {
  test.describe(`parcerias — cabeçalho ${largura}px`, () => {
    test.use({ viewport: { width: largura, height: ALTURA_VIEWPORT[largura] }, isMobile: largura < 768, hasTouch: largura < 1024 });
    for (const caminho of PAGINAS_HEADER) {
      test(`${caminho}: modo da barra, sem sobreposição, sem overflow`, async ({ page }) => {
        pagina(caminho);
        await abrir(page, caminho);
        await page.waitForSelector('#navbar .dmc-nav__bar');
        const m = await page.evaluate(() => {
          const bar = document.querySelector('#navbar .dmc-nav__bar');
          const vis = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
          const cw = document.documentElement.clientWidth;
          const pecas = [
            ['marca', bar.querySelector('.dmc-brand')],
            ...[...bar.querySelectorAll('.dmc-nav__links > li')].map((li, i) => ['item' + i + ':' + li.textContent.trim().split(/\s+/)[0], li]),
            ['acessar', bar.querySelector('.dmc-access')],
            ['cta', bar.querySelector('.dmc-nav__cta--bar')],
            ['menu', bar.querySelector('.dmc-nav__toggle')]
          ].filter(([, el]) => vis(el)).map(([n, el]) => { const r = el.getBoundingClientRect(); return { n, l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height }; });
          const sobre = [];
          for (let i = 0; i < pecas.length; i++) for (let j = i + 1; j < pecas.length; j++) {
            const a = pecas[i]; const b = pecas[j];
            if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) sobre.push(`${a.n}×${b.n}`);
          }
          const fora = pecas.filter((x) => x.l < -1 || x.r > cw + 1).map((x) => x.n);
          const altos = pecas.filter((x) => x.h > 56).map((x) => x.n);
          const h1 = document.querySelector('h1');
          const barB = bar.getBoundingClientRect().bottom;
          return {
            cw, alturaBarra: Math.round(bar.getBoundingClientRect().height), pecas: pecas.map((x) => x.n), sobre, fora, altos,
            h1SobBarra: h1 ? h1.getBoundingClientRect().top < barB : null,
            links: vis(bar.querySelector('.dmc-nav__links')), menu: vis(bar.querySelector('.dmc-nav__toggle')), cta: vis(bar.querySelector('.dmc-nav__cta--bar'))
          };
        });
        await rolarTudo(page);
        await page.waitForTimeout(300);
        const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        await anexar('cabecalho.json', { largura, ...m, overflow: ov });
        if (m.sobre.length) causa(`cabeçalho: sobreposição em ${largura}px (${m.sobre.join(', ')})`);
        if (ov.sw > ov.cw) causa(`overflow horizontal em ${largura}px`);
        expect(m.sobre, JSON.stringify(m)).toEqual([]);
        expect(m.fora, 'peça do cabeçalho fora da janela').toEqual([]);
        expect(m.altos, 'peça quebrando linha').toEqual([]);
        expect(m.h1SobBarra, 'h1 escondido sob o cabeçalho').toBe(false);
        expect(m.alturaBarra).toBe(largura >= 1024 ? 72 : 64);
        expect(m.links).toBe(largura >= 1200);
        expect(m.menu).toBe(largura < 1200);
        expect(m.cta).toBe(largura >= 768);
        expect(ov.sw, 'scrollWidth > clientWidth').toBeLessThanOrEqual(ov.cw);
      });
    }
  });
}
