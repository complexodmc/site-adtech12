// =============================================================
// COMPLEXO DMC · Portal — leituras e escritas de estudos
// PORTAL-API §3.2 (cursos/modulos/aulas, campos F1a), §3.3 (progresso_video,
// progresso_conteudo), §6.5 · dono: F1a.
//
// `repo(nome)` = getDb().collection(nome) resolvido na hora do uso.
// Coleções escritas aqui: progresso (legado, `origem` aditivo),
// progresso_video, progresso_conteudo, e os campos F1a de cursos/modulos/
// aulas (capaVertical, plano, materiais, capa, rotuloEncontro,
// materiais[].categoria). Nada de outra fatia é escrito aqui.
// =============================================================

/** Índices da F1a (registrados por routes/portal-conteudo.js no montar). */
export const INDICES_ESTUDOS = Object.freeze([
  { colecao: 'progresso_video', chave: { userId: 1, aulaId: 1 }, opcoes: { name: 'uq_progresso_video', unique: true } },
  { colecao: 'progresso_conteudo', chave: { userId: 1, chave: 1 }, opcoes: { name: 'uq_progresso_conteudo', unique: true } },
  { colecao: 'progresso_conteudo', chave: { userId: 1, moduloId: 1 }, opcoes: { name: 'ix_progresso_conteudo_modulo' } },
  {
    colecao: 'cursos', chave: { 'capaVertical.arquivo': 1 },
    opcoes: { name: 'uq_cursos_capa_vertical', unique: true, partialFilterExpression: { 'capaVertical.arquivo': { $type: 'string' } } }
  },
  {
    colecao: 'modulos', chave: { 'capa.arquivo': 1 },
    opcoes: { name: 'uq_modulos_capa', unique: true, partialFilterExpression: { 'capa.arquivo': { $type: 'string' } } }
  }
]);

const porOrdem = (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0);

/** E11000 (chave duplicada) — corrida resolvida pelo índice único. */
export function ehDuplicado(err) {
  return !!err && (err.code === 11000 || err.code === 11001 || /E11000/.test(String(err.message || '')));
}

/**
 * @param {{ repo: (nome: string) => object }} deps
 */
export function criarRepositoriosEstudos({ repo } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarRepositoriosEstudos: informe repo(nome).');

  async function cursoPorId(cursoId) {
    if (!cursoId) return null;
    return repo('cursos').findOne({ _id: String(cursoId) });
  }

  async function moduloPorId(moduloId) {
    if (!moduloId) return null;
    return repo('modulos').findOne({ _id: String(moduloId) });
  }

  async function aulaPorId(aulaId) {
    if (!aulaId) return null;
    return repo('aulas').findOne({ _id: String(aulaId) });
  }

  /**
   * Curso inteiro em memória: { curso, modulos:[{ ...modulo, aulas:[...] }] } (ordem do curso).
   * `null` se o curso não existe.
   */
  async function estruturaDoCurso(cursoId) {
    const curso = await cursoPorId(cursoId);
    if (!curso) return null;
    const modulos = (await repo('modulos').find({ cursoId: String(cursoId) }).toArray()).sort(porOrdem);
    const ids = modulos.map(m => m._id);
    const aulas = ids.length ? (await repo('aulas').find({ moduloId: { $in: ids } }).toArray()).sort(porOrdem) : [];
    const porModulo = new Map(ids.map(id => [id, []]));
    for (const a of aulas) porModulo.get(a.moduloId)?.push(a);
    return { curso, modulos: modulos.map(m => ({ ...m, aulas: porModulo.get(m._id) || [] })) };
  }

  /** Mapas de progresso do usuário no curso (aulaIds/moduloIds da estrutura). */
  async function progressoDoUsuario(userId, { aulaIds = [], cursoId = null } = {}) {
    const u = String(userId);
    const [legado, video, conteudo] = await Promise.all([
      aulaIds.length ? repo('progresso').find({ userId: u, aulaId: { $in: aulaIds } }).toArray() : [],
      aulaIds.length ? repo('progresso_video').find({ userId: u, aulaId: { $in: aulaIds } }).toArray() : [],
      cursoId ? repo('progresso_conteudo').find({ userId: u, cursoId: String(cursoId) }).toArray() : []
    ]);
    return {
      aulas: new Map(legado.map(p => [p.aulaId, p])),
      video: new Map(video.map(p => [p.aulaId, p])),
      conteudo: new Map(conteudo.map(p => [p.chave, p]))
    };
  }

  /** Encontros (lives) ligados às aulas como `aulaGravadaId` (campo da F3; leitura só para o rótulo). */
  async function encontrosDasAulas(aulaIds) {
    if (!aulaIds.length) return new Map();
    const docs = await repo('lives').find({ aulaGravadaId: { $in: aulaIds } }, { projection: { _id: 1, titulo: 1, inicioEm: 1, aulaGravadaId: 1, cancelado: 1 } }).toArray();
    const mapa = new Map();
    for (const l of docs) {
      if (l.cancelado === true) continue;
      const atual = mapa.get(l.aulaGravadaId);
      const t = l.inicioEm ? new Date(l.inicioEm).getTime() : Infinity;
      if (!atual || t < (atual.inicioEm ? new Date(atual.inicioEm).getTime() : Infinity)) mapa.set(l.aulaGravadaId, l);
    }
    return mapa;
  }

  /**
   * Upsert idempotente em `progresso` (legado). → { completedAt, criada }.
   * `criada` = este chamado inseriu (o gancho aoConcluirAula roda só nesse caso).
   */
  async function concluirAulaLegado({ userId, aulaId, origem, em }) {
    const u = String(userId);
    const filtro = { userId: u, aulaId: String(aulaId) };
    let criada = false;
    try {
      const r = await repo('progresso').updateOne(
        filtro,
        { $setOnInsert: { userId: u, aulaId: String(aulaId), completedAt: em, ...(origem ? { origem } : {}) } },
        { upsert: true }
      );
      criada = !!(r && (r.upsertedCount > 0 || r.upsertedId));
    } catch (err) {
      if (!ehDuplicado(err)) throw err;
    }
    const doc = await repo('progresso').findOne(filtro);
    return { completedAt: doc?.completedAt ?? em, criada };
  }

  async function progressoVideo(userId, aulaId) {
    return repo('progresso_video').findOne({ userId: String(userId), aulaId: String(aulaId) });
  }

  async function gravarProgressoVideo({ userId, aulaId, cursoId, moduloId, pct, posicaoSeg, duracaoSeg, fonte, em }) {
    const filtro = { userId: String(userId), aulaId: String(aulaId) };
    const set = { cursoId: String(cursoId), moduloId: String(moduloId), ultimaPosicaoSeg: posicaoSeg, fonte, atualizadoEm: em };
    if (duracaoSeg !== null && duracaoSeg !== undefined) set.duracaoSeg = duracaoSeg;
    const update = {
      $max: { pctMax: pct },
      $set: set,
      $inc: { eventos: 1 },
      $setOnInsert: { ...filtro, primeiroEm: em, ...(duracaoSeg === null || duracaoSeg === undefined ? { duracaoSeg: null } : {}) }
    };
    try {
      await repo('progresso_video').updateOne(filtro, update, { upsert: true });
    } catch (err) {
      if (!ehDuplicado(err)) throw err;
      await repo('progresso_video').updateOne(filtro, { $max: update.$max, $set: set, $inc: update.$inc });
    }
    return repo('progresso_video').findOne(filtro);
  }

  /** Upsert idempotente em `progresso_conteudo`. → { chave, feitoEm }. */
  async function marcarConteudo({ userId, cursoId, moduloId, chave, em }) {
    const filtro = { userId: String(userId), chave: String(chave) };
    try {
      await repo('progresso_conteudo').updateOne(
        filtro,
        { $setOnInsert: { ...filtro, cursoId: String(cursoId), moduloId: String(moduloId), feitoEm: em } },
        { upsert: true }
      );
    } catch (err) {
      if (!ehDuplicado(err)) throw err;
    }
    const doc = await repo('progresso_conteudo').findOne(filtro);
    return { chave: String(chave), feitoEm: doc?.feitoEm ?? em };
  }

  /** Material (módulo ou aula) pelo id `mat-…`: → { origem, material, modulo, aula|null } | null. */
  async function acharMaterial(matId) {
    const id = String(matId || '');
    if (!id) return null;
    const modulo = await repo('modulos').findOne({ 'materiais.id': id });
    if (modulo) {
      const material = (modulo.materiais || []).find(m => m && m.id === id);
      if (material) return { origem: 'modulo', material, modulo, aula: null };
    }
    const aula = await repo('aulas').findOne({ 'materiais.id': id });
    if (aula) {
      const material = (aula.materiais || []).find(m => m && m.id === id);
      const mod = aula.moduloId ? await moduloPorId(aula.moduloId) : null;
      if (material && mod) return { origem: 'aula', material, modulo: mod, aula };
    }
    return null;
  }

  return Object.freeze({
    cursoPorId, moduloPorId, aulaPorId, estruturaDoCurso, progressoDoUsuario, encontrosDasAulas,
    concluirAulaLegado, progressoVideo, gravarProgressoVideo, marcarConteudo, acharMaterial
  });
}
