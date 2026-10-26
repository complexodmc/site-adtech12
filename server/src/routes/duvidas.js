// =============================================================
// COMPLEXO DMC · /api — dúvidas das aulas (Q&A assíncrono)
// O aluno pergunta na página da aula; a equipe responde.
// PORTAL-API §6.12, §6.13, §7.6 · índice §8.1 · dono: F8.
//
// Coleção `duvidas`:
//   { _id:ObjectId, aulaId, moduloId, cursoId, userId,
//     texto, createdAt, resolvida, respondidaEm,
//     respostas: [{ id, userId, autorPapel?, texto, createdAt }] }
//
// Nome de quem pergunta e de quem responde (LGPD, achado G2): NÃO é gravado.
// Só o userId; o nome é montado na leitura por `perfis.publicos` (users.nome =
// nomeSocial || nomeRegistro, mantido pela F0t), então a revogação do nome
// social vale na hora. Quem vê o nome de quem perguntou: o próprio autor, a
// coordenação e o docente do aluno (geral do curso ou da turma do aluno) — o
// público do texto v1 de `perfil_nome_social` e de Meus dados. Colega vê
// "Colega". Documentos antigos ainda trazem `autorNome` (cópia): ele nunca é
// lido; `esquecerNomesCopiados` (e o serviço `duvidas.esquecerNomes`,
// registrado pela F8) apaga essas cópias.
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

/** Rótulos neutros: colega (nome não visível), conta sem nome legível, equipe sem nome legível. */
export const ROTULO_COLEGA = 'Colega';
export const ROTULO_ALUNO = 'Aluno';
export const ROTULO_EQUIPE = 'Instrutor';

/** Nome de exibição de quem está logado (o mesmo critério de sempre: users.nome, senão o usuário do e-mail). */
export function nomeDe(user) {
  return (typeof user?.nome === 'string' && user.nome.trim()) ? user.nome : str(user?.email).split('@')[0];
}

/** userIds de quem perguntou e de quem respondeu, sem repetição. */
export function idsDosAutores(docs, { soPerguntas = false } = {}) {
  const ids = new Set();
  for (const d of docs || []) {
    if (d?.userId) ids.add(String(d.userId));
    if (!soPerguntas) for (const r of (Array.isArray(d?.respostas) ? d.respostas : [])) if (r?.userId) ids.add(String(r.userId));
  }
  return [...ids];
}

/**
 * Nomes de exibição ATUAIS → Map<userId, nome>, por `perfis.publicos` (F0m). Nunca a cópia gravada no
 * documento. Serviço ausente ou com falha → lê só `users.nome` (o mesmo campo; nada além dele).
 * Conta inexistente fica fora do Map (o chamador usa o rótulo neutro).
 */
export async function nomesAtuais({ servicos, repo, log = console }, userIds) {
  const ids = [...new Set((userIds || []).filter(v => v !== null && v !== undefined && v !== '').map(String))];
  const mapa = new Map();
  if (!ids.length) return mapa;
  const publicos = servicos && typeof servicos.tentar === 'function' ? servicos.tentar('perfis.publicos') : null;
  if (typeof publicos === 'function') {
    try {
      const m = await publicos(ids);
      for (const [id, p] of (m instanceof Map ? m : [])) {
        if (p && typeof p.nome === 'string' && p.nome.trim()) mapa.set(String(id), p.nome);
      }
      return mapa;
    } catch (err) {
      try { log.warn('[portal] perfis.publicos falhou nas dúvidas; lendo users.nome:', err?.message || err); } catch { /* nada */ }
    }
  }
  const oids = ids.filter(id => /^[a-f0-9]{24}$/i.test(id)).map(id => new ObjectId(id));
  if (!oids.length || typeof repo !== 'function') return mapa;
  const users = await repo('users').find({ _id: { $in: oids } }, { projection: { nome: 1 } }).toArray();
  for (const u of users) if (typeof u.nome === 'string' && u.nome.trim()) mapa.set(String(u._id), u.nome);
  return mapa;
}

/**
 * Apaga as cópias de nome gravadas no formato antigo (`duvidas.autorNome` e `respostas[].autorNome`).
 * Com `userId`: só as do titular (efeito da revogação do nome social). Sem `userId`: todas (limpeza única).
 * Idempotente. @returns {Promise<{ duvidas:number, respostas:number }>}
 */
export async function esquecerNomesCopiados(repo, { userId = null } = {}) {
  if (typeof repo !== 'function') throw new TypeError('esquecerNomesCopiados: informe repo.');
  const col = repo('duvidas');
  const uid = userId === null || userId === undefined ? null : String(userId);
  const comCopia = uid ? { userId: uid, autorNome: { $exists: true } } : { autorNome: { $exists: true } };
  const r = await col.updateMany(comCopia, { $unset: { autorNome: '' } });
  let respostas = 0;
  const docs = await col.find({ respostas: { $elemMatch: comCopia } }, { projection: { _id: 1, respostas: 1 } }).toArray();
  for (const d of docs) {
    // Uma resposta por vez pelo operador posicional (sem arrayFilters); para quando não houver mais cópia.
    for (let i = 0; i < (d.respostas || []).length; i++) {
      const u = await col.updateOne({ _id: d._id, respostas: { $elemMatch: comCopia } }, { $unset: { 'respostas.$.autorNome': '' } });
      if (!u.matchedCount) break;
      respostas += 1;
    }
  }
  return { duvidas: r.modifiedCount ?? r.matchedCount ?? 0, respostas };
}

/** Papel de quem responde: só 'professor' ou 'admin' (aluno nunca responde). */
export function papelDaResposta(user) {
  const p = papelDe(user);
  return p === 'admin' || p === 'professor' ? p : null;
}

/**
 * Resposta no formato entregue ao front (o mesmo para o aluno e para a equipe).
 * `nomes`: Map<userId, nome atual> (nomesAtuais); a cópia antiga `r.autorNome` nunca é lida.
 */
export function respostaPublica(r, nomes = new Map()) {
  const autorNome = nomes.get(String(r.userId)) || ROTULO_EQUIPE;
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
 * `nomes`: Map<userId, nome atual>; `veNome`: quem lê pode ver o nome de quem perguntou
 * (autor, coordenação, docente do aluno). Sem isso → "Colega". A cópia `d.autorNome` nunca é lida.
 */
export function duvidaPublica(d, user, { nomes = new Map(), veNome = false } = {}) {
  const respostas = (Array.isArray(d.respostas) ? d.respostas : []).map(r => respostaPublica(r, nomes));
  const minha = !!user && String(d.userId) === String(user._id);
  const autorNome = (minha || veNome)
    ? (nomes.get(String(d.userId)) || (minha ? nomeDe(user) : '') || ROTULO_ALUNO)
    : ROTULO_COLEGA;
  return {
    id: String(d._id),
    aulaId: d.aulaId,
    autorNome,
    autorIniciais: iniciaisDe(autorNome),
    texto: d.texto || '',
    createdAt: iso(d.createdAt),
    resolvida: !!d.resolvida,
    minha,
    respostas
  };
}

/** Monta o documento de resposta (o MESMO para o admin legado e para o professor). Sem cópia do nome. */
export function novaResposta(user, texto, agora = new Date()) {
  const papel = papelDaResposta(user);
  return {
    id: 'resp-' + randomUUID().replace(/-/g, '').slice(0, 12),
    userId: String(user._id),
    ...(papel ? { autorPapel: papel } : {}),
    texto,
    createdAt: agora
  };
}

/**
 * Notifica o autor da dúvida (`duvida.respondida`, API §3.5). Melhor esforço:
 * serviço ausente ou falha só vira aviso no log; nunca derruba a resposta.
 */
export async function notificarResposta({ servicos, duvida, resposta, autorNome = '', log = console }) {
  try {
    const notif = servicos && typeof servicos.tentar === 'function' ? servicos.tentar('notificacoes') : null;
    if (!notif || typeof notif.emitir !== 'function') return;
    if (!duvida?.userId || String(duvida.userId) === String(resposta.userId)) return;
    await notif.emitir({
      userIds: [String(duvida.userId)],
      tipo: 'duvida.respondida',
      titulo: 'Sua dúvida recebeu resposta',
      texto: `${autorNome || 'A equipe'} respondeu à sua dúvida na aula.`,
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

  /**
   * Quem lê pode ver o nome de quem perguntou? O próprio autor, a coordenação, o docente geral do
   * curso e o docente da turma do aluno (`acesso.podeVerAluno`). Colega e docente de outra turma: não.
   * Sem o serviço `acesso`: só o autor e o admin legado. @returns {Promise<(userId) => Promise<boolean>>}
   */
  async function quemVeONome(req, cursoId) {
    const eu = String(req.user._id);
    if (req.user.isAdmin) return async () => true;
    const acesso = acessoOu();
    let ctx = null;
    if (acesso && typeof acesso.contexto === 'function') {
      try { ctx = await acesso.contexto(req); } catch { ctx = null; }
    }
    const c = str(cursoId);
    const geral = !!ctx && (ctx.papel === 'admin' || !!ctx.cursosDocenteGeral?.has(c));
    const deTurma = !!ctx && !geral && !!ctx.turmasDocente?.has(c) && typeof acesso.podeVerAluno === 'function';
    const cache = new Map();
    return async (userId) => {
      const u = str(userId);
      if (u === eu || geral) return true;
      if (!deTurma || !u) return false;
      if (!cache.has(u)) cache.set(u, Promise.resolve(acesso.podeVerAluno(req, u)).then(Boolean, () => false));
      return cache.get(u);
    };
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
    const nomes = await nomesAtuais({ servicos, repo, log }, idsDosAutores(fila, { soPerguntas: true }));
    const itens = await itensDaFila(repo, fila, { nomes });
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

    // Nome só de quem o leitor pode ver (minimização: os demais nem são buscados).
    const veNome = await quemVeONome(req, ctx.cursoId);
    const visivel = new Map();
    for (const d of itens) visivel.set(String(d._id), await veNome(d.userId));
    const ids = idsDosAutores(itens.map(d => (visivel.get(String(d._id)) ? d : { respostas: d.respostas })));
    const nomes = await nomesAtuais({ servicos, repo, log }, ids);

    res.json({
      itens: itens.map(d => duvidaPublica(d, req.user, { nomes, veNome: visivel.get(String(d._id)) })),
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
      texto,
      createdAt: agora(),
      resolvida: false,
      respostas: []
    };
    const { insertedId } = await duvidas().insertOne(doc);
    doc._id = insertedId;

    const nomes = new Map([[String(req.user._id), nomeDe(req.user)]]);
    res.status(201).json({ duvida: duvidaPublica(doc, req.user, { nomes }) });
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
    const autorNome = nomeDe(req.user);
    await notificarResposta({ servicos, duvida, resposta, autorNome, log });

    res.status(201).json({ resposta: respostaPublica(resposta, new Map([[resposta.userId, autorNome]])) });
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
 * Só para a equipe que pode ver o aluno; `nomes`: Map<userId, nome atual> (nomesAtuais).
 */
export async function itensDaFila(repo, fila, { nomes = new Map() } = {}) {
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
    const autorNome = nomes.get(String(d.userId)) || ROTULO_ALUNO;
    return {
      id: String(d._id),
      aulaId: d.aulaId,
      aulaTitulo: aula ? aula.titulo || '' : 'Aula removida',
      cursoTitulo: curso ? curso.titulo || '' : '—',
      autorNome,
      autorIniciais: iniciaisDe(autorNome),
      texto: d.texto || '',
      createdAt: iso(d.createdAt),
      respondida: !!(d.respostas || []).length
    };
  });
}

export default criarRotaDuvidas();
