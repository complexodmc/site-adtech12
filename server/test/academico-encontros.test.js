// Portal · F3a — agenda, encontros, presença automática e `lives` legado
// (PORTAL-API §6.7.2, §7.5, D-40; linha `academico-encontros` da §9.3).
// Rode com `npm test` na raiz.
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
const { criarRotaLives } = await import('../src/routes/lives.js');
const { criarAssinador } = await import('../src/portal/cripto.js');
const { camposAssinadosFrequencia } = await import('../src/portal/academico/servico-academico.js');

const CFG = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });
const MODULOS_F3A = M.MODULOS_PADRAO.filter(m => m.fatia === 'F3a');
const AGORA = new Date(AGORA_FIXTURE);
const MIN = 60000;
const DIA = 86400000;

const live = (id, inicioMin, extra = {}) => ({
  _id: id, cursoId: 'curso-01', titulo: `Encontro ${id}`, descricao: '', inicioEm: new Date(AGORA.getTime() + inicioMin * MIN),
  duracaoMin: 90, url: `https://sala.exemplo.invalid/${id}`, plataforma: 'Sala', createdAt: AGORA, ...extra
});

async function subirF3a({ preparar = null, falsos = {} } = {}) {
  const banco = criarBancoMemoria();
  await semear(banco, { agora: AGORA });
  await banco.collection('lives').insertMany([
    live('e-agora-geral', -10),                                 // na janela, sem turma
    live('e-agora-t1', -5, { turmaId: oid('T1'), moduloId: 'c01-m01', aulaGravadaId: 'c01-m01-a01' }),
    live('e-agora-t2', -5, { turmaId: oid('T2') }),
    live('e-futuro', 3 * 24 * 60),
    live('e-passado', -3 * 24 * 60),
    live('e-cancelado', -5, { cancelado: true, motivoCancelamento: 'Feriado' })
  ]);
  if (preparar) await preparar(banco);
  const servicos = criarServicos();
  servicosFalsos(falsos, { em: servicos });
  let relogio = new Date(AGORA);
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: MODULOS_F3A, configPortal: CFG, falharCedo: true, log: silencioso, agora: () => new Date(relogio)
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  // legado /api/lives com o mesmo banco e o mesmo localizador (grupo cascata)
  app.use('/api/lives', criarRotaLives({ repo: n => banco.collection(n), servicos, agora: () => relogio.getTime(), log: silencioso, exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin] }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(M.tratarErroGlobal);
  const { server, base } = await subir(app);
  const api = cliente(base);
  await api.get('/api/portal/saude'); // carrega os módulos (serviços e grupos)
  return { banco, servicos, api, fechar: () => fechar(server), avancar: (ms) => { relogio = new Date(relogio.getTime() + ms); } };
}

const agenda = (t, usuario, q = '') => t.api.get(`/api/portal/agenda?de=2026-10-01&ate=2026-10-31${q}`, { usuario });

describe('GET /portal/agenda', () => {
  test('aluno vê os da turma dele e os sem turma; url só com podeEntrar; cancelado aparece riscado', async () => {
    const t = await subirF3a();
    try {
      const r = await agenda(t, 'u-aluno1');
      assert.equal(r.status, 200);
      const ids = r.corpo.itens.map(i => i.id).sort();
      assert.deepEqual(ids, ['e-agora-geral', 'e-agora-t1', 'e-cancelado', 'e-futuro', 'e-passado'].sort());
      const por = Object.fromEntries(r.corpo.itens.map(i => [i.id, i]));
      assert.equal(por['e-agora-t1'].podeEntrar, true);
      assert.equal(por['e-agora-t1'].url, 'https://sala.exemplo.invalid/e-agora-t1');
      assert.equal(por['e-agora-t1'].turma.codigo, 'APE-2026-01');
      assert.equal(por['e-agora-t1'].modulo.titulo, 'Módulo 1');
      assert.equal(por['e-agora-t1'].aulaGravada.id, 'c01-m01-a01');
      assert.equal(por['e-futuro'].url, null);
      assert.equal(por['e-futuro'].status, 'agendada');
      assert.equal(por['e-passado'].status, 'encerrada');
      assert.equal(por['e-passado'].url, null);
      assert.equal(por['e-cancelado'].status, 'cancelada');
      assert.equal(por['e-cancelado'].podeEntrar, false);
      const r2 = await agenda(t, 'u-aluno2');
      assert.ok(r2.corpo.itens.some(i => i.id === 'e-agora-t2'));
      assert.ok(!r2.corpo.itens.some(i => i.id === 'e-agora-t1'));
      assert.deepEqual((await agenda(t, 'u-intruso')).corpo.itens, []);
    } finally { await t.fechar(); }
  });

  test('equipe recebe url sempre; docente da T1 não vê os da T2; intervalo > 400 dias → 400', async () => {
    const t = await subirF3a();
    try {
      const prof = await agenda(t, 'u-prof-t1');
      const ids = prof.corpo.itens.map(i => i.id);
      assert.ok(ids.includes('e-agora-t1') && ids.includes('e-futuro'));
      assert.ok(!ids.includes('e-agora-t2'));
      assert.equal(prof.corpo.itens.find(i => i.id === 'e-futuro').url, 'https://sala.exemplo.invalid/e-futuro');
      const adm = await agenda(t, 'u-admin');
      assert.ok(adm.corpo.itens.some(i => i.id === 'e-agora-t2'));
      const passado = adm.corpo.itens.find(i => i.id === 'e-passado');
      assert.deepEqual([passado.presentes, passado.esperados], [0, 2], 'presentes/esperados no encerrado');
      assert.equal(adm.corpo.itens.find(i => i.id === 'e-futuro').esperados, undefined);
      assert.equal((await t.api.get('/api/portal/agenda?de=2026-01-01&ate=2027-06-01', { usuario: 'u-aluno1' })).status, 400);
      assert.equal((await t.api.get('/api/portal/agenda?de=xx', { usuario: 'u-aluno1' })).status, 400);
    } finally { await t.fechar(); }
  });
});

describe('POST /portal/encontros/:id/entrar (presença automática)', () => {
  test('fora da janela 409; na janela 200 com presença e selo; repetido devolve a mesma', async () => {
    const t = await subirF3a();
    try {
      const fora = await t.api.post('/api/portal/encontros/e-futuro/entrar', {}, { usuario: 'u-aluno1' });
      assert.equal(fora.status, 409);
      assert.equal(fora.corpo.codigo, 'fora-da-janela');
      assert.ok(fora.corpo.abreEm);
      const r = await t.api.post('/api/portal/encontros/e-agora-t1/entrar', {}, { usuario: 'u-aluno1' });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.url, 'https://sala.exemplo.invalid/e-agora-t1');
      assert.match(r.corpo.presenca.codigo, /^FRQ(-[2-9A-HJ-NP-Z]{4}){3}$/);
      assert.match(r.corpo.presenca.hash, /^[a-f0-9]{64}$/);
      const r2 = await t.api.post('/api/portal/encontros/e-agora-t1/entrar', {}, { usuario: 'u-aluno1' });
      assert.equal(r2.status, 200);
      assert.equal(r2.corpo.presenca.codigo, r.corpo.presenca.codigo, 'idempotente');
      const freqs = t.banco.documentos('frequencias');
      assert.equal(freqs.length, 1);
      const f = freqs[0];
      assert.equal(f.origem, 'ao_vivo');
      assert.equal(f.via, 'entrada');
      assert.equal(f.encontroId, 'e-agora-t1');
      assert.equal(f.moduloId, 'c01-m01');
      assert.equal(f.snapshot.turmaCodigo, 'APE-2026-01');
      // selo recalculável (integro)
      const assinador = criarAssinador({ material: 'segredo-de-teste' });
      assert.equal(assinador.verificar('frequencia', camposAssinadosFrequencia(f), f.hash, f.kid), true);
      assert.equal(assinador.verificar('frequencia', { ...camposAssinadosFrequencia(f), via: 'lancamento_professor' }, f.hash, f.kid), false);
      // validador FRQ (despacho público é da F3b)
      const v = t.servicos.todos('validador').find(d => d.prefixo === 'FRQ');
      const resp = await v.validar(f.codigo);
      assert.equal(resp.valido, true);
      assert.equal(resp.integro, true);
      assert.equal(resp.iniciais, 'A. T.');
      assert.match(resp.hashPrefixo, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
      assert.doesNotMatch(JSON.stringify(resp), /aluno1|Aluna|matricula|userId/i);
      assert.equal(await v.validar('FRQ-2222-2222-2222'), null);
      // a agenda passa a mostrar a presença
      const ag = await agenda(t, 'u-aluno1');
      assert.equal(ag.corpo.itens.find(i => i.id === 'e-agora-t1').presenca.codigo, f.codigo);
    } finally { await t.fechar(); }
  });

  test('aluno de outra turma 404; cancelado 409; trancada 409; inexistente 404; sem sessão 401', async () => {
    const t = await subirF3a({ preparar: b => b.collection('matriculas').updateOne({ _id: oid('mat-aluno2') }, { $set: { status: 'trancada' } }) });
    try {
      assert.equal((await t.api.post('/api/portal/encontros/e-agora-t1/entrar', {}, { usuario: 'u-aluno2' })).status, 404);
      const c = await t.api.post('/api/portal/encontros/e-cancelado/entrar', {}, { usuario: 'u-aluno1' });
      assert.equal(c.status, 409);
      assert.equal(c.corpo.codigo, 'encontro-cancelado');
      const tr = await t.api.post('/api/portal/encontros/e-agora-geral/entrar', {}, { usuario: 'u-aluno2' });
      assert.equal(tr.status, 409);
      assert.equal(tr.corpo.codigo, 'matricula-nao-ativa');
      assert.equal((await t.api.post('/api/portal/encontros/nao-existe/entrar', {}, { usuario: 'u-aluno1' })).status, 404);
      assert.equal((await t.api.post('/api/portal/encontros/e-agora-geral/entrar', {})).status, 401);
      assert.equal(t.banco.documentos('frequencias').length, 0);
    } finally { await t.fechar(); }
  });

  test('liberação sem matrícula (legado, D5): sala abre, presença não é registrada', async () => {
    const t = await subirF3a({ preparar: b => b.collection('matriculas').deleteOne({ _id: oid('mat-aluno1') }) });
    try {
      const r = await t.api.post('/api/portal/encontros/e-agora-geral/entrar', {}, { usuario: 'u-aluno1' });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.presenca, null);
      assert.equal(r.corpo.semMatricula, true);
      assert.equal((await t.api.post('/api/portal/encontros/e-agora-t1/entrar', {}, { usuario: 'u-aluno1' })).status, 404, 'encontro de turma exige a matrícula na turma');
    } finally { await t.fechar(); }
  });
});

describe('professor: criar, editar, cancelar, excluir encontros', () => {
  test('criação só por POST com id gerado; docente só de turma criando curso inteiro → 403; aula de outro módulo → 400', async () => {
    const t = await subirF3a();
    try {
      const corpo = { cursoId: 'curso-01', titulo: 'Encontro de teste', inicioEm: new Date(AGORA.getTime() + 2 * DIA).toISOString(), duracaoMin: 120, url: 'https://sala.exemplo.invalid/novo' };
      const geral = await t.api.post('/api/portal/professor/encontros', corpo, { usuario: 'u-prof-t1' });
      assert.equal(geral.status, 403);
      assert.equal(geral.corpo.codigo, 'nao-docente');
      const ok = await t.api.post('/api/portal/professor/encontros', { ...corpo, turmaId: IDS.T1, moduloId: 'c01-m01', aulaGravadaId: 'c01-m01-a02' }, { usuario: 'u-prof-t1' });
      assert.equal(ok.status, 201);
      assert.match(ok.corpo.encontro.id, /^live-[2-9A-HJ-NP-Z]{12}$/);
      assert.equal(ok.corpo.encontro.versao, 1);
      assert.equal(ok.corpo.encontro.turma.codigo, 'APE-2026-01');
      const outro = await t.api.post('/api/portal/professor/encontros', { ...corpo, turmaId: IDS.T1, moduloId: 'c01-m01', aulaGravadaId: 'c01-m02-a01' }, { usuario: 'u-prof-t1' });
      assert.equal(outro.status, 400);
      assert.ok(outro.corpo.campos.aulaGravadaId);
      assert.equal((await t.api.post('/api/portal/professor/encontros', { ...corpo, turmaId: IDS.T2 }, { usuario: 'u-prof-t1' })).status, 403);
      assert.equal((await t.api.post('/api/portal/professor/encontros', { ...corpo, url: 'http://inseguro.invalid' }, { usuario: 'u-prof' })).status, 400);
      assert.equal((await t.api.post('/api/portal/professor/encontros', { ...corpo, titulo: { $ne: 1 } }, { usuario: 'u-prof' })).corpo.codigo, 'formato-invalido');
      assert.equal((await t.api.post('/api/portal/professor/encontros', corpo, { usuario: 'u-aluno1' })).status, 403);
      assert.equal((await t.api.post('/api/portal/professor/encontros', corpo, { usuario: 'u-prof' })).status, 201);
    } finally { await t.fechar(); }
  });

  test('PUT: inexistente 404; curso alheio 404 e nada muda; cursoId diferente 400; turma alheia 403; versão 409', async () => {
    const t = await subirF3a({
      preparar: async (b) => {
        await b.collection('lives').insertOne(live('e-curso2', 600, { cursoId: 'curso-02' }));
        await b.collection('docencias').insertOne({ userId: IDS['u-prof'], cursoId: 'curso-01', turmaId: null });
      }
    });
    try {
      assert.equal((await t.api.put('/api/portal/professor/encontros/nao-existe', { versao: 1, titulo: 'Novo título' }, { usuario: 'u-prof' })).status, 404);
      const alheio = await t.api.put('/api/portal/professor/encontros/e-curso2', { versao: 1, cursoId: 'curso-01', titulo: 'Invasão' }, { usuario: 'u-prof' });
      assert.equal(alheio.status, 404);
      assert.equal((await t.banco.collection('lives').findOne({ _id: 'e-curso2' })).titulo, 'Encontro e-curso2');
      assert.equal((await t.api.put('/api/portal/professor/encontros/e-futuro', { versao: 1, cursoId: 'curso-02' }, { usuario: 'u-prof' })).status, 400);
      assert.equal((await t.api.put('/api/portal/professor/encontros/e-agora-t1', { versao: 1, turmaId: IDS.T2 }, { usuario: 'u-prof-t1' })).status, 403);
      const um = await t.api.get('/api/portal/professor/encontros/e-agora-t1', { usuario: 'u-prof-t1' });
      assert.equal(um.status, 200);
      assert.equal(um.corpo.encontro.aulaGravadaId, 'c01-m01-a01');
      assert.equal(um.corpo.encontro.url, 'https://sala.exemplo.invalid/e-agora-t1');
      assert.equal((await t.api.get('/api/portal/professor/encontros/e-agora-t2', { usuario: 'u-prof-t1' })).status, 404, 'turma alheia');
      const ok = await t.api.put('/api/portal/professor/encontros/e-futuro', { versao: 1, titulo: 'Título revisto' }, { usuario: 'u-prof' });
      assert.equal(ok.status, 200);
      assert.equal(ok.corpo.encontro.titulo, 'Título revisto');
      assert.equal(ok.corpo.encontro.versao, 2);
      const velho = await t.api.put('/api/portal/professor/encontros/e-futuro', { versao: 1, titulo: 'Outro título' }, { usuario: 'u-prof' });
      assert.equal(velho.status, 409);
      assert.equal(velho.corpo.codigo, 'conflito-versao');
    } finally { await t.fechar(); }
  });

  test('DELETE com presença 409 (novo e legado); cancelar auditado; lançar/anular presença auditados', async () => {
    const t = await subirF3a();
    try {
      assert.equal((await t.api.post('/api/portal/encontros/e-agora-t1/entrar', {}, { usuario: 'u-aluno1' })).status, 200);
      const del = await t.api.del('/api/portal/professor/encontros/e-agora-t1', { usuario: 'u-prof' });
      assert.equal(del.status, 409);
      assert.equal(del.corpo.codigo, 'tem-registros');
      const legado = await t.api.del('/api/lives/e-agora-t1', { usuario: 'u-admin' });
      assert.equal(legado.status, 409);
      assert.ok(await t.banco.collection('lives').findOne({ _id: 'e-agora-t1' }));
      assert.equal((await t.api.del('/api/portal/professor/encontros/e-futuro', { usuario: 'u-prof' })).status, 200);

      const canc = await t.api.post('/api/portal/professor/encontros/e-passado/cancelar', { motivo: 'Sala indisponível' }, { usuario: 'u-prof' });
      assert.equal(canc.status, 200);
      assert.equal(canc.corpo.encontro.status, 'cancelada');
      assert.ok(t.banco.documentos('auditoria').some(a => a.acao === 'encontro.cancelado' && a.estado === 'concluido'));

      // presença lançada pelo professor (aluno2 é da T2 → fora dos esperados do encontro da T1)
      const fora = await t.api.post('/api/portal/professor/encontros/e-agora-t1/presencas', { matriculaId: IDS['mat-aluno2'], presente: true, motivo: 'Lançamento de teste' }, { usuario: 'u-prof' });
      assert.equal(fora.status, 404);
      const anular = await t.api.post('/api/portal/professor/encontros/e-agora-t1/presencas', { matriculaId: IDS['mat-aluno1'], presente: false, motivo: 'Entrou e saiu em seguida' }, { usuario: 'u-prof-t1' });
      assert.equal(anular.status, 200);
      assert.equal(anular.corpo.presenca.anulada, true);
      const pres = await t.api.get('/api/portal/professor/encontros/e-agora-t1/presencas', { usuario: 'u-prof-t1' });
      assert.equal(pres.corpo.esperados, 1);
      assert.equal(pres.corpo.presentes, 0);
      const des = await t.api.post('/api/portal/professor/encontros/e-agora-t1/presencas', { matriculaId: IDS['mat-aluno1'], presente: true, motivo: 'Presença confirmada pela sala' }, { usuario: 'u-prof-t1' });
      assert.equal(des.corpo.presenca.anulada, false);
      const lanc = await t.api.post('/api/portal/professor/encontros/e-agora-geral/presencas', { matriculaId: IDS['mat-aluno2'], presente: true, motivo: 'Participou pelo telefone' }, { usuario: 'u-prof' });
      assert.equal(lanc.status, 200);
      const acoes = t.banco.documentos('auditoria').map(a => a.acao);
      for (const a of ['frequencia.anulada', 'frequencia.desanulada', 'frequencia.lancada']) assert.ok(acoes.includes(a), a);
      assert.equal(t.banco.documentos('frequencias').find(f => f.encontroId === 'e-agora-geral').via, 'lancamento_professor');
    } finally { await t.fechar(); }
  });
});

describe('matriz da turma e lives legado', () => {
  test('matriz turmas/:id/frequencia: estados iguais ao Acadêmico; outra turma 403', async () => {
    const t = await subirF3a();
    try {
      await t.api.post('/api/portal/encontros/e-agora-t1/entrar', {}, { usuario: 'u-aluno1' });
      t.avancar(3 * 3600 * 1000); // os encontros de agora terminam; e-agora-geral vira falta
      const m = await t.api.get(`/api/portal/professor/turmas/${IDS.T1}/frequencia`, { usuario: 'u-prof-t1' });
      assert.equal(m.status, 200);
      assert.equal(m.corpo.turma.codigo, 'APE-2026-01');
      const a1 = m.corpo.alunos.find(a => a.matriculaId === IDS['mat-aluno1']);
      const est = Object.fromEntries(a1.celulas.map(c => [c.encontroId, c.estado]));
      assert.equal(est['e-agora-t1'], 'presente');
      assert.equal(est['e-agora-geral'], 'falta');
      assert.equal(est['e-futuro'], 'futuro');
      const linha = m.corpo.encontros.find(e => e.id === 'e-agora-t1');
      assert.deepEqual([linha.presentes, linha.esperados], [1, 1]);
      const acad = await t.api.get(`/api/portal/me/academico/${IDS['mat-aluno1']}`, { usuario: 'u-aluno1' });
      assert.equal(acad.corpo.kpis.frequenciaGeralPct, a1.resumo.frequenciaPct, 'mesma conta no Acadêmico e na matriz');
      assert.equal((await t.api.get(`/api/portal/professor/turmas/${IDS.T2}/frequencia`, { usuario: 'u-prof-t1' })).status, 403);
    } finally { await t.fechar(); }
  });

  test('GET /api/lives legado: sem turmaId nada muda; com turmaId só a turma do aluno; PUT legado não apaga campos novos', async () => {
    const t = await subirF3a();
    try {
      const r1 = await t.api.get('/api/lives', { usuario: 'u-aluno1' });
      const ids1 = r1.corpo.itens.map(i => i.id);
      for (const id of ['e-agora-geral', 'e-agora-t1', 'e-futuro', 'e-passado']) assert.ok(ids1.includes(id), id);
      assert.ok(!ids1.includes('e-agora-t2'));
      assert.equal(r1.corpo.itens.find(i => i.id === 'e-agora-geral').url, 'https://sala.exemplo.invalid/e-agora-geral');
      assert.equal(r1.corpo.itens.find(i => i.id === 'e-futuro').url, '');
      const prof = await t.api.get('/api/lives', { usuario: 'u-prof' });
      assert.ok(prof.corpo.itens.length >= 6, 'docente vê os do curso');
      const put = await t.api.put('/api/lives/e-agora-t1', { cursoId: 'curso-01', titulo: 'Editado no legado', inicioEm: AGORA.toISOString() }, { usuario: 'u-admin' });
      assert.equal(put.status, 200);
      const doc = await t.banco.collection('lives').findOne({ _id: 'e-agora-t1' });
      assert.equal(doc.titulo, 'Editado no legado');
      assert.equal(String(doc.turmaId), IDS.T1);
      assert.equal(doc.aulaGravadaId, 'c01-m01-a01');
      assert.equal((await t.api.put('/api/lives/x', {}, { usuario: 'u-aluno1' })).status, 403);
    } finally { await t.fechar(); }
  });
});

describe('grupo aoConcluirAula (frequência gravada pela conclusão da aula, F1 dispara)', () => {
  test('registra a gravada da matrícula ativa, idempotente; aula de outro curso ignorada', async () => {
    const t = await subirF3a();
    try {
      const ouvinte = t.servicos.todos('aoConcluirAula')[0];
      const ctx = { userId: IDS['u-aluno1'], cursoId: 'curso-01', moduloId: 'c01-m01', aulaId: 'c01-m01-a02', via: 'conclusao_auto', pctVideo: 93.4, em: new Date(AGORA) };
      await ouvinte(ctx);
      await ouvinte(ctx);
      const f = t.banco.documentos('frequencias');
      assert.equal(f.length, 1);
      assert.deepEqual([f[0].origem, f[0].via, f[0].aulaId, f[0].pctVideo], ['gravado', 'conclusao_auto', 'c01-m01-a02', 93.4]);
      await ouvinte({ ...ctx, cursoId: 'curso-02', aulaId: 'c02-m01-a01' });
      assert.equal(t.banco.documentos('frequencias').length, 1, 'sem matrícula no curso-02');
    } finally { await t.fechar(); }
  });
});

