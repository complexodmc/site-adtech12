/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/perfil.js (F0p)
   Tela: perfil.html — PORTAL-UX.md §6.15 (seções, consentimentos,
   modo restrito), §4.5 (campo), §9 (microcopy).
   API: PORTAL-API.md §6.1 (senha, 2FA, sessões), §6.3.1–§6.3.3
   (perfil, CEP, foto, consentimentos). Índice: §7.4 (DMC_Portal,
   modo restrito D-63), §7.5 (DMC_UI), M10 (cada campo do perfil).

   Lacunas do núcleo ainda em obra (F0b/F0s), tratadas aqui sem
   editar arquivo de outra fatia (registradas no relatório):
   - DMC_Api ainda não devolve status/codigo/campos no erro (§7.1):
     o módulo usa `chamar()` local (fetch com o mesmo token e a
     mesma base; 401 limpa o token como o cliente da casa).
   - DMC_UI.toast/confirmar/consentimento/fmt/mascara ausentes: há
     versões locais com o mesmo contrato; quando a F0b publicar, as
     dela passam a valer (prioridade na escolha abaixo).
   - DMC_QR (qr.js) só é pedido quando a pessoa ativa o 2FA.
   ============================================================= */
(function () {
  'use strict';

  const UI = window.DMC_UI;
  if (!UI || !window.DMC_Portal) return;
  const html = UI.html;
  const cru = UI.cru;

  const API = {
    perfil: '/portal/me/perfil',
    foto: '/portal/me/perfil/foto',
    email: '/portal/me/perfil/email',
    verificarEmail: '/portal/me/email/verificacao',
    cep: (cep) => `/portal/cep/${encodeURIComponent(cep)}`,
    consentimentos: '/portal/me/dados/consentimentos',
    revogar: (f) => `/portal/me/dados/consentimentos/${encodeURIComponent(f)}/revogar`,
    recursos: '/auth/recursos',
    doisFatores: '/auth/2fa',
    doisFatoresIniciar: '/auth/2fa/iniciar',
    doisFatoresAtivar: '/auth/2fa/ativar',
    doisFatoresDesativar: '/auth/2fa/desativar',
    doisFatoresCodigos: '/auth/2fa/codigos',
    trocarSenha: '/auth/senha/trocar',
    encerrarOutras: '/auth/sessoes/encerrar-outras'
  };
  const QR_JS = 'js/portal/qr.js?v=dev';

  // ---------------------------------------------------------------
  // Núcleo local (ver cabeçalho)
  // ---------------------------------------------------------------
  /** 401 com sessão aberta: volta ao login com next (o que foi digitado não vai a rascunho, D-47). */
  function sessaoEncerrada() {
    try { window.sessionStorage.setItem('dmc:aviso', 'Sua sessão terminou. Entre de novo para continuar.'); } catch { /* sem storage */ }
    E.alterados.clear();
    let seg = String(window.location.pathname).split('/').pop() || '';
    if (seg && !/\.[a-z0-9]+$/i.test(seg)) seg += '.html';
    const atual = seg + window.location.search;
    const next = /^[a-z0-9_-]+\.html(\?.*)?$/i.test(atual) ? atual : '';
    window.location.replace(next ? `login.html?next=${encodeURIComponent(next)}` : 'login.html');
  }

  const BASE = String(window.DMC_API_BASE || '/api').replace(/\/$/, '');

  function erroDe(status, dados, res) {
    const msg = (dados && dados.error) || (status ? `Erro ${status} no servidor.` : 'Sem conexão. Verifique a internet e tente de novo.');
    return Object.assign(new Error(msg), {
      status,
      codigo: dados && dados.codigo,
      campos: dados && dados.campos,
      requestId: (dados && dados.requestId) || (res && res.headers.get('X-Request-Id')) || undefined,
      dados: dados || undefined
    });
  }

  async function bruto(metodo, caminho, { corpo, tipo, sinal } = {}) {
    const A = window.DMC_Api;
    const cab = {};
    const t = A && A.token();
    if (t) cab.Authorization = `Bearer ${t}`;
    if (corpo !== undefined) cab['Content-Type'] = tipo || 'application/json';
    let res;
    try {
      res = await fetch(BASE + caminho, { method: metodo, headers: cab, body: corpo, signal: sinal, credentials: 'same-origin' });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw erroDe(0, null, null);
    }
    if (res.status === 401 && A) {
      const tinhaSessao = !!A.token();
      A.setToken(null);
      if (tinhaSessao) sessaoEncerrada();
    }
    return res;
  }

  async function chamar(metodo, caminho, corpo, opcoes) {
    const o = opcoes || {};
    const res = await bruto(metodo, caminho, { corpo: corpo === undefined ? undefined : JSON.stringify(corpo), sinal: o.sinal });
    if (res.status === 404 && o.silencioso404) return null;
    const texto = await res.text();
    let dados = null;
    if (texto) { try { dados = JSON.parse(texto); } catch { dados = null; } }
    if (!res.ok) throw erroDe(res.status, dados, res);
    return dados;
  }

  async function enviarArquivo(caminho, arquivo, tipo) {
    const res = await bruto('POST', caminho, { corpo: arquivo, tipo });
    const texto = await res.text();
    let dados = null;
    if (texto) { try { dados = JSON.parse(texto); } catch { dados = null; } }
    if (!res.ok) throw erroDe(res.status, dados, res);
    return dados;
  }

  async function lerBlob(caminho) {
    const res = await bruto('GET', caminho);
    if (!res.ok) {
      let dados = null;
      try { dados = JSON.parse(await res.text()); } catch { dados = null; }
      throw erroDe(res.status, dados, res);
    }
    return res.blob();
  }

  function anunciar(texto) {
    if (typeof UI.anunciar === 'function') { UI.anunciar(texto); return; }
    const vivo = document.getElementById('pf-perfil-anuncio');
    if (!vivo) return;
    vivo.textContent = '';
    window.setTimeout(() => { vivo.textContent = texto; }, 30);
  }

  function avisar(texto, tipo) {
    if (typeof UI.toast === 'function') { UI.toast(texto, { tipo: tipo || 'info' }); return; }
    anunciar(texto);
  }

  const icone = (chave, op) => (typeof UI.icone === 'function' ? UI.icone(chave, op) : '');

  // Formatação (pt-BR, America/Sao_Paulo) — equivalente local de DMC_UI.fmt.
  const so = (s) => String(s == null ? '' : s).replace(/\D/g, '');
  const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  function dataBr(valor) {
    if (!valor) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor));
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? '' : FMT_DATA.format(d);
  }
  /** 'dd/mm/aaaa' → 'AAAA-MM-DD' (data real) ou null. */
  function isoDeBr(texto) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto || '').trim());
    if (!m) return null;
    const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(a, mes - 1, d));
    if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  function cpfFmt(s) {
    const d = so(s).slice(0, 11);
    if (d.length !== 11) return d;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  function cepFmt(s) {
    const d = so(s).slice(0, 8);
    return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  }
  function celularFmt(e164) {
    const s = String(e164 || '');
    const d = so(s);
    if (s.startsWith('+55') && (d.length === 12 || d.length === 13)) {
      const ddd = d.slice(2, 4); const n = d.slice(4);
      return `+55 (${ddd}) ${n.slice(0, n.length - 4)}-${n.slice(-4)}`;
    }
    return s;
  }
  function cpfValido(s) {
    const d = so(s);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const dv = (n) => {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
      const r = (soma * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  function bytesUtf8(s) { return new TextEncoder().encode(String(s || '')).length; }

  /** Máscara que aceita colar e guarda só dígitos (equivalente local de DMC_UI.mascara). */
  function mascarar(input, tipo) {
    if (!input) return;
    if (typeof UI.mascara === 'function') { UI.mascara(input, tipo); return; }
    const formatos = {
      cpf: (d) => d.slice(0, 11).replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2'),
      cep: (d) => d.slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2'),
      data: (d) => d.slice(0, 8).replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3')
    };
    const f = formatos[tipo];
    if (!f) return;
    input.addEventListener('input', () => {
      const novo = f(so(input.value));
      if (novo !== input.value) input.value = novo;
    });
  }

  // ---------------------------------------------------------------
  // Diálogo de confirmação (equivalente local de DMC_UI.confirmar;
  // mesmos ganchos data-pf-acao, D-76)
  // ---------------------------------------------------------------
  let seq = 0;
  function confirmarLocal({ titulo, texto, rotuloConfirmar = 'Confirmar', rotuloCancelar = 'Cancelar', perigo = false }) {
    return new Promise((ok) => {
      const id = `pf-perfil-dialogo-${++seq}`;
      const d = document.createElement('dialog');
      d.className = 'pf-dialogo pf-dialogo--p';
      d.setAttribute('aria-labelledby', id);
      d.innerHTML = html`<div class="pf-dialogo__cabeca"><h2 class="pf-dialogo__titulo" id="${id}">${titulo}</h2></div>
        <div class="pf-dialogo__corpo"><p>${texto}</p></div>
        <div class="pf-dialogo__acoes">
          <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-acao="cancelar">${rotuloCancelar}</button>
          <button type="button" class="${perigo ? 'dmc-btn dmc-btn--secondary pf-btn--perigo' : 'dmc-btn dmc-btn--primary'}" data-pf-acao="confirmar">${rotuloConfirmar}</button>
        </div>`;
      const gatilho = document.activeElement;
      let feito = false;
      const fim = (v) => {
        if (feito) return;
        feito = true;
        if (d.open) d.close();
        d.remove();
        if (gatilho && gatilho.isConnected && typeof gatilho.focus === 'function') gatilho.focus();
        ok(v);
      };
      d.addEventListener('cancel', (e) => { e.preventDefault(); fim(false); });
      d.querySelector('[data-pf-acao="cancelar"]').addEventListener('click', () => fim(false));
      d.querySelector('[data-pf-acao="confirmar"]').addEventListener('click', () => fim(true));
      document.body.appendChild(d);
      d.showModal();
      d.querySelector('[data-pf-acao="cancelar"]').focus();
    });
  }
  const confirmar = (op) => (typeof UI.confirmar === 'function' ? UI.confirmar(op) : confirmarLocal(op));

  // ---------------------------------------------------------------
  // Consentimento (equivalente local de DMC_UI.consentimento, D-57;
  // texto LITERAL do servidor em pf-leitura, nunca reescrito)
  // ---------------------------------------------------------------
  function consentimentoLocal(el, opcoes) {
    const o = Object.assign({ registro: null, modo: 'caixa', rotulos: {} }, opcoes || {});
    const rot = Object.assign({ caixa: 'Concordo com este uso', aceitar: 'Concordo', retirar: 'Retirar autorização e apagar' }, o.rotulos);
    const id = `pf-consentimento-${++seq}`;
    let estado = { texto: o.texto, versaoTexto: o.versaoTexto, registro: o.registro, exigido: false };

    function paragrafos(t) {
      return String(t || '').split(/\n{2,}/).map((p) => html`<p>${p}</p>`);
    }
    function desenhar() {
      el.classList.add('pf-consentimento');
      el.setAttribute('data-pf-consentimento', estado.registro ? 'registrado' : 'pendente');
      const reg = estado.registro;
      el.innerHTML = html`
        <div class="pf-consentimento__texto pf-leitura" id="${id}-texto">${paragrafos(estado.texto)}</div>
        <p class="pf-consentimento__versao">Versão do texto: ${estado.versaoTexto || '—'}</p>
        ${estado.exigido ? html`<p class="pf-alerta pf-alerta--aviso pf-alerta--compacto" role="status">Confirme a autorização para salvar.</p>` : ''}
        ${reg
          ? html`<p class="pf-consentimento__registro">${icone('estadoSucesso')}<span>Autorizado em ${dataBr(reg.em)} · versão ${reg.versaoTexto || ''}</span></p>
              ${o.aoRetirar ? html`<div class="pf-consentimento__acoes"><button type="button" class="dmc-btn dmc-btn--link" data-pf-consentimento-acao="retirar">${rot.retirar}</button></div>` : ''}`
          : o.modo === 'botoes'
            ? html`<div class="pf-consentimento__acoes"><button type="button" class="dmc-btn dmc-btn--secondary" data-pf-consentimento-acao="aceitar" aria-describedby="${id}-texto">${rot.aceitar}</button></div>`
            : html`<label class="pf-check pf-consentimento__check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" id="${id}-caixa" aria-describedby="${id}-texto"><span>${rot.caixa}</span></label>
              <p class="pf-erro-campo" id="${id}-erro" hidden></p>`}`;
      const aceitar = el.querySelector('[data-pf-consentimento-acao="aceitar"]');
      if (aceitar) {
        aceitar.addEventListener('click', async () => {
          if (typeof o.aoAceitar !== 'function') return;
          aceitar.disabled = true;
          aceitar.setAttribute('aria-busy', 'true');
          try { await o.aoAceitar(); } finally {
            if (aceitar.isConnected) { aceitar.disabled = false; aceitar.removeAttribute('aria-busy'); }
          }
        });
      }
      const retirar = el.querySelector('[data-pf-consentimento-acao="retirar"]');
      if (retirar) retirar.addEventListener('click', () => o.aoRetirar && o.aoRetirar());
    }
    desenhar();
    return {
      aceite() {
        const caixa = el.querySelector('.pf-consentimento__check input');
        return caixa && caixa.checked ? { aceito: true, versaoTexto: estado.versaoTexto } : null;
      },
      exigir({ texto, versaoTexto } = {}) {
        estado = { texto: texto || estado.texto, versaoTexto: versaoTexto || estado.versaoTexto, registro: null, exigido: true };
        desenhar();
        const alvo = el.querySelector('.pf-consentimento__check input, [data-pf-consentimento-acao="aceitar"]');
        if (alvo) alvo.focus();
      },
      erro(texto) {
        const p = el.querySelector('.pf-erro-campo');
        const caixa = el.querySelector('.pf-consentimento__check input');
        if (p) { p.textContent = texto || ''; p.hidden = !texto; }
        if (caixa) {
          if (texto) { caixa.setAttribute('aria-invalid', 'true'); caixa.setAttribute('aria-describedby', `${id}-texto ${id}-erro`); }
          else { caixa.removeAttribute('aria-invalid'); caixa.setAttribute('aria-describedby', `${id}-texto`); }
        }
      },
      foco() {
        const alvo = el.querySelector('.pf-consentimento__check input, [data-pf-consentimento-acao]');
        if (alvo) alvo.focus();
      },
      destruir() { el.replaceChildren(); el.classList.remove('pf-consentimento'); }
    };
  }
  function consentimento(el, opcoes) {
    const c = typeof UI.consentimento === 'function' ? UI.consentimento(el, opcoes) : consentimentoLocal(el, opcoes);
    // Os métodos erro/foco são só do componente local: garantir que existam.
    if (typeof c.erro !== 'function') c.erro = () => {};
    if (typeof c.foco !== 'function') c.foco = () => { const a = el.querySelector('input, button'); if (a) a.focus(); };
    return c;
  }

  // ---------------------------------------------------------------
  // Dados fixos da tela (UX §6.15)
  // ---------------------------------------------------------------
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  const OPCOES_UF = UFS.map((u) => ({ valor: u, rotulo: u }));
  const GENEROS = [
    { valor: 'feminino', rotulo: 'Feminino' }, { valor: 'masculino', rotulo: 'Masculino' },
    { valor: 'nao_binario', rotulo: 'Não binário' }, { valor: 'outro', rotulo: 'Outro' },
    { valor: 'prefiro_nao_informar', rotulo: 'Prefiro não informar' }
  ];
  const ETNIAS = [
    { valor: 'branca', rotulo: 'Branca' }, { valor: 'preta', rotulo: 'Preta' }, { valor: 'parda', rotulo: 'Parda' },
    { valor: 'amarela', rotulo: 'Amarela' }, { valor: 'indigena', rotulo: 'Indígena' },
    { valor: 'prefiro_nao_informar', rotulo: 'Prefiro não informar' }
  ];
  const ESTADOS_CIVIS = [
    { valor: 'solteiro', rotulo: 'Solteiro(a)' }, { valor: 'casado', rotulo: 'Casado(a)' },
    { valor: 'uniao_estavel', rotulo: 'União estável' }, { valor: 'separado', rotulo: 'Separado(a)' },
    { valor: 'divorciado', rotulo: 'Divorciado(a)' }, { valor: 'viuvo', rotulo: 'Viúvo(a)' },
    { valor: 'prefiro_nao_informar', rotulo: 'Prefiro não informar' }
  ];
  /** Rótulos dos campos para "faltam:" (completude da API) e para o resumo de erros. */
  const ROTULOS = {
    nomeRegistro: 'Nome de registro', nomeSocial: 'Nome social', cpf: 'CPF', passaporte: 'Passaporte',
    'passaporte.numero': 'Passaporte', 'passaporte.paisEmissor': 'País emissor', nascimento: 'Data de nascimento',
    nacionalidade: 'Nacionalidade', naturalidade: 'Naturalidade', 'naturalidade.cidade': 'Naturalidade',
    'naturalidade.uf': 'UF da naturalidade', 'naturalidade.pais': 'País da naturalidade',
    rg: 'RG', 'rg.numero': 'Número do RG', 'rg.orgaoEmissor': 'Órgão emissor', 'rg.dataExpedicao': 'Data de expedição', 'rg.uf': 'UF do RG',
    estadoCivil: 'Estado civil', genero: 'Gênero', etnia: 'Cor ou etnia', celular: 'Celular', email: 'E-mail',
    redes: 'Redes sociais', 'redes.instagram': 'Instagram', 'redes.facebook': 'Facebook',
    endereco: 'Endereço', 'endereco.pais': 'País', 'endereco.cep': 'CEP', 'endereco.codigoPostal': 'Código postal',
    'endereco.logradouro': 'Logradouro', 'endereco.numero': 'Número', 'endereco.complemento': 'Complemento',
    'endereco.bairro': 'Bairro', 'endereco.cidade': 'Cidade', 'endereco.uf': 'UF', 'endereco.regiao': 'Região',
    foto: 'Foto', senhaAtual: 'Senha atual', novaSenha: 'Nova senha', confirmar: 'Confirmar nova senha'
  };
  /** Chave do consentimento no perfil ↔ finalidade da API. */
  const FINALIDADES = { nomeSocial: 'perfil_nome_social', redes: 'perfil_redes', foto: 'perfil_foto', genero: 'perfil_genero', etnia: 'perfil_etnia' };
  const DADO_DA_FINALIDADE = { nomeSocial: 'O nome social', redes: 'Os perfis de redes sociais', foto: 'A foto', genero: 'O gênero', etnia: 'A cor ou etnia' };

  const SECOES = [
    { id: 'identificacao', titulo: 'Identificação', quemVe: 'você e a coordenação; professores veem o nome social (ou o nome), a foto e o e-mail', base: 'execução do contrato de matrícula; nome social, consentimento registrado.' },
    { id: 'documentos', titulo: 'Documentos', quemVe: 'você e a coordenação', base: 'execução do contrato de matrícula.' },
    { id: 'dados-pessoais', titulo: 'Dados pessoais', quemVe: 'estado civil, você e a coordenação; gênero e cor ou etnia, só você (a coordenação vê apenas totais agregados)', base: 'estado civil, execução do contrato; gênero e cor ou etnia, consentimento específico.' },
    { id: 'contato', titulo: 'Contato e redes', quemVe: 'celular e redes, você e a coordenação; o e-mail também os professores das suas turmas', base: 'execução do contrato; redes sociais, consentimento registrado.' },
    { id: 'endereco', titulo: 'Endereço', quemVe: 'você e a coordenação', base: 'execução do contrato e obrigação legal.' },
    { id: 'foto', titulo: 'Foto', quemVe: 'você, a coordenação e os professores das suas turmas', base: 'consentimento registrado antes do envio.' },
    { id: 'seguranca', titulo: 'Senha e segurança', quemVe: 'só você', base: 'execução do contrato e segurança da conta.' },
    { id: 'preferencias', titulo: 'Preferências', quemVe: 'só você', base: 'fica só neste navegador; nada vai ao servidor.' }
  ];

  // ---------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------
  const E = {
    ctx: null,
    raiz: null,
    dados: null,        // resposta de GET /portal/me/perfil (null = rota ausente)
    recursos: {},       // GET /api/auth/recursos
    consentimentos: {}, // chave → controlador do pf-consentimento
    alterados: new Set(),
    fotoUrl: null
  };

  const perfil = () => (E.dados && E.dados.perfil) || {};
  const travado = (campo) => !!(E.dados && Array.isArray(E.dados.travados) && E.dados.travados.indexOf(campo) >= 0);
  function textoConsentimento(chave) {
    const t = E.dados && E.dados.textosConsentimento ? E.dados.textosConsentimento[FINALIDADES[chave]] : null;
    return t || null;
  }
  /** Registro vigente: aceito e na versão atual do texto. */
  function registroVigente(chave) {
    const c = E.dados && E.dados.consentimentos ? E.dados.consentimentos[chave] : null;
    const t = textoConsentimento(chave);
    if (!c || c.aceito !== true) return null;
    if (t && t.versaoTexto && c.versaoTexto && c.versaoTexto !== t.versaoTexto) return null;
    return c;
  }

  // ---------------------------------------------------------------
  // Markup de campo (UX §4.5)
  // ---------------------------------------------------------------
  function campo(c) {
    const id = `pf-perfil-${c.nome.replace(/\./g, '-')}`;
    const trava = !!c.travado;
    const desc = [c.ajuda || trava ? `${id}-ajuda` : '', `${id}-erro`].filter(Boolean).join(' ');
    const attrs = cru([
      c.obrigatorio ? ' required aria-required="true"' : '',
      trava ? ' readonly aria-readonly="true"' : ''
    ].join(''));
    let controle;
    if (c.opcoes) {
      controle = html`<select class="pf-input" id="${id}" name="${c.nome}" aria-describedby="${desc}"${attrs}${trava ? cru(' disabled') : ''}>
        <option value="">${c.vazio || 'Selecione'}</option>
        ${c.opcoes.map((op) => html`<option value="${op.valor}"${op.valor === (c.valor || '') ? cru(' selected') : ''}>${op.rotulo}</option>`)}
      </select>`;
    } else {
      controle = html`<input class="pf-input" id="${id}" name="${c.nome}" type="${c.tipo || 'text'}" value="${c.valor == null ? '' : c.valor}"
        ${c.autocomplete ? html`autocomplete="${c.autocomplete}"` : cru('autocomplete="off"')}
        ${c.inputmode ? html`inputmode="${c.inputmode}"` : ''}
        ${c.max ? html`maxlength="${String(c.max)}"` : ''}
        ${c.placeholder ? html`placeholder="${c.placeholder}"` : ''}
        aria-describedby="${desc}"${attrs}>`;
    }
    const ajuda = trava
      ? html`<p class="pf-ajuda" id="${id}-ajuda">${icone('cadeado')} Para corrigir este dado, peça em <a href="meus-dados.html#pedidos">Meus dados</a>.</p>`
      : c.ajuda ? html`<p class="pf-ajuda" id="${id}-ajuda">${c.ajuda}</p>` : '';
    return html`<div class="pf-campo${trava ? ' pf-campo--travado' : ''}" data-campo="${c.nome}"${c.oculto ? cru(' hidden') : ''}>
      <label class="pf-rotulo" for="${id}">${c.rotulo}${c.obrigatorio ? html`<span class="pf-rotulo__obrigatorio" aria-hidden="true"> *</span>` : ''}${trava ? html` <span class="dmc-sr-only">(travado)</span>` : ''}</label>
      ${controle}
      ${ajuda}
      <p class="pf-erro-campo" id="${id}-erro" hidden></p>
    </div>`;
  }

  function cabecalhoSecao(s) {
    return html`<h2 class="pf-secao-titulo pf-perfil-secao__titulo" id="${s.id}-titulo" tabindex="-1">${s.titulo}</h2>
      <p class="pf-ajuda pf-perfil-secao__meta"><span>Quem vê: ${s.quemVe}.</span> <span>Base legal: ${s.base}</span></p>`;
  }

  function rodapeFormulario(rotulo) {
    return html`<div class="pf-perfil-form__acoes">
        <button type="submit" class="dmc-btn dmc-btn--primary">${rotulo}</button>
      </div>
      <p class="pf-perfil-form__status" role="status" aria-live="polite"></p>`;
  }

  const secao = (id) => SECOES.find((s) => s.id === id);

  // ---------------------------------------------------------------
  // Seções do cadastro
  // ---------------------------------------------------------------
  function htmlIdentificacao() {
    const p = perfil();
    const estrangeiro = !p.cpf && !!(p.passaporte && p.passaporte.numero);
    const nat = p.naturalidade || {};
    const pas = p.passaporte || {};
    return html`${cabecalhoSecao(secao('identificacao'))}
      <form class="pf-perfil-form" data-secao="identificacao" novalidate>
        <p class="pf-ajuda">Campos com * são obrigatórios.</p>
        <div class="pf-erros" tabindex="-1" hidden></div>
        ${campo({ nome: 'nomeRegistro', rotulo: 'Nome de registro', valor: p.nomeRegistro, obrigatorio: true, autocomplete: 'name', max: 120, travado: travado('nomeRegistro') })}
        ${campo({ nome: 'nomeSocial', rotulo: 'Nome social', valor: p.nomeSocial, autocomplete: 'off', max: 120, ajuda: 'Se preenchido, é o nome usado no portal e na comunicação com você.' })}
        <div class="pf-perfil-consentimento" data-consentimento="nomeSocial"></div>
        ${travado('cpf') || travado('passaporte') ? '' : html`<label class="pf-check pf-perfil-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" name="estrangeiro"${estrangeiro ? cru(' checked') : ''}><span>Sou estrangeiro(a) sem CPF</span></label>`}
        ${campo({ nome: 'cpf', rotulo: 'CPF', valor: p.cpf ? cpfFmt(p.cpf) : '', obrigatorio: !estrangeiro, inputmode: 'numeric', autocomplete: 'off', max: 14, placeholder: '000.000.000-00', travado: travado('cpf'), oculto: estrangeiro })}
        ${campo({ nome: 'passaporte.numero', rotulo: 'Passaporte', valor: pas.numero, obrigatorio: estrangeiro, autocomplete: 'off', max: 20, travado: travado('passaporte'), oculto: !estrangeiro })}
        ${campo({ nome: 'passaporte.paisEmissor', rotulo: 'País emissor do passaporte', valor: pas.paisEmissor, obrigatorio: estrangeiro, autocomplete: 'off', max: 60, travado: travado('passaporte'), oculto: !estrangeiro })}
        ${campo({ nome: 'nascimento', rotulo: 'Data de nascimento', valor: dataBr(p.nascimento), obrigatorio: true, inputmode: 'numeric', autocomplete: 'bday', max: 10, placeholder: 'dd/mm/aaaa', ajuda: 'Use o formato dd/mm/aaaa.', travado: travado('nascimento') })}
        ${campo({ nome: 'nacionalidade', rotulo: 'Nacionalidade', valor: p.nacionalidade, obrigatorio: true, autocomplete: 'off', max: 60, placeholder: 'Brasileira' })}
        <fieldset class="pf-grupo">
          <legend class="pf-rotulo">Naturalidade</legend>
          ${campo({ nome: 'naturalidade.cidade', rotulo: 'Cidade', valor: nat.cidade, autocomplete: 'off', max: 80 })}
          ${campo({ nome: 'naturalidade.uf', rotulo: 'UF', valor: nat.uf, opcoes: OPCOES_UF, vazio: 'Fora do Brasil ou não informado' })}
          ${campo({ nome: 'naturalidade.pais', rotulo: 'País', valor: nat.pais || '', autocomplete: 'off', max: 60, placeholder: 'Brasil' })}
        </fieldset>
        ${rodapeFormulario('Salvar identificação')}
      </form>`;
  }

  function htmlDocumentos() {
    const rg = perfil().rg || {};
    return html`${cabecalhoSecao(secao('documentos'))}
      <form class="pf-perfil-form" data-secao="documentos" novalidate>
        <p class="pf-ajuda">Seção opcional. Necessário quando o seu curso ou contrato exigir.</p>
        <div class="pf-erros" tabindex="-1" hidden></div>
        ${campo({ nome: 'rg.numero', rotulo: 'RG: número', valor: rg.numero, autocomplete: 'off', max: 20 })}
        ${campo({ nome: 'rg.orgaoEmissor', rotulo: 'Órgão emissor', valor: rg.orgaoEmissor, autocomplete: 'off', max: 20, placeholder: 'SSP' })}
        ${campo({ nome: 'rg.uf', rotulo: 'UF do RG', valor: rg.uf, opcoes: OPCOES_UF })}
        ${campo({ nome: 'rg.dataExpedicao', rotulo: 'Data de expedição', valor: dataBr(rg.dataExpedicao), inputmode: 'numeric', autocomplete: 'off', max: 10, placeholder: 'dd/mm/aaaa' })}
        ${rodapeFormulario('Salvar documentos')}
      </form>`;
  }

  function htmlDadosPessoais() {
    const p = perfil();
    return html`${cabecalhoSecao(secao('dados-pessoais'))}
      <form class="pf-perfil-form" data-secao="dados-pessoais" novalidate>
        <p class="pf-ajuda">Todos os campos desta seção são opcionais.</p>
        <div class="pf-erros" tabindex="-1" hidden></div>
        ${campo({ nome: 'estadoCivil', rotulo: 'Estado civil', valor: p.estadoCivil, opcoes: ESTADOS_CIVIS, vazio: 'Não informado' })}
        <div class="pf-perfil-sensivel">
          ${campo({ nome: 'genero', rotulo: 'Gênero (opcional)', valor: p.genero, opcoes: GENEROS, vazio: 'Não informado', ajuda: 'Só você vê. Usado apenas em estatísticas agregadas, com a sua autorização.' })}
          <div class="pf-perfil-consentimento" data-consentimento="genero"></div>
        </div>
        <div class="pf-perfil-sensivel">
          ${campo({ nome: 'etnia', rotulo: 'Cor ou etnia, classificação do IBGE (opcional)', valor: p.etnia, opcoes: ETNIAS, vazio: 'Não informado', ajuda: 'Só você vê. Usado apenas em estatísticas agregadas, com a sua autorização.' })}
          <div class="pf-perfil-consentimento" data-consentimento="etnia"></div>
        </div>
        ${rodapeFormulario('Salvar dados pessoais')}
      </form>`;
  }

  function htmlContato() {
    const p = perfil();
    const redes = p.redes || {};
    const emailConfigurado = !!(E.recursos.linkMagico || E.recursos.recuperacaoSenha);
    const verificado = p.emailVerificado === true || (E.ctx.user && E.ctx.user.emailVerificado === true);
    return html`${cabecalhoSecao(secao('contato'))}
      <form class="pf-perfil-form" data-secao="contato" novalidate>
        <p class="pf-ajuda">Campos com * são obrigatórios.</p>
        <div class="pf-erros" tabindex="-1" hidden></div>
        ${campo({ nome: 'celular', rotulo: 'Celular', tipo: 'tel', valor: celularFmt(p.celular), obrigatorio: true, autocomplete: 'tel', inputmode: 'tel', max: 22, placeholder: '(11) 98765-4321', ajuda: 'Com DDD. Fora do Brasil, comece com + e o código do país.' })}
        <div class="pf-campo pf-campo--leitura" data-campo="email">
          <p class="pf-rotulo" id="pf-perfil-email-rotulo">E-mail</p>
          <p class="pf-perfil-email" aria-labelledby="pf-perfil-email-rotulo">${p.email || (E.ctx.user && E.ctx.user.email) || ''}
            ${verificado ? html` <span class="pf-perfil-email__estado">${typeof UI.estado === 'function' ? UI.estado('Confirmado', 'sucesso') : 'Confirmado'}</span>` : ''}</p>
          ${emailConfigurado
            ? html`<div class="pf-perfil-email__acoes">
                <button type="button" class="dmc-btn dmc-btn--link" data-pf-perfil="alterar-email" aria-expanded="false" aria-controls="pf-perfil-email-form">Alterar e-mail</button>
                ${verificado ? '' : html`<button type="button" class="dmc-btn dmc-btn--link" data-pf-perfil="verificar-email">Enviar link de confirmação</button>`}
              </div>`
            : html`<p class="pf-ajuda">Para alterar o e-mail, peça à secretaria.</p>`}
        </div>
        ${campo({ nome: 'redes.instagram', rotulo: 'Instagram', valor: redes.instagram ? `@${String(redes.instagram).replace(/^@/, '')}` : '', autocomplete: 'off', max: 31, placeholder: '@usuario' })}
        ${campo({ nome: 'redes.facebook', rotulo: 'Facebook', valor: redes.facebook, autocomplete: 'off', max: 200, placeholder: 'usuário ou endereço do perfil' })}
        <div class="pf-perfil-consentimento" data-consentimento="redes"></div>
        ${rodapeFormulario('Salvar contato')}
      </form>
      ${emailConfigurado ? html`<form class="pf-perfil-form pf-perfil-email-form" id="pf-perfil-email-form" data-secao="email" novalidate hidden>
        <p class="pf-ajuda">Enviaremos um link de confirmação ao novo endereço. A troca vale depois que você abrir o link.</p>
        <div class="pf-erros" tabindex="-1" hidden></div>
        ${campo({ nome: 'novoEmail', rotulo: 'Novo e-mail', tipo: 'email', obrigatorio: true, autocomplete: 'email', max: 254 })}
        ${campo({ nome: 'senhaEmail', rotulo: 'Senha atual', tipo: 'password', obrigatorio: true, autocomplete: 'current-password', max: 200 })}
        ${rodapeFormulario('Enviar link de confirmação')}
      </form>` : ''}`;
  }

  function ehBrasil(pais) {
    const s = String(pais == null ? '' : pais).trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return s === '' || s === 'brasil' || s === 'brazil' || s === 'br';
  }

  function htmlEndereco() {
    const e = perfil().endereco || {};
    const br = ehBrasil(e.pais);
    return html`${cabecalhoSecao(secao('endereco'))}
      <form class="pf-perfil-form" data-secao="endereco" novalidate>
        <p class="pf-ajuda">Campos com * são obrigatórios.</p>
        <div class="pf-erros" tabindex="-1" hidden></div>
        ${campo({ nome: 'endereco.pais', rotulo: 'País', valor: e.pais || 'Brasil', obrigatorio: true, autocomplete: 'country-name', max: 60 })}
        <div class="pf-perfil-cep" aria-busy="false">
          ${campo({ nome: 'endereco.cep', rotulo: 'CEP', valor: e.cep ? cepFmt(e.cep) : '', obrigatorio: br, inputmode: 'numeric', autocomplete: 'postal-code', max: 9, placeholder: '00000-000', ajuda: 'Com 8 dígitos, buscamos o endereço para você.', oculto: !br })}
          <p class="pf-perfil-cep__status" role="status" aria-live="polite"></p>
        </div>
        ${campo({ nome: 'endereco.codigoPostal', rotulo: 'Código postal', valor: e.codigoPostal, obrigatorio: !br, autocomplete: 'postal-code', max: 12, oculto: br })}
        ${campo({ nome: 'endereco.logradouro', rotulo: 'Logradouro', valor: e.logradouro, obrigatorio: true, autocomplete: 'address-line1', max: 120 })}
        ${campo({ nome: 'endereco.numero', rotulo: 'Número', valor: e.numero, obrigatorio: br, autocomplete: 'off', max: 10 })}
        ${campo({ nome: 'endereco.complemento', rotulo: 'Complemento', valor: e.complemento, autocomplete: 'address-line2', max: 60 })}
        ${campo({ nome: 'endereco.bairro', rotulo: 'Bairro', valor: e.bairro, obrigatorio: br, autocomplete: 'address-level3', max: 80 })}
        ${campo({ nome: 'endereco.cidade', rotulo: 'Cidade', valor: e.cidade, obrigatorio: true, autocomplete: 'address-level2', max: 80 })}
        ${campo({ nome: 'endereco.uf', rotulo: 'UF', valor: e.uf, obrigatorio: br, opcoes: OPCOES_UF, oculto: !br })}
        ${campo({ nome: 'endereco.regiao', rotulo: 'Região, estado ou província', valor: e.regiao, autocomplete: 'address-level1', max: 60, oculto: br })}
        ${rodapeFormulario('Salvar endereço')}
      </form>`;
  }

  function htmlFoto() {
    const u = E.ctx.user || {};
    const temFoto = !!(perfil().temFoto || u.temFoto || perfil().fotoArquivoId);
    const vigente = registroVigente('foto');
    return html`${cabecalhoSecao(secao('foto'))}
      <div class="pf-perfil-foto" data-secao="foto">
        <div class="pf-perfil-foto__atual">
          ${temFoto
            ? html`<img class="pf-perfil-foto__img" id="pf-perfil-foto-img" alt="Sua foto atual" width="96" height="96">`
            : html`<span class="pf-perfil-foto__iniciais pf-conta__avatar" aria-hidden="true">${u.iniciais || ''}</span><p class="pf-ajuda">Sem foto. O portal mostra as suas iniciais.</p>`}
        </div>
        <div class="pf-perfil-consentimento" data-consentimento="foto"></div>
        <div class="pf-perfil-foto__envio"${vigente ? '' : cru(' hidden')}>
          <div class="pf-campo">
            <label class="pf-rotulo" for="pf-perfil-foto-arquivo">Escolher foto</label>
            <input class="pf-input" type="file" id="pf-perfil-foto-arquivo" accept="image/jpeg,image/png,image/webp" aria-describedby="pf-perfil-foto-ajuda pf-perfil-foto-erro">
            <p class="pf-ajuda" id="pf-perfil-foto-ajuda">JPG, PNG ou WebP, até 2 MB. A foto aparece recortada em quadrado, pelo centro.</p>
            <p class="pf-erro-campo" id="pf-perfil-foto-erro" hidden></p>
          </div>
          <div class="pf-perfil-foto__previa" hidden>
            <img class="pf-perfil-foto__img" id="pf-perfil-foto-previa" alt="Prévia da nova foto" width="96" height="96">
          </div>
          <div class="pf-perfil-form__acoes">
            <button type="button" class="dmc-btn dmc-btn--primary" data-pf-perfil="enviar-foto" hidden>Enviar foto</button>
            ${temFoto ? html`<button type="button" class="dmc-btn dmc-btn--secondary pf-btn--perigo" data-pf-perfil="remover-foto">Remover foto</button>` : ''}
          </div>
        </div>
        <p class="pf-perfil-form__status" role="status" aria-live="polite"></p>
      </div>`;
  }

  function htmlSeguranca() {
    const emailConfigurado = !!(E.recursos.recuperacaoSenha || E.recursos.linkMagico);
    const u = E.ctx.user || {};
    const mostrar2fa = !!(E.recursos.doisFatores || u.doisFatoresAtivo);
    return html`${cabecalhoSecao(secao('seguranca'))}
      <form class="pf-perfil-form" data-secao="senha" novalidate>
        <h3 class="pf-perfil-subtitulo">Trocar senha</h3>
        <p class="pf-ajuda" id="pf-perfil-regra-senha">A nova senha precisa ter de 8 a 72 caracteres e ser diferente do seu e-mail e do seu CPF. Ao trocar, as sessões abertas em outros aparelhos são encerradas.</p>
        <div class="pf-erros" tabindex="-1" hidden></div>
        ${campo({ nome: 'senhaAtual', rotulo: 'Senha atual', tipo: 'password', obrigatorio: true, autocomplete: 'current-password', max: 200 })}
        ${campo({ nome: 'novaSenha', rotulo: 'Nova senha', tipo: 'password', obrigatorio: true, autocomplete: 'new-password', max: 200 })}
        ${campo({ nome: 'confirmar', rotulo: 'Confirmar nova senha', tipo: 'password', obrigatorio: true, autocomplete: 'new-password', max: 200 })}
        <label class="pf-check pf-perfil-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" data-pf-perfil="mostrar-senha"><span>Mostrar senha</span></label>
        ${emailConfigurado ? '' : html`<p class="pf-ajuda">Recuperação de senha por e-mail indisponível.${u.doisFatoresAtivo ? ' Guarde seus códigos de recuperação.' : ''}</p>`}
        ${rodapeFormulario('Trocar senha')}
      </form>
      ${mostrar2fa ? html`<div class="pf-perfil-2fa" data-secao="2fa" aria-busy="true"><h3 class="pf-perfil-subtitulo">Verificação em duas etapas</h3><p class="pf-ajuda">Carregando…</p></div>` : ''}
      <form class="pf-perfil-form" data-secao="sessoes" novalidate>
        <h3 class="pf-perfil-subtitulo">Outros aparelhos</h3>
        <p class="pf-ajuda">Encerra a sessão em todos os outros navegadores e aparelhos. Este continua conectado.</p>
        <div class="pf-erros" tabindex="-1" hidden></div>
        ${campo({ nome: 'senhaSessoes', rotulo: 'Senha atual', tipo: 'password', obrigatorio: true, autocomplete: 'current-password', max: 200 })}
        <div class="pf-perfil-form__acoes"><button type="submit" class="dmc-btn dmc-btn--secondary">Sair dos outros aparelhos</button></div>
        <p class="pf-perfil-form__status" role="status" aria-live="polite"></p>
      </form>`;
  }

  function htmlPreferencias() {
    const shell = window.DMC_Shell;
    const temTema = !!(shell && shell.tema && typeof shell.tema.definir === 'function');
    const temFonte = !!(shell && shell.fonte && typeof shell.fonte.definir === 'function');
    const temTour = !!(shell && shell.tour && typeof shell.tour.iniciar === 'function');
    const tema = temTema ? shell.tema.obter() : 'escuro';
    const fonte = temFonte ? String(shell.fonte.obter()) : '0';
    return html`${cabecalhoSecao(secao('preferencias'))}
      <div class="pf-perfil-preferencias" data-secao="preferencias">
        ${temTema ? html`<div class="pf-campo"><label class="pf-rotulo" for="pf-perfil-tema">Tema</label>
          <select class="pf-input" id="pf-perfil-tema" data-pf-perfil="tema">
            ${[['auto', 'Automático (segue o sistema)'], ['claro', 'Claro'], ['escuro', 'Escuro']].map(([v, r]) => html`<option value="${v}"${v === tema ? cru(' selected') : ''}>${r}</option>`)}
          </select></div>` : ''}
        ${temFonte ? html`<div class="pf-campo"><label class="pf-rotulo" for="pf-perfil-fonte">Tamanho do texto</label>
          <select class="pf-input" id="pf-perfil-fonte" data-pf-perfil="fonte">
            ${[['-1', 'Menor (93,75%)'], ['0', 'Padrão (100%)'], ['1', 'Maior (112,5%)'], ['2', 'Muito maior (125%)']].map(([v, r]) => html`<option value="${v}"${v === fonte ? cru(' selected') : ''}>${r}</option>`)}
          </select>
          <p class="pf-ajuda">Prévia: este texto acompanha o tamanho escolhido.</p></div>` : ''}
        ${temTour ? html`<div class="pf-perfil-form__acoes"><button type="button" class="dmc-btn dmc-btn--secondary" data-pf-perfil="tour">Rever o tour do portal</button></div>` : ''}
        ${!temTema && !temFonte ? html`<p class="pf-ajuda">Use os botões de tema e de tamanho do texto no topo da página.</p>` : ''}
        <p class="pf-perfil-form__status" role="status" aria-live="polite"></p>
      </div>`;
  }

  function htmlIndice(semCadastro) {
    const lista = semCadastro ? SECOES.filter((s) => s.id === 'seguranca' || s.id === 'preferencias') : SECOES;
    return html`<nav class="pf-perfil-indice" aria-label="Seções do perfil">
      <details class="pf-perfil-indice__caixa"${window.matchMedia && window.matchMedia('(min-width: 64em)').matches ? cru(' open') : ''}>
        <summary class="pf-perfil-indice__resumo pf-menu__item">Seções<span class="pf-menu__seta">${icone('chevron')}</span></summary>
        <ul class="pf-perfil-indice__lista pf-menu__lista">
          ${lista.map((s) => html`<li class="pf-menu__no"><a class="pf-perfil-indice__link pf-menu__item" href="#${s.id}">${s.titulo}</a></li>`)}
          <li class="pf-menu__no"><a class="pf-perfil-indice__link pf-menu__item" href="meus-dados.html">Meus dados</a></li>
        </ul>
      </details>
    </nav>`;
  }

  function htmlCompletude() {
    const c = E.dados && E.dados.completude;
    if (!c || c.completo) return '';
    const faltando = Array.isArray(c.faltando) ? c.faltando : [];
    const rotulos = [];
    for (const f of faltando) {
      const r = ROTULOS[f] || ROTULOS[String(f).split('.')[0]] || String(f);
      if (rotulos.indexOf(r) < 0) rotulos.push(r);
    }
    const pct = Number.isFinite(Number(c.pct)) ? `${Math.round(Number(c.pct))}%` : '';
    return html`<p class="pf-alerta pf-alerta--info" id="pf-perfil-completude">${icone('estadoInfo')}<span>Cadastro ${pct} completo${rotulos.length ? html` — faltam: ${rotulos.join(', ')}` : ''}.</span></p>`;
  }

  // ---------------------------------------------------------------
  // Montagem
  // ---------------------------------------------------------------
  const MONTADORES = {
    identificacao: htmlIdentificacao,
    documentos: htmlDocumentos,
    'dados-pessoais': htmlDadosPessoais,
    contato: htmlContato,
    endereco: htmlEndereco,
    foto: htmlFoto,
    seguranca: htmlSeguranca,
    preferencias: htmlPreferencias
  };

  function desenharTudo() {
    const semCadastro = !E.dados;
    const ids = semCadastro ? ['seguranca', 'preferencias'] : SECOES.map((s) => s.id);
    E.raiz.innerHTML = html`
      <div class="pf-perfil__topo" id="pf-perfil-topo">${semCadastro
        ? html`<p class="pf-alerta pf-alerta--aviso">${icone('estadoAviso')}<span>O cadastro ainda não está disponível nesta versão da plataforma. A troca de senha e as preferências funcionam normalmente.</span></p>`
        : htmlCompletude()}</div>
      ${htmlIndice(semCadastro)}
      <div class="pf-perfil__secoes">
        ${ids.map((id) => html`<section class="pf-perfil-secao" id="${id}" aria-labelledby="${id}-titulo"></section>`)}
      </div>`;
    E.raiz.setAttribute('aria-busy', 'false');
    E.consentimentos = {};
    for (const id of ids) desenharSecao(id);
  }

  /** Consentimentos que moram em cada seção (o controlador some com o DOM da seção). */
  const CONSENTIMENTOS_DA_SECAO = { identificacao: ['nomeSocial'], 'dados-pessoais': ['genero', 'etnia'], contato: ['redes'], foto: ['foto'] };

  function desenharSecao(id) {
    const el = document.getElementById(id);
    if (!el) return;
    for (const k of CONSENTIMENTOS_DA_SECAO[id] || []) delete E.consentimentos[k];
    el.innerHTML = MONTADORES[id]();
    ligarSecao(id, el);
  }

  function atualizarCompletude() {
    const topo = document.getElementById('pf-perfil-topo');
    if (topo && E.dados) topo.innerHTML = htmlCompletude();
  }

  function focarHash() {
    const id = decodeURIComponent(String(window.location.hash || '').slice(1));
    if (!id || !/^[a-z-]+$/.test(id)) return;
    const titulo = document.getElementById(`${id}-titulo`);
    if (!titulo) return;
    titulo.scrollIntoView({ block: 'start' });
    titulo.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------
  // Comportamento por seção
  // ---------------------------------------------------------------
  function ligarSecao(id, el) {
    el.querySelectorAll('form.pf-perfil-form').forEach((form) => {
      form.addEventListener('input', () => marcarAlterado(form, true));
      form.addEventListener('change', () => marcarAlterado(form, true));
    });
    if (id === 'identificacao') ligarIdentificacao(el);
    else if (id === 'documentos') {
      const form = el.querySelector('form');
      mascarar(form.elements.namedItem('rg.dataExpedicao'), 'data');
      ligarFormulario(form, coletarDocumentos, 'Documentos salvos.');
    }
    else if (id === 'dados-pessoais') ligarDadosPessoais(el);
    else if (id === 'contato') ligarContato(el);
    else if (id === 'endereco') ligarEndereco(el);
    else if (id === 'foto') ligarFoto(el);
    else if (id === 'seguranca') ligarSeguranca(el);
    else if (id === 'preferencias') ligarPreferencias(el);
  }

  function marcarAlterado(form, alterado) {
    const chave = form.getAttribute('data-secao');
    if (!chave || chave === 'senha' || chave === 'sessoes' || chave === 'email') return;
    if (alterado) E.alterados.add(chave); else E.alterados.delete(chave);
    const st = form.querySelector('.pf-perfil-form__status');
    if (st && alterado && !st.dataset.sujo) { st.dataset.sujo = '1'; st.textContent = 'Há alterações não salvas.'; }
    if (st && !alterado) delete st.dataset.sujo;
  }

  window.addEventListener('beforeunload', (ev) => {
    if (E.alterados.size) { ev.preventDefault(); ev.returnValue = ''; }
  });

  const val = (form, nome) => {
    const c = form.elements.namedItem(nome);
    return c && typeof c.value === 'string' ? c.value.trim() : '';
  };

  // Erros no formulário (UX §4.5: campo + resumo pf-erros com foco).
  function limparErros(form) {
    form.querySelectorAll('[aria-invalid="true"]').forEach((c) => c.removeAttribute('aria-invalid'));
    form.querySelectorAll('.pf-erro-campo').forEach((p) => { p.textContent = ''; p.hidden = true; });
    const resumo = form.querySelector('.pf-erros');
    if (resumo) { resumo.hidden = true; resumo.replaceChildren(); }
  }
  function mostrarErros(form, erros, { focarResumo = true } = {}) {
    const itens = [];
    for (const [nome, msg] of Object.entries(erros)) {
      const controle = form.elements.namedItem(nome) || form.querySelector(`[data-campo="${CSS.escape(nome)}"] input, [data-campo="${CSS.escape(nome)}"] select`);
      const caixa = form.querySelector(`[data-campo="${CSS.escape(nome)}"]`);
      const p = caixa ? caixa.querySelector('.pf-erro-campo') : null;
      if (controle && controle.setAttribute) controle.setAttribute('aria-invalid', 'true');
      if (p) { p.textContent = String(msg); p.hidden = false; }
      itens.push({ nome, msg: String(msg), id: controle && controle.id ? controle.id : null });
    }
    const resumo = form.querySelector('.pf-erros');
    if (resumo && itens.length) {
      resumo.innerHTML = html`<p class="pf-erros__titulo">${itens.length === 1 ? 'Corrija 1 campo:' : `Corrija ${itens.length} campos:`}</p>
        <ul>${itens.map((i) => html`<li>${i.id ? html`<a href="#${i.id}">${i.msg}</a>` : i.msg}</li>`)}</ul>`;
      resumo.hidden = false;
      resumo.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const alvo = document.getElementById(a.getAttribute('href').slice(1));
        if (alvo) alvo.focus();
      }));
      if (focarResumo) resumo.focus();
    }
  }
  function status(form, texto) {
    const st = form && form.querySelector('.pf-perfil-form__status');
    if (st) { delete st.dataset.sujo; st.textContent = texto || ''; }
  }

  /** Campos obrigatórios visíveis vazios → { nome: 'Preencha …' }. */
  function obrigatoriosVazios(form) {
    const erros = {};
    form.querySelectorAll('[data-campo]:not([hidden]) [required]').forEach((c) => {
      if (c.readOnly || c.disabled) return;
      if (!String(c.value || '').trim()) erros[c.name] = `Preencha ${String(ROTULOS[c.name] || c.name).toLowerCase()}.`;
    });
    return erros;
  }

  function mensagemPadrao(err) {
    if (!err) return 'Não foi possível salvar agora.';
    if (err.status === 0) return 'Sem conexão. Verifique a internet e tente de novo.';
    return err.message || 'Não foi possível salvar agora.';
  }

  /**
   * Envio padrão de uma seção do cadastro: PUT /portal/me/perfil com os campos da seção,
   * `versao` e os aceites do mesmo envio (nome social, redes, gênero, etnia).
   */
  function ligarFormulario(form, coletar, sucesso) {
    if (!form) return;
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limparErros(form);
      const r = coletar(form);
      if (r.erros && Object.keys(r.erros).length) { mostrarErros(form, r.erros); return; }
      if (r.consentimentoFaltando) {
        const k = r.consentimentoFaltando;
        const msg = k === 'redes' ? 'Para salvar os perfis de redes sociais, marque a autorização.'
          : k === 'nomeSocial' ? 'Para salvar o nome social, marque a autorização.'
            : `Para salvar ${String(DADO_DA_FINALIDADE[k] || 'o dado').toLowerCase()}, marque a autorização.`;
        const c = E.consentimentos[k];
        if (c) { c.erro(msg); c.foco(); }
        status(form, msg);
        return;
      }
      const botao = form.querySelector('button[type="submit"]');
      ocupar(botao, true, 'Salvando…');
      try {
        const corpo = Object.assign({}, r.corpo, { versao: E.dados ? E.dados.versao : 0 });
        const novo = await chamar('PUT', API.perfil, corpo);
        E.dados = novo;
        marcarAlterado(form, false);
        const secaoEl = form.closest('.pf-perfil-secao');
        if (secaoEl) desenharSecao(secaoEl.id);
        atualizarCompletude();
        sincronizarNome();
        const novoForm = secaoEl ? secaoEl.querySelector('form.pf-perfil-form') : null;
        status(novoForm, sucesso);
        const botaoNovo = novoForm ? novoForm.querySelector('button[type="submit"]') : null;
        if (botaoNovo) botaoNovo.focus();
      } catch (err) {
        tratarErroDeEnvio(form, err);
      } finally {
        if (botao && botao.isConnected) ocupar(botao, false);
      }
    });
  }

  function ocupar(botao, ocupado, rotulo) {
    if (!botao) return;
    if (typeof UI.ocupado === 'function') { UI.ocupado(botao, ocupado, rotulo); return; }
    if (ocupado) {
      botao.dataset.rotulo = botao.textContent;
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      if (rotulo) botao.textContent = rotulo;
    } else {
      botao.disabled = false;
      botao.removeAttribute('aria-busy');
      if (botao.dataset.rotulo) { botao.textContent = botao.dataset.rotulo; delete botao.dataset.rotulo; }
    }
  }

  async function tratarErroDeEnvio(form, err) {
    const codigo = err && err.codigo;
    if (err && err.status === 401) return; // sessaoEncerrada() já levou ao login
    if (codigo === 'consentimento-necessario') {
      // 428: relê os textos atuais sem perder o que foi digitado e reabre o aceite (UX §6.15).
      const finalidade = (err.dados && err.dados.finalidade) || null;
      const chave = Object.keys(FINALIDADES).find((k) => FINALIDADES[k] === finalidade) || null;
      try {
        const atual = await chamar('GET', API.perfil);
        if (atual) {
          E.dados.textosConsentimento = atual.textosConsentimento;
          E.dados.consentimentos = atual.consentimentos;
          E.dados.versao = atual.versao;
        }
      } catch { /* segue com os textos que já temos */ }
      const c = chave ? E.consentimentos[chave] : null;
      const t = chave ? textoConsentimento(chave) : null;
      if (c && t) c.exigir({ texto: t.texto, versaoTexto: t.versaoTexto });
      else if (chave) { montarConsentimento(form, chave, true); }
      status(form, 'Confirme a autorização para salvar.');
      return;
    }
    if (codigo === 'conflito-versao') {
      mostrarAlertaNoForm(form, 'Alguém alterou este registro enquanto você editava. Recarregue para ver a versão atual.', true);
      return;
    }
    if (codigo === 'cpf-em-uso') { mostrarErros(form, { cpf: 'Este CPF já está vinculado a outra conta. Fale com a secretaria.' }); return; }
    if (codigo === 'campo-travado') {
      mostrarAlertaNoForm(form, `${err.message || 'Este dado está travado.'} Para corrigir, peça em Meus dados.`, true);
      return;
    }
    if (err && err.campos && typeof err.campos === 'object' && Object.keys(err.campos).length) {
      const mapeados = {};
      for (const [k, v] of Object.entries(err.campos)) mapeados[k] = v;
      mostrarErros(form, mapeados);
      return;
    }
    mostrarAlertaNoForm(form, mensagemPadrao(err), false);
  }

  function mostrarAlertaNoForm(form, texto, recarregar) {
    const resumo = form.querySelector('.pf-erros');
    if (!resumo) { avisar(texto, 'erro'); return; }
    resumo.innerHTML = html`<p class="pf-alerta pf-alerta--erro" role="alert">${texto}</p>
      ${recarregar ? html`<button type="button" class="dmc-btn dmc-btn--secondary" data-pf-perfil="recarregar">Recarregar</button>` : ''}`;
    resumo.hidden = false;
    const b = resumo.querySelector('[data-pf-perfil="recarregar"]');
    if (b) b.addEventListener('click', () => { E.alterados.clear(); window.location.reload(); });
    resumo.focus();
  }

  /** Atualiza o nome de exibição da sessão depois de mudar nome social/registro. */
  async function sincronizarNome() {
    try { if (window.DMC_Auth && typeof window.DMC_Auth.init === 'function') E.ctx.user = (await window.DMC_Auth.init()) || E.ctx.user; } catch { /* sem efeito na tela */ }
  }

  // ----- consentimentos de nome social, redes, gênero e etnia (modo caixa) -----
  function precisaConsentimento(chave, form) {
    if (chave === 'nomeSocial') return !!val(form, 'nomeSocial');
    if (chave === 'redes') return !!(val(form, 'redes.instagram') || val(form, 'redes.facebook'));
    if (chave === 'genero' || chave === 'etnia') { const v = val(form, chave); return !!v && v !== 'prefiro_nao_informar'; }
    return false;
  }

  function montarConsentimento(form, chave, exigido) {
    const caixa = form.querySelector(`[data-consentimento="${chave}"]`);
    if (!caixa) return;
    const t = textoConsentimento(chave);
    const reg = registroVigente(chave);
    const temValorSalvo = (() => {
      const p = perfil();
      if (chave === 'nomeSocial') return !!p.nomeSocial;
      if (chave === 'redes') return !!(p.redes && (p.redes.instagram || p.redes.facebook));
      return !!p[chave] && p[chave] !== 'prefiro_nao_informar';
    })();
    const deveMostrar = exigido || (reg && temValorSalvo) || precisaConsentimento(chave, form);
    if (!deveMostrar || !t) {
      if (E.consentimentos[chave]) { E.consentimentos[chave].destruir(); delete E.consentimentos[chave]; }
      caixa.hidden = true;
      return;
    }
    caixa.hidden = false;
    if (E.consentimentos[chave] && !exigido) return; // já montado: preserva a caixa marcada
    if (E.consentimentos[chave]) E.consentimentos[chave].destruir();
    E.consentimentos[chave] = consentimento(caixa, {
      texto: t.texto,
      versaoTexto: t.versaoTexto,
      registro: exigido ? null : reg,
      modo: 'caixa',
      aoRetirar: reg ? () => retirar(chave) : undefined
    });
    if (exigido) E.consentimentos[chave].exigir({ texto: t.texto, versaoTexto: t.versaoTexto });
  }

  function ligarConsentimentos(form, chaves, gatilhos) {
    for (const k of chaves) montarConsentimento(form, k, false);
    form.addEventListener('input', (ev) => {
      const nome = ev.target && ev.target.name;
      for (const k of chaves) if ((gatilhos[k] || []).indexOf(nome) >= 0) montarConsentimento(form, k, false);
    });
    form.addEventListener('change', (ev) => {
      const nome = ev.target && ev.target.name;
      for (const k of chaves) if ((gatilhos[k] || []).indexOf(nome) >= 0) montarConsentimento(form, k, false);
    });
  }

  /** Inclui no corpo o aceite do mesmo envio; devolve a chave que falta, se faltar. */
  function anexarAceites(form, chaves, corpo) {
    for (const k of chaves) {
      if (!precisaConsentimento(k, form) || registroVigente(k)) continue;
      const c = E.consentimentos[k];
      const aceite = c ? c.aceite() : null;
      if (!aceite) return k;
      corpo.consentimentos = Object.assign(corpo.consentimentos || {}, { [k]: aceite });
    }
    return null;
  }

  async function retirar(chave) {
    const finalidade = FINALIDADES[chave];
    const dado = DADO_DA_FINALIDADE[chave] || 'O dado';
    const ok = await confirmar({
      titulo: 'Retirar a autorização?',
      texto: `${dado} é apagado agora. Você pode autorizar de novo depois.`,
      rotuloConfirmar: 'Retirar autorização',
      perigo: true
    });
    if (!ok) return;
    try {
      await chamar('POST', API.revogar(finalidade), {});
      E.dados = await chamar('GET', API.perfil);
      const secaoId = chave === 'nomeSocial' ? 'identificacao' : chave === 'redes' ? 'contato' : chave === 'foto' ? 'foto' : 'dados-pessoais';
      E.alterados.delete(secaoId);
      desenharTudo();
      sincronizarNome();
      anunciar('Autorização retirada.');
      avisar('Autorização retirada.', 'sucesso');
    } catch (err) {
      if (err && err.status === 404) { E.dados = await chamar('GET', API.perfil).catch(() => E.dados); desenharTudo(); return; }
      avisar(mensagemPadrao(err), 'erro');
    }
  }

  // ----- Identificação -----
  function ligarIdentificacao(el) {
    const form = el.querySelector('form');
    mascarar(form.elements.namedItem('cpf'), 'cpf');
    mascarar(form.elements.namedItem('nascimento'), 'data');
    const cpf = form.elements.namedItem('cpf');
    if (cpf && !cpf.readOnly) {
      cpf.addEventListener('blur', () => {
        const caixa = form.querySelector('[data-campo="cpf"]');
        const p = caixa.querySelector('.pf-erro-campo');
        if (cpf.value.trim() && !cpfValido(cpf.value)) {
          cpf.setAttribute('aria-invalid', 'true'); p.textContent = 'CPF inválido. Confira os números.'; p.hidden = false;
        } else { cpf.removeAttribute('aria-invalid'); p.textContent = ''; p.hidden = true; }
      });
    }
    const estrangeiro = form.elements.namedItem('estrangeiro');
    if (estrangeiro) {
      estrangeiro.addEventListener('change', () => {
        const est = estrangeiro.checked;
        alternarCampo(form, 'cpf', !est);
        alternarCampo(form, 'passaporte.numero', est);
        alternarCampo(form, 'passaporte.paisEmissor', est);
      });
    }
    ligarConsentimentos(form, ['nomeSocial'], { nomeSocial: ['nomeSocial'] });
    ligarFormulario(form, coletarIdentificacao, 'Identificação salva.');
  }

  function alternarCampo(form, nome, visivel) {
    const caixa = form.querySelector(`[data-campo="${CSS.escape(nome)}"]`);
    if (!caixa) return;
    caixa.hidden = !visivel;
    const c = caixa.querySelector('input, select');
    if (c && !c.readOnly) {
      if (visivel) { c.required = true; c.setAttribute('aria-required', 'true'); }
      else { c.required = false; c.removeAttribute('aria-required'); }
      const marca = caixa.querySelector('.pf-rotulo__obrigatorio');
      if (visivel && !marca) caixa.querySelector('.pf-rotulo').insertAdjacentHTML('beforeend', '<span class="pf-rotulo__obrigatorio" aria-hidden="true"> *</span>');
    }
  }

  function coletarIdentificacao(form) {
    const erros = obrigatoriosVazios(form);
    const corpo = {};
    if (!travado('nomeRegistro')) {
      const n = val(form, 'nomeRegistro');
      if (n && (n.length < 2 || !/\p{L}/u.test(n))) erros.nomeRegistro = 'Nome de registro inválido. Use o nome completo, como no documento.';
      corpo.nomeRegistro = n || null;
    }
    corpo.nomeSocial = val(form, 'nomeSocial') || null;
    const estrangeiro = !!(form.elements.namedItem('estrangeiro') && form.elements.namedItem('estrangeiro').checked);
    if (!travado('cpf') && !travado('passaporte')) {
      if (estrangeiro) {
        corpo.cpf = null;
        const numero = val(form, 'passaporte.numero').toUpperCase().replace(/\s+/g, '');
        if (numero && !/^[A-Z0-9]{5,20}$/.test(numero)) erros['passaporte.numero'] = 'Passaporte inválido. Use de 5 a 20 letras e números.';
        corpo.passaporte = numero ? { numero, paisEmissor: val(form, 'passaporte.paisEmissor') } : null;
      } else {
        const cpf = so(val(form, 'cpf'));
        if (cpf && !cpfValido(cpf)) erros.cpf = 'CPF inválido. Confira os números.';
        corpo.cpf = cpf || null;
        corpo.passaporte = null;
      }
    }
    if (!travado('nascimento')) {
      const t = val(form, 'nascimento');
      const iso = t ? isoDeBr(t) : null;
      if (t && !iso) erros.nascimento = 'Data de nascimento inválida. Use dd/mm/aaaa.';
      corpo.nascimento = iso;
    }
    corpo.nacionalidade = val(form, 'nacionalidade') || null;
    const cidade = val(form, 'naturalidade.cidade');
    const uf = val(form, 'naturalidade.uf');
    const pais = val(form, 'naturalidade.pais');
    corpo.naturalidade = cidade || uf || pais ? { cidade: cidade || null, uf: uf || null, pais: pais || 'Brasil' } : null;
    const falta = Object.keys(erros).length ? null : anexarAceites(form, ['nomeSocial'], corpo);
    return { corpo, erros, consentimentoFaltando: falta };
  }

  // ----- Documentos -----
  function coletarDocumentos(form) {
    const erros = {};
    const numero = val(form, 'rg.numero');
    const orgao = val(form, 'rg.orgaoEmissor');
    const uf = val(form, 'rg.uf');
    const data = val(form, 'rg.dataExpedicao');
    const algum = numero || orgao || uf || data;
    if (!algum) return { corpo: { rg: null }, erros };
    if (!numero) erros['rg.numero'] = 'Preencha o número do RG.';
    else if (!/^[0-9A-Za-z.-]{3,20}$/.test(numero)) erros['rg.numero'] = 'Número do RG inválido. Use de 3 a 20 letras, números, ponto ou hífen.';
    if (!orgao) erros['rg.orgaoEmissor'] = 'Preencha o órgão emissor.';
    if (!uf) erros['rg.uf'] = 'Escolha a UF do RG.';
    const iso = data ? isoDeBr(data) : null;
    if (!data) erros['rg.dataExpedicao'] = 'Preencha a data de expedição.';
    else if (!iso) erros['rg.dataExpedicao'] = 'Data de expedição inválida. Use dd/mm/aaaa.';
    return { corpo: { rg: { numero, orgaoEmissor: orgao, uf, dataExpedicao: iso } }, erros };
  }

  // ----- Dados pessoais -----
  function ligarDadosPessoais(el) {
    const form = el.querySelector('form');
    ligarConsentimentos(form, ['genero', 'etnia'], { genero: ['genero'], etnia: ['etnia'] });
    ligarFormulario(form, (f) => {
      const corpo = {
        estadoCivil: val(f, 'estadoCivil') || null,
        genero: val(f, 'genero') || null,
        etnia: val(f, 'etnia') || null
      };
      const falta = anexarAceites(f, ['genero', 'etnia'], corpo);
      return { corpo, erros: {}, consentimentoFaltando: falta };
    }, 'Dados pessoais salvos.');
  }
  // ----- Contato -----
  function ligarContato(el) {
    const form = el.querySelector('form[data-secao="contato"]');
    ligarConsentimentos(form, ['redes'], { redes: ['redes.instagram', 'redes.facebook'] });
    ligarFormulario(form, coletarContato, 'Contato salvo.');
    const botaoAlterar = el.querySelector('[data-pf-perfil="alterar-email"]');
    const formEmail = el.querySelector('#pf-perfil-email-form');
    if (botaoAlterar && formEmail) {
      botaoAlterar.addEventListener('click', () => {
        const abrir = formEmail.hidden;
        formEmail.hidden = !abrir;
        botaoAlterar.setAttribute('aria-expanded', abrir ? 'true' : 'false');
        if (abrir) formEmail.elements.namedItem('novoEmail').focus();
      });
      formEmail.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        limparErros(formEmail);
        const erros = obrigatoriosVazios(formEmail);
        const novoEmail = val(formEmail, 'novoEmail');
        if (novoEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novoEmail)) erros.novoEmail = 'E-mail inválido. Confira o endereço.';
        if (Object.keys(erros).length) { mostrarErros(formEmail, erros); return; }
        const botao = formEmail.querySelector('button[type="submit"]');
        ocupar(botao, true, 'Enviando…');
        try {
          const r = await chamar('POST', API.email, { novoEmail, senha: formEmail.elements.namedItem('senhaEmail').value });
          formEmail.elements.namedItem('senhaEmail').value = '';
          status(formEmail, (r && r.mensagem) || 'Enviamos um link de confirmação ao novo endereço.');
        } catch (err) {
          formEmail.elements.namedItem('senhaEmail').value = '';
          if (err && err.campos && err.campos.senha) mostrarErros(formEmail, { senhaEmail: 'Senha incorreta.' });
          else if (err && err.codigo === 'email-em-uso') mostrarErros(formEmail, { novoEmail: 'Este e-mail já está vinculado a outra conta. Fale com a secretaria.' });
          else if (err && err.codigo === 'email-indisponivel') mostrarAlertaNoForm(formEmail, 'O envio de e-mail não está configurado. Peça a troca à secretaria.', false);
          else mostrarAlertaNoForm(formEmail, mensagemPadrao(err), false);
        } finally { ocupar(botao, false); }
      });
    }
    const verificar = el.querySelector('[data-pf-perfil="verificar-email"]');
    if (verificar) {
      verificar.addEventListener('click', async () => {
        ocupar(verificar, true, 'Enviando…');
        try {
          const r = await chamar('POST', API.verificarEmail, {});
          avisar((r && r.mensagem) || 'Enviamos o link de confirmação ao seu e-mail.', 'sucesso');
          anunciar((r && r.mensagem) || 'Enviamos o link de confirmação ao seu e-mail.');
        } catch (err) {
          avisar(err && err.codigo === 'email-indisponivel' ? 'O envio de e-mail não está configurado no momento.' : mensagemPadrao(err), 'erro');
        } finally { ocupar(verificar, false); }
      });
    }
  }

  function coletarContato(form) {
    const erros = obrigatoriosVazios(form);
    const bruto = val(form, 'celular');
    let celular = null;
    if (bruto) {
      const d = so(bruto);
      if (d.length < 8 || d.length > 15) erros.celular = 'Celular inválido. Informe o DDD e o número.';
      celular = bruto.startsWith('+') ? `+${d}` : d;
    }
    const ig = val(form, 'redes.instagram');
    if (ig && !/^@?[A-Za-z0-9._]{1,30}$/.test(ig)) erros['redes.instagram'] = 'Instagram inválido. Use só o nome de usuário, como @usuario.';
    const fb = val(form, 'redes.facebook');
    if (fb && fb.length < 2) erros['redes.facebook'] = 'Facebook inválido. Informe o usuário ou o endereço do perfil.';
    const corpo = { celular, redes: { instagram: ig ? ig.replace(/^@/, '') : null, facebook: fb || null } };
    const falta = Object.keys(erros).length ? null : anexarAceites(form, ['redes'], corpo);
    return { corpo, erros, consentimentoFaltando: falta };
  }

  // ----- Endereço (CEP consultado pelo servidor) -----
  function ligarEndereco(el) {
    const form = el.querySelector('form');
    const cep = form.elements.namedItem('endereco.cep');
    mascarar(cep, 'cep');
    const pais = form.elements.namedItem('endereco.pais');
    pais.addEventListener('input', () => {
      const br = ehBrasil(pais.value);
      for (const n of ['endereco.cep', 'endereco.uf']) alternarCampo(form, n, br);
      alternarCampo(form, 'endereco.codigoPostal', !br);
      const regiao = form.querySelector('[data-campo="endereco.regiao"]');
      if (regiao) regiao.hidden = br;
      for (const n of ['endereco.numero', 'endereco.bairro']) {
        const c = form.elements.namedItem(n);
        c.required = br;
        const marca = form.querySelector(`[data-campo="${n}"] .pf-rotulo__obrigatorio`);
        if (marca) marca.hidden = !br;
      }
    });
    let ultimo = so(cep.value);
    const consultar = async () => {
      const d = so(cep.value);
      if (d.length !== 8 || d === ultimo || !ehBrasil(pais.value)) return;
      ultimo = d;
      const grupo = form.querySelector('.pf-perfil-cep');
      const st = form.querySelector('.pf-perfil-cep__status');
      grupo.setAttribute('aria-busy', 'true');
      st.textContent = 'Buscando endereço…';
      try {
        const r = await chamar('GET', API.cep(d));
        if (so(cep.value) !== d) return; // a pessoa já digitou outro CEP
        const pares = { 'endereco.logradouro': r.logradouro, 'endereco.bairro': r.bairro, 'endereco.cidade': r.cidade, 'endereco.uf': r.uf };
        for (const [n, v] of Object.entries(pares)) {
          const c = form.elements.namedItem(n);
          if (c && v) c.value = v;
        }
        marcarAlterado(form, true);
        st.textContent = 'Endereço preenchido pelo CEP. Confira e complete.';
        const numero = form.elements.namedItem('endereco.numero');
        if (numero) numero.focus();
      } catch (err) {
        st.textContent = err && err.status === 404 && err.codigo === 'cep-nao-encontrado'
          ? 'Não encontramos o CEP. Preencha o endereço.'
          : 'Não foi possível consultar o CEP agora. Preencha o endereço.';
      } finally {
        grupo.setAttribute('aria-busy', 'false');
      }
    };
    cep.addEventListener('input', consultar);
    ligarFormulario(form, coletarEndereco, 'Endereço salvo.');
  }

  function coletarEndereco(form) {
    const erros = obrigatoriosVazios(form);
    const pais = val(form, 'endereco.pais') || 'Brasil';
    const br = ehBrasil(pais);
    const base = {
      pais,
      logradouro: val(form, 'endereco.logradouro') || null,
      numero: val(form, 'endereco.numero') || null,
      complemento: val(form, 'endereco.complemento') || null,
      bairro: val(form, 'endereco.bairro') || null,
      cidade: val(form, 'endereco.cidade') || null
    };
    let endereco;
    if (br) {
      const cep = so(val(form, 'endereco.cep'));
      if (cep && cep.length !== 8) erros['endereco.cep'] = 'CEP inválido. Use 8 dígitos.';
      endereco = Object.assign(base, { cep: cep || null, uf: val(form, 'endereco.uf') || null, codigoPostal: null, regiao: null });
    } else {
      const cp = val(form, 'endereco.codigoPostal');
      if (cp && !/^[A-Za-z0-9 -]{3,12}$/.test(cp)) erros['endereco.codigoPostal'] = 'Código postal inválido. Use de 3 a 12 letras, números, espaço ou hífen.';
      endereco = Object.assign(base, { cep: null, uf: null, codigoPostal: cp || null, regiao: val(form, 'endereco.regiao') || null });
    }
    return { corpo: { endereco }, erros };
  }

  // ----- Foto (aceite ANTES de enviar; 428 reabre sem perder o arquivo) -----
  function ligarFoto(el) {
    const caixaCons = el.querySelector('[data-consentimento="foto"]');
    const st = el.querySelector('.pf-perfil-form__status');
    const t = textoConsentimento('foto');
    const reg = registroVigente('foto');
    let arquivo = null;

    async function aceitarFoto() {
      const texto = textoConsentimento('foto');
      await chamar('POST', API.consentimentos, { finalidade: 'perfil_foto', aceito: true, versaoTexto: texto ? texto.versaoTexto : 'v1' });
      E.dados = (await chamar('GET', API.perfil)) || E.dados;
    }

    if (t) {
      E.consentimentos.foto = consentimento(caixaCons, {
        texto: t.texto,
        versaoTexto: t.versaoTexto,
        registro: reg,
        modo: 'botoes',
        rotulos: { aceitar: 'Concordo' },
        aoAceitar: async () => {
          try {
            await aceitarFoto();
            const guardado = arquivo;
            desenharSecao('foto');
            const st2 = document.querySelector('#foto .pf-perfil-form__status');
            if (st2) st2.textContent = 'Autorização registrada. Agora você pode enviar a foto.';
            if (guardado) prepararArquivo(document.getElementById('foto'), guardado);
            const escolher = document.getElementById('pf-perfil-foto-arquivo');
            if (escolher) escolher.focus();
          } catch (err) { if (st) st.textContent = mensagemPadrao(err); }
        },
        aoRetirar: reg ? () => retirar('foto') : undefined
      });
    } else {
      caixaCons.hidden = true;
    }

    const entrada = el.querySelector('#pf-perfil-foto-arquivo');
    if (entrada) entrada.addEventListener('change', () => { if (entrada.files && entrada.files[0]) prepararArquivo(el, entrada.files[0]); });

    const enviar = el.querySelector('[data-pf-perfil="enviar-foto"]');
    if (enviar) {
      enviar.addEventListener('click', async () => {
        const arq = el._pfArquivo;
        if (!arq) return;
        ocupar(enviar, true, 'Enviando…');
        try {
          await enviarArquivo(API.foto, arq, arq.type);
          E.dados = (await chamar('GET', API.perfil)) || E.dados;
          if (E.dados && E.dados.perfil) E.dados.perfil.temFoto = true;
          if (E.ctx.user) E.ctx.user.temFoto = true;
          desenharSecao('foto');
          const st2 = document.querySelector('#foto .pf-perfil-form__status');
          if (st2) st2.textContent = 'Foto enviada.';
          sincronizarNome();
        } catch (err) {
          if (err && err.codigo === 'consentimento-necessario') {
            // Reabre o aceite com o texto atual; o arquivo escolhido fica guardado.
            try {
              const atual = await chamar('GET', API.perfil);
              if (atual) { E.dados.textosConsentimento = atual.textosConsentimento; E.dados.consentimentos = atual.consentimentos; }
            } catch { /* segue */ }
            const texto = textoConsentimento('foto');
            if (E.consentimentos.foto) E.consentimentos.foto.destruir();
            caixaCons.hidden = false;
            E.consentimentos.foto = consentimento(caixaCons, {
              texto: texto ? texto.texto : '',
              versaoTexto: texto ? texto.versaoTexto : 'v1',
              registro: null,
              modo: 'botoes',
              rotulos: { aceitar: 'Concordo e enviar' },
              aoAceitar: async () => {
                try {
                  await aceitarFoto();
                  await enviarArquivo(API.foto, arq, arq.type);
                  E.dados = (await chamar('GET', API.perfil)) || E.dados;
                  if (E.ctx.user) E.ctx.user.temFoto = true;
                  desenharSecao('foto');
                  const st3 = document.querySelector('#foto .pf-perfil-form__status');
                  if (st3) st3.textContent = 'Foto enviada.';
                } catch (e2) { if (st) st.textContent = mensagemPadrao(e2); }
              }
            });
            E.consentimentos.foto.exigir({ texto: texto ? texto.texto : '', versaoTexto: texto ? texto.versaoTexto : 'v1' });
            if (st) st.textContent = 'Confirme a autorização para salvar.';
          } else if (err && err.status === 413) {
            erroFoto(el, 'Arquivo maior que 2 MB.');
          } else if (err && err.status === 415) {
            erroFoto(el, 'Formato não aceito. Envie JPG, PNG ou WebP.');
          } else if (st) st.textContent = mensagemPadrao(err);
        } finally { if (enviar.isConnected) ocupar(enviar, false); }
      });
    }

    const remover = el.querySelector('[data-pf-perfil="remover-foto"]');
    if (remover) {
      remover.addEventListener('click', async () => {
        const ok = await confirmar({ titulo: 'Remover a foto?', texto: 'A foto é apagada agora e o portal volta a mostrar as suas iniciais.', rotuloConfirmar: 'Remover foto', perigo: true });
        if (!ok) return;
        try {
          await chamar('DELETE', API.foto);
          if (E.dados && E.dados.perfil) { E.dados.perfil.temFoto = false; E.dados.perfil.fotoArquivoId = null; }
          if (E.ctx.user) E.ctx.user.temFoto = false;
          desenharSecao('foto');
          const st2 = document.querySelector('#foto .pf-perfil-form__status');
          if (st2) st2.textContent = 'Foto removida.';
        } catch (err) { if (st) st.textContent = mensagemPadrao(err); }
      });
    }

    const img = el.querySelector('#pf-perfil-foto-img');
    if (img) carregarFotoAtual(img);
  }

  function erroFoto(el, texto) {
    const p = el.querySelector('#pf-perfil-foto-erro');
    const entrada = el.querySelector('#pf-perfil-foto-arquivo');
    if (p) { p.textContent = texto; p.hidden = !texto; }
    if (entrada) { if (texto) entrada.setAttribute('aria-invalid', 'true'); else entrada.removeAttribute('aria-invalid'); }
  }

  function prepararArquivo(el, arq) {
    erroFoto(el, '');
    const enviar = el.querySelector('[data-pf-perfil="enviar-foto"]');
    const previa = el.querySelector('.pf-perfil-foto__previa');
    const tipos = ['image/jpeg', 'image/png', 'image/webp'];
    if (tipos.indexOf(arq.type) < 0) { erroFoto(el, 'Formato não aceito. Envie JPG, PNG ou WebP.'); if (enviar) enviar.hidden = true; return; }
    if (arq.size > 2 * 1024 * 1024) { erroFoto(el, 'Arquivo maior que 2 MB.'); if (enviar) enviar.hidden = true; return; }
    el._pfArquivo = arq;
    if (previa) {
      const img = previa.querySelector('img');
      if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
      const url = URL.createObjectURL(arq);
      img.dataset.url = url;
      img.src = url;
      previa.hidden = false;
    }
    if (enviar) enviar.hidden = false;
  }

  async function carregarFotoAtual(img) {
    if (typeof UI.imagemProtegida === 'function') {
      try { await UI.imagemProtegida(img, '/api' + API.foto); return; } catch { /* cai no local */ }
    }
    try {
      const blob = await lerBlob(API.foto);
      if (E.fotoUrl) URL.revokeObjectURL(E.fotoUrl);
      E.fotoUrl = URL.createObjectURL(blob);
      img.src = E.fotoUrl;
    } catch {
      img.replaceWith(Object.assign(document.createElement('p'), { className: 'pf-ajuda', textContent: 'Não foi possível carregar a foto agora.' }));
    }
  }

  // ----- Senha e segurança -----
  function validarNovaSenha(nova, confirmacao, erros) {
    const u = E.ctx.user || {};
    const b = bytesUtf8(nova);
    if (nova && (b < 8 || b > 72)) erros.novaSenha = 'A nova senha precisa ter de 8 a 72 caracteres.';
    else if (nova && u.email && nova.trim().toLowerCase() === String(u.email).toLowerCase()) erros.novaSenha = 'A nova senha não pode ser igual ao seu e-mail.';
    else if (nova && perfil().cpf && so(nova) === nova && nova === perfil().cpf) erros.novaSenha = 'A nova senha não pode ser igual ao seu CPF.';
    if (confirmacao !== undefined && nova && confirmacao !== nova) erros.confirmar = 'As senhas não conferem.';
  }

  async function trocarSenha(senhaAtual, novaSenha) {
    const A = window.DMC_Auth;
    if (A && typeof A.trocarSenha === 'function') return A.trocarSenha(senhaAtual, novaSenha);
    const r = await chamar('POST', API.trocarSenha, { senhaAtual, novaSenha });
    if (r && r.token && window.DMC_Api) window.DMC_Api.setToken(r.token);
    return r;
  }

  function errosDeSenha(err) {
    const campos = (err && err.campos) || {};
    const e = {};
    if (campos.senhaAtual) e.senhaAtual = 'Senha atual incorreta.';
    if (campos.novaSenha) e.novaSenha = String(campos.novaSenha);
    return e;
  }

  function ligarMostrarSenha(form) {
    const chk = form.querySelector('[data-pf-perfil="mostrar-senha"]');
    if (!chk) return;
    chk.addEventListener('change', () => {
      form.querySelectorAll('input[name="senhaAtual"], input[name="novaSenha"], input[name="confirmar"]').forEach((i) => { i.type = chk.checked ? 'text' : 'password'; });
    });
  }

  function ligarSeguranca(el) {
    const form = el.querySelector('form[data-secao="senha"]');
    ligarMostrarSenha(form);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limparErros(form);
      const erros = obrigatoriosVazios(form);
      const atual = form.elements.namedItem('senhaAtual').value;
      const nova = form.elements.namedItem('novaSenha').value;
      validarNovaSenha(nova, form.elements.namedItem('confirmar').value, erros);
      if (Object.keys(erros).length) { mostrarErros(form, erros); return; }
      const botao = form.querySelector('button[type="submit"]');
      ocupar(botao, true, 'Trocando…');
      try {
        await trocarSenha(atual, nova);
        form.reset();
        status(form, 'Senha alterada. As sessões em outros aparelhos foram encerradas.');
      } catch (err) {
        const e = errosDeSenha(err);
        if (Object.keys(e).length) mostrarErros(form, e);
        else mostrarAlertaNoForm(form, mensagemPadrao(err), false);
      } finally { ocupar(botao, false); }
    });

    const sessoes = el.querySelector('form[data-secao="sessoes"]');
    sessoes.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limparErros(sessoes);
      const senha = sessoes.elements.namedItem('senhaSessoes').value;
      if (!senha) { mostrarErros(sessoes, { senhaSessoes: 'Preencha a senha atual.' }); return; }
      const botao = sessoes.querySelector('button[type="submit"]');
      ocupar(botao, true, 'Encerrando…');
      try {
        const r = await chamar('POST', API.encerrarOutras, { senha });
        if (r && r.token && window.DMC_Api) window.DMC_Api.setToken(r.token);
        sessoes.reset();
        status(sessoes, 'Sessões em outros aparelhos encerradas.');
      } catch (err) {
        sessoes.elements.namedItem('senhaSessoes').value = '';
        if (err && err.campos && err.campos.senha) mostrarErros(sessoes, { senhaSessoes: 'Senha incorreta.' });
        else mostrarAlertaNoForm(sessoes, mensagemPadrao(err), false);
      } finally { ocupar(botao, false); }
    });

    const caixa2fa = el.querySelector('.pf-perfil-2fa');
    if (caixa2fa) montarDoisFatores(caixa2fa);
  }

  // ----- Verificação em duas etapas (só com PORTAL_2FA ou conta já ativa) -----
  async function montarDoisFatores(el) {
    let info;
    try { info = await chamar('GET', API.doisFatores); } catch (err) {
      el.setAttribute('aria-busy', 'false');
      el.innerHTML = html`<h3 class="pf-perfil-subtitulo">Verificação em duas etapas</h3><p class="pf-alerta pf-alerta--erro">${mensagemPadrao(err)}</p>`;
      return;
    }
    el.setAttribute('aria-busy', 'false');
    if (info && info.ativo) {
      el.innerHTML = html`<h3 class="pf-perfil-subtitulo">Verificação em duas etapas</h3>
        <p>${typeof UI.estado === 'function' ? UI.estado('Ativa', 'sucesso') : 'Ativa'} desde ${dataBr(info.ativadoEm)}. Códigos de recuperação restantes: ${String(info.codigosRestantes == null ? '—' : info.codigosRestantes)}.</p>
        <form class="pf-perfil-form" data-secao="2fa-gerenciar" novalidate>
          <div class="pf-erros" tabindex="-1" hidden></div>
          ${campo({ nome: 'senha2fa', rotulo: 'Senha atual', tipo: 'password', obrigatorio: true, autocomplete: 'current-password', max: 200 })}
          ${campo({ nome: 'codigo2fa', rotulo: 'Código do aplicativo', obrigatorio: true, autocomplete: 'one-time-code', inputmode: 'numeric', max: 9 })}
          <div class="pf-perfil-form__acoes">
            <button type="submit" class="dmc-btn dmc-btn--secondary" value="codigos">Gerar novos códigos de recuperação</button>
            <button type="submit" class="dmc-btn dmc-btn--secondary pf-btn--perigo" value="desativar">Desativar</button>
          </div>
          <div class="pf-perfil-2fa__codigos"></div>
          <p class="pf-perfil-form__status" role="status" aria-live="polite"></p>
        </form>`;
      const form = el.querySelector('form');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        limparErros(form);
        const acao = ev.submitter && ev.submitter.value;
        const senha = form.elements.namedItem('senha2fa').value;
        const codigo = form.elements.namedItem('codigo2fa').value.trim();
        const erros = obrigatoriosVazios(form);
        if (Object.keys(erros).length) { mostrarErros(form, erros); return; }
        try {
          if (acao === 'desativar') {
            const r = await chamar('POST', API.doisFatoresDesativar, { senha, codigo });
            if (r && r.token && window.DMC_Api) window.DMC_Api.setToken(r.token);
            if (E.ctx.user) E.ctx.user.doisFatoresAtivo = false;
            anunciar('Verificação em duas etapas desativada.');
            montarDoisFatores(el);
          } else {
            const r = await chamar('POST', API.doisFatoresCodigos, { senha, codigo });
            form.elements.namedItem('senha2fa').value = '';
            form.elements.namedItem('codigo2fa').value = '';
            mostrarCodigos(form.querySelector('.pf-perfil-2fa__codigos'), (r && r.codigosRecuperacao) || []);
          }
        } catch (err) {
          form.elements.namedItem('senha2fa').value = '';
          const c = (err && err.campos) || {};
          const e = {};
          if (c.senha) e.senha2fa = 'Senha incorreta.';
          if (c.codigo) e.codigo2fa = 'Código inválido.';
          if (Object.keys(e).length) mostrarErros(form, e); else mostrarAlertaNoForm(form, mensagemPadrao(err), false);
        }
      });
      return;
    }
    if (!info || info.disponivel === false) {
      el.hidden = true;
      return;
    }
    el.innerHTML = html`<h3 class="pf-perfil-subtitulo">Verificação em duas etapas</h3>
      <p>${typeof UI.estado === 'function' ? UI.estado('Desativada', 'neutro') : 'Desativada'}. Com ela, a entrada pede também um código do aplicativo autenticador do seu celular.</p>
      <form class="pf-perfil-form" data-secao="2fa-iniciar" novalidate>
        <div class="pf-erros" tabindex="-1" hidden></div>
        ${campo({ nome: 'senhaAtivar', rotulo: 'Senha atual', tipo: 'password', obrigatorio: true, autocomplete: 'current-password', max: 200 })}
        <div class="pf-perfil-form__acoes"><button type="submit" class="dmc-btn dmc-btn--secondary">Ativar</button></div>
      </form>
      <div class="pf-perfil-2fa__passo" hidden></div>`;
    const form = el.querySelector('form');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limparErros(form);
      const senha = form.elements.namedItem('senhaAtivar').value;
      if (!senha) { mostrarErros(form, { senhaAtivar: 'Preencha a senha atual.' }); return; }
      try {
        const r = await chamar('POST', API.doisFatoresIniciar, { senha });
        form.hidden = true;
        await mostrarPassoAtivacao(el.querySelector('.pf-perfil-2fa__passo'), r, el);
      } catch (err) {
        form.elements.namedItem('senhaAtivar').value = '';
        if (err && err.campos && err.campos.senha) mostrarErros(form, { senhaAtivar: 'Senha incorreta.' });
        else mostrarAlertaNoForm(form, mensagemPadrao(err), false);
      }
    });
  }

  function carregarScript(src) {
    if (typeof UI.carregarScript === 'function') return UI.carregarScript(src);
    return new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => ok();
      s.onerror = () => falha(new Error('script'));
      document.body.appendChild(s);
    });
  }

  async function mostrarPassoAtivacao(passo, inicio, raiz2fa) {
    let qr = '';
    try {
      if (!window.DMC_QR) await carregarScript(QR_JS);
      if (window.DMC_QR && typeof window.DMC_QR.svg === 'function') qr = window.DMC_QR.svg(inicio.otpauthUri, { tamanho: 192 });
    } catch { qr = ''; }
    passo.hidden = false;
    passo.innerHTML = html`<ol class="pf-perfil-2fa__lista">
        <li>Abra o aplicativo autenticador do seu celular e ${qr ? 'leia o código QR abaixo' : 'adicione uma conta digitando a chave abaixo'}.</li>
        <li>Digite o código de 6 dígitos que aparece no aplicativo.</li>
      </ol>
      ${qr ? html`<div class="pf-qr pf-perfil-2fa__qr">${cru(qr)}</div>` : ''}
      <p>Chave para digitar: ${typeof UI.codigo === 'function' ? UI.codigo(inicio.segredo) : html`<code class="pf-codigo">${inicio.segredo}</code>`}</p>
      <form class="pf-perfil-form" data-secao="2fa-ativar" novalidate>
        <div class="pf-erros" tabindex="-1" hidden></div>
        ${campo({ nome: 'codigoAtivar', rotulo: 'Código do aplicativo', obrigatorio: true, autocomplete: 'one-time-code', inputmode: 'numeric', max: 6 })}
        <div class="pf-perfil-form__acoes"><button type="submit" class="dmc-btn dmc-btn--primary">Confirmar e ativar</button></div>
      </form>
      <div class="pf-perfil-2fa__codigos"></div>`;
    const form = passo.querySelector('form');
    form.elements.namedItem('codigoAtivar').focus();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limparErros(form);
      const codigo = form.elements.namedItem('codigoAtivar').value.trim();
      if (!/^\d{6}$/.test(codigo)) { mostrarErros(form, { codigoAtivar: 'Código inválido. Digite os 6 números do aplicativo.' }); return; }
      try {
        const r = await chamar('POST', API.doisFatoresAtivar, { codigo });
        if (r && r.token && window.DMC_Api) window.DMC_Api.setToken(r.token);
        if (E.ctx.user) E.ctx.user.doisFatoresAtivo = true;
        form.hidden = true;
        mostrarCodigos(passo.querySelector('.pf-perfil-2fa__codigos'), (r && r.codigosRecuperacao) || [], () => montarDoisFatores(raiz2fa));
        anunciar('Verificação em duas etapas ativada.');
      } catch (err) {
        if (err && err.codigo === 'pendente-expirado') mostrarAlertaNoForm(form, 'O tempo para ativar terminou. Comece de novo.', false);
        else mostrarErros(form, { codigoAtivar: 'Código inválido.' });
      }
    });
  }

  function mostrarCodigos(el, codigos, aoConcluir) {
    if (!el) return;
    const texto = codigos.join('\n');
    el.innerHTML = html`<p class="pf-alerta pf-alerta--aviso">Guarde estes códigos de recuperação. Cada um vale uma vez, e eles aparecem só agora.</p>
      <ul class="pf-perfil-2fa__lista-codigos">${codigos.map((c) => html`<li><code>${c}</code></li>`)}</ul>
      <div class="pf-perfil-form__acoes">
        <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-perfil="baixar-codigos">Baixar</button>
        <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-perfil="imprimir-codigos">Imprimir</button>
        ${aoConcluir ? html`<button type="button" class="dmc-btn dmc-btn--primary" data-pf-perfil="concluir-2fa">Já guardei os códigos</button>` : ''}
      </div>`;
    el.querySelector('[data-pf-perfil="baixar-codigos"]').addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([`Códigos de recuperação · Plataforma Complexo DMC\n\n${texto}\n`], { type: 'application/octet-stream' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'codigos-de-recuperacao.txt' });
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    el.querySelector('[data-pf-perfil="imprimir-codigos"]').addEventListener('click', () => window.print());
    const concluir = el.querySelector('[data-pf-perfil="concluir-2fa"]');
    if (concluir) concluir.addEventListener('click', () => aoConcluir());
    const alerta = el.querySelector('.pf-alerta');
    if (alerta) { alerta.setAttribute('tabindex', '-1'); alerta.focus(); }
  }

  // ----- Preferências (locais; D-17) -----
  function ligarPreferencias(el) {
    const shell = window.DMC_Shell;
    const st = el.querySelector('.pf-perfil-form__status');
    const avisarPref = () => { if (st) { st.textContent = ''; window.setTimeout(() => { st.textContent = 'Preferência aplicada neste navegador.'; }, 30); } };
    const tema = el.querySelector('[data-pf-perfil="tema"]');
    if (tema) tema.addEventListener('change', () => { shell.tema.definir(tema.value); avisarPref(); });
    const fonte = el.querySelector('[data-pf-perfil="fonte"]');
    if (fonte) fonte.addEventListener('change', () => { shell.fonte.definir(Number(fonte.value)); avisarPref(); });
    const tour = el.querySelector('[data-pf-perfil="tour"]');
    if (tour) tour.addEventListener('click', () => { shell.tour.iniciar('primeiro-acesso'); });
    document.addEventListener('dmc:tema', () => { if (tema && shell.tema) tema.value = shell.tema.obter(); });
    document.addEventListener('dmc:fonte', () => { if (fonte && shell.fonte) fonte.value = String(shell.fonte.obter()); });
  }

  // ---------------------------------------------------------------
  // Modo restrito — "Crie uma senha pessoal para continuar" (UX §6.15)
  // ---------------------------------------------------------------
  function destinoInicial() {
    const A = window.DMC_Auth;
    if (A && typeof A.destinoInicial === 'function') return A.destinoInicial();
    const u = A && A.user ? A.user() : null;
    if (u && u.isAdmin) return 'admin.html';
    if (u && u.papel === 'professor') return 'professor.html';
    return 'dashboard.html';
  }

  function montarRestrito(raiz) {
    document.title = 'Crie uma senha pessoal · Plataforma Complexo DMC';
    const titulo = document.getElementById('pf-perfil-titulo');
    const desc = document.getElementById('pf-perfil-desc');
    if (titulo) titulo.textContent = 'Crie uma senha pessoal para continuar';
    if (desc) desc.textContent = 'Você entrou com uma senha temporária criada pela coordenação. Defina agora a sua senha pessoal.';
    raiz.classList.add('pf-perfil--restrito');
    raiz.innerHTML = html`<section class="pf-perfil-secao" id="seguranca" aria-labelledby="seguranca-titulo">
      <h2 class="pf-secao-titulo pf-perfil-secao__titulo" id="seguranca-titulo" tabindex="-1">Senha pessoal</h2>
      <form class="pf-perfil-form" data-secao="senha" novalidate>
        <p class="pf-ajuda" id="pf-perfil-regra-senha">A nova senha precisa ter de 8 a 72 caracteres e ser diferente do seu e-mail e do seu CPF.</p>
        <div class="pf-erros" tabindex="-1" hidden></div>
        ${campo({ nome: 'senhaAtual', rotulo: 'Senha temporária', tipo: 'password', obrigatorio: true, autocomplete: 'current-password', max: 200 })}
        ${campo({ nome: 'novaSenha', rotulo: 'Nova senha', tipo: 'password', obrigatorio: true, autocomplete: 'new-password', max: 200 })}
        ${campo({ nome: 'confirmar', rotulo: 'Confirmar nova senha', tipo: 'password', obrigatorio: true, autocomplete: 'new-password', max: 200 })}
        <label class="pf-check pf-perfil-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" data-pf-perfil="mostrar-senha"><span>Mostrar senha</span></label>
        ${rodapeFormulario('Criar senha')}
      </form>
    </section>`;
    raiz.setAttribute('aria-busy', 'false');
    const form = raiz.querySelector('form');
    ligarMostrarSenha(form);
    form.elements.namedItem('senhaAtual').focus();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limparErros(form);
      const erros = obrigatoriosVazios(form);
      const atual = form.elements.namedItem('senhaAtual').value;
      const nova = form.elements.namedItem('novaSenha').value;
      validarNovaSenha(nova, form.elements.namedItem('confirmar').value, erros);
      if (Object.keys(erros).length) { mostrarErros(form, erros); return; }
      const botao = form.querySelector('button[type="submit"]');
      ocupar(botao, true, 'Criando…');
      try {
        await trocarSenha(atual, nova);
        try { await window.DMC_Auth.init(); } catch { /* o destino confere a sessão */ }
        try { window.sessionStorage.setItem('dmc:aviso', 'Senha criada.'); } catch { /* sem storage */ }
        window.location.replace(destinoInicial());
      } catch (err) {
        ocupar(botao, false);
        const e = errosDeSenha(err);
        if (Object.keys(e).length) mostrarErros(form, e);
        else mostrarAlertaNoForm(form, mensagemPadrao(err), false);
      }
    });
  }

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  async function boot(ctx) {
    E.ctx = ctx;
    E.raiz = document.getElementById('pf-perfil-raiz');
    if (ctx.restrito) { montarRestrito(E.raiz); return; }

    const [dados, recursos] = await Promise.all([
      chamar('GET', API.perfil, undefined, { silencioso404: true, sinal: ctx.sinal }),
      (window.DMC_Auth && typeof window.DMC_Auth.recursos === 'function'
        ? window.DMC_Auth.recursos()
        : chamar('GET', API.recursos, undefined, { silencioso404: true, sinal: ctx.sinal })).catch(() => null)
    ]);
    E.dados = dados;
    E.recursos = recursos || {};
    desenharTudo();
    focarHash();
    window.addEventListener('hashchange', focarHash);
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'perfil' });
})();
