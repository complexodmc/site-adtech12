// Portal · F6a — atendimentos (protocolos ATD). PORTAL-API §6.10.1, §9.2, §9.3 (linha
// atendimento-protocolos). Agregador real (montarPortal) com os módulos da F6a, banco em
// memória e fixtures do portal; nenhum Mongo, nenhuma rede.
//   NODE_ENV=test node --test server/test/atendimento-protocolos.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const M = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos, executarBusca } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const E = await import('../src/portal/erros.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const { regexBusca } = await import('../src/portal/validacao.js');
const P = await import('../src/portal/atendimento/protocolos.js');

const CFG = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });
const MODULOS_F6A = M.MODULOS_PADRAO.filter(m => m.fatia === 'F6a');
const ATD = /^ATD-\d{4}-[2-9A-HJ-NP-Z]{6}$/;

/** Turma da matrícula vigente lida das fixtures (falso do serviço da F4a). */
function matriculaVigenteFalsa(banco) {
  return async (userId, cursoId) => banco.collection('matriculas').findOne({ userId, cursoId, status: { $in: ['ativa', 'trancada'] } });
}

async function subirPortal({ comMatricula = true } = {}) {
  const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
  await semear(banco);
  const servicos = criarServicos();
  if (comMatricula) servicos.registrar('secretaria.matriculaVigente', matriculaVigenteFalsa(banco));
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: MODULOS_F6A, configPortal: CFG, falharCedo: true, log: silencioso
  });
  await portal.carregar(); // carga dos módulos (serviços registrados antes da 1ª requisição)
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(E.criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  return { api: cliente(base), server, banco, servicos };
}

const novo = (extra = {}) => ({ categoria: 'academico', assunto: 'Dúvida sobre o módulo 1', mensagem: 'Gostaria de entender a regra de frequência.', cursoId: 'curso-01', ...extra });

/** Varredura profunda: nenhuma destas chaves em lugar algum do JSON. */
function semChaves(obj, proibidas, caminho = '$') {
  if (Array.isArray(obj)) return obj.forEach((v, i) => semChaves(v, proibidas, `${caminho}[${i}]`));
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      assert.ok(!proibidas.includes(k), `chave proibida ${k} em ${caminho}`);
      semChaves(v, proibidas, `${caminho}.${k}`);
    }
  }
}

describe('rotear() — tabela (função pura)', () => {
  test('acadêmico com curso → professores do curso (com a turma); o resto → coordenação', () => {
    assert.deepEqual(P.rotear({ categoria: 'academico', cursoId: 'curso-01', turmaId: IDS.T1 }), { fila: 'professores_do_curso', cursoId: 'curso-01', turmaId: IDS.T1, responsavelId: null });
    assert.equal(P.rotear({ categoria: 'academico', cursoId: null }).fila, 'coordenacao');
    for (const c of ['secretaria', 'financeiro', 'tecnico', 'privacidade']) {
      const r = P.rotear({ categoria: c, cursoId: 'curso-01', turmaId: IDS.T1 });
      assert.equal(r.fila, 'coordenacao', c);
      assert.equal(r.turmaId, null, c);
    }
  });
  test('prazo de resposta só em privacidade (+15 dias)', () => {
    const t = new Date('2026-10-18T12:00:00Z');
    assert.equal(P.prazoResposta('privacidade', t).toISOString(), '2026-11-02T12:00:00.000Z');
    assert.equal(P.prazoResposta('academico', t), null);
  });
});

describe('atendimentos do titular', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('401 sem sessão; no-store e X-Request-Id', async () => {
    const r = await ctx.api.get('/api/portal/me/atendimentos');
    assert.equal(r.status, 401);
    const ok = await ctx.api.get('/api/portal/me/atendimentos', { usuario: 'u-aluno1' });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.match(ok.headers.get('x-request-id'), /^r-[a-f0-9]{12}$/);
    assert.deepEqual(ok.corpo.contagens, { aberto: 0, respondido: 0, encerrado: 0 });
    assert.deepEqual(ok.corpo.itens, []);
  });

  test('validação: campos, formato-invalido (objeto em texto) e curso alheio', async () => {
    const curto = await ctx.api.post('/api/portal/me/atendimentos', novo({ assunto: 'Oi' }), { usuario: 'u-aluno1' });
    assert.equal(curto.status, 400);
    assert.equal(curto.corpo.codigo, 'validacao');
    assert.ok(curto.corpo.campos.assunto);
    assert.match(curto.corpo.requestId, /^r-/);
    const objeto = await ctx.api.post('/api/portal/me/atendimentos', novo({ assunto: { $gt: '' } }), { usuario: 'u-aluno1' });
    assert.equal(objeto.status, 400);
    assert.equal(objeto.corpo.codigo, 'formato-invalido');
    const alheio = await ctx.api.post('/api/portal/me/atendimentos', novo({ cursoId: 'curso-02' }), { usuario: 'u-aluno1' });
    assert.equal(alheio.status, 400);
    assert.ok(alheio.corpo.campos.cursoId);
    const cat = await ctx.api.post('/api/portal/me/atendimentos', novo({ categoria: 'outra' }), { usuario: 'u-aluno1' });
    assert.equal(cat.status, 400);
  });

  test('privacidade exige o tipo de pedido e calcula o prazo de 15 dias', async () => {
    const sem = await ctx.api.post('/api/portal/me/atendimentos', novo({ categoria: 'privacidade', cursoId: null }), { usuario: 'u-aluno2' });
    assert.equal(sem.status, 400);
    assert.ok(sem.corpo.campos.pedidoTitular);
    const r = await ctx.api.post('/api/portal/me/atendimentos', novo({ categoria: 'privacidade', pedidoTitular: 'acesso', cursoId: null }), { usuario: 'u-aluno2' });
    assert.equal(r.status, 201);
    assert.match(r.corpo.protocolo, ATD);
    const dias = (new Date(r.corpo.prazoRespostaEm) - new Date(r.corpo.criadoEm)) / 86400000;
    assert.equal(dias, 15);
    assert.equal(r.corpo.pedidoTitular, 'acesso');
  });

  test('ciclo aberto → respondido → aberto → encerrado; mensagem em encerrado → 409; notificação na resposta', async () => {
    const r = await ctx.api.post('/api/portal/me/atendimentos', novo(), { usuario: 'u-aluno1' });
    assert.equal(r.status, 201);
    const p = r.corpo.protocolo;
    assert.match(p, ATD);
    assert.equal(r.corpo.status, 'aberto');
    assert.equal(r.corpo.aguardando, 'equipe');
    const doc = await ctx.banco.collection('protocolos').findOne({ protocolo: p });
    assert.equal(doc.roteamento.fila, 'professores_do_curso');
    assert.equal(String(doc.roteamento.turmaId), IDS.T1);
    assert.equal(doc.origem, 'humano');

    const resp = await ctx.api.post(`/api/portal/professor/atendimentos/${p}/mensagens`, { texto: 'A frequência mínima está no regulamento.' }, { usuario: 'u-prof' });
    assert.equal(resp.status, 201);
    assert.equal(resp.corpo.status, 'respondido');
    const notif = await ctx.banco.collection('notificacoes').findOne({ userId: IDS['u-aluno1'], tipo: 'protocolo.respondido' });
    assert.ok(notif);
    assert.equal(notif.link, `atendimentos.html?protocolo=${p}`);

    const det = await ctx.api.get(`/api/portal/me/atendimentos/${p}`, { usuario: 'u-aluno1' });
    assert.equal(det.status, 200);
    assert.equal(det.corpo.status, 'respondido');
    assert.equal(det.corpo.aguardando, 'aluno');
    assert.equal(det.corpo.mensagens[1].autorNome, 'Equipe Complexo DMC');
    assert.equal(det.corpo.pedido, null);
    semChaves(det.corpo, ['autorId', 'userId', 'senhaHash', 'roteamento']);

    const volta = await ctx.api.post(`/api/portal/me/atendimentos/${p}/mensagens`, { texto: 'Obrigada, ficou claro.' }, { usuario: 'u-aluno1' });
    assert.equal(volta.status, 201);
    assert.equal(volta.corpo.status, 'aberto');

    const enc = await ctx.api.post(`/api/portal/me/atendimentos/${p}/encerrar`, {}, { usuario: 'u-aluno1' });
    assert.equal(enc.status, 200);
    const depois = await ctx.api.post(`/api/portal/me/atendimentos/${p}/mensagens`, { texto: 'Mais uma coisa.' }, { usuario: 'u-aluno1' });
    assert.equal(depois.status, 409);
    assert.equal(depois.corpo.codigo, 'protocolo-encerrado');
    const equipe = await ctx.api.post(`/api/portal/professor/atendimentos/${p}/mensagens`, { texto: 'Resposta tardia.' }, { usuario: 'u-prof' });
    assert.equal(equipe.status, 409);
  });

  test('IDOR: protocolo de outro titular → 404; código fora do formato → 404', async () => {
    const r = await ctx.api.post('/api/portal/me/atendimentos', novo(), { usuario: 'u-aluno1' });
    const p = r.corpo.protocolo;
    const alheio = await ctx.api.get(`/api/portal/me/atendimentos/${p}`, { usuario: 'u-aluno2' });
    assert.equal(alheio.status, 404);
    const msg = await ctx.api.post(`/api/portal/me/atendimentos/${p}/mensagens`, { texto: 'invasão' }, { usuario: 'u-aluno2' });
    assert.equal(msg.status, 404);
    const enc = await ctx.api.post(`/api/portal/me/atendimentos/${p}/encerrar`, {}, { usuario: 'u-aluno2' });
    assert.equal(enc.status, 404);
    const ruim = await ctx.api.get('/api/portal/me/atendimentos/ATD-XX', { usuario: 'u-aluno1' });
    assert.equal(ruim.status, 404);
  });

  test('filtros: status, categoria, origem=ia e busca por protocolo/assunto', async () => {
    const srv = ctx.servicos.obter('atendimento.abrirProtocolo');
    const ia = await srv({ userId: IDS['u-aluno2'], categoria: 'secretaria', assunto: 'Encaminhado pelo assistente', mensagem: 'Resumo da conversa com o assistente.', origem: 'ia' });
    assert.match(ia.protocolo, ATD);
    const soIa = await ctx.api.get('/api/portal/me/atendimentos?origem=ia', { usuario: 'u-aluno2' });
    assert.equal(soIa.status, 200);
    assert.deepEqual(soIa.corpo.itens.map(i => i.protocolo), [ia.protocolo]);
    const humano = await ctx.api.get('/api/portal/me/atendimentos?origem=humano', { usuario: 'u-aluno2' });
    assert.ok(humano.corpo.itens.every(i => i.origem === 'humano'));
    const porCodigo = await ctx.api.get(`/api/portal/me/atendimentos?q=${ia.protocolo}`, { usuario: 'u-aluno2' });
    assert.equal(porCodigo.corpo.total, 1);
    const porAssunto = await ctx.api.get('/api/portal/me/atendimentos?q=assistente', { usuario: 'u-aluno2' });
    assert.equal(porAssunto.corpo.total, 1);
    const cat = await ctx.api.get('/api/portal/me/atendimentos?categoria=privacidade', { usuario: 'u-aluno2' });
    assert.ok(cat.corpo.itens.every(i => i.categoria === 'privacidade'));
    const ruim = await ctx.api.get('/api/portal/me/atendimentos?status=xyz', { usuario: 'u-aluno2' });
    assert.equal(ruim.status, 400);
  });
});

describe('fila da equipe e roteamento por turma', () => {
  let ctx;
  let p1;
  let p2;
  before(async () => {
    ctx = await subirPortal();
    p1 = (await ctx.api.post('/api/portal/me/atendimentos', novo(), { usuario: 'u-aluno1' })).corpo.protocolo; // T1
    p2 = (await ctx.api.post('/api/portal/me/atendimentos', novo(), { usuario: 'u-aluno2' })).corpo.protocolo; // T2
  });
  after(() => fechar(ctx.server));

  test('aluno e professor rebaixado → 403 na fila', async () => {
    assert.equal((await ctx.api.get('/api/portal/professor/atendimentos', { usuario: 'u-aluno1' })).status, 403);
    assert.equal((await ctx.api.get('/api/portal/professor/atendimentos', { usuario: 'u-ex' })).status, 403);
  });

  test('docente geral vê os dois; docente só da T1 vê só o do aluno da T1', async () => {
    const geral = await ctx.api.get('/api/portal/professor/atendimentos', { usuario: 'u-prof' });
    assert.equal(geral.status, 200);
    assert.deepEqual(new Set(geral.corpo.itens.map(i => i.protocolo)), new Set([p1, p2]));
    const t1 = await ctx.api.get('/api/portal/professor/atendimentos', { usuario: 'u-prof-t1' });
    assert.deepEqual(t1.corpo.itens.map(i => i.protocolo), [p1]);
    assert.equal((await ctx.api.get(`/api/portal/professor/atendimentos/${p2}`, { usuario: 'u-prof-t1' })).status, 404);
    const det = await ctx.api.get(`/api/portal/professor/atendimentos/${p1}`, { usuario: 'u-prof-t1' });
    assert.equal(det.status, 200);
    assert.equal(det.corpo.aluno.id, IDS['u-aluno1']);
    assert.equal(det.corpo.roteamento.fila, 'professores_do_curso');
    semChaves(det.corpo, ['senhaHash', 'cpf', 'rg']);
  });

  test('categoria da coordenação não aparece para professor; admin vê tudo', async () => {
    const fin = (await ctx.api.post('/api/portal/me/atendimentos', novo({ categoria: 'financeiro', cursoId: null }), { usuario: 'u-aluno1' })).corpo.protocolo;
    const prof = await ctx.api.get('/api/portal/professor/atendimentos', { usuario: 'u-prof' });
    assert.ok(!prof.corpo.itens.some(i => i.protocolo === fin));
    assert.equal((await ctx.api.get(`/api/portal/professor/atendimentos/${fin}`, { usuario: 'u-prof' })).status, 404);
    const adm = await ctx.api.get('/api/portal/professor/atendimentos', { usuario: 'u-admin' });
    assert.ok(adm.corpo.itens.some(i => i.protocolo === fin));
    assert.equal(adm.corpo.contagens.aberto, adm.corpo.total);
  });

  test('reatribuição: inválida → 400; versão → 409; válida → evento, auditoria e notificação', async () => {
    const det = await ctx.api.get(`/api/portal/professor/atendimentos/${p2}`, { usuario: 'u-admin' });
    const v = det.corpo.versao;
    const semMotivo = await ctx.api.put(`/api/portal/admin/atendimentos/${p2}`, { responsavelId: IDS['u-prof'], versao: v }, { usuario: 'u-admin' });
    assert.equal(semMotivo.status, 400);
    const aluno = await ctx.api.put(`/api/portal/admin/atendimentos/${p2}`, { responsavelId: IDS['u-aluno1'], motivo: 'Atribuição de teste', versao: v }, { usuario: 'u-admin' });
    assert.equal(aluno.status, 400);
    assert.ok(aluno.corpo.campos.responsavelId);
    const outraTurma = await ctx.api.put(`/api/portal/admin/atendimentos/${p2}`, { responsavelId: IDS['u-prof-t1'], motivo: 'Atribuição de teste', versao: v }, { usuario: 'u-admin' });
    assert.equal(outraTurma.status, 400, 'docente da T1 não é professor do protocolo da T2');
    const velha = await ctx.api.put(`/api/portal/admin/atendimentos/${p2}`, { responsavelId: IDS['u-prof'], motivo: 'Atribuição de teste', versao: v + 5 }, { usuario: 'u-admin' });
    assert.equal(velha.status, 409);
    assert.equal(velha.corpo.codigo, 'conflito-versao');
    const prof = await ctx.api.put(`/api/portal/admin/atendimentos/${p2}`, { responsavelId: IDS['u-prof'], motivo: 'Atribuição de teste', versao: v }, { usuario: 'u-prof' });
    assert.equal(prof.status, 403);
    const ok = await ctx.api.put(`/api/portal/admin/atendimentos/${p2}`, { responsavelId: IDS['u-prof'], motivo: 'Atribuição de teste', versao: v }, { usuario: 'u-admin' });
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.roteamento.responsavelId, IDS['u-prof']);
    assert.equal(ok.corpo.eventos.length, 1);
    const aud = await ctx.banco.collection('auditoria').findOne({ acao: 'protocolo.reatribuido', 'entidade.id': p2 });
    assert.equal(aud.estado, 'concluido');
    assert.equal(aud.motivo, 'Atribuição de teste');
    assert.ok(await ctx.banco.collection('notificacoes').findOne({ userId: IDS['u-prof'], tipo: 'protocolo.atribuido' }));
    const meus = await ctx.api.get('/api/portal/professor/atendimentos?meus=1', { usuario: 'u-prof' });
    assert.deepEqual(meus.corpo.itens.map(i => i.protocolo), [p2]);
  });

  test('auditoria indisponível na reatribuição → 503 auditoria-indisponivel e nada muda', async () => {
    const antes = await ctx.banco.collection('protocolos').findOne({ protocolo: p1 });
    ctx.banco.falhar.insertOne = (colecao) => colecao === 'auditoria';
    try {
      const r = await ctx.api.put(`/api/portal/admin/atendimentos/${p1}`, { responsavelId: IDS['u-prof'], motivo: 'Atribuição sem auditoria', versao: antes.versao }, { usuario: 'u-admin' });
      assert.equal(r.status, 503);
      assert.equal(r.corpo.codigo, 'auditoria-indisponivel');
    } finally {
      delete ctx.banco.falhar.insertOne;
    }
    const depois = await ctx.banco.collection('protocolos').findOne({ protocolo: p1 });
    assert.equal(depois.versao, antes.versao);
    assert.equal(depois.roteamento.responsavelId, antes.roteamento.responsavelId);
  });

  test('abertosDoEscopo e abertosDoAluno', async () => {
    const reqDe = async nome => ({ user: await ctx.banco.collection('users').findOne({ _id: (await import('mongodb')).ObjectId.createFromHexString(IDS[nome]) }) });
    const escopo = ctx.servicos.obter('atendimento.abertosDoEscopo');
    const t1 = await escopo(await reqDe('u-prof-t1'), ['curso-01']);
    assert.equal(t1.porCurso['curso-01'], 1);
    const abertos = await ctx.servicos.obter('atendimento.abertosDoAluno')(IDS['u-aluno1']);
    assert.ok(abertos.some(a => a.protocolo === p1));
  });

  test('busca `atendimentos`: protocolo alheio nunca aparece para o aluno', async () => {
    const reqAluno2 = { user: { _id: IDS['u-aluno2'], papel: 'aluno' } };
    const g = await executarBusca(ctx.servicos, reqAluno2, regexBusca(p1), { tipos: ['atendimentos'] });
    assert.deepEqual(g.atendimentos.itens, []);
    const reqAluno1 = { user: { _id: IDS['u-aluno1'], papel: 'aluno' } };
    const g1 = await executarBusca(ctx.servicos, reqAluno1, regexBusca(p1), { tipos: ['atendimentos'] });
    assert.deepEqual(g1.atendimentos.itens.map(i => i.id), [p1]);
    assert.equal(g1.atendimentos.itens[0].href, `atendimentos.html?protocolo=${p1}`);
  });
});

describe('pedido da loja (abrirProtocolo com pedido, DC-69)', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('grava o pedido congelado com `em`; devolve no detalhe do titular e da equipe; ?pedido=1 só para admin', async () => {
    const abrir = ctx.servicos.obter('atendimento.abrirProtocolo');
    const pedido = { chave: 'curso-01,curso-02', cursoIds: ['curso-01', 'curso-02'], itens: [{ cursoId: 'curso-01', titulo: 'Curso de Teste APE', valorCentavos: 49700 }, { cursoId: 'curso-02', titulo: 'Curso de Teste Sem Sigla', valorCentavos: null }], totalCentavos: null };
    const { protocolo } = await abrir({ userId: IDS['u-aluno1'], categoria: 'financeiro', assunto: 'Pedido de matrícula', mensagem: 'Pedido registrado pela loja.', origem: 'humano', pedido });
    const doc = await ctx.banco.collection('protocolos').findOne({ protocolo });
    assert.ok(doc.pedido.em instanceof Date);
    assert.equal(doc.roteamento.fila, 'coordenacao');
    const det = await ctx.api.get(`/api/portal/me/atendimentos/${protocolo}`, { usuario: 'u-aluno1' });
    assert.equal(det.corpo.pedido.itens[0].valorCentavos, 49700);
    assert.equal(det.corpo.pedido.totalCentavos, null);
    const eq = await ctx.api.get(`/api/portal/professor/atendimentos/${protocolo}`, { usuario: 'u-admin' });
    assert.equal(eq.corpo.pedido.itens.length, 2);
    await ctx.api.post('/api/portal/me/atendimentos', novo({ categoria: 'financeiro', cursoId: null }), { usuario: 'u-aluno1' });
    const fila = await ctx.api.get('/api/portal/professor/atendimentos?pedido=1', { usuario: 'u-admin' });
    assert.deepEqual(fila.corpo.itens.map(i => i.protocolo), [protocolo]);
    assert.equal(fila.corpo.itens[0].pedido.itens.length, 2);
    const prof = await ctx.api.get('/api/portal/professor/atendimentos?pedido=1', { usuario: 'u-prof' });
    assert.deepEqual(prof.corpo.itens, []);
  });

  test('pedido fora de financeiro → erro de programação', async () => {
    const abrir = ctx.servicos.obter('atendimento.abrirProtocolo');
    await assert.rejects(abrir({ userId: IDS['u-aluno1'], categoria: 'academico', assunto: 'Pedido de matrícula', mensagem: 'Pedido registrado.', pedido: { chave: 'x', cursoIds: [], itens: [], totalCentavos: null } }), TypeError);
  });
});

describe('grupos: painel, relatório e exportador (dados reais, sem número inventado)', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('painel `atendimentos`, relatório `atendimentos` (com resumir) e exportador do titular', async () => {
    const vazio = ctx.servicos.todos('relatorio').find(r => r.id === 'atendimentos');
    const resumoVazio = await vazio.resumir({ user: { _id: IDS['u-admin'], isAdmin: true } }, {});
    assert.equal(resumoVazio.kpis.find(k => k.chave === 'horasMediaPrimeiraResposta').valor, null);
    const p = (await ctx.api.post('/api/portal/me/atendimentos', novo(), { usuario: 'u-aluno1' })).corpo.protocolo;
    await ctx.api.post('/api/portal/me/atendimentos', novo({ categoria: 'privacidade', pedidoTitular: 'eliminacao', cursoId: null }), { usuario: 'u-aluno1' });
    await ctx.api.post(`/api/portal/professor/atendimentos/${p}/mensagens`, { texto: 'Resposta.' }, { usuario: 'u-prof' });
    const painel = ctx.servicos.todos('painel').find(d => d.bloco === 'atendimentos');
    const v = await painel.contar({ user: { _id: IDS['u-admin'], isAdmin: true } }, { cursoIds: null });
    assert.equal(v.abertosPorCategoria.privacidade, 1);
    assert.equal(v.aguardandoAluno, 1);
    assert.equal(v.privacidadeVencendo7d, 0);
    assert.equal(typeof v.horasMediaPrimeiraResposta30d, 'number');
    const linhas = await vazio.consultar({}, {});
    assert.equal(linhas.length, 2);
    assert.ok(linhas.every(l => !Object.hasOwn(l, 'cpf')));
    const resumo = await vazio.resumir({}, {});
    assert.equal(resumo.kpis.find(k => k.chave === 'abertos').valor, 1);
    assert.equal(resumo.kpis.find(k => k.chave === 'respondidos').valor, 1);
    const exp = ctx.servicos.todos('exportador').find(e => e.dominio === 'atendimentos');
    const dados = await exp.exportar(IDS['u-aluno1']);
    assert.equal(dados.length, 2);
    semChaves(dados, ['userId', 'autorId', 'roteamento', 'senhaHash']);
    assert.deepEqual(await exp.exportar(IDS['u-aluno2']), []);
  });
});

describe('limite persistente de criação', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('6ª criação na hora → 429 com Retry-After', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await ctx.api.post('/api/portal/me/atendimentos', novo({ categoria: 'tecnico', cursoId: null, assunto: `Acesso ${i + 1} ao portal` }), { usuario: 'u-aluno2' });
      assert.equal(r.status, 201, `criação ${i + 1}`);
    }
    const sexta = await ctx.api.post('/api/portal/me/atendimentos', novo({ categoria: 'tecnico', cursoId: null }), { usuario: 'u-aluno2' });
    assert.equal(sexta.status, 429);
    assert.equal(sexta.corpo.codigo, 'limite');
    assert.ok(Number(sexta.headers.get('retry-after')) > 0);
    const outro = await ctx.api.post('/api/portal/me/atendimentos', novo(), { usuario: 'u-aluno1' });
    assert.equal(outro.status, 201, 'o limite é por usuário');
  });
});

describe('sem o serviço da secretaria (F4a ausente)', () => {
  let ctx;
  before(async () => { ctx = await subirPortal({ comMatricula: false }); });
  after(() => fechar(ctx.server));

  test('roteia sem turma: só a docência geral vê (nunca o docente de turma)', async () => {
    const p = (await ctx.api.post('/api/portal/me/atendimentos', novo(), { usuario: 'u-aluno1' })).corpo.protocolo;
    const geral = await ctx.api.get('/api/portal/professor/atendimentos', { usuario: 'u-prof' });
    assert.ok(geral.corpo.itens.some(i => i.protocolo === p));
    const t1 = await ctx.api.get('/api/portal/professor/atendimentos', { usuario: 'u-prof-t1' });
    assert.ok(!t1.corpo.itens.some(i => i.protocolo === p));
  });
});

// ---------------------------------------------------------------------------
// Protocolo vindo do assistente e reatribuído (API §6.10.3; achado de segurança da
// fase 2, A01/minimização). O anexo e o resumo são preparados para a fila do momento do
// escalonamento; a reatribuição não pode levar ao professor o que foi preparado só para
// a coordenação. O escalonamento é reproduzido com as MESMAS funções do ia.js (F6b),
// para que uma mudança de formato lá derrube este teste em vez de reabrir o vazamento.
// ---------------------------------------------------------------------------
const IA = await import('../src/routes/portal/ia.js');

const PAR_ACADEMICO = [
  { papel: 'aluno', texto: 'Como está o módulo 1?', ferramentas: [] },
  { papel: 'assistente', texto: 'No módulo 1 a sua situação é Cursando.', ferramentas: [{ nome: 'minhas_notas_e_situacao', ok: true }] }
];
const PAR_FINANCEIRO = [
  { papel: 'aluno', texto: 'Tenho algo em aberto?', ferramentas: [] },
  { papel: 'assistente', texto: 'Você tem 1 lançamento em atraso: Mensalidade, R$ 890,00, vencido em 2026-10-05.', ferramentas: [{ nome: 'meus_lancamentos_em_aberto', ok: true }] }
];
const CONVERSA_IA = [...PAR_ACADEMICO, ...PAR_FINANCEIRO]; // a última resposta é a sensível

/** O que o `POST /me/ia/conversas/:id/escalar` faz, com o resumo sugerido aceito sem edição. */
async function escalarDaIa(ctx, { categoria, cursoId = null, incluirConversa = true, conversa = CONVERSA_IA }) {
  const fila = IA.rotear(categoria, cursoId);
  const f = IA.filtrarAnexo(conversa, fila);
  const abrir = ctx.servicos.obter('atendimento.abrirProtocolo');
  const r = await abrir({
    userId: IDS['u-aluno1'], categoria, assunto: 'Dúvida levada do assistente', mensagem: IA.resumoExtrativo(f.mensagens),
    cursoId, origem: 'ia', anexoConversa: incluirConversa ? { mensagens: f.mensagens.map(m => ({ papel: m.papel, texto: m.texto, em: new Date() })), omitidas: f.omitidas } : null
  });
  return { protocolo: r.protocolo, fila, omitidas: f.omitidas };
}

const SENSIVEL = ['890', '2026-10-05', 'Mensalidade'];
const semSensivel = (corpo, rotulo) => {
  const s = JSON.stringify(corpo);
  for (const x of SENSIVEL) assert.ok(!s.includes(x), `${rotulo}: "${x}" chegou ao professor`);
};

describe('protocolo da IA reatribuído: o que foi preparado para a coordenação não chega ao professor', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('a mesma regra de fila no ia.js (F6b) e no rotear() da F6a', () => {
    for (const categoria of ['academico', 'secretaria', 'financeiro', 'tecnico']) {
      for (const cursoId of [null, 'curso-01']) assert.equal(IA.rotear(categoria, cursoId), P.rotear({ categoria, cursoId }).fila, `${categoria}/${cursoId}`);
    }
  });

  test('financeiro → acadêmico do curso: o professor passa a ver o protocolo, mas não a conversa nem a resposta do assistente; a coordenação segue vendo tudo', async () => {
    const { protocolo, fila, omitidas } = await escalarDaIa(ctx, { categoria: 'financeiro' });
    assert.equal(fila, 'coordenacao');
    assert.equal(omitidas, 0, 'a coordenação recebe a conversa inteira');
    const gravado = await ctx.banco.collection('protocolos').findOne({ protocolo });
    assert.equal(gravado.filaNaAbertura, 'coordenacao');
    assert.equal(gravado.anexoConversa.filtradoPara, 'coordenacao');
    assert.equal((await ctx.api.get(`/api/portal/professor/atendimentos/${protocolo}`, { usuario: 'u-prof' })).status, 404);

    const adm = await ctx.api.get(`/api/portal/professor/atendimentos/${protocolo}`, { usuario: 'u-admin' });
    assert.equal(adm.corpo.anexoConversa.mensagens.length, 4);
    const re = await ctx.api.put(`/api/portal/admin/atendimentos/${protocolo}`, { categoria: 'academico', cursoId: 'curso-01', motivo: 'A questão é do curso, não financeira', versao: adm.corpo.versao }, { usuario: 'u-admin' });
    assert.equal(re.status, 200, JSON.stringify(re.corpo));
    assert.equal(re.corpo.roteamento.fila, 'professores_do_curso');
    assert.equal(re.corpo.anexoConversa.mensagens.length, 4, 'a resposta da reatribuição é da coordenação: completa');
    assert.ok(re.corpo.mensagens[0].texto.includes('R$ 890,00'));
    const aud = await ctx.banco.collection('auditoria').findOne({ acao: 'protocolo.reatribuido', 'entidade.id': protocolo });
    assert.equal(aud.extra.origem, 'ia');
    assert.equal(aud.extra.preparadoPara, 'coordenacao');
    assert.equal(aud.extra.recorteParaProfessores, true);

    for (const quem of ['u-prof', 'u-prof-t1']) {
      const prof = await ctx.api.get(`/api/portal/professor/atendimentos/${protocolo}`, { usuario: quem });
      assert.equal(prof.status, 200, quem);
      semSensivel(prof.corpo, quem);
      assert.deepEqual(prof.corpo.anexoConversa.mensagens, [], `${quem}: nenhuma mensagem do anexo`);
      assert.equal(prof.corpo.anexoConversa.omitidas, 2, `${quem}: os 2 pares contam como omitidos`);
      assert.ok(prof.corpo.mensagens[0].texto.includes('Tenho algo em aberto?'), 'as perguntas (texto da própria aluna) continuam');
      assert.ok(prof.corpo.mensagens[0].texto.includes(P.AVISO_RESERVADO_COORDENACAO));
    }
    const aluna = await ctx.api.get(`/api/portal/me/atendimentos/${protocolo}`, { usuario: 'u-aluno1' });
    assert.ok(JSON.stringify(aluna.corpo).includes('R$ 890,00'), 'a titular continua vendo a própria conversa');
    const depois = await ctx.api.get(`/api/portal/professor/atendimentos/${protocolo}`, { usuario: 'u-admin' });
    assert.equal(depois.corpo.anexoConversa.mensagens.length, 4, 'nada foi apagado: o recorte é na leitura');
  });

  test('variante: continua na coordenação e é atribuído a professor do curso (sem anexo) → o resumo perde a resposta do assistente', async () => {
    const { protocolo } = await escalarDaIa(ctx, { categoria: 'financeiro', cursoId: 'curso-01', incluirConversa: false });
    const adm = await ctx.api.get(`/api/portal/professor/atendimentos/${protocolo}`, { usuario: 'u-admin' });
    assert.equal(adm.corpo.anexoConversa, null);
    const re = await ctx.api.put(`/api/portal/admin/atendimentos/${protocolo}`, { responsavelId: IDS['u-prof'], motivo: 'Professora vai orientar a aluna', versao: adm.corpo.versao }, { usuario: 'u-admin' });
    assert.equal(re.status, 200, JSON.stringify(re.corpo));
    assert.equal(re.corpo.roteamento.fila, 'coordenacao');
    const prof = await ctx.api.get(`/api/portal/professor/atendimentos/${protocolo}`, { usuario: 'u-prof' });
    assert.equal(prof.status, 200);
    semSensivel(prof.corpo, 'u-prof');
    assert.equal(prof.corpo.anexoConversa, null);
    assert.ok(prof.corpo.mensagens[0].texto.includes(P.AVISO_RESERVADO_COORDENACAO));
  });

  test('escalado direto para a fila de professores: o anexo já filtrado continua visível ao professor, também depois de atribuído a ele', async () => {
    const { protocolo, fila, omitidas } = await escalarDaIa(ctx, { categoria: 'academico', cursoId: 'curso-01' });
    assert.equal(fila, 'professores_do_curso');
    assert.equal(omitidas, 1);
    const prof = await ctx.api.get(`/api/portal/professor/atendimentos/${protocolo}`, { usuario: 'u-prof' });
    assert.equal(prof.status, 200);
    assert.deepEqual(prof.corpo.anexoConversa.mensagens.map(m => m.texto), PAR_ACADEMICO.map(m => m.texto));
    assert.equal(prof.corpo.anexoConversa.omitidas, 1);
    semSensivel(prof.corpo, 'u-prof');
    assert.ok(!prof.corpo.mensagens[0].texto.includes(P.AVISO_RESERVADO_COORDENACAO), 'resumo preparado para professores fica intacto');
    const re = await ctx.api.put(`/api/portal/admin/atendimentos/${protocolo}`, { responsavelId: IDS['u-prof'], motivo: 'Atribuição à professora do curso', versao: prof.corpo.versao }, { usuario: 'u-admin' });
    assert.equal(re.status, 200);
    const depois = await ctx.api.get(`/api/portal/professor/atendimentos/${protocolo}`, { usuario: 'u-prof' });
    assert.equal(depois.corpo.anexoConversa.mensagens.length, 2);
  });

  test('protocolo antigo, sem a marca da fila de abertura: na dúvida, reservado à coordenação; protocolo humano não é recortado', () => {
    const base = {
      protocolo: 'ATD-2026-ABCDEF', userId: IDS['u-aluno1'], categoria: 'academico', assunto: 'Dúvida', status: 'aberto', origem: 'ia', versao: 3,
      roteamento: { fila: 'professores_do_curso', cursoId: 'curso-01', turmaId: null, responsavelId: null },
      mensagens: [{ id: 'm-1', autorPapel: 'aluno', autorNome: 'Aluna', texto: IA.resumoExtrativo(PAR_FINANCEIRO), em: new Date() }],
      anexoConversa: { mensagens: PAR_FINANCEIRO.map(m => ({ papel: m.papel, texto: m.texto, em: new Date() })), omitidas: 0 }
    };
    const reatribuido = { ...base, eventos: [{ tipo: 'reatribuido', texto: 'Coordenação moveu para Acadêmico', em: new Date() }] };
    const prof = P.detalheDaEquipe(reatribuido, { leitor: 'professor' });
    semSensivel(prof, 'antigo reatribuído');
    assert.deepEqual(prof.anexoConversa, { mensagens: [], omitidas: 1 });
    assert.equal(P.detalheDaEquipe(reatribuido, { leitor: 'admin' }).anexoConversa.mensagens.length, 2);
    // sem reatribuição e na fila de professores desde a abertura: foi filtrado para eles
    const direto = P.detalheDaEquipe({ ...base, eventos: [] }, { leitor: 'professor' });
    assert.equal(direto.anexoConversa.mensagens.length, 2);
    // omitidas > 0 só acontece no filtro da fila de professores
    const filtrado = P.detalheDaEquipe({ ...reatribuido, anexoConversa: { mensagens: PAR_ACADEMICO, omitidas: 1 } }, { leitor: 'professor' });
    assert.equal(filtrado.anexoConversa.mensagens.length, 2);
    // sem `leitor`, vale o recorte (padrão fechado)
    semSensivel(P.detalheDaEquipe(reatribuido), 'sem leitor');
    // protocolo humano: a 1ª mensagem é da aluna e nunca é recortada
    const humano = P.detalheDaEquipe({ ...reatribuido, origem: 'humano', anexoConversa: null }, { leitor: 'professor' });
    assert.equal(humano.mensagens[0].texto, base.mensagens[0].texto);
  });
});
