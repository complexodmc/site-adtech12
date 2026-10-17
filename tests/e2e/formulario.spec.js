// Formulário da home (#contactForm → POST /api/contato).
// Com mongod descartável (tests/server/serve.mjs) usa a API REAL e confere o banco
// de teste; sem ele, intercepta a rota com o contrato do servidor e marca a
// integração como "bloqueado". Nunca grava em produção/Atlas.
import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import { MongoClient } from 'mongodb';
import { abrir, causa, pagina } from './_site.js';

test.use({ viewport: { width: 1440, height: 900 } });

let ESTADO = null;
async function estadoServidor(request) {
  if (!ESTADO) ESTADO = await (await request.get('/__qa/estado')).json();
  return ESTADO;
}
async function leads(filtro) {
  const c = new MongoClient(ESTADO.mongo.uri, { serverSelectionTimeoutMS: 3000 });
  try { await c.connect(); return await c.db(ESTADO.mongo.db).collection('leads').find(filtro).toArray(); }
  finally { await c.close(); }
}
const ipNovo = () => `10.${crypto.randomInt(1, 254)}.${crypto.randomInt(1, 254)}.${crypto.randomInt(1, 254)}`;
const emailNovo = (rotulo) => `qa-${rotulo}-${crypto.randomBytes(4).toString('hex')}@exemplo.com.br`;

async function abrirForm(page) {
  pagina('/#contact');
  await page.setExtraHTTPHeaders({ 'x-qa-cliente': ipNovo() });
  await abrir(page, '/');
  const form = page.locator('#contactForm');
  await form.scrollIntoViewIfNeeded();
  return form;
}
async function preencher(page, d = {}) {
  await page.fill('#cf-nome', d.nome ?? 'Maria da Silva QA');
  await page.fill('#cf-email', d.email ?? emailNovo('ok'));
  await page.fill('#cf-telefone', d.telefone ?? '(11) 99999-0000');
  await page.fill('#cf-empresa', d.empresa ?? 'Empresa de Teste');
  await page.selectOption('#cf-perfil', d.perfil ?? 'empresario');
  await page.selectOption('#cf-eixo', d.eixo ?? 'E1');
  await page.fill('#cf-mensagem', d.mensagem ?? 'Mensagem de teste automatizado do QA, ambiente local.');
  if (d.consentimento !== false) await page.check('#cf-consentimento');
}
function contarPosts(page) {
  const lista = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/contato')) lista.push(r); });
  return lista;
}

test.describe('formulário da home — frontend', () => {
  test('obrigatórios vazios: o navegador bloqueia e nenhum POST sai', async ({ page }) => {
    const form = await abrirForm(page);
    const posts = contarPosts(page);
    await form.locator('[type="submit"]').click();
    await page.waitForTimeout(400);
    expect(posts).toHaveLength(0);
    const invalidos = await form.evaluate((f) => [...f.querySelectorAll(':invalid')].filter((e) => e !== f).map((e) => e.id));
    expect(invalidos).toEqual(expect.arrayContaining(['cf-nome', 'cf-email', 'cf-perfil', 'cf-eixo', 'cf-mensagem', 'cf-consentimento']));
    await expect(page.locator('#cf-nome')).toBeFocused();
  });

  test('consentimento LGPD: obrigatório, rotulado e com link para a política', async ({ page, request }) => {
    const form = await abrirForm(page);
    const cb = page.locator('#cf-consentimento');
    await expect(cb).toHaveAttribute('required', '');
    await expect(cb).not.toBeChecked();
    await expect(page.locator('label[for="cf-consentimento"]')).toContainText('LGPD');
    const link = page.locator('label[for="cf-consentimento"] a');
    await expect(link).toHaveCount(1);
    const href = await link.evaluate((a) => a.href);
    expect(new URL(href).pathname).toBe('/pages/politica-de-privacidade.html');
    expect((await request.get(href)).status()).toBe(200);
    const posts = contarPosts(page);
    await preencher(page, { consentimento: false });
    await form.locator('[type="submit"]').click();
    await page.waitForTimeout(400);
    if (posts.length) causa('formulário envia sem consentimento LGPD');
    expect(posts).toHaveLength(0);
    expect(await cb.evaluate((e) => e.matches(':invalid'))).toBe(true);
  });

  test('honeypot: fora da tela, fora do Tab e oculto para leitores de tela', async ({ page }) => {
    await abrirForm(page);
    const hp = page.locator('#cf-website');
    await expect(hp).toHaveAttribute('tabindex', '-1');
    await expect(hp).toHaveAttribute('autocomplete', 'off');
    const info = await hp.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { right: r.right, bottom: r.bottom, w: r.width, h: r.height, ariaHidden: !!el.closest('[aria-hidden="true"]') };
    });
    expect(info.ariaHidden).toBe(true);
    expect(info.right <= 0 || info.w <= 1 || info.h <= 1, JSON.stringify(info)).toBe(true);
    await page.focus('#cf-mensagem');
    await page.keyboard.press('Tab');
    await expect(page.locator('#cf-consentimento')).toBeFocused();
  });

  test('erro do servidor (400): aria-invalid, foco no 1º campo e mensagem ligada por aria-describedby', async ({ page, request }) => {
    const est = await estadoServidor(request);
    if (!est.mongo) {
      // Mesmo contrato de server/src/routes/contato.js
      await page.route('**/api/contato', (r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Revise os campos indicados.', campos: { email: 'E-mail inválido. Confira o endereço digitado.', telefone: 'Telefone inválido. Informe DDD e número.' } }) }));
    }
    const form = await abrirForm(page);
    // Passa na validação do navegador e falha na do servidor (TLD e dígitos).
    await preencher(page, { email: 'maria@exemplo', telefone: '123' });
    const resp = page.waitForResponse('**/api/contato');
    await form.locator('[type="submit"]').click();
    expect((await resp).status()).toBe(400);
    const status = page.locator('#formMessage');
    await expect(status).toHaveAttribute('role', 'status');
    await expect(status).toContainText('E-mail inválido');
    await expect(page.locator('#cf-email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#cf-telefone')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#cf-email')).toBeFocused();
    // Cada campo inválido deve apontar (aria-describedby) para um texto com o SEU erro.
    const ligacao = await page.evaluate(() => ['cf-email', 'cf-telefone'].map((id) => {
      const el = document.getElementById(id);
      const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const texto = ids.map((i) => document.getElementById(i)?.textContent || '').join(' ').trim();
      return { id, describedby: ids, texto: texto.slice(0, 80) };
    }));
    const soltos = ligacao.filter((l) => !l.texto);
    if (soltos.length) causa('erro de campo sem aria-describedby (mensagem só no #formMessage do form)');
    expect.soft(soltos, JSON.stringify(ligacao)).toEqual([]);
    // Corrigir o campo remove a marca de erro
    await page.fill('#cf-email', 'maria@exemplo.com.br');
    await expect(page.locator('#cf-email')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('envio válido: role=status anuncia sucesso e o formulário é limpo', async ({ page, request }) => {
    const est = await estadoServidor(request);
    const email = emailNovo('sucesso');
    let corpo = null;
    if (!est.mongo) {
      await page.route('**/api/contato', async (r) => { corpo = r.request().postDataJSON(); await r.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true,"id":"x"}' }); });
    } else {
      page.on('request', (r) => { if (r.url().includes('/api/contato') && r.method() === 'POST') corpo = r.postDataJSON(); });
    }
    const form = await abrirForm(page);
    await preencher(page, { email });
    const resp = page.waitForResponse('**/api/contato');
    await form.locator('[type="submit"]').click();
    const r = await resp;
    expect(r.status()).toBe(201);
    const status = page.locator('#formMessage[role="status"]');
    await expect(status).toContainText('Mensagem recebida');
    await expect(page.locator('#cf-nome')).toHaveValue('');
    await expect(page.locator('#cf-consentimento')).not.toBeChecked();
    expect(corpo).toMatchObject({ email, consentimento: true, origem: 'home', perfil: 'empresario', eixo: 'E1' });
    expect(corpo.website ?? '').toBe('');
    if (est.mongo) {
      const salvos = await leads({ email });
      expect(salvos).toHaveLength(1);
      expect(salvos[0].consentimento.aceito).toBe(true);
      expect(salvos[0].origem).toBe('home');
    }
  });

  test('envio com isca preenchida: resposta neutra e nada gravado', async ({ page, request }) => {
    const est = await estadoServidor(request);
    if (!est.mongo) await page.route('**/api/contato', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    const form = await abrirForm(page);
    const email = emailNovo('robo');
    await preencher(page, { email });
    await page.locator('#cf-website').fill('http://spam.example', { force: true });
    const resp = page.waitForResponse('**/api/contato');
    await form.locator('[type="submit"]').click();
    const r = await resp;
    expect(r.status()).toBe(200);
    expect(r.request().postDataJSON().website).toBe('http://spam.example');
    await expect(page.locator('#formMessage')).toContainText('Mensagem recebida'); // o robô não percebe o descarte
    if (est.mongo) expect(await leads({ email })).toHaveLength(0);
  });
});

test.describe('POST /api/contato — integração com MongoDB descartável', () => {
  test.beforeEach(async ({ request }) => {
    const est = await estadoServidor(request);
    if (!est.mongo) {
      test.info().annotations.push({ type: 'bloqueado', description: `sem MongoDB local descartável: ${est.motivo}` });
      test.skip(true, `bloqueado: ${est.motivo}`);
    }
  });

  test('válido 201 grava; inválido 400 com campos; isca 200 sem gravar; 6º envio do mesmo IP 429', async ({ request }) => {
    const ip = ipNovo();
    const h = { 'x-qa-cliente': ip, 'content-type': 'application/json' };
    const email = emailNovo('api');
    const valido = { nome: 'Teste API', email, perfil: 'investidor', eixo: 'E5', mensagem: 'Teste de integração da API.', consentimento: true, origem: 'qa' };
    const r1 = await request.post('/api/contato', { headers: h, data: valido });
    expect(r1.status()).toBe(201);
    expect((await leads({ email }))).toHaveLength(1);
    const r2 = await request.post('/api/contato', { headers: h, data: { ...valido, email: 'x', consentimento: false } });
    expect(r2.status()).toBe(400);
    const c2 = await r2.json();
    expect(Object.keys(c2.campos)).toEqual(expect.arrayContaining(['email', 'consentimento']));
    const emailRobo = emailNovo('api-robo');
    const r3 = await request.post('/api/contato', { headers: h, data: { ...valido, email: emailRobo, website: 'x' } });
    expect(r3.status()).toBe(200);
    expect(await leads({ email: emailRobo })).toHaveLength(0);
    await request.post('/api/contato', { headers: h, data: { ...valido, email: emailNovo('api4') } });
    await request.post('/api/contato', { headers: h, data: { ...valido, email: emailNovo('api5') } });
    const r6 = await request.post('/api/contato', { headers: h, data: { ...valido, email: emailNovo('api6') } });
    expect(r6.status()).toBe(429);
    expect(r6.headers()['retry-after']).toBeTruthy();
  });

  test('corpo > 16 KB → 413', async ({ request }) => {
    const r = await request.post('/api/contato', { headers: { 'x-qa-cliente': ipNovo(), 'content-type': 'application/json' }, data: { mensagem: 'x'.repeat(20000) } });
    expect(r.status()).toBe(413);
  });
});
