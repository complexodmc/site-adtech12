// =============================================================
// COMPLEXO DMC · Cliente Supabase
// Inicializa o client global usando supabase-js carregado por CDN.
// =============================================================
(function () {
  'use strict';

  const SUPABASE_URL = 'https://lpdkvunzrtmsqqvxjqyo.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_GP95281Eu0239M-oxzYBIQ_0Ja5_LYP';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[DMC] supabase-js não carregado. Verifique o <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"> antes deste arquivo.');
    return;
  }

  window.DMC_supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'dmc:supabase-auth',
      detectSessionInUrl: false
    }
  });
})();
