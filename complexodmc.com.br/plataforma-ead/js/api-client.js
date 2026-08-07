// =============================================================
// COMPLEXO DMC · Cliente da API (MongoDB)
// Sem dependência de CDN:
// só fetch + o token JWT guardado no localStorage.
// =============================================================
(function () {
  'use strict';

  // Mesma origem do site — o servidor Express entrega a API e as páginas.
  // Para apontar pra outra máquina, defina window.DMC_API_BASE antes deste script.
  const BASE = (window.DMC_API_BASE || '/api').replace(/\/$/, '');
  const STORAGE_TOKEN = 'dmc:token';

  let _token = null;
  try { _token = localStorage.getItem(STORAGE_TOKEN); } catch { _token = null; }

  function setToken(t) {
    _token = t || null;
    try {
      if (_token) localStorage.setItem(STORAGE_TOKEN, _token);
      else localStorage.removeItem(STORAGE_TOKEN);
    } catch { /* modo privado sem storage — segue só em memória */ }
  }

  async function request(metodo, caminho, corpo) {
    const opts = { method: metodo, headers: {} };
    if (_token) opts.headers.Authorization = `Bearer ${_token}`;
    if (corpo !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(corpo);
    }

    let res;
    try {
      res = await fetch(BASE + caminho, opts);
    } catch {
      throw new Error('Não foi possível falar com o servidor. Verifique sua conexão.');
    }

    // 401 = token expirado/inválido: derruba a sessão local.
    if (res.status === 401) setToken(null);

    const texto = await res.text();
    let dados = null;
    if (texto) {
      try { dados = JSON.parse(texto); }
      catch { dados = null; }
    }

    if (!res.ok) {
      throw new Error((dados && dados.error) || `Erro ${res.status} no servidor.`);
    }
    return dados;
  }

  window.DMC_Api = {
    get: (caminho) => request('GET', caminho),
    post: (caminho, corpo) => request('POST', caminho, corpo || {}),
    put: (caminho, corpo) => request('PUT', caminho, corpo || {}),
    del: (caminho) => request('DELETE', caminho),
    token: () => _token,
    setToken
  };
})();
