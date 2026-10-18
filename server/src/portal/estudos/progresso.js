// =============================================================
// COMPLEXO DMC · Portal — progresso, conteúdo em seções e conclusão
// PORTAL-API §6.5 (Conteudo, regra de contagem única), §8.4 (% assistido
// e conclusão automática), §4.4 (estudos.progressoDoCurso,
// estudos.aulasDisponiveis, grupo aoConcluirAula) · dono: F1a.
//
// Regra de contagem ÚNICA: % = aulas disponíveis concluídas ÷ aulas
// disponíveis (aula "em breve" fora de toda conta; null sem aula
// disponível). Os contadores feitos/total das seções e o "n de N"
// contam ITENS (plano, materiais, aulas, avaliações).
// Serviço de outra fatia ausente → seção/campo some ou fica null (D7).
// =============================================================
import { normalizarVideo } from './video.js';
import { dispararAoConcluirAula } from '../servicos.js';

export const LIMIAR_CONCLUSAO = 90;
export const CATEGORIAS_MATERIAL = Object.freeze(['leitura', 'slides', 'complementar']);
export const FONTES_VIDEO = Object.freeze(['nativo', 'youtube', 'vimeo']);
const ROTULOS_NIVEL = Object.freeze({
  curso_livre: 'Curso livre',
  extensao: 'Extensão',
  aperfeicoamento: 'Aperfeiçoamento',
  pos_graduacao_lato_sensu: 'Pós-graduação lato sensu'
});

const iso = d => (d instanceof Date ? d.toISOString() : (d ? new Date(d).toISOString() : null));
const textoLimpo = v => (typeof v === 'string' ? v.trim() : '');
const listaDeTextos = v => (Array.isArray(v) ? v.map(textoLimpo).filter(Boolean) : []);

/** Rótulo do nível; lato sensu só com IES parceira cadastrada (OAB/MEC: nada de afirmação indevida). */
export function rotuloDoNivel(curso) {
  const n = curso?.nivel;
  if (!n || !Object.hasOwn(ROTULOS_NIVEL, n)) return { nivel: null, nivelRotulo: null };
  if (n === 'pos_graduacao_lato_sensu' && !curso.iesId) return { nivel: null, nivelRotulo: null };
  return { nivel: n, nivelRotulo: ROTULOS_NIVEL[n] };
}

/** % inteiro, por baixo (nunca mostra 100 sem tudo concluído); null sem total. */
export function pctDe(feitos, total) {
  if (!total) return null;
  return Math.floor((100 * feitos) / total);
}

/** "Sexta · noite" a partir do início do encontro (fuso de São Paulo). */
export function rotuloDoEncontro(inicioEm) {
  const d = inicioEm ? new Date(inicioEm) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const dia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' }).format(d).split('-')[0];
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(d));
  const periodo = hora < 12 ? 'manhã' : hora < 18 ? 'tarde' : 'noite';
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} · ${periodo}`;
}

/** Plano no formato de leitura (o MESMO em GET …/planos e no Conteudo; DC-61). */
export function planoParaLeitura(plano, aulaIdsDoModulo = []) {
  const p = plano && typeof plano === 'object' ? plano : {};
  const aulas = new Set(aulaIdsDoModulo.map(String));
  const ementa = typeof p.ementa === 'string' ? p.ementa : '';
  const objetivos = listaDeTextos(p.objetivos);
  const bibliografia = {
    basica: listaDeTextos(p.bibliografia?.basica),
    complementar: listaDeTextos(p.bibliografia?.complementar)
  };
  const cronograma = (Array.isArray(p.cronograma) ? p.cronograma : [])
    .filter(l => l && typeof l === 'object')
    .map(l => ({
      encontro: textoLimpo(l.encontro),
      data: typeof l.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l.data) ? l.data : null,
      tema: textoLimpo(l.tema),
      aulaId: l.aulaId && aulas.has(String(l.aulaId)) ? String(l.aulaId) : null
    }));
  const vazio = !ementa.trim() && !objetivos.length && !bibliografia.basica.length && !bibliografia.complementar.length && !cronograma.length;
  return { ementa, objetivos, bibliografia, cronograma, vazio, atualizadoEm: iso(p.atualizadoEm), versao: Number(p.versao) || 0 };
}

const categoriaDe = m => (CATEGORIAS_MATERIAL.includes(m?.categoria) ? m.categoria : 'leitura');

/** Materiais do módulo + materiais legados das aulas DISPONÍVEIS, na ordem da `sequencia`. */
export function materiaisDoModulo(modulo) {
  const itens = [];
  (Array.isArray(modulo.materiais) ? modulo.materiais : []).forEach((m, i) => {
    if (!m || !m.id) return;
    const tipo = m.tipo === 'link' ? 'link' : 'arquivo';
    itens.push({
      chave: `material:${m.id}`, id: m.id, origem: 'modulo', categoria: categoriaDe(m), tipo,
      nome: m.nome || 'Material de apoio', tamanho: tipo === 'arquivo' ? (Number(m.tamanho) || null) : null,
      url: tipo === 'link' ? (m.url || null) : (m.arquivoId ? `/api/portal/materiais/${String(m.arquivoId)}` : null),
      _ordem: [0, Number(m.ordem) || 0, i]
    });
  });
  (modulo.aulas || []).forEach((a, ia) => {
    if (a.disponivel === false) return;
    (Array.isArray(a.materiais) ? a.materiais : []).forEach((m, i) => {
      if (!m || !m.id) return;
      const tipo = m.tipo === 'link' ? 'link' : 'arquivo';
      itens.push({
        chave: `material:${m.id}`, id: m.id, origem: 'aula', aulaId: a._id, aulaTitulo: a.titulo || '',
        categoria: categoriaDe(m), tipo, nome: m.nome || 'Material de apoio',
        tamanho: tipo === 'arquivo' ? (Number(m.tamanho) || null) : null,
        url: tipo === 'link' ? (m.url || null) : `/api/materiais/${encodeURIComponent(a._id)}/${encodeURIComponent(m.id)}`,
        _ordem: [1, ia, i]
      });
    });
  });
  const cat = c => CATEGORIAS_MATERIAL.indexOf(c);
  itens.sort((x, y) => cat(x.categoria) - cat(y.categoria) || x._ordem[0] - y._ordem[0] || x._ordem[1] - y._ordem[1] || x._ordem[2] - y._ordem[2]);
  for (const it of itens) delete it._ordem;
  return itens;
}

/**
 * Monta o `Conteudo` de UM módulo (API §6.5) a partir do que já foi lido.
 * `progresso` = mapas do usuário (aulas, video, conteudo) ou null na visão da equipe sem liberação.
 */
export function montarConteudo({ curso, modulos, indice, progresso, avaliacoes = [], encontros = new Map() }) {
  const modulo = modulos[indice];
  const equipe = progresso === null;
  const feitoDe = chave => (equipe ? null : progresso.conteudo.has(chave));

  // 1. plano
  const plano = planoParaLeitura(modulo.plano, (modulo.aulas || []).map(a => a._id));
  const chavePlano = `plano:${modulo._id}`;
  const itemPlano = { chave: chavePlano, ...plano, feito: plano.vazio ? null : feitoDe(chavePlano) };
  delete itemPlano.versao;

  // 2. materiais
  const materiais = materiaisDoModulo(modulo).map(m => ({ ...m, feito: feitoDe(m.chave) }));

  // 3. aulas (todas aparecem; "em breve" sem vídeo nem material e fora do total)
  const aulas = (modulo.aulas || []).map(a => {
    const disponivel = a.disponivel !== false;
    const enc = encontros.get(a._id) || null;
    const pv = equipe ? null : progresso.video.get(a._id);
    const pl = equipe ? null : progresso.aulas.get(a._id);
    return {
      chave: `aula:${a._id}`, id: a._id, codigo: a.codigo || null, titulo: a.titulo || '', duracao: a.duracao || '',
      rotuloEncontro: textoLimpo(a.rotuloEncontro) || (enc ? rotuloDoEncontro(enc.inicioEm) : null),
      disponivel,
      video: disponivel ? normalizarVideo(a.videoUrl) : null,
      pctVideo: equipe || !disponivel ? null : (pv ? Number(pv.pctMax) || 0 : 0),
      concluida: equipe || !disponivel ? null : !!pl,
      concluidaEm: equipe || !pl ? null : iso(pl.completedAt),
      encontro: enc ? { id: String(enc._id), inicioEm: iso(enc.inicioEm), titulo: enc.titulo || '' } : null
    };
  });
  const aulasDisp = aulas.filter(a => a.disponivel);

  // 4. avaliações (prévia, depois modular; aluno só vê publicadas — o serviço da F2 já filtra pela visão)
  const ordemTipo = t => (t === 'previa' ? 0 : 1);
  const avs = (Array.isArray(avaliacoes) ? avaliacoes : [])
    .filter(a => a && a.id && (equipe || a.publicada !== false))
    .sort((a, b) => ordemTipo(a.tipo) - ordemTipo(b.tipo))
    .map(a => ({
      chave: `avaliacao:${a.id}`, id: String(a.id), tipo: a.tipo, titulo: a.titulo || '',
      nQuestoes: a.nQuestoes ?? null, tentativasMax: a.tentativasMax ?? null, usadas: equipe ? null : (a.usadas ?? null),
      restantes: equipe ? null : (a.restantes ?? null), tempoLimiteMin: a.tempoLimiteMin ?? null,
      melhorNota: equipe ? null : (a.melhorNota ?? null), situacao: equipe ? null : (a.situacao ?? null),
      finalizada: equipe ? null : !!a.finalizada, feito: equipe ? null : !!a.feito,
      ...(equipe ? { publicada: a.publicada !== false } : {})
    }));

  const conta = itens => (equipe ? null : itens.filter(i => i.feito === true).length);
  const secaoPlano = { feitos: plano.vazio ? 0 : (equipe ? null : (itemPlano.feito ? 1 : 0)), total: plano.vazio ? 0 : 1, item: itemPlano };
  const secaoMateriais = { feitos: conta(materiais), total: materiais.length, itens: materiais };
  const secaoAulas = {
    feitos: equipe ? null : aulasDisp.filter(a => a.concluida).length,
    total: aulasDisp.length,
    itens: aulas
  };
  const secaoAvaliacoes = { feitos: conta(avs), total: avs.length, itens: avs };

  const sequencia = [
    ...(plano.vazio ? [] : [chavePlano]),
    ...materiais.map(m => m.chave),
    ...aulasDisp.map(a => a.chave),
    ...avs.map(a => a.chave)
  ];
  const itensTotal = sequencia.length;
  const itensFeitos = equipe ? null
    : (secaoPlano.feitos || 0) + secaoMateriais.feitos + secaoAulas.feitos + secaoAvaliacoes.feitos;
  const aulasConcluidas = equipe ? null : secaoAulas.feitos;

  return {
    curso: { id: curso._id, titulo: curso.titulo || '', sigla: curso.sigla || null },
    modulo: {
      id: modulo._id, numero: modulo.numero || String(indice + 1).padStart(2, '0'), titulo: modulo.titulo || '',
      chHoras: Number.isFinite(modulo.chHoras) ? modulo.chHoras : null, tipo: modulo.tipo === 'tcc' ? 'tcc' : 'regular',
      posicao: indice + 1, totalModulos: modulos.length, capaUrl: capaUrlDoModulo(modulo)
    },
    secoes: { plano: secaoPlano, materiais: secaoMateriais, aulas: secaoAulas, avaliacoes: secaoAvaliacoes },
    sequencia,
    progresso: {
      itensFeitos, itensTotal, aulasConcluidas, aulasTotal: aulasDisp.length,
      pct: equipe ? null : pctDe(aulasConcluidas, aulasDisp.length)
    },
    anterior: { moduloId: indice > 0 ? modulos[indice - 1]._id : null },
    proximo: { moduloId: indice < modulos.length - 1 ? modulos[indice + 1]._id : null }
  };
}

export const capaUrlDoModulo = m => (m?.capa?.arquivo ? `/api/portal/conteudo/imagens/${m.capa.arquivo}` : null);
export const capaVerticalUrlDoCurso = c => (c?.capaVertical?.arquivo ? `/api/portal/conteudo/imagens/${c.capaVertical.arquivo}` : null);

/** Teto de plausibilidade (API §8.4): velocidade 2× + 1 min de folga; sem duração, 50 nos 5 min iniciais. */
export function tetoPlausivel({ agora, primeiroEm, duracaoSeg }) {
  const decorridoSeg = Math.max(0, (agora.getTime() - new Date(primeiroEm).getTime()) / 1000);
  if (duracaoSeg && duracaoSeg > 0) return Math.min(100, (100 * (decorridoSeg + 60) * 2) / duracaoSeg);
  return decorridoSeg < 300 ? 50 : 100;
}

/**
 * Serviço de estudos (usa repositórios e o localizador de serviços).
 * @param {{ repos: object, servicos: object, agora?: () => Date, log?: object }} deps
 */
export function criarServicoEstudos({ repos, servicos, agora = () => new Date(), log = console } = {}) {
  if (!repos) throw new TypeError('criarServicoEstudos: informe repos.');
  if (!servicos) throw new TypeError('criarServicoEstudos: informe servicos.');

  const tentar = nome => {
    const f = servicos.tentar(nome);
    return typeof f === 'function' ? f : null;
  };
  const avisar = (texto, err) => {
    try { (log.warn || log.error).call(log, `[portal] estudos: ${texto}${err ? ` — ${err.name || 'Error'}: ${String(err.message || '').slice(0, 200)}` : ''}`); } catch { /* nada */ }
  };

  async function matriculaVigenteId(userId, cursoId) {
    const f = tentar('secretaria.matriculaVigente');
    if (!f) return null;
    try {
      const m = await f(String(userId), String(cursoId));
      return m && m._id ? String(m._id) : (m && m.id ? String(m.id) : null);
    } catch (err) { avisar('secretaria.matriculaVigente falhou', err); return null; }
  }

  async function avaliacoesDoModulo(matriculaId, moduloId) {
    const f = tentar('avaliacoes.resumoDoModulo');
    if (!f) return [];
    try {
      const r = await f(matriculaId, String(moduloId));
      return Array.isArray(r) ? r : [];
    } catch (err) { avisar('avaliacoes.resumoDoModulo falhou', err); return []; }
  }

  /**
   * Curso inteiro do ponto de vista de `userId`. `visaoEquipe` = sem liberação (docente/admin):
   * feitos e % ficam null. → { estrutura, conteudos:[Conteudo], progresso } | null (curso inexistente).
   */
  async function calcularCurso(userId, cursoId, { visaoEquipe = false, comAvaliacoes = true } = {}) {
    const estrutura = await repos.estruturaDoCurso(cursoId);
    if (!estrutura) return null;
    const { curso, modulos } = estrutura;
    const aulaIds = modulos.flatMap(m => m.aulas.map(a => a._id));
    const [progresso, encontros, matriculaId] = await Promise.all([
      visaoEquipe ? null : repos.progressoDoUsuario(userId, { aulaIds, cursoId }),
      repos.encontrosDasAulas(aulaIds),
      visaoEquipe || !comAvaliacoes ? null : matriculaVigenteId(userId, cursoId)
    ]);
    const avaliacoes = comAvaliacoes
      ? await Promise.all(modulos.map(m => avaliacoesDoModulo(visaoEquipe ? null : matriculaId, m._id)))
      : modulos.map(() => []);
    const conteudos = modulos.map((_m, i) => montarConteudo({ curso, modulos, indice: i, progresso, avaliacoes: avaliacoes[i], encontros }));
    return { estrutura, conteudos, progresso };
  }

  /** Resumo do curso (forma do serviço `estudos.progressoDoCurso`). */
  function resumirCurso(calc) {
    const { conteudos, progresso } = calc;
    let aulasTotal = 0;
    let aulasConcluidas = 0;
    const porModulo = {};
    let continuar = null;
    for (const c of conteudos) {
      aulasTotal += c.progresso.aulasTotal;
      aulasConcluidas += c.progresso.aulasConcluidas || 0;
      porModulo[c.modulo.id] = {
        aulasTotal: c.progresso.aulasTotal, aulasConcluidas: c.progresso.aulasConcluidas, pct: c.progresso.pct,
        itensTotal: c.progresso.itensTotal, itensFeitos: c.progresso.itensFeitos
      };
      if (!continuar && progresso) {
        const feito = new Map();
        for (const s of ['materiais', 'aulas', 'avaliacoes']) for (const it of c.secoes[s].itens) feito.set(it.chave, s === 'aulas' ? it.concluida === true : it.feito === true);
        feito.set(c.secoes.plano.item.chave, c.secoes.plano.item.feito === true);
        const pendente = c.sequencia.find(ch => !feito.get(ch));
        if (pendente) continuar = { moduloId: c.modulo.id, chave: pendente, aulaId: pendente.startsWith('aula:') ? pendente.slice(5) : null };
      }
    }
    let ultima = null;
    if (progresso) {
      for (const p of progresso.aulas.values()) if (p.completedAt && (!ultima || p.completedAt > ultima)) ultima = new Date(p.completedAt);
      for (const p of progresso.video.values()) if (p.atualizadoEm && (!ultima || p.atualizadoEm > ultima)) ultima = new Date(p.atualizadoEm);
      for (const p of progresso.conteudo.values()) if (p.feitoEm && (!ultima || p.feitoEm > ultima)) ultima = new Date(p.feitoEm);
    }
    return {
      aulasTotal,
      aulasConcluidas: progresso ? aulasConcluidas : null,
      pct: progresso ? pctDe(aulasConcluidas, aulasTotal) : null,
      porModulo,
      ultimaAtividadeEm: ultima,
      continuar
    };
  }

  /** Serviço `estudos.progressoDoCurso(userId, cursoId)` (API §4.4). */
  async function progressoDoCurso(userId, cursoId) {
    const calc = await calcularCurso(userId, cursoId);
    if (!calc) return { aulasTotal: 0, aulasConcluidas: 0, pct: null, porModulo: {}, ultimaAtividadeEm: null, continuar: null };
    return resumirCurso(calc);
  }

  /** Serviço `estudos.aulasDisponiveis(cursoId)` → [{ aulaId, moduloId, codigo, titulo }]. */
  async function aulasDisponiveis(cursoId) {
    const e = await repos.estruturaDoCurso(cursoId);
    if (!e) return [];
    return e.modulos.flatMap(m => m.aulas.filter(a => a.disponivel !== false).map(a => ({
      aulaId: a._id, moduloId: m._id, codigo: a.codigo || null, titulo: a.titulo || ''
    })));
  }

  /**
   * Conclusão da aula (manual pelo PUT legado ou automática ≥ 90%): upsert em `progresso` e,
   * SÓ quando este chamado inseriu, o grupo `aoConcluirAula` (melhor esforço; nunca lança).
   */
  async function concluirAula({ userId, cursoId, moduloId, aulaId, via, pctVideo = null }) {
    const em = agora();
    const origem = via === 'conclusao_auto' ? 'auto' : 'manual';
    const r = await repos.concluirAulaLegado({ userId, aulaId, origem, em });
    if (r.criada) {
      try {
        await dispararAoConcluirAula(servicos, { userId: String(userId), cursoId: String(cursoId), moduloId: String(moduloId), aulaId: String(aulaId), via, pctVideo, em }, { log });
      } catch (err) { avisar('aoConcluirAula falhou', err); }
    }
    return r;
  }

  /** POST /portal/aulas/:aulaId/assistido (API §8.4). Entrada já validada. */
  async function registrarAssistido({ userId, aula, cursoId, posicaoSeg, duracaoSeg, pct, fonte }) {
    const em = agora();
    const atual = await repos.progressoVideo(userId, aula._id);
    const primeiroEm = atual?.primeiroEm || em;
    const duracao = duracaoSeg || atual?.duracaoSeg || null;
    const teto = tetoPlausivel({ agora: em, primeiroEm, duracaoSeg: duracao });
    const aceito = Math.round(Math.max(0, Math.min(pct, teto, 100)) * 10) / 10;
    const doc = await repos.gravarProgressoVideo({
      userId, aulaId: aula._id, cursoId, moduloId: aula.moduloId, pct: aceito, posicaoSeg, duracaoSeg, fonte, em
    });
    const pctMax = Number(doc?.pctMax) || 0;
    let concluida = null;
    if (pctMax >= LIMIAR_CONCLUSAO) {
      concluida = await concluirAula({ userId, cursoId, moduloId: aula.moduloId, aulaId: aula._id, via: 'conclusao_auto', pctVideo: pctMax });
    } else {
      const legado = await repos.progressoDoUsuario(userId, { aulaIds: [aula._id] });
      const p = legado.aulas.get(aula._id);
      if (p) concluida = { completedAt: p.completedAt, criada: false };
    }
    return {
      aulaId: aula._id, pctMax, concluida: !!concluida,
      concluidaEm: concluida ? iso(concluida.completedAt) : null,
      frequencia: null
    };
  }

  return Object.freeze({ calcularCurso, resumirCurso, progressoDoCurso, aulasDisponiveis, concluirAula, registrarAssistido });
}
