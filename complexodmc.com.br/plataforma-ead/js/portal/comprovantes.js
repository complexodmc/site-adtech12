/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/comprovantes.js (F3a)
   Comprovantes — PORTAL-UX.md §6.11; PORTAL-API §6.7.4.
   Trilha imprimível: cada registro de frequência (ao vivo ou
   gravada) e cada avaliação, com data e hora, resultado, código
   FRQ/AVL e hash abreviado. Filtros na URL (?curso=&tipo=&de=&ate=).
   Sem QR (D-16, D-72): a conferência é digitar o código de uma linha
   em validar.html. HTML só por DMC_UI.html.
   ============================================================= */
(function () {
  'use strict';

  const API = Object.freeze({ comprovantes: '/portal/me/comprovantes', academico: '/portal/me/academico' });
  const TZ = 'America/Sao_Paulo';
  const TIPOS = Object.freeze({ todos: 'todos', avaliacoes: 'avaliacao', frequencia: 'frequencia' });
  const UI = window.DMC_UI;
  if (!UI || !window.DMC_Portal) return;
  const html = UI.html;

  const fDataHora = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fData = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
  const dataHora = iso => (iso ? fDataHora.format(new Date(iso)) : '—');
  const dataBr = s => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : null);
  const pct = n => (typeof n === 'number' ? `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : null);
  const nota = n => (typeof n === 'number' ? n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null);
  const hashCurto = h => (typeof h === 'string' && h.length >= 8 ? `${h.slice(0, 4)}…${h.slice(-4)}` : null);
  const GLIFO = Object.freeze({ sucesso: 'estadoSucesso', aviso: 'estadoAviso', info: 'estadoInfo', neutro: 'estadoNeutro' });
  const estado = (rotulo, tom) => html`<span class="pf-estado pf-estado--${tom}">${UI.icone(GLIFO[tom])}${rotulo}</span>`;

  function anunciar(texto) {
    if (typeof UI.anunciar === 'function') { UI.anunciar(texto); return; }
    const el = document.getElementById('ac-anuncio');
    if (el) el.textContent = texto;
  }

  function tipoRotulo(i) {
    if (i.tipo === 'avaliacao') return 'Avaliação';
    return i.origem === 'ao_vivo' ? 'Frequência ao vivo' : 'Frequência gravada';
  }

  function descricao(i) {
    if (i.tipo === 'avaliacao') {
      const tipo = i.avaliacaoTipo === 'previa' ? 'Atividade prévia' : (i.avaliacaoTipo === 'modular' ? 'Atividade modular' : null);
      return [i.modulo, tipo || i.avaliacao, i.numero ? `Tentativa ${i.numero}` : null].filter(Boolean).join(' · ');
    }
    if (i.origem === 'ao_vivo') {
      return [i.encontro && i.encontro.titulo ? `Encontro ${i.encontro.titulo}` : 'Encontro ao vivo', i.modulo, i.turmaCodigo ? `Turma ${i.turmaCodigo}` : null].filter(Boolean).join(' · ');
    }
    const aula = i.aula || {};
    return [aula.codigo, aula.titulo, 'concluída'].filter(Boolean).join(' ');
  }

  function resultado(i) {
    if (i.tipo === 'avaliacao') {
      if (i.status === 'aguardando_correcao') return estado('Aguardando correção', 'info');
      if (i.status === 'corrigida') return html`${pct(i.pctAcerto) ? `${pct(i.pctAcerto)} de acerto` : 'Corrigida'}${nota(i.nota) ? ` · nota ${nota(i.nota)}` : ''}`;
      return estado('Em andamento', 'neutro');
    }
    if (i.anulada) return html`<span class="pf-ac-anulada">Registro anulado${i.anuladaEm ? ` em ${fData.format(new Date(i.anuladaEm))}` : ''}</span>`;
    return estado(i.origem === 'ao_vivo' ? 'Presente' : 'Concluída', 'sucesso');
  }

  function codigoHtml(i) {
    if (!i.codigo) return html`<span class="pf-ac-meta">Sem código até a correção</span>`;
    return html`<span class="pf-ac-codigo">
      <span class="pf-ac-codigo__valor">${i.codigo}</span>
      ${hashCurto(i.hash) ? html`<span class="pf-ac-codigo__hash" title="Hash do registro">${hashCurto(i.hash)}</span>` : ''}
      <span class="pf-ac-codigo__acoes">
        <button type="button" data-ac-copiar="${i.codigo}">Copiar</button>
        <a href="validar.html?codigo=${encodeURIComponent(i.codigo)}" target="_blank" rel="noopener">Verificar</a>
      </span>
    </span>`;
  }

  function linhasHtml(itens) {
    return html`${itens.map(i => html`<tr>
      <td data-rotulo="Data e hora" class="pf-ac-num">${dataHora(i.tipo === 'avaliacao' ? (i.enviadaEm || i.iniciadaEm) : i.registradaEm)}</td>
      <td data-rotulo="Tipo">${tipoRotulo(i)}</td>
      <td data-rotulo="Descrição">${descricao(i)}${i.curso ? html`<br><span class="pf-ac-meta">${i.curso}</span>` : ''}</td>
      <td data-rotulo="Resultado">${resultado(i)}</td>
      <td data-rotulo="Código · hash">${codigoHtml(i)}</td>
    </tr>`)}`;
  }

  async function boot(ctx) {
    const alvo = document.getElementById('ac-comprovantes');
    const form = document.getElementById('ac-filtros');
    const selCurso = document.getElementById('ac-f-curso');
    const inDe = document.getElementById('ac-f-de');
    const inAte = document.getElementById('ac-f-ate');
    const btnImprimir = document.getElementById('ac-imprimir');
    const cab = document.getElementById('ac-impressao-cabecalho');
    const rod = document.getElementById('ac-impressao-rodape');

    const st = {
      curso: ctx.params.get('curso') || '',
      tipo: TIPOS[ctx.params.get('tipo')] ? ctx.params.get('tipo') : 'todos',
      de: ctx.params.get('de') || '',
      ate: ctx.params.get('ate') || '',
      pagina: 1, dados: null, itens: []
    };
    inDe.value = st.de;
    inAte.value = st.ate;

    // Cursos do filtro: os das matrículas (atuais e histórico).
    try {
      const acad = await window.DMC_Api.get(API.academico);
      const vistos = new Set();
      for (const c of [...((acad && acad.atuais) || []), ...((acad && acad.historico) || [])]) {
        if (!c.curso || vistos.has(c.curso.id)) continue;
        vistos.add(c.curso.id);
        const o = document.createElement('option');
        o.value = c.curso.id;
        o.textContent = c.curso.titulo;
        selCurso.appendChild(o);
      }
    } catch { /* o filtro fica com "Todos os cursos" */ }
    selCurso.value = st.curso;
    if (selCurso.value !== st.curso) st.curso = '';

    function marcarTipo() {
      for (const b of form.querySelectorAll('[data-ac-tipo]')) b.setAttribute('aria-pressed', String(b.getAttribute('data-ac-tipo') === st.tipo));
    }

    function sincronizarUrl() {
      const q = new URLSearchParams();
      if (st.curso) q.set('curso', st.curso);
      if (st.tipo !== 'todos') q.set('tipo', st.tipo);
      if (st.de) q.set('de', st.de);
      if (st.ate) q.set('ate', st.ate);
      try { history.replaceState(null, '', `${window.location.pathname}${q.toString() ? `?${q}` : ''}`); } catch { /* sem history */ }
    }

    function desenharImpressao(d) {
      const cursoNome = st.curso ? (selCurso.selectedOptions[0] && selCurso.selectedOptions[0].textContent) : 'Todos os cursos';
      const periodo = st.de || st.ate ? `${dataBr(st.de) || 'início'} a ${dataBr(st.ate) || 'hoje'}` : 'Todo o período';
      const titular = d.titular || {};
      cab.innerHTML = html`<h2 class="pf-secao-titulo">Comprovantes acadêmicos · Complexo DMC</h2>
        <dl>
          <dt>Titular</dt><dd>${titular.nome || '—'}</dd>
          <dt>Matrícula</dt><dd>${(titular.matriculas || []).join(', ') || '—'}</dd>
          <dt>Curso</dt><dd>${cursoNome}</dd>
          <dt>Período</dt><dd>${periodo}</dd>
          <dt>Emitido em</dt><dd>${dataHora(d.emitidoEm)} (horário de Brasília)</dd>
        </dl>`;
      const urlValidacao = `${window.location.origin}/plataforma-ead/validar.html`;
      rod.innerHTML = html`<p>Cada linha traz o próprio código (FRQ ou AVL) e o início e o fim do hash do registro. Para conferir, acesse ${urlValidacao} e digite o código da linha.</p>`;
    }

    function desenhar() {
      const d = st.dados;
      if (!st.itens.length) {
        alvo.innerHTML = html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhum registro no período.</p><p class="pf-vazio__texto">A frequência entra quando você participa de um encontro ao vivo ou conclui uma aula gravada; a avaliação, quando é enviada.</p></div>`;
        btnImprimir.disabled = true;
        return;
      }
      alvo.innerHTML = html`<table class="pf-tabela">
          <caption>Registros${d.total ? ` (${d.total})` : ''}</caption>
          <thead><tr>
            <th scope="col">Data e hora</th><th scope="col">Tipo</th><th scope="col">Descrição</th><th scope="col">Resultado</th><th scope="col">Código · hash</th>
          </tr></thead>
          <tbody>${linhasHtml(st.itens)}</tbody>
        </table>
        ${d.avaliacoesDisponiveis === false && st.tipo !== 'frequencia' ? html`<p class="pf-ajuda">As avaliações aparecem aqui assim que o módulo de avaliações estiver disponível.</p>` : ''}
        ${d.pagina < d.totalPaginas ? html`<p class="pf-ac-mais"><button type="button" class="dmc-btn dmc-btn--secondary" data-ac-mais="1">Carregar mais (${String(d.total - st.itens.length)} restantes)</button></p>` : ''}`;
      btnImprimir.disabled = false;
      desenharImpressao(d);
    }

    async function carregar({ mais = false } = {}) {
      st.pagina = mais ? st.pagina + 1 : 1;
      const q = new URLSearchParams({ tipo: TIPOS[st.tipo], pagina: String(st.pagina) });
      if (st.curso) q.set('cursoId', st.curso);
      if (st.de) q.set('de', st.de);
      if (st.ate) q.set('ate', st.ate);
      alvo.setAttribute('aria-busy', 'true');
      try {
        const d = await window.DMC_Api.get(`${API.comprovantes}?${q.toString()}`);
        if (ctx.sinal && ctx.sinal.aborted) return;
        st.dados = d;
        st.itens = mais ? st.itens.concat(d.itens || []) : (d.itens || []);
        desenhar();
        anunciar(`${st.itens.length} ${st.itens.length === 1 ? 'registro' : 'registros'}.`);
      } catch (err) {
        UI.erroCarga(alvo, err, { tentarDeNovo: () => carregar() });
      } finally {
        alvo.setAttribute('aria-busy', 'false');
      }
    }

    form.addEventListener('submit', ev => ev.preventDefault());
    form.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-ac-tipo]');
      if (!b) return;
      st.tipo = b.getAttribute('data-ac-tipo');
      marcarTipo();
      sincronizarUrl();
      carregar();
    });
    selCurso.addEventListener('change', () => { st.curso = selCurso.value; sincronizarUrl(); carregar(); });
    for (const [el, chave] of [[inDe, 'de'], [inAte, 'ate']]) {
      el.addEventListener('change', () => { st[chave] = el.value; sincronizarUrl(); carregar(); });
    }
    alvo.addEventListener('click', async (ev) => {
      const mais = ev.target.closest('[data-ac-mais]');
      if (mais) { carregar({ mais: true }); return; }
      const copiar = ev.target.closest('[data-ac-copiar]');
      if (copiar) {
        try {
          await navigator.clipboard.writeText(copiar.getAttribute('data-ac-copiar'));
          anunciar('Código copiado.');
          if (typeof UI.toast === 'function') UI.toast('Código copiado.', { tipo: 'sucesso' });
        } catch {
          anunciar('Não foi possível copiar. Selecione o código e copie manualmente.');
        }
      }
    });
    btnImprimir.addEventListener('click', () => window.print());

    marcarTipo();
    await carregar();
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'comprovantes' });
})();
