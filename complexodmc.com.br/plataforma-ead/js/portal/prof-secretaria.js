/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-secretaria.js (F4a)
   Secretaria no backoffice (só coordenação): Matrículas e Turmas.
   Spec: PORTAL-UX.md §7.14 (Matrículas), §7.4 (Nova turma), §7.5
   (aba Matrículas do aluno); PORTAL-API.md §6.8.1–§6.8.2, §8.1–§8.2;
   índice §6.3, §7.8 (DMC_Professor.registrar), D-30, D-65, D-78, D-79.

   Rotas registradas (todas papeis ['admin']):
     #/matriculas                lista + "Acessos sem matrícula"; painéis
                                 Nova matrícula e Conceder acesso
                                 (?nova=1&email=&curso=&protocolo= ·
                                  ?conceder=1&email=&curso=)
     #/matriculas/:id            detalhe, histórico e ações (§8.1)
     #/turmas/nova               Nova turma (+ docências da turma, D-30)
     #/alunos/:userId/matriculas aba da moldura do aluno (pai, D-65)

   Sem <script> inline, sem on*=, HTML só por DMC_UI.html (escape).
   Prefixo de classe próprio: pf-sec-.
   ============================================================= */
(function () {
  'use strict';
  const P = window.DMC_Professor;
  if (!P || typeof P.registrar !== 'function') return;

  const API = {
    matriculas: '/portal/admin/matriculas',
    matricula: (id) => `/portal/admin/matriculas/${encodeURIComponent(id)}`,
    acao: (id, acao) => `/portal/admin/matriculas/${encodeURIComponent(id)}/${acao}`,
    semMatricula: '/portal/admin/matriculas/sem-matricula',
    sincronizar: '/portal/admin/matriculas/sincronizar',
    turmas: '/portal/admin/turmas',
    turmaMatriculas: (id) => `/portal/admin/turmas/${encodeURIComponent(id)}/matriculas`,
    liberacoes: '/liberacoes',
    catalogo: '/catalogo',
    equipe: '/portal/admin/equipe',
    docencias: '/portal/admin/docencias'
  };
  const SO_ADMIN = ['admin'];
  const SITUACOES = [
    { valor: 'ativa', rotulo: 'Ativa' },
    { valor: 'concluida', rotulo: 'Concluída' },
    { valor: 'trancada', rotulo: 'Trancada' },
    { valor: 'cancelada', rotulo: 'Cancelada' },
    { valor: 'todas', rotulo: 'Todas' }
  ];
  const ROTULO_SITUACAO = { ativa: 'Ativa', concluida: 'Concluída', trancada: 'Trancada', cancelada: 'Cancelada' };
  const TOM_SITUACAO = { ativa: 'sucesso', concluida: 'info', trancada: 'aviso', cancelada: 'neutro' };
  const ORIGENS = [
    { valor: 'liberacao', rotulo: 'Liberação de acesso' },
    { valor: 'admin', rotulo: 'Manual' },
    { valor: 'migracao', rotulo: 'Migração' }
  ];
  const ROTULO_ORIGEM = { liberacao: 'Liberação de acesso', admin: 'Manual', migracao: 'Migração' };
  const MODALIDADES = [
    { valor: 'ao_vivo', rotulo: 'Ao vivo' },
    { valor: 'gravado', rotulo: 'Gravado' },
    { valor: 'hibrido', rotulo: 'Híbrido' }
  ];
  const ROTULO_CONTRATO = { pendente: 'Pendente', assinado: 'Assinado', cancelado: 'Cancelado' };
  const TOM_CONTRATO = { pendente: 'aviso', assinado: 'sucesso', cancelado: 'neutro' };
  // Transições oferecidas na tela (§8.1); o servidor confere de novo.
  const ACOES_STATUS = {
    ativa: [
      { para: 'trancada', rotulo: 'Trancar', revogarPadrao: false },
      { para: 'concluida', rotulo: 'Concluir', revogarPadrao: false, semRevogar: true },
      { para: 'cancelada', rotulo: 'Cancelar matrícula', revogarPadrao: true, perigo: true }
    ],
    trancada: [
      { para: 'ativa', rotulo: 'Destrancar', garantir: true },
      { para: 'cancelada', rotulo: 'Cancelar matrícula', revogarPadrao: true, perigo: true }
    ],
    concluida: [{ para: 'ativa', rotulo: 'Reabrir', garantir: true }],
    cancelada: []
  };
  const POR_PAGINA = 50;

  // ---------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------
  function frag(marcacao) {
    const t = document.createElement('template');
    t.innerHTML = String(marcacao); // marcacao vem SEMPRE de DMC_UI.html (escape)
    return t.content;
  }
  const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const anoSP = () => Number(hojeSP().slice(0, 4));
  let seqId = 0;
  const novoId = (p) => `pf-sec-${p}-${(++seqId).toString(36)}`;

  function dataCurta(ui, iso) {
    if (!iso) return '—';
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [a, m, d] = iso.split('-');
      return `${d}/${m}/${a}`;
    }
    return ui.fmt && ui.fmt.data ? ui.fmt.data(iso) : new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }
  function dataHora(ui, iso) {
    if (!iso) return '—';
    return ui.fmt && ui.fmt.dataHora ? ui.fmt.dataHora(iso) : new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }
  function chipSituacao(ui, status, rotulo) {
    return ui.estado(rotulo || ROTULO_SITUACAO[status] || status || '—', TOM_SITUACAO[status] || 'neutro');
  }
  function chipContrato(ui, m) {
    if (!Object.prototype.hasOwnProperty.call(m, 'contrato') || !m.contrato) return ui.html`<span class="pf-sec-traco">—</span>`;
    return ui.estado(ROTULO_CONTRATO[m.contrato.status] || '—', TOM_CONTRATO[m.contrato.status] || 'neutro');
  }
  function mensagemDeErro(err) {
    return (err && err.message) || 'Não foi possível concluir agora. Tente de novo.';
  }
  function slotDoCabecalho(el, seletor) {
    const vista = el.closest('#pf-prof-vista') || document;
    return vista.querySelector(seletor);
  }
  function rotaRegistrada(rota) {
    try {
      const itens = typeof P.itensDoMenu === 'function' ? P.itensDoMenu('admin') : [];
      return Array.isArray(itens) && itens.some((i) => i.rota === rota && !i.href);
    } catch (_e) {
      return false;
    }
  }
  /** Ações do cabeçalho: no slot da moldura da F8, ou no topo do painel (reserva). */
  function colocarAcoes(el, ui, marcacao) {
    const slot = slotDoCabecalho(el, '[data-pf-prof-acoes]');
    const alvo = slot || (() => {
      const d = document.createElement('div');
      d.className = 'pf-cabecalho__acoes pf-sec-acoes-reserva';
      el.prepend(d);
      return d;
    })();
    alvo.replaceChildren(frag(marcacao));
    return alvo;
  }
  function colocarDescricao(el, texto) {
    const p = slotDoCabecalho(el, '[data-pf-prof-descricao]');
    if (p) { p.textContent = texto; p.hidden = false; }
  }

  /** Cursos (id, titulo, sigla): o catálogo legado (admin vê todos), memorizado. */
  let memoCursos = null;
  function listarCursos(ctx) {
    if (!memoCursos) {
      memoCursos = ctx.api.get(API.catalogo).then((r) => {
        const lista = r && Array.isArray(r.cursos) ? r.cursos : [];
        return lista.map((c) => ({ id: c.id, titulo: c.titulo || c.id, sigla: c.sigla || null }));
      }).catch((err) => {
        memoCursos = null;
        if (Array.isArray(ctx.cursos) && ctx.cursos.length) return ctx.cursos;
        throw err;
      });
    }
    return memoCursos;
  }
  function listarTurmas(ctx, cursoId) {
    const q = cursoId ? `?cursoId=${encodeURIComponent(cursoId)}` : '';
    return ctx.api.get(API.turmas + q).then((r) => (r && Array.isArray(r.itens) ? r.itens : []));
  }

  /** Switch acessível (UX §4.5): button[role=switch][aria-checked]. */
  function htmlSwitch(ui, { nome, rotulo, ligado, ajuda }) {
    const idAjuda = ajuda ? novoId('ajuda') : null;
    return ui.html`<div class="pf-campo pf-sec-campo-switch">
      <button type="button" class="pf-switch" role="switch" aria-checked="${ligado ? 'true' : 'false'}" data-pf-sec-switch="${nome}"${idAjuda ? ui.html` aria-describedby="${idAjuda}"` : ''}>
        <span class="pf-switch__trilho"><span class="pf-switch__botao"></span></span>
        <span class="pf-switch__rotulo">${rotulo}</span>
      </button>
      ${ajuda ? ui.html`<p class="pf-ajuda" id="${idAjuda}">${ajuda}</p>` : ''}
    </div>`;
  }
  function ligarSwitches(raiz) {
    raiz.querySelectorAll('[data-pf-sec-switch]').forEach((b) => {
      b.addEventListener('click', () => b.setAttribute('aria-checked', b.getAttribute('aria-checked') === 'true' ? 'false' : 'true'));
    });
  }
  const switchLigado = (raiz, nome) => {
    const b = raiz.querySelector(`[data-pf-sec-switch="${nome}"]`);
    return !!b && b.getAttribute('aria-checked') === 'true';
  };

  /** Erros de campo do servidor (400 `campos`) ao lado de cada campo. */
  function mostrarErros(form, campos) {
    form.querySelectorAll('[data-pf-sec-erro]').forEach((p) => { p.hidden = true; p.textContent = ''; });
    form.querySelectorAll('[aria-invalid="true"]').forEach((i) => i.removeAttribute('aria-invalid'));
    let primeiro = null;
    Object.entries(campos || {}).forEach(([campo, msg]) => {
      const p = form.querySelector(`[data-pf-sec-erro="${campo}"]`);
      const input = form.querySelector(`[name="${campo}"]`);
      if (p) { p.textContent = String(msg); p.hidden = false; }
      if (input) { input.setAttribute('aria-invalid', 'true'); if (!primeiro) primeiro = input; }
    });
    if (primeiro) primeiro.focus();
    return !!primeiro;
  }
  function htmlCampo(ui, { nome, rotulo, obrigatorio = false, controle, ajuda }) {
    const idErro = novoId('erro');
    return ui.html`<div class="pf-campo">
      <label class="pf-rotulo" for="${`pf-sec-c-${nome}`}">${rotulo}${obrigatorio ? ui.html` <span aria-hidden="true">*</span>` : ''}</label>
      ${controle}
      ${ajuda ? ui.html`<p class="pf-ajuda">${ajuda}</p>` : ''}
      <p class="pf-erro-campo" id="${idErro}" data-pf-sec-erro="${nome}" role="alert" hidden></p>
    </div>`;
  }

  /** CSV no navegador (sem CPF; anti-fórmula), a partir das linhas já carregadas. */
  function baixarCsv(nome, cabecalho, linhas) {
    const celula = (v) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const texto = [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n');
    const blob = new Blob([`﻿${texto}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------------------------------------------------------------
  // Tabela de matrículas (lista principal e aba do aluno)
  // ---------------------------------------------------------------
  function htmlTabela(ui, itens, { selecao = false, selecionadas = new Set(), legenda = 'Matrículas', semAluno = false } = {}) {
    const mostrarContrato = itens.some((m) => Object.prototype.hasOwnProperty.call(m, 'contrato'));
    return ui.html`<table class="pf-tabela pf-sec-tabela">
      <caption>${legenda}</caption>
      <thead><tr>
        ${selecao ? ui.html`<th scope="col" class="pf-tabela__selecao"><span class="dmc-sr-only">Selecionar</span></th>` : ''}
        <th scope="col">Nº</th>
        ${semAluno ? '' : ui.html`<th scope="col">Aluno</th>`}
        <th scope="col">Curso</th>
        <th scope="col">Turma</th>
        <th scope="col">Situação</th>
        <th scope="col" class="pf-tabela__secundaria">Início</th>
        <th scope="col" class="pf-tabela__secundaria">Contrato</th>
        <th scope="col" class="pf-tabela__secundaria">Origem</th>
      </tr></thead>
      <tbody>
        ${itens.map((m) => ui.html`<tr data-pf-sec-linha="${m.id}">
          ${selecao ? ui.html`<td class="pf-tabela__selecao" data-rotulo="Selecionar"><label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" data-pf-sec-sel="${m.id}" data-pf-sec-curso="${m.cursoId}"${selecionadas.has(m.id) ? ' checked' : ''}><span class="dmc-sr-only">${`Selecionar ${m.numero}`}</span></label></td>` : ''}
          <td data-rotulo="Nº" class="pf-sec-nowrap"><a class="pf-sec-numero" href="${`#/matriculas/${m.id}`}">${m.numero}</a></td>
          ${semAluno ? '' : ui.html`<td data-rotulo="Aluno"><span class="pf-sec-aluno">${(m.aluno && m.aluno.nome) || '—'}</span><span class="pf-sec-meta">${(m.aluno && m.aluno.email) || ''}</span></td>`}
          <td data-rotulo="Curso">${m.cursoTitulo || m.cursoId}</td>
          <td data-rotulo="Turma">${m.turma && m.turma.codigo ? m.turma.codigo : ui.html`<span class="pf-sec-meta">Sem turma</span>`}</td>
          <td data-rotulo="Situação">${chipSituacao(ui, m.status, m.statusRotulo)}${m.semAcesso ? ui.html`<span class="pf-sec-meta pf-sec-sem-acesso">Sem acesso aos conteúdos</span>` : ''}</td>
          <td data-rotulo="Início" class="pf-tabela__secundaria pf-sec-nowrap">${dataCurta(ui, m.inicioEm)}</td>
          <td data-rotulo="Contrato" class="pf-tabela__secundaria">${mostrarContrato ? chipContrato(ui, m) : ui.html`<span class="pf-sec-traco">—</span>`}</td>
          <td data-rotulo="Origem" class="pf-tabela__secundaria pf-sec-origem">${m.origemRotulo || ROTULO_ORIGEM[m.origem] || '—'}</td>
        </tr>`)}
      </tbody>
    </table>`;
  }

  // ---------------------------------------------------------------
  // #/matriculas
  // ---------------------------------------------------------------
  function montarMatriculas(el, ctx) {
    const ui = ctx.ui;
    const f = ctx.filtros;
    const est = {
      aba: f.get('aba') === 'sem-matricula' ? 'sem' : 'lista',
      status: SITUACOES.some((s) => s.valor === f.get('status')) ? f.get('status') : 'ativa',
      curso: f.get('curso') || '',
      turma: f.get('turma') || '',
      origem: ORIGENS.some((o) => o.valor === f.get('origem')) ? f.get('origem') : '',
      q: f.get('q') || '',
      pagina: 1,
      itens: [],
      total: 0,
      selecionadas: new Set(),
      cursos: [],
      turmas: [],
      vivo: true
    };

    colocarDescricao(el, 'A matrícula registra o vínculo acadêmico; o acesso aos conteúdos continua sendo a liberação do curso.');
    const acoes = colocarAcoes(el, ui, ui.html`<button type="button" class="dmc-btn dmc-btn--primary" data-pf-sec-acao="nova">Nova matrícula</button>
      <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-sec-acao="conceder">Conceder acesso</button>`);

    el.replaceChildren(frag(ui.html`<div class="pf-sec-painel-lateral" data-pf-sec-painel hidden></div>
      <div class="pf-abas pf-sec-abas" role="tablist" aria-label="Matrículas">
        <button type="button" class="pf-abas__aba" role="tab" id="pf-sec-aba-lista" aria-controls="pf-sec-lista" aria-selected="${est.aba === 'lista' ? 'true' : 'false'}" tabindex="${est.aba === 'lista' ? '0' : '-1'}" data-pf-sec-aba="lista">Matrículas</button>
        <button type="button" class="pf-abas__aba" role="tab" id="pf-sec-aba-sem" aria-controls="pf-sec-sem" aria-selected="${est.aba === 'sem' ? 'true' : 'false'}" tabindex="${est.aba === 'sem' ? '0' : '-1'}" data-pf-sec-aba="sem">Acessos sem matrícula <span class="pf-abas__contador" data-pf-sec-contador></span></button>
      </div>
      <section class="pf-abas__painel" role="tabpanel" id="pf-sec-lista" aria-labelledby="pf-sec-aba-lista" data-pf-sec-lista${est.aba === 'lista' ? '' : ' hidden'}></section>
      <section class="pf-abas__painel" role="tabpanel" id="pf-sec-sem" aria-labelledby="pf-sec-aba-sem" data-pf-sec-sem${est.aba === 'sem' ? '' : ' hidden'}></section>`));

    const painelLateral = el.querySelector('[data-pf-sec-painel]');
    const secLista = el.querySelector('[data-pf-sec-lista]');
    const secSem = el.querySelector('[data-pf-sec-sem]');

    function filtrosAtuais(extra) {
      const q = new URLSearchParams();
      const v = Object.assign({ aba: est.aba, status: est.status, curso: est.curso, turma: est.turma, origem: est.origem, q: est.q }, extra || {});
      if (v.aba === 'sem') q.set('aba', 'sem-matricula');
      if (v.status && v.status !== 'ativa') q.set('status', v.status);
      if (v.curso) q.set('curso', v.curso);
      if (v.turma) q.set('turma', v.turma);
      if (v.origem) q.set('origem', v.origem);
      if (v.q) q.set('q', v.q);
      return q;
    }
    function lembrarFiltros() {
      const alvo = `#/matriculas${filtrosAtuais().toString() ? `?${filtrosAtuais().toString()}` : ''}`;
      try { window.history.replaceState(null, '', alvo); } catch (_e) { /* sem histórico */ }
    }

    // ---------- abas ----------
    el.querySelectorAll('[data-pf-sec-aba]').forEach((b) => {
      b.addEventListener('click', () => trocarAba(b.getAttribute('data-pf-sec-aba')));
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const outra = b.getAttribute('data-pf-sec-aba') === 'lista' ? 'sem' : 'lista';
        trocarAba(outra);
        el.querySelector(`[data-pf-sec-aba="${outra}"]`).focus();
      });
    });
    function trocarAba(aba) {
      est.aba = aba;
      el.querySelectorAll('[data-pf-sec-aba]').forEach((b) => {
        const ativa = b.getAttribute('data-pf-sec-aba') === aba;
        b.setAttribute('aria-selected', ativa ? 'true' : 'false');
        b.tabIndex = ativa ? 0 : -1;
      });
      secLista.hidden = aba !== 'lista';
      secSem.hidden = aba !== 'sem';
      lembrarFiltros();
      if (aba === 'sem') carregarSemMatricula();
    }

    // ---------- lista ----------
    function htmlFiltros() {
      return ui.html`<div class="pf-sec-filtros">
        <div class="pf-segmento" role="group" aria-label="Situação da matrícula">
          ${SITUACOES.map((s) => ui.html`<button type="button" class="pf-segmento__opcao" aria-pressed="${s.valor === est.status ? 'true' : 'false'}" data-pf-sec-status="${s.valor}">${s.rotulo}</button>`)}
        </div>
        <div class="pf-sec-filtros__linha">
          <div class="pf-campo"><label class="pf-rotulo" for="pf-sec-f-curso">Curso</label>
            <select class="pf-input" id="pf-sec-f-curso" data-pf-sec-f="curso"><option value="">Todos os cursos</option>
              ${est.cursos.map((c) => ui.html`<option value="${c.id}"${c.id === est.curso ? ' selected' : ''}>${c.titulo}</option>`)}
            </select></div>
          <div class="pf-campo"><label class="pf-rotulo" for="pf-sec-f-turma">Turma</label>
            <select class="pf-input" id="pf-sec-f-turma" data-pf-sec-f="turma"><option value="">Todas</option>
              <option value="sem-turma"${est.turma === 'sem-turma' ? ' selected' : ''}>Sem turma</option>
              ${est.turmas.map((t) => ui.html`<option value="${t.id}"${t.id === est.turma ? ' selected' : ''}>${t.codigo}</option>`)}
            </select></div>
          <div class="pf-campo"><label class="pf-rotulo" for="pf-sec-f-origem">Origem</label>
            <select class="pf-input" id="pf-sec-f-origem" data-pf-sec-f="origem"><option value="">Todas</option>
              ${ORIGENS.map((o) => ui.html`<option value="${o.valor}"${o.valor === est.origem ? ' selected' : ''}>${o.rotulo}</option>`)}
            </select></div>
          <form class="pf-campo pf-sec-busca" role="search" data-pf-sec-busca>
            <label class="pf-rotulo" for="pf-sec-f-q">Buscar</label>
            <input class="pf-input" type="search" id="pf-sec-f-q" name="q" value="${est.q}" placeholder="Nome, e-mail ou nº da matrícula" autocomplete="off">
          </form>
        </div>
      </div>
      <div class="pf-sec-massa" data-pf-sec-massa>
        <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-sec-acao="enturmar" disabled>Enturmar</button>
        <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-sec-acao="csv">Exportar CSV</button>
        <p class="pf-sec-meta" data-pf-sec-massa-aviso role="status"></p>
      </div>
      <div data-pf-sec-tabela></div>
      <p class="pf-sec-meta" data-pf-sec-contagem role="status"></p>
      <div class="pf-sec-mais" data-pf-sec-mais hidden><button type="button" class="dmc-btn dmc-btn--secondary" data-pf-sec-acao="mais">Carregar mais</button></div>`;
    }

    function desenharLista() {
      secLista.replaceChildren(frag(htmlFiltros()));
      secLista.querySelectorAll('[data-pf-sec-status]').forEach((b) => b.addEventListener('click', () => {
        est.status = b.getAttribute('data-pf-sec-status');
        secLista.querySelectorAll('[data-pf-sec-status]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        recarregar();
      }));
      secLista.querySelectorAll('[data-pf-sec-f]').forEach((s) => s.addEventListener('change', async () => {
        const campo = s.getAttribute('data-pf-sec-f');
        est[campo] = s.value;
        if (campo === 'curso') {
          est.turma = '';
          est.turmas = est.curso ? await listarTurmas(ctx, est.curso).catch(() => []) : [];
          const sel = secLista.querySelector('[data-pf-sec-f="turma"]');
          sel.replaceChildren(frag(ui.html`<option value="">Todas</option><option value="sem-turma">Sem turma</option>${est.turmas.map((t) => ui.html`<option value="${t.id}">${t.codigo}</option>`)}`));
        }
        recarregar();
      }));
      secLista.querySelector('[data-pf-sec-busca]').addEventListener('submit', (e) => {
        e.preventDefault();
        est.q = secLista.querySelector('#pf-sec-f-q').value.trim();
        recarregar();
      });
      secLista.querySelector('[data-pf-sec-acao="mais"]').addEventListener('click', () => carregar(est.pagina + 1));
      secLista.querySelector('[data-pf-sec-acao="enturmar"]').addEventListener('click', enturmarSelecionadas);
      secLista.querySelector('[data-pf-sec-acao="csv"]').addEventListener('click', exportar);
    }

    function consulta(pagina) {
      const q = new URLSearchParams();
      if (est.status && est.status !== 'todas') q.set('status', est.status);
      if (est.curso) q.set('cursoId', est.curso);
      if (est.turma) q.set('turmaId', est.turma);
      if (est.origem) q.set('origem', est.origem);
      if (est.q) q.set('q', est.q);
      q.set('pagina', String(pagina));
      q.set('porPagina', String(POR_PAGINA));
      return `${API.matriculas}?${q.toString()}`;
    }

    async function carregar(pagina) {
      const alvo = secLista.querySelector('[data-pf-sec-tabela]');
      if (pagina === 1) ui.esqueleto(alvo, { tipo: 'tabela', linhas: 4 });
      try {
        const r = await ctx.api.get(consulta(pagina), { sinal: ctx.sinal });
        if (!est.vivo) return;
        est.pagina = pagina;
        est.total = r.total || 0;
        est.itens = pagina === 1 ? r.itens : est.itens.concat(r.itens);
        alvo.removeAttribute('aria-busy');
        if (!est.itens.length) {
          ui.estadoVazio(alvo, {
            titulo: est.q || est.curso || est.turma || est.origem || est.status !== 'ativa' ? 'Nenhuma matrícula com estes filtros.' : 'Nenhuma matrícula ativa ainda.',
            texto: 'Matrículas nascem da liberação de acesso, da Nova matrícula ou de "Gerar matrículas a partir das liberações".'
          });
        } else {
          alvo.replaceChildren(frag(htmlTabela(ui, est.itens, { selecao: true, selecionadas: est.selecionadas, legenda: `Matrículas (${est.total})` })));
          alvo.querySelectorAll('[data-pf-sec-sel]').forEach((c) => c.addEventListener('change', () => {
            const id = c.getAttribute('data-pf-sec-sel');
            if (c.checked) est.selecionadas.add(id); else est.selecionadas.delete(id);
            atualizarMassa();
          }));
        }
        secLista.querySelector('[data-pf-sec-contagem]').textContent = est.itens.length
          ? `Mostrando ${est.itens.length} de ${est.total}.` : '';
        secLista.querySelector('[data-pf-sec-mais]').hidden = est.itens.length >= est.total;
        atualizarMassa();
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        ui.erroCarga(alvo, err, { tentarDeNovo: () => carregar(1) });
      }
    }
    function recarregar() {
      est.selecionadas.clear();
      lembrarFiltros();
      carregar(1);
    }

    function atualizarMassa() {
      const b = secLista.querySelector('[data-pf-sec-acao="enturmar"]');
      const aviso = secLista.querySelector('[data-pf-sec-massa-aviso]');
      if (!b) return;
      const cursos = new Set(est.itens.filter((m) => est.selecionadas.has(m.id)).map((m) => m.cursoId));
      b.disabled = est.selecionadas.size === 0 || cursos.size !== 1;
      aviso.textContent = cursos.size > 1 ? 'Selecione matrículas de um único curso.' : (est.selecionadas.size ? `${est.selecionadas.size} selecionada(s).` : '');
    }

    async function enturmarSelecionadas() {
      const selecionadas = est.itens.filter((m) => est.selecionadas.has(m.id));
      const cursoId = selecionadas.length ? selecionadas[0].cursoId : null;
      if (!cursoId) return;
      let turmas;
      try { turmas = (await listarTurmas(ctx, cursoId)).filter((t) => t.status !== 'encerrada'); } catch (err) { ui.toast(mensagemDeErro(err), { tipo: 'erro' }); return; }
      if (!turmas.length) {
        ui.toast('Este curso ainda não tem turma aberta. Crie a turma em Nova turma.', { tipo: 'aviso' });
        return;
      }
      const idSel = novoId('turma');
      const escolha = await ui.dialogo({
        titulo: 'Enturmar matrículas',
        conteudo: frag(ui.html`<p>${`${selecionadas.length} matrícula(s) de ${selecionadas[0].cursoTitulo || 'um curso'}.`}</p>
          <div class="pf-campo"><label class="pf-rotulo" for="${idSel}">Turma</label>
          <select class="pf-input" id="${idSel}" data-pf-sec-turma-lote>${turmas.map((t) => ui.html`<option value="${t.id}">${`${t.codigo}${t.nome ? ` · ${t.nome}` : ''}`}</option>`)}</select></div>`),
        acoes: [
          { rotulo: 'Cancelar', valor: null, tipo: 'secundario', acao: 'cancelar' },
          { rotulo: 'Enturmar', valor: 'ok', tipo: 'primario', acao: 'confirmar' }
        ],
        aoAbrir: (dlg) => { const s = dlg.querySelector('[data-pf-sec-turma-lote]'); if (s) s.addEventListener('change', () => { escolhida = s.value; }); escolhida = s ? s.value : null; }
      });
      if (escolha !== 'ok' || !escolhida) return;
      try {
        const r = await ctx.api.post(API.turmaMatriculas(escolhida), { matriculaIds: selecionadas.map((m) => m.id) });
        const ign = Array.isArray(r.ignoradas) ? r.ignoradas.length : 0;
        ui.toast(`${r.enturmadas} matrícula(s) enturmada(s)${ign ? ` · ${ign} não couberam` : ''}.`, { tipo: ign ? 'aviso' : 'sucesso' });
        recarregar();
      } catch (err) {
        ui.toast(mensagemDeErro(err), { tipo: 'erro' });
      }
    }
    let escolhida = null;

    async function exportar() {
      const linhas = [];
      try {
        let pagina = 1;
        let total = Infinity;
        while (linhas.length < total && pagina <= 40) {
          const r = await ctx.api.get(consulta(pagina).replace(`porPagina=${POR_PAGINA}`, 'porPagina=100'));
          total = r.total || 0;
          (r.itens || []).forEach((m) => linhas.push([
            m.numero, (m.aluno && m.aluno.nome) || '', (m.aluno && m.aluno.email) || '', m.cursoTitulo || m.cursoId,
            (m.turma && m.turma.codigo) || 'Sem turma', m.statusRotulo || ROTULO_SITUACAO[m.status] || m.status,
            m.inicioEm ? dataCurta(ui, m.inicioEm) : '', m.contrato ? (ROTULO_CONTRATO[m.contrato.status] || '') : '',
            m.origemRotulo || ROTULO_ORIGEM[m.origem] || '', m.semAcesso ? 'não' : 'sim'
          ]));
          if (!r.itens || !r.itens.length) break;
          pagina++;
        }
      } catch (err) {
        ui.toast(mensagemDeErro(err), { tipo: 'erro' });
        return;
      }
      baixarCsv(`matriculas-${hojeSP()}.csv`, ['Nº', 'Aluno', 'E-mail', 'Curso', 'Turma', 'Situação', 'Início', 'Contrato', 'Origem', 'Acesso aos conteúdos'], linhas);
      ui.anunciar(`${linhas.length} matrícula(s) exportada(s).`);
    }

    // ---------- acessos sem matrícula (L7) ----------
    async function carregarSemMatricula(pagina = 1) {
      secSem.replaceChildren(frag(ui.html`<p class="pf-sec-texto">Liberações antigas ganham matrícula automaticamente na primeira leitura do aluno. Para gerar todas agora:</p>
        <p><button type="button" class="dmc-btn dmc-btn--secondary" data-pf-sec-acao="sincronizar">Gerar matrículas a partir das liberações</button></p>
        <p class="pf-sec-resultado" role="status" data-pf-sec-resultado></p>
        <div data-pf-sec-sem-lista></div>`));
      secSem.querySelector('[data-pf-sec-acao="sincronizar"]').addEventListener('click', sincronizar);
      const alvo = secSem.querySelector('[data-pf-sec-sem-lista]');
      ui.esqueleto(alvo, { tipo: 'lista', linhas: 3 });
      try {
        const r = await ctx.api.get(`${API.semMatricula}?pagina=${pagina}`, { sinal: ctx.sinal, silencioso404: true });
        if (!est.vivo) return;
        alvo.removeAttribute('aria-busy');
        if (!r) { alvo.replaceChildren(); return; }
        const cont = el.querySelector('[data-pf-sec-contador]');
        if (cont) cont.textContent = `(${r.total})`;
        if (!r.itens.length) {
          ui.estadoVazio(alvo, { titulo: 'Todas as liberações já têm matrícula.' });
          return;
        }
        alvo.replaceChildren(frag(ui.html`<table class="pf-tabela pf-sec-tabela"><caption>${`Liberações sem matrícula (${r.total})`}</caption>
          <thead><tr><th scope="col">Aluno</th><th scope="col">Curso</th><th scope="col">Liberado em</th></tr></thead>
          <tbody>${r.itens.map((l) => ui.html`<tr><td data-rotulo="Aluno"><span class="pf-sec-aluno">${l.aluno.nome || '—'}</span><span class="pf-sec-meta">${l.aluno.email || ''}</span></td><td data-rotulo="Curso">${l.cursoTitulo || l.cursoId}</td><td data-rotulo="Liberado em">${dataCurta(ui, l.liberadoEm)}</td></tr>`)}</tbody></table>`));
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        ui.erroCarga(alvo, err, { tentarDeNovo: () => carregarSemMatricula(pagina) });
      }
    }
    async function sincronizar(e) {
      const botao = e.currentTarget;
      const ok = await ui.confirmar({
        titulo: 'Gerar matrículas a partir das liberações',
        texto: 'Cada liberação sem matrícula ganha uma matrícula (origem Migração). O acesso dos alunos não muda.',
        rotuloConfirmar: 'Gerar matrículas'
      });
      if (!ok) return;
      ui.ocupado(botao, true, 'Gerando…');
      try {
        const r = await ctx.api.post(API.sincronizar, {});
        const saida = secSem.querySelector('[data-pf-sec-resultado]');
        const texto = `${r.criadas} criada(s) · ${r.jaExistiam} já existiam`;
        await carregarSemMatricula();
        secSem.querySelector('[data-pf-sec-resultado]').textContent = texto;
        if (saida && !saida.isConnected) ui.anunciar(texto);
        carregar(1);
      } catch (err) {
        ui.toast(mensagemDeErro(err), { tipo: 'erro' });
      } finally {
        if (botao.isConnected) ui.ocupado(botao, false);
      }
    }

    // ---------- painéis (Nova matrícula · Conceder acesso) ----------
    function fecharPainel() {
      painelLateral.hidden = true;
      painelLateral.replaceChildren();
    }
    function abrirPainel(marcacao) {
      painelLateral.replaceChildren(frag(marcacao));
      painelLateral.hidden = false;
      const h = painelLateral.querySelector('h2');
      if (h) { h.tabIndex = -1; h.focus(); }
      painelLateral.querySelectorAll('[data-pf-sec-fechar]').forEach((b) => b.addEventListener('click', fecharPainel));
    }

    function abrirNova(previa) {
      const p = previa || {};
      const doPedido = !!p.protocolo;
      abrirPainel(ui.html`<section class="pf-detalhe pf-sec-detalhe" aria-labelledby="pf-sec-nova-titulo">
        <div class="pf-detalhe__cabeca"><h2 id="pf-sec-nova-titulo">Nova matrícula</h2>
          <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-sec-fechar>Fechar</button></div>
        <form class="pf-detalhe__corpo" data-pf-sec-form="nova" novalidate>
          ${doPedido ? ui.html`<p class="pf-sec-texto">${`Pedido ${p.protocolo}`}</p>` : ''}
          ${htmlCampo(ui, { nome: 'email', rotulo: 'E-mail do aluno', obrigatorio: true, ajuda: 'A conta precisa existir: o aluno se cadastra na tela de entrada.', controle: ui.html`<input class="pf-input" type="email" id="pf-sec-c-email" name="email" autocomplete="off" required value="${p.email || ''}">` })}
          ${htmlCampo(ui, { nome: 'cursoId', rotulo: 'Curso', obrigatorio: true, controle: ui.html`<select class="pf-input" id="pf-sec-c-cursoId" name="cursoId" required><option value="">Escolha o curso</option>${est.cursos.map((c) => ui.html`<option value="${c.id}"${c.id === p.curso ? ' selected' : ''}>${c.titulo}</option>`)}</select>` })}
          ${htmlCampo(ui, { nome: 'turmaId', rotulo: 'Turma', controle: ui.html`<select class="pf-input" id="pf-sec-c-turmaId" name="turmaId"><option value="">Sem turma por enquanto</option></select>` })}
          ${htmlCampo(ui, { nome: 'inicioEm', rotulo: 'Data de início', obrigatorio: true, controle: ui.html`<input class="pf-input" type="date" id="pf-sec-c-inicioEm" name="inicioEm" required value="${hojeSP()}">` })}
          ${htmlSwitch(ui, { nome: 'liberarAcesso', rotulo: 'Liberar o acesso aos conteúdos agora', ligado: !doPedido, ajuda: doPedido ? 'O pedido informa ao aluno que o acesso é liberado depois da confirmação do pagamento.' : null })}
          ${rotaRegistrada('contratos') ? htmlSwitch(ui, { nome: 'anexarContrato', rotulo: 'Anexar contrato agora', ligado: false }) : ''}
          <div data-pf-sec-confirmacao hidden></div>
          <div class="pf-detalhe__acoes">
            <button type="submit" class="dmc-btn dmc-btn--primary" data-pf-sec-enviar>Matricular</button>
            <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-sec-fechar>Cancelar</button>
          </div>
        </form>
      </section>`);
      const form = painelLateral.querySelector('[data-pf-sec-form="nova"]');
      ligarSwitches(form);
      const selCurso = form.querySelector('[name="cursoId"]');
      const selTurma = form.querySelector('[name="turmaId"]');
      async function preencherTurmas() {
        selTurma.replaceChildren(frag(ui.html`<option value="">Sem turma por enquanto</option>`));
        if (!selCurso.value) return;
        const ts = (await listarTurmas(ctx, selCurso.value).catch(() => [])).filter((t) => t.status !== 'encerrada');
        selTurma.append(frag(ui.html`${ts.map((t) => ui.html`<option value="${t.id}">${`${t.codigo}${t.nome ? ` · ${t.nome}` : ''}`}</option>`)}`));
      }
      selCurso.addEventListener('change', preencherTurmas);
      if (selCurso.value) preencherTurmas();
      let semVerificacao = false;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const botao = form.querySelector('[data-pf-sec-enviar]');
        const valores = {
          email: form.email.value.trim(),
          cursoId: selCurso.value,
          inicioEm: form.inicioEm.value || undefined,
          liberarAcesso: switchLigado(form, 'liberarAcesso')
        };
        if (selTurma.value) valores.turmaId = selTurma.value;
        const erros = {};
        if (!valores.email) erros.email = 'Informe o e-mail do aluno.';
        if (!valores.cursoId) erros.cursoId = 'Escolha o curso.';
        if (semVerificacao) {
          const motivo = (form.querySelector('[name="motivo"]') || {}).value || '';
          if (motivo.trim().length < 10 || motivo.trim().length > 500) erros.motivo = 'Escreva o motivo (10 a 500 caracteres).';
          valores.confirmarSemVerificacao = true;
          valores.motivo = motivo.trim();
        }
        if (mostrarErros(form, erros)) return;
        ui.ocupado(botao, true, 'Matriculando…');
        try {
          const r = await ctx.api.post(API.matriculas, valores);
          ui.toast(`Matrícula ${r.matricula.numero} criada.`, { tipo: 'sucesso' });
          const anexar = switchLigado(form, 'anexarContrato');
          fecharPainel();
          if (anexar) { ctx.navegar('contratos', { nova: '1', matricula: r.matricula.id }); return; }
          // Vindo de um pedido da loja: segue para o lançamento (UX §7.14 → §7.18), se a tela existir.
          if (doPedido && rotaRegistrada('financeiro')) { ctx.navegar('financeiro', { nova: '1', matricula: r.matricula.id, protocolo: p.protocolo }); return; }
          recarregar();
        } catch (err) {
          tratarErroNova(form, err);
        } finally {
          if (botao.isConnected) {
            ui.ocupado(botao, false);
            if (semVerificacao) botao.textContent = 'Matricular assim mesmo';
          }
        }
      });
      function tratarErroNova(f2, err) {
        const caixa = f2.querySelector('[data-pf-sec-confirmacao]');
        if (err && err.codigo === 'matricula-vigente-existe') {
          caixa.hidden = false;
          caixa.replaceChildren(frag(ui.html`<div class="pf-alerta pf-alerta--aviso" role="alert"><p class="pf-alerta__titulo">Este aluno já tem matrícula vigente neste curso.</p>
            <p><a href="${`#/matriculas/${(err.dados && err.dados.matriculaId) || ''}`}">Abrir matrícula</a></p></div>`));
          return;
        }
        if (err && err.codigo === 'email-nao-verificado') {
          semVerificacao = true;
          const conta = (err.dados && err.dados.conta) || {};
          caixa.hidden = false;
          caixa.replaceChildren(frag(ui.html`<div class="pf-alerta pf-alerta--aviso" role="alert">
              <p class="pf-alerta__titulo">Esta conta ainda não confirmou o e-mail.</p>
              <p>${`Conta criada em ${dataCurta(ui, conta.criadaEm)} · último acesso ${conta.ultimoLoginEm ? dataCurta(ui, conta.ultimoLoginEm) : '—'}.`}</p>
            </div>
            ${htmlCampo(ui, { nome: 'motivo', rotulo: 'Motivo (fica registrado na auditoria)', obrigatorio: true, controle: ui.html`<textarea class="pf-input" id="pf-sec-c-motivo" name="motivo" rows="3" minlength="10" maxlength="500" required></textarea>` })}`));
          f2.querySelector('[name="motivo"]').focus();
          return;
        }
        if (err && err.campos && mostrarErros(f2, err.campos)) return;
        if (err && err.status === 404) { mostrarErros(f2, { email: mensagemDeErro(err) }); return; }
        ui.toast(mensagemDeErro(err), { tipo: 'erro' });
      }
    }

    function abrirConceder(previa) {
      const p = previa || {};
      abrirPainel(ui.html`<section class="pf-detalhe pf-sec-detalhe" aria-labelledby="pf-sec-conceder-titulo">
        <div class="pf-detalhe__cabeca"><h2 id="pf-sec-conceder-titulo">Conceder acesso</h2>
          <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-sec-fechar>Fechar</button></div>
        <form class="pf-detalhe__corpo" data-pf-sec-form="conceder" novalidate>
          <p class="pf-ajuda">A liberação dá acesso aos conteúdos; a matrícula do curso é criada junto (ou ligada à que já existe).</p>
          ${htmlCampo(ui, { nome: 'email', rotulo: 'E-mail do aluno', obrigatorio: true, controle: ui.html`<input class="pf-input" type="email" id="pf-sec-c-email" name="email" autocomplete="off" required value="${p.email || ''}">` })}
          <fieldset class="pf-grupo"><legend>Cursos</legend>
            ${est.cursos.map((c) => ui.html`<label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" name="cursoIds" value="${c.id}"${c.id === p.curso ? ' checked' : ''}><span>${c.titulo}</span></label>`)}
            <p class="pf-erro-campo" data-pf-sec-erro="cursoIds" role="alert" hidden></p>
          </fieldset>
          <div class="pf-detalhe__acoes">
            <button type="submit" class="dmc-btn dmc-btn--primary" data-pf-sec-enviar>Liberar acesso</button>
            <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-sec-fechar>Cancelar</button>
          </div>
        </form>
      </section>`);
      const form = painelLateral.querySelector('[data-pf-sec-form="conceder"]');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = form.email.value.trim();
        const cursoIds = Array.from(form.querySelectorAll('[name="cursoIds"]:checked')).map((c) => c.value);
        const erros = {};
        if (!email) erros.email = 'Informe o e-mail do aluno.';
        if (!cursoIds.length) erros.cursoIds = 'Selecione ao menos um curso.';
        if (mostrarErros(form, erros)) return;
        const botao = form.querySelector('[data-pf-sec-enviar]');
        ui.ocupado(botao, true, 'Liberando…');
        try {
          const r = await ctx.api.post(API.liberacoes, { email, cursoIds });
          ui.toast(`Acesso liberado em ${r.liberados} curso(s).`, { tipo: 'sucesso' });
          fecharPainel();
          recarregar();
        } catch (err) {
          if (err && err.status === 404) mostrarErros(form, { email: mensagemDeErro(err) });
          else if (err && err.status === 400) ui.toast(mensagemDeErro(err), { tipo: 'erro' });
          else ui.toast(mensagemDeErro(err), { tipo: 'erro' });
        } finally {
          if (botao.isConnected) ui.ocupado(botao, false);
        }
      });
    }

    acoes.querySelector('[data-pf-sec-acao="nova"]').addEventListener('click', () => abrirNova());
    acoes.querySelector('[data-pf-sec-acao="conceder"]').addEventListener('click', () => abrirConceder());

    // ---------- início ----------
    (async () => {
      try {
        est.cursos = await listarCursos(ctx);
      } catch (_err) {
        est.cursos = [];
      }
      if (!est.vivo) return;
      if (est.curso) est.turmas = await listarTurmas(ctx, est.curso).catch(() => []);
      desenharLista();
      if (est.aba === 'sem') carregarSemMatricula();
      carregar(1);
      if (f.get('nova') === '1') abrirNova({ email: f.get('email') || '', curso: f.get('curso') || '', protocolo: f.get('protocolo') || '' });
      else if (f.get('conceder') === '1') abrirConceder({ email: f.get('email') || '', curso: f.get('curso') || '' });
      ctx.api.get(`${API.semMatricula}?porPagina=1`, { silencioso404: true }).then((r) => {
        const cont = el.querySelector('[data-pf-sec-contador]');
        if (r && cont && est.vivo) cont.textContent = `(${r.total})`;
      }).catch(() => {});
    })();

    return { destruir() { est.vivo = false; } };
  }

  // ---------------------------------------------------------------
  // #/matriculas/:id
  // ---------------------------------------------------------------
  async function montarDetalhe(el, ctx) {
    const ui = ctx.ui;
    const id = ctx.params.id;
    let vivo = true;
    ui.esqueleto(el, { tipo: 'texto', linhas: 6 });
    let m;
    async function ler() {
      const r = await ctx.api.get(API.matricula(id), { sinal: ctx.sinal });
      return r.matricula;
    }
    m = await ler();
    if (!vivo) return undefined;

    /** Resumo acadêmico (academico.resumoMatricula da F3a; ausente → o bloco não aparece). */
    function htmlResumo(rs) {
      const k = rs.kpis || {};
      const mods = k.modulos || null;
      const ch = k.cargaHoraria || null;
      const nota = (n) => (ui.fmt && ui.fmt.nota ? ui.fmt.nota(n) : (Number.isFinite(n) ? String(n) : '—'));
      const pct = (n) => (ui.fmt && ui.fmt.pct ? ui.fmt.pct(n) : (Number.isFinite(n) ? `${n}%` : '—'));
      const horas = (n) => (Number.isFinite(n) ? `${String(n).replace('.', ',')} h` : '—');
      const situacao = rs.matricula && rs.matricula.situacaoRotulo ? rs.matricula.situacaoRotulo : null;
      return ui.html`<section class="pf-sec-bloco" aria-labelledby="pf-sec-resumo"><h2 class="pf-sec-subtitulo" id="pf-sec-resumo">Resumo acadêmico</h2>
        <dl class="pf-sec-dados">
          ${situacao ? ui.html`<div><dt>Situação acadêmica</dt><dd>${situacao}</dd></div>` : ''}
          <div><dt>Média parcial</dt><dd>${nota(k.mediaParcial)}${Number.isFinite(rs.notaMinima) ? ui.html` <span class="pf-sec-meta">${`mínima ${nota(rs.notaMinima)}`}</span>` : ''}</dd></div>
          <div><dt>Frequência</dt><dd>${pct(k.frequenciaGeralPct)}</dd></div>
          ${mods && Number.isFinite(mods.total) ? ui.html`<div><dt>Módulos aprovados</dt><dd>${`${mods.aprovados ?? 0} de ${mods.total}`}</dd></div>` : ''}
          ${ch ? ui.html`<div><dt>Carga horária cumprida</dt><dd>${`${horas(ch.cumpridaHoras)} de ${horas(ch.totalHoras)}`}</dd></div>` : ''}
          ${rs.certificado ? ui.html`<div><dt>Certificado</dt><dd>${rs.certificado.emitido ? `Emitido${rs.certificado.codigo ? ` · ${rs.certificado.codigo}` : ''}` : (rs.certificado.elegivel ? 'Elegível, ainda não emitido' : 'Ainda não elegível')}</dd></div>` : ''}
        </dl>
        ${Array.isArray(rs.pendencias) && rs.pendencias.length ? ui.html`<ul class="pf-sec-pendencias">${rs.pendencias.map((pd) => ui.html`<li>${pd.texto}</li>`)}</ul>` : ''}
      </section>`;
    }

    function desenhar() {
      ctx.definirTitulo(m.numero);
      colocarDescricao(el, [m.aluno && m.aluno.nome, m.cursoTitulo].filter(Boolean).join(' · '));
      const acoesStatus = ACOES_STATUS[m.status] || [];
      colocarAcoes(el, ui, ui.html`
        ${m.status === 'ativa' || m.status === 'trancada' ? ui.html`<button type="button" class="dmc-btn dmc-btn--primary" data-pf-sec-acao="turma">${m.turma ? 'Trocar turma' : 'Enturmar'}</button>` : ''}
        ${acoesStatus.map((a) => ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-sec-status="${a.para}">${a.rotulo}</button>`)}`);
      const contrato = Object.prototype.hasOwnProperty.call(m, 'contrato');
      const resumo = m.resumo && typeof m.resumo === 'object' ? m.resumo : null;
      el.replaceChildren(frag(ui.html`<p class="pf-sec-voltar"><a href="#/matriculas">← Matrículas</a></p>
        ${m.semAcesso ? ui.html`<div class="pf-alerta pf-alerta--aviso" role="status"><p class="pf-alerta__titulo">Sem acesso aos conteúdos</p><p>A liberação deste curso foi revogada. A matrícula continua registrada até a coordenação decidir.</p><p><button type="button" class="dmc-btn dmc-btn--secondary" data-pf-sec-acao="liberar">Liberar acesso</button></p></div>` : ''}
        <section class="pf-sec-bloco" aria-labelledby="pf-sec-dados">
          <h2 class="pf-sec-subtitulo" id="pf-sec-dados">Dados da matrícula</h2>
          <dl class="pf-sec-dados">
            <div><dt>Nº</dt><dd>${ui.codigo ? ui.codigo(m.numero, { curto: true }) : m.numero}</dd></div>
            <div><dt>Aluno</dt><dd>${(m.aluno && m.aluno.nome) || '—'} <span class="pf-sec-meta">${(m.aluno && m.aluno.email) || ''}</span></dd></div>
            <div><dt>Curso</dt><dd>${m.cursoTitulo || m.cursoId}</dd></div>
            <div><dt>Turma</dt><dd>${m.turma && m.turma.codigo ? m.turma.codigo : 'Sem turma'}</dd></div>
            <div><dt>Situação</dt><dd>${chipSituacao(ui, m.status, m.statusRotulo)}</dd></div>
            <div><dt>Início</dt><dd>${dataCurta(ui, m.inicioEm)} <button type="button" class="pf-sec-link" data-pf-sec-acao="inicio">Corrigir</button></dd></div>
            <div><dt>Origem</dt><dd>${m.origemRotulo || ROTULO_ORIGEM[m.origem] || '—'}</dd></div>
            <div><dt>Nome nos documentos</dt><dd>${m.nomeEmDocumentos && m.nomeEmDocumentos.usar === 'social' ? 'Nome social' : 'Nome de registro'} <button type="button" class="pf-sec-link" data-pf-sec-acao="nome">Alterar</button></dd></div>
            ${contrato ? ui.html`<div><dt>Contrato</dt><dd>${chipContrato(ui, m)}</dd></div>` : ''}
            ${m.certificadoCodigo ? ui.html`<div><dt>Certificado</dt><dd>${m.certificadoCodigo}</dd></div>` : ''}
          </dl>
        </section>
        ${resumo ? htmlResumo(resumo) : ''}
        <section class="pf-sec-bloco" aria-labelledby="pf-sec-hist">
          <h2 class="pf-sec-subtitulo" id="pf-sec-hist">Histórico de situação</h2>
          <ol class="pf-sec-historico">${(m.historico || []).slice().reverse().map((h) => ui.html`<li><span class="pf-sec-historico__quando">${dataHora(ui, h.em)}</span> ${chipSituacao(ui, h.status)}${h.motivo ? ui.html`<span class="pf-sec-historico__motivo">${h.motivo}</span>` : ''}</li>`)}</ol>
        </section>
        <section class="pf-sec-bloco" aria-labelledby="pf-sec-ent">
          <h2 class="pf-sec-subtitulo" id="pf-sec-ent">Turmas</h2>
          ${(m.enturmacoes || []).length
            ? ui.html`<ol class="pf-sec-historico">${m.enturmacoes.slice().reverse().map((e) => ui.html`<li><strong>${e.turmaCodigo || '—'}</strong> <span class="pf-sec-meta">${`desde ${dataCurta(ui, e.de)}${e.ate ? ` até ${dataCurta(ui, e.ate)}` : ''}`}</span></li>`)}</ol>`
            : ui.html`<p class="pf-sec-meta">Ainda sem turma.</p>`}
        </section>`));
      el.removeAttribute('aria-busy');
      ligar();
    }

    function acaoNo(seletor) {
      const vista = el.closest('#pf-prof-vista') || el;
      return vista.querySelectorAll(seletor);
    }

    async function aplicar(caminho, corpo, sucesso) {
      try {
        const r = await ctx.api.put(API.acao(id, caminho), Object.assign({ versao: m.versao }, corpo));
        m = r.matricula;
        ui.toast(sucesso, { tipo: 'sucesso' });
        desenhar();
      } catch (err) {
        if (err && err.codigo === 'conflito-versao') {
          ui.toast(mensagemDeErro(err), { tipo: 'aviso' });
          try { m = await ler(); desenhar(); } catch (_e) { /* fica a tela atual */ }
          return;
        }
        ui.toast(mensagemDeErro(err), { tipo: 'erro' });
      }
    }

    async function mudarStatus(para) {
      const def = (ACOES_STATUS[m.status] || []).find((a) => a.para === para);
      if (!def) return;
      const idMotivo = novoId('motivo');
      const comSwitch = !def.garantir && !def.semRevogar;
      const valor = await ui.dialogo({
        titulo: `${def.rotulo} · ${m.numero}`,
        conteudo: frag(ui.html`<div class="pf-campo"><label class="pf-rotulo" for="${idMotivo}">Motivo (fica registrado na auditoria) <span aria-hidden="true">*</span></label>
            <textarea class="pf-input" id="${idMotivo}" name="motivo" rows="3" minlength="10" maxlength="500" required data-pf-sec-motivo></textarea>
            <p class="pf-erro-campo" data-pf-sec-erro-motivo role="alert" hidden>Escreva entre 10 e 500 caracteres.</p></div>
          ${comSwitch ? htmlSwitch(ui, { nome: 'revogarAcesso', rotulo: 'Revogar o acesso aos conteúdos', ligado: !!def.revogarPadrao }) : ''}
          ${def.garantir ? ui.html`<p class="pf-ajuda">O acesso aos conteúdos do curso é garantido junto.</p>` : ''}`),
        acoes: [
          { rotulo: 'Cancelar', valor: null, tipo: 'secundario', acao: 'cancelar' },
          {
            rotulo: def.rotulo, valor: 'ok', tipo: def.perigo ? 'perigo' : 'primario', acao: 'confirmar',
            validar: (dlg) => {
              const t = dlg.querySelector('[data-pf-sec-motivo]');
              const v = (t.value || '').trim();
              const ok = v.length >= 10 && v.length <= 500;
              dlg.querySelector('[data-pf-sec-erro-motivo]').hidden = ok;
              if (!ok) { t.setAttribute('aria-invalid', 'true'); t.focus(); } else { capturado.motivo = v; capturado.revogar = comSwitch ? switchLigado(dlg, 'revogarAcesso') : null; }
              return ok;
            }
          }
        ],
        aoAbrir: (dlg) => {
          ligarSwitches(dlg);
          capturado.motivo = '';
          capturado.revogar = comSwitch ? !!def.revogarPadrao : null;
          const t = dlg.querySelector('[data-pf-sec-motivo]');
          if (t) t.addEventListener('input', () => { capturado.motivo = (t.value || '').trim(); });
          const sw = dlg.querySelector('[data-pf-sec-switch="revogarAcesso"]');
          if (sw) sw.addEventListener('click', () => { capturado.revogar = sw.getAttribute('aria-checked') === 'true'; });
        }
      });
      if (valor !== 'ok') return;
      if (capturado.motivo.length < 10 || capturado.motivo.length > 500) {
        ui.toast('Escreva o motivo (10 a 500 caracteres) e tente de novo.', { tipo: 'aviso' });
        return;
      }
      const corpo = { status: para, motivo: capturado.motivo };
      if (comSwitch) corpo.revogarAcesso = !!capturado.revogar;
      await aplicar('status', corpo, `Matrícula ${m.numero}: ${ROTULO_SITUACAO[para].toLowerCase()}.`);
    }
    const capturado = { motivo: '', revogar: null };

    async function trocarTurma() {
      let turmas;
      try { turmas = (await listarTurmas(ctx, m.cursoId)).filter((t) => t.status !== 'encerrada'); } catch (err) { ui.toast(mensagemDeErro(err), { tipo: 'erro' }); return; }
      const idSel = novoId('turma');
      let escolha = m.turma ? m.turma.id : '';
      const valor = await ui.dialogo({
        titulo: m.turma ? 'Trocar turma' : 'Enturmar',
        conteudo: frag(ui.html`<div class="pf-campo"><label class="pf-rotulo" for="${idSel}">Turma</label>
          <select class="pf-input" id="${idSel}" data-pf-sec-turma>
            <option value="">Sem turma</option>
            ${turmas.map((t) => ui.html`<option value="${t.id}"${m.turma && t.id === m.turma.id ? ' selected' : ''}>${`${t.codigo}${t.nome ? ` · ${t.nome}` : ''}`}</option>`)}
          </select>${turmas.length ? '' : ui.html`<p class="pf-ajuda">Este curso ainda não tem turma aberta.</p>`}</div>`),
        acoes: [
          { rotulo: 'Cancelar', valor: null, tipo: 'secundario', acao: 'cancelar' },
          { rotulo: 'Salvar', valor: 'ok', tipo: 'primario', acao: 'confirmar' }
        ],
        aoAbrir: (dlg) => { const s = dlg.querySelector('[data-pf-sec-turma]'); s.addEventListener('change', () => { escolha = s.value; }); }
      });
      if (valor !== 'ok') return;
      if ((m.turma ? m.turma.id : '') === escolha) return;
      await aplicar('turma', { turmaId: escolha || null }, escolha ? 'Turma atualizada.' : 'Matrícula sem turma.');
    }

    async function corrigirInicio() {
      const idData = novoId('data');
      const idMot = novoId('motivo');
      const dados = { inicioEm: '', motivo: '' };
      const valor = await ui.dialogo({
        titulo: 'Corrigir data de início',
        conteudo: frag(ui.html`<div class="pf-campo"><label class="pf-rotulo" for="${idData}">Data de início</label>
            <input class="pf-input" type="date" id="${idData}" data-pf-sec-data value="${m.inicioEm ? new Date(m.inicioEm).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) : hojeSP()}"></div>
          <div class="pf-campo"><label class="pf-rotulo" for="${idMot}">Motivo (fica registrado na auditoria) <span aria-hidden="true">*</span></label>
            <textarea class="pf-input" id="${idMot}" rows="3" minlength="10" maxlength="500" data-pf-sec-motivo></textarea>
            <p class="pf-erro-campo" data-pf-sec-erro-motivo role="alert" hidden>Escreva entre 10 e 500 caracteres.</p></div>`),
        acoes: [
          { rotulo: 'Cancelar', valor: null, tipo: 'secundario', acao: 'cancelar' },
          {
            rotulo: 'Salvar', valor: 'ok', tipo: 'primario', acao: 'confirmar',
            validar: (dlg) => {
              const t = dlg.querySelector('[data-pf-sec-motivo]');
              const v = (t.value || '').trim();
              const ok = v.length >= 10 && v.length <= 500 && !!dlg.querySelector('[data-pf-sec-data]').value;
              dlg.querySelector('[data-pf-sec-erro-motivo]').hidden = ok;
              if (ok) { dados.motivo = v; dados.inicioEm = dlg.querySelector('[data-pf-sec-data]').value; } else t.focus();
              return ok;
            }
          }
        ],
        aoAbrir: (dlg) => {
          const t = dlg.querySelector('[data-pf-sec-motivo]');
          const d = dlg.querySelector('[data-pf-sec-data]');
          dados.inicioEm = d.value;
          t.addEventListener('input', () => { dados.motivo = (t.value || '').trim(); });
          d.addEventListener('change', () => { dados.inicioEm = d.value; });
        }
      });
      if (valor !== 'ok') return;
      if (dados.motivo.length < 10 || dados.motivo.length > 500 || !dados.inicioEm) {
        ui.toast('Informe a data e o motivo (10 a 500 caracteres).', { tipo: 'aviso' });
        return;
      }
      await aplicar('inicio', dados, 'Data de início corrigida.');
    }

    async function nomeEmDocumentos() {
      const idSel = novoId('nome');
      const idMot = novoId('motivo');
      const dados = { usar: 'registro', motivo: '' };
      const valor = await ui.dialogo({
        titulo: 'Nome nos documentos desta matrícula',
        conteudo: frag(ui.html`<p class="pf-ajuda">Vale para o certificado e as declarações emitidos daqui em diante. O que já foi emitido fica como está.</p>
          <div class="pf-campo"><label class="pf-rotulo" for="${idSel}">Usar</label>
            <select class="pf-input" id="${idSel}" data-pf-sec-usar>
              <option value="registro"${!m.nomeEmDocumentos || m.nomeEmDocumentos.usar !== 'social' ? ' selected' : ''}>Nome de registro</option>
              <option value="social"${m.nomeEmDocumentos && m.nomeEmDocumentos.usar === 'social' ? ' selected' : ''}>Nome social (a pedido do titular)</option>
            </select></div>
          <div class="pf-campo"><label class="pf-rotulo" for="${idMot}">Motivo (fica registrado na auditoria) <span aria-hidden="true">*</span></label>
            <textarea class="pf-input" id="${idMot}" rows="3" minlength="10" maxlength="500" data-pf-sec-motivo></textarea>
            <p class="pf-erro-campo" data-pf-sec-erro-motivo role="alert" hidden>Escreva entre 10 e 500 caracteres.</p></div>`),
        acoes: [
          { rotulo: 'Cancelar', valor: null, tipo: 'secundario', acao: 'cancelar' },
          {
            rotulo: 'Salvar', valor: 'ok', tipo: 'primario', acao: 'confirmar',
            validar: (dlg) => {
              const t = dlg.querySelector('[data-pf-sec-motivo]');
              const v = (t.value || '').trim();
              const ok = v.length >= 10 && v.length <= 500;
              dlg.querySelector('[data-pf-sec-erro-motivo]').hidden = ok;
              if (ok) { dados.motivo = v; dados.usar = dlg.querySelector('[data-pf-sec-usar]').value; } else t.focus();
              return ok;
            }
          }
        ],
        aoAbrir: (dlg) => {
          const t = dlg.querySelector('[data-pf-sec-motivo]');
          const u = dlg.querySelector('[data-pf-sec-usar]');
          dados.usar = u.value;
          t.addEventListener('input', () => { dados.motivo = (t.value || '').trim(); });
          u.addEventListener('change', () => { dados.usar = u.value; });
        }
      });
      if (valor !== 'ok') return;
      if (dados.motivo.length < 10 || dados.motivo.length > 500) {
        ui.toast('Escreva o motivo (10 a 500 caracteres) e tente de novo.', { tipo: 'aviso' });
        return;
      }
      await aplicar('nome-em-documentos', dados, 'Nome nos documentos atualizado.');
    }

    async function liberar(e) {
      const botao = e.currentTarget;
      ui.ocupado(botao, true, 'Liberando…');
      try {
        await ctx.api.post(API.liberacoes, { email: m.aluno && m.aluno.email, cursoIds: [m.cursoId] });
        ui.toast('Acesso aos conteúdos liberado.', { tipo: 'sucesso' });
        m = await ler();
        desenhar();
      } catch (err) {
        ui.toast(mensagemDeErro(err), { tipo: 'erro' });
        if (botao.isConnected) ui.ocupado(botao, false);
      }
    }

    function ligar() {
      acaoNo('[data-pf-sec-status]').forEach((b) => b.addEventListener('click', () => mudarStatus(b.getAttribute('data-pf-sec-status'))));
      acaoNo('[data-pf-sec-acao="turma"]').forEach((b) => b.addEventListener('click', trocarTurma));
      el.querySelectorAll('[data-pf-sec-acao="inicio"]').forEach((b) => b.addEventListener('click', corrigirInicio));
      el.querySelectorAll('[data-pf-sec-acao="nome"]').forEach((b) => b.addEventListener('click', nomeEmDocumentos));
      el.querySelectorAll('[data-pf-sec-acao="liberar"]').forEach((b) => b.addEventListener('click', liberar));
    }

    desenhar();
    return { destruir() { vivo = false; } };
  }

  // ---------------------------------------------------------------
  // #/turmas/nova (D-30: turma + docências da turma)
  // ---------------------------------------------------------------
  async function montarNovaTurma(el, ctx) {
    const ui = ctx.ui;
    let vivo = true;
    ui.esqueleto(el, { tipo: 'texto', linhas: 4 });
    const cursos = await listarCursos(ctx).catch(() => []);
    if (!vivo) return undefined;
    const cursoInicial = ctx.filtros.get('curso') || '';
    colocarAcoes(el, ui, ui.html`<a class="dmc-btn dmc-btn--secondary" href="#/turmas">Voltar às turmas</a>`);
    el.replaceChildren(frag(ui.html`<section class="pf-detalhe pf-sec-detalhe pf-sec-detalhe--pagina" aria-labelledby="pf-sec-turma-titulo">
      <div class="pf-detalhe__cabeca"><h2 id="pf-sec-turma-titulo">Dados da turma</h2></div>
      <form class="pf-detalhe__corpo" data-pf-sec-form="turma" novalidate>
        ${htmlCampo(ui, { nome: 'cursoId', rotulo: 'Curso', obrigatorio: true, controle: ui.html`<select class="pf-input" id="pf-sec-c-cursoId" name="cursoId" required><option value="">Escolha o curso</option>${cursos.map((c) => ui.html`<option value="${c.id}" data-sigla="${c.sigla || ''}"${c.id === cursoInicial ? ' selected' : ''}>${c.titulo}</option>`)}</select>` })}
        ${htmlCampo(ui, { nome: 'codigo', rotulo: 'Código', obrigatorio: true, ajuda: 'Sugestão SIGLA-AAAA-NN; pode ser editado. Letras maiúsculas, números e hífen.', controle: ui.html`<input class="pf-input" type="text" id="pf-sec-c-codigo" name="codigo" maxlength="24" autocomplete="off" required>` })}
        ${htmlCampo(ui, { nome: 'nome', rotulo: 'Nome (opcional)', controle: ui.html`<input class="pf-input" type="text" id="pf-sec-c-nome" name="nome" maxlength="120" autocomplete="off">` })}
        <div class="pf-sec-duas">
          ${htmlCampo(ui, { nome: 'inicio', rotulo: 'Início', obrigatorio: true, controle: ui.html`<input class="pf-input" type="date" id="pf-sec-c-inicio" name="inicio" required>` })}
          ${htmlCampo(ui, { nome: 'fim', rotulo: 'Fim', controle: ui.html`<input class="pf-input" type="date" id="pf-sec-c-fim" name="fim">` })}
        </div>
        ${htmlCampo(ui, { nome: 'modalidade', rotulo: 'Modalidade', obrigatorio: true, controle: ui.html`<select class="pf-input" id="pf-sec-c-modalidade" name="modalidade" required><option value="">Escolha</option>${MODALIDADES.map((mo) => ui.html`<option value="${mo.valor}">${mo.rotulo}</option>`)}</select>` })}
        <fieldset class="pf-grupo" data-pf-sec-professores><legend>Professores da turma</legend><p class="pf-ajuda">Escolha o curso para ver os professores vinculados a ele.</p></fieldset>
        <div data-pf-sec-resultado-turma></div>
        <div class="pf-detalhe__acoes">
          <button type="submit" class="dmc-btn dmc-btn--primary" data-pf-sec-enviar>Criar turma</button>
          <a class="dmc-btn dmc-btn--secondary" href="#/turmas">Cancelar</a>
        </div>
      </form>
    </section>`));
    el.removeAttribute('aria-busy');
    const form = el.querySelector('[data-pf-sec-form="turma"]');
    const selCurso = form.querySelector('[name="cursoId"]');
    const campoCodigo = form.querySelector('[name="codigo"]');
    const campoInicio = form.querySelector('[name="inicio"]');
    const grupoProf = form.querySelector('[data-pf-sec-professores]');
    let codigoEditado = false;
    let equipe = null; // null = indisponível; [] = carregada

    campoCodigo.addEventListener('input', () => { codigoEditado = true; });
    async function sugerirCodigo() {
      if (codigoEditado) return;
      const opt = selCurso.selectedOptions[0];
      const sigla = opt ? opt.getAttribute('data-sigla') : '';
      if (!selCurso.value || !sigla) { if (!codigoEditado) campoCodigo.value = ''; return; }
      const ano = campoInicio.value ? Number(campoInicio.value.slice(0, 4)) : anoSP();
      const turmas = await listarTurmas(ctx, selCurso.value).catch(() => []);
      const re = new RegExp(`^${sigla}-${ano}-(\\d{2,3})$`);
      const maior = turmas.reduce((acc, t) => { const mm = re.exec(t.codigo || ''); return mm ? Math.max(acc, Number(mm[1])) : acc; }, 0);
      if (!codigoEditado) campoCodigo.value = `${sigla}-${ano}-${String(maior + 1).padStart(2, '0')}`;
    }
    async function carregarProfessores() {
      if (!selCurso.value) {
        grupoProf.replaceChildren(frag(ui.html`<legend>Professores da turma</legend><p class="pf-ajuda">Escolha o curso para ver os professores vinculados a ele.</p>`));
        return;
      }
      if (equipe === null) {
        try {
          const r = await ctx.api.get(API.equipe, { silencioso404: true });
          equipe = r && Array.isArray(r.itens) ? r.itens : undefined;
        } catch (_e) {
          equipe = undefined;
        }
      }
      if (!Array.isArray(equipe)) {
        grupoProf.replaceChildren(frag(ui.html`<legend>Professores da turma</legend><p class="pf-ajuda">A lista da equipe não está disponível agora. Vincule professores depois, em Equipe.</p>`));
        return;
      }
      const doCurso = equipe.filter((p) => !p.desativadoEm && Array.isArray(p.docencias) && p.docencias.some((d) => d.cursoId === selCurso.value));
      grupoProf.replaceChildren(frag(doCurso.length
        ? ui.html`<legend>Professores da turma</legend>${doCurso.map((p) => ui.html`<label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" name="professores" value="${p.id}" data-nome="${p.nome || p.email}"><span>${p.nome || p.email}</span></label>`)}`
        : ui.html`<legend>Professores da turma</legend><p class="pf-ajuda">Nenhum professor vinculado a este curso ainda.</p>`));
    }
    selCurso.addEventListener('change', () => { sugerirCodigo(); carregarProfessores(); });
    campoInicio.addEventListener('change', sugerirCodigo);
    if (selCurso.value) { sugerirCodigo(); carregarProfessores(); }

    async function vincular(turma, professores) {
      const falhas = [];
      for (const p of professores) {
        try {
          await ctx.api.post(API.docencias, { userId: p.id, cursoId: turma.cursoId, turmaId: turma.id });
        } catch (err) {
          falhas.push(Object.assign({}, p, { erro: mensagemDeErro(err) }));
        }
      }
      return falhas;
    }

    function mostrarFalhas(turma, falhas) {
      const caixa = form.querySelector('[data-pf-sec-resultado-turma]');
      caixa.replaceChildren(frag(ui.html`<div class="pf-alerta pf-alerta--aviso" role="alert">
        <p class="pf-alerta__titulo">${`Turma ${turma.codigo} criada.`}</p>
        ${falhas.map((p) => ui.html`<p>${`Não foi possível vincular ${p.nome}. Tente de novo.`}</p>`)}
        <p><button type="button" class="dmc-btn dmc-btn--secondary" data-pf-sec-acao="repetir">Tentar de novo</button>
        <a class="dmc-btn dmc-btn--secondary" href="#/turmas">Ir para as turmas</a></p></div>`));
      caixa.querySelector('[data-pf-sec-acao="repetir"]').addEventListener('click', async (e) => {
        ui.ocupado(e.currentTarget, true, 'Vinculando…');
        const restantes = await vincular(turma, falhas);
        if (restantes.length) mostrarFalhas(turma, restantes);
        else { ui.toast(`Turma ${turma.codigo} criada.`, { tipo: 'sucesso' }); ctx.navegar('turmas'); }
      });
    }

    let criada = null;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const botao = form.querySelector('[data-pf-sec-enviar]');
      const valores = {
        cursoId: selCurso.value,
        codigo: campoCodigo.value.trim().toUpperCase(),
        nome: form.nome.value.trim() || undefined,
        inicio: campoInicio.value,
        fim: form.fim.value || undefined,
        modalidade: form.modalidade.value
      };
      const erros = {};
      if (!valores.cursoId) erros.cursoId = 'Escolha o curso.';
      if (!valores.codigo) erros.codigo = 'Informe o código da turma.';
      if (!valores.inicio) erros.inicio = 'Informe a data de início.';
      if (valores.fim && valores.inicio && valores.fim < valores.inicio) erros.fim = 'O fim não pode ser antes do início.';
      if (!valores.modalidade) erros.modalidade = 'Escolha a modalidade.';
      if (mostrarErros(form, erros)) return;
      const professores = Array.from(form.querySelectorAll('[name="professores"]:checked')).map((c) => ({ id: c.value, nome: c.getAttribute('data-nome') }));
      ui.ocupado(botao, true, 'Criando…');
      try {
        if (!criada) criada = (await ctx.api.post(API.turmas, valores)).turma;
        const falhas = await vincular(criada, professores);
        if (falhas.length) { mostrarFalhas(criada, falhas); return; }
        ui.toast(`Turma ${criada.codigo} criada.`, { tipo: 'sucesso' });
        ctx.navegar('turmas');
      } catch (err) {
        if (err && err.codigo === 'codigo-em-uso') mostrarErros(form, { codigo: 'Este código já é usado por outra turma.' });
        else if (err && err.campos && mostrarErros(form, err.campos)) { /* campos destacados */ }
        else ui.toast(mensagemDeErro(err), { tipo: 'erro' });
      } finally {
        if (botao.isConnected) ui.ocupado(botao, false);
      }
    });
    return { destruir() { vivo = false; } };
  }

  // ---------------------------------------------------------------
  // #/alunos/:userId/matriculas (aba da moldura da F8, D-65; DC-73)
  // ---------------------------------------------------------------
  async function montarAbaDoAluno(el, ctx) {
    const ui = ctx.ui;
    const userId = ctx.params.userId;
    ui.esqueleto(el, { tipo: 'tabela', linhas: 3 });
    const r = await ctx.api.get(`${API.matriculas}?userId=${encodeURIComponent(userId)}&porPagina=100`, { sinal: ctx.sinal });
    const email = ctx.aluno && ctx.aluno.email ? ctx.aluno.email : '';
    const nova = `#/matriculas?nova=1${email ? `&email=${encodeURIComponent(email)}` : ''}`;
    el.removeAttribute('aria-busy');
    if (!r.itens.length) {
      ui.estadoVazio(el, { titulo: 'Este aluno não tem matrícula.', texto: 'A matrícula nasce da liberação de acesso ou da Nova matrícula.', acao: { rotulo: 'Nova matrícula', href: nova } });
      return undefined;
    }
    el.replaceChildren(frag(ui.html`<p class="pf-sec-acoes-aba"><a class="dmc-btn dmc-btn--primary" href="${nova}">Nova matrícula</a></p>
      ${htmlTabela(ui, r.itens, { legenda: `Matrículas do aluno (${r.total})`, semAluno: true })}`));
    return undefined;
  }

  // ---------------------------------------------------------------
  // Registro (índice §6.3: F4a)
  // ---------------------------------------------------------------
  P.registrar({ rota: 'matriculas', titulo: 'Matrículas', papeis: SO_ADMIN, montar: montarMatriculas });
  P.registrar({ rota: 'matriculas/:id', titulo: 'Matrícula', papeis: SO_ADMIN, montar: montarDetalhe });
  P.registrar({ rota: 'turmas/nova', titulo: 'Nova turma', papeis: SO_ADMIN, montar: montarNovaTurma });
  P.registrar({ rota: 'alunos/:userId/matriculas', titulo: 'Matrículas', papeis: SO_ADMIN, montar: montarAbaDoAluno, pai: 'alunos/:userId', aba: 'matriculas' });
})();
