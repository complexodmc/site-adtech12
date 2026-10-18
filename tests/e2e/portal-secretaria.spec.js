// =============================================================
// E2E da F4a — turmas, matrículas e liberações (secretaria).
// Spec: PORTAL-ACADEMICO.md §8.5 (linha F4a), §8.6, §9.3 (R10, R12), D-49,
// D-74, D-78, D-79; PORTAL-API.md §6.8.1–§6.8.2, §8.1–§8.2; PORTAL-UX.md §7.4, §7.14.
//
// Roda no serve.mjs (mongod descartável; nunca complexodmc_local). A jornada
// pela API vale sempre; as telas dependem da hospedeira da F8 (professor.html
// + professor.js, P1f) e pulam com o motivo quando ela não estiver no disco.
//
//   QA_PORT=4654 QA_WORKERS=2 QA_DATA=<data>-f4a QA_FATIA=F4a \
//   PORTAL_MODULOS=routes/portal-turmas.js,routes/portal-professor.js \
//   PORTAL_MODULOS_IGNORAR=<os 9 módulos da F0t> \
//   npx playwright test tests/e2e/portal-secretaria.spec.js
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import * as P from './_portal.js';

const EAD = P.BASE_EAD;
const MAT_RE = /^MAT-\d{4}-[2-9A-HJ-NP-Z]{6}$/;
const HOSPEDEIRA = fs.existsSync(path.join(P.EAD_DISCO, 'professor.html')) && fs.existsSync(path.join(P.EAD_DISCO, 'js', 'portal', 'professor.js'));

test.describe.configure({ mode: 'parallel' });

/** A F4a está montada no servidor? (sem ela, as rotas novas respondem 404) */
async function exigirF4a(request, admin) {
  const r = await P.api(request, admin.token).get('/api/portal/admin/turmas');
  if (r.status === 404) {
    test.info().annotations.push({ type: 'bloqueado', description: 'routes/portal-turmas.js não montado (PORTAL_MODULOS sem a F4a)' });
    test.skip(true, 'bloqueado: F4a não montada');
  }
  expect(r.status, JSON.stringify(r.json)).toBe(200);
}

async function fechar(mon) {
  await mon.anexar('console-e-rede');
  await mon.verificar({ tipos: ['pageerror', 'resposta'], rotulo: 'pageerror e respostas' });
}

// ---------------------------------------------------------------
// Jornada pela API (servidor real, banco descartável)
// ---------------------------------------------------------------
test('F4a · API: turma, liberação → matrícula materializada, enturmação, trancamento; legado inalterado', async ({ request }) => {
  await P.exigirMongo(request);
  const { aluno, professor, admin } = await P.criarPapeis(request);
  await exigirF4a(request, admin);
  const A = P.api(request, admin.token);
  const C = await P.semearCurso(request, { aulas: [{}, {}] });

  // Turma (código explícito; o curso semeado não tem sigla).
  const codigo = `QA-${C.cursoId.slice(-6).toUpperCase()}`;
  const t = await A.post('/api/portal/admin/turmas', { cursoId: C.cursoId, codigo, inicio: '2026-11-03', modalidade: 'hibrido' });
  expect(t.status, JSON.stringify(t.json)).toBe(201);
  expect(t.json.turma).toMatchObject({ codigo, cursoId: C.cursoId, modalidade: 'hibrido', status: 'planejada', alunos: 0 });
  const dup = await A.post('/api/portal/admin/turmas', { cursoId: C.cursoId, codigo, inicio: '2026-11-03', modalidade: 'gravado' });
  expect([dup.status, dup.json.codigo]).toEqual([409, 'codigo-em-uso']);

  // Liberação pelo legado (R12): resposta de hoje + matrícula criada.
  const lib = await A.post('/api/liberacoes', { email: aluno.email, cursoIds: [C.cursoId] });
  expect([lib.status, lib.json]).toEqual([200, { ok: true, liberados: 1 }]);
  const lista = await A.get(`/api/portal/admin/matriculas?userId=${aluno.id}`);
  expect(lista.status).toBe(200);
  expect(lista.json.total).toBe(1);
  const m = lista.json.itens[0];
  expect(m.numero).toMatch(MAT_RE);
  expect(m).toMatchObject({ cursoId: C.cursoId, status: 'ativa', origem: 'liberacao', semAcesso: false, turma: null });
  const me = await P.api(request, aluno.token).get('/api/liberacoes/me');
  expect(me.json.cursoIds).toContain(C.cursoId);

  // Enturmação e trancamento (com motivo e versão).
  const ent = await A.put(`/api/portal/admin/matriculas/${m.id}/turma`, { turmaId: t.json.turma.id, versao: m.versao });
  expect(ent.status, JSON.stringify(ent.json)).toBe(200);
  expect(ent.json.matricula.turma.codigo).toBe(codigo);
  const tr = await A.put(`/api/portal/admin/matriculas/${m.id}/status`, { status: 'trancada', motivo: 'Trancamento pedido pelo aluno (QA).', versao: ent.json.matricula.versao });
  expect(tr.status, JSON.stringify(tr.json)).toBe(200);
  expect(tr.json.matricula.status).toBe('trancada');
  const invalida = await A.put(`/api/portal/admin/matriculas/${m.id}/status`, { status: 'concluida', motivo: 'Tentativa inválida (QA).', versao: tr.json.matricula.versao });
  expect([invalida.status, invalida.json.codigo]).toEqual([409, 'transicao-invalida']);

  // Revogar pelo legado não cancela: semAcesso.
  const del = await A.del(`/api/liberacoes?email=${encodeURIComponent(aluno.email)}&cursoId=${C.cursoId}`);
  expect([del.status, del.json]).toEqual([200, { ok: true, revogados: 1 }]);
  const depois = await A.get(`/api/portal/admin/matriculas/${m.id}`);
  expect(depois.json.matricula).toMatchObject({ status: 'trancada', semAcesso: true });
  expect(depois.json.matricula.historico.map((h) => h.status)).toEqual(['ativa', 'trancada']);

  // Sem DEV_SIMULAR_PAGAMENTO no serve.mjs, a simulação não existe (R10, D-49).
  const sim = await P.api(request, aluno.token).post('/api/liberacoes/dev/simular-pagamento', { cursoIds: [C.cursoId] });
  expect(sim.status).toBe(404);

  // Papéis: aluno e professor fora da coordenação; professor sem docência no curso.
  expect((await P.api(request, aluno.token).get('/api/portal/admin/matriculas')).status).toBe(403);
  expect((await P.api(request, professor.token).post('/api/portal/admin/turmas', { cursoId: C.cursoId, codigo: 'QA-NAO', inicio: '2026-11-03', modalidade: 'gravado' })).status).toBe(403);
  const semDoc = await P.api(request, professor.token).get(`/api/portal/professor/cursos/${C.cursoId}/turmas`);
  expect([semDoc.status, semDoc.json.codigo]).toEqual([403, 'nao-docente']);
  const adm = await A.get(`/api/portal/professor/cursos/${C.cursoId}/turmas`);
  expect(adm.json.itens.map((x) => x.codigo)).toEqual([codigo]);
});

test('F4a · API: matrícula manual (e-mail não confirmado pede motivo), liberarAcesso:false e sincronização idempotente', async ({ request }) => {
  await P.exigirMongo(request);
  const { aluno, admin } = await P.criarPapeis(request);
  await exigirF4a(request, admin);
  const A = P.api(request, admin.token);
  const C = await P.semearCurso(request);

  const r409 = await A.post('/api/portal/admin/matriculas', { email: aluno.email, cursoId: C.cursoId, liberarAcesso: false });
  expect([r409.status, r409.json.codigo]).toEqual([409, 'email-nao-verificado']);
  expect(r409.json.conta).toHaveProperty('criadaEm');
  const ok = await A.post('/api/portal/admin/matriculas', { email: aluno.email, cursoId: C.cursoId, liberarAcesso: false, confirmarSemVerificacao: true, motivo: 'Identidade conferida por telefone (QA).' });
  expect(ok.status, JSON.stringify(ok.json)).toBe(201);
  expect(ok.json).toMatchObject({ liberacaoCriada: false, matricula: { origem: 'admin', semAcesso: true, status: 'ativa' } });
  const libs = await P.api(request, aluno.token).get('/api/liberacoes/me');
  expect(libs.json.cursoIds).not.toContain(C.cursoId);
  const dup = await A.post('/api/portal/admin/matriculas', { email: aluno.email, cursoId: C.cursoId, confirmarSemVerificacao: true, motivo: 'Identidade conferida por telefone (QA).' });
  expect([dup.status, dup.json.codigo, dup.json.matriculaId]).toEqual([409, 'matricula-vigente-existe', ok.json.matricula.id]);

  // Liberação gravada direto no banco (como as antigas): sincronizar cria uma vez só.
  const outro = await P.criarUsuario(request);
  await P.liberarCurso(request, outro.id, C.cursoId);
  const s1 = await A.post('/api/portal/admin/matriculas/sincronizar', {});
  expect(s1.status).toBe(200);
  expect(s1.json.criadas).toBeGreaterThanOrEqual(1);
  const s2 = await A.post('/api/portal/admin/matriculas/sincronizar', {});
  expect(s2.json.criadas).toBe(0);
  const dele = await A.get(`/api/portal/admin/matriculas?userId=${outro.id}`);
  expect(dele.json.itens.map((x) => x.origem)).toEqual(['migracao']);
});

// ---------------------------------------------------------------
// Telas (professor.html, hospedeira da F8)
// ---------------------------------------------------------------
test('F4a · tela Matrículas: lista, Nova matrícula (com e-mail não confirmado), detalhe e Trancar', async ({ page, request }) => {
  test.skip(!HOSPEDEIRA, 'bloqueado: professor.html/professor.js (F8, P1f) ausentes');
  await P.exigirMongo(request);
  const { aluno, admin } = await P.criarPapeis(request);
  await exigirF4a(request, admin);
  const C = await P.semearCurso(request, { titulo: `Curso QA Secretaria ${Date.now().toString(36)}` });
  const mon = P.monitorarConsoleERede(page);
  await P.simularCliente(page);
  await P.entrarComToken(page, admin.token);

  await page.goto(`${EAD}professor.html#/matriculas`);
  await expect(page.getByRole('heading', { level: 1, name: 'Matrículas' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Matrículas/ })).toHaveAttribute('aria-selected', 'true');

  // Nova matrícula → 409 e-mail não confirmado → motivo → criada.
  mon.esperar({ status: 409, url: '/api/portal/admin/matriculas', metodo: 'POST' });
  await page.getByRole('button', { name: 'Nova matrícula' }).click();
  const painel = page.locator('[data-pf-sec-form="nova"]');
  await expect(page.getByRole('heading', { level: 2, name: 'Nova matrícula' })).toBeFocused();
  await painel.getByLabel('E-mail do aluno').fill(aluno.email);
  await painel.getByLabel('Curso').selectOption(C.cursoId);
  await painel.getByRole('button', { name: 'Matricular' }).click();
  await expect(painel.getByText('Esta conta ainda não confirmou o e-mail.')).toBeVisible();
  await painel.getByLabel(/Motivo/).fill('Identidade conferida pela coordenação (QA).');
  await painel.getByRole('button', { name: 'Matricular assim mesmo' }).click();
  await expect(page.getByText(/^Matrícula MAT-\d{4}-[2-9A-HJ-NP-Z]{6} criada\.$/)).toBeVisible();
  const linha = page.locator('[data-pf-sec-linha]').filter({ hasText: aluno.email });
  await expect(linha).toHaveCount(1);
  await expect(linha).toContainText(C.titulo);
  await expect(linha).toContainText('Manual');
  const numero = (await linha.locator('.pf-sec-numero').textContent()).trim();
  expect(numero).toMatch(MAT_RE);

  // Detalhe → Trancar com motivo.
  await linha.getByRole('link', { name: numero }).click();
  await expect(page.getByRole('heading', { level: 1, name: numero })).toBeVisible();
  await expect(page.getByText('Histórico de situação')).toBeVisible();
  await page.getByRole('button', { name: 'Trancar' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel(/Motivo/).fill('Trancamento a pedido do aluno (QA).');
  await dlg.getByRole('button', { name: 'Trancar' }).click();
  await expect(page.locator('section[aria-labelledby="pf-sec-dados"] .pf-sec-dados').getByText('Trancada')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Destrancar' })).toBeVisible();

  await fechar(mon);
});

test('F4a · tela Nova turma: cria a turma com código e volta às turmas', async ({ page, request }) => {
  test.skip(!HOSPEDEIRA, 'bloqueado: professor.html/professor.js (F8, P1f) ausentes');
  await P.exigirMongo(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  await exigirF4a(request, admin);
  const C = await P.semearCurso(request, { titulo: `Curso QA Turma ${Date.now().toString(36)}` });
  const mon = P.monitorarConsoleERede(page);
  await P.simularCliente(page);
  await P.entrarComToken(page, admin.token);

  await page.goto(`${EAD}professor.html#/turmas/nova?curso=${encodeURIComponent(C.cursoId)}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Nova turma' })).toBeVisible();
  const form = page.locator('[data-pf-sec-form="turma"]');
  await expect(form.getByLabel('Curso')).toHaveValue(C.cursoId);
  // Validação no cliente antes de enviar.
  await form.getByRole('button', { name: 'Criar turma' }).click();
  await expect(form.locator('[data-pf-sec-erro="codigo"]')).toBeVisible();
  const codigo = `QA-T-${Date.now().toString(36).toUpperCase().slice(-5)}`;
  await form.getByLabel('Código').fill(codigo);
  await form.getByLabel('Início').fill('2026-11-03');
  await form.getByLabel('Modalidade').selectOption('gravado');
  await form.getByRole('button', { name: 'Criar turma' }).click();
  await expect(page.getByText(`Turma ${codigo} criada.`)).toBeVisible();
  await expect(page).toHaveURL(/#\/turmas$/);
  const r = await P.api(request, admin.token).get(`/api/portal/admin/turmas?cursoId=${encodeURIComponent(C.cursoId)}`);
  expect(r.json.itens.map((t) => [t.codigo, t.modalidade, t.inicio])).toEqual([[codigo, 'gravado', '2026-11-03']]);

  await fechar(mon);
});

test('F4a · tela Matrículas: Conceder acesso cria a matrícula, Enturmar no detalhe e Gerar matrículas das liberações', async ({ page, request }) => {
  test.skip(!HOSPEDEIRA, 'bloqueado: professor.html/professor.js (F8, P1f) ausentes');
  await P.exigirMongo(request);
  const { aluno, admin } = await P.criarPapeis(request);
  await exigirF4a(request, admin);
  const C = await P.semearCurso(request, { titulo: `Curso QA Acesso ${Date.now().toString(36)}` });
  const codigo = `QA-E-${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const t = await P.api(request, admin.token).post('/api/portal/admin/turmas', { cursoId: C.cursoId, codigo, inicio: '2026-11-03', modalidade: 'gravado' });
  expect(t.status).toBe(201);
  const mon = P.monitorarConsoleERede(page);
  await P.simularCliente(page);
  await P.entrarComToken(page, admin.token);

  await page.goto(`${EAD}professor.html#/matriculas`);
  await page.getByRole('button', { name: 'Conceder acesso' }).click();
  const form = page.locator('[data-pf-sec-form="conceder"]');
  await form.getByLabel('E-mail do aluno').fill(aluno.email);
  await form.getByLabel(C.titulo).check();
  await form.getByRole('button', { name: 'Liberar acesso' }).click();
  await expect(page.getByText('Acesso liberado em 1 curso(s).')).toBeVisible();
  const linha = page.locator('[data-pf-sec-linha]').filter({ hasText: aluno.email });
  await expect(linha).toContainText('Liberação de acesso');
  await expect(linha).toContainText('Sem turma');

  // Detalhe → Enturmar.
  await linha.locator('.pf-sec-numero').click();
  await page.getByRole('button', { name: 'Enturmar' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Turma').selectOption({ label: codigo });
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Turma atualizada.')).toBeVisible();
  await expect(page.locator('section[aria-labelledby="pf-sec-dados"] .pf-sec-dados')).toContainText(codigo);

  // Acessos sem matrícula: liberação antiga gravada direto no banco → Gerar.
  const antigo = await P.criarUsuario(request);
  await P.liberarCurso(request, antigo.id, C.cursoId);
  await page.goto(`${EAD}professor.html#/matriculas?aba=sem-matricula`);
  await expect(page.getByRole('tab', { name: /Acessos sem matrícula/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-pf-sec-sem-lista]')).toContainText(antigo.email);
  await page.getByRole('button', { name: 'Gerar matrículas a partir das liberações' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Gerar matrículas' }).click();
  await expect(page.locator('[data-pf-sec-resultado]')).toHaveText(/^\d+ criada\(s\) · \d+ já existiam$/);
  const r = await P.api(request, admin.token).get(`/api/portal/admin/matriculas?userId=${antigo.id}`);
  expect(r.json.itens.map((x) => x.origem)).toEqual(['migracao']);

  await fechar(mon);
});
