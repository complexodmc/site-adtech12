/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/shell.js v2 (F0s)
   Spec: docs/dmc/PORTAL-ACADEMICO.md §7.6 (contrato), §7.9, D-60,
   D-66, D-75; PORTAL-UX.md §5 (shell por papel), §2.7, §2.8, §4.3,
   §4.13, §10 item 7, §11.

   Injeta o shell em toda página com <body data-shell="chave">:
   topo (marca, busca, Tutoriais/Ajuda, A−/A+, tema, sino, conta),
   faixa de avisos, lateral com o menu do papel, gaveta (< 1024),
   dica do menu recolhido e rodapé. Quem chama:
   - DMC_Portal.iniciar (ui.js, F0b): montar(pagina, { modo, area,
     restrito, itens, papel });
   - páginas legadas: DMC_bindHeader (app.js) → montar(body[data-shell]).

   CONTRATO (§7.6; só acréscimos opcionais depois da fase 0)
     DMC_Shell.montar(ativo, { modo, area, papel, itens, restrito })
       idempotente; mantém no <body> has-shell, menu-recolhido e
       menu-aberto e as variáveis --shell-top-h/--shell-side-w/
       --shell-side-w-min com os valores novos.
     DMC_Shell.definirAtivo(chave) · definirContador(chave, n)
     DMC_Shell.definirPendencia(chave, temPendencia)
     DMC_Shell.notificacoes.atualizar() → Promise<number|null>
     DMC_Shell.notificacoes.abrir() · .fechar()
     DMC_Shell.tema.obter() → 'escuro'|'claro'|'auto' · .definir(t) · .alternar()
     DMC_Shell.fonte.obter() → -1|0|1|2 · .definir(n) · .aumentar() · .diminuir()
     DMC_Shell.busca.abrir({ termo, tipo })
     DMC_Shell.banner.atualizar() → Promise<void> · .dispensar(id)
     DMC_Shell.tour.iniciar(chave = 'primeiro-acesso', { automatico } = {})
       → Promise<void>   (acréscimo opcional: automatico:true não dispara
       se já visto, em modo restrito nem com contrato pendente, UX §5.7)
     DMC_Shell.tour.jaVisto(chave) → boolean

   Itens do backoffice (D-66, D-75): chegam PRONTOS da F8
   ([{ rota, rotulo, grupo, icone, ordem, href?, contagemRotulo? }]); o
   shell só desenha o que recebe. `contagemRotulo` (opcional) completa o
   nome acessível da contagem (", 4 a corrigir"); sem ele, ", 4 na fila".

   Degradação (D-60): sem DMC_UI o shell não lança — desenha topo e menu
   com escape próprio mínimo e deixa de lado busca, sino e faixa.
   Endpoint ausente (404, fatia ainda não montada) = silêncio (UX §10
   item 7). Modo restrito: só topo com marca, A−/A+, tema e [Sair], sem
   nenhuma chamada (D-51, D-63). Sem sessão (DMC_Auth.isLogged() falso,
   ex.: obrigado.html aberto sem login): igual ao restrito, com [Entrar]
   (login.html?next=<página>) no lugar da conta e o rodapé estático; sem
   lateral, busca, sino, faixa, pendências, banners, configurações
   públicas nem tour — nenhuma chamada à API (G0-a, §8.6 item 3).

   Larguras (UX §4.13): pela janela dividida pela escala do texto —
   p < 768 ≤ m < 1024 ≤ g < 1280 ≤ x — em <html data-pf-larg>. Abaixo
   de 1024 a lateral vira gaveta.
   ============================================================= */
(function () {
  'use strict';

  if (window.DMC_Shell && window.DMC_Shell.tema) return; // carregado duas vezes: o primeiro vale

  const doc = document;
  const raiz = doc.documentElement;

  // tour.js é carregado sob demanda; o ?v= é reescrito por tests/tools/versionar-ead.mjs (§6.5).
  const VERSAO_TOUR = 'dev';
  const CAMINHO_TOUR = 'js/portal/tour.js';

  const API = {
    notificacoesResumo: '/portal/me/notificacoes/resumo',
    notificacoes: '/portal/me/notificacoes?pagina=1',
    notificacaoLida: (id) => `/portal/me/notificacoes/${encodeURIComponent(id)}/lida`,
    notificacoesLidas: '/portal/me/notificacoes/lidas',
    pendencias: '/portal/me/pendencias',
    bannersTopo: '/portal/banners?local=topo',
    busca: '/portal/busca',
    configuracoesPublicas: '/portal/configuracoes/publicas'
  };

  const CHAVE = {
    recolhido: 'dmc:menuRecolhido',
    tema: 'dmc:tema',
    fonte: 'dmc:fonte',
    banner: (id) => `dmc:banner:${id}:dispensado`,
    tour: (chave, userId) => `dmc:tour:${chave}:${userId || 'anonimo'}`
  };

  const PAPEIS = ['aluno', 'professor', 'admin'];
  const TEMAS = ['escuro', 'claro', 'auto'];
  const NIVEIS = [-1, 0, 1, 2];
  const PCT_NIVEL = { '-1': '93,75%', 0: '100%', 1: '112,5%', 2: '125%' };
  // href interno vindo do servidor (busca, avisos, notificações, banners): página da EAD.
  const HREF_INTERNO = /^[a-z0-9_-]+\.html(\?[^#\s]*)?(#\S*)?$/i;
  const ID_NOVIDADE = 'novo-portal';
  const LIMITE_FAIXA = 90; // D-28: a faixa do topo mostra até 90 caracteres
  const ATUALIZAR_SINO_MS = 60000;

  // ---------------------------------------------------------------
  // Armazenamento local (§7.9: prefixo dmc:, nada de dado pessoal)
  // ---------------------------------------------------------------
  function ler(chave) {
    try { return window.localStorage.getItem(chave); } catch { return null; }
  }
  function gravar(chave, valor) {
    try {
      if (valor == null) window.localStorage.removeItem(chave);
      else window.localStorage.setItem(chave, String(valor));
      return true;
    } catch { return false; }
  }

  // ---------------------------------------------------------------
  // HTML: DMC_UI.html quando existe; sem ele, escape próprio mínimo (D-60)
  // ---------------------------------------------------------------
  const MAPA_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => (v == null ? '' : String(v).replace(/[&<>"']/g, (c) => MAPA_ESCAPE[c]));
  class Seguro extends String {}
  const temUI = () => !!(window.DMC_UI && typeof window.DMC_UI.html === 'function' && typeof window.DMC_UI.cru === 'function');

  function cru(texto) {
    return temUI() ? window.DMC_UI.cru(texto) : new Seguro(texto);
  }
  function emHtml(v) {
    if (v == null || v === false) return '';
    if (v instanceof Seguro) return v.valueOf();
    if (Array.isArray(v)) return v.map(emHtml).join('');
    return esc(v);
  }
  function html(partes, ...valores) {
    if (temUI()) return window.DMC_UI.html(partes, ...valores);
    let saida = partes[0];
    for (let i = 0; i < valores.length; i++) saida += emHtml(valores[i]) + partes[i + 1];
    return new Seguro(saida);
  }
  /** Converte o markup seguro em nós (um <template> não executa nada). */
  function nos(markup) {
    const t = doc.createElement('template');
    // DMC_UI.cru devolve { __cru } (não é string); o resto é String marcada.
    t.innerHTML = markup && typeof markup === 'object' && typeof markup.__cru === 'string' ? markup.__cru : String(markup);
    return t.content;
  }

  // ---------------------------------------------------------------
  // Ícones: DMC_Icons (F0b, UX §4.12) quando já tem a chave; senão a
  // reserva abaixo (mesmo traço 1,5, viewBox 24, currentColor).
  // ---------------------------------------------------------------
  const svg = (corpo) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${corpo}</svg>`;
  const RESERVA = {
    navInicio: svg('<path d="M3 9.5 12 4l9 5.5"/><path d="M3 20h18"/><path d="M6 11v6.5M10 11v6.5M14 11v6.5M18 11v6.5"/>'),
    navMeusCursos: svg('<path d="m12 4 9 4.5-9 4.5-9-4.5z"/><path d="m3 12.5 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>'),
    navAoVivo: svg('<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 15.8a5.4 5.4 0 0 0 0-7.6M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 18.7a9.5 9.5 0 0 0 0-13.4"/>'),
    navAcademico: svg('<path d="M4 20h16"/><path d="M6.5 17v-6M10.5 17V6M14.5 17v-4M18.5 17V9"/>'),
    navPublicacoes: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.3-2.5z" fill="currentColor" stroke="none"/>'),
    navFinanceiro: svg('<path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z"/><path d="M9 8h6M9 12h6M9 16h3.5"/>'),
    navDocumentacao: svg('<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>'),
    navDocumentos: svg('<rect x="3" y="5" width="18" height="14" rx="1.5"/><circle cx="9" cy="11" r="2"/><path d="M6 16a3 3 0 0 1 6 0M14.5 10h4M14.5 14h4"/>'),
    navDeclaracoes: svg('<path d="M14 3H6.5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V7.5z"/><path d="M14 3v4.5h4.5"/><circle cx="12" cy="13" r="2.5"/><path d="m10.6 15.1-.6 3.9 2-1 2 1-.6-3.9"/>'),
    navContratos: svg('<path d="M3 21h18"/><path d="M19.5 3.5c-7 .7-11.2 5.6-12.4 12.6L6.2 18l1.9-.9c7-1.2 11.5-5.4 11.4-13.6z"/><path d="m8.5 15.5 5.5-6"/>'),
    navComprovantes: svg('<path d="M14 3H6.5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V7.5z"/><path d="M14 3v4.5h4.5"/><path d="m9 14 2 2 4-4"/>'),
    navAtendimento: svg('<path d="M4 5h16v11H9.5L4 20z"/>'),
    navTutoriais: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6"/><circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/>'),
    navCursosDisponiveis: svg('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'),
    // Menu do backoffice (chaves de DMC_Professor.MENU_ESTATICO, UX §4.12)
    navVisaoGeral: svg('<rect x="3.5" y="3.5" width="7" height="9" rx="1"/><rect x="13.5" y="3.5" width="7" height="5" rx="1"/><rect x="13.5" y="11.5" width="7" height="9" rx="1"/><rect x="3.5" y="15.5" width="7" height="5" rx="1"/>'),
    navCursos: svg('<path d="M12 6.5C9.8 5 7 4.6 3.5 5v13.5c3.5-.4 6.3 0 8.5 1.5 2.2-1.5 5-1.9 8.5-1.5V5c-3.5-.4-6.3 0-8.5 1.5z"/><path d="M12 6.5V20"/>'),
    navTurmas: svg('<circle cx="8.5" cy="9" r="3"/><path d="M3 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="16.5" cy="8" r="2.5"/><path d="M15.5 13.6a4.6 4.6 0 0 1 5.5 4.4"/>'),
    navAvaliacoes: svg('<rect x="5" y="4.5" width="14" height="16.5" rx="1.5"/><path d="M9 4.5V3h6v1.5"/><path d="m9 13 2 2 4-4.5"/>'),
    navCorrecao: svg('<path d="M4 20h7"/><path d="m14.5 4.5 5 5L10 19H5v-5z"/><path d="m12.5 6.5 5 5"/>'),
    navDuvidas: svg('<path d="M4 5h16v11H9.5L4 20z"/><path d="M10.2 8.6a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4"/><circle cx="12" cy="13.7" r=".8" fill="currentColor" stroke="none"/>'),
    navOuvidoria: svg('<path d="M4 5h16v11H9.5L4 20z"/><path d="M12 7.5 15 8.6v2.2c0 1.6-1.2 2.9-3 3.4-1.8-.5-3-1.8-3-3.4V8.6z"/>'),
    navAlunos: svg('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
    navMatriculas: svg('<rect x="4" y="3.5" width="16" height="17" rx="1.5"/><path d="M9.5 3.5v2h5v-2"/><circle cx="12" cy="11" r="2.3"/><path d="M8 17a4 4 0 0 1 8 0"/>'),
    navEquipe: svg('<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 10-5.5"/><circle cx="17.5" cy="17" r="2"/><path d="M17.5 13.5v1.5M17.5 19v1.5M14 17h1.5M19.5 17H21"/>'),
    navRelatorios: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M8 16.5v-4M12 16.5V8M16 16.5v-6"/>'),
    navAuditoria: svg('<path d="M4 6h9M4 11h7M4 16h6"/><circle cx="16.5" cy="15" r="4"/><path d="M16.5 13v2l1.3 1.2"/>'),
    navConfig: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
    navParcerias: svg('<path d="M3 11.5 7 8l3 1.5 3-2 4 1 4 3"/><path d="m7 8-3.5 6 5 4.5 2.5-1.5 2.5 1.5 4-3.5 2-3.5"/><path d="m10 16 2-2M12.5 17.5l2-2"/>'),
    navBanners: svg('<path d="M4 10v4h3l7 4V6l-7 4z"/><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5"/>'),
    busca: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
    sino: svg('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
    temaSol: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
    temaLua: svg('<path d="M20 14.6A8 8 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"/>'),
    conta: svg('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>'),
    sair: svg('<path d="M14.5 4H19a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4.5"/><path d="m10 8-4 4 4 4M6 12h10"/>'),
    recolher: svg('<path d="m14.5 6-6 6 6 6"/><path d="M19 5v14"/>'),
    expandir: svg('<path d="m9.5 6 6 6-6 6"/><path d="M5 5v14"/>'),
    chevron: svg('<path d="m6 9.5 6 6 6-6"/>'),
    seta: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    fechar: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    estadoAviso: svg('<path d="M12 4 21 20H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>'),
    estadoInfo: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".9" fill="currentColor" stroke="none"/>'),
    cadeado: svg('<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    carrinho: svg('<circle cx="9" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/><path d="M2.5 3.5h3l2.4 11.2a1.5 1.5 0 0 0 1.5 1.3h8.4a1.5 1.5 0 0 0 1.5-1.2l1.4-7.3H6.5"/>'),
    play: svg('<path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none"/>'),
    tipoDocumento: svg('<path d="M14 3H6.5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V7.5z"/><path d="M14 3v4.5h4.5M9 13h6M9 16.5h4"/>'),
    ponto: svg('<circle cx="12" cy="12" r="3.5"/>')
  };

  function icone(chave) {
    const lista = window.DMC_Icons;
    const temNoNucleo = !!(lista && Object.prototype.hasOwnProperty.call(lista, chave) && typeof lista[chave] === 'string');
    if (temNoNucleo && temUI() && typeof window.DMC_UI.icone === 'function') {
      const s = window.DMC_UI.icone(chave);
      if (String(s)) return s;
    }
    const bruto = temNoNucleo ? lista[chave] : (RESERVA[chave] || RESERVA.ponto);
    return cru(String(bruto).replace(/^(\s*)<svg\b/i, '$1<svg aria-hidden="true" focusable="false"'));
  }

  // ---------------------------------------------------------------
  // Usuário e papel (§5.1: isAdmin manda; professor só com papel gravado)
  // ---------------------------------------------------------------
  function usuario() {
    try {
      const auth = window.DMC_Auth;
      return auth && typeof auth.user === 'function' ? auth.user() : null;
    } catch { return null; }
  }
  /**
   * Há sessão confirmada? DMC_Auth.isLogged() manda (o usuário só existe depois do
   * GET /auth/me); sem o núcleo, vale o usuário recebido. Sem sessão o shell não
   * chama a API: toda rota do portal responderia 401.
   */
  function sessaoAtiva(user) {
    const auth = window.DMC_Auth;
    if (auth && typeof auth.isLogged === 'function') {
      try { return auth.isLogged() === true; } catch { return !!user; }
    }
    return !!user;
  }
  /** login.html?next=<página atual com a query>, pela mesma regra do núcleo (DMC_Auth.NEXT_RE). */
  function hrefEntrar() {
    let seg = String(window.location.pathname || '').split('/').pop() || '';
    try { seg = decodeURIComponent(seg); } catch { /* fica cru */ }
    if (seg && !/\.[a-z0-9]+$/i.test(seg)) seg += '.html'; // /plataforma-ead/obrigado (extensions:['html'])
    const alvo = seg + (window.location.search || '');
    const auth = window.DMC_Auth;
    let next = '';
    try {
      next = auth && typeof auth.validarNext === 'function'
        ? auth.validarNext(alvo)
        : (/^[a-z0-9_-]+\.html(\?.*)?$/i.test(alvo) ? alvo : '');
    } catch { next = ''; }
    return next && next !== 'login.html' ? `login.html?next=${encodeURIComponent(next)}` : 'login.html';
  }
  function papelDe(user) {
    const auth = window.DMC_Auth;
    if (auth && typeof auth.papel === 'function') {
      const p = auth.papel();
      if (PAPEIS.indexOf(p) >= 0) return p;
    }
    if (!user) return 'aluno';
    if (user.isAdmin === true) return 'admin';
    return user.papel === 'professor' ? 'professor' : 'aluno';
  }
  function iniciaisDe(user) {
    if (user && user.iniciais) return String(user.iniciais).slice(0, 2).toUpperCase();
    const nome = (user && user.nome ? String(user.nome) : '').trim();
    if (!nome) return '·';
    const partes = nome.split(/\s+/);
    return ((partes[0] || '').charAt(0) + (partes.length > 1 ? partes[partes.length - 1].charAt(0) : '')).toUpperCase();
  }

  // ---------------------------------------------------------------
  // Chamadas à API. GET com silencioso404 (§7.1): 404 = endpoint de
  // fatia ainda ausente → { ausente:true }, nunca erro na tela.
  // ---------------------------------------------------------------
  function ehAusente(err) {
    if (!err) return false;
    if (err.status === 404) return true;
    return !err.status && /rota n[ãa]o encontrada/i.test(String(err.message || ''));
  }
  async function obter(caminho) {
    const api = window.DMC_Api;
    if (!api || typeof api.get !== 'function') return { ausente: true };
    try {
      const dados = await api.get(caminho, { silencioso404: true });
      return dados == null ? { ausente: true } : { dados };
    } catch (err) {
      return ehAusente(err) ? { ausente: true } : { erro: err };
    }
  }
  async function enviarPost(caminho) {
    const api = window.DMC_Api;
    if (!api || typeof api.post !== 'function') return { ausente: true };
    try {
      return { dados: await api.post(caminho, {}, { silencioso404: true }) };
    } catch (err) {
      return ehAusente(err) ? { ausente: true } : { erro: err };
    }
  }

  // ---------------------------------------------------------------
  // Menus (UX §5.3 aluno; §5.4 backoffice = itens da F8)
  // ---------------------------------------------------------------
  const MENU_ALUNO = [
    { id: 'estudos', titulo: 'Estudos', itens: [
      { chave: 'inicio', rotulo: 'Início', href: 'dashboard.html', icone: 'navInicio' },
      { chave: 'meus-cursos', rotulo: 'Meus cursos', href: 'meus-cursos.html', icone: 'navMeusCursos' },
      { chave: 'ao-vivo', rotulo: 'Aulas ao vivo', href: 'ao-vivo.html', icone: 'navAoVivo' },
      { chave: 'academico', rotulo: 'Acadêmico', href: 'academico.html', icone: 'navAcademico' },
      { chave: 'publicacoes', rotulo: 'Publicações', href: 'publicacoes.html', icone: 'navPublicacoes' }
    ] },
    { id: 'secretaria', titulo: 'Secretaria', itens: [
      { chave: 'financeiro', rotulo: 'Financeiro', href: 'financeiro.html', icone: 'navFinanceiro' },
      { chave: 'documentacao', rotulo: 'Documentação', icone: 'navDocumentacao', sub: [
        { chave: 'documentos', rotulo: 'Documentos pessoais', href: 'documentos.html', icone: 'navDocumentos' },
        { chave: 'certificados', rotulo: 'Declarações e certificados', href: 'certificados.html', icone: 'navDeclaracoes' },
        { chave: 'contratos', rotulo: 'Contratos', href: 'contratos.html', icone: 'navContratos' },
        { chave: 'comprovantes', rotulo: 'Comprovantes', href: 'comprovantes.html', icone: 'navComprovantes' }
      ] }
    ] },
    { id: 'ajuda', titulo: 'Ajuda', itens: [
      { chave: 'atendimento', rotulo: 'Atendimento', href: 'assistente.html', icone: 'navAtendimento' },
      { chave: 'tutoriais', rotulo: 'Tutoriais', href: 'tutoriais.html', icone: 'navTutoriais' },
      { chave: 'loja', rotulo: 'Cursos disponíveis', href: 'loja.html', icone: 'navCursosDisponiveis' }
    ] }
  ];
  const APELIDOS = { conteudos: 'inicio' };
  const GRUPOS_BACKOFFICE = [
    { id: null, titulo: null },
    { id: 'ensino', titulo: 'Ensino' },
    { id: 'secretaria', titulo: 'Secretaria' },
    { id: 'relacionamento', titulo: 'Relacionamento' },
    { id: 'gestao', titulo: 'Gestão' }
  ];

  function normalizarChave(chave) {
    const c = String(chave || '').trim();
    return APELIDOS[c] || c;
  }

  function hrefSeguro(href) {
    const h = String(href || '').trim();
    if (!h) return null;
    if (h.charAt(0) === '#') return h;
    if (HREF_INTERNO.test(h)) return h;
    if (/^\.\.\/pages\/[a-z0-9_-]+\.html(#\S*)?$/i.test(h)) return h;
    return null;
  }

  function gruposDoBackoffice(itens) {
    const lista = (Array.isArray(itens) ? itens : []).filter((i) => i && (i.rota || i.chave) && i.rotulo);
    return GRUPOS_BACKOFFICE.map((g) => ({
      id: g.id || 'geral',
      titulo: g.titulo,
      itens: lista
        .filter((i) => (i.grupo || null) === g.id)
        .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0))
        .map((i) => ({
          chave: String(i.chave || i.rota),
          rotulo: String(i.rotulo),
          href: hrefSeguro(i.href) || `#/${String(i.rota || i.chave).replace(/^#?\/?/, '')}`,
          icone: i.icone || 'ponto',
          contagemRotulo: i.contagemRotulo || null
        }))
    })).filter((g) => g.itens.length);
  }

  // ---------------------------------------------------------------
  // Estado do shell
  // ---------------------------------------------------------------
  let E = null; // { ativo, modo, area, papel, restrito, user, grupos, el:{}, ... }
  let painelAberto = null; // { painel, gatilho, fechar }

  function larguraEfetiva() {
    let fs = 16;
    try { fs = parseFloat(window.getComputedStyle(raiz).fontSize) || 16; } catch { fs = 16; }
    return window.innerWidth / (fs / 16);
  }
  function classeDeLargura() {
    const w = larguraEfetiva();
    return w < 768 ? 'p' : w < 1024 ? 'm' : w < 1280 ? 'g' : 'x';
  }
  const modoGaveta = () => {
    const l = raiz.getAttribute('data-pf-larg');
    return l === 'p' || l === 'm';
  };

  // ---------------------------------------------------------------
  // Tema e tamanho do texto (§2.7, §2.8; regra única em pre-pintura.js)
  // ---------------------------------------------------------------
  function reaplicarPreferencias() {
    const pp = window.DMC_PrePintura;
    if (pp && typeof pp.aplicar === 'function') {
      pp.aplicar({ notificar: true });
    } else {
      // Sem pre-pintura (página antiga): aplica direto e avisa.
      const pref = tema.obter();
      const resolvido = pref === 'auto'
        ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'escuro')
        : pref;
      raiz.setAttribute('data-pf-tema', resolvido);
      raiz.setAttribute('data-pf-fonte', String(fonte.obter()));
      doc.dispatchEvent(new CustomEvent('dmc:tema', { detail: { tema: resolvido, preferencia: pref } }));
      doc.dispatchEvent(new CustomEvent('dmc:fonte', { detail: { nivel: fonte.obter() } }));
    }
  }
  function temaResolvido() {
    const v = raiz.getAttribute('data-pf-tema');
    return v === 'claro' ? 'claro' : 'escuro';
  }

  const tema = {
    obter() {
      const v = ler(CHAVE.tema);
      return TEMAS.indexOf(v) >= 0 ? v : 'escuro';
    },
    definir(t) {
      if (TEMAS.indexOf(t) < 0) return;
      if (!gravar(CHAVE.tema, t)) {
        // Sem armazenamento: vale só nesta página.
        raiz.setAttribute('data-pf-tema', t === 'claro' ? 'claro' : 'escuro');
        doc.dispatchEvent(new CustomEvent('dmc:tema', { detail: { tema: temaResolvido(), preferencia: t } }));
        return;
      }
      reaplicarPreferencias();
    },
    alternar() {
      tema.definir(temaResolvido() === 'claro' ? 'escuro' : 'claro');
    }
  };

  const fonte = {
    obter() {
      const v = Number(raiz.getAttribute('data-pf-fonte'));
      if (NIVEIS.indexOf(v) >= 0) return v;
      const s = Number(ler(CHAVE.fonte));
      return NIVEIS.indexOf(s) >= 0 && ler(CHAVE.fonte) !== null ? s : 0;
    },
    definir(n) {
      const nivel = Math.max(-1, Math.min(2, Math.round(Number(n))));
      if (NIVEIS.indexOf(nivel) < 0) return;
      if (!gravar(CHAVE.fonte, String(nivel))) {
        raiz.setAttribute('data-pf-fonte', String(nivel));
        doc.dispatchEvent(new CustomEvent('dmc:fonte', { detail: { nivel } }));
        return;
      }
      reaplicarPreferencias();
    },
    aumentar() { fonte.definir(fonte.obter() + 1); },
    diminuir() { fonte.definir(fonte.obter() - 1); }
  };

  function atualizarControlesDeAparencia() {
    if (!E) return;
    const claro = temaResolvido() === 'claro';
    doc.querySelectorAll('[data-pf-shell-tema]').forEach((b) => {
      b.setAttribute('aria-label', claro ? 'Ativar tema escuro' : 'Ativar tema claro');
      const alvo = b.querySelector('.pf-tema__icone');
      if (alvo) alvo.replaceChildren(nos(icone(claro ? 'temaLua' : 'temaSol')));
    });
    const pref = tema.obter();
    doc.querySelectorAll('input[name="pf-tema-preferencia"]').forEach((r) => { r.checked = r.value === pref; });
    const n = fonte.obter();
    const pct = PCT_NIVEL[n];
    doc.querySelectorAll('[data-pf-shell-fonte="menos"]').forEach((b) => {
      const limite = n <= -1;
      b.setAttribute('aria-disabled', limite ? 'true' : 'false');
      // O rótulo começa pelo texto visível "A−" (WCAG 2.5.3) e diz o tamanho atual (UX §2.8).
      b.setAttribute('aria-label', limite ? `A−, tamanho mínimo do texto, tamanho atual ${pct}` : `A−, diminuir texto, tamanho atual ${pct}`);
    });
    doc.querySelectorAll('[data-pf-shell-fonte="mais"]').forEach((b) => {
      const limite = n >= 2;
      b.setAttribute('aria-disabled', limite ? 'true' : 'false');
      b.setAttribute('aria-label', limite ? `A+, tamanho máximo do texto, tamanho atual ${pct}` : `A+, aumentar texto, tamanho atual ${pct}`);
    });
  }

  // ---------------------------------------------------------------
  // Largura, lateral recolhida e deslocamentos
  // ---------------------------------------------------------------
  function preferenciaRecolhido() {
    const v = ler(CHAVE.recolhido);
    return v === '1' ? true : v === '0' ? false : null;
  }
  function aplicarRecolhido() {
    if (!E || !E.el.lateral) return;
    const pref = preferenciaRecolhido();
    const larg = raiz.getAttribute('data-pf-larg');
    const recolhido = !modoGaveta() && (pref === null ? larg === 'g' : pref);
    doc.body.classList.toggle('menu-recolhido', recolhido);
    E.el.lateral.classList.toggle('is-recolhido', recolhido);
    const b = E.el.recolher;
    if (b) {
      b.querySelector('.pf-menu__rotulo').textContent = recolhido ? 'Expandir menu' : 'Recolher menu';
      b.querySelector('.pf-menu__icone').replaceChildren(nos(icone(recolhido ? 'expandir' : 'recolher')));
    }
    if (!recolhido) { esconderDica(); fecharFlyout(false); }
    sincronizarRamos();
  }

  let quadroLargura = 0;
  function aplicarLargura() {
    quadroLargura = 0;
    const antes = raiz.getAttribute('data-pf-larg');
    const agora = classeDeLargura();
    if (antes !== agora) raiz.setAttribute('data-pf-larg', agora);
    if (!E) return;
    if (!modoGaveta() && E.gavetaAberta) fecharGaveta(false);
    if (antes !== agora && E.buscaDialogo && (agora !== 'p')) fecharBusca(false);
    aplicarRecolhido();
    medirFaixa();
  }
  function agendarLargura() {
    if (!quadroLargura) quadroLargura = window.requestAnimationFrame(aplicarLargura);
  }

  function medirFaixa() {
    if (!E) return;
    const f = E.el.faixa;
    const h = f && !f.hidden ? Math.ceil(f.getBoundingClientRect().height) : 0;
    raiz.style.setProperty('--pf-faixa-h', `${h}px`);
  }

  // ---------------------------------------------------------------
  // Popovers do topo (sino, conta, busca, flyout): um aberto por vez
  // ---------------------------------------------------------------
  function registrarPainel(painel, gatilho, fechar) {
    if (painelAberto && painelAberto.painel !== painel) painelAberto.fechar(false);
    painelAberto = { painel, gatilho, fechar };
  }
  function soltarPainel(painel) {
    if (painelAberto && painelAberto.painel === painel) painelAberto = null;
  }
  function fecharPainelAberto(devolverFoco) {
    if (painelAberto) painelAberto.fechar(devolverFoco);
  }

  function focaveis(el) {
    return Array.from(el.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((n) => !n.closest('[hidden]') && n.getClientRects().length > 0);
  }
  function prenderFoco(evento, el) {
    if (evento.key !== 'Tab') return;
    const lista = focaveis(el);
    if (!lista.length) { evento.preventDefault(); return; }
    const primeiro = lista[0];
    const ultimo = lista[lista.length - 1];
    if (evento.shiftKey && (doc.activeElement === primeiro || !el.contains(doc.activeElement))) {
      evento.preventDefault(); ultimo.focus();
    } else if (!evento.shiftKey && (doc.activeElement === ultimo || !el.contains(doc.activeElement))) {
      evento.preventDefault(); primeiro.focus();
    }
  }

  function anunciar(texto) {
    if (!texto) return;
    if (temUI() && typeof window.DMC_UI.anunciar === 'function') { window.DMC_UI.anunciar(texto); return; }
    const r = E && E.el.anuncio;
    if (!r) return;
    r.textContent = '';
    window.setTimeout(() => { r.textContent = texto; }, 60);
  }

  // ---------------------------------------------------------------
  // Markup
  // ---------------------------------------------------------------
  function rotuloArea(area, papel) {
    if (area !== 'backoffice') return 'Plataforma';
    return papel === 'admin' ? 'Coordenação' : 'Professor';
  }
  function hrefInicio(area) { return area === 'backoffice' ? 'professor.html#/inicio' : 'dashboard.html'; }
  function ajudaDe(area) {
    return area === 'backoffice'
      ? { href: 'professor.html#/ajuda', rotulo: 'Ajuda' }
      : { href: 'tutoriais.html', rotulo: 'Tutoriais' };
  }
  function trocaDeArea(area, papel) {
    if (area === 'backoffice') return { href: 'dashboard.html', rotulo: 'Área do aluno' };
    if (papel === 'professor') return { href: 'professor.html#/inicio', rotulo: 'Portal do professor' };
    if (papel === 'admin') return { href: 'professor.html#/inicio', rotulo: 'Coordenação' };
    return null;
  }
  function placeholderBusca(area, papel) {
    if (area !== 'backoffice') return 'Buscar cursos, aulas, publicações…';
    return papel === 'admin' ? 'Buscar curso, aula, protocolo ou documento' : 'Buscar curso, aula, publicação ou código da aula';
  }
  function tiposDeBusca(area, papel) {
    const base = [
      { valor: 'tudo', rotulo: 'Tudo' },
      { valor: 'cursos', rotulo: 'Cursos' },
      { valor: 'aulas', rotulo: 'Aulas' },
      { valor: 'publicacoes', rotulo: 'Publicações' },
      { valor: 'atendimentos', rotulo: 'Atendimentos' }
    ];
    if (area !== 'backoffice' || papel === 'admin') base.push({ valor: 'documentos', rotulo: 'Documentos' });
    return base;
  }

  function htmlMarca(area, papel, comLink) {
    const corpo = html`<img class="pf-marca__rino" src="../assets/images/rino-marca.webp" alt="" width="22" height="22" decoding="async"> <span class="pf-marca__nome">COMPLEXO <b>DMC</b></span> <span class="pf-marca__contexto">${rotuloArea(area, papel)}</span>`;
    if (!comLink) return html`<span class="pf-marca dmc-brand">${corpo}</span>`;
    // O nome acessível começa pelo texto visível (WCAG 2.5.3): "Complexo DMC Plataforma, início".
    return html`<a class="pf-marca dmc-brand" href="${hrefInicio(area)}" aria-label="${`Complexo DMC ${rotuloArea(area, papel)}, início`}">${corpo}</a>`;
  }

  function htmlFonte(sufixo) {
    return html`<div class="pf-fonte" role="group" aria-label="Tamanho do texto"${sufixo === 'topo' ? cru(' data-tour="fonte"') : ''}>
      <button type="button" class="pf-fonte__botao pf-fonte__botao--menos" data-pf-shell-fonte="menos" aria-label="A−, diminuir texto">A−</button>
      <button type="button" class="pf-fonte__botao pf-fonte__botao--mais" data-pf-shell-fonte="mais" aria-label="A+, aumentar texto">A+</button>
    </div>`;
  }

  function htmlBotaoTema() {
    return html`<button type="button" class="pf-tema pf-btn-icone" data-pf-shell-tema data-tour="tema" aria-label="Ativar tema claro"><span class="pf-tema__icone">${icone('temaSol')}</span></button>`;
  }

  function htmlBusca(area, papel) {
    const tipos = tiposDeBusca(area, papel);
    const mac = /Mac|iPhone|iPad/i.test(String(navigator.platform || navigator.userAgent || ''));
    return html`<div class="pf-busca" data-tour="busca">
      <button type="button" class="pf-busca__abrir pf-btn-icone" aria-label="Buscar" aria-haspopup="dialog" aria-expanded="false" aria-controls="pf-busca-caixa">${icone('busca')}</button>
      <div class="pf-busca__caixa" id="pf-busca-caixa">
        <div class="pf-busca__linha">
          <span class="pf-busca__lupa">${icone('busca')}</span>
          <input id="pf-busca-campo" class="pf-busca__campo" type="search" role="combobox" aria-expanded="false"
                 aria-controls="pf-busca-lista" aria-autocomplete="list" autocomplete="off" spellcheck="false"
                 enterkeyhint="search" maxlength="80" aria-label="Buscar na plataforma" placeholder="${placeholderBusca(area, papel)}">
          <kbd class="pf-busca__atalho" aria-hidden="true">${mac ? '⌘K' : 'Ctrl K'}</kbd>
          <button type="button" class="pf-busca__cancelar dmc-btn dmc-btn--link">Cancelar</button>
        </div>
        <div class="pf-busca__painel" id="pf-busca-painel" hidden>
          <div class="pf-busca__filtros pf-segmento" role="group" aria-label="Tipo de resultado">
            ${tipos.map((t) => html`<button type="button" class="pf-segmento__opcao" data-pf-busca-tipo="${t.valor}" aria-pressed="${t.valor === 'tudo' ? 'true' : 'false'}">${t.rotulo}</button>`)}
          </div>
          <label class="pf-busca__mostrar"><span class="pf-busca__mostrar-rotulo">Mostrar</span>
            <select class="pf-input pf-busca__mostrar-campo">${tipos.map((t) => html`<option value="${t.valor}">${t.rotulo}</option>`)}</select>
          </label>
          <p class="pf-busca__status dmc-sr-only" role="status"></p>
          <div class="pf-busca__estado" hidden></div>
          <div class="pf-busca__lista" id="pf-busca-lista" role="listbox" aria-label="Resultados da busca" hidden></div>
        </div>
      </div>
    </div>`;
  }

  function htmlSino(area) {
    const todas = area === 'backoffice' ? 'professor.html#/notificacoes' : 'notificacoes.html';
    return html`<div class="pf-sino-envoltorio">
      <button type="button" class="pf-sino pf-btn-icone" data-tour="notificacoes" aria-label="Notificações" aria-expanded="false" aria-controls="pf-notificacoes">${icone('sino')}<span class="pf-sino__contador" hidden></span></button>
      <div class="pf-notificacoes pf-popover" id="pf-notificacoes" role="dialog" aria-modal="false" aria-labelledby="pf-notificacoes-titulo" hidden>
        <div class="pf-notificacoes__cabeca">
          <p class="pf-notificacoes__titulo" id="pf-notificacoes-titulo" tabindex="-1">Notificações</p>
          <button type="button" class="pf-notificacoes__todas dmc-btn dmc-btn--link" hidden>Marcar todas como lidas</button>
          <button type="button" class="pf-notificacoes__fechar pf-btn-icone" aria-label="Fechar notificações">${icone('fechar')}</button>
        </div>
        <div class="pf-notificacoes__corpo"></div>
        <p class="pf-notificacoes__status dmc-sr-only" role="status"></p>
        <a class="pf-notificacoes__rodape" href="${todas}">Ver todas as notificações</a>
      </div>
    </div>`;
  }

  function htmlConta(user, area, papel) {
    const nome = (user && user.nome) || 'Sua conta';
    const email = (user && user.email) || '';
    const ajuda = ajudaDe(area);
    const troca = trocaDeArea(area, papel);
    return html`<div class="pf-conta" data-tour="perfil">
      <button type="button" class="pf-conta__botao" aria-expanded="false" aria-controls="pf-conta-painel">
        <span class="pf-conta__avatar" aria-hidden="true" data-user-iniciais>${iniciaisDe(user)}</span><span class="dmc-sr-only">${`Sua conta: ${nome}`}</span>
        <span class="pf-conta__chevron">${icone('chevron')}</span>
      </button>
      <div class="pf-conta__painel pf-popover" id="pf-conta-painel" hidden>
        <div class="pf-conta__cabeca">
          <p class="pf-conta__nome" data-user-nome>${nome}</p>
          ${email ? html`<p class="pf-conta__email">${email}</p>` : ''}
        </div>
        <ul class="pf-conta__lista">
          <li><a class="pf-conta__link" href="perfil.html">Meu perfil</a></li>
          <li><a class="pf-conta__link" href="meus-dados.html">Meus dados</a></li>
        </ul>
        <div class="pf-conta__aparencia">
          <p class="pf-conta__secao">Aparência e leitura</p>
          <fieldset class="pf-grupo pf-conta__temas">
            <legend class="pf-conta__legenda">Tema</legend>
            <label class="pf-radio"><input type="radio" name="pf-tema-preferencia" value="claro"><span>Claro</span></label>
            <label class="pf-radio"><input type="radio" name="pf-tema-preferencia" value="escuro"><span>Escuro</span></label>
            <label class="pf-radio"><input type="radio" name="pf-tema-preferencia" value="auto"><span>Automático</span></label>
          </fieldset>
          ${htmlFonte('conta')}
        </div>
        <ul class="pf-conta__lista">
          <li class="pf-conta__so-pequena"><a class="pf-conta__link" href="${ajuda.href}">${ajuda.rotulo}</a></li>
          <li><button type="button" class="pf-conta__link" data-pf-shell-tour>Rever o tour</button></li>
          ${troca ? html`<li><a class="pf-conta__link" href="${troca.href}">${troca.rotulo}</a></li>` : ''}
        </ul>
        <div class="pf-conta__sair-linha">
          <button type="button" class="pf-conta__link pf-conta__sair" data-pf-shell-sair>${icone('sair')}<span>Sair</span></button>
        </div>
      </div>
    </div>`;
  }

  function htmlCarrinho() {
    // Só na loja (#cart-drawer existe): DMC_bootLoja liga [data-cart-open] e o bindHeader
    // legado atualiza [data-cart-count] (R10 da D5, §7.6).
    return html`<button type="button" class="pf-carrinho pf-btn-icone" data-cart-open>${icone('carrinho')}<span class="dmc-sr-only">Carrinho</span><span class="pf-carrinho__contador is-empty" data-cart-count>0</span></button>`;
  }

  function htmlTopo(c) {
    const ajuda = ajudaDe(c.area);
    return html`<header class="pf-topo shell-top" data-pf-shell="topo">
      <button type="button" class="pf-topo__menu pf-btn-icone" data-tour="menu" aria-label="Menu" aria-expanded="false" aria-controls="pf-gaveta-painel">${icone('menu')}</button>
      ${htmlMarca(c.area, c.papel, true)}
      ${c.comUI ? htmlBusca(c.area, c.papel) : html`<span class="pf-topo__espaco"></span>`}
      <div class="pf-topo__acoes">
        <a class="pf-topo__ajuda" href="${ajuda.href}" data-tour="tutoriais">${icone('navTutoriais')}<span class="pf-topo__ajuda-rotulo">${ajuda.rotulo}</span></a>
        ${htmlFonte('topo')}
        ${htmlBotaoTema()}
        ${c.carrinho ? htmlCarrinho() : ''}
        ${c.comUI ? htmlSino(c.area) : ''}
        ${htmlConta(c.user, c.area, c.papel)}
      </div>
    </header>`;
  }

  function htmlTopoRestrito(c) {
    return html`<header class="pf-topo pf-topo--restrito shell-top" data-pf-shell="topo">
      ${htmlMarca(c.area, c.papel, false)}
      <span class="pf-topo__espaco"></span>
      <div class="pf-topo__acoes">
        ${htmlFonte('topo')}
        ${htmlBotaoTema()}
        <span class="pf-conta__avatar pf-topo__avatar" aria-hidden="true" data-user-iniciais>${iniciaisDe(c.user)}</span>
        <button type="button" class="dmc-btn dmc-btn--secondary pf-topo__sair" data-pf-shell-sair>Sair</button>
      </div>
    </header>`;
  }

  /** Sem sessão: marca, A−/A+, tema e [Entrar] no lugar da conta (nada que dependa da API). */
  function htmlTopoAnonimo(c) {
    return html`<header class="pf-topo pf-topo--anonimo shell-top" data-pf-shell="topo">
      ${htmlMarca(c.area, c.papel, false)}
      <span class="pf-topo__espaco"></span>
      <div class="pf-topo__acoes">
        ${htmlFonte('topo')}
        ${htmlBotaoTema()}
        <a class="dmc-btn dmc-btn--secondary pf-topo__entrar" href="${hrefEntrar()}" data-pf-shell-entrar>Entrar</a>
      </div>
    </header>`;
  }

  function htmlItem(item, prefixo, sub) {
    // Sem espaço entre os spans: o nome acessível fica "Contratos, 1 pendência" (sem espaço antes da vírgula).
    return html`<li class="pf-menu__no"><a class="${sub ? 'pf-menu__item pf-menu__item--sub' : 'pf-menu__item'}" href="${item.href}" id="${`${prefixo}i-${item.chave}`}" data-pf-chave="${item.chave}" data-tour="${`item-${item.chave}`}"><span class="pf-menu__icone">${icone(item.icone)}</span><span class="pf-menu__rotulo">${item.rotulo}</span><span class="pf-menu__ponto" hidden>${icone('estadoAviso')}<span class="dmc-sr-only">, 1 pendência</span></span><span class="pf-menu__contagem" data-pf-contagem-rotulo="${item.contagemRotulo || ''}" hidden></span></a></li>`;
  }

  function htmlRamo(item, prefixo) {
    const idSub = `${prefixo}sub-${item.chave}`;
    return html`<li class="pf-menu__no pf-menu__ramo">
      <button type="button" class="pf-menu__item pf-menu__grupo" id="${`${prefixo}i-${item.chave}`}" data-pf-chave="${item.chave}" data-pf-ramo data-tour="${`item-${item.chave}`}" aria-expanded="false" aria-controls="${idSub}"><span class="pf-menu__icone">${icone(item.icone)}</span><span class="pf-menu__rotulo">${item.rotulo}</span><span class="pf-menu__ponto" hidden>${icone('estadoAviso')}<span class="dmc-sr-only">, com pendência</span></span><span class="pf-menu__seta">${icone('chevron')}</span></button>
      <ul class="pf-menu__sub" id="${idSub}" hidden>${item.sub.map((s) => htmlItem(s, prefixo, true))}</ul>
    </li>`;
  }

  function htmlGrupos(grupos, prefixo, contexto) {
    return grupos.map((g) => {
      const idT = `${prefixo}g-${g.id}`;
      const itens = g.itens.map((i) => (i.sub ? htmlRamo(i, prefixo) : htmlItem(i, prefixo, false)));
      if (!g.titulo) return html`<div class="pf-menu__secao pf-menu__secao--solta"><ul class="pf-menu__lista">${itens}</ul></div>`;
      if (contexto === 'gaveta') {
        return html`<div class="pf-menu__secao" data-pf-grupo="${g.id}">
          <button type="button" class="pf-menu__titulo pf-menu__titulo--botao" id="${idT}" aria-expanded="false" aria-controls="${`${idT}-lista`}"><span class="pf-menu__titulo-texto">${g.titulo}</span>${icone('chevron')}</button>
          <ul class="pf-menu__lista" id="${`${idT}-lista`}" aria-labelledby="${idT}" hidden>${itens}</ul>
        </div>`;
      }
      return html`<div class="pf-menu__secao" data-pf-grupo="${g.id}">
        <p class="pf-menu__titulo" id="${idT}"><span class="pf-menu__titulo-texto">${g.titulo}</span></p>
        <ul class="pf-menu__lista" aria-labelledby="${idT}">${itens}</ul>
      </div>`;
    });
  }

  function htmlLateral(c) {
    const troca = trocaDeArea(c.area, c.papel);
    const ajuda = ajudaDe(c.area);
    return html`<aside class="pf-lateral" aria-label="Navegação da plataforma" data-tour="menu-lateral">
      <nav class="pf-menu" aria-label="Menu principal">${htmlGrupos(c.grupos, 'pf-l-', 'lateral')}</nav>
      <div class="pf-lateral__rodape">
        <ul class="pf-menu__lista">
          ${troca ? html`<li class="pf-menu__no"><a class="pf-menu__item" href="${troca.href}"><span class="pf-menu__icone">${icone('seta')}</span><span class="pf-menu__rotulo">${troca.rotulo}</span></a></li>` : ''}
          ${c.area === 'backoffice' ? html`<li class="pf-menu__no"><a class="pf-menu__item" href="${ajuda.href}"><span class="pf-menu__icone">${icone('navTutoriais')}</span><span class="pf-menu__rotulo">${ajuda.rotulo}</span></a></li>` : ''}
          <li class="pf-menu__no"><button type="button" class="pf-menu__item pf-lateral__recolher" data-pf-shell-recolher><span class="pf-menu__icone">${icone('recolher')}</span><span class="pf-menu__rotulo">Recolher menu</span></button></li>
        </ul>
      </div>
    </aside>`;
  }

  function htmlGaveta(c) {
    const troca = trocaDeArea(c.area, c.papel);
    const ajuda = ajudaDe(c.area);
    return html`<div class="pf-gaveta" hidden>
      <div class="pf-gaveta__veu" data-pf-shell-fechar-gaveta></div>
      <div class="pf-gaveta__painel" id="pf-gaveta-painel" role="dialog" aria-modal="true" aria-label="Menu">
        <div class="pf-gaveta__cabeca">
          ${htmlMarca(c.area, c.papel, true)}
          <button type="button" class="pf-gaveta__fechar pf-btn-icone" data-pf-shell-fechar-gaveta aria-label="Fechar menu">${icone('fechar')}</button>
        </div>
        <div class="pf-gaveta__corpo"><nav class="pf-menu" aria-label="Menu principal">${htmlGrupos(c.grupos, 'pf-g-', 'gaveta')}</nav></div>
        <div class="pf-gaveta__rodape">
          <ul class="pf-gaveta__links">
            ${troca ? html`<li><a class="pf-gaveta__link" href="${troca.href}">${troca.rotulo}</a></li>` : ''}
            <li><a class="pf-gaveta__link" href="${ajuda.href}">${ajuda.rotulo}</a></li>
            <li><button type="button" class="pf-gaveta__link" data-pf-shell-sair>${icone('sair')}<span>Sair</span></button></li>
          </ul>
        </div>
      </div>
    </div>`;
  }

  function htmlRodape(c) {
    const ajuda = ajudaDe(c.area);
    return html`<footer class="pf-rodape" data-pf-shell="rodape">
      <ul class="pf-rodape__lista">
        <li class="pf-rodape__marca">Complexo DMC · Plataforma</li>
        <li><a class="pf-rodape__link" href="../pages/politica-de-privacidade.html">Política de privacidade</a></li>
        <li><a class="pf-rodape__link" href="meus-dados.html">Meus dados</a></li>
        <li class="pf-rodape__encarregado"><a class="pf-rodape__link" href="meus-dados.html">Encarregado de dados</a></li>
        <li><a class="pf-rodape__link" href="regulamento.html">Regulamento acadêmico</a></li>
        <li><a class="pf-rodape__link" href="${ajuda.href}">${ajuda.rotulo}</a></li>
      </ul>
    </footer>`;
  }

  function esqueletoLinhas(n) {
    const linhas = [];
    for (let i = 0; i < n; i++) linhas.push(html`<span class="pf-esqueleto pf-esqueleto--linha"></span>`);
    return html`<div class="pf-shell-esqueleto" aria-hidden="true">${linhas}</div>`;
  }

  // ---------------------------------------------------------------
  // Formatação mínima (DMC_UI.fmt quando existe)
  // ---------------------------------------------------------------
  function dataAbsoluta(iso) {
    const ui = window.DMC_UI;
    if (ui && ui.fmt && typeof ui.fmt.dataHora === 'function') return ui.fmt.dataHora(iso);
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(d);
  }
  function dataRelativa(iso) {
    const ui = window.DMC_UI;
    if (ui && ui.fmt && typeof ui.fmt.relativo === 'function') return ui.fmt.relativo(iso);
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const seg = Math.round((d.getTime() - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
    const abs = Math.abs(seg);
    if (abs < 60) return rtf.format(Math.round(seg), 'second');
    if (abs < 3600) return rtf.format(Math.round(seg / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(seg / 3600), 'hour');
    if (abs < 2592000) return rtf.format(Math.round(seg / 86400), 'day');
    return dataAbsoluta(iso);
  }
  function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function encurtar(texto, max) {
    const t = String(texto || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const corte = t.slice(0, max - 1);
    const espaco = corte.lastIndexOf(' ');
    return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s.,;:–-]+$/, '')}…`;
  }

  // ---------------------------------------------------------------
  // Montagem
  // ---------------------------------------------------------------
  function chaveAtivaDe(ativo) {
    const b = doc.body;
    const explicito = b && b.dataset ? b.dataset.shellAtivo : '';
    const a = ativo && ativo !== 'backoffice' ? ativo : '';
    return normalizarChave(explicito || a || (b && b.dataset ? b.dataset.shell : ''));
  }

  function garantirPuloParaConteudo() {
    const body = doc.body;
    let main = doc.getElementById('conteudo');
    if (!main || main.tagName !== 'MAIN') {
      const primeiro = doc.querySelector('main');
      if (primeiro) {
        if (!primeiro.id && !doc.getElementById('conteudo')) primeiro.id = 'conteudo';
        main = primeiro;
      }
    }
    if (!main) return null;
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    if (!body.querySelector('a.dmc-skip') && main.id) {
      body.prepend(nos(html`<a class="dmc-skip" href="${`#${main.id}`}">Pular para o conteúdo</a>`));
    }
    return main;
  }

  function montar(ativo, opcoes) {
    const body = doc.body;
    if (!body) return;
    if (E) {
      const c = chaveAtivaDe(ativo);
      if (c) definirAtivo(c);
      return;
    }
    const o = opcoes || {};
    const user = o.user || usuario();
    // Sem sessão confirmada (obrigado.html aberto sem login): nenhuma chamada à API.
    const anonimo = !sessaoAtiva(user);
    const modo = o.modo === 'foco' ? 'foco' : 'padrao';
    const area = o.area === 'backoffice' ? 'backoffice' : 'aluno';
    const papel = anonimo ? null : (PAPEIS.indexOf(o.papel) >= 0 ? o.papel : papelDe(user));
    const restrito = !anonimo && (o.restrito != null ? o.restrito === true : !!(user && user.precisaTrocarSenha === true));
    const comUI = temUI();

    E = {
      ativo: null, modo, area, papel, restrito, anonimo, user: anonimo ? null : user, comUI, el: {}, grupos: [],
      gavetaAberta: false, buscaDialogo: false, flyout: null, dicaDe: null,
      pendencias: null, banners: [], sinoAusente: false, naoLidas: undefined,
      tourAtivo: false, pendenciasPromessa: Promise.resolve()
    };

    raiz.setAttribute('data-pf-larg', classeDeLargura());
    raiz.classList.add('pf-shell');
    body.classList.add('has-shell', 'pf-app');
    if (area === 'backoffice') body.classList.add('pf-app--backoffice');
    ligarGlobais();
    if (modo === 'foco') {
      // Player (UX §5.6): sem topo global nem lateral; tema e A± seguem pela API.
      body.classList.add('pf-app--foco');
      return;
    }
    if (restrito) body.classList.add('pf-app--restrito');
    if (anonimo) body.classList.add('pf-app--anonimo');

    const main = garantirPuloParaConteudo();
    E.grupos = anonimo ? [] : area === 'backoffice' ? gruposDoBackoffice(o.itens) : MENU_ALUNO;
    const c = { area, papel, user: E.user, comUI, carrinho: !!doc.querySelector('#cart-drawer'), grupos: E.grupos };

    const frag = doc.createDocumentFragment();
    if (restrito) {
      frag.appendChild(nos(htmlTopoRestrito(c)));
    } else if (anonimo) {
      frag.appendChild(nos(htmlTopoAnonimo(c)));
    } else {
      frag.appendChild(nos(htmlTopo(c)));
      if (comUI) frag.appendChild(nos(html`<div class="pf-faixa" role="region" aria-label="Avisos" hidden></div>`));
      frag.appendChild(nos(htmlLateral(c)));
      frag.appendChild(nos(htmlGaveta(c)));
      frag.appendChild(nos(html`<div class="pf-dica" role="tooltip" id="pf-dica" hidden></div>`));
    }
    frag.appendChild(nos(html`<p class="dmc-sr-only" role="status" data-pf-shell="anuncio"></p>`));
    const pulo = Array.from(body.children).find((n) => n.matches('a.dmc-skip'));
    if (pulo) pulo.after(frag); else body.prepend(frag);

    if (!restrito) {
      const rodape = nos(htmlRodape(c));
      if (main && main.parentNode) main.after(rodape); else body.appendChild(rodape);
    }

    const q = (s) => doc.querySelector(s);
    E.el = {
      topo: q('.pf-topo'),
      botaoMenu: q('.pf-topo__menu'),
      faixa: q('.pf-faixa'),
      lateral: q('.pf-lateral'),
      recolher: q('[data-pf-shell-recolher]'),
      gaveta: q('.pf-gaveta'),
      gavetaPainel: q('.pf-gaveta__painel'),
      dica: q('#pf-dica'),
      anuncio: q('[data-pf-shell="anuncio"]'),
      rodape: q('.pf-rodape[data-pf-shell="rodape"]'),
      busca: q('.pf-busca'),
      buscaAbrir: q('.pf-busca__abrir'),
      buscaCaixa: q('.pf-busca__caixa'),
      buscaCampo: q('.pf-busca__campo'),
      buscaPainel: q('.pf-busca__painel'),
      buscaLista: q('.pf-busca__lista'),
      buscaEstado: q('.pf-busca__estado'),
      buscaStatus: q('.pf-busca__status'),
      buscaMostrar: q('.pf-busca__mostrar-campo'),
      sino: q('.pf-sino'),
      sinoContador: q('.pf-sino__contador'),
      notificacoes: q('#pf-notificacoes'),
      notificacoesTitulo: q('#pf-notificacoes-titulo'),
      notificacoesCorpo: q('.pf-notificacoes__corpo'),
      notificacoesTodas: q('.pf-notificacoes__todas'),
      notificacoesStatus: q('.pf-notificacoes__status'),
      contaBotao: q('.pf-conta__botao'),
      contaPainel: q('#pf-conta-painel')
    };

    ligarEventos();
    aplicarLargura();
    definirAtivo(chaveAtivaDe(ativo));
    atualizarControlesDeAparencia();

    // Faixa, pendências, banners, sino e configurações públicas: só com sessão e fora do restrito.
    if (!restrito && !anonimo && comUI) {
      renderFaixa(); // novidade embutida já conhecida: altura reservada sem esperar a rede
      if (typeof window.ResizeObserver === 'function' && E.el.faixa) new ResizeObserver(medirFaixa).observe(E.el.faixa);
      E.pendenciasPromessa = banner.atualizar();
      notificacoes.atualizar();
      iniciarSondaDoSino();
      carregarConfiguracoes();
    }
  }

  // ---------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------
  let globaisLigados = false;
  function ligarGlobais() {
    if (globaisLigados) return;
    globaisLigados = true;
    window.addEventListener('resize', agendarLargura, { passive: true });
    doc.addEventListener('dmc:tema', aoMudarPreferencia);
    doc.addEventListener('dmc:fonte', aoMudarPreferencia);
  }
  function aoMudarPreferencia() {
    atualizarControlesDeAparencia();
    agendarLargura();
  }

  function ligarEventos() {
    doc.addEventListener('click', aoClicar);
    doc.addEventListener('keydown', aoTeclar);
    doc.addEventListener('focusin', aoFocar);
    doc.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.name === 'pf-tema-preferencia' && t.checked) tema.definir(t.value);
    });
    if (E.el.lateral) {
      // mousemove (e não mouseover): só o movimento real do ponteiro troca a dica; a mudança de
      // layout sob o ponteiro parado (recolher a lateral) não rouba a dica de quem tem o foco.
      E.el.lateral.addEventListener('mousemove', (e) => {
        const it = e.target instanceof Element ? e.target.closest('.pf-menu__item') : null;
        if (it && it !== E.dicaDe) mostrarDica(it, false);
      });
      // A saída do ponteiro só esconde a dica aberta pelo ponteiro (a do foco fica até o foco sair ou Esc).
      E.el.lateral.addEventListener('mouseleave', () => { if (!E.dicaPorFoco) esconderDica(); });
      E.el.lateral.addEventListener('focusin', (e) => {
        const it = e.target instanceof Element ? e.target.closest('.pf-menu__item') : null;
        if (it) mostrarDica(it, true); else esconderDica();
      });
      E.el.lateral.addEventListener('focusout', (e) => {
        if (!E.el.lateral.contains(e.relatedTarget)) esconderDica();
      });
      // Rolagem da lateral (inclusive a que o próprio foco provoca): a dica acompanha o item.
      E.el.lateral.addEventListener('scroll', posicionarDica, { passive: true });
    }
    if (E.el.buscaCampo) ligarBusca();
  }

  function aoClicar(e) {
    if (!E) return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const bf = t.closest('[data-pf-shell-fonte]');
    if (bf) {
      if (bf.getAttribute('aria-disabled') !== 'true') {
        if (bf.getAttribute('data-pf-shell-fonte') === 'mais') fonte.aumentar(); else fonte.diminuir();
      }
      return;
    }
    if (t.closest('[data-pf-shell-tema]')) { tema.alternar(); return; }
    if (t.closest('[data-pf-shell-sair]')) { e.preventDefault(); sair(); return; }
    if (t.closest('[data-pf-shell-tour]')) { fecharPainelAberto(false); tour.iniciar(); return; }
    if (t.closest('[data-pf-shell-recolher]')) { alternarRecolhido(); return; }
    const disp = t.closest('[data-pf-shell-dispensar]');
    if (disp) { banner.dispensar(disp.getAttribute('data-pf-shell-dispensar')); return; }
    if (t.closest('.pf-topo__menu')) { abrirGaveta(); return; }
    if (t.closest('[data-pf-shell-fechar-gaveta]')) { fecharGaveta(true); return; }
    const ramo = t.closest('[data-pf-ramo]');
    if (ramo) { alternarRamo(ramo); return; }
    const titulo = t.closest('.pf-menu__titulo--botao');
    if (titulo) { alternarSecao(titulo); return; }
    if (t.closest('.pf-sino')) { if (E.el.notificacoes && !E.el.notificacoes.hidden) fecharSino(true); else abrirSino(); return; }
    if (t.closest('.pf-notificacoes__fechar')) { fecharSino(true); return; }
    if (t.closest('.pf-notificacoes__todas')) { marcarTodasLidas(); return; }
    if (t.closest('[data-pf-shell-notif-repetir]')) { carregarNotificacoes(); return; }
    const notif = t.closest('[data-pf-notif-id]');
    if (notif) { e.preventDefault(); abrirNotificacao(notif); return; }
    if (t.closest('.pf-conta__botao')) { alternarConta(); return; }
    if (t.closest('.pf-busca__abrir')) { abrirBuscaDialogo(); return; }
    if (t.closest('.pf-busca__cancelar')) { fecharBusca(true); return; }
    if (painelAberto && !painelAberto.painel.contains(t) && !(painelAberto.gatilho && painelAberto.gatilho.contains(t))) {
      fecharPainelAberto(false);
    }
  }

  function aoTeclar(e) {
    if (!E || e.defaultPrevented) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === 'k' && E.el.buscaCampo) {
      e.preventDefault();
      busca.abrir();
      return;
    }
    if (E.gavetaAberta) {
      if (e.key === 'Escape') { e.preventDefault(); fecharGaveta(true); return; }
      prenderFoco(e, E.el.gavetaPainel);
      return;
    }
    if (E.buscaDialogo) {
      if (e.key === 'Escape') { e.preventDefault(); fecharBusca(true); return; }
      prenderFoco(e, E.el.buscaCaixa);
      return;
    }
    if (e.key === 'Escape') {
      const dicaVisivel = E.el.dica && !E.el.dica.hidden;
      if (dicaVisivel) esconderDica();
      if (painelAberto) { e.preventDefault(); fecharPainelAberto(true); }
    }
  }

  function aoFocar(e) {
    if (!E || !painelAberto) return;
    const t = e.target;
    const p = painelAberto;
    if (p.painel.contains(t) || (p.gatilho && p.gatilho.contains(t))) return;
    if (E.el.busca && p.painel === E.el.buscaPainel && E.el.busca.contains(t)) return;
    p.fechar(false);
  }

  async function sair() {
    try {
      const auth = window.DMC_Auth;
      if (auth && typeof auth.signOut === 'function') await auth.signOut();
    } catch { /* a saída continua: o destino é o login */ }
    window.location.href = 'login.html';
  }

  // ---------------------------------------------------------------
  // Gaveta (< 1024): role=dialog modal, foco preso, Esc e véu fecham
  // ---------------------------------------------------------------
  function abrirGaveta() {
    if (!E || !E.el.gaveta || E.gavetaAberta) return;
    fecharPainelAberto(false);
    esconderDica();
    E.gavetaAberta = true;
    const g = E.el.gaveta;
    g.hidden = false;
    raiz.classList.add('dmc-lock');
    doc.body.classList.add('menu-aberto');
    if (E.el.botaoMenu) E.el.botaoMenu.setAttribute('aria-expanded', 'true');
    void g.offsetWidth; // a transição parte do estado fechado
    g.classList.add('is-aberta');
    const atual = E.el.gavetaPainel.querySelector('a[aria-current="page"]');
    const alvo = atual && atual.getClientRects().length ? atual : E.el.gavetaPainel.querySelector('.pf-gaveta__fechar');
    if (alvo) alvo.focus();
  }

  function fecharGaveta(devolverFoco) {
    if (!E || !E.gavetaAberta) return;
    E.gavetaAberta = false;
    const g = E.el.gaveta;
    g.classList.remove('is-aberta');
    if (!E.buscaDialogo) raiz.classList.remove('dmc-lock');
    doc.body.classList.remove('menu-aberto');
    if (E.el.botaoMenu) E.el.botaoMenu.setAttribute('aria-expanded', 'false');
    let duracao = 0;
    try { duracao = parseFloat(window.getComputedStyle(E.el.gavetaPainel).transitionDuration) * 1000 || 0; } catch { duracao = 0; }
    const esconder = () => { if (E && !E.gavetaAberta) g.hidden = true; };
    if (duracao > 20) window.setTimeout(esconder, duracao + 30); else esconder();
    if (devolverFoco && E.el.botaoMenu && E.el.botaoMenu.getClientRects().length) E.el.botaoMenu.focus();
  }

  function alternarSecao(botao) {
    const lista = doc.getElementById(botao.getAttribute('aria-controls'));
    if (!lista) return;
    const aberto = botao.getAttribute('aria-expanded') === 'true';
    botao.setAttribute('aria-expanded', aberto ? 'false' : 'true');
    lista.hidden = aberto;
  }

  // ---------------------------------------------------------------
  // Lateral: recolher, submenu (flyout quando recolhida) e dica
  // ---------------------------------------------------------------
  function alternarRecolhido() {
    const agora = !doc.body.classList.contains('menu-recolhido');
    gravar(CHAVE.recolhido, agora ? '1' : '0');
    aplicarRecolhido();
  }

  function sincronizarRamos() {
    if (!E || !E.el.lateral) return;
    const recolhida = E.el.lateral.classList.contains('is-recolhido');
    E.el.lateral.querySelectorAll('[data-pf-ramo]').forEach((b) => {
      const sub = doc.getElementById(b.getAttribute('aria-controls'));
      if (!sub) return;
      if (recolhida) {
        if (!(E.flyout && E.flyout.botao === b)) { b.setAttribute('aria-expanded', 'false'); sub.hidden = true; }
      } else {
        const escolha = b.dataset.pfAberto;
        const aberto = escolha === '1' || (escolha !== '0' && b.classList.contains('is-atual'));
        b.setAttribute('aria-expanded', aberto ? 'true' : 'false');
        sub.hidden = !aberto;
      }
    });
  }

  function alternarRamo(botao) {
    const sub = doc.getElementById(botao.getAttribute('aria-controls'));
    if (!sub) return;
    const aberto = botao.getAttribute('aria-expanded') === 'true';
    if (botao.closest('.pf-lateral.is-recolhido')) {
      if (aberto) fecharFlyout(true); else abrirFlyout(botao, sub);
      return;
    }
    botao.setAttribute('aria-expanded', aberto ? 'false' : 'true');
    botao.dataset.pfAberto = aberto ? '0' : '1';
    sub.hidden = aberto;
  }

  function abrirFlyout(botao, sub) {
    fecharPainelAberto(false);
    esconderDica();
    sub.hidden = false;
    sub.classList.add('is-flyout');
    const r = botao.getBoundingClientRect();
    const altura = sub.offsetHeight;
    sub.style.top = `${Math.max(8, Math.min(r.top, window.innerHeight - altura - 8))}px`;
    botao.setAttribute('aria-expanded', 'true');
    E.flyout = { botao, sub };
    registrarPainel(sub, botao, fecharFlyout);
    const primeiro = sub.querySelector('a');
    if (primeiro) primeiro.focus();
  }

  function fecharFlyout(devolverFoco) {
    const f = E && E.flyout;
    if (!f) return;
    E.flyout = null;
    f.sub.classList.remove('is-flyout');
    f.sub.style.top = '';
    f.sub.hidden = true;
    f.botao.setAttribute('aria-expanded', 'false');
    soltarPainel(f.sub);
    if (devolverFoco) f.botao.focus();
  }

  function mostrarDica(item, porFoco) {
    if (!E || !E.el.dica || !item.closest('.pf-lateral.is-recolhido') || E.flyout) return;
    const rotulo = item.querySelector('.pf-menu__rotulo');
    const texto = rotulo ? rotulo.textContent.trim() : '';
    if (!texto) return;
    if (E.dicaDe && E.dicaDe !== item) E.dicaDe.removeAttribute('aria-describedby');
    E.el.dica.textContent = texto;
    E.el.dica.hidden = false;
    item.setAttribute('aria-describedby', 'pf-dica');
    E.dicaDe = item;
    E.dicaPorFoco = !!porFoco;
    posicionarDica();
  }

  function posicionarDica() {
    if (!E || !E.el.dica || E.el.dica.hidden || !E.dicaDe) return;
    const r = E.dicaDe.getBoundingClientRect();
    E.el.dica.style.top = `${Math.round(r.top + r.height / 2)}px`;
  }

  function esconderDica() {
    if (!E || !E.el.dica) return;
    E.el.dica.hidden = true;
    E.dicaPorFoco = false;
    if (E.dicaDe) { E.dicaDe.removeAttribute('aria-describedby'); E.dicaDe = null; }
  }

  // ---------------------------------------------------------------
  // Item ativo, contadores e pendências
  // ---------------------------------------------------------------
  function definirAtivo(chave) {
    if (!E) return;
    const c = normalizarChave(chave);
    E.ativo = c || null;
    doc.querySelectorAll('.pf-menu a[data-pf-chave]').forEach((a) => {
      if (c && a.getAttribute('data-pf-chave') === c) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    doc.querySelectorAll('.pf-menu [data-pf-ramo]').forEach((b) => {
      const sub = doc.getElementById(b.getAttribute('aria-controls'));
      const contem = !!(sub && sub.querySelector('[aria-current="page"]'));
      b.classList.toggle('is-atual', contem);
      if (contem && !b.closest('.pf-lateral.is-recolhido')) {
        b.setAttribute('aria-expanded', 'true');
        sub.hidden = false;
      }
    });
    // Gaveta: abre o grupo do item atual (o primeiro, se nenhum for o atual).
    const botoes = Array.from(doc.querySelectorAll('.pf-gaveta .pf-menu__titulo--botao'));
    let algum = false;
    botoes.forEach((b) => {
      const lista = doc.getElementById(b.getAttribute('aria-controls'));
      if (lista && lista.querySelector('[aria-current="page"]')) {
        b.setAttribute('aria-expanded', 'true');
        lista.hidden = false;
        algum = true;
      }
    });
    if (!algum && botoes[0] && !botoes.some((b) => b.getAttribute('aria-expanded') === 'true')) {
      const lista = doc.getElementById(botoes[0].getAttribute('aria-controls'));
      botoes[0].setAttribute('aria-expanded', 'true');
      if (lista) lista.hidden = false;
    }
    sincronizarRamos();
  }

  function itensDaChave(chave) {
    const c = normalizarChave(chave);
    return Array.from(doc.querySelectorAll('.pf-menu [data-pf-chave]')).filter((el) => el.getAttribute('data-pf-chave') === c);
  }

  function definirContador(chave, n) {
    if (!E) return;
    const valor = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    itensDaChave(chave).forEach((it) => {
      const alvo = it.querySelector('.pf-menu__contagem');
      if (!alvo) return;
      if (!valor) { alvo.hidden = true; alvo.replaceChildren(); return; }
      const rotulo = alvo.getAttribute('data-pf-contagem-rotulo') || 'na fila';
      alvo.replaceChildren(nos(html`<span aria-hidden="true">${String(valor)}</span><span class="dmc-sr-only">${`, ${valor} ${rotulo}`}</span>`));
      alvo.hidden = false;
    });
  }

  function definirPendencia(chave, temPendencia) {
    if (!E) return;
    itensDaChave(chave).forEach((it) => {
      const p = it.querySelector('.pf-menu__ponto');
      if (p) p.hidden = !temPendencia;
    });
    // O ramo (Documentação) herda o aviso dos filhos.
    doc.querySelectorAll('.pf-menu [data-pf-ramo]').forEach((b) => {
      const sub = doc.getElementById(b.getAttribute('aria-controls'));
      const herda = !!(sub && sub.querySelector('.pf-menu__ponto:not([hidden])'));
      const p = b.querySelector('.pf-menu__ponto');
      if (p) p.hidden = !herda;
    });
  }

  function aplicarPendenciasNoMenu() {
    const c = (E && E.pendencias && E.pendencias.contadores) || {};
    const positivo = (v) => typeof v === 'number' && v > 0;
    definirPendencia('financeiro', positivo(c.lancamentosAtrasados));
    definirPendencia('documentos', positivo(c.documentosPendentes) || positivo(c.documentosNaoEnviados));
    definirPendencia('contratos', positivo(c.contratosPendentes));
  }

  // ---------------------------------------------------------------
  // Faixa do topo (UX §5.2): pendência > novidade embutida > banners
  // ---------------------------------------------------------------
  function candidatosDaFaixa() {
    const lista = [];
    if (E.area === 'aluno' && E.pendencias && Array.isArray(E.pendencias.avisos)) {
      for (const a of E.pendencias.avisos) {
        if (!a || a.dispensavel !== false || !a.texto) continue;
        lista.push({ id: `aviso-${a.id}`, tipo: 'pendencia', texto: String(a.texto), href: hrefSeguro(a.href), rotulo: a.rotulo ? String(a.rotulo) : 'Ver', dispensavel: false });
      }
    }
    lista.push({
      id: ID_NOVIDADE,
      tipo: 'novidade',
      texto: 'Conheça o novo portal.',
      href: E.area === 'backoffice' ? 'professor.html#/ajuda' : 'tutoriais.html#novo-portal',
      rotulo: 'Ver o que mudou',
      dispensavel: true
    });
    if (E.area === 'aluno') {
      for (const b of E.banners || []) {
        if (!b || b.id == null) continue;
        const texto = encurtar(b.texto || b.titulo, LIMITE_FAIXA);
        if (!texto) continue;
        const link = String(b.link || '');
        const href = hrefSeguro(link) || (/^https:\/\/[^\s]+$/i.test(link) ? link : null);
        lista.push({ id: `banner-${b.id}`, tipo: 'banner', texto, href, rotulo: null, externo: !!href && /^https:/i.test(href), dispensavel: true });
      }
    }
    return lista.filter((c) => !c.dispensavel || ler(CHAVE.banner(c.id)) !== '1');
  }

  function renderFaixa() {
    if (!E || !E.el.faixa) return;
    const f = E.el.faixa;
    const aviso = candidatosDaFaixa()[0] || null;
    E.avisoAtual = aviso;
    if (!aviso) {
      f.hidden = true;
      f.replaceChildren();
      f.className = 'pf-faixa';
      medirFaixa();
      return;
    }
    f.className = `pf-faixa pf-faixa--${aviso.tipo === 'pendencia' ? 'pendencia' : 'novidade'}`;
    const link = aviso.href
      ? (aviso.rotulo
        ? html` <a class="pf-faixa__link" href="${aviso.href}">${aviso.rotulo}</a>`
        : '')
      : '';
    const texto = aviso.href && !aviso.rotulo
      ? html`<a class="pf-faixa__link" href="${aviso.href}"${aviso.externo ? cru(' rel="noopener noreferrer"') : ''}>${aviso.texto}</a>`
      : aviso.texto;
    f.replaceChildren(nos(html`<div class="pf-faixa__conteudo">
      ${aviso.tipo === 'pendencia' ? html`<span class="pf-faixa__glifo">${icone('estadoAviso')}</span>` : ''}
      <p class="pf-faixa__texto">${texto}${link}</p>
      ${aviso.dispensavel ? html`<button type="button" class="pf-faixa__fechar pf-btn-icone" data-pf-shell-dispensar="${aviso.id}" aria-label="Dispensar aviso">${icone('fechar')}</button>` : ''}
    </div>`));
    f.hidden = false;
    medirFaixa();
  }

  const banner = {
    async atualizar() {
      if (!E || E.restrito || E.anonimo || E.modo === 'foco' || !E.el.faixa) return;
      if (E.area === 'aluno') {
        const [p, b] = await Promise.all([obter(API.pendencias), obter(API.bannersTopo)]);
        E.pendencias = p.dados && typeof p.dados === 'object' ? p.dados : null;
        E.banners = b.dados && Array.isArray(b.dados.itens) ? b.dados.itens : [];
        aplicarPendenciasNoMenu();
      }
      renderFaixa();
    },
    dispensar(id) {
      if (!E || !id) return;
      const alvo = candidatosDaFaixa().find((c) => c.id === id);
      if (alvo && !alvo.dispensavel) return;
      const tinhaFoco = !!(E.el.faixa && E.el.faixa.contains(doc.activeElement));
      gravar(CHAVE.banner(id), '1');
      renderFaixa();
      if (tinhaFoco) {
        const proximo = E.el.faixa && !E.el.faixa.hidden ? E.el.faixa.querySelector('a, button') : null;
        const main = doc.getElementById('conteudo') || doc.querySelector('main');
        if (proximo) proximo.focus(); else if (main) main.focus();
      }
    }
  };

  // ---------------------------------------------------------------
  // Sino e painel de notificações (UX §5.2)
  // ---------------------------------------------------------------
  function pintarContador(n) {
    if (!E || !E.el.sino) return;
    const c = E.el.sinoContador;
    if (typeof n === 'number' && n > 0) {
      // WCAG 2.5.3: o nome acessível contém o número visível no contador
      // ("9+" -> "mais de 9"), para não divergir do que se vê no ícone.
      const visivel = n > 9 ? '9+' : String(n);
      c.textContent = visivel;
      c.hidden = false;
      const quantidade = n > 9 ? 'mais de 9 não lidas' : `${n} ${n === 1 ? 'não lida' : 'não lidas'}`;
      E.el.sino.setAttribute('aria-label', `Notificações, ${quantidade}`);
    } else {
      c.textContent = '';
      c.hidden = true;
      E.el.sino.setAttribute('aria-label', 'Notificações');
    }
  }

  function definirNaoLidas(valor) {
    pintarContador(valor);
    if (valor !== E.naoLidas) {
      E.naoLidas = valor;
      doc.dispatchEvent(new CustomEvent('dmc:notificacoes', { detail: { naoLidas: valor } }));
    }
  }

  const notificacoes = {
    async atualizar() {
      if (!E || !E.el.sino || E.restrito || E.anonimo) return null;
      if (E.sinoAusente) return null;
      const r = await obter(API.notificacoesResumo);
      if (r.ausente) { E.sinoAusente = true; definirNaoLidas(null); return null; }
      if (r.erro || !r.dados) return null;
      const n = Number(r.dados.naoLidas);
      const valor = Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
      definirNaoLidas(valor);
      return valor;
    },
    abrir() { abrirSino(); },
    fechar() { fecharSino(true); }
  };

  let sondaLigada = false;
  let ultimaSonda = 0;
  function iniciarSondaDoSino() {
    if (sondaLigada || !E || !E.el.sino) return;
    sondaLigada = true;
    const sondar = () => {
      if (!E || E.sinoAusente || doc.visibilityState !== 'visible') return;
      if (Date.now() - ultimaSonda < 5000) return;
      ultimaSonda = Date.now();
      notificacoes.atualizar();
    };
    window.setInterval(sondar, ATUALIZAR_SINO_MS);
    doc.addEventListener('visibilitychange', sondar);
    window.addEventListener('focus', sondar);
    window.addEventListener('pageshow', (e) => { if (e.persisted) sondar(); });
  }

  async function abrirSino() {
    if (!E || !E.el.notificacoes) return;
    const p = E.el.notificacoes;
    registrarPainel(p, E.el.sino, fecharSino);
    p.hidden = false;
    E.el.sino.setAttribute('aria-expanded', 'true');
    encaixarNaJanela(p);
    E.el.notificacoesTitulo.focus();
    await carregarNotificacoes();
  }

  function fecharSino(devolverFoco) {
    if (!E || !E.el.notificacoes || E.el.notificacoes.hidden) return;
    E.el.notificacoes.hidden = true;
    E.el.sino.setAttribute('aria-expanded', 'false');
    soltarPainel(E.el.notificacoes);
    if (devolverFoco) E.el.sino.focus();
  }

  async function carregarNotificacoes() {
    const corpo = E.el.notificacoesCorpo;
    corpo.setAttribute('aria-busy', 'true');
    corpo.replaceChildren(nos(html`${esqueletoLinhas(3)}<span class="dmc-sr-only">Carregando notificações</span>`));
    const r = await obter(API.notificacoes);
    if (!E || E.el.notificacoes.hidden) return;
    corpo.setAttribute('aria-busy', 'false');
    E.el.notificacoesTodas.hidden = true;
    if (r.ausente) {
      E.sinoAusente = true;
      definirNaoLidas(null);
      corpo.replaceChildren(nos(html`<p class="pf-notificacoes__vazio">Notificações indisponíveis no momento.</p>`));
      return;
    }
    if (r.erro || !r.dados) {
      corpo.replaceChildren(nos(html`<div class="pf-notificacoes__erro"><p>Não foi possível carregar.</p><button type="button" class="dmc-btn dmc-btn--link" data-pf-shell-notif-repetir>Tentar de novo</button></div>`));
      return;
    }
    const itens = (Array.isArray(r.dados.itens) ? r.dados.itens : []).slice(0, 10);
    const n = Number(r.dados.naoLidas);
    if (Number.isFinite(n) && n >= 0) definirNaoLidas(Math.floor(n));
    if (!itens.length) {
      corpo.replaceChildren(nos(html`<p class="pf-notificacoes__vazio">Nenhuma notificação por enquanto.</p>`));
      return;
    }
    E.el.notificacoesTodas.hidden = !itens.some((i) => !i.lida);
    corpo.replaceChildren(nos(html`<ul class="pf-notificacoes__lista">${itens.map(htmlNotificacao)}</ul>`));
  }

  function htmlNotificacao(n) {
    const href = hrefSeguro(n.link);
    const classe = n.lida ? 'pf-notificacao' : 'pf-notificacao pf-notificacao--nao-lida';
    const corpo = html`<span class="pf-notificacao__titulo">${n.titulo || 'Notificação'}${n.lida ? '' : html`<span class="dmc-sr-only">, não lida</span>`}</span>
      ${n.texto ? html`<span class="pf-notificacao__texto">${n.texto}</span>` : ''}
      ${n.criadaEm ? html`<time class="pf-notificacao__quando" datetime="${n.criadaEm}">${dataRelativa(n.criadaEm)}<span class="dmc-sr-only">${`, ${dataAbsoluta(n.criadaEm)}`}</span></time>` : ''}`;
    return href
      ? html`<li><a class="${classe}" href="${href}" data-pf-notif-id="${n.id}" data-pf-notif-lida="${n.lida ? '1' : '0'}">${corpo}</a></li>`
      : html`<li><button type="button" class="${classe}" data-pf-notif-id="${n.id}" data-pf-notif-lida="${n.lida ? '1' : '0'}">${corpo}</button></li>`;
  }

  async function abrirNotificacao(el) {
    const id = el.getAttribute('data-pf-notif-id');
    const lida = el.getAttribute('data-pf-notif-lida') === '1';
    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    if (id && !lida) {
      await Promise.race([enviarPost(API.notificacaoLida(id)), new Promise((ok) => window.setTimeout(ok, 800))]);
    }
    if (href) { window.location.href = href; return; }
    await carregarNotificacoes();
    notificacoes.atualizar();
  }

  async function marcarTodasLidas() {
    const b = E.el.notificacoesTodas;
    b.setAttribute('aria-busy', 'true');
    const r = await enviarPost(API.notificacoesLidas);
    b.removeAttribute('aria-busy');
    if (r.dados) {
      E.el.notificacoesStatus.textContent = 'Notificações marcadas como lidas.';
      await carregarNotificacoes();
      definirNaoLidas(0);
      E.el.notificacoesTitulo.focus();
    } else {
      E.el.notificacoesStatus.textContent = 'Não foi possível marcar as notificações agora.';
    }
  }

  // ---------------------------------------------------------------
  // Conta (disclosure, não role=menu)
  // ---------------------------------------------------------------
  function alternarConta() {
    const p = E.el.contaPainel;
    if (!p) return;
    if (!p.hidden) { fecharConta(true); return; }
    registrarPainel(p, E.el.contaBotao, fecharConta);
    p.hidden = false;
    E.el.contaBotao.setAttribute('aria-expanded', 'true');
    encaixarNaJanela(p);
    atualizarControlesDeAparencia();
  }
  function fecharConta(devolverFoco) {
    const p = E && E.el.contaPainel;
    if (!p || p.hidden) return;
    p.hidden = true;
    E.el.contaBotao.setAttribute('aria-expanded', 'false');
    soltarPainel(p);
    if (devolverFoco) E.el.contaBotao.focus();
  }

  // ---------------------------------------------------------------
  // Busca global com filtros (UX §5.2; combobox ARIA 1.2)
  // ---------------------------------------------------------------
  const B = { termo: '', tipo: 'tudo', seq: 0, timer: 0, opcoes: [], ativa: -1, controlador: null };
  const ROTULO_TIPO = { cursos: 'Cursos', aulas: 'Aulas', publicacoes: 'Publicações', atendimentos: 'Atendimentos', documentos: 'Documentos' };
  const ICONE_TIPO = { cursos: 'navMeusCursos', aulas: 'play', publicacoes: 'navPublicacoes', atendimentos: 'navAtendimento', documentos: 'tipoDocumento' };
  const ORDEM_TIPOS = ['cursos', 'aulas', 'publicacoes', 'atendimentos', 'documentos'];

  function ligarBusca() {
    const campo = E.el.buscaCampo;
    campo.addEventListener('input', () => { B.termo = campo.value; agendarBusca(); });
    campo.addEventListener('keydown', teclaNaBusca);
    campo.addEventListener('focus', () => {
      if (B.termo.trim().length >= 2 && B.opcoes.length) abrirPainelBusca();
    });
    E.el.buscaPainel.addEventListener('click', (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      const tipo = t.closest('[data-pf-busca-tipo]');
      if (tipo) { definirTipo(tipo.getAttribute('data-pf-busca-tipo'), true); return; }
      if (t.closest('[data-pf-busca-repetir]')) { executarBusca(B.termo.trim()); return; }
      const op = t.closest('[role="option"]');
      if (op) escolherOpcao(Number(op.getAttribute('data-pf-indice')));
    });
    // Clique numa opção não tira o foco do campo (senão o focusout fecha o painel antes do click).
    E.el.buscaPainel.addEventListener('mousedown', (e) => {
      if (e.target instanceof Element && e.target.closest('[role="option"]')) e.preventDefault();
    });
    E.el.buscaPainel.addEventListener('mousemove', (e) => {
      const op = e.target instanceof Element ? e.target.closest('[role="option"]') : null;
      if (op) ativarOpcao(Number(op.getAttribute('data-pf-indice')), false);
    });
    if (E.el.buscaMostrar) E.el.buscaMostrar.addEventListener('change', () => definirTipo(E.el.buscaMostrar.value, true));
    E.el.busca.addEventListener('focusout', (e) => {
      if (E.buscaDialogo) return;
      if (!E.el.busca.contains(e.relatedTarget)) fecharPainelBusca();
    });
  }

  function definirTipo(tipo, buscar) {
    const validos = Array.from(E.el.buscaPainel.querySelectorAll('[data-pf-busca-tipo]')).map((b) => b.getAttribute('data-pf-busca-tipo'));
    if (validos.indexOf(tipo) < 0) return;
    B.tipo = tipo;
    E.el.buscaPainel.querySelectorAll('[data-pf-busca-tipo]').forEach((b) => {
      b.setAttribute('aria-pressed', b.getAttribute('data-pf-busca-tipo') === tipo ? 'true' : 'false');
    });
    if (E.el.buscaMostrar) E.el.buscaMostrar.value = tipo;
    if (buscar && B.termo.trim().length >= 2) executarBusca(B.termo.trim());
  }

  function agendarBusca() {
    window.clearTimeout(B.timer);
    const termo = B.termo.trim();
    if (termo.length < 2) {
      B.seq++;
      if (B.controlador) B.controlador.abort();
      limparResultados();
      if (!E.buscaDialogo) fecharPainelBusca();
      return;
    }
    B.timer = window.setTimeout(() => executarBusca(termo), 200);
  }

  function limparResultados() {
    B.opcoes = [];
    B.ativa = -1;
    E.el.buscaLista.replaceChildren();
    E.el.buscaLista.hidden = true; // listbox vazio não fica exposto (aria-required-children)
    E.el.buscaEstado.hidden = true;
    E.el.buscaEstado.replaceChildren();
    E.el.buscaStatus.textContent = '';
    E.el.buscaCampo.removeAttribute('aria-activedescendant');
  }

  function painelBuscaAberto() { return !E.el.buscaPainel.hidden; }

  function abrirPainelBusca() {
    if (painelBuscaAberto()) return;
    E.el.buscaPainel.hidden = false;
    E.el.buscaCampo.setAttribute('aria-expanded', 'true');
    if (!E.buscaDialogo) {
      registrarPainel(E.el.buscaPainel, E.el.buscaCampo, (devolver) => {
        fecharPainelBusca();
        if (devolver) E.el.buscaCampo.focus();
      });
      encaixarNaJanela(E.el.buscaPainel);
    }
  }

  function fecharPainelBusca() {
    if (!E || !E.el.buscaPainel) return;
    E.el.buscaPainel.hidden = true;
    E.el.buscaCampo.setAttribute('aria-expanded', 'false');
    E.el.buscaCampo.removeAttribute('aria-activedescendant');
    B.ativa = -1;
    E.el.buscaLista.querySelectorAll('[aria-selected="true"]').forEach((o) => o.setAttribute('aria-selected', 'false'));
    soltarPainel(E.el.buscaPainel);
  }

  /** Painel ancorado no topo que passaria da borda da janela: desloca (translate, sem animar). */
  function encaixarNaJanela(painel) {
    if (!painel) return;
    painel.style.translate = '';
    if (raiz.getAttribute('data-pf-larg') === 'p' && painel === E.el.notificacoes) return; // tela cheia no celular
    const r = painel.getBoundingClientRect();
    const margem = 8;
    let d = 0;
    if (r.right > window.innerWidth - margem) d = window.innerWidth - margem - r.right;
    if (r.left + d < margem) d = margem - r.left;
    if (d) painel.style.translate = `${Math.round(d)}px 0`;
  }

  function abrirBuscaDialogo() {
    if (!E || !E.el.buscaCaixa) return;
    fecharPainelAberto(false);
    E.buscaDialogo = true;
    const cx = E.el.buscaCaixa;
    cx.setAttribute('role', 'dialog');
    cx.setAttribute('aria-modal', 'true');
    cx.setAttribute('aria-label', 'Buscar');
    cx.classList.add('is-dialogo');
    E.el.buscaAbrir.setAttribute('aria-expanded', 'true');
    raiz.classList.add('dmc-lock');
    abrirPainelBusca();
    E.el.buscaCampo.focus();
  }

  function fecharBusca(devolverFoco) {
    if (!E || !E.el.buscaCaixa) return;
    if (E.buscaDialogo) {
      E.buscaDialogo = false;
      const cx = E.el.buscaCaixa;
      cx.removeAttribute('role');
      cx.removeAttribute('aria-modal');
      cx.removeAttribute('aria-label');
      cx.classList.remove('is-dialogo');
      E.el.buscaAbrir.setAttribute('aria-expanded', 'false');
      if (!E.gavetaAberta) raiz.classList.remove('dmc-lock');
      fecharPainelBusca();
      if (devolverFoco && E.el.buscaAbrir.getClientRects().length) E.el.buscaAbrir.focus();
      return;
    }
    fecharPainelBusca();
    if (devolverFoco) E.el.buscaCampo.focus();
  }

  function teclaNaBusca(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!B.opcoes.length) return;
      e.preventDefault();
      abrirPainelBusca();
      const n = B.opcoes.length;
      const passo = e.key === 'ArrowDown' ? 1 : -1;
      const prox = B.ativa < 0 ? (passo > 0 ? 0 : n - 1) : (B.ativa + passo + n) % n;
      ativarOpcao(prox, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (B.ativa >= 0) { escolherOpcao(B.ativa); return; }
      const termo = B.termo.trim();
      if (termo.length >= 2) {
        window.clearTimeout(B.timer);
        executarBusca(termo);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (E.buscaDialogo) { fecharBusca(true); return; }
      E.el.buscaCampo.value = '';
      B.termo = '';
      B.seq++;
      limparResultados();
      fecharPainelBusca();
    }
  }

  function ativarOpcao(i, rolar) {
    const lista = E.el.buscaLista;
    lista.querySelectorAll('[role="option"]').forEach((o) => o.setAttribute('aria-selected', 'false'));
    const op = lista.querySelector(`[data-pf-indice="${i}"]`);
    if (!op) { B.ativa = -1; E.el.buscaCampo.removeAttribute('aria-activedescendant'); return; }
    B.ativa = i;
    op.setAttribute('aria-selected', 'true');
    E.el.buscaCampo.setAttribute('aria-activedescendant', op.id);
    if (rolar && typeof op.scrollIntoView === 'function') op.scrollIntoView({ block: 'nearest' });
  }

  function escolherOpcao(i) {
    const op = B.opcoes[i];
    if (!op || !op.href) return;
    if (typeof op.antes === 'function') { try { op.antes(); } catch { /* segue para o destino */ } }
    window.location.href = op.href;
  }

  function mostrarEstadoBusca(tipo, termo) {
    E.el.buscaLista.replaceChildren();
    E.el.buscaLista.hidden = true;
    B.opcoes = [];
    B.ativa = -1;
    E.el.buscaCampo.removeAttribute('aria-activedescendant');
    const est = E.el.buscaEstado;
    est.hidden = false;
    est.setAttribute('aria-busy', tipo === 'carregando' ? 'true' : 'false');
    if (tipo === 'carregando') {
      est.replaceChildren(nos(html`${esqueletoLinhas(3)}<span class="dmc-sr-only">Buscando</span>`));
      return;
    }
    if (tipo === 'vazio') {
      const extra = E.area === 'backoffice' ? ' ou busque pelo código da aula, ex.: APE-M01-A01' : '';
      const msg = `Nada encontrado para "${termo}". Tente outro termo${extra}${extra ? ', ou mude o filtro.' : ' ou mude o filtro.'}`;
      est.replaceChildren(nos(html`<p class="pf-busca__vazio">${msg}</p>`));
      E.el.buscaStatus.textContent = 'Nenhum resultado.';
      return;
    }
    if (tipo === 'indisponivel') {
      est.replaceChildren(nos(html`<p class="pf-busca__vazio">A busca não está disponível no momento.</p>`));
      E.el.buscaStatus.textContent = 'A busca não está disponível no momento.';
      return;
    }
    est.replaceChildren(nos(html`<div class="pf-busca__erro"><p>A busca não respondeu. Tente de novo.</p><button type="button" class="dmc-btn dmc-btn--link" data-pf-busca-repetir>Tentar de novo</button></div>`));
    E.el.buscaStatus.textContent = 'A busca não respondeu.';
  }

  async function executarBusca(termo) {
    if (!E || !E.el.buscaCampo) return;
    const seq = ++B.seq;
    if (B.controlador) B.controlador.abort();
    B.controlador = typeof AbortController === 'function' ? new AbortController() : null;
    abrirPainelBusca();
    mostrarEstadoBusca('carregando');
    const tipos = B.tipo === 'tudo' ? '' : `&tipos=${encodeURIComponent(B.tipo)}`;
    const api = window.DMC_Api;
    let r;
    try {
      if (!api || typeof api.get !== 'function') throw Object.assign(new Error('Rota não encontrada.'), { status: 404 });
      const dados = await api.get(`${API.busca}?q=${encodeURIComponent(termo)}${tipos}&limite=5`, { silencioso404: true, sinal: B.controlador ? B.controlador.signal : undefined });
      r = dados == null ? { ausente: true } : { dados };
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      r = ehAusente(err) ? { ausente: true } : { erro: err };
    }
    if (seq !== B.seq || !E) return;
    let grupos = null;
    if (r.dados && r.dados.grupos && typeof r.dados.grupos === 'object') {
      grupos = ORDEM_TIPOS.filter((t) => r.dados.grupos[t]).map((t) => ({
        tipo: t,
        temMais: !!r.dados.grupos[t].temMais,
        itens: (Array.isArray(r.dados.grupos[t].itens) ? r.dados.grupos[t].itens : [])
          .map((i) => ({ titulo: i.titulo, contexto: i.contexto, href: hrefSeguro(i.href), bloqueado: !!i.bloqueado }))
          .filter((i) => i.href)
      }));
    } else if (r.ausente) {
      grupos = buscaLocal(termo);
      if (!grupos) { mostrarEstadoBusca('indisponivel'); return; }
    } else {
      mostrarEstadoBusca('erro');
      return;
    }
    desenharResultados(termo, grupos);
  }

  /** Sem a rota da F0t: cursos e aulas do catálogo já carregado (comportamento do shell legado). */
  function buscaLocal(termo) {
    const Data = window.DMC_Data;
    if (!Data || typeof Data.get !== 'function') return null;
    const cursos = ((Data.get() || {}).cursos) || [];
    if (!cursos.length) return null;
    const alvo = normalizar(termo);
    const libs = window.DMC_Liberacoes;
    const liberado = (id) => !!(libs && typeof libs.has === 'function' && libs.has(id));
    const querCursos = B.tipo === 'tudo' || B.tipo === 'cursos';
    const querAulas = B.tipo === 'tudo' || B.tipo === 'aulas';
    const gc = [];
    const ga = [];
    for (const c of cursos) {
      const ok = liberado(c.id);
      const loja = `loja.html?destacar=${encodeURIComponent(c.id)}`;
      if (querCursos && normalizar(c.titulo).includes(alvo)) {
        gc.push({
          titulo: c.titulo, contexto: 'Curso', bloqueado: !ok,
          href: ok ? 'dashboard.html' : loja,
          antes: ok && typeof Data.setCursoEscolhido === 'function' ? () => Data.setCursoEscolhido(c.id) : null
        });
      }
      if (querAulas) {
        for (const m of c.modulos || []) {
          for (const a of m.aulas || []) {
            if (!normalizar(a.titulo).includes(alvo)) continue;
            ga.push({
              titulo: a.titulo, contexto: `${c.titulo} · Módulo ${m.numero}`, bloqueado: !ok,
              href: ok ? `aula.html?id=${encodeURIComponent(a.id)}` : loja
            });
          }
        }
      }
    }
    return [
      { tipo: 'cursos', itens: gc.slice(0, 8), temMais: false },
      { tipo: 'aulas', itens: ga.slice(0, 8), temMais: false }
    ].filter((g) => g.itens.length);
  }

  function marcarTermo(titulo, termo) {
    const t = String(titulo || '').normalize('NFC');
    const n = normalizar(t);
    const alvo = normalizar(String(termo || '').trim());
    if (!alvo || n.length !== t.length) return t;
    const partes = [];
    let i = 0;
    let k = n.indexOf(alvo, i);
    while (k >= 0) {
      partes.push(t.slice(i, k));
      partes.push(html`<mark class="pf-busca__marca">${t.slice(k, k + alvo.length)}</mark>`);
      i = k + alvo.length;
      k = n.indexOf(alvo, i);
    }
    partes.push(t.slice(i));
    return partes;
  }

  function desenharResultados(termo, grupos) {
    const total = grupos.reduce((s, g) => s + g.itens.length, 0);
    if (!total) { mostrarEstadoBusca('vazio', termo); return; }
    E.el.buscaEstado.hidden = true;
    E.el.buscaEstado.replaceChildren();
    const opcoes = [];
    const blocos = grupos.map((g) => {
      const idG = `pf-busca-g-${g.tipo}`;
      const linhas = g.itens.map((it) => {
        const i = opcoes.length;
        opcoes.push(it);
        return html`<div class="pf-busca__opcao" role="option" id="${`pf-busca-op-${i}`}" data-pf-indice="${String(i)}" aria-selected="false">
          <span class="pf-busca__opcao-icone">${icone(ICONE_TIPO[g.tipo] || 'ponto')}</span>
          <span class="pf-busca__opcao-texto">
            <span class="pf-busca__opcao-titulo">${marcarTermo(it.titulo, termo)}</span>
            ${it.contexto ? html`<span class="pf-busca__opcao-contexto">${it.contexto}</span>` : ''}
          </span>
          ${it.bloqueado ? html`<span class="pf-busca__opcao-cadeado">${icone('cadeado')}<span class="dmc-sr-only">, curso não liberado</span></span>` : ''}
        </div>`;
      });
      if (g.temMais) {
        const i = opcoes.length;
        const href = `busca.html?q=${encodeURIComponent(termo)}&tipo=${encodeURIComponent(g.tipo)}`;
        opcoes.push({ href, titulo: `Ver todos os resultados de ${ROTULO_TIPO[g.tipo]}` });
        linhas.push(html`<div class="pf-busca__opcao pf-busca__opcao--todos" role="option" id="${`pf-busca-op-${i}`}" data-pf-indice="${String(i)}" aria-selected="false"><span class="pf-busca__opcao-titulo">${`Ver todos os resultados de ${ROTULO_TIPO[g.tipo]}`}</span>${icone('seta')}</div>`);
      }
      return html`<div class="pf-busca__grupo" role="group" aria-labelledby="${idG}"><p class="pf-busca__grupo-titulo" id="${idG}" role="presentation">${ROTULO_TIPO[g.tipo] || g.tipo}</p>${linhas}</div>`;
    });
    B.opcoes = opcoes;
    B.ativa = -1;
    E.el.buscaLista.replaceChildren(nos(html`${blocos}`));
    E.el.buscaLista.hidden = false;
    E.el.buscaCampo.removeAttribute('aria-activedescendant');
    E.el.buscaStatus.textContent = total === 1 ? '1 resultado' : `${total} resultados`;
  }

  const busca = {
    abrir(opcoes) {
      if (!E || !E.el.buscaCampo) return;
      const o = opcoes || {};
      if (o.tipo) definirTipo(String(o.tipo), false);
      if (typeof o.termo === 'string') { E.el.buscaCampo.value = o.termo; B.termo = o.termo; }
      if (raiz.getAttribute('data-pf-larg') === 'p') abrirBuscaDialogo();
      else E.el.buscaCampo.focus();
      const termo = B.termo.trim();
      if (termo.length >= 2) executarBusca(termo);
    }
  };

  // ---------------------------------------------------------------
  // Rodapé: encarregado de dados da configuração (nunca inventado)
  // ---------------------------------------------------------------
  async function carregarConfiguracoes() {
    if (!E || E.restrito || E.anonimo) return;
    const r = await obter(API.configuracoesPublicas);
    const enc = r.dados && r.dados.encarregado;
    if (!E || !enc || !enc.nome || !E.el.rodape) return;
    const alvo = E.el.rodape.querySelector('.pf-rodape__encarregado');
    if (!alvo) return;
    const canal = String(enc.canalUrl || '');
    const email = String(enc.email || '');
    const externo = /^https:\/\/\S+$/i.test(canal);
    const href = externo ? canal : (/^[^\s@<>"']+@[^\s@<>"']+$/.test(email) ? `mailto:${email}` : 'meus-dados.html');
    const texto = `Encarregado de dados: ${enc.nome}${email ? ` · ${email}` : ''}`;
    alvo.replaceChildren(nos(html`<a class="pf-rodape__link" href="${href}"${externo ? cru(' rel="noopener noreferrer"') : ''}>${texto}</a>`));
  }

  // ---------------------------------------------------------------
  // Tour (js/portal/tour.js sob demanda; UX §5.7)
  // ---------------------------------------------------------------
  let motorTour = null;
  let carregandoTour = null;
  function carregarMotorDoTour() {
    if (motorTour) return Promise.resolve(motorTour);
    if (carregandoTour) return carregandoTour;
    carregandoTour = new Promise((ok) => {
      const aoRegistrar = (e) => { if (e.detail && typeof e.detail.executar === 'function') motorTour = e.detail; };
      doc.addEventListener('dmc:tour:motor', aoRegistrar);
      const fim = () => { doc.removeEventListener('dmc:tour:motor', aoRegistrar); carregandoTour = null; ok(motorTour); };
      const src = `${CAMINHO_TOUR}?v=${VERSAO_TOUR}`;
      const ui = window.DMC_UI;
      if (ui && typeof ui.carregarScript === 'function') {
        ui.carregarScript(src).then(fim, fim);
      } else {
        const s = doc.createElement('script');
        s.src = src;
        s.async = true;
        s.addEventListener('load', fim, { once: true });
        s.addEventListener('error', fim, { once: true });
        doc.head.appendChild(s);
      }
    });
    return carregandoTour;
  }

  const tour = {
    async iniciar(chave, opcoes) {
      const k = chave || 'primeiro-acesso';
      const o = opcoes || {};
      if (!E || E.restrito || E.anonimo || E.modo === 'foco' || E.tourAtivo) return;
      if (o.automatico) {
        if (tour.jaVisto(k)) return;
        try { await E.pendenciasPromessa; } catch { /* sem pendências conhecidas */ }
        const c = E.pendencias && E.pendencias.contadores;
        if (c && typeof c.contratosPendentes === 'number' && c.contratosPendentes > 0) return;
      }
      const motor = await carregarMotorDoTour();
      if (!motor || !E) return;
      fecharPainelAberto(false);
      fecharGaveta(false);
      fecharBusca(false);
      E.tourAtivo = true;
      try {
        await motor.executar({ chave: k, area: E.area, papel: E.papel, largura: raiz.getAttribute('data-pf-larg') || 'x' });
      } finally {
        E.tourAtivo = false;
        const u = E.user || usuario();
        gravar(CHAVE.tour(k, u && u.id), '1');
      }
    },
    jaVisto(chave) {
      const u = (E && E.user) || usuario();
      return ler(CHAVE.tour(chave || 'primeiro-acesso', u && u.id)) === '1';
    }
  };

  // ---------------------------------------------------------------
  // API pública (§7.6)
  // ---------------------------------------------------------------
  window.DMC_Shell = {
    montar,
    definirAtivo,
    definirContador,
    definirPendencia,
    notificacoes,
    tema,
    fonte,
    busca,
    banner,
    tour
  };
})();
