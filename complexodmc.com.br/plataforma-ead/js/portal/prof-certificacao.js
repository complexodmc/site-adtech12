/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-certificacao.js
   Backoffice da certificação (professor.html) — fatia F3b. Só coordenação.
   Spec: docs/dmc/PORTAL-UX.md §7.15 (Declarações emitidas), §7.22
   (Critérios dos cursos, IES parceiras) · PORTAL-API.md §6.7.1, §6.7.5.

   Rotas registradas em DMC_Professor (o roteador e a moldura são da F8):
     #/configuracoes/cursos      critérios dos cursos, códigos de aula, IES
     #/documentos/declaracoes    declarações emitidas (ver, revogar)
   HTML só por DMC_UI.html; nenhum alert/confirm/prompt; textos sóbrios.
   ============================================================= */
(function () {
  'use strict';

  const P = window.DMC_Professor;
  if (!P || typeof P.registrar !== 'function') return;

  const API = Object.freeze({
    cursos: '/portal/admin/cursos/academico',
    curso: (id) => `/portal/admin/cursos/${encodeURIComponent(id)}/academico`,
    codigos: (id) => `/portal/admin/cursos/${encodeURIComponent(id)}/codigos`,
    ies: '/portal/admin/ies',
    iesUma: (id) => `/portal/admin/ies/${encodeURIComponent(id)}`,
    declaracoes: '/portal/admin/declaracoes',
    revogar: (id) => `/portal/admin/declaracoes/${encodeURIComponent(id)}/revogar`
  });
  const SO_ADMIN = ['admin'];
  const NIVEIS = [
    ['', 'Não definido'], ['curso_livre', 'Curso livre'], ['extensao', 'Extensão'], ['aperfeicoamento', 'Aperfeiçoamento'],
    ['pos_graduacao_lato_sensu', 'Pós-graduação lato sensu']
  ];
  const TIPOS = [['', 'Todos'], ['matricula', 'Matrícula'], ['frequencia', 'Frequência'], ['conclusao', 'Conclusão'], ['quitacao_anual', 'Quitação anual']];

  const html = (p, ...v) => window.DMC_UI.html(p, ...v);
  const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  const data = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? FMT_DATA.format(d) : '—'; };
  const num = (n, casas = 1) => (typeof n === 'number' ? (Math.round(n * 10 ** casas) / 10 ** casas).toFixed(casas).replace('.', ',') : '—');
  const lerNum = (v) => { const s = String(v || '').trim().replace(',', '.'); return s === '' ? null : Number(s); };

  function avisar(ui, texto, tipo) {
    if (ui && typeof ui.toast === 'function') ui.toast(texto, { tipo: tipo || 'info' });
    else if (ui && typeof ui.anunciar === 'function') ui.anunciar(texto);
  }
  function erroEm(el, err) {
    const texto = (err && err.message) || 'Não foi possível concluir agora. Tente de novo.';
    el.innerHTML = html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>${texto}</p></div>`;
  }
  function subnav(atual) {
    return html`<nav class="pf-dec-subnav" aria-label="Certificação">
      <a href="#/configuracoes/cursos" ${atual === 'cursos' ? html`aria-current="page"` : ''}>Critérios dos cursos</a>
      <a href="#/documentos/declaracoes" ${atual === 'declaracoes' ? html`aria-current="page"` : ''}>Declarações emitidas</a>
      <a href="#/documentos">Documentos</a>
    </nav>`;
  }

  /** Diálogo de motivo (10–500) próprio da página: usa DMC_UI.confirmar({ motivo:true }) quando existe. */
  function pedirMotivo(ui, { titulo, texto, rotulo }) {
    if (ui && typeof ui.confirmar === 'function') {
      return ui.confirmar({ titulo, texto, rotuloConfirmar: rotulo, motivo: true, perigo: true })
        .then((r) => (r && typeof r === 'object' && r.motivo ? r.motivo : null));
    }
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'pf-dialogo pf-dialogo--p';
      d.setAttribute('aria-labelledby', 'pf-dec-mot-t');
      d.innerHTML = html`
        <form method="dialog" class="pf-dialogo__corpo">
          <h2 class="pf-dialogo__titulo" id="pf-dec-mot-t">${titulo}</h2>
          <p>${texto}</p>
          <div class="pf-campo">
            <label class="pf-rotulo" for="pf-dec-mot">Motivo (fica registrado na auditoria)</label>
            <textarea class="pf-input" id="pf-dec-mot" rows="3" minlength="10" maxlength="500"></textarea>
            <p class="pf-ajuda" id="pf-dec-mot-ajuda">De 10 a 500 caracteres.</p>
          </div>
          <div class="pf-dialogo__acoes">
            <button type="button" class="dmc-btn dmc-btn--link" data-pf-acao="cancelar">Cancelar</button>
            <button type="button" class="dmc-btn dmc-btn--secondary pf-btn--perigo" data-pf-acao="confirmar">${rotulo}</button>
          </div>
        </form>`;
      let valor = null;
      d.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pf-acao]');
        if (!b) return;
        if (b.getAttribute('data-pf-acao') === 'confirmar') {
          const t = d.querySelector('#pf-dec-mot').value.trim();
          if (t.length < 10) { d.querySelector('#pf-dec-mot-ajuda').textContent = 'Escreva pelo menos 10 caracteres.'; return; }
          valor = t;
        }
        d.close();
      });
      d.addEventListener('close', () => { d.remove(); resolve(valor); });
      document.body.appendChild(d);
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
      d.querySelector('[data-pf-acao="cancelar"]').focus();
    });
  }

  // =============================================================
  // #/configuracoes/cursos
  // =============================================================
  async function montarCursos(el, ctx) {
    const api = ctx.api || window.DMC_Api;
    const ui = ctx.ui || window.DMC_UI;
    el.innerHTML = html`${subnav('cursos')}
      <section aria-labelledby="pf-dec-cr-t">
        <h2 class="pf-secao-titulo" id="pf-dec-cr-t">Cursos</h2>
        <p class="pf-ajuda">Os critérios valem para o certificado nas duas regras (com e sem avaliação). A situação dos alunos é recalculada com a nova nota mínima; matrículas concluídas não mudam.</p>
        <div id="pf-dec-cursos" aria-busy="true"><p class="pf-ajuda">Carregando…</p></div>
        <div id="pf-dec-editor"></div>
      </section>
      <section aria-labelledby="pf-dec-ies-t" class="pf-dec-secao">
        <h2 class="pf-secao-titulo" id="pf-dec-ies-t">Instituições parceiras</h2>
        <p class="pf-ajuda">Cadastre somente com parceria formalizada. Sem IES parceira, a plataforma não oferece pós-graduação lato sensu nem afirma reconhecimento pelo MEC.</p>
        <div id="pf-dec-ies"><p class="pf-ajuda">Carregando…</p></div>
      </section>`;
    const lista = el.querySelector('#pf-dec-cursos');
    const editor = el.querySelector('#pf-dec-editor');
    const iesEl = el.querySelector('#pf-dec-ies');
    let cursos = [];
    let ies = [];

    async function carregar() {
      const [c, i] = await Promise.all([api.get(API.cursos), api.get(API.ies)]);
      cursos = (c && c.itens) || [];
      ies = (i && i.itens) || [];
      pintarLista();
      pintarIes();
    }

    function pintarLista() {
      lista.removeAttribute('aria-busy');
      if (!cursos.length) { lista.innerHTML = html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhum curso cadastrado.</p></div>`; return; }
      lista.innerHTML = html`
        <div class="pf-dec-rolavel" role="region" aria-label="Critérios de certificação por curso" tabindex="0">
        <table class="pf-tabela">
          <caption class="dmc-sr-only">Critérios de certificação por curso</caption>
          <thead><tr><th scope="col">Curso</th><th scope="col">Sigla</th><th scope="col">Nível</th><th scope="col" class="pf-tabela__num">Nota mínima</th>
            <th scope="col" class="pf-tabela__num">Frequência mínima</th><th scope="col" class="pf-tabela__num">Carga mínima</th><th scope="col">TCC</th><th scope="col">IES parceira</th><th scope="col" class="pf-tabela__acoes">Ações</th></tr></thead>
          <tbody>${cursos.map((c) => html`
            <tr>
              <td data-rotulo="Curso">${c.titulo}${(c.avisos || []).map((a) => html`<div class="pf-alerta pf-alerta--aviso pf-alerta--compacto"><p>${a}</p></div>`)}</td>
              <td data-rotulo="Sigla">${c.sigla || '—'}</td>
              <td data-rotulo="Nível">${c.nivelRotulo || '—'}</td>
              <td data-rotulo="Nota mínima" class="pf-tabela__num">${num(c.criterios.notaMinima)}</td>
              <td data-rotulo="Frequência mínima" class="pf-tabela__num">${c.criterios.frequenciaMinima == null ? '—' : `${num(c.criterios.frequenciaMinima, 0)}%`}</td>
              <td data-rotulo="Carga mínima" class="pf-tabela__num">${c.criterios.cargaMinimaHoras == null ? '—' : `${num(c.criterios.cargaMinimaHoras)} h`}</td>
              <td data-rotulo="TCC">${c.criterios.exigeTcc ? 'Exigido' : 'Não exigido'}</td>
              <td data-rotulo="IES parceira">${c.ies ? c.ies.nome : '—'}</td>
              <td data-rotulo="Ações" class="pf-tabela__acoes"><button type="button" class="dmc-btn dmc-btn--link" data-editar="${c.cursoId}">Editar</button></td>
            </tr>`)}
          </tbody>
        </table>
        </div>`;
    }

    function pintarEditor(c) {
      const iesAtivas = ies.filter((i) => i.ativa);
      const semAula = (c.modulos || []).reduce((s, m) => s + (m.aulasSemCodigo || 0), 0);
      editor.innerHTML = html`
        <form class="pf-detalhe pf-dec-editor" id="pf-dec-form-curso" novalidate aria-labelledby="pf-dec-ed-t">
          <h3 class="pf-secao-titulo" id="pf-dec-ed-t" tabindex="-1">Editar · ${c.titulo}</h3>
          <div class="pf-dec-avisos">${(c.avisos || []).map((a) => html`<div class="pf-alerta pf-alerta--aviso pf-alerta--compacto"><p>${a}</p></div>`)}</div>
          <div class="pf-dec-editor__linha">
            <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-sigla">Sigla</label>
              <input class="pf-input" id="pf-dec-sigla" name="sigla" maxlength="6" autocomplete="off" value="${c.sigla || ''}">
              <p class="pf-ajuda">2 a 6 letras ou números. Base do código das aulas (ex.: APE-M01-A01).</p></div>
            <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-nivel">Nível</label>
              <select class="pf-input" id="pf-dec-nivel" name="nivel">${NIVEIS.map(([v, r]) => html`<option value="${v}" ${(c.nivel || '') === v ? html`selected` : ''} ${v === 'pos_graduacao_lato_sensu' && !iesAtivas.length ? html`disabled` : ''}>${r}</option>`)}</select>
              ${iesAtivas.length ? '' : html`<p class="pf-ajuda">Pós-graduação lato sensu exige IES parceira cadastrada.</p>`}</div>
            <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-iesid">IES parceira</label>
              <select class="pf-input" id="pf-dec-iesid" name="iesId"><option value="">Nenhuma</option>${iesAtivas.map((i) => html`<option value="${i.id}" ${c.iesId === i.id ? html`selected` : ''}>${i.nome}</option>`)}</select></div>
          </div>
          <div class="pf-dec-editor__linha">
            <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-carga">Carga horária do curso (h)</label>
              <input class="pf-input" id="pf-dec-carga" name="carga" inputmode="decimal" value="${c.cargaHorariaHoras == null ? '' : String(c.cargaHorariaHoras)}">
              <p class="pf-ajuda">Texto do catálogo: ${c.cargaHorariaTexto || '—'}</p></div>
            <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-nota">Nota mínima (0 a 10)</label>
              <input class="pf-input" id="pf-dec-nota" name="nota" type="number" min="0" max="10" step="0.5" value="${String(c.criterios.notaMinima)}"></div>
            <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-freq">Frequência mínima (%)</label>
              <input class="pf-input" id="pf-dec-freq" name="freq" type="number" min="0" max="100" step="1" value="${c.criterios.frequenciaMinima == null ? '' : String(c.criterios.frequenciaMinima)}"></div>
            <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-cmin">Carga horária mínima (h)</label>
              <input class="pf-input" id="pf-dec-cmin" name="cmin" type="number" min="0" step="1" value="${c.criterios.cargaMinimaHoras == null ? '' : String(c.criterios.cargaMinimaHoras)}"></div>
          </div>
          <label class="pf-check"><input type="checkbox" name="tcc" ${c.criterios.exigeTcc ? html`checked` : ''}><span>Exige TCC (o módulo de TCC é marcado no editor de conteúdo)</span></label>
          <div class="pf-campo" id="pf-dec-motivo-campo" hidden><label class="pf-rotulo" for="pf-dec-motivo-nota">Motivo da mudança da nota mínima</label>
            <textarea class="pf-input" id="pf-dec-motivo-nota" name="motivo" rows="2" maxlength="500"></textarea>
            <p class="pf-ajuda">Obrigatório (10 a 500 caracteres); fica registrado na auditoria.</p></div>
          <div id="pf-dec-form-erro"></div>
          <div class="pf-detalhe__acoes">
            <button type="submit" class="dmc-btn dmc-btn--primary">Salvar critérios</button>
            <button type="button" class="dmc-btn dmc-btn--secondary" id="pf-dec-gerar" ${c.sigla ? '' : html`disabled`}>Gerar códigos das aulas${semAula ? ` (${semAula} sem código)` : ''}</button>
            <button type="button" class="dmc-btn dmc-btn--link" id="pf-dec-fechar">Fechar</button>
          </div>
        </form>`;
      const form = editor.querySelector('form');
      const erro = editor.querySelector('#pf-dec-form-erro');
      const campoMotivo = editor.querySelector('#pf-dec-motivo-campo');
      const nota = form.elements.nota;
      nota.addEventListener('input', () => { campoMotivo.hidden = Number(nota.value) === c.criterios.notaMinima; });
      editor.querySelector('#pf-dec-fechar').addEventListener('click', () => { editor.innerHTML = ''; });
      editor.querySelector('#pf-dec-gerar').addEventListener('click', async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        try {
          const r = await api.post(API.codigos(c.cursoId), {});
          avisar(ui, `Códigos gerados: ${r.gerados}. Mantidos: ${r.mantidos}.`, 'sucesso');
          await recarregarCurso(c.cursoId);
        } catch (err) { erroEm(erro, err); b.disabled = false; }
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        erro.innerHTML = '';
        const corpo = {
          versao: c.versao,
          sigla: form.elements.sigla.value.trim().toUpperCase() || null,
          nivel: form.elements.nivel.value || null,
          iesId: form.elements.iesId.value || null,
          cargaHorariaHoras: lerNum(form.elements.carga.value),
          criterios: {
            notaMinima: lerNum(form.elements.nota.value),
            frequenciaMinima: lerNum(form.elements.freq.value),
            cargaMinimaHoras: lerNum(form.elements.cmin.value),
            exigeTcc: form.elements.tcc.checked
          }
        };
        const motivo = form.elements.motivo.value.trim();
        if (motivo) corpo.motivo = motivo;
        const botao = form.querySelector('[type="submit"]');
        botao.disabled = true;
        try {
          const r = await api.put(API.curso(c.cursoId), corpo);
          cursos = cursos.map((x) => (x.cursoId === r.cursoId ? r : x));
          pintarLista();
          pintarEditor(r);
          avisar(ui, 'Critérios salvos.', 'sucesso');
        } catch (err) {
          const campos = err && err.dados && err.dados.campos ? Object.values(err.dados.campos).join(' ') : '';
          erroEm(erro, { message: [err && err.message, campos].filter(Boolean).join(' ') });
          if (err && err.codigo === 'conflito-versao') {
            erro.insertAdjacentHTML('beforeend', String(html`<p><button type="button" class="dmc-btn dmc-btn--link" id="pf-dec-recarregar">Recarregar</button></p>`));
            const rb = erro.querySelector('#pf-dec-recarregar');
            if (rb) rb.addEventListener('click', () => recarregarCurso(c.cursoId));
          }
        } finally { botao.disabled = false; }
      });
      const t = editor.querySelector('#pf-dec-ed-t');
      if (t) t.focus();
    }

    async function recarregarCurso(id) {
      const r = await api.get(API.curso(id));
      cursos = cursos.map((x) => (x.cursoId === id ? r : x));
      pintarLista();
      pintarEditor(r);
    }

    function pintarIes() {
      iesEl.innerHTML = html`
        ${ies.length ? html`
          <ul class="pf-lista">${ies.map((i) => html`
            <li class="pf-lista__linha">
              <p class="pf-dec-cert__titulo">${i.nome}${i.sigla ? ` (${i.sigla})` : ''}</p>
              <p class="pf-lista__meta">CNPJ ${i.cnpj}${i.atoCredenciamento ? ` · ${i.atoCredenciamento}` : ''} · ${i.ativa ? 'Ativa' : 'Inativa'}</p>
              <div class="pf-lista__acao"><button type="button" class="dmc-btn dmc-btn--link" data-ies-ativa="${i.id}">${i.ativa ? 'Desativar' : 'Ativar'}</button></div>
            </li>`)}
          </ul>` : html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhuma IES parceira cadastrada.</p></div>`}
        <form class="pf-dec-editor" id="pf-dec-form-ies" novalidate aria-labelledby="pf-dec-nova-ies">
          <h3 class="pf-secao-titulo" id="pf-dec-nova-ies">Cadastrar IES parceira</h3>
          <div class="pf-dec-editor__linha">
            <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-ies-nome">Nome <span aria-hidden="true">*</span></label><input class="pf-input" id="pf-dec-ies-nome" name="nome" maxlength="160" required></div>
            <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-ies-sigla">Sigla</label><input class="pf-input" id="pf-dec-ies-sigla" name="sigla" maxlength="20"></div>
            <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-ies-cnpj">CNPJ <span aria-hidden="true">*</span></label><input class="pf-input" id="pf-dec-ies-cnpj" name="cnpj" inputmode="numeric" maxlength="18" required></div>
          </div>
          <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-ies-ato">Ato de credenciamento</label><input class="pf-input" id="pf-dec-ies-ato" name="ato" maxlength="300"></div>
          <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-ies-site">Site (https)</label><input class="pf-input" id="pf-dec-ies-site" name="site" type="url" maxlength="500"></div>
          <div id="pf-dec-ies-erro"></div>
          <div><button type="submit" class="dmc-btn dmc-btn--secondary">Cadastrar IES</button></div>
        </form>`;
      const form = iesEl.querySelector('#pf-dec-form-ies');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const erro = iesEl.querySelector('#pf-dec-ies-erro');
        erro.innerHTML = '';
        try {
          await api.post(API.ies, {
            nome: form.elements.nome.value, sigla: form.elements.sigla.value || null, cnpj: form.elements.cnpj.value,
            atoCredenciamento: form.elements.ato.value || null, site: form.elements.site.value || null, ativa: true
          });
          avisar(ui, 'IES parceira cadastrada.', 'sucesso');
          await carregar();
        } catch (err) {
          const campos = err && err.dados && err.dados.campos ? Object.values(err.dados.campos).join(' ') : '';
          erroEm(erro, { message: [err && err.message, campos].filter(Boolean).join(' ') });
        }
      });
    }

    el.addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-editar]');
      if (ed) {
        const c = cursos.find((x) => x.cursoId === ed.getAttribute('data-editar'));
        if (c) pintarEditor(c);
        return;
      }
      const at = e.target.closest('[data-ies-ativa]');
      if (at) {
        const i = ies.find((x) => x.id === at.getAttribute('data-ies-ativa'));
        if (!i) return;
        try {
          await api.put(API.iesUma(i.id), { versao: i.versao, ativa: !i.ativa });
          avisar(ui, i.ativa ? 'IES desativada.' : 'IES ativada.', 'sucesso');
          await carregar();
        } catch (err) { avisar(ui, (err && err.message) || 'Não foi possível alterar agora.', 'erro'); }
      }
    });

    try { await carregar(); } catch (err) { lista.removeAttribute('aria-busy'); erroEm(lista, err); }
  }

  // =============================================================
  // #/documentos/declaracoes
  // =============================================================
  async function montarDeclaracoes(el, ctx) {
    const api = ctx.api || window.DMC_Api;
    const ui = ctx.ui || window.DMC_UI;
    el.innerHTML = html`${subnav('declaracoes')}
      <form class="pf-dec-filtros" id="pf-dec-filtros" role="search" aria-label="Filtrar declarações">
        <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-f-tipo">Tipo</label>
          <select class="pf-input" id="pf-dec-f-tipo" name="tipo">${TIPOS.map(([v, r]) => html`<option value="${v}">${r}</option>`)}</select></div>
        <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-f-q">Código, nome ou e-mail</label>
          <input class="pf-input" id="pf-dec-f-q" name="q" type="search" minlength="3" maxlength="80"></div>
        <div class="pf-campo"><label class="pf-rotulo" for="pf-dec-f-rev">Situação</label>
          <select class="pf-input" id="pf-dec-f-rev" name="revogada"><option value="">Todas</option><option value="0">Emitidas</option><option value="1">Revogadas</option></select></div>
        <button type="submit" class="dmc-btn dmc-btn--secondary">Filtrar</button>
      </form>
      <div id="pf-dec-lista-adm" aria-live="polite"><p class="pf-ajuda">Carregando…</p></div>`;
    const form = el.querySelector('#pf-dec-filtros');
    const lista = el.querySelector('#pf-dec-lista-adm');
    let pagina = 1;

    async function carregar() {
      const q = new URLSearchParams();
      for (const k of ['tipo', 'q', 'revogada']) { const v = form.elements[k].value.trim(); if (v) q.set(k, v); }
      q.set('pagina', String(pagina));
      try {
        const r = await api.get(`${API.declaracoes}?${q.toString()}`);
        pintar(r);
      } catch (err) { erroEm(lista, err); }
    }

    function pintar(r) {
      const itens = (r && r.itens) || [];
      if (!itens.length) {
        lista.innerHTML = html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhuma declaração encontrada.</p><p class="pf-vazio__texto">As declarações emitidas pelos alunos aparecem aqui, das mais recentes para as mais antigas.</p></div>`;
        return;
      }
      lista.innerHTML = html`
        <table class="pf-tabela">
          <caption class="dmc-sr-only">Declarações emitidas</caption>
          <thead><tr><th scope="col">Código</th><th scope="col">Aluno</th><th scope="col">Tipo</th><th scope="col">Curso ou ano</th><th scope="col">Emitida em</th><th scope="col">Situação</th><th scope="col" class="pf-tabela__acoes">Ações</th></tr></thead>
          <tbody>${itens.map((d) => html`
            <tr>
              <td data-rotulo="Código"><span class="pf-dec-cert__codigo">${d.codigo}</span></td>
              <td data-rotulo="Aluno">${d.aluno && d.aluno.nome ? d.aluno.nome : '—'}<span class="pf-tabela__secundaria"> ${d.aluno && d.aluno.email ? d.aluno.email : ''}</span></td>
              <td data-rotulo="Tipo">${d.rotulo}</td>
              <td data-rotulo="Curso ou ano">${d.cursoTitulo || (d.ano ? String(d.ano) : '—')}</td>
              <td data-rotulo="Emitida em">${data(d.emitidaEm)}</td>
              <td data-rotulo="Situação"><span class="pf-estado pf-estado--${d.revogada ? 'aviso' : 'sucesso'}">${d.revogada ? 'Revogada' : 'Emitida'}</span></td>
              <td data-rotulo="Ações" class="pf-tabela__acoes">
                <a class="dmc-btn dmc-btn--link" href="declaracao.html?id=${encodeURIComponent(d.id)}" target="_blank" rel="noopener">Ver</a>
                ${d.revogada ? '' : html`<button type="button" class="dmc-btn dmc-btn--link pf-btn--perigo" data-revogar="${d.id}" data-codigo="${d.codigo}">Revogar</button>`}
              </td>
            </tr>`)}
          </tbody>
        </table>
        <p class="pf-ajuda">Mostrando ${itens.length} de ${r.total}.</p>
        <div class="pf-mais">
          ${r.pagina > 1 ? html`<button type="button" class="dmc-btn dmc-btn--link" data-pagina="${String(r.pagina - 1)}">Anteriores</button>` : ''}
          ${r.pagina < r.totalPaginas ? html`<button type="button" class="dmc-btn dmc-btn--link" data-pagina="${String(r.pagina + 1)}">Próximas</button>` : ''}
        </div>`;
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); pagina = 1; carregar(); });
    lista.addEventListener('click', async (e) => {
      const pg = e.target.closest('[data-pagina]');
      if (pg) { pagina = Number(pg.getAttribute('data-pagina')) || 1; carregar(); return; }
      const rv = e.target.closest('[data-revogar]');
      if (!rv) return;
      const motivo = await pedirMotivo(ui, {
        titulo: `Revogar ${rv.getAttribute('data-codigo')}`,
        texto: 'A validação pública passa a dizer que o documento foi revogado. O aluno pode emitir uma nova declaração.',
        rotulo: 'Revogar declaração'
      });
      if (!motivo) return;
      try {
        await api.post(API.revogar(rv.getAttribute('data-revogar')), { motivo });
        avisar(ui, 'Declaração revogada.', 'sucesso');
        await carregar();
      } catch (err) { avisar(ui, (err && err.message) || 'Não foi possível revogar agora.', 'erro'); }
    });
    await carregar();
  }

  P.registrar({ rota: 'configuracoes/cursos', titulo: 'Critérios dos cursos', papeis: SO_ADMIN, montar: montarCursos });
  P.registrar({ rota: 'documentos/declaracoes', titulo: 'Declarações emitidas', papeis: SO_ADMIN, montar: montarDeclaracoes });
})();
