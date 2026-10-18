/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-comunicacao.js (F7)
   Comunicação no backoffice (hospedado em professor.html):
     #/publicacoes · #/publicacoes/nova · #/publicacoes/:id  (professor e coordenação)
     #/banners                                              (só coordenação, D-09)
   Spec: PORTAL-UX §7.12, §7.13; PORTAL-API §6.11.1–§6.11.2.
   O servidor decide o público (professor só os próprios cursos e
   turmas; "Todos os alunos" só a coordenação) — a tela só oferece o
   que o papel pode e mostra o erro do servidor quando ele recusa.
   HTML só por DMC_UI.html; sem alert/confirm/prompt; sem script inline.
   ============================================================= */
(function () {
  'use strict';
  const P = window.DMC_Professor;
  if (!P) return;

  const API = {
    pubs: '/portal/professor/publicacoes',
    pub: (id) => `/portal/professor/publicacoes/${encodeURIComponent(id)}`,
    pubArquivo: (id) => `/portal/professor/publicacoes/${encodeURIComponent(id)}/arquivo`,
    pubPublicar: (id) => `/portal/professor/publicacoes/${encodeURIComponent(id)}/publicar`,
    pubArquivar: (id) => `/portal/professor/publicacoes/${encodeURIComponent(id)}/arquivar`,
    turmas: (cursoId) => `/portal/professor/cursos/${encodeURIComponent(cursoId)}/turmas`,
    banners: '/portal/admin/banners',
    banner: (id) => `/portal/admin/banners/${encodeURIComponent(id)}`,
    bannerImagem: (id) => `/portal/admin/banners/${encodeURIComponent(id)}/imagem`
  };
  const PA = ['professor', 'admin'];
  const A = ['admin'];
  const TIPOS = [['texto', 'Texto'], ['video', 'Vídeo'], ['link', 'Link'], ['pdf', 'PDF']];
  const ROTULO_TIPO = { video: 'Vídeo', texto: 'Texto', link: 'Link', pdf: 'PDF' };
  const STATUS = [['publicada', 'Publicadas'], ['rascunho', 'Rascunhos'], ['arquivada', 'Arquivadas']];
  const ROTULO_STATUS = { publicada: ['Publicada', 'sucesso'], rascunho: ['Rascunho', 'neutro'], arquivada: ['Arquivada', 'neutro'] };
  const ESTADO_BANNER = { 'no-ar': ['No ar', 'sucesso'], agendado: ['Agendado', 'info'], encerrado: ['Encerrado', 'neutro'], inativo: ['Inativo', 'neutro'] };
  const LOCAL_BANNER = { topo: 'Faixa do topo', inicio: 'Destaque no Início' };
  const MAX_PDF = 4 * 1024 * 1024;
  const MAX_IMAGEM = 1024 * 1024;
  const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

  const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  const FMT_CURTA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const fmtData = (ui, iso) => (iso ? (ui.fmt && ui.fmt.data ? ui.fmt.data(iso) : FMT_DATA.format(new Date(iso))) : '—');
  const msgErro = (err) => (err && err.message) || 'Não foi possível concluir agora. Tente de novo.';
  const camposErro = (err) => (err && (err.campos || (err.dados && err.dados.campos))) || null;

  function estado(ui, rotulo, tom) {
    if (typeof ui.estado === 'function') return ui.estado(rotulo, tom);
    return ui.html`<span class="pf-estado pf-estado--${tom}">${rotulo}</span>`;
  }
  function avisar(ui, texto, tipo) {
    if (typeof ui.toast === 'function') ui.toast(texto, { tipo: tipo || 'sucesso' });
    else if (typeof ui.anunciar === 'function') ui.anunciar(texto);
  }
  async function confirmar(ui, opcoes) {
    if (typeof ui.confirmar === 'function') return ui.confirmar(opcoes);
    return false; // sem diálogo do núcleo, a ação destrutiva não acontece (nunca window.confirm)
  }
  /** Marca os campos com erro do servidor; sem campo conhecido, alerta no topo do formulário. */
  function marcarErros(ui, form, err) {
    form.querySelectorAll('.pf-erro-campo').forEach((x) => x.remove());
    form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
    const caixa = form.querySelector('[data-com-erro]');
    if (caixa) caixa.innerHTML = '';
    let primeiro = null;
    for (const [nome, m] of Object.entries(camposErro(err) || {})) {
      const el = form.querySelector(`[name="${CSS.escape(nome)}"]`) || form.querySelector(`[data-com-campo="${CSS.escape(nome)}"]`);
      if (!el) continue;
      el.setAttribute('aria-invalid', 'true');
      const p = document.createElement('p');
      p.className = 'pf-erro-campo';
      p.textContent = String(m);
      (el.closest('.pf-campo') || el.closest('fieldset') || form).appendChild(p);
      if (!primeiro) primeiro = el;
    }
    if (primeiro) { primeiro.focus(); return; }
    if (caixa) caixa.innerHTML = ui.html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>${msgErro(err)}</p></div>`;
  }
  /** Envio de arquivo cru (PDF/imagem) pelo DMC_Api.upload (token no header; o tipo real é conferido no servidor). */
  function enviarArquivo(caminho, arquivo) {
    return window.DMC_Api.upload(caminho, arquivo, arquivo.type || 'application/octet-stream');
  }

  // =========================================================
  // Card (a mesma forma que o aluno vê em publicacoes.html)
  // =========================================================
  function card(ui, p) {
    const v = p.video;
    const midia = p.tipo === 'video' && v && v.provedor === 'youtube' && YT_ID_RE.test(String(v.id || ''))
      ? ui.html`<div class="pf-publicacao__midia"><img src="${`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`}" alt="" loading="lazy" decoding="async" width="480" height="270"><span class="pf-com-card__play" aria-hidden="true">${ui.icone('play')}</span></div>`
      : ui.html`<div class="pf-publicacao__midia"><div class="pf-capa pf-capa--larga pf-capa--tipografica" data-sigla="${ROTULO_TIPO[p.tipo] || 'Publicação'}" aria-hidden="true"></div><p class="pf-com-card__tipo" aria-hidden="true">${ROTULO_TIPO[p.tipo] || 'Publicação'}</p></div>`;
    return ui.html`<article class="pf-com-card">${midia}<div class="pf-com-card__corpo">
        <p class="pf-com-card__titulo">${p.titulo || 'Título da publicação'}</p>
        ${p.resumo ? ui.html`<p class="pf-com-card__resumo">${p.resumo}</p>` : ''}
        <p class="pf-com-card__meta">${p.autorRotulo || ''}</p>
      </div></article>`;
  }

  function publicoTexto(p) {
    if (!p) return '—';
    if (p.tipo === 'todos') return 'Todos os alunos';
    const nomes = [].concat(p.turmas || [], p.cursos || []).filter(Boolean);
    return nomes.length ? nomes.join(', ') : '—';
  }

  // =========================================================
  // #/publicacoes — lista
  // =========================================================
  function montarLista(el, ctx) {
    const ui = ctx.ui;
    const st = { status: STATUS.some(([v]) => v === ctx.filtros.get('status')) ? ctx.filtros.get('status') : 'publicada', pagina: 1, itens: [], totalPaginas: 1 };
    el.innerHTML = ui.html`<div class="pf-com-acoes"><a class="dmc-btn dmc-btn--primary" href="#/publicacoes/nova">Nova publicação</a></div>
      <div class="pf-com-filtros"><div data-com-status></div></div>
      <div data-com-lista aria-busy="true"></div>
      <div class="pf-com-mais" data-com-mais hidden><button type="button" class="dmc-btn dmc-btn--secondary" data-com-carregar>Carregar mais</button></div>`;
    ui.filtros(el.querySelector('[data-com-status]'), {
      rotulo: 'Situação', opcoes: STATUS.map(([valor, rotulo]) => ({ valor, rotulo })), valor: st.status,
      aoMudar: (v) => { st.status = v; ctx.navegar('publicacoes', new URLSearchParams({ status: v })); }
    });
    el.querySelector('[data-com-carregar]').addEventListener('click', () => { st.pagina += 1; carregar(true); });

    function linha(p) {
      const [rot, tom] = ROTULO_STATUS[p.status] || [p.status, 'neutro'];
      const autor = p.autor && p.autor.papel === 'admin' ? 'Coordenação' : (p.autor && p.autor.nome) || '—';
      return ui.html`<li class="pf-lista__linha">
          <div>
            <p class="pf-lista__titulo"><a href="${`#/publicacoes/${encodeURIComponent(p.id)}`}">${p.titulo}</a></p>
            <p class="pf-lista__meta">${ROTULO_TIPO[p.tipo] || p.tipo} · ${publicoTexto(p.publico)} · ${autor} · ${fmtData(ui, p.publicadaEm || p.atualizadoEm)}</p>
          </div>
          <div class="pf-lista__acao">${estado(ui, rot, tom)}</div>
        </li>`;
    }
    async function carregar(acrescentar) {
      const alvo = el.querySelector('[data-com-lista]');
      if (!acrescentar) { st.pagina = 1; ui.esqueleto(alvo, { tipo: 'lista', linhas: 4 }); }
      try {
        const r = await ctx.api.get(`${API.pubs}?status=${encodeURIComponent(st.status)}&pagina=${st.pagina}`, { sinal: ctx.sinal });
        const itens = r && Array.isArray(r.itens) ? r.itens : [];
        st.itens = acrescentar ? st.itens.concat(itens) : itens;
        st.totalPaginas = (r && r.totalPaginas) || 1;
        alvo.setAttribute('aria-busy', 'false');
        if (!st.itens.length) {
          ui.estadoVazio(alvo, {
            titulo: st.status === 'rascunho' ? 'Nenhum rascunho.' : st.status === 'arquivada' ? 'Nenhuma publicação arquivada.' : 'Nenhuma publicação no ar.',
            texto: 'Publicações levam avisos, vídeos, links e PDFs aos alunos dos seus cursos.',
            acao: { rotulo: 'Nova publicação', href: '#/publicacoes/nova' }
          });
        } else {
          alvo.innerHTML = ui.html`<ul class="pf-lista" role="list">${st.itens.map(linha)}</ul>`;
        }
        el.querySelector('[data-com-mais]').hidden = st.pagina >= st.totalPaginas;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        alvo.setAttribute('aria-busy', 'false');
        ui.erroCarga(alvo, err, { tentarDeNovo: () => carregar(false) });
      }
    }
    carregar(false);
  }

  // =========================================================
  // #/publicacoes/nova e #/publicacoes/:id — editor
  // =========================================================
  async function montarEditor(el, ctx) {
    const ui = ctx.ui;
    const admin = ctx.papel === 'admin';
    const id = ctx.params && ctx.params.id ? ctx.params.id : null;
    let pub = null;
    if (id) {
      ui.esqueleto(el, { tipo: 'texto', linhas: 6 });
      try {
        const r = await ctx.api.get(API.pub(id), { sinal: ctx.sinal });
        pub = r && r.publicacao;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        if (err && err.status === 404) {
          ui.estadoVazio(el, { titulo: 'Publicação não encontrada.', texto: 'Ela pode ter sido removida ou não ser sua.', acao: { rotulo: 'Voltar às publicações', href: '#/publicacoes' } });
          return;
        }
        ui.erroCarga(el, err, { tentarDeNovo: () => montarEditor(el, ctx) });
        return;
      }
      if (pub && ctx.definirTitulo) ctx.definirTitulo(pub.titulo);
    }
    const podeEditar = !pub || pub.podeEditar;
    const v = pub || { tipo: 'texto', titulo: '', resumo: '', corpo: '', videoUrl: '', url: '', publico: { tipo: admin ? 'todos' : 'curso', cursoIds: [], turmaIds: [] }, status: 'rascunho', fixada: false };
    const cursos = Array.isArray(ctx.cursos) ? ctx.cursos : [];
    const tipoPublicoInicial = v.publico && v.publico.tipo ? v.publico.tipo : 'curso';

    el.innerHTML = ui.html`<div class="pf-com-editor">
      <form class="pf-com-form" data-com-form novalidate>
        <div data-com-erro></div>
        ${pub && !podeEditar ? ui.html`<div class="pf-alerta pf-alerta--info" role="status"><p>Esta publicação é de outra pessoa da equipe. Você pode ler, mas não editar.</p></div>` : ''}
        <fieldset data-com-campo="tipo"><legend>Tipo</legend><div class="pf-com-opcoes">
          ${TIPOS.map(([valor, rotulo]) => ui.html`<label class="pf-radio" data-alvo-excecao="rotulo-clicavel"><input type="radio" name="tipo" value="${valor}" ${v.tipo === valor ? 'checked' : ''}> ${rotulo}</label>`)}
        </div></fieldset>
        <div class="pf-campo"><label class="pf-rotulo" for="com-titulo">Título <span aria-hidden="true">*</span></label>
          <input class="pf-input" id="com-titulo" name="titulo" required minlength="3" maxlength="140" value="${v.titulo || ''}"></div>
        <div class="pf-campo"><label class="pf-rotulo" for="com-resumo">Resumo</label>
          <textarea class="pf-input" id="com-resumo" name="resumo" rows="2" maxlength="280" aria-describedby="com-resumo-ajuda">${v.resumo || ''}</textarea>
          <p class="pf-ajuda" id="com-resumo-ajuda">Aparece no card. Até 280 caracteres.</p></div>
        <div class="pf-campo" data-com-tipo="texto"><label class="pf-rotulo" for="com-corpo">Texto</label>
          <textarea class="pf-input" id="com-corpo" name="corpo" rows="8" maxlength="20000" aria-describedby="com-corpo-ajuda">${v.corpo || ''}</textarea>
          <p class="pf-ajuda" id="com-corpo-ajuda">Texto simples. Texto visto pelos alunos: informativo e sóbrio, sem promessa de resultado.</p></div>
        <div class="pf-campo" data-com-tipo="video"><label class="pf-rotulo" for="com-video">Link do vídeo</label>
          <input class="pf-input" id="com-video" name="videoUrl" type="url" inputmode="url" maxlength="500" value="${v.videoUrl || ''}" aria-describedby="com-video-ajuda">
          <p class="pf-ajuda" id="com-video-ajuda" data-com-video-ajuda>YouTube ou Vimeo.</p></div>
        <div class="pf-campo" data-com-tipo="link"><label class="pf-rotulo" for="com-url">Endereço (https)</label>
          <input class="pf-input" id="com-url" name="url" type="url" inputmode="url" maxlength="500" value="${v.url || ''}" aria-describedby="com-url-ajuda">
          <p class="pf-ajuda" id="com-url-ajuda">Só endereços que começam com https://. O aluno vê o domínio antes de abrir.</p></div>
        <div class="pf-campo" data-com-tipo="pdf"><label class="pf-rotulo" for="com-pdf">Arquivo PDF</label>
          <input class="pf-input" id="com-pdf" name="arquivo" type="file" accept="application/pdf" aria-describedby="com-pdf-ajuda">
          <p class="pf-ajuda" id="com-pdf-ajuda">${pub && pub.temPdf ? 'Já há um PDF enviado; escolher outro substitui.' : 'Até 4 MB. O PDF é enviado ao salvar.'}</p></div>
        <fieldset data-com-campo="publico"><legend>Público <span aria-hidden="true">*</span></legend>
          <div class="pf-com-opcoes">
            ${admin ? ui.html`<label class="pf-radio" data-alvo-excecao="rotulo-clicavel"><input type="radio" name="publicoTipo" value="todos" ${tipoPublicoInicial === 'todos' ? 'checked' : ''}> Todos os alunos</label>` : ''}
            <label class="pf-radio" data-alvo-excecao="rotulo-clicavel"><input type="radio" name="publicoTipo" value="curso" ${tipoPublicoInicial === 'curso' ? 'checked' : ''}> Cursos</label>
            <label class="pf-radio" data-alvo-excecao="rotulo-clicavel"><input type="radio" name="publicoTipo" value="turma" ${tipoPublicoInicial === 'turma' ? 'checked' : ''}> Turmas</label>
          </div>
          <div data-com-publico="curso" class="pf-com-opcoes">
            ${cursos.length ? cursos.map((c) => ui.html`<label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" name="cursoIds" value="${c.id}" ${(v.publico.cursoIds || []).indexOf(c.id) >= 0 ? 'checked' : ''}> ${c.titulo}</label>`) : ui.html`<p class="pf-ajuda">Você ainda não tem cursos atribuídos.</p>`}
          </div>
          <div data-com-publico="turma" class="pf-com-opcoes" data-com-turmas><p class="pf-ajuda">Carregando turmas…</p></div>
        </fieldset>
        ${admin ? ui.html`<label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" name="fixada" ${v.fixada ? 'checked' : ''}> Fixar no topo da lista</label>` : ''}
        <p class="pf-ajuda">Ao publicar, o público recebe uma notificação.</p>
        <div class="pf-com-acoes">
          <button type="submit" class="dmc-btn dmc-btn--secondary" data-com-salvar ${podeEditar ? '' : 'disabled'}>Salvar rascunho</button>
          ${v.status !== 'publicada' ? ui.html`<button type="button" class="dmc-btn dmc-btn--primary" data-com-publicar ${podeEditar ? '' : 'disabled'}>Publicar</button>` : ui.html`<button type="button" class="dmc-btn dmc-btn--primary" data-com-salvar-pub ${podeEditar ? '' : 'disabled'}>Salvar alterações</button>`}
          ${pub && pub.status !== 'arquivada' && podeEditar ? ui.html`<button type="button" class="dmc-btn dmc-btn--ghost" data-com-arquivar>Arquivar</button>` : ''}
          ${pub && pub.status === 'rascunho' && podeEditar ? ui.html`<button type="button" class="dmc-btn dmc-btn--ghost pf-btn--perigo" data-com-remover>Remover rascunho</button>` : ''}
          <a class="dmc-btn dmc-btn--ghost" href="#/publicacoes">Voltar</a>
        </div>
      </form>
      <aside class="pf-com-editor__previa" aria-label="Prévia do card">
        <p class="pf-com-previa__rotulo">Prévia do card</p>
        <div data-com-previa></div>
      </aside>
    </div>`;

    const form = el.querySelector('[data-com-form]');
    const previa = el.querySelector('[data-com-previa]');
    if (!podeEditar) form.querySelectorAll('input, textarea').forEach((x) => { x.disabled = true; });

    function tipoAtual() { const r = form.querySelector('input[name="tipo"]:checked'); return r ? r.value : 'texto'; }
    function publicoAtual() { const r = form.querySelector('input[name="publicoTipo"]:checked'); return r ? r.value : 'curso'; }
    function atualizarVisiveis() {
      const t = tipoAtual();
      form.querySelectorAll('[data-com-tipo]').forEach((x) => { x.hidden = x.dataset.comTipo !== t; });
      const pt = publicoAtual();
      form.querySelectorAll('[data-com-publico]').forEach((x) => { x.hidden = x.dataset.comPublico !== pt; });
    }
    function videoNormalizado() {
      const s = form.elements.videoUrl.value.trim();
      if (!s) return null;
      const n = window.DMC_Video && typeof window.DMC_Video.normalizar === 'function' ? window.DMC_Video.normalizar(s) : null;
      return n && (n.provedor === 'youtube' || n.provedor === 'vimeo') ? n : null;
    }
    function desenharPrevia() {
      const autorRotulo = admin ? 'Coordenação' : `${(ctx.user && ctx.user.nome) || ''} · Professor(a)`;
      previa.innerHTML = card(ui, { tipo: tipoAtual(), titulo: form.elements.titulo.value.trim(), resumo: form.elements.resumo.value.trim(), video: tipoAtual() === 'video' ? videoNormalizado() : null, autorRotulo });
    }
    form.addEventListener('input', () => { atualizarVisiveis(); desenharPrevia(); });
    form.addEventListener('change', () => { atualizarVisiveis(); desenharPrevia(); });
    form.elements.videoUrl.addEventListener('blur', () => {
      const ajuda = form.querySelector('[data-com-video-ajuda]');
      const s = form.elements.videoUrl.value.trim();
      if (!s) { ajuda.textContent = 'YouTube ou Vimeo.'; ajuda.className = 'pf-ajuda'; return; }
      const n = videoNormalizado();
      ajuda.textContent = n ? `Vídeo do ${n.provedor === 'youtube' ? 'YouTube' : 'Vimeo'} reconhecido — será exibido incorporado.` : 'Use um link do YouTube ou do Vimeo.';
      ajuda.className = n ? 'pf-ajuda pf-com-ok' : 'pf-erro-campo';
    });

    // turmas dos cursos visíveis (F4a); sem a rota, o público por turma fica indisponível
    (async () => {
      const alvo = form.querySelector('[data-com-turmas]');
      const opcoes = [];
      for (const c of cursos) {
        try {
          const r = await ctx.api.get(API.turmas(c.id), { silencioso404: true, sinal: ctx.sinal });
          for (const t of (r && r.itens) || []) opcoes.push({ id: t.id, rotulo: `${t.codigo || t.nome} · ${c.sigla || c.titulo}` });
        } catch (err) { if (err && err.name === 'AbortError') return; /* sem docência nesse curso: segue */ }
      }
      const marcadas = (v.publico && v.publico.turmaIds) || [];
      alvo.innerHTML = opcoes.length
        ? ui.html`${opcoes.map((t) => ui.html`<label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" name="turmaIds" value="${t.id}" ${marcadas.indexOf(t.id) >= 0 ? 'checked' : ''} ${podeEditar ? '' : 'disabled'}> ${t.rotulo}</label>`)}`
        : ui.html`<p class="pf-ajuda">Nenhuma turma disponível para escolher agora.</p>`;
    })();

    function corpoDoForm() {
      const tipo = tipoAtual();
      const pt = publicoAtual();
      const corpo = {
        tipo, titulo: form.elements.titulo.value, resumo: form.elements.resumo.value,
        corpo: tipo === 'texto' ? form.elements.corpo.value : '', videoUrl: tipo === 'video' ? form.elements.videoUrl.value.trim() : '',
        url: tipo === 'link' ? form.elements.url.value.trim() : '',
        publico: {
          tipo: pt,
          cursoIds: pt === 'curso' ? [...form.querySelectorAll('input[name="cursoIds"]:checked')].map((x) => x.value) : [],
          turmaIds: pt === 'turma' ? [...form.querySelectorAll('input[name="turmaIds"]:checked')].map((x) => x.value) : []
        }
      };
      if (admin && form.elements.fixada) corpo.fixada = form.elements.fixada.checked;
      return corpo;
    }

    async function salvar() {
      const corpo = corpoDoForm();
      const arquivo = form.elements.arquivo && form.elements.arquivo.files && form.elements.arquivo.files[0];
      if (corpo.tipo === 'pdf' && arquivo && arquivo.size > MAX_PDF) {
        marcarErros(ui, form, { campos: { arquivo: 'O PDF passa de 4 MB.' } });
        return null;
      }
      let r;
      if (pub) r = await ctx.api.put(API.pub(pub.id), { ...corpo, versao: pub.versao });
      else r = await ctx.api.post(API.pubs, corpo);
      pub = r.publicacao;
      if (corpo.tipo === 'pdf' && arquivo) {
        await enviarArquivo(API.pubArquivo(pub.id), arquivo);
        const de = await ctx.api.get(API.pub(pub.id));
        pub = de.publicacao;
      }
      return pub;
    }

    async function executar(botao, acao) {
      ui.ocupado(botao, true, 'Salvando…');
      try {
        await acao();
      } catch (err) {
        marcarErros(ui, form, err);
      } finally {
        ui.ocupado(botao, false);
      }
    }

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const b = form.querySelector('[data-com-salvar]');
      executar(b, async () => {
        const novo = !id;
        const p = await salvar();
        if (!p) return;
        avisar(ui, 'Rascunho salvo.');
        if (novo) ctx.navegar(`publicacoes/${p.id}`);
        else ctx.navegar(`publicacoes/${p.id}`);
      });
    });
    const bPub = form.querySelector('[data-com-publicar]');
    if (bPub) bPub.addEventListener('click', () => executar(bPub, async () => {
      const p = await salvar();
      if (!p) return;
      await ctx.api.post(API.pubPublicar(p.id), {});
      avisar(ui, 'Publicação no ar. O público recebe a notificação.');
      ctx.navegar('publicacoes', new URLSearchParams({ status: 'publicada' }));
    }));
    const bSalvarPub = form.querySelector('[data-com-salvar-pub]');
    if (bSalvarPub) bSalvarPub.addEventListener('click', () => executar(bSalvarPub, async () => {
      const p = await salvar();
      if (!p) return;
      avisar(ui, 'Alterações salvas.');
      ctx.navegar('publicacoes', new URLSearchParams({ status: 'publicada' }));
    }));
    const bArq = form.querySelector('[data-com-arquivar]');
    if (bArq) bArq.addEventListener('click', async () => {
      const ok = await confirmar(ui, { titulo: 'Arquivar publicação?', texto: 'Ela sai da lista dos alunos. O registro continua guardado.', rotuloConfirmar: 'Arquivar' });
      if (!ok) return;
      executar(bArq, async () => {
        await ctx.api.post(API.pubArquivar(pub.id), {});
        avisar(ui, 'Publicação arquivada.');
        ctx.navegar('publicacoes', new URLSearchParams({ status: 'arquivada' }));
      });
    });
    const bRem = form.querySelector('[data-com-remover]');
    if (bRem) bRem.addEventListener('click', async () => {
      const ok = await confirmar(ui, { titulo: 'Remover rascunho?', texto: 'O rascunho e o PDF anexado são apagados.', rotuloConfirmar: 'Remover', perigo: true });
      if (!ok) return;
      executar(bRem, async () => {
        await ctx.api.del(API.pub(pub.id));
        avisar(ui, 'Rascunho removido.');
        ctx.navegar('publicacoes', new URLSearchParams({ status: 'rascunho' }));
      });
    });

    atualizarVisiveis();
    desenharPrevia();
  }

  // =========================================================
  // #/banners — só coordenação
  // =========================================================
  function periodo(b) {
    if (!b.inicioEm || !b.fimEm) return '—';
    return `${FMT_CURTA.format(new Date(b.inicioEm))} – ${FMT_CURTA.format(new Date(b.fimEm))}`;
  }
  function paraDataLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    return p;
  }

  function montarBanners(el, ctx) {
    const ui = ctx.ui;
    const st = { itens: [], editando: null };
    el.innerHTML = ui.html`<div class="pf-alerta pf-alerta--info" role="note"><p>Conheça o novo portal — banner do sistema · leva aos Tutoriais · o aluno pode dispensar.</p></div>
      <div class="pf-com-acoes"><button type="button" class="dmc-btn dmc-btn--primary" data-com-novo>Novo banner</button></div>
      <div data-com-form-banner></div>
      <div data-com-lista aria-busy="true"></div>`;
    const caixaForm = el.querySelector('[data-com-form-banner]');
    el.querySelector('[data-com-novo]').addEventListener('click', () => abrirForm(null));

    function linha(b, i, todos) {
      const [rot, tom] = ESTADO_BANNER[b.estado] || [b.estado, 'neutro'];
      const doLocal = todos.filter((x) => x.local === b.local);
      const pos = doLocal.indexOf(b);
      return ui.html`<li class="pf-lista__linha" data-com-banner="${b.id}">
          ${b.imagemUrl ? ui.html`<img class="pf-com-miniatura" src="${b.imagemUrl}" alt="" width="72" height="40" loading="lazy">` : ''}
          <div>
            <p class="pf-lista__titulo">${b.titulo}</p>
            <p class="pf-lista__meta">${LOCAL_BANNER[b.local] || b.local} · ${publicoTexto(b.publico)} · ${periodo(b)}</p>
          </div>
          <div class="pf-lista__acao">
            ${estado(ui, rot, tom)}
            <span class="pf-com-ordem">
              <button type="button" class="pf-btn-icone" data-com-subir="${b.id}" aria-label="${`Subir ${b.titulo}`}" ${pos <= 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="pf-btn-icone" data-com-descer="${b.id}" aria-label="${`Descer ${b.titulo}`}" ${pos >= doLocal.length - 1 ? 'disabled' : ''}>↓</button>
            </span>
            <button type="button" class="dmc-btn dmc-btn--secondary" data-com-editar="${b.id}">Editar</button>
          </div>
        </li>`;
    }

    async function carregar() {
      const alvo = el.querySelector('[data-com-lista]');
      ui.esqueleto(alvo, { tipo: 'lista', linhas: 3 });
      try {
        const r = await ctx.api.get(API.banners, { sinal: ctx.sinal });
        st.itens = r && Array.isArray(r.itens) ? r.itens : [];
        alvo.setAttribute('aria-busy', 'false');
        if (!st.itens.length) {
          ui.estadoVazio(alvo, { titulo: 'Nenhum banner cadastrado.', texto: 'A faixa do topo e os destaques do Início aparecem só no período escolhido e para o público escolhido.' });
          return;
        }
        alvo.innerHTML = ui.html`<ul class="pf-lista" role="list">${st.itens.map((b, i, t) => linha(b, i, t))}</ul>`;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        alvo.setAttribute('aria-busy', 'false');
        ui.erroCarga(alvo, err, { tentarDeNovo: carregar });
      }
    }

    el.addEventListener('click', async (ev) => {
      const ed = ev.target.closest('[data-com-editar]');
      if (ed) { abrirForm(st.itens.find((b) => b.id === ed.dataset.comEditar) || null); return; }
      const sobe = ev.target.closest('[data-com-subir]');
      const desce = ev.target.closest('[data-com-descer]');
      const alvo = sobe || desce;
      if (!alvo) return;
      const id = alvo.dataset.comSubir || alvo.dataset.comDescer;
      const b = st.itens.find((x) => x.id === id);
      if (!b) return;
      const doLocal = st.itens.filter((x) => x.local === b.local);
      const i = doLocal.indexOf(b);
      const outro = doLocal[sobe ? i - 1 : i + 1];
      if (!outro) return;
      ui.ocupado(alvo, true);
      try {
        // reordena o local inteiro (0, 1, 2…) trocando os dois de lugar
        const nova = doLocal.slice();
        nova[i] = outro; nova[sobe ? i - 1 : i + 1] = b;
        for (let k = 0; k < nova.length; k++) {
          if (nova[k].ordem === k) continue;
          const r = await ctx.api.put(API.banner(nova[k].id), { versao: nova[k].versao, ordem: k });
          Object.assign(nova[k], r.banner);
        }
        ui.anunciar && ui.anunciar('Ordem atualizada.');
        await carregar();
      } catch (err) {
        avisar(ui, msgErro(err), 'erro');
        await carregar();
      }
    });

    function abrirForm(b) {
      const v = b || { titulo: '', texto: '', local: 'inicio', link: null, inicioEm: null, fimEm: null, publico: { papeis: ['aluno'], tipo: 'todos', cursoIds: [], turmaIds: [] }, ordem: st.itens.length, ativo: true, imagemAlt: '' };
      const cursos = Array.isArray(ctx.cursos) ? ctx.cursos : [];
      const papeis = (v.publico && v.publico.papeis) || ['aluno'];
      caixaForm.innerHTML = ui.html`<section class="pf-detalhe" aria-labelledby="com-banner-t">
        <div class="pf-detalhe__cabeca"><h2 id="com-banner-t" tabindex="-1">${b ? 'Editar banner' : 'Novo banner'}</h2></div>
        <div class="pf-detalhe__corpo">
        <form class="pf-com-form" data-com-bform novalidate>
          <div data-com-erro></div>
          <fieldset data-com-campo="local"><legend>Local <span aria-hidden="true">*</span></legend><div class="pf-com-opcoes">
            <label class="pf-radio" data-alvo-excecao="rotulo-clicavel"><input type="radio" name="local" value="topo" ${v.local === 'topo' ? 'checked' : ''}> Faixa do topo</label>
            <label class="pf-radio" data-alvo-excecao="rotulo-clicavel"><input type="radio" name="local" value="inicio" ${v.local === 'inicio' ? 'checked' : ''}> Destaque no Início</label>
          </div></fieldset>
          <div class="pf-campo"><label class="pf-rotulo" for="ban-titulo">Título <span aria-hidden="true">*</span></label>
            <input class="pf-input" id="ban-titulo" name="titulo" required minlength="3" maxlength="80" value="${v.titulo || ''}"></div>
          <div class="pf-campo"><label class="pf-rotulo" for="ban-texto">Texto</label>
            <textarea class="pf-input" id="ban-texto" name="texto" rows="2" maxlength="160" aria-describedby="ban-texto-ajuda">${v.texto || ''}</textarea>
            <p class="pf-ajuda" id="ban-texto-ajuda"><span data-com-limite>Faixa do topo: só texto, até 90 caracteres. Destaque: até 160.</span> <span class="pf-com-contador" data-com-contador></span></p></div>
          <div class="pf-campo"><label class="pf-rotulo" for="ban-link">Link (caminho da plataforma ou https)</label>
            <input class="pf-input" id="ban-link" name="link" maxlength="500" value="${(v.link && v.link.url) || ''}" placeholder="tutoriais.html"></div>
          <div class="pf-campo"><label class="pf-rotulo" for="ban-rotulo">Rótulo do link</label>
            <input class="pf-input" id="ban-rotulo" name="rotulo" maxlength="40" value="${(v.link && v.link.rotulo) || 'Saiba mais'}"></div>
          <div class="pf-campo" data-com-so-inicio><label class="pf-rotulo" for="ban-img">Imagem (JPG, PNG ou WebP, até 1 MB)</label>
            <input class="pf-input" id="ban-img" name="imagem" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="ban-img-ajuda">
            <p class="pf-ajuda" id="ban-img-ajuda">Sem texto dentro da imagem: o título e o texto precisam bastar.</p></div>
          <div class="pf-campo" data-com-so-inicio><label class="pf-rotulo" for="ban-alt">Descrição da imagem (texto alternativo)</label>
            <input class="pf-input" id="ban-alt" name="imagemAlt" maxlength="140" value="${v.imagemAlt || ''}" aria-describedby="ban-alt-ajuda">
            <p class="pf-ajuda" id="ban-alt-ajuda">Em branco, a imagem é tratada como decorativa.</p></div>
          <fieldset data-com-campo="publico"><legend>Público <span aria-hidden="true">*</span></legend>
            <div class="pf-com-opcoes">
              ${[['aluno', 'Alunos'], ['professor', 'Professores'], ['admin', 'Coordenação']].map(([p, r]) => ui.html`<label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" name="papeis" value="${p}" ${papeis.indexOf(p) >= 0 ? 'checked' : ''}> ${r}</label>`)}
            </div>
            <div class="pf-com-opcoes">
              <label class="pf-radio" data-alvo-excecao="rotulo-clicavel"><input type="radio" name="publicoTipo" value="todos" ${v.publico.tipo === 'todos' ? 'checked' : ''}> Todos (com curso ativo)</label>
              <label class="pf-radio" data-alvo-excecao="rotulo-clicavel"><input type="radio" name="publicoTipo" value="curso" ${v.publico.tipo === 'curso' ? 'checked' : ''}> Cursos</label>
            </div>
            <div class="pf-com-opcoes" data-com-bcursos>${cursos.map((c) => ui.html`<label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" name="cursoIds" value="${c.id}" ${(v.publico.cursoIds || []).indexOf(c.id) >= 0 ? 'checked' : ''}> ${c.titulo}</label>`)}</div>
          </fieldset>
          <div class="pf-campo"><label class="pf-rotulo" for="ban-ini">Início <span aria-hidden="true">*</span></label>
            <input class="pf-input" id="ban-ini" name="inicioEm" type="date" required value="${paraDataLocal(v.inicioEm)}"></div>
          <div class="pf-campo"><label class="pf-rotulo" for="ban-fim">Fim <span aria-hidden="true">*</span></label>
            <input class="pf-input" id="ban-fim" name="fimEm" type="date" required value="${paraDataLocal(v.fimEm)}" aria-describedby="ban-fim-ajuda">
            <p class="pf-ajuda" id="ban-fim-ajuda">Até 366 dias depois do início. O banner sai do ar no fim do dia.</p></div>
          <label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" name="ativo" ${v.ativo !== false ? 'checked' : ''}> Ativo</label>
          <div class="pf-com-previas" aria-label="Prévia nos dois temas">
            <div class="pf-com-previa pf-escopo-escuro"><p class="pf-com-previa__rotulo">Tema escuro</p><p class="pf-com-previa__titulo" data-com-pt></p><p class="pf-com-previa__texto" data-com-px></p></div>
            <div class="pf-com-previa pf-escopo-claro"><p class="pf-com-previa__rotulo">Tema claro</p><p class="pf-com-previa__titulo" data-com-pt></p><p class="pf-com-previa__texto" data-com-px></p></div>
          </div>
          <div class="pf-com-acoes">
            <button type="submit" class="dmc-btn dmc-btn--primary" data-com-bsalvar>${b ? 'Salvar banner' : 'Criar banner'}</button>
            ${b && b.imagemUrl ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-com-bimg-remover>Remover imagem</button>` : ''}
            ${b ? ui.html`<button type="button" class="dmc-btn dmc-btn--ghost pf-btn--perigo" data-com-bremover>Remover banner</button>` : ''}
            <button type="button" class="dmc-btn dmc-btn--ghost" data-com-bcancelar>Cancelar</button>
          </div>
        </form></div></section>`;
      const f = caixaForm.querySelector('[data-com-bform]');
      const h = caixaForm.querySelector('#com-banner-t');
      if (h) h.focus();
      const local = () => { const r = f.querySelector('input[name="local"]:checked'); return r ? r.value : 'inicio'; };
      function atualizar() {
        const topo = local() === 'topo';
        f.querySelectorAll('[data-com-so-inicio]').forEach((x) => { x.hidden = topo; });
        const pt = f.querySelector('input[name="publicoTipo"]:checked');
        f.querySelector('[data-com-bcursos]').hidden = !pt || pt.value !== 'curso';
        const n = [...f.elements.texto.value].length;
        f.querySelector('[data-com-contador]').textContent = `${n}/${topo ? 90 : 160}`;
        f.querySelectorAll('[data-com-pt]').forEach((x) => { x.textContent = topo ? '' : (f.elements.titulo.value || 'Título do destaque'); x.hidden = topo; });
        f.querySelectorAll('[data-com-px]').forEach((x) => { x.textContent = f.elements.texto.value || (topo ? 'Texto da faixa do topo' : ''); });
      }
      f.addEventListener('input', atualizar);
      f.addEventListener('change', atualizar);
      atualizar();
      caixaForm.querySelector('[data-com-bcancelar]').addEventListener('click', () => { caixaForm.innerHTML = ''; });

      f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const botao = f.querySelector('[data-com-bsalvar]');
        const linkUrl = f.elements.link.value.trim();
        const pt = f.querySelector('input[name="publicoTipo"]:checked');
        const corpo = {
          local: local(), titulo: f.elements.titulo.value, texto: f.elements.texto.value,
          link: linkUrl ? { url: linkUrl, rotulo: f.elements.rotulo.value.trim() || 'Saiba mais' } : null,
          imagemAlt: local() === 'inicio' ? f.elements.imagemAlt.value : '',
          inicioEm: f.elements.inicioEm.value, fimEm: f.elements.fimEm.value, ativo: f.elements.ativo.checked,
          publico: {
            papeis: [...f.querySelectorAll('input[name="papeis"]:checked')].map((x) => x.value),
            tipo: pt ? pt.value : 'todos',
            cursoIds: pt && pt.value === 'curso' ? [...f.querySelectorAll('input[name="cursoIds"]:checked')].map((x) => x.value) : []
          }
        };
        const img = f.elements.imagem && f.elements.imagem.files && f.elements.imagem.files[0];
        if (img && img.size > MAX_IMAGEM) { marcarErros(ui, f, { campos: { imagem: 'A imagem passa de 1 MB.' } }); return; }
        ui.ocupado(botao, true, 'Salvando…');
        try {
          let r;
          if (b) r = await ctx.api.put(API.banner(b.id), { ...corpo, versao: b.versao });
          else r = await ctx.api.post(API.banners, { ...corpo, ordem: st.itens.filter((x) => x.local === corpo.local).length });
          if (img && corpo.local === 'inicio') await enviarArquivo(API.bannerImagem(r.banner.id), img);
          avisar(ui, b ? 'Banner salvo.' : 'Banner criado.');
          caixaForm.innerHTML = '';
          await carregar();
        } catch (err) {
          marcarErros(ui, f, err);
        } finally {
          ui.ocupado(botao, false);
        }
      });
      const remImg = caixaForm.querySelector('[data-com-bimg-remover]');
      if (remImg) remImg.addEventListener('click', async () => {
        ui.ocupado(remImg, true);
        try { await ctx.api.del(API.bannerImagem(b.id)); avisar(ui, 'Imagem removida.'); caixaForm.innerHTML = ''; await carregar(); } catch (err) { marcarErros(ui, f, err); } finally { ui.ocupado(remImg, false); }
      });
      const rem = caixaForm.querySelector('[data-com-bremover]');
      if (rem) rem.addEventListener('click', async () => {
        const ok = await confirmar(ui, { titulo: 'Remover banner?', texto: 'O banner sai do ar e é apagado.', rotuloConfirmar: 'Remover', perigo: true });
        if (!ok) return;
        ui.ocupado(rem, true);
        try { await ctx.api.del(API.banner(b.id)); avisar(ui, 'Banner removido.'); caixaForm.innerHTML = ''; await carregar(); } catch (err) { marcarErros(ui, f, err); } finally { ui.ocupado(rem, false); }
      });
    }

    carregar();
  }

  P.registrar({ rota: 'publicacoes', titulo: 'Publicações', papeis: PA, montar: montarLista });
  P.registrar({ rota: 'publicacoes/nova', titulo: 'Nova publicação', papeis: PA, montar: montarEditor });
  P.registrar({ rota: 'publicacoes/:id', titulo: 'Publicação', papeis: PA, montar: montarEditor });
  P.registrar({ rota: 'banners', titulo: 'Banners', papeis: A, montar: montarBanners });
})();
