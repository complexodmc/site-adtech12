/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/estudos-dados.js (F1b)
   Spec: PORTAL-ACADEMICO.md §7.7 (DMC_Estudos); rotas da F1a em
   PORTAL-API.md §6.5 e §8.4; regra única de contagem em §6.5.

   DMC_Estudos.meusCursos()        → GET  /portal/me/cursos
   DMC_Estudos.trilha(cursoId)     → GET  /portal/cursos/:id/trilha
   DMC_Estudos.progresso(cursoId)  → GET  /portal/cursos/:id/progresso
   DMC_Estudos.conteudo(moduloId)  → GET  /portal/modulos/:id/conteudo
   DMC_Estudos.assistido(aulaId, { posicaoSeg, duracaoSeg, pct, fonte })
                                   → POST /portal/aulas/:id/assistido
   DMC_Estudos.feito(chave)        → POST /portal/conteudo/feito
   DMC_Estudos.concluirAula(aulaId, concluida) → PUT/DELETE /api/progresso/:id

   Compatibilidade (fase 1): enquanto as rotas da F1a não estão
   montadas no servidor (404 "Rota não encontrada", sem `codigo`),
   os mesmos formatos são compostos a partir do catálogo, das
   liberações e do progresso legados (já carregados por DMC_init).
   Nesse modo não há plano de ensino, avaliação nem registro de
   leitura de material, e o % assistido não é gravado: as telas
   mostram só o que existe (D7). DMC_Estudos.modo() diz qual vale.
   ============================================================= */
(function () {
  'use strict';

  if (window.DMC_Estudos) return;

  const enc = encodeURIComponent;
  const API = {
    meusCursos: '/portal/me/cursos',
    trilha: (id) => `/portal/cursos/${enc(id)}/trilha`,
    progresso: (id) => `/portal/cursos/${enc(id)}/progresso`,
    conteudo: (id) => `/portal/modulos/${enc(id)}/conteudo`,
    assistido: (id) => `/portal/aulas/${enc(id)}/assistido`,
    feito: '/portal/conteudo/feito',
    progressoLegado: (id) => `/progresso/${enc(id)}`
  };

  const api = () => window.DMC_Api;

  // null = ainda não sabemos · 'servidor' = rotas da F1a montadas · 'legado' = compatibilidade
  let modo = null;

  /** 404 do "Rota não encontrada" (módulo ausente), e não um 404 de negócio com `codigo`. */
  function ehRotaAusente(err) {
    if (!err) return false;
    if (err.codigo) return false;
    if (err.status === 404) return true;
    return /Rota não encontrada|^Erro 404\b/i.test(String(err.message || ''));
  }

  /**
   * Cliente antigo (sem status/codigo no erro): deduz o caso pela mensagem do
   * servidor (erros.js da F0m) para as telas mostrarem o vazio certo.
   */
  function classificar(err) {
    if (!err || err.codigo || err.status) return err;
    const msg = String(err.message || '');
    if (/não tem acesso|não está liberad|sem acesso/i.test(msg)) { err.status = 403; err.codigo = 'sem-acesso'; }
    else if (/não encontrad/i.test(msg) && !/Rota não encontrada/i.test(msg)) { err.status = 404; err.codigo = 'nao-encontrado'; }
    return err;
  }

  async function obter(caminho, legado) {
    if (modo === 'legado') return legado();
    let dados;
    try {
      dados = await api().get(caminho, { silencioso404: true });
    } catch (err) {
      if (!ehRotaAusente(err)) throw classificar(err);
      dados = null;
    }
    if (dados == null) {
      modo = 'legado';
      return legado();
    }
    modo = 'servidor';
    return dados;
  }

  // -----------------------------------------------------------------
  // Leitura legada (compatibilidade)
  // -----------------------------------------------------------------
  const disponivel = (a) => !a || a.disponivel !== false;
  const cursos = () => ((window.DMC_Data && window.DMC_Data.get().cursos) || []);
  const feitoLegado = (aulaId) => !!(window.DMC_Progress && window.DMC_Progress.isDone(aulaId));

  function temAcesso(curso) {
    const L = window.DMC_Liberacoes;
    if (curso && curso.liberado === true) return true; // professor docente (API §7.1)
    return !!(L && L.has(curso.id));
  }

  function erro404(msg) {
    const e = new Error(msg);
    e.status = 404;
    e.codigo = 'nao-encontrado';
    return e;
  }
  function erroSemAcesso() {
    const e = new Error('Este curso não está liberado na sua conta.');
    e.status = 403;
    e.codigo = 'sem-acesso';
    return e;
  }

  function contar(aulas) {
    const disp = aulas.filter(disponivel);
    const total = disp.length;
    const feitas = disp.filter((a) => feitoLegado(a.id)).length;
    return { aulasConcluidas: feitas, aulasTotal: total, pct: total ? Math.floor((feitas / total) * 100) : null };
  }
  const aulasDoCurso = (c) => (c.modulos || []).reduce((acc, m) => acc.concat(m.aulas || []), []);

  function situacaoDerivada(p, temAulas) {
    if (!temAulas) return { situacao: 'em-breve', situacaoRotulo: 'Em breve' };
    if (p.aulasTotal && p.aulasConcluidas >= p.aulasTotal) return { situacao: 'concluido', situacaoRotulo: 'Concluído' };
    if (p.aulasConcluidas > 0) return { situacao: 'cursando', situacaoRotulo: 'Cursando' };
    return { situacao: 'nao-iniciado', situacaoRotulo: 'Não iniciado' };
  }

  function primeiraPendente(curso) {
    for (const m of curso.modulos || []) {
      for (const a of m.aulas || []) {
        if (disponivel(a) && !feitoLegado(a.id)) return { moduloId: m.id, chave: `aula:${a.id}`, aulaId: a.id };
      }
    }
    return null;
  }

  function ultimaAtividade(curso) {
    const P = window.DMC_Progress;
    let max = 0;
    if (!P) return 0;
    for (const a of aulasDoCurso(curso)) {
      // DMC_Progress guarda aulaId → completedAt; isDone() não expõe a data, então
      // a ordem cai para "curso com aula concluída" (1) contra "sem atividade" (0).
      if (P.isDone(a.id)) max = 1;
    }
    return max;
  }

  const legado = {
    meusCursos() {
      const meus = cursos().filter(temAcesso);
      const itens = meus.map((c) => {
        const progresso = contar(aulasDoCurso(c));
        const temAulas = aulasDoCurso(c).some(disponivel);
        const sit = situacaoDerivada(progresso, temAulas);
        return {
          curso: { id: c.id, titulo: c.titulo, sigla: null, capaUrl: c.capaUrl || null, capaVerticalUrl: null, nivel: null, nivelRotulo: null, cargaHoraria: c.cargaHoraria || null },
          matricula: null,
          situacao: sit.situacao,
          situacaoRotulo: sit.situacaoRotulo,
          progresso,
          continuar: primeiraPendente(c),
          semAcesso: false
        };
      });
      let escolhido = null;
      try { escolhido = window.localStorage.getItem('dmc:cursoEscolhido'); } catch { escolhido = null; }
      let ativoId = null;
      if (escolhido && itens.some((i) => i.curso.id === escolhido)) ativoId = escolhido;
      else {
        const comAtividade = meus.find((c) => ultimaAtividade(c) > 0);
        ativoId = comAtividade ? comAtividade.id : (itens[0] ? itens[0].curso.id : null);
      }
      return { ativoId, itens };
    },

    trilha(cursoId) {
      const c = cursos().find((x) => x.id === cursoId);
      if (!c) throw erro404('Curso não encontrado.');
      if (!temAcesso(c)) throw erroSemAcesso();
      const modulos = (c.modulos || []).map((m, i) => {
        const aulas = m.aulas || [];
        const p = contar(aulas);
        const temAulas = aulas.some(disponivel);
        const sit = situacaoDerivada(p, temAulas);
        return {
          id: m.id, numero: m.numero || String(i + 1).padStart(2, '0'), posicao: i + 1, titulo: m.titulo,
          chHoras: null, duracaoTexto: m.duracao || null, tipo: 'regular', capaUrl: null,
          situacao: sit.situacao, situacaoRotulo: sit.situacaoRotulo, nota: null,
          progresso: { ...p, itensFeitos: p.aulasConcluidas, itensTotal: p.aulasTotal },
          concluido: sit.situacao === 'concluido'
        };
      });
      const atual = primeiraPendente(c) || (modulos[0] ? { moduloId: modulos[0].id, chave: null } : null);
      return { curso: { id: c.id, titulo: c.titulo, sigla: null, capaUrl: c.capaUrl || null, cargaHoraria: c.cargaHoraria || null }, modulos, atual };
    },

    progresso(cursoId) {
      const c = cursos().find((x) => x.id === cursoId);
      if (!c) throw erro404('Curso não encontrado.');
      const aulas = {};
      for (const a of aulasDoCurso(c)) {
        if (feitoLegado(a.id)) aulas[a.id] = { pctVideo: null, concluida: true, concluidaEm: null, origem: null };
      }
      return { aulas, conteudo: {}, curso: contar(aulasDoCurso(c)) };
    },

    conteudo(moduloId) {
      let curso = null; let modulo = null; let pos = 0;
      for (const c of cursos()) {
        const i = (c.modulos || []).findIndex((m) => m.id === moduloId);
        if (i >= 0) { curso = c; modulo = c.modulos[i]; pos = i; break; }
      }
      if (!modulo) throw erro404('Módulo não encontrado.');
      if (!temAcesso(curso)) throw erroSemAcesso();
      const normalizar = window.DMC_Video ? window.DMC_Video.normalizar : () => null;
      const aulas = modulo.aulas || [];

      const materiais = [];
      for (const a of aulas) {
        if (!disponivel(a)) continue;
        for (const mat of a.materiais || []) {
          materiais.push({
            chave: `material:${mat.id}`, id: mat.id, origem: 'aula', aulaId: a.id, aulaTitulo: a.titulo,
            categoria: mat.categoria || (mat.tipo === 'link' ? 'complementar' : 'leitura'),
            tipo: mat.tipo === 'link' ? 'link' : 'arquivo', nome: mat.nome, tamanho: mat.tamanho || null,
            url: mat.url, feito: null // sem registro de leitura no legado
          });
        }
      }
      const itensAulas = aulas.map((a) => ({
        chave: `aula:${a.id}`, id: a.id, codigo: null, titulo: a.titulo, duracao: a.duracao || null,
        rotuloEncontro: null, disponivel: disponivel(a),
        video: disponivel(a) ? normalizar(a.videoUrl) : null,
        pctVideo: null, concluida: feitoLegado(a.id), concluidaEm: null, encontro: null
      }));
      const disp = itensAulas.filter((a) => a.disponivel);
      const feitas = disp.filter((a) => a.concluida).length;
      const modulos = curso.modulos || [];
      return {
        curso: { id: curso.id, titulo: curso.titulo, sigla: null },
        modulo: { id: modulo.id, numero: modulo.numero || String(pos + 1).padStart(2, '0'), titulo: modulo.titulo, chHoras: null, duracaoTexto: modulo.duracao || null, tipo: 'regular', posicao: pos + 1, totalModulos: modulos.length, capaUrl: null },
        secoes: {
          plano: null,
          materiais: materiais.length ? { feitos: null, total: materiais.length, itens: materiais } : null,
          aulas: itensAulas.length ? { feitos: feitas, total: disp.length, itens: itensAulas } : null,
          avaliacoes: null
        },
        sequencia: materiais.map((m) => m.chave).concat(disp.map((a) => a.chave)),
        progresso: { itensFeitos: feitas, itensTotal: disp.length, aulasConcluidas: feitas, aulasTotal: disp.length, pct: disp.length ? Math.floor((feitas / disp.length) * 100) : null },
        anterior: { moduloId: pos > 0 ? modulos[pos - 1].id : null },
        proximo: { moduloId: pos < modulos.length - 1 ? modulos[pos + 1].id : null }
      };
    }
  };

  // -----------------------------------------------------------------
  // API pública
  // -----------------------------------------------------------------
  function emitirProgresso(detalhe) {
    try { document.dispatchEvent(new CustomEvent('dmc:progresso', { detail: detalhe })); } catch { /* sem CustomEvent */ }
  }

  const DMC_Estudos = {
    modo: () => modo,
    meusCursos: () => obter(API.meusCursos, legado.meusCursos),
    trilha: (cursoId) => obter(API.trilha(cursoId), () => legado.trilha(cursoId)),
    progresso: (cursoId) => obter(API.progresso(cursoId), () => legado.progresso(cursoId)),
    conteudo: (moduloId) => obter(API.conteudo(moduloId), () => legado.conteudo(moduloId)),

    /** Registra o % assistido. No modo de compatibilidade resolve null (não há onde gravar). */
    async assistido(aulaId, { posicaoSeg, duracaoSeg, pct, fonte } = {}) {
      if (modo !== 'servidor') return null;
      const corpo = { posicaoSeg: Math.max(0, Number(posicaoSeg) || 0), duracaoSeg: Number(duracaoSeg) > 0 ? Number(duracaoSeg) : null, pct: Math.max(0, Math.min(100, Number(pct) || 0)), fonte };
      try {
        return await api().post(API.assistido(aulaId), corpo, { silencioso404: true });
      } catch (err) {
        if (ehRotaAusente(err)) return null;
        throw err;
      }
    },

    /** Marca plano ou material como feito. No modo de compatibilidade resolve null. */
    async feito(chave, contexto = {}) {
      if (modo !== 'servidor') return null;
      const r = await api().post(API.feito, { chave }, { silencioso404: true });
      if (r) emitirProgresso({ cursoId: contexto.cursoId || null, moduloId: contexto.moduloId || null, chave, feito: true });
      return r;
    },

    /** Conclusão manual da aula pelo PUT/DELETE legado (D5). */
    async concluirAula(aulaId, concluida, contexto = {}) {
      const P = window.DMC_Progress;
      if (P && typeof P.set === 'function') await P.set(aulaId, !!concluida);
      else if (concluida) await api().put(API.progressoLegado(aulaId));
      else await api().del(API.progressoLegado(aulaId));
      emitirProgresso({ cursoId: contexto.cursoId || null, moduloId: contexto.moduloId || null, chave: `aula:${aulaId}`, feito: !!concluida });
    },

    /** Curso e módulo de uma aula pelo catálogo legado (aula.html?id=). */
    localizarAula(aulaId) {
      for (const c of cursos()) {
        for (const m of c.modulos || []) {
          if ((m.aulas || []).some((a) => a.id === aulaId)) return { cursoId: c.id, moduloId: m.id };
        }
      }
      return null;
    },

    /** Cursos do catálogo sem acesso (bloco "Outros cursos" do Início). */
    outrosCursos() {
      return cursos().filter((c) => c.isAtivo !== false && !temAcesso(c));
    },

    /** Curso do catálogo legado (carga horária, descrição). */
    cursoDoCatalogo(cursoId) {
      return cursos().find((c) => c.id === cursoId) || null;
    }
  };

  window.DMC_Estudos = DMC_Estudos;
})();
