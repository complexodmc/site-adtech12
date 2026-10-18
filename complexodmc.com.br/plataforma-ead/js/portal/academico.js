/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/academico.js (F3a)
   Acadêmico do aluno — PORTAL-UX.md §6.5; PORTAL-API §6.7.3.
   Abas Enturmação atual | Histórico; cartão da matrícula; KPIs;
   tabela por módulo (CH · média · frequência ao vivo/gravado ·
   faltas · situação). A frequência vem da fonte única do servidor
   (o mesmo número de Comprovantes). Nenhum número é calculado aqui.
   Aceita ?m=<matriculaId>, ?curso=<cursoId>, #historico e
   #modulo-<id>. HTML só por DMC_UI.html.
   ============================================================= */
(function () {
  'use strict';

  const API = Object.freeze({
    academico: '/portal/me/academico',
    resumo: id => `/portal/me/academico/${encodeURIComponent(id)}`
  });
  const TZ = 'America/Sao_Paulo';
  const UI = window.DMC_UI;
  if (!UI || !window.DMC_Portal) return;
  const html = UI.html;

  // ---------------------------------------------------------------
  // Formatação (pt-BR, fuso de SP)
  // ---------------------------------------------------------------
  const fData = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
  const num = (n, casas) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const fmt = {
    data: iso => (iso ? fData.format(new Date(iso)) : '—'),
    nota: n => (typeof n === 'number' && isFinite(n) ? num(n, 1) : null),
    pct: n => (typeof n === 'number' && isFinite(n) ? `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : null),
    horas: n => (typeof n === 'number' && isFinite(n) ? `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h` : null)
  };

  const TOM_SITUACAO = Object.freeze({
    aprovado: 'sucesso', concluido: 'sucesso', em_recuperacao: 'aviso', reprovado: 'erro', cursando: 'info'
  });
  const TOM_STATUS = Object.freeze({ ativa: 'info', trancada: 'aviso', concluida: 'sucesso', cancelada: 'neutro' });
  const GLIFO = Object.freeze({ sucesso: 'estadoSucesso', aviso: 'estadoAviso', erro: 'estadoErro', info: 'estadoInfo', neutro: 'estadoNeutro' });
  const CHEVRON = UI.cru('<svg class="pf-ac-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>');

  function estado(rotulo, tom) {
    const t = GLIFO[tom] ? tom : 'neutro';
    return html`<span class="pf-estado pf-estado--${t}">${UI.icone(GLIFO[t])}${rotulo}</span>`;
  }

  function anunciar(texto) {
    if (typeof UI.anunciar === 'function') { UI.anunciar(texto); return; }
    const el = document.getElementById('ac-anuncio');
    if (el) el.textContent = texto;
  }

  function vazio(titulo, texto, acao) {
    return html`<div class="pf-vazio">
      <p class="pf-vazio__titulo">${titulo}</p>
      ${texto ? html`<p class="pf-vazio__texto">${texto}</p>` : ''}
      ${acao ? html`<div class="pf-vazio__acoes"><a class="dmc-btn dmc-btn--secondary" href="${acao.href}">${acao.rotulo}</a></div>` : ''}
    </div>`;
  }

  // ---------------------------------------------------------------
  // Abas (role=tablist; setas; #historico)
  // ---------------------------------------------------------------
  function configurarAbas() {
    const abas = Array.from(document.querySelectorAll('.pf-abas [role="tab"]'));
    const ativar = (aba, foco) => {
      for (const a of abas) {
        const sel = a === aba;
        a.setAttribute('aria-selected', String(sel));
        a.tabIndex = sel ? 0 : -1;
        const painel = document.getElementById(a.getAttribute('aria-controls'));
        if (painel) painel.hidden = !sel;
      }
      if (foco) aba.focus();
      const id = aba.getAttribute('aria-controls');
      try { history.replaceState(null, '', id === 'historico' ? '#historico' : window.location.pathname + window.location.search); } catch { /* sem history */ }
    };
    abas.forEach((a, i) => {
      a.addEventListener('click', () => ativar(a, false));
      a.addEventListener('keydown', (ev) => {
        let alvo = null;
        if (ev.key === 'ArrowRight') alvo = abas[(i + 1) % abas.length];
        else if (ev.key === 'ArrowLeft') alvo = abas[(i - 1 + abas.length) % abas.length];
        else if (ev.key === 'Home') alvo = abas[0];
        else if (ev.key === 'End') alvo = abas[abas.length - 1];
        if (alvo) { ev.preventDefault(); ativar(alvo, true); }
      });
    });
    if (window.location.hash === '#historico') ativar(abas[1], false);
    return { definirContador(idPainel, n) {
      const aba = abas.find(a => a.getAttribute('aria-controls') === idPainel);
      if (!aba) return;
      let c = aba.querySelector('.pf-abas__contador');
      if (!c) { c = document.createElement('span'); c.className = 'pf-abas__contador'; aba.appendChild(c); }
      c.textContent = ` (${n})`;
    } };
  }

  // ---------------------------------------------------------------
  // Cartão da matrícula
  // ---------------------------------------------------------------
  function cardHtml(c) {
    const idDes = `desempenho-${c.id}`;
    const statusRotulo = c.statusRotulo || c.status;
    return html`<article class="pf-ac-matricula" id="mat-${c.id}" data-matricula="${c.id}" data-curso="${c.curso.id}" aria-labelledby="mat-${c.id}-titulo">
      <div class="pf-ac-matricula__topo">
        <h2 class="pf-ac-matricula__titulo" id="mat-${c.id}-titulo">${c.curso.titulo}</h2>
        ${c.situacaoCurso ? estado(c.situacaoRotulo || 'Cursando', TOM_SITUACAO[c.situacaoCurso]) : ''}
      </div>
      <dl class="pf-ac-matricula__dados">
        <div><dt>Nº da matrícula</dt><dd class="pf-ac-num">${c.numero || '—'}</dd></div>
        <div><dt>Turma</dt><dd>${c.turma && c.turma.codigo ? c.turma.codigo : 'Sem turma: curso gravado'}</dd></div>
        <div><dt>Nível</dt><dd>${c.nivelRotulo || '—'}</dd></div>
        <div><dt>Carga total</dt><dd>${fmt.horas(c.cargaTotalHoras) || '—'}</dd></div>
        <div><dt>Início</dt><dd>${fmt.data(c.inicioEm)}</dd></div>
        <div><dt>Status</dt><dd>${estado(statusRotulo, TOM_STATUS[c.status])}</dd></div>
      </dl>
      ${c.semAcesso ? html`<div class="pf-alerta pf-alerta--aviso pf-alerta--compacto" role="note">${UI.icone('estadoAviso')}<p>O acesso ao conteúdo deste curso está suspenso. Para regularizar, fale com a equipe pelo <a href="atendimentos.html?novo=1">Atendimento</a>.</p></div>` : ''}
      <button type="button" class="pf-ac-matricula__alternar" aria-expanded="false" aria-controls="${idDes}" data-ac-alternar="${c.id}"><span>Ver desempenho</span>${CHEVRON}</button>
      <div class="pf-ac-desempenho" id="${idDes}" hidden></div>
    </article>`;
  }

  function celulaMedia(l) {
    if (typeof l.media === 'number') return html`<span class="pf-ac-num">${fmt.nota(l.media)}</span>`;
    if (l.aguardandoCorrecao) return 'Em correção';
    if (!l.avaliacaoModularId) return html`<span class="pf-ac-meta">Sem avaliação</span>`;
    return '—';
  }

  function celulaFrequencia(f) {
    if (!f || f.pct === null || f.pct === undefined) return html`<span class="pf-ac-meta">Sem registros</span>`;
    return html`<span class="pf-ac-freq"><span class="pf-ac-freq__geral pf-ac-num">${fmt.pct(f.pct)}</span><span class="pf-ac-freq__partes">ao vivo ${fmt.pct(f.aoVivoPct)} · gravado ${fmt.pct(f.gravadoPct)}</span></span>`;
  }

  function desempenhoHtml(r) {
    const k = r.kpis || {};
    const m = k.modulos || { total: 0, aprovados: 0, concluidos: 0, emAndamento: 0 };
    const ch = k.cargaHoraria || {};
    const notaMin = typeof r.notaMinima === 'number' ? fmt.nota(r.notaMinima) : null;
    const kpi = (rotulo, valor, nota) => html`<div class="pf-kpi"><dt class="pf-kpi__rotulo">${rotulo}</dt><dd class="pf-kpi__valor">${valor === null || valor === undefined ? '—' : valor}</dd>${nota ? html`<dd class="pf-kpi__nota">${nota}</dd>` : ''}</div>`;
    const cargaValor = ch.totalHoras === null || ch.totalHoras === undefined
      ? null
      : (ch.cumpridaHoras === null || ch.cumpridaHoras === undefined ? fmt.horas(ch.totalHoras) : `${fmt.horas(ch.cumpridaHoras)} de ${fmt.horas(ch.totalHoras)}`);
    const linhas = Array.isArray(r.linhas) ? r.linhas : [];
    const cursoId = r.matricula && r.matricula.curso ? r.matricula.curso.id : '';
    return html`
      <dl class="pf-kpis">
        ${kpi('Média parcial', fmt.nota(k.mediaParcial), k.mediaParcial === null || k.mediaParcial === undefined ? 'Sem notas ainda' : null)}
        ${kpi('Frequência geral', fmt.pct(k.frequenciaGeralPct), k.frequenciaGeralPct === null || k.frequenciaGeralPct === undefined ? 'Ainda não apurada' : `ao vivo ${fmt.pct(k.aoVivoPct)} · gravado ${fmt.pct(k.gravadoPct)}`)}
        ${kpi('Módulos', String(m.total), `${m.aprovados + m.concluidos} aprovados ou concluídos`)}
        ${kpi('Carga horária', cargaValor, cargaValor === null ? 'Carga não informada' : (ch.cumpridaHoras === null ? 'Carga de algum módulo não informada' : null))}
        ${kpi('Em andamento', `${k.emAndamento || 0} ${k.emAndamento === 1 ? 'módulo' : 'módulos'}`, null)}
      </dl>
      ${linhas.length ? html`<table class="pf-tabela">
        <caption>Desempenho por módulo</caption>
        <thead><tr>
          <th scope="col">Módulo</th>
          <th scope="col" class="pf-tabela__num">CH</th>
          <th scope="col" class="pf-tabela__num">Média</th>
          <th scope="col">Frequência</th>
          <th scope="col" class="pf-tabela__num">Faltas</th>
          <th scope="col">Situação</th>
        </tr></thead>
        <tbody>${linhas.map(l => html`<tr class="pf-ac-tabela-modulo" id="modulo-${l.moduloId}">
          <th scope="row">${l.numero} · ${l.titulo}</th>
          <td data-rotulo="CH" class="pf-tabela__num">${fmt.horas(l.chHoras) || '—'}</td>
          <td data-rotulo="Média" class="pf-tabela__num">${celulaMedia(l)}</td>
          <td data-rotulo="Frequência">${celulaFrequencia(l.frequencia)}</td>
          <td data-rotulo="Faltas" class="pf-tabela__num">${l.frequencia ? String(l.frequencia.faltas) : '—'}</td>
          <td data-rotulo="Situação">${estado(l.situacaoRotulo || 'Cursando', l.aguardandoCorrecao ? 'info' : (l.situacaoRotulo === 'Não iniciado' ? 'neutro' : TOM_SITUACAO[l.situacao]))}</td>
        </tr>`)}</tbody>
      </table>` : vazio('Nenhum módulo publicado neste curso.', 'Quando a coordenação publicar os módulos, eles aparecem aqui.')}
      <p class="pf-ac-regra">${notaMin ? `Nota mínima ${notaMin}. ` : ''}A média do módulo é a maior nota da avaliação modular publicada. Frequência = presença ao vivo ou conclusão da aula gravada do encontro; a presença é registrada ao entrar na sala pelo portal.</p>
      <ul class="pf-ac-links">
        <li><a href="comprovantes.html?curso=${encodeURIComponent(cursoId)}">Ver comprovantes</a></li>
        <li><a href="regulamento.html">Regulamento acadêmico</a></li>
      </ul>`;
  }

  // ---------------------------------------------------------------
  // Histórico
  // ---------------------------------------------------------------
  function historicoHtml(lista) {
    if (!lista.length) return vazio('Nenhuma matrícula encerrada.', 'Matrículas concluídas ou canceladas aparecem aqui, com a nota final e o certificado.');
    return html`<ul class="pf-ac-historico">${lista.map((c) => {
      const fim = c.status === 'concluida' ? c.concluidaEm : c.canceladaEm;
      const situacao = c.status === 'cancelada' ? estado('Cancelada', 'neutro') : estado(c.situacaoRotulo || 'Concluído', 'sucesso');
      const latoSensu = c.nivel === 'pos_graduacao_lato_sensu';
      return html`<li class="pf-ac-historico__item">
        <p class="pf-ac-historico__titulo">${c.curso.titulo}</p>
        <p class="pf-ac-meta">Matrícula <span class="pf-ac-num">${c.numero || '—'}</span> · ${fmt.data(c.inicioEm)} a ${fmt.data(fim)} · Carga ${fmt.horas(c.cargaTotalHoras) || '—'}</p>
        <p>${situacao} · Nota final ${typeof c.notaFinal === 'number' ? fmt.nota(c.notaFinal) : '—'}</p>
        ${c.status === 'concluida' ? html`<div class="pf-ac-historico__acoes">
          ${c.certificado && c.certificado.codigo ? html`<a class="dmc-btn dmc-btn--secondary" href="certificado.html?codigo=${encodeURIComponent(c.certificado.codigo)}">Ver certificado</a>` : ''}
          ${latoSensu ? '' : html`<a class="dmc-btn dmc-btn--secondary" href="certificados.html#declaracoes">Declaração de conclusão</a>`}
        </div>` : ''}
      </li>`;
    })}</ul>`;
  }

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  async function boot(ctx) {
    const painelAtual = document.getElementById('atual');
    const painelHist = document.getElementById('historico');
    const abas = configurarAbas();

    const dados = await window.DMC_Api.get(API.academico);
    const atuais = Array.isArray(dados && dados.atuais) ? dados.atuais : [];
    const historico = Array.isArray(dados && dados.historico) ? dados.historico : [];
    abas.definirContador('historico', historico.length);

    painelHist.innerHTML = historicoHtml(historico);

    if (!atuais.length) {
      painelAtual.innerHTML = (dados && dados.liberacoesSemMatricula > 0)
        ? vazio('Sua matrícula está sendo registrada pela coordenação.', 'Seu progresso continua em Meus cursos.', { rotulo: 'Ir para Meus cursos', href: 'meus-cursos.html' })
        : vazio('Nenhuma matrícula em andamento.', 'Quando você tiver acesso a um curso, a matrícula, as notas e a frequência aparecem aqui.', { rotulo: 'Ver cursos disponíveis', href: 'loja.html' });
      painelAtual.setAttribute('aria-busy', 'false');
      return;
    }

    painelAtual.innerHTML = html`${atuais.map(cardHtml)}`;
    painelAtual.setAttribute('aria-busy', 'false');

    const cache = new Map();
    async function carregar(id) {
      if (!cache.has(id)) cache.set(id, window.DMC_Api.get(API.resumo(id)));
      return cache.get(id);
    }

    async function abrir(botao, { rolar = false } = {}) {
      const id = botao.getAttribute('data-ac-alternar');
      const alvo = document.getElementById(botao.getAttribute('aria-controls'));
      const abrindo = botao.getAttribute('aria-expanded') !== 'true';
      botao.setAttribute('aria-expanded', String(abrindo));
      botao.querySelector('span').textContent = abrindo ? 'Ocultar desempenho' : 'Ver desempenho';
      alvo.hidden = !abrindo;
      if (!abrindo || alvo.dataset.carregado === '1') return;
      alvo.setAttribute('aria-busy', 'true');
      alvo.innerHTML = html`<div class="pf-ac-carregando" aria-hidden="true">${[1, 2, 3, 4, 5].map(() => html`<div class="pf-esqueleto pf-esqueleto--linha"></div>`)}</div>`;
      try {
        const r = await carregar(id);
        if (ctx.sinal && ctx.sinal.aborted) return;
        alvo.innerHTML = desempenhoHtml(r);
        alvo.dataset.carregado = '1';
        anunciar('Desempenho carregado.');
        if (rolar && /^#modulo-/.test(window.location.hash)) {
          const linha = document.getElementById(window.location.hash.slice(1));
          if (linha) linha.scrollIntoView({ block: 'center' });
        }
      } catch (err) {
        cache.delete(id);
        UI.erroCarga(alvo, err, { tentarDeNovo: () => { botao.setAttribute('aria-expanded', 'false'); abrir(botao); } });
      } finally {
        alvo.setAttribute('aria-busy', 'false');
      }
    }

    painelAtual.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-ac-alternar]');
      if (b) abrir(b);
    });

    // Qual abre primeiro: ?m=, ?curso=, a única ativa ou a primeira (UX §6.5).
    const botoes = Array.from(painelAtual.querySelectorAll('[data-ac-alternar]'));
    const pedido = ctx.params.get('m');
    const curso = ctx.params.get('curso');
    let primeiro = botoes.find(b => b.getAttribute('data-ac-alternar') === pedido)
      || (curso ? botoes.find(b => b.closest('[data-curso]').getAttribute('data-curso') === curso) : null)
      || botoes[0];
    if (primeiro) {
      await abrir(primeiro, { rolar: true });
      if (pedido || curso) primeiro.closest('.pf-ac-matricula').scrollIntoView({ block: 'start' });
    }
    // As demais carregam em segundo plano (a impressão abre todas, UX §12).
    for (const b of botoes) carregar(b.getAttribute('data-ac-alternar')).catch(() => { cache.delete(b.getAttribute('data-ac-alternar')); });

    // Impressão (UX §12): todas as matrículas abertas, com os dados carregados.
    window.addEventListener('beforeprint', () => {
      for (const b of botoes) if (b.getAttribute('aria-expanded') !== 'true') abrir(b);
    });
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'academico' });
})();
