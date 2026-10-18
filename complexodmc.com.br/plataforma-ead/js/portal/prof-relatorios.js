/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-relatorios.js (F7)
   Relatórios e auditoria no backoffice (hospedado em professor.html):
     #/relatorios            índice do catálogo do papel (o servidor filtra)
     #/relatorios/:painel    filtros → KPIs → barras → tabela → [Exportar CSV]
     #/auditoria             trilha de auditoria (só coordenação; API da F0t)
   Spec: PORTAL-UX §7.23, §7.24; PORTAL-API §6.11.3, §6.4.
   A tela nunca mostra coluna que não veio do servidor; KPI null = "—".
   HTML só por DMC_UI.html; sem alert/confirm/prompt; sem script inline.
   ============================================================= */
(function () {
  'use strict';
  const P = window.DMC_Professor;
  if (!P) return;

  const API = {
    catalogo: '/portal/professor/relatorios',
    relatorio: (id) => `/portal/professor/relatorios/${encodeURIComponent(id)}`,
    turmas: (cursoId) => `/portal/professor/cursos/${encodeURIComponent(cursoId)}/turmas`,
    auditoria: '/portal/admin/auditoria'
  };
  const PA = ['professor', 'admin'];
  const A = ['admin'];
  const ID_RE = /^[a-z][a-z0-9-]{1,40}$/;
  const DESCRICOES = {
    alunos: 'Matrículas por curso e turma, com situação e progresso.',
    progresso: 'Aulas concluídas, aulas disponíveis e última atividade de cada aluno.',
    notas: 'Nota e situação por módulo, com as tentativas usadas.',
    frequencia: 'Frequência por módulo: ao vivo, compensada e gravada.',
    tentativas: 'Cada tentativa de avaliação, com início, envio e nota.',
    'correcoes-pendentes': 'Tentativas que aguardam correção de questões dissertativas.',
    presencas: 'Presença em cada encontro ao vivo.',
    'documentos-pendentes': 'Documentos dos alunos em revisão, pendentes ou não enviados.',
    contratos: 'Contratos por matrícula e a situação da assinatura.',
    financeiro: 'Lançamentos, vencimentos e pagamentos.',
    atendimentos: 'Protocolos de atendimento e o tempo até a primeira resposta.',
    ouvidoria: 'Manifestações da ouvidoria, sem identidade.',
    retencao: 'Registros que passaram do prazo de retenção configurado, para decisão humana.',
    diversidade: 'Contagens por gênero e por etnia, só de quem consentiu; grupos com menos de 5 pessoas aparecem como "<5".'
  };
  const AREAS = [
    ['', 'Todas as áreas'], ['tentativa.', 'Notas'], ['frequencia.', 'Frequência'], ['perfil.', 'Cadastro'], ['lancamento.', 'Financeiro'],
    ['contrato.', 'Contratos'], ['documento.', 'Documentos'], ['usuario.', 'Papéis e equipe'], ['config.', 'Configurações'],
    ['relatorio.', 'Exportações'], ['ia.', 'Assistente de IA'], ['ouvidoria.', 'Ouvidoria']
  ];
  const PERIODOS = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['personalizado', 'Personalizado']];
  const ROTULO_PAPEL = { aluno: 'Aluno', professor: 'Professor', admin: 'Coordenação', sistema: 'Sistema' };
  const FMT_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const FMT_QUANDO = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const msgErro = (err) => (err && err.message) || 'Não foi possível carregar agora. Tente de novo.';
  const diaSP = (d) => FMT_DIA.format(d);

  function fmtValor(ui, valor, formato) {
    if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return null;
    const f = ui.fmt || {};
    const n = Number(valor);
    switch (formato) {
      case 'pct': return f.pct ? f.pct(n) : `${Math.round(n)}%`;
      case 'nota': return f.nota ? f.nota(n) : n.toFixed(1).replace('.', ',');
      case 'moeda': return f.moeda ? f.moeda(n) : `R$ ${(n / 100).toFixed(2).replace('.', ',')}`;
      case 'horas': return f.horas ? f.horas(n) : `${Math.round(n)} h`;
      default: return f.numero ? f.numero(n) : String(n);
    }
  }
  function fmtCelula(ui, v, tipo) {
    if (v === null || v === undefined || v === '') return '—';
    if ((tipo === 'data' || tipo === 'dataHora') && typeof v === 'string' && !Number.isNaN(Date.parse(v))) {
      const f = ui.fmt || {};
      return tipo === 'data' ? (f.data ? f.data(v) : v.slice(0, 10)) : (f.dataHora ? f.dataHora(v) : v);
    }
    if (typeof v === 'number') return fmtValor(ui, v, tipo === 'moeda' || tipo === 'pct' || tipo === 'nota' ? tipo : 'numero') || '—';
    return String(v);
  }

  // =========================================================
  // #/relatorios — índice
  // =========================================================
  async function montarIndice(el, ctx) {
    const ui = ctx.ui;
    ui.esqueleto(el, { tipo: 'lista', linhas: 5 });
    let itens;
    try {
      const r = await ctx.api.get(API.catalogo, { sinal: ctx.sinal });
      itens = r && Array.isArray(r.itens) ? r.itens : [];
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      ui.erroCarga(el, err, { tentarDeNovo: () => montarIndice(el, ctx) });
      return;
    }
    if (!itens.length) {
      ui.estadoVazio(el, { titulo: 'Nenhum relatório disponível agora.', texto: 'Os relatórios aparecem conforme os módulos da plataforma são ativados.' });
      return;
    }
    const linha = (i) => ui.html`<li class="pf-lista__linha"><div>
        <p class="pf-lista__titulo"><a href="${`#/relatorios/${encodeURIComponent(i.id)}`}">${i.titulo}</a></p>
        <p class="pf-lista__meta">${i.descricao || DESCRICOES[i.id] || ''}</p></div></li>`;
    const paineis = itens.filter((i) => i.temResumo);
    const tabelas = itens.filter((i) => !i.temResumo);
    el.innerHTML = ui.html`<div class="pf-com-indice">
      ${ctx.papel === 'professor' ? ui.html`<p class="pf-ajuda">Dados das turmas e cursos em que você leciona.</p>` : ''}
      ${paineis.length ? ui.html`<section aria-labelledby="rel-paineis"><h2 id="rel-paineis">Painéis</h2><ul class="pf-lista" role="list">${paineis.map(linha)}</ul></section>` : ''}
      ${tabelas.length ? ui.html`<section aria-labelledby="rel-tabelas"><h2 id="rel-tabelas">Tabelas para exportar</h2><ul class="pf-lista" role="list">${tabelas.map(linha)}</ul></section>` : ''}
    </div>`;
  }

  // =========================================================
  // #/relatorios/:painel — painel ou tabela
  // =========================================================
  async function montarRelatorio(el, ctx) {
    const ui = ctx.ui;
    const id = ctx.params && ctx.params.painel;
    if (!ID_RE.test(String(id || ''))) { naoEncontrado(); return; }
    ui.esqueleto(el, { tipo: 'texto', linhas: 4 });
    let def;
    try {
      const r = await ctx.api.get(API.catalogo, { sinal: ctx.sinal });
      def = ((r && r.itens) || []).find((i) => i.id === id) || null;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      ui.erroCarga(el, err, { tentarDeNovo: () => montarRelatorio(el, ctx) });
      return;
    }
    if (!def) { naoEncontrado(); return; }
    if (ctx.definirTitulo) ctx.definirTitulo(def.titulo);

    function naoEncontrado() {
      ui.estadoVazio(el, { titulo: 'Relatório não encontrado.', texto: 'Ele pode não estar disponível para o seu papel.', acao: { rotulo: 'Ver os relatórios', href: '#/relatorios' } });
    }

    const cursos = Array.isArray(ctx.cursos) ? ctx.cursos : [];
    const temFiltro = (k) => (def.filtros || []).some((f) => f.chave === k);
    const obrigatorio = (k) => (def.filtros || []).some((f) => f.chave === k && f.obrigatorio);
    const filtrosHash = ctx.filtros || new URLSearchParams();
    const st = {
      cursoId: filtrosHash.get('cursoId') || (obrigatorio('cursoId') && cursos[0] ? cursos[0].id : ''),
      turmaId: filtrosHash.get('turmaId') || '',
      de: filtrosHash.get('de') || '', ate: filtrosHash.get('ate') || '',
      pagina: 1, linhas: [], total: 0, totalPaginas: 1, aviso: null
    };
    const csv = (def.formatos || []).indexOf('csv') >= 0;

    el.innerHTML = ui.html`<div class="pf-com-painel">
      <form class="pf-com-filtros" data-rel-filtros novalidate>
        ${temFiltro('cursoId') || cursos.length ? ui.html`<div class="pf-campo"><label class="pf-rotulo" for="rel-curso">Curso</label>
          <select class="pf-input" id="rel-curso" name="cursoId">${obrigatorio('cursoId') ? '' : ui.html`<option value="">${ctx.papel === 'admin' ? 'Todos os cursos' : 'Todos os seus cursos'}</option>`}${cursos.map((c) => ui.html`<option value="${c.id}" ${st.cursoId === c.id ? 'selected' : ''}>${c.titulo}</option>`)}</select></div>` : ''}
        ${temFiltro('turmaId') ? ui.html`<div class="pf-campo"><label class="pf-rotulo" for="rel-turma">Turma</label>
          <select class="pf-input" id="rel-turma" name="turmaId" data-rel-turma><option value="">Todas as turmas</option></select></div>` : ''}
        <div class="pf-campo"><label class="pf-rotulo" for="rel-de">De</label><input class="pf-input" id="rel-de" name="de" type="date" value="${st.de}"></div>
        <div class="pf-campo"><label class="pf-rotulo" for="rel-ate">Até</label><input class="pf-input" id="rel-ate" name="ate" type="date" value="${st.ate}"></div>
        <button type="submit" class="dmc-btn dmc-btn--secondary">Aplicar filtros</button>
      </form>
      <div data-rel-aviso></div>
      <div data-rel-kpis></div>
      <div class="pf-com-series" data-rel-series></div>
      <div data-rel-tabela role="region" aria-label="${`Tabela: ${def.titulo}`}" aria-busy="true"></div>
      ${csv ? ui.html`<div class="pf-com-acoes"><button type="button" class="dmc-btn dmc-btn--secondary" data-rel-csv>Exportar CSV</button></div>` : ui.html`<p class="pf-ajuda">Só leitura em tela, sem exportação.</p>`}
    </div>`;
    const form = el.querySelector('[data-rel-filtros]');

    // Tabela mais larga que a vista rola dentro do bloco (portal-comunicacao.css);
    // só então o bloco entra na ordem de tabulação, para rolar pelo teclado.
    const blocoTabela = el.querySelector('[data-rel-tabela]');
    function marcarRolavel() {
      if (!blocoTabela || !blocoTabela.isConnected) return;
      if (blocoTabela.scrollWidth > blocoTabela.clientWidth + 1) blocoTabela.setAttribute('tabindex', '0');
      else blocoTabela.removeAttribute('tabindex');
    }
    if (blocoTabela && typeof window.ResizeObserver === 'function') {
      const ro = new window.ResizeObserver(marcarRolavel);
      ro.observe(blocoTabela);
      if (ctx.sinal && typeof ctx.sinal.addEventListener === 'function') ctx.sinal.addEventListener('abort', () => ro.disconnect(), { once: true });
    }

    async function carregarTurmas() {
      const sel = el.querySelector('[data-rel-turma]');
      if (!sel) return;
      sel.innerHTML = ui.html`<option value="">Todas as turmas</option>`;
      if (!st.cursoId) return;
      try {
        const r = await ctx.api.get(API.turmas(st.cursoId), { silencioso404: true, sinal: ctx.sinal });
        const turmas = (r && r.itens) || [];
        sel.insertAdjacentHTML('beforeend', ui.html`${turmas.map((t) => ui.html`<option value="${t.id}" ${st.turmaId === t.id ? 'selected' : ''}>${t.codigo || t.nome}</option>`)}`);
      } catch (err) { if (err && err.name === 'AbortError') return; /* sem turmas: só "Todas" */ }
    }

    function consulta(pagina, formato) {
      const q = new URLSearchParams();
      if (st.cursoId) q.set('cursoId', st.cursoId);
      if (st.turmaId) q.set('turmaId', st.turmaId);
      if (st.de) q.set('de', st.de);
      if (st.ate) q.set('ate', st.ate);
      if (formato) q.set('formato', formato);
      if (pagina > 1) q.set('pagina', String(pagina));
      return q;
    }

    function mostrarAviso(tom, texto) {
      const a = el.querySelector('[data-rel-aviso]');
      a.innerHTML = texto ? ui.html`<div class="pf-alerta pf-alerta--${tom}" role="${tom === 'erro' ? 'alert' : 'status'}"><p>${texto}</p></div>` : '';
    }

    function desenharResumo(resumo) {
      const k = el.querySelector('[data-rel-kpis]');
      const s = el.querySelector('[data-rel-series]');
      if (!resumo) { k.innerHTML = ''; s.innerHTML = ''; return; }
      ui.kpis(k, (resumo.kpis || []).map((x) => ({ rotulo: x.rotulo, valor: fmtValor(ui, x.valor, x.formato), nota: x.valor === null ? (x.nota || 'Sem dado no período') : x.nota })));
      s.innerHTML = '';
      for (const serie of resumo.series || []) {
        if (!serie.pontos || !serie.pontos.length) continue;
        const caixa = document.createElement('div');
        caixa.innerHTML = ui.html`<p class="pf-com-barras-legenda">${serie.rotulo}</p><div data-rel-barras></div>`;
        s.appendChild(caixa);
        ui.barras(caixa.querySelector('[data-rel-barras]'), {
          legenda: serie.rotulo,
          linhas: serie.pontos.map((p) => ({ rotulo: p.rotulo, valor: p.valor === null ? 0 : p.valor, texto: fmtValor(ui, p.valor, serie.formato) || '—' }))
        });
      }
    }

    let tabela = null;
    function desenharTabela(colunas) {
      const alvo = el.querySelector('[data-rel-tabela]');
      alvo.setAttribute('aria-busy', 'false');
      const cols = colunas.map((c) => ({ chave: c.chave, rotulo: c.rotulo, tipo: c.tipo === 'numero' || c.tipo === 'pct' || c.tipo === 'nota' || c.tipo === 'moeda' ? 'numero' : 'texto', render: (l) => ui.html`${fmtCelula(ui, l[c.chave], c.tipo)}` }));
      const paginacao = st.pagina < st.totalPaginas ? { mostrando: st.linhas.length, total: st.total, carregarMais: () => carregar(st.pagina + 1) } : { mostrando: st.linhas.length, total: st.total };
      if (typeof ui.tabela === 'function') {
        tabela = ui.tabela(alvo, { legenda: def.titulo, colunas: cols, linhas: st.linhas, vazio: { titulo: 'Nenhum registro com estes filtros.', texto: 'Troque o curso, a turma ou o período.' }, paginacao });
      }
      marcarRolavel();
    }

    async function carregar(pagina) {
      const alvo = el.querySelector('[data-rel-tabela]');
      if (pagina === 1) { ui.esqueleto(alvo, { tipo: 'tabela', linhas: 5 }); mostrarAviso(null, ''); }
      try {
        const r = await ctx.api.get(`${API.relatorio(def.id)}?${consulta(pagina).toString()}`, { sinal: ctx.sinal });
        st.pagina = r.pagina || pagina;
        st.total = r.total || 0;
        st.totalPaginas = r.totalPaginas || 1;
        st.linhas = pagina === 1 ? (r.itens || []) : st.linhas.concat(r.itens || []);
        if (pagina === 1) desenharResumo(r.resumo);
        desenharTabela((r.relatorio && r.relatorio.colunas) || def.colunas || []);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        alvo.setAttribute('aria-busy', 'false');
        alvo.innerHTML = '';
        if (err && err.codigo === 'nao-docente') {
          st.cursoId = ''; st.turmaId = '';
          const sel = form.elements.cursoId;
          if (sel) sel.value = '';
          mostrarAviso('info', 'Este curso não está entre os que você leciona.');
          if (!obrigatorio('cursoId')) carregar(1);
          return;
        }
        if (err && err.status === 413) { mostrarAviso('aviso', 'O resultado passa de 20.000 linhas. Filtre por curso, turma ou período.'); return; }
        if (err && err.status === 404) { naoEncontrado(); return; }
        if (err && err.status === 400) { mostrarAviso('aviso', msgErro(err)); return; }
        mostrarAviso('erro', msgErro(err));
      }
    }

    form.addEventListener('change', (ev) => {
      if (ev.target && ev.target.name === 'cursoId') { st.cursoId = ev.target.value; st.turmaId = ''; carregarTurmas(); }
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      st.cursoId = form.elements.cursoId ? form.elements.cursoId.value : '';
      st.turmaId = form.elements.turmaId ? form.elements.turmaId.value : '';
      st.de = form.elements.de.value; st.ate = form.elements.ate.value;
      carregar(1);
    });
    const bCsv = el.querySelector('[data-rel-csv]');
    if (bCsv) bCsv.addEventListener('click', async () => {
      const ok = typeof ui.confirmar === 'function'
        ? await ui.confirmar({ titulo: 'Exportar CSV?', texto: 'O arquivo contém dados pessoais de alunos. A exportação fica registrada na auditoria.', rotuloConfirmar: 'Exportar' })
        : false;
      if (!ok) return;
      ui.ocupado(bCsv, true, 'Gerando…');
      try {
        await ui.baixar(`${API.relatorio(def.id)}?${consulta(1, 'csv').toString()}`, `dmc-${def.id}-${diaSP(new Date())}.csv`);
      } catch (err) {
        if (err && err.status === 413) mostrarAviso('aviso', 'O resultado passa de 20.000 linhas. Filtre por curso, turma ou período.');
        else mostrarAviso('erro', msgErro(err));
      } finally {
        ui.ocupado(bCsv, false);
      }
    });

    await carregarTurmas();
    carregar(1);
    return { destruir() { if (tabela && typeof tabela.destruir === 'function') tabela.destruir(); } };
  }

  // =========================================================
  // #/auditoria — só coordenação
  // =========================================================
  function fraseDaAcao(acao) {
    const [ent, ev] = String(acao || '').split('.');
    const verbos = { criado: 'criou', criada: 'criou', alterado: 'alterou', alterada: 'alterou', removido: 'removeu', removida: 'removeu', publicada: 'publicou', publicado: 'publicou', arquivada: 'arquivou', exportado: 'exportou', concedida: 'concedeu', revogada: 'revogou', revisado: 'revisou', assinado: 'assinou', cancelado: 'cancelou', encerrado: 'encerrou', encerrada: 'encerrou', respondido: 'respondeu', respondida: 'respondeu', emitido: 'emitiu', emitida: 'emitiu', lancada: 'lançou', anulada: 'anulou', corrigida: 'corrigiu', pago: 'registrou o pagamento de' };
    const nomes = { publicacao: 'publicação', banner: 'banner', relatorio: 'relatório', tentativa: 'tentativa', frequencia: 'frequência', perfil: 'cadastro', lancamento: 'lançamento', contrato: 'contrato', documento: 'documento', usuario: 'usuário', docencia: 'docência', config: 'configuração', ia: 'assistente de IA', ouvidoria: 'ouvidoria', matricula: 'matrícula', protocolo: 'protocolo', auth: 'acesso', declaracao: 'declaração', certificado: 'certificado', consentimento: 'consentimento', regulamento: 'regulamento', turma: 'turma', liberacao: 'liberação' };
    const v = verbos[ev];
    return v ? `${v} ${nomes[ent] || ent}` : String(acao || '');
  }
  function valorCurto(v) {
    if (v === null || v === undefined) return '—';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  }

  function montarAuditoria(el, ctx) {
    const ui = ctx.ui;
    const st = { periodo: '30', de: '', ate: '', acao: '', objeto: '', pagina: 1, itens: [], total: 0, totalPaginas: 1 };
    el.innerHTML = ui.html`<div class="pf-alerta pf-alerta--info" role="note"><p>Registros de auditoria não podem ser editados nem apagados.</p></div>
      <form class="pf-com-filtros" data-aud-filtros novalidate>
        <div data-aud-periodo></div>
        <div class="pf-campo" data-aud-personalizado hidden><label class="pf-rotulo" for="aud-de">De</label><input class="pf-input" id="aud-de" name="de" type="date"></div>
        <div class="pf-campo" data-aud-personalizado hidden><label class="pf-rotulo" for="aud-ate">Até</label><input class="pf-input" id="aud-ate" name="ate" type="date"></div>
        <div class="pf-campo"><label class="pf-rotulo" for="aud-area">Área</label><select class="pf-input" id="aud-area" name="acao">${AREAS.map(([v, r]) => ui.html`<option value="${v}">${r}</option>`)}</select></div>
        <div class="pf-campo"><label class="pf-rotulo" for="aud-objeto">Objeto (nº de matrícula, protocolo ou e-mail)</label><input class="pf-input" id="aud-objeto" name="objeto" maxlength="120" autocomplete="off"></div>
        <button type="submit" class="dmc-btn dmc-btn--secondary">Buscar</button>
      </form>
      <div data-aud-aviso></div>
      <div data-aud-lista aria-busy="true"></div>
      <div class="pf-com-mais" data-aud-mais hidden><button type="button" class="dmc-btn dmc-btn--secondary" data-aud-carregar>Carregar mais</button></div>
      <div class="pf-com-acoes"><button type="button" class="dmc-btn dmc-btn--secondary" data-aud-csv>Exportar CSV</button></div>`;
    const form = el.querySelector('[data-aud-filtros]');
    ui.filtros(el.querySelector('[data-aud-periodo]'), {
      rotulo: 'Período', opcoes: PERIODOS.map(([valor, rotulo]) => ({ valor, rotulo })), valor: st.periodo,
      aoMudar: (v) => {
        st.periodo = v;
        el.querySelectorAll('[data-aud-personalizado]').forEach((x) => { x.hidden = v !== 'personalizado'; });
        if (v !== 'personalizado') carregar(1);
      }
    });

    function consulta(pagina, formato) {
      const q = new URLSearchParams();
      if (st.periodo === 'personalizado') {
        if (st.de) q.set('de', st.de);
        if (st.ate) q.set('ate', st.ate);
      } else {
        q.set('de', diaSP(new Date(Date.now() - Number(st.periodo) * 24 * 3600 * 1000)));
      }
      if (st.acao) q.set('acao', st.acao);
      if (st.objeto) q.set('objeto', st.objeto);
      if (formato) q.set('formato', formato);
      if (pagina > 1) q.set('pagina', String(pagina));
      return q;
    }

    function linha(i) {
      const quem = i.ator ? `${i.ator.nome || (i.ator.papel === 'sistema' ? 'Sistema' : '—')} · ${ROTULO_PAPEL[i.ator.papel] || i.ator.papel || ''}` : '—';
      const objeto = i.entidade ? `${i.entidade.tipo}${i.entidade.id ? ` ${i.entidade.id}` : ''}` : (i.alvo && i.alvo.nome) || '—';
      const mud = Array.isArray(i.mudancas) && i.mudancas.length;
      return ui.html`<li class="pf-lista__linha">
          <div>
            <p class="pf-lista__titulo"><span class="pf-com-quando">${i.em ? FMT_QUANDO.format(new Date(i.em)).replace(',', ' ·') : '—'}</span> · ${quem}</p>
            <p class="pf-lista__meta">${fraseDaAcao(i.acao)} · ${objeto}${i.alvo && i.alvo.nome ? ` · ${i.alvo.nome}` : ''}${i.motivo ? ` · Motivo: ${i.motivo}` : ''}</p>
            ${mud ? ui.html`<details class="pf-com-detalhes"><summary>Antes → depois</summary><ul class="pf-com-mudancas">${i.mudancas.map((m) => ui.html`<li>${m.campo}: ${valorCurto(m.de)} → ${valorCurto(m.para)}</li>`)}</ul></details>` : ''}
          </div>
          <div class="pf-lista__acao">${i.estado === 'falhou' ? (typeof ui.estado === 'function' ? ui.estado('Falhou', 'erro') : 'Falhou') : ''}</div>
        </li>`;
    }

    async function carregar(pagina) {
      const alvo = el.querySelector('[data-aud-lista]');
      const aviso = el.querySelector('[data-aud-aviso]');
      if (pagina === 1) { ui.esqueleto(alvo, { tipo: 'lista', linhas: 6 }); aviso.innerHTML = ''; }
      try {
        const r = await ctx.api.get(`${API.auditoria}?${consulta(pagina).toString()}`, { sinal: ctx.sinal });
        st.pagina = r.pagina || pagina;
        st.totalPaginas = r.totalPaginas || 1;
        st.total = r.total || 0;
        st.itens = pagina === 1 ? (r.itens || []) : st.itens.concat(r.itens || []);
        alvo.setAttribute('aria-busy', 'false');
        if (!st.itens.length) ui.estadoVazio(alvo, { titulo: 'Nenhum registro com estes filtros.', texto: 'Amplie o período ou troque a área.' });
        else alvo.innerHTML = ui.html`<ul class="pf-lista" role="list">${st.itens.map(linha)}</ul>`;
        el.querySelector('[data-aud-mais]').hidden = st.pagina >= st.totalPaginas;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        alvo.setAttribute('aria-busy', 'false');
        alvo.innerHTML = '';
        aviso.innerHTML = ui.html`<div class="pf-alerta pf-alerta--${err && err.status === 400 ? 'aviso' : 'erro'}" role="alert"><p>${msgErro(err)}</p></div>`;
      }
    }

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      st.acao = form.elements.acao.value;
      st.objeto = form.elements.objeto.value.trim();
      st.de = form.elements.de.value;
      st.ate = form.elements.ate.value;
      carregar(1);
    });
    el.querySelector('[data-aud-carregar]').addEventListener('click', () => carregar(st.pagina + 1));
    const bCsv = el.querySelector('[data-aud-csv]');
    bCsv.addEventListener('click', async () => {
      ui.ocupado(bCsv, true, 'Gerando…');
      try {
        await ui.baixar(`${API.auditoria}?${consulta(1, 'csv').toString()}`, `dmc-auditoria-${diaSP(new Date())}.csv`);
      } catch (err) {
        const aviso = el.querySelector('[data-aud-aviso]');
        aviso.innerHTML = ui.html`<div class="pf-alerta pf-alerta--aviso" role="alert"><p>${err && err.status === 413 ? 'O resultado passa de 20.000 linhas. Reduza o período.' : msgErro(err)}</p></div>`;
      } finally {
        ui.ocupado(bCsv, false);
      }
    });
    carregar(1);
  }

  P.registrar({ rota: 'relatorios', titulo: 'Relatórios', papeis: PA, montar: montarIndice });
  P.registrar({ rota: 'relatorios/:painel', titulo: 'Relatório', papeis: PA, montar: montarRelatorio });
  P.registrar({ rota: 'auditoria', titulo: 'Auditoria', papeis: A, montar: montarAuditoria });
})();
