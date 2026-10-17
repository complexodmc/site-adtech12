// =============================================================
// COMPLEXO DMC · /api/liberacoes — acesso de aluno a curso
// Aluno lê só as próprias; admin lê e escreve todas.
// =============================================================
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { col } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { config } from '../config.js';

const router = Router();

async function findUserByEmail(email) {
  return col.users().findOne({ email: String(email || '').trim().toLowerCase() });
}

// ============ ALUNO ============
router.get('/me', requireAuth, async (req, res) => {
  const rows = await col.liberacoes()
    .find({ userId: String(req.user._id) }, { projection: { cursoId: 1, _id: 0 } })
    .toArray();
  res.json({ cursoIds: rows.map(r => r.cursoId) });
});

// ============ ADMIN ============
router.get('/', requireAdmin, async (_req, res) => {
  const libs = await col.liberacoes().find({}).toArray();
  const userIds = [...new Set(libs.map(l => l.userId))]
    .filter(id => ObjectId.isValid(id))
    .map(id => new ObjectId(id));

  const users = userIds.length
    ? await col.users().find({ _id: { $in: userIds } }, { projection: { email: 1 } }).toArray()
    : [];
  const emailById = Object.fromEntries(users.map(u => [String(u._id), u.email]));

  const byEmail = {};
  for (const l of libs) {
    const email = emailById[l.userId];
    if (!email) continue;
    (byEmail[email] ||= []).push(l.cursoId);
  }
  res.json({ byEmail });
});

router.post('/', requireAdmin, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const cursoIds = (Array.isArray(req.body.cursoIds) ? req.body.cursoIds : [req.body.cursoIds])
    .map(v => String(v || '').trim())
    .filter(Boolean);

  if (!email) return res.status(400).json({ error: 'Informe o e-mail do aluno.' });
  if (!cursoIds.length) return res.status(400).json({ error: 'Selecione ao menos um curso.' });

  const aluno = await findUserByEmail(email);
  if (!aluno) {
    return res.status(404).json({ error: `Aluno ${email} não tem conta na plataforma. Peça para ele se cadastrar primeiro.` });
  }

  const existentes = await col.cursos()
    .find({ _id: { $in: cursoIds } }, { projection: { _id: 1 } })
    .toArray();
  const validos = new Set(existentes.map(c => c._id));
  const desconhecidos = cursoIds.filter(id => !validos.has(id));
  if (desconhecidos.length) {
    return res.status(404).json({ error: `Curso(s) não encontrado(s): ${desconhecidos.join(', ')}` });
  }

  const now = new Date();
  await col.liberacoes().bulkWrite(cursoIds.map(cursoId => ({
    updateOne: {
      filter: { userId: String(aluno._id), cursoId },
      update: { $setOnInsert: { userId: String(aluno._id), cursoId, grantedAt: now, grantedBy: String(req.user._id) } },
      upsert: true
    }
  })));

  res.json({ ok: true, liberados: cursoIds.length });
});

router.delete('/', requireAdmin, async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  const cursoId = String(req.query.cursoId || '').trim();
  if (!email) return res.status(400).json({ error: 'Informe o e-mail do aluno.' });

  const aluno = await findUserByEmail(email);
  if (!aluno) return res.json({ ok: true, revogados: 0 });

  const filtro = { userId: String(aluno._id) };
  if (cursoId) filtro.cursoId = cursoId;   // sem cursoId = revoga tudo

  const { deletedCount } = await col.liberacoes().deleteMany(filtro);
  res.json({ ok: true, revogados: deletedCount });
});

// ============ DEV-ONLY ============
// Equivalente à antiga RPC dev_simular_pagamento: o próprio aluno
// libera cursos pra si. Só existe com DEV_SIMULAR_PAGAMENTO=true —
// sem a flag a rota nem é registrada (cai no 404 da API).
if (config.devSimularPagamento) router.post('/dev/simular-pagamento', requireAuth, async (req, res) => {
  const cursoIds = (Array.isArray(req.body.cursoIds) ? req.body.cursoIds : [])
    .map(v => String(v || '').trim())
    .filter(Boolean);
  if (!cursoIds.length) return res.status(400).json({ error: 'Nenhum curso informado.' });

  const existentes = await col.cursos().find({ _id: { $in: cursoIds } }, { projection: { _id: 1 } }).toArray();
  const validos = existentes.map(c => c._id);
  if (!validos.length) return res.status(404).json({ error: 'Curso(s) não encontrado(s).' });

  const now = new Date();
  await col.liberacoes().bulkWrite(validos.map(cursoId => ({
    updateOne: {
      filter: { userId: String(req.user._id), cursoId },
      update: { $setOnInsert: { userId: String(req.user._id), cursoId, grantedAt: now, grantedBy: String(req.user._id) } },
      upsert: true
    }
  })));

  res.json({ ok: true, liberados: validos.length });
});

export default router;
