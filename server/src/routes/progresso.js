// =============================================================
// COMPLEXO DMC · /api/progresso — aulas concluídas por aluno
// Cada aluno só enxerga e altera o próprio progresso.
//
// Portal (PORTAL-API §6.13, §7.2 · DC-78 · dono: F1a):
// - PUT confere acesso ao curso da aula (`podeVerCurso`): sem acesso →
//   403 `sem-acesso` e nada é gravado. Aluno com liberação, docente e
//   admin gravam EXATAMENTE como antes: 200 { ok, aulaId, completedAt }.
//   PUT e DELETE NUNCA respondem 204 (o app.js lê `completedAt`).
// - Conclusão nova → grupo `aoConcluirAula` em melhor esforço (via
//   'conclusao_manual'); documento novo ganha `origem:'manual'`.
// - GET/DELETE inalterados (DELETE não apaga frequência).
// =============================================================
import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../auth.js';
import { servicos as servicosDoProcesso } from '../portal/servicos.js';
import { criarAcesso } from '../portal/acesso.js';
import { MENSAGENS } from '../portal/erros.js';
import { criarRepositoriosEstudos } from '../portal/estudos/repositorios.js';
import { criarServicoEstudos } from '../portal/estudos/progresso.js';

/**
 * @param {{ repo: (nome: string) => object, servicos?: object, exigirLogin?: Function,
 *   agora?: () => Date, log?: object }} deps
 */
export function criarRotaProgresso({ repo, servicos = servicosDoProcesso, exigirLogin = requireAuth, agora = () => new Date(), log = console } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarRotaProgresso: informe repo.');
  const acessoProprio = criarAcesso({ repo });
  const acessoDe = () => servicos.tentar('acesso') || acessoProprio;
  const repos = criarRepositoriosEstudos({ repo });
  const estudos = criarServicoEstudos({ repos, servicos, agora, log });

  const router = Router();
  router.use(exigirLogin);

  router.get('/', async (req, res) => {
    const rows = await repo('progresso')
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

    const aula = await repo('aulas').findOne({ _id: aulaId }, { projection: { _id: 1, disponivel: 1, moduloId: 1 } });
    if (!aula) return res.status(404).json({ error: 'Aula não encontrada.' });
    const modulo = aula.moduloId
      ? await repo('modulos').findOne({ _id: String(aula.moduloId) }, { projection: { _id: 1, cursoId: 1 } })
      : null;
    const cursoId = modulo?.cursoId ? String(modulo.cursoId) : null;
    if (!(await acessoDe().podeVerCurso(req, cursoId)) && !req.user.isAdmin) {
      return res.status(403).json({ error: MENSAGENS['sem-acesso'], codigo: 'sem-acesso' });
    }
    if (aula.disponivel === false && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Esta aula ainda não está disponível.' });
    }

    // Devolve o valor realmente gravado: num PUT repetido o $setOnInsert
    // não roda, então a data original é preservada.
    const r = await estudos.concluirAula({
      userId: String(req.user._id), cursoId, moduloId: aula.moduloId, aulaId, via: 'conclusao_manual', pctVideo: null
    });
    const completedAt = r.completedAt instanceof Date ? r.completedAt : new Date(r.completedAt);
    res.json({ ok: true, aulaId, completedAt: completedAt.toISOString() });
  });

  router.delete('/:aulaId', async (req, res) => {
    const aulaId = String(req.params.aulaId || '').trim();
    await repo('progresso').deleteOne({ userId: String(req.user._id), aulaId });
    res.json({ ok: true });
  });

  return router;
}

export default criarRotaProgresso({ repo: nome => getDb().collection(nome) });
