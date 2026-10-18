// =============================================================
// COMPLEXO DMC · /api — catálogo (cursos → módulos → aulas)
// Leitura: qualquer usuário autenticado.
// Escrita: só admin. Delete faz cascata na mão (Mongo não tem FK).
//
// Portal (PORTAL-API §6.13, §7.1, §7.4 · DC-74 · dono: F1a):
// - Curso SEM acesso (liberação, docência ou admin) continua com módulos e
//   aulas (título, duração, ordem, disponivel — a loja e os cards contam
//   "N módulos · M aulas"), mas com videoUrl:'', materiais:[] e video:null.
// - Aditivos: curso.liberado, curso.sigla, curso.nivel, modulo.chHoras,
//   aula.video (normalizarVideo), aula.codigo, aula.rotuloEncontro.
//   `roteiro` segue só admin.
// - PUT /aulas/:id aceita `rotuloEncontro` (só grava quando vem no corpo).
// - DELETE de curso, módulo e aula consulta o grupo `cascata`: bloqueio →
//   409 `tem-registros`; membro que falha → 503 e nada é apagado; sem
//   bloqueio, a cascata atual segue e chama `apagar` de cada membro.
// =============================================================
import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { materiaisPublicos, apagarArquivosDeAulas } from './materiais.js';
import { capaUrl, apagarCapasDeCursos } from './capas.js';
import { servicos as servicosDoProcesso, bloqueiosEmCascata, apagarEmCascata } from '../portal/servicos.js';
import { criarAcesso } from '../portal/acesso.js';
import { MENSAGENS } from '../portal/erros.js';
import { normalizarVideo } from '../portal/estudos/video.js';

const str = v => (v == null ? '' : String(v));
const idOf = v => str(v).trim();

/** Teto do roteiro de gravação — ~20 mil caracteres cobre roteiro longo. */
const ROTEIRO_MAX = 20000;
const ROTULO_ENCONTRO_MAX = 60;

/**
 * @param {{ repo: (nome: string) => object, servicos?: object, exigirLogin?: Function,
 *   exigirAdmin?: Function|Function[], log?: object }} deps
 */
export function criarRotaCatalogo({ repo, servicos = servicosDoProcesso, exigirLogin = requireAuth, exigirAdmin = requireAdmin, log = console } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarRotaCatalogo: informe repo.');
  const acessoProprio = criarAcesso({ repo });
  const acessoDe = () => servicos.tentar('acesso') || acessoProprio;
  const soAdmin = Array.isArray(exigirAdmin) ? exigirAdmin : [exigirAdmin];
  const col = {
    cursos: () => repo('cursos'), modulos: () => repo('modulos'), aulas: () => repo('aulas'),
    progresso: () => repo('progresso'), duvidas: () => repo('duvidas'), lives: () => repo('lives'),
    certificados: () => repo('certificados'), liberacoes: () => repo('liberacoes')
  };

  const router = Router();

  /** Grupo `cascata` (§7.4): → null (pode apagar) ou a resposta já enviada. */
  async function conferirCascata(res, alvo) {
    const r = await bloqueiosEmCascata(servicos, alvo, { log });
    if (r.falhas.length) {
      res.status(503).json({ error: MENSAGENS['servico-indisponivel'], codigo: 'servico-indisponivel' });
      return true;
    }
    if (r.total > 0) {
      res.status(409).json({ error: MENSAGENS['tem-registros'], codigo: 'tem-registros', bloqueios: r.porDominio });
      return true;
    }
    return false;
  }

  // ============ LEITURA ============
  router.get('/catalogo', exigirLogin, async (req, res) => {
    // Roteiro de gravação é anotação interna: só viaja pro painel admin.
    const isAdmin = !!req.user.isAdmin;
    const ctx = await acessoDe().contexto(req);
    const acessivel = cursoId => isAdmin || ctx.cursosLiberados.has(String(cursoId)) || ctx.cursosDocente.has(String(cursoId));

    const [cursos, modulos, aulas] = await Promise.all([
      col.cursos().find({}).sort({ ordem: 1 }).toArray(),
      col.modulos().find({}).sort({ ordem: 1 }).toArray(),
      col.aulas().find({}).sort({ ordem: 1 }).toArray()
    ]);
    const cursoDoModulo = new Map(modulos.map(m => [m._id, m.cursoId]));

    const aulasByModulo = new Map();
    for (const a of aulas) {
      if (!aulasByModulo.has(a.moduloId)) aulasByModulo.set(a.moduloId, []);
      // Aula marcada como indisponível aparece na lista do aluno (como "Em
      // breve"), mas sem vídeo nem material: esconder só na tela deixaria o
      // link do vídeo à mão de quem abrisse o DevTools. O mesmo vale para
      // curso sem acesso (API §7.1).
      const disponivel = a.disponivel !== false;
      const entregaConteudo = isAdmin || (disponivel && acessivel(cursoDoModulo.get(a.moduloId)));
      aulasByModulo.get(a.moduloId).push({
        id: a._id,
        moduloId: a.moduloId,
        titulo: a.titulo || '',
        duracao: a.duracao || '',
        videoUrl: entregaConteudo ? (a.videoUrl || '') : '',
        ordem: a.ordem || 0,
        disponivel,
        materiais: entregaConteudo ? materiaisPublicos(a) : [],
        video: entregaConteudo ? normalizarVideo(a.videoUrl) : null,
        codigo: a.codigo || null,
        rotuloEncontro: typeof a.rotuloEncontro === 'string' && a.rotuloEncontro.trim() ? a.rotuloEncontro.trim() : null,
        ...(isAdmin ? { roteiro: a.roteiro || '' } : {})
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
        chHoras: Number.isFinite(m.chHoras) ? m.chHoras : null,
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
        capaUrl: capaUrl(c),
        liberado: acessivel(c._id),
        sigla: typeof c.sigla === 'string' ? c.sigla : null,
        nivel: typeof c.nivel === 'string' ? c.nivel : null,
        modulos: modulosByCurso.get(c._id) || []
      }))
    });
  });

// ============ CURSOS (admin) ============
router.put('/cursos/:id', ...soAdmin, async (req, res) => {
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

router.delete('/cursos/:id', ...soAdmin, async (req, res) => {
  const id = idOf(req.params.id);
  if (await conferirCascata(res, { tipo: 'curso', id })) return;
  // Membros do grupo apagam o que é deles ANTES (ainda enxergam a estrutura).
  await apagarEmCascata(servicos, { tipo: 'curso', id }, { log });
  const curso = await col.cursos().findOne({ _id: id }, { projection: { _id: 1, capa: 1 } });
  if (curso) await apagarCapasDeCursos([curso]);

  const modulos = await col.modulos().find({ cursoId: id }, { projection: { _id: 1 } }).toArray();
  const moduloIds = modulos.map(m => m._id);
  const aulas = moduloIds.length
    ? await col.aulas().find({ moduloId: { $in: moduloIds } }, { projection: { _id: 1, materiais: 1 } }).toArray()
    : [];
  const aulaIds = aulas.map(a => a._id);
  await apagarArquivosDeAulas(aulas);

  await Promise.all([
    aulaIds.length ? col.progresso().deleteMany({ aulaId: { $in: aulaIds } }) : null,
    aulaIds.length ? col.aulas().deleteMany({ _id: { $in: aulaIds } }) : null,
    moduloIds.length ? col.modulos().deleteMany({ _id: { $in: moduloIds } }) : null,
    col.duvidas().deleteMany({ cursoId: id }),
    col.lives().deleteMany({ cursoId: id }),
    col.certificados().deleteMany({ cursoId: id }),
    col.liberacoes().deleteMany({ cursoId: id }),
    col.cursos().deleteOne({ _id: id })
  ].filter(Boolean));

  res.json({ ok: true });
});

// ============ MÓDULOS (admin) ============

/**
 * Grava a ordem de TODOS os módulos de um curso numa chamada só.
 *
 * A tela de administração reordenava trocando dois módulos de lugar e
 * mandando dois PUT completos por passo — arrastar o módulo 10 até o
 * topo custava 18 requisições e 9 recargas do catálogo. Aqui a lista
 * inteira chega pronta e vira um único `bulkWrite`.
 *
 * Precisa vir antes de `/modulos/:id`, senão o Express casa "ordem"
 * como se fosse um id de módulo.
 */
router.put('/modulos/ordem', ...soAdmin, async (req, res) => {
  const cursoId = idOf(req.body.cursoId);
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(idOf).filter(Boolean);
  if (!cursoId) return res.status(400).json({ error: 'cursoId é obrigatório.' });
  if (!ids.length) return res.status(400).json({ error: 'Envie a lista de módulos em ids.' });

  // Só reordena o que é do curso informado: um id de outro curso no
  // corpo da requisição não pode mexer em módulo alheio.
  const doCurso = await col.modulos()
    .find({ cursoId, _id: { $in: ids } }, { projection: { _id: 1 } })
    .toArray();
  const validos = new Set(doCurso.map(m => m._id));
  const ordenados = ids.filter(id => validos.has(id));
  if (!ordenados.length) return res.status(404).json({ error: 'Nenhum módulo do curso na lista.' });

  const now = new Date();
  await col.modulos().bulkWrite(ordenados.map((id, i) => ({
    updateOne: { filter: { _id: id }, update: { $set: { ordem: i + 1, updatedAt: now } } }
  })));
  res.json({ ok: true, total: ordenados.length });
});

router.put('/modulos/:id', ...soAdmin, async (req, res) => {
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

router.delete('/modulos/:id', ...soAdmin, async (req, res) => {
  const id = idOf(req.params.id);
  if (await conferirCascata(res, { tipo: 'modulo', id })) return;
  // Membros do grupo apagam o que é deles ANTES (ainda enxergam a estrutura).
  await apagarEmCascata(servicos, { tipo: 'modulo', id }, { log });
  const aulas = await col.aulas().find({ moduloId: id }, { projection: { _id: 1, materiais: 1 } }).toArray();
  const aulaIds = aulas.map(a => a._id);
  await apagarArquivosDeAulas(aulas);

  await Promise.all([
    aulaIds.length ? col.progresso().deleteMany({ aulaId: { $in: aulaIds } }) : null,
    aulaIds.length ? col.aulas().deleteMany({ _id: { $in: aulaIds } }) : null,
    col.duvidas().deleteMany({ moduloId: id }),
    col.modulos().deleteOne({ _id: id })
  ].filter(Boolean));

  res.json({ ok: true });
});

// ============ AULAS (admin) ============
router.put('/aulas/:id', ...soAdmin, async (req, res) => {
  const id = idOf(req.params.id);
  const moduloId = idOf(req.body.moduloId);
  if (!id) return res.status(400).json({ error: 'ID da aula ausente.' });
  if (!moduloId) return res.status(400).json({ error: 'moduloId é obrigatório.' });

  const modulo = await col.modulos().findOne({ _id: moduloId }, { projection: { _id: 1 } });
  if (!modulo) return res.status(404).json({ error: 'Módulo não encontrado.' });

  const b = req.body || {};
  const now = new Date();
  const campos = {
    moduloId,
    titulo: str(b.titulo),
    duracao: str(b.duracao),
    videoUrl: str(b.videoUrl),
    ordem: Number(b.ordem) || 0,
    // Aula nasce disponível; só fica "em breve" quando o admin desmarca.
    disponivel: b.disponivel !== false,
    updatedAt: now
  };
  // Roteiro só é gravado quando vem no corpo — assim uma chamada que não
  // conhece o campo (reordenação antiga, script) não apaga o texto escrito.
  if (b.roteiro !== undefined) campos.roteiro = str(b.roteiro).slice(0, ROTEIRO_MAX);
  // Idem para o rótulo do encontro (F1a, aditivo): ausente não apaga.
  if (b.rotuloEncontro !== undefined) {
    if (b.rotuloEncontro !== null && typeof b.rotuloEncontro !== 'string') {
      return res.status(400).json({ error: MENSAGENS['formato-invalido'], codigo: 'formato-invalido', campos: { rotuloEncontro: 'Formato inválido.' } });
    }
    const rotulo = str(b.rotuloEncontro).replace(/[\r\n\t]+/g, ' ').trim();
    if (rotulo.length > ROTULO_ENCONTRO_MAX) {
      return res.status(400).json({ error: MENSAGENS.validacao, codigo: 'validacao', campos: { rotuloEncontro: `Use no máximo ${ROTULO_ENCONTRO_MAX} caracteres.` } });
    }
    campos.rotuloEncontro = rotulo;
  }

  await col.aulas().updateOne(
    { _id: id },
    {
      $set: campos,
      // materiais são gerenciados pelas rotas de /materiais — nunca sobrescritos aqui.
      $setOnInsert: { createdAt: now, materiais: [] }
    },
    { upsert: true }
  );
  res.json({ ok: true, id });
});

router.delete('/aulas/:id', ...soAdmin, async (req, res) => {
  const id = idOf(req.params.id);
  if (await conferirCascata(res, { tipo: 'aula', id })) return;
  // Membros do grupo apagam o que é deles ANTES (ainda enxergam a estrutura).
  await apagarEmCascata(servicos, { tipo: 'aula', id }, { log });
  const aula = await col.aulas().findOne({ _id: id }, { projection: { _id: 1, materiais: 1 } });
  if (aula) await apagarArquivosDeAulas([aula]);
  await Promise.all([
    col.progresso().deleteMany({ aulaId: id }),
    col.duvidas().deleteMany({ aulaId: id }),
    col.aulas().deleteOne({ _id: id })
  ]);
  res.json({ ok: true });
});

  return router;
}

export default criarRotaCatalogo({ repo: nome => getDb().collection(nome) });
