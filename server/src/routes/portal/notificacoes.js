// =============================================================
// COMPLEXO DMC · Portal — notificações do titular (sino e página)
// PORTAL-API §6.4, §3.5, §4.9 · dono: F0t (o serviço `notificacoes` é da F0m).
//
// GET  /portal/me/notificacoes/resumo   → { naoLidas } (roda `varrer`, no máx. a cada 5 min)
// GET  /portal/me/notificacoes          → pág. 25 { itens, naoLidas, pagina, porPagina, total, totalPaginas }
// POST /portal/me/notificacoes/:id/lida → { ok } (idempotente; alheia → 404)
// POST /portal/me/notificacoes/lidas    → { ok, marcadas }
// Sempre filtrado por userId da sessão (nunca do corpo).
// =============================================================
import { ObjectId } from 'mongodb';
import { ErroPortal } from '../../portal/erros.js';
import { lerPagina, ID_RE } from '../../portal/validacao.js';

const iso = d => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);

export function saidaNotificacao(n) {
  return { id: String(n._id), tipo: n.tipo, titulo: n.titulo, texto: n.texto || '', link: n.link ?? null, lida: n.lida === true, criadaEm: iso(n.criadaEm) };
}

/**
 * @param {{ router, repo, notificacoes?, agora? }} deps — `notificacoes` = serviço da F0m (varrer).
 */
export function criarRotaNotificacoes({ router, repo, notificacoes = null, agora = () => new Date() } = {}) {
  if (!router || typeof repo !== 'function') throw new TypeError('criarRotaNotificacoes: informe router e repo.');
  const col = () => repo('notificacoes');
  const contarNaoLidas = userId => col().countDocuments({ userId, lida: false });

  router.get('/me/notificacoes/resumo', async (req, res) => {
    const userId = String(req.user._id);
    if (notificacoes && typeof notificacoes.varrer === 'function') await notificacoes.varrer(userId);
    res.json({ naoLidas: await contarNaoLidas(userId) });
  });

  router.get('/me/notificacoes', async (req, res) => {
    const userId = String(req.user._id);
    const filtro = { userId };
    const so = req.query?.naoLidas;
    if (so !== undefined && typeof so !== 'string') throw new ErroPortal(400, 'formato-invalido');
    if (so === '1' || so === 'true') filtro.lida = false;
    const { pagina, porPagina, pular } = lerPagina(req.query, { porPaginaPadrao: 25, max: 100 });
    const [docs, total, naoLidas] = await Promise.all([
      col().find(filtro, { sort: { criadaEm: -1, _id: -1 }, skip: pular, limit: porPagina }).toArray(),
      col().countDocuments(filtro),
      contarNaoLidas(userId)
    ]);
    res.json({ itens: docs.map(saidaNotificacao), naoLidas, pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) });
  });

  router.post('/me/notificacoes/lidas', async (req, res) => {
    const userId = String(req.user._id);
    const r = await col().updateMany({ userId, lida: false }, { $set: { lida: true, lidaEm: agora() } });
    res.json({ ok: true, marcadas: Number(r?.modifiedCount ?? 0) });
  });

  router.post('/me/notificacoes/:id/lida', async (req, res) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !ID_RE.test(id)) throw new ErroPortal(404, null, 'Notificação não encontrada.');
    const userId = String(req.user._id);
    const doc = await col().findOne({ _id: new ObjectId(id), userId }, { projection: { lida: 1 } });
    if (!doc) throw new ErroPortal(404, null, 'Notificação não encontrada.');
    if (!doc.lida) await col().updateOne({ _id: doc._id, userId, lida: false }, { $set: { lida: true, lidaEm: agora() } });
    res.json({ ok: true });
  });

  return router;
}

/** Exportador `notificacoes` (Meus dados, §6.3.4). */
export function criarExportadorNotificacoes({ repo }) {
  return {
    dominio: 'notificacoes',
    async exportar(userId) {
      const docs = await repo('notificacoes').find({ userId: String(userId) }, { sort: { criadaEm: -1 }, limit: 5000 }).toArray();
      return docs.map(saidaNotificacao);
    }
  };
}

/** Montagem no agregador (API §5.1). */
export default async function montar(ctx) {
  const c = ctx.comum;
  criarRotaNotificacoes({ router: ctx.rotas.aluno, repo: c.repo, notificacoes: c.notificacoes, agora: c.agora });
  ctx.servicos.adicionar('exportador', criarExportadorNotificacoes({ repo: c.repo }));
}
