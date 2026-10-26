// =============================================================
// E2E da F3a — acadêmico e frequência (fonte única), encontros ao vivo com
// presença automática e comprovantes imprimíveis.
// Spec: PORTAL-ACADEMICO.md §8.5 (linha F3a), §8.6, §9.3 (R8); PORTAL-API.md
// §6.7.2–§6.7.4, §8.5–§8.8; PORTAL-UX.md §6.5, §6.6, §6.11, §12.
//
// Roda no serve.mjs (mongod descartável; nunca complexodmc_local). A semente
// grava turma e matrícula direto no banco descartável (a F3a não depende da
// F4a no E2E, índice §8.4); com a F4a montada, a matrícula semeada é a vigente
// e nada é duplicado (índice único uq_matriculas_vigente).
//
//   QA_PORT=4652 QA_WORKERS=2 QA_DATA=<data>-f3a QA_FATIA=F3a \
//   PORTAL_MODULOS=routes/portal-academico.js,routes/portal-encontros.js \
//   PORTAL_MODULOS_IGNORAR=<os 9 módulos da F0t> \
//   npx playwright test tests/e2e/portal-academico.spec.js
// =============================================================
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { ObjectId } from 'mongodb';
import * as P from './_portal.js';

const EAD = P.BASE_EAD;
const FRQ_RE = /^FRQ(-[2-9A-HJ-NP-Z]{4}){3}$/;
const SALA = 'https://sala.exemplo.invalid';

test.describe.configure({ mode: 'parallel' });

async function fechar(mon) {
  await mon.anexar('console-e-rede');
  await mon.verificar({ tipos: ['pageerror', 'resposta'], rotulo: 'pageerror e respostas' });
}

/** A F3a está montada? (sem ela, as rotas novas respondem 404) */
async function exigirF3a(request, token) {
  const r = await P.api(request, token).get('/api/portal/me/academico');
  if (r.status === 404) {
    test.info().annotations.push({ type: 'bloqueado', description: 'routes/portal-academico.js não montado (PORTAL_MODULOS sem a F3a)' });
    test.skip(true, 'bloqueado: F3a não montada');
  }
  expect(r.status, JSON.stringify(r.json)).toBe(200);
}

/**
 * Cenário: curso com 1 módulo e 3 aulas; aluno liberado, matriculado na turma; aula 1 concluída;
 * encontros (pela API do professor, como a coordenação): E1 agora (turma, aula gravada 3),
 * E2 daqui a 2 dias (curso inteiro), E3 há 3 dias (curso inteiro, aula gravada 2 → falta).
 */
async function semear(request) {
  await P.exigirMongo(request);
  const { aluno, professor, admin } = await P.criarPapeis(request);
  await exigirF3a(request, aluno.token);
  const C = await P.semearCurso(request, { aulas: [{}, {}, {}] });
  await P.liberarCurso(request, aluno.id, C.cursoId);
  const sufixo = crypto.randomBytes(3).toString('hex').toUpperCase();
  const turmaCodigo = `QA-F3A-${sufixo}`;
  const turmaId = new ObjectId();
  const matriculaId = new ObjectId();
  const numero = `MAT-2026-${Array.from(crypto.randomBytes(6), b => '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[b & 31]).join('')}`;
  const inicio = new Date(Date.now() - 10 * 864e5);
  await P.comBanco(request, async (db) => {
    await db.collection('turmas').insertOne({ _id: turmaId, cursoId: C.cursoId, codigo: turmaCodigo, nome: 'Turma QA F3a', inicio: '2026-10-01', fim: null, modalidade: 'hibrido', encerradaEm: null, versao: 1, criadoEm: new Date(), atualizadoEm: new Date(), criadoPor: 'qa-f3a' });
    await db.collection('matriculas').insertOne({
      _id: matriculaId, numero, userId: aluno.id, cursoId: C.cursoId, turmaId, status: 'ativa', vigente: true, inicioEm: inicio, origem: 'admin', contratoId: null,
      enturmacoes: [{ turmaId, turmaCodigo, de: inicio, ate: null, por: 'qa-f3a' }], historico: [{ status: 'ativa', em: inicio, por: 'qa-f3a' }],
      concluidaEm: null, canceladaEm: null, trancadaEm: null, resultadoFinal: null, certificadoCodigo: null, nomeEmDocumentos: null, versao: 1, criadoEm: inicio, atualizadoEm: inicio
    });
  });
  await P.concluirAulas(request, aluno.id, [C.aulas[0].id]);

  const A = P.api(request, admin.token);
  const criar = async (corpo) => {
    const r = await A.post('/api/portal/professor/encontros', { cursoId: C.cursoId, duracaoMin: 120, ...corpo });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    return r.json.encontro;
  };
  const E1 = await criar({ turmaId: String(turmaId), moduloId: C.moduloId, aulaGravadaId: C.aulas[2].id, titulo: `Sexta · noite ${sufixo}`, inicioEm: new Date(Date.now() - 5 * 60e3).toISOString(), url: `${SALA}/agora-${sufixo}` });
  const E2 = await criar({ titulo: `Sábado · manhã ${sufixo}`, inicioEm: new Date(Date.now() + 2 * 864e5).toISOString(), url: `${SALA}/futuro-${sufixo}` });
  const E3 = await criar({ moduloId: C.moduloId, aulaGravadaId: C.aulas[1].id, titulo: `Domingo · manhã ${sufixo}`, inicioEm: new Date(Date.now() - 3 * 864e5).toISOString(), url: `${SALA}/passado-${sufixo}` });
  return { aluno, professor, admin, C, turmaId: String(turmaId), turmaCodigo, matriculaId: String(matriculaId), numero, E1, E2, E3 };
}

test('F3a · jornada: agenda → Entrar registra presença → Acadêmico, Comprovantes e matriz com a MESMA frequência; impressão sem QR', async ({ page, request }) => {
  test.setTimeout(120_000);
  const s = await semear(request);
  const U = P.api(request, s.aluno.token);

  // Agenda pela API: url só na janela; encontro da turma com módulo e código da turma.
  const ag = await U.get(`/api/portal/agenda?cursoId=${s.C.cursoId}&de=${new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)}&ate=${new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)}`);
  expect(ag.status).toBe(200);
  const porId = Object.fromEntries(ag.json.itens.map(i => [i.id, i]));
  expect(porId[s.E1.id]).toMatchObject({ status: 'ao-vivo', podeEntrar: true });
  expect(porId[s.E1.id].url).toMatch(/^https:\/\/sala\.exemplo\.invalid\/agora-/);
  expect(porId[s.E1.id].turma.codigo).toBe(s.turmaCodigo);
  expect(porId[s.E2.id]).toMatchObject({ status: 'agendada', podeEntrar: false, url: null });
  expect(porId[s.E3.id]).toMatchObject({ status: 'encerrada', url: null });

  // Fora da janela → 409 explicado.
  const fora = await U.post(`/api/portal/encontros/${s.E2.id}/entrar`, {});
  expect([fora.status, fora.json.codigo]).toEqual([409, 'fora-da-janela']);

  // Tela: Lista com os três; o clique em Entrar abre a sala (nova aba) e registra a presença.
  const mon = P.monitorarConsoleERede(page);
  await page.context().route(`${SALA}/**`, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Sala QA</title><p>Sala de teste</p>' }));
  await P.entrarComToken(page, s.aluno.token, { 'dmc:aoVivo:visao': 'lista' });
  await page.goto(`${EAD}ao-vivo.html?curso=${s.C.cursoId}`);
  const lista = page.locator('#lives-lista');
  for (const e of [s.E1, s.E2, s.E3]) await expect(lista).toContainText(e.titulo);
  const entrar = lista.locator(`[data-ac-entrar="${s.E1.id}"]`);
  await expect(entrar).toHaveAttribute('target', '_blank');
  const [popup] = await Promise.all([page.context().waitForEvent('page'), entrar.click()]);
  await popup.close();
  await expect(lista.locator(`[data-ac-status="${s.E1.id}"]`)).toContainText('Presença registrada às');

  // Presença idempotente com selo.
  const r1 = await U.post(`/api/portal/encontros/${s.E1.id}/entrar`, {});
  expect(r1.status).toBe(200);
  expect(r1.json.presenca.codigo).toMatch(FRQ_RE);
  expect(r1.json.presenca.hash).toMatch(/^[a-f0-9]{64}$/);
  const r2 = await U.post(`/api/portal/encontros/${s.E1.id}/entrar`, {});
  expect(r2.json.presenca.codigo).toBe(r1.json.presenca.codigo);

  // Visões Semana e Mês (calendário próprio) abrem o diálogo do encontro.
  await page.locator('[data-ac-visao="semana"]').click();
  await expect(lista.locator(`[data-ac-abrir="${s.E1.id}"]`)).toBeVisible();
  await lista.locator(`[data-ac-abrir="${s.E1.id}"]`).click();
  await expect(page.locator('dialog.pf-ac-dialogo')).toContainText(s.turmaCodigo);
  await page.locator('dialog.pf-ac-dialogo [data-ac-fechar]').click();
  await page.locator('[data-ac-visao="mes"]').click();
  await expect(lista.locator('.pf-ac-mes')).toBeVisible();
  await page.locator('[data-ac-visao="lista"]').click();

  // Acadêmico (fonte única): o número da tela é o do servidor.
  const resumo = await U.get(`/api/portal/me/academico/${s.matriculaId}`);
  expect(resumo.status).toBe(200);
  expect(resumo.json.notaMinima).toBe(7);
  const k = resumo.json.kpis;
  // E1 presente, E3 falta (gravada 2 não concluída), aula 1 gravada; aulas 2 e 3 vinculadas a encontros.
  expect([k.frequenciaGeralPct, k.aoVivoPct, k.gravadoPct]).toEqual([66.7, 33.3, 33.4]);
  expect(resumo.json.linhas[0].frequencia.faltas).toBe(1);
  expect(resumo.json.kpis.mediaParcial).toBeNull();

  await page.goto(`${EAD}academico.html?m=${s.matriculaId}`);
  const card = page.locator(`#mat-${s.matriculaId}`);
  await expect(card).toContainText(s.numero);
  await expect(card).toContainText(s.turmaCodigo);
  await expect(card.locator('[data-ac-alternar]')).toHaveAttribute('aria-expanded', 'true');
  await expect(card.locator('.pf-kpis')).toContainText('66,7%');
  await expect(card.locator('.pf-kpis')).toContainText('Sem notas ainda');
  const linha = card.locator(`#modulo-${s.C.moduloId}`);
  await expect(linha).toContainText('ao vivo 33,3% · gravado 33,4%');
  await expect(card).toContainText('Nota mínima 7,0');
  await page.emulateMedia({ media: 'print' });
  await expect(card.locator('.pf-ac-desempenho')).toBeVisible();
  await expect(card.locator('[data-ac-alternar]')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.locator('#aba-historico').click();
  await expect(page.locator('#historico')).toContainText('Nenhuma matrícula encerrada.');

  // Comprovantes: a mesma frequência, com código e hash; impressão com a URL de validação e sem QR.
  const comp = await U.get(`/api/portal/me/comprovantes?cursoId=${s.C.cursoId}&tipo=frequencia`);
  expect(comp.status).toBe(200);
  const codigos = comp.json.itens.map(i => i.codigo);
  expect(codigos).toContain(r1.json.presenca.codigo);
  expect(comp.json.itens.every(i => FRQ_RE.test(i.codigo) && /^[a-f0-9]{64}$/.test(i.hash))).toBe(true);
  await page.goto(`${EAD}comprovantes.html?curso=${s.C.cursoId}`);
  const tabela = page.locator('#ac-comprovantes table');
  await expect(tabela).toContainText(r1.json.presenca.codigo);
  await expect(tabela.locator(`a[href="validar.html?codigo=${r1.json.presenca.codigo}"]`)).toHaveCount(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#ac-impressao-rodape')).toBeVisible();
  await expect(page.locator('#ac-impressao-rodape')).toContainText('/plataforma-ead/validar.html');
  await expect(page.locator('#ac-impressao-cabecalho')).toContainText(s.numero);
  await expect(page.locator('main svg.pf-qr, main .pf-qr, main [data-qr]')).toHaveCount(0);
  for (const c of codigos) await expect(tabela).toContainText(c);
  await page.emulateMedia({ media: 'screen' });

  // Matriz da turma (professor/coordenação): a MESMA conta.
  const A = P.api(request, s.admin.token);
  const m = await A.get(`/api/portal/professor/turmas/${s.turmaId}/frequencia`);
  expect(m.status).toBe(200);
  const al = m.json.alunos.find(x => x.matriculaId === s.matriculaId);
  expect(al.resumo.frequenciaPct).toBe(k.frequenciaGeralPct);
  expect(Object.fromEntries(al.celulas.map(c => [c.encontroId, c.estado]))).toMatchObject({ [s.E1.id]: 'presente', [s.E3.id]: 'falta', [s.E2.id]: 'futuro' });

  // O código de uma linha confere no despacho público (F3b), quando montado.
  const v = await P.api(request).get(`/api/portal/validar/${r1.json.presenca.codigo}`);
  // Sem a F3b montada, /portal/validar não existe: o agregador responde 401 (rota protegida) ou 404.
  if ((v.status === 404 || v.status === 401) && !(v.json && v.json.valido === false)) {
    test.info().annotations.push({ type: 'bloqueado', description: 'despacho público /portal/validar (F3b) não montado' });
  } else {
    expect(v.status).toBe(200);
    expect(v.json).toMatchObject({ valido: true, tipo: 'frequencia', integro: true, situacao: 'valido' });
  }

  await fechar(mon);
});

test('F3a · encontros: turma alheia 404, cancelado 409, DELETE com presença 409 (novo e legado), lives legado sem turma inalterado', async ({ request }) => {
  const s = await semear(request);
  const outro = await P.criarUsuario(request, { papel: 'aluno', rotulo: 'outro' });
  await P.liberarCurso(request, outro.id, s.C.cursoId);
  const O = P.api(request, outro.token);
  const A = P.api(request, s.admin.token);

  // Liberação sem matrícula (D5): vê só os encontros sem turma; E1 (da turma) → 404.
  const agO = await O.get(`/api/portal/agenda?cursoId=${s.C.cursoId}`);
  expect(agO.json.itens.some(i => i.id === s.E1.id)).toBe(false);
  expect((await O.post(`/api/portal/encontros/${s.E1.id}/entrar`, {})).status).toBe(404);
  const legadoO = await O.get('/api/lives');
  expect(legadoO.json.itens.map(i => i.id)).not.toContain(s.E1.id);
  expect(legadoO.json.itens.map(i => i.id)).toContain(s.E2.id);

  // Presença e bloqueio da exclusão.
  expect((await P.api(request, s.aluno.token).post(`/api/portal/encontros/${s.E1.id}/entrar`, {})).status).toBe(200);
  const del = await A.del(`/api/portal/professor/encontros/${s.E1.id}`);
  expect([del.status, del.json.codigo]).toEqual([409, 'tem-registros']);
  const delLegado = await A.del(`/api/lives/${s.E1.id}`);
  expect(delLegado.status).toBe(409);

  // Cancelar (auditado) → entrar 409.
  const c = await A.post(`/api/portal/professor/encontros/${s.E2.id}/cancelar`, { motivo: 'Sala indisponível (QA).' });
  expect(c.status, JSON.stringify(c.json)).toBe(200);
  expect(c.json.encontro.status).toBe('cancelada');

  // Edição com versão: 409 na versão velha; PUT legado não apaga turma/módulo.
  const ed = await A.put(`/api/portal/professor/encontros/${s.E3.id}`, { versao: 1, titulo: `${s.E3.titulo} (revisto)` });
  expect(ed.status, JSON.stringify(ed.json)).toBe(200);
  expect((await A.put(`/api/portal/professor/encontros/${s.E3.id}`, { versao: 1, titulo: 'Outro título QA' })).status).toBe(409);
  const leg = await A.put(`/api/lives/${s.E1.id}`, { cursoId: s.C.cursoId, titulo: `${s.E1.titulo} (legado)`, inicioEm: s.E1.inicioEm, url: `${SALA}/agora` });
  expect(leg.status).toBe(200);
  const ag = await P.api(request, s.aluno.token).get(`/api/portal/agenda?cursoId=${s.C.cursoId}`);
  const e1 = ag.json.itens.find(i => i.id === s.E1.id);
  expect(e1.turma.codigo).toBe(s.turmaCodigo);
  expect(e1.modulo.id).toBe(s.C.moduloId);
});

test('F3a · backoffice (professor.html): agendar encontro pela tela, abrir presenças e a matriz da turma', async ({ page, request }) => {
  test.skip(!fs.existsSync(path.join(P.EAD_DISCO, 'professor.html')) || !fs.existsSync(path.join(P.EAD_DISCO, 'js', 'portal', 'professor.js')), 'bloqueado: hospedeira da F8 (professor.html) ausente');
  test.setTimeout(120_000);
  const s = await semear(request);
  const mon = P.monitorarConsoleERede(page);
  // professor.html (F8) já referencia qr.js (F0b) e tutoriais.js (F0r), da fase 0, ainda ausentes no disco
  // (pedido registrado no relatório da F3a). Só esses dois 404 de asset ficam declarados aqui.
  for (const f of ['qr.js', 'tutoriais.js']) {
    if (!fs.existsSync(path.join(P.EAD_DISCO, 'js', 'portal', f))) P.esperar(page, { status: 404, url: new RegExp(`/js/portal/${f.replace('.', '\\.')}`) });
  }
  await P.entrarComToken(page, s.admin.token);
  await page.goto(`${EAD}professor.html#/ao-vivo/novo?curso=${encodeURIComponent(s.C.cursoId)}`);
  const form = page.locator('[data-ac-form]');
  await expect(form).toBeVisible();
  await form.locator('[name="cursoId"]').selectOption(s.C.cursoId);
  await expect(form.locator(`[name="turmaId"] option[value="${s.turmaId}"]`)).toHaveCount(1, { timeout: 10_000 }).catch(() => {});
  const amanha = new Date(Date.now() + 864e5 - 3 * 3600e3).toISOString().slice(0, 10);
  await form.locator('[name="inicioEm"]').fill(`${amanha}T19:00`);
  await form.locator('[name="titulo"]').fill(`Encontro pela tela ${s.turmaCodigo}`);
  await form.locator('[name="url"]').fill(`${SALA}/tela`);
  await form.locator('[type="submit"]').click();
  await expect(page).toHaveURL(/#\/ao-vivo\/live-[2-9A-HJ-NP-Z]{12}/);
  await expect(page.locator('main')).toContainText('Presenças');
  const ag = await P.api(request, s.admin.token).get(`/api/portal/agenda?cursoId=${s.C.cursoId}`);
  expect(ag.json.itens.some(i => i.titulo === `Encontro pela tela ${s.turmaCodigo}`)).toBe(true);

  await page.goto(`${EAD}professor.html#/ao-vivo/${s.E1.id}`);
  await expect(page.locator('main')).toContainText('Alunos esperados neste encontro');
  await page.goto(`${EAD}professor.html#/turmas/${s.turmaId}/frequencia`);
  await expect(page.locator('main')).toContainText(s.numero);
  await fechar(mon);
});

test('F3a · docência pelo GRAVADO: docente só de turma lê o encontro de curso inteiro, não gere (404) e a tela abre só leitura', async ({ page, request }) => {
  test.skip(!fs.existsSync(path.join(P.EAD_DISCO, 'professor.html')) || !fs.existsSync(path.join(P.EAD_DISCO, 'js', 'portal', 'professor.js')), 'bloqueado: hospedeira da F8 (professor.html) ausente');
  test.setTimeout(120_000);
  const s = await semear(request);
  // docência SÓ da turma semeada (PORTAL-API §6.7.2: curso inteiro só docente geral; §4.2)
  await P.comBanco(request, db => db.collection('docencias').insertOne({ userId: s.professor.id, cursoId: s.C.cursoId, turmaId: new ObjectId(s.turmaId), criadoEm: new Date(), criadoPor: 'qa-f3a' }));
  const D = P.api(request, s.professor.token);

  // leitura: agenda e GET do encontro de curso inteiro (E2, E3) com podeGerir:false
  const um = await D.get(`/api/portal/professor/encontros/${s.E2.id}`);
  expect(um.status, JSON.stringify(um.json)).toBe(200);
  expect(um.json.encontro.podeGerir).toBe(false);
  expect((await D.get(`/api/portal/professor/encontros/${s.E1.id}`)).json.encontro.podeGerir).toBe(true);
  // gestão: 404 e nada muda
  expect((await D.get(`/api/portal/professor/encontros/${s.E3.id}/presencas`)).status).toBe(404);
  expect((await D.post(`/api/portal/professor/encontros/${s.E3.id}/presencas`, { matriculaId: s.matriculaId, presente: true, motivo: 'Tentativa fora da docência (QA).' })).status).toBe(404);
  expect((await D.put(`/api/portal/professor/encontros/${s.E2.id}`, { versao: 1, url: 'https://site-externo.invalid/qa' })).status).toBe(404);
  expect((await D.post(`/api/portal/professor/encontros/${s.E2.id}/cancelar`, { motivo: 'Cancelamento indevido (QA).' })).status).toBe(404);
  expect((await D.del(`/api/portal/professor/encontros/${s.E2.id}`)).status).toBe(404);
  const e2 = (await P.api(request, s.admin.token).get(`/api/portal/professor/encontros/${s.E2.id}`)).json.encontro;
  expect([e2.url, e2.status, e2.versao]).toEqual([s.E2.url, s.E2.status, 1]);
  // a turma dele continua gerível
  expect((await D.get(`/api/portal/professor/encontros/${s.E1.id}/presencas`)).status).toBe(200);

  // tela: só leitura, sem pedir presenças (nenhum 404 no console e na rede)
  const mon = P.monitorarConsoleERede(page);
  for (const f of ['qr.js', 'tutoriais.js']) {
    if (!fs.existsSync(path.join(P.EAD_DISCO, 'js', 'portal', f))) P.esperar(page, { status: 404, url: new RegExp(`/js/portal/${f.replace('.', '\\.')}`) });
  }
  await P.entrarComToken(page, s.professor.token);
  await page.goto(`${EAD}professor.html#/ao-vivo/${s.E2.id}`);
  await expect(page.locator('[data-ac-somente-leitura]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('main')).toContainText('Curso inteiro (todas as turmas)');
  await expect(page.locator('[data-ac-form]')).toHaveCount(0);
  await expect(page.locator('[data-ac-cancelar], [data-ac-excluir], [data-ac-presenca]')).toHaveCount(0);
  await page.goto(`${EAD}professor.html#/ao-vivo/${s.E1.id}`);
  await expect(page.locator('main')).toContainText('Alunos esperados neste encontro');
  await expect(page.locator('[data-ac-form]')).toBeVisible();
  await fechar(mon);
});
