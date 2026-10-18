// Portal · F0m — integração com MongoDB REAL (opcional; PORTAL-API §9.3, índice §9.7).
// Só roda com PORTAL_TESTE_MONGO_URI (mongodb:// em 127.0.0.1) e banco terminado em _qa
// (PORTAL_TESTE_MONGO_DB, padrão complexodmc_portal_qa). Sem a variável, faz skip — o
// `npm test` comum nunca abre Mongo. Nunca toca em complexodmc_local.
//
//   PORTAL_TESTE_MONGO_URI=mongodb://127.0.0.1:27017 PORTAL_TESTE_MONGO_DB=complexodmc_portal_f0m_qa \
//     NODE_ENV=test node --test server/test/portal-base-integracao.test.js
//
// Confere o que o emulador não prova: os índices de verdade (TTL, parcial, único), a
// unicidade implícita do _id na varredura de notificações, o contador sob corrida e o
// Binary de ida e volta. Apaga só os documentos que ele mesmo criou (marca única por
// execução); os índices do núcleo ficam (são os do portal).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { MongoClient } from 'mongodb';
import { conferirAlvoQa } from '../scripts/seed-portal-qa.js';
import { subir, fechar, cliente } from './apoio/http.js';
import { silencioso, pdfMinimo } from './apoio/falsos.js';

const URI = process.env.PORTAL_TESTE_MONGO_URI || '';
const DB = process.env.PORTAL_TESTE_MONGO_DB || 'complexodmc_portal_qa';
const alvo = URI ? conferirAlvoQa({ uri: URI, db: DB }) : { ok: false, motivo: 'PORTAL_TESTE_MONGO_URI ausente' };
const pular = alvo.ok ? false : `integração com Mongo real desligada (${alvo.motivo})`;

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';

const MARCA = `integ-${randomBytes(4).toString('hex')}`;

describe('integração com MongoDB real (F0m)', { skip: pular }, () => {
  let cliente_;
  let db;
  const getDb = () => db;
  const repo = nome => db.collection(nome);

  before(async () => {
    cliente_ = new MongoClient(alvo.uri, { serverSelectionTimeoutMS: 3000 });
    await cliente_.connect();
    db = cliente_.db(alvo.db);
  });

  after(async () => {
    if (!db) return;
    const usuarios = { $regex: `^${MARCA}` };
    await Promise.all([
      db.collection('notificacoes').deleteMany({ userId: usuarios }),
      db.collection('notificacoes_estado').deleteMany({ _id: usuarios }),
      db.collection('limites').deleteMany({ chave: { $regex: `^teste:${MARCA}` } }),
      db.collection('auditoria').deleteMany({ 'entidade.id': usuarios }),
      db.collection('arquivos').deleteMany({ donoUserId: usuarios }),
      db.collection('erros_servidor').deleteMany({ requestId: { $in: criadosErros } })
    ]);
    await cliente_.close();
  });
  const criadosErros = [];

  test('garantia cria os índices do núcleo com as opções certas (TTL, parcial, único) e é idempotente', async () => {
    const { criarGarantiaIndices, INDICES_NUCLEO } = await import('../src/portal/indices.js');
    const g = criarGarantiaIndices({ getDb, log: silencioso, especificacoes: INDICES_NUCLEO });
    await g.garantir();
    await criarGarantiaIndices({ getDb, log: silencioso, especificacoes: INDICES_NUCLEO }).garantir();
    for (const s of INDICES_NUCLEO) {
      const idx = (await db.collection(s.colecao).indexes()).find(i => i.name === s.opcoes.name);
      assert.ok(idx, s.opcoes.name);
      assert.deepEqual(idx.key, s.chave, s.opcoes.name);
      if (s.opcoes.unique) assert.equal(idx.unique, true);
      if (s.opcoes.expireAfterSeconds !== undefined) assert.equal(idx.expireAfterSeconds, s.opcoes.expireAfterSeconds);
      if (s.opcoes.partialFilterExpression) assert.deepEqual(idx.partialFilterExpression, s.opcoes.partialFilterExpression);
    }
  });

  test('notificações: dedupe pela chave no índice parcial real; varredura sob corrida roda uma vez (_id único do Mongo)', async () => {
    const { criarServicoNotificacoes } = await import('../src/portal/notificacoes.js');
    const { criarServicos } = await import('../src/portal/servicos.js');
    const servicos = criarServicos();
    let n = 0;
    servicos.adicionar('notificacaoSobDemanda', { tipo: 'encontro.proximo', gerar: async () => { n++; } });
    const notif = criarServicoNotificacoes({ repo, servicos, log: silencioso });
    const u = `${MARCA}-u1`;
    const m = { userIds: [u], tipo: 'contrato.disponivel', titulo: 'Contrato disponível', chave: 'contrato:x:disponivel' };
    assert.deepEqual(await notif.emitir(m), { inseridas: 1 });
    assert.deepEqual(await notif.emitir(m), { inseridas: 0 });
    assert.deepEqual(await notif.emitir({ ...m, userIds: [u, `${MARCA}-u2`] }), { inseridas: 1 }, 'lote misto: só o novo entra');
    assert.deepEqual(await notif.emitir({ ...m, chave: null }), { inseridas: 1 });
    assert.deepEqual(await notif.emitir({ ...m, chave: null }), { inseridas: 1 });
    assert.equal(await db.collection('notificacoes').countDocuments({ userId: u }), 3);
    assert.equal(await db.collection('notificacoes').countDocuments({ userId: `${MARCA}-u2` }), 1);
    await Promise.all(Array.from({ length: 8 }, () => notif.varrer(u)));
    assert.equal(n, 1);
  });

  test('contador persistente: 20 consumos simultâneos → 1..20 num único documento', async () => {
    const { criarContadorPersistente } = await import('../src/portal/limitador.js');
    const c = criarContadorPersistente({ repo });
    const chave = `teste:${MARCA}:corrida`;
    const r = await Promise.all(Array.from({ length: 20 }, () => c.consumir(chave, { janelaMs: 60000, max: 100 })));
    assert.deepEqual(r.map(x => x.n).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
    assert.equal(await db.collection('limites').countDocuments({ chave }), 1);
  });

  test('auditoria executar e arquivos (Binary de ida e volta, filtro no mesmo find)', async () => {
    const { criarAuditoria } = await import('../src/portal/auditoria.js');
    const { criarArquivos } = await import('../src/portal/arquivos.js');
    const aud = criarAuditoria({ repo, log: silencioso });
    const ent = `${MARCA}-ent`;
    assert.equal(await aud.executar({ acao: 'docencia.criada', entidade: { tipo: 'docencia', id: ent } }, null, async () => 'feito'), 'feito');
    assert.equal((await db.collection('auditoria').findOne({ 'entidade.id': ent })).estado, 'concluido');
    const arq = criarArquivos({ repo });
    const s = await arq.salvar({ contexto: 'documento', donoUserId: `${MARCA}-dono`, buf: pdfMinimo(), tipo: 'pdf', nomeDownload: 'teste' });
    const lido = await arq.ler(s.id, { contexto: 'documento', donoUserId: `${MARCA}-dono` });
    assert.ok(lido.dados.equals(pdfMinimo()));
    assert.equal(await arq.ler(s.id, { contexto: 'material' }), null);
  });

  test('agregador sobre o banco real: saúde, rota de módulo, erro 500 registrado em erros_servidor', async () => {
    const { montarPortal } = await import('../src/portal/montar.js');
    const { criarServicos } = await import('../src/portal/servicos.js');
    const { requireAuth, requireAdmin } = await import('../src/auth.js');
    const { criarTratarErroGlobal } = await import('../src/portal/erros.js');
    const portal = montarPortal({
      getDb, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin], servicos: criarServicos(),
      falharCedo: false, log: silencioso,
      modulos: [{ caminho: 'routes/teste/integ.js', fatia: 'TESTE', importar: async () => ({ default: async (ctx) => {
        ctx.rotas.publico.get('/integ/erro', (_q, _r, next) => next(new Error('falha de integração')));
      } }) }]
    });
    const app = express();
    app.use(express.json());
    app.use('/api', portal);
    app.use(criarTratarErroGlobal({ log: silencioso }));
    const { server, base } = await subir(app);
    try {
      const api = cliente(base);
      const s = await api.get('/api/portal/saude');
      assert.deepEqual(s.corpo, { ok: true, modulos: { esperados: 1, carregados: 1, comFalha: 0 } });
      const e = await api.get('/api/portal/integ/erro');
      assert.equal(e.status, 500);
      criadosErros.push(e.corpo.requestId);
      await new Promise(r => setTimeout(r, 200));
      const doc = await db.collection('erros_servidor').findOne({ requestId: e.corpo.requestId });
      assert.ok(doc);
      assert.equal(doc.status, 500);
    } finally { await fechar(server); }
  });
});
