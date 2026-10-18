// Portal · F0m — agregador (montar.js), exigirTrocaDeSenha, exigirSegundoFatorAdmin
// e a ligação com erros.js. Casos da PORTAL-API §9.3 (linha portal-base-montagem),
// DC-67, DC-74 (routers STUB no lugar do legado: nenhum Mongo) e DC-75 (com
// QA_FATIA, a varredura de módulos reais importa só os da fatia).
// Rode com `npm test` na raiz.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso, criarLogEspiao, fetchFalso, servicosFalsos } from './apoio/falsos.js';

// montar.js importa config.js (exige as variáveis abaixo), db.js e auth.js (nenhuma conexão é aberta).
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const M = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos, montarPainel } = await import('../src/portal/servicos.js');
const { lerConfigPortal, avisosDeConfiguracao } = await import('../src/portal/config-portal.js');
const E = await import('../src/portal/erros.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTE_MONTAR = fs.readFileSync(path.resolve(__dirname, '../src/portal/montar.js'), 'utf8');
const CFG_TESTE = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });

// ---------- módulos sintéticos ----------
const modulo = (caminho, montar) => ({ caminho, fatia: 'TESTE', importar: async () => ({ default: montar }) });
const moduloAusente = () => ({ caminho: 'routes/portal/nao-existe-de-teste.js', fatia: 'TESTE', importar: () => import('../src/routes/portal/nao-existe-de-teste.js') });
const moduloQueNaoImporta = () => ({
  caminho: 'routes/teste/sintaxe.js', fatia: 'TESTE',
  importar: async () => { throw new SyntaxError("Unexpected token '}' (erro de sintaxe simulado)"); }
});

function moduloSaudavel(espiao = null) {
  return modulo('routes/teste/ok.js', async (ctx) => {
    if (espiao) espiao.n++;
    const ok = (_req, res) => res.json({ ok: true });
    ctx.rotas.publico.get('/teste/publica', ok);
    ctx.rotas.auth.get('/recursos', (_req, res) => res.json({ recursos: true }));
    ctx.rotas.auth.post('/senha/trocar', ok);
    ctx.rotas.aluno.get('/teste/aluno', ok);
    ctx.rotas.aluno.get('/me/teste', ok);
    ctx.rotas.aluno.get('/teste/erro500', (_req, _res, next) => next(new Error('falhou para ana.silva@exemplo.invalid com CPF 529.982.247-25')));
    ctx.rotas.aluno.get('/teste/indisponivel', (_req, _res, next) => {
      try { ctx.servicos.obter('servico.quenaoexiste'); } catch (err) { next(err); }
    });
    ctx.rotas.professor.get('/teste/prof', ok);
    ctx.rotas.admin.get('/teste/admin', ok);
    ctx.servicos.registrar('teste.ok', () => 'ok');
    ctx.servicos.registrar('teste.compartilhado', () => 'primeiro');
    ctx.servicos.adicionar('busca', { tipo: 'cursos', papeis: ['aluno'], buscar: async () => ({ itens: [], temMais: false }) });
    if (espiao) espiao.ctx = ctx;
  });
}

const moduloQuebraNoMontar = () => modulo('routes/teste/quebra.js', async (ctx) => {
  ctx.rotas.aluno.get('/teste/quebra', (_req, res) => res.json({ ok: true }));
  ctx.rotas.publico.get('/teste/quebra-publica', (_req, res) => res.json({ ok: true }));
  ctx.servicos.registrar('teste.quebra', () => 'nao-deveria-existir');
  ctx.servicos.adicionar('validador', { prefixo: 'QBR', validar: async () => null, nomeTitular: async () => null });
  throw new Error('montar falhou de propósito');
});

const moduloDuplicado = () => modulo('routes/teste/duplicado.js', async (ctx) => {
  ctx.rotas.aluno.get('/teste/duplicado', (_req, res) => res.json({ ok: true }));
  ctx.servicos.registrar('teste.compartilhado', () => 'segundo');
});

// ---------- app no formato do server.js ----------
/**
 * express.json → usuário de teste (papel do loadUser) → AGREGADOR → routers STUB do legado
 * (montados DEPOIS, como no server.js; DC-74) → 404 JSON → tratamento global.
 */
async function subirPortal({
  modulos = [], falharCedo = false, configPortal = CFG_TESTE, servicos = criarServicos(), log = silencioso,
  logGlobal = silencioso, banco = null, fetchImpl
} = {}) {
  const b = banco || criarBancoMemoria({ indices: especificacoesRegistradas() });
  if (!banco) await semear(b);
  const portal = M.montarPortal({
    getDb: () => b, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos, configPortal, falharCedo, log, ...(fetchImpl ? { fetchImpl } : {})
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco: b }));
  app.use('/api', portal);
  // STUBS do legado (fase 0: os routers reais ainda exigem Mongo — DC-74).
  app.get('/api/catalogo', (_req, res) => res.json({ cursos: [] }));
  app.post('/api/auth/signin', (_req, res) => res.json({ token: 'stub', user: {} }));
  app.get('/api/legado/servico/:nome', (req, res) => res.json({ existe: servicos.tentar(req.params.nome) !== null }));
  app.get('/api/certificados/validar/:codigo', (_req, res) => res.json({ valido: false }));
  app.get('/api/capas/:arquivo', (_req, res) => res.json({ capa: true }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(E.criarTratarErroGlobal({ log: logGlobal }));
  const { server, base } = await subir(app);
  return { api: cliente(base), server, banco: b, portal, servicos };
}

const reqDe = (banco, nome) => banco.collection('users').findOne({ _id: oid(nome) }).then(user => ({ user }));

// =============================================================
describe('rotas e papéis (agregador saudável)', () => {
  let ctx;
  before(async () => { ctx = await subirPortal({ modulos: [moduloSaudavel()] }); });
  after(() => fechar(ctx.server));

  test('público responde sem token; no-store e X-Request-Id', async () => {
    const r = await ctx.api.get('/api/portal/saude');
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { ok: true, modulos: { esperados: 1, carregados: 1, comFalha: 0 } });
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match(r.headers.get('x-request-id'), /^r-[a-f0-9]{12}$/);
    const p = await ctx.api.get('/api/portal/teste/publica');
    assert.equal(p.status, 200);
  });

  test('/portal/* sem token → 401 (rota existente ou não)', async () => {
    for (const c of ['/api/portal/teste/aluno', '/api/portal/qualquer/coisa', '/api/portal/admin/teste/admin']) {
      const r = await ctx.api.get(c);
      assert.equal(r.status, 401, c);
      assert.equal(r.corpo.error, 'Sessão expirada. Faça login novamente.');
    }
  });

  test('aluno em /portal/professor/* → 403 papel-insuficiente (com requestId); professor e admin passam', async () => {
    const r = await ctx.api.get('/api/portal/professor/teste/prof', { usuario: 'u-aluno1' });
    assert.equal(r.status, 403);
    assert.equal(r.corpo.codigo, 'papel-insuficiente');
    assert.equal(r.corpo.requestId, r.headers.get('x-request-id'));
    assert.equal((await ctx.api.get('/api/portal/professor/teste/prof', { usuario: 'u-prof' })).status, 200);
    assert.equal((await ctx.api.get('/api/portal/professor/teste/prof', { usuario: 'u-admin' })).status, 200);
    assert.equal((await ctx.api.get('/api/portal/professor/teste/prof', { usuario: 'u-ex' })).status, 403, 'professor rebaixado');
  });

  test('professor em /portal/admin/* → 403; admin → 200', async () => {
    assert.equal((await ctx.api.get('/api/portal/admin/teste/admin', { usuario: 'u-prof' })).status, 403);
    assert.equal((await ctx.api.get('/api/portal/admin/teste/admin', { usuario: 'u-aluno1' })).status, 403);
    assert.equal((await ctx.api.get('/api/portal/admin/teste/admin', { usuario: 'u-admin' })).status, 200);
  });

  test('rotas novas de /auth passam pelo agregador com no-store', async () => {
    const r = await ctx.api.get('/api/auth/recursos');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  test('no-store e X-Request-Id em toda resposta de /portal (inclusive 404 e 403); legado ganha só o X-Request-Id', async () => {
    const r404 = await ctx.api.get('/api/portal/nao-existe', { usuario: 'u-aluno1' });
    assert.equal(r404.status, 404);
    assert.equal(r404.headers.get('cache-control'), 'no-store');
    assert.ok(r404.headers.get('x-request-id'));
    const leg = await ctx.api.get('/api/catalogo', { usuario: 'u-aluno1' });
    assert.equal(leg.status, 200);
    assert.ok(leg.headers.get('x-request-id'));
    assert.notEqual(leg.headers.get('cache-control'), 'no-store', 'o legado não ganha no-store');
  });

  test('serviço ausente → 503 servico-indisponivel com requestId', async () => {
    const r = await ctx.api.get('/api/portal/teste/indisponivel', { usuario: 'u-aluno1' });
    assert.equal(r.status, 503);
    assert.equal(r.corpo.codigo, 'servico-indisponivel');
    assert.ok(r.corpo.requestId);
  });

  test('serviços de nome fixo do núcleo registrados; rota legada (stub) enxerga serviço registrado por módulo', async () => {
    const esperados = ['acesso', 'equipe.cursosDoProfessor', 'equipe.docencias', 'equipe.professoresDoCurso', 'perfis.publicos',
      'perfis.identificacao', 'auditoria', 'notificacoes', 'arquivos', 'email', 'cifra', 'assinador', 'contador'];
    for (const nome of esperados) assert.notEqual(ctx.servicos.tentar(nome), null, nome);
    assert.equal((await ctx.api.get('/api/legado/servico/teste.ok')).corpo.existe, true);
    assert.equal((await ctx.api.get('/api/legado/servico/acesso')).corpo.existe, true);
    assert.equal(ctx.servicos.todos('painel').filter(d => d.bloco === 'sistema').length, 1);
  });

  test('ctx.comum traz o contrato da API §5.1', async () => {
    const espiao = { n: 0 };
    const c = await subirPortal({ modulos: [moduloSaudavel(espiao)] });
    try {
      await c.api.get('/api/portal/saude');
      const chaves = ['repo', 'acesso', 'auditoria', 'notificacoes', 'arquivos', 'email', 'cifra', 'assinador', 'contador', 'throttle',
        'csv', 'configPortal', 'jwtSecret', 'hashSenha', 'checkSenha', 'signToken', 'publicUser', 'capaUrl', 'agora', 'log'];
      for (const k of chaves) assert.ok(espiao.ctx.comum[k] !== undefined && espiao.ctx.comum[k] !== null, k);
      assert.equal(espiao.ctx.comum.jwtSecret, 'segredo-de-teste');
      assert.equal(typeof espiao.ctx.comum.csv.gerarCsv, 'function');
      assert.equal(espiao.ctx.caminho, 'routes/teste/ok.js');
      assert.equal(espiao.n, 1);
    } finally { await fechar(c.server); }
  });
});

test('falso do núcleo registrado ANTES (teste de fatia) prevalece: o agregador não sobrescreve e ctx.comum usa o falso', async () => {
  const servicos = criarServicos();
  const acessoFalso = { podeVerCurso: async () => true, falso: true };
  servicosFalsos({ acesso: acessoFalso, 'secretaria.matriculaVigente': async () => null }, { em: servicos });
  const espiao = { n: 0 };
  const c = await subirPortal({ modulos: [moduloSaudavel(espiao)], servicos });
  try {
    await c.api.get('/api/portal/saude');
    assert.equal(servicos.obter('acesso'), acessoFalso);
    assert.equal(espiao.ctx.comum.acesso, acessoFalso);
    assert.notEqual(servicos.tentar('auditoria'), null, 'os demais do núcleo continuam registrados');
  } finally { await fechar(c.server); }
});

// =============================================================
describe('isolamento por módulo (falharCedo:false) — DC-67, DC-74', () => {
  let ctx;
  const espiaoLog = criarLogEspiao();
  before(async () => {
    ctx = await subirPortal({
      modulos: [moduloSaudavel(), moduloAusente(), moduloQueNaoImporta(), moduloQuebraNoMontar(), moduloDuplicado()],
      log: espiaoLog
    });
  });
  after(() => fechar(ctx.server));

  test('/portal/saude: carregados < esperados e comFalha (ausente não conta como falha)', async () => {
    const r = await ctx.api.get('/api/portal/saude');
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { ok: false, modulos: { esperados: 5, carregados: 1, comFalha: 3 } });
    const estado = ctx.portal.estadoDoPortal();
    assert.deepEqual(estado.ausentes, ['routes/portal/nao-existe-de-teste.js']);
    assert.deepEqual(estado.falhas.map(f => [f.caminho, f.etapa]), [
      ['routes/teste/sintaxe.js', 'importacao'],
      ['routes/teste/quebra.js', 'montagem'],
      ['routes/teste/duplicado.js', 'servico-duplicado']
    ]);
  });

  test('módulo que lança DEPOIS de registrar rota, serviço e grupo fica de fora INTEIRO', async () => {
    assert.equal((await ctx.api.get('/api/portal/teste/quebra', { usuario: 'u-aluno1' })).status, 404);
    assert.equal((await ctx.api.get('/api/portal/teste/quebra-publica')).status, 401, 'rota pública dele também não existe');
    assert.equal(ctx.servicos.tentar('teste.quebra'), null);
    assert.equal(ctx.servicos.todos('validador').length, 0);
  });

  test('nome de serviço repetido isola o segundo módulo inteiro (rota dele não existe; o primeiro fica)', async () => {
    assert.equal((await ctx.api.get('/api/portal/teste/duplicado', { usuario: 'u-aluno1' })).status, 404);
    assert.equal(ctx.servicos.obter('teste.compartilhado')(), 'primeiro');
  });

  test('o saudável funciona e as rotas legadas (stubs) continuam respondendo — catálogo, signin e serviço', async () => {
    assert.equal((await ctx.api.get('/api/portal/teste/aluno', { usuario: 'u-aluno1' })).status, 200);
    assert.equal((await ctx.api.get('/api/catalogo', { usuario: 'u-aluno1' })).status, 200);
    const s = await ctx.api.post('/api/auth/signin', { email: 'x@exemplo.invalid', senha: 'y' });
    assert.equal(s.status, 200);
    assert.equal(s.corpo.token, 'stub');
    assert.equal((await ctx.api.get('/api/legado/servico/teste.ok')).corpo.existe, true);
    assert.equal((await ctx.api.get('/api/legado/servico/teste.quebra')).corpo.existe, false);
  });

  test('bloco sistema do painel: modulosAusentes, modulosComFalha com etapa e erro resumido', async () => {
    const painel = await montarPainel(ctx.servicos, await reqDe(ctx.banco, 'u-admin'), { cursoIds: null }, { log: silencioso });
    assert.deepEqual(painel.sistema.modulosAusentes, ['routes/portal/nao-existe-de-teste.js']);
    assert.deepEqual(painel.sistema.modulosComFalha.map(f => f.etapa), ['importacao', 'montagem', 'servico-duplicado']);
    assert.ok(painel.sistema.modulosComFalha.every(f => typeof f.erro === 'string' && f.erro.length <= 300));
    assert.equal(painel.sistema.instituicaoPendente, null, 'contribuição da F6a ausente → null');
    assert.deepEqual(painel.sistema.avisosConfiguracao, avisosDeConfiguracao(CFG_TESTE));
    assert.equal(painel.financeiro, null, 'bloco sem contribuição → null');
    const aluno = await montarPainel(ctx.servicos, await reqDe(ctx.banco, 'u-aluno1'), { cursoIds: null }, { log: silencioso });
    assert.equal(aluno.sistema, null, 'bloco sistema é só da coordenação');
  });

  test('log: ausente como aviso (não estrito); falhas como erro, em JSON com o resumo', () => {
    const avisos = espiaoLog.linhas.filter(l => l.nivel === 'warn' && /portal\.modulo/.test(l.texto));
    const erros = espiaoLog.linhas.filter(l => l.nivel === 'error' && /portal\.modulo/.test(l.texto));
    assert.equal(avisos.length, 1);
    assert.match(avisos[0].texto, /"etapa":"ausente"/);
    assert.equal(erros.length, 3);
    for (const l of erros) assert.doesNotThrow(() => JSON.parse(l.texto));
  });

  test('estrito: módulo ausente vai ao log como erro (a API continua de pé)', async () => {
    const espiao = criarLogEspiao();
    const c = await subirPortal({ modulos: [moduloAusente()], configPortal: lerConfigPortal({ NODE_ENV: 'test', VERCEL: '1', JWT_SECRET: 'x' }), log: espiao });
    try {
      assert.equal((await c.api.get('/api/portal/saude')).status, 200);
      assert.equal(espiao.linhas.filter(l => l.nivel === 'error' && /"etapa":"ausente"/.test(l.texto)).length, 1);
    } finally { await fechar(c.server); }
  });
});

// =============================================================
describe('falharCedo:true (só em teste)', () => {
  test('a mesma falha derruba o agregador (500), inclusive para quem passa por ele', async () => {
    const c = await subirPortal({ modulos: [moduloSaudavel(), moduloQuebraNoMontar()], falharCedo: true });
    try {
      const r = await c.api.get('/api/portal/saude');
      assert.equal(r.status, 500);
      assert.equal((await c.api.get('/api/catalogo', { usuario: 'u-aluno1' })).status, 500);
    } finally { await fechar(c.server); }
  });

  test('módulo ausente NÃO derruba nem com falharCedo (fase 0/1: arquivos de outras fatias ainda não existem)', async () => {
    const c = await subirPortal({ modulos: [moduloAusente(), moduloSaudavel()], falharCedo: true });
    try {
      assert.equal((await c.api.get('/api/portal/saude')).status, 200);
    } finally { await fechar(c.server); }
  });

  test('padrão vem da config: NODE_ENV=test liga falharCedo', () => {
    assert.equal(lerConfigPortal({ NODE_ENV: 'test' }).falharCedo, true);
    assert.equal(lerConfigPortal({ NODE_ENV: 'production' }).falharCedo, false);
    assert.equal(lerConfigPortal({}).falharCedo, false);
  });
});

// =============================================================
describe('carga única e índices', () => {
  test('falha de rede no garantir() e depois sucesso → montar de cada módulo UMA vez, sem registrar duplicado', async () => {
    const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
    await semear(banco);
    banco.falhar.createIndex = 1;
    const espiao = { n: 0 };
    const c = await subirPortal({ modulos: [moduloSaudavel(espiao)], banco });
    try {
      const r1 = await c.api.get('/api/portal/saude');
      assert.equal(r1.status, 503);
      assert.equal(r1.corpo.codigo, 'servico-indisponivel');
      const r2 = await c.api.get('/api/portal/saude');
      assert.equal(r2.status, 200);
      assert.equal(r2.corpo.modulos.carregados, 1);
      await c.api.get('/api/portal/teste/aluno', { usuario: 'u-aluno1' });
      assert.equal(espiao.n, 1, 'montar(ctx) uma vez por processo');
      assert.deepEqual(c.portal.estadoDoPortal().falhas, []);
    } finally { await fechar(c.server); }
  });

  test('rota legada responde 200 com o garantir() pendurado; /portal/* espera os índices', async () => {
    const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
    await semear(banco);
    let soltar;
    banco.portoes.createIndex = new Promise(r => { soltar = r; });
    const c = await subirPortal({ modulos: [moduloSaudavel()], banco });
    try {
      const leg = await c.api.get('/api/catalogo', { usuario: 'u-aluno1' });
      assert.equal(leg.status, 200);
      let pronto = false;
      const p = c.api.get('/api/portal/saude').then(r => { pronto = true; return r; });
      await new Promise(r => setTimeout(r, 120));
      assert.equal(pronto, false, '/portal/* espera os índices');
      soltar();
      const r = await p;
      assert.equal(r.status, 200);
    } finally { soltar?.(); await fechar(c.server); }
  });
});

// =============================================================
describe('filtro de módulos (regra QA_SERVIDOR, D-41; D-62)', () => {
  const sempre = M.MODULOS_SEMPRE[1]; // 'routes/portal/perfil.js' — um dos 9 da F0t
  const sinteticos = () => [
    modulo('routes/teste/a.js', async (ctx) => { ctx.rotas.aluno.get('/teste/a', (_q, s) => s.json({ a: 1 })); }),
    modulo('routes/teste/b.js', async (ctx) => { ctx.rotas.aluno.get('/teste/b', (_q, s) => s.json({ b: 1 })); }),
    modulo(sempre, async (ctx) => { ctx.rotas.aluno.get('/teste/f0t', (_q, s) => s.json({ f0t: 1 })); })
  ];
  const carregados = async (env) => {
    const c = await subirPortal({ modulos: sinteticos(), configPortal: lerConfigPortal({ JWT_SECRET: 'x', ...env }) });
    try {
      await c.api.get('/api/portal/saude');
      return { estado: c.portal.estadoDoPortal() };
    } finally { await fechar(c.server); }
  };

  test('aplicarFiltroDeModulos: so + os 9 da F0t; ignorar vale também sobre os que so soma', () => {
    const lista = M.MODULOS_PADRAO;
    const so = M.aplicarFiltroDeModulos(lista, { so: ['routes/portal-avaliacoes.js'], ignorar: [] }).map(m => m.caminho);
    assert.deepEqual(so, [...M.MODULOS_SEMPRE, 'routes/portal-avaliacoes.js']);
    const ign = M.aplicarFiltroDeModulos(lista, { so: ['routes/portal-avaliacoes.js'], ignorar: [...M.MODULOS_SEMPRE] }).map(m => m.caminho);
    assert.deepEqual(ign, ['routes/portal-avaliacoes.js']);
    assert.equal(M.aplicarFiltroDeModulos(lista, { so: null, ignorar: [] }).length, 27);
    assert.equal(M.aplicarFiltroDeModulos(lista, undefined).length, 27);
  });

  test('com QA_SERVIDOR=1: PORTAL_MODULOS monta só os pedidos + os da F0t', async () => {
    const { estado } = await carregados({ NODE_ENV: 'test', QA_SERVIDOR: '1', PORTAL_MODULOS: 'server/src/routes/teste/a.js' });
    assert.deepEqual(Object.keys(estado.rotas).sort(), [sempre, 'routes/teste/a.js'].sort());
  });

  test('PORTAL_MODULOS_IGNORAR pula também os 9 que PORTAL_MODULOS sempre soma', async () => {
    const { estado } = await carregados({ NODE_ENV: 'test', QA_SERVIDOR: '1', PORTAL_MODULOS: 'routes/teste/a.js', PORTAL_MODULOS_IGNORAR: sempre });
    assert.deepEqual(Object.keys(estado.rotas), ['routes/teste/a.js']);
  });

  for (const [rotulo, env] of [
    ['sem QA_SERVIDOR=1', { NODE_ENV: 'test' }],
    ['com VERCEL_ENV presente', { NODE_ENV: 'test', QA_SERVIDOR: '1', VERCEL_ENV: 'preview' }],
    ['com NODE_ENV=production', { NODE_ENV: 'production', QA_SERVIDOR: '1' }]
  ]) {
    test(`filtro ignorado ${rotulo}: monta todos e avisa (só o nome da variável)`, async () => {
      const cfg = lerConfigPortal({ JWT_SECRET: 'x', PORTAL_MODULOS: 'routes/teste/a.js', PORTAL_MODULOS_IGNORAR: 'routes/teste/b.js', ...env });
      assert.equal(cfg.qa, false);
      assert.deepEqual(cfg.modulosFiltro, { so: null, ignorar: [] });
      const aviso = avisosDeConfiguracao(cfg).find(a => /variável de QA ignorada/.test(a));
      assert.ok(aviso && /PORTAL_MODULOS/.test(aviso) && !/routes\/teste/.test(aviso));
      const { estado } = await carregados({ PORTAL_MODULOS: 'routes/teste/a.js', PORTAL_MODULOS_IGNORAR: 'routes/teste/b.js', ...env });
      assert.equal(Object.keys(estado.rotas).length, 3);
    });
  }

  test('URL de provedor falso só com a regra e http://127.0.0.1 — e o e-mail do núcleo a usa', async () => {
    const env = { NODE_ENV: 'test', QA_SERVIDOR: '1', RESEND_API_KEY: 'qa-falsa', PORTAL_EMAIL_FROM: 'Plataforma QA <qa@exemplo.invalid>' };
    assert.equal(lerConfigPortal({ ...env, PORTAL_RESEND_URL: 'http://127.0.0.1:9999' }).urlsProvedor.resend, 'http://127.0.0.1:9999');
    assert.equal(lerConfigPortal({ ...env, PORTAL_RESEND_URL: 'http://evil.example' }).urlsProvedor.resend, 'https://api.resend.com');
    assert.equal(lerConfigPortal({ ...env, QA_SERVIDOR: '', PORTAL_RESEND_URL: 'http://127.0.0.1:9999' }).urlsProvedor.resend, 'https://api.resend.com');
    const f = fetchFalso([{ status: 200, json: { id: 'x' } }]);
    const c = await subirPortal({ configPortal: lerConfigPortal({ ...env, PORTAL_RESEND_URL: 'http://127.0.0.1:9999' }), fetchImpl: f });
    try {
      const email = c.servicos.obter('email');
      assert.equal(email.disponivel, true);
      const r = await email.enviar({ para: 'aluna@exemplo.invalid', assunto: 'Teste', texto: 'Corpo' });
      assert.deepEqual(r, { enviado: true });
      assert.equal(f.chamadas[0].url, 'http://127.0.0.1:9999/emails');
    } finally { await fechar(c.server); }
  });
});

// =============================================================
describe('troca de senha obrigatória e 2FA da coordenação', () => {
  let ctx;
  before(async () => { ctx = await subirPortal({ modulos: [moduloSaudavel()] }); });
  after(() => fechar(ctx.server));

  test('senha temporária: lista liberada passa', async () => {
    const liberadas = [
      ['get', '/api/portal/saude'],
      ['get', '/api/auth/recursos'],
      ['post', '/api/auth/senha/trocar'],
      ['get', '/api/certificados/validar/DMC-AAAA-BBBB'],
      ['get', '/api/capas/capa.jpg']
    ];
    for (const [m, c] of liberadas) {
      const r = m === 'get' ? await ctx.api.get(c, { usuario: 'u-temp' }) : await ctx.api.post(c, {}, { usuario: 'u-temp' });
      assert.equal(r.status, 200, `${m} ${c}`);
    }
    // Não existem neste app (404 do próprio fluxo), mas passam pela trava:
    for (const c of ['/api/portal/validar/DEC-AAAA-BBBB-CCCC', '/api/portal/banners/imagens/b.png', '/api/portal/conteudo/imagens/cap-x.jpg']) {
      const r = await ctx.api.get(c, { usuario: 'u-temp' });
      assert.notEqual(r.corpo?.codigo, 'troca-de-senha-obrigatoria', c);
    }
    const conf = await ctx.api.post('/api/portal/validar/DEC-AAAA-BBBB-CCCC/conferir', {}, { usuario: 'u-temp' });
    assert.notEqual(conf.corpo?.codigo, 'troca-de-senha-obrigatoria');
  });

  test('senha temporária: o resto → 403 troca-de-senha-obrigatoria, inclusive o LMS legado', async () => {
    for (const [m, c] of [['get', '/api/portal/teste/aluno'], ['get', '/api/portal/me/teste'], ['get', '/api/catalogo'],
      ['get', '/api/legado/servico/acesso'], ['post', '/api/portal/saude'], ['get', '/api/auth/senha/trocar']]) {
      const r = m === 'get' ? await ctx.api.get(c, { usuario: 'u-temp' }) : await ctx.api.post(c, {}, { usuario: 'u-temp' });
      assert.equal(r.status, 403, `${m} ${c}`);
      assert.equal(r.corpo.codigo, 'troca-de-senha-obrigatoria');
      assert.ok(r.corpo.requestId);
    }
  });

  test('sem a flag: no-op (aluno comum passa no LMS)', async () => {
    assert.equal((await ctx.api.get('/api/catalogo', { usuario: 'u-aluno1' })).status, 200);
    assert.equal((await ctx.api.get('/api/portal/teste/aluno', { usuario: 'u-aluno1' })).status, 200);
  });

  test('2FA ligado: admin sem 2FA → 403 2fa-obrigatorio em /portal/admin e /portal/professor; me/* passa', async () => {
    const c = await subirPortal({ modulos: [moduloSaudavel()], configPortal: lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'x', PORTAL_2FA: '1' }) });
    try {
      for (const u of ['/api/portal/admin/teste/admin', '/api/portal/professor/teste/prof']) {
        const r = await c.api.get(u, { usuario: 'u-admin' });
        assert.equal(r.status, 403, u);
        assert.equal(r.corpo.codigo, '2fa-obrigatorio');
      }
      assert.equal((await c.api.get('/api/portal/me/teste', { usuario: 'u-admin' })).status, 200);
      assert.equal((await c.api.get('/api/portal/professor/teste/prof', { usuario: 'u-prof' })).status, 200, 'professor: só recomendado');
      await c.banco.collection('users').updateOne({ _id: oid('u-admin') }, { $set: { doisFatoresAtivo: true } });
      assert.equal((await c.api.get('/api/portal/admin/teste/admin', { usuario: 'u-admin' })).status, 200);
    } finally { await fechar(c.server); }
  });

  test('2FA desligado (sem PORTAL_2FA): no-op', async () => {
    assert.equal((await ctx.api.get('/api/portal/admin/teste/admin', { usuario: 'u-admin' })).status, 200);
  });
});

// =============================================================
describe('erros: 500 com uma linha de log sem dado pessoal e um registro em erros_servidor', () => {
  test('GET que lança → 500 genérico, requestId no corpo, 1 linha JSON, 1 documento', async () => {
    const espiao = criarLogEspiao();
    const global = criarLogEspiao();
    const c = await subirPortal({ modulos: [moduloSaudavel()], log: espiao, logGlobal: global });
    try {
      const r = await c.api.get('/api/portal/teste/erro500', { usuario: 'u-aluno1' });
      assert.equal(r.status, 500);
      assert.equal(r.corpo.error, 'Erro interno no servidor.');
      assert.equal(r.corpo.requestId, r.headers.get('x-request-id'));
      const linhas = espiao.linhas.filter(l => l.nivel === 'error' && /"status":500/.test(l.texto));
      assert.equal(linhas.length, 1);
      const linha = JSON.parse(linhas[0].texto);
      assert.equal(linha.requestId, r.corpo.requestId);
      assert.doesNotMatch(linhas[0].texto, /ana\.silva|exemplo\.invalid|529\.982|52998224725/);
      assert.equal(global.linhas.length, 0, 'o global não loga de novo (registrado)');
      await new Promise(res => setTimeout(res, 20));
      const docs = c.banco.documentos('erros_servidor');
      assert.equal(docs.length, 1);
      assert.equal(docs[0].requestId, r.corpo.requestId);
      assert.equal(docs[0].status, 500);
      assert.doesNotMatch(docs[0].erroResumido, /ana\.silva|529\.982/);
      assert.ok(docs[0].expiraEm > docs[0].em);
    } finally { await fechar(c.server); }
  });

  test('montar.js reexporta tratarErroGlobal e resumirErro de erros.js (terceiro ponto do server.js)', () => {
    assert.equal(M.tratarErroGlobal, E.tratarErroGlobal);
    assert.equal(M.resumirErro, E.resumirErro);
    assert.equal(M.tratarErroGlobal.length, 4, 'handler de erro do Express (4 parâmetros)');
  });
});

// =============================================================
describe('middlewares avulsos', () => {
  const resFalso = () => {
    const r = { statusCode: 200, corpo: null };
    r.status = (s) => { r.statusCode = s; return r; };
    r.json = (c) => { r.corpo = c; return r; };
    return r;
  };

  test('exigirPapel: 401 sem usuário; 403 papel-insuficiente; next() no papel certo; papel inválido lança', () => {
    const mw = M.exigirPapel('professor', 'admin');
    let r = resFalso();
    mw({}, r, () => assert.fail('não devia passar'));
    assert.equal(r.statusCode, 401);
    r = resFalso();
    mw({ user: { _id: 'x', papel: 'aluno' }, requestId: 'r-000000000000' }, r, () => assert.fail('não devia passar'));
    assert.equal(r.statusCode, 403);
    assert.deepEqual(r.corpo, { error: E.MENSAGENS['papel-insuficiente'], codigo: 'papel-insuficiente', requestId: 'r-000000000000' });
    let passou = false;
    mw({ user: { _id: 'x', isAdmin: true } }, resFalso(), () => { passou = true; });
    assert.ok(passou);
    assert.throws(() => M.exigirPapel('dono'), TypeError);
  });

  test('exigirSegundoFatorAdmin: no-op sem doisFatores; com ele, só admin sem 2FA é barrado', () => {
    let n = 0;
    M.exigirSegundoFatorAdmin({ configPortal: { doisFatores: false } })({ user: { isAdmin: true } }, resFalso(), () => n++);
    const mw = M.exigirSegundoFatorAdmin({ configPortal: { doisFatores: true } });
    mw({ user: { isAdmin: true, doisFatoresAtivo: true } }, resFalso(), () => n++);
    mw({ user: { papel: 'professor' } }, resFalso(), () => n++);
    const r = resFalso();
    mw({ user: { isAdmin: true } }, r, () => n++);
    assert.equal(n, 3);
    assert.equal(r.statusCode, 403);
    assert.equal(r.corpo.codigo, '2fa-obrigatorio');
  });
});

// =============================================================
describe('MODULOS_PADRAO e pares método + caminho (DC-75)', () => {
  test('27 entradas, cada uma com import() LITERAL do próprio caminho (leitura do fonte)', () => {
    assert.equal(M.MODULOS_PADRAO.length, 27);
    assert.equal(new Set(M.MODULOS_PADRAO.map(m => m.caminho)).size, 27);
    const fatias = new Set(['F0t', 'F1a', 'F2', 'F3a', 'F3b', 'F4a', 'F4b', 'F5', 'F6a', 'F6b', 'F7', 'F8']);
    for (const m of M.MODULOS_PADRAO) {
      assert.ok(fatias.has(m.fatia), `${m.caminho}: fatia ${m.fatia}`);
      const linha = FONTE_MONTAR.split('\n').find(l => l.includes(`caminho: '${m.caminho}'`));
      assert.ok(linha, `${m.caminho} no fonte`);
      assert.ok(linha.includes(`importar: () => import('../${m.caminho}')`), `${m.caminho}: import() literal na mesma entrada`);
    }
    const codigo = FONTE_MONTAR.split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    const dinamicos = [...codigo.matchAll(/\bimport\(\s*([^)]*)\)/g)].map(x => x[1]);
    assert.equal(dinamicos.length, 27, 'nenhum outro import() dinâmico');
    assert.ok(dinamicos.every(a => /^'\.\.\/routes\/[a-z0-9/-]+\.js'$/.test(a)), 'só especificadores literais');
    assert.deepEqual(M.MODULOS_PADRAO.filter(m => m.fatia === 'F4b').map(m => m.caminho), ['routes/portal/documentos.js', 'routes/portal/contratos.js']);
    assert.equal(M.MODULOS_SEMPRE.length, 9);
  });

  test('o detector de pares repetidos funciona (dois módulos sintéticos com o mesmo GET)', async () => {
    const c = await subirPortal({
      modulos: [
        modulo('routes/teste/x.js', async (ctx) => { ctx.rotas.aluno.get('/teste/igual', (_q, s) => s.end()); }),
        modulo('routes/teste/y.js', async (ctx) => { ctx.rotas.publico.get('/teste/igual', (_q, s) => s.end()); ctx.rotas.admin.post('/teste/igual', (_q, s) => s.end()); })
      ]
    });
    try {
      await c.api.get('/api/portal/saude');
      const dup = paresRepetidos(c.portal.estadoDoPortal().rotas);
      assert.deepEqual(dup, ['GET /api/portal/teste/igual']);
    } finally { await fechar(c.server); }
  });

  test('módulos reais: montam sem falha e sem par método + caminho repetido (QA_FATIA restringe à fatia)', async () => {
    const fatia = process.env.QA_FATIA || null;
    const alvo = fatia ? M.MODULOS_PADRAO.filter(m => m.fatia === fatia) : M.MODULOS_PADRAO;
    const c = await subirPortal({ modulos: alvo });
    try {
      await c.api.get('/api/portal/saude');
      const estado = c.portal.estadoDoPortal();
      assert.deepEqual(estado.falhas, []);
      assert.equal(estado.carregados + estado.ausentes.length, alvo.length);
      assert.deepEqual(paresRepetidos(estado.rotas), []);
    } finally { await fechar(c.server); }
  });
});

/** "MÉTODO /caminho" registrados por mais de um módulo (ou duas vezes no mesmo). */
function paresRepetidos(rotasPorModulo) {
  const vistos = new Map();
  const dup = new Set();
  for (const lista of Object.values(rotasPorModulo)) {
    for (const par of lista) {
      if (vistos.has(par)) dup.add(par);
      vistos.set(par, true);
    }
  }
  return [...dup].sort();
}
