/* =============================================================
   COMPLEXO DMC · LOGIN — NÚCLEO DE RENDERIZAÇÃO WebGL
   Renderer mínimo, sem dependências, para uma cena feita só de
   LINHAS e PONTOS luminosos (blending aditivo).

   Duas decisões que sustentam o resto:

   1) Linhas como quads em espaço de tela.
      gl.LINES trava em 1px na maioria dos navegadores — fica fino
      e "arame" em telas retina. Cada segmento vira 2 triângulos
      expandidos na perpendicular, com queda suave de alpha da
      borda pro centro. Isso dá espessura real e o brilho já sai
      do próprio traço, sem post-processing/bloom.

   2) Tudo num buffer só.
      Todos os segmentos da cena vão num único VBO+IBO e saem em
      UM draw call. Camada, tempo de revelação, cor e espessura
      são atributos por vértice; destaque e rotação por camada são
      uniforms indexados. Idem para os pontos.

   Compatível com WebGL1 e WebGL2 (GLSL ES 1.00, sem instancing).
   ============================================================= */
(function () {
  'use strict';

  // ---------- shaders ----------

  // Projeção compartilhada: gira o ponto em torno de Y pelo ângulo da
  // camada (anéis contra-rotacionando sem virar draw call novo),
  // aplica a matriz de câmera e reposiciona o palco em NDC — é assim
  // que a arquitetura fica ancorada nos ~60% da esquerda sem que a
  // câmera precise saber de layout.
  var COMUM = [
    'uniform mat4 uViewProj;',
    'uniform vec2 uStageOffset;',
    'uniform float uStageScale;',
    'uniform float uSpin[12];',
    'uniform float uGain[12];',
    'uniform float uTime;',
    'uniform float uAspect;',
    'uniform vec2 uPointer;',
    'uniform float uPointerGain;',
    'uniform vec2 uNevoa;',     // x = distância onde a névoa começa, y = onde satura
    '',
    // Atenuação atmosférica. Num render aditivo sem depth test, um
    // traço a 4 unidades da câmera e outro a 8 chegam com exatamente o
    // mesmo brilho — e a cena inteira colapsa num plano só. Esta é a
    // pista de profundidade mais barata que existe: o que está longe
    // perde luz. É o que separa "ilustração vetorial" de "fotografia".
    'float nevoa(float w) {',
    '  return mix(1.0, 0.26, smoothstep(uNevoa.x, uNevoa.y, w));',
    '}',
    '',
    'vec4 projetar(vec3 p, float camada) {',
    '  float a = uSpin[int(camada)];',
    '  float c = cos(a), s = sin(a);',
    '  vec3 q = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);',
    '  vec4 clip = uViewProj * vec4(q, 1.0);',
    '  clip.xy = clip.xy * uStageScale + uStageOffset * clip.w;',
    '  return clip;',
    '}',
    '',
    // Nós perto do cursor acendem: campo magnético, não perseguição.
    'float brilhoDoCursor(vec4 clip) {',
    '  if (uPointerGain <= 0.0 || clip.w <= 0.0) return 1.0;',
    '  vec2 ndc = clip.xy / clip.w;',
    '  vec2 d = (ndc - uPointer) * vec2(uAspect, 1.0);',
    '  return 1.0 + 0.62 * uPointerGain * exp(-dot(d, d) * 6.0);',
    '}'
  ].join('\n');

  var VS_LINHA = [
    'precision highp float;',
    'attribute vec3 aA;',
    'attribute vec3 aB;',
    'attribute vec2 aCanto;',   // x: 0 = A, 1 = B · y: lado -1/+1
    'attribute vec3 aCor;',
    'attribute vec4 aParams;',  // alpha, camada, revelação, espessura(px)
    'uniform vec2 uViewport;',
    'uniform float uEspessura;',
    COMUM,
    'varying vec3 vCor;',
    'varying float vLado;',
    'varying float vAo;',      // progresso longitudinal: 0 = centro, 1 = ponta
    'varying float vFlare;',
    'varying float vAlpha;',
    'void main() {',
    '  float camada = aParams.y;',
    '  vec4 ca = projetar(aA, camada);',
    '  vec4 cb = projetar(aB, camada);',
    '  float wa = max(ca.w, 0.0001);',
    '  float wb = max(cb.w, 0.0001);',
    '  vec2 meia = uViewport * 0.5;',
    '  vec2 sa = ca.xy / wa * meia;',
    '  vec2 sb = cb.xy / wb * meia;',
    '  vec2 dir = sb - sa;',
    '  float comp = length(dir);',
    '  dir = comp > 0.0001 ? dir / comp : vec2(1.0, 0.0);',
    '  vec2 normal = vec2(-dir.y, dir.x);',
    '  vec4 base = mix(ca, cb, aCanto.x);',
    '  vec2 sbase = mix(sa, sb, aCanto.x);',
    // Traço distante engorda um pouco e perde muito alpha: é
    // desfoque de profundidade sem custo de post-processing.
    '  float bruma = smoothstep(uNevoa.x, uNevoa.y, base.w);',
    '  float largura = aParams.w * uEspessura * (1.0 + 0.30 * bruma);',
    '  vec2 spos = sbase + normal * aCanto.y * largura * 0.5;',
    '  gl_Position = vec4(spos / meia * base.w, base.z, base.w);',
    '  float rev = smoothstep(aParams.z, aParams.z + 0.55, uTime);',
    '  vCor = aCor;',
    '  vLado = aCanto.y;',
    '  vAo = aCanto.x;',
    '  vFlare = step(10.5, camada);',
    '  vAlpha = aParams.x * rev * uGain[int(camada)] * brilhoDoCursor(base) * nevoa(base.w);',
    '}'
  ].join('\n');

  var FS_LINHA = [
    'precision mediump float;',
    'varying vec3 vCor;',
    'varying float vLado;',
    'varying float vAo;',
    'varying float vFlare;',
    'varying float vAlpha;',
    'void main() {',
    // Núcleo nítido + halo: o glow nasce da própria queda de alpha.
    '  float f = max(0.0, 1.0 - abs(vLado));',
    '  float nucleo = pow(f, 2.4) * 0.82 + pow(f, 0.65) * 0.18;',
    // Braço de flare afina da base até sumir na ponta. Fora da camada 11
    // o mix devolve 1.0 e nada no resto da cena muda.
    '  float taper = mix(1.0, pow(max(0.0, 1.0 - vAo), 1.7), vFlare);',
    '  float a = nucleo * vAlpha * taper;',
    '  if (a <= 0.002) discard;',
    '  gl_FragColor = vec4(vCor, a);',
    '}'
  ].join('\n');

  var VS_PONTO = [
    'precision highp float;',
    'attribute vec3 aPos;',
    'attribute vec3 aDelta;',   // trajeto do pulso (0 = ponto parado)
    'attribute vec3 aCor;',
    'attribute vec4 aParams;',  // alpha, camada, revelação, tamanho
    'attribute vec2 aSeed;',    // fase, velocidade
    'uniform float uPointScale;',
    'uniform float uPointMax;',
    'uniform float uDeriva;',   // 0 = congelado (reduced motion)
    COMUM,
    'varying vec3 vCor;',
    'varying float vFlare;',
    'varying float vAlpha;',
    'void main() {',
    '  float camada = aParams.y;',
    '  vec3 p = aPos;',
    '  float extra = 1.0;',
    '  if (aSeed.y > 0.0) {',
    '    if (abs(camada - 9.0) < 0.5) {',
    // Partícula: sobe devagar e reentra por baixo; oscilação lateral mínima.
    '      float alcance = 4.2;',
    '      p.y = mod(p.y + uTime * aSeed.y * uDeriva + aSeed.x * alcance, alcance) - 0.6;',
    '      p.x += sin(uTime * 0.22 + aSeed.x * 6.28) * 0.035 * uDeriva;',
    '      extra = 0.55 + 0.45 * sin(uTime * 0.9 + aSeed.x * 12.0);',
    '    } else {',
    // Nó/pulso: se tem trajeto, percorre a conexão e some nas pontas.
    '      float t = fract(uTime * aSeed.y * uDeriva + aSeed.x);',
    '      p += aDelta * t;',
    '      extra = length(aDelta) > 0.0001',
    '        ? sin(t * 3.14159) * 1.15',
    '        : 0.72 + 0.28 * sin(uTime * 1.6 + aSeed.x * 6.28);',
    '    }',
    '  }',
    '  vec4 clip = projetar(p, camada);',
    '  gl_Position = clip;',
    '  float rev = smoothstep(aParams.z, aParams.z + 0.55, uTime);',
    // Teto obrigatório: sem ele um sprite grande em tela 4K pede mais que
    // o máximo do driver e o ponto some ou clampa de forma inconsistente.
    // O sprite acompanha a escala do palco: sem isso, quando a cena
    // encolhe para caber numa tela pequena, os pontos continuam do
    // mesmo tamanho em pixels e engolem a estrutura. 0.615 é a escala
    // de referência (desktop), então lá o fator é exatamente 1.
    '  float escalaPonto = mix(1.0, uStageScale / 0.615, 0.85);',
    // O sprite também precisa encolher com a distância, não só perder
    // alpha: os nós são os elementos de maior contraste da cena, e um
    // nó distante do mesmo diâmetro de um próximo desmente a névoa
    // aplicada em todo o resto da geometria.
    '  float bruma = smoothstep(uNevoa.x, uNevoa.y, clip.w);',
    '  gl_PointSize = min(aParams.w * uPointScale * escalaPonto * mix(1.0, 0.58, bruma) / max(clip.w, 0.35), uPointMax);',
    '  vFlare = step(10.5, camada);',
    '  vCor = aCor;',
    '  vAlpha = aParams.x * rev * extra * uGain[int(camada)] * brilhoDoCursor(clip) * nevoa(clip.w);',
    '}'
  ].join('\n');

  var FS_PONTO = [
    'precision mediump float;',
    'varying vec3 vCor;',
    'varying float vFlare;',
    'varying float vAlpha;',
    'void main() {',
    '  vec2 uv = gl_PointCoord - 0.5;',
    '  float d = length(uv);',
    '  float a = smoothstep(0.5, 0.0, d);',
    '  a = a * a * 0.75 + pow(a, 0.6) * 0.25;',
    // Camada 11: halo radial + duas pontas em cruz. gl_PointCoord é espaço
    // de tela, então a estrela nunca gira com a câmera — como lente real.
    '  if (vFlare > 0.5) {',
    '    vec2 n = uv / max(d, 0.0001);',
    '    float cauda = pow(max(0.0, 1.0 - d * 2.0), 1.15);',
    '    float pontas = pow(abs(n.x), 34.0) + pow(abs(n.y), 34.0);',
    '    float nucleo = pow(max(0.0, 1.0 - d * 5.5), 2.0);',
    '    a = a * 0.38 + cauda * pontas * 0.95 + nucleo * 0.85;',
    '  }',
    '  a *= vAlpha;',
    '  if (a <= 0.003) discard;',
    '  gl_FragColor = vec4(vCor, a);',
    '}'
  ].join('\n');

  // Faces do rinoceronte: superfície sólida translúcida.
  // A iluminação é assada no vértice (alpha por face, calculado na CPU
  // com a normal real), então o fragment não faz conta nenhuma — é o
  // que dá o aspecto facetado de low-poly sem custo de shading.
  var VS_FACE = [
    'precision highp float;',
    'attribute vec3 aPos;',
    'attribute vec3 aCor;',
    'attribute vec4 aParams;',  // alpha, camada, revelação, —
    COMUM,
    'varying vec3 vCor;',
    'varying float vAlpha;',
    'void main() {',
    '  vec4 clip = projetar(aPos, aParams.y);',
    '  gl_Position = clip;',
    '  float rev = smoothstep(aParams.z, aParams.z + 0.55, uTime);',
    '  vCor = aCor;',
    '  vAlpha = aParams.x * rev * uGain[int(aParams.y)] * brilhoDoCursor(clip) * nevoa(clip.w);',
    '}'
  ].join('\n');

  var FS_FACE = [
    'precision mediump float;',
    'varying vec3 vCor;',
    'varying float vAlpha;',
    'void main() {',
    '  if (vAlpha <= 0.002) discard;',
    '  gl_FragColor = vec4(vCor, vAlpha);',
    '}'
  ].join('\n');

  // ---------- utilidades de GL ----------

  function compilar(gl, tipo, fonte) {
    var sh = gl.createShader(tipo);
    gl.shaderSource(sh, fonte);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[DMC] shader:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function programa(gl, vs, fs, atributos) {
    var v = compilar(gl, gl.VERTEX_SHADER, vs);
    var f = compilar(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    var p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('[DMC] link:', gl.getProgramInfoLog(p));
      return null;
    }
    var api = { prog: p, attr: {}, uni: {} };
    atributos.forEach(function (nome) { api.attr[nome] = gl.getAttribLocation(p, nome); });
    var total = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < total; i++) {
      var info = gl.getActiveUniform(p, i);
      var nome = info.name.replace(/\[0\]$/, '');
      api.uni[nome] = gl.getUniformLocation(p, info.name);
    }
    return api;
  }

  // ---------- matrizes (coluna-major, como o GL espera) ----------

  function perspectiva(fovY, aspecto, perto, longe) {
    var f = 1 / Math.tan(fovY / 2);
    var nf = 1 / (perto - longe);
    return new Float32Array([
      f / aspecto, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (longe + perto) * nf, -1,
      0, 0, 2 * longe * perto * nf, 0
    ]);
  }

  function olharPara(olho, alvo, cima) {
    var zx = olho[0] - alvo[0], zy = olho[1] - alvo[1], zz = olho[2] - alvo[2];
    var zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    var xx = cima[1] * zz - cima[2] * zy;
    var xy = cima[2] * zx - cima[0] * zz;
    var xz = cima[0] * zy - cima[1] * zx;
    var xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy;
    var yy = zz * xx - zx * xz;
    var yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * olho[0] + xy * olho[1] + xz * olho[2]),
      -(yx * olho[0] + yy * olho[1] + yz * olho[2]),
      -(zx * olho[0] + zy * olho[1] + zz * olho[2]),
      1
    ]);
  }

  function multiplicar(a, b) {
    var out = new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      for (var l = 0; l < 4; l++) {
        out[c * 4 + l] =
          a[0 * 4 + l] * b[c * 4 + 0] +
          a[1 * 4 + l] * b[c * 4 + 1] +
          a[2 * 4 + l] * b[c * 4 + 2] +
          a[3 * 4 + l] * b[c * 4 + 3];
      }
    }
    return out;
  }

  // ---------- empacotamento da geometria ----------

  var FLOATS_LINHA = 15;  // aA(3) aB(3) aCanto(2) aCor(3) aParams(4)
  var FLOATS_PONTO = 15;  // aPos(3) aDelta(3) aCor(3) aParams(4) aSeed(2)

  function empacotarLinhas(segmentos) {
    var n = segmentos.length;
    var verts = new Float32Array(n * 4 * FLOATS_LINHA);
    var idx = new Uint16Array(n * 6);
    var cantos = [[0, -1], [0, 1], [1, -1], [1, 1]];
    var o = 0;
    for (var i = 0; i < n; i++) {
      var s = segmentos[i];
      for (var k = 0; k < 4; k++) {
        verts[o++] = s.a[0]; verts[o++] = s.a[1]; verts[o++] = s.a[2];
        verts[o++] = s.b[0]; verts[o++] = s.b[1]; verts[o++] = s.b[2];
        verts[o++] = cantos[k][0]; verts[o++] = cantos[k][1];
        verts[o++] = s.cor[0]; verts[o++] = s.cor[1]; verts[o++] = s.cor[2];
        verts[o++] = s.alpha; verts[o++] = s.camada; verts[o++] = s.revelar;
        verts[o++] = s.largura;
      }
      var v = i * 4, j = i * 6;
      idx[j] = v; idx[j + 1] = v + 1; idx[j + 2] = v + 2;
      idx[j + 3] = v + 2; idx[j + 4] = v + 1; idx[j + 5] = v + 3;
    }
    return { verts: verts, idx: idx, total: n * 6 };
  }

  var FLOATS_FACE = 10;   // aPos(3) aCor(3) aParams(4)

  function empacotarFaces(faces) {
    var verts = new Float32Array(faces.length * 3 * FLOATS_FACE);
    var o = 0;
    for (var i = 0; i < faces.length; i++) {
      var f = faces[i];
      var cantos = [f.a, f.b, f.c];
      for (var k = 0; k < 3; k++) {
        verts[o++] = cantos[k][0]; verts[o++] = cantos[k][1]; verts[o++] = cantos[k][2];
        verts[o++] = f.cor[0]; verts[o++] = f.cor[1]; verts[o++] = f.cor[2];
        verts[o++] = f.alpha; verts[o++] = f.camada; verts[o++] = f.revelar; verts[o++] = 0;
      }
    }
    return { verts: verts, total: faces.length * 3 };
  }

  function empacotarPontos(pontos) {
    var n = pontos.length;
    var verts = new Float32Array(n * FLOATS_PONTO);
    var o = 0;
    for (var i = 0; i < n; i++) {
      var p = pontos[i];
      var d = p.delta || [0, 0, 0];
      verts[o++] = p.p[0]; verts[o++] = p.p[1]; verts[o++] = p.p[2];
      verts[o++] = d[0]; verts[o++] = d[1]; verts[o++] = d[2];
      verts[o++] = p.cor[0]; verts[o++] = p.cor[1]; verts[o++] = p.cor[2];
      verts[o++] = p.alpha; verts[o++] = p.camada; verts[o++] = p.revelar;
      verts[o++] = p.tamanho;
      verts[o++] = p.fase || 0; verts[o++] = p.velocidade || 0;
    }
    return { verts: verts, total: n };
  }

  // ---------- renderer ----------

  function criar(canvas, opcoes) {
    var atributosCtx = {
      alpha: true,
      antialias: false,          // as bordas já saem suaves do shader
      depth: false,              // cena aditiva: profundidade não importa
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false
    };
    var gl = canvas.getContext('webgl2', atributosCtx) ||
             canvas.getContext('webgl', atributosCtx) ||
             canvas.getContext('experimental-webgl', atributosCtx);
    if (!gl) return null;

    var progLinha = programa(gl, VS_LINHA, FS_LINHA, ['aA', 'aB', 'aCanto', 'aCor', 'aParams']);
    var progPonto = programa(gl, VS_PONTO, FS_PONTO, ['aPos', 'aDelta', 'aCor', 'aParams', 'aSeed']);
    var progFace = programa(gl, VS_FACE, FS_FACE, ['aPos', 'aCor', 'aParams']);
    if (!progLinha || !progPonto || !progFace) return null;

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);   // aditivo: sobreposição vira luz
    gl.clearColor(0, 0, 0, 0);

    var bufLinhaV = gl.createBuffer();
    var bufLinhaI = gl.createBuffer();
    var bufPonto = gl.createBuffer();
    var bufFace = gl.createBuffer();
    var totalIdx = 0;
    var totalPontos = 0;
    var totalFaces = 0;

    var estado = {
      viewProj: perspectiva(0.72, 1, 0.1, 60),
      viewport: [1, 1],
      aspecto: 1,
      dpr: 1,
      tempo: 0,
      offset: [0, 0],
      escala: 1,
      espessura: 1,
      pointScale: 1,
      pointMax: 64,
      deriva: 1,
      pointerGain: 1,
      ponteiro: [9, 9],
      // Névoa: a câmera fica a ~6.45 do eixo e a cena ocupa ±2 em
      // profundidade, então a faixa útil de distância é ~4.4 a 8.5.
      // Começar em 5.2 deixa a torre em foco e manda o fundo recuar.
      nevoa: new Float32Array([5.2, 8.4]),
      spin: new Float32Array(12),
      gain: new Float32Array(12)
    };
    for (var i = 0; i < 12; i++) estado.gain[i] = 1;

    // Máximo real de gl_PointSize deste driver. O mínimo garantido pelo
    // GL ES é 64: sem consultar, sprites grandes viram bug de GPU.
    var faixaPt = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    estado.pointMax = Math.min((faixaPt && faixaPt[1]) || 64, 512);

    function carregarSegmentos(segmentos) {
      var pack = empacotarLinhas(segmentos);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufLinhaV);
      gl.bufferData(gl.ARRAY_BUFFER, pack.verts, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufLinhaI);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, pack.idx, gl.STATIC_DRAW);
      totalIdx = pack.total;
    }

    function carregarFaces(faces) {
      var pack = empacotarFaces(faces);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufFace);
      gl.bufferData(gl.ARRAY_BUFFER, pack.verts, gl.STATIC_DRAW);
      totalFaces = pack.total;
    }

    function carregarPontos(pontos) {
      var pack = empacotarPontos(pontos);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPonto);
      gl.bufferData(gl.ARRAY_BUFFER, pack.verts, gl.STATIC_DRAW);
      totalPontos = pack.total;
    }

    function redimensionar(larguraCss, alturaCss, dpr) {
      var w = Math.max(1, Math.round(larguraCss * dpr));
      var h = Math.max(1, Math.round(alturaCss * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      estado.viewport = [w, h];
      estado.aspecto = w / h;
      estado.dpr = dpr;
      estado.espessura = dpr;
      estado.pointScale = dpr * h * 0.0105;
    }

    function camera(olho, alvo, fov) {
      var proj = perspectiva(fov, estado.aspecto, 0.1, 60);
      estado.viewProj = multiplicar(proj, olharPara(olho, alvo, [0, 1, 0]));
    }

    function aplicarComuns(p) {
      gl.uniformMatrix4fv(p.uni.uViewProj, false, estado.viewProj);
      gl.uniform2fv(p.uni.uStageOffset, estado.offset);
      gl.uniform1f(p.uni.uStageScale, estado.escala);
      gl.uniform1fv(p.uni.uSpin, estado.spin);
      gl.uniform1fv(p.uni.uGain, estado.gain);
      gl.uniform1f(p.uni.uTime, estado.tempo);
      gl.uniform1f(p.uni.uAspect, estado.aspecto);
      gl.uniform2fv(p.uni.uPointer, estado.ponteiro);
      gl.uniform1f(p.uni.uPointerGain, estado.pointerGain);
      gl.uniform2fv(p.uni.uNevoa, estado.nevoa);
    }

    function ligarAtributo(p, nome, tam, passo, deslocamento) {
      var loc = p.attr[nome];
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, tam, gl.FLOAT, false, passo, deslocamento);
    }

    function desenhar() {
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (totalFaces) {
        // Culling: sem ele o volume aditivo soma as faces de trás e o
        // bicho vira mancha. Com winding corrigido na construção, some
        // metade dos triângulos e a leitura de sólido aparece.
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.useProgram(progFace.prog);
        aplicarComuns(progFace);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufFace);
        var pf = FLOATS_FACE * 4;
        ligarAtributo(progFace, 'aPos', 3, pf, 0);
        ligarAtributo(progFace, 'aCor', 3, pf, 12);
        ligarAtributo(progFace, 'aParams', 4, pf, 24);
        gl.drawArrays(gl.TRIANGLES, 0, totalFaces);
        gl.disable(gl.CULL_FACE);
      }

      if (totalIdx) {
        gl.useProgram(progLinha.prog);
        aplicarComuns(progLinha);
        gl.uniform2fv(progLinha.uni.uViewport, estado.viewport);
        gl.uniform1f(progLinha.uni.uEspessura, estado.espessura);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufLinhaV);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufLinhaI);
        var pl = FLOATS_LINHA * 4;
        ligarAtributo(progLinha, 'aA', 3, pl, 0);
        ligarAtributo(progLinha, 'aB', 3, pl, 12);
        ligarAtributo(progLinha, 'aCanto', 2, pl, 24);
        ligarAtributo(progLinha, 'aCor', 3, pl, 32);
        ligarAtributo(progLinha, 'aParams', 4, pl, 44);
        gl.drawElements(gl.TRIANGLES, totalIdx, gl.UNSIGNED_SHORT, 0);
      }

      if (totalPontos) {
        gl.useProgram(progPonto.prog);
        aplicarComuns(progPonto);
        gl.uniform1f(progPonto.uni.uPointScale, estado.pointScale);
        gl.uniform1f(progPonto.uni.uPointMax, estado.pointMax);
        gl.uniform1f(progPonto.uni.uDeriva, estado.deriva);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufPonto);
        var pp = FLOATS_PONTO * 4;
        ligarAtributo(progPonto, 'aPos', 3, pp, 0);
        ligarAtributo(progPonto, 'aDelta', 3, pp, 12);
        ligarAtributo(progPonto, 'aCor', 3, pp, 24);
        ligarAtributo(progPonto, 'aParams', 4, pp, 36);
        ligarAtributo(progPonto, 'aSeed', 2, pp, 52);
        gl.drawArrays(gl.POINTS, 0, totalPontos);
      }
    }

    function destruir() {
      gl.deleteBuffer(bufLinhaV);
      gl.deleteBuffer(bufLinhaI);
      gl.deleteBuffer(bufPonto);
      gl.deleteBuffer(bufFace);
      gl.deleteProgram(progLinha.prog);
      gl.deleteProgram(progPonto.prog);
      gl.deleteProgram(progFace.prog);
      var perder = gl.getExtension('WEBGL_lose_context');
      if (perder) perder.loseContext();
    }

    return {
      gl: gl,
      estado: estado,
      carregarSegmentos: carregarSegmentos,
      carregarPontos: carregarPontos,
      carregarFaces: carregarFaces,
      redimensionar: redimensionar,
      camera: camera,
      desenhar: desenhar,
      destruir: destruir
    };
  }

  // ---------- qualidade adaptativa ----------
  // Decide o nível pelo que dá pra saber antes do primeiro frame; o
  // controlador rebaixa em runtime se o frame médio passar do orçamento.
  function detectarQualidade() {
    var larg = window.innerWidth;
    var dpr = window.devicePixelRatio || 1;
    var nucleos = navigator.hardwareConcurrency || 4;
    var mem = navigator.deviceMemory || 4;
    var toque = window.matchMedia('(hover: none)').matches;

    if (larg < 720 || nucleos <= 2 || mem <= 2) return 'LOW';
    if (toque || larg < 1180 || nucleos <= 4 || dpr > 2.4) return 'MEDIUM';
    return 'HIGH';
  }

  window.DMC_GL = {
    criar: criar,
    detectarQualidade: detectarQualidade,
    limitarDpr: function () { return Math.min(window.devicePixelRatio || 1, 1.5); }
  };
})();
