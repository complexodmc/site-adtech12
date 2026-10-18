// Portal · F8 — rotas do professor (routes/portal-professor.js) e dúvidas (routes/duvidas.js).
// Casos da PORTAL-API §9.3 (linha professor-portal), §6.12, §7.6, DC-73, D-54.
// Banco em memória (test/apoio), agregador real (montar.js) com só o módulo da F8; os serviços
// de OUTRAS fatias são falsos (servicosFalsos) ou ficam ausentes (degradação honesta: null).
// Rode com `npm test` na raiz, ou só esta fatia:
//   NODE_ENV=test QA_FATIA=F8 node --test server/test/professor-portal.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ObjectId } from 'mongodb';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso, servicosFalsos } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const M = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const E = await import('../src/portal/erros.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const { criarRotaDuvidas } = await import('../src/routes/duvidas.js');
const { criarRotaPortalProfessor, criarExportadorDuvidas } = await import('../src/routes/portal-professor.js');

const CFG_TESTE = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });
const MODULO_F8 = Object.freeze({ caminho: 'routes/portal-professor.js', fatia: 'F8', importar: () => import('../src/routes/portal-professor.js') });
const CPF_SEMENTE = '52998224725';

const D1 = new ObjectId('0000000000000000000000d1'); // aluno1 (T1), curso-01, sem resposta
const D2 = new ObjectId('0000000000000000000000d2'); // aluno2 (T2), curso-01, sem resposta
const D3 = new ObjectId('0000000000000000000000d3'); // intruso, curso-02
const D4 = new ObjectId('0000000000000000000000d4'); // aluno1, curso-01, já respondida

async function semearDuvidas(banco) {
  const em = (h) => new Date(Date.parse('2026-10-18T12:00:00Z') - h * 3600 * 1000);
  await banco.collection('duvidas').insertMany([
    { _id: D1, aulaId: 'c01-m01-a01', moduloId: 'c01-m01', cursoId: 'curso-01', userId: IDS['u-aluno1'], autorNome: 'Aluna Um de Teste', texto: 'Dúvida da aluna um', createdAt: em(5), resolvida: false, respostas: [] },
    { _id: D2, aulaId: 'c01-m01-a02', moduloId: 'c01-m01', cursoId: 'curso-01', userId: IDS['u-aluno2'], autorNome: 'Aluno Dois de Teste', texto: 'Dúvida do aluno dois', createdAt: em(4), resolvida: false, respostas: [] },
    { _id: D3, aulaId: 'c02-m01-a01', moduloId: 'c02-m01', cursoId: 'curso-02', userId: IDS['u-intruso'], autorNome: 'Pessoa', texto: 'Outra', createdAt: em(3), resolvida: false, respostas: [] },
    { _id: D4, aulaId: 'c01-m01-a01', moduloId: 'c01-m01', cursoId: 'curso-01', userId: IDS['u-aluno1'], autorNome: 'Aluna Um de Teste', texto: 'Já respondida', createdAt: em(10), resolvida: true, respostas: [{ id: 'resp-antiga', userId: IDS['u-admin'], autorNome: 'Coordenação de Teste', texto: 'ok', createdAt: em(9) }] }
  ]);
  // Dado sensível no perfil: nunca pode aparecer nas respostas ao professor.
  await banco.collection('perfis').insertOne({ userId: IDS['u-aluno1'], nomeSocial: null, cpf: CPF_SEMENTE, rg: { numero: 'RG-SEMENTE-77' }, endereco: { cep: '01310-100', logradouro: 'Rua Sigilosa' } });
}

/** Agregador real + rotas legadas de dúvidas (fábrica) sobre o mesmo banco em memória. */
async function subirF8({ falsos = {}, banco = null } = {}) {
  const b = banco || criarBancoMemoria({ indices: especificacoesRegistradas() });
  if (!banco) { await semear(b); await semearDuvidas(b); }
  const servicos = criarServicos();
  const espiao = servicosFalsos(falsos, { em: servicos });
  const portal = M.montarPortal({
    getDb: () => b, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: [MODULO_F8], configPortal: CFG_TESTE, falharCedo: true, log: silencioso
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco: b }));
  app.use('/api', portal);
  app.use('/api', criarRotaDuvidas({ repo: n => b.collection(n), servicos, exigirLogin: requireAuth, exigirAdmin: requireAdmin, log: silencioso }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(E.criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  return { api: cliente(base), server, banco: b, servicos, chamadas: espiao.chamadas };
}

// ---------- falsos das fatias vizinhas ----------
const TURMAS = [
  { id: IDS.T1, codigo: 'APE-2026-01', nome: 'Turma 1', status: 'em_andamento', modalidade: 'hibrido', alunos: 1 },
  { id: IDS.T2, codigo: 'APE-2026-02', nome: 'Turma 2', status: 'em_andamento', modalidade: 'gravado', alunos: 1 }
];
function falsosCompletos(extra = {}) {
  return {
    'secretaria.turmasDoCurso': async (cursoId) => (cursoId === 'curso-01' ? TURMAS : []),
    'secretaria.contagemAlunos': async (_cursoId, { turmaIds } = {}) => ({ ativos: turmaIds ? turmaIds.length : 2, trancadas: 0, semTurma: turmaIds ? 0 : 1 }),
    'avaliacoes.correcoesPendentes': async (cursoIds, { turmaIds } = {}) => Object.fromEntries(cursoIds.map(c => [c, turmaIds ? 1 : 3])),
    'atendimento.abertosDoEscopo': async (_req, cursoIds) => ({ porCurso: Object.fromEntries(cursoIds.map(c => [c, 2])), atribuidos: 1 }),
    'academico.encontrosDoEscopo': async (cursoIds) => cursoIds.map(c => ({ id: `enc-${c}`, cursoId: c, titulo: 'Encontro', inicioEm: new Date('2026-10-20T22:30:00Z'), turmaCodigo: 'APE-2026-01', status: 'agendado' })),
    'atendimento.ouvidoriaSemParecer': async () => 3,
    'secretaria.matriculasDoAluno': async (userId) => {
      const mats = await bancoAtual.collection('matriculas').find({ userId }).toArray();
      return mats;
    },
    'secretaria.alunosDoCurso': async ({ cursoId, turmaId }) => {
      const filtro = { cursoId };
      if (turmaId) filtro.turmaId = new ObjectId(turmaId);
      const mats = await bancoAtual.collection('matriculas').find(filtro).toArray();
      return mats.map(m => ({ matriculaId: String(m._id), numero: m.numero, userId: m.userId, turmaId: String(m.turmaId), turmaCodigo: m.enturmacoes?.[0]?.turmaCodigo ?? null, status: m.status, inicioEm: m.inicioEm }));
    },
    ...extra
  };
}
let bancoAtual = null;

// =============================================================
describe('GET /api/portal/professor/resumo', () => {
  test('anônimo 401; aluno e professor rebaixado (u-ex) 403 papel-insuficiente', async () => {
    const t = await subirF8();
    try {
      assert.equal((await t.api.get('/api/portal/professor/resumo')).status, 401);
      const a = await t.api.get('/api/portal/professor/resumo', { usuario: 'u-aluno1' });
      assert.equal(a.status, 403);
      assert.equal(a.corpo.codigo, 'papel-insuficiente');
      const ex = await t.api.get('/api/portal/professor/resumo', { usuario: 'u-ex' });
      assert.equal(ex.status, 403);
    } finally { await fechar(t.server); }
  });

  test('sem os serviços das outras fatias: campos null (nunca 0 inventado); dúvidas contadas pela F8', async () => {
    const t = await subirF8();
    try {
      const r = await t.api.get('/api/portal/professor/resumo', { usuario: 'u-prof' });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.cursos.length, 1, 'só a docência válida (curso-01)');
      const c = r.corpo.cursos[0];
      assert.equal(c.id, 'curso-01');
      assert.equal(c.escopo, 'curso');
      assert.equal(c.turmas, null);
      assert.equal(c.alunosAtivos, null);
      assert.equal(c.correcoesPendentes, null);
      assert.equal(c.atendimentosAbertos, null);
      assert.equal(c.proximosEncontros, null);
      assert.equal(c.duvidasPendentes, 2);
      assert.equal(r.corpo.ouvidoriaSemParecer, null);
      assert.equal(r.corpo.atribuidosAMim, null);
    } finally { await fechar(t.server); }
  });

  test('com os serviços: números do serviço; u-prof-t1 conta só a T1 (alunos, correções, encontros, dúvidas)', async () => {
    const t = await subirF8({ falsos: falsosCompletos() });
    bancoAtual = t.banco;
    try {
      const g = await t.api.get('/api/portal/professor/resumo', { usuario: 'u-prof' });
      assert.equal(g.status, 200);
      const cg = g.corpo.cursos[0];
      assert.equal(cg.turmas.length, 2);
      assert.equal(cg.alunosAtivos, 2);
      assert.equal(cg.correcoesPendentes, 3);
      assert.equal(cg.atendimentosAbertos, 2);
      assert.equal(cg.proximosEncontros.length, 1);
      assert.equal(g.corpo.atribuidosAMim, 1);
      assert.equal(g.corpo.ouvidoriaSemParecer, 3, 'D-54: do serviço atendimento.ouvidoriaSemParecer');
      assert.equal(cg.semTurma, 1, 'docência geral vê os sem turma');

      const r = await t.api.get('/api/portal/professor/resumo', { usuario: 'u-prof-t1' });
      assert.equal(r.status, 200);
      const c = r.corpo.cursos[0];
      assert.equal(c.escopo, 'turmas');
      assert.deepEqual(c.turmas.map(x => x.id), [IDS.T1]);
      assert.equal(c.alunosAtivos, 1);
      assert.equal(c.correcoesPendentes, 1);
      assert.equal(c.duvidasPendentes, 1, 'só a dúvida da aluna da T1');
      assert.equal(c.semTurma, null, 'docente só de turma não vê alunos sem turma');
      const chamadaContagem = t.chamadas['secretaria.contagemAlunos'].at(-1);
      assert.deepEqual(chamadaContagem[1], { turmaIds: [IDS.T1] });
      const chamadaEnc = t.chamadas['academico.encontrosDoEscopo'].at(-1);
      assert.deepEqual(chamadaEnc[1].turmaIds, [IDS.T1]);
      const chamadaCorr = t.chamadas['avaliacoes.correcoesPendentes'].at(-1);
      assert.deepEqual(chamadaCorr[1], { turmaIds: [IDS.T1] });
    } finally { await fechar(t.server); }
  });

  test('serviço que falha vira null (não derruba o resumo); admin vê todos os cursos', async () => {
    const t = await subirF8({ falsos: { 'secretaria.contagemAlunos': async () => { throw new Error('caiu'); } } });
    try {
      const r = await t.api.get('/api/portal/professor/resumo', { usuario: 'u-admin' });
      assert.equal(r.status, 200);
      assert.deepEqual(r.corpo.cursos.map(c => c.id).sort(), ['curso-01', 'curso-02']);
      assert.ok(r.corpo.cursos.every(c => c.alunosAtivos === null));
      assert.equal(r.corpo.cursos.find(c => c.id === 'curso-02').duvidasPendentes, 1);
    } finally { await fechar(t.server); }
  });
});

// =============================================================
describe('GET /api/portal/professor/alunos/:userId/matriculas (DC-73)', () => {
  test('u-prof-t1 vê só a matrícula da T1; aluno de outra turma → 404; docente geral e admin veem; vigentes primeiro', async () => {
    const t = await subirF8({ falsos: falsosCompletos() });
    bancoAtual = t.banco;
    try {
      // matrícula concluída antiga do aluno1 no curso-01 (T1) para conferir a ordem.
      await t.banco.collection('matriculas').insertOne({ _id: new ObjectId('000000000000000000000c09'), numero: 'MAT-2025-ZZZZZ9', userId: IDS['u-aluno1'], cursoId: 'curso-01', turmaId: oid('T1'), status: 'concluida', inicioEm: new Date('2025-01-10T12:00:00Z'), enturmacoes: [{ turmaId: oid('T1'), turmaCodigo: 'APE-2026-01' }] });
      const r = await t.api.get(`/api/portal/professor/alunos/${IDS['u-aluno1']}/matriculas`, { usuario: 'u-prof-t1' });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.itens.length, 2);
      assert.equal(r.corpo.itens[0].vigente, true, 'vigentes primeiro');
      assert.equal(r.corpo.itens[0].turma.codigo, 'APE-2026-01');
      assert.equal(r.corpo.itens[0].statusRotulo, 'Ativa');
      assert.equal(r.corpo.itens[0].cursoTitulo, 'Curso de Teste APE');
      assert.deepEqual(r.corpo.semMatricula, [], 'docente só de turma não vê liberação sem matrícula');

      const outra = await t.api.get(`/api/portal/professor/alunos/${IDS['u-aluno2']}/matriculas`, { usuario: 'u-prof-t1' });
      assert.equal(outra.status, 404);
      const intruso = await t.api.get(`/api/portal/professor/alunos/${IDS['u-intruso']}/matriculas`, { usuario: 'u-prof' });
      assert.equal(intruso.status, 404, 'sem vínculo → 404');
      const geral = await t.api.get(`/api/portal/professor/alunos/${IDS['u-aluno2']}/matriculas`, { usuario: 'u-prof' });
      assert.equal(geral.status, 200);
      assert.equal(geral.corpo.itens.length, 1);
    } finally { await fechar(t.server); }
  });

  test('liberação sem matrícula aparece em semMatricula só para docência geral e admin; a leitura não materializa matrícula', async () => {
    const t = await subirF8({ falsos: falsosCompletos() });
    bancoAtual = t.banco;
    try {
      await t.banco.collection('liberacoes').insertOne({ userId: IDS['u-aluno1'], cursoId: 'curso-02', grantedAt: new Date(), grantedBy: IDS['u-admin'] });
      const antes = await t.banco.collection('matriculas').countDocuments({});
      const adm = await t.api.get(`/api/portal/professor/alunos/${IDS['u-aluno1']}/matriculas`, { usuario: 'u-admin' });
      assert.equal(adm.status, 200);
      assert.deepEqual(adm.corpo.semMatricula, [{ cursoId: 'curso-02', cursoTitulo: 'Curso de Teste Sem Sigla' }]);
      const prof = await t.api.get(`/api/portal/professor/alunos/${IDS['u-aluno1']}/matriculas`, { usuario: 'u-prof' });
      assert.deepEqual(prof.corpo.semMatricula, [], 'u-prof não leciona curso-02');
      assert.equal(await t.banco.collection('matriculas').countDocuments({}), antes, 'nada materializado');
    } finally { await fechar(t.server); }
  });

  test('sem secretaria.matriculasDoAluno → itens:null (moldura mostra "—" + motivo)', async () => {
    const t = await subirF8();
    try {
      const r = await t.api.get(`/api/portal/professor/alunos/${IDS['u-aluno1']}/matriculas`, { usuario: 'u-prof' });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.itens, null);
    } finally { await fechar(t.server); }
  });
});

// =============================================================
describe('GET /api/portal/professor/cursos/:cursoId/alunos', () => {
  test('turma alheia → 403 nao-docente; curso sem docência → 403; turmaId vazio filtra pelas turmas do docente', async () => {
    const t = await subirF8({ falsos: falsosCompletos() });
    bancoAtual = t.banco;
    try {
      const alheia = await t.api.get(`/api/portal/professor/cursos/curso-01/alunos?turmaId=${IDS.T2}`, { usuario: 'u-prof-t1' });
      assert.equal(alheia.status, 403);
      assert.equal(alheia.corpo.codigo, 'nao-docente');
      const outro = await t.api.get('/api/portal/professor/cursos/curso-02/alunos', { usuario: 'u-prof' });
      assert.equal(outro.status, 403);
      const r = await t.api.get('/api/portal/professor/cursos/curso-01/alunos', { usuario: 'u-prof-t1' });
      assert.equal(r.status, 200);
      assert.deepEqual(r.corpo.itens.map(i => i.aluno.id), [IDS['u-aluno1']]);
      assert.equal(r.corpo.itens[0].turmaCodigo, 'APE-2026-01');
      assert.equal(r.corpo.itens[0].situacaoCurso, null, 'sem F3a → null');
      assert.deepEqual(t.chamadas['secretaria.alunosDoCurso'].at(-1)[0], { cursoId: 'curso-01', turmaId: IDS.T1 });
      const todos = await t.api.get('/api/portal/professor/cursos/curso-01/alunos', { usuario: 'u-prof' });
      assert.equal(todos.corpo.itens.length, 2);
      assert.equal(todos.corpo.total, 2);
    } finally { await fechar(t.server); }
  });

  test('respostas ao professor sem CPF, RG, endereço ou documentos', async () => {
    const t = await subirF8({ falsos: falsosCompletos() });
    bancoAtual = t.banco;
    try {
      const caminhos = [
        '/api/portal/professor/cursos/curso-01/alunos',
        `/api/portal/professor/alunos/${IDS['u-aluno1']}/matriculas`,
        '/api/portal/professor/duvidas?status=todas',
        '/api/portal/professor/resumo'
      ];
      for (const c of caminhos) {
        const r = await t.api.get(c, { usuario: 'u-prof' });
        assert.equal(r.status, 200, c);
        for (const proibido of [CPF_SEMENTE, 'RG-SEMENTE-77', 'Rua Sigilosa', '01310-100', '"cpf"', '"rg"', '"endereco"']) {
          assert.ok(!r.texto.includes(proibido), `${c} vazou ${proibido}`);
        }
      }
    } finally { await fechar(t.server); }
  });

  test('sem secretaria.alunosDoCurso → itens:null com motivo', async () => {
    const t = await subirF8();
    try {
      const r = await t.api.get('/api/portal/professor/cursos/curso-01/alunos', { usuario: 'u-prof' });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.itens, null);
      assert.ok(r.corpo.motivo);
    } finally { await fechar(t.server); }
  });
});

// =============================================================
describe('dúvidas do professor e rotas legadas (duvidas.js)', () => {
  test('lista do curso filtrada pela docência; u-prof-t1 só vê a da T1; curso sem docência → 403', async () => {
    const t = await subirF8();
    try {
      const g = await t.api.get('/api/portal/professor/duvidas', { usuario: 'u-prof' });
      assert.equal(g.status, 200);
      assert.deepEqual(g.corpo.itens.map(i => i.id).sort(), [String(D1), String(D2)].sort());
      assert.equal(g.corpo.pendentes, 2);
      assert.equal(g.corpo.itens[0].cursoTitulo, 'Curso de Teste APE');
      const t1 = await t.api.get('/api/portal/professor/duvidas', { usuario: 'u-prof-t1' });
      assert.deepEqual(t1.corpo.itens.map(i => i.id), [String(D1)]);
      const todas = await t.api.get('/api/portal/professor/duvidas?status=todas', { usuario: 'u-prof' });
      assert.equal(todas.corpo.itens.length, 3);
      const resp = await t.api.get('/api/portal/professor/duvidas?status=respondidas', { usuario: 'u-prof' });
      assert.deepEqual(resp.corpo.itens.map(i => i.id), [String(D4)]);
      const fora = await t.api.get('/api/portal/professor/duvidas?cursoId=curso-02', { usuario: 'u-prof' });
      assert.equal(fora.status, 403);
      assert.equal(fora.corpo.codigo, 'nao-docente');
      const adm = await t.api.get('/api/portal/professor/duvidas', { usuario: 'u-admin' });
      assert.equal(adm.corpo.itens.length, 3);
    } finally { await fechar(t.server); }
  });

  test('professor responde: formato legado + autorPapel; o GET legado do aluno lê; notificação duvida.respondida', async () => {
    const t = await subirF8();
    try {
      const r = await t.api.post(`/api/portal/professor/duvidas/${D1}/respostas`, { texto: 'Resposta do professor\n\n\n\ncom quebras' }, { usuario: 'u-prof' });
      assert.equal(r.status, 201);
      assert.equal(r.corpo.resposta.autorPapel, 'professor');
      assert.equal(r.corpo.resposta.autorNome, 'Professora Geral de Teste');
      assert.equal(r.corpo.resposta.texto, 'Resposta do professor\n\ncom quebras');
      assert.deepEqual(Object.keys(r.corpo.resposta).sort(), ['autorIniciais', 'autorNome', 'autorPapel', 'createdAt', 'id', 'texto']);

      const aluno = await t.api.get('/api/aulas/c01-m01-a01/duvidas', { usuario: 'u-aluno1' });
      assert.equal(aluno.status, 200);
      const d1 = aluno.corpo.itens.find(i => i.id === String(D1));
      assert.equal(d1.resolvida, true);
      assert.equal(d1.respostas[0].autorPapel, 'professor');
      assert.equal(aluno.corpo.podeResponder, false);

      const notif = await t.banco.collection('notificacoes').find({ userId: IDS['u-aluno1'], tipo: 'duvida.respondida' }).toArray();
      assert.equal(notif.length, 1);
      assert.equal(notif[0].link, 'aula.html?id=c01-m01-a01#duvidas');
    } finally { await fechar(t.server); }
  });

  test('temAcesso aceita docência e podeResponder vale para docente/admin; intruso continua 403', async () => {
    const t = await subirF8();
    try {
      const p = await t.api.get('/api/aulas/c01-m01-a02/duvidas', { usuario: 'u-prof' });
      assert.equal(p.status, 200, 'professor sem liberação lê pelo vínculo de docência');
      assert.equal(p.corpo.podeResponder, true);
      const a = await t.api.get('/api/aulas/c01-m01-a02/duvidas', { usuario: 'u-admin' });
      assert.equal(a.corpo.podeResponder, true);
      const i = await t.api.get('/api/aulas/c01-m01-a02/duvidas', { usuario: 'u-intruso' });
      assert.equal(i.status, 403);
      const ex = await t.api.get('/api/aulas/c01-m01-a02/duvidas', { usuario: 'u-ex' });
      assert.equal(ex.status, 403, 'docência de professor rebaixado não vale');
    } finally { await fechar(t.server); }
  });

  test('u-prof-t1 não responde dúvida de aluno de outra turma (404); texto objeto → 400 formato-invalido; curto → 400', async () => {
    const t = await subirF8();
    try {
      const alheia = await t.api.post(`/api/portal/professor/duvidas/${D2}/respostas`, { texto: 'Olá' }, { usuario: 'u-prof-t1' });
      assert.equal(alheia.status, 404);
      const obj = await t.api.post(`/api/portal/professor/duvidas/${D1}/respostas`, { texto: { $ne: 1 } }, { usuario: 'u-prof' });
      assert.equal(obj.status, 400);
      assert.equal(obj.corpo.codigo, 'formato-invalido');
      const curto = await t.api.post(`/api/portal/professor/duvidas/${D1}/respostas`, { texto: 'a' }, { usuario: 'u-prof' });
      assert.equal(curto.status, 400);
      assert.equal(curto.corpo.codigo, 'validacao');
      const inexistente = await t.api.post('/api/portal/professor/duvidas/0000000000000000000000ff/respostas', { texto: 'Olá' }, { usuario: 'u-prof' });
      assert.equal(inexistente.status, 404);
      const legadoObj = await t.api.post(`/api/duvidas/${D1}/respostas`, { texto: ['x'] }, { usuario: 'u-admin' });
      assert.equal(legadoObj.status, 400);
    } finally { await fechar(t.server); }
  });

  test('marcar resolvida e apagar só a própria resposta (admin apaga qualquer)', async () => {
    const t = await subirF8();
    try {
      const res = await t.api.put(`/api/portal/professor/duvidas/${D1}/resolvida`, { resolvida: true }, { usuario: 'u-prof-t1' });
      assert.equal(res.status, 200);
      assert.equal((await t.banco.collection('duvidas').findOne({ _id: D1 })).resolvida, true);
      const fmt = await t.api.put(`/api/portal/professor/duvidas/${D1}/resolvida`, { resolvida: 'sim' }, { usuario: 'u-prof' });
      assert.equal(fmt.status, 400);

      const r = await t.api.post(`/api/portal/professor/duvidas/${D1}/respostas`, { texto: 'Resposta da professora' }, { usuario: 'u-prof' });
      const respId = r.corpo.resposta.id;
      const alheia = await t.api.del(`/api/portal/professor/duvidas/${D1}/respostas/${respId}`, { usuario: 'u-prof-t1' });
      assert.equal(alheia.status, 403);
      const propria = await t.api.del(`/api/portal/professor/duvidas/${D1}/respostas/${respId}`, { usuario: 'u-prof' });
      assert.equal(propria.status, 200);
      const d = await t.banco.collection('duvidas').findOne({ _id: D1 });
      assert.equal(d.respostas.length, 0);
      assert.equal(d.resolvida, false, 'sem resposta volta para a fila');
      const adm = await t.api.del(`/api/portal/professor/duvidas/${D4}/respostas/resp-antiga`, { usuario: 'u-admin' });
      assert.equal(adm.status, 200);
    } finally { await fechar(t.server); }
  });

  test('admin legado: resposta grava autorPapel admin e notifica; fila legada inalterada; aluno não responde (403)', async () => {
    const t = await subirF8();
    try {
      const fila = await t.api.get('/api/duvidas/pendentes', { usuario: 'u-admin' });
      assert.equal(fila.status, 200);
      assert.equal(fila.corpo.pendentes, 3);
      assert.deepEqual(Object.keys(fila.corpo.itens[0]).sort(), ['aulaId', 'aulaTitulo', 'autorIniciais', 'autorNome', 'createdAt', 'cursoTitulo', 'id', 'respondida', 'texto']);
      const r = await t.api.post(`/api/duvidas/${D2}/respostas`, { texto: 'Resposta da coordenação' }, { usuario: 'u-admin' });
      assert.equal(r.status, 201);
      assert.equal(r.corpo.resposta.autorPapel, 'admin');
      assert.equal(await t.banco.collection('notificacoes').countDocuments({ userId: IDS['u-aluno2'], tipo: 'duvida.respondida' }), 1);
      const aluno = await t.api.post(`/api/duvidas/${D2}/respostas`, { texto: 'x y' }, { usuario: 'u-aluno1' });
      assert.equal(aluno.status, 403);
      const prof = await t.api.post(`/api/duvidas/${D2}/respostas`, { texto: 'x y' }, { usuario: 'u-prof' });
      assert.equal(prof.status, 403, 'rota admin legada continua só para admin');
    } finally { await fechar(t.server); }
  });

  test('aluno pergunta pelo legado (com liberação) e cooldown de 15 s continua', async () => {
    const t = await subirF8();
    try {
      const a = await t.api.post('/api/aulas/c01-m01-a01/duvidas', { texto: 'Nova pergunta da aluna' }, { usuario: 'u-aluno1' });
      assert.equal(a.status, 201);
      assert.equal(a.corpo.duvida.minha, true);
      const b = await t.api.post('/api/aulas/c01-m01-a01/duvidas', { texto: 'Outra logo em seguida' }, { usuario: 'u-aluno1' });
      assert.equal(b.status, 429);
    } finally { await fechar(t.server); }
  });
});

// =============================================================
describe('fábrica, montagem e exportador', () => {
  test('criarRotaPortalProfessor valida deps; o módulo registra o exportador `duvidas`', async () => {
    assert.throws(() => criarRotaPortalProfessor({}), /informe repo/);
    assert.throws(() => criarRotaPortalProfessor({ repo: () => null }), /informe servicos/);
    const t = await subirF8();
    try {
      await t.api.get('/api/portal/saude');
      const exps = t.servicos.todos('exportador').filter(e => e.dominio === 'duvidas');
      assert.equal(exps.length, 1);
      const dados = await exps[0].exportar(IDS['u-aluno1']);
      assert.equal(dados.length, 2);
      assert.ok(dados.every(d => !('userId' in d)));
      const exp = criarExportadorDuvidas({ repo: n => t.banco.collection(n) });
      assert.equal((await exp.exportar(IDS['u-intruso'])).length, 1);
    } finally { await fechar(t.server); }
  });

  test('varredura de segredo: nenhuma resposta do professor traz senhaHash nem token', async () => {
    const t = await subirF8({ falsos: falsosCompletos() });
    bancoAtual = t.banco;
    try {
      for (const c of ['/api/portal/professor/resumo', '/api/portal/professor/duvidas?status=todas', '/api/portal/professor/cursos/curso-01/alunos']) {
        const r = await t.api.get(c, { usuario: 'u-admin' });
        assert.equal(r.status, 200, c);
        assert.ok(!/senhaHash|\$2[aby]\$|segredo|token/i.test(r.texto), c);
      }
    } finally { await fechar(t.server); }
  });
});
