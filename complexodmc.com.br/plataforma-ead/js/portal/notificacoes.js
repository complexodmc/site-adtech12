/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/notificacoes.js (F0p)
   Tela: notificacoes.html e, no backoffice, a rota #/notificacoes
   de professor.html (índice §6.3: o mesmo módulo, montado como
   painel quando DMC_Professor existe). PORTAL-UX.md §6.14, §7.20.
   API: PORTAL-API.md §6.4 (lista, marcar uma, marcar todas).

   Lacuna da F0b em obra: erro com status/codigo no DMC_Api (§7.1) —
   `chamar()` local com o mesmo token e a mesma base.
   ============================================================= */
(function () {
  'use strict';

  const UI = window.DMC_UI;
  if (!UI) return;
  const html = UI.html;

  const API = {
    lista: (pagina, naoLidas) => `/portal/me/notificacoes?pagina=${pagina}${naoLidas ? '&naoLidas=1' : ''}`,
    lida: (id) => `/portal/me/notificacoes/${encodeURIComponent(id)}/lida`,
    todas: '/portal/me/notificacoes/lidas'
  };
  const POR_PAGINA = 25;
  const HREF_INTERNO = /^(?:[a-z0-9_-]+\.html(?:\?[^\s#]*)?(?:#\S*)?|#\/?[a-z0-9_/:-]+)$/i;

  /** 401 com sessão aberta: volta ao login com next (o que foi digitado não vai a rascunho, D-47). */
  function sessaoEncerrada() {
    try { window.sessionStorage.setItem('dmc:aviso', 'Sua sessão terminou. Entre de novo para continuar.'); } catch { /* sem storage */ }
    let seg = String(window.location.pathname).split('/').pop() || '';
    if (seg && !/\.[a-z0-9]+$/i.test(seg)) seg += '.html';
    const atual = seg + window.location.search;
    const next = /^[a-z0-9_-]+\.html(\?.*)?$/i.test(atual) ? atual : '';
    window.location.replace(next ? `login.html?next=${encodeURIComponent(next)}` : 'login.html');
  }

  const BASE = String(window.DMC_API_BASE || '/api').replace(/\/$/, '');
  async function chamar(metodo, caminho, corpo, opcoes) {
    const o = opcoes || {};
    const A = window.DMC_Api;
    const cab = {};
    const t = A && A.token();
    if (t) cab.Authorization = `Bearer ${t}`;
    if (corpo !== undefined) cab['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(BASE + caminho, { method: metodo, headers: cab, body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: o.sinal, credentials: 'same-origin' });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw Object.assign(new Error('Sem conexão. Verifique a internet e tente de novo.'), { status: 0 });
    }
    if (res.status === 401 && A) {
      const tinhaSessao = !!A.token();
      A.setToken(null);
      if (tinhaSessao) sessaoEncerrada();
    }
    if (res.status === 404 && o.silencioso404) return null;
    const texto = await res.text();
    let dados = null;
    if (texto) { try { dados = JSON.parse(texto); } catch { dados = null; } }
    if (!res.ok) {
      throw Object.assign(new Error((dados && dados.error) || `Erro ${res.status} no servidor.`), {
        status: res.status, codigo: dados && dados.codigo, requestId: (dados && dados.requestId) || res.headers.get('X-Request-Id') || undefined, dados: dados || undefined
      });
    }
    return dados;
  }

  const icone = (chave, op) => (typeof UI.icone === 'function' ? UI.icone(chave, op) : '');

  const ICONE_DO_TIPO = {
    duvida: 'navDuvidas', protocolo: 'navAtendimento', atendimento: 'navAtendimento', ouvidoria: 'navOuvidoria',
    documento: 'navDocumentos', contrato: 'navContratos', lancamento: 'navFinanceiro', financeiro: 'navFinanceiro',
    avaliacao: 'navAvaliacoes', correcao: 'navCorrecao', publicacao: 'navPublicacoes', encontro: 'navAoVivo',
    aovivo: 'navAoVivo', declaracao: 'navDeclaracoes', matricula: 'navMatriculas'
  };
  function iconeDoTipo(tipo) {
    const dominio = String(tipo || '').split('.')[0];
    return icone(ICONE_DO_TIPO[dominio] || 'sino') || icone('sino');
  }

  // Datas (America/Sao_Paulo)
  const FUSO = 'America/Sao_Paulo';
  const DIA = new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
  const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
  const diaDe = (d) => DIA.format(d);
  function grupoDe(iso, agora) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Anteriores';
    const hoje = diaDe(agora);
    const ontem = diaDe(new Date(agora.getTime() - 864e5));
    const dia = diaDe(d);
    if (dia === hoje) return 'Hoje';
    if (dia === ontem) return 'Ontem';
    if (agora.getTime() - d.getTime() < 7 * 864e5) return 'Esta semana';
    return 'Anteriores';
  }
  function quando(iso, grupo) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return grupo === 'Hoje' || grupo === 'Ontem' ? HORA.format(d) : DATA_HORA.format(d).replace(',', ' ·');
  }

  /**
   * Monta a lista em `el`. Usado pela página (notificacoes.html) e pela rota do backoffice.
   * → { destruir() }
   */
  function montar(el, { sinal } = {}) {
    const E = { filtro: 'todas', pagina: 1, itens: [], totalPaginas: null, naoLidas: null, fim: false, vivo: true };
    el.classList.add('pf-notificacoes-pagina');
    el.innerHTML = html`
      <div class="pf-notificacoes-pagina__barra">
        <div class="pf-segmento" role="group" aria-label="Filtrar notificações">
          <button type="button" class="pf-segmento__opcao" data-pf-notif-filtro="todas" aria-pressed="true">Todas</button>
          <button type="button" class="pf-segmento__opcao" data-pf-notif-filtro="nao-lidas" aria-pressed="false">Não lidas<span class="pf-segmento__contagem" data-pf-notif-contagem></span></button>
        </div>
        <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-notif-acao="todas" hidden>Marcar todas como lidas</button>
      </div>
      <div class="pf-notificacoes-pagina__lista" aria-busy="true"></div>
      <div class="pf-notificacoes-pagina__mais"></div>
      <p class="dmc-sr-only" role="status" aria-live="polite" data-pf-notif-status></p>`;
    const lista = el.querySelector('.pf-notificacoes-pagina__lista');
    const mais = el.querySelector('.pf-notificacoes-pagina__mais');
    const status = el.querySelector('[data-pf-notif-status]');
    const botaoTodas = el.querySelector('[data-pf-notif-acao="todas"]');
    const anunciar = (t) => { status.textContent = ''; window.setTimeout(() => { status.textContent = t; }, 30); };

    function atualizarContagem() {
      const c = el.querySelector('[data-pf-notif-contagem]');
      if (c) c.textContent = E.naoLidas ? ` (${E.naoLidas})` : '';
      botaoTodas.hidden = !E.naoLidas;
      const shell = window.DMC_Shell;
      if (shell && shell.notificacoes && typeof shell.notificacoes.atualizar === 'function') shell.notificacoes.atualizar().catch(() => {});
    }

    function desenharLista() {
      lista.setAttribute('aria-busy', 'false');
      if (!E.itens.length) {
        lista.innerHTML = html`<div class="pf-vazio"><p class="pf-vazio__titulo">${E.filtro === 'nao-lidas' ? 'Nenhuma notificação não lida.' : 'Nenhuma notificação.'}</p></div>`;
        mais.replaceChildren();
        return;
      }
      const agora = new Date();
      const grupos = [];
      for (const n of E.itens) {
        const g = grupoDe(n.criadaEm, agora);
        let alvo = grupos.find((x) => x.nome === g);
        if (!alvo) { alvo = { nome: g, itens: [] }; grupos.push(alvo); }
        alvo.itens.push(n);
      }
      lista.innerHTML = html`${grupos.map((g, gi) => html`<section class="pf-notificacoes-pagina__grupo" aria-labelledby="pf-notif-grupo-${String(gi)}">
        <h2 class="dmc-overline" id="pf-notif-grupo-${String(gi)}">${g.nome}</h2>
        <ul class="pf-lista">${g.itens.map((n) => linha(n, g.nome))}</ul>
      </section>`)}`;
      const temMais = E.totalPaginas ? E.pagina < E.totalPaginas : !E.fim;
      mais.innerHTML = temMais
        ? html`<button type="button" class="dmc-btn dmc-btn--secondary pf-mais" data-pf-notif-acao="mais">Carregar mais</button>`
        : html`<p class="pf-ajuda pf-mais">Isso é tudo.</p>`;
      const b = mais.querySelector('[data-pf-notif-acao="mais"]');
      if (b) b.addEventListener('click', () => carregar(E.pagina + 1));
    }

    function linha(n, grupo) {
      const destino = n.link && HREF_INTERNO.test(String(n.link)) ? String(n.link) : null;
      const titulo = html`${n.lida ? '' : html`<span class="pf-notificacao__ponto" aria-hidden="true"></span><span class="dmc-sr-only">Não lida: </span>`}${n.titulo}`;
      return html`<li class="pf-notificacao${n.lida ? '' : ' pf-notificacao--nao-lida'}" data-notificacao-id="${n.id}">
        <span class="pf-notificacao__icone">${iconeDoTipo(n.tipo)}</span>
        <div class="pf-notificacao__corpo">
          ${destino
            ? html`<p class="pf-notificacao__titulo"><a href="${destino}" data-pf-notif-abrir="${n.id}">${titulo}</a></p>`
            : html`<p class="pf-notificacao__titulo">${titulo}</p>`}
          ${n.texto ? html`<p class="pf-notificacao__texto">${n.texto}</p>` : ''}
          <time class="pf-notificacao__quando" datetime="${n.criadaEm || ''}">${quando(n.criadaEm, grupo)}</time>
        </div>
        ${n.lida ? '' : html`<button type="button" class="pf-btn-icone pf-notificacao__lida" data-pf-notif-lida="${n.id}" aria-label="${`Marcar como lida: ${n.titulo}`}">${icone('check') || 'Lida'}</button>`}
      </li>`;
    }

    async function marcarLida(id) {
      await chamar('POST', API.lida(id), {});
      const n = E.itens.find((x) => x.id === id);
      if (n && !n.lida) { n.lida = true; if (E.naoLidas) E.naoLidas -= 1; }
      if (E.filtro === 'nao-lidas') E.itens = E.itens.filter((x) => x.id !== id);
    }

    lista.addEventListener('click', async (ev) => {
      const botao = ev.target.closest('[data-pf-notif-lida]');
      if (botao) {
        const id = botao.getAttribute('data-pf-notif-lida');
        const linhaEl = botao.closest('.pf-notificacao');
        const proxima = linhaEl && (linhaEl.nextElementSibling || linhaEl.previousElementSibling);
        botao.disabled = true;
        try {
          await marcarLida(id);
          desenharLista();
          atualizarContagem();
          anunciar('Notificação marcada como lida.');
          const foco = proxima && proxima.dataset ? lista.querySelector(`[data-notificacao-id="${CSS.escape(proxima.dataset.notificacaoId || '')}"] a, [data-notificacao-id="${CSS.escape(proxima.dataset.notificacaoId || '')}"] button`) : null;
          (foco || lista.querySelector('a, button') || el.querySelector('[data-pf-notif-filtro="todas"]')).focus();
        } catch (err) {
          botao.disabled = false;
          anunciar((err && err.message) || 'Não foi possível marcar agora.');
        }
        return;
      }
      const abrir = ev.target.closest('[data-pf-notif-abrir]');
      if (abrir) {
        const id = abrir.getAttribute('data-pf-notif-abrir');
        const n = E.itens.find((x) => x.id === id);
        if (n && !n.lida) {
          ev.preventDefault();
          const href = abrir.getAttribute('href');
          // Marca e abre; a marcação não segura a navegação por mais de 1,5 s.
          await Promise.race([marcarLida(id).catch(() => {}), new Promise((ok) => window.setTimeout(ok, 1500))]);
          window.location.href = href;
        }
        return;
      }
      // A linha inteira é o alvo do ponteiro (UX §6.14 "Clicar abre o destino e marca"); o teclado usa o link
      // do título. Texto selecionado não navega.
      const linhaEl = ev.target.closest('.pf-notificacao');
      const link = linhaEl && !ev.target.closest('a, button') ? linhaEl.querySelector('a[data-pf-notif-abrir]') : null;
      const selecao = window.getSelection ? String(window.getSelection()) : '';
      if (link && !selecao) link.click();
    });

    el.querySelectorAll('[data-pf-notif-filtro]').forEach((b) => b.addEventListener('click', () => {
      const f = b.getAttribute('data-pf-notif-filtro');
      if (f === E.filtro) return;
      E.filtro = f;
      el.querySelectorAll('[data-pf-notif-filtro]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      carregar(1);
    }));

    botaoTodas.addEventListener('click', async () => {
      botaoTodas.disabled = true;
      try {
        await chamar('POST', API.todas, {});
        E.itens.forEach((n) => { n.lida = true; });
        if (E.filtro === 'nao-lidas') E.itens = [];
        E.naoLidas = 0;
        desenharLista();
        atualizarContagem();
        anunciar('Todas as notificações foram marcadas como lidas.');
        el.querySelector('[data-pf-notif-filtro="todas"]').focus();
      } catch (err) {
        anunciar((err && err.message) || 'Não foi possível marcar agora.');
      } finally { botaoTodas.disabled = false; }
    });

    async function carregar(pagina) {
      if (pagina === 1) { lista.setAttribute('aria-busy', 'true'); }
      const botaoMais = mais.querySelector('[data-pf-notif-acao="mais"]');
      if (botaoMais) { botaoMais.disabled = true; botaoMais.setAttribute('aria-busy', 'true'); }
      let r;
      try {
        r = await chamar('GET', API.lista(pagina, E.filtro === 'nao-lidas'), undefined, { silencioso404: true, sinal });
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        lista.setAttribute('aria-busy', 'false');
        lista.innerHTML = html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>Não foi possível carregar as notificações.</p>
          <button type="button" class="dmc-btn dmc-btn--secondary pf-alerta__acao" data-pf-notif-acao="tentar">Tentar de novo</button></div>`;
        lista.querySelector('[data-pf-notif-acao="tentar"]').addEventListener('click', () => carregar(pagina));
        return;
      }
      if (!E.vivo) return;
      if (!r) {
        lista.setAttribute('aria-busy', 'false');
        lista.innerHTML = html`<p class="pf-alerta pf-alerta--info">As notificações estão indisponíveis no momento.</p>`;
        el.querySelector('.pf-notificacoes-pagina__barra').hidden = true;
        return;
      }
      const novos = Array.isArray(r.itens) ? r.itens : [];
      E.itens = pagina === 1 ? novos : E.itens.concat(novos.filter((n) => !E.itens.some((x) => x.id === n.id)));
      E.pagina = pagina;
      E.totalPaginas = Number.isFinite(r.totalPaginas) ? r.totalPaginas : null;
      E.fim = novos.length < (r.porPagina || POR_PAGINA);
      if (typeof r.naoLidas === 'number') E.naoLidas = r.naoLidas;
      desenharLista();
      atualizarContagem();
      if (pagina > 1) anunciar(`${novos.length} notificações carregadas.`);
    }

    carregar(1);
    return { destruir() { E.vivo = false; el.replaceChildren(); } };
  }

  // Backoffice: rota #/notificacoes de professor.html (DMC_Professor da F8).
  const body = document.body;
  if (body && body.dataset.pagina === 'professor') {
    if (window.DMC_Professor && typeof window.DMC_Professor.registrar === 'function') {
      window.DMC_Professor.registrar({
        rota: 'notificacoes',
        titulo: 'Notificações',
        papeis: ['professor', 'admin'],
        montar: (el, ctx) => montar(el, { sinal: ctx && ctx.sinal })
      });
    }
    return;
  }

  if (!window.DMC_Portal) return;
  window.DMC_Portal.iniciar(async (ctx) => {
    montar(document.getElementById('pf-notificacoes-raiz'), { sinal: ctx.sinal });
  }, { pagina: 'notificacoes' });
})();
