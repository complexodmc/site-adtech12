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

  // Aceita tanto caminho relativo à API ("/catalogo") quanto URL absoluta
  // vinda do servidor ("/api/materiais/..."), que precisa respeitar o BASE.
  function resolverUrl(caminho) {
    if (/^https?:\/\//i.test(caminho)) return caminho;
    if (caminho.startsWith('/api/')) return BASE + caminho.slice(4);
    return BASE + caminho;
  }

  async function enviar(url, opts) {
    if (_token) opts.headers.Authorization = `Bearer ${_token}`;
    let res;
    try {
      res = await fetch(url, opts);
    } catch {
      throw new Error('Não foi possível falar com o servidor. Verifique sua conexão.');
    }
    // 401 = token expirado/inválido: derruba a sessão local.
    if (res.status === 401) setToken(null);
    return res;
  }

  async function lerJson(res) {
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

  async function request(metodo, caminho, corpo) {
    const opts = { method: metodo, headers: {} };
    if (corpo !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(corpo);
    }
    return lerJson(await enviar(resolverUrl(caminho), opts));
  }

  /** Upload de arquivo como corpo binário cru (o servidor lê com express.raw). */
  async function upload(caminho, arquivo, tipoConteudo) {
    const opts = {
      method: 'POST',
      headers: { 'Content-Type': tipoConteudo || arquivo.type || 'application/octet-stream' },
      body: arquivo
    };
    return lerJson(await enviar(resolverUrl(caminho), opts));
  }

  /** Baixa um binário protegido por token (PDF de material de apoio). */
  async function blob(caminho) {
    const res = await enviar(resolverUrl(caminho), { method: 'GET', headers: {} });
    if (!res.ok) {
      let msg = `Erro ${res.status} no servidor.`;
      try { const d = JSON.parse(await res.text()); if (d && d.error) msg = d.error; } catch { /* corpo não-JSON */ }
      throw new Error(msg);
    }
    return res.blob();
  }

  window.DMC_Api = {
    get: (caminho) => request('GET', caminho),
    post: (caminho, corpo) => request('POST', caminho, corpo || {}),
    put: (caminho, corpo) => request('PUT', caminho, corpo || {}),
    del: (caminho) => request('DELETE', caminho),
    upload,
    blob,
    token: () => _token,
    setToken
  };
})();
