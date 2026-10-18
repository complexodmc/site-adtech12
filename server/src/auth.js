// =============================================================
// COMPLEXO DMC · Auth — hash de senha (bcrypt) + sessão (JWT)
// Autenticação própria. O middleware requireAuth carrega o
// usuário do Mongo e o expõe em req.user.
//
// Portal (PORTAL-API §6.1, §7.7 · F0a) — só acréscimos:
// - o JWT leva `sv` (users.sessaoVersao, padrão 0): trocar a versão
//   derruba todas as sessões; token antigo sem `sv` vale como 0;
// - papel admin recebe JWT de 12 h (os demais seguem config.jwtExpiresIn);
// - loadUser segue anônimo com `sv` divergente ou conta desativada;
// - publicUser mantém os 5 campos de sempre (contrato com a sessão 2d)
//   e ganha papel, precisaTrocarSenha, temFoto, doisFatoresAtivo e
//   emailVerificado. requireAdmin continua lendo só `isAdmin`.
// =============================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { config } from './config.js';
import { col } from './db.js';
import { papelDe } from './portal/papeis.js';

const BCRYPT_ROUNDS = 12;

/** Validade do JWT da coordenação (admin). */
export const JWT_ADMIN_EXPIRA = '12h';

export function hashSenha(senha) {
  return bcrypt.hash(senha, BCRYPT_ROUNDS);
}

export function checkSenha(senha, hash) {
  return bcrypt.compare(senha, hash);
}

export function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), email: user.email, sv: Number(user.sessaoVersao) || 0 },
    config.jwtSecret,
    { expiresIn: papelDe(user) === 'admin' ? JWT_ADMIN_EXPIRA : config.jwtExpiresIn }
  );
}

/** Formato consumido pelo front (DMC_Auth.user()). Os 5 primeiros campos são o contrato com a 2d. */
export function publicUser(user) {
  const nome = user.nome || user.email.split('@')[0];
  return {
    id: String(user._id),
    email: user.email,
    nome,
    iniciais: nome.split(/[\s.@]/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join(''),
    isAdmin: !!user.isAdmin,
    // Acréscimos do portal (só ganham campos; nada acima muda).
    papel: papelDe(user),
    precisaTrocarSenha: user.senhaTemporaria === true,
    temFoto: user.temFoto === true,
    doisFatoresAtivo: user.doisFatoresAtivo === true,
    emailVerificado: !!user.emailVerificadoEm
  };
}

/**
 * O token (já verificado na assinatura e na validade) ainda vale para este usuário?
 * Pura: confere dono, conta desativada e versão de sessão (`sv` ausente = 0).
 */
export function tokenValidoPara(payload, user) {
  if (!payload || typeof payload !== 'object' || !user) return false;
  if (payload.sub !== undefined && String(payload.sub) !== String(user._id)) return false;
  if (user.desativadoEm) return false;
  return (Number(payload.sv) || 0) === (Number(user.sessaoVersao) || 0);
}

function readToken(req) {
  const header = req.get('authorization') || '';
  const [scheme, value] = header.split(' ');
  if (scheme && scheme.toLowerCase() === 'bearer' && value) return value.trim();
  return null;
}

/**
 * Fábrica do loadUser (testável sem Mongo): `buscarUsuario(id: ObjectId)` → documento ou null.
 * Nunca bloqueia: token ausente, inválido, expirado, com `sv` divergente ou de conta
 * desativada → segue como anônimo.
 */
export function criarLoadUser({ buscarUsuario, jwtSecret }) {
  if (typeof buscarUsuario !== 'function') throw new Error('criarLoadUser: informe buscarUsuario.');
  return async function loadUser(req, _res, next) {
    const token = readToken(req);
    if (!token) return next();
    try {
      const payload = jwt.verify(token, typeof jwtSecret === 'function' ? jwtSecret() : jwtSecret);
      const user = await buscarUsuario(new ObjectId(String(payload.sub)));
      if (user && tokenValidoPara(payload, user)) req.user = user;
    } catch {
      // token expirado/inválido — segue como anônimo
    }
    next();
  };
}

/** Popula req.user quando há token válido; nunca bloqueia. */
export const loadUser = criarLoadUser({
  buscarUsuario: (id) => col.users().findOne({ _id: id }),
  jwtSecret: () => config.jwtSecret
});

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  next();
}
