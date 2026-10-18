// =============================================================
// COMPLEXO DMC · /api — dúvidas das aulas (Q&A assíncrono)
// O aluno pergunta na página da aula; a equipe responde.
// PORTAL-API §6.12, §6.13, §7.6 · índice §8.1 · dono: F8.
//
// Coleção `duvidas`:
//   { _id:ObjectId, aulaId, moduloId, cursoId, userId, autorNome,
//     texto, createdAt, resolvida, respondidaEm,
//     respostas: [{ id, userId, autorNome, autorPapel?, texto, createdAt }] }
//
// cursoId e moduloId ficam desnormalizados de propósito: a listagem do
// painel e a cascata de exclusão do catálogo filtram por eles sem
// precisar remontar a hierarquia a cada consulta.
//
// Fábrica (padrão bolsas.test.js): criarRotaDuvidas({ repo, servicos,
// exigirLogin, exigirAdmin, agora }). O `export default` continua sendo
// o Router com as dependências reais (server.js não muda, API §5.3 item 4).
//
// Acréscimos do portal (sempre aditivos; D5):
//   - temAcesso aceita docência (serviço `acesso` da F0m); sem o serviço,
//     a regra legada (liberação ou isAdmin) + console.warn;
//   - GET /aulas/:aulaId/duvidas ganha `podeResponder` (docente do curso ou admin);
//   - respostas ganham `autorPapel` ('professor'|'admin');
//   - a resposta do admin legado notifica `duvida.respondida` (melhor esforço).
// As funções puras de formato (duvidaPublica, respostaPublica, textoLimpo…)
// são exportadas para routes/portal-professor.js usar o MESMO formato.
// =============================================================
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { servicos as servicosDoProcesso } from '../portal/servicos.js';
import { papelDe } from '../portal/papeis.js';

const str = v => (v == null ? '' : String(v));

/** Tetos de texto — pergunta é curta, resposta do instrutor pode ser longa. */
export const PERGUNTA_MAX = 2000;
export const RESPOSTA_MAX = 8000;

/** Intervalo mínimo entre duas perguntas do mesmo aluno (anti-flood). */
const COOLDOWN_MS = 15000;

/** Quantas dúvidas a fila do painel administrativo carrega por vez. */
const PENDENTES_LIMITE = 100;

/** Normaliza texto livre: corta o excesso e colapsa quebras em série. */
export function textoLimpo(v, max) {
  if (v !== null && v !== undefined && typeof v !== 'string') return null; // objeto/array/número: formato inválido
  return str(v).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

export function iniciaisDe(nome) {
  return str(nome).split(/[\s.@]/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('') || '?';
}

export function objectIdOu(v) {
  const id = str(v).trim();
  return /^[a-f0-9]{24}$/i.test(id) ? new ObjectId(id) : null;
}

export function iso(d) {
  return d instanceof Date ? d.toISOString() : d || null;
}

/** Papel de quem responde: só 'professor' ou 'admin' (aluno nunca responde). */
export function papelDaResposta(user) {
  const p = papelDe(user);
  return p === 'admin' || p === 'professor' ? p : null;
}

/** Resposta no formato entregue ao front (o mesmo para o aluno e para a equipe). */
export function respostaPublica(r) {
  const autorNome = r.autorNome || 'Instrutor';
  return {
    id: r.id,
    autorNome,
    autorIniciais: iniciaisDe(autorNome),
    ...(r.autorPapel === 'professor' || r.autorPapel === 'admin' ? { autorPapel: r.autorPapel } : {}),
    texto: r.texto || '',
    createdAt: iso(r.createdAt)
  };
}

/**
 * Formato entregue ao front. `minha` marca a autoria pro aluno poder
 * apagar a própria pergunta sem que o front precise expor userId de terceiros.
 */
export function duvidaPublica(d, user) {
  const respostas = (Array.isArray(d.respostas) ? d.respostas : []).map(respostaPublica);
  return {
    id: String(d._id),
    aulaId: d.aulaId,
    autorNome: d.autorNome || 'Aluno',
    autorIniciais: iniciaisDe(d.autorNome || 'Aluno'),
    texto: d.texto || '',
    createdAt: iso(d.createdAt),
    resolvida: !!d.resolvida,
    minha: !!user && String(d.userId) === String(user._id),
    respostas
  };
}

/** Monta o documento de resposta (o MESMO para o admin legado e para o professor). */
export function novaResposta(user, texto, agora = new Date()) {
  const papel = papelDaResposta(user);
  return {
    id: 'resp-' + randomUUID().replace(/-/g, '').slice(0, 12),
    userId: String(user._id),
    autorNome: user.nome || str(user.email).split('@')[0],
    ...(papel ? { autorPapel: papel } : {}),
    texto,
    createdAt: agora
  };
}

/**
 * Notifica o autor da dúvida (`duvida.respondida`, API §3.5). Melhor esforço:
 * serviço ausente ou falha só vira aviso no log; nunca derruba a resposta.
 */
export async function notificarResposta({ servicos, duvida, resposta, log = console }) {
  try {
    const notif = servicos && typeof servicos.tentar === 'function' ? servicos.tentar('notificacoes') : null;
    if (!notif || typeof notif.emitir !== 'function') return;
    if (!duvida?.userId || String(duvida.userId) === String(resposta.userId)) return;
    await notif.emitir({
      userIds: [String(duvida.userId)],
      tipo: 'duvida.respondida',
      titulo: 'Sua dúvida recebeu resposta',
      texto: `${resposta.autorNome} respondeu à sua dúvida na aula.`,
      link: `aula.html?id=${encodeURIComponent(str(duvida.aulaId))}#duvidas`,
      entidade: { tipo: 'duvida', id: String(duvida._id) },
      chave: `duvida:${String(duvida._id)}:${resposta.id}`
    });
  } catch (err) {
    try { log.warn('[portal] notificação de dúvida respondida não emitida:', err?.message || err); } catch { /* nada */ }
  }
}

/**
 * @param {{ repo?: (nome:string)=>object, servicos?: object, exigirLogin?: Function,
 *   exigirAdmin?: Function, agora?: () => Date, log?: Console }} deps
 */
export function criarRotaDuvidas({
  repo = nome => getDb().collection(nome),
  servicos = servicosDoProcesso,
  exigirLogin = requireAuth,
  exigirAdmin = requireAdmin,
  agora = () => new Date(),
  log = console
} = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarRotaDuvidas: informe repo.');
  const router = Router();
  const duvidas = () => repo('duvidas');

  const acessoOu = () => (servicos && typeof servicos.tentar === 'function' ? servicos.tentar('acesso') : null);

  /** Aula + a hierarquia acima dela. Devolve null quando a aula não existe. */
  async function contextoDaAula(aulaId) {
    const aula = await repo('aulas').findOne(
      { _id: str(aulaId).trim() },
      { projection: { _id: 1, moduloId: 1, titulo: 1 } }
    );
    if (!aula) return null;
    const modulo = await repo('modulos').findOne(
      { _id: aula.moduloId },
      { projection: { _id: 1, cursoId: 1, numero: 1, titulo: 1 } }
    );
    return { aula, modulo, cursoId: modulo ? modulo.cursoId : null };
  }

  /** Aluno com liberação; docente do curso; admin. Sem o serviço `acesso`: regra legada. */
  async function temAcesso(req, cursoId) {
    const user = req.user;
    if (user.isAdmin) return true;
    if (!cursoId) return false;
    const acesso = acessoOu();
    if (acesso && typeof acesso.podeVerCurso === 'function') {
      try { return await acesso.podeVerCurso(req, cursoId); } catch (err) {
        log.warn('[portal] acesso.podeVerCurso falhou na rota legada de dúvidas; regra legada:', err?.message || err);
      }
    } else {
      log.warn('[portal] acesso ausente na rota legada de dúvidas; regra legada.');
    }
    const lib = await repo('liberacoes').findOne({ userId: String(user._id), cursoId });
    return !!lib;
  }

  /** Docente (geral ou de turma) do curso, ou admin. */
  async function podeResponder(req, cursoId) {
    if (req.user?.isAdmin) return true;
    const acesso = acessoOu();
    if (!acesso || typeof acesso.contexto !== 'function' || !cursoId) return false;
    try {
      const ctx = await acesso.contexto(req);
      return ctx.papel === 'admin' || ctx.cursosDocente.has(String(cursoId));
    } catch {
      return false;
    }
  }

  // ============ FILA DO PAINEL (admin) ============
  // Precisa vir antes de /duvidas/:id — "pendentes" casaria com o :id.
  router.get('/duvidas/pendentes', exigirAdmin, async (_req, res) => {
    const abertas = await duvidas()
      .find({ resolvida: { $ne: true } })
      .sort({ createdAt: 1 })
      .limit(PENDENTES_LIMITE)
      .toArray();

    // Sem resposta primeiro: é onde o instrutor precisa agir.
    const semResposta = abertas.filter(d => !(d.respostas || []).length);
    const respondidas = abertas.filter(d => (d.respostas || []).length);
    const fila = [...semResposta, ...respondidas];
    const itens = await itensDaFila(repo, fila);
    res.json({
      itens,
      // Só o que ainda não tem resposta conta como pendência de verdade.
      pendentes: semResposta.length
    });
  });

  // ============ LISTAR DÚVIDAS DA AULA ============
  router.get('/aulas/:aulaId/duvidas', exigirLogin, async (req, res) => {
    const ctx = await contextoDaAula(req.params.aulaId);
    if (!ctx) return res.status(404).json({ error: 'Aula não encontrada.' });
    if (!(await temAcesso(req, ctx.cursoId))) {
      return res.status(403).json({ error: 'Você não tem acesso ao curso desta aula.' });
    }

    const itens = await duvidas()
      .find({ aulaId: ctx.aula._id })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      itens: itens.map(d => duvidaPublica(d, req.user)),
      podeResponder: await podeResponder(req, ctx.cursoId)
    });
  });

  // ============ PERGUNTAR (aluno com curso liberado) ============
  router.post('/aulas/:aulaId/duvidas', exigirLogin, async (req, res) => {
    const texto = textoLimpo(req.body?.texto, PERGUNTA_MAX);
    if (texto === null) return res.status(400).json({ error: 'Formato inválido.', codigo: 'formato-invalido' });
    if (texto.length < 3) return res.status(400).json({ error: 'Escreva sua dúvida antes de enviar.' });

    const ctx = await contextoDaAula(req.params.aulaId);
    if (!ctx) return res.status(404).json({ error: 'Aula não encontrada.' });
    if (!(await temAcesso(req, ctx.cursoId))) {
      return res.status(403).json({ error: 'Você não tem acesso ao curso desta aula.' });
    }

    // Cooldown lido do próprio banco — sem estado em memória, sobrevive a restart.
    const ultima = await duvidas()
      .find({ userId: String(req.user._id) }, { projection: { createdAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    if (ultima.length && agora().getTime() - new Date(ultima[0].createdAt).getTime() < COOLDOWN_MS) {
      return res.status(429).json({ error: 'Aguarde alguns segundos antes de enviar outra dúvida.' });
    }

    const doc = {
      aulaId: ctx.aula._id,
      moduloId: ctx.aula.moduloId,
      cursoId: ctx.cursoId,
      userId: String(req.user._id),
      autorNome: req.user.nome || req.user.email.split('@')[0],
      texto,
      createdAt: agora(),
      resolvida: false,
      respostas: []
    };
    const { insertedId } = await duvidas().insertOne(doc);
    doc._id = insertedId;

    res.status(201).json({ duvida: duvidaPublica(doc, req.user) });
  });

  // ============ RESPONDER (admin legado) ============
  router.post('/duvidas/:id/respostas', exigirAdmin, async (req, res) => {
    const _id = objectIdOu(req.params.id);
    if (!_id) return res.status(404).json({ error: 'Dúvida não encontrada.' });

    const texto = textoLimpo(req.body?.texto, RESPOSTA_MAX);
    if (texto === null) return res.status(400).json({ error: 'Formato inválido.', codigo: 'formato-invalido' });
    if (texto.length < 2) return res.status(400).json({ error: 'Escreva a resposta antes de enviar.' });

    const resposta = novaResposta(req.user, texto, agora());
    const { matchedCount } = await duvidas().updateOne(
      { _id },
      { $push: { respostas: resposta }, $set: { resolvida: true, respondidaEm: resposta.createdAt } }
    );
    if (!matchedCount) return res.status(404).json({ error: 'Dúvida não encontrada.' });

    const duvida = await duvidas().findOne({ _id }, { projection: { userId: 1, aulaId: 1 } });
    await notificarResposta({ servicos, duvida, resposta, log });

    res.status(201).json({ resposta: respostaPublica(resposta) });
  });

  // ============ REABRIR / MARCAR COMO RESOLVIDA (admin) ============
  router.put('/duvidas/:id/resolvida', exigirAdmin, async (req, res) => {
    const _id = objectIdOu(req.params.id);
    if (!_id) return res.status(404).json({ error: 'Dúvida não encontrada.' });

    const resolvida = req.body?.resolvida !== false;
    const { matchedCount } = await duvidas().updateOne({ _id }, { $set: { resolvida } });
    if (!matchedCount) return res.status(404).json({ error: 'Dúvida não encontrada.' });

    res.json({ ok: true, resolvida });
  });

  // ============ APAGAR PERGUNTA (autor ou admin) ============
  router.delete('/duvidas/:id', exigirLogin, async (req, res) => {
    const _id = objectIdOu(req.params.id);
    if (!_id) return res.status(404).json({ error: 'Dúvida não encontrada.' });

    const duvida = await duvidas().findOne({ _id }, { projection: { userId: 1 } });
    if (!duvida) return res.status(404).json({ error: 'Dúvida não encontrada.' });
    if (!req.user.isAdmin && String(duvida.userId) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Você só pode apagar as próprias dúvidas.' });
    }

    await duvidas().deleteOne({ _id });
    res.json({ ok: true });
  });

  // ============ APAGAR RESPOSTA (admin) ============
  router.delete('/duvidas/:id/respostas/:respId', exigirAdmin, async (req, res) => {
    const _id = objectIdOu(req.params.id);
    if (!_id) return res.status(404).json({ error: 'Dúvida não encontrada.' });
    const respId = str(req.params.respId).trim();

    const duvida = await duvidas().findOne({ _id }, { projection: { respostas: 1 } });
    if (!duvida) return res.status(404).json({ error: 'Dúvida não encontrada.' });
    if (!(duvida.respostas || []).some(r => r.id === respId)) {
      return res.status(404).json({ error: 'Resposta não encontrada.' });
    }

    const restantes = (duvida.respostas || []).filter(r => r.id !== respId);
    await duvidas().updateOne(
      { _id },
      // Ficou sem nenhuma resposta: volta pra fila do painel.
      { $pull: { respostas: { id: respId } }, $set: { resolvida: restantes.length > 0 } }
    );

    res.json({ ok: true });
  });

  return router;
}

/**
 * Itens da fila (mesmo formato de GET /api/duvidas/pendentes), com títulos de aula e curso.
 * Exportado para a fila do professor (`GET /portal/professor/duvidas`, API §6.12).
 */
export async function itensDaFila(repo, fila) {
  const aulaIds = [...new Set(fila.map(d => d.aulaId).filter(Boolean))];
  const cursoIds = [...new Set(fila.map(d => d.cursoId).filter(Boolean))];
  const [aulas, cursos] = await Promise.all([
    aulaIds.length
      ? repo('aulas').find({ _id: { $in: aulaIds } }, { projection: { _id: 1, titulo: 1, codigo: 1 } }).toArray()
      : [],
    cursoIds.length
      ? repo('cursos').find({ _id: { $in: cursoIds } }, { projection: { _id: 1, titulo: 1, sigla: 1 } }).toArray()
      : []
  ]);
  const aulaPorId = new Map(aulas.map(a => [a._id, a]));
  const cursoPorId = new Map(cursos.map(c => [c._id, c]));
  return fila.map(d => {
    const aula = aulaPorId.get(d.aulaId);
    const curso = cursoPorId.get(d.cursoId);
    return {
      id: String(d._id),
      aulaId: d.aulaId,
      aulaTitulo: aula ? aula.titulo || '' : 'Aula removida',
      cursoTitulo: curso ? curso.titulo || '' : '—',
      autorNome: d.autorNome || 'Aluno',
      autorIniciais: iniciaisDe(d.autorNome || 'Aluno'),
      texto: d.texto || '',
      createdAt: iso(d.createdAt),
      respondida: !!(d.respostas || []).length
    };
  });
}

export default criarRotaDuvidas();
