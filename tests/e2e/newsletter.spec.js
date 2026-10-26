// Newsletter · POST /api/newsletter. A seção 09 (#newsletterForm) saiu da home em 2026-10-25; o bloco de
// frontend fica desativado (skip) até o formulário existir de novo em alguma página. A API continua testada.
// Contrato: HOME_REDESIGN.md §3.09, contratos-qa.md §3.1, server/src/routes/newsletter.js.
// Com mongod descartável (tests/server/serve.mjs) usa a API REAL e confere a coleção
// newsletter_inscricoes; sem ele, intercepta a rota com o contrato do servidor e marca a
// integração como "bloqueado". 503 e falha de rede são sempre simulados no frontend
// (page.route) — nunca se derruba o banco do servidor de QA. Nunca grava em produção.
import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import { MongoClient } from 'mongodb';
import { abrir, causa, pagina, anexar, estadoServidor } from './_site.js';

test.use({ viewport: { width: 1440, height: 900 } });

const ROTA = '**/api/newsletter';
const COLECAO = 'newsletter_inscricoes';
// Mensagens de erro nunca podem soar como sucesso (§3.09).
const RE_FALSO_SUCESSO = /receb|cadastrad|registrada|inscri[çc][ãa]o confirmada/i;

async function inscricoes(est, filtro) {
  const c = new MongoClient(est.mongo.uri, { serverSelectionTimeoutMS: 3000 });
  try { await c.connect(); return await c.db(est.mongo.db).collection(COLECAO).find(filtro).toArray(); }
  finally { await c.close(); }
}
const ipNovo = () => `10.${crypto.randomInt(1, 254)}.${crypto.randomInt(1, 254)}.${crypto.randomInt(1, 254)}`;
const emailNovo = (rotulo) => `qa-nl-${rotulo}-${crypto.randomBytes(4).toString('hex')}@exemplo.com.br`;

async function abrirForm(page) {
  pagina('/#newsletter');
  await page.setExtraHTTPHeaders({ 'x-qa-cliente': ipNovo() });
  await abrir(page, '/');
  const form = page.locator('form#newsletterForm');
  await expect(form).toHaveCount(1);
  await form.scrollIntoViewIfNeeded();
  return form;
}
async function preencher(page, d = {}) {
  await page.fill('#nl-nome', d.nome ?? 'Maria da Silva QA');
  await page.fill('#nl-email', d.email ?? emailNovo('ok'));
  if (d.empresa !== undefined) await page.fill('#nl-empresa', d.empresa);
  if (d.consentimento !== false) await page.check('#nl-consentimento');
}
function contarPosts(page) {
  const lista = [];
  page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/newsletter\/?$/.test(new URL(r.url()).pathname)) lista.push(r); });
  return lista;
}
const json = (status, body) => (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

test.describe.skip('newsletter da home — frontend (formulário retirado da home em 2026-10-25)', () => {
  test('contrato do formulário: action, method, origem, campos, honeypot, status e texto de descadastro', async ({ page, request }) => {
    const form = await abrirForm(page);
    await expect(form).toHaveAttribute('action', '/api/newsletter');
    await expect(form).toHaveAttribute('method', /post/i);
    await expect(form).toHaveAttribute('data-origem', 'home');
    expect(await form.evaluate((f) => f.classList.contains('dmc-form')), 'form.dmc-form (visual único de campo)').toBe(true);
    for (const id of ['nl-nome', 'nl-email', 'nl-empresa', 'nl-consentimento', 'nl-website']) await expect(page.locator('#' + id), id).toHaveCount(1);
    await expect(page.locator('#nl-email')).toHaveAttribute('type', 'email');
    await expect(page.locator('#nl-nome')).toHaveAttribute('required', '');
    await expect(page.locator('#nl-email')).toHaveAttribute('required', '');
    await expect(page.locator('#nl-empresa')).not.toHaveAttribute('required', '');
    await expect(page.locator('#nlMessage')).toHaveAttribute('role', 'status');
    await expect(form.locator('[type="submit"]')).toContainText(/Quero receber an[áa]lises/i);
    const secao = page.locator('section#newsletter');
    await expect(secao).toContainText(/descadastr/i);
    // Consentimento LGPD com link para a política
    const cb = page.locator('#nl-consentimento');
    await expect(cb).toHaveAttribute('required', '');
    await expect(cb).not.toBeChecked();
    await expect(page.locator('label[for="nl-consentimento"]')).toContainText('LGPD');
    const link = page.locator('label[for="nl-consentimento"] a');
    await expect(link).toHaveCount(1);
    const href = await link.evaluate((a) => a.href);
    expect(new URL(href).pathname).toBe('/pages/politica-de-privacidade.html');
    expect((await request.get(href)).status()).toBe(200);
    // Honeypot fora da tela, fora do Tab e oculto a leitores de tela
    const hp = page.locator('#nl-website');
    await expect(hp).toHaveAttribute('tabindex', '-1');
    await expect(hp).toHaveAttribute('autocomplete', 'off');
    const info = await hp.evaluate((el) => { const r = el.getBoundingClientRect(); return { right: r.right, w: r.width, h: r.height, ariaHidden: !!el.closest('[aria-hidden="true"]') }; });
    await anexar('newsletter-honeypot.json', info);
    expect(info.ariaHidden).toBe(true);
    expect(info.right <= 0 || info.w <= 1 || info.h <= 1, JSON.stringify(info)).toBe(true);
    await page.focus('#nl-empresa');
    await page.keyboard.press('Tab');
    const foco = await page.evaluate(() => document.activeElement?.id);
    expect(foco, 'Tab depois de Empresa não cai no honeypot').not.toBe('nl-website');
  });

  test('obrigatórios vazios: o navegador bloqueia, nenhum POST sai, foco no 1.º inválido', async ({ page }) => {
    const form = await abrirForm(page);
    const posts = contarPosts(page);
    await form.locator('[type="submit"]').click();
    await page.waitForTimeout(400);
    expect(posts).toHaveLength(0);
    const invalidos = await form.evaluate((f) => [...f.querySelectorAll(':invalid')].filter((e) => e !== f).map((e) => e.id));
    expect(invalidos).toEqual(expect.arrayContaining(['nl-nome', 'nl-email', 'nl-consentimento']));
    await expect(page.locator('#nl-nome')).toBeFocused();
    // Sem consentimento também não sai
    await preencher(page, { consentimento: false });
    await form.locator('[type="submit"]').click();
    await page.waitForTimeout(400);
    if (posts.length) causa('newsletter envia sem consentimento LGPD');
    expect(posts).toHaveLength(0);
    expect(await page.locator('#nl-consentimento').evaluate((e) => e.matches(':invalid'))).toBe(true);
  });

  test('envio válido: 201, role=status confirma sem prometer e-mail, campos limpos, corpo JSON e 1 documento', async ({ page, request }) => {
    const est = await estadoServidor(request);
    const email = emailNovo('sucesso');
    let corpo = null;
    if (!est.mongo) {
      await page.route(ROTA, async (r) => { corpo = r.request().postDataJSON(); await r.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' }); });
    } else {
      page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/newsletter')) corpo = r.postDataJSON(); });
    }
    const form = await abrirForm(page);
    await preencher(page, { email, empresa: 'Empresa de Teste' });
    const resp = page.waitForResponse(ROTA);
    const botao = form.locator('[type="submit"]');
    await botao.click();
    const r = await resp;
    expect(r.status()).toBe(201);
    const status = page.locator('#nlMessage[role="status"]');
    await expect(status).toContainText(/Inscri[çc][ãa]o registrada/i);
    expect(await status.textContent()).not.toMatch(/voc[êe] receber[áa]|enviamos um e-mail/i);
    await expect(page.locator('#nl-nome')).toHaveValue('');
    await expect(page.locator('#nl-email')).toHaveValue('');
    await expect(page.locator('#nl-consentimento')).not.toBeChecked();
    await expect(botao).toBeEnabled();
    expect(await form.getAttribute('aria-busy')).not.toBe('true');
    expect(corpo).toMatchObject({ nome: 'Maria da Silva QA', email, empresa: 'Empresa de Teste', consentimento: true, origem: 'home' });
    expect(corpo.website ?? '').toBe('');
    if (est.mongo) {
      const salvos = await inscricoes(est, { email });
      await anexar('newsletter-doc.json', salvos);
      expect(salvos).toHaveLength(1);
      expect(salvos[0].status).toBe('ativa');
      expect(salvos[0].origem).toBe('home');
      expect(salvos[0].consentimentos?.[0]).toMatchObject({ origem: 'home', politicaVersao: 'qa', texto: 'v1' });
      expect(salvos[0].consentimentos[0].em).toBeInstanceOf(Date);
    }
  });

  test('erro do servidor (400): aria-invalid, aria-describedby com o erro do campo, foco no 1.º inválido', async ({ page, request }) => {
    const est = await estadoServidor(request);
    if (!est.mongo) {
      await page.route(ROTA, json(400, { error: 'Revise os campos indicados.', campos: { nome: 'Informe seu nome completo.', email: 'E-mail inválido. Confira o endereço digitado.' } }));
    }
    const form = await abrirForm(page);
    // Passa no navegador (type=email aceita "x@y") e falha na EMAIL_RE do servidor; nome de 1 letra falha no mínimo 2.
    await preencher(page, { nome: 'M', email: 'maria@exemplo' });
    const resp = page.waitForResponse(ROTA);
    await form.locator('[type="submit"]').click();
    expect((await resp).status()).toBe(400);
    await expect(page.locator('#nl-nome')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#nl-email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#nl-nome')).toBeFocused();
    const ligacao = await page.evaluate(() => ['nl-nome', 'nl-email'].map((id) => {
      const el = document.getElementById(id);
      const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const texto = ids.map((i) => document.getElementById(i)?.textContent || '').join(' ').trim();
      return { id, describedby: ids, texto: texto.slice(0, 80) };
    }));
    await anexar('newsletter-400.json', ligacao);
    const soltos = ligacao.filter((l) => !l.texto);
    if (soltos.length) causa('erro de campo da newsletter sem aria-describedby (mensagem só em #nlMessage)');
    expect(soltos, JSON.stringify(ligacao)).toEqual([]);
    expect(await page.locator('#nlMessage').textContent()).not.toMatch(RE_FALSO_SUCESSO);
    await page.fill('#nl-email', 'maria@exemplo.com.br');
    await expect(page.locator('#nl-email')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('isca preenchida: 200 neutro e nada gravado', async ({ page, request }) => {
    const est = await estadoServidor(request);
    if (!est.mongo) await page.route(ROTA, json(200, { ok: true }));
    const form = await abrirForm(page);
    const email = emailNovo('robo');
    await preencher(page, { email });
    await page.locator('#nl-website').fill('http://spam.example', { force: true });
    const resp = page.waitForResponse(ROTA);
    await form.locator('[type="submit"]').click();
    const r = await resp;
    expect(r.status()).toBe(200);
    expect(r.request().postDataJSON().website).toBe('http://spam.example');
    await expect(page.locator('#nlMessage')).toContainText(/Inscri[çc][ãa]o registrada/i); // o robô não percebe o descarte
    if (est.mongo) expect(await inscricoes(est, { email })).toHaveLength(0);
  });

  for (const [rotulo, status, body] of [
    ['429', 429, { error: 'Muitas inscrições em sequência. Aguarde alguns minutos e tente de novo.' }],
    ['413', 413, { error: 'Conteúdo grande demais. Reduza o texto dos campos e tente de novo.' }],
    ['503', 503, { error: 'Não foi possível registrar sua inscrição agora. Tente novamente em instantes.' }]
  ]) {
    test(`${rotulo}: mensagem orienta a tentar de novo e não soa como sucesso; formulário continua utilizável`, async ({ page }) => {
      await page.route(ROTA, json(status, body));
      const form = await abrirForm(page);
      await preencher(page);
      const resp = page.waitForResponse(ROTA);
      await form.locator('[type="submit"]').click();
      expect((await resp).status()).toBe(status);
      const msg = page.locator('#nlMessage');
      await expect(msg).toContainText(/tente|tentar|novamente|de novo/i);
      const texto = await msg.textContent();
      if (RE_FALSO_SUCESSO.test(texto)) causa(`newsletter: resposta ${status} exibida como sucesso`);
      expect(texto).not.toMatch(RE_FALSO_SUCESSO);
      await expect(page.locator('#nl-email')).not.toHaveValue(''); // nada é limpo sem 2xx
      await expect(form.locator('[type="submit"]')).toBeEnabled();
    });
  }

  test('falha de rede: nenhum falso sucesso e orientação de tentar de novo', async ({ page }) => {
    await page.route(ROTA, (r) => r.abort('connectionfailed'));
    const form = await abrirForm(page);
    await preencher(page);
    const reqFalhou = page.waitForEvent('requestfailed', { predicate: (r) => r.url().includes('/api/newsletter') });
    await form.locator('[type="submit"]').click();
    await reqFalhou;
    const msg = page.locator('#nlMessage');
    await expect(msg).toContainText(/tente|tentar|novamente|de novo|administrativo@complexodmc\.com\.br/i);
    const texto = await msg.textContent();
    if (RE_FALSO_SUCESSO.test(texto)) causa('newsletter: falha de rede exibida como sucesso');
    expect(texto).not.toMatch(RE_FALSO_SUCESSO);
    await expect(page.locator('#nl-email')).not.toHaveValue('');
    await expect(form.locator('[type="submit"]')).toBeEnabled();
  });
});

test.describe('POST /api/newsletter — integração com MongoDB descartável', () => {
  let est;
  test.beforeEach(async ({ request }) => {
    est = await estadoServidor(request);
    if (!est.mongo) {
      test.info().annotations.push({ type: 'bloqueado', description: `sem MongoDB local descartável: ${est.motivo}` });
      test.skip(true, `bloqueado: ${est.motivo}`);
    }
  });

  test('válido 201 grava; inválido 400 com campos; isca 200 sem gravar; 6.º envio do mesmo IP 429 + Retry-After', async ({ request }) => {
    const h = { 'x-qa-cliente': ipNovo(), 'content-type': 'application/json' };
    const email = emailNovo('api');
    const valido = { nome: 'Teste API', email, empresa: 'QA', consentimento: true, origem: 'qa' };
    const r1 = await request.post('/api/newsletter', { headers: h, data: valido });
    expect(r1.status()).toBe(201);
    expect(await r1.json()).toEqual({ ok: true }); // sem id (não revela quem está na lista)
    const docs = await inscricoes(est, { email });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ status: 'ativa', origem: 'qa', nome: 'Teste API', empresa: 'QA' });
    const r2 = await request.post('/api/newsletter', { headers: h, data: { ...valido, email: 'x', consentimento: false } });
    expect(r2.status()).toBe(400);
    const c2 = await r2.json();
    expect(Object.keys(c2.campos)).toEqual(expect.arrayContaining(['email', 'consentimento']));
    const emailRobo = emailNovo('api-robo');
    const r3 = await request.post('/api/newsletter', { headers: h, data: { ...valido, email: emailRobo, website: 'x' } });
    expect(r3.status()).toBe(200);
    expect(await inscricoes(est, { email: emailRobo })).toHaveLength(0);
    await request.post('/api/newsletter', { headers: h, data: { ...valido, email: emailNovo('api4') } });
    await request.post('/api/newsletter', { headers: h, data: { ...valido, email: emailNovo('api5') } });
    const r6 = await request.post('/api/newsletter', { headers: h, data: { ...valido, email: emailNovo('api6') } });
    expect(r6.status()).toBe(429);
    expect(r6.headers()['retry-after']).toBeTruthy();
  });

  test('e-mail repetido (e com maiúsculas): 2xx e um só documento, consentimentos acumulados', async ({ request }) => {
    const h = { 'x-qa-cliente': ipNovo(), 'content-type': 'application/json' };
    const email = emailNovo('dup');
    const dados = { nome: 'Repetida QA', email, consentimento: true, origem: 'qa' };
    const r1 = await request.post('/api/newsletter', { headers: h, data: dados });
    const r2 = await request.post('/api/newsletter', { headers: h, data: { ...dados, email: email.toUpperCase(), nome: 'Repetida QA 2' } });
    expect(r1.status()).toBe(201);
    expect([200, 201]).toContain(r2.status());
    const docs = await inscricoes(est, { email });
    expect(docs, 'count === 1').toHaveLength(1);
    expect(docs[0].consentimentos).toHaveLength(2);
    expect(await inscricoes(est, { email: email.toUpperCase() })).toHaveLength(0);
  });

  test('corpo > 16 KB → 413; urlencoded (sem JS) → 201', async ({ request }) => {
    const r = await request.post('/api/newsletter', { headers: { 'x-qa-cliente': ipNovo(), 'content-type': 'application/json' }, data: { nome: 'x'.repeat(20000) } });
    expect(r.status()).toBe(413);
    const email = emailNovo('form');
    const r2 = await request.post('/api/newsletter', { headers: { 'x-qa-cliente': ipNovo() }, form: { nome: 'Sem JS QA', email, consentimento: 'on', origem: 'home' } });
    expect(r2.status()).toBe(201);
    expect(await inscricoes(est, { email })).toHaveLength(1);
  });
});
