// Motor de render procedural das imagens da Central de Parcerias.
// WebGL2: raymarching de SDF (planos, lajes, fachadas) com luz rasante,
// sombra de área estocástica, AO, profundidade de campo e linhas finas
// traçadas em 3D (distância raio–segmento, largura constante em pixels,
// oclusão pela geometria). Acumula N amostras com jitter (AA + DOF +
// penumbra) e termina com tone mapping filmico + grão fino.
// Nada de textura externa: tudo é função de coordenada.
(function () {
  'use strict';

  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  };

  // Câmera: mesma matemática no shader e no JS (projeção para compor).
  function camera(c, w, h) {
    const fw = V.norm(V.sub(c.tgt, c.pos));
    const upW = c.up || [0, 1, 0];
    const rt = V.norm(V.cross(fw, upW));
    const up = V.cross(rt, fw);
    const f = 1 / Math.tan((c.fov * Math.PI / 180) / 2);
    const roll = (c.roll || 0) * Math.PI / 180;
    const shift = c.shift || [0, 0];
    const project = (p) => {
      const d = V.sub(p, c.pos);
      const z = V.dot(d, fw);
      let u = V.dot(d, rt) * f / z - shift[0];
      let v = V.dot(d, up) * f / z - shift[1];
      const cr = Math.cos(-roll), sr = Math.sin(-roll);
      const u2 = cr * u - sr * v, v2 = sr * u + cr * v;
      return { x: u2 * 0.5 * h + 0.5 * w, y: h - (v2 * 0.5 * h + 0.5 * h), z };
    };
    return { pos: c.pos, fw, rt, up, f, roll, shift, project, aperture: c.aperture || 0, focus: c.focus || V.len(V.sub(c.tgt, c.pos)) };
  }

  const HEADER = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform vec2 uRes; uniform vec2 uSub; uniform vec2 uLens; uniform vec2 uSunJ; uniform vec2 uPixJ;
uniform vec3 uCamPos, uCamFw, uCamRt, uCamUp; uniform float uF; uniform vec2 uShift; uniform float uRoll;
uniform float uAperture, uFocus;
uniform vec3 uSunDir, uSunCol; uniform float uSunCone; uniform vec4 uLightPos; uniform float uLightR, uLightD0;
uniform vec3 uAmbTop, uAmbBot, uBgTop, uBgBot, uFogCol; uniform float uFog, uFogH;
uniform float uAoScale, uShK; uniform vec2 uBgRange;
uniform sampler2D uPrev; uniform sampler2D uSeg; uniform int uSegN;
uniform vec3 uInk, uInkDeep;
out vec4 fragColor;
#define PI 3.14159265
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
float sdRBox(vec3 p, vec3 b, float r){ return sdBox(p, b - r) - r; }
vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }
vec2 opU(vec2 a, vec2 b){ return a.x < b.x ? a : b; }
bool gSh = false; // true só no raio de sombra: oclusores fora de quadro
struct Mat { vec3 alb; float rough; float metal; float ink; vec3 nrm; vec3 emit; };
`;

  const CORE = `
vec3 calcNormal(vec3 p, float t){
  float e = max(0.0005, 0.0004 * t);
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy*map(p + k.xyy*e).x + k.yyx*map(p + k.yyx*e).x + k.yxy*map(p + k.yxy*e).x + k.xxx*map(p + k.xxx*e).x);
}
float softShadow(vec3 ro, vec3 rd, float tEnd){
  float res = 1., t = 0.004 * uAoScale, ph = 1e10;
  gSh = true;
  for (int i = 0; i < 160; i++){
    float h = map(ro + rd*t).x;
    float y = h*h/(2.*ph); float d = sqrt(max(h*h - y*y, 0.));
    res = min(res, uShK*d/max(0., t - y)); ph = h;
    t += clamp(h, 0.002 * uAoScale, 0.5 * uAoScale);
    if (res < 0.0005 || t > tEnd) break;
  }
  gSh = false;
  res = clamp(res, 0., 1.); return res*res*(3. - 2.*res);
}
float calcAO(vec3 p, vec3 n){
  float o = 0., s = 1.;
  for (int i = 0; i < 6; i++){ float h = uAoScale * (0.01 + 0.06*float(i)); float d = map(p + n*h).x; o += (h - d)*s; s *= .72; }
  return clamp(1. - 2.2*o/uAoScale, 0., 1.);
}
vec3 env(vec3 r){
  float y = r.y*.5 + .5;
  vec3 c = mix(uAmbBot, uAmbTop, smoothstep(0., 1., y));
  c += uSunCol * 0.010 * pow(max(dot(r, uSunDir), 0.), 6.);
  return c;
}
vec3 background(vec3 rd){
  return mix(uBgBot, uBgTop, smoothstep(uBgRange.x, uBgRange.y, rd.y));
}
vec3 shade(vec3 p, vec3 rd, vec3 n, Mat m, float t, vec3 L, float att, float tEnd){
  vec3 v = -rd;
  vec3 h = normalize(v + L);
  float NdL = max(dot(n, L), 0.), NdV = max(dot(n, v), 1e-3), NdH = max(dot(n, h), 0.), VdH = max(dot(v, h), 0.);
  vec3 F0 = mix(vec3(0.04), m.alb, m.metal);
  vec3 F = F0 + (1. - F0) * pow(1. - VdH, 5.);
  float a = m.rough*m.rough, a2 = a*a;
  float dn = NdH*NdH*(a2 - 1.) + 1.; float D = a2/(PI*dn*dn);
  float k = (m.rough + 1.)*(m.rough + 1.)/8.;
  float G = (NdL/(NdL*(1.-k)+k)) * (NdV/(NdV*(1.-k)+k));
  vec3 spec = D*G*F/max(4.*NdL*NdV, 1e-4);
  vec3 diff = (1. - F)*(1. - m.metal)*m.alb/PI;
  float sh = NdL > 0. ? softShadow(p + n*0.002*uAoScale, L, tEnd) : 0.;
  vec3 col = (diff + spec) * uSunCol * att * PI * NdL * sh;
  float ao = calcAO(p, n);
  vec3 amb = mix(uAmbBot, uAmbTop, n.y*.5 + .5);
  col += (1. - m.metal) * m.alb * amb * ao;
  vec3 r = reflect(rd, n);
  vec3 Fr = F0 + (max(vec3(1. - m.rough), F0) - F0) * pow(1. - NdV, 5.);
  col += env(r) * Fr * ao * (1. - 0.6*m.rough);
  col += m.emit;
  return col;
}
vec3 sunSample(){
  vec3 t1 = normalize(cross(uSunDir, abs(uSunDir.y) < .99 ? vec3(0,1,0) : vec3(1,0,0)));
  vec3 t2 = cross(uSunDir, t1);
  return normalize(uSunDir + (t1*uSunJ.x + t2*uSunJ.y) * tan(uSunCone));
}
vec2 diskOf(vec2 u){ float r = sqrt(u.x), a = 6.2831853*u.y; return r*vec2(cos(a), sin(a)); }
void main(){
  vec2 pr = hash22(gl_FragCoord.xy + uPixJ);
  vec2 sub = fract(uSub + pr);
  vec2 px = floor(gl_FragCoord.xy) + sub;
  vec2 uv = (px - 0.5*uRes)/(0.5*uRes.y);
  float cr = cos(uRoll), sr = sin(uRoll);
  uv = vec2(cr*uv.x - sr*uv.y, sr*uv.x + cr*uv.y) + uShift;
  vec3 rd0 = normalize(uCamFw*uF + uCamRt*uv.x + uCamUp*uv.y);
  vec2 lens = diskOf(fract(uLens + pr.yx));
  vec3 fp = uCamPos + rd0*(uFocus/dot(rd0, uCamFw));
  vec3 ro = uCamPos + (uCamRt*lens.x + uCamUp*lens.y)*uAperture;
  vec3 rd = normalize(fp - ro);
  vec3 L = sunSample();
  float t = 0., tmax = 120.; vec2 hm = vec2(1e9, 0.); bool hit = false;
  for (int i = 0; i < 320; i++){
    hm = map(ro + rd*t);
    if (abs(hm.x) < 0.00025*t + 0.00005){ hit = true; break; }
    t += hm.x*0.85;
    if (t > tmax) break;
  }
  vec3 col; float tHit = hit ? t : 1e9; int inkMode = 0;
  if (hit){
    vec3 p = ro + rd*t;
    vec3 n = calcNormal(p, t);
    Mat m = getMat(hm.y, p, n);
    n = normalize(n + m.nrm);
    float att = 1., tEnd = 80.;
    if (uLightPos.w > .5){
      vec3 ld = normalize(uLightPos.xyz - p);
      vec3 t1 = normalize(cross(ld, vec3(0,1,0))), t2 = cross(ld, t1);
      vec3 lp = uLightPos.xyz + (t1*uSunJ.x + t2*uSunJ.y)*uLightR;
      float dl = length(lp - p); L = (lp - p)/dl; tEnd = dl; att = (uLightD0*uLightD0)/(dl*dl);
    }
    col = shade(p, rd, n, m, t, L, att, tEnd);
    float fogA = exp(-t*uFog) ;
    float hf = exp(-max(p.y, 0.)*uFogH);
    col = mix(uFogCol, col, mix(1., fogA, hf));
    inkMode = m.ink > .5 ? 1 : 0;
  } else {
    col = background(rd);
  }
  // linhas e nós (pixel constante)
  float pixK = 2./(uF*uRes.y);
  for (int i = 0; i < uSegN; i++){
    vec4 A = texelFetch(uSeg, ivec2(0, i), 0);
    vec4 B = texelFetch(uSeg, ivec2(1, i), 0);
    vec4 C = texelFetch(uSeg, ivec2(2, i), 0);
    vec3 a = A.xyz, b = B.xyz; float w = A.w, alpha = B.w; float kind = C.w;
    vec3 ba = b - a, oa = ro - a;
    float baba = dot(ba, ba), s = 0.;
    if (baba > 1e-12){
      float bard = dot(ba, rd), oard = dot(oa, rd), oaba = dot(oa, ba);
      float den = baba - bard*bard;
      s = den > 1e-12 ? clamp((oaba - oard*bard)/den, 0., 1.) : 0.;
      float tt = max(dot(a + s*ba - ro, rd), 0.);
      s = clamp(dot(ro + tt*rd - a, ba)/baba, 0., 1.);
    }
    vec3 q = a + s*ba;
    float tl = max(dot(q - ro, rd), 0.);
    if (tl > tHit*(1. + 0.0002) + 0.0006) continue;
    float z = tl*dot(rd, uCamFw);
    float dpx = length(ro + rd*tl - q)/(z*pixK);
    float cov;
    if (kind < 0.5){ float we = max(w, 1.); cov = clamp(we*.5 - dpx + .5, 0., 1.) * (w/we); }
    else if (kind < 1.5){ cov = clamp(w - dpx + .5, 0., 1.); }
    else if (kind < 2.5){ cov = clamp(.55 - abs(dpx - w) + .5, 0., 1.) * 0.85; }
    else { cov = exp(-dpx*dpx/(w*w)) * 0.5; }
    if (cov <= 0.) continue;
    vec3 lc = C.xyz;
    bool onInk = inkMode == 1 && abs(tl - tHit) < 0.004*tHit + 0.004;
    if (onInk){ col = mix(col, col*uInkDeep, cov*alpha); continue; }
    float fogL = exp(-tl*uFog*0.7);
    if (kind > 2.5) col += lc*cov*alpha*fogL; else col = mix(col, lc*mix(1., fogL, .8), cov*alpha);
  }
  vec3 prev = texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0).rgb;
  fragColor = vec4(prev + col, 1.);
}
`;

  const VS = `#version 300 es
in vec2 aP; void main(){ gl_Position = vec4(aP, 0., 1.); }`;

  const FINAL = `#version 300 es
precision highp float;
uniform sampler2D uAcc; uniform float uN, uExposure, uGrain, uSeed, uLift, uSat, uContrast; uniform vec3 uTint; uniform vec2 uRes;
uniform vec3 uBlack;
out vec4 fragColor;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x + .03))/(x*(2.43*x + .59) + .14), 0., 1.); }
void main(){
  vec3 c = texelFetch(uAcc, ivec2(gl_FragCoord.xy), 0).rgb / uN;
  c *= uExposure * uTint;
  c = aces(c);
  float l = dot(c, vec3(.2126, .7152, .0722));
  c = mix(vec3(l), c, uSat);
  c = pow(c, vec3(1./2.2));
  c = mix(vec3(.5), c, uContrast) + (uContrast - 1.)*0.;
  c = uBlack + (1. - uBlack) * clamp(c, 0., 1.);
  // grão fino: triangular, mais forte nos meios-tons, zero nas altas luzes
  vec2 g = gl_FragCoord.xy + uSeed;
  float n = hash12(g) + hash12(g + 71.3) - 1.;
  float lum = dot(c, vec3(.2126, .7152, .0722));
  c += n * uGrain * (0.35 + 0.65*smoothstep(0.0, 0.25, lum)) * (1. - smoothstep(.6, 1., lum));
  fragColor = vec4(clamp(c, 0., 1.), 1.);
}
`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`);
      const m = /0:(\d+)/.exec(log || '');
      const ctx = m ? lines.slice(Math.max(0, +m[1] - 4), +m[1] + 2).join('\n') : '';
      throw new Error('shader: ' + log + '\n' + ctx);
    }
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aP');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    return p;
  }
  function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }

  async function render(spec) {
    const { w, h } = spec;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    document.body.innerHTML = ''; document.body.appendChild(canvas);
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('sem WebGL2');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('sem EXT_color_buffer_float');
    const cam = camera(spec.cam, w, h);
    const prog = program(gl, VS, HEADER + spec.glsl + CORE);
    const fin = program(gl, VS, FINAL);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const mkTex = (ww, hh, data) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ww, hh, 0, gl.RGBA, gl.FLOAT, data || null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const acc = [mkTex(w, h, new Float32Array(w * h * 4)), mkTex(w, h, new Float32Array(w * h * 4))];
    const fbo = acc.map((t) => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; });
    const segs = spec.segs || [];
    const segN = Math.max(1, segs.length);
    const sd = new Float32Array(3 * segN * 4);
    segs.forEach((s, i) => {
      const o = i * 12;
      sd.set([s.a[0], s.a[1], s.a[2], s.w], o);
      sd.set([s.b[0], s.b[1], s.b[2], s.alpha], o + 4);
      sd.set([s.c[0], s.c[1], s.c[2], s.kind || 0], o + 8);
    });
    const segTex = mkTex(3, segN, sd);

    gl.useProgram(prog);
    const U = (n) => gl.getUniformLocation(prog, n);
    const L = spec.light;
    gl.uniform2f(U('uRes'), w, h);
    gl.uniform3fv(U('uCamPos'), cam.pos); gl.uniform3fv(U('uCamFw'), cam.fw); gl.uniform3fv(U('uCamRt'), cam.rt); gl.uniform3fv(U('uCamUp'), cam.up);
    gl.uniform1f(U('uF'), cam.f); gl.uniform2fv(U('uShift'), cam.shift); gl.uniform1f(U('uRoll'), cam.roll);
    gl.uniform1f(U('uAperture'), cam.aperture); gl.uniform1f(U('uFocus'), cam.focus);
    gl.uniform3fv(U('uSunDir'), V.norm(L.dir)); gl.uniform3fv(U('uSunCol'), L.col); gl.uniform1f(U('uSunCone'), (L.cone || 1.5) * Math.PI / 180);
    gl.uniform4f(U('uLightPos'), ...(L.pos || [0, 0, 0]), L.pos ? 1 : 0); gl.uniform1f(U('uLightR'), L.radius || 0.3); gl.uniform1f(U('uLightD0'), L.d0 || 1);
    gl.uniform3fv(U('uAmbTop'), L.ambTop); gl.uniform3fv(U('uAmbBot'), L.ambBot);
    gl.uniform3fv(U('uBgTop'), L.bgTop); gl.uniform3fv(U('uBgBot'), L.bgBot);
    gl.uniform3fv(U('uFogCol'), L.fogCol || L.bgBot); gl.uniform1f(U('uFog'), L.fog || 0); gl.uniform1f(U('uFogH'), L.fogH || 0);
    gl.uniform1f(U('uAoScale'), spec.aoScale || 1); gl.uniform1f(U('uShK'), L.shK || 48); gl.uniform2fv(U('uBgRange'), L.bgRange || [-0.2, 0.9]);
    gl.uniform3fv(U('uInk'), spec.ink || [1, 1, 1]); gl.uniform3fv(U('uInkDeep'), spec.inkDeep || [0.3, 0.25, 0.15]);
    gl.uniform1i(U('uSegN'), segs.length);
    gl.uniform1i(U('uPrev'), 0); gl.uniform1i(U('uSeg'), 1);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, segTex);

    const N = spec.spp || 32;
    const band = spec.band || 128;
    gl.viewport(0, 0, w, h);
    gl.enable(gl.SCISSOR_TEST);
    let cur = 0;
    const t0 = performance.now();
    for (let k = 0; k < N; k++) {
      const i = k + 1;
      gl.uniform2f(U('uSub'), halton(i, 2), halton(i, 3));
      gl.uniform2f(U('uLens'), halton(i, 5), halton(i, 7));
      const su = halton(i, 11), sv = halton(i, 13);
      const r = Math.sqrt(su), a = 2 * Math.PI * sv;
      gl.uniform2f(U('uSunJ'), r * Math.cos(a), r * Math.sin(a));
      gl.uniform2f(U('uPixJ'), 0, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1 - cur]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, acc[cur]);
      for (let y = 0; y < h; y += band) {
        gl.scissor(0, y, w, Math.min(band, h - y));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.finish();
      }
      cur = 1 - cur;
      if (k % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }
    gl.disable(gl.SCISSOR_TEST);
    const g = spec.grade || {};
    gl.useProgram(fin);
    const F = (n) => gl.getUniformLocation(fin, n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, acc[cur]);
    gl.uniform1i(F('uAcc'), 0);
    gl.uniform1f(F('uN'), N); gl.uniform1f(F('uExposure'), g.exposure || 1);
    gl.uniform1f(F('uGrain'), g.grain == null ? 0.012 : g.grain); gl.uniform1f(F('uSeed'), g.seed || 0);
    gl.uniform1f(F('uSat'), g.sat == null ? 1 : g.sat); gl.uniform1f(F('uContrast'), g.contrast || 1);
    gl.uniform3fv(F('uTint'), g.tint || [1, 1, 1]); gl.uniform3fv(F('uBlack'), g.black || [0, 0, 0]);
    gl.uniform2f(F('uRes'), w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    const ms = performance.now() - t0;
    const url = canvas.toDataURL('image/png');
    return { png: url.slice(url.indexOf(',') + 1), ms: Math.round(ms), segs: segs.length };
  }

  window.DMC_ENGINE = { render, camera, V };
})();
