// =============================================================
// COMPLEXO DMC · /api/liberacoes — acesso de aluno a curso
// Aluno lê só as próprias; admin lê e escreve todas.
//
// Portal (F4a · PORTAL-API §6.13, §8.2 · índice D-49, R12): a rota vira
// FÁBRICA (criarRotaLiberacoes) com o export default usando as
// dependências reais. Contrato e respostas INALTERADOS (D5). Acréscimos,
// sempre em melhor esforço (falha só loga; nunca muda a resposta):
//   - POST admin e /dev/simular-pagamento chamam
//     secretaria.garantirMatricula para cada curso liberado (a matrícula
//     é materializada a partir da liberação, sem duplicar);
//   - POST, DELETE e simulação registram liberacao.concedida /
//     liberacao.revogada (auditoria.registrar, sem e-mail em claro:
//     extra.emailHmac + cursoIds; alvo = userId);
//   - DELETE NÃO cancela matrícula (ela passa a aparecer com semAcesso).
// Serviço ausente (módulo da F4a isolado, agregador ainda não carregado)
// → comportamento de hoje + console.warn, nunca 503 (API §4.4).
// =============================================================
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { col } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { config } from '../config.js';
import { servicos as servicosDoProcesso } from '../portal/servicos.js';

/**
 * @param {{ colecoes: { users: () => object, liberacoes: () => object, cursos: () => object },
 *   exigirLogin: Function, exigirAdmin: Function, devSimularPagamento?: boolean,
 *   servicos?: object, log?: Console }} deps
 */
export function criarRotaLiberacoes({
  colecoes, exigirLogin, exigirAdmin, devSimularPagamento = false, servicos = servicosDoProcesso, log = console
} = {}) {
  if (!colecoes || typeof colecoes.users !== 'function' || typeof colecoes.liberacoes !== 'function' || typeof colecoes.cursos !== 'function') {
    throw new Error('criarRotaLiberacoes: informe colecoes { users, liberacoes, cursos }.');
  }
  if (typeof exigirLogin !== 'function' || typeof exigirAdmin !== 'function') {
    throw new Error('criarRotaLiberacoes: informe exigirLogin e exigirAdmin.');
  }
  const router = Router();

  const avisar = (texto, err) => {
    try { (log.warn || log.error).call(log, `[portal] ${texto}${err ? ` (${err?.name || 'Error'}: ${String(err?.message || err).slice(0, 200)})` : ''}`); } catch { /* nada */ }
  };

  async function findUserByEmail(email) {
    return colecoes.users().findOne({ email: String(email || '').trim().toLowerCase() });
  }

  /** Matrícula a partir da liberação (melhor esforço; a resposta não muda). */
  async function materializar(userId, cursoIds, req) {
    const garantir = servicos?.tentar ? servicos.tentar('secretaria.garantirMatricula') : null;
    if (typeof garantir !== 'function') {
      avisar('secretaria.garantirMatricula ausente na rota legada de liberações; liberação gravada sem matrícula');
      return;
    }
    for (const cursoId of cursoIds) {
      try {
        await garantir(String(userId), cursoId, { req });
      } catch (err) {
        avisar(`secretaria.garantirMatricula falhou na rota legada de liberações (curso ${cursoId})`, err);
      }
    }
  }

  /** liberacao.concedida / liberacao.revogada (auditoria.registrar; sem e-mail em claro). */
  async function auditar(acao, { userId, email, cursoIds }, req) {
    const auditoria = servicos?.tentar ? servicos.tentar('auditoria') : null;
    if (!auditoria || typeof auditoria.registrar !== 'function') {
      avisar(`auditoria ausente na rota legada de liberações (${acao})`);
      return;
    }
    let emailHmac = null;
    try {
      const cifra = servicos.tentar('cifra');
      if (email && cifra && typeof cifra.hmacIdentificador === 'function') emailHmac = cifra.hmacIdentificador(email);
    } catch { /* sem hmac: segue sem o campo */ }
    try {
      await auditoria.registrar({
        acao, entidade: { tipo: 'liberacao', id: String(userId) }, alvoUserId: String(userId),
        ...(cursoIds.length === 1 ? { cursoId: cursoIds[0] } : {}),
        extra: { ...(emailHmac ? { emailHmac } : {}), cursoIds }
      }, req);
    } catch (err) {
      avisar(`auditoria de ${acao} falhou na rota legada`, err);
    }
  }

  // ============ ALUNO ============
  router.get('/me', exigirLogin, async (req, res) => {
    const rows = await colecoes.liberacoes()
      .find({ userId: String(req.user._id) }, { projection: { cursoId: 1, _id: 0 } })
      .toArray();
    res.json({ cursoIds: rows.map(r => r.cursoId) });
  });

  // ============ ADMIN ============
  router.get('/', exigirAdmin, async (_req, res) => {
    const libs = await colecoes.liberacoes().find({}).toArray();
    const userIds = [...new Set(libs.map(l => l.userId))]
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    const users = userIds.length
      ? await colecoes.users().find({ _id: { $in: userIds } }, { projection: { email: 1 } }).toArray()
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

  router.post('/', exigirAdmin, async (req, res) => {
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

    const existentes = await colecoes.cursos()
      .find({ _id: { $in: cursoIds } }, { projection: { _id: 1 } })
      .toArray();
    const validos = new Set(existentes.map(c => c._id));
    const desconhecidos = cursoIds.filter(id => !validos.has(id));
    if (desconhecidos.length) {
      return res.status(404).json({ error: `Curso(s) não encontrado(s): ${desconhecidos.join(', ')}` });
    }

    const now = new Date();
    await colecoes.liberacoes().bulkWrite(cursoIds.map(cursoId => ({
      updateOne: {
        filter: { userId: String(aluno._id), cursoId },
        update: { $setOnInsert: { userId: String(aluno._id), cursoId, grantedAt: now, grantedBy: String(req.user._id) } },
        upsert: true
      }
    })));

    await auditar('liberacao.concedida', { userId: aluno._id, email, cursoIds }, req);
    await materializar(aluno._id, cursoIds, req);
    res.json({ ok: true, liberados: cursoIds.length });
  });

  router.delete('/', exigirAdmin, async (req, res) => {
    const email = String(req.query.email || '').trim().toLowerCase();
    const cursoId = String(req.query.cursoId || '').trim();
    if (!email) return res.status(400).json({ error: 'Informe o e-mail do aluno.' });

    const aluno = await findUserByEmail(email);
    if (!aluno) return res.json({ ok: true, revogados: 0 });

    const filtro = { userId: String(aluno._id) };
    if (cursoId) filtro.cursoId = cursoId;   // sem cursoId = revoga tudo

    // Só para a auditoria: quais cursos saem (a resposta continua a de hoje).
    let afetados = [];
    try {
      afetados = (await colecoes.liberacoes().find(filtro, { projection: { cursoId: 1 } }).toArray()).map(l => l.cursoId);
    } catch (err) {
      avisar('leitura das liberações para a auditoria falhou', err);
    }
    const { deletedCount } = await colecoes.liberacoes().deleteMany(filtro);
    // Matrícula NÃO é cancelada: aparece com semAcesso até a coordenação decidir (§6.8.2).
    if (deletedCount) await auditar('liberacao.revogada', { userId: aluno._id, email, cursoIds: afetados }, req);
    res.json({ ok: true, revogados: deletedCount });
  });

  // ============ DEV-ONLY ============
  // Equivalente à antiga RPC dev_simular_pagamento: o próprio aluno
  // libera cursos pra si. Só existe com DEV_SIMULAR_PAGAMENTO=true —
  // sem a flag a rota nem é registrada (cai no 404 da API).
  if (devSimularPagamento) router.post('/dev/simular-pagamento', exigirLogin, async (req, res) => {
    const cursoIds = (Array.isArray(req.body.cursoIds) ? req.body.cursoIds : [])
      .map(v => String(v || '').trim())
      .filter(Boolean);
    if (!cursoIds.length) return res.status(400).json({ error: 'Nenhum curso informado.' });

    const existentes = await colecoes.cursos().find({ _id: { $in: cursoIds } }, { projection: { _id: 1 } }).toArray();
    const validos = existentes.map(c => c._id);
    if (!validos.length) return res.status(404).json({ error: 'Curso(s) não encontrado(s).' });

    const now = new Date();
    await colecoes.liberacoes().bulkWrite(validos.map(cursoId => ({
      updateOne: {
        filter: { userId: String(req.user._id), cursoId },
        update: { $setOnInsert: { userId: String(req.user._id), cursoId, grantedAt: now, grantedBy: String(req.user._id) } },
        upsert: true
      }
    })));

    await auditar('liberacao.concedida', { userId: req.user._id, email: req.user.email, cursoIds: validos }, req);
    await materializar(req.user._id, validos, req);
    res.json({ ok: true, liberados: validos.length });
  });

  return router;
}

const router = criarRotaLiberacoes({
  colecoes: { users: () => col.users(), liberacoes: () => col.liberacoes(), cursos: () => col.cursos() },
  exigirLogin: requireAuth,
  exigirAdmin: requireAdmin,
  devSimularPagamento: config.devSimularPagamento
});

export default router;
