/* ============================================================
   COMPLEXO DMC — <dmc-navbar> (direção C)
   Carregado por todas as páginas (home, pages/*, solucoes/**).

   Raiz do site, em ordem de preferência:
     1. data-root no <html> ou <body> (relativo à página: "./", "../")
     2. o endereço do próprio script (…/assets/js/navbar.js → raiz)
     3. legado: profundidade pelo pathname (/pages/, /solucoes/)
   Assim uma pasta nova não quebra o menu, e páginas que ainda não
   declaram data-root continuam funcionando.

   Estilo: assets/css/components.css (+ tokens.css). Página que ainda
   não os declara recebe os dois injetados aqui — tokens ANTES do CSS
   legado (o legado vence nos nomes repetidos), components depois.

   Atributos: <dmc-navbar data-over> = barra transparente sobre o herói
   até 24px de rolagem (home).
   ============================================================ */
(function () {
  'use strict';

  if (window.customElements && customElements.get('dmc-navbar')) return;

  var SCRIPT = document.currentScript;
  var VERSION = '2';
  var ADTECH = 'https://adtech-app.complexodmc.com.br';
  var FONTS = 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400..600&family=Newsreader:ital,opsz,wght@0,48,300;1,48,300&display=swap';

  // Os seis eixos: nome, frase de escopo (docs/dmc/EIXOS-COPY.md) e página
  // principal (relativa à raiz).
  var EIXOS = [
    { n: 1, slug: 'patrimonial', nome: 'Planejamento Patrimonial e Sucessório', href: 'pages/planejamento-sucessorio.html',
      escopo: 'Sucessão, holding e proteção do patrimônio familiar.' },
    { n: 2, slug: 'fiscal', nome: 'Tributário, Fiscal e Corporativo', href: 'pages/planejamento-tributario.html',
      escopo: 'Regime, créditos, estrutura societária e integridade.' },
    { n: 3, slug: 'imobiliario', nome: 'Direito Notarial e Imobiliário', href: 'pages/consultoria-imobiliaria.html',
      escopo: 'Do terreno ao registro de cada unidade.' },
    { n: 4, slug: 'auditoria', nome: 'Auditoria Empresarial e Contábil', href: 'pages/contabilidade.html',
      escopo: 'Demonstrações revisadas e controles internos testados.' },
    { n: 5, slug: 'ativos', nome: 'Recuperação de Ativos', href: 'pages/recuperacao-ativos.html',
      escopo: 'Rastreio patrimonial e execução de créditos.' },
    { n: 6, slug: 'trabalhista', nome: 'Consultoria Trabalhista', href: 'solucoes/consultoria-trabalhista/ciclo-fechado.html',
      escopo: 'Do contrato à quitação anual do passivo.' }
  ];

  var ICON = {
    chevron: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    arrow: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    close: '<svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="m4 4 10 10M14 4 4 14" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
  };

  function resolveRoot() {
    var de = document.documentElement;
    var attr = de.getAttribute('data-root');
    if (attr === null && document.body) attr = document.body.getAttribute('data-root');
    try {
      if (attr !== null) return new URL(attr || './', location.href);
      if (SCRIPT && SCRIPT.src) return new URL('../../', SCRIPT.src);
    } catch (e) { /* cai no legado */ }
    var p = location.pathname;
    var depth = p.indexOf('/solucoes/') > -1 ? '../../' : p.indexOf('/pages/') > -1 ? '../' : './';
    return new URL(depth, location.href);
  }

  function ensureStyles(root, host) {
    var head = document.head;
    var pending = 0;
    function has(part) { return !!document.querySelector('link[rel~="stylesheet"][href*="' + part + '"]'); }
    function link(href) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      return l;
    }
    function done() {
      pending -= 1;
      if (pending <= 0) host.style.visibility = '';
    }
    function watch(l) {
      pending += 1;
      l.addEventListener('load', done);
      l.addEventListener('error', done);
    }
    if (!has('tokens.css')) {
      var t = link(root + 'assets/css/tokens.css?v=1');
      watch(t);
      head.insertBefore(t, head.firstChild);
    }
    if (!document.querySelector('link[href*="Hanken+Grotesk"]')) {
      head.appendChild(link(FONTS));
    }
    if (!has('components.css')) {
      var c = link(root + 'assets/css/components.css?v=' + VERSION);
      watch(c);
      head.appendChild(c);
    }
    if (pending) {
      // Sem o CSS a barra apareceria crua por um instante.
      host.style.visibility = 'hidden';
      setTimeout(function () { host.style.visibility = ''; }, 3000);
    }
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function eixoItem(e, root, tag) {
    return '<li class="dmc-mega__item np-pillar-' + e.slug + '"><a href="' + root + e.href + '">' +
      '<span class="dmc-mega__num">E' + e.n + '</span>' +
      '<' + tag + ' class="dmc-mega__name">' + esc(e.nome) + '</' + tag + '>' +
      '<span class="dmc-mega__scope">' + esc(e.escopo) + '</span></a></li>';
  }

  function template(o) {
    var r = o.root;
    var h = function (hash) { return o.isHome ? hash : o.home + hash; };
    var brand = '<a class="dmc-brand" href="' + (o.isHome ? '#hero' : o.home) + '" aria-label="Complexo DMC, página inicial">' +
      '<img src="' + r + 'assets/images/rino-marca.webp" alt="" width="50" height="22" decoding="async">' +
      '<span aria-hidden="true">COMPLEXO <b>DMC</b></span></a>';
    var access =
      '<li><a href="' + r + 'plataforma-ead/login.html"><b>Área do aluno</b><small>Plataforma de cursos</small></a></li>' +
      '<li><a href="' + ADTECH + '" rel="noopener"><b>Ad-tech</b><small>Documentos e prazos do caso</small></a></li>';
    var skip = o.skipTarget ? '<a class="dmc-skip" href="#' + o.skipTarget + '">Pular para o conteúdo</a>' : '';

    return skip +
      '<header class="dmc-nav' + (o.over ? ' dmc-nav--over' : '') + '" id="navbar">' +
        '<div class="dmc-wrap dmc-nav__bar">' + brand +
          '<nav class="dmc-nav__menu" aria-label="Principal"><ul class="dmc-nav__links">' +
            '<li><button class="dmc-nav__trigger" type="button" aria-expanded="false" aria-controls="dmc-mega" data-dmc="mega">Eixos ' + ICON.chevron + '</button></li>' +
            '<li><a class="dmc-nav__link" href="' + h('#conheca') + '">A casa</a></li>' +
            '<li><a class="dmc-nav__link" href="' + h('#treinamentos') + '">Treinamentos</a></li>' +
          '</ul></nav>' +
          '<div class="dmc-nav__side">' +
            '<div class="dmc-access">' +
              '<button class="dmc-nav__trigger" type="button" aria-expanded="false" aria-controls="dmc-access-menu" data-dmc="access">Acessar ' + ICON.chevron + '</button>' +
              '<ul class="dmc-access__menu" id="dmc-access-menu" hidden>' + access + '</ul>' +
            '</div>' +
            '<a class="dmc-btn dmc-btn--secondary" href="' + h('#contact') + '">Converse com nossos especialistas</a>' +
          '</div>' +
          '<button class="dmc-nav__toggle" type="button" aria-expanded="false" aria-controls="dmc-drawer" aria-haspopup="dialog">Menu <i aria-hidden="true"></i></button>' +
        '</div>' +
        '<div class="dmc-mega" id="dmc-mega" hidden>' +
          '<div class="dmc-wrap">' +
            '<ul class="dmc-mega__grid" aria-label="Os seis eixos">' + EIXOS.map(function (e) { return eixoItem(e, r, 'span'); }).join('') + '</ul>' +
            '<div class="dmc-mega__foot"><p>Seis eixos sob uma governança, com parceiros habilitados para atos privativos.</p>' +
              '<a class="dmc-btn dmc-btn--link" href="' + h('#features') + '">Ver os seis eixos na página inicial</a></div>' +
          '</div>' +
        '</div>' +
      '</header>' +
      '<div class="dmc-drawer" id="dmc-drawer" role="dialog" aria-modal="true" aria-label="Menu" hidden>' +
        '<div class="dmc-wrap dmc-drawer__head">' + brand +
          '<button class="dmc-drawer__close" type="button">Fechar ' + ICON.close + '</button>' +
        '</div>' +
        '<div class="dmc-wrap dmc-drawer__body">' +
          '<ul class="dmc-drawer__list">' +
            '<li><button class="dmc-drawer__acc" type="button" aria-expanded="false" aria-controls="dmc-drawer-eixos">Eixos ' + ICON.chevron + '</button>' +
              '<ul class="dmc-drawer__axes" id="dmc-drawer-eixos" hidden>' + EIXOS.map(function (e) { return eixoItem(e, r, 'span'); }).join('') + '</ul></li>' +
            '<li><a href="' + h('#conheca') + '">A casa</a></li>' +
            '<li><a href="' + h('#treinamentos') + '">Treinamentos</a></li>' +
          '</ul>' +
          '<div class="dmc-drawer__group"><p class="dmc-overline">Acessar</p><ul>' + access + '</ul></div>' +
          '<a class="dmc-btn dmc-btn--primary dmc-drawer__cta" href="' + h('#contact') + '">Converse com nossos especialistas ' + ICON.arrow + '</a>' +
        '</div>' +
      '</div>';
  }

  function focusables(el) {
    return Array.prototype.filter.call(
      el.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      function (n) { return n.getClientRects().length > 0; }
    );
  }

  function enter(el) {
    el.classList.remove('is-entering');
    void el.offsetWidth;
    el.classList.add('is-entering');
    el.addEventListener('animationend', function off() {
      el.classList.remove('is-entering');
      el.removeEventListener('animationend', off);
    });
  }

  function bind(host) {
    var header = host.querySelector('.dmc-nav');
    var doc = document.documentElement;

    // ---------- Estado de rolagem ----------
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        header.classList.toggle('is-scrolled', window.scrollY > 24);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ---------- Painéis do desktop: mega-menu e Acessar ----------
    var panels = [];
    function makePanel(btn, panel, isMega) {
      var api = {
        open: function (focusFirst) {
          panels.forEach(function (p) { if (p !== api) p.close(false); });
          panel.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
          if (isMega) header.classList.add('is-open');
          enter(panel);
          if (focusFirst) { var f = focusables(panel)[0]; if (f) f.focus(); }
        },
        close: function (returnFocus) {
          if (panel.hidden) return;
          panel.hidden = true;
          btn.setAttribute('aria-expanded', 'false');
          if (isMega) header.classList.remove('is-open');
          if (returnFocus) btn.focus();
        },
        isOpen: function () { return !panel.hidden; },
        contains: function (t) { return btn.contains(t) || panel.contains(t); }
      };
      btn.addEventListener('click', function () { api.isOpen() ? api.close(false) : api.open(false); });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); api.open(true); }
      });
      function onFocusOut(e) {
        // Só fecha quando o foco vai para fora (teclado). Clique fora é
        // tratado no pointerdown do documento.
        if (e.relatedTarget && !api.contains(e.relatedTarget)) api.close(false);
      }
      btn.addEventListener('focusout', onFocusOut);
      panel.addEventListener('focusout', onFocusOut);
      panel.addEventListener('click', function (e) { if (e.target.closest('a')) api.close(false); });
      panels.push(api);
      return api;
    }
    var megaBtn = host.querySelector('[data-dmc="mega"]');
    var accessBtn = host.querySelector('[data-dmc="access"]');
    if (megaBtn) makePanel(megaBtn, host.querySelector('#dmc-mega'), true);
    if (accessBtn) makePanel(accessBtn, host.querySelector('#dmc-access-menu'), false);

    document.addEventListener('pointerdown', function (e) {
      panels.forEach(function (p) { if (p.isOpen() && !p.contains(e.target)) p.close(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      panels.forEach(function (p) { if (p.isOpen()) p.close(true); });
    });

    // ---------- Gaveta mobile ----------
    var toggle = host.querySelector('.dmc-nav__toggle');
    var drawer = host.querySelector('#dmc-drawer');
    var closeBtn = host.querySelector('.dmc-drawer__close');

    function openDrawer() {
      drawer.hidden = false;
      enter(drawer);
      doc.classList.add('dmc-lock');
      toggle.setAttribute('aria-expanded', 'true');
      closeBtn.focus();
    }
    function closeDrawer(returnFocus) {
      if (drawer.hidden) return;
      drawer.hidden = true;
      doc.classList.remove('dmc-lock');
      toggle.setAttribute('aria-expanded', 'false');
      if (returnFocus) toggle.focus();
    }
    toggle.addEventListener('click', openDrawer);
    closeBtn.addEventListener('click', function () { closeDrawer(true); });
    drawer.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeDrawer(true); return; }
      if (e.key !== 'Tab') return;
      var list = focusables(drawer);
      if (!list.length) return;
      var first = list[0];
      var last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a[href]')) closeDrawer(false);
    });
    var acc = host.querySelector('.dmc-drawer__acc');
    var accList = host.querySelector('#dmc-drawer-eixos');
    acc.addEventListener('click', function () {
      var open = acc.getAttribute('aria-expanded') !== 'true';
      acc.setAttribute('aria-expanded', String(open));
      accList.hidden = !open;
    });

    var wide = window.matchMedia('(min-width: 1024px)');
    var onWide = function () {
      if (wide.matches) closeDrawer(false);
      else panels.forEach(function (p) { p.close(false); });
    };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
    else if (wide.addListener) wide.addListener(onWide);
  }

  var ROOT = resolveRoot();

  class DMCNavbar extends HTMLElement {
    connectedCallback() {
      if (this.__dmcReady) return;
      this.__dmcReady = true;

      var root = ROOT.pathname;
      var here = location.pathname;
      var isHome = here === root || here === root + 'index.html';

      // Alvo do "pular para o conteúdo": #conteudo, ou o <main> da página.
      var skipTarget = '';
      if (document.getElementById('conteudo')) skipTarget = 'conteudo';
      else {
        var main = document.querySelector('main');
        if (main) { if (!main.id) main.id = 'conteudo'; skipTarget = main.id; }
    }

    ensureStyles(root, this);
    this.innerHTML = template({
      root: root,
      home: root + (isHome ? '' : 'index.html'),
      isHome: isHome,
      over: this.hasAttribute('data-over'),
      skipTarget: skipTarget
    });
    bind(this);
    }
  }

  customElements.define('dmc-navbar', DMCNavbar);
})();
