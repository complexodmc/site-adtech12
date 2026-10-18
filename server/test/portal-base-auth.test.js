// Portal · F0t — autenticação ampliada (PORTAL-API §6.1, §4.16, §10; casos de §9.3, linha
// portal-base-auth). Banco em memória; bcrypt espião; Resend falso; relógio controlável.
// O signin é o handler que o routes/auth.js usa (criarHandlerSignin), montado ANTES do
// agregador como no server.js. Nenhum Mongo, nenhuma rede.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid, SENHA_FIXTURE, SEGREDO_TOTP_FIXTURE, CODIGOS_RECUPERACAO_FIXTURE } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso, fetchFalso, gerarCpfValido, relogio } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const { montarPortal, MODULOS_PADRAO } = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin, criarLoadUser } = await import('../src/auth.js');
const { config } = await import('../src/config.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const { criarTratarErroGlobal, idDaRequisicao } = await import('../src/portal/erros.js');
const { criarContadorPersistente } = await import('../src/portal/limitador.js');
const { criarAuditoria } = await import('../src/portal/auditoria.js');
const { criarEnviadorEmail } = await import('../src/portal/email.js');
const { criarCripto } = await import('../src/portal/cripto.js');
const { codigoTotp, passoAtual } = await import('../src/portal/totp.js');
const AE = await import('../src/routes/portal/auth-extra.js');
await import('../src/routes/portal/perfil.js');

const MODULOS_F0T = MODULOS_PADRAO.filter(m => m.fatia === 'F0t');
const ENV_EMAIL = { RESEND_API_KEY: 'chave-falsa', PORTAL_EMAIL_FROM: 'Plataforma <nao-responda@exemplo.invalid>', PORTAL_BASE_URL: 'https://portal.exemplo.invalid' };
const esperar = ms => new Promise(r => setTimeout(r, ms));
const HASH_FICTICIO_TESTE = bcrypt.hashSync('ficticio', 4);

/**
 * App no formato do server.js: JSON → loadUser real (token) + usuário de teste → signin legado
 * (handler da F0t) → agregador → 404 → erro global. `semPortal` sobe só o signin.
 */
async function subirAuth({ env = ENV_EMAIL, prep = async () => {}, agora = null, fetchRoteiro = [{ status: 200, json: { id: 'falso' } }], semPortal = false, modulos = MODULOS_F0T } = {}) {
  const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
  await semear(banco);
  await prep(banco);
  const relogioOuReal = agora || (() => new Date());
  const repo = n => banco.collection(n);
  const fetchImpl = fetchFalso(fetchRoteiro);
  const cfg = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste', ...env });
  const comparacoes = [];
  const dormidas = [];
  const espiao = async (s, h) => { comparacoes.push(h); return bcrypt.compare(s, h); };
  const autenticador = AE.criarAutenticador({
    repo, contador: criarContadorPersistente({ repo, agora: relogioOuReal }), auditoria: criarAuditoria({ repo, agora: relogioOuReal, log: silencioso }),
    email: criarEnviadorEmail({ resendApiKey: cfg.resendApiKey, de: cfg.emailDe, fetchImpl, log: silencioso, hmac: v => criarCripto({ material: 'segredo-de-teste' }).hmacIdentificador(v) }),
    configPortal: cfg, agora: relogioOuReal, checkSenha: espiao, hashFicticio: HASH_FICTICIO_TESTE, dormir: async ms => { dormidas.push(ms); },
    cripto: criarCripto({ material: 'segredo-de-teste' })
  });
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', criarLoadUser({ buscarUsuario: id => banco.collection('users').findOne({ _id: id }), jwtSecret: config.jwtSecret }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.post('/api/auth/signin', idDaRequisicao, AE.criarHandlerSignin(() => autenticador));
  let portal = null;
  if (!semPortal) {
    portal = montarPortal({
      getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
      servicos: criarServicos(), modulos, configPortal: cfg, falharCedo: false, log: silencioso, fetchImpl, agora: relogioOuReal
    });
    app.use('/api', portal);
  }
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  return { api: cliente(base), server, banco, fetchImpl, comparacoes, dormidas, portal, cfg };
}

const entrar = (api, identificador, senha = SENHA_FIXTURE, ip = '10.0.0.1') => api.post('/api/auth/signin', { email: identificador, senha }, { headers: { 'x-forwarded-for': ip } });
const comToken = token => ({ token });
const linkDo = (fetchImpl, tipo, para) => {
  const c = [...fetchImpl.chamadas].reverse().find(x => x.corpo?.to?.[0] === para);
  const m = c && new RegExp(`acesso-link\\.html#${tipo}=([A-Za-z0-9_-]+)`).exec(c.corpo.text);
  return m ? m[1] : null;
};

describe('signin: e-mail ou CPF, tempo constante, mensagens', () => {
  let ctx;
  const cpf = gerarCpfValido('login-cpf');
  before(async () => {
    ctx = await subirAuth({
      prep: async (banco) => {
        await banco.collection('perfis').insertOne({ userId: IDS['u-aluno1'], nomeRegistro: 'Aluna Um', cpf, versao: 1 });
        await banco.collection('users').updateOne({ _id: oid('u-aluno2') }, { $set: { desativadoEm: new Date() } });
      }
    });
  });
  after(() => fechar(ctx.server));

  test('por e-mail e por CPF (com ou sem máscara) → 200 { token, user } com papel; JWT 7 dias (aluno) e 12 h (admin)', async () => {
    const e = await entrar(ctx.api, 'Aluno1@Exemplo.invalid');
    assert.equal(e.status, 200);
    assert.equal(e.corpo.user.id, IDS['u-aluno1']);
    assert.equal(e.corpo.user.papel, 'aluno');
    for (const k of ['precisaTrocarSenha', 'temFoto', 'doisFatoresAtivo', 'emailVerificado']) assert.ok(Object.hasOwn(e.corpo.user, k), k);
    const p = jwt.decode(e.corpo.token);
    assert.equal(p.exp - p.iat, 7 * 24 * 3600);
    const c1 = await entrar(ctx.api, cpf);
    assert.equal(c1.status, 200);
    assert.equal(c1.corpo.user.id, IDS['u-aluno1']);
    const c2 = await entrar(ctx.api, `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`);
    assert.equal(c2.status, 200);
    const a = await entrar(ctx.api, 'admin@exemplo.invalid');
    const pa = jwt.decode(a.corpo.token);
    assert.equal(pa.exp - pa.iat, 12 * 3600);
    assert.equal(a.corpo.user.papel, 'admin');
    assert.ok((await ctx.banco.collection('users').findOne({ _id: oid('u-aluno1') })).ultimoLoginEm instanceof Date);
    assert.doesNotMatch(JSON.stringify(e.corpo), /senhaHash/);
  });

  test('CPF com DV inválido, conta inexistente e senha errada → o MESMO 401; conta desativada → 403 só com a senha certa', async () => {
    const respostas = await Promise.all([entrar(ctx.api, '12345678900', SENHA_FIXTURE, '10.1.0.1'), entrar(ctx.api, 'ninguem@exemplo.invalid', SENHA_FIXTURE, '10.1.0.2'), entrar(ctx.api, 'aluno1@exemplo.invalid', 'errada-123', '10.1.0.3')]);
    for (const r of respostas) {
      assert.equal(r.status, 401);
      assert.equal(r.corpo.error, 'E-mail/CPF ou senha inválidos.');
      assert.equal(r.corpo.codigo, 'credenciais-invalidas');
      assert.match(r.corpo.requestId, /^r-[a-f0-9]{12}$/);
    }
    const des = await entrar(ctx.api, 'aluno2@exemplo.invalid', SENHA_FIXTURE, '10.1.0.4');
    assert.equal(des.status, 403);
    assert.equal(des.corpo.codigo, 'conta-desativada');
    assert.equal((await entrar(ctx.api, 'aluno2@exemplo.invalid', 'errada-123', '10.1.0.4')).status, 401);
  });

  test('espião no bcrypt: exatamente 1 comparação por tentativa (existente, inexistente, CPF inválido, desativada)', async () => {
    for (const id of ['aluno1@exemplo.invalid', 'ninguem@exemplo.invalid', '11111111111', 'aluno2@exemplo.invalid']) {
      ctx.comparacoes.length = 0;
      await entrar(ctx.api, id, 'qualquer-senha-1', '10.2.0.1');
      assert.equal(ctx.comparacoes.length, 1, id);
    }
  });

  test('formato: objeto no lugar do e-mail → 400 formato-invalido (nada de injeção de operador)', async () => {
    const r = await ctx.api.post('/api/auth/signin', { email: { $gt: '' }, senha: 'x' });
    assert.equal(r.status, 400);
    assert.equal(r.corpo.codigo, 'formato-invalido');
  });
});

describe('signin: limites persistentes por identificador + rede', () => {
  test('11ª falha da mesma rede → 429 (também para conta inexistente); a senha certa de OUTRA rede entra', async () => {
    const ctx = await subirAuth();
    try {
      for (const id of ['aluno1@exemplo.invalid', 'fantasma@exemplo.invalid']) {
        const st = [];
        for (let i = 0; i < 11; i++) st.push((await entrar(ctx.api, id, 'errada-123', '10.9.9.9')).status);
        assert.deepEqual(st, [...Array(10).fill(401), 429], id);
      }
      const bloqueado = await entrar(ctx.api, 'aluno1@exemplo.invalid', SENHA_FIXTURE, '10.9.9.200');
      assert.equal(bloqueado.status, 429, 'a mesma rede /24 continua bloqueada, até com a senha certa');
      assert.ok(bloqueado.headers.get('retry-after'));
      assert.equal((await entrar(ctx.api, 'aluno1@exemplo.invalid', SENHA_FIXTURE, '172.16.0.1')).status, 200);
      const chaves = (await ctx.banco.collection('limites').find({}).toArray()).map(l => l.chave);
      assert.ok(chaves.length > 0);
      assert.ok(chaves.every(k => !k.includes('@') && !k.includes('aluno1') && !k.includes('fantasma')), chaves.join(','));
    } finally { await fechar(ctx.server); }
  });

  test('21 falhas de redes diferentes → nunca 429 para a senha certa; atraso crescente e 1 e-mail de aviso ao titular', async () => {
    const ctx = await subirAuth();
    try {
      for (let i = 0; i < 21; i++) assert.equal((await entrar(ctx.api, 'aluno1@exemplo.invalid', 'errada-123', `10.${i}.0.1`)).status, 401);
      assert.ok(ctx.dormidas.length >= 15);
      assert.equal(Math.max(...ctx.dormidas), 3000);
      assert.equal(ctx.dormidas[0], 250);
      assert.equal((await entrar(ctx.api, 'aluno1@exemplo.invalid', SENHA_FIXTURE, '192.168.50.1')).status, 200);
      await esperar(30);
      const avisos = ctx.fetchImpl.chamadas.filter(c => /Tentativas de acesso/.test(c.corpo?.subject || ''));
      assert.equal(avisos.length, 1);
      assert.equal(avisos[0].corpo.to[0], 'aluno1@exemplo.invalid');
      assert.equal(await ctx.banco.collection('auditoria').countDocuments({ acao: 'auth.tentativas_de_acesso' }), 1);
      const falhas = await ctx.banco.collection('auditoria').find({ acao: 'auth.login_falha' }).toArray();
      assert.equal(falhas.length, 4, 'a cada 5ª falha');
      assert.ok(falhas.every(a => !JSON.stringify(a).includes('aluno1@')));
    } finally { await fechar(ctx.server); }
  });

  test('senha temporária vencida (+73 h) → 401; dentro do prazo → 200 com precisaTrocarSenha', async () => {
    const r = relogio('2026-10-18T12:00:00.000Z');
    const ctx = await subirAuth({ agora: r });
    try {
      const ok = await entrar(ctx.api, 'temp@exemplo.invalid');
      assert.equal(ok.status, 200);
      assert.equal(ok.corpo.user.precisaTrocarSenha, true);
      r.avancar(73 * 3600 * 1000);
      assert.equal((await entrar(ctx.api, 'temp@exemplo.invalid')).status, 401);
    } finally { await fechar(ctx.server); }
  });

  test('signin num app SEM montarPortal → 200 / 401 / 429', async () => {
    const ctx = await subirAuth({ semPortal: true });
    try {
      assert.equal((await entrar(ctx.api, 'aluno1@exemplo.invalid')).status, 200);
      let st;
      for (let i = 0; i < 11; i++) st = (await entrar(ctx.api, 'aluno1@exemplo.invalid', 'errada-123', '10.7.7.7')).status;
      assert.equal(st, 429);
      assert.equal((await entrar(ctx.api, 'aluno1@exemplo.invalid', 'errada-123', '10.8.8.8')).status, 401);
    } finally { await fechar(ctx.server); }
  });
});

describe('verificação em duas etapas', () => {
  test('signin de conta com 2FA → segundoFator sem token; TOTP certo → token; passo reusado → 401; recuperação vale 1×', async () => {
    const ctx = await subirAuth();
    try {
      const s = await entrar(ctx.api, '2fa@exemplo.invalid');
      assert.equal(s.status, 200);
      assert.equal(s.corpo.segundoFator, true);
      assert.equal(s.corpo.token, undefined);
      assert.equal(s.corpo.user, undefined);
      assert.deepEqual(s.corpo.metodos, ['totp', 'recuperacao']);
      const codigo = codigoTotp(SEGREDO_TOTP_FIXTURE, passoAtual(Date.now()));
      const v = await ctx.api.post('/api/auth/2fa/verificar', { desafio: s.corpo.desafio, codigo });
      assert.equal(v.status, 200, JSON.stringify(v.corpo));
      assert.ok(v.corpo.token);
      assert.equal(v.corpo.codigosRestantes, 10);
      const s2 = await entrar(ctx.api, '2fa@exemplo.invalid');
      const reuso = await ctx.api.post('/api/auth/2fa/verificar', { desafio: s2.corpo.desafio, codigo });
      assert.equal(reuso.status, 401);
      assert.equal(reuso.corpo.codigo, 'codigo-invalido');
      const rec = await ctx.api.post('/api/auth/2fa/verificar', { desafio: s2.corpo.desafio, codigo: CODIGOS_RECUPERACAO_FIXTURE[0].toLowerCase() });
      assert.equal(rec.status, 200);
      assert.equal(rec.corpo.codigosRestantes, 9);
      const s3 = await entrar(ctx.api, '2fa@exemplo.invalid');
      assert.equal((await ctx.api.post('/api/auth/2fa/verificar', { desafio: s3.corpo.desafio, codigo: CODIGOS_RECUPERACAO_FIXTURE[0] })).status, 401, 'recuperação é de uso único');
      assert.equal((await ctx.api.post('/api/auth/2fa/verificar', { desafio: 'x'.repeat(43), codigo })).status, 410);
      const doc = await ctx.banco.collection('auth_2fa').findOne({ userId: IDS['u-2fa'] });
      assert.doesNotMatch(JSON.stringify([s.corpo, v.corpo, rec.corpo]), new RegExp(`${SEGREDO_TOTP_FIXTURE}|${doc.codigos[1].hash}`));
    } finally { await fechar(ctx.server); }
  });

  test('corrida: dois verificar simultâneos com o mesmo código → só 1 token; recuperação em corrida também 1×', async () => {
    const ctx = await subirAuth();
    try {
      const s = await entrar(ctx.api, '2fa@exemplo.invalid');
      const codigo = codigoTotp(SEGREDO_TOTP_FIXTURE, passoAtual(Date.now()) + 1);
      const rs = await Promise.all([1, 2].map(() => ctx.api.post('/api/auth/2fa/verificar', { desafio: s.corpo.desafio, codigo })));
      assert.equal(rs.filter(r => r.status === 200).length, 1, rs.map(r => r.status).join(','));
      const s2 = await entrar(ctx.api, '2fa@exemplo.invalid');
      const rec = await Promise.all([1, 2].map(() => ctx.api.post('/api/auth/2fa/verificar', { desafio: s2.corpo.desafio, codigo: CODIGOS_RECUPERACAO_FIXTURE[5] })));
      assert.equal(rec.filter(r => r.status === 200).length, 1);
    } finally { await fechar(ctx.server); }
  });

  test('5 erros no mesmo desafio → 410; 11ª falha na hora (somando desafios) → 429 e auditoria auth.2fa_bloqueado', async () => {
    const ctx = await subirAuth();
    try {
      const s = await entrar(ctx.api, '2fa@exemplo.invalid');
      const st = [];
      // IPs diferentes: o limite em memória por IP (10/15 min) não interfere no limite por CONTA.
      const ip = i => ({ headers: { 'x-forwarded-for': `10.60.${i}.1` } });
      for (let i = 0; i < 6; i++) st.push((await ctx.api.post('/api/auth/2fa/verificar', { desafio: s.corpo.desafio, codigo: '000000' }, ip(i))).status);
      assert.deepEqual(st, [401, 401, 401, 401, 401, 410]);
      let ultimo;
      for (let i = 0; i < 6; i++) {
        const d = await entrar(ctx.api, '2fa@exemplo.invalid');
        ultimo = await ctx.api.post('/api/auth/2fa/verificar', { desafio: d.corpo.desafio, codigo: '000000' }, ip(10 + i));
        if (ultimo.status === 429) break;
      }
      assert.equal(ultimo.status, 429);
      assert.equal(ultimo.corpo.codigo, 'muitas-tentativas');
      assert.equal(await ctx.banco.collection('auditoria').countDocuments({ acao: 'auth.2fa_bloqueado' }), 1);
      const d = await entrar(ctx.api, '2fa@exemplo.invalid');
      const certo = await ctx.api.post('/api/auth/2fa/verificar', { desafio: d.corpo.desafio, codigo: codigoTotp(SEGREDO_TOTP_FIXTURE, passoAtual(Date.now())) }, ip(30));
      assert.equal(certo.status, 429, 'bloqueado por 1 h, até com o código certo');
    } finally { await fechar(ctx.server); }
  });

  test('segredo ilegível → 409 2fa-indisponivel (nunca 500, nunca token)', async () => {
    const ctx = await subirAuth({ prep: async b => { await b.collection('auth_2fa').updateOne({ userId: IDS['u-2fa'] }, { $set: { segredo: { v: 1, alg: 'A256GCM', kid: 'deadbeef', iv: 'AAAA', tag: 'AAAA', ct: 'AAAA' } } }); } });
    try {
      const s = await entrar(ctx.api, '2fa@exemplo.invalid');
      const r = await ctx.api.post('/api/auth/2fa/verificar', { desafio: s.corpo.desafio, codigo: '123456' });
      assert.equal(r.status, 409);
      assert.equal(r.corpo.codigo, '2fa-indisponivel');
      assert.equal(r.corpo.token, undefined);
    } finally { await fechar(ctx.server); }
  });

  test('sem PORTAL_2FA: iniciar → 409 2fa-desligado e recursos.doisFatores:false; com PORTAL_2FA: iniciar → ativar → 10 códigos e sessão nova', async () => {
    const sem = await subirAuth();
    try {
      assert.equal((await sem.api.get('/api/auth/recursos')).corpo.doisFatores, false);
      const r = await sem.api.post('/api/auth/2fa/iniciar', { senha: SENHA_FIXTURE }, { usuario: 'u-aluno1' });
      assert.equal(r.status, 409);
      assert.equal(r.corpo.codigo, '2fa-desligado');
      assert.equal((await sem.api.post('/api/auth/2fa/iniciar', { senha: SENHA_FIXTURE })).status, 401);
    } finally { await fechar(sem.server); }
    const com = await subirAuth({ env: { ...ENV_EMAIL, PORTAL_2FA: '1' } });
    try {
      assert.equal((await com.api.get('/api/auth/recursos')).corpo.doisFatores, true);
      assert.equal((await com.api.post('/api/auth/2fa/iniciar', { senha: 'errada-123' }, { usuario: 'u-aluno1' })).status, 400);
      const ini = await com.api.post('/api/auth/2fa/iniciar', { senha: SENHA_FIXTURE }, { usuario: 'u-aluno1' });
      assert.equal(ini.status, 200);
      assert.match(ini.corpo.otpauthUri, /^otpauth:\/\/totp\/Plataforma%20Complexo%20DMC:/);
      assert.equal((await com.api.post('/api/auth/2fa/ativar', { codigo: '000000' }, { usuario: 'u-aluno1' })).status, 400);
      const at = await com.api.post('/api/auth/2fa/ativar', { codigo: codigoTotp(ini.corpo.segredo, passoAtual(Date.now())) }, { usuario: 'u-aluno1' });
      assert.equal(at.status, 200);
      assert.equal(at.corpo.codigosRecuperacao.length, 10);
      assert.ok(at.corpo.codigosRecuperacao.every(c => /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(c)));
      const u = await com.banco.collection('users').findOne({ _id: oid('u-aluno1') });
      assert.equal(u.doisFatoresAtivo, true);
      assert.equal(jwt.decode(at.corpo.token).sv, u.sessaoVersao);
      const d = await com.banco.collection('auth_2fa').findOne({ userId: IDS['u-aluno1'] });
      assert.ok(!JSON.stringify(d).includes(ini.corpo.segredo), 'segredo só cifrado');
      assert.ok(!JSON.stringify(d).includes(at.corpo.codigosRecuperacao[0]), 'códigos só como HMAC');
      const g = await com.api.get('/api/auth/2fa', { usuario: 'u-aluno1' });
      assert.deepEqual([g.corpo.ativo, g.corpo.codigosRestantes, g.corpo.disponivel], [true, 10, true]);
    } finally { await fechar(com.server); }
  });
});

describe('link mágico, recuperação e e-mail', () => {
  test('sem e-mail configurado → 503 email-indisponivel ANTES de consultar a conta; recursos refletem e-mail e baseUrl', async () => {
    const ctx = await subirAuth({ env: {} });
    try {
      assert.deepEqual((await ctx.api.get('/api/auth/recursos')).corpo, { loginPorCpf: true, linkMagico: false, recuperacaoSenha: false, doisFatores: false, senhaTemporariaPelaCoordenacao: true });
      ctx.banco.falhar.findOne = 'users';
      try {
        const r = await ctx.api.post('/api/auth/link-magico', { email: 'aluno1@exemplo.invalid' });
        assert.equal(r.status, 503);
        assert.equal(r.corpo.codigo, 'email-indisponivel');
        assert.equal((await ctx.api.post('/api/auth/senha/esqueci', { email: 'aluno1@exemplo.invalid' })).corpo.codigo, 'email-indisponivel');
      } finally { ctx.banco.falhar.findOne = false; }
    } finally { await fechar(ctx.server); }
  });

  test('com e-mail: 202 genérico; link usa PORTAL_BASE_URL mesmo com Host forjado; conta inexistente → 202 sem envio; provedor que nunca responde → 202 em < 1 s', async () => {
    const ctx = await subirAuth();
    try {
      assert.equal((await ctx.api.get('/api/auth/recursos')).corpo.linkMagico, true);
      const r = await ctx.api.post('/api/auth/link-magico', { email: 'aluno1@exemplo.invalid' }, { headers: { host: 'evil.example' } });
      assert.equal(r.status, 202);
      assert.equal(r.corpo.mensagem, AE.MENSAGEM_LINK_ENVIADO);
      await esperar(20);
      const c = ctx.fetchImpl.chamadas.at(-1);
      assert.match(c.corpo.text, /https:\/\/portal\.exemplo\.invalid\/plataforma-ead\/acesso-link\.html#acesso=[A-Za-z0-9_-]{40,}/);
      assert.doesNotMatch(c.corpo.text, /evil\.example/);
      const antes = ctx.fetchImpl.chamadas.length;
      const n = await ctx.api.post('/api/auth/link-magico', { email: 'ninguem@exemplo.invalid' });
      assert.equal(n.status, 202);
      assert.deepEqual(n.corpo, r.corpo);
      await esperar(20);
      assert.equal(ctx.fetchImpl.chamadas.length, antes);
      const tok = await ctx.banco.collection('auth_tokens').findOne({ tipo: 'link_magico' });
      assert.match(tok.hash, /^[a-f0-9]{64}$/);
      assert.ok(!c.corpo.text.includes(tok.hash), 'o banco guarda só o sha256');
    } finally { await fechar(ctx.server); }
    const lento = await subirAuth({ fetchRoteiro: 'nunca' });
    try {
      const t0 = Date.now();
      const r = await lento.api.post('/api/auth/senha/esqueci', { email: 'aluno1@exemplo.invalid' });
      assert.equal(r.status, 202);
      assert.ok(Date.now() - t0 < 1000);
    } finally { await fechar(lento.server); }
  });

  test('consumir link mágico: uso único (também em corrida), grava emailVerificadoEm; +16 min → 410', async () => {
    const r = relogio('2026-10-18T12:00:00.000Z');
    const ctx = await subirAuth({ agora: r });
    try {
      await ctx.api.post('/api/auth/link-magico', { email: 'aluno1@exemplo.invalid' });
      await esperar(20);
      const t1 = linkDo(ctx.fetchImpl, 'acesso', 'aluno1@exemplo.invalid');
      const rs = await Promise.all([1, 2].map(() => ctx.api.post('/api/auth/link-magico/consumir', { token: t1 })));
      assert.deepEqual(rs.map(x => x.status).sort(), [200, 410]);
      const ok = rs.find(x => x.status === 200);
      assert.ok(ok.corpo.token);
      assert.ok((await ctx.banco.collection('users').findOne({ _id: oid('u-aluno1') })).emailVerificadoEm instanceof Date);
      await ctx.api.post('/api/auth/link-magico', { email: 'aluno2@exemplo.invalid' });
      await esperar(20);
      const t2 = linkDo(ctx.fetchImpl, 'acesso', 'aluno2@exemplo.invalid');
      r.avancar(16 * 60 * 1000);
      const venc = await ctx.api.post('/api/auth/link-magico/consumir', { token: t2 });
      assert.equal(venc.status, 410);
      assert.equal(venc.corpo.codigo, 'link-invalido');
      // O link não dispensa o 2FA.
      await ctx.api.post('/api/auth/link-magico', { email: '2fa@exemplo.invalid' });
      await esperar(20);
      const t3 = linkDo(ctx.fetchImpl, 'acesso', '2fa@exemplo.invalid');
      const d = await ctx.api.post('/api/auth/link-magico/consumir', { token: t3 });
      assert.equal(d.corpo.segundoFator, true);
      assert.equal(d.corpo.token, undefined);
    } finally { await fechar(ctx.server); }
  });

  test('redefinir senha: senha curta → 400 sem gastar o token; sessaoVersao++ e o token antigo cai; não loga', async () => {
    const ctx = await subirAuth();
    try {
      const login = await entrar(ctx.api, 'aluno1@exemplo.invalid');
      assert.equal((await ctx.api.get('/api/portal/me/perfil', comToken(login.corpo.token))).status, 200);
      await ctx.api.post('/api/auth/senha/esqueci', { email: 'aluno1@exemplo.invalid' });
      await esperar(20);
      const t = linkDo(ctx.fetchImpl, 'redefinir', 'aluno1@exemplo.invalid');
      assert.ok(t);
      const curta = await ctx.api.post('/api/auth/senha/redefinir', { token: t, novaSenha: 'curta' });
      assert.equal(curta.status, 400);
      assert.ok(curta.corpo.campos.novaSenha);
      const igualEmail = await ctx.api.post('/api/auth/senha/redefinir', { token: t, novaSenha: 'aluno1@exemplo.invalid' });
      assert.equal(igualEmail.status, 400);
      const ok = await ctx.api.post('/api/auth/senha/redefinir', { token: t, novaSenha: 'nova-senha-forte-1' });
      assert.equal(ok.status, 200);
      assert.deepEqual(ok.corpo, { ok: true });
      assert.equal((await ctx.api.get('/api/portal/me/perfil', comToken(login.corpo.token))).status, 401, 'token antigo cai');
      assert.equal((await entrar(ctx.api, 'aluno1@exemplo.invalid', 'nova-senha-forte-1', '10.3.3.3')).status, 200);
      assert.equal((await ctx.api.post('/api/auth/senha/redefinir', { token: t, novaSenha: 'outra-senha-forte-2' })).status, 410);
      const u = await ctx.banco.collection('users').findOne({ _id: oid('u-aluno1') });
      assert.equal(u.senhaOrigem, 'titular');
      assert.ok(u.emailVerificadoEm instanceof Date);
    } finally { await fechar(ctx.server); }
  });

  test('verificar e-mail: link #verificar= de 24 h → emailVerificadoEm; já verificado → 409', async () => {
    const ctx = await subirAuth();
    try {
      const r = await ctx.api.post('/api/portal/me/email/verificacao', {}, { usuario: 'u-aluno1' });
      assert.equal(r.status, 202);
      await esperar(20);
      const t = linkDo(ctx.fetchImpl, 'verificar', 'aluno1@exemplo.invalid');
      const v = await ctx.api.post('/api/auth/email/verificar', { token: t });
      assert.equal(v.status, 200);
      assert.ok((await ctx.banco.collection('users').findOne({ _id: oid('u-aluno1') })).emailVerificadoEm instanceof Date);
      assert.equal((await ctx.api.post('/api/auth/email/verificar', { token: t })).status, 410);
      assert.equal((await ctx.api.post('/api/portal/me/email/verificacao', {}, { usuario: 'u-aluno1' })).status, 409);
    } finally { await fechar(ctx.server); }
  });
});

describe('troca de senha, encerrar sessões e senha de quem está logado', () => {
  test('trocar: senha atual errada → 400 (nunca 401); > 72 bytes → 400; certa → token novo e as outras sessões caem', async () => {
    const ctx = await subirAuth();
    try {
      const a = await entrar(ctx.api, 'aluno1@exemplo.invalid', SENHA_FIXTURE, '10.4.0.1');
      const b = await entrar(ctx.api, 'aluno1@exemplo.invalid', SENHA_FIXTURE, '10.4.0.2');
      const errada = await ctx.api.post('/api/auth/senha/trocar', { senhaAtual: 'errada-123', novaSenha: 'nova-senha-forte-1' }, comToken(a.corpo.token));
      assert.equal(errada.status, 400);
      assert.equal(errada.corpo.campos.senhaAtual, 'Senha atual incorreta.');
      const longa = await ctx.api.post('/api/auth/senha/trocar', { senhaAtual: SENHA_FIXTURE, novaSenha: 'ã'.repeat(40) }, comToken(a.corpo.token));
      assert.equal(longa.status, 400);
      const ok = await ctx.api.post('/api/auth/senha/trocar', { senhaAtual: SENHA_FIXTURE, novaSenha: 'nova-senha-forte-1' }, comToken(a.corpo.token));
      assert.equal(ok.status, 200);
      assert.equal((await ctx.api.get('/api/portal/me/perfil', comToken(ok.corpo.token))).status, 200, 'esta aba segue logada');
      assert.equal((await ctx.api.get('/api/portal/me/perfil', comToken(b.corpo.token))).status, 401, 'as outras caem');
      assert.equal((await ctx.banco.collection('users').findOne({ _id: oid('u-aluno1') })).senhaOrigem, 'titular');
    } finally { await fechar(ctx.server); }
  });

  test('senha temporária: troca liberada, o resto bloqueado; depois da troca senhaOrigem = apos_temporaria', async () => {
    const ctx = await subirAuth();
    try {
      const l = await entrar(ctx.api, 'temp@exemplo.invalid');
      assert.equal((await ctx.api.get('/api/portal/me/perfil', comToken(l.corpo.token))).corpo.codigo, 'troca-de-senha-obrigatoria');
      const r = await ctx.api.post('/api/auth/senha/trocar', { senhaAtual: SENHA_FIXTURE, novaSenha: 'senha-definitiva-1' }, comToken(l.corpo.token));
      assert.equal(r.status, 200);
      const u = await ctx.banco.collection('users').findOne({ _id: oid('u-temp') });
      assert.equal(u.senhaOrigem, 'apos_temporaria');
      assert.equal(u.senhaTemporaria, undefined);
      assert.equal((await ctx.api.get('/api/portal/me/perfil', comToken(r.corpo.token))).status, 200);
    } finally { await fechar(ctx.server); }
  });

  test('6ª senha errada somando senha/trocar, 2fa/iniciar e sessoes/encerrar-outras → 429, sessões derrubadas e e-mail ao titular', async () => {
    const ctx = await subirAuth({ env: { ...ENV_EMAIL, PORTAL_2FA: '1' } });
    try {
      const st = [];
      const u = { usuario: 'u-aluno1' };
      st.push((await ctx.api.post('/api/auth/senha/trocar', { senhaAtual: 'errada-1', novaSenha: 'nova-senha-forte-1' }, u)).status);
      st.push((await ctx.api.post('/api/auth/2fa/iniciar', { senha: 'errada-2' }, u)).status);
      st.push((await ctx.api.post('/api/auth/sessoes/encerrar-outras', { senha: 'errada-3' }, u)).status);
      st.push((await ctx.api.post('/api/auth/senha/trocar', { senhaAtual: 'errada-4', novaSenha: 'nova-senha-forte-1' }, u)).status);
      st.push((await ctx.api.post('/api/auth/2fa/iniciar', { senha: 'errada-5' }, u)).status);
      const antes = (await ctx.banco.collection('users').findOne({ _id: oid('u-aluno1') })).sessaoVersao || 0;
      st.push((await ctx.api.post('/api/auth/sessoes/encerrar-outras', { senha: 'errada-6' }, u)).status);
      assert.deepEqual(st, [400, 400, 400, 400, 400, 429]);
      const depois = (await ctx.banco.collection('users').findOne({ _id: oid('u-aluno1') })).sessaoVersao || 0;
      assert.equal(depois, antes + 1);
      await esperar(20);
      assert.ok(ctx.fetchImpl.chamadas.some(c => /Sessão encerrada/.test(c.corpo?.subject || '')));
    } finally { await fechar(ctx.server); }
  });

  test('encerrar outras sessões: token novo vale, o antigo cai', async () => {
    const ctx = await subirAuth();
    try {
      const a = await entrar(ctx.api, 'aluno1@exemplo.invalid');
      const r = await ctx.api.post('/api/auth/sessoes/encerrar-outras', { senha: SENHA_FIXTURE }, comToken(a.corpo.token));
      assert.equal(r.status, 200);
      assert.equal((await ctx.api.get('/api/portal/me/perfil', comToken(a.corpo.token))).status, 401);
      assert.equal((await ctx.api.get('/api/portal/me/perfil', comToken(r.corpo.token))).status, 200);
    } finally { await fechar(ctx.server); }
  });
});

describe('routes/auth.js (legado) delega o signin à F0t', () => {
  test('criarRotaAuth: signup grava papel aluno e emailVerificadoEm null; /me inalterado + papel; signin por CPF', async () => {
    const { criarRotaAuth } = await import('../src/routes/auth.js');
    assert.equal(typeof criarRotaAuth, 'function');
    const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
    await semear(banco);
    const cpf = gerarCpfValido('legado');
    await banco.collection('perfis').insertOne({ userId: IDS['u-aluno1'], nomeRegistro: 'Aluna', cpf, versao: 1 });
    const repo = n => banco.collection(n);
    const autenticador = AE.criarAutenticador({
      repo, contador: criarContadorPersistente({ repo }), auditoria: criarAuditoria({ repo, log: silencioso }), email: null,
      configPortal: lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' }), hashFicticio: HASH_FICTICIO_TESTE, dormir: async () => {},
      cripto: criarCripto({ material: 'segredo-de-teste' })
    });
    // Agregador com um módulo que lança no montar (DC-74): o signin REAL continua respondendo.
    const portal = montarPortal({
      getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin], servicos: criarServicos(),
      configPortal: lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' }), falharCedo: false, log: silencioso,
      modulos: [{ caminho: 'routes/teste/quebra.js', fatia: 'TESTE', importar: async () => ({ default: async () => { throw new Error('montar falhou de propósito'); } }) }]
    });
    const app = express();
    app.use(express.json());
    app.use('/api', criarLoadUser({ buscarUsuario: id => banco.collection('users').findOne({ _id: id }), jwtSecret: config.jwtSecret }));
    app.use('/api/auth', criarRotaAuth({ users: () => banco.collection('users'), signin: AE.criarHandlerSignin(() => autenticador) }));
    app.use('/api', portal);
    app.use(criarTratarErroGlobal({ log: silencioso }));
    const { server, base } = await subir(app);
    try {
      const api = cliente(base);
      const s = await api.post('/api/auth/signup', { email: 'Novo@Exemplo.invalid', senha: '123456', nome: 'Pessoa Nova' });
      assert.equal(s.status, 201);
      assert.deepEqual(Object.keys(s.corpo).sort(), ['token', 'user']);
      assert.equal(s.corpo.user.papel, 'aluno');
      const doc = await banco.collection('users').findOne({ email: 'novo@exemplo.invalid' });
      assert.equal(doc.papel, 'aluno');
      assert.equal(doc.emailVerificadoEm, null);
      assert.equal(doc.isAdmin, false);
      assert.equal((await api.post('/api/auth/signup', { email: 'novo@exemplo.invalid', senha: '123456' })).status, 409);
      assert.equal((await api.post('/api/auth/signup', { email: 'x@exemplo.invalid', senha: '123' })).status, 400);
      const me = await api.get('/api/auth/me', { token: s.corpo.token });
      assert.equal(me.status, 200);
      assert.equal(me.corpo.user.email, 'novo@exemplo.invalid');
      assert.equal(me.corpo.user.papel, 'aluno');
      assert.equal((await api.get('/api/auth/me')).status, 401);
      assert.equal((await api.post('/api/auth/signin', { email: cpf, senha: SENHA_FIXTURE })).status, 200);
      assert.equal((await api.post('/api/auth/signin', { email: 'novo@exemplo.invalid', senha: '123456' })).status, 200);
      assert.equal((await api.post('/api/auth/signin', { email: 'novo@exemplo.invalid', senha: 'errada' })).status, 401);
      assert.equal((await api.get('/api/portal/saude')).corpo.modulos.comFalha, 1);
    } finally { await fechar(server); }
  });
});
