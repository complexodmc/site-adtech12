// =============================================================
// COMPLEXO DMC · Portal — certificação: leituras de banco comuns às rotas
// da F3b (certificados legado, regras do curso, declarações e validação).
// API §3.2–§3.3 · dono: F3b. Só coleções da F3 (cursos, certificados,
// declaracoes, ies) e as leituras legadas que a rota de certificados já
// fazia antes desta rodada (modulos, aulas, progresso, liberacoes).
// =============================================================

/**
 * @param {(nome:string) => object} repo
 */
export function criarRepositoriosCertificacao(repo) {
  if (typeof repo !== 'function') throw new TypeError('criarRepositoriosCertificacao: informe repo.');
  const col = nome => repo(nome);

  /** Módulos do curso, em ordem. */
  async function modulosDoCurso(cursoId) {
    const docs = await col('modulos').find({ cursoId: String(cursoId) }, { projection: { _id: 1, numero: 1, titulo: 1, ordem: 1, tipo: 1, chHoras: 1, duracao: 1 } }).toArray();
    return docs.sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));
  }

  /** Todas as aulas do curso (inclusive "em breve"). */
  async function aulasDoCurso(cursoId, modulos = null) {
    const mods = modulos || await modulosDoCurso(cursoId);
    const ids = mods.map(m => m._id);
    if (!ids.length) return [];
    return col('aulas').find({ moduloId: { $in: ids } }, { projection: { _id: 1, moduloId: 1, ordem: 1, disponivel: 1, codigo: 1, titulo: 1 } }).toArray();
  }

  /** Aulas que contam para o certificado: todas menos as "em breve" (regra de hoje). */
  async function aulasElegiveis(cursoId, modulos = null) {
    const aulas = await aulasDoCurso(cursoId, modulos);
    return aulas.filter(a => a.disponivel !== false).map(a => a._id);
  }

  async function concluidas(userId, aulaIds) {
    if (!aulaIds.length) return 0;
    return col('progresso').countDocuments({ userId: String(userId), aulaId: { $in: aulaIds } });
  }

  const curso = cursoId => col('cursos').findOne({ _id: String(cursoId) });
  const liberacao = (userId, cursoId) => col('liberacoes').findOne({ userId: String(userId), cursoId: String(cursoId) });
  const certificadoDe = (userId, cursoId) => col('certificados').findOne({ userId: String(userId), cursoId: String(cursoId) });
  const certificadoPorCodigo = codigo => col('certificados').findOne({ codigo });

  return Object.freeze({
    col, modulosDoCurso, aulasDoCurso, aulasElegiveis, concluidas, curso, liberacao, certificadoDe, certificadoPorCodigo
  });
}
