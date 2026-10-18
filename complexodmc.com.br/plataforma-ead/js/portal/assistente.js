/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/assistente.js (F6b)
   Assistente acadêmico do aluno (assistente.html).
   Spec: PORTAL-UX.md §6.12 (Assistente) · PORTAL-API.md §6.10.3 ·
   PORTAL-ACADEMICO.md §7.0 (HTML só por DMC_UI.html; sem alert/
   confirm/prompt; sem innerHTML com dado cru).

   - Texto do modelo SEMPRE como texto (parágrafos e listas simples);
     nunca HTML; URL escrita pelo modelo não vira link. Links só de
     `acoes` (montadas pelo servidor) e de `fontes` (regulamento).
   - Consentimento: o texto vem LITERAL do servidor; o aceite envia o
     SHA-256 do texto exibido (crypto.subtle), D-54.
   - Nada de rascunho em armazenamento local (D-47): a mensagem que
     falhou continua só no campo.
   - Degradação (fase 1): enquanto o DMC_UI completo (toast, dialogo,
     confirmar — S3 da F0b) não existe, usa um <dialog> próprio
     (pf-ia-dialogo) e a região viva da página. O cliente HTTP lê
     status/codigo/Retry-After (o DMC_Api ainda não os expõe).
   ============================================================= */
(function () {
  'use strict';

  const API = {
    estado: '/portal/me/ia/estado',
    consentimento: '/portal/me/ia/consentimento',
    conversas: '/portal/me/ia/conversas',
    conversa: (id) => `/portal/me/ia/conversas/${encodeURIComponent(id)}`,
    mensagens: (id) => `/portal/me/ia/conversas/${encodeURIComponent(id)}/mensagens`,
    escalonamento: (id, q) => `/portal/me/ia/conversas/${encodeURIComponent(id)}/escalonamento${q ? `?${q}` : ''}`,
    escalar: (id) => `/portal/me/ia/conversas/${encodeURIComponent(id)}/escalar`,
    regulamento: '/portal/regulamento',
    liberacoes: '/liberacoes/me',
    catalogo: '/catalogo'
  };
  const PAGINA_ATENDIMENTO_NOVO = 'atendimentos.html?novo=1';
  const LINK_PRIVACIDADE = '../pages/politica-de-privacidade.html';
  const CATEGORIAS = [
    ['academico', 'Acadêmico'], ['secretaria', 'Secretaria'], ['financeiro', 'Financeiro'], ['tecnico', 'Acesso e tecnologia']
  ];
  const RE_LINK_INTERNO = /^[a-z0-9-]+\.html(\?[^#\s]{0,200})?(#[\w/-]{0,80})?$/;

  const UI = () => window.DMC_UI;
  const h = (partes, ...valores) => UI().html(partes, ...valores);

  // ---------------------------------------------------------------
  // HTTP (lê status, codigo, campos e Retry-After)
  // ---------------------------------------------------------------
  async function pedir(metodo, caminho, corpo, sinal) {
    const base = String(window.DMC_API_BASE || '/api').replace(/\/$/, '');
    const cab = {};
    const token = window.DMC_Api && typeof window.DMC_Api.token === 'function' ? window.DMC_Api.token() : null;
    if (token) cab.Authorization = `Bearer ${token}`;
    if (corpo !== undefined) cab['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(base + caminho, { method: metodo, headers: cab, body: corpo !== undefined ? JSON.stringify(corpo) : undefined, signal: sinal });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      const err = new Error('Não foi possível falar com o servidor. Verifique sua conexão.');
      err.status = 0;
      throw err;
    }
    const texto = await res.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { dados = null; }
    if (res.status === 401) {
      if (window.DMC_Api) window.DMC_Api.setToken(null);
      window.location.replace('login.html?next=assistente.html');
      const err = new Error('Sessão expirada.');
      err.status = 401;
      throw err;
    }
    if (!res.ok) {
      const err = new Error((dados && dados.error) || `Erro ${res.status} no servidor.`);
      err.status = res.status;
      err.codigo = dados && dados.codigo ? dados.codigo : null;
      err.campos = dados && dados.campos ? dados.campos : null;
      err.dados = dados;
      err.requestId = (dados && dados.requestId) || res.headers.get('x-request-id');
      err.retryAfter = Number(res.headers.get('retry-after')) || null;
      throw err;
    }
    return dados;
  }

  // ---------------------------------------------------------------
  // Utilidades de tela
  // ---------------------------------------------------------------
  const $ = (sel, el = document) => el.querySelector(sel);
  /** Ícone de DMC_Icons ou o texto alternativo (o retorno vazio de DMC_UI.icone é um objeto, não falsy). */
  const iconeOu = (chave, alternativo) => { const i = UI().icone(chave); return String(i) ? i : alternativo; };

  function anunciar(texto) {
    const ui = UI();
    if (ui && typeof ui.anunciar === 'function') { ui.anunciar(texto); return; }
    const el = $('[data-ia="anuncio"]');
    if (!el) return;
    el.textContent = '';
    window.setTimeout(() => { el.textContent = texto; }, 30);
  }

  /** Texto do modelo → parágrafos e listas simples (linhas com "- "), sempre escapado. */
  function textoEmBlocos(texto) {
    const blocos = String(texto || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
    return blocos.map((bloco) => {
      const linhas = bloco.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!linhas.length) return '';
      if (linhas.every((l) => /^[-*•]\s+/.test(l))) {
        return h`<ul class="pf-ia-lista">${linhas.map((l) => h`<li>${l.replace(/^[-*•]\s+/, '')}</li>`)}</ul>`;
      }
      return h`<p>${linhas.map((l, i) => (i ? h`<br>${l}` : h`${l}`))}</p>`;
    });
  }

  function fmtHora(iso) {
    try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); } catch { return ''; }
  }

  function grupoDaData(iso) {
    const d = new Date(iso);
    const dia = (x) => x.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const hoje = new Date();
    if (dia(d) === dia(hoje)) return 'Hoje';
    if (hoje.getTime() - d.getTime() < 7 * 24 * 3600 * 1000) return 'Esta semana';
    return 'Anteriores';
  }

  async function sha256Hex(texto) {
    if (!window.crypto || !window.crypto.subtle) return null;
    const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------------------------------------------------------------
  // Diálogo (DMC_UI.dialogo quando existir; senão <dialog> próprio)
  // ---------------------------------------------------------------
  function abrirDialogo({ titulo, conteudo, largura = 'm', aoAbrir }) {
    const dlg = document.createElement('dialog');
    dlg.className = `pf-ia-dialogo pf-ia-dialogo--${largura}`;
    const idTitulo = `pf-ia-dlg-${Math.random().toString(36).slice(2, 8)}`;
    dlg.setAttribute('aria-labelledby', idTitulo);
    dlg.innerHTML = h`<div class="pf-ia-dialogo__caixa">
        <h2 class="pf-ia-dialogo__titulo" id="${idTitulo}">${titulo}</h2>
        <div class="pf-ia-dialogo__conteudo">${conteudo}</div>
      </div>`;
    document.body.appendChild(dlg);
    const fechar = (valor) => { if (dlg.open) dlg.close(valor || ''); };
    dlg.addEventListener('close', () => { dlg.remove(); });
    dlg.addEventListener('cancel', () => fechar(''));
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    if (typeof aoAbrir === 'function') aoAbrir(dlg, fechar);
    return { dlg, fechar };
  }

  /** Confirmação: DMC_UI.confirmar (S3) ou diálogo próprio com data-pf-acao. → Promise<boolean> */
  function confirmar({ titulo, texto, rotuloConfirmar, perigo = false }) {
    const ui = UI();
    if (ui && typeof ui.confirmar === 'function') return Promise.resolve(ui.confirmar({ titulo, texto, rotuloConfirmar, perigo })).then((r) => !!r);
    return new Promise((resolver) => {
      let decidido = false;
      abrirDialogo({
        titulo, largura: 'p',
        conteudo: h`<p>${texto}</p>
          <div class="pf-ia-dialogo__acoes">
            <button type="button" class="dmc-btn dmc-btn--secondary pf-ia-btn" data-pf-acao="cancelar">Cancelar</button>
            <button type="button" class="dmc-btn ${perigo ? 'pf-ia-btn--perigo' : 'dmc-btn--primary'} pf-ia-btn" data-pf-acao="confirmar">${rotuloConfirmar}</button>
          </div>`,
        aoAbrir(dlg, fechar) {
          $('[data-pf-acao="cancelar"]', dlg).focus();
          dlg.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-pf-acao]');
            if (!b) return;
            decidido = true;
            fechar(b.dataset.pfAcao);
            resolver(b.dataset.pfAcao === 'confirmar');
          });
          dlg.addEventListener('close', () => { if (!decidido) resolver(false); });
        }
      });
    });
  }

  // ---------------------------------------------------------------
  // Estado da página
  // ---------------------------------------------------------------
  const st = {
    ctx: null,
    estado: null,
    conversaId: null,
    mensagens: [],
    escalouPara: null,
    conversas: [],
    enviando: false,
    regulamentoIds: null,       // Set dos regulamentos publicados (lido 1× quando há fontes)
    regulamentoLido: false,
    pendenteTexto: ''
  };

  const els = {};

  // ---------------------------------------------------------------
  // Corpo: estados honestos, consentimento e chat
  // ---------------------------------------------------------------
  const TEXTOS_MOTIVO = {
    'ia-desligada': 'O assistente não está disponível no momento.',
    'ia-sem-chave': 'O assistente não está disponível no momento.',
    'chave-ilegivel': 'O assistente não está disponível no momento.',
    'teto-global': 'O assistente atingiu o limite de uso de hoje. Tente amanhã ou fale com a equipe.',
    'sem-curso': 'O assistente atende alunos com curso liberado ou matrícula ativa.'
  };

  function renderIndisponivel(motivo) {
    els.corpo.setAttribute('aria-busy', 'false');
    els.corpo.innerHTML = h`<div class="pf-ia-estado" data-ia-estado="${motivo}">
        <p class="pf-ia-estado__texto">${TEXTOS_MOTIVO[motivo] || 'O assistente não está disponível no momento.'}</p>
        <a class="dmc-btn dmc-btn--primary pf-ia-btn" href="${PAGINA_ATENDIMENTO_NOVO}">Iniciar atendimento com a equipe</a>
      </div>
      ${st.mensagens.length ? h`<div class="pf-ia-log" role="log" aria-live="polite" aria-label="Mensagens da conversa" data-ia="log"></div>` : ''}`;
    els.log = $('[data-ia="log"]', els.corpo);
    if (els.log) renderMensagens();
  }

  function renderConsentimento({ aviso = null, erro = null } = {}) {
    const c = st.estado.consentimento;
    const paragrafos = String(c.texto || '').split(/\n+/).filter(Boolean);
    els.corpo.setAttribute('aria-busy', 'false');
    els.corpo.innerHTML = h`<section class="pf-ia-consentimento" data-ia="consentimento" tabindex="-1" aria-labelledby="pf-ia-cons-titulo">
        <h2 class="pf-ia-consentimento__titulo" id="pf-ia-cons-titulo">Antes de começar</h2>
        ${aviso ? h`<p class="pf-ia-alerta pf-ia-alerta--info" role="status">${aviso}</p>` : ''}
        <div class="pf-ia-consentimento__texto pf-leitura">${paragrafos.map((p) => h`<p>${p}</p>`)}</div>
        <p class="pf-ia-consentimento__versao">Versão ${c.versaoTexto} do texto</p>
        <p><a class="pf-ia-link" href="${LINK_PRIVACIDADE}">Política de privacidade</a></p>
        ${c.registroIndisponivel ? h`<p class="pf-ia-alerta pf-ia-alerta--aviso" role="status">O registro de autorizações está indisponível no momento. Tente mais tarde ou fale com a equipe.</p>` : ''}
        ${erro ? h`<p class="pf-ia-alerta pf-ia-alerta--erro" role="alert">${erro}</p>` : ''}
        <div class="pf-ia-consentimento__acoes">
          <button type="button" class="dmc-btn dmc-btn--primary pf-ia-btn" data-ia="aceitar">Concordo e quero usar</button>
          <a class="dmc-btn dmc-btn--secondary pf-ia-btn" href="${PAGINA_ATENDIMENTO_NOVO}">Agora não, falar com a equipe</a>
        </div>
      </section>`;
    $('[data-ia="aceitar"]', els.corpo).addEventListener('click', aceitarConsentimento);
    if (aviso || erro) $('[data-ia="consentimento"]', els.corpo).focus();
  }

  async function aceitarConsentimento(ev) {
    const botao = ev.currentTarget;
    botao.disabled = true;
    botao.setAttribute('aria-busy', 'true');
    const c = st.estado.consentimento;
    try {
      const textoSha256 = await sha256Hex(c.texto);
      await pedir('POST', API.consentimento, { aceito: true, versaoTexto: c.versaoTexto, ...(textoSha256 ? { textoSha256 } : {}) }, st.ctx.sinal);
      st.estado.consentimento = { ...c, necessario: false };
      renderChat();
      anunciar('Autorização registrada. Você já pode escrever sua pergunta.');
      if (st.pendenteTexto && els.campo) { els.campo.value = st.pendenteTexto; atualizarContador(); }
      if (els.campo) els.campo.focus();
    } catch (err) {
      if (err.status === 409) {
        st.estado = await pedir('GET', API.estado, undefined, st.ctx.sinal);
        renderConsentimento({ aviso: 'O texto da autorização foi atualizado. Leia a versão atual antes de concordar.' });
        return;
      }
      renderConsentimento({ erro: err.message || 'Não foi possível registrar a autorização agora.' });
    }
  }

  function renderChat() {
    const e = st.estado;
    const limite = Number(e.limites && e.limites.caracteresPorMensagem) || 2000;
    els.corpo.setAttribute('aria-busy', 'false');
    els.corpo.innerHTML = h`<div class="pf-ia-boasvindas" data-ia="boasvindas">
        <h2 class="pf-ia-saudacao">${e.saudacao}</h2>
        <p class="pf-ia-intro">Posso ajudar com seus cursos, notas, frequência, documentos e prazos.</p>
        <div class="pf-ia-sugestoes" role="group" aria-label="Perguntas sugeridas">
          ${(e.sugestoes || []).map((s) => h`<button type="button" class="dmc-btn dmc-btn--secondary pf-ia-btn pf-ia-sugestao" data-ia-sugestao="${s}">${s}</button>`)}
        </div>
      </div>
      <div class="pf-ia-escalada" data-ia="escalada" hidden></div>
      <div class="pf-ia-log" role="log" aria-live="polite" aria-label="Mensagens da conversa" data-ia="log"></div>
      <p class="pf-ia-escrevendo" role="status" data-ia="escrevendo"></p>
      <div class="pf-ia-erro" data-ia="erro"></div>
      <form class="pf-ia-compositor" data-ia="compositor" novalidate>
        <label class="pf-ia-compositor__rotulo" for="pf-ia-campo">Sua pergunta</label>
        <div class="pf-ia-compositor__linha">
          <textarea id="pf-ia-campo" class="pf-ia-compositor__campo" name="mensagem" rows="1" maxlength="${limite}"
            placeholder="Escreva sua pergunta…" aria-describedby="pf-ia-dica pf-ia-contador" autocomplete="off"></textarea>
          <button type="submit" class="dmc-btn dmc-btn--primary pf-ia-btn" data-ia="enviar">Enviar</button>
        </div>
        <p class="pf-ia-compositor__dica"><span id="pf-ia-dica">Enter envia; Shift+Enter quebra a linha.</span>
          <span id="pf-ia-contador" class="pf-ia-contador" data-ia="contador" aria-live="off"></span></p>
      </form>
      <p class="pf-ia-aviso" data-ia="aviso">${e.aviso}</p>`;
    els.log = $('[data-ia="log"]', els.corpo);
    els.campo = $('#pf-ia-campo', els.corpo);
    els.enviar = $('[data-ia="enviar"]', els.corpo);
    els.escrevendo = $('[data-ia="escrevendo"]', els.corpo);
    els.erro = $('[data-ia="erro"]', els.corpo);
    els.contador = $('[data-ia="contador"]', els.corpo);
    els.boasvindas = $('[data-ia="boasvindas"]', els.corpo);
    els.limite = limite;

    $('[data-ia="compositor"]', els.corpo).addEventListener('submit', (ev) => { ev.preventDefault(); enviar(); });
    els.campo.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); enviar(); }
    });
    els.campo.addEventListener('input', () => { atualizarContador(); ajustarAltura(); });
    els.corpo.querySelectorAll('[data-ia-sugestao]').forEach((b) => {
      b.addEventListener('click', () => { els.campo.value = b.dataset.iaSugestao; atualizarContador(); enviar(); });
    });
    renderMensagens();
    atualizarContador();
  }

  function ajustarAltura() {
    const c = els.campo;
    if (!c) return;
    c.style.height = 'auto';
    const linha = parseFloat(getComputedStyle(c).lineHeight) || 24;
    c.style.height = `${Math.min(c.scrollHeight, linha * 6 + 16)}px`;
  }

  function atualizarContador() {
    if (!els.contador || !els.campo) return;
    const n = els.campo.value.length;
    const resta = els.limite - n;
    els.contador.textContent = resta <= 200 ? `${resta} caracteres restantes` : '';
  }

  // ---------------------------------------------------------------
  // Mensagens
  // ---------------------------------------------------------------
  function linkDaFonte(f) {
    if (!f || !f.regulamentoId || !f.trechoId) return null;
    if (st.regulamentoIds && !st.regulamentoIds.has(String(f.regulamentoId))) return null; // edição arquivada: só o título
    return `regulamento.html#r-${encodeURIComponent(f.regulamentoId)}-${encodeURIComponent(f.trechoId)}`;
  }

  function htmlMensagem(m) {
    if (m.papel === 'aluno') {
      return h`<div class="pf-ia-msg pf-ia-msg--aluno" data-ia-msg="${m.id || ''}">
          <p class="pf-ia-msg__rotulo pf-ia-visualmente-oculto">Você</p>
          <div class="pf-ia-msg__texto">${textoEmBlocos(m.texto)}</div>
        </div>`;
    }
    const acoes = (m.acoes || []).filter((a) => a && RE_LINK_INTERNO.test(String(a.href)));
    const fontes = m.fontes || [];
    return h`<div class="pf-ia-msg pf-ia-msg--assistente${m.bloqueada ? ' is-bloqueada' : ''}" data-ia-msg="${m.id || ''}">
        <p class="pf-ia-msg__rotulo">Assistente${m.em ? h` <span class="pf-ia-msg__hora">${fmtHora(m.em)}</span>` : ''}</p>
        <div class="pf-ia-msg__texto">${textoEmBlocos(m.texto)}</div>
        ${fontes.length ? h`<div class="pf-ia-fontes"><p class="pf-ia-fontes__rotulo">Fontes</p><ul>${fontes.map((f) => {
          const href = linkDaFonte(f);
          return href ? h`<li><a class="pf-ia-link pf-ia-fonte" href="${href}">${f.titulo || 'Regulamento acadêmico'}</a></li>`
            : h`<li><span class="pf-ia-fonte">${f.titulo || 'Regulamento acadêmico'}</span></li>`;
        })}</ul></div>` : ''}
        ${acoes.length ? h`<ul class="pf-ia-acoes">${acoes.map((a) => h`<li><a class="pf-ia-link pf-ia-acao" href="${a.href}">${a.rotulo} →</a></li>`)}</ul>` : ''}
        ${m.sugerirAtendimento && !acoes.some((a) => /#equipe$/.test(a.href)) ? h`<p><button type="button" class="pf-ia-link" data-ia="equipe-msg">Falar com a equipe →</button></p>` : ''}
      </div>`;
  }

  function renderMensagens() {
    if (!els.log) return;
    els.log.innerHTML = h`${st.mensagens.map(htmlMensagem)}`;
    els.log.querySelectorAll('[data-ia="equipe-msg"]').forEach((b) => b.addEventListener('click', abrirEquipe));
    if (els.boasvindas) els.boasvindas.hidden = st.mensagens.length > 0;
    const esc = $('[data-ia="escalada"]', els.corpo);
    if (esc) {
      if (st.escalouPara && st.escalouPara.protocolo) {
        esc.hidden = false;
        esc.innerHTML = h`<p class="pf-ia-alerta pf-ia-alerta--info">Esta conversa virou o atendimento ${st.escalouPara.protocolo}.
          <a class="pf-ia-link" href="atendimentos.html?protocolo=${encodeURIComponent(st.escalouPara.protocolo)}">Ver atendimento</a></p>`;
      } else { esc.hidden = true; esc.textContent = ''; }
    }
    const ultima = els.log.lastElementChild;
    if (ultima && typeof ultima.scrollIntoView === 'function') ultima.scrollIntoView({ block: 'end' });
    if (st.mensagens.some((m) => (m.fontes || []).length) && !st.regulamentoLido) lerRegulamento();
  }

  async function lerRegulamento() {
    st.regulamentoLido = true;
    try {
      const r = await pedir('GET', API.regulamento, undefined, st.ctx.sinal);
      st.regulamentoIds = new Set(((r && r.itens) || []).map((i) => String(i.id)));
      renderMensagens();
    } catch { st.regulamentoIds = null; /* link segue para a página, que trata a âncora */ }
  }

  function mostrarErro(texto, { tentar = false } = {}) {
    if (!els.erro) return;
    els.erro.innerHTML = h`<p class="pf-ia-alerta pf-ia-alerta--erro" role="alert">${texto}
        ${tentar ? h` <button type="button" class="pf-ia-link" data-ia="tentar">Tentar de novo</button>` : ''}
        <button type="button" class="pf-ia-link" data-ia="equipe-erro">Falar com a equipe</button></p>`;
    const t = $('[data-ia="tentar"]', els.erro);
    if (t) t.addEventListener('click', enviar);
    $('[data-ia="equipe-erro"]', els.erro).addEventListener('click', abrirEquipe);
  }

  function horaDeVolta(seg) {
    if (!seg) return null;
    return new Date(Date.now() + seg * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  }

  async function enviar() {
    if (st.enviando || !els.campo) return;
    const texto = els.campo.value.trim();
    if (!texto) { els.campo.focus(); return; }
    if (texto.length > els.limite) { mostrarErro(`Use no máximo ${els.limite} caracteres.`); return; }
    st.enviando = true;
    els.erro.textContent = '';
    els.enviar.disabled = true;
    els.enviar.setAttribute('aria-busy', 'true');
    const provisoria = { id: 'provisoria', papel: 'aluno', texto };
    st.mensagens.push(provisoria);
    renderMensagens();
    els.escrevendo.textContent = 'Assistente escrevendo…';
    try {
      let r;
      if (st.conversaId) {
        r = await pedir('POST', API.mensagens(st.conversaId), { mensagem: texto }, st.ctx.sinal);
      } else {
        r = await pedir('POST', API.conversas, { mensagem: texto }, st.ctx.sinal);
        st.conversaId = r.conversa.id;
      }
      st.mensagens = st.mensagens.filter((m) => m !== provisoria).concat(r.mensagens || []);
      els.campo.value = '';
      atualizarContador();
      ajustarAltura();
      renderMensagens();
      const resp = (r.mensagens || [])[1];
      anunciar(resp ? 'Resposta do assistente recebida.' : 'Mensagem enviada.');
      carregarHistorico();
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      st.mensagens = st.mensagens.filter((m) => m !== provisoria);
      renderMensagens();
      tratarErroDeEnvio(err, texto);
    } finally {
      st.enviando = false;
      if (els.enviar) { els.enviar.disabled = false; els.enviar.removeAttribute('aria-busy'); }
      if (els.escrevendo) els.escrevendo.textContent = '';
    }
  }

  async function tratarErroDeEnvio(err, texto) {
    const cod = err.codigo;
    if (err.status === 428) {
      st.pendenteTexto = texto;
      try { st.estado = await pedir('GET', API.estado, undefined, st.ctx.sinal); } catch { /* mantém o anterior */ }
      st.estado.consentimento = { ...st.estado.consentimento, necessario: true };
      renderConsentimento({ aviso: 'É preciso registrar a sua autorização para continuar. Sua pergunta foi guardada neste campo.' });
      return;
    }
    if (err.status === 429 && cod === 'limite') {
      const hora = horaDeVolta(err.retryAfter);
      const janela = err.dados && err.dados.janela === 'dia' ? 'do dia' : 'por hora';
      mostrarErro(`Você atingiu o limite de mensagens ${janela}.${hora ? ` Tente de novo às ${hora}` : ' Tente de novo mais tarde'} ou fale com a equipe.`);
      return;
    }
    if (err.status === 503 && err.dados && err.dados.motivo === 'teto-global') {
      mostrarErro(TEXTOS_MOTIVO['teto-global']);
      return;
    }
    if (cod === 'conversa-longa') { mostrarErro('Conversa longa demais. Comece uma nova conversa.'); return; }
    if (cod === 'ia-desligada' || cod === 'ia-sem-chave' || cod === 'chave-ilegivel' || cod === 'ia-sem-curso') {
      renderIndisponivel(cod === 'ia-sem-curso' ? 'sem-curso' : cod);
      return;
    }
    if (err.status === 400) { mostrarErro(err.message || 'Confira a mensagem.'); return; }
    mostrarErro('Não consegui responder agora. Tente de novo ou fale com a equipe.', { tentar: true });
  }

  // ---------------------------------------------------------------
  // Histórico lateral
  // ---------------------------------------------------------------
  async function carregarHistorico() {
    try {
      const r = await pedir('GET', API.conversas, undefined, st.ctx.sinal);
      st.conversas = (r && r.itens) || [];
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      els.historico.innerHTML = h`<p class="pf-ia-nota" role="alert">Não foi possível carregar as conversas.</p>`;
      return;
    }
    renderHistorico();
  }

  function renderHistorico() {
    els.apagarTudo.hidden = st.conversas.length === 0;
    if (!st.conversas.length) {
      els.historico.innerHTML = h`<p class="pf-ia-nota">Nenhuma conversa ainda.</p>`;
      return;
    }
    const grupos = { Hoje: [], 'Esta semana': [], Anteriores: [] };
    for (const c of st.conversas) grupos[grupoDaData(c.atualizadaEm)].push(c);
    els.historico.innerHTML = h`${Object.entries(grupos).filter(([, l]) => l.length).map(([nome, lista]) => h`
      <section class="pf-ia-grupo" aria-label="${nome}">
        <h3 class="pf-ia-grupo__titulo">${nome}</h3>
        <ul class="pf-ia-grupo__lista">${lista.map((c) => h`<li class="pf-ia-item${c.id === st.conversaId ? ' is-atual' : ''}">
          <button type="button" class="pf-ia-item__abrir" data-ia-abrir="${c.id}"${c.id === st.conversaId ? h` aria-current="true"` : ''}>${c.titulo || 'Conversa'}</button>
          <button type="button" class="pf-ia-item__apagar" data-ia-apagar="${c.id}" aria-label="Apagar conversa: ${c.titulo || 'Conversa'}">${iconeOu('trash', '×')}</button>
        </li>`)}</ul>
      </section>`)}`;
    els.historico.querySelectorAll('[data-ia-abrir]').forEach((b) => b.addEventListener('click', () => abrirConversa(b.dataset.iaAbrir)));
    els.historico.querySelectorAll('[data-ia-apagar]').forEach((b) => b.addEventListener('click', () => apagarConversa(b.dataset.iaApagar)));
  }

  async function abrirConversa(id) {
    fecharLateralMovel();
    try {
      const c = await pedir('GET', API.conversa(id), undefined, st.ctx.sinal);
      st.conversaId = c.id;
      st.mensagens = c.mensagens || [];
      st.escalouPara = c.escalouPara || null;
      if (st.estado.disponivel && !st.estado.consentimento.necessario) {
        if (!els.campo) renderChat(); else renderMensagens();
      } else if (!st.estado.disponivel) renderIndisponivel(st.estado.motivo);
      else renderMensagens();
      renderHistorico();
      if (els.campo) els.campo.focus();
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      anunciar('Não foi possível abrir a conversa.');
      carregarHistorico();
    }
  }

  function novaConversa() {
    fecharLateralMovel();
    st.conversaId = null;
    st.mensagens = [];
    st.escalouPara = null;
    if (st.estado && st.estado.disponivel && !st.estado.consentimento.necessario) {
      if (!els.campo) renderChat(); else { renderMensagens(); if (els.erro) els.erro.textContent = ''; }
      els.campo.focus();
    }
    renderHistorico();
  }

  async function apagarConversa(id) {
    const ok = await confirmar({ titulo: 'Apagar conversa', texto: 'A conversa some do seu histórico. Esta ação não pode ser desfeita.', rotuloConfirmar: 'Apagar conversa', perigo: true });
    if (!ok) return;
    try {
      await pedir('DELETE', API.conversa(id), undefined, st.ctx.sinal);
      if (st.conversaId === id) novaConversa();
      anunciar('Conversa apagada.');
    } catch { anunciar('Não foi possível apagar a conversa.'); }
    carregarHistorico();
  }

  async function apagarTudo() {
    const ok = await confirmar({ titulo: 'Apagar todo o histórico', texto: 'Todas as suas conversas com o assistente serão apagadas. Esta ação não pode ser desfeita.', rotuloConfirmar: 'Apagar tudo', perigo: true });
    if (!ok) return;
    try {
      await pedir('DELETE', API.conversas, undefined, st.ctx.sinal);
      novaConversa();
      anunciar('Histórico apagado.');
    } catch { anunciar('Não foi possível apagar o histórico.'); }
    carregarHistorico();
  }

  function fecharLateralMovel() {
    els.layout.classList.remove('is-lateral-aberta');
    els.alternar.setAttribute('aria-expanded', 'false');
  }

  // ---------------------------------------------------------------
  // Falar com a equipe (escalonamento)
  // ---------------------------------------------------------------
  let cursosDoAluno = null;
  async function carregarCursos() {
    if (cursosDoAluno) return cursosDoAluno;
    try {
      const [lib, cat] = await Promise.all([pedir('GET', API.liberacoes, undefined, st.ctx.sinal), pedir('GET', API.catalogo, undefined, st.ctx.sinal)]);
      const titulos = new Map(((cat && cat.cursos) || []).map((c) => [String(c.id || c._id), c.titulo]));
      cursosDoAluno = ((lib && lib.cursoIds) || []).map((id) => ({ id, titulo: titulos.get(String(id)) || id }));
    } catch { cursosDoAluno = []; }
    return cursosDoAluno;
  }

  function abrirEquipe() {
    if (!st.conversaId || !st.mensagens.length) { window.location.href = PAGINA_ATENDIMENTO_NOVO; return; }
    if (st.escalouPara && st.escalouPara.protocolo) {
      abrirDialogo({
        titulo: 'Falar com a equipe', largura: 'p',
        conteudo: h`<p>Esta conversa já virou o atendimento ${st.escalouPara.protocolo}.</p>
          <div class="pf-ia-dialogo__acoes"><button type="button" class="dmc-btn dmc-btn--secondary pf-ia-btn" data-pf-acao="cancelar">Fechar</button>
          <a class="dmc-btn dmc-btn--primary pf-ia-btn" href="atendimentos.html?protocolo=${encodeURIComponent(st.escalouPara.protocolo)}">Ver atendimento</a></div>`,
        aoAbrir(dlg, fechar) { $('[data-pf-acao="cancelar"]', dlg).addEventListener('click', () => fechar()); }
      });
      return;
    }
    const conversaId = st.conversaId;
    abrirDialogo({
      titulo: 'Falar com a equipe',
      conteudo: h`<form class="pf-ia-form" data-ia="form-equipe" novalidate aria-busy="true">
          <p class="pf-ia-nota">Para pedidos sobre seus dados pessoais, use <a class="pf-ia-link" href="meus-dados.html">Meus dados</a>.</p>
          <div class="pf-ia-campo">
            <label for="pf-ia-cat">Categoria</label>
            <select id="pf-ia-cat" name="categoria">${CATEGORIAS.map(([v, r]) => h`<option value="${v}">${r}</option>`)}</select>
          </div>
          <div class="pf-ia-campo" data-ia="campo-curso" hidden>
            <label for="pf-ia-curso">Curso relacionado (opcional)</label>
            <select id="pf-ia-curso" name="cursoId"><option value="">Nenhum</option></select>
          </div>
          <div class="pf-ia-campo">
            <label for="pf-ia-assunto">Assunto</label>
            <input id="pf-ia-assunto" name="assunto" type="text" minlength="5" maxlength="140" required autocomplete="off">
            <p class="pf-ia-campo__erro" data-erro="assunto" role="alert"></p>
          </div>
          <div class="pf-ia-campo">
            <label for="pf-ia-resumo">Resumo</label>
            <textarea id="pf-ia-resumo" name="resumo" rows="5" minlength="10" maxlength="4000" required aria-describedby="pf-ia-resumo-ajuda"></textarea>
            <p class="pf-ia-campo__ajuda" id="pf-ia-resumo-ajuda">Revise o resumo antes de enviar (10 a 4.000 caracteres).</p>
            <p class="pf-ia-campo__erro" data-erro="resumo" role="alert"></p>
          </div>
          <p class="pf-ia-quem">Quem atende: <strong data-ia="fila">—</strong></p>
          <div class="pf-ia-check">
            <input id="pf-ia-anexar" name="incluirConversa" type="checkbox" aria-describedby="pf-ia-anexar-ajuda">
            <label for="pf-ia-anexar">Anexar esta conversa ao atendimento</label>
            <p class="pf-ia-campo__ajuda" id="pf-ia-anexar-ajuda">A equipe que atender verá esta conversa.</p>
          </div>
          <p class="pf-ia-alerta pf-ia-alerta--info" data-ia="omissao" hidden></p>
          <div data-ia="resultado"></div>
          <div class="pf-ia-dialogo__acoes" data-ia="acoes-form">
            <button type="button" class="dmc-btn dmc-btn--secondary pf-ia-btn" data-pf-acao="cancelar">Cancelar</button>
            <button type="submit" class="dmc-btn dmc-btn--primary pf-ia-btn" data-pf-acao="confirmar">Abrir atendimento</button>
          </div>
        </form>`,
      aoAbrir: (dlg, fechar) => montarFormEquipe(dlg, fechar, conversaId)
    });
  }

  async function montarFormEquipe(dlg, fechar, conversaId) {
    const form = $('[data-ia="form-equipe"]', dlg);
    const cat = $('#pf-ia-cat', dlg);
    const curso = $('#pf-ia-curso', dlg);
    const campoCurso = $('[data-ia="campo-curso"]', dlg);
    const resumo = $('#pf-ia-resumo', dlg);
    const anexar = $('#pf-ia-anexar', dlg);
    const omissao = $('[data-ia="omissao"]', dlg);
    const fila = $('[data-ia="fila"]', dlg);
    let resumoEditado = false;
    let previa = null;
    $('[data-pf-acao="cancelar"]', dlg).addEventListener('click', () => fechar());
    resumo.addEventListener('input', () => { resumoEditado = true; });

    const atualizarOmissao = () => {
      const n = previa ? previa.omitiriaMensagens : 0;
      const mostrar = anexar.checked && previa && previa.filaPrevista === 'professores_do_curso' && n > 0;
      omissao.hidden = !mostrar;
      omissao.textContent = mostrar ? `${n} ${n === 1 ? 'pergunta' : 'perguntas'} sobre documentos, contratos ou financeiro (e as respostas) não serão anexadas. Elas continuam na sua conversa.` : '';
    };
    const pedirPrevia = async (comFiltro) => {
      const q = comFiltro ? new URLSearchParams({ categoria: cat.value, ...(curso.value ? { cursoId: curso.value } : {}) }).toString() : '';
      try {
        previa = await pedir('GET', API.escalonamento(conversaId, q), undefined, st.ctx.sinal);
      } catch (err) {
        previa = null;
        $('[data-ia="resultado"]', dlg).innerHTML = h`<p class="pf-ia-alerta pf-ia-alerta--erro" role="alert">${err.message || 'Não foi possível preparar o resumo.'}</p>`;
        return;
      }
      if (!comFiltro && previa.categoriaSugerida) cat.value = previa.categoriaSugerida;
      if (!resumoEditado) resumo.value = previa.resumoSugerido || '';
      fila.textContent = previa.filaPrevista === 'professores_do_curso' ? 'Professores do curso' : 'Coordenação';
      campoCurso.hidden = cat.value !== 'academico';
      atualizarOmissao();
    };

    await pedirPrevia(false);
    form.setAttribute('aria-busy', 'false');
    const cursos = await carregarCursos();
    curso.innerHTML = h`<option value="">Nenhum</option>${cursos.map((c) => h`<option value="${c.id}">${c.titulo}</option>`)}`;
    cat.addEventListener('change', () => { if (cat.value !== 'academico') curso.value = ''; pedirPrevia(true); });
    curso.addEventListener('change', () => pedirPrevia(true));
    anexar.addEventListener('change', atualizarOmissao);
    $('#pf-ia-assunto', dlg).focus();

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const assunto = $('#pf-ia-assunto', dlg).value.trim();
      const texto = resumo.value.trim();
      const erroDe = (campo, msg) => { $(`[data-erro="${campo}"]`, dlg).textContent = msg || ''; };
      erroDe('assunto'); erroDe('resumo');
      let invalido = false;
      if (assunto.length < 5) { erroDe('assunto', 'Use pelo menos 5 caracteres.'); invalido = true; }
      if (texto.length < 10) { erroDe('resumo', 'Use pelo menos 10 caracteres.'); invalido = true; }
      if (invalido) return;
      const botao = $('[data-pf-acao="confirmar"]', dlg);
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      const res = $('[data-ia="resultado"]', dlg);
      try {
        const corpo = { categoria: cat.value, assunto, resumo: texto, ...(curso.value && cat.value === 'academico' ? { cursoId: curso.value } : {}), ...(anexar.checked ? { incluirConversa: true } : {}) };
        const r = await pedir('POST', API.escalar(conversaId), corpo, st.ctx.sinal);
        st.escalouPara = { protocolo: r.protocolo };
        const extra = r.anexo ? ` A conversa foi anexada.${r.anexo.omitidas > 0 ? ' Os trechos sobre documentos, contratos ou financeiro ficaram de fora.' : ''}` : '';
        res.innerHTML = h`<p class="pf-ia-alerta pf-ia-alerta--sucesso" role="status">Atendimento ${r.protocolo} aberto. A equipe responde por aqui e você recebe uma notificação.${extra}</p>
          <p><a class="dmc-btn dmc-btn--primary pf-ia-btn" href="atendimentos.html?protocolo=${encodeURIComponent(r.protocolo)}">Ver atendimento</a></p>`;
        $('[data-ia="acoes-form"]', dlg).hidden = true;
        renderMensagens();
        carregarHistorico();
      } catch (err) {
        botao.disabled = false;
        botao.removeAttribute('aria-busy');
        if (err.codigo === 'ja-escalada') {
          const p = err.dados && err.dados.protocolo;
          st.escalouPara = p ? { protocolo: p } : st.escalouPara;
          res.innerHTML = h`<p class="pf-ia-alerta pf-ia-alerta--info" role="status">Esta conversa já virou o atendimento ${p || ''}.
            ${p ? h`<a class="pf-ia-link" href="atendimentos.html?protocolo=${encodeURIComponent(p)}">Ver atendimento</a>` : ''}</p>`;
          return;
        }
        if (err.codigo === 'servico-indisponivel') {
          res.innerHTML = h`<p class="pf-ia-alerta pf-ia-alerta--erro" role="alert">Não foi possível abrir o atendimento por aqui agora.
            <a class="pf-ia-link" href="${PAGINA_ATENDIMENTO_NOVO}">Iniciar atendimento em Seus atendimentos</a></p>`;
          return;
        }
        if (err.campos) for (const [k, v] of Object.entries(err.campos)) { const alvo = $(`[data-erro="${k}"]`, dlg); if (alvo) alvo.textContent = v; }
        res.innerHTML = h`<p class="pf-ia-alerta pf-ia-alerta--erro" role="alert">${err.message || 'Não foi possível abrir o atendimento.'}</p>`;
      }
    });
  }

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  async function boot(ctx) {
    st.ctx = ctx;
    els.layout = $('[data-ia="layout"]');
    els.corpo = $('[data-ia="corpo"]');
    els.historico = $('[data-ia="historico"]');
    els.apagarTudo = $('[data-ia="apagar-tudo"]');
    els.alternar = $('[data-ia="alternar-lateral"]');

    $('[data-ia="nova"]').addEventListener('click', novaConversa);
    els.apagarTudo.addEventListener('click', apagarTudo);
    $('[data-ia="equipe"]').addEventListener('click', abrirEquipe);
    els.alternar.addEventListener('click', () => {
      const aberta = els.layout.classList.toggle('is-lateral-aberta');
      els.alternar.setAttribute('aria-expanded', String(aberta));
      if (aberta) { const b = $('[data-ia="nova"]'); if (b) b.focus(); }
    });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && els.layout.classList.contains('is-lateral-aberta')) { fecharLateralMovel(); els.alternar.focus(); } });
    window.addEventListener('hashchange', () => { if (window.location.hash === '#equipe') { abrirEquipe(); history.replaceState(null, '', 'assistente.html'); } });

    st.estado = await pedir('GET', API.estado, undefined, ctx.sinal);
    carregarHistorico();
    if (!st.estado.disponivel) renderIndisponivel(st.estado.motivo);
    else if (st.estado.consentimento && st.estado.consentimento.necessario) renderConsentimento();
    else renderChat();
  }

  function iniciar() {
    if (window.DMC_Portal && typeof window.DMC_Portal.iniciar === 'function') {
      window.DMC_Portal.iniciar(boot, { pagina: 'atendimento', papeis: ['aluno', 'professor', 'admin'] });
    }
  }
  iniciar();
})();
