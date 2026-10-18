// =============================================================
// COMPLEXO DMC · Portal — repositórios do acadêmico (F3a)
// PORTAL-API §3.2 (lives, cursos, modulos, aulas), §3.3 F3 (frequencias)
// · dono: F3a.
//
// Escreve SÓ em `frequencias` e nos campos novos de `lives` (dono F3a).
// Lê as coleções legadas (cursos, modulos, aulas, progresso, lives,
// certificados, users, turmas). Matrículas e turmas de outra fatia (F4a)
// são lidas pelos serviços `secretaria.*`; as leituras diretas abaixo
// (`matricula*`) são a DEGRADAÇÃO quando a F4a não está montada (o E2E
// da F3a roda sem ela, índice §8.4) — somente leitura, nunca escrita.
// =============================================================
import { ObjectId } from 'mongodb';

export const COLECAO_FREQUENCIAS = 'frequencias';

/** Índices da coleção `frequencias` e dos campos novos de `lives` (API §3.2/§3.3). */
export const INDICES_ACADEMICO = Object.freeze([
  { colecao: 'frequencias', chave: { codigo: 1 }, opcoes: { name: 'uq_freq_codigo', unique: true } },
  { colecao: 'frequencias', chave: { matriculaId: 1, encontroId: 1 }, opcoes: { name: 'uq_freq_encontro', unique: true, partialFilterExpression: { origem: 'ao_vivo' } } },
  { colecao: 'frequencias', chave: { matriculaId: 1, aulaId: 1 }, opcoes: { name: 'uq_freq_aula', unique: true, partialFilterExpression: { origem: 'gravado' } } },
  { colecao: 'frequencias', chave: { userId: 1, registradaEm: -1 }, opcoes: { name: 'ix_freq_user' } },
  { colecao: 'frequencias', chave: { cursoId: 1, moduloId: 1 }, opcoes: { name: 'ix_freq_curso' } },
  { colecao: 'frequencias', chave: { encontroId: 1 }, opcoes: { name: 'ix_freq_encontro_lista' } },
  { colecao: 'lives', chave: { turmaId: 1, inicioEm: 1 }, opcoes: { name: 'ix_lives_turma' } },
  { colecao: 'lives', chave: { moduloId: 1 }, opcoes: { name: 'ix_lives_modulo' } }
]);

const HEX_RE = /^[a-f0-9]{24}$/;
export const hex = v => (v === null || v === undefined ? null : String(v));
/** ObjectId a partir de hex (ou o próprio ObjectId); null se inválido. */
export function oidDe(v) {
  if (v instanceof ObjectId) return v;
  const s = hex(v);
  return s && HEX_RE.test(s) ? new ObjectId(s) : null;
}
/** As duas formas (ObjectId e hex) de um id de turma/matrícula, para filtros tolerantes. */
export function formas(v) {
  const s = hex(v);
  if (!s) return [];
  const o = oidDe(s);
  return o ? [o, s] : [s];
}

const porOrdem = (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || String(a._id).localeCompare(String(b._id));

export function criarRepositoriosAcademico({ repo } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarRepositoriosAcademico: informe repo(nome).');
  const c = nome => repo(nome);

  return Object.freeze({
    // ---------- cursos e conteúdo (legado, leitura) ----------
    curso: id => (id ? c('cursos').findOne({ _id: String(id) }) : null),
    async cursos(ids) {
      const lista = [...new Set((ids || []).map(String))];
      if (!lista.length) return new Map();
      const docs = await c('cursos').find({ _id: { $in: lista } }).toArray();
      return new Map(docs.map(d => [String(d._id), d]));
    },
    async modulosDoCurso(cursoId) {
      const docs = await c('modulos').find({ cursoId: String(cursoId) }).toArray();
      return docs.sort(porOrdem);
    },
    async aulasDosModulos(moduloIds) {
      const lista = [...new Set((moduloIds || []).map(String))];
      if (!lista.length) return [];
      const docs = await c('aulas').find({ moduloId: { $in: lista } }).toArray();
      return docs.sort(porOrdem);
    },
    aula: id => c('aulas').findOne({ _id: String(id) }),
    modulo: id => c('modulos').findOne({ _id: String(id) }),
    ies: id => (oidDe(id) ? c('ies').findOne({ _id: oidDe(id) }) : null),
    usuario: id => (oidDe(id) ? c('users').findOne({ _id: oidDe(id) }, { projection: { nome: 1, email: 1, isAdmin: 1, papel: 1 } }) : null),
    async usuarios(ids) {
      const oids = [...new Set((ids || []).map(hex))].map(oidDe).filter(Boolean);
      if (!oids.length) return new Map();
      const docs = await c('users').find({ _id: { $in: oids } }, { projection: { nome: 1, email: 1 } }).toArray();
      return new Map(docs.map(d => [String(d._id), d]));
    },
    async progressoDoUsuario(userId, aulaIds) {
      const lista = [...new Set((aulaIds || []).map(String))];
      if (!lista.length) return [];
      return c('progresso').find({ userId: String(userId), aulaId: { $in: lista } }).toArray();
    },
    certificado: (userId, cursoId) => c('certificados').findOne({ userId: String(userId), cursoId: String(cursoId) }),

    // ---------- turmas e matrículas (F4a; leitura de degradação) ----------
    turma: id => (oidDe(id) ? c('turmas').findOne({ _id: oidDe(id) }) : null),
    async turmas(ids) {
      const oids = [...new Set((ids || []).map(hex).filter(Boolean))].map(oidDe).filter(Boolean);
      if (!oids.length) return new Map();
      const docs = await c('turmas').find({ _id: { $in: oids } }).toArray();
      return new Map(docs.map(d => [String(d._id), d]));
    },
    matricula: id => (oidDe(id) ? c('matriculas').findOne({ _id: oidDe(id) }) : null),
    matriculasDoUsuario: userId => c('matriculas').find({ userId: String(userId) }).sort({ criadoEm: -1, inicioEm: -1 }).toArray(),
    matriculasDoCurso({ cursoId, turmaIds = null, status = ['ativa', 'trancada', 'concluida'] } = {}) {
      const filtro = { cursoId: String(cursoId), status: { $in: status } };
      if (Array.isArray(turmaIds)) filtro.turmaId = { $in: turmaIds.flatMap(formas) };
      return c('matriculas').find(filtro).toArray();
    },

    // ---------- encontros (lives; dono F3a dos campos novos) ----------
    encontro: id => c('lives').findOne({ _id: String(id) }),
    encontrosDoCurso(cursoId, { de = null, ate = null } = {}) {
      const filtro = { cursoId: String(cursoId) };
      if (de || ate) filtro.inicioEm = { ...(de ? { $gte: de } : {}), ...(ate ? { $lt: ate } : {}) };
      return c('lives').find(filtro).sort({ inicioEm: 1 }).toArray();
    },
    encontrosDosCursos(cursoIds, { de = null, ate = null } = {}) {
      const lista = [...new Set((cursoIds || []).map(String))];
      if (!lista.length) return Promise.resolve([]);
      const filtro = { cursoId: { $in: lista } };
      if (de || ate) filtro.inicioEm = { ...(de ? { $gte: de } : {}), ...(ate ? { $lt: ate } : {}) };
      return c('lives').find(filtro).sort({ inicioEm: 1 }).toArray();
    },
    inserirEncontro: doc => c('lives').insertOne(doc),
    atualizarEncontro: (id, versao, set) => c('lives').findOneAndUpdate(
      versao === null ? { _id: String(id) } : { _id: String(id), $or: [{ versao }, ...(versao === 1 ? [{ versao: { $exists: false } }] : [])] },
      { $set: { ...set, versao: (Number(versao) || 1) + 1 } },
      { returnDocument: 'after' }
    ),
    apagarEncontro: id => c('lives').deleteOne({ _id: String(id) }),

    // ---------- frequências (dono F3a) ----------
    frequenciasDaMatricula: matriculaId => c(COLECAO_FREQUENCIAS).find({ matriculaId: { $in: formas(matriculaId) } }).toArray(),
    frequenciasDasMatriculas: ids => c(COLECAO_FREQUENCIAS).find({ matriculaId: { $in: (ids || []).flatMap(formas) } }).toArray(),
    frequenciasDoEncontro: encontroId => c(COLECAO_FREQUENCIAS).find({ encontroId: String(encontroId) }).toArray(),
    contarFrequencias: filtro => c(COLECAO_FREQUENCIAS).countDocuments(filtro),
    frequenciaPorCodigo: codigo => c(COLECAO_FREQUENCIAS).findOne({ codigo: String(codigo) }),
    frequenciaExistente(matriculaId, origem, { encontroId = null, aulaId = null } = {}) {
      const filtro = { matriculaId: { $in: formas(matriculaId) }, origem };
      if (origem === 'ao_vivo') filtro.encontroId = String(encontroId);
      else filtro.aulaId = String(aulaId);
      return c(COLECAO_FREQUENCIAS).findOne(filtro);
    },
    inserirFrequencia: doc => c(COLECAO_FREQUENCIAS).insertOne(doc),
    marcarAnulada: (id, anulada) => c(COLECAO_FREQUENCIAS).updateOne({ _id: id }, { $set: { anulada } }),
    frequenciasDoUsuario: userId => c(COLECAO_FREQUENCIAS).find({ userId: String(userId) }).sort({ registradaEm: -1 }).toArray()
  });
}
