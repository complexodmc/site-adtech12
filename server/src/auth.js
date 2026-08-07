// =============================================================
// COMPLEXO DMC · Auth — hash de senha (bcrypt) + sessão (JWT)
// Autenticação própria. O middleware requireAuth carrega o
// usuário do Mongo e o expõe em req.user.
// =============================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { config } from './config.js';
import { col } from './db.js';

const BCRYPT_ROUNDS = 12;

export function hashSenha(senha) {
  return bcrypt.hash(senha, BCRYPT_ROUNDS);
}

export function checkSenha(senha, hash) {
  return bcrypt.compare(senha, hash);
}

export function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/** Formato consumido pelo front (DMC_Auth.user()). */
export function publicUser(user) {
  const nome = user.nome || user.email.split('@')[0];
  return {
    id: String(user._id),
    email: user.email,
    nome,
    iniciais: nome.split(/[\s.@]/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join(''),
    isAdmin: !!user.isAdmin
  };
}

function readToken(req) {
  const header = req.get('authorization') || '';
  const [scheme, value] = header.split(' ');
  if (scheme && scheme.toLowerCase() === 'bearer' && value) return value.trim();
  return null;
}

/** Popula req.user quando há token válido; nunca bloqueia. */
export async function loadUser(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await col.users().findOne({ _id: new ObjectId(String(payload.sub)) });
    if (user) req.user = user;
  } catch {
    // token expirado/inválido — segue como anônimo
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  next();
}
