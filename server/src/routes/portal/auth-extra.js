// =============================================================
// COMPLEXO DMC · Portal — autenticação ampliada (/api/auth/*)
// PORTAL-API §6.1, §4.16, §5.3 item 4, §10 · dono: F0t.
//
// - autenticarCredenciais(): núcleo do login (e-mail OU CPF + senha), usado
//   pelo POST /api/auth/signin LEGADO (routes/auth.js), que é atendido ANTES
//   do agregador. Por isso este arquivo monta as PRÓPRIAS dependências por
//   import direto (cripto, limitador, auditoria, e-mail, índices) quando
//   chamado fora do agregador (`autenticadorPadrao()`), sem `servicos`.
// - Tempo constante: exatamente UM bcrypt.compare por tentativa (conta
//   inexistente, CPF com DV inválido e conta sem hash comparam contra um
//   hash fictício de custo 12; conta desativada compara contra o real e só
//   depois responde 403).
// - Limites persistentes (§4.16): `login:<hmac>:<rede>` 10 falhas/15 min →
//   429 duro só naquela rede; `login:<hmac>` 20/h → só atrito (atraso) e
//   aviso ao titular (no máx. 1 a cada 6 h). Nenhum identificador em claro.
// - Tokens de link: 32 bytes base64url, gravados só como sha256, uso único
//   com consumo atômico; emitir um novo invalida os anteriores do mesmo tipo.
//   Link mágico, recuperação e troca de e-mail respondem 202 ANTES do
//   provedor (enviarEmSegundoPlano), com a mesma resposta com ou sem conta.
// - 2FA (TOTP RFC 6238 + 10 códigos de recuperação): ativação só com
//   PORTAL_2FA=1; quem já tem 2FA ativo sempre passa pelo segundo fator.
// - Nenhuma resposta leva senhaHash, segredo TOTP, hash de token ou código
//   de recuperação já gravado.
//
// Também exporta os ajudantes usados pelas outras rotas da F0t (equipe e
// perfil): política de senha, tokens, reautenticação e conferência de 2FA.
// =============================================================
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { getDb } from '../../db.js';
import { hashSenha as hashSenhaPadrao, checkSenha as checkSenhaPadrao, signToken as signTokenPadrao, publicUser as publicUserPadrao } from '../../auth.js';
import { criarThrottle } from '../../throttle.js';
import { configPortal as configPortalPadrao } from '../../portal/config-portal.js';
import { ErroPortal, MENSAGENS, idDaRequisicao } from '../../portal/erros.js';
import { criarContadorPersistente, conferirSenhaAtual } from '../../portal/limitador.js';
import { criarAuditoria } from '../../portal/auditoria.js';
import { criarEnviadorEmail, MODELOS, montarLinkDeAcesso } from '../../portal/email.js';
import { criptoPadrao, tokenAleatorio, hashToken, ChaveIlegivelError, normalizarCodigoRecuperacao } from '../../portal/cripto.js';
import { verificarTotp, gerarSegredo, otpauthUri, gerarCodigosRecuperacao, aadDoSegredo } from '../../portal/totp.js';
import { validarCpf, validarEmail, truncarIp, ID_RE } from '../../portal/validacao.js';
import { registrarIndices, criarGarantiaIndices, especificacoesDasColecoes } from '../../portal/indices.js';
import { papelDe } from '../../portal/papeis.js';

// ---------- índices das coleções da F0t usadas pela autenticação ----------
export const INDICES_AUTH = Object.freeze([
  { colecao: 'auth_tokens', chave: { hash: 1 }, opcoes: { name: 'uq_authtok_hash', unique: true } },
  { colecao: 'auth_tokens', chave: { userId: 1, tipo: 1 }, opcoes: { name: 'ix_authtok_user' } },
  { colecao: 'auth_tokens', chave: { expiraEm: 1 }, opcoes: { name: 'ttl_authtok', expireAfterSeconds: 0 } },
  { colecao: 'auth_2fa', chave: { userId: 1 }, opcoes: { name: 'uq_auth2fa_user', unique: true } },
  { colecao: 'users', chave: { papel: 1 }, opcoes: { name: 'ix_users_papel' } }
]);
registrarIndices(INDICES_AUTH);

// ---------- constantes ----------
const MIN = 60 * 1000;
const HORA = 60 * MIN;
export const VALIDADE_TOKEN_MS = Object.freeze({
  link_magico: 15 * MIN,
  redefinir_senha: 30 * MIN,
  desafio_2fa: 5 * MIN,
  confirmar_email: 24 * HORA,
  verificar_email: 24 * HORA
});
export const TIPOS_TOKEN = Object.freeze(Object.keys(VALIDADE_TOKEN_MS));
export const PENDENTE_2FA_MS = 10 * MIN;
export const VALIDADE_SENHA_TEMPORARIA_MS = 72 * HORA;

export const LIMITES_LOGIN = Object.freeze({
  rede: Object.freeze({ janelaMs: 15 * MIN, max: 10 }),
  identificador: Object.freeze({ janelaMs: HORA, max: 20, atritoApos: 5, passoMs: 250, tetoMs: 3000 }),
  aviso: Object.freeze({ janelaMs: 6 * HORA, max: 1 })
});
export const LIMITE_2FA = Object.freeze({ janelaMs: HORA, max: 10, bloqueioMs: HORA, falhasPorDesafio: 5 });
export const LIMITE_EMAIL_DESTINATARIO = Object.freeze({ janelaMs: HORA, max: 3 });

export const MENSAGEM_LINK_ENVIADO = 'Se houver uma conta com esse e-mail, enviamos um link de acesso válido por 15 minutos.';
export const MENSAGEM_REDEFINICAO_ENVIADA = 'Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha, válido por 30 minutos.';
const MENSAGEM_401_SESSAO = 'Sessão expirada. Faça login novamente.';
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

// ---------- utilidades ----------
const desembrulhar = r => (r && typeof r === 'object' && r.ok !== undefined && r.value !== undefined ? r.value : r);
const dormirPadrao = ms => new Promise(r => setTimeout(r, ms));

export function erroCampo(campo, mensagem, codigo = 'validacao') {
  return new ErroPortal(400, codigo, codigo === 'validacao' ? MENSAGENS.validacao : (MENSAGENS[codigo] || mensagem), { campos: { [campo]: mensagem } });
}

/** Middleware: exige sessão (401 com a mensagem do requireAuth). */
export function exigirSessao(req, res, next) {
  if (!req.user) return res.status(401).json({ error: MENSAGEM_401_SESSAO });
  return next();
}

/** Usuário por id hex (ou null). */
export async function usuarioPorId(repo, userId) {
  const s = userId === null || userId === undefined ? '' : String(userId);
  if (!ID_RE.test(s)) return null;
  return repo('users').findOne({ _id: new ObjectId(s) });
}

const oidDe = user => (user._id instanceof ObjectId ? user._id : new ObjectId(String(user._id)));

/**
 * Política de senha NOVA (troca, redefinição): 8 a 72 bytes UTF-8, diferente do e-mail e do CPF.
 * Lança 400 `validacao` com `campos[campo]`.
 */
export function validarNovaSenha(senha, { email = null, cpf = null, campo = 'novaSenha' } = {}) {
  if (typeof senha !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { [campo]: 'Formato inválido.' } });
  const bytes = Buffer.byteLength(senha, 'utf8');
  if (bytes < 8) throw erroCampo(campo, 'Use pelo menos 8 caracteres.');
  if (bytes > 72) throw erroCampo(campo, 'Use no máximo 72 bytes (cerca de 72 letras sem acento).');
  const s = senha.trim().toLowerCase();
  if (email && s === String(email).trim().toLowerCase()) throw erroCampo(campo, 'A senha não pode ser igual ao e-mail.');
  const digitos = senha.replace(/\D/g, '');
  if (cpf && digitos.length === 11 && digitos === String(cpf) && senha.replace(/[\d.\-\s]/g, '') === '') throw erroCampo(campo, 'A senha não pode ser igual ao CPF.');
  return senha;
}

// ---------- tokens de link ----------
/**
 * Emite um token de uso único (o claro só sai daqui; o banco guarda o sha256).
 * Invalida os anteriores do mesmo tipo e usuário.
 */
export async function emitirToken(repo, { tipo, userId, dados = {}, req = null, agora = () => new Date() }) {
  if (!TIPOS_TOKEN.includes(tipo)) throw new TypeError(`emitirToken: tipo inválido (${String(tipo)}).`);
  const t = agora();
  const token = tokenAleatorio(32);
  const expiraEm = new Date(t.getTime() + VALIDADE_TOKEN_MS[tipo]);
  const uid = String(userId);
  await repo('auth_tokens').updateMany({ userId: uid, tipo, usadoEm: null }, { $set: { usadoEm: t } });
  await repo('auth_tokens').insertOne({
    tipo, userId: uid, hash: hashToken(token), criadoEm: t, expiraEm, usadoEm: null, tentativas: 0,
    dados: dados && typeof dados === 'object' ? dados : {}, ipTruncado: truncarIp(req?.ip) ?? null
  });
  return { token, expiraEm };
}

/** Consome o token de forma ATÔMICA. → documento (sem o claro) ou null (inválido, expirado ou usado). */
export async function consumirToken(repo, { tipo, token, agora = () => new Date() }) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const t = agora();
  const r = await repo('auth_tokens').findOneAndUpdate(
    { hash: hashToken(token), tipo, usadoEm: null, expiraEm: { $gt: t } },
    { $set: { usadoEm: t } },
    { returnDocument: 'after' }
  );
  return desembrulhar(r) || null;
}

// ---------- 2FA ----------
/**
 * Confere um código do segundo fator da conta (TOTP de 6 dígitos com anti-reuso atômico,
 * ou código de recuperação XXXX-XXXX de uso único). → { ok, metodo, restantes } .
 * Conta sem 2FA ativo → { ok:false, semDoisFatores:true }. Segredo ilegível → lança ChaveIlegivelError.
 */
export async function conferirSegundoFator(repo, userId, codigo, { agora = () => new Date(), cripto = criptoPadrao() } = {}) {
  const uid = String(userId);
  const doc = await repo('auth_2fa').findOne({ userId: uid });
  if (!doc || doc.ativo !== true || !doc.segredo) return { ok: false, semDoisFatores: true };
  if (typeof codigo !== 'string' && typeof codigo !== 'number') return { ok: false };
  const c = String(codigo).replace(/\s/g, '');
  if (/^\d{6}$/.test(c)) {
    const { texto: segredo, recifrar } = cripto.decifrar(doc.segredo, 'totp', aadDoSegredo(uid));
    const passo = verificarTotp(segredo, c, { agoraMs: agora().getTime(), ultimoPasso: Number.isFinite(doc.ultimoPasso) ? doc.ultimoPasso : null });
    if (passo === null) return { ok: false };
    const set = { ultimoPasso: passo };
    if (recifrar) set.segredo = cripto.cifrar(segredo, 'totp', aadDoSegredo(uid));
    const r = await repo('auth_2fa').updateOne({ userId: uid, ativo: true, ultimoPasso: { $lt: passo } }, { $set: set });
    if (!r || r.modifiedCount !== 1) return { ok: false };
    return { ok: true, metodo: 'totp', restantes: (doc.codigos || []).filter(x => !x.usadoEm).length };
  }
  const normal = normalizarCodigoRecuperacao(c);
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normal)) return { ok: false };
  const hash = cripto.hmacCodigoRecuperacao(normal);
  const r = await repo('auth_2fa').updateOne(
    { userId: uid, ativo: true, codigos: { $elemMatch: { hash, usadoEm: null } } },
    { $set: { 'codigos.$.usadoEm': agora() } }
  );
  if (!r || r.modifiedCount !== 1) return { ok: false };
  const depois = await repo('auth_2fa').findOne({ userId: uid }, { projection: { codigos: 1 } });
  return { ok: true, metodo: 'recuperacao', restantes: (depois?.codigos || []).filter(x => !x.usadoEm).length };
}

/**
 * Reautenticação da coordenação (corpo `reautenticacao:{ senha, codigo? }`): senha atual pelo
 * `conferirSenhaAtual` (contador compartilhado) + código do 2FA quando o admin o tem ativo.
 * Errada → 400 `campos.senha`/`campos.codigo` (nunca 401).
 */
export async function conferirReautenticacao(req, reautenticacao, { repo, contador, auditoria = null, email = null, agora = () => new Date(), cripto } = {}) {
  const r = reautenticacao && typeof reautenticacao === 'object' && !Array.isArray(reautenticacao) ? reautenticacao : null;
  if (!r || typeof r.senha !== 'string' || !r.senha) throw erroCampo('senha', 'Confirme a sua senha para continuar.');
  const ok = await conferirSenhaAtual(req, r.senha, { contador, auditoria, email, repo, agora });
  if (!ok) throw erroCampo('senha', 'Senha incorreta.');
  const doc = await repo('auth_2fa').findOne({ userId: String(req.user._id) }, { projection: { ativo: 1 } });
  if (doc?.ativo === true || req.user.doisFatoresAtivo === true) {
    let v;
    try {
      v = await conferirSegundoFator(repo, req.user._id, r.codigo, { agora, ...(cripto ? { cripto } : {}) });
    } catch (err) {
      if (err instanceof ChaveIlegivelError) throw new ErroPortal(409, '2fa-indisponivel');
      throw err;
    }
    if (!v.ok && !v.semDoisFatores) throw erroCampo('codigo', 'Código inválido.');
  }
  return true;
}

// ---------- autenticador (login por e-mail OU CPF) ----------
let hashFicticioPadrao = null;
/** Hash fictício de custo 12 (o mesmo das senhas reais): gerado uma vez, sem bloquear o processo. */
function hashFicticio() {
  if (!hashFicticioPadrao) hashFicticioPadrao = bcrypt.hash(tokenAleatorio(18), 12);
  return hashFicticioPadrao;
}

/** 'joana@x.com' → { tipo:'email', valor }; '529.982.247-25' → { tipo:'cpf', valor:'52998224725', valido }. */
export function lerIdentificador(bruto) {
  if (typeof bruto !== 'string') return null;
  const s = bruto.trim();
  if (!s || s.length > 254) return null;
  const semPontuacao = s.replace(/[.\-\s]/g, '');
  if (/^\d{11}$/.test(semPontuacao)) return { tipo: 'cpf', valor: semPontuacao, valido: validarCpf(semPontuacao) !== null };
  return { tipo: 'email', valor: s.toLowerCase() };
}

/**
 * Fábrica do autenticador. Todas as dependências injetáveis (testes com banco em memória,
 * bcrypt espião, relógio e `dormir` falsos).
 */
export function criarAutenticador({
  repo, contador, auditoria, email, configPortal = configPortalPadrao, agora = () => new Date(),
  checkSenha = checkSenhaPadrao, signToken = signTokenPadrao, publicUser = publicUserPadrao,
  hashFicticio: hashFicticioDep = null, dormir = dormirPadrao, cripto = null, garantir = async () => {}, log = console
} = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarAutenticador: informe repo.');
  if (!contador) throw new TypeError('criarAutenticador: informe contador.');
  const cr = () => cripto || criptoPadrao();
  const hmac = valor => cr().hmacIdentificador(valor);
  const falso = async () => (typeof hashFicticioDep === 'function' ? hashFicticioDep() : (hashFicticioDep || hashFicticio()));
  const rede = req => (truncarIp(req?.ip) || 'sem-rede').replace(/[^0-9a-f.:/]/gi, '');

  async function buscarConta(id) {
    if (!id) return null;
    if (id.tipo === 'email') return repo('users').findOne({ email: id.valor });
    if (!id.valido) return null;
    const perfil = await repo('perfis').findOne({ cpf: id.valor }, { projection: { userId: 1 } });
    return perfil ? usuarioPorId(repo, perfil.userId) : null;
  }

  async function doisFatoresAtivo(user) {
    if (user.doisFatoresAtivo === true) return true;
    const d = await repo('auth_2fa').findOne({ userId: String(user._id) }, { projection: { ativo: 1 } });
    return d?.ativo === true;
  }

  /**
   * Senha (ou link) já conferida: devolve token + user ou o desafio do segundo fator.
   * → { status:200, corpo }
   */
  async function concluirLogin(user, req, { via = 'senha' } = {}) {
    if (await doisFatoresAtivo(user)) {
      const { token: desafio, expiraEm } = await emitirToken(repo, { tipo: 'desafio_2fa', userId: user._id, req, agora, dados: { via } });
      return { status: 200, corpo: { segundoFator: true, desafio, expiraEm: expiraEm.toISOString(), metodos: ['totp', 'recuperacao'] } };
    }
    return { status: 200, corpo: await sessaoDe(user, req, { via }) };
  }

  async function sessaoDe(user, req, { via = 'senha', extra = {} } = {}) {
    const t = agora();
    try { await repo('users').updateOne({ _id: oidDe(user) }, { $set: { ultimoLoginEm: t } }); } catch { /* não bloqueia o login */ }
    if (auditoria) await auditoria.registrar({ acao: 'auth.login_sucesso', entidade: { tipo: 'usuario', id: String(user._id) }, alvoUserId: String(user._id), extra: { via } }, { user, ip: req?.ip });
    return { token: signToken(user), user: publicUser(user), ...extra };
  }

  async function registrarFalha(id, user, req) {
    const h = hmac(id.valor);
    const kRede = `login:${h}:${rede(req)}`;
    const kId = `login:${h}`;
    const [, rId] = await Promise.all([
      contador.consumir(kRede, LIMITES_LOGIN.rede),
      contador.consumir(kId, { janelaMs: LIMITES_LOGIN.identificador.janelaMs, max: LIMITES_LOGIN.identificador.max })
    ]);
    const n = rId.n;
    if (auditoria && n % 5 === 0) {
      await auditoria.registrar({ acao: 'auth.login_falha', entidade: { tipo: 'usuario', id: user ? String(user._id) : 'desconhecido' }, alvoUserId: user ? String(user._id) : null, extra: { falhasNaJanela: n } }, req);
    }
    if (user && n >= LIMITES_LOGIN.identificador.max) {
      const aviso = await contador.consumir(`aviso-login:${h}`, LIMITES_LOGIN.aviso);
      if (aviso.ok) {
        if (email) email.enviarEmSegundoPlano({ para: user.email, ...MODELOS.avisoTentativasDeAcesso({ nome: user.nome }) });
        if (auditoria) await auditoria.registrar({ acao: 'auth.tentativas_de_acesso', entidade: { tipo: 'usuario', id: String(user._id) }, alvoUserId: String(user._id), extra: { falhasNaJanela: n } }, req);
      }
    }
    const { atritoApos, passoMs, tetoMs } = LIMITES_LOGIN.identificador;
    if (n > atritoApos) await dormir(Math.min(passoMs * (n - atritoApos), tetoMs));
  }

  const credenciaisInvalidas = () => ({ status: 401, corpo: { error: MENSAGENS['credenciais-invalidas'], codigo: 'credenciais-invalidas' } });

  /**
   * POST /api/auth/signin. corpo: { email, senha } ou { identificador, senha }.
   * → { status, corpo, headers? } (nunca lança para credencial errada).
   */
  async function autenticarCredenciais(req, corpo = {}) {
    await garantir();
    const bruto = corpo?.identificador ?? corpo?.email;
    const senha = corpo?.senha;
    if ((bruto !== undefined && typeof bruto !== 'string') || (senha !== undefined && typeof senha !== 'string')) {
      return { status: 400, corpo: { error: MENSAGENS['formato-invalido'], codigo: 'formato-invalido' } };
    }
    const id = lerIdentificador(bruto ?? '');
    const s = typeof senha === 'string' ? senha : '';
    if (!id) {
      await checkSenha(s || 'x', await falso()); // mantém o tempo constante
      return credenciaisInvalidas();
    }
    const h = hmac(id.valor);
    const kRede = `login:${h}:${rede(req)}`;
    const atual = await contador.ler(kRede);
    if (atual.bloqueadoAte || atual.n >= LIMITES_LOGIN.rede.max) {
      const fim = Math.max(atual.bloqueadoAte?.getTime() || 0, atual.expiraEm?.getTime() || 0);
      const seg = Math.max(1, Math.ceil(((fim || agora().getTime() + LIMITES_LOGIN.rede.janelaMs) - agora().getTime()) / 1000));
      return { status: 429, headers: { 'Retry-After': String(seg) }, corpo: { error: MENSAGENS['muitas-tentativas'], codigo: 'muitas-tentativas' } };
    }
    const user = await buscarConta(id);
    const hash = user && typeof user.senhaHash === 'string' && user.senhaHash ? user.senhaHash : null;
    const certa = !!(await checkSenha(s, hash || await falso())) && !!hash && s.length > 0 && Buffer.byteLength(s, 'utf8') <= 72;
    const t = agora();
    const temporariaVencida = certa && user.senhaTemporaria === true && user.senhaTemporariaExpiraEm instanceof Date && user.senhaTemporariaExpiraEm <= t;
    if (!certa || temporariaVencida) {
      await registrarFalha(id, user, req);
      return credenciaisInvalidas();
    }
    if (user.desativadoEm) return { status: 403, corpo: { error: MENSAGENS['conta-desativada'], codigo: 'conta-desativada' } };
    return concluirLogin(user, req, { via: id.tipo === 'cpf' ? 'cpf' : 'senha' });
  }

  return Object.freeze({ autenticarCredenciais, concluirLogin, sessaoDe, buscarConta, doisFatoresAtivo });
}

// ---------- instância padrão (rota legada /api/auth/signin, fora do agregador) ----------
let padrao = null;
/** Autenticador com as dependências reais (getDb do db.js, contador e auditoria próprios). */
export function autenticadorPadrao() {
  if (padrao) return padrao;
  const repo = nome => getDb().collection(nome);
  const cfg = configPortalPadrao;
  const garantia = criarGarantiaIndices({ getDb, especificacoes: especificacoesDasColecoes(['limites', 'auth_tokens', 'auth_2fa', 'auditoria']) });
  let indicesProntos = false;
  padrao = criarAutenticador({
    repo,
    contador: criarContadorPersistente({ repo }),
    auditoria: criarAuditoria({ repo }),
    email: criarEnviadorEmail({ resendApiKey: cfg.resendApiKey, de: cfg.emailDe, url: cfg.urlsProvedor?.resend }),
    configPortal: cfg,
    garantir: async () => {
      if (indicesProntos) return;
      await garantia.garantir();
      indicesProntos = true;
    }
  });
  return padrao;
}

/** Handler do signin legado (routes/auth.js delega aqui). */
export function criarHandlerSignin(obterAutenticador = autenticadorPadrao) {
  return async function signin(req, res) {
    const r = await obterAutenticador().autenticarCredenciais(req, req.body || {});
    if (r.headers) res.set(r.headers);
    const corpo = r.status >= 400 && req.requestId ? { ...r.corpo, requestId: req.requestId } : r.corpo;
    res.status(r.status).json(corpo);
  };
}
export { idDaRequisicao };

// ---------- rotas novas de /api/auth (montadas pelo agregador) ----------
/**
 * @param {{ repo, contador, auditoria, email, configPortal, agora, hashSenha, checkSenha, signToken, publicUser,
 *   throttle, log, cripto?, dormir?, hashFicticio? }} deps
 * @returns {import('express').Router}
 */
export function criarRotaAuthExtra(deps = {}) {
  const {
    repo, contador, auditoria = null, email = null, configPortal = configPortalPadrao, agora = () => new Date(),
    hashSenha = hashSenhaPadrao, signToken = signTokenPadrao, publicUser = publicUserPadrao,
    throttle = criarThrottle, cripto = null, log = console, router
  } = deps;
  if (typeof repo !== 'function') throw new TypeError('criarRotaAuthExtra: informe repo.');
  if (!contador) throw new TypeError('criarRotaAuthExtra: informe contador.');
  if (!router) throw new TypeError('criarRotaAuthExtra: informe router.');
  const cr = () => cripto || criptoPadrao();
  const autenticador = deps.autenticador || criarAutenticador({ ...deps, repo, contador, auditoria, email, configPortal, agora, signToken, publicUser });
  const emailOk = () => !!(email && email.disponivel && configPortal.baseUrl);
  const depsSenha = { contador, auditoria, email, repo, agora };

  const limiteIp = (max, janelaMs = 15 * MIN) => throttle({ janelaMs, max, codigo: 'limite', mensagem: MENSAGENS.limite });
  const lim = {
    verificar: limiteIp(10),
    link: limiteIp(5),
    consumir: limiteIp(10),
    esqueci: limiteIp(5),
    redefinir: limiteIp(10),
    email: limiteIp(10)
  };

  async function recarregar(user) {
    return repo('users').findOne({ _id: oidDe(user) });
  }

  async function avisar(user, modelo, dados = {}) {
    if (email && user?.email) email.enviarEmSegundoPlano({ para: user.email, ...MODELOS[modelo]({ nome: user.nome, ...dados }) });
  }

  // ----- GET /auth/recursos -----
  router.get('/recursos', (_req, res) => {
    const porEmail = emailOk();
    res.json({ loginPorCpf: true, linkMagico: porEmail, recuperacaoSenha: porEmail, doisFatores: configPortal.doisFatores === true, senhaTemporariaPelaCoordenacao: true });
  });

  // ----- POST /auth/2fa/verificar -----
  router.post('/2fa/verificar', lim.verificar, async (req, res) => {
    const { desafio, codigo } = req.body || {};
    if (typeof desafio !== 'string' || (codigo !== undefined && typeof codigo !== 'string' && typeof codigo !== 'number')) throw new ErroPortal(400, 'formato-invalido');
    const t = agora();
    const doc = TOKEN_RE.test(desafio) ? await repo('auth_tokens').findOne({ hash: hashToken(desafio), tipo: 'desafio_2fa' }) : null;
    if (!doc || doc.usadoEm || !(doc.expiraEm > t)) throw new ErroPortal(410, 'desafio-expirado');
    const userId = String(doc.userId);
    const k2fa = `2fa:${userId}`;
    const l = await contador.ler(k2fa);
    if (l.bloqueadoAte) throw new ErroPortal(429, 'muitas-tentativas', undefined, { retryAfterSeg: Math.ceil((l.bloqueadoAte.getTime() - t.getTime()) / 1000), persistente: true });
    const user = await usuarioPorId(repo, userId);
    if (!user || user.desativadoEm) throw new ErroPortal(410, 'desafio-expirado');
    let v;
    try {
      v = await conferirSegundoFator(repo, userId, codigo ?? '', { agora, cripto: cr() });
    } catch (err) {
      if (err instanceof ChaveIlegivelError) {
        if (auditoria) await auditoria.registrar({ acao: 'auth.2fa_falha', entidade: { tipo: 'usuario', id: userId }, alvoUserId: userId, extra: { motivo: 'chave-ilegivel' } }, req);
        throw new ErroPortal(409, '2fa-indisponivel');
      }
      throw err;
    }
    if (!v.ok) {
      // Falha: conta no desafio (5ª invalida) e na conta (10/h somando desafios → bloqueio de 1 h).
      const atualizado = desembrulhar(await repo('auth_tokens').findOneAndUpdate({ _id: doc._id, usadoEm: null }, { $inc: { tentativas: 1 } }, { returnDocument: 'after' }));
      if (atualizado && atualizado.tentativas >= LIMITE_2FA.falhasPorDesafio) await repo('auth_tokens').updateOne({ _id: doc._id, usadoEm: null }, { $set: { usadoEm: t } });
      const r = await contador.consumir(k2fa, { janelaMs: LIMITE_2FA.janelaMs, max: LIMITE_2FA.max });
      if (auditoria) await auditoria.registrar({ acao: 'auth.2fa_falha', entidade: { tipo: 'usuario', id: userId }, alvoUserId: userId, extra: { falhasNaJanela: r.n } }, req);
      if (!r.ok) {
        await contador.bloquear(k2fa, LIMITE_2FA.bloqueioMs);
        if (r.n === LIMITE_2FA.max + 1) {
          if (auditoria) await auditoria.registrar({ acao: 'auth.2fa_bloqueado', entidade: { tipo: 'usuario', id: userId }, alvoUserId: userId, extra: { falhas: r.n } }, req);
          await avisar(user, 'aviso2faBloqueado', { ateEm: new Date(t.getTime() + LIMITE_2FA.bloqueioMs) });
        }
        throw new ErroPortal(429, 'muitas-tentativas', undefined, { retryAfterSeg: LIMITE_2FA.bloqueioMs / 1000, persistente: true });
      }
      throw new ErroPortal(401, 'codigo-invalido');
    }
    // Sucesso: consome o desafio de forma atômica (corrida com outro código válido → só um token).
    const consumido = desembrulhar(await repo('auth_tokens').findOneAndUpdate({ _id: doc._id, usadoEm: null, expiraEm: { $gt: t } }, { $set: { usadoEm: t } }, { returnDocument: 'after' }));
    if (!consumido) throw new ErroPortal(410, 'desafio-expirado');
    if (auditoria) {
      await auditoria.registrar({ acao: v.metodo === 'recuperacao' ? 'auth.2fa_codigo_recuperacao_usado' : 'auth.2fa_sucesso', entidade: { tipo: 'usuario', id: userId }, alvoUserId: userId, extra: { restantes: v.restantes } }, req);
    }
    const sessao = await autenticador.sessaoDe(user, req, { via: '2fa' });
    if (v.restantes <= 2) sessao.user = { ...sessao.user, avisos: ['poucos-codigos-recuperacao'] };
    res.json({ ...sessao, codigosRestantes: v.restantes });
  });

  // ----- 2FA do titular (logado) -----
  router.get('/2fa', exigirSessao, async (req, res) => {
    const doc = await repo('auth_2fa').findOne({ userId: String(req.user._id) }, { projection: { ativo: 1, ativadoEm: 1, codigos: 1 } });
    const ativo = doc?.ativo === true;
    res.json({
      ativo,
      ativadoEm: ativo && doc.ativadoEm ? doc.ativadoEm.toISOString() : null,
      codigosRestantes: ativo ? (doc.codigos || []).filter(c => !c.usadoEm).length : null,
      disponivel: configPortal.doisFatores === true,
      obrigatorio: configPortal.doisFatores === true && papelDe(req.user) === 'admin'
    });
  });

  router.post('/2fa/iniciar', exigirSessao, async (req, res) => {
    if (configPortal.doisFatores !== true) throw new ErroPortal(409, '2fa-desligado');
    const uid = String(req.user._id);
    const atual = await repo('auth_2fa').findOne({ userId: uid }, { projection: { ativo: 1 } });
    if (atual?.ativo === true) throw new ErroPortal(409, 'ja-ativo');
    const senha = req.body?.senha;
    if (typeof senha !== 'string' || !senha) throw erroCampo('senha', 'Informe a sua senha.');
    if (!(await conferirSenhaAtual(req, senha, depsSenha))) throw erroCampo('senha', 'Senha incorreta.');
    const segredo = gerarSegredo(20);
    const t = agora();
    await repo('auth_2fa').updateOne(
      { userId: uid },
      { $set: { pendente: cr().cifrar(segredo, 'totp', aadDoSegredo(uid)), pendenteCriadoEm: t }, $setOnInsert: { userId: uid, ativo: false, segredo: null, ativadoEm: null, ultimoPasso: 0, codigos: [] } },
      { upsert: true }
    );
    res.json({ segredo, otpauthUri: otpauthUri({ email: req.user.email, segredo }), expiraEm: new Date(t.getTime() + PENDENTE_2FA_MS).toISOString() });
  });

  router.post('/2fa/ativar', exigirSessao, async (req, res) => {
    if (configPortal.doisFatores !== true) throw new ErroPortal(409, '2fa-desligado');
    const uid = String(req.user._id);
    const codigo = req.body?.codigo;
    if (codigo !== undefined && typeof codigo !== 'string' && typeof codigo !== 'number') throw new ErroPortal(400, 'formato-invalido');
    const t = agora();
    const doc = await repo('auth_2fa').findOne({ userId: uid });
    if (doc?.ativo === true) throw new ErroPortal(409, 'ja-ativo');
    if (!doc?.pendente || !(doc.pendenteCriadoEm instanceof Date) || t.getTime() - doc.pendenteCriadoEm.getTime() > PENDENTE_2FA_MS) throw new ErroPortal(410, 'pendente-expirado');
    let segredo;
    try { segredo = cr().decifrar(doc.pendente, 'totp', aadDoSegredo(uid)).texto; } catch { throw new ErroPortal(410, 'pendente-expirado'); }
    const passo = verificarTotp(segredo, String(codigo ?? ''), { agoraMs: t.getTime() });
    if (passo === null) throw new ErroPortal(400, 'codigo-invalido', undefined, { campos: { codigo: MENSAGENS['codigo-invalido'] } });
    const { claros, hashes } = gerarCodigosRecuperacao(10, { hmac: c => cr().hmacCodigoRecuperacao(c) });
    await repo('auth_2fa').updateOne({ userId: uid }, {
      $set: { ativo: true, segredo: cr().cifrar(segredo, 'totp', aadDoSegredo(uid)), pendente: null, pendenteCriadoEm: null, ativadoEm: t, ultimoPasso: passo, codigos: hashes.map(hash => ({ hash, usadoEm: null })) }
    });
    await repo('users').updateOne({ _id: oidDe(req.user) }, { $set: { doisFatoresAtivo: true }, $inc: { sessaoVersao: 1 } });
    if (auditoria) await auditoria.registrar({ acao: 'auth.2fa_ativado', entidade: { tipo: 'usuario', id: uid }, alvoUserId: uid }, req);
    await avisar(req.user, 'aviso2faAlterado', { ativado: true });
    const user = await recarregar(req.user);
    res.json({ codigosRecuperacao: claros, token: signToken(user) });
  });

  async function senhaECodigo(req) {
    const { senha, codigo } = req.body || {};
    if (typeof senha !== 'string' || !senha) throw erroCampo('senha', 'Informe a sua senha.');
    if (!(await conferirSenhaAtual(req, senha, depsSenha))) throw erroCampo('senha', 'Senha incorreta.');
    let v;
    try { v = await conferirSegundoFator(repo, req.user._id, codigo ?? '', { agora, cripto: cr() }); } catch (err) {
      if (err instanceof ChaveIlegivelError) throw new ErroPortal(409, '2fa-indisponivel');
      throw err;
    }
    if (v.semDoisFatores) throw new ErroPortal(409, 'transicao-invalida', 'A verificação em duas etapas não está ativa.');
    if (!v.ok) throw erroCampo('codigo', 'Código inválido.');
    return v;
  }

  router.post('/2fa/desativar', exigirSessao, async (req, res) => {
    await senhaECodigo(req);
    const uid = String(req.user._id);
    await repo('auth_2fa').updateOne({ userId: uid }, { $set: { ativo: false, segredo: null, pendente: null, pendenteCriadoEm: null, codigos: [], ativadoEm: null } });
    await repo('users').updateOne({ _id: oidDe(req.user) }, { $set: { doisFatoresAtivo: false }, $inc: { sessaoVersao: 1 } });
    if (auditoria) await auditoria.registrar({ acao: 'auth.2fa_desativado', entidade: { tipo: 'usuario', id: uid }, alvoUserId: uid }, req);
    await avisar(req.user, 'aviso2faAlterado', { ativado: false });
    res.json({ ok: true, token: signToken(await recarregar(req.user)) });
  });

  router.post('/2fa/codigos', exigirSessao, async (req, res) => {
    await senhaECodigo(req);
    const uid = String(req.user._id);
    const { claros, hashes } = gerarCodigosRecuperacao(10, { hmac: c => cr().hmacCodigoRecuperacao(c) });
    await repo('auth_2fa').updateOne({ userId: uid, ativo: true }, { $set: { codigos: hashes.map(hash => ({ hash, usadoEm: null })) } });
    if (auditoria) await auditoria.registrar({ acao: 'auth.2fa_codigos_regenerados', entidade: { tipo: 'usuario', id: uid }, alvoUserId: uid }, req);
    res.json({ codigosRecuperacao: claros });
  });

  // ----- link mágico e recuperação (resposta antes do provedor; anti-enumeração) -----
  async function pedirPorEmail(req, res, { tipo, fragmento, modelo, mensagem, validadeMin }) {
    if (!emailOk()) throw new ErroPortal(503, 'email-indisponivel');
    const bruto = req.body?.email;
    if (bruto !== undefined && typeof bruto !== 'string') throw new ErroPortal(400, 'formato-invalido');
    const alvo = validarEmail(bruto ?? '');
    if (!alvo) throw erroCampo('email', 'Informe um e-mail válido.');
    const lim = await contador.consumir(`email-dest:${cr().hmacIdentificador(alvo)}`, LIMITE_EMAIL_DESTINATARIO);
    if (!lim.ok) throw new ErroPortal(429, 'limite', undefined, { retryAfterSeg: lim.retryAfterSeg, persistente: true });
    const user = await repo('users').findOne({ email: alvo });
    if (user && !user.desativadoEm) {
      const { token } = await emitirToken(repo, { tipo, userId: user._id, req, agora });
      const link = montarLinkDeAcesso({ baseUrl: configPortal.baseUrl, tipo: fragmento, token });
      email.enviarEmSegundoPlano({ para: user.email, ...MODELOS[modelo]({ nome: user.nome, link, validadeMin }) });
      if (auditoria && tipo === 'link_magico') auditoria.registrar({ acao: 'auth.link_magico_enviado', entidade: { tipo: 'usuario', id: String(user._id) }, alvoUserId: String(user._id) }, req);
    }
    res.status(202).json({ ok: true, mensagem });
  }

  router.post('/link-magico', lim.link, (req, res) => pedirPorEmail(req, res, {
    tipo: 'link_magico', fragmento: 'acesso', modelo: 'linkAcesso', mensagem: MENSAGEM_LINK_ENVIADO, validadeMin: 15
  }));

  router.post('/senha/esqueci', lim.esqueci, (req, res) => pedirPorEmail(req, res, {
    tipo: 'redefinir_senha', fragmento: 'redefinir', modelo: 'redefinirSenha', mensagem: MENSAGEM_REDEFINICAO_ENVIADA, validadeMin: 30
  }));

  router.post('/link-magico/consumir', lim.consumir, async (req, res) => {
    const doc = await consumirToken(repo, { tipo: 'link_magico', token: req.body?.token, agora });
    if (!doc) throw new ErroPortal(410, 'link-invalido');
    let user = await usuarioPorId(repo, doc.userId);
    if (!user || user.desativadoEm) throw new ErroPortal(410, 'link-invalido');
    if (!user.emailVerificadoEm) {
      await repo('users').updateOne({ _id: oidDe(user) }, { $set: { emailVerificadoEm: agora() } });
      user = await recarregar(user);
    }
    if (auditoria) await auditoria.registrar({ acao: 'auth.link_magico_usado', entidade: { tipo: 'usuario', id: String(user._id) }, alvoUserId: String(user._id) }, req);
    const r = await autenticador.concluirLogin(user, req, { via: 'link_magico' });
    res.status(r.status).json(r.corpo);
  });

  router.post('/senha/redefinir', lim.redefinir, async (req, res) => {
    const { token, novaSenha } = req.body || {};
    if (token !== undefined && typeof token !== 'string') throw new ErroPortal(400, 'formato-invalido');
    // Confere a senha ANTES de gastar o token (só o formato; e-mail/CPF depois de achar a conta).
    validarNovaSenha(novaSenha);
    const hashTok = typeof token === 'string' && TOKEN_RE.test(token) ? hashToken(token) : null;
    const previa = hashTok ? await repo('auth_tokens').findOne({ hash: hashTok, tipo: 'redefinir_senha' }, { projection: { userId: 1 } }) : null;
    if (previa) {
      const dono = await usuarioPorId(repo, previa.userId);
      const perfil = dono ? await repo('perfis').findOne({ userId: String(dono._id) }, { projection: { cpf: 1 } }) : null;
      if (dono) validarNovaSenha(novaSenha, { email: dono.email, cpf: perfil?.cpf || null });
    }
    const doc = await consumirToken(repo, { tipo: 'redefinir_senha', token, agora });
    if (!doc) throw new ErroPortal(410, 'link-invalido');
    const user = await usuarioPorId(repo, doc.userId);
    if (!user || user.desativadoEm) throw new ErroPortal(410, 'link-invalido');
    const t = agora();
    const set = { senhaHash: await hashSenha(novaSenha), senhaOrigem: 'titular', senhaAlteradaEm: t };
    if (!user.emailVerificadoEm) set.emailVerificadoEm = t;
    await repo('users').updateOne({ _id: oidDe(user) }, { $set: set, $unset: { senhaTemporaria: '', senhaTemporariaExpiraEm: '' }, $inc: { sessaoVersao: 1 } });
    await repo('auth_tokens').updateMany({ userId: String(user._id), usadoEm: null }, { $set: { usadoEm: t } });
    if (auditoria) await auditoria.registrar({ acao: 'auth.senha_redefinida', entidade: { tipo: 'usuario', id: String(user._id) }, alvoUserId: String(user._id) }, req);
    await avisar(user, 'avisoSenhaAlterada', { em: t });
    res.json({ ok: true });
  });

  // ----- troca de senha (logado; liberada mesmo com senha temporária) -----
  router.post('/senha/trocar', exigirSessao, async (req, res) => {
    const { senhaAtual, novaSenha } = req.body || {};
    if (senhaAtual !== undefined && typeof senhaAtual !== 'string') throw new ErroPortal(400, 'formato-invalido');
    const perfil = await repo('perfis').findOne({ userId: String(req.user._id) }, { projection: { cpf: 1 } });
    validarNovaSenha(novaSenha, { email: req.user.email, cpf: perfil?.cpf || null });
    if (typeof senhaAtual !== 'string' || !senhaAtual) throw erroCampo('senhaAtual', 'Senha atual incorreta.');
    if (!(await conferirSenhaAtual(req, senhaAtual, depsSenha))) throw erroCampo('senhaAtual', 'Senha atual incorreta.');
    const t = agora();
    const origem = req.user.senhaTemporaria === true ? 'apos_temporaria' : 'titular';
    await repo('users').updateOne(
      { _id: oidDe(req.user) },
      { $set: { senhaHash: await hashSenha(novaSenha), senhaOrigem: origem, senhaAlteradaEm: t }, $unset: { senhaTemporaria: '', senhaTemporariaExpiraEm: '' }, $inc: { sessaoVersao: 1 } }
    );
    if (auditoria) await auditoria.registrar({ acao: 'auth.senha_trocada', entidade: { tipo: 'usuario', id: String(req.user._id) }, alvoUserId: String(req.user._id), extra: { origem } }, req);
    await avisar(req.user, 'avisoSenhaAlterada', { em: t });
    res.json({ ok: true, token: signToken(await recarregar(req.user)) });
  });

  router.post('/sessoes/encerrar-outras', exigirSessao, async (req, res) => {
    const senha = req.body?.senha;
    if (senha !== undefined && typeof senha !== 'string') throw new ErroPortal(400, 'formato-invalido');
    if (!senha) throw erroCampo('senha', 'Informe a sua senha.');
    if (!(await conferirSenhaAtual(req, senha, depsSenha))) throw erroCampo('senha', 'Senha incorreta.');
    await repo('users').updateOne({ _id: oidDe(req.user) }, { $inc: { sessaoVersao: 1 } });
    if (auditoria) await auditoria.registrar({ acao: 'auth.sessoes_encerradas', entidade: { tipo: 'usuario', id: String(req.user._id) }, alvoUserId: String(req.user._id) }, req);
    res.json({ ok: true, token: signToken(await recarregar(req.user)) });
  });

  // ----- e-mail: confirmar troca e verificar -----
  router.post('/email/confirmar', lim.email, async (req, res) => {
    const doc = await consumirToken(repo, { tipo: 'confirmar_email', token: req.body?.token, agora });
    if (!doc) throw new ErroPortal(410, 'link-invalido');
    const user = await usuarioPorId(repo, doc.userId);
    const novo = validarEmail(doc.dados?.novoEmail || '');
    if (!user || user.desativadoEm || !novo) throw new ErroPortal(410, 'link-invalido');
    const outro = await repo('users').findOne({ email: novo, _id: { $ne: oidDe(user) } }, { projection: { _id: 1 } });
    if (outro) throw new ErroPortal(409, 'email-em-uso');
    const antigo = user.email;
    const t = agora();
    await auditoria.executar({
      acao: 'auth.email_alterado', entidade: { tipo: 'usuario', id: String(user._id) }, alvoUserId: String(user._id),
      mudancas: [{ campo: 'email', de: antigo, para: novo }], extra: { via: 'titular' }
    }, { user, ip: req?.ip }, async () => {
      try {
        await repo('users').updateOne({ _id: oidDe(user) }, { $set: { email: novo, emailVerificadoEm: t }, $inc: { sessaoVersao: 1 } });
      } catch (err) {
        if (err?.code === 11000) throw new ErroPortal(409, 'email-em-uso');
        throw err;
      }
    });
    if (email) email.enviarEmSegundoPlano({ para: antigo, ...MODELOS.avisoEmailAlterado({ nome: user.nome, novoEmail: novo }) });
    res.json({ ok: true });
  });

  router.post('/email/verificar', lim.email, async (req, res) => {
    const doc = await consumirToken(repo, { tipo: 'verificar_email', token: req.body?.token, agora });
    if (!doc) throw new ErroPortal(410, 'link-invalido');
    const user = await usuarioPorId(repo, doc.userId);
    if (!user || user.desativadoEm) throw new ErroPortal(410, 'link-invalido');
    await repo('users').updateOne({ _id: oidDe(user) }, { $set: { emailVerificadoEm: agora() } });
    if (auditoria) await auditoria.registrar({ acao: 'auth.email_verificado', entidade: { tipo: 'usuario', id: String(user._id) }, alvoUserId: String(user._id) }, req);
    res.json({ ok: true });
  });

  return router;
}

/** Montagem no agregador (API §5.1): só rotas de /api/auth. */
export default async function montar(ctx) {
  const c = ctx.comum;
  criarRotaAuthExtra({
    router: ctx.rotas.auth,
    repo: c.repo, contador: c.contador, auditoria: c.auditoria, email: c.email, configPortal: c.configPortal,
    agora: c.agora, hashSenha: c.hashSenha, checkSenha: c.checkSenha, signToken: c.signToken, publicUser: c.publicUser,
    throttle: c.throttle, log: c.log, cripto: c.cifra || null
  });
}
