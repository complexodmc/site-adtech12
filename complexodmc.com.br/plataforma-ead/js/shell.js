// =============================================================
// COMPLEXO DMC · PLATAFORMA — shell de navegação do aluno
// Injeta a barra superior e o menu lateral em qualquer página que
// declare <body data-shell="<chave-do-item-ativo>">. Fica fora do
// app.js de propósito: é markup repetido em 6 páginas, e duplicar
// isso no HTML garantiria que uma delas ficasse pra trás na próxima
// mudança de menu.
// =============================================================
(function () {
  'use strict';

  const ITENS = [
    { chave: 'conteudos',    label: 'Conteúdos',     href: 'dashboard.html',    icone: 'navConteudos' },
    { chave: 'meus-cursos',  label: 'Meus Cursos',   href: 'meus-cursos.html',  icone: 'navMeusCursos' },
    { chave: 'ao-vivo',      label: 'Aulas ao Vivo', href: 'ao-vivo.html',      icone: 'navAoVivo' },
    { chave: 'certificados', label: 'Certificados',  href: 'certificados.html', icone: 'navCertificados' },
    { chave: 'loja',         label: 'Loja',          href: 'loja.html',         icone: 'navLoja' }
  ];

  const STORAGE_RECOLHIDO = 'dmc:menuRecolhido';

  const esc = s => window.DMC_escapeHtml(s);

  function lerRecolhido() {
    try { return localStorage.getItem(STORAGE_RECOLHIDO) === '1'; }
    catch { return false; }
  }
  function gravarRecolhido(v) {
    try { localStorage.setItem(STORAGE_RECOLHIDO, v ? '1' : '0'); }
    catch { /* modo privado — a preferência só não persiste */ }
  }

  function montar(ativo) {
    if (document.querySelector('.shell-top')) return;   // já montado

    const I = window.DMC_Icons;
    const user = window.DMC_Auth.user();
    const isAdmin = !!(user && user.isAdmin);
    // O drawer do carrinho só existe na loja: sem ele, o botão não teria o que abrir.
    const temCarrinho = !!document.querySelector('#cart-drawer');

    const itens = ITENS.slice();
    if (isAdmin) itens.push({ chave: 'admin', label: 'Painel Admin', href: 'admin.html', icone: 'navAdmin' });

    const nav = itens.map(it => `
      <a class="shell-nav__item ${it.chave === ativo ? 'is-active' : ''}" href="${it.href}" data-nav="${it.chave}">
        <span class="shell-nav__icon">${I[it.icone]}</span>
        <span class="shell-nav__label">${esc(it.label)}</span>
      </a>`).join('');

    const html = `
      <header class="shell-top">
        <button class="shell-burger" type="button" data-shell-toggle aria-label="Abrir menu">${I.menu}</button>

        <a class="app-brand shell-brand" href="dashboard.html">
          <img src="../assets/images/RINO_logo.png" alt="Complexo DMC">
          <span class="app-brand__label">Complexo DMC</span>
        </a>

        <div class="shell-search" data-shell-search>
          <span class="shell-search__icon">${I.search}</span>
          <input type="search" class="shell-search__input" data-shell-search-input
                 placeholder="Procurar por nome de curso ou aula" autocomplete="off" aria-label="Buscar">
          <div class="shell-search__results" data-shell-search-results hidden></div>
        </div>

        <div class="shell-user">
          ${temCarrinho ? `
            <button class="btn-ghost cart-trigger" data-cart-open type="button">
              ${I.cart}<span class="shell-user__hide-sm">Carrinho</span>
              <span class="cart-badge is-empty" data-cart-count>0</span>
            </button>` : ''}
          <span class="shell-user__nome" data-user-nome></span>
          <span class="user-avatar" data-user-iniciais></span>
          <button class="btn-ghost" data-logout>Sair</button>
        </div>
      </header>

      <aside class="shell-side" data-shell-side>
        <nav class="shell-nav">${nav}</nav>
        <button class="shell-collapse" type="button" data-shell-collapse>
          <span class="shell-collapse__icon">${I.chevronLeft}</span>
          <span class="shell-nav__label">Recolher menu</span>
        </button>
      </aside>

      <div class="shell-scrim" data-shell-scrim hidden></div>`;

    document.body.insertAdjacentHTML('afterbegin', html);
    document.body.classList.add('has-shell');
    if (lerRecolhido()) document.body.classList.add('menu-recolhido');

    ligarMenu();
    ligarBusca();
  }

  function ligarMenu() {
    const scrim = document.querySelector('[data-shell-scrim]');
    const abrirFechar = (aberto) => {
      document.body.classList.toggle('menu-aberto', aberto);
      if (scrim) scrim.hidden = !aberto;
    };

    document.querySelector('[data-shell-toggle]')
      ?.addEventListener('click', () => abrirFechar(!document.body.classList.contains('menu-aberto')));
    scrim?.addEventListener('click', () => abrirFechar(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') abrirFechar(false); });

    document.querySelector('[data-shell-collapse]')?.addEventListener('click', () => {
      const recolhido = document.body.classList.toggle('menu-recolhido');
      gravarRecolhido(recolhido);
    });
  }

  // ---------- Busca: curso e aula, sobre o catálogo já em memória ----------
  function ligarBusca() {
    const caixa = document.querySelector('[data-shell-search]');
    const input = document.querySelector('[data-shell-search-input]');
    const saida = document.querySelector('[data-shell-search-results]');
    if (!caixa || !input || !saida) return;

    const Data = window.DMC_Data;
    const Liberacoes = window.DMC_Liberacoes;
    const I = window.DMC_Icons;

    function fechar() { saida.hidden = true; saida.innerHTML = ''; }

    function buscar(termo) {
      const alvo = termo.trim().toLowerCase();
      if (alvo.length < 2) return null;

      const cursos = (Data.get().cursos || []);
      const achados = [];

      for (const c of cursos) {
        if ((c.titulo || '').toLowerCase().includes(alvo)) {
          achados.push({ tipo: 'curso', id: c.id, titulo: c.titulo, contexto: 'Curso', liberado: Liberacoes.has(c.id) });
        }
        for (const m of (c.modulos || [])) {
          for (const a of (m.aulas || [])) {
            if ((a.titulo || '').toLowerCase().includes(alvo)) {
              achados.push({
                tipo: 'aula', id: a.id, titulo: a.titulo,
                contexto: `${c.titulo} · Módulo ${m.numero}`,
                liberado: Liberacoes.has(c.id), cursoId: c.id
              });
            }
          }
        }
        if (achados.length >= 40) break;
      }
      return achados.slice(0, 12);
    }

    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const achados = buscar(input.value);
        if (achados === null) return fechar();

        if (!achados.length) {
          saida.innerHTML = '<p class="shell-search__vazio">Nada encontrado.</p>';
          saida.hidden = false;
          return;
        }

        saida.innerHTML = achados.map(r => `
          <button class="shell-search__item" type="button"
                  data-r-tipo="${r.tipo}" data-r-id="${esc(r.id)}" data-r-curso="${esc(r.cursoId || r.id)}"
                  data-r-liberado="${r.liberado ? '1' : '0'}">
            <span class="shell-search__item-icon">${r.tipo === 'curso' ? I.navConteudos : I.play}</span>
            <span class="shell-search__item-body">
              <span class="shell-search__item-titulo">${esc(r.titulo)}</span>
              <span class="shell-search__item-ctx">${esc(r.contexto)}</span>
            </span>
            ${r.liberado ? '' : `<span class="shell-search__item-lock">${I.lock}</span>`}
          </button>`).join('');
        saida.hidden = false;
      }, 140);
    });

    saida.addEventListener('click', e => {
      const btn = e.target.closest('[data-r-tipo]');
      if (!btn) return;
      const { rTipo, rId, rCurso, rLiberado } = btn.dataset;
      // Sem acesso, o destino útil é a loja — não a aula que ele não abre.
      if (rLiberado !== '1') { window.location.href = `loja.html?destacar=${encodeURIComponent(rCurso)}`; return; }
      if (rTipo === 'aula') { window.location.href = `aula.html?id=${encodeURIComponent(rId)}`; return; }
      Data.setCursoEscolhido(rId);
      window.location.href = 'dashboard.html';
    });

    document.addEventListener('click', e => { if (!caixa.contains(e.target)) fechar(); });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { fechar(); input.blur(); } });
  }

  window.DMC_Shell = { montar };
})();
