/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-turmas.js (F8)
   Turmas — #/turmas (lista), #/turmas/sem-turma, aba Alunos da
   moldura #/turmas/:id/alunos.
   Spec: PORTAL-UX.md §7.4; PORTAL-API.md §6.12 (resumo e alunos do
   curso). A moldura (cabeçalho + abas) é do professor.js (D-65); as
   abas Frequência, Notas e Encontros são da F3a e Nova turma da F4a.
   Colunas sem fonte nesta rodada (Período, Frequência média, Média)
   não aparecem (UX §7.4: nada de "—" permanente).
   ============================================================= */
(function () {
  'use strict';
  const P = window.DMC_Professor;
  if (!P) return;

  const API = {
    alunos: (cursoId) => `/portal/professor/cursos/${encodeURIComponent(cursoId)}/alunos`
  };
  const MODALIDADE = { ao_vivo: 'Ao vivo', gravado: 'Gravado', hibrido: 'Híbrido' };
  const STATUS_TURMA = { em_andamento: 'Em andamento', planejada: 'Planejada', encerrada: 'Encerrada' };
  const FILTROS = [
    { valor: 'em_andamento', rotulo: 'Em andamento' },
    { valor: 'planejada', rotulo: 'Planejadas' },
    { valor: 'encerrada', rotulo: 'Encerradas' },
    { valor: 'todas', rotulo: 'Todas' }
  ];
  const SITUACAO = {
    cursando: ['Cursando', 'info'], aprovado: ['Aprovado', 'sucesso'], em_recuperacao: ['Em recuperação', 'aviso'], reprovado: ['Reprovado', 'erro'],
    trancada: ['Matrícula trancada', 'neutro'], cancelada: ['Matrícula cancelada', 'neutro'], concluida: ['Concluída', 'sucesso']
  };

  function rotaRegistradaNova() {
    // "Nova turma" (F4a) só aparece quando a rota existe (ação de fatia ausente não aparece).
    return typeof P.temRota === 'function' && P.temRota('turmas/nova');
  }

  // ---------------------------------------------------------------
  // #/turmas
  // ---------------------------------------------------------------
  async function montarLista(el, ctx) {
    const ui = ctx.ui;
    const filtro = FILTROS.some((f) => f.valor === ctx.filtros.get('status')) ? ctx.filtros.get('status') : 'em_andamento';
    const curso = ctx.filtros.get('curso') || '';
    ui.esqueleto(el, { tipo: 'tabela', linhas: 4 });
    const r = await P.resumo({ recarregar: true });
    el.removeAttribute('aria-busy');
    if (!r) { ui.alerta(el, { tom: 'erro', titulo: 'Não foi possível carregar as turmas.', texto: 'Tente de novo em instantes.' }); return; }
    const cursos = (r.cursos || []).filter((c) => !curso || c.id === curso);
    if (!(r.cursos || []).length) {
      ui.estadoVazio(el, ctx.papel === 'admin'
        ? { titulo: 'Nenhum curso cadastrado.', texto: 'Crie o primeiro em Conteúdo.', acao: { rotulo: 'Abrir Conteúdo', href: 'admin.html' } }
        : { titulo: 'Você ainda não está vinculado a nenhum curso.', texto: 'A coordenação faz esse vínculo em Equipe.' });
      return;
    }
    const semFonte = cursos.filter((c) => !Array.isArray(c.turmas));
    const linhas = [];
    for (const c of cursos) {
      for (const t of Array.isArray(c.turmas) ? c.turmas : []) {
        if (filtro !== 'todas' && t.status && t.status !== filtro) continue;
        linhas.push({ ...t, cursoId: c.id, cursoTitulo: c.titulo });
      }
    }
    const f = (mudar) => {
      const q = new URLSearchParams();
      const s = mudar.status !== undefined ? mudar.status : filtro;
      const c = mudar.curso !== undefined ? mudar.curso : curso;
      if (s !== 'em_andamento') q.set('status', s);
      if (c) q.set('curso', c);
      return q;
    };
    const acoes = document.querySelector('[data-pf-prof-acoes]');
    if (acoes && ctx.papel === 'admin' && rotaRegistradaNova()) {
      acoes.replaceChildren(ui.nos(ui.html`<a class="dmc-btn dmc-btn--primary" href="#/turmas/nova">Nova turma</a>`));
    }
    const semTurma = (r.cursos || [])
      .filter((c) => c.escopo === 'curso' && (ctx.papel !== 'admin' || (Number.isFinite(c.semTurma) && c.semTurma > 0)))
      .map((c) => {
        const n = Number.isFinite(c.semTurma) ? c.semTurma : null;
        const texto = n !== null ? `${n} ${n === 1 ? 'aluno sem turma' : 'alunos sem turma'} em ${c.titulo}` : `Alunos sem turma em ${c.titulo}`;
        // Coordenação enturma em Matrículas (F4a), quando a rota existe; o professor só consulta.
        const href = ctx.papel === 'admin' && P.temRota && P.temRota('matriculas')
          ? `#/matriculas?curso=${encodeURIComponent(c.id)}`
          : `#/turmas/sem-turma?curso=${encodeURIComponent(c.id)}`;
        const rotulo = ctx.papel === 'admin' && P.temRota && P.temRota('matriculas') ? ' · Enturmar' : '';
        return ui.html`<li class="pf-prof-lista__item"><a class="pf-prof-link" href="${href}">${texto}${rotulo}</a></li>`;
      });
    el.replaceChildren(ui.nos(ui.html`<div class="pf-prof-filtros">
        <div class="pf-segmento pf-prof-segmento" role="group" aria-label="Situação da turma">
          ${FILTROS.map((o) => ui.html`<button type="button" class="pf-segmento__opcao pf-prof-segmento__opcao" aria-pressed="${o.valor === filtro ? 'true' : 'false'}" data-pf-prof-status="${o.valor}">${o.rotulo}</button>`)}
        </div>
        ${(r.cursos || []).length > 1 ? ui.html`<label class="pf-campo pf-prof-campo"><span class="pf-campo__rotulo">Curso</span>
          <select class="pf-input" data-pf-prof-curso><option value="">Todos</option>${(r.cursos || []).map((c) => ui.html`<option value="${c.id}"${c.id === curso ? ' selected' : ''}>${c.titulo}</option>`)}</select></label>` : ''}
      </div>
      ${semTurma.length ? ui.html`<ul class="pf-prof-lista pf-prof-sem-turma">${semTurma}</ul>` : ''}
      ${semFonte.length ? ui.html`<div class="pf-alerta pf-alerta--info pf-prof-alerta" role="status"><p>As turmas dependem do módulo de matrículas, ainda indisponível para: ${semFonte.map((c) => c.titulo).join(', ')}.</p></div>` : ''}
      ${linhas.length ? ui.html`<table class="pf-tabela pf-prof-tabela">
        <caption>${`${linhas.length} ${linhas.length === 1 ? 'turma' : 'turmas'}`}</caption>
        <thead><tr><th scope="col">Código</th><th scope="col">Curso</th><th scope="col">Modalidade</th><th scope="col">Situação</th><th scope="col" class="pf-prof-num">Alunos</th></tr></thead>
        <tbody>${linhas.map((t) => ui.html`<tr>
          <td data-rotulo="Código"><a class="pf-prof-lista__link pf-prof-tnum" href="${`#/turmas/${encodeURIComponent(t.id)}`}">${t.codigo || t.id}</a></td>
          <td data-rotulo="Curso">${t.cursoTitulo}</td>
          <td data-rotulo="Modalidade">${MODALIDADE[t.modalidade] || '—'}</td>
          <td data-rotulo="Situação">${STATUS_TURMA[t.status] || '—'}</td>
          <td data-rotulo="Alunos" class="pf-prof-num">${Number.isFinite(t.alunos) ? String(t.alunos) : '—'}</td>
        </tr>`)}</tbody></table>`
      : (semFonte.length === cursos.length ? '' : ui.html`<div class="pf-vazio pf-prof-vazio"><p class="pf-prof-vazio__titulo">Nenhuma turma nesta situação.</p></div>`)}
`));
    const aoClicar = (e) => {
      const b = e.target.closest('[data-pf-prof-status]');
      if (b) ctx.navegar('turmas', f({ status: b.getAttribute('data-pf-prof-status') }));
    };
    const aoMudar = (e) => {
      const s = e.target.closest('[data-pf-prof-curso]');
      if (s) ctx.navegar('turmas', f({ curso: s.value }));
    };
    el.addEventListener('click', aoClicar);
    el.addEventListener('change', aoMudar);
    return { destruir() { el.removeEventListener('click', aoClicar); el.removeEventListener('change', aoMudar); } };
  }

  // ---------------------------------------------------------------
  // Tabela de alunos (aba Alunos da turma e #/turmas/sem-turma)
  // ---------------------------------------------------------------
  function htmlSituacao(ui, a) {
    const chave = a.status && a.status !== 'ativa' ? a.status : a.situacaoCurso;
    const s = SITUACAO[chave];
    if (!s) return '—';
    return ui.html`<span class="${`pf-prof-estado pf-prof-estado--${s[1]}`}">${s[0]}</span>`;
  }

  function htmlTabelaAlunos(ui, itens, legenda) {
    return ui.html`<table class="pf-tabela pf-prof-tabela">
      <caption>${legenda}</caption>
      <thead><tr><th scope="col">Aluno</th><th scope="col" class="pf-prof-num">Progresso</th><th scope="col" class="pf-prof-num">Média</th><th scope="col" class="pf-prof-num">Frequência</th><th scope="col">Situação</th><th scope="col">Última atividade</th></tr></thead>
      <tbody>${itens.map((a) => {
        const nome = a.aluno.nomeSocial || a.aluno.nome || 'Aluno';
        const media = a.aguardandoCorrecao && !Number.isFinite(a.mediaParcial) ? 'a corrigir' : ui.fmt.nota(a.mediaParcial);
        return ui.html`<tr>
          <td data-rotulo="Aluno"><a class="pf-prof-lista__link" href="${`#/alunos/${encodeURIComponent(a.aluno.id)}`}">${nome}</a>${a.aluno.email ? ui.html`<br><span class="pf-prof-lista__meta">${a.aluno.email}</span>` : ''}</td>
          <td data-rotulo="Progresso" class="pf-prof-num">${ui.fmt.pct(a.progressoPct)}</td>
          <td data-rotulo="Média" class="pf-prof-num">${media}</td>
          <td data-rotulo="Frequência" class="pf-prof-num">${ui.fmt.pct(a.frequenciaPct)}</td>
          <td data-rotulo="Situação">${htmlSituacao(ui, a)}</td>
          <td data-rotulo="Última atividade">${a.ultimaAtividadeEm ? ui.fmt.relativo(a.ultimaAtividadeEm) : '—'}</td>
        </tr>`;
      })}</tbody></table>`;
  }

  async function carregarAlunos(el, ctx, { cursoId, turmaId, semTurma }) {
    const ui = ctx.ui;
    const q = ctx.filtros.get('q') || '';
    const situacao = ctx.filtros.get('situacao') || '';
    const params = new URLSearchParams();
    if (turmaId) params.set('turmaId', turmaId);
    if (q) params.set('q', q);
    if (situacao) params.set('situacao', situacao);
    ui.esqueleto(el, { tipo: 'tabela', linhas: 5 });
    const r = await ctx.api.get(`${API.alunos(cursoId)}?${params}`, { sinal: ctx.sinal });
    el.removeAttribute('aria-busy');
    const busca = ui.html`<form class="pf-prof-filtros" role="search" data-pf-prof-busca>
      <label class="pf-campo pf-prof-campo"><span class="pf-campo__rotulo">Buscar por nome ou e-mail</span><input class="pf-input" type="search" name="q" value="${q}" maxlength="80" autocomplete="off"></label>
      <label class="pf-campo pf-prof-campo"><span class="pf-campo__rotulo">Situação</span>
        <select class="pf-input" name="situacao"><option value="">Todas</option>
          ${['cursando', 'aprovado', 'em_recuperacao', 'reprovado', 'trancada', 'cancelada'].map((s) => ui.html`<option value="${s}"${s === situacao ? ' selected' : ''}>${SITUACAO[s][0]}</option>`)}
        </select></label>
      <button type="submit" class="dmc-btn dmc-btn--secondary">Filtrar</button>
    </form>`;
    if (!r || r.itens === null) {
      el.replaceChildren(ui.nos(ui.html`${busca}<div class="pf-alerta pf-alerta--info pf-prof-alerta" role="status"><p>${(r && r.motivo) || 'A lista de alunos ainda não está disponível.'}</p></div>`));
    } else {
      let itens = r.itens || [];
      if (semTurma) itens = itens.filter((a) => !a.turmaCodigo);
      el.replaceChildren(ui.nos(ui.html`${busca}${itens.length
        ? htmlTabelaAlunos(ui, itens, `${itens.length} de ${r.total} ${r.total === 1 ? 'aluno' : 'alunos'}`)
        : ui.html`<div class="pf-vazio pf-prof-vazio"><p class="pf-prof-vazio__titulo">${q || situacao ? 'Nenhum aluno encontrado com estes filtros.' : 'Nenhum aluno nesta turma ainda.'}</p></div>`}`));
    }
    const form = el.querySelector('[data-pf-prof-busca]');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new URLSearchParams(ctx.filtros);
      const fd = new FormData(form);
      ['q', 'situacao'].forEach((k) => { const v = String(fd.get(k) || '').trim(); if (v) f.set(k, v); else f.delete(k); });
      const rota = ctx.rota.replace(':id', encodeURIComponent(ctx.params.id || ''));
      ctx.navegar(rota, f);
    });
  }

  async function montarAbaAlunos(el, ctx) {
    if (!ctx.turma || !ctx.turma.cursoId) {
      ctx.ui.alerta(el, { tom: 'info', texto: 'Os dados desta turma ainda não estão disponíveis (módulo de matrículas).' });
      return;
    }
    await carregarAlunos(el, ctx, { cursoId: ctx.turma.cursoId, turmaId: ctx.turma.id });
  }

  async function montarSemTurma(el, ctx) {
    const curso = ctx.filtros.get('curso') || (ctx.cursos[0] && ctx.cursos[0].id) || '';
    const c = ctx.cursos.find((x) => x.id === curso);
    ctx.definirTitulo(c ? `Alunos sem turma · ${c.titulo}` : 'Alunos sem turma');
    if (!curso) { ctx.ui.estadoVazio(el, { titulo: 'Nenhum curso vinculado.' }); return; }
    await carregarAlunos(el, ctx, { cursoId: curso, semTurma: true });
  }

  P.registrar({ rota: 'turmas', titulo: 'Turmas', papeis: ['professor', 'admin'], montar: montarLista });
  P.registrar({ rota: 'turmas/sem-turma', titulo: 'Alunos sem turma', papeis: ['professor', 'admin'], montar: montarSemTurma });
  P.registrar({ rota: 'turmas/:id/alunos', titulo: 'Alunos', papeis: ['professor', 'admin'], pai: 'turmas/:id', aba: 'alunos', montar: montarAbaAlunos });
})();
