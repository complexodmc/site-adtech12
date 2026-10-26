// Dez cenas procedurais das verticais de negócio (Three.js r170 + examples/jsm, só no pipeline; vendor em ../midia-home/vendor).
// Helpers e as cenas "construcao", "familias" e "terras" vêm de tools/midia-home/scenes.js (rodada 3) — aqui renomeadas
// para incorporacao / familiasHoldings / agro e ajustadas ao quadro 16:9. As outras sete cenas são novas, na mesma
// linguagem (HOME_REDESIGN §4): grafite/preto #0b0c0e, ouro ≤ 3 %, PBR com texturas procedurais, névoa, DOF, pós comum
// (vinheta, grão, ACES), canto inferior esquerdo e faixa inferior mais escuros; movimento senoidal com período = 6 s.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const C = { black: 0x0b0c0e, gold: 0xd6b069, goldMat: 0xb8975a, key: 0xffc89c };
const TAU = Math.PI * 2;
const DEBUG = new URLSearchParams(location.search).get('debug') || ''; // ex.: ?debug=nokey,nohemi (diagnóstico)
const D2R = THREE.MathUtils.degToRad;

// ---------- utilidades determinísticas ----------
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f + 7.3 * i, y * f - 3.1 * i); a *= 0.5; f *= 2.03; } return s; }
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ---------- texturas procedurais (altura → normal por Sobel, roughness, cor) ----------
// fn(x, y) → altura 0..1 (x, y em 0..1). Retorna { normalMap, roughnessMap, map, aoMap }.
function procMaps(N, fn, { nStrength = 1.0, rBase = 0.78, rVar = 0.12, color = null, colorVar = 0.08, repeat = 1, colorFn = null, roughFn = null } = {}) {
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = fn(x / N, y / N);
  const H = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
  const nc = mk(), rc = mk(), cc = color || colorFn ? mk() : null;
  const nd = nc.getContext('2d').createImageData(N, N), rd = rc.getContext('2d').createImageData(N, N), cd = cc ? cc.getContext('2d').createImageData(N, N) : null;
  const col = color ? new THREE.Color(color) : null;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, o = i * 4;
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    const nx = -dx * nStrength * 6, ny = -dy * nStrength * 6, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nd.data[o] = 128 + 127 * nx / l; nd.data[o + 1] = 128 + 127 * ny / l; nd.data[o + 2] = 128 + 127 * nz / l; nd.data[o + 3] = 255;
    const r = roughFn ? roughFn(x / N, y / N, h[i]) : clamp01(rBase + (h[i] - 0.5) * 2 * rVar);
    rd.data[o] = rd.data[o + 1] = rd.data[o + 2] = Math.round(r * 255); rd.data[o + 3] = 255;
    if (cd) {
      let cr, cg, cb;
      if (colorFn) { const c = colorFn(x / N, y / N, h[i]); cr = c[0]; cg = c[1]; cb = c[2]; } else { const m = 1 + (h[i] - 0.5) * 2 * colorVar; cr = col.r * m; cg = col.g * m; cb = col.b * m; }
      cd.data[o] = clamp01(cr) * 255; cd.data[o + 1] = clamp01(cg) * 255; cd.data[o + 2] = clamp01(cb) * 255; cd.data[o + 3] = 255;
    }
  }
  nc.getContext('2d').putImageData(nd, 0, 0); rc.getContext('2d').putImageData(rd, 0, 0); if (cd) cc.getContext('2d').putImageData(cd, 0, 0);
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { normalMap: tex(nc), roughnessMap: tex(rc), map: cc ? tex(cc, true) : null };
}
// ruído genérico 2 oitavas (concreto / pedra / terra)
const noiseMaps = (N, scale, opts) => procMaps(N, (x, y) => fbm(x * scale, y * scale, opts?.oct || 2), opts);

// ---------- materiais ----------
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
const phys = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0, ...o });
const GOLD = (o = {}) => new THREE.MeshPhysicalMaterial({ color: C.goldMat, roughness: 0.35, metalness: 1, envMapIntensity: 1.2, ...o });
const withMaps = (mat, maps, { normalScale = 1, mapAlso = false } = {}) => { mat.normalMap = maps.normalMap; mat.normalScale = new THREE.Vector2(normalScale, normalScale); mat.roughnessMap = maps.roughnessMap; if (mapAlso && maps.map) mat.map = maps.map; return mat; };

const geoCache = new Map();
function rboxGeo(w, h, d, r = 0.03) { const k = `${w}|${h}|${d}|${r}`; if (!geoCache.has(k)) geoCache.set(k, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2.2))); return geoCache.get(k); }
function rbox(w, h, d, mat, x = 0, y = 0, z = 0, r = 0.03, cast = true) {
  const m = new THREE.Mesh(rboxGeo(w, h, d, r), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; return m;
}
function box(w, h, d, mat, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; return m;
}
// tubos (cilindros) por segmentos [ax,ay,az,bx,by,bz] em um único InstancedMesh
function tubes(segs, r, mat, cast = true) {
  const g = new THREE.CylinderGeometry(r, r, 1, 6, 1);
  const im = new THREE.InstancedMesh(g, mat, segs.length);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), p = new THREE.Vector3(), s = new THREE.Vector3();
  segs.forEach((sg, i) => { a.set(sg[0], sg[1], sg[2]); b.set(sg[3], sg[4], sg[5]); d.subVectors(b, a); const L = d.length() || 1e-4; p.addVectors(a, b).multiplyScalar(0.5); q.setFromUnitVectors(up, d.normalize()); s.set(1, L, 1); M.compose(p, q, s); im.setMatrixAt(i, M); });
  im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false; return im;
}
// instâncias de uma geometria por lista de {p:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz]}
function instances(geo, mat, list, cast = true) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  list.forEach((it, i) => { p.set(...it.p); e.set(...(it.r || [0, 0, 0])); q.setFromEuler(e); s.set(...(it.s || [1, 1, 1])); M.compose(p, q, s); im.setMatrixAt(i, M); });
  im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false; return im;
}

// ---------- câmera por distância focal (hfov constante; vfov pelo aspecto) ----------
function camera(mm, aspect, near = 0.5, far = 500) {
  const hfov = 2 * Math.atan(18 / mm);
  const vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
  return new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(vfov), aspect, near, far);
}
function aim(cam, pos, pitchDeg, yawDeg = 0) { if (DEBUG.includes('up')) pitchDeg -= 15; cam.position.set(...pos); cam.rotation.order = 'YXZ'; cam.rotation.set(-D2R(pitchDeg), D2R(yawDeg), 0); }

// ---------- ambiente / céu / luzes / névoa ----------
let renderer, pmrem, roomEnv = null;
function envRoom(scene, intensity) {
  if (!roomEnv) roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = roomEnv; scene.environmentIntensity = DEBUG.includes('noenv') ? 0 : intensity;
}
// PMREM de um gradiente de céu (para exteriores): esfera com shader, BackSide
function gradientSphere(top, horizon, below, { haze = 0.0, hazeCol = horizon, R = 450, spread = 0.5 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(top) }, hor: { value: new THREE.Color(horizon) }, bel: { value: new THREE.Color(below) }, hz: { value: new THREE.Color(hazeCol) }, haze: { value: haze }, spread: { value: spread } },
    vertexShader: `varying vec3 vD; void main(){ vD = (modelMatrix * vec4(position,1.)).xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform vec3 top, hor, bel, hz; uniform float haze, spread; varying vec3 vD;
      void main(){ float y = normalize(vD).y; vec3 c = y >= 0.0 ? mix(hor, top, pow(smoothstep(0.0, spread, y), 0.75)) : mix(hor, bel, smoothstep(0.0, -0.25, y));
        c = mix(c, hz, haze * exp(-abs(y) * 22.0)); gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16), m); s.renderOrder = -10; s.frustumCulled = false; return s;
}
function envGradient(scene, top, horizon, below, intensity) {
  const s = new THREE.Scene(); s.add(gradientSphere(top, horizon, below, { R: 50 }));
  scene.environment = pmrem.fromScene(s, 0.02).texture; scene.environmentIntensity = intensity;
}
// ambiente de estúdio para interiores: faixa quente no teto + janela fria lateral (reflexos com contraste)
function envStudio(scene, intensity) {
  const s = new THREE.Scene(); s.background = new THREE.Color(0x050506);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(14, 2), new THREE.MeshBasicMaterial({ color: 0xffd9b0, side: THREE.DoubleSide })); strip.position.set(0, 8, 0); strip.rotation.x = Math.PI / 2; s.add(strip);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(6, 10), new THREE.MeshBasicMaterial({ color: 0x3e4a58, side: THREE.DoubleSide })); win.position.set(-14, 5, 2); win.rotation.y = Math.PI / 2; s.add(win);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x1c1c20, side: THREE.DoubleSide })); fl.rotation.x = -Math.PI / 2; fl.position.y = -3; s.add(fl);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x6a6c72, side: THREE.DoubleSide })); ceil.rotation.x = Math.PI / 2; ceil.position.y = 9; s.add(ceil);
  scene.environment = pmrem.fromScene(s, 0.03).texture; scene.environmentIntensity = intensity;
}
function keyLight(scene, { color = C.key, intensity = 3, pos, target = [0, 0, 0], size = 30, map = 4096, radius = 6, bias = -0.0004, normalBias = 0.03, far = 120 }) {
  const k = new THREE.DirectionalLight(color, DEBUG.includes('nokey') ? 0 : intensity);
  k.position.set(...pos); k.target.position.set(...target); scene.add(k.target);
  k.castShadow = true; k.shadow.mapSize.set(map, map); k.shadow.bias = bias; k.shadow.normalBias = normalBias; k.shadow.radius = radius; k.shadow.blurSamples = 12;
  const sc = k.shadow.camera; sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size; sc.near = 1; sc.far = far;
  scene.add(k); return k;
}
const hemi = (scene, sky, ground, i) => { const h = new THREE.HemisphereLight(sky, ground, DEBUG.includes('nohemi') ? 0 : i); scene.add(h); return h; };
// névoa baixa: planos verticais voltados à câmera com alpha fbm
let mistTex = null;
function mist(scene, { w = 60, h = 8, y = 0.8, z = 0, x = 0, opacity = 0.18, color = 0x3a3d44 } = {}) {
  if (!mistTex) {
    const N = 512, c = document.createElement('canvas'); c.width = N; c.height = N / 4; const ctx = c.getContext('2d'); const id = ctx.createImageData(N, N / 4);
    for (let y2 = 0; y2 < N / 4; y2++) for (let x2 = 0; x2 < N; x2++) { const o = (y2 * N + x2) * 4; const v = fbm(x2 / N * 6, y2 / N * 6 * 4, 4); const edge = Math.sin(Math.PI * x2 / N) * Math.pow(1 - y2 / (N / 4), 1.6) * Math.min(1, y2 / 12); id.data[o] = id.data[o + 1] = id.data[o + 2] = 255; id.data[o + 3] = clamp01((v - 0.25) * 1.6) * edge * 255; }
    ctx.putImageData(id, 0, 0); mistTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: mistTex, alphaMap: mistTex, color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(x, y + h / 2, z); m.renderOrder = 5; scene.add(m); return m;
}


// ---------- helpers da rodada 2 ----------
// domo de céu: gradiente + névoa de horizonte + nuvens fbm (shader) + brilho suave do sol (sem lens-flare)
const SKY_FBM = `
  float hsh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 7.3; a *= .5; } return s; }`;
function skyDome(top, horizon, below, { haze = 0.3, hazeCol = horizon, R = 450, spread = 0.5, clouds = 0, cloudCol = 0x3a2e24, sunDir = [0, 0.1, -1], sunCol = 0xffb677, sunGlow = 0, bands = 0, coldBand = 0, coldCol = 0x2a2d33 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(top) }, hor: { value: new THREE.Color(horizon) }, bel: { value: new THREE.Color(below) }, hz: { value: new THREE.Color(hazeCol) }, haze: { value: haze }, spread: { value: spread },
      clouds: { value: clouds }, ccol: { value: new THREE.Color(cloudCol) }, off: { value: 0 }, sun: { value: new THREE.Vector3(...sunDir).normalize() }, scol: { value: new THREE.Color(sunCol) }, glow: { value: sunGlow }, bands: { value: bands }, cold: { value: coldBand }, ccold: { value: new THREE.Color(coldCol) } },
    vertexShader: `varying vec3 vD; void main(){ vD = (modelMatrix * vec4(position,1.)).xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform vec3 top, hor, bel, hz, ccol, sun, scol, ccold; uniform float haze, spread, clouds, off, glow, bands, cold; varying vec3 vD; ${SKY_FBM}
      void main(){ vec3 d = normalize(vD); float y = d.y;
        vec3 c = y >= 0.0 ? mix(hor, top, pow(smoothstep(0.0, spread, y), 0.75)) : mix(hor, bel, smoothstep(0.0, -0.25, y));
        c = mix(c, hz, haze * exp(-abs(y) * 22.0));
        if (cold > 0.0) c = mix(c, ccold, cold * smoothstep(0.015, 0.06, y) * (1.0 - smoothstep(0.09, 0.22, y)));
        if (clouds > 0.0 && y > 0.01) { vec2 p = bands > 0.0 ? vec2(atan(d.x, d.z) * 3.0 * bands + off, y * 60.0 * bands) : d.xz / (y + 0.08) * 1.6 + vec2(off, 0.0);
          float n = fbm(p) * 0.6 + fbm(p * 3.1 + 11.0) * 0.4;
          float k = smoothstep(0.48, 0.78, n) * clouds * smoothstep(0.01, 0.12, y) * (1.0 - smoothstep(0.3, 0.9, y)); c = mix(c, ccol, k); }
        float cs = max(dot(d, sun), 0.0); c += scol * glow * (pow(cs, 60.0) * 0.6 + pow(cs, 8.0) * 0.25);
        gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 24), m); s.renderOrder = -10; s.frustumCulled = false; return s;
}
// concreto aparente: fbm + manchas de cura (escurecimento) + tábuas de forma (sulcos horizontais) + furos de ancoragem
function concreteMaps(N, { color = 0x6a6660, dark = 0.2, boards = 0, ties = 0, rBase = 0.85, rVar = 0.08, repeat = 1, scale = 6, nStrength = 0.8 } = {}) {
  const col = new THREE.Color(color);
  return procMaps(N, (x, y) => {
    let v = fbm(x * scale, y * scale, 4) * 0.5 + fbm(x * scale * 7, y * scale * 7, 2) * 0.12 + 0.2;
    if (boards) { const fy = (y * boards) % 1; v -= 0.35 * Math.exp(-Math.pow((fy - 0.5) / 0.035, 2)); v += (hash2(Math.floor(y * boards), 3) - 0.5) * 0.08; }
    if (ties) { const fx = (x * ties) % 1, fy = (y * ties) % 1; const d = Math.hypot(fx - 0.5, fy - 0.5); v -= 0.5 * (1 - clamp01((d - 0.012) / 0.008)); }
    return clamp01(v);
  }, {
    nStrength, rBase, rVar, repeat,
    colorFn: (x, y, hv) => { const st = 1 - dark * fbm(x * 2.5 + 3, y * 2.5, 3) - 0.08 * fbm(x * 30, y * 1.5, 2) + 0.06 * (hv - 0.5); return [col.r * st, col.g * st, col.b * st]; },
  });
}
// feixe de luz (plano com alpha fbm alinhado à direção da luz, normal voltada à câmera)
let rayTex = null;
function beamPlane(scene, { w = 3, h = 14, pos, dir, camPos, color = 0xffc89c, opacity = 0.08 }) {
  if (!rayTex) {
    const W = 256, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d'); const id = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, u = x / W, v = y / H; const a = Math.pow(Math.sin(Math.PI * u), 1.6) * (0.3 + 0.7 * fbm(u * 5, v * 1.2, 3)) * Math.pow(Math.sin(Math.PI * v), 0.7); id.data[o] = id.data[o + 1] = id.data[o + 2] = 255; id.data[o + 3] = clamp01(a) * 255; }
    ctx.putImageData(id, 0, 0); rayTex = new THREE.CanvasTexture(c);
  }
  const yA = new THREE.Vector3(...dir).normalize().negate();
  const toCam = new THREE.Vector3(...camPos).sub(new THREE.Vector3(...pos)).normalize();
  const zA = toCam.clone().sub(yA.clone().multiplyScalar(toCam.dot(yA))).normalize();
  const xA = new THREE.Vector3().crossVectors(yA, zA).normalize();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: rayTex, color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  m.matrixAutoUpdate = false; m.matrix.makeBasis(xA, yA, zA).setPosition(new THREE.Vector3(...pos)); m.renderOrder = 6; scene.add(m); return m;
}
// poeira em suspensão (pontos de 2 px, alpha .3) com deriva periódica
function dust(scene, { n = 200, at = [0, 4, -4], box = [4, 7, 4], color = 0xffd9b0, opacity = 0.3, size = 2, seed = 99 }) {
  const r = rng(seed), base = new Float32Array(n * 3), ph = new Float32Array(n * 3), pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) { base[i] = at[i % 3] + (r() - 0.5) * box[i % 3]; ph[i] = r() * TAU; }
  const g = new THREE.BufferGeometry(); const attr = new THREE.BufferAttribute(pos, 3); g.setAttribute('position', attr);
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity, depthWrite: false })); pts.frustumCulled = false; pts.renderOrder = 7; scene.add(pts);
  return (t) => { for (let i = 0; i < n * 3; i++) { const k = i % 3 === 1 ? 1 : 2; pos[i] = base[i] + 0.22 * Math.sin(t * TAU * k + ph[i]) + 0.08 * Math.sin(t * TAU * 3 + ph[i] * 1.7); } attr.needsUpdate = true; };
}
// tela de proteção de obra (grade fina com alpha)
let netTex = null;
function netMat() {
  if (!netTex) { const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const ctx = c.getContext('2d'); ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.clearRect(0, 0, N, N); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; for (let i = 0; i < N; i += 4) { ctx.beginPath(); ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, N); ctx.moveTo(0, i + 0.5); ctx.lineTo(N, i + 0.5); ctx.stroke(); } netTex = new THREE.CanvasTexture(c); netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; netTex.repeat.set(6, 2); netTex.anisotropy = 8; }
  return new THREE.MeshStandardMaterial({ color: 0x33322e, roughness: 0.9, alphaMap: netTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
}
// cabo em 2 px (LineMaterial), resolução atualizada por quadro
const lineMats = [];
function line2(scene, pts, { color = 0x2a2a2c, width = 2, opacity = 1 } = {}) {
  const g = new LineSegmentsGeometry(); g.setPositions(pts.flat());
  const m = new LineMaterial({ color, linewidth: width, worldUnits: false, transparent: opacity < 1, opacity, fog: true }); lineMats.push(m);
  const l = new LineSegments2(g, m); l.computeLineDistances(); l.frustumCulled = false; scene.add(l); return l;
}


// ---------- helpers da rodada 3 ----------
// halo de lâmpada (sprite com gradiente radial, aditivo) — substitui o "flare em linha" dos postes
let haloTex = null;
function halo(scene, pos, { color = 0xffd3a0, size = 1.2, opacity = 0.5 } = {}) {
  if (!haloTex) { const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const ctx = c.getContext('2d'); const g = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,0.55)'); g.addColorStop(0.4, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, N, N); haloTex = new THREE.CanvasTexture(c); }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true })); sp.position.set(...pos); sp.scale.set(size, size, 1); sp.renderOrder = 8; scene.add(sp); return sp;
}
// PMREM a partir do próprio domo de céu (parâmetros do skyDome) — o vidro reflete a faixa quente do céu
function envFromSky(scene, top, horizon, below, opts, intensity) {
  const s = new THREE.Scene(); s.add(skyDome(top, horizon, below, { ...opts, R: 50 }));
  scene.environment = pmrem.fromScene(s, 0.02).texture; scene.environmentIntensity = DEBUG.includes('noenv') ? 0 : intensity;
}
// normal de detalhe (2.ª escala) somada à normal base — onBeforeCompile, sem segundo material
function detailNormal(mat, tex, repeat, strength) {
  mat.onBeforeCompile = ((prev) => (sh) => {
    prev?.(sh);
    sh.uniforms.uDetail = { value: tex }; sh.uniforms.uDetailRep = { value: repeat }; sh.uniforms.uDetailStr = { value: strength };
    sh.fragmentShader = 'uniform sampler2D uDetail; uniform float uDetailRep, uDetailStr;\n' + sh.fragmentShader.replace(
      'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
      'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0; vec3 dN = texture2D( uDetail, vNormalMapUv * uDetailRep ).xyz * 2.0 - 1.0; mapN.xy += dN.xy * uDetailStr;');
  })(mat.onBeforeCompile);
  mat.customProgramCacheKey = () => 'detail' + repeat + strength;
  return mat;
}
// copa de árvore em billboard: silhueta fbm com alpha, 2 variantes (cor + alpha num só canvas)
function crownTex(seed) {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const ctx = c.getContext('2d'); const id = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = (y * N + x) * 4, u = x / N - 0.5, v = 1 - y / N; // v: 0 base, 1 topo
    const rr = Math.hypot(u * 1.15, (v - 0.52) * 1.0);
    const edge = fbm(u * 7 + seed * 3.3, v * 7 - seed, 4) - 0.5;
    const shape = 0.44 + edge * 0.26 - Math.max(0, v - 0.85) * 1.2 - Math.max(0, 0.2 - v) * 1.6 * (Math.abs(u) > 0.06 ? 1 : 0.2);
    const a = clamp01((shape - rr) / 0.035);
    const holes = fbm(u * 22 + seed, v * 22 + 5, 3); const a2 = a * (holes > 0.3 ? 1 : 0.35);
    const shade = 0.55 + 0.45 * clamp01((v - 0.2) * 1.4) + (fbm(u * 30, v * 30 + seed, 2) - 0.5) * 0.3; // topo mais claro
    id.data[o] = 0x3a * shade; id.data[o + 1] = 0x44 * shade; id.data[o + 2] = 0x28 * shade; id.data[o + 3] = a2 * 255;
  }
  ctx.putImageData(id, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// faixa de luz interna que "varre" um pavimento (plano aditivo com alpha em gradiente, rente ao vidro)
let bandTex = null;
function lightBand(scene, { w = 5, h = 2.4, color = 0xffc48a, opacity = 0.35 } = {}) {
  if (!bandTex) { const W = 256, H = 32, c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d'); const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, 'rgba(255,255,255,1)'); g.addColorStop(0.65, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); const g2 = ctx.createLinearGradient(0, 0, 0, H); g2.addColorStop(0, 'rgba(0,0,0,0.6)'); g2.addColorStop(0.3, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.5)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H); bandTex = new THREE.CanvasTexture(c); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: bandTex, alphaMap: bandTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })); m.renderOrder = 4; scene.add(m); return m;
}

// =====================================================================
// 1 · CONSTRUÇÃO — canteiro ao entardecer: laje-herói em execução (terço direito), grua, fundo em silhueta
// =====================================================================
function incorporacao(scene, aspect) {
  // Rodada 3: temperaturas separadas (fundo/céu/névoa em grafite neutro-frio; 3200 K só no herói e no topo da laje),
  // sombras só da geometria (sol neutro lateral → sombra longa da torre da grua sobre o pátio; sem gobo), câmera
  // 1,5 u mais alta com horizonte ≈ 30 %, chão com sulcos ×2 + poças, escoras com base/cabeçote, pilares 0,5 u com
  // junta de concretagem, nuvem rasante, postes só com halo, gancho retirado (lança gira 3°, trolley desce 0,3 u).
  const cam = camera(38, aspect, 1, 600);
  scene.fog = new THREE.FogExp2(0x2d2c2b, 0.0125);
  const sunDir = [-0.86, 0.33, 0.16];
  const dome = skyDome(0x1d1c1b, 0x3a3734, 0x242321, { haze: 0.35, hazeCol: 0x333130, spread: 0.45, sunDir, sunGlow: 0.12, sunCol: 0xd9b48c, clouds: 0.85, cloudCol: 0x5c5753, bands: 1 });
  scene.add(dome);
  envGradient(scene, 0x3a3f48, 0x4a4238, 0x1a1816, 0.5); // PMREM: topo frio, horizonte levemente quente → separa herói quente do fundo
  // sol neutro-frio e lateral (≈ 18°, da esquerda): a única fonte de sombra do pátio — a torre da grua projeta sombra longa à direita
  keyLight(scene, { color: 0xd3d6da, intensity: 4.5, pos: [-80, 30, 14], target: [0, 4, -4], size: 70, radius: 2, far: 260, normalBias: 0.05 });
  hemi(scene, 0x464c56, 0x16150f, 1.6);
  // key 3200 K fechada no herói (cone 13°) — a única luz quente forte da cena
  const heroKey = new THREE.SpotLight(0xffc89c, DEBUG.includes('nokey') ? 0 : 2600, 90, D2R(13), 0.6, 2); heroKey.position.set(-12, 28, 24); heroKey.target.position.set(5.5, 9.6, -2); scene.add(heroKey.target, heroKey);
  heroKey.castShadow = true; heroKey.shadow.mapSize.set(2048, 2048); heroKey.shadow.radius = 3; heroKey.shadow.blurSamples = 10; heroKey.shadow.bias = -0.0003; heroKey.shadow.normalBias = 0.04; heroKey.shadow.camera.near = 8; heroKey.shadow.camera.far = 90;
  RectAreaLightUniformsLib.init();
  const goldWash = new THREE.RectAreaLight(C.gold, 8, 9, 7); goldWash.position.set(5.5, 17.5, -2); goldWash.lookAt(5.5, 9.6, -2); scene.add(goldWash); // lava o topo da laje (1–2 % de reflexo quente)

  // materiais
  const cMaps = concreteMaps(1024, { color: 0x6a6660, dark: 0.2, boards: 10, ties: 0, rBase: 0.85, rVar: 0.06, repeat: 2 });
  const concrete = withMaps(std(0xffffff, { roughness: 0.85 }), cMaps, { normalScale: 0.7, mapAlso: true });
  const colMaps = concreteMaps(512, { color: 0x66625c, dark: 0.18, boards: 2, ties: 0, rBase: 0.85, rVar: 0.06, repeat: 1, scale: 5, nStrength: 1.4 }); // junta de concretagem a meia altura do pilar
  const concreteCol = withMaps(std(0xffffff, { roughness: 0.85 }), colMaps, { normalScale: 1.0, mapAlso: true });
  const cMapsB = concreteMaps(512, { color: 0x5c5853, dark: 0.22, boards: 0, rBase: 0.88, repeat: 3, scale: 4 });
  const concreteB = withMaps(std(0xffffff, { roughness: 0.88 }), cMapsB, { normalScale: 0.6, mapAlso: true });
  const steel = std(0x5b5e63, { roughness: 0.35, metalness: 0.9 });
  const steelDark = std(0x3e4045, { roughness: 0.4, metalness: 0.9 });
  const wMaps = concreteMaps(512, { color: 0x5a4634, dark: 0.18, boards: 8, rBase: 0.8, rVar: 0.06, repeat: 2, scale: 3 });
  const wood = withMaps(std(0xffffff, { roughness: 0.8 }), wMaps, { normalScale: 0.5, mapAlso: true });
  const rebar = std(0x4a4038, { roughness: 0.6, metalness: 0.7 });
  const cacamba = std(0x3a3230, { roughness: 0.6, metalness: 0.5 });
  const r = rng(11);

  // chão: 2 sulcos de pneu em curva (normal ×2) + roughness procedural em 2 oitavas (molhado nas baixadas) + brita; albedo neutro
  const GS = 120; const rutU = (v) => 0.515 + 0.07 * Math.sin((v - 0.5) * 4.2) + 0.02 * Math.sin((v - 0.5) * 11);
  const gMaps = procMaps(2048, (x, y) => {
    const base = 0.5 + fbm(x * 90, y * 90, 2) * 0.16 + (fbm(x * 10, y * 10, 3) - 0.5) * 0.14;
    const cx = rutU(y), hw = 0.9 / GS; let rut = 0;
    for (const sgn of [-1, 1]) { const dd = (x - (cx + sgn * hw)) / (0.25 / GS); rut += Math.exp(-dd * dd); }
    return clamp01(base - 0.4 * rut + 0.08 * rut * fbm(x * 400, y * 60, 2));
  }, { nStrength: 4.4, rBase: 0.92, rVar: 0.04, color: 0x5e5b57, colorVar: 0.06, repeat: 1, roughFn: (x, y, hv) => clamp01(0.94 - 0.22 * fbm(x * 9 + 1, y * 9, 2) - 0.12 * fbm(x * 70, y * 70, 2) + (hv - 0.5) * 0.1 - (hv < 0.3 ? 0.3 : 0)) });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GS, GS), withMaps(std(0xffffff, { roughness: 1 }), gMaps, { normalScale: 1.0, mapAlso: true })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), std(0x403e3b, { roughness: 0.95 })); far.rotation.x = -Math.PI / 2; far.position.y = -0.02; far.receiveShadow = true; scene.add(far);
  // poças nos sulcos (MeshPhysical roughness .05) refletindo céu/key
  const puddle = phys(0x1a1c20, { roughness: 0.04, metalness: 0, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.02 });
  const rutWorld = (z, sgn) => { const v = 0.5 - z / GS; return [(rutU(v) + sgn * 0.9 / GS - 0.5) * GS, z]; };
  for (const [z, sgn, sx, sz] of [[16.5, -1, 1.9, 0.55], [13.0, 1, 1.5, 0.5], [9.5, -1, 1.2, 0.4], [20.5, 1, 2.3, 0.6]]) { const [px, pz] = rutWorld(z, sgn); const p = new THREE.Mesh(new THREE.CircleGeometry(1, 28), puddle); p.rotation.x = -Math.PI / 2; p.scale.set(sx, sz, 1); p.position.set(px, 0.012, pz); p.receiveShadow = true; scene.add(p); }

  // prédio-herói: 3 pavimentos (3,2 u), vão 5 u, laje de topo EM EXECUÇÃO (formas de madeira, armadura, escoras)
  const FH = 3.2, T = 0.28;
  const hero = { x: 5.5, z: -2, w: 10, d: 8, n: 3 };
  const grp = new THREE.Group(); grp.position.set(hero.x, 0, hero.z); grp.rotation.y = 0.05; scene.add(grp);
  const cols = (w, d, bay) => { const nx = Math.max(2, Math.round(w / bay) + 1), nz = Math.max(2, Math.round(d / bay) + 1), out = []; for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) out.push([-w / 2 + 0.3 + ix * (w - 0.6) / (nx - 1), -d / 2 + 0.3 + iz * (d - 0.6) / (nz - 1)]); return out; };
  const heroCols = cols(hero.w, hero.d, 5);
  for (let i = 0; i < hero.n; i++) {
    const y = i * FH;
    for (const [px, pz] of heroCols) grp.add(rbox(0.5, FH, 0.5, concreteCol, px, y + FH / 2, pz, 0.02)); // seção 0,5 u
    if (i > 0) { grp.add(rbox(hero.w, T, hero.d, concrete, 0, y - T / 2, 0, 0.02)); for (const [a, b, c, d2, e] of [[hero.w, 0.5, 0.2, 0, hero.d / 2 - 0.1], [hero.w, 0.5, 0.2, 0, -hero.d / 2 + 0.1], [0.2, 0.5, hero.d, hero.w / 2 - 0.1, 0], [0.2, 0.5, hero.d, -hero.w / 2 + 0.1, 0]]) grp.add(rbox(a, b, c, concreteB, d2, y - T - 0.25, e, 0.02)); }
  }
  const topY = hero.n * FH;
  // forma da laje (painéis 0,06) + tábuas de borda 0,05 u × 0,55 + escoras metálicas com base/cabeçote + travamento em X
  grp.add(rbox(hero.w + 0.1, 0.06, hero.d + 0.1, wood, 0, topY - 0.03, 0, 0.005));
  for (const [a, b, c, d2, e] of [[hero.w + 0.1, 0.55, 0.05, 0, hero.d / 2 + 0.05], [hero.w + 0.1, 0.55, 0.05, 0, -hero.d / 2 - 0.05], [0.05, 0.55, hero.d + 0.1, hero.w / 2 + 0.05, 0], [0.05, 0.55, hero.d + 0.1, -hero.w / 2 - 0.05, 0]]) grp.add(rbox(a, b, c, wood, d2, topY - 0.2, e, 0.005));
  for (const [a, c, d2, e] of [[hero.w + 0.1, 0.05, 0, hero.d / 2 + 0.08], [hero.w + 0.1, 0.05, 0, -hero.d / 2 - 0.08]]) grp.add(rbox(a, 0.08, c, wood, d2, topY - 0.5, e, 0.005)); // sarrafo de travamento da borda
  const props = [], beams = [], plates = [], braces = [];
  const PX = [], PZ = []; for (let ix = 0; ix < 6; ix++) PX.push(-hero.w / 2 + 0.8 + ix * 1.7); for (let iz = 0; iz < 5; iz++) PZ.push(-hero.d / 2 + 0.7 + iz * 1.65);
  for (const px of PX) for (const pz of PZ) { props.push([px, topY - FH + 0.03, pz, px, topY - 0.14, pz]); plates.push({ p: [px, topY - FH + 0.045, pz], s: [0.24, 0.03, 0.24] }, { p: [px, topY - 0.16, pz], s: [0.18, 0.03, 0.18] }, { p: [px, topY - 0.11, pz], s: [0.06, 0.08, 0.2] }); }
  for (const pz of PZ) beams.push({ p: [0, topY - 0.1, pz], s: [hero.w, 0.08, 0.08] });
  for (let ix = 0; ix < PX.length - 1; ix += 2) for (const pz of [PZ[0], PZ[4]]) braces.push([PX[ix], topY - FH + 0.4, pz, PX[ix + 1], topY - 0.6, pz], [PX[ix + 1], topY - FH + 0.4, pz, PX[ix], topY - 0.6, pz]);
  for (let iz = 0; iz < PZ.length - 1; iz += 2) for (const px of [PX[0]]) braces.push([px, topY - FH + 0.4, PZ[iz], px, topY - 0.6, PZ[iz + 1]], [px, topY - FH + 0.4, PZ[iz + 1], px, topY - 0.6, PZ[iz]]);
  grp.add(tubes(props, 0.04, steelDark)); grp.add(tubes(braces, 0.02, steelDark, false)); grp.add(instances(new THREE.BoxGeometry(1, 1, 1), wood, beams)); grp.add(instances(new THREE.BoxGeometry(1, 1, 1), steelDark, plates));
  // armadura da laje: malha de vergalhões 0,22 u em duas camadas + arranques nos pilares
  const bars = [];
  for (let x = -hero.w / 2 + 0.3; x <= hero.w / 2 - 0.3; x += 0.22) bars.push([x, topY + 0.03, -hero.d / 2 + 0.25, x, topY + 0.03, hero.d / 2 - 0.25]);
  for (let z = -hero.d / 2 + 0.25; z <= hero.d / 2 - 0.25; z += 0.22) bars.push([-hero.w / 2 + 0.3, topY + 0.055, z, hero.w / 2 - 0.3, topY + 0.055, z]);
  for (const [px, pz] of heroCols) for (const [ox, oz] of [[-0.15, -0.15], [0.15, -0.15], [0.15, 0.15], [-0.15, 0.15]]) bars.push([px + ox, topY, pz + oz, px + ox + (r() - 0.5) * 0.06, topY + 0.9 + r() * 0.3, pz + oz + (r() - 0.5) * 0.06]);
  grp.add(tubes(bars, 0.011, rebar, false));
  // guarda-corpo 1,1 u (montantes a cada 1,5 u, 2 travessas, rodapé de madeira 0,15)
  const gc = [], toe = [];
  const per = [[-hero.w / 2, -hero.d / 2, hero.w / 2, -hero.d / 2], [hero.w / 2, -hero.d / 2, hero.w / 2, hero.d / 2], [hero.w / 2, hero.d / 2, -hero.w / 2, hero.d / 2], [-hero.w / 2, hero.d / 2, -hero.w / 2, -hero.d / 2]];
  for (const [x0, z0, x1, z1] of per) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 1.5);
    for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n; gc.push([x, topY, z, x, topY + 1.1, z]); }
    gc.push([x0, topY + 1.1, z0, x1, topY + 1.1, z1], [x0, topY + 0.6, z0, x1, topY + 0.6, z1]);
    toe.push({ p: [(x0 + x1) / 2, topY + 0.1, (z0 + z1) / 2], s: [Math.abs(x1 - x0) || 0.03, 0.15, Math.abs(z1 - z0) || 0.03] });
  }
  grp.add(tubes(gc, 0.022, steel)); grp.add(instances(new THREE.BoxGeometry(1, 1, 1), wood, toe));
  // pranchas de andaime (0,25 u) e pilha de painéis de forma na laje
  for (let k = 0; k < 6; k++) grp.add(rbox(2.4, 0.04, 0.25, wood, -2.2 + (r() - 0.5) * 0.1, topY + 0.07 + k * 0.045, 1.2 + k * 0.27 - 0.6, 0.004));
  for (let k = 0; k < 8; k++) grp.add(rbox(1.2, 0.03, 2.4, wood, 2.6 + (r() - 0.5) * 0.05, topY + 0.08 + k * 0.034, 1.8, 0.003));
  scaffold(grp, hero, topY + 1.0, steel, wood, ['-x']);

  // andaime (treliça de tubos + 3 pranchas de 0,25 u por nível)
  function scaffold(grp, b, h, steel, wood, which) {
    const segs = [], planks = [];
    const faces = [{ id: '+z', ax: 'x', c: b.d / 2 + 0.95, len: b.w }, { id: '-x', ax: 'z', c: -b.w / 2 - 0.95, len: b.d }].filter((f) => which.includes(f.id));
    const LV = 2.0, levels = Math.max(1, Math.round(h / LV));
    for (const f of faces) {
      const n = Math.round(f.len / 2.5);
      const P = (u, row, y) => f.ax === 'x' ? [-f.len / 2 + u, y, f.c - row * 0.9] : [f.c + row * 0.9, y, -f.len / 2 + u];
      for (let k = 0; k <= n; k++) {
        const u = k * f.len / n;
        for (const row of [0, 1]) segs.push([...P(u, row, 0), ...P(u, row, levels * LV + 1.0)]);
        for (let l = 0; l <= levels; l++) segs.push([...P(u, 0, l * LV), ...P(u, 1, l * LV)]);
        if (k < n) for (let l = 0; l < levels; l++) { const a = (k + l) % 2 ? 0 : 1; segs.push([...P(u, 0, l * LV + a * LV), ...P(u + f.len / n, 0, l * LV + (1 - a) * LV)]); }
      }
      for (let l = 0; l <= levels; l++) for (const row of [0, 1]) segs.push([...P(0, row, l * LV), ...P(f.len, row, l * LV)]);
      for (let l = 1; l <= levels; l++) for (const pk of [-0.27, 0, 0.27]) { const p0 = P(f.len / 2, 0.5 + pk / 0.9, l * LV + 0.03); planks.push({ p: p0, s: f.ax === 'x' ? [f.len, 0.04, 0.25] : [0.25, 0.04, f.len] }); }
    }
    grp.add(tubes(segs, 0.028, steel)); grp.add(instances(new THREE.BoxGeometry(1, 1, 1), wood, planks));
  }

  // fundo: pórticos com vãos variados, 30 % das lajes fechadas com painéis, 2 andares com tela, 1 torre alta recuada
  const bg = [
    { x: -16, z: -20, w: 11, d: 9, n: 2, bay: 5.5, rot: -0.08, closed: [1], net: [2] },
    { x: 16, z: -26, w: 14, d: 10, n: 3, bay: 7, rot: 0.06, closed: [1], net: [3] },
    { x: -3, z: -40, w: 12, d: 10, n: 3, bay: 4, rot: 0.0, closed: [1, 2] },
    { x: 29, z: -12, w: 9, d: 9, n: 2, bay: 4.5, rot: -0.12, closed: [] },
    { x: -33, z: -32, w: 13, d: 10, n: 3, bay: 6.5, rot: 0.1, closed: [1] },
    { x: 32, z: -46, w: 15, d: 12, n: 5, bay: 7, rot: 0.02, closed: [1, 2] },
    { x: -24, z: -58, w: 16, d: 12, n: 5, bay: 5.5, rot: -0.03, closed: [1, 2, 3] },
    { x: -34, z: -95, w: 18, d: 14, n: 14, bay: 6, rot: 0.05, closed: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  ];
  const net = netMat();
  for (const b of bg) {
    const g = new THREE.Group(); g.position.set(b.x, 0, b.z); g.rotation.y = b.rot; scene.add(g);
    const cl = cols(b.w, b.d, b.bay);
    for (let i = 0; i < b.n; i++) {
      const y = i * FH;
      for (const [px, pz] of cl) g.add(rbox(0.5, FH, 0.5, concreteCol, px, y + FH / 2, pz, 0.02));
      g.add(rbox(b.w, T, b.d, i % 2 ? concrete : concreteB, 0, y + FH - T / 2, 0, 0.02));
      if (b.closed.includes(i)) for (const [a, c, d2, e] of [[b.w, 0.12, 0, b.d / 2 - 0.06], [0.12, b.d, -b.w / 2 + 0.06, 0]]) g.add(rbox(a, FH - T - 0.1, c, wood, d2, y + (FH - T) / 2, e, 0.01));
      if (b.net?.includes(i)) for (const [a, c, d2, e] of [[b.w + 0.6, 0.01, 0, b.d / 2 + 0.3], [0.01, b.d + 0.6, -b.w / 2 - 0.3, 0]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(a || c, FH), net); m.position.set(d2, y + FH / 2, e); m.rotation.y = a > c ? 0 : Math.PI / 2; g.add(m); }
    }
    const ty = b.n * FH; const gcb = [];
    for (const [x0, z0, x1, z1] of [[-b.w / 2, b.d / 2, b.w / 2, b.d / 2], [-b.w / 2, -b.d / 2, -b.w / 2, b.d / 2]]) { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 1.5); for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n; gcb.push([x, ty, z, x, ty + 1.1, z]); } gcb.push([x0, ty + 1.1, z0, x1, ty + 1.1, z1]); }
    g.add(tubes(gcb, 0.022, steel, false));
  }

  // grua: torre em treliça (terço esquerdo) com sombra longa sobre o pátio; lança apontada ao herói (ponta cortada pelo quadro);
  // contrapeso em 3 blocos de concreto; trolley com moitão curto (sem carga pendurada no centro do quadro)
  const crane = new THREE.Group(); crane.position.set(-9.5, 0, 2); scene.add(crane);
  const TW = 0.8, TH = 13.5, seg = 1.4, tsegs = [], corners = [[-TW, -TW], [TW, -TW], [TW, TW], [-TW, TW]];
  for (const [cx, cz] of corners) tsegs.push([cx, 0, cz, cx, TH, cz]);
  for (let i = 0; i < 4; i++) { const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4]; for (let y = 0; y < TH; y += seg) { tsegs.push([ax, y, az, bx, y, bz]); const f = (Math.round(y / seg) % 2) ? 1 : 0; tsegs.push([f ? bx : ax, y, f ? bz : az, f ? ax : bx, y + seg, f ? az : bz]); } }
  crane.add(tubes(tsegs, 0.055, steel));
  crane.add(rbox(2.2, 0.3, 2.2, concreteB, 0, 0.15, 0, 0.03)); // base de concreto
  crane.add(rbox(1.6, 1.6, 1.6, steelDark, 0, TH + 0.8, 0, 0.04)); crane.add(rbox(1.4, 1.4, 1.2, steelDark, 1.4, TH + 1.0, 0, 0.05)); // giro + cabine
  const jib = new THREE.Group(); jib.position.y = TH + 1.6; crane.add(jib);
  const JL = 26, CL = 8, js = [];
  for (const sx of [-0.45, 0.45]) js.push([-CL, 0, sx, JL, 0, sx]);
  js.push([-CL, 1.1, 0, JL * 0.985, 0.15, 0]);
  for (let x = -CL; x < JL; x += 1.5) { const x2 = Math.min(JL, x + 1.5); const t0 = Math.max(0.15, 1.1 - (x + CL) / (JL + CL) * 0.95), t1 = Math.max(0.15, 1.1 - (x2 + CL) / (JL + CL) * 0.95); js.push([x, 0, -0.45, x, t0, 0], [x, 0, 0.45, x, t0, 0], [x, 0, -0.45, x2, t1, 0], [x, 0, 0.45, x2, t1, 0], [x, 0, -0.45, x2, 0, 0.45]); }
  jib.add(tubes(js, 0.045, steel));
  for (let k = 0; k < 3; k++) jib.add(rbox(0.7, 1.3, 1.5, concreteB, -CL + 1.0 + k * 0.78, -0.75, 0, 0.02)); // contrapeso: 3 blocos com frestas
  jib.add(rbox(1.0, 0.9, 1.1, steelDark, -CL + 3.8, -0.55, 0, 0.03));
  jib.add(tubes([[0, 0.2, 0, 0, 6, 0], [0, 6, 0, JL * 0.75, 0.3, 0], [0, 6, 0, -CL + 0.4, 0.2, 0]], 0.03, steel));
  const jibAngle = Math.atan2(-(hero.z - crane.position.z), hero.x - crane.position.x);
  const trolleyX = 3.2;
  const trolley = new THREE.Group(); trolley.position.set(trolleyX, -0.3, 0); jib.add(trolley);
  trolley.add(rbox(0.9, 0.35, 1.2, cacamba, 0, 0, 0, 0.03)); for (const sz of [-0.45, 0.45]) trolley.add(rbox(0.9, 0.12, 0.12, steelDark, 0, 0.3, sz, 0.02));
  const hook = new THREE.Group(); trolley.add(hook);
  hook.add(rbox(0.35, 0.6, 0.25, cacamba, 0, -1.0, 0, 0.02)); hook.add(tubes([[0, -0.1, 0, 0, -0.7, 0]], 0.02, steelDark, false)); // moitão curto sob o trolley
  crane.rotation.y = jibAngle;

  // canteiro: caçambas, pilhas de blocos, bobinas em primeiro plano (desfocadas pelo BokehPass)
  for (const [x, z, ry] of [[-5, 13.5, 0.3], [11, 11, -0.8], [-14, 2, 0.9]]) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.add(rbox(2.4, 1.2, 1.3, cacamba, 0, 0.6, 0, 0.04)); g.add(rbox(2.3, 0.3, 1.2, concreteB, 0, 1.25, 0, 0.03)); scene.add(g); }
  const blockGeo = rboxGeo(0.39, 0.19, 0.19, 0.008), blocks = [];
  for (const [bx, bz] of [[-8, 17], [9, 16.5], [16, 3]]) for (let i = 0; i < 40; i++) { const col = i % 4, row = Math.floor(i / 4) % 5, lay = Math.floor(i / 20); blocks.push({ p: [bx + col * 0.41 - 0.6, 0.1 + lay * 0.2, bz + row * 0.21 - 0.4], r: [0, (r() - 0.5) * 0.04, 0] }); }
  scene.add(instances(blockGeo, concrete, blocks));
  const coil = new THREE.TorusGeometry(0.6, 0.11, 10, 28);
  for (const [x, z] of [[-1.5, 17.5], [-0.1, 17.6], [-15, 9]]) { const m = new THREE.Mesh(coil, steelDark); m.rotation.x = Math.PI / 2; m.position.set(x, 0.12, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  // postes de obra (4,5 u): spot 3200 K fraco + lâmpada + halo (sem flare em linha); flicker 2 % a 7 Hz
  const spots = [], lamp = new THREE.MeshBasicMaterial({ color: 0xffd3a0 });
  for (const [x, z, tx, tz] of [[1.5, 9.5, 5, 3], [-15, -6, -11, -12], [17, -1, 12, -6]]) {
    const s = new THREE.SpotLight(0xffb679, DEBUG.includes('nokey') ? 0 : 260, 20, 0.55, 0.9, 1.6); s.position.set(x, 4.5, z); s.target.position.set(tx, 0, tz); scene.add(s.target, s); spots.push(s);
    scene.add(tubes([[x, 0, z, x, 4.5, z]], 0.05, steelDark)); scene.add(rbox(0.5, 0.25, 0.4, steelDark, x + 0.25, 4.5, z, 0.03));
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lamp); l.position.set(x + 0.25, 4.38, z); scene.add(l);
    halo(scene, [x + 0.25, 4.38, z], { size: 1.6, opacity: 0.45 });
  }
  mist(scene, { w: 90, h: 7, y: 0.3, z: -14, x: 0, opacity: 0.12, color: 0x34322f });
  mist(scene, { w: 120, h: 12, y: 0.5, z: -34, x: 6, opacity: 0.18, color: 0x34322f });

  const dof = { focus: 37, aperture: 0.00012, maxblur: 0.008 };
  const update = (t) => {
    const s = Math.cos(t * TAU); // extremos em t=0 e t=0,5; periódico → loop sem emenda
    aim(cam, [-3, 12.5, 36 + s * 1.5], 5.2 + s * 0.3, -5); // câmera +1,5 u e pitch −1,6° (horizonte ≈ 30 %), dolly 3 u
    crane.rotation.y = jibAngle + D2R(3) * s; // giro de 3° da lança
    hook.position.y = -0.15 - 0.15 * s; // moitão desce 0,3 u
    const fl = 1 + 0.02 * Math.sin(t * 6 * 7 * TAU); spots[0].intensity = 260 * fl; spots[2].intensity = 260 * (1 + 0.02 * Math.sin(t * 6 * 7 * TAU + 2));
  };
  return { cam, update, dof, exposure: 1.95 };
}
// =====================================================================
// 2 · FAMÍLIAS — galeria de pórticos de cantaria (7 gerações), raios de uma abertura alta à direita, poeira
// =====================================================================
function familiasHoldings(scene, aspect) {
  // Rodada 3: forro de concreto fecha o céu (sem triângulo preto), paredes laterais na mesma cantaria dos pórticos,
  // pórticos variados (3 larguras de bloco por pórtico, chanfro, lascas, albedo ±12 %, cornija de 3 degraus), fim do eixo
  // com porta de bronze em nicho recuado 0,4 u, raios em 2 cones (gaussiano) com intensidade ±15 % em 6 s, poeira 2×,
  // piso menos espelhado (hot spot L ≤ .85 via desatHi + roughness .45).
  const cam = camera(50, aspect, 0.3, 400);
  scene.fog = new THREE.FogExp2(0x242322, 0.033); // névoa neutra: a cantaria ao fundo continua pedra, não sépia
  scene.add(gradientSphere(0x08090b, 0x1a1712, 0x0a0b0d));
  envRoom(scene, 0.25);
  const keyPos = [15, 21, -9], keyTgt = [0, 2, -7]; const keyDir = keyTgt.map((v, i) => v - keyPos[i]);
  keyLight(scene, { intensity: 2.0, pos: keyPos, target: keyTgt, size: 30, radius: 8, far: 100 }); // da abertura alta à direita
  hemi(scene, 0x2b3340, 0x1f2126, 0.35);
  RectAreaLightUniformsLib.init();
  const area = new THREE.RectAreaLight(0xffd9b0, 2.2, 6, 3); area.position.set(0, 7.1, -1); area.lookAt(0, 0, -1); scene.add(area);
  const bounce = new THREE.RectAreaLight(0xf2d8c0, 0.25, 4, 7); bounce.position.set(4.5, 3.5, 2); bounce.lookAt(-8, 3.5, -2); scene.add(bounce); // rebatida (15 %) na parede/pilar esquerdo

  // cantaria: estratos + bush-hammer (micro 3 oitavas) + lascas; roughness .55–.75 por bloco; albedo ±12 % por instância
  const sMaps = procMaps(1024, (x, y) => { const warp = fbm(x * 4, y * 4, 2) * 0.2; const strata = fbm(x * 1.8 + warp, y * 9, 3); const micro = fbm(x * 120, y * 120, 3); const chips = Math.max(0, fbm(x * 14 + 2, y * 14, 3) - 0.62) * 2.5; const low = fbm(x * 3, y * 3, 2); return clamp01(strata * 0.3 + micro * 0.35 + low * 0.3 - chips * 0.4); },
    { nStrength: 0.6, repeat: 1, roughFn: (x, y, hv) => clamp01(0.55 + 0.2 * hv) });
  const mkStone = (rough, c) => withMaps(std(c, { roughness: rough }), sMaps, { normalScale: 0.5 });
  const stoneA = mkStone(0.6, 0x4a4845), stoneB = mkStone(0.74, 0x45433f);
  const joint = std(0x111214, { roughness: 0.95 });
  const gold = GOLD({ roughness: 0.3 });
  const bronze = new THREE.MeshPhysicalMaterial({ color: 0x5a3f28, roughness: 0.42, metalness: 1, envMapIntensity: 0.9 });
  const r = rng(7);
  const unit = rboxGeo(1, 1, 1, 0.006); // chanfro 6 mm (escala ~1)
  const listA = [], listB = [], colA = [], colB = [];
  const pushBlock = (grp, w, h, d, x, y, z) => { const wp = new THREE.Vector3(x, y, z); grp.localToWorld(wp); const J = 0.008; const it = { p: [wp.x, wp.y, wp.z], s: [w * grp.scale.x - J, h * grp.scale.x - J, d * grp.scale.x - J] }; const v = 1 + (r() - 0.5) * 0.24; if (r() < 0.55) { listA.push(it); colA.push(v); } else { listB.push(it); colB.push(v); } };

  const portals = new THREE.Group(); scene.add(portals);
  let zc = 0; const PW = 1.4, PD = 1.6, OPEN = 3.8, CH = 0.6, NC = 9, PH = NC * CH, PL = 0.35; // pilares 1,4 × 1,6 × 5,4 u, 9 fiadas de 0,6
  const WSETS = [[0.6, 0.8], [0.5, 0.9], [0.7, 0.7]]; // 3 larguras de bloco, alternadas por pórtico
  let fillet = null, filletZ = 0, filletY = 0, zEnd = 0, sEnd = 1;
  for (let i = 0; i < 7; i++) {
    const s = Math.pow(0.95, i); const g = new THREE.Group(); g.position.z = zc; g.scale.setScalar(s); portals.add(g); g.updateMatrixWorld(true);
    const [wa, wb] = WSETS[i % 3], off = i % 2;
    for (const sx of [-1, 1]) {
      const x = sx * (OPEN / 2 + PW / 2);
      g.add(rbox(PW + 0.3, PL, PD + 0.3, stoneB, x, PL / 2, 0, 0.02)); // plinto
      g.add(box(PW - 0.06, PH, PD - 0.06, joint, x, PL + PH / 2, 0, false)); // fundo das juntas
      for (let k = 0; k < NC; k++) {
        const y = PL + k * CH + CH / 2, m = (k + off) % 3;
        if (m === 0) pushBlock(g, PW, CH, PD, x, y, 0); // bloco inteiro
        else if (m === 1) { const da = PD * wa / (wa + wb); pushBlock(g, PW, CH, da, x, y, -PD / 2 + da / 2); pushBlock(g, PW, CH, PD - da, x, y, PD / 2 - (PD - da) / 2); }
        else { pushBlock(g, wa, CH, PD, x - PW / 2 + wa / 2, y, 0); pushBlock(g, PW - wa, CH, PD, x + PW / 2 - (PW - wa) / 2, y, 0); }
      }
    }
    const LL = OPEN + 2 * PW, lintelY = PL + PH;
    g.add(rbox(LL, 0.8, PD + 0.2, stoneA, 0, lintelY + 0.4, 0, 0.012)); // lintel 0,8 u saliente 10 cm
    g.add(rbox(LL + 0.16, 0.14, PD + 0.36, stoneB, 0, lintelY + 0.8 + 0.07, 0, 0.01)); // cornija degrau 1
    g.add(rbox(LL + 0.3, 0.12, PD + 0.5, stoneA, 0, lintelY + 0.94 + 0.06, 0, 0.01)); // degrau 2
    g.add(rbox(LL + 0.44, 0.1, PD + 0.64, stoneB, 0, lintelY + 1.06 + 0.05, 0, 0.01)); // degrau 3
    if (i === 1) { fillet = box(LL - 0.1, 0.025, 0.025, gold, 0, lintelY + 0.0125, PD / 2 + 0.1 + 0.0125, false); g.add(fillet); filletZ = zc + (PD / 2 + 0.1) * s; filletY = (lintelY + 0.0125) * s; }
    zEnd = zc; sEnd = s;
    zc -= 6.4 * Math.pow(0.97, i);
  }
  const imA = instances(unit, stoneA, listA), imB = instances(unit, stoneB, listB);
  for (const [im, cols] of [[imA, colA], [imB, colB]]) { const c = new THREE.Color(); cols.forEach((v, i) => im.setColorAt(i, c.setScalar(v))); im.instanceColor.needsUpdate = true; }
  scene.add(imA, imB);
  // fio de luz rasante (0,3 u) sobre o filete do 2.º pórtico
  const graze = new THREE.RectAreaLight(0xffe0b8, 3.5, OPEN + 1.5, 0.3); graze.position.set(0, filletY - 0.45, filletZ + 0.5); graze.lookAt(0, filletY, filletZ); scene.add(graze);

  // fim do eixo: parede de cantaria com nicho recuado 0,4 u e porta de bronze 0,1 u, rebatida quente no batente
  const zWall = zEnd - 4.2 * sEnd, DH = 5.2 * sEnd, DW = 3.0 * sEnd;
  const wallMat = withMaps(std(0x46443f, { roughness: 0.7 }), sMaps, { normalScale: 0.5 });
  const endGrp = new THREE.Group(); endGrp.position.z = zWall; scene.add(endGrp);
  for (const [w, h, x, y] of [[(12 - DW) / 2, 9, -(DW / 2 + (12 - DW) / 4), 4.5], [(12 - DW) / 2, 9, DW / 2 + (12 - DW) / 4, 4.5], [DW + 0.2, 9 - DH, 0, DH + (9 - DH) / 2]]) endGrp.add(rbox(w, h, 0.8, wallMat, x, y, 0, 0.01));
  for (const sx of [-1, 1]) endGrp.add(rbox(0.12, DH, 0.42, stoneB, sx * (DW / 2 + 0.06), DH / 2, -0.2, 0.004)); // ombreiras do nicho
  endGrp.add(rbox(DW + 0.24, 0.12, 0.42, stoneB, 0, DH + 0.06, -0.2, 0.004)); // verga
  const door = rbox(DW, DH, 0.1, bronze, 0, DH / 2, -0.4, 0.004); endGrp.add(door);
  for (let k = 1; k < 6; k++) endGrp.add(box(DW - 0.08, 0.02, 0.012, std(0x1a1410, { roughness: 0.8 }), 0, k * DH / 6, -0.345, false)); // almofadas da porta (frisos horizontais)
  const doorLight = new THREE.SpotLight(0xffc99a, 520, 22, 0.5, 0.6, 1.4); doorLight.position.set(0.8, 8.4, zWall + 4.5); doorLight.target.position.set(0, 2, zWall); scene.add(doorLight.target, doorLight); // lava a porta de cima (ponto focal do eixo)
  const doorGlow = new THREE.RectAreaLight(0xffc99a, 7, DW, 0.3); doorGlow.position.set(0, DH + 0.2, zWall - 0.1); doorGlow.lookAt(0, 0, zWall - 0.1); scene.add(doorGlow);
  const jamb = new THREE.PointLight(0xffc48f, 14, 9, 1.8); jamb.position.set(0, DH * 0.65, zWall + 0.9); scene.add(jamb); // rebatida no batente/ombreiras

  // forro de concreto (fecha o céu até o alto do quadro) + paredes laterais na mesma cantaria (juntas de bloco por normal)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(26, 90), withMaps(std(0x4c4b4e, { roughness: 0.9 }), concreteMaps(512, { color: 0x4c4b4e, dark: 0.12, boards: 8, repeat: 1, scale: 3 }), { normalScale: 0.3 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 7.3, -28); ceil.receiveShadow = true; scene.add(ceil);
  const ashlar = procMaps(1024, (x, y) => { const rows = 6; const ry = y * rows, row = Math.floor(ry), fy = ry - row; const wset = [1.6, 1.1, 1.35][row % 3] / 3.6; const ox = (row % 2) * 0.5 * wset; const fx = ((x + ox) / wset) % 1; const j = Math.exp(-Math.pow((fy - 0.5) / 0.022, 2)) + Math.exp(-Math.pow((fx - 0.5) / (0.022 / (wset * rows)), 2)); const micro = fbm(x * 120, y * 120, 3), strata = fbm(x * 2, y * 5, 2), blk = hash2(row, Math.floor((x + ox) / wset)); return clamp01(0.45 + micro * 0.22 + strata * 0.08 + (blk - 0.5) * 0.12 - 0.7 * Math.min(1, j)); }, { nStrength: 0.7, repeat: 1, roughFn: (x, y, hv) => clamp01(0.55 + 0.2 * hv) });
  const gwall = withMaps(std(0x55565a, { roughness: 0.72 }), ashlar, { normalScale: 0.3 });
  for (const tx of [gwall.normalMap, gwall.roughnessMap]) tx.repeat.set(70 / 3.6, 9 / 3.6);
  const wallWash = new THREE.RectAreaLight(0xb4bcc8, 1.3, 44, 2); wallWash.position.set(-5.5, 6.4, -16); wallWash.lookAt(-9.5, 3, -16); scene.add(wallWash); // hemisférica fraca (fria) na parede esquerda
  const ceilBounce = new THREE.RectAreaLight(0xe8d6c4, 0.5, 12, 60); ceilBounce.position.set(0, 1.0, -20); ceilBounce.lookAt(0, 9, -20); scene.add(ceilBounce); // rebatida do piso no forro
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(70, 9), gwall); w.position.set(sx * 9.5, 4.5, -22); w.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2; w.receiveShadow = true; scene.add(w); }
  // piso em lajotas 1,2 u (roughness .45: reflexo largo, sem hot spot) + subpiso
  const floorMat = phys(0x141618, { roughness: 0.45, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.45 });
  const tiles = [];
  for (let ix = -14; ix <= 14; ix++) for (let iz = -46; iz <= 10; iz++) tiles.push({ p: [ix * 1.22, -0.04 + (r() - 0.5) * 0.008, iz * 1.22], r: [(r() - 0.5) * 0.0105, (r() - 0.5) * 0.004, (r() - 0.5) * 0.0105] });
  scene.add(instances(rboxGeo(1.2, 0.08, 1.2, 0.01), floorMat, tiles, false));
  const sub = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), std(0x0c0d0f, { roughness: 0.9 })); sub.rotation.x = -Math.PI / 2; sub.position.y = -0.09; sub.receiveShadow = true; scene.add(sub);
  // raios da abertura alta à direita: 2 cones concêntricos por raio (largo .35× / estreito 1.3×) → falloff gaussiano; poeira 2×
  const camPos0 = [-0.35, 1.5, 12.5];
  const beams = [];
  [[0.9, 3.0, -3.2, 0.1, 2.2], [0.5, 3.0, -9.2, 0.075, 2.0], [0.1, 3.0, -15.4, 0.05, 1.9], [-0.2, 3.0, -21.5, 0.035, 1.8]].forEach(([x, y, z, o, w]) => {
    beams.push(beamPlane(scene, { w: w * 2.1, h: 13, pos: [x, y, z], dir: keyDir, camPos: camPos0, color: 0xffdcc0, opacity: o * 0.45 }));
    beams.push(beamPlane(scene, { w: w * 0.8, h: 13, pos: [x, y, z], dir: keyDir, camPos: camPos0, color: 0xffe2cc, opacity: o * 1.2 }));
  });
  beams.forEach((b) => { b.userData.o = b.material.opacity; });
  const dustUpd = dust(scene, { n: 200, at: [0.9, 2.8, -3.0], box: [2.4, 5.5, 2.6], opacity: 0.13, size: 1.6, seed: 5 });
  mist(scene, { w: 40, h: 4, y: 0, z: -12, opacity: 0.12, color: 0x3a342c }); mist(scene, { w: 50, h: 6, y: 0, z: -26, opacity: 0.16, color: 0x3a342c });

  const dof = { focus: 19, aperture: 0.00027, maxblur: 0.01 };
  const update = (t) => {
    const s = Math.cos(t * TAU); // extremos em t=0 e t=0,5; periódico → loop sem emenda
    aim(cam, [-0.35, 1.5, 12.5 - s * 1.5], -4.0, 6 + s * 1.2); // dolly 3 u + yaw ±1,2°; fuga no terço direito
    const k = 1 + 0.15 * s; // nuvem passando: raio e luz da abertura ±15 %
    area.intensity = 2.2 * k; beams.forEach((b) => { b.material.opacity = b.userData.o * k; });
    dustUpd(t);
    mistTex.offset.x = 0.0075 * s;
  };
  return { cam, update, dof, exposure: 1.05 };
}
// =====================================================================
// 5 · TERRAS — hora dourada: talhões com sulcos em curva de nível, estrada com trilhas, renques, silo, névoa de vale
// =====================================================================
function agro(scene, aspect) {
  // Rodada 3: paleta sem monocromia (céu #3e3a34 → #1e2126 com faixa fria acima do horizonte e nuvem rasante; sombras
  // neutro-frias), horizonte no terço superior (pitch 15°), talhões com solos diferentes (escuro / palha / faixas de
  // vegetação verde-oliva), relevo em 2 escalas (normal de detalhe 0,3 u + relevo 3 u), copas em billboards cruzados
  // (alpha fbm, 2 variantes, sombra com forma), galpão de duas águas com beiral e silo com cúpula, DOF no talhão-herói.
  const cam = camera(35, aspect, 1, 700);
  scene.fog = new THREE.FogExp2(0x45423e, 0.0068);
  const sunDir = [0.86, 0.24, -0.46];
  const dome = skyDome(0x1e2126, 0x3e3a34, 0x45423e, { haze: 0.22, hazeCol: 0x4a4540, spread: 0.075, sunDir, sunGlow: 0.45, sunCol: 0xe8b282, clouds: 0.55, cloudCol: 0x4c4540, bands: 1, coldBand: 0.55, coldCol: 0x2a2d33 });
  scene.add(dome);
  envGradient(scene, 0x2a2d33, 0x5a4a38, 0x2a241c, 0.35);
  const key = keyLight(scene, { color: 0xf6dfc8, intensity: 11, pos: [78, 22, -42], target: [0, 0, -14], size: 70, radius: 3, far: 260, normalBias: 0.06 }); // sol a ≈ 12° de trás-direita
  hemi(scene, 0x3b4250, 0x1c1814, 1.0); // sombras neutro-frias

  const SIZE = 240, SEG = 640, AMP = 4.5;
  const hill = (x, z) => 12 * Math.exp(-((x + 48) ** 2 + (z + 88) ** 2) / (2 * 26 ** 2)) + 9 * Math.exp(-((x - 70) ** 2 + (z + 95) ** 2) / (2 * 30 ** 2));
  const lake = { x: 14, z: -36, rx: 7, rz: 4.5 };
  const lakeMask = (x, z) => ((x - lake.x) / lake.rx) ** 2 + ((z - lake.z) / lake.rz) ** 2;
  const hRaw = (x, z) => (fbm(x * 0.03 + 3.1, z * 0.03 - 1.7, 4) - 0.5) * 2 * AMP + (fbm(x * 0.008, z * 0.008, 2) - 0.5) * 7.0 + hill(x, z);
  const lakeLevel = hRaw(lake.x, lake.z) - 0.6;
  const h = (x, z) => { const v = hRaw(x, z); const m = lakeMask(x, z); return m < 1.3 ? Math.min(v, lakeLevel + Math.max(0, m - 1) * 2.5) : v; };
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, h(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();

  const parcels = [
    [[-34, 14], [-12, 12], [-10, -8], [-32, -6]], [[-12, 12], [10, 16], [12, -5], [-10, -8]], [[10, 16], [32, 14], [34, -6], [12, -5]],
    [[-32, -6], [-10, -8], [-9, -30], [-30, -28]], [[-10, -8], [12, -5], [14, -28], [-9, -30]], [[12, -5], [34, -6], [36, -26], [14, -28]],
    [[-30, -28], [-9, -30], [-8, -52], [-28, -50]], [[14, -28], [36, -26], [38, -48], [16, -50]], [[34, -6], [56, -3], [58, -22], [36, -26]],
    [[-56, 18], [-34, 14], [-32, -6], [-54, -2]], [[-54, -2], [-32, -6], [-30, -28], [-52, -24]],
  ];
  const HERO = 4;
  // tipo de uso por talhão: 0 arado escuro (herói), 1 palha (restolho), 2 faixas de vegetação verde-oliva + solo, 3 pasto
  const USE = [2, 1, 3, 1, 0, 2, 3, 1, 2, 2, 3];
  const N = 2048;
  const idc = document.createElement('canvas'); idc.width = idc.height = N; const ictx = idc.getContext('2d');
  ictx.fillStyle = '#000'; ictx.fillRect(0, 0, N, N);
  const toPx = (x, z) => [(x / SIZE + 0.5) * N, (z / SIZE + 0.5) * N];
  const wobbly = (pg) => { const out = []; for (let i = 0; i < pg.length; i++) { const a = pg[i], b = pg[(i + 1) % pg.length]; for (let k = 0; k < 12; k++) { const t = k / 12; const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; const nx = -(b[1] - a[1]), nz = b[0] - a[0], L = Math.hypot(nx, nz) || 1; const d = (fbm(x * 0.15 + 9, z * 0.15, 2) - 0.5) * 3; out.push([x + nx / L * d, z + nz / L * d]); } } return out; };
  parcels.forEach((pg, i) => { ictx.fillStyle = `rgb(${i + 1},0,0)`; ictx.beginPath(); wobbly(pg).forEach(([x, z], k) => { const [px, py] = toPx(x, z); k ? ictx.lineTo(px, py) : ictx.moveTo(px, py); }); ictx.closePath(); ictx.fill(); });
  ictx.lineCap = 'round'; ictx.lineJoin = 'round';
  ictx.strokeStyle = 'rgb(0,0,255)'; ictx.lineWidth = 2.6 / SIZE * N;
  parcels.forEach((pg) => { ictx.beginPath(); pg.forEach(([x, z], k) => { const [px, py] = toPx(x, z); k ? ictx.lineTo(px, py) : ictx.moveTo(px, py); }); ictx.closePath(); ictx.stroke(); });
  const road = [[-70, 40], [-20, 20], [0, -4], [8, -30], [-6, -60], [10, -95]];
  const strokeRoad = (wU, col) => { ictx.strokeStyle = col; ictx.lineWidth = wU / SIZE * N; ictx.beginPath(); ictx.moveTo(...toPx(road[0][0], road[0][1])); for (let i = 1; i < road.length - 1; i++) { const [x0, z0] = road[i], [x1, z1] = road[i + 1]; ictx.quadraticCurveTo(...toPx(x0, z0), ...toPx((x0 + x1) / 2, (z0 + z1) / 2)); } ictx.stroke(); };
  strokeRoad(5.2, 'rgb(0,60,0)'); strokeRoad(2.8, 'rgb(0,255,0)'); strokeRoad(1.1, 'rgb(0,128,0)');
  const idd = ictx.getImageData(0, 0, N, N).data;
  const dirs = parcels.map((pg) => { const cx = pg.reduce((s, q) => s + q[0], 0) / pg.length, cz = pg.reduce((s, q) => s + q[1], 0) / pg.length; const gx = hRaw(cx + 2, cz) - hRaw(cx - 2, cz), gz = hRaw(cx, cz + 2) - hRaw(cx, cz - 2); return Math.atan2(gz, gx) + Math.PI / 2; });
  const PITCH = 0.8 / SIZE, BAND = 3.0 / SIZE;
  const lineU = (x, y, a, jit) => x * Math.cos(a) + y * Math.sin(a) + jit;
  const tMaps = procMaps(N, (x, y) => {
    const o = ((Math.floor(y * N) * N) + Math.floor(x * N)) * 4; const id = idd[o], g = idd[o + 1], bl = idd[o + 2] / 255;
    let v = 0.5 + (fbm(x * 80, y * 80, 3) - 0.5) * 0.5 + (fbm(x * 400, y * 400, 2) - 0.5) * 0.18; // relevo 3 u + pedras
    if (id > 0 && g === 0 && bl < 0.5) {
      const use = USE[id - 1], a = dirs[id - 1], jit = 0.15 * PITCH * (fbm(x * 90, y * 90, 2) - 0.5) * 2;
      if (use === 0 || use === 1) v = v * 0.88 + 0.12 * (0.5 + 0.5 * Math.sin(lineU(x, y, a, jit) / PITCH * TAU)); // sulcos de arado
      else if (use === 2) { const b = 0.5 + 0.5 * Math.sin(lineU(x, y, a, jit) / BAND * TAU); v = v * 0.85 + 0.15 * b + (b > 0.5 ? (fbm(x * 600, y * 600, 2) - 0.5) * 0.25 : 0); } // faixas de cultura (relevo da vegetação)
    }
    if (g > 0) v = 0.5 + (fbm(x * 220, y * 220, 2) - 0.5) * 0.12 - (g === 255 ? 0.08 : 0);
    return clamp01(v);
  }, {
    nStrength: 0.11, repeat: 1,
    roughFn: (x, y, hv) => { const o = ((Math.floor(y * N) * N) + Math.floor(x * N)) * 4; const g = idd[o + 1]; const id = idd[o]; const use = id > 0 ? USE[id - 1] : 3; return clamp01((use <= 1 ? 0.86 : 0.95) - (g === 255 ? 0.25 : 0) + (hv - 0.5) * 0.12); },
    colorFn: (x, y, hv) => {
      const o = ((Math.floor(y * N) * N) + Math.floor(x * N)) * 4; const id = idd[o], g = idd[o + 1], bl = idd[o + 2] / 255;
      let c = [0.235, 0.265, 0.18]; // pasto, oliva-cinza
      if (id > 0) {
        const use = USE[id - 1], a = dirs[id - 1];
        if (use === 0) c = [0.2, 0.165, 0.14]; // solo recém-revolvido (herói), escuro e pouco saturado
        else if (use === 1) c = [0.4, 0.365, 0.29]; // restolho / palha (dessaturado)
        else if (use === 2) { const b = 0.5 + 0.5 * Math.sin(lineU(x, y, a, 0) / BAND * TAU); c = b > 0.5 ? [0.2, 0.235, 0.15] : [0.29, 0.24, 0.19]; } // verde-oliva dessaturado × solo
        else c = [0.25, 0.26, 0.18];
      }
      const m = 0.92 + (fbm(x * 25, y * 25, 3) - 0.5) * 0.18 + (hv - 0.5) * 0.08; c = c.map((v) => v * m);
      if (bl > 0.5) c = [0.32, 0.28, 0.23]; // carreador
      if (g === 60) c = [0.3, 0.27, 0.22]; else if (g === 255) c = [0.35, 0.31, 0.26]; else if (g === 128) c = [0.26, 0.26, 0.18];
      return c;
    },
  });
  tMaps.map.anisotropy = tMaps.normalMap.anisotropy = tMaps.roughnessMap.anisotropy = 16;
  const terrMat = withMaps(std(0xffffff, { roughness: 1 }), tMaps, { normalScale: 1.0, mapAlso: true });
  const detail = noiseMaps(512, 14, { nStrength: 0.5, oct: 3 }); // pedras/torrões de ≈ 0,3 u (tile de 4 u, repetido 60×)
  detailNormal(terrMat, detail.normalMap, 60, 0.6);
  const uWind = { value: 0 };
  terrMat.onBeforeCompile = ((prev) => (sh) => { prev?.(sh); sh.uniforms.uWind = uWind; sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.y += 0.05 * sin(position.x * 0.9 + uWind) * sin(position.z * 0.7 - uWind * 0.5);'); })(terrMat.onBeforeCompile); // fatores inteiros/meios do período → quadro 144 ≡ quadro 0
  const terr = new THREE.Mesh(geo, terrMat); terr.castShadow = true; terr.receiveShadow = true; scene.add(terr);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), phys(0x0c0e12, { roughness: 0.04, metalness: 0, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.02 })); water.rotation.x = -Math.PI / 2; water.scale.set(lake.rx * 0.98, lake.rz * 0.98, 1); water.position.set(lake.x, lakeLevel + 0.08, lake.z); water.receiveShadow = true; scene.add(water);

  // cercas: mourões 0,15 u a cada 3 u + 2 fios; porteira na estrada; curral cercado junto ao herói
  const posts = [], wires = [], rails = [];
  const edgesSeen = new Set();
  const fenceLine = (a, b, step = 3, railsN = 0) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / step)); const pts = []; for (let j = 0; j <= n; j++) { const x = a[0] + (b[0] - a[0]) * j / n, z = a[1] + (b[1] - a[1]) * j / n, y = h(x, z); posts.push({ p: [x, y + 0.6, z] }); pts.push([x, y, z]); } for (let j = 0; j < n; j++) { if (railsN) { for (let k = 1; k <= railsN; k++) { const wy = 0.3 * k; const a2 = pts[j], b2 = pts[j + 1]; const L2 = Math.hypot(b2[0] - a2[0], b2[2] - a2[2]); rails.push({ p: [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2 + wy, (a2[2] + b2[2]) / 2], r: [0, -Math.atan2(b2[2] - a2[2], b2[0] - a2[0]), Math.atan2(b2[1] - a2[1], L2)], s: [L2, 0.08, 0.05] }); } } else for (const wy of [0.75, 1.1]) wires.push([pts[j][0], pts[j][1] + wy, pts[j][2], pts[j + 1][0], pts[j + 1][1] + wy, pts[j + 1][2]]); } };
  parcels.forEach((pg) => { for (let i = 0; i < pg.length; i++) { const a = pg[i], b = pg[(i + 1) % pg.length]; const k = [a, b].map((q) => q.join(',')).sort().join('|'); if (edgesSeen.has(k)) continue; edgesSeen.add(k); fenceLine(a, b); } });
  const curral = [[-4, -12], [4, -11.5], [4.5, -18], [-3.5, -18.5]]; for (let i = 0; i < 4; i++) fenceLine(curral[i], curral[(i + 1) % 4], 1.5, 4);
  const gateX = -1.0, gateZ = -6.5; fenceLine([gateX - 2.2, gateZ], [gateX + 2.2, gateZ + 0.3], 4.4, 4); // porteira
  const postMat = std(0x2a2118, { roughness: 0.9 });
  scene.add(instances(new THREE.CylinderGeometry(0.07, 0.085, 1.3, 7), postMat, posts));
  scene.add(instances(new THREE.BoxGeometry(1, 1, 1), postMat, rails));
  line2(scene, wires, { color: 0x4a4440, width: 1.5, opacity: 0.6 });
  // silo com cúpula + galpão de duas águas com beiral 0,3 u (chapa metálica: rim do sol na aresta), no ponto de terço superior direito
  const shed = std(0x3a3835, { roughness: 0.45, metalness: 0.6 });
  const shedRoof = std(0x2e2c29, { roughness: 0.5, metalness: 0.6 });
  const sx = 26, sz = -50, sy = h(sx, sz) - 0.2;
  for (const [ox, oz] of [[0, 0], [3.8, -0.4]]) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 7, 28), shed); silo.position.set(sx + ox, sy + 3.5, sz + oz); silo.castShadow = true; scene.add(silo);
    const domeS = new THREE.Mesh(new THREE.SphereGeometry(1.6, 28, 10, 0, TAU, 0, Math.PI / 2), shedRoof); domeS.scale.set(1, 0.55, 1); domeS.position.set(sx + ox, sy + 7, sz + oz); domeS.castShadow = true; scene.add(domeS);
    for (let k = 1; k < 5; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.03, 6, 28), shedRoof); ring.rotation.x = Math.PI / 2; ring.position.set(sx + ox, sy + k * 1.4, sz + oz); scene.add(ring); } // anéis de chapa
  }
  const gx = sx - 8.5, gz = sz + 1.5, GW = 9, GD = 5.5, GH = 2.8, RISE = 1.4, EAVE = 0.3;
  const gal = box(GW, GH, GD, shed, gx, sy + GH / 2, gz); scene.add(gal);
  const gable = new THREE.Mesh(new THREE.CylinderGeometry(Math.hypot(GD / 2, RISE), Math.hypot(GD / 2, RISE), GW, 3, 1), shed); gable.rotation.z = Math.PI / 2; gable.rotation.x = 0; gable.scale.set(1, 1, RISE / Math.hypot(GD / 2, RISE)); // empena triangular
  const slopeL = Math.hypot(GD / 2 + EAVE, RISE + RISE * EAVE / (GD / 2)), ang = Math.atan2(RISE, GD / 2);
  for (const sg of [-1, 1]) { const rf = box(GW + 2 * EAVE, 0.08, slopeL, shedRoof, gx, sy + GH + RISE / 2 - 0.02, gz + sg * (GD / 2 + EAVE) / 2); rf.rotation.x = -sg * ang; scene.add(rf); } // duas águas com beiral
  const ridge = box(GW + 2 * EAVE, 0.1, 0.16, shedRoof, gx, sy + GH + RISE + 0.02, gz); scene.add(ridge);
  for (const sg of [-1, 1]) { const tri = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-GD / 2, 0, 0), new THREE.Vector3(GD / 2, 0, 0), new THREE.Vector3(0, RISE, 0)]), shed); tri.geometry.computeVertexNormals(); tri.geometry.setIndex([0, 1, 2]); tri.material = std(0x3a3835, { roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide }); tri.rotation.y = Math.PI / 2; tri.position.set(gx + sg * GW / 2, sy + GH, gz); scene.add(tri); } // empenas

  // árvores: billboards cruzados (3 planos, 2 variantes, alpha fbm, sombra com forma); grupos nas baixadas, +60 % só nas grotas
  const r = rng(21);
  const crownTexs = [crownTex(1), crownTex(2)];
  const groups = [];
  for (let i = 0; i < 14; i++) { let best = null; for (let k = 0; k < 20; k++) { const x = (r() - 0.5) * 130, z = -82 + (r() - 0.5) * 40; if (lakeMask(x, z) < 1.6) continue; const v = hRaw(x, z); if (!best || v < best.v) best = { x, z, v }; } groups.push(best); }
  for (let i = 0; i < 6; i++) { const a = r() * TAU; groups.push({ x: lake.x + Math.cos(a) * (lake.rx + 2.5 + r() * 3), z: lake.z + Math.sin(a) * (lake.rz + 2.5 + r() * 3) }); }
  const treeList = [];
  groups.forEach((gp) => { const n = 2 + Math.floor(r() * 4); for (let k = 0; k < n; k++) { const x = gp.x + (r() - 0.5) * 7, z = gp.z + (r() - 0.5) * 7; if (lakeMask(x, z) < 1.4 || z > -20) continue; treeList.push({ x, z, y: h(x, z), s: 0.6 + r() * 0.7, v: Math.floor(r() * 2), ph: r() * TAU, ry: r() * TAU }); } });
  const crownGeo = (() => { const g1 = new THREE.PlaneGeometry(1, 1), g2 = g1.clone().rotateY(Math.PI / 3), g3 = g1.clone().rotateY(-Math.PI / 3); const m = mergeGeometries([g1, g2, g3]); m.translate(0, 0.5, 0); return m; })();
  const crownMat = (tex) => new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, color: 0xd8d8d8 });
  const crownIM = crownTexs.map((tx) => { const im = new THREE.InstancedMesh(crownGeo, crownMat(tx), treeList.length); im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; scene.add(im); return im; });
  const trunkMat = std(0x1a1410, { roughness: 0.95 });
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.16, 1, 7), trunkMat, treeList.length); trunk.castShadow = true; trunk.frustumCulled = false; scene.add(trunk);
  const setTrees = (t) => {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pp = new THREE.Vector3(), ss = new THREE.Vector3(); const cnt = [0, 0];
    treeList.forEach((tr, i) => {
      const sway = D2R(0.5) * Math.sin(t * TAU * 2 + tr.ph);
      e.set(sway, tr.ry, sway * 0.7); q.setFromEuler(e);
      pp.set(tr.x, tr.y + 1.6 * tr.s, tr.z); ss.set(4.2 * tr.s, 4.0 * tr.s, 4.2 * tr.s); M.compose(pp, q, ss); crownIM[tr.v].setMatrixAt(cnt[tr.v]++, M);
      pp.set(tr.x, tr.y + 1.0 * tr.s, tr.z); ss.set(0.5 * tr.s, 2.2 * tr.s, 0.5 * tr.s); M.compose(pp, q, ss); trunk.setMatrixAt(i, M);
    });
    crownIM.forEach((im, k) => { im.count = cnt[k]; im.instanceMatrix.needsUpdate = true; }); trunk.instanceMatrix.needsUpdate = true;
  };
  // névoa de vale em 3 camadas (neutra-fria, não âmbar)
  const mists = [mist(scene, { w: 90, h: 4, y: h(-20, -45) - 1.2, z: -45, x: -20, opacity: 0.14, color: 0x5a5650 }), mist(scene, { w: 140, h: 7, y: h(0, -78) - 1, z: -78, x: 10, opacity: 0.2, color: 0x5a5650 }), mist(scene, { w: 220, h: 14, y: h(0, -110) - 2, z: -112, x: 0, opacity: 0.28, color: 0x5a5650 })];

  const dof = { focus: 24, aperture: 0.00006, maxblur: 0.006 }; // talhão em primeiro plano nítido, fundo suave
  const keyBase = key.position.clone();
  const update = (t) => {
    const s = Math.cos(t * TAU); // extremos em t=0 e t=0,5; periódico → loop sem emenda
    aim(cam, [2, 15 - s * 0.25, 28 - s * 3], 15, -2); // travelling 6 u com descida 0,5 u; horizonte no terço superior
    key.position.copy(keyBase).applyAxisAngle(new THREE.Vector3(0, 1, 0), D2R(s * 2));
    setTrees(t); uWind.value = t * TAU * 2;
    mists.forEach((m, i) => { m.material.map.offset.x = 0.0025 * s * (i + 1); });
  };
  return { cam, update, dof, exposure: 1.3 };
}

// =====================================================================
// helpers desta pasta
// =====================================================================
// cantaria genérica (fiadas + juntas por normal) para paredes/colunas
function ashlarMaps(N = 1024, rows = 6, { nStrength = 0.7 } = {}) {
  return procMaps(N, (x, y) => { const ry = y * rows, row = Math.floor(ry), fy = ry - row; const wset = [1.6, 1.1, 1.35][row % 3] / 3.6; const ox = (row % 2) * 0.5 * wset; const fx = ((x + ox) / wset) % 1; const j = Math.exp(-Math.pow((fy - 0.5) / 0.022, 2)) + Math.exp(-Math.pow((fx - 0.5) / (0.022 / (wset * rows)), 2)); const micro = fbm(x * 120, y * 120, 3), strata = fbm(x * 2, y * 5, 2), blk = hash2(row, Math.floor((x + ox) / wset)); return clamp01(0.45 + micro * 0.22 + strata * 0.08 + (blk - 0.5) * 0.12 - 0.7 * Math.min(1, j)); }, { nStrength, repeat: 1, roughFn: (x, y, hv) => clamp01(0.55 + 0.2 * hv) });
}
// pedra escura "monólito": estratos + bush-hammer + lascas
function darkStoneMaps(N = 1024) {
  return procMaps(N, (x, y) => { const warp = fbm(x * 4, y * 4, 2) * 0.2; const strata = fbm(x * 1.8 + warp, y * 9, 3); const micro = fbm(x * 120, y * 120, 3); const chips = Math.max(0, fbm(x * 14 + 2, y * 14, 3) - 0.62) * 2.5; const low = fbm(x * 3, y * 3, 2); return clamp01(strata * 0.3 + micro * 0.35 + low * 0.3 - chips * 0.4); }, { nStrength: 0.6, repeat: 1, roughFn: (x, y, hv) => clamp01(0.5 + 0.25 * hv) });
}
// madeira (veios ondulados + poros)
function woodMaps(N = 1024, { color = 0x4a3621, rBase = 0.45, rVar = 0.1, scaleV = 40, nStrength = 0.35, repeat = 1 } = {}) {
  return procMaps(N, (x, y) => { const g = fbm(x * 2 + fbm(x * 6, y * 1.5, 2) * 0.6, y * scaleV, 3); const micro = fbm(x * 220, y * 220, 2); return clamp01(g * 0.7 + micro * 0.3); }, { nStrength, rBase, rVar, color, colorVar: 0.16, repeat });
}
// aço escovado (riscas finas numa direção)
function brushedMaps(N = 1024, { rBase = 0.32, rVar = 0.06, repeat = 1, dir = 0 } = {}) {
  return procMaps(N, (x, y) => { const u = dir ? x : y; return clamp01(0.5 + (fbm(u * 600, (dir ? y : x) * 3, 2) - 0.5) * 0.6 + (fbm(x * 8, y * 8, 2) - 0.5) * 0.2); }, { nStrength: 0.25, rBase, rVar, repeat });
}
// piso polido escuro com juntas (lajotas)
function pavedFloor(scene, { color = 0x141618, size = 1.2, nx = 14, nz = 46, rough = 0.45, seed = 9, y = -0.04 } = {}) {
  const r = rng(seed); const mat = phys(color, { roughness: rough, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.45 });
  const tiles = []; for (let ix = -nx; ix <= nx; ix++) for (let iz = -nz; iz <= 10; iz++) tiles.push({ p: [ix * (size + 0.02), y + (r() - 0.5) * 0.006, iz * (size + 0.02)], r: [(r() - 0.5) * 0.008, (r() - 0.5) * 0.003, (r() - 0.5) * 0.008] });
  scene.add(instances(rboxGeo(size, 0.08, size, 0.01), mat, tiles, false));
  const sub = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), std(0x0c0d0f, { roughness: 0.9 })); sub.rotation.x = -Math.PI / 2; sub.position.y = y - 0.05; sub.receiveShadow = true; scene.add(sub);
  return mat;
}
// torre de transmissão em treliça simplificada (silhueta)
function pylon(h = 24, w = 3) {
  const segs = [], c = [[-w, -w], [w, -w], [w, w], [-w, w]];
  for (let i = 0; i < 4; i++) { const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4]; segs.push([ax * 1, 0, az, ax * 0.25, h, az * 0.25]); for (let y = 0; y < h; y += 3) { const k = 1 - 0.75 * y / h, k2 = 1 - 0.75 * (y + 3) / h; segs.push([ax * k, y, az * k, bx * k, y, bz * k], [ax * k, y, az * k, bx * k2, y + 3, bz * k2]); } }
  for (const [y, L] of [[h * 0.72, w * 2.6], [h * 0.86, w * 2.1], [h * 1.0, w * 1.5]]) segs.push([-L, y, 0, L, y, 0], [-L, y - 1.2, 0, -L, y, 0], [L, y - 1.2, 0, L, y, 0], [-L, y - 1.2, 0, -L * 0.35, y, 0], [L, y - 1.2, 0, L * 0.35, y, 0]);
  return segs;
}

// =====================================================================
// ÍNDICE — nove monólitos de pedra escura em grade 3×3 vistos em diagonal, filete de ouro numa aresta, névoa baixa
// =====================================================================
function indice(scene, aspect) {
  const cam = camera(40, aspect, 0.3, 300);
  scene.fog = new THREE.FogExp2(0x1a1b1d, 0.03);
  scene.add(gradientSphere(0x0a0b0d, 0x1c1c1e, 0x0a0b0d));
  envStudio(scene, 0.4);
  keyLight(scene, { color: 0xd8dde6, intensity: 4.0, pos: [-18, 16, -16], target: [3, 2, 0], size: 24, radius: 5, far: 80 }); // rim frio de trás-esquerda
  hemi(scene, 0x3a4048, 0x1a1916, 1.2);
  RectAreaLightUniformsLib.init();
  const warm = new THREE.RectAreaLight(0xffe2c4, 2.0, 6, 10); warm.position.set(15, 6, 9); warm.lookAt(3, 2, -1); scene.add(warm); // lateral direita (pouco saturada), rasante nos filetes
  const front = new THREE.RectAreaLight(0xcfd6e0, 1.2, 12, 8); front.position.set(-4, 5, 16); front.lookAt(3, 2, -1); scene.add(front); // frontal fria suave
  const gMaps = noiseMaps(1024, 8, { nStrength: 0.5, rBase: 0.5, rVar: 0.2, color: 0x3c3c3e, colorVar: 0.1, repeat: 6, oct: 3 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), withMaps(phys(0xffffff, { roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 }), gMaps, { normalScale: 0.4, mapAlso: true })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const stone = withMaps(std(0x454442, { roughness: 0.65 }), darkStoneMaps(1024), { normalScale: 0.45 });
  const gold = GOLD({ roughness: 0.22, envMapIntensity: 3.0, emissive: 0x6a4a1c, emissiveIntensity: 0.35 });
  const grp = new THREE.Group(); grp.position.set(3.2, 0, -1.5); grp.rotation.y = D2R(38); scene.add(grp);
  const r = rng(3); const W = 1.1, H = 4.2, S = 2.9;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const hh = H + (r() - 0.5) * 0.6, x = i * S, z = j * S;
    grp.add(rbox(W, hh, W, stone, x, hh / 2, z, 0.012));
    grp.add(box(0.04, hh - 0.3, 0.04, gold, x - W / 2 + 0.006, hh / 2, z + W / 2 + 0.006, false)); // filete na aresta voltada à luz quente
    grp.add(rbox(W + 0.25, 0.12, W + 0.25, stone, x, 0.06, z, 0.01)); // plinto
  }
  mist(scene, { w: 40, h: 2.2, y: 0, z: 2, x: 4, opacity: 0.22, color: 0x4a4a4c });
  mist(scene, { w: 60, h: 4, y: 0, z: -8, x: 2, opacity: 0.2, color: 0x3e3f42 });
  const dustUpd = dust(scene, { n: 120, at: [4, 2.5, 0], box: [10, 5, 10], opacity: 0.1, size: 1.5, seed: 8 });
  const dof = { focus: 15, aperture: 0.0002, maxblur: 0.008 };
  const update = (t) => { const s = Math.cos(t * TAU); aim(cam, [-2.2, 2.6, 16.5 - s * 1.2], 5, -11.5 + s * 0.8); dustUpd(t); mistTex.offset.x = 0.006 * s; };
  return { cam, update, dof, exposure: 2.3 };
}

// =====================================================================
// CARTÓRIOS — mesa de carvalho, livros de registro encadernados, sinete de metal, fio de ouro na lombada; luz de janela
// =====================================================================
function cartorios(scene, aspect) {
  const cam = camera(55, aspect, 0.05, 100);
  scene.fog = new THREE.FogExp2(0x15130f, 0.05);
  scene.add(gradientSphere(0x08080a, 0x14120e, 0x08080a));
  envStudio(scene, 0.35);
  const keyPos = [-6, 4.5, 1.5], keyTgt = [0.6, 0.9, 0], keyDir = keyTgt.map((v, i) => v - keyPos[i]);
  keyLight(scene, { color: 0xffd7b0, intensity: 5.0, pos: keyPos, target: keyTgt, size: 6, radius: 4, far: 30, map: 2048, normalBias: 0.01, bias: -0.0002 }); // janela à esquerda
  hemi(scene, 0x2a2e36, 0x15120e, 0.7);
  RectAreaLightUniformsLib.init();
  const fill = new THREE.RectAreaLight(0xc9d2e0, 1.4, 3, 3); fill.position.set(2.5, 2.4, 2.5); fill.lookAt(0.6, 1, 0); scene.add(fill); // rebatida fria
  // mesa
  const desk = withMaps(std(0xffffff, { roughness: 0.45 }), woodMaps(1024, { color: 0x3e2c1b }), { normalScale: 0.5, mapAlso: true });
  scene.add(rbox(7, 0.1, 3.2, desk, 0.5, 0.85, 0, 0.012));
  scene.add(rbox(7, 0.14, 0.08, desk, 0.5, 0.79, 1.6, 0.01)); // friso frontal
  for (const [x, z] of [[-2.6, 1.3], [3.6, 1.3], [-2.6, -1.3], [3.6, -1.3]]) scene.add(rbox(0.14, 0.8, 0.14, desk, x, 0.4, z, 0.01));
  // parede de fundo e estante com livros em silhueta
  const plaster = withMaps(std(0x2e2b27, { roughness: 0.9 }), noiseMaps(512, 6, { nStrength: 0.3, rBase: 0.9 }), { normalScale: 0.4 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), plaster); wall.position.set(0, 4, -3.2); wall.receiveShadow = true; scene.add(wall);
  const r = rng(17);
  const shelf = std(0x2a1f16, { roughness: 0.6 });
  for (let k = 0; k < 3; k++) { scene.add(rbox(6, 0.05, 0.35, shelf, 1.5, 1.5 + k * 0.6, -2.95, 0.005)); let x = -1.4; while (x < 4.3) { const w = 0.05 + r() * 0.05, h = 0.36 + r() * 0.16; const c = [0x2a2420, 0x241f1e, 0x33281f, 0x1e1c1c][Math.floor(r() * 4)]; scene.add(box(w, h, 0.3, std(c, { roughness: 0.65 }), x + w / 2, 1.5 + k * 0.6 + 0.025 + h / 2, -2.97, false)); x += w + 0.004; } }
  // livros de registro (lombada para a câmera), empilhados com leve giro; fio de ouro na lombada do livro do meio
  const leatherMaps = noiseMaps(512, 30, { nStrength: 0.4, rBase: 0.55, rVar: 0.1, oct: 3 });
  const leather = (c) => withMaps(std(c, { roughness: 0.62 }), leatherMaps, { normalScale: 0.25 });
  const pages = std(0x5e574b, { roughness: 0.95 });
  const gold = GOLD({ roughness: 0.3 });
  const stack = new THREE.Group(); stack.position.set(0.7, 0.9, 0.0); stack.rotation.y = D2R(28); scene.add(stack);
  const cols = [0x1c1715, 0x191718, 0x231a15, 0x1a1614, 0x161515, 0x1f1815];
  let y = 0;
  for (let i = 0; i < 6; i++) {
    const th = 0.085 + (r() - 0.5) * 0.02, bw = 1.05, bd = 0.72; const g = new THREE.Group(); g.position.set((r() - 0.5) * 0.06, y + th / 2, (r() - 0.5) * 0.04); g.rotation.y = (r() - 0.5) * 0.12; stack.add(g);
    g.add(rbox(bw, th, bd, leather(cols[i]), 0, 0, 0, 0.006));
    g.add(box(bw - 0.03, th - 0.016, bd - 0.05, pages, 0.02, 0, 0, false)); // folhas (aparecem nos cantos)
    for (const bz of [-0.28, -0.1, 0.1, 0.28]) g.add(rbox(0.045, th + 0.006, 0.016, leather(cols[i]), -bw / 2 + 0.01, 0, bz, 0.004)); // nervuras da lombada
    if (i === 2) g.add(box(0.014, th - 0.03, 0.03, gold, -bw / 2 - 0.004, 0, 0.19, false)); // fio de ouro
    if (i !== 2) for (const bz of [-0.2, 0.19]) g.add(box(0.01, th - 0.04, 0.012, std(0x6a5a3c, { roughness: 0.5, metalness: 0.6 }), -bw / 2 - 0.002, 0, bz, false)); // filetes de latão fosco
    if (i === 2 || i === 4) g.add(box(0.36, 0.002, 0.14, gold, -0.1, th / 2 + 0.001, 0, false)); // filete da capa (fino)
    y += th;
  }
  // sinete de metal (bronze) com cabo de madeira, e almofada de tinta
  const bronze = new THREE.MeshPhysicalMaterial({ color: 0x5a3f28, roughness: 0.4, metalness: 1, envMapIntensity: 0.9 });
  const seal = new THREE.Group(); seal.position.set(-0.75, 0.9, 0.35); scene.add(seal);
  const sb = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.05, 32), bronze); sb.position.y = 0.025; sb.castShadow = true; seal.add(sb);
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.034, 0.16, 16), desk); sh.position.y = 0.13; sh.castShadow = true; seal.add(sh);
  const sk = new THREE.Mesh(new THREE.SphereGeometry(0.04, 20, 14), desk); sk.position.y = 0.23; sk.castShadow = true; seal.add(sk);
  const pad = rbox(0.34, 0.03, 0.22, std(0x1a1210, { roughness: 0.5 }), -1.3, 0.915, 0.1, 0.006); scene.add(pad);
  scene.add(rbox(0.3, 0.004, 0.18, std(0x120c0a, { roughness: 0.3 }), -1.3, 0.932, 0.1, 0.002));
  // janela: raios + poeira
  const camPos0 = [-1.6, 1.75, 3.4];
  const beams = [beamPlane(scene, { w: 2.6, h: 7, pos: [-1.5, 2.2, 0.2], dir: keyDir, camPos: camPos0, color: 0xffdcc0, opacity: 0.05 }), beamPlane(scene, { w: 1.0, h: 7, pos: [-1.2, 2.0, 0.3], dir: keyDir, camPos: camPos0, color: 0xffe2cc, opacity: 0.09 })];
  beams.forEach((b) => { b.userData.o = b.material.opacity; });
  const dustUpd = dust(scene, { n: 160, at: [-0.3, 1.6, 0.4], box: [2.6, 1.6, 2.2], opacity: 0.14, size: 1.4, seed: 5 });
  const dof = { focus: 4.0, aperture: 0.0015, maxblur: 0.011 };
  const update = (t) => { const s = Math.cos(t * TAU); aim(cam, [-1.6 + s * 0.12, 1.75 + s * 0.04, 3.4 - s * 0.2], 13 + s * 0.4, -24); const k = 1 + 0.12 * s; beams.forEach((b) => { b.material.opacity = b.userData.o * k; }); dustUpd(t); };
  return { cam, update, dof, exposure: 2.1 };
}

// =====================================================================
// INFRAESTRUTURA — adutora de grande diâmetro atravessando um vale ao amanhecer; torres de transmissão no horizonte
// =====================================================================
function infra(scene, aspect) {
  const cam = camera(35, aspect, 1, 700);
  scene.fog = new THREE.FogExp2(0x3a3734, 0.0075);
  const sunDir = [-0.32, 0.07, -1];
  scene.add(skyDome(0x1a1c22, 0x5a4a3a, 0x3a3734, { haze: 0.3, hazeCol: 0x4a4038, spread: 0.12, sunDir, sunGlow: 0.3, sunCol: 0xd9ab84, clouds: 0.6, cloudCol: 0x4a403a, bands: 1, coldBand: 0.5, coldCol: 0x2a2d33 }));
  envGradient(scene, 0x2a2d33, 0x5a4a38, 0x2a241c, 0.4);
  const key = keyLight(scene, { color: 0xf2dcc6, intensity: 5, pos: [-50, 14, -150], target: [4, 4, -30], size: 90, radius: 3, far: 400, normalBias: 0.06 }); // sol baixo à frente-esquerda (contraluz)
  hemi(scene, 0x3b4250, 0x1c1814, 0.9);
  // terreno com vale transversal
  const SIZE = 360, SEG = 420;
  const h = (x, z) => { const valley = -10 * Math.exp(-((z + 40) ** 2) / (2 * 20 ** 2)) * (1 + 0.15 * Math.sin(x * 0.05)); return 3 + valley + (fbm(x * 0.025 + 1, z * 0.025, 4) - 0.5) * 7 + (fbm(x * 0.006, z * 0.006, 2) - 0.5) * 12 + 9 * Math.exp(-((x + 70) ** 2 + (z + 130) ** 2) / (2 * 40 ** 2)); };
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, h(p.getX(i), p.getZ(i))); geo.computeVertexNormals();
  const tMaps = procMaps(1024, (x, y) => clamp01(0.5 + (fbm(x * 40, y * 40, 3) - 0.5) * 0.4), { nStrength: 0.15, rBase: 0.94, rVar: 0.04, repeat: 3, colorFn: (x, y, hv) => { const m = 0.9 + (fbm(x * 20, y * 20, 3) - 0.5) * 0.3 + (hv - 0.5) * 0.1; return [0.21 * m, 0.2 * m, 0.16 * m]; } });
  const terr = new THREE.Mesh(geo, withMaps(std(0xffffff, { roughness: 1 }), tMaps, { normalScale: 0.8, mapAlso: true })); terr.receiveShadow = true; terr.castShadow = true; terr.material.normalScale.set(0.35, 0.35); scene.add(terr);
  // adutora: tubo de aço 1,6 u de raio sobre pilares de concreto, da direita em primeiro plano até o horizonte
  const steel = withMaps(std(0x4a4c50, { roughness: 0.42, metalness: 0.9 }), brushedMaps(512, { rBase: 0.42, rVar: 0.08, repeat: 8, dir: 1 }), { normalScale: 0.3 });
  const concrete = withMaps(std(0xffffff, { roughness: 0.88 }), concreteMaps(512, { color: 0x5a5753, dark: 0.22, boards: 4, repeat: 1, scale: 4 }), { normalScale: 0.6, mapAlso: true });
  const PX = 7.5, PY = 6.5, R = 1.6, Z0 = 30, Z1 = -220;
  const pipe = new THREE.Group(); pipe.position.x = PX; pipe.rotation.y = D2R(-4); scene.add(pipe);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Z0 - Z1, 48, 1), steel); tube.rotation.x = Math.PI / 2; tube.position.set(0, PY, (Z0 + Z1) / 2); tube.castShadow = true; tube.receiveShadow = true; pipe.add(tube);
  const ringGeo = new THREE.TorusGeometry(R + 0.06, 0.07, 10, 48), rings = [], piers = [];
  for (let z = Z0 - 6; z > Z1; z -= 12) {
    rings.push({ p: [0, PY, z], r: [0, 0, 0] });
    const wx = PX + Math.sin(D2R(-4)) * -z, gy = h(wx, z); const ph = PY - R - gy;
    if (ph > 0.3) { piers.push({ p: [0, gy + ph / 2 - 0.2, z], s: [1.4, ph + 0.4, 1.4] }); piers.push({ p: [0, PY - R - 0.15, z], s: [2.6, 0.5, 1.2] }); }
  }
  pipe.add(instances(ringGeo, std(0x3c3e42, { roughness: 0.5, metalness: 0.9 }), rings));
  pipe.add(instances(new THREE.BoxGeometry(1, 1, 1), concrete, piers));
  // segunda linha menor, mais à direita e mais baixa
  const tube2 = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, Z0 - Z1, 32, 1), steel); tube2.rotation.x = Math.PI / 2; tube2.position.set(4.5, PY - 1.6, (Z0 + Z1) / 2); tube2.castShadow = true; pipe.add(tube2);
  // torres de transmissão finas no horizonte (silhueta) + cabos
  const pyMat = std(0x26272a, { roughness: 0.7, metalness: 0.6 });
  const tops = [];
  for (const [x, z, hh] of [[-80, -170, 26], [-40, -185, 28], [-2, -200, 27], [38, -195, 26], [76, -175, 25], [-120, -160, 24]]) { const g = new THREE.Group(); const gy = h(x, z); g.position.set(x, gy, z); g.rotation.y = D2R(10); g.add(tubes(pylon(hh, 3), 0.09, pyMat, false)); scene.add(g); tops.push([x, gy + hh * 0.86, z]); }
  const wires = []; for (let i = 0; i < tops.length - 2; i++) { const a = tops[i], b = tops[i + 1]; for (const dy of [0, -1.8]) for (let k = 0; k < 8; k++) { const t0 = k / 8, t1 = (k + 1) / 8; const sag = (t) => -6 * 4 * t * (1 - t); wires.push([a[0] + (b[0] - a[0]) * t0, a[1] + dy + sag(t0), a[2] + (b[2] - a[2]) * t0, a[0] + (b[0] - a[0]) * t1, a[1] + dy + sag(t1), a[2] + (b[2] - a[2]) * t1]); } }
  line2(scene, wires, { color: 0x2a2a2c, width: 1.2, opacity: 0.7 });
  // névoa de vale em camadas
  const mists = [mist(scene, { w: 140, h: 6, y: h(0, -40) - 2, z: -40, x: -10, opacity: 0.26, color: 0x5a5650 }), mist(scene, { w: 220, h: 10, y: h(0, -90) - 2, z: -90, x: 0, opacity: 0.24, color: 0x5a5650 }), mist(scene, { w: 320, h: 16, y: h(0, -150) - 2, z: -150, x: 0, opacity: 0.3, color: 0x5a5650 })];
  const dof = { focus: 30, aperture: 0.00005, maxblur: 0.005 };
  const keyBase = key.position.clone();
  const update = (t) => { const s = Math.cos(t * TAU); aim(cam, [-4, h(-4, 26) + 5.5 - s * 0.2, 26 - s * 2.5], 6, -3); key.position.copy(keyBase).applyAxisAngle(new THREE.Vector3(0, 1, 0), D2R(s * 1.5)); mists.forEach((m, i) => { m.material.map.offset.x = 0.0025 * s * (i + 1); }); };
  return { cam, update, dof, exposure: 1.3 };
}

// =====================================================================
// INDÚSTRIA — galpão logístico, estantes porta-paletes em perspectiva, caixas uniformes, luz zenital
// =====================================================================
function industria(scene, aspect) {
  const cam = camera(35, aspect, 0.3, 300);
  scene.fog = new THREE.FogExp2(0x1e1e1f, 0.03);
  scene.add(gradientSphere(0x0a0b0d, 0x151516, 0x0a0b0d));
  envStudio(scene, 0.6);
  hemi(scene, 0x3a3f46, 0x1a1916, 1.4);
  RectAreaLightUniformsLib.init();
  // piso de concreto polido
  const fMaps = concreteMaps(1024, { color: 0x4e4c49, dark: 0.18, boards: 0, rBase: 0.35, rVar: 0.08, repeat: 8, scale: 4, nStrength: 0.3 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), withMaps(phys(0xffffff, { roughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.3 }), fMaps, { normalScale: 0.3, mapAlso: true })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // faixas de demarcação do corredor (ouro fosco, finas)
  const stripe = std(0x9a7d48, { roughness: 0.7 }); for (const x of [-1.95, 1.95]) scene.add(box(0.07, 0.004, 70, stripe, x, 0.003, -25, false));
  // estantes: montantes, longarinas, paletes e caixas uniformes
  const steel = std(0x3a3c40, { roughness: 0.45, metalness: 0.8 }), beam = std(0x4a4238, { roughness: 0.5, metalness: 0.7 });
  const pallet = withMaps(std(0xffffff, { roughness: 0.85 }), woodMaps(512, { color: 0x5a4a36, rBase: 0.85, scaleV: 20 }), { normalScale: 0.4, mapAlso: true });
  const cardboard = withMaps(std(0xffffff, { roughness: 0.9 }), noiseMaps(512, 10, { nStrength: 0.2, rBase: 0.9, color: 0x6b5c4a, colorVar: 0.06, oct: 3 }), { normalScale: 0.3, mapAlso: true });
  const r = rng(23);
  const BAY = 2.8, DEPTH = 1.1, LV = [0, 1.7, 3.5, 5.3], H = 7.2, NB = 24;
  const uprights = [], beams = [], pallets = [], boxes = [];
  for (const sx of [-1, 1]) {
    const x0 = sx * (2.6 + DEPTH / 2);
    for (let b = 0; b <= NB; b++) { const z = 6 - b * BAY; for (const dz of [-DEPTH / 2, DEPTH / 2]) uprights.push({ p: [x0, H / 2, z + dz], s: [0.1, H, 0.1] }); if (b % 2 === 0) for (let k = 0; k < 3; k++) uprights.push({ p: [x0, 1.2 + k * 2.6, z], s: [0.04, 0.04, DEPTH] }); }
    for (let b = 0; b < NB; b++) { const zc = 6 - b * BAY - BAY / 2; for (const lv of LV.slice(1)) for (const dz of [-DEPTH / 2 + 0.05, DEPTH / 2 - 0.05]) beams.push({ p: [x0, lv - 0.07, zc], s: [BAY - 0.12, 0.14, 0.08] }); ; for (const lv of LV) { for (const px of [-0.68, 0.68]) { if (r() < 0.12) continue; const bx = x0 + px * 0.0, bz = zc + px; pallets.push({ p: [x0, lv + 0.07, bz], s: [DEPTH, 0.14, 1.2] }); const n = lv === 0 ? 1 : (r() < 0.7 ? 1 : 2); for (let k = 0; k < n; k++) boxes.push({ p: [x0 + (r() - 0.5) * 0.04, lv + 0.14 + 0.5 + k * 1.0, bz + (r() - 0.5) * 0.04], r: [0, (r() - 0.5) * 0.03, 0], s: [1.0, 0.96 + (r() - 0.5) * 0.04, 1.1] }); } } }
  }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  scene.add(instances(unit, steel, uprights), instances(unit, beam, beams), instances(unit, pallet, pallets), instances(rboxGeo(1, 1, 1, 0.012), cardboard, boxes));
  // cobertura: tesouras metálicas e domos zenitais (emissivos) com RectArea para baixo + feixes
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(40, 120), std(0x1d1d1f, { roughness: 0.9 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 9.2, -40); scene.add(ceil);
  const truss = []; for (let z = 4; z > -70; z -= 7) { truss.push([-20, 8.6, z, 20, 8.6, z], [-20, 9.1, z, 20, 9.1, z]); for (let x = -20; x < 20; x += 1.4) truss.push([x, 8.6, z, x + 0.7, 9.1, z], [x + 0.7, 9.1, z, x + 1.4, 8.6, z]); }
  scene.add(tubes(truss, 0.04, steel, false));
  const sky = new THREE.MeshBasicMaterial({ color: 0xcfd8e2, fog: false }), lights = [], beamsL = [];
  const camPos0 = [-0.9, 1.7, 9];
  for (let z = 0; z > -64; z -= 8) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4), sky); m.rotation.x = Math.PI / 2; m.position.set(0, 9.15, z); scene.add(m);
    const L = new THREE.RectAreaLight(0xdfe6ee, z > -30 ? 40 : 25, 1.6, 4); L.position.set(0, 9.1, z); L.lookAt(0, 0, z); scene.add(L); lights.push(L);
    if (z > -40) beamsL.push(beamPlane(scene, { w: 2.4, h: 9.5, pos: [0, 4.6, z], dir: [0, -1, 0.001], camPos: camPos0, color: 0xdfe6ee, opacity: 0.045 }));
  }
  beamsL.forEach((b) => { b.userData.o = b.material.opacity; });
  const dustUpd = dust(scene, { n: 160, at: [0, 4.5, -8], box: [3, 8, 20], color: 0xe0e4ea, opacity: 0.08, size: 1.4, seed: 12 });
  // lâmpadas quentes nas estantes? não — só zenital neutra; um ponto quente ao fundo do corredor (saída)
  const endGlow = new THREE.PointLight(0xffc48f, 60, 30, 1.6); endGlow.position.set(0, 2.5, -62); scene.add(endGlow);
  halo(scene, [0, 3.2, -64], { size: 3, opacity: 0.35 });
  mist(scene, { w: 30, h: 3, y: 0, z: -30, opacity: 0.14, color: 0x3a3a3c }); mist(scene, { w: 30, h: 4, y: 0, z: -50, opacity: 0.18, color: 0x3a3a3c });
  const dof = { focus: 14, aperture: 0.00022, maxblur: 0.008 };
  const update = (t) => { const s = Math.cos(t * TAU); aim(cam, [-0.9, 1.9, 9 - s * 1.2], 2.5, 4 + s * 0.6); const k = 1 + 0.06 * s; beamsL.forEach((b) => { b.material.opacity = b.userData.o * k; }); dustUpd(t); };
  return { cam, update, dof, exposure: 1.7 };
}

// =====================================================================
// SAÚDE — corredor de clínica em vidro e pedra clara, luz difusa, uma linha de ouro no piso
// =====================================================================
function saude(scene, aspect) {
  const cam = camera(32, aspect, 0.2, 200);
  scene.fog = new THREE.FogExp2(0x2a2a2b, 0.045);
  scene.add(gradientSphere(0x0a0b0d, 0x1a1a1b, 0x0a0b0d));
  envStudio(scene, 0.7);
  hemi(scene, 0x4a5058, 0x24221f, 1.6);
  RectAreaLightUniformsLib.init();
  const W = 3.2, H = 3.1, L = 60;
  // piso de pedra clara polida com juntas
  const fMaps = procMaps(1024, (x, y) => { const fx = (x * 2) % 1, fy = (y * 2) % 1; const j = Math.exp(-Math.pow((fx - 0.5) / 0.01, 2)) + Math.exp(-Math.pow((fy - 0.5) / 0.01, 2)); return clamp01(0.5 + (fbm(x * 12, y * 12, 3) - 0.5) * 0.2 - 0.6 * Math.min(1, j)); }, { nStrength: 0.5, rBase: 0.28, rVar: 0.06, color: 0x6e6a66, colorVar: 0.08, repeat: 1 });
  for (const tx of [fMaps.normalMap, fMaps.roughnessMap, fMaps.map]) tx.repeat.set(W / 1.2, L / 1.2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), withMaps(phys(0xffffff, { roughness: 0.28, clearcoat: 0.5, clearcoatRoughness: 0.2 }), fMaps, { normalScale: 0.5, mapAlso: true })); floor.rotation.x = -Math.PI / 2; floor.position.z = -L / 2 + 8; floor.receiveShadow = true; scene.add(floor);
  const gold = GOLD({ roughness: 0.3 }); scene.add(box(0.03, 0.006, L, gold, 0.95, 0.003, -L / 2 + 8, false)); // linha de ouro no piso
  // parede direita em pedra clara com reentrâncias horizontais; parede esquerda em vidro com montantes; forro com rasgos de luz
  const sMaps = procMaps(1024, (x, y) => { const rows = 4, ry = y * rows, fy = ry - Math.floor(ry); const j = Math.exp(-Math.pow((fy - 0.5) / 0.015, 2)); return clamp01(0.5 + (fbm(x * 6, y * 24, 3) - 0.5) * 0.2 + fbm(x * 100, y * 100, 2) * 0.1 - 0.5 * j); }, { nStrength: 0.5, rBase: 0.6, rVar: 0.08, color: 0x7a7570, colorVar: 0.06, repeat: 1 });
  for (const tx of [sMaps.normalMap, sMaps.roughnessMap, sMaps.map]) tx.repeat.set(L / 3, 1);
  const wallR = new THREE.Mesh(new THREE.PlaneGeometry(L, H), withMaps(std(0xffffff, { roughness: 0.6 }), sMaps, { normalScale: 0.6, mapAlso: true })); wallR.rotation.y = -Math.PI / 2; wallR.position.set(W / 2, H / 2, -L / 2 + 8); wallR.receiveShadow = true; scene.add(wallR);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9aa4ac, roughness: 0.04, metalness: 0.0, transmission: 0.0, transparent: true, opacity: 0.35, envMapIntensity: 1.2, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.03 });
  const backLight = new THREE.PointLight(0xd8dde6, 30, 20, 1.6); backLight.position.set(-W / 2 - 2.5, 2.4, -10); scene.add(backLight);
  const wallL = new THREE.Mesh(new THREE.PlaneGeometry(L, H), glass); wallL.rotation.y = Math.PI / 2; wallL.position.set(-W / 2, H / 2, -L / 2 + 8); scene.add(wallL);
  const mull = std(0x2a2b2d, { roughness: 0.4, metalness: 0.8 }), mulls = [];
  for (let z = 8; z > -L + 8; z -= 1.5) mulls.push({ p: [-W / 2, H / 2, z], s: [0.06, H, 0.05] });
  mulls.push({ p: [-W / 2, 0.06, -L / 2 + 8], s: [0.08, 0.12, L] }, { p: [-W / 2, H - 0.06, -L / 2 + 8], s: [0.08, 0.12, L] });
  scene.add(instances(new THREE.BoxGeometry(1, 1, 1), mull, mulls));
  // atrás do vidro: salas escuras com uma parede ao fundo e balcões em silhueta
  const back = new THREE.Mesh(new THREE.PlaneGeometry(L, H), std(0x1c1c1e, { roughness: 0.9 })); back.rotation.y = Math.PI / 2; back.position.set(-W / 2 - 4.5, H / 2, -L / 2 + 8); scene.add(back);
  const r = rng(31); for (let z = 4; z > -L + 10; z -= 6) scene.add(rbox(1.6, 0.9 + r() * 0.3, 0.8, std(0x242426, { roughness: 0.6 }), -W / 2 - 2.2, 0.5, z - r() * 2, 0.02));
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, L), std(0x3a3a3c, { roughness: 0.9 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, -L / 2 + 8); scene.add(ceil);
  const slot = new THREE.MeshBasicMaterial({ color: 0xe8e2d8, fog: false }), lights = [];
  for (let z = 6; z > -L + 10; z -= 4) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 2.6), slot); m.rotation.x = Math.PI / 2; m.position.set(0.4, H - 0.01, z); scene.add(m);
    const Lg = new THREE.RectAreaLight(0xf2ece2, z > -20 ? 28 : 18, 0.12, 2.6); Lg.position.set(0.4, H - 0.02, z); Lg.lookAt(0.4, 0, z); scene.add(Lg); lights.push(Lg);
  }
  const wash = new THREE.RectAreaLight(0xc9d0d8, 5, L, 0.4); wash.position.set(-W / 2 + 0.3, H - 0.1, -L / 2 + 8); wash.lookAt(W / 2, 0.8, -L / 2 + 8); scene.add(wash); // lavagem fria da parede de pedra
  const graze = new THREE.RectAreaLight(0xffe0b8, 1.6, 0.5, 30); graze.position.set(0.95, 0.2, -8); graze.lookAt(0.95, 0, -8); scene.add(graze); // rasante no fio de ouro
  mist(scene, { w: 12, h: 2.5, y: 0, z: -18, opacity: 0.1, color: 0x404043 }); mist(scene, { w: 14, h: 3, y: 0, z: -34, opacity: 0.14, color: 0x404043 });
  const dof = { focus: 10, aperture: 0.0003, maxblur: 0.009 };
  const update = (t) => { const s = Math.cos(t * TAU); aim(cam, [-0.75, 1.5, 6.5 - s * 1.0], 0.5, 7 + s * 0.6); lights.forEach((L2, i) => { L2.intensity = (i < 7 ? 28 : 18) * (1 + 0.03 * s); }); };
  return { cam, update, dof, exposure: 1.5 };
}

// =====================================================================
// EDUCAÇÃO — anfiteatro com fileiras curvas de assentos em madeira escura, feixe de luz de uma abertura alta
// =====================================================================
function educacao(scene, aspect) {
  const cam = camera(35, aspect, 0.3, 300);
  scene.fog = new THREE.FogExp2(0x1a1917, 0.04);
  scene.add(gradientSphere(0x08090b, 0x151412, 0x08090b));
  envStudio(scene, 0.3);
  hemi(scene, 0x3a4048, 0x1c1914, 1.5);
  RectAreaLightUniformsLib.init();
  const keyPos = [16, 18, 10], keyTgt = [3, 1.5, 6], keyDir = keyTgt.map((v, i) => v - keyPos[i]);
  keyLight(scene, { color: 0xffd2a8, intensity: 5.5, pos: keyPos, target: keyTgt, size: 20, radius: 6, far: 80 }); // abertura alta à direita
  const beam = new THREE.SpotLight(0xffd2a8, DEBUG.includes('nokey') ? 0 : 2800, 60, D2R(16), 0.6, 1.6); beam.position.set(...keyPos); beam.target.position.set(...keyTgt); scene.add(beam.target, beam);
  // palco (madeira), fileiras (anéis) com degraus, assentos
  const wood = withMaps(std(0xffffff, { roughness: 0.5 }), woodMaps(1024, { color: 0x2e221a, rBase: 0.5, scaleV: 30 }), { normalScale: 0.4, mapAlso: true });
  const seatMat = withMaps(std(0xffffff, { roughness: 0.55 }), woodMaps(512, { color: 0x2a1e17, rBase: 0.55, scaleV: 18 }), { normalScale: 0.3, mapAlso: true });
  const conc = withMaps(std(0xffffff, { roughness: 0.9 }), concreteMaps(512, { color: 0x3a3836, dark: 0.15, repeat: 2, scale: 4 }), { normalScale: 0.4, mapAlso: true });
  const stage = new THREE.Mesh(new THREE.CircleGeometry(7.2, 64), wood); stage.rotation.x = -Math.PI / 2; stage.receiveShadow = true; scene.add(stage);
  const A0 = D2R(20), A1 = D2R(160), seats = [], backs = [];
  const r = rng(41);
  for (let row = 0; row < 11; row++) {
    const R0 = 7.2 + row * 1.15, y = row * 0.38;
    const ring = new THREE.Mesh(new THREE.RingGeometry(R0, R0 + 1.15, 72, 1, A0, A1 - A0), conc); ring.rotation.x = -Math.PI / 2; ring.position.y = y; ring.receiveShadow = true; scene.add(ring);
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(R0, R0, 0.38, 72, 1, true, A0 - Math.PI / 2, A1 - A0), conc); riser.position.y = y - 0.19; riser.material.side = THREE.DoubleSide; scene.add(riser);
    const nose = new THREE.Mesh(new THREE.TorusGeometry(R0 + 0.01, 0.02, 6, 96, A1 - A0), std(0x8a7a5a, { roughness: 0.6, metalness: 0.3 })); nose.rotation.x = -Math.PI / 2; nose.rotation.z = A0; nose.position.y = y + 0.005; scene.add(nose); // friso do degrau (latão fosco)
    const n = Math.floor((A1 - A0) * (R0 + 0.6) / 0.58);
    for (let k = 0; k < n; k++) { const a = A0 + (A1 - A0) * (k + 0.5) / n; const rr = R0 + 0.62; const x = Math.cos(a) * rr, z = Math.sin(a) * rr; const ry = -a + Math.PI / 2; seats.push({ p: [x, y + 0.45, z], r: [0, ry, 0], s: [0.5, 0.06, 0.46] }); backs.push({ p: [x + Math.cos(a) * 0.22, y + 0.72, z + Math.sin(a) * 0.22], r: [0, ry, 0], s: [0.5, 0.52, 0.05] }); if (k % 4 === 0) seats.push({ p: [x, y + 0.22, z], r: [0, ry, 0], s: [0.05, 0.44, 0.44] }); }
  }
  scene.add(instances(rboxGeo(1, 1, 1, 0.015), seatMat, seats), instances(rboxGeo(1, 1, 1, 0.015), seatMat, backs));
  // parede de fundo curva + forro escuro
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(20.5, 20.5, 9, 96, 1, true, A0 - Math.PI / 2 - 0.2, A1 - A0 + 0.4), withMaps(std(0x2c2a27, { roughness: 0.9, side: THREE.DoubleSide }), ashlarMaps(1024, 8), { normalScale: 0.3 })); wall.position.y = 4.5; scene.add(wall);
  for (const tx of [wall.material.normalMap, wall.material.roughnessMap]) tx.repeat.set(8, 1.5);
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(22, 64), std(0x141414, { roughness: 0.95 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = 9; scene.add(ceil);
  const warm = new THREE.RectAreaLight(0xffd9b0, 2.5, 14, 14); warm.position.set(0, 8.8, 8); warm.lookAt(0, 0, 8); scene.add(warm);
  // feixe + poeira
  const camPos0 = [-3.2, 2.9, 2.4];
  const beams = [beamPlane(scene, { w: 5.5, h: 24, pos: [8, 8, 8], dir: keyDir, camPos: camPos0, color: 0xffdcc0, opacity: 0.05 }), beamPlane(scene, { w: 2.4, h: 24, pos: [8, 8, 8], dir: keyDir, camPos: camPos0, color: 0xffe2cc, opacity: 0.1 })];
  beams.forEach((b) => { b.userData.o = b.material.opacity; });
  const dustUpd = dust(scene, { n: 220, at: [6, 4, 8], box: [6, 8, 6], opacity: 0.12, size: 1.5, seed: 44 });
  mist(scene, { w: 40, h: 2.5, y: 0, z: 2, opacity: 0.12, color: 0x3a3630 });
  const dof = { focus: 14, aperture: 0.00018, maxblur: 0.008 };
  const update = (t) => { const s = Math.cos(t * TAU); aim(cam, [-3.2 - s * 0.45, 2.9 - s * 0.15, 2.4 - s * 0.45], -1, -126 + s * 1.0); const k = 1 + 0.12 * s; beams.forEach((b) => { b.material.opacity = b.userData.o * k; }); beam.intensity = 2800 * k; dustUpd(t); };
  return { cam, update, dof, exposure: 1.9 };
}

// =====================================================================
// CRÉDITO — porta circular de cofre em aço escovado entreaberta, colunas de pedra ao lado, filete de ouro na borda
// =====================================================================
function credito(scene, aspect) {
  const cam = camera(40, aspect, 0.2, 200);
  scene.fog = new THREE.FogExp2(0x161617, 0.04);
  scene.add(gradientSphere(0x08090b, 0x141415, 0x08090b));
  envStudio(scene, 0.6);
  hemi(scene, 0x2a3038, 0x141412, 0.35);
  RectAreaLightUniformsLib.init();
  keyLight(scene, { color: 0xd8dde6, intensity: 3.0, pos: [-10, 11, 10], target: [1.1, 2.4, 0], size: 14, radius: 5, far: 60, map: 2048 }); // key neutra alta à esquerda
  const warm = new THREE.RectAreaLight(0xffd2a6, 4, 3, 8); warm.position.set(9, 4, 6); warm.lookAt(1.5, 2.4, 0); scene.add(warm); // 3200 K da direita, escova o aço
  const inner = new THREE.PointLight(0xffc48f, 40, 14, 1.8); inner.position.set(2.0, 2.6, -3.5); scene.add(inner); // interior do cofre, quente
  // parede de cantaria com abertura circular (extrusão com furo)
  const R = 2.3, CX = 1.1, CY = 2.5;
  const shape = new THREE.Shape(); shape.moveTo(-30, 0); shape.lineTo(30, 0); shape.lineTo(30, 12); shape.lineTo(-30, 12); shape.closePath();
  const hole = new THREE.Path(); hole.absarc(CX, CY, R + 0.02, 0, TAU, true); shape.holes.push(hole);
  const aMaps = ashlarMaps(1024, 6); const stone = withMaps(std(0x3c3b3a, { roughness: 0.7 }), aMaps, { normalScale: 0.5 }); for (const tx of [aMaps.normalMap, aMaps.roughnessMap]) tx.repeat.set(1 / 3.6, 1 / 3.6);
  const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: false }), stone); wall.position.z = -1.0; wall.receiveShadow = true; wall.castShadow = true; scene.add(wall);
  // colunas de pedra com capitel e base
  const colStone = withMaps(std(0x45443f, { roughness: 0.65 }), darkStoneMaps(512), { normalScale: 0.2 });
  for (const x of [-2.6, 4.8]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 5.2, 40), colStone); c.position.set(x, 2.6 + 0.25, 0.9); c.castShadow = true; c.receiveShadow = true; scene.add(c); scene.add(rbox(1.1, 0.25, 1.1, colStone, x, 0.125, 0.9, 0.015)); scene.add(rbox(1.0, 0.2, 1.0, colStone, x, 5.5, 0.9, 0.012)); scene.add(rbox(1.2, 0.12, 1.2, colStone, x, 5.66, 0.9, 0.01)); }
  const lintel = rbox(9.4, 0.5, 1.3, colStone, 1.1, 5.95, 0.9, 0.012); scene.add(lintel);
  // piso de pedra escura polida
  pavedFloor(scene, { color: 0x121416, size: 1.2, nx: 12, nz: 10, rough: 0.4, seed: 3 });
  // interior do cofre: paredes escuras e caixas (silhueta)
  const vaultIn = std(0x1a1a1c, { roughness: 0.8 }); scene.add(box(8, 8, 0.2, vaultIn, CX, 4, -6.2, false)); scene.add(box(0.2, 8, 6, vaultIn, CX - 3.2, 4, -3.2, false)); scene.add(box(0.2, 8, 6, vaultIn, CX + 3.2, 4, -3.2, false));
  const drawers = []; for (let y = 0.4; y < 5.5; y += 0.42) for (let x = -2.8; x < 2.8; x += 0.7) drawers.push({ p: [CX + x, y, -6.05], s: [0.64, 0.36, 0.1] }); scene.add(instances(new THREE.BoxGeometry(1, 1, 1), std(0x2c2c30, { roughness: 0.5, metalness: 0.8 }), drawers, false));
  // aro do batente (anel de aço) e porta
  const brushed = withMaps(new THREE.MeshPhysicalMaterial({ color: 0x8a8d92, roughness: 0.38, metalness: 1, envMapIntensity: 0.45 }), noiseMaps(512, 3, { nStrength: 0.15, rBase: 0.3, rVar: 0.05, oct: 2 }), { normalScale: 0.1 });
  const steelDark = new THREE.MeshPhysicalMaterial({ color: 0x4a4d52, roughness: 0.4, metalness: 1, envMapIntensity: 0.8 });
  const gold = GOLD({ roughness: 0.3 });
  const frame = new THREE.Mesh(new THREE.TorusGeometry(R + 0.12, 0.16, 16, 96), steelDark); frame.position.set(CX, CY, 0.02); frame.castShadow = true; scene.add(frame);
  const bore = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.02, R + 0.02, 1.1, 96, 1, true), steelDark); bore.rotation.x = Math.PI / 2; bore.position.set(CX, CY, -0.5); bore.material.side = THREE.DoubleSide; scene.add(bore);
  const hinge = new THREE.Group(); hinge.position.set(CX + R + 0.1, CY, 0.25); scene.add(hinge); // dobradiça à direita → a porta abre para a câmera e mostra a espessura
  for (const dy of [-1.4, 0, 1.4]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 24), steelDark); h.position.set(0, dy, 0); h.castShadow = true; hinge.add(h); }
  const door = new THREE.Group(); door.position.set(-(R + 0.1), 0, 0); hinge.add(door);
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.55, 96), brushed); slab.rotation.x = Math.PI / 2; slab.castShadow = true; slab.receiveShadow = true; door.add(slab);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.03, 0.014, 10, 128), gold); rim.position.z = 0.276; door.add(rim); // filete de ouro na borda da face
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(R - 0.03, 0.014, 10, 128), gold); rim2.position.z = -0.276; door.add(rim2);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(R - 0.45, 0.04, 10, 96), steelDark); ring2.position.z = 0.29; door.add(ring2);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 48), steelDark); hub.rotation.x = Math.PI / 2; hub.position.z = 0.33; door.add(hub);
  const wheel = new THREE.Group(); wheel.position.z = 0.5; door.add(wheel);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.045, 12, 64), steelDark)); for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 12), steelDark); sp.rotation.z = k * Math.PI / 3; wheel.add(sp); }
  const boltG = new THREE.CylinderGeometry(0.07, 0.07, 0.6, 16), bolts = []; for (let k = 0; k < 16; k++) { const a = k * TAU / 16; bolts.push({ p: [Math.cos(a) * (R - 0.03), Math.sin(a) * (R - 0.03), 0], r: [0, 0, a + Math.PI / 2] }); } door.add(instances(boltG, steelDark, bolts, false)); // trancas radiais na espessura
  const rimLight = new THREE.RectAreaLight(0xffe0b8, 1.6, 0.4, 5); rimLight.position.set(CX - R - 0.4, CY, 2.2); rimLight.lookAt(CX - R, CY, 0); scene.add(rimLight); // rasante na borda/filete
  mist(scene, { w: 30, h: 2, y: 0, z: 3, x: 2, opacity: 0.14, color: 0x3a3a3c });
  const dustUpd = dust(scene, { n: 100, at: [1.8, 2.5, 2], box: [6, 5, 4], opacity: 0.08, size: 1.4, seed: 51 });
  const dof = { focus: 9.5, aperture: 0.0003, maxblur: 0.009 };
  const update = (t) => { const s = Math.cos(t * TAU); hinge.rotation.y = D2R(-34 + 1.5 * s); aim(cam, [-0.8, 1.95, 9.5 - s * 0.9], 2, -6 + s * 0.5); dustUpd(t); };
  return { cam, update, dof, exposure: 1.4 };
}

const SCENES = {
  'indice': indice,
  'familias-empresarias-holdings': familiasHoldings,
  'agronegocio-patrimonio-rural': agro,
  'incorporacao-construcao-imobiliario': incorporacao,
  'cartorios-servicos-registrais': cartorios,
  'infraestrutura-saneamento-energia': infra,
  'industria-comercio-distribuicao': industria,
  'saude-profissionais-liberais': saude,
  'educacao-terceiro-setor': educacao,
  'credito-garantias-instituicoes-financeiras': credito,
};
const PP = (o = {}) => ({ vig: 0.28, grain: 0.024, desat: 0.08, desatHi: 0.1, chroma: 0.0007, ...o });
const POST_PARAMS = {
  'indice': PP({ desat: 0.1 }),
  'familias-empresarias-holdings': PP({ desat: 0.12, desatHi: 0.25 }),
  'agronegocio-patrimonio-rural': PP({ vig: 0.3, grain: 0.026, desat: 0.5, desatHi: 0.45 }),
  'incorporacao-construcao-imobiliario': PP({ desat: 0, desatHi: 0 }),
  'cartorios-servicos-registrais': PP({ vig: 0.32, desat: 0.1, desatHi: 0.2 }),
  'infraestrutura-saneamento-energia': PP({ vig: 0.3, grain: 0.026, desat: 0.35, desatHi: 0.3 }),
  'industria-comercio-distribuicao': PP({ desat: 0.15, desatHi: 0.15 }),
  'saude-profissionais-liberais': PP({ vig: 0.3, desat: 0.2, desatHi: 0.2 }),
  'educacao-terceiro-setor': PP({ vig: 0.3, desat: 0.1, desatHi: 0.2 }),
  'credito-garantias-instituicoes-financeiras': PP({ desat: 0.1, desatHi: 0.1 }),
};

// ---------- pós comum (idêntico ao de midia-home): aberração, vinheta, canto/faixa inferior, curva S, dessaturação, grão ----------
const POST = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, seed: { value: 0 }, grain: { value: 0.024 }, vig: { value: 0.28 }, desat: { value: 0.0 }, desatHi: { value: 0.0 }, chroma: { value: 0.0007 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
  fragmentShader: `
    uniform sampler2D tex; uniform float seed, grain, vig, desat, desatHi, chroma; varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main(){
      vec2 d = vUv - 0.5; float rr = dot(d, d);
      vec2 off = d * chroma * rr * 8.0;
      vec3 c = vec3(texture2D(tex, vUv + off).r, texture2D(tex, vUv).g, texture2D(tex, vUv - off).b);
      vec2 dv = d * vec2(1.0, 0.85);
      float v = 1.0 - vig * smoothstep(0.06, 0.62, dot(dv, dv));
      float bl = smoothstep(0.0, 0.8, length(vUv));
      float band = smoothstep(-0.05, 0.42, vUv.y);
      c *= v * mix(0.7, 1.0, bl) * mix(0.78, 1.0, band);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      vec3 s = gl_FragColor.rgb;
      s = pow(max(s * 1.05 + 0.02 * (1.0 - s), 0.0), vec3(1.0 / 0.95));
      s = mix(s, s * s * (3.0 - 2.0 * s), 0.25);
      float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
      float mid = 1.0 - smoothstep(0.0, 0.35, abs(lum - 0.4));
      float hi = smoothstep(0.55, 0.85, lum);
      s = mix(s, vec3(lum), clamp(desat * mid + desatHi * hi, 0.0, 1.0));
      float g = (hash(gl_FragCoord.xy + vec2(seed * 17.13, seed * 3.71)) - 0.5) * grain * 2.0 * (0.55 + 0.45 * (1.0 - lum)) * smoothstep(0.05, 0.14, lum);
      gl_FragColor.rgb = clamp(s + g, 0.0, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});

const canvas = document.getElementById('c');
renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;
pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();

let cur = null;
window.DMC = {
  init(name, w, h) {
    if (cur) { cur.composer.dispose(); cur.scene.traverse((o) => { o.geometry?.dispose?.(); }); }
    lineMats.length = 0;
    renderer.setSize(w, h, false);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(C.black);
    if (!SCENES[name]) throw new Error('cena desconhecida: ' + name);
    const { cam, update, dof, exposure } = SCENES[name](scene, w / h);
    renderer.toneMappingExposure = exposure ?? 1.15;
    const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4, type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, cam));
    composer.addPass(new BokehPass(scene, cam, { ...dof }));
    const pp = POST_PARAMS[name]; for (const k of ['vig', 'grain', 'desat', 'desatHi', 'chroma']) POST.uniforms[k].value = pp[k];
    composer.addPass(new ShaderPass(POST, 'tex'));
    cur = { scene, cam, update, composer };
    return true;
  },
  frame(t, seed) {
    const { cam, update, composer } = cur;
    update(t); cam.updateMatrixWorld();
    for (const m of lineMats) m.resolution.set(renderer.domElement.width, renderer.domElement.height);
    POST.uniforms.seed.value = seed;
    composer.render();
    return canvas.toDataURL('image/png');
  },
};
