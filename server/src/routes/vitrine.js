// =============================================================
// COMPLEXO DMC · /api/vitrine — catálogo PÚBLICO da DMC Business School
//   GET /api/vitrine/cursos   sem token; só cursos ativos, por `ordem`
//
// Vitrine é divulgação: sai só o que já aparece num card de curso
// (título, subtítulo, descrição, carga horária, modalidade, ícone e
// capa) e as CONTAGENS reais de módulos e aulas, lidas do banco. A
// lista de campos é fechada aqui (paraVitrine): videoUrl, materiais,
// roteiro, linkCheckout e preço nunca saem, venha o que vier da consulta.
//
// `aulas` conta todas as aulas cadastradas do curso, inclusive as
// marcadas "Em breve" — o mesmo número dos cards da loja e do painel.
//
// Este módulo NÃO importa db.js, config.js nem capas.js: o server.js
// injeta `listar` (criarListagemVitrine + col.* + capaUrl). Assim os
// testes rodam sem MongoDB.
// =============================================================
import { Router } from 'express';

export const CACHE_VITRINE = 'public, max-age=300';
export const CAMPOS_VITRINE = Object.freeze([
  'id', 'titulo', 'subtitulo', 'descricao', 'cargaHoraria', 'modalidade', 'iconeKey', 'capaUrl', 'modulos', 'aulas'
]);
export const MENSAGEM_503 = 'Catálogo temporariamente indisponível. Tente novamente em instantes.';

// Só o necessário para o card + `capa.arquivo` (a capa guarda a imagem
// inteira em `capa.dados`, até 8 MB por curso — não pode vir na listagem).
export const PROJECAO_CURSO = Object.freeze({
  titulo: 1, subtitulo: 1, descricao: 1, cargaHoraria: 1, modalidade: 1, iconeKey: 1,
  ordem: 1, isAtivo: 1, 'capa.arquivo': 1
});

const str = (v) => (typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : ''));

function contagem(v) {
  if (Array.isArray(v)) return v.length;
  return Number.isInteger(v) && v >= 0 ? v : 0;
}

/** Card público de um curso: whitelist dos campos do contrato. */
export function paraVitrine(c) {
  return {
    id: String(c.id ?? c._id ?? ''),
    titulo: str(c.titulo),
    subtitulo: str(c.subtitulo),
    descricao: str(c.descricao),
    cargaHoraria: str(c.cargaHoraria),
    modalidade: str(c.modalidade) || 'Online',
    iconeKey: str(c.iconeKey) || 'graduation',
    capaUrl: str(c.capaUrl),
    modulos: contagem(c.modulos),
    aulas: contagem(c.aulas)
  };
}

function resumirErro(err) {
  if (!err) return 'erro desconhecido';
  return `${err.name || 'Error'}${err.code !== undefined ? ` code=${err.code}` : ''}: ${String(err.message || '').slice(0, 300)}`;
}

/**
 * Listagem real a partir das coleções (funções que devolvem a coleção,
 * chamadas só na hora do uso). Três consultas, nenhuma traz vídeo,
 * material ou roteiro: cursos ativos (projeção do card), módulos desses
 * cursos (só _id/cursoId) e a contagem de aulas por módulo (agregação).
 */
export function criarListagemVitrine({ cursos, modulos, aulas, capaUrl = () => '' }) {
  for (const [nome, fn] of Object.entries({ cursos, modulos, aulas, capaUrl })) {
    if (typeof fn !== 'function') throw new Error(`criarListagemVitrine: informe ${nome}().`);
  }
  return async function listar() {
    const docs = await cursos()
      .find({ isAtivo: { $ne: false } }, { projection: PROJECAO_CURSO })
      .sort({ ordem: 1 })
      .toArray();
    if (!docs.length) return [];

    const mods = await modulos()
      .find({ cursoId: { $in: docs.map(c => c._id) } }, { projection: { _id: 1, cursoId: 1 } })
      .toArray();
    const cursoDoModulo = new Map();
    const nModulos = new Map();
    for (const m of mods) {
      const cid = String(m.cursoId);
      cursoDoModulo.set(String(m._id), cid);
      nModulos.set(cid, (nModulos.get(cid) || 0) + 1);
    }

    const nAulas = new Map();
    if (mods.length) {
      const grupos = await aulas().aggregate([
        { $match: { moduloId: { $in: mods.map(m => m._id) } } },
        { $group: { _id: '$moduloId', n: { $sum: 1 } } }
      ]).toArray();
      for (const g of grupos) {
        const cid = cursoDoModulo.get(String(g._id));
        if (cid !== undefined) nAulas.set(cid, (nAulas.get(cid) || 0) + (Number(g.n) || 0));
      }
    }

    return docs.map(c => ({
      id: c._id,
      titulo: c.titulo,
      subtitulo: c.subtitulo,
      descricao: c.descricao,
      cargaHoraria: c.cargaHoraria,
      modalidade: c.modalidade,
      iconeKey: c.iconeKey,
      ordem: c.ordem,
      isAtivo: c.isAtivo,
      capaUrl: capaUrl(c),
      modulos: nModulos.get(String(c._id)) || 0,
      aulas: nAulas.get(String(c._id)) || 0
    }));
  };
}

export function criarRotaVitrine({ listar, log = console }) {
  if (typeof listar !== 'function') throw new Error('criarRotaVitrine: informe listar().');
  const router = Router();

  router.get('/cursos', async (_req, res) => {
    let itens;
    try {
      itens = await listar();
    } catch (err) {
      log.error('[DMC] vitrine: falha ao listar cursos:', resumirErro(err));
      res.set('Cache-Control', 'no-store');
      return res.status(503).json({ error: MENSAGEM_503 });
    }
    // Filtro e ordem de novo aqui: a garantia não depende de quem lista.
    const cursos = (Array.isArray(itens) ? itens : [])
      .filter(c => c && typeof c === 'object' && c.isAtivo !== false)
      .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0))
      .map(paraVitrine);
    res.set('Cache-Control', CACHE_VITRINE);
    res.json({ cursos });
  });

  return router;
}
