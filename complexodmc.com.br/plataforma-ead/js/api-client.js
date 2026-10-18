// =============================================================
// COMPLEXO DMC · Cliente da API (MongoDB)
// Sem dependência de CDN:
// só fetch + o token JWT guardado no localStorage.
//
// Contrato (docs/dmc/PORTAL-ACADEMICO.md §7.1, PORTAL-API.md §1.7):
//   DMC_Api.get(caminho, opcoes?) · post(caminho, corpo = {}, opcoes?)
//   · put(caminho, corpo = {}, opcoes?) · del(caminho, opcoes?)
//   · upload(caminho, arquivo, tipoConteudo?, opcoes?) · blob(caminho, opcoes?)
//   · token() · setToken(token|null)
//   opcoes = { silencioso404?, sinal? (AbortSignal), cabecalhos? }
//   Erro lançado: Error { message (= corpo.error, como sempre), status,
//   codigo?, campos?, requestId? (corpo ou X-Request-Id), dados? (corpo) }.
//   401 → apaga o token (inalterado) e, se havia sessão, avisa a página com
//   o evento `dmc:sessao-expirada` em window (o DMC_Portal leva ao login);
//   403 `troca-de-senha-obrigatoria` → evento `dmc:troca-de-senha` (idem, ao perfil).
// =============================================================
(function () {
  'use strict';

  // Mesma origem do site — o servidor Express entrega a API e as páginas.
  // Para apontar pra outra máquina, defina window.DMC_API_BASE antes deste script.
  const BASE = (window.DMC_API_BASE || '/api').replace(/\/$/, '');
  const STORAGE_TOKEN = 'dmc:token';
  const MSG_REDE = 'Não foi possível falar com o servidor. Verifique sua conexão.';

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
    const c = String(caminho);
    if (/^https?:\/\//i.test(c)) return c;
    if (c.startsWith('/api/')) return BASE + c.slice(4);
    return BASE + c;
  }

  /** Erro com os campos do contrato; `message` continua sendo o `error` do corpo. */
  function criarErro(res, dados, mensagemPadrao) {
    const corpo = dados && typeof dados === 'object' ? dados : null;
    const status = res ? res.status : 0;
    const err = new Error((corpo && typeof corpo.error === 'string' && corpo.error) || mensagemPadrao || `Erro ${status} no servidor.`);
    err.status = status;
    if (corpo && typeof corpo.codigo === 'string' && corpo.codigo) err.codigo = corpo.codigo;
    if (corpo && corpo.campos && typeof corpo.campos === 'object') err.campos = corpo.campos;
    let requestId = corpo && typeof corpo.requestId === 'string' ? corpo.requestId : '';
    if (!requestId && res && res.headers) {
      try { requestId = res.headers.get('X-Request-Id') || ''; } catch { requestId = ''; }
    }
    if (requestId) err.requestId = requestId;
    if (dados != null) err.dados = dados;
    return err;
  }

  function avisarSessaoExpirada(url) {
    try { window.dispatchEvent(new CustomEvent('dmc:sessao-expirada', { detail: { url } })); } catch { /* sem CustomEvent */ }
  }

  async function enviar(url, init, opcoes) {
    const o = opcoes || {};
    const headers = Object.assign({}, init.headers || {});
    if (o.cabecalhos && typeof o.cabecalhos === 'object') {
      for (const nome of Object.keys(o.cabecalhos)) {
        const valor = o.cabecalhos[nome];
        if (valor != null && !/^authorization$/i.test(nome)) headers[nome] = String(valor);
      }
    }
    const tinhaSessao = !!_token;
    if (_token) headers.Authorization = `Bearer ${_token}`;
    init.headers = headers;
    if (o.sinal) init.signal = o.sinal;
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      if (e && e.name === 'AbortError') throw e; // navegação/aba fechada: quem chamou decide
      const err = new Error(MSG_REDE);
      err.status = 0;
      throw err;
    }
    // 401 = token expirado/inválido: derruba a sessão local.
    if (res.status === 401) {
      setToken(null);
      if (tinhaSessao) avisarSessaoExpirada(url);
    }
    return res;
  }

  async function lerJson(res, opcoes) {
    const texto = await res.text();
    let dados = null;
    if (texto) {
      try { dados = JSON.parse(texto); }
      catch { dados = null; }
    }
    if (res.status === 404 && opcoes && opcoes.silencioso404) return null;
    if (!res.ok) {
      const err = criarErro(res, dados);
      // Senha temporária exigida pelo servidor em qualquer chamada: o DMC_Portal leva ao perfil.
      if (res.status === 403 && err.codigo === 'troca-de-senha-obrigatoria') {
        try { window.dispatchEvent(new CustomEvent('dmc:troca-de-senha')); } catch { /* sem CustomEvent */ }
      }
      throw err;
    }
    return dados;
  }

  async function request(metodo, caminho, corpo, opcoes) {
    const init = { method: metodo, headers: {} };
    if (corpo !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(corpo);
    }
    return lerJson(await enviar(resolverUrl(caminho), init, opcoes), opcoes);
  }

  /** Upload de arquivo como corpo binário cru (o servidor lê com express.raw). */
  async function upload(caminho, arquivo, tipoConteudo, opcoes) {
    const init = {
      method: 'POST',
      headers: { 'Content-Type': tipoConteudo || (arquivo && arquivo.type) || 'application/octet-stream' },
      body: arquivo
    };
    return lerJson(await enviar(resolverUrl(caminho), init, opcoes), opcoes);
  }

  /** Baixa um binário protegido por token (download autenticado por header, nunca por query). */
  async function blob(caminho, opcoes) {
    const res = await enviar(resolverUrl(caminho), { method: 'GET', headers: {} }, opcoes);
    if (res.status === 404 && opcoes && opcoes.silencioso404) return null;
    if (!res.ok) {
      let dados = null;
      try { const t = await res.text(); dados = t ? JSON.parse(t) : null; } catch { dados = null; /* corpo não-JSON */ }
      throw criarErro(res, dados);
    }
    return res.blob();
  }

  window.DMC_Api = {
    get: (caminho, opcoes) => request('GET', caminho, undefined, opcoes),
    post: (caminho, corpo, opcoes) => request('POST', caminho, corpo || {}, opcoes),
    put: (caminho, corpo, opcoes) => request('PUT', caminho, corpo || {}, opcoes),
    del: (caminho, opcoes) => request('DELETE', caminho, undefined, opcoes),
    upload,
    blob,
    token: () => _token,
    setToken
  };
})();
