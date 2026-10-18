/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-duvidas.js (F8)
   Dúvidas dos alunos — rota #/duvidas.
   Spec: PORTAL-UX.md §7.8; PORTAL-API.md §6.12 (dúvidas do docente).
   Filtros no hash: #/duvidas?status=pendentes|respondidas|todas&curso=<id>
   ============================================================= */
(function () {
  'use strict';
  const P = window.DMC_Professor;
  if (!P) return;

  const API = {
    lista: '/portal/professor/duvidas',
    responder: (id) => `/portal/professor/duvidas/${encodeURIComponent(id)}/respostas`,
    resolvida: (id) => `/portal/professor/duvidas/${encodeURIComponent(id)}/resolvida`,
    apagarResposta: (id, r) => `/portal/professor/duvidas/${encodeURIComponent(id)}/respostas/${encodeURIComponent(r)}`
  };
  const STATUS = [
    { valor: 'pendentes', rotulo: 'Sem resposta' },
    { valor: 'respondidas', rotulo: 'Respondidas' },
    { valor: 'todas', rotulo: 'Todas' }
  ];
  const ROTULO_PAPEL = { professor: 'Professor', admin: 'Coordenação' };

  function montar(el, ctx) {
    const ui = ctx.ui;
    const status = STATUS.some((s) => s.valor === ctx.filtros.get('status')) ? ctx.filtros.get('status') : 'pendentes';
    const curso = ctx.filtros.get('curso') || '';
    let pagina = 1;
    let itens = [];
    let total = 0;
    let pendentes = null;

    function filtros(mudar) {
      const f = new URLSearchParams();
      const s = mudar.status !== undefined ? mudar.status : status;
      const c = mudar.curso !== undefined ? mudar.curso : curso;
      if (s && s !== 'pendentes') f.set('status', s);
      if (c) f.set('curso', c);
      return f;
    }

    function htmlFiltros() {
      return ui.html`<div class="pf-prof-filtros">
        <div class="pf-segmento pf-prof-segmento" role="group" aria-label="Situação das dúvidas">
          ${STATUS.map((s) => ui.html`<button type="button" class="pf-segmento__opcao pf-prof-segmento__opcao" aria-pressed="${s.valor === status ? 'true' : 'false'}" data-pf-prof-status="${s.valor}">${s.rotulo}${s.valor === 'pendentes' && Number.isFinite(pendentes) ? ui.html` <span class="pf-prof-tnum">(${String(pendentes)})</span>` : ''}</button>`)}
        </div>
        ${ctx.cursos.length > 1 ? ui.html`<label class="pf-campo pf-prof-campo pf-prof-campo--linha"><span class="pf-campo__rotulo">Curso</span>
          <select class="pf-input" data-pf-prof-curso>
            <option value="">Todos os seus cursos</option>
            ${ctx.cursos.map((c) => ui.html`<option value="${c.id}"${c.id === curso ? ' selected' : ''}>${c.titulo}</option>`)}
          </select></label>` : ''}
      </div>
      <p class="pf-prof-nota pf-prof-ajuda">A resposta aparece na aula para todos os alunos com acesso ao curso e marca a dúvida como resolvida.</p>`;
    }

    function htmlResposta(d, r) {
      const papel = ROTULO_PAPEL[r.autorPapel] || '';
      return ui.html`<li class="pf-prof-resposta">
        <p class="pf-prof-resposta__autor"><strong>${r.autorNome}</strong>${papel ? ui.html` · ${papel}` : ''} · <span class="pf-prof-lista__meta">${ui.fmt.relativo(r.createdAt)}</span></p>
        <p class="pf-prof-texto">${r.texto}</p>
        ${r.minha || ctx.papel === 'admin' ? ui.html`<button type="button" class="pf-prof-link-botao" data-pf-prof-apagar="${r.id}" data-pf-prof-duvida="${d.id}">Apagar ${r.minha ? 'minha resposta' : 'resposta'}</button>` : ''}
      </li>`;
    }

    function htmlDuvida(d) {
      const contexto = [d.cursoTitulo, d.aulaCodigo, d.aulaTitulo].filter(Boolean).join(' · ');
      const idCampo = `pf-prof-resp-${d.id}`;
      return ui.html`<li class="pf-prof-duvida" data-pf-prof-item="${d.id}">
        <div class="pf-prof-duvida__cabeca">
          <span class="pf-prof-avatar" aria-hidden="true">${d.autorIniciais || '?'}</span>
          <div>
            <p class="pf-prof-duvida__autor"><strong>${d.autorNome}</strong></p>
            <p class="pf-prof-lista__meta">${contexto} · ${ui.fmt.relativo(d.createdAt)}</p>
          </div>
          ${d.resolvida ? ui.html`<span class="pf-prof-estado pf-prof-estado--sucesso">Resolvida</span>` : (d.respondida ? '' : ui.html`<span class="pf-prof-estado pf-prof-estado--aviso">Sem resposta</span>`)}
        </div>
        <p class="pf-prof-texto">${d.texto}</p>
        ${Array.isArray(d.respostas) && d.respostas.length ? ui.html`<ul class="pf-prof-respostas" aria-label="Respostas">${d.respostas.map((r) => htmlResposta(d, r))}</ul>` : ''}
        <form class="pf-prof-responder" data-pf-prof-form="${d.id}" novalidate>
          <label class="pf-campo pf-prof-campo" for="${idCampo}"><span class="pf-campo__rotulo">Responder</span>
            <textarea class="pf-input pf-prof-textarea" id="${idCampo}" name="texto" rows="3" maxlength="8000" required></textarea>
          </label>
          <p class="pf-prof-campo__erro" data-pf-prof-erro hidden></p>
          <div class="pf-prof-responder__acoes">
            <button type="submit" class="dmc-btn dmc-btn--primary pf-prof-btn--p">Publicar resposta</button>
            ${!d.resolvida ? ui.html`<button type="button" class="pf-prof-link-botao" data-pf-prof-resolver="${d.id}">Marcar como resolvida sem responder</button>` : ui.html`<button type="button" class="pf-prof-link-botao" data-pf-prof-reabrir="${d.id}">Reabrir</button>`}
            <a class="pf-prof-link" href="${`aula.html?id=${encodeURIComponent(d.aulaId)}#duvidas`}" target="_blank" rel="noopener">Abrir aula ↗</a>
          </div>
        </form>
      </li>`;
    }

    function desenhar() {
      el.removeAttribute('aria-busy');
      const corpo = itens.length
        ? ui.html`<ul class="pf-prof-duvidas" aria-label="Dúvidas">${itens.map(htmlDuvida)}</ul>
          ${itens.length < total ? ui.html`<p class="pf-prof-mais"><button type="button" class="dmc-btn dmc-btn--secondary" data-pf-prof-mais>Carregar mais (${String(itens.length)} de ${String(total)})</button></p>` : ''}`
        : ui.html`<div class="pf-vazio pf-prof-vazio"><p class="pf-prof-vazio__titulo">${status === 'pendentes' ? 'Nenhuma dúvida em aberto nos seus cursos.' : 'Nenhuma dúvida encontrada.'}</p></div>`;
      el.replaceChildren(ui.nos(ui.html`${htmlFiltros()}${corpo}`));
    }

    async function carregar(mais) {
      const q = new URLSearchParams({ status, pagina: String(pagina), porPagina: '20' });
      if (curso) q.set('cursoId', curso);
      const r = await ctx.api.get(`${API.lista}?${q}`, { sinal: ctx.sinal });
      itens = mais ? itens.concat(r.itens || []) : (r.itens || []);
      total = Number(r.total) || 0;
      pendentes = Number.isFinite(r.pendentes) ? r.pendentes : null;
      if (window.DMC_Shell && typeof window.DMC_Shell.definirContador === 'function' && !curso) window.DMC_Shell.definirContador('duvidas', pendentes);
      desenhar();
    }

    async function aoClicar(e) {
      const t = e.target.closest('button');
      if (!t || !el.contains(t)) return;
      if (t.hasAttribute('data-pf-prof-status')) { ctx.navegar('duvidas', filtros({ status: t.getAttribute('data-pf-prof-status') })); return; }
      if (t.hasAttribute('data-pf-prof-mais')) {
        ui.ocupado(t, true, 'Carregando…');
        pagina += 1;
        try { await carregar(true); } catch (err) { pagina -= 1; ui.ocupado(t, false); ui.toast(err.message, { tipo: 'erro' }); }
        return;
      }
      const resolver = t.getAttribute('data-pf-prof-resolver');
      const reabrir = t.getAttribute('data-pf-prof-reabrir');
      if (resolver || reabrir) {
        ui.ocupado(t, true);
        try {
          await ctx.api.put(API.resolvida(resolver || reabrir), { resolvida: !!resolver });
          ui.toast(resolver ? 'Dúvida marcada como resolvida.' : 'Dúvida reaberta.', { tipo: 'sucesso' });
          await carregar(false);
        } catch (err) { ui.ocupado(t, false); ui.toast(err.message, { tipo: 'erro' }); }
        return;
      }
      const apagar = t.getAttribute('data-pf-prof-apagar');
      if (apagar) {
        const ok = await ui.confirmar({ titulo: 'Apagar resposta?', texto: 'A resposta deixa de aparecer na aula. Se for a única, a dúvida volta para a fila.', rotuloConfirmar: 'Apagar', perigo: true });
        if (!ok) return;
        try {
          await ctx.api.del(API.apagarResposta(t.getAttribute('data-pf-prof-duvida'), apagar));
          ui.toast('Resposta apagada.', { tipo: 'sucesso' });
          await carregar(false);
        } catch (err) { ui.toast(err.message, { tipo: 'erro' }); }
      }
    }

    async function aoEnviar(e) {
      const form = e.target.closest('form[data-pf-prof-form]');
      if (!form) return;
      e.preventDefault();
      const id = form.getAttribute('data-pf-prof-form');
      const campo = form.querySelector('textarea[name="texto"]');
      const erro = form.querySelector('[data-pf-prof-erro]');
      const texto = (campo.value || '').trim();
      if (texto.length < 2) {
        erro.textContent = 'Escreva a resposta antes de publicar.';
        erro.hidden = false;
        campo.setAttribute('aria-invalid', 'true');
        campo.focus();
        return;
      }
      erro.hidden = true;
      campo.removeAttribute('aria-invalid');
      const botao = form.querySelector('button[type="submit"]');
      ui.ocupado(botao, true, 'Publicando…');
      try {
        await ctx.api.post(API.responder(id), { texto });
        ui.toast('Resposta publicada.', { tipo: 'sucesso' });
        ui.anunciar('Resposta publicada.');
        await carregar(false);
      } catch (err) {
        ui.ocupado(botao, false);
        erro.textContent = (err.campos && err.campos.texto) || err.message;
        erro.hidden = false;
      }
    }

    function aoMudar(e) {
      const s = e.target.closest('[data-pf-prof-curso]');
      if (s) ctx.navegar('duvidas', filtros({ curso: s.value }));
    }

    el.addEventListener('click', aoClicar);
    el.addEventListener('submit', aoEnviar);
    el.addEventListener('change', aoMudar);
    ui.esqueleto(el, { tipo: 'lista', linhas: 4 });
    return carregar(false).then(() => ({
      destruir() {
        el.removeEventListener('click', aoClicar);
        el.removeEventListener('submit', aoEnviar);
        el.removeEventListener('change', aoMudar);
      }
    }));
  }

  P.registrar({ rota: 'duvidas', titulo: 'Dúvidas', papeis: ['professor', 'admin'], montar });
})();
