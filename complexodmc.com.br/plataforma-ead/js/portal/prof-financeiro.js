/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-financeiro.js (F5)
   Financeiro da coordenação no backoffice (professor.html).
   Spec: PORTAL-UX.md §7.18; PORTAL-API.md §6.9, §8.10; índice §6.3,
   §7.8 (DMC_Professor.registrar), CEO-1 (EXCEÇÃO 1), D-65, D-79.

   Rotas registradas (todas papeis ['admin']):
     #/financeiro                   lista, KPIs do filtro, chips, filtros
                                    (?nova=1|lancar=1&matricula=&protocolo=
                                     abre o lançamento a partir de um pedido)
     #/financeiro/:lancamentoId     detalhe, histórico e ações auditadas
     #/alunos/:userId/financeiro    aba da moldura do aluno (pai, D-65)

   Lançamentos manuais: Boleto, Pix e NFS-e automáticos entram quando o
   gateway for contratado; nada aqui simula cobrança. Sem <script>
   inline, sem on*=, HTML só por DMC_UI.html (escape). Prefixo: pf-fin-.
   ============================================================= */
(function () {
  'use strict';
  const P = window.DMC_Professor;
  if (!P || typeof P.registrar !== 'function') return;

  const API = {
    lancamentos: '/portal/admin/financeiro/lancamentos',
    lote: '/portal/admin/financeiro/lancamentos/lote',
    lancamento: (id) => `/portal/admin/financeiro/lancamentos/${encodeURIComponent(id)}`,
    acao: (id, acao) => `/portal/admin/financeiro/lancamentos/${encodeURIComponent(id)}/${acao}`,
    matriculas: '/portal/admin/matriculas',
    matricula: (id) => `/portal/admin/matriculas/${encodeURIComponent(id)}`,
    atendimento: (protocolo) => `/portal/professor/atendimentos/${encodeURIComponent(protocolo)}`,
    catalogo: '/catalogo'
  };
  const SO_ADMIN = ['admin'];
  const CHIPS = [
    { valor: 'todos', rotulo: 'Todos' },
    { valor: 'aberto', rotulo: 'Em aberto' },
    { valor: 'atrasado', rotulo: 'Em atraso' },
    { valor: 'pago', rotulo: 'Pagos' },
    { valor: 'cancelado', rotulo: 'Cancelados' }
  ];
  const TIPOS = [{ valor: 'matricula', rotulo: 'Matrícula' }, { valor: 'parcela', rotulo: 'Parcela' }, { valor: 'taxa', rotulo: 'Taxa' }];
  const FORMAS = [{ valor: 'boleto', rotulo: 'Boleto' }, { valor: 'pix', rotulo: 'Pix' }, { valor: 'cartao', rotulo: 'Cartão' }, { valor: 'transferencia', rotulo: 'Transferência' }];
  const ORIGENS = [{ valor: '', rotulo: 'Todas' }, { valor: 'manual', rotulo: 'Manual' }, { valor: 'gateway', rotulo: 'Gateway' }];
  const ROTULO_ACAO = {
    criado: 'Lançamento registrado', alterado: 'Lançamento alterado', pago: 'Pagamento registrado', estornado: 'Pagamento estornado',
    cancelado: 'Lançamento cancelado', nfse_registrada: 'NFS-e informada', nfse_removida: 'NFS-e removida',
    segunda_via_link: '2ª via por link', segunda_via_pdf: '2ª via em PDF', segunda_via_removida: '2ª via removida'
  };
  const POR_PAGINA = 50;
  const ATD_RE = /^ATD-\d{4}-[2-9A-HJ-NP-Z]{6}$/;

  // ---------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------
  function frag(marcacao) {
    const t = document.createElement('template');
    t.innerHTML = String(marcacao); // marcacao vem SEMPRE de DMC_UI.html (escape)
    return t.content;
  }
  const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  function dia(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
  }
  function dataHora(ui, iso) {
    if (!iso) return '—';
    return ui.fmt && ui.fmt.dataHora ? ui.fmt.dataHora(iso) : new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }
  const moeda = (ui, c) => (Number.isInteger(c) ? ui.fmt.moeda(c) : '—');
  /** '1.990,00' · '1990' · '1990,5' · 'R$ 415,00' → centavos (inteiro > 0) ou null. */
  function centavosDoTexto(s) {
    let t = String(s == null ? '' : s).replace(/R\$\s*/i, '').replace(/\s/g, '');
    if (!t) return null;
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    const c = Math.round(Number(t) * 100);
    return Number.isInteger(c) && c > 0 && c <= 100000000 ? c : null;
  }
  const reaisDeCentavos = (c) => (Number.isInteger(c) ? (c / 100).toFixed(2).replace('.', ',') : '');
  function primeiroEUltimoDoMes() {
    const h = hojeSP();
    const [a, m] = h.split('-').map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return { de: `${h.slice(0, 7)}-01`, ate: `${h.slice(0, 7)}-${String(ultimo).padStart(2, '0')}` };
  }
  function mensagemDeErro(err) {
    return (err && err.message) || 'Não foi possível concluir agora. Tente de novo.';
  }
  function situacao(ui, i) {
    if (i.status === 'pago') return ui.estado(i.pagoEm ? `Pago em ${dia(i.pagoEm)}` : 'Pago', 'sucesso');
    if (i.status === 'atrasado') return ui.estado('Em atraso', 'erro');
    if (i.status === 'cancelado') return ui.estado('Cancelado', 'neutro');
    if (Number.isInteger(i.venceEmDias)) return ui.estado(i.venceEmDias === 0 ? 'Vence hoje' : `Vence em ${i.venceEmDias} ${i.venceEmDias === 1 ? 'dia' : 'dias'}`, 'aviso');
    return ui.estado('Em aberto', 'info');
  }
  function slotDoCabecalho(el, seletor) {
    const vista = el.closest('#pf-prof-vista') || document;
    return vista.querySelector(seletor);
  }
  function colocarAcoes(el, marcacao) {
    const slot = slotDoCabecalho(el, '[data-pf-prof-acoes]');
    const alvo = slot || (() => {
      const d = document.createElement('div');
      d.className = 'pf-fin-reserva';
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
  let memoCursos = null;
  function listarCursos(ctx) {
    if (!memoCursos) {
      memoCursos = ctx.api.get(API.catalogo).then((r) => {
        const lista = r && Array.isArray(r.cursos) ? r.cursos : [];
        return lista.map((c) => ({ id: c.id, titulo: c.titulo || c.id }));
      }).catch(() => {
        memoCursos = null;
        return Array.isArray(ctx.cursos) ? ctx.cursos.map((c) => ({ id: c.id, titulo: c.titulo || c.id })) : [];
      });
    }
    return memoCursos;
  }

  // ---------------------------------------------------------------
  // Tabela da coordenação
  // ---------------------------------------------------------------
  function htmlTabela(ui, itens, { legenda, semAluno = false } = {}) {
    return ui.html`<table class="pf-tabela pf-fin-tabela">
      <caption>${legenda}</caption>
      <thead><tr>
        ${semAluno ? '' : ui.html`<th scope="col">Aluno</th>`}
        <th scope="col">Lançamento</th>
        <th scope="col" class="pf-tabela__secundaria">Matrícula</th>
        <th scope="col">Vencimento</th>
        <th scope="col" class="pf-tabela__num">Valor</th>
        <th scope="col" class="pf-tabela__secundaria">Forma</th>
        <th scope="col">Situação</th>
        <th scope="col" class="pf-tabela__secundaria pf-fin-nowrap">NFS-e</th>
        <th scope="col" class="pf-tabela__secundaria">2ª via</th>
        <th scope="col" class="pf-tabela__acoes"><span class="dmc-sr-only">Ações</span></th>
      </tr></thead>
      <tbody>${itens.map((i) => ui.html`<tr data-pf-fin-linha="${i.id}">
        ${semAluno ? '' : ui.html`<td data-rotulo="Aluno"><span class="pf-fin-aluno">${(i.aluno && i.aluno.nome) || '—'}</span><span class="pf-fin-meta">${(i.aluno && i.aluno.email) || ''}</span></td>`}
        <td data-rotulo="Lançamento"><a class="pf-fin-link-linha" href="${`#/financeiro/${i.id}`}">${i.rotuloTipo}</a>${i.cursoTitulo ? ui.html`<span class="pf-fin-meta">${i.cursoTitulo}</span>` : ''}${i.descricao ? ui.html`<span class="pf-fin-meta">${i.descricao}</span>` : ''}</td>
        <td data-rotulo="Matrícula" class="pf-tabela__secundaria pf-fin-nowrap">${i.matriculaNumero || '—'}</td>
        <td data-rotulo="Vencimento" class="pf-fin-nowrap">${dia(i.vencimento)}</td>
        <td data-rotulo="Valor" class="pf-tabela__num">${moeda(ui, i.valorCentavos)}</td>
        <td data-rotulo="Forma" class="pf-tabela__secundaria">${i.formaRotulo || '—'}</td>
        <td data-rotulo="Situação">${situacao(ui, i)}</td>
        <td data-rotulo="NFS-e" class="pf-tabela__secundaria">${i.nfseNumero || '—'}</td>
        <td data-rotulo="2ª via" class="pf-tabela__secundaria">${i.segundaVia ? (i.segundaVia.tipo === 'pdf' ? 'PDF' : 'Link') : '—'}</td>
        <td class="pf-tabela__acoes"><a class="dmc-btn dmc-btn--secondary pf-fin-acao" href="${`#/financeiro/${i.id}`}">Abrir<span class="dmc-sr-only">${` ${i.rotuloTipo}${i.aluno && i.aluno.nome ? ` de ${i.aluno.nome}` : ''}`}</span></a></td>
      </tr>`)}</tbody>
    </table>`;
  }

  function kpisDe(ui, k) {
    const n = (x) => (x && Number.isInteger(x.qtd) ? (x.qtd === 1 ? '1 lançamento' : x.qtd === 0 ? 'nenhum' : `${x.qtd} lançamentos`) : '—');
    const atraso = (k && k.emAtraso) || { valorCentavos: 0 };
    return [
      { rotulo: 'Total', valor: moeda(ui, k && k.total && k.total.valorCentavos), nota: n(k && k.total) },
      { rotulo: 'Em aberto', valor: moeda(ui, k && k.emAberto && k.emAberto.valorCentavos), nota: n(k && k.emAberto) },
      { rotulo: 'Pago', valor: moeda(ui, k && k.pago && k.pago.valorCentavos), nota: n(k && k.pago) },
      { rotulo: 'Em atraso', valor: moeda(ui, atraso.valorCentavos), nota: n(atraso), tom: atraso.valorCentavos > 0 ? 'erro' : null }
    ];
  }

  // ---------------------------------------------------------------
  // Lançar (único ou parcelas)
  // ---------------------------------------------------------------
  async function escolherMatricula(ctx) {
    const ui = ctx.ui;
    const busca = await ui.formulario({
      titulo: 'Lançar',
      descricao: 'Encontre a matrícula do aluno. O lançamento fica vinculado a ela e aparece no Financeiro do aluno.',
      campos: [{ nome: 'q', rotulo: 'Aluno ou nº da matrícula', tipo: 'text', obrigatorio: true, max: 80, ajuda: 'Nome, e-mail ou número (MAT-…).' }],
      rotuloEnviar: 'Buscar matrículas'
    });
    if (!busca) return null;
    let r;
    try {
      r = await ctx.api.get(`${API.matriculas}?q=${encodeURIComponent(busca.q)}&status=todas&porPagina=50`);
    } catch (err) {
      ui.toast(mensagemDeErro(err), { tipo: 'erro' });
      return null;
    }
    const itens = r && Array.isArray(r.itens) ? r.itens : [];
    if (!itens.length) {
      ui.toast('Nenhuma matrícula encontrada para essa busca. A matrícula é criada em Matrículas.', { tipo: 'aviso' });
      return null;
    }
    return itens;
  }

  /**
   * Formulário do lançamento. `fixa` = matrícula já escolhida (a partir de um pedido ou da aba do aluno).
   * Resolve com o lançamento criado (ou { criados }) ou null.
   */
  async function abrirLancar(ctx, { matriculas = null, fixa = null, valorSugerido = null, descricao = '', tipo = 'matricula' } = {}) {
    const ui = ctx.ui;
    let lista = fixa ? [fixa] : matriculas;
    if (!lista) lista = await escolherMatricula(ctx);
    if (!lista || !lista.length) return null;
    const rotuloMat = (m) => [m.numero, m.aluno && m.aluno.nome, m.cursoTitulo].filter(Boolean).join(' · ');
    const valores = await ui.formulario({
      titulo: fixa ? `Lançar · ${rotuloMat(fixa)}` : 'Lançar',
      descricao: 'Registro manual: a cobrança (boleto, Pix ou cartão) e a NFS-e são feitas fora da plataforma.',
      campos: [
        { nome: 'matriculaId', rotulo: 'Matrícula', tipo: 'select', obrigatorio: true, valor: lista[0].id, opcoes: lista.map((m) => ({ valor: m.id, rotulo: rotuloMat(m) })) },
        { nome: 'modo', rotulo: 'Como lançar', tipo: 'select', obrigatorio: true, valor: 'unico', opcoes: [{ valor: 'unico', rotulo: 'Um lançamento' }, { valor: 'parcelas', rotulo: 'Gerar parcelas mensais' }] },
        { nome: 'tipo', rotulo: 'Tipo (lançamento único)', tipo: 'select', obrigatorio: true, valor: tipo, opcoes: TIPOS },
        { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'text', obrigatorio: true, valor: reaisDeCentavos(valorSugerido), ajuda: 'Ex.: 1.990,00. Em "Gerar parcelas", é o valor de cada parcela.' },
        { nome: 'vencimento', rotulo: 'Vencimento (ou 1º vencimento)', tipo: 'date', obrigatorio: true },
        { nome: 'quantidade', rotulo: 'Nº de parcelas (1 a 60)', tipo: 'number', min: 1, max: 60, ajuda: 'Só em "Gerar parcelas": as demais vencem no mesmo dia dos meses seguintes (último dia do mês quando o dia não existe).' },
        { nome: 'parcelaN', rotulo: 'Parcela nº (tipo Parcela)', tipo: 'number', min: 1, max: 60 },
        { nome: 'parcelaDe', rotulo: 'De (total de parcelas)', tipo: 'number', min: 1, max: 60 },
        { nome: 'formaPrevista', rotulo: 'Forma prevista', tipo: 'select', opcoes: FORMAS },
        { nome: 'descricao', rotulo: 'Descrição', tipo: 'text', max: 140, valor: descricao }
      ],
      rotuloEnviar: 'Continuar',
      validar: (v) => {
        const e = {};
        if (centavosDoTexto(v.valor) === null) e.valor = 'Informe um valor maior que zero (ex.: 1.990,00).';
        if (v.modo === 'parcelas') {
          if (!Number.isInteger(v.quantidade) || v.quantidade < 1 || v.quantidade > 60) e.quantidade = 'Informe de 1 a 60 parcelas.';
        } else if (v.tipo === 'parcela') {
          if (!Number.isInteger(v.parcelaDe) || v.parcelaDe < 1 || v.parcelaDe > 60) e.parcelaDe = 'Informe o total de parcelas (1 a 60).';
          if (!Number.isInteger(v.parcelaN) || v.parcelaN < 1 || (Number.isInteger(v.parcelaDe) && v.parcelaN > v.parcelaDe)) e.parcelaN = 'Informe o número da parcela (até o total).';
        }
        return Object.keys(e).length ? e : null;
      }
    });
    if (!valores) return null;
    const m = lista.find((x) => x.id === valores.matriculaId) || lista[0];
    const valorCentavos = centavosDoTexto(valores.valor);
    const base = {
      userId: m.userId || (m.aluno && m.aluno.id), matriculaId: m.id, cursoId: m.cursoId,
      valorCentavos, formaPrevista: valores.formaPrevista || undefined, descricao: valores.descricao || undefined
    };
    if (valores.modo === 'parcelas') {
      const n = valores.quantidade;
      const r = await ui.confirmar({
        titulo: 'Gerar parcelas',
        texto: `Gerar ${n} ${n === 1 ? 'parcela' : 'parcelas'} de ${ui.fmt.moeda(valorCentavos)} · total ${ui.fmt.moeda(valorCentavos * n)}, a partir de ${dia(valores.vencimento)}, para ${rotuloMat(m)}.`,
        rotuloConfirmar: `Gerar ${n} ${n === 1 ? 'parcela' : 'parcelas'}`,
        enviar: () => ctx.api.post(API.lote, { ...base, quantidade: n, primeiroVencimento: valores.vencimento })
      });
      if (!r || r === true) return null;
      ui.toast(`${n} ${n === 1 ? 'parcela gerada' : 'parcelas geradas'}.`, { tipo: 'sucesso' });
      return r;
    }
    const corpo = { ...base, tipo: valores.tipo, vencimento: valores.vencimento };
    if (valores.tipo === 'parcela') corpo.parcela = { n: valores.parcelaN, de: valores.parcelaDe };
    try {
      const r = await ctx.api.post(API.lancamentos, corpo);
      ui.toast('Lançamento registrado.', { tipo: 'sucesso' });
      return r;
    } catch (err) {
      const campos = err && err.campos ? Object.values(err.campos).filter(Boolean).join(' ') : '';
      ui.toast(`${mensagemDeErro(err)}${campos ? ` ${campos}` : ''}`, { tipo: 'erro' });
      return null;
    }
  }

  /** A partir de um pedido da loja (§7.18): matrícula fixa, tipo Matrícula, valor do pedido, "Pedido ATD-…". */
  async function lancarDoPedido(ctx, matriculaId, protocolo) {
    const ui = ctx.ui;
    let mat;
    try {
      const r = await ctx.api.get(API.matricula(matriculaId));
      mat = r && r.matricula;
    } catch (err) {
      ui.toast(mensagemDeErro(err), { tipo: 'erro' });
      return;
    }
    if (!mat) return;
    let valor = null;
    const atd = ATD_RE.test(protocolo || '') ? protocolo : null;
    if (atd) {
      try {
        const r = await ctx.api.get(API.atendimento(atd), { silencioso404: true });
        const pedido = r && (r.pedido || (r.atendimento && r.atendimento.pedido));
        const item = pedido && Array.isArray(pedido.itens) ? pedido.itens.find((i) => i.cursoId === mat.cursoId) : null;
        if (item && Number.isInteger(item.valorCentavos)) valor = item.valorCentavos;
      } catch (_e) { /* sem o valor do pedido: campo em branco e obrigatório */ }
    }
    const fixa = { id: mat.id, numero: mat.numero, userId: mat.userId, cursoId: mat.cursoId, cursoTitulo: mat.cursoTitulo, aluno: mat.aluno };
    const r = await abrirLancar(ctx, { fixa, valorSugerido: valor, descricao: atd ? `Pedido ${atd}` : '', tipo: 'matricula' });
    if (r && atd) ctx.navegar(`atendimento/${atd}`);
  }

  // ---------------------------------------------------------------
  // #/financeiro
  // ---------------------------------------------------------------
  function montarLista(el, ctx) {
    const ui = ctx.ui;
    const f = ctx.filtros;
    const mes = primeiroEUltimoDoMes();
    const est = {
      status: CHIPS.some((c) => c.valor === f.get('status')) ? f.get('status') : 'todos',
      curso: f.get('curso') || '',
      origem: ORIGENS.some((o) => o.valor === f.get('origem')) ? f.get('origem') : '',
      q: f.get('q') || '',
      de: f.has('de') ? f.get('de') : mes.de,
      ate: f.has('ate') ? f.get('ate') : mes.ate,
      pagina: 1,
      itens: [],
      vivo: true,
      cursos: []
    };
    colocarDescricao(el, 'Lançamentos registrados pela coordenação. Cada ação fica na auditoria e no histórico do lançamento.');

    el.replaceChildren(frag(ui.html`<div class="pf-fin-info"></div>
      <div class="pf-fin-kpis" data-pf-fin-kpis></div>
      <div class="pf-fin-filtro" data-pf-fin-chips></div>
      <form class="pf-fin-filtros" data-pf-fin-filtros>
        <div class="pf-campo"><label class="pf-rotulo" for="pf-fin-f-de">Vencimento de</label><input class="pf-input" type="date" id="pf-fin-f-de" name="de" value="${est.de}"></div>
        <div class="pf-campo"><label class="pf-rotulo" for="pf-fin-f-ate">até</label><input class="pf-input" type="date" id="pf-fin-f-ate" name="ate" value="${est.ate}"></div>
        <div class="pf-campo"><label class="pf-rotulo" for="pf-fin-f-curso">Curso</label><select class="pf-input" id="pf-fin-f-curso" name="curso"><option value="">Todos os cursos</option></select></div>
        <div class="pf-campo"><label class="pf-rotulo" for="pf-fin-f-origem">Origem</label><select class="pf-input" id="pf-fin-f-origem" name="origem">${ORIGENS.map((o) => ui.html`<option value="${o.valor}"${o.valor === est.origem ? ' selected' : ''}>${o.rotulo}</option>`)}</select></div>
        <div class="pf-campo"><label class="pf-rotulo" for="pf-fin-f-q">Aluno</label><input class="pf-input" type="search" id="pf-fin-f-q" name="q" value="${est.q}" placeholder="Nome ou e-mail" autocomplete="off"></div>
        <div class="pf-campo"><button type="submit" class="dmc-btn dmc-btn--secondary">Aplicar filtros</button></div>
        <div class="pf-campo"><button type="button" class="dmc-btn dmc-btn--link" data-pf-fin-acao="todo-periodo">Todo o período</button></div>
      </form>
      <div class="pf-fin-barra"><p class="pf-fin-contagem" data-pf-fin-contagem role="status"></p></div>
      <div data-pf-fin-tabela></div>
      <div class="pf-fin-mais" data-pf-fin-mais hidden><button type="button" class="dmc-btn dmc-btn--secondary" data-pf-fin-acao="mais">Carregar mais</button></div>`));
    const acoes = colocarAcoes(el, ui.html`<a class="dmc-btn dmc-btn--link" href="#/atendimento?categoria=financeiro&amp;pedido=1&amp;status=aberto">Pedidos da loja</a>
      <button type="button" class="dmc-btn dmc-btn--primary" data-pf-fin-acao="lancar">Lançar</button>`);
    acoes.querySelector('[data-pf-fin-acao="lancar"]').addEventListener('click', async () => {
      const r = await abrirLancar(ctx);
      if (r && r.lancamento) ctx.navegar(`financeiro/${r.lancamento.id}`);
      else if (r) recarregar();
    });
    ui.alerta(el.querySelector('.pf-fin-info'), { tom: 'info', compacto: true, texto: 'Lançamentos registrados pela coordenação. Boleto, Pix e NFS-e automáticos entram quando o gateway for contratado.' });

    const form = el.querySelector('[data-pf-fin-filtros]');
    const tabelaEl = el.querySelector('[data-pf-fin-tabela]');
    const contagemEl = el.querySelector('[data-pf-fin-contagem]');
    const maisEl = el.querySelector('[data-pf-fin-mais]');
    const kpisEl = el.querySelector('[data-pf-fin-kpis]');
    // Lugares reservados desde o início (sem salto de leiaute): KPIs com "—" e chips sem contagem.
    ui.kpis(kpisEl, ['Total', 'Em aberto', 'Pago', 'Em atraso'].map((rotulo) => ({ rotulo, valor: null, nota: '—' })));
    function desenharChips(contagens) {
      const antigo = el.querySelector('[data-pf-fin-chips]');
      const novo = document.createElement('div');
      novo.className = 'pf-fin-filtro';
      novo.setAttribute('data-pf-fin-chips', '');
      antigo.replaceWith(novo); // contêiner novo: o DMC_UI.filtros liga os ouvintes nele
      const c = contagens || {};
      ui.filtros(novo, {
        rotulo: 'Situação dos lançamentos',
        opcoes: CHIPS.map((x) => ({ valor: x.valor, rotulo: x.rotulo, contador: Number.isInteger(c[x.valor]) ? c[x.valor] : null })),
        valor: est.status,
        aoMudar: (v) => { est.status = v; recarregar(); }
      });
    }
    desenharChips(null);

    listarCursos(ctx).then((cursos) => {
      if (!est.vivo) return;
      est.cursos = cursos;
      const sel = form.querySelector('[name="curso"]');
      sel.replaceChildren(frag(ui.html`<option value="">Todos os cursos</option>${cursos.map((c) => ui.html`<option value="${c.id}"${c.id === est.curso ? ' selected' : ''}>${c.titulo}</option>`)}`));
    });

    function lembrar() {
      const q = new URLSearchParams();
      if (est.status !== 'todos') q.set('status', est.status);
      if (est.curso) q.set('curso', est.curso);
      if (est.origem) q.set('origem', est.origem);
      if (est.q) q.set('q', est.q);
      if (est.de !== mes.de) q.set('de', est.de);
      if (est.ate !== mes.ate) q.set('ate', est.ate);
      try { window.history.replaceState(null, '', `#/financeiro${q.toString() ? `?${q}` : ''}`); } catch (_e) { /* sem histórico */ }
    }
    function consulta(pagina) {
      const q = new URLSearchParams();
      if (est.status !== 'todos') q.set('status', est.status);
      if (est.curso) q.set('cursoId', est.curso);
      if (est.origem) q.set('origem', est.origem);
      if (est.q) q.set('q', est.q);
      if (est.de) q.set('venceDe', est.de);
      if (est.ate) q.set('venceAte', est.ate);
      q.set('pagina', String(pagina));
      q.set('porPagina', String(POR_PAGINA));
      return `${API.lancamentos}?${q}`;
    }
    async function carregar(pagina) {
      if (pagina === 1) ui.esqueleto(tabelaEl, { tipo: 'tabela', linhas: 4 });
      let r;
      try {
        r = await ctx.api.get(consulta(pagina), { sinal: ctx.sinal });
      } catch (err) {
        if (!est.vivo || (ctx.sinal && ctx.sinal.aborted)) return;
        ui.erroCarga(tabelaEl, err, { tentarDeNovo: () => carregar(1) });
        return;
      }
      if (!est.vivo) return;
      est.pagina = pagina;
      est.itens = pagina === 1 ? r.itens : est.itens.concat(r.itens);
      ui.kpis(kpisEl, kpisDe(ui, r.kpis));
      if (pagina === 1) {
        const focado = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-pf-fin-chips]');
        desenharChips(r.contagens);
        if (focado) { const b = el.querySelector('[data-pf-fin-chips] [aria-pressed="true"]'); if (b) b.focus(); }
      }
      tabelaEl.removeAttribute('aria-busy');
      if (!est.itens.length) {
        ui.estadoVazio(tabelaEl, {
          titulo: 'Nenhum lançamento neste filtro.',
          texto: 'Mude o período ou os filtros, ou registre um lançamento em [Lançar].'
        });
        contagemEl.textContent = '';
        maisEl.hidden = true;
        return;
      }
      tabelaEl.replaceChildren(frag(htmlTabela(ui, est.itens, { legenda: `Lançamentos (${r.total})` })));
      contagemEl.textContent = `Mostrando ${est.itens.length} de ${r.total}.`;
      maisEl.hidden = est.itens.length >= r.total;
    }
    function recarregar() { lembrar(); carregar(1); }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const de = form.querySelector('[name="de"]').value;
      const ate = form.querySelector('[name="ate"]').value;
      est.de = de;
      est.ate = ate;
      est.curso = form.querySelector('[name="curso"]').value;
      est.origem = form.querySelector('[name="origem"]').value;
      est.q = form.querySelector('[name="q"]').value.trim();
      recarregar();
    });
    form.querySelector('[data-pf-fin-acao="todo-periodo"]').addEventListener('click', () => {
      est.de = '';
      est.ate = '';
      form.querySelector('[name="de"]').value = '';
      form.querySelector('[name="ate"]').value = '';
      recarregar();
    });
    maisEl.querySelector('button').addEventListener('click', () => carregar(est.pagina + 1));

    carregar(1);
    const pedidoMatricula = (f.get('nova') === '1' || f.get('lancar') === '1') ? f.get('matricula') : null;
    if (pedidoMatricula && /^[a-f0-9]{24}$/.test(pedidoMatricula)) {
      // Depois do diálogo (salvo ou cancelado), a URL perde ?nova=1 para não reabrir ao recarregar.
      lancarDoPedido(ctx, pedidoMatricula, f.get('protocolo') || '').finally(() => { if (est.vivo && /^#\/financeiro(\?|$)/.test(window.location.hash)) lembrar(); });
    }
    return { destruir() { est.vivo = false; } };
  }

  // ---------------------------------------------------------------
  // #/financeiro/:lancamentoId
  // ---------------------------------------------------------------
  function htmlDetalhe(ui, l) {
    const linha = (rotulo, valor) => ui.html`<dt>${rotulo}</dt><dd>${valor == null || valor === '' ? '—' : valor}</dd>`;
    const ext = l.externo && (l.externo.cobrancaId || l.externo.faturaId) ? [l.externo.gateway, l.externo.cobrancaId || l.externo.faturaId].filter(Boolean).join(' · ') : null;
    return ui.html`<dl class="pf-fin-dl">
        ${linha('Aluno', l.aluno ? [l.aluno.nome, l.aluno.email].filter(Boolean).join(' · ') : null)}
        ${linha('Curso', l.cursoTitulo)}
        ${linha('Matrícula', l.matriculaNumero)}
        ${linha('Tipo', l.rotuloTipo)}
        ${linha('Descrição', l.descricao)}
        ${linha('Vencimento', dia(l.vencimento))}
        ${linha('Valor', moeda(ui, l.valorCentavos))}
        <dt>Situação</dt><dd>${situacao(ui, l)}</dd>
        ${linha('Forma prevista', (FORMAS.find((x) => x.valor === l.formaPrevista) || {}).rotulo)}
        ${l.pagamento ? linha('Pagamento', `${dia(l.pagamento.em)} · ${l.pagamento.formaRotulo || '—'} · ${moeda(ui, l.pagamento.valorPagoCentavos)}`) : ''}
        ${l.pagamento && l.pagamento.observacao ? linha('Observação do pagamento', l.pagamento.observacao) : ''}
        ${linha('NFS-e', l.nfse ? [l.nfse.numero, l.nfse.emitidaEm ? `emitida em ${dia(l.nfse.emitidaEm)}` : null].filter(Boolean).join(' · ') : null)}
        ${linha('2ª via', l.segundaViaDetalhe ? (l.segundaViaDetalhe.tipo === 'pdf' ? 'PDF anexado' : l.segundaViaDetalhe.url) : null)}
        ${linha('Origem', l.origem === 'gateway' ? 'Gateway' : 'Manual')}
        ${linha('ID externo', ext)}
        ${l.cancelamento ? linha('Cancelamento', `${dataHora(ui, l.cancelamento.em)} · ${l.cancelamento.motivo || ''}`) : ''}
      </dl>`;
  }
  function htmlAcoes(ui, l) {
    const manual = l.origem !== 'gateway';
    const b = (acao, rotulo, extra) => ui.html`<button type="button" class="dmc-btn dmc-btn--secondary${extra ? ` ${extra}` : ''}" data-pf-fin-acao="${acao}">${rotulo}</button>`;
    const lista = [];
    if (manual && l.situacao === 'pendente') lista.push(ui.html`<button type="button" class="dmc-btn dmc-btn--primary" data-pf-fin-acao="pagar">Baixar pagamento</button>`);
    if (manual && l.situacao === 'pago') lista.push(b('estornar', 'Estornar pagamento'));
    if (l.situacao !== 'cancelado') {
      lista.push(b('segunda-via', l.segundaViaDetalhe ? 'Trocar 2ª via' : 'Anexar 2ª via'));
      lista.push(b('nfse', l.nfse ? 'Trocar NFS-e' : 'Informar NFS-e'));
    }
    if (l.segundaViaDetalhe) lista.push(b('remover-segunda-via', 'Remover 2ª via'));
    if (l.nfse) lista.push(b('remover-nfse', 'Remover NFS-e'));
    if (manual && l.situacao === 'pendente') {
      lista.push(b('editar', 'Editar'));
      lista.push(b('cancelar', 'Cancelar lançamento', 'pf-btn--perigo'));
    }
    return lista.length ? ui.html`<div class="pf-fin-acoes">${lista}</div>` : '';
  }
  function htmlHistorico(ui, l) {
    const itens = (l.historico || []).slice().reverse();
    if (!itens.length) return '';
    return ui.html`<h2 class="pf-secao-titulo">Histórico</h2>
      <ol class="pf-fin-historico">${itens.map((h) => ui.html`<li>
        <span class="pf-fin-historico__quando">${dataHora(ui, h.em)}</span>
        <span>${ROTULO_ACAO[h.acao] || h.acao}</span>${h.motivo ? ui.html`<span class="pf-fin-meta">${`Motivo: ${h.motivo}`}</span>` : ''}
      </li>`)}</ol>`;
  }

  async function executarAcao(ctx, l, acao) {
    const ui = ctx.ui;
    const api = ctx.api;
    const versao = l.versao;
    if (acao === 'pagar') {
      return ui.formulario({
        titulo: 'Baixar pagamento',
        descricao: `${l.rotuloTipo} · ${moeda(ui, l.valorCentavos)} · vencimento ${dia(l.vencimento)}`,
        campos: [
          { nome: 'em', rotulo: 'Data do pagamento', tipo: 'date', obrigatorio: true, valor: hojeSP(), max: hojeSP() },
          { nome: 'forma', rotulo: 'Forma', tipo: 'select', obrigatorio: true, valor: l.formaPrevista || '', opcoes: FORMAS },
          { nome: 'valor', rotulo: 'Valor pago (R$)', tipo: 'text', obrigatorio: true, valor: reaisDeCentavos(l.valorCentavos) },
          { nome: 'observacao', rotulo: 'Observação', tipo: 'textarea', max: 300, ajuda: 'Obrigatória quando o valor pago é diferente do devido.' }
        ],
        rotuloEnviar: 'Registrar pagamento',
        validar: (v) => {
          const c = centavosDoTexto(v.valor);
          if (c === null) return { valor: 'Informe o valor pago (ex.: 499,00).' };
          if (c !== l.valorCentavos && !v.observacao) return { observacao: 'O valor é diferente do devido: explique na observação.' };
          return null;
        },
        enviar: (v) => api.post(API.acao(l.id, 'pagamento'), { em: v.em, forma: v.forma, valorPagoCentavos: centavosDoTexto(v.valor), observacao: v.observacao || undefined, versao })
      });
    }
    if (acao === 'estornar') {
      return ui.confirmar({ titulo: 'Estornar pagamento', texto: 'O lançamento volta a ficar em aberto; o pagamento estornado fica no histórico.', rotuloConfirmar: 'Estornar', motivo: true, perigo: true, enviar: (v) => api.post(API.acao(l.id, 'estorno'), { motivo: v.motivo, versao }) });
    }
    if (acao === 'cancelar') {
      return ui.confirmar({ titulo: 'Cancelar lançamento', texto: 'O lançamento deixa de contar nos totais do aluno. Esta ação fica na auditoria.', rotuloConfirmar: 'Cancelar lançamento', rotuloCancelar: 'Voltar', motivo: true, perigo: true, enviar: (v) => api.post(API.acao(l.id, 'cancelar'), { motivo: v.motivo, versao }) });
    }
    if (acao === 'remover-nfse') {
      return ui.confirmar({ titulo: 'Remover NFS-e', texto: `Remover o número ${l.nfse ? l.nfse.numero : ''} deste lançamento.`, rotuloConfirmar: 'Remover', motivo: true, perigo: true, enviar: (v) => api.post(API.acao(l.id, 'nfse/remover'), { motivo: v.motivo }) });
    }
    if (acao === 'nfse') {
      return ui.formulario({
        titulo: 'Informar NFS-e',
        descricao: 'A NFS-e é emitida fora da plataforma; aqui fica só o número.',
        campos: [
          { nome: 'numero', rotulo: 'Número da NFS-e', tipo: 'text', obrigatorio: true, max: 30, valor: l.nfse ? l.nfse.numero : '', ajuda: 'Letras, números, ponto, barra ou hífen.' },
          { nome: 'emitidaEm', rotulo: 'Data de emissão', tipo: 'date', max: hojeSP(), valor: l.nfse && l.nfse.emitidaEm ? l.nfse.emitidaEm : '' }
        ],
        enviar: (v) => api.put(API.acao(l.id, 'nfse'), { numero: v.numero, emitidaEm: v.emitidaEm || undefined })
      });
    }
    if (acao === 'remover-segunda-via') {
      const ok = await ui.confirmar({ titulo: 'Remover 2ª via', texto: 'O aluno deixa de ver a 2ª via deste lançamento.', rotuloConfirmar: 'Remover', perigo: true });
      return ok ? api.del(API.acao(l.id, 'segunda-via')) : null;
    }
    if (acao === 'segunda-via') {
      const modo = await ui.dialogo({
        titulo: 'Anexar 2ª via',
        conteudo: ui.html`<p>Escolha como o aluno recebe a 2ª via: um link https do banco ou do emissor, ou um PDF de até 4 MB.</p>`,
        acoes: [{ rotulo: 'Cancelar', valor: null, tipo: 'secundario', acao: 'cancelar' }, { rotulo: 'Enviar PDF', valor: 'pdf', tipo: 'secundario' }, { rotulo: 'Informar link', valor: 'link', tipo: 'primario', acao: 'confirmar' }]
      });
      if (modo === 'link') {
        return ui.formulario({
          titulo: '2ª via por link',
          campos: [{ nome: 'url', rotulo: 'Endereço (https://)', tipo: 'url', obrigatorio: true, max: 500, valor: l.segundaViaDetalhe && l.segundaViaDetalhe.url ? l.segundaViaDetalhe.url : '' }],
          enviar: (v) => api.put(API.acao(l.id, 'segunda-via'), { url: v.url })
        });
      }
      if (modo === 'pdf') {
        return ui.upload({
          titulo: '2ª via em PDF', formatos: ['pdf'], maxBytes: 4 * 1024 * 1024,
          avisoBaseLegal: 'O arquivo substitui a 2ª via anterior e fica visível só para o aluno e a coordenação.',
          enviar: (arquivo) => api.upload(API.acao(l.id, 'segunda-via/arquivo'), arquivo, 'application/pdf')
        });
      }
      return null;
    }
    if (acao === 'editar') {
      return ui.formulario({
        titulo: 'Editar lançamento',
        campos: [
          { nome: 'vencimento', rotulo: 'Vencimento', tipo: 'date', obrigatorio: true, valor: l.vencimento },
          { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'text', obrigatorio: true, valor: reaisDeCentavos(l.valorCentavos) },
          { nome: 'formaPrevista', rotulo: 'Forma prevista', tipo: 'select', valor: l.formaPrevista || '', opcoes: FORMAS },
          { nome: 'descricao', rotulo: 'Descrição', tipo: 'text', max: 140, valor: l.descricao || '' },
          { nome: 'motivo', rotulo: 'Motivo (fica registrado na auditoria)', tipo: 'textarea', obrigatorio: true, max: 500 }
        ],
        validar: (v) => {
          const e = {};
          if (centavosDoTexto(v.valor) === null) e.valor = 'Informe um valor maior que zero.';
          if (!v.motivo || v.motivo.length < 5) e.motivo = 'Escreva o motivo com pelo menos 5 caracteres.';
          return Object.keys(e).length ? e : null;
        },
        enviar: (v) => {
          const corpo = { motivo: v.motivo, versao };
          if (v.vencimento !== l.vencimento) corpo.vencimento = v.vencimento;
          const c = centavosDoTexto(v.valor);
          if (c !== l.valorCentavos) corpo.valorCentavos = c;
          if ((v.formaPrevista || null) !== (l.formaPrevista || null) && v.formaPrevista) corpo.formaPrevista = v.formaPrevista;
          if ((v.descricao || '') !== (l.descricao || '')) corpo.descricao = v.descricao;
          return api.put(API.lancamento(l.id), corpo);
        }
      });
    }
    return null;
  }

  function montarDetalhe(el, ctx) {
    const ui = ctx.ui;
    const id = ctx.params.lancamentoId;
    let vivo = true;
    colocarAcoes(el, ui.html`<a class="dmc-btn dmc-btn--secondary" href="#/financeiro">Voltar à lista</a>`);
    async function carregar() {
      ui.esqueleto(el, { tipo: 'texto', linhas: 6 });
      let l;
      try {
        const r = await ctx.api.get(API.lancamento(id), { sinal: ctx.sinal });
        l = r && r.lancamento;
      } catch (err) {
        if (!vivo || (ctx.sinal && ctx.sinal.aborted)) return;
        if (err && err.status === 404) {
          ui.estadoVazio(el, { titulo: 'Lançamento não encontrado.', acao: { rotulo: 'Voltar à lista', href: '#/financeiro' } });
          return;
        }
        ui.erroCarga(el, err, { tentarDeNovo: carregar });
        return;
      }
      if (!vivo || !l) return;
      ctx.definirTitulo(`${l.rotuloTipo}${l.aluno && l.aluno.nome ? ` · ${l.aluno.nome}` : ''}`);
      colocarDescricao(el, `Situação em ${dia(hojeSP())}. Origem: ${l.origem === 'gateway' ? 'Gateway' : 'Manual'}.`);
      el.removeAttribute('aria-busy');
      el.replaceChildren(frag(ui.html`${htmlDetalhe(ui, l)}${htmlAcoes(ui, l)}${htmlHistorico(ui, l)}`));
      el.querySelectorAll('[data-pf-fin-acao]').forEach((b) => b.addEventListener('click', async () => {
        const acao = b.getAttribute('data-pf-fin-acao');
        let r;
        try {
          r = await executarAcao(ctx, l, acao);
        } catch (err) {
          ui.toast(mensagemDeErro(err), { tipo: 'erro' });
          if (err && err.codigo === 'conflito-versao') carregar();
          return;
        }
        if (r && r !== false) {
          ui.toast('Alteração registrada.', { tipo: 'sucesso' });
          carregar();
        }
      }));
    }
    carregar();
    return { destruir() { vivo = false; } };
  }

  // ---------------------------------------------------------------
  // #/alunos/:userId/financeiro (aba da moldura do aluno)
  // ---------------------------------------------------------------
  async function montarAbaDoAluno(el, ctx) {
    const ui = ctx.ui;
    const userId = ctx.params.userId;
    async function carregar() {
      ui.esqueleto(el, { tipo: 'tabela', linhas: 3 });
      let r;
      try {
        r = await ctx.api.get(`${API.lancamentos}?userId=${encodeURIComponent(userId)}&porPagina=100`, { sinal: ctx.sinal });
      } catch (err) {
        if (ctx.sinal && ctx.sinal.aborted) return;
        ui.erroCarga(el, err, { tentarDeNovo: carregar });
        return;
      }
      el.removeAttribute('aria-busy');
      el.replaceChildren(frag(ui.html`<div class="pf-fin-acoes"><button type="button" class="dmc-btn dmc-btn--primary" data-pf-fin-acao="lancar-aluno">Lançar para este aluno</button></div>
        <div class="pf-fin-kpis" data-pf-fin-kpis></div><div data-pf-fin-tabela></div>`));
      el.querySelector('[data-pf-fin-acao="lancar-aluno"]').addEventListener('click', async () => {
        let mats;
        try {
          const m = await ctx.api.get(`${API.matriculas}?userId=${encodeURIComponent(userId)}&status=todas&porPagina=100`);
          mats = m && Array.isArray(m.itens) ? m.itens : [];
        } catch (err) {
          ui.toast(mensagemDeErro(err), { tipo: 'erro' });
          return;
        }
        if (!mats.length) {
          ui.toast('Este aluno não tem matrícula. Crie a matrícula antes de lançar.', { tipo: 'aviso' });
          return;
        }
        const r2 = await abrirLancar(ctx, { matriculas: mats });
        if (r2) carregar();
      });
      ui.kpis(el.querySelector('[data-pf-fin-kpis]'), kpisDe(ui, r.kpis));
      const alvo = el.querySelector('[data-pf-fin-tabela]');
      if (!r.itens.length) {
        ui.estadoVazio(alvo, { titulo: 'Nenhum lançamento registrado para este aluno.' });
        return;
      }
      alvo.replaceChildren(frag(htmlTabela(ui, r.itens, { legenda: `Lançamentos do aluno (${r.total})`, semAluno: true })));
    }
    await carregar();
    return undefined;
  }

  // ---------------------------------------------------------------
  // Registro (índice §6.3: F5)
  // ---------------------------------------------------------------
  P.registrar({ rota: 'financeiro', titulo: 'Financeiro', papeis: SO_ADMIN, montar: montarLista });
  P.registrar({ rota: 'financeiro/:lancamentoId', titulo: 'Lançamento', papeis: SO_ADMIN, montar: montarDetalhe });
  P.registrar({ rota: 'alunos/:userId/financeiro', titulo: 'Financeiro', papeis: SO_ADMIN, montar: montarAbaDoAluno, pai: 'alunos/:userId', aba: 'financeiro' });
})();
