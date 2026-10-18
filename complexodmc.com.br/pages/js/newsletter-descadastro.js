// =============================================================
// Descadastro da newsletter — pages/newsletter-descadastro.html
// POST JSON em /api/newsletter/descadastro com { email, website } e
// Accept: application/json (contrato: server/src/routes/newsletter.js).
//   202 { ok, mensagem }  → mostra a mensagem NEUTRA do servidor (não afirma remoção)
//   400 { error, campos } → erro por campo (aria-invalid + aria-describedby)
//   400/403/429/503       → texto do servidor ou fallback, nunca soando como sucesso
//   falha de rede/timeout → orientação para tentar de novo ou escrever ao e-mail
// Mesmo desenho do main.js (contato/newsletter da home). Sem JS, o form posta
// urlencoded na mesma rota e o servidor responde em HTML.
// =============================================================
(function () {
  'use strict';

  var form = document.getElementById('descadastroForm');
  if (!form) return;

  var botao = document.getElementById('submitBtn');
  var mensagem = document.getElementById('formMessage');
  var rotulo = botao ? botao.textContent : '';
  var endpoint = form.getAttribute('action') || '/api/newsletter/descadastro';
  var EMAIL_EQUIPE = 'administrativo@complexodmc.com.br';
  var M = {
    enviando: 'Enviando seu pedido…',
    revise: 'Revise o e-mail informado.',
    limite: 'Muitas solicitações em sequência. Aguarde alguns minutos e tente de novo.',
    indisponivel: 'Não foi possível concluir o pedido agora. Tente novamente em instantes ou escreva para ' + EMAIL_EQUIPE + '.',
    rede: 'Não conseguimos falar com o servidor. Confira sua conexão e tente de novo; se preferir, escreva para ' + EMAIL_EQUIPE + '.'
  };

  // Com JS a validação nativa sai de cena (mensagem por campo vinda do servidor);
  // sem JS o navegador continua bloqueando vazio/inválido antes do POST nativo.
  form.noValidate = true;

  function mostrarEstado(texto, estado) {
    if (!mensagem) return;
    mensagem.textContent = texto;
    mensagem.className = 'form-message is-' + estado;
  }

  function ocupado(sim) {
    if (sim) form.setAttribute('aria-busy', 'true');
    else form.removeAttribute('aria-busy');
    if (botao) {
      botao.disabled = sim;
      botao.textContent = sim ? 'Enviando…' : rotulo;
    }
  }

  function limparErro(campo) {
    if (!campo || !campo.removeAttribute || !campo.id) return;
    campo.removeAttribute('aria-invalid');
    var erro = document.getElementById(campo.id + '-erro');
    if (erro) erro.remove();
    var ids = (campo.getAttribute('aria-describedby') || '').split(/\s+/)
      .filter(function (id) { return id && id !== campo.id + '-erro'; });
    if (ids.length) campo.setAttribute('aria-describedby', ids.join(' '));
    else campo.removeAttribute('aria-describedby');
  }

  function marcarInvalidos(campos) {
    var primeiro = null;
    Object.keys(campos || {}).forEach(function (nome) {
      var campo = form.elements.namedItem(nome);
      if (!campo || !campo.setAttribute || !campo.id) return;
      campo.setAttribute('aria-invalid', 'true');
      var idErro = campo.id + '-erro';
      var erro = document.getElementById(idErro);
      if (!erro) {
        erro = document.createElement('p');
        erro.id = idErro;
        erro.className = 'form-field__error';
        (campo.closest('.form-field') || campo.parentNode).appendChild(erro);
      }
      erro.textContent = String(campos[nome]);
      var ids = (campo.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      if (ids.indexOf(idErro) === -1) ids.push(idErro);
      campo.setAttribute('aria-describedby', ids.join(' '));
      if (!primeiro) primeiro = campo;
    });
    if (primeiro && primeiro.focus) primeiro.focus();
  }

  form.addEventListener('input', function (e) { limparErro(e.target); });
  form.addEventListener('change', function (e) { limparErro(e.target); });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;
    form.querySelectorAll('[aria-invalid="true"]').forEach(limparErro);

    var dados = {};
    new FormData(form).forEach(function (valor, campo) {
      dados[campo] = typeof valor === 'string' ? valor.trim() : valor;
    });

    ocupado(true);
    mostrarEstado(M.enviando, 'enviando');

    var resposta = null;
    var corpo = null;
    try {
      var opcoes = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(dados),
        credentials: 'same-origin'
      };
      if (window.AbortSignal && typeof AbortSignal.timeout === 'function') opcoes.signal = AbortSignal.timeout(15000);
      resposta = await fetch(endpoint, opcoes);
      corpo = await resposta.json().catch(function () { return null; });
    } catch (err) {
      resposta = null;
    }
    ocupado(false);

    if (!resposta) {
      mostrarEstado(M.rede, 'erro');
      return;
    }

    // 202 (e-mail) ou 200 (token/honeypot): só a mensagem neutra do servidor.
    if (resposta.ok && corpo && corpo.ok === true) {
      form.reset();
      mostrarEstado(corpo.mensagem || 'Pedido recebido.', 'ok');
      if (mensagem) { mensagem.setAttribute('tabindex', '-1'); mensagem.focus(); }
      return;
    }

    if (resposta.status === 400 && corpo && corpo.campos) {
      marcarInvalidos(corpo.campos);
      mostrarEstado((corpo.error || M.revise), 'erro');
      return;
    }

    if (resposta.status === 429) {
      mostrarEstado((corpo && corpo.error) || M.limite, 'erro');
      return;
    }

    if (corpo && corpo.error && (resposta.status === 400 || resposta.status === 403 || resposta.status === 413 || resposta.status === 503)) {
      mostrarEstado(corpo.error, 'erro');
      return;
    }

    mostrarEstado(M.indisponivel, 'erro');
  });
})();
