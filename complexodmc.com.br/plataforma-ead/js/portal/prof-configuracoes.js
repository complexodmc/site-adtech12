/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-configuracoes.js (F6a)
   Configurações da coordenação (hospedado em professor.html):
   #/configuracoes/regulamento · #/configuracoes/privacidade ·
   #/configuracoes/instituicao. Spec: PORTAL-UX §7.22; PORTAL-API
   §6.10.5; D-54 (motivo na instituição), DC-70, D-81.
   Nada nasce preenchido; HTML só por DMC_UI.html; sem alert/confirm.
   ============================================================= */
(function () {
  'use strict';
  const P = window.DMC_Professor;
  if (!P) return;

  const API = {
    regs: '/portal/admin/regulamentos',
    reg: (id) => `/portal/admin/regulamentos/${encodeURIComponent(id)}`,
    previa: '/portal/admin/regulamentos/previa',
    publicar: (id) => `/portal/admin/regulamentos/${encodeURIComponent(id)}/publicar`,
    encarregado: '/portal/admin/configuracoes/encarregado',
    instituicao: '/portal/admin/configuracoes/instituicao',
    retencao: '/portal/admin/configuracoes/retencao',
    reaplicar: '/portal/admin/configuracoes/retencao/reaplicar'
  };
  const SECOES = [
    ['configuracoes/ia', 'Assistente de IA'], ['configuracoes/regulamento', 'Regulamento'], ['configuracoes/privacidade', 'Privacidade e dados'],
    ['configuracoes/instituicao', 'Instituição'], ['configuracoes/cursos', 'Critérios dos cursos']
  ];

  const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtData = (ui, iso) => (iso ? (ui.fmt && ui.fmt.data ? ui.fmt.data(iso) : FMT_DATA.format(new Date(iso))) : '—');
  const msgErro = (err) => (err && err.message) || 'Não foi possível concluir agora. Tente de novo.';
  const camposErro = (err) => (err && (err.campos || (err.dados && err.dados.campos))) || null;
  function estado(ui, rotulo, tom) {
    if (typeof ui.estado === 'function') return ui.estado(rotulo, tom);
    const g = ui.icone(tom === 'sucesso' ? 'estadoSucesso' : tom === 'aviso' ? 'estadoAviso' : tom === 'info' ? 'estadoInfo' : 'estadoNeutro');
    return ui.html`<span class="pf-estado pf-estado--${tom}">${g}${rotulo}</span>`;
  }
  function avisar(ui, el, texto, tipo) {
    if (typeof ui.toast === 'function') { ui.toast(texto, { tipo: tipo || 'sucesso' }); return; }
    const alvo = el.querySelector('[data-cfg-aviso]');
    const tom = tipo === 'erro' ? 'erro' : tipo === 'aviso' ? 'aviso' : 'sucesso';
    if (alvo) alvo.innerHTML = ui.html`<div class="pf-alerta pf-alerta--${tom}" role="${tom === 'erro' ? 'alert' : 'status'}"><p>${texto}</p></div>`;
  }
  function marcarErros(ui, form, err) {
    form.querySelectorAll('.pf-erro-campo').forEach((x) => x.remove());
    form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
    let primeiro = null;
    for (const [nome, m] of Object.entries(camposErro(err) || {})) {
      const el = form.elements[nome];
      if (!el || !el.closest) continue;
      el.setAttribute('aria-invalid', 'true');
      const p = document.createElement('p');
      p.className = 'pf-erro-campo';
      p.textContent = String(m);
      (el.closest('.pf-campo') || form).appendChild(p);
      if (!primeiro) primeiro = el;
    }
    if (primeiro) { primeiro.focus(); return true; }
    const caixa = form.querySelector('[data-cfg-erro]');
    if (caixa) caixa.innerHTML = ui.html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>${msgErro(err)}</p>${err && (err.status === 409 || /alterado por outra pessoa/i.test(msgErro(err))) ? ui.html`<p><button type="button" class="dmc-btn dmc-btn--secondary" data-cfg-recarregar>Recarregar</button></p>` : ''}</div>`;
    return false;
  }
  function confirmar(ui, { titulo, texto, rotuloConfirmar }) {
    if (typeof ui.confirmar === 'function') return ui.confirmar({ titulo, texto, rotuloConfirmar });
    return new Promise((resolver) => {
      const d = document.createElement('dialog');
      d.className = 'pf-dialogo pf-dialogo--p';
      d.setAttribute('aria-labelledby', 'cfg-dlg-t');
      d.innerHTML = ui.html`<div class="pf-dialogo__cabeca"><h2 class="pf-dialogo__titulo" id="cfg-dlg-t">${titulo}</h2></div><div class="pf-dialogo__corpo"><p>${texto}</p></div>
        <div class="pf-dialogo__acoes"><button type="button" class="dmc-btn dmc-btn--secondary" data-pf-acao="cancelar">Cancelar</button><button type="button" class="dmc-btn dmc-btn--primary" data-pf-acao="confirmar">${rotuloConfirmar}</button></div>`;
      document.body.appendChild(d);
      let r = false;
      d.addEventListener('close', () => { d.remove(); resolver(r); });
      d.querySelector('[data-pf-acao="cancelar"]').addEventListener('click', () => d.close());
      d.querySelector('[data-pf-acao="confirmar"]').addEventListener('click', () => { r = true; d.close(); });
      d.showModal();
      d.querySelector('[data-pf-acao="cancelar"]').focus();
    });
  }

  function moldura(ui, el, atual) {
    el.innerHTML = ui.html`<div class="pf-at-config">
      <nav aria-label="Seções de configuração"><ul class="pf-at-config__nav">${SECOES.map(([r, t]) => ui.html`<li><a class="pf-at-config__link" href="#/${r}" ${r === atual ? ui.html`aria-current="page"` : ''}>${t}</a></li>`)}</ul></nav>
      <div><div data-cfg-aviso></div><div data-cfg-corpo aria-busy="true"></div></div></div>`;
    return el.querySelector('[data-cfg-corpo]');
  }

  // =========================================================
  // Regulamento
  // =========================================================
  function montarRegulamento(el, ctx) {
    const ui = ctx.ui;
    const corpo = moldura(ui, el, 'configuracoes/regulamento');
    const escopo = ctx.filtros.get('escopo') || 'geral';

    async function carregar() {
      let r;
      try { r = await ctx.api.get(API.regs); } catch (err) { ui.erroCarga(corpo, err, { tentarDeNovo: carregar }); return; }
      corpo.setAttribute('aria-busy', 'false');
      const todos = r.itens || [];
      const doEscopo = todos.filter((x) => x.escopo === escopo);
      const publicado = doEscopo.find((x) => x.status === 'publicado') || null;
      const rascunho = doEscopo.find((x) => x.status === 'rascunho') || null;
      const proxima = doEscopo.reduce((mx, x) => Math.max(mx, Number(x.edicao) || 0), 0) + 1;
      const opcoes = [['geral', 'Regulamento geral'], ...(ctx.cursos || []).map((c) => [c.id, `Curso: ${c.titulo}`])];
      corpo.innerHTML = ui.html`
        <div class="pf-campo"><label class="pf-rotulo" for="cfg-escopo">Regulamento</label>
          <select class="pf-input" id="cfg-escopo" data-cfg-escopo>${opcoes.map(([v, t]) => ui.html`<option value="${v}" ${v === escopo ? 'selected' : ''}>${t}</option>`)}</select></div>
        ${publicado
          ? ui.html`<p>${estado(ui, `Edição ${publicado.edicao} publicada em ${fmtData(ui, publicado.publicadoEm)}${publicado.publicadoPorNome ? ` por ${publicado.publicadoPorNome}` : ''} · ${publicado.trechosConsultaveis} trechos consultáveis pelo assistente`, 'sucesso')} · <a href="regulamento.html">Ver como o aluno vê</a></p>`
          : ui.html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhum regulamento publicado.</p><p class="pf-vazio__texto">Sem ele, o assistente responde só com os dados do aluno e encaminha dúvidas de regras para a equipe.</p></div>`}
        <form class="pf-at-form" data-cfg-reg novalidate>
          <div class="pf-campo"><label class="pf-rotulo" for="cfg-reg-titulo">Título <span aria-hidden="true">*</span></label>
            <input class="pf-input" id="cfg-reg-titulo" name="titulo" maxlength="140" required value="${rascunho ? rascunho.titulo : (publicado ? publicado.titulo : (escopo === 'geral' ? 'Regulamento acadêmico' : ''))}"></div>
          <div class="pf-campo"><label class="pf-rotulo" for="cfg-reg-texto">Texto ${rascunho ? '(rascunho)' : ''} <span aria-hidden="true">*</span></label>
            <textarea class="pf-input pf-at-editor" id="cfg-reg-texto" name="texto" maxlength="200000" aria-describedby="cfg-reg-ajuda">${rascunho ? rascunho.texto : (publicado ? publicado.texto : '')}</textarea>
            <p class="pf-ajuda" id="cfg-reg-ajuda">Linha iniciada por "# " é título de seção. Cada seção vira um trecho consultável e uma âncora na página do aluno.</p></div>
          <div data-cfg-erro></div>
          <div class="pf-at-compositor__acoes">
            <button type="submit" class="dmc-btn dmc-btn--secondary">Salvar rascunho</button>
            <button type="button" class="dmc-btn dmc-btn--secondary" data-cfg-previa>Ver trechos</button>
            <button type="button" class="dmc-btn dmc-btn--primary" data-cfg-publicar ${rascunho ? '' : 'disabled'}>Publicar edição ${proxima}</button>
          </div>
          <div data-cfg-previa-saida aria-live="polite"></div>
        </form>
        <section class="pf-at-historico" aria-labelledby="cfg-hist"><h2 class="pf-secao-titulo" id="cfg-hist">Histórico de edições</h2>
          ${doEscopo.filter((x) => x.status !== 'rascunho').length ? ui.html`<table class="pf-tabela"><caption>Edições</caption><thead><tr><th scope="col">Edição</th><th scope="col">Título</th><th scope="col">Situação</th><th scope="col">Publicada em</th><th scope="col" class="pf-tabela__num">Trechos</th></tr></thead>
            <tbody>${doEscopo.filter((x) => x.status !== 'rascunho').sort((a, b) => b.edicao - a.edicao).map((x) => ui.html`<tr><td data-rotulo="Edição">${x.edicao}</td><td data-rotulo="Título">${x.titulo}</td><td data-rotulo="Situação">${x.status === 'publicado' ? estado(ui, 'Em vigor', 'sucesso') : estado(ui, 'Arquivada', 'neutro')}</td><td data-rotulo="Publicada em">${fmtData(ui, x.publicadoEm)}</td><td data-rotulo="Trechos" class="pf-tabela__num">${x.trechosConsultaveis}</td></tr>`)}</tbody></table>`
          : ui.html`<p class="pf-ajuda">Nenhuma edição publicada.</p>`}
        </section>`;
      corpo.querySelector('[data-cfg-escopo]').addEventListener('change', (ev) => ctx.navegar('configuracoes/regulamento', new URLSearchParams(ev.target.value === 'geral' ? '' : `escopo=${ev.target.value}`)));
      const form = corpo.querySelector('[data-cfg-reg]');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const dados = { titulo: form.elements.titulo.value, texto: form.elements.texto.value };
        try {
          if (rascunho) await ctx.api.put(API.reg(rascunho.id), { ...dados, versao: rascunho.versao });
          else await ctx.api.post(API.regs, { ...dados, escopo });
          await carregar();
          avisar(ui, el, 'Rascunho salvo.', 'sucesso');
        } catch (err) {
          marcarErros(ui, form, err);
          const rec = form.querySelector('[data-cfg-recarregar]');
          if (rec) rec.addEventListener('click', carregar);
        }
      });
      form.querySelector('[data-cfg-previa]').addEventListener('click', async () => {
        const saida = form.querySelector('[data-cfg-previa-saida]');
        try {
          const p = await ctx.api.post(API.previa, { texto: form.elements.texto.value });
          saida.innerHTML = ui.html`<p class="pf-ajuda">${p.trechos.length} trechos (nada foi gravado):</p><ol class="pf-lista">${p.trechos.map((t) => ui.html`<li class="pf-lista__linha"><p class="pf-lista__titulo">${t.titulo}</p><p class="pf-lista__meta">${t.tamanho} caracteres</p></li>`)}</ol>`;
        } catch (err) { marcarErros(ui, form, err); }
      });
      form.querySelector('[data-cfg-publicar]').addEventListener('click', async () => {
        if (!rascunho) return;
        const ok = await confirmar(ui, { titulo: `Publicar a edição ${proxima}?`, texto: 'O assistente passa a consultar este texto e os alunos passam a ver esta edição em Regulamento acadêmico.', rotuloConfirmar: 'Publicar edição' });
        if (!ok) return;
        try {
          const r2 = await ctx.api.post(API.publicar(rascunho.id), {});
          await carregar();
          avisar(ui, el, `Edição ${r2.edicao} publicada com ${r2.trechos.length} trechos.`, 'sucesso');
        } catch (err) { avisar(ui, el, msgErro(err), 'erro'); }
      });
    }
    carregar();
  }

  // =========================================================
  // Privacidade e dados (encarregado + retenção)
  // =========================================================
  function montarPrivacidade(el, ctx) {
    const ui = ctx.ui;
    const corpo = moldura(ui, el, 'configuracoes/privacidade');

    async function carregar() {
      let enc;
      let ret;
      try { [enc, ret] = await Promise.all([ctx.api.get(API.encarregado), ctx.api.get(API.retencao)]); } catch (err) { ui.erroCarga(corpo, err, { tentarDeNovo: carregar }); return; }
      corpo.setAttribute('aria-busy', 'false');
      const e = enc.encarregado || {};
      const r = ret.retencao;
      const lim = ret.limites || {};
      corpo.innerHTML = ui.html`
        <section aria-labelledby="cfg-enc"><h2 class="pf-secao-titulo" id="cfg-enc">Encarregado pelo tratamento de dados</h2>
          ${e.nome ? '' : ui.html`<p class="pf-ajuda pf-at-nota">Encarregado não configurado. O canal Meus dados mostra só o e-mail da coordenação até que um nome seja informado.</p>`}
          <form class="pf-at-form" data-cfg-enc novalidate>
            <div class="pf-campo"><label class="pf-rotulo" for="cfg-enc-nome">Nome <span aria-hidden="true">*</span></label><input class="pf-input" id="cfg-enc-nome" name="nome" maxlength="120" value="${e.nome || ''}" autocomplete="off"></div>
            <div class="pf-campo"><label class="pf-rotulo" for="cfg-enc-email">E-mail <span aria-hidden="true">*</span></label><input class="pf-input" id="cfg-enc-email" name="email" type="email" maxlength="254" value="${e.email || ''}" autocomplete="off"></div>
            <div class="pf-campo"><label class="pf-rotulo" for="cfg-enc-tel">Telefone</label><input class="pf-input" id="cfg-enc-tel" name="telefone" inputmode="tel" maxlength="30" value="${e.telefone || ''}" autocomplete="off"></div>
            <div class="pf-campo"><label class="pf-rotulo" for="cfg-enc-url">Canal na internet (https)</label><input class="pf-input" id="cfg-enc-url" name="canalUrl" type="url" maxlength="500" value="${e.canalUrl || ''}" autocomplete="off"></div>
            <div data-cfg-erro></div>
            <p><button type="submit" class="dmc-btn dmc-btn--primary">Salvar encarregado</button></p>
          </form>
        </section>
        <section class="pf-at-historico" aria-labelledby="cfg-ret"><h2 class="pf-secao-titulo" id="cfg-ret">Retenção</h2>
          <form class="pf-at-form" data-cfg-ret novalidate>
            <div class="pf-campo"><label class="pf-rotulo" for="cfg-ret-conv">Conversas com o assistente (dias)</label><input class="pf-input" id="cfg-ret-conv" name="conversasIaDias" type="number" inputmode="numeric" min="${(lim.conversasIaDias || [30])[0]}" max="${(lim.conversasIaDias || [0, 730])[1]}" value="${r.conversasIaDias}"><p class="pf-ajuda">De 30 a 730 dias. O aluno vê este prazo no texto de autorização do assistente.</p></div>
            <div class="pf-campo"><label class="pf-rotulo" for="cfg-ret-not">Notificações (dias)</label><input class="pf-input" id="cfg-ret-not" name="notificacoesDias" type="number" inputmode="numeric" min="30" max="730" value="${r.notificacoesDias}"><p class="pf-ajuda">De 30 a 730 dias.</p></div>
            <div class="pf-campo"><label class="pf-rotulo" for="cfg-ret-tri">Trilha técnica do assistente (dias)</label><input class="pf-input" id="cfg-ret-tri" name="trilhaIaDias" type="number" inputmode="numeric" min="180" max="1825" value="${r.trilhaIaDias}"><p class="pf-ajuda">De 180 a 1.825 dias. Registro sem o texto das conversas, mantido para auditoria mesmo depois que o aluno apaga o histórico. O aluno vê este prazo no texto de autorização do assistente.</p></div>
            <table class="pf-tabela"><caption>Demais categorias (prazo descritivo)</caption><thead><tr><th scope="col">Categoria</th><th scope="col">Prazo</th></tr></thead>
              <tbody>${(ret.categorias || []).map((c) => ui.html`<tr><td data-rotulo="Categoria">${c.rotulo}</td><td data-rotulo="Prazo"><div class="pf-campo"><label class="dmc-sr-only" for="cfg-prazo-${c.categoria}">Prazo de ${c.rotulo}</label><input class="pf-input" id="cfg-prazo-${c.categoria}" name="prazo-${c.categoria}" maxlength="200" value="${r.prazosDescritivos[c.categoria] || ''}" placeholder="A definir"></div></td></tr>`)}</tbody></table>
            <p class="pf-ajuda">A base legal de cada categoria é a da <a href="../pages/politica-de-privacidade.html">Política de privacidade</a>. Exclusão ou anonimização ao fim do prazo é feita pela coordenação, com apoio do relatório Retenção.</p>
            <div data-cfg-erro></div>
            <div class="pf-at-compositor__acoes"><button type="submit" class="dmc-btn dmc-btn--primary">Salvar retenção</button><button type="button" class="dmc-btn dmc-btn--secondary" data-cfg-reaplicar>Reaplicar prazos</button><a class="dmc-btn dmc-btn--secondary" href="#/atendimento?categoria=privacidade&amp;status=todos">Pedidos dos titulares</a></div>
            <div data-cfg-reaplicar-saida aria-live="polite"></div>
          </form>
        </section>`;
      const fEnc = corpo.querySelector('[data-cfg-enc]');
      fEnc.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          await ctx.api.put(API.encarregado, { nome: fEnc.elements.nome.value, email: fEnc.elements.email.value, telefone: fEnc.elements.telefone.value || null, canalUrl: fEnc.elements.canalUrl.value || null, versao: enc.versao || 0 });
          await carregar();
          avisar(ui, el, 'Encarregado salvo.', 'sucesso');
        } catch (err) { marcarErros(ui, fEnc, err); const rec = fEnc.querySelector('[data-cfg-recarregar]'); if (rec) rec.addEventListener('click', carregar); }
      });
      const fRet = corpo.querySelector('[data-cfg-ret]');
      fRet.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const prazos = {};
        (ret.categorias || []).forEach((c) => { prazos[c.categoria] = fRet.elements[`prazo-${c.categoria}`].value || null; });
        try {
          await ctx.api.put(API.retencao, { conversasIaDias: fRet.elements.conversasIaDias.value, notificacoesDias: fRet.elements.notificacoesDias.value, trilhaIaDias: fRet.elements.trilhaIaDias.value, prazosDescritivos: prazos, versao: ret.versao || 0 });
          await carregar();
          avisar(ui, el, 'Retenção salva.', 'sucesso');
        } catch (err) { marcarErros(ui, fRet, err); const rec = fRet.querySelector('[data-cfg-recarregar]'); if (rec) rec.addEventListener('click', carregar); }
      });
      fRet.querySelector('[data-cfg-reaplicar]').addEventListener('click', async () => {
        const saida = fRet.querySelector('[data-cfg-reaplicar-saida]');
        try {
          const x = await ctx.api.post(API.reaplicar, {});
          saida.innerHTML = ui.html`<p>${estado(ui, `Conversas: ${x.conversas} · Notificações: ${x.notificacoes} · Trilha: ${x.trilha}`, 'sucesso')}</p>`;
        } catch (err) { saida.innerHTML = ui.html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>${msgErro(err)}</p></div>`; }
      });
    }
    carregar();
  }

  // =========================================================
  // Instituição
  // =========================================================
  function montarInstituicao(el, ctx) {
    const ui = ctx.ui;
    const corpo = moldura(ui, el, 'configuracoes/instituicao');

    async function carregar() {
      let r;
      try { r = await ctx.api.get(API.instituicao); } catch (err) { ui.erroCarga(corpo, err, { tentarDeNovo: carregar }); return; }
      corpo.setAttribute('aria-busy', 'false');
      const i = r.instituicao;
      corpo.innerHTML = ui.html`
        <p class="pf-ajuda pf-at-nota">Dados do emissor das declarações financeiras anuais (quitação). Nada é preenchido automaticamente.</p>
        ${i ? ui.html`<p>${estado(ui, `Cadastrado em ${fmtData(ui, i.atualizadoEm)}`, 'sucesso')}</p>`
          : ui.html`<div class="pf-vazio"><p>${estado(ui, 'Não cadastrado', 'aviso')}</p><p class="pf-vazio__texto">Dados da instituição não cadastrados: a declaração anual de quitação fica indisponível.</p></div>`}
        <form class="pf-at-form" data-cfg-inst novalidate>
          <div class="pf-campo"><label class="pf-rotulo" for="cfg-inst-razao">Razão social <span aria-hidden="true">*</span></label><input class="pf-input" id="cfg-inst-razao" name="razaoSocial" maxlength="160" value="${i ? i.razaoSocial : ''}" autocomplete="off"></div>
          <div class="pf-campo"><label class="pf-rotulo" for="cfg-inst-fantasia">Nome fantasia</label><input class="pf-input" id="cfg-inst-fantasia" name="nomeFantasia" maxlength="160" value="${i && i.nomeFantasia ? i.nomeFantasia : ''}" autocomplete="off"></div>
          <div class="pf-campo"><label class="pf-rotulo" for="cfg-inst-cnpj">CNPJ <span aria-hidden="true">*</span></label><input class="pf-input" id="cfg-inst-cnpj" name="cnpj" inputmode="numeric" maxlength="18" value="${i ? i.cnpj : ''}" autocomplete="off" aria-describedby="cfg-inst-cnpj-ajuda"><p class="pf-ajuda" id="cfg-inst-cnpj-ajuda">00.000.000/0000-00</p></div>
          <div class="pf-campo"><label class="pf-rotulo" for="cfg-inst-end">Endereço</label><textarea class="pf-input" id="cfg-inst-end" name="endereco" rows="3" maxlength="300" aria-describedby="cfg-inst-end-ajuda">${i && i.endereco ? i.endereco : ''}</textarea><p class="pf-ajuda" id="cfg-inst-end-ajuda">Até 3 linhas e 300 caracteres.</p></div>
          ${i ? ui.html`<div class="pf-campo"><label class="pf-rotulo" for="cfg-inst-motivo">Motivo (fica registrado na auditoria) <span aria-hidden="true">*</span></label><textarea class="pf-input" id="cfg-inst-motivo" name="motivo" rows="2" maxlength="500"></textarea><p class="pf-ajuda">Muda o emissor das próximas declarações. Declarações já emitidas mantêm os dados da época.</p></div>` : ui.html`<p class="pf-ajuda">Declarações já emitidas mantêm os dados da época.</p>`}
          <div data-cfg-erro></div>
          <p><button type="submit" class="dmc-btn dmc-btn--primary">Salvar dados da instituição</button></p>
        </form>`;
      const f = corpo.querySelector('[data-cfg-inst]');
      f.elements.cnpj.addEventListener('blur', () => {
        const d = f.elements.cnpj.value.replace(/\D/g, '');
        if (d.length === 14) f.elements.cnpj.value = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
      });
      f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const dados = { razaoSocial: f.elements.razaoSocial.value, nomeFantasia: f.elements.nomeFantasia.value || null, cnpj: f.elements.cnpj.value, endereco: f.elements.endereco.value || null, versao: r.versao || 0 };
        if (f.elements.motivo) {
          dados.motivo = f.elements.motivo.value;
          if (dados.motivo.trim().length < 10) {
            const e = new Error('Confira os campos destacados.');
            e.campos = { motivo: 'Informe o motivo da alteração (pelo menos 10 caracteres); ele fica registrado na auditoria.' };
            marcarErros(ui, f, e);
            return;
          }
        }
        try {
          await ctx.api.put(API.instituicao, dados);
          await carregar();
          avisar(ui, el, 'Dados da instituição salvos.', 'sucesso');
        } catch (err) { marcarErros(ui, f, err); const rec = f.querySelector('[data-cfg-recarregar]'); if (rec) rec.addEventListener('click', carregar); }
      });
    }
    carregar();
  }

  const A = ['admin'];
  P.registrar({ rota: 'configuracoes/regulamento', titulo: 'Regulamento acadêmico', papeis: A, montar: montarRegulamento });
  P.registrar({ rota: 'configuracoes/privacidade', titulo: 'Privacidade e dados', papeis: A, montar: montarPrivacidade });
  P.registrar({ rota: 'configuracoes/instituicao', titulo: 'Instituição', papeis: A, montar: montarInstituicao });
})();
