/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/busca.js (F0p)
   Tela: busca.html?q=&tipo= — PORTAL-UX.md §6.18 (campo grande,
   pf-segmento de tipos igual ao do painel do topo, grupos com
   "Carregar mais"). API: PORTAL-API.md §6.4 (GET /portal/busca;
   grupos sem permissão vêm omitidos; href sempre interno).
   O termo de busca fica só na URL da página (nunca em storage, §7.9).

   Lacuna da F0b em obra: erro com status/codigo no DMC_Api (§7.1) —
   `chamar()` local com o mesmo token e a mesma base.
   ============================================================= */
(function () {
  'use strict';

  const UI = window.DMC_UI;
  if (!UI || !window.DMC_Portal) return;
  const html = UI.html;

  const API = {
    busca: ({ q, tipos, limite, pagina }) => {
      const p = new URLSearchParams({ q });
      if (tipos) p.set('tipos', tipos);
      if (limite) p.set('limite', String(limite));
      if (pagina) p.set('pagina', String(pagina));
      return `/portal/busca?${p.toString()}`;
    }
  };
  const TIPOS = [
    { valor: 'tudo', rotulo: 'Tudo' },
    { valor: 'cursos', rotulo: 'Cursos' },
    { valor: 'aulas', rotulo: 'Aulas' },
    { valor: 'publicacoes', rotulo: 'Publicações' },
    { valor: 'atendimentos', rotulo: 'Atendimentos' },
    { valor: 'documentos', rotulo: 'Documentos' }
  ];
  const ROTULO_GRUPO = Object.fromEntries(TIPOS.map((t) => [t.valor, t.rotulo]));
  const ORDEM = ['cursos', 'aulas', 'publicacoes', 'atendimentos', 'documentos'];
  const LIMITE_GRUPO = 5;
  const LIMITE_MAIS = 20;
  const HREF_INTERNO = /^[a-z0-9_-]+\.html(?:\?[^\s#]*)?(?:#\S*)?$/i;

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
  async function chamar(caminho, sinal) {
    const A = window.DMC_Api;
    const cab = {};
    const t = A && A.token();
    if (t) cab.Authorization = `Bearer ${t}`;
    let res;
    try { res = await fetch(BASE + caminho, { headers: cab, signal: sinal, credentials: 'same-origin' }); }
    catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw Object.assign(new Error('Sem conexão. Verifique a internet e tente de novo.'), { status: 0 });
    }
    if (res.status === 401 && A) {
      const tinhaSessao = !!A.token();
      A.setToken(null);
      if (tinhaSessao) sessaoEncerrada();
    }
    if (res.status === 404) return null;
    const texto = await res.text();
    let dados = null;
    if (texto) { try { dados = JSON.parse(texto); } catch { dados = null; } }
    if (!res.ok) {
      throw Object.assign(new Error((dados && dados.error) || `Erro ${res.status} no servidor.`), {
        status: res.status, codigo: dados && dados.codigo, requestId: (dados && dados.requestId) || res.headers.get('X-Request-Id') || undefined
      });
    }
    return dados;
  }

  const icone = (chave, op) => (typeof UI.icone === 'function' ? UI.icone(chave, op) : '');

  const E = { q: '', tipo: 'tudo', grupos: {}, paginas: {}, controlador: null, raiz: null };

  function lerUrl() {
    const p = new URLSearchParams(window.location.search);
    E.q = (p.get('q') || '').trim().slice(0, 80);
    const t = p.get('tipo') || 'tudo';
    E.tipo = TIPOS.some((x) => x.valor === t) ? t : 'tudo';
  }

  function gravarUrl() {
    const p = new URLSearchParams();
    if (E.q) p.set('q', E.q);
    if (E.tipo !== 'tudo') p.set('tipo', E.tipo);
    const qs = p.toString();
    try { window.history.replaceState(null, '', `busca.html${qs ? `?${qs}` : ''}`); } catch { /* sem history */ }
  }

  function desenharMoldura() {
    E.raiz.innerHTML = html`
      <form class="pf-busca-pagina__form" role="search" novalidate>
        <div class="pf-campo">
          <label class="pf-rotulo" for="pf-busca-termo">Buscar no portal</label>
          <input class="pf-input pf-busca-pagina__campo" id="pf-busca-termo" name="q" type="search" value="${E.q}" maxlength="80" autocomplete="off" spellcheck="false" aria-describedby="pf-busca-ajuda pf-busca-erro">
          <p class="pf-ajuda" id="pf-busca-ajuda">De 2 a 80 caracteres. Acentos não fazem diferença.</p>
          <p class="pf-erro-campo" id="pf-busca-erro" hidden></p>
        </div>
        <div class="pf-busca-pagina__acoes"><button type="submit" class="dmc-btn dmc-btn--primary">Buscar</button></div>
      </form>
      <div class="pf-segmento pf-busca-pagina__filtros" role="group" aria-label="Filtrar resultados por tipo">
        ${TIPOS.map((t) => html`<button type="button" class="pf-segmento__opcao" data-pf-busca-tipo="${t.valor}" aria-pressed="${t.valor === E.tipo ? 'true' : 'false'}">${t.rotulo}</button>`)}
      </div>
      <p class="dmc-sr-only" role="status" aria-live="polite" data-pf-busca-status></p>
      <div class="pf-busca-pagina__resultados" aria-busy="false"></div>`;
    E.raiz.setAttribute('aria-busy', 'false');

    const form = E.raiz.querySelector('form');
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      E.q = form.elements.namedItem('q').value.trim();
      buscar();
    });
    E.raiz.querySelectorAll('[data-pf-busca-tipo]').forEach((b) => b.addEventListener('click', () => {
      E.tipo = b.getAttribute('data-pf-busca-tipo');
      E.raiz.querySelectorAll('[data-pf-busca-tipo]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      E.q = form.elements.namedItem('q').value.trim();
      if (E.q) buscar(); else gravarUrl();
    }));
  }

  function marcarErro(texto) {
    const entrada = document.getElementById('pf-busca-termo');
    const p = document.getElementById('pf-busca-erro');
    p.textContent = texto || '';
    p.hidden = !texto;
    if (texto) entrada.setAttribute('aria-invalid', 'true'); else entrada.removeAttribute('aria-invalid');
  }

  function anunciar(texto) {
    const s = E.raiz.querySelector('[data-pf-busca-status]');
    if (!s) return;
    s.textContent = '';
    window.setTimeout(() => { s.textContent = texto; }, 30);
  }

  async function buscar() {
    marcarErro('');
    gravarUrl();
    const res = E.raiz.querySelector('.pf-busca-pagina__resultados');
    if (!E.q) { res.replaceChildren(); return; }
    if (E.q.length < 2) { marcarErro('Digite pelo menos 2 caracteres.'); document.getElementById('pf-busca-termo').focus(); return; }
    if (E.controlador) E.controlador.abort();
    E.controlador = new AbortController();
    res.setAttribute('aria-busy', 'true');
    res.innerHTML = html`<p class="pf-ajuda">Buscando…</p>`;
    let r;
    try {
      r = await chamar(API.busca({ q: E.q, tipos: E.tipo === 'tudo' ? '' : E.tipo, limite: E.tipo === 'tudo' ? LIMITE_GRUPO : LIMITE_MAIS }), E.controlador.signal);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      res.setAttribute('aria-busy', 'false');
      if (err && err.status === 400) { res.replaceChildren(); marcarErro(err.message || 'Termo de busca inválido.'); return; }
      res.innerHTML = html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>${(err && err.status && err.message) || 'Não foi possível buscar agora.'}</p>
        <button type="button" class="dmc-btn dmc-btn--secondary pf-alerta__acao" data-pf-busca-acao="tentar">Tentar de novo</button></div>`;
      res.querySelector('[data-pf-busca-acao="tentar"]').addEventListener('click', buscar);
      return;
    }
    res.setAttribute('aria-busy', 'false');
    if (!r) { res.innerHTML = html`<p class="pf-alerta pf-alerta--info">A busca está indisponível no momento.</p>`; return; }
    E.grupos = {};
    E.paginas = {};
    const grupos = r.grupos || {};
    for (const tipo of ORDEM) {
      if (!grupos[tipo]) continue;
      E.grupos[tipo] = { itens: Array.isArray(grupos[tipo].itens) ? grupos[tipo].itens : [], temMais: !!grupos[tipo].temMais };
      E.paginas[tipo] = E.tipo === 'tudo' ? 0 : 1;
    }
    desenharResultados();
  }

  function desenharResultados() {
    const res = E.raiz.querySelector('.pf-busca-pagina__resultados');
    const tipos = ORDEM.filter((t) => E.grupos[t] && E.grupos[t].itens.length);
    const total = tipos.reduce((s, t) => s + E.grupos[t].itens.length, 0);
    if (!total) {
      res.innerHTML = html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nada encontrado para "${E.q}". Tente outro termo ou mude o filtro.</p></div>`;
      anunciar(`Nada encontrado para ${E.q}.`);
      return;
    }
    res.innerHTML = html`${tipos.map((t) => html`<section class="pf-busca-pagina__grupo" aria-labelledby="pf-busca-grupo-${t}" data-grupo="${t}">
      <h2 class="dmc-overline" id="pf-busca-grupo-${t}">${ROTULO_GRUPO[t]}</h2>
      <ul class="pf-lista">${E.grupos[t].itens.map(item)}</ul>
      ${E.grupos[t].temMais ? html`<button type="button" class="dmc-btn dmc-btn--secondary pf-mais" data-pf-busca-mais="${t}">Carregar mais em ${ROTULO_GRUPO[t]}</button>` : ''}
    </section>`)}`;
    res.querySelectorAll('[data-pf-busca-mais]').forEach((b) => b.addEventListener('click', () => carregarMais(b.getAttribute('data-pf-busca-mais'), b)));
    anunciar(`${total} ${total === 1 ? 'resultado' : 'resultados'} para ${E.q}.`);
  }

  function item(i) {
    const href = i.href && HREF_INTERNO.test(String(i.href)) ? String(i.href) : null;
    const trava = i.bloqueado ? html` <span class="pf-busca-pagina__cadeado">${icone('lock') || ''}<span class="dmc-sr-only">(sem acesso)</span></span>` : '';
    return html`<li class="pf-lista__linha">
      ${href ? html`<a class="pf-lista__titulo" data-alvo-excecao="linha-inteira" href="${href}">${i.titulo}${trava}</a>` : html`<p class="pf-lista__titulo">${i.titulo}${trava}</p>`}
      ${i.contexto ? html`<p class="pf-lista__meta">${i.contexto}</p>` : ''}
    </li>`;
  }

  async function carregarMais(tipo, botao) {
    botao.disabled = true;
    botao.setAttribute('aria-busy', 'true');
    const pagina = (E.paginas[tipo] || 0) + 1;
    try {
      const r = await chamar(API.busca({ q: E.q, tipos: tipo, limite: LIMITE_MAIS, pagina }));
      const g = r && r.grupos && r.grupos[tipo];
      if (!g) throw Object.assign(new Error('A busca está indisponível no momento.'), { status: 404 });
      const novos = Array.isArray(g.itens) ? g.itens : [];
      const atuais = E.grupos[tipo].itens;
      const vistos = new Set(atuais.map((x) => `${x.tipo}:${x.id}`));
      E.grupos[tipo] = { itens: atuais.concat(novos.filter((x) => !vistos.has(`${x.tipo}:${x.id}`))), temMais: !!g.temMais };
      E.paginas[tipo] = pagina;
      const antes = atuais.length;
      desenharResultados();
      const linhas = E.raiz.querySelectorAll(`[data-grupo="${tipo}"] .pf-lista__linha`);
      const alvo = linhas[antes] && linhas[antes].querySelector('a, .pf-lista__titulo');
      if (alvo) { if (!alvo.matches('a')) alvo.setAttribute('tabindex', '-1'); alvo.focus(); }
    } catch (err) {
      botao.disabled = false;
      botao.removeAttribute('aria-busy');
      anunciar((err && err.message) || 'Não foi possível carregar mais agora.');
    }
  }

  async function boot() {
    E.raiz = document.getElementById('pf-busca-raiz');
    lerUrl();
    desenharMoldura();
    if (E.q) await buscar();
    else document.getElementById('pf-busca-termo').focus();
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'busca' });
})();
