// Portal · F3a — rotas do acadêmico (PORTAL-API §6.7.3; linha `academico-rotas` da §9.3).
// Agregador real (montar.js) só com os módulos da F3a, banco em memória com as fixtures
// da F0a (nenhum Mongo). Rode com `npm test` na raiz.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid, AGORA_FIXTURE } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso, servicosFalsos } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const M = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');

const CFG = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });
const MODULOS_F3A = M.MODULOS_PADRAO.filter(m => m.fatia === 'F3a');
const AGORA = new Date(AGORA_FIXTURE);
const DIA = 86400000;

/** Sobe o agregador com os módulos da F3a; `falsos` = serviços de outras fatias. */
export async function subirF3a({ falsos = {}, preparar = null } = {}) {
  const banco = criarBancoMemoria();
  const dados = await semear(banco, { agora: AGORA });
  if (preparar) await preparar(banco, dados);
  const servicos = criarServicos();
  servicosFalsos(falsos, { em: servicos });
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: MODULOS_F3A, configPortal: CFG, falharCedo: true, log: silencioso, agora: () => new Date(AGORA)
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(M.tratarErroGlobal);
  const { server, base } = await subir(app);
  return { banco, servicos, api: cliente(base), fechar: () => fechar(server), dados };
}

const MAT1 = IDS['mat-aluno1'];
const MAT2 = IDS['mat-aluno2'];

describe('GET /portal/me/academico (atuais × histórico)', () => {
  test('401 sem sessão; atuais com o card exato da fixture; histórico vazio', async () => {
    const t = await subirF3a();
    try {
      assert.equal((await t.api.get('/api/portal/me/academico')).status, 401);
      const r = await t.api.get('/api/portal/me/academico', { usuario: 'u-aluno1' });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.atuais.length, 1);
      assert.deepEqual(r.corpo.historico, []);
      const c = r.corpo.atuais[0];
      assert.equal(c.id, MAT1);
      assert.equal(c.numero, 'MAT-2026-AAAAA2');
      assert.deepEqual(c.curso, { id: 'curso-01', titulo: 'Curso de Teste APE', sigla: 'APE' });
      assert.deepEqual(c.turma, { id: IDS.T1, codigo: 'APE-2026-01', modalidade: 'hibrido' });
      assert.equal(c.cargaTotalHoras, 12);
      assert.equal(c.status, 'ativa');
      assert.equal(c.statusRotulo, 'Ativa');
      assert.equal(c.situacaoCurso, 'cursando');
      assert.equal(c.nivelRotulo, null);
      assert.equal(c.semAcesso, false);
      const intruso = await t.api.get('/api/portal/me/academico', { usuario: 'u-intruso' });
      assert.deepEqual(intruso.corpo.atuais, []);
    } finally { await t.fechar(); }
  });

  test('matrícula concluída vai ao histórico com nota final e certificado', async () => {
    const t = await subirF3a({
      preparar: async (b) => {
        await b.collection('matriculas').updateOne({ _id: oid('mat-aluno1') }, { $set: { status: 'concluida', vigente: null, concluidaEm: AGORA, certificadoCodigo: 'DMC-ABCD-EFGH', resultadoFinal: { notaFinal: 8.4, regra: 'aprovacao', frequenciaPct: 90, cargaHorariaHoras: 12, modulos: [] } } });
      }
    });
    try {
      const r = await t.api.get('/api/portal/me/academico', { usuario: 'u-aluno1' });
      assert.equal(r.corpo.atuais.length, 0);
      assert.equal(r.corpo.historico.length, 1);
      assert.equal(r.corpo.historico[0].notaFinal, 8.4);
      assert.deepEqual(r.corpo.historico[0].certificado, { codigo: 'DMC-ABCD-EFGH' });
      assert.equal(r.corpo.historico[0].situacaoCurso, 'aprovado');
    } finally { await t.fechar(); }
  });
});

describe('GET /portal/me/academico/:matriculaId (ResumoMatricula)', () => {
  test('KPIs sem dado: média null, notaMinima 7; frequência das 5 aulas disponíveis', async () => {
    const t = await subirF3a();
    try {
      const r = await t.api.get(`/api/portal/me/academico/${MAT1}`, { usuario: 'u-aluno1' });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.notaMinima, 7);
      assert.equal(r.corpo.kpis.mediaParcial, null);
      assert.equal(r.corpo.kpis.frequenciaGeralPct, 0);
      assert.deepEqual(r.corpo.kpis.modulos, { total: 2, aprovados: 0, concluidos: 0, emAndamento: 0 });
      assert.deepEqual(r.corpo.kpis.cargaHoraria, { totalHoras: 12, cumpridaHoras: 0 });
      assert.equal(r.corpo.linhas.length, 2);
      assert.equal(r.corpo.linhas[0].chHoras, 1);
      assert.equal(r.corpo.linhas[0].frequencia.contaveis, 3);
      assert.equal(r.corpo.linhas[1].frequencia.contaveis, 2, 'aula "em breve" fora da conta');
      assert.equal(r.corpo.linhas[0].situacaoRotulo, 'Não iniciado');
      assert.equal(r.corpo.certificado.emitido, false);
      assert.equal(r.corpo.pendencias[0].tipo, 'aulas');
    } finally { await t.fechar(); }
  });

  test('reconciliação: progresso antigo vira frequência gravada com registradaEm = completedAt (idempotente)', async () => {
    const quando = new Date(AGORA.getTime() - 2 * DIA);
    const t = await subirF3a({
      preparar: async (b) => {
        await b.collection('progresso').insertMany([
          { userId: IDS['u-aluno1'], aulaId: 'c01-m01-a01', completedAt: quando },
          { userId: IDS['u-aluno1'], aulaId: 'c01-m01-a02', completedAt: quando },
          { userId: IDS['u-aluno1'], aulaId: 'c01-m01-a03', completedAt: new Date(AGORA.getTime() - 60 * DIA) } // antes da matrícula
        ]);
      }
    });
    try {
      const r = await t.api.get(`/api/portal/me/academico/${MAT1}`, { usuario: 'u-aluno1' });
      assert.equal(r.status, 200);
      const freqs = t.banco.documentos('frequencias');
      assert.equal(freqs.length, 2);
      for (const f of freqs) {
        assert.equal(f.via, 'reconciliacao');
        assert.equal(f.origem, 'gravado');
        assert.equal(new Date(f.registradaEm).getTime(), quando.getTime());
        assert.match(f.codigo, /^FRQ(-[2-9A-HJ-NP-Z]{4}){3}$/);
        assert.match(f.hash, /^[a-f0-9]{64}$/);
      }
      assert.equal(r.corpo.kpis.frequenciaGeralPct, 40);
      assert.equal(r.corpo.linhas[0].frequencia.gravadoPct, 66.7);
      await t.api.get(`/api/portal/me/academico/${MAT1}`, { usuario: 'u-aluno1' });
      assert.equal(t.banco.documentos('frequencias').length, 2, 'idempotente');
    } finally { await t.fechar(); }
  });

  test('matrícula alheia ou id inválido → 404', async () => {
    const t = await subirF3a();
    try {
      assert.equal((await t.api.get(`/api/portal/me/academico/${MAT1}`, { usuario: 'u-aluno2' })).status, 404);
      assert.equal((await t.api.get('/api/portal/me/academico/xyz', { usuario: 'u-aluno1' })).status, 404);
      assert.equal((await t.api.get('/api/portal/me/academico/000000000000000000000fff', { usuario: 'u-aluno1' })).status, 404);
    } finally { await t.fechar(); }
  });

  test('notaMinima = criteriosDe(curso).notaMinima (D-80) e nota/situação vindas da F2', async () => {
    const t = await subirF3a({
      preparar: b => b.collection('cursos').updateOne({ _id: 'curso-01' }, { $set: { criterios: { notaMinima: 8 } } }),
      falsos: {
        'avaliacoes.notaDoModulo': async (_mat, moduloId) => (moduloId === 'c01-m01'
          ? { temModular: true, avaliacaoModularId: 'av1', nota: 7.5, situacao: 'x', aguardandoCorrecao: false, finalizada: false, tentativas: { usadas: 1, permitidas: 3, restantes: 2 } }
          : { temModular: false, avaliacaoModularId: null, nota: null, situacao: 'cursando', aguardandoCorrecao: false, finalizada: false, tentativas: { usadas: 0, permitidas: 0, restantes: 0 } })
      }
    });
    try {
      const r = await t.api.get(`/api/portal/me/academico/${MAT1}`, { usuario: 'u-aluno1' });
      assert.equal(r.corpo.notaMinima, 8);
      assert.equal(r.corpo.kpis.mediaParcial, 7.5);
      assert.equal(r.corpo.linhas[0].media, 7.5);
      assert.equal(r.corpo.linhas[0].situacao, 'em_recuperacao', '7,5 < 8 com tentativas restantes');
      assert.deepEqual(r.corpo.linhas[0].tentativas, { usadas: 1, permitidas: 3, restantes: 2 });
      assert.equal(r.corpo.linhas[1].media, null);
    } finally { await t.fechar(); }
  });
});

describe('professor: resumo da matrícula e boletim', () => {
  test('resumo de professor sem CPF/endereço/senhaHash; docência por turma; aluno → 403', async () => {
    const t = await subirF3a();
    try {
      const r = await t.api.get(`/api/portal/professor/matriculas/${MAT1}/academico`, { usuario: 'u-prof' });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.aluno.nome, 'Aluna Um de Teste');
      assert.doesNotMatch(r.texto, /senhaHash|cpf|endereco|"documento"/i);
      assert.equal((await t.api.get(`/api/portal/professor/matriculas/${MAT1}/academico`, { usuario: 'u-prof-t1' })).status, 200);
      assert.equal((await t.api.get(`/api/portal/professor/matriculas/${MAT2}/academico`, { usuario: 'u-prof-t1' })).status, 404);
      assert.equal((await t.api.get(`/api/portal/professor/matriculas/${MAT1}/academico`, { usuario: 'u-aluno1' })).status, 403);
      assert.equal((await t.api.get(`/api/portal/professor/matriculas/${MAT1}/academico`, { usuario: 'u-ex' })).status, 403, 'professor rebaixado');
    } finally { await t.fechar(); }
  });

  test('boletim: u-prof-t1 sem turmaId vê só a T1; turmaId da T2 → 403; geral vê as duas', async () => {
    const t = await subirF3a();
    try {
      const t1 = await t.api.get('/api/portal/professor/cursos/curso-01/boletim', { usuario: 'u-prof-t1' });
      assert.equal(t1.status, 200);
      assert.deepEqual(t1.corpo.alunos.map(a => a.matriculaId), [MAT1]);
      assert.equal(t1.corpo.modulos.length, 2);
      assert.equal((await t.api.get(`/api/portal/professor/cursos/curso-01/boletim?turmaId=${IDS.T2}`, { usuario: 'u-prof-t1' })).status, 403);
      const geral = await t.api.get('/api/portal/professor/cursos/curso-01/boletim', { usuario: 'u-prof' });
      assert.deepEqual(geral.corpo.alunos.map(a => a.matriculaId).sort(), [MAT1, MAT2].sort());
      assert.equal((await t.api.get('/api/portal/professor/cursos/curso-02/boletim', { usuario: 'u-prof-t1' })).status, 403);
    } finally { await t.fechar(); }
  });

  test('boletim acima de 300 matrículas → 413 relatorio-grande', async () => {
    const t = await subirF3a({
      preparar: async (b) => {
        const docs = Array.from({ length: 301 }, (_, i) => ({ numero: `MAT-2026-X${String(i).padStart(5, '0')}`, userId: `u${i}`, cursoId: 'curso-01', turmaId: oid('T1'), status: 'ativa', inicioEm: AGORA }));
        await b.collection('matriculas').insertMany(docs);
      }
    });
    try {
      const r = await t.api.get('/api/portal/professor/cursos/curso-01/boletim', { usuario: 'u-prof' });
      assert.equal(r.status, 413);
      assert.equal(r.corpo.codigo, 'relatorio-grande');
    } finally { await t.fechar(); }
  });
});

describe('serviços academico.* registrados (API §4.4)', () => {
  test('nomes fixos, situacaoDoCurso e varredura de segredo', async () => {
    const t = await subirF3a();
    try {
      await t.api.get('/api/portal/saude');
      for (const nome of ['academico.criteriosDe', 'academico.situacaoDoCurso', 'academico.resumoMatricula', 'academico.proximosEncontros', 'academico.encontrosDoEscopo']) {
        assert.equal(typeof t.servicos.tentar(nome), 'function', nome);
      }
      assert.equal(t.servicos.obter('academico.criteriosDe')({}).notaMinima, 7);
      const s = await t.servicos.obter('academico.situacaoDoCurso')(IDS['u-aluno1'], 'curso-01');
      assert.equal(s.situacao, 'cursando');
      assert.equal(s.regra, 'aulas');
      assert.equal(s.modulos.length, 2);
      const resumo = await t.servicos.obter('academico.resumoMatricula')(MAT1, { visao: 'admin' });
      assert.equal(resumo.matricula.id, MAT1);
      assert.doesNotMatch(JSON.stringify(resumo), /senhaHash|segredo|JWT/i);
      assert.equal(t.servicos.todos('validador').filter(v => v.prefixo === 'FRQ').length, 1);
      assert.equal(t.servicos.todos('aoConcluirAula').length, 1);
    } finally { await t.fechar(); }
  });
});

describe('relatórios frequencia e presencas (grupo relatorio)', () => {
  test('mesma conta do Acadêmico; docência de turma filtra; turma alheia 403; teto 413', async () => {
    const t = await subirF3a({
      preparar: async (b) => {
        await b.collection('lives').insertOne({ _id: 'e1', cursoId: 'curso-01', turmaId: null, moduloId: 'c01-m01', titulo: 'Sexta · noite', inicioEm: new Date(AGORA.getTime() - 2 * DIA), duracaoMin: 90 });
        await b.collection('progresso').insertOne({ userId: IDS['u-aluno1'], aulaId: 'c01-m01-a01', completedAt: new Date(AGORA.getTime() - DIA) });
      }
    });
    try {
      await t.api.get(`/api/portal/me/academico/${MAT1}`, { usuario: 'u-aluno1' }); // reconcilia a gravada
      const rel = id => t.servicos.todos('relatorio').find(d => d.id === id);
      const req = async nome => ({ user: await t.banco.collection('users').findOne({ _id: oid(nome) }) });
      const freq = rel('frequencia');
      const linhasProf = await freq.consultar(await req('u-prof'), { cursoId: 'curso-01' }, { limite: 1000 });
      const geral1 = linhasProf.find(l => l.matricula === 'MAT-2026-AAAAA2' && l.modulo === 'Geral');
      const acad = await t.api.get(`/api/portal/me/academico/${MAT1}`, { usuario: 'u-aluno1' });
      assert.equal(geral1.frequenciaPct, acad.corpo.kpis.frequenciaGeralPct);
      assert.equal(geral1.faltas, 1);
      assert.equal(linhasProf.length, 2 * 3, '2 matrículas × (geral + 2 módulos)');
      const linhasT1 = await freq.consultar(await req('u-prof-t1'), { cursoId: 'curso-01' }, { limite: 1000 });
      assert.deepEqual([...new Set(linhasT1.map(l => l.matricula))], ['MAT-2026-AAAAA2']);
      await assert.rejects(freq.consultar(await req('u-prof-t1'), { cursoId: 'curso-01', turmaId: IDS.T2 }, { limite: 1000 }), e => e.status === 403);
      await assert.rejects(freq.consultar(await req('u-prof'), { cursoId: 'curso-01' }, { limite: 2 }), e => e.status === 413);
      const resumo = await freq.resumir(await req('u-prof'), { cursoId: 'curso-01' });
      assert.equal(resumo.kpis.find(k => k.chave === 'abaixoDoMinimo').valor, null, 'sem frequenciaMinima');
      assert.equal(resumo.series[0].pontos.length, 1);
      assert.equal(resumo.series[0].pontos[0].valor, 0);
      const pres = await rel('presencas').consultar(await req('u-admin'), { cursoId: 'curso-01' }, { limite: 1000 });
      assert.equal(pres.length, 2);
      assert.ok(pres.every(l => l.presenca === 'não'));
    } finally { await t.fechar(); }
  });
});

