// Portal · F1a — % assistido, conclusão automática, Meus cursos, progresso do curso e
// conteúdo feito (PORTAL-API §6.5, §8.4). Banco em memória, relógio injetado.
// Rode: NODE_ENV=test node --test server/test/estudos-progresso.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ObjectId } from 'mongodb';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';

const { criarBancoMemoria } = await import('./apoio/banco-memoria.js');
const { semear, IDS, AGORA_FIXTURE } = await import('./apoio/fixtures-portal.js');
const { subir, fechar, cliente, usuarioDeTeste } = await import('./apoio/http.js');
const { silencioso } = await import('./apoio/falsos.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { tratarErroGlobal } = await import('../src/portal/erros.js');
const { montarPortal } = await import('../src/portal/montar.js');
const { criarRotaProgresso } = await import('../src/routes/progresso.js');
const { tetoPlausivel, pctDe } = await import('../src/portal/estudos/progresso.js');

const exigirLogin = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' }));
const soAdmin = [exigirLogin, (req, res, next) => (req.user.isAdmin ? next() : res.status(403).json({ error: 'Acesso restrito ao administrador.' }))];
const MODULO = { caminho: 'routes/portal-conteudo.js', fatia: 'F1a', importar: () => import('../src/routes/portal-conteudo.js') };

/** Agregador real só com o módulo da F1a, relógio controlável e serviços de outras fatias como falsos. */
async function montarApp({ extras = {}, grupos = {} } = {}) {
  const banco = criarBancoMemoria();
  await semear(banco);
  const relogio = { t: new Date(AGORA_FIXTURE).getTime() };
  const agora = () => new Date(relogio.t);
  const servicos = criarServicos();
  for (const [n, f] of Object.entries(extras)) servicos.registrar(n, f);
  for (const [g, defs] of Object.entries(grupos)) for (const d of defs) servicos.adicionar(g, d);
  const portal = montarPortal({ getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin, exigirAdmin: soAdmin, servicos, modulos: [MODULO], filtro: null, falharCedo: true, agora, log: silencioso });
  const app = express();
  app.use(express.json());
  app.use(usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api/progresso', criarRotaProgresso({ repo: n => banco.collection(n), servicos, exigirLogin, agora, log: silencioso }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(tratarErroGlobal);
  const { server, base } = await subir(app);
  return { banco, servicos, relogio, server, api: cliente(base), repo: n => banco.collection(n) };
}

const ASSISTIDO = '/api/portal/aulas/c01-m01-a01/assistido';

describe('funções puras', () => {
  test('teto de plausibilidade (2× + 1 min; sem duração 50 nos 5 min iniciais)', () => {
    const t0 = new Date('2026-10-18T12:00:00Z');
    assert.equal(tetoPlausivel({ agora: t0, primeiroEm: t0, duracaoSeg: 1200 }), 10);
    assert.equal(tetoPlausivel({ agora: new Date(t0.getTime() + 540e3), primeiroEm: t0, duracaoSeg: 1200 }), 100);
    assert.equal(tetoPlausivel({ agora: t0, primeiroEm: t0, duracaoSeg: null }), 50);
    assert.equal(tetoPlausivel({ agora: new Date(t0.getTime() + 301e3), primeiroEm: t0, duracaoSeg: null }), 100);
  });
  test('pct por baixo e null sem total', () => {
    assert.equal(pctDe(2, 3), 66);
    assert.equal(pctDe(0, 0), null);
    assert.equal(pctDe(5, 5), 100);
  });
});

describe('POST /portal/aulas/:aulaId/assistido (§8.4)', () => {
  let ctx;
  const ouvidos = [];
  before(async () => { ctx = await montarApp({ grupos: { aoConcluirAula: [async c => { ouvidos.push(c); }] } }); });
  after(async () => { await fechar(ctx.server); });

  test('teto aplicado no 1º evento; pctMax só cresce; < 90 não conclui', async () => {
    const r1 = await ctx.api.post(ASSISTIDO, { posicaoSeg: 1100, duracaoSeg: 1200, pct: 92, fonte: 'vimeo' }, { usuario: 'u-aluno1' });
    assert.equal(r1.status, 200);
    assert.equal(r1.corpo.pctMax, 10);
    assert.equal(r1.corpo.concluida, false);
    ctx.relogio.t += 120e3; // +2 min → teto 30
    const r2 = await ctx.api.post(ASSISTIDO, { posicaoSeg: 300, duracaoSeg: 1200, pct: 25, fonte: 'vimeo' }, { usuario: 'u-aluno1' });
    assert.equal(r2.corpo.pctMax, 25);
    const r3 = await ctx.api.post(ASSISTIDO, { posicaoSeg: 10, duracaoSeg: 1200, pct: 5, fonte: 'vimeo' }, { usuario: 'u-aluno1' });
    assert.equal(r3.corpo.pctMax, 25, 'não diminui');
    assert.equal(await ctx.repo('progresso').countDocuments({ userId: IDS['u-aluno1'], aulaId: 'c01-m01-a01' }), 0);
    const doc = await ctx.repo('progresso_video').findOne({ userId: IDS['u-aluno1'], aulaId: 'c01-m01-a01' });
    assert.equal(doc.eventos, 3);
    assert.equal(doc.cursoId, 'curso-01');
  });

  test('≥ 90 conclui (origem auto) e chama aoConcluirAula uma vez; repetição não dispara de novo', async () => {
    ctx.relogio.t += 600e3;
    const r = await ctx.api.post(ASSISTIDO, { posicaoSeg: 1100, duracaoSeg: 1200, pct: 91.25, fonte: 'vimeo' }, { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.pctMax, 91.3);
    assert.equal(r.corpo.concluida, true);
    assert.match(r.corpo.concluidaEm, /^2026-10-18T/);
    assert.equal(r.corpo.frequencia, null);
    const again = await ctx.api.post(ASSISTIDO, { posicaoSeg: 1200, duracaoSeg: 1200, pct: 100, fonte: 'vimeo' }, { usuario: 'u-aluno1' });
    assert.equal(again.corpo.concluidaEm, r.corpo.concluidaEm);
    const meus = ouvidos.filter(o => o.userId === IDS['u-aluno1'] && o.aulaId === 'c01-m01-a01');
    assert.equal(meus.length, 1);
    assert.equal(meus[0].via, 'conclusao_auto');
    assert.equal(meus[0].pctVideo, 91.3);
    const p = await ctx.repo('progresso').findOne({ userId: IDS['u-aluno1'], aulaId: 'c01-m01-a01' });
    assert.equal(p.origem, 'auto');
  });

  test('docente e admin sem liberação → 204 sem gravar; intruso 403; em breve 409; inválido 400; inexistente 404', async () => {
    assert.equal((await ctx.api.post(ASSISTIDO, { posicaoSeg: 1, duracaoSeg: 100, pct: 1, fonte: 'nativo' }, { usuario: 'u-prof' })).status, 204);
    assert.equal((await ctx.api.post(ASSISTIDO, { posicaoSeg: 1, duracaoSeg: 100, pct: 1, fonte: 'nativo' }, { usuario: 'u-admin' })).status, 204);
    assert.equal(await ctx.repo('progresso_video').countDocuments({ userId: { $in: [IDS['u-prof'], IDS['u-admin']] } }), 0);
    const intruso = await ctx.api.post(ASSISTIDO, { posicaoSeg: 1, duracaoSeg: 100, pct: 1, fonte: 'nativo' }, { usuario: 'u-intruso' });
    assert.equal(intruso.status, 403);
    assert.equal(intruso.corpo.codigo, 'sem-acesso');
    const emBreve = await ctx.api.post('/api/portal/aulas/c01-m02-a03/assistido', { posicaoSeg: 1, duracaoSeg: 100, pct: 1, fonte: 'nativo' }, { usuario: 'u-aluno1' });
    assert.equal(emBreve.status, 409);
    assert.equal(emBreve.corpo.codigo, 'aula-indisponivel');
    const ruim = await ctx.api.post(ASSISTIDO, { posicaoSeg: -1, pct: 120, fonte: 'flash' }, { usuario: 'u-aluno1' });
    assert.equal(ruim.status, 400);
    assert.deepEqual(Object.keys(ruim.corpo.campos).sort(), ['fonte', 'pct', 'posicaoSeg']);
    const obj = await ctx.api.post(ASSISTIDO, { posicaoSeg: { $gt: 0 }, pct: 1, fonte: 'nativo' }, { usuario: 'u-aluno1' });
    assert.equal(obj.status, 400);
    assert.equal((await ctx.api.post('/api/portal/aulas/nao-existe/assistido', { posicaoSeg: 1, pct: 1, fonte: 'nativo' }, { usuario: 'u-aluno1' })).status, 404);
    assert.equal((await ctx.api.post(ASSISTIDO, { posicaoSeg: 1, pct: 1, fonte: 'nativo' })).status, 401);
  });
});

describe('Meus cursos, progresso do curso e conteúdo feito', () => {
  let ctx;
  before(async () => {
    ctx = await montarApp({
      extras: {
        'secretaria.garantirMatricula': async (userId) => (userId === IDS['u-aluno1'] ? { _id: 'mat-1', numero: 'MAT-2026-AAAAA2', inicioEm: new Date('2026-09-28T12:00:00Z'), status: 'ativa' } : null),
        'academico.situacaoDoCurso': async () => ({ situacao: 'cursando', situacaoRotulo: 'Cursando', modulos: [] })
      }
    });
    // aluno1 concluiu 2 das 5 aulas disponíveis do curso-01 (a em breve fica fora)
    for (const aulaId of ['c01-m01-a01', 'c01-m01-a02']) await ctx.api.put(`/api/progresso/${aulaId}`, {}, { usuario: 'u-aluno1' });
  });
  after(async () => { await fechar(ctx.server); });

  test('me/cursos: só cursos com liberação/matrícula; pct = aulas disponíveis; continuar na 1ª pendente; matrícula e situação dos serviços', async () => {
    const r = await ctx.api.get('/api/portal/me/cursos', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.itens.length, 1);
    const it = r.corpo.itens[0];
    assert.equal(it.curso.id, 'curso-01');
    assert.equal(it.curso.sigla, 'APE');
    assert.equal(it.curso.capaVerticalUrl, null);
    assert.deepEqual(it.progresso, { aulasConcluidas: 2, aulasTotal: 5, pct: 40 });
    assert.deepEqual(it.continuar, { moduloId: 'c01-m01', chave: 'aula:c01-m01-a03', aulaId: 'c01-m01-a03' });
    assert.deepEqual(it.matricula, { id: 'mat-1', numero: 'MAT-2026-AAAAA2', inicioEm: '2026-09-28T12:00:00.000Z', status: 'ativa' });
    assert.equal(it.situacao, 'cursando');
    assert.equal(it.semAcesso, false);
    assert.equal(r.corpo.ativoId, 'curso-01');
    const vazio = await ctx.api.get('/api/portal/me/cursos', { usuario: 'u-intruso' });
    assert.deepEqual(vazio.corpo, { ativoId: null, itens: [] });
  });

  test('pct do me/cursos igual ao do serviço estudos.progressoDoCurso (regra única)', async () => {
    const svc = ctx.servicos.obter('estudos.progressoDoCurso');
    const p = await svc(IDS['u-aluno1'], 'curso-01');
    assert.equal(p.pct, 40);
    assert.equal(p.aulasTotal, 5);
    assert.equal(p.porModulo['c01-m02'].aulasTotal, 2);
    const disp = await ctx.servicos.obter('estudos.aulasDisponiveis')('curso-01');
    assert.equal(disp.length, 5);
    assert.ok(!disp.some(a => a.aulaId === 'c01-m02-a03'));
  });

  test('GET cursos/:id/progresso: mapas do aluno; docente com mapas vazios; intruso 403; inexistente 404', async () => {
    const r = await ctx.api.get('/api/portal/cursos/curso-01/progresso', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.aulas['c01-m01-a01'].concluida, true);
    assert.equal(r.corpo.aulas['c01-m01-a01'].origem, 'manual');
    assert.equal(r.corpo.aulas['c01-m01-a03'].concluida, false);
    assert.equal(r.corpo.aulas['c01-m02-a03'], undefined);
    assert.deepEqual(r.corpo.curso, { aulasConcluidas: 2, aulasTotal: 5, pct: 40 });
    const prof = await ctx.api.get('/api/portal/cursos/curso-01/progresso', { usuario: 'u-prof' });
    assert.deepEqual(prof.corpo, { aulas: {}, conteudo: {}, curso: { aulasConcluidas: null, aulasTotal: 5, pct: null } });
    assert.equal((await ctx.api.get('/api/portal/cursos/curso-01/progresso', { usuario: 'u-intruso' })).status, 403);
    assert.equal((await ctx.api.get('/api/portal/cursos/nao-existe/progresso', { usuario: 'u-aluno1' })).status, 404);
  });

  test('conteudo/feito: plano vazio → 404; material de aula conta no n de N; docente 204; chave inválida 400', async () => {
    await ctx.repo('aulas').updateOne({ _id: 'c01-m01-a01' }, { $set: { materiais: [{ id: 'mat-aula000001', tipo: 'link', nome: 'Leitura', url: 'https://exemplo.invalid/a', tamanho: 0 }] } });
    assert.equal((await ctx.api.post('/api/portal/conteudo/feito', { chave: 'plano:c01-m01' }, { usuario: 'u-aluno1' })).status, 404);
    const antes = await ctx.api.get('/api/portal/modulos/c01-m01/conteudo', { usuario: 'u-aluno1' });
    assert.equal(antes.corpo.secoes.materiais.total, 1);
    assert.equal(antes.corpo.secoes.materiais.feitos, 0);
    const f = await ctx.api.post('/api/portal/conteudo/feito', { chave: 'material:mat-aula000001' }, { usuario: 'u-aluno1' });
    assert.equal(f.status, 200);
    assert.equal(f.corpo.chave, 'material:mat-aula000001');
    const f2 = await ctx.api.post('/api/portal/conteudo/feito', { chave: 'material:mat-aula000001' }, { usuario: 'u-aluno1' });
    assert.equal(f2.corpo.feitoEm, f.corpo.feitoEm, 'idempotente');
    const depois = await ctx.api.get('/api/portal/modulos/c01-m01/conteudo', { usuario: 'u-aluno1' });
    assert.equal(depois.corpo.secoes.materiais.feitos, 1);
    assert.equal(depois.corpo.progresso.itensFeitos, 3);
    assert.equal(depois.corpo.progresso.itensTotal, 4);
    assert.equal((await ctx.api.post('/api/portal/conteudo/feito', { chave: 'material:mat-aula000001' }, { usuario: 'u-prof' })).status, 204);
    assert.equal((await ctx.api.post('/api/portal/conteudo/feito', { chave: 'material:mat-aula000001' }, { usuario: 'u-intruso' })).status, 403);
    assert.equal((await ctx.api.post('/api/portal/conteudo/feito', { chave: 'aula:x' }, { usuario: 'u-aluno1' })).status, 400);
    assert.equal((await ctx.api.post('/api/portal/conteudo/feito', { chave: { $gt: '' } }, { usuario: 'u-aluno1' })).status, 400);
    assert.equal((await ctx.api.post('/api/portal/conteudo/feito', { chave: 'material:nao-existe' }, { usuario: 'u-aluno1' })).status, 404);
  });
});

describe('relatório e exportador `progresso` (§6.11.3, §6.3.4)', () => {
  let ctx;
  const reqDe = async u => ({ user: await ctx.repo('users').findOne({ _id: ObjectId.createFromHexString(IDS[u]) }) });
  before(async () => {
    ctx = await montarApp({ extras: { 'perfis.publicos': async ids => new Map(ids.map(id => [id, { id, nome: `Nome ${id.slice(-2)}`, nomeSocial: null }])) } });
    await ctx.api.get('/api/portal/saude');
    await ctx.api.put('/api/progresso/c01-m01-a01', {}, { usuario: 'u-aluno1' });
    await ctx.api.post('/api/portal/conteudo/feito', { chave: 'material:x' }, { usuario: 'u-aluno1' });
  });
  after(async () => { await fechar(ctx.server); });

  test('admin: linhas por aluno do curso com aulas, % e última atividade; sem CPF; resumo sobre o conjunto', async () => {
    const rel = ctx.servicos.todos('relatorio').find(d => d.id === 'progresso');
    assert.ok(rel);
    assert.deepEqual(rel.papeis, ['professor', 'admin']);
    const linhas = await rel.consultar(await reqDe('u-admin'), { cursoId: 'curso-01' }, { limite: 100 });
    assert.equal(linhas.length, 2);
    const l1 = linhas.find(l => l.nome === `Nome ${IDS['u-aluno1'].slice(-2)}`);
    assert.deepEqual({ c: l1.aulasConcluidas, t: l1.aulasDisponiveis, p: l1.progressoPct }, { c: 1, t: 5, p: 20 });
    assert.match(l1.ultimaAtividade, /^2026-10-18T/);
    assert.ok(linhas.every(l => !('cpf' in l) && !('_porModulo' in l)));
    const resumo = await rel.resumir(await reqDe('u-admin'), { cursoId: 'curso-01' });
    const kpi = Object.fromEntries(resumo.kpis.map(k => [k.chave, k.valor]));
    assert.deepEqual(kpi, { progressoMedioPct: 10, concluiramCurso: 0, semAtividade30d: 1, alunos: 2 });
    assert.deepEqual(resumo.series[0].pontos.map(p => p.rotulo), ['Módulo 01', 'Módulo 02']);
  });

  test('docente só de turma sem a F4a não vê liberações; curso fora da docência fica de fora', async () => {
    const rel = ctx.servicos.todos('relatorio').find(d => d.id === 'progresso');
    assert.deepEqual(await rel.consultar(await reqDe('u-prof-t1'), { cursoId: 'curso-01' }), []);
    assert.deepEqual(await rel.consultar(await reqDe('u-prof'), { cursoId: 'curso-02' }), []);
    assert.equal((await rel.consultar(await reqDe('u-prof'), {})).length, 2);
  });

  test('exportador do titular traz só os próprios registros', async () => {
    const exp = ctx.servicos.todos('exportador').find(d => d.dominio === 'progresso');
    const meu = await exp.exportar(IDS['u-aluno1']);
    assert.equal(meu.aulasConcluidas.length, 1);
    assert.equal(meu.aulasConcluidas[0].aulaId, 'c01-m01-a01');
    const outro = await exp.exportar(IDS['u-aluno2']);
    assert.deepEqual(outro, { aulasConcluidas: [], assistido: [], itensFeitos: [] });
  });
});
