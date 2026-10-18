// Portal · F7 — relatórios (catálogo, JSON/CSV) e painel da coordenação. PORTAL-API §6.11.3,
// §4.4 (grupos relatorio/painel), §4.13 (CSV), índice §8.5 (F7), D-24 (CPF nunca).
// Agregador real só com o módulo de relatórios da F7 + definições falsas de relatório e de
// painel (as reais são das outras fatias); banco em memória, sem rede.
//   NODE_ENV=test node --test server/test/comunicacao-relatorios.test.js
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
const { criarServicos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const E = await import('../src/portal/erros.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const R = await import('../src/routes/portal/relatorios.js');

const CFG = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });
const MODULOS = M.MODULOS_PADRAO.filter(m => m.caminho === 'routes/portal/relatorios.js');

/** 120 linhas falsas: 60 por turma; a definição filtra por curso/turma como as reais. */
function linhasFalsas(filtros) {
  const out = [];
  for (let i = 0; i < 120; i++) {
    const turmaId = i % 2 ? IDS.T2 : IDS.T1;
    if (filtros.turmaId && filtros.turmaId !== turmaId) continue;
    out.push({
      curso: 'Curso de Teste APE', turma: i % 2 ? 'APE-2026-02' : 'APE-2026-01', numero: `MAT-2026-${String(i).padStart(6, 'A')}`,
      nome: i === 0 ? '=HYPERLINK("http://x")' : `Aluno ${i}`, email: `aluno${i}@exemplo.invalid`, cpf: '12345678909', progressoPct: i % 101
    });
  }
  return out;
}

const chamadas = [];
const RELATORIO_ALUNOS = {
  id: 'alunos', titulo: 'Alunos por curso e turma', papeis: ['professor', 'admin'],
  filtros: [{ chave: 'cursoId', tipo: 'curso' }, { chave: 'turmaId', tipo: 'turma' }, { chave: 'status', tipo: 'texto' }],
  colunas: [
    { chave: 'curso', rotulo: 'Curso', tipo: 'texto' }, { chave: 'turma', rotulo: 'Turma', tipo: 'texto' },
    { chave: 'numero', rotulo: 'Nº matrícula', tipo: 'texto' }, { chave: 'nome', rotulo: 'Nome', tipo: 'texto' },
    { chave: 'email', rotulo: 'E-mail', tipo: 'texto', somenteAdmin: true }, { chave: 'cpf', rotulo: 'CPF', tipo: 'texto' },
    { chave: 'progressoPct', rotulo: 'Progresso %', tipo: 'pct' }
  ],
  async consultar(_req, filtros) { chamadas.push({ consultar: filtros }); return linhasFalsas(filtros); },
  async resumir(_req, filtros) {
    const l = linhasFalsas(filtros);
    chamadas.push({ resumir: filtros });
    return { kpis: [{ chave: 'matriculasAtivas', rotulo: 'Matrículas ativas', valor: l.length, formato: 'numero' }, { chave: 'semTurma', rotulo: 'Sem turma', valor: null, formato: 'numero' }],
      series: [{ chave: 'alunosPorTurma', rotulo: 'Alunos por turma', formato: 'numero', pontos: [{ rotulo: 'APE-2026-01', valor: 60 }, { rotulo: 'APE-2026-02', valor: 60 }] }] };
  }
};
const RELATORIO_ADMIN = {
  id: 'financeiro', titulo: 'Financeiro', papeis: ['admin'], filtros: [], colunas: [{ chave: 'aluno', rotulo: 'Aluno', tipo: 'texto' }],
  async consultar() { return [{ aluno: 'Alguém' }]; }
};
const RELATORIO_GRANDE = {
  id: 'presencas', titulo: 'Presenças', papeis: ['professor', 'admin'], filtros: [{ chave: 'cursoId', tipo: 'curso', obrigatorio: true }],
  colunas: [{ chave: 'n', rotulo: 'N', tipo: 'numero' }],
  async consultar(_req, _f, { limite }) { return Array.from({ length: limite + 1 }, (_, i) => ({ n: i })); }
};
const RELATORIO_DIVERSIDADE = {
  id: 'diversidade', titulo: 'Diversidade', papeis: ['admin'], filtros: [], colunas: [{ chave: 'grupo', rotulo: 'Grupo', tipo: 'texto' }, { chave: 'n', rotulo: 'Pessoas', tipo: 'texto' }],
  async consultar() { return [{ grupo: 'Não informado', n: '<5' }]; }
};
const PAINEL_ALUNOS = { bloco: 'alunos', chaves: ['comAcesso', 'comMatriculaAtiva'], papeis: ['admin'], async contar() { return { comAcesso: 2, comMatriculaAtiva: 2 }; } };
const PAINEL_QUEBRADO = { bloco: 'financeiro', chaves: ['emAberto'], papeis: ['admin'], async contar() { throw new Error('falha simulada'); } };

async function subirPortal() {
  const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
  await semear(banco);
  const servicos = criarServicos();
  for (const d of [RELATORIO_ALUNOS, RELATORIO_ADMIN, RELATORIO_GRANDE, RELATORIO_DIVERSIDADE]) servicos.adicionar('relatorio', d);
  servicos.adicionar('painel', PAINEL_ALUNOS);
  servicos.adicionar('painel', PAINEL_QUEBRADO);
  servicos.registrar('secretaria.turmasDoCurso', async (cursoId) => (cursoId === 'curso-01' ? [{ id: IDS.T1, codigo: 'APE-2026-01' }, { id: IDS.T2, codigo: 'APE-2026-02' }] : []));
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: MODULOS, configPortal: CFG, falharCedo: true, log: silencioso
  });
  await portal.carregar();
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(E.criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  return { api: cliente(base), server, banco, servicos };
}

function semChave(obj, chave) {
  const s = JSON.stringify(obj);
  assert.ok(!new RegExp(`"${chave}"\\s*:`, 'i').test(s), `chave ${chave} na resposta`);
}

describe('relatórios', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('catálogo filtrado pelo papel; professor sem colunas somenteAdmin; CPF nunca; aluno → 403; sem sessão → 401', async () => {
    assert.equal((await ctx.api.get('/api/portal/professor/relatorios')).status, 401);
    assert.equal((await ctx.api.get('/api/portal/professor/relatorios', { usuario: 'u-aluno1' })).status, 403);
    const prof = await ctx.api.get('/api/portal/professor/relatorios', { usuario: 'u-prof' });
    assert.equal(prof.status, 200);
    assert.deepEqual(prof.corpo.itens.map(i => i.id).sort(), ['alunos', 'presencas']);
    const alunos = prof.corpo.itens.find(i => i.id === 'alunos');
    assert.deepEqual(alunos.colunas.map(c => c.chave), ['curso', 'turma', 'numero', 'nome', 'progressoPct']);
    assert.equal(alunos.temResumo, true);
    assert.deepEqual(alunos.formatos, ['json', 'csv']);
    const adm = await ctx.api.get('/api/portal/professor/relatorios', { usuario: 'u-admin' });
    assert.deepEqual(adm.corpo.itens.map(i => i.id).sort(), ['alunos', 'diversidade', 'financeiro', 'presencas']);
    assert.ok(adm.corpo.itens.find(i => i.id === 'alunos').colunas.some(c => c.chave === 'email' && c.somenteAdmin));
    assert.deepEqual(adm.corpo.itens.find(i => i.id === 'diversidade').formatos, ['json']);
    semChave(adm.corpo, 'cpf');
  });

  test('relatório fora do papel → 404; filtro obrigatório → 400; filtro malformado → 400', async () => {
    assert.equal((await ctx.api.get('/api/portal/professor/relatorios/financeiro', { usuario: 'u-prof' })).status, 404);
    assert.equal((await ctx.api.get('/api/portal/professor/relatorios/nao-existe', { usuario: 'u-admin' })).status, 404);
    const obrig = await ctx.api.get('/api/portal/professor/relatorios/presencas', { usuario: 'u-admin' });
    assert.equal(obrig.status, 400);
    assert.ok(obrig.corpo.campos.cursoId);
    const mal = await ctx.api.get('/api/portal/professor/relatorios/alunos?cursoId=%24ne&de=2026-13-01', { usuario: 'u-admin' });
    assert.equal(mal.status, 400);
    assert.ok(mal.corpo.campos.cursoId && mal.corpo.campos.de);
    const fmt = await ctx.api.get('/api/portal/professor/relatorios/alunos?formato=xlsx', { usuario: 'u-admin' });
    assert.equal(fmt.status, 400);
    const div = await ctx.api.get('/api/portal/professor/relatorios/diversidade?formato=csv', { usuario: 'u-admin' });
    assert.equal(div.status, 400);
  });

  test('professor só os próprios cursos e turmas (403 nao-docente), antes de consultar', async () => {
    chamadas.length = 0;
    const c2 = await ctx.api.get('/api/portal/professor/relatorios/alunos?cursoId=curso-02', { usuario: 'u-prof' });
    assert.equal(c2.status, 403);
    assert.equal(c2.corpo.codigo, 'nao-docente');
    const t2 = await ctx.api.get(`/api/portal/professor/relatorios/alunos?cursoId=curso-01&turmaId=${IDS.T2}`, { usuario: 'u-prof-t1' });
    assert.equal(t2.status, 403);
    const t2SemCurso = await ctx.api.get(`/api/portal/professor/relatorios/alunos?turmaId=${IDS.T2}`, { usuario: 'u-prof-t1' });
    assert.equal(t2SemCurso.status, 403);
    assert.equal(chamadas.length, 0, 'a definição não pode ser consultada antes da conferência');
    const ex = await ctx.api.get('/api/portal/professor/relatorios/alunos?cursoId=curso-01', { usuario: 'u-ex' });
    assert.equal(ex.status, 403);
    const t1 = await ctx.api.get(`/api/portal/professor/relatorios/alunos?cursoId=curso-01&turmaId=${IDS.T1}`, { usuario: 'u-prof-t1' });
    assert.equal(t1.status, 200);
    const geral = await ctx.api.get(`/api/portal/professor/relatorios/alunos?turmaId=${IDS.T2}`, { usuario: 'u-prof' });
    assert.equal(geral.status, 200);
  });

  test('JSON: 50 por página, resumo sobre o conjunto filtrado inteiro, sem somenteAdmin para o professor, sem CPF', async () => {
    chamadas.length = 0;
    const r = await ctx.api.get(`/api/portal/professor/relatorios/alunos?cursoId=curso-01&turmaId=${IDS.T1}&status=ativa`, { usuario: 'u-prof' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.total, 60);
    assert.equal(r.corpo.porPagina, 50);
    assert.equal(r.corpo.totalPaginas, 2);
    assert.equal(r.corpo.itens.length, 50);
    assert.equal(r.corpo.resumo.kpis[0].valor, 60, 'resumo do conjunto inteiro, não da página');
    assert.equal(r.corpo.resumo.kpis[1].valor, null);
    assert.deepEqual(chamadas.find(c => c.resumir).resumir, { cursoId: 'curso-01', turmaId: IDS.T1, status: 'ativa' });
    assert.deepEqual(Object.keys(r.corpo.itens[0]), ['curso', 'turma', 'numero', 'nome', 'progressoPct']);
    semChave(r.corpo, 'cpf');
    semChave(r.corpo, 'email');
    const p2 = await ctx.api.get(`/api/portal/professor/relatorios/alunos?cursoId=curso-01&turmaId=${IDS.T1}&pagina=2`, { usuario: 'u-prof' });
    assert.equal(p2.corpo.itens.length, 10);
    assert.equal(p2.corpo.resumo, null);
    const adm = await ctx.api.get('/api/portal/professor/relatorios/alunos', { usuario: 'u-admin' });
    assert.ok(Object.hasOwn(adm.corpo.itens[0], 'email'));
    semChave(adm.corpo, 'cpf');
    const semResumo = await ctx.api.get('/api/portal/professor/relatorios/financeiro', { usuario: 'u-admin' });
    assert.equal(semResumo.corpo.resumo, null);
  });

  test('CSV: BOM, ";", proteção contra fórmula, sem CPF, sem somenteAdmin para o professor; auditoria relatorio.exportado', async () => {
    const r = await ctx.api.get('/api/portal/professor/relatorios/alunos?formato=csv&cursoId=curso-01', { usuario: 'u-prof' });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/csv; charset=utf-8/);
    assert.match(r.headers.get('content-disposition'), /^attachment; filename="dmc-alunos-\d{4}-\d{2}-\d{2}\.csv"$/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.ok(r.texto.startsWith('﻿') || r.texto.startsWith('Curso'), 'BOM');
    const linhas = r.texto.replace(/^﻿/, '').trim().split(/\r\n/);
    assert.equal(linhas.length, 121);
    assert.equal(linhas[0].replace(/"/g, ''), 'Curso;Turma;Nº matrícula;Nome;Progresso %');
    assert.ok(linhas[1].includes(`'=HYPERLINK(`), 'célula com fórmula neutralizada');
    assert.ok(!linhas[1].split(';').some(c => c.replace(/^"/, '').startsWith('=')), 'nenhuma célula começa com =');
    assert.ok(!/12345678909/.test(r.texto), 'CPF nunca vai no CSV');
    assert.ok(!/exemplo\.invalid/.test(r.texto), 'e-mail é somenteAdmin');
    const aud = await ctx.banco.collection('auditoria').findOne({ acao: 'relatorio.exportado' });
    assert.ok(aud);
    assert.equal(aud.extra.id, 'alunos');
    assert.equal(aud.extra.linhas, 120);
    assert.deepEqual(aud.extra.filtros, { cursoId: 'curso-01' });
  });

  test('teto de 20.000 linhas → 413 relatorio-grande (JSON e CSV)', async () => {
    const j = await ctx.api.get('/api/portal/professor/relatorios/presencas?cursoId=curso-01', { usuario: 'u-admin' });
    assert.equal(j.status, 413);
    assert.equal(j.corpo.codigo, 'relatorio-grande');
    const c = await ctx.api.get('/api/portal/professor/relatorios/presencas?cursoId=curso-01&formato=csv', { usuario: 'u-admin' });
    assert.equal(c.status, 413);
  });

  test('painel da coordenação: contribuição real, falha → chaves null, bloco sem contribuição → null; professor → 403', async () => {
    assert.equal((await ctx.api.get('/api/portal/admin/relatorios/painel', { usuario: 'u-prof' })).status, 403);
    const r = await ctx.api.get('/api/portal/admin/relatorios/painel', { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.alunos, { comAcesso: 2, comMatriculaAtiva: 2, liberacoesSemMatricula: null });
    assert.deepEqual(r.corpo.financeiro, { emAberto: null, emAtraso: null, pagoNoMes: null });
    assert.equal(r.corpo.documentos, null);
    assert.equal(r.corpo.ia, null);
    assert.ok(r.corpo.sistema && Array.isArray(r.corpo.sistema.modulosAusentes), 'bloco sistema do núcleo');
    assert.equal(r.corpo.sistema.instituicaoPendente, null);
  });

  test('limite de 20 consultas por hora (429 com a mensagem do servidor)', async () => {
    let ultimo = null;
    for (let i = 0; i < 25; i++) {
      ultimo = await ctx.api.get('/api/portal/professor/relatorios/financeiro', { usuario: 'u-admin' });
      if (ultimo.status === 429) break;
    }
    assert.equal(ultimo.status, 429);
    assert.match(ultimo.corpo.error || ultimo.corpo.mensagem || '', /20 consultas/);
  });
});

describe('relatórios (puro)', () => {
  test('colunasDoPapel, projetarLinha e normalizarResumo', () => {
    const def = { colunas: [{ chave: 'a', rotulo: 'A' }, { chave: 'b', rotulo: 'B', somenteAdmin: true }, { chave: 'CPF', rotulo: 'CPF' }] };
    assert.deepEqual(R.colunasDoPapel(def, 'professor').map(c => c.chave), ['a']);
    assert.deepEqual(R.colunasDoPapel(def, 'admin').map(c => c.chave), ['a', 'b']);
    assert.deepEqual(R.projetarLinha({ a: 1, b: 2, cpf: 'x' }, [{ chave: 'a' }]), { a: 1 });
    const n = R.normalizarResumo({ kpis: [1, 2, 3, 4, 5].map(i => ({ chave: `k${i}`, rotulo: 'K', valor: i === 2 ? 'x' : i, formato: 'numero' })), series: [{ chave: 's', pontos: [{ rotulo: 'a', valor: 1, cpf: '1' }] }] });
    assert.equal(n.kpis.length, 4);
    assert.equal(n.kpis[1].valor, null);
    assert.deepEqual(n.series[0].pontos, [{ rotulo: 'a', valor: 1 }]);
    assert.equal(R.normalizarResumo(null), null);
  });
});
