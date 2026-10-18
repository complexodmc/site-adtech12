// =============================================================
// COMPLEXO DMC · Portal — avaliações: acesso a dados e serviços F2
// PORTAL-API §3.3 (F2), §4.4 (serviços avaliacoes.*), §8.11 · dono: F2.
//
// Coleções da F2: avaliacoes, questoes, tentativas, avaliacoes_aluno.
// Outras fatias leem por serviço (avaliacoes.notaDoModulo,
// .resumoDoModulo, .tentativasDoAluno, .correcoesPendentes); a F2 lê
// matrícula e critérios do curso pelos serviços da F4a/F3a.
//
// Degradação (índice §8.4): sem `secretaria.*` (F4a ainda não montada),
// a matrícula vigente é LIDA (somente leitura) direto de `matriculas`,
// com aviso no log uma vez — nunca criada aqui. Sem
// `academico.criteriosDe` (F3a), a nota mínima é a do curso
// (`cursos.criterios.notaMinima`, 0–10) ou o padrão 7.
// =============================================================
import { ObjectId } from 'mongodb';
import {
  NOTA_MINIMA_PADRAO, estadoDoAluno, totalDoSorteio, ROTULOS_SITUACAO
} from './avaliacao-motor.js';

/** Índices da F2 (API §3.3). Registrados por montar(ctx) via registrarIndices. */
export const INDICES_AVALIACOES = Object.freeze([
  { colecao: 'avaliacoes', chave: { moduloId: 1, tipo: 1 }, opcoes: { name: 'uq_avaliacoes_modulo_tipo', unique: true } },
  { colecao: 'avaliacoes', chave: { cursoId: 1, publicada: 1 }, opcoes: { name: 'ix_avaliacoes_curso' } },
  { colecao: 'questoes', chave: { avaliacaoId: 1, ativa: 1, tipo: 1 }, opcoes: { name: 'ix_questoes_avaliacao' } },
  { colecao: 'tentativas', chave: { matriculaId: 1, avaliacaoId: 1, numero: 1 }, opcoes: { name: 'uq_tent_numero', unique: true } },
  { colecao: 'tentativas', chave: { matriculaId: 1, avaliacaoId: 1 }, opcoes: { name: 'uq_tent_aberta', unique: true, partialFilterExpression: { status: 'em_andamento' } } },
  { colecao: 'tentativas', chave: { status: 1, cursoId: 1, enviadaEm: 1 }, opcoes: { name: 'ix_tent_correcao' } },
  { colecao: 'tentativas', chave: { codigo: 1 }, opcoes: { name: 'uq_tent_codigo', unique: true, partialFilterExpression: { codigo: { $type: 'string' } } } },
  { colecao: 'tentativas', chave: { userId: 1, enviadaEm: -1 }, opcoes: { name: 'ix_tent_user' } },
  { colecao: 'avaliacoes_aluno', chave: { matriculaId: 1, avaliacaoId: 1 }, opcoes: { name: 'uq_av_aluno', unique: true } }
]);

const ID_RE = /^[a-f0-9]{24}$/;
export const hex = v => (v === null || v === undefined ? null : (typeof v === 'object' && typeof v.toHexString === 'function' ? v.toHexString() : String(v)));
export const comoOid = v => {
  if (v instanceof ObjectId) return v;
  const h = hex(v);
  return h && ID_RE.test(h) ? new ObjectId(h) : null;
};
const STATUS_VIGENTE = ['ativa', 'trancada'];

/**
 * @param {{ repo:(nome)=>Collection, servicos, agora?:()=>Date, log?:Console }} deps
 */
export function criarRepositorioAvaliacoes({ repo, servicos, agora = () => new Date(), log = console } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarRepositorioAvaliacoes: informe repo.');
  if (!servicos || typeof servicos.tentar !== 'function') throw new TypeError('criarRepositorioAvaliacoes: informe servicos.');
  const col = {
    avaliacoes: () => repo('avaliacoes'),
    questoes: () => repo('questoes'),
    tentativas: () => repo('tentativas'),
    alunos: () => repo('avaliacoes_aluno')
  };
  const avisados = new Set();
  const avisarUmaVez = (chave, texto) => {
    if (avisados.has(chave)) return;
    avisados.add(chave);
    try { (log.warn || log.error).call(log, `[portal] ${texto}`); } catch { /* nada */ }
  };

  // ---------- matrícula (F4a) ----------
  async function lerMatriculaDireto(userId, cursoId) {
    avisarUmaVez('matricula', 'secretaria.matriculaVigente ausente: avaliações leem a matrícula vigente direto (somente leitura).');
    const docs = await repo('matriculas').find({ userId: String(userId), cursoId: String(cursoId), status: { $in: STATUS_VIGENTE } }).toArray();
    return docs.sort((a, b) => (a.status === 'ativa' ? -1 : 1) - (b.status === 'ativa' ? -1 : 1))[0] || null;
  }

  /** Matrícula vigente (ativa|trancada) do aluno no curso, ou null. Leitura (nunca cria). */
  async function matriculaVigente(userId, cursoId) {
    const f = servicos.tentar('secretaria.matriculaVigente');
    if (typeof f === 'function') return (await f(String(userId), String(cursoId))) || null;
    return lerMatriculaDireto(userId, cursoId);
  }

  /** Para iniciar tentativa: materializa pela liberação quando a F4a existe (garantirMatricula). */
  async function matriculaParaTentativa(userId, cursoId) {
    const g = servicos.tentar('secretaria.garantirMatricula');
    if (typeof g === 'function') {
      const m = await g(String(userId), String(cursoId));
      if (m && !m.semAcesso && m._id) return m;
    }
    return matriculaVigente(userId, cursoId);
  }

  async function matriculaPorId(matriculaId) {
    const f = servicos.tentar('secretaria.matriculaPorId');
    if (typeof f === 'function') return (await f(hex(matriculaId))) || null;
    const id = comoOid(matriculaId);
    if (!id) return null;
    avisarUmaVez('matriculaPorId', 'secretaria.matriculaPorId ausente: avaliações leem a matrícula direto (somente leitura).');
    return repo('matriculas').findOne({ _id: id });
  }

  // ---------- critérios do curso (F3a) ----------
  async function notaMinimaDoCurso(cursoId) {
    const curso = await repo('cursos').findOne({ _id: String(cursoId) });
    if (!curso) return NOTA_MINIMA_PADRAO;
    const f = servicos.tentar('academico.criteriosDe');
    if (typeof f === 'function') {
      try {
        const c = await f(curso);
        const n = Number(c?.notaMinima);
        if (Number.isFinite(n) && n >= 0 && n <= 10) return n;
      } catch (err) {
        avisarUmaVez('criterios-falha', `academico.criteriosDe falhou; nota mínima do curso pelo cadastro (${err?.name || 'erro'}).`);
      }
    }
    const n = Number(curso.criterios?.notaMinima);
    return Number.isFinite(n) && n >= 0 && n <= 10 ? n : NOTA_MINIMA_PADRAO;
  }

  // ---------- leitura básica ----------
  const avaliacaoPorId = id => { const o = comoOid(id); return o ? col.avaliacoes().findOne({ _id: o }) : Promise.resolve(null); };
  const tentativaPorId = id => { const o = comoOid(id); return o ? col.tentativas().findOne({ _id: o }) : Promise.resolve(null); };
  const questaoPorId = id => { const o = comoOid(id); return o ? col.questoes().findOne({ _id: o }) : Promise.resolve(null); };

  const tentativasDaMatricula = (matriculaId, avaliacaoId) =>
    col.tentativas().find({ matriculaId: comoOid(matriculaId), avaliacaoId: comoOid(avaliacaoId) }).sort({ numero: 1 }).toArray();

  const registroDoAluno = (matriculaId, avaliacaoId) =>
    col.alunos().findOne({ matriculaId: comoOid(matriculaId), avaliacaoId: comoOid(avaliacaoId) });

  async function contagemDoBanco(avaliacaoId) {
    const docs = await col.questoes().find({ avaliacaoId: comoOid(avaliacaoId), ativa: true }, { projection: { tipo: 1 } }).toArray();
    const c = { objetiva: 0, dissertativa: 0, arquivo: 0 };
    for (const d of docs) if (Object.hasOwn(c, d.tipo)) c[d.tipo]++;
    return c;
  }

  /** Estado completo (para rotas e serviços) de uma matrícula numa avaliação. */
  async function estadoDaMatricula(avaliacao, matricula, { simular = null } = {}) {
    if (!matricula) {
      return { tentativas: [], registro: null, estado: estadoDoAluno({ avaliacao, tentativas: [], registro: null, notaMinima: await notaMinimaDoCurso(avaliacao.cursoId), matriculaAtiva: false }) };
    }
    const [tentativas, registro, notaMinima] = await Promise.all([
      tentativasDaMatricula(matricula._id, avaliacao._id),
      registroDoAluno(matricula._id, avaliacao._id),
      notaMinimaDoCurso(avaliacao.cursoId)
    ]);
    const estado = estadoDoAluno({ avaliacao, tentativas, registro, notaMinima, matriculaAtiva: matricula.status === 'ativa', simular });
    return { tentativas, registro, estado };
  }

  // =============================================================
  // Serviços com nome fixo (API §4.4)
  // =============================================================

  /** avaliacoes.notaDoModulo(matriculaId, moduloId, { simular }) — POR MATRÍCULA. */
  async function notaDoModulo(matriculaId, moduloId, { simular = null } = {}) {
    const modular = await col.avaliacoes().findOne({ moduloId: String(moduloId), tipo: 'modular', publicada: true });
    if (!modular) {
      return { temModular: false, avaliacaoModularId: null, nota: null, situacao: null, aguardandoCorrecao: false, finalizada: false, tentativas: { usadas: 0, permitidas: 0, restantes: 0 } };
    }
    const mid = comoOid(matriculaId);
    const matricula = mid ? { _id: mid, status: 'ativa' } : null;
    const { estado } = await estadoDaMatricula(modular, matricula, { simular });
    return {
      temModular: true,
      avaliacaoModularId: hex(modular._id),
      nota: estado.melhorNota,
      situacao: estado.situacao,
      aguardandoCorrecao: estado.aguardandoCorrecao,
      finalizada: estado.finalizada,
      tentativas: { usadas: estado.usadas, permitidas: estado.permitidas, restantes: estado.restantes },
      notaMinima: estado.notaMinima
    };
  }

  /**
   * avaliacoes.resumoDoModulo(matriculaId|null, moduloId, { equipe? }) — itens da seção "Avaliação" do player.
   * Sem `equipe:true`, só publicadas (aluno). `matriculaId:null` → campos do aluno nulos.
   */
  async function resumoDoModulo(matriculaId, moduloId, { equipe = false } = {}) {
    const filtro = { moduloId: String(moduloId) };
    if (!equipe) filtro.publicada = true;
    const lista = await col.avaliacoes().find(filtro).toArray();
    lista.sort((a, b) => (a.tipo === 'previa' ? 0 : 1) - (b.tipo === 'previa' ? 0 : 1));
    const mid = comoOid(matriculaId);
    const out = [];
    for (const a of lista) {
      const base = {
        id: hex(a._id), tipo: a.tipo, titulo: a.titulo, publicada: a.publicada === true,
        nQuestoes: totalDoSorteio(a.sorteio), tentativasMax: a.tentativasMax, tempoLimiteMin: a.tempoLimiteMin ?? null
      };
      if (!mid) {
        out.push({ ...base, usadas: null, restantes: null, melhorNota: null, situacao: null, finalizada: null, feito: null });
        continue;
      }
      const { tentativas, estado } = await estadoDaMatricula(a, { _id: mid, status: 'ativa' });
      out.push({
        ...base,
        usadas: estado.usadas,
        restantes: estado.restantes,
        melhorNota: estado.melhorNota,
        situacao: estado.situacao,
        finalizada: estado.finalizada,
        feito: tentativas.some(t => t.status !== 'em_andamento')
      });
    }
    return out;
  }

  /** avaliacoes.tentativasDoAluno(userId, { cursoId?, matriculaId? }) — enviadas (comprovantes). */
  async function tentativasDoAluno(userId, { cursoId = null, matriculaId = null } = {}) {
    const filtro = { userId: String(userId), status: { $ne: 'em_andamento' } };
    if (cursoId) filtro.cursoId = String(cursoId);
    if (matriculaId) { const o = comoOid(matriculaId); if (!o) return []; filtro.matriculaId = o; }
    const docs = await col.tentativas().find(filtro, { projection: { questoes: 0, respostas: 0, correcao: 0 } }).sort({ enviadaEm: -1 }).limit(2000).toArray();
    const ids = [...new Set(docs.map(d => hex(d.avaliacaoId)))];
    const avs = ids.length ? await col.avaliacoes().find({ _id: { $in: ids.map(comoOid) } }, { projection: { titulo: 1, tipo: 1, moduloId: 1 } }).toArray() : [];
    const porId = new Map(avs.map(a => [hex(a._id), a]));
    const modIds = [...new Set(docs.map(d => String(d.moduloId)))];
    const mods = modIds.length ? await repo('modulos').find({ _id: { $in: modIds } }, { projection: { numero: 1, titulo: 1 } }).toArray() : [];
    const modPorId = new Map(mods.map(m => [String(m._id), m]));
    return docs.map(d => {
      const a = porId.get(hex(d.avaliacaoId));
      const m = modPorId.get(String(d.moduloId));
      const corrigida = d.status === 'corrigida';
      return {
        tentativaId: hex(d._id), matriculaId: hex(d.matriculaId), cursoId: String(d.cursoId), codigo: corrigida ? (d.codigo || null) : null,
        avaliacaoId: hex(d.avaliacaoId), avaliacao: a ? a.titulo : null, avaliacaoTipo: a ? a.tipo : d.tipo,
        moduloId: String(d.moduloId), modulo: m ? { numero: m.numero ?? null, titulo: m.titulo ?? null } : null,
        numero: d.numero, iniciadaEm: d.iniciadaEm, enviadaEm: d.enviadaEm,
        pctAcerto: corrigida ? (d.pctAcerto ?? null) : null, nota: corrigida ? (d.nota ?? null) : null,
        status: d.status, hash: corrigida ? (d.hash || null) : null
      };
    });
  }

  /** avaliacoes.correcoesPendentes(cursoIds, { turmaIds? }) → { [cursoId]: N }. */
  async function correcoesPendentes(cursoIds, { turmaIds = null } = {}) {
    const ids = (Array.isArray(cursoIds) ? cursoIds : []).map(String);
    const out = Object.fromEntries(ids.map(c => [c, 0]));
    if (!ids.length) return out;
    const filtro = { status: 'aguardando_correcao', cursoId: { $in: ids } };
    if (Array.isArray(turmaIds)) {
      const t = turmaIds.map(hex).filter(Boolean);
      if (!t.length) return out;
      filtro.turmaId = { $in: t };
    }
    const docs = await col.tentativas().find(filtro, { projection: { cursoId: 1 } }).toArray();
    for (const d of docs) out[String(d.cursoId)] = (out[String(d.cursoId)] || 0) + 1;
    return out;
  }

  return {
    col, hex, comoOid,
    matriculaVigente, matriculaParaTentativa, matriculaPorId, notaMinimaDoCurso,
    avaliacaoPorId, tentativaPorId, questaoPorId, tentativasDaMatricula, registroDoAluno, contagemDoBanco, estadoDaMatricula,
    servicos: Object.freeze({ notaDoModulo, resumoDoModulo, tentativasDoAluno, correcoesPendentes }),
    ROTULOS_SITUACAO
  };
}
