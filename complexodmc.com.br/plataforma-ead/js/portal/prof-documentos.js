/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-documentos.js (F4b)
   Documentação no backoffice (só coordenação): fila de revisão dos
   documentos pessoais, tipos exigidos e contratos.
   Spec: PORTAL-UX.md §7.15 (Revisão, Tipos exigidos), §7.17 (Contratos),
   §7.5 (abas Documentos e Contratos do aluno); PORTAL-API.md §6.8.3–§6.8.4;
   índice §6.3, §7.8 (DMC_Professor.registrar), D-32, D-65, D-78.

   Rotas registradas (todas papeis ['admin']):
     #/documentos                 fila (Em revisão · Pendentes · Aprovados · Não enviados · Todos)
     #/documentos/tipos           tipos exigidos (sugestão DOC, DIP, CERT, HIS, RES — nasce inativa)
     #/documentos/:envioId        tela de revisão (prévia de imagem, PDF em nova aba, histórico)
     #/contratos                  lista + [Anexar contrato]
     #/contratos/:id              detalhe com evidências, substituir PDF, cancelar
     #/alunos/:userId/documentos  aba da moldura do aluno (pai, D-65)
     #/alunos/:userId/contratos   aba da moldura do aluno (pai, D-65)

   Sem <script> inline, sem on*=, HTML só por DMC_UI.html (escape).
   Prefixo de classe próprio: pf-doc-.
   ============================================================= */
(function () {
  'use strict';
  const P = window.DMC_Professor;
  if (!P || typeof P.registrar !== 'function') return;

  const API = {
    fila: '/portal/admin/documentos',
    envio: (id) => `/portal/admin/documentos/envios/${encodeURIComponent(id)}`,
    revisao: (id) => `/portal/admin/documentos/envios/${encodeURIComponent(id)}/revisao`,
    envioArquivo: (id) => `/portal/admin/documentos/envios/${encodeURIComponent(id)}/arquivo`,
    tipos: '/portal/admin/documentos/tipos',
    tipo: (id) => `/portal/admin/documentos/tipos/${encodeURIComponent(id)}`,
    sugeridos: '/portal/admin/documentos/tipos/sugeridos',
    doAluno: (userId) => `/portal/admin/usuarios/${encodeURIComponent(userId)}/documentos`,
    contratos: '/portal/admin/contratos',
    contrato: (id) => `/portal/admin/contratos/${encodeURIComponent(id)}`,
    contratoArquivo: (id) => `/portal/admin/contratos/${encodeURIComponent(id)}/arquivo`,
    contratoCancelar: (id) => `/portal/admin/contratos/${encodeURIComponent(id)}/cancelar`,
    matriculas: '/portal/admin/matriculas'
  };
  const SO_ADMIN = ['admin'];
  const ROTULO_DOC = { nao_enviado: 'Não enviado', em_revisao: 'Em revisão', aprovado: 'Aprovado', pendente: 'Pendente', substituido: 'Substituído' };
  const TOM_DOC = { nao_enviado: 'neutro', em_revisao: 'info', aprovado: 'sucesso', pendente: 'aviso', substituido: 'neutro' };
  const ROTULO_CTR = { pendente: 'Pendente', assinado: 'Assinado', cancelado: 'Cancelado' };
  const TOM_CTR = { pendente: 'aviso', assinado: 'sucesso', cancelado: 'neutro' };
  const MOTIVOS_PENDENCIA = ['Ilegível', 'Documento vencido', 'Não corresponde ao tipo', 'Incompleto', 'Outro'];
  const FORMATOS = [{ valor: 'pdf', rotulo: 'PDF' }, { valor: 'jpg', rotulo: 'JPG' }, { valor: 'png', rotulo: 'PNG' }];
  const MAX_PDF = 4 * 1024 * 1024;

  const frag = (markup) => document.createRange().createContextualFragment(String(markup));
  const vezes = (n) => (n > 1 ? `${n}º envio` : '1º envio');

  function subnav(ui, atual) {
    const link = (rota, rotulo) => ui.html`<a class="pf-subnav__link" href="#/${rota}"${rota === atual ? ui.html` aria-current="page"` : ''}>${rotulo}</a>`;
    return ui.html`<nav class="pf-subnav" aria-label="Documentos">${link('documentos', 'Revisão')}${link('documentos/tipos', 'Tipos exigidos')}${link('documentos/declaracoes', 'Declarações emitidas')}</nav>`;
  }

  function nomeAluno(ui, a) {
    if (!a) return '—';
    return ui.html`<span class="pf-doc-meta">${a.nome || 'Aluno'}</span><span class="pf-doc-meta">${a.email || ''}</span>`;
  }

  // ===============================================================
  // #/documentos — fila de revisão
  // ===============================================================
  async function montarFila(el, ctx) {
    const ui = ctx.ui;
    const f = ctx.filtros;
    const status = ['em_revisao', 'pendente', 'aprovado', 'nao_enviado', 'todos'].indexOf(f.get('status')) >= 0 ? f.get('status') : 'em_revisao';
    const tipos = await ctx.api.get(API.tipos, { sinal: ctx.sinal }).then((r) => r.itens || []).catch(() => []);
    el.replaceChildren(frag(ui.html`${subnav(ui, 'documentos')}
      <div class="pf-doc-segmento" data-doc-segmento></div>
      <form class="pf-doc-bo-filtros" data-doc-filtros role="search" aria-label="Filtrar documentos">
        <div class="pf-campo"><label class="pf-rotulo" for="pf-doc-f-curso">Curso</label>
          <select class="pf-input" id="pf-doc-f-curso" name="cursoId"><option value="">Todos os cursos</option>${(ctx.cursos || []).map((c) => ui.html`<option value="${c.id}"${c.id === f.get('cursoId') ? ui.html` selected` : ''}>${c.titulo}</option>`)}</select></div>
        <div class="pf-campo"><label class="pf-rotulo" for="pf-doc-f-tipo">Documento</label>
          <select class="pf-input" id="pf-doc-f-tipo" name="sigla"><option value="">Todos os tipos</option>${tipos.map((t) => ui.html`<option value="${t.sigla}"${t.sigla === f.get('sigla') ? ui.html` selected` : ''}>${t.sigla} · ${t.nome}</option>`)}</select></div>
        <div class="pf-campo"><label class="pf-rotulo" for="pf-doc-f-q">Aluno</label>
          <input class="pf-input" id="pf-doc-f-q" name="q" type="search" value="${f.get('q') || ''}" placeholder="Nome ou e-mail"></div>
      </form>
      <div class="pf-doc-reserva" data-doc-tabela aria-live="polite"></div>`));
    const seg = el.querySelector('[data-doc-segmento]');
    const alvo = el.querySelector('[data-doc-tabela]');
    const form = el.querySelector('[data-doc-filtros]');
    const filtrosAtuais = (extra) => {
      const p = new URLSearchParams();
      p.set('status', status);
      const fd = new FormData(form);
      for (const [k, v] of fd.entries()) if (String(v).trim()) p.set(k, String(v).trim());
      Object.entries(extra || {}).forEach(([k, v]) => p.set(k, v));
      return p;
    };
    ui.filtros(seg, {
      rotulo: 'Situação', valor: status,
      opcoes: [
        { valor: 'em_revisao', rotulo: 'Em revisão' }, { valor: 'pendente', rotulo: 'Pendentes' }, { valor: 'aprovado', rotulo: 'Aprovados' },
        { valor: 'nao_enviado', rotulo: 'Não enviados' }, { valor: 'todos', rotulo: 'Todos' }
      ],
      aoMudar: (v) => ctx.navegar('documentos', filtrosAtuais({ status: v }))
    });
    form.addEventListener('change', () => ctx.navegar('documentos', filtrosAtuais()));
    form.addEventListener('submit', (e) => { e.preventDefault(); ctx.navegar('documentos', filtrosAtuais()); });

    ui.esqueleto(alvo, { tipo: 'tabela', linhas: 4 });
    const qs = filtrosAtuais();
    qs.set('porPagina', '100');
    let r;
    try {
      r = await ctx.api.get(`${API.fila}?${qs.toString()}`, { sinal: ctx.sinal });
    } catch (err) {
      if (err && err.name === 'AbortError') return undefined;
      ui.erroCarga(alvo, err, { tentarDeNovo: () => ctx.navegar('documentos', filtrosAtuais()) });
      return undefined;
    }
    ui.tabela(alvo, {
      legenda: `Documentos · ${r.total} ${r.total === 1 ? 'registro' : 'registros'}`,
      chaveLinha: (l) => l.id || `${l.aluno.id}-${l.tipoId}`,
      colunas: [
        { chave: 'aluno', rotulo: 'Aluno', render: (l) => (l.id
          ? ui.html`<a class="pf-doc-link" href="#/documentos/${l.id}" data-doc-abrir="${l.id}">${l.aluno.nome || 'Aluno'}</a><span class="pf-doc-meta">${l.aluno.email || ''}</span>`
          : ui.html`<a class="pf-doc-link" href="#/alunos/${l.aluno.id}/documentos">${l.aluno.nome || 'Aluno'}</a><span class="pf-doc-meta">${l.aluno.email || ''}</span>`) },
        { chave: 'documento', rotulo: 'Documento', render: (l) => ui.html`${l.sigla} · ${l.tipoNome || ''}` },
        { chave: 'cursos', rotulo: 'Curso', secundaria: true, render: (l) => (Array.isArray(l.cursos) && l.cursos.length ? l.cursos.join('; ') : '—') },
        { chave: 'enviadoEm', rotulo: 'Enviado', render: (l) => (l.enviadoEm ? ui.fmt.relativo(l.enviadoEm) : '—') },
        { chave: 'numeroEnvio', rotulo: 'Versão', secundaria: true, render: (l) => (l.numeroEnvio ? vezes(l.numeroEnvio) : '—') },
        { chave: 'status', rotulo: 'Situação', render: (l) => ui.estado(ROTULO_DOC[l.status] || l.status, TOM_DOC[l.status] || 'neutro') }
      ],
      linhas: r.itens,
      vazio: status === 'em_revisao'
        ? { titulo: 'Nenhum documento aguardando revisão.', texto: 'Os envios novos dos alunos aparecem aqui, do mais antigo para o mais novo.' }
        : { titulo: 'Nenhum documento nesta situação.', texto: 'Mude a situação ou os filtros acima.' }
    });
    return undefined;
  }

  // ===============================================================
  // #/documentos/:envioId — revisão
  // ===============================================================
  async function montarRevisao(el, ctx) {
    const ui = ctx.ui;
    const id = ctx.params.envioId;
    ui.esqueleto(el, { tipo: 'texto', linhas: 6 });
    const d = await ctx.api.get(API.envio(id), { sinal: ctx.sinal });
    const e = d.envio;
    const t = d.tipo || {};
    ctx.definirTitulo(`${e.sigla} · ${t.nome || 'Documento'}`);
    const imagem = e.mime === 'image/jpeg' || e.mime === 'image/png';
    const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[e.mime] || 'pdf';
    const nomeGerado = `${e.sigla}-v${e.numeroEnvio}.${ext}`;
    const decisoes = [];
    if (e.atual && e.status === 'em_revisao') {
      decisoes.push(ui.html`<button type="button" class="dmc-btn dmc-btn--primary" data-doc-decidir="aprovado">Aprovar</button>`);
      decisoes.push(ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-doc-decidir="pendente">Marcar pendente</button>`);
    } else if (e.atual && e.status === 'aprovado') {
      decisoes.push(ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-doc-decidir="pendente" data-doc-novo-envio>Solicitar novo envio</button>`);
    }
    el.replaceChildren(frag(ui.html`<p><a class="dmc-btn dmc-btn--link" href="#/documentos">Voltar à fila</a></p>
      <div class="pf-doc-bo-grade">
        <section aria-labelledby="pf-doc-rev-arquivo">
          <h2 class="pf-secao-titulo" id="pf-doc-rev-arquivo">Arquivo enviado</h2>
          <p>${ui.estado(ROTULO_DOC[e.status] || e.status, TOM_DOC[e.status] || 'neutro')} <span class="pf-doc-meta">${vezes(e.numeroEnvio)} · enviado em ${ui.fmt.dataHora(e.enviadoEm)}</span></p>
          ${e.status === 'pendente' && e.motivo ? ui.html`<div class="pf-alerta pf-alerta--aviso pf-alerta--compacto">${ui.icone('estadoAviso')}<p>Motivo informado ao aluno: ${e.motivo}</p></div>` : ''}
          ${e.temArquivo && imagem ? ui.html`<figure class="pf-doc-previa"><img data-doc-previa alt="Prévia do documento ${e.sigla} enviado pelo aluno"></figure>` : ''}
          <dl class="pf-doc-dados">
            <div><dt>Arquivo</dt><dd>${nomeGerado}</dd></div>
            <div><dt>Tamanho</dt><dd>${e.tamanho != null ? ui.fmt.bytes(e.tamanho) : '—'}</dd></div>
          </dl>
          ${e.sha256 ? ui.html`<p class="pf-ajuda">SHA-256 do arquivo:</p><div class="pf-doc-hash">${ui.codigo(e.sha256)}</div>` : ''}
          <div class="pf-doc-acoes">
            ${e.temArquivo ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-doc-abrir-arquivo>${imagem ? 'Abrir em tamanho real' : 'Abrir PDF em nova aba'}</button>` : ''}
            ${decisoes}
          </div>
          ${decisoes.length ? ui.html`<label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" data-doc-proximo checked> <span>Abrir o próximo depois de decidir</span></label>` : ''}
        </section>
        <aside aria-labelledby="pf-doc-rev-aluno">
          <h2 class="pf-secao-titulo" id="pf-doc-rev-aluno">Aluno</h2>
          <dl class="pf-doc-dados">
            <div><dt>Nome de registro</dt><dd>${d.aluno.nomeRegistro || 'Não informado no cadastro'}</dd></div>
            ${d.aluno.nomeSocial ? ui.html`<div><dt>Nome social</dt><dd>${d.aluno.nomeSocial}</dd></div>` : ''}
            <div><dt>E-mail</dt><dd>${d.aluno.email || '—'}</dd></div>
            <div><dt>Curso(s)</dt><dd>${Array.isArray(d.cursos) ? (d.cursos.map((c) => c.titulo).join('; ') || '—') : '—'}</dd></div>
          </dl>
          <p><a class="dmc-btn dmc-btn--link" href="#/alunos/${d.aluno.id}/documentos">Todos os documentos do aluno</a></p>
          <h2 class="pf-secao-titulo">Tipo</h2>
          <p>${t.sigla || e.sigla} · ${t.nome || ''}</p>
          ${t.descricao ? ui.html`<p class="pf-ajuda">Orientação ao aluno: ${t.descricao}</p>` : ''}
          <h2 class="pf-secao-titulo">Histórico de envios</h2>
          <ul class="pf-doc-historico">${d.historico.map((h) => ui.html`<li>
            <span>${vezes(h.numeroEnvio)} · ${ROTULO_DOC[h.status] || h.status}</span>
            <span class="pf-doc-meta">${ui.fmt.dataHora(h.enviadoEm)}${h.motivo ? ` · motivo: ${h.motivo}` : ''}</span></li>`)}</ul>
        </aside>
      </div>`));
    el.removeAttribute('aria-busy');
    const img = el.querySelector('[data-doc-previa]');
    if (img) ui.imagemProtegida(img, API.envioArquivo(e.id)).catch(() => { img.alt = 'Não foi possível carregar a prévia.'; });
    const abrir = el.querySelector('[data-doc-abrir-arquivo]');
    if (abrir) abrir.addEventListener('click', async () => {
      ui.ocupado(abrir, true, 'Abrindo…');
      try { await ui.abrirArquivo(API.envioArquivo(e.id), { nome: nomeGerado }); } catch (err) { ui.toast(err.message || 'Não foi possível abrir o arquivo.', { tipo: 'erro' }); } finally { ui.ocupado(abrir, false); }
    });
    el.querySelectorAll('[data-doc-decidir]').forEach((b) => b.addEventListener('click', async () => {
      const decisao = b.getAttribute('data-doc-decidir');
      const proximo = el.querySelector('[data-doc-proximo]');
      const seguir = () => {
        if (proximo && proximo.checked && d.proximo) ctx.navegar(`documentos/${d.proximo}`);
        else ctx.navegar('documentos');
      };
      if (decisao === 'aprovado') {
        ui.ocupado(b, true, 'Aprovando…');
        try {
          await ctx.api.put(API.revisao(e.id), { decisao: 'aprovado', versao: e.versao });
          ui.toast('Documento aprovado. O aluno foi notificado.', { tipo: 'sucesso' });
          seguir();
        } catch (err) {
          ui.ocupado(b, false);
          ui.toast(err.message || 'Não foi possível aprovar agora.', { tipo: 'erro' });
        }
        return;
      }
      const r = await ui.formulario({
        titulo: b.hasAttribute('data-doc-novo-envio') ? 'Solicitar novo envio' : 'Marcar como pendente',
        descricao: 'O aluno lê o motivo na tela de documentos e pode enviar de novo.',
        rotuloEnviar: b.hasAttribute('data-doc-novo-envio') ? 'Solicitar novo envio' : 'Marcar pendente',
        campos: [
          { nome: 'tipo', rotulo: 'Motivo', tipo: 'select', obrigatorio: true, opcoes: MOTIVOS_PENDENCIA },
          { nome: 'texto', rotulo: 'Texto que o aluno lê', tipo: 'textarea', max: 400, ajuda: 'Ex.: imagem cortada no verso. Envie frente e verso.' }
        ],
        validar: (v) => (v.tipo === 'Outro' && (!v.texto || v.texto.length < 5) ? { texto: 'Descreva o motivo (pelo menos 5 caracteres).' } : null),
        enviar: async (v) => {
          const motivo = v.texto ? (v.tipo === 'Outro' ? v.texto : `${v.tipo}. ${v.texto}`) : v.tipo;
          return ctx.api.put(API.revisao(e.id), { decisao: 'pendente', motivo: motivo.slice(0, 500), versao: e.versao });
        }
      });
      if (!r) return;
      ui.toast('Pendência registrada. O aluno foi notificado.', { tipo: 'sucesso' });
      seguir();
    }));
    return undefined;
  }

  // ===============================================================
  // #/documentos/tipos — tipos exigidos
  // ===============================================================
  async function montarTipos(el, ctx) {
    const ui = ctx.ui;
    ui.esqueleto(el, { tipo: 'tabela', linhas: 4 });
    const r = await ctx.api.get(API.tipos, { sinal: ctx.sinal });
    const tipos = r.itens || [];
    const cursos = ctx.cursos || [];
    const tituloCurso = (id) => (cursos.find((c) => c.id === id) || {}).titulo || id;
    const faltamSugeridos = ['DOC', 'DIP', 'CERT', 'HIS', 'RES'].filter((s) => !tipos.some((t) => t.sigla === s));
    el.replaceChildren(frag(ui.html`${subnav(ui, 'documentos/tipos')}
      <p class="pf-ajuda">Tamanho máximo único: 4 MB por arquivo. Tipo já usado em envios não se apaga: desative.</p>
      <div class="pf-doc-acoes">
        <button type="button" class="dmc-btn dmc-btn--primary" data-doc-novo-tipo>Novo tipo</button>
        ${faltamSugeridos.length ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-doc-sugeridos>Criar sugestões (${faltamSugeridos.join(', ')})</button>` : ''}
      </div>
      <div data-doc-form-tipo></div>
      <div class="pf-doc-reserva" data-doc-tipos></div>`));
    el.removeAttribute('aria-busy');
    ui.tabela(el.querySelector('[data-doc-tipos]'), {
      legenda: 'Tipos de documento',
      colunas: [
        { chave: 'sigla', rotulo: 'Sigla' },
        { chave: 'nome', rotulo: 'Documento', render: (t) => ui.html`${t.nome}${t.descricao ? ui.html`<span class="pf-doc-meta">${t.descricao}</span>` : ''}` },
        { chave: 'formatos', rotulo: 'Formatos', secundaria: true, render: (t) => (t.formatos || []).map((x) => x.toUpperCase()).join(', ') },
        { chave: 'escopo', rotulo: 'Exigido de', render: (t) => (t.escopo === 'todos' ? 'Todos os cursos' : (t.cursoIds || []).map(tituloCurso).join('; ')) },
        { chave: 'obrigatorio', rotulo: 'Obrigatório', secundaria: true, render: (t) => (t.obrigatorio ? 'Sim' : 'Não') },
        { chave: 'ativo', rotulo: 'Situação', render: (t) => ui.estado(t.ativo ? 'Ativo' : 'Inativo', t.ativo ? 'sucesso' : 'neutro') },
        { chave: 'acoes', rotulo: '', tipo: 'acao', render: (t) => ui.html`<button type="button" class="dmc-btn dmc-btn--link" data-doc-editar="${t.id}" aria-label="Editar ${t.sigla}">Editar</button>` }
      ],
      linhas: tipos,
      vazio: { titulo: 'Nenhum tipo de documento cadastrado.', texto: 'Crie as sugestões (nascem inativas) ou um tipo novo. Nada é exigido do aluno até você ativar.' }
    });

    const formEl = el.querySelector('[data-doc-form-tipo]');
    function abrirForm(t) {
      const novo = !t;
      const v = t || { sigla: '', nome: '', descricao: '', formatos: ['pdf', 'jpg', 'png'], escopo: 'todos', cursoIds: [], obrigatorio: true, ativo: false, ordem: (tipos.length + 1) * 10 };
      formEl.replaceChildren(frag(ui.html`<section class="pf-detalhe pf-doc-secao" aria-labelledby="pf-doc-form-titulo">
        <div class="pf-detalhe__cabeca"><h2 id="pf-doc-form-titulo" tabindex="-1">${novo ? 'Novo tipo de documento' : `Editar ${v.sigla}`}</h2></div>
        <form class="pf-detalhe__corpo pf-doc-bo-form" data-doc-tipo-form novalidate>
          <div class="pf-campo"><label class="pf-rotulo" for="pf-doc-t-sigla">Sigla *</label><input class="pf-input" id="pf-doc-t-sigla" name="sigla" maxlength="6" value="${v.sigla}" ${!novo && v.emUso ? 'readonly' : ''} aria-describedby="pf-doc-t-sigla-ajuda"><p class="pf-ajuda" id="pf-doc-t-sigla-ajuda">2 a 6 letras maiúsculas (ex.: DOC). Não muda depois do primeiro envio.</p></div>
          <div class="pf-campo"><label class="pf-rotulo" for="pf-doc-t-nome">Nome *</label><input class="pf-input" id="pf-doc-t-nome" name="nome" maxlength="80" value="${v.nome}"></div>
          <div class="pf-campo"><label class="pf-rotulo" for="pf-doc-t-desc">Orientação ao aluno</label><textarea class="pf-input" id="pf-doc-t-desc" name="descricao" maxlength="300" rows="3">${v.descricao || ''}</textarea></div>
          <fieldset class="pf-campo"><legend class="pf-rotulo">Formatos aceitos</legend>${FORMATOS.map((fm) => ui.html`<label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" name="formatos" value="${fm.valor}"${(v.formatos || []).indexOf(fm.valor) >= 0 ? ui.html` checked` : ''}> <span>${fm.rotulo}</span></label>`)}</fieldset>
          <div class="pf-campo"><label class="pf-rotulo" for="pf-doc-t-escopo">Exigido de</label><select class="pf-input" id="pf-doc-t-escopo" name="escopo"><option value="todos"${v.escopo === 'todos' ? ui.html` selected` : ''}>Todos os alunos com matrícula</option><option value="cursos"${v.escopo === 'cursos' ? ui.html` selected` : ''}>Só alunos dos cursos marcados</option></select></div>
          <fieldset class="pf-campo"><legend class="pf-rotulo">Cursos (quando "só dos cursos marcados")</legend><div class="pf-doc-bo-cursos">${cursos.length ? cursos.map((c) => ui.html`<label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" name="cursoIds" value="${c.id}"${(v.cursoIds || []).indexOf(c.id) >= 0 ? ui.html` checked` : ''}> <span>${c.titulo}</span></label>`) : ui.html`<p class="pf-ajuda">Nenhum curso cadastrado.</p>`}</div></fieldset>
          <label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" name="obrigatorio"${v.obrigatorio ? ui.html` checked` : ''}> <span>Obrigatório</span></label>
          <label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" name="ativo"${v.ativo ? ui.html` checked` : ''}> <span>Ativo (passa a ser exigido dos alunos)</span></label>
          <div class="pf-campo"><label class="pf-rotulo" for="pf-doc-t-ordem">Ordem na lista</label><input class="pf-input" id="pf-doc-t-ordem" name="ordem" type="number" min="0" max="9999" value="${v.ordem}"></div>
          <div data-doc-tipo-erro></div>
          <div class="pf-doc-acoes">
            <button type="submit" class="dmc-btn dmc-btn--primary">${novo ? 'Criar tipo' : 'Salvar'}</button>
            <button type="button" class="dmc-btn dmc-btn--secondary" data-doc-fechar-form>Cancelar</button>
            ${!novo && !v.emUso ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary pf-btn--perigo" data-doc-excluir-tipo>Excluir</button>` : ''}
          </div>
        </form>
      </section>`));
      const titulo = formEl.querySelector('#pf-doc-form-titulo');
      if (titulo) titulo.focus();
      const form = formEl.querySelector('[data-doc-tipo-form]');
      formEl.querySelector('[data-doc-fechar-form]').addEventListener('click', () => formEl.replaceChildren());
      const excluir = formEl.querySelector('[data-doc-excluir-tipo]');
      if (excluir) excluir.addEventListener('click', async () => {
        const ok = await ui.confirmar({ titulo: `Excluir ${v.sigla}?`, texto: 'O tipo ainda não tem envios e sai do catálogo.', rotuloConfirmar: 'Excluir', perigo: true });
        if (!ok) return;
        try { await ctx.api.del(API.tipo(v.id)); ui.toast('Tipo excluído.', { tipo: 'sucesso' }); ctx.navegar('documentos/tipos'); } catch (err) { ui.toast(err.message, { tipo: 'erro' }); }
      });
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const corpo = {
          nome: String(fd.get('nome') || '').trim(), descricao: String(fd.get('descricao') || '').trim(),
          formatos: fd.getAll('formatos').map(String), escopo: String(fd.get('escopo') || 'todos'), cursoIds: fd.getAll('cursoIds').map(String),
          obrigatorio: fd.get('obrigatorio') !== null, ativo: fd.get('ativo') !== null, ordem: Number(fd.get('ordem')) || 0
        };
        if (novo || !v.emUso) corpo.sigla = String(fd.get('sigla') || '').trim().toUpperCase();
        if (!novo) corpo.versao = v.versao;
        const erroEl = formEl.querySelector('[data-doc-tipo-erro]');
        erroEl.replaceChildren();
        const botao = form.querySelector('[type="submit"]');
        ui.ocupado(botao, true, 'Salvando…');
        try {
          if (novo) await ctx.api.post(API.tipos, corpo); else await ctx.api.put(API.tipo(v.id), corpo);
          ui.toast(novo ? 'Tipo criado.' : 'Tipo salvo.', { tipo: 'sucesso' });
          ctx.navegar('documentos/tipos');
        } catch (err) {
          ui.ocupado(botao, false);
          const campos = err && err.campos ? Object.values(err.campos).join(' ') : '';
          ui.alerta(erroEl, { tom: 'erro', texto: campos || err.message || 'Não foi possível salvar.' });
        }
      });
    }
    el.querySelector('[data-doc-novo-tipo]').addEventListener('click', () => abrirForm(null));
    el.querySelector('[data-doc-tipos]').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-doc-editar]');
      if (b) abrirForm(tipos.find((t) => t.id === b.getAttribute('data-doc-editar')));
    });
    const sug = el.querySelector('[data-doc-sugeridos]');
    if (sug) sug.addEventListener('click', async () => {
      ui.ocupado(sug, true, 'Criando…');
      try {
        const s = await ctx.api.post(API.sugeridos, {});
        ui.toast(s.criados.length ? `Criados inativos: ${s.criados.join(', ')}. Revise e ative.` : 'As sugestões já existiam.', { tipo: 'sucesso' });
        ctx.navegar('documentos/tipos');
      } catch (err) { ui.ocupado(sug, false); ui.toast(err.message, { tipo: 'erro' }); }
    });
    return undefined;
  }

  // ===============================================================
  // #/contratos — lista e [Anexar contrato]
  // ===============================================================
  async function anexarContrato(ctx, { email = '' } = {}) {
    const ui = ctx.ui;
    let mats = [];
    try {
      const q = new URLSearchParams({ status: 'ativa', porPagina: '100' });
      if (email) q.set('q', email);
      mats = (await ctx.api.get(`${API.matriculas}?${q.toString()}`, { sinal: ctx.sinal })).itens || [];
    } catch (err) {
      ui.toast(err.message || 'Não foi possível listar as matrículas.', { tipo: 'erro' });
      return null;
    }
    if (!mats.length) { ui.toast('Nenhuma matrícula ativa encontrada.', { tipo: 'aviso' }); return null; }
    let criado = null;
    const r = await ui.formulario({
      titulo: 'Anexar contrato',
      descricao: 'O aluno é notificado quando o PDF é anexado.',
      rotuloEnviar: 'Anexar contrato',
      campos: [
        { nome: 'matriculaId', rotulo: 'Matrícula', tipo: 'select', obrigatorio: true, opcoes: mats.map((m) => ({ valor: m.id, rotulo: `${m.numero} · ${(m.aluno && (m.aluno.nome || m.aluno.email)) || 'Aluno'} · ${m.cursoTitulo || m.cursoId}` })) },
        { nome: 'titulo', rotulo: 'Título exibido ao aluno', tipo: 'text', obrigatorio: true, max: 140, valor: 'Contrato de prestação de serviços educacionais' },
        { nome: 'pdf', rotulo: 'PDF do contrato (até 4 MB)', tipo: 'file', obrigatorio: true, aceitar: 'application/pdf,.pdf' },
        { nome: 'motivo', rotulo: 'Motivo, se a conta ainda não confirmou o e-mail (fica na auditoria)', tipo: 'textarea', max: 500, linhas: 2 }
      ],
      validar: (v) => {
        if (v.pdf && !/\.pdf$/i.test(v.pdf.name || '') && v.pdf.type !== 'application/pdf') return { pdf: 'Envie um arquivo PDF.' };
        if (v.pdf && v.pdf.size > MAX_PDF) return { pdf: 'Arquivo maior que 4 MB.' };
        return null;
      },
      enviar: async (v) => {
        if (!criado) {
          const corpo = { matriculaId: v.matriculaId, titulo: v.titulo };
          try {
            criado = await ctx.api.post(API.contratos, corpo);
          } catch (err) {
            if (err && err.codigo === 'email-nao-verificado') {
              if (!v.motivo || v.motivo.length < 10) {
                throw new Error('Esta conta ainda não confirmou o e-mail. Escreva o motivo da confirmação manual (10 a 500 caracteres) e envie de novo.');
              }
              criado = await ctx.api.post(API.contratos, Object.assign(corpo, { confirmarSemVerificacao: true, motivo: v.motivo }));
            } else if (err && err.codigo === 'servico-indisponivel') {
              throw new Error('Não foi possível anexar o contrato agora. Nada foi gravado.');
            } else throw err;
          }
        }
        return ctx.api.upload(API.contratoArquivo(criado.id), v.pdf, 'application/pdf');
      }
    });
    if (r && r.sha256Pdf) {
      ui.toast(`Contrato anexado. SHA-256: ${r.sha256Pdf.slice(0, 4)}…${r.sha256Pdf.slice(-4)}. O aluno foi notificado.`, { tipo: 'sucesso' });
      return criado.id;
    }
    if (criado) ui.toast('O contrato foi criado sem PDF. Abra o contrato para anexar o arquivo.', { tipo: 'aviso' });
    return criado ? criado.id : null;
  }

  function tabelaContratos(ui, alvo, itens, { legenda, semAluno = false, vazio }) {
    const colunas = [];
    if (!semAluno) colunas.push({ chave: 'aluno', rotulo: 'Aluno', render: (c) => ui.html`<a class="pf-doc-link" href="#/contratos/${c.id}">${(c.aluno && c.aluno.nome) || 'Aluno'}</a><span class="pf-doc-meta">${(c.aluno && c.aluno.email) || ''}</span>` });
    colunas.push(
      { chave: 'matriculaNumero', rotulo: 'Matrícula', render: (c) => (semAluno ? ui.html`<a class="pf-doc-link" href="#/contratos/${c.id}">${c.matriculaNumero || '—'}</a>` : (c.matriculaNumero || '—')) },
      { chave: 'cursoTitulo', rotulo: 'Curso', secundaria: true },
      { chave: 'status', rotulo: 'Situação', render: (c) => (c.rascunho ? ui.estado('Sem PDF', 'neutro') : ui.estado(ROTULO_CTR[c.status] || c.status, TOM_CTR[c.status] || 'neutro')) },
      { chave: 'disponivelEm', rotulo: 'Disponibilizado em', render: (c) => (c.disponivelEm ? ui.fmt.data(c.disponivelEm) : '—') },
      { chave: 'assinadoEm', rotulo: 'Assinado em', render: (c) => (c.assinadoEm ? ui.fmt.dataHora(c.assinadoEm) : '—') },
      { chave: 'codigoVerificacao', rotulo: 'Código de verificação', secundaria: true, render: (c) => c.codigoVerificacao || '—' }
    );
    ui.tabela(alvo, { legenda, colunas, linhas: itens, vazio });
  }

  async function montarContratos(el, ctx) {
    const ui = ctx.ui;
    const f = ctx.filtros;
    const status = ['pendente', 'assinado', 'cancelado', 'todos'].indexOf(f.get('status')) >= 0 ? f.get('status') : 'pendente';
    el.replaceChildren(frag(ui.html`<div class="pf-doc-acoes"><button type="button" class="dmc-btn dmc-btn--primary" data-doc-anexar>Anexar contrato</button></div>
      <div class="pf-doc-segmento" data-doc-segmento></div>
      <div class="pf-doc-reserva" data-doc-tabela aria-live="polite"></div>
      <p class="pf-ajuda">Provedor: assinatura nativa da plataforma (assinatura eletrônica simples). Enquanto houver contrato pendente, o portal do aluno mostra o aviso de assinatura.</p>`));
    const alvo = el.querySelector('[data-doc-tabela]');
    ui.esqueleto(alvo, { tipo: 'tabela', linhas: 4 });
    let r;
    try {
      r = await ctx.api.get(`${API.contratos}?status=${encodeURIComponent(status)}&porPagina=100`, { sinal: ctx.sinal });
    } catch (err) {
      if (err && err.name === 'AbortError') return undefined;
      ui.erroCarga(alvo, err, { tentarDeNovo: () => ctx.navegar('contratos', f) });
      return undefined;
    }
    const k = r.contagem || {};
    ui.filtros(el.querySelector('[data-doc-segmento]'), {
      rotulo: 'Situação dos contratos', valor: status,
      opcoes: [
        { valor: 'pendente', rotulo: 'Pendentes', contador: k.pendente },
        { valor: 'assinado', rotulo: 'Assinados', contador: k.assinado },
        { valor: 'cancelado', rotulo: 'Cancelados', contador: k.cancelado },
        { valor: 'todos', rotulo: 'Todos' }
      ],
      aoMudar: (v) => ctx.navegar('contratos', { status: v })
    });
    tabelaContratos(ui, alvo, r.itens, {
      legenda: `Contratos · ${r.total}`,
      vazio: { titulo: status === 'pendente' ? 'Nenhum contrato pendente.' : 'Nenhum contrato nesta situação.', texto: 'Use [Anexar contrato] para disponibilizar o contrato de uma matrícula.' }
    });
    el.querySelector('[data-doc-anexar]').addEventListener('click', async () => {
      const id = await anexarContrato(ctx, { email: f.get('email') || '' });
      if (id) ctx.navegar(`contratos/${id}`);
    });
    if (f.get('anexar') === '1') {
      const id = await anexarContrato(ctx, { email: f.get('email') || '' });
      if (id) ctx.navegar(`contratos/${id}`);
    }
    return undefined;
  }

  // ===============================================================
  // #/contratos/:id — detalhe
  // ===============================================================
  async function montarContrato(el, ctx) {
    const ui = ctx.ui;
    const id = ctx.params.id;
    ui.esqueleto(el, { tipo: 'texto', linhas: 6 });
    const { contrato: c } = await ctx.api.get(API.contrato(id), { sinal: ctx.sinal });
    ctx.definirTitulo(c.titulo);
    const a = c.assinatura;
    const fatores = a ? a.fatores.map((x) => ({ sessao: 'sessão', senha: 'senha', totp: 'código do aplicativo' }[x] || x)).join(' + ') : '';
    el.replaceChildren(frag(ui.html`<p><a class="dmc-btn dmc-btn--link" href="#/contratos">Voltar aos contratos</a></p>
      <dl class="pf-doc-dados">
        <div><dt>Aluno</dt><dd>${(c.aluno && c.aluno.nome) || '—'}<span class="pf-doc-meta">${(c.aluno && c.aluno.email) || ''}</span></dd></div>
        <div><dt>Matrícula</dt><dd>${c.matriculaNumero || '—'}</dd></div>
        <div><dt>Curso</dt><dd>${c.cursoTitulo || '—'}</dd></div>
        <div><dt>Situação</dt><dd>${c.rascunho ? ui.estado('Sem PDF', 'neutro') : ui.estado(ROTULO_CTR[c.status] || c.status, TOM_CTR[c.status] || 'neutro')}</dd></div>
        <div><dt>Disponibilizado em</dt><dd>${c.disponivelEm ? ui.fmt.dataHora(c.disponivelEm) : '—'}</dd></div>
        <div><dt>Aberto pelo aluno em</dt><dd>${c.visualizadoEm ? ui.fmt.dataHora(c.visualizadoEm) : '—'}</dd></div>
        <div><dt>Tamanho</dt><dd>${c.tamanho != null ? ui.fmt.bytes(c.tamanho) : '—'}</dd></div>
        <div><dt>Provedor</dt><dd>Assinatura nativa</dd></div>
      </dl>
      ${c.sha256Pdf ? ui.html`<p class="pf-ajuda">SHA-256 do PDF:</p><div class="pf-doc-hash">${ui.codigo(c.sha256Pdf)}</div>` : ''}
      <div class="pf-doc-acoes">
        ${c.temArquivo ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-doc-abrir-pdf>Abrir PDF em nova aba</button>` : ''}
        ${c.status === 'pendente' ? ui.html`<button type="button" class="dmc-btn dmc-btn--${c.temArquivo ? 'secondary' : 'primary'}" data-doc-pdf>${c.temArquivo ? 'Substituir PDF' : 'Anexar PDF'}</button>` : ''}
        ${a ? ui.html`<a class="dmc-btn dmc-btn--primary" href="contrato.html?id=${c.id}&amp;admin=1&amp;comprovante=1">Comprovante de assinatura</a>` : ''}
        ${c.status !== 'cancelado' ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary pf-btn--perigo" data-doc-cancelar>Cancelar contrato</button>` : ''}
      </div>
      ${a ? ui.html`<section class="pf-doc-secao" aria-labelledby="pf-doc-evid"><h2 id="pf-doc-evid">Evidências da assinatura</h2>
        <dl class="pf-doc-dados">
          <div><dt>Aceite autenticado por</dt><dd>${a.identificacaoNoAto.nomeRegistro || '—'}<span class="pf-doc-meta">${a.identificacaoNoAto.email || ''}${a.identificacaoNoAto.documento ? ` · ${a.identificacaoNoAto.documento.tipo === 'cpf' ? 'CPF' : 'Passaporte'} ${a.identificacaoNoAto.documento.numero}` : ''}</span></dd></div>
          <div><dt>Data e hora</dt><dd>${ui.fmt.dataHora(a.em)}</dd></div>
          <div><dt>Código de verificação</dt><dd>${c.codigoVerificacao}</dd></div>
          <div><dt>Fatores</dt><dd>${fatores}</dd></div>
          <div><dt>Versão do texto de aceite</dt><dd>${a.versaoTexto}</dd></div>
          <div><dt>Endereço de rede (truncado)</dt><dd>${a.ipTruncado || '—'}</dd></div>
          <div><dt>Navegador</dt><dd>${a.userAgent || '—'}</dd></div>
          <div><dt>E-mail confirmado no ato</dt><dd>${a.emailVerificado ? 'Sim' : 'Não'}</dd></div>
          ${a.credencialRedefinidaPelaCoordenacaoEm ? ui.html`<div><dt>Acesso redefinido pela coordenação em</dt><dd>${ui.fmt.dataHora(a.credencialRedefinidaPelaCoordenacaoEm)}</dd></div>` : ''}
          <div><dt>Selo</dt><dd>${a.hashPrefixo || '—'}</dd></div>
        </dl>
        <p class="pf-ajuda">Hash do PDF assinado:</p><div class="pf-doc-hash">${ui.codigo(a.sha256Pdf)}</div>
      </section>` : ''}
      ${c.cancelamento ? ui.html`<div class="pf-alerta pf-alerta--info pf-doc-secao">${ui.icone('estadoInfo')}<p>Cancelado em ${ui.fmt.dataHora(c.cancelamento.em)}. Motivo: ${c.cancelamento.motivo || '—'}${a ? ' A assinatura registrada é preservada.' : ''}</p></div>` : ''}
      ${c.substituicoes && c.substituicoes.length ? ui.html`<section class="pf-doc-secao"><h2>Substituições do PDF</h2><ul class="pf-doc-historico">${c.substituicoes.map((s) => ui.html`<li><span>${ui.fmt.dataHora(s.em)} · ${s.motivo || ''}</span><span class="pf-doc-meta">${(s.sha256Anterior || '').slice(0, 12)}… para ${(s.sha256Novo || '').slice(0, 12)}…</span></li>`)}</ul></section>` : ''}`));
    el.removeAttribute('aria-busy');
    const abrir = el.querySelector('[data-doc-abrir-pdf]');
    if (abrir) abrir.addEventListener('click', async () => {
      ui.ocupado(abrir, true, 'Abrindo…');
      try { await ui.abrirArquivo(API.contratoArquivo(c.id), { nome: `contrato-${c.matriculaNumero || c.id}.pdf` }); } catch (err) { ui.toast(err.message, { tipo: 'erro' }); } finally { ui.ocupado(abrir, false); }
    });
    const pdf = el.querySelector('[data-doc-pdf]');
    if (pdf) pdf.addEventListener('click', async () => {
      let motivo = null;
      if (c.temArquivo) {
        const v = await ui.formulario({
          titulo: 'Substituir o PDF', descricao: 'A substituição zera a leitura do aluno: ele precisa abrir a versão nova antes de assinar.', rotuloEnviar: 'Continuar',
          campos: [{ nome: 'motivo', rotulo: 'Motivo da substituição (fica na auditoria)', tipo: 'textarea', obrigatorio: true, max: 300 }],
          validar: (x) => (x.motivo.length < 5 ? { motivo: 'Escreva pelo menos 5 caracteres.' } : null)
        });
        if (!v) return;
        motivo = v.motivo;
      }
      const r = await ui.upload({
        titulo: c.temArquivo ? 'Novo PDF do contrato' : 'PDF do contrato', formatos: ['pdf'], maxBytes: MAX_PDF, rotuloEnviar: 'Enviar PDF',
        avisoBaseLegal: 'O aluno é notificado quando o PDF é anexado.',
        enviar: (arquivo) => ctx.api.upload(API.contratoArquivo(c.id), arquivo, 'application/pdf', motivo ? { cabecalhos: { 'X-Motivo': encodeURIComponent(motivo) } } : undefined)
      });
      if (!r) return;
      ui.toast(r.substituido ? 'PDF substituído.' : 'PDF anexado. O aluno foi notificado.', { tipo: 'sucesso' });
      ctx.navegar(`contratos/${c.id}`);
    });
    const cancelar = el.querySelector('[data-doc-cancelar]');
    if (cancelar) cancelar.addEventListener('click', async () => {
      const r = await ui.confirmar({
        titulo: 'Cancelar contrato', perigo: true, motivo: true, rotuloConfirmar: 'Cancelar contrato', rotuloCancelar: 'Voltar',
        texto: a ? 'O contrato assinado passa a constar como cancelado (distrato). A assinatura registrada é preservada.' : 'O contrato pendente deixa de poder ser assinado.'
      });
      if (!r) return;
      try {
        await ctx.api.post(API.contratoCancelar(c.id), { motivo: r.motivo });
        ui.toast('Contrato cancelado. O aluno foi notificado.', { tipo: 'sucesso' });
        ctx.navegar(`contratos/${c.id}`);
      } catch (err) { ui.toast(err.message, { tipo: 'erro' }); }
    });
    return undefined;
  }

  // ===============================================================
  // Abas do aluno (moldura da F8, D-65)
  // ===============================================================
  async function montarAbaDocumentos(el, ctx) {
    const ui = ctx.ui;
    ui.esqueleto(el, { tipo: 'tabela', linhas: 3 });
    const r = await ctx.api.get(API.doAluno(ctx.params.userId), { sinal: ctx.sinal });
    el.removeAttribute('aria-busy');
    const res = r.resumo || {};
    el.replaceChildren(frag(ui.html`<p class="pf-doc-resumo__texto">${res.exigidos ? `${res.aprovados} de ${res.exigidos} aprovados` : 'Nenhum documento exigido deste aluno.'}</p><div data-doc-tabela></div>`));
    ui.tabela(el.querySelector('[data-doc-tabela]'), {
      legenda: 'Documentos do aluno',
      chaveLinha: 'tipoId',
      colunas: [
        { chave: 'sigla', rotulo: 'Sigla' },
        { chave: 'nome', rotulo: 'Documento', render: (i) => (i.envioId ? ui.html`<a class="pf-doc-link" href="#/documentos/${i.envioId}">${i.nome}</a>` : i.nome) },
        { chave: 'enviadoEm', rotulo: 'Enviado', render: (i) => (i.enviadoEm ? ui.fmt.data(i.enviadoEm) : '—') },
        { chave: 'status', rotulo: 'Situação', render: (i) => ui.html`${ui.estado(ROTULO_DOC[i.status] || i.status, TOM_DOC[i.status] || 'neutro')}${i.motivo ? ui.html`<span class="pf-doc-meta">${i.motivo}</span>` : ''}` }
      ],
      linhas: r.itens,
      vazio: { titulo: 'Nenhum documento exigido deste aluno.', texto: 'Os tipos ativos em Documentos › Tipos exigidos valem para alunos com matrícula.' }
    });
    return undefined;
  }

  async function montarAbaContratos(el, ctx) {
    const ui = ctx.ui;
    ui.esqueleto(el, { tipo: 'tabela', linhas: 3 });
    const r = await ctx.api.get(`${API.contratos}?userId=${encodeURIComponent(ctx.params.userId)}&porPagina=100`, { sinal: ctx.sinal });
    el.removeAttribute('aria-busy');
    const email = ctx.aluno && ctx.aluno.email ? ctx.aluno.email : '';
    el.replaceChildren(frag(ui.html`<p><a class="dmc-btn dmc-btn--primary" href="#/contratos?anexar=1${email ? `&email=${encodeURIComponent(email)}` : ''}">Anexar contrato</a></p><div data-doc-tabela></div>`));
    tabelaContratos(ui, el.querySelector('[data-doc-tabela]'), r.itens, {
      legenda: 'Contratos do aluno', semAluno: true,
      vazio: { titulo: 'Este aluno não tem contrato.', texto: 'O contrato é anexado a uma matrícula em Contratos › Anexar contrato.' }
    });
    return undefined;
  }

  // ---------------------------------------------------------------
  // Registro (índice §6.3: F4b, D-78)
  // ---------------------------------------------------------------
  P.registrar({ rota: 'documentos', titulo: 'Documentos', papeis: SO_ADMIN, montar: montarFila });
  P.registrar({ rota: 'documentos/tipos', titulo: 'Tipos de documento exigidos', papeis: SO_ADMIN, montar: montarTipos });
  P.registrar({ rota: 'documentos/:envioId', titulo: 'Revisão de documento', papeis: SO_ADMIN, montar: montarRevisao });
  P.registrar({ rota: 'contratos', titulo: 'Contratos', papeis: SO_ADMIN, montar: montarContratos });
  P.registrar({ rota: 'contratos/:id', titulo: 'Contrato', papeis: SO_ADMIN, montar: montarContrato });
  P.registrar({ rota: 'alunos/:userId/documentos', titulo: 'Documentos', papeis: SO_ADMIN, montar: montarAbaDocumentos, pai: 'alunos/:userId', aba: 'documentos' });
  P.registrar({ rota: 'alunos/:userId/contratos', titulo: 'Contratos', papeis: SO_ADMIN, montar: montarAbaContratos, pai: 'alunos/:userId', aba: 'contratos' });
})();
