/* =============================================================
   COMPLEXO DMC · LOGIN — ARQUITETURA DO CONHECIMENTO (Three.js)

   A instalação inteira é gerada por código: nenhum modelo importado,
   nenhum vídeo simulando 3D. Leitura de baixo para cima:

     FUNDAÇÃO    — cidade construída: torres, lâminas, empreendimentos
                   e gruas. É o chão de onde tudo nasce.
     MÉTODO      — o rinoceronte holográfico, malha irregular + plexus
     ESTRATÉGIA  — mapa relacional verde: nós, hubs e rotas
     APLICAÇÃO   — painéis de leitura com números de verdade
     feixe       — a coluna de energia que atravessa os quatro níveis

   Este módulo expõe exatamente o mesmo contrato do controlador
   anterior (`pronto`, `destacar`, `projetar`, `sequenciaDeAcesso`,
   `destruir`), então login-experience.js não sabe — nem precisa saber —
   que o motor por baixo mudou.
   ============================================================= */
(function () {
  'use strict';

  var CYAN = 0x4fd8ff, GREEN = 0x7dff9b, DEEP = 0x1a6fae, GELO = 0x9be8ff;

  // Altura e meia-largura de cada laje, em unidades da cena. São estes
  // números que a interface 2D usa para ancorar os rótulos: se mudarem
  // aqui, os rótulos acompanham sozinhos.
  var Y = { FUNDACAO: 0, METODO: 2.6, ESTRATEGIA: 5.8, APLICACAO: 8.2 };
  var R = { FUNDACAO: 5.5, METODO: 4.4, ESTRATEGIA: 3.8, APLICACAO: 3.2 };

  // Janelas de revelação (segundos): início e duração de cada bloco.
  var CENA = {
    poeira:     [0.35, 0.9],
    cidade:     [0.80, 1.1],
    fundacao:   [0.70, 0.8],
    metodo:     [1.20, 0.8],
    rino:       [1.55, 1.0],
    estrategia: [2.00, 0.9],
    aplicacao:  [2.40, 0.9],
    feixe:      [2.75, 0.9]
  };

  function perfilDaMaquina() {
    var conexao = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conexao && conexao.saveData === true) return null;
    if (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 2) return null;
    if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2) return null;
    var w = window.innerWidth;
    if (w < 700) return 'LOW';
    if (w < 1180 || (navigator.deviceMemory && navigator.deviceMemory <= 4)) return 'MEDIUM';
    return 'HIGH';
  }

  function iniciar(opcoes) {
    var o = opcoes || {};
    var canvas = o.canvas;
    var reduzido = !!o.reduzido;
    var semCursor = !!o.semCursor;
    if (!canvas || !window.THREE) return null;

    var nivel = perfilDaMaquina();
    if (!nivel) return null;
    var alto = nivel === 'HIGH';

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: alto, alpha: true });
    } catch (e) { return null; }
    if (!renderer.getContext()) return null;

    // Teto de 1.5: acima disso o custo por pixel dobra sem ganho visível
    // numa cena que é quase toda traço fino e brilho.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, alto ? 1.6 : 1.3));
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02060e, 0.026);

    var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 220);
    camera.position.set(9.2, 8.2, 16.5);

    // ---------- pós-processamento ----------
    // O bloom é o que separa "linha acesa" de "luz". Sem ele o traço
    // fino não sangra no fundo e a cena vira desenho técnico.
    var composer = null;
    if (alto && THREE.EffectComposer && THREE.UnrealBloomPass) {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      composer.addPass(new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.52,   // intensidade
        0.46,   // raio
        0.52    // limiar alto: só o núcleo floresce, o resto não estoura
      ));
    }

    var descartaveis = [];
    function reg(x) { descartaveis.push(x); return x; }

    function lineMat(color, opacity) {
      return reg(new THREE.LineBasicMaterial({
        color: color, transparent: true, opacity: opacity,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
    }

    var texGlow = (function () {
      var cv = document.createElement('canvas'); cv.width = cv.height = 128;
      var g = cv.getContext('2d');
      var grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.32, 'rgba(255,255,255,0.42)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
      return reg(new THREE.CanvasTexture(cv));
    })();

    function glowSprite(color, size) {
      var s = new THREE.Sprite(reg(new THREE.SpriteMaterial({
        map: texGlow, color: color, blending: THREE.AdditiveBlending,
        depthWrite: false, transparent: true
      })));
      s.scale.set(size, size, 1);
      return s;
    }

    // ---------- plataformas ----------
    var tower = new THREE.Group();
    scene.add(tower);
    var giradores = [];   // anéis com rotação própria
    var arcos = [];       // arcos quebrados com rotação e sentido próprios

    function gridPlate(size, div, color, opacity) {
      var g = new THREE.Group();
      var pts = [], h = size / 2, step = size / div, i;
      for (i = 0; i <= div; i++) {
        var p = -h + i * step;
        pts.push(new THREE.Vector3(-h, 0, p), new THREE.Vector3(h, 0, p));
        pts.push(new THREE.Vector3(p, 0, -h), new THREE.Vector3(p, 0, h));
      }
      g.add(new THREE.LineSegments(reg(new THREE.BufferGeometry().setFromPoints(pts)), lineMat(color, opacity)));
      return g;
    }

    function rings(radii, color, opacity) {
      var g = new THREE.Group();
      radii.forEach(function (r) {
        var pts = [];
        for (var i = 0; i <= 96; i++) {
          var a = i / 96 * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
        }
        g.add(new THREE.Line(reg(new THREE.BufferGeometry().setFromPoints(pts)), lineMat(color, opacity)));
      });
      return g;
    }

    // Arcos parciais em raios variados: é o que dá leitura de circuito
    // à laje, em vez de anel concêntrico de gerador de formas.
    function brokenArcs(count, rMin, rMax, color, opacity) {
      var g = new THREE.Group();
      for (var i = 0; i < count; i++) {
        var r = rMin + Math.random() * (rMax - rMin);
        var start = Math.random() * Math.PI * 2;
        var len = 0.3 + Math.random() * 1.7;
        var seg = Math.max(6, Math.floor(len * 14));
        var pts = [];
        for (var k = 0; k <= seg; k++) {
          var a = start + k / seg * len;
          pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
        }
        g.add(new THREE.Line(reg(new THREE.BufferGeometry().setFromPoints(pts)),
          lineMat(color, opacity * (0.45 + Math.random() * 0.55))));
        if (Math.random() > 0.6) {
          var sp = glowSprite(color, 0.30);
          sp.position.copy(pts[pts.length - 1]);
          g.add(sp);
        }
      }
      return g;
    }

    function layer(y, color, plateSize, ringRadii, arcSpec) {
      var g = new THREE.Group();
      g.position.y = y;
      g.add(gridPlate(plateSize, alto ? 14 : 8, color, 0.11));

      var h = plateSize / 2;
      [[h, 0.9], [h * 0.93, 0.35]].forEach(function (par) {
        var hh = par[0];
        var pts = [
          new THREE.Vector3(-hh, 0, -hh), new THREE.Vector3(hh, 0, -hh),
          new THREE.Vector3(hh, 0, hh), new THREE.Vector3(-hh, 0, hh),
          new THREE.Vector3(-hh, 0, -hh)
        ];
        g.add(new THREE.Line(reg(new THREE.BufferGeometry().setFromPoints(pts)), lineMat(color, par[1])));
      });
      [[-h, -h], [h, -h], [h, h], [-h, h]].forEach(function (c) {
        var sp = glowSprite(color, 0.62); sp.position.set(c[0], 0, c[1]); g.add(sp);
      });

      var rg = rings(ringRadii, color, 0.5);
      g.add(rg); giradores.push(rg);

      if (arcSpec && nivel !== 'LOW') {
        var ba = brokenArcs(arcSpec.count, arcSpec.rMin, arcSpec.rMax, color, 0.6);
        g.add(ba);
        arcos.push({ o: ba, s: (Math.random() > 0.5 ? 1 : -1) * (0.05 + Math.random() * 0.12) });
      }
      var halo = glowSprite(color, 1.2); halo.position.y = 0.05; g.add(halo);
      tower.add(g);
      return g;
    }

    var densidade = alto ? 1 : (nivel === 'MEDIUM' ? 0.6 : 0.34);
    var L0 = layer(Y.FUNDACAO, CYAN, 11, [1.2, 2.2, 3.4, 4.6], { count: Math.round(24 * densidade), rMin: 1.0, rMax: 5.2 });
    var L1 = layer(Y.METODO, CYAN, 8.8, [1.0, 2.0, 3.0], { count: Math.round(14 * densidade), rMin: 0.8, rMax: 3.9 });
    var L2 = layer(Y.ESTRATEGIA, GREEN, 7.6, [0.9, 1.8, 2.7], { count: Math.round(30 * densidade), rMin: 0.6, rMax: 3.5 });
    var L3 = layer(Y.APLICACAO, CYAN, 6.4, [0.8, 1.6, 2.4], { count: Math.round(10 * densidade), rMin: 0.7, rMax: 2.7 });

    // terreno além da laje da Fundação: estende a base lateralmente
    (function () {
      var gr = rings([6.0, 6.9, 7.8], CYAN, 0.20); L0.add(gr); giradores.push(gr);
      if (nivel !== 'LOW') {
        var ga = brokenArcs(Math.round(16 * densidade), 5.8, 8.2, CYAN, 0.32);
        L0.add(ga); arcos.push({ o: ga, s: -0.04 });
      }
    })();

    // gaiola: montantes ligando os cantos de uma laje à seguinte
    (function () {
      var ys = [Y.FUNDACAO, Y.METODO, Y.ESTRATEGIA, Y.APLICACAO];
      var hs = [R.FUNDACAO, R.METODO, R.ESTRATEGIA, R.APLICACAO];
      var pts = [];
      for (var i = 0; i < 3; i++) {
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) {
          pts.push(new THREE.Vector3(s[0] * hs[i], ys[i], s[1] * hs[i]));
          pts.push(new THREE.Vector3(s[0] * hs[i + 1], ys[i + 1], s[1] * hs[i + 1]));
        });
      }
      tower.add(new THREE.LineSegments(reg(new THREE.BufferGeometry().setFromPoints(pts)), lineMat(CYAN, 0.20)));
    })();

    // =============================================================
    // FUNDAÇÃO · a cidade construída
    // Torres com recuo, lâminas corporativas, empreendimentos de torres
    // gêmeas sobre pódio e gruas de canteiro. As janelas acesas são um
    // único THREE.Points — é o que permite milhares delas de graça.
    // =============================================================
    (function () {
      var fillMat = reg(new THREE.MeshBasicMaterial({
        color: DEEP, transparent: true, opacity: 0.10,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      var janelas = [];
      var arestas = [];   // acumula todas as arestas num só LineSegments

      function caixa(x, y, z, w, h, d) {
        var geo = reg(new THREE.BoxGeometry(w, h, d));
        var m = new THREE.Mesh(geo, fillMat);
        m.position.set(x, y + h / 2, z);
        L0.add(m);
        var e = new THREE.EdgesGeometry(geo);
        var pos = e.attributes.position.array;
        for (var i = 0; i < pos.length; i += 3) {
          arestas.push(pos[i] + x, pos[i + 1] + y + h / 2, pos[i + 2] + z);
        }
        e.dispose();
      }

      function janelasDe(x, z, w, h, d, baseY, prob) {
        var andares = Math.max(2, Math.round(h / 0.20));
        var cx = Math.max(2, Math.round(w / 0.13));
        var cz = Math.max(2, Math.round(d / 0.13));
        for (var f = 1; f < andares; f++) {
          var y = baseY + f * (h / andares), c;
          for (c = 0; c < cx; c++) {
            var wx = x - w / 2 + (c + 0.5) * (w / cx);
            if (Math.random() < prob) janelas.push(wx, y, z + d / 2 + 0.005);
            if (Math.random() < prob) janelas.push(wx, y, z - d / 2 - 0.005);
          }
          for (c = 0; c < cz; c++) {
            var wz = z - d / 2 + (c + 0.5) * (d / cz);
            if (Math.random() < prob) janelas.push(x + w / 2 + 0.005, y, wz);
            if (Math.random() < prob) janelas.push(x - w / 2 - 0.005, y, wz);
          }
        }
      }

      function torre(x, z, escala) {
        var w = (0.30 + Math.random() * 0.20) * escala;
        var d = w * (0.85 + Math.random() * 0.3);
        var h = (1.0 + Math.random() * 1.4) * escala;
        caixa(x, 0.02, z, w, h, d);
        janelasDe(x, z, w, h, d, 0.02, 0.32);
        var topo = 0.02 + h;
        if (Math.random() > 0.45) {                   // recuo superior
          var w2 = w * 0.65, d2 = d * 0.65, h2 = h * 0.30;
          caixa(x, topo, z, w2, h2, d2);
          janelasDe(x, z, w2, h2, d2, topo, 0.35);
          topo += h2;
        }
        caixa(x, topo, z, w * 0.35, 0.07, d * 0.35);  // casa de máquinas
        topo += 0.07;
        if (h > 1.4 && Math.random() > 0.4) {         // antena sinalizada
          var ah = 0.22 + Math.random() * 0.28;
          arestas.push(x, topo, z, x, topo + ah, z);
          var sp = glowSprite(0xffffff, 0.16);
          sp.position.set(x, topo + ah, z); L0.add(sp);
        }
      }

      function lamina(x, z) {
        var w = 0.65 + Math.random() * 0.45, d = 0.26 + Math.random() * 0.12;
        var h = 0.55 + Math.random() * 0.55;
        caixa(x, 0.02, z, w, h, d);
        janelasDe(x, z, w, h, d, 0.02, 0.42);
        caixa(x, 0.02 + h, z, w * 0.9, 0.05, d * 0.9);   // platibanda
      }

      function empreendimento(x, z) {
        var n = 2 + (Math.random() > 0.6 ? 1 : 0);
        var tw = 0.26, td = 0.26, th = 0.9 + Math.random() * 0.9, gap = 0.42;
        var pw = n * gap + 0.25;
        caixa(x, 0.02, z, pw, 0.10, 0.75);              // pódio comercial
        janelasDe(x, z, pw, 0.10, 0.75, 0.02, 0.5);
        for (var i = 0; i < n; i++) {
          var tx = x - (n - 1) * gap / 2 + i * gap;
          caixa(tx, 0.12, z, tw, th, td);
          janelasDe(tx, z, tw, th, td, 0.12, 0.30);
          caixa(tx, 0.12 + th, z, tw * 0.4, 0.06, td * 0.4);
        }
      }

      // A grua é o que declara "obra em andamento" — sem ela a cidade
      // lê como maquete pronta, e o assunto aqui é construção.
      function grua(x, z, H, ang) {
        var cosA = Math.cos(ang), sinA = Math.sin(ang);
        function P(dx, y, dz) {
          return [x + dx * cosA - dz * sinA, y, z + dx * sinA + dz * cosA];
        }
        function seg(a, b) { arestas.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
        seg(P(0, 0, 0), P(0, H, 0));
        for (var y = 0.15; y < H; y += 0.22) {          // treliça do mastro
          seg(P(-0.05, y, 0), P(0.05, y + 0.11, 0));
          seg(P(0.05, y, 0), P(-0.05, y + 0.11, 0));
        }
        var J = H * 0.85, C = H * 0.32, apex = H + 0.18;
        seg(P(0, H, 0), P(J, H, 0));                    // lança
        seg(P(0, H, 0), P(-C, H, 0));                   // contra-lança
        seg(P(0, apex, 0), P(J, H, 0));                 // tirantes
        seg(P(0, apex, 0), P(-C, H, 0));
        seg(P(0, H, 0), P(0, apex, 0));
        seg(P(-C, H, 0), P(-C, H - 0.10, 0));           // contrapeso
        seg(P(-C + 0.08, H - 0.10, 0), P(-C - 0.08, H - 0.10, 0));
        var hx = J * 0.72, hy = H * 0.45;
        seg(P(hx, H, 0), P(hx, hy, 0));                 // cabo
        seg(P(hx - 0.05, hy, 0), P(hx + 0.05, hy, 0));  // gancho
        var sp = glowSprite(0xffffff, 0.18);
        var ap = P(0, apex, 0); sp.position.set(ap[0], ap[1], ap[2]); L0.add(sp);

        // esqueleto do prédio em obra, ao lado da grua
        var bw = 0.42, bh = H * 0.5, bd = 0.42;
        var bx = x + 0.55 * cosA, bz = z + 0.55 * sinA;
        var fl = Math.round(bh / 0.16);
        for (var f = 0; f <= fl; f++) {
          var yy = 0.02 + f * (bh / fl), hw = bw / 2, hd = bd / 2;
          seg([bx - hw, yy, bz - hd], [bx + hw, yy, bz - hd]);
          seg([bx + hw, yy, bz - hd], [bx + hw, yy, bz + hd]);
          seg([bx + hw, yy, bz + hd], [bx - hw, yy, bz + hd]);
          seg([bx - hw, yy, bz + hd], [bx - hw, yy, bz - hd]);
        }
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) {
          seg([bx + s[0] * bw / 2, 0.02, bz + s[1] * bd / 2],
              [bx + s[0] * bw / 2, 0.02 + bh, bz + s[1] * bd / 2]);
        });
      }

      // Traçado urbano em quarteirões com desvio: grade pura lê como
      // papel milimetrado, aleatório puro lê como ruído.
      var passo = 0.95;
      var corte = alto ? 0.85 : (nivel === 'MEDIUM' ? 0.62 : 0.40);
      for (var gx = -5; gx <= 5; gx++) {
        for (var gz = -5; gz <= 5; gz++) {
          var x = gx * passo + (Math.random() - 0.5) * 0.30;
          var z = gz * passo + (Math.random() - 0.5) * 0.30;
          var r = Math.sqrt(x * x + z * z);
          if (r < 1.0 || r > 4.9) continue;             // preserva o feixe e a borda
          if (Math.random() > (r < 2.6 ? corte : corte * 0.65)) continue;
          var t = Math.random();
          if (t < 0.5) torre(x, z, r < 2.6 ? 1.15 : 0.8);
          else if (t < 0.78) lamina(x, z);
          else empreendimento(x, z);
        }
      }
      grua(2.9, 1.6, 1.7, 0.5);
      if (nivel !== 'LOW') grua(-2.2, -2.6, 1.45, 2.4);

      var geoA = reg(new THREE.BufferGeometry());
      geoA.setAttribute('position', new THREE.Float32BufferAttribute(arestas, 3));
      L0.add(new THREE.LineSegments(geoA, lineMat(CYAN, 0.55)));

      var cv = document.createElement('canvas'); cv.width = cv.height = 32;
      var wg = cv.getContext('2d');
      var wgr = wg.createRadialGradient(16, 16, 0, 16, 16, 16);
      wgr.addColorStop(0, 'rgba(255,255,255,1)');
      wgr.addColorStop(0.4, 'rgba(190,240,255,0.7)');
      wgr.addColorStop(1, 'rgba(0,0,0,0)');
      wg.fillStyle = wgr; wg.fillRect(0, 0, 32, 32);
      var geoJ = reg(new THREE.BufferGeometry());
      geoJ.setAttribute('position', new THREE.Float32BufferAttribute(janelas, 3));
      L0.add(new THREE.Points(geoJ, reg(new THREE.PointsMaterial({
        map: reg(new THREE.CanvasTexture(cv)), size: 0.055, color: 0xcfeaff,
        transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
        depthWrite: false, sizeAttenuation: true
      }))));
    })();

    // =============================================================
    // MÉTODO · o rinoceronte
    // Malha por lofting de seções superelípticas — flanco reto, que é
    // o que faz um rinoceronte não virar um tubo. A triangulação é
    // deliberadamente irregular (diagonal sorteada por quad + jitter
    // por vértice): malha regular demais lê como primitiva de engine.
    // =============================================================
    var rhino = new THREE.Group();
    (function () {
      var fillMat = reg(new THREE.MeshBasicMaterial({
        color: 0x1e88c8, transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      }));
      var nos = [];

      function hash(i, j) {
        var x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
        return x - Math.floor(x);
      }

      function malha(aneis) {
        var verts = [], Rr = aneis[0].length, i, j;
        for (i = 0; i < aneis.length - 1; i++) {
          for (j = 0; j < Rr; j++) {
            var j2 = (j + 1) % Rr;
            var a = aneis[i][j], b = aneis[i][j2], c = aneis[i + 1][j], d = aneis[i + 1][j2];
            if (hash(i * 7 + 3, j * 5 + 1) > 0.5) {
              verts.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2],
                         b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
            } else {
              verts.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2],
                         a[0], a[1], a[2], d[0], d[1], d[2], b[0], b[1], b[2]);
            }
          }
        }
        [[aneis[0], -1], [aneis[aneis.length - 1], 1]].forEach(function (par) {
          var anel = par[0], dir = par[1], ctr = [0, 0, 0];
          anel.forEach(function (p) { ctr[0] += p[0] / Rr; ctr[1] += p[1] / Rr; ctr[2] += p[2] / Rr; });
          for (var k = 0; k < Rr; k++) {
            var a2 = anel[k], b2 = anel[(k + 1) % Rr];
            if (dir < 0) verts.push(ctr[0], ctr[1], ctr[2], a2[0], a2[1], a2[2], b2[0], b2[1], b2[2]);
            else verts.push(ctr[0], ctr[1], ctr[2], b2[0], b2[1], b2[2], a2[0], a2[1], a2[2]);
          }
        });
        var geo = reg(new THREE.BufferGeometry());
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        rhino.add(new THREE.Mesh(geo, fillMat));
        var wf = reg(new THREE.WireframeGeometry(geo));
        rhino.add(new THREE.LineSegments(wf, lineMat(CYAN, 0.85)));
        aneis.forEach(function (anel, i2) {
          anel.forEach(function (pt, j2) { if (hash(i2 * 3 + j2, j2 * 13 + i2) > 0.28) nos.push(pt); });
        });
      }

      // seções verticais ao longo de X (corpo)
      function loftH(secoes, radial, jit) {
        malha(secoes.map(function (sl, i) {
          var anel = [];
          for (var j = 0; j < radial; j++) {
            var a = j / radial * Math.PI * 2;
            var c = Math.cos(a), sn = Math.sin(a), e = 2 / (sl.n || 2.2);
            anel.push([
              sl.x + (hash(i, j) - 0.5) * jit,
              sl.cy + sl.ry * Math.sign(c) * Math.pow(Math.abs(c), e) + (hash(i + 40, j) - 0.5) * jit,
              sl.rz * Math.sign(sn) * Math.pow(Math.abs(sn), e) + (hash(i + 80, j) - 0.5) * jit
            ]);
          }
          return anel;
        }));
      }

      // anéis horizontais ao longo de um caminho (pernas, chifres, cauda)
      function loftV(caminho, radial, jit) {
        malha(caminho.map(function (pt, i) {
          var anel = [];
          for (var j = 0; j < radial; j++) {
            var a = j / radial * Math.PI * 2;
            anel.push([
              pt.cx + Math.cos(a) * pt.r + (hash(i + 11, j) - 0.5) * jit,
              pt.y + (hash(i + 51, j) - 0.5) * jit,
              pt.cz + Math.sin(a) * pt.r + (hash(i + 91, j) - 0.5) * jit
            ]);
          }
          return anel;
        }));
      }

      loftH([
        { x: -2.10, cy: 1.15, ry: 0.30, rz: 0.26, n: 2.0 },
        { x: -1.85, cy: 1.12, ry: 0.55, rz: 0.44, n: 2.2 },
        { x: -1.55, cy: 1.10, ry: 0.75, rz: 0.56, n: 2.4 },   // garupa
        { x: -1.20, cy: 1.06, ry: 0.82, rz: 0.60, n: 2.5 },
        { x: -0.80, cy: 1.00, ry: 0.85, rz: 0.62, n: 2.5 },   // barriga
        { x: -0.40, cy: 1.00, ry: 0.86, rz: 0.62, n: 2.5 },
        { x: 0.00, cy: 1.06, ry: 0.88, rz: 0.60, n: 2.5 },
        { x: 0.40, cy: 1.16, ry: 0.90, rz: 0.56, n: 2.4 },    // corcova do ombro
        { x: 0.75, cy: 1.18, ry: 0.82, rz: 0.50, n: 2.3 },
        { x: 1.05, cy: 1.10, ry: 0.66, rz: 0.42, n: 2.2 },    // pescoço
        { x: 1.35, cy: 1.04, ry: 0.54, rz: 0.35, n: 2.1 },
        { x: 1.62, cy: 1.00, ry: 0.46, rz: 0.30, n: 2.0 },
        { x: 1.90, cy: 0.96, ry: 0.40, rz: 0.26, n: 2.0 },
        { x: 2.18, cy: 0.92, ry: 0.34, rz: 0.22, n: 2.0 },
        { x: 2.42, cy: 0.90, ry: 0.27, rz: 0.19, n: 2.0 },    // focinho
        { x: 2.58, cy: 0.88, ry: 0.18, rz: 0.15, n: 2.0 }
      ], alto ? 12 : 9, 0.05);

      function perna(cx, cz) {
        loftV([
          { y: 1.05, cx: cx, cz: cz, r: 0.30 },
          { y: 0.65, cx: cx + 0.02, cz: cz, r: 0.20 },
          { y: 0.35, cx: cx, cz: cz, r: 0.15 },
          { y: 0.12, cx: cx, cz: cz, r: 0.16 },
          { y: 0.02, cx: cx, cz: cz, r: 0.17 }
        ], 7, 0.03);
      }
      perna(0.55, 0.34); perna(0.55, -0.34);
      perna(-1.45, 0.34); perna(-1.45, -0.34);

      loftV([                                   // chifre principal
        { y: 1.14, cx: 2.30, cz: 0, r: 0.17 },
        { y: 1.44, cx: 2.34, cz: 0, r: 0.13 },
        { y: 1.72, cx: 2.29, cz: 0, r: 0.08 },
        { y: 1.96, cx: 2.17, cz: 0, r: 0.015 }
      ], 6, 0.02);
      loftV([                                   // chifre secundário
        { y: 1.30, cx: 1.94, cz: 0, r: 0.10 },
        { y: 1.48, cx: 1.96, cz: 0, r: 0.065 },
        { y: 1.63, cx: 1.92, cz: 0, r: 0.01 }
      ], 6, 0.015);
      [0.24, -0.24].forEach(function (z) {      // orelhas
        loftV([
          { y: 1.44, cx: 1.50, cz: z, r: 0.11 },
          { y: 1.62, cx: 1.53, cz: z * 1.25, r: 0.06 },
          { y: 1.76, cx: 1.55, cz: z * 1.42, r: 0.01 }
        ], 5, 0.015);
      });
      loftV([                                   // cauda
        { y: 1.08, cx: -2.08, cz: 0, r: 0.055 },
        { y: 0.80, cx: -2.14, cz: 0, r: 0.04 },
        { y: 0.52, cx: -2.16, cz: 0, r: 0.03 },
        { y: 0.30, cx: -2.14, cz: 0, r: 0.015 }
      ], 5, 0.02);

      [0.30, -0.30].forEach(function (z) {      // olhos
        var pts = [];
        for (var i = 0; i <= 14; i++) {
          var a = i / 14 * Math.PI * 2;
          pts.push(new THREE.Vector3(1.80 + Math.cos(a) * 0.055, 1.12 + Math.sin(a) * 0.055, z));
        }
        rhino.add(new THREE.Line(reg(new THREE.BufferGeometry().setFromPoints(pts)), lineMat(GELO, 0.95)));
      });

      // Nós luminosos nos vértices + cordas internas: o holograma passa
      // a ter miolo, e não só casca de arame.
      (function () {
        var cv = document.createElement('canvas'); cv.width = cv.height = 64;
        var g = cv.getContext('2d');
        var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(235,255,255,1)');
        gr.addColorStop(0.3, 'rgba(150,235,255,0.85)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        var tex = reg(new THREE.CanvasTexture(cv));

        function nuvem(pts, size) {
          var flat = [];
          pts.forEach(function (p) { flat.push(p[0], p[1], p[2]); });
          var geo = reg(new THREE.BufferGeometry());
          geo.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
          return new THREE.Points(geo, reg(new THREE.PointsMaterial({
            map: tex, size: size, transparent: true, opacity: 1,
            blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
          })));
        }
        rhino.add(nuvem(nos, 0.22));
        rhino.add(nuvem(nos.filter(function (p, i) { return hash(i, i * 3 + 7) > 0.90; }), 0.48));

        var cordas = [];
        for (var i = 0; i < nos.length; i++) {
          if (hash(i * 5 + 1, i) < 0.90) continue;
          for (var k = 0; k < 3; k++) {
            var j = Math.floor(hash(i, k * 17 + 5) * nos.length);
            var a = nos[i], b = nos[j];
            var dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
            var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist > 0.45 && dist < 1.5) cordas.push(a[0], a[1], a[2], b[0], b[1], b[2]);
          }
        }
        var cg = reg(new THREE.BufferGeometry());
        cg.setAttribute('position', new THREE.Float32BufferAttribute(cordas, 3));
        rhino.add(new THREE.LineSegments(cg, lineMat(CYAN, 0.28)));
      })();

      rhino.scale.set(1.3, 1.3, 1.3);
      rhino.rotation.y = 0.5;
      L1.add(rhino);
    })();

    // =============================================================
    // ESTRATÉGIA · mapa relacional
    // Cada nó liga aos dois vizinhos mais próximos: a malha resultante
    // é uma decisão de proximidade, não um desenho arbitrário.
    // =============================================================
    (function () {
      var N = alto ? 18 : 11, nos = [], i;
      for (i = 0; i < N; i++) {
        var a = Math.random() * Math.PI * 2, r = 0.9 + Math.random() * 2.5;
        nos.push(new THREE.Vector3(Math.cos(a) * r, 0.04, Math.sin(a) * r));
      }
      var seg = [];
      nos.forEach(function (n, idx) {
        nos.map(function (m, j) { return { j: j, d: n.distanceTo(m) }; })
          .filter(function (o2) { return o2.j !== idx; })
          .sort(function (x, y2) { return x.d - y2.d; })
          .slice(0, 2)
          .forEach(function (o2) { seg.push(n.clone(), nos[o2.j].clone()); });
      });
      L2.add(new THREE.LineSegments(reg(new THREE.BufferGeometry().setFromPoints(seg)), lineMat(GREEN, 0.55)));
      nos.forEach(function (n, idx) {
        var hub = idx % 5 === 0;
        var sp = glowSprite(hub ? 0xd6ffde : GREEN, hub ? 0.55 : 0.30);
        sp.position.copy(n); L2.add(sp);
        if (hub) {
          var pts = [];
          for (var k = 0; k <= 24; k++) {
            var a2 = k / 24 * Math.PI * 2;
            pts.push(new THREE.Vector3(n.x + Math.cos(a2) * 0.22, 0.04, n.z + Math.sin(a2) * 0.22));
          }
          L2.add(new THREE.Line(reg(new THREE.BufferGeometry().setFromPoints(pts)), lineMat(GREEN, 0.7)));
        }
      });
    })();

    // =============================================================
    // APLICAÇÃO · painéis de leitura
    // Desenhados em canvas e aplicados como textura: é a única forma de
    // ter número e rótulo legíveis de verdade. Gráfico sem eixo, sem
    // escala e sem unidade é decoração — aqui os dados são coerentes.
    // =============================================================
    var painelRig = new THREE.Group();
    (function () {
      function tela(tipo) {
        var W = 1120, H = 700;
        var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        var g = cv.getContext('2d');

        function rr(x, y, w, h, r) {
          g.beginPath(); g.moveTo(x + r, y);
          g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
          g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
        }

        var bg = g.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, 'rgba(8,20,38,0.97)');
        bg.addColorStop(1, 'rgba(3,10,22,0.97)');
        rr(4, 4, W - 8, H - 8, 20); g.fillStyle = bg; g.fill();
        g.strokeStyle = 'rgba(79,216,255,0.9)'; g.lineWidth = 3;
        rr(4, 4, W - 8, H - 8, 20); g.stroke();
        g.strokeStyle = 'rgba(79,216,255,0.22)'; g.lineWidth = 1;
        rr(14, 14, W - 28, H - 28, 14); g.stroke();

        g.strokeStyle = '#9be8ff'; g.lineWidth = 5;
        [[8, 8, 1, 1], [W - 8, 8, -1, 1], [W - 8, H - 8, -1, -1], [8, H - 8, 1, -1]].forEach(function (c) {
          g.beginPath(); g.moveTo(c[0], c[1] + c[3] * 44); g.lineTo(c[0], c[1]);
          g.lineTo(c[0] + c[2] * 44, c[1]); g.stroke();
        });
        g.fillStyle = 'rgba(155,232,255,0.022)';
        for (var sy = 8; sy < H - 8; sy += 7) g.fillRect(8, sy, W - 16, 2);

        var hg = g.createLinearGradient(0, 0, W, 0);
        hg.addColorStop(0, 'rgba(79,216,255,0.30)');
        hg.addColorStop(1, 'rgba(79,216,255,0.04)');
        rr(6, 6, W - 12, 72, 18); g.fillStyle = hg; g.fill();
        g.fillStyle = '#dff6ff'; g.font = '600 30px Poppins, DM Sans, sans-serif';
        g.fillText({ bars: 'PERFORMANCE', list: 'MAPA DE MÓDULOS', core: 'COMPLEXO DMC' }[tipo], 40, 54);
        ['#7dff9b', '#4fd8ff', '#9be8ff'].forEach(function (c, i) {
          g.fillStyle = c; g.beginPath(); g.arc(W - 52 - i * 40, 42, 9, 0, Math.PI * 2); g.fill();
        });

        if (tipo === 'bars') {
          g.fillStyle = '#ffffff'; g.font = '700 78px Poppins, DM Sans, sans-serif';
          g.fillText('Holding', 44, 190);
          rr(370, 138, 168, 52, 26); g.fillStyle = 'rgba(125,255,155,0.16)'; g.fill();
          g.strokeStyle = 'rgba(125,255,155,0.8)'; g.lineWidth = 2; rr(370, 138, 168, 52, 26); g.stroke();
          g.fillStyle = '#7dff9b'; g.font = '600 30px Poppins, DM Sans, sans-serif';
          g.fillText('Módulo', 392, 174);
          g.fillStyle = 'rgba(155,232,255,0.55)'; g.font = '400 24px Poppins, DM Sans, sans-serif';
          g.fillText('trilha de estudo · planejamento patrimonial', 44, 232);

          var x0 = 44, y0 = 620, cw = 610, ch = 300, i2;
          g.strokeStyle = 'rgba(79,216,255,0.15)'; g.lineWidth = 1;
          for (i2 = 0; i2 <= 4; i2++) {
            var yg = y0 - i2 * ch / 4;
            g.beginPath(); g.moveTo(x0, yg); g.lineTo(x0 + cw, yg); g.stroke();
          }
          var vals = [36, 48, 44, 62, 58, 74, 70, 86, 82, 98, 110, 126];
          var pts = vals.map(function (v, i3) { return [x0 + i3 * (cw / 11), y0 - v * (ch / 130)]; });
          var area = g.createLinearGradient(0, y0 - ch, 0, y0);
          area.addColorStop(0, 'rgba(79,216,255,0.35)');
          area.addColorStop(1, 'rgba(79,216,255,0.02)');
          g.beginPath(); g.moveTo(pts[0][0], y0);
          pts.forEach(function (pt) { g.lineTo(pt[0], pt[1]); });
          g.lineTo(pts[11][0], y0); g.closePath(); g.fillStyle = area; g.fill();
          g.strokeStyle = '#4fd8ff'; g.lineWidth = 5; g.beginPath();
          pts.forEach(function (pt, i3) { i3 ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1]); });
          g.stroke();
          pts.forEach(function (pt, i3) {
            g.fillStyle = i3 === 11 ? '#7dff9b' : '#bfefff';
            g.beginPath(); g.arc(pt[0], pt[1], i3 === 11 ? 9 : 6, 0, Math.PI * 2); g.fill();
          });
          g.fillStyle = '#7dff9b'; g.font = '700 28px Poppins, DM Sans, sans-serif';
          g.fillText('hoje', pts[11][0] - 24, pts[11][1] - 20);
          g.fillStyle = 'rgba(155,232,255,0.5)'; g.font = '400 20px Poppins, DM Sans, sans-serif';
          'JFMAMJJASOND'.split('').forEach(function (m, i3) { g.fillText(m, x0 + i3 * (cw / 11) - 6, y0 + 34); });

          var cx = 880, cy = 400, Rd = 120;
          g.lineWidth = 34; g.strokeStyle = 'rgba(79,216,255,0.20)';
          g.beginPath(); g.arc(cx, cy, Rd, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = '#7dff9b'; g.lineCap = 'round';
          g.beginPath(); g.arc(cx, cy, Rd, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.72); g.stroke();
          g.lineCap = 'butt';
          g.fillStyle = '#ffffff'; g.font = '700 58px Poppins, DM Sans, sans-serif'; g.textAlign = 'center';
          g.fillText('Trilha', cx, cy + 18);
          g.fillStyle = 'rgba(155,232,255,0.6)'; g.font = '400 24px Poppins, DM Sans, sans-serif';
          g.fillText('em andamento', cx, cy + 58); g.textAlign = 'left';
          [['#7dff9b', 'realizado'], ['rgba(79,216,255,0.5)', 'projetado']].forEach(function (L, i3) {
            var yl = 580 + i3 * 40;
            g.fillStyle = L[0]; rr(790, yl - 16, 22, 22, 5); g.fill();
            g.fillStyle = 'rgba(223,246,255,0.75)'; g.font = '400 24px Poppins, DM Sans, sans-serif';
            g.fillText(L[1], 826, yl + 2);
          });

        } else if (tipo === 'list') {
          [['E1', 'patrimonial'], ['E2', 'tributário'], ['E6', 'trabalhista']].forEach(function (st, i3) {
            var x = 44 + i3 * 260;
            g.fillStyle = '#ffffff'; g.font = '700 62px Poppins, DM Sans, sans-serif'; g.fillText(st[0], x, 178);
            g.fillStyle = 'rgba(155,232,255,0.55)'; g.font = '400 24px Poppins, DM Sans, sans-serif';
            g.fillText(st[1], x, 214);
          });
          g.strokeStyle = 'rgba(79,216,255,0.25)'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(44, 244); g.lineTo(W - 44, 244); g.stroke();
          [['FUNDAMENTOS', 92], ['ESTRUTURAÇÃO', 78], ['GOVERNANÇA', 85], ['SUCESSÃO', 64], ['TRIBUTÁRIO', 71]]
            .forEach(function (row, i3) {
              var y = 286 + i3 * 80;
              if (i3 % 2 === 0) { rr(36, y - 34, W - 72, 68, 12); g.fillStyle = 'rgba(79,216,255,0.06)'; g.fill(); }
              g.fillStyle = '#dff6ff'; g.font = '500 27px Poppins, DM Sans, sans-serif';
              g.fillText(row[0], 56, y + 8);
              rr(430, y - 10, 420, 22, 11); g.fillStyle = 'rgba(79,216,255,0.18)'; g.fill();
              rr(430, y - 10, 420 * row[1] / 100, 22, 11);
              g.fillStyle = row[1] > 80 ? '#7dff9b' : '#4fd8ff'; g.fill();
              g.fillStyle = '#ffffff'; g.font = '600 28px Poppins, DM Sans, sans-serif';
              g.fillText(row[1] + '%', 880, y + 10);
              g.fillStyle = row[1] > 80 ? '#7dff9b' : '#ffd166';
              g.beginPath(); g.arc(1010, y + 1, 11, 0, Math.PI * 2); g.fill();
            });

        } else {
          var ccx = W / 2, ccy = 330, Rc = 118, i4;
          g.strokeStyle = '#4fd8ff'; g.lineWidth = 5; g.beginPath();
          for (i4 = 0; i4 <= 6; i4++) {
            var ah = -Math.PI / 2 + i4 / 6 * Math.PI * 2;
            var hx2 = ccx + Math.cos(ah) * Rc, hy2 = ccy + Math.sin(ah) * Rc;
            i4 ? g.lineTo(hx2, hy2) : g.moveTo(hx2, hy2);
          }
          g.stroke(); g.fillStyle = 'rgba(79,216,255,0.08)'; g.fill();
          [1.35, 1.7].forEach(function (k, i5) {
            g.strokeStyle = 'rgba(79,216,255,' + (0.35 - i5 * 0.15) + ')'; g.lineWidth = 2;
            g.beginPath(); g.ellipse(ccx, ccy, Rc * k, Rc * k * 0.42, 0, 0, Math.PI * 2); g.stroke();
          });
          [0.2, 0.75, 1.4].forEach(function (a3) {
            g.fillStyle = '#9be8ff'; g.beginPath();
            g.arc(ccx + Math.cos(a3 * Math.PI * 2) * Rc * 1.35,
                  ccy + Math.sin(a3 * Math.PI * 2) * Rc * 1.35 * 0.42, 8, 0, Math.PI * 2);
            g.fill();
          });
          g.fillStyle = '#ffffff'; g.font = '700 64px Poppins, DM Sans, sans-serif'; g.textAlign = 'center';
          g.fillText('DMC', ccx, ccy + 22);
          g.fillStyle = '#9be8ff'; g.font = '600 26px Poppins, DM Sans, sans-serif';
          g.fillText('ARQUITETURA PATRIMONIAL', ccx, 530);
          g.fillStyle = 'rgba(155,232,255,0.55)'; g.font = '400 24px Poppins, DM Sans, sans-serif';
          g.fillText('Jurídico · Contábil · Registral · Tecnologia', ccx, 572);
          g.textAlign = 'left';
          ['JUR', 'CONT', 'REG', 'TECH'].forEach(function (tag, i5) {
            var x = 200 + i5 * 200;
            g.fillStyle = '#7dff9b'; g.beginPath(); g.arc(x, 630, 9, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgba(223,246,255,0.7)'; g.font = '500 22px Poppins, DM Sans, sans-serif';
            g.fillText(tag, x + 20, 638);
          });
        }

        var tex = reg(new THREE.CanvasTexture(cv));
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        tex.minFilter = THREE.LinearFilter;
        var pw = tipo === 'core' ? 2.85 : 3.30, ph = pw * (H / W);
        var m = new THREE.Mesh(
          reg(new THREE.PlaneGeometry(pw, ph)),
          reg(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.97, side: THREE.DoubleSide }))
        );
        var back = glowSprite(CYAN, ph * 1.5);
        back.position.z = -0.05; back.material.opacity = 0.35;
        var feet = new THREE.LineSegments(reg(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-pw * 0.4, -ph / 2, 0), new THREE.Vector3(-pw * 0.4, -2.1, 0),
          new THREE.Vector3(pw * 0.4, -ph / 2, 0), new THREE.Vector3(pw * 0.4, -2.1, 0)
        ])), lineMat(CYAN, 0.35));
        var grp = new THREE.Group();
        grp.add(back); grp.add(m); grp.add(feet);
        [[-pw / 2, -ph / 2], [pw / 2, -ph / 2], [pw / 2, ph / 2], [-pw / 2, ph / 2]].forEach(function (c) {
          var sp = glowSprite(0xbfefff, 0.20); sp.position.set(c[0], c[1], 0.02); grp.add(sp);
        });
        return grp;
      }

      // Altura da bancada: +1.5 acima da laje. Mais alto que isso e o
      // topo dos painéis sangra pela borda superior do quadro — cartão
      // de interface cortado lê como bug, não como sangria de composição.
      // No celular a bancada sai de cena: nessa largura o texto dos
      // painéis é ilegível e eles ainda roubam do rinoceronte o único
      // terço de tela disponível. Some o que não pode ser lido.
      if (nivel === 'LOW') { L3.add(painelRig); return; }
      var s1 = tela('list'); s1.position.set(-2.45, 1.22, 0.55); s1.rotation.y = 0.55; s1.rotation.x = -0.04;
      var s2 = tela('bars'); s2.position.set(2.45, 1.22, 0.55); s2.rotation.y = -0.55; s2.rotation.x = -0.04;
      var s3 = tela('core'); s3.position.set(0, 1.52, -1.15);
      painelRig.add(s1); painelRig.add(s2); painelRig.add(s3);
      L3.add(painelRig);
    })();

    // ---------- feixe central ----------
    var feixe = new THREE.Group();
    var beam = new THREE.Mesh(
      reg(new THREE.CylinderGeometry(0.05, 0.05, 15, 8, 1, true)),
      reg(new THREE.MeshBasicMaterial({
        color: 0xbfefff, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false
      }))
    );
    beam.position.y = 6.0; feixe.add(beam);
    var beamGlow = new THREE.Mesh(
      reg(new THREE.CylinderGeometry(0.22, 0.22, 15, 8, 1, true)),
      reg(new THREE.MeshBasicMaterial({
        color: CYAN, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      }))
    );
    beamGlow.position.y = 6.0; feixe.add(beamGlow);
    [0, Y.METODO, Y.ESTRATEGIA, Y.APLICACAO, 10.6].forEach(function (y) {
      var s = glowSprite(0xdff6ff, 0.9); s.position.y = y; feixe.add(s);
    });
    tower.add(feixe);

    // linhas verticais subindo pelo interior da torre
    var subidas = [];
    (function () {
      var total = Math.round(40 * densidade);
      for (var i = 0; i < total; i++) {
        var a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 4;
        var x = Math.cos(a) * r, z = Math.sin(a) * r;
        var l = new THREE.Line(
          reg(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0.9, z)])),
          lineMat(CYAN, 0.45)
        );
        l.userData = { speed: 0.4 + Math.random() * 0.9, y: Math.random() * 8 };
        subidas.push(l); feixe.add(l);
      }
    })();

    // ---------- poeira e estrelas ----------
    function campo(count, spread, color, size, opacity) {
      var pos = new Float32Array(count * 3);
      for (var i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * spread;
        pos[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.7;
        pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
      }
      var geo = reg(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var p = new THREE.Points(geo, reg(new THREE.PointsMaterial({
        color: color, size: size, transparent: true, opacity: opacity,
        blending: THREE.AdditiveBlending, depthWrite: false
      })));
      scene.add(p);
      return p;
    }
    var estrelas = campo(Math.round(900 * densidade), 70, 0x8fd8ff, 0.08, 0.7);
    var poeira = campo(Math.round(250 * densidade), 20, CYAN, 0.05, 0.7);

    // =============================================================
    // REVELAÇÃO ENCENADA
    // Cada bloco guarda o alpha de origem dos próprios materiais e o
    // multiplica por um fator 0→1. É o que permite a cena nascer em
    // ordem — cidade, lajes, rinoceronte, estratégia, painéis, feixe —
    // sem duplicar geometria nem recriar material por quadro.
    // =============================================================
    // Cada material entra numa única lista com o alpha de origem, a
    // janela de revelação a que pertence e a camada que o destaca. O
    // alpha final é sempre op0 × revelação × destaque, calculado num
    // lugar só — dois laços mexendo no mesmo `opacity` brigariam.
    var materiais = [];
    var blocos = {};

    function bloco(nome, raiz, camada) {
      if (!blocos[nome]) blocos[nome] = { janela: CENA[nome], k: reduzido ? 1 : 0 };
      raiz.traverse(function (n) {
        if (!n.material) return;
        var lista = Array.isArray(n.material) ? n.material : [n.material];
        lista.forEach(function (m) {
          if (m.userData.op0 != null) return;        // material compartilhado
          m.userData.op0 = m.opacity;
          materiais.push({ m: m, op0: m.opacity, bloco: nome, camada: camada || 0 });
        });
      });
    }
    bloco('cidade', L0, 1);
    bloco('metodo', L1, 2);
    bloco('rino', rhino, 2);
    bloco('estrategia', L2, 3);
    bloco('aplicacao', L3, 4);
    bloco('feixe', feixe, 0);
    bloco('poeira', estrelas, 0);
    bloco('poeira', poeira, 0);

    // ---------- enquadramento responsivo ----------
    // A torre é empurrada para a esquerda porque a faixa direita da
    // tela pertence ao card de acesso. `alvoX` é o ponto que a câmera
    // mira: quanto maior, mais a instalação recua para a esquerda.
    // Enquadramento por breakpoint. Os três números saíram de uma busca
    // que projeta os pontos extremos da instalação e escolhe a MAIOR
    // composição que ainda respeita quatro limites duros: não sair do
    // quadro, não invadir a faixa do card (x < 0.60) e não descer sobre
    // a headline (y < 0.72). `alvoX/alvoY` movem o ponto que a câmera
    // mira — alvoX alto empurra a torre para a esquerda, alvoY negativo
    // faz a câmera olhar mais para baixo e sobe a cena no quadro.
    var palco = { alvoX: 5.5, alvoY: -4.25, dist: 1.65 };
    function medirPalco() {
      var w = window.innerWidth, h = window.innerHeight;
      if (w >= 1180) {
        palco = h < 800
          ? { alvoX: 5.5, alvoY: -4.00, dist: 1.55 }
          : { alvoX: 5.5, alvoY: -5.00, dist: 1.65 };
      } else if (w >= 900) {
        palco = { alvoX: 5.25, alvoY: -8.00, dist: 2.05 };
      } else {
        // Tablet retrato e celular: o card fica ABAIXO, então a cena
        // volta ao centro e cabe inteira no terço superior — a torre
        // precisa ser lida antes de o dedo alcançar o formulário.
        palco = { alvoX: 3.0, alvoY: -13.5, dist: 2.55 };
      }
    }
    medirPalco();

    tower.position.set(2.2, -3.4, 0);

    function redimensionar() {
      var w = window.innerWidth, h = window.innerHeight;
      medirPalco();
      renderer.setSize(w, h, false);
      if (composer) composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    var pendente = 0;
    function aoRedimensionar() {
      clearTimeout(pendente);
      pendente = setTimeout(redimensionar, 120);
    }
    window.addEventListener('resize', redimensionar, { passive: true });
    window.addEventListener('orientationchange', aoRedimensionar, { passive: true });
    redimensionar();

    // ---------- ponteiro ----------
    var mx = 0, my = 0, alvoMx = 0, alvoMy = 0;
    function moverPonteiro(ev) {
      alvoMx = (ev.clientX / window.innerWidth - 0.5);
      alvoMy = (ev.clientY / window.innerHeight - 0.5);
    }
    function sairPonteiro() { alvoMx = 0; alvoMy = 0; }
    if (!reduzido && !semCursor) {
      window.addEventListener('pointermove', moverPonteiro, { passive: true });
      window.addEventListener('pointerleave', sairPonteiro, { passive: true });
      window.addEventListener('blur', sairPonteiro);
    }

    // ---------- destaque de camada ----------
    var CAMADA_DE = { 1: L0, 2: L1, 3: L2, 4: L3 };
    var camadaAtiva = null;
    var ganho = { 1: 1, 2: 1, 3: 1, 4: 1 };

    // ---------- ciclo ----------
    var relogio = new THREE.Clock();
    var rafId = 0, vivo = true, dolly = 0, dollyAlvo = 0, clarao = 0;
    var resolvePronto;
    var pronto = new Promise(function (res) { resolvePronto = res; });

    // Vigia de quadro: o bloom é o passe mais caro da cena e o único
    // dispensável. Se a média de 90 quadros estourar o orçamento, ele
    // cai e o resto continua — melhor uma cena sem floração do que uma
    // cena travada. A decisão é tomada uma vez e não volta atrás, para
    // não oscilar ligando e desligando.
    var ORCAMENTO_MS = 26, amostras = 0, somaMs = 0, ultimoMs = 0, jaRebaixou = false;

    function quadro() {
      var t = relogio.getElapsedTime();
      var vel = reduzido ? 0 : 1;

      if (composer && !jaRebaixou) {
        var agora = performance.now();
        if (ultimoMs) {
          somaMs += agora - ultimoMs;
          if (++amostras >= 90) {
            if (somaMs / amostras > ORCAMENTO_MS) { composer = null; jaRebaixou = true; }
            amostras = 0; somaMs = 0;
          }
        }
        ultimoMs = agora;
      }

      if (!reduzido) {
        for (var nome in blocos) {
          var b = blocos[nome];
          var k = Math.max(0, Math.min(1, (t - b.janela[0]) / b.janela[1]));
          b.k = 1 - Math.pow(1 - k, 3);               // easeOutCubic
        }
      }

      tower.rotation.y = t * 0.12 * vel;
      giradores.forEach(function (r, i) { r.rotation.y = t * (i % 2 ? -0.25 : 0.18) * vel; });
      arcos.forEach(function (a) { a.o.rotation.y = t * a.s * vel; });
      painelRig.rotation.y = -tower.rotation.y;       // painéis sempre de frente
      rhino.rotation.y = 0.5 - tower.rotation.y + Math.sin(t * 0.3) * 0.25 * vel;
      rhino.position.y = 0.15 + Math.sin(t * 1.2) * 0.08 * vel;

      // destaque da camada sob o cursor — mola, não corte seco
      var k4;
      for (k4 = 1; k4 <= 4; k4++) {
        var alvo = camadaAtiva == null ? 1 : (camadaAtiva === k4 ? 1.5 : 0.45);
        ganho[k4] += (alvo - ganho[k4]) * 0.12;
      }

      // alpha final de cada material, num lugar só
      var kFeixe = blocos.feixe.k;
      for (var i6 = 0; i6 < materiais.length; i6++) {
        var reg2 = materiais[i6];
        var g2 = reg2.camada ? ganho[reg2.camada] : 1;
        reg2.m.opacity = Math.min(1, reg2.op0 * blocos[reg2.bloco].k * g2);
      }

      var pulso = 1 + clarao * 2.2;
      beam.material.opacity = Math.min(1, (0.32 + Math.sin(t * 2.4) * 0.12) * pulso * kFeixe);
      beamGlow.material.opacity = Math.min(1, (0.06 + Math.sin(t * 2.4) * 0.03) * pulso * kFeixe);

      subidas.forEach(function (l) {
        l.userData.y += l.userData.speed * 0.03 * vel;
        if (l.userData.y > 10.4) l.userData.y = 0;
        l.position.y = l.userData.y;
        l.material.opacity = 0.5 * (1 - l.userData.y / 10.4) * kFeixe;
      });

      poeira.rotation.y = t * 0.03 * vel;
      estrelas.rotation.y = t * 0.008 * vel;

      mx += (alvoMx - mx) * 0.06;
      my += (alvoMy - my) * 0.06;
      dolly += (dollyAlvo - dolly) * 0.055;
      clarao *= 0.94;

      var d = palco.dist * (1 - dolly * 0.14);
      camera.position.set(
        (9.2 + mx * 2.4) * d,
        (8.2 - my * 1.6) * d,
        16.5 * d
      );
      camera.lookAt(palco.alvoX, palco.alvoY, 0);

      if (composer) composer.render(); else renderer.render(scene, camera);
      if (vivo) rafId = requestAnimationFrame(quadro);
    }

    function pausar() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }
    function retomar() { if (!rafId && vivo && !reduzido) rafId = requestAnimationFrame(quadro); }
    function aoVisibilidade() {
      if (document.visibilityState === 'hidden') pausar(); else retomar();
    }
    document.addEventListener('visibilitychange', aoVisibilidade);

    if (reduzido) {
      quadro();                       // um quadro só, com tudo revelado
      resolvePronto();
    } else {
      rafId = requestAnimationFrame(function () { quadro(); resolvePronto(); });
    }

    // ---------- API ----------
    /**
     * Projeta um ponto do espaço da torre na viewport, em frações de
     * tela ({x, y} de 0 a 1, y crescendo para baixo). A rotação da
     * torre é ignorada de propósito: os rótulos ancoram no eixo e no
     * raio inscrito das lajes, que não mudam com o giro.
     */
    var _v = new THREE.Vector3();
    function projetar(p) {
      _v.set(p[0] + tower.position.x, p[1] + tower.position.y, p[2] + tower.position.z);
      _v.project(camera);
      if (_v.z > 1) return null;
      return { x: (_v.x + 1) / 2, y: (1 - _v.y) / 2 };
    }

    function destacar(indice) {
      camadaAtiva = (indice == null) ? null : Number(indice);
    }

    /**
     * Sequência de acesso: só roda depois de autenticação aceita. A
     * câmera avança, o feixe estoura e as camadas acendem de baixo
     * para cima antes da navegação.
     */
    function sequenciaDeAcesso() {
      if (reduzido) {
        clarao = 1;
        return new Promise(function (res) { setTimeout(res, 260); });
      }
      dollyAlvo = 1;
      [0, 120, 240, 360].forEach(function (ms, i) {
        setTimeout(function () { clarao = 1; camadaAtiva = i + 1; }, ms);
      });
      setTimeout(function () { camadaAtiva = null; }, 520);
      return new Promise(function (res) { setTimeout(res, 1150); });
    }

    function destruir() {
      vivo = false;
      pausar();
      clearTimeout(pendente);
      window.removeEventListener('resize', redimensionar);
      window.removeEventListener('orientationchange', aoRedimensionar);
      window.removeEventListener('pointermove', moverPonteiro);
      window.removeEventListener('pointerleave', sairPonteiro);
      window.removeEventListener('blur', sairPonteiro);
      document.removeEventListener('visibilitychange', aoVisibilidade);
      descartaveis.forEach(function (x) { if (x && x.dispose) x.dispose(); });
      if (composer && composer.renderTarget1) {
        composer.renderTarget1.dispose(); composer.renderTarget2.dispose();
      }
      renderer.dispose();
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

  window.DMC_KnowledgeArchitecture = { iniciar: iniciar };
  // A interface 2D ancora os rótulos por estes números.
  window.DMC_KnowledgeGeometry = { Y: Y, R: R };
})();
