/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/meus-dados.js (F0p)
   Tela: meus-dados.html — PORTAL-UX.md §6.16 (canal do titular).
   API: PORTAL-API.md §6.3.3 (resumo, consentimentos, exportação),
   §6.10.1 (pedidos do titular = atendimento `privacidade`, F6a).
   Nada desta página vai a rascunho de 401 (D-47).

   Lacunas do núcleo em obra (F0b): erro com status/codigo no DMC_Api
   e DMC_UI.confirmar/toast — versões locais com o mesmo contrato
   (ganchos data-pf-acao do D-76); as da F0b valem quando existirem.
   ============================================================= */
(function () {
  'use strict';

  const UI = window.DMC_UI;
  if (!UI || !window.DMC_Portal) return;
  const html = UI.html;

  const API = {
    resumo: '/portal/me/dados/resumo',
    consentimentos: '/portal/me/dados/consentimentos',
    revogar: (f) => `/portal/me/dados/consentimentos/${encodeURIComponent(f)}/revogar`,
    exportacao: '/portal/me/dados/exportacao',
    pedidos: '/portal/me/atendimentos?categoria=privacidade',
    abrirPedido: '/portal/me/atendimentos'
  };

  // ---------------------------------------------------------------
  // Núcleo local (ver cabeçalho)
  // ---------------------------------------------------------------
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
  async function bruto(metodo, caminho, corpo, sinal) {
    const A = window.DMC_Api;
    const cab = {};
    const t = A && A.token();
    if (t) cab.Authorization = `Bearer ${t}`;
    if (corpo !== undefined) cab['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(BASE + caminho, { method: metodo, headers: cab, body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: sinal, credentials: 'same-origin' });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw Object.assign(new Error('Sem conexão. Verifique a internet e tente de novo.'), { status: 0 });
    }
    if (res.status === 401 && A) {
      const tinhaSessao = !!A.token();
      A.setToken(null);
      if (tinhaSessao) sessaoEncerrada();
    }
    return res;
  }
  async function falha(res) {
    let dados = null;
    try { dados = JSON.parse(await res.text()); } catch { dados = null; }
    return Object.assign(new Error((dados && dados.error) || `Erro ${res.status} no servidor.`), {
      status: res.status, codigo: dados && dados.codigo, campos: dados && dados.campos,
      requestId: (dados && dados.requestId) || res.headers.get('X-Request-Id') || undefined, dados: dados || undefined
    });
  }
  async function chamar(metodo, caminho, corpo, opcoes) {
    const o = opcoes || {};
    const res = await bruto(metodo, caminho, corpo, o.sinal);
    if (res.status === 404 && o.silencioso404) return null;
    if (!res.ok) throw await falha(res);
    const texto = await res.text();
    if (!texto) return null;
    try { return JSON.parse(texto); } catch { return null; }
  }

  function anunciar(texto) {
    if (typeof UI.anunciar === 'function') { UI.anunciar(texto); return; }
    const vivo = document.getElementById('pf-meus-dados-anuncio');
    if (!vivo) return;
    vivo.textContent = '';
    window.setTimeout(() => { vivo.textContent = texto; }, 30);
  }
  const icone = (chave) => (typeof UI.icone === 'function' ? UI.icone(chave) : '');
  const estado = (rotulo, tom) => (typeof UI.estado === 'function' ? UI.estado(rotulo, tom) : html`<span class="pf-estado pf-estado--${tom}">${rotulo}</span>`);

  const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  function dataBr(valor) {
    if (!valor) return '';
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? '' : FMT_DATA.format(d);
  }

  let seq = 0;
  /** Equivalente local de DMC_UI.confirmar com a caixa opcional "Apagar também o histórico". */
  function confirmarLocal({ titulo, texto, rotuloConfirmar, perigo = true, caixa = null }) {
    return new Promise((ok) => {
      const id = `pf-meus-dados-dialogo-${++seq}`;
      const d = document.createElement('dialog');
      d.className = 'pf-dialogo pf-dialogo--p';
      d.setAttribute('aria-labelledby', id);
      d.innerHTML = html`<div class="pf-dialogo__cabeca"><h2 class="pf-dialogo__titulo" id="${id}">${titulo}</h2></div>
        <div class="pf-dialogo__corpo"><p>${texto}</p>
          ${caixa ? html`<label class="pf-check pf-meus-dados-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" data-pf-meus-dados-caixa checked><span>${caixa}</span></label>` : ''}
        </div>
        <div class="pf-dialogo__acoes">
          <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-acao="cancelar">Cancelar</button>
          <button type="button" class="${perigo ? 'dmc-btn dmc-btn--secondary pf-btn--perigo' : 'dmc-btn dmc-btn--primary'}" data-pf-acao="confirmar">${rotuloConfirmar}</button>
        </div>`;
      const gatilho = document.activeElement;
      let feito = false;
      const fim = (v) => {
        if (feito) return;
        feito = true;
        const marcada = d.querySelector('[data-pf-meus-dados-caixa]');
        const resultado = v ? { confirmado: true, caixa: marcada ? marcada.checked : false } : false;
        if (d.open) d.close();
        d.remove();
        if (gatilho && gatilho.isConnected && typeof gatilho.focus === 'function') gatilho.focus();
        ok(resultado);
      };
      d.addEventListener('cancel', (e) => { e.preventDefault(); fim(false); });
      d.querySelector('[data-pf-acao="cancelar"]').addEventListener('click', () => fim(false));
      d.querySelector('[data-pf-acao="confirmar"]').addEventListener('click', () => fim(true));
      document.body.appendChild(d);
      d.showModal();
      d.querySelector('[data-pf-acao="cancelar"]').focus();
    });
  }

  const corpo = (chave) => document.querySelector(`[data-pf-meus-dados="${chave}"]`);
  function erroNoBloco(el, texto, tentar) {
    el.setAttribute('aria-busy', 'false');
    el.innerHTML = html`<div class="pf-alerta pf-alerta--erro" role="alert">${icone('estadoErro')}<p>${texto}</p>
      ${tentar ? html`<button type="button" class="dmc-btn dmc-btn--secondary pf-alerta__acao" data-pf-meus-dados-acao="tentar">Tentar de novo</button>` : ''}</div>`;
    const b = el.querySelector('[data-pf-meus-dados-acao="tentar"]');
    if (b && tentar) b.addEventListener('click', tentar);
  }

  // ---------------------------------------------------------------
  // 1. Seus dados (tabela gerada da configuração do servidor) + 6. Encarregado
  // ---------------------------------------------------------------
  async function carregarResumo(ctx) {
    const el = corpo('resumo');
    const enc = corpo('encarregado');
    el.setAttribute('aria-busy', 'true');
    let r;
    try { r = await chamar('GET', API.resumo, undefined, { silencioso404: true, sinal: ctx.sinal }); }
    catch (err) {
      erroNoBloco(el, 'Não foi possível carregar como seus dados são tratados.', () => carregarResumo(ctx));
      enc.innerHTML = html`<p>Para assuntos de privacidade, use os pedidos acima. Eles chegam à coordenação.</p>`;
      return err;
    }
    if (!r) {
      erroNoBloco(el, 'Estas informações estão indisponíveis no momento.', null);
      enc.innerHTML = html`<p>Para assuntos de privacidade, use os pedidos acima. Eles chegam à coordenação.</p>`;
      return null;
    }
    const categorias = Array.isArray(r.categorias) ? r.categorias : [];
    const operadores = Array.isArray(r.operadores) ? r.operadores : [];
    el.setAttribute('aria-busy', 'false');
    el.innerHTML = html`
      ${categorias.length ? html`<table class="pf-tabela pf-meus-dados-categorias">
        <caption>Dados tratados pela plataforma, para que servem e por quanto tempo ficam guardados</caption>
        <thead><tr>
          <th scope="col">Dado</th><th scope="col">Para quê</th><th scope="col">Base legal</th><th scope="col">Quem acessa</th><th scope="col">Por quanto tempo</th>
        </tr></thead>
        <tbody>
          ${categorias.map((c) => html`<tr>
            <th scope="row">${c.rotulo || c.chave}</th>
            <td data-rotulo="Para quê">${c.finalidade || '—'}</td>
            <td data-rotulo="Base legal">${c.baseLegal || '—'}</td>
            <td data-rotulo="Quem acessa">${Array.isArray(c.visivelPara) ? c.visivelPara.join(', ') : (c.visivelPara || '—')}</td>
            <td data-rotulo="Por quanto tempo">${c.retencao || '—'}</td>
          </tr>`)}
        </tbody>
      </table>` : html`<p>Nenhuma categoria de dado declarada.</p>`}
      ${operadores.length ? html`<h3 class="pf-meus-dados-subtitulo">Quem nos ajuda a operar a plataforma</h3>
        <ul class="pf-lista pf-meus-dados-operadores">
          ${operadores.map((o) => html`<li class="pf-lista__linha"><p class="pf-lista__titulo">${o.nome}</p>
            <p class="pf-lista__meta">${o.finalidade}${o.quando ? html` · ${o.quando}` : ''}${o.internacional ? ' · pode haver transferência internacional' : ''}</p></li>`)}
        </ul>` : ''}
      ${r.textoPolitica ? html`<div class="pf-leitura pf-meus-dados-politica"><p>${r.textoPolitica}</p></div>` : ''}`;

    const e = r.encarregado;
    if (e && e.nome) {
      enc.innerHTML = html`<p><strong>${e.nome}</strong></p>
        <ul class="pf-lista">
          ${e.email ? html`<li class="pf-lista__linha"><a href="${`mailto:${e.email}`}">${e.email}</a></li>` : ''}
          ${e.telefone ? html`<li class="pf-lista__linha">${e.telefone}</li>` : ''}
          ${e.canalUrl && /^https:\/\//i.test(e.canalUrl) ? html`<li class="pf-lista__linha"><a href="${e.canalUrl}" rel="noopener noreferrer" target="_blank">Canal do encarregado</a></li>` : ''}
        </ul>`;
    } else {
      enc.innerHTML = html`<p>Para assuntos de privacidade, use os pedidos acima. Eles chegam à coordenação.</p>`;
    }
    return r;
  }

  // ---------------------------------------------------------------
  // 2. Autorizações (6 finalidades, na ordem da API)
  // ---------------------------------------------------------------
  const ONDE_AUTORIZAR = {
    assistente_ia: { href: 'assistente.html', rotulo: 'Abrir o assistente' },
    perfil_genero: { href: 'perfil.html#dados-pessoais', rotulo: 'Autorizar em Meu perfil' },
    perfil_etnia: { href: 'perfil.html#dados-pessoais', rotulo: 'Autorizar em Meu perfil' },
    perfil_nome_social: { href: 'perfil.html#identificacao', rotulo: 'Autorizar em Meu perfil' },
    perfil_redes: { href: 'perfil.html#contato', rotulo: 'Autorizar em Meu perfil' },
    perfil_foto: { href: 'perfil.html#foto', rotulo: 'Autorizar em Meu perfil' }
  };

  async function carregarConsentimentos(ctx) {
    const el = corpo('consentimentos');
    el.setAttribute('aria-busy', 'true');
    let r;
    try { r = await chamar('GET', API.consentimentos, undefined, { silencioso404: true, sinal: ctx.sinal }); }
    catch { erroNoBloco(el, 'Autorizações indisponíveis no momento.', () => carregarConsentimentos(ctx)); return; }
    if (!r) { erroNoBloco(el, 'Autorizações indisponíveis no momento.', () => carregarConsentimentos(ctx)); return; }
    const itens = Array.isArray(r.itens) ? r.itens : [];
    el.setAttribute('aria-busy', 'false');
    if (!itens.length) { el.innerHTML = html`<p>Nenhuma autorização registrada.</p>`; return; }
    el.innerHTML = html`<ul class="pf-lista pf-meus-dados-consentimentos">
      ${itens.map((c) => {
        const onde = ONDE_AUTORIZAR[c.finalidade];
        const meta = c.aceito
          ? html`desde ${dataBr(c.em)}${c.versaoTexto ? html` · versão ${c.versaoTexto}` : ''}`
          : c.em ? html`retirada em ${dataBr(c.em)}` : '';
        return html`<li class="pf-lista__linha" data-finalidade="${c.finalidade}">
          <p class="pf-lista__titulo">${c.rotulo || c.finalidade}</p>
          <p class="pf-lista__meta">${c.aceito ? estado('Autorizado', 'sucesso') : estado('Não autorizado', 'neutro')}${meta ? html` · ${meta}` : ''}</p>
          <div class="pf-lista__acao">${c.aceito
            ? html`<button type="button" class="dmc-btn dmc-btn--secondary pf-btn--perigo" data-pf-meus-dados-acao="retirar" data-finalidade="${c.finalidade}">Retirar autorização</button>`
            : onde ? html`<a class="dmc-btn dmc-btn--link" href="${onde.href}">${onde.rotulo}</a>` : ''}</div>
        </li>`;
      })}
    </ul>`;
    el.querySelectorAll('[data-pf-meus-dados-acao="retirar"]').forEach((b) => {
      const item = itens.find((i) => i.finalidade === b.getAttribute('data-finalidade'));
      b.addEventListener('click', () => retirar(ctx, item, b));
    });
  }

  async function retirar(ctx, item, botao) {
    const ehIa = item.finalidade === 'assistente_ia';
    const opcoes = {
      titulo: `Retirar a autorização de ${item.rotulo || item.finalidade}?`,
      texto: item.efeitoRevogacao || 'A autorização deixa de valer agora.',
      rotuloConfirmar: 'Retirar autorização',
      perigo: true,
      caixa: ehIa ? 'Apagar também o histórico de conversas' : null
    };
    let resposta;
    if (typeof UI.confirmar === 'function' && !ehIa) {
      resposta = (await UI.confirmar(opcoes)) ? { confirmado: true, caixa: false } : false;
    } else {
      resposta = await confirmarLocal(opcoes);
    }
    if (!resposta) return;
    botao.disabled = true;
    botao.setAttribute('aria-busy', 'true');
    try {
      await chamar('POST', API.revogar(item.finalidade), ehIa ? { apagarHistorico: !!resposta.caixa } : {});
      anunciar('Autorização retirada.');
      if (typeof UI.toast === 'function') UI.toast('Autorização retirada.', { tipo: 'sucesso' });
      await carregarConsentimentos(ctx);
      const linha = document.querySelector(`[data-finalidade="${CSS.escape(item.finalidade)}"] .pf-lista__titulo`);
      if (linha) { linha.setAttribute('tabindex', '-1'); linha.focus(); }
    } catch (err) {
      if (err && err.status === 404) { await carregarConsentimentos(ctx); return; }
      botao.disabled = false;
      botao.removeAttribute('aria-busy');
      anunciar(err && err.message ? err.message : 'Não foi possível retirar a autorização agora.');
      if (typeof UI.toast === 'function') UI.toast(err && err.message ? err.message : 'Não foi possível retirar a autorização agora.', { tipo: 'erro' });
    }
  }

  // ---------------------------------------------------------------
  // 3. Exportação (download autenticado por header, nunca token em URL)
  // ---------------------------------------------------------------
  function ligarExportacao() {
    const el = corpo('exportar');
    const botao = el.querySelector('[data-pf-meus-dados-acao="exportar"]');
    const st = el.querySelector('.pf-meus-dados-status');
    botao.disabled = false;
    botao.addEventListener('click', async () => {
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      st.textContent = 'Gerando o arquivo…';
      try {
        const res = await bruto('GET', API.exportacao);
        if (!res.ok) throw await falha(res);
        const buf = await res.arrayBuffer();
        const disp = res.headers.get('Content-Disposition') || '';
        const m = /filename="?([a-z0-9._-]+)"?/i.exec(disp);
        const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(/-/g, '');
        const nome = m ? m[1] : `meus-dados-${hoje}.json`;
        // Tipo refeito no cliente (D-47): o download nunca abre como página.
        const url = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: nome });
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
        st.textContent = 'Arquivo gerado. Confira a pasta de downloads.';
      } catch (err) {
        st.textContent = err && err.status === 404 ? 'A exportação está indisponível no momento.'
          : (err && err.message) || 'Não foi possível gerar o arquivo agora.';
      } finally {
        botao.disabled = false;
        botao.removeAttribute('aria-busy');
      }
    });
  }

  // ---------------------------------------------------------------
  // 4. Pedidos do titular (atendimento `privacidade`, F6a)
  // ---------------------------------------------------------------
  const TIPOS_PEDIDO = [
    { valor: 'acesso', rotulo: 'Acesso aos meus dados' },
    { valor: 'correcao', rotulo: 'Correção' },
    { valor: 'eliminacao', rotulo: 'Eliminação' },
    { valor: 'compartilhamento', rotulo: 'Informação sobre compartilhamento' },
    { valor: 'revogacao_consentimento', rotulo: 'Revogação de consentimento' },
    { valor: 'outro', rotulo: 'Outro' }
  ];
  const ROTULO_TIPO = Object.fromEntries(TIPOS_PEDIDO.map((t) => [t.valor, t.rotulo]));
  const ROTULO_SITUACAO = { aberto: ['Aguardando a equipe', 'info'], respondido: ['Respondido', 'sucesso'], encerrado: ['Encerrado', 'neutro'] };

  async function carregarPedidos(ctx) {
    const el = corpo('pedidos');
    el.setAttribute('aria-busy', 'true');
    let r;
    try { r = await chamar('GET', API.pedidos, undefined, { silencioso404: true, sinal: ctx.sinal }); }
    catch { erroNoBloco(el, 'Não foi possível carregar os seus pedidos.', () => carregarPedidos(ctx)); return; }
    el.setAttribute('aria-busy', 'false');
    if (!r) {
      el.innerHTML = html`<p class="pf-alerta pf-alerta--info">${icone('estadoInfo')}<span>Pedidos indisponíveis no momento. Use o <a href="atendimentos.html">Atendimento</a>.</span></p>`;
      return;
    }
    const itens = Array.isArray(r.itens) ? r.itens : [];
    el.innerHTML = html`
      <form class="pf-meus-dados-form" novalidate>
        <p class="pf-ajuda">Campos com * são obrigatórios.</p>
        <div class="pf-campo" data-campo="tipo">
          <label class="pf-rotulo" for="pf-pedido-tipo">Tipo de pedido<span class="pf-rotulo__obrigatorio" aria-hidden="true"> *</span></label>
          <select class="pf-input" id="pf-pedido-tipo" name="tipo" required aria-required="true" aria-describedby="pf-pedido-tipo-erro">
            <option value="">Selecione</option>
            ${TIPOS_PEDIDO.map((t) => html`<option value="${t.valor}">${t.rotulo}</option>`)}
          </select>
          <p class="pf-erro-campo" id="pf-pedido-tipo-erro" hidden></p>
        </div>
        <div class="pf-campo" data-campo="descricao">
          <label class="pf-rotulo" for="pf-pedido-descricao">O que você precisa<span class="pf-rotulo__obrigatorio" aria-hidden="true"> *</span></label>
          <textarea class="pf-input" id="pf-pedido-descricao" name="descricao" rows="4" maxlength="3000" required aria-required="true" aria-describedby="pf-pedido-descricao-ajuda pf-pedido-descricao-erro"></textarea>
          <p class="pf-ajuda" id="pf-pedido-descricao-ajuda">Descreva o pedido com pelo menos 10 caracteres. Não inclua senhas.</p>
          <p class="pf-erro-campo" id="pf-pedido-descricao-erro" hidden></p>
        </div>
        <div class="pf-campo" data-campo="motivo">
          <label class="pf-rotulo" for="pf-pedido-motivo">Por quê (opcional)</label>
          <textarea class="pf-input" id="pf-pedido-motivo" name="motivo" rows="3" maxlength="900"></textarea>
        </div>
        <div class="pf-meus-dados-form__acoes"><button type="submit" class="dmc-btn dmc-btn--primary">Enviar pedido</button></div>
        <div class="pf-meus-dados-form__resultado" role="status" aria-live="polite"></div>
      </form>
      <h3 class="pf-meus-dados-subtitulo">Seus pedidos</h3>
      <div class="pf-meus-dados-lista-pedidos">${listaPedidos(itens)}</div>`;
    ligarFormularioPedido(el.querySelector('form'));
  }

  function listaPedidos(itens) {
    if (!itens.length) return html`<p>Nenhum pedido registrado.</p>`;
    return html`<ul class="pf-lista">
      ${itens.map((p) => {
        const sit = ROTULO_SITUACAO[p.status] || [p.status || '—', 'neutro'];
        return html`<li class="pf-lista__linha">
          <a class="pf-lista__titulo" href="${`atendimentos.html?protocolo=${encodeURIComponent(p.protocolo)}`}">${p.protocolo}</a>
          <p class="pf-lista__meta">${ROTULO_TIPO[p.pedidoTitular] || p.assunto || ''} · ${estado(sit[0], sit[1])}${p.prazoRespostaEm ? html` · Resposta até ${dataBr(p.prazoRespostaEm)}` : ''}</p>
        </li>`;
      })}
    </ul>`;
  }

  function ligarFormularioPedido(form) {
    const marcar = (nome, texto) => {
      const campo = form.elements.namedItem(nome);
      const p = document.getElementById(`${campo.id}-erro`);
      if (p) { p.textContent = texto || ''; p.hidden = !texto; }
      if (texto) campo.setAttribute('aria-invalid', 'true'); else campo.removeAttribute('aria-invalid');
    };
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      marcar('tipo', ''); marcar('descricao', '');
      const tipo = form.elements.namedItem('tipo').value;
      const descricao = form.elements.namedItem('descricao').value.trim();
      const motivo = form.elements.namedItem('motivo').value.trim();
      let primeiro = null;
      if (!tipo) { marcar('tipo', 'Escolha o tipo de pedido.'); primeiro = primeiro || 'tipo'; }
      if (descricao.length < 10) { marcar('descricao', 'Descreva o pedido com pelo menos 10 caracteres.'); primeiro = primeiro || 'descricao'; }
      if (primeiro) { form.elements.namedItem(primeiro).focus(); return; }
      const botao = form.querySelector('button[type="submit"]');
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      const resultado = form.querySelector('.pf-meus-dados-form__resultado');
      try {
        const mensagem = motivo ? `${descricao}\n\nPor quê: ${motivo}` : descricao;
        const r = await chamar('POST', API.abrirPedido, {
          categoria: 'privacidade',
          pedidoTitular: tipo,
          assunto: `Pedido do titular: ${ROTULO_TIPO[tipo]}`.slice(0, 140),
          mensagem
        });
        form.reset();
        resultado.innerHTML = html`<p class="pf-alerta pf-alerta--sucesso">Pedido ${(r && r.protocolo) || ''} registrado.${r && r.prazoRespostaEm ? html` Resposta até ${dataBr(r.prazoRespostaEm)}.` : ''}</p>`;
        const lista = await chamar('GET', API.pedidos, undefined, { silencioso404: true }).catch(() => null);
        if (lista) document.querySelector('.pf-meus-dados-lista-pedidos').innerHTML = listaPedidos(Array.isArray(lista.itens) ? lista.itens : []);
      } catch (err) {
        if (err && err.status === 404) {
          resultado.innerHTML = html`<p class="pf-alerta pf-alerta--info">Pedidos indisponíveis no momento. Use o <a href="atendimentos.html">Atendimento</a>.</p>`;
        } else {
          resultado.innerHTML = html`<p class="pf-alerta pf-alerta--erro" role="alert">${(err && err.message) || 'Não foi possível registrar o pedido agora.'}</p>`;
        }
      } finally {
        botao.disabled = false;
        botao.removeAttribute('aria-busy');
      }
    });
  }

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  async function boot(ctx) {
    ligarExportacao();
    try {
      await Promise.all([carregarResumo(ctx), carregarConsentimentos(ctx), carregarPedidos(ctx)]);
    } finally {
      // As seções seguintes entram juntas, depois da 1ª carga: nada que já estava na tela é empurrado.
      document.querySelectorAll('[data-pf-meus-dados-revelar]').forEach((s) => s.classList.remove('pf-sem-js'));
    }
    const id = decodeURIComponent(String(window.location.hash || '').slice(1));
    if (id && /^[a-z-]+$/.test(id)) {
      const alvo = document.getElementById(`${id}-titulo`);
      if (alvo) { alvo.setAttribute('tabindex', '-1'); alvo.scrollIntoView({ block: 'start' }); alvo.focus({ preventScroll: true }); }
    }
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'meus-dados' });
})();
