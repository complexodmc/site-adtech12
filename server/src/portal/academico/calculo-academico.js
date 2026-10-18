// =============================================================
// COMPLEXO DMC · Portal — cálculo acadêmico (PURO; P1 da F3a)
// PORTAL-API §8.3 (horasDe), §8.6 (visibilidade), §8.7 (frequência),
// §8.11 (notas, situação e certificado — DECISÕES DO CEO, item 4),
// DC-66 (critérios do curso nas DUAS regras) · índice §8.2 item 6 · dono: F3a.
//
// Nenhuma E/S: tudo o que é dado entra por parâmetro. A F3b importa
// estas funções (assinaturas congeladas depois do P1; só acréscimos):
//
//   horasDe(texto) → N|null
//   criteriosDe(curso) → { notaMinima, frequenciaMinima, cargaMinimaHoras, exigeTcc, frequenciaGravadaExigeVideo }
//   statusDoEncontro(encontro, agora) → 'agendada'|'ao-vivo'|'encerrada'|'cancelada'
//   janelaDoEncontro(encontro) → { abertura:Date, inicio:Date, fim:Date } | null
//   encontroVisivel(encontro, matricula) → B
//   calcularFrequencia(matricula, agora, { encontros, aulas, frequencias }) → Frequencia (+ porModulo)
//   situacaoModulo(entrada, notaMinima) → 'cursando'|'concluido'|'aprovado'|'em_recuperacao'|'reprovado'
//   calcularElegibilidade(entrada) → { elegivel, regra:'aulas'|'aprovacao', pendencias:[{ tipo, moduloId?, texto }] }
//   situacaoCurso(entrada) → 'cursando'|'concluido'|'aprovado'|'reprovado'
//   mediaParcial(notas) → N|null
//
// Regra do CEO (nota mínima 7, 0–10): nota do módulo = MELHOR tentativa
// corrigida da avaliação MODULAR publicada (prévia não conta); aprovado
// com nota ≥ notaMinima; curso aprovado = 100% das aulas disponíveis E
// todos os módulos com modular publicada aprovados; curso sem modular
// publicada segue a regra antiga (100% das aulas). Os critérios do curso
// (frequência mínima, carga mínima, TCC) valem nas DUAS regras.
// =============================================================

export const NOTA_MINIMA_PADRAO = 7;
export const ABRE_ANTES_MIN = 15;          // = lives.js (statusDaLive do legado)
export const DURACAO_PADRAO_MIN = 90;      // = lives.js
const MIN = 60 * 1000;

export const NIVEIS = Object.freeze(['curso_livre', 'extensao', 'aperfeicoamento', 'pos_graduacao_lato_sensu']);
export const ROTULOS_NIVEL = Object.freeze({
  curso_livre: 'Curso livre',
  extensao: 'Extensão',
  aperfeicoamento: 'Aperfeiçoamento',
  pos_graduacao_lato_sensu: 'Pós-graduação lato sensu'
});

export const SITUACOES_MODULO = Object.freeze(['cursando', 'concluido', 'aprovado', 'em_recuperacao', 'reprovado']);
export const ROTULOS_SITUACAO = Object.freeze({
  nao_iniciado: 'Não iniciado',
  cursando: 'Cursando',
  aguardando_correcao: 'Aguardando correção',
  em_recuperacao: 'Em recuperação',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  concluido: 'Concluído'
});
export const ROTULOS_STATUS_MATRICULA = Object.freeze({
  ativa: 'Ativa', trancada: 'Trancada', concluida: 'Concluída', cancelada: 'Cancelada'
});

/** Arredonda a 1 casa, meio para cima, sem resíduo de ponto flutuante. */
export function umaCasa(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

// ---------------------------------------------------------------------------
// §8.3 horasDe
// ---------------------------------------------------------------------------
/**
 * '42 horas'→42 · '360h'→360 · '3h 50min'→3.8 · '90min'→1.5 · ''|'—'|'abc'→null.
 * Número recebido como número é devolvido (≥ 0) com 1 casa.
 */
export function horasDe(texto) {
  if (typeof texto === 'number') return Number.isFinite(texto) && texto >= 0 ? umaCasa(texto) : null;
  if (typeof texto !== 'string') return null;
  const s = texto.toLowerCase().replace(',', '.').trim();
  if (!s) return null;
  const h = /(\d+(?:\.\d+)?)\s*(?:h\b|h(?=\s|\d|$)|hs\b|hora|horas)/.exec(s);
  const m = /(\d+(?:\.\d+)?)\s*(?:min|minuto|minutos|m\b)/.exec(s);
  let total = 0;
  let achou = false;
  if (h) { total += Number(h[1]); achou = true; }
  if (m && (!h || m.index !== h.index)) { total += Number(m[1]) / 60; achou = true; }
  if (!achou) return null;
  return Number.isFinite(total) ? umaCasa(total) : null;
}

// ---------------------------------------------------------------------------
// critériosDe
// ---------------------------------------------------------------------------
function numeroEntre(v, min, max) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Critérios do curso com os padrões (ausentes = sem efeito; nenhum curso de hoje muda — D5). */
export function criteriosDe(curso) {
  const c = curso && typeof curso.criterios === 'object' && curso.criterios ? curso.criterios : {};
  const nota = numeroEntre(c.notaMinima, 0, 10);
  return {
    notaMinima: nota === null ? NOTA_MINIMA_PADRAO : umaCasa(nota),
    frequenciaMinima: numeroEntre(c.frequenciaMinima, 0, 100),
    cargaMinimaHoras: numeroEntre(c.cargaMinimaHoras, 0, 10000),
    exigeTcc: c.exigeTcc === true,
    frequenciaGravadaExigeVideo: c.frequenciaGravadaExigeVideo === true
  };
}

/** Carga horária do curso: `cargaHorariaHoras` ou, na falta, horasDe(cargaHoraria). */
export function cargaDoCurso(curso) {
  if (!curso) return null;
  const n = numeroEntre(curso.cargaHorariaHoras, 0, 10000);
  return n !== null ? umaCasa(n) : horasDe(curso.cargaHoraria);
}

/** CH do módulo: `chHoras` ou horasDe(duracao). */
export function chDoModulo(modulo) {
  if (!modulo) return null;
  const n = numeroEntre(modulo.chHoras, 0, 10000);
  return n !== null ? umaCasa(n) : horasDe(modulo.duracao);
}

export function nivelRotulo(curso, ies = null) {
  const nivel = curso && NIVEIS.includes(curso.nivel) ? curso.nivel : null;
  if (!nivel) return null;
  if (nivel === 'pos_graduacao_lato_sensu') {
    // Só com IES parceira ativa cadastrada; nunca "reconhecido".
    if (!ies || ies.ativa === false || !ies.nome) return null;
    return `${ROTULOS_NIVEL[nivel]} · ofertado por ${ies.nome}`;
  }
  return ROTULOS_NIVEL[nivel];
}

// ---------------------------------------------------------------------------
// Encontros (§8.6 e janela do legado statusDaLive)
// ---------------------------------------------------------------------------
const idTexto = v => (v === null || v === undefined ? null : String(v));

function ms(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** { abertura, inicio, fim } do encontro, ou null com início inválido. */
export function janelaDoEncontro(encontro) {
  const inicio = ms(encontro?.inicioEm);
  if (!Number.isFinite(inicio)) return null;
  const dur = (Number(encontro.duracaoMin) || DURACAO_PADRAO_MIN) * MIN;
  return { abertura: new Date(inicio - ABRE_ANTES_MIN * MIN), inicio: new Date(inicio), fim: new Date(inicio + dur) };
}

/** Mesmo resultado do statusDaLive legado + 'cancelada'. */
export function statusDoEncontro(encontro, agora = new Date()) {
  if (encontro?.cancelado === true) return 'cancelada';
  const j = janelaDoEncontro(encontro);
  if (!j) return 'agendada';
  const t = ms(agora);
  if (t < j.abertura.getTime()) return 'agendada';
  if (t <= j.fim.getTime()) return 'ao-vivo';
  return 'encerrada';
}

/** §8.6: mesmo curso, não cancelado e (sem turma ou turma da matrícula). */
export function encontroVisivel(encontro, matricula, { incluirCancelados = false } = {}) {
  if (!encontro || !matricula) return false;
  if (String(encontro.cursoId) !== String(matricula.cursoId)) return false;
  if (encontro.cancelado === true && !incluirCancelados) return false;
  const t = idTexto(encontro.turmaId);
  return t === null || t === idTexto(matricula.turmaId);
}

// ---------------------------------------------------------------------------
// §8.7 Frequência (fonte única)
// ---------------------------------------------------------------------------
function blocoVazio() {
  return { contaveis: 0, presente: 0, compensado: 0, gravado: 0, faltas: 0, pendentes: 0, emAndamento: 0 };
}

function fecharBloco(b) {
  const out = {
    contaveis: b.contaveis, presente: b.presente, compensado: b.compensado, gravado: b.gravado,
    faltas: b.faltas, pendentes: b.pendentes,
    frequenciaPct: null, aoVivoPct: null, gravadoPct: null
  };
  if (b.contaveis > 0) {
    // A geral é arredondada do valor exato (é o número que decide critério de frequência);
    // as partes somam a geral por construção (a gravada leva o resíduo do arredondamento).
    out.frequenciaPct = umaCasa((100 * (b.presente + b.compensado + b.gravado)) / b.contaveis);
    out.aoVivoPct = umaCasa((100 * b.presente) / b.contaveis);
    out.gravadoPct = umaCasa(out.frequenciaPct - out.aoVivoPct);
  }
  return out;
}

/**
 * calcularFrequencia(matricula, agora, { encontros, aulas, frequencias })
 *   matricula   { _id|id, cursoId, turmaId }
 *   encontros   lives do curso (o filtro de visibilidade §8.6 é aplicado aqui)
 *   aulas       aulas DISPONÍVEIS do curso: [{ aulaId|_id|id, moduloId }]
 *   frequencias registros DA MATRÍCULA: [{ origem, encontroId, aulaId, anulada, codigo }]
 * → { contaveis, presente, compensado, gravado, faltas, pendentes, frequenciaPct, aoVivoPct, gravadoPct,
 *     porEncontro:[{ encontroId, moduloId, estado, codigo }], porModulo:{ [moduloId]: mesmo formato sem porEncontro },
 *     porAula:{ [aulaId]: { estado:'gravado'|'pendente', codigo } } }
 * `futuro` = abertura > agora (fica fora da conta); em andamento fica fora do denominador até acabar
 * ou ser atendido. Encontros sem módulo só entram no geral.
 */
export function calcularFrequencia(matricula, agora = new Date(), { encontros = [], aulas = [], frequencias = [] } = {}) {
  const t = ms(agora);
  const validas = (frequencias || []).filter(f => f && !f.anulada);
  const aoVivo = new Map();
  const gravada = new Map();
  for (const f of validas) {
    if (f.origem === 'ao_vivo' && f.encontroId != null) aoVivo.set(String(f.encontroId), f);
    if (f.origem === 'gravado' && f.aulaId != null) gravada.set(String(f.aulaId), f);
  }

  const visiveis = (encontros || [])
    .filter(e => encontroVisivel(e, matricula))
    .sort((a, b) => ms(a.inicioEm) - ms(b.inicioEm));
  const vinculadas = new Set(visiveis.map(e => idTexto(e.aulaGravadaId)).filter(Boolean));

  const geral = blocoVazio();
  const porModuloAcc = new Map();
  const doModulo = (m) => {
    if (m === null) return null;
    if (!porModuloAcc.has(m)) porModuloAcc.set(m, blocoVazio());
    return porModuloAcc.get(m);
  };
  const somar = (bloco, campo) => { bloco[campo] += 1; };

  const porEncontro = [];
  for (const e of visiveis) {
    const j = janelaDoEncontro(e);
    const encontroId = String(e._id ?? e.id);
    const moduloId = idTexto(e.moduloId);
    const alvoMod = doModulo(moduloId);
    if (!j || j.abertura.getTime() > t) {
      porEncontro.push({ encontroId, moduloId, estado: 'futuro', codigo: null });
      continue;
    }
    let estado;
    let codigo = null;
    const pres = aoVivo.get(encontroId);
    const comp = e.aulaGravadaId != null ? gravada.get(String(e.aulaGravadaId)) : null;
    if (pres) { estado = 'presente'; codigo = pres.codigo || null; }
    else if (comp) { estado = 'compensado'; codigo = comp.codigo || null; }
    else if (j.fim.getTime() < t) estado = 'falta';
    else estado = 'em_andamento';
    porEncontro.push({ encontroId, moduloId, estado, codigo });
    for (const b of [geral, alvoMod].filter(Boolean)) {
      if (estado === 'presente') { somar(b, 'presente'); somar(b, 'contaveis'); }
      else if (estado === 'compensado') { somar(b, 'compensado'); somar(b, 'contaveis'); }
      else if (estado === 'falta') { somar(b, 'faltas'); somar(b, 'contaveis'); }
      else { somar(b, 'pendentes'); somar(b, 'emAndamento'); }
    }
  }

  const porAula = {};
  for (const a of aulas || []) {
    const aulaId = String(a.aulaId ?? a._id ?? a.id);
    if (vinculadas.has(aulaId)) continue;
    const moduloId = idTexto(a.moduloId);
    const f = gravada.get(aulaId);
    porAula[aulaId] = { estado: f ? 'gravado' : 'pendente', codigo: f?.codigo || null };
    for (const b of [geral, doModulo(moduloId)].filter(Boolean)) {
      somar(b, 'contaveis');
      if (f) somar(b, 'gravado'); else somar(b, 'pendentes');
    }
  }

  const porModulo = {};
  for (const [m, b] of porModuloAcc) porModulo[m] = fecharBloco(b);
  return { ...fecharBloco(geral), porEncontro, porModulo, porAula };
}

// ---------------------------------------------------------------------------
// §8.11 Situação do módulo
// ---------------------------------------------------------------------------
/**
 * situacaoModulo({ temModular, nota, aguardandoCorrecao, emAndamento, finalizada, tentativas:{ restantes },
 *                  aulasTotal, aulasConcluidas }, notaMinima = 7)
 * Sem modular publicada → 'concluido' com 100% das aulas disponíveis do módulo, senão 'cursando'.
 * Com modular → sem tentativa corrigida 'cursando'; melhor ≥ mínima 'aprovado'; melhor < mínima e
 * (restantes > 0 e não finalizada, ou tentativa aguardando correção/em andamento) 'em_recuperacao';
 * senão 'reprovado'.
 */
export function situacaoModulo(entrada = {}, notaMinima = NOTA_MINIMA_PADRAO) {
  const minima = typeof notaMinima === 'number' && Number.isFinite(notaMinima) ? notaMinima : NOTA_MINIMA_PADRAO;
  if (!entrada.temModular) {
    const total = Number(entrada.aulasTotal) || 0;
    const feitas = Number(entrada.aulasConcluidas) || 0;
    return total > 0 && feitas >= total ? 'concluido' : 'cursando';
  }
  const nota = typeof entrada.nota === 'number' && Number.isFinite(entrada.nota) ? entrada.nota : null;
  if (nota === null) return 'cursando';
  if (nota >= minima) return 'aprovado';
  const restantes = Number(entrada.tentativas?.restantes) || 0;
  if ((restantes > 0 && !entrada.finalizada) || entrada.aguardandoCorrecao === true || entrada.emAndamento === true) {
    return 'em_recuperacao';
  }
  return 'reprovado';
}

/** Rótulo da linha (UX §6.5): acrescenta "Não iniciado" e "Aguardando correção" a 'cursando'. */
export function rotuloDaSituacao(situacao, { aguardandoCorrecao = false, iniciado = true } = {}) {
  if (situacao === 'cursando' && aguardandoCorrecao) return ROTULOS_SITUACAO.aguardando_correcao;
  if (situacao === 'cursando' && !iniciado) return ROTULOS_SITUACAO.nao_iniciado;
  return ROTULOS_SITUACAO[situacao] || ROTULOS_SITUACAO.cursando;
}

/** Média simples das notas não nulas (1 casa); null sem nenhuma. */
export function mediaParcial(notas) {
  const v = (notas || []).filter(n => typeof n === 'number' && Number.isFinite(n));
  if (!v.length) return null;
  return umaCasa(v.reduce((s, n) => s + n, 0) / v.length);
}

// ---------------------------------------------------------------------------
// §8.11 Elegibilidade do certificado e situação do curso
// ---------------------------------------------------------------------------
const fmtPct = n => `${String(umaCasa(n)).replace('.', ',')}%`;

/**
 * calcularElegibilidade({
 *   curso,                    // { nivel, criterios, cargaHorariaHoras, cargaHoraria }
 *   aulasTotal, aulasConcluidas,
 *   modulos:[{ moduloId, numero, titulo, tipo:'regular'|'tcc', temModular, situacao }],
 *   frequenciaPct,            // frequência geral de §8.7 (null = não apurada)
 *   avaliacoesDisponiveis = true   // false sem a F2: TCC exigido vira pendência "indisponível"
 * }) → { elegivel, regra, pendencias }
 */
export function calcularElegibilidade(entrada = {}) {
  const curso = entrada.curso || {};
  const criterios = criteriosDe(curso);
  const modulos = Array.isArray(entrada.modulos) ? entrada.modulos : [];
  const comModular = modulos.filter(m => m.temModular);
  const regra = comModular.length ? 'aprovacao' : 'aulas';
  const pendencias = [];

  if (curso.nivel === 'pos_graduacao_lato_sensu') {
    pendencias.push({ tipo: 'certificado-pela-ies', texto: 'O certificado deste curso é emitido pela instituição parceira.' });
  }

  const total = Number(entrada.aulasTotal) || 0;
  const feitas = Math.min(Number(entrada.aulasConcluidas) || 0, total);
  if (total === 0 || feitas < total) {
    pendencias.push({ tipo: 'aulas', texto: `Conclua todas as aulas para emitir o certificado. Faltam ${total - feitas} de ${total}.` });
  }

  if (regra === 'aprovacao') {
    for (const m of comModular) {
      if (m.situacao !== 'aprovado') {
        const rotulo = m.numero ? `Módulo ${m.numero}` : (m.titulo || 'Módulo');
        pendencias.push({ tipo: 'modulo', moduloId: m.moduloId, texto: `${rotulo}: avaliação modular ainda não aprovada.` });
      }
    }
  }

  if (criterios.frequenciaMinima !== null) {
    const f = entrada.frequenciaPct;
    if (typeof f !== 'number' || !Number.isFinite(f)) {
      pendencias.push({ tipo: 'frequencia', texto: 'Frequência ainda não apurada.' });
    } else if (f < criterios.frequenciaMinima) {
      pendencias.push({ tipo: 'frequencia', texto: `Frequência de ${fmtPct(f)}; o mínimo do curso é ${fmtPct(criterios.frequenciaMinima)}.` });
    }
  }

  if (criterios.cargaMinimaHoras !== null) {
    const carga = cargaDoCurso(curso);
    if (carga === null || carga < criterios.cargaMinimaHoras) {
      pendencias.push({ tipo: 'carga', texto: 'Carga horária do curso abaixo da mínima definida.' });
    }
  }

  if (criterios.exigeTcc) {
    const tcc = modulos.find(m => m.tipo === 'tcc');
    if (!tcc) pendencias.push({ tipo: 'tcc', texto: 'Curso sem módulo de TCC definido.' });
    else if (entrada.avaliacoesDisponiveis === false) pendencias.push({ tipo: 'tcc', moduloId: tcc.moduloId, texto: 'Avaliação do TCC indisponível no momento.' });
    else if (!tcc.temModular) pendencias.push({ tipo: 'tcc', moduloId: tcc.moduloId, texto: 'Avaliação do TCC não publicada.' });
    else if (tcc.situacao !== 'aprovado') pendencias.push({ tipo: 'tcc', moduloId: tcc.moduloId, texto: 'TCC ainda não aprovado.' });
  }

  return { elegivel: pendencias.length === 0, regra, pendencias };
}

/**
 * situacaoCurso({ elegibilidade, modulos, matricula }) — 'aprovado' (elegível pela regra `aprovacao`) ·
 * 'concluido' (elegível pela regra `aulas`) · 'reprovado' (algum módulo reprovado) · 'cursando'.
 * Matrícula concluída usa o `resultadoFinal` congelado.
 */
export function situacaoCurso({ elegibilidade = null, modulos = [], matricula = null } = {}) {
  if (matricula && matricula.status === 'concluida' && matricula.resultadoFinal) {
    const r = matricula.resultadoFinal;
    if (r.regra === 'aprovacao') return 'aprovado';
    return 'concluido';
  }
  if (elegibilidade && elegibilidade.elegivel) return elegibilidade.regra === 'aprovacao' ? 'aprovado' : 'concluido';
  if ((modulos || []).some(m => m.situacao === 'reprovado')) return 'reprovado';
  return 'cursando';
}
