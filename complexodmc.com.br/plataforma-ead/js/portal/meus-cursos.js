/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/meus-cursos.js (F1b)
   Meus cursos — meus-cursos.html. Spec: PORTAL-UX.md §6.2; dados de
   GET /portal/me/cursos (F1a) por DMC_Estudos. Preserva
   #meus-cursos-lista (R7). "Continuar" leva ao primeiro conteúdo
   pendente (corrige o aula.html?id=undefined de app.js:1330).
   ============================================================= */
(function () {
  'use strict';

  const UI = window.DMC_UI;
  const H = UI.html;
  const enc = encodeURIComponent;
  const FILTROS = [
    { valor: 'andamento', rotulo: 'Em andamento' },
    { valor: 'concluidos', rotulo: 'Concluídos' },
    { valor: 'todos', rotulo: 'Todos' }
  ];

  function ic(chave, reserva) {
    const a = UI.icone(chave);
    return String(a) ? a : UI.icone(reserva || '');
  }
  function barra(pct, rotulo) {
    const v = pct == null ? 0 : Math.max(0, Math.min(100, Math.round(pct)));
    return H`<span class="pf-est-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-label="${rotulo}"><span class="pf-est-barra__valor" style="${`width:${v}%`}"></span></span>`;
  }
  const completo = (i) => { const p = i.progresso || {}; return !!(p.aulasTotal && p.aulasConcluidas >= p.aulasTotal); };
  function situacao(i) {
    if (i.situacao) return { chave: i.situacao, rotulo: i.situacaoRotulo || i.situacao };
    const p = i.progresso || {};
    if (completo(i)) return { chave: 'concluido', rotulo: 'Concluído' };
    if (p.aulasConcluidas > 0) return { chave: 'cursando', rotulo: 'Cursando' };
    if (!p.aulasTotal) return { chave: 'em-breve', rotulo: 'Em breve' };
    return { chave: 'nao-iniciado', rotulo: 'Não iniciado' };
  }
  const TOM = { concluido: 'sucesso', aprovado: 'sucesso', cursando: 'info', 'em-recuperacao': 'aviso', reprovado: 'erro' };
  function marcador(sit) {
    const tom = TOM[sit.chave] || 'neutro';
    const glifo = tom === 'sucesso' ? ic('estadoSucesso', 'check') : H`<span aria-hidden="true">${tom === 'info' ? '◐' : tom === 'aviso' ? '▲' : tom === 'erro' ? '◆' : '○'}</span>`;
    return H`<span class="pf-estado pf-est-estado pf-est-estado--${tom}">${glifo} ${sit.rotulo}</span>`;
  }
  function capa(curso) {
    const src = curso.capaVerticalUrl || curso.capaUrl;
    const url = src && typeof window.DMC_capaSrc === 'function' ? window.DMC_capaSrc({ capaUrl: src }) : src;
    if (url) return H`<img class="pf-est-capa-img" src="${url}" alt="" loading="lazy" decoding="async" width="400" height="600">`;
    return H`<span class="pf-est-capa-tipo" aria-hidden="true">${curso.titulo}</span>`;
  }
  function urlContinuar(i) {
    const c = i.continuar;
    if (c && c.moduloId && c.chave) return `aula.html?curso=${enc(i.curso.id)}&modulo=${enc(c.moduloId)}&item=${enc(c.chave)}`;
    return `aula.html?curso=${enc(i.curso.id)}`;
  }

  const S = { itens: [], filtro: 'todos' };

  function filtrar(itens, filtro) {
    if (filtro === 'concluidos') return itens.filter((i) => completo(i) || i.situacao === 'aprovado' || i.situacao === 'concluido');
    if (filtro === 'andamento') return itens.filter((i) => !(completo(i) || i.situacao === 'aprovado' || i.situacao === 'concluido'));
    return itens;
  }

  function desenharFiltros() {
    const alvo = document.querySelector('[data-meus-filtros]');
    if (!S.itens.length) { alvo.replaceChildren(); return; } // a reserva de altura fica (sem salto)
    alvo.innerHTML = H`<div class="pf-est-segmento" role="group" aria-label="Mostrar">${FILTROS.map((f) => H`<button type="button" data-filtro="${f.valor}" aria-pressed="${S.filtro === f.valor ? 'true' : 'false'}">${f.rotulo} (${filtrar(S.itens, f.valor).length})</button>`)}</div>`;
  }

  function desenharLista() {
    const lista = document.getElementById('meus-cursos-lista');
    if (!S.itens.length) {
      lista.innerHTML = H`<div class="pf-vazio pf-est-vazio">
        <p class="pf-est-vazio__titulo">Você ainda não tem um curso liberado.</p>
        <p>Quando sua matrícula for confirmada, o curso aparece aqui.</p>
        <div class="pf-est-vazio__acoes"><a class="dmc-btn dmc-btn--primary" href="loja.html">Ver cursos disponíveis</a></div></div>`;
      return;
    }
    const itens = filtrar(S.itens, S.filtro);
    if (!itens.length) {
      lista.innerHTML = H`<p class="pf-est-pendencias__nada">${S.filtro === 'concluidos' ? 'Nenhum curso concluído ainda.' : 'Nenhum curso em andamento.'}</p>`;
      return;
    }
    lista.innerHTML = H`<ul class="pf-est-capas" role="list">${itens.map((i) => {
      const p = i.progresso || {};
      return H`<li class="pf-est-capa" data-curso="${i.curso.id}">
        <span class="pf-capa pf-est-capa__figura">${capa(i.curso)}</span>
        <h2 class="pf-est-capa__titulo">${i.curso.titulo}</h2>
        ${i.curso.nivelRotulo ? H`<p class="pf-est-capa__nivel">${i.curso.nivelRotulo}</p>` : ''}
        ${marcador(situacao(i))}
        <span class="pf-est-capa__pct">${barra(p.pct, `Progresso de ${i.curso.titulo}`)}<span>${p.pct == null ? '—' : `${p.pct}% · ${p.aulasConcluidas} de ${p.aulasTotal} aulas`}</span></span>
        <a class="pf-est-capa__acao" href="${urlContinuar(i)}" data-continuar="${i.curso.id}">${completo(i) ? 'Rever aulas' : 'Continuar'}<span class="dmc-sr-only">: ${i.curso.titulo}</span></a>
      </li>`;
    })}</ul>`;
  }

  async function boot(ctx) {
    const lista = document.getElementById('meus-cursos-lista');
    lista.setAttribute('aria-busy', 'true');
    try {
      const dados = await window.DMC_Estudos.meusCursos();
      S.itens = dados.itens || [];
    } catch (err) {
      if (err && err.status === 401) throw err;
      UI.erroCarga(lista, err, { tentarDeNovo: () => window.location.reload() });
      return;
    }
    const pedido = ctx.params.get('filtro');
    S.filtro = FILTROS.some((f) => f.valor === pedido) ? pedido : 'todos';
    desenharFiltros();
    desenharLista();
    lista.setAttribute('aria-busy', 'false');

    document.querySelector('[data-meus-filtros]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filtro]');
      if (!b) return;
      S.filtro = b.dataset.filtro;
      desenharFiltros();
      desenharLista();
      const novo = document.querySelector(`[data-filtro="${S.filtro}"]`);
      if (novo) novo.focus();
    });
    // "Continuar" guarda o curso escolhido (o Início e o player abrem nele).
    lista.addEventListener('click', (e) => {
      const a = e.target.closest('[data-continuar]');
      if (a && window.DMC_Data) window.DMC_Data.setCursoEscolhido(a.dataset.continuar);
    });
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'meus-cursos', catalogo: true });
})();
