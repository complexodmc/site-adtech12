// Portal · F0t — equipe, usuários e docências (PORTAL-API §6.2; casos de §9.3, linha
// portal-base-equipe). Banco em memória + agregador real com os módulos da F0t; nenhum
// Mongo, nenhuma rede (o Resend é um fetch falso). Rode com `npm test` na raiz.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid, SENHA_FIXTURE } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso, fetchFalso } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const { montarPortal, MODULOS_PADRAO } = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin, signToken, tokenValidoPara } = await import('../src/auth.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const { criarTratarErroGlobal } = await import('../src/portal/erros.js');
const { config } = await import('../src/config.js');
const { criarCripto } = await import('../src/portal/cripto.js');
const { aadDoSegredo, codigoTotp, passoAtual } = await import('../src/portal/totp.js');
const { MATERIAL_TESTE, SEGREDO_TOTP_FIXTURE } = await import('./apoio/fixtures-portal.js');
// Importa os módulos antes de criar o banco: os índices únicos deles entram na simulação.
await import('../src/routes/portal-equipe.js');
await import('../src/routes/portal/perfil.js');

const MODULOS_F0T = MODULOS_PADRAO.filter(m => m.fatia === 'F0t');
const ENV_EMAIL = { RESEND_API_KEY: 'chave-falsa', PORTAL_EMAIL_FROM: 'Plataforma <nao-responda@exemplo.invalid>', PORTAL_BASE_URL: 'https://portal.exemplo.invalid' };

async function subirPortal({ env = ENV_EMAIL, prep = async () => {} } = {}) {
  const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
  await semear(banco);
  await prep(banco);
  const fetchImpl = fetchFalso([{ status: 200, json: { id: 'falso' } }]);
  const portal = montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos: criarServicos(), modulos: MODULOS_F0T, configPortal: lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste', ...env }),
    falharCedo: true, log: silencioso, fetchImpl
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  return { api: cliente(base), server, banco, fetchImpl, portal };
}

const reaut = { reautenticacao: { senha: SENHA_FIXTURE } };
const esperar = ms => new Promise(r => setTimeout(r, ms));
const userDe = (banco, nome) => banco.collection('users').findOne({ _id: oid(nome) });

/** Nenhuma resposta da equipe leva hash, segredo ou token de link. */
function semSegredo(corpo) {
  const s = JSON.stringify(corpo);
  assert.doesNotMatch(s, /senhaHash|"segredo"|"hash"|codigosRecuperacao|"pendente"/);
}

describe('equipe: acesso por papel', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('sem sessão → 401; professor e aluno em /portal/admin/* → 403', async () => {
    assert.equal((await ctx.api.get('/api/portal/admin/equipe')).status, 401);
    const p = await ctx.api.get('/api/portal/admin/equipe', { usuario: 'u-prof' });
    assert.equal(p.status, 403, 'requireAdmin (legado) barra quem não é coordenação');
    assert.equal((await ctx.api.post('/api/portal/admin/equipe', { email: 'x@exemplo.invalid', nome: 'X', papel: 'professor' }, { usuario: 'u-aluno1' })).status, 403);
  });

  test('GET /admin/equipe lista professores e coordenação com docências, sem segredo', async () => {
    const r = await ctx.api.get('/api/portal/admin/equipe', { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const ids = r.corpo.itens.map(i => i.id);
    assert.ok(ids.includes(IDS['u-admin']) && ids.includes(IDS['u-prof']) && ids.includes(IDS['u-prof-t1']));
    assert.ok(!ids.includes(IDS['u-aluno1']));
    assert.ok(!ids.includes(IDS['u-ex']), 'professor rebaixado não aparece');
    const prof = r.corpo.itens.find(i => i.id === IDS['u-prof']);
    assert.deepEqual(prof.docencias.map(d => [d.cursoId, d.turmaId]), [['curso-01', null]]);
    const t1 = r.corpo.itens.find(i => i.id === IDS['u-prof-t1']);
    assert.equal(t1.docencias[0].turmaCodigo, 'APE-2026-01');
    semSegredo(r.corpo);
  });

  test('GET /admin/usuarios: q curto → 400; busca por trecho; detalhe com docências e completude', async () => {
    assert.equal((await ctx.api.get('/api/portal/admin/usuarios?q=ab', { usuario: 'u-admin' })).status, 400);
    const r = await ctx.api.get('/api/portal/admin/usuarios?q=aluno', { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.ok(r.corpo.itens.some(i => i.id === IDS['u-aluno1']));
    assert.ok(r.corpo.itens.every(i => /aluno/i.test(i.email + i.nome)));
    const papel = await ctx.api.get('/api/portal/admin/usuarios?papel=professor', { usuario: 'u-admin' });
    assert.deepEqual(papel.corpo.itens.map(i => i.id).sort(), [IDS['u-prof'], IDS['u-prof-t1']].sort());
    const d = await ctx.api.get(`/api/portal/admin/usuarios/${IDS['u-prof']}`, { usuario: 'u-admin' });
    assert.equal(d.status, 200);
    assert.equal(d.corpo.usuario.papel, 'professor');
    assert.equal(d.corpo.docencias[0].cursoTitulo, 'Curso de Teste APE');
    assert.deepEqual(Object.keys(d.corpo.perfil).sort(), ['completo', 'pct']);
    assert.equal((await ctx.api.get('/api/portal/admin/usuarios/nao-e-id', { usuario: 'u-admin' })).status, 404);
    assert.equal((await ctx.api.get('/api/portal/admin/usuarios/000000000000000000000fff', { usuario: 'u-admin' })).status, 404);
    semSegredo(d.corpo);
  });
});

describe('equipe: criar e promover', () => {
  let ctx;
  before(async () => {
    ctx = await subirPortal({
      prep: async (banco) => {
        const h = bcrypt.hashSync('senha-do-signup', 4);
        await banco.collection('users').insertMany([
          { email: 'verificada@exemplo.invalid', nome: 'Conta Verificada', senhaHash: h, isAdmin: false, papel: 'aluno', emailVerificadoEm: new Date(), createdAt: new Date() },
          { email: 'nao-verificada@exemplo.invalid', nome: 'Conta Sem Confirmação', senhaHash: h, isAdmin: false, papel: 'aluno', emailVerificadoEm: null, createdAt: new Date(), sessaoVersao: 0 }
        ]);
      }
    });
  });
  after(() => fechar(ctx.server));

  test('criar professor → 201 com senha temporária exibida UMA vez; só o hash gravado; docência criada; auditoria concluída', async () => {
    const r = await ctx.api.post('/api/portal/admin/equipe', { email: 'Nova.Prof@Exemplo.invalid', nome: 'Professora Nova', papel: 'professor', cursoIds: ['curso-01'] }, { usuario: 'u-admin' });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.criado, true);
    assert.match(r.corpo.senhaTemporaria, /^[2-9A-HJ-NP-Z]{16}$/);
    assert.equal(r.corpo.usuario.email, 'nova.prof@exemplo.invalid');
    assert.equal(r.corpo.usuario.papel, 'professor');
    assert.equal(r.corpo.usuario.senhaTemporaria, true);
    const doc = await ctx.banco.collection('users').findOne({ email: 'nova.prof@exemplo.invalid' });
    assert.ok(await bcrypt.compare(r.corpo.senhaTemporaria, doc.senhaHash));
    assert.ok(!JSON.stringify(doc).includes(r.corpo.senhaTemporaria), 'a senha em claro não é gravada');
    const exp = doc.senhaTemporariaExpiraEm.getTime() - doc.credencialRedefinidaPelaCoordenacaoEm.getTime();
    assert.equal(exp, 72 * 3600 * 1000);
    assert.equal(doc.isAdmin, false);
    const docencia = await ctx.banco.collection('docencias').findOne({ userId: String(doc._id), cursoId: 'curso-01' });
    assert.ok(docencia);
    assert.equal(docencia.turmaId, null);
    const aud = await ctx.banco.collection('auditoria').findOne({ acao: 'usuario.criado_pela_equipe', alvoUserId: String(doc._id) });
    assert.equal(aud.estado, 'concluido');
    assert.equal(aud.extra.emailVerificado, false);
    const lista = await ctx.api.get('/api/portal/admin/equipe', { usuario: 'u-admin' });
    assert.ok(!JSON.stringify(lista.corpo).includes(r.corpo.senhaTemporaria), 'a senha não volta em nenhuma listagem');
    // Nenhum e-mail leva a senha temporária.
    assert.ok(ctx.fetchImpl.chamadas.every(c => !JSON.stringify(c.corpo).includes(r.corpo.senhaTemporaria)));
  });

  test('mesmo papel e nenhum curso novo → 409; curso inexistente → 404; papel aluno → 400', async () => {
    const r = await ctx.api.post('/api/portal/admin/equipe', { email: 'nova.prof@exemplo.invalid', nome: 'Professora Nova', papel: 'professor', cursoIds: ['curso-01'] }, { usuario: 'u-admin' });
    assert.equal(r.status, 409);
    assert.equal((await ctx.api.post('/api/portal/admin/equipe', { email: 'z@exemplo.invalid', nome: 'Z Z', papel: 'professor', cursoIds: ['nao-existe'] }, { usuario: 'u-admin' })).status, 404);
    const p = await ctx.api.post('/api/portal/admin/equipe', { email: 'z@exemplo.invalid', nome: 'Z Z', papel: 'aluno' }, { usuario: 'u-admin' });
    assert.equal(p.status, 400);
    assert.ok(p.corpo.campos.papel);
    const f = await ctx.api.post('/api/portal/admin/equipe', { email: { $gt: '' }, nome: 'Z', papel: 'professor' }, { usuario: 'u-admin' });
    assert.equal(f.status, 400);
    assert.equal(f.corpo.codigo, 'formato-invalido');
  });

  test('promover conta COM e-mail verificado → 200 sem senha nova; cria só as docências que faltam', async () => {
    const r = await ctx.api.post('/api/portal/admin/equipe', { email: 'verificada@exemplo.invalid', nome: 'Ignorado', papel: 'professor', cursoIds: ['curso-02'] }, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.criado, false);
    assert.equal(r.corpo.senhaTemporaria, undefined);
    assert.ok(r.corpo.conta.criadaEm);
    const doc = await ctx.banco.collection('users').findOne({ email: 'verificada@exemplo.invalid' });
    assert.equal(doc.papel, 'professor');
    assert.equal(doc.isAdmin, false);
    assert.ok(await bcrypt.compare('senha-do-signup', doc.senhaHash), 'a senha dela continua');
    assert.equal(await ctx.banco.collection('docencias').countDocuments({ userId: String(doc._id) }), 1);
  });

  test('promover conta SEM e-mail verificado → senha temporária nova; a senha do signup deixa de valer e o token antigo cai', async () => {
    const antes = await ctx.banco.collection('users').findOne({ email: 'nao-verificada@exemplo.invalid' });
    const tokenAntigo = signToken(antes);
    const r = await ctx.api.post('/api/portal/admin/equipe', { email: 'nao-verificada@exemplo.invalid', nome: 'Nome Ignorado', papel: 'professor' }, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.motivoSenha, 'email-nao-verificado');
    assert.match(r.corpo.senhaTemporaria, /^[2-9A-HJ-NP-Z]{16}$/);
    const depois = await ctx.banco.collection('users').findOne({ _id: antes._id });
    assert.equal(await bcrypt.compare('senha-do-signup', depois.senhaHash), false);
    assert.equal(depois.senhaTemporaria, true);
    assert.equal(tokenValidoPara(jwt.verify(tokenAntigo, config.jwtSecret), depois), false);
    await esperar(20);
    assert.ok(ctx.fetchImpl.chamadas.some(c => /Uma senha temporária foi gerada/.test(c.corpo?.subject || '') && c.corpo.to?.[0] === 'nao-verificada@exemplo.invalid'));
  });

  test('criar coordenação exige reautenticação (sem ou com senha errada → 400, nunca 401; nada muda)', async () => {
    const sem = await ctx.api.post('/api/portal/admin/equipe', { email: 'coord2@exemplo.invalid', nome: 'Coord Dois', papel: 'admin' }, { usuario: 'u-admin' });
    assert.equal(sem.status, 400);
    assert.ok(sem.corpo.campos.senha);
    const errada = await ctx.api.post('/api/portal/admin/equipe', { email: 'coord2@exemplo.invalid', nome: 'Coord Dois', papel: 'admin', reautenticacao: { senha: 'errada-123' } }, { usuario: 'u-admin' });
    assert.equal(errada.status, 400);
    assert.ok(errada.corpo.campos.senha);
    assert.equal(await ctx.banco.collection('users').findOne({ email: 'coord2@exemplo.invalid' }), null);
    const ok = await ctx.api.post('/api/portal/admin/equipe', { email: 'coord2@exemplo.invalid', nome: 'Coord Dois', papel: 'admin', ...reaut }, { usuario: 'u-admin' });
    assert.equal(ok.status, 201);
    const doc = await ctx.banco.collection('users').findOne({ email: 'coord2@exemplo.invalid' });
    assert.equal(doc.papel, 'admin');
    assert.equal(doc.isAdmin, true);
  });

  test('auditoria que falha → 503 e nada é criado', async () => {
    ctx.banco.falhar.insertOne = (colecao) => colecao === 'auditoria';
    try {
      const r = await ctx.api.post('/api/portal/admin/equipe', { email: 'nunca@exemplo.invalid', nome: 'Nunca Criada', papel: 'professor' }, { usuario: 'u-admin' });
      assert.equal(r.status, 503);
      assert.equal(r.corpo.codigo, 'auditoria-indisponivel');
    } finally { ctx.banco.falhar.insertOne = false; }
    assert.equal(await ctx.banco.collection('users').findOne({ email: 'nunca@exemplo.invalid' }), null);
  });
});

describe('equipe: papel, senha temporária, 2FA, e-mail, desativar', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('PUT papel: sem reautenticação → 400; admin rebaixando a si → 409 auto-rebaixamento; papel e isAdmin no mesmo $set', async () => {
    assert.equal((await ctx.api.put(`/api/portal/admin/usuarios/${IDS['u-prof']}/papel`, { papel: 'admin' }, { usuario: 'u-admin' })).status, 400);
    const auto = await ctx.api.put(`/api/portal/admin/usuarios/${IDS['u-admin']}/papel`, { papel: 'aluno', ...reaut }, { usuario: 'u-admin' });
    assert.equal(auto.status, 409);
    assert.equal(auto.corpo.codigo, 'auto-rebaixamento');
    const r = await ctx.api.put(`/api/portal/admin/usuarios/${IDS['u-prof']}/papel`, { papel: 'admin', ...reaut }, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    let u = await userDe(ctx.banco, 'u-prof');
    assert.deepEqual([u.papel, u.isAdmin], ['admin', true]);
    const volta = await ctx.api.put(`/api/portal/admin/usuarios/${IDS['u-prof']}/papel`, { papel: 'professor', motivo: 'Correção do papel atribuído', ...reaut }, { usuario: 'u-admin' });
    assert.equal(volta.status, 200);
    u = await userDe(ctx.banco, 'u-prof');
    assert.deepEqual([u.papel, u.isAdmin], ['professor', false]);
    const aud = await ctx.banco.collection('auditoria').find({ acao: 'usuario.papel_alterado', alvoUserId: IDS['u-prof'] }).toArray();
    assert.equal(aud.length, 2);
    assert.ok(aud.every(a => a.estado === 'concluido'));
  });

  test('senha temporária: para admin → 403; motivo curto → 400; aluno → 72 h, sessão antiga cai e aviso ao titular', async () => {
    assert.equal((await ctx.api.post(`/api/portal/admin/usuarios/${IDS['u-admin']}/senha-temporaria`, { motivo: 'Perdeu o acesso à conta', ...reaut }, { usuario: 'u-admin' })).status, 403);
    assert.equal((await ctx.api.post(`/api/portal/admin/usuarios/${IDS['u-aluno1']}/senha-temporaria`, { motivo: 'curto', ...reaut }, { usuario: 'u-admin' })).status, 400);
    const antes = await userDe(ctx.banco, 'u-aluno1');
    const r = await ctx.api.post(`/api/portal/admin/usuarios/${IDS['u-aluno1']}/senha-temporaria`, { motivo: 'Aluna perdeu o acesso ao e-mail', ...reaut }, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    const depois = await userDe(ctx.banco, 'u-aluno1');
    assert.equal(new Date(r.corpo.expiraEm).getTime() - depois.credencialRedefinidaPelaCoordenacaoEm.getTime(), 72 * 3600 * 1000);
    assert.equal((depois.sessaoVersao || 0), (antes.sessaoVersao || 0) + 1);
    assert.ok(await bcrypt.compare(r.corpo.senhaTemporaria, depois.senhaHash));
    await esperar(20);
    assert.ok(ctx.fetchImpl.chamadas.some(c => c.corpo?.to?.[0] === antes.email && /senha temporária/i.test(c.corpo.subject)));
    assert.ok(ctx.fetchImpl.chamadas.every(c => !JSON.stringify(c.corpo).includes(r.corpo.senhaTemporaria)));
  });

  test('2FA redefinido e e-mail trocado pela coordenação gravam credencialRedefinidaPelaCoordenacaoEm e avisam', async () => {
    const r = await ctx.api.post(`/api/portal/admin/usuarios/${IDS['u-2fa']}/2fa/redefinir`, { motivo: 'Perdeu o aparelho autenticador', ...reaut }, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    const u = await userDe(ctx.banco, 'u-2fa');
    assert.equal(u.doisFatoresAtivo, false);
    assert.ok(u.credencialRedefinidaPelaCoordenacaoEm instanceof Date);
    const d2 = await ctx.banco.collection('auth_2fa').findOne({ userId: IDS['u-2fa'] });
    assert.equal(d2.ativo, false);
    assert.equal(d2.segredo, null);
    const antigo = (await userDe(ctx.banco, 'u-aluno2')).email;
    const e = await ctx.api.put(`/api/portal/admin/usuarios/${IDS['u-aluno2']}/email`, { email: 'novo.aluno2@exemplo.invalid', motivo: 'Pedido do aluno pelo atendimento', ...reaut }, { usuario: 'u-admin' });
    assert.equal(e.status, 200);
    const a2 = await userDe(ctx.banco, 'u-aluno2');
    assert.equal(a2.email, 'novo.aluno2@exemplo.invalid');
    assert.equal(a2.emailVerificadoEm, null);
    assert.ok(a2.credencialRedefinidaPelaCoordenacaoEm instanceof Date);
    const emUso = await ctx.api.put(`/api/portal/admin/usuarios/${IDS['u-aluno1']}/email`, { email: 'novo.aluno2@exemplo.invalid', motivo: 'Teste de e-mail em uso', ...reaut }, { usuario: 'u-admin' });
    assert.equal(emUso.status, 409);
    assert.equal(emUso.corpo.codigo, 'email-em-uso');
    await esperar(20);
    assert.ok(ctx.fetchImpl.chamadas.some(c => c.corpo?.to?.[0] === antigo && /e-mail da sua conta foi alterado/i.test(c.corpo.subject)), 'aviso vai ao endereço ANTIGO');
    assert.ok(ctx.fetchImpl.chamadas.some(c => /duas etapas/i.test(c.corpo?.subject || '')));
  });

  test('desativar derruba a sessão (sessaoVersao++), a si mesmo → 409; reativar', async () => {
    assert.equal((await ctx.api.post(`/api/portal/admin/usuarios/${IDS['u-admin']}/desativar`, { motivo: 'Teste de auto desativação', ...reaut }, { usuario: 'u-admin' })).corpo.codigo, 'auto-rebaixamento');
    const antes = await userDe(ctx.banco, 'u-intruso');
    const r = await ctx.api.post(`/api/portal/admin/usuarios/${IDS['u-intruso']}/desativar`, { motivo: 'Conta criada por engano', ...reaut }, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.ok(r.corpo.usuario.desativadoEm);
    const depois = await userDe(ctx.banco, 'u-intruso');
    assert.equal((depois.sessaoVersao || 0), (antes.sessaoVersao || 0) + 1);
    assert.equal((await ctx.api.get('/api/portal/me/perfil', { usuario: 'u-intruso' })).status, 401, 'conta desativada segue anônima');
    const re = await ctx.api.post(`/api/portal/admin/usuarios/${IDS['u-intruso']}/reativar`, { motivo: 'Reativada após conferência' }, { usuario: 'u-admin' });
    assert.equal(re.status, 200);
    assert.equal(re.corpo.usuario.desativadoEm, null);
  });
});

describe('reautenticação da coordenação com 2FA (A07: sem força bruta do código)', () => {
  const adminCom2fa = async (banco) => {
    const cripto = criarCripto({ material: MATERIAL_TESTE });
    await banco.collection('users').updateOne({ _id: oid('u-admin') }, { $set: { doisFatoresAtivo: true } });
    await banco.collection('auth_2fa').insertOne({
      userId: IDS['u-admin'], ativo: true, segredo: cripto.cifrar(SEGREDO_TOTP_FIXTURE, 'totp', aadDoSegredo(IDS['u-admin'])),
      pendente: null, pendenteCriadoEm: null, ativadoEm: new Date(), ultimoPasso: 0, codigos: []
    });
  };
  const com = (codigo) => ({ reautenticacao: { senha: SENHA_FIXTURE, ...(codigo === undefined ? {} : { codigo }) } });

  test('senha certa + código errado: 10 × 400 campos.codigo e a 11ª → 429 muitas-tentativas no contador 2fa:<userId>; depois nem o código certo passa em nenhuma ação; nada muda; auditoria e sessão derrubada', async () => {
    const ctx = await subirPortal({ env: { ...ENV_EMAIL, PORTAL_2FA: '1' }, prep: adminCom2fa });
    try {
      const k = `2fa:${IDS['u-admin']}`;
      const papel = (p, corpo) => ctx.api.put(`/api/portal/admin/usuarios/${IDS['u-prof']}/papel`, { papel: p, ...corpo }, { usuario: 'u-admin' });
      const p0 = passoAtual(Date.now());
      // O caminho legítimo continua: código certo → 200.
      const ok = await papel('professor', com(codigoTotp(SEGREDO_TOTP_FIXTURE, p0)));
      assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
      // Sem código: 400 campos.codigo, sem contar (não é palpite).
      const sem = await papel('admin', com());
      assert.equal(sem.status, 400);
      assert.ok(sem.corpo.campos?.codigo);
      assert.equal(await ctx.banco.collection('limites').findOne({ chave: k }), null);
      const sv0 = (await userDe(ctx.banco, 'u-admin')).sessaoVersao || 0;
      const st = [];
      let ultimo;
      for (let i = 0; i < 11; i++) {
        ultimo = await papel('admin', com('000000'));
        st.push(ultimo.status);
        if (ultimo.status === 400) assert.ok(ultimo.corpo.campos?.codigo, JSON.stringify(ultimo.corpo));
      }
      assert.deepEqual(st, [...Array(10).fill(400), 429], st.join(','));
      assert.equal(ultimo.corpo.codigo, 'muitas-tentativas');
      // Bloqueado por 1 h: o código certo (passo seguinte, ainda não usado) é recusado aqui e nas outras ações críticas.
      const certo = codigoTotp(SEGREDO_TOTP_FIXTURE, p0 + 1);
      assert.equal((await papel('admin', com(certo))).status, 429);
      const tmp = await ctx.api.post(`/api/portal/admin/usuarios/${IDS['u-aluno1']}/senha-temporaria`, { motivo: 'Aluna perdeu o acesso ao e-mail', ...com(certo) }, { usuario: 'u-admin' });
      assert.equal(tmp.status, 429);
      assert.notEqual((await userDe(ctx.banco, 'u-aluno1')).senhaTemporaria, true);
      const u = await userDe(ctx.banco, 'u-prof');
      assert.deepEqual([u.papel, u.isAdmin === true], ['professor', false], 'o alvo não foi promovido');
      const lim = await ctx.banco.collection('limites').findOne({ chave: k });
      assert.ok(lim?.bloqueadoAte instanceof Date && lim.bloqueadoAte > new Date());
      // Detecção: falhas auditadas, um bloqueio, sessões da coordenação derrubadas, aviso ao titular.
      const falhas = await ctx.banco.collection('auditoria').find({ acao: 'auth.2fa_falha', alvoUserId: IDS['u-admin'] }).toArray();
      assert.equal(falhas.length, 11);
      assert.ok(falhas.every(f => f.extra?.contexto === 'reautenticacao'));
      assert.equal(await ctx.banco.collection('auditoria').countDocuments({ acao: 'auth.2fa_bloqueado', alvoUserId: IDS['u-admin'] }), 1);
      assert.equal((await userDe(ctx.banco, 'u-admin')).sessaoVersao || 0, sv0 + 1);
      await esperar(20);
      const adminEmail = (await userDe(ctx.banco, 'u-admin')).email;
      assert.equal(ctx.fetchImpl.chamadas.filter(c => c.corpo?.to?.[0] === adminEmail && /Tentativas de código bloqueadas/.test(c.corpo?.subject || '')).length, 1);
    } finally { await fechar(ctx.server); }
  });

  test('senha errada não gasta o 2fa:<userId> (segue no contador da senha); com o bloqueio do 2FA ativo, nem a senha é conferida', async () => {
    const ctx = await subirPortal({ env: { ...ENV_EMAIL, PORTAL_2FA: '1' }, prep: adminCom2fa });
    try {
      const k = `2fa:${IDS['u-admin']}`;
      const r = await ctx.api.put(`/api/portal/admin/usuarios/${IDS['u-prof']}/papel`, { papel: 'admin', reautenticacao: { senha: 'errada-123', codigo: '000000' } }, { usuario: 'u-admin' });
      assert.equal(r.status, 400);
      assert.ok(r.corpo.campos?.senha);
      assert.equal(await ctx.banco.collection('limites').findOne({ chave: k }), null);
      await ctx.banco.collection('limites').insertOne({ chave: k, n: 11, expiraEm: new Date(Date.now() + 3600e3), bloqueadoAte: new Date(Date.now() + 3600e3) });
      const antes = await ctx.banco.collection('limites').findOne({ chave: `senha-logado:${IDS['u-admin']}` });
      const b = await ctx.api.put(`/api/portal/admin/usuarios/${IDS['u-prof']}/papel`, { papel: 'admin', reautenticacao: { senha: 'errada-456', codigo: '000000' } }, { usuario: 'u-admin' });
      assert.equal(b.status, 429);
      assert.equal(b.corpo.codigo, 'muitas-tentativas');
      const depois = await ctx.banco.collection('limites').findOne({ chave: `senha-logado:${IDS['u-admin']}` });
      assert.equal(depois?.n, antes?.n, 'bloqueado: a senha nem é conferida');
    } finally { await fechar(ctx.server); }
  });
});

describe('docências e visão do professor', () => {
  let ctx;
  before(async () => {
    ctx = await subirPortal({
      prep: async (banco) => {
        // Aluno só com liberação (sem matrícula): visível à docência geral, não à de turma.
        await banco.collection('users').insertOne({ _id: oid('000000000000000000000a10'), email: 'so-liberado@exemplo.invalid', nome: 'Aluno Só Liberado', senhaHash: 'x', isAdmin: false, papel: 'aluno', createdAt: new Date() });
        await banco.collection('liberacoes').insertOne({ userId: '000000000000000000000a10', cursoId: 'curso-01', grantedAt: new Date(), grantedBy: IDS['u-admin'] });
        await banco.collection('perfis').insertOne({ userId: IDS['u-aluno1'], nomeRegistro: 'Aluna Um Registro', nomeSocial: 'Aluna Social', cpf: '52998224725', endereco: { cidade: 'São Paulo' }, versao: 1 });
      }
    });
  });
  after(() => fechar(ctx.server));

  test('docência: de aluno → 409; duplicada → 409; turma de outro curso → 400; curso inexistente → 404; criar e remover auditados', async () => {
    const aluno = await ctx.api.post('/api/portal/admin/docencias', { userId: IDS['u-aluno1'], cursoId: 'curso-01' }, { usuario: 'u-admin' });
    assert.equal(aluno.status, 409);
    const dup = await ctx.api.post('/api/portal/admin/docencias', { userId: IDS['u-prof'], cursoId: 'curso-01' }, { usuario: 'u-admin' });
    assert.equal(dup.status, 409);
    const outro = await ctx.api.post('/api/portal/admin/docencias', { userId: IDS['u-prof'], cursoId: 'curso-02', turmaId: IDS.T1 }, { usuario: 'u-admin' });
    assert.equal(outro.status, 400);
    assert.equal(outro.corpo.codigo, 'turma-de-outro-curso');
    assert.equal((await ctx.api.post('/api/portal/admin/docencias', { userId: IDS['u-prof'], cursoId: 'nao-existe' }, { usuario: 'u-admin' })).status, 404);
    const ok = await ctx.api.post('/api/portal/admin/docencias', { userId: IDS['u-prof'], cursoId: 'curso-02' }, { usuario: 'u-admin' });
    assert.equal(ok.status, 201);
    assert.equal(ok.corpo.docencia.cursoId, 'curso-02');
    const del = await ctx.api.del(`/api/portal/admin/docencias/${ok.corpo.docencia.id}`, { usuario: 'u-admin' });
    assert.equal(del.status, 200);
    assert.equal((await ctx.api.del(`/api/portal/admin/docencias/${ok.corpo.docencia.id}`, { usuario: 'u-admin' })).status, 404);
    const auds = await ctx.banco.collection('auditoria').find({ acao: { $in: ['docencia.criada', 'docencia.removida'] } }).toArray();
    assert.deepEqual(auds.map(a => a.estado), ['concluido', 'concluido']);
  });

  test('GET /professor/cursos: docência geral e de turma; admin vê todos', async () => {
    const p = await ctx.api.get('/api/portal/professor/cursos', { usuario: 'u-prof' });
    assert.deepEqual(p.corpo.itens.map(i => [i.id, i.escopo]), [['curso-01', 'curso']]);
    const t1 = await ctx.api.get('/api/portal/professor/cursos', { usuario: 'u-prof-t1' });
    assert.deepEqual(t1.corpo.itens.map(i => [i.id, i.escopo, i.turmaIds]), [['curso-01', 'turmas', [IDS.T1]]]);
    const a = await ctx.api.get('/api/portal/professor/cursos', { usuario: 'u-admin' });
    assert.deepEqual(a.corpo.itens.map(i => i.id), ['curso-01', 'curso-02']);
    assert.equal((await ctx.api.get('/api/portal/professor/cursos', { usuario: 'u-ex' })).status, 403, 'rebaixado perde acesso');
  });

  test('resumo do aluno: professor vê só id, nome, nome social, e-mail e foto; 404 sem vínculo; admin vê mais', async () => {
    const r = await ctx.api.get(`/api/portal/professor/alunos/${IDS['u-aluno1']}/resumo`, { usuario: 'u-prof' });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.corpo).sort(), ['email', 'fotoUrl', 'id', 'nome', 'nomeSocial']);
    assert.equal(r.corpo.nomeSocial, 'Aluna Social');
    assert.doesNotMatch(JSON.stringify(r.corpo), /52998224725|cpf|endereco/i);
    assert.equal((await ctx.api.get(`/api/portal/professor/alunos/${IDS['u-intruso']}/resumo`, { usuario: 'u-prof' })).status, 404);
    const adm = await ctx.api.get(`/api/portal/professor/alunos/${IDS['u-aluno1']}/resumo`, { usuario: 'u-admin' });
    assert.ok(Object.hasOwn(adm.corpo, 'perfilCompleto') && Object.hasOwn(adm.corpo, 'papel'));
  });

  test('docente só de turma (u-prof-t1): vê aluno da T1; não vê o da T2 nem o só liberado', async () => {
    assert.equal((await ctx.api.get(`/api/portal/professor/alunos/${IDS['u-aluno1']}/resumo`, { usuario: 'u-prof-t1' })).status, 200);
    assert.equal((await ctx.api.get(`/api/portal/professor/alunos/${IDS['u-aluno2']}/resumo`, { usuario: 'u-prof-t1' })).status, 404);
    assert.equal((await ctx.api.get('/api/portal/professor/alunos/000000000000000000000a10/resumo', { usuario: 'u-prof-t1' })).status, 404);
    assert.equal((await ctx.api.get('/api/portal/professor/alunos/000000000000000000000a10/resumo', { usuario: 'u-prof' })).status, 200);
  });

  test('foto do aluno: 404 sem foto ou sem vínculo', async () => {
    assert.equal((await ctx.api.get(`/api/portal/professor/alunos/${IDS['u-aluno1']}/foto`, { usuario: 'u-prof' })).status, 404);
    assert.equal((await ctx.api.get(`/api/portal/professor/alunos/${IDS['u-intruso']}/foto`, { usuario: 'u-prof' })).status, 404);
  });
});
