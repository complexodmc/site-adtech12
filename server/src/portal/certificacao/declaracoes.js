// =============================================================
// COMPLEXO DMC · Portal — certificação: regras puras e serviço de emissão
// PORTAL-API §3.2 (cursos, certificados), §3.3 (declaracoes, ies), §4.7
// (selo), §6.7.1, §6.7.5–§6.7.7, §8.9, §8.11, §8.12 · dono: F3b.
//
// Puro (sem banco): níveis e rótulos, critérios com padrões (fallback até
// o P1 da F3a entregar `criteriosDe`/`horasDe` em calculo-academico.js),
// campos assinados, hash abreviado, avaliação do certificado pela regra
// `aulas`/`aprovacao` a partir de dados já lidos, plano de códigos de aula.
//
// Com banco: `criarServicoDeclaracoes` → serviço `declaracoes.emitir`
// (API §4.4; consumidores: esta fatia e a F5, quitação anual).
// =============================================================
import { codigoVerificacao, codigoAula, inserirComCodigo, SIGLA_RE } from '../codigos.js';
import { canonico, sha256 } from '../cripto.js';
import { iniciais } from '../validacao.js';

export const NIVEIS = Object.freeze(['curso_livre', 'extensao', 'aperfeicoamento', 'pos_graduacao_lato_sensu']);
export const LATO_SENSU = 'pos_graduacao_lato_sensu';
export const ROTULOS_NIVEL = Object.freeze({
  curso_livre: 'Curso livre',
  extensao: 'Extensão',
  aperfeicoamento: 'Aperfeiçoamento',
  pos_graduacao_lato_sensu: 'Pós-graduação lato sensu'
});
export const rotuloNivel = nivel => (nivel && ROTULOS_NIVEL[nivel]) || null;

export const TIPOS_DECLARACAO = Object.freeze(['matricula', 'frequencia', 'conclusao', 'quitacao_anual']);
export const TIPOS_DECLARACAO_CURSO = Object.freeze(['matricula', 'frequencia', 'conclusao']);
export const ROTULOS_DECLARACAO = Object.freeze({
  matricula: 'Declaração de matrícula',
  frequencia: 'Declaração de frequência',
  conclusao: 'Declaração de conclusão',
  quitacao_anual: 'Declaração financeira anual (quitação)'
});

export const ROTULOS_SITUACAO = Object.freeze({
  cursando: 'Cursando', concluido: 'Concluído', aprovado: 'Aprovado', em_recuperacao: 'Em recuperação', reprovado: 'Reprovado'
});

export const CRITERIOS_PADRAO = Object.freeze({
  notaMinima: 7, frequenciaMinima: null, cargaMinimaHoras: null, exigeTcc: false, frequenciaGravadaExigeVideo: false
});

/** Critérios do curso com os padrões (API §3.2). Fallback local até o P1 da F3a (`criteriosDe`). */
export function criteriosLocais(curso) {
  const c = curso && typeof curso.criterios === 'object' && curso.criterios ? curso.criterios : {};
  const num = (v, padrao) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);
  return {
    notaMinima: num(c.notaMinima, CRITERIOS_PADRAO.notaMinima),
    frequenciaMinima: num(c.frequenciaMinima, null),
    cargaMinimaHoras: num(c.cargaMinimaHoras, null),
    exigeTcc: c.exigeTcc === true,
    frequenciaGravadaExigeVideo: c.frequenciaGravadaExigeVideo === true
  };
}

/**
 * `horasDe(texto)` (API §8.3), fallback local até o P1 da F3a:
 * '42 horas'→42 · '360h'→360 · '3h 50min'→3.8 · '90min'→1.5 · ''|'—'|'abc'→null.
 */
export function horasLocais(texto) {
  if (typeof texto === 'number') return Number.isFinite(texto) && texto >= 0 ? Math.round(texto * 10) / 10 : null;
  if (typeof texto !== 'string') return null;
  const s = texto.toLowerCase().replace(',', '.');
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:h\b|h(?=\d|\s|$)|hora|horas|hrs?)/);
  const m = s.match(/(\d+)\s*(?:min|minutos?)/);
  if (!h && !m) return null;
  const total = (h ? Number(h[1]) : 0) + (m ? Number(m[1]) / 60 : 0);
  return Number.isFinite(total) ? Math.round(total * 10) / 10 : null;
}

/** Carga horária do curso em horas: `cargaHorariaHoras` gravado ou derivado do texto legado. */
export function cargaDoCurso(curso, horasDe = horasLocais) {
  if (typeof curso?.cargaHorariaHoras === 'number' && Number.isFinite(curso.cargaHorariaHoras)) return curso.cargaHorariaHoras;
  return horasDe(curso?.cargaHoraria ?? '');
}

/** 16 hex do selo em grupos de 4 ('9C1E-07AB-12CD-34EF'); sem selo → null (certificado legado, DC-65). */
export function hashPrefixo(hash) {
  if (typeof hash !== 'string' || !/^[a-f0-9]{16,}$/i.test(hash)) return null;
  return hash.slice(0, 16).toUpperCase().match(/.{4}/g).join('-');
}

const idOuNulo = v => (v === undefined || v === null || v === '' ? null : String(v));

/** Campos assinados do certificado (API §4.7). */
export function camposSeloCertificado(c) {
  return {
    codigo: c.codigo,
    userId: String(c.userId),
    cursoId: String(c.cursoId),
    nomeAluno: c.nomeAluno ?? '',
    nomeOrigem: c.nomeOrigem ?? null,
    tituloCurso: c.tituloCurso ?? '',
    cargaHoraria: c.cargaHoraria ?? '',
    emitidoEm: c.emitidoEm,
    matriculaId: idOuNulo(c.matriculaId),
    notaFinal: typeof c.notaFinal === 'number' ? c.notaFinal : null,
    regra: c.regra ?? null
  };
}

/** Campos assinados da declaração (API §4.7). */
export function camposSeloDeclaracao(d) {
  return {
    codigo: d.codigo,
    tipo: d.tipo,
    matriculaId: idOuNulo(d.matriculaId),
    userId: String(d.userId),
    ano: typeof d.ano === 'number' ? d.ano : null,
    emitidaEm: d.emitidaEm,
    dados: d.dados
  };
}

/** Nome do titular gravado nos `dados` congelados (declaração por curso ou quitação). */
export function nomeTitularDeDados(dados) {
  if (!dados || typeof dados !== 'object') return null;
  if (typeof dados.nomeTitular === 'string' && dados.nomeTitular.trim()) return dados.nomeTitular;
  const n = dados.titular && dados.titular.nomeRegistro;
  return typeof n === 'string' && n.trim() ? n : null;
}

const fmtNota = n => String(Math.round(n * 10) / 10).replace('.', ',');

/** Texto legado do 409 quando faltam aulas (D5: a tela de hoje mostra esta frase). */
export const textoFaltamAulas = (faltam, total) =>
  `Conclua todas as aulas para emitir o certificado. Faltam ${faltam} de ${total}.`;

/**
 * Avaliação do certificado SEM a F3a (regra de §8.11 sobre dados já lidos). Puro.
 * @param {{
 *   curso, criterios, totalAulas:number, concluidas:number,
 *   modulos:[{ id, numero, titulo, tipo }],
 *   notas: Map<moduloId, { temModular, situacao, nota }>|null   // null = F2 ausente (regra legada `aulas`)
 *   frequenciaPct: number|null|undefined                         // undefined = não apurada (F3a ausente)
 *   horasDe?: (texto) => number|null
 * }} e
 * @returns {{ elegivel, regra, situacaoCurso, pendencias:[{ tipo, moduloId?, texto }], mediaParcial:number|null }}
 */
export function avaliarCertificado(e) {
  const { curso, criterios, totalAulas, concluidas, modulos = [], notas = null, frequenciaPct, horasDe = horasLocais } = e;
  const pendencias = [];
  if (curso?.nivel === LATO_SENSU) {
    return {
      elegivel: false, regra: 'aulas', situacaoCurso: 'cursando', mediaParcial: null,
      pendencias: [{ tipo: 'certificado-pela-ies', texto: 'Neste curso, o certificado é emitido pela instituição parceira.' }]
    };
  }
  let regra = 'aulas';
  let algumReprovado = false;
  const notasValidas = [];
  if (totalAulas <= 0) pendencias.push({ tipo: 'aulas', texto: 'Este curso ainda não tem aulas disponíveis para conclusão.' });
  else if (concluidas < totalAulas) pendencias.push({ tipo: 'aulas', texto: textoFaltamAulas(totalAulas - concluidas, totalAulas) });

  if (notas) {
    for (const m of modulos) {
      const r = notas.get(String(m.id));
      if (!r || !r.temModular) continue;
      regra = 'aprovacao';
      if (typeof r.nota === 'number') notasValidas.push(r.nota);
      if (r.situacao === 'reprovado') algumReprovado = true;
      if (r.situacao !== 'aprovado' && !(m.tipo === 'tcc' && criterios.exigeTcc)) {
        const rot = (ROTULOS_SITUACAO[r.situacao] || 'Cursando').toLowerCase();
        const nome = [m.numero ? `Módulo ${m.numero}` : 'Módulo', m.titulo].filter(Boolean).join(' · ');
        const notaTxt = typeof r.nota === 'number' ? ` (nota ${fmtNota(r.nota)}; mínimo ${fmtNota(criterios.notaMinima)})` : '';
        pendencias.push({ tipo: 'modulo', moduloId: String(m.id), texto: `${nome}: ${rot}${notaTxt}.` });
      }
    }
  }

  if (criterios.frequenciaMinima !== null && criterios.frequenciaMinima !== undefined) {
    if (typeof frequenciaPct !== 'number') pendencias.push({ tipo: 'frequencia', texto: 'Frequência ainda não apurada.' });
    else if (frequenciaPct < criterios.frequenciaMinima) {
      pendencias.push({ tipo: 'frequencia', texto: `Frequência de ${Math.round(frequenciaPct)}%; o mínimo do curso é ${Math.round(criterios.frequenciaMinima)}%.` });
    }
  }
  if (criterios.cargaMinimaHoras !== null && criterios.cargaMinimaHoras !== undefined) {
    const horas = cargaDoCurso(curso, horasDe);
    if (horas === null || horas < criterios.cargaMinimaHoras) pendencias.push({ tipo: 'carga', texto: 'Carga horária do curso abaixo da mínima definida.' });
  }
  if (criterios.exigeTcc) {
    const tcc = modulos.find(m => m.tipo === 'tcc');
    if (!tcc) pendencias.push({ tipo: 'tcc', texto: 'Curso sem módulo de TCC definido.' });
    else if (!notas) pendencias.push({ tipo: 'tcc', moduloId: String(tcc.id), texto: 'Avaliação do TCC indisponível no momento.' });
    else {
      const r = notas.get(String(tcc.id));
      if (!r || !r.temModular) pendencias.push({ tipo: 'tcc', moduloId: String(tcc.id), texto: 'Avaliação do TCC não publicada.' });
      else if (r.situacao !== 'aprovado') pendencias.push({ tipo: 'tcc', moduloId: String(tcc.id), texto: 'TCC ainda não aprovado.' });
    }
  }

  const elegivel = totalAulas > 0 && pendencias.length === 0;
  const situacaoCurso = elegivel ? (regra === 'aprovacao' ? 'aprovado' : 'concluido') : (algumReprovado ? 'reprovado' : 'cursando');
  const mediaParcial = notasValidas.length ? Math.round((notasValidas.reduce((s, n) => s + n, 0) / notasValidas.length) * 10) / 10 : null;
  return { elegivel, regra, situacaoCurso, pendencias, mediaParcial };
}

/**
 * Plano de códigos de aula (API §8.12). Puro.
 * @param {string} sigla
 * @param {Array<{ id, ordem }>} modulos  do curso
 * @param {Array<{ id, moduloId, ordem, codigo }>} aulas  do curso
 * @param {{ refazer?: boolean, ocupados?: Set<string> }} opcoes  ocupados = códigos de OUTROS cursos (colisão)
 * @returns {{ itens:[{ aulaId, codigo }], gerados:number, mantidos:number, mudancas:[{ aulaId, codigo }] }}
 */
export function planejarCodigos(sigla, modulos, aulas, { refazer = false, ocupados = new Set() } = {}) {
  if (typeof sigla !== 'string' || !SIGLA_RE.test(sigla)) throw new RangeError('planejarCodigos: sigla inválida.');
  const porOrdem = (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || String(a.id).localeCompare(String(b.id));
  const mods = [...modulos].sort(porOrdem);
  const emUso = new Set(ocupados);
  if (!refazer) for (const a of aulas) if (typeof a.codigo === 'string' && a.codigo) emUso.add(a.codigo);
  const itens = [];
  const mudancas = [];
  let gerados = 0;
  let mantidos = 0;
  mods.forEach((m, i) => {
    const posM = i + 1;
    const doModulo = aulas.filter(a => String(a.moduloId) === String(m.id)).sort(porOrdem);
    doModulo.forEach((a, j) => {
      if (!refazer && typeof a.codigo === 'string' && a.codigo) {
        mantidos++;
        itens.push({ aulaId: String(a.id), codigo: a.codigo });
        return;
      }
      if (posM > 99) return;
      let posA = Math.min(j + 1, 99);
      let codigo = codigoAula(sigla, posM, posA);
      while (emUso.has(codigo) && posA < 99) { posA++; codigo = codigoAula(sigla, posM, posA); }
      if (emUso.has(codigo)) return; // 99 aulas ocupadas no módulo: fica sem código (o front não mostra o selo)
      emUso.add(codigo);
      gerados++;
      itens.push({ aulaId: String(a.id), codigo });
      if (codigo !== a.codigo) mudancas.push({ aulaId: String(a.id), codigo });
    });
  });
  return { itens, gerados, mantidos, mudancas };
}

/** Elegibilidade de uma declaração por curso (API §8.9), sobre dados já lidos. Puro. */
export function elegibilidadeDeclaracao(tipo, { matricula, curso, frequenciaPct }) {
  const status = matricula?.status;
  if (tipo === 'matricula') {
    return ['ativa', 'trancada', 'concluida'].includes(status)
      ? { elegivel: true }
      : { elegivel: false, motivo: 'Disponível para matrícula ativa, trancada ou concluída.' };
  }
  if (tipo === 'frequencia') {
    if (status === 'cancelada' || !status) return { elegivel: false, motivo: 'Indisponível para matrícula cancelada.' };
    if (typeof frequenciaPct !== 'number') return { elegivel: false, motivo: 'Disponível quando houver frequência apurada.' };
    return { elegivel: true };
  }
  if (tipo === 'conclusao') {
    if (curso?.nivel === LATO_SENSU) return { elegivel: false, motivo: 'Neste curso, a conclusão é declarada pela instituição parceira.', codigo: 'certificado-pela-ies' };
    return status === 'concluida' ? { elegivel: true } : { elegivel: false, motivo: 'Disponível depois da conclusão do curso, com o certificado emitido.' };
  }
  return { elegivel: false, motivo: 'Tipo de declaração indisponível.' };
}

/**
 * Serviço `declaracoes.emitir` (API §4.4): grava na coleção `declaracoes` com código DEC,
 * `hashDados` (idempotência em 24 h), selo `assinador.assinar('declaracao', …)` e iniciais.
 * Quitação com `substituirSeMudou` revoga a anterior do mesmo ano quando o conteúdo mudou.
 */
export function criarServicoDeclaracoes({ repo, assinador, agora = () => new Date(), garantia = null } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarServicoDeclaracoes: informe repo.');
  const col = () => repo('declaracoes');
  const UM_DIA = 24 * 3600 * 1000;

  async function emitir({ tipo, userId, matriculaId = null, cursoId = null, ano = null, dados, substituirSeMudou = false } = {}) {
    if (!TIPOS_DECLARACAO.includes(tipo)) throw new RangeError(`declaracoes.emitir: tipo inválido (${tipo}).`);
    if (!userId || !dados || typeof dados !== 'object') throw new TypeError('declaracoes.emitir: informe userId e dados.');
    const sel = typeof assinador === 'function' ? assinador() : assinador;
    if (!sel) throw Object.assign(new Error('Selo indisponível.'), { codigo: 'servico-indisponivel', status: 503 });
    if (garantia && typeof garantia.garantir === 'function') await garantia.garantir();
    const momento = agora();
    const hashDados = sha256(canonico(dados));
    const filtroMesmo = { userId: String(userId), tipo, matriculaId: matriculaId ?? null, ano: ano ?? null };
    const recentes = await col().find({ ...filtroMesmo, revogada: null }, { sort: { emitidaEm: -1 }, limit: 5 }).toArray();
    const igual = recentes.find(d => d.hashDados === hashDados && momento.getTime() - new Date(d.emitidaEm).getTime() < UM_DIA);
    if (igual) return { declaracao: igual, criada: false };
    if (substituirSeMudou) {
      const igualQualquerData = recentes.find(d => d.hashDados === hashDados);
      if (igualQualquerData) return { declaracao: igualQualquerData, criada: false };
    }

    const base = {
      tipo, userId: String(userId), matriculaId: matriculaId ?? null, cursoId: cursoId ?? null, ano: ano ?? null,
      solicitadaEm: momento, emitidaEm: momento, dados, hashDados, iniciaisTitular: iniciais(nomeTitularDeDados(dados) || ''), revogada: null
    };
    const { resultado } = await inserirComCodigo(async (codigo) => {
      const doc = { ...base, codigo };
      const { hash, kid } = sel.assinar('declaracao', camposSeloDeclaracao(doc));
      doc.hash = hash;
      doc.kid = kid;
      const r = await col().insertOne(doc);
      doc._id = r.insertedId;
      return doc;
    }, () => codigoVerificacao('DEC'), { indice: 'uq_declaracoes_codigo', campo: 'codigo' });

    if (substituirSeMudou) {
      const anteriores = recentes.filter(d => d.hashDados !== hashDados);
      for (const d of anteriores) {
        await col().updateOne({ _id: d._id, revogada: null }, { $set: { revogada: { em: momento, por: 'sistema', motivo: 'substituida' } } });
      }
    }
    return { declaracao: resultado, criada: true };
  }

  return Object.freeze({ emitir });
}

/** Índices da F3b (API §3.2–§3.3), registrados por indices.js na carga dos módulos. */
export const INDICES_CERTIFICACAO = Object.freeze([
  { colecao: 'cursos', chave: { sigla: 1 }, opcoes: { name: 'uq_cursos_sigla', unique: true, partialFilterExpression: { sigla: { $type: 'string' } } } },
  { colecao: 'aulas', chave: { codigo: 1 }, opcoes: { name: 'uq_aulas_codigo', unique: true, partialFilterExpression: { codigo: { $type: 'string' } } } },
  { colecao: 'ies', chave: { cnpj: 1 }, opcoes: { name: 'uq_ies_cnpj', unique: true } },
  { colecao: 'declaracoes', chave: { codigo: 1 }, opcoes: { name: 'uq_declaracoes_codigo', unique: true } },
  { colecao: 'declaracoes', chave: { userId: 1, emitidaEm: -1 }, opcoes: { name: 'ix_declaracoes_user' } },
  { colecao: 'declaracoes', chave: { userId: 1, tipo: 1, matriculaId: 1, ano: 1 }, opcoes: { name: 'ix_declaracoes_tipo' } }
]);
