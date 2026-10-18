// =============================================================
// COMPLEXO DMC · Portal — secretaria: turmas e matrículas (domínio)
// PORTAL-API §3.3, §4.4 (secretaria.*), §6.8.1–§6.8.2, §8.1–§8.2 ·
// índice D-49, D-78, D-79 · dono: F4a.
//
// A matrícula é a EVOLUÇÃO das liberações: `liberacoes` continua sendo o
// direito de acesso (D5) e não ganha campo. A matrícula é materializada
// a partir da liberação, sem duplicar (índice único parcial
// uq_matriculas_vigente) e sem quebrar /api/liberacoes, a loja nem a
// simulação de pagamento de desenvolvimento.
//
// criarSecretaria(deps) devolve os serviços de nome fixo da API §4.4
// (garantirMatricula, concluirMatricula, contagemAlunos,
// matriculaVigente, matriculasDoAluno, turmasDoAluno, turmasDoCurso,
// alunosDoCurso, matriculaPorId, vincularContrato) e as operações das
// rotas da coordenação (transicionar, enturmar, criarManual, sincronizar,
// turmas). Toda escrita que a API marca com * em §3.4 passa por
// auditoria.executar (sem registro, nada muda: 503).
// =============================================================
import { ObjectId } from 'mongodb';
import { ErroPortal } from '../erros.js';
import { codigoAnual, inserirComCodigo, duplicadoNoIndice, codigoTurmaSugerido, CODIGO_TURMA_RE, SIGLA_RE } from '../codigos.js';
import { anoSP } from '../validacao.js';
import {
  criarRepositorios, matriculaParaServico, hex, paraObjectId, statusDaTurma, turmaCodigoAtual,
  TRANSICOES, STATUS_VIGENTE, ROTULOS_STATUS
} from './repositorios.js';

const STATUS_COM_VINCULO = Object.freeze(['ativa', 'trancada', 'concluida']);

const porDe = req => (req?.user?._id ? String(req.user._id) : null);

function dataDe(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const naoEncontrada = () => new ErroPortal(404, null, 'Matrícula não encontrada.');
const turmaNaoEncontrada = () => new ErroPortal(404, null, 'Turma não encontrada.');

/**
 * @param {{ repo: (nome:string)=>object, auditoria: object, notificacoes?: object|null,
 *   garantia?: { garantir: () => Promise<void> }|null, agora?: () => Date, log?: Console, bytes?: Function }} deps
 */
export function criarSecretaria({ repo, auditoria, notificacoes = null, garantia = null, agora = () => new Date(), log = console, bytes } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarSecretaria: informe repo(nome).');
  if (!auditoria || typeof auditoria.executar !== 'function') throw new TypeError('criarSecretaria: informe auditoria.');
  const r = criarRepositorios({ repo });
  let indicesProntos = false;

  /** Serviço que grava com índice único espera a garantia antes da 1ª escrita (API §4.4). */
  async function prontos() {
    if (indicesProntos || !garantia) return;
    await garantia.garantir();
    indicesProntos = true;
  }

  const avisar = (texto) => {
    try { (log.warn || log.error).call(log, `[portal] secretaria: ${texto}`); } catch { /* nada */ }
  };

  async function notificar(dados) {
    if (!notificacoes || typeof notificacoes.emitir !== 'function') return;
    try { await notificacoes.emitir(dados); } catch { /* emitir nunca lança; por garantia */ }
  }

  async function tituloDoCurso(cursoId) {
    try {
      const c = await r.cursos().findOne({ _id: String(cursoId) }, { projection: { titulo: 1 } });
      return c?.titulo || null;
    } catch {
      return null;
    }
  }

  async function lerMatricula(id) {
    if (id && typeof id === 'object' && id._id && id.numero) return id;
    const oid = paraObjectId(id);
    if (!oid) return null;
    return r.matriculas().findOne({ _id: oid });
  }

  // ---------------------------------------------------------------
  // Leituras (serviços de nome fixo)
  // ---------------------------------------------------------------
  async function matriculaVigente(userId, cursoId) {
    if (!userId || !cursoId) return null;
    const doc = await r.matriculas().findOne({ userId: String(userId), cursoId: String(cursoId), vigente: true });
    return matriculaParaServico(doc);
  }

  async function matriculaPorId(matriculaId) {
    return matriculaParaServico(await lerMatricula(matriculaId));
  }

  /** Todas as matrículas do aluno (mais recentes primeiro). */
  async function matriculasDoAluno(userId) {
    if (!userId) return [];
    const docs = await r.matriculas().find({ userId: String(userId) }).sort({ criadoEm: -1 }).toArray();
    return docs.map(d => matriculaParaServico(d));
  }

  /** Turmas (hex) das matrículas vigentes do aluno. */
  async function turmasDoAluno(userId) {
    if (!userId) return [];
    const docs = await r.matriculas()
      .find({ userId: String(userId), vigente: true }, { projection: { turmaId: 1 } })
      .toArray();
    return [...new Set(docs.map(d => hex(d.turmaId)).filter(Boolean))];
  }

  async function contarAlunosDaTurma(turmaId) {
    return r.matriculas().countDocuments({ turmaId: paraObjectId(turmaId), status: { $in: [...STATUS_VIGENTE] } });
  }

  /** [{ id, codigo, nome, status, modalidade, alunos, inicio, fim }] — alunos = matrículas ativas ou trancadas. */
  async function turmasDoCurso(cursoId) {
    if (!cursoId) return [];
    const momento = agora();
    const turmas = await r.turmas().find({ cursoId: String(cursoId) }).sort({ inicio: -1 }).toArray();
    const saida = [];
    for (const t of turmas) {
      saida.push({
        id: hex(t._id), codigo: t.codigo, nome: t.nome ?? null, status: statusDaTurma(t, momento),
        modalidade: t.modalidade, alunos: await contarAlunosDaTurma(t._id), inicio: t.inicio, fim: t.fim ?? null
      });
    }
    return saida;
  }

  /**
   * Alunos (matrículas) do curso. `turmaId`: hex, lista de hex, ou 'sem-turma'; ausente = todas.
   * `turmaIds` (acréscimo): lista de hex; lista vazia → [] (escopo sem turma visível).
   * `status`: texto ou lista; ausente = com vínculo (ativa, trancada, concluída).
   */
  async function alunosDoCurso({ cursoId, turmaId, turmaIds, status } = {}) {
    if (!cursoId) return [];
    const filtro = { cursoId: String(cursoId) };
    // Acréscimo: `turmaIds` (lista de hex; [] = nenhuma turma visível → lista vazia), como em contagemAlunos.
    if (Array.isArray(turmaIds) && turmaId === undefined) {
      const ids = turmaIds.map(paraObjectId).filter(Boolean);
      if (!ids.length) return [];
      filtro.turmaId = { $in: ids };
    } else if (turmaId === 'sem-turma') filtro.turmaId = null;
    else if (Array.isArray(turmaId)) filtro.turmaId = { $in: turmaId.map(paraObjectId).filter(Boolean) };
    else if (turmaId) {
      const oid = paraObjectId(turmaId);
      if (!oid) return [];
      filtro.turmaId = oid;
    }
    const lista = Array.isArray(status) ? status : status ? [status] : STATUS_COM_VINCULO;
    filtro.status = { $in: [...lista] };
    const docs = await r.matriculas().find(filtro).sort({ inicioEm: 1 }).toArray();
    return docs.map(d => ({
      matriculaId: hex(d._id), numero: d.numero, userId: d.userId, turmaId: hex(d.turmaId),
      turmaCodigo: turmaCodigoAtual(d), status: d.status, inicioEm: d.inicioEm ?? null
    }));
  }

  /**
   * { ativos, trancadas, semTurma }. Com `turmaIds` (docente só de turma), conta só
   * essas turmas e `semTurma` = null (fora do escopo de quem pergunta).
   */
  async function contagemAlunos(cursoId, { turmaIds } = {}) {
    const base = { cursoId: String(cursoId) };
    if (Array.isArray(turmaIds)) {
      const ids = turmaIds.map(paraObjectId).filter(Boolean);
      const f = { ...base, turmaId: { $in: ids } };
      const [ativos, trancadas] = await Promise.all([
        r.matriculas().countDocuments({ ...f, status: 'ativa' }),
        r.matriculas().countDocuments({ ...f, status: 'trancada' })
      ]);
      return { ativos, trancadas, semTurma: null };
    }
    const [ativos, trancadas, semTurma] = await Promise.all([
      r.matriculas().countDocuments({ ...base, status: 'ativa' }),
      r.matriculas().countDocuments({ ...base, status: 'trancada' }),
      r.matriculas().countDocuments({ ...base, vigente: true, turmaId: null })
    ]);
    return { ativos, trancadas, semTurma };
  }

  // ---------------------------------------------------------------
  // Materialização a partir da liberação (§8.2)
  // ---------------------------------------------------------------
  async function inserirMatricula({ userId, cursoId, origem, inicioEm, turma = null, req = null, motivo = null, _id = null }) {
    await prontos();
    const em = agora();
    const por = porDe(req) || 'sistema';
    const base = {
      ...(_id ? { _id } : {}),
      userId: String(userId), cursoId: String(cursoId), turmaId: turma ? turma._id : null,
      status: 'ativa', vigente: true, inicioEm: inicioEm || em, origem, contratoId: null,
      enturmacoes: turma ? [{ turmaId: turma._id, turmaCodigo: turma.codigo, de: em, ate: null, por }] : [],
      historico: [{ status: 'ativa', em, por, ...(motivo ? { motivo } : {}) }],
      concluidaEm: null, canceladaEm: null, trancadaEm: null, resultadoFinal: null, certificadoCodigo: null,
      nomeEmDocumentos: null, versao: 1, criadoEm: em, atualizadoEm: em
    };
    const { codigo, resultado } = await inserirComCodigo(
      numero => r.matriculas().insertOne({ ...base, numero }),
      () => codigoAnual('MAT', em, bytes),
      { indice: 'uq_matriculas_numero', campo: 'numero' }
    );
    return { ...base, _id: resultado.insertedId ?? _id, numero: codigo };
  }

  async function avisarCriada(doc) {
    if (doc.origem === 'migracao') return;
    const id = hex(doc._id);
    const curso = await tituloDoCurso(doc.cursoId);
    await notificar({
      userIds: [doc.userId], tipo: 'matricula.criada', titulo: 'Matrícula registrada',
      texto: curso ? `Sua matrícula ${doc.numero} em ${curso} foi registrada.` : `Sua matrícula ${doc.numero} foi registrada.`,
      link: `academico.html?m=${id}`, entidade: { tipo: 'matricula', id }, chave: `matricula:${id}`
    });
  }

  /**
   * Passo de §8.2 para um par (userId, cursoId). → { matricula, criada, criaria }.
   * `criar:false` só simula (dry-run do script).
   */
  async function materializar(userId, cursoId, { origem = 'liberacao', criar = true, req = null } = {}) {
    const u = userId === null || userId === undefined ? '' : String(userId);
    const c = cursoId === null || cursoId === undefined ? '' : String(cursoId);
    if (!u || !c) return { matricula: null, criada: false, criaria: false };
    const [lib, vig] = await Promise.all([
      r.liberacoes().findOne({ userId: u, cursoId: c }),
      r.matriculas().findOne({ userId: u, cursoId: c, vigente: true })
    ]);
    if (!lib) return { matricula: vig ? matriculaParaServico(vig, { semAcesso: true }) : null, criada: false, criaria: false };
    if (vig) return { matricula: matriculaParaServico(vig, { semAcesso: false }), criada: false, criaria: false };
    const [ultima] = await r.matriculas().find({ userId: u, cursoId: c }).sort({ criadoEm: -1 }).limit(1).toArray();
    const concedida = dataDe(lib.grantedAt);
    if (ultima) {
      const fim = dataDe(ultima.concluidaEm) || dataDe(ultima.canceladaEm);
      // Concluída (ou cancelada) que mantém a MESMA liberação não gera nova.
      if (!fim || !concedida || !(concedida > fim)) {
        return { matricula: matriculaParaServico(ultima, { semAcesso: false }), criada: false, criaria: false };
      }
    }
    if (!criar) return { matricula: null, criada: false, criaria: true };
    let doc;
    try {
      doc = await inserirMatricula({ userId: u, cursoId: c, origem, inicioEm: concedida, req });
    } catch (err) {
      if (duplicadoNoIndice(err, { indice: 'uq_matriculas_vigente' })) {
        // Corrida: outra requisição criou a vigente — devolve a vencedora.
        const vencedora = await r.matriculas().findOne({ userId: u, cursoId: c, vigente: true });
        if (vencedora) return { matricula: matriculaParaServico(vencedora, { semAcesso: false }), criada: false, criaria: false };
      }
      throw err;
    }
    await auditoria.registrar?.({
      acao: 'matricula.criada', entidade: { tipo: 'matricula', id: hex(doc._id) }, alvoUserId: u, cursoId: c,
      extra: { origem, numero: doc.numero }
    }, req);
    await avisarCriada(doc);
    return { matricula: matriculaParaServico(doc, { semAcesso: false }), criada: true, criaria: true };
  }

  /** secretaria.garantirMatricula(userId, cursoId) → Matricula|null (com semAcesso). Idempotente. */
  async function garantirMatricula(userId, cursoId, opcoes = {}) {
    const { matricula } = await materializar(userId, cursoId, { origem: opcoes.origem || 'liberacao', req: opcoes.req || null });
    return matricula;
  }

  /**
   * Passo de §8.2 para TODAS as liberações (rota sincronizar e o script). Contas que não existem
   * mais são puladas (`semConta`). → { criadas, jaExistiam, semConta }.
   */
  async function sincronizar({ aplicar = true, origem = 'migracao', req = null, aoProgredir = null } = {}) {
    const libs = await r.liberacoes().find({}, { projection: { userId: 1, cursoId: 1 } }).toArray();
    const ids = [...new Set(libs.map(l => String(l.userId)).filter(id => /^[a-f0-9]{24}$/.test(id)))];
    const existentes = new Set();
    for (let i = 0; i < ids.length; i += 500) {
      const lote = ids.slice(i, i + 500).map(paraObjectId);
      const users = await r.users().find({ _id: { $in: lote } }, { projection: { _id: 1 } }).toArray();
      for (const u of users) existentes.add(hex(u._id));
    }
    let criadas = 0;
    let jaExistiam = 0;
    let semConta = 0;
    for (const lib of libs) {
      if (!existentes.has(String(lib.userId))) { semConta++; continue; }
      const res = await materializar(lib.userId, lib.cursoId, { origem, criar: aplicar, req });
      if (res.criaria) criadas++;
      else jaExistiam++;
      if (typeof aoProgredir === 'function') aoProgredir({ userId: String(lib.userId), cursoId: lib.cursoId, criaria: res.criaria });
    }
    return { criadas, jaExistiam, semConta };
  }

  // ---------------------------------------------------------------
  // Máquina de estados (§8.1)
  // ---------------------------------------------------------------
  async function concederAcesso(m, por) {
    await r.liberacoes().updateOne(
      { userId: m.userId, cursoId: m.cursoId },
      { $setOnInsert: { userId: m.userId, cursoId: m.cursoId, grantedAt: agora(), grantedBy: por || 'sistema' } },
      { upsert: true }
    );
  }

  async function revogarAcesso(m) {
    await r.liberacoes().deleteOne({ userId: m.userId, cursoId: m.cursoId });
  }

  /**
   * Transição de status. Efeito no acesso (padrão): trancar não revoga · cancelar revoga ·
   * destrancar/reabrir garante. → Matricula (forma de serviço).
   */
  async function transicionar(alvo, para, opcoes = {}) {
    const { motivo = null, req = null, versao, resultadoFinal, certificadoCodigo } = opcoes;
    const m = await lerMatricula(alvo);
    if (!m) throw naoEncontrada();
    if (versao !== undefined && versao !== null && Number(versao) !== Number(m.versao ?? 1)) throw new ErroPortal(409, 'conflito-versao');
    if (!(TRANSICOES[m.status] || []).includes(para)) {
      throw new ErroPortal(409, 'transicao-invalida', undefined, { de: m.status, para });
    }
    const revogar = typeof opcoes.revogarAcesso === 'boolean' ? opcoes.revogarAcesso : para === 'cancelada';
    const garantir = typeof opcoes.garantirAcesso === 'boolean' ? opcoes.garantirAcesso : para === 'ativa';
    const em = agora();
    const por = porDe(req) || 'sistema';
    const set = { status: para, atualizadoEm: em };
    const unset = {};
    const entrada = { status: para, em, por, ...(motivo ? { motivo } : {}) };
    if (STATUS_VIGENTE.includes(para)) set.vigente = true;
    else unset.vigente = '';
    if (para === 'trancada') set.trancadaEm = em;
    if (para === 'ativa' && m.status === 'trancada') set.trancadaEm = null;
    if (para === 'cancelada') set.canceladaEm = em;
    if (para === 'concluida') {
      set.concluidaEm = em;
      set.resultadoFinal = resultadoFinal ?? null;
      set.certificadoCodigo = certificadoCodigo ?? m.certificadoCodigo ?? null;
    }
    if (m.status === 'concluida' && para === 'ativa') {
      entrada.resultadoAnterior = m.resultadoFinal ?? null;
      set.resultadoFinal = null;
      set.concluidaEm = null;
    }
    const update = { $set: set, $inc: { versao: 1 }, $push: { historico: entrada } };
    if (Object.keys(unset).length) update.$unset = unset;

    await auditoria.executar({
      acao: 'matricula.status_alterado', entidade: { tipo: 'matricula', id: hex(m._id) }, alvoUserId: m.userId, cursoId: m.cursoId,
      mudancas: [{ campo: 'status', de: m.status, para }], motivo,
      extra: { numero: m.numero, ...(revogar ? { revogarAcesso: true } : {}), ...(garantir ? { garantirAcesso: true } : {}) }
    }, req, async () => {
      let res;
      try {
        res = await r.matriculas().updateOne({ _id: m._id, status: m.status, versao: m.versao ?? 1 }, update);
      } catch (err) {
        if (duplicadoNoIndice(err, { indice: 'uq_matriculas_vigente' })) {
          const outra = await r.matriculas().findOne({ userId: m.userId, cursoId: m.cursoId, vigente: true }, { projection: { _id: 1 } });
          throw new ErroPortal(409, 'matricula-vigente-existe', undefined, { matriculaId: hex(outra?._id) });
        }
        throw err;
      }
      if (!res || res.matchedCount === 0) throw new ErroPortal(409, 'conflito-versao');
      if (revogar) await revogarAcesso(m);
      if (garantir) await concederAcesso(m, por);
    });
    return matriculaParaServico(await r.matriculas().findOne({ _id: m._id }));
  }

  /** secretaria.concluirMatricula — idempotente; ativa → concluída. */
  async function concluirMatricula(matriculaId, { resultadoFinal = null, certificadoCodigo = null, req = null } = {}) {
    const m = await lerMatricula(matriculaId);
    if (!m) throw naoEncontrada();
    if (m.status === 'concluida') return matriculaParaServico(m);
    return transicionar(m, 'concluida', { resultadoFinal, certificadoCodigo, req });
  }

  /** secretaria.vincularContrato — ÚNICO escritor de matriculas.contratoId (D-78). */
  async function vincularContrato(matriculaId, contratoId, { req = null } = {}) {
    const m = await lerMatricula(matriculaId);
    if (!m) throw naoEncontrada();
    let novo = null;
    if (contratoId !== null && contratoId !== undefined) {
      novo = paraObjectId(contratoId);
      if (!novo) throw new ErroPortal(400, 'validacao', undefined, { campos: { contratoId: 'Identificador inválido.' } });
    }
    const em = agora();
    await auditoria.executar({
      acao: 'matricula.contrato_vinculado', entidade: { tipo: 'matricula', id: hex(m._id) }, alvoUserId: m.userId, cursoId: m.cursoId,
      mudancas: [{ campo: 'contratoId', de: hex(m.contratoId), para: hex(novo) }], extra: { numero: m.numero }
    }, req, async () => {
      await r.matriculas().updateOne({ _id: m._id }, { $set: { contratoId: novo, atualizadoEm: em }, $inc: { versao: 1 } });
    });
    return matriculaParaServico(await r.matriculas().findOne({ _id: m._id }));
  }

  // ---------------------------------------------------------------
  // Enturmação
  // ---------------------------------------------------------------
  async function lerTurma(turmaId) {
    const oid = paraObjectId(turmaId);
    return oid ? r.turmas().findOne({ _id: oid }) : null;
  }

  /** Motivo (texto) por que a matrícula não pode ir para a turma, ou null. */
  function impedimentoDeEnturmar(m, turma) {
    if (!STATUS_VIGENTE.includes(m.status)) return `Matrícula ${ROTULOS_STATUS[m.status]?.toLowerCase() || m.status}: só matrículas ativas ou trancadas mudam de turma.`;
    if (turma && turma.cursoId !== m.cursoId) return 'A turma escolhida é de outro curso.';
    if (turma && turma.encerradaEm) return 'Esta turma está encerrada.';
    return null;
  }

  /** PUT …/matriculas/:id/turma e o lote. turmaId null = tirar da turma. */
  async function enturmar(alvo, turmaId, { req = null, versao, turma: turmaPronta = null } = {}) {
    const m = await lerMatricula(alvo);
    if (!m) throw naoEncontrada();
    if (versao !== undefined && versao !== null && Number(versao) !== Number(m.versao ?? 1)) throw new ErroPortal(409, 'conflito-versao');
    let turma = null;
    if (turmaId) {
      turma = turmaPronta || await lerTurma(turmaId);
      if (!turma) throw turmaNaoEncontrada();
      if (turma.cursoId !== m.cursoId) throw new ErroPortal(400, 'turma-de-outro-curso', undefined, { campos: { turmaId: 'A turma escolhida é de outro curso.' } });
    }
    const impedimento = impedimentoDeEnturmar(m, turma);
    if (impedimento) throw new ErroPortal(409, 'transicao-invalida', impedimento);
    if (hex(m.turmaId) === hex(turma?._id)) return matriculaParaServico(m);
    const em = agora();
    const por = porDe(req) || 'sistema';
    const lista = (Array.isArray(m.enturmacoes) ? m.enturmacoes : []).map(e => ({ ...e }));
    const ultima = lista[lista.length - 1];
    if (ultima && !ultima.ate) ultima.ate = em;
    if (turma) lista.push({ turmaId: turma._id, turmaCodigo: turma.codigo, de: em, ate: null, por });
    await auditoria.executar({
      acao: 'matricula.turma_alterada', entidade: { tipo: 'matricula', id: hex(m._id) }, alvoUserId: m.userId, cursoId: m.cursoId,
      mudancas: [{ campo: 'turma', de: turmaCodigoAtual(m), para: turma ? turma.codigo : null }], extra: { numero: m.numero }
    }, req, async () => {
      const res = await r.matriculas().updateOne(
        { _id: m._id, versao: m.versao ?? 1 },
        { $set: { turmaId: turma ? turma._id : null, enturmacoes: lista, atualizadoEm: em }, $inc: { versao: 1 } }
      );
      if (!res || res.matchedCount === 0) throw new ErroPortal(409, 'conflito-versao');
    });
    if (turma) {
      const id = hex(m._id);
      await notificar({
        userIds: [m.userId], tipo: 'matricula.enturmada', titulo: 'Turma definida',
        texto: `Sua matrícula ${m.numero} foi vinculada à turma ${turma.codigo}.`, link: `academico.html?m=${id}`,
        entidade: { tipo: 'matricula', id }
      });
    }
    return matriculaParaServico(await r.matriculas().findOne({ _id: m._id }));
  }

  /** POST /portal/admin/turmas/:id/matriculas → { enturmadas, ignoradas:[{ id, motivo }] }. */
  async function enturmarEmLote(turmaId, matriculaIds, { req = null } = {}) {
    const turma = await lerTurma(turmaId);
    if (!turma) throw turmaNaoEncontrada();
    let enturmadas = 0;
    const ignoradas = [];
    for (const id of [...new Set(matriculaIds.map(String))]) {
      const m = await lerMatricula(id);
      if (!m) { ignoradas.push({ id, motivo: 'Matrícula não encontrada.' }); continue; }
      const impedimento = impedimentoDeEnturmar(m, turma);
      if (impedimento) { ignoradas.push({ id, motivo: impedimento }); continue; }
      if (hex(m.turmaId) === hex(turma._id)) { ignoradas.push({ id, motivo: 'Já está nesta turma.' }); continue; }
      try {
        await enturmar(m, turma._id, { req, turma });
        enturmadas++;
      } catch (err) {
        if (err instanceof ErroPortal && err.status < 500) ignoradas.push({ id, motivo: err.message });
        else throw err;
      }
    }
    return { enturmadas, ignoradas };
  }

  // ---------------------------------------------------------------
  // Matrícula manual (POST /portal/admin/matriculas)
  // ---------------------------------------------------------------
  /**
   * @param {{ aluno: object, curso: object, turma?: object|null, inicioEm?: Date|null, liberarAcesso: boolean,
   *   semVerificacao: boolean, motivo?: string|null, req }} dados — já validados pela rota
   * → { matricula, liberacaoCriada }
   */
  async function criarManual({ aluno, curso, turma = null, inicioEm = null, liberarAcesso = true, semVerificacao = false, motivo = null, req = null }) {
    const userId = hex(aluno._id);
    const cursoId = String(curso._id);
    const existente = await r.matriculas().findOne({ userId, cursoId, vigente: true }, { projection: { _id: 1, numero: 1 } });
    if (existente) throw new ErroPortal(409, 'matricula-vigente-existe', undefined, { matriculaId: hex(existente._id), numero: existente.numero });
    if (turma && turma.cursoId !== cursoId) throw new ErroPortal(400, 'turma-de-outro-curso', undefined, { campos: { turmaId: 'A turma escolhida é de outro curso.' } });
    if (turma && turma.encerradaEm) throw new ErroPortal(409, 'transicao-invalida', 'Esta turma está encerrada.');
    await prontos();
    let doc = null;
    let liberacaoCriada = false;
    const por = porDe(req) || 'sistema';
    // O id é gerado antes: a auditoria grava ANTES da mutação já com a entidade certa.
    const novoId = new ObjectId();
    await auditoria.executar({
      acao: 'matricula.criada', entidade: { tipo: 'matricula', id: hex(novoId) }, alvoUserId: userId, cursoId,
      motivo, extra: { origem: 'admin', liberarAcesso: !!liberarAcesso, ...(turma ? { turma: turma.codigo } : {}), ...(semVerificacao ? { semVerificacao: true } : {}) }
    }, req, async () => {
      try {
        doc = await inserirMatricula({ userId, cursoId, origem: 'admin', inicioEm: inicioEm || agora(), turma, req, motivo, _id: novoId });
      } catch (err) {
        if (duplicadoNoIndice(err, { indice: 'uq_matriculas_vigente' })) {
          const outra = await r.matriculas().findOne({ userId, cursoId, vigente: true }, { projection: { _id: 1 } });
          throw new ErroPortal(409, 'matricula-vigente-existe', undefined, { matriculaId: hex(outra?._id) });
        }
        throw err;
      }
      if (liberarAcesso) {
        const res = await r.liberacoes().updateOne(
          { userId, cursoId },
          { $setOnInsert: { userId, cursoId, grantedAt: agora(), grantedBy: por } },
          { upsert: true }
        );
        liberacaoCriada = !!(res && (res.upsertedCount > 0 || res.upsertedId));
      }
    });
    await avisarCriada(doc);
    const lib = await r.liberacoes().findOne({ userId, cursoId }, { projection: { _id: 1 } });
    return { matricula: matriculaParaServico(doc, { semAcesso: !lib }), liberacaoCriada };
  }

  // ---------------------------------------------------------------
  // Outras correções da coordenação
  // ---------------------------------------------------------------
  async function alterarInicio(alvo, { inicioEm, motivo, versao, req = null }) {
    const m = await lerMatricula(alvo);
    if (!m) throw naoEncontrada();
    if (Number(versao) !== Number(m.versao ?? 1)) throw new ErroPortal(409, 'conflito-versao');
    const em = agora();
    await auditoria.executar({
      acao: 'matricula.inicio_alterado', entidade: { tipo: 'matricula', id: hex(m._id) }, alvoUserId: m.userId, cursoId: m.cursoId,
      mudancas: [{ campo: 'inicioEm', de: m.inicioEm ?? null, para: inicioEm }], motivo, extra: { numero: m.numero }
    }, req, async () => {
      const res = await r.matriculas().updateOne({ _id: m._id, versao: m.versao ?? 1 }, { $set: { inicioEm, atualizadoEm: em }, $inc: { versao: 1 } });
      if (!res || res.matchedCount === 0) throw new ErroPortal(409, 'conflito-versao');
    });
    return matriculaParaServico(await r.matriculas().findOne({ _id: m._id }));
  }

  async function alterarNomeEmDocumentos(alvo, { usar, motivo, versao, req = null }) {
    const m = await lerMatricula(alvo);
    if (!m) throw naoEncontrada();
    if (Number(versao) !== Number(m.versao ?? 1)) throw new ErroPortal(409, 'conflito-versao');
    if (usar === 'social') {
      const perfil = await r.perfis().findOne({ userId: m.userId }, { projection: { nomeSocial: 1 } });
      if (!perfil || typeof perfil.nomeSocial !== 'string' || !perfil.nomeSocial.trim()) {
        throw new ErroPortal(409, 'cadastro-incompleto', 'O aluno não informou nome social no perfil.', { faltando: ['nomeSocial'] });
      }
    }
    const em = agora();
    const valor = { usar, em, por: porDe(req) || 'sistema', motivo };
    await auditoria.executar({
      acao: 'matricula.nome_documentos_alterado', entidade: { tipo: 'matricula', id: hex(m._id) }, alvoUserId: m.userId, cursoId: m.cursoId,
      mudancas: [{ campo: 'nomeEmDocumentos', de: m.nomeEmDocumentos?.usar || 'registro', para: usar }], motivo, extra: { numero: m.numero }
    }, req, async () => {
      const res = await r.matriculas().updateOne({ _id: m._id, versao: m.versao ?? 1 }, { $set: { nomeEmDocumentos: valor, atualizadoEm: em }, $inc: { versao: 1 } });
      if (!res || res.matchedCount === 0) throw new ErroPortal(409, 'conflito-versao');
    });
    return matriculaParaServico(await r.matriculas().findOne({ _id: m._id }));
  }

  // ---------------------------------------------------------------
  // Turmas
  // ---------------------------------------------------------------
  /** Próximo código livre SIGLA-AAAA-NN (sequência a partir do maior já usado). */
  async function proximoCodigoTurma(sigla, ano) {
    const prefixo = `${sigla}-${ano}-`;
    const docs = await r.turmas().find({ codigo: { $regex: `^${sigla}-${ano}-\\d{2,3}$` } }, { projection: { codigo: 1 } }).toArray();
    let maior = 0;
    for (const d of docs) {
      const n = Number(String(d.codigo).slice(prefixo.length));
      if (Number.isInteger(n) && n > maior) maior = n;
    }
    return maior + 1;
  }

  async function criarTurma({ curso, codigo = null, nome = null, inicio, fim = null, modalidade, req = null }) {
    await prontos();
    const em = agora();
    const base = {
      cursoId: String(curso._id), nome, inicio, fim, modalidade, encerradaEm: null,
      versao: 1, criadoEm: em, atualizadoEm: em, criadoPor: porDe(req) || 'sistema'
    };
    let doc;
    if (codigo) {
      try {
        const res = await r.turmas().insertOne({ ...base, codigo });
        doc = { _id: res.insertedId, codigo, ...base };
      } catch (err) {
        if (duplicadoNoIndice(err, { indice: 'uq_turmas_codigo', campo: 'codigo' })) throw new ErroPortal(409, 'codigo-em-uso', undefined, { campos: { codigo: 'Código já usado por outra turma.' } });
        throw err;
      }
    } else {
      const sigla = typeof curso.sigla === 'string' && SIGLA_RE.test(curso.sigla) ? curso.sigla : null;
      if (!sigla) throw new ErroPortal(400, 'validacao', undefined, { campos: { codigo: 'Informe o código: este curso ainda não tem sigla para a sugestão.' } });
      const ano = Number(String(inicio).slice(0, 4)) || anoSP(em);
      let seq = await proximoCodigoTurma(sigla, ano);
      const { codigo: gerado, resultado } = await inserirComCodigo(
        c => r.turmas().insertOne({ ...base, codigo: c }),
        () => codigoTurmaSugerido(sigla, ano, Math.min(999, seq++)),
        { indice: 'uq_turmas_codigo', campo: 'codigo', tentativas: 5 }
      );
      doc = { _id: resultado.insertedId, codigo: gerado, ...base };
    }
    await auditoria.registrar?.({
      acao: 'turma.criada', entidade: { tipo: 'turma', id: hex(doc._id) }, cursoId: doc.cursoId, extra: { codigo: doc.codigo }
    }, req);
    return doc;
  }

  async function alterarTurma(turmaId, mudancas, { versao, req = null }) {
    const t = await lerTurma(turmaId);
    if (!t) throw turmaNaoEncontrada();
    if (Number(versao) !== Number(t.versao ?? 1)) throw new ErroPortal(409, 'conflito-versao');
    const depois = { ...t, ...mudancas };
    if (depois.fim && depois.inicio && depois.fim < depois.inicio) {
      throw new ErroPortal(400, 'validacao', undefined, { campos: { fim: 'O fim não pode ser antes do início.' } });
    }
    const set = { ...mudancas, atualizadoEm: agora() };
    const campos = Object.keys(mudancas);
    try {
      const res = await r.turmas().updateOne({ _id: t._id, versao: t.versao ?? 1 }, { $set: set, $inc: { versao: 1 } });
      if (!res || res.matchedCount === 0) throw new ErroPortal(409, 'conflito-versao');
    } catch (err) {
      if (duplicadoNoIndice(err, { indice: 'uq_turmas_codigo', campo: 'codigo' })) throw new ErroPortal(409, 'codigo-em-uso', undefined, { campos: { codigo: 'Código já usado por outra turma.' } });
      throw err;
    }
    await auditoria.registrar?.({
      acao: 'turma.alterada', entidade: { tipo: 'turma', id: hex(t._id) }, cursoId: t.cursoId,
      mudancas: auditoria.mudancas ? auditoria.mudancas(t, depois, campos) : null
    }, req);
    return r.turmas().findOne({ _id: t._id });
  }

  async function encerrarTurma(turmaId, { motivo = null, req = null } = {}) {
    const t = await lerTurma(turmaId);
    if (!t) throw turmaNaoEncontrada();
    if (t.encerradaEm) return t;
    const em = agora();
    await auditoria.executar({
      acao: 'turma.encerrada', entidade: { tipo: 'turma', id: hex(t._id) }, cursoId: t.cursoId, motivo, extra: { codigo: t.codigo }
    }, req, async () => {
      await r.turmas().updateOne({ _id: t._id }, { $set: { encerradaEm: em, atualizadoEm: em }, $inc: { versao: 1 } });
    });
    return r.turmas().findOne({ _id: t._id });
  }

  /** Quantos registros prendem a turma (matrícula em qualquer status ou nas enturmações, encontro, docência). */
  async function registrosDaTurma(t) {
    const formas = [t._id, hex(t._id)];
    const [mats, hist, lives, docs] = await Promise.all([
      r.matriculas().countDocuments({ turmaId: { $in: formas } }),
      r.matriculas().countDocuments({ 'enturmacoes.turmaId': { $in: formas } }),
      r.lives().countDocuments({ turmaId: { $in: formas } }),
      r.docencias().countDocuments({ turmaId: { $in: formas } })
    ]);
    return mats + hist + lives + docs;
  }

  async function removerTurma(turmaId, { req = null } = {}) {
    const t = await lerTurma(turmaId);
    if (!t) throw turmaNaoEncontrada();
    if (await registrosDaTurma(t)) throw new ErroPortal(409, 'tem-registros', 'Há matrículas, encontros ou professores ligados a esta turma. Encerre a turma em vez de excluir.');
    await auditoria.executar({
      acao: 'turma.removida', entidade: { tipo: 'turma', id: hex(t._id) }, cursoId: t.cursoId, extra: { codigo: t.codigo }
    }, req, async () => {
      await r.turmas().deleteOne({ _id: t._id });
    });
    return { ok: true };
  }

  return Object.freeze({
    // serviços de nome fixo (API §4.4)
    garantirMatricula, concluirMatricula, contagemAlunos, matriculaVigente, matriculaPorId, vincularContrato,
    matriculasDoAluno, turmasDoAluno, turmasDoCurso, alunosDoCurso,
    // operações da coordenação
    lerMatricula, lerTurma, materializar, sincronizar, transicionar, enturmar, enturmarEmLote, criarManual,
    alterarInicio, alterarNomeEmDocumentos, criarTurma, alterarTurma, encerrarTurma, removerTurma, registrosDaTurma,
    contarAlunosDaTurma, avisar
  });
}

/** Nomes fixos registrados pela F4a (API §4.4, D-78). */
export const NOMES_SERVICOS = Object.freeze([
  'garantirMatricula', 'concluirMatricula', 'contagemAlunos', 'matriculaVigente', 'matriculaPorId', 'vincularContrato',
  'matriculasDoAluno', 'turmasDoAluno', 'turmasDoCurso', 'alunosDoCurso'
]);

export { CODIGO_TURMA_RE };
