/* =============================================================
   COMPLEXO DMC · EIXO EDUCACIONAL 3D
   Torre helicoidal de conhecimento — Canvas 2D com projeção
   em perspectiva própria (sem WebGL, sem dependências).

   Leitura visual: um eixo vertical luminoso (o eixo educacional)
   com uma escadaria helicoidal ascendente (a progressão do aluno),
   anéis de módulo que acendem em onda (as etapas da formação) e
   partículas de conhecimento subindo pela espiral.

   Degradação: some abaixo de 1024px (CSS + guarda no JS), desenha
   um único quadro estático com prefers-reduced-motion e pausa
   quando a aba perde o foco.
   ============================================================= */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var C_BASE = [0, 231, 252];  // ciano — base da torre
  var C_TOP = [0, 255, 77];    // verde — topo da torre

  var CFG = {
    height: 2.15,          // altura da torre em unidades de mundo
    radius: 1.00,          // raio na base
    taper: 0.34,           // afunilamento até o topo
    steps: 74,             // degraus da hélice
    turns: 3.15,           // voltas completas da hélice
    ringT: [0.09, 0.36, 0.63, 0.92],  // altura relativa dos anéis de módulo
    ringSeg: 26,
    pillars: 6,            // montantes verticais — leitura arquitetônica
    pillarSeg: 10,
    particles: 44,
    motes: 54,
    spin: 0.155,           // rad/s de rotação própria
    waveCycle: 3.6         // s entre ondas de energia subindo os anéis
  };

  // ---------- utilidades ----------
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mixColor(t) {
    return [
      lerp(C_BASE[0], C_TOP[0], t),
      lerp(C_BASE[1], C_TOP[1], t),
      lerp(C_BASE[2], C_TOP[2], t)
    ];
  }
  function rgba(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) + ')';
  }
  function radiusAt(t) { return CFG.radius * (1 - CFG.taper * t); }
  // Ruído determinístico: mantém o quadro estático (reduced motion) idêntico
  // entre recargas, sem depender de Math.random no build da geometria.
  function hash(i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // =============================================================
  // CENA
  // =============================================================
  function createScene(canvas) {
    var ctx = canvas.getContext('2d', { alpha: true });
    var W = 0, H = 0, dpr = 1;
    var cx = 0, cy = 0, unit = 0;

    // --- geometria estática ---
    var steps = [];   // degraus da hélice
    for (var i = 0; i < CFG.steps; i++) {
      var t = i / (CFG.steps - 1);
      steps.push({
        t: t,
        a: t * CFG.turns * TAU,
        y: -CFG.height / 2 + t * CFG.height,
        r: radiusAt(t)
      });
    }

    var rings = CFG.ringT.map(function (t, idx) {
      return { t: t, y: -CFG.height / 2 + t * CFG.height, r: radiusAt(t) * 1.22, phase: idx * 0.5, energy: 0 };
    });

    var particles = [];
    for (var p = 0; p < CFG.particles; p++) {
      particles.push({
        t: hash(p),                            // progresso vertical 0..1
        a: hash(p + 90) * TAU,                 // ângulo inicial
        spd: 0.055 + hash(p + 17) * 0.085,     // velocidade de subida
        w: 0.7 + hash(p + 43) * 1.5,           // velocidade angular
        rf: 0.78 + hash(p + 61) * 0.55,        // fator de raio
        sz: 0.9 + hash(p + 5) * 1.5
      });
    }

    var motes = [];
    for (var m = 0; m < CFG.motes; m++) {
      motes.push({
        x: (hash(m + 200) - 0.5) * 5.2,
        y: (hash(m + 310) - 0.5) * 3.4,
        z: (hash(m + 420) - 0.5) * 4.0,
        sz: 0.5 + hash(m + 530) * 1.1,
        ph: hash(m + 640) * TAU
      });
    }

    // --- sprites de brilho ---
    // Um halo radial pré-renderizado por cor. Sai muito mais barato que criar
    // gradientes a cada quadro e evita o disco de borda dura do arc() puro.
    function makeGlow(color) {
      var s = document.createElement('canvas');
      s.width = s.height = 128;
      var g = s.getContext('2d');
      var grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, rgba(color, 1));
      grd.addColorStop(0.28, rgba(color, 0.34));
      grd.addColorStop(0.62, rgba(color, 0.07));
      grd.addColorStop(1, rgba(color, 0));
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      return s;
    }
    var glowBase = makeGlow(C_BASE);
    var glowTop = makeGlow(C_TOP);
    // t = 0 (ciano) .. 1 (verde): mistura os dois halos em modo aditivo.
    function drawGlow(x, y, r, t, a) {
      if (a <= 0.002 || r <= 0) return;
      var d = r * 2;
      if (t < 1) { ctx.globalAlpha = a * (1 - t); ctx.drawImage(glowBase, x - r, y - r, d, d); }
      if (t > 0) { ctx.globalAlpha = a * t; ctx.drawImage(glowTop, x - r, y - r, d, d); }
      ctx.globalAlpha = 1;
    }

    // --- câmera / estado de animação ---
    var cam = { dist: 4.25, yaw: 0.6, pitch: -0.26, targetYaw: 0, targetPitch: 0 };
    var st = {
      time: 0,
      spin: 0,
      wave: 0,
      burst: 0,       // 0..1, decai após o submit
      focusRing: -1,
      pointerX: 0, pointerY: 0
    };

    // buffers reutilizados por quadro (sem alocação no loop)
    var sx = new Float32Array(CFG.steps);
    var sy = new Float32Array(CFG.steps);
    var ss = new Float32Array(CFG.steps);
    var sz = new Float32Array(CFG.steps);
    var ix = new Float32Array(CFG.steps);
    var iy = new Float32Array(CFG.steps);
    var rx = new Float32Array(CFG.ringSeg + 1);
    var ry = new Float32Array(CFG.ringSeg + 1);
    var rz = new Float32Array(CFG.ringSeg + 1);
    var rs = new Float32Array(CFG.ringSeg + 1);

    // --- projeção ---
    var cosY = 1, sinY = 0, cosX = 1, sinX = 0;
    function updateRotation() {
      var yaw = cam.yaw + st.spin + cam.targetYaw;
      var pitch = cam.pitch + cam.targetPitch;
      cosY = Math.cos(yaw); sinY = Math.sin(yaw);
      cosX = Math.cos(pitch); sinX = Math.sin(pitch);
    }
    // Projeta (x,y,z) do mundo → tela. Grava em out[0..3]: px, py, escala, z-câmera.
    var out = [0, 0, 0, 0];
    function project(x, y, z) {
      var x1 = x * cosY + z * sinY;
      var z1 = z * cosY - x * sinY;
      var y1 = y * cosX - z1 * sinX;
      var z2 = z1 * cosX + y * sinX;
      var zc = z2 + cam.dist;
      if (zc < 0.35) zc = 0.35;
      var s = unit * (cam.dist / zc);
      out[0] = cx + x1 * s;
      out[1] = cy - y1 * s;
      out[2] = s / unit;   // 1 = plano do eixo, >1 na frente, <1 atrás
      out[3] = z2;
      return out;
    }

    // =============================================================
    // DESENHO
    // =============================================================
    function drawMotes() {
      for (var i = 0; i < motes.length; i++) {
        var mo = motes[i];
        var o = project(mo.x, mo.y, mo.z);
        var tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(st.time * 0.8 + mo.ph));
        var a = 0.13 * tw * o[2];
        if (a < 0.004) continue;
        ctx.fillStyle = rgba(C_BASE, a);
        ctx.beginPath();
        ctx.arc(o[0], o[1], mo.sz * o[2], 0, TAU);
        ctx.fill();
      }
    }

    // O eixo: feixe vertical + pulsos de luz subindo.
    function drawAxis(front) {
      var b = project(0, -CFG.height / 2 - 0.06, 0);
      var bx = b[0], by = b[1];
      var tp = project(0, CFG.height / 2 + 0.30, 0);

      if (!front) {
        var g = ctx.createLinearGradient(bx, by, tp[0], tp[1]);
        g.addColorStop(0, rgba(C_BASE, 0.05));
        g.addColorStop(0.45, rgba(C_BASE, 0.34 + st.burst * 0.4));
        g.addColorStop(1, rgba(C_TOP, 0.42 + st.burst * 0.45));
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.4 + st.burst * 2.2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(tp[0], tp[1]);
        ctx.stroke();

        // halo do feixe
        ctx.strokeStyle = rgba(mixColor(0.5), 0.07 + st.burst * 0.16);
        ctx.lineWidth = 7 + st.burst * 10;
        ctx.stroke();
        return;
      }

      // pulsos ascendentes (desenhados na passada da frente para brilhar por cima)
      for (var k = 0; k < 3; k++) {
        var pt = ((st.time * (0.30 + st.burst * 0.55) + k / 3) % 1);
        var py = -CFG.height / 2 + pt * CFG.height;
        var o = project(0, py, 0);
        var fade = Math.sin(pt * Math.PI);
        var col = mixColor(pt);
        drawGlow(o[0], o[1], 22 * o[2] * fade, pt, (0.30 + st.burst * 0.4) * fade);
        ctx.fillStyle = rgba(col, (0.75 + st.burst * 0.25) * fade);
        ctx.beginPath(); ctx.arc(o[0], o[1], 2.1 * o[2], 0, TAU); ctx.fill();
      }
    }

    // Base: elipse de fundação, ancora a torre no espaço.
    function drawBase() {
      var r = CFG.radius * 1.34;
      var yb = -CFG.height / 2 - 0.02;
      ctx.beginPath();
      for (var i = 0; i <= CFG.ringSeg; i++) {
        var a = (i / CFG.ringSeg) * TAU;
        var o = project(Math.cos(a) * r, yb, Math.sin(a) * r);
        if (i === 0) ctx.moveTo(o[0], o[1]); else ctx.lineTo(o[0], o[1]);
      }
      ctx.strokeStyle = rgba(C_BASE, 0.16);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Pré-calcula os pontos da hélice do quadro atual.
    function projectHelix() {
      for (var i = 0; i < CFG.steps; i++) {
        var s = steps[i];
        var a = s.a;
        var o = project(Math.cos(a) * s.r, s.y, Math.sin(a) * s.r);
        sx[i] = o[0]; sy[i] = o[1]; ss[i] = o[2]; sz[i] = o[3];
        var oi = project(Math.cos(a) * s.r * 0.14, s.y, Math.sin(a) * s.r * 0.14);
        ix[i] = oi[0]; iy[i] = oi[1];
      }
    }

    // Desenha a metade da hélice atrás (front=false) ou à frente (front=true) do eixo.
    function drawHelix(front) {
      for (var i = 0; i < CFG.steps; i++) {
        var isFront = sz[i] < 0;
        if (isFront !== front) continue;
        var s = steps[i];
        var depth = ss[i];
        var col = mixColor(s.t);
        var near = front ? 1 : 0.52;   // atrás fica mais apagado: profundidade legível

        // degrau (do eixo para fora)
        ctx.strokeStyle = rgba(col, (0.10 + 0.16 * depth) * near);
        ctx.lineWidth = Math.max(0.6, 1.15 * depth);
        ctx.beginPath();
        ctx.moveTo(ix[i], iy[i]);
        ctx.lineTo(sx[i], sy[i]);
        ctx.stroke();

        // corrimão da espiral
        if (i < CFG.steps - 1 && (sz[i + 1] < 0) === front) {
          ctx.strokeStyle = rgba(col, (0.30 + 0.34 * depth) * near + st.burst * 0.2);
          ctx.lineWidth = Math.max(0.7, 1.5 * depth);
          ctx.beginPath();
          ctx.moveTo(sx[i], sy[i]);
          ctx.lineTo(sx[i + 1], sy[i + 1]);
          ctx.stroke();
        }

        // nó a cada 4 degraus — marca o ritmo da subida
        if (i % 4 === 0) {
          var pulse = 0.5 + 0.5 * Math.sin(st.time * 1.6 - s.t * 5.2);
          ctx.fillStyle = rgba(col, (0.22 + 0.5 * pulse * depth) * near + st.burst * 0.25);
          ctx.beginPath();
          ctx.arc(sx[i], sy[i], (1.0 + 0.9 * pulse) * depth, 0, TAU);
          ctx.fill();
        }
      }
    }

    // Anéis de módulo: acendem em onda de baixo para cima.
    function drawRings(front) {
      for (var k = 0; k < rings.length; k++) {
        var ring = rings[k];
        var col = mixColor(ring.t);
        var e = ring.energy;

        for (var i = 0; i <= CFG.ringSeg; i++) {
          var a = (i / CFG.ringSeg) * TAU + ring.phase - st.spin * 0.35;
          var o = project(Math.cos(a) * ring.r, ring.y, Math.sin(a) * ring.r);
          rx[i] = o[0]; ry[i] = o[1]; rz[i] = o[3]; rs[i] = o[2];
        }

        // traço do anel, segmento a segmento (respeita a profundidade)
        for (var j = 0; j < CFG.ringSeg; j++) {
          if ((rz[j] < 0) !== front) continue;
          var depth = rs[j];
          var near = front ? 1 : 0.5;
          ctx.strokeStyle = rgba(col, (0.10 + 0.20 * depth + e * 0.55) * near);
          ctx.lineWidth = Math.max(0.6, (1.0 + e * 1.6) * depth);
          ctx.beginPath();
          ctx.moveTo(rx[j], ry[j]);
          ctx.lineTo(rx[j + 1], ry[j + 1]);
          ctx.stroke();
        }

        // nós do anel
        for (var n = 0; n < CFG.ringSeg; n += 2) {
          if ((rz[n] < 0) !== front) continue;
          var d = rs[n];
          var nr = front ? 1 : 0.5;
          ctx.fillStyle = rgba(col, (0.20 + 0.35 * d + e * 0.6) * nr);
          ctx.beginPath();
          ctx.arc(rx[n], ry[n], (1.1 + e * 1.8) * d, 0, TAU);
          ctx.fill();
          if (e > 0.15) {
            drawGlow(rx[n], ry[n], (10 + e * 14) * d, ring.t, e * 0.45 * nr);
          }
        }
      }
    }

    // Montantes: os pilares da estrutura, do embasamento ao coroamento.
    function drawPillars(front) {
      for (var k = 0; k < CFG.pillars; k++) {
        var a = (k / CFG.pillars) * TAU + 0.26;
        for (var j = 0; j < CFG.pillarSeg; j++) {
          var t0 = j / CFG.pillarSeg;
          var t1 = (j + 1) / CFG.pillarSeg;
          var y0 = -CFG.height / 2 + t0 * CFG.height;
          var y1 = -CFG.height / 2 + t1 * CFG.height;
          var r0 = radiusAt(t0) * 1.22;
          var r1 = radiusAt(t1) * 1.22;
          var o0 = project(Math.cos(a) * r0, y0, Math.sin(a) * r0);
          var p0x = o0[0], p0y = o0[1], d0 = o0[2], z0 = o0[3];
          var o1 = project(Math.cos(a) * r1, y1, Math.sin(a) * r1);
          if ((z0 < 0) !== front) continue;
          var col = mixColor((t0 + t1) / 2);
          var near = front ? 1 : 0.45;
          // luz percorrendo o montante de baixo para cima
          var travel = ((st.time * 0.22 + k / CFG.pillars) % 1);
          var lit = Math.exp(-Math.pow((travel - t0) * 4.6, 2));
          ctx.strokeStyle = rgba(col, (0.07 + 0.10 * d0 + lit * 0.45 + st.burst * 0.2) * near);
          ctx.lineWidth = Math.max(0.6, (0.9 + lit * 1.4) * d0);
          ctx.beginPath();
          ctx.moveTo(p0x, p0y);
          ctx.lineTo(o1[0], o1[1]);
          ctx.stroke();
        }
      }
    }

    // Coroamento: o nó do topo — o ponto de chegada da formação.
    function drawApex() {
      var o = project(0, CFG.height / 2 + 0.30, 0);
      var beat = 0.5 + 0.5 * Math.sin(st.time * 1.4);
      drawGlow(o[0], o[1], (46 + 14 * beat) * o[2], 1, 0.34 + 0.10 * beat + st.burst * 0.4);
      drawGlow(o[0], o[1], (13 + 4 * beat) * o[2], 1, 0.55 + 0.2 * beat);
      ctx.fillStyle = rgba([210, 255, 235], 0.85);
      ctx.beginPath(); ctx.arc(o[0], o[1], 2.3 * o[2], 0, TAU); ctx.fill();
    }

    // Partículas de conhecimento subindo pela espiral.
    function drawParticles(front) {
      for (var i = 0; i < particles.length; i++) {
        var pa = particles[i];
        var t = pa.t;
        var y = -CFG.height / 2 + t * CFG.height;
        var r = radiusAt(t) * pa.rf;
        var a = pa.a + st.time * pa.w;
        var o = project(Math.cos(a) * r, y, Math.sin(a) * r);
        if ((o[3] < 0) !== front) continue;
        var depth = o[2];
        var col = mixColor(t);
        var fade = Math.min(1, Math.sin(t * Math.PI) * 2.2);
        var al = (front ? 1 : 0.45) * fade;
        drawGlow(o[0], o[1], pa.sz * 8 * depth, t, 0.30 * al * (1 + st.burst));
        ctx.fillStyle = rgba(col, (0.55 + 0.35 * st.burst) * al);
        ctx.beginPath(); ctx.arc(o[0], o[1], pa.sz * 1.15 * depth, 0, TAU); ctx.fill();
      }
    }

    function render() {
      updateRotation();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';  // neon acumula, como luz real
      ctx.lineCap = 'round';

      projectHelix();

      drawMotes();
      drawBase();
      drawPillars(false);
      drawHelix(false);
      drawRings(false);
      drawParticles(false);
      drawAxis(false);
      drawRings(true);
      drawHelix(true);
      drawPillars(true);
      drawParticles(true);
      drawAxis(true);
      drawApex();

      ctx.globalCompositeOperation = 'source-over';
    }

    function step(dt) {
      st.time += dt;
      st.spin += dt * CFG.spin * (1 + st.burst * 1.6);
      st.wave = (st.wave + dt / CFG.waveCycle) % 1;
      st.burst = Math.max(0, st.burst - dt * 0.8);

      // energia dos anéis: onda subindo + realce do campo em foco
      var head = st.wave * 1.35 - 0.12;
      for (var k = 0; k < rings.length; k++) {
        var d = (head - rings[k].t) * 5.4;
        var w = Math.exp(-d * d);
        var focus = st.focusRing === k ? 0.55 : 0;
        rings[k].energy = Math.min(1, w + focus + st.burst * 0.7);
      }

      for (var i = 0; i < particles.length; i++) {
        var pa = particles[i];
        pa.t += dt * pa.spd * (1 + st.burst * 2.2);
        if (pa.t > 1) { pa.t -= 1; pa.a = hash(i + st.time * 13) * TAU; }
      }

      // parallax do ponteiro com amortecimento
      cam.targetYaw += (st.pointerX * 0.30 - cam.targetYaw) * Math.min(1, dt * 3.2);
      cam.targetPitch += (-st.pointerY * 0.16 - cam.targetPitch) * Math.min(1, dt * 3.2);
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      cx = W / 2;
      // A torre vive na metade superior do palco; o bloco de texto ocupa a base.
      // A escala deixa folga acima do coroamento para o halo não ser cortado.
      cy = H * 0.43;
      unit = Math.min(W * 0.82, H * 0.62) * 0.33;
      return true;
    }

    return {
      resize: resize,
      step: step,
      render: render,
      state: st,
      camera: cam
    };
  }

  // =============================================================
  // MONTAGEM / CICLO DE VIDA
  // =============================================================
  function mount(host, opts) {
    opts = opts || {};
    var canvas = host.querySelector('[data-eixo-canvas]');
    if (!canvas) return null;

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var scene = createScene(canvas);
    var raf = 0, last = 0, running = false, disposed = false;

    function frame(now) {
      if (disposed) return;
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      last = now;
      scene.step(dt);
      scene.render();
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || disposed || reduced) return;
      running = true; last = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    if (!scene.resize()) return null;
    // Primeiro quadro: com reduced motion é o único — cena parada, porém completa.
    scene.step(0.5);
    scene.render();

    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () {
        if (scene.resize() && !running) scene.render();
      });
      ro.observe(canvas);
    } else {
      window.addEventListener('resize', function () { if (scene.resize() && !running) scene.render(); });
    }

    function onPointer(e) {
      var rect = host.getBoundingClientRect();
      scene.state.pointerX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      scene.state.pointerY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    }
    var parallaxTarget = opts.pointerTarget || host;
    if (!reduced) parallaxTarget.addEventListener('pointermove', onPointer, { passive: true });

    function onVisibility() {
      if (document.hidden) stop(); else start();
    }
    document.addEventListener('visibilitychange', onVisibility);

    start();

    return {
      focus: function (ringIndex) { scene.state.focusRing = typeof ringIndex === 'number' ? ringIndex : -1; },
      burst: function () { scene.state.burst = 1; },
      destroy: function () {
        disposed = true;
        stop();
        if (ro) ro.disconnect();
        parallaxTarget.removeEventListener('pointermove', onPointer);
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }

  // =============================================================
  // INIT — liga o palco ao formulário de login
  // =============================================================
  function init() {
    var host = document.querySelector('[data-eixo-stage]');
    if (!host) return null;

    var mq = window.matchMedia('(min-width: 1024px)');
    var handle = null;

    function sync() {
      if (mq.matches && !handle) {
        handle = mount(host, { pointerTarget: document.querySelector('.login-shell') || host });
      } else if (!mq.matches && handle) {
        handle.destroy();
        handle = null;
      }
    }
    sync();
    if (mq.addEventListener) mq.addEventListener('change', sync);
    else if (mq.addListener) mq.addListener(sync);

    // Campo em foco acende o anel correspondente; o submit dispara o burst.
    var RING_BY_FIELD = { nome: 0, email: 1, senha: 2 };
    var form = document.querySelector('#login-form');
    if (form) {
      form.addEventListener('focusin', function (e) {
        var idx = RING_BY_FIELD[e.target && e.target.name];
        if (handle) handle.focus(typeof idx === 'number' ? idx : -1);
      });
      form.addEventListener('focusout', function () {
        if (handle) handle.focus(-1);
      });
      form.addEventListener('submit', function () {
        if (handle) handle.burst();
      });
    }

    return { get handle() { return handle; } };
  }

  window.DMC_EixoStage = { init: init, mount: mount };
})();
