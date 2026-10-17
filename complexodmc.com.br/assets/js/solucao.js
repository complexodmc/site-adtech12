/* ============================================================
   COMPLEXO DMC — Páginas internas (pages/** e /solucoes/**)

   Três peças, nenhuma dependência:
   1. a malha de nós do herói (.sol-net), textura discreta pintada
      com o acento do eixo lido do CSS (--np-accent) — sem sigla,
      sem halo; pausa fora da tela; menos nós em telas pequenas;
      estática com prefers-reduced-motion;
   2. o vídeo com alfa do rinoceronte (video.np-rino): marca
      .is-playing, pausa fora da tela e, com movimento reduzido,
      fica só o poster (os <source> já têm media query);
   3. a entrada por rolagem das seções (.reveal), que na home vem
      do main.js e nestas páginas não existiria.

   Sem este script a página continua completa: o herói mostra a
   grade de pontos, o vídeo toca sozinho e as seções já nascem
   visíveis.
   ============================================================ */
(function () {
  'use strict';

  var reduzMovimento = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  /* ---------- 1 · Malha de nós ---------- */
  function iniciaMalha(wrap) {
    var canvas = wrap.querySelector('.sol-net__canvas');
    if (!canvas || !canvas.getContext) return;

    var ctx = canvas.getContext('2d');
    var estilo = getComputedStyle(document.body);

    // O acento do eixo vem do CSS ("118, 183, 193" — tokens.css,
    // .np-pillar-*). Se faltar, cai no ouro da casa, nunca em preto.
    function token(nome, alternativa) {
      var valor = estilo.getPropertyValue(nome).trim();
      return valor ? valor : alternativa;
    }

    var base = token('--np-accent', '214, 176, 105');
    var claro = token('--np-accent-soft', '231, 211, 177');
    var cores = [base, base, claro];

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var largura = 0;
    var altura = 0;

    function redimensiona() {
      var caixa = wrap.getBoundingClientRect();
      largura = caixa.width;
      altura = caixa.height;
      canvas.width = Math.round(largura * dpr);
      canvas.height = Math.round(altura * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    var nos = [];
    function criaNos() {
      // Densidade pela área: ~24 nós no celular, até 56 no desktop.
      var quantidade = Math.round(Math.min(56, Math.max(24, (largura * altura) / 4800)));
      nos = [];
      for (var i = 0; i < quantidade; i++) {
        nos.push({
          x: Math.random() * largura,
          y: Math.random() * altura,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          r: Math.random() * 1.4 + 0.8,
          cor: cores[Math.floor(Math.random() * cores.length)],
          fase: Math.random() * Math.PI * 2
        });
      }
    }

    var DIST_MAX = 110;
    var DIST_MOUSE = 140;
    var mouse = { x: -999, y: -999 };

    function desenha(anima) {
      ctx.clearRect(0, 0, largura, altura);

      var i, j;
      if (anima) {
        for (i = 0; i < nos.length; i++) {
          nos[i].x += nos[i].vx;
          nos[i].y += nos[i].vy;
          nos[i].fase += 0.018;
          if (nos[i].x < 0 || nos[i].x > largura) nos[i].vx *= -1;
          if (nos[i].y < 0 || nos[i].y > altura) nos[i].vy *= -1;
        }
      }

      for (i = 0; i < nos.length; i++) {
        for (j = i + 1; j < nos.length; j++) {
          var dx = nos[i].x - nos[j].x;
          var dy = nos[i].y - nos[j].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < DIST_MAX) {
            ctx.beginPath();
            ctx.moveTo(nos[i].x, nos[i].y);
            ctx.lineTo(nos[j].x, nos[j].y);
            ctx.strokeStyle =
              'rgba(' + nos[i].cor + ',' + (1 - dist / DIST_MAX) * 0.4 + ')';
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        var mdx = nos[i].x - mouse.x;
        var mdy = nos[i].y - mouse.y;
        var mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mdist < DIST_MOUSE) {
          ctx.beginPath();
          ctx.moveTo(nos[i].x, nos[i].y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle =
            'rgba(' + nos[i].cor + ',' + (1 - mdist / DIST_MOUSE) * 0.5 + ')';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      for (i = 0; i < nos.length; i++) {
        // Sem halo: o nó é só o ponto (DESIGN-SYSTEM §1.4, sem brilho).
        var pulso = anima ? 0.8 + 0.2 * Math.sin(nos[i].fase) : 1;
        ctx.beginPath();
        ctx.arc(nos[i].x, nos[i].y, nos[i].r * pulso, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + nos[i].cor + ',0.85)';
        ctx.fill();
      }
    }

    redimensiona();
    criaNos();
    wrap.classList.add('has-net');   // sai a grade de pontos do fallback

    if (reduzMovimento) {
      desenha(false);
      window.addEventListener('resize', function () {
        redimensiona();
        criaNos();
        desenha(false);
      });
      return;
    }

    // Só anima com o herói em tela: fora dele, o quadro para.
    var visivel = true;
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entradas) {
        visivel = entradas[0].isIntersecting;
        if (visivel) laco();
      }, { threshold: 0 }).observe(wrap);
    }

    var rodando = false;
    function laco() {
      if (rodando) return;
      rodando = true;
      (function quadro() {
        if (!visivel || document.hidden) {
          rodando = false;
          return;
        }
        desenha(true);
        requestAnimationFrame(quadro);
      })();
    }

    var redimensionando;
    window.addEventListener('resize', function () {
      clearTimeout(redimensionando);
      redimensionando = setTimeout(function () {
        redimensiona();
        criaNos();
      }, 150);
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) laco();
    });

    // Resposta ao cursor só com ponteiro fino (no toque não há hover).
    var ponteiroFino = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (ponteiroFino) wrap.addEventListener('mousemove', function (e) {
      var caixa = wrap.getBoundingClientRect();
      mouse.x = e.clientX - caixa.left;
      mouse.y = e.clientY - caixa.top;
    });

    if (ponteiroFino) wrap.addEventListener('mouseleave', function () {
      mouse.x = -999;
      mouse.y = -999;
    });

    laco();
  }

  /* ---------- 2 · Vídeo com alfa (rinoceronte) ----------
     Sem autoplay no HTML: o atributo faz o navegador baixar o vídeo
     na carga, mesmo fora da tela. O play sai daqui, a 200px da tela.
     <video class="np-rino" muted loop playsinline
            preload="none" poster="…/rino-alpha-poster.webp">
       <source src="…/rino-alpha-gold.mov" type='video/mp4; codecs="hvc1"'
               media="(prefers-reduced-motion: no-preference)">
       <source src="…/rino-alpha-gold.webm" type="video/webm"
               media="(prefers-reduced-motion: no-preference)">
     </video>                                                     */
  function iniciaVideoAlfa(video) {
    if (reduzMovimento) {
      // Nenhum <source> casa: fica o poster. Garante que nada toque.
      video.removeAttribute('autoplay');
      video.pause();
      return;
    }

    var marca = function () { video.classList.add('is-playing'); };
    video.addEventListener('playing', marca);
    if (!video.paused && video.readyState > 2) marca();

    function toca() {
      video.muted = true;               // garante a política de autoplay
      video.preload = 'auto';
      var tocando = video.play();
      if (tocando && tocando.catch) tocando.catch(function () {});
    }

    if (!window.IntersectionObserver) { toca(); return; }
    new IntersectionObserver(function (entradas) {
      if (entradas[0].isIntersecting) toca();
      else video.pause();
    }, { rootMargin: '200px 0px' }).observe(video);
  }

  /* ---------- 3 · Entrada por rolagem ---------- */
  function iniciaEntrada() {
    var alvos = document.querySelectorAll('.reveal');
    if (!alvos.length || !window.IntersectionObserver || reduzMovimento) return;

    // A classe só entra quando há JS: sem ela, nada fica oculto.
    document.body.classList.add('js-reveal');

    var observador = new IntersectionObserver(
      function (entradas) {
        entradas.forEach(function (entrada) {
          if (!entrada.isIntersecting) return;
          entrada.target.classList.add('visible');
          observador.unobserve(entrada.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );

    for (var i = 0; i < alvos.length; i++) observador.observe(alvos[i]);
  }

  function inicia() {
    var malhas = document.querySelectorAll('.sol-net');
    for (var i = 0; i < malhas.length; i++) iniciaMalha(malhas[i]);
    var videos = document.querySelectorAll('video.np-rino');
    for (var j = 0; j < videos.length; j++) iniciaVideoAlfa(videos[j]);
    iniciaEntrada();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicia);
  } else {
    inicia();
  }
})();
