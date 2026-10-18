// =============================================================
// COMPLEXO DMC · /api/auth — cadastro, login e sessão
// Portal (PORTAL-API §6.1, §6.13, §10 · F0t): fábrica criarRotaAuth(deps)
// com o `default` de sempre (dependências reais). O signin DELEGA a
// autenticarCredenciais() de routes/portal/auth-extra.js (e-mail OU CPF,
// tempo constante, limites persistentes, 2FA), que não depende do
// agregador. O signup grava papel 'aluno' e emailVerificadoEm null; /me
// inalterado (publicUser só ganhou campos — contrato com a sessão 2d).
// =============================================================
import { Router } from 'express';
import { col } from '../db.js';
import { hashSenha as hashSenhaPadrao, signToken as signTokenPadrao, publicUser as publicUserPadrao, requireAuth } from '../auth.js';
import { criarHandlerSignin, idDaRequisicao } from './portal/auth-extra.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}

/**
 * @param {{ users?: () => object, hashSenha?, signToken?, publicUser?, signin?, exigirLogin? }} deps
 */
export function criarRotaAuth({
  users = () => col.users(), hashSenha = hashSenhaPadrao, signToken = signTokenPadrao, publicUser = publicUserPadrao,
  signin = criarHandlerSignin(), exigirLogin = requireAuth
} = {}) {
  const router = Router();

  router.post('/signup', async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const senha = String(req.body.senha || '');
    const nome = String(req.body.nome || '').trim();

    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
    if (senha.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });

    const existente = await users().findOne({ email });
    if (existente) return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });

    const doc = {
      email,
      senhaHash: await hashSenha(senha),
      nome: nome || email.split('@')[0],
      isAdmin: false,
      papel: 'aluno',
      emailVerificadoEm: null,
      senhaOrigem: 'titular',
      createdAt: new Date()
    };

    try {
      const { insertedId } = await users().insertOne(doc);
      doc._id = insertedId;
    } catch (err) {
      // corrida no índice único
      if (err && err.code === 11000) return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
      throw err;
    }

    const user = publicUser(doc);
    res.status(201).json({ token: signToken(doc), user });
  });

  // E-mail OU CPF + senha (PORTAL-API §6.1). Mensagem genérica: não revela se a conta existe.
  router.post('/signin', idDaRequisicao, signin);

  router.get('/me', exigirLogin, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  return router;
}

export default criarRotaAuth();
