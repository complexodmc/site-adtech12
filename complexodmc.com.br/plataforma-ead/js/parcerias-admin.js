// =============================================================
// COMPLEXO DMC · Painel de candidaturas de parceria
// Opera o funil de /api/parcerias/admin/* com o token da sessão da EAD
// (DMC_Api.token(), o mesmo que admin.html usa). A regra do funil fica
// no servidor: a tela só mostra as transições que a API devolve em
// `permitidos`. Todo texto vindo da API entra no DOM por textContent /
// nós de texto — nunca innerHTML.
// =============================================================
(function () {
  'use strict';

  const BASE = (window.DMC_API_BASE || '/api').replace(/\/$/, '');
  const ROTA = '/parcerias/admin/candidaturas';
  const PROGRAMAS = { 'partner-lawyers': 'Partner Lawyers', 'business-partner': 'Business Partner' };
  const PROTOCOLO_RE = /^(PL|BP)-\d{4}-[2-9A-HJ-NP-Z]{6}$/;
  const ARQUIVADA = 'arquivada';

  // Só exibição: ordem e rótulos dos campos e das opções enumeradas.
  const CAMPOS = {
    'partner-lawyers': ['nome', 'oab_numero', 'oab_seccional', 'escritorio', 'areas', 'cidade', 'uf', 'email', 'telefone', 'apresentacao'],
    'business-partner': ['nome', 'empresa', 'cargo', 'segmento', 'cidade', 'uf', 'email', 'whatsapp', 'experiencia_b2b', 'perfil_empresas', 'mensagem']
  };
  const ROTULOS_CAMPOS = {
    nome: 'Nome', oab_numero: 'OAB — número', oab_seccional: 'OAB — seccional', escritorio: 'Escritório',
    areas: 'Áreas de atuação', cidade: 'Cidade', uf: 'UF', email: 'E-mail', telefone: 'Telefone',
    apresentacao: 'Apresentação profissional', empresa: 'Empresa', cargo: 'Cargo', segmento: 'Segmento',
    whatsapp: 'WhatsApp', experiencia_b2b: 'Experiência B2B', perfil_empresas: 'Perfil das empresas',
    mensagem: 'Mensagem'
  };
  const OPCOES = {
    areas: {
      'empresarial': 'Empresarial', 'sucessoes-patrimonio': 'Sucessões e patrimônio', 'imobiliario': 'Imobiliário',
      'tributario': 'Tributário', 'trabalhista-empresarial': 'Trabalhista empresarial',
      'recuperacao-ativos': 'Recuperação de ativos', 'outra': 'Outra'
    },
    segmento: {
      'consultoria-empresarial': 'Consultoria empresarial', 'desenvolvimento-negocios': 'Desenvolvimento de negócios',
      'representacao-comercial-b2b': 'Representação comercial B2B', 'mercado-imobiliario': 'Mercado imobiliário',
      'construcao-civil': 'Construção civil', 'agronegocio': 'Agronegócio', 'rede-empresarial': 'Rede empresarial',
      'outro': 'Outro'
    },
    experiencia_b2b: {
      'ate-2-anos': 'Até 2 anos', '2-a-5-anos': 'De 2 a 5 anos', '5-a-10-anos': 'De 5 a 10 anos',
      'mais-de-10-anos': 'Mais de 10 anos'
    }
  };
  const MULTILINHA = new Set(['apresentacao', 'perfil_empresas', 'mensagem']);
  const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

  const estado = {
    programa: 'partner-lawyers',
    status: '',
    pagina: 1,
    protocolo: null,
    estados: [],
    rotulos: {},
    atual: null,
    ocupado: false,
    restrito: false
  };

  const $ = (id) => document.getElementById(id);
  const temChave = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
  const rotulo = (s) => (estado.rotulos && estado.rotulos[s]) || s || '—';

  // createElement + textContent. `props.text` vira nó de texto; filhos
  // string também (Node.append trata string como texto, não HTML).
  function el(tag, props, ...filhos) {
    const n = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const f of filhos) {
      if (f !== null && f !== undefined && f !== false) n.append(f);
    }
    return n;
  }

  const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  function formatarData(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : fmtData.format(d);
  }

  // ---------- feedback (aria-live) ----------
  let avisoTimer = null;
  function anunciar(msg, tipo = 'ok') {
    const box = $('pa-status');
    clearTimeout(avisoTimer);
    // Limpa antes: a mesma frase repetida também é lida de novo.
    box.textContent = '';
    box.className = 'pa-status' + (tipo === 'erro' ? ' is-erro' : ' is-ok');
    avisoTimer = setTimeout(() => { box.textContent = msg; }, 40);
  }

  // ---------- API ----------
  class ErroApi extends Error {
    constructor(status, mensagem, campos) {
      super(mensagem);
      this.status = status;
      this.campos = campos || null;
    }
  }

  function irParaLogin() {
    const volta = 'parcerias.html' + window.location.search;
    window.location.href = 'login.html?next=' + encodeURIComponent(volta);
  }

  async function chamar(metodo, caminho, corpo) {
    const token = window.DMC_Api ? window.DMC_Api.token() : null;
    if (!token) {
      irParaLogin();
      throw new ErroApi(401, 'Sessão encerrada.');
    }
    const opts = { method: metodo, headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' };
    if (corpo !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(corpo);
    }
    let res;
    try {
      res = await fetch(BASE + caminho, opts);
    } catch {
      throw new ErroApi(0, 'Não foi possível falar com o servidor. Verifique sua conexão.');
    }
    let dados = null;
    try { dados = await res.json(); } catch { dados = null; }
    if (res.status === 401) {
      window.DMC_Api.setToken(null);
      irParaLogin();
      throw new ErroApi(401, (dados && dados.error) || 'Sessão expirada.');
    }
    if (!res.ok) {
      throw new ErroApi(res.status, (dados && dados.error) || `Erro ${res.status} no servidor.`, dados && dados.campos);
    }
    return dados;
  }

  // 401 já redirecionou; 403 troca a tela pelo aviso. Outros: mensagem.
  function tratarErro(err) {
    if (err.status === 401) return;
    if (err.status === 403) { mostrarRestrito(); return; }
    anunciar(err.message || 'Erro inesperado.', 'erro');
  }

  // A tela fica reservada até aqui (parcerias-admin.css, CLS): lista com o shell, aviso de
  // acesso restrito ou erro. Idempotente.
  function marcarPronto() { if (document.body) document.body.classList.add('pa-pronto'); }

  function mostrarRestrito() {
    estado.restrito = true;
    marcarPronto();
    $('pa-app').hidden = true;
    const linkAdmin = $('pa-link-admin');
    if (linkAdmin) linkAdmin.hidden = true;
    const box = $('pa-restrito');
    box.hidden = false;
    anunciar('Acesso restrito a administradores.', 'erro');
    const h = $('pa-restrito-titulo');
    h.setAttribute('tabindex', '-1');
    h.focus();
  }

  // ---------- URL (só programa, filtro, página e protocolo) ----------
  function lerUrl() {
    const p = new URLSearchParams(window.location.search);
    const proto = (p.get('protocolo') || '').trim().toUpperCase();
    estado.protocolo = PROTOCOLO_RE.test(proto) ? proto : null;
    const prog = p.get('programa');
    estado.programa = temChave(PROGRAMAS, prog || '') ? prog : 'partner-lawyers';
    if (estado.protocolo) estado.programa = estado.protocolo.startsWith('BP-') ? 'business-partner' : 'partner-lawyers';
    const st = p.get('status') || '';
    estado.status = /^[a-z-]{1,40}$/.test(st) ? st : '';
    const pg = p.get('pagina') || '';
    estado.pagina = /^\d{1,5}$/.test(pg) ? Math.max(1, Number(pg)) : 1;
  }

  function gravarUrl() {
    const p = new URLSearchParams();
    p.set('programa', estado.programa);
    if (estado.status) p.set('status', estado.status);
    if (estado.pagina > 1) p.set('pagina', String(estado.pagina));
    if (estado.protocolo) p.set('protocolo', estado.protocolo);
    window.history.replaceState(null, '', window.location.pathname + '?' + p.toString());
  }

  // ---------- lista ----------
  function badge(status) {
    const classe = /^[a-z-]+$/.test(status || '') ? ` pa-badge--${status}` : '';
    return el('span', { class: 'pa-badge' + classe, text: rotulo(status) });
  }

  function preencherFiltroStatus() {
    const sel = $('pa-filtro-status');
    sel.replaceChildren(el('option', { value: '', text: 'Todos' }));
    for (const s of estado.estados) sel.append(el('option', { value: s, text: rotulo(s) }));
    sel.value = estado.estados.includes(estado.status) ? estado.status : '';
  }

  function renderLista(r) {
    const tbody = $('pa-linhas');
    tbody.replaceChildren();
    for (const item of r.itens || []) {
      const d = item.dados || {};
      const atual = item.protocolo === estado.protocolo;
      const abrir = el('button', {
        type: 'button',
        class: 'pa-link',
        'data-protocolo': item.protocolo,
        'aria-current': atual ? 'true' : null,
        onclick: () => abrirDetalhe(item.protocolo)
      }, item.protocolo);
      tbody.append(el('tr', { class: atual ? 'is-atual' : null },
        el('th', { scope: 'row' }, abrir),
        el('td', null, el('time', { datetime: item.createdAt }, formatarData(item.createdAt))),
        el('td', null, d.nome || '—'),
        el('td', null, [d.cidade, d.uf].filter(Boolean).join('/') || '—'),
        el('td', null, badge(item.status)),
        el('td', null, item.responsavel || '—')
      ));
    }
    const vazio = !(r.itens && r.itens.length);
    $('pa-vazio').hidden = !vazio;
    $('pa-tabela').classList.toggle('is-vazia', vazio);
    const filtro = estado.status ? rotulo(estado.status) : 'todos os status';
    $('pa-legenda').textContent = `Candidaturas ${PROGRAMAS[estado.programa]}, ${filtro}. Página ${r.pagina} de ${r.totalPaginas}; ${r.total} no total.`;
    $('pa-contagem').textContent = `${r.total} no total`;
    $('pa-pagina-info').textContent = `Página ${r.pagina} de ${r.totalPaginas}`;
    $('pa-anterior').disabled = r.pagina <= 1;
    $('pa-proxima').disabled = r.pagina >= r.totalPaginas;
  }

  function marcarLinhaAtual() {
    for (const b of document.querySelectorAll('#pa-linhas .pa-link')) {
      const atual = b.getAttribute('data-protocolo') === estado.protocolo;
      if (atual) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
      b.closest('tr').classList.toggle('is-atual', atual);
    }
  }

  async function carregarLista({ anunciarTotal = false } = {}) {
    const tabela = $('pa-tabela');
    tabela.setAttribute('aria-busy', 'true');
    const q = new URLSearchParams({ programa: estado.programa, pagina: String(estado.pagina) });
    if (estado.status) q.set('status', estado.status);
    try {
      const r = await chamar('GET', `${ROTA}?${q.toString()}`);
      estado.estados = Array.isArray(r.estados) ? r.estados : [];
      estado.rotulos = r.rotulos || {};
      if (r.total > 0 && r.pagina > r.totalPaginas) {
        estado.pagina = r.totalPaginas;
        return carregarLista({ anunciarTotal });
      }
      preencherFiltroStatus();
      renderLista(r);
      gravarUrl();
      if (anunciarTotal) {
        anunciar(`${PROGRAMAS[estado.programa]}: ${r.total} candidatura${r.total === 1 ? '' : 's'}${estado.status ? ` em "${rotulo(estado.status)}"` : ''}.`);
      }
    } catch (err) {
      if (err.status === 400 && estado.status) {
        estado.status = '';
        estado.pagina = 1;
        anunciar('Filtro de status inválido para este programa; mostrando todos.', 'erro');
        return carregarLista();
      }
      tratarErro(err);
    } finally {
      tabela.setAttribute('aria-busy', 'false');
    }
  }

  // ---------- detalhe ----------
  function limparDetalhe() {
    estado.atual = null;
    $('pa-det-titulo').textContent = 'Detalhe';
    $('pa-det-status').hidden = true;
    $('pa-det-conteudo').hidden = true;
    $('pa-det-vazio').hidden = false;
  }

  function valorCampo(campo, valor) {
    if (valor === undefined || valor === null || valor === '') return '—';
    if (Array.isArray(valor)) return valor.map(v => (OPCOES[campo] && OPCOES[campo][v]) || v).join(', ');
    if (OPCOES[campo]) return OPCOES[campo][valor] || String(valor);
    return String(valor);
  }

  function linhaDl(dl, rotuloCampo, conteudo, classe) {
    dl.append(el('dt', null, rotuloCampo), el('dd', { class: classe || null }, conteudo));
  }

  function renderDados(c) {
    const dl = $('pa-det-dados');
    dl.replaceChildren();
    const dados = c.dados || {};
    const ordem = CAMPOS[c.programa] || [];
    const extras = Object.keys(dados).filter(k => !ordem.includes(k));
    for (const campo of [...ordem, ...extras]) {
      if (!temChave(dados, campo)) {
        linhaDl(dl, ROTULOS_CAMPOS[campo] || campo, '—');
        continue;
      }
      const v = dados[campo];
      let conteudo = valorCampo(campo, v);
      if (campo === 'email' && typeof v === 'string') {
        conteudo = el('a', { href: 'mailto:' + v }, v);
      } else if (campo === 'whatsapp' && typeof v === 'string' && /^\d{10,13}$/.test(v)) {
        const internacional = v.length <= 11 ? '55' + v : v;
        conteudo = el('span', null, v, ' · ',
          el('a', { href: 'https://wa.me/' + internacional, target: '_blank', rel: 'noopener noreferrer' }, 'abrir no WhatsApp'));
      }
      linhaDl(dl, ROTULOS_CAMPOS[campo] || campo, conteudo, MULTILINHA.has(campo) ? 'pa-multilinha' : null);
    }
  }

  function renderFonte(c) {
    const dl = $('pa-det-fonte');
    dl.replaceChildren();
    const fonte = c.fonte || {};
    linhaDl(dl, 'Programa', PROGRAMAS[c.programa] || c.programa);
    linhaDl(dl, 'Recebida em', formatarData(c.createdAt));
    linhaDl(dl, 'Última alteração', formatarData(c.updatedAt));
    linhaDl(dl, 'Página de origem', fonte.pagina || '—');
    const utms = UTM.filter(k => fonte[k]);
    linhaDl(dl, 'UTM', utms.length ? utms.map(k => `${k.slice(4)}: ${fonte[k]}`).join(' · ') : '—');
    const cons = c.consentimento || {};
    linhaDl(dl, 'Consentimento (LGPD)', cons.aceito
      ? `Aceito em ${formatarData(cons.em)} — finalidade: ${cons.finalidade || '—'}`
      : 'Não registrado');
    const com = c.comunicacoes || {};
    linhaDl(dl, 'Comunicações institucionais', com.aceito ? `Aceitou em ${formatarData(com.em)}` : 'Não aceitou');
    linhaDl(dl, 'Retenção prevista até', `${formatarData(c.retencaoAte)} (informativo)`);
    linhaDl(dl, 'Responsável', c.responsavel || '—');
  }

  function renderHistorico(c) {
    const ol = $('pa-det-historico');
    ol.replaceChildren();
    for (const h of Array.isArray(c.historico) ? c.historico : []) {
      let acao;
      if (h.de) acao = `${rotulo(h.de)} → ${rotulo(h.status)}`;
      else if (h.por === 'sistema') acao = `Candidatura recebida (${rotulo(h.status)})`;
      else acao = `Registro em "${rotulo(h.status)}"`;
      const li = el('li', null,
        el('p', { class: 'pa-hist__linha' },
          el('time', { datetime: h.em }, formatarData(h.em)), ' — ', el('strong', null, acao), ` · por ${h.por || '—'}`));
      if (h.nota) li.append(el('p', { class: 'pa-hist__nota pa-multilinha' }, h.nota));
      if (temChave(h, 'responsavel')) {
        li.append(el('p', { class: 'pa-hist__extra' }, h.responsavel ? `Responsável: ${h.responsavel}` : 'Responsável removido'));
      }
      ol.append(li);
    }
  }

  // Classifica cada destino que a API permite: a regra continua no servidor.
  function montarBotoes(permitidos, atual, estados) {
    const box = $('pa-botoes');
    box.replaceChildren();
    const iAtual = estados.indexOf(atual);
    const ordem = { avancar: 0, voltar: 1, reabrir: 2, arquivar: 3 };
    const acoes = (permitidos || []).map((destino) => {
      let tipo;
      if (destino === ARQUIVADA) tipo = 'arquivar';
      else if (atual === ARQUIVADA) tipo = 'reabrir';
      else tipo = estados.indexOf(destino) > iAtual ? 'avancar' : 'voltar';
      return { destino, tipo };
    }).sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);

    for (const a of acoes) {
      const texto = {
        avancar: `Avançar para ${rotulo(a.destino)}`,
        voltar: `Voltar para ${rotulo(a.destino)}`,
        reabrir: `Reabrir em ${rotulo(a.destino)}`,
        arquivar: 'Arquivar'
      }[a.tipo];
      const classe = a.tipo === 'avancar' ? 'btn-ghost pa-btn-principal'
        : a.tipo === 'arquivar' ? 'btn-ghost danger' : 'btn-ghost';
      box.append(el('button', {
        type: 'button',
        class: classe,
        'data-acao': a.tipo,
        'data-destino': a.destino,
        onclick: () => mudarStatus(a.destino, a.tipo)
      }, texto));
    }
    if (!acoes.length) box.append(el('p', { class: 'pa-ajuda', text: 'Nenhuma mudança de etapa disponível.' }));
  }

  function renderDetalhe(r) {
    const c = r.candidatura;
    estado.atual = { candidatura: c, estados: r.estados || [], permitidos: r.permitidos || [] };
    estado.protocolo = c.protocolo;
    $('pa-det-titulo').textContent = `${c.protocolo} · ${(c.dados && c.dados.nome) || ''}`;
    const st = $('pa-det-status');
    st.replaceChildren(badge(c.status));
    st.hidden = false;
    renderDados(c);
    renderFonte(c);
    montarBotoes(r.permitidos, c.status, r.estados || []);
    $('pa-responsavel').value = c.responsavel || '';
    renderHistorico(c);
    limparErrosCampos();
    $('pa-det-vazio').hidden = true;
    $('pa-det-conteudo').hidden = false;
    marcarLinhaAtual();
    gravarUrl();
  }

  async function abrirDetalhe(protocolo, { focar = true } = {}) {
    estado.protocolo = protocolo;
    marcarLinhaAtual();
    try {
      const r = await chamar('GET', `${ROTA}/${encodeURIComponent(protocolo)}`);
      renderDetalhe(r);
      if (focar) $('pa-det-titulo').focus();
    } catch (err) {
      if (err.status === 404) {
        estado.protocolo = null;
        limparDetalhe();
        marcarLinhaAtual();
        gravarUrl();
        anunciar('Candidatura não encontrada.', 'erro');
        return;
      }
      tratarErro(err);
    }
  }

  // ---------- ações ----------
  function limparErrosCampos() {
    for (const [campo, erro] of [['pa-nota', 'pa-nota-erro'], ['pa-responsavel', 'pa-resp-erro']]) {
      const input = $(campo);
      input.removeAttribute('aria-invalid');
      input.setAttribute('aria-describedby', campo === 'pa-nota' ? 'pa-nota-ajuda' : 'pa-resp-ajuda');
      $(erro).hidden = true;
      $(erro).textContent = '';
    }
  }

  function erroNoCampo(campoId, erroId, ajudaId, mensagem) {
    const input = $(campoId);
    const p = $(erroId);
    p.textContent = mensagem;
    p.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', `${erroId} ${ajudaId}`);
    input.focus();
  }

  function ocupar(sim) {
    estado.ocupado = sim;
    $('pa-acoes').setAttribute('aria-busy', sim ? 'true' : 'false');
  }

  async function enviarPatch(corpo, mensagemOk) {
    if (estado.ocupado || !estado.atual) return;
    const protocolo = estado.atual.candidatura.protocolo;
    ocupar(true);
    limparErrosCampos();
    try {
      const r = await chamar('PATCH', `${ROTA}/${encodeURIComponent(protocolo)}`, corpo);
      $('pa-nota').value = '';
      renderDetalhe(r);
      anunciar(mensagemOk(r.candidatura));
      await carregarLista();
      $('pa-det-titulo').focus();
    } catch (err) {
      if (err.status === 409) {
        // Outra pessoa mexeu ou a ação deixou de valer: recarrega e avisa.
        await Promise.all([abrirDetalhe(protocolo, { focar: false }), carregarLista()]);
        anunciar(`${err.message} O status desta candidatura mudou; os dados foram recarregados.`, 'erro');
        $('pa-det-titulo').focus();
      } else if (err.status === 400 && err.campos) {
        if (err.campos.nota) erroNoCampo('pa-nota', 'pa-nota-erro', 'pa-nota-ajuda', err.campos.nota);
        if (err.campos.responsavel) erroNoCampo('pa-responsavel', 'pa-resp-erro', 'pa-resp-ajuda', err.campos.responsavel);
        const primeira = Object.values(err.campos)[0];
        anunciar(primeira || err.message, 'erro');
      } else if (err.status === 404) {
        limparDetalhe();
        await carregarLista();
        anunciar('Candidatura não encontrada.', 'erro');
      } else {
        tratarErro(err);
      }
    } finally {
      ocupar(false);
    }
  }

  function mudarStatus(destino, tipo) {
    const nota = $('pa-nota').value.trim();
    const corpo = { status: destino };
    if (nota) corpo.nota = nota;
    return enviarPatch(corpo, (c) => {
      if (tipo === 'arquivar') return `Candidatura ${c.protocolo} arquivada.`;
      if (tipo === 'reabrir') return `Candidatura ${c.protocolo} reaberta em "${rotulo(c.status)}".`;
      return `Candidatura ${c.protocolo} movida para "${rotulo(c.status)}".`;
    });
  }

  function registrarNota() {
    const nota = $('pa-nota').value.trim();
    if (!nota) {
      erroNoCampo('pa-nota', 'pa-nota-erro', 'pa-nota-ajuda', 'Escreva a nota antes de registrar.');
      anunciar('Escreva a nota antes de registrar.', 'erro');
      return;
    }
    return enviarPatch({ nota }, (c) => `Nota registrada no histórico de ${c.protocolo}.`);
  }

  function salvarResponsavel(ev) {
    ev.preventDefault();
    const valor = $('pa-responsavel').value.trim();
    return enviarPatch({ responsavel: valor || null }, (c) => (c.responsavel
      ? `Responsável por ${c.protocolo}: ${c.responsavel}.`
      : `Responsável removido de ${c.protocolo}.`));
  }

  // ---------- eventos e boot ----------
  function ligarEventos() {
    $('pa-filtros').addEventListener('submit', (ev) => {
      ev.preventDefault();
      estado.status = $('pa-filtro-status').value;
      estado.pagina = 1;
      carregarLista({ anunciarTotal: true });
    });
    $('pa-programa').addEventListener('change', () => {
      estado.programa = $('pa-programa').value;
      estado.status = '';
      estado.pagina = 1;
      estado.protocolo = null;
      limparDetalhe();
      carregarLista({ anunciarTotal: true });
    });
    $('pa-filtro-status').addEventListener('change', () => {
      estado.status = $('pa-filtro-status').value;
      estado.pagina = 1;
      carregarLista({ anunciarTotal: true });
    });
    $('pa-anterior').addEventListener('click', () => {
      if (estado.pagina > 1) { estado.pagina -= 1; carregarLista({ anunciarTotal: true }); }
    });
    $('pa-proxima').addEventListener('click', () => {
      estado.pagina += 1;
      carregarLista({ anunciarTotal: true });
    });
    $('pa-so-nota').addEventListener('click', registrarNota);
    $('pa-resp-form').addEventListener('submit', salvarResponsavel);
    $('pa-nota').addEventListener('input', () => {
      if (!$('pa-nota-erro').hidden) limparErrosCampos();
    });
  }

  /**
   * Shell do backoffice (D-48, D-75): montado SÓ para a coordenação, depois de o
   * servidor confirmar o acesso (a guarda continua sendo a própria: #pa-restrito e
   * login.html?next=parcerias.html). Ninguém é redirecionado por esta chamada.
   */
  async function montarShell() {
    try {
      const shell = window.DMC_Shell;
      const prof = window.DMC_Professor;
      if (!shell || typeof shell.montar !== 'function' || !prof) return;
      if (window.DMC_Auth && typeof window.DMC_Auth.init === 'function' && !window.DMC_Auth.user()) await window.DMC_Auth.init();
      shell.montar('parcerias', { area: 'backoffice', papel: 'admin', itens: prof.itensDoMenu('admin') });
    } catch (err) {
      console.error('[DMC]', err);
    }
  }

  function iniciar() {
    return iniciarPagina().catch((err) => { console.error('[DMC]', err); }).finally(marcarPronto);
  }

  async function iniciarPagina() {
    lerUrl();
    const sair = $('pa-sair');
    if (sair) {
      sair.addEventListener('click', () => {
        if (window.DMC_Api) window.DMC_Api.setToken(null);
        window.location.href = 'login.html';
      });
    }
    if (!window.DMC_Api || !window.DMC_Api.token()) { irParaLogin(); return; }

    try {
      const { user } = await chamar('GET', '/auth/me');
      const nome = $('pa-user-nome');
      const iniciais = $('pa-user-iniciais');
      if (nome) nome.textContent = (user && user.nome) || '';
      if (iniciais) iniciais.textContent = (user && user.iniciais) || '';
    } catch (err) {
      tratarErro(err);
      return;
    }

    ligarEventos();
    $('pa-programa').value = estado.programa;
    // O servidor decide quem é admin: um aluno recebe 403 aqui.
    await carregarLista();
    if (estado.restrito) return;
    await montarShell();
    $('pa-app').hidden = false;
    marcarPronto();
    if (estado.protocolo) await abrirDetalhe(estado.protocolo, { focar: false });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
