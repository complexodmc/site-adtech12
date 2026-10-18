// =============================================================
// COMPLEXO DMC · Portal — autorização por papel, docência e vínculo
// PORTAL-API §2, §4.2, §5.2 · índice §5.3 · dono: F0m.
//
// - Middlewares: exigirPapel, exigirSegundoFatorAdmin, exigirTrocaDeSenha.
//   Respondem DIRETO (403/401 com `codigo` e `requestId`), sem depender
//   do handler de erro de quem os monta.
// - criarAcesso({ repo }): contexto por requisição (memo em
//   req._portalAcesso) e as perguntas de autorização usadas por todas as
//   fatias; também implementa os serviços `equipe.*`.
//
// Regras (API §4.2): docência só vale com papel professor/admin
// (professor rebaixado perde o acesso mesmo com docência gravada);
// professor não precisa de liberação para ver o curso que leciona;
// docente só de turma vê só alunos com matrícula vigente ou concluída
// nas suas turmas (liberação sem matrícula só a docência geral vê).
// `repo(nome)` = getDb().collection(nome) resolvido na hora do uso.
// =============================================================
import { ObjectId } from 'mongodb';
import { PAPEIS, papelDe } from './papeis.js';
import { MENSAGENS } from './erros.js';
import { ID_RE, ID_LEGADO_RE } from './validacao.js';

const MENSAGEM_401 = 'Sessão expirada. Faça login novamente.';

/** Status de matrícula que contam como vínculo do aluno (cancelada não conta). */
export const STATUS_MATRICULA_VIGENTE = Object.freeze(['ativa', 'trancada']);
export const STATUS_MATRICULA_COM_VINCULO = Object.freeze(['ativa', 'trancada', 'concluida']);

function corpoErro(codigo, req) {
  return { error: MENSAGENS[codigo], codigo, ...(req?.requestId ? { requestId: req.requestId } : {}) };
}

// ---------- middlewares ----------
/** Sem req.user → 401 (mensagem do requireAuth); papel fora da lista → 403 `papel-insuficiente`. */
export function exigirPapel(...papeis) {
  const lista = papeis.flat();
  if (!lista.length || lista.some(p => !PAPEIS.includes(p))) throw new TypeError(`exigirPapel: papéis inválidos (${lista.join(', ')}).`);
  return function exigirPapelMiddleware(req, res, next) {
    if (!req.user) return res.status(401).json({ error: MENSAGEM_401 });
    if (!lista.includes(papelDe(req.user))) return res.status(403).json(corpoErro('papel-insuficiente', req));
    return next();
  };
}

/**
 * Com `configPortal.doisFatores` (PORTAL_2FA=1), conta admin sem 2FA ativo recebe 403
 * `2fa-obrigatorio` onde for montado (/portal/admin e /portal/professor). Sem a variável: no-op.
 */
export function exigirSegundoFatorAdmin({ configPortal } = {}) {
  return function exigirSegundoFatorAdminMiddleware(req, res, next) {
    if (configPortal?.doisFatores !== true) return next();
    if (papelDe(req.user) === 'admin' && req.user.doisFatoresAtivo !== true) {
      return res.status(403).json(corpoErro('2fa-obrigatorio', req));
    }
    return next();
  };
}

/**
 * Caminhos (relativos a /api) liberados para quem está com senha temporária (API §5.2).
 * O que é tratado antes do agregador (/api/auth/signin|signup|me, formulários do site) já passou.
 */
export const LIBERADAS_NA_TROCA_DE_SENHA = Object.freeze([
  Object.freeze(['GET', /^\/auth\/recursos\/?$/]),
  Object.freeze(['POST', /^\/auth\/senha\/trocar\/?$/]),
  Object.freeze(['GET', /^\/portal\/saude\/?$/]),
  Object.freeze(['GET', /^\/portal\/validar\/[^/]+\/?$/]),
  Object.freeze(['POST', /^\/portal\/validar\/[^/]+\/conferir\/?$/]),
  Object.freeze(['GET', /^\/portal\/banners\/imagens\/[^/]+$/]),
  Object.freeze(['GET', /^\/portal\/conteudo\/imagens\/[^/]+$/]),
  Object.freeze(['GET', /^\/certificados\/validar\/[^/]+\/?$/]),
  Object.freeze(['GET', /^\/capas\/[^/]+$/])
]);

/**
 * Com `req.user.senhaTemporaria === true`, só a lista acima passa; o resto (inclusive o LMS
 * legado montado depois do agregador) → 403 `troca-de-senha-obrigatoria`. Sem a flag: no-op (D5).
 * Montado dentro do agregador em /api: `req.path` é relativo a /api.
 */
export function exigirTrocaDeSenha(req, res, next) {
  if (req.user?.senhaTemporaria !== true) return next();
  const metodo = req.method === 'HEAD' ? 'GET' : req.method;
  if (metodo === 'OPTIONS') return next();
  const caminho = req.path || '/';
  if (LIBERADAS_NA_TROCA_DE_SENHA.some(([m, re]) => m === metodo && re.test(caminho))) return next();
  return res.status(403).json(corpoErro('troca-de-senha-obrigatoria', req));
}

// ---------- contexto e perguntas de autorização ----------
const texto = v => (v === null || v === undefined ? null : String(v));
const hexDe = v => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && typeof v.toHexString === 'function') return v.toHexString();
  return String(v);
};

/** turmaId para filtro: aceita o hex e grava/consulta como ObjectId (e o texto, por robustez). */
function formasDaTurma(ids) {
  const out = [];
  for (const id of ids) {
    const h = hexDe(id);
    if (!h) continue;
    out.push(h);
    if (ID_RE.test(h)) out.push(new ObjectId(h));
  }
  return out;
}

const vazio = () => ({
  userId: null, papel: null, cursosLiberados: new Set(), docencias: [], cursosDocente: new Set(),
  cursosDocenteGeral: new Set(), turmasDocente: new Map()
});

/**
 * @param {{ repo: (nome: string) => object, servicos?: object }} deps
 * @returns objeto `acesso` da API §4.2 (+ `equipe`: cursosDoProfessor, docencias, professoresDoCurso)
 */
export function criarAcesso({ repo } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarAcesso: informe repo(nome).');

  async function docenciasValidas(userId, papel) {
    if (papel !== 'professor' && papel !== 'admin') return [];
    const docs = await repo('docencias').find({ userId: String(userId) }, { projection: { cursoId: 1, turmaId: 1 } }).toArray();
    return docs.map(d => ({ cursoId: texto(d.cursoId), turmaId: hexDe(d.turmaId) })).filter(d => d.cursoId);
  }

  async function carregar(user) {
    if (!user || !user._id) return vazio();
    const userId = String(user._id);
    const papel = papelDe(user);
    const [libs, docencias] = await Promise.all([
      repo('liberacoes').find({ userId }, { projection: { cursoId: 1 } }).toArray(),
      docenciasValidas(userId, papel)
    ]);
    const ctx = vazio();
    ctx.userId = userId;
    ctx.papel = papel;
    for (const l of libs) if (l.cursoId) ctx.cursosLiberados.add(String(l.cursoId));
    ctx.docencias = docencias;
    for (const d of docencias) {
      ctx.cursosDocente.add(d.cursoId);
      if (d.turmaId === null) ctx.cursosDocenteGeral.add(d.cursoId);
      else {
        if (!ctx.turmasDocente.has(d.cursoId)) ctx.turmasDocente.set(d.cursoId, new Set());
        ctx.turmasDocente.get(d.cursoId).add(d.turmaId);
      }
    }
    return ctx;
  }

  /** Contexto da requisição (1 ida ao banco por requisição; memo em req._portalAcesso). */
  function contexto(req) {
    if (!req) return Promise.resolve(vazio());
    if (!req._portalAcesso || req._portalAcessoUser !== req.user) {
      req._portalAcessoUser = req.user;
      req._portalAcesso = carregar(req.user);
    }
    return req._portalAcesso;
  }

  async function podeVerCurso(req, cursoId) {
    const c = texto(cursoId);
    if (!c) return false;
    const ctx = await contexto(req);
    if (ctx.papel === 'admin') return true;
    return ctx.cursosLiberados.has(c) || ctx.cursosDocente.has(c);
  }

  async function podeGerirConteudo(req, cursoId) {
    const c = texto(cursoId);
    const ctx = await contexto(req);
    if (ctx.papel === 'admin') return true;
    return !!c && ctx.cursosDocenteGeral.has(c);
  }

  async function podeGerirTurma(req, cursoId, turmaId = null) {
    const c = texto(cursoId);
    const ctx = await contexto(req);
    if (ctx.papel === 'admin') return true;
    if (!c) return false;
    if (ctx.cursosDocenteGeral.has(c)) return true;
    const t = hexDe(turmaId);
    return !!t && !!ctx.turmasDocente.get(c)?.has(t);
  }

  async function podeVerMatricula(req, matricula) {
    if (!matricula || typeof matricula !== 'object') return false;
    const ctx = await contexto(req);
    if (!ctx.userId) return false;
    if (texto(matricula.userId) === ctx.userId) return true;
    if (ctx.papel === 'admin') return true;
    return podeGerirTurma(req, matricula.cursoId, matricula.turmaId ?? null);
  }

  async function podeVerAluno(req, userId) {
    const alvo = texto(userId);
    if (!alvo) return false;
    const ctx = await contexto(req);
    if (ctx.papel === 'admin') return true;
    if (!ctx.docencias.length) return false;
    const geral = [...ctx.cursosDocenteGeral];
    if (geral.length) {
      const lib = await repo('liberacoes').findOne({ userId: alvo, cursoId: { $in: geral } }, { projection: { _id: 1 } });
      if (lib) return true;
      const mat = await repo('matriculas').findOne(
        { userId: alvo, cursoId: { $in: geral }, status: { $in: [...STATUS_MATRICULA_COM_VINCULO] } },
        { projection: { _id: 1 } }
      );
      if (mat) return true;
    }
    const turmas = [];
    for (const conjunto of ctx.turmasDocente.values()) turmas.push(...conjunto);
    if (!turmas.length) return false;
    const mat = await repo('matriculas').findOne(
      { userId: alvo, turmaId: { $in: formasDaTurma(turmas) }, status: { $in: [...STATUS_MATRICULA_COM_VINCULO] } },
      { projection: { _id: 1 } }
    );
    return !!mat;
  }

  /** null = todas (admin ou docência geral); [] = sem docência no curso; senão os hex das turmas. */
  async function turmasVisiveis(req, cursoId) {
    const c = texto(cursoId);
    const ctx = await contexto(req);
    if (ctx.papel === 'admin') return null;
    if (c && ctx.cursosDocenteGeral.has(c)) return null;
    return c ? [...(ctx.turmasDocente.get(c) || [])] : [];
  }

  /** liberações ∪ matrículas ativa|trancada|concluida. */
  async function cursosDoAluno(userId) {
    const u = texto(userId);
    if (!u) return [];
    const [libs, mats] = await Promise.all([
      repo('liberacoes').find({ userId: u }, { projection: { cursoId: 1 } }).toArray(),
      repo('matriculas').find({ userId: u, status: { $in: [...STATUS_MATRICULA_COM_VINCULO] } }, { projection: { cursoId: 1 } }).toArray()
    ]);
    return [...new Set([...libs, ...mats].map(d => texto(d.cursoId)).filter(Boolean))];
  }

  /** liberação ∪ matrícula vigente (ativa|trancada) — IA e público 'todos'. */
  async function temVinculo(userId) {
    const u = texto(userId);
    if (!u) return false;
    const lib = await repo('liberacoes').findOne({ userId: u }, { projection: { _id: 1 } });
    if (lib) return true;
    const mat = await repo('matriculas').findOne({ userId: u, status: { $in: [...STATUS_MATRICULA_VIGENTE] } }, { projection: { _id: 1 } });
    return !!mat;
  }

  async function usuarioDaEquipe(userId) {
    const u = texto(userId);
    if (!u || !ID_RE.test(u)) return null;
    const user = await repo('users').findOne({ _id: new ObjectId(u) }, { projection: { isAdmin: 1, papel: 1, desativadoEm: 1 } });
    if (!user || user.desativadoEm) return null;
    const papel = papelDe(user);
    return papel === 'professor' || papel === 'admin' ? { userId: u, papel } : null;
  }

  /** Docências que VALEM (papel professor/admin, conta ativa): [{ cursoId, turmaId:S|null }]. */
  async function docencias(userId) {
    const eq = await usuarioDaEquipe(userId);
    if (!eq) return [];
    return docenciasValidas(eq.userId, eq.papel);
  }

  /**
   * Cursos em que a pessoa tem docência válida (geral ou de turma). Admin: só os que leciona —
   * quem consome trata admin como "todos" pela regra de §4.2.
   */
  async function cursosDoProfessor(userId) {
    return [...new Set((await docencias(userId)).map(d => d.cursoId))];
  }

  /**
   * Docentes gerais do curso + docentes da turma pedida (contas professor/admin ativas).
   * Admins sem docência não entram: veem as filas pelo papel.
   */
  async function professoresDoCurso(cursoId, turmaId = null) {
    const c = texto(cursoId);
    if (!c) return [];
    const t = hexDe(turmaId);
    const filtro = t
      ? { cursoId: c, $or: [{ turmaId: null }, { turmaId: { $in: formasDaTurma([t]) } }] }
      : { cursoId: c, turmaId: null };
    const docs = await repo('docencias').find(filtro, { projection: { userId: 1 } }).toArray();
    const ids = [...new Set(docs.map(d => texto(d.userId)).filter(id => id && ID_RE.test(id)))];
    if (!ids.length) return [];
    const users = await repo('users').find({ _id: { $in: ids.map(id => new ObjectId(id)) } }, { projection: { isAdmin: 1, papel: 1, desativadoEm: 1 } }).toArray();
    const validos = new Set(users.filter(u => !u.desativadoEm && ['professor', 'admin'].includes(papelDe(u))).map(u => String(u._id)));
    return ids.filter(id => validos.has(id));
  }

  async function contextoDaAula(aulaId) {
    const a = texto(aulaId);
    if (!a || !ID_LEGADO_RE.test(a)) return null;
    const aula = await repo('aulas').findOne({ _id: a });
    if (!aula) return null;
    const modulo = aula.moduloId ? await repo('modulos').findOne({ _id: String(aula.moduloId) }) : null;
    if (!modulo || !modulo.cursoId) return null;
    return { aula, modulo, cursoId: String(modulo.cursoId) };
  }

  async function contextoDoModulo(moduloId) {
    const m = texto(moduloId);
    if (!m || !ID_LEGADO_RE.test(m)) return null;
    const modulo = await repo('modulos').findOne({ _id: m });
    if (!modulo || !modulo.cursoId) return null;
    const curso = await repo('cursos').findOne({ _id: String(modulo.cursoId) });
    if (!curso) return null;
    return { modulo, curso };
  }

  /** Serviços `equipe.*` (API §4.4) — mesma regra de docência válida. */
  const equipe = Object.freeze({ cursosDoProfessor, docencias, professoresDoCurso });

  return Object.freeze({
    contexto,
    podeVerCurso,
    podeGerirConteudo,
    podeGerirTurma,
    podeVerMatricula,
    podeVerAluno,
    turmasVisiveis,
    cursosDoAluno,
    temVinculo,
    cursosDoProfessor,
    contextoDaAula,
    contextoDoModulo,
    /** Acréscimo: os serviços `equipe.*` que o agregador registra com nome fixo. */
    equipe
  });
}
