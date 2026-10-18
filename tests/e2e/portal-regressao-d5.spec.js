// =============================================================
// Regressão D5 da plataforma EAD (F0b · ponto S0) — PORTAL-ACADEMICO.md §9.2 e §9.3.
//
// Escrita contra o comportamento ATUAL e verde antes de qualquer edição na EAD.
// Verifica INVARIANTES DE EFEITO — rota, resposta da API e resultado persistido —,
// nunca texto, rótulo ou layout que a UX redesenha. Os únicos seletores de tela são os
// de SELETORES_D5 (_portal.js); dado vindo da semente (título de curso/aula, código do
// certificado, texto de dúvida) pode ser procurado na tela, porque é dado e não rótulo.
// Efeitos cujo caminho de tela a dona é obrigada a trocar (prompt/confirm/alert, a
// confirmação do nome da F3b) são disparados PELA API com a sessão do papel semeado e
// conferidos na API (D-76). Vídeo só Vimeo (stub por page.route) e MP4 de mesma origem
// (D-77). Mudar asserção ou seletor = pedido escrito à F0b via principal (D-45).
//
// Marcas por caso (coluna "Roda na fase 1"): com QA_FATIA=<fatia> só os casos com a
// marca dela são registrados; "@integracao" = só na integração de cada G1 e no G2.
// R13 completo = tests/e2e/parcerias.spec.js (principal); R14 = specs do site
// (principal): rodam junto na integração, fora deste arquivo.
//
// Comandos (portas da F0b na fase 0: 4635 manual / 4649 Playwright, §9.1):
//   QA_PORT=4649 QA_DATA=<data>-f0b npx playwright test tests/e2e/portal-regressao-d5.spec.js
//   QA_PORT=4649 QA_CAPTURAS=antes npx playwright test tests/e2e/portal-regressao-d5.spec.js -g "linha de base"
//     → docs/dmc/qa/portal/antes/ (fora do git, T4)
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import * as P from './_portal.js';

const QA_FATIA = process.env.QA_FATIA || null;
const EAD = P.BASE_EAD;
const caminhoDe = (resp) => new URL(resp.url()).pathname;
const urlFinal = (nome) => new RegExp(`${EAD.replace(/\//g, '\\/')}${nome.replace('.', '\\.')}(\\?.*)?$`);

/** Registra o caso só se a fatia em QA_FATIA estiver entre as marcas (D-62). */
function caso(id, marcas, titulo, fn) {
  if (QA_FATIA && !marcas.includes(QA_FATIA)) return;
  test(`${id} · ${titulo}`, { tag: marcas.map((m) => `@${m}`), annotation: [{ type: 'd5', description: id }] }, fn);
}

/**
 * Fecha o caso: anexa console/rede como evidência (D-73) e reprova exceção na página e
 * resposta 4xx/5xx inesperada (fora das tolerâncias da fase e do que o caso declarou com
 * esperar). Mensagens de console ficam só na evidência: dependem da rede externa (fontes).
 */
async function fechar(mon) {
  await mon.anexar('console-e-rede');
  await mon.verificar({ tipos: ['pageerror', 'resposta'], rotulo: 'pageerror e respostas' });
}

/** Catálogo como o admin (ou o aluno) o recebe da API, com atalhos. */
async function catalogo(cliente) {
  const r = await cliente.get('/api/catalogo');
  expect(r.status, 'GET /api/catalogo').toBe(200);
  const cursos = r.json.cursos || [];
  const curso = (id) => cursos.find((c) => c.id === id) || null;
  const aula = (id) => { for (const c of cursos) for (const m of c.modulos || []) for (const a of m.aulas || []) if (a.id === id) return a; return null; };
  return { cursos, curso, aula };
}

/** Clica no curso: link com [data-curso-id] (ou link dentro dele) ou o próprio cartão (R4). */
async function abrirCurso(page, cursoId) {
  const el = page.locator(`[data-curso-id="${cursoId}"]`).first();
  await expect(el).toBeAttached();
  const tag = await el.evaluate((e) => e.tagName);
  if (tag === 'A') return el.click();
  const link = el.locator('a[href]').first();
  if (await link.count()) return link.click();
  return el.click();
}

/** Abre a sanfona que contém a aula (sem depender de rótulo) — nota de R4 em SELETORES_D5. */
async function abrirSanfonaDa(page, aula) {
  const achou = await aula.evaluate((el) => {
    const raiz = document.querySelector('#modules-list');
    const foraDeAula = (c) => !c.closest('[data-aula-id]') && !el.contains(c);
    for (let a = el.parentElement; a && raiz && raiz.contains(a); a = a.parentElement) {
      const cands = [...a.querySelectorAll('button[aria-expanded="false"], button, summary')].filter(foraDeAula);
      if (cands.length) { cands[0].setAttribute('data-qa-sanfona', '1'); return true; }
    }
    return false;
  });
  expect(achou, 'controle de expansão da aula na trilha').toBe(true);
  await page.locator('[data-qa-sanfona="1"]').first().click();
}

async function marcarAulaNaTrilha(page, aulaId) {
  const aula = page.locator(`#modules-list [data-aula-id="${aulaId}"]`).first();
  await expect(aula).toBeAttached();
  if (!(await aula.isVisible())) await abrirSanfonaDa(page, aula);
  await expect(aula).toBeVisible();
  const controle = aula.locator('button, input[type="checkbox"], [role="checkbox"], [role="switch"]').first();
  const resp = page.waitForResponse((r) => r.request().method() === 'PUT' && caminhoDe(r) === `/api/progresso/${aulaId}`);
  await controle.click();
  return resp;
}

test.describe.configure({ mode: 'parallel' });

// =============================================================
// R1 · R2 · R3 — entrada (F0b, 2d)
// =============================================================
caso('R1', ['integracao'], 'index.html: sem token → login.html; token de aluno → dashboard.html', async ({ page, request }) => {
  await P.exigirMongo(request);
  const mon = P.monitorarConsoleERede(page);
  await page.goto(`${EAD}index.html`);
  await expect(page).toHaveURL(urlFinal('login.html'));
  const aluno = await P.criarUsuario(request);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}index.html`);
  await expect(page).toHaveURL(urlFinal('dashboard.html'));
  await fechar(mon);
});

caso('R2', ['integracao'], 'sessão expirada em página interna: 401 apaga dmc:token e a página termina em login.html', async ({ page, request }) => {
  await P.exigirMongo(request);
  const mon = P.monitorarConsoleERede(page);
  P.esperar(page, { status: 401, url: '/api/auth/me' });
  await P.entrarComToken(page, 'eyJhbGciOiJIUzI1NiJ9.expirado.qa');
  const me = page.waitForResponse((r) => caminhoDe(r) === '/api/auth/me');
  await page.goto(`${EAD}dashboard.html`);
  expect((await me).status()).toBe(401);
  await expect(page).toHaveURL(urlFinal('login.html'));
  expect(await page.evaluate(() => localStorage.getItem('dmc:token'))).toBeNull();
  await fechar(mon);
});

caso('R3', ['F0t'], 'login da 2d: conta de aluno em login.html → DMC_Auth.signIn → dashboard.html', async ({ page, request }) => {
  const aluno = await P.criarUsuario(request);
  const mon = P.monitorarConsoleERede(page);
  await P.simularCliente(page);
  await page.goto(`${EAD}login.html`);
  // Campos por nome acessível, dentro do formulário que tem o campo de senha (§9.3, dono 2d).
  const form = page.locator('form').filter({ has: page.getByLabel('Senha', { exact: true }) });
  await expect(form).toHaveCount(1);
  await form.getByLabel('E-mail', { exact: true }).fill(aluno.email);
  const senha = form.getByLabel('Senha', { exact: true });
  await senha.fill(aluno.senha);
  const signin = page.waitForResponse((r) => caminhoDe(r) === '/api/auth/signin' && r.request().method() === 'POST');
  await senha.press('Enter');
  expect((await signin).status()).toBe(200);
  await expect(page).toHaveURL(urlFinal('dashboard.html'));
  expect(await page.evaluate(() => localStorage.getItem('dmc:token'))).toBeTruthy();
  await fechar(mon);
});

// =============================================================
// R4 · R5 · R6 · R7 — estudos (F1b, F1a)
// =============================================================
caso('R4', ['F1b', 'F1a'], 'início e catálogo: sem acesso → loja.html?destacar; liberado → trilha; marcar aula grava progresso; escolha persiste', async ({ page, request }) => {
  const aluno = await P.criarUsuario(request);
  const L = await P.semearCurso(request, { aulas: [{}, {}, { disponivel: false }] });
  const S = await P.semearCurso(request);
  await P.liberarCurso(request, aluno.id, L.cursoId);
  const U = P.api(request, aluno.token);
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token, { 'dmc:cursoEscolhido': null });

  // Curso sem acesso → loja.html?destacar=<id>
  await page.goto(`${EAD}dashboard.html`);
  const doS = page.locator(`[data-curso-id="${S.cursoId}"]`).first();
  await expect(doS).toBeAttached();
  const linkS = page.locator(`[data-curso-id="${S.cursoId}"] a[href*="destacar="], a[data-curso-id="${S.cursoId}"]`).first();
  if (await linkS.count()) expect(await linkS.getAttribute('href')).toContain(`loja.html?destacar=${S.cursoId}`);
  await abrirCurso(page, S.cursoId);
  await expect(page).toHaveURL(new RegExp(`${EAD}loja\\.html\\?destacar=${S.cursoId}(&.*)?$`));

  // Curso liberado → trilha renderizada; a escolha vai para dmc:cursoEscolhido
  await page.goto(`${EAD}dashboard.html`);
  await abrirCurso(page, L.cursoId);
  await expect(page.locator(`#modules-list [data-aula-id="${L.aulas[0].id}"]`).first()).toBeAttached();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dmc:cursoEscolhido'))).toBe(L.cursoId);

  // Marcar aula → PUT /api/progresso/:aulaId 2xx e a aula aparece em GET /api/progresso
  const put = await marcarAulaNaTrilha(page, L.aulas[0].id);
  expect(put.ok(), `PUT /api/progresso → ${put.status()}`).toBe(true);
  const prog = await U.get('/api/progresso');
  expect(prog.status).toBe(200);
  expect(prog.json.itens.map((i) => i.aulaId)).toContain(L.aulas[0].id);

  // A escolha persiste: sem query, o painel volta com a trilha do curso escolhido
  await page.goto(`${EAD}dashboard.html`);
  await expect(page.locator(`#modules-list [data-aula-id="${L.aulas[1].id}"]`).first()).toBeAttached();
  expect(await page.evaluate(() => localStorage.getItem('dmc:cursoEscolhido'))).toBe(L.cursoId);
  await fechar(mon);
});

caso('R5', ['F1b', 'F1a'], 'player legado: aula.html?id abre a aula; Vimeo e MP4 de mesma origem; "em breve" sem vídeo; concluir grava progresso', async ({ page, request }) => {
  const aluno = await P.criarUsuario(request);
  const mp4 = P.urlMp4();
  const C = await P.semearCurso(request, { aulas: [{ videoUrl: P.URL_VIMEO }, { videoUrl: mp4 }, { videoUrl: P.URL_VIMEO, disponivel: false }] });
  const [vimeo, video, emBreve] = C.aulas;
  await P.liberarCurso(request, aluno.id, C.cursoId);
  const U = P.api(request, aluno.token);
  const mon = P.monitorarConsoleERede(page);
  await P.rotearVimeo(page);
  await P.rotearMp4(page);
  await P.entrarComToken(page, aluno.token);

  // Vimeo: iframe com src começando por https://player.vimeo.com/video/<id>
  await page.goto(`${EAD}aula.html?id=${encodeURIComponent(vimeo.id)}`);
  await expect(page.locator('#player-root')).toContainText(vimeo.titulo);
  const iframe = page.locator('#player-stage iframe').first();
  await expect(iframe).toBeAttached();
  expect(await iframe.getAttribute('src')).toMatch(new RegExp(`^${P.URL_VIMEO.replace(/[.]/g, '\\.')}`));

  // Concluir pelo #btn-done → PUT /api/progresso/:aulaId e GET /api/progresso
  const put = page.waitForResponse((r) => r.request().method() === 'PUT' && caminhoDe(r) === `/api/progresso/${vimeo.id}`);
  await page.locator('#btn-done').click();
  expect((await put).ok()).toBe(true);
  expect((await U.get('/api/progresso')).json.itens.map((i) => i.aulaId)).toContain(vimeo.id);

  // MP4 de mesma origem: <video> (ou <source>) com o src da semente
  await page.goto(`${EAD}aula.html?id=${encodeURIComponent(video.id)}`);
  await expect(page.locator('#player-root')).toContainText(video.titulo);
  const el = page.locator('#player-stage video').first();
  await expect(el).toBeAttached();
  const srcs = await el.evaluate((v) => [v.currentSrc, v.src, ...[...v.querySelectorAll('source')].map((s) => s.src)].filter(Boolean));
  const esperado = new URL(mp4, page.url()).href;
  expect(srcs, `src do <video>: ${srcs.join(', ')}`).toContain(esperado);

  // "Em breve" por link direto: nenhum vídeo na página e a API não entrega o link
  await page.goto(`${EAD}aula.html?id=${encodeURIComponent(emBreve.id)}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#player-stage iframe, #player-stage video, iframe, video')).toHaveCount(0);
  const cat = await catalogo(U);
  expect(cat.aula(emBreve.id).videoUrl).toBe('');
  await fechar(mon);
});

caso('R6', ['F1b', 'F8'], 'dúvidas da aula: pergunta 201, 2ª em < 15 s → 429, resposta da coordenação chega ao aluno, autor apaga pela API', async ({ page, request }) => {
  const [aluno, admin] = await Promise.all([P.criarUsuario(request), P.criarUsuario(request, { papel: 'admin' })]);
  const C = await P.semearCurso(request, { aulas: [{}] });
  const aulaId = C.aulas[0].id;
  await P.liberarCurso(request, aluno.id, C.cursoId);
  const U = P.api(request, aluno.token);
  const A = P.api(request, admin.token);
  const mon = P.monitorarConsoleERede(page);
  P.esperar(page, { status: 429, url: `/api/aulas/${aulaId}/duvidas` });
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}aula.html?id=${encodeURIComponent(aulaId)}`);

  const form = page.locator('#player-duvidas [data-duvida-form]').first();
  await expect(form).toBeVisible();
  const pergunta = `Dúvida de teste ${crypto.randomBytes(3).toString('hex')}`;
  const caminhoDuvidas = `/api/aulas/${aulaId}/duvidas`;
  const post1 = page.waitForResponse((r) => r.request().method() === 'POST' && caminhoDe(r) === caminhoDuvidas);
  await form.getByRole('textbox').fill(pergunta);
  await form.locator('[type="submit"]').click();
  const r1 = await post1;
  expect(r1.status()).toBe(201);
  const duvidaId = (await r1.json()).duvida.id;

  // 2ª pergunta em menos de 15 s → 429 (conferido na rede; o aviso na tela não é asserção)
  const post2 = page.waitForResponse((r) => r.request().method() === 'POST' && caminhoDe(r) === caminhoDuvidas);
  await form.getByRole('textbox').fill(`${pergunta} (2)`);
  await form.locator('[type="submit"]').click();
  expect((await post2).status()).toBe(429);

  // Resposta da coordenação pela rota legada aparece ao aluno (API e tela)
  const resposta = `Resposta de teste ${crypto.randomBytes(3).toString('hex')}`;
  const rr = await A.post(`/api/duvidas/${duvidaId}/respostas`, { texto: resposta });
  expect(rr.status).toBe(201);
  const lista = await U.get(caminhoDuvidas);
  expect(lista.status).toBe(200);
  const minha = lista.json.itens.find((d) => d.id === duvidaId);
  expect(minha.respostas.map((r) => r.texto)).toContain(resposta);
  await page.reload();
  await expect(page.locator('#player-duvidas')).toContainText(resposta);

  // O autor apaga a própria dúvida PELA API (hoje a tela usa confirm, D-76)
  const del = await U.del(`/api/duvidas/${duvidaId}`);
  expect(del.status).toBe(200);
  expect((await U.get(caminhoDuvidas)).json.itens.map((d) => d.id)).not.toContain(duvidaId);
  await fechar(mon);
});

caso('R7', ['F1b', 'F1a'], 'meus cursos: lista só os cursos com acesso', async ({ page, request }) => {
  const aluno = await P.criarUsuario(request);
  const [L, S] = await Promise.all([P.semearCurso(request), P.semearCurso(request)]);
  await P.liberarCurso(request, aluno.id, L.cursoId);
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}meus-cursos.html`);
  const lista = page.locator('#meus-cursos-lista');
  await expect(lista).toContainText(L.titulo);
  await expect(lista).not.toContainText(S.titulo);
  await fechar(mon);
});

// =============================================================
// R8 — aulas ao vivo (F3a)
// =============================================================
caso('R8', ['F3a'], 'aulas ao vivo: só cursos com acesso; situação pelo relógio; link da sala só na janela (página e API)', async ({ page, request }) => {
  const aluno = await P.criarUsuario(request);
  const [L, S] = await Promise.all([P.semearCurso(request), P.semearCurso(request)]);
  await P.liberarCurso(request, aluno.id, L.cursoId);
  const [lv, ls] = await Promise.all([P.semearLives(request, L.cursoId), P.semearLives(request, S.cursoId)]);
  const U = P.api(request, aluno.token);

  const r = await U.get('/api/lives');
  expect(r.status).toBe(200);
  const porId = new Map(r.json.itens.map((i) => [i.id, i]));
  for (const l of Object.values(ls)) expect(porId.has(l.id), `encontro de curso sem acesso ${l.id}`).toBe(false);
  expect(porId.get(lv.agendada.id)).toMatchObject({ status: 'agendada', url: '' });
  expect(porId.get(lv.aoVivo.id)).toMatchObject({ status: 'ao-vivo', url: lv.aoVivo.url });
  expect(porId.get(lv.encerrada.id)).toMatchObject({ status: 'encerrada', url: '' });

  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}ao-vivo.html`);
  const lista = page.locator('#lives-lista');
  for (const l of Object.values(lv)) await expect(lista).toContainText(l.titulo);
  for (const l of Object.values(ls)) await expect(lista).not.toContainText(l.titulo);
  await expect(page.locator(`a[href="${lv.aoVivo.url}"]`)).not.toHaveCount(0);
  for (const l of [lv.agendada, lv.encerrada, ...Object.values(ls)]) await expect(page.locator(`a[href="${l.url}"]`)).toHaveCount(0);
  await fechar(mon);
});

// =============================================================
// R9 · R9b — certificados (F3b)
// =============================================================
caso('R9', ['F3b', 'F1a'], 'certificados: aluno identificado com 100% emite pela tela → DMC-…; certificado.html valida sem login e a impressão mostra o código', async ({ page, request, browser, baseURL }) => {
  const s = await P.semearR9(request);
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, s.aluno.token);
  await page.goto(`${EAD}certificados.html`);
  const lista = page.locator('#certificados-lista');
  const botao = lista.locator('button:enabled').first();
  await expect(botao).toBeVisible();
  const emitir = page.waitForResponse((r) => r.request().method() === 'POST' && caminhoDe(r) === `/api/cursos/${s.curso.cursoId}/certificado`);
  await botao.click();
  const resp = await emitir;
  expect([200, 201]).toContain(resp.status());
  const codigo = (await resp.json()).certificado.codigo;
  expect(codigo).toMatch(/^DMC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  await expect(lista).toContainText(codigo);

  // Validação pública sem login (API e página) e impressão
  const anon = P.api(request);
  const v = await anon.get(`/api/certificados/validar/${encodeURIComponent(codigo)}`);
  expect(v.status).toBe(200);
  expect(v.json).toMatchObject({ valido: true, certificado: { codigo, nomeAluno: s.perfil.nomeRegistro, tituloCurso: s.curso.titulo } });
  const ctx = await browser.newContext({ baseURL });
  try {
    const pub = await ctx.newPage();
    await pub.goto(`${EAD}certificado.html?codigo=${encodeURIComponent(codigo)}`);
    await expect(pub.getByText(codigo).first()).toBeVisible();
    expect(await pub.evaluate(() => localStorage.getItem('dmc:token'))).toBeNull();
    await pub.emulateMedia({ media: 'print' });
    await expect(pub.getByText(codigo).first()).toBeVisible();
  } finally {
    await ctx.close();
  }
  await fechar(mon);
});

caso('R9b', ['F3b'], 'certificado sem perfil: emite pela API com o nome da conta; validação legada no formato de hoje', async ({ page, request }) => {
  const s = await P.semearR9b(request);
  const U = P.api(request, s.aluno.token);
  const r = await U.post(`/api/cursos/${s.curso.cursoId}/certificado`, {});
  expect([200, 201]).toContain(r.status);
  const codigo = r.json.certificado.codigo;
  expect(codigo).toMatch(/^DMC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  const v = await P.api(request).get(`/api/certificados/validar/${encodeURIComponent(codigo)}`);
  expect(v.status).toBe(200);
  expect(v.json.valido).toBe(true);
  expect(v.json.certificado).toMatchObject({ codigo, nomeAluno: s.aluno.nome, tituloCurso: s.curso.titulo, cargaHoraria: s.curso.cargaHoraria });
  expect(typeof v.json.certificado.emitidoEm).toBe('string');
  expect(Number.isFinite(Date.parse(v.json.certificado.emitidoEm))).toBe(true);

  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, s.aluno.token);
  await page.goto(`${EAD}certificados.html`);
  await expect(page.locator('#certificados-lista')).toContainText(codigo);
  await fechar(mon);
});

// =============================================================
// R10 — loja → obrigado (F0r, F4a, F5)
// =============================================================
caso('R10', ['F0r', 'F4a', 'F5'], 'loja → obrigado: carrinho atualiza total e contador; finalizar termina em obrigado.html com carrinho vazio; simulação sem a flag → 404', async ({ page, request }) => {
  const aluno = await P.criarUsuario(request);
  const [C1, C2] = await Promise.all([P.semearCurso(request, { preco: 1234.5 }), P.semearCurso(request, { preco: 310 })]);
  const U = P.api(request, aluno.token);
  const f5 = await P.fatiaMontada(request, aluno.token, '/api/portal/me/financeiro');
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token, { 'dmc:carrinho': '[]' });
  await page.goto(`${EAD}loja.html`);

  const carrinho = () => page.evaluate(() => JSON.parse(localStorage.getItem('dmc:carrinho') || '[]'));
  const contador = page.locator('[data-cart-count]').first();
  const reais = (v) => v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const textoDrawer = async () => (await page.locator('#cart-drawer').textContent()).replace(/\s+/g, ' ');

  for (const [i, C] of [C1, C2].entries()) {
    await page.locator(`[data-curso-id="${C.cursoId}"]`).first().getByRole('button').first().click();
    await expect.poll(carrinho).toEqual([C1, C2].slice(0, i + 1).map((c) => c.cursoId));
    await expect(contador).toHaveText(String(i + 1));
  }
  // Abre o carrinho pelo controle que contém o contador; total = soma dos preços da semente
  await contador.click();
  await expect(page.locator('#cart-drawer')).toBeVisible();
  await expect(page.locator('#cart-list')).toContainText(C1.titulo);
  await expect(page.locator('#cart-list')).toContainText(C2.titulo);
  await expect.poll(textoDrawer).toContain(reais(C1.preco + C2.preco));

  // Remover pelo item do carrinho
  const itemC2 = page.locator('#cart-list *', { hasText: C2.titulo }).filter({ has: page.getByRole('button') }).last();
  await itemC2.getByRole('button').first().click();
  await expect.poll(carrinho).toEqual([C1.cursoId]);
  await expect(contador).toHaveText('1');
  await expect.poll(textoDrawer).toContain(reais(C1.preco));
  await expect(page.locator('#cart-list')).not.toContainText(C2.titulo);

  // Finalizar
  await page.locator('#cart-checkout [type="submit"]').first().click();
  await expect(page).toHaveURL(urlFinal('obrigado.html'));
  await expect.poll(carrinho).toEqual([]);
  if (f5) {
    // D-79: com a F5 montada, o pedido vira protocolo ATD com os cursoIds do carrinho
    const protocolo = new URL(page.url()).searchParams.get('protocolo');
    expect(protocolo).toMatch(/^ATD-/);
    const at = await U.get(`/api/portal/me/atendimentos/${encodeURIComponent(protocolo)}`);
    expect(at.status).toBe(200);
    const pedido = at.json.pedido || (at.json.atendimento && at.json.atendimento.pedido) || at.json.protocolo?.pedido;
    expect(pedido && pedido.cursoIds).toEqual([C1.cursoId]);
  }

  // Sem DEV_SIMULAR_PAGAMENTO (serve.mjs: false) a simulação não existe e nada é liberado
  const sim = await U.post('/api/liberacoes/dev/simular-pagamento', { cursoIds: [C1.cursoId] });
  expect(sim.status).toBe(404);
  const libs = await U.get('/api/liberacoes/me');
  expect(libs.status).toBe(200);
  expect(libs.json.cursoIds).not.toContain(C1.cursoId);
  await fechar(mon);
});

// =============================================================
// R11 — editor de cursos (F8, F1a)
// =============================================================
caso('R11', ['F8', 'F1a'], 'admin cursos: criar, editar no blur, capa, módulos (criar/editar/setas/arrastar), aula (criar/editar/No ar–Em breve/roteiro), PDF, exportar JSON; exclusões pela API', async ({ page, request }) => {
  test.setTimeout(240_000);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  const A = P.api(request, admin.token);
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, admin.token);
  await page.goto(`${EAD}admin.html`);
  const putEm = (re) => page.waitForResponse((r) => r.request().method() === 'PUT' && re.test(caminhoDe(r)));
  const ultimo = (r) => decodeURIComponent(caminhoDe(r).split('/').pop());

  // Criar curso
  await expect(page.locator('#btn-add-curso')).toBeVisible();
  const rCurso = putEm(/^\/api\/cursos\/[^/]+$/);
  await page.locator('#btn-add-curso').click();
  const putCurso = await rCurso;
  expect(putCurso.ok()).toBe(true);
  const cursoId = ultimo(putCurso);
  expect((await catalogo(A)).curso(cursoId)).toBeTruthy();
  await page.locator(`[data-curso-id="${cursoId}"]`).first().click();

  // Editar no blur
  const titulo = `Curso editado ${crypto.randomBytes(3).toString('hex')}`;
  const campoTitulo = page.locator('[data-curso-field="titulo"]').first();
  await campoTitulo.fill(titulo);
  const rTit = putEm(new RegExp(`^/api/cursos/${cursoId}$`));
  await campoTitulo.blur();
  expect((await rTit).ok()).toBe(true);
  expect((await catalogo(A)).curso(cursoId).titulo).toBe(titulo);

  // Enviar capa
  const rCapa = page.waitForResponse((r) => r.request().method() === 'POST' && caminhoDe(r) === `/api/cursos/${cursoId}/capa`);
  await page.locator('[data-capa-file]').first().setInputFiles({ name: 'capa-qa.png', mimeType: 'image/png', buffer: P.PNG_1PX });
  expect((await rCapa).ok()).toBe(true);
  const capaUrl = (await catalogo(A)).curso(cursoId).capaUrl;
  expect(capaUrl).toMatch(/^\/api\/capas\//);
  const img = await A.bruto('GET', capaUrl);
  expect(img.status()).toBe(200);
  expect(img.headers()['content-type']).toMatch(/^image\/png/);

  // Módulos: criar três
  async function criarModulo() {
    const r = putEm(/^\/api\/modulos\/(?!ordem$)[^/]+$/);
    await page.locator('#btn-add-modulo').click();
    const put = await r;
    expect(put.ok()).toBe(true);
    const id = ultimo(put);
    await expect(page.locator(`[data-modulo-field="titulo"][data-modulo-id="${id}"]`)).toBeAttached();
    return id;
  }
  const m1 = await criarModulo();
  const m2 = await criarModulo();
  const m3 = await criarModulo();
  const ordemNaApi = async () => (await catalogo(A)).curso(cursoId).modulos.map((m) => m.id);
  expect(await ordemNaApi()).toEqual([m1, m2, m3]);

  // Editar módulo no blur
  const tituloM1 = `Módulo editado ${crypto.randomBytes(3).toString('hex')}`;
  const campoM1 = page.locator(`[data-modulo-field="titulo"][data-modulo-id="${m1}"]`);
  await campoM1.fill(tituloM1);
  const rM1 = putEm(new RegExp(`^/api/modulos/${m1}$`));
  await campoM1.blur();
  expect((await rM1).ok()).toBe(true);
  expect((await catalogo(A)).curso(cursoId).modulos.find((m) => m.id === m1).titulo).toBe(tituloM1);

  // Reordenar pelas setas: m1 desce → [m2, m1, m3]
  const rSeta = putEm(/^\/api\/modulos\/ordem$/);
  await page.locator(`[data-modulo-down="${m1}"]`).click();
  expect((await rSeta).ok()).toBe(true);
  await expect.poll(ordemNaApi).toEqual([m2, m1, m3]);

  // Reordenar arrastando: m3 solto no topo do módulo m2 → [m3, m2, m1]
  const destino = page.locator(`[data-arrasta="${m2}"]`).locator('xpath=ancestor::*[@data-modulo-id][1]');
  const rArr = putEm(/^\/api\/modulos\/ordem$/);
  await page.locator(`[data-arrasta="${m3}"]`).dragTo(destino, { targetPosition: { x: 24, y: 3 } });
  expect((await rArr).ok()).toBe(true);
  await expect.poll(ordemNaApi).toEqual([m3, m2, m1]);

  // Recarrega e reabre o curso (o redesenho após reordenar duplica ouvintes — defeito
  // mapeado da F8 em admin.js; a D5 não depende dele)
  await page.reload();
  await page.locator(`[data-curso-id="${cursoId}"]`).first().click();
  await expect(page.locator(`[data-modulo-field="titulo"][data-modulo-id="${m1}"]`)).toHaveValue(tituloM1);

  // Aula: criar em m1
  await page.locator(`[data-modulo-toggle="${m1}"]`).click();
  const rAula = putEm(/^\/api\/aulas\/[^/]+$/);
  await page.locator(`[data-aula-add="${m1}"]`).click();
  const putAula = await rAula;
  expect(putAula.ok()).toBe(true);
  const aulaId = ultimo(putAula);
  const campoAula = (f) => page.locator(`[data-aula-field="${f}"][data-aula-id="${aulaId}"]`);
  await expect(campoAula('titulo')).toBeVisible();
  expect((await catalogo(A)).aula(aulaId)).toMatchObject({ moduloId: m1 });

  // Aula: editar título e vídeo no blur
  const tituloAula = `Aula editada ${crypto.randomBytes(3).toString('hex')}`;
  for (const [f, v] of [['titulo', tituloAula], ['videoUrl', P.URL_VIMEO]]) {
    await campoAula(f).fill(v);
    const r = putEm(new RegExp(`^/api/aulas/${aulaId}$`));
    await campoAula(f).blur();
    expect((await r).ok()).toBe(true);
  }
  expect((await catalogo(A)).aula(aulaId)).toMatchObject({ titulo: tituloAula, videoUrl: P.URL_VIMEO, disponivel: true });

  // No ar → Em breve → No ar
  const chave = page.locator(`[data-aula-toggle="${aulaId}"]`);
  for (const esperado of [false, true]) {
    await expect(chave).toBeEnabled();
    const r = putEm(new RegExp(`^/api/aulas/${aulaId}$`));
    await chave.click();
    expect((await r).ok()).toBe(true);
    await expect.poll(async () => (await catalogo(A)).aula(aulaId).disponivel).toBe(esperado);
  }

  // Roteiro de gravação
  const roteiro = `Roteiro de teste ${crypto.randomBytes(4).toString('hex')}`;
  const wrapRot = page.locator(`[data-roteiro-wrap="${aulaId}"]`);
  await wrapRot.locator('[data-roteiro-toggle]').click();
  const txt = wrapRot.locator('[data-roteiro-txt]');
  await txt.fill(roteiro);
  const rRot = putEm(new RegExp(`^/api/aulas/${aulaId}$`));
  await txt.blur();
  expect((await rRot).ok()).toBe(true);
  expect((await catalogo(A)).aula(aulaId).roteiro).toBe(roteiro);

  // Material PDF
  const rPdf = page.waitForResponse((r) => r.request().method() === 'POST' && caminhoDe(r) === `/api/aulas/${aulaId}/materiais`);
  await page.locator(`[data-mat-wrap="${aulaId}"] [data-mat-file]`).setInputFiles({ name: 'material-qa.pdf', mimeType: 'application/pdf', buffer: P.PDF_MINIMO });
  const respPdf = await rPdf;
  expect(respPdf.ok()).toBe(true);
  const matPdf = (await respPdf.json()).material;
  expect((await catalogo(A)).aula(aulaId).materiais).toEqual(expect.arrayContaining([expect.objectContaining({ id: matPdf.id, tipo: 'arquivo' })]));
  const baixa = await A.bruto('GET', `/api/materiais/${aulaId}/${matPdf.id}`);
  expect(baixa.status()).toBe(200);
  expect(baixa.headers()['content-type']).toMatch(/^application\/pdf/);

  // Exportar JSON (o curso está no instantâneo)
  await page.locator('#btn-export').click();
  const exportado = JSON.parse(await page.locator('#export-json').inputValue());
  expect(exportado.cursos.map((c) => c.id)).toContain(cursoId);

  // ---- Pela API (D-76): material-link, exclusões e remoção da capa
  const link = await A.post(`/api/aulas/${aulaId}/materiais/link`, { nome: 'Material externo QA', url: 'https://exemplo.invalid/material-qa.pdf' });
  expect(link.status).toBe(200);
  expect(link.json.material).toMatchObject({ tipo: 'link', url: 'https://exemplo.invalid/material-qa.pdf' });
  expect((await catalogo(A)).aula(aulaId).materiais.map((m) => m.id)).toEqual(expect.arrayContaining([matPdf.id, link.json.material.id]));
  for (const id of [matPdf.id, link.json.material.id]) {
    expect((await A.del(`/api/aulas/${aulaId}/materiais/${id}`)).status).toBe(200);
  }
  expect((await catalogo(A)).aula(aulaId).materiais).toEqual([]);
  expect((await A.bruto('GET', `/api/materiais/${aulaId}/${matPdf.id}`)).status()).toBe(404);

  expect((await A.del(`/api/cursos/${cursoId}/capa`)).status).toBe(200);
  expect((await catalogo(A)).curso(cursoId).capaUrl).toBe('');
  expect((await A.bruto('GET', capaUrl)).status()).toBe(404);

  expect((await A.del(`/api/aulas/${aulaId}`)).status).toBe(200);
  expect((await catalogo(A)).aula(aulaId)).toBeNull();
  expect((await A.del(`/api/modulos/${m3}`)).status).toBe(200);
  expect(await ordemNaApi()).toEqual([m2, m1]);
  expect((await A.del(`/api/cursos/${cursoId}`)).status).toBe(200);
  expect((await catalogo(A)).curso(cursoId)).toBeNull();
  await fechar(mon);
});

// =============================================================
// R12 — liberações e encontros pela API legada (F4a, F3a)
// =============================================================
caso('R12', ['F4a', 'F3a'], 'liberações e encontros legados: conceder/revogar por e-mail e criar/editar/remover encontro respondem como hoje e o efeito chega ao aluno', async ({ request }) => {
  const [aluno, admin] = await Promise.all([P.criarUsuario(request), P.criarUsuario(request, { papel: 'admin' })]);
  const C = await P.semearCurso(request);
  const A = P.api(request, admin.token);
  const U = P.api(request, aluno.token);

  // Autorização como hoje
  expect((await U.post('/api/liberacoes', { email: aluno.email, cursoIds: [C.cursoId] })).status).toBe(403);
  expect((await P.api(request).get('/api/liberacoes/me')).status).toBe(401);
  expect((await A.post('/api/liberacoes', { email: `ninguem-${crypto.randomBytes(3).toString('hex')}@exemplo.invalid`, cursoIds: [C.cursoId] })).status).toBe(404);

  // Conceder
  const lib = await A.post('/api/liberacoes', { email: aluno.email, cursoIds: [C.cursoId] });
  expect(lib.status).toBe(200);
  expect(lib.json).toMatchObject({ ok: true, liberados: 1 });
  expect((await U.get('/api/liberacoes/me')).json.cursoIds).toContain(C.cursoId);
  const todas = await A.get('/api/liberacoes');
  expect(todas.status).toBe(200);
  expect(todas.json.byEmail[aluno.email]).toContain(C.cursoId);

  // Encontro: criar, editar, remover
  const liveId = P.uid('qa-l');
  const corpo = { cursoId: C.cursoId, titulo: `Encontro R12 ${liveId.slice(-5)}`, descricao: '', inicioEm: new Date(Date.now() + 864e5).toISOString(), duracaoMin: 60, url: 'https://sala.exemplo.invalid/r12', plataforma: 'Sala QA' };
  expect((await U.put(`/api/lives/${liveId}`, corpo)).status).toBe(403);
  const cria = await A.put(`/api/lives/${liveId}`, corpo);
  expect(cria.status).toBe(200);
  expect(cria.json).toMatchObject({ ok: true, id: liveId });
  const doAluno = async () => (await U.get('/api/lives')).json.itens.find((l) => l.id === liveId) || null;
  expect(await doAluno()).toMatchObject({ titulo: corpo.titulo, status: 'agendada', url: '' });
  const novoTitulo = `${corpo.titulo} (editado)`;
  expect((await A.put(`/api/lives/${liveId}`, { ...corpo, titulo: novoTitulo })).status).toBe(200);
  expect((await doAluno()).titulo).toBe(novoTitulo);
  const rem = await A.del(`/api/lives/${liveId}`);
  expect(rem.status).toBe(200);
  expect(rem.json).toMatchObject({ ok: true });
  expect(await doAluno()).toBeNull();

  // Revogar
  const rev = await A.del(`/api/liberacoes?email=${encodeURIComponent(aluno.email)}&cursoId=${encodeURIComponent(C.cursoId)}`);
  expect(rev.status).toBe(200);
  expect(rev.json).toMatchObject({ ok: true, revogados: 1 });
  expect((await U.get('/api/liberacoes/me')).json.cursoIds).not.toContain(C.cursoId);
});

// =============================================================
// R13 — parcerias.html: guarda própria (F8). O resto do R13 é tests/e2e/parcerias.spec.js.
// =============================================================
caso('R13', ['F8'], 'parcerias.html: sem sessão → login.html?next=parcerias.html; conta sem admin → #pa-restrito', async ({ page, request }) => {
  const aluno = await P.criarUsuario(request);
  const mon = P.monitorarConsoleERede(page);
  // A guarda pergunta à API de candidaturas; conta sem admin recebe 403 (como hoje).
  P.esperar(page, { status: 403, url: '/api/parcerias/admin/candidaturas' });
  await page.goto(`${EAD}parcerias.html`);
  await expect(page).toHaveURL(new RegExp(`${EAD}login\\.html\\?next=parcerias\\.html`));
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}parcerias.html`);
  await expect(page.locator('#pa-restrito')).toBeVisible();
  await fechar(mon);
});

// =============================================================
// L0 — login-classico.html idêntica à linha de base (§8.3 G0-a, D-60). Só roda quando a
// linha de base existe no disco (docs/dmc/qa/portal/antes/, fora do git) e fora do QA_FATIA.
// =============================================================
const DIR_ANTES = path.join(P.DIR_CAPTURAS, 'antes');
const ALTURAS = { 1440: 900, 390: 844 };
if (!QA_FATIA && process.env.QA_CAPTURAS !== 'antes' && fs.existsSync(path.join(DIR_ANTES, 'login-classico--deterministica-1440.png'))) {
  test('L0 · login-classico.html idêntica à linha de base (captura determinística 1440 e 390)', { tag: ['@integracao'] }, async ({ browser, baseURL }) => {
    const dir = path.join(P.DIR_CAPTURAS, process.env.QA_CAPTURAS || 'atual');
    for (const largura of [1440, 390]) {
      const atual = await P.capturaDeterministica(browser, baseURL, { caminho: `${EAD}login-classico.html`, largura, altura: ALTURAS[largura], dir, nome: 'login-classico--deterministica' });
      const antes = fs.readFileSync(path.join(DIR_ANTES, `login-classico--deterministica-${largura}.png`));
      expect(P.conteudoPng(atual.buf).fracaoDiferenteDoFundo, `captura atual ${largura} sem conteúdo (lisa)`).toBeGreaterThan(0.01);
      const cmp = P.compararPng(antes, atual.buf);
      await test.info().attach(`comparacao-${largura}`, { body: JSON.stringify({ ...cmp, antes: path.join(DIR_ANTES, `login-classico--deterministica-${largura}.png`), atual: atual.arquivo }, null, 2), contentType: 'application/json' });
      expect(cmp, `login-classico ${largura}: ${JSON.stringify(cmp)}`).toMatchObject({ identicas: true });
    }
  });
}

// =============================================================
// Linha de base — capturas 1440 e 390 de todas as páginas atuais da EAD (§9.2 item 1).
// Só com QA_CAPTURAS=<rótulo> (ex.: antes); grava em docs/dmc/qa/portal/<rótulo>/.
// =============================================================
if (process.env.QA_CAPTURAS && !QA_FATIA) {
  const ROTULO = process.env.QA_CAPTURAS.replace(/[^a-z0-9_-]/gi, '');
  const DIR = path.join(P.DIR_CAPTURAS, ROTULO);
  const manifesto = [];

  test.describe('linha de base — capturas', () => {
    test.describe.configure({ mode: 'serial' });
    let cen = null;

    test.beforeAll(async ({ playwright, baseURL }) => {
      const request = await playwright.request.newContext({ baseURL });
      try {
        const est = await (await request.get('/__qa/estado')).json();
        if (!est.mongo) return;
        const [aluno, admin] = await Promise.all([
          P.criarUsuario(request, { papel: 'aluno', nome: 'Pessoa de Teste (linha de base)' }),
          P.criarUsuario(request, { papel: 'admin', nome: 'Coordenação de Teste (linha de base)' })
        ]);
        const A = await P.semearCurso(request, { titulo: 'Curso de teste A (linha de base)', preco: 1490, ordem: 1, modulos: 2, aulas: [{ videoUrl: P.URL_VIMEO }, { videoUrl: P.URL_VIMEO }, { disponivel: false }] });
        const B = await P.semearCurso(request, { titulo: 'Curso de teste B (linha de base)', preco: 890, ordem: 2, aulas: [{}, {}] });
        const C = await P.semearCurso(request, { titulo: 'Curso de teste C (linha de base)', preco: 1290, ordem: 3 });
        for (const c of [A, B]) await P.liberarCurso(request, aluno.id, c.cursoId);
        await P.concluirAulas(request, aluno.id, [A.aulas[0].id, ...B.aulas.map((a) => a.id)]);
        const lives = await P.semearLives(request, A.cursoId);
        const cert = await P.api(request, aluno.token).post(`/api/cursos/${B.cursoId}/certificado`, {});
        cen = { aluno, admin, A, B, C, lives, codigo: cert.json && cert.json.certificado && cert.json.certificado.codigo };
      } finally {
        await request.dispose();
      }
    });

    test.afterAll(async () => {
      if (!manifesto.length) return;
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(path.join(DIR, 'manifesto.json'), JSON.stringify({
        rotulo: ROTULO, geradoEm: new Date().toISOString(), commit: process.env.QA_COMMIT || null,
        nota: 'Capturas de página inteira; dados do banco descartável (sementes de teste). As "--deterministica" bloqueiam rede externa, ocultam o <canvas> por CSS e usam movimento reduzido (comparáveis byte a byte na mesma máquina).',
        capturas: manifesto
      }, null, 2));
    });

    const PAGINAS = [
      { nome: 'index-sem-js', papel: null, caminho: () => 'index.html', js: false, estado: 'sem JavaScript (o index só redireciona; a tela própria é o <noscript>)' },
      { nome: 'login', papel: null, caminho: () => 'login.html', estado: 'anônimo' },
      { nome: 'login-classico', papel: null, caminho: () => 'login-classico.html', estado: 'anônimo (cena WebGL ao vivo)' },
      { nome: 'dashboard', papel: 'aluno', caminho: () => 'dashboard.html', espera: '#modules-list [data-aula-id]', abrir: async (page) => { const b = page.locator('#modules-list button').first(); if (await b.count()) await b.click(); }, estado: 'aluno com A (1/2) e B (100%) liberados; C bloqueado; A escolhido, 1º módulo aberto' },
      { nome: 'meus-cursos', papel: 'aluno', caminho: () => 'meus-cursos.html', espera: '#meus-cursos-lista article, #meus-cursos-lista > *', estado: 'aluno com 2 cursos' },
      { nome: 'aula-com-video', papel: 'aluno', caminho: (c) => `aula.html?id=${c.A.aulas[0].id}`, espera: '#player-stage iframe', estado: 'player com vídeo (Vimeo substituído por stub local, D-77) e aula concluída' },
      { nome: 'aula-em-breve', papel: 'aluno', caminho: (c) => `aula.html?id=${c.A.aulas[2].id}`, estado: 'aula "em breve" por link direto' },
      { nome: 'ao-vivo', papel: 'aluno', caminho: () => 'ao-vivo.html', espera: '#lives-lista > *', estado: 'encontros ao vivo, agendado e encerrado' },
      { nome: 'certificados', papel: 'aluno', caminho: () => 'certificados.html', espera: '#certificados-lista > *', estado: 'um emitido (B) e um em andamento (A)' },
      { nome: 'certificado-publico', papel: null, caminho: (c) => `certificado.html?codigo=${c.codigo}`, espera: '#cert-root > *:not(.cert-carregando)', estado: 'validação pública sem login' },
      { nome: 'loja-carrinho-aberto', papel: 'aluno', caminho: () => 'loja.html', espera: '#loja-grid > *', abrir: async (page, c) => { await page.locator(`[data-curso-id="${c.C.cursoId}"]`).first().getByRole('button').first().click(); await page.locator('[data-cart-count]').first().click(); await expect(page.locator('#cart-drawer')).toBeVisible(); }, estado: 'C no carrinho, carrinho aberto' },
      { nome: 'obrigado', papel: 'aluno', caminho: (c) => `obrigado.html?cursos=${c.C.cursoId}&email=${encodeURIComponent(c.aluno.email)}&total=1290.00`, estado: 'depois de finalizar (caixa de desenvolvimento visível em 127.0.0.1)' },
      { nome: 'admin-curso-aberto', papel: 'admin', caminho: () => 'admin.html', espera: '#curso-editor [data-curso-field]', abrir: async (page, c) => { await page.locator(`[data-curso-id="${c.A.cursoId}"]`).first().click(); await page.locator(`[data-modulo-toggle="${c.A.moduloId}"]`).click(); }, estado: 'curso A selecionado e 1º módulo aberto' },
      { nome: 'parcerias', papel: 'admin', caminho: () => 'parcerias.html', estado: 'painel de parcerias (admin, sem candidaturas)' },
      { nome: 'parcerias-restrito', papel: 'aluno', caminho: () => 'parcerias.html', espera: '#pa-restrito', estado: 'conta sem admin' }
    ];

    for (const pg of PAGINAS) {
      test(`linha de base · ${pg.nome}`, async ({ browser, baseURL }) => {
        test.skip(!cen, 'bloqueado: sem MongoDB descartável para as sementes');
        test.setTimeout(120_000);
        for (const largura of [1440, 390]) {
          const ctx = await browser.newContext({ baseURL, viewport: { width: largura, height: ALTURAS[largura] }, javaScriptEnabled: pg.js !== false, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
          try {
            const page = await ctx.newPage();
            await P.rotearVimeo(page);
            if (pg.papel) await P.entrarComToken(page, cen[pg.papel].token, { 'dmc:cursoEscolhido': cen.A.cursoId, 'dmc:carrinho': '[]' });
            await page.goto(`${EAD}${pg.caminho(cen)}`, { waitUntil: 'load' });
            await page.waitForLoadState('networkidle').catch(() => {});
            if (pg.espera) await page.locator(pg.espera).first().waitFor({ state: 'attached', timeout: 15_000 });
            if (pg.abrir) await pg.abrir(page, cen);
            await page.waitForLoadState('networkidle').catch(() => {});
            const cap = await P.capturar(page, { nome: pg.nome, largura, dir: DIR });
            manifesto.push({ nome: pg.nome, largura, altura: ALTURAS[largura], url: page.url().replace(baseURL, ''), estado: pg.estado, arquivo: path.relative(P.RAIZ, cap.arquivo), sha256: cap.sha256 });
          } finally {
            await ctx.close();
          }
        }
      });
    }

    test('linha de base · login-classico determinística (2× por largura, prova de determinismo)', async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      for (const largura of [1440, 390]) {
        const c1 = await P.capturaDeterministica(browser, baseURL, { caminho: `${EAD}login-classico.html`, largura, altura: ALTURAS[largura], dir: DIR, nome: 'login-classico--deterministica' });
        const c2 = await P.capturaDeterministica(browser, baseURL, { caminho: `${EAD}login-classico.html`, largura, altura: ALTURAS[largura], dir: path.join(DIR, '_conferencia'), nome: 'login-classico--deterministica' });
        const cmp = P.compararPng(c1.buf, c2.buf);
        const conteudo = P.conteudoPng(c1.buf);
        expect(conteudo.fracaoDiferenteDoFundo, `captura determinística ${largura} sem conteúdo (lisa)`).toBeGreaterThan(0.01);
        manifesto.push({ conteudo, nome: 'login-classico--deterministica', largura, altura: ALTURAS[largura], url: `${EAD}login-classico.html`, estado: 'determinística (sem rede externa, canvas oculto, movimento reduzido)', arquivo: path.relative(P.RAIZ, c1.arquivo), sha256: c1.sha256, repeticao: cmp });
        expect(cmp, `captura determinística repetida ${largura}`).toMatchObject({ identicas: true });
      }
      fs.rmSync(path.join(DIR, '_conferencia'), { recursive: true, force: true });
    });
  });
}
