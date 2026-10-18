// =============================================================
// E2E da F8 — Portal do Professor (professor.html), editor de cursos
// (admin.html) e painel de parcerias (parcerias.html).
// Spec: PORTAL-ACADEMICO.md §7.8 (DMC_Professor), §8.2 item 6b (P1f), §8.5
// (linha F8), §8.6, D-65, D-66, D-74, D-75; PORTAL-API.md §6.12, §7.6;
// PORTAL-UX.md §5.4, §7.1–§7.5, §7.8, §7.16, §7.19, §7.21.
//
// Roda no serve.mjs (mongod descartável; nunca complexodmc_local):
//   QA_PORT=4659 QA_WORKERS=2 QA_DATA=<data>-f8 QA_FATIA=F8 QA_INTEGRADAS=<lista do PROGRESS.md> \
//   npx playwright test tests/e2e/portal-professor.spec.js
// (QA_INTEGRADAS=nenhuma enquanto o PROGRESS.md disser "nenhuma fatia integrada": assim os 404 de
//  qr.js/tutoriais.js — F0b/F0r, ainda não entregues — são tolerados como R13.)
// (sem PORTAL_MODULOS o serve.mjs monta todos os módulos presentes; com
//  PORTAL_MODULOS=routes/portal-professor.js,routes/portal-conteudo.js os
//  casos que dependem de matrículas (F4a) pulam com o motivo.)
//
// P1f: o hospedeiro é testado com uma rota FALSA registrada pelo próprio
// spec (o arquivo js/portal/prof-relatorios.js, da F7, é substituído por
// page.route só nestes casos).
// =============================================================
import { test, expect } from '@playwright/test';
import * as P from './_portal.js';

const EAD = P.BASE_EAD;
test.describe.configure({ mode: 'parallel' });

/** Script que registra rotas falsas no DMC_Professor (servido no lugar de prof-relatorios.js). */
const ROTAS_FALSAS = `
(function () {
  var P = window.DMC_Professor;
  if (!P) return;
  P.registrar({ rota: 'teste-falsa', titulo: 'Rota de teste', papeis: ['professor', 'admin'],
    montar: function (el, ctx) { el.setAttribute('data-teste-montada', ctx.rota); el.textContent = 'montada:' + ctx.papel + ':' + ctx.filtros.get('x'); return { destruir: function () { window.__destruidas = (window.__destruidas || 0) + 1; } }; } });
  P.registrar({ rota: 'teste-coordenacao', titulo: 'Só coordenação', papeis: ['admin'], montar: function (el) { el.textContent = 'segredo'; } });
  // A aba falsa ocupa a primeira aba ainda LIVRE (as fatias donas registram as delas ao carregar).
  var livreAluno = ['academico', 'matriculas', 'documentos', 'contratos', 'financeiro', 'atendimentos']
    .filter(function (a) { return !P.temRota('alunos/:userId/' + a); })[0];
  if (livreAluno) {
    window.__abaTeste = livreAluno;
    P.registrar({ rota: 'alunos/:userId/' + livreAluno, titulo: 'Aba de teste', papeis: ['professor', 'admin'], pai: 'alunos/:userId', aba: livreAluno,
      montar: function (el, ctx) { window.__montagens = (window.__montagens || 0) + 1; el.setAttribute('data-teste-aba', 'aluno'); el.textContent = 'matricula=' + (ctx.matriculaId || 'nenhuma') + ' aluno=' + ((ctx.aluno && ctx.aluno.id) || ''); } });
  }
})();`;

async function comRotasFalsas(page) {
  await page.route(/\/plataforma-ead\/js\/portal\/prof-relatorios\.js/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: ROTAS_FALSAS }));
}

async function fechar(mon) {
  await mon.anexar('console-e-rede');
  await mon.verificar({ tipos: ['pageerror', 'resposta'], rotulo: 'pageerror e respostas' });
}

/** Professor com docência geral no curso (rota da F0t). */
async function vincular(request, admin, professor, cursoId) {
  const r = await P.api(request, admin.token).post('/api/portal/admin/docencias', { userId: professor.id, cursoId });
  if (r.status === 404) {
    // F0t ausente: grava a docência direto no banco descartável (mesmo formato da F0t).
    await P.comBanco(request, (db) => db.collection('docencias').insertOne({ userId: professor.id, cursoId, turmaId: null, criadoEm: new Date(), criadoPor: admin.id }));
    return;
  }
  expect(r.status, JSON.stringify(r.json)).toBe(201);
}

async function f4aMontada(request, admin) {
  const r = await P.api(request, admin.token).get('/api/portal/admin/turmas');
  return r.status !== 404;
}

// ---------------------------------------------------------------
// P1f — hospedeiro: roteador, guarda, título, foco e moldura
// ---------------------------------------------------------------
test('F8 · P1f: rota registrada monta com ctx; hash desconhecido → #/inicio; papel insuficiente → Área da coordenação; foco no H1', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { professor } = await P.criarPapeis(request);
  const mon = P.monitorarConsoleERede(page);
  await comRotasFalsas(page);
  await P.entrarComToken(page, professor.token);

  await page.goto(`${EAD}professor.html#/teste-falsa?x=1`);
  const painel = page.locator('[data-teste-montada="teste-falsa"]');
  await expect(painel).toHaveText('montada:professor:1');
  await expect(page.locator('h1')).toHaveText('Rota de teste');
  await expect(page).toHaveTitle('Rota de teste · Portal do Professor · Plataforma Complexo DMC');
  await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.tagName)).toBe('H1');

  // Troca de rota destrói a anterior.
  await page.evaluate(() => { window.location.hash = '#/inicio'; });
  await expect.poll(() => page.evaluate(() => window.__destruidas || 0)).toBe(1);

  // Hash desconhecido → #/inicio, sem toast.
  await page.evaluate(() => { window.location.hash = '#/nao-existe/mesmo'; });
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/inicio');
  await expect(page.locator('[role="alert"]')).toHaveCount(0);

  // Seção só da coordenação aberta por professor.
  await page.evaluate(() => { window.location.hash = '#/teste-coordenacao'; });
  await expect(page.locator('h1')).toHaveText('Área da coordenação');
  await expect(page.locator('main')).not.toContainText('segredo');
  await expect(page.getByRole('link', { name: 'Ir para a visão geral' })).toBeVisible();

  // Menu do professor: filtrado por papel e rota registrada (sem Equipe, sem Banners).
  const menu = page.locator('.pf-lateral .pf-menu');
  await expect(menu.locator('[data-pf-chave="inicio"]')).toHaveCount(1);
  await expect(menu.locator('[data-pf-chave="duvidas"]')).toHaveCount(1);
  await expect(menu.locator('[data-pf-chave="equipe"]')).toHaveCount(0);
  await expect(menu.locator('[data-pf-chave="banners"]')).toHaveCount(0);
  await fechar(mon);
});

test('F8 · P1f: aluno não entra no portal do professor (vai para dashboard.html)', async ({ page, request }) => {
  await P.exigirMongo(request);
  const aluno = await P.criarUsuario(request, { papel: 'aluno' });
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}professor.html#/inicio`);
  await expect(page).toHaveURL(/dashboard\.html/);
});

test('F8 · roteador só em professor.html: admin.html não reescreve hash; menu com links professor.html#/…', async ({ page, request }) => {
  await P.exigirMongo(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  await P.entrarComToken(page, admin.token);
  await page.goto(`${EAD}admin.html#lives-pane`);
  await expect(page.locator('#btn-add-curso')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.location.hash)).toBe('#lives-pane');
  const hrefs = await page.locator('.pf-lateral .pf-menu a[data-pf-chave]').evaluateAll((n) => n.map((a) => a.getAttribute('href')));
  expect(hrefs).toContain('professor.html#/inicio');
  expect(hrefs).toContain('professor.html#/equipe');
  expect(hrefs).toContain('admin.html');
  expect(hrefs).toContain('parcerias.html');
  expect(hrefs.filter((h) => /^#/.test(h))).toEqual([]);
  await expect(page.locator('.pf-lateral [data-pf-chave="conteudo"][aria-current="page"]')).toHaveCount(1);
});

test('F8 · moldura do aluno: abas por papel e rota registrada; seletor "Matrícula" remonta a aba', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { aluno, professor, admin } = await P.criarPapeis(request);
  if (!(await f4aMontada(request, admin))) {
    test.info().annotations.push({ type: 'bloqueado', description: 'routes/portal-turmas.js (F4a) não montado: sem matrículas, sem seletor' });
    test.skip(true, 'bloqueado: F4a não montada');
  }
  const A = P.api(request, admin.token);
  const C1 = await P.semearCurso(request);
  const C2 = await P.semearCurso(request);
  const lib = await A.post('/api/liberacoes', { email: aluno.email, cursoIds: [C1.cursoId, C2.cursoId] });
  expect(lib.status, JSON.stringify(lib.json)).toBe(200);
  await vincular(request, admin, professor, C1.cursoId);

  const mon = P.monitorarConsoleERede(page);
  await comRotasFalsas(page);
  await P.entrarComToken(page, admin.token);
  await page.goto(`${EAD}professor.html#/alunos/${aluno.id}`);
  // Sem aba → primeira aba visível ao papel, na ordem de abasDoAluno.
  await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(new RegExp(`^#/alunos/${aluno.id}/[a-z]+$`));
  const abas = page.locator('[role="tablist"] [role="tab"]');
  await expect(abas.first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[role="tab"][data-pf-prof-aba="cadastro"]')).toHaveCount(1); // admin vê Cadastro
  const abaTeste = await page.evaluate(() => window.__abaTeste || null);
  test.skip(!abaTeste, 'todas as abas do aluno já têm dona registrada: sem aba livre para a rota falsa');
  await page.evaluate((h) => { window.location.hash = h; }, `#/alunos/${aluno.id}/${abaTeste}`);
  await expect(page.locator('[role="tabpanel"]')).toHaveAttribute('aria-labelledby', `pf-prof-aba-${abaTeste}`);
  const seletor = page.locator('[data-pf-prof-matricula]');
  await expect(seletor).toBeVisible();
  const opcoes = await seletor.locator('option').evaluateAll((n) => n.map((o) => o.value));
  expect(opcoes.length).toBe(2);
  const painelTeste = page.locator('[data-teste-aba="aluno"]');
  await expect(painelTeste).toContainText(`matricula=${opcoes[0]}`);
  await expect(painelTeste).toContainText(`aluno=${aluno.id}`);
  const antes = await page.evaluate(() => window.__montagens || 0);
  await seletor.selectOption(opcoes[1]);
  await expect(painelTeste).toContainText(`matricula=${opcoes[1]}`);
  expect(await page.evaluate(() => window.__montagens || 0)).toBe(antes + 1);

  // Teclado na barra de abas: seta para a direita move o foco para a próxima aba.
  await abas.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.getAttribute('role'))).toBe('tab');
  await fechar(mon);

  // Professor: vê só a aba Acadêmico (sem Cadastro) e só a matrícula do curso que leciona.
  const page2 = await page.context().browser().newPage();
  await comRotasFalsas(page2);
  await P.entrarComToken(page2, professor.token);
  await page2.goto(`${EAD}professor.html#/alunos/${aluno.id}/${abaTeste}`);
  await expect(page2.locator('[data-teste-aba="aluno"]')).toBeVisible();
  await expect(page2.locator('[role="tab"][data-pf-prof-aba="cadastro"]')).toHaveCount(0);
  await expect(page2.locator('[data-pf-prof-matricula]')).toHaveCount(0);
  await page2.close();
});

test('F8 · turmas: lista do professor e moldura #/turmas/:id com a aba Alunos (nome, e-mail, situação; sem CPF)', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { aluno, professor, admin } = await P.criarPapeis(request);
  if (!(await f4aMontada(request, admin))) {
    test.info().annotations.push({ type: 'bloqueado', description: 'routes/portal-turmas.js (F4a) não montado' });
    test.skip(true, 'bloqueado: F4a não montada');
  }
  const A = P.api(request, admin.token);
  const C = await P.semearCurso(request);
  const codigo = `QA8-${C.cursoId.slice(-5).toUpperCase()}`;
  const t = await A.post('/api/portal/admin/turmas', { cursoId: C.cursoId, codigo, inicio: '2026-08-03', modalidade: 'hibrido' });
  expect(t.status, JSON.stringify(t.json)).toBe(201);
  expect((await A.post('/api/liberacoes', { email: aluno.email, cursoIds: [C.cursoId] })).status).toBe(200);
  const mats = await A.get(`/api/portal/admin/matriculas?userId=${aluno.id}`);
  const m = mats.json.itens[0];
  const ent = await A.put(`/api/portal/admin/matriculas/${m.id}/turma`, { turmaId: t.json.turma.id, versao: m.versao });
  expect(ent.status, JSON.stringify(ent.json)).toBe(200);
  await vincular(request, admin, professor, C.cursoId);

  // API: a lista por curso não traz dado sensível e respeita a docência.
  const lista = await P.api(request, professor.token).get(`/api/portal/professor/cursos/${C.cursoId}/alunos?turmaId=${t.json.turma.id}`);
  expect(lista.status).toBe(200);
  expect(lista.json.itens.map((i) => i.aluno.id)).toEqual([aluno.id]);
  expect(JSON.stringify(lista.json)).not.toMatch(/"cpf"|"rg"|"endereco"/);

  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, professor.token);
  await page.goto(`${EAD}professor.html#/turmas?status=todas`);
  const link = page.getByRole('link', { name: codigo });
  await expect(link).toBeVisible();
  await link.click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(`#/turmas/${t.json.turma.id}/alunos`);
  await expect(page.locator('h1')).toHaveText(codigo);
  await expect(page.locator('[role="tab"][data-pf-prof-aba="alunos"]')).toHaveAttribute('aria-selected', 'true');
  const painel = page.locator('[role="tabpanel"]');
  await expect(painel).toContainText(aluno.nome);
  await expect(painel).toContainText(aluno.email);
  await fechar(mon);
});

// ---------------------------------------------------------------
// Dúvidas: professor do curso responde; o aluno lê pelo legado
// ---------------------------------------------------------------
test('F8 · dúvidas: professor do curso responde na tela; resposta com autorPapel no GET legado do aluno', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { aluno, professor, admin } = await P.criarPapeis(request);
  const C = await P.semearCurso(request);
  await P.liberarCurso(request, aluno.id, C.cursoId);
  await vincular(request, admin, professor, C.cursoId);
  const aulaId = C.aulas[0].id;
  const perg = await P.api(request, aluno.token).post(`/api/aulas/${aulaId}/duvidas`, { texto: 'Pergunta de teste da F8' });
  expect(perg.status, JSON.stringify(perg.json)).toBe(201);

  // API: fila do professor e 403 em curso sem docência.
  const PR = P.api(request, professor.token);
  const fila = await PR.get('/api/portal/professor/duvidas');
  expect(fila.status).toBe(200);
  expect(fila.json.itens.map((i) => i.id)).toContain(perg.json.duvida.id);
  const outro = await P.semearCurso(request);
  const fora = await PR.get(`/api/portal/professor/duvidas?cursoId=${outro.cursoId}`);
  expect([fora.status, fora.json.codigo]).toEqual([403, 'nao-docente']);

  const mon = P.monitorarConsoleERede(page);
  page.on('dialog', (d) => { throw new Error(`diálogo nativo: ${d.message()}`); });
  await P.entrarComToken(page, professor.token);
  await page.goto(`${EAD}professor.html#/duvidas`);
  const item = page.locator(`[data-pf-prof-item="${perg.json.duvida.id}"]`);
  await expect(item).toBeVisible();
  await expect(item).toContainText('Pergunta de teste da F8');
  await item.getByLabel('Responder').fill('Resposta da professora pela tela.');
  const rResp = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/portal\/professor\/duvidas\/[^/]+\/respostas$/.test(new URL(r.url()).pathname));
  await item.getByRole('button', { name: 'Publicar resposta' }).click();
  expect((await rResp).status()).toBe(201);

  const legado = await P.api(request, aluno.token).get(`/api/aulas/${aulaId}/duvidas`);
  const d = legado.json.itens.find((x) => x.id === perg.json.duvida.id);
  expect(d.resolvida).toBe(true);
  expect(d.respostas[0]).toMatchObject({ texto: 'Resposta da professora pela tela.', autorPapel: 'professor' });
  expect(legado.json.podeResponder).toBe(false);
  await fechar(mon);
});

// ---------------------------------------------------------------
// Visão geral e resumo
// ---------------------------------------------------------------
test('F8 · visão geral: KPIs do resumo (números reais ou "—"), professor sem curso vê o aviso honesto', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { professor, admin } = await P.criarPapeis(request);
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, professor.token);
  await page.goto(`${EAD}professor.html#/inicio`);
  await expect(page.locator('main')).toContainText('Você ainda não está vinculado a nenhum curso.');
  await fechar(mon);

  const C = await P.semearCurso(request);
  await vincular(request, admin, professor, C.cursoId);
  const r = await P.api(request, professor.token).get('/api/portal/professor/resumo');
  expect(r.status).toBe(200);
  expect(r.json.cursos.map((c) => c.id)).toEqual([C.cursoId]);
  await page.reload();
  const kpis = page.locator('.pf-prof-kpi');
  await expect(kpis).toHaveCount(5);
  await expect(kpis.filter({ hasText: 'Dúvidas abertas' })).toContainText('0');
  await expect(page.locator('h1')).toContainText(professor.nome.split(' ')[0]);
});

// ---------------------------------------------------------------
// Editor de cursos (admin.html)
// ---------------------------------------------------------------
test('F8 · admin.html: depois de 3 reordenações, "Adicionar módulo" cria exatamente 1 módulo; nada de diálogo nativo', async ({ page, request }) => {
  test.setTimeout(120_000);
  await P.exigirMongo(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  const A = P.api(request, admin.token);
  const nativos = [];
  page.on('dialog', (d) => { nativos.push(d.message()); d.dismiss().catch(() => {}); });
  await P.entrarComToken(page, admin.token);
  await page.goto(`${EAD}admin.html`);
  const caminhoDe = (r) => new URL(r.url()).pathname;
  const putEm = (re) => page.waitForResponse((r) => r.request().method() === 'PUT' && re.test(caminhoDe(r)));

  // O botão está no HTML estático; o ouvinte entra quando o editor termina de montar.
  await expect(page.locator('#curso-editor [data-curso-field="titulo"]')).toBeVisible();
  const rCurso = putEm(/^\/api\/cursos\/[^/]+$/);
  await page.locator('#btn-add-curso').click();
  const cursoId = decodeURIComponent(caminhoDe(await rCurso).split('/').pop());
  await page.locator(`[data-curso-id="${cursoId}"]`).first().click();
  for (let i = 0; i < 3; i++) {
    const r = putEm(/^\/api\/modulos\/(?!ordem$)[^/]+$/);
    await page.locator('#btn-add-modulo').click();
    await r;
    await expect(page.locator('#modules-edit .admin-module')).toHaveCount(i + 1);
  }
  for (let i = 0; i < 3; i++) {
    const r = putEm(/^\/api\/modulos\/ordem$/);
    await page.locator('#modules-edit [data-modulo-down]:not([disabled])').first().click();
    expect((await r).ok()).toBe(true);
  }
  let novos = 0;
  page.on('request', (q) => { if (q.method() === 'PUT' && /^\/api\/modulos\/(?!ordem$)[^/]+$/.test(new URL(q.url()).pathname)) novos++; });
  const r = putEm(/^\/api\/modulos\/(?!ordem$)[^/]+$/);
  await page.locator('#btn-add-modulo').click();
  await r;
  await page.waitForTimeout(1200);
  expect(novos).toBe(1);
  const cat = await A.get('/api/catalogo');
  expect(cat.json.cursos.find((c) => c.id === cursoId).modulos.length).toBe(4);

  // Exclusão pelo diálogo do portal (cancelar não apaga; confirmar apaga).
  await page.locator('#btn-delete-curso').click();
  await page.locator('[data-pf-acao="cancelar"]').click();
  expect((await A.get('/api/catalogo')).json.cursos.some((c) => c.id === cursoId)).toBe(true);
  const rDel = page.waitForResponse((x) => x.request().method() === 'DELETE' && caminhoDe(x) === `/api/cursos/${cursoId}`);
  await P.confirmarNaTela(page, () => page.locator('#btn-delete-curso').click());
  expect((await rDel).ok()).toBe(true);
  expect(nativos).toEqual([]);
});

test('F8 · admin.html: markup morto removido, campos com <label>, shell do backoffice no lugar do header antigo', async ({ page, request }) => {
  await P.exigirMongo(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  const C = await P.semearCurso(request);
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, admin.token);
  await page.goto(`${EAD}admin.html?curso=${C.cursoId}`);
  await expect(page.locator('[data-curso-field="titulo"]')).toHaveValue(C.titulo);
  for (const sel of ['#lib-nome', '#modal-import', '#btn-import', '#btn-reset', '.app-nav']) {
    await expect(page.locator(sel)).toHaveCount(0);
  }
  await expect(page.locator('.pf-topo')).toHaveCount(1);
  const html = await (await page.request.get(`${EAD}admin.html`)).text();
  expect(html).not.toMatch(/Playfair|Importar JSON|<script>(?!<\/script>)[^<]/);
  await page.locator(`[data-modulo-toggle="${C.moduloId}"]`).click();
  const semRotulo = await page.locator('#conteudo input:not([type=hidden]):not([type=file]), #conteudo textarea, #conteudo select').evaluateAll((els) =>
    els.filter((e) => !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.closest('[hidden]')).map((e) => e.outerHTML.slice(0, 120)));
  expect(semRotulo).toEqual([]);
  await fechar(mon);
});

test('F8 · admin.html: capa vertical, capa do módulo e "Tipo do módulo: Regular | TCC" (D-53, D-56)', async ({ page, request }) => {
  await P.exigirMongo(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  const C = await P.semearCurso(request);
  const A = P.api(request, admin.token);
  const sonda = await A.put(`/api/portal/admin/modulos/${C.moduloId}/academico`, {});
  if (sonda.status === 404 && !(sonda.json && sonda.json.error === 'Módulo não encontrado.')) {
    test.info().annotations.push({ type: 'bloqueado', description: 'routes/portal-cursos.js (F3b) não montado' });
    test.skip(true, 'bloqueado: F3b não montada');
  }
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, admin.token);
  await page.goto(`${EAD}admin.html?curso=${C.cursoId}`);
  await expect(page.locator('[data-curso-field="titulo"]')).toHaveValue(C.titulo);
  await page.locator(`[data-modulo-toggle="${C.moduloId}"]`).click();
  const caminhoDe = (r) => new URL(r.url()).pathname;

  // Tipo do módulo
  const tcc = page.locator(`[data-modulo-tipo="tcc"][data-modulo-id="${C.moduloId}"]`);
  const rTipo = page.waitForResponse((r) => r.request().method() === 'PUT' && caminhoDe(r) === `/api/portal/admin/modulos/${C.moduloId}/academico`);
  await tcc.click();
  expect((await rTipo).status()).toBe(200);
  await expect(tcc).toHaveAttribute('aria-pressed', 'true');

  // Capa do módulo (corpo cru; tipo conferido pelos bytes no servidor)
  const rCapa = page.waitForResponse((r) => r.request().method() === 'POST' && caminhoDe(r) === `/api/portal/admin/modulos/${C.moduloId}/capa`);
  await page.locator(`[data-modulo-capa-file="${C.moduloId}"]`).setInputFiles({ name: 'capa-modulo.png', mimeType: 'image/png', buffer: P.PNG_1PX });
  const capa = await rCapa;
  expect(capa.status()).toBe(200);
  await expect(page.locator(`[data-modulo-capa-previa="${C.moduloId}"] img`)).toHaveCount(1);
  await expect(page.locator(`[data-modulo-capa-del="${C.moduloId}"]`)).toBeVisible();

  // Capa vertical
  const rVert = page.waitForResponse((r) => r.request().method() === 'POST' && caminhoDe(r) === `/api/portal/admin/cursos/${C.cursoId}/capa-vertical`);
  await page.locator('[data-capa-vertical-file]').setInputFiles({ name: 'capa-vertical.png', mimeType: 'image/png', buffer: P.PNG_1PX });
  expect((await rVert).status()).toBe(200);
  await expect(page.locator('[data-capa-vertical-previa] img')).toHaveCount(1);

  // Formato recusado no cliente, sem requisição
  await page.locator('[data-capa-vertical-file]').setInputFiles({ name: 'x.pdf', mimeType: 'application/pdf', buffer: P.PDF_MINIMO });
  await expect(page.locator('[data-capa-vertical-erro]')).toHaveText('Formato não aceito. Envie JPG, PNG ou WebP.');
  await fechar(mon);
});

// ---------------------------------------------------------------
// Parcerias: guarda própria; shell só para a coordenação (D-48)
// ---------------------------------------------------------------
test('F8 · parcerias.html: coordenação com shell do backoffice; aluno vê #pa-restrito sem shell', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { aluno, admin } = await P.criarPapeis(request);
  await P.entrarComToken(page, admin.token);
  await page.goto(`${EAD}parcerias.html`);
  await expect(page.locator('#pa-app')).toBeVisible();
  await expect(page.locator('.pf-topo')).toHaveCount(1);
  await expect(page.locator('.pf-lateral [data-pf-chave="parcerias"]')).toHaveCount(1);

  P.monitorarConsoleERede(page);
  P.esperar(page, { status: 403, url: '/api/parcerias/admin/candidaturas' });
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}parcerias.html`);
  await expect(page.locator('#pa-restrito')).toBeVisible();
  await expect(page.locator('.pf-topo')).toHaveCount(0);
});

// ---------------------------------------------------------------
// Equipe (coordenação; rotas da F0t)
// ---------------------------------------------------------------
test('F8 · equipe: coordenação adiciona professor pela tela e vê a senha temporária uma vez', async ({ page, request }) => {
  await P.exigirMongo(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  const eq = await P.api(request, admin.token).get('/api/portal/admin/equipe');
  if (eq.status === 404) {
    test.info().annotations.push({ type: 'bloqueado', description: 'routes/portal-equipe.js (F0t) não montado' });
    test.skip(true, 'bloqueado: F0t não montada');
  }
  const C = await P.semearCurso(request);
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, admin.token);
  await page.goto(`${EAD}professor.html#/equipe`);
  await page.getByRole('button', { name: 'Adicionar à equipe' }).click();
  const email = `qa-prof-${P.uid('e')}@exemplo.invalid`;
  await page.getByLabel('E-mail *').fill(email);
  await page.getByLabel('Nome *').fill('Professora Criada pela Tela');
  await page.getByLabel(C.titulo).check();
  const rPost = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/portal/admin/equipe');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  expect((await rPost).status()).toBe(201);
  await expect(page.locator('.pf-prof-segredo, [data-pf-prof-segredo]')).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
  await expect(page.locator('main')).toContainText(email);
  await fechar(mon);
});

test('F8 · equipe › detalhe: Alterar e-mail com motivo e senha (reautenticação); senha errada fica no campo', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { professor, admin } = await P.criarPapeis(request);
  const r0 = await P.api(request, admin.token).get(`/api/portal/admin/usuarios/${professor.id}`);
  if (r0.status === 404 && !(r0.json && r0.json.usuario)) {
    test.info().annotations.push({ type: 'bloqueado', description: 'routes/portal-equipe.js (F0t) não montado' });
    test.skip(true, 'bloqueado: F0t não montada');
  }
  const mon = P.monitorarConsoleERede(page);
  P.esperar(page, { status: 400, url: `/api/portal/admin/usuarios/${professor.id}/email` });
  await P.entrarComToken(page, admin.token);
  await page.goto(`${EAD}professor.html#/equipe/${professor.id}`);
  await page.getByRole('button', { name: 'Alterar e-mail' }).click();
  const dlg = page.getByRole('dialog');
  const novo = `qa-novo-${P.uid('m')}@exemplo.invalid`;
  await dlg.getByLabel('Novo e-mail *').fill(novo);
  await dlg.getByLabel('Motivo (fica registrado na auditoria) *').fill('Troca pedida pela pessoa (teste F8).');
  await dlg.getByLabel('Senha atual').fill('senha-errada-de-proposito');
  await dlg.locator('[data-pf-acao="confirmar"]').click();
  await expect(dlg.getByText('Senha incorreta.')).toBeVisible();
  await dlg.getByLabel('Senha atual').fill(admin.senha);
  const rEmail = page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/portal/admin/usuarios/${professor.id}/email`);
  await dlg.locator('[data-pf-acao="confirmar"]').click();
  expect((await rEmail).status()).toBe(200);
  await expect(page.locator('main')).toContainText(novo);
  await fechar(mon);
});
