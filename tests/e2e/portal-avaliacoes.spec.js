// =============================================================
// E2E da F2 — avaliações (aluno no player; professor em professor.html).
// Spec: PORTAL-ACADEMICO.md §8.5 (linha F2), §8.6, D-74; PORTAL-UX.md §6.4, §7.6, §7.7.
//
// Roda no serve.mjs (mongod descartável). Matrícula e docência são semeadas no banco
// descartável (as rotas da F4a/F0t não são dependência de E2E da F2).
//
//   QA_PORT=4651 QA_WORKERS=2 QA_FATIA=F2 QA_DATA=<data>-f2 \
//   PORTAL_MODULOS=routes/portal-avaliacoes.js,routes/portal-conteudo.js \
//   npx playwright test tests/e2e/portal-avaliacoes.spec.js
// =============================================================
import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as P from './_portal.js';

const EAD = P.BASE_EAD;
const SEGREDOS = /"(corretaId|explicacao|respostaReferencia)"/;

async function fechar(mon) {
  await mon.anexar('console-e-rede');
  await mon.verificar({ tipos: ['pageerror', 'resposta'], rotulo: 'pageerror e respostas' });
}

/** Professor (docência geral), aluno (liberação + matrícula ativa) e um curso de 1 módulo. */
async function cenario(request) {
  const prof = await P.criarUsuario(request, { papel: 'professor' });
  const aluno = await P.criarUsuario(request);
  const C = await P.semearCurso(request, { aulas: [{}, {}] });
  await P.liberarCurso(request, aluno.id, C.cursoId);
  const agora = new Date();
  await P.comBanco(request, async (db) => {
    await db.collection('docencias').insertOne({ userId: prof.id, cursoId: C.cursoId, turmaId: null, criadoEm: agora, criadoPor: 'qa-semente' });
    await db.collection('matriculas').insertOne({
      numero: `MAT-2026-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, userId: aluno.id, cursoId: C.cursoId, turmaId: null,
      status: 'ativa', vigente: true, inicioEm: agora, origem: 'liberacao', contratoId: null, enturmacoes: [],
      historico: [{ status: 'ativa', em: agora, por: 'qa-semente' }], versao: 1, criadoEm: agora, atualizadoEm: agora
    });
  });
  return { prof, aluno, C };
}

/** Avaliação publicada pela API do professor (o caminho de tela é coberto no caso do professor). */
async function avaliacaoPublicada(request, prof, moduloId, { tipo = 'modular', objetivas = 2, dissertativas = 0, sorteio = null, tentativasMax = 2, tempoLimiteMin = null } = {}) {
  const api = P.api(request, prof.token);
  const r = await api.post(`/api/portal/professor/modulos/${moduloId}/avaliacoes`, {
    tipo, titulo: tipo === 'modular' ? 'Atividade modular de QA' : 'Atividade prévia de QA', instrucoes: 'Responda com atenção.',
    sorteio: sorteio || { objetivas, dissertativas }, tentativasMax, tempoLimiteMin, embaralharAlternativas: false
  });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  const id = r.json.avaliacao.id;
  for (let i = 0; i < objetivas; i++) {
    const q = await api.post(`/api/portal/professor/avaliacoes/${id}/questoes`, {
      tipo: 'objetiva', enunciado: `Pergunta objetiva ${i + 1} de QA`, alternativas: [{ texto: 'Alternativa errada' }, { texto: 'Alternativa certa' }, { texto: 'Outra errada' }],
      corretaId: 'b', explicacao: `Comentário do gabarito ${i + 1}.`
    });
    expect(q.status, JSON.stringify(q.json)).toBe(201);
  }
  for (let i = 0; i < dissertativas; i++) {
    const q = await api.post(`/api/portal/professor/avaliacoes/${id}/questoes`, {
      tipo: 'dissertativa', enunciado: `Pergunta dissertativa ${i + 1} de QA`, orientacao: 'Responda em até 300 caracteres.', limiteCaracteres: 300, respostaReferencia: 'Texto de referência de QA', pontos: 2
    });
    expect(q.status, JSON.stringify(q.json)).toBe(201);
  }
  const p = await api.post(`/api/portal/professor/avaliacoes/${id}/publicar`, {});
  expect(p.status, JSON.stringify(p.json)).toBe(200);
  return id;
}

/** Abre a avaliação no player (hospedeiro da F1b) e espera o componente. */
async function abrirNoPlayer(page, C, avaliacaoId) {
  await page.goto(`${EAD}aula.html?curso=${encodeURIComponent(C.cursoId)}&modulo=${encodeURIComponent(C.moduloId)}&item=${encodeURIComponent(`avaliacao:${avaliacaoId}`)}`);
  const raiz = page.locator('.pf-av');
  await expect(raiz).toBeVisible({ timeout: 15_000 });
  await expect(raiz).toHaveAttribute('aria-busy', 'false');
  return raiz;
}

/** Responde a tentativa aberta na tela: `certas` = quantas objetivas acertar (alternativa B). */
async function responderNaTela(page, { certas = 99, texto = 'Resposta dissertativa escrita no teste.' } = {}) {
  await expect(page.locator('[data-av-posicao]')).toHaveText(/^Questão 1 de \d+$/);
  let acertos = 0;
  for (;;) {
    const fieldset = page.locator('fieldset.pf-av-questao');
    const texto_ = page.locator('textarea[data-av-texto]');
    if (await fieldset.count()) {
      const letra = acertos < certas ? 'B' : 'A';
      if (letra === 'B') acertos++;
      await fieldset.locator('label.pf-av-alternativa', { hasText: letra === 'B' ? 'Alternativa certa' : 'Alternativa errada' }).click();
      await expect(page.locator('[data-av-salvo]')).toContainText('Salvo às');
    } else if (await texto_.count()) {
      await texto_.fill(texto);
      await expect(page.locator('[data-av-contador]')).toContainText(`${texto.length} de 300 caracteres`);
    }
    const proxima = page.locator('[data-av="proxima"]');
    if (await proxima.count()) { await proxima.click(); continue; }
    break;
  }
  await page.locator('[data-av="revisar"]').click();
  await expect(page.getByRole('heading', { name: /Revisão da tentativa/ })).toBeFocused();
}

async function enviarNaTela(page) {
  await P.confirmarNaTela(page, () => page.locator('[data-av="enviar"]').click());
  await expect(page.locator('[data-av-resultado]')).toBeVisible();
}

test.describe.configure({ mode: 'parallel' });

test('F2 · aluno: avisos → tentativa → resultado → melhorar nota → finalizar e ver gabarito (sem gabarito antes)', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { prof, aluno, C } = await cenario(request);
  const avId = await avaliacaoPublicada(request, prof, C.moduloId, { objetivas: 2, tentativasMax: 2 });
  const mon = P.monitorarConsoleERede(page);
  const vazamentos = [];
  let finalizou = false;
  page.on('response', async (r) => {
    if (finalizou || !/\/api\/portal\/(avaliacoes|tentativas)\//.test(r.url())) return;
    try { const t = await r.text(); if (SEGREDOS.test(t)) vazamentos.push(r.url()); } catch { /* corpo indisponível */ }
  });
  await P.entrarComToken(page, aluno.token);
  const raiz = await abrirNoPlayer(page, C, avId);

  // Apresentação: avisos importantes com os valores do servidor.
  // No player, overline e título são do hospedeiro (sem repetição); o componente traz o tipo.
  await expect(raiz.locator('.pf-av-overline')).toHaveCount(0);
  await expect(raiz.getByRole('heading', { level: 2 })).toContainText('Atividade modular');
  await expect(raiz.locator('.pf-av-tipo')).toHaveText('Conta para a nota do módulo. Nota mínima: 7,0.');
  const avisos = raiz.locator('.pf-av-avisos');
  await expect(avisos).toContainText('Tentativas');
  await expect(avisos).toContainText('2 de 2 disponíveis');
  await expect(avisos).toContainText('Livre');
  await expect(avisos).toContainText('2 questões, sorteadas a cada tentativa');

  // Tentativa 1: uma certa, uma errada → 5,0 (em recuperação).
  await raiz.getByRole('button', { name: 'Iniciar tentativa 1 de 2' }).click();
  await expect(raiz.locator('[data-av-posicao]')).toHaveText('Questão 1 de 2');
  await expect(raiz.locator('[data-av-cronometro]')).toHaveCount(0); // tempo livre: sem cronômetro
  await responderNaTela(page, { certas: 1 });
  await enviarNaTela(page);
  await expect(raiz.locator('.pf-av-donut')).toHaveAttribute('aria-label', 'Acerto: 50%');
  await expect(raiz).toContainText('Você acertou 1 de 2 questões objetivas.');
  await expect(raiz.locator('.pf-av-resultado__texto .pf-av-meta').first()).toContainText(/Início \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2} · Fim \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/);
  await expect(raiz.locator('.pf-av-situacao')).toContainText('Em recuperação');
  const academico = raiz.getByRole('link', { name: 'Confira sua nota no Acadêmico →' });
  expect(await academico.getAttribute('href')).toMatch(new RegExp(`^academico\\.html\\?m=[a-f0-9]{24}#modulo-${C.moduloId}$`));
  // Nota abaixo da mínima com tentativas → "Melhorar nota" é o primário.
  const melhorar = raiz.locator('[data-av="melhorar"]');
  await expect(melhorar).toHaveClass(/dmc-btn--primary/);

  // Tentativa 2: tudo certo → 10,0 (aprovado); sem tentativas, "Melhorar nota" inativo com motivo.
  await melhorar.click();
  await expect(raiz.locator('[data-av-posicao]')).toHaveText('Questão 1 de 2');
  await responderNaTela(page, { certas: 2 });
  await enviarNaTela(page);
  await expect(raiz.locator('.pf-av-donut')).toHaveAttribute('aria-label', 'Acerto: 100%');
  await expect(raiz.locator('.pf-av-situacao')).toContainText('Aprovado no módulo');
  await expect(raiz.locator('[data-av="melhorar"]')).toBeDisabled();
  await expect(raiz.locator('#pf-av-motivo-melhorar')).toHaveText('Você usou as 2 tentativas.');
  await expect(raiz.locator('.pf-av-historico tbody tr')).toHaveCount(2);
  expect(vazamentos, 'gabarito antes de finalizar').toEqual([]);

  // Finalizar e ver gabarito: texto obrigatório da API na confirmação.
  const dialogoOk = page.waitForSelector('[data-pf-acao="confirmar"]');
  await raiz.locator('[data-av="finalizar"]').click();
  await dialogoOk;
  await expect(page.getByRole('dialog')).toContainText('Ao finalizar, você não poderá fazer novas tentativas. Sua nota será a maior obtida até agora (10,0).');
  finalizou = true;
  await page.locator('[data-pf-acao="confirmar"]').click();
  await expect(raiz.locator('[data-av-gabarito]')).toBeVisible();
  await expect(raiz.locator('.pf-av-gabarito__alt.is-correta')).toHaveCount(2);
  await expect(raiz.locator('.pf-av-gabarito__item').first()).toContainText('Resposta correta');
  await expect(raiz).toContainText('Comentário do gabarito');
  await expect(raiz).not.toContainText('Texto de referência');
  await fechar(mon);
});

test('F2 · aluno: tempo controlado pelo servidor (cronômetro role=timer, confirmação de início) e teclado', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { prof, aluno, C } = await cenario(request);
  const avId = await avaliacaoPublicada(request, prof, C.moduloId, { tipo: 'previa', objetivas: 1, tentativasMax: 1, tempoLimiteMin: 5 });
  const mon = P.monitorarConsoleERede(page);
  await page.clock.install();
  await P.entrarComToken(page, aluno.token);
  const raiz = await abrirNoPlayer(page, C, avId);
  await expect(raiz.locator('.pf-av-tipo')).toHaveText('Não conta para a nota.');
  await expect(raiz.locator('.pf-av-avisos')).toContainText('5 minutos a partir do início');
  // Só teclado: foco no botão e Enter.
  await raiz.getByRole('button', { name: 'Iniciar tentativa 1 de 1' }).focus();
  await page.keyboard.press('Enter');
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toContainText('O cronômetro começa ao confirmar e não pausa se você sair da página.');
  await expect(page.locator('[data-pf-acao="cancelar"]')).toBeFocused();
  await page.locator('[data-pf-acao="confirmar"]').click();
  const timer = raiz.getByRole('timer');
  await expect(timer).toBeVisible();
  await expect(timer).toContainText(/0[45]:\d{2}/);
  // Alternativa por teclado (setas + espaço no grupo de rádio).
  const radio = raiz.locator('input.pf-av-alternativa__radio').first();
  await radio.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-av-salvo]')).toContainText('Salvo às');
  // Anúncios do cronômetro (role=status, sem aria-live no timer): 5 min logo no início e 1 min no fim.
  // Com DMC_UI.anunciar (núcleo F0b) o texto vai para a região viva global #pf-anuncio-polido;
  // sem ele, avaliacao.js degrada para o [data-av-anuncio] local do bloco.
  const anuncioGlobal = await page.evaluate(() => !!(window.DMC_UI && typeof window.DMC_UI.anunciar === 'function'));
  const anuncio = anuncioGlobal ? page.locator('#pf-anuncio-polido') : raiz.locator('[data-av-anuncio]');
  await expect(anuncio).toHaveText('Restam 5 minutos.');
  await expect(anuncio).toHaveAttribute('role', 'status');
  await page.clock.fastForward('04:02');
  await expect(anuncio).toHaveText('Resta 1 minuto.');
  await expect(timer).toHaveClass(/pf-av-cronometro--erro/);
  await expect(timer).toContainText('Restam 1 min');
  await fechar(mon);
});

test('F2 · professor: lista, criar, banco (nova questão pela tela), publicar com checklist e prévia sem gravar', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { prof, C } = await cenario(request);
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, prof.token);
  await page.goto(`${EAD}professor.html#/avaliacoes`);
  const painel = page.locator('#pf-prof-painel');
  await expect(painel).toContainText('Cada módulo pode ter uma atividade prévia');
  // Curso semeado é o único da docência: tabela com prévia e modular "Sem avaliação".
  await expect(painel.locator('tbody tr')).toHaveCount(2);
  await painel.getByRole('button', { name: /Criar.*Atividade modular/ }).click();
  await expect(page).toHaveURL(/#\/avaliacoes\/[a-f0-9]{24}\/configuracao$/);
  const avId = page.url().match(/avaliacoes\/([a-f0-9]{24})/)[1];
  await expect(painel.locator('[data-av-config]')).toBeVisible();
  await painel.locator('input[name="titulo"]').fill('Avaliação modular criada pela tela');
  await painel.getByRole('button', { name: 'Salvar configuração' }).click();
  await expect(painel.locator('input[name="titulo"]')).toHaveValue('Avaliação modular criada pela tela');

  // Banco: nova questão objetiva pela tela.
  await painel.getByRole('link', { name: /Banco de questões/ }).click();
  await expect(painel).toContainText('Banco vazio');
  await painel.getByRole('link', { name: 'Nova questão' }).click();
  const form = painel.locator('[data-questao-form]');
  await form.locator('textarea[name="enunciado"]').fill('Qual alternativa está correta?');
  await form.getByLabel('Texto da alternativa A').fill('Primeira opção');
  await form.getByLabel('Texto da alternativa B').fill('Segunda opção');
  await form.getByRole('button', { name: 'Salvar questão' }).click();
  await expect(form.locator('[data-erro="corretaId"]')).toHaveText('Marque a alternativa correta.');
  await form.locator('input[name="correta"][value="b"]').check();
  await form.getByRole('button', { name: 'Salvar questão' }).click();
  await expect(page).toHaveURL(new RegExp(`#/avaliacoes/${avId}/questoes$`));
  await expect(painel.locator('tbody tr')).toHaveCount(1);

  // Publicar: checklist calculado e confirmação.
  await painel.locator('[data-av-publicar]').click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('Objetivas: 1 ativas para 1 por tentativa');
  await expect(dlg).toContainText('Os alunos do curso recebem uma notificação.');
  await page.locator('[data-pf-acao="confirmar"]').click();
  await expect(painel.locator('.pf-av-linha').first()).toContainText('Publicada');

  // Prévia: sorteio na hora, nada gravado.
  await painel.getByRole('link', { name: 'Pré-visualizar como aluno' }).click();
  await expect(painel.locator('.pf-av-faixa-previa')).toContainText('Pré-visualização — nada é registrado.');
  await painel.getByRole('button', { name: 'Começar a prévia' }).click();
  await expect(painel.locator('[data-av-posicao]')).toHaveText('Questão 1 de 1');
  const total = await P.comBanco(request, (db) => db.collection('tentativas').countDocuments({ cursoId: C.cursoId }));
  expect(total).toBe(0);
  await fechar(mon);
});

test('F2 · correção: dissertativa vai à fila, rascunho invisível ao aluno, efeito simulado e publicação', async ({ page, request, browser }) => {
  await P.exigirMongo(request);
  const { prof, aluno, C } = await cenario(request);
  const avId = await avaliacaoPublicada(request, prof, C.moduloId, { objetivas: 1, dissertativas: 1, tentativasMax: 2 });
  // Aluno faz pela tela.
  const ctxAluno = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const pa = await ctxAluno.newPage();
  await P.entrarComToken(pa, aluno.token);
  const raiz = await abrirNoPlayer(pa, C, avId);
  await raiz.getByRole('button', { name: 'Iniciar tentativa 1 de 2' }).click();
  await responderNaTela(pa, { certas: 1, texto: 'Minha resposta dissertativa de teste.' });
  await enviarNaTela(pa);
  await expect(raiz.locator('.pf-av-situacao')).toContainText('Aguardando correção');
  await expect(raiz).toContainText('1 questão dissertativa aguarda correção do professor.');

  // Professor corrige.
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, prof.token);
  await page.goto(`${EAD}professor.html#/correcao`);
  const painel = page.locator('#pf-prof-painel');
  await expect(painel.getByRole('button', { name: /A corrigir \(1\)/ })).toHaveAttribute('aria-pressed', 'true');
  await painel.getByRole('link', { name: /Corrigir/ }).click();
  await expect(painel.locator('[data-pos]')).toHaveText('Questão 1 de 1');
  await expect(painel).toContainText('Minha resposta dissertativa de teste.');
  await painel.locator('input[name="pontos"]').fill('1.5');
  await painel.locator('textarea[name="comentario"]').fill('Faltou fundamentar.');
  await painel.getByRole('button', { name: 'Salvar e ver resumo' }).click();
  // 1 objetiva (1 pt) + 1,5 de 2 = 2,5/3 → 8,3; aprovado no módulo (simulado).
  await expect(painel).toContainText('Nota da tentativa: 8,3');
  await expect(painel).toContainText('fica Aprovado');
  // Rascunho: o aluno ainda não vê nada.
  await pa.reload();
  await expect(pa.locator('.pf-av-situacao')).toContainText('Aguardando correção');
  await painel.getByRole('button', { name: 'Publicar correção' }).click();
  await expect(painel).toContainText('Correção publicada em');
  await pa.reload();
  await expect(pa.locator('.pf-av-resultado__texto')).toContainText('nota 8,3');
  await expect(pa.locator('.pf-av-situacao')).toContainText('Aprovado no módulo');

  // Resultados da avaliação e concessão de nova tentativa (motivo obrigatório, auditada).
  await page.goto(`${EAD}professor.html#/avaliacoes/${avId}/resultados`);
  await expect(painel.locator('.pf-av-kpi', { hasText: 'Média das melhores notas' })).toContainText('8,3');
  await expect(painel.locator('tbody tr')).toHaveCount(1);
  await painel.getByRole('button', { name: /Conceder tentativa/ }).click();
  const motivo = page.locator('dialog textarea[name="motivo"]');
  await expect(motivo).toBeVisible();
  await motivo.fill('Instabilidade de conexão relatada pelo aluno.');
  await page.locator('[data-pf-acao="confirmar"]').click();
  await expect(painel.locator('tbody tr')).toContainText('1 de 3');
  const aud = await P.comBanco(request, (db) => db.collection('auditoria').countDocuments({ acao: 'tentativa.concedida' }));
  expect(aud).toBeGreaterThan(0);
  await pa.reload();
  await expect(pa.locator('.pf-av-alerta--info')).toContainText('Uma nova tentativa foi liberada para você.');
  await ctxAluno.close();
  await fechar(mon);
});

test('F2 · acessibilidade: avaliação no player e lista do professor sem violações sérias (axe)', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { prof, aluno, C } = await cenario(request);
  const avId = await avaliacaoPublicada(request, prof, C.moduloId, { objetivas: 1, dissertativas: 1 });
  // Tema claro primeiro (papel DMC), depois o escuro padrão; 1440 e 390 em cada um.
  await P.entrarComToken(page, aluno.token, { 'dmc:tema': 'claro' });
  await abrirNoPlayer(page, C, avId);
  for (const largura of [1440, 390]) {
    await page.setViewportSize({ width: largura, height: 900 });
    const r = await new AxeBuilder({ page }).include('.pf-av').analyze();
    expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.length}`), `axe claro ${largura}`).toEqual([]);
  }
  await P.entrarComToken(page, aluno.token, { 'dmc:tema': 'escuro' });
  const raiz = await abrirNoPlayer(page, C, avId);
  for (const largura of [1440, 390]) {
    await page.setViewportSize({ width: largura, height: 900 });
    const r = await new AxeBuilder({ page }).include('.pf-av').analyze();
    const graves = r.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(graves.map((v) => `${v.id}: ${v.nodes.length}`), `axe escuro ${largura}`).toEqual([]);
  }
  await raiz.getByRole('button', { name: /Iniciar tentativa/ }).click();
  await expect(raiz.locator('[data-av-posicao]')).toBeVisible();
  const r2 = await new AxeBuilder({ page }).include('.pf-av').analyze();
  expect(r2.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id), 'axe em andamento').toEqual([]);
  const largura = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(largura, 'sem rolagem horizontal em 390').toBe(false);

  await P.entrarComToken(page, prof.token);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${EAD}professor.html#/avaliacoes/${avId}/questoes`);
  await expect(page.locator('#pf-prof-painel tbody tr')).toHaveCount(2);
  const r3 = await new AxeBuilder({ page }).include('#pf-prof-painel').analyze();
  expect(r3.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id), 'axe banco do professor').toEqual([]);
});
