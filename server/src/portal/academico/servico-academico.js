// =============================================================
// COMPLEXO DMC · Portal — serviço acadêmico (F3a)
// PORTAL-API §4.4 (academico.*), §6.7.2–§6.7.4, §8.5 (registro de
// frequência, fonte única), §8.7, §8.8 (reconciliação), §8.11 · dono: F3a.
//
// Uma instância por módulo de rota (sem estado além da garantia de
// índices). Tudo o que é de outra fatia vem por serviço de nome fixo,
// resolvido na hora; ausente → degradação honesta (D7):
//   avaliacoes.notaDoModulo (F2) ausente  → média null, regra `aulas`;
//   estudos.aulasDisponiveis (F1a) ausente → leitura legada de aulas;
//   secretaria.* (F4a) ausente            → leitura das matrículas que
//                                            existem (nunca cria).
// =============================================================
import { ObjectId } from 'mongodb';
import { erro } from '../erros.js';
import { codigoVerificacao, inserirComCodigo, duplicadoNoIndice } from '../codigos.js';
import { iniciais as iniciaisDe } from '../validacao.js';
import {
  calcularFrequencia, calcularElegibilidade, situacaoModulo, situacaoCurso, rotuloDaSituacao, mediaParcial,
  criteriosDe, cargaDoCurso, chDoModulo, nivelRotulo, statusDoEncontro, janelaDoEncontro, encontroVisivel,
  ROTULOS_SITUACAO, ROTULOS_STATUS_MATRICULA, umaCasa
} from './calculo-academico.js';
import { criarRepositoriosAcademico, hex, oidDe, formas } from './repositorios.js';

export const STATUS_VIGENTE = Object.freeze(['ativa', 'trancada']);
export const STATUS_HISTORICO = Object.freeze(['concluida', 'cancelada']);
export const ORIGENS = Object.freeze(['ao_vivo', 'gravado']);
export const VIAS = Object.freeze(['entrada', 'conclusao_auto', 'conclusao_manual', 'lancamento_professor', 'reconciliacao']);
export const ROTULO_ORIGEM = Object.freeze({ ao_vivo: 'Frequência ao vivo', gravado: 'Frequência gravada' });

/** '9C1E-07AB-12F0-55DE' — 16 hex em grupos de 4 (API §6.7.6). */
export function hashPrefixo(hash) {
  if (typeof hash !== 'string' || !/^[a-f0-9]{16,}$/i.test(hash)) return null;
  return hash.slice(0, 16).toUpperCase().match(/.{4}/g).join('-');
}

/** Campos assinados da frequência (API §4.7) — mesma ordem lógica no registro e na verificação. */
export function camposAssinadosFrequencia(f) {
  return {
    codigo: f.codigo,
    matriculaId: hex(f.matriculaId),
    userId: String(f.userId),
    cursoId: String(f.cursoId),
    origem: f.origem,
    encontroId: f.encontroId ?? null,
    aulaId: f.aulaId ?? null,
    registradaEm: f.registradaEm instanceof Date ? f.registradaEm : new Date(f.registradaEm),
    via: f.via,
    pctVideo: typeof f.pctVideo === 'number' ? f.pctVideo : null
  };
}

const iso = d => (d instanceof Date ? d.toISOString() : (d ? new Date(d).toISOString() : null));

export function criarServicoAcademico({
  repo, servicos, assinador = null, auditoria = null, notificacoes = null, garantia = null,
  agora = () => new Date(), log = console
} = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarServicoAcademico: informe repo.');
  if (!servicos || typeof servicos.tentar !== 'function') throw new TypeError('criarServicoAcademico: informe servicos.');
  const R = criarRepositoriosAcademico({ repo });
  const tentar = nome => servicos.tentar(nome);
  const avisar = (texto, err) => {
    try { (log.warn || log.error).call(log, `[portal] academico: ${texto}${err ? ` (${err.message || err})` : ''}`); } catch { /* nada */ }
  };

  // ---------------------------------------------------------------
  // Matrículas (F4a) — serviço quando existe; leitura de degradação
  // ---------------------------------------------------------------
  async function matriculasDoAluno(userId) {
    const f = tentar('secretaria.matriculasDoAluno');
    if (typeof f === 'function') return (await f(String(userId))) || [];
    return R.matriculasDoUsuario(userId);
  }

  async function matriculaPorId(id) {
    if (!oidDe(id)) return null;
    const f = tentar('secretaria.matriculaPorId');
    if (typeof f === 'function') return f(hex(id));
    return R.matricula(id);
  }

  /** Materializa as matrículas das liberações (F4a, §8.2), em melhor esforço. */
  async function garantirMatriculas(userId, cursoIds) {
    const f = tentar('secretaria.garantirMatricula');
    if (typeof f !== 'function') return;
    for (const c of cursoIds) {
      try { await f(String(userId), String(c)); } catch (err) { avisar('garantirMatricula falhou', err); }
    }
  }

  async function alunosDoCurso({ cursoId, turmaIds = null }) {
    const f = tentar('secretaria.alunosDoCurso');
    let lista;
    if (typeof f === 'function' && (!turmaIds || turmaIds.length <= 1)) {
      lista = await f({ cursoId: String(cursoId), ...(turmaIds && turmaIds.length === 1 ? { turmaId: turmaIds[0] } : {}) });
      lista = (lista || []).filter(m => m.status !== 'cancelada');
      return lista.map(m => ({ _id: oidDe(m.matriculaId) || m.matriculaId, numero: m.numero, userId: m.userId, cursoId: String(cursoId), turmaId: m.turmaId ?? null, status: m.status, inicioEm: m.inicioEm }));
    }
    return R.matriculasDoCurso({ cursoId, turmaIds });
  }

  // ---------------------------------------------------------------
  // Conteúdo do curso
  // ---------------------------------------------------------------
  async function conteudoDoCurso(cursoId) {
    const [curso, modulos] = await Promise.all([R.curso(cursoId), R.modulosDoCurso(cursoId)]);
    let aulas = null;
    const f = tentar('estudos.aulasDisponiveis');
    if (typeof f === 'function') {
      try { aulas = (await f(String(cursoId))) || []; } catch (err) { avisar('estudos.aulasDisponiveis falhou', err); aulas = null; }
    }
    if (aulas === null) {
      const docs = await R.aulasDosModulos(modulos.map(m => m._id));
      aulas = docs.filter(a => a.disponivel !== false).map(a => ({ aulaId: String(a._id), moduloId: String(a.moduloId), codigo: a.codigo || null, titulo: a.titulo || '' }));
    }
    return { curso, modulos, aulas };
  }

  async function notaDoModulo(matriculaId, moduloId) {
    const f = tentar('avaliacoes.notaDoModulo');
    if (typeof f !== 'function' || !matriculaId) return null;
    try { return await f(hex(matriculaId), String(moduloId)); } catch (err) { avisar('avaliacoes.notaDoModulo falhou', err); return null; }
  }

  // ---------------------------------------------------------------
  // §8.5 Registro de frequência (fonte única)
  // ---------------------------------------------------------------
  async function garantirIndices() {
    if (garantia && typeof garantia.garantir === 'function') await garantia.garantir();
  }

  /**
   * registrarFrequencia({ matricula, origem, encontro?, aula?, via, pctVideo?, por, registradaEm?, snapshot? })
   * → { frequencia, criada:B }. Idempotente pelo índice único (2ª chamada devolve a existente).
   */
  async function registrarFrequencia({ matricula, origem, encontro = null, aula = null, via, pctVideo = null, por = 'sistema', registradaEm = null, snapshot = {} }) {
    if (!matricula) throw erro(404, 'nao-encontrado');
    if (matricula.status !== 'ativa') throw erro(409, 'matricula-nao-ativa');
    if (!ORIGENS.includes(origem) || !VIAS.includes(via)) throw new TypeError('registrarFrequencia: origem/via inválida.');
    if (!assinador) throw erro(503, 'servico-indisponivel');
    const encontroId = origem === 'ao_vivo' ? String(encontro?._id ?? '') : null;
    const aulaId = origem === 'gravado' ? String(aula?._id ?? aula?.aulaId ?? '') : null;
    if (origem === 'ao_vivo' && !encontroId) throw new TypeError('registrarFrequencia: encontro ausente.');
    if (origem === 'gravado' && !aulaId) throw new TypeError('registrarFrequencia: aula ausente.');

    const existente = await R.frequenciaExistente(matricula._id, origem, { encontroId, aulaId });
    if (existente) return { frequencia: existente, criada: false };

    await garantirIndices();
    const momento = registradaEm instanceof Date ? registradaEm : agora();
    const moduloId = origem === 'ao_vivo' ? (encontro.moduloId ?? null) : (aula?.moduloId ?? null);
    let doc;
    try {
      const { resultado } = await inserirComCodigo(async (codigo) => {
        const base = {
          codigo, matriculaId: oidDe(matricula._id) || matricula._id, userId: String(matricula.userId), cursoId: String(matricula.cursoId),
          turmaId: matricula.turmaId ?? null, moduloId: moduloId === null ? null : String(moduloId),
          origem, encontroId, aulaId, via, registradaEm: momento,
          pctVideo: typeof pctVideo === 'number' && Number.isFinite(pctVideo) ? umaCasa(pctVideo) : null
        };
        const { hash, kid } = assinador.assinar('frequencia', camposAssinadosFrequencia(base));
        doc = { ...base, snapshot, hash, kid, anulada: null, registradaPor: String(por) };
        await R.inserirFrequencia(doc);
        return doc;
      }, () => codigoVerificacao('FRQ'), { indice: 'uq_freq_codigo', campo: 'codigo' });
      return { frequencia: resultado, criada: true };
    } catch (err) {
      if (duplicadoNoIndice(err, { indice: 'uq_freq_encontro' }) || duplicadoNoIndice(err, { indice: 'uq_freq_aula' })) {
        const venc = await R.frequenciaExistente(matricula._id, origem, { encontroId, aulaId });
        if (venc) return { frequencia: venc, criada: false };
      }
      throw err;
    }
  }

  async function snapshotDe({ cursoId, moduloId, aula = null, encontro = null, turmaCodigo = null }) {
    const [curso, modulo] = await Promise.all([R.curso(cursoId), moduloId ? R.modulo(moduloId) : null]);
    return {
      cursoTitulo: curso?.titulo || '',
      moduloTitulo: modulo?.titulo || '',
      ...(aula ? { aulaTitulo: aula.titulo || '', aulaCodigo: aula.codigo || null } : {}),
      ...(encontro ? { encontroTitulo: encontro.titulo || '', encontroInicioEm: encontro.inicioEm || null } : {}),
      turmaCodigo
    };
  }

  async function turmaCodigoDe(matricula) {
    if (!matricula?.turmaId) return null;
    const t = await R.turma(matricula.turmaId);
    return t?.codigo || null;
  }

  // ---------------------------------------------------------------
  // §8.8 Reconciliação: progresso concluído → frequência gravada
  // ---------------------------------------------------------------
  async function reconciliarFrequenciasGravadas(matricula, conteudo = null) {
    if (!matricula || matricula.status !== 'ativa' || !assinador) return 0;
    const { curso, aulas } = conteudo || await conteudoDoCurso(matricula.cursoId);
    if (!aulas.length) return 0;
    const criterios = criteriosDe(curso);
    const [progresso, freqs] = await Promise.all([
      R.progressoDoUsuario(matricula.userId, aulas.map(a => a.aulaId)),
      R.frequenciasDaMatricula(matricula._id)
    ]);
    const jaTem = new Set(freqs.filter(f => f.origem === 'gravado').map(f => String(f.aulaId)));
    const inicio = matricula.inicioEm ? new Date(matricula.inicioEm).getTime() : 0;
    const porAula = new Map(aulas.map(a => [a.aulaId, a]));
    let n = 0;
    const turmaCodigo = await turmaCodigoDe(matricula);
    for (const p of progresso) {
      const aulaId = String(p.aulaId);
      if (jaTem.has(aulaId) || !porAula.has(aulaId)) continue;
      const em = p.completedAt ? new Date(p.completedAt) : null;
      if (!em || em.getTime() < inicio) continue;   // rematrícula: só o progresso desta matrícula
      let pct = null;
      try {
        const pv = await repo('progresso_video').findOne({ userId: String(matricula.userId), aulaId });
        pct = typeof pv?.pctMax === 'number' ? pv.pctMax : null;
      } catch { pct = null; }
      if (criterios.frequenciaGravadaExigeVideo && !(pct >= 90)) continue;
      const a = porAula.get(aulaId);
      try {
        const snapshot = await snapshotDe({ cursoId: matricula.cursoId, moduloId: a.moduloId, aula: { titulo: a.titulo, codigo: a.codigo }, turmaCodigo });
        const r = await registrarFrequencia({
          matricula, origem: 'gravado', aula: { _id: aulaId, moduloId: a.moduloId }, via: 'reconciliacao',
          pctVideo: pct, por: 'sistema', registradaEm: em, snapshot
        });
        if (r.criada) n++;
      } catch (err) { avisar('reconciliação falhou numa aula', err); }
    }
    return n;
  }

  /** Grupo aoConcluirAula (F1 dispara): frequência gravada da matrícula vigente. */
  async function aoConcluirAula(ctx = {}) {
    const { userId, cursoId, moduloId, aulaId, via, pctVideo = null, em = null } = ctx;
    if (!userId || !cursoId || !aulaId) return;
    const mats = await matriculasDoAluno(userId);
    const m = mats.find(x => String(x.cursoId) === String(cursoId) && x.status === 'ativa');
    if (!m) return;
    const { curso, aulas } = await conteudoDoCurso(cursoId);
    const a = aulas.find(x => x.aulaId === String(aulaId));
    if (!a) return;
    if (criteriosDe(curso).frequenciaGravadaExigeVideo && !(typeof pctVideo === 'number' && pctVideo >= 90)) return;
    const snapshot = await snapshotDe({ cursoId, moduloId: moduloId || a.moduloId, aula: { titulo: a.titulo, codigo: a.codigo }, turmaCodigo: await turmaCodigoDe(m) });
    await registrarFrequencia({
      matricula: m, origem: 'gravado', aula: { _id: a.aulaId, moduloId: a.moduloId },
      via: via === 'conclusao_auto' ? 'conclusao_auto' : 'conclusao_manual', pctVideo, por: String(userId),
      registradaEm: em instanceof Date ? em : null, snapshot
    });
  }

  // ---------------------------------------------------------------
  // Card e resumo da matrícula (§6.7.3)
  // ---------------------------------------------------------------
  async function cardMatricula(m, { curso = null, turma = undefined, situacao = null, temLiberacao = null } = {}) {
    const c = curso || await R.curso(m.cursoId);
    const t = turma === undefined ? (m.turmaId ? await R.turma(m.turmaId) : null) : turma;
    const ies = c?.iesId ? await R.ies(c.iesId) : null;
    let semAcesso = m.semAcesso === true;
    if (temLiberacao === false) semAcesso = true;
    return {
      id: hex(m._id),
      numero: m.numero || null,
      curso: { id: String(m.cursoId), titulo: c?.titulo || '—', sigla: c?.sigla || null },
      turma: t ? { id: hex(t._id), codigo: t.codigo || null, modalidade: t.modalidade || null } : null,
      nivel: c?.nivel || null,
      nivelRotulo: nivelRotulo(c, ies),
      cargaTotalHoras: cargaDoCurso(c),
      inicioEm: iso(m.inicioEm),
      status: m.status,
      statusRotulo: ROTULOS_STATUS_MATRICULA[m.status] || m.status,
      situacaoCurso: situacao,
      situacaoRotulo: situacao ? ROTULOS_SITUACAO[situacao] || null : null,
      semAcesso
    };
  }

  /**
   * Núcleo do cálculo de uma matrícula: frequência (fonte única), módulos, KPIs, elegibilidade.
   * `reconciliar` só no GET do Acadêmico do aluno (§8.8).
   */
  async function calcularMatricula(m, { reconciliar = false } = {}) {
    const conteudo = await conteudoDoCurso(m.cursoId);
    const { curso, modulos, aulas } = conteudo;
    if (reconciliar) {
      try { await reconciliarFrequenciasGravadas(m, conteudo); } catch (err) { avisar('reconciliação falhou', err); }
    }
    const criterios = criteriosDe(curso);
    const momento = agora();
    const [encontros, frequencias, progresso] = await Promise.all([
      R.encontrosDoCurso(m.cursoId),
      m._id ? R.frequenciasDaMatricula(m._id) : [],
      R.progressoDoUsuario(m.userId, aulas.map(a => a.aulaId))
    ]);
    const freq = calcularFrequencia(m, momento, { encontros, aulas, frequencias });
    const concluidas = new Set(progresso.map(p => String(p.aulaId)));
    const avaliacoesDisponiveis = typeof tentar('avaliacoes.notaDoModulo') === 'function';

    const linhas = [];
    for (const mod of modulos) {
      const moduloId = String(mod._id);
      const doMod = aulas.filter(a => a.moduloId === moduloId);
      const feitas = doMod.filter(a => concluidas.has(a.aulaId)).length;
      const nota = m._id ? await notaDoModulo(m._id, moduloId) : null;
      const temModular = nota?.temModular === true;
      const entrada = {
        temModular, nota: nota?.nota ?? null, aguardandoCorrecao: nota?.aguardandoCorrecao === true,
        finalizada: nota?.finalizada === true, tentativas: nota?.tentativas || null,
        aulasTotal: doMod.length, aulasConcluidas: feitas
      };
      const situacao = situacaoModulo(entrada, criterios.notaMinima);
      const f = freq.porModulo[moduloId] || null;
      const iniciado = feitas > 0 || (nota?.tentativas?.usadas || 0) > 0 || !!(f && (f.presente + f.compensado + f.gravado) > 0);
      linhas.push({
        moduloId,
        numero: mod.numero || String(linhas.length + 1).padStart(2, '0'),
        titulo: mod.titulo || '',
        tipo: mod.tipo === 'tcc' ? 'tcc' : 'regular',
        chHoras: chDoModulo(mod),
        media: temModular ? (nota?.nota ?? null) : null,
        frequencia: f ? { pct: f.frequenciaPct, aoVivoPct: f.aoVivoPct, gravadoPct: f.gravadoPct, faltas: f.faltas, pendentes: f.pendentes, contaveis: f.contaveis } : null,
        situacao,
        situacaoRotulo: rotuloDaSituacao(situacao, { aguardandoCorrecao: entrada.aguardandoCorrecao, iniciado }),
        aguardandoCorrecao: entrada.aguardandoCorrecao,
        tentativas: temModular && nota?.tentativas ? { usadas: nota.tentativas.usadas ?? 0, permitidas: nota.tentativas.permitidas ?? null, restantes: nota.tentativas.restantes ?? 0 } : null,
        avaliacaoModularId: temModular ? (nota?.avaliacaoModularId ?? null) : null,
        aulasTotal: doMod.length,
        aulasConcluidas: feitas,
        temModular,
        iniciado
      });
    }

    const aulasTotal = aulas.length;
    const aulasConcluidas = aulas.filter(a => concluidas.has(a.aulaId)).length;
    const elegibilidade = calcularElegibilidade({
      curso, aulasTotal, aulasConcluidas, frequenciaPct: freq.frequenciaPct, avaliacoesDisponiveis,
      modulos: linhas.map(l => ({ moduloId: l.moduloId, numero: l.numero, titulo: l.titulo, tipo: l.tipo, temModular: l.temModular, situacao: l.situacao }))
    });
    const situacao = situacaoCurso({ elegibilidade, modulos: linhas, matricula: m });
    const media = mediaParcial(linhas.map(l => l.media));
    const emAndamento = linhas.filter(l => (l.situacao === 'cursando' || l.situacao === 'em_recuperacao') && l.iniciado).length;
    const cumpridos = linhas.filter(l => l.situacao === 'aprovado' || l.situacao === 'concluido');
    const cumpridaHoras = cumpridos.some(l => l.chHoras === null) ? null : umaCasa(cumpridos.reduce((s, l) => s + (l.chHoras || 0), 0));
    return {
      curso, criterios, freq, linhas, elegibilidade, situacao, media, aulasTotal, aulasConcluidas,
      kpis: {
        mediaParcial: media,
        frequenciaGeralPct: freq.frequenciaPct,
        aoVivoPct: freq.aoVivoPct,
        gravadoPct: freq.gravadoPct,
        modulos: {
          total: linhas.length,
          aprovados: linhas.filter(l => l.situacao === 'aprovado').length,
          concluidos: linhas.filter(l => l.situacao === 'concluido').length,
          emAndamento
        },
        cargaHoraria: { totalHoras: cargaDoCurso(curso), cumpridaHoras },
        emAndamento
      }
    };
  }

  /** ResumoMatricula (§6.7.3) a partir do documento da matrícula. */
  async function resumoDaMatricula(m, { visao = 'aluno', reconciliar = false } = {}) {
    const calc = await calcularMatricula(m, { reconciliar });
    const turma = m.turmaId ? await R.turma(m.turmaId) : null;
    const cert = await R.certificado(m.userId, m.cursoId);
    const concluida = m.status === 'concluida' && m.resultadoFinal;
    const linhas = calc.linhas.map(({ aulasTotal, aulasConcluidas, temModular, iniciado, tipo, ...l }) => l);
    return {
      matricula: await cardMatricula(m, { curso: calc.curso, turma, situacao: calc.situacao }),
      notaMinima: calc.criterios.notaMinima,
      kpis: calc.kpis,
      linhas,
      enturmacoes: (Array.isArray(m.enturmacoes) ? m.enturmacoes : []).map(e => ({ turmaCodigo: e.turmaCodigo || null, de: iso(e.de), ate: iso(e.ate) })),
      pendencias: concluida ? [] : calc.elegibilidade.pendencias,
      certificado: { emitido: !!cert, elegivel: !!cert || calc.elegibilidade.elegivel, codigo: cert?.codigo || null },
      ...(visao === 'aluno' ? {} : {})
    };
  }

  /** academico.resumoMatricula (serviço de nome fixo). */
  async function resumoMatricula(matriculaId, { visao = 'aluno' } = {}) {
    const m = await matriculaPorId(matriculaId);
    if (!m) return null;
    return resumoDaMatricula(m, { visao });
  }

  /** GET /portal/me/academico */
  async function academicoDoAluno(userId) {
    const libs = await repo('liberacoes').find({ userId: String(userId) }, { projection: { cursoId: 1 } }).toArray();
    const liberados = new Set(libs.map(l => String(l.cursoId)));
    await garantirMatriculas(userId, [...liberados]);
    const mats = await matriculasDoAluno(userId);
    const cursos = await R.cursos(mats.map(m => m.cursoId));
    const turmas = await R.turmas(mats.map(m => m.turmaId).filter(Boolean));
    const atuais = [];
    const historico = [];
    for (const m of mats) {
      const curso = cursos.get(String(m.cursoId)) || null;
      const turma = m.turmaId ? turmas.get(hex(m.turmaId)) || null : null;
      if (STATUS_VIGENTE.includes(m.status)) {
        let situacao = null;
        try { situacao = (await calcularMatricula(m)).situacao; } catch (err) { avisar('situação da matrícula falhou', err); }
        atuais.push(await cardMatricula(m, { curso, turma, situacao, temLiberacao: liberados.has(String(m.cursoId)) }));
      } else if (STATUS_HISTORICO.includes(m.status)) {
        const r = m.resultadoFinal || null;
        const situacao = m.status === 'concluida' ? (r?.regra === 'aprovacao' ? 'aprovado' : 'concluido') : null;
        const cert = m.certificadoCodigo ? { codigo: m.certificadoCodigo } : null;
        historico.push({
          ...(await cardMatricula(m, { curso, turma, situacao })),
          notaFinal: typeof r?.notaFinal === 'number' ? r.notaFinal : null,
          concluidaEm: iso(m.concluidaEm), canceladaEm: iso(m.canceladaEm),
          certificado: cert
        });
      }
    }
    const semMatricula = [...liberados].filter(c => !mats.some(m => String(m.cursoId) === c && m.status !== 'cancelada'));
    return { atuais, historico, liberacoesSemMatricula: semMatricula.length };
  }

  /** academico.situacaoDoCurso (F1, F6, F8). */
  async function situacaoDoCurso(userId, cursoId) {
    const mats = await matriculasDoAluno(userId);
    const m = mats.find(x => String(x.cursoId) === String(cursoId) && x.status !== 'cancelada')
      || { _id: null, userId: String(userId), cursoId: String(cursoId), turmaId: null, status: 'ativa', inicioEm: null };
    const calc = await calcularMatricula(m);
    return {
      situacao: calc.situacao,
      situacaoRotulo: ROTULOS_SITUACAO[calc.situacao] || null,
      mediaParcial: calc.media,
      frequenciaGeralPct: calc.freq.frequenciaPct,
      aoVivoPct: calc.freq.aoVivoPct,
      gravadoPct: calc.freq.gravadoPct,
      modulos: calc.linhas.map(l => ({ moduloId: l.moduloId, titulo: l.titulo, chHoras: l.chHoras, nota: l.media, situacao: l.situacao, frequenciaPct: l.frequencia?.pct ?? null, faltas: l.frequencia?.faltas ?? 0 })),
      elegivelCertificado: calc.elegibilidade.elegivel,
      regra: calc.elegibilidade.regra,
      pendencias: calc.elegibilidade.pendencias
    };
  }

  // ---------------------------------------------------------------
  // Encontros: agenda, próximos, escopo
  // ---------------------------------------------------------------
  async function proximosEncontros(userId, { dias = 14, limite = 20 } = {}) {
    const mats = (await matriculasDoAluno(userId)).filter(m => m.status === 'ativa');
    if (!mats.length) return [];
    const momento = agora();
    const ate = new Date(momento.getTime() + dias * 86400000);
    const encs = await R.encontrosDosCursos(mats.map(m => m.cursoId), { de: new Date(momento.getTime() - 4 * 3600000), ate });
    const cursos = await R.cursos(encs.map(e => e.cursoId));
    const turmas = await R.turmas(encs.map(e => e.turmaId).filter(Boolean));
    const out = [];
    for (const e of encs) {
      if (!mats.some(m => encontroVisivel(e, m))) continue;
      if (statusDoEncontro(e, momento) === 'encerrada') continue;
      const mod = e.moduloId ? await R.modulo(e.moduloId) : null;
      out.push({ id: String(e._id), titulo: e.titulo || '', cursoTitulo: cursos.get(String(e.cursoId))?.titulo || '', moduloTitulo: mod?.titulo || null, inicioEm: iso(e.inicioEm), turmaCodigo: e.turmaId ? turmas.get(hex(e.turmaId))?.codigo || null : null });
      if (out.length >= limite) break;
    }
    return out;
  }

  async function encontrosDoEscopo(cursoIds, { turmaIds = null, dias = 7, limite = 20 } = {}) {
    const momento = agora();
    const encs = await R.encontrosDosCursos(cursoIds, { de: new Date(momento.getTime() - 4 * 3600000), ate: new Date(momento.getTime() + dias * 86400000) });
    const turmas = await R.turmas(encs.map(e => e.turmaId).filter(Boolean));
    const permitidas = Array.isArray(turmaIds) ? new Set(turmaIds.map(String)) : null;
    return encs
      .filter(e => e.cancelado !== true && (!permitidas || e.turmaId == null || permitidas.has(hex(e.turmaId))))
      .filter(e => statusDoEncontro(e, momento) !== 'encerrada')
      .slice(0, limite)
      .map(e => ({ id: String(e._id), cursoId: String(e.cursoId), titulo: e.titulo || '', inicioEm: iso(e.inicioEm), turmaCodigo: e.turmaId ? turmas.get(hex(e.turmaId))?.codigo || null : null, status: statusDoEncontro(e, momento) }));
  }

  // ---------------------------------------------------------------
  // Validador FRQ (grupo `validador`, §6.7.6)
  // ---------------------------------------------------------------
  async function nomeDoTitular(userId) {
    const ident = tentar('perfis.identificacao');
    if (typeof ident === 'function') {
      try { const r = await ident(String(userId)); if (r?.nomeRegistro) return r.nomeRegistro; } catch { /* segue */ }
    }
    const u = await R.usuario(userId);
    return u?.nome || null;
  }

  async function validarFrequencia(codigo) {
    const f = await R.frequenciaPorCodigo(codigo);
    if (!f) return null;
    let integro = null;
    if (assinador && f.hash && f.kid) integro = assinador.verificar('frequencia', camposAssinadosFrequencia(f), f.hash, f.kid);
    const nome = await nomeDoTitular(f.userId);
    return {
      valido: true,
      codigo: f.codigo,
      tipo: 'frequencia',
      rotulo: ROTULO_ORIGEM[f.origem] || 'Registro de frequência',
      emitidoEm: iso(f.registradaEm),
      emissor: 'Complexo DMC',
      iniciais: iniciaisDe(nome || ''),
      integro,
      situacao: f.anulada ? 'anulado' : 'valido',
      hashPrefixo: hashPrefixo(f.hash),
      detalhes: { curso: f.snapshot?.cursoTitulo || null, origem: f.origem, registradaEm: iso(f.registradaEm) }
    };
  }

  return Object.freeze({
    R,
    criteriosDe,
    registrarFrequencia,
    reconciliarFrequenciasGravadas,
    aoConcluirAula,
    matriculasDoAluno,
    matriculaPorId,
    alunosDoCurso,
    conteudoDoCurso,
    calcularMatricula,
    cardMatricula,
    resumoDaMatricula,
    resumoMatricula,
    academicoDoAluno,
    situacaoDoCurso,
    proximosEncontros,
    encontrosDoEscopo,
    validarFrequencia,
    nomeDoTitular,
    snapshotDe,
    turmaCodigoDe,
    janelaDoEncontro,
    statusDoEncontro,
    encontroVisivel
  });
}

export { ObjectId, formas };
