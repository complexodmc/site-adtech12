// Portal · F6a — ouvidoria (protocolos OUV). PORTAL-API §6.10.2, §9.3 (linha
// atendimento-ouvidoria), DC-40, DC-46, D-54. Agregador real com os módulos da F6a,
// banco em memória; nenhum Mongo, nenhuma rede.
//   NODE_ENV=test node --test server/test/atendimento-ouvidoria.test.js
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

const CFG = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });
const MODULOS_F6A = M.MODULOS_PADRAO.filter(m => m.fatia === 'F6a');
const OUV = /^OUV-\d{4}-[2-9A-HJ-NP-Z]{6}$/;
const CHAVES_PROFESSOR = ['criadoEm', 'curso', 'encaminhadaEm', 'meuParecer', 'observacao', 'protocolo', 'texto', 'tipo', 'assunto'].sort();
const PROIBIDAS = ['userId', 'nome', 'email', 'mensagens', 'autorId', 'matricula', 'turma', 'turmaId', 'status', 'encaminhamentos', 'identidade', 'senhaHash'];

async function subirPortal() {
  const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
  await semear(banco);
  const servicos = criarServicos();
  servicos.registrar('secretaria.matriculasDoAluno', async (userId) => banco.collection('matriculas').find({ userId }).toArray());
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: MODULOS_F6A, configPortal: CFG, falharCedo: true, log: silencioso
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

function semChaves(obj, proibidas, caminho = '$') {
  if (Array.isArray(obj)) return obj.forEach((v, i) => semChaves(v, proibidas, `${caminho}[${i}]`));
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      assert.ok(!proibidas.includes(k), `chave proibida ${k} em ${caminho}`);
      semChaves(v, proibidas, `${caminho}.${k}`);
    }
  }
}

const manifestacao = (tipo, extra = {}) => ({
  tipo, assunto: `Manifestação de ${tipo}`, texto: 'Texto da manifestação com mais de vinte caracteres para valer.', cursoId: 'curso-01', ...extra
});

describe('ouvidoria', () => {
  let ctx;
  const protocolos = {};
  before(async () => {
    ctx = await subirPortal();
    for (const tipo of ['elogio', 'sugestao', 'reclamacao', 'denuncia']) {
      // 3 por hora por conta: a denúncia vem da outra aluna.
      const r = await ctx.api.post('/api/portal/me/ouvidoria', manifestacao(tipo, { identidadeResguardada: false }), { usuario: tipo === 'denuncia' ? 'u-aluno2' : 'u-aluno1' });
      assert.equal(r.status, 201, tipo);
      protocolos[tipo] = r.corpo.protocolo;
    }
  });
  after(() => fechar(ctx.server));

  test('registro: OUV válido, validação, formato-invalido, 401; identidadeResguardada ignorado', async () => {
    assert.match(protocolos.elogio, OUV);
    const doc = await ctx.banco.collection('manifestacoes').findOne({ protocolo: protocolos.elogio });
    assert.equal(doc.identidadeResguardada, undefined);
    assert.equal(doc.status, 'aberto');
    const curto = await ctx.api.post('/api/portal/me/ouvidoria', manifestacao('elogio', { texto: 'curto' }), { usuario: 'u-intruso' });
    assert.equal(curto.status, 400);
    assert.ok(curto.corpo.campos.texto);
    const obj = await ctx.api.post('/api/portal/me/ouvidoria', manifestacao('elogio', { assunto: { $ne: 1 } }), { usuario: 'u-intruso' });
    assert.equal(obj.corpo.codigo, 'formato-invalido');
    assert.equal((await ctx.api.post('/api/portal/me/ouvidoria', manifestacao('elogio'))).status, 401);
    const tipo = await ctx.api.post('/api/portal/me/ouvidoria', manifestacao('anonima'), { usuario: 'u-intruso' });
    const alheio = await ctx.api.post('/api/portal/me/ouvidoria', manifestacao('elogio', { cursoId: 'curso-02' }), { usuario: 'u-intruso' });
    assert.equal(alheio.status, 400);
    assert.equal(tipo.status, 400);
  });

  test('lista da coordenação sem identidade nos 4 tipos; aluno → 403', async () => {
    assert.equal((await ctx.api.get('/api/portal/admin/ouvidoria', { usuario: 'u-aluno1' })).status, 403);
    assert.equal((await ctx.api.get('/api/portal/admin/ouvidoria', { usuario: 'u-prof' })).status, 403);
    const r = await ctx.api.get('/api/portal/admin/ouvidoria', { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.total, 4);
    semChaves(r.corpo.itens, ['userId', 'email', 'identidade', 'texto', 'mensagens']);
    assert.ok(!JSON.stringify(r.corpo).includes(IDS['u-aluno1']));
    assert.ok(!JSON.stringify(r.corpo).includes('Aluna Um'));
  });

  test('professor sem encaminhamento → lista vazia e 404 no detalhe', async () => {
    const r = await ctx.api.get('/api/portal/professor/ouvidoria', { usuario: 'u-prof' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.itens, []);
    assert.equal((await ctx.api.get(`/api/portal/professor/ouvidoria/${protocolos.elogio}`, { usuario: 'u-prof' })).status, 404);
    assert.equal((await ctx.api.get('/api/portal/professor/ouvidoria', { usuario: 'u-aluno1' })).status, 403);
  });

  test('encaminhar denúncia → 409; destinatário sem papel professor → 400; elogio encaminhado chega saneado', async () => {
    const den = await ctx.api.post(`/api/portal/admin/ouvidoria/${protocolos.denuncia}/encaminhar`, { professorId: IDS['u-prof'], observacao: 'Peço o seu parecer sobre o caso.' }, { usuario: 'u-admin' });
    assert.equal(den.status, 409);
    assert.equal(den.corpo.codigo, 'encaminhamento-nao-permitido');
    const aluno = await ctx.api.post(`/api/portal/admin/ouvidoria/${protocolos.elogio}/encaminhar`, { professorId: IDS['u-aluno2'], observacao: 'Peço o seu parecer sobre o caso.' }, { usuario: 'u-admin' });
    assert.equal(aluno.status, 400);
    const curta = await ctx.api.post(`/api/portal/admin/ouvidoria/${protocolos.elogio}/encaminhar`, { professorId: IDS['u-prof'], observacao: 'curta' }, { usuario: 'u-admin' });
    assert.equal(curta.status, 400);
    for (const tipo of ['elogio', 'sugestao', 'reclamacao']) {
      const ok = await ctx.api.post(`/api/portal/admin/ouvidoria/${protocolos[tipo]}/encaminhar`, { professorId: IDS['u-prof'], observacao: 'Peço o seu parecer sobre o caso.' }, { usuario: 'u-admin' });
      assert.equal(ok.status, 201, tipo);
    }
    assert.ok(await ctx.banco.collection('notificacoes').findOne({ userId: IDS['u-prof'], tipo: 'ouvidoria.encaminhada' }));
    const aud = await ctx.banco.collection('auditoria').findOne({ acao: 'ouvidoria.encaminhada' });
    assert.equal(aud.estado, 'concluido');
  });

  test('visão do professor SEMPRE saneada nos 4 tipos (inclusive denúncia gravada direto no banco)', async () => {
    // Denúncia não se encaminha pela rota; aqui o encaminhamento é gravado direto para provar o saneamento.
    await ctx.banco.collection('manifestacoes').updateOne({ protocolo: protocolos.denuncia }, {
      $push: { encaminhamentos: { paraUserId: IDS['u-prof'], em: new Date(), por: IDS['u-admin'], observacao: 'Gravado no teste.', parecer: null } },
      $set: { mensagens: [{ id: 'm-1', autorPapel: 'manifestante', autorId: IDS['u-aluno2'], texto: 'Complemento', em: new Date() }] }
    });
    const lista = await ctx.api.get('/api/portal/professor/ouvidoria', { usuario: 'u-prof' });
    assert.equal(lista.corpo.itens.length, 4);
    for (const item of lista.corpo.itens) {
      assert.deepEqual(Object.keys(item).sort(), CHAVES_PROFESSOR, item.tipo);
      semChaves(item, PROIBIDAS);
      const det = await ctx.api.get(`/api/portal/professor/ouvidoria/${item.protocolo}`, { usuario: 'u-prof' });
      assert.equal(det.status, 200);
      assert.deepEqual(Object.keys(det.corpo).sort(), CHAVES_PROFESSOR);
      semChaves(det.corpo, PROIBIDAS);
      assert.ok(!JSON.stringify(det.corpo).includes(IDS['u-aluno1']) && !JSON.stringify(det.corpo).includes(IDS['u-aluno2']), item.tipo);
      assert.ok(!JSON.stringify(det.corpo).includes('exemplo.invalid'), item.tipo);
    }
    assert.equal((await ctx.api.get('/api/portal/professor/ouvidoria', { usuario: 'u-prof-t1' })).corpo.itens.length, 0);
  });

  test('identidade só com ?identidade=1, auditada', async () => {
    const sem = await ctx.api.get(`/api/portal/admin/ouvidoria/${protocolos.reclamacao}`, { usuario: 'u-admin' });
    assert.equal(sem.status, 200);
    assert.equal(sem.corpo.identidade, undefined);
    semChaves(sem.corpo, ['userId', 'email', 'identidade']);
    assert.equal(await ctx.banco.collection('auditoria').countDocuments({ acao: 'ouvidoria.identidade_acessada' }), 0);
    const com = await ctx.api.get(`/api/portal/admin/ouvidoria/${protocolos.reclamacao}?identidade=1`, { usuario: 'u-admin' });
    assert.equal(com.corpo.identidade.nome, 'Aluna Um de Teste');
    assert.equal(com.corpo.identidade.email, 'aluno1@exemplo.invalid');
    assert.equal(com.corpo.identidade.matricula, 'MAT-2026-AAAAA2');
    const aud = await ctx.banco.collection('auditoria').findOne({ acao: 'ouvidoria.identidade_acessada' });
    assert.equal(aud.entidade.id, protocolos.reclamacao);
    assert.equal(aud.estado, 'concluido');
  });

  test('resposta assinada "Ouvidoria"; parecer e encaminhamentos invisíveis ao manifestante', async () => {
    const r = await ctx.api.post(`/api/portal/admin/ouvidoria/${protocolos.sugestao}/mensagens`, { texto: 'Obrigada pela sugestão; vamos avaliar.' }, { usuario: 'u-admin' });
    assert.equal(r.status, 201);
    const titular = await ctx.api.get(`/api/portal/me/ouvidoria/${protocolos.sugestao}`, { usuario: 'u-aluno1' });
    assert.equal(titular.corpo.status, 'respondido');
    const resposta = titular.corpo.mensagens.find(m => m.autor === 'ouvidoria');
    assert.equal(resposta.autorNome, 'Ouvidoria');
    semChaves(titular.corpo, ['encaminhamentos', 'parecer', 'autorId', 'observacao']);
    assert.ok(await ctx.banco.collection('notificacoes').findOne({ userId: IDS['u-aluno1'], tipo: 'ouvidoria.respondida' }));
    const alheio = await ctx.api.get(`/api/portal/me/ouvidoria/${protocolos.sugestao}`, { usuario: 'u-aluno2' });
    assert.equal(alheio.status, 404);
  });

  test('parecer: 1º grava; 2º no mesmo encaminhamento → 409 transicao-invalida e o 1º intacto; ouvidoriaSemParecer exato', async () => {
    const semParecer = ctx.servicos.obter('atendimento.ouvidoriaSemParecer');
    assert.equal(await semParecer(IDS['u-prof']), 4);
    const curto = await ctx.api.post(`/api/portal/professor/ouvidoria/${protocolos.elogio}/parecer`, { texto: 'curto' }, { usuario: 'u-prof' });
    assert.equal(curto.status, 400);
    const p1 = await ctx.api.post(`/api/portal/professor/ouvidoria/${protocolos.elogio}/parecer`, { texto: 'Parecer do professor sobre o elogio.' }, { usuario: 'u-prof' });
    assert.equal(p1.status, 201);
    assert.equal(p1.corpo.meuParecer.texto, 'Parecer do professor sobre o elogio.');
    const p2 = await ctx.api.post(`/api/portal/professor/ouvidoria/${protocolos.elogio}/parecer`, { texto: 'Segundo parecer que não deve gravar.' }, { usuario: 'u-prof' });
    assert.equal(p2.status, 409);
    assert.equal(p2.corpo.codigo, 'transicao-invalida');
    assert.equal(p2.corpo.error, 'Parecer já enviado.');
    const det = await ctx.api.get(`/api/portal/professor/ouvidoria/${protocolos.elogio}`, { usuario: 'u-prof' });
    assert.equal(det.corpo.meuParecer.texto, 'Parecer do professor sobre o elogio.');
    assert.equal(await semParecer(IDS['u-prof']), 3);
    assert.equal(await semParecer(IDS['u-prof-t1']), 0);
    const outro = await ctx.api.post(`/api/portal/professor/ouvidoria/${protocolos.elogio}/parecer`, { texto: 'Parecer de quem não recebeu.' }, { usuario: 'u-prof-t1' });
    assert.equal(outro.status, 404);
    const coord = await ctx.api.get(`/api/portal/admin/ouvidoria/${protocolos.elogio}`, { usuario: 'u-admin' });
    assert.equal(coord.corpo.encaminhamentos[0].parecer.texto, 'Parecer do professor sobre o elogio.');
  });

  test('encerrar: manifestante e coordenação; mensagem depois → 409', async () => {
    const enc = await ctx.api.post(`/api/portal/me/ouvidoria/${protocolos.elogio}/encerrar`, {}, { usuario: 'u-aluno1' });
    assert.equal(enc.status, 200);
    const msg = await ctx.api.post(`/api/portal/me/ouvidoria/${protocolos.elogio}/mensagens`, { texto: 'Mais um comentário.' }, { usuario: 'u-aluno1' });
    assert.equal(msg.status, 409);
    assert.equal(msg.corpo.codigo, 'protocolo-encerrado');
    const coord = await ctx.api.post(`/api/portal/admin/ouvidoria/${protocolos.denuncia}/encerrar`, { motivo: 'Apuração concluída.' }, { usuario: 'u-admin' });
    assert.equal(coord.status, 200);
    const lista = await ctx.api.get('/api/portal/me/ouvidoria?status=encerrado', { usuario: 'u-aluno1' });
    assert.deepEqual(lista.corpo.itens.map(i => i.protocolo), [protocolos.elogio]);
    const da2 = await ctx.api.get('/api/portal/me/ouvidoria?status=encerrado', { usuario: 'u-aluno2' });
    assert.deepEqual(da2.corpo.itens.map(i => i.protocolo), [protocolos.denuncia]);
  });

  test('4ª manifestação na hora → 429', async () => {
    const extra = await ctx.api.post('/api/portal/me/ouvidoria', manifestacao('sugestao'), { usuario: 'u-aluno1' });
    assert.equal(extra.status, 429);
    assert.equal(extra.corpo.codigo, 'limite');
    assert.ok(Number(extra.headers.get('retry-after')) > 0);
  });
});
