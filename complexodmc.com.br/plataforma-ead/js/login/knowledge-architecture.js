/* =============================================================
   COMPLEXO DMC · LOGIN — CONTROLADOR DA ARQUITETURA
   Junta renderer + geometria e cuida do tempo: entrada encenada,
   respiração em idle, parallax de cursor, destaque de camada e a
   sequência de acesso disparada só depois de autenticação válida.

   Regras de comportamento que valem a pena registrar:

   · A torre inteira gira devagar em um único eixo. Cada camada
     ganha só uma oscilação diferencial mínima — se cada nível
     girasse no próprio ritmo, as conexões verticais se soltariam
     das camadas e a leitura de "estrutura" iria embora.
   · O cursor não é perseguido: ele desloca a câmera dentro de um
     envelope pequeno e acende o que está por perto.
   · prefers-reduced-motion desenha UM quadro no estado final e
     encerra o loop. Nada de câmera, deriva ou revelação.
   ============================================================= */
(function () {
  'use strict';

  var ORCAMENTO_MS = 23;     // acima disso por 90 frames, rebaixa a qualidade
  var AMOSTRA = 90;

  function suavizar(atual, alvo, dt, constante) {
    return atual + (alvo - atual) * (1 - Math.exp(-dt / constante));
  }

  function easeOutExpo(t) {
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function iniciar(opcoes) {
    var o = opcoes || {};
    var canvas = o.canvas;
    if (!canvas || !window.DMC_GL || !window.DMC_KnowledgeGeometry) return null;

    var reduzido = !!o.reduzido;
    var semCursor = !!o.semCursor;
    var nivel = o.nivel || window.DMC_GL.detectarQualidade();

    var r = window.DMC_GL.criar(canvas);
    if (!r) return null;

    var G = window.DMC_KnowledgeGeometry;
    var C = G.CAMADA;
    var cena = null;

    function carregar(nv) {
      cena = G.construir(nv);
      r.carregarSegmentos(cena.segmentos);
      r.carregarPontos(cena.pontos);
      r.carregarFaces(cena.faces);
    }
    carregar(nivel);

    // ---------- enquadramento responsivo ----------
    // O palco é deslocado em NDC: a câmera não sabe nada de layout,
    // então trocar a composição é só trocar dois números.
    var palco = { x: -0.38, y: 0.10, escala: 0.74 };

    function medirPalco() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      var baixo = h < 760;
      // A torre precisa terminar acima da headline: o espaço vazio
      // entre a base e o texto é o que separa "instalação" de "fundo".
      if (w >= 1180) {
        palco = { x: -0.20, y: baixo ? 0.32 : 0.29, escala: baixo ? 0.485 : 0.565 };
      } else if (w >= 900) {
        palco = { x: -0.18, y: 0.28, escala: 0.57 };
      } else if (w >= 640) {
        palco = { x: 0.0, y: 0.64, escala: 0.40 };
      } else {
        // Celular: a torre sobe para que o rinoceronte fique ACIMA da
        // headline em vez de atrás dela. A cidade desce para trás do
        // card — na tela pequena o herói é o bicho, não o skyline.
        palco = { x: 0.0, y: 0.68, escala: 0.34 };
      }
    }
    medirPalco();

    // ---------- estado de animação ----------
    var t0 = 0;
    var tempo = 0;
    var ultimo = 0;
    var rafId = 0;
    var vivo = true;
    var alvoPonteiro = { x: 0, y: 0 };
    var ponteiro = { x: 0, y: 0 };
    var ponteiroAtivo = 0;
    var camadaAtiva = null;
    var destaque = new Float32Array(12);   // 0..1 por camada
    var impulso = new Float32Array(12);    // clarão da sequência de acesso
    var dolly = 0;
    var dollyAlvo = 0;
    var quadros = 0;
    var somaMs = 0;
    var rebaixamentos = 0;
    var resolvePronto;
    var pronto = new Promise(function (res) { resolvePronto = res; });

    // ---------- interação ----------
    function moverPonteiro(ev) {
      alvoPonteiro.x = (ev.clientX / window.innerWidth) * 2 - 1;
      alvoPonteiro.y = 1 - (ev.clientY / window.innerHeight) * 2;
      ponteiroAtivo = 1;
    }
    function sairPonteiro() {
      alvoPonteiro.x = 0;
      alvoPonteiro.y = 0;
      ponteiroAtivo = 0;
    }

    if (!reduzido && !semCursor) {
      window.addEventListener('pointermove', moverPonteiro, { passive: true });
      window.addEventListener('pointerleave', sairPonteiro, { passive: true });
      window.addEventListener('blur', sairPonteiro);
    }

    // ---------- dimensionamento ----------
    var redimensionarPendente = 0;
    function aplicarTamanho() {
      medirPalco();
      r.redimensionar(window.innerWidth, window.innerHeight, window.DMC_GL.limitarDpr());
      if (!vivo || reduzido) desenharQuadro(0);
    }
    function aoRedimensionar() {
      clearTimeout(redimensionarPendente);
      redimensionarPendente = setTimeout(aplicarTamanho, 120);
    }
    window.addEventListener('resize', aoRedimensionar, { passive: true });
    window.addEventListener('orientationchange', aoRedimensionar, { passive: true });
    aplicarTamanho();

    // ---------- ciclo ----------
    function atualizar(dt) {
      var e = r.estado;

      // Cursor: mola lenta. Amplitude pequena de propósito.
      ponteiro.x = suavizar(ponteiro.x, alvoPonteiro.x, dt, 0.28);
      ponteiro.y = suavizar(ponteiro.y, alvoPonteiro.y, dt, 0.28);
      e.ponteiro = [
        palco.x + ponteiro.x * 0.35,
        palco.y + ponteiro.y * 0.35
      ];
      e.pointerGain = suavizar(e.pointerGain, reduzido || semCursor ? 0 : ponteiroAtivo, dt, 0.4);

      // Câmera: parallax + respiração vertical + avanço da sequência.
      dolly = suavizar(dolly, dollyAlvo, dt, 0.26);
      var respira = reduzido ? 0 : Math.sin(tempo * 0.42) * 0.035;
      var olho = [
        ponteiro.x * 0.44,
        1.72 + ponteiro.y * 0.26 + respira,
        6.45 - dolly * 1.25
      ];
      var alvo = [ponteiro.x * 0.10, 1.55 + respira * 0.5, 0];
      r.camera(olho, alvo, 0.62);

      e.offset = [palco.x, palco.y];
      e.escala = palco.escala * (1 + dolly * 0.06);
      e.tempo = reduzido ? 9 : tempo;
      e.deriva = reduzido ? 0 : 1;

      // Giro global + oscilação diferencial por camada.
      var giro = reduzido ? 0.22 : tempo * 0.028;
      for (var i = 0; i <= 11; i++) {
        var dif = reduzido ? 0 : Math.sin(tempo * 0.21 + i * 1.7) * 0.05;
        e.spin[i] = giro + dif;
      }
      e.spin[C.ORBITA] = reduzido ? -0.4 : -tempo * 0.075;
      e.spin[C.POEIRA] = giro * 0.4;
      e.spin[C.RINO] = giro + (reduzido ? 0 : Math.sin(tempo * 0.17) * 0.13);
      e.spin[C.RINO_PT] = e.spin[C.RINO];
      e.spin[C.RINO_FACE] = e.spin[C.RINO];

      // Ganhos: respiração + destaque de camada + clarão de acesso.
      var quatro = [C.FUNDACAO, C.METODO, C.ESTRATEGIA, C.APLICACAO];
      var algumAtivo = camadaAtiva != null;
      for (var k = 0; k <= 11; k++) {
        var alvoDestaque = 0;
        if (algumAtivo) alvoDestaque = (k === camadaAtiva) ? 1 : -1;
        destaque[k] = suavizar(destaque[k], alvoDestaque, dt, 0.22);
        impulso[k] = suavizar(impulso[k], 0, dt, 0.30);

        var base = reduzido ? 1 : 1 + Math.sin(tempo * 0.55 + k * 1.1) * 0.04;
        var d = destaque[k];
        // Nunca esconde as outras camadas: no máximo recua.
        var fator = d >= 0 ? 1 + d * 0.55 : 1 + d * 0.42;
        if (algumAtivo && quatro.indexOf(k) === -1) fator = 1 - 0.18;
        e.gain[k] = base * fator * (1 + impulso[k]);
      }

      // Rinoceronte: wireframe → pontos → wireframe. Ciclo longo,
      // amplitude curta: precisa ser percebido, não observado.
      if (!reduzido) {
        var ciclo = (Math.sin(tempo * 0.2) + 1) * 0.5;   // 0..1, ~31s
        e.gain[C.RINO] *= 1.06 - ciclo * 0.34;
        e.gain[C.RINO_PT] *= 0.42 + ciclo * 1.15;
        e.gain[C.RINO_FACE] *= 0.88 + ciclo * 0.24;
      } else {
        e.gain[C.RINO_PT] *= 0.7;
      }
    }

    function desenharQuadro(dt) {
      atualizar(dt);
      r.desenhar();
    }

    function loop(agora) {
      if (!vivo) return;
      if (!t0) { t0 = agora; ultimo = agora; }
      var dt = Math.min(0.05, (agora - ultimo) / 1000) || 0.016;
      ultimo = agora;
      tempo = (agora - t0) / 1000;

      desenharQuadro(dt);

      // Vigia de performance: rebaixa se o orçamento estourar.
      quadros++;
      somaMs += dt * 1000;
      if (quadros >= AMOSTRA) {
        var media = somaMs / quadros;
        quadros = 0;
        somaMs = 0;
        if (media > ORCAMENTO_MS && rebaixamentos < 2) {
          rebaixamentos++;
          nivel = nivel === 'HIGH' ? 'MEDIUM' : 'LOW';
          carregar(nivel);
        }
      }

      rafId = requestAnimationFrame(loop);
    }

    function pausar() {
      if (!rafId) return;
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    function retomar() {
      if (rafId || !vivo || reduzido) return;
      ultimo = performance.now();
      // Recoloca a origem para não pular o tempo acumulado com a aba oculta.
      t0 = ultimo - tempo * 1000;
      rafId = requestAnimationFrame(loop);
    }
    function aoVisibilidade() {
      if (document.visibilityState === 'hidden') pausar();
      else retomar();
    }
    document.addEventListener('visibilitychange', aoVisibilidade);

    if (reduzido) {
      // Um quadro no estado final e ponto.
      tempo = 9;
      desenharQuadro(0.016);
      resolvePronto();
    } else {
      rafId = requestAnimationFrame(function (agora) {
        loop(agora);
        resolvePronto();
      });
    }

    // ---------- API ----------

    function destacar(indice) {
      camadaAtiva = (indice == null) ? null : Number(indice);
    }

    /**
     * Projeta um ponto do mundo na viewport. Devolve frações da tela
     * ({x,y} em 0..1, y crescendo para baixo) ou null se o ponto estiver
     * atrás da câmera.
     *
     * Repete exatamente a conta de `projetar()` no vertex shader
     * (gl-renderer.js), inclusive o deslocamento do palco em espaço de
     * clip — é isso que permite à interface 2D encostar na geometria 3D
     * em vez de depender de percentuais chutados no CSS.
     *
     * O giro por camada é ignorado de propósito: os pontos que a
     * interface projeta ficam no eixo (x=z=0) ou usam o raio inscrito
     * da laje, que é o mínimo garantido em qualquer ângulo de rotação.
     */
    function projetar(p) {
      var m = r.estado.viewProj;
      if (!m) return null;
      var x = p[0], y = p[1], z = p[2];
      var cx = m[0] * x + m[4] * y + m[8] * z + m[12];
      var cy = m[1] * x + m[5] * y + m[9] * z + m[13];
      var cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (cw <= 0.0001) return null;
      var e = r.estado;
      cx = cx * e.escala + e.offset[0] * cw;
      cy = cy * e.escala + e.offset[1] * cw;
      return { x: (1 + cx / cw) / 2, y: (1 - cy / cw) / 2 };
    }

    /**
     * Sequência de acesso — só deve ser chamada após login válido.
     * A energia sobe camada a camada, as conexões acendem e a câmera
     * avança um passo em direção ao centro da arquitetura.
     */
    function sequenciaDeAcesso() {
      if (reduzido) {
        impulso[C.FUNDACAO] = impulso[C.METODO] = 0.9;
        impulso[C.ESTRATEGIA] = impulso[C.APLICACAO] = 0.9;
        return new Promise(function (res) { setTimeout(res, 260); });
      }
      var passos = [
        [0, C.BASE, 1.5],
        [40, C.FUNDACAO, 1.9],
        [140, C.METODO, 1.9],
        [240, C.ESTRATEGIA, 1.9],
        [340, C.APLICACAO, 2.1],
        [430, C.CONEXAO, 2.4],
        [430, C.ORBITA, 1.6],
        [470, C.RINO, 1.2]
      ];
      passos.forEach(function (p) {
        setTimeout(function () { impulso[p[1]] = p[2]; }, p[0]);
      });
      setTimeout(function () { dollyAlvo = 1; }, 420);
      return new Promise(function (res) { setTimeout(res, 1150); });
    }

    function destruir() {
      vivo = false;
      pausar();
      clearTimeout(redimensionarPendente);
      window.removeEventListener('resize', aoRedimensionar);
      window.removeEventListener('orientationchange', aoRedimensionar);
      window.removeEventListener('pointermove', moverPonteiro);
      window.removeEventListener('pointerleave', sairPonteiro);
      window.removeEventListener('blur', sairPonteiro);
      document.removeEventListener('visibilitychange', aoVisibilidade);
      r.destruir();
    }

    return {
      pronto: pronto,
      nivel: function () { return nivel; },
      destacar: destacar,
      projetar: projetar,
      sequenciaDeAcesso: sequenciaDeAcesso,
      destruir: destruir
    };
  }

  window.DMC_KnowledgeArchitecture = { iniciar: iniciar, easeOutExpo: easeOutExpo };
})();
