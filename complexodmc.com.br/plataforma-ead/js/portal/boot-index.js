/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/boot-index.js (F0b)
   Spec: docs/dmc/PORTAL-ACADEMICO.md §6.2 (index.html → boot-index.js),
   §5.1 e §7.2 (destino por papel), UX §6.19 (index só redireciona).

   index.html é só redirecionamento (substitui o <script> inline, D-43):
     - sem token                     → login.html (com ?next= se válido)
     - token sem sessão (401)        → login.html (com ?next= se válido)
     - senha temporária              → perfil.html#seguranca (D-63)
     - sessão                        → next válido ou DMC_Auth.destinoInicial()
       (professor → professor.html, admin → admin.html, aluno → dashboard.html)
     - falha que não é de sessão     → login.html, como sempre
   ============================================================= */
(function () {
  'use strict';

  const auth = window.DMC_Auth;
  const api = window.DMC_Api;
  const ir = (url) => window.location.replace(url);
  const next = auth && typeof auth.validarNext === 'function'
    ? auth.validarNext(new URLSearchParams(window.location.search).get('next') || '')
    : '';
  const login = next ? `login.html?next=${encodeURIComponent(next)}` : 'login.html';

  async function redirecionar() {
    if (!auth || !api || !api.token()) { ir(login); return; }
    const user = await auth.init();
    if (!user) { ir(login); return; }
    if (user.precisaTrocarSenha === true) { ir('perfil.html#seguranca'); return; }
    ir(next || auth.destinoInicial());
  }

  redirecionar().catch(() => ir(login));
})();
