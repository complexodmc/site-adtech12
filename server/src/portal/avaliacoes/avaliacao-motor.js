// =============================================================
// COMPLEXO DMC · Portal — motor de avaliação (puro; RNG injetável)
// PORTAL-API §3.3 (F2), §6.6, §8.11, §8.13 · índice CEO-4 · dono: F2.
//
// Nada aqui toca banco, rede ou relógio do processo: quem chama passa
// `agora` e `randomInt`. As funções de serialização são a ÚNICA porta
// de saída de tentativa/questão para o aluno e garantem que
// `corretaId`, `explicacao` e `respostaReferencia` não saiam antes da
// hora (e `respostaReferencia` nunca saia ao aluno).
// =============================================================
import { randomInt as randomIntPadrao } from 'node:crypto';

export const TIPOS_AVALIACAO = Object.freeze(['previa', 'modular']);
export const TIPOS_QUESTAO = Object.freeze(['objetiva', 'dissertativa', 'arquivo']);
export const STATUS_TENTATIVA = Object.freeze(['em_andamento', 'aguardando_correcao', 'corrigida']);
export const NOTA_MINIMA_PADRAO = 7;
export const TOLERANCIA_PRAZO_MS = 30 * 1000;
export const LIMITE_CARACTERES_PADRAO = 4000;
export const LIMITE_CARACTERES_SEM_CAMPO = 10000;
export const IDS_ALTERNATIVA = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f']);
export const COMENTARIO_SEM_RESPOSTA = 'Sem resposta';

export const ROTULOS_SITUACAO = Object.freeze({
  cursando: 'Cursando',
  concluido: 'Concluído',
  aprovado: 'Aprovado',
  em_recuperacao: 'Em recuperação',
  reprovado: 'Reprovado'
});

const CHAVE_SORTEIO = Object.freeze({ objetiva: 'objetivas', dissertativa: 'dissertativas', arquivo: 'arquivos' });

const hex = v => (v === null || v === undefined ? null : (typeof v === 'object' && typeof v.toHexString === 'function' ? v.toHexString() : String(v)));
const iso = d => (d instanceof Date ? d.toISOString() : d ? new Date(d).toISOString() : null);

/** Tamanho em caracteres Unicode (pontos de código), a regra do limite da dissertativa. */
export function tamanhoUnicode(s) {
  return typeof s === 'string' ? [...s].length : 0;
}

/** Nota com 1 casa, arredondamento meio para cima (§8.11). */
export function arredondarNota(x) {
  if (x === null || x === undefined || !Number.isFinite(Number(x))) return null;
  return Math.floor(Number(x) * 10 + 0.5 + 1e-9) / 10;
}

/** Fisher–Yates com `randomInt(max)` (crypto.randomInt por padrão). Não altera a entrada. */
export function embaralhar(lista, randomInt = randomIntPadrao) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Soma do sorteio (objetivas + dissertativas + arquivos). */
export function totalDoSorteio(sorteio) {
  const s = sorteio || {};
  return (Number(s.objetivas) || 0) + (Number(s.dissertativas) || 0) + (Number(s.arquivos) || 0);
}

/**
 * Banco ativo × composição. contagens = { objetiva:N, dissertativa:N, arquivo:N } (ativas).
 * → { ok, faltando:[{ tipo, precisa, tem }], avisos:[S] } — aviso não bloqueante quando há menos de 2× o sorteio.
 */
export function conferirBanco(sorteio, contagens) {
  const faltando = [];
  let poucas = false;
  for (const tipo of TIPOS_QUESTAO) {
    const precisa = Number(sorteio?.[CHAVE_SORTEIO[tipo]]) || 0;
    const tem = Number(contagens?.[tipo]) || 0;
    if (precisa > tem) faltando.push({ tipo, precisa, tem });
    else if (precisa > 0 && tem < 2 * precisa) poucas = true;
  }
  const avisos = poucas
    ? ['Com menos de 2× as questões do sorteio, colegas tendem a receber as mesmas questões; considere definir a data de liberação do gabarito.']
    : [];
  return { ok: faltando.length === 0 && totalDoSorteio(sorteio) > 0, faltando, avisos };
}

/** Snapshot completo de uma questão do banco (a equipe vê tudo; o aluno só pelo serializador). */
export function snapshotDaQuestao(q, { embaralharAlternativas = false, randomInt = randomIntPadrao } = {}) {
  const base = {
    questaoId: hex(q._id),
    tipo: q.tipo,
    enunciado: q.enunciado,
    alternativas: [],
    corretaId: null,
    explicacao: q.explicacao || '',
    pontos: Number(q.pontos) || 1,
    orientacao: null,
    limiteCaracteres: null,
    respostaReferencia: null
  };
  if (q.tipo === 'objetiva') {
    const alts = (q.alternativas || []).map(a => ({ id: a.id, texto: a.texto }));
    base.alternativas = embaralharAlternativas ? embaralhar(alts, randomInt) : alts;
    base.corretaId = q.corretaId || null;
  } else {
    base.orientacao = q.orientacao || null;
    base.respostaReferencia = q.respostaReferencia || null;
    if (q.tipo === 'dissertativa') base.limiteCaracteres = Number(q.limiteCaracteres) || LIMITE_CARACTERES_PADRAO;
  }
  return base;
}

/**
 * Sorteio por tentativa (§8.13 item 1). `banco` = questões ATIVAS da avaliação.
 * → { questoes: snapshot[], sorteadas: questaoId[] } · banco insuficiente → { erro:'banco-insuficiente', faltando }.
 */
export function sortearQuestoes(avaliacao, banco, { randomInt = randomIntPadrao } = {}) {
  const porTipo = { objetiva: [], dissertativa: [], arquivo: [] };
  for (const q of banco || []) if (q && q.ativa !== false && porTipo[q.tipo]) porTipo[q.tipo].push(q);
  const contagens = Object.fromEntries(TIPOS_QUESTAO.map(t => [t, porTipo[t].length]));
  const conferencia = conferirBanco(avaliacao.sorteio, contagens);
  if (!conferencia.ok) return { erro: 'banco-insuficiente', faltando: conferencia.faltando };
  const escolhidas = [];
  for (const tipo of TIPOS_QUESTAO) {
    const n = Number(avaliacao.sorteio?.[CHAVE_SORTEIO[tipo]]) || 0;
    if (n > 0) escolhidas.push(...embaralhar(porTipo[tipo], randomInt).slice(0, n));
  }
  const ordem = embaralhar(escolhidas, randomInt);
  const questoes = ordem.map(q => snapshotDaQuestao(q, { embaralharAlternativas: avaliacao.embaralharAlternativas === true, randomInt }));
  return { questoes, sorteadas: questoes.map(q => q.questaoId) };
}

/** Prazo da tentativa (null = tempo livre). */
export function prazoDe(iniciadaEm, tempoLimiteMin) {
  if (!tempoLimiteMin) return null;
  return new Date(new Date(iniciadaEm).getTime() + Number(tempoLimiteMin) * 60 * 1000);
}

/** Tentativa em andamento com o prazo vencido (já passou da tolerância de 30 s)? */
export function prazoVencido(tentativa, agora) {
  if (!tentativa || tentativa.status !== 'em_andamento' || !tentativa.prazoEm) return false;
  return agora.getTime() > new Date(tentativa.prazoEm).getTime() + TOLERANCIA_PRAZO_MS;
}

/**
 * Valida uma resposta contra o snapshot. → { ok:true, valor } | { ok:false, codigo, mensagem, extras }.
 * valor = { alternativaId } | { texto }.
 */
export function validarResposta(questao, corpo) {
  if (!questao) return { ok: false, codigo: 'validacao', mensagem: 'Questão fora desta tentativa.', extras: { campos: { questaoId: 'Questão fora desta tentativa.' } } };
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  if (questao.tipo === 'objetiva') {
    const alt = c.alternativaId;
    if (alt === null || alt === undefined || alt === '') return { ok: true, valor: { alternativaId: null } };
    if (typeof alt !== 'string') return { ok: false, codigo: 'formato-invalido', mensagem: 'Formato inválido.', extras: { campos: { alternativaId: 'Formato inválido.' } } };
    if (!(questao.alternativas || []).some(a => a.id === alt)) {
      return { ok: false, codigo: 'validacao', mensagem: 'Alternativa inválida.', extras: { campos: { alternativaId: 'Alternativa inválida.' } } };
    }
    return { ok: true, valor: { alternativaId: alt } };
  }
  if (questao.tipo === 'dissertativa') {
    const t = c.texto;
    if (t === null || t === undefined) return { ok: true, valor: { texto: '' } };
    if (typeof t !== 'string') return { ok: false, codigo: 'formato-invalido', mensagem: 'Formato inválido.', extras: { campos: { texto: 'Formato inválido.' } } };
    const limpo = t.normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    const limite = Number(questao.limiteCaracteres) || LIMITE_CARACTERES_SEM_CAMPO;
    if (tamanhoUnicode(limpo) > limite) {
      return { ok: false, codigo: 'resposta-longa', mensagem: undefined, extras: { limite, campos: { texto: `Use no máximo ${limite} caracteres.` } } };
    }
    return { ok: true, valor: { texto: limpo } };
  }
  return { ok: false, codigo: 'validacao', mensagem: 'Esta questão recebe um arquivo PDF.', extras: { campos: { questaoId: 'Esta questão recebe um arquivo PDF.' } } };
}

/** Questão "sem resposta"? (objetiva sem alternativa, dissertativa em branco, arquivo não enviado) */
export function semResposta(questao, resposta) {
  if (!resposta) return true;
  if (questao.tipo === 'objetiva') return !resposta.alternativaId;
  if (questao.tipo === 'dissertativa') return !(typeof resposta.texto === 'string' && resposta.texto.trim());
  return !resposta.arquivo;
}

/**
 * Totais da tentativa com a correção atual (objetivas automáticas + pontos salvos da equipe).
 * → { acertosObjetivas, totalObjetivas, pontosObtidos, pontosPossiveis, completa, pendentes, nota, pctAcerto }
 *   `completa` = toda dissertativa/arquivo com pontos; senão nota/pctAcerto null.
 */
export function calcularTotais(tentativa) {
  const respostas = tentativa.respostas || {};
  const correcao = tentativa.correcao || {};
  let acertos = 0, totalObj = 0, obtidos = 0, possiveis = 0, pendentes = 0;
  for (const q of tentativa.questoes || []) {
    const pontos = Number(q.pontos) || 0;
    possiveis += pontos;
    if (q.tipo === 'objetiva') {
      totalObj++;
      const r = respostas[q.questaoId];
      if (r && r.alternativaId && r.alternativaId === q.corretaId) { acertos++; obtidos += pontos; }
    } else {
      const c = correcao[q.questaoId];
      if (c && Number.isFinite(Number(c.pontos))) obtidos += Number(c.pontos);
      else pendentes++;
    }
  }
  const completa = pendentes === 0;
  const nota = completa ? (possiveis > 0 ? arredondarNota((10 * obtidos) / possiveis) : 0) : null;
  const pctAcerto = completa ? (possiveis > 0 ? Math.round((100 * obtidos) / possiveis) : 0) : null;
  return {
    acertosObjetivas: acertos,
    totalObjetivas: totalObj,
    pontosObtidos: completa ? Math.round(obtidos * 100) / 100 : null,
    pontosPossiveis: Math.round(possiveis * 100) / 100,
    completa,
    pendentes,
    nota,
    pctAcerto
  };
}

/**
 * Envio (§8.13 item 3): dissertativa em branco / arquivo ausente → 0 "Sem resposta" (fora da fila).
 * → { correcaoAuto:{ [questaoId]: {pontos, comentario, por, em} }, totais, status }
 */
export function corrigirNoEnvio(tentativa, agora) {
  const correcaoAuto = {};
  for (const q of tentativa.questoes || []) {
    if (q.tipo === 'objetiva') continue;
    if (semResposta(q, (tentativa.respostas || {})[q.questaoId])) {
      correcaoAuto[q.questaoId] = { pontos: 0, comentario: COMENTARIO_SEM_RESPOSTA, por: 'sistema', em: agora };
    }
  }
  const comAuto = { ...tentativa, correcao: { ...(tentativa.correcao || {}), ...correcaoAuto } };
  const totais = calcularTotais(comAuto);
  return { correcaoAuto, totais, status: totais.completa ? 'corrigida' : 'aguardando_correcao' };
}

/** Campos assinados do selo `avaliacao` (API §4.7). */
export function camposDoSelo(t) {
  const arquivos = [];
  for (const q of t.questoes || []) {
    const r = (t.respostas || {})[q.questaoId];
    if (q.tipo === 'arquivo' && r && r.arquivo && r.arquivo.sha256) arquivos.push({ questaoId: q.questaoId, sha256: r.arquivo.sha256 });
  }
  return {
    codigo: t.codigo,
    tentativaId: hex(t._id),
    avaliacaoId: hex(t.avaliacaoId),
    matriculaId: hex(t.matriculaId),
    userId: String(t.userId),
    numero: t.numero,
    iniciadaEm: iso(t.iniciadaEm),
    enviadaEm: iso(t.enviadaEm),
    pontosObtidos: t.pontosObtidos ?? null,
    pontosPossiveis: t.pontosPossiveis ?? null,
    nota: t.nota ?? null,
    arquivos
  };
}

/**
 * Estado do aluno numa avaliação (POR MATRÍCULA).
 * @param {{ avaliacao, tentativas, registro (avaliacoes_aluno|null), notaMinima, matriculaAtiva }} p
 */
export function estadoDoAluno({ avaliacao, tentativas = [], registro = null, notaMinima = NOTA_MINIMA_PADRAO, matriculaAtiva = true, simular = null }) {
  const lista = tentativas.map(t => {
    if (simular && hex(t._id) === String(simular.tentativaId)) return { ...t, status: 'corrigida', nota: simular.nota };
    return t;
  });
  const usadas = lista.length;
  const extras = Number(registro?.tentativasExtras) || 0;
  const permitidas = (Number(avaliacao.tentativasMax) || 1) + extras;
  const finalizada = !!registro?.finalizadaEm;
  const restantes = finalizada ? 0 : Math.max(0, permitidas - usadas);
  const corrigidas = lista.filter(t => t.status === 'corrigida' && t.nota !== null && t.nota !== undefined);
  const melhorNota = corrigidas.length ? Math.max(...corrigidas.map(t => Number(t.nota))) : null;
  const aguardandoCorrecao = lista.some(t => t.status === 'aguardando_correcao');
  const aberta = lista.find(t => t.status === 'em_andamento') || null;
  const enviadas = lista.filter(t => t.status !== 'em_andamento').length;
  const situacao = avaliacao.tipo === 'modular'
    ? situacaoDoModulo({ melhorNota, notaMinima, restantes, finalizada, aguardandoCorrecao, emAndamento: !!aberta })
    : null;
  const podeIniciar = !!avaliacao.publicada && matriculaAtiva && !finalizada && (!!aberta || restantes > 0);
  return {
    usadas,
    permitidas,
    restantes,
    finalizada,
    finalizadaEm: registro?.finalizadaEm ? iso(registro.finalizadaEm) : null,
    melhorNota,
    situacao,
    situacaoRotulo: situacao ? ROTULOS_SITUACAO[situacao] : null,
    aguardandoCorrecao,
    podeIniciar,
    podeMelhorar: podeIniciar && !aberta && usadas > 0,
    podeFinalizar: matriculaAtiva && !finalizada && !aberta && enviadas > 0,
    notaMinima,
    abertaId: aberta ? hex(aberta._id) : null
  };
}

/**
 * Situação do módulo pela avaliação MODULAR (§8.11). Sem tentativa corrigida → cursando.
 */
export function situacaoDoModulo({ melhorNota, notaMinima = NOTA_MINIMA_PADRAO, restantes, finalizada, aguardandoCorrecao, emAndamento }) {
  if (melhorNota === null || melhorNota === undefined) return 'cursando';
  if (melhorNota >= notaMinima) return 'aprovado';
  if ((restantes > 0 && !finalizada) || aguardandoCorrecao || emAndamento) return 'em_recuperacao';
  return 'reprovado';
}

/** Avisos importantes (UX §6.4) — textos curtos com os valores do servidor. */
export function avisosDe(avaliacao, estado = null) {
  const n = totalDoSorteio(avaliacao.sorteio);
  const temAberta = (Number(avaliacao.sorteio?.dissertativas) || 0) + (Number(avaliacao.sorteio?.arquivos) || 0) > 0;
  const max = Number(avaliacao.tentativasMax) || 1;
  return {
    tentativas: estado ? `${estado.restantes} de ${estado.permitidas} disponíveis` : `${max} ${max === 1 ? 'tentativa' : 'tentativas'}`,
    tempo: avaliacao.tempoLimiteMin ? `${avaliacao.tempoLimiteMin} minutos a partir do início` : 'Livre',
    questoes: `${n} ${n === 1 ? 'questão' : 'questões'}, sorteadas a cada tentativa`,
    correcao: temAberta ? 'Objetivas na hora; dissertativas e entregas pelo professor' : 'Na hora, ao enviar',
    gabarito: 'Só depois de finalizar; finalizar encerra as tentativas'
  };
}

// ---------- serialização para o ALUNO ----------
function respostaParaAluno(q, r) {
  if (!r) return null;
  if (q.tipo === 'objetiva') return r.alternativaId ? { alternativaId: r.alternativaId } : null;
  if (q.tipo === 'dissertativa') return typeof r.texto === 'string' ? { texto: r.texto } : null;
  return r.arquivo ? { tamanho: r.arquivo.tamanho, sha256: r.arquivo.sha256, em: iso(r.em) } : null;
}

/** TentativaAluno (aberta): SEM corretaId, explicacao, respostaReferencia, nota. */
export function tentativaParaAluno(t, agora) {
  return {
    id: hex(t._id),
    numero: t.numero,
    status: t.status,
    iniciadaEm: iso(t.iniciadaEm),
    prazoEm: t.prazoEm ? iso(t.prazoEm) : null,
    agora: iso(agora),
    questoes: (t.questoes || []).map(q => ({
      questaoId: q.questaoId,
      tipo: q.tipo,
      enunciado: q.enunciado,
      alternativas: q.tipo === 'objetiva' ? (q.alternativas || []).map(a => ({ id: a.id, texto: a.texto })) : [],
      pontos: q.pontos,
      resposta: respostaParaAluno(q, (t.respostas || {})[q.questaoId]),
      orientacao: q.tipo === 'objetiva' ? null : (q.orientacao || null),
      limiteCaracteres: q.tipo === 'dissertativa' ? (Number(q.limiteCaracteres) || LIMITE_CARACTERES_SEM_CAMPO) : null
    }))
  };
}

/** ResultadoAluno (enviada). Comentários só depois de `corrigida` (correção publicada). */
export function resultadoParaAluno(t) {
  const corrigida = t.status === 'corrigida';
  const comentarios = [];
  if (corrigida) {
    for (const q of t.questoes || []) {
      if (q.tipo === 'objetiva') continue;
      const c = (t.correcao || {})[q.questaoId];
      if (c) comentarios.push({ questaoId: q.questaoId, pontos: c.pontos, comentario: c.comentario || '' });
    }
  }
  const pendentes = (t.questoes || []).filter(q => q.tipo !== 'objetiva' && !(corrigida || (t.correcao || {})[q.questaoId]?.por === 'sistema')).length;
  return {
    id: hex(t._id),
    numero: t.numero,
    status: t.status,
    iniciadaEm: iso(t.iniciadaEm),
    enviadaEm: iso(t.enviadaEm),
    expirada: t.expirada === true,
    acertosObjetivas: t.acertosObjetivas ?? 0,
    totalObjetivas: t.totalObjetivas ?? 0,
    pctAcerto: corrigida ? (t.pctAcerto ?? null) : null,
    nota: corrigida ? (t.nota ?? null) : null,
    aguardandoCorrecao: t.status === 'aguardando_correcao',
    questoesAguardando: t.status === 'aguardando_correcao' ? pendentes : 0,
    temEntregaArquivo: (t.questoes || []).some(q => q.tipo === 'arquivo'),
    comentarios,
    codigo: corrigida ? (t.codigo || null) : null,
    linkAcademico: `academico.html?m=${hex(t.matriculaId)}`
  };
}

/**
 * Gabarito (após finalizar). `completo:false` (antes de gabaritoLiberaEm) → só acertou/errou, sem corretaId/explicacao.
 * NUNCA respostaReferencia.
 */
export function gabaritoParaAluno(t, { completo = true } = {}) {
  const corrigida = t.status === 'corrigida';
  return {
    tentativaId: hex(t._id),
    numero: t.numero,
    completo,
    questoes: (t.questoes || []).map(q => {
      const r = (t.respostas || {})[q.questaoId];
      const c = corrigida ? (t.correcao || {})[q.questaoId] : null;
      let acertou = null;
      let pontosObtidos = null;
      if (q.tipo === 'objetiva') {
        acertou = !!(r && r.alternativaId && r.alternativaId === q.corretaId);
        pontosObtidos = acertou ? q.pontos : 0;
      } else if (c) {
        pontosObtidos = c.pontos;
      }
      const item = {
        questaoId: q.questaoId,
        tipo: q.tipo,
        enunciado: q.enunciado,
        alternativas: q.tipo === 'objetiva' ? (q.alternativas || []).map(a => ({ id: a.id, texto: a.texto })) : [],
        suaResposta: respostaParaAluno(q, r),
        acertou,
        pontos: q.pontos,
        pontosObtidos,
        comentario: c ? (c.comentario || '') : null
      };
      if (completo) {
        item.corretaId = q.tipo === 'objetiva' ? q.corretaId : null;
        item.explicacao = q.explicacao || '';
      }
      return item;
    })
  };
}

/** Questão do banco como a equipe vê (com gabarito e referência). */
export function questaoParaEquipe(q) {
  return {
    id: hex(q._id),
    avaliacaoId: hex(q.avaliacaoId),
    tipo: q.tipo,
    enunciado: q.enunciado,
    alternativas: q.tipo === 'objetiva' ? (q.alternativas || []).map(a => ({ id: a.id, texto: a.texto })) : [],
    corretaId: q.corretaId ?? null,
    explicacao: q.explicacao || '',
    orientacao: q.orientacao ?? null,
    limiteCaracteres: q.limiteCaracteres ?? null,
    respostaReferencia: q.respostaReferencia ?? null,
    pontos: q.pontos,
    ativa: q.ativa !== false,
    sorteada: q.sorteada === true,
    versao: q.versao ?? 1,
    criadoEm: iso(q.criadoEm),
    atualizadoEm: iso(q.atualizadoEm)
  };
}

/** Avaliação como a equipe vê. */
export function avaliacaoParaEquipe(a) {
  return {
    id: hex(a._id),
    cursoId: a.cursoId,
    moduloId: a.moduloId,
    tipo: a.tipo,
    titulo: a.titulo,
    instrucoes: a.instrucoes || '',
    sorteio: { objetivas: a.sorteio?.objetivas ?? 0, dissertativas: a.sorteio?.dissertativas ?? 0, arquivos: a.sorteio?.arquivos ?? 0 },
    nQuestoes: totalDoSorteio(a.sorteio),
    tentativasMax: a.tentativasMax,
    tempoLimiteMin: a.tempoLimiteMin ?? null,
    embaralharAlternativas: a.embaralharAlternativas === true,
    gabaritoLiberaEm: a.gabaritoLiberaEm ? iso(a.gabaritoLiberaEm) : null,
    publicada: a.publicada === true,
    publicadaEm: a.publicadaEm ? iso(a.publicadaEm) : null,
    despublicadaEm: a.despublicadaEm ? iso(a.despublicadaEm) : null,
    versao: a.versao ?? 1,
    criadoEm: iso(a.criadoEm),
    atualizadoEm: iso(a.atualizadoEm)
  };
}

/** Prévia do professor: o que o aluno veria, sorteado na hora, SEM gabarito nem referência. */
export function previaParaEquipe(avaliacao, banco, { randomInt = randomIntPadrao, agora = new Date() } = {}) {
  const s = sortearQuestoes(avaliacao, banco, { randomInt });
  if (s.erro) return s;
  const falsa = { _id: 'previa', numero: 1, status: 'em_andamento', iniciadaEm: agora, prazoEm: prazoDe(agora, avaliacao.tempoLimiteMin), questoes: s.questoes, respostas: {} };
  return { avisos: avisosDe(avaliacao), questoes: tentativaParaAluno(falsa, agora).questoes };
}
