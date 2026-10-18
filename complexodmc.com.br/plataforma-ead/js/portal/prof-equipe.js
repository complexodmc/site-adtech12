/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-equipe.js (F8)
   Equipe (coordenação) — #/equipe e #/equipe/:userId.
   Spec: PORTAL-UX.md §7.19; PORTAL-API.md §6.2 (rotas da F0t).
   Professor não se cadastra sozinho: só a coordenação cria/promove.
   Ações críticas pedem motivo e reautenticação (DC-38); a senha
   temporária aparece UMA vez, com [Copiar].
   ============================================================= */
(function () {
  'use strict';
  const P = window.DMC_Professor;
  if (!P) return;

  const API = {
    equipe: '/portal/admin/equipe',
    usuario: (id) => `/portal/admin/usuarios/${encodeURIComponent(id)}`,
    papel: (id) => `/portal/admin/usuarios/${encodeURIComponent(id)}/papel`,
    senha: (id) => `/portal/admin/usuarios/${encodeURIComponent(id)}/senha-temporaria`,
    redefinir2fa: (id) => `/portal/admin/usuarios/${encodeURIComponent(id)}/2fa/redefinir`,
    desativar: (id) => `/portal/admin/usuarios/${encodeURIComponent(id)}/desativar`,
    reativar: (id) => `/portal/admin/usuarios/${encodeURIComponent(id)}/reativar`,
    docencias: '/portal/admin/docencias',
    docencia: (id) => `/portal/admin/docencias/${encodeURIComponent(id)}`
  };
  const ROTULO_PAPEL = { professor: 'Professor', admin: 'Coordenação', aluno: 'Aluno' };

  function htmlDocencias(ui, docs) {
    if (!Array.isArray(docs) || !docs.length) return '—';
    return docs.map((d) => [d.cursoTitulo || d.cursoId, d.turmaCodigo ? d.turmaCodigo : '(curso)'].join(' ')).join(' · ');
  }

  /** Mostra a senha temporária UMA vez, com [Copiar] (nunca vai a toast, log ou armazenamento). */
  async function mostrarSenha(ui, senha, expiraEm) {
    const conteudo = ui.html`<p>Entregue por um canal seguro. Ela vale por 72 horas e só até o primeiro acesso, quando a pessoa cria a própria senha.${expiraEm ? ui.html` Expira em ${ui.fmt.dataHora(expiraEm)}.` : ''}</p>
      <p class="pf-prof-segredo" data-pf-prof-segredo>${senha}</p>
      <p><button type="button" class="dmc-btn dmc-btn--secondary" data-pf-prof-copiar>Copiar</button> <span class="pf-prof-nota" data-pf-prof-copiado role="status"></span></p>`;
    await ui.dialogo({
      titulo: 'Senha temporária',
      conteudo,
      acoes: [{ rotulo: 'Fechar', valor: true, tipo: 'primario', acao: 'cancelar' }],
      aoAbrir: (dlg) => {
        const b = dlg.querySelector('[data-pf-prof-copiar]');
        if (b) b.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(senha); dlg.querySelector('[data-pf-prof-copiado]').textContent = 'Copiada.'; } catch (_e) { dlg.querySelector('[data-pf-prof-copiado]').textContent = 'Selecione e copie manualmente.'; }
        });
      }
    });
  }


  /** Alterar e-mail da conta (PUT /portal/admin/usuarios/:id/email, F0t): motivo e reautenticação. */
  async function alterarEmail(ui, api, id, emailAtual) {
    const r = await ui.formulario({
      titulo: 'Alterar e-mail',
      descricao: 'A pessoa sai de todas as sessões e o novo endereço fica como não confirmado.',
      campos: [
        { nome: 'email', rotulo: 'Novo e-mail', tipo: 'email', obrigatorio: true, max: 254, valor: '' },
        { nome: 'motivo', rotulo: 'Motivo (fica registrado na auditoria)', tipo: 'textarea', obrigatorio: true, max: 500 }
      ],
      rotuloEnviar: 'Alterar e-mail',
      reautenticar: true,
      validar: (v) => {
        const erros = {};
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email || '')) erros.email = 'Informe um e-mail válido.';
        else if (String(v.email).toLowerCase() === String(emailAtual || '').toLowerCase()) erros.email = 'Este já é o e-mail da conta.';
        if ((v.motivo || '').length < 10) erros.motivo = 'Escreva entre 10 e 500 caracteres.';
        return Object.keys(erros).length ? erros : null;
      },
      enviar: (v, reautenticacao) => api.put(`/portal/admin/usuarios/${encodeURIComponent(id)}/email`, { email: v.email, motivo: v.motivo, reautenticacao })
    });
    return r && r !== true ? r : null;
  }

  // ---------------------------------------------------------------
  // #/equipe
  // ---------------------------------------------------------------
  async function montarLista(el, ctx) {
    const ui = ctx.ui;
    ui.esqueleto(el, { tipo: 'tabela', linhas: 4 });
    let dados;
    try {
      dados = await ctx.api.get(API.equipe, { silencioso404: true, sinal: ctx.sinal });
    } catch (err) { throw err; }
    el.removeAttribute('aria-busy');
    if (dados === null) {
      ui.alerta(el, { tom: 'info', texto: 'A gestão da equipe depende do módulo de contas, ainda não disponível.' });
      return;
    }
    const itens = Array.isArray(dados.itens) ? dados.itens : [];
    const desenhar = () => {
      el.replaceChildren(ui.nos(ui.html`<p class="pf-prof-acoes"><button type="button" class="dmc-btn dmc-btn--primary" data-pf-prof-adicionar aria-expanded="false" aria-controls="pf-prof-form-equipe">Adicionar à equipe</button></p>
        <form class="pf-prof-form" id="pf-prof-form-equipe" hidden novalidate>
          <label class="pf-campo pf-prof-campo"><span class="pf-campo__rotulo">E-mail *</span><input class="pf-input" type="email" name="email" required maxlength="254" autocomplete="off"></label>
          <label class="pf-campo pf-prof-campo"><span class="pf-campo__rotulo">Nome *</span><input class="pf-input" type="text" name="nome" required maxlength="120" autocomplete="off"></label>
          <fieldset><legend>Papel *</legend>
            <label class="pf-prof-opcao"><input type="radio" name="papel" value="professor" checked> Professor</label>
            <label class="pf-prof-opcao"><input type="radio" name="papel" value="admin"> Coordenação</label>
          </fieldset>
          ${ctx.cursos.length ? ui.html`<fieldset><legend>Docência (todas as turmas do curso)</legend>
            ${ctx.cursos.map((c) => ui.html`<label class="pf-prof-opcao"><input type="checkbox" name="cursoIds" value="${c.id}"> ${c.titulo}</label>`)}
          </fieldset>` : ''}
          <p class="pf-prof-nota">Conta que já existe é promovida. Se o e-mail dela ainda não foi confirmado, a senha escolhida no cadastro é descartada e uma senha temporária é gerada. Ao escolher Coordenação, a plataforma pede a sua senha.</p>
          <p class="pf-prof-campo__erro" data-pf-prof-erro hidden></p>
          <div class="pf-prof-acoes"><button type="submit" class="dmc-btn dmc-btn--primary">Adicionar</button><button type="button" class="dmc-btn dmc-btn--secondary" data-pf-prof-cancelar>Cancelar</button></div>
        </form>
        ${itens.length ? ui.html`<table class="pf-tabela pf-prof-tabela">
          <caption>${`${itens.length} ${itens.length === 1 ? 'pessoa' : 'pessoas'} na equipe`}</caption>
          <thead><tr><th scope="col">Nome</th><th scope="col">E-mail</th><th scope="col">Papel</th><th scope="col">Docências</th><th scope="col">Verificação em duas etapas</th><th scope="col">Situação</th></tr></thead>
          <tbody>${itens.map((u) => ui.html`<tr>
            <td data-rotulo="Nome"><a class="pf-prof-lista__link" href="${`#/equipe/${encodeURIComponent(u.id)}`}">${u.nome || u.email}</a></td>
            <td data-rotulo="E-mail">${u.email}</td>
            <td data-rotulo="Papel">${ROTULO_PAPEL[u.papel] || u.papel}</td>
            <td data-rotulo="Docências">${htmlDocencias(ui, u.docencias)}</td>
            <td data-rotulo="Verificação em duas etapas">${u.doisFatoresAtivo ? 'Ativa' : 'Não ativa'}</td>
            <td data-rotulo="Situação">${u.desativadoEm ? ui.html`<span class="pf-prof-estado pf-prof-estado--neutro">Desativado</span>` : ui.html`<span class="pf-prof-estado pf-prof-estado--sucesso">Ativo</span>`}</td>
          </tr>`)}</tbody></table>` : ui.html`<div class="pf-vazio pf-prof-vazio"><p class="pf-prof-vazio__titulo">Nenhuma pessoa na equipe ainda.</p></div>`}`));
    };
    desenhar();

    const aoClicar = (e) => {
      const abrir = e.target.closest('[data-pf-prof-adicionar]');
      const cancelar = e.target.closest('[data-pf-prof-cancelar]');
      const form = el.querySelector('#pf-prof-form-equipe');
      if (abrir) { form.hidden = false; abrir.setAttribute('aria-expanded', 'true'); form.querySelector('[name="email"]').focus(); }
      if (cancelar) { form.reset(); form.hidden = true; const b = el.querySelector('[data-pf-prof-adicionar]'); b.setAttribute('aria-expanded', 'false'); b.focus(); }
    };
    const aoEnviar = async (e) => {
      const form = e.target.closest('#pf-prof-form-equipe');
      if (!form) return;
      e.preventDefault();
      const erro = form.querySelector('[data-pf-prof-erro]');
      erro.hidden = true;
      const fd = new FormData(form);
      const corpo = {
        email: String(fd.get('email') || '').trim(),
        nome: String(fd.get('nome') || '').trim(),
        papel: String(fd.get('papel') || 'professor'),
        cursoIds: fd.getAll('cursoIds').map(String)
      };
      if (!corpo.email || !corpo.nome) { erro.textContent = 'Preencha e-mail e nome.'; erro.hidden = false; return; }
      const enviar = (_valores, reautenticacao) => ctx.api.post(API.equipe, reautenticacao ? { ...corpo, reautenticacao } : corpo);
      let r;
      const botao = form.querySelector('button[type="submit"]');
      try {
        if (corpo.papel === 'admin') {
          r = await ui.confirmar({ titulo: 'Adicionar à coordenação', texto: `${corpo.nome} terá acesso a toda a área da coordenação.`, rotuloConfirmar: 'Adicionar', reautenticar: true, enviar });
          if (!r || r === true) return;
        } else {
          ui.ocupado(botao, true, 'Adicionando…');
          r = await enviar({}, null);
          ui.ocupado(botao, false);
        }
      } catch (err) {
        ui.ocupado(botao, false);
        erro.textContent = (err.campos && (err.campos.email || err.campos.nome)) || err.message;
        erro.hidden = false;
        return;
      }
      ui.toast(r.criado ? 'Conta criada.' : 'Conta promovida.', { tipo: 'sucesso' });
      if (r.senhaTemporaria) await mostrarSenha(ui, r.senhaTemporaria, r.expiraEm);
      ctx.navegar('equipe');
    };
    el.addEventListener('click', aoClicar);
    el.addEventListener('submit', aoEnviar);
    return { destruir() { el.removeEventListener('click', aoClicar); el.removeEventListener('submit', aoEnviar); } };
  }

  // ---------------------------------------------------------------
  // #/equipe/:userId
  // ---------------------------------------------------------------
  async function montarDetalhe(el, ctx) {
    const ui = ctx.ui;
    const id = ctx.params.userId;
    ui.esqueleto(el, { tipo: 'texto', linhas: 4 });
    const d = await ctx.api.get(API.usuario(id), { sinal: ctx.sinal });
    el.removeAttribute('aria-busy');
    const u = d.usuario;
    const proprio = ctx.user && String(ctx.user.id) === String(u.id);
    ctx.definirTitulo(u.nome || u.email);
    const docs = Array.isArray(d.docencias) ? d.docencias : [];
    const semDocencia = ctx.cursos.filter((c) => !docs.some((x) => x.cursoId === c.id && !x.turmaId));
    el.replaceChildren(ui.nos(ui.html`<p><a class="pf-prof-cabecalho__voltar" href="#/equipe">← Equipe</a></p>
      <dl class="pf-prof-dl">
        <div><dt>E-mail</dt><dd>${u.email}${u.emailVerificado === false ? ' (não confirmado)' : ''}</dd></div>
        <div><dt>Papel</dt><dd>${ROTULO_PAPEL[u.papel] || u.papel}</dd></div>
        <div><dt>Situação</dt><dd>${u.desativadoEm ? `Desativado em ${ui.fmt.data(u.desativadoEm)}` : 'Ativo'}</dd></div>
        <div><dt>Verificação em duas etapas</dt><dd>${u.doisFatoresAtivo ? 'Ativa' : 'Não ativa'}</dd></div>
        <div><dt>Conta criada em</dt><dd>${ui.fmt.data(u.criadoEm)}</dd></div>
        <div><dt>Último acesso</dt><dd>${u.ultimoLoginEm ? ui.fmt.dataHora(u.ultimoLoginEm) : '—'}</dd></div>
      </dl>
      <section class="pf-prof-coluna__bloco" aria-labelledby="pf-prof-docencias">
        <h2 class="pf-prof-h2" id="pf-prof-docencias">Docências</h2>
        ${docs.length ? ui.html`<ul class="pf-prof-lista">${docs.map((x) => ui.html`<li class="pf-prof-lista__item"><span>${x.cursoTitulo || x.cursoId}${x.turmaCodigo ? ` · ${x.turmaCodigo}` : ' · todas as turmas'}</span>
            <button type="button" class="pf-prof-link-botao" data-pf-prof-remover="${x.id}">Remover</button></li>`)}</ul>`
          : ui.html`<p class="pf-prof-nota">Sem docência.</p>`}
        ${u.papel !== 'aluno' && semDocencia.length ? ui.html`<form class="pf-prof-filtros" data-pf-prof-docencia>
          <label class="pf-campo pf-prof-campo"><span class="pf-campo__rotulo">Vincular a um curso (todas as turmas)</span>
            <select class="pf-input" name="cursoId">${semDocencia.map((c) => ui.html`<option value="${c.id}">${c.titulo}</option>`)}</select></label>
          <button type="submit" class="dmc-btn dmc-btn--secondary">Vincular</button></form>` : ''}
      </section>
      <section class="pf-prof-coluna__bloco" aria-labelledby="pf-prof-acoes-conta">
        <h2 class="pf-prof-h2" id="pf-prof-acoes-conta">Ações da conta</h2>
        <div class="pf-prof-acoes">
          ${!proprio ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-prof-acao-conta="papel">Alterar papel</button>` : ''}
          ${!proprio && u.papel === 'professor' ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-prof-acao-conta="senha">Gerar senha temporária</button>` : ''}
          ${!proprio ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-prof-acao-conta="email">Alterar e-mail</button>` : ''}
          ${!proprio && u.doisFatoresAtivo ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-prof-acao-conta="2fa">Redefinir verificação em duas etapas</button>` : ''}
          ${!proprio && !u.desativadoEm ? ui.html`<button type="button" class="dmc-btn pf-btn--perigo" data-pf-prof-acao-conta="desativar">Desativar acesso</button>` : ''}
          ${!proprio && u.desativadoEm ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-prof-acao-conta="reativar">Reativar</button>` : ''}
        </div>
        ${proprio ? ui.html`<p class="pf-prof-nota">Peça a outra conta de coordenação para alterar o seu próprio papel ou acesso.</p>` : ''}
      </section>`));

    const recarregar = () => ctx.navegar(`equipe/${encodeURIComponent(id)}`);
    const aoClicar = async (e) => {
      const rem = e.target.closest('[data-pf-prof-remover]');
      if (rem) {
        const ok = await ui.confirmar({ titulo: 'Remover docência?', texto: 'A pessoa deixa de ver as turmas e os alunos deste vínculo. Correções em andamento ficam sem responsável até outro vínculo.', rotuloConfirmar: 'Remover', perigo: true });
        if (!ok) return;
        try { await ctx.api.del(API.docencia(rem.getAttribute('data-pf-prof-remover'))); ui.toast('Docência removida.', { tipo: 'sucesso' }); recarregar(); } catch (err) { ui.toast(err.message, { tipo: 'erro' }); }
        return;
      }
      const b = e.target.closest('[data-pf-prof-acao-conta]');
      if (!b) return;
      const acao = b.getAttribute('data-pf-prof-acao-conta');
      try {
        if (acao === 'papel') {
          const novo = u.papel === 'admin' ? 'professor' : (u.papel === 'professor' ? 'admin' : 'professor');
          const r = await ui.confirmar({
            titulo: 'Alterar papel', texto: `Mudar de ${ROTULO_PAPEL[u.papel]} para ${ROTULO_PAPEL[novo]}?`, rotuloConfirmar: 'Alterar papel', motivo: true, reautenticar: true,
            enviar: (v, reautenticacao) => ctx.api.put(API.papel(id), { papel: novo, motivo: v.motivo, reautenticacao })
          });
          if (r && r !== true) { ui.toast('Papel alterado.', { tipo: 'sucesso' }); recarregar(); }
        } else if (acao === 'senha') {
          const r = await ui.confirmar({
            titulo: 'Gerar senha temporária', texto: 'A senha atual deixa de valer e a pessoa sai de todas as sessões.', rotuloConfirmar: 'Gerar senha', motivo: true, reautenticar: true,
            enviar: (v, reautenticacao) => ctx.api.post(API.senha(id), { motivo: v.motivo, reautenticacao })
          });
          if (r && r.senhaTemporaria) await mostrarSenha(ui, r.senhaTemporaria, r.expiraEm);
        } else if (acao === 'email') {
          const r = await alterarEmail(ui, ctx.api, id, u.email);
          if (r) { ui.toast('E-mail alterado.', { tipo: 'sucesso' }); recarregar(); }
        } else if (acao === '2fa') {
          const r = await ui.confirmar({
            titulo: 'Redefinir verificação em duas etapas', texto: 'Use depois de confirmar a identidade da pessoa fora da plataforma.', rotuloConfirmar: 'Redefinir', motivo: true, reautenticar: true,
            enviar: (v, reautenticacao) => ctx.api.post(API.redefinir2fa(id), { motivo: v.motivo, reautenticacao })
          });
          if (r && r !== true) { ui.toast('Verificação redefinida.', { tipo: 'sucesso' }); recarregar(); }
        } else if (acao === 'desativar') {
          const r = await ui.confirmar({
            titulo: 'Desativar acesso', texto: 'A pessoa sai de todas as sessões e não entra mais até ser reativada.', rotuloConfirmar: 'Desativar', perigo: true, motivo: true, reautenticar: true,
            enviar: (v, reautenticacao) => ctx.api.post(API.desativar(id), { motivo: v.motivo, reautenticacao })
          });
          if (r && r !== true) { ui.toast('Acesso desativado.', { tipo: 'sucesso' }); recarregar(); }
        } else if (acao === 'reativar') {
          const r = await ui.confirmar({
            titulo: 'Reativar acesso', rotuloConfirmar: 'Reativar', motivo: true,
            enviar: (v) => ctx.api.post(API.reativar(id), { motivo: v.motivo })
          });
          if (r && r !== true) { ui.toast('Acesso reativado.', { tipo: 'sucesso' }); recarregar(); }
        }
      } catch (err) { ui.toast(err.message, { tipo: 'erro' }); }
    };
    const aoEnviar = async (e) => {
      const f = e.target.closest('[data-pf-prof-docencia]');
      if (!f) return;
      e.preventDefault();
      const botao = f.querySelector('button[type="submit"]');
      ui.ocupado(botao, true, 'Vinculando…');
      try {
        await ctx.api.post(API.docencias, { userId: id, cursoId: String(new FormData(f).get('cursoId')) });
        ui.toast('Docência incluída.', { tipo: 'sucesso' });
        recarregar();
      } catch (err) { ui.ocupado(botao, false); ui.toast(err.message, { tipo: 'erro' }); }
    };
    el.addEventListener('click', aoClicar);
    el.addEventListener('submit', aoEnviar);
    return { destruir() { el.removeEventListener('click', aoClicar); el.removeEventListener('submit', aoEnviar); } };
  }

  P.registrar({ rota: 'equipe', titulo: 'Equipe', papeis: ['admin'], montar: montarLista });
  P.registrar({ rota: 'equipe/:userId', titulo: 'Equipe', papeis: ['admin'], montar: montarDetalhe });
})();
