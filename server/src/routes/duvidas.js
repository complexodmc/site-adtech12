// =============================================================
// COMPLEXO DMC · /api — dúvidas das aulas (Q&A assíncrono)
// O aluno pergunta na página da aula; só admin/instrutor responde.
//
// Coleção `duvidas`:
//   { _id:ObjectId, aulaId, moduloId, cursoId, userId, autorNome,
//     texto, createdAt, resolvida,
//     respostas: [{ id, userId, autorNome, texto, createdAt }] }
//
// cursoId e moduloId ficam desnormalizados de propósito: a listagem do
// painel e a cascata de exclusão do catálogo filtram por eles sem
// precisar remontar a hierarquia a cada consulta.
// =============================================================
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { col } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();

const str = v => (v == null ? '' : String(v));

/** Tetos de texto — pergunta é curta, resposta do instrutor pode ser longa. */
const PERGUNTA_MAX = 2000;
const RESPOSTA_MAX = 8000;

/** Intervalo mínimo entre duas perguntas do mesmo aluno (anti-flood). */
const COOLDOWN_MS = 15000;

/** Quantas dúvidas a fila do painel administrativo carrega por vez. */
const PENDENTES_LIMITE = 100;

/** Normaliza texto livre: corta o excesso e colapsa quebras em série. */
function textoLimpo(v, max) {
  return str(v).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

function iniciaisDe(nome) {
  return str(nome).split(/[\s.@]/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('') || '?';
}

function objectIdOu(v) {
  const id = str(v).trim();
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function iso(d) {
  return d instanceof Date ? d.toISOString() : d || null;
}

/**
 * Formato entregue ao front. `minha` marca a autoria pro aluno poder
 * apagar a própria pergunta sem que o front precise expor userId de terceiros.
 */
function duvidaPublica(d, user) {
  const respostas = (Array.isArray(d.respostas) ? d.respostas : []).map(r => ({
    id: r.id,
    autorNome: r.autorNome || 'Instrutor',
    autorIniciais: iniciaisDe(r.autorNome || 'Instrutor'),
    texto: r.texto || '',
    createdAt: iso(r.createdAt)
  }));
  return {
    id: String(d._id),
    aulaId: d.aulaId,
    autorNome: d.autorNome || 'Aluno',
    autorIniciais: iniciaisDe(d.autorNome || 'Aluno'),
    texto: d.texto || '',
    createdAt: iso(d.createdAt),
    resolvida: !!d.resolvida,
    minha: String(d.userId) === String(user._id),
    respostas
  };
}

/** Aula + a hierarquia acima dela. Devolve null quando a aula não existe. */
async function contextoDaAula(aulaId) {
  const aula = await col.aulas().findOne(
    { _id: str(aulaId).trim() },
    { projection: { _id: 1, moduloId: 1, titulo: 1 } }
  );
  if (!aula) return null;
  const modulo = await col.modulos().findOne(
    { _id: aula.moduloId },
    { projection: { _id: 1, cursoId: 1, numero: 1, titulo: 1 } }
  );
  return { aula, modulo, cursoId: modulo ? modulo.cursoId : null };
}

/** Aluno só vê/escreve em aula de curso liberado; admin passa direto. */
async function temAcesso(user, cursoId) {
  if (user.isAdmin) return true;
  if (!cursoId) return false;
  const lib = await col.liberacoes().findOne({ userId: String(user._id), cursoId });
  return !!lib;
}

// ============ FILA DO PAINEL (admin) ============
// Precisa vir antes de /duvidas/:id — "pendentes" casaria com o :id.
router.get('/duvidas/pendentes', requireAdmin, async (_req, res) => {
  const abertas = await col.duvidas()
    .find({ resolvida: { $ne: true } })
    .sort({ createdAt: 1 })
    .limit(PENDENTES_LIMITE)
    .toArray();

  // Sem resposta primeiro: é onde o instrutor precisa agir.
  const semResposta = abertas.filter(d => !(d.respostas || []).length);
  const respondidas = abertas.filter(d => (d.respostas || []).length);
  const fila = [...semResposta, ...respondidas];

  const aulaIds = [...new Set(fila.map(d => d.aulaId))];
  const cursoIds = [...new Set(fila.map(d => d.cursoId).filter(Boolean))];
  const [aulas, cursos] = await Promise.all([
    aulaIds.length
      ? col.aulas().find({ _id: { $in: aulaIds } }, { projection: { _id: 1, titulo: 1 } }).toArray()
      : [],
    cursoIds.length
      ? col.cursos().find({ _id: { $in: cursoIds } }, { projection: { _id: 1, titulo: 1 } }).toArray()
      : []
  ]);
  const tituloAula = new Map(aulas.map(a => [a._id, a.titulo || '']));
  const tituloCurso = new Map(cursos.map(c => [c._id, c.titulo || '']));

  res.json({
    itens: fila.map(d => ({
      id: String(d._id),
      aulaId: d.aulaId,
      aulaTitulo: tituloAula.get(d.aulaId) || 'Aula removida',
      cursoTitulo: tituloCurso.get(d.cursoId) || '—',
      autorNome: d.autorNome || 'Aluno',
      autorIniciais: iniciaisDe(d.autorNome || 'Aluno'),
      texto: d.texto || '',
      createdAt: iso(d.createdAt),
      respondida: !!(d.respostas || []).length
    })),
    // Só o que ainda não tem resposta conta como pendência de verdade.
    pendentes: semResposta.length
  });
});

// ============ LISTAR DÚVIDAS DA AULA ============
router.get('/aulas/:aulaId/duvidas', requireAuth, async (req, res) => {
  const ctx = await contextoDaAula(req.params.aulaId);
  if (!ctx) return res.status(404).json({ error: 'Aula não encontrada.' });
  if (!(await temAcesso(req.user, ctx.cursoId))) {
    return res.status(403).json({ error: 'Você não tem acesso ao curso desta aula.' });
  }

  const itens = await col.duvidas()
    .find({ aulaId: ctx.aula._id })
    .sort({ createdAt: -1 })
    .toArray();

  res.json({ itens: itens.map(d => duvidaPublica(d, req.user)) });
});

// ============ PERGUNTAR (aluno com curso liberado) ============
router.post('/aulas/:aulaId/duvidas', requireAuth, async (req, res) => {
  const texto = textoLimpo(req.body.texto, PERGUNTA_MAX);
  if (texto.length < 3) return res.status(400).json({ error: 'Escreva sua dúvida antes de enviar.' });

  const ctx = await contextoDaAula(req.params.aulaId);
  if (!ctx) return res.status(404).json({ error: 'Aula não encontrada.' });
  if (!(await temAcesso(req.user, ctx.cursoId))) {
    return res.status(403).json({ error: 'Você não tem acesso ao curso desta aula.' });
  }

  // Cooldown lido do próprio banco — sem estado em memória, sobrevive a restart.
  const ultima = await col.duvidas()
    .find({ userId: String(req.user._id) }, { projection: { createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  if (ultima.length && Date.now() - new Date(ultima[0].createdAt).getTime() < COOLDOWN_MS) {
    return res.status(429).json({ error: 'Aguarde alguns segundos antes de enviar outra dúvida.' });
  }

  const doc = {
    aulaId: ctx.aula._id,
    moduloId: ctx.aula.moduloId,
    cursoId: ctx.cursoId,
    userId: String(req.user._id),
    autorNome: req.user.nome || req.user.email.split('@')[0],
    texto,
    createdAt: new Date(),
    resolvida: false,
    respostas: []
  };
  const { insertedId } = await col.duvidas().insertOne(doc);
  doc._id = insertedId;

  res.status(201).json({ duvida: duvidaPublica(doc, req.user) });
});

// ============ RESPONDER (só admin/instrutor) ============
router.post('/duvidas/:id/respostas', requireAdmin, async (req, res) => {
  const _id = objectIdOu(req.params.id);
  if (!_id) return res.status(404).json({ error: 'Dúvida não encontrada.' });

  const texto = textoLimpo(req.body.texto, RESPOSTA_MAX);
  if (texto.length < 2) return res.status(400).json({ error: 'Escreva a resposta antes de enviar.' });

  const resposta = {
    id: 'resp-' + randomUUID().replace(/-/g, '').slice(0, 12),
    userId: String(req.user._id),
    autorNome: req.user.nome || req.user.email.split('@')[0],
    texto,
    createdAt: new Date()
  };

  const { matchedCount } = await col.duvidas().updateOne(
    { _id },
    { $push: { respostas: resposta }, $set: { resolvida: true, respondidaEm: resposta.createdAt } }
  );
  if (!matchedCount) return res.status(404).json({ error: 'Dúvida não encontrada.' });

  res.status(201).json({
    resposta: {
      id: resposta.id,
      autorNome: resposta.autorNome,
      autorIniciais: iniciaisDe(resposta.autorNome),
      texto: resposta.texto,
      createdAt: iso(resposta.createdAt)
    }
  });
});

// ============ REABRIR / MARCAR COMO RESOLVIDA (admin) ============
router.put('/duvidas/:id/resolvida', requireAdmin, async (req, res) => {
  const _id = objectIdOu(req.params.id);
  if (!_id) return res.status(404).json({ error: 'Dúvida não encontrada.' });

  const resolvida = req.body.resolvida !== false;
  const { matchedCount } = await col.duvidas().updateOne({ _id }, { $set: { resolvida } });
  if (!matchedCount) return res.status(404).json({ error: 'Dúvida não encontrada.' });

  res.json({ ok: true, resolvida });
});

// ============ APAGAR PERGUNTA (autor ou admin) ============
router.delete('/duvidas/:id', requireAuth, async (req, res) => {
  const _id = objectIdOu(req.params.id);
  if (!_id) return res.status(404).json({ error: 'Dúvida não encontrada.' });

  const duvida = await col.duvidas().findOne({ _id }, { projection: { userId: 1 } });
  if (!duvida) return res.status(404).json({ error: 'Dúvida não encontrada.' });
  if (!req.user.isAdmin && String(duvida.userId) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Você só pode apagar as próprias dúvidas.' });
  }

  await col.duvidas().deleteOne({ _id });
  res.json({ ok: true });
});

// ============ APAGAR RESPOSTA (admin) ============
router.delete('/duvidas/:id/respostas/:respId', requireAdmin, async (req, res) => {
  const _id = objectIdOu(req.params.id);
  if (!_id) return res.status(404).json({ error: 'Dúvida não encontrada.' });
  const respId = str(req.params.respId).trim();

  const duvida = await col.duvidas().findOne({ _id }, { projection: { respostas: 1 } });
  if (!duvida) return res.status(404).json({ error: 'Dúvida não encontrada.' });
  if (!(duvida.respostas || []).some(r => r.id === respId)) {
    return res.status(404).json({ error: 'Resposta não encontrada.' });
  }

  const restantes = (duvida.respostas || []).filter(r => r.id !== respId);
  await col.duvidas().updateOne(
    { _id },
    // Ficou sem nenhuma resposta: volta pra fila do painel.
    { $pull: { respostas: { id: respId } }, $set: { resolvida: restantes.length > 0 } }
  );

  res.json({ ok: true });
});

export default router;
