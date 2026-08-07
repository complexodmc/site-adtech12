// =============================================================
// COMPLEXO DMC · /api/auth — cadastro, login e sessão
// =============================================================
import { Router } from 'express';
import { col } from '../db.js';
import { hashSenha, checkSenha, signToken, publicUser, requireAuth } from '../auth.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}

router.post('/signup', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const senha = String(req.body.senha || '');
  const nome = String(req.body.nome || '').trim();

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  if (senha.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });

  const existente = await col.users().findOne({ email });
  if (existente) return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });

  const doc = {
    email,
    senhaHash: await hashSenha(senha),
    nome: nome || email.split('@')[0],
    isAdmin: false,
    createdAt: new Date()
  };

  try {
    const { insertedId } = await col.users().insertOne(doc);
    doc._id = insertedId;
  } catch (err) {
    // corrida no índice único
    if (err && err.code === 11000) return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
    throw err;
  }

  const user = publicUser(doc);
  res.status(201).json({ token: signToken(doc), user });
});

router.post('/signin', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const senha = String(req.body.senha || '');

  const user = await col.users().findOne({ email });
  // Mensagem genérica de propósito: não revela se o e-mail existe.
  if (!user || !(await checkSenha(senha, user.senhaHash || ''))) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }

  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
