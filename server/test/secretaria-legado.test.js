// Portal · F4a — /api/liberacoes (legado) com a matrícula materializada (PORTAL-API §6.13,
// §8.2; índice D-49, R12). O CONTRATO da rota não muda: mesmos status e corpos de hoje.
// A simulação de pagamento é coberta aqui com `devSimularPagamento:true` injetado na
// fábrica (no E2E o serve.mjs força a flag desligada e só o 404 é conferido).
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso, criarLogEspiao } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';

const M = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const { criarTratarErroGlobal } = await import('../src/portal/erros.js');
const { INDICES_SECRETARIA } = await import('../src/portal/secretaria/repositorios.js');
const { criarRotaLiberacoes } = await import('../src/routes/liberacoes.js');

const CFG_TESTE = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });
const MODULO = M.MODULOS_PADRAO.find(m => m.caminho === 'routes/portal-turmas.js');

/**
 * App no formato do server.js: agregador (com ou sem a F4a) ANTES de /api/liberacoes.
 * `comPortal:false` = rota legada sem nenhum serviço (módulo isolado ou instância fria).
 */
async function subirApp({ comPortal = true, devSimularPagamento = false, log = silencioso } = {}) {
  const banco = criarBancoMemoria({ indices: [...especificacoesRegistradas(), ...INDICES_SECRETARIA] });
  await semear(banco);
  const servicos = criarServicos();
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  let portal = null;
  if (comPortal) {
    portal = M.montarPortal({
      getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
      servicos, modulos: [MODULO], configPortal: CFG_TESTE, falharCedo: true, log: silencioso
    });
    app.use('/api', portal);
  }
  app.use('/api/liberacoes', criarRotaLiberacoes({
    colecoes: { users: () => banco.collection('users'), liberacoes: () => banco.collection('liberacoes'), cursos: () => banco.collection('cursos') },
    exigirLogin: requireAuth, exigirAdmin: requireAdmin, devSimularPagamento, servicos, log
  }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  return { api: cliente(base), server, banco, servicos, portal };
}

const vigentes = (banco, userId, cursoId) => banco.documentos('matriculas').filter(m => m.userId === userId && m.cursoId === cursoId && m.vigente === true);

describe('/api/liberacoes — contrato inalterado + matrícula materializada', () => {
  let ctx;
  beforeEach(async () => { if (ctx) await fechar(ctx.server); ctx = await subirApp(); });
  after(() => fechar(ctx?.server));

  test('GET /me do aluno: { cursoIds } (inalterado); sem sessão 401', async () => {
    const r = await ctx.api.get('/api/liberacoes/me', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { cursoIds: ['curso-01'] });
    assert.equal((await ctx.api.get('/api/liberacoes/me')).status, 401);
  });

  test('GET admin: { byEmail } (inalterado); aluno 403', async () => {
    const r = await ctx.api.get('/api/liberacoes', { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { byEmail: { 'aluno1@exemplo.invalid': ['curso-01'], 'aluno2@exemplo.invalid': ['curso-01'] } });
    assert.equal((await ctx.api.get('/api/liberacoes', { usuario: 'u-aluno1' })).status, 403);
  });

  test('POST admin: mesma resposta; cria a matrícula (origem liberação) e audita sem e-mail em claro', async () => {
    const r = await ctx.api.post('/api/liberacoes', { email: 'intruso@exemplo.invalid', cursoIds: ['curso-01', 'curso-02'] }, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { ok: true, liberados: 2 });
    assert.equal(vigentes(ctx.banco, IDS['u-intruso'], 'curso-01').length, 1);
    assert.equal(vigentes(ctx.banco, IDS['u-intruso'], 'curso-02').length, 1);
    assert.equal(vigentes(ctx.banco, IDS['u-intruso'], 'curso-01')[0].origem, 'liberacao');
    const aud = ctx.banco.documentos('auditoria').filter(a => a.acao === 'liberacao.concedida');
    assert.equal(aud.length, 1);
    assert.equal(aud[0].alvoUserId, IDS['u-intruso']);
    assert.deepEqual(aud[0].extra.cursoIds, ['curso-01', 'curso-02']);
    assert.match(aud[0].extra.emailHmac, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(ctx.banco.documentos('auditoria')).includes('intruso@exemplo.invalid'), false);
    // de novo: não duplica (liberação idempotente, matrícula idempotente)
    const r2 = await ctx.api.post('/api/liberacoes', { email: 'intruso@exemplo.invalid', cursoIds: ['curso-01'] }, { usuario: 'u-admin' });
    assert.deepEqual(r2.corpo, { ok: true, liberados: 1 });
    assert.equal(ctx.banco.documentos('matriculas').filter(m => m.userId === IDS['u-intruso']).length, 2);
  });

  test('POST admin: erros com os textos de hoje (400 sem e-mail, 400 sem curso, 404 conta, 404 curso)', async () => {
    const semEmail = await ctx.api.post('/api/liberacoes', { cursoIds: ['curso-01'] }, { usuario: 'u-admin' });
    assert.deepEqual([semEmail.status, semEmail.corpo], [400, { error: 'Informe o e-mail do aluno.' }]);
    const semCurso = await ctx.api.post('/api/liberacoes', { email: 'intruso@exemplo.invalid', cursoIds: [] }, { usuario: 'u-admin' });
    assert.deepEqual([semCurso.status, semCurso.corpo], [400, { error: 'Selecione ao menos um curso.' }]);
    const conta = await ctx.api.post('/api/liberacoes', { email: 'ninguem@exemplo.invalid', cursoIds: ['curso-01'] }, { usuario: 'u-admin' });
    assert.equal(conta.status, 404);
    assert.equal(conta.corpo.error, 'Aluno ninguem@exemplo.invalid não tem conta na plataforma. Peça para ele se cadastrar primeiro.');
    const curso = await ctx.api.post('/api/liberacoes', { email: 'intruso@exemplo.invalid', cursoIds: ['nao-existe'] }, { usuario: 'u-admin' });
    assert.deepEqual([curso.status, curso.corpo], [404, { error: 'Curso(s) não encontrado(s): nao-existe' }]);
    assert.equal(ctx.banco.documentos('matriculas').filter(m => m.userId === IDS['u-intruso']).length, 0);
  });

  test('POST: falha da matrícula não muda a resposta (melhor esforço)', async () => {
    ctx.banco.falhar.insertOne = 'matriculas';
    const r = await ctx.api.post('/api/liberacoes', { email: 'intruso@exemplo.invalid', cursoIds: ['curso-02'] }, { usuario: 'u-admin' });
    delete ctx.banco.falhar.insertOne;
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { ok: true, liberados: 1 });
    assert.ok(await ctx.banco.collection('liberacoes').findOne({ userId: IDS['u-intruso'], cursoId: 'curso-02' }));
    // a matrícula aparece na próxima leitura (garantirMatricula é idempotente)
    const m = await ctx.servicos.obter('secretaria.garantirMatricula')(IDS['u-intruso'], 'curso-02');
    assert.equal(m.status, 'ativa');
  });

  test('DELETE: mesma resposta; NÃO cancela a matrícula (semAcesso:true); audita a revogação', async () => {
    const r = await ctx.api.del('/api/liberacoes?email=aluno1@exemplo.invalid&cursoId=curso-01', { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { ok: true, revogados: 1 });
    const m = await ctx.servicos.obter('secretaria.garantirMatricula')(IDS['u-aluno1'], 'curso-01');
    assert.equal(m.status, 'ativa');
    assert.equal(m.semAcesso, true);
    const aud = ctx.banco.documentos('auditoria').filter(a => a.acao === 'liberacao.revogada');
    assert.equal(aud.length, 1);
    assert.deepEqual(aud[0].extra.cursoIds, ['curso-01']);
    const lista = await ctx.api.get(`/api/portal/admin/matriculas?userId=${IDS['u-aluno1']}`, { usuario: 'u-admin' });
    assert.equal(lista.corpo.itens[0].semAcesso, true);
    const nada = await ctx.api.del('/api/liberacoes?email=ninguem@exemplo.invalid', { usuario: 'u-admin' });
    assert.deepEqual(nada.corpo, { ok: true, revogados: 0 });
    const semEmail = await ctx.api.del('/api/liberacoes', { usuario: 'u-admin' });
    assert.deepEqual([semEmail.status, semEmail.corpo], [400, { error: 'Informe o e-mail do aluno.' }]);
  });

  test('sem DEV_SIMULAR_PAGAMENTO a simulação não existe (404 da API)', async () => {
    const r = await ctx.api.post('/api/liberacoes/dev/simular-pagamento', { cursoIds: ['curso-02'] }, { usuario: 'u-aluno1' });
    assert.equal(r.status, 404);
  });
});

describe('/api/liberacoes/dev/simular-pagamento com a flag injetada (D-49)', () => {
  let ctx;
  before(async () => { ctx = await subirApp({ devSimularPagamento: true }); });
  after(() => fechar(ctx.server));

  test('mesmo contrato e resposta; garantirMatricula chamado; auditoria', async () => {
    const r = await ctx.api.post('/api/liberacoes/dev/simular-pagamento', { cursoIds: ['curso-02', 'nao-existe'] }, { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { ok: true, liberados: 1 });
    assert.equal(vigentes(ctx.banco, IDS['u-aluno1'], 'curso-02').length, 1);
    assert.equal(ctx.banco.documentos('auditoria').filter(a => a.acao === 'liberacao.concedida').length, 1);
    const vazio = await ctx.api.post('/api/liberacoes/dev/simular-pagamento', { cursoIds: [] }, { usuario: 'u-aluno1' });
    assert.deepEqual([vazio.status, vazio.corpo], [400, { error: 'Nenhum curso informado.' }]);
    const desconhecido = await ctx.api.post('/api/liberacoes/dev/simular-pagamento', { cursoIds: ['nao-existe'] }, { usuario: 'u-aluno1' });
    assert.deepEqual([desconhecido.status, desconhecido.corpo], [404, { error: 'Curso(s) não encontrado(s).' }]);
    assert.equal((await ctx.api.post('/api/liberacoes/dev/simular-pagamento', { cursoIds: ['curso-02'] })).status, 401);
  });
});

describe('/api/liberacoes sem os serviços do portal (módulo isolado): comportamento legado + aviso', () => {
  let ctx;
  const log = criarLogEspiao();
  before(async () => { ctx = await subirApp({ comPortal: false, devSimularPagamento: true, log }); });
  after(() => fechar(ctx.server));

  test('POST, DELETE e simulação respondem como hoje, sem 503, e avisam no log', async () => {
    const r = await ctx.api.post('/api/liberacoes', { email: 'intruso@exemplo.invalid', cursoIds: ['curso-02'] }, { usuario: 'u-admin' });
    assert.deepEqual([r.status, r.corpo], [200, { ok: true, liberados: 1 }]);
    const s = await ctx.api.post('/api/liberacoes/dev/simular-pagamento', { cursoIds: ['curso-02'] }, { usuario: 'u-aluno2' });
    assert.deepEqual([s.status, s.corpo], [200, { ok: true, liberados: 1 }]);
    const d = await ctx.api.del('/api/liberacoes?email=intruso@exemplo.invalid&cursoId=curso-02', { usuario: 'u-admin' });
    assert.deepEqual([d.status, d.corpo], [200, { ok: true, revogados: 1 }]);
    assert.equal(ctx.banco.documentos('matriculas').length, 2, 'só as da fixture');
    const linhas = JSON.stringify(log.linhas ?? log.chamadas ?? log);
    assert.match(linhas, /garantirMatricula ausente/);
  });
});
