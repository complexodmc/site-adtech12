/* ============================================================
   COMPLEXO DMC — Central de Parcerias (parcerias/**)
   1. Analytics PREPARADO, não integrado: track() só empurra para
      window.dataLayer se ele já existir e sempre dispara
      CustomEvent('dmc:analytics'). Nenhum dado pessoal nas props.
   2. FAQ: sem JS as respostas ficam abertas; aqui viram acordeão
      (button aria-expanded/aria-controls dentro do h3).
   3. Formulários: POST /api/parcerias/partner-lawyers e
      /business-partner (server/src/routes/parcerias.js). Sem JS o
      <form> envia urlencoded; com JS valida no cliente (espelho do
      servidor), envia JSON e trata 201/200/400/413/429/5xx/rede.
      Sucesso só com a resposta do servidor — nada é simulado.
      Textos: <template id="xx-msgs"> da página (COPY.md).
   ============================================================ */
(function () {
  'use strict';

  var doc = document;
  var PROGRAMA = (doc.body && doc.body.getAttribute('data-pp-programa')) || 'central';
  var EVENTO = { 'partner-lawyers': 'partner_lawyers', 'business-partner': 'business_partner' };
  var UTM_CAMPOS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var EMAIL_EQUIPE = 'administrativo@complexodmc.com.br';
  var SETA = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  var MAIS = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';

  // ---------- UTM: só da query string, só [A-Za-z0-9._-], até 80; senão vazio ----------
  var UTM = {};
  var busca = null;
  try { busca = new URLSearchParams(location.search); } catch (e) { busca = null; }
  UTM_CAMPOS.forEach(function (k) {
    var v = busca ? busca.get(k) : null;
    UTM[k] = typeof v === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(v) ? v : '';
  });

  // ---------- 1 · Analytics ----------
  function track(evento, props) {
    var detail = { event: evento, programa: PROGRAMA };
    if (UTM.utm_campaign) detail.utm_campaign = UTM.utm_campaign;
    if (props) Object.keys(props).forEach(function (k) { detail[k] = props[k]; });
    if (window.dataLayer && typeof window.dataLayer.push === 'function') {
      try { window.dataLayer.push(detail); } catch (e) { /* camada externa: nunca quebra a página */ }
    }
    try { window.dispatchEvent(new CustomEvent('dmc:analytics', { detail: detail })); } catch (e) { /* navegador antigo */ }
  }

  if (EVENTO[PROGRAMA]) track(EVENTO[PROGRAMA] + '_page_view');

  doc.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var canal = href.indexOf('https://wa.me/') === 0 ? 'whatsapp' : /^mailto:/i.test(href) ? 'email' : '';
    if (canal) track('partnership_contact_click', { canal: canal });
  });

  // ---------- 2 · FAQ em acordeão ----------
  Array.prototype.forEach.call(doc.querySelectorAll('[data-pp-faq]'), function (lista) {
    Array.prototype.forEach.call(lista.querySelectorAll('.pp-faq__item'), function (item) {
      var q = item.querySelector('.pp-faq__q');
      var r = item.querySelector('.pp-faq__a');
      if (!q || !r || !r.id) return;
      var btn = doc.createElement('button');
      var texto = doc.createElement('span');
      btn.type = 'button';
      btn.className = 'pp-faq__btn';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', r.id);
      while (q.firstChild) texto.appendChild(q.firstChild);
      btn.appendChild(texto);
      btn.insertAdjacentHTML('beforeend', MAIS);
      q.appendChild(btn);
      r.hidden = true;
      btn.addEventListener('click', function () {
        var abrir = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(abrir));
        r.hidden = !abrir;
        r.classList.remove('is-abrindo');
        if (abrir) { void r.offsetWidth; r.classList.add('is-abrindo'); }
      });
    });
    lista.classList.add('is-pronto');
  });

  // ---------- 2b · Lente do comparativo ----------
  // Sem JS a tabela mostra os dois programas. Aqui nasce o grupo de botões
  // (aria-pressed) que grava data-foco no cartão; o CSS esmaece a outra coluna
  // (≥768) ou a esconde (<768). A tabela continua inteira no DOM.
  Array.prototype.forEach.call(doc.querySelectorAll('[data-pp-lente-slot]'), function (slot) {
    var cartao = doc.querySelector('[data-pp-cmp]');
    if (!cartao) return;
    var OPCOES = [['', 'Os dois', ''], ['pl', 'Partner Lawyers', 'pp-pl'], ['bp', 'Business Partner', 'pp-bp']];
    var rotulo = doc.createElement('p');
    var grupo = doc.createElement('div');
    rotulo.className = 'pp-lente__rotulo';
    rotulo.id = 'pp-lente-rotulo';
    rotulo.textContent = 'Destacar programa';
    grupo.className = 'pp-lente__grupo';
    grupo.setAttribute('role', 'group');
    grupo.setAttribute('aria-labelledby', rotulo.id);
    var botoes = OPCOES.map(function (o) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'pp-lente__btn' + (o[2] ? ' ' + o[2] : '');
      b.textContent = o[1];
      b.setAttribute('aria-pressed', String(!o[0]));
      b.addEventListener('click', function () {
        botoes.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        if (o[0]) cartao.setAttribute('data-foco', o[0]);
        else cartao.removeAttribute('data-foco');
        track('partnership_compare_focus', { foco: o[0] || 'ambos' });
      });
      grupo.appendChild(b);
      return b;
    });
    slot.appendChild(rotulo);
    slot.appendChild(grupo);
  });

  // ---------- 3 · Formulários ----------
  Array.prototype.forEach.call(doc.querySelectorAll('form[data-pp-form]'), iniciarForm);

  function iniciarForm(form) {
    var programa = form.getAttribute('data-pp-form');
    var prefixo = EVENTO[programa];
    var tpl = doc.getElementById(form.id.replace(/-form$/, '') + '-msgs');
    var status = form.querySelector('.pp-status');
    var botao = form.querySelector('[type="submit"]');
    var rotulo = botao ? botao.textContent : '';
    var M = {};
    if (!tpl || !tpl.content || !status || !botao) return;   // sem as peças, o envio nativo segue valendo
    Array.prototype.forEach.call(tpl.content.querySelectorAll('[data-msg]'), function (el) { M[el.getAttribute('data-msg')] = el; });
    var msg = function (k) { return M[k] ? M[k].cloneNode(true) : doc.createElement('p'); };
    var txt = function (k) { return M[k] ? M[k].textContent : ''; };

    form.noValidate = true;
    var ocultos = { pagina: location.pathname.slice(0, 120) };
    UTM_CAMPOS.forEach(function (k) { ocultos[k] = UTM[k]; });
    Object.keys(ocultos).forEach(function (k) { var el = form.elements.namedItem(k); if (el && el.type === 'hidden') el.value = ocultos[k]; });

    // Contador discreto nas áreas de texto
    Array.prototype.forEach.call(form.querySelectorAll('[data-pp-contador]'), function (c) {
      var campo = doc.getElementById(c.getAttribute('data-pp-contador'));
      if (!campo || campo.maxLength < 1) return;
      var atualizar = function () { c.textContent = campo.value.length + '/' + campo.maxLength; };
      campo.addEventListener('input', atualizar);
      atualizar();
    });

    // Primeira interação: uma vez
    var iniciou = false;
    var inicio = function () {
      if (iniciou) return;
      iniciou = true;
      track(prefixo + '_form_start');
    };
    form.addEventListener('focusin', inicio);
    form.addEventListener('change', inicio);

    // ----- campos e erros -----
    function lista(nome) {
      var el = form.elements.namedItem(nome);
      if (!el) return [];
      return el.tagName ? [el] : Array.prototype.slice.call(el);
    }
    function grupoDe(el) { return el.closest ? el.closest('[data-pp-grupo]') : null; }
    function idErro(campos) { return (campos[0].id || form.id + '-' + campos[0].name) + '-erro'; }
    function descr(el, id, por) {
      var ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (x) { return x && x !== id; });
      if (por) ids.push(id);
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
      else el.removeAttribute('aria-describedby');
    }
    function marcar(nome, texto) {
      var campos = lista(nome);
      if (!campos.length || campos[0].type === 'hidden') return false;
      var id = idErro(campos);
      var erro = doc.getElementById(id);
      if (!erro) {
        erro = doc.createElement('p');
        erro.id = id;
        erro.className = 'pp-erro';
        var grupo = grupoDe(campos[0]);
        var ancora = grupo ? grupo.parentNode : campos[0].closest('.pp-aceite, .pp-campo') || campos[0].parentNode;
        ancora.appendChild(erro);
      }
      erro.textContent = String(texto);
      campos.forEach(function (c) { c.setAttribute('aria-invalid', 'true'); descr(c, id, true); });
      var g = grupoDe(campos[0]);
      if (g) g.setAttribute('data-invalido', '');
      return true;
    }
    function limpar(nome) {
      var campos = lista(nome);
      if (!campos.length) return;
      var id = idErro(campos);
      var erro = doc.getElementById(id);
      if (erro) erro.remove();
      campos.forEach(function (c) { c.removeAttribute('aria-invalid'); descr(c, id, false); });
      var g = grupoDe(campos[0]);
      if (g) g.removeAttribute('data-invalido');
    }

    // Espelho das regras do servidor (validarCandidatura). Devolve '' se válido.
    function validar(nome) {
      var campos = lista(nome);
      var el = campos[0];
      if (!el || el.type === 'hidden' || nome === 'website') return '';
      var g = grupoDe(el);
      if (g) return campos.some(function (c) { return c.checked; }) ? '' : g.getAttribute('data-erro');
      var erro = el.getAttribute('data-erro') || '';
      if (el.type === 'checkbox') return el.required && !el.checked ? erro : '';
      var v = el.value.trim();
      if (!v) return el.required ? erro : '';
      if (el.type === 'email' && (v.length > 254 || !EMAIL_RE.test(v))) return erro;
      var regra = el.getAttribute('data-pp-regra');
      if (regra === 'oab' && !/^\d{3,7}$/.test(v.replace(/[.\s-]/g, ''))) return 'Número da OAB inválido. Informe só os dígitos da inscrição (3 a 7).';
      if (regra === 'telefone') {
        var d = v.replace(/\D/g, '');
        if (d.length < 10 || d.length > 13) return erro;
      }
      if ((nome === 'nome' || nome === 'cidade' || nome === 'cargo') && !/\p{L}/u.test(v)) return erro;
      if (el.minLength > 0 && v.length < el.minLength) return el.getAttribute('data-erro-curto') || erro;
      if (el.maxLength > 0 && v.length > el.maxLength) return erro;
      return '';
    }
    function nomes() {
      var vistos = [];
      Array.prototype.forEach.call(form.elements, function (el) {
        if (el.name && el.type !== 'hidden' && el.type !== 'submit' && vistos.indexOf(el.name) === -1) vistos.push(el.name);
      });
      return vistos;
    }

    // O erro some quando o campo fica válido
    var reavaliar = function (e) {
      var nome = e.target && e.target.name;
      if (!nome || e.target.getAttribute('aria-invalid') !== 'true') return;
      if (!validar(nome)) limpar(nome);
    };
    form.addEventListener('input', reavaliar);
    form.addEventListener('change', reavaliar);

    // ----- estado -----
    function linkificar(alvo) {
      Array.prototype.forEach.call(alvo.childNodes, function (no) {
        if (no.nodeType !== 3 || no.nodeValue.indexOf(EMAIL_EQUIPE) === -1) return;
        var partes = no.nodeValue.split(EMAIL_EQUIPE);
        var frag = doc.createDocumentFragment();
        partes.forEach(function (p, i) {
          if (i) {
            var a = doc.createElement('a');
            a.href = 'mailto:' + EMAIL_EQUIPE;
            a.textContent = EMAIL_EQUIPE;
            frag.appendChild(a);
          }
          if (p) frag.appendChild(doc.createTextNode(p));
        });
        alvo.replaceChild(frag, no);
      });
      return alvo;
    }
    function mostrar(chave, estado, extra) {
      status.className = 'pp-status is-' + estado;
      status.textContent = '';
      var p = typeof chave === 'string' ? doc.createTextNode(txt(chave)) : chave;
      var span = doc.createElement('span');
      span.appendChild(p);
      status.appendChild(linkificar(span));
      if (extra) { status.appendChild(doc.createTextNode(' ')); status.appendChild(extra); }
    }
    function ocupado(sim) {
      if (sim) form.setAttribute('aria-busy', 'true');
      else form.removeAttribute('aria-busy');
      botao.disabled = sim;
      botao.textContent = sim ? 'Enviando…' : rotulo;
      if (!sim && (doc.activeElement === doc.body || !doc.activeElement)) botao.focus();
    }
    function erroServidor() {
      var wa = msg('whatsapp');
      mostrar('servidor', 'erro', wa);
    }
    function preencherProtocolo(no, protocolo) {
      Array.prototype.forEach.call(no.querySelectorAll('[data-protocolo]'), function (s) { s.textContent = protocolo; });
      return no;
    }
    function confirmar(tipo, protocolo) {
      var painel = doc.createElement('div');
      var titulo = doc.createElement('h3');
      var corpo = [];
      painel.className = 'pp-confirmacao';
      titulo.className = 'pp-confirmacao__titulo' + (tipo.indexOf('duplicada') === 0 ? ' pp-confirmacao__titulo--longo' : '');
      titulo.id = form.id + '-confirmacao';
      titulo.tabIndex = -1;
      var t = preencherProtocolo(msg(tipo + '-titulo'), protocolo || '');
      while (t.firstChild) titulo.appendChild(t.firstChild);
      painel.appendChild(titulo);
      if (tipo === 'sucesso') {
        var p = preencherProtocolo(msg('sucesso-protocolo'), protocolo);
        p.className = 'pp-protocolo';
        corpo.push(p, msg('sucesso-texto'));
      } else {
        corpo.push(msg(tipo + '-texto'));
      }
      corpo.forEach(function (p, i) {
        p.id = form.id + '-confirmacao-' + i;
        painel.appendChild(linkificar(p));
      });
      titulo.setAttribute('aria-describedby', corpo.map(function (p) { return p.id; }).join(' '));
      var prox = msg('proximo');
      prox.className = 'dmc-btn dmc-btn--secondary';
      prox.insertAdjacentHTML('beforeend', ' ' + SETA);
      painel.appendChild(prox);
      form.parentNode.replaceChild(painel, form);
      titulo.focus();
    }
    function coletar() {
      var dados = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || el.disabled || el.type === 'submit' || el.tagName === 'FIELDSET') return;
        if (el.type === 'checkbox') {
          if (grupoDe(el)) {
            dados[el.name] = dados[el.name] || [];
            if (el.checked) dados[el.name].push(el.value);
          } else {
            dados[el.name] = el.checked;
          }
          return;
        }
        dados[el.name] = el.value.trim();
      });
      Object.keys(ocultos).forEach(function (k) { dados[k] = ocultos[k]; });
      return dados;
    }
    function tratar(st, c) {
      var ok = !!(c && c.ok === true);
      var protocolo = ok && typeof c.protocolo === 'string' ? c.protocolo : '';
      if (st === 201 && ok && protocolo && !c.duplicada) {
        confirmar('sucesso', protocolo);
        track(prefixo + '_submit_success');
        return;
      }
      if ((st === 200 || st === 201) && ok && c.duplicada) {
        confirmar(protocolo ? 'duplicada' : 'duplicada-sem', protocolo);
        return;
      }
      if ((st === 200 || st === 201) && ok) {         // honeypot: 200 { ok } sem protocolo
        confirmar('generica');
        return;
      }
      if (st === 400 && c && c.campos && typeof c.campos === 'object') {
        var algum = false;
        Object.keys(c.campos).forEach(function (nome) { if (marcar(nome, c.campos[nome])) algum = true; });
        mostrar('validacao', 'erro');
        var primeiro = form.querySelector('[aria-invalid="true"]');
        if (algum && primeiro) primeiro.focus();
        return;
      }
      if (st === 429) { mostrar('limite', 'erro'); return; }
      if (st === 413 && c && typeof c.error === 'string') { mostrar(doc.createTextNode(c.error), 'erro'); return; }
      erroServidor();
    }

    // ----- envio -----
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.getAttribute('aria-busy') === 'true') return;
      nomes().forEach(function (nome) {
        var m = validar(nome);
        if (m) marcar(nome, m);
        else limpar(nome);
      });
      var primeiro = form.querySelector('[aria-invalid="true"]');
      if (primeiro) {
        mostrar('validacao', 'erro');
        primeiro.focus();
        return;
      }

      ocupado(true);
      mostrar('enviando', 'enviando');
      var opcoes = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(coletar()),
        credentials: 'same-origin'
      };
      if (window.AbortSignal && typeof AbortSignal.timeout === 'function') opcoes.signal = AbortSignal.timeout(20000);
      var estado = 0;
      fetch(form.getAttribute('action'), opcoes)
        .then(function (r) {
          estado = r.status;
          return r.json().catch(function () { return null; });
        })
        .then(function (corpo) {
          ocupado(false);
          tratar(estado, corpo);
        })
        .catch(function () {
          ocupado(false);
          erroServidor();
        });
    });
  }
})();
