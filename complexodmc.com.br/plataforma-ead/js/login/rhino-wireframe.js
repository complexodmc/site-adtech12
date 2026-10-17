/* =============================================================
   COMPLEXO DMC · LOGIN — RINOCERONTE LOW-POLY
   Malha 3D fechada, gerada por código. Nada de modelo importado.

   Como é construído:

   · O tronco nasce de SEÇÕES transversais ao longo do eixo do corpo
     (focinho → cauda). Cada seção é um octógono elíptico com centro,
     altura e largura próprios. Ligando seção a seção saem os quads
     que viram os triângulos do casco. É assim que se modela um
     animal em low-poly sem esculpir vértice a vértice: o perfil
     lateral vive na coluna `cy/ry`, a silhueta de cima vive em `rz`.

   · Pernas, chifres e orelhas são volumes separados costurados no
     tronco. Rinoceronte tem perna curta e grossa — o afunilamento
     é pequeno de propósito.

   · O WINDING de cada triângulo é corrigido na construção: se a
     normal aponta para dentro, troca-se b por c. Sem isso o culling
     comeria as faces erradas e o volume ficaria furado.

   · A ILUMINAÇÃO é assada aqui, na CPU: alpha por face conforme a
     normal contra uma luz fixa. O shader não faz conta nenhuma e o
     facetado do low-poly aparece de graça.

   Saídas: faces (volume), arestas (traço) e vértices (pontos).
   O controlador faz crossfade entre arestas e pontos.
   ============================================================= */
(function () {
  'use strict';

  var TAU = Math.PI * 2;

  // Seções do tronco: [x, centroY, raioY, raioZ]
  //
  // A silhueta inteira do animal está nesta tabela. O que faz ler como
  // rinoceronte e não como um tubo:
  //   · a cabeça é BAIXA — o focinho fica abaixo da linha da barriga;
  //   · há um mergulho na nuca antes da cernelha;
  //   · a cernelha (x≈0.10) é o ponto mais alto do dorso;
  //   · o dorso cai de leve até o quadril, que sobe outra vez;
  //   · o corpo é curto e grosso: 1,75 de comprimento para 1,06 de
  //     altura total. Bicho pesado não é comprido.
  var SECOES = [
    [0.93, -0.05, 0.078, 0.088],  // ponta do focinho (rombuda)
    [0.86, -0.04, 0.098, 0.110],  // focinho
    [0.76, 0.00, 0.130, 0.140],   // base do chifre
    [0.62, 0.04, 0.155, 0.150],   // face
    [0.46, 0.10, 0.175, 0.165],   // olhos
    [0.30, 0.14, 0.210, 0.190],   // nuca (mais fina que a cernelha)
    [0.10, 0.14, 0.300, 0.260],   // cernelha — ponto mais alto
    [-0.10, 0.10, 0.310, 0.280],  // peito
    [-0.34, 0.08, 0.300, 0.270],  // tronco médio
    [-0.56, 0.10, 0.290, 0.260],  // quadril
    [-0.70, 0.11, 0.235, 0.215],  // garupa
    [-0.80, 0.13, 0.165, 0.150],  // fim da garupa
    [-0.87, 0.15, 0.075, 0.068]   // base da cauda
  ];

  var LADOS = 8;   // facetas ao redor do tronco

  // Pernas: [x, z, raioTopo, raioPata]. Colunas, não palitos.
  var PERNAS = [
    [0.06, 0.150, 0.115, 0.118],
    [0.06, -0.150, 0.115, 0.118],
    [-0.50, 0.145, 0.120, 0.122],
    [-0.50, -0.145, 0.120, 0.122]
  ];
  var PERNA_Y = [-0.14, -0.40, -0.62];   // topo (dentro do corpo), joelho, pata

  var LUZ = (function () {
    var v = [0.42, 0.82, 0.40];
    var m = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / m, v[1] / m, v[2] / m];
  })();

  // ---------- vetores ----------
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cruz(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function ponto3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function normalizar(v) {
    var m = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / m, v[1] / m, v[2] / m];
  }
  function media(a, b, c) {
    return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  }

  /**
   * Construtor da malha. Acumula triângulos já com winding corrigido
   * e alpha iluminado; `refDentro` é um ponto interno usado para
   * decidir qual lado da face é o de fora.
   */
  function Malha() {
    this.faces = [];
    this.arestas = [];
  }

  Malha.prototype.tri = function (a, b, c, refDentro, opcoes) {
    var n = normalizar(cruz(sub(b, a), sub(c, a)));
    var centro = media(a, b, c);
    var paraFora = sub(centro, refDentro);
    if (ponto3(n, paraFora) < 0) {
      var t = b; b = c; c = t;
      n = [-n[0], -n[1], -n[2]];
    }
    // Difusa + um resto de ambiente para nenhuma face sumir de todo.
    var difusa = Math.max(0, ponto3(n, LUZ));
    var intensidade = 0.16 + 0.94 * Math.pow(difusa, 1.15);
    this.faces.push({ a: a, b: b, c: c, luz: intensidade, opc: opcoes || {} });
  };

  Malha.prototype.quad = function (a, b, c, d, refDentro, opcoes) {
    this.tri(a, b, c, refDentro, opcoes);
    this.tri(a, c, d, refDentro, opcoes);
  };

  // Contraste maior entre faces claras e escuras: é o facetado que
  // faz o olho ler "low-poly" em vez de "casca lisa".

  Malha.prototype.aresta = function (a, b, peso) {
    this.arestas.push({ a: a, b: b, peso: peso || 1 });
  };

  // ---------- geradores de volume ----------

  function anelSecao(sec) {
    var pts = [];
    for (var k = 0; k < LADOS; k++) {
      var ang = (k / LADOS) * TAU;
      pts.push([sec[0], sec[1] + Math.cos(ang) * sec[2], Math.sin(ang) * sec[3]]);
    }
    return pts;
  }

  function anelQuadrado(x, z, y, r) {
    return [
      [x - r, y, z - r], [x + r, y, z - r],
      [x + r, y, z + r], [x - r, y, z + r]
    ];
  }

  function costurar(m, anelA, anelB, centroA, centroB, pesoAresta) {
    var n = anelA.length;
    var interno = media(centroA, centroB, centroA);
    for (var k = 0; k < n; k++) {
      var k2 = (k + 1) % n;
      m.quad(anelA[k], anelA[k2], anelB[k2], anelB[k], interno);
      m.aresta(anelA[k], anelB[k], pesoAresta);              // longitudinal
      m.aresta(anelA[k], anelA[k2], pesoAresta * 0.62);      // circunferencial
      m.aresta(anelA[k], anelB[k2], pesoAresta * 0.30);      // diagonal do quad
    }
  }

  function tampar(m, anel, apice, interno, pesoAresta) {
    var n = anel.length;
    for (var k = 0; k < n; k++) {
      m.tri(anel[k], anel[(k + 1) % n], apice, interno);
      if (pesoAresta) m.aresta(anel[k], apice, pesoAresta);
    }
  }

  function construirMalha() {
    var m = new Malha();
    var i, k;

    // ---- tronco ----
    var aneis = SECOES.map(anelSecao);
    var centros = SECOES.map(function (s) { return [s[0], s[1], 0]; });
    for (i = 0; i < aneis.length - 1; i++) {
      costurar(m, aneis[i], aneis[i + 1], centros[i], centros[i + 1], i >= 4 && i <= 9 ? 1 : 0.8);
    }
    // focinho e cauda fechados
    tampar(m, aneis[0], [0.97, SECOES[0][1] + 0.01, 0], centros[0], 0.9);
    tampar(m, aneis[aneis.length - 1], [-0.91, SECOES[SECOES.length - 1][1], 0], centros[centros.length - 1], 0.7);

    // ---- pernas ----
    PERNAS.forEach(function (p) {
      var aneisPerna = PERNA_Y.map(function (y, idx) {
        var r = idx === 0 ? p[2] : (idx === 1 ? p[2] * 0.86 : p[3]);
        return anelQuadrado(p[0], p[1], y, r);
      });
      var centrosPerna = PERNA_Y.map(function (y) { return [p[0], y, p[1]]; });
      for (var j = 0; j < aneisPerna.length - 1; j++) {
        costurar(m, aneisPerna[j], aneisPerna[j + 1], centrosPerna[j], centrosPerna[j + 1], 0.85);
      }
      // sola da pata
      tampar(m, aneisPerna[2], [p[0], PERNA_Y[2] - 0.03, p[1]], centrosPerna[2], 0.7);
    });

    // ---- chifres: cone de três anéis. O chifre é o traço de
    //      identidade do bicho — espeto de uma linha não serve. ----
    function anelChifre(cx, cy, r, achatamento) {
      var pts = [];
      for (var j = 0; j < 5; j++) {
        var a = (j / 5) * TAU;
        pts.push([cx + Math.cos(a) * r * achatamento, cy, Math.sin(a) * r]);
      }
      return pts;
    }
    function chifre(estagios, peso) {
      var aneis = estagios.slice(0, estagios.length - 1).map(function (e) {
        return anelChifre(e[0], e[1], e[2], 0.85);
      });
      var centros = estagios.slice(0, estagios.length - 1).map(function (e) {
        return [e[0], e[1], 0];
      });
      for (var j = 0; j < aneis.length - 1; j++) {
        costurar(m, aneis[j], aneis[j + 1], centros[j], centros[j + 1], peso);
      }
      var ultimo = estagios[estagios.length - 1];
      tampar(m, aneis[aneis.length - 1], [ultimo[0], ultimo[1], 0], centros[centros.length - 1], peso);
      for (var k2 = 0; k2 < 5; k2++) m.aresta(aneis[0][k2], aneis[0][(k2 + 1) % 5], peso * 0.7);
    }
    // principal: nasce largo no focinho e curva para a frente
    chifre([[0.80, 0.09, 0.098], [0.855, 0.22, 0.062], [0.90, 0.32, 0.034], [0.94, 0.41]], 1.25);
    // secundário: curto e grosso, entre os olhos
    chifre([[0.60, 0.18, 0.062], [0.635, 0.26, 0.036], [0.66, 0.33]], 1.0);

    // ---- orelhas: chapa fina, os dois lados desenhados ----
    [1, -1].forEach(function (lado) {
      var raiz = [0.28, 0.28, 0.140 * lado];
      var pontaA = [0.21, 0.42, 0.180 * lado];
      var pontaB = [0.34, 0.40, 0.120 * lado];
      var interno = [0.28, 0.28, 0];
      m.tri(raiz, pontaA, pontaB, interno);
      m.tri(raiz, pontaB, pontaA, [0.28, 0.28, 0.5 * lado]);   // face oposta
      m.aresta(raiz, pontaA, 0.85);
      m.aresta(pontaA, pontaB, 0.85);
      m.aresta(pontaB, raiz, 0.85);
    });

    // ---- cauda ----
    m.aresta([-0.84, 0.16, 0], [-0.92, -0.04, 0.02], 0.8);
    m.aresta([-0.92, -0.04, 0.02], [-0.94, -0.16, 0.05], 0.8);

    // ---- linha da coluna: reforça a leitura do dorso ----
    for (i = 4; i < aneis.length - 1; i++) {
      m.aresta(aneis[i][0], aneis[i + 1][0], 1.25);
    }

    return m;
  }

  var MALHA = construirMalha();

  /**
   * Emite a malha no coletor da cena, já posicionada e escalada.
   * O pivô central deixa o bicho girar em torno do próprio eixo.
   */
  function construir(coletor, opcoes) {
    var o = opcoes || {};
    var escala = o.escala || 0.6;
    var centro = o.centro || [0, 0, 0];
    var giro = o.giro || 0;
    var cosG = Math.cos(giro), sinG = Math.sin(giro);
    var cor = o.cor || [0, 0.874, 0.961];
    var corFace = o.corFace || [0, 0.62, 0.80];
    var corPonto = o.corPonto || [0.86, 0.98, 1.0];
    var camada = o.camada == null ? 6 : o.camada;
    var camadaPt = o.camadaPonto == null ? 8 : o.camadaPonto;
    var camadaFace = o.camadaFace == null ? 10 : o.camadaFace;
    var t0 = o.revelar || 0;
    var alphaFace = o.alphaFace == null ? 0.165 : o.alphaFace;
    var alphaAresta = o.alphaAresta == null ? 0.62 : o.alphaAresta;

    // O pivô fica no centro do corpo (não no focinho), senão o giro
    // lento faz o bicho "varrer" a cena em vez de girar no lugar.
    var PIVO = [-0.05, 0.02, 0];

    function mundo(p) {
      var lx = (p[0] - PIVO[0]) * escala;
      var ly = (p[1] - PIVO[1]) * escala;
      var lz = (p[2] - PIVO[2]) * escala;
      return [
        centro[0] + lx * cosG + lz * sinG,
        centro[1] + ly,
        centro[2] + (-lx * sinG + lz * cosG)
      ];
    }

    // Faces
    for (var i = 0; i < MALHA.faces.length; i++) {
      var f = MALHA.faces[i];
      coletor.face(mundo(f.a), mundo(f.b), mundo(f.c), {
        cor: corFace,
        alpha: alphaFace * f.luz,
        camada: camadaFace,
        revelar: t0 + 0.18
      });
    }

    // Luz de borda. As seções do tronco são elipses no plano YZ; visto
    // de frente, a silhueta do bicho é exatamente onde z≈0 — ali a
    // superfície vira de perfil para a câmera. Reforçar essas arestas e
    // apagar as de dentro é o que transforma um emaranhado de arame num
    // volume com lado iluminado e lado escuro. Sem isso o rinoceronte
    // lê como recorte plano, por mais correta que a malha esteja.
    var RAIO_TIPICO = 0.30 * escala;

    function bordaDe(a, b) {
      var ma = mundo(a), mb = mundo(b);
      var dz = Math.abs((ma[2] + mb[2]) * 0.5 - centro[2]);
      return 1 - Math.min(1, dz / RAIO_TIPICO);
    }

    // Arestas — revelação corre da cabeça para a cauda.
    for (var j = 0; j < MALHA.arestas.length; j++) {
      var e = MALHA.arestas[j];
      var avanco = (1 - (e.a[0] + 1.0) / 2.0) * 0.55;
      var borda = bordaDe(e.a, e.b);
      coletor.linha(mundo(e.a), mundo(e.b), {
        cor: borda > 0.72 ? corPonto : cor,
        alpha: alphaAresta * (0.55 + 0.45 * e.peso) * (0.48 + 0.92 * borda),
        camada: camada,
        revelar: t0 + Math.max(0, avanco),
        largura: (0.72 + 0.42 * e.peso) * (0.85 + 0.5 * borda)
      });
    }

    // Sombra de contato: a silhueta achatada sobre a laje de baixo.
    // Um objeto sem sombra não pousa em lugar nenhum — flutua colado
    // por cima da cena. Só as arestas de silhueta entram, e em grafite:
    // sombra que brilha não é sombra.
    if (o.sombraY != null) {
      for (var s = 0; s < MALHA.arestas.length; s += 2) {
        var es = MALHA.arestas[s];
        if (bordaDe(es.a, es.b) < 0.55) continue;
        var pa = mundo(es.a), pb = mundo(es.b);
        coletor.linha(
          [centro[0] + (pa[0] - centro[0]) * 1.10, o.sombraY, centro[2] + (pa[2] - centro[2]) * 0.70],
          [centro[0] + (pb[0] - centro[0]) * 1.10, o.sombraY, centro[2] + (pb[2] - centro[2]) * 0.70],
          {
            cor: o.corSombra || [0.463, 0.584, 0.627],
            alpha: 0.24, camada: camada,
            revelar: t0 + 0.62, largura: 1.5
          }
        );
      }
    }

    // Vértices: só os das seções do tronco e das patas, senão vira
    // constelação e some a silhueta.
    var vertices = [];
    SECOES.forEach(function (s, idx) {
      if (idx % 2) return;
      anelSecao(s).forEach(function (p, k) { if (k % 2 === 0) vertices.push(p); });
    });
    PERNAS.forEach(function (p) {
      anelQuadrado(p[0], p[1], PERNA_Y[2], p[3]).forEach(function (v) { vertices.push(v); });
    });
    vertices.push([0.94, 0.41, 0]);   // ponta do chifre

    vertices.forEach(function (p, idx) {
      coletor.ponto(mundo(p), {
        cor: idx % 5 === 0 ? corPonto : cor,
        alpha: 0.66,
        camada: camadaPt,
        revelar: t0 + 0.25 + (idx % 7) * 0.03,
        tamanho: idx % 5 === 0 ? 2.5 : 1.9,
        fase: idx * 0.09,
        velocidade: 0.08
      });
    });

    // Pulsos de dado percorrendo a malha. Cada um nasce numa seção do
    // dorso e sobe um trecho curto: o shader anima pontos que têm
    // `delta`, então a varredura não custa nada por quadro. É o que
    // faz o holograma parecer alimentado por dentro em vez de aceso.
    if (o.pulsos !== false) {
      SECOES.forEach(function (sec, idx) {
        if (idx % 2) return;
        var alto = [sec[0], sec[1] + sec[2] * 0.92, 0];
        var p = mundo(alto);
        coletor.ponto(p, {
          delta: [0, 0.20 * escala, 0],
          cor: idx % 4 === 0 ? corPonto : cor,
          alpha: 0.85,
          camada: camadaPt,
          revelar: t0 + 0.7 + idx * 0.04,
          tamanho: 2.6,
          fase: (idx * 0.17) % 1,
          velocidade: 0.14
        });
      });
    }

    // Olhos
    [1, -1].forEach(function (lado) {
      coletor.ponto(mundo([0.50, 0.14, 0.152 * lado]), {
        cor: corPonto, alpha: 0.9, camada: camadaPt,
        revelar: t0 + 0.55, tamanho: 2.2, fase: 0.3, velocidade: 0.07
      });
    });
  }

  window.DMC_Rhino = {
    construir: construir,
    totalFaces: MALHA.faces.length,
    totalArestas: MALHA.arestas.length
  };
})();
