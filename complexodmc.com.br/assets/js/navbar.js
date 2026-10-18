/* ============================================================
   COMPLEXO DMC — <dmc-navbar> (direção C)
   Carregado por todas as páginas (home, pages/*, solucoes/**).

   Raiz do site, em ordem de preferência:
     1. data-root no <html> ou <body> (relativo à página: "./", "../")
     2. o endereço do próprio script (…/assets/js/navbar.js → raiz)
     3. legado: profundidade pelo pathname (/pages/, /solucoes/)
   Assim uma pasta nova não quebra o menu, e páginas que ainda não
   declaram data-root continuam funcionando.

   A home é linkada como a raiz ("../", "../#contact"), nunca como
   "index.html": em produção /index.html é 301 → / (vercel.json). Só em
   file:// (sem servidor) o link leva a index.html, senão abriria a pasta.

   Barra (≥1200): Eixos ▾ · Sobre · Treinamentos · Parcerias ▾ ·
   Tecnologia | Acessar ▾ · CTA dourado. Abaixo de 1200 a gaveta assume
   (o CTA continua na barra a partir de 768). A altura de 72px segue
   valendo desde 1024 (--header-h-lg), que é o que os heróis compensam.

   Painéis (Eixos, Parcerias, Acessar): cada um fica no DOM logo depois
   do botão, dentro do mesmo <li>, para que Tab entre nele após
   Enter/Espaço e Shift+Tab volte ao botão. ↓/↑ abrem focando o
   primeiro/último item; dentro do painel ↓/↑/Home/End percorrem os
   itens; Esc fecha e devolve o foco; clique fora e perda de foco fecham.

   Acessar: só destinos reais. Plataforma sem URL confirmada não ganha
   login — aponta para a apresentação dela em pages/tecnologia.html.

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
  var VERSION = '3';
  var ADTECH = 'https://adtech-app.complexodmc.com.br';
  var WIDE = '(min-width: 1200px)';
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

  // Central de Parcerias (pastas com index.html; ver dir()).
  var PARCERIAS = [
    { nome: 'Visão geral', sub: 'Central de Parcerias DMC', href: 'parcerias/' },
    { nome: 'Advogados Parceiros', sub: 'Partner Lawyers', href: 'parcerias/advogados-parceiros/' },
    { nome: 'Agente Prospector', sub: 'Business Partner', href: 'parcerias/business-partner/' }
  ];

  // Portal digital (Acessar). `entrar` = há login real; sem ele, o item
  // leva à apresentação institucional e mostra o estágio.
  // Grafias conforme o CEO; validação contra ativos de marca pendente
  // (docs/dmc/DECISIONS.md, T7).
  var PLATAFORMAS = [
    { id: 'school', nome: 'DMC Business School', desc: 'Cursos e treinamentos', href: 'plataforma-ead/login.html', entrar: true },
    { id: 'adtech', nome: 'ADTECH', desc: 'Gestão jurídica e notarial', href: ADTECH, externo: true, entrar: true },
    { id: 'artheu', nome: 'Artheu IA', desc: 'Inteligência artificial', href: 'pages/tecnologia.html#artheu' },
    { id: 'bloadhound', nome: 'Bloadhound', desc: 'Fintech de protestos', href: 'pages/tecnologia.html#bloadhound' }
  ];

  var ICON = {
    chevron: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    arrow: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    arrowUp: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    close: '<svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="m4 4 10 10M14 4 4 14" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    // Marcas do portal: traço único 1.4, sem preenchimento.
    school: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m2.5 9 9.5-4.5L21.5 9 12 13.5z M6.5 11v4.6c1.4 1.3 3.3 2 5.5 2s4.1-.7 5.5-2V11 M21.5 9v5.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    adtech: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 3.5h8l4 4v13H6z M14 3.5v4h4 M9 12h6 M9 15.5h6 M9 19h3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    artheu: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="4.5" cy="6" r="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="19.5" cy="6" r="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="4.5" cy="18" r="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="19.5" cy="18" r="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m5.9 7 4.2 3.4m3.8 0L18.1 7M5.9 17l4.2-3.4m3.8 0 4.2 3.4M6.1 6h11.8" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".7"/></svg>',
    bloadhound: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 3.5h9.5v8 M5 3.5v17h6.5 M8 8h4 M8 11.5h3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="16" cy="16" r="3.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m18.6 18.6 2.9 2.9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'
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
    // Pasta servida pelo index.html. Sem servidor (file://) a pasta abriria
    // a listagem, então só aí o link aponta para o arquivo.
    var dir = function (path) { return r + path + (location.protocol === 'file:' ? 'index.html' : ''); };
    var here = function (href) {
      try {
        var u = new URL(href, location.href);
        return u.origin === location.origin && !u.hash &&
          u.pathname.replace(/index\.html$/, '') === location.pathname.replace(/index\.html$/, '');
      } catch (e) { return false; }
    };
    // aria-current na página aberta (compara o caminho resolvido com o atual)
    var cur = function (href) { return here(href) ? ' aria-current="page"' : ''; };
    var emParcerias = location.pathname.indexOf(r + 'parcerias/') === 0;
    var brand = '<a class="dmc-brand" href="' + (o.isHome ? '#hero' : o.home) + '" aria-label="Complexo DMC, página inicial">' +
      '<img src="' + r + 'assets/images/rino-marca.webp" alt="" width="50" height="22" decoding="async">' +
      '<span aria-hidden="true">COMPLEXO <b>DMC</b></span></a>';

    var plataforma = function (p) {
      var href = p.externo ? p.href : r + p.href;
      var tag = p.entrar
        ? '<span class="dmc-portal__tag">Entrar ' + ICON.arrowUp + '</span>'
        : '<span class="dmc-portal__tag dmc-portal__tag--soon">Em estruturação</span>';
      return '<li class="dmc-portal__item dmc-portal__item--' + p.id + '"><a href="' + href + '"' + (p.externo ? ' rel="noopener"' : '') + cur(href) + '>' +
        '<span class="dmc-portal__icon">' + ICON[p.id] + '</span>' +
        '<span class="dmc-portal__text"><b>' + esc(p.nome) + '</b><small>' + esc(p.desc) + '</small></span>' + tag + '</a></li>';
    };
    var access = PLATAFORMAS.map(plataforma).join('');
    var parceria = function (p, i) {
      var href = dir(p.href);
      return '<li><a href="' + href + '"' + cur(href) + '><span class="dmc-sub__num">' + (i ? '0' + i : '—') + '</span>' +
        '<span class="dmc-sub__text"><b>' + esc(p.nome) + '</b><small>' + esc(p.sub) + '</small></span></a></li>';
    };
    var parcerias = PARCERIAS.map(parceria).join('');
    var cta = function (cls) {
      return '<a class="dmc-btn dmc-nav__cta ' + cls + '" href="' + h('#contact') + '">Converse com nossos especialistas ' + ICON.arrowUp + '</a>';
    };
    var skip = o.skipTarget ? '<a class="dmc-skip" href="#' + o.skipTarget + '">Pular para o conteúdo</a>' : '';
    // Painel dos eixos: vai dentro do <li> do botão (ordem do DOM = ordem do Tab).
    // position:absolute em relação ao header fixo, como antes.
    var mega =
      '<div class="dmc-mega" id="dmc-mega" hidden>' +
        '<div class="dmc-wrap">' +
          '<ul class="dmc-mega__grid" aria-label="Os seis eixos">' + EIXOS.map(function (e) { return eixoItem(e, r, 'span'); }).join('') + '</ul>' +
          '<div class="dmc-mega__foot"><p>Seis eixos sob uma governança, com parceiros habilitados para atos privativos.</p>' +
            '<a class="dmc-btn dmc-btn--link" href="' + h('#features') + '">Ver os seis eixos na página inicial</a></div>' +
        '</div>' +
      '</div>';
    var tecnologia = r + 'pages/tecnologia.html';

    return skip +
      '<header class="dmc-nav' + (o.over ? ' dmc-nav--over' : '') + '" id="navbar">' +
        '<div class="dmc-wrap dmc-nav__bar">' + brand +
          '<nav class="dmc-nav__menu" aria-label="Principal"><ul class="dmc-nav__links">' +
            '<li><button class="dmc-nav__trigger" type="button" aria-expanded="false" aria-controls="dmc-mega" data-dmc="mega">Eixos ' + ICON.chevron + '</button>' + mega + '</li>' +
            '<li><a class="dmc-nav__link" href="' + r + 'pages/sobre.html"' + cur(r + 'pages/sobre.html') + '>Sobre</a></li>' +
            '<li><a class="dmc-nav__link" href="' + h('#treinamentos') + '">Treinamentos</a></li>' +
            '<li class="dmc-sub"><button class="dmc-nav__trigger' + (emParcerias ? ' is-current' : '') + '" type="button" aria-expanded="false" aria-controls="dmc-sub-parcerias" data-dmc="parcerias">Parcerias ' + ICON.chevron + '</button>' +
              '<ul class="dmc-sub__menu" id="dmc-sub-parcerias" hidden>' + parcerias + '</ul></li>' +
            '<li><a class="dmc-nav__link" href="' + tecnologia + '"' + cur(tecnologia) + '>Tecnologia</a></li>' +
          '</ul></nav>' +
          '<div class="dmc-nav__side">' +
            '<div class="dmc-access">' +
              '<button class="dmc-nav__trigger" type="button" aria-expanded="false" aria-controls="dmc-access-menu" data-dmc="access">Acessar ' + ICON.chevron + '</button>' +
              '<div class="dmc-portal" id="dmc-access-menu" hidden>' +
                '<p class="dmc-portal__head">Portal digital DMC</p>' +
                '<ul class="dmc-portal__grid" aria-label="Plataformas do Complexo DMC">' + access + '</ul>' +
                '<a class="dmc-portal__foot" href="' + tecnologia + '#portal">Conheça o ecossistema tecnológico ' + ICON.arrow + '</a>' +
              '</div>' +
            '</div>' +
            cta('dmc-nav__cta--bar') +
          '</div>' +
          '<button class="dmc-nav__toggle" type="button" aria-expanded="false" aria-controls="dmc-drawer" aria-haspopup="dialog">Menu <i aria-hidden="true"></i></button>' +
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
            '<li><a href="' + r + 'pages/sobre.html"' + cur(r + 'pages/sobre.html') + '>Sobre</a></li>' +
            '<li><a href="' + h('#treinamentos') + '">Treinamentos</a></li>' +
            '<li><button class="dmc-drawer__acc" type="button" aria-expanded="' + emParcerias + '" aria-controls="dmc-drawer-parcerias">Parcerias ' + ICON.chevron + '</button>' +
              '<ul class="dmc-drawer__sub" id="dmc-drawer-parcerias"' + (emParcerias ? '' : ' hidden') + '>' + parcerias + '</ul></li>' +
            '<li><a href="' + tecnologia + '"' + cur(tecnologia) + '>Tecnologia</a></li>' +
          '</ul>' +
          cta('dmc-nav__cta--drawer') +
          '<div class="dmc-drawer__group"><p class="dmc-overline">Acessar · Portal digital DMC</p><ul class="dmc-portal__grid">' + access + '</ul></div>' +
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
          if (focusFirst) {
            var list = focusables(panel);
            var f = focusFirst === 'last' ? list[list.length - 1] : list[0];
            if (f) f.focus();
          }
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
        else if (e.key === 'ArrowUp') { e.preventDefault(); api.open('last'); }
      });
      panel.addEventListener('keydown', function (e) {
        var k = e.key;
        if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'Home' && k !== 'End') return;
        var list = focusables(panel);
        if (!list.length) return;
        var i = list.indexOf(document.activeElement);
        var n = list.length;
        var next = k === 'Home' ? 0 : k === 'End' ? n - 1 : k === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n;
        e.preventDefault();
        list[next].focus();
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
    var subBtn = host.querySelector('[data-dmc="parcerias"]');
    var accessBtn = host.querySelector('[data-dmc="access"]');
    if (megaBtn) makePanel(megaBtn, host.querySelector('#dmc-mega'), true);
    if (subBtn) makePanel(subBtn, host.querySelector('#dmc-sub-parcerias'), false);
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
    // Acordeões da gaveta (Eixos, Parcerias): cada botão abre a lista de aria-controls.
    Array.prototype.forEach.call(host.querySelectorAll('.dmc-drawer__acc'), function (acc) {
      var list = host.querySelector('#' + acc.getAttribute('aria-controls'));
      if (!list) return;
      acc.addEventListener('click', function () {
        var open = acc.getAttribute('aria-expanded') !== 'true';
        acc.setAttribute('aria-expanded', String(open));
        list.hidden = !open;
      });
    });

    var wide = window.matchMedia(WIDE);
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
      // Home = raiz (em produção /index.html é 301 → /). Em file:// a raiz
      // abriria a pasta, então só aí o link aponta para index.html.
      home: root + (isHome || location.protocol !== 'file:' ? '' : 'index.html'),
      isHome: isHome,
      over: this.hasAttribute('data-over'),
      skipTarget: skipTarget
    });
    bind(this);
    }
  }

  customElements.define('dmc-navbar', DMCNavbar);
})();
