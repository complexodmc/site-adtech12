// Portal · F3b — regras do curso, IES, tipo do módulo e códigos de aula (routes/portal-cursos.js).
// PORTAL-API §6.7.1, §8.12, §9.3 (linha academico-cursos) · D-54.
// Montado pelo AGREGADOR real (montarPortal com só este módulo) sobre o banco em memória.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, MATERIAL_TESTE } from './apoio/fixtures-portal.js';
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
const { INDICES_CERTIFICACAO, planejarCodigos, horasLocais } = await import('../src/portal/certificacao/declaracoes.js');

const CFG = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: MATERIAL_TESTE });
const MODULO = { caminho: 'routes/portal-cursos.js', fatia: 'F3b', importar: () => import('../src/routes/portal-cursos.js') };
const CNPJ_A = '11.222.333/0001-81';
const CNPJ_B = '11444777000161';

let banco; let server; let api; let servicos;

async function subirPortal({ extras = {} } = {}) {
  servicos = criarServicos();
  for (const [nome, impl] of Object.entries(extras)) servicos.registrar(nome, impl);
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: MATERIAL_TESTE, exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: [MODULO], configPortal: CFG, falharCedo: true, log: silencioso
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  ({ server } = await subir(app));
  api = cliente(`http://127.0.0.1:${server.address().port}`);
}

const ADM = { usuario: 'u-admin' };
const URL = '/api/portal/admin/cursos/curso-01/academico';

describe('regras do curso e códigos de aula (F3b)', () => {
  beforeEach(async () => {
    banco = criarBancoMemoria({ indices: [...especificacoesRegistradas(), ...INDICES_CERTIFICACAO] });
    await semear(banco);
    await subirPortal();
  });
  afterEach(async () => { await fechar(server); server = null; });

  test('401 sem sessão; 403 aluno e professor; 404 curso inexistente ou id inválido', async () => {
    assert.equal((await api.get(URL)).status, 401);
    assert.equal((await api.get(URL, { usuario: 'u-aluno1' })).status, 403);
    assert.equal((await api.get(URL, { usuario: 'u-prof' })).status, 403);
    assert.equal((await api.get('/api/portal/admin/cursos/nao-existe/academico', ADM)).status, 404);
    assert.equal((await api.get('/api/portal/admin/cursos/x%24y/academico', ADM)).status, 404);
  });

  test('GET: formato com padrões (nota 7), módulos com aulas sem código, no-store e X-Request-Id', async () => {
    const r = await api.get(URL, ADM);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match(r.headers.get('x-request-id'), /^r-/);
    assert.equal(r.corpo.sigla, 'APE');
    assert.equal(r.corpo.nivel, null);
    assert.equal(r.corpo.nivelRotulo, null);
    assert.deepEqual(r.corpo.criterios, { notaMinima: 7, frequenciaMinima: null, cargaMinimaHoras: null, exigeTcc: false, frequenciaGravadaExigeVideo: false });
    assert.equal(r.corpo.versao, 0);
    assert.equal(r.corpo.cargaHorariaHoras, 12);
    assert.deepEqual(r.corpo.modulos.map(m => [m.id, m.tipo, m.aulasSemCodigo, m.chHoras]), [['c01-m01', 'regular', 3, 1], ['c01-m02', 'regular', 3, 1]]);
    assert.deepEqual(r.corpo.avisos, []);
    const lista = await api.get('/api/portal/admin/cursos/academico', ADM);
    assert.deepEqual(lista.corpo.itens.map(i => i.cursoId), ['curso-01', 'curso-02']);
  });

  test('PUT: versão, sigla em uso, formato inválido, motivo da nota mínima e auditoria', async () => {
    assert.equal((await api.put(URL, { versao: 3, sigla: 'NOV' }, ADM)).status, 409);
    const dup = await api.put('/api/portal/admin/cursos/curso-02/academico', { versao: 0, sigla: 'ape' }, ADM);
    assert.equal(dup.status, 409);
    assert.equal(dup.corpo.codigo, 'sigla-em-uso');
    const fmt = await api.put(URL, { versao: 0, sigla: { $gt: '' } }, ADM);
    assert.equal(fmt.status, 400);
    assert.equal(fmt.corpo.codigo, 'formato-invalido');
    const crit = await api.put(URL, { versao: 0, criterios: 'x' }, ADM);
    assert.equal(crit.corpo.codigo, 'formato-invalido');
    const semMotivo = await api.put(URL, { versao: 0, criterios: { notaMinima: 6 } }, ADM);
    assert.equal(semMotivo.status, 400);
    assert.ok(semMotivo.corpo.campos.motivo);
    const ok = await api.put(URL, { versao: 0, criterios: { notaMinima: 6, frequenciaMinima: 75 }, motivo: 'Ajuste pedido pela coordenação pedagógica.' }, ADM);
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.versao, 1);
    assert.equal(ok.corpo.criterios.notaMinima, 6);
    assert.equal(ok.corpo.criterios.frequenciaMinima, 75);
    const aud = await banco.collection('auditoria').findOne({ acao: 'curso.regras_alteradas' });
    assert.equal(aud.estado, 'concluido');
    assert.equal(aud.motivo, 'Ajuste pedido pela coordenação pedagógica.');
    assert.deepEqual(aud.mudancas.map(m => m.campo).sort(), ['frequenciaMinima', 'notaMinima']);
    // a mesma versão de novo → conflito
    assert.equal((await api.put(URL, { versao: 0, sigla: 'NOV' }, ADM)).corpo.codigo, 'conflito-versao');
  });

  test('auditoria que falha → 503 e nada muda', async () => {
    banco.falhar.insertOne = (col) => col === 'auditoria';
    const r = await api.put(URL, { versao: 0, nivel: 'extensao' }, ADM);
    assert.equal(r.status, 503);
    assert.equal(r.corpo.codigo, 'auditoria-indisponivel');
    banco.falhar.insertOne = null;
    assert.equal((await banco.collection('cursos').findOne({ _id: 'curso-01' })).nivel, undefined);
  });

  test('lato sensu exige IES ativa; IES: CNPJ inválido, duplicado, versão e desativação com curso usando', async () => {
    const semIes = await api.put(URL, { versao: 0, nivel: 'pos_graduacao_lato_sensu' }, ADM);
    assert.equal(semIes.status, 400);
    assert.equal(semIes.corpo.codigo, 'nivel-exige-ies');
    assert.equal((await api.post('/api/portal/admin/ies', { nome: 'Instituição Teste', cnpj: '11.222.333/0001-82' }, ADM)).status, 400);
    assert.equal((await api.post('/api/portal/admin/ies', { nome: 'Instituição Teste', cnpj: CNPJ_A, site: 'http://inseguro.invalid' }, ADM)).status, 400);
    const c = await api.post('/api/portal/admin/ies', { nome: 'Instituição Teste', sigla: 'IT', cnpj: CNPJ_A, atoCredenciamento: 'Portaria de teste', site: 'https://ies.exemplo.invalid' }, ADM);
    assert.equal(c.status, 201);
    assert.equal(c.corpo.ies.cnpj, '11222333000181');
    const d = await api.post('/api/portal/admin/ies', { nome: 'Outra', cnpj: '11222333000181' }, ADM);
    assert.equal(d.status, 409);
    assert.equal(d.corpo.codigo, 'codigo-em-uso');
    assert.equal((await api.post('/api/portal/admin/ies', { nome: 'Outra', cnpj: CNPJ_B }, { usuario: 'u-prof' })).status, 403);

    const ies = c.corpo.ies;
    const lato = await api.put(URL, { versao: 0, nivel: 'pos_graduacao_lato_sensu', iesId: ies.id }, ADM);
    assert.equal(lato.status, 200);
    assert.equal(lato.corpo.nivelRotulo, 'Pós-graduação lato sensu');
    assert.equal(lato.corpo.ies.nome, 'Instituição Teste');
    assert.ok(lato.corpo.avisos.some(a => a.includes('360 h')));

    assert.equal((await api.put(`/api/portal/admin/ies/${ies.id}`, { versao: 9, ativa: false }, ADM)).corpo.codigo, 'conflito-versao');
    const des = await api.put(`/api/portal/admin/ies/${ies.id}`, { versao: 1, ativa: false }, ADM);
    assert.equal(des.status, 409);
    assert.equal(des.corpo.codigo, 'tem-registros');
    const ren = await api.put(`/api/portal/admin/ies/${ies.id}`, { versao: 1, nome: 'Instituição Teste Renomeada' }, ADM);
    assert.equal(ren.status, 200);
    assert.equal(ren.corpo.ies.versao, 2);
    assert.equal((await api.put('/api/portal/admin/ies/nao-e-id', { versao: 1 }, ADM)).status, 404);
    const lista = await api.get('/api/portal/admin/ies', ADM);
    assert.equal(lista.corpo.itens.length, 1);
  });

  test('códigos: gera os ausentes, estáveis, colisão → próximo A##; curso sem sigla → 409', async () => {
    await banco.collection('aulas').updateOne({ _id: 'c01-m01-a03' }, { $set: { codigo: 'APE-M01-A01' } });
    const r = await api.post('/api/portal/admin/cursos/curso-01/codigos', {}, ADM);
    assert.equal(r.status, 200);
    assert.equal(r.corpo.gerados, 5);
    assert.equal(r.corpo.mantidos, 1);
    const cod = Object.fromEntries(r.corpo.itens.map(i => [i.aulaId, i.codigo]));
    assert.deepEqual(cod, {
      'c01-m01-a01': 'APE-M01-A02', 'c01-m01-a02': 'APE-M01-A03', 'c01-m01-a03': 'APE-M01-A01',
      'c01-m02-a01': 'APE-M02-A01', 'c01-m02-a02': 'APE-M02-A02', 'c01-m02-a03': 'APE-M02-A03'
    });
    const de2 = await api.post('/api/portal/admin/cursos/curso-01/codigos', {}, ADM);
    assert.equal(de2.corpo.gerados, 0);
    assert.equal(de2.corpo.mantidos, 6);
    // reordenar não muda o código (estável)
    await banco.collection('aulas').updateOne({ _id: 'c01-m02-a01' }, { $set: { ordem: 9 } });
    await api.post('/api/portal/admin/cursos/curso-01/codigos', {}, ADM);
    assert.equal((await banco.collection('aulas').findOne({ _id: 'c01-m02-a01' })).codigo, 'APE-M02-A01');
    const semSigla = await api.post('/api/portal/admin/cursos/curso-02/codigos', {}, ADM);
    assert.equal(semSigla.status, 409);
  });

  test('códigos com refazer: sem motivo → 400 e nada muda; com motivo → recalcula e audita (executar); auditoria fora → 503', async () => {
    await api.post('/api/portal/admin/cursos/curso-01/codigos', {}, ADM);
    await banco.collection('aulas').updateOne({ _id: 'c01-m02-a01' }, { $set: { ordem: 9 } });
    const sem = await api.post('/api/portal/admin/cursos/curso-01/codigos', { refazer: true }, ADM);
    assert.equal(sem.status, 400);
    assert.ok(sem.corpo.campos.motivo);
    assert.equal((await banco.collection('aulas').findOne({ _id: 'c01-m02-a01' })).codigo, 'APE-M02-A01');

    banco.falhar.insertOne = (col) => col === 'auditoria';
    const fora = await api.post('/api/portal/admin/cursos/curso-01/codigos', { refazer: true, motivo: 'Reorganização da trilha do curso.' }, ADM);
    assert.equal(fora.status, 503);
    banco.falhar.insertOne = null;
    assert.equal((await banco.collection('aulas').findOne({ _id: 'c01-m02-a01' })).codigo, 'APE-M02-A01');

    const ok = await api.post('/api/portal/admin/cursos/curso-01/codigos', { refazer: true, motivo: 'Reorganização da trilha do curso.' }, ADM);
    assert.equal(ok.status, 200);
    assert.equal((await banco.collection('aulas').findOne({ _id: 'c01-m02-a01' })).codigo, 'APE-M02-A03');
    assert.equal((await banco.collection('aulas').findOne({ _id: 'c01-m02-a02' })).codigo, 'APE-M02-A01');
    const aud = await banco.collection('auditoria').findOne({ acao: 'aula.codigos_gerados', motivo: 'Reorganização da trilha do curso.' });
    assert.equal(aud.estado, 'concluido');
  });

  test('sigla nova preenche os códigos ausentes', async () => {
    const r = await api.put('/api/portal/admin/cursos/curso-02/academico', { versao: 0, sigla: 'csl' }, ADM);
    assert.equal(r.status, 200);
    assert.equal(r.corpo.sigla, 'CSL');
    assert.equal((await banco.collection('aulas').findOne({ _id: 'c02-m01-a02' })).codigo, 'CSL-M01-A02');
    assert.deepEqual(r.corpo.modulos.map(m => m.aulasSemCodigo), [0]);
  });

  test('tipo do módulo: 2º TCC → 409; TCC → regular com questão de arquivo → 409 tem-registros; mudança auditada; avisos do TCC', async () => {
    const m1 = await api.put('/api/portal/admin/modulos/c01-m01/academico', { tipo: 'tcc', chHoras: 2.5 }, ADM);
    assert.equal(m1.status, 200);
    assert.deepEqual(m1.corpo.modulo, { id: 'c01-m01', cursoId: 'curso-01', numero: '01', titulo: 'Módulo 1', chHoras: 2.5, tipo: 'tcc' });
    assert.ok(await banco.collection('auditoria').findOne({ acao: 'modulo.tipo_alterado' }));
    const m2 = await api.put('/api/portal/admin/modulos/c01-m02/academico', { tipo: 'tcc' }, ADM);
    assert.equal(m2.status, 409);
    await banco.collection('questoes').insertOne({ moduloId: 'c01-m01', tipo: 'arquivo' });
    const volta = await api.put('/api/portal/admin/modulos/c01-m01/academico', { tipo: 'regular' }, ADM);
    assert.equal(volta.status, 409);
    assert.equal(volta.corpo.codigo, 'tem-registros');
    assert.equal((await api.put('/api/portal/admin/modulos/nao-existe/academico', { tipo: 'tcc' }, ADM)).status, 404);
    assert.equal((await api.put('/api/portal/admin/modulos/c01-m02/academico', { tipo: 'outro' }, ADM)).status, 400);

    const exige = await api.put(URL, { versao: 0, criterios: { exigeTcc: true } }, ADM);
    assert.ok(exige.corpo.avisos.some(a => a.includes('Não foi possível conferir')), 'sem F2: aviso honesto');
    await fechar(server);
    await subirPortal({ extras: { 'avaliacoes.resumoDoModulo': async () => [] } });
    const comF2 = await api.get(URL, ADM);
    assert.ok(comF2.corpo.avisos.some(a => a.startsWith('TCC exigido sem avaliação publicada')));
  });
});

describe('funções puras (F3b)', () => {
  test('horasDe local (API §8.3)', () => {
    assert.equal(horasLocais('42 horas'), 42);
    assert.equal(horasLocais('360h'), 360);
    assert.equal(horasLocais('3h 50min'), 3.8);
    assert.equal(horasLocais('90min'), 1.5);
    assert.equal(horasLocais(''), null);
    assert.equal(horasLocais('—'), null);
    assert.equal(horasLocais('abc'), null);
  });
  test('planejarCodigos respeita códigos de outros cursos (ocupados) e limite de 99', () => {
    const p = planejarCodigos('ABC', [{ id: 'm', ordem: 1 }], [{ id: 'a', moduloId: 'm', ordem: 1 }], { ocupados: new Set(['ABC-M01-A01']) });
    assert.deepEqual(p.itens, [{ aulaId: 'a', codigo: 'ABC-M01-A02' }]);
    assert.throws(() => planejarCodigos('1X', [], []));
  });
});
