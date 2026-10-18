// Portal · F0a — papéis, publicUser (contrato com a sessão 2d), JWT com `sv`
// e 12 h para admin, loadUser/tokenValidoPara, requireAdmin legado e os
// parâmetros opcionais do throttle. Sem MongoDB: banco em memória e
// buscarUsuario injetado. Rode com `npm test` na raiz.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { PAPEIS, ROTULOS_PAPEL, papelDe, ehAdmin, ehProfessor, ehEquipe } from '../src/portal/papeis.js';
import { criarThrottle } from '../src/throttle.js';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, criarAppDeTeste } from './apoio/http.js';
import { relogio } from './apoio/falsos.js';

// auth.js importa config.js (exige as variáveis abaixo) e db.js (nenhuma conexão é aberta).
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const auth = await import('../src/auth.js');
const { config } = await import('../src/config.js');
const { default: authRoutes } = await import('../src/routes/auth.js');

/** Cópia literal do publicUser ANTERIOR ao portal: é o contrato que a 2d consome. */
function publicUserLegado(user) {
  const nome = user.nome || user.email.split('@')[0];
  return {
    id: String(user._id),
    email: user.email,
    nome,
    iniciais: nome.split(/[\s.@]/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join(''),
    isAdmin: !!user.isAdmin
  };
}

const CAMPOS_2D = ['id', 'email', 'nome', 'iniciais', 'isAdmin'];
const CAMPOS_NOVOS = ['papel', 'precisaTrocarSenha', 'temFoto', 'doisFatoresAtivo', 'emailVerificado'];

const docUser = (extras = {}) => ({ _id: new ObjectId(), email: 'pessoa@exemplo.invalid', nome: 'Pessoa de Teste', isAdmin: false, ...extras });

// ---------- papéis ----------
describe('papeis.js', () => {
  test('constantes', () => {
    assert.deepEqual([...PAPEIS], ['aluno', 'professor', 'admin']);
    assert.equal(ROTULOS_PAPEL.admin, 'Coordenação');
    assert.ok(Object.isFrozen(PAPEIS) && Object.isFrozen(ROTULOS_PAPEL));
  });

  test('papelDe: isAdmin manda; papel:"admin" sem isAdmin → aluno; ausente → aluno; null → null', () => {
    assert.equal(papelDe(null), null);
    assert.equal(papelDe(undefined), null);
    assert.equal(papelDe({ isAdmin: true }), 'admin');
    assert.equal(papelDe({ isAdmin: true, papel: 'aluno' }), 'admin', 'isAdmin vence o papel gravado');
    assert.equal(papelDe({ isAdmin: true, papel: 'professor' }), 'admin');
    assert.equal(papelDe({ papel: 'admin' }), 'aluno', 'papel:"admin" sem isAdmin não dá privilégio (DC-17)');
    assert.equal(papelDe({ papel: 'admin', isAdmin: 'true' }), 'aluno', 'só isAdmin === true');
    assert.equal(papelDe({ papel: 'professor' }), 'professor');
    assert.equal(papelDe({ papel: 'aluno' }), 'aluno');
    assert.equal(papelDe({}), 'aluno', 'conta antiga sem papel');
    assert.equal(papelDe({ papel: 'qualquer' }), 'aluno');
  });

  test('ehAdmin / ehProfessor / ehEquipe', () => {
    assert.equal(ehAdmin({ isAdmin: true }), true);
    assert.equal(ehAdmin({ papel: 'admin' }), false);
    assert.equal(ehProfessor({ papel: 'professor' }), true);
    assert.equal(ehProfessor({ isAdmin: true, papel: 'professor' }), false, 'admin não é "professor" no papel efetivo');
    assert.equal(ehEquipe({ papel: 'professor' }), true);
    assert.equal(ehEquipe({ isAdmin: true }), true);
    assert.equal(ehEquipe({ papel: 'aluno' }), false);
    assert.equal(ehEquipe(null), false);
  });
});

// ---------- publicUser (contrato da 2d) ----------
describe('publicUser — contrato com a sessão 2d', () => {
  const amostras = [
    docUser(),
    docUser({ nome: '', email: 'sem.nome@exemplo.invalid' }),
    docUser({ nome: 'Ana', isAdmin: true, papel: 'admin' }),
    docUser({ nome: 'José da Silva Souza', papel: 'professor' }),
    docUser({ nome: 'maria.luiza', isAdmin: undefined }),
    docUser({ nome: 'Conta Temporária', senhaTemporaria: true, temFoto: true, doisFatoresAtivo: true, emailVerificadoEm: new Date() })
  ];

  test('os 5 campos atuais continuam idênticos e na mesma ordem', () => {
    for (const u of amostras) {
      const novo = auth.publicUser(u);
      assert.deepEqual(Object.keys(novo).slice(0, 5), CAMPOS_2D);
      const legado = publicUserLegado(u);
      for (const k of CAMPOS_2D) assert.deepEqual(novo[k], legado[k], `campo ${k}`);
    }
  });

  test('só GANHA campos: papel, precisaTrocarSenha, temFoto, doisFatoresAtivo, emailVerificado', () => {
    const novo = auth.publicUser(docUser());
    assert.deepEqual(Object.keys(novo), [...CAMPOS_2D, ...CAMPOS_NOVOS]);
    assert.deepEqual(
      CAMPOS_NOVOS.map(k => novo[k]),
      ['aluno', false, false, false, false],
      'conta comum: aluno e flags falsas'
    );
  });

  test('valores dos campos novos', () => {
    const p = auth.publicUser(amostras[5]);
    assert.equal(p.precisaTrocarSenha, true);
    assert.equal(p.temFoto, true);
    assert.equal(p.doisFatoresAtivo, true);
    assert.equal(p.emailVerificado, true);
    assert.equal(auth.publicUser(amostras[2]).papel, 'admin');
    assert.equal(auth.publicUser(amostras[3]).papel, 'professor');
    assert.equal(auth.publicUser(docUser({ papel: 'admin' })).papel, 'aluno', 'papel coerente com isAdmin');
    assert.equal(auth.publicUser(docUser({ senhaTemporaria: 'sim' })).precisaTrocarSenha, false, 'só true literal');
  });

  test('nunca expõe senhaHash nem campos internos', () => {
    const p = auth.publicUser(docUser({ senhaHash: '$2a$12$x', sessaoVersao: 4, desativadoEm: null, credencialRedefinidaPelaCoordenacaoEm: new Date() }));
    const json = JSON.stringify(p);
    assert.ok(!/senhaHash|sessaoVersao|\$2a\$|credencial/.test(json), json);
  });
});

describe('GET /api/auth/me (router legado real) — só ganhou campos', () => {
  let srv;
  let api;
  before(async () => {
    const banco = criarBancoMemoria();
    await semear(banco);
    const app = criarAppDeTeste({ banco, montar: (a) => a.use('/api/auth', authRoutes) });
    srv = await subir(app);
    api = cliente(srv.base);
  });
  after(() => fechar(srv?.server));

  test('aluno: { user } com os 5 campos de sempre + os novos', async () => {
    const r = await api.get('/api/auth/me', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.corpo), ['user']);
    assert.deepEqual(Object.keys(r.corpo.user), [...CAMPOS_2D, ...CAMPOS_NOVOS]);
    assert.equal(r.corpo.user.id, IDS['u-aluno1']);
    assert.equal(r.corpo.user.isAdmin, false);
    assert.equal(r.corpo.user.papel, 'aluno');
  });

  test('papel por conta: admin, professor, conta antiga sem papel, ex-professor', async () => {
    const papel = async u => (await api.get('/api/auth/me', { usuario: u })).corpo.user.papel;
    assert.equal(await papel('u-admin'), 'admin');
    assert.equal(await papel('u-prof'), 'professor');
    assert.equal(await papel('u-intruso'), 'aluno');
    assert.equal(await papel('u-ex'), 'aluno');
  });

  test('senha temporária e 2FA aparecem nas flags', async () => {
    assert.equal((await api.get('/api/auth/me', { usuario: 'u-temp' })).corpo.user.precisaTrocarSenha, true);
    assert.equal((await api.get('/api/auth/me', { usuario: 'u-2fa' })).corpo.user.doisFatoresAtivo, true);
  });

  test('sem sessão continua 401 com a mensagem de sempre', async () => {
    const r = await api.get('/api/auth/me');
    assert.equal(r.status, 401);
    assert.deepEqual(r.corpo, { error: 'Sessão expirada. Faça login novamente.' });
  });
});

// ---------- JWT ----------
describe('signToken — sv e validade por papel', () => {
  const duracao = token => { const p = jwt.decode(token); return p.exp - p.iat; };
  const duracaoConfig = () => duracao(jwt.sign({}, 'x', { expiresIn: config.jwtExpiresIn }));

  test('admin (isAdmin) recebe 12 h', () => {
    assert.equal(auth.JWT_ADMIN_EXPIRA, '12h');
    assert.equal(duracao(auth.signToken(docUser({ isAdmin: true, papel: 'admin' }))), 12 * 3600);
    assert.equal(duracao(auth.signToken(docUser({ isAdmin: true }))), 12 * 3600, 'admin antigo sem papel gravado');
  });

  test('aluno, professor e papel:"admin" sem isAdmin seguem a validade configurada (7 dias por padrão)', () => {
    const esperado = duracaoConfig();
    if (!process.env.JWT_EXPIRES_IN) assert.equal(esperado, 7 * 24 * 3600);
    assert.equal(duracao(auth.signToken(docUser())), esperado);
    assert.equal(duracao(auth.signToken(docUser({ papel: 'professor' }))), esperado);
    assert.equal(duracao(auth.signToken(docUser({ papel: 'admin' }))), esperado);
  });

  test('payload: sub, email e sv (padrão 0)', () => {
    const u = docUser({ sessaoVersao: 3 });
    const p = jwt.verify(auth.signToken(u), config.jwtSecret);
    assert.equal(p.sub, String(u._id));
    assert.equal(p.email, u.email);
    assert.equal(p.sv, 3);
    assert.equal(jwt.decode(auth.signToken(docUser())).sv, 0);
  });
});

describe('tokenValidoPara (pura)', () => {
  const u = docUser();
  test('sem sv no token e sem sessaoVersao no usuário → válido (tokens antigos)', () => {
    assert.equal(auth.tokenValidoPara({ sub: String(u._id) }, u), true);
  });
  test('sv igual → válido; divergente → inválido', () => {
    assert.equal(auth.tokenValidoPara({ sub: String(u._id), sv: 2 }, { ...u, sessaoVersao: 2 }), true);
    assert.equal(auth.tokenValidoPara({ sub: String(u._id), sv: 1 }, { ...u, sessaoVersao: 2 }), false);
    assert.equal(auth.tokenValidoPara({ sub: String(u._id) }, { ...u, sessaoVersao: 1 }), false, 'token sem sv vale 0');
  });
  test('conta desativada → inválido', () => {
    assert.equal(auth.tokenValidoPara({ sub: String(u._id), sv: 0 }, { ...u, desativadoEm: new Date() }), false);
  });
  test('dono diferente ou entradas vazias → inválido', () => {
    assert.equal(auth.tokenValidoPara({ sub: String(new ObjectId()) }, u), false);
    assert.equal(auth.tokenValidoPara(null, u), false);
    assert.equal(auth.tokenValidoPara({ sub: String(u._id) }, null), false);
  });
});

describe('loadUser — sv divergente e conta desativada seguem anônimos', () => {
  const SEGREDO = 'segredo-do-teste-loaduser';
  let banco;
  let srv;
  let api;
  let buscas = 0;

  before(async () => {
    banco = criarBancoMemoria();
    await semear(banco);
    const app = express();
    app.use(auth.criarLoadUser({
      jwtSecret: SEGREDO,
      buscarUsuario: (id) => { buscas++; return banco.collection('users').findOne({ _id: id }); }
    }));
    app.get('/quem', (req, res) => res.json({ id: req.user ? String(req.user._id) : null }));
    app.get('/protegida', auth.requireAuth, (_req, res) => res.json({ ok: true }));
    app.get('/admin', auth.requireAdmin, (_req, res) => res.json({ ok: true }));
    srv = await subir(app);
    api = cliente(srv.base);
  });
  after(() => fechar(srv?.server));

  const tokenDe = (nome, extras = {}, opcoes = { expiresIn: '1h' }) =>
    jwt.sign({ sub: IDS[nome], email: `${nome}@exemplo.invalid`, ...extras }, SEGREDO, opcoes);

  test('sem token: anônimo e nenhuma consulta', async () => {
    const antes = buscas;
    assert.deepEqual((await api.get('/quem')).corpo, { id: null });
    assert.equal(buscas, antes);
  });

  test('token antigo SEM sv continua válido', async () => {
    assert.deepEqual((await api.get('/quem', { token: tokenDe('u-aluno1') })).corpo, { id: IDS['u-aluno1'] });
  });

  test('sv divergente da sessaoVersao → anônimo (401 na rota protegida)', async () => {
    await banco.collection('users').updateOne({ _id: oid('u-aluno2') }, { $set: { sessaoVersao: 2 } });
    assert.deepEqual((await api.get('/quem', { token: tokenDe('u-aluno2', { sv: 1 }) })).corpo, { id: null });
    assert.equal((await api.get('/protegida', { token: tokenDe('u-aluno2', { sv: 1 }) })).status, 401);
    assert.equal((await api.get('/protegida', { token: tokenDe('u-aluno2', { sv: 2 }) })).status, 200);
    assert.equal((await api.get('/protegida', { token: tokenDe('u-aluno2') })).status, 401, 'sem sv = 0 ≠ 2');
  });

  test('conta desativada → anônimo', async () => {
    await banco.collection('users').updateOne({ _id: oid('u-intruso') }, { $set: { desativadoEm: new Date() } });
    assert.deepEqual((await api.get('/quem', { token: tokenDe('u-intruso') })).corpo, { id: null });
  });

  test('token expirado, de outro segredo, malformado ou de usuário inexistente → anônimo', async () => {
    const r = relogio('2020-01-01T00:00:00Z');
    const expirado = jwt.sign({ sub: IDS['u-aluno1'], iat: Math.floor(r.ms() / 1000) }, SEGREDO, { expiresIn: '1h' });
    assert.deepEqual((await api.get('/quem', { token: expirado })).corpo, { id: null });
    assert.deepEqual((await api.get('/quem', { token: jwt.sign({ sub: IDS['u-aluno1'] }, 'outro') })).corpo, { id: null });
    assert.deepEqual((await api.get('/quem', { token: 'nao.e.jwt' })).corpo, { id: null });
    assert.deepEqual((await api.get('/quem', { token: jwt.sign({ sub: 'xyz' }, SEGREDO) })).corpo, { id: null });
    assert.deepEqual((await api.get('/quem', { token: jwt.sign({ sub: String(new ObjectId()) }, SEGREDO) })).corpo, { id: null });
  });

  test('requireAdmin continua lendo só isAdmin: professor e papel:"admin" sem isAdmin → 403', async () => {
    await banco.collection('users').updateOne({ _id: oid('u-aluno1') }, { $set: { papel: 'admin' } });
    assert.equal((await api.get('/admin', { token: tokenDe('u-aluno1') })).status, 403);
    const prof = await api.get('/admin', { token: tokenDe('u-prof') });
    assert.equal(prof.status, 403);
    assert.deepEqual(prof.corpo, { error: 'Acesso restrito a administradores.' });
    assert.equal((await api.get('/admin', { token: tokenDe('u-admin') })).status, 200);
    assert.equal((await api.get('/admin')).status, 401);
  });

  test('loadUser exportado continua sendo middleware de 3 parâmetros', () => {
    assert.equal(typeof auth.loadUser, 'function');
    assert.equal(auth.loadUser.length, 3);
    assert.throws(() => auth.criarLoadUser({}), /buscarUsuario/);
  });
});

// ---------- throttle: parâmetros opcionais ----------
describe('criarThrottle — chave e codigo opcionais', () => {
  let srv;
  let api;
  let srv2;
  let api2;
  const r2 = relogio('2026-10-18T12:00:00Z');
  before(async () => {
    const app = express();
    app.set('trust proxy', false);
    app.post('/padrao', criarThrottle({ janelaMs: 60_000, max: 2 }), (_req, res) => res.json({ ok: true }));
    app.post('/por-usuario', (req, _res, next) => { req.user = { _id: req.get('x-u') }; next(); },
      criarThrottle({ janelaMs: 60_000, max: 1, chave: req => 'u:' + String(req.user._id), codigo: 'limite', mensagem: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }),
      (_req, res) => res.json({ ok: true }));
    srv = await subir(app);
    api = cliente(srv.base);
    const app2 = express();
    app2.post('/x', criarThrottle({ janelaMs: 10_000, max: 1, agora: r2.ms }), (_req, res) => res.json({ ok: true }));
    srv2 = await subir(app2);
    api2 = cliente(srv2.base);
  });
  after(async () => { await fechar(srv?.server); await fechar(srv2?.server); });

  test('sem chave/codigo: resposta idêntica à de antes ({ error } + Retry-After)', async () => {
    assert.equal((await api.post('/padrao')).status, 200);
    assert.equal((await api.post('/padrao')).status, 200);
    const r = await api.post('/padrao');
    assert.equal(r.status, 429);
    assert.deepEqual(r.corpo, { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
    assert.match(r.headers.get('retry-after'), /^\d+$/);
  });

  test('chave por usuário separa contas e codigo vai no corpo', async () => {
    assert.equal((await api.post('/por-usuario', {}, { headers: { 'x-u': 'a' } })).status, 200);
    assert.equal((await api.post('/por-usuario', {}, { headers: { 'x-u': 'b' } })).status, 200, 'outra conta, mesmo IP');
    const r = await api.post('/por-usuario', {}, { headers: { 'x-u': 'a' } });
    assert.equal(r.status, 429);
    assert.deepEqual(r.corpo, { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.', codigo: 'limite' });
    assert.ok(Number(r.headers.get('retry-after')) >= 1);
  });

  test('relógio injetado: a janela reabre', async () => {
    assert.equal((await api2.post('/x')).status, 200);
    const bloqueado = await api2.post('/x');
    assert.equal(bloqueado.status, 429);
    assert.equal(bloqueado.headers.get('retry-after'), '10');
    r2.avancar(10_001);
    assert.equal((await api2.post('/x')).status, 200);
  });
});
