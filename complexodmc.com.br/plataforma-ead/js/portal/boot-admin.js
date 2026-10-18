/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/boot-admin.js (F8)
   Boot do admin.html (editor de cursos) dentro do shell do
   backoffice, no lugar do script embutido (índice §6.2, D-75).
   Sem roteador: nenhum hash é reescrito aqui (D-66); o menu vem de
   DMC_Professor.itensDoMenu(papel) com links professor.html#/<rota>.
   Papéis: coordenação. O modo do professor no editor (leitura da
   identidade, edição só de plano, materiais e rótulo do encontro,
   D-21) fica para quando as rotas de conteúdo do professor (F1a)
   aceitarem a docência; até lá o item "Conteúdo" é só da coordenação.
   ============================================================= */
(function () {
  'use strict';
  // O conteúdo fica reservado (invisível) até o shell montar, para não saltar (CLS;
  // portal-professor.css). Se o shell não montar (núcleo ausente, sessão que falhou),
  // esta marca libera a tela do mesmo jeito.
  function pronto() { if (document.body) document.body.classList.add('pf-prof-pronto'); }
  if (!window.DMC_Portal || typeof window.DMC_Portal.iniciar !== 'function') {
    console.error('[DMC] admin.html sem o núcleo (js/portal/ui.js).');
    if (document.body) pronto(); else document.addEventListener('DOMContentLoaded', pronto);
    return;
  }
  Promise.resolve(window.DMC_Portal.iniciar(async (ctx) => {
    if (typeof window.DMC_bootAdmin !== 'function') throw new Error('Editor de cursos indisponível (js/admin.js).');
    await window.DMC_bootAdmin(ctx);
  }, {
    pagina: 'conteudo',
    papeis: ['admin'],
    area: 'backoffice',
    catalogo: true,
    itens: ({ papel }) => (window.DMC_Professor ? window.DMC_Professor.itensDoMenu(papel) : [])
  })).catch((err) => { console.error('[DMC]', err); }).finally(pronto);
})();
