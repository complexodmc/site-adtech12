// =============================================================
// COMPLEXO DMC · /api/progresso — aulas concluídas por aluno
// Cada aluno só enxerga e altera o próprio progresso.
// =============================================================
import { Router } from 'express';
import { col } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const rows = await col.progresso()
    .find({ userId: String(req.user._id) }, { projection: { aulaId: 1, completedAt: 1, _id: 0 } })
    .toArray();
  res.json({
    itens: rows.map(r => ({
      aulaId: r.aulaId,
      completedAt: r.completedAt instanceof Date ? r.completedAt.toISOString() : r.completedAt
    }))
  });
});

router.put('/:aulaId', async (req, res) => {
  const aulaId = String(req.params.aulaId || '').trim();
  if (!aulaId) return res.status(400).json({ error: 'ID da aula ausente.' });

  const aula = await col.aulas().findOne({ _id: aulaId }, { projection: { _id: 1, disponivel: 1 } });
  if (!aula) return res.status(404).json({ error: 'Aula não encontrada.' });
  if (aula.disponivel === false && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Esta aula ainda não está disponível.' });
  }

  // Devolve o valor realmente gravado: num PUT repetido o $setOnInsert
  // não roda, então a data original é preservada.
  const doc = await col.progresso().findOneAndUpdate(
    { userId: String(req.user._id), aulaId },
    { $setOnInsert: { userId: String(req.user._id), aulaId, completedAt: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );
  res.json({ ok: true, aulaId, completedAt: doc.completedAt.toISOString() });
});

router.delete('/:aulaId', async (req, res) => {
  const aulaId = String(req.params.aulaId || '').trim();
  await col.progresso().deleteOne({ userId: String(req.user._id), aulaId });
  res.json({ ok: true });
});

export default router;
