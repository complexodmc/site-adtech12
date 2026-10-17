// =============================================================
// COMPLEXO DMC · /api/lives — aulas ao vivo (encontros agendados)
//
// Coleção `lives`:
//   { _id:string, cursoId, titulo, descricao, inicioEm:Date,
//     duracaoMin:Number, url, plataforma, createdAt, updatedAt }
//
// O aluno só enxerga live de curso liberado pra ele. O link só sai
// junto quando a sala está aberta (ou pra admin): antes disso não há
// motivo pra entregar a URL do encontro.
// =============================================================
import { Router } from 'express';
import { col } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();

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
function statusDaLive(live, agora = Date.now()) {
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
function livePublica(live, cursoTitulo, isAdmin) {
  const status = statusDaLive(live);
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

// ============ LISTAR ============
// Admin recebe tudo; aluno, só o que está liberado pra ele.
router.get('/', requireAuth, async (req, res) => {
  const isAdmin = !!req.user.isAdmin;

  let filtro = {};
  if (!isAdmin) {
    const libs = await col.liberacoes()
      .find({ userId: String(req.user._id) }, { projection: { cursoId: 1, _id: 0 } })
      .toArray();
    const cursoIds = libs.map(l => l.cursoId);
    if (!cursoIds.length) return res.json({ itens: [] });
    filtro = { cursoId: { $in: cursoIds } };
  }

  const lives = await col.lives().find(filtro).sort({ inicioEm: 1 }).toArray();
  const cursoIds = [...new Set(lives.map(l => l.cursoId).filter(Boolean))];
  const cursos = cursoIds.length
    ? await col.cursos().find({ _id: { $in: cursoIds } }, { projection: { _id: 1, titulo: 1 } }).toArray()
    : [];
  const titulo = new Map(cursos.map(c => [c._id, c.titulo || '']));

  res.json({ itens: lives.map(l => livePublica(l, titulo.get(l.cursoId), isAdmin)) });
});

// ============ CRIAR / EDITAR (admin) ============
router.put('/:id', requireAdmin, async (req, res) => {
  const id = str(req.params.id).trim();
  if (!id) return res.status(400).json({ error: 'ID da live ausente.' });

  const b = req.body || {};
  const cursoId = str(b.cursoId).trim();
  if (!cursoId) return res.status(400).json({ error: 'Selecione o curso da aula ao vivo.' });

  const curso = await col.cursos().findOne({ _id: cursoId }, { projection: { _id: 1 } });
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
  await col.lives().updateOne(
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
router.delete('/:id', requireAdmin, async (req, res) => {
  await col.lives().deleteOne({ _id: str(req.params.id).trim() });
  res.json({ ok: true });
});

export default router;
