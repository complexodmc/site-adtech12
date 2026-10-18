/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-alunos.js (F8)
   Alunos — #/alunos (diretório da coordenação) e a aba Cadastro da
   moldura #/alunos/:userId/cadastro (admin).
   Spec: PORTAL-UX.md §7.5; PORTAL-API.md §6.2 e §6.3.2 (rotas da F0t).
   A moldura do aluno (cabeçalho, seletor "Matrícula" e abas) é do
   professor.js (D-65); as abas Acadêmico, Matrículas, Documentos,
   Contratos, Financeiro e Atendimentos são das fatias donas.
   LGPD: o professor nunca chega aqui (rotas só admin); gênero e etnia
   aparecem como "Restrito".
   ============================================================= */
(function () {
  'use strict';
  const P = window.DMC_Professor;
  if (!P) return;

  const API = {
    usuarios: '/portal/admin/usuarios',
    usuario: (id) => `/portal/admin/usuarios/${encodeURIComponent(id)}`,
    perfil: (id) => `/portal/admin/usuarios/${encodeURIComponent(id)}/perfil`,
    senha: (id) => `/portal/admin/usuarios/${encodeURIComponent(id)}/senha-temporaria`,
    redefinir2fa: (id) => `/portal/admin/usuarios/${encodeURIComponent(id)}/2fa/redefinir`,
    desativar: (id) => `/portal/admin/usuarios/${encodeURIComponent(id)}/desativar`,
    reativar: (id) => `/portal/admin/usuarios/${encodeURIComponent(id)}/reativar`
  };


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
  // #/alunos (diretório)
  // ---------------------------------------------------------------
  async function montarDiretorio(el, ctx) {
    const ui = ctx.ui;
    const q = (ctx.filtros.get('q') || '').trim();
    let pagina = 1;
    let itens = [];
    let total = 0;
    const desc = document.querySelector('[data-pf-prof-descricao]');
    if (desc) { desc.textContent = 'Todas as contas de aluno, inclusive sem matrícula.'; desc.hidden = false; }

    async function carregar(mais) {
      const params = new URLSearchParams({ papel: 'aluno', pagina: String(pagina) });
      if (q.length >= 3) params.set('q', q);
      const r = await ctx.api.get(`${API.usuarios}?${params}`, { silencioso404: true, sinal: ctx.sinal });
      if (r === null) return null;
      itens = mais ? itens.concat(r.itens || []) : (r.itens || []);
      total = Number(r.total) || itens.length;
      return r;
    }

    function desenhar() {
      el.removeAttribute('aria-busy');
      el.replaceChildren(ui.nos(ui.html`<form class="pf-prof-filtros" role="search" data-pf-prof-busca>
          <label class="pf-campo pf-prof-campo"><span class="pf-campo__rotulo">Buscar por nome ou e-mail (3 letras ou mais)</span><input class="pf-input" type="search" name="q" value="${q}" minlength="3" maxlength="80" autocomplete="off"></label>
          <button type="submit" class="dmc-btn dmc-btn--secondary">Buscar</button>
        </form>
        ${q && q.length < 3 ? ui.html`<p class="pf-prof-campo__erro">Use pelo menos 3 letras para buscar.</p>` : ''}
        ${itens.length ? ui.html`<table class="pf-tabela pf-prof-tabela">
          <caption>${`${itens.length} de ${total} ${total === 1 ? 'aluno' : 'alunos'}`}</caption>
          <thead><tr><th scope="col">Aluno</th><th scope="col">Criada em</th><th scope="col">Último acesso</th></tr></thead>
          <tbody>${itens.map((u) => ui.html`<tr>
            <td data-rotulo="Aluno"><a class="pf-prof-lista__link" href="${`#/alunos/${encodeURIComponent(u.id)}`}">${u.nome || u.email}</a><br><span class="pf-prof-lista__meta">${u.email}</span>${u.desativadoEm ? ui.html` <span class="pf-prof-estado pf-prof-estado--neutro">Desativada</span>` : ''}</td>
            <td data-rotulo="Criada em">${ui.fmt.data(u.criadoEm)}</td>
            <td data-rotulo="Último acesso">${u.ultimoLoginEm ? ui.fmt.relativo(u.ultimoLoginEm) : '—'}</td>
          </tr>`)}</tbody></table>
          ${itens.length < total ? ui.html`<p class="pf-prof-mais"><button type="button" class="dmc-btn dmc-btn--secondary" data-pf-prof-mais>Carregar mais</button></p>` : ''}`
        : ui.html`<div class="pf-vazio pf-prof-vazio"><p class="pf-prof-vazio__titulo">${q ? 'Nenhum aluno encontrado.' : 'Nenhuma conta de aluno ainda.'}</p></div>`}`));
    }

    ui.esqueleto(el, { tipo: 'tabela', linhas: 5 });
    const r = await carregar(false);
    if (r === null) {
      el.removeAttribute('aria-busy');
      ui.alerta(el, { tom: 'info', texto: 'O diretório de alunos depende do módulo de contas, ainda não disponível.' });
      return;
    }
    desenhar();
    const aoEnviar = (e) => {
      const f = e.target.closest('[data-pf-prof-busca]');
      if (!f) return;
      e.preventDefault();
      const v = String(new FormData(f).get('q') || '').trim();
      ctx.navegar('alunos', v ? new URLSearchParams({ q: v }) : null);
    };
    const aoClicar = async (e) => {
      const b = e.target.closest('[data-pf-prof-mais]');
      if (!b) return;
      ui.ocupado(b, true, 'Carregando…');
      pagina += 1;
      try { await carregar(true); desenhar(); } catch (err) { pagina -= 1; ui.ocupado(b, false); ui.toast(err.message, { tipo: 'erro' }); }
    };
    el.addEventListener('submit', aoEnviar);
    el.addEventListener('click', aoClicar);
    return { destruir() { el.removeEventListener('submit', aoEnviar); el.removeEventListener('click', aoClicar); } };
  }

  // ---------------------------------------------------------------
  // #/alunos/:userId/cadastro (admin)
  // ---------------------------------------------------------------
  const GRUPOS = [
    ['Identificação', [['nomeRegistro', 'Nome de registro'], ['nomeSocial', 'Nome social'], ['nascimento', 'Nascimento'], ['nacionalidade', 'Nacionalidade'], ['naturalidade', 'Naturalidade'], ['genero', 'Gênero'], ['etnia', 'Etnia'], ['estadoCivil', 'Estado civil']]],
    ['Contato', [['email', 'E-mail'], ['celular', 'Celular'], ['instagram', 'Instagram'], ['facebook', 'Facebook']]],
    ['Endereço', [['endereco.cep', 'CEP'], ['endereco.logradouro', 'Logradouro'], ['endereco.numero', 'Número'], ['endereco.complemento', 'Complemento'], ['endereco.bairro', 'Bairro'], ['endereco.cidade', 'Cidade'], ['endereco.uf', 'UF'], ['endereco.pais', 'País']]],
    ['Documentos', [['cpf', 'CPF'], ['passaporte.numero', 'Passaporte'], ['rg.numero', 'RG'], ['rg.orgaoEmissor', 'Órgão emissor'], ['rg.uf', 'UF do RG']]]
  ];

  function valorDe(obj, caminho) {
    return caminho.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
  }

  function textoCampo(ui, chave, v) {
    if (chave === 'genero' || chave === 'etnia') return 'Restrito';
    if (v === null || v === undefined || v === '') return '—';
    if (chave === 'cpf' && ui.fmt.cpf) return ui.fmt.cpf(String(v));
    if (chave === 'nascimento') return ui.fmt.data(String(v).length === 10 ? `${v}T12:00:00Z` : v);
    return typeof v === 'object' ? '—' : String(v);
  }

  async function montarCadastro(el, ctx) {
    const ui = ctx.ui;
    const id = ctx.params.userId;
    ui.esqueleto(el, { tipo: 'texto', linhas: 6 });
    const [perfil, conta] = await Promise.all([
      ctx.api.get(API.perfil(id), { silencioso404: true, sinal: ctx.sinal }),
      ctx.api.get(API.usuario(id), { silencioso404: true, sinal: ctx.sinal })
    ]);
    el.removeAttribute('aria-busy');
    const u = conta && conta.usuario ? conta.usuario : null;
    const p = perfil && (perfil.perfil || perfil) ? (perfil.perfil || perfil) : null;
    const completude = perfil && perfil.completude ? perfil.completude : (conta && conta.perfil ? conta.perfil : null);
    const blocos = p
      ? GRUPOS.map(([titulo, campos]) => ui.html`<section class="pf-prof-coluna__bloco" aria-label="${titulo}">
          <h2 class="pf-prof-h2">${titulo}</h2>
          <dl class="pf-prof-dl">${campos.map(([k, r]) => ui.html`<div><dt>${r}</dt><dd>${textoCampo(ui, k, valorDe(p, k))}</dd></div>`)}</dl>
        </section>`)
      : ui.html`<div class="pf-alerta pf-alerta--info pf-prof-alerta" role="status"><p>O cadastro completo depende do módulo de perfil, ainda não disponível.</p></div>`;
    el.replaceChildren(ui.nos(ui.html`
      ${completude && Number.isFinite(completude.pct) ? ui.html`<p class="pf-prof-nota">Cadastro ${completude.completo ? 'completo' : `incompleto (${String(completude.pct)}%)`}.</p>` : ''}
      ${blocos}
      ${u ? ui.html`<section class="pf-prof-coluna__bloco" aria-labelledby="pf-prof-conta-aluno">
        <h2 class="pf-prof-h2" id="pf-prof-conta-aluno">Conta</h2>
        <dl class="pf-prof-dl">
          <div><dt>Criada em</dt><dd>${ui.fmt.data(u.criadoEm)}</dd></div>
          <div><dt>Último acesso</dt><dd>${u.ultimoLoginEm ? ui.fmt.dataHora(u.ultimoLoginEm) : '—'}</dd></div>
          <div><dt>Situação</dt><dd>${u.desativadoEm ? `Desativada em ${ui.fmt.data(u.desativadoEm)}` : 'Ativa'}</dd></div>
        </dl>
        <p class="pf-prof-nota">O aluno recebe um aviso de segurança e só poderá assinar contratos 72 horas depois de uma senha temporária ou redefinição.</p>
        <div class="pf-prof-acoes">
          <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-prof-conta="senha">Gerar senha temporária</button>
          <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-prof-conta="email">Alterar e-mail</button>
          ${u.doisFatoresAtivo ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-prof-conta="2fa">Redefinir verificação em duas etapas</button>` : ''}
          ${u.desativadoEm ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-prof-conta="reativar">Reativar conta</button>` : ui.html`<button type="button" class="dmc-btn pf-btn--perigo" data-pf-prof-conta="desativar">Desativar conta</button>`}
        </div>
      </section>` : ''}`));

    const aoClicar = async (e) => {
      const b = e.target.closest('[data-pf-prof-conta]');
      if (!b) return;
      const acao = b.getAttribute('data-pf-prof-conta');
      const recarregar = () => ctx.navegar(`alunos/${encodeURIComponent(id)}/cadastro`);
      try {
        if (acao === 'senha') {
          const r = await ui.confirmar({
            titulo: 'Gerar senha temporária', texto: 'Use quando o envio de e-mail não estiver configurado. A senha atual deixa de valer.', rotuloConfirmar: 'Gerar senha', motivo: true, reautenticar: true,
            enviar: (v, reautenticacao) => ctx.api.post(API.senha(id), { motivo: v.motivo, reautenticacao })
          });
          if (r && r.senhaTemporaria) {
            await ui.dialogo({
              titulo: 'Senha temporária',
              conteudo: ui.html`<p>Entregue ao aluno por um canal seguro. Ela vale por 72 horas e só até o primeiro acesso, quando ele cria a própria senha.</p><p class="pf-prof-segredo">${r.senhaTemporaria}</p>`,
              acoes: [{ rotulo: 'Fechar', valor: true, tipo: 'primario', acao: 'cancelar' }]
            });
          }
        } else if (acao === 'email') {
          const r = await alterarEmail(ui, ctx.api, id, u.email);
          if (r) { ui.toast('E-mail alterado.', { tipo: 'sucesso' }); recarregar(); }
        } else if (acao === '2fa') {
          const r = await ui.confirmar({ titulo: 'Redefinir verificação em duas etapas', texto: 'Use depois de confirmar a identidade do aluno fora da plataforma.', rotuloConfirmar: 'Redefinir', motivo: true, reautenticar: true, enviar: (v, reautenticacao) => ctx.api.post(API.redefinir2fa(id), { motivo: v.motivo, reautenticacao }) });
          if (r && r !== true) { ui.toast('Verificação redefinida.', { tipo: 'sucesso' }); recarregar(); }
        } else if (acao === 'desativar') {
          const r = await ui.confirmar({ titulo: 'Desativar conta', texto: 'O aluno sai de todas as sessões e não entra mais até ser reativado.', rotuloConfirmar: 'Desativar', perigo: true, motivo: true, reautenticar: true, enviar: (v, reautenticacao) => ctx.api.post(API.desativar(id), { motivo: v.motivo, reautenticacao }) });
          if (r && r !== true) { ui.toast('Conta desativada.', { tipo: 'sucesso' }); recarregar(); }
        } else if (acao === 'reativar') {
          const r = await ui.confirmar({ titulo: 'Reativar conta', rotuloConfirmar: 'Reativar', motivo: true, enviar: (v) => ctx.api.post(API.reativar(id), { motivo: v.motivo }) });
          if (r && r !== true) { ui.toast('Conta reativada.', { tipo: 'sucesso' }); recarregar(); }
        }
      } catch (err) { ui.toast(err.message, { tipo: 'erro' }); }
    };
    el.addEventListener('click', aoClicar);
    return { destruir() { el.removeEventListener('click', aoClicar); } };
  }

  P.registrar({ rota: 'alunos', titulo: 'Alunos', papeis: ['admin'], montar: montarDiretorio });
  P.registrar({ rota: 'alunos/:userId/cadastro', titulo: 'Cadastro', papeis: ['admin'], pai: 'alunos/:userId', aba: 'cadastro', montar: montarCadastro });
})();
