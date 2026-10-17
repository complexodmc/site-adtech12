/* ============================================================
   COMPLEXO DMC — Páginas de Solução (/solucoes/**)

   Duas peças, nenhuma dependência:
   1. a malha de nós do herói, no mesmo desenho das páginas de
      serviço, porém pintada com o acento do eixo lido do CSS —
      a cor mora em solucao.css, não aqui;
   2. a entrada por rolagem das seções, que na home vem do
      main.js e nestas páginas não existiria.

   Sem este script a página continua completa: o herói perde a
   animação e as seções simplesmente já nascem visíveis.
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

    // O acento do eixo vem do CSS ("185, 140, 245"). Se faltar,
    // cai no ciano da casa em vez de desenhar em preto.
    function token(nome, alternativa) {
      var valor = estilo.getPropertyValue(nome).trim();
      return valor ? valor : alternativa;
    }

    var base = token('--np-accent', '0, 231, 252');
    var fundo = token('--np-accent-deep', '0, 168, 220');
    var claro = token('--np-accent-soft', '150, 245, 255');
    var cores = [base, claro, base, claro, fundo];

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
      var quantidade = largura < 340 ? 34 : largura < 460 ? 48 : 62;
      nos = [];
      for (var i = 0; i < quantidade; i++) {
        nos.push({
          x: Math.random() * largura,
          y: Math.random() * altura,
          vx: (Math.random() - 0.5) * 0.42,
          vy: (Math.random() - 0.5) * 0.42,
          r: Math.random() * 2.2 + 1,
          cor: cores[Math.floor(Math.random() * cores.length)],
          fase: Math.random() * Math.PI * 2
        });
      }
    }

    var DIST_MAX = 120;
    var DIST_MOUSE = 150;
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
              'rgba(' + nos[i].cor + ',' + (1 - dist / DIST_MAX) * 0.6 + ')';
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
            'rgba(' + nos[i].cor + ',' + (1 - mdist / DIST_MOUSE) * 0.75 + ')';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }

      for (i = 0; i < nos.length; i++) {
        var pulso = anima ? 0.7 + 0.3 * Math.sin(nos[i].fase) : 1;
        ctx.beginPath();
        ctx.arc(nos[i].x, nos[i].y, nos[i].r * pulso, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + nos[i].cor + ',0.95)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(nos[i].x, nos[i].y, nos[i].r * 4 * pulso, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + nos[i].cor + ',0.1)';
        ctx.fill();
      }
    }

    redimensiona();
    criaNos();

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

    wrap.addEventListener('mousemove', function (e) {
      var caixa = wrap.getBoundingClientRect();
      mouse.x = e.clientX - caixa.left;
      mouse.y = e.clientY - caixa.top;
    });

    wrap.addEventListener('mouseleave', function () {
      mouse.x = -999;
      mouse.y = -999;
    });

    laco();
  }

  /* ---------- 2 · Entrada por rolagem ---------- */
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
    iniciaEntrada();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicia);
  } else {
    inicia();
  }
})();
