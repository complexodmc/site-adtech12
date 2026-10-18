/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-atendimento.js (F6a)
   Backoffice — Atendimento e Ouvidoria (hospedado em professor.html).
   Spec: PORTAL-UX §7.10 (#/atendimento, #/atendimento/:protocolo),
   §7.11 (#/ouvidoria, #/ouvidoria/:protocolo), §7.5 (aba Atendimentos
   do aluno); PORTAL-API §6.10.1–§6.10.2; DC-40, D-54, D-79.
   - professor: fila dos cursos/turmas que leciona; ouvidoria só a
     encaminhada a ele, saneada (sem identidade);
   - coordenação: tudo, reatribuição, identidade da ouvidoria sob
     demanda (auditada), encaminhar (nunca denúncia);
   - HTML só por DMC_UI.html; sem alert/confirm/prompt.
   ============================================================= */
(function () {
  'use strict';
  const P = window.DMC_Professor;
  if (!P) return;

  const API = {
    fila: '/portal/professor/atendimentos',
    atd: (p) => `/portal/professor/atendimentos/${encodeURIComponent(p)}`,
    atdMsg: (p) => `/portal/professor/atendimentos/${encodeURIComponent(p)}/mensagens`,
    atdEncerrar: (p) => `/portal/professor/atendimentos/${encodeURIComponent(p)}/encerrar`,
    atdReatribuir: (p) => `/portal/admin/atendimentos/${encodeURIComponent(p)}`,
    ouvAdmin: '/portal/admin/ouvidoria',
    ouvAdminUma: (p) => `/portal/admin/ouvidoria/${encodeURIComponent(p)}`,
    ouvAdminMsg: (p) => `/portal/admin/ouvidoria/${encodeURIComponent(p)}/mensagens`,
    ouvAdminEncerrar: (p) => `/portal/admin/ouvidoria/${encodeURIComponent(p)}/encerrar`,
    ouvAdminEncaminhar: (p) => `/portal/admin/ouvidoria/${encodeURIComponent(p)}/encaminhar`,
    ouvProf: '/portal/professor/ouvidoria',
    ouvProfUma: (p) => `/portal/professor/ouvidoria/${encodeURIComponent(p)}`,
    ouvParecer: (p) => `/portal/professor/ouvidoria/${encodeURIComponent(p)}/parecer`,
    equipe: '/portal/admin/equipe'
  };
  const CATEGORIAS = [['academico', 'Acadêmico'], ['secretaria', 'Secretaria'], ['financeiro', 'Financeiro'], ['tecnico', 'Acesso e tecnologia'], ['privacidade', 'Privacidade e dados pessoais']];
  const ROT_CAT = Object.fromEntries(CATEGORIAS);
  const ROT_PEDIDO = { acesso: 'Acesso', correcao: 'Correção', eliminacao: 'Eliminação', compartilhamento: 'Informação sobre compartilhamento', revogacao_consentimento: 'Revogação de consentimento', outro: 'Outro' };
  const TIPOS = [['elogio', 'Elogio'], ['sugestao', 'Sugestão'], ['reclamacao', 'Reclamação'], ['denuncia', 'Denúncia']];
  const ROT_TIPO = Object.fromEntries(TIPOS);
  const SIT = { aberto: ['Aberto', 'info'], respondido: ['Respondido', 'info'], encerrado: ['Encerrado', 'neutro'] };
  const SIT_OUV = { aberto: ['Aberta', 'info'], respondido: ['Respondida', 'info'], encerrado: ['Encerrada', 'neutro'] };
  const DIA = 86400000;

  // ---------- utilidades ----------
  const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  const FMT_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  function fmtData(ui, iso) { return iso ? (ui.fmt && ui.fmt.data ? ui.fmt.data(iso) : FMT_DATA.format(new Date(iso))) : '—'; }
  function fmtDataHora(ui, iso) { return iso ? (ui.fmt && ui.fmt.dataHora ? ui.fmt.dataHora(iso) : `${FMT_DATA.format(new Date(iso))} · ${FMT_HORA.format(new Date(iso))}`) : '—'; }
  function fmtRelativo(ui, iso) {
    if (!iso) return '—';
    if (ui.fmt && ui.fmt.relativo) return ui.fmt.relativo(iso);
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  }
  function fmtMoeda(ui, c) { return Number.isInteger(c) ? (ui.fmt && ui.fmt.moeda ? ui.fmt.moeda(c) : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })) : null; }
  function estado(ui, rotulo, tom) {
    if (typeof ui.estado === 'function') return ui.estado(rotulo, tom);
    const g = ui.icone(tom === 'sucesso' ? 'estadoSucesso' : tom === 'aviso' ? 'estadoAviso' : tom === 'erro' ? 'estadoErro' : tom === 'info' ? 'estadoInfo' : 'estadoNeutro');
    return ui.html`<span class="pf-estado pf-estado--${tom}">${g}${rotulo}</span>`;
  }
  const msgErro = (err) => (err && err.message) || 'Não foi possível concluir agora. Tente de novo.';
  const camposErro = (err) => (err && (err.campos || (err.dados && err.dados.campos))) || null;
  const ehNaoEncontrado = (err) => (err && err.status === 404) || /não encontrad/i.test(msgErro(err));
  const ehConflito = (err) => (err && (err.status === 409 || err.codigo === 'conflito-versao')) || /alterado por outra pessoa/i.test(msgErro(err));

  function avisar(ui, el, texto, tipo) {
    if (typeof ui.toast === 'function') { ui.toast(texto, { tipo: tipo || 'sucesso' }); return; }
    const alvo = el.querySelector('[data-at-aviso]');
    const tom = tipo === 'erro' ? 'erro' : tipo === 'aviso' ? 'aviso' : 'sucesso';
    if (alvo) alvo.innerHTML = ui.html`<div class="pf-alerta pf-alerta--${tom}" role="${tom === 'erro' ? 'alert' : 'status'}"><p>${texto}</p></div>`;
  }

  /** <dialog class="pf-dialogo"> com formulário; `enviar(form)` lança → erro fica no diálogo. */
  function dialogo(ui, { titulo, corpo, rotuloEnviar, perigo = false, largura = 'm', enviar, aoAbrir }) {
    return new Promise((resolver) => {
      const d = document.createElement('dialog');
      d.className = `pf-dialogo${largura === 'p' ? ' pf-dialogo--p' : largura === 'g' ? ' pf-dialogo--g' : ''}`;
      const idT = `pat-${Math.random().toString(36).slice(2, 8)}`;
      d.setAttribute('aria-labelledby', idT);
      d.innerHTML = ui.html`<form method="dialog" novalidate>
        <div class="pf-dialogo__cabeca"><h2 class="pf-dialogo__titulo" id="${idT}">${titulo}</h2></div>
        <div class="pf-dialogo__corpo">${corpo}<div data-dlg-erro></div></div>
        <div class="pf-dialogo__acoes">
          <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-acao="cancelar">Cancelar</button>
          <button type="submit" class="dmc-btn ${perigo ? 'pf-btn--perigo' : 'dmc-btn--primary'}" data-pf-acao="confirmar">${rotuloEnviar}</button>
        </div></form>`;
      document.body.appendChild(d);
      const form = d.querySelector('form');
      const caixa = d.querySelector('[data-dlg-erro]');
      const botao = d.querySelector('[data-pf-acao="confirmar"]');
      let fim = null;
      d.addEventListener('close', () => { d.remove(); resolver(fim); });
      d.querySelector('[data-pf-acao="cancelar"]').addEventListener('click', () => d.close());
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        caixa.textContent = '';
        form.querySelectorAll('.pf-erro-campo').forEach((x) => x.remove());
        form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
        botao.disabled = true;
        try {
          const r = enviar ? await enviar(form) : true;
          fim = r === undefined ? true : r;
          d.close();
        } catch (err) {
          let marcou = false;
          for (const [nome, m] of Object.entries(camposErro(err) || {})) {
            const el = form.elements[nome];
            if (!el || !el.closest) continue;
            el.setAttribute('aria-invalid', 'true');
            const p = document.createElement('p');
            p.className = 'pf-erro-campo';
            p.textContent = String(m);
            (el.closest('.pf-campo') || form).appendChild(p);
            if (!marcou) { el.focus(); marcou = true; }
          }
          if (!marcou) caixa.innerHTML = ui.html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>${msgErro(err)}</p></div>`;
        } finally { botao.disabled = false; }
      });
      d.showModal();
      d.querySelector('[data-pf-acao="cancelar"]').focus();
      if (aoAbrir) aoAbrir(d, form);
    });
  }
  function confirmar(ui, { titulo, texto, rotuloConfirmar }) {
    if (typeof ui.confirmar === 'function') return ui.confirmar({ titulo, texto, rotuloConfirmar, perigo: true });
    return dialogo(ui, { titulo, corpo: ui.html`<p>${texto}</p>`, rotuloEnviar: rotuloConfirmar, perigo: true, largura: 'p' });
  }

  function segmento(ui, rotulo, opcoes, atual, attr) {
    return ui.html`<div class="pf-segmento" role="group" aria-label="${rotulo}">
      ${opcoes.map(([v, r, n]) => ui.html`<button type="button" class="pf-segmento__opcao" ${attr}="${v}" aria-pressed="${v === atual ? 'true' : 'false'}">${r}${Number.isInteger(n) ? ui.html` <span class="pf-segmento__contagem">(${n})</span>` : ''}</button>`)}
    </div>`;
  }

  function prazoTexto(ui, iso, status) {
    if (!iso) return '—';
    const dias = Math.ceil((new Date(iso).getTime() - Date.now()) / DIA);
    const base = `até ${fmtData(ui, iso)}`;
    if (status !== 'encerrado' && dias <= 3) return ui.html`${estado(ui, base, 'aviso')} <span class="pf-at-aguardando">${dias < 0 ? 'vencido' : `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`}</span>`;
    return base;
  }

  // =========================================================
  // Atendimento — fila
  // =========================================================
  function montarFila(el, ctx, { userIdFixo = null } = {}) {
    const ui = ctx.ui;
    const admin = ctx.papel === 'admin';
    const f = ctx.filtros;
    const st = {
      status: ['aberto', 'respondido', 'encerrado', 'todos'].includes(f.get('status')) ? f.get('status') : 'aberto',
      categoria: f.get('categoria') || '', cursoId: f.get('curso') || '', origem: f.get('origem') || '',
      meus: f.get('meus') === '1', pedido: f.get('pedido') === '1', pagina: 1, itens: [], total: 0, contagens: null
    };
    el.innerHTML = ui.html`<div data-at-aviso></div><div data-at-filtros></div><div data-at-lista aria-busy="true"></div>`;

    function hashFiltros() {
      const q = new URLSearchParams();
      if (st.status !== 'aberto') q.set('status', st.status);
      if (st.categoria) q.set('categoria', st.categoria);
      if (st.cursoId) q.set('curso', st.cursoId);
      if (st.origem) q.set('origem', st.origem);
      if (st.meus) q.set('meus', '1');
      if (st.pedido) q.set('pedido', '1');
      return q;
    }

    function desenharFiltros() {
      const c = st.contagens;
      const alvo = el.querySelector('[data-at-filtros]');
      alvo.innerHTML = ui.html`<div class="pf-at-filtros">
        ${segmento(ui, 'Situação', [['aberto', 'Abertos', c && c.aberto], ['respondido', 'Respondidos', c && c.respondido], ['encerrado', 'Encerrados', c && c.encerrado], ['todos', 'Todos', null]], st.status, 'data-at-status')}
        ${admin ? ui.html`<div class="pf-campo"><label class="pf-rotulo" for="pat-cat">Categoria</label>
          <select class="pf-input" id="pat-cat" data-at-f="categoria"><option value="">Todas</option>${CATEGORIAS.map(([v, r]) => ui.html`<option value="${v}" ${st.categoria === v ? 'selected' : ''}>${r}</option>`)}</select></div>` : ''}
        ${ctx.cursos && ctx.cursos.length ? ui.html`<div class="pf-campo"><label class="pf-rotulo" for="pat-curso">Curso</label>
          <select class="pf-input" id="pat-curso" data-at-f="cursoId"><option value="">Todos</option>${ctx.cursos.map((x) => ui.html`<option value="${x.id}" ${st.cursoId === x.id ? 'selected' : ''}>${x.titulo}</option>`)}</select></div>` : ''}
        <div class="pf-campo"><label class="pf-rotulo" for="pat-origem">Origem</label>
          <select class="pf-input" id="pat-origem" data-at-f="origem"><option value="">Todas</option><option value="ia" ${st.origem === 'ia' ? 'selected' : ''}>Assistente</option><option value="humano" ${st.origem === 'humano' ? 'selected' : ''}>Aluno</option></select></div>
        <label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" data-at-meus ${st.meus ? 'checked' : ''}> Comigo</label>
        ${admin ? ui.html`<label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" data-at-pedido ${st.pedido ? 'checked' : ''}> Só pedidos da loja</label>` : ''}
      </div>`;
      alvo.querySelectorAll('[data-at-status]').forEach((b) => b.addEventListener('click', () => { st.status = b.dataset.atStatus; mudar(); }));
      alvo.querySelectorAll('[data-at-f]').forEach((s) => s.addEventListener('change', () => { st[s.dataset.atF] = s.value; mudar(); }));
      alvo.querySelector('[data-at-meus]').addEventListener('change', (ev) => { st.meus = ev.target.checked; mudar(); });
      const ped = alvo.querySelector('[data-at-pedido]');
      if (ped) ped.addEventListener('change', (ev) => { st.pedido = ev.target.checked; mudar(); });
    }

    function mudar() {
      if (!userIdFixo) ctx.navegar('atendimento', hashFiltros());
      else carregar();
    }

    async function carregar(acrescentar = false) {
      const lista = el.querySelector('[data-at-lista]');
      if (!acrescentar) st.pagina = 1;
      lista.setAttribute('aria-busy', 'true');
      const q = new URLSearchParams({ status: st.status, pagina: String(st.pagina), porPagina: '25' });
      if (st.categoria) q.set('categoria', st.categoria);
      if (st.cursoId) q.set('cursoId', st.cursoId);
      if (st.origem) q.set('origem', st.origem);
      if (st.meus) q.set('meus', '1');
      if (st.pedido) q.set('pedido', '1');
      if (userIdFixo) q.set('userId', userIdFixo);
      try {
        const r = await ctx.api.get(`${API.fila}?${q}`);
        st.itens = acrescentar ? st.itens.concat(r.itens || []) : (r.itens || []);
        st.total = r.total || 0;
        st.contagens = r.contagens || null;
        desenharFiltros();
        desenharLista(lista);
      } catch (err) {
        ui.erroCarga(lista, err, { tentarDeNovo: () => carregar() });
      }
    }

    function desenharLista(lista) {
      lista.setAttribute('aria-busy', 'false');
      if (!st.itens.length) {
        lista.innerHTML = ui.html`<div class="pf-vazio"><p class="pf-vazio__titulo">${st.status === 'aberto' ? 'Nenhum atendimento aberto na sua fila.' : 'Nenhum atendimento com estes filtros.'}</p></div>`;
        return;
      }
      const temPrazo = st.itens.some((i) => i.prazoRespostaEm);
      lista.innerHTML = ui.html`<table class="pf-tabela">
        <caption>Atendimentos (${st.total})</caption>
        <thead><tr><th scope="col">Protocolo</th>${userIdFixo ? '' : ui.html`<th scope="col">Aluno</th>`}<th scope="col">Assunto</th><th scope="col" class="pf-tabela__secundaria">Categoria</th><th scope="col" class="pf-tabela__secundaria">Origem</th><th scope="col">Situação</th><th scope="col" class="pf-tabela__secundaria">Responsável</th>${temPrazo ? ui.html`<th scope="col">Prazo</th>` : ''}<th scope="col">Atualizado</th></tr></thead>
        <tbody>${st.itens.map((i) => ui.html`<tr>
          <td data-rotulo="Protocolo"><a class="pf-at-codigo" href="#/atendimento/${i.protocolo}">${i.protocolo}</a></td>
          ${userIdFixo ? '' : ui.html`<td data-rotulo="Aluno">${i.aluno && i.aluno.nome ? i.aluno.nome : '—'}</td>`}
          <td data-rotulo="Assunto">${i.assunto}${i.pedido ? ui.html`<span class="pf-at-aguardando">Pedido da loja · ${(i.pedido.itens || []).length} ${(i.pedido.itens || []).length === 1 ? 'curso' : 'cursos'}</span>` : ''}</td>
          <td data-rotulo="Categoria" class="pf-tabela__secundaria">${ROT_CAT[i.categoria] || i.categoria}</td>
          <td data-rotulo="Origem" class="pf-tabela__secundaria">${i.origem === 'ia' ? 'Assistente' : 'Aluno'}</td>
          <td data-rotulo="Situação">${estado(ui, (SIT[i.status] || ['—'])[0], (SIT[i.status] || [0, 'neutro'])[1])}</td>
          <td data-rotulo="Responsável" class="pf-tabela__secundaria">${i.responsavel && i.responsavel.nome ? i.responsavel.nome : (i.fila === 'coordenacao' ? 'Coordenação' : 'Professores do curso')}</td>
          ${temPrazo ? ui.html`<td data-rotulo="Prazo">${prazoTexto(ui, i.prazoRespostaEm, i.status)}</td>` : ''}
          <td data-rotulo="Atualizado"><time datetime="${i.ultimaAtividadeEm}" title="${fmtDataHora(ui, i.ultimaAtividadeEm)}">${fmtRelativo(ui, i.ultimaAtividadeEm)}</time></td>
        </tr>`)}</tbody></table>
        ${st.itens.length < st.total ? ui.html`<p class="pf-at-mais"><button type="button" class="dmc-btn dmc-btn--secondary" data-at-mais>Carregar mais</button></p>` : ''}`;
      const mais = lista.querySelector('[data-at-mais]');
      if (mais) mais.addEventListener('click', () => { st.pagina += 1; carregar(true); });
    }

    desenharFiltros();
    carregar();
  }

  // =========================================================
  // Atendimento — detalhe
  // =========================================================
  function montarDetalhe(el, ctx) {
    const ui = ctx.ui;
    const admin = ctx.papel === 'admin';
    const protocolo = String(ctx.params.protocolo || '').toUpperCase();
    el.innerHTML = ui.html`<div data-at-aviso></div><div data-at-corpo aria-busy="true"><p class="pf-at-status">Carregando ${protocolo}…</p></div>`;
    const corpo = el.querySelector('[data-at-corpo]');

    async function carregar() {
      let p;
      try {
        p = await ctx.api.get(API.atd(protocolo));
      } catch (err) {
        corpo.setAttribute('aria-busy', 'false');
        if (ehNaoEncontrado(err)) {
          corpo.innerHTML = ui.html`<div class="pf-vazio"><p class="pf-vazio__titulo">Não encontramos este atendimento na sua fila.</p><div class="pf-vazio__acoes"><a class="dmc-btn dmc-btn--secondary" href="#/atendimento">Voltar à fila</a></div></div>`;
          return;
        }
        ui.erroCarga(corpo, err, { tentarDeNovo: carregar });
        return;
      }
      desenhar(p);
    }

    function desenhar(p) {
      corpo.setAttribute('aria-busy', 'false');
      ctx.definirTitulo(`${p.protocolo} · ${p.assunto}`);
      const encerrado = p.status === 'encerrado';
      const itensTempo = [
        ...(p.mensagens || []).map((m) => ({ em: m.em, m })),
        ...(p.eventos || []).map((e) => ({ em: e.em, e }))
      ].sort((a, b) => String(a.em).localeCompare(String(b.em)));
      corpo.innerHTML = ui.html`
        <p class="pf-at-voltar"><a class="pf-cabecalho__voltar" href="#/atendimento">← Fila de atendimento</a></p>
        <dl class="pf-at-meta">
          <div><dt>Protocolo</dt><dd><span class="pf-at-codigo">${p.protocolo}</span></dd></div>
          <div><dt>Aluno</dt><dd>${p.aluno && p.aluno.id ? ui.html`<a href="#/alunos/${p.aluno.id}">${p.aluno.nome || '—'}</a>` : '—'}${p.aluno && p.aluno.email ? ui.html`<br><span class="pf-at-aguardando">${p.aluno.email}</span>` : ''}</dd></div>
          <div><dt>Curso</dt><dd>${p.curso ? p.curso.titulo : '—'}</dd></div>
          <div><dt>Categoria</dt><dd>${ROT_CAT[p.categoria] || p.categoria}</dd></div>
          <div><dt>Origem</dt><dd>${p.origem === 'ia' ? 'Assistente acadêmico' : 'Aluno'}</dd></div>
          <div><dt>Aberto em</dt><dd>${fmtDataHora(ui, p.criadoEm)}</dd></div>
          <div><dt>Situação</dt><dd>${estado(ui, (SIT[p.status] || ['—'])[0], (SIT[p.status] || [0, 'neutro'])[1])}</dd></div>
          <div><dt>Responsável</dt><dd>${p.roteamento && p.roteamento.responsavelNome ? p.roteamento.responsavelNome : (p.roteamento && p.roteamento.fila === 'coordenacao' ? 'Coordenação' : 'Professores do curso')}</dd></div>
          ${p.pedidoTitular ? ui.html`<div><dt>Tipo de pedido</dt><dd>${ROT_PEDIDO[p.pedidoTitular] || p.pedidoTitular}</dd></div>` : ''}
          ${p.prazoRespostaEm ? ui.html`<div><dt>Prazo de resposta</dt><dd>${prazoTexto(ui, p.prazoRespostaEm, p.status)}</dd></div>` : ''}
        </dl>
        ${p.pedido ? ui.html`<section class="pf-at-pedido" aria-labelledby="pat-pedido">
            <h2 class="pf-secao-titulo" id="pat-pedido">Pedido</h2>
            <ul class="pf-lista">${(p.pedido.itens || []).map((i) => ui.html`<li class="pf-lista__linha"><p class="pf-lista__titulo">${i.titulo}</p><p class="pf-lista__meta">${fmtMoeda(ui, i.valorCentavos) || 'a confirmar'}</p>
              ${admin && p.aluno ? ui.html`<div class="pf-lista__acao"><a class="dmc-btn dmc-btn--primary" href="#/matriculas?nova=1&amp;protocolo=${p.protocolo}&amp;curso=${i.cursoId}&amp;aluno=${p.aluno.id}">Criar matrícula e lançamentos</a></div>` : ''}</li>`)}</ul>
            <p class="pf-at-pedido__total">Total: ${fmtMoeda(ui, p.pedido.totalCentavos) || 'a confirmar'}</p>
            <p class="pf-at-pedido__nota">Valores congelados no momento do pedido. Confira matrícula e pagamento em Matrículas e Financeiro antes de liberar o acesso.</p>
          </section>` : ''}
        ${p.anexoConversa && p.anexoConversa.mensagens && p.anexoConversa.mensagens.length ? ui.html`<details class="pf-at-anexo"><summary>Conversa com o assistente que originou este protocolo</summary>
            <ul class="pf-at-anexo__lista">${p.anexoConversa.mensagens.map((m) => ui.html`<li><strong>${m.papel === 'aluno' ? 'Aluno' : 'Assistente'}</strong> · ${fmtDataHora(ui, m.em)}<br>${m.texto}</li>`)}</ul>
            ${p.anexoConversa.omitidas ? ui.html`<p class="pf-ajuda">${p.anexoConversa.omitidas} trechos sobre documentos, contratos ou financeiro ficaram de fora.</p>` : ''}</details>` : ''}
        <ol class="pf-linha-tempo pf-at-conversa" aria-label="Mensagens e eventos">
          ${itensTempo.map((x) => (x.m
            ? ui.html`<li class="pf-linha-tempo__item"><div class="pf-at-msg ${x.m.autor === 'equipe' ? 'pf-at-msg--equipe' : ''}"><p class="pf-at-msg__autor">${x.m.autorNome || (x.m.autor === 'aluno' ? 'Aluno' : 'Equipe')} · <time datetime="${x.m.em}">${fmtDataHora(ui, x.m.em)}</time></p><p class="pf-at-msg__texto">${x.m.texto}</p></div></li>`
            : ui.html`<li class="pf-linha-tempo__item pf-linha-tempo__item--sistema">${x.e.texto} · ${fmtDataHora(ui, x.e.em)}</li>`))}
          ${encerrado ? ui.html`<li class="pf-linha-tempo__item pf-linha-tempo__item--sistema">Encerrado em ${fmtDataHora(ui, p.encerradoEm)}${p.motivoEncerramento ? ` · ${p.motivoEncerramento}` : ''}.</li>` : ''}
        </ol>
        ${encerrado ? ui.html`<p class="pf-at-status">Atendimento encerrado. Não há reabertura: o aluno inicia um novo atendimento se precisar.</p>` : ui.html`<form class="pf-at-compositor" data-at-resp novalidate>
            <div class="pf-campo"><label class="pf-rotulo" for="pat-resp">Resposta ao aluno</label>
              <textarea class="pf-input" id="pat-resp" name="texto" rows="5" maxlength="4000"></textarea></div>
            <div data-at-resp-erro></div>
            <div class="pf-at-compositor__acoes">
              <button type="submit" class="dmc-btn dmc-btn--primary">Enviar resposta</button>
              <button type="button" class="dmc-btn dmc-btn--secondary" data-at-encerrar>Encerrar atendimento</button>
              ${admin ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-at-reatribuir>Reatribuir</button>` : ''}
            </div></form>`}`;
      const form = corpo.querySelector('[data-at-resp]');
      if (!form) return;
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const caixa = form.querySelector('[data-at-resp-erro]');
        caixa.textContent = '';
        const texto = form.elements.texto.value;
        if (!texto.trim()) { caixa.innerHTML = ui.html`<p class="pf-erro-campo">Escreva a resposta antes de enviar.</p>`; form.elements.texto.focus(); return; }
        const b = form.querySelector('button[type="submit"]');
        b.disabled = true;
        try {
          await ctx.api.post(API.atdMsg(p.protocolo), { texto });
          await carregar();
          avisar(ui, el, 'Resposta enviada. O aluno foi notificado.', 'sucesso');
        } catch (err) {
          caixa.innerHTML = ui.html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>${msgErro(err)}</p></div>`;
          b.disabled = false;
        }
      });
      corpo.querySelector('[data-at-encerrar]').addEventListener('click', async () => {
        const ok = await dialogo(ui, {
          titulo: 'Encerrar este atendimento?', largura: 'p', perigo: true, rotuloEnviar: 'Encerrar atendimento',
          corpo: ui.html`<p>O aluno é notificado e o atendimento não recebe novas mensagens.</p>
            <div class="pf-campo"><label class="pf-rotulo" for="pat-motivo-enc">Motivo (opcional)</label><input class="pf-input" id="pat-motivo-enc" name="motivo" maxlength="500"></div>`,
          enviar: (f) => ctx.api.post(API.atdEncerrar(p.protocolo), { motivo: f.elements.motivo.value || null })
        });
        if (!ok) return;
        await carregar();
        avisar(ui, el, 'Atendimento encerrado.', 'sucesso');
      });
      const reat = corpo.querySelector('[data-at-reatribuir]');
      if (reat) reat.addEventListener('click', () => reatribuir(p));
    }

    async function reatribuir(p) {
      let equipe = [];
      try { const r = await ctx.api.get(API.equipe); equipe = (r && r.itens) || []; } catch { equipe = []; }
      const ativos = equipe.filter((u) => !u.desativadoEm);
      const ok = await dialogo(ui, {
        titulo: 'Reatribuir atendimento', rotuloEnviar: 'Reatribuir',
        corpo: ui.html`<div class="pf-campo"><label class="pf-rotulo" for="pat-r-cat">Categoria</label>
            <select class="pf-input" id="pat-r-cat" name="categoria">${CATEGORIAS.filter(([v]) => v !== 'privacidade' || p.categoria === 'privacidade').map(([v, r]) => ui.html`<option value="${v}" ${p.categoria === v ? 'selected' : ''}>${r}</option>`)}</select></div>
          <div class="pf-campo"><label class="pf-rotulo" for="pat-r-curso">Curso</label>
            <select class="pf-input" id="pat-r-curso" name="cursoId"><option value="">Nenhum</option>${(ctx.cursos || []).map((c) => ui.html`<option value="${c.id}" ${p.cursoId === c.id ? 'selected' : ''}>${c.titulo}</option>`)}</select></div>
          <div class="pf-campo"><label class="pf-rotulo" for="pat-r-resp">Responsável</label>
            <select class="pf-input" id="pat-r-resp" name="responsavelId" aria-describedby="pat-r-resp-ajuda"><option value="">Sem responsável (fila)</option>${ativos.map((u) => ui.html`<option value="${u.id}" ${p.roteamento && p.roteamento.responsavelId === u.id ? 'selected' : ''}>${u.nome} · ${u.papel === 'admin' ? 'Coordenação' : 'Professor'}</option>`)}</select>
            <p class="pf-ajuda" id="pat-r-resp-ajuda">Professor precisa lecionar no curso do atendimento.</p></div>
          <div class="pf-campo"><label class="pf-rotulo" for="pat-r-motivo">Motivo (fica registrado na auditoria) <span aria-hidden="true">*</span></label>
            <textarea class="pf-input" id="pat-r-motivo" name="motivo" rows="3" minlength="10" maxlength="500" required></textarea></div>`,
        enviar: async (f) => {
          if (f.elements.motivo.value.trim().length < 10) { const e = new Error('Confira os campos destacados.'); e.campos = { motivo: 'Use pelo menos 10 caracteres.' }; throw e; }
          return ctx.api.put(API.atdReatribuir(p.protocolo), {
            categoria: f.elements.categoria.value, cursoId: f.elements.cursoId.value || null,
            responsavelId: f.elements.responsavelId.value || null, motivo: f.elements.motivo.value, versao: p.versao
          });
        }
      }).catch((err) => { if (ehConflito(err)) avisar(ui, el, 'Alguém alterou este atendimento enquanto você editava. Recarregue para ver a versão atual.', 'aviso'); return null; });
      if (!ok) return;
      await carregar();
      avisar(ui, el, 'Atendimento reatribuído.', 'sucesso');
    }

    carregar();
  }

  // =========================================================
  // Ouvidoria
  // =========================================================
  function montarOuvidoria(el, ctx) {
    const ui = ctx.ui;
    if (ctx.papel === 'admin') return montarOuvidoriaCoordenacao(el, ctx);
    const filtro = ['sem', 'com', 'todas'].includes(ctx.filtros.get('parecer')) ? ctx.filtros.get('parecer') : 'sem';
    el.innerHTML = ui.html`<p class="pf-ajuda">A identidade de quem escreveu não é mostrada a professores. Seu parecer vai só para a coordenação.</p><div data-at-lista aria-busy="true"></div>`;
    const lista = el.querySelector('[data-at-lista]');
    (async () => {
      let r;
      try { r = await ctx.api.get(API.ouvProf); } catch (err) { ui.erroCarga(lista, err, { tentarDeNovo: () => montarOuvidoria(el, ctx) }); return; }
      lista.setAttribute('aria-busy', 'false');
      const todos = r.itens || [];
      const itens = todos.filter((i) => (filtro === 'todas' ? true : filtro === 'sem' ? !i.meuParecer : !!i.meuParecer));
      lista.innerHTML = ui.html`<div class="pf-at-filtros">${segmento(ui, 'Parecer', [['sem', 'Sem parecer', r.contagens ? r.contagens.semParecer : null], ['com', 'Com parecer', r.contagens ? r.contagens.comParecer : null], ['todas', 'Todas', todos.length]], filtro, 'data-at-parecer')}</div>
        ${itens.length ? ui.html`<table class="pf-tabela"><caption>Manifestações encaminhadas a você</caption>
          <thead><tr><th scope="col">Protocolo</th><th scope="col">Tipo</th><th scope="col">Assunto</th><th scope="col" class="pf-tabela__secundaria">Curso</th><th scope="col">Encaminhada em</th><th scope="col">Parecer</th></tr></thead>
          <tbody>${itens.map((i) => ui.html`<tr><td data-rotulo="Protocolo"><a class="pf-at-codigo" href="#/ouvidoria/${i.protocolo}">${i.protocolo}</a></td><td data-rotulo="Tipo">${ROT_TIPO[i.tipo] || i.tipo}</td><td data-rotulo="Assunto">${i.assunto}</td><td data-rotulo="Curso" class="pf-tabela__secundaria">${i.curso ? i.curso.titulo : '—'}</td><td data-rotulo="Encaminhada em">${fmtData(ui, i.encaminhadaEm)}</td><td data-rotulo="Parecer">${i.meuParecer ? estado(ui, 'Parecer enviado', 'sucesso') : estado(ui, 'Parecer pendente', 'info')}</td></tr>`)}</tbody></table>`
          : ui.html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhuma manifestação encaminhada a você.</p></div>`}`;
      lista.querySelectorAll('[data-at-parecer]').forEach((b) => b.addEventListener('click', () => ctx.navegar('ouvidoria', new URLSearchParams(b.dataset.atParecer === 'sem' ? '' : `parecer=${b.dataset.atParecer}`))));
    })();
    return undefined;
  }

  function montarOuvidoriaCoordenacao(el, ctx) {
    const ui = ctx.ui;
    const status = ['aberto', 'respondido', 'encerrado', 'todos'].includes(ctx.filtros.get('status')) ? ctx.filtros.get('status') : 'aberto';
    const tipo = ctx.filtros.get('tipo') || '';
    el.innerHTML = ui.html`<div data-at-lista aria-busy="true"></div>`;
    const lista = el.querySelector('[data-at-lista]');
    const nav = (mud) => {
      const q = new URLSearchParams();
      const s = mud.status !== undefined ? mud.status : status;
      const t = mud.tipo !== undefined ? mud.tipo : tipo;
      if (s !== 'aberto') q.set('status', s);
      if (t) q.set('tipo', t);
      ctx.navegar('ouvidoria', q);
    };
    (async () => {
      const q = new URLSearchParams({ status, porPagina: '100' });
      if (tipo) q.set('tipo', tipo);
      let r;
      try { r = await ctx.api.get(`${API.ouvAdmin}?${q}`); } catch (err) { ui.erroCarga(lista, err, { tentarDeNovo: () => montarOuvidoriaCoordenacao(el, ctx) }); return; }
      lista.setAttribute('aria-busy', 'false');
      const c = r.contagens || {};
      const itens = r.itens || [];
      lista.innerHTML = ui.html`<div class="pf-at-filtros">
          ${segmento(ui, 'Situação', [['aberto', 'Abertas', c.aberto], ['respondido', 'Respondidas', c.respondido], ['encerrado', 'Encerradas', c.encerrado], ['todos', 'Todas', null]], status, 'data-at-status')}
          <div class="pf-campo"><label class="pf-rotulo" for="pat-ouv-tipo">Tipo</label><select class="pf-input" id="pat-ouv-tipo" data-at-tipo><option value="">Todos</option>${TIPOS.map(([v, rr]) => ui.html`<option value="${v}" ${tipo === v ? 'selected' : ''}>${rr}</option>`)}</select></div>
        </div>
        ${itens.length ? ui.html`<table class="pf-tabela"><caption>Ouvidoria (${r.total})</caption>
          <thead><tr><th scope="col">Protocolo</th><th scope="col">Tipo</th><th scope="col">Assunto</th><th scope="col" class="pf-tabela__secundaria">Curso</th><th scope="col">Situação</th><th scope="col">Recebida</th><th scope="col" class="pf-tabela__secundaria">Encaminhada</th></tr></thead>
          <tbody>${itens.map((i) => ui.html`<tr><td data-rotulo="Protocolo"><a class="pf-at-codigo" href="#/ouvidoria/${i.protocolo}">${i.protocolo}</a></td><td data-rotulo="Tipo">${ROT_TIPO[i.tipo] || i.tipo}</td><td data-rotulo="Assunto">${i.assunto}</td><td data-rotulo="Curso" class="pf-tabela__secundaria">${i.cursoTitulo || '—'}</td><td data-rotulo="Situação">${estado(ui, (SIT_OUV[i.status] || ['—'])[0], (SIT_OUV[i.status] || [0, 'neutro'])[1])}</td><td data-rotulo="Recebida">${fmtData(ui, i.criadoEm)}</td><td data-rotulo="Encaminhada" class="pf-tabela__secundaria">${(i.encaminhadaPara || []).length ? i.encaminhadaPara.map((e) => e.nome || '—').join(', ') : '—'}</td></tr>`)}</tbody></table>`
          : ui.html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhuma manifestação com estes filtros.</p></div>`}`;
      lista.querySelectorAll('[data-at-status]').forEach((b) => b.addEventListener('click', () => nav({ status: b.dataset.atStatus })));
      lista.querySelector('[data-at-tipo]').addEventListener('change', (ev) => nav({ tipo: ev.target.value }));
    })();
  }

  function montarOuvidoriaDetalhe(el, ctx) {
    const ui = ctx.ui;
    const admin = ctx.papel === 'admin';
    const protocolo = String(ctx.params.protocolo || '').toUpperCase();
    el.innerHTML = ui.html`<div data-at-aviso></div><div data-at-corpo aria-busy="true"><p class="pf-at-status">Carregando ${protocolo}…</p></div>`;
    const corpo = el.querySelector('[data-at-corpo]');

    async function carregar(identidade = null) {
      let m;
      try { m = await ctx.api.get(admin ? API.ouvAdminUma(protocolo) : API.ouvProfUma(protocolo)); } catch (err) {
        corpo.setAttribute('aria-busy', 'false');
        if (ehNaoEncontrado(err)) {
          corpo.innerHTML = ui.html`<div class="pf-vazio"><p class="pf-vazio__titulo">Não encontramos esta manifestação.</p><div class="pf-vazio__acoes"><a class="dmc-btn dmc-btn--secondary" href="#/ouvidoria">Voltar à ouvidoria</a></div></div>`;
          return;
        }
        ui.erroCarga(corpo, err, { tentarDeNovo: () => carregar() });
        return;
      }
      corpo.setAttribute('aria-busy', 'false');
      ctx.definirTitulo(`${m.protocolo} · ${m.assunto}`);
      if (admin) desenharCoordenacao(m, identidade); else desenharProfessor(m);
    }

    function desenharProfessor(m) {
      corpo.innerHTML = ui.html`<p class="pf-at-voltar"><a class="pf-cabecalho__voltar" href="#/ouvidoria">← Ouvidoria (encaminhadas)</a></p>
        <dl class="pf-at-meta">
          <div><dt>Protocolo</dt><dd><span class="pf-at-codigo">${m.protocolo}</span></dd></div>
          <div><dt>Tipo</dt><dd>${ROT_TIPO[m.tipo] || m.tipo}</dd></div>
          <div><dt>Curso</dt><dd>${m.curso ? m.curso.titulo : '—'}</dd></div>
          <div><dt>Recebida em</dt><dd>${fmtData(ui, m.criadoEm)}</dd></div>
          <div><dt>Encaminhada em</dt><dd>${fmtData(ui, m.encaminhadaEm)}</dd></div>
        </dl>
        ${m.observacao ? ui.html`<div class="pf-alerta pf-alerta--info" role="note"><p>${m.observacao}</p></div>` : ''}
        <p class="pf-ajuda">A identidade de quem escreveu não é mostrada a professores. Seu parecer vai só para a coordenação.</p>
        <div class="pf-leitura"><p class="pf-at-msg__texto">${m.texto}</p></div>
        ${m.meuParecer ? ui.html`<section class="pf-at-historico"><p>${estado(ui, `Parecer enviado em ${fmtDataHora(ui, m.meuParecer.em)}`, 'sucesso')}</p><div class="pf-leitura"><p class="pf-at-msg__texto">${m.meuParecer.texto}</p></div></section>`
          : ui.html`<form class="pf-at-compositor" data-at-parecer novalidate>
            <div class="pf-campo"><label class="pf-rotulo" for="pat-parecer">Parecer para a coordenação <span aria-hidden="true">*</span></label>
              <textarea class="pf-input" id="pat-parecer" name="texto" rows="6" minlength="10" maxlength="4000" aria-describedby="pat-parecer-ajuda"></textarea>
              <p class="pf-ajuda" id="pat-parecer-ajuda">Descreva o contexto e o que você propõe. O aluno não vê o parecer.</p></div>
            <div data-at-parecer-erro></div>
            <div class="pf-at-compositor__acoes"><button type="submit" class="dmc-btn dmc-btn--primary">Enviar parecer</button></div></form>`}`;
      const form = corpo.querySelector('[data-at-parecer]');
      if (!form) return;
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const caixa = form.querySelector('[data-at-parecer-erro]');
        caixa.textContent = '';
        if (form.elements.texto.value.trim().length < 10) { caixa.innerHTML = ui.html`<p class="pf-erro-campo">Use pelo menos 10 caracteres.</p>`; form.elements.texto.focus(); return; }
        try {
          await ctx.api.post(API.ouvParecer(m.protocolo), { texto: form.elements.texto.value });
          await carregar();
          avisar(ui, el, 'Parecer enviado à coordenação.', 'sucesso');
        } catch (err) {
          if (/parecer já enviado/i.test(msgErro(err)) || (err && err.codigo === 'transicao-invalida')) {
            await carregar();
            avisar(ui, el, 'Parecer já enviado.', 'aviso');
            return;
          }
          caixa.innerHTML = ui.html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>${msgErro(err)}</p></div>`;
        }
      });
    }

    function desenharCoordenacao(m, identidade) {
      const encerrado = m.status === 'encerrado';
      corpo.innerHTML = ui.html`<p class="pf-at-voltar"><a class="pf-cabecalho__voltar" href="#/ouvidoria">← Ouvidoria</a></p>
        <dl class="pf-at-meta">
          <div><dt>Protocolo</dt><dd><span class="pf-at-codigo">${m.protocolo}</span></dd></div>
          <div><dt>Tipo</dt><dd>${ROT_TIPO[m.tipo] || m.tipo}</dd></div>
          <div><dt>Curso</dt><dd>${m.curso ? m.curso.titulo : '—'}</dd></div>
          <div><dt>Recebida em</dt><dd>${fmtDataHora(ui, m.criadoEm)}</dd></div>
          <div><dt>Situação</dt><dd>${estado(ui, (SIT_OUV[m.status] || ['—'])[0], (SIT_OUV[m.status] || [0, 'neutro'])[1])}</dd></div>
        </dl>
        <div class="pf-at-identidade">${identidade
          ? ui.html`<dl class="pf-at-meta"><div><dt>Nome</dt><dd>${identidade.nome || '—'}</dd></div><div><dt>E-mail</dt><dd>${identidade.email || '—'}</dd></div><div><dt>Matrícula</dt><dd>${identidade.matricula || '—'}</dd></div></dl><p class="pf-ajuda">Esta consulta fica registrada na auditoria.</p>`
          : ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-at-identidade>Ver identidade de quem escreveu</button> <span class="pf-ajuda">Esta consulta fica registrada na auditoria.</span>`}</div>
        <div class="pf-leitura"><p class="pf-at-msg__texto">${m.texto}</p></div>
        <ol class="pf-linha-tempo pf-at-conversa" aria-label="Mensagens">${(m.mensagens || []).map((x) => ui.html`<li class="pf-linha-tempo__item"><div class="pf-at-msg ${x.autor === 'ouvidoria' ? 'pf-at-msg--equipe' : ''}"><p class="pf-at-msg__autor">${x.autorNome} · ${fmtDataHora(ui, x.em)}</p><p class="pf-at-msg__texto">${x.texto}</p></div></li>`)}</ol>
        <section class="pf-at-historico" aria-labelledby="pat-enc"><h2 class="pf-secao-titulo" id="pat-enc">Encaminhamentos</h2>
          ${(m.encaminhamentos || []).length ? ui.html`<ul class="pf-lista">${m.encaminhamentos.map((e) => ui.html`<li class="pf-lista__linha"><p class="pf-lista__titulo">${e.professor && e.professor.nome ? e.professor.nome : '—'} · ${fmtData(ui, e.em)}</p><p class="pf-lista__meta">${e.observacao}</p>
            <p class="pf-lista__meta">${e.parecer ? estado(ui, `Parecer recebido em ${fmtData(ui, e.parecer.em)}`, 'sucesso') : estado(ui, 'Aguardando parecer', 'info')}</p>${e.parecer ? ui.html`<div class="pf-leitura"><p class="pf-at-msg__texto">${e.parecer.texto}</p></div>` : ''}</li>`)}</ul>` : ui.html`<p class="pf-ajuda">Nenhum encaminhamento.</p>`}
          ${m.podeEncaminhar ? ui.html`<p><button type="button" class="dmc-btn dmc-btn--secondary" data-at-encaminhar>Encaminhar ao professor</button></p>` : ui.html`<p class="pf-ajuda">Denúncias são apuradas só pela coordenação e não são encaminhadas a professores.</p>`}
        </section>
        ${encerrado ? ui.html`<p class="pf-at-status">Manifestação encerrada em ${fmtDataHora(ui, m.encerradoEm)}.</p>` : ui.html`<form class="pf-at-compositor" data-at-resp novalidate>
          <div class="pf-campo"><label class="pf-rotulo" for="pat-ouv-resp">Resposta (assinada "Ouvidoria")</label><textarea class="pf-input" id="pat-ouv-resp" name="texto" rows="5" maxlength="4000"></textarea></div>
          <div data-at-resp-erro></div>
          <div class="pf-at-compositor__acoes"><button type="submit" class="dmc-btn dmc-btn--primary">Enviar resposta</button><button type="button" class="dmc-btn dmc-btn--secondary" data-at-encerrar>Encerrar</button></div></form>`}`;
      const verId = corpo.querySelector('[data-at-identidade]');
      if (verId) verId.addEventListener('click', async () => {
        try { const r = await ctx.api.get(`${API.ouvAdminUma(m.protocolo)}?identidade=1`); desenharCoordenacao(r, r.identidade || null); } catch (err) { avisar(ui, el, msgErro(err), 'erro'); }
      });
      const enc = corpo.querySelector('[data-at-encaminhar]');
      if (enc) enc.addEventListener('click', async () => {
        let equipe = [];
        try { const r = await ctx.api.get(API.equipe); equipe = ((r && r.itens) || []).filter((u) => u.papel === 'professor' && !u.desativadoEm); } catch { equipe = []; }
        const doCurso = m.cursoId ? equipe.filter((u) => (u.docencias || []).some((d) => d.cursoId === m.cursoId)) : equipe;
        const ok = await dialogo(ui, {
          titulo: 'Encaminhar ao professor', rotuloEnviar: 'Encaminhar',
          corpo: ui.html`<p>O professor recebe tipo, assunto, texto e curso. Nunca recebe o nome, o e-mail nem a matrícula de quem escreveu.</p>
            <div class="pf-campo"><label class="pf-rotulo" for="pat-enc-prof">Professor <span aria-hidden="true">*</span></label>
              <select class="pf-input" id="pat-enc-prof" name="professorId" required><option value="">Escolha</option>${doCurso.map((u) => ui.html`<option value="${u.id}">${u.nome}</option>`)}</select>
              ${doCurso.length ? '' : ui.html`<p class="pf-ajuda">Nenhum professor com docência ${m.cursoId ? 'neste curso' : 'cadastrado'}.</p>`}</div>
            <div class="pf-campo"><label class="pf-rotulo" for="pat-enc-obs">Observação <span aria-hidden="true">*</span></label><textarea class="pf-input" id="pat-enc-obs" name="observacao" rows="3" minlength="10" maxlength="1000" required></textarea></div>`,
          enviar: (f) => ctx.api.post(API.ouvAdminEncaminhar(m.protocolo), { professorId: f.elements.professorId.value, observacao: f.elements.observacao.value })
        });
        if (!ok) return;
        await carregar(identidade);
        avisar(ui, el, 'Manifestação encaminhada.', 'sucesso');
      });
      const form = corpo.querySelector('[data-at-resp]');
      if (!form) return;
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const caixa = form.querySelector('[data-at-resp-erro]');
        caixa.textContent = '';
        if (!form.elements.texto.value.trim()) { caixa.innerHTML = ui.html`<p class="pf-erro-campo">Escreva a resposta antes de enviar.</p>`; return; }
        try { await ctx.api.post(API.ouvAdminMsg(m.protocolo), { texto: form.elements.texto.value }); await carregar(identidade); avisar(ui, el, 'Resposta enviada.', 'sucesso'); } catch (err) { caixa.innerHTML = ui.html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>${msgErro(err)}</p></div>`; }
      });
      corpo.querySelector('[data-at-encerrar]').addEventListener('click', async () => {
        const ok = await confirmar(ui, { titulo: 'Encerrar esta manifestação?', texto: 'Depois de encerrada, ela não recebe novas mensagens.', rotuloConfirmar: 'Encerrar' });
        if (!ok) return;
        try { await ctx.api.post(API.ouvAdminEncerrar(m.protocolo), {}); await carregar(identidade); avisar(ui, el, 'Manifestação encerrada.', 'sucesso'); } catch (err) { avisar(ui, el, msgErro(err), 'erro'); }
      });
    }

    carregar();
  }

  // =========================================================
  // Registro das rotas (§6.3)
  // =========================================================
  const PA = ['professor', 'admin'];
  P.registrar({ rota: 'atendimento', titulo: 'Atendimento', papeis: PA, montar: (el, ctx) => montarFila(el, ctx) });
  P.registrar({ rota: 'atendimento/:protocolo', titulo: 'Atendimento', papeis: PA, montar: montarDetalhe });
  P.registrar({ rota: 'ouvidoria', titulo: 'Ouvidoria', papeis: PA, montar: montarOuvidoria });
  P.registrar({ rota: 'ouvidoria/:protocolo', titulo: 'Ouvidoria', papeis: PA, montar: montarOuvidoriaDetalhe });
  P.registrar({
    rota: 'alunos/:userId/atendimentos', titulo: 'Atendimentos', papeis: PA, pai: 'alunos/:userId', aba: 'atendimentos',
    montar: (el, ctx) => montarFila(el, ctx, { userIdFixo: ctx.params.userId })
  });
})();
