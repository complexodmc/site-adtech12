/* ============================================================
   COMPLEXO DMC — Página "Sobre": abas dos seis eixos
   Sem JS: a faixa .sb-abas é uma lista de âncoras e os seis
   painéis .sb-eixo aparecem empilhados. Com JS a faixa vira
   tablist (setas, Home, End, tabindex móvel) e só o eixo ativo
   fica visível. #sb-eixo-N no endereço abre o eixo direto.
   ============================================================ */
(function () {
  'use strict';

  var raiz = document.querySelector('[data-sb-eixos]');
  if (!raiz) return;
  var lista = raiz.querySelector('.sb-abas__lista');
  var abas = Array.prototype.slice.call(raiz.querySelectorAll('.sb-aba'));
  var paineis = abas.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
  if (!lista || !abas.length || paineis.some(function (p) { return !p; })) return;

  raiz.classList.add('js-abas');
  lista.setAttribute('role', 'tablist');
  lista.setAttribute('aria-label', 'Os seis eixos');
  Array.prototype.forEach.call(lista.children, function (li) { li.setAttribute('role', 'presentation'); });

  abas.forEach(function (a, i) {
    a.id = a.id || 'sb-aba-' + (i + 1);
    a.setAttribute('role', 'tab');
    a.setAttribute('aria-controls', paineis[i].id);
    paineis[i].setAttribute('role', 'tabpanel');
    paineis[i].setAttribute('aria-labelledby', a.id);
    paineis[i].tabIndex = 0;
  });

  var atual = -1;
  function seleciona(i, opcoes) {
    var o = opcoes || {};
    if (i === atual) { if (o.foco) abas[i].focus(); return; }
    abas.forEach(function (a, k) {
      var on = k === i;
      a.setAttribute('aria-selected', on ? 'true' : 'false');
      a.tabIndex = on ? 0 : -1;
      paineis[k].hidden = !on;
    });
    if (atual !== -1) {
      var p = paineis[i];
      p.classList.remove('is-entering');
      void p.offsetWidth;
      p.classList.add('is-entering');
    }
    atual = i;
    if (o.foco) abas[i].focus();
    if (o.hash && window.history && history.replaceState) history.replaceState(null, '', '#' + paineis[i].id);
  }

  abas.forEach(function (a, i) {
    a.addEventListener('click', function (e) { e.preventDefault(); seleciona(i, { hash: true }); });
    a.addEventListener('keydown', function (e) {
      var alvo = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') alvo = (i + 1) % abas.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') alvo = (i - 1 + abas.length) % abas.length;
      else if (e.key === 'Home') alvo = 0;
      else if (e.key === 'End') alvo = abas.length - 1;
      if (alvo === null) return;
      e.preventDefault();
      seleciona(alvo, { foco: true, hash: true });
    });
  });
  paineis.forEach(function (p) {
    p.addEventListener('animationend', function () { p.classList.remove('is-entering'); });
  });

  function peloEndereco() {
    var i = paineis.findIndex(function (p) { return '#' + p.id === location.hash; });
    return i;
  }
  var inicial = peloEndereco();
  seleciona(inicial === -1 ? 0 : inicial);
  if (inicial !== -1) raiz.scrollIntoView();
  window.addEventListener('hashchange', function () {
    var i = peloEndereco();
    if (i !== -1) seleciona(i);
  });
})();
