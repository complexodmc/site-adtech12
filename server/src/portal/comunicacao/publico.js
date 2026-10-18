// =============================================================
// COMPLEXO DMC · Portal — comunicação: público-alvo, vigência e índices
// PORTAL-API §6.11.1–§6.11.2 · §3.3 (F7) · índice §8.5 (F7) · dono: F7.
//
// Uma regra só para publicações e banners, aplicada NO SERVIDOR:
// - quem pode ESCOLHER o público (`conferirPublico`): 'todos' só admin;
//   professor só curso com docência GERAL válida agora, ou turma em que
//   tem docência (geral do curso ou da própria turma); fora → 403
//   `publico-fora-dos-seus-cursos`;
// - quem VÊ (`escopoDoLeitor` + `filtroDeVisibilidade`/`visivelPara`):
//   'todos' exige vínculo (liberação ou matrícula vigente) para o aluno;
//   curso → cursos do aluno (ou da docência); turma → turmas da matrícula
//   vigente (`secretaria.turmasDoAluno`, F4a) ou da docência.
// Sem a F4a, público por turma fica indisponível (400 na escrita; ninguém
// vê por turma na leitura) — nunca dado inventado (D7).
// =============================================================
import { ObjectId } from 'mongodb';
import { ErroPortal } from '../erros.js';
import { papelDe } from '../papeis.js';
import { ID_RE, ID_LEGADO_RE, validarUrlHttps, validarLinkInterno } from '../validacao.js';

export const TIPOS_PUBLICO = Object.freeze(['todos', 'curso', 'turma']);
export const PAPEIS_BANNER = Object.freeze(['aluno', 'professor', 'admin']);
export const MAX_DESTINOS = 30;

export const INDICES_PUBLICACOES = Object.freeze([
  { colecao: 'publicacoes', chave: { status: 1, fixada: -1, publicadaEm: -1 }, opcoes: { name: 'ix_pub_status' } },
  { colecao: 'publicacoes', chave: { 'publico.cursoIds': 1 }, opcoes: { name: 'ix_pub_cursos' } },
  { colecao: 'publicacoes', chave: { 'publico.turmaIds': 1 }, opcoes: { name: 'ix_pub_turmas' } },
  { colecao: 'publicacoes', chave: { 'autor.userId': 1, criadoEm: -1 }, opcoes: { name: 'ix_pub_autor' } }
]);

export const INDICES_BANNERS = Object.freeze([
  { colecao: 'banners', chave: { ativo: 1, local: 1, inicioEm: 1, fimEm: 1 }, opcoes: { name: 'ix_ban_vigencia' } },
  {
    colecao: 'banners', chave: { 'imagem.arquivo': 1 },
    opcoes: { name: 'uq_ban_imagem', unique: true, partialFilterExpression: { 'imagem.arquivo': { $type: 'string' } } }
  }
]);

const invalido = (campos, mensagem = 'Confira os campos destacados.') => new ErroPortal(400, 'validacao', mensagem, { campos });
const hexDe = v => (v instanceof ObjectId ? v.toHexString() : (typeof v === 'string' && ID_RE.test(v) ? v : null));

/** Hex de cada turmaId (ObjectId ou string). */
export const turmasHex = lista => (Array.isArray(lista) ? lista.map(hexDe).filter(Boolean) : []);

/**
 * Lê o objeto `publico` do corpo (só forma). Banners levam também `papeis`.
 * @returns {{ tipo, cursoIds:string[], turmaIds:string[], papeis?:string[] }}
 */
export function lerPublico(bruto, { comPapeis = false, campo = 'publico' } = {}) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) throw invalido({ [campo]: 'Escolha o público.' });
  const tipo = bruto.tipo;
  if (typeof tipo !== 'string' || !TIPOS_PUBLICO.includes(tipo)) throw invalido({ [campo]: 'Escolha o público.' });
  const lista = (v, re, nome) => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.length > MAX_DESTINOS || v.some(x => typeof x !== 'string' || !re.test(x))) {
      throw new ErroPortal(400, 'formato-invalido', 'Formato inválido.', { campos: { [campo]: `Lista de ${nome} inválida.` } });
    }
    return [...new Set(v)];
  };
  const cursoIds = lista(bruto.cursoIds, ID_LEGADO_RE, 'cursos');
  const turmaIds = lista(bruto.turmaIds, ID_RE, 'turmas');
  if (tipo === 'curso' && !cursoIds.length) throw invalido({ [campo]: 'Escolha pelo menos um curso.' });
  if (tipo === 'turma' && !turmaIds.length) throw invalido({ [campo]: 'Escolha pelo menos uma turma.' });
  const out = { tipo, cursoIds: tipo === 'curso' ? cursoIds : [], turmaIds: tipo === 'turma' ? turmaIds : [] };
  if (comPapeis) {
    const papeis = bruto.papeis;
    if (!Array.isArray(papeis) || !papeis.length || papeis.some(p => !PAPEIS_BANNER.includes(p))) {
      throw invalido({ [campo]: 'Escolha para quem o banner aparece (aluno, professor ou coordenação).' });
    }
    out.papeis = [...new Set(papeis)];
  }
  return out;
}

/**
 * Confere o público contra a docência VÁLIDA AGORA e contra o banco (curso e turma existem).
 * Devolve o público normalizado para gravar (turmaIds como ObjectId; cursoIds das turmas).
 * @param {object} req requisição (req.user)
 * @param {{ tipo, cursoIds, turmaIds, papeis? }} publico saída de lerPublico (ou o gravado)
 * @param {{ acesso, servicos, repo }} deps
 */
export async function conferirPublico(req, publico, { acesso, servicos, repo }) {
  const papel = papelDe(req?.user);
  const admin = papel === 'admin';
  const fora = () => new ErroPortal(403, 'publico-fora-dos-seus-cursos');
  const ctx = admin ? null : await acesso.contexto(req);
  const extra = Array.isArray(publico.papeis) ? { papeis: [...publico.papeis] } : {};
  if (publico.tipo === 'todos') {
    if (!admin) throw fora();
    return { tipo: 'todos', cursoIds: [], turmaIds: [], ...extra };
  }
  if (publico.tipo === 'curso') {
    const cursoIds = [...new Set(publico.cursoIds.map(String))];
    if (!admin && cursoIds.some(c => !ctx.cursosDocenteGeral.has(c))) throw fora();
    const existentes = await repo('cursos').find({ _id: { $in: cursoIds } }, { projection: { _id: 1 } }).toArray();
    if (existentes.length !== cursoIds.length) throw invalido({ publico: 'Algum curso escolhido não existe mais.' });
    return { tipo: 'curso', cursoIds, turmaIds: [], ...extra };
  }
  // turma: precisa da F4a para saber de que curso é cada turma
  const turmasDoCurso = servicos.tentar('secretaria.turmasDoCurso');
  if (typeof turmasDoCurso !== 'function') throw invalido({ publico: 'Público por turma indisponível no momento. Escolha curso.' }, 'Público por turma indisponível no momento.');
  const pedidas = new Set(turmaIds(publico));
  const candidatos = admin
    ? (await repo('cursos').find({}, { projection: { _id: 1 } }).limit(500).toArray()).map(c => String(c._id))
    : [...ctx.cursosDocente];
  const cursoDe = new Map();
  for (const cursoId of candidatos) {
    let turmas = [];
    try { turmas = await turmasDoCurso(cursoId); } catch { turmas = []; }
    for (const t of turmas || []) {
      const id = hexDe(t?.id ?? t?._id);
      if (id && pedidas.has(id)) cursoDe.set(id, cursoId);
    }
  }
  for (const t of pedidas) {
    const c = cursoDe.get(t);
    if (!c) {
      if (!admin) throw fora();
      throw invalido({ publico: 'Alguma turma escolhida não existe mais.' });
    }
    if (!admin && !(ctx.cursosDocenteGeral.has(c) || ctx.turmasDocente.get(c)?.has(t))) throw fora();
  }
  return {
    tipo: 'turma',
    cursoIds: [...new Set([...pedidas].map(t => cursoDe.get(t)))],
    turmaIds: [...pedidas].map(t => new ObjectId(t)),
    ...extra
  };
}

function turmaIds(publico) { return turmasHex(publico.turmaIds); }

/**
 * Escopo de leitura de quem pede: papel, vínculo, cursos e turmas.
 * @returns {Promise<{ userId, papel, admin:boolean, vinculo:boolean, cursos:Set<string>, turmas:Set<string>, turmasDisponiveis:boolean }>}
 */
export async function escopoDoLeitor(req, { acesso, servicos }) {
  const userId = String(req.user._id);
  const papel = papelDe(req.user);
  if (papel === 'admin') return { userId, papel, admin: true, vinculo: true, cursos: new Set(), turmas: new Set(), turmasDisponiveis: true };
  const [ctx, cursosAluno, vinculo] = await Promise.all([
    acesso.contexto(req),
    acesso.cursosDoAluno(userId).catch(() => []),
    acesso.temVinculo(userId).catch(() => false)
  ]);
  const cursos = new Set([...(cursosAluno || []).map(String), ...ctx.cursosDocente]);
  const turmas = new Set();
  for (const s of ctx.turmasDocente.values()) for (const t of s) turmas.add(t);
  const turmasDoAluno = servicos.tentar('secretaria.turmasDoAluno');
  let turmasDisponiveis = false;
  if (typeof turmasDoAluno === 'function') {
    try {
      for (const t of (await turmasDoAluno(userId)) || []) { const h = hexDe(t); if (h) turmas.add(h); }
      turmasDisponiveis = true;
    } catch { /* sem turmas: público por turma não aparece (D7) */ }
  }
  // Docência geral vê as publicações de todas as turmas do curso (é dela o curso inteiro).
  return { userId, papel, admin: false, vinculo: vinculo || ctx.cursosDocente.size > 0, cursos, turmas, turmasDisponiveis, cursosGeral: ctx.cursosDocenteGeral };
}

/** Filtro Mongo do público visível ao escopo (sem o status). null = tudo (admin). */
export function filtroDeVisibilidade(escopo) {
  if (escopo.admin) return null;
  const ou = [];
  if (escopo.vinculo) ou.push({ 'publico.tipo': 'todos' });
  if (escopo.cursos.size) ou.push({ 'publico.tipo': 'curso', 'publico.cursoIds': { $in: [...escopo.cursos] } });
  if (escopo.turmas.size) ou.push({ 'publico.tipo': 'turma', 'publico.turmaIds': { $in: [...escopo.turmas].map(t => new ObjectId(t)) } });
  if (escopo.cursosGeral && escopo.cursosGeral.size) ou.push({ 'publico.tipo': 'turma', 'publico.cursoIds': { $in: [...escopo.cursosGeral] } });
  return ou.length ? { $or: ou } : { _id: { $in: [] } };
}

/** A mesma regra em memória (para conferir um documento já lido). */
export function visivelPara(publico, escopo) {
  if (escopo.admin) return true;
  if (!publico || typeof publico !== 'object') return false;
  if (publico.tipo === 'todos') return escopo.vinculo;
  if (publico.tipo === 'curso') return (publico.cursoIds || []).some(c => escopo.cursos.has(String(c)));
  if (publico.tipo === 'turma') {
    if (turmasHex(publico.turmaIds).some(t => escopo.turmas.has(t))) return true;
    return !!escopo.cursosGeral && (publico.cursoIds || []).some(c => escopo.cursosGeral.has(String(c)));
  }
  return false;
}

/** Público para a resposta: `{ tipo, cursos:[titulos], turmas:[codigos] }`. */
export async function descreverPublicos(docs, { repo, servicos }) {
  const cursoIds = [...new Set(docs.flatMap(d => d.publico?.cursoIds || []).map(String))];
  const cursos = cursoIds.length ? await repo('cursos').find({ _id: { $in: cursoIds } }, { projection: { titulo: 1, sigla: 1 } }).toArray() : [];
  const tituloDe = new Map(cursos.map(c => [String(c._id), c.titulo || String(c._id)]));
  const codigoDe = new Map();
  const turmasDoCurso = servicos.tentar('secretaria.turmasDoCurso');
  const comTurma = [...new Set(docs.filter(d => d.publico?.tipo === 'turma').flatMap(d => d.publico.cursoIds || []).map(String))];
  if (typeof turmasDoCurso === 'function') {
    for (const c of comTurma) {
      try { for (const t of (await turmasDoCurso(c)) || []) { const h = hexDe(t?.id ?? t?._id); if (h) codigoDe.set(h, t.codigo || h); } } catch { /* sem códigos */ }
    }
  }
  return d => {
    const p = d.publico || {};
    return {
      tipo: p.tipo || null,
      cursoIds: (p.cursoIds || []).map(String),
      turmaIds: turmasHex(p.turmaIds),
      cursos: (p.cursoIds || []).map(c => tituloDe.get(String(c)) || null).filter(Boolean),
      turmas: turmasHex(p.turmaIds).map(t => codigoDe.get(t) || null).filter(Boolean),
      ...(Array.isArray(p.papeis) ? { papeis: [...p.papeis] } : {})
    };
  };
}

// ---------- links ----------
/** Link de banner: caminho interno da plataforma ou https. → string | null (inválido). */
export function lerLinkBanner(v) {
  if (typeof v !== 'string') return null;
  return validarLinkInterno(v) || validarUrlHttps(v);
}

// ---------- vigência ----------
export const DIA_MS = 24 * 60 * 60 * 1000;
export const VIGENCIA_MAX_DIAS = 366;

/** Estado derivado do banner no instante `agora`: 'agendado' | 'no-ar' | 'encerrado' | 'inativo'. */
export function estadoDoBanner(b, agora) {
  if (!b.ativo) return 'inativo';
  const t = agora.getTime();
  if (new Date(b.inicioEm).getTime() > t) return 'agendado';
  if (new Date(b.fimEm).getTime() <= t) return 'encerrado';
  return 'no-ar';
}
