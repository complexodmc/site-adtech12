/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/pre-pintura.js (F0b)
   Spec: docs/dmc/PORTAL-UX.md §2.1 item 1, §2.7, §2.8, §8 (DC-06,
   DC-07, DC-30); PORTAL-ACADEMICO.md §6.4 e §7.9.

   Script SÍNCRONO e PRIMEIRO do <head>. Antes da primeira pintura:
   - <html data-pf-tema="escuro|claro">: de localStorage dmc:tema
     (escuro · claro · auto). Sem preferência ou valor inválido =
     escuro (DC-07); auto segue prefers-color-scheme e acompanha a
     troca do aparelho. Páginas públicas (validar, certificado,
     declaracao, acesso-link) nascem sempre em papel (UX §8).
   - <html data-pf-fonte="-1|0|1|2">: de dmc:fonte (DC-06; o CSS
     de portal.css converte em 93,75 · 100 · 112,5 · 125%).
   - classe pf-js no <html>.
   - os DOIS metas do modelo (color-scheme e theme-color), que vêm
     DEPOIS deste script: ajustados no momento em que o parser os
     insere (MutationObserver, antes da pintura). Nunca cria meta.
   Também acompanha a troca feita em outra aba (evento storage).

   Exposto (acréscimo para o shell, F0s, não duplicar esta regra):
     DMC_PrePintura.aplicar({ notificar = false } = {})
       → { tema, preferencia, fonte, publica }   relê e reaplica
     DMC_PrePintura.estado() → o mesmo objeto, sem reler
   Eventos em document (§7.9), só quando o valor muda e só nos casos
   que este script origina (outra aba, aparelho em auto) ou com
   notificar:true:
     dmc:tema  { tema: 'escuro'|'claro' (resolvido), preferencia }
     dmc:fonte { nivel: -1|0|1|2 }
   Sem dependência; nada de rede; falha de localStorage = padrão.
   ============================================================= */
(function () {
  'use strict';

  var doc = document;
  var raiz = doc.documentElement;
  var CHAVE_TEMA = 'dmc:tema';
  var CHAVE_FONTE = 'dmc:fonte';
  var PREFERENCIAS = ['escuro', 'claro', 'auto'];
  var NIVEIS = ['-1', '0', '1', '2'];
  var PUBLICAS = ['validar', 'certificado', 'declaracao', 'acesso-link'];
  // Valores do modelo de §6.4 (escuro) e do papel (UX §2.1 item 2).
  var METAS = {
    escuro: { esquema: 'dark', cor: '#0b0c0e' },
    claro: { esquema: 'light', cor: '#f5f3ef' }
  };

  function ler(chave) {
    try { return window.localStorage.getItem(chave); } catch (e) { return null; }
  }

  function paginaPublica() {
    var seg = String(window.location.pathname || '').split('/').pop() || '';
    seg = seg.replace(/\.html?$/i, '').toLowerCase();
    return PUBLICAS.indexOf(seg) >= 0;
  }

  var publica = paginaPublica();
  var aparelhoClaro = null;
  try {
    aparelhoClaro = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  } catch (e) { aparelhoClaro = null; }

  function preferencia() {
    var v = ler(CHAVE_TEMA);
    return PREFERENCIAS.indexOf(v) >= 0 ? v : 'escuro';
  }

  function resolver(pref) {
    if (publica) return 'claro';
    if (pref === 'auto') return aparelhoClaro && aparelhoClaro.matches ? 'claro' : 'escuro';
    return pref;
  }

  function nivel() {
    var v = ler(CHAVE_FONTE);
    return NIVEIS.indexOf(v) >= 0 ? v : '0';
  }

  var atual = null;

  function ajustarMeta(el) {
    if (!atual || !el || el.nodeName !== 'META') return;
    var nome = (el.getAttribute('name') || '').toLowerCase();
    var m = METAS[atual.tema];
    if (nome === 'color-scheme') {
      if (el.getAttribute('content') !== m.esquema) el.setAttribute('content', m.esquema);
    } else if (nome === 'theme-color') {
      if (el.getAttribute('content') !== m.cor) el.setAttribute('content', m.cor);
    }
  }

  function ajustarMetas() {
    var lista = doc.getElementsByTagName('meta');
    for (var i = 0; i < lista.length; i++) ajustarMeta(lista[i]);
  }

  function copia() {
    return { tema: atual.tema, preferencia: atual.preferencia, fonte: atual.fonte, publica: publica };
  }

  function notificar(anterior) {
    if (!anterior || typeof window.CustomEvent !== 'function') return;
    if (anterior.tema !== atual.tema || anterior.preferencia !== atual.preferencia) {
      doc.dispatchEvent(new CustomEvent('dmc:tema', { detail: { tema: atual.tema, preferencia: atual.preferencia } }));
    }
    if (anterior.fonte !== atual.fonte) {
      doc.dispatchEvent(new CustomEvent('dmc:fonte', { detail: { nivel: atual.fonte } }));
    }
  }

  function aplicar(opcoes) {
    var anterior = atual;
    var pref = preferencia();
    var fonte = nivel();
    atual = { tema: resolver(pref), preferencia: pref, fonte: Number(fonte) };
    if (raiz.getAttribute('data-pf-tema') !== atual.tema) raiz.setAttribute('data-pf-tema', atual.tema);
    if (raiz.getAttribute('data-pf-fonte') !== fonte) raiz.setAttribute('data-pf-fonte', fonte);
    if (raiz.classList) raiz.classList.add('pf-js');
    else if (!/(^|\s)pf-js(\s|$)/.test(raiz.className)) raiz.className += (raiz.className ? ' ' : '') + 'pf-js';
    ajustarMetas();
    if (opcoes && opcoes.notificar) notificar(anterior);
    return copia();
  }

  aplicar();

  // Metas inseridos depois deste script: ajustados na inserção (o
  // retorno do observador roda antes da próxima pintura e antes do
  // próximo <script>). Para de observar quando o <body> aparece
  // (os dois metas moram no <head>) ou no DOMContentLoaded.
  var observador = null;

  function pararDeObservar() {
    if (!observador) return;
    observador.disconnect();
    observador = null;
    ajustarMetas();
  }

  function aoInserir(registros) {
    var fim = false;
    for (var i = 0; i < registros.length; i++) {
      var novos = registros[i].addedNodes;
      for (var j = 0; j < novos.length; j++) {
        var n = novos[j];
        if (n.nodeName === 'META') ajustarMeta(n);
        else if (n.nodeName === 'BODY') fim = true;
      }
    }
    if (fim) pararDeObservar();
  }

  if (doc.readyState === 'loading' && typeof window.MutationObserver === 'function') {
    observador = new MutationObserver(aoInserir);
    observador.observe(raiz, { childList: true, subtree: true });
    doc.addEventListener('DOMContentLoaded', pararDeObservar, { once: true });
  }

  // "Automático": acompanha a troca de tema do aparelho.
  function aoMudarAparelho() {
    if (!publica && preferencia() === 'auto') aplicar({ notificar: true });
  }
  if (aparelhoClaro) {
    if (typeof aparelhoClaro.addEventListener === 'function') aparelhoClaro.addEventListener('change', aoMudarAparelho);
    else if (typeof aparelhoClaro.addListener === 'function') aparelhoClaro.addListener(aoMudarAparelho);
  }

  // Preferência trocada em outra aba do mesmo navegador.
  window.addEventListener('storage', function (e) {
    if (e.key === null || e.key === CHAVE_TEMA || e.key === CHAVE_FONTE) aplicar({ notificar: true });
  });

  window.DMC_PrePintura = Object.freeze({
    aplicar: aplicar,
    estado: copia
  });
})();
