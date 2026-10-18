// Portal · F2 — rotas de avaliações pelo agregador real (montarPortal) com banco em memória.
// PORTAL-API §6.6, §8.11, §8.13, §9.3 (avaliacoes-rotas). Nenhum Mongo real, nenhuma rede.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ObjectId } from 'mongodb';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';

const { requireAuth, requireAdmin } = await import('../src/auth.js');
const M = await import('../src/portal/montar.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const { criarTratarErroGlobal } = await import('../src/portal/erros.js');
const { criarBancoMemoria } = await import('./apoio/banco-memoria.js');
const { semear, IDS, oid } = await import('./apoio/fixtures-portal.js');
const { subir, fechar, cliente, usuarioDeTeste } = await import('./apoio/http.js');
const { silencioso, relogio, pdfMinimo, pdfComJavascript } = await import('./apoio/falsos.js');

const CFG = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });
const MODULO_F2 = { caminho: 'routes/portal-avaliacoes.js', fatia: 'F2', importar: () => import('../src/routes/portal-avaliacoes.js') };
const SEGREDOS = ['corretaId', 'explicacao', 'respostaReferencia', 'REF-SECRETA', 'EXPL-SECRETA'];

function semSegredos(corpo, onde) {
  const json = JSON.stringify(corpo);
  for (const s of SEGREDOS) assert.ok(!json.includes(s), `${onde}: vazou "${s}"`);
}

async function subirF2({ agora = relogio('2026-10-18T12:00:00.000Z'), servicos = criarServicos() } = {}) {
  const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
  await semear(banco);
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: [MODULO_F2], configPortal: CFG, falharCedo: true, log: silencioso, agora
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  return { api: cliente(base), server, banco, servicos, agora, portal };
}

const PROF = { usuario: 'u-prof' };
const ADMIN = { usuario: 'u-admin' };
const A1 = { usuario: 'u-aluno1' };
const A2 = { usuario: 'u-aluno2' };

async function criarAvaliacao(api, { moduloId = 'c01-m01', tipo = 'modular', sorteio = { objetivas: 2, dissertativas: 0 }, tentativasMax = 2, tempoLimiteMin = null, objetivas = 3, dissertativas = 0, publicar = true, gabaritoLiberaEm = null } = {}) {
  const r = await api.post(`/api/portal/professor/modulos/${moduloId}/avaliacoes`, { tipo, titulo: `Atividade ${tipo}`, instrucoes: 'Leia com atenção.', sorteio, tentativasMax, tempoLimiteMin, embaralharAlternativas: true, gabaritoLiberaEm }, PROF);
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  const id = r.corpo.avaliacao.id;
  for (let i = 0; i < objetivas; i++) {
    const q = await api.post(`/api/portal/professor/avaliacoes/${id}/questoes`, {
      tipo: 'objetiva', enunciado: `Pergunta objetiva ${i + 1}`, alternativas: [{ id: 'x1', texto: 'Errada' }, { id: 'x2', texto: 'Certa' }, { id: 'x3', texto: 'Outra' }], corretaId: 'x2', explicacao: 'EXPL-SECRETA', pontos: 1
    }, PROF);
    assert.equal(q.status, 201, JSON.stringify(q.corpo));
    assert.equal(q.corpo.questao.corretaId, 'b');
  }
  for (let i = 0; i < dissertativas; i++) {
    const q = await api.post(`/api/portal/professor/avaliacoes/${id}/questoes`, {
      tipo: 'dissertativa', enunciado: `Pergunta dissertativa ${i + 1}`, orientacao: 'Até 200 caracteres.', limiteCaracteres: 200, respostaReferencia: 'REF-SECRETA', pontos: 2
    }, PROF);
    assert.equal(q.status, 201, JSON.stringify(q.corpo));
  }
  if (publicar) {
    const p = await api.post(`/api/portal/professor/avaliacoes/${id}/publicar`, {}, PROF);
    assert.equal(p.status, 200, JSON.stringify(p.corpo));
  }
  return id;
}

/** Responde todas as questões da tentativa; `acertar` objetivas pela leitura do snapshot no banco. */
async function responder(c, tentativaId, { acertar = true, texto = 'Minha resposta dissertativa.' } = {}, quem = A1) {
  const t = await c.banco.collection('tentativas').findOne({ _id: oid(tentativaId) });
  for (const q of t.questoes) {
    const corpo = q.tipo === 'objetiva'
      ? { questaoId: q.questaoId, alternativaId: acertar ? q.corretaId : q.alternativas.find(a => a.id !== q.corretaId).id }
      : { questaoId: q.questaoId, texto };
    const r = await c.api.put(`/api/portal/tentativas/${tentativaId}/respostas`, corpo, quem);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
  }
}

describe('avaliações · gestão e jornada objetiva', () => {
  let c;
  before(async () => { c = await subirF2(); });
  after(async () => { await fechar(c?.server); });

  test('montagem: rotas e serviços avaliacoes.* registrados', async () => {
    const s = await c.api.get('/api/portal/saude');
    assert.equal(s.corpo.modulos.carregados, 1);
    for (const n of ['avaliacoes.notaDoModulo', 'avaliacoes.resumoDoModulo', 'avaliacoes.tentativasDoAluno', 'avaliacoes.correcoesPendentes']) {
      assert.equal(typeof c.servicos.obter(n), 'function', n);
    }
    assert.ok(c.servicos.todos('validador').some(v => v.prefixo === 'AVL'));
  });

  test('401 sem login · 403 aluno nas rotas do professor · 403 professor sem docência geral cria', async () => {
    assert.equal((await c.api.get('/api/portal/avaliacoes/000000000000000000000000')).status, 401);
    assert.equal((await c.api.post('/api/portal/professor/modulos/c01-m01/avaliacoes', {}, A1)).status, 403);
    const r = await c.api.post('/api/portal/professor/modulos/c01-m01/avaliacoes', { tipo: 'previa', titulo: 'X', sorteio: { objetivas: 1 }, tentativasMax: 1 }, { usuario: 'u-prof-t1' });
    assert.equal(r.status, 403);
    assert.equal(r.corpo.codigo, 'nao-docente');
  });

  test('validação: título curto, composição vazia, objeto em campo de texto, arquivo fora do TCC', async () => {
    const base = { tipo: 'previa', titulo: 'Prévia', sorteio: { objetivas: 1 }, tentativasMax: 1 };
    let r = await c.api.post('/api/portal/professor/modulos/c01-m02/avaliacoes', { ...base, titulo: 'X' }, PROF);
    assert.equal(r.status, 400); assert.ok(r.corpo.campos.titulo);
    r = await c.api.post('/api/portal/professor/modulos/c01-m02/avaliacoes', { ...base, sorteio: { objetivas: 0 } }, PROF);
    assert.equal(r.status, 400);
    r = await c.api.post('/api/portal/professor/modulos/c01-m02/avaliacoes', { ...base, titulo: { $gt: '' } }, PROF);
    assert.equal(r.status, 400); assert.equal(r.corpo.codigo, 'formato-invalido');
    r = await c.api.post('/api/portal/professor/modulos/c01-m02/avaliacoes', { ...base, sorteio: { objetivas: 1, arquivos: 1 } }, PROF);
    assert.equal(r.status, 400); assert.equal(r.corpo.codigo, 'modulo-nao-tcc');
  });

  let avId;
  test('cria modular; 2ª modular no mesmo módulo → 409; publicar com banco insuficiente → 409; aluno não vê rascunho (404)', async () => {
    avId = await criarAvaliacao(c.api, { publicar: false, objetivas: 1 });
    const dup = await c.api.post('/api/portal/professor/modulos/c01-m01/avaliacoes', { tipo: 'modular', titulo: 'Outra modular', sorteio: { objetivas: 1 }, tentativasMax: 1 }, PROF);
    assert.equal(dup.status, 409);
    const p = await c.api.post(`/api/portal/professor/avaliacoes/${avId}/publicar`, {}, PROF);
    assert.equal(p.status, 409); assert.equal(p.corpo.codigo, 'banco-insuficiente');
    const v = await c.api.get(`/api/portal/avaliacoes/${avId}`, A1);
    assert.equal(v.status, 404);
    const q = await c.api.post(`/api/portal/professor/avaliacoes/${avId}/questoes`, { tipo: 'objetiva', enunciado: 'Pergunta dois', alternativas: [{ id: 'a', texto: 'Um' }, { id: 'b', texto: 'Dois' }], corretaId: 'a', explicacao: 'EXPL-SECRETA' }, PROF);
    assert.equal(q.status, 201);
    const sem = await c.api.post(`/api/portal/professor/avaliacoes/${avId}/questoes`, { tipo: 'objetiva', enunciado: 'Sem correta', alternativas: [{ texto: 'Um' }, { texto: 'Dois' }] }, PROF);
    assert.equal(sem.status, 400); assert.ok(sem.corpo.campos.corretaId);
    const ref = await c.api.post(`/api/portal/professor/avaliacoes/${avId}/questoes`, { tipo: 'objetiva', enunciado: 'Com ref', alternativas: [{ texto: 'Um' }, { texto: 'Dois' }], corretaId: 'a', respostaReferencia: 'x' }, PROF);
    assert.equal(ref.status, 400);
    const ok = await c.api.post(`/api/portal/professor/avaliacoes/${avId}/publicar`, {}, PROF);
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.avaliacao.publicada, true);
    assert.equal(ok.corpo.avisos.length, 1, 'banco < 2× sorteio → aviso');
  });

  test('intruso sem acesso ao curso → 403 sem-acesso', async () => {
    const r = await c.api.get(`/api/portal/avaliacoes/${avId}`, { usuario: 'u-intruso' });
    assert.equal(r.status, 403); assert.equal(r.corpo.codigo, 'sem-acesso');
  });

  let tentId;
  test('aluno: avisos e estado; iniciar 201 sem gabarito; 2ª chamada devolve a aberta', async () => {
    const v = await c.api.get(`/api/portal/avaliacoes/${avId}`, A1);
    assert.equal(v.status, 200);
    assert.equal(v.corpo.avisos.tentativas, '2 de 2 disponíveis');
    assert.equal(v.corpo.avisos.tempo, 'Livre');
    assert.equal(v.corpo.estado.podeIniciar, true);
    assert.equal(v.corpo.estado.notaMinima, 7);
    semSegredos(v.corpo, 'GET avaliação');
    const r = await c.api.post(`/api/portal/avaliacoes/${avId}/tentativas`, {}, A1);
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    semSegredos(r.corpo, 'TentativaAluno');
    assert.equal(r.corpo.questoes.length, 2);
    tentId = r.corpo.id;
    const de_novo = await c.api.post(`/api/portal/avaliacoes/${avId}/tentativas`, {}, A1);
    assert.equal(de_novo.status, 200);
    assert.equal(de_novo.corpo.id, tentId);
    const leitura = await c.api.get(`/api/portal/tentativas/${tentId}`, A1);
    semSegredos(leitura.corpo, 'GET tentativa');
    assert.ok(leitura.corpo.agora);
  });

  test('IDOR: outro aluno não lê nem responde a tentativa (404)', async () => {
    assert.equal((await c.api.get(`/api/portal/tentativas/${tentId}`, A2)).status, 404);
    assert.equal((await c.api.put(`/api/portal/tentativas/${tentId}/respostas`, { questaoId: 'x', alternativaId: 'a' }, A2)).status, 404);
  });

  test('gabarito antes de finalizar → 403; finalizar com aberta → 409', async () => {
    const g = await c.api.get(`/api/portal/tentativas/${tentId}/gabarito`, A1);
    assert.equal(g.status, 403); assert.equal(g.corpo.codigo, 'gabarito-bloqueado');
    const f = await c.api.post(`/api/portal/avaliacoes/${avId}/finalizar`, { confirmar: true }, A1);
    assert.equal(f.status, 409); assert.equal(f.corpo.codigo, 'tentativa-aberta');
  });

  test('resposta inválida → 400; enviar objetiva → nota, AVL e selo; resultado sem gabarito', async () => {
    const t = await c.banco.collection('tentativas').findOne({ _id: oid(tentId) });
    const r = await c.api.put(`/api/portal/tentativas/${tentId}/respostas`, { questaoId: t.questoes[0].questaoId, alternativaId: 'z' }, A1);
    assert.equal(r.status, 400);
    await responder(c, tentId, { acertar: false });
    const env = await c.api.post(`/api/portal/tentativas/${tentId}/enviar`, {}, A1);
    assert.equal(env.status, 200, JSON.stringify(env.corpo));
    semSegredos(env.corpo, 'ResultadoAluno');
    assert.equal(env.corpo.status, 'corrigida');
    assert.equal(env.corpo.nota, 0);
    assert.equal(env.corpo.acertosObjetivas, 0);
    assert.equal(env.corpo.totalObjetivas, 2);
    assert.match(env.corpo.codigo, /^AVL-/);
    assert.equal(env.corpo.linkAcademico, `academico.html?m=${IDS['mat-aluno1']}`);
    const gravada = await c.banco.collection('tentativas').findOne({ _id: oid(tentId) });
    assert.match(gravada.hash, /^[a-f0-9]{64}$/);
    const de_novo = await c.api.post(`/api/portal/tentativas/${tentId}/enviar`, {}, A1);
    assert.equal(de_novo.status, 200, 'idempotente');
    assert.equal((await c.api.put(`/api/portal/tentativas/${tentId}/respostas`, { questaoId: gravada.questoes[0].questaoId, alternativaId: 'a' }, A1)).status, 409);
  });

  test('serviços: notaDoModulo em recuperação; resumoDoModulo; tentativasDoAluno', async () => {
    const n = await c.servicos.obter('avaliacoes.notaDoModulo')(IDS['mat-aluno1'], 'c01-m01');
    assert.equal(n.temModular, true);
    assert.equal(n.nota, 0);
    assert.equal(n.situacao, 'em_recuperacao');
    assert.deepEqual(n.tentativas, { usadas: 1, permitidas: 2, restantes: 1 });
    const r = await c.servicos.obter('avaliacoes.resumoDoModulo')(IDS['mat-aluno1'], 'c01-m01');
    assert.equal(r.length, 1); assert.equal(r[0].feito, true); assert.equal(r[0].restantes, 1);
    const docente = await c.servicos.obter('avaliacoes.resumoDoModulo')(null, 'c01-m01');
    assert.equal(docente[0].usadas, null);
    const lista = await c.servicos.obter('avaliacoes.tentativasDoAluno')(IDS['u-aluno1'], { cursoId: 'curso-01' });
    assert.equal(lista.length, 1); assert.match(lista[0].codigo, /^AVL-/);
    semSegredos(lista, 'tentativasDoAluno');
    const sem = await c.servicos.obter('avaliacoes.notaDoModulo')(IDS['mat-aluno1'], 'c01-m02');
    assert.equal(sem.temModular, false); assert.equal(sem.nota, null);
  });

  test('melhorar nota até tentativasMax; depois 409 tentativas-esgotadas; nota do módulo = melhor', async () => {
    const r = await c.api.post(`/api/portal/avaliacoes/${avId}/tentativas`, {}, A1);
    assert.equal(r.status, 201);
    await responder(c, r.corpo.id, { acertar: true });
    const env = await c.api.post(`/api/portal/tentativas/${r.corpo.id}/enviar`, {}, A1);
    assert.equal(env.corpo.nota, 10);
    assert.equal(env.corpo.pctAcerto, 100);
    const outra = await c.api.post(`/api/portal/avaliacoes/${avId}/tentativas`, {}, A1);
    assert.equal(outra.status, 409); assert.equal(outra.corpo.codigo, 'tentativas-esgotadas');
    const n = await c.servicos.obter('avaliacoes.notaDoModulo')(IDS['mat-aluno1'], 'c01-m01');
    assert.equal(n.nota, 10); assert.equal(n.situacao, 'aprovado');
  });

  test('finalizar → gabarito de todas as tentativas com corretaId, nunca respostaReferencia; nova tentativa → 409', async () => {
    const sem = await c.api.post(`/api/portal/avaliacoes/${avId}/finalizar`, {}, A1);
    assert.equal(sem.status, 400);
    const f = await c.api.post(`/api/portal/avaliacoes/${avId}/finalizar`, { confirmar: true }, A1);
    assert.equal(f.status, 200, JSON.stringify(f.corpo));
    assert.equal(f.corpo.gabaritoDisponivel, true);
    assert.equal(f.corpo.estado.finalizada, true);
    const g = await c.api.get(`/api/portal/tentativas/${tentId}/gabarito`, A1);
    assert.equal(g.status, 200);
    assert.ok(g.corpo.questoes.every(q => q.corretaId));
    assert.ok(!JSON.stringify(g.corpo).includes('REF-SECRETA'));
    const nova = await c.api.post(`/api/portal/avaliacoes/${avId}/tentativas`, {}, A1);
    assert.equal(nova.status, 409); assert.equal(nova.corpo.codigo, 'avaliacao-finalizada');
  });

  test('concessão: docente concede, reabre finalizada, auditada e notificada', async () => {
    const semMotivo = await c.api.post(`/api/portal/professor/avaliacoes/${avId}/concessoes`, { matriculaId: IDS['mat-aluno1'], quantidade: 1, motivo: 'curto' }, PROF);
    assert.equal(semMotivo.status, 400);
    const r = await c.api.post(`/api/portal/professor/avaliacoes/${avId}/concessoes`, { matriculaId: IDS['mat-aluno1'], quantidade: 1, motivo: 'Problema de conexão comprovado.' }, PROF);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.estado.finalizada, false);
    assert.equal(r.corpo.estado.restantes, 1);
    const aud = await c.banco.collection('auditoria').findOne({ acao: 'tentativa.concedida' });
    assert.ok(aud); assert.equal(aud.estado, 'concluido'); assert.ok(aud.motivo);
    const not = await c.banco.collection('notificacoes').findOne({ tipo: 'tentativa.concedida', userId: IDS['u-aluno1'] });
    assert.ok(not);
    const t1 = await c.api.post(`/api/portal/professor/avaliacoes/${avId}/concessoes`, { matriculaId: IDS['mat-aluno2'], quantidade: 1, motivo: 'Fora da minha turma.' }, { usuario: 'u-prof-t1' });
    assert.equal(t1.status, 404, 'docente de outra turma');
  });

  test('despublicar com tentativas: docente 403, admin 200 (auditado)', async () => {
    const d = await c.api.post(`/api/portal/professor/avaliacoes/${avId}/despublicar`, { motivo: 'Revisão das questões.' }, PROF);
    assert.equal(d.status, 403);
    const a = await c.api.post(`/api/portal/professor/avaliacoes/${avId}/despublicar`, { motivo: 'Revisão das questões.' }, ADMIN);
    assert.equal(a.status, 200); assert.equal(a.corpo.avaliacao.publicada, false);
    assert.ok(await c.banco.collection('auditoria').findOne({ acao: 'avaliacao.despublicada' }));
    const n = await c.servicos.obter('avaliacoes.notaDoModulo')(IDS['mat-aluno1'], 'c01-m01');
    assert.equal(n.temModular, false, 'despublicada sai da regra');
    const del = await c.api.del(`/api/portal/professor/avaliacoes/${avId}`, PROF);
    assert.equal(del.status, 409); assert.equal(del.corpo.codigo, 'tem-registros');
  });

  test('validador AVL: válido e íntegro, sem dado pessoal; código inexistente → null', async () => {
    const t = await c.banco.collection('tentativas').findOne({ _id: oid(tentId) });
    const v = c.servicos.todos('validador').find(x => x.prefixo === 'AVL');
    const r = await v.validar(t.codigo);
    assert.equal(r.valido, true); assert.equal(r.integro, true); assert.equal(r.tipo, 'avaliacao');
    assert.equal(r.iniciais, 'A. T.');
    assert.ok(!JSON.stringify(r).includes('Aluna Um'));
    assert.equal(await v.validar('AVL-2222-2222-2222'), null);
  });
});

describe('avaliações · tempo, dissertativa e correção', () => {
  let c;
  before(async () => { c = await subirF2(); });
  after(async () => { await fechar(c?.server); });

  test('prazo vencido: resposta depois de prazo + 30 s → 409 e envio automático (expirada)', async () => {
    const id = await criarAvaliacao(c.api, { moduloId: 'c01-m02', tipo: 'previa', tempoLimiteMin: 5, sorteio: { objetivas: 1 }, objetivas: 2 });
    const r = await c.api.post(`/api/portal/avaliacoes/${id}/tentativas`, {}, A1);
    assert.equal(r.status, 201);
    assert.ok(r.corpo.prazoEm);
    c.agora.avancar(5 * 60 * 1000 + 31 * 1000);
    const resp = await c.api.put(`/api/portal/tentativas/${r.corpo.id}/respostas`, { questaoId: r.corpo.questoes[0].questaoId, alternativaId: 'a' }, A1);
    assert.equal(resp.status, 409); assert.equal(resp.corpo.codigo, 'tempo-esgotado');
    const t = await c.api.get(`/api/portal/tentativas/${r.corpo.id}`, A1);
    assert.equal(t.corpo.status, 'corrigida'); assert.equal(t.corpo.expirada, true);
    const est = await c.api.get(`/api/portal/avaliacoes/${id}`, A1);
    assert.equal(est.corpo.estado.situacao, null, 'prévia não tem situação de módulo');
  });

  let avId, tentId;
  test('dissertativa: limite (400 resposta-longa), envio → aguardando correção, nota null, sem gabarito', async () => {
    avId = await criarAvaliacao(c.api, { moduloId: 'c01-m01', tipo: 'modular', sorteio: { objetivas: 1, dissertativas: 1 }, objetivas: 2, dissertativas: 2 });
    const r = await c.api.post(`/api/portal/avaliacoes/${avId}/tentativas`, {}, A1);
    tentId = r.corpo.id;
    const dis = r.corpo.questoes.find(q => q.tipo === 'dissertativa');
    assert.equal(dis.limiteCaracteres, 200);
    assert.equal(dis.orientacao, 'Até 200 caracteres.');
    const longa = await c.api.put(`/api/portal/tentativas/${tentId}/respostas`, { questaoId: dis.questaoId, texto: 'x'.repeat(201) }, A1);
    assert.equal(longa.status, 400); assert.equal(longa.corpo.codigo, 'resposta-longa'); assert.equal(longa.corpo.limite, 200);
    // editar o limite no banco não muda a tentativa já iniciada (snapshot)
    const qs = await c.api.get(`/api/portal/professor/avaliacoes/${avId}/questoes`, PROF);
    const qBanco = qs.corpo.itens.find(q => q.id === dis.questaoId);
    const ed = await c.api.put(`/api/portal/professor/questoes/${qBanco.id}`, { limiteCaracteres: 100, versao: qBanco.versao }, PROF);
    assert.equal(ed.status, 200, JSON.stringify(ed.corpo));
    assert.ok(await c.banco.collection('auditoria').findOne({ acao: 'questao.alterada' }), 'questão sorteada: alteração auditada');
    const dentro = await c.api.put(`/api/portal/tentativas/${tentId}/respostas`, { questaoId: dis.questaoId, texto: 'y'.repeat(150) }, A1);
    assert.equal(dentro.status, 200);
    await responder(c, tentId, { acertar: true, texto: 'Resposta fundamentada.' });
    const env = await c.api.post(`/api/portal/tentativas/${tentId}/enviar`, {}, A1);
    assert.equal(env.corpo.status, 'aguardando_correcao');
    assert.equal(env.corpo.nota, null);
    assert.equal(env.corpo.aguardandoCorrecao, true);
    assert.equal(env.corpo.codigo, null);
    semSegredos(env.corpo, 'Resultado aguardando');
    const n = await c.servicos.obter('avaliacoes.notaDoModulo')(IDS['mat-aluno1'], 'c01-m01');
    assert.equal(n.nota, null); assert.equal(n.aguardandoCorrecao, true); assert.equal(n.situacao, 'cursando');
    const pend = await c.servicos.obter('avaliacoes.correcoesPendentes')(['curso-01']);
    assert.equal(pend['curso-01'], 1);
    assert.deepEqual(await c.servicos.obter('avaliacoes.correcoesPendentes')(['curso-01'], { turmaIds: [IDS.T2] }), { 'curso-01': 0 });
  });

  test('fila de correção: docente geral e da turma veem; docente de outra turma não abre (404)', async () => {
    const f = await c.api.get('/api/portal/professor/correcoes', PROF);
    assert.equal(f.status, 200);
    assert.equal(f.corpo.contagens.aguardando, 1);
    assert.equal(f.corpo.itens[0].dissertativasPendentes, 1);
    assert.equal(f.corpo.itens[0].aluno.nome, 'Aluna Um de Teste');
    const t1 = await c.api.get('/api/portal/professor/correcoes', { usuario: 'u-prof-t1' });
    assert.equal(t1.corpo.contagens.aguardando, 1);
    const det = await c.api.get(`/api/portal/professor/tentativas/${tentId}`, PROF);
    assert.equal(det.status, 200);
    assert.ok(JSON.stringify(det.corpo).includes('REF-SECRETA'), 'quem corrige vê a referência');
    const intruso = await c.api.get(`/api/portal/professor/tentativas/${tentId}`, { usuario: 'u-aluno2' });
    assert.equal(intruso.status, 403);
  });

  test('correção publicar:false → rascunho sem nota/AVL/notificação/auditoria e efeito simulado; publicar → fecha', async () => {
    const det = await c.api.get(`/api/portal/professor/tentativas/${tentId}`, PROF);
    const dis = det.corpo.tentativa.questoes.find(q => q.tipo === 'dissertativa');
    const fora = await c.api.put(`/api/portal/professor/tentativas/${tentId}/correcao`, { itens: [{ questaoId: dis.questaoId, pontos: 3 }], publicar: false, versao: det.corpo.tentativa.versao }, PROF);
    assert.equal(fora.status, 400, 'pontos acima do valor da questão');
    const passo = await c.api.put(`/api/portal/professor/tentativas/${tentId}/correcao`, { itens: [{ questaoId: dis.questaoId, pontos: 1.1 }], publicar: false, versao: det.corpo.tentativa.versao }, PROF);
    assert.equal(passo.status, 400, 'passo 0,25');
    const rasc = await c.api.put(`/api/portal/professor/tentativas/${tentId}/correcao`, { itens: [{ questaoId: dis.questaoId, pontos: 1.5, comentario: 'Faltou citar a norma.' }], publicar: false, versao: det.corpo.tentativa.versao }, PROF);
    assert.equal(rasc.status, 200, JSON.stringify(rasc.corpo));
    assert.equal(rasc.corpo.tentativa.status, 'aguardando_correcao');
    assert.equal(rasc.corpo.tentativa.nota, null);
    assert.equal(rasc.corpo.tentativa.codigo, null);
    // 1 objetiva certa (1 ponto) + 1,5 de 2 = 2,5/3 → 8,3
    assert.deepEqual(
      { completa: rasc.corpo.efeito.completa, conta: rasc.corpo.efeito.contaParaNota, nota: rasc.corpo.efeito.notaTentativa, modulo: rasc.corpo.efeito.notaModulo, sit: rasc.corpo.efeito.situacaoModulo, rest: rasc.corpo.efeito.restantes },
      { completa: true, conta: true, nota: 8.3, modulo: 8.3, sit: 'aprovado', rest: 1 }
    );
    assert.equal(await c.banco.collection('auditoria').findOne({ acao: 'tentativa.corrigida' }), null);
    assert.equal(await c.banco.collection('notificacoes').findOne({ tipo: 'avaliacao.corrigida' }), null);
    const aluno = await c.api.get(`/api/portal/tentativas/${tentId}`, A1);
    assert.equal(aluno.corpo.nota, null); assert.deepEqual(aluno.corpo.comentarios, [], 'rascunho invisível ao aluno');
    const conflito = await c.api.put(`/api/portal/professor/tentativas/${tentId}/correcao`, { itens: [], publicar: true, versao: det.corpo.tentativa.versao }, PROF);
    assert.equal(conflito.status, 409); assert.equal(conflito.corpo.codigo, 'conflito-versao');
    const pub = await c.api.put(`/api/portal/professor/tentativas/${tentId}/correcao`, { itens: [], publicar: true, versao: rasc.corpo.tentativa.versao }, PROF);
    assert.equal(pub.status, 200, JSON.stringify(pub.corpo));
    assert.equal(pub.corpo.tentativa.status, 'corrigida');
    assert.equal(pub.corpo.tentativa.nota, 8.3);
    assert.match(pub.corpo.tentativa.codigo, /^AVL-/);
    assert.ok(await c.banco.collection('auditoria').findOne({ acao: 'tentativa.corrigida', estado: 'concluido' }));
    assert.ok(await c.banco.collection('notificacoes').findOne({ tipo: 'avaliacao.corrigida', userId: IDS['u-aluno1'] }));
    const aluno2 = await c.api.get(`/api/portal/tentativas/${tentId}`, A1);
    assert.equal(aluno2.corpo.nota, 8.3);
    assert.equal(aluno2.corpo.comentarios[0].comentario, 'Faltou citar a norma.');
    semSegredos(aluno2.corpo, 'Resultado corrigido');
    const de_novo = await c.api.put(`/api/portal/professor/tentativas/${tentId}/correcao`, { itens: [], publicar: true, versao: pub.corpo.tentativa.versao }, PROF);
    assert.equal(de_novo.status, 409); assert.equal(de_novo.corpo.codigo, 'transicao-invalida');
  });

  test('recorreção exige motivo, audita antes/depois e notifica', async () => {
    const det = await c.api.get(`/api/portal/professor/tentativas/${tentId}`, PROF);
    const dis = det.corpo.tentativa.questoes.find(q => q.tipo === 'dissertativa');
    const sem = await c.api.put(`/api/portal/professor/tentativas/${tentId}/recorrecao`, { itens: [{ questaoId: dis.questaoId, pontos: 2 }], versao: det.corpo.tentativa.versao }, PROF);
    assert.equal(sem.status, 400);
    const r = await c.api.put(`/api/portal/professor/tentativas/${tentId}/recorrecao`, { itens: [{ questaoId: dis.questaoId, pontos: 2, comentario: 'Revisto.' }], motivo: 'Critério aplicado de forma desigual.', versao: det.corpo.tentativa.versao }, PROF);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.tentativa.nota, 10);
    const aud = await c.banco.collection('auditoria').findOne({ acao: 'tentativa.recorrigida' });
    assert.deepEqual(aud.mudancas, [{ campo: 'nota', de: 8.3, para: 10 }]);
    assert.ok(await c.banco.collection('notificacoes').findOne({ tipo: 'nota.alterada' }));
  });

  test('resultados da avaliação e prévia sem gravar nada nem vazar gabarito', async () => {
    const r = await c.api.get(`/api/portal/professor/avaliacoes/${avId}/resultados`, PROF);
    assert.equal(r.status, 200);
    assert.equal(r.corpo.itens.length, 1);
    assert.equal(r.corpo.itens[0].melhorNota, 10);
    assert.equal(r.corpo.kpis.alunos, null, 'sem secretaria.alunosDoCurso: total desconhecido, nunca inventado');
    const antes = await c.banco.collection('tentativas').countDocuments({});
    const p = await c.api.get(`/api/portal/professor/avaliacoes/${avId}/previa`, PROF);
    assert.equal(p.status, 200);
    semSegredos(p.corpo, 'Prévia');
    assert.equal(p.corpo.questoes.length, 2);
    assert.equal(await c.banco.collection('tentativas').countDocuments({}), antes);
    const lista = await c.api.get('/api/portal/professor/cursos/curso-01/avaliacoes', PROF);
    assert.equal(lista.status, 200);
    assert.equal(lista.corpo.modulos.length, 2);
    assert.equal(lista.corpo.notaMinima, 7);
  });

  test('matrícula trancada → 409 matricula-nao-ativa', async () => {
    await c.banco.collection('matriculas').updateOne({ _id: oid('mat-aluno2') }, { $set: { status: 'trancada' } });
    const r = await c.api.post(`/api/portal/avaliacoes/${avId}/tentativas`, {}, A2);
    assert.equal(r.status, 409); assert.equal(r.corpo.codigo, 'matricula-nao-ativa');
    const v = await c.api.get(`/api/portal/avaliacoes/${avId}`, A2);
    assert.equal(v.corpo.motivoBloqueio, 'matricula-nao-ativa');
    assert.equal(v.corpo.estado.podeIniciar, false);
  });
});

describe('avaliações · corrida, gabarito adiado, rematrícula e TCC', () => {
  let c;
  before(async () => { c = await subirF2(); });
  after(async () => { await fechar(c?.server); });

  test('corrida (duas abas): duas chamadas simultâneas → uma só tentativa aberta', async () => {
    const id = await criarAvaliacao(c.api, { moduloId: 'c01-m02', tipo: 'modular', sorteio: { objetivas: 1 }, objetivas: 2 });
    const [a, b] = await Promise.all([
      c.api.post(`/api/portal/avaliacoes/${id}/tentativas`, {}, A2),
      c.api.post(`/api/portal/avaliacoes/${id}/tentativas`, {}, A2)
    ]);
    assert.ok([a.status, b.status].every(st => st === 200 || st === 201));
    assert.ok([a.status, b.status].includes(201));
    assert.equal(a.corpo.id, b.corpo.id);
    assert.equal(await c.banco.collection('tentativas').countDocuments({ status: 'em_andamento' }), 1);
  });

  test('gabaritoLiberaEm futuro: finalizar entrega só acertou/errou (sem corretaId/explicação)', async () => {
    const id = await criarAvaliacao(c.api, { moduloId: 'c01-m01', tipo: 'previa', sorteio: { objetivas: 1 }, objetivas: 2, gabaritoLiberaEm: '2026-12-01T12:00:00.000Z' });
    const r = await c.api.post(`/api/portal/avaliacoes/${id}/tentativas`, {}, A1);
    await responder(c, r.corpo.id, { acertar: true });
    await c.api.post(`/api/portal/tentativas/${r.corpo.id}/enviar`, {}, A1);
    const f = await c.api.post(`/api/portal/avaliacoes/${id}/finalizar`, { confirmar: true }, A1);
    assert.equal(f.corpo.gabaritoDisponivel, false);
    const g = await c.api.get(`/api/portal/tentativas/${r.corpo.id}/gabarito`, A1);
    assert.equal(g.status, 200);
    semSegredos(g.corpo, 'gabarito adiado');
    assert.equal(g.corpo.questoes[0].acertou, true);
  });

  test('rematrícula: matrícula nova começa com 0 tentativas e sem finalização', async () => {
    const id = (await c.banco.collection('avaliacoes').findOne({ tipo: 'previa', moduloId: 'c01-m01' }))._id.toHexString();
    await c.banco.collection('matriculas').updateOne({ _id: oid('mat-aluno1') }, { $set: { status: 'concluida', vigente: false } });
    const nova = { ...(await c.banco.collection('matriculas').findOne({ _id: oid('mat-aluno1') })), _id: new ObjectId('000000000000000000000c09'), status: 'ativa', vigente: true, numero: 'MAT-2026-AAAAA9' };
    await c.banco.collection('matriculas').insertOne(nova);
    const v = await c.api.get(`/api/portal/avaliacoes/${id}`, A1);
    assert.equal(v.corpo.estado.usadas, 0);
    assert.equal(v.corpo.estado.finalizada, false);
    assert.equal(v.corpo.matricula.id, '000000000000000000000c09');
  });

  test('TCC: questão arquivo só no módulo tcc; entrega PDF por POST substitui; PDF ativo 415; outro aluno 404', async () => {
    await c.banco.collection('modulos').updateOne({ _id: 'c01-m02' }, { $set: { tipo: 'tcc' } });
    const cria = await c.api.post('/api/portal/professor/modulos/c01-m02/avaliacoes', { tipo: 'previa', titulo: 'Entrega do TCC', sorteio: { arquivos: 1 }, tentativasMax: 1 }, PROF);
    assert.equal(cria.status, 201, JSON.stringify(cria.corpo));
    const id = cria.corpo.avaliacao.id;
    const q = await c.api.post(`/api/portal/professor/avaliacoes/${id}/questoes`, { tipo: 'arquivo', enunciado: 'Envie o TCC em PDF.', orientacao: 'PDF até 4 MB.', pontos: 10 }, PROF);
    assert.equal(q.status, 201, JSON.stringify(q.corpo));
    const comLimite = await c.api.post(`/api/portal/professor/avaliacoes/${id}/questoes`, { tipo: 'arquivo', enunciado: 'Outro', limiteCaracteres: 500 }, PROF);
    assert.equal(comLimite.status, 400);
    const foraTcc = await c.api.post(`/api/portal/professor/avaliacoes/${(await c.banco.collection('avaliacoes').findOne({ moduloId: 'c01-m01' }))._id.toHexString()}/questoes`, { tipo: 'arquivo', enunciado: 'Envie' }, PROF);
    assert.equal(foraTcc.status, 400); assert.equal(foraTcc.corpo.codigo, 'modulo-nao-tcc');
    assert.equal((await c.api.post(`/api/portal/professor/avaliacoes/${id}/publicar`, {}, PROF)).status, 200);
    const t = await c.api.post(`/api/portal/avaliacoes/${id}/tentativas`, {}, A1);
    assert.equal(t.status, 201);
    const qid = t.corpo.questoes[0].questaoId;
    const ativo = await c.api.post(`/api/portal/tentativas/${t.corpo.id}/respostas/${qid}/arquivo`, undefined, { ...A1, corpoCru: pdfComJavascript(), tipo: 'application/pdf' });
    assert.equal(ativo.status, 415);
    const e1 = await c.api.post(`/api/portal/tentativas/${t.corpo.id}/respostas/${qid}/arquivo`, undefined, { ...A1, corpoCru: pdfMinimo(), tipo: 'application/pdf' });
    assert.equal(e1.status, 200, JSON.stringify(e1.corpo));
    const e2 = await c.api.post(`/api/portal/tentativas/${t.corpo.id}/respostas/${qid}/arquivo`, undefined, { ...A1, corpoCru: pdfMinimo(), tipo: 'application/pdf' });
    assert.equal(e2.status, 200);
    assert.equal(await c.banco.collection('arquivos').countDocuments({ contexto: 'tcc' }), 1, '2º envio substitui e apaga o anterior');
    const baixa = await c.api.get(`/api/portal/tentativas/${t.corpo.id}/respostas/${qid}/arquivo`, A1);
    assert.equal(baixa.status, 200);
    assert.equal((await c.api.get(`/api/portal/tentativas/${t.corpo.id}/respostas/${qid}/arquivo`, A2)).status, 404);
    const env = await c.api.post(`/api/portal/tentativas/${t.corpo.id}/enviar`, {}, A1);
    assert.equal(env.corpo.status, 'aguardando_correcao');
    assert.equal(env.corpo.temEntregaArquivo, true);
    const prof = await c.api.get(`/api/portal/professor/tentativas/${t.corpo.id}/respostas/${qid}/arquivo`, PROF);
    assert.equal(prof.status, 200);
  });
});

describe('avaliações · relatórios, aviso, concessão visível e bordas', () => {
  let c, avId, tentId;
  before(async () => {
    c = await subirF2();
    avId = await criarAvaliacao(c.api, { moduloId: 'c01-m01', tipo: 'modular', sorteio: { objetivas: 1, dissertativas: 1 }, objetivas: 2, dissertativas: 1 });
  });
  after(async () => { await fechar(c?.server); });

  test('aviso avaliacao-disponivel: aparece para quem não fez; some depois do envio', async () => {
    const def = c.servicos.todos('aviso').find(a => a.id === 'avaliacao-disponivel');
    const req = { user: await c.banco.collection('users').findOne({ _id: oid('u-aluno1') }) };
    const antes = await def.gerar(req);
    assert.equal(antes.length, 1);
    assert.equal(antes[0].contador, 1);
    assert.match(antes[0].href, new RegExp(`^aula\\.html\\?curso=curso-01&modulo=c01-m01&item=avaliacao:${avId}$`));
    const r = await c.api.post(`/api/portal/avaliacoes/${avId}/tentativas`, {}, A1);
    tentId = r.corpo.id;
    await responder(c, tentId, { acertar: true });
    await c.api.post(`/api/portal/tentativas/${tentId}/enviar`, {}, A1);
    assert.deepEqual(await def.gerar(req), []);
    const intruso = { user: await c.banco.collection('users').findOne({ _id: oid('u-intruso') }) };
    assert.deepEqual(await def.gerar(intruso), []);
  });

  test('fila ?status=corrigida&avaliacaoId= e docente de outra turma não abre a tentativa (404)', async () => {
    const outra = await c.api.get(`/api/portal/professor/tentativas/${tentId}`, { usuario: 'u-prof-t1' });
    assert.equal(outra.status, 200, 'u-prof-t1 é docente da T1 (matrícula do aluno1)');
    await c.banco.collection('tentativas').updateOne({ _id: oid(tentId) }, { $set: { turmaId: IDS.T2 } });
    assert.equal((await c.api.get(`/api/portal/professor/tentativas/${tentId}`, { usuario: 'u-prof-t1' })).status, 404);
    await c.banco.collection('tentativas').updateOne({ _id: oid(tentId) }, { $set: { turmaId: IDS.T1 } });
    const det = await c.api.get(`/api/portal/professor/tentativas/${tentId}`, PROF);
    const dis = det.corpo.tentativa.questoes.find(q => q.tipo === 'dissertativa');
    await c.api.put(`/api/portal/professor/tentativas/${tentId}/correcao`, { itens: [{ questaoId: dis.questaoId, pontos: 2 }], versao: det.corpo.tentativa.versao }, PROF);
    const f = await c.api.get(`/api/portal/professor/correcoes?status=corrigida&avaliacaoId=${avId}`, PROF);
    assert.equal(f.status, 200);
    assert.equal(f.corpo.itens.length, 1);
    assert.equal(f.corpo.itens[0].nota, 10);
    assert.equal(f.corpo.contagens.corrigidas, 1);
    const fora = await c.api.get('/api/portal/professor/correcoes?cursoId=curso-02', { usuario: 'u-prof' });
    assert.equal(fora.status, 403);
  });

  test('relatórios notas, tentativas e correcoes-pendentes: escopo do docente, resumo e sem CPF', async () => {
    const defs = Object.fromEntries(c.servicos.todos('relatorio').map(d => [d.id, d]));
    assert.deepEqual(Object.keys(defs).sort(), ['correcoes-pendentes', 'notas', 'tentativas']);
    const reqProf = { user: await c.banco.collection('users').findOne({ _id: oid('u-prof') }), ip: '127.0.0.1' };
    const notas = await defs.notas.consultar(reqProf, { cursoId: 'curso-01' }, { limite: 20000 });
    assert.equal(notas.length, 1);
    assert.equal(notas[0].nota, 10);
    assert.equal(notas[0].situacao, 'Aprovado');
    const resumo = await defs.notas.resumir(reqProf, { cursoId: 'curso-01' });
    assert.equal(resumo.kpis.find(k => k.chave === 'mediaDasNotas').valor, 10);
    assert.equal(resumo.series[0].pontos[0].valor, 10);
    const tent = await defs.tentativas.consultar(reqProf, { cursoId: 'curso-01' }, { limite: 20000 });
    assert.equal(tent.length, 1); assert.equal(tent[0].status, 'Corrigida');
    assert.deepEqual(await defs['correcoes-pendentes'].consultar(reqProf, { cursoId: 'curso-01' }, { limite: 20000 }), []);
    for (const linhas of [notas, tent]) assert.ok(!JSON.stringify(linhas).match(/cpf|respostaReferencia|corretaId/i));
    const reqT2 = { user: await c.banco.collection('users').findOne({ _id: oid('u-prof-t1') }), ip: '127.0.0.1' };
    await assert.rejects(defs.notas.consultar(reqT2, { cursoId: 'curso-01', turmaId: IDS.T2 }, { limite: 20000 }), e => e.status === 403);
    await assert.rejects(defs.tentativas.consultar(reqProf, {}, { limite: 20000 }), e => e.status === 400);
    await assert.rejects(defs.tentativas.consultar(reqProf, { cursoId: 'curso-01' }, { limite: 0 }), e => e.status === 413);
  });

  test('concessão aparece ao aluno (novaTentativaLiberada) até ele iniciar a nova tentativa', async () => {
    await c.api.post(`/api/portal/avaliacoes/${avId}/finalizar`, { confirmar: true }, A1);
    const r = await c.api.post(`/api/portal/professor/avaliacoes/${avId}/concessoes`, { matriculaId: IDS['mat-aluno1'], quantidade: 1, motivo: 'Pedido deferido pela coordenação.' }, ADMIN);
    assert.equal(r.status, 200);
    const v = await c.api.get(`/api/portal/avaliacoes/${avId}`, A1);
    assert.equal(v.corpo.novaTentativaLiberada, true);
    assert.equal(v.corpo.estado.podeIniciar, true);
    const t = await c.api.post(`/api/portal/avaliacoes/${avId}/tentativas`, {}, A1);
    assert.equal(t.status, 201);
    const depois = await c.api.get(`/api/portal/avaliacoes/${avId}`, A1);
    assert.equal(depois.corpo.novaTentativaLiberada, false);
  });

  test('exportador (Meus dados) sem gabarito nem referência; cascata bloqueia curso/módulo com tentativas e apaga só sem elas', async () => {
    const exp = c.servicos.todos('exportador').find(e => e.dominio === 'avaliacoes');
    const dados = await exp.exportar(IDS['u-aluno1']);
    assert.ok(dados.tentativas.length >= 1);
    assert.ok(!JSON.stringify(dados).match(/corretaId|explicacao|respostaReferencia|REF-SECRETA|EXPL-SECRETA/));
    const cas = c.servicos.todos('cascata').find(x => x.dominio === 'avaliacoes');
    assert.ok(await cas.bloqueios({ tipo: 'curso', id: 'curso-01' }) > 0);
    assert.ok(await cas.bloqueios({ tipo: 'modulo', id: 'c01-m01' }) > 0);
    assert.equal(await cas.bloqueios({ tipo: 'modulo', id: 'c02-m01' }), 0);
    const r = await c.api.post('/api/portal/professor/modulos/c02-m01/avaliacoes', { tipo: 'previa', titulo: 'Sem tentativas', sorteio: { objetivas: 1 }, tentativasMax: 1 }, ADMIN);
    assert.equal(r.status, 201);
    await cas.apagar({ tipo: 'modulo', id: 'c02-m01' });
    assert.equal(await c.banco.collection('avaliacoes').countDocuments({ moduloId: 'c02-m01' }), 0);
    const painel = c.servicos.todos('painel').find(x => x.bloco === 'academico');
    assert.deepEqual(Object.keys(await painel.contar({}, { cursoIds: ['curso-01'] })), ['correcoesPendentes']);
  });

  test('TCC: 5 MB → 413; PUT no caminho do arquivo → 404; selo da tentativa cobre o sha256 da entrega', async () => {
    await c.banco.collection('modulos').updateOne({ _id: 'c01-m02' }, { $set: { tipo: 'tcc' } });
    const cria = await c.api.post('/api/portal/professor/modulos/c01-m02/avaliacoes', { tipo: 'modular', titulo: 'Entrega do TCC', sorteio: { arquivos: 1 }, tentativasMax: 1 }, PROF);
    const id = cria.corpo.avaliacao.id;
    await c.api.post(`/api/portal/professor/avaliacoes/${id}/questoes`, { tipo: 'arquivo', enunciado: 'Envie o TCC em PDF.', pontos: 10 }, PROF);
    await c.api.post(`/api/portal/professor/avaliacoes/${id}/publicar`, {}, PROF);
    const t = await c.api.post(`/api/portal/avaliacoes/${id}/tentativas`, {}, A1);
    const qid = t.corpo.questoes[0].questaoId;
    const grande = Buffer.concat([pdfMinimo(), Buffer.alloc(5 * 1024 * 1024)]);
    const r413 = await c.api.post(`/api/portal/tentativas/${t.corpo.id}/respostas/${qid}/arquivo`, undefined, { ...A1, corpoCru: grande, tipo: 'application/pdf' });
    assert.equal(r413.status, 413);
    const put = await c.api.put(`/api/portal/tentativas/${t.corpo.id}/respostas/${qid}/arquivo`, {}, A1);
    assert.equal(put.status, 404);
    const ok = await c.api.post(`/api/portal/tentativas/${t.corpo.id}/respostas/${qid}/arquivo`, undefined, { ...A1, corpoCru: pdfMinimo(), tipo: 'application/pdf' });
    assert.equal(ok.status, 200);
    await c.api.post(`/api/portal/tentativas/${t.corpo.id}/enviar`, {}, A1);
    const det = await c.api.get(`/api/portal/professor/tentativas/${t.corpo.id}`, PROF);
    await c.api.put(`/api/portal/professor/tentativas/${t.corpo.id}/correcao`, { itens: [{ questaoId: qid, pontos: 8, comentario: 'Bom trabalho.' }], versao: det.corpo.tentativa.versao }, PROF);
    const gravada = await c.banco.collection('tentativas').findOne({ _id: oid(t.corpo.id) });
    assert.equal(gravada.status, 'corrigida');
    const { camposDoSelo } = await import('../src/portal/avaliacoes/avaliacao-motor.js');
    const campos = camposDoSelo(gravada);
    assert.equal(campos.arquivos.length, 1);
    assert.equal(campos.arquivos[0].sha256, ok.corpo.arquivo.sha256);
    const v = c.servicos.todos('validador').find(x => x.prefixo === 'AVL');
    assert.equal((await v.validar(gravada.codigo)).integro, true);
    await c.banco.collection('tentativas').updateOne({ _id: gravada._id }, { $set: { nota: 10 } });
    assert.equal((await v.validar(gravada.codigo)).integro, false, 'edição direta no banco é detectada');
  });
});
