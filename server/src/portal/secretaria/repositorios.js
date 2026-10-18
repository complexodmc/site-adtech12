// =============================================================
// COMPLEXO DMC · Portal — secretaria: repositórios e formas públicas
// PORTAL-API §3.3 (F4a: turmas, matriculas), §8.1–§8.2 · índice D-78 · dono: F4a.
//
// - INDICES_SECRETARIA: os índices das duas coleções da F4a (nomes
//   explícitos; o agregador os garante por indices.js — nada em db.js).
// - Formas de saída: `matriculaParaServico` (documento + `id` hex, o
//   que os serviços secretaria.* devolvem às outras fatias) e
//   `matriculaPublica` (o que vai em JSON às telas da coordenação).
// - Status derivado da turma (planejada · em_andamento · encerrada)
//   pelo "hoje" de São Paulo.
// =============================================================
import { ObjectId } from 'mongodb';
import { hojeSP } from '../validacao.js';

export const COLECOES = Object.freeze({
  turmas: 'turmas',
  matriculas: 'matriculas',
  liberacoes: 'liberacoes',
  cursos: 'cursos',
  users: 'users',
  perfis: 'perfis',
  lives: 'lives',
  docencias: 'docencias'
});

/** PORTAL-API §3.3 (F4a). */
export const INDICES_SECRETARIA = Object.freeze([
  { colecao: 'turmas', chave: { codigo: 1 }, opcoes: { name: 'uq_turmas_codigo', unique: true } },
  { colecao: 'turmas', chave: { cursoId: 1, inicio: -1 }, opcoes: { name: 'ix_turmas_curso' } },
  { colecao: 'matriculas', chave: { numero: 1 }, opcoes: { name: 'uq_matriculas_numero', unique: true } },
  { colecao: 'matriculas', chave: { userId: 1, cursoId: 1 }, opcoes: { name: 'uq_matriculas_vigente', unique: true, partialFilterExpression: { vigente: true } } },
  { colecao: 'matriculas', chave: { userId: 1, criadoEm: -1 }, opcoes: { name: 'ix_matriculas_user' } },
  { colecao: 'matriculas', chave: { cursoId: 1, turmaId: 1, status: 1 }, opcoes: { name: 'ix_matriculas_curso_turma' } }
].map(s => Object.freeze({ ...s, chave: Object.freeze({ ...s.chave }), opcoes: Object.freeze({ ...s.opcoes }) })));

export const STATUS_MATRICULA = Object.freeze(['ativa', 'concluida', 'cancelada', 'trancada']);
export const STATUS_VIGENTE = Object.freeze(['ativa', 'trancada']);
export const ORIGENS = Object.freeze(['liberacao', 'admin', 'migracao']);
export const MODALIDADES = Object.freeze(['ao_vivo', 'gravado', 'hibrido']);
export const STATUS_TURMA = Object.freeze(['planejada', 'em_andamento', 'encerrada']);

export const ROTULOS_STATUS = Object.freeze({ ativa: 'Ativa', concluida: 'Concluída', cancelada: 'Cancelada', trancada: 'Trancada' });
export const ROTULOS_ORIGEM = Object.freeze({ liberacao: 'Liberação de acesso', admin: 'Manual', migracao: 'Migração' });

/** Transições permitidas (§8.1). */
export const TRANSICOES = Object.freeze({
  ativa: Object.freeze(['trancada', 'concluida', 'cancelada']),
  trancada: Object.freeze(['ativa', 'cancelada']),
  concluida: Object.freeze(['ativa']),
  cancelada: Object.freeze([])
});

export const hex = v => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && typeof v.toHexString === 'function') return v.toHexString();
  return String(v);
};

/** ObjectId a partir de hex/ObjectId; inválido → null. */
export function paraObjectId(v) {
  if (v instanceof ObjectId) return v;
  const h = hex(v);
  return h && /^[a-f0-9]{24}$/.test(h) ? new ObjectId(h) : null;
}

/** Status derivado da turma (API §3.3): encerrada · planejada (hoje < início) · em_andamento. */
export function statusDaTurma(turma, agora = new Date()) {
  if (!turma) return null;
  if (turma.encerradaEm) return 'encerrada';
  const hoje = hojeSP(agora);
  if (typeof turma.inicio === 'string' && hoje < turma.inicio) return 'planejada';
  return 'em_andamento';
}

const iso = d => (d instanceof Date ? d.toISOString() : d ?? null);

function enturmacoesPublicas(lista) {
  return (Array.isArray(lista) ? lista : []).map(e => ({
    turmaId: hex(e.turmaId), turmaCodigo: e.turmaCodigo ?? null, de: iso(e.de), ate: iso(e.ate), por: e.por ?? null
  }));
}

function historicoPublico(lista) {
  return (Array.isArray(lista) ? lista : []).map(h => ({
    status: h.status, em: iso(h.em), por: h.por ?? null,
    ...(h.motivo ? { motivo: h.motivo } : {}),
    ...(h.resultadoAnterior ? { resultadoAnterior: h.resultadoAnterior } : {})
  }));
}

/** Código da turma atual sem ler `turmas`: a última enturmação aberta (ou a última). */
export function turmaCodigoAtual(m) {
  const lista = Array.isArray(m?.enturmacoes) ? m.enturmacoes : [];
  if (!m?.turmaId) return null;
  const alvo = hex(m.turmaId);
  for (let i = lista.length - 1; i >= 0; i--) {
    if (hex(lista[i].turmaId) === alvo) return lista[i].turmaCodigo ?? null;
  }
  return null;
}

/**
 * Forma devolvida pelos serviços secretaria.* (consumo entre fatias): o documento
 * inteiro + `id` (hex) + `turma:{ id, codigo }|null` + `semAcesso` quando informado.
 * `_id`, `turmaId` e `contratoId` continuam ObjectId (para consultas de quem consome).
 */
export function matriculaParaServico(doc, extras = {}) {
  if (!doc) return null;
  const turmaId = doc.turmaId ?? null;
  return {
    ...doc,
    id: hex(doc._id),
    turma: turmaId ? { id: hex(turmaId), codigo: turmaCodigoAtual(doc) } : null,
    vigente: doc.vigente === true,
    ...extras
  };
}

/** Forma JSON para as telas (sem `_id` cru). */
export function matriculaPublica(doc, { semAcesso, contrato, curso, aluno, turma, completa = false } = {}) {
  if (!doc) return null;
  const turmaId = hex(doc.turmaId);
  const saida = {
    id: hex(doc._id),
    numero: doc.numero,
    userId: doc.userId,
    cursoId: doc.cursoId,
    ...(curso !== undefined ? { cursoTitulo: curso?.titulo ?? null } : {}),
    ...(aluno !== undefined ? { aluno } : {}),
    turma: turmaId ? { id: turmaId, codigo: turma?.codigo ?? turmaCodigoAtual(doc) } : null,
    status: doc.status,
    statusRotulo: ROTULOS_STATUS[doc.status] || doc.status,
    vigente: doc.vigente === true,
    inicioEm: iso(doc.inicioEm),
    origem: doc.origem ?? null,
    origemRotulo: ROTULOS_ORIGEM[doc.origem] || null,
    ...(contrato !== undefined ? { contrato } : {}),
    ...(semAcesso !== undefined ? { semAcesso: !!semAcesso } : {}),
    versao: doc.versao ?? 1
  };
  if (completa) {
    Object.assign(saida, {
      concluidaEm: iso(doc.concluidaEm), canceladaEm: iso(doc.canceladaEm), trancadaEm: iso(doc.trancadaEm),
      enturmacoes: enturmacoesPublicas(doc.enturmacoes),
      historico: historicoPublico(doc.historico),
      resultadoFinal: doc.resultadoFinal ?? null,
      certificadoCodigo: doc.certificadoCodigo ?? null,
      nomeEmDocumentos: doc.nomeEmDocumentos
        ? { usar: doc.nomeEmDocumentos.usar, em: iso(doc.nomeEmDocumentos.em), por: doc.nomeEmDocumentos.por ?? null, motivo: doc.nomeEmDocumentos.motivo ?? null }
        : null,
      criadoEm: iso(doc.criadoEm), atualizadoEm: iso(doc.atualizadoEm)
    });
  }
  return saida;
}

/** Forma JSON da turma (`alunos` e `cursoTitulo` opcionais). */
export function turmaPublica(t, { agora = new Date(), alunos, cursoTitulo } = {}) {
  if (!t) return null;
  return {
    id: hex(t._id),
    cursoId: t.cursoId,
    ...(cursoTitulo !== undefined ? { cursoTitulo } : {}),
    codigo: t.codigo,
    nome: t.nome ?? null,
    inicio: t.inicio,
    fim: t.fim ?? null,
    modalidade: t.modalidade,
    status: statusDaTurma(t, agora),
    encerradaEm: iso(t.encerradaEm),
    ...(alunos !== undefined ? { alunos } : {}),
    versao: t.versao ?? 1
  };
}

/** Acesso às coleções (resolvidas na hora do uso). */
export function criarRepositorios({ repo }) {
  if (typeof repo !== 'function') throw new TypeError('criarRepositorios: informe repo(nome).');
  const c = {};
  for (const [k, nome] of Object.entries(COLECOES)) c[k] = () => repo(nome);
  return Object.freeze(c);
}
