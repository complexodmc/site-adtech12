// =============================================================
// COMPLEXO DMC · /api/lives — aulas ao vivo (encontros agendados) · LEGADO
//
// Coleção `lives`:
//   { _id:string, cursoId, titulo, descricao, inicioEm:Date,
//     duracaoMin:Number, url, plataforma, createdAt, updatedAt }
//   + campos do Portal (dono F3a, PORTAL-API §3.2): turmaId, moduloId,
//     aulaGravadaId, cancelado…, versao — nunca apagados pelo PUT legado.
//
// O aluno só enxerga live de curso liberado pra ele. O link só sai
// junto quando a sala está aberta (ou pra admin): antes disso não há
// motivo pra entregar a URL do encontro.
//
// Acréscimos do Portal (F3a, D-40, API §7.5), sem mudar nada para encontro
// SEM `turmaId` (R8, R12):
// - encontro com `turmaId` só aparece ao aluno cuja matrícula vigente no
//   curso é daquela turma;
// - professor (papel `professor`) vê os encontros dos cursos em que leciona
//   (docência), sem URL fora da janela, como o aluno;
// - DELETE consulta o grupo `cascata` (frequência ligada → 409; use o
//   cancelamento do Portal).
// Fábrica testável: criarRotaLives({ repo, servicos, agora }).
// =============================================================
import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { servicos as servicosDoProcesso, bloqueiosEmCascata, apagarEmCascata } from '../portal/servicos.js';
import { papelDe } from '../portal/papeis.js';

const str = v => (v == null ? '' : String(v));

const TITULO_MAX = 180;
const DESCRICAO_MAX = 2000;

/** Antecedência com que a sala passa a valer como aberta. */
const ABRE_ANTES_MIN = 15;

const DURACAO_PADRAO_MIN = 90;

/**
 * Estado do encontro no instante da consulta.
 * 'ao-vivo' cobre a janela [início − 15min, início + duração].
 */
export function statusDaLive(live, agora = Date.now()) {
  const inicio = new Date(live.inicioEm).getTime();
  if (!Number.isFinite(inicio)) return 'agendada';
  const duracao = (Number(live.duracaoMin) || DURACAO_PADRAO_MIN) * 60000;
  if (agora < inicio - ABRE_ANTES_MIN * 60000) return 'agendada';
  if (agora <= inicio + duracao) return 'ao-vivo';
  return 'encerrada';
}

/**
 * `isAdmin` decide quem recebe a URL: o admin sempre (precisa dela pra
 * reeditar o encontro sem apagar o link), o aluno só com a sala aberta.
 */
function livePublica(live, cursoTitulo, isAdmin, agora) {
  const status = statusDaLive(live, agora);
  return {
    id: live._id,
    cursoId: live.cursoId,
    cursoTitulo: cursoTitulo || '—',
    titulo: live.titulo || '',
    descricao: live.descricao || '',
    inicioEm: live.inicioEm instanceof Date ? live.inicioEm.toISOString() : live.inicioEm,
    duracaoMin: Number(live.duracaoMin) || DURACAO_PADRAO_MIN,
    plataforma: live.plataforma || 'Online',
    status,
    // A URL só acompanha quando dá pra usar. Entregar antes faria o botão
    // "entrar na sala" aparecer em encontro que ainda nem abriu.
    url: (isAdmin || status === 'ao-vivo') ? str(live.url) : ''
  };
}

const hex = v => (v == null ? null : String(v));

/**
 * @param {{ repo?: (nome:string) => object, servicos?: object, agora?: () => number, log?: Console,
 *           exigirLogin?: Function, exigirAdmin?: Function }} deps
 */
export function criarRotaLives({
  repo = nome => getDb().collection(nome), servicos = servicosDoProcesso, agora = () => Date.now(), log = console,
  exigirLogin = requireAuth, exigirAdmin = requireAdmin
} = {}) {
  const router = Router();
  const avisar = (texto) => { try { (log.warn || log.error).call(log, `[portal] ${texto}`); } catch { /* nada */ } };

  // ============ LISTAR ============
  // Admin recebe tudo; aluno, só o que está liberado pra ele.
  router.get('/', exigirLogin, async (req, res) => {
    const isAdmin = !!req.user.isAdmin;
    const userId = String(req.user._id);

    let filtro = {};
    let turmaDoCurso = new Map();
    if (!isAdmin) {
      const libs = await repo('liberacoes')
        .find({ userId }, { projection: { cursoId: 1, _id: 0 } })
        .toArray();
      const cursoIds = new Set(libs.map(l => l.cursoId));
      // Acréscimo (F3a): professor vê os cursos em que leciona.
      if (papelDe(req.user) === 'professor') {
        try {
          const docs = await repo('docencias').find({ userId }, { projection: { cursoId: 1 } }).toArray();
          for (const d of docs) if (d.cursoId) cursoIds.add(String(d.cursoId));
        } catch { avisar('docências indisponíveis na rota legada de lives'); }
      }
      if (!cursoIds.size) return res.json({ itens: [] });
      filtro = { cursoId: { $in: [...cursoIds] } };
      // Turma da matrícula vigente por curso (encontro com turmaId só para a turma dele).
      try {
        const mats = await repo('matriculas')
          .find({ userId, status: { $in: ['ativa', 'trancada'] } }, { projection: { cursoId: 1, turmaId: 1 } })
          .toArray();
        turmaDoCurso = new Map(mats.map(m => [String(m.cursoId), hex(m.turmaId)]));
      } catch { avisar('matrículas indisponíveis na rota legada de lives'); }
    }

    const ehProfessor = !isAdmin && papelDe(req.user) === 'professor';
    let lives = await repo('lives').find(filtro).sort({ inicioEm: 1 }).toArray();
    if (!isAdmin && !ehProfessor) {
      lives = lives.filter(l => l.turmaId == null || hex(l.turmaId) === (turmaDoCurso.get(String(l.cursoId)) ?? '__nenhuma__'));
    }
    const cursoIds = [...new Set(lives.map(l => l.cursoId).filter(Boolean))];
    const cursos = cursoIds.length
      ? await repo('cursos').find({ _id: { $in: cursoIds } }, { projection: { _id: 1, titulo: 1 } }).toArray()
      : [];
    const titulo = new Map(cursos.map(c => [c._id, c.titulo || '']));

    const t = agora();
    res.json({ itens: lives.map(l => livePublica(l, titulo.get(l.cursoId), isAdmin, t)) });
  });

  // ============ CRIAR / EDITAR (admin) ============
  router.put('/:id', exigirAdmin, async (req, res) => {
    const id = str(req.params.id).trim();
    if (!id) return res.status(400).json({ error: 'ID da live ausente.' });

    const b = req.body || {};
    const cursoId = str(b.cursoId).trim();
    if (!cursoId) return res.status(400).json({ error: 'Selecione o curso da aula ao vivo.' });

    const curso = await repo('cursos').findOne({ _id: cursoId }, { projection: { _id: 1 } });
    if (!curso) return res.status(404).json({ error: 'Curso não encontrado.' });

    const titulo = str(b.titulo).trim().slice(0, TITULO_MAX);
    if (!titulo) return res.status(400).json({ error: 'Informe o título da aula ao vivo.' });

    const inicio = new Date(str(b.inicioEm));
    if (!Number.isFinite(inicio.getTime())) {
      return res.status(400).json({ error: 'Informe uma data e hora válidas para o encontro.' });
    }

    const url = str(b.url).trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'O link deve começar com http:// ou https://.' });
    }

    const now = new Date();
    // $set só dos campos legados: turmaId, moduloId, aulaGravadaId e afins (F3a) ficam.
    await repo('lives').updateOne(
      { _id: id },
      {
        $set: {
          cursoId,
          titulo,
          descricao: str(b.descricao).slice(0, DESCRICAO_MAX),
          inicioEm: inicio,
          duracaoMin: Number(b.duracaoMin) || DURACAO_PADRAO_MIN,
          url,
          plataforma: str(b.plataforma).trim().slice(0, 60) || 'Online',
          updatedAt: now
        },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    );

    res.json({ ok: true, id });
  });

  // ============ REMOVER (admin) ============
  router.delete('/:id', exigirAdmin, async (req, res) => {
    const id = str(req.params.id).trim();
    const alvo = { tipo: 'encontro', id };
    // Grupo `cascata` (F3a, API §7.4): presença registrada bloqueia a exclusão.
    const b = await bloqueiosEmCascata(servicos, alvo, { log });
    if (b.total > 0) {
      return res.status(409).json({ error: 'Há presenças registradas neste encontro. Cancele o encontro em vez de excluir.', codigo: 'tem-registros' });
    }
    if (b.falhas.length) avisar('cascata indisponível no DELETE legado de lives; exclusão segue como hoje');
    await apagarEmCascata(servicos, alvo, { log });
    await repo('lives').deleteOne({ _id: id });
    res.json({ ok: true });
  });

  return router;
}

const router = criarRotaLives();
export default router;
