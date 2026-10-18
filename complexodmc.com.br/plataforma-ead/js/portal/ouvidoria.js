/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/ouvidoria.js (F6a)
   Ouvidoria — PORTAL-UX §6.12 · PORTAL-API §6.10.2 · DC-40, D-27.
   - Registrar manifestação: tipo em rádios grandes (Elogio · Sugestão ·
     Reclamação · Denúncia), assunto, mensagem, curso opcional; aviso
     fixo de identidade igual nos 4 tipos (sem caixa de "resguardar");
   - Minhas manifestações + detalhe (?protocolo=OUV-…) com a resposta.
   HTML só por DMC_UI.html; sem alert/confirm/prompt; sem script inline.
   ============================================================= */
(function () {
  'use strict';

  const API = {
    lista: '/portal/me/ouvidoria',
    uma: (p) => `/portal/me/ouvidoria/${encodeURIComponent(p)}`,
    mensagens: (p) => `/portal/me/ouvidoria/${encodeURIComponent(p)}/mensagens`,
    encerrar: (p) => `/portal/me/ouvidoria/${encodeURIComponent(p)}/encerrar`,
    cursos: '/portal/me/cursos'
  };
  const TIPOS = [
    ['elogio', 'Elogio', 'Reconheça algo que funcionou bem.'],
    ['sugestao', 'Sugestão', 'Proponha uma melhoria para a plataforma ou os cursos.'],
    ['reclamacao', 'Reclamação', 'Relate um problema para a coordenação analisar.'],
    ['denuncia', 'Denúncia', 'Apurada só pela coordenação; não é encaminhada a professores.']
  ];
  const ROTULO_TIPO = Object.fromEntries(TIPOS.map(([v, r]) => [v, r]));
  const SITUACAO = { aberto: ['Aberto', 'info'], respondido: ['Respondido', 'info'], encerrado: ['Encerrado', 'neutro'] };
  const OUV_RE = /^OUV-\d{4}-[2-9A-HJ-NP-Z]{6}$/;
  const AVISO_IDENTIDADE = 'Sua identidade nunca é mostrada a professores. A coordenação vê quem escreveu para poder responder; o próprio texto pode identificar você.';

  const UI = window.DMC_UI;
  const html = UI.html;
  const fmtSP = (op) => new Intl.DateTimeFormat('pt-BR', Object.assign({ timeZone: 'America/Sao_Paulo' }, op));
  const FMT_DATA = fmtSP({ day: '2-digit', month: '2-digit', year: 'numeric' });
  const FMT_HORA = fmtSP({ hour: '2-digit', minute: '2-digit' });
  const fmtData = (iso) => (iso ? (UI.fmt && UI.fmt.data ? UI.fmt.data(iso) : FMT_DATA.format(new Date(iso))) : '—');
  const fmtDataHora = (iso) => (iso ? (UI.fmt && UI.fmt.dataHora ? UI.fmt.dataHora(iso) : `${FMT_DATA.format(new Date(iso))} · ${FMT_HORA.format(new Date(iso))}`) : '—');

  function estado(rotulo, tom) {
    if (typeof UI.estado === 'function') return UI.estado(rotulo, tom);
    const glifo = UI.icone(tom === 'info' ? 'estadoInfo' : 'estadoNeutro');
    return html`<span class="pf-estado pf-estado--${tom}">${glifo}${rotulo}</span>`;
  }
  const situacao = (s) => estado((SITUACAO[s] || ['—'])[0], (SITUACAO[s] || [null, 'neutro'])[1]);
  const mensagemDoErro = (err) => (err && err.message) || 'Não foi possível concluir agora. Tente de novo.';
  const camposDoErro = (err) => (err && (err.campos || (err.dados && err.dados.campos))) || null;

  function anunciar(texto) {
    const r = document.querySelector('[data-ouv-anuncio]');
    if (r) { r.textContent = ''; window.setTimeout(() => { r.textContent = texto; }, 30); }
  }
  function avisar(texto, tipo) {
    if (typeof UI.toast === 'function') { UI.toast(texto, { tipo: tipo || 'sucesso' }); return; }
    const alvo = document.querySelector('[data-ouv-aviso]');
    const tom = tipo === 'erro' ? 'erro' : tipo === 'aviso' ? 'aviso' : 'sucesso';
    if (alvo) alvo.innerHTML = html`<div class="pf-alerta pf-alerta--${tom}" role="${tom === 'erro' ? 'alert' : 'status'}"><p>${texto}</p></div>`;
    else anunciar(texto);
  }

  async function confirmar({ titulo, texto, rotuloConfirmar }) {
    if (typeof UI.confirmar === 'function') return UI.confirmar({ titulo, texto, rotuloConfirmar, perigo: true });
    return new Promise((resolver) => {
      const d = document.createElement('dialog');
      d.className = 'pf-dialogo pf-dialogo--p';
      d.setAttribute('aria-labelledby', 'ouv-dlg-titulo');
      d.innerHTML = html`<div class="pf-dialogo__cabeca"><h2 class="pf-dialogo__titulo" id="ouv-dlg-titulo">${titulo}</h2></div>
        <div class="pf-dialogo__corpo"><p>${texto}</p></div>
        <div class="pf-dialogo__acoes">
          <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-acao="cancelar">Cancelar</button>
          <button type="button" class="dmc-btn pf-btn--perigo" data-pf-acao="confirmar">${rotuloConfirmar}</button>
        </div>`;
      document.body.appendChild(d);
      let r = false;
      d.addEventListener('close', () => { d.remove(); resolver(r); });
      d.querySelector('[data-pf-acao="cancelar"]').addEventListener('click', () => d.close());
      d.querySelector('[data-pf-acao="confirmar"]').addEventListener('click', () => { r = true; d.close(); });
      d.showModal();
      d.querySelector('[data-pf-acao="cancelar"]').focus();
    });
  }

  function contador(textarea, max) {
    const p = textarea.closest('.pf-campo').querySelector('[data-contador]');
    const atualizar = () => { p.textContent = `${textarea.value.length} de ${max} caracteres`; };
    textarea.addEventListener('input', atualizar);
    atualizar();
  }

  function limparErros(form) {
    form.querySelectorAll('.pf-erro-campo').forEach((el) => el.remove());
    form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
  }
  function marcarErros(form, campos) {
    let primeiro = null;
    for (const [nome, msg] of Object.entries(campos || {})) {
      const el = form.elements[nome];
      if (!el) continue;
      const alvo = el.length && !el.tagName ? el[0] : el;
      const campo = (alvo.closest && (alvo.closest('.pf-campo') || alvo.closest('fieldset'))) || form;
      const p = document.createElement('p');
      p.className = 'pf-erro-campo';
      p.id = `ouv-erro-${nome}`;
      p.textContent = String(msg);
      campo.appendChild(p);
      if (alvo.setAttribute) { alvo.setAttribute('aria-invalid', 'true'); alvo.setAttribute('aria-describedby', p.id); }
      if (!primeiro) primeiro = alvo;
    }
    if (primeiro && primeiro.focus) primeiro.focus();
    return !!primeiro;
  }

  // ---------- formulário ----------
  async function montarFormulario(el) {
    let cursos = [];
    try {
      const r = await window.DMC_Api.get(API.cursos, { silencioso404: true });
      cursos = (r && Array.isArray(r.itens) ? r.itens : []).map((i) => i.curso).filter((c) => c && c.id);
    } catch { cursos = []; }
    el.innerHTML = html`<form class="pf-at-form" data-ouv-registrar novalidate>
        <p class="pf-obrigatorios">Campos com * são obrigatórios.</p>
        <fieldset class="pf-grupo pf-at-tipos">
          <legend>Tipo <span aria-hidden="true">*</span></legend>
          ${TIPOS.map(([v, r, frase]) => html`<label class="pf-radio" data-alvo-excecao="rotulo-clicavel"><input type="radio" name="tipo" value="${v}" required><span><span class="pf-at-tipo__nome">${r}</span><span class="pf-at-tipo__frase">${frase}</span></span></label>`)}
        </fieldset>
        <div class="pf-campo">
          <label class="pf-rotulo" for="ouv-assunto">Assunto <span aria-hidden="true">*</span></label>
          <input class="pf-input" id="ouv-assunto" name="assunto" type="text" minlength="5" maxlength="140" required autocomplete="off">
        </div>
        <div class="pf-campo">
          <label class="pf-rotulo" for="ouv-texto">Mensagem <span aria-hidden="true">*</span></label>
          <textarea class="pf-input" id="ouv-texto" name="texto" rows="7" minlength="20" maxlength="6000" required aria-describedby="ouv-texto-ajuda ouv-texto-contador"></textarea>
          <p class="pf-ajuda" id="ouv-texto-ajuda">Para citar uma pessoa, escreva o nome no texto.</p>
          <p class="pf-at-contador" id="ouv-texto-contador" data-contador aria-live="off"></p>
        </div>
        <div class="pf-campo">
          <label class="pf-rotulo" for="ouv-curso">Curso relacionado</label>
          <select class="pf-input" id="ouv-curso" name="cursoId">
            <option value="">Nenhum</option>
            ${cursos.map((c) => html`<option value="${c.id}">${c.titulo}</option>`)}
          </select>
        </div>
        <div class="pf-alerta pf-alerta--info pf-alerta--compacto" role="note"><p>${AVISO_IDENTIDADE}</p></div>
        <div data-ouv-form-erro></div>
        <p><button type="submit" class="dmc-btn dmc-btn--primary">Registrar manifestação</button></p>
      </form>`;
    const form = el.querySelector('[data-ouv-registrar]');
    contador(form.elements.texto, 6000);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limparErros(form);
      const caixa = form.querySelector('[data-ouv-form-erro]');
      caixa.textContent = '';
      const tipo = (form.querySelector('input[name="tipo"]:checked') || {}).value || '';
      const assunto = form.elements.assunto.value.trim();
      const texto = form.elements.texto.value;
      const erros = {};
      if (!tipo) erros.tipo = 'Escolha o tipo da manifestação.';
      if (assunto.length < 5) erros.assunto = 'Use pelo menos 5 caracteres.';
      if (texto.trim().length < 20) erros.texto = 'Use pelo menos 20 caracteres.';
      if (Object.keys(erros).length) { marcarErros(form, erros); return; }
      const botao = form.querySelector('button[type="submit"]');
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      try {
        const r = await window.DMC_Api.post(API.lista, { tipo, assunto, texto, cursoId: form.elements.cursoId.value || null });
        form.reset();
        form.elements.texto.dispatchEvent(new Event('input'));
        avisar(`Manifestação ${r.protocolo} registrada. A coordenação responde por aqui.`, 'sucesso');
        await carregarLista();
      } catch (err) {
        if (!marcarErros(form, camposDoErro(err))) {
          caixa.innerHTML = html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>${mensagemDoErro(err)}</p></div>`;
        }
      } finally {
        botao.disabled = false;
        botao.removeAttribute('aria-busy');
      }
    });
  }

  // ---------- lista ----------
  async function carregarLista() {
    const alvo = document.querySelector('[data-ouv-tabela]');
    alvo.setAttribute('aria-busy', 'true');
    try {
      const r = await window.DMC_Api.get(`${API.lista}?porPagina=100`);
      const itens = r.itens || [];
      alvo.setAttribute('aria-busy', 'false');
      if (!itens.length) {
        alvo.innerHTML = html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhuma manifestação registrada.</p></div>`;
        return;
      }
      alvo.innerHTML = html`<table class="pf-tabela">
          <caption>Manifestações (${r.total})</caption>
          <thead><tr><th scope="col">Protocolo</th><th scope="col">Tipo</th><th scope="col">Assunto</th><th scope="col" class="pf-tabela__secundaria">Data</th><th scope="col">Situação</th></tr></thead>
          <tbody>${itens.map((i) => html`<tr>
            <td data-rotulo="Protocolo"><a class="pf-at-codigo" href="ouvidoria.html?protocolo=${i.protocolo}" data-ouv-abrir="${i.protocolo}">${i.protocolo}</a></td>
            <td data-rotulo="Tipo">${ROTULO_TIPO[i.tipo] || i.tipo}</td>
            <td data-rotulo="Assunto">${i.assunto}</td>
            <td data-rotulo="Data" class="pf-tabela__secundaria">${fmtData(i.criadoEm)}</td>
            <td data-rotulo="Situação">${situacao(i.status)}</td>
          </tr>`)}</tbody>
        </table>`;
      alvo.querySelectorAll('[data-ouv-abrir]').forEach((a) => a.addEventListener('click', (ev) => {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
        ev.preventDefault();
        abrirDetalhe(a.dataset.ouvAbrir, { empurrar: true });
      }));
      anunciar(`${r.total} ${r.total === 1 ? 'manifestação' : 'manifestações'}.`);
    } catch (err) {
      UI.erroCarga(alvo, err, { tentarDeNovo: carregarLista });
    }
  }

  // ---------- detalhe ----------
  function mostrarPrincipal() {
    document.getElementById('ouv-registrar').hidden = false;
    document.getElementById('ouv-lista').hidden = false;
    const d = document.getElementById('ouv-detalhe');
    d.hidden = true;
    d.textContent = '';
  }

  async function abrirDetalhe(protocolo, { empurrar = false } = {}) {
    const sec = document.getElementById('ouv-detalhe');
    if (!OUV_RE.test(protocolo)) { mostrarPrincipal(); avisar('Protocolo inválido.', 'aviso'); return; }
    if (empurrar) window.history.pushState({ protocolo }, '', `ouvidoria.html?protocolo=${encodeURIComponent(protocolo)}`);
    document.getElementById('ouv-registrar').hidden = true;
    document.getElementById('ouv-lista').hidden = true;
    sec.hidden = false;
    sec.setAttribute('aria-busy', 'true');
    sec.innerHTML = html`<p class="pf-at-status">Carregando a manifestação ${protocolo}…</p>`;
    let m;
    try {
      m = await window.DMC_Api.get(API.uma(protocolo));
    } catch (err) {
      sec.setAttribute('aria-busy', 'false');
      if ((err && err.status === 404) || /não encontramos/i.test(mensagemDoErro(err))) {
        sec.innerHTML = html`<a class="pf-cabecalho__voltar" href="ouvidoria.html" data-ouv-voltar>← Ouvidoria</a>
          <div class="pf-vazio"><p class="pf-vazio__titulo">Não encontramos esta manifestação.</p></div>`;
        ligarVoltar(sec);
        return;
      }
      UI.erroCarga(sec, err, { tentarDeNovo: () => abrirDetalhe(protocolo) });
      return;
    }
    desenharDetalhe(sec, m);
  }

  function ligarVoltar(sec) {
    sec.querySelectorAll('[data-ouv-voltar]').forEach((a) => a.addEventListener('click', (ev) => {
      ev.preventDefault();
      window.history.pushState({}, '', 'ouvidoria.html');
      mostrarPrincipal();
      carregarLista();
      const t = document.querySelector('[data-ouv-titulo]');
      if (t) t.focus();
    }));
  }

  function desenharDetalhe(sec, m) {
    sec.setAttribute('aria-busy', 'false');
    const encerrado = m.status === 'encerrado';
    sec.innerHTML = html`
      <a class="pf-cabecalho__voltar" href="ouvidoria.html" data-ouv-voltar>← Ouvidoria</a>
      <h2 class="pf-at-reg__titulo" tabindex="-1" data-ouv-detalhe-titulo>${m.assunto}</h2>
      <dl class="pf-at-meta">
        <div><dt>Protocolo</dt><dd><span class="pf-at-codigo">${m.protocolo}</span></dd></div>
        <div><dt>Tipo</dt><dd>${ROTULO_TIPO[m.tipo] || m.tipo}</dd></div>
        <div><dt>Situação</dt><dd>${situacao(m.status)}</dd></div>
        <div><dt>Registrada em</dt><dd>${fmtDataHora(m.criadoEm)}</dd></div>
        ${m.curso ? html`<div><dt>Curso</dt><dd>${m.curso.titulo}</dd></div>` : ''}
      </dl>
      <div class="pf-leitura"><p class="pf-at-msg__texto">${m.texto}</p></div>
      <ol class="pf-linha-tempo pf-at-conversa" aria-label="Mensagens">
        ${(m.mensagens || []).map((x) => html`<li class="pf-linha-tempo__item"><div class="pf-at-msg ${x.autor === 'ouvidoria' ? 'pf-at-msg--equipe' : ''}">
          <p class="pf-at-msg__autor">${x.autorNome} · <time datetime="${x.em}">${fmtDataHora(x.em)}</time></p>
          <p class="pf-at-msg__texto">${x.texto}</p></div></li>`)}
        ${!(m.mensagens || []).length ? html`<li class="pf-linha-tempo__item pf-linha-tempo__item--sistema">A coordenação ainda não respondeu.</li>` : ''}
        ${encerrado ? html`<li class="pf-linha-tempo__item pf-linha-tempo__item--sistema">Manifestação encerrada em ${fmtDataHora(m.encerradoEm)}.</li>` : ''}
      </ol>
      ${encerrado ? '' : html`<form class="pf-at-compositor" data-ouv-responder novalidate>
          <div class="pf-campo">
            <label class="pf-rotulo" for="ouv-resposta">Complementar</label>
            <textarea class="pf-input" id="ouv-resposta" name="texto" rows="4" maxlength="4000" aria-describedby="ouv-resposta-contador"></textarea>
            <p class="pf-at-contador" id="ouv-resposta-contador" data-contador aria-live="off"></p>
          </div>
          <div data-ouv-resposta-erro></div>
          <div class="pf-at-compositor__acoes">
            <button type="submit" class="dmc-btn dmc-btn--primary">Enviar mensagem</button>
            <button type="button" class="dmc-btn dmc-btn--secondary" data-ouv-encerrar>Encerrar manifestação</button>
          </div>
        </form>`}`;
    ligarVoltar(sec);
    sec.querySelector('[data-ouv-detalhe-titulo]').focus();
    const form = sec.querySelector('[data-ouv-responder]');
    if (!form) return;
    contador(form.elements.texto, 4000);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const caixa = form.querySelector('[data-ouv-resposta-erro]');
      caixa.textContent = '';
      if (!form.elements.texto.value.trim()) {
        caixa.innerHTML = html`<p class="pf-erro-campo">Escreva a mensagem antes de enviar.</p>`;
        form.elements.texto.focus();
        return;
      }
      try {
        await window.DMC_Api.post(API.mensagens(m.protocolo), { texto: form.elements.texto.value });
        await abrirDetalhe(m.protocolo);
        avisar('Mensagem enviada.', 'sucesso');
      } catch (err) {
        caixa.innerHTML = html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>${mensagemDoErro(err)}</p></div>`;
      }
    });
    sec.querySelector('[data-ouv-encerrar]').addEventListener('click', async () => {
      const ok = await confirmar({ titulo: 'Encerrar esta manifestação?', texto: 'Depois de encerrada, ela não recebe novas mensagens.', rotuloConfirmar: 'Encerrar manifestação' });
      if (!ok) return;
      try {
        await window.DMC_Api.post(API.encerrar(m.protocolo), {});
        await abrirDetalhe(m.protocolo);
        avisar('Manifestação encerrada.', 'sucesso');
      } catch (err) {
        avisar(mensagemDoErro(err), 'erro');
      }
    });
  }

  async function boot(ctx) {
    window.addEventListener('popstate', () => {
      const p = new URLSearchParams(window.location.search).get('protocolo');
      if (p) abrirDetalhe(p.toUpperCase());
      else { mostrarPrincipal(); carregarLista(); }
    });
    await montarFormulario(document.querySelector('[data-ouv-form]'));
    const protocolo = (ctx.params.get('protocolo') || '').toUpperCase();
    if (protocolo) {
      document.querySelector('[data-ouv-tabela]').setAttribute('aria-busy', 'false'); // a lista só carrega ao voltar
      await abrirDetalhe(protocolo);
    } else await carregarLista();
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'atendimento' });
})();
