// pages/newsletter-descadastro.html → POST /api/newsletter/descadastro { email }.
// Contrato: server/src/routes/newsletter.js (202 neutro; 400 por campo; 429; 503).
// Página fora do sitemap (noindex): não entra em PAGINAS, por isso overflow, console e
// axe são conferidos aqui. 429/503/rede são simulados no frontend (page.route) — nunca
// se derruba o banco do servidor de QA. Com mongod descartável, o 202 é da API REAL.
import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { abrir, causa, pagina, anexar, estadoServidor } from './_site.js';

const CAMINHO = '/pages/newsletter-descadastro.html';
const ROTA = '**/api/newsletter/descadastro';
const RE_FALSO_SUCESSO = /removid|conclu[ií]d|cancelad|pronto/i;
const ipNovo = () => `10.${crypto.randomInt(1, 254)}.${crypto.randomInt(1, 254)}.${crypto.randomInt(1, 254)}`;
const emailNovo = () => `qa-nd-${crypto.randomBytes(4).toString('hex')}@exemplo.com.br`;
const json = (status, body) => (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function abrirForm(page) {
  pagina(CAMINHO);
  await page.setExtraHTTPHeaders({ 'x-qa-cliente': ipNovo() });
  await abrir(page, CAMINHO);
  const form = page.locator('form#descadastroForm');
  await expect(form).toHaveCount(1);
  return form;
}

test.describe('descadastro da newsletter — página', () => {
  for (const largura of [320, 390, 768, 1440]) {
    test(`${largura}px: 0 overflow, 0 erro de console`, async ({ page, baseURL }) => {
      pagina(CAMINHO);
      await page.setViewportSize({ width: largura, height: largura < 768 ? 800 : 900 });
      const erros = [];
      page.on('console', (m) => { if (m.type() === 'error') erros.push({ texto: m.text().slice(0, 300), url: (m.location()?.url || '').replace(baseURL, '') }); });
      page.on('pageerror', (e) => erros.push({ pageerror: String(e.message).slice(0, 300) }));
      page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(baseURL)) erros.push({ http: r.status(), url: r.url().replace(baseURL, '') }); });
      await abrir(page, CAMINHO);
      await page.waitForTimeout(500);
      const ov = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth, b: document.body.scrollWidth }));
      await anexar('medidas.json', { ov, erros });
      if (ov.s > ov.c) causa(`overflow ${ov.s - ov.c}px`);
      expect(ov.s, 'scrollWidth > clientWidth').toBeLessThanOrEqual(ov.c);
      expect(erros, JSON.stringify(erros)).toEqual([]);
    });
  }

  test('estrutura: h1 único, main#conteudo, noindex, canonical, form sem JS', async ({ page }) => {
    const form = await abrirForm(page);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main#conteudo')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.complexodmc.com.br/pages/newsletter-descadastro.html');
    await expect(form).toHaveAttribute('action', '/api/newsletter/descadastro');
    await expect(form).toHaveAttribute('method', /post/i);
    expect(await form.evaluate((f) => f.classList.contains('dmc-form'))).toBe(true);
    await expect(page.locator('#nd-email')).toHaveAttribute('type', 'email');
    await expect(page.locator('#nd-email')).toHaveAttribute('required', '');
    await expect(page.locator('#nd-website')).toHaveCount(1);
    await expect(page.locator('#formMessage')).toHaveAttribute('role', 'status');
    await expect(form.getByRole('button', { name: 'Cancelar inscrição' })).toBeVisible();
    await expect(page.locator('a[href="politica-de-privacidade.html#newsletter"]').first()).toBeVisible();
    await expect(page.locator('a[href^="mailto:administrativo@complexodmc.com.br"]').first()).toBeVisible();
    expect(await page.locator('main style').count(), 'sem <style> inline').toBe(0);
  });

  test('axe: 0 violações serious/critical (1440)', async ({ page }) => {
    await abrirForm(page);
    await page.waitForTimeout(500);
    const r = await new AxeBuilder({ page }).analyze();
    const graves = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ regra: v.id, impacto: v.impact, nos: v.nodes.length, ex: v.nodes[0]?.target.join(' ') }));
    await anexar('axe.json', { graves, total: r.violations.length });
    for (const v of graves) causa(`axe ${v.regra}`);
    expect(graves, JSON.stringify(graves)).toEqual([]);
  });

  test('teclado: tab chega ao campo e ao botão', async ({ page }) => {
    await abrirForm(page);
    await page.locator('#nd-email').focus();
    await expect(page.locator('#nd-email')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#submitBtn')).toBeFocused();
  });
});

test.describe('descadastro da newsletter — envio', () => {
  test('e-mail inválido → 400 por campo (API real), aria-invalid + aria-describedby, sem falso sucesso', async ({ page }) => {
    await abrirForm(page);
    await page.fill('#nd-email', 'nao-e-um-email');
    const resp = page.waitForResponse((r) => /\/api\/newsletter\/descadastro$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await page.click('#submitBtn');
    const r = await resp;
    expect(r.status()).toBe(400);
    expect(r.request().headers()['accept']).toContain('application/json');
    const campo = page.locator('#nd-email');
    await expect(campo).toHaveAttribute('aria-invalid', 'true');
    await expect(campo).toHaveAttribute('aria-describedby', /nd-email-erro/);
    await expect(page.locator('#nd-email-erro')).toBeVisible();
    await expect(campo).toBeFocused();
    const status = await page.locator('#formMessage').textContent();
    expect(status).not.toMatch(RE_FALSO_SUCESSO);
    expect(status).toMatch(/revise/i);
    // Ao digitar, a marca sai.
    await page.type('#nd-email', 'x');
    await expect(campo).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#nd-email-erro')).toHaveCount(0);
  });

  test('e-mail válido → 202 (API real) e mensagem neutra do servidor', async ({ page, request }) => {
    const est = await estadoServidor(request);
    test.skip(!est.mongo, `bloqueado: ${est.motivo || 'sem mongod'}`);
    await abrirForm(page);
    await page.fill('#nd-email', emailNovo());
    const resp = page.waitForResponse((r) => /\/api\/newsletter\/descadastro$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await page.click('#submitBtn');
    const r = await resp;
    expect(r.status()).toBe(202);
    const corpo = await r.json();
    expect(corpo.ok).toBe(true);
    await expect(page.locator('#formMessage')).toHaveText(corpo.mensagem);
    await expect(page.locator('#formMessage')).toHaveText(/Se este e-mail estiver na lista/);
    await expect(page.locator('#nd-email')).toHaveValue('');
    await expect(page.locator('#descadastroForm')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#submitBtn')).toBeEnabled();
  });

  for (const [status, body, re] of [
    [429, { error: 'Já recebemos pedidos recentes para este e-mail. Tente novamente mais tarde.' }, /pedidos recentes/],
    [503, { error: 'Não foi possível concluir o descadastro agora. Tente novamente em instantes.' }, /Não foi possível/],
    [403, { error: 'Pedido recusado: origem não autorizada.' }, /recusado/]
  ]) {
    test(`${status} simulado → mensagem de erro, sem falso sucesso`, async ({ page }) => {
      await abrirForm(page);
      await page.route(ROTA, json(status, body));
      await page.fill('#nd-email', emailNovo());
      await page.click('#submitBtn');
      const msg = page.locator('#formMessage');
      await expect(msg).toHaveText(re);
      await expect(msg).toHaveClass(/is-erro/);
      expect(await msg.textContent()).not.toMatch(RE_FALSO_SUCESSO);
      await expect(page.locator('#submitBtn')).toBeEnabled();
    });
  }

  test('falha de rede → orientação com e-mail administrativo, sem falso sucesso', async ({ page }) => {
    await abrirForm(page);
    await page.route(ROTA, (r) => r.abort('failed'));
    await page.fill('#nd-email', emailNovo());
    await page.click('#submitBtn');
    const msg = page.locator('#formMessage');
    await expect(msg).toHaveText(/administrativo@complexodmc\.com\.br/);
    await expect(msg).toHaveClass(/is-erro/);
    expect(await msg.textContent()).not.toMatch(RE_FALSO_SUCESSO);
  });

  test('sem JS: POST urlencoded responde HTML com a mensagem neutra', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, extraHTTPHeaders: { 'x-qa-cliente': ipNovo() } });
    const page = await ctx.newPage();
    try {
      await abrir(page, CAMINHO);
      await expect(page.locator('#descadastroForm')).toBeVisible();
      await page.fill('#nd-email', emailNovo());
      await page.click('#submitBtn');
      await page.waitForLoadState('load');
      expect(new URL(page.url()).pathname).toBe('/api/newsletter/descadastro');
      await expect(page.locator('h1')).toHaveText(/Pedido recebido|Tente novamente/);
    } finally { await ctx.close(); }
  });
});

test.describe('política de privacidade → link para o descadastro', () => {
  test('#newsletter aponta para a página', async ({ page }) => {
    pagina('/pages/politica-de-privacidade.html');
    await abrir(page, '/pages/politica-de-privacidade.html');
    const link = page.locator('#newsletter a[href="newsletter-descadastro.html"]');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveText(/descadastro do site/);
  });
});
