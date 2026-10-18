/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/atendimentos.js (F6a)
   Seus atendimentos — PORTAL-UX §6.12 · PORTAL-API §6.10.1 · D-13, D-19, D-79.
   - lista com pf-segmento (situação), busca por protocolo/assunto,
     categoria e origem; conversa em ?protocolo=ATD-…; Iniciar
     atendimento (?novo=1&categoria=&curso= pré-preenche);
   - HTML só por DMC_UI.html (escape); sem alert/confirm/prompt;
     sem script inline. Componentes do DMC_UI que ainda não existirem
     (toast, confirmar, fmt) são substituídos por equivalentes locais
     com o markup do catálogo pf-* (portal.css).
   ============================================================= */
(function () {
  'use strict';

  const API = {
    lista: '/portal/me/atendimentos',
    um: (p) => `/portal/me/atendimentos/${encodeURIComponent(p)}`,
    mensagens: (p) => `/portal/me/atendimentos/${encodeURIComponent(p)}/mensagens`,
    encerrar: (p) => `/portal/me/atendimentos/${encodeURIComponent(p)}/encerrar`,
    cursos: '/portal/me/cursos'
  };
  const CATEGORIAS = [
    ['academico', 'Acadêmico'], ['secretaria', 'Secretaria'], ['financeiro', 'Financeiro'],
    ['tecnico', 'Acesso e tecnologia'], ['privacidade', 'Privacidade e dados pessoais']
  ];
  const ROTULO_CATEGORIA = Object.fromEntries(CATEGORIAS);
  const PEDIDOS = [
    ['acesso', 'Acesso aos meus dados'], ['correcao', 'Correção'], ['eliminacao', 'Eliminação'],
    ['compartilhamento', 'Informação sobre compartilhamento'], ['revogacao_consentimento', 'Revogação de consentimento'], ['outro', 'Outro']
  ];
  const ROTULO_PEDIDO = Object.fromEntries(PEDIDOS);
  const SITUACAO = { aberto: ['Aberto', 'info'], respondido: ['Respondido', 'info'], encerrado: ['Encerrado', 'neutro'] };
  const ATD_RE = /^ATD-\d{4}-[2-9A-HJ-NP-Z]{6}$/;
  const POR_PAGINA = 25;

  const UI = window.DMC_UI;
  const html = UI.html;
  const fmtSP = (op) => new Intl.DateTimeFormat('pt-BR', Object.assign({ timeZone: 'America/Sao_Paulo' }, op));
  const FMT_DATA = fmtSP({ day: '2-digit', month: '2-digit', year: 'numeric' });
  const FMT_HORA = fmtSP({ hour: '2-digit', minute: '2-digit' });
  const fmtData = (iso) => (iso ? (UI.fmt && UI.fmt.data ? UI.fmt.data(iso) : FMT_DATA.format(new Date(iso))) : '—');
  const fmtDataHora = (iso) => (iso ? (UI.fmt && UI.fmt.dataHora ? UI.fmt.dataHora(iso) : `${FMT_DATA.format(new Date(iso))} · ${FMT_HORA.format(new Date(iso))}`) : '—');
  const fmtMoeda = (c) => (Number.isInteger(c) ? (UI.fmt && UI.fmt.moeda ? UI.fmt.moeda(c) : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })) : null);

  function estado(rotulo, tom) {
    if (typeof UI.estado === 'function') return UI.estado(rotulo, tom);
    const glifo = UI.icone(tom === 'sucesso' ? 'estadoSucesso' : tom === 'aviso' ? 'estadoAviso' : tom === 'erro' ? 'estadoErro' : tom === 'info' ? 'estadoInfo' : 'estadoNeutro');
    return html`<span class="pf-estado pf-estado--${tom}">${glifo}${rotulo}</span>`;
  }
  const situacao = (s) => estado((SITUACAO[s] || ['—'])[0], (SITUACAO[s] || [null, 'neutro'])[1]);

  // ---------- retorno ao usuário ----------
  let regiaoAviso = null;
  function anunciar(texto) {
    const r = document.querySelector('[data-at-anuncio]');
    if (r) { r.textContent = ''; window.setTimeout(() => { r.textContent = texto; }, 30); }
  }
  function avisar(texto, tipo) {
    if (typeof UI.toast === 'function') { UI.toast(texto, { tipo: tipo || 'sucesso' }); return; }
    if (!regiaoAviso) return anunciar(texto);
    const tom = tipo === 'erro' ? 'erro' : tipo === 'aviso' ? 'aviso' : tipo === 'info' ? 'info' : 'sucesso';
    regiaoAviso.innerHTML = html`<div class="pf-alerta pf-alerta--${tom}" role="${tom === 'erro' ? 'alert' : 'status'}"><p>${texto}</p></div>`;
  }
  function limparAviso() { if (regiaoAviso && typeof UI.toast !== 'function') regiaoAviso.textContent = ''; }

  function camposDoErro(err) {
    return (err && (err.campos || (err.dados && err.dados.campos))) || null;
  }
  function mensagemDoErro(err) {
    return (err && err.message) || 'Não foi possível concluir agora. Tente de novo.';
  }

  // ---------- diálogo (catálogo pf-dialogo) ----------
  /**
   * Abre um <dialog class="pf-dialogo"> com um formulário. `enviar(form)` roda no submit;
   * se lançar, o erro fica no diálogo (campos marcados) e ele continua aberto.
   */
  function abrirDialogo({ titulo, corpo, rotuloEnviar, rotuloCancelar = 'Cancelar', perigo = false, largura = 'm', enviar, aoAbrir }) {
    return new Promise((resolver) => {
      const d = document.createElement('dialog');
      d.className = `pf-dialogo${largura === 'p' ? ' pf-dialogo--p' : largura === 'g' ? ' pf-dialogo--g' : ''}`;
      const idTitulo = `at-dlg-${Math.random().toString(36).slice(2, 8)}`;
      d.setAttribute('aria-labelledby', idTitulo);
      d.innerHTML = html`<form method="dialog" novalidate>
          <div class="pf-dialogo__cabeca"><h2 class="pf-dialogo__titulo" id="${idTitulo}">${titulo}</h2></div>
          <div class="pf-dialogo__corpo">${corpo}<div data-dlg-erro></div></div>
          <div class="pf-dialogo__acoes">
            <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-acao="cancelar">${rotuloCancelar}</button>
            <button type="submit" class="dmc-btn ${perigo ? 'pf-btn--perigo' : 'dmc-btn--primary'}" data-pf-acao="confirmar">${rotuloEnviar}</button>
          </div>
        </form>`;
      document.body.appendChild(d);
      const form = d.querySelector('form');
      const botao = d.querySelector('[data-pf-acao="confirmar"]');
      const caixaErro = d.querySelector('[data-dlg-erro]');
      let fim = null;
      const fechar = (valor) => { fim = valor; d.close(); };
      d.addEventListener('close', () => { d.remove(); resolver(fim); });
      d.querySelector('[data-pf-acao="cancelar"]').addEventListener('click', () => fechar(null));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        caixaErro.textContent = '';
        form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
        form.querySelectorAll('.pf-erro-campo').forEach((el) => el.remove());
        botao.disabled = true;
        botao.setAttribute('aria-busy', 'true');
        try {
          const r = enviar ? await enviar(form) : true;
          fechar(r === undefined ? true : r);
        } catch (err) {
          const campos = camposDoErro(err);
          let marcou = false;
          if (campos) {
            for (const [nome, msg] of Object.entries(campos)) {
              const el = form.elements[nome];
              if (!el || !el.closest) continue;
              el.setAttribute('aria-invalid', 'true');
              const p = document.createElement('p');
              p.className = 'pf-erro-campo';
              p.id = `${el.id || nome}-erro`;
              p.textContent = String(msg);
              el.closest('.pf-campo').appendChild(p);
              el.setAttribute('aria-describedby', [el.getAttribute('aria-describedby'), p.id].filter(Boolean).join(' '));
              if (!marcou) { el.focus(); marcou = true; }
            }
          }
          if (!marcou) caixaErro.innerHTML = html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>${mensagemDoErro(err)}</p></div>`;
        } finally {
          botao.disabled = false;
          botao.removeAttribute('aria-busy');
        }
      });
      d.showModal();
      d.querySelector('[data-pf-acao="cancelar"]').focus();
      if (typeof aoAbrir === 'function') aoAbrir(d, form);
    });
  }

  function confirmar({ titulo, texto, rotuloConfirmar, perigo = false }) {
    if (typeof UI.confirmar === 'function') return UI.confirmar({ titulo, texto, rotuloConfirmar, perigo });
    return abrirDialogo({ titulo, corpo: html`<p>${texto}</p>`, rotuloEnviar: rotuloConfirmar, perigo, largura: 'p' });
  }

  function contador(textarea, max) {
    const p = textarea.closest('.pf-campo').querySelector('[data-contador]');
    if (!p) return;
    const atualizar = () => { p.textContent = `${textarea.value.length} de ${max} caracteres`; };
    textarea.addEventListener('input', atualizar);
    atualizar();
  }

  // ---------- estado da página ----------
  const st = { filtro: 'todos', categoria: '', origem: '', q: '', pagina: 1, itens: [], total: 0, contagens: null, cursos: null };

  async function carregarCursos() {
    if (st.cursos) return st.cursos;
    try {
      const r = await window.DMC_Api.get(API.cursos, { silencioso404: true });
      st.cursos = (r && Array.isArray(r.itens) ? r.itens : []).map((i) => i.curso).filter((c) => c && c.id).map((c) => ({ id: c.id, titulo: c.titulo }));
    } catch {
      st.cursos = [];
    }
    return st.cursos;
  }

  // ---------- lista ----------
  function montarFiltros(el) {
    const c = st.contagens;
    const opcoes = [['todos', 'Todos', c ? c.aberto + c.respondido + c.encerrado : null], ['aberto', 'Abertos', c && c.aberto], ['respondido', 'Respondidos', c && c.respondido], ['encerrado', 'Encerrados', c && c.encerrado]];
    el.innerHTML = html`<div class="pf-at-filtros">
        <div class="pf-segmento" role="group" aria-label="Situação">
          ${opcoes.map(([v, r, n]) => html`<button type="button" class="pf-segmento__opcao" data-at-segmento="${v}" aria-pressed="${st.filtro === v ? 'true' : 'false'}">${r}${Number.isInteger(n) ? html` <span class="pf-segmento__contagem">(${n})</span>` : ''}</button>`)}
        </div>
        <form class="pf-campo pf-at-busca" role="search" data-at-busca>
          <label class="pf-rotulo" for="at-q">Buscar por protocolo ou assunto</label>
          <input class="pf-input" id="at-q" name="q" type="search" maxlength="80" autocomplete="off" value="${st.q}">
        </form>
        <div class="pf-campo">
          <label class="pf-rotulo" for="at-categoria">Categoria</label>
          <select class="pf-input" id="at-categoria" data-at-categoria>
            <option value="">Todas</option>
            ${CATEGORIAS.map(([v, r]) => html`<option value="${v}" ${st.categoria === v ? 'selected' : ''}>${r}</option>`)}
          </select>
        </div>
        <div class="pf-campo">
          <label class="pf-rotulo" for="at-origem">Origem</label>
          <select class="pf-input" id="at-origem" data-at-origem>
            <option value="">Todas</option>
            <option value="ia" ${st.origem === 'ia' ? 'selected' : ''}>Assistente</option>
            <option value="humano" ${st.origem === 'humano' ? 'selected' : ''}>Direto</option>
          </select>
        </div>
      </div>`;
    el.querySelectorAll('[data-at-segmento]').forEach((b) => b.addEventListener('click', () => { st.filtro = b.dataset.atSegmento; recarregar(); }));
    el.querySelector('[data-at-categoria]').addEventListener('change', (ev) => { st.categoria = ev.target.value; recarregar(); });
    el.querySelector('[data-at-origem]').addEventListener('change', (ev) => { st.origem = ev.target.value; recarregar(); });
    const form = el.querySelector('[data-at-busca]');
    let t = null;
    const buscar = () => {
      const v = form.elements.q.value.trim();
      if (v === st.q || (v && v.length < 2)) return;
      st.q = v; recarregar({ manterFoco: '#at-q' });
    };
    form.addEventListener('submit', (ev) => { ev.preventDefault(); buscar(); });
    form.elements.q.addEventListener('input', () => { window.clearTimeout(t); t = window.setTimeout(buscar, 400); });
  }

  function query() {
    const p = new URLSearchParams();
    if (st.filtro !== 'todos') p.set('status', st.filtro);
    if (st.categoria) p.set('categoria', st.categoria);
    if (st.origem) p.set('origem', st.origem);
    if (st.q) p.set('q', st.q);
    p.set('pagina', String(st.pagina));
    p.set('porPagina', String(POR_PAGINA));
    return p.toString();
  }

  async function recarregar({ manterFoco = null, acrescentar = false } = {}) {
    const alvo = document.querySelector('[data-at-tabela]');
    if (!acrescentar) { st.pagina = 1; alvo.setAttribute('aria-busy', 'true'); }
    try {
      const r = await window.DMC_Api.get(`${API.lista}?${query()}`);
      st.itens = acrescentar ? st.itens.concat(r.itens || []) : (r.itens || []);
      st.total = r.total || 0;
      st.contagens = r.contagens || null;
      montarFiltros(document.querySelector('[data-at-filtros]'));
      if (manterFoco) { const el = document.querySelector(manterFoco); if (el) { el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch { /* type=search */ } } }
      desenharTabela(alvo);
      anunciar(`${st.total} ${st.total === 1 ? 'atendimento' : 'atendimentos'}.`);
    } catch (err) {
      UI.erroCarga(alvo, err, { tentarDeNovo: () => recarregar() });
    }
  }

  function desenharTabela(alvo) {
    alvo.setAttribute('aria-busy', 'false');
    const filtrando = st.filtro !== 'todos' || st.categoria || st.origem || st.q;
    if (!st.itens.length) {
      alvo.innerHTML = filtrando
        ? html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhum atendimento com estes filtros.</p><p class="pf-vazio__texto">Mude a situação, a categoria ou a busca.</p></div>`
        : html`<div class="pf-vazio">${UI.icone('navAtendimento')}<p class="pf-vazio__titulo">Você ainda não abriu nenhum atendimento.</p><p class="pf-vazio__texto">Fale com a coordenação, a secretaria ou os professores do seu curso por aqui.</p><div class="pf-vazio__acoes"><button type="button" class="dmc-btn dmc-btn--primary" data-at-novo-vazio>Iniciar atendimento</button></div></div>`;
      const b = alvo.querySelector('[data-at-novo-vazio]');
      if (b) b.addEventListener('click', () => iniciarAtendimento());
      return;
    }
    const temPrazo = st.itens.some((i) => i.prazoRespostaEm);
    alvo.innerHTML = html`<table class="pf-tabela">
        <caption>Atendimentos (${st.total})</caption>
        <thead><tr>
          <th scope="col">Protocolo</th><th scope="col">Assunto</th><th scope="col" class="pf-tabela__secundaria">Categoria</th>
          <th scope="col" class="pf-tabela__secundaria">Aberto em</th><th scope="col">Última atualização</th><th scope="col">Situação</th>
          ${temPrazo ? html`<th scope="col">Prazo</th>` : ''}
        </tr></thead>
        <tbody>${st.itens.map((i) => html`<tr>
          <td data-rotulo="Protocolo"><a class="pf-at-codigo" href="atendimentos.html?protocolo=${i.protocolo}" data-at-abrir="${i.protocolo}">${i.protocolo}</a></td>
          <td data-rotulo="Assunto">${i.assunto}</td>
          <td data-rotulo="Categoria" class="pf-tabela__secundaria">${ROTULO_CATEGORIA[i.categoria] || i.categoria}${i.origem === 'ia' ? ' · pelo assistente' : ''}</td>
          <td data-rotulo="Aberto em" class="pf-tabela__secundaria">${fmtData(i.criadoEm)}</td>
          <td data-rotulo="Última atualização">${fmtDataHora(i.ultimaAtividadeEm)}</td>
          <td data-rotulo="Situação">${situacao(i.status)}${i.aguardando === 'aluno' ? html`<span class="pf-at-aguardando">Aguardando você</span>` : ''}</td>
          ${temPrazo ? html`<td data-rotulo="Prazo">${i.prazoRespostaEm ? `Resposta até ${fmtData(i.prazoRespostaEm)}` : '—'}</td>` : ''}
        </tr>`)}</tbody>
      </table>
      ${st.itens.length < st.total ? html`<div class="pf-at-mais"><button type="button" class="dmc-btn dmc-btn--secondary" data-at-mais>Carregar mais</button> <span class="pf-at-status">Mostrando ${st.itens.length} de ${st.total}</span></div>` : ''}`;
    alvo.querySelectorAll('[data-at-abrir]').forEach((a) => a.addEventListener('click', (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
      ev.preventDefault();
      abrirConversa(a.dataset.atAbrir, { empurrar: true });
    }));
    const mais = alvo.querySelector('[data-at-mais]');
    if (mais) mais.addEventListener('click', () => { st.pagina += 1; recarregar({ acrescentar: true }); });
  }

  // ---------- iniciar ----------
  async function iniciarAtendimento(pre = {}) {
    const cursos = await carregarCursos();
    const cat = CATEGORIAS.some(([v]) => v === pre.categoria) ? pre.categoria : '';
    const corpo = html`
      <p class="pf-obrigatorios">Campos com * são obrigatórios.</p>
      <div class="pf-campo">
        <label class="pf-rotulo" for="atn-categoria">Categoria <span aria-hidden="true">*</span></label>
        <select class="pf-input" id="atn-categoria" name="categoria" required>
          <option value="">Escolha</option>
          ${CATEGORIAS.map(([v, r]) => html`<option value="${v}" ${cat === v ? 'selected' : ''}>${r}</option>`)}
        </select>
      </div>
      <div class="pf-campo" data-at-pedido-campo hidden>
        <label class="pf-rotulo" for="atn-pedido">Tipo de pedido <span aria-hidden="true">*</span></label>
        <select class="pf-input" id="atn-pedido" name="pedidoTitular" aria-describedby="atn-pedido-ajuda">
          <option value="">Escolha</option>
          ${PEDIDOS.map(([v, r]) => html`<option value="${v}">${r}</option>`)}
        </select>
        <p class="pf-ajuda" id="atn-pedido-ajuda">A coordenação responde em até 15 dias.</p>
      </div>
      <div class="pf-campo">
        <label class="pf-rotulo" for="atn-curso">Curso relacionado</label>
        <select class="pf-input" id="atn-curso" name="cursoId" aria-describedby="atn-curso-ajuda">
          <option value="">Nenhum</option>
          ${cursos.map((c) => html`<option value="${c.id}" ${pre.curso === c.id ? 'selected' : ''}>${c.titulo}</option>`)}
        </select>
        <p class="pf-ajuda" id="atn-curso-ajuda">${cursos.length ? 'Em Acadêmico, o atendimento vai aos professores do curso.' : 'Sem curso relacionado, o atendimento vai à coordenação.'}</p>
      </div>
      <div class="pf-campo">
        <label class="pf-rotulo" for="atn-assunto">Assunto <span aria-hidden="true">*</span></label>
        <input class="pf-input" id="atn-assunto" name="assunto" type="text" minlength="5" maxlength="140" required autocomplete="off">
      </div>
      <div class="pf-campo">
        <label class="pf-rotulo" for="atn-mensagem">Mensagem <span aria-hidden="true">*</span></label>
        <textarea class="pf-input" id="atn-mensagem" name="mensagem" rows="6" minlength="10" maxlength="4000" required aria-describedby="atn-mensagem-contador"></textarea>
        <p class="pf-at-contador" id="atn-mensagem-contador" data-contador aria-live="off"></p>
      </div>`;
    const criado = await abrirDialogo({
      titulo: 'Iniciar atendimento', corpo, rotuloEnviar: 'Abrir atendimento', largura: 'm',
      aoAbrir: (d, form) => {
        const sel = form.elements.categoria;
        const campoPedido = d.querySelector('[data-at-pedido-campo]');
        const sync = () => { const priv = sel.value === 'privacidade'; campoPedido.hidden = !priv; form.elements.pedidoTitular.required = priv; };
        sel.addEventListener('change', sync);
        sync();
        contador(form.elements.mensagem, 4000);
        (cat ? form.elements.assunto : sel).focus();
      },
      enviar: async (form) => {
        const v = (n) => form.elements[n].value.trim();
        const erros = {};
        if (!v('categoria')) erros.categoria = 'Escolha a categoria.';
        if (v('categoria') === 'privacidade' && !v('pedidoTitular')) erros.pedidoTitular = 'Escolha o tipo de pedido.';
        if (v('assunto').length < 5) erros.assunto = 'Use pelo menos 5 caracteres.';
        if (v('mensagem').length < 10) erros.mensagem = 'Use pelo menos 10 caracteres.';
        if (Object.keys(erros).length) { const e = new Error('Confira os campos destacados.'); e.campos = erros; throw e; }
        const corpoReq = { categoria: v('categoria'), assunto: v('assunto'), mensagem: form.elements.mensagem.value, cursoId: v('cursoId') || null };
        if (corpoReq.categoria === 'privacidade') corpoReq.pedidoTitular = v('pedidoTitular');
        return window.DMC_Api.post(API.lista, corpoReq);
      }
    });
    if (criado && criado.protocolo) {
      const prazo = criado.prazoRespostaEm ? ` Resposta até ${fmtData(criado.prazoRespostaEm)}.` : '';
      await abrirConversa(criado.protocolo, { empurrar: true });
      avisar(`Atendimento ${criado.protocolo} aberto.${prazo}`, 'sucesso');
    }
  }

  // ---------- conversa ----------
  function mostrarLista() {
    document.getElementById('at-lista').hidden = false;
    const c = document.getElementById('at-conversa');
    c.hidden = true;
    c.textContent = '';
  }

  async function abrirConversa(protocolo, { empurrar = false } = {}) {
    const sec = document.getElementById('at-conversa');
    if (!ATD_RE.test(protocolo)) {
      mostrarLista();
      avisar('Protocolo inválido.', 'aviso');
      return;
    }
    if (empurrar) window.history.pushState({ protocolo }, '', `atendimentos.html?protocolo=${encodeURIComponent(protocolo)}`);
    limparAviso();
    document.getElementById('at-lista').hidden = true;
    sec.hidden = false;
    sec.setAttribute('aria-busy', 'true');
    sec.innerHTML = html`<p class="pf-at-status">Carregando o atendimento ${protocolo}…</p>`;
    let p;
    try {
      p = await window.DMC_Api.get(API.um(protocolo));
    } catch (err) {
      sec.setAttribute('aria-busy', 'false');
      if (err && err.status === 404 || /não encontrado/i.test(mensagemDoErro(err))) {
        sec.innerHTML = html`<a class="pf-cabecalho__voltar" href="atendimentos.html" data-at-voltar>← Seus atendimentos</a>
          <div class="pf-vazio"><p class="pf-vazio__titulo">Não encontramos este atendimento.</p><p class="pf-vazio__texto">Confira o protocolo ou volte à lista.</p></div>`;
        ligarVoltar(sec);
        return;
      }
      UI.erroCarga(sec, err, { tentarDeNovo: () => abrirConversa(protocolo) });
      return;
    }
    desenharConversa(sec, p);
  }

  function ligarVoltar(sec) {
    sec.querySelectorAll('[data-at-voltar]').forEach((a) => a.addEventListener('click', (ev) => {
      ev.preventDefault();
      window.history.pushState({}, '', 'atendimentos.html');
      mostrarLista();
      recarregar();
      const t = document.querySelector('[data-at-titulo]');
      if (t) t.focus();
    }));
  }

  function desenharConversa(sec, p) {
    sec.setAttribute('aria-busy', 'false');
    const encerrado = p.status === 'encerrado';
    const pedido = p.pedido;
    sec.innerHTML = html`
      <a class="pf-cabecalho__voltar" href="atendimentos.html" data-at-voltar>← Seus atendimentos</a>
      <h2 class="pf-at-reg__titulo" tabindex="-1" data-at-conversa-titulo>${p.assunto}</h2>
      <dl class="pf-at-meta">
        <div><dt>Protocolo</dt><dd>${UI.codigo ? UI.codigo(p.protocolo) : html`<span class="pf-at-codigo">${p.protocolo}</span>`}</dd></div>
        <div><dt>Situação</dt><dd>${situacao(p.status)}${p.aguardando === 'aluno' ? html`<span class="pf-at-aguardando">Aguardando você</span>` : ''}</dd></div>
        <div><dt>Categoria</dt><dd>${ROTULO_CATEGORIA[p.categoria] || p.categoria}</dd></div>
        <div><dt>Aberto em</dt><dd>${fmtDataHora(p.criadoEm)}</dd></div>
        ${p.curso ? html`<div><dt>Curso</dt><dd>${p.curso.titulo}</dd></div>` : ''}
        ${p.origem === 'ia' ? html`<div><dt>Origem</dt><dd>Assistente acadêmico</dd></div>` : ''}
        ${p.pedidoTitular ? html`<div><dt>Tipo de pedido</dt><dd>${ROTULO_PEDIDO[p.pedidoTitular] || p.pedidoTitular}</dd></div>` : ''}
        ${p.prazoRespostaEm ? html`<div><dt>Prazo de resposta</dt><dd>até ${fmtData(p.prazoRespostaEm)}</dd></div>` : ''}
      </dl>
      ${pedido ? html`<section class="pf-at-pedido" aria-labelledby="at-pedido-titulo">
          <h3 class="pf-secao-titulo" id="at-pedido-titulo">Pedido</h3>
          <ul class="pf-lista">${(pedido.itens || []).map((i) => html`<li class="pf-lista__linha"><p class="pf-lista__titulo">${i.titulo}</p><p class="pf-lista__meta">${fmtMoeda(i.valorCentavos) || 'a confirmar pela coordenação'}</p></li>`)}</ul>
          <p class="pf-at-pedido__total">Total: ${fmtMoeda(pedido.totalCentavos) || 'a confirmar pela coordenação'}</p>
          <p class="pf-at-pedido__nota">A coordenação responde aqui com as formas de pagamento e libera o acesso depois da confirmação.</p>
        </section>` : ''}
      ${p.anexoConversa && p.anexoConversa.mensagens && p.anexoConversa.mensagens.length ? html`<details class="pf-at-anexo">
          <summary>Conversa com o assistente anexada (${p.anexoConversa.mensagens.length} mensagens)</summary>
          <ul class="pf-at-anexo__lista">${p.anexoConversa.mensagens.map((m) => html`<li><strong>${m.papel === 'aluno' ? 'Você' : 'Assistente'}</strong> · ${fmtDataHora(m.em)}<br>${m.texto}</li>`)}</ul>
        </details>` : ''}
      <ol class="pf-linha-tempo pf-at-conversa" aria-label="Mensagens">
        ${(p.mensagens || []).map((m) => html`<li class="pf-linha-tempo__item">
          <div class="pf-at-msg ${m.autor === 'equipe' ? 'pf-at-msg--equipe' : ''}">
            <p class="pf-at-msg__autor">${m.autor === 'aluno' ? 'Você' : 'Equipe Complexo DMC'} · <time datetime="${m.em}">${fmtDataHora(m.em)}</time></p>
            <p class="pf-at-msg__texto">${m.texto}</p>
          </div>
        </li>`)}
        ${encerrado ? html`<li class="pf-linha-tempo__item pf-linha-tempo__item--sistema">Atendimento encerrado em ${fmtDataHora(p.encerradoEm)}.</li>` : ''}
      </ol>
      ${encerrado
        ? html`<div class="pf-at-compositor"><p>Este atendimento foi encerrado. Para continuar o assunto, inicie um novo atendimento.</p><div class="pf-at-compositor__acoes"><button type="button" class="dmc-btn dmc-btn--primary" data-at-novo-encerrado>Iniciar novo atendimento</button></div></div>`
        : html`<form class="pf-at-compositor" data-at-responder novalidate>
            <div class="pf-campo">
              <label class="pf-rotulo" for="at-resposta">Responder</label>
              <textarea class="pf-input" id="at-resposta" name="texto" rows="4" maxlength="4000" required aria-describedby="at-resposta-contador"></textarea>
              <p class="pf-at-contador" id="at-resposta-contador" data-contador aria-live="off"></p>
            </div>
            <div data-at-resposta-erro></div>
            <div class="pf-at-compositor__acoes">
              <button type="submit" class="dmc-btn dmc-btn--primary">Enviar mensagem</button>
              <button type="button" class="dmc-btn dmc-btn--secondary" data-at-encerrar>Encerrar atendimento</button>
            </div>
          </form>`}`;
    ligarVoltar(sec);
    const titulo = sec.querySelector('[data-at-conversa-titulo]');
    if (titulo) titulo.focus();
    const novo = sec.querySelector('[data-at-novo-encerrado]');
    if (novo) novo.addEventListener('click', () => iniciarAtendimento({ categoria: p.categoria, curso: p.cursoId }));
    const form = sec.querySelector('[data-at-responder]');
    if (form) {
      contador(form.elements.texto, 4000);
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const caixa = form.querySelector('[data-at-resposta-erro]');
        caixa.textContent = '';
        const texto = form.elements.texto.value;
        if (!texto.trim()) {
          caixa.innerHTML = html`<p class="pf-erro-campo">Escreva a mensagem antes de enviar.</p>`;
          form.elements.texto.focus();
          return;
        }
        const botao = form.querySelector('button[type="submit"]');
        botao.disabled = true;
        try {
          await window.DMC_Api.post(API.mensagens(p.protocolo), { texto });
          await abrirConversa(p.protocolo);
          avisar('Mensagem enviada.', 'sucesso');
        } catch (err) {
          caixa.innerHTML = html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>${mensagemDoErro(err)}</p></div>`;
          botao.disabled = false;
        }
      });
      sec.querySelector('[data-at-encerrar]').addEventListener('click', async () => {
        const ok = await confirmar({ titulo: 'Encerrar este atendimento?', texto: 'Depois de encerrado, ele não recebe novas mensagens. Para continuar o assunto, você inicia um novo atendimento.', rotuloConfirmar: 'Encerrar atendimento', perigo: true });
        if (!ok) return;
        try {
          await window.DMC_Api.post(API.encerrar(p.protocolo), {});
          await abrirConversa(p.protocolo);
          avisar('Atendimento encerrado.', 'sucesso');
        } catch (err) {
          avisar(mensagemDoErro(err), 'erro');
        }
      });
    }
  }

  // ---------- boot ----------
  async function boot(ctx) {
    const cab = document.querySelector('.pf-cabecalho');
    regiaoAviso = document.createElement('div');
    regiaoAviso.setAttribute('data-at-aviso', '');
    cab.insertAdjacentElement('afterend', regiaoAviso);
    const botaoNovo = document.querySelector('[data-at-novo]');
    botaoNovo.hidden = false;
    botaoNovo.addEventListener('click', () => iniciarAtendimento());
    window.addEventListener('popstate', () => {
      const p = new URLSearchParams(window.location.search).get('protocolo');
      if (p) abrirConversa(p.toUpperCase());
      else { mostrarLista(); recarregar(); }
    });
    const protocolo = (ctx.params.get('protocolo') || '').toUpperCase();
    if (protocolo) {
      document.querySelector('[data-at-tabela]').setAttribute('aria-busy', 'false'); // a lista só carrega ao voltar
      await abrirConversa(protocolo);
    } else await recarregar();
    if (ctx.params.get('novo') === '1') {
      await iniciarAtendimento({ categoria: ctx.params.get('categoria') || '', curso: ctx.params.get('curso') || '' });
    }
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'atendimento' });
})();
