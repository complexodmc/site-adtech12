/* =============================================================
   COMPLEXO DMC · LOGIN — CAMADA DE INTERFACE
   Liga a arquitetura 3D à tela de acesso. Não valida credencial,
   não fala com a API, não decide rota: tudo isso continua em
   bootLogin() (app.js). Aqui só existe comportamento visual.

   O único ponto de contato com a autenticação é o hook global
   DMC_onLoginSuccess — chamado por bootLogin DEPOIS de um login
   válido e ANTES de navegar. Se o login falha, nada disso roda.
   ============================================================= */
(function () {
  'use strict';

  function bootLoginExperience() {
    var corpo = document.body;
    if (!corpo || !corpo.classList.contains('login-page')) return;

    var mediaReduzido = window.matchMedia('(prefers-reduced-motion: reduce)');
    var reduzido = mediaReduzido.matches;
    var semCursor = window.matchMedia('(hover: none)').matches;

    // ---------- arquitetura 3D ----------
    // No celular a cena continua no ar, mas com o perfil LOW: menos
    // torres, sem janelas, sem bancada de indicadores e um terço das
    // partículas. Quem fica de fora é só quem não tem como sustentar —
    // aparelho fraco e modo de economia de dados. Nesses casos a
    // atmosfera em CSS assume e nada parece quebrado.
    function valeRodarACena() {
      var conexao = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conexao && conexao.saveData === true) return false;
      if (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 2) return false;
      if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2) return false;
      return true;
    }

    var arquitetura = null;
    var canvas = document.getElementById('arquitetura');
    if (canvas && window.DMC_KnowledgeArchitecture && valeRodarACena()) {
      arquitetura = window.DMC_KnowledgeArchitecture.iniciar({
        canvas: canvas,
        reduzido: reduzido,
        semCursor: semCursor
      });
    }
    if (arquitetura) {
      arquitetura.pronto.then(function () { corpo.classList.add('is-gl-ready'); });
    } else {
      // Sem WebGL a página continua completa: a atmosfera em CSS
      // assume o fundo e nenhum conteúdo se perde.
      corpo.classList.add('is-gl-off');
    }

    // ---------- rótulos das camadas ----------
    var lista = document.getElementById('camadas');
    if (lista && arquitetura) {
      lista.querySelectorAll('.camadas__item').forEach(function (item) {
        var indice = Number(item.dataset.camada);
        item.addEventListener('pointerenter', function () {
          item.classList.add('is-ativa');
          arquitetura.destacar(indice);
        });
        item.addEventListener('pointerleave', function () {
          item.classList.remove('is-ativa');
          arquitetura.destacar(null);
        });
      });
    }

    // ---------- ancoragem dos rótulos na geometria ----------
    // Os percentuais no CSS são só o plano B (sem WebGL). Com a cena no
    // ar, cada rótulo é posicionado pela projeção real da laje que ele
    // nomeia, e o conector é esticado até ENCOSTAR nela. Chamada técnica
    // que morre no vazio antes do objeto lê como erro de desenho — e o
    // enquadramento muda com a proporção da janela, então nenhum
    // percentual fixo sobrevive a todos os tamanhos de tela.
    var NIVEL_DE = { 1: 'FUNDACAO', 2: 'METODO', 3: 'ESTRATEGIA', 4: 'APLICACAO' };

    function ancorarRotulos() {
      var G = window.DMC_KnowledgeGeometry;
      if (!lista || !arquitetura || !arquitetura.projetar || !G) return;
      var caixa = lista.getBoundingClientRect();
      if (!caixa.width) return;                       // oculto no mobile
      lista.querySelectorAll('.camadas__item').forEach(function (item) {
        var chave = NIVEL_DE[item.dataset.camada];
        if (!chave) return;
        var centro = arquitetura.projetar([0, G.Y[chave], 0]);
        var borda = arquitetura.projetar([-G.R[chave], G.Y[chave], 0]);
        if (!centro || !borda) return;
        item.style.top = (centro.y * 100).toFixed(2) + '%';
        item.style.right = Math.round(caixa.right - (borda.x * window.innerWidth - 6)) + 'px';
      });
    }

    if (arquitetura) {
      arquitetura.pronto.then(ancorarRotulos);
      var reancorar = 0;
      window.addEventListener('resize', function () {
        clearTimeout(reancorar);
        // 160 ms: o controlador 3D remede o palco em 120 ms, e a
        // ancoragem precisa ler o enquadramento já atualizado.
        reancorar = setTimeout(ancorarRotulos, 160);
      }, { passive: true });
    }

    // ---------- abas ----------
    // Esta é a única dona da troca de modo: marca o form, acerta os
    // botões, mostra/esconde os campos do modo e avisa quem precisa
    // reagir pelo evento 'dmc:auth-mode' (bootLogin limpa as mensagens).
    // Antes a mesma troca acontecia aqui e em app.js, com dois estados
    // parciais competindo — e como bootLogin é assíncrono, um clique
    // nos primeiros milissegundos movia o indicador sem mudar o modo.
    var abas = document.querySelector('.abas');
    var formulario = document.getElementById('login-form');
    var botaoEnviar = document.getElementById('acesso-cta');
    var email = document.getElementById('email');
    var senha = document.getElementById('senha');
    var botoesAba = Array.prototype.slice.call(document.querySelectorAll('[data-auth-tab]'));

    function sincronizarAbas(modo) {
      if (abas) abas.classList.toggle('is-signup', modo === 'signup');
      botoesAba.forEach(function (b) {
        var ativo = b.dataset.authTab === modo;
        b.classList.toggle('is-active', ativo);
        b.setAttribute('aria-selected', String(ativo));
      });

      if (formulario) formulario.setAttribute('data-auth-mode', modo);

      document.querySelectorAll('[data-auth-only]').forEach(function (el) {
        var visivelEm = el.dataset.authOnly.split(',').map(function (s) { return s.trim(); });
        el.style.display = visivelEm.indexOf(modo) >= 0 ? '' : 'none';
      });

      if (botaoEnviar && !botaoEnviar.disabled) {
        botaoEnviar.textContent = modo === 'signup' ? 'Criar conta' : 'Acessar plataforma';
      }

      // Gerenciador de senha precisa saber se é senha existente ou nova:
      // com 'current-password' no cadastro ele oferece a senha salva em
      // vez de sugerir uma forte.
      if (senha) {
        senha.setAttribute('autocomplete', modo === 'signup' ? 'new-password' : 'current-password');
        senha.setAttribute('placeholder', modo === 'signup' ? 'Mínimo de 6 caracteres' : '••••••••');
      }

      if (formulario) {
        formulario.dispatchEvent(new CustomEvent('dmc:auth-mode', {
          detail: { modo: modo }, bubbles: true
        }));
      }
    }

    botoesAba.forEach(function (botao, i) {
      botao.addEventListener('click', function () { sincronizarAbas(botao.dataset.authTab); });
      botao.addEventListener('keydown', function (ev) {
        if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
        ev.preventDefault();
        var alvo = botoesAba[(i + (ev.key === 'ArrowRight' ? 1 : botoesAba.length - 1)) % botoesAba.length];
        alvo.focus();
        alvo.click();
      });
    });

    // Estado inicial: o modo declarado no HTML manda.
    sincronizarAbas(formulario && formulario.getAttribute('data-auth-mode') === 'signup' ? 'signup' : 'signin');

    // ---------- mostrar/ocultar senha ----------
    var olho = document.getElementById('ver-senha');
    if (olho && senha) {
      olho.addEventListener('click', function () {
        var visivel = senha.type === 'text';
        senha.type = visivel ? 'password' : 'text';
        olho.setAttribute('aria-pressed', String(!visivel));
        olho.setAttribute('aria-label', visivel ? 'Mostrar senha' : 'Ocultar senha');
        senha.focus({ preventScroll: true });
      });
    }

    // ---------- Caps Lock ----------
    // Causa silenciosa de "senha inválida": o campo é mascarado, então
    // o usuário não tem como ver que digitou tudo em maiúsculas.
    var capsAviso = document.getElementById('caps-aviso');
    if (senha && capsAviso) {
      var mostrarCaps = function (ev) {
        var ligado = typeof ev.getModifierState === 'function' && ev.getModifierState('CapsLock');
        capsAviso.hidden = !ligado;
      };
      senha.addEventListener('keyup', mostrarCaps);
      senha.addEventListener('keydown', mostrarCaps);
      // Em alguns navegadores o evento de foco não carrega o estado das
      // teclas modificadoras; nesse caso o aviso só aparece ao digitar.
      senha.addEventListener('focus', mostrarCaps);
      senha.addEventListener('blur', function () { capsAviso.hidden = true; });
    }

    // ---------- foco inicial ----------
    // Só onde existe teclado físico: em touch, focar abriria o teclado
    // virtual por cima do formulário assim que a página carrega.
    if (email && !semCursor && !email.value) {
      email.focus({ preventScroll: true });
    }

    // ---------- reflexo do cursor no card ----------
    var card = document.getElementById('acesso-card');
    if (card && !reduzido && !semCursor) {
      card.addEventListener('pointermove', function (ev) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((ev.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        card.style.setProperty('--my', ((ev.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      }, { passive: true });
      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--mx', '50%');
        card.style.setProperty('--my', '0%');
      });
    }

    // ---------- estado de envio ----------
    // bootLogin desabilita o botão enquanto a requisição corre e o
    // reabilita em caso de erro. Observar esse atributo evita
    // duplicar validação ou reimplementar o ciclo de submit.
    var cta = document.getElementById('acesso-cta');
    if (cta && 'MutationObserver' in window) {
      new MutationObserver(function () {
        cta.classList.toggle('is-carregando', cta.disabled && !cta.classList.contains('is-liberado'));
      }).observe(cta, { attributes: true, attributeFilter: ['disabled'] });
    }

    // ---------- transição pós-autenticação ----------
    var feixe = document.getElementById('feixe');
    var cortina = document.getElementById('cortina');
    var emTransicao = false;

    // O feixe precisa ACERTAR a arquitetura, não passar por baixo dela:
    // sai da borda do botão e termina no núcleo da torre. Como o núcleo
    // fica acima do botão, o traço é rotacionado em torno da ponta que
    // nasce no CTA — assim o crescimento parte de onde o pulso nasceu.
    var NUCLEO_TELA = { x: 0.40, y: 0.547 };   // projeção do núcleo em fração da viewport

    function dispararFeixe() {
      if (!feixe || !cta || reduzido || window.innerWidth < 900) return;
      var r = cta.getBoundingClientRect();
      var origemX = r.left;
      var origemY = r.top + r.height / 2;
      var alvoX = window.innerWidth * NUCLEO_TELA.x;
      var alvoY = window.innerHeight * NUCLEO_TELA.y;
      var dx = origemX - alvoX;
      var dy = origemY - alvoY;
      var dist = Math.max(80, Math.hypot(dx, dy));
      var ang = Math.atan2(dy, dx);

      feixe.style.width = dist + 'px';
      feixe.style.left = (origemX - dist) + 'px';
      feixe.style.top = origemY + 'px';
      feixe.style.setProperty('--feixe-ang', ang + 'rad');
      feixe.classList.remove('is-ativo');
      void feixe.offsetWidth;              // reinicia a animação
      feixe.classList.add('is-ativo');
    }

    /**
     * Chamado por bootLogin apenas quando a autenticação foi aceita.
     * Devolve uma Promise; a navegação acontece quando ela resolve.
     */
    window.DMC_onLoginSuccess = function () {
      if (emTransicao) return Promise.resolve();
      emTransicao = true;

      if (cta) {
        cta.classList.remove('is-carregando');
        cta.classList.add('is-liberado');
      }

      if (reduzido) {
        if (cortina) cortina.classList.add('is-ativa');
        var flash = arquitetura ? arquitetura.sequenciaDeAcesso() : Promise.resolve();
        return flash.then(function () {
          return new Promise(function (res) { setTimeout(res, 180); });
        });
      }

      // 1. o botão comprime (CSS) · 2. o pulso vira feixe ·
      // 3. a arquitetura recebe o impulso e acende camada a camada.
      setTimeout(dispararFeixe, 90);
      var sequencia = arquitetura
        ? arquitetura.sequenciaDeAcesso()
        : new Promise(function (res) { setTimeout(res, 700); });

      setTimeout(function () {
        if (cortina) cortina.classList.add('is-ativa');
      }, 880);

      return sequencia.then(function () {
        return new Promise(function (res) { setTimeout(res, 120); });
      });
    };

    // Se o usuário ligar "reduzir movimento" com a página aberta,
    // a próxima interação já respeita a preferência.
    if (mediaReduzido.addEventListener) {
      mediaReduzido.addEventListener('change', function (ev) { reduzido = ev.matches; });
    }
  }

  window.DMC_bootLoginExperience = bootLoginExperience;
})();
