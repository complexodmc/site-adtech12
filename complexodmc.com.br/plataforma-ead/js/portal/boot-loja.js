/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/boot-loja.js (F0r)
   Boot de loja.html no lugar do <script> embutido (índice §6.2,
   CSP de §9.6, D-43). A vitrine, a gaveta do carrinho e o envio do
   pedido são de DMC_bootLoja (js/app.js, F0b; markup de D-69 e
   pedido de D-79); este arquivo só o chama.
   ============================================================= */
(function () {
  'use strict';
  if (typeof window.DMC_bootLoja !== 'function') {
    console.error('[DMC] loja.html sem o núcleo (js/app.js).');
    return;
  }
  Promise.resolve()
    .then(() => window.DMC_bootLoja())
    .catch((err) => console.error('[DMC]', err));
})();
