/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/boot-obrigado.js (F0r)
   Boot de obrigado.html no lugar do <script> embutido (índice
   §6.2, CSP de §9.6, D-43). O estado da página (pedido registrado,
   sem pedido, não encontrado), os itens, o total e a caixa de
   desenvolvimento são de DMC_bootObrigado (js/app.js, F0b; §7.3,
   §7.10, D-69, D-79); este arquivo só o chama.
   ============================================================= */
(function () {
  'use strict';
  if (typeof window.DMC_bootObrigado !== 'function') {
    console.error('[DMC] obrigado.html sem o núcleo (js/app.js).');
    return;
  }
  Promise.resolve()
    .then(() => window.DMC_bootObrigado())
    .catch((err) => console.error('[DMC]', err));
})();
