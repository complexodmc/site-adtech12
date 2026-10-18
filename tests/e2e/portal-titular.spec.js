// =============================================================
// E2E da F0p — páginas do titular (PORTAL-ACADEMICO.md §8.5 linha F0p, §8.6; UX §6.14–§6.18,
// §8.5; API §6.1, §6.3, §6.4). Roda no tests/server/serve.mjs (mongod descartável, ViaCEP e
// Resend falsos, PORTAL_BASE_URL definido → link de acesso e recuperação ligados).
//
//   QA_PORT=4647 QA_WORKERS=2 QA_DATA=<AAAA-MM-DD>-f0p QA_FATIA=F0p \
//   PORTAL_MODULOS=routes/portal/atendimento.js,routes/portal/configuracoes.js \
//   npx playwright test tests/e2e/portal-titular.spec.js
//
// Os 9 módulos da F0t entram sempre (API §5.2). Seletores por papel e texto da UX (o texto é
// o contrato da tela da própria fatia); dado vindo do servidor (texto literal de consentimento,
// efeito da revogação, mensagem genérica do link) é comparado com o que a API devolve.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import * as P from './_portal.js';

const EAD = P.BASE_EAD;
const RE_LINK = /acesso-link\.html#(acesso|redefinir|email|verificar)=([A-Za-z0-9_%-]+)/;

/** Fecha o caso: evidência + reprova pageerror e resposta 4xx/5xx inesperada (D-73). */
async function fechar(mon) {
  await mon.anexar('console-e-rede');
  await mon.verificar({ tipos: ['pageerror', 'resposta'], rotulo: 'pageerror e respostas' });
}

/** Espera o e-mail chegar ao Resend falso (envio em segundo plano, API §4.14). */
async function emailPara(request, para, { assunto = null, desde = null, tempo = 8000 } = {}) {
  const fim = Date.now() + tempo;
  while (Date.now() < fim) {
    const q = new URLSearchParams({ para });
    if (desde) q.set('desde', desde);
    const r = await request.get(`/__qa/emails?${q}`);
    const { emails = [] } = await r.json();
    const achado = emails.filter((e) => !assunto || String(e.assunto || '').toLowerCase().includes(assunto)).pop();
    if (achado) return achado;
    await new Promise((ok) => setTimeout(ok, 200));
  }
  return null;
}
function linkDoEmail(email) {
  const corpo = `${email.texto || ''}\n${email.html || ''}\n${typeof email.corpo === 'string' ? email.corpo : JSON.stringify(email.corpo || '')}`;
  const m = corpo.replace(/&amp;/g, '&').match(RE_LINK);
  return m ? { modo: m[1], token: decodeURIComponent(m[2]) } : null;
}

/** TOTP (RFC 6238, SHA-1, 30 s, 6 dígitos) a partir do segredo base32 mostrado na tela. */
function totp(segredoBase32, passo = Math.floor(Date.now() / 30000)) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of segredoBase32.replace(/[\s=]/g, '').toUpperCase()) bits += alfabeto.indexOf(c).toString(2).padStart(5, '0');
  const bytes = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const h = crypto.createHmac('sha1', bytes).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

/** Admin semeado; com PORTAL_2FA=1 a coordenação precisa do 2FA ativo (API §6.1, `2fa-obrigatorio`). */
async function coordenacao(request, rotulo) {
  const admin = await P.criarUsuario(request, { papel: 'admin', rotulo });
  if (process.env.PORTAL_2FA !== '1') return { ...admin, reautenticacao: () => ({ senha: admin.senha }) };
  const cli = P.api(request, admin.token);
  const ini = await cli.post('/api/auth/2fa/iniciar', { senha: admin.senha });
  expect(ini.status, JSON.stringify(ini.json)).toBe(200);
  const at = await cli.post('/api/auth/2fa/ativar', { codigo: totp(ini.json.segredo) });
  expect(at.status, JSON.stringify(at.json)).toBe(200);
  // Reautenticação com 2FA ativo pede também o código; o do passo seguinte vale (janela ±1) e não repete o da ativação.
  return { ...admin, token: at.json.token, reautenticacao: () => ({ senha: admin.senha, codigo: totp(ini.json.segredo, Math.floor(Date.now() / 30000) + 1) }) };
}

async function aluno(request, page) {
  const u = await P.criarUsuario(request, { papel: 'aluno', rotulo: 'f0p' });
  await P.simularCliente(page);
  await P.entrarComToken(page, u.token);
  return u;
}

async function perfilApi(request, u) {
  const r = await P.api(request, u.token).get('/api/portal/me/perfil');
  expect(r.status, 'GET /api/portal/me/perfil').toBe(200);
  return r.json;
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------
test.describe('Perfil (perfil.html)', () => {
  test('identificação com CPF e nome social com o texto literal do servidor; 409 da outra aba e 428 reabrem sem perder o digitado', async ({ page, request }) => {
    const u = await aluno(request, page);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    const dados = await perfilApi(request, u);
    const textoNomeSocial = dados.textosConsentimento.perfil_nome_social.texto;

    await page.goto(`${EAD}perfil.html`);
    const secao = page.locator('#identificacao');
    await expect(secao.getByRole('heading', { name: 'Identificação' })).toBeVisible();
    await expect(page.locator('#pf-perfil-completude')).toContainText('faltam');

    const cpf = P.cpfValido();
    await secao.getByLabel('Nome de registro').fill('Maria Teste da Silva');
    await secao.getByRole('textbox', { name: 'CPF' }).fill(cpf);
    await expect(secao.getByRole('textbox', { name: 'CPF' })).toHaveValue(`${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`);
    await secao.getByLabel('Data de nascimento').fill('15031990');
    await secao.getByLabel('Nacionalidade').fill('Brasileira');

    // Nome social: o bloco aparece com o texto LITERAL; sem a caixa, nada vai ao servidor.
    await secao.getByLabel('Nome social').fill('Mari Teste');
    const bloco = secao.locator('[data-consentimento="nomeSocial"]');
    await expect(bloco).toContainText(textoNomeSocial);
    let puts = 0;
    page.on('request', (r) => { if (r.method() === 'PUT' && r.url().endsWith('/api/portal/me/perfil')) puts += 1; });
    await secao.getByRole('button', { name: 'Salvar identificação' }).click();
    await expect(secao.getByText('Para salvar o nome social, marque a autorização.').first()).toBeVisible();
    expect(puts).toBe(0);

    await bloco.getByLabel('Concordo com este uso').check();
    await secao.getByRole('button', { name: 'Salvar identificação' }).click();
    await expect(page.locator('#identificacao [role="status"]').filter({ hasText: 'Identificação salva.' })).toBeVisible();
    const salvo = await perfilApi(request, u);
    expect(salvo.perfil.cpf).toBe(cpf);
    expect(salvo.perfil.nascimento).toBe('1990-03-15');
    expect(salvo.perfil.nomeSocial).toBe('Mari Teste');
    expect(salvo.consentimentos.nomeSocial && salvo.consentimentos.nomeSocial.aceito).toBe(true);
    await expect(page.locator('#identificacao [data-consentimento="nomeSocial"]')).toContainText('Autorizado em');

    // Autorização retirada "em outra aba": a retirada apaga o valor e muda a versão do perfil,
    // então o servidor responde 409 conflito-versao (confere a versão antes do consentimento).
    const rev = await P.api(request, u.token).post('/api/portal/me/dados/consentimentos/perfil_nome_social/revogar', {});
    expect(rev.status).toBe(200);
    P.esperar(page, { status: 409, url: '/api/portal/me/perfil', metodo: 'PUT' });
    await secao.getByLabel('Nome social').fill('Mari T.');
    await secao.getByRole('button', { name: 'Salvar identificação' }).click();
    await expect(secao.getByText('Alguém alterou este registro enquanto você editava. Recarregue para ver a versão atual.')).toBeVisible();
    await expect(secao.getByLabel('Nome social')).toHaveValue('Mari T.');
    await secao.getByRole('button', { name: 'Recarregar' }).click();
    await expect(page.locator('#identificacao').getByLabel('Nome social')).toHaveValue('');

    // 428 consentimento-necessario (texto mudou de versão entre a leitura e o envio): a tela reabre
    // o aceite com o texto atual, foca nele e não perde o digitado. O 428 é simulado só no 1º envio.
    let simulado = false;
    await page.route('**/api/portal/me/perfil', async (route) => {
      if (route.request().method() === 'PUT' && !simulado) {
        simulado = true;
        await route.fulfill({ status: 428, contentType: 'application/json', body: JSON.stringify({ error: 'É preciso registrar a sua autorização para continuar.', codigo: 'consentimento-necessario', finalidade: 'perfil_nome_social' }) });
        return;
      }
      await route.continue();
    });
    P.esperar(page, { status: 428, url: '/api/portal/me/perfil', metodo: 'PUT' });
    const sec2 = page.locator('#identificacao');
    await sec2.getByLabel('Nome social').fill('Mari T.');
    await sec2.locator('[data-consentimento="nomeSocial"]').getByLabel('Concordo com este uso').check();
    await sec2.getByRole('button', { name: 'Salvar identificação' }).click();
    await expect(sec2.getByText('Confirme a autorização para salvar.').first()).toBeVisible();
    await expect(sec2.locator('[data-consentimento="nomeSocial"]')).toContainText(textoNomeSocial);
    // Contrato §7 (`exigir`: "reabre com o texto novo e foco nele"): o foco fica no bloco do aceite,
    // no texto literal ou na caixa, conforme o DMC_UI.consentimento.
    await expect.poll(() => page.evaluate(() => {
      const a = document.activeElement;
      return !!(a && a.closest('#identificacao [data-consentimento="nomeSocial"]'));
    })).toBe(true);
    await expect(sec2.getByLabel('Nome social')).toHaveValue('Mari T.');
    await expect(sec2.getByLabel('Nome de registro')).toHaveValue('Maria Teste da Silva');
    await sec2.locator('[data-consentimento="nomeSocial"]').getByLabel('Concordo com este uso').check();
    await sec2.getByRole('button', { name: 'Salvar identificação' }).click();
    await expect(page.locator('#identificacao [role="status"]').filter({ hasText: 'Identificação salva.' })).toBeVisible();
    expect((await perfilApi(request, u)).perfil.nomeSocial).toBe('Mari T.');
    await fechar(mon);
  });

  test('CPF inválido é recusado na tela; gênero e etnia pedem consentimento próprio, "Prefiro não informar" não pede', async ({ page, request }) => {
    const u = await aluno(request, page);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    const dados = await perfilApi(request, u);
    await page.goto(`${EAD}perfil.html#dados-pessoais`);

    const id = page.locator('#identificacao');
    await id.getByRole('textbox', { name: 'CPF' }).fill('11111111111');
    await id.getByLabel('Data de nascimento').click();
    await expect(id.locator('[data-campo="cpf"] .pf-erro-campo')).toHaveText('CPF inválido. Confira os números.');

    const dp = page.locator('#dados-pessoais');
    await dp.getByLabel('Gênero (opcional)').selectOption('prefiro_nao_informar');
    await expect(dp.locator('[data-consentimento="genero"]')).toBeHidden();
    await dp.getByLabel('Gênero (opcional)').selectOption('feminino');
    await expect(dp.locator('[data-consentimento="genero"]')).toContainText(dados.textosConsentimento.perfil_genero.texto);
    await dp.getByLabel('Cor ou etnia, classificação do IBGE (opcional)').selectOption('parda');
    await expect(dp.locator('[data-consentimento="etnia"]')).toContainText(dados.textosConsentimento.perfil_etnia.texto);
    await dp.locator('[data-consentimento="genero"]').getByLabel('Concordo com este uso').check();
    await dp.locator('[data-consentimento="etnia"]').getByLabel('Concordo com este uso').check();
    await dp.getByLabel('Estado civil').selectOption('solteiro');
    await dp.getByRole('button', { name: 'Salvar dados pessoais' }).click();
    await expect(page.locator('#dados-pessoais [role="status"]').filter({ hasText: 'Dados pessoais salvos.' })).toBeVisible();
    const salvo = await perfilApi(request, u);
    expect([salvo.perfil.genero, salvo.perfil.etnia, salvo.perfil.estadoCivil]).toEqual(['feminino', 'parda', 'solteiro']);
    await fechar(mon);
  });

  test('endereço: CEP consultado pelo servidor (ViaCEP falso) preenche e leva o foco ao número', async ({ page, request }) => {
    const u = await aluno(request, page);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    await page.goto(`${EAD}perfil.html#endereco`);
    const sec = page.locator('#endereco');
    const respCep = page.waitForResponse((r) => r.url().includes('/api/portal/cep/01310100'));
    await sec.getByLabel('CEP').fill('01310100');
    expect((await respCep).status()).toBe(200);
    await expect(sec.getByText('Endereço preenchido pelo CEP. Confira e complete.')).toBeVisible();
    await expect(sec.getByLabel('Logradouro')).toHaveValue('Avenida Paulista');
    await expect(sec.getByLabel('Bairro')).toHaveValue('Bela Vista');
    await expect(sec.getByLabel('Cidade')).toHaveValue('São Paulo');
    await expect(sec.getByRole('combobox', { name: 'UF', exact: true })).toHaveValue('SP');
    await expect(sec.getByLabel('Número')).toBeFocused();
    await sec.getByLabel('Número').fill('1000');
    await sec.getByRole('button', { name: 'Salvar endereço' }).click();
    await expect(page.locator('#endereco [role="status"]').filter({ hasText: 'Endereço salvo.' })).toBeVisible();
    const e = (await perfilApi(request, u)).perfil.endereco;
    expect([e.cep, e.logradouro, e.numero, e.uf]).toEqual(['01310100', 'Avenida Paulista', '1000', 'SP']);
    await fechar(mon);
  });

  test('foto: [Concordo] antes de [Enviar foto]; envio e remoção', async ({ page, request }) => {
    const u = await aluno(request, page);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    const dados = await perfilApi(request, u);
    await page.goto(`${EAD}perfil.html#foto`);
    const sec = page.locator('#foto');
    await expect(sec.locator('[data-consentimento="foto"]')).toContainText(dados.textosConsentimento.perfil_foto.texto);
    await expect(sec.getByLabel('Escolher foto')).toBeHidden();
    await sec.getByRole('button', { name: 'Concordo' }).click();
    await expect(sec.getByText('Autorização registrada. Agora você pode enviar a foto.')).toBeVisible();
    await sec.getByLabel('Escolher foto').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: P.PNG_1PX });
    await expect(sec.getByRole('img', { name: 'Prévia da nova foto' })).toBeVisible();
    await sec.getByRole('button', { name: 'Enviar foto' }).click();
    await expect(page.locator('#foto').getByText('Foto enviada.')).toBeVisible();
    await expect(page.locator('#foto').getByRole('img', { name: 'Sua foto atual' })).toBeVisible();
    expect((await P.api(request, u.token).get('/api/portal/me/perfil/foto')).status).toBe(200);

    await P.confirmarNaTela(page, () => page.locator('#foto').getByRole('button', { name: 'Remover foto' }).click());
    await expect(page.locator('#foto').getByText('Foto removida.')).toBeVisible();
    await fechar(mon);
  });

  test('foto: 428 no envio reabre o aceite como [Concordo e enviar] e reenvia o mesmo arquivo', async ({ page, request }) => {
    const u = await aluno(request, page);
    const p = await perfilApi(request, u);
    const ok = await P.api(request, u.token).post('/api/portal/me/dados/consentimentos', { finalidade: 'perfil_foto', aceito: true, versaoTexto: p.textosConsentimento.perfil_foto.versaoTexto });
    expect(ok.status).toBe(201);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    await page.goto(`${EAD}perfil.html#foto`);
    const sec = page.locator('#foto');
    await expect(sec.locator('[data-consentimento="foto"]')).toContainText('Autorizado em');
    // A autorização é retirada em outra aba depois de a tela abrir: o envio recebe 428.
    expect((await P.api(request, u.token).post('/api/portal/me/dados/consentimentos/perfil_foto/revogar', {})).status).toBe(200);
    P.esperar(page, { status: 428, url: '/api/portal/me/perfil/foto', metodo: 'POST' });
    await sec.getByLabel('Escolher foto').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: P.PNG_1PX });
    await sec.getByRole('button', { name: 'Enviar foto' }).click();
    await expect(sec.getByText('Confirme a autorização para salvar.').first()).toBeVisible();
    await sec.getByRole('button', { name: 'Concordo e enviar' }).click();
    await expect(page.locator('#foto').getByText('Foto enviada.')).toBeVisible();
    expect((await P.api(request, u.token).get('/api/portal/me/perfil/foto')).status).toBe(200);
    await fechar(mon);
  });

  test('sessão encerrada no meio da edição: o envio volta ao login com next=perfil.html', async ({ page, request }) => {
    const u = await aluno(request, page);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    await page.goto(`${EAD}perfil.html`);
    await page.locator('#dados-pessoais').getByLabel('Estado civil').selectOption('casado');
    const { ObjectId } = await import('mongodb');
    await P.comBanco(request, (db) => db.collection('users').updateOne({ _id: new ObjectId(u.id) }, { $inc: { sessaoVersao: 1 } }));
    P.esperar(page, { status: 401, url: '/api/portal/me/perfil' });
    await page.locator('#dados-pessoais').getByRole('button', { name: 'Salvar dados pessoais' }).click();
    await expect(page).toHaveURL(/login\.html\?next=perfil\.html/);
    expect(await page.evaluate(() => localStorage.getItem('dmc:token'))).toBeNull();
    await mon.anexar('console-e-rede');
    const c = await mon.classificar();
    expect(c.inesperadas.filter((i) => i.tipo !== 'console' && !/login\.html/.test(i.pagina || '')), 'caminho até o login').toEqual([]);
  });

  test('senha e segurança: troca de senha (o servidor confere a nova senha)', async ({ page, request }) => {
    const u = await aluno(request, page);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    await page.goto(`${EAD}perfil.html#seguranca`);
    await expect(page.locator('#seguranca-titulo')).toBeFocused();
    const form = page.locator('form[data-secao="senha"]');
    // Sem PORTAL_2FA o bloco do 2FA não aparece (UX §6.15).
    if (process.env.PORTAL_2FA !== '1') await expect(page.locator('.pf-perfil-2fa')).toHaveCount(0);
    await form.getByLabel('Senha atual').fill(u.senha);
    await form.getByLabel(/^Nova senha/).fill('curta');
    await form.getByLabel('Confirmar nova senha').fill('curta');
    await form.getByRole('button', { name: 'Trocar senha' }).click();
    await expect(form.locator('[data-campo="novaSenha"] .pf-erro-campo')).toContainText('8 a 72');
    const nova = `Nova-${P.uid('s')}`;
    await form.getByLabel(/^Nova senha/).fill(nova);
    await form.getByLabel('Confirmar nova senha').fill(nova);
    await form.getByRole('button', { name: 'Trocar senha' }).click();
    await expect(form.getByText('Senha alterada.')).toBeVisible();
    const login = await P.api(request).post('/api/auth/signin', { email: u.email, senha: nova });
    expect(login.status).toBe(200);
    // A sessão desta aba segue válida (token novo regravado).
    await page.reload();
    await expect(page.locator('#identificacao-titulo')).toBeVisible();
    await fechar(mon);
  });
});

// ---------------------------------------------------------------------------
// Modo restrito (D-61, D-63): senha temporária → perfil.html#seguranca → destino do papel
// ---------------------------------------------------------------------------
test.describe('Modo restrito', () => {
  test('aluno com senha gerada pela coordenação cai em "Crie uma senha pessoal" e chega ao Início, sem 4xx', async ({ page, request }) => {
    const admin = await coordenacao(request, 'f0p-adm');
    const al = await P.criarUsuario(request, { papel: 'aluno', rotulo: 'f0p-tmp' });
    const g = await P.api(request, admin.token).post(`/api/portal/admin/usuarios/${al.id}/senha-temporaria`, { motivo: 'Teste de QA da fatia F0p.', reautenticacao: admin.reautenticacao() });
    expect(g.status, JSON.stringify(g.json)).toBe(200);
    const login = await P.api(request).post('/api/auth/signin', { email: al.email, senha: g.json.senhaTemporaria });
    expect(login.status).toBe(200);
    expect(login.json.user.precisaTrocarSenha).toBe(true);

    await P.simularCliente(page);
    await P.entrarComToken(page, login.json.token);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    await page.goto(`${EAD}meus-dados.html`);
    await expect(page).toHaveURL(/perfil\.html#seguranca$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Crie uma senha pessoal para continuar' })).toBeVisible();
    await page.getByLabel('Senha temporária').fill(g.json.senhaTemporaria);
    const nova = `Pessoal-${P.uid('s')}`;
    await page.getByLabel(/^Nova senha/).fill(nova);
    await page.getByLabel('Confirmar nova senha').fill(nova);
    await page.getByRole('button', { name: 'Criar senha' }).click();
    await expect(page).toHaveURL(/dashboard\.html/);
    // 0 resposta 4xx no caminho até o destino (UX §6.15; D-61).
    expect(mon.registro.respostas.filter((r) => r.status >= 400 && r.status < 500 && !/dashboard\.html/.test(r.pagina)), 'nenhum 4xx no fluxo').toEqual([]);
    expect((await P.api(request).post('/api/auth/signin', { email: al.email, senha: nova })).status).toBe(200);
    await fechar(mon);
  });

  test('professor criado pela coordenação troca a senha temporária e vai ao professor.html', async ({ page, request }) => {
    const admin = await coordenacao(request, 'f0p-adm2');
    const email = `qa-prof-${P.uid('p')}@exemplo.invalid`;
    const r = await P.api(request, admin.token).post('/api/portal/admin/equipe', { email, nome: 'Professora QA F0p', papel: 'professor' });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    const login = await P.api(request).post('/api/auth/signin', { email, senha: r.json.senhaTemporaria });
    expect(login.status).toBe(200);

    await P.simularCliente(page);
    await P.entrarComToken(page, login.json.token);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    await page.goto(`${EAD}notificacoes.html`);
    await expect(page).toHaveURL(/perfil\.html#seguranca$/);
    await page.getByLabel('Senha temporária').fill(r.json.senhaTemporaria);
    const nova = `Docente-${P.uid('s')}`;
    await page.getByLabel(/^Nova senha/).fill(nova);
    await page.getByLabel('Confirmar nova senha').fill(nova);
    await page.getByRole('button', { name: 'Criar senha' }).click();
    await expect(page).toHaveURL(/professor\.html/);
    // professor.html é da F8 (em obra): conferimos o caminho até ela, não o que ela carrega.
    await mon.anexar('console-e-rede');
    const c = await mon.classificar();
    expect(c.inesperadas.filter((i) => i.tipo !== 'console' && !/professor\.html/.test(i.pagina || '')), 'caminho até o destino').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Meus dados
// ---------------------------------------------------------------------------
test.describe('Meus dados (meus-dados.html)', () => {
  test('6 finalidades; [Retirar autorização] mostra o efeito do servidor; exportação JSON', async ({ page, request }) => {
    const u = await aluno(request, page);
    const cli = P.api(request, u.token);
    const p = await perfilApi(request, u);
    const put = await cli.put('/api/portal/me/perfil', { nomeSocial: 'Social QA', consentimentos: { nomeSocial: { aceito: true, versaoTexto: p.textosConsentimento.perfil_nome_social.versaoTexto } }, versao: p.versao });
    expect(put.status, JSON.stringify(put.json)).toBe(200);
    const lista = (await cli.get('/api/portal/me/dados/consentimentos')).json.itens;
    const nomeSocial = lista.find((i) => i.finalidade === 'perfil_nome_social');

    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    await page.goto(`${EAD}meus-dados.html`);
    const aut = page.locator('[data-pf-meus-dados="consentimentos"]');
    await expect(aut.locator('li[data-finalidade]')).toHaveCount(6);
    const linha = aut.locator('li[data-finalidade="perfil_nome_social"]');
    await expect(linha).toContainText('Autorizado');
    await linha.getByRole('button', { name: 'Retirar autorização' }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText(nomeSocial.efeitoRevogacao);
    await dialogo.locator('[data-pf-acao="confirmar"]').click();
    await expect(aut.locator('li[data-finalidade="perfil_nome_social"]')).toContainText('Não autorizado');
    expect((await perfilApi(request, u)).perfil.nomeSocial).toBeNull();

    // Resumo gerado da configuração do servidor (nada fixo no HTML).
    await expect(page.getByRole('table', { name: /Dados tratados pela plataforma/ }).locator('tbody tr').first()).toBeVisible();

    const baixar = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Gerar arquivo (JSON)' }).click();
    const d = await baixar;
    expect(d.suggestedFilename()).toMatch(/^meus-dados-\d{8}\.json$/);
    const conteudo = JSON.parse(await (await import('node:fs')).promises.readFile(await d.path(), 'utf8'));
    expect(conteudo.versaoFormato).toBe(1);
    expect(conteudo.perfil).toBeTruthy();
    await fechar(mon);
  });

  test('pedido do titular abre atendimento de privacidade (quando a F6a está montada)', async ({ page, request }) => {
    const u = await aluno(request, page);
    const montada = await P.fatiaMontada(request, u.token, '/api/portal/me/atendimentos');
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    await page.goto(`${EAD}meus-dados.html#pedidos`);
    const sec = page.locator('[data-pf-meus-dados="pedidos"]');
    if (!montada) {
      await expect(sec).toContainText('Pedidos indisponíveis no momento.');
      await fechar(mon);
      return;
    }
    await sec.getByLabel('Tipo de pedido').selectOption('correcao');
    await sec.getByLabel('O que você precisa').fill('Corrigir a grafia do meu nome de registro.');
    await sec.getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(sec.getByText(/Pedido ATD-\d{4}-[A-Z0-9]+ registrado\./)).toBeVisible();
    await expect(sec.locator('.pf-meus-dados-lista-pedidos')).toContainText('Correção');
    await fechar(mon);
  });
});

// ---------------------------------------------------------------------------
// Notificações e busca
// ---------------------------------------------------------------------------
test.describe('Notificações e busca', () => {
  test('notificações: lista agrupada, filtro Não lidas e marcar como lida', async ({ page, request }) => {
    const u = await aluno(request, page);
    const agora = new Date();
    await P.comBanco(request, (db) => db.collection('notificacoes').insertMany([
      { userId: u.id, tipo: 'publicacao.nova', titulo: 'Nova publicação: Aviso de teste', texto: 'Texto da publicação de teste.', link: 'dashboard.html', entidade: null, chave: null, lida: false, lidaEm: null, criadaEm: agora, expiraEm: new Date(agora.getTime() + 864e5 * 30) },
      { userId: u.id, tipo: 'protocolo.respondido', titulo: 'Nova resposta no atendimento ATD-2026-QA0001', texto: 'A equipe respondeu.', link: null, entidade: null, chave: null, lida: true, lidaEm: agora, criadaEm: new Date(agora.getTime() - 864e5 * 10), expiraEm: new Date(agora.getTime() + 864e5 * 30) }
    ]));
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    await page.goto(`${EAD}notificacoes.html`);
    await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Anteriores' })).toBeVisible();
    await page.getByRole('button', { name: /^Não lidas/ }).click();
    await expect(page.locator('.pf-notificacao')).toHaveCount(1);
    await page.getByRole('button', { name: 'Marcar como lida: Nova publicação: Aviso de teste' }).click();
    await expect(page.getByText('Nenhuma notificação não lida.')).toBeVisible();
    const r = await P.api(request, u.token).get('/api/portal/me/notificacoes/resumo');
    expect(r.json.naoLidas).toBe(0);
    await fechar(mon);
  });

  test('notificações: clicar abre o destino e marca como lida; vazio honesto', async ({ page, request }) => {
    const u = await aluno(request, page);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    await page.goto(`${EAD}notificacoes.html`);
    await expect(page.getByText('Nenhuma notificação.')).toBeVisible();
    const agora = new Date();
    await P.comBanco(request, (db) => db.collection('notificacoes').insertOne({ userId: u.id, tipo: 'documento.aprovado', titulo: 'Seu RG foi aprovado', texto: 'Documento revisado pela secretaria.', link: 'meus-dados.html', entidade: null, chave: null, lida: false, lidaEm: null, criadaEm: agora, expiraEm: new Date(agora.getTime() + 864e5 * 30) }));
    await page.reload();
    await page.getByRole('link', { name: /Seu RG foi aprovado/ }).click();
    await expect(page).toHaveURL(/meus-dados\.html/);
    expect((await P.api(request, u.token).get('/api/portal/me/notificacoes/resumo')).json.naoLidas).toBe(0);
    await fechar(mon);
  });

  test('busca: termo na URL, filtro por tipo e vazio honesto (resultado = o que a API devolve)', async ({ page, request }) => {
    const u = await aluno(request, page);
    const curso = await P.semearCurso(request, { titulo: `Curso Buscavel ${P.uid('b').slice(-5)}` });
    await P.liberarCurso(request, u.id, curso.cursoId);
    // Cursos e aulas vêm do provedor da F1a: com ele montado, o curso aparece; sem ele, o vazio é honesto.
    const api = await P.api(request, u.token).get(`/api/portal/busca?q=${encodeURIComponent(curso.titulo)}`);
    expect(api.status).toBe(200);
    const achou = !!(api.json.grupos.cursos && api.json.grupos.cursos.itens.length);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    await page.goto(`${EAD}busca.html?q=${encodeURIComponent(curso.titulo)}`);
    if (achou) {
      await expect(page.getByRole('heading', { name: 'Cursos' })).toBeVisible();
      await expect(page.getByRole('link', { name: curso.titulo })).toBeVisible();
    } else {
      await expect(page.getByText(`Nada encontrado para "${curso.titulo}". Tente outro termo ou mude o filtro.`)).toBeVisible();
    }
    await page.getByRole('group', { name: 'Filtrar resultados por tipo' }).getByRole('button', { name: 'Aulas' }).click();
    await expect(page).toHaveURL(/tipo=aulas/);
    await page.getByLabel('Buscar no portal').fill('zzqx inexistente');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.getByText('Nada encontrado para "zzqx inexistente". Tente outro termo ou mude o filtro.')).toBeVisible();
    await expect(page).toHaveURL(/q=zzqx/);
    await fechar(mon);
  });
});

// ---------------------------------------------------------------------------
// Acesso por link (UX §8.5, D-71)
// ---------------------------------------------------------------------------
test.describe('Acesso por link (acesso-link.html)', () => {
  test('#pedir-link: mesma mensagem com e sem conta; e-mail só para quem tem conta; botão inativo; link entra e o fragmento some antes da chamada', async ({ page, request }) => {
    const u = await P.criarUsuario(request, { papel: 'aluno', rotulo: 'f0p-link' });
    await P.simularCliente(page);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    const inicio = new Date().toISOString();

    await page.goto(`${EAD}acesso-link.html#pedir-link`);
    await expect(page.getByRole('heading', { level: 1, name: 'Receber link de acesso' })).toBeVisible();
    await page.getByLabel('E-mail').fill(u.email);
    await page.getByRole('button', { name: 'Receber link de acesso' }).click();
    const msgConta = await page.locator('.pf-acesso-form__resultado .pf-alerta').textContent();
    await expect(page.getByRole('button', { name: 'Receber link de acesso' })).toBeDisabled();
    expect(page.url()).not.toContain(encodeURIComponent(u.email));
    expect(page.url()).not.toContain(u.email);

    const semConta = `qa-ninguem-${P.uid('n')}@exemplo.invalid`;
    await page.reload();
    await page.getByLabel('E-mail').fill(semConta);
    await page.getByRole('button', { name: 'Receber link de acesso' }).click();
    await expect(page.locator('.pf-acesso-form__resultado .pf-alerta')).toHaveText(msgConta);
    await expect(page.getByText('Não chegou? Confira a caixa de spam ou peça de novo em alguns minutos.')).toBeVisible();

    const email = await emailPara(request, u.email, { desde: inicio });
    expect(email, 'e-mail do link de acesso').toBeTruthy();
    expect(await emailPara(request, semConta, { desde: inicio, tempo: 1500 })).toBeNull();
    const link = linkDoEmail(email);
    expect(link && link.modo).toBe('acesso');

    let urlNaChamada = null;
    await page.route('**/api/auth/link-magico/consumir', async (route) => {
      urlNaChamada = await page.evaluate(() => window.location.href);
      await route.continue();
    });
    await page.goto(`${EAD}acesso-link.html#acesso=${link.token}`);
    await expect(page).toHaveURL(/dashboard\.html/);
    expect(urlNaChamada).toBeTruthy();
    expect(urlNaChamada).not.toContain('#acesso=');
    expect(urlNaChamada).not.toContain(link.token);
    await fechar(mon);
  });

  test('#esqueci → e-mail → #redefinir= cria a senha nova (não loga) → entra com ela', async ({ page, request }) => {
    const u = await P.criarUsuario(request, { papel: 'aluno', rotulo: 'f0p-esq' });
    await P.simularCliente(page);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    const inicio = new Date().toISOString();
    await page.goto(`${EAD}acesso-link.html#esqueci`);
    await expect(page.getByRole('heading', { level: 1, name: 'Criar nova senha' })).toBeVisible();
    // Sem conta e com conta: a mesma mensagem (anti-enumeração, API §6.1).
    await page.getByLabel('E-mail').fill(`qa-ninguem-${P.uid('n')}@exemplo.invalid`);
    await page.getByRole('button', { name: 'Enviar link para criar nova senha' }).click();
    const msgSemConta = await page.locator('.pf-acesso-form__resultado .pf-alerta').textContent();
    await page.reload();
    await page.getByLabel('E-mail').fill(u.email);
    await page.getByRole('button', { name: 'Enviar link para criar nova senha' }).click();
    await expect(page.locator('.pf-acesso-form__resultado .pf-alerta')).toHaveText(msgSemConta);
    const email = await emailPara(request, u.email, { desde: inicio });
    const link = linkDoEmail(email);
    expect(link && link.modo).toBe('redefinir');

    await page.goto(`${EAD}acesso-link.html#redefinir=${link.token}`);
    expect(await page.evaluate(() => window.location.hash)).toBe('');
    const nova = `Redef-${P.uid('r')}`;
    await page.getByLabel(/^Nova senha/).fill(nova);
    await page.getByLabel('Confirmar nova senha').fill(nova);
    await page.getByRole('button', { name: 'Criar nova senha' }).click();
    await expect(page.getByText('Senha alterada. Entre com a nova senha.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir para a entrada' })).toHaveAttribute('href', 'login.html');
    expect(await page.evaluate(() => localStorage.getItem('dmc:token'))).toBeNull();
    expect((await P.api(request).post('/api/auth/signin', { email: u.email, senha: nova })).status).toBe(200);
    await fechar(mon);
  });

  test('Perfil › Alterar e-mail → link #email= no novo endereço → "E-mail alterado"; Enviar link de confirmação → #verificar=', async ({ page, request }) => {
    const u = await aluno(request, page);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    const inicio = new Date().toISOString();
    await page.goto(`${EAD}perfil.html#contato`);
    const sec = page.locator('#contato');

    // Confirmação do e-mail atual (#verificar=).
    await sec.getByRole('button', { name: 'Enviar link de confirmação' }).click();
    const ver = linkDoEmail(await emailPara(request, u.email, { desde: inicio }));
    expect(ver && ver.modo).toBe('verificar');
    await page.goto(`${EAD}acesso-link.html#verificar=${ver.token}`);
    await expect(page.getByText('E-mail confirmado.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir para o portal' })).toBeVisible();

    // Troca de e-mail (#email=): o link vai ao NOVO endereço; depois a pessoa entra com ele.
    await page.goto(`${EAD}perfil.html#contato`);
    const novo = `qa-novo-${P.uid('e')}@exemplo.invalid`;
    await sec.getByRole('button', { name: 'Alterar e-mail' }).click();
    const form = page.locator('#pf-perfil-email-form');
    await form.getByLabel(/^Novo e-mail/).fill(novo);
    await form.getByLabel(/^Senha atual/).fill(u.senha);
    await form.getByRole('button', { name: 'Enviar link de confirmação' }).click();
    await expect(form.locator('.pf-perfil-form__status')).not.toBeEmpty();
    const troca = linkDoEmail(await emailPara(request, novo, { desde: inicio }));
    expect(troca && troca.modo).toBe('email');
    await page.goto(`${EAD}acesso-link.html#email=${troca.token}`);
    await expect(page.getByText('E-mail alterado. Entre de novo com o novo endereço.')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('dmc:token'))).toBeNull();
    expect((await P.api(request).post('/api/auth/signin', { email: novo, senha: u.senha })).status).toBe(200);
    await fechar(mon);
  });

  test('link vencido → [Pedir novo link] → #pedir-link; link de redefinição vencido → #esqueci', async ({ page }) => {
    await P.simularCliente(page);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    P.esperar(page, { status: 410, url: '/api/auth/link-magico/consumir' });
    P.esperar(page, { status: 410, url: '/api/auth/senha/redefinir' });
    await page.goto(`${EAD}acesso-link.html#acesso=token-que-nao-existe-${P.uid('t')}`);
    await expect(page.getByText('Este link expirou ou já foi usado.')).toBeVisible();
    await page.getByRole('button', { name: 'Pedir novo link' }).click();
    await expect(page).toHaveURL(/#pedir-link$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Receber link de acesso' })).toBeVisible();

    await page.goto(`${EAD}acesso-link.html#redefinir=token-que-nao-existe-${P.uid('t')}`);
    const nova = `Venc-${P.uid('v')}`;
    await page.getByLabel(/^Nova senha/).fill(nova);
    await page.getByLabel('Confirmar nova senha').fill(nova);
    await page.getByRole('button', { name: 'Criar nova senha' }).click();
    await expect(page.getByText('Este link expirou ou já foi usado.')).toBeVisible();
    await page.getByRole('button', { name: 'Pedir novo link' }).click();
    await expect(page).toHaveURL(/#esqueci$/);
    await fechar(mon);
  });

  test('recursos() falso e 503 email-indisponivel: formulário some e o texto é honesto', async ({ page }) => {
    await P.simularCliente(page);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    await page.route('**/api/auth/recursos', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ loginPorCpf: true, linkMagico: false, recuperacaoSenha: false, doisFatores: false, senhaTemporariaPelaCoordenacao: true }) }));
    await page.goto(`${EAD}acesso-link.html#esqueci`);
    await expect(page.getByText('O envio de e-mail não está configurado. Peça uma senha temporária à coordenação.')).toBeVisible();
    await expect(page.getByLabel('E-mail')).toHaveCount(0);
    await page.unroute('**/api/auth/recursos');

    P.esperar(page, { status: 503, url: '/api/auth/link-magico' });
    await page.route('**/api/auth/link-magico', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'O envio de e-mail não está configurado.', codigo: 'email-indisponivel' }) }));
    await page.goto(`${EAD}acesso-link.html#pedir-link`);
    await page.reload();
    await page.getByLabel('E-mail').fill('alguem@exemplo.invalid');
    await page.getByRole('button', { name: 'Receber link de acesso' }).click();
    await expect(page.getByText('O envio de e-mail não está configurado. Peça uma senha temporária à coordenação.')).toBeVisible();
    await expect(page.getByLabel('E-mail')).toHaveCount(0);
    await fechar(mon);
  });

  test('com sessão aberta: "Você já está conectado" + [Ir para o portal]', async ({ page, request }) => {
    const u = await aluno(request, page);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    await page.goto(`${EAD}acesso-link.html#pedir-link`);
    await expect(page.getByText(`Você já está conectado como ${u.email}.`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir para o portal' })).toHaveAttribute('href', 'dashboard.html');
    await fechar(mon);
  });
});

// ---------------------------------------------------------------------------
// Qualidade nas páginas da fatia (§8.6 item 3, parcial): sem rolagem horizontal 320–1920
// ---------------------------------------------------------------------------
test.describe('Qualidade das páginas da F0p', () => {
  for (const largura of [320, 390, 1440, 1920]) {
    test(`sem rolagem horizontal a ${largura}px nas 5 páginas`, async ({ page, request }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await aluno(request, page);
      const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
      for (const pagina of ['perfil.html', 'meus-dados.html', 'notificacoes.html', 'busca.html?q=curso']) {
        await page.goto(`${EAD}${pagina}`);
        await page.waitForLoadState('networkidle');
        const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(sobra, `${pagina} a ${largura}px`).toBeLessThanOrEqual(0);
      }
      await page.evaluate(() => localStorage.removeItem('dmc:token'));
      await page.goto(`${EAD}acesso-link.html#pedir-link`);
      await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `acesso-link a ${largura}px`).toBeLessThanOrEqual(0);
      await fechar(mon);
    });
  }
});

// ---------------------------------------------------------------------------
// Verificação em duas etapas (só com PORTAL_2FA=1 no servidor de QA; UX §6.15, §8.5)
// ---------------------------------------------------------------------------
test.describe('Verificação em duas etapas', () => {
  test('ativar no Perfil (chave local + código) e entrar por link com código de recuperação', async ({ page, request }) => {
    test.skip(process.env.PORTAL_2FA !== '1', 'PORTAL_2FA desligado: o bloco não aparece (coberto no caso da troca de senha)');
    const u = await aluno(request, page);
    const mon = P.monitorarConsoleERede(page, { fatia: 'F0p' });
    const temQr = fs.existsSync(path.join(P.EAD_DISCO, 'js', 'portal', 'qr.js'));
    if (!temQr) P.esperar(page, { status: 404, url: '/plataforma-ead/js/portal/qr.js' });
    await page.goto(`${EAD}perfil.html#seguranca`);
    const bloco = page.locator('.pf-perfil-2fa');
    await expect(bloco).toContainText('Desativada');
    await bloco.getByLabel(/^Senha atual/).fill(u.senha);
    await bloco.getByRole('button', { name: 'Ativar' }).click();
    // DMC_UI.codigo põe o valor em .pf-codigo__valor ao lado do [Copiar]; sem o DMC_UI, <code class="pf-codigo">.
    const segredo = (await bloco.locator('.pf-codigo__valor, code.pf-codigo').first().textContent()).trim();
    if (temQr) await expect(bloco.locator('.pf-qr svg')).toBeVisible();
    await bloco.getByLabel(/^Código do aplicativo/).fill(totp(segredo));
    await bloco.getByRole('button', { name: 'Confirmar e ativar' }).click();
    const codigos = bloco.locator('.pf-perfil-2fa__lista-codigos code');
    await expect(codigos).toHaveCount(10);
    const recuperacao = (await codigos.first().textContent()).trim();
    await bloco.getByRole('button', { name: 'Já guardei os códigos' }).click();
    await expect(page.locator('.pf-perfil-2fa')).toContainText('Ativa');

    // Link de acesso com 2FA ativo: o link não dispensa o segundo fator.
    await page.evaluate(() => localStorage.removeItem('dmc:token'));
    const inicio = new Date().toISOString();
    await page.goto(`${EAD}acesso-link.html#pedir-link`);
    await page.getByLabel('E-mail').fill(u.email);
    await page.getByRole('button', { name: 'Receber link de acesso' }).click();
    const link = linkDoEmail(await emailPara(request, u.email, { desde: inicio }));
    await page.goto(`${EAD}acesso-link.html#acesso=${link.token}`);
    await expect(page.getByText('Digite o código do aplicativo autenticador.')).toBeVisible();
    await page.getByLabel(/^Código do aplicativo/).fill(recuperacao);
    await page.getByRole('button', { name: 'Confirmar código' }).click();
    await expect(page).toHaveURL(/dashboard\.html/);
    await fechar(mon);
  });
});

// ---------------------------------------------------------------------------
// Casos G1 que saíram do portal-shell (D-61): DMC_bootLogin (login-classico.html) com CPF
// e desvio do 2FA. Dependem dos acréscimos da F0b em app.js (§7.2/§7.3); sem eles, ficam
// "bloqueado" (pulados com o motivo), nunca verdes por engano.
// ---------------------------------------------------------------------------
test.describe('DMC_bootLogin (login-classico.html) — D-61', () => {
  async function exigirF0b(page) {
    await page.goto(`${EAD}login-classico.html`);
    const pronto = await page.evaluate(() => !!(window.DMC_Auth && typeof window.DMC_Auth.destinoInicial === 'function'));
    if (!pronto) {
      test.info().annotations.push({ type: 'bloqueado', description: 'app.js sem os acréscimos da F0b (DMC_Auth.destinoInicial, CPF e desvio do 2FA no DMC_bootLogin)' });
      test.skip(true, 'bloqueado: aguarda a F0b (app.js §7.3)');
    }
  }

  test('entrada por CPF leva ao destino do papel', async ({ page, request }) => {
    const u = await P.criarUsuario(request, { papel: 'aluno', rotulo: 'f0p-cpf' });
    const cpf = P.cpfValido();
    const p = await perfilApi(request, u);
    const put = await P.api(request, u.token).put('/api/portal/me/perfil', { cpf, versao: p.versao });
    expect(put.status, JSON.stringify(put.json)).toBe(200);
    await P.simularCliente(page);
    await exigirF0b(page);
    await page.locator('#email').fill(`${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`);
    await page.locator('#senha').fill(u.senha);
    await page.locator('#acesso-cta').click();
    await expect(page).toHaveURL(/dashboard\.html/);
  });

  test('conta com 2FA: o login clássico desvia para login.html?next= com o aviso', async ({ page, request }) => {
    test.skip(process.env.PORTAL_2FA !== '1', 'PORTAL_2FA desligado');
    const u = await P.criarUsuario(request, { papel: 'aluno', rotulo: 'f0p-2fa' });
    const cli = P.api(request, u.token);
    const ini = await cli.post('/api/auth/2fa/iniciar', { senha: u.senha });
    expect((await cli.post('/api/auth/2fa/ativar', { codigo: totp(ini.json.segredo) })).status).toBe(200);
    await P.simularCliente(page);
    await exigirF0b(page);
    await page.locator('#email').fill(u.email);
    await page.locator('#senha').fill(u.senha);
    await page.locator('#acesso-cta').click();
    await expect(page).toHaveURL(/login\.html(\?next=.*)?$/);
    expect(await page.evaluate(() => sessionStorage.getItem('dmc:aviso'))).toBe('Esta conta usa verificação em duas etapas. Continue pelo login principal.');
  });
});

// ---------------------------------------------------------------------------
// Acessibilidade (§8.6 item 3): axe 0 serious/critical nos dois temas, 1440 e 390
// ---------------------------------------------------------------------------
test.describe('Acessibilidade das páginas da F0p (axe)', () => {
  for (const tema of ['escuro', 'claro']) {
    for (const largura of [1440, 390]) {
      test(`axe sem serious/critical · tema ${tema} · ${largura}px`, async ({ page, request }) => {
        const { default: AxeBuilder } = await import('@axe-core/playwright');
        await page.setViewportSize({ width: largura, height: 900 });
        const u = await P.criarUsuario(request, { papel: 'aluno', rotulo: 'f0p-axe' });
        await P.simularCliente(page);
        await P.entrarComToken(page, u.token, { 'dmc:tema': tema });
        const graves = [];
        const doShell = [];
        for (const pagina of ['perfil.html', 'meus-dados.html', 'notificacoes.html', 'busca.html?q=curso', 'acesso-link.html#pedir-link']) {
          if (pagina.startsWith('acesso-link')) await page.evaluate(() => localStorage.removeItem('dmc:token'));
          await page.goto(`${EAD}${pagina}`);
          await page.waitForLoadState('networkidle');
          // Conteúdo da fatia (main#conteudo; acesso-link é inteira da F0p). O topo e a lateral são do
          // shell da F0s: o que o axe acusa lá vai para a evidência e para o relatório, sem reprovar aqui.
          const publica = pagina.startsWith('acesso-link');
          const r = await (publica ? new AxeBuilder({ page }) : new AxeBuilder({ page }).include('#conteudo')).analyze();
          for (const v of r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
            graves.push({ pagina, regra: v.id, impacto: v.impact, nos: v.nodes.length, ex: v.nodes.slice(0, 2).map((n) => n.target.join(' ')) });
          }
          if (!publica) {
            const todo = await new AxeBuilder({ page }).exclude('#conteudo').analyze();
            for (const v of todo.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
              doShell.push({ pagina, regra: v.id, impacto: v.impact, ex: v.nodes.slice(0, 2).map((n) => n.target.join(' ')) });
            }
          }
        }
        await test.info().attach('axe.json', { body: JSON.stringify({ graves, doShell }, null, 2), contentType: 'application/json' });
        expect(graves).toEqual([]);
      });
    }
  }
});
