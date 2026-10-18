/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/acesso-link.js (F0p)
   Tela: acesso-link.html — PORTAL-UX.md §8.5 (pedir link, criar
   nova senha, usar o link). API: PORTAL-API.md §6.1 (link mágico,
   recuperação, 2FA, troca e verificação de e-mail). Índice: §5.5
   item 4 (D-71), §7.2 (DMC_Auth), §7.4 (modo 'publica').

   Página pública, sem shell. O modo vem do fragmento:
     #pedir-link · #esqueci                       → pedir um link
     #acesso=<t> · #redefinir=<t> · #email=<t> · #verificar=<t> → usar
   O token é lido e APAGADO do endereço (history.replaceState) no
   carregamento deste arquivo, antes de qualquer chamada à API (o
   DMC_Portal só chama /api/auth/me depois). O e-mail digitado nunca
   vai para a URL (envio por fetch, nunca por GET de formulário).

   Lacuna da F0b em obra: DMC_Auth.recursos/pedirLinkMagico/… e o
   erro com status/codigo no DMC_Api (§7.1, §7.2) ainda não existem;
   quando existirem, as funções dela são usadas (prioridade abaixo).
   ============================================================= */
(function () {
  'use strict';

  // ---------------------------------------------------------------
  // 1) Fragmento lido e apagado ANTES de tudo (UX §8.5).
  // ---------------------------------------------------------------
  const MODOS_TOKEN = ['acesso', 'redefinir', 'email', 'verificar'];
  const MODOS_PEDIDO = ['pedir-link', 'esqueci'];

  function lerFragmento(hash) {
    const h = String(hash || '').replace(/^#/, '');
    const m = /^([a-z-]+)(?:=(.*))?$/.exec(h);
    if (!m) return { modo: 'pedir-link', token: null };
    if (MODOS_TOKEN.indexOf(m[1]) >= 0 && m[2] !== undefined) {
      let token = m[2];
      try { token = decodeURIComponent(token); } catch { /* fica cru */ }
      return { modo: m[1], token: token.trim() };
    }
    if (MODOS_PEDIDO.indexOf(m[1]) >= 0) return { modo: m[1], token: null };
    return { modo: 'pedir-link', token: null };
  }

  let inicial = lerFragmento(window.location.hash);
  if (inicial.token !== null) {
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* sem history */ }
  }

  const UI = window.DMC_UI;
  if (!UI || !window.DMC_Portal) return;
  const html = UI.html;

  const API = {
    recursos: '/auth/recursos',
    linkMagico: '/auth/link-magico',
    consumir: '/auth/link-magico/consumir',
    verificar2fa: '/auth/2fa/verificar',
    esqueci: '/auth/senha/esqueci',
    redefinir: '/auth/senha/redefinir',
    emailConfirmar: '/auth/email/confirmar',
    emailVerificar: '/auth/email/verificar'
  };
  const ESPERA_REENVIO_S = 60;

  // ---------------------------------------------------------------
  // Núcleo local (lacuna do DMC_Api §7.1; ver cabeçalho)
  // ---------------------------------------------------------------
  const BASE = String(window.DMC_API_BASE || '/api').replace(/\/$/, '');
  async function chamar(metodo, caminho, corpo) {
    const A = window.DMC_Api;
    const cab = {};
    const t = A && A.token();
    if (t) cab.Authorization = `Bearer ${t}`;
    if (corpo !== undefined) cab['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(BASE + caminho, { method: metodo, headers: cab, body: corpo === undefined ? undefined : JSON.stringify(corpo), credentials: 'same-origin' });
    } catch {
      throw Object.assign(new Error('Sem conexão. Verifique a internet e tente de novo.'), { status: 0 });
    }
    if (res.status === 401 && A && t) A.setToken(null);
    const texto = await res.text();
    let dados = null;
    if (texto) { try { dados = JSON.parse(texto); } catch { dados = null; } }
    if (!res.ok) {
      throw Object.assign(new Error((dados && dados.error) || `Erro ${res.status} no servidor.`), {
        status: res.status, codigo: dados && dados.codigo, campos: dados && dados.campos,
        requestId: (dados && dados.requestId) || res.headers.get('X-Request-Id') || undefined, dados: dados || undefined
      });
    }
    return dados;
  }

  const Auth = () => window.DMC_Auth || {};
  const temFn = (nome) => typeof Auth()[nome] === 'function';

  async function recursos() {
    if (temFn('recursos')) return Auth().recursos();
    return chamar('GET', API.recursos);
  }

  function destinoInicial() {
    if (temFn('destinoInicial')) return Auth().destinoInicial();
    const u = temFn('user') ? Auth().user() : null;
    if (u && u.isAdmin) return 'admin.html';
    if (u && u.papel === 'professor') return 'professor.html';
    return 'dashboard.html';
  }

  /** Guarda a sessão devolvida pelo servidor e recarrega o usuário. */
  async function abrirSessao(r) {
    if (r && r.token && window.DMC_Api) window.DMC_Api.setToken(r.token);
    if (temFn('init')) { try { await Auth().init(); } catch { /* o destino confere */ } }
  }

  function bytesUtf8(s) { return new TextEncoder().encode(String(s || '')).length; }

  // ---------------------------------------------------------------
  // Tela
  // ---------------------------------------------------------------
  const E = { ctx: null, raiz: null, recursos: null, temporizador: null };

  const TITULOS = {
    'pedir-link': { h1: html`Receber link de <em>acesso</em>`, titulo: 'Receber link de acesso' },
    esqueci: { h1: html`Criar nova <em>senha</em>`, titulo: 'Criar nova senha' },
    acesso: { h1: html`Entrar com <em>link</em>`, titulo: 'Entrar com link' },
    redefinir: { h1: html`Criar nova <em>senha</em>`, titulo: 'Criar nova senha' },
    email: { h1: html`Confirmar novo <em>e-mail</em>`, titulo: 'Confirmar novo e-mail' },
    verificar: { h1: html`Confirmar <em>e-mail</em>`, titulo: 'Confirmar e-mail' }
  };

  function desenhar(modo, corpo) {
    const t = TITULOS[modo] || TITULOS['pedir-link'];
    document.title = `${t.titulo} · Plataforma Complexo DMC`;
    E.raiz.innerHTML = html`<h1 class="pf-cabecalho__titulo" id="pf-acesso-titulo" tabindex="-1">${t.h1}</h1>${corpo}`;
    E.raiz.setAttribute('aria-busy', 'false');
  }

  function focarTitulo() {
    const h1 = document.getElementById('pf-acesso-titulo');
    if (h1) h1.focus({ preventScroll: true });
  }

  function indisponivel(modo) {
    // [Voltar à entrada] fica no pé da página (todos os modos, UX §8.5).
    desenhar(modo, html`<p class="pf-alerta pf-alerta--aviso" role="status">O envio de e-mail não está configurado. Peça uma senha temporária à coordenação.</p>`);
  }

  function linkExpirado(modo) {
    const pedido = modo === 'acesso' ? 'pedir-link' : modo === 'redefinir' ? 'esqueci' : null;
    desenhar(modo, html`<p class="pf-alerta pf-alerta--erro" role="alert">Este link expirou ou já foi usado.</p>
      ${pedido
        ? html`<p><button type="button" class="dmc-btn dmc-btn--primary" data-pf-acesso="novo-link" data-pedido="${pedido}">Pedir novo link</button></p>`
        : html`<p><a class="dmc-btn dmc-btn--primary" href="login.html">Ir para a entrada</a></p>`}`);
    const b = E.raiz.querySelector('[data-pf-acesso="novo-link"]');
    if (b) b.addEventListener('click', () => { window.location.hash = b.getAttribute('data-pedido'); });
    focarTitulo();
  }

  function erroGenerico(modo, err) {
    desenhar(modo, html`<p class="pf-alerta pf-alerta--erro" role="alert">${(err && err.status && err.message) || 'Não foi possível concluir agora. Verifique sua conexão e tente de novo.'}</p>`);
    focarTitulo();
  }

  // ----- Pedir (link de acesso ou nova senha) -----
  function campoEmail() {
    return html`<div class="pf-campo" data-campo="email">
      <label class="pf-rotulo" for="pf-acesso-email">E-mail<span class="pf-rotulo__obrigatorio" aria-hidden="true"> *</span></label>
      <input class="pf-input" id="pf-acesso-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" required aria-required="true" aria-describedby="pf-acesso-email-erro">
      <p class="pf-erro-campo" id="pf-acesso-email-erro" hidden></p>
    </div>`;
  }

  async function modoPedido(modo) {
    const u = E.ctx && E.ctx.user;
    if (u) {
      desenhar(modo, html`<p class="pf-cabecalho__desc">Você já está conectado como ${u.email}.</p>
        <p><a class="dmc-btn dmc-btn--primary" href="${destinoInicial()}">Ir para o portal</a></p>`);
      return;
    }
    if (!E.recursos) {
      try { E.recursos = (await recursos()) || {}; } catch { E.recursos = {}; }
    }
    const disponivel = modo === 'esqueci' ? !!E.recursos.recuperacaoSenha : !!E.recursos.linkMagico;
    if (!disponivel) { indisponivel(modo); return; }

    const ehLink = modo === 'pedir-link';
    desenhar(modo, html`<p class="pf-cabecalho__desc">${ehLink
      ? 'Digite o e-mail da sua conta. Enviamos um link que dá acesso ao portal sem a senha.'
      : 'Digite o e-mail da sua conta. Enviamos um link para você criar uma senha nova.'}</p>
      <form class="pf-acesso-form" novalidate>
        ${campoEmail()}
        <div class="pf-acesso-form__acoes"><button type="submit" class="dmc-btn dmc-btn--primary">${ehLink ? 'Receber link de acesso' : 'Enviar link para criar nova senha'}</button></div>
        <div class="pf-acesso-form__resultado" role="status" aria-live="polite"></div>
      </form>
      <p class="pf-acesso__alternativa">${ehLink
        ? html`Prefere trocar a senha? <a href="#esqueci">Criar nova senha</a>.`
        : html`Prefere entrar sem senha? <a href="#pedir-link">Receber link de acesso</a>.`}</p>`);

    const form = E.raiz.querySelector('form');
    const entrada = form.elements.namedItem('email');
    const erro = form.querySelector('.pf-erro-campo');
    const botao = form.querySelector('button[type="submit"]');
    const resultado = form.querySelector('.pf-acesso-form__resultado');
    const marcarErro = (texto) => {
      erro.textContent = texto || ''; erro.hidden = !texto;
      if (texto) entrada.setAttribute('aria-invalid', 'true'); else entrada.removeAttribute('aria-invalid');
    };
    entrada.focus();

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      marcarErro('');
      const email = entrada.value.trim();
      if (!email) { marcarErro('Preencha o e-mail.'); entrada.focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { marcarErro('E-mail inválido. Confira o endereço.'); entrada.focus(); return; }
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      let travar = false;
      try {
        let r;
        if (ehLink) r = temFn('pedirLinkMagico') ? await Auth().pedirLinkMagico(email) : await chamar('POST', API.linkMagico, { email });
        else r = temFn('esqueciSenha') ? await Auth().esqueciSenha(email) : await chamar('POST', API.esqueci, { email });
        resultado.innerHTML = html`<p class="pf-alerta pf-alerta--sucesso">${(r && r.mensagem) || 'Se houver uma conta com esse e-mail, enviamos o link.'}</p>
          <p class="pf-ajuda">Não chegou? Confira a caixa de spam ou peça de novo em alguns minutos.</p>`;
        travar = true;
      } catch (err) {
        if (err && err.codigo === 'email-indisponivel') { indisponivel(modo); return; }
        if (err && err.campos && err.campos.email) { marcarErro(String(err.campos.email)); entrada.focus(); }
        else resultado.innerHTML = html`<p class="pf-alerta pf-alerta--erro" role="alert">${(err && err.message) || 'Não foi possível enviar agora.'}</p>`;
      } finally {
        botao.removeAttribute('aria-busy');
        if (travar) esperarReenvio(botao); else botao.disabled = false;
      }
    });
  }

  /** Botão inativo por 60 s depois de um pedido aceito (UX §8.5). */
  function esperarReenvio(botao) {
    const rotulo = botao.textContent;
    let resta = ESPERA_REENVIO_S;
    botao.disabled = true;
    botao.setAttribute('aria-disabled', 'true');
    const nota = document.createElement('p');
    nota.className = 'pf-ajuda pf-acesso-form__espera';
    botao.insertAdjacentElement('afterend', nota);
    const passo = () => {
      if (!botao.isConnected) { window.clearInterval(E.temporizador); return; }
      if (resta <= 0) {
        window.clearInterval(E.temporizador);
        botao.disabled = false;
        botao.removeAttribute('aria-disabled');
        botao.textContent = rotulo;
        nota.remove();
        return;
      }
      nota.textContent = `Você pode pedir de novo em ${resta} s.`;
      resta -= 1;
    };
    window.clearInterval(E.temporizador);
    passo();
    E.temporizador = window.setInterval(passo, 1000);
  }

  // ----- Usar o link de acesso (com passo do 2FA quando a conta tem) -----
  async function modoAcesso(token) {
    desenhar('acesso', html`<p class="pf-cabecalho__desc" role="status" aria-busy="true">Verificando seu link…</p>`);
    let r;
    try {
      if (temFn('consumirLinkMagico')) {
        try { r = await Auth().consumirLinkMagico(token); }
        catch (err) {
          if (err && err.codigo === 'segundo-fator') { pedirCodigo((err.dados && err.dados.desafio) || err.desafio); return; }
          throw err;
        }
      } else {
        r = await chamar('POST', API.consumir, { token });
      }
    } catch (err) {
      if (err && (err.status === 410 || err.codigo === 'link-invalido')) { linkExpirado('acesso'); return; }
      erroGenerico('acesso', err);
      return;
    }
    if (r && r.segundoFator) { pedirCodigo(r.desafio); return; }
    await abrirSessao(r);
    window.location.replace(destinoInicial());
  }

  function pedirCodigo(desafio) {
    desenhar('acesso', html`<p class="pf-cabecalho__desc">Digite o código do aplicativo autenticador.</p>
      <form class="pf-acesso-form" novalidate>
        <div class="pf-campo" data-campo="codigo">
          <label class="pf-rotulo" for="pf-acesso-codigo">Código do aplicativo<span class="pf-rotulo__obrigatorio" aria-hidden="true"> *</span></label>
          <input class="pf-input" id="pf-acesso-codigo" name="codigo" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="9" required aria-required="true" aria-describedby="pf-acesso-codigo-ajuda pf-acesso-codigo-erro">
          <p class="pf-ajuda" id="pf-acesso-codigo-ajuda">Os 6 números do aplicativo ou um código de recuperação (XXXX-XXXX).</p>
          <p class="pf-erro-campo" id="pf-acesso-codigo-erro" hidden></p>
        </div>
        <div class="pf-acesso-form__acoes"><button type="submit" class="dmc-btn dmc-btn--primary">Confirmar código</button></div>
      </form>`);
    const form = E.raiz.querySelector('form');
    const entrada = form.elements.namedItem('codigo');
    const erro = form.querySelector('.pf-erro-campo');
    entrada.focus();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const codigo = entrada.value.trim().toUpperCase();
      if (!/^\d{6}$/.test(codigo) && !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo)) {
        erro.textContent = 'Código inválido. Digite os 6 números do aplicativo.'; erro.hidden = false;
        entrada.setAttribute('aria-invalid', 'true'); entrada.focus(); return;
      }
      const botao = form.querySelector('button[type="submit"]');
      botao.disabled = true;
      try {
        let r;
        if (temFn('verificar2fa')) r = await Auth().verificar2fa(desafio, codigo);
        else { r = await chamar('POST', API.verificar2fa, { desafio, codigo }); await abrirSessao(r); }
        if (temFn('verificar2fa') && temFn('init')) { try { await Auth().init(); } catch { /* segue */ } }
        window.location.replace(destinoInicial());
      } catch (err) {
        botao.disabled = false;
        if (err && (err.status === 410 || err.codigo === 'desafio-expirado')) { linkExpirado('acesso'); return; }
        erro.textContent = (err && err.status === 429 && err.message) || 'Código inválido.';
        erro.hidden = false;
        entrada.setAttribute('aria-invalid', 'true');
        entrada.select();
      }
    });
  }

  // ----- Criar nova senha com o link -----
  function modoRedefinir(token) {
    desenhar('redefinir', html`<p class="pf-cabecalho__desc" id="pf-acesso-regra">A nova senha precisa ter de 8 a 72 caracteres e ser diferente do seu e-mail e do seu CPF.</p>
      <form class="pf-acesso-form" novalidate>
        <div class="pf-campo" data-campo="novaSenha">
          <label class="pf-rotulo" for="pf-acesso-nova">Nova senha<span class="pf-rotulo__obrigatorio" aria-hidden="true"> *</span></label>
          <input class="pf-input" id="pf-acesso-nova" name="novaSenha" type="password" autocomplete="new-password" maxlength="200" required aria-required="true" aria-describedby="pf-acesso-regra pf-acesso-nova-erro">
          <p class="pf-erro-campo" id="pf-acesso-nova-erro" hidden></p>
        </div>
        <div class="pf-campo" data-campo="confirmar">
          <label class="pf-rotulo" for="pf-acesso-confirmar">Confirmar nova senha<span class="pf-rotulo__obrigatorio" aria-hidden="true"> *</span></label>
          <input class="pf-input" id="pf-acesso-confirmar" name="confirmar" type="password" autocomplete="new-password" maxlength="200" required aria-required="true" aria-describedby="pf-acesso-confirmar-erro">
          <p class="pf-erro-campo" id="pf-acesso-confirmar-erro" hidden></p>
        </div>
        <label class="pf-check pf-acesso-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" data-pf-acesso="mostrar"><span>Mostrar senha</span></label>
        <div class="pf-acesso-form__acoes"><button type="submit" class="dmc-btn dmc-btn--primary">Criar nova senha</button></div>
        <div class="pf-acesso-form__resultado" role="status" aria-live="polite"></div>
      </form>`);
    const form = E.raiz.querySelector('form');
    const nova = form.elements.namedItem('novaSenha');
    const conf = form.elements.namedItem('confirmar');
    const mostrar = form.querySelector('[data-pf-acesso="mostrar"]');
    mostrar.addEventListener('change', () => { nova.type = conf.type = mostrar.checked ? 'text' : 'password'; });
    const marcar = (entrada, texto) => {
      const p = document.getElementById(`${entrada.id}-erro`);
      p.textContent = texto || ''; p.hidden = !texto;
      if (texto) entrada.setAttribute('aria-invalid', 'true'); else entrada.removeAttribute('aria-invalid');
    };
    nova.focus();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      marcar(nova, ''); marcar(conf, '');
      const b = bytesUtf8(nova.value);
      if (!nova.value) { marcar(nova, 'Preencha a nova senha.'); nova.focus(); return; }
      if (b < 8 || b > 72) { marcar(nova, 'A nova senha precisa ter de 8 a 72 caracteres.'); nova.focus(); return; }
      if (conf.value !== nova.value) { marcar(conf, 'As senhas não conferem.'); conf.focus(); return; }
      const botao = form.querySelector('button[type="submit"]');
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      try {
        if (temFn('redefinirSenha')) await Auth().redefinirSenha(token, nova.value);
        else await chamar('POST', API.redefinir, { token, novaSenha: nova.value });
        desenhar('redefinir', html`<p class="pf-alerta pf-alerta--sucesso" role="status">Senha alterada. Entre com a nova senha.</p>
          <p><a class="dmc-btn dmc-btn--primary" href="login.html">Ir para a entrada</a></p>`);
        focarTitulo();
      } catch (err) {
        botao.disabled = false;
        botao.removeAttribute('aria-busy');
        if (err && (err.status === 410 || err.codigo === 'link-invalido')) { linkExpirado('redefinir'); return; }
        if (err && err.campos && err.campos.novaSenha) { marcar(nova, String(err.campos.novaSenha)); nova.focus(); return; }
        form.querySelector('.pf-acesso-form__resultado').innerHTML = html`<p class="pf-alerta pf-alerta--erro" role="alert">${(err && err.message) || 'Não foi possível criar a senha agora.'}</p>`;
      }
    });
  }

  // ----- Troca e verificação de e-mail -----
  async function modoEmail(token) {
    desenhar('email', html`<p class="pf-cabecalho__desc" role="status" aria-busy="true">Verificando seu link…</p>`);
    try {
      await chamar('POST', API.emailConfirmar, { token });
      // A troca encerra as sessões (sessaoVersao++): a pessoa entra de novo com o novo endereço.
      if (window.DMC_Api) window.DMC_Api.setToken(null);
      desenhar('email', html`<p class="pf-alerta pf-alerta--sucesso" role="status">E-mail alterado. Entre de novo com o novo endereço.</p>
        <p><a class="dmc-btn dmc-btn--primary" href="login.html">Ir para a entrada</a></p>`);
      focarTitulo();
    } catch (err) {
      if (err && err.codigo === 'email-em-uso') {
        desenhar('email', html`<p class="pf-alerta pf-alerta--erro" role="alert">Este e-mail já está vinculado a outra conta. Fale com a secretaria.</p>
          <p><a class="dmc-btn dmc-btn--secondary" href="login.html">Ir para a entrada</a></p>`);
        focarTitulo();
        return;
      }
      if (err && (err.status === 410 || err.codigo === 'link-invalido')) { linkExpirado('email'); return; }
      erroGenerico('email', err);
    }
  }

  async function modoVerificar(token) {
    desenhar('verificar', html`<p class="pf-cabecalho__desc" role="status" aria-busy="true">Verificando seu link…</p>`);
    try {
      await chamar('POST', API.emailVerificar, { token });
      const logado = !!(E.ctx && E.ctx.user);
      desenhar('verificar', html`<p class="pf-alerta pf-alerta--sucesso" role="status">E-mail confirmado.</p>
        <p>${logado ? html`<a class="dmc-btn dmc-btn--primary" href="${destinoInicial()}">Ir para o portal</a>` : html`<a class="dmc-btn dmc-btn--primary" href="login.html">Ir para a entrada</a>`}</p>`);
      focarTitulo();
    } catch (err) {
      if (err && (err.status === 410 || err.codigo === 'link-invalido')) { linkExpirado('verificar'); return; }
      erroGenerico('verificar', err);
    }
  }

  function executar(estado) {
    window.clearInterval(E.temporizador);
    E.raiz.setAttribute('aria-busy', 'true');
    const { modo, token } = estado;
    if (modo === 'acesso' && token) return modoAcesso(token);
    if (modo === 'redefinir' && token) return modoRedefinir(token);
    if (modo === 'email' && token) return modoEmail(token);
    if (modo === 'verificar' && token) return modoVerificar(token);
    return modoPedido(modo === 'esqueci' ? 'esqueci' : 'pedir-link');
  }

  async function boot(ctx) {
    E.ctx = ctx;
    E.raiz = document.getElementById('pf-acesso-raiz');
    window.addEventListener('hashchange', () => {
      const novo = lerFragmento(window.location.hash);
      if (novo.token !== null) {
        try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* sem history */ }
      }
      inicial = novo;
      Promise.resolve(executar(novo)).then(focarTitulo);
    });
    await executar(inicial);
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'acesso-link', modo: 'publica' });
})();
