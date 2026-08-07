// =============================================================
// COMPLEXO DMC · /api — catálogo (cursos → módulos → aulas)
// Leitura: qualquer usuário autenticado.
// Escrita: só admin. Delete faz cascata na mão (Mongo não tem FK).
// =============================================================
import { Router } from 'express';
import { col } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();

const str = v => (v == null ? '' : String(v));
const idOf = v => str(v).trim();

// ============ LEITURA ============
router.get('/catalogo', requireAuth, async (_req, res) => {
  const [cursos, modulos, aulas] = await Promise.all([
    col.cursos().find({}).sort({ ordem: 1 }).toArray(),
    col.modulos().find({}).sort({ ordem: 1 }).toArray(),
    col.aulas().find({}).sort({ ordem: 1 }).toArray()
  ]);

  const aulasByModulo = new Map();
  for (const a of aulas) {
    if (!aulasByModulo.has(a.moduloId)) aulasByModulo.set(a.moduloId, []);
    aulasByModulo.get(a.moduloId).push({
      id: a._id,
      moduloId: a.moduloId,
      titulo: a.titulo || '',
      duracao: a.duracao || '',
      videoUrl: a.videoUrl || '',
      ordem: a.ordem || 0
    });
  }

  const modulosByCurso = new Map();
  for (const m of modulos) {
    if (!modulosByCurso.has(m.cursoId)) modulosByCurso.set(m.cursoId, []);
    modulosByCurso.get(m.cursoId).push({
      id: m._id,
      cursoId: m.cursoId,
      numero: m.numero || '',
      titulo: m.titulo || '',
      resumo: m.resumo || '',
      duracao: m.duracao || '',
      ordem: m.ordem || 0,
      aulas: aulasByModulo.get(m._id) || []
    });
  }

  res.json({
    cursos: cursos.map(c => ({
      id: c._id,
      titulo: c.titulo || '',
      subtitulo: c.subtitulo || '',
      descricao: c.descricao || '',
      cargaHoraria: c.cargaHoraria || '',
      modalidade: c.modalidade || 'Online',
      iconeKey: c.iconeKey || 'graduation',
      preco: Number(c.preco) || 0,
      linkCheckout: c.linkCheckout || '',
      beneficios: Array.isArray(c.beneficios) ? c.beneficios : [],
      ordem: c.ordem || 0,
      isAtivo: c.isAtivo !== false,
      modulos: modulosByCurso.get(c._id) || []
    }))
  });
});

// ============ CURSOS (admin) ============
router.put('/cursos/:id', requireAdmin, async (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID do curso ausente.' });
  const b = req.body || {};
  const now = new Date();

  await col.cursos().updateOne(
    { _id: id },
    {
      $set: {
        titulo: str(b.titulo),
        subtitulo: str(b.subtitulo),
        descricao: str(b.descricao),
        cargaHoraria: str(b.cargaHoraria),
        modalidade: str(b.modalidade) || 'Online',
        iconeKey: str(b.iconeKey) || 'graduation',
        preco: Number(b.preco) || 0,
        linkCheckout: str(b.linkCheckout),
        beneficios: Array.isArray(b.beneficios) ? b.beneficios.map(str) : [],
        ordem: Number(b.ordem) || 0,
        isAtivo: b.isAtivo !== false,
        updatedAt: now
      },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );
  res.json({ ok: true, id });
});

router.delete('/cursos/:id', requireAdmin, async (req, res) => {
  const id = idOf(req.params.id);
  const modulos = await col.modulos().find({ cursoId: id }, { projection: { _id: 1 } }).toArray();
  const moduloIds = modulos.map(m => m._id);
  const aulas = moduloIds.length
    ? await col.aulas().find({ moduloId: { $in: moduloIds } }, { projection: { _id: 1 } }).toArray()
    : [];
  const aulaIds = aulas.map(a => a._id);

  await Promise.all([
    aulaIds.length ? col.progresso().deleteMany({ aulaId: { $in: aulaIds } }) : null,
    aulaIds.length ? col.aulas().deleteMany({ _id: { $in: aulaIds } }) : null,
    moduloIds.length ? col.modulos().deleteMany({ _id: { $in: moduloIds } }) : null,
    col.liberacoes().deleteMany({ cursoId: id }),
    col.cursos().deleteOne({ _id: id })
  ].filter(Boolean));

  res.json({ ok: true });
});

// ============ MÓDULOS (admin) ============
router.put('/modulos/:id', requireAdmin, async (req, res) => {
  const id = idOf(req.params.id);
  const cursoId = idOf(req.body.cursoId);
  if (!id) return res.status(400).json({ error: 'ID do módulo ausente.' });
  if (!cursoId) return res.status(400).json({ error: 'cursoId é obrigatório.' });

  const curso = await col.cursos().findOne({ _id: cursoId }, { projection: { _id: 1 } });
  if (!curso) return res.status(404).json({ error: 'Curso não encontrado.' });

  const b = req.body || {};
  const now = new Date();
  await col.modulos().updateOne(
    { _id: id },
    {
      $set: {
        cursoId,
        numero: str(b.numero),
        titulo: str(b.titulo),
        resumo: str(b.resumo),
        duracao: str(b.duracao),
        ordem: Number(b.ordem) || 0,
        updatedAt: now
      },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );
  res.json({ ok: true, id });
});

router.delete('/modulos/:id', requireAdmin, async (req, res) => {
  const id = idOf(req.params.id);
  const aulas = await col.aulas().find({ moduloId: id }, { projection: { _id: 1 } }).toArray();
  const aulaIds = aulas.map(a => a._id);

  await Promise.all([
    aulaIds.length ? col.progresso().deleteMany({ aulaId: { $in: aulaIds } }) : null,
    aulaIds.length ? col.aulas().deleteMany({ _id: { $in: aulaIds } }) : null,
    col.modulos().deleteOne({ _id: id })
  ].filter(Boolean));

  res.json({ ok: true });
});

// ============ AULAS (admin) ============
router.put('/aulas/:id', requireAdmin, async (req, res) => {
  const id = idOf(req.params.id);
  const moduloId = idOf(req.body.moduloId);
  if (!id) return res.status(400).json({ error: 'ID da aula ausente.' });
  if (!moduloId) return res.status(400).json({ error: 'moduloId é obrigatório.' });

  const modulo = await col.modulos().findOne({ _id: moduloId }, { projection: { _id: 1 } });
  if (!modulo) return res.status(404).json({ error: 'Módulo não encontrado.' });

  const b = req.body || {};
  const now = new Date();
  await col.aulas().updateOne(
    { _id: id },
    {
      $set: {
        moduloId,
        titulo: str(b.titulo),
        duracao: str(b.duracao),
        videoUrl: str(b.videoUrl),
        ordem: Number(b.ordem) || 0,
        updatedAt: now
      },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );
  res.json({ ok: true, id });
});

router.delete('/aulas/:id', requireAdmin, async (req, res) => {
  const id = idOf(req.params.id);
  await Promise.all([
    col.progresso().deleteMany({ aulaId: id }),
    col.aulas().deleteOne({ _id: id })
  ]);
  res.json({ ok: true });
});

export default router;
