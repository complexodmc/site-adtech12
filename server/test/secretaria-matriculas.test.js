// Portal · F4a — turmas, matrículas e serviços secretaria.* (PORTAL-API §6.8.1–§6.8.2,
// §4.4, §8.1–§8.2; índice §8.5 linha F4a, D-49, D-78, D-79; DC-73).
// Banco em memória (test/apoio), agregador real com SÓ o módulo da fatia
// (routes/portal-turmas.js), serviços de outras fatias como falsos. Nenhum Mongo.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ObjectId } from 'mongodb';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso } from './apoio/falsos.js';

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
const MAT_RE = /^MAT-\d{4}-[2-9A-HJ-NP-Z]{6}$/;

/** Sobe o agregador só com a F4a + a rota legada de liberações (fábrica, D-49). */
async function subirPortal({ falsos = {}, devSimularPagamento = true } = {}) {
  const banco = criarBancoMemoria({ indices: [...especificacoesRegistradas(), ...INDICES_SECRETARIA] });
  await semear(banco);
  const servicos = criarServicos();
  for (const [nome, impl] of Object.entries(falsos)) servicos.registrar(nome, impl);
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: [MODULO], configPortal: CFG_TESTE, falharCedo: true, log: silencioso
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api/liberacoes', criarRotaLiberacoes({
    colecoes: { users: () => banco.collection('users'), liberacoes: () => banco.collection('liberacoes'), cursos: () => banco.collection('cursos') },
    exigirLogin: requireAuth, exigirAdmin: requireAdmin, devSimularPagamento, servicos, log: silencioso
  }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  await portal.carregar();
  return { api: cliente(base), server, banco, servicos, portal };
}

const reqDe = async (banco, nome) => ({ user: await banco.collection('users').findOne({ _id: oid(nome) }), ip: '127.0.0.1' });
const auditorias = (banco, acao) => banco.documentos('auditoria').filter(a => a.acao === acao);

// =============================================================
describe('turmas (admin)', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('sem sessão → 401; aluno e professor → 403 (requireAdmin do agregador)', async () => {
    assert.equal((await ctx.api.get('/api/portal/admin/turmas')).status, 401);
    for (const u of ['u-aluno1', 'u-prof', 'u-prof-t1']) {
      const r = await ctx.api.get('/api/portal/admin/turmas', { usuario: u });
      assert.equal(r.status, 403, u);
      const m = await ctx.api.post('/api/portal/admin/matriculas', { email: 'aluno1@exemplo.invalid', cursoId: 'curso-01' }, { usuario: u });
      assert.equal(m.status, 403, u);
    }
    assert.equal(ctx.banco.documentos('matriculas').length, 2, 'nada gravado');
  });

  test('lista com status derivado, curso e alunos; filtros por curso e status', async () => {
    const r = await ctx.api.get('/api/portal/admin/turmas?cursoId=curso-01', { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const t1 = r.corpo.itens.find(t => t.codigo === 'APE-2026-01');
    assert.deepEqual(
      { status: t1.status, alunos: t1.alunos, cursoTitulo: t1.cursoTitulo, modalidade: t1.modalidade, versao: t1.versao },
      { status: 'em_andamento', alunos: 1, cursoTitulo: 'Curso de Teste APE', modalidade: 'hibrido', versao: 1 }
    );
    const vazias = await ctx.api.get('/api/portal/admin/turmas?status=encerrada', { usuario: 'u-admin' });
    assert.deepEqual(vazias.corpo.itens, []);
  });

  test('código sugerido SIGLA-AAAA-NN pelo ano do início; sem sigla e sem código → 400', async () => {
    const r = await ctx.api.post('/api/portal/admin/turmas', { cursoId: 'curso-01', inicio: '2027-02-01', modalidade: 'ao_vivo' }, { usuario: 'u-admin' });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.turma.codigo, 'APE-2027-01');
    assert.equal(r.corpo.turma.status, 'planejada');
    const r2 = await ctx.api.post('/api/portal/admin/turmas', { cursoId: 'curso-01', inicio: '2027-08-01', modalidade: 'gravado' }, { usuario: 'u-admin' });
    assert.equal(r2.corpo.turma.codigo, 'APE-2027-02');
    const r3 = await ctx.api.post('/api/portal/admin/turmas', { cursoId: 'curso-01', inicio: '2026-11-01', modalidade: 'gravado' }, { usuario: 'u-admin' });
    assert.equal(r3.corpo.turma.codigo, 'APE-2026-03', 'segue as já existentes do ano');
    const semSigla = await ctx.api.post('/api/portal/admin/turmas', { cursoId: 'curso-02', inicio: '2027-02-01', modalidade: 'gravado' }, { usuario: 'u-admin' });
    assert.equal(semSigla.status, 400);
    assert.ok(semSigla.corpo.campos.codigo);
    assert.equal(auditorias(ctx.banco, 'turma.criada').length, 3);
  });

  test('codigo-em-uso 409; fim < início 400; modalidade inválida 400; curso inexistente 404', async () => {
    const dup = await ctx.api.post('/api/portal/admin/turmas', { cursoId: 'curso-01', codigo: 'ape-2026-01', inicio: '2026-09-01', modalidade: 'gravado' }, { usuario: 'u-admin' });
    assert.equal(dup.status, 409);
    assert.equal(dup.corpo.codigo, 'codigo-em-uso');
    const fim = await ctx.api.post('/api/portal/admin/turmas', { cursoId: 'curso-01', codigo: 'APE-X-01', inicio: '2026-09-01', fim: '2026-08-01', modalidade: 'gravado' }, { usuario: 'u-admin' });
    assert.equal(fim.status, 400);
    assert.ok(fim.corpo.campos.fim);
    const mod = await ctx.api.post('/api/portal/admin/turmas', { cursoId: 'curso-01', codigo: 'APE-X-02', inicio: '2026-09-01', modalidade: 'presencial' }, { usuario: 'u-admin' });
    assert.equal(mod.status, 400);
    const data = await ctx.api.post('/api/portal/admin/turmas', { cursoId: 'curso-01', codigo: 'APE-X-03', inicio: '2026-02-30', modalidade: 'gravado' }, { usuario: 'u-admin' });
    assert.equal(data.status, 400);
    const curso = await ctx.api.post('/api/portal/admin/turmas', { cursoId: 'nao-existe', codigo: 'APE-X-04', inicio: '2026-09-01', modalidade: 'gravado' }, { usuario: 'u-admin' });
    assert.equal(curso.status, 404);
  });

  test('PUT com versão (409 conflito-versao), curso imutável, código em uso', async () => {
    const id = IDS.T2;
    const ok = await ctx.api.put(`/api/portal/admin/turmas/${id}`, { nome: 'Turma Dois', versao: 1 }, { usuario: 'u-admin' });
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.turma.nome, 'Turma Dois');
    assert.equal(ok.corpo.turma.versao, 2);
    const velha = await ctx.api.put(`/api/portal/admin/turmas/${id}`, { nome: 'Outro', versao: 1 }, { usuario: 'u-admin' });
    assert.equal(velha.status, 409);
    assert.equal(velha.corpo.codigo, 'conflito-versao');
    const curso = await ctx.api.put(`/api/portal/admin/turmas/${id}`, { cursoId: 'curso-02', versao: 2 }, { usuario: 'u-admin' });
    assert.equal(curso.status, 400);
    const cod = await ctx.api.put(`/api/portal/admin/turmas/${id}`, { codigo: 'APE-2026-01', versao: 2 }, { usuario: 'u-admin' });
    assert.equal(cod.status, 409);
    assert.equal(cod.corpo.codigo, 'codigo-em-uso');
    const inexistente = await ctx.api.put(`/api/portal/admin/turmas/${new ObjectId().toHexString()}`, { nome: 'x', versao: 1 }, { usuario: 'u-admin' });
    assert.equal(inexistente.status, 404);
    const idRuim = await ctx.api.put('/api/portal/admin/turmas/xyz', { nome: 'x', versao: 1 }, { usuario: 'u-admin' });
    assert.equal(idRuim.status, 404);
  });

  test('DELETE: turma com matrícula → 409 tem-registros; vazia → 200 auditado', async () => {
    const preso = await ctx.api.del(`/api/portal/admin/turmas/${IDS.T1}`, { usuario: 'u-admin' });
    assert.equal(preso.status, 409);
    assert.equal(preso.corpo.codigo, 'tem-registros');
    const nova = await ctx.api.post('/api/portal/admin/turmas', { cursoId: 'curso-01', codigo: 'APE-APAGAR', inicio: '2026-12-01', modalidade: 'gravado' }, { usuario: 'u-admin' });
    const r = await ctx.api.del(`/api/portal/admin/turmas/${nova.corpo.turma.id}`, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { ok: true });
    const aud = auditorias(ctx.banco, 'turma.removida');
    assert.equal(aud.length, 1);
    assert.equal(aud[0].estado, 'concluido');
  });

  test('encerrar: status encerrada, auditado, não altera matrículas', async () => {
    const nova = await ctx.api.post('/api/portal/admin/turmas', { cursoId: 'curso-01', codigo: 'APE-ENC-01', inicio: '2026-01-10', modalidade: 'gravado' }, { usuario: 'u-admin' });
    const r = await ctx.api.post(`/api/portal/admin/turmas/${nova.corpo.turma.id}/encerrar`, { motivo: 'Fim do semestre' }, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.turma.status, 'encerrada');
    assert.equal(auditorias(ctx.banco, 'turma.encerrada').length, 1);
  });

  test('enturmação em lote: fecha a enturmação anterior, notifica, ignora o que não cabe', async () => {
    const nova = await ctx.api.post('/api/portal/admin/turmas', { cursoId: 'curso-01', codigo: 'APE-LOTE-01', inicio: '2026-09-01', modalidade: 'gravado' }, { usuario: 'u-admin' });
    const tid = nova.corpo.turma.id;
    const r = await ctx.api.post(`/api/portal/admin/turmas/${tid}/matriculas`, { matriculaIds: [IDS['mat-aluno1'], IDS['mat-aluno2'], 'xyz', new ObjectId().toHexString()] }, { usuario: 'u-admin' });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.enturmadas, 2);
    assert.equal(r.corpo.ignoradas.length, 2);
    const m1 = ctx.banco.documentos('matriculas').find(m => String(m._id) === IDS['mat-aluno1']);
    assert.equal(String(m1.turmaId), tid);
    assert.equal(m1.enturmacoes.length, 2);
    assert.ok(m1.enturmacoes[0].ate instanceof Date, 'a anterior foi fechada');
    assert.equal(m1.enturmacoes[1].turmaCodigo, 'APE-LOTE-01');
    assert.equal(m1.enturmacoes[1].ate, null);
    assert.ok(ctx.banco.documentos('notificacoes').some(n => n.tipo === 'matricula.enturmada' && n.userId === IDS['u-aluno1']));
    const repetida = await ctx.api.post(`/api/portal/admin/turmas/${tid}/matriculas`, { matriculaIds: [IDS['mat-aluno1']] }, { usuario: 'u-admin' });
    assert.equal(repetida.corpo.enturmadas, 0);
    assert.equal(repetida.corpo.ignoradas[0].motivo, 'Já está nesta turma.');
    const muitas = await ctx.api.post(`/api/portal/admin/turmas/${tid}/matriculas`, { matriculaIds: Array.from({ length: 501 }, () => new ObjectId().toHexString()) }, { usuario: 'u-admin' });
    assert.equal(muitas.status, 400);
  });
});

// =============================================================
describe('turmas do curso (professor)', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('docente geral e admin veem todas; docente de turma só a dele; sem docência 403; aluno 403', async () => {
    const geral = await ctx.api.get('/api/portal/professor/cursos/curso-01/turmas', { usuario: 'u-prof' });
    assert.equal(geral.status, 200);
    assert.deepEqual(geral.corpo.itens.map(t => t.codigo).sort(), ['APE-2026-01', 'APE-2026-02']);
    const adm = await ctx.api.get('/api/portal/professor/cursos/curso-01/turmas', { usuario: 'u-admin' });
    assert.equal(adm.corpo.itens.length, 2);
    const t1 = await ctx.api.get('/api/portal/professor/cursos/curso-01/turmas', { usuario: 'u-prof-t1' });
    assert.deepEqual(t1.corpo.itens.map(t => t.codigo), ['APE-2026-01']);
    assert.equal(t1.corpo.itens[0].alunos, 1);
    const alheio = await ctx.api.get('/api/portal/professor/cursos/curso-02/turmas', { usuario: 'u-prof' });
    assert.equal(alheio.status, 403);
    assert.equal(alheio.corpo.codigo, 'nao-docente');
    const aluno = await ctx.api.get('/api/portal/professor/cursos/curso-01/turmas', { usuario: 'u-aluno1' });
    assert.equal(aluno.status, 403);
    const ex = await ctx.api.get('/api/portal/professor/cursos/curso-01/turmas', { usuario: 'u-ex' });
    assert.equal(ex.status, 403, 'professor rebaixado perde o acesso');
  });
});

// =============================================================
describe('materialização (secretaria.garantirMatricula, §8.2)', () => {
  let ctx;
  beforeEach(async () => { if (ctx) await fechar(ctx.server); ctx = await subirPortal(); });
  after(() => fechar(ctx?.server));

  const liberar = (banco, userId, cursoId, grantedAt = new Date('2026-10-01T12:00:00Z')) =>
    banco.collection('liberacoes').insertOne({ userId, cursoId, grantedAt, grantedBy: IDS['u-admin'] });

  test('1ª leitura cria (MAT, ativa, vigente, origem liberacao, início = grantedAt); 2ª não duplica; notifica e audita', async () => {
    const garantir = ctx.servicos.obter('secretaria.garantirMatricula');
    await liberar(ctx.banco, IDS['u-intruso'], 'curso-02');
    const m = await garantir(IDS['u-intruso'], 'curso-02');
    assert.match(m.numero, MAT_RE);
    assert.equal(m.status, 'ativa');
    assert.equal(m.vigente, true);
    assert.equal(m.origem, 'liberacao');
    assert.equal(m.semAcesso, false);
    assert.equal(m.inicioEm.toISOString(), '2026-10-01T12:00:00.000Z');
    assert.equal(typeof m.id, 'string');
    const deNovo = await garantir(IDS['u-intruso'], 'curso-02');
    assert.equal(deNovo.id, m.id);
    assert.equal(ctx.banco.documentos('matriculas').filter(x => x.userId === IDS['u-intruso']).length, 1);
    const nots = ctx.banco.documentos('notificacoes').filter(n => n.tipo === 'matricula.criada');
    assert.equal(nots.length, 1);
    assert.equal(nots[0].link, `academico.html?m=${m.id}`);
    assert.equal(auditorias(ctx.banco, 'matricula.criada').length, 1);
  });

  test('sem liberação: null; vigente sem liberação → semAcesso:true; professor que só leciona não ganha matrícula', async () => {
    const garantir = ctx.servicos.obter('secretaria.garantirMatricula');
    assert.equal(await garantir(IDS['u-intruso'], 'curso-01'), null);
    assert.equal(await garantir(IDS['u-prof'], 'curso-01'), null);
    await ctx.banco.collection('liberacoes').deleteOne({ userId: IDS['u-aluno1'], cursoId: 'curso-01' });
    const m = await garantir(IDS['u-aluno1'], 'curso-01');
    assert.equal(m.id, IDS['mat-aluno1']);
    assert.equal(m.semAcesso, true);
    assert.equal(m.status, 'ativa', 'revogar a liberação não cancela a matrícula');
  });

  test('corrida: duas leituras simultâneas → uma matrícula vigente (a perdedora devolve a vencedora)', async () => {
    const garantir = ctx.servicos.obter('secretaria.garantirMatricula');
    await liberar(ctx.banco, IDS['u-intruso'], 'curso-02');
    await garantir(IDS['u-aluno1'], 'curso-01'); // índices garantidos antes do portão
    let abrir;
    ctx.banco.portoes.insertOne = new Promise(r => { abrir = r; });
    const p1 = garantir(IDS['u-intruso'], 'curso-02');
    const p2 = garantir(IDS['u-intruso'], 'curso-02');
    await new Promise(r => setTimeout(r, 30));
    abrir();
    delete ctx.banco.portoes.insertOne;
    const [a, b] = await Promise.all([p1, p2]);
    assert.equal(a.id, b.id);
    assert.equal(ctx.banco.documentos('matriculas').filter(x => x.userId === IDS['u-intruso'] && x.vigente === true).length, 1);
  });

  test('concluída com a MESMA liberação não recria; liberação nova depois de cancelada recria', async () => {
    const garantir = ctx.servicos.obter('secretaria.garantirMatricula');
    const concluir = ctx.servicos.obter('secretaria.concluirMatricula');
    const req = await reqDe(ctx.banco, 'u-admin');
    const c = await concluir(IDS['mat-aluno1'], { resultadoFinal: null, certificadoCodigo: 'DMC-ABCD-EFGH', req });
    assert.equal(c.status, 'concluida');
    const depois = await garantir(IDS['u-aluno1'], 'curso-01');
    assert.equal(depois.id, IDS['mat-aluno1'], 'devolve a concluída, sem criar outra');
    assert.equal(ctx.banco.documentos('matriculas').filter(x => x.userId === IDS['u-aluno1']).length, 1);

    const sec = ctx.servicos;
    const transicionada = await ctx.api.put(`/api/portal/admin/matriculas/${IDS['mat-aluno2']}/status`, { status: 'cancelada', motivo: 'Desistência informada pelo aluno.', versao: 1 }, { usuario: 'u-admin' });
    assert.equal(transicionada.status, 200, JSON.stringify(transicionada.corpo));
    assert.equal(await ctx.banco.collection('liberacoes').findOne({ userId: IDS['u-aluno2'], cursoId: 'curso-01' }), null, 'cancelar revoga por padrão');
    assert.equal(await sec.obter('secretaria.garantirMatricula')(IDS['u-aluno2'], 'curso-01'), null, 'sem liberação e sem vigente');
    await liberar(ctx.banco, IDS['u-aluno2'], 'curso-01', new Date(Date.now() + 60_000));
    const nova = await garantir(IDS['u-aluno2'], 'curso-01');
    assert.notEqual(nova.id, IDS['mat-aluno2']);
    assert.equal(nova.status, 'ativa');
  });

  test('serviços de leitura: matriculaVigente, matriculaPorId, matriculasDoAluno, turmasDoAluno, turmasDoCurso, alunosDoCurso, contagemAlunos', async () => {
    const s = n => ctx.servicos.obter(`secretaria.${n}`);
    assert.equal((await s('matriculaVigente')(IDS['u-aluno1'], 'curso-01')).numero, 'MAT-2026-AAAAA2');
    assert.equal(await s('matriculaVigente')(IDS['u-intruso'], 'curso-01'), null);
    const porId = await s('matriculaPorId')(IDS['mat-aluno2']);
    assert.equal(porId.turma.codigo, 'APE-2026-02');
    assert.equal(await s('matriculaPorId')('nao-e-id'), null);
    assert.equal(await s('matriculaPorId')(new ObjectId().toHexString()), null);
    assert.equal((await s('matriculasDoAluno')(IDS['u-aluno1'])).length, 1);
    assert.deepEqual(await s('turmasDoAluno')(IDS['u-aluno1']), [IDS.T1]);
    const turmas = await s('turmasDoCurso')('curso-01');
    assert.deepEqual(turmas.map(t => [t.codigo, t.alunos, t.status]).sort(), [['APE-2026-01', 1, 'em_andamento'], ['APE-2026-02', 1, 'em_andamento']]);
    const alunos = await s('alunosDoCurso')({ cursoId: 'curso-01', turmaId: IDS.T1 });
    assert.deepEqual(alunos.map(a => [a.userId, a.numero, a.turmaCodigo, a.status]), [[IDS['u-aluno1'], 'MAT-2026-AAAAA2', 'APE-2026-01', 'ativa']]);
    assert.equal((await s('alunosDoCurso')({ cursoId: 'curso-01' })).length, 2);
    assert.deepEqual(await s('contagemAlunos')('curso-01'), { ativos: 2, trancadas: 0, semTurma: 0 });
    assert.deepEqual(await s('contagemAlunos')('curso-01', { turmaIds: [IDS.T1] }), { ativos: 1, trancadas: 0, semTurma: null });
  });
});

// =============================================================
describe('máquina de estados e correções (admin)', () => {
  let ctx;
  beforeEach(async () => { if (ctx) await fechar(ctx.server); ctx = await subirPortal(); });
  after(() => fechar(ctx?.server));

  const status = (id, corpo, usuario = 'u-admin') => ctx.api.put(`/api/portal/admin/matriculas/${id}/status`, corpo, { usuario });

  test('trancar não revoga; destrancar garante; transição inválida 409; versão velha 409; motivo obrigatório', async () => {
    const id = IDS['mat-aluno1'];
    const sem = await status(id, { status: 'trancada', versao: 1 });
    assert.equal(sem.status, 400);
    assert.ok(sem.corpo.campos.motivo);
    const t = await status(id, { status: 'trancada', motivo: 'Pedido de trancamento do aluno.', versao: 1 });
    assert.equal(t.status, 200, JSON.stringify(t.corpo));
    assert.equal(t.corpo.matricula.status, 'trancada');
    assert.equal(t.corpo.matricula.vigente, true);
    assert.ok(await ctx.banco.collection('liberacoes').findOne({ userId: IDS['u-aluno1'], cursoId: 'curso-01' }), 'trancar não revoga');
    const velha = await status(id, { status: 'ativa', motivo: 'Retorno do aluno ao curso.', versao: 1 });
    assert.equal(velha.status, 409);
    assert.equal(velha.corpo.codigo, 'conflito-versao');
    const invalida = await status(id, { status: 'concluida', motivo: 'Tentativa de concluir trancada.', versao: 2 });
    assert.equal(invalida.status, 409);
    assert.equal(invalida.corpo.codigo, 'transicao-invalida');
    await ctx.banco.collection('liberacoes').deleteOne({ userId: IDS['u-aluno1'], cursoId: 'curso-01' });
    const volta = await status(id, { status: 'ativa', motivo: 'Retorno do aluno ao curso.', versao: 2 });
    assert.equal(volta.status, 200);
    assert.ok(await ctx.banco.collection('liberacoes').findOne({ userId: IDS['u-aluno1'], cursoId: 'curso-01' }), 'destrancar garante o acesso');
    const doc = ctx.banco.documentos('matriculas').find(m => String(m._id) === id);
    assert.deepEqual(doc.historico.map(h => h.status), ['ativa', 'trancada', 'ativa']);
    const aud = auditorias(ctx.banco, 'matricula.status_alterado');
    assert.equal(aud.length, 2);
    assert.ok(aud.every(a => a.estado === 'concluido' && a.motivo));
  });

  test('cancelar revoga por padrão (ou não, com revogarAcesso:false); cancelada é final; vigente some', async () => {
    const c = await status(IDS['mat-aluno1'], { status: 'cancelada', motivo: 'Cancelamento a pedido do aluno.', revogarAcesso: false, versao: 1 });
    assert.equal(c.status, 200);
    assert.equal(c.corpo.matricula.vigente, false);
    assert.ok(await ctx.banco.collection('liberacoes').findOne({ userId: IDS['u-aluno1'], cursoId: 'curso-01' }));
    const doc = ctx.banco.documentos('matriculas').find(m => String(m._id) === IDS['mat-aluno1']);
    assert.equal(Object.hasOwn(doc, 'vigente'), false);
    const final = await status(IDS['mat-aluno1'], { status: 'ativa', motivo: 'Tentativa de reabrir cancelada.', versao: 2 });
    assert.equal(final.status, 409);
    assert.equal(final.corpo.codigo, 'transicao-invalida');
  });

  test('concluir → reabrir guarda resultadoAnterior; concluirMatricula idempotente e auditado', async () => {
    const concluir = ctx.servicos.obter('secretaria.concluirMatricula');
    const req = await reqDe(ctx.banco, 'u-admin');
    const resultado = { notaFinal: 8.5, frequenciaPct: 90, cargaHorariaHoras: 12, regra: 'aprovacao', modulos: [] };
    const a = await concluir(IDS['mat-aluno1'], { resultadoFinal: resultado, certificadoCodigo: 'DMC-ABCD-EFGH', req });
    const b = await concluir(IDS['mat-aluno1'], { resultadoFinal: resultado, certificadoCodigo: 'DMC-ABCD-EFGH', req });
    assert.equal(a.status, 'concluida');
    assert.equal(b.versao, a.versao, 'segunda chamada não grava');
    assert.equal(auditorias(ctx.banco, 'matricula.status_alterado').length, 1);
    const reabre = await status(IDS['mat-aluno1'], { status: 'ativa', motivo: 'Reabertura para revisão de nota.', versao: a.versao });
    assert.equal(reabre.status, 200);
    const doc = ctx.banco.documentos('matriculas').find(m => String(m._id) === IDS['mat-aluno1']);
    assert.equal(doc.resultadoFinal, null);
    assert.deepEqual(doc.historico.at(-1).resultadoAnterior, resultado);
    assert.equal(doc.certificadoCodigo, 'DMC-ABCD-EFGH', 'certificado emitido segue válido');
    await assert.rejects(concluir(new ObjectId().toHexString(), { req }), e => e.status === 404);
  });

  test('PUT turma: troca, turma de outro curso 400, sai da turma com null', async () => {
    const outra = await ctx.banco.collection('turmas').insertOne({ cursoId: 'curso-02', codigo: 'SEM-2026-01', nome: null, inicio: '2026-08-01', fim: null, modalidade: 'gravado', encerradaEm: null, versao: 1, criadoEm: new Date(), atualizadoEm: new Date(), criadoPor: IDS['u-admin'] });
    const x = await ctx.api.put(`/api/portal/admin/matriculas/${IDS['mat-aluno1']}/turma`, { turmaId: String(outra.insertedId), versao: 1 }, { usuario: 'u-admin' });
    assert.equal(x.status, 400);
    assert.equal(x.corpo.codigo, 'turma-de-outro-curso');
    const troca = await ctx.api.put(`/api/portal/admin/matriculas/${IDS['mat-aluno1']}/turma`, { turmaId: IDS.T2, versao: 1 }, { usuario: 'u-admin' });
    assert.equal(troca.status, 200);
    assert.equal(troca.corpo.matricula.turma.codigo, 'APE-2026-02');
    assert.equal(troca.corpo.matricula.enturmacoes.length, 2);
    const sai = await ctx.api.put(`/api/portal/admin/matriculas/${IDS['mat-aluno1']}/turma`, { turmaId: null, versao: 2 }, { usuario: 'u-admin' });
    assert.equal(sai.status, 200);
    assert.equal(sai.corpo.matricula.turma, null);
    assert.equal(auditorias(ctx.banco, 'matricula.turma_alterada').length, 2);
  });

  test('PUT início e nome-em-documentos: motivo obrigatório, versão, auditoria; social sem nome social → 409', async () => {
    const semMotivo = await ctx.api.put(`/api/portal/admin/matriculas/${IDS['mat-aluno1']}/inicio`, { inicioEm: '2026-09-01', versao: 1 }, { usuario: 'u-admin' });
    assert.equal(semMotivo.status, 400);
    const ini = await ctx.api.put(`/api/portal/admin/matriculas/${IDS['mat-aluno1']}/inicio`, { inicioEm: '2026-09-01', motivo: 'Correção da data de início.', versao: 1 }, { usuario: 'u-admin' });
    assert.equal(ini.status, 200);
    assert.equal(ini.corpo.matricula.inicioEm, '2026-09-01T03:00:00.000Z');
    assert.equal(auditorias(ctx.banco, 'matricula.inicio_alterado').length, 1);
    const social = await ctx.api.put(`/api/portal/admin/matriculas/${IDS['mat-aluno1']}/nome-em-documentos`, { usar: 'social', motivo: 'Pedido do titular por e-mail.', versao: 2 }, { usuario: 'u-admin' });
    assert.equal(social.status, 409);
    assert.equal(social.corpo.codigo, 'cadastro-incompleto');
    await ctx.banco.collection('perfis').insertOne({ userId: IDS['u-aluno1'], nomeRegistro: 'Aluna Um', nomeSocial: 'Ana Um' });
    const semMot = await ctx.api.put(`/api/portal/admin/matriculas/${IDS['mat-aluno1']}/nome-em-documentos`, { usar: 'social', versao: 2 }, { usuario: 'u-admin' });
    assert.equal(semMot.status, 400);
    const ok = await ctx.api.put(`/api/portal/admin/matriculas/${IDS['mat-aluno1']}/nome-em-documentos`, { usar: 'social', motivo: 'Pedido do titular por e-mail.', versao: 2 }, { usuario: 'u-admin' });
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.matricula.nomeEmDocumentos.usar, 'social');
    assert.equal(auditorias(ctx.banco, 'matricula.nome_documentos_alterado').length, 1);
  });
});

// =============================================================
describe('matrícula manual, listagem, detalhe e sincronização (admin)', () => {
  let ctx;
  beforeEach(async () => { if (ctx) await fechar(ctx.server); ctx = await subirPortal(); });
  after(() => fechar(ctx?.server));

  test('conta sem e-mail confirmado → 409 email-nao-verificado com conta; com confirmação + motivo → 201 auditado', async () => {
    const r = await ctx.api.post('/api/portal/admin/matriculas', { email: 'intruso@exemplo.invalid', cursoId: 'curso-02' }, { usuario: 'u-admin' });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.codigo, 'email-nao-verificado');
    assert.ok(r.corpo.conta && 'criadaEm' in r.corpo.conta && 'ultimoLoginEm' in r.corpo.conta);
    const semMotivo = await ctx.api.post('/api/portal/admin/matriculas', { email: 'intruso@exemplo.invalid', cursoId: 'curso-02', confirmarSemVerificacao: true }, { usuario: 'u-admin' });
    assert.equal(semMotivo.status, 400);
    const ok = await ctx.api.post('/api/portal/admin/matriculas', { email: 'intruso@exemplo.invalid', cursoId: 'curso-02', confirmarSemVerificacao: true, motivo: 'Identidade conferida por telefone.' }, { usuario: 'u-admin' });
    assert.equal(ok.status, 201, JSON.stringify(ok.corpo));
    assert.match(ok.corpo.matricula.numero, MAT_RE);
    assert.equal(ok.corpo.matricula.origem, 'admin');
    assert.equal(ok.corpo.liberacaoCriada, true);
    assert.equal(ok.corpo.matricula.semAcesso, false);
    const aud = auditorias(ctx.banco, 'matricula.criada');
    assert.equal(aud.length, 1);
    assert.equal(aud[0].extra.semVerificacao, true);
    assert.equal(aud[0].entidade.id, ok.corpo.matricula.id);
    const dup = await ctx.api.post('/api/portal/admin/matriculas', { email: 'intruso@exemplo.invalid', cursoId: 'curso-02', confirmarSemVerificacao: true, motivo: 'Identidade conferida por telefone.' }, { usuario: 'u-admin' });
    assert.equal(dup.status, 409);
    assert.equal(dup.corpo.codigo, 'matricula-vigente-existe');
    assert.equal(dup.corpo.matriculaId, ok.corpo.matricula.id);
  });

  test('liberarAcesso:false → 201 sem liberação e semAcesso:true (D-79); turma de outro curso 400; e-mail/curso inexistentes 404', async () => {
    const r = await ctx.api.post('/api/portal/admin/matriculas', { email: '2fa@exemplo.invalid', cursoId: 'curso-01', turmaId: IDS.T1, liberarAcesso: false, inicioEm: '2026-11-03' }, { usuario: 'u-admin' });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.liberacaoCriada, false);
    assert.equal(r.corpo.matricula.semAcesso, true);
    assert.equal(r.corpo.matricula.turma.codigo, 'APE-2026-01');
    assert.equal(r.corpo.matricula.inicioEm, '2026-11-03T03:00:00.000Z');
    assert.equal(await ctx.banco.collection('liberacoes').findOne({ userId: IDS['u-2fa'] }), null);
    const outro = await ctx.api.post('/api/portal/admin/matriculas', { email: '2fa@exemplo.invalid', cursoId: 'curso-02', turmaId: IDS.T1 }, { usuario: 'u-admin' });
    assert.equal(outro.status, 400);
    assert.equal(outro.corpo.codigo, 'turma-de-outro-curso');
    assert.equal((await ctx.api.post('/api/portal/admin/matriculas', { email: 'ninguem@exemplo.invalid', cursoId: 'curso-01' }, { usuario: 'u-admin' })).status, 404);
    assert.equal((await ctx.api.post('/api/portal/admin/matriculas', { email: '2fa@exemplo.invalid', cursoId: 'nao-existe' }, { usuario: 'u-admin' })).status, 404);
    assert.equal((await ctx.api.post('/api/portal/admin/matriculas', { email: 'nao-e-email', cursoId: 'curso-01' }, { usuario: 'u-admin' })).status, 400);
  });

  test('auditoria indisponível → 503 e nada é gravado', async () => {
    ctx.banco.falhar.insertOne = 'auditoria';
    const r = await ctx.api.post('/api/portal/admin/matriculas', { email: '2fa@exemplo.invalid', cursoId: 'curso-02' }, { usuario: 'u-admin' });
    delete ctx.banco.falhar.insertOne;
    assert.equal(r.status, 503);
    assert.equal(r.corpo.codigo, 'auditoria-indisponivel');
    assert.equal(ctx.banco.documentos('matriculas').filter(m => m.userId === IDS['u-2fa']).length, 0);
    assert.equal(await ctx.banco.collection('liberacoes').findOne({ userId: IDS['u-2fa'] }), null);
  });

  test('listagem: paginada, filtros (curso, turma, status, origem, userId, q), semAcesso; sem F4b a chave contrato é omitida', async () => {
    const todas = await ctx.api.get('/api/portal/admin/matriculas', { usuario: 'u-admin' });
    assert.equal(todas.status, 200);
    assert.equal(todas.corpo.total, 2);
    assert.equal(todas.corpo.porPagina, 50);
    const item = todas.corpo.itens.find(i => i.id === IDS['mat-aluno1']);
    assert.deepEqual(item.aluno, { id: IDS['u-aluno1'], nome: 'Aluna Um de Teste', email: 'aluno1@exemplo.invalid' });
    assert.equal(item.cursoTitulo, 'Curso de Teste APE');
    assert.deepEqual(item.turma, { id: IDS.T1, codigo: 'APE-2026-01' });
    assert.equal(item.semAcesso, false);
    assert.equal(Object.hasOwn(item, 'contrato'), false, 'sem contratos.situacaoPorMatricula a chave some');
    const porTurma = await ctx.api.get(`/api/portal/admin/matriculas?turmaId=${IDS.T2}`, { usuario: 'u-admin' });
    assert.deepEqual(porTurma.corpo.itens.map(i => i.id), [IDS['mat-aluno2']]);
    const porUser = await ctx.api.get(`/api/portal/admin/matriculas?userId=${IDS['u-aluno2']}`, { usuario: 'u-admin' });
    assert.deepEqual(porUser.corpo.itens.map(i => i.id), [IDS['mat-aluno2']]);
    const userRuim = await ctx.api.get('/api/portal/admin/matriculas?userId=abc', { usuario: 'u-admin' });
    assert.deepEqual(userRuim.corpo.itens, []);
    const origem = await ctx.api.get('/api/portal/admin/matriculas?origem=admin', { usuario: 'u-admin' });
    assert.equal(origem.corpo.total, 0);
    const origem2 = await ctx.api.get('/api/portal/admin/matriculas?origem=liberacao&status=ativa&cursoId=curso-01', { usuario: 'u-admin' });
    assert.equal(origem2.corpo.total, 2);
    const q = await ctx.api.get('/api/portal/admin/matriculas?q=aluna%20um', { usuario: 'u-admin' });
    assert.deepEqual(q.corpo.itens.map(i => i.id), [IDS['mat-aluno1']]);
    const qNum = await ctx.api.get('/api/portal/admin/matriculas?q=MAT-2026-AAAAA3', { usuario: 'u-admin' });
    assert.deepEqual(qNum.corpo.itens.map(i => i.id), [IDS['mat-aluno2']]);
    const prof = await ctx.api.get('/api/portal/admin/matriculas', { usuario: 'u-prof' });
    assert.equal(prof.status, 403);
  });

  test('detalhe: completo, 404 para id inexistente ou inválido; sem academico.resumoMatricula não há resumo', async () => {
    const r = await ctx.api.get(`/api/portal/admin/matriculas/${IDS['mat-aluno1']}`, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.matricula.historico.length, 1);
    assert.equal(r.corpo.matricula.enturmacoes.length, 1);
    assert.equal(Object.hasOwn(r.corpo.matricula, 'resumo'), false);
    assert.equal(Object.hasOwn(r.corpo.matricula, 'contrato'), false);
    assert.equal((await ctx.api.get(`/api/portal/admin/matriculas/${new ObjectId().toHexString()}`, { usuario: 'u-admin' })).status, 404);
    assert.equal((await ctx.api.get('/api/portal/admin/matriculas/xyz', { usuario: 'u-admin' })).status, 404);
  });

  test('sincronizar: cria a partir das liberações sem matrícula (origem migração, sem notificar) e é idempotente', async () => {
    await ctx.banco.collection('liberacoes').insertOne({ userId: IDS['u-intruso'], cursoId: 'curso-02', grantedAt: new Date('2026-05-01T12:00:00Z'), grantedBy: IDS['u-admin'] });
    await ctx.banco.collection('liberacoes').insertOne({ userId: new ObjectId().toHexString(), cursoId: 'curso-02', grantedAt: new Date(), grantedBy: IDS['u-admin'] });
    const r = await ctx.api.post('/api/portal/admin/matriculas/sincronizar', {}, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { criadas: 1, jaExistiam: 2, semConta: 1 });
    const criada = ctx.banco.documentos('matriculas').find(m => m.userId === IDS['u-intruso']);
    assert.equal(criada.origem, 'migracao');
    assert.equal(ctx.banco.documentos('notificacoes').filter(n => n.tipo === 'matricula.criada').length, 0);
    const de2 = await ctx.api.post('/api/portal/admin/matriculas/sincronizar', {}, { usuario: 'u-admin' });
    assert.deepEqual(de2.corpo, { criadas: 0, jaExistiam: 3, semConta: 1 });
    const sem = await ctx.api.get('/api/portal/admin/matriculas/sem-matricula', { usuario: 'u-admin' });
    assert.equal(sem.status, 200);
    assert.equal(sem.corpo.total, 1, 'só a liberação órfã');
  });
});

// =============================================================
describe('ponte com a F4b (D-78): vincularContrato, matriculaPorId e contrato na lista', () => {
  let ctx;
  const contratoId = new ObjectId();
  before(async () => {
    ctx = await subirPortal({
      falsos: {
        'contratos.situacaoPorMatricula': async (ids) => new Map(ids.filter(i => i === IDS['mat-aluno1']).map(i => [i, { id: contratoId, status: 'pendente' }]))
      }
    });
  });
  after(() => fechar(ctx.server));

  test('lista e detalhe trazem contrato do serviço da F4b (null quando não há)', async () => {
    const r = await ctx.api.get('/api/portal/admin/matriculas', { usuario: 'u-admin' });
    const a1 = r.corpo.itens.find(i => i.id === IDS['mat-aluno1']);
    const a2 = r.corpo.itens.find(i => i.id === IDS['mat-aluno2']);
    assert.deepEqual(a1.contrato, { id: contratoId.toHexString(), status: 'pendente' });
    assert.equal(a2.contrato, null);
    const d = await ctx.api.get(`/api/portal/admin/matriculas/${IDS['mat-aluno1']}`, { usuario: 'u-admin' });
    assert.deepEqual(d.corpo.matricula.contrato, { id: contratoId.toHexString(), status: 'pendente' });
  });

  test('vincularContrato grava e desfaz contratoId com auditoria executar; inexistente 404; auditoria fora → 503 e nada muda', async () => {
    const vincular = ctx.servicos.obter('secretaria.vincularContrato');
    const req = await reqDe(ctx.banco, 'u-admin');
    const m = await vincular(IDS['mat-aluno1'], contratoId, { req });
    assert.equal(String(m.contratoId), contratoId.toHexString());
    const porId = await ctx.servicos.obter('secretaria.matriculaPorId')(IDS['mat-aluno1']);
    assert.equal(String(porId.contratoId), contratoId.toHexString());
    const aud = auditorias(ctx.banco, 'matricula.contrato_vinculado');
    assert.equal(aud.length, 1);
    assert.equal(aud[0].estado, 'concluido');
    const limpo = await vincular(IDS['mat-aluno1'], null, { req });
    assert.equal(limpo.contratoId, null);
    await assert.rejects(vincular(new ObjectId().toHexString(), contratoId, { req }), e => e.status === 404);
    ctx.banco.falhar.insertOne = 'auditoria';
    await assert.rejects(vincular(IDS['mat-aluno2'], contratoId, { req }), e => e.status === 503 && e.codigo === 'auditoria-indisponivel');
    delete ctx.banco.falhar.insertOne;
    const intacta = ctx.banco.documentos('matriculas').find(x => String(x._id) === IDS['mat-aluno2']);
    assert.equal(intacta.contratoId, null);
  });
});

// =============================================================
describe('grupos: painel (alunos), cascata e exportador', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('painel alunos conta de verdade; cascata bloqueia curso com matrícula e apaga turmas vazias; exportador do titular', async () => {
    const painel = ctx.servicos.todos('painel').find(d => d.bloco === 'alunos');
    await ctx.banco.collection('liberacoes').insertOne({ userId: IDS['u-intruso'], cursoId: 'curso-02', grantedAt: new Date(), grantedBy: IDS['u-admin'] });
    assert.deepEqual(await painel.contar({}, { cursoIds: null }), { comAcesso: 3, comMatriculaAtiva: 2, liberacoesSemMatricula: 1 });
    const cascata = ctx.servicos.todos('cascata').find(d => d.dominio === 'secretaria');
    assert.equal(await cascata.bloqueios({ tipo: 'curso', id: 'curso-01' }), 2);
    assert.equal(await cascata.bloqueios({ tipo: 'curso', id: 'curso-02' }), 0);
    assert.equal(await cascata.bloqueios({ tipo: 'aula', id: 'c01-m01-a01' }), 0);
    await ctx.banco.collection('turmas').insertOne({ cursoId: 'curso-02', codigo: 'VAZIA-01', inicio: '2026-01-01', modalidade: 'gravado', versao: 1 });
    await cascata.apagar({ tipo: 'curso', id: 'curso-02' });
    assert.equal(ctx.banco.documentos('turmas').filter(t => t.cursoId === 'curso-02').length, 0);
    const exp = ctx.servicos.todos('exportador').find(d => d.dominio === 'matriculas');
    const dados = await exp.exportar(IDS['u-aluno1']);
    assert.equal(dados.matriculas.length, 1);
    assert.equal(dados.matriculas[0].numero, 'MAT-2026-AAAAA2');
  });
});

// =============================================================
describe('scripts/matriculas-de-liberacoes.js (dry-run, idempotente)', () => {
  test('conferirAlvo: MONGODB_DB obrigatório; banco fora de _qa só grava com --confirmo-banco', async () => {
    const { conferirAlvo } = await import('../scripts/matriculas-de-liberacoes.js');
    assert.equal(conferirAlvo({}).ok, false);
    assert.equal(conferirAlvo({ db: 'complexodmc_portal_f4a_qa', aplicar: true }).ok, true);
    assert.equal(conferirAlvo({ db: 'complexodmc', aplicar: false }).ok, true, 'simulação é leitura');
    assert.equal(conferirAlvo({ db: 'complexodmc', aplicar: true }).ok, false);
    assert.equal(conferirAlvo({ db: 'complexodmc', aplicar: true, confirmo: 'outro' }).ok, false);
    assert.equal(conferirAlvo({ db: 'complexodmc', aplicar: true, confirmo: 'complexodmc' }).ok, true);
  });

  test('simulação não grava nada; --aplicar cria (origem migração, auditada); segunda vez não cria', async () => {
    const { migrar } = await import('../scripts/matriculas-de-liberacoes.js');
    const banco = criarBancoMemoria({ indices: [...especificacoesRegistradas(), ...INDICES_SECRETARIA] });
    await semear(banco);
    await banco.collection('liberacoes').insertOne({ userId: IDS['u-intruso'], cursoId: 'curso-01', grantedAt: new Date('2026-03-01T12:00:00Z'), grantedBy: IDS['u-admin'] });
    const antes = banco.documentos('matriculas').length;
    const sim = await migrar({ db: banco, aplicar: false, log: silencioso });
    assert.deepEqual(sim, { criadas: 1, jaExistiam: 2, semConta: 0, aplicado: false });
    assert.equal(banco.documentos('matriculas').length, antes);
    assert.equal(banco.documentos('auditoria').length, 0);
    assert.equal(banco.contagem('createIndex'), 0, 'simulação não cria índice');
    const ap = await migrar({ db: banco, aplicar: true, log: silencioso });
    assert.deepEqual(ap, { criadas: 1, jaExistiam: 2, semConta: 0, aplicado: true });
    const nova = banco.documentos('matriculas').find(m => m.userId === IDS['u-intruso']);
    assert.equal(nova.origem, 'migracao');
    assert.equal(nova.inicioEm.toISOString(), '2026-03-01T12:00:00.000Z');
    assert.match(nova.numero, MAT_RE);
    assert.equal(banco.documentos('auditoria').filter(a => a.acao === 'matricula.criada' && a.ator.papel === 'sistema').length, 1);
    assert.equal(banco.documentos('notificacoes').length, 0);
    const de2 = await migrar({ db: banco, aplicar: true, log: silencioso });
    assert.deepEqual(de2, { criadas: 0, jaExistiam: 3, semConta: 0, aplicado: true });
    assert.equal(banco.documentos('liberacoes').length, 3, 'liberações intactas');
  });
});

// =============================================================
describe('casos transversais de toda rota nova (API §9.2)', () => {
  let ctx;
  beforeEach(async () => { if (ctx) await fechar(ctx.server); ctx = await subirPortal(); });
  after(() => fechar(ctx?.server));

  const ROTAS = [
    ['get', '/api/portal/admin/turmas'], ['post', '/api/portal/admin/turmas'], ['put', `/api/portal/admin/turmas/${IDS.T1}`],
    ['post', `/api/portal/admin/turmas/${IDS.T1}/encerrar`], ['del', `/api/portal/admin/turmas/${IDS.T1}`],
    ['post', `/api/portal/admin/turmas/${IDS.T1}/matriculas`], ['get', '/api/portal/admin/matriculas'],
    ['get', '/api/portal/admin/matriculas/sem-matricula'], ['post', '/api/portal/admin/matriculas/sincronizar'],
    ['get', `/api/portal/admin/matriculas/${IDS['mat-aluno1']}`], ['post', '/api/portal/admin/matriculas'],
    ['put', `/api/portal/admin/matriculas/${IDS['mat-aluno1']}/status`], ['put', `/api/portal/admin/matriculas/${IDS['mat-aluno1']}/turma`],
    ['put', `/api/portal/admin/matriculas/${IDS['mat-aluno1']}/inicio`], ['put', `/api/portal/admin/matriculas/${IDS['mat-aluno1']}/nome-em-documentos`],
    ['get', '/api/portal/professor/cursos/curso-01/turmas']
  ];

  test('401 sem sessão e 403 para aluno em todas as rotas; no-store e X-Request-Id; requestId no corpo do erro', async () => {
    for (const [m, c] of ROTAS) {
      const r = await ctx.api[m](c, m === 'get' || m === 'del' ? undefined : {});
      assert.equal(r.status, 401, `${m} ${c}`);
      const a = await ctx.api[m](c, ...(m === 'get' || m === 'del' ? [{ usuario: 'u-aluno1' }] : [{}, { usuario: 'u-aluno1' }]));
      assert.equal(a.status, 403, `${m} ${c} (aluno)`);
    }
    const ok = await ctx.api.get('/api/portal/admin/matriculas', { usuario: 'u-admin' });
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.match(ok.headers.get('x-request-id'), /^r-[a-f0-9]{12}$/);
    const e = await ctx.api.post('/api/portal/admin/turmas', {}, { usuario: 'u-admin' });
    assert.equal(e.status, 400);
    assert.equal(e.corpo.codigo, 'validacao');
    assert.equal(e.corpo.requestId, e.headers.get('x-request-id'));
  });

  test('400 formato-invalido com objeto em campo de texto (injeção de operador)', async () => {
    const casos = [
      ['post', '/api/portal/admin/turmas', { cursoId: { $gt: '' }, inicio: '2026-11-01', modalidade: 'gravado' }],
      ['post', '/api/portal/admin/matriculas', { email: { $ne: null }, cursoId: 'curso-01' }],
      ['put', `/api/portal/admin/matriculas/${IDS['mat-aluno1']}/status`, { status: 'trancada', motivo: { $gt: '' }, versao: 1 }],
      ['put', `/api/portal/admin/matriculas/${IDS['mat-aluno1']}/turma`, { turmaId: { $ne: null }, versao: 1 }],
      ['put', `/api/portal/admin/matriculas/${IDS['mat-aluno1']}/inicio`, { inicioEm: { $gt: '' }, motivo: 'Correção da data de início.', versao: 1 }],
      ['post', `/api/portal/admin/turmas/${IDS.T1}/matriculas`, { matriculaIds: [{ $gt: '' }] }]
    ];
    for (const [m, c, corpo] of casos) {
      const r = await ctx.api[m](c, corpo, { usuario: 'u-admin' });
      assert.equal(r.status, 400, `${m} ${c}`);
      assert.equal(r.corpo.codigo, 'formato-invalido', `${m} ${c}`);
    }
    const doc = ctx.banco.documentos('matriculas').find(x => String(x._id) === IDS['mat-aluno1']);
    assert.equal(doc.versao, 1, 'nada mudou');
  });

  test('404 para id fora do padrão sem consultar o banco; 400 validacao com campos; 409 de versão', async () => {
    const antes = ctx.banco.contagem('findOne', 'matriculas');
    for (const c of ['/api/portal/admin/matriculas/xyz', '/api/portal/admin/matriculas/000000000000000000000C01']) {
      const r = await ctx.api.get(c, { usuario: 'u-admin' });
      assert.equal(r.status, 404, c);
    }
    assert.equal(ctx.banco.contagem('findOne', 'matriculas'), antes, 'id inválido não consulta');
    const v = await ctx.api.put(`/api/portal/admin/matriculas/${IDS['mat-aluno1']}/status`, { status: 'trancada', motivo: 'curto', versao: 1 }, { usuario: 'u-admin' });
    assert.equal(v.status, 400);
    assert.equal(v.corpo.codigo, 'validacao');
    assert.ok(v.corpo.campos.motivo);
    const semVersao = await ctx.api.put(`/api/portal/admin/matriculas/${IDS['mat-aluno1']}/turma`, { turmaId: IDS.T2 }, { usuario: 'u-admin' });
    assert.equal(semVersao.status, 400);
    assert.ok(semVersao.corpo.campos.versao);
  });

  test('auditoria executar fora → 503 e NADA muda (status, turma, início, nome, encerrar e remover turma)', async () => {
    const vazia = await ctx.banco.collection('turmas').insertOne({ cursoId: 'curso-01', codigo: 'APE-VAZIA', inicio: '2026-12-01', fim: null, modalidade: 'gravado', encerradaEm: null, versao: 1 });
    await ctx.banco.collection('perfis').insertOne({ userId: IDS['u-aluno1'], nomeSocial: 'Ana Um' });
    ctx.banco.falhar.insertOne = 'auditoria';
    const m = IDS['mat-aluno1'];
    const casos = [
      ['put', `/api/portal/admin/matriculas/${m}/status`, { status: 'trancada', motivo: 'Pedido de trancamento do aluno.', versao: 1 }],
      ['put', `/api/portal/admin/matriculas/${m}/turma`, { turmaId: IDS.T2, versao: 1 }],
      ['put', `/api/portal/admin/matriculas/${m}/inicio`, { inicioEm: '2026-09-01', motivo: 'Correção da data de início.', versao: 1 }],
      ['put', `/api/portal/admin/matriculas/${m}/nome-em-documentos`, { usar: 'social', motivo: 'Pedido do titular por e-mail.', versao: 1 }],
      ['post', `/api/portal/admin/turmas/${String(vazia.insertedId)}/encerrar`, {}],
      ['del', `/api/portal/admin/turmas/${String(vazia.insertedId)}`]
    ];
    for (const [met, c, corpo] of casos) {
      const r = met === 'del' ? await ctx.api.del(c, { usuario: 'u-admin' }) : await ctx.api[met](c, corpo, { usuario: 'u-admin' });
      assert.equal(r.status, 503, `${met} ${c}`);
      assert.equal(r.corpo.codigo, 'auditoria-indisponivel', `${met} ${c}`);
    }
    delete ctx.banco.falhar.insertOne;
    const doc = ctx.banco.documentos('matriculas').find(x => String(x._id) === m);
    assert.equal(doc.versao, 1);
    assert.equal(doc.status, 'ativa');
    assert.equal(String(doc.turmaId), IDS.T1);
    const t = ctx.banco.documentos('turmas').find(x => String(x._id) === String(vazia.insertedId));
    assert.ok(t && !t.encerradaEm, 'turma intacta');
  });

  test('varredura profunda: nenhuma resposta traz senhaHash, segredo, token, cpf nem binário', async () => {
    const respostas = [
      await ctx.api.get('/api/portal/admin/matriculas', { usuario: 'u-admin' }),
      await ctx.api.get(`/api/portal/admin/matriculas/${IDS['mat-aluno1']}`, { usuario: 'u-admin' }),
      await ctx.api.get('/api/portal/admin/turmas', { usuario: 'u-admin' }),
      await ctx.api.get('/api/portal/admin/matriculas/sem-matricula', { usuario: 'u-admin' }),
      await ctx.api.get('/api/portal/professor/cursos/curso-01/turmas', { usuario: 'u-prof-t1' })
    ];
    const proibidas = ['senhaHash', 'segredo', 'token', 'cpf', 'passaporte', 'rg', 'dados'];
    const varrer = (v, caminho = '') => {
      if (Array.isArray(v)) return v.forEach((x, i) => varrer(x, `${caminho}[${i}]`));
      if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          assert.ok(!proibidas.includes(k), `chave proibida ${caminho}.${k}`);
          varrer(x, `${caminho}.${k}`);
        }
      }
    };
    for (const r of respostas) {
      assert.equal(r.status, 200);
      varrer(r.corpo);
    }
  });
});

// =============================================================
describe('relatório alunos (grupo relatorio, API §6.11.3)', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('admin: linhas com colunas da coordenação, sem CPF; resumo sobre o conjunto inteiro', async () => {
    const rel = ctx.servicos.todos('relatorio').find(d => d.id === 'alunos');
    assert.ok(rel);
    const req = await reqDe(ctx.banco, 'u-admin');
    const linhas = await rel.consultar(req, { cursoId: 'curso-01' }, { limite: 100 });
    assert.equal(linhas.length, 2);
    const l1 = linhas.find(l => l.numero === 'MAT-2026-AAAAA2');
    assert.deepEqual(
      { curso: l1.curso, turma: l1.turma, nome: l1.nome, email: l1.email, status: l1.status, progressoPct: l1.progressoPct, situacao: l1.situacao },
      { curso: 'Curso de Teste APE', turma: 'APE-2026-01', nome: 'Aluna Um de Teste', email: 'aluno1@exemplo.invalid', status: 'Ativa', progressoPct: null, situacao: null }
    );
    assert.ok(linhas.every(l => !('cpf' in l)));
    const resumo = await rel.resumir(req, { cursoId: 'curso-01' });
    const kpi = Object.fromEntries(resumo.kpis.map(k => [k.chave, k.valor]));
    assert.deepEqual(kpi, { matriculasAtivas: 2, semTurma: 0, trancadas: 0, concluidasNoPeriodo: null });
    assert.deepEqual(resumo.series[0].pontos.sort((a, b) => a.rotulo.localeCompare(b.rotulo)), [{ rotulo: 'APE-2026-01', valor: 1 }, { rotulo: 'APE-2026-02', valor: 1 }]);
  });

  test('docente só de turma vê só a turma dele, sem colunas da coordenação; turma alheia → 403', async () => {
    const rel = ctx.servicos.todos('relatorio').find(d => d.id === 'alunos');
    const req = await reqDe(ctx.banco, 'u-prof-t1');
    const linhas = await rel.consultar(req, {}, { limite: 100 });
    assert.deepEqual(linhas.map(l => l.numero), ['MAT-2026-AAAAA2']);
    assert.equal('email' in linhas[0], false);
    await assert.rejects(rel.consultar(req, { cursoId: 'curso-01', turmaId: IDS.T2 }, { limite: 100 }), e => e.status === 403 && e.codigo === 'nao-docente');
    await assert.rejects(rel.consultar(req, { cursoId: 'curso-02' }, { limite: 100 }), e => e.status === 403);
    const resumo = await rel.resumir(req, { cursoId: 'curso-01' });
    assert.equal(resumo.kpis.find(k => k.chave === 'matriculasAtivas').valor, 1);
    assert.equal(resumo.kpis.find(k => k.chave === 'semTurma').valor, 0);
    const geral = await rel.consultar(await reqDe(ctx.banco, 'u-prof'), {}, { limite: 100 });
    assert.equal(geral.length, 2);
  });
});

describe('alunosDoCurso aceita turmaIds (acréscimo usado por F3a e F8)', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));
  test('turmaIds filtra; lista vazia → []; status em texto ou lista', async () => {
    const f = ctx.servicos.obter('secretaria.alunosDoCurso');
    assert.deepEqual((await f({ cursoId: 'curso-01', turmaIds: [IDS.T2] })).map(a => a.userId), [IDS['u-aluno2']]);
    assert.deepEqual(await f({ cursoId: 'curso-01', turmaIds: [] }), []);
    assert.equal((await f({ cursoId: 'curso-01', status: 'ativa' })).length, 2);
    assert.equal((await f({ cursoId: 'curso-01', status: ['trancada'] })).length, 0);
    assert.deepEqual(await f({ cursoId: 'curso-01', turmaId: 'sem-turma' }), []);
  });
});
