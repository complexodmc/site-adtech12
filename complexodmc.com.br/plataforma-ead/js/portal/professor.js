/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/professor.js (F8)
   Spec: docs/dmc/PORTAL-ACADEMICO.md §7.8 (DMC_Professor), §6.2,
   §6.3, §7.10 (moldura), D-65, D-66, D-74, D-75; PORTAL-UX.md §5.4
   (menu do backoffice), §7.1 (casca, rotas e permissões), §7.4–§7.5
   (molduras de turma e aluno), §7.21 (área da coordenação).

   CONTRATO (§7.8; só acréscimos opcionais)
     DMC_Professor.registrar({ rota, titulo, papeis, montar, resumo?, pai?, aba? })
     DMC_Professor.iniciar()               só com body[data-pagina="professor"] (D-66)
     DMC_Professor.navegar(rota, filtros?)
     DMC_Professor.MENU_ESTATICO           menus da UX §5.4
     DMC_Professor.itensDoMenu(papel)      o que vai em DMC_Shell.montar({ itens })
     DMC_Professor.abasDaTurma · abasDoAluno
   Acréscimos (F8, opcionais):
     DMC_Professor.resumo({ recarregar }) → Promise<Resumo|null>
       GET /portal/professor/resumo, memorizado (Visão geral e contagens do menu)
     DMC_Professor.ui                      DMC_UI + reservas mínimas do que o
       núcleo ainda não entregou (toast, confirmar, anunciar, estadoVazio,
       alerta, esqueleto, ocupado, estado, fmt); sai quando o DMC_UI completo existir
     DMC_Professor.api                     DMC_Api com erro rico ({status, codigo,
       campos, dados}) e { silencioso404 } mesmo antes do acréscimo da F0b

   O roteamento só existe em professor.html: os prof-*.js chamam
   registrar() ao carregar e este arquivo chama iniciar() no
   DOMContentLoaded quando body[data-pagina="professor"]. Em admin.html
   e parcerias.html nada é montado e nenhum hash é reescrito.

   Sem script embutido na página nem atributo de evento; HTML só por DMC_UI.html (escape).
   ============================================================= */
(function () {
  'use strict';

  if (window.DMC_Professor) return; // carregado duas vezes: o primeiro vale

  const doc = document;
  const API = {
    resumo: '/portal/professor/resumo',
    painel: '/portal/admin/relatorios/painel',
    alunoResumo: (id) => `/portal/professor/alunos/${encodeURIComponent(id)}/resumo`,
    alunoMatriculas: (id) => `/portal/professor/alunos/${encodeURIComponent(id)}/matriculas`
  };
  const PAPEIS_EQUIPE = ['professor', 'admin'];
  const NOME_PORTAL = 'Plataforma Complexo DMC';

  // ---------------------------------------------------------------
  // Menu estático do backoffice (UX §5.4). Professor e coordenação têm
  // grupos e rótulos diferentes em alguns itens: uma entrada por papel.
  // ---------------------------------------------------------------
  const P = ['professor'];
  const A = ['admin'];
  const PA = ['professor', 'admin'];
  const MENU_ESTATICO = Object.freeze([
    { rota: 'inicio', rotulo: 'Visão geral', grupo: null, icone: 'navVisaoGeral', ordem: 1, papeis: PA },
    // Ensino
    { rota: 'cursos', rotulo: 'Meus cursos', grupo: 'ensino', icone: 'navCursos', ordem: 10, papeis: P },
    { rota: 'cursos', rotulo: 'Cursos', grupo: 'ensino', icone: 'navCursos', ordem: 10, papeis: A },
    { rota: 'turmas', rotulo: 'Turmas', grupo: 'ensino', icone: 'navTurmas', ordem: 20, papeis: PA },
    // Conteúdo (admin.html): só a coordenação nesta entrega. O modo do professor no editor
    // (D-21: leitura da identidade; plano, materiais e rótulo do encontro) é pendência registrada;
    // o professor edita o plano de ensino em Meus cursos (#/cursos, F1b).
    { rota: 'conteudo', rotulo: 'Conteúdo', grupo: 'ensino', icone: 'navCursos', ordem: 30, papeis: A, href: 'admin.html' },
    { rota: 'avaliacoes', rotulo: 'Avaliações', grupo: 'ensino', icone: 'navAvaliacoes', ordem: 40, papeis: PA },
    { rota: 'correcao', rotulo: 'Correção', grupo: 'ensino', icone: 'navCorrecao', ordem: 50, papeis: PA, contagemRotulo: 'a corrigir' },
    { rota: 'ao-vivo', rotulo: 'Aulas ao vivo', grupo: 'ensino', icone: 'navAoVivo', ordem: 60, papeis: PA },
    { rota: 'duvidas', rotulo: 'Dúvidas', grupo: 'ensino', icone: 'navDuvidas', ordem: 70, papeis: A, contagemRotulo: 'sem resposta' },
    { rota: 'relatorios', rotulo: 'Relatórios', grupo: 'ensino', icone: 'navRelatorios', ordem: 80, papeis: P },
    // Secretaria (coordenação)
    { rota: 'alunos', rotulo: 'Alunos', grupo: 'secretaria', icone: 'navAlunos', ordem: 10, papeis: A },
    { rota: 'matriculas', rotulo: 'Matrículas', grupo: 'secretaria', icone: 'navMatriculas', ordem: 20, papeis: A },
    { rota: 'documentos', rotulo: 'Documentos', grupo: 'secretaria', icone: 'navDocumentos', ordem: 30, papeis: A, contagemRotulo: 'em revisão' },
    { rota: 'contratos', rotulo: 'Contratos', grupo: 'secretaria', icone: 'navContratos', ordem: 40, papeis: A, contagemRotulo: 'pendentes' },
    { rota: 'financeiro', rotulo: 'Financeiro', grupo: 'secretaria', icone: 'navFinanceiro', ordem: 50, papeis: A, contagemRotulo: 'em atraso' },
    // Relacionamento
    { rota: 'duvidas', rotulo: 'Dúvidas', grupo: 'relacionamento', icone: 'navDuvidas', ordem: 10, papeis: P, contagemRotulo: 'sem resposta' },
    { rota: 'atendimento', rotulo: 'Atendimento', grupo: 'relacionamento', icone: 'navAtendimento', ordem: 20, papeis: PA, contagemRotulo: 'abertos' },
    { rota: 'ouvidoria', rotulo: 'Ouvidoria (encaminhadas)', grupo: 'relacionamento', icone: 'navOuvidoria', ordem: 30, papeis: P, contagemRotulo: 'sem parecer' },
    { rota: 'ouvidoria', rotulo: 'Ouvidoria', grupo: 'relacionamento', icone: 'navOuvidoria', ordem: 30, papeis: A, contagemRotulo: 'abertas' },
    { rota: 'publicacoes', rotulo: 'Publicações', grupo: 'relacionamento', icone: 'navPublicacoes', ordem: 40, papeis: PA },
    { rota: 'banners', rotulo: 'Banners', grupo: 'relacionamento', icone: 'navBanners', ordem: 50, papeis: A },
    // Gestão (coordenação)
    { rota: 'equipe', rotulo: 'Equipe', grupo: 'gestao', icone: 'navEquipe', ordem: 10, papeis: A },
    { rota: 'relatorios', rotulo: 'Relatórios', grupo: 'gestao', icone: 'navRelatorios', ordem: 20, papeis: A },
    { rota: 'auditoria', rotulo: 'Auditoria', grupo: 'gestao', icone: 'navAuditoria', ordem: 30, papeis: A },
    { rota: 'configuracoes/ia', rotulo: 'Configurações', grupo: 'gestao', icone: 'navConfig', ordem: 40, papeis: A },
    { rota: 'parcerias', rotulo: 'Parcerias', grupo: 'gestao', icone: 'navParcerias', ordem: 50, papeis: A, href: 'parcerias.html' }
  ].map((i) => Object.freeze({ ...i, papeis: Object.freeze(i.papeis.slice()) })));

  const abasDaTurma = Object.freeze(['alunos', 'frequencia', 'notas', 'encontros']);
  const abasDoAluno = Object.freeze(['academico', 'matriculas', 'documentos', 'contratos', 'financeiro', 'atendimentos', 'cadastro']);
  const PAIS = Object.freeze({ 'turmas/:id': abasDaTurma, 'alunos/:userId': abasDoAluno });

  // ---------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------
  const UI0 = () => window.DMC_UI || null;
  function html(partes, ...valores) {
    const ui = UI0();
    if (ui && typeof ui.html === 'function') return ui.html(partes, ...valores);
    // Reserva mínima (ui.js ausente): escapa tudo.
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"'`]/g, (c) => `&#${c.charCodeAt(0)};`);
    let s = partes[0];
    valores.forEach((v, i) => { s += (Array.isArray(v) ? v.map(esc).join('') : esc(v)) + partes[i + 1]; });
    return s;
  }
  function nos(marcacao) {
    const t = doc.createElement('template');
    t.innerHTML = String(marcacao); // marcacao vem SEMPRE de DMC_UI.html (escape)
    return t.content;
  }
  function papelAtual(user) {
    const auth = window.DMC_Auth;
    if (auth && typeof auth.papel === 'function') {
      const p = auth.papel();
      if (p) return p;
    }
    if (!user) return null;
    if (user.isAdmin === true) return 'admin';
    return user.papel === 'professor' ? 'professor' : 'aluno';
  }
  function primeiroNome(nome) {
    return String(nome || '').trim().split(/\s+/)[0] || '';
  }
  const reduzirMovimento = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------------------------------------------------------------
  // API com erro rico (acréscimo de §7.1 antes de a F0b entregar)
  // ---------------------------------------------------------------
  function base() {
    return (window.DMC_API_BASE || '/api').replace(/\/$/, '');
  }
  function urlDe(caminho) {
    const c = String(caminho || '');
    if (/^\/api\//.test(c)) return base() + c.slice(4);
    return base() + (c.charAt(0) === '/' ? c : `/${c}`);
  }
  async function pedir(metodo, caminho, corpo, opcoes) {
    const o = opcoes || {};
    const cab = Object.assign({ Accept: 'application/json' }, o.cabecalhos || {});
    const token = window.DMC_Api && typeof window.DMC_Api.token === 'function' ? window.DMC_Api.token() : null;
    if (token) cab.Authorization = `Bearer ${token}`;
    const init = { method: metodo, headers: cab, signal: o.sinal };
    if (corpo !== undefined && metodo !== 'GET' && metodo !== 'DELETE') {
      cab['Content-Type'] = 'application/json';
      init.body = JSON.stringify(corpo);
    }
    const res = await fetch(urlDe(caminho), init);
    if (res.status === 401 && window.DMC_Api && typeof window.DMC_Api.setToken === 'function') window.DMC_Api.setToken(null);
    let dados = null;
    const tipo = res.headers.get('content-type') || '';
    if (res.status !== 204) {
      if (tipo.indexOf('application/json') >= 0) {
        try { dados = await res.json(); } catch (_e) { dados = null; }
      } else {
        try { await res.text(); } catch (_e) { /* corpo descartado */ }
      }
    }
    if (res.ok) return dados;
    if (res.status === 404 && o.silencioso404) return null;
    const err = new Error((dados && dados.error) || `Erro ${res.status} no servidor.`);
    err.status = res.status;
    if (dados && dados.codigo) err.codigo = dados.codigo;
    if (dados && dados.campos) err.campos = dados.campos;
    err.requestId = (dados && dados.requestId) || res.headers.get('x-request-id') || undefined;
    err.dados = dados;
    throw err;
  }
  const api = Object.freeze({
    get: (c, o) => pedir('GET', c, undefined, o),
    post: (c, corpo = {}, o) => pedir('POST', c, corpo, o),
    put: (c, corpo = {}, o) => pedir('PUT', c, corpo, o),
    del: (c, o) => pedir('DELETE', c, undefined, o),
    upload: (...a) => window.DMC_Api.upload(...a),
    blob: (...a) => window.DMC_Api.blob(...a),
    token: () => (window.DMC_Api ? window.DMC_Api.token() : null),
    setToken: (t) => window.DMC_Api && window.DMC_Api.setToken(t)
  });

  // ---------------------------------------------------------------
  // DMC_UI + reservas mínimas (o que o núcleo ainda não entregou)
  // ---------------------------------------------------------------
  const fmtReserva = {
    data(iso, estilo) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return estilo === 'longa'
        ? d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' })
        : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    },
    dataHora(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    },
    hora(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    },
    relativo(iso) {
      if (!iso) return '—';
      const ms = Date.now() - new Date(iso).getTime();
      if (!Number.isFinite(ms)) return '—';
      const min = Math.round(ms / 60000);
      if (min < 1) return 'agora';
      if (min < 60) return `há ${min} min`;
      const h = Math.round(min / 60);
      if (h < 24) return `há ${h} h`;
      const dias = Math.round(h / 24);
      if (dias < 30) return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
      return fmtReserva.data(iso);
    },
    numero(n, casas = 0) {
      return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) : '—';
    },
    pct(n, casas = 0) {
      return Number.isFinite(n) ? `${fmtReserva.numero(n, casas)}%` : '—';
    },
    nota(n) {
      return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';
    },
    moeda(centavos) {
      return Number.isFinite(centavos) ? (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
    }
  };

  let regiaoViva = null;
  function anunciarReserva(texto, opcoes) {
    if (!regiaoViva || !regiaoViva.isConnected) {
      regiaoViva = doc.createElement('p');
      regiaoViva.className = 'dmc-sr-only pf-prof-anuncio';
      regiaoViva.setAttribute('role', 'status');
      regiaoViva.setAttribute('aria-live', 'polite');
      doc.body.appendChild(regiaoViva);
    }
    regiaoViva.setAttribute('aria-live', opcoes && opcoes.assertivo ? 'assertive' : 'polite');
    regiaoViva.textContent = '';
    window.setTimeout(() => { regiaoViva.textContent = String(texto || ''); }, 30);
  }

  let pilhaToast = null;
  function toastReserva(mensagem, opcoes) {
    const o = opcoes || {};
    const tipo = ['sucesso', 'aviso', 'erro', 'info'].indexOf(o.tipo) >= 0 ? o.tipo : 'info';
    if (!pilhaToast || !pilhaToast.isConnected) {
      pilhaToast = doc.createElement('div');
      pilhaToast.className = 'pf-prof-toasts';
      doc.body.appendChild(pilhaToast);
    }
    const el = nos(html`<div class="${`pf-toast pf-toast--${tipo} pf-prof-toast pf-prof-toast--${tipo}`}" role="${tipo === 'erro' ? 'alert' : 'status'}">
      <p class="pf-prof-toast__texto">${String(mensagem || '')}</p>
      <button type="button" class="pf-prof-toast__fechar" data-pf-prof-fechar aria-label="Fechar aviso">×</button>
    </div>`).firstElementChild;
    while (pilhaToast.children.length >= 3) pilhaToast.firstElementChild.remove();
    pilhaToast.appendChild(el);
    const fechar = () => el.remove();
    el.querySelector('[data-pf-prof-fechar]').addEventListener('click', fechar);
    if (tipo !== 'erro') {
      let t = window.setTimeout(fechar, o.duracaoMs || 6000);
      el.addEventListener('mouseenter', () => window.clearTimeout(t));
      el.addEventListener('focusin', () => window.clearTimeout(t));
      el.addEventListener('mouseleave', () => { t = window.setTimeout(fechar, 3000); });
    }
  }

  function dialogoReserva({ titulo, conteudo, acoes, aoAbrir }) {
    return new Promise((resolve) => {
      const dlg = doc.createElement('dialog');
      dlg.className = 'pf-dialogo pf-prof-dialogo';
      const idT = `pf-prof-dlg-${Math.random().toString(36).slice(2, 8)}`;
      dlg.setAttribute('aria-labelledby', idT);
      dlg.appendChild(nos(html`<form method="dialog" class="pf-prof-dialogo__forma">
        <h2 class="pf-prof-dialogo__titulo" id="${idT}">${titulo || ''}</h2>
        <div class="pf-prof-dialogo__corpo"></div>
        <div class="pf-prof-dialogo__acoes"></div>
      </form>`));
      const corpo = dlg.querySelector('.pf-prof-dialogo__corpo');
      // conteudo: Node, ou markup de DMC_UI.html (objeto String marcado — typeof 'object').
      if (conteudo && typeof conteudo === 'object' && conteudo.nodeType) corpo.appendChild(conteudo);
      else if (conteudo !== null && conteudo !== undefined) corpo.appendChild(nos(String(conteudo)));
      const caixa = dlg.querySelector('.pf-prof-dialogo__acoes');
      (acoes || []).forEach((a) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = a.tipo === 'primario' ? 'dmc-btn dmc-btn--primary' : a.tipo === 'perigo' ? 'dmc-btn pf-btn--perigo' : 'dmc-btn dmc-btn--secondary';
        b.textContent = a.rotulo;
        if (a.acao) b.setAttribute('data-pf-acao', a.acao);
        b.addEventListener('click', () => { if (a.validar && !a.validar(dlg)) return; fechar(a.valor); });
        caixa.appendChild(b);
      });
      let feito = false;
      function fechar(valor) {
        if (feito) return;
        feito = true;
        try { dlg.close(); } catch (_e) { /* já fechado */ }
        dlg.remove();
        resolve(valor === undefined ? null : valor);
      }
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); fechar(null); });
      doc.body.appendChild(dlg);
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      if (typeof aoAbrir === 'function') aoAbrir(dlg);
      const cancelar = caixa.querySelector('[data-pf-acao="cancelar"]');
      if (cancelar) cancelar.focus();
    });
  }

  /**
   * Reserva de DMC_UI.confirmar (§7.5), com motivo, reautenticação (senha + código do 2FA) e
   * `enviar` (acréscimo D-57): o diálogo fica ABERTO durante enviar(); 400 campos.senha/codigo/motivo
   * vira erro no campo; outro erro vira alerta dentro do diálogo. Senha e código nunca vão a
   * armazenamento, log ou URL; os campos são limpos ao fechar.
   */
  function confirmarReserva(o) {
    const op = o || {};
    const user = window.DMC_Auth && typeof window.DMC_Auth.user === 'function' ? window.DMC_Auth.user() : null;
    const comCodigo = !!(op.reautenticar && user && user.doisFatoresAtivo);
    return new Promise((resolve) => {
      const dlg = doc.createElement('dialog');
      dlg.className = 'pf-dialogo pf-prof-dialogo';
      const idT = `pf-prof-dlg-${Math.random().toString(36).slice(2, 8)}`;
      dlg.setAttribute('aria-labelledby', idT);
      dlg.appendChild(nos(html`<form class="pf-prof-dialogo__forma" novalidate>
        <h2 class="pf-prof-dialogo__titulo" id="${idT}">${op.titulo || 'Confirmar'}</h2>
        <div class="pf-prof-dialogo__corpo">
          ${op.texto ? html`<p class="pf-prof-dialogo__texto">${op.texto}</p>` : ''}
          ${(Array.isArray(op.campos) ? op.campos : []).map((c) => {
            const id = `${idT}-${c.nome}`;
            const tipo = ['text', 'email', 'url', 'number', 'date', 'tel'].indexOf(c.tipo) >= 0 ? c.tipo : 'text';
            const controle = c.tipo === 'textarea'
              ? html`<textarea class="pf-input" id="${id}" name="${c.nome}" rows="3"${c.max ? html` maxlength="${String(c.max)}"` : ''}${c.obrigatorio ? ' required' : ''}>${c.valor == null ? '' : String(c.valor)}</textarea>`
              : html`<input class="pf-input" id="${id}" name="${c.nome}" type="${tipo}" value="${c.valor == null ? '' : String(c.valor)}"${c.max ? html` maxlength="${String(c.max)}"` : ''}${c.obrigatorio ? ' required' : ''}>`;
            return html`<label class="pf-campo pf-prof-campo" for="${id}"><span class="pf-campo__rotulo">${c.rotulo}${c.obrigatorio ? ' *' : ''}</span>${controle}
              ${c.ajuda ? html`<span class="pf-prof-nota">${c.ajuda}</span>` : ''}
              <span class="pf-prof-campo__erro" data-pf-prof-erro="${c.nome}" hidden></span></label>`;
          })}
          ${op.motivo ? html`<label class="pf-campo pf-prof-campo"><span class="pf-campo__rotulo">Motivo (fica registrado na auditoria)</span>
            <textarea class="pf-input" name="motivo" rows="3" maxlength="500" required></textarea>
            <span class="pf-prof-campo__erro" data-pf-prof-erro="motivo" hidden></span></label>` : ''}
          ${op.reautenticar ? html`<fieldset class="pf-reautenticacao pf-prof-reautenticacao"><legend>Confirme sua identidade</legend>
            <label class="pf-campo pf-prof-campo"><span class="pf-campo__rotulo">Senha atual</span>
              <input class="pf-input" type="password" name="senha" autocomplete="current-password" required>
              <span class="pf-prof-campo__erro" data-pf-prof-erro="senha" hidden></span></label>
            ${comCodigo ? html`<label class="pf-campo pf-prof-campo"><span class="pf-campo__rotulo">Código do aplicativo</span>
              <input class="pf-input" type="text" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="9">
              <span class="pf-prof-campo__erro" data-pf-prof-erro="codigo" hidden></span></label>` : ''}
          </fieldset>` : ''}
          <div data-pf-prof-alerta></div>
        </div>
        <div class="pf-prof-dialogo__acoes">
          <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-acao="cancelar">${op.rotuloCancelar || 'Cancelar'}</button>
          <button type="submit" class="${op.perigo ? 'dmc-btn pf-btn--perigo' : 'dmc-btn dmc-btn--primary'}" data-pf-acao="confirmar">${op.rotuloConfirmar || 'Confirmar'}</button>
        </div>
      </form>`));
      const form = dlg.querySelector('form');
      const campo = (n) => form.querySelector(`[name="${n}"]`);
      const erroDe = (n) => form.querySelector(`[data-pf-prof-erro="${n}"]`);
      const mostrarErro = (n, msg) => {
        const e = erroDe(n); const c = campo(n);
        if (!e || !c) return false;
        e.textContent = msg; e.hidden = !msg;
        if (msg) c.setAttribute('aria-invalid', 'true'); else c.removeAttribute('aria-invalid');
        return true;
      };
      let feito = false;
      function fechar(valor) {
        if (feito) return;
        feito = true;
        form.reset();
        try { dlg.close(); } catch (_e) { /* já fechado */ }
        dlg.remove();
        resolve(valor);
      }
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); fechar(false); });
      form.querySelector('[data-pf-acao="cancelar"]').addEventListener('click', () => fechar(false));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nomesCampos = (Array.isArray(op.campos) ? op.campos : []).map((c) => c.nome);
        ['motivo', 'senha', 'codigo'].concat(nomesCampos).forEach((n) => mostrarErro(n, ''));
        form.querySelector('[data-pf-prof-alerta]').replaceChildren();
        const valores = {};
        let faltou = null;
        (Array.isArray(op.campos) ? op.campos : []).forEach((c) => {
          const v = String(campo(c.nome).value || '').trim();
          valores[c.nome] = v;
          if (c.obrigatorio && !v && !faltou) faltou = c.nome;
        });
        if (faltou) { mostrarErro(faltou, 'Campo obrigatório.'); campo(faltou).focus(); return; }
        if (typeof op.validar === 'function') {
          const erros = op.validar(valores) || null;
          const primeiro = erros ? Object.keys(erros)[0] : null;
          if (primeiro) { Object.keys(erros).forEach((n) => mostrarErro(n, erros[n])); if (campo(primeiro)) campo(primeiro).focus(); return; }
        }
        const motivo = op.motivo ? String(campo('motivo').value || '').trim() : null;
        if (op.motivo && (motivo.length < 10 || motivo.length > 500)) { mostrarErro('motivo', 'Escreva entre 10 e 500 caracteres.'); campo('motivo').focus(); return; }
        let reaut = null;
        if (op.reautenticar) {
          const senha = String(campo('senha').value || '');
          if (!senha) { mostrarErro('senha', 'Digite sua senha.'); campo('senha').focus(); return; }
          reaut = { senha };
          if (comCodigo && campo('codigo').value) reaut.codigo = String(campo('codigo').value).trim();
        }
        if (typeof op.enviar !== 'function') {
          fechar(Array.isArray(op.campos) ? { ...valores, ...(op.motivo ? { motivo } : {}) } : (op.motivo ? { motivo } : true));
          return;
        }
        const botao = form.querySelector('[data-pf-acao="confirmar"]');
        ocupadoReserva(botao, true);
        try {
          const r = await op.enviar(op.motivo ? { ...valores, motivo } : valores, reaut);
          ocupadoReserva(botao, false);
          fechar(r === undefined ? true : r);
        } catch (err) {
          ocupadoReserva(botao, false);
          const campos = (err && err.campos) || {};
          let algum = false;
          if (campos.senha) algum = mostrarErro('senha', 'Senha incorreta.') || algum;
          if (campos.codigo) algum = mostrarErro('codigo', 'Código inválido.') || algum;
          if (campos.motivo) algum = mostrarErro('motivo', String(campos.motivo)) || algum;
          nomesCampos.forEach((n) => { if (campos[n]) algum = mostrarErro(n, String(campos[n])) || algum; });
          if (err && err.status === 429) { fechar(false); toastReserva(`${err.message} Por segurança, sua sessão foi encerrada. Entre de novo.`, { tipo: 'erro' }); return; }
          if (!algum) alertaReserva(form.querySelector('[data-pf-prof-alerta]'), { tom: 'erro', texto: (err && err.message) || 'Não foi possível concluir.' });
        }
      });
      doc.body.appendChild(dlg);
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      form.querySelector('[data-pf-acao="cancelar"]').focus();
    });
  }

  function estadoVazioReserva(el, { titulo, texto, acao } = {}) {
    el.replaceChildren(nos(html`<div class="pf-vazio pf-prof-vazio">
      ${titulo ? html`<p class="pf-vazio__titulo pf-prof-vazio__titulo">${titulo}</p>` : ''}
      ${texto ? html`<p class="pf-vazio__texto pf-prof-vazio__texto">${texto}</p>` : ''}
      ${acao && acao.href ? html`<a class="dmc-btn dmc-btn--secondary" href="${acao.href}">${acao.rotulo}</a>` : ''}
      ${acao && !acao.href && acao.aoClicar ? html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-prof-acao>${acao.rotulo}</button>` : ''}
    </div>`));
    const b = el.querySelector('[data-pf-prof-acao]');
    if (b) b.addEventListener('click', acao.aoClicar);
    return el.firstElementChild;
  }

  function alertaReserva(el, { tom = 'info', titulo, texto, compacto = false } = {}) {
    const n = nos(html`<div class="${`pf-alerta pf-alerta--${tom} pf-prof-alerta pf-prof-alerta--${tom}${compacto ? ' pf-alerta--compacto' : ''}`}" role="${tom === 'erro' ? 'alert' : 'status'}">
      ${titulo ? html`<p class="pf-alerta__titulo pf-prof-alerta__titulo">${titulo}</p>` : ''}
      ${texto ? html`<p class="pf-alerta__texto">${texto}</p>` : ''}
    </div>`).firstElementChild;
    el.replaceChildren(n);
    return n;
  }

  function esqueletoReserva(el, { linhas = 3 } = {}) {
    el.setAttribute('aria-busy', 'true');
    const itens = [];
    for (let i = 0; i < linhas; i++) itens.push(html`<span class="pf-prof-esqueleto__linha"></span>`);
    el.replaceChildren(nos(html`<div class="pf-esqueleto pf-prof-esqueleto" aria-hidden="true">${itens}</div><p class="dmc-sr-only">Carregando…</p>`));
  }

  function ocupadoReserva(botao, ocupado, rotulo) {
    if (!botao) return;
    if (ocupado) {
      if (!botao.dataset.pfProfRotulo) botao.dataset.pfProfRotulo = botao.textContent;
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      if (rotulo) botao.textContent = rotulo;
    } else {
      botao.disabled = false;
      botao.removeAttribute('aria-busy');
      if (botao.dataset.pfProfRotulo) { botao.textContent = botao.dataset.pfProfRotulo; delete botao.dataset.pfProfRotulo; }
    }
  }

  function estadoReserva(rotulo, tom = 'neutro') {
    return html`<span class="${`pf-estado pf-estado--${tom} pf-prof-estado pf-prof-estado--${tom}`}">${rotulo}</span>`;
  }

  function erroCargaReserva(el, erro, opcoes) {
    const ui = UI0();
    if (ui && typeof ui.erroCarga === 'function') return ui.erroCarga(el, erro, opcoes);
    alertaReserva(el, { tom: 'erro', titulo: 'Não foi possível carregar.', texto: (erro && erro.message) || 'Tente de novo.' });
    return el.firstElementChild;
  }

  const ui = new Proxy({}, {
    get(_alvo, nome) {
      const u = UI0();
      if (u && typeof u[nome] !== 'undefined' && !(nome === 'fmt' && !u.fmt)) {
        if (nome === 'fmt') return Object.assign({}, fmtReserva, u.fmt);
        return u[nome];
      }
      switch (nome) {
        case 'html': return html;
        case 'toast': return toastReserva;
        case 'anunciar': return anunciarReserva;
        case 'confirmar': return confirmarReserva;
        case 'formulario': return (o) => confirmarReserva({ ...(o || {}), texto: o && (o.texto || o.descricao), rotuloConfirmar: (o && o.rotuloEnviar) || 'Salvar', perigo: false });
        case 'dialogo': return dialogoReserva;
        case 'estadoVazio': return estadoVazioReserva;
        case 'alerta': return alertaReserva;
        case 'esqueleto': return esqueletoReserva;
        case 'ocupado': return ocupadoReserva;
        case 'estado': case 'chip': return estadoReserva;
        case 'erroCarga': return erroCargaReserva;
        case 'fmt': return fmtReserva;
        case 'nos': return nos;
        default: return undefined;
      }
    }
  });

  // ---------------------------------------------------------------
  // Registro de rotas
  // ---------------------------------------------------------------
  const registro = [];

  function segmentos(rota) {
    return String(rota || '').replace(/^#?\/?/, '').split('?')[0].split('/').filter(Boolean);
  }

  function registrar(def) {
    if (!def || typeof def !== 'object') throw new TypeError('DMC_Professor.registrar: informe { rota, titulo, papeis, montar }.');
    const rota = String(def.rota || '').replace(/^#?\/?/, '');
    if (!rota) throw new TypeError('DMC_Professor.registrar: rota vazia.');
    if (typeof def.montar !== 'function') throw new TypeError(`DMC_Professor.registrar(${rota}): montar precisa ser função.`);
    const papeis = Array.isArray(def.papeis) && def.papeis.length ? def.papeis.filter((p) => PAPEIS_EQUIPE.indexOf(p) >= 0) : PAPEIS_EQUIPE.slice();
    if (def.pai && !PAIS[def.pai]) throw new TypeError(`DMC_Professor.registrar(${rota}): pai desconhecido (${def.pai}).`);
    if (def.pai && (!def.aba || PAIS[def.pai].indexOf(def.aba) < 0)) throw new TypeError(`DMC_Professor.registrar(${rota}): aba inválida para ${def.pai}.`);
    if (registro.some((r) => r.rota === rota)) {
      console.error(`[DMC] DMC_Professor.registrar: rota já registrada (${rota}).`);
      return;
    }
    const segs = segmentos(rota);
    registro.push(Object.freeze({
      rota, segs, literais: segs.filter((s) => s.charAt(0) !== ':').length,
      titulo: String(def.titulo || ''), papeis: Object.freeze(papeis), montar: def.montar,
      resumo: typeof def.resumo === 'function' ? def.resumo : null,
      pai: def.pai || null, aba: def.aba || null
    }));
  }

  function casarPadrao(segsPadrao, segs) {
    if (segsPadrao.length !== segs.length) return null;
    const params = {};
    for (let i = 0; i < segs.length; i++) {
      const p = segsPadrao[i];
      if (p.charAt(0) === ':') {
        try { params[p.slice(1)] = decodeURIComponent(segs[i]); } catch (_e) { return null; }
      } else if (p !== segs[i]) return null;
    }
    return params;
  }

  /** Rota registrada mais específica (mais segmentos literais) que casa com o caminho. */
  function casar(caminho) {
    const segs = segmentos(caminho);
    let melhor = null;
    for (const def of registro) {
      const params = casarPadrao(def.segs, segs);
      if (params && (!melhor || def.literais > melhor.def.literais)) melhor = { def, params };
    }
    return melhor;
  }

  const rotaRegistrada = (rota) => registro.some((r) => r.rota === rota);
  const podePapel = (papeis, papel) => papel === 'admin' ? papeis.indexOf('admin') >= 0 : papeis.indexOf(papel) >= 0;

  function emProfessorHtml() {
    return !!(doc.body && doc.body.dataset && doc.body.dataset.pagina === 'professor');
  }

  function itensDoMenu(papel) {
    const p = papel || papelAtual(window.DMC_Auth && window.DMC_Auth.user ? window.DMC_Auth.user() : null);
    const aqui = emProfessorHtml();
    return MENU_ESTATICO
      .filter((i) => i.papeis.indexOf(p) >= 0)
      .filter((i) => i.href || !aqui || rotaRegistrada(i.rota))
      .map((i) => ({
        rota: i.rota,
        chave: segmentos(i.rota)[0],
        rotulo: i.rotulo,
        grupo: i.grupo,
        icone: i.icone,
        ordem: i.ordem,
        papeis: i.papeis.slice(),
        href: i.href || (aqui ? `#/${i.rota}` : `professor.html#/${i.rota}`),
        contagemRotulo: i.contagemRotulo || null
      }));
  }

  // ---------------------------------------------------------------
  // Estado do roteador
  // ---------------------------------------------------------------
  const E = {
    ativo: false,
    user: null,
    papel: null,
    vista: null,          // contêiner das telas (#pf-prof-vista)
    atual: null,          // { def, params, destruir, controlador, chave }
    seq: 0,
    resumo: null,         // Promise<Resumo|null>
    cursos: null,         // [{ id, titulo, sigla }]
    alunos: new Map(),    // userId → Promise<{ aluno, matriculas, semMatricula, erro }>
    matriculaEscolhida: new Map()
  };

  function resumo(opcoes) {
    if (!E.resumo || (opcoes && opcoes.recarregar)) {
      E.resumo = api.get(API.resumo).catch((err) => {
        if (err && err.status === 401) throw err;
        console.error('[DMC]', err);
        return null;
      });
    }
    return E.resumo;
  }

  function cursosDoResumo(r) {
    return r && Array.isArray(r.cursos) ? r.cursos.map((c) => ({ id: c.id, titulo: c.titulo, sigla: c.sigla || null })) : [];
  }

  function lerHash() {
    const h = String(window.location.hash || '');
    const corpo = h.replace(/^#\/?/, '');
    const q = corpo.indexOf('?');
    return {
      caminho: q >= 0 ? corpo.slice(0, q) : corpo,
      filtros: new URLSearchParams(q >= 0 ? corpo.slice(q + 1) : '')
    };
  }

  function hashDe(rota, filtros) {
    const r = String(rota || '').replace(/^#?\/?/, '');
    let qs = '';
    if (filtros) {
      const f = filtros instanceof URLSearchParams ? filtros : new URLSearchParams(filtros);
      qs = f.toString();
    }
    return `#/${r}${qs ? `?${qs}` : ''}`;
  }

  function navegar(rota, filtros) {
    const alvo = hashDe(rota, filtros);
    if (!E.ativo) {
      window.location.href = emProfessorHtml() ? alvo : `professor.html${alvo}`;
      return;
    }
    if (window.location.hash === alvo) rotear();
    else window.location.hash = alvo;
  }

  function substituirHash(rota, filtros) {
    const alvo = hashDe(rota, filtros);
    try { window.history.replaceState(null, '', alvo); } catch (_e) { window.location.replace(alvo); return; }
    rotear();
  }

  function definirTituloDocumento(secao) {
    const area = E.papel === 'admin' ? 'Coordenação' : 'Portal do Professor';
    doc.title = `${secao ? `${secao} · ` : ''}${area} · ${NOME_PORTAL}`;
  }

  function encerrarAtual() {
    const a = E.atual;
    E.atual = null;
    if (!a) return;
    try { a.controlador.abort(); } catch (_e) { /* nada */ }
    try { if (a.destruir) a.destruir(); } catch (err) { console.error('[DMC]', err); }
  }

  function ehRestrito(err) {
    return !!err && (err.status === 403 || err.codigo === 'papel-insuficiente' || err.codigo === 'nao-docente');
  }

  function urlDeLogin() {
    const auth = window.DMC_Auth;
    const next = auth && typeof auth.validarNext === 'function' ? auth.validarNext('professor.html') : 'professor.html';
    return `login.html?next=${encodeURIComponent(next || 'professor.html')}`;
  }

  function tratarErroMontagem(el, err, tentarDeNovo) {
    if (err && err.name === 'AbortError') return;
    if (err && err.status === 401) { window.location.replace(urlDeLogin()); return; }
    if (ehRestrito(err)) { desenharAreaRestrita(el); return; }
    console.error('[DMC]', err);
    ui.erroCarga(el, err, { tentarDeNovo });
  }

  // ---------------------------------------------------------------
  // Telas da casca
  // ---------------------------------------------------------------
  function htmlCabecalho({ titulo, contexto, descricao, voltar }) {
    return html`<header class="pf-cabecalho pf-prof-cabecalho">
      ${voltar ? html`<a class="pf-cabecalho__voltar pf-prof-cabecalho__voltar" href="${voltar.href}">← ${voltar.rotulo}</a>` : ''}
      ${contexto ? html`<p class="pf-cabecalho__contexto pf-prof-cabecalho__contexto">${contexto}</p>` : ''}
      <h1 class="pf-cabecalho__titulo pf-prof-cabecalho__titulo" tabindex="-1" data-pf-prof-h1>${titulo}</h1>
      ${descricao ? html`<p class="pf-cabecalho__descricao pf-prof-cabecalho__descricao" data-pf-prof-descricao>${descricao}</p>` : html`<p class="pf-cabecalho__descricao pf-prof-cabecalho__descricao" data-pf-prof-descricao hidden></p>`}
      <div class="pf-cabecalho__acoes pf-prof-cabecalho__acoes" data-pf-prof-acoes></div>
    </header>`;
  }

  function desenharAreaRestrita(el) {
    const alvo = el || E.vista;
    if (!alvo) return;
    alvo.replaceChildren(nos(html`${htmlCabecalho({ titulo: 'Área da coordenação', descricao: 'Esta seção é usada pela coordenação. Se você precisa de algo daqui, fale com a coordenação.' })}
      <p class="pf-prof-restrito__acao"><a class="dmc-btn dmc-btn--secondary" href="#/inicio">Ir para a visão geral</a></p>`));
    definirTituloDocumento('Área da coordenação');
    focarH1(alvo);
  }

  function focarH1(el) {
    const h1 = (el || E.vista).querySelector('[data-pf-prof-h1]') || (el || E.vista).querySelector('h1');
    if (h1) {
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
      try { h1.focus({ preventScroll: true }); } catch (_e) { h1.focus(); }
    }
  }

  function aparecer(el) {
    if (reduzirMovimento()) return;
    el.classList.add('pf-prof-vista--entrando');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => el.classList.remove('pf-prof-vista--entrando')));
  }

  function chaveDoMenu(caminho) {
    const s = segmentos(caminho);
    if (!s.length) return 'inicio';
    if (s[0] === 'configuracoes') return 'configuracoes';
    return s[0];
  }

  function contextoBase(def, params, filtros, controlador) {
    return {
      user: E.user,
      papel: E.papel,
      rota: def.rota,
      params,
      filtros,
      cursos: E.cursos || [],
      navegar,
      definirTitulo(texto) {
        const h1 = E.vista && E.vista.querySelector('[data-pf-prof-h1]');
        if (h1 && !def.pai) h1.textContent = String(texto || '');
        definirTituloDocumento(String(texto || def.titulo || ''));
      },
      api,
      ui,
      sinal: controlador.signal
    };
  }

  // ---------- moldura do aluno ----------
  function dadosDoAluno(userId) {
    if (!E.alunos.has(userId)) {
      const p = Promise.all([
        api.get(API.alunoResumo(userId), { silencioso404: true }).catch((err) => { if (err && err.status === 401) throw err; return { __erro: err }; }),
        api.get(API.alunoMatriculas(userId)).catch((err) => ({ __erro: err }))
      ]).then(([aluno, mats]) => {
        if (mats && mats.__erro && mats.__erro.status === 404) return { naoEncontrado: true };
        if (mats && mats.__erro && ehRestrito(mats.__erro)) return { restrito: true };
        return {
          aluno: aluno && !aluno.__erro ? aluno : null,
          matriculas: mats && !mats.__erro ? (Array.isArray(mats.itens) ? mats.itens : null) : null,
          semMatricula: mats && !mats.__erro && Array.isArray(mats.semMatricula) ? mats.semMatricula : [],
          erroMatriculas: mats && mats.__erro ? mats.__erro : null
        };
      });
      E.alunos.set(userId, p);
      p.catch(() => E.alunos.delete(userId));
    }
    return E.alunos.get(userId);
  }

  function iniciaisDe(nome) {
    return String(nome || '').split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((s) => s.charAt(0).toUpperCase()).join('') || '?';
  }

  function htmlCabecalhoAluno(userId, dados, matriculaId) {
    const a = dados.aluno || {};
    const nome = a.nome || a.nomeSocial || 'Aluno';
    const mats = dados.matriculas;
    const atual = Array.isArray(mats) ? mats.find((m) => m.id === matriculaId) || null : null;
    let linhaMatricula = '';
    if (mats === null) {
      linhaMatricula = html`<p class="pf-prof-aluno__linha">Matrícula: — <span class="pf-prof-nota">(dados de matrícula indisponíveis no momento)</span></p>`;
    } else if (atual) {
      const partes = [atual.numero ? `Matrícula ${atual.numero}` : 'Matrícula', atual.statusRotulo || atual.status, atual.cursoTitulo, atual.turma && atual.turma.codigo ? `Turma ${atual.turma.codigo}` : null, atual.inicioEm ? `início em ${ui.fmt.data(atual.inicioEm)}` : null].filter(Boolean);
      linhaMatricula = html`<p class="pf-prof-aluno__linha">${partes.join(' · ')}</p>`;
    } else {
      linhaMatricula = html`<p class="pf-prof-aluno__linha">Nenhuma matrícula visível.</p>`;
    }
    const seletor = Array.isArray(mats) && mats.length > 1
      ? html`<label class="pf-campo pf-prof-campo pf-prof-aluno__seletor"><span class="pf-campo__rotulo">Matrícula</span>
          <select class="pf-input" data-pf-prof-matricula>${mats.map((m) => html`<option value="${m.id}"${m.id === matriculaId ? ' selected' : ''}>${[m.numero, m.cursoTitulo, m.statusRotulo].filter(Boolean).join(' · ')}</option>`)}</select></label>`
      : '';
    const sem = Array.isArray(dados.semMatricula) && dados.semMatricula.length
      ? html`<p class="pf-prof-aluno__linha pf-prof-nota">Liberação ainda sem matrícula: ${dados.semMatricula.map((s) => s.cursoTitulo || s.cursoId).join(', ')}</p>`
      : '';
    return html`<header class="pf-cabecalho pf-prof-cabecalho pf-prof-aluno">
      <a class="pf-cabecalho__voltar pf-prof-cabecalho__voltar" href="${E.papel === 'admin' ? '#/alunos' : '#/turmas'}">← ${E.papel === 'admin' ? 'Alunos' : 'Turmas'}</a>
      <div class="pf-prof-aluno__identidade">
        <span class="pf-prof-avatar pf-prof-avatar--g" aria-hidden="true">${iniciaisDe(nome)}</span>
        <div class="pf-prof-aluno__textos">
          <h1 class="pf-cabecalho__titulo pf-prof-cabecalho__titulo" tabindex="-1" data-pf-prof-h1>${nome}</h1>
          ${a.email ? html`<p class="pf-prof-aluno__linha">${a.email}</p>` : (dados.aluno ? '' : html`<p class="pf-prof-aluno__linha pf-prof-nota">Dados de identificação indisponíveis no momento.</p>`)}
          ${linhaMatricula}${sem}
        </div>
      </div>
      ${seletor}
    </header>`;
  }

  // ---------- moldura da turma ----------
  async function dadosDaTurma(id) {
    const r = await resumo();
    if (!r || !Array.isArray(r.cursos)) return { id, codigo: null, cursoId: null, cursoTitulo: null };
    for (const c of r.cursos) {
      const t = Array.isArray(c.turmas) ? c.turmas.find((x) => x.id === id) : null;
      if (t) return { id, codigo: t.codigo || null, cursoId: c.id, cursoTitulo: c.titulo, status: t.status || null, alunos: t.alunos };
    }
    return { id, codigo: null, cursoId: null, cursoTitulo: null };
  }

  function htmlCabecalhoTurma(turma) {
    const desc = [turma.cursoTitulo, Number.isFinite(turma.alunos) ? `${turma.alunos} ${turma.alunos === 1 ? 'aluno' : 'alunos'}` : null].filter(Boolean).join(' · ');
    return html`<header class="pf-cabecalho pf-prof-cabecalho">
      <a class="pf-cabecalho__voltar pf-prof-cabecalho__voltar" href="#/turmas">← Turmas</a>
      <h1 class="pf-cabecalho__titulo pf-prof-cabecalho__titulo pf-prof-tnum" tabindex="-1" data-pf-prof-h1>${turma.codigo || 'Turma'}</h1>
      ${desc ? html`<p class="pf-cabecalho__descricao pf-prof-cabecalho__descricao">${desc}</p>` : html`<p class="pf-cabecalho__descricao pf-prof-cabecalho__descricao pf-prof-nota">Dados da turma indisponíveis no momento.</p>`}
    </header>`;
  }

  function abasVisiveis(pai) {
    const ordem = PAIS[pai];
    return ordem
      .map((aba) => registro.find((r) => r.pai === pai && r.aba === aba))
      .filter((r) => r && podePapel(r.papeis, E.papel));
  }

  function hrefDaAba(def, params) {
    return `#/${def.segs.map((s) => (s.charAt(0) === ':' ? encodeURIComponent(params[s.slice(1)] || '') : s)).join('/')}`;
  }

  function htmlAbas(pai, params, ativa) {
    const abas = abasVisiveis(pai);
    return html`<nav class="pf-abas pf-prof-abas" aria-label="Seções">
      <div class="pf-abas__lista pf-prof-abas__lista" role="tablist">
        ${abas.map((d) => html`<a class="pf-abas__aba pf-prof-abas__aba" role="tab" id="${`pf-prof-aba-${d.aba}`}" href="${hrefDaAba(d, params)}" aria-selected="${d === ativa ? 'true' : 'false'}" aria-controls="pf-prof-painel" tabindex="${d === ativa ? '0' : '-1'}" data-pf-prof-aba="${d.aba}">${d.titulo}</a>`)}
      </div>
    </nav>`;
  }

  function ligarTecladoDasAbas(raiz) {
    const lista = raiz.querySelector('[role="tablist"]');
    if (!lista) return;
    lista.addEventListener('keydown', (e) => {
      const abas = Array.from(lista.querySelectorAll('[role="tab"]'));
      const i = abas.indexOf(doc.activeElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === 'ArrowRight') j = (i + 1) % abas.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + abas.length) % abas.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = abas.length - 1;
      else if (e.key === ' ') { e.preventDefault(); abas[i].click(); return; }
      if (j < 0) return;
      e.preventDefault();
      abas[j].focus();
    });
  }

  // ---------------------------------------------------------------
  // Roteamento
  // ---------------------------------------------------------------
  async function rotear() {
    if (!E.ativo || !E.vista) return;
    const { caminho, filtros } = lerHash();
    if (!caminho) { substituirHash('inicio'); return; }

    // Moldura sem aba → primeira aba visível ao papel.
    const segs = segmentos(caminho);
    for (const pai of Object.keys(PAIS)) {
      const paramsPai = casarPadrao(segmentos(pai), segs);
      if (paramsPai && !casar(caminho)) {
        const primeira = abasVisiveis(pai)[0];
        if (primeira) { substituirHash(hrefDaAba(primeira, paramsPai).slice(2), filtros); return; }
        // Nenhuma aba registrada ainda para este papel: moldura sem abas, com aviso honesto.
        await rotearMolduraVazia(pai, paramsPai, filtros);
        return;
      }
    }

    const achado = casar(caminho);
    if (!achado) { substituirHash('inicio'); return; }
    const { def, params } = achado;
    const seq = ++E.seq;
    const chaveMenu = chaveDoMenu(caminho);
    const moldura = def.pai ? `${def.pai}|${def.pai === 'alunos/:userId' ? params.userId : params.id}` : null;

    encerrarAtual();
    const controlador = new AbortController();
    E.atual = { def, params, controlador, destruir: null, moldura };
    window.scrollTo(0, 0);
    if (window.DMC_Shell && typeof window.DMC_Shell.definirAtivo === 'function') window.DMC_Shell.definirAtivo(chaveMenu);

    if (!podePapel(def.papeis, E.papel)) {
      desenharAreaRestrita(E.vista);
      ui.anunciar('Área da coordenação');
      return;
    }

    const ctx = contextoBase(def, params, filtros, controlador);
    let painel;
    try {
      if (def.pai === 'alunos/:userId') {
        ui.esqueleto(E.vista, { tipo: 'heroi', linhas: 3 });
        const dados = await dadosDoAluno(params.userId);
        if (seq !== E.seq) return;
        E.vista.removeAttribute('aria-busy');
        if (dados.restrito) { desenharAreaRestrita(E.vista); return; }
        if (dados.naoEncontrado) {
          E.vista.replaceChildren(nos(htmlCabecalho({ titulo: 'Aluno não encontrado', descricao: 'Este aluno não existe ou não está nas suas turmas.', voltar: { href: '#/inicio', rotulo: 'Visão geral' } })));
          definirTituloDocumento('Aluno não encontrado');
          focarH1();
          return;
        }
        let matriculaId = E.matriculaEscolhida.get(params.userId) || null;
        if (Array.isArray(dados.matriculas) && !dados.matriculas.some((m) => m.id === matriculaId)) matriculaId = dados.matriculas.length ? dados.matriculas[0].id : null;
        E.matriculaEscolhida.set(params.userId, matriculaId);
        const a = dados.aluno || {};
        ctx.aluno = { id: params.userId, nome: a.nome || null, nomeSocial: a.nomeSocial || null, fotoUrl: a.fotoUrl || null, email: a.email || null };
        ctx.matriculaId = matriculaId;
        E.vista.replaceChildren(nos(html`${htmlCabecalhoAluno(params.userId, dados, matriculaId)}${htmlAbas(def.pai, params, def)}<section class="pf-abas__painel pf-prof-painel" id="pf-prof-painel" role="tabpanel" aria-labelledby="${`pf-prof-aba-${def.aba}`}" tabindex="-1"></section>`));
        ligarTecladoDasAbas(E.vista);
        const sel = E.vista.querySelector('[data-pf-prof-matricula]');
        if (sel) {
          sel.addEventListener('change', () => {
            E.matriculaEscolhida.set(params.userId, sel.value);
            rotear(); // destruir() + montar de novo com o novo ctx.matriculaId
          });
        }
        definirTituloDocumento(`${a.nome || 'Aluno'} · ${def.titulo}`);
      } else if (def.pai === 'turmas/:id') {
        const turma = await dadosDaTurma(params.id);
        if (seq !== E.seq) return;
        ctx.turma = { id: turma.id, codigo: turma.codigo, cursoId: turma.cursoId };
        E.vista.replaceChildren(nos(html`${htmlCabecalhoTurma(turma)}${htmlAbas(def.pai, params, def)}<section class="pf-abas__painel pf-prof-painel" id="pf-prof-painel" role="tabpanel" aria-labelledby="${`pf-prof-aba-${def.aba}`}" tabindex="-1"></section>`));
        ligarTecladoDasAbas(E.vista);
        definirTituloDocumento(`${turma.codigo || 'Turma'} · ${def.titulo}`);
      } else {
        E.vista.replaceChildren(nos(html`${htmlCabecalho({ titulo: def.titulo })}<section class="pf-prof-painel" id="pf-prof-painel"></section>`));
        definirTituloDocumento(def.titulo);
      }
      painel = E.vista.querySelector('#pf-prof-painel');
      aparecer(E.vista);
      focarH1();
      ui.anunciar(`${def.titulo} carregado`);
      if (E.atual) E.atual.chave = chaveMenu;
      const r = await def.montar(painel, ctx);
      if (seq !== E.seq) { if (r && typeof r.destruir === 'function') r.destruir(); return; }
      if (E.atual && r && typeof r.destruir === 'function') E.atual.destruir = () => r.destruir();
      doc.dispatchEvent(new CustomEvent('dmc:painel', { detail: { rota: def.rota } }));
    } catch (err) {
      if (seq !== E.seq) return;
      tratarErroMontagem(painel || E.vista, err, () => rotear());
    }
  }

  /** Moldura de aluno/turma sem nenhuma aba visível ao papel (fatias donas ainda ausentes). */
  async function rotearMolduraVazia(pai, params, filtros) {
    const vazio = Object.freeze({ rota: pai, segs: segmentos(pai), literais: 1, titulo: pai === 'alunos/:userId' ? 'Aluno' : 'Turma', papeis: PAPEIS_EQUIPE, pai, aba: null,
      montar(el, ctx) { ctx.ui.alerta(el, { tom: 'info', texto: 'As seções deste cadastro ainda não estão disponíveis para o seu perfil.' }); } });
    const seq = ++E.seq;
    encerrarAtual();
    const controlador = new AbortController();
    E.atual = { def: vazio, params, controlador, destruir: null };
    const ctx = contextoBase(vazio, params, filtros, controlador);
    try {
      if (pai === 'alunos/:userId') {
        const dados = await dadosDoAluno(params.userId);
        if (seq !== E.seq) return;
        if (dados.restrito) { desenharAreaRestrita(E.vista); return; }
        if (dados.naoEncontrado) {
          E.vista.replaceChildren(nos(htmlCabecalho({ titulo: 'Aluno não encontrado', descricao: 'Este aluno não existe ou não está nas suas turmas.', voltar: { href: '#/inicio', rotulo: 'Visão geral' } })));
          focarH1();
          return;
        }
        const mid = Array.isArray(dados.matriculas) && dados.matriculas.length ? dados.matriculas[0].id : null;
        E.vista.replaceChildren(nos(html`${htmlCabecalhoAluno(params.userId, dados, mid)}<section class="pf-prof-painel" id="pf-prof-painel"></section>`));
        definirTituloDocumento((dados.aluno && dados.aluno.nome) || 'Aluno');
      } else {
        const turma = await dadosDaTurma(params.id);
        if (seq !== E.seq) return;
        E.vista.replaceChildren(nos(html`${htmlCabecalhoTurma(turma)}<section class="pf-prof-painel" id="pf-prof-painel"></section>`));
        definirTituloDocumento(turma.codigo || 'Turma');
      }
      vazio.montar(E.vista.querySelector('#pf-prof-painel'), ctx);
      focarH1();
    } catch (err) {
      if (seq === E.seq) tratarErroMontagem(E.vista, err, () => rotear());
    }
  }

  // ---------------------------------------------------------------
  // Contagens do menu (UMA chamada por papel, §7.8)
  // ---------------------------------------------------------------
  function soma(cursos, campo) {
    if (!Array.isArray(cursos)) return null;
    let t = 0;
    for (const c of cursos) {
      if (c[campo] === null || c[campo] === undefined) return null;
      t += Number(c[campo]) || 0;
    }
    return t;
  }

  async function atualizarContagens() {
    const shell = window.DMC_Shell;
    if (!shell || typeof shell.definirContador !== 'function') return;
    const r = await resumo();
    if (r && Array.isArray(r.cursos)) {
      shell.definirContador('correcao', soma(r.cursos, 'correcoesPendentes'));
      shell.definirContador('duvidas', soma(r.cursos, 'duvidasPendentes'));
      shell.definirContador('atendimento', soma(r.cursos, 'atendimentosAbertos'));
      if (E.papel === 'professor') shell.definirContador('ouvidoria', Number.isFinite(r.ouvidoriaSemParecer) ? r.ouvidoriaSemParecer : null);
    }
    if (E.papel === 'admin') {
      const painel = await api.get(API.painel, { silencioso404: true }).catch(() => null);
      if (painel) {
        const n = (v) => (Number.isFinite(v) ? v : (v && Number.isFinite(v.qtd) ? v.qtd : null));
        shell.definirContador('documentos', painel.documentos ? n(painel.documentos.emRevisao) : null);
        shell.definirContador('contratos', painel.contratos ? n(painel.contratos.pendentes) : null);
        shell.definirContador('financeiro', painel.financeiro ? n(painel.financeiro.emAtraso) : null);
        if (painel.ouvidoria && painel.ouvidoria.abertasPorTipo && typeof painel.ouvidoria.abertasPorTipo === 'object') {
          const total = Object.values(painel.ouvidoria.abertasPorTipo).reduce((s, v) => s + (Number(v) || 0), 0);
          shell.definirContador('ouvidoria', total);
        }
      }
    }
  }

  // ---------------------------------------------------------------
  // Início (só professor.html)
  // ---------------------------------------------------------------
  let iniciado = false;
  function iniciar() {
    if (iniciado) return;
    if (!emProfessorHtml()) return; // D-66: só professor.html tem roteador
    iniciado = true;
    if (!window.DMC_Portal || typeof window.DMC_Portal.iniciar !== 'function') {
      console.error('[DMC] professor.html sem o núcleo (js/portal/ui.js).');
      return;
    }
    window.DMC_Portal.iniciar(async (ctx) => {
      E.user = ctx.user;
      E.papel = ctx.papel;
      E.vista = doc.getElementById('pf-prof-vista') || ctx.main;
      const sem = doc.getElementById('pf-prof-sem-js');
      if (sem) sem.hidden = true;
      E.ativo = true;
      const r = await resumo();
      E.cursos = cursosDoResumo(r);
      window.addEventListener('hashchange', rotear);
      await rotear();
      atualizarContagens().catch((err) => console.error('[DMC]', err));
    }, {
      pagina: 'backoffice',
      papeis: PAPEIS_EQUIPE,
      area: 'backoffice',
      catalogo: false,
      itens: ({ papel }) => itensDoMenu(papel)
    });
  }

  window.DMC_Professor = Object.freeze({
    registrar,
    iniciar,
    navegar,
    MENU_ESTATICO,
    itensDoMenu,
    abasDaTurma,
    abasDoAluno,
    // acréscimos opcionais (F8)
    resumo,
    ui,
    api,
    primeiroNome,
    temRota: rotaRegistrada
  });

  if (emProfessorHtml()) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', iniciar, { once: true });
    else window.setTimeout(iniciar, 0);
  }
})();
