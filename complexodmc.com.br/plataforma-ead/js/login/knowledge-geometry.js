/* =============================================================
   COMPLEXO DMC · LOGIN — ARQUITETURA DO CONHECIMENTO (geometria)
   Toda a instalação é gerada por código: nada de modelo importado,
   nada de vídeo simulando 3D.

   Leitura da composição, de baixo para cima:

     base circular   — o terreno institucional, régua e compasso
     núcleo          — o ponto de partida
     FUNDAÇÃO        — malha ortogonal, sólida e horizontal
     MÉTODO          — rede de nós organizada por regra
     ESTRATÉGIA      — dois anéis e rotas que atravessam relações
     APLICAÇÃO       — estrutura aberta, vetores que saem da torre
     conexões        — o que liga um nível ao outro (com pulsos)
     feixe vertical  — o eixo que atravessa tudo

   Índices de camada (usados como slot de spin/gain no shader):
     0 base · 1 fundação · 2 método · 3 estratégia · 4 aplicação
     5 conexões · 6 arestas do rino · 7 órbita · 8 vértices do rino · 9 poeira · 10 faces do rino
   ============================================================= */
(function () {
  'use strict';

  var TAU = Math.PI * 2;

  // Paleta em 0..1. Ciano e teal sustentam; esmeralda é reservada
  // para progresso, energia e conclusão — por isso quase só aparece
  // na camada Aplicação, no núcleo e nos pulsos.
  var COR = {
    cyan: [0.000, 0.874, 0.961],
    teal: [0.000, 0.902, 0.780],
    esmeralda: [0.000, 0.961, 0.478],
    branco: [0.957, 0.969, 0.973],
    // Grafite é o único tom neutro da paleta e o degrau tonal do meio.
    // Escuro demais ele desaparece sob blending aditivo — e a cena
    // volta a ser duotone ciano/verde sobre preto, sem valor médio.
    grafite: [0.463, 0.584, 0.627]
  };

  var CAMADA = { BASE: 0, FUNDACAO: 1, METODO: 2, ESTRATEGIA: 3, APLICACAO: 4, CONEXAO: 5, RINO: 6, ORBITA: 7, RINO_PT: 8, POEIRA: 9, RINO_FACE: 10, FLARE: 11 };

  // Alturas dos quatro níveis. Vãos: 0.62 · 0.64 · 1.24 · 0.62.
  //
  // Os três vãos curtos são iguais — essa regularidade É a metáfora:
  // camada sobre camada, degraus de uma mesma escada. O vão do
  // rinoceronte vale 1,94× o passo base; grande o bastante para ler
  // como decisão, não tanto que quebre a escada em "dois pares e um
  // buraco". Na tela isso dá passos de ~100 px, ~198 px e ~101 px.
  //
  // A bancada de indicadores ocupa de 2.69 a 3.51, e o topo útil da
  // viewport em desktop cai em Y≈3.72 (fórmula de projeção em
  // knowledge-architecture.js) — sobram ~80 px de respiro no alto.
  var Y = { BASE: 0, NUCLEO: 0.13, FUNDACAO: 0.62, METODO: 1.26, ESTRATEGIA: 2.50, APLICACAO: 3.12 };

  // Meia-largura de cada laje. A redução é monotônica de baixo para
  // cima (36% do primeiro ao último): é a única pista de perspectiva
  // que uma pilha de planos horizontais tem. Se o topo voltar a
  // crescer, a torre lê como ortográfica — adesivos empilhados.
  // Passos de ~11%, 18% e 18%: medido na tela, um degrau de 2% entre
  // duas lajes vizinhas simplesmente não é percebido como afunilamento.
  var R = { FUNDACAO: 1.34, METODO: 1.20, ESTRATEGIA: 0.98, APLICACAO: 0.80 };

  // Cronograma de entrada (segundos) — espelha a timeline pedida.
  var T = {
    BASE: 0.18, NUCLEO: 0.22, PULSO: 0.42,
    FUNDACAO: 0.70, METODO: 1.10, ESTRATEGIA: 1.50, APLICACAO: 1.90,
    CONEXAO: 2.20, POEIRA: 2.50, RINO: 2.80
  };

  // ---------- helpers de construção ----------

  function Coletor() {
    this.seg = [];
    this.pt = [];
    this.fac = [];
  }

  Coletor.prototype.face = function (a, b, c, o) {
    this.fac.push({
      a: a, b: b, c: c,
      cor: o.cor || COR.cyan,
      alpha: o.alpha == null ? 0.08 : o.alpha,
      camada: o.camada || 0,
      revelar: o.revelar || 0
    });
  };

  Coletor.prototype.linha = function (a, b, o) {
    this.seg.push({
      a: a, b: b,
      cor: o.cor || COR.cyan,
      alpha: o.alpha == null ? 0.5 : o.alpha,
      camada: o.camada || 0,
      revelar: o.revelar || 0,
      largura: o.largura || 1.15
    });
  };

  Coletor.prototype.caminho = function (pontos, o, fechar) {
    for (var i = 0; i < pontos.length - 1; i++) {
      this.linha(pontos[i], pontos[i + 1], escalonar(o, i, pontos.length));
    }
    if (fechar && pontos.length > 2) {
      this.linha(pontos[pontos.length - 1], pontos[0], escalonar(o, pontos.length - 1, pontos.length));
    }
  };

  Coletor.prototype.ponto = function (p, o) {
    this.pt.push({
      p: p,
      delta: o.delta || null,
      cor: o.cor || COR.cyan,
      alpha: o.alpha == null ? 0.8 : o.alpha,
      camada: o.camada || 0,
      revelar: o.revelar || 0,
      tamanho: o.tamanho || 2.2,
      fase: o.fase || 0,
      velocidade: o.velocidade || 0
    });
  };

  // Nó de estrutura: ponto nítido + halo maior e fraco atrás.
  // É o que dá a leitura de "luz" em vez de "pixel aceso".
  Coletor.prototype.no = function (p, o) {
    this.ponto(p, {
      cor: o.cor, alpha: (o.alpha == null ? 0.95 : o.alpha), camada: o.camada,
      revelar: o.revelar, tamanho: o.tamanho || 3.4, fase: o.fase || 0, velocidade: o.velocidade || 0.12
    });
    this.ponto(p, {
      cor: o.cor, alpha: (o.alpha == null ? 0.95 : o.alpha) * 0.22, camada: o.camada,
      revelar: o.revelar, tamanho: (o.tamanho || 3.4) * 3.1, fase: o.fase || 0, velocidade: o.velocidade || 0.12
    });
  };

  // Plataforma quadrada girada: a leitura arquitetônica de cada nível
  // vem do ângulo reto, não do círculo.
  function plataforma(c, y, meia, o, subdiv) {
    var cantos = [
      [-meia, y, -meia], [meia, y, -meia], [meia, y, meia], [-meia, y, meia]
    ];
    c.caminho(cantos, o, true);
    if (subdiv) {
      for (var i = 1; i < subdiv; i++) {
        var t = -meia + (i / subdiv) * meia * 2;
        // A malha interna é estrutura, não assunto: vai em grafite, o
        // único tom neutro da paleta. Se ela repetir o ciano da borda,
        // a laje inteira vira um bloco de croma alto e a hierarquia
        // entre "contorno" e "trama" desaparece.
        var oMalha = { cor: COR.grafite, alpha: (o.alpha || 0.3) * 0.42, camada: o.camada, revelar: o.revelar + 0.12, largura: 0.7 };
        c.linha([t, y, -meia], [t, y, meia], oMalha);
        c.linha([-meia, y, t], [meia, y, t], oMalha);
      }
    }
    return cantos;
  }

  // Espalha o revelar ao longo de um caminho: a linha "se desenha".
  /**
   * Plataforma completa de um nível — a peça que dá a leitura de
   * "camadas empilhadas" da referência. Não é só um contorno: é um
   * plano com borda acesa, espessura, malha técnica e anéis
   * concêntricos internos.
   *
   * @param meia   meia-largura do quadrado
   * @param cor    cor da borda e dos anéis
   * @param t      instante de revelação (segundos)
   * @param q      perfil de qualidade (usa q.anelSegs e q.nivel)
   * @param op     { camada, forca, aneis, malha }
   */
  function plataformaRica(c, y, meia, cor, t, q, op) {
    op = op || {};
    var camada = op.camada || 0;
    var forca = op.forca == null ? 1 : op.forca;
    var nAneis = op.aneis == null ? 3 : op.aneis;
    var malha = op.malha == null ? (q.nivel === 'LOW' ? 3 : 6) : op.malha;
    var segs = Math.max(20, Math.round((q.anelSegs || 40) * 0.72));

    // 1 · borda superior — o traço mais forte do nível
    var cantos = plataforma(c, y, meia, {
      cor: cor, alpha: 0.72 * forca, camada: camada,
      revelar: t, largura: 2.3, desenhar: 0.34
    }, malha);

    // 2 · espessura: uma segunda borda logo abaixo, ligada por montantes
    //     nos cantos. É o que separa "plano" de "laje" em perspectiva.
    var yb = y - 0.055;
    var baixos = [
      [-meia, yb, -meia], [meia, yb, -meia], [meia, yb, meia], [-meia, yb, meia]
    ];
    c.caminho(baixos, {
      cor: cor, alpha: 0.26 * forca, camada: camada,
      revelar: t + 0.1, largura: 1.1, desenhar: 0.3
    }, true);
    for (var k = 0; k < 4; k++) {
      c.linha(cantos[k], baixos[k], {
        cor: cor, alpha: 0.34 * forca, camada: camada,
        revelar: t + 0.14, largura: 1.2
      });
      c.no(cantos[k], {
        cor: COR.branco, alpha: 0.95 * forca, camada: camada,
        revelar: t + 0.2, tamanho: 3.8, fase: k * 0.22
      });
    }

    // 3 · anéis concêntricos: a assinatura gráfica de cada plataforma
    for (var a = 0; a < nAneis; a++) {
      var f = (a + 1) / (nAneis + 0.35);
      anel(c, y + 0.004, meia * f * 0.94, segs, {
        cor: a === nAneis - 1 ? COR.branco : cor,
        alpha: (a === nAneis - 1 ? 0.30 : 0.20 + a * 0.06) * forca,
        camada: camada,
        revelar: t + 0.16 + a * 0.07,
        largura: a === 0 ? 1.5 : 1.0,
        desenhar: 0.26
      });
    }

    // 4 · marcas de eixo nas quatro faces — régua, não enfeite
    var marca = meia * 0.14;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d, i) {
      c.linha(
        [d[0] * meia, y + 0.002, d[1] * meia],
        [d[0] * (meia - marca), y + 0.002, d[1] * (meia - marca)],
        { cor: COR.branco, alpha: 0.38 * forca, camada: camada, revelar: t + 0.26 + i * 0.03, largura: 1.4 }
      );
    });

    return cantos;
  }

  /**
   * Flare de estrela no ponto em que o feixe cruza um nível.
   * Quatro pontas retas (duas longas no eixo do feixe, duas curtas
   * na horizontal) mais um núcleo branco. É o elemento de luz mais
   * característico da referência.
   *
   * As pontas vivem no plano XY do mundo; com a câmera quase frontal
   * elas leem como flare de lente sem precisar de billboard no renderer.
   */
  /**
   * Flare de lente no ponto em que o feixe atravessa uma laje.
   *
   * A estrela NÃO é desenhada com geometria: o sprite da camada 11 tem
   * termo angular no fragment shader (gl_PointCoord é espaço de tela),
   * então as pontas ficam alinhadas à tela como numa lente de verdade.
   * As linhas só acrescentam os braços longos — e precisam sair SEMPRE
   * do centro para a ponta, porque o shader afina ao longo de aCanto.x.
   */
  function flare(c, y, raio, cor, t, nucleo, forca) {
    forca = forca == null ? 1 : forca;
    var o = [0, y, 0];

    // braços: horizontais mais longos, verticais mais curtos (o feixe
    // vertical já ocupa esse eixo e duplicar engrossa demais)
    [[1, 0, 3.0], [-1, 0, 3.0], [0, 1, 2.2], [0, -1, 2.2]].forEach(function (d) {
      var comp = d[1] === 0 ? raio : raio * 0.62;
      c.linha(o, [d[0] * comp, y + d[1] * comp, 0], {
        cor: cor, alpha: 0.62 * forca, camada: CAMADA.FLARE, revelar: t, largura: d[2]
      });
    });
    // diagonais curtas: tiram o aspecto de cruz perfeita
    [[0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]].forEach(function (d) {
      c.linha(o, [d[0] * raio * 0.34, y + d[1] * raio * 0.34, 0], {
        cor: cor, alpha: 0.30 * forca, camada: CAMADA.FLARE, revelar: t + 0.04, largura: 1.6
      });
    });

    // núcleo (a estrela em si) + halo na cor da camada
    c.ponto(o, { cor: COR.branco, alpha: 0.95 * forca, camada: CAMADA.FLARE, revelar: t, tamanho: nucleo });
    c.ponto(o, { cor: cor, alpha: 0.34 * forca, camada: CAMADA.FLARE, revelar: t + 0.06, tamanho: nucleo * 1.9 });
  }

  /**
   * Cinco flares idênticos empilhados no mesmo X viram colar de
   * estrelinhas — a assinatura visual mais barata que existe, e ainda
   * por cima no elemento mais brilhante da tela. Aqui só dois pontos
   * ganham estrela de lente, e com forças bem diferentes: a FUNDAÇÃO
   * (onde o feixe encontra a cidade) e a ESTRATÉGIA (a laje verde, o
   * ponto de virada da narrativa). Os outros dois níveis recebem nó
   * simples — luz, sem espetáculo.
   */
  function flares(c, q) {
    flare(c, Y.FUNDACAO, 0.72, COR.cyan, T.FUNDACAO + 0.28, 15, 1.0);
    if (q.nivel !== 'LOW') {
      flare(c, Y.ESTRATEGIA, 0.42, COR.esmeralda, T.ESTRATEGIA + 0.28, 9, 0.42);
    }
    [
      { y: Y.METODO,    t: T.METODO + 0.28,    cor: COR.teal },
      { y: Y.APLICACAO, t: T.APLICACAO + 0.28, cor: COR.cyan }
    ].forEach(function (n) {
      c.no([0, n.y, 0], {
        cor: COR.branco, alpha: 0.55, camada: CAMADA.BASE,
        revelar: n.t, tamanho: 2.8, velocidade: 0.13
      });
      c.no([0, n.y, 0], {
        cor: n.cor, alpha: 0.22, camada: CAMADA.BASE,
        revelar: n.t + 0.06, tamanho: 5.0, velocidade: 0.1
      });
    });
  }

  function escalonar(o, i, total) {
    if (!o.desenhar) return o;
    var copia = {};
    for (var k in o) copia[k] = o[k];
    copia.revelar = o.revelar + (i / Math.max(1, total - 1)) * o.desenhar;
    return copia;
  }

  function mistura(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function noAnel(raio, ang, y, inclinacao) {
    var x = Math.cos(ang) * raio;
    var z = Math.sin(ang) * raio;
    var dy = inclinacao ? Math.sin(ang) * raio * inclinacao : 0;
    return [x, y + dy, z];
  }

  function anel(c, y, raio, segs, o) {
    var pontos = [];
    for (var i = 0; i < segs; i++) pontos.push(noAnel(raio, (i / segs) * TAU, y, o.inclinacao));
    c.caminho(pontos, o, true);
  }

  function arco(c, y, raio, a0, a1, segs, o) {
    var pontos = [];
    for (var i = 0; i <= segs; i++) pontos.push(noAnel(raio, a0 + (a1 - a0) * (i / segs), y, o.inclinacao));
    c.caminho(pontos, o, false);
  }

  // ---------- feixe central de energia ----------
  /**
   * A coluna que atravessa a instalação inteira. Não é uma linha:
   * é um empilhamento de traços concêntricos de largura decrescente
   * — halo largo e quase transparente por fora, núcleo branco fino
   * no centro. Essa gradação é o que lê como luz volumétrica em vez
   * de "risco branco na tela".
   *
   * A energia que sobe são pontos com `delta`: o shader percorre o
   * vetor conforme fase e velocidade, então cada partícula viaja o
   * feixe inteiro sem custo de CPU por frame.
   */
  function feixe(c, q) {
    var y0 = Y.BASE + 0.02;
    var topo = 3.66;

    // 1 · gradação do halo até o núcleo. Quanto mais estreita a camada,
    //     mais baixo ela termina: o feixe se dissolve de dentro para
    //     fora em vez de ser cortado pela borda do quadro. Coluna de luz
    //     terminando em aresta reta denuncia render que não coube.
    var camadasFeixe = [
      { larg: 96, alpha: 0.016, cor: COR.cyan,      alt: topo },
      { larg: 54, alpha: 0.026, cor: COR.cyan,      alt: topo - 0.07 },
      { larg: 27, alpha: 0.040, cor: COR.teal,      alt: topo - 0.15 },
      { larg: 12, alpha: 0.075, cor: COR.teal,      alt: topo - 0.24 }
    ];
    if (q.nivel === 'LOW') camadasFeixe = [camadasFeixe[1], camadasFeixe[3]];
    camadasFeixe.forEach(function (f) {
      c.linha([0, y0, 0], [0, f.alt, 0], {
        cor: f.cor, alpha: f.alpha, camada: CAMADA.BASE,
        revelar: T.PULSO, largura: f.larg
      });
    });

    // Núcleo em trechos: entre MÉTODO e ESTRATÉGIA o traço branco
    // enfraquece, senão ele corta o rinoceronte ao meio — e o
    // rinoceronte é o assunto da cena, não o feixe.
    var trechos = [
      { a: y0, b: Y.METODO + 0.10, f: 1 },
      { a: Y.METODO + 0.10, b: Y.ESTRATEGIA - 0.10, f: 0.16 },
      { a: Y.ESTRATEGIA - 0.10, b: Y.APLICACAO + 0.18, f: 1 },
      // três degraus de dissipação no alto
      { a: Y.APLICACAO + 0.18, b: Y.APLICACAO + 0.30, f: 0.62 },
      { a: Y.APLICACAO + 0.30, b: Y.APLICACAO + 0.40, f: 0.30 },
      { a: Y.APLICACAO + 0.40, b: Y.APLICACAO + 0.48, f: 0.12 }
    ];
    trechos.forEach(function (tr) {
      c.linha([0, tr.a, 0], [0, tr.b, 0], {
        cor: COR.branco, alpha: 0.26 * tr.f, camada: CAMADA.BASE,
        revelar: T.PULSO, largura: 5.0
      });
      c.linha([0, tr.a, 0], [0, tr.b, 0], {
        cor: COR.branco, alpha: 0.58 * tr.f, camada: CAMADA.BASE,
        revelar: T.PULSO, largura: 2.0
      });
    });

    // 2 · o feixe engrossa onde atravessa cada laje — energia
    //     encontrando massa. Só o alargamento: o ponto de luz da
    //     interseção é responsabilidade de flares(), que distribui as
    //     intensidades. Marcar aqui também produzia quatro estrelas
    //     idênticas empilhadas, e luz repetida deixa de ser evento.
    [Y.FUNDACAO, Y.METODO, Y.ESTRATEGIA, Y.APLICACAO].forEach(function (yn, i) {
      c.linha([0, yn - 0.16, 0], [0, yn + 0.16, 0], {
        cor: i === 2 ? COR.esmeralda : COR.teal, alpha: 0.10,
        camada: CAMADA.BASE, revelar: T.PULSO + 0.12, largura: 34
      });
    });

    // 3 · energia ascendente
    var subindo = q.nivel === 'LOW' ? 10 : (q.nivel === 'MEDIUM' ? 24 : 46);
    for (var i = 0; i < subindo; i++) {
      var desvio = (i % 2 === 0 ? 1 : -1) * (0.004 + (i % 5) * 0.006);
      c.ponto([desvio, y0, desvio * 0.6], {
        delta: [0, topo - y0 - 0.1, 0],
        cor: i % 7 === 0 ? COR.esmeralda : (i % 3 === 0 ? COR.branco : COR.teal),
        alpha: 0.55 + (i % 4) * 0.10,
        camada: CAMADA.BASE,
        revelar: T.PULSO + 0.2 + (i / subindo) * 0.5,
        tamanho: 1.6 + (i % 5) * 0.7,
        fase: i / subindo,
        velocidade: 0.055 + (i % 6) * 0.011
      });
    }
  }

  // ---------- base institucional ----------

  function base(c, q) {
    var oAnel = { cor: COR.cyan, alpha: 0.30, camada: CAMADA.BASE, revelar: T.BASE, largura: 1.0, desenhar: 0.45 };
    anel(c, Y.BASE, 1.40, q.anelSegs, { cor: COR.cyan, alpha: 0.16, camada: CAMADA.BASE, revelar: T.BASE, largura: 0.9, desenhar: 0.5 });
    anel(c, Y.BASE, 1.24, q.anelSegs, oAnel);
    anel(c, Y.BASE, 0.96, Math.max(18, q.anelSegs - 8), { cor: COR.teal, alpha: 0.20, camada: CAMADA.BASE, revelar: T.BASE + 0.1, largura: 0.85, desenhar: 0.4 });

    // Régua radial: leitura de planta baixa, não de enfeite.
    var marcas = q.nivel === 'LOW' ? 16 : 32;
    for (var i = 0; i < marcas; i++) {
      var ang = (i / marcas) * TAU;
      var cardeal = i % (marcas / 4) === 0;
      var r0 = cardeal ? 1.14 : 1.27;
      c.linha(noAnel(r0, ang, Y.BASE), noAnel(1.40, ang, Y.BASE), {
        cor: cardeal ? COR.teal : COR.cyan,
        alpha: cardeal ? 0.34 : 0.13,
        camada: CAMADA.BASE,
        revelar: T.BASE + 0.05 + (i / marcas) * 0.35,
        largura: cardeal ? 1.0 : 0.8
      });
    }

    // Núcleo: octaedro mínimo. É o ponto de origem de tudo.
    var n = 0.115, yc = Y.NUCLEO;
    var topo = [0, yc + n, 0], baixo = [0, yc - n, 0];
    var eq = [[n, yc, 0], [0, yc, n], [-n, yc, 0], [0, yc, -n]];
    for (var k = 0; k < 4; k++) {
      var a = eq[k], b = eq[(k + 1) % 4];
      var o = { cor: COR.esmeralda, alpha: 0.62, camada: CAMADA.BASE, revelar: T.NUCLEO, largura: 1.1 };
      c.linha(a, b, o);
      c.linha(a, topo, o);
      c.linha(a, baixo, o);
    }
    c.no([0, yc, 0], { cor: COR.branco, alpha: 1.0, camada: CAMADA.BASE, revelar: T.NUCLEO, tamanho: 6.2, velocidade: 0.14 });
    c.no([0, yc, 0], { cor: COR.esmeralda, alpha: 0.7, camada: CAMADA.BASE, revelar: T.NUCLEO, tamanho: 9.5, velocidade: 0.1 });

    // Cone de luz: do núcleo sobem raios até o perímetro da Fundação.
    // É a origem da construção — tudo que existe acima nasce daqui.
    var raios = q.nivel === 'LOW' ? 12 : 20;
    for (var rr = 0; rr < raios; rr++) {
      var angR = (rr / raios) * TAU + 0.08;
      var forte = rr % 5 === 0;
      c.linha([0, Y.NUCLEO, 0], noAnel(1.18, angR, Y.FUNDACAO - 0.03), {
        cor: forte ? COR.teal : COR.cyan,
        alpha: forte ? 0.20 : 0.085,
        camada: CAMADA.BASE,
        revelar: T.PULSO + (rr / raios) * 0.30,
        largura: forte ? 1.0 : 0.75
      });
    }

    // Ondas concêntricas no chão: o pulso que se propaga da origem.
    // As duas de fora já são terreno distante — grafite, para o chão
    // recuar em vez de competir com a cidade.
    for (var oi = 0; oi < 4; oi++) {
      anel(c, Y.BASE - 0.005, 0.42 + oi * 0.46, Math.max(20, q.anelSegs - oi * 4), {
        cor: oi >= 2 ? COR.grafite : COR.cyan,
        alpha: (oi >= 2 ? 0.20 : 0.16) - oi * 0.026,
        camada: CAMADA.BASE,
        revelar: T.BASE + oi * 0.14,
        largura: 0.8
      });
    }

    feixe(c, q);

    // Anéis de órbita: emolduram o conjunto e giram em outro ritmo.
    if (q.nivel !== 'LOW') {
      anel(c, 1.42, 2.02, q.anelSegs + 8, { cor: COR.grafite, alpha: 0.13, camada: CAMADA.ORBITA, revelar: T.CONEXAO, largura: 0.85, inclinacao: 0.22 });
      anel(c, 1.72, 2.28, q.anelSegs + 8, { cor: COR.grafite, alpha: 0.10, camada: CAMADA.ORBITA, revelar: T.CONEXAO + 0.15, largura: 0.85, inclinacao: -0.16 });
      // Anéis de solo bem abertos: dão extensão lateral ao terreno e
      // impedem que a cidade termine no nada.
      anel(c, Y.BASE - 0.01, 1.78, q.anelSegs, { cor: COR.grafite, alpha: 0.11, camada: CAMADA.BASE, revelar: T.BASE + 0.5, largura: 0.75 });
      anel(c, Y.BASE - 0.015, 2.24, q.anelSegs, { cor: COR.grafite, alpha: 0.075, camada: CAMADA.BASE, revelar: T.BASE + 0.62, largura: 0.7 });
    }
  }

  // ---------- 01 · FUNDAÇÃO — sólida, ortogonal, horizontal ----------

  function fundacao(c, q) {
    var y = Y.FUNDACAO;
    var r = R.FUNDACAO * 0.92;
    var o = { cor: COR.cyan, alpha: 0.42, camada: CAMADA.FUNDACAO, revelar: T.FUNDACAO, largura: 1.25, desenhar: 0.35 };

    // Plataforma quadrada com malha: o alicerce é ortogonal.
    plataformaRica(c, y, R.FUNDACAO, COR.cyan, T.FUNDACAO, q, {
      camada: CAMADA.FUNDACAO, forca: 1.05, aneis: 4
    });

    anel(c, y, r, q.anelSegs, { cor: COR.cyan, alpha: 0.22, camada: CAMADA.FUNDACAO, revelar: T.FUNDACAO + 0.1, largura: 0.9, desenhar: 0.3 });

    // Montantes curtos: a fundação tem espessura, não é um disco.
    for (var k = 0; k < 8; k++) {
      var ang = (k / 8) * TAU;
      var p = noAnel(r, ang, y);
      c.linha([p[0], y - 0.07, p[2]], [p[0], y + 0.05, p[2]], {
        cor: COR.teal, alpha: 0.26, camada: CAMADA.FUNDACAO, revelar: T.FUNDACAO + 0.25, largura: 0.9
      });
      c.ponto(p, { cor: COR.cyan, alpha: 0.8, camada: CAMADA.FUNDACAO, revelar: T.FUNDACAO + 0.28, tamanho: 2.4, fase: k * 0.13, velocidade: 0.1 });
    }
    return o;
  }

  // ---------- 01b · FUNDAÇÃO — o terreno construído ----------
  // Torres wireframe abaixo da plataforma: a fundação não é um plano
  // abstrato, é chão edificado. Prismas de alturas distintas, mais
  // densos no miolo, lidos como skyline técnico em perspectiva.
  function skyline(c, q) {
    var yBase = Y.BASE + 0.02;
    var teto = Y.FUNDACAO - 0.10;
    var torres = q.nivel === 'LOW' ? 18 : (q.nivel === 'MEDIUM' ? 38 : 72);
    var comJanelas = q.nivel !== 'LOW';

    for (var i = 0; i < torres; i++) {
      // Distribuição em espiral áurea: preenche sem alinhar em grade
      // óbvia e sem os aglomerados que o aleatório puro produz.
      var t = (i + 0.5) / torres;
      var ang = i * 2.399963;
      var raio = 0.24 + Math.sqrt(t) * 1.20;
      var cx = Math.cos(ang) * raio;
      var cz = Math.sin(ang) * raio;

      // Torres do centro são mais altas: a silhueta cresce para o núcleo.
      var queda = 1 - Math.min(1, raio / 1.45);
      var alt = (0.20 + queda * 0.62) * (0.55 + ((i * 37) % 11) / 11 * 0.82);
      var meia = 0.026 + ((i * 53) % 7) / 7 * 0.030;
      var topo = yBase + alt;
      if (topo > teto) topo = teto;

      // Três tipologias. Uma cidade em que todo prédio é a mesma caixa
      // lê como textura; variar o coroamento é o que dá silhueta.
      var tipo = (i * 7) % 3;      // 0 laje · 1 recuo · 2 antena
      var revelar = T.FUNDACAO + 0.05 + t * 0.30;
      // Três registros por distância do centro: o miolo é ciano/teal e
      // carrega a leitura; a periferia vai a grafite e some. É essa
      // queda de croma, e não só de alpha, que faz a cidade ter fundo.
      var periferia = queda < 0.34;
      var cor = periferia ? COR.grafite : ((i % 4 === 0) ? COR.teal : COR.cyan);
      var alpha = periferia ? 0.30 + queda * 0.30 : 0.30 + queda * 0.46;

      var quina = [
        [cx - meia, cz - meia], [cx + meia, cz - meia],
        [cx + meia, cz + meia], [cx - meia, cz + meia]
      ];

      function coroa(yv, m, op, w) {
        c.caminho([
          [cx - m, yv, cz - m], [cx + m, yv, cz - m],
          [cx + m, yv, cz + m], [cx - m, yv, cz + m]
        ], {
          cor: cor, alpha: op, camada: CAMADA.FUNDACAO,
          revelar: revelar + 0.06, largura: w || 1.0
        }, true);
      }

      // montantes verticais
      for (var k = 0; k < 4; k++) {
        c.linha([quina[k][0], yBase, quina[k][1]], [quina[k][0], topo, quina[k][1]], {
          cor: cor, alpha: alpha, camada: CAMADA.FUNDACAO,
          revelar: revelar, largura: 0.95, desenhar: 0.26
        });
      }
      coroa(topo, meia, alpha * 1.3, 1.05);

      // laje intermediária nas torres altas — dá escala ao conjunto
      if (alt > 0.22) {
        for (var lj = 1; lj <= 2; lj++) {
          var meioY = yBase + alt * (lj / 3);
          c.caminho([
            [quina[0][0], meioY, quina[0][1]], [quina[1][0], meioY, quina[1][1]],
            [quina[2][0], meioY, quina[2][1]], [quina[3][0], meioY, quina[3][1]]
          ], {
            cor: cor, alpha: alpha * 0.5, camada: CAMADA.FUNDACAO,
            revelar: revelar + 0.08 + lj * 0.03, largura: 0.7
          }, true);
        }
      }

      // coroamento por tipologia
      var yLuz = topo;
      if (tipo === 1 && topo + 0.09 < teto) {
        // recuo: um volume menor sobe a partir do topo
        var m2 = meia * 0.56, y2 = Math.min(teto, topo + 0.10 + queda * 0.10);
        for (var r1 = 0; r1 < 4; r1++) {
          var qx = cx + (r1 === 1 || r1 === 2 ? m2 : -m2);
          var qz = cz + (r1 >= 2 ? m2 : -m2);
          c.linha([qx, topo, qz], [qx, y2, qz], {
            cor: cor, alpha: alpha * 0.8, camada: CAMADA.FUNDACAO,
            revelar: revelar + 0.1, largura: 0.85
          });
        }
        coroa(y2, m2, alpha * 1.1, 0.9);
        yLuz = y2;
      } else if (tipo === 2 && topo + 0.06 < teto) {
        // antena: mastro fino, o acento vertical da silhueta
        var yA = Math.min(teto + 0.05, topo + 0.09 + queda * 0.12);
        c.linha([cx, topo, cz], [cx, yA, cz], {
          cor: cor, alpha: alpha * 0.7, camada: CAMADA.FUNDACAO,
          revelar: revelar + 0.1, largura: 0.7
        });
        yLuz = yA;
      }

      // Janelas: pontinhos nas duas faces voltadas para a câmera. É o
      // que faz a cidade parecer habitada em vez de maquete de arame.
      if (comJanelas && alt > 0.18) {
        var linhas = Math.min(5, Math.max(2, Math.round(alt * 7)));
        for (var fy = 0; fy < linhas; fy++) {
          var jy = yBase + alt * (0.18 + (fy / linhas) * 0.70);
          for (var fx = 0; fx < 2; fx++) {
            var u = (fx === 0 ? -1 : 1) * meia * 0.46;
            // face frontal (+z) e face lateral (+x), as duas visíveis
            var aceso = ((i * 13 + fy * 5 + fx * 3) % 7) > 1;
            if (!aceso) continue;
            c.ponto([cx + u, jy, cz + meia], {
              cor: ((i + fy) % 9 === 0) ? COR.esmeralda : COR.cyan,
              alpha: 0.22 + queda * 0.30, camada: CAMADA.FUNDACAO,
              revelar: revelar + 0.16 + fy * 0.02, tamanho: 1.5,
              fase: (i * 0.17 + fy * 0.29) % 1, velocidade: 0.05
            });
            if (q.nivel === 'HIGH') {
              c.ponto([cx + meia, jy, cz + u], {
                cor: COR.cyan, alpha: 0.16 + queda * 0.22, camada: CAMADA.FUNDACAO,
                revelar: revelar + 0.18 + fy * 0.02, tamanho: 1.3,
                fase: (i * 0.31 + fy * 0.13) % 1, velocidade: 0.045
              });
            }
          }
        }
      }

      // luz de sinalização no ponto mais alto
      c.ponto([cx, yLuz, cz], {
        cor: (i % 4 === 0) ? COR.esmeralda : COR.branco,
        alpha: 0.55 + queda * 0.35, camada: CAMADA.FUNDACAO,
        revelar: revelar + 0.12, tamanho: tipo === 2 ? 2.6 : 2.2,
        fase: i * 0.31, velocidade: 0.09
      });
    }
  }

  // ---------- 02 · MÉTODO — rede organizada por regra ----------

  function metodo(c, q) {
    var y = Y.METODO;
    var r = R.METODO * 0.69;
    var n = q.nivel === 'LOW' ? 8 : 12;
    var nos = [];
    for (var i = 0; i < n; i++) {
      // Alternância de altura: é ela que transforma um disco achatado
      // numa rede legível neste ângulo de câmera.
      var dy = (i % 2 === 0) ? 0.11 : -0.09;
      nos.push(noAnel(r, (i / n) * TAU, y + dy));
    }

    anel(c, y, r, q.anelSegs, { cor: COR.cyan, alpha: 0.20, camada: CAMADA.METODO, revelar: T.METODO, largura: 0.9, desenhar: 0.35 });
    plataformaRica(c, y, R.METODO, COR.teal, T.METODO + 0.04, q, {
      camada: CAMADA.METODO, forca: 1, aneis: 3
    });
    anel(c, y, 0.30, 14, { cor: COR.teal, alpha: 0.22, camada: CAMADA.METODO, revelar: T.METODO + 0.16, largura: 0.85 });

    // Cordas com passo fixo — o desenho revela um método, não um acaso.
    var passos = n >= 12 ? [3, 5] : [2, 3];
    passos.forEach(function (passo, pi) {
      for (var i = 0; i < n; i++) {
        c.linha(nos[i], nos[(i + passo) % n], {
          cor: pi ? COR.teal : COR.cyan,
          alpha: pi ? 0.20 : 0.32,
          camada: CAMADA.METODO,
          revelar: T.METODO + 0.1 + (i / n) * 0.28 + pi * 0.1,
          largura: pi ? 0.85 : 1.0
        });
      }
    });

    // Raios do centro: a organização parte de um eixo.
    for (var k = 0; k < n; k += 2) {
      c.linha([0, y, 0], nos[k], { cor: COR.cyan, alpha: 0.15, camada: CAMADA.METODO, revelar: T.METODO + 0.3, largura: 0.8 });
    }
    for (var j = 0; j < n; j++) {
      c.ponto(nos[j], { cor: j % 3 === 0 ? COR.teal : COR.cyan, alpha: 0.8, camada: CAMADA.METODO, revelar: T.METODO + 0.2 + j * 0.02, tamanho: 2.4, fase: j * 0.19, velocidade: 0.12 });
    }
    return nos;
  }

  // ---------- 03 · ESTRATÉGIA — relações, rotas, complexidade ----------

  function estrategia(c, q) {
    var y = Y.ESTRATEGIA;
    var rExt = R.ESTRATEGIA * 0.88, rInt = R.ESTRATEGIA * 0.62;
    var n = q.nivel === 'LOW' ? 7 : 11;

    anel(c, y + 0.05, rExt, q.anelSegs, { cor: COR.cyan, alpha: 0.26, camada: CAMADA.ESTRATEGIA, revelar: T.ESTRATEGIA, largura: 1.1, inclinacao: 0.10, desenhar: 0.4 });
    anel(c, y - 0.05, rInt, q.anelSegs - 6, { cor: COR.teal, alpha: 0.18, camada: CAMADA.ESTRATEGIA, revelar: T.ESTRATEGIA + 0.12, largura: 0.9, inclinacao: -0.14, desenhar: 0.35 });

    // Único nível verde da torre: é o que separa "decidir" de "executar"
    // na leitura de cima a baixo.
    plataformaRica(c, y, 1.10, COR.esmeralda, T.ESTRATEGIA + 0.03, q, {
      camada: CAMADA.ESTRATEGIA, forca: 0.96, aneis: 3
    });

    var ext = [], int_ = [];
    for (var i = 0; i < n; i++) {
      ext.push(noAnel(rExt, (i / n) * TAU, y + 0.05, 0.10));
      int_.push(noAnel(rInt, ((i + 0.5) / n) * TAU, y - 0.05, -0.14));
    }

    // Rotas: nunca ligam vizinhos. Toda decisão estratégica atravessa
    // o centro do problema — por isso a curva sobe no meio do caminho.
    var rotas = q.nivel === 'LOW' ? 5 : 9;
    for (var k = 0; k < rotas; k++) {
      var a = ext[k % n];
      var b = int_[(k * 3 + 2) % n];
      var meio = [(a[0] + b[0]) * 0.5 * 1.16, (a[1] + b[1]) * 0.5 + 0.17, (a[2] + b[2]) * 0.5 * 1.16];
      c.caminho([a, meio, b], {
        cor: k % 3 === 0 ? COR.teal : COR.cyan,
        alpha: 0.18,
        camada: CAMADA.ESTRATEGIA,
        revelar: T.ESTRATEGIA + 0.16 + k * 0.045,
        largura: 1.0,
        desenhar: 0.16
      });
    }

    for (var j = 0; j < n; j++) {
      c.ponto(ext[j], { cor: COR.cyan, alpha: 0.82, camada: CAMADA.ESTRATEGIA, revelar: T.ESTRATEGIA + 0.22, tamanho: 2.5, fase: j * 0.21, velocidade: 0.13 });
      c.ponto(int_[j], { cor: COR.teal, alpha: 0.62, camada: CAMADA.ESTRATEGIA, revelar: T.ESTRATEGIA + 0.28, tamanho: 2.0, fase: j * 0.31, velocidade: 0.11 });
    }
    return ext;
  }

  // ---------- 04 · APLICAÇÃO — aberta, expansiva, verde ----------

  function aplicacao(c, q) {
    var y = Y.APLICACAO;
    var n = q.nivel === 'LOW' ? 5 : 7;

    // Arcos abertos: a estrutura deixa de se fechar sobre si mesma.
    for (var s = 0; s < 3; s++) {
      var a0 = (s / 3) * TAU + 0.22;
      arco(c, y, R.APLICACAO * 0.86, a0, a0 + TAU / 3 - 0.44, 10, {
        cor: s === 1 ? COR.esmeralda : COR.teal,
        alpha: s === 1 ? 0.36 : 0.27,
        camada: CAMADA.APLICACAO,
        revelar: T.APLICACAO + s * 0.08,
        largura: 1.0,
        inclinacao: 0.06,
        desenhar: 0.22
      });
    }

    // Vetores de saída: o conhecimento sai da torre e vira resultado.
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * TAU + 0.3;
      var dentro = noAnel(0.28, ang, y - 0.06);
      var fora = noAnel(R.APLICACAO * 0.94, ang, y + 0.14);
      var verde = i % 2 === 0;
      c.caminho([dentro, noAnel(R.APLICACAO * 0.62, ang, y + 0.05), fora], {
        cor: verde ? COR.esmeralda : COR.cyan,
        alpha: verde ? 0.46 : 0.24,
        camada: CAMADA.APLICACAO,
        revelar: T.APLICACAO + 0.12 + i * 0.05,
        largura: 1.1,
        desenhar: 0.18
      });
      // Marca terminal: ponta de vetor, não seta desenhada.
      var perp = [-Math.sin(ang) * 0.10, 0, Math.cos(ang) * 0.10];
      c.linha([fora[0] - perp[0], fora[1], fora[2] - perp[2]], [fora[0] + perp[0], fora[1], fora[2] + perp[2]], {
        cor: verde ? COR.esmeralda : COR.teal, alpha: 0.52, camada: CAMADA.APLICACAO, revelar: T.APLICACAO + 0.3 + i * 0.05, largura: 1.1
      });
      c.ponto(fora, {
        cor: verde ? COR.esmeralda : COR.cyan,
        alpha: verde ? 0.95 : 0.7,
        camada: CAMADA.APLICACAO,
        revelar: T.APLICACAO + 0.32 + i * 0.05,
        tamanho: verde ? 3.2 : 2.4,
        fase: i * 0.27,
        velocidade: 0.16
      });
    }
    anel(c, y - 0.06, 0.28, 12, { cor: COR.esmeralda, alpha: 0.20, camada: CAMADA.APLICACAO, revelar: T.APLICACAO + 0.1, largura: 0.9 });
    plataformaRica(c, y, R.APLICACAO, COR.cyan, T.APLICACAO + 0.02, q, {
      camada: CAMADA.APLICACAO, forca: 1, aneis: 3
    });
  }

  // ---------- conexões verticais + pulsos de dado ----------

  function conexoes(c, q) {
    var colunas = q.nivel === 'LOW' ? 3 : 4;
    var alturas = [Y.FUNDACAO, Y.METODO, Y.ESTRATEGIA, Y.APLICACAO];
    // O montante acompanha o afunilamento das lajes — se ficasse num
    // raio fixo, ele sairia de dentro da laje de baixo e chegaria fora
    // da de cima, desmentindo a perspectiva que o cônico constrói.
    var raios = [R.FUNDACAO * 0.82, R.METODO * 0.90, R.ESTRATEGIA * 0.96, R.APLICACAO * 1.02];

    for (var k = 0; k < colunas; k++) {
      var ang = (k / colunas) * TAU + 0.18;
      for (var i = 0; i < alturas.length - 1; i++) {
        var a0 = noAnel(raios[i], ang, alturas[i]);
        var b0 = noAnel(raios[i + 1], ang + 0.05, alturas[i + 1]);
        // Folga nas pontas: a conexão nasce depois da camada e morre
        // antes da seguinte. Sem isso o conjunto vira um cone fechado.
        var a = mistura(a0, b0, 0.14);
        var b = mistura(a0, b0, 0.86);
        c.linha(a, b, {
          cor: i === 2 ? COR.teal : COR.cyan,
          alpha: 0.19,
          camada: CAMADA.CONEXAO,
          revelar: T.CONEXAO + i * 0.08 + k * 0.03,
          largura: 0.9
        });
        // Um pulso por trecho: o "dado" subindo pela formação.
        if (q.pulsos) {
          c.ponto(a, {
            delta: [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
            cor: i === 2 ? COR.esmeralda : COR.teal,
            alpha: 0.9,
            camada: CAMADA.CONEXAO,
            revelar: T.CONEXAO + 0.3,
            tamanho: 2.6,
            fase: (k / colunas) + i * 0.31,
            velocidade: 0.085 + i * 0.012
          });
        }
      }
    }
  }

  // ---------- poeira luminosa ----------
  // Parte fica colada na torre; parte se espalha por toda a viewport,
  // e é ela que costura os dois lados da tela — a mesma atmosfera
  // passa por trás do card de acesso.
  function poeira(c, q) {
    var perto = q.particulasPerto;
    var longe = q.particulasLonge;
    var i;
    for (i = 0; i < perto; i++) {
      var ang = Math.random() * TAU;
      var raio = 0.35 + Math.pow(Math.random(), 0.7) * 2.0;
      c.ponto([Math.cos(ang) * raio, Math.random() * 4.2 - 0.6, Math.sin(ang) * raio], {
        cor: Math.random() > 0.86 ? COR.esmeralda : (Math.random() > 0.5 ? COR.cyan : COR.teal),
        alpha: 0.14 + Math.random() * 0.34,
        camada: CAMADA.POEIRA,
        revelar: T.POEIRA + Math.random() * 0.6,
        tamanho: 1.3 + Math.random() * 2.2,
        fase: Math.random(),
        velocidade: 0.02 + Math.random() * 0.05
      });
    }
    for (i = 0; i < longe; i++) {
      var a2 = Math.random() * TAU;
      var r2 = 2.6 + Math.random() * 5.4;
      // Poeira distante em grafite e mais fraca: boa parte cai atrás do
      // card de acesso, e ponto brilhante atrás de vidro vira sujeira.
      c.ponto([Math.cos(a2) * r2, Math.random() * 4.4 - 0.6, Math.sin(a2) * r2 * 0.5 - 1.0], {
        cor: Math.random() > 0.55 ? COR.grafite : COR.cyan,
        alpha: 0.05 + Math.random() * 0.10,
        camada: CAMADA.POEIRA,
        revelar: T.POEIRA + Math.random() * 0.8,
        tamanho: 0.9 + Math.random() * 1.3,
        fase: Math.random(),
        velocidade: 0.012 + Math.random() * 0.03
      });
    }
  }

  // ---------- perfis de qualidade ----------

  var PERFIS = {
    HIGH:   { nivel: 'HIGH',   anelSegs: 56, particulasPerto: 460, particulasLonge: 300, pulsos: true,  rino: true },
    MEDIUM: { nivel: 'MEDIUM', anelSegs: 38, particulasPerto: 230, particulasLonge: 140, pulsos: true,  rino: true },
    LOW:    { nivel: 'LOW',    anelSegs: 26, particulasPerto: 90,  particulasLonge: 50,  pulsos: false, rino: true }
  };

  // ---------- 05 · DASHBOARD HOLOGRÁFICO ----------
  /**
   * O coroamento da instalação: uma bancada de leitura suspensa acima
   * da Aplicação — o nível onde o conhecimento já virou indicador.
   *
   * Os planos ficam quase paralelos à tela porque a câmera é frontal:
   * um painel girado em Y viraria um risco. A profundidade vem de z,
   * escala e alpha (três distâncias distintas), não de perspectiva
   * forçada. Cada painel tem vidro (face de alpha baixíssimo), moldura,
   * cantoneiras e conteúdo com valores fixos e proporções coerentes —
   * é um painel de indicadores, não ruído decorativo.
   *
   * `f` é o fator de distância: 1 = plano da frente, 0.6 = ao fundo.
   * Ele governa alpha e largura de traço ao mesmo tempo, que é o que
   * faz um plano recuar de verdade em vez de só ficar menor.
   */
  function hudPainel(c, C, larg, alt, tipo, cor, rev, f, q) {
    var mw = larg / 2, mh = alt / 2;
    // Cada painel gira em torno do próprio eixo vertical proporcional à
    // distância do centro: a bancada envolve o eixo como um console
    // curvo. Sem isso são retângulos frontais em espaço de tela dentro
    // de uma cena em perspectiva — adesivos, não instrumentos. O giro é
    // contido (máx. ~17°) porque painel muito de perfil vira um risco.
    var giro = -C[0] * 0.20;
    var cosg = Math.cos(giro), sing = Math.sin(giro);
    function P(u, v) { return [C[0] + u * cosg, C[1] + v, C[2] - u * sing]; }
    var A = function (v) { return v * f; };

    // vidro: dois triângulos quase invisíveis. Sem isso o painel é um
    // contorno vazio e o fundo atravessa a interface.
    c.face(P(-mw, -mh), P(mw, -mh), P(mw, mh), { cor: cor, alpha: A(0.030), camada: CAMADA.APLICACAO, revelar: rev });
    c.face(P(-mw, -mh), P(mw, mh), P(-mw, mh), { cor: cor, alpha: A(0.030), camada: CAMADA.APLICACAO, revelar: rev });

    // moldura + cantoneiras (a cantoneira é o que dá cara de instrumento)
    c.caminho([P(-mw, -mh), P(mw, -mh), P(mw, mh), P(-mw, mh)], {
      cor: cor, alpha: A(0.42), camada: CAMADA.APLICACAO, revelar: rev, largura: 1.15 * f, desenhar: 0.18
    }, true);
    var cant = Math.min(mw, mh) * 0.34;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (d, i) {
      c.linha(P(d[0] * mw, d[1] * mh), P(d[0] * (mw - cant), d[1] * mh), {
        cor: COR.branco, alpha: A(0.50), camada: CAMADA.APLICACAO, revelar: rev + 0.04, largura: 1.5 * f
      });
      c.linha(P(d[0] * mw, d[1] * mh), P(d[0] * mw, d[1] * (mh - cant)), {
        cor: COR.branco, alpha: A(0.50), camada: CAMADA.APLICACAO, revelar: rev + 0.04, largura: 1.5 * f
      });
    });

    // barra de título: uma faixa cheia e um traço de legenda
    var yT = mh - alt * 0.13;
    c.linha(P(-mw * 0.88, yT), P(-mw * 0.20, yT), {
      cor: COR.branco, alpha: A(0.42), camada: CAMADA.APLICACAO, revelar: rev + 0.05, largura: 2.0 * f
    });
    c.linha(P(mw * 0.52, yT), P(mw * 0.88, yT), {
      cor: cor, alpha: A(0.26), camada: CAMADA.APLICACAO, revelar: rev + 0.06, largura: 1.2 * f
    });
    c.linha(P(-mw * 0.92, yT - alt * 0.07), P(mw * 0.92, yT - alt * 0.07), {
      cor: cor, alpha: A(0.16), camada: CAMADA.APLICACAO, revelar: rev + 0.06, largura: 0.8 * f
    });

    var pisoY = -mh * 0.52;

    if (tipo === 'barras') {
      var v = [0.30, 0.52, 0.41, 0.68, 0.55, 0.86, 0.62, 0.94];
      for (var i = 0; i < v.length; i++) {
        var u = -mw * 0.76 + (i / (v.length - 1)) * mw * 1.52;
        var h = pisoY + v[i] * alt * 0.52;
        var destaque = i === v.length - 1 || i === 5;
        // barra: duas linhas paralelas leem como volume, uma lê como risco
        [-0.012, 0.012].forEach(function (dx, di) {
          c.linha(P(u + dx, pisoY), P(u + dx, h), {
            cor: destaque ? COR.esmeralda : cor,
            alpha: A(destaque ? 0.80 : 0.44) * (di ? 0.7 : 1),
            camada: CAMADA.APLICACAO, revelar: rev + 0.10 + i * 0.02, largura: 1.7 * f
          });
        });
        c.linha(P(u - 0.014, h), P(u + 0.014, h), {
          cor: destaque ? COR.branco : cor, alpha: A(0.7), camada: CAMADA.APLICACAO,
          revelar: rev + 0.12 + i * 0.02, largura: 1.4 * f
        });
      }
      // eixo e grade
      c.linha(P(-mw * 0.84, pisoY), P(mw * 0.84, pisoY), {
        cor: cor, alpha: A(0.34), camada: CAMADA.APLICACAO, revelar: rev + 0.08, largura: 1.0 * f
      });
      for (var g = 1; g <= 2; g++) {
        c.linha(P(-mw * 0.84, pisoY + g * alt * 0.19), P(mw * 0.84, pisoY + g * alt * 0.19), {
          cor: cor, alpha: A(0.10), camada: CAMADA.APLICACAO, revelar: rev + 0.1, largura: 0.7 * f
        });
      }

    } else if (tipo === 'serie') {
      var s = [0.18, 0.34, 0.26, 0.48, 0.42, 0.64, 0.58, 0.78, 0.92];
      var pts = [], j;
      for (j = 0; j < s.length; j++) {
        pts.push(P(-mw * 0.78 + (j / (s.length - 1)) * mw * 1.56, pisoY + s[j] * alt * 0.56));
      }
      c.caminho(pts, {
        cor: COR.esmeralda, alpha: A(0.72), camada: CAMADA.APLICACAO,
        revelar: rev + 0.10, largura: 1.7 * f, desenhar: 0.18
      });
      // área sob a curva: hachura vertical rala, dá corpo ao gráfico
      for (j = 0; j < pts.length; j += 1) {
        c.linha([pts[j][0], C[1] + pisoY, pts[j][2]], pts[j], {
          cor: COR.teal, alpha: A(0.13), camada: CAMADA.APLICACAO,
          revelar: rev + 0.14 + j * 0.01, largura: 0.9 * f
        });
      }
      c.no(pts[pts.length - 1], {
        cor: COR.branco, alpha: A(0.95), camada: CAMADA.APLICACAO,
        revelar: rev + 0.24, tamanho: 3.2, velocidade: 0.18
      });
      c.linha(P(-mw * 0.84, pisoY), P(mw * 0.84, pisoY), {
        cor: cor, alpha: A(0.30), camada: CAMADA.APLICACAO, revelar: rev + 0.08, largura: 0.9 * f
      });

    } else if (tipo === 'donut') {
      var raio = Math.min(mw, mh) * 0.60;
      var cy = -alt * 0.06;
      var segsD = q.nivel === 'HIGH' ? 30 : 20;
      // trilho completo
      for (var d0 = 0; d0 < segsD; d0++) {
        var b1 = (d0 / segsD) * TAU, b2 = ((d0 + 1) / segsD) * TAU;
        c.linha(P(Math.cos(b1) * raio, cy + Math.sin(b1) * raio), P(Math.cos(b2) * raio, cy + Math.sin(b2) * raio), {
          cor: cor, alpha: A(0.16), camada: CAMADA.APLICACAO, revelar: rev + 0.08, largura: 2.6 * f
        });
      }
      // preenchimento: 74%, começando no topo e girando no sentido horário
      var preench = Math.round(segsD * 0.74);
      for (var d1 = 0; d1 < preench; d1++) {
        var ang1 = Math.PI / 2 - (d1 / segsD) * TAU;
        var ang2 = Math.PI / 2 - ((d1 + 1) / segsD) * TAU;
        var tt = d1 / preench;
        c.linha(P(Math.cos(ang1) * raio, cy + Math.sin(ang1) * raio), P(Math.cos(ang2) * raio, cy + Math.sin(ang2) * raio), {
          cor: mistura(COR.cyan, COR.esmeralda, tt), alpha: A(0.85),
          camada: CAMADA.APLICACAO, revelar: rev + 0.10 + d1 * 0.006, largura: 3.0 * f
        });
      }
      // agulha central + leitura
      c.no(P(0, cy), { cor: COR.branco, alpha: A(0.85), camada: CAMADA.APLICACAO, revelar: rev + 0.22, tamanho: 3.0, velocidade: 0.14 });
      c.linha(P(-raio * 0.34, cy - raio * 0.52), P(raio * 0.34, cy - raio * 0.52), {
        cor: COR.branco, alpha: A(0.36), camada: CAMADA.APLICACAO, revelar: rev + 0.24, largura: 1.6 * f
      });

    } else if (tipo === 'kpi') {
      // número grande sugerido por um traço espesso + variação abaixo
      c.linha(P(-mw * 0.72, -alt * 0.04), P(mw * 0.10, -alt * 0.04), {
        cor: COR.branco, alpha: A(0.62), camada: CAMADA.APLICACAO, revelar: rev + 0.08, largura: 4.2 * f
      });
      c.linha(P(-mw * 0.72, -alt * 0.30), P(-mw * 0.16, -alt * 0.30), {
        cor: cor, alpha: A(0.30), camada: CAMADA.APLICACAO, revelar: rev + 0.12, largura: 1.4 * f
      });
      // seta de tendência
      c.caminho([P(mw * 0.34, -alt * 0.26), P(mw * 0.52, -alt * 0.04), P(mw * 0.70, -alt * 0.18)], {
        cor: COR.esmeralda, alpha: A(0.70), camada: CAMADA.APLICACAO, revelar: rev + 0.14, largura: 1.5 * f
      });
      c.ponto(P(mw * 0.70, -alt * 0.18), {
        cor: COR.esmeralda, alpha: A(0.9), camada: CAMADA.APLICACAO,
        revelar: rev + 0.2, tamanho: 2.4, velocidade: 0.15
      });
      // Série de apoio no rodapé do card. Sem ela o KPI é um retângulo
      // com dois riscos — placeholder de layout, não instrumento.
      var micro = [0.34, 0.52, 0.44, 0.68, 0.60, 0.82];
      for (var mb = 0; mb < micro.length; mb++) {
        var ux = -mw * 0.72 + (mb / (micro.length - 1)) * mw * 1.44;
        c.linha(P(ux, -alt * 0.44), P(ux, -alt * 0.44 + micro[mb] * alt * 0.20), {
          cor: mb === micro.length - 1 ? COR.esmeralda : cor,
          alpha: A(mb === micro.length - 1 ? 0.7 : 0.34),
          camada: CAMADA.APLICACAO, revelar: rev + 0.16 + mb * 0.015, largura: 1.5 * f
        });
      }
      c.linha(P(-mw * 0.80, -alt * 0.44), P(mw * 0.80, -alt * 0.44), {
        cor: cor, alpha: A(0.22), camada: CAMADA.APLICACAO, revelar: rev + 0.15, largura: 0.8 * f
      });

    } else if (tipo === 'tabela') {
      var linhasT = 4;
      for (var lt = 0; lt < linhasT; lt++) {
        var yv = mh * 0.34 - lt * (alt * 0.20);
        // três colunas de larguras diferentes: lê como registro, não como grade
        var cols = [[-0.78, -0.30], [-0.20, 0.16], [0.30, 0.62 + (lt % 2) * 0.16]];
        cols.forEach(function (col, ci) {
          c.linha(P(mw * col[0], yv), P(mw * col[1], yv), {
            cor: ci === 2 ? (lt % 2 ? COR.esmeralda : cor) : cor,
            alpha: A(ci === 0 ? 0.34 : 0.20),
            camada: CAMADA.APLICACAO, revelar: rev + 0.1 + lt * 0.03, largura: 1.3 * f
          });
        });
        if (lt < linhasT - 1) {
          c.linha(P(-mw * 0.86, yv - alt * 0.10), P(mw * 0.86, yv - alt * 0.10), {
            cor: cor, alpha: A(0.09), camada: CAMADA.APLICACAO, revelar: rev + 0.12 + lt * 0.03, largura: 0.7 * f
          });
        }
      }

    } else { // spark — série mínima, sem eixo
      var sp = [0.30, 0.55, 0.38, 0.72, 0.50, 0.88];
      var ptsS = [];
      for (var k2 = 0; k2 < sp.length; k2++) {
        ptsS.push(P(-mw * 0.80 + (k2 / (sp.length - 1)) * mw * 1.60, -alt * 0.18 + sp[k2] * alt * 0.42));
      }
      // eixo e duas guias: gráfico sem referência é decoração
      c.linha(P(-mw * 0.84, -alt * 0.30), P(mw * 0.84, -alt * 0.30), {
        cor: cor, alpha: A(0.26), camada: CAMADA.APLICACAO, revelar: rev + 0.08, largura: 0.9 * f
      });
      for (var gg = 1; gg <= 2; gg++) {
        c.linha(P(-mw * 0.84, -alt * 0.30 + gg * alt * 0.16), P(mw * 0.84, -alt * 0.30 + gg * alt * 0.16), {
          cor: cor, alpha: A(0.09), camada: CAMADA.APLICACAO, revelar: rev + 0.1, largura: 0.7 * f
        });
      }
      c.caminho(ptsS, {
        cor: cor, alpha: A(0.62), camada: CAMADA.APLICACAO,
        revelar: rev + 0.1, largura: 1.4 * f, desenhar: 0.14
      });
      c.ponto(ptsS[ptsS.length - 1], {
        cor: COR.branco, alpha: A(0.9), camada: CAMADA.APLICACAO,
        revelar: rev + 0.22, tamanho: 2.6, velocidade: 0.16
      });
    }
  }

  function dashboard(c, q) {
    if (q.nivel === 'LOW') return;             // celular: a torre já basta

    // z negativo = mais longe da câmera. Os três planos de profundidade
    // são 0.26 (frente), 0.04 (meio) e -0.20 (fundo).
    // O conjunto ocupa de Y 2.55 a 3.47 — ~13% da altura do quadro, com
    // folga até a borda superior (o topo útil é Y≈3.75). Os dois painéis
    // altos ficam sobre a laje; os laterais descem pelos flancos, fora da
    // silhueta da plataforma (meia-largura 0.86), de modo que a bancada
    // envolve o topo da torre em vez de tapá-lo.
    var placa = q.nivel === 'MEDIUM'
      ? [
          { c: [-0.62, 3.38, 0.14], w: 0.96, h: 0.34, tipo: 'barras', cor: COR.cyan, f: 1.00 },
          { c: [ 0.64, 3.38, 0.02], w: 0.88, h: 0.32, tipo: 'serie',  cor: COR.teal, f: 0.92 },
          { c: [ 1.32, 2.98, 0.24], w: 0.44, h: 0.42, tipo: 'donut',  cor: COR.cyan, f: 1.00 }
        ]
      : [
          { c: [-0.66, 3.38, 0.16], w: 1.00, h: 0.34, tipo: 'barras', cor: COR.cyan,  f: 1.00 },
          { c: [ 0.64, 3.38, 0.02], w: 0.92, h: 0.34, tipo: 'serie',  cor: COR.teal,  f: 0.94 },
          // Duas zonas livres, e só elas: a fileira acima da laje de
          // Aplicação (Y > 3.12) e a coluna do flanco direito (|x| >
          // 1.05, fora da silhueta de todas as lajes). O miolo entre
          // ESTRATÉGIA e APLICAÇÃO parece vago mas não é — qualquer
          // painel ali atravessa uma laje. E o flanco esquerdo pertence
          // aos conectores dos rótulos: painel ali cria ambiguidade
          // sobre o que a chamada está apontando.
          { c: [ 1.42, 3.06, 0.26], w: 0.46, h: 0.44, tipo: 'donut',  cor: COR.cyan,  f: 1.00 },
          { c: [ 1.46, 2.66, 0.20], w: 0.52, h: 0.24, tipo: 'kpi',    cor: COR.teal,  f: 0.98 },
          { c: [ 1.44, 2.32, -0.18], w: 0.62, h: 0.26, tipo: 'tabela', cor: COR.cyan, f: 0.76 },
          { c: [-1.30, 3.44, -0.24], w: 0.54, h: 0.18, tipo: 'spark', cor: COR.teal,  f: 0.70 }
        ];

    placa.forEach(function (p, i) {
      var rev = T.APLICACAO + 0.30 + i * 0.07;
      hudPainel(c, p.c, p.w, p.h, p.tipo, p.cor, rev, p.f, q);

      // haste: o painel pertence à plataforma, não flutua solto.
      var pe = [p.c[0], p.c[1] - p.h / 2, p.c[2]];
      var ancora = [p.c[0] * 0.68, Y.APLICACAO + 0.03, p.c[2] * 0.68];
      c.linha(pe, ancora, {
        cor: p.cor, alpha: 0.14 * p.f, camada: CAMADA.APLICACAO,
        revelar: rev + 0.06, largura: 0.8, desenhar: 0.2
      });
      c.ponto(ancora, {
        cor: p.cor, alpha: 0.7, camada: CAMADA.APLICACAO,
        revelar: rev + 0.2, tamanho: 2.2, fase: i * 0.2, velocidade: 0.12
      });
    });

    // Barramento superior: um traço horizontal fino amarra a bancada
    // e fecha a composição por cima, como o topo de um enquadramento.
    if (q.nivel === 'HIGH') {
      c.linha([-1.66, 3.58, 0.0], [1.62, 3.58, 0.0], {
        cor: COR.cyan, alpha: 0.16, camada: CAMADA.APLICACAO,
        revelar: T.APLICACAO + 0.78, largura: 1.0, desenhar: 0.3
      });
      [-1.66, -0.54, 0.56, 1.62].forEach(function (x, i) {
        c.ponto([x, 3.58, 0], {
          cor: i === 3 ? COR.esmeralda : COR.cyan, alpha: 0.6,
          camada: CAMADA.APLICACAO, revelar: T.APLICACAO + 0.84 + i * 0.03,
          tamanho: 2.4, fase: i * 0.25, velocidade: 0.1
        });
      });
    }
  }

  function construir(nivel) {
    var q = PERFIS[nivel] || PERFIS.MEDIUM;
    var c = new Coletor();

    base(c, q);
    fundacao(c, q);
    skyline(c, q);
    metodo(c, q);
    estrategia(c, q);
    aplicacao(c, q);
    dashboard(c, q);
    flares(c, q);
    conexoes(c, q);

    if (q.rino && window.DMC_Rhino) {
      window.DMC_Rhino.construir(c, {
        cor: COR.cyan,
        corFace: [0.00, 0.55, 0.72],
        corPonto: COR.branco,
        camada: CAMADA.RINO,
        camadaPonto: CAMADA.RINO_PT,
        camadaFace: CAMADA.RINO_FACE,
        revelar: T.RINO,
        // Dentro da camada Estratégia: é ali que a leitura fica difícil
        // o bastante para o rinoceronte aparecer como descoberta.
        // No meio da torre e à frente do eixo. Quase de perfil: é o
        // único ângulo em que a silhueta de rinoceronte fecha.
        // Escala travada pela geometria, não pelo gosto: o pivô fica a
        // 0.64 acima da pata e 0.42 abaixo do ponto mais alto, então o
        // bicho ocupa 1.06 × escala. Com o vão de 1.24 entre as lajes,
        // escala 0.94 deixa 0.12 de folga embaixo e 0.12 em cima — ele
        // pousa e respira sem encostar em nada.
        centro: [0.0, Y.METODO + 0.12 + 0.64 * 0.94, 0.30],
        escala: 0.94,
        // Três quartos, não perfil puro. Em perfil rigoroso as patas
        // dos dois lados se sobrepõem em registro exato e o volume
        // morre — o bicho vira recorte. Girado, o peitoral aparece e
        // os pares de pata se separam.
        giro: -0.38,
        // A sombra cai na laje de Método, logo abaixo das patas.
        sombraY: Y.METODO + 0.008,
        corSombra: COR.grafite,
        pulsos: q.nivel !== 'LOW'
      });
    }

    poeira(c, q);

    return {
      segmentos: c.seg,
      pontos: c.pt,
      faces: c.fac,
      perfil: q,
      alturas: Y,
      camadas: CAMADA,
      cronograma: T
    };
  }

  window.DMC_KnowledgeGeometry = {
    construir: construir,
    COR: COR,
    CAMADA: CAMADA,
    Y: Y,
    R: R,
    T: T
  };
})();
