/* ============================================================
   COMPLEXO DMC — Verticais de Negócio (/verticais-de-negocio/**)

   1. Formulário #verticalForm → POST /api/contato (o mesmo serviço da
      home: server/src/routes/contato.js, que aceita os campos da
      vertical — segmento, faturamento, patrimonio, motivo — e deriva
      `perfil`/`eixo` quando não vêm). Aqui mandamos os dois também,
      a partir dos data-* da opção escolhida, para o lead cair no
      eixo certo mesmo num servidor antigo.
   2. Pré-seleção do segmento: a página do segmento já vem com a
      opção marcada (gerador); no índice, ?segmento=<slug> marca.
   3. Mensagem opcional: se vazia, vai um resumo dos campos
      estruturados (o servidor exige texto quando não há segmento).

   Estados em #formMessage: enviando / sucesso / erro. Só há
   "sucesso" quando o servidor responde 2xx com { ok: true }.
   ============================================================ */
(function () {
  'use strict';

  var form = document.getElementById('verticalForm');
  if (!form || form.tagName !== 'FORM') return;

  var EMAIL_EQUIPE = 'administrativo@complexodmc.com.br';
  var msg = document.getElementById('formMessage');
  var botao = form.querySelector('[type="submit"]');
  var rotulo = botao ? botao.innerHTML : '';
  var endpoint = form.getAttribute('action') || '/api/contato';
  var segmento = form.elements.namedItem('segmento');

  // ---------- pré-seleção pelo endereço (índice) ----------
  try {
    var pedido = new URLSearchParams(location.search).get('segmento');
    if (pedido && segmento && !segmento.value) {
      for (var i = 0; i < segmento.options.length; i++) {
        if (segmento.options[i].value === pedido) { segmento.selectedIndex = i; break; }
      }
    }
  } catch (e) { /* sem URLSearchParams: segue sem pré-seleção */ }

  // ---------- estados ----------
  function estado(texto, tipo) {
    if (!msg) return;
    msg.textContent = texto;
    msg.className = 'form-message is-' + tipo;
  }
  function ocupado(sim) {
    if (sim) form.setAttribute('aria-busy', 'true'); else form.removeAttribute('aria-busy');
    if (botao) { botao.disabled = sim; botao.innerHTML = sim ? 'Enviando…' : rotulo; }
  }
  function textoOpcao(nome) {
    var el = form.elements.namedItem(nome);
    if (!el || !el.options) return '';
    var o = el.options[el.selectedIndex];
    return o && o.value ? o.textContent.trim() : '';
  }

  // ---------- erro por campo (aria-describedby) ----------
  function limparErro(campo) {
    if (!campo || !campo.removeAttribute || !campo.id) return;
    campo.removeAttribute('aria-invalid');
    var erro = document.getElementById(campo.id + '-erro');
    if (erro) erro.remove();
    var ids = (campo.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (id) { return id && id !== campo.id + '-erro'; });
    if (ids.length) campo.setAttribute('aria-describedby', ids.join(' ')); else campo.removeAttribute('aria-describedby');
  }
  function marcar(campo, texto) {
    if (!campo || !campo.setAttribute || !campo.id) return;
    campo.setAttribute('aria-invalid', 'true');
    var idErro = campo.id + '-erro';
    var erro = document.getElementById(idErro);
    if (!erro) {
      erro = document.createElement('p');
      erro.id = idErro;
      erro.className = 'form-field__error';
      (campo.closest('.form-field, .form-consent') || campo.parentNode).appendChild(erro);
    }
    erro.textContent = String(texto);
    var ids = (campo.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (ids.indexOf(idErro) === -1) ids.push(idErro);
    campo.setAttribute('aria-describedby', ids.join(' '));
  }
  function marcarInvalidos(campos) {
    var primeiro = null;
    Object.keys(campos || {}).forEach(function (nome) {
      var campo = form.elements.namedItem(nome);
      if (!campo || campo.length && !campo.id) return;
      marcar(campo, campos[nome]);
      if (!primeiro) primeiro = campo;
    });
    if (primeiro && primeiro.focus) primeiro.focus();
  }
  form.addEventListener('input', function (e) { limparErro(e.target); });
  form.addEventListener('change', function (e) { limparErro(e.target); });

  // ---------- validação no cliente (o servidor é quem decide) ----------
  var OBRIGATORIOS = {
    nome: 'Informe seu nome.',
    email: 'Informe seu e-mail.',
    telefone: 'Informe telefone ou WhatsApp com DDD.',
    segmento: 'Selecione o segmento.',
    faturamento: 'Selecione a faixa de faturamento.',
    motivo: 'Informe o que motivou o contato.'
  };
  function validar() {
    var erros = {};
    Object.keys(OBRIGATORIOS).forEach(function (n) {
      var c = form.elements.namedItem(n);
      if (c && !String(c.value || '').trim()) erros[n] = OBRIGATORIOS[n];
    });
    var email = form.elements.namedItem('email');
    if (email && email.value && email.validity && email.validity.typeMismatch) erros.email = 'E-mail inválido. Confira o endereço digitado.';
    var tel = form.elements.namedItem('telefone');
    if (tel && tel.value) {
      var dig = tel.value.replace(/\D/g, '');
      if (dig.length < 10 || dig.length > 13) erros.telefone = 'Telefone inválido. Informe DDD e número.';
    }
    var cons = form.elements.namedItem('consentimento');
    if (cons && !cons.checked) erros.consentimento = 'Para retornarmos o contato, é preciso autorizar o uso dos seus dados (LGPD).';
    return erros;
  }

  // ---------- envio ----------
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;
    Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid="true"]'), limparErro);

    var erros = validar();
    if (Object.keys(erros).length) {
      marcarInvalidos(erros);
      estado('Revise os campos indicados.', 'erro');
      return;
    }

    var dados = {};
    new FormData(form).forEach(function (valor, campo) { dados[campo] = typeof valor === 'string' ? valor.trim() : valor; });
    var cons = form.elements.namedItem('consentimento');
    dados.consentimento = Boolean(cons && cons.checked);
    dados.origem = form.dataset.origem || dados.origem || location.pathname;

    // perfil e eixo do /api/contato, derivados da opção de segmento
    var op = segmento && segmento.options[segmento.selectedIndex];
    dados.eixo = (op && op.getAttribute('data-eixo')) || 'nao-sei';
    dados.perfil = (op && op.getAttribute('data-perfil')) || 'outro';

    // mensagem opcional: sem texto, vai o resumo estruturado
    if (!dados.mensagem) {
      var partes = [];
      var seg = textoOpcao('segmento'); if (seg) partes.push('Segmento: ' + seg + '.');
      var mot = textoOpcao('motivo'); if (mot) partes.push('Motivo do contato: ' + mot + '.');
      var fat = textoOpcao('faturamento'); if (fat) partes.push('Faturamento anual: ' + fat + '.');
      var pat = textoOpcao('patrimonio'); if (pat) partes.push('Patrimônio envolvido: ' + pat + '.');
      dados.mensagem = partes.join(' ') || 'Contato pela página de Verticais de Negócio.';
    }

    ocupado(true);
    estado('Enviando sua mensagem…', 'enviando');

    var opcoes = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(dados),
      credentials: 'same-origin'
    };
    if (window.AbortSignal && typeof AbortSignal.timeout === 'function') opcoes.signal = AbortSignal.timeout(15000);

    var resposta;
    fetch(endpoint, opcoes)
      .then(function (r) { resposta = r; return r.json().catch(function () { return null; }); })
      .then(function (corpo) {
        ocupado(false);
        if (resposta.ok && corpo && corpo.ok === true) {
          form.reset();
          if (op) segmento.value = op.value; // mantém o segmento da página
          estado('Mensagem recebida. Um especialista vai retornar pelo contato informado.', 'sucesso');
          return;
        }
        if (resposta.status === 400 && corpo && corpo.campos) {
          marcarInvalidos(corpo.campos);
          estado(Object.keys(corpo.campos).map(function (k) { return corpo.campos[k]; }).join(' '), 'erro');
          return;
        }
        if ((resposta.status === 429 || resposta.status === 413 || resposta.status === 400) && corpo && corpo.error) {
          estado(corpo.error, 'erro');
          return;
        }
        estado('Não foi possível enviar agora. Tente novamente em instantes ou escreva para ' + EMAIL_EQUIPE + '.', 'erro');
      })
      .catch(function () {
        ocupado(false);
        estado('Não conseguimos falar com o servidor. Confira sua conexão e tente de novo; se preferir, escreva para ' + EMAIL_EQUIPE + '.', 'erro');
      });
  });
})();
