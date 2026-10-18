/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/ui.js (F0b)
   Spec: docs/dmc/PORTAL-ACADEMICO.md §7.4 (DMC_Portal), §7.5
   (DMC_UI), §5.4 (guardas), §6.2 (uma página = um boot que termina
   com DMC_Portal.iniciar), D-34, D-47, D-57, D-63, D-75, D-76;
   PORTAL-UX.md §4 (componentes), §10 (carregando, vazio, erro).

   Contrato completo (S3): HTML seguro (html · esc · cru · icone),
   retorno ao usuário (toast · anunciar · confirmar · dialogo ·
   formulario · reautenticar · consentimento), estados de tela
   (esqueleto · estadoVazio · erroCarga · ocupado · alerta), componentes
   (estado/chip · tabela · abas · filtros · kpis · donut · progresso ·
   barras · codigo · imagemProtegida), arquivos (baixar · abrirArquivo ·
   upload · carregarScript) e fmt · valida · mascara. O CSS é o catálogo
   pf-* de css/portal.css (F0s); aqui só o comportamento e o markup.

   Carregado em TODA página da plataforma (cabecalho-ead.mjs, S2),
   antes de js/shell.js: ao carregar só define os dois globais e um
   ouvinte de clique para o [Copiar] do pf-codigo — nenhuma chamada de
   rede, nenhum efeito na página. Quem age é o boot da página, ao chamar
   DMC_Portal.iniciar.

   Gancho estável da D5 (D-76): em DMC_UI.confirmar (e nos demais
   diálogos com ação), o botão de confirmar leva data-pf-acao="confirmar"
   e o de cancelar data-pf-acao="cancelar" (SELETORES_D5.DIALOGO).

   HTML seguro (§7.0: nenhum módulo monta HTML com dado sem
   DMC_UI.html):
     DMC_UI.html`<p title="${a}">${b}</p>`
       - interpolação escapada (& < > " '); null, undefined e false
         viram ''; arrays concatenam (não use .join(''): a string
         unida seria escapada de novo);
       - passa SEM escape: o retorno de DMC_UI.html e de DMC_UI.icone
         (e dos componentes que devolvem string) e DMC_UI.cru(x);
       - valor inteiro de atributo de URL (href, src, action,
         formaction, poster, cite, xlink:href) com esquema fora de
         http, https, mailto, tel, blob ou data:image vira
         'about:invalid#dmc' (javascript: nunca chega ao DOM);
       - escreva atributos entre aspas; valor inteiro de atributo sem
         aspas (`class=${x}`) recebe as aspas aqui.
     O retorno é um objeto String marcado (innerHTML, concatenação,
     template e métodos de string funcionam; typeof é 'object'; para
     comparar com ===, use String(x)).
   ============================================================= */
(function () {
  'use strict';

  if (window.DMC_UI && window.DMC_Portal) return; // carregado duas vezes: o primeiro vale

  // -----------------------------------------------------------------
  // HTML seguro
  // -----------------------------------------------------------------
  const MAPA_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** = DMC_escapeHtml de app.js (mesmo resultado, sem depender da ordem de carga). */
  function esc(valor) {
    if (valor == null) return '';
    return String(valor).replace(/[&<>"']/g, (c) => MAPA_ESCAPE[c]);
  }

  /** Markup que já é seguro: produzido por DMC_UI.html, DMC_UI.icone e afins. */
  class HtmlSeguro extends String {}
  const seguro = (s) => new HtmlSeguro(s == null ? '' : String(s));

  // Só objetos criados por DMC_UI.cru passam crus: um {__cru} vindo de JSON da API é escapado.
  const CRUS = new WeakSet();
  function cru(htmlConfiavel) {
    const obj = Object.freeze({ __cru: htmlConfiavel == null ? '' : String(htmlConfiavel) });
    CRUS.add(obj);
    return obj;
  }

  // Valor inteiro de atributo de URL: o trecho estático anterior termina em `href="` (ou `href=`).
  const RE_ATRIBUTO_URL = /\s(?:href|src|action|formaction|poster|cite|xlink:href)\s*=\s*["']?$/i;
  const ESQUEMAS_OK = ['http', 'https', 'mailto', 'tel', 'blob'];
  const URL_BLOQUEADA = 'about:invalid#dmc';

  function urlSegura(texto) {
    // O navegador ignora controles e espaços ao ler o esquema ("java\nscript:").
    const limpo = texto.replace(/[\u0000- \u007f-\u009f]/g, '');
    const m = /^([a-z][a-z0-9+.-]*):/i.exec(limpo);
    if (!m) return texto; // relativa (aula.html?id=…, /api/…, #ancora, //host)
    const esquema = m[1].toLowerCase();
    if (ESQUEMAS_OK.indexOf(esquema) >= 0) return texto;
    if (esquema === 'data' && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(limpo)) return texto;
    return URL_BLOQUEADA;
  }

  function paraHtml(valor, emUrl) {
    if (valor == null || valor === false) return '';
    if (valor instanceof HtmlSeguro) return valor.valueOf();
    if (typeof valor === 'object' && CRUS.has(valor)) return valor.__cru;
    if (Array.isArray(valor)) {
      let saida = '';
      for (const item of valor) saida += paraHtml(item, false);
      return saida;
    }
    const texto = String(valor);
    return esc(emUrl ? urlSegura(texto) : texto);
  }

  /**
   * A saída até aqui termina num valor de atributo SEM aspas (`<a class=`)? Varre desde o último
   * `<letra`: as aspas abertas e fechadas dizem se estamos dentro de um valor; `>` fecha a tag.
   * Valores escapados nunca trazem < > " ', então só o markup estático conta.
   */
  function atributoSemAspas(saida) {
    if (!/=\s*$/.test(saida)) return false;
    const inicio = saida.lastIndexOf('<');
    if (inicio < 0 || !/[a-z]/i.test(saida.charAt(inicio + 1))) return false;
    let aspas = '';
    for (let i = inicio + 1; i < saida.length; i++) {
      const c = saida[i];
      if (aspas) { if (c === aspas) aspas = ''; }
      else if (c === '"' || c === "'") aspas = c;
      else if (c === '>') return false;
    }
    return !aspas;
  }

  function html(partes, ...valores) {
    if (!partes || !Array.isArray(partes.raw)) {
      throw new TypeError('DMC_UI.html é uma template tag: use DMC_UI.html`...`.');
    }
    let saida = partes[0];
    for (let i = 0; i < valores.length; i++) {
      const valor = paraHtml(valores[i], RE_ATRIBUTO_URL.test(partes[i]));
      // Atributo sem aspas: um espaço no dado abriria outro atributo. As aspas entram aqui.
      saida += (atributoSemAspas(saida) ? `"${valor}"` : valor) + partes[i + 1];
    }
    return seguro(saida);
  }

  // -----------------------------------------------------------------
  // Ícones (DMC_Icons de app.js; conjunto da UX §4.12)
  // -----------------------------------------------------------------
  const RE_SVG_ABERTURA = /^(\s*)<svg\b([^>]*)>/i;
  const RE_ATRIBUTOS_A11Y = /\s(?:aria-hidden|aria-label|aria-labelledby|role|focusable)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

  /** SVG decorativo (aria-hidden) ou, com rótulo, role="img" + aria-label. Chave desconhecida → ''. */
  function icone(chave, opcoes) {
    const rotulo = opcoes && opcoes.rotulo != null ? String(opcoes.rotulo).trim() : '';
    const icones = window.DMC_Icons;
    const svg = icones && Object.prototype.hasOwnProperty.call(icones, chave) ? icones[chave] : null;
    if (typeof svg !== 'string' || !RE_SVG_ABERTURA.test(svg)) return seguro('');
    const a11y = rotulo
      ? ` role="img" aria-label="${esc(rotulo)}" focusable="false"`
      : ' aria-hidden="true" focusable="false"';
    return seguro(svg.replace(RE_SVG_ABERTURA, (_, espaco, atributos) =>
      `${espaco}<svg${atributos.replace(RE_ATRIBUTOS_A11Y, '')}${a11y}>`));
  }

  // -----------------------------------------------------------------
  // Erro de carga (UX §4.10): pf-alerta--erro no lugar do conteúdo,
  // [Tentar de novo] e o código recolhido para quem for reportar.
  // -----------------------------------------------------------------
  function erroCarga(el, erro, opcoes) {
    const tentarDeNovo = opcoes && typeof opcoes.tentarDeNovo === 'function' ? opcoes.tentarDeNovo : null;
    const e = erro || {};
    const status = Number(e.status) || null;
    // Mensagem do servidor (corpo.error, pt-BR) só quando veio da API; erro de código não vai à tela.
    const texto = status && e.message ? e.message : 'Verifique sua conexão e tente de novo.';
    const detalhe = [
      status ? `Código ${status}` : '',
      e.codigo ? String(e.codigo) : '',
      e.requestId ? `Requisição ${e.requestId}` : ''
    ].filter(Boolean).join(' · ');

    const caixa = document.createElement('div');
    caixa.className = 'pf-alerta pf-alerta--erro';
    caixa.setAttribute('role', 'alert');
    caixa.innerHTML = html`${icone('estadoErro')}
      <p class="pf-alerta__titulo">Não foi possível carregar esta página agora.</p>
      <p>${texto}</p>
      ${tentarDeNovo ? html`<button type="button" class="dmc-btn dmc-btn--secondary pf-alerta__acao" data-pf-acao="tentar-de-novo">Tentar de novo</button>` : ''}
      ${detalhe ? html`<details class="pf-alerta__detalhe"><summary>Detalhes para o suporte</summary><p>${detalhe}</p></details>` : ''}`;
    if (tentarDeNovo) {
      caixa.querySelector('[data-pf-acao="tentar-de-novo"]').addEventListener('click', () => tentarDeNovo());
    }
    if (el) {
      el.replaceChildren(caixa);
      el.setAttribute('aria-busy', 'false');
    }
    return caixa;
  }


  // -----------------------------------------------------------------
  // Utilidades internas
  // -----------------------------------------------------------------
  let sequencia = 0;
  const novoId = (prefixo) => `${prefixo}-${++sequencia}`;
  const temDOM = () => typeof document !== 'undefined' && !!document.body;

  /** Nó a partir de markup seguro (string de DMC_UI.html) ou Node. */
  function paraNo(conteudo) {
    if (conteudo == null) return document.createTextNode('');
    if (typeof Node !== 'undefined' && conteudo instanceof Node) return conteudo;
    const t = document.createElement('template');
    t.innerHTML = paraHtml(conteudo, false);
    return t.content;
  }
  function criar(markup) {
    const t = document.createElement('template');
    t.innerHTML = String(markup).trim();
    return t.content.firstElementChild;
  }
  /** Glifo de estado por tom (forma própria por tom, UX §2.3). */
  const GLIFO_DO_TOM = { sucesso: 'estadoSucesso', aviso: 'estadoAviso', erro: 'estadoErro', info: 'estadoInfo', neutro: 'estadoNeutro' };
  const TONS = ['sucesso', 'aviso', 'erro', 'info', 'neutro'];
  const tomValido = (tom, padrao = 'info') => (TONS.indexOf(tom) >= 0 ? tom : padrao);

  // -----------------------------------------------------------------
  // Anúncios para leitor de tela (regiões vivas criadas sob demanda)
  // -----------------------------------------------------------------
  const regioes = {};
  function regiao(assertivo) {
    const chave = assertivo ? 'assertivo' : 'polido';
    if (regioes[chave] && regioes[chave].isConnected) return regioes[chave];
    const el = document.createElement('div');
    el.className = 'dmc-sr-only';
    el.id = `pf-anuncio-${chave}`;
    el.setAttribute('aria-live', assertivo ? 'assertive' : 'polite');
    el.setAttribute('aria-atomic', 'true');
    if (assertivo) el.setAttribute('role', 'alert'); else el.setAttribute('role', 'status');
    document.body.appendChild(el);
    regioes[chave] = el;
    return el;
  }
  function anunciar(texto, opcoes) {
    if (!temDOM()) return;
    const el = regiao(!!(opcoes && opcoes.assertivo));
    el.textContent = '';
    // Tempo para o leitor perceber a troca mesmo com o mesmo texto.
    setTimeout(() => { el.textContent = texto == null ? '' : String(texto); }, 60);
  }

  // -----------------------------------------------------------------
  // Toast (UX §4.10, DC-10): máx. 3; erro e toast com ação não somem sozinhos
  // -----------------------------------------------------------------
  const MAX_TOASTS = 3;
  function pilhaToasts() {
    let el = document.querySelector('.pf-toasts');
    if (!el) {
      el = document.createElement('div');
      el.className = 'pf-toasts';
      document.body.appendChild(el);
    }
    return el;
  }
  function toast(mensagem, opcoes) {
    if (!temDOM()) return;
    const o = opcoes || {};
    const tipo = ['sucesso', 'aviso', 'erro', 'info'].indexOf(o.tipo) >= 0 ? o.tipo : 'info';
    const acao = o.acao && o.acao.rotulo ? o.acao : null;
    const fixo = tipo === 'erro' || !!acao;
    const duracao = Number(o.duracaoMs) > 0 ? Number(o.duracaoMs) : 6000;
    const pilha = pilhaToasts();
    while (pilha.children.length >= MAX_TOASTS) pilha.firstElementChild.remove();

    const el = criar(html`<div class="pf-toast pf-toast--${tipo}" role="${tipo === 'erro' ? 'alert' : 'status'}">
      ${icone(GLIFO_DO_TOM[tipo])}<p>${mensagem}</p>
      <div class="pf-toast__acoes">
        ${acao ? html`<button type="button" class="pf-toast__acao" data-pf-toast="acao">${acao.rotulo}</button>` : ''}
        <button type="button" class="pf-toast__fechar pf-btn-icone" data-pf-toast="fechar" aria-label="Fechar aviso">${icone('fechar')}</button>
      </div></div>`);
    let timer = null;
    let restante = duracao;
    let inicio = 0;
    const sair = () => {
      clearTimeout(timer);
      if (!el.isConnected) return;
      el.classList.add('is-saindo');
      setTimeout(() => el.remove(), 200);
    };
    const armar = () => {
      if (fixo) return;
      inicio = Date.now();
      timer = setTimeout(sair, restante);
    };
    const pausar = () => {
      if (fixo || !timer) return;
      clearTimeout(timer);
      timer = null;
      restante = Math.max(1000, restante - (Date.now() - inicio));
    };
    el.addEventListener('mouseenter', pausar);
    el.addEventListener('focusin', pausar);
    el.addEventListener('mouseleave', () => { if (!el.contains(document.activeElement)) armar(); });
    el.addEventListener('focusout', (e) => { if (!el.contains(e.relatedTarget)) armar(); });
    el.querySelector('[data-pf-toast="fechar"]').addEventListener('click', sair);
    if (acao) {
      el.querySelector('[data-pf-toast="acao"]').addEventListener('click', () => {
        sair();
        if (typeof acao.aoClicar === 'function') acao.aoClicar();
      });
    }
    pilha.appendChild(el);
    armar();
  }

  // -----------------------------------------------------------------
  // Alerta, vazio, esqueleto, ocupado (UX §4.10, §10)
  // -----------------------------------------------------------------
  function botaoOuLink(acao, classe) {
    if (!acao || !acao.rotulo) return '';
    if (acao.href) return html`<a class="${classe}" href="${acao.href}">${acao.rotulo}</a>`;
    return html`<button type="button" class="${classe}" data-pf-acao="acao">${acao.rotulo}</button>`;
  }
  function ligarAcao(raiz, acao) {
    if (!acao || acao.href || typeof acao.aoClicar !== 'function') return;
    const b = raiz.querySelector('[data-pf-acao="acao"]');
    if (b) b.addEventListener('click', (e) => acao.aoClicar(e));
  }
  /** pf-alerta; com `el`, substitui o conteúdo dele. role=alert só em erro; sucesso = status. */
  function alerta(el, opcoes) {
    const o = opcoes || {};
    const tom = tomValido(o.tom, 'info');
    const caixa = criar(html`<div class="pf-alerta pf-alerta--${tom}${o.compacto ? ' pf-alerta--compacto' : ''}">
      ${icone(GLIFO_DO_TOM[tom])}
      ${o.titulo && !o.compacto ? html`<p class="pf-alerta__titulo">${o.titulo}</p>` : ''}
      ${o.texto ? html`<p>${o.texto}</p>` : ''}
      ${botaoOuLink(o.acao, 'dmc-btn dmc-btn--secondary pf-alerta__acao')}</div>`);
    if (tom === 'erro') caixa.setAttribute('role', 'alert');
    else if (tom === 'sucesso') caixa.setAttribute('role', 'status');
    ligarAcao(caixa, o.acao);
    if (el) el.replaceChildren(caixa);
    return caixa;
  }
  function estadoVazio(el, opcoes) {
    const o = opcoes || {};
    const caixa = criar(html`<div class="pf-vazio">
      ${o.icone ? html`<span class="pf-vazio__icone">${icone(o.icone)}</span>` : ''}
      ${o.titulo ? html`<p class="pf-vazio__titulo">${o.titulo}</p>` : ''}
      ${o.texto ? html`<p class="pf-vazio__texto">${o.texto}</p>` : ''}
      ${o.acao && o.acao.rotulo ? html`<div class="pf-vazio__acoes">${botaoOuLink(o.acao, 'dmc-btn dmc-btn--secondary')}</div>` : ''}</div>`);
    ligarAcao(caixa, o.acao);
    if (el) {
      el.replaceChildren(caixa);
      el.setAttribute('aria-busy', 'false');
    }
    return caixa;
  }
  function esqueleto(el, opcoes) {
    if (!el) return;
    const o = opcoes || {};
    const n = Math.max(1, Math.min(12, Number(o.linhas) || 3));
    const rep = (k, classe) => Array.from({ length: k }, () => html`<span class="pf-esqueleto ${classe}"></span>`);
    let pecas;
    switch (o.tipo) {
      case 'cards': pecas = rep(n, 'pf-esqueleto--bloco'); break;
      case 'tabela': pecas = [rep(1, 'pf-esqueleto--texto'), rep(n, 'pf-esqueleto--linha')]; break;
      case 'texto': pecas = rep(n, 'pf-esqueleto--texto'); break;
      case 'heroi': pecas = [rep(1, 'pf-esqueleto--bloco'), rep(2, 'pf-esqueleto--texto')]; break;
      default: pecas = rep(n, 'pf-esqueleto--linha');
    }
    el.innerHTML = html`<div class="pf-esqueleto-grupo" aria-hidden="true">${pecas}</div><p class="dmc-sr-only">Carregando…</p>`;
    el.setAttribute('aria-busy', 'true');
  }
  const OCUPADOS = new WeakMap();
  /** disabled + aria-busy; depois de 10 s, "Ainda processando…". Desocupar devolve o rótulo. */
  function ocupado(botao, sim, rotuloOcupado) {
    if (!botao) return;
    const atual = OCUPADOS.get(botao);
    if (sim) {
      if (atual) return;
      const guardado = { markup: botao.innerHTML, timer: null };
      OCUPADOS.set(botao, guardado);
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      if (rotuloOcupado) botao.textContent = rotuloOcupado;
      guardado.timer = setTimeout(() => { if (OCUPADOS.get(botao) === guardado) botao.textContent = 'Ainda processando…'; }, 10000);
      return;
    }
    if (!atual) { botao.disabled = false; botao.removeAttribute('aria-busy'); return; }
    clearTimeout(atual.timer);
    OCUPADOS.delete(botao);
    botao.innerHTML = atual.markup;
    botao.disabled = false;
    botao.removeAttribute('aria-busy');
  }

  // -----------------------------------------------------------------
  // Marcador, progresso, donut, barras, KPIs, código (UX §4.3, §4.9, §4.11)
  // -----------------------------------------------------------------
  function estado(rotulo, tom, opcoes) {
    const t = tomValido(tom, 'neutro');
    const destaque = !!(opcoes && opcoes.destaque);
    const glifo = String(icone(GLIFO_DO_TOM[t])).replace(/^<svg\b/, '<svg class="pf-estado__glifo"');
    return html`<span class="pf-estado pf-estado--${t}${destaque ? ' pf-estado--destaque' : ''}">${cru(glifo)}${rotulo}</span>`;
  }
  const limitarPct = (pct) => {
    const n = Number(pct);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  };
  function progresso(pct, opcoes) {
    const p = Math.round(limitarPct(pct));
    const rotulo = opcoes && opcoes.rotulo ? opcoes.rotulo : 'Progresso';
    return html`<div class="pf-progresso${p === 100 ? ' pf-progresso--completo' : ''}"><span class="pf-progresso__barra" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="${rotulo}" style="--pf-pct: ${p / 100}"></span><span class="pf-progresso__texto">${p}%</span></div>`;
  }
  function donut(el, opcoes) {
    if (!el) return;
    const o = opcoes || {};
    const p = Math.round(limitarPct(o.pct));
    const rotulo = o.rotulo || `${p}%`;
    el.innerHTML = html`<figure class="pf-donut"><svg viewBox="0 0 36 36" role="img" aria-label="${rotulo}" focusable="false"><circle class="pf-donut__trilho" cx="18" cy="18" r="15.9155" stroke-width="3"/><circle class="pf-donut__arco" cx="18" cy="18" r="15.9155" stroke-width="3" stroke-dasharray="${p} 100"/></svg><span class="pf-donut__valor" aria-hidden="true">${p}%</span></figure>`;
  }
  function barras(el, opcoes) {
    if (!el) return;
    const o = opcoes || {};
    const linhas = Array.isArray(o.linhas) ? o.linhas : [];
    const max = linhas.reduce((m, l) => Math.max(m, Number(l.valor) || 0), 0);
    el.innerHTML = html`<figure class="pf-barras"><table>
      <caption class="dmc-sr-only">${o.legenda || ''}</caption>
      <tbody>${linhas.map((l) => {
        const v = Number(l.valor) || 0;
        const frac = max > 0 ? Math.round((v / max) * 1000) / 1000 : 0;
        return html`<tr><th scope="row">${l.rotulo}</th><td><span class="pf-barras__barra${l.selecionada ? ' is-selecionada' : ''}" aria-hidden="true" style="--pf-pct: ${frac}"></span><span class="pf-barras__texto">${l.texto != null ? l.texto : fmt.numero(l.valor)}</span></td></tr>`;
      })}</tbody></table></figure>`;
  }
  function kpis(el, itens) {
    if (!el) return;
    const lista = Array.isArray(itens) ? itens : [];
    el.innerHTML = html`<dl class="pf-kpis">${lista.map((k) => {
      const valor = k.valor == null || k.valor === '' ? '—' : k.valor;
      const rotulo = k.href ? html`<a href="${k.href}">${k.rotulo}</a>` : k.rotulo;
      return html`<div class="pf-kpi${k.href ? ' pf-kpi--link' : ''}"${k.tom ? html` data-tom="${tomValido(k.tom, 'neutro')}"` : ''}><dt class="pf-kpi__rotulo">${rotulo}</dt><dd class="pf-kpi__valor">${valor}</dd>${k.nota ? html`<dd class="pf-kpi__nota">${k.nota}</dd>` : ''}</div>`;
    })}</dl>`;
  }
  function codigo(valor, opcoes) {
    const v = valor == null ? '' : String(valor);
    const curto = !!(opcoes && opcoes.curto) && v.length > 12;
    return html`<span class="pf-codigo"><span class="pf-codigo__valor"${curto ? html` title="${v}"` : ''}>${curto ? `${v.slice(0, 12)}…` : v}</span><button type="button" class="pf-codigo__copiar" data-pf-copiar="${v}">${icone('copiar')}<span>Copiar</span></button></span>`;
  }
  async function copiarTexto(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return;
    }
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.className = 'dmc-sr-only';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } finally { area.remove(); }
  }
  // Um ouvinte só, por delegação: o pf-codigo é string e pode estar em qualquer lugar.
  if (typeof document !== 'undefined') {
    document.addEventListener('click', async (e) => {
      const botao = e.target && e.target.closest ? e.target.closest('.pf-codigo__copiar[data-pf-copiar]') : null;
      if (!botao) return;
      const caixa = botao.closest('.pf-codigo');
      try {
        await copiarTexto(botao.getAttribute('data-pf-copiar'));
        const rotulo = botao.querySelector('span');
        if (caixa) caixa.classList.add('is-copiado');
        if (rotulo) rotulo.textContent = 'Copiado';
        anunciar('Copiado.');
        setTimeout(() => {
          if (caixa) caixa.classList.remove('is-copiado');
          if (rotulo) rotulo.textContent = 'Copiar';
        }, 2000);
      } catch {
        toast('Não foi possível copiar. Selecione o texto e copie manualmente.', { tipo: 'aviso' });
      }
    });
  }

  // -----------------------------------------------------------------
  // Diálogos (UX §4.8): <dialog> + showModal(); Esc fecha (exceto enviando);
  // foco volta ao gatilho. Botões de DMC_UI.confirmar com data-pf-acao (D-76).
  // -----------------------------------------------------------------
  const LARGURAS = ['p', 'm', 'g'];
  function abrirDialogo({ titulo, largura = 'm' }) {
    const gatilho = document.activeElement;
    const idTitulo = novoId('pf-dialogo-titulo');
    const dlg = document.createElement('dialog');
    dlg.className = `pf-dialogo pf-dialogo--${LARGURAS.indexOf(largura) >= 0 ? largura : 'm'}`;
    dlg.setAttribute('aria-labelledby', idTitulo);
    // Sem botão de fechar no cabeçalho: fecha por Esc ou pelas ações (Cancelar/Fechar) — nunca dois "Fechar".
    dlg.innerHTML = html`<div class="pf-dialogo__cabeca"><h2 class="pf-dialogo__titulo" id="${idTitulo}" tabindex="-1">${titulo || ''}</h2></div><div class="pf-dialogo__corpo"></div><div class="pf-dialogo__acoes"></div>`;
    const d = {
      dlg,
      corpo: dlg.querySelector('.pf-dialogo__corpo'),
      acoes: dlg.querySelector('.pf-dialogo__acoes'),
      titulo: dlg.querySelector('.pf-dialogo__titulo'),
      enviando: false,
      aoCancelar: null,
      aoFechar: null,
      fechado: false,
      fechar() {
        if (d.fechado) return;
        d.fechado = true;
        if (typeof d.aoFechar === 'function') { try { d.aoFechar(); } catch { /* limpeza */ } }
        try { if (dlg.open) dlg.close(); } catch { /* já fechado */ }
        dlg.remove();
        if (gatilho && typeof gatilho.focus === 'function' && gatilho.isConnected) {
          try { gatilho.focus(); } catch { /* sem foco */ }
        }
      },
      ocupar(sim) {
        d.enviando = !!sim;
        if (sim) dlg.setAttribute('aria-busy', 'true'); else dlg.removeAttribute('aria-busy');
      }
    };
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (d.enviando) return;
      if (typeof d.aoCancelar === 'function') d.aoCancelar();
    });
    document.body.appendChild(dlg);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    return d;
  }
  /** Enter num campo de uma linha aciona o botão principal (sem <form>, para não quebrar o layout do diálogo). */
  function enterConfirma(d, botao) {
    d.dlg.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      const alvo = e.target;
      if (!alvo || alvo.tagName !== 'INPUT') return;
      if (['checkbox', 'radio', 'file', 'button', 'submit'].indexOf(alvo.type) >= 0) return;
      e.preventDefault();
      if (!botao.disabled) botao.click();
    });
  }
  function erroNoCampo(input, mensagem) {
    if (!input) return;
    const campo = input.closest('.pf-campo') || input.parentElement;
    const anterior = campo ? campo.querySelector(':scope > .pf-erro-campo') : null;
    if (anterior) anterior.remove();
    const ajuda = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && !/^pf-erro-/.test(x));
    if (!mensagem) {
      input.removeAttribute('aria-invalid');
      if (ajuda.length) input.setAttribute('aria-describedby', ajuda.join(' ')); else input.removeAttribute('aria-describedby');
      return;
    }
    const id = novoId('pf-erro');
    const p = criar(html`<p class="pf-erro-campo" id="${id}">${icone('estadoErro')}${mensagem}</p>`);
    if (campo) campo.appendChild(p);
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', [...ajuda, id].join(' '));
  }
  function alertaNoDialogo(d, err, padrao) {
    const anterior = d.corpo.querySelector(':scope > .pf-alerta[data-pf-dialogo-erro]');
    if (anterior) anterior.remove();
    if (!err) return;
    const texto = err && err.status && err.message ? err.message : (padrao || 'Não foi possível concluir agora. Tente de novo.');
    const caixa = alerta(null, { tom: 'erro', texto });
    caixa.setAttribute('data-pf-dialogo-erro', '');
    d.corpo.prepend(caixa);
  }

  // ---- Reautenticação (D-57; UX §4.8; API §6.1) ----
  function blocoReautenticacao({ texto, legendaOculta = false }) {
    const user = window.DMC_Auth && typeof window.DMC_Auth.user === 'function' ? window.DMC_Auth.user() : null;
    const comCodigo = !!(user && user.doisFatoresAtivo);
    const idSenha = novoId('pf-reaut-senha');
    const idCodigo = novoId('pf-reaut-codigo');
    const fs = criar(html`<fieldset class="pf-reautenticacao">
      <legend${legendaOculta ? html` class="dmc-sr-only"` : ''}>Confirme sua identidade</legend>
      <p>${texto || 'Por segurança, esta ação pede a sua senha.'}</p>
      <div class="pf-campo pf-reautenticacao__senha">
        <label class="pf-rotulo" for="${idSenha}">Senha atual</label>
        <div class="pf-senha"><input class="pf-input" id="${idSenha}" name="reautenticacao-senha" type="password" autocomplete="current-password" required data-pf-sem-rascunho><button type="button" class="pf-senha__ver" aria-pressed="false" aria-label="Mostrar senha">${icone('olho')}</button></div>
      </div>
      ${comCodigo ? html`<div class="pf-campo pf-reautenticacao__codigo">
        <label class="pf-rotulo" for="${idCodigo}">Código do aplicativo</label>
        <input class="pf-input" id="${idCodigo}" name="reautenticacao-codigo" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="9" data-pf-sem-rascunho>
      </div>` : ''}</fieldset>`);
    const senha = fs.querySelector(`#${idSenha}`);
    const cod = comCodigo ? fs.querySelector(`#${idCodigo}`) : null;
    const ver = fs.querySelector('.pf-senha__ver');
    ver.addEventListener('click', () => {
      const mostrar = senha.type === 'password';
      senha.type = mostrar ? 'text' : 'password';
      ver.setAttribute('aria-pressed', String(mostrar));
      ver.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
    });
    return {
      fs, senha, cod,
      valores() {
        const r = { senha: senha.value };
        if (cod && cod.value.trim()) r.codigo = cod.value.trim();
        return r;
      },
      preenchido() { return senha.value.length > 0; },
      /** 400 com campos.senha/campos.codigo → erro no campo; devolve true se tratou. */
      tratar(err) {
        const campos = (err && err.campos) || {};
        let tratou = false;
        if (err && err.status === 400 && campos.senha) { erroNoCampo(senha, 'Senha incorreta.'); senha.focus(); senha.select(); tratou = true; } else erroNoCampo(senha, null);
        if (cod) {
          if (err && err.status === 400 && campos.codigo) { erroNoCampo(cod, 'Código inválido.'); if (!tratou) cod.focus(); tratou = true; } else erroNoCampo(cod, null);
        }
        return tratou;
      },
      limpar() { senha.value = ''; if (cod) cod.value = ''; }
    };
  }
  /** 429 da reautenticação: o diálogo fecha e a sessão foi encerrada pelo servidor. */
  function avisarBloqueio(err) {
    toast(`${err && err.message ? `${err.message} ` : ''}Por segurança, sua sessão foi encerrada. Entre de novo.`, { tipo: 'erro' });
  }

  /**
   * Corre `enviar` com o diálogo aberto (aria-busy, botões inativos). Resolve o diálogo com o
   * resultado; erro de reautenticação fica no campo; 429 fecha com toast; outro erro → alerta.
   */
  async function enviarComDialogo(d, botao, reaut, enviar, args, resolver, tratarCampos) {
    d.ocupar(true);
    ocupado(botao, true);
    const outros = [...d.acoes.querySelectorAll('button')].filter((b) => b !== botao);
    outros.forEach((b) => { b.disabled = true; });
    alertaNoDialogo(d, null);
    try {
      const r = await enviar(...args);
      d.ocupar(false);
      ocupado(botao, false);
      resolver(r);
      d.fechar();
    } catch (err) {
      d.ocupar(false);
      ocupado(botao, false);
      outros.forEach((b) => { b.disabled = false; });
      if (reaut && err && err.status === 429) {
        resolver(null);
        d.fechar();
        avisarBloqueio(err);
        return;
      }
      if (reaut && reaut.tratar(err)) { if (reaut) botao.disabled = !reaut.preenchido(); return; }
      if (typeof tratarCampos === 'function' && tratarCampos(err)) return;
      alertaNoDialogo(d, err);
      if (reaut) botao.disabled = !reaut.preenchido();
    }
  }

  function dialogo(opcoes) {
    const o = opcoes || {};
    if (!temDOM()) return Promise.resolve(null);
    return new Promise((resolver) => {
      const d = abrirDialogo({ titulo: o.titulo, largura: o.largura });
      let resolvido = false;
      const fim = (v) => { if (!resolvido) { resolvido = true; resolver(v); } };
      d.aoCancelar = () => { fim(null); d.fechar(); };
      d.corpo.appendChild(paraNo(o.conteudo));
      const acoes = Array.isArray(o.acoes) && o.acoes.length ? o.acoes : [{ rotulo: 'Fechar', valor: null, tipo: 'secundario' }];
      acoes.forEach((a) => {
        const classe = a.tipo === 'primario' ? 'dmc-btn dmc-btn--primary' : a.tipo === 'perigo' ? 'dmc-btn dmc-btn--secondary pf-btn--perigo' : 'dmc-btn dmc-btn--secondary';
        // `acao` opcional ('confirmar' | 'cancelar'): o mesmo gancho data-pf-acao do confirmar (D-76).
        const acao = a.acao === 'confirmar' || a.acao === 'cancelar' ? a.acao : null;
        const b = criar(acao
          ? html`<button type="button" class="${classe}" data-pf-acao="${acao}">${a.rotulo}</button>`
          : html`<button type="button" class="${classe}">${a.rotulo}</button>`);
        b.addEventListener('click', () => { fim(a.valor === undefined ? null : a.valor); d.fechar(); });
        d.acoes.appendChild(b);
      });
      if (typeof o.aoAbrir === 'function') { try { o.aoAbrir(d.dlg); } catch (e) { console.error('[DMC]', e); } }
      if (!d.dlg.contains(document.activeElement) || document.activeElement === d.dlg) d.titulo.focus();
    });
  }

  function confirmar(opcoes) {
    const o = opcoes || {};
    if (!temDOM()) return Promise.resolve(false);
    const comEnviar = typeof o.enviar === 'function';
    return new Promise((resolver) => {
      const d = abrirDialogo({ titulo: o.titulo, largura: o.motivo || o.reautenticar ? 'm' : 'p' });
      let resolvido = false;
      const fim = (v) => { if (!resolvido) { resolvido = true; resolver(v); } };
      d.aoCancelar = () => { fim(false); d.fechar(); };
      if (o.texto) d.corpo.appendChild(criar(html`<p>${o.texto}</p>`));
      let motivo = null;
      let exigido = null;
      if (o.motivo) {
        const id = novoId('pf-motivo');
        const idAjuda = novoId('pf-motivo-ajuda');
        const campo = criar(html`<div class="pf-campo"><label class="pf-rotulo" for="${id}">Motivo (fica registrado na auditoria) <span aria-hidden="true">*</span></label><textarea class="pf-input" id="${id}" name="motivo" rows="3" maxlength="500" required aria-describedby="${idAjuda}"></textarea><p class="pf-ajuda" id="${idAjuda}">Entre 10 e 500 caracteres.</p></div>`);
        d.corpo.appendChild(campo);
        motivo = campo.querySelector('textarea');
      }
      if (o.exigirTexto) {
        const id = novoId('pf-exigir');
        const campo = criar(html`<div class="pf-campo"><label class="pf-rotulo" for="${id}">Para confirmar, digite ${o.exigirTexto}</label><input class="pf-input" id="${id}" type="text" autocomplete="off" spellcheck="false"></div>`);
        d.corpo.appendChild(campo);
        exigido = campo.querySelector('input');
      }
      const reaut = o.reautenticar ? blocoReautenticacao({}) : null;
      if (reaut) d.corpo.appendChild(reaut.fs);

      const cancelar = criar(html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-acao="cancelar">${o.rotuloCancelar || 'Cancelar'}</button>`);
      const classe = o.perigo ? 'dmc-btn dmc-btn--secondary pf-btn--perigo' : 'dmc-btn dmc-btn--primary';
      const ok = criar(html`<button type="button" class="${classe}" data-pf-acao="confirmar">${o.rotuloConfirmar || 'Confirmar'}</button>`);
      d.acoes.append(cancelar, ok);
      cancelar.addEventListener('click', () => { if (!d.enviando) d.aoCancelar(); });
      if (reaut) {
        ok.disabled = true;
        reaut.senha.addEventListener('input', () => { if (!d.enviando) ok.disabled = !reaut.preenchido(); });
        d.aoFechar = () => reaut.limpar();
      }
      enterConfirma(d, ok);

      ok.addEventListener('click', () => {
        if (d.enviando) return;
        let primeiroErro = null;
        if (motivo) {
          const v = motivo.value.trim();
          const msg = v.length < 10 ? 'Escreva o motivo com pelo menos 10 caracteres.' : v.length > 500 ? 'O motivo pode ter até 500 caracteres.' : null;
          erroNoCampo(motivo, msg);
          if (msg && !primeiroErro) primeiroErro = motivo;
        }
        if (exigido) {
          const msg = exigido.value.trim() === String(o.exigirTexto) ? null : `Digite exatamente ${o.exigirTexto}.`;
          erroNoCampo(exigido, msg);
          if (msg && !primeiroErro) primeiroErro = exigido;
        }
        if (primeiroErro) { primeiroErro.focus(); return; }
        const valores = motivo ? { motivo: motivo.value.trim() } : {};
        if (comEnviar) {
          const args = reaut ? [valores, reaut.valores()] : [valores];
          enviarComDialogo(d, ok, reaut, o.enviar, args, fim, null);
          return;
        }
        fim(motivo ? { motivo: valores.motivo } : true);
        d.fechar();
      });
      // Foco inicial em Cancelar (UX §4.8).
      cancelar.focus();
    });
  }

  // ---- Formulário em diálogo ----
  const TIPOS_CAMPO = ['text', 'email', 'url', 'number', 'date', 'datetime-local', 'textarea', 'select', 'checkbox', 'file', 'password'];
  function normalizarOpcoes(opcoes) {
    return (Array.isArray(opcoes) ? opcoes : []).map((op) => (op && typeof op === 'object' ? { valor: String(op.valor), rotulo: op.rotulo != null ? op.rotulo : String(op.valor) } : { valor: String(op), rotulo: String(op) }));
  }
  function campoHtml(c, id) {
    const tipo = TIPOS_CAMPO.indexOf(c.tipo) >= 0 ? c.tipo : 'text';
    const idAjuda = c.ajuda ? `${id}-ajuda` : '';
    const ast = c.obrigatorio ? html` <span aria-hidden="true">*</span>` : '';
    const ajuda = c.ajuda ? html`<p class="pf-ajuda" id="${idAjuda}">${c.ajuda}</p>` : '';
    const desc = idAjuda ? html` aria-describedby="${idAjuda}"` : '';
    const req = c.obrigatorio ? html` required` : '';
    const auto = c.autocomplete ? html` autocomplete="${c.autocomplete}"` : '';
    const valor = c.valor == null ? '' : c.valor;
    if (tipo === 'checkbox') {
      return html`<div class="pf-campo"><label class="pf-check"><input type="checkbox" id="${id}" name="${c.nome}"${c.valor === true ? html` checked` : ''}${req}${desc}><span>${c.rotulo}${ast}</span></label>${ajuda}</div>`;
    }
    const rotulo = html`<label class="pf-rotulo" for="${id}">${c.rotulo}${ast}</label>`;
    if (tipo === 'textarea') {
      return html`<div class="pf-campo">${rotulo}<textarea class="pf-input" id="${id}" name="${c.nome}" rows="${c.linhas || 4}"${c.max ? html` maxlength="${c.max}"` : ''}${req}${desc}>${valor}</textarea>${ajuda}</div>`;
    }
    if (tipo === 'select') {
      const ops = normalizarOpcoes(c.opcoes);
      const atual = String(valor);
      return html`<div class="pf-campo">${rotulo}<select class="pf-input" id="${id}" name="${c.nome}"${req}${desc}>
        ${!c.obrigatorio || !atual ? html`<option value="">Selecione</option>` : ''}
        ${ops.map((op) => html`<option value="${op.valor}"${op.valor === atual ? html` selected` : ''}>${op.rotulo}</option>`)}</select>${ajuda}</div>`;
    }
    if (tipo === 'file') {
      return html`<div class="pf-campo">${rotulo}<input class="pf-input" id="${id}" name="${c.nome}" type="file"${c.aceitar ? html` accept="${c.aceitar}"` : ''}${req}${desc}>${ajuda}</div>`;
    }
    const extra = tipo === 'number' || tipo === 'date' || tipo === 'datetime-local'
      ? html`${c.min != null ? html` min="${c.min}"` : ''}${c.max != null ? html` max="${c.max}"` : ''}${c.passo != null ? html` step="${c.passo}"` : ''}`
      : (c.max ? html` maxlength="${c.max}"` : '');
    const senha = tipo === 'password' ? html` autocomplete="${c.autocomplete || 'current-password'}" data-pf-sem-rascunho` : auto;
    return html`<div class="pf-campo">${rotulo}<input class="pf-input" id="${id}" name="${c.nome}" type="${tipo}" value="${valor}"${extra}${req}${desc}${senha}>${ajuda}</div>`;
  }
  function lerCampo(c, el) {
    if (!el) return null;
    switch (c.tipo) {
      case 'checkbox': return el.checked;
      case 'file': return el.files && el.files[0] ? el.files[0] : null;
      case 'number': return el.value.trim() === '' ? null : Number(el.value);
      case 'password': return el.value;
      default: return el.value.trim();
    }
  }
  function validarCampo(c, v) {
    const vazio = v == null || v === '' || v === false;
    if (c.obrigatorio && vazio) {
      if (c.tipo === 'checkbox') return 'Marque esta opção para continuar.';
      if (c.tipo === 'file') return 'Escolha um arquivo.';
      if (c.tipo === 'select') return 'Escolha uma opção.';
      return 'Preencha este campo.';
    }
    if (vazio) return null;
    if (c.tipo === 'email' && !valida.email(v)) return 'Informe um e-mail válido.';
    if (c.tipo === 'url' && !valida.url(v)) return 'Informe um endereço que comece com https://.';
    if (c.tipo === 'number' && !Number.isFinite(v)) return 'Informe um número.';
    return null;
  }
  function formulario(opcoes) {
    const o = opcoes || {};
    if (!temDOM()) return Promise.resolve(null);
    const campos = (Array.isArray(o.campos) ? o.campos : []).filter((c) => c && c.nome);
    const comEnviar = typeof o.enviar === 'function';
    return new Promise((resolver) => {
      const d = abrirDialogo({ titulo: o.titulo, largura: o.largura || 'm' });
      let resolvido = false;
      const fim = (v) => { if (!resolvido) { resolvido = true; resolver(v); } };
      d.aoCancelar = () => { fim(null); d.fechar(); };
      if (o.descricao) d.corpo.appendChild(criar(html`<p>${o.descricao}</p>`));
      if (campos.some((c) => c.obrigatorio)) d.corpo.appendChild(criar(html`<p class="pf-obrigatorios">Campos com * são obrigatórios.</p>`));
      const ids = {};
      campos.forEach((c) => {
        ids[c.nome] = novoId('pf-campo');
        d.corpo.appendChild(paraNo(campoHtml(c, ids[c.nome])));
      });
      const el = (nome) => d.corpo.querySelector(`#${ids[nome]}`);
      const reaut = o.reautenticar ? blocoReautenticacao({}) : null;
      if (reaut) d.corpo.appendChild(reaut.fs);

      const cancelar = criar(html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-acao="cancelar">Cancelar</button>`);
      const enviarBtn = criar(html`<button type="button" class="dmc-btn dmc-btn--primary" data-pf-acao="confirmar">${o.rotuloEnviar || 'Salvar'}</button>`);
      d.acoes.append(cancelar, enviarBtn);
      cancelar.addEventListener('click', () => { if (!d.enviando) d.aoCancelar(); });
      if (reaut) {
        enviarBtn.disabled = true;
        reaut.senha.addEventListener('input', () => { if (!d.enviando) enviarBtn.disabled = !reaut.preenchido(); });
        d.aoFechar = () => reaut.limpar();
      }
      enterConfirma(d, enviarBtn);

      function resumo(erros) {
        const anterior = d.corpo.querySelector(':scope > .pf-erros');
        if (anterior) anterior.remove();
        campos.forEach((c) => erroNoCampo(el(c.nome), erros[c.nome] || null));
        const lista = campos.filter((c) => erros[c.nome]);
        if (!lista.length) return false;
        const caixa = criar(html`<div class="pf-erros" tabindex="-1" role="alert"><p class="pf-erros__titulo">Corrija ${lista.length === 1 ? '1 campo' : `${lista.length} campos`}:</p><ul>${lista.map((c) => html`<li><a href="#${ids[c.nome]}" data-pf-ir="${c.nome}">${c.rotulo}: ${erros[c.nome]}</a></li>`)}</ul></div>`);
        caixa.addEventListener('click', (e) => {
          const a = e.target.closest('[data-pf-ir]');
          if (!a) return;
          e.preventDefault(); // não mexe no hash da página (roteador do backoffice)
          const alvo = el(a.getAttribute('data-pf-ir'));
          if (alvo) alvo.focus();
        });
        d.corpo.prepend(caixa);
        caixa.focus();
        return true;
      }
      function errosDoServidor(err) {
        if (!err || err.status !== 400 || !err.campos) return false;
        const erros = {};
        campos.forEach((c) => { if (typeof err.campos[c.nome] === 'string') erros[c.nome] = err.campos[c.nome]; });
        return Object.keys(erros).length ? resumo(erros) : false;
      }

      enviarBtn.addEventListener('click', () => {
        if (d.enviando) return;
        const valores = {};
        campos.forEach((c) => { valores[c.nome] = lerCampo(c, el(c.nome)); });
        const erros = {};
        campos.forEach((c) => { const m = validarCampo(c, valores[c.nome]); if (m) erros[c.nome] = m; });
        if (!Object.keys(erros).length && typeof o.validar === 'function') {
          const extra = o.validar(valores) || {};
          Object.keys(extra).forEach((k) => { if (extra[k]) erros[k] = extra[k]; });
        }
        if (resumo(erros)) return;
        if (comEnviar) {
          const args = reaut ? [valores, reaut.valores()] : [valores];
          enviarComDialogo(d, enviarBtn, reaut, o.enviar, args, fim, errosDoServidor);
          return;
        }
        fim(valores);
        d.fechar();
      });
      const primeiro = campos.length ? el(campos[0].nome) : (reaut ? reaut.senha : null);
      if (primeiro) primeiro.focus(); else d.titulo.focus();
    });
  }

  /** Ação SEM diálogo próprio (salvar e remover a chave do Gemini): pf-dialogo--p com o fieldset. */
  function reautenticar(opcoes) {
    const o = opcoes || {};
    if (!temDOM()) return Promise.resolve(null);
    return new Promise((resolver) => {
      const d = abrirDialogo({ titulo: o.titulo || 'Confirme sua identidade', largura: 'p' });
      let resolvido = false;
      const fim = (v) => { if (!resolvido) { resolvido = true; resolver(v); } };
      d.aoCancelar = () => { fim(null); d.fechar(); };
      const reaut = blocoReautenticacao({ texto: o.texto, legendaOculta: true });
      d.corpo.appendChild(reaut.fs);
      d.aoFechar = () => reaut.limpar();
      const cancelar = criar(html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-acao="cancelar">Cancelar</button>`);
      const ok = criar(html`<button type="button" class="dmc-btn dmc-btn--primary" data-pf-acao="confirmar" disabled>${o.rotuloConfirmar || 'Confirmar'}</button>`);
      d.acoes.append(cancelar, ok);
      cancelar.addEventListener('click', () => { if (!d.enviando) d.aoCancelar(); });
      reaut.senha.addEventListener('input', () => { if (!d.enviando) ok.disabled = !reaut.preenchido(); });
      enterConfirma(d, ok);
      ok.addEventListener('click', () => {
        if (d.enviando || !reaut.preenchido()) return;
        if (typeof o.enviar !== 'function') { const v = reaut.valores(); fim(v); d.fechar(); return; }
        enviarComDialogo(d, ok, reaut, o.enviar, [reaut.valores()], fim, null);
      });
      reaut.senha.focus();
    });
  }

  // ---- Envio de arquivo (pf-upload) ----
  const FORMATOS = {
    pdf: { mimes: ['application/pdf'], ext: ['pdf'], rotulo: 'PDF' },
    jpg: { mimes: ['image/jpeg'], ext: ['jpg', 'jpeg'], rotulo: 'JPG' },
    jpeg: { mimes: ['image/jpeg'], ext: ['jpg', 'jpeg'], rotulo: 'JPG' },
    png: { mimes: ['image/png'], ext: ['png'], rotulo: 'PNG' },
    webp: { mimes: ['image/webp'], ext: ['webp'], rotulo: 'WebP' }
  };
  function listaFormatos(formatos) {
    const r = [...new Set(formatos.map((f) => (FORMATOS[f] ? FORMATOS[f].rotulo : String(f).toUpperCase())))];
    return r.length <= 1 ? (r[0] || '') : `${r.slice(0, -1).join(', ')} ou ${r[r.length - 1]}`;
  }
  function upload(opcoes) {
    const o = opcoes || {};
    if (!temDOM()) return Promise.resolve(null);
    const formatos = (Array.isArray(o.formatos) && o.formatos.length ? o.formatos : ['pdf']).map((f) => String(f).toLowerCase());
    const maxBytes = Number(o.maxBytes) > 0 ? Number(o.maxBytes) : 4 * 1024 * 1024;
    const aceitar = [...new Set(formatos.flatMap((f) => (FORMATOS[f] ? [...FORMATOS[f].mimes, ...FORMATOS[f].ext.map((e) => `.${e}`)] : [`.${f}`])))].join(',');
    const textoFormatos = `${listaFormatos(formatos)}, até ${fmt.bytes(maxBytes)}`;
    return new Promise((resolver) => {
      const d = abrirDialogo({ titulo: o.titulo || 'Enviar arquivo', largura: 'm' });
      let resolvido = false;
      const fim = (v) => { if (!resolvido) { resolvido = true; resolver(v); } };
      d.aoCancelar = () => { fim(null); d.fechar(); };
      const id = novoId('pf-upload');
      const caixa = criar(html`<div class="pf-upload">
        <div class="pf-upload__alvo">
          <p id="${id}-formatos">${textoFormatos}</p>
          <input class="dmc-sr-only" id="${id}" type="file" accept="${aceitar}" aria-describedby="${id}-formatos">
          <label class="dmc-btn dmc-btn--secondary" for="${id}">Escolher arquivo</label>
        </div>
        ${o.avisoBaseLegal ? html`<p class="pf-ajuda">${o.avisoBaseLegal}</p>` : ''}</div>`);
      d.corpo.appendChild(caixa);
      const input = caixa.querySelector('input[type="file"]');
      const alvo = caixa.querySelector('.pf-upload__alvo');
      let escolhido = null; // .pf-upload__arquivo só existe com arquivo escolhido (sem depender do CSS de [hidden])
      let arquivo = null;

      function conferir(f) {
        const ext = (String(f.name || '').split('.').pop() || '').toLowerCase();
        const ok = formatos.some((fm) => {
          const def = FORMATOS[fm];
          return def ? def.ext.indexOf(ext) >= 0 || def.mimes.indexOf(f.type) >= 0 : ext === fm;
        });
        if (!ok) return `Formato não aceito. Envie ${listaFormatos(formatos)}.`;
        if (f.size > maxBytes) return `Arquivo maior que ${fmt.bytes(maxBytes)}.`;
        return null;
      }
      function escolher(f) {
        const msg = f ? conferir(f) : 'Escolha um arquivo.';
        caixa.classList.toggle('is-erro', !!msg);
        erroNoCampo(input, msg);
        if (escolhido) { escolhido.remove(); escolhido = null; }
        if (msg) { arquivo = null; return; }
        arquivo = f;
        escolhido = criar(html`<div class="pf-upload__arquivo"><span>${f.name} · ${fmt.bytes(f.size)}</span><button type="button" class="dmc-btn dmc-btn--link" data-pf-upload="trocar">Trocar</button></div>`);
        alvo.after(escolhido);
        escolhido.querySelector('[data-pf-upload="trocar"]').addEventListener('click', () => input.click());
      }
      input.addEventListener('change', () => escolher(input.files && input.files[0]));
      alvo.addEventListener('dragover', (e) => { e.preventDefault(); alvo.classList.add('is-arrastando'); });
      alvo.addEventListener('dragleave', () => alvo.classList.remove('is-arrastando'));
      alvo.addEventListener('drop', (e) => {
        e.preventDefault();
        alvo.classList.remove('is-arrastando');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) escolher(f);
      });

      const cancelar = criar(html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-acao="cancelar">Cancelar</button>`);
      const enviarBtn = criar(html`<button type="button" class="dmc-btn dmc-btn--primary" data-pf-acao="confirmar">${o.rotuloEnviar || 'Enviar arquivo'}</button>`);
      d.acoes.append(cancelar, enviarBtn);
      cancelar.addEventListener('click', () => { if (!d.enviando) d.aoCancelar(); });
      enviarBtn.addEventListener('click', async () => {
        if (d.enviando) return;
        if (!arquivo) { escolher(null); input.focus(); return; }
        if (typeof o.enviar !== 'function') { fim(arquivo); d.fechar(); return; }
        const barra = criar(html`<progress class="pf-upload__progresso" aria-label="Enviando o arquivo"></progress>`);
        caixa.appendChild(barra);
        await enviarComDialogo(d, enviarBtn, null, o.enviar, [arquivo], fim, (err) => {
          if (err && (err.status === 413 || err.status === 415)) {
            erroNoCampo(input, err.status === 413 ? `Arquivo maior que ${fmt.bytes(maxBytes)}.` : (err.message || `Formato não aceito. Envie ${listaFormatos(formatos)}.`));
            return true;
          }
          return false;
        });
        barra.remove();
      });
      caixa.querySelector('label').focus();
    });
  }

  // -----------------------------------------------------------------
  // Consentimento (D-57; UX DC-39, §4.3): texto LITERAL do servidor em pf-leitura
  // -----------------------------------------------------------------
  function consentimento(el, opcoes) {
    const o = opcoes || {};
    const rot = Object.assign({ caixa: 'Concordo com este uso', aceitar: 'Autorizar', recusar: 'Agora não', retirar: 'Retirar autorização' }, o.rotulos || {});
    const modo = o.modo === 'botoes' ? 'botoes' : 'caixa';
    const id = novoId('pf-consentimento');
    const est = {
      texto: o.texto == null ? '' : String(o.texto),
      versaoTexto: o.versaoTexto == null ? '' : String(o.versaoTexto),
      registro: o.registro && typeof o.registro === 'object' ? o.registro : null,
      exigido: false,
      retirado: false,
      marcado: false
    };
    const vigente = () => !!(est.registro && String(est.registro.versaoTexto) === est.versaoTexto && !est.retirado);

    function desenhar() {
      el.classList.add('pf-consentimento');
      el.classList.toggle('is-registrado', vigente());
      el.classList.toggle('is-exigido', est.exigido);
      el.classList.toggle('is-retirado', est.retirado);
      const em = est.registro ? fmt.data(est.registro.em) : '';
      el.innerHTML = html`
        <div class="pf-consentimento__texto pf-leitura" id="${id}-texto" tabindex="-1"></div>
        ${est.versaoTexto ? html`<p class="pf-consentimento__versao">Versão ${est.versaoTexto}</p>` : ''}
        ${vigente()
          ? html`<p class="pf-consentimento__registro">${icone('estadoSucesso')}Autorizado em ${em} · versão ${String(est.registro.versaoTexto)}</p>
            ${typeof o.aoRetirar === 'function' ? html`<div class="pf-consentimento__acoes"><button type="button" class="dmc-btn dmc-btn--secondary" data-pf-consentimento-acao="retirar">${rot.retirar}</button></div>` : ''}`
          : (modo === 'caixa'
            ? html`<label class="pf-check pf-consentimento__check"><input type="checkbox" id="${id}-caixa" aria-describedby="${id}-texto"${est.marcado ? html` checked` : ''}><span>${rot.caixa}</span></label>`
            : html`<div class="pf-consentimento__acoes"><button type="button" class="dmc-btn dmc-btn--primary" data-pf-consentimento-acao="aceitar" aria-describedby="${id}-texto">${rot.aceitar}</button>${typeof o.aoRecusar === 'function' ? html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-consentimento-acao="recusar">${rot.recusar}</button>` : ''}</div>`)}
        ${est.retirado ? html`<p class="pf-consentimento__registro">Autorização retirada.</p>` : ''}`;
      // Literal: nunca reescrito, resumido nem cortado (textContent preserva quebras com white-space: pre-line).
      el.querySelector('.pf-consentimento__texto').textContent = est.texto;
      const caixa = el.querySelector(`#${id}-caixa`);
      if (caixa) caixa.addEventListener('change', () => { est.marcado = caixa.checked; erro(null); });
      el.querySelectorAll('[data-pf-consentimento-acao]').forEach((b) => b.addEventListener('click', () => acionar(b.getAttribute('data-pf-consentimento-acao'), b)));
    }
    function erro(texto) {
      const anterior = el.querySelector(':scope > .pf-alerta');
      if (anterior) anterior.remove();
      if (texto) el.appendChild(alerta(null, { tom: 'erro', texto, compacto: true }));
    }
    async function acionar(acao, botao) {
      const fn = acao === 'aceitar' ? o.aoAceitar : acao === 'recusar' ? o.aoRecusar : o.aoRetirar;
      if (typeof fn !== 'function') {
        if (acao === 'aceitar') { est.registro = { em: new Date().toISOString(), versaoTexto: est.versaoTexto }; est.exigido = false; est.retirado = false; desenhar(); }
        return;
      }
      el.setAttribute('aria-busy', 'true');
      el.querySelectorAll('[data-pf-consentimento-acao]').forEach((b) => { b.disabled = true; });
      try {
        await fn();
        el.removeAttribute('aria-busy');
        if (acao === 'aceitar') {
          est.registro = { em: new Date().toISOString(), versaoTexto: est.versaoTexto };
          est.exigido = false;
          est.retirado = false;
          desenhar();
          anunciar('Autorização registrada.');
        } else if (acao === 'retirar') {
          est.registro = null;
          est.retirado = true;
          est.marcado = false;
          desenhar();
          anunciar('Autorização retirada.');
        }
      } catch (err) {
        el.removeAttribute('aria-busy');
        el.querySelectorAll('[data-pf-consentimento-acao]').forEach((b) => { b.disabled = false; });
        erro(err && err.status && err.message ? err.message : 'Não foi possível registrar agora. Tente de novo.');
        if (botao && botao.isConnected) botao.focus();
      }
    }
    desenhar();
    return {
      /** modo 'caixa': o que vai em consentimentos.<finalidade> no MESMO envio do formulário. */
      aceite() {
        if (modo !== 'caixa' || vigente()) return null;
        return est.marcado ? { aceito: true, versaoTexto: est.versaoTexto } : null;
      },
      /** 428 consentimento-necessario: reabre com o texto novo e põe o foco nele. */
      exigir(novo) {
        const n = novo || {};
        if (n.texto != null) est.texto = String(n.texto);
        if (n.versaoTexto != null) est.versaoTexto = String(n.versaoTexto);
        est.exigido = true;
        est.retirado = false;
        est.marcado = false;
        est.registro = null; // o servidor disse que não há aceite válido (retirado em outra aba ou texto novo)
        desenhar();
        // Foco no controle do aceite; o leitor de tela lê o texto literal pelo aria-describedby.
        const alvo = el.querySelector('.pf-consentimento__check input, [data-pf-consentimento-acao="aceitar"]') || el.querySelector('.pf-consentimento__texto');
        if (alvo) alvo.focus();
      },
      erro,
      foco() { const a = el.querySelector('.pf-consentimento__check input, [data-pf-consentimento-acao]'); if (a) a.focus(); },
      destruir() {
        el.replaceChildren();
        el.classList.remove('pf-consentimento', 'is-registrado', 'is-exigido', 'is-retirado');
        el.removeAttribute('aria-busy');
      }
    };
  }

  // -----------------------------------------------------------------
  // Tabela (UX §4.7, DC-09): <table> real, caption, empilha < 44em, nunca rola
  // -----------------------------------------------------------------
  function tabela(el, opcoes) {
    const o = opcoes || {};
    const colunas = (Array.isArray(o.colunas) ? o.colunas : []).filter((c) => c && (c.chave || c.render));
    let linhas = Array.isArray(o.linhas) ? o.linhas.slice() : [];
    let paginacao = o.paginacao || null;
    let ordem = null; // { chave, dir: 1 | -1 }
    const selecionados = new Set();
    const base = novoId('pf-tabela');
    const chaveDe = (l, i) => String(typeof o.chaveLinha === 'function' ? o.chaveLinha(l) : (o.chaveLinha ? l[o.chaveLinha] : (l && l.id != null ? l.id : i)));
    const classeDa = (c) => [
      c.tipo === 'numero' || c.tipo === 'moeda' ? 'pf-tabela__num' : '',
      c.tipo === 'acao' ? 'pf-tabela__acoes' : '',
      c.secundaria ? 'pf-tabela__secundaria' : ''
    ].filter(Boolean).join(' ');

    function valorCelula(c, l) {
      if (typeof c.render === 'function') return c.render(l);
      const v = l ? l[c.chave] : null;
      switch (c.tipo) {
        case 'moeda': return fmt.moeda(v);
        case 'numero': return v == null || v === '' ? '—' : fmt.numero(v);
        case 'data': return v ? html`<time datetime="${v}">${fmt.data(v)}</time>` : '—';
        case 'dataHora': return v ? html`<time datetime="${v}">${fmt.dataHora(v)}</time>` : '—';
        case 'status': return v && typeof v === 'object' ? estado(v.rotulo, v.tom) : (v == null || v === '' ? '—' : String(v));
        default: return v == null || v === '' ? '—' : String(v);
      }
    }
    function ordenadas() {
      if (!ordem) return linhas;
      const { chave, dir } = ordem;
      return linhas.slice().sort((a, b) => {
        const x = a ? a[chave] : null;
        const y = b ? b[chave] : null;
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
        return String(x).localeCompare(String(y), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
      });
    }
    function desenhar() {
      if (!linhas.length) {
        const v = o.vazio || { titulo: 'Nada por aqui ainda.' };
        estadoVazio(el, v);
        return;
      }
      const lista = ordenadas();
      const comSelecao = !!(o.selecao && Array.isArray(o.selecao.acoes) && o.selecao.acoes.length);
      const chaves = lista.map((l, i) => chaveDe(l, i));
      [...selecionados].forEach((k) => { if (chaves.indexOf(k) < 0) selecionados.delete(k); });
      const todas = comSelecao && chaves.length && chaves.every((k) => selecionados.has(k));
      const cabecalho = colunas.map((c) => {
        const ativo = ordem && ordem.chave === c.chave;
        const sort = c.ordenavel ? (ativo ? (ordem.dir === 1 ? 'ascending' : 'descending') : 'none') : null;
        const cls = classeDa(c);
        return html`<th scope="col" role="columnheader"${cls ? html` class="${cls}"` : ''}${sort ? html` aria-sort="${sort}"` : ''}>${c.ordenavel
          ? html`<button type="button" data-pf-ordenar="${c.chave}">${c.rotulo}${icone('chevron')}</button>`
          : (c.tipo === 'acao' && !c.rotulo ? html`<span class="dmc-sr-only">Ações</span>` : c.rotulo)}</th>`;
      });
      const corpo = lista.map((l, i) => {
        const k = chaves[i];
        const celulas = colunas.map((c, j) => {
          const cls = classeDa(c);
          let conteudo = valorCelula(c, l);
          if (j === 0 && typeof o.aoClicarLinha === 'function' && typeof c.render !== 'function') {
            conteudo = html`<button type="button" class="dmc-btn dmc-btn--link" data-pf-abrir-linha="${k}">${conteudo}</button>`;
          }
          return j === 0
            ? html`<th scope="row" role="rowheader"${cls ? html` class="${cls}"` : ''}>${conteudo}</th>`
            : html`<td role="cell" data-rotulo="${c.rotulo || ''}"${cls ? html` class="${cls}"` : ''}>${conteudo}</td>`;
        });
        const sel = comSelecao
          ? html`<td role="cell" class="pf-tabela__selecao"><label class="pf-check"><input type="checkbox" data-pf-selecionar="${k}"${selecionados.has(k) ? html` checked` : ''}><span class="dmc-sr-only">Selecionar linha ${i + 1}</span></label></td>`
          : '';
        return html`<tr role="row" data-pf-linha="${k}"${typeof o.aoClicarLinha === 'function' ? html` class="is-clicavel"` : ''}>${sel}${celulas}</tr>`;
      });
      const n = selecionados.size;
      const barra = comSelecao && n
        ? html`<div class="pf-tabela__barra" role="region" aria-label="Seleção"><p>${n === 1 ? '1 selecionada' : `${n} selecionadas`}</p>${o.selecao.acoes.map((a, i) => html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-acao-selecao="${i}">${a.rotulo}</button>`)}<button type="button" class="dmc-btn dmc-btn--link" data-pf-limpar-selecao>Limpar seleção</button></div>`
        : '';
      let mais = '';
      if (paginacao && paginacao.total != null) {
        const mostrando = Math.min(Number(paginacao.mostrando) || lista.length, Number(paginacao.total));
        const fimLista = mostrando >= Number(paginacao.total);
        mais = html`<div class="pf-mais"><p>${fimLista ? 'Isso é tudo.' : `Mostrando 1–${mostrando} de ${paginacao.total}`}</p>${!fimLista && typeof paginacao.carregarMais === 'function' ? html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-carregar-mais>Carregar mais</button>` : ''}</div>`;
      }
      el.innerHTML = html`<table class="pf-tabela${o.nuncaEmpilhar ? ' pf-tabela--nunca-empilhar' : ''}" role="table" id="${base}">
        <caption${o.legendaVisivel ? '' : html` class="dmc-sr-only"`}>${o.legenda || ''}</caption>
        <thead role="rowgroup"><tr role="row">${comSelecao ? html`<th scope="col" role="columnheader" class="pf-tabela__selecao"><label class="pf-check"><input type="checkbox" data-pf-selecionar-todas${todas ? html` checked` : ''}><span class="dmc-sr-only">Selecionar todas</span></label></th>` : ''}${cabecalho}</tr></thead>
        <tbody role="rowgroup">${corpo}</tbody></table>${barra}${mais}`;
      el.setAttribute('aria-busy', 'false');
    }
    function porChave(k) {
      const lista = ordenadas();
      for (let i = 0; i < lista.length; i++) if (chaveDe(lista[i], i) === k) return lista[i];
      return null;
    }
    function aoClicar(e) {
      const t = e.target;
      const ord = t.closest('[data-pf-ordenar]');
      if (ord) {
        const chave = ord.getAttribute('data-pf-ordenar');
        ordem = ordem && ordem.chave === chave ? { chave, dir: -ordem.dir } : { chave, dir: 1 };
        desenhar();
        const novo = el.querySelector(`[data-pf-ordenar="${CSS.escape(chave)}"]`);
        if (novo) novo.focus();
        return;
      }
      if (t.closest('[data-pf-limpar-selecao]')) { selecionados.clear(); desenhar(); return; }
      const acaoSel = t.closest('[data-pf-acao-selecao]');
      if (acaoSel) {
        const a = o.selecao.acoes[Number(acaoSel.getAttribute('data-pf-acao-selecao'))];
        if (a && typeof a.aoClicar === 'function') a.aoClicar([...selecionados]);
        return;
      }
      const mais = t.closest('[data-pf-carregar-mais]');
      if (mais) {
        ocupado(mais, true, 'Carregando…');
        Promise.resolve(paginacao.carregarMais()).catch((err) => toast(err && err.message ? err.message : 'Não foi possível carregar mais.', { tipo: 'erro' }))
          .finally(() => { if (mais.isConnected) ocupado(mais, false); });
        return;
      }
      if (typeof o.aoClicarLinha !== 'function') return;
      const abrir = t.closest('[data-pf-abrir-linha]');
      if (abrir) { o.aoClicarLinha(porChave(abrir.getAttribute('data-pf-abrir-linha'))); return; }
      if (t.closest('a, button, input, select, textarea, label, summary')) return;
      const tr = t.closest('tbody tr[data-pf-linha]');
      if (tr) o.aoClicarLinha(porChave(tr.getAttribute('data-pf-linha')));
    }
    function aoMudar(e) {
      const t = e.target;
      if (t.matches('[data-pf-selecionar-todas]')) {
        const chaves = ordenadas().map((l, i) => chaveDe(l, i));
        if (t.checked) chaves.forEach((k) => selecionados.add(k)); else selecionados.clear();
        desenhar();
        const novo = el.querySelector('[data-pf-selecionar-todas]');
        if (novo) novo.focus();
        return;
      }
      const k = t.getAttribute('data-pf-selecionar');
      if (k == null) return;
      if (t.checked) selecionados.add(k); else selecionados.delete(k);
      desenhar();
      const novo = el.querySelector(`[data-pf-selecionar="${CSS.escape(k)}"]`);
      if (novo) novo.focus();
    }
    el.addEventListener('click', aoClicar);
    el.addEventListener('change', aoMudar);
    desenhar();
    return {
      atualizar(novas, novaPaginacao) {
        linhas = Array.isArray(novas) ? novas.slice() : [];
        if (novaPaginacao !== undefined) paginacao = novaPaginacao;
        desenhar();
      },
      destruir() {
        el.removeEventListener('click', aoClicar);
        el.removeEventListener('change', aoMudar);
        el.replaceChildren();
      }
    };
  }

  // -----------------------------------------------------------------
  // Abas (UX §4.6): tablist com setas, Home/End e foco móvel
  // -----------------------------------------------------------------
  function abas(el, opcoes) {
    const o = opcoes || {};
    const lista = (Array.isArray(o.abas) ? o.abas : []).filter((a) => a && a.id != null);
    const base = novoId('pf-abas');
    const idAba = (id) => `${base}-aba-${id}`;
    const idPainel = (id) => `${base}-painel-${id}`;
    let ativa = o.ativa;
    if (o.hash) {
      const h = decodeURIComponent(String(window.location.hash || '').replace(/^#/, ''));
      if (lista.some((a) => String(a.id) === h)) ativa = h;
    }
    if (!lista.some((a) => String(a.id) === String(ativa))) ativa = lista.length ? lista[0].id : null;

    const barra = criar(html`<div class="pf-abas" role="tablist"${o.rotulo ? html` aria-label="${o.rotulo}"` : ''}>${lista.map((a) => html`<button type="button" class="pf-abas__aba" role="tab" id="${idAba(a.id)}" aria-controls="${idPainel(a.id)}" data-pf-aba="${a.id}">${a.rotulo}${a.contador != null ? html` <span class="pf-abas__contador">(${a.contador})</span>` : ''}</button>`)}</div>`);
    // Painéis: os que a página já tem ([data-pf-painel="<id>"]) ou criados aqui.
    const paineis = {};
    lista.forEach((a) => {
      let p = el.querySelector(`[data-pf-painel="${CSS.escape(String(a.id))}"]`);
      if (!p) {
        p = document.createElement('section');
        p.className = 'pf-abas__painel';
        p.setAttribute('data-pf-painel', String(a.id));
        el.appendChild(p);
      }
      p.classList.add('pf-abas__painel');
      p.id = idPainel(a.id);
      p.setAttribute('role', 'tabpanel');
      p.setAttribute('aria-labelledby', idAba(a.id));
      p.setAttribute('tabindex', '0');
      paineis[String(a.id)] = p;
    });
    el.prepend(barra);

    function ativar(id, { foco = false, avisar = true } = {}) {
      const alvo = lista.find((a) => String(a.id) === String(id));
      if (!alvo) return;
      ativa = alvo.id;
      barra.querySelectorAll('[role="tab"]').forEach((b) => {
        const sim = b.getAttribute('data-pf-aba') === String(alvo.id);
        b.setAttribute('aria-selected', String(sim));
        b.tabIndex = sim ? 0 : -1;
        if (sim && foco) b.focus();
      });
      Object.keys(paineis).forEach((k) => { paineis[k].hidden = k !== String(alvo.id); });
      if (o.hash) {
        try { window.history.replaceState(window.history.state, '', `#${encodeURIComponent(String(alvo.id))}`); } catch { /* sem history */ }
      }
      if (avisar && typeof o.aoTrocar === 'function') o.aoTrocar(alvo.id, paineis[String(alvo.id)]);
    }
    barra.addEventListener('click', (e) => {
      const b = e.target.closest('[role="tab"]');
      if (b) ativar(b.getAttribute('data-pf-aba'));
    });
    barra.addEventListener('keydown', (e) => {
      const botoes = [...barra.querySelectorAll('[role="tab"]')];
      const i = botoes.indexOf(document.activeElement);
      if (i < 0) return;
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % botoes.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + botoes.length) % botoes.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = botoes.length - 1;
      if (j == null) return;
      e.preventDefault();
      ativar(botoes[j].getAttribute('data-pf-aba'), { foco: true });
    });
    ativar(ativa, { avisar: false });
    return {
      ativar: (id) => ativar(id),
      painel: (id) => paineis[String(id)] || null
    };
  }

  // -----------------------------------------------------------------
  // Filtros em segmento (UX §4.6): aria-pressed; < 30em com mais de 4 opções vira <select>
  // -----------------------------------------------------------------
  function filtros(el, opcoes) {
    const o = opcoes || {};
    const lista = (Array.isArray(o.opcoes) ? o.opcoes : []).map((op) => ({ valor: String(op.valor), rotulo: op.rotulo, contador: op.contador }));
    let valor = o.valor != null ? String(o.valor) : (lista[0] ? lista[0].valor : '');
    const estreito = window.matchMedia ? window.matchMedia('(max-width: 29.99em)') : null;
    const id = novoId('pf-filtro');
    function desenhar() {
      const comoSelect = lista.length > 4 && estreito && estreito.matches;
      if (comoSelect) {
        el.innerHTML = html`<div class="pf-campo"><label class="pf-rotulo" for="${id}">Mostrar</label><select class="pf-input" id="${id}"${o.rotulo ? html` aria-describedby="${id}-rotulo"` : ''}>${lista.map((op) => html`<option value="${op.valor}"${op.valor === valor ? html` selected` : ''}>${op.rotulo}${op.contador != null ? ` (${op.contador})` : ''}</option>`)}</select>${o.rotulo ? html`<span class="dmc-sr-only" id="${id}-rotulo">${o.rotulo}</span>` : ''}</div>`;
        return;
      }
      el.innerHTML = html`<div class="pf-segmento" role="group"${o.rotulo ? html` aria-label="${o.rotulo}"` : ''}>${lista.map((op) => html`<button type="button" class="pf-segmento__opcao" aria-pressed="${String(op.valor === valor)}" data-pf-valor="${op.valor}">${op.rotulo}${op.contador != null ? html` <span class="pf-segmento__contagem">(${op.contador})</span>` : ''}</button>`)}</div>`;
    }
    function escolher(v) {
      if (v === valor) return;
      valor = v;
      desenhar();
      const b = el.querySelector(`[data-pf-valor="${CSS.escape(v)}"]`);
      if (b) b.focus();
      if (typeof o.aoMudar === 'function') o.aoMudar(v);
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pf-valor]');
      if (b) escolher(b.getAttribute('data-pf-valor'));
    });
    el.addEventListener('change', (e) => {
      if (e.target && e.target.tagName === 'SELECT') {
        valor = e.target.value;
        if (typeof o.aoMudar === 'function') o.aoMudar(valor);
      }
    });
    if (estreito && typeof estreito.addEventListener === 'function') estreito.addEventListener('change', desenhar);
    desenhar();
    return { definir(v) { valor = String(v); desenhar(); } };
  }

  // -----------------------------------------------------------------
  // Arquivos (D-47): tipo REFEITO pelos bytes; só PDF e imagem abrem em aba
  // -----------------------------------------------------------------
  const TIPOS_QUE_ABREM = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  const EXTENSAO = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  /** Tipo pelos primeiros bytes (assinatura), nunca pelo Content-Type do servidor. */
  function tipoPorBytes(buf) {
    const b = new Uint8Array(buf, 0, Math.min(16, buf.byteLength));
    const ini = (...xs) => xs.every((x, i) => b[i] === x);
    if (ini(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';            // %PDF-
    if (ini(0xff, 0xd8, 0xff)) return 'image/jpeg';
    if (ini(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
    if (ini(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    if (ini(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
    return 'application/octet-stream';
  }
  function exigirApi() {
    const api = window.DMC_Api;
    if (!api || typeof api.blob !== 'function') throw new Error('Página sem o cliente da API (js/api-client.js).');
    return api;
  }
  function nomeSeguro(nome, tipo) {
    let n = String(nome || 'arquivo').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim() || 'arquivo';
    const ext = EXTENSAO[tipo];
    if (ext && !new RegExp(`\\.${ext}$`, 'i').test(n) && !(ext === 'jpg' && /\.jpe?g$/i.test(n))) n += `.${ext}`;
    return n.slice(0, 180);
  }
  function baixarBuffer(buf, nome) {
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function baixar(caminhoApi, nomeArquivo) {
    const dados = await exigirApi().blob(caminhoApi);
    const buf = await dados.arrayBuffer();
    baixarBuffer(buf, nomeSeguro(nomeArquivo, tipoPorBytes(buf)));
  }
  async function abrirArquivo(caminhoApi, opcoes) {
    const nome = opcoes && opcoes.nome;
    const dados = await exigirApi().blob(caminhoApi);
    const buf = await dados.arrayBuffer();
    const tipo = tipoPorBytes(buf);
    // Navegador sem leitor de PDF (navigator.pdfViewerEnabled === false: configuração "baixar PDFs",
    // modo sem interface): a aba blob: viraria um download com nome aleatório → baixa já com o nome.
    const semLeitorPdf = tipo === 'application/pdf' && window.navigator && window.navigator.pdfViewerEnabled === false;
    if (TIPOS_QUE_ABREM.indexOf(tipo) < 0 || semLeitorPdf) {
      // HTML, SVG ou qualquer outro tipo: a página blob: herdaria a origem do portal → só download.
      baixarBuffer(buf, nomeSeguro(nome, tipo));
      return;
    }
    const url = URL.createObjectURL(new Blob([buf], { type: tipo }));
    const aba = window.open(url, '_blank');
    if (!aba) {
      URL.revokeObjectURL(url);
      baixarBuffer(buf, nomeSeguro(nome, tipo));
      return;
    }
    try { aba.opener = null; } catch { /* outra origem */ }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function imagemProtegida(img, caminhoApi) {
    if (!img) return;
    const dados = await exigirApi().blob(caminhoApi);
    const buf = await dados.arrayBuffer();
    const tipo = tipoPorBytes(buf);
    if (!/^image\/(jpeg|png|webp|gif)$/.test(tipo)) throw new Error('O arquivo recebido não é uma imagem.');
    const url = URL.createObjectURL(new Blob([buf], { type: tipo }));
    const soltar = () => setTimeout(() => URL.revokeObjectURL(url), 1000);
    img.addEventListener('load', soltar, { once: true });
    img.addEventListener('error', soltar, { once: true });
    img.src = url;
  }
  const SCRIPTS = new Map();
  /** Memoizado; só mesma origem. qr.js só resolve com o gerador pronto (DMC_QR.pronto). */
  function carregarScript(src) {
    let url;
    try { url = new URL(src, window.location.href); } catch { return Promise.reject(new Error('Endereço de script inválido.')); }
    if (url.origin !== window.location.origin) return Promise.reject(new Error('Só scripts da própria plataforma podem ser carregados.'));
    const chave = url.href;
    if (SCRIPTS.has(chave)) return SCRIPTS.get(chave);
    const p = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = url.href;
      s.onload = () => ok();
      s.onerror = () => falha(new Error('Não foi possível carregar um recurso da página.'));
      document.body.appendChild(s);
    }).then(() => {
      if (/\/js\/portal\/qr\.js$/.test(url.pathname) && window.DMC_QR && window.DMC_QR.pronto) return window.DMC_QR.pronto;
      return undefined;
    });
    p.catch(() => SCRIPTS.delete(chave));
    SCRIPTS.set(chave, p);
    return p;
  }

  // -----------------------------------------------------------------
  // Formatação e validação (pt-BR, America/Sao_Paulo)
  // -----------------------------------------------------------------
  const TZ = 'America/Sao_Paulo';
  const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
  const formatador = (op) => {
    try { return new Intl.DateTimeFormat('pt-BR', op); } catch { return new Intl.DateTimeFormat('pt-BR', Object.assign({}, op, { timeZone: undefined })); }
  };
  const F = {
    curta: formatador({ timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }),
    longa: formatador({ timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }),
    hora: formatador({ timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    curtaUtc: formatador({ timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }),
    longaUtc: formatador({ timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
  };
  /** Data de calendário 'AAAA-MM-DD' não sofre fuso; instante ISO vai para SP. */
  function lerData(iso) {
    if (iso == null || iso === '') return null;
    if (iso instanceof Date) return Number.isNaN(iso.getTime()) ? null : { d: iso, calendario: false };
    const s = String(iso);
    const m = RE_DIA.exec(s);
    if (m) {
      const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
      return Number.isNaN(d.getTime()) ? null : { d, calendario: true };
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : { d, calendario: false };
  }
  const soDigitos = (s) => String(s == null ? '' : s).replace(/\D+/g, '');
  const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');
  const fmt = {
    data(iso, estilo) {
      const x = lerData(iso);
      if (!x) return '—';
      const longa = estilo === 'longa';
      return (x.calendario ? (longa ? F.longaUtc : F.curtaUtc) : (longa ? F.longa : F.curta)).format(x.d);
    },
    dataHora(iso) {
      const x = lerData(iso);
      if (!x) return '—';
      if (x.calendario) return F.curtaUtc.format(x.d);
      return `${F.curta.format(x.d)} às ${F.hora.format(x.d)}`;
    },
    hora(iso) {
      const x = lerData(iso);
      return x && !x.calendario ? F.hora.format(x.d) : '—';
    },
    relativo(iso, agora) {
      const x = lerData(iso);
      if (!x) return '—';
      const ref = agora instanceof Date ? agora.getTime() : Date.now();
      const seg = Math.round((ref - x.d.getTime()) / 1000);
      const futuro = seg < 0;
      const s = Math.abs(seg);
      if (s < 60) return futuro ? 'em instantes' : 'agora há pouco';
      const min = Math.round(s / 60);
      if (min < 60) return futuro ? `em ${min} min` : `há ${min} min`;
      const h = Math.round(min / 60);
      if (h < 24) return futuro ? `em ${h} h` : `há ${h} h`;
      const dias = Math.round(h / 24);
      if (dias === 1) return futuro ? 'amanhã' : 'ontem';
      if (dias < 7) return futuro ? `em ${dias} dias` : `há ${dias} dias`;
      return fmt.data(iso);
    },
    moeda(centavos) {
      if (centavos == null || centavos === '' || !Number.isFinite(Number(centavos))) return '—';
      return brl(Number(centavos) / 100);
    },
    reais(numero) {
      if (numero == null || numero === '' || !Number.isFinite(Number(numero))) return '—';
      return brl(Number(numero));
    },
    cpf(s) {
      const d = soDigitos(s);
      return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (s == null ? '' : String(s));
    },
    cpfMascarado(s) {
      const d = soDigitos(s);
      return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '—';
    },
    cep(s) {
      const d = soDigitos(s);
      return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (s == null ? '' : String(s));
    },
    telefone(s) {
      const d = soDigitos(s);
      if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
      if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      return s == null ? '' : String(s);
    },
    bytes(n) {
      const v = Number(n);
      if (!Number.isFinite(v) || v < 0) return '—';
      if (v < 1024) return `${v} B`;
      if (v < 1024 * 1024) return `${Math.round(v / 1024)} KB`;
      const mb = v / 1024 / 1024;
      return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: Number.isInteger(mb) ? 0 : 1 })} MB`;
    },
    numero(n, casas = 0) {
      if (n == null || n === '' || !Number.isFinite(Number(n))) return '—';
      return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    },
    pct(n, casas = 0) {
      const t = fmt.numero(n, casas);
      return t === '—' ? t : `${t}%`;
    },
    nota(n) {
      if (n == null || n === '' || !Number.isFinite(Number(n))) return '—';
      return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    },
    duracao(minutos) {
      const m = Math.round(Number(minutos));
      if (!Number.isFinite(m) || m < 0) return '—';
      if (m < 60) return `${m} min`;
      const h = Math.floor(m / 60);
      const r = m % 60;
      return r ? `${h} h ${r} min` : `${h} h`;
    },
    horas(n) {
      if (n == null || n === '' || !Number.isFinite(Number(n))) return '—';
      return `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
    }
  };

  function dvCpf(base, pesoInicial) {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  }
  const valida = {
    /** O mesmo algoritmo de server/src/portal/validacao.js (validarCpf). */
    cpf(s) {
      if (typeof s !== 'string' && typeof s !== 'number') return false;
      const t = String(s).trim();
      if (!/^[\d.\-\s]+$/.test(t)) return false;
      const d = t.replace(/\D/g, '');
      if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
      return dvCpf(d.slice(0, 9), 10) === Number(d[9]) && dvCpf(d.slice(0, 10), 11) === Number(d[10]);
    },
    /** A mesma regra de server/src/routes/auth.js (EMAIL_RE). */
    email(s) { return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()); },
    /** validarCep do servidor: 8 dígitos (com ou sem hífen), nunca 00000-000. */
    cep(s) {
      if (typeof s !== 'string' && typeof s !== 'number') return false;
      const t = String(s).trim();
      return /^\d{5}-?\d{3}$/.test(t) && t.replace('-', '') !== '00000000';
    },
    url(s) {
      try { const u = new URL(String(s).trim()); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
    }
  };

  const MASCARAS = {
    cpf: { max: 11, f: (d) => d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2') },
    cep: { max: 8, f: (d) => d.replace(/^(\d{5})(\d)/, '$1-$2') },
    telefone: {
      max: 11,
      f: (d) => (d.length <= 2 ? (d ? `(${d}` : '') : d.length <= 6 ? `(${d.slice(0, 2)}) ${d.slice(2)}`
        : d.length <= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`)
    },
    data: { max: 8, f: (d) => d.replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3') },
    moeda: {
      max: 13,
      f: (d) => {
        if (!d) return '';
        const n = Number(d) / 100;
        return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }
  };
  /** Só dígitos; aceita colar; reposiciona o cursor no fim do que foi digitado. */
  function mascara(input, tipo) {
    const m = MASCARAS[tipo];
    if (!input || !m || input.dataset.pfMascara === tipo) return;
    input.dataset.pfMascara = tipo;
    if (!input.getAttribute('inputmode')) input.setAttribute('inputmode', 'numeric');
    const aplicar = () => {
      const digitos = soDigitos(input.value).replace(tipo === 'moeda' ? /^0+(?=\d)/ : /$^/, '').slice(0, m.max);
      const novo = m.f(digitos);
      if (novo !== input.value) {
        input.value = novo;
        try { input.setSelectionRange(novo.length, novo.length); } catch { /* tipo sem seleção */ }
      }
    };
    input.addEventListener('input', aplicar);
    aplicar();
  }

  const DMC_UI = {
    // HTML seguro
    html, esc, cru, icone,
    // Retorno ao usuário
    toast, anunciar, confirmar, dialogo, formulario, reautenticar, consentimento,
    // Estados de tela
    esqueleto, estadoVazio, erroCarga, ocupado, alerta,
    // Componentes
    estado, chip: estado, tabela, abas, filtros, kpis, donut, progresso, barras, codigo, imagemProtegida,
    // Arquivos
    baixar, abrirArquivo, upload, carregarScript,
    // Formatação e validação
    fmt, valida, mascara
  };
  window.DMC_UI = DMC_UI;

  // -----------------------------------------------------------------
  // DMC_Portal — boot padrão das páginas novas (§7.4, §5.4, D-63, D-75)
  // -----------------------------------------------------------------
  const PAPEIS = ['aluno', 'professor', 'admin'];
  const NEXT_RE = /^[a-z0-9_-]+\.html(\?.*)?$/i; // = DMC_Auth.NEXT_RE (regra do login da 2d)
  const PAGINA_PERFIL = 'perfil.html';
  const DESTINO_RESTRITO = 'perfil.html#seguranca';
  const CHAVE_AVISO = 'dmc:aviso';

  function nomeDaPagina() {
    let seg = String(window.location.pathname || '').split('/').pop() || '';
    try { seg = decodeURIComponent(seg); } catch { /* fica cru */ }
    if (seg && !/\.[a-z0-9]+$/i.test(seg)) seg += '.html'; // /plataforma-ead/dashboard (extensions:['html'])
    return seg;
  }

  function validarNext(s) {
    const auth = window.DMC_Auth;
    if (auth && typeof auth.validarNext === 'function') return auth.validarNext(s);
    return typeof s === 'string' && NEXT_RE.test(s) ? s : '';
  }

  function urlDeLogin() {
    const next = validarNext(nomeDaPagina() + (window.location.search || ''));
    return next ? `login.html?next=${encodeURIComponent(next)}` : 'login.html';
  }

  /** papelDe() do servidor (§5.1): isAdmin manda; professor só com papel gravado. */
  function papelDoUsuario(user) {
    const auth = window.DMC_Auth;
    if (auth && typeof auth.papel === 'function') {
      const p = auth.papel();
      if (PAPEIS.indexOf(p) >= 0) return p;
    }
    if (!user) return null;
    if (user.isAdmin === true) return 'admin';
    return user.papel === 'professor' ? 'professor' : 'aluno';
  }

  function gravarAviso(texto) {
    try { window.sessionStorage.setItem(CHAVE_AVISO, texto); } catch { /* sem storage: só não há aviso */ }
  }

  /** dmc:aviso deixado antes de um redirecionamento: vira toast no destino. */
  function mostrarAvisoPendente() {
    let texto = null;
    try {
      texto = window.sessionStorage.getItem(CHAVE_AVISO);
      if (texto) window.sessionStorage.removeItem(CHAVE_AVISO);
    } catch { texto = null; }
    if (texto) toast(texto, { tipo: 'aviso' });
  }

  function ir(url) { window.location.replace(url); }

  function ehTrocaDeSenha(err) {
    return !!err && err.codigo === 'troca-de-senha-obrigatoria';
  }
  function ehAbortado(err, sinal) {
    return !!err && (err.name === 'AbortError' || (sinal && sinal.aborted));
  }

  function domPronto() {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise((ok) => document.addEventListener('DOMContentLoaded', ok, { once: true }));
  }

  // ---- Rascunho de 401 (§7.4, D-47) ----
  // Só formulário marcado com data-pf-rascunho; nunca senha, código de verificação, dado
  // pessoal por autocomplete, nem as páginas/fluxos perfil, meus-dados, contrato e assistente.
  const PAGINAS_SEM_RASCUNHO = ['perfil', 'meus-dados', 'contrato', 'assistente'];
  const AUTOCOMPLETE_PESSOAL = /^(name|given-name|family-name|additional-name|nickname|honorific-prefix|honorific-suffix|username|email|tel(-.+)?|bday(-.+)?|street-address|address-line\d|address-level\d|postal-code|country(-name)?|one-time-code|current-password|new-password|cc-.+)$/i;
  const TIPOS_SEM_RASCUNHO = ['password', 'file', 'hidden', 'submit', 'button', 'reset', 'image'];
  const RASCUNHO_VALIDADE_MS = 24 * 60 * 60 * 1000;
  const RASCUNHO_MAX = 50000;

  const paginaBase = () => nomeDaPagina().replace(/\.html$/i, '');
  const chaveRascunho = () => `dmc:rascunho:${paginaBase()}`;
  const rascunhoPermitido = () => PAGINAS_SEM_RASCUNHO.indexOf(paginaBase()) < 0;

  function campoGuardavel(el) {
    if (!el || !el.name) return false;
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return false;
    if (tag === 'INPUT' && TIPOS_SEM_RASCUNHO.indexOf(String(el.type).toLowerCase()) >= 0) return false;
    if (el.hasAttribute('data-pf-sem-rascunho')) return false;
    if (el.closest('.pf-reautenticacao, [data-pf-sem-rascunho]')) return false;
    const auto = String(el.getAttribute('autocomplete') || '').trim().split(/\s+/).filter(Boolean);
    if (auto.some((t) => AUTOCOMPLETE_PESSOAL.test(t))) return false;
    return true;
  }
  const idDoFormulario = (form, i) => form.getAttribute('data-pf-rascunho') || form.id || `f${i}`;

  function salvarRascunho(user) {
    if (!rascunhoPermitido()) return;
    const formularios = {};
    let algum = false;
    document.querySelectorAll('form[data-pf-rascunho]').forEach((form, i) => {
      const valores = {};
      [...form.elements].forEach((el) => {
        if (!campoGuardavel(el)) return;
        if (el.type === 'checkbox') {
          if (!valores[el.name]) valores[el.name] = [];
          if (el.checked) valores[el.name].push(el.value || 'on');
        } else if (el.type === 'radio') {
          if (el.checked) valores[el.name] = el.value;
        } else if (el.tagName === 'SELECT' && el.multiple) {
          valores[el.name] = [...el.selectedOptions].map((o) => o.value);
        } else if (String(el.value).trim()) {
          valores[el.name] = el.value;
        }
      });
      Object.keys(valores).forEach((k) => { if (Array.isArray(valores[k]) && !valores[k].length && form.querySelectorAll(`[name="${CSS.escape(k)}"]`).length > 1) delete valores[k]; });
      if (Object.keys(valores).length) { formularios[idDoFormulario(form, i)] = valores; algum = true; }
    });
    if (!algum) return;
    try {
      const dados = JSON.stringify({ v: 1, em: Date.now(), userId: user && user.id ? String(user.id) : null, formularios });
      if (dados.length <= RASCUNHO_MAX) window.sessionStorage.setItem(chaveRascunho(), dados);
    } catch { /* sem storage */ }
  }

  /** Repõe o rascunho nos formulários marcados que já estão na tela; devolve quantos repôs. */
  function restaurarRascunho(user) {
    if (!rascunhoPermitido()) return 0;
    let bruto = null;
    try { bruto = window.sessionStorage.getItem(chaveRascunho()); } catch { return 0; }
    if (!bruto) return 0;
    let dados = null;
    try { dados = JSON.parse(bruto); } catch { dados = null; }
    const valido = dados && dados.v === 1 && Date.now() - Number(dados.em) < RASCUNHO_VALIDADE_MS
      && (!dados.userId || !user || String(user.id) === dados.userId) && dados.formularios && typeof dados.formularios === 'object';
    if (!valido) { try { window.sessionStorage.removeItem(chaveRascunho()); } catch { /* sem storage */ } return 0; }
    let repostos = 0;
    document.querySelectorAll('form[data-pf-rascunho]').forEach((form, i) => {
      const id = idDoFormulario(form, i);
      const valores = dados.formularios[id];
      if (!valores) return;
      [...form.elements].forEach((el) => {
        if (!campoGuardavel(el) || !Object.prototype.hasOwnProperty.call(valores, el.name)) return;
        const v = valores[el.name];
        if (el.type === 'checkbox') el.checked = Array.isArray(v) && v.indexOf(el.value || 'on') >= 0;
        else if (el.type === 'radio') el.checked = el.value === v;
        else if (el.tagName === 'SELECT' && el.multiple && Array.isArray(v)) [...el.options].forEach((o) => { o.selected = v.indexOf(o.value) >= 0; });
        else if (typeof v === 'string') el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      delete dados.formularios[id];
      repostos++;
    });
    try {
      if (Object.keys(dados.formularios).length) window.sessionStorage.setItem(chaveRascunho(), JSON.stringify(dados));
      else window.sessionStorage.removeItem(chaveRascunho());
    } catch { /* sem storage */ }
    if (repostos) toast('Recuperamos o que você tinha digitado antes de a sessão terminar. Confira antes de enviar.', { tipo: 'info' });
    return repostos;
  }

  let iniciado = false;

  /**
   * DMC_Portal.iniciar(boot, { pagina, papeis, catalogo, modo, area, itens }) → Promise<void>
   * Ordem (D-63): DMC_Auth.init() → modo restrito → DMC_init({catalogo}) → guarda do papel →
   * DMC_Shell.montar(pagina, {modo, area, restrito, itens, papel}) → boot(ctx) em try.
   * Não rejeita (só com boot que não é função): falha vira DMC_UI.erroCarga(main, …) +
   * console.error('[DMC]', err); 401 (também depois do boot) → rascunho dos formulários
   * marcados + login.html?next=; 403 troca-de-senha-obrigatoria → perfil.html#seguranca.
   */
  async function iniciar(boot, opcoes) {
    if (typeof boot !== 'function') throw new TypeError('DMC_Portal.iniciar(boot, opções): boot precisa ser uma função.');
    if (iniciado) {
      console.error('[DMC] DMC_Portal.iniciar foi chamado mais de uma vez nesta página.');
      return;
    }
    iniciado = true;

    const o = opcoes || {};
    await domPronto();

    const body = document.body;
    const pagina = o.pagina || (body && (body.dataset.shell || body.dataset.pagina)) || '';
    const papeis = Array.isArray(o.papeis) && o.papeis.length ? o.papeis : PAPEIS;
    const catalogo = o.catalogo === true;
    const modo = o.modo === 'foco' || o.modo === 'publica' ? o.modo : 'padrao';
    const area = o.area === 'backoffice' ? 'backoffice' : 'aluno';
    const main = document.getElementById('conteudo') || document.querySelector('main') || body;

    const controlador = new AbortController();
    window.addEventListener('pagehide', () => controlador.abort(), { once: true });

    const ctx = {
      user: null,
      papel: null,
      params: new URLSearchParams(window.location.search),
      main,
      sinal: controlador.signal,
      restrito: false
    };

    // Sessão que cai DEPOIS do boot (qualquer chamada com 401) e troca de senha exigida pelo
    // servidor em qualquer chamada: os eventos vêm do js/api-client.js.
    let saindo = false;
    if (modo !== 'publica') {
      window.addEventListener('dmc:sessao-expirada', () => {
        if (saindo) return;
        saindo = true;
        salvarRascunho(ctx.user);
        ir(urlDeLogin());
      });
      window.addEventListener('dmc:troca-de-senha', () => {
        if (saindo || nomeDaPagina() === PAGINA_PERFIL) return;
        saindo = true;
        ir(DESTINO_RESTRITO);
      });
    }

    try {
      const auth = window.DMC_Auth;
      const api = window.DMC_Api;

      if (modo === 'publica') {
        // Sem shell e sem guarda; a sessão, se houver, só preenche o ctx.
        if (auth && api && api.token()) {
          ctx.user = await auth.init();
          ctx.papel = papelDoUsuario(ctx.user);
        }
      } else {
        if (!auth || typeof window.DMC_init !== 'function') {
          throw new Error('Página sem o núcleo da plataforma (js/api-client.js e js/app.js).');
        }

        // 1) Sessão. Sem token (ou 401, que o cliente já limpou) → login com next.
        const user = await auth.init();
        if (!user) {
          if (api && api.token()) {
            // Ainda há token: a falha não foi de sessão (rede, 5xx). Não manda ao login.
            throw new Error('Não foi possível confirmar a sua sessão agora.');
          }
          if (!saindo) { saindo = true; ir(urlDeLogin()); }
          return;
        }
        ctx.user = user;
        ctx.papel = papelDoUsuario(user);

        // 2) Modo restrito ANTES de qualquer outra chamada (D-63).
        ctx.restrito = user.precisaTrocarSenha === true;
        const emPerfil = nomeDaPagina() === PAGINA_PERFIL;
        if (ctx.restrito && !emPerfil) {
          saindo = true;
          ir(DESTINO_RESTRITO);
          return;
        }

        // 3) Núcleo legado. No modo restrito nada é carregado (a sessão já foi validada acima).
        if (!ctx.restrito) await window.DMC_init({ catalogo });

        // 4) Guarda do papel (§5.4): admin satisfaz qualquer papel.
        if (ctx.papel !== 'admin' && papeis.indexOf(ctx.papel) < 0) {
          const soCoordenacao = papeis.every((p) => p === 'admin');
          gravarAviso(soCoordenacao ? 'Área restrita à coordenação.' : 'Área restrita à equipe.');
          saindo = true;
          ir(ctx.papel === 'professor' ? 'professor.html' : 'dashboard.html');
          return;
        }

        // 5) Shell. `itens` (D-75) só é avaliado depois da guarda.
        const itens = typeof o.itens === 'function' ? o.itens({ user: ctx.user, papel: ctx.papel }) : o.itens;
        const shell = window.DMC_Shell;
        if (shell && typeof shell.montar === 'function') {
          shell.montar(pagina, { modo, area, restrito: ctx.restrito, itens, papel: ctx.papel });
          // Shell legado (sem tema/fonte): nome, iniciais, Sair e contador do carrinho vêm do bindHeader.
          if (!shell.tema && typeof window.DMC_bindHeader === 'function') window.DMC_bindHeader();
        }
        mostrarAvisoPendente();
      }

      // Gerador de QR (qr.js) pronto antes do boot, para DMC_QR.svg ser síncrono no boot.
      if (window.DMC_QR && window.DMC_QR.pronto) {
        try { await window.DMC_QR.pronto; } catch { /* svg() avisa; a página mostra o estado honesto */ }
      }

      // 6) Boot da página.
      await boot(ctx);
      if (modo !== 'publica' && !saindo) restaurarRascunho(ctx.user);
    } catch (err) {
      if (ehAbortado(err, controlador.signal)) return;
      if (saindo) return;
      if (err && err.status === 401) { saindo = true; salvarRascunho(ctx.user); ir(urlDeLogin()); return; }
      if (ehTrocaDeSenha(err)) {
        if (nomeDaPagina() !== PAGINA_PERFIL) { saindo = true; ir(DESTINO_RESTRITO); return; }
      }
      console.error('[DMC]', err);
      erroCarga(main, err, { tentarDeNovo: () => window.location.reload() });
    }
  }

  window.DMC_Portal = { iniciar };
})();
