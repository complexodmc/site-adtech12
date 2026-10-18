// prefers-reduced-motion e movimento contínuo da home.
// 1) Herói: com reduce o vídeo não toca e fica o cartaz; controle sem preferência.
// 2) #conheca: rede neural (rede-neural.js v2) parada ou ausente com reduce (teste mantido).
// 3) #presenca (HOME_REDESIGN §3.06 / contratos-qa §2.4): 390 → 0 canvas e SVG visível;
//    1440 + reduce → data-motion="still" e ≤ 1 rAF/s; 1440 controle → "running" e > 10 rAF/s;
//    27 UFs, 1 sede, texto sem número de cobertura, 0 requisições fora da origem.
// 4) #verticais (§3.05): loops de vídeo nunca recebem src em 390 nem com reduce; controle em 1440.
import { test, expect } from '@playwright/test';
import { abrir, causa, pagina, anexar, ehRuido, instalarContadorRaf, contarRaf, textoVisivel } from './_site.js';

async function heroi(page) {
  return page.evaluate(() => {
    const v = document.querySelector('.hero__video');
    const img = document.querySelector('.hero__poster img');
    const r = img?.getBoundingClientRect();
    return v ? {
      fonte: v.currentSrc || '', pausado: v.paused, tempo: v.currentTime, tocando: v.classList.contains('is-playing'),
      autoplay: v.hasAttribute('autoplay'), cartazVisivel: !!(img && img.complete && img.naturalWidth > 0 && r.width > 0 && getComputedStyle(img).visibility !== 'hidden'),
      opacidadeVideo: getComputedStyle(v).opacity
    } : null;
  });
}

for (const [rotulo, viewport] of [['desktop', { width: 1440, height: 900 }], ['390px', { width: 390, height: 844 }]]) {
  test.describe(`herói ${rotulo}`, () => {
    test.use({ viewport, isMobile: viewport.width < 768 });

    test('reduce: vídeo não toca, cartaz visível', async ({ page }) => {
      pagina('/');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await abrir(page, '/');
      await page.waitForTimeout(1500);
      const h = await heroi(page);
      await anexar('heroi-reduce.json', h);
      expect(h, 'herói com .hero__video').not.toBeNull();
      const tocou = !h.pausado || h.tempo > 0 || h.tocando;
      if (tocou) causa('vídeo do herói toca com prefers-reduced-motion');
      expect(tocou, JSON.stringify(h)).toBe(false);
      expect(h.cartazVisivel).toBe(true);
    });

    test('no-preference (controle): o vídeo seleciona uma fonte', async ({ page }) => {
      pagina('/');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await abrir(page, '/');
      await page.waitForTimeout(1500);
      const h = await heroi(page);
      await anexar('heroi-normal.json', h);
      expect(h.fonte, 'currentSrc do vídeo').not.toBe('');
    });
  });
}

test('reduce: rede neural da home não anima (canvas parado ou ausente)', async ({ page }) => {
  pagina('/');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrir(page, '/');
  await page.locator('#conheca').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const quadros = await page.evaluate(async () => {
    const c = document.querySelector('#conheca canvas');
    if (!c) return { canvas: false };
    const tirar = () => { try { return c.toDataURL().length + ':' + c.toDataURL().slice(-64); } catch { return 'tainted'; } };
    const a = tirar();
    await new Promise((r) => setTimeout(r, 700));
    return { canvas: true, mudou: a !== tirar() };
  });
  await anexar('rede-reduce.json', quadros);
  if (quadros.mudou) causa('rede neural anima com prefers-reduced-motion');
  expect(quadros.mudou ?? false).toBe(false);
});

// ---------------------------------------------------------------------------
// 06 · Presença Nacional — #presenca
// ---------------------------------------------------------------------------
async function presenca(page) {
  return page.evaluate(() => {
    const sec = document.querySelector('section#presenca');
    if (!sec) return null;
    const fig = sec.querySelector('[data-rede="brasil"], .presenca-mapa');
    const svg = sec.querySelector('svg.presenca-mapa__svg, svg[role="img"]');
    const r = svg?.getBoundingClientRect();
    const sedes = [...sec.querySelectorAll('.is-sede')];
    return {
      motion: fig?.getAttribute('data-motion') || null,
      canvas: sec.querySelectorAll('canvas').length,
      svgVisivel: !!(svg && r.width > 0 && r.height > 0 && getComputedStyle(svg).visibility !== 'hidden' && getComputedStyle(svg).display !== 'none'),
      svgRole: svg?.getAttribute('role') || null,
      svgTitulo: svg ? (document.getElementById(svg.getAttribute('aria-labelledby') || '')?.textContent || svg.querySelector('title')?.textContent || '').trim() : '',
      ufs: new Set([...sec.querySelectorAll('path[data-uf]')].map((p) => p.getAttribute('data-uf'))).size,
      sedes: sedes.map((e) => e.getAttribute('data-uf'))
    };
  });
}

test.describe('presença nacional 390px', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const pref of ['reduce', 'no-preference']) {
    test(`${pref}: 0 canvas em #presenca e SVG visível (fallback estático)`, async ({ page }) => {
      pagina('/');
      await page.emulateMedia({ reducedMotion: pref });
      await abrir(page, '/');
      await page.locator('#presenca').scrollIntoViewIfNeeded();
      await page.waitForTimeout(1200);
      const p = await presenca(page);
      await anexar(`presenca-390-${pref}.json`, p);
      expect(p, 'section#presenca existe').not.toBeNull();
      if (p.canvas) causa('canvas montado em #presenca abaixo de 768 px');
      expect(p.canvas).toBe(0);
      expect(p.motion).not.toBe('running');
      expect(p.svgVisivel, 'SVG do Brasil visível').toBe(true);
    });
  }
});

test.describe('presença nacional 1440px', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('reduce: data-motion="still" (ou sem canvas) e ≤ 1 rAF por segundo com a seção em viewport', async ({ page }) => {
    pagina('/');
    await instalarContadorRaf(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await abrir(page, '/');
    await page.locator('#presenca').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200); // revelações e montagem terminam
    const p = await presenca(page);
    const raf = await contarRaf(page, 1000);
    await anexar('presenca-reduce.json', { ...p, rafPorSegundo: raf });
    expect(p).not.toBeNull();
    const parado = p.canvas === 0 || p.motion === 'still';
    if (!parado) causa('mapa de #presenca anima com prefers-reduced-motion');
    expect(parado, JSON.stringify(p)).toBe(true);
    if (raf > 1) causa(`${raf} requestAnimationFrame/s com reduce (esperado ≤ 1)`);
    expect(raf).toBeLessThanOrEqual(1);
  });

  test('no-preference (controle): data-motion="running" e > 10 rAF por segundo', async ({ page }) => {
    pagina('/');
    await instalarContadorRaf(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await abrir(page, '/');
    await page.locator('#presenca').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    const p = await presenca(page);
    const raf = await contarRaf(page, 1000);
    await anexar('presenca-controle.json', { ...p, rafPorSegundo: raf });
    expect(p).not.toBeNull();
    if (p.motion !== 'running' || p.canvas < 1) causa('canvas de #presenca não monta em 1440 sem reduce (teste de reduce ficaria vazio)');
    expect(p.motion).toBe('running');
    expect(p.canvas).toBeGreaterThanOrEqual(1);
    expect(raf, 'rAF/s com a seção visível').toBeGreaterThan(10);
    // Aba oculta → pára (visibilitychange)
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(300);
    const rafOculto = await contarRaf(page, 700);
    await anexar('presenca-oculto.json', { rafEm700ms: rafOculto });
    if (rafOculto > 2) causa('canvas de #presenca continua animando com a aba oculta');
    expect(rafOculto).toBeLessThanOrEqual(2);
  });

  test('geografia e texto: 27 UFs, SP única sede, SVG role=img com título, sem número de cobertura', async ({ page }) => {
    pagina('/');
    await abrir(page, '/');
    const p = await presenca(page);
    const texto = await textoVisivel(page, '#presenca');
    await anexar('presenca-geografia.json', { ...p, texto });
    expect(p).not.toBeNull();
    expect(p.ufs, 'path[data-uf] distintos').toBe(27);
    expect(p.sedes, 'uma só .is-sede = SP').toEqual(['SP']);
    expect(p.svgRole).toBe('img');
    expect(p.svgTitulo.length, 'título acessível do mapa').toBeGreaterThan(5);
    const numero = /\d+\s*(estados|pa[íi]ses|cidades|munic[íi]pios|clientes|%)/i.exec(texto || '');
    if (numero) causa(`número de cobertura em #presenca: "${numero[0]}"`);
    expect(numero).toBeNull();
  });

  test('rede: nenhuma requisição fora da origem disparada pela seção (CSP connect-src self)', async ({ page }) => {
    pagina('/');
    await abrir(page, '/');
    // Só o que a seção dispara: ouvinte ligado depois do `load` (Google Fonts do <head> já saíram).
    const externas = [];
    const origem = new URL(page.url()).origin;
    page.on('request', (r) => { const u = r.url(); if (!u.startsWith(origem) && !/^(data|blob):/.test(u) && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u) && !ehRuido(u)) externas.push({ url: u, tipo: r.resourceType() }); });
    await page.locator('#presenca').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await page.mouse.move(900, 450);
    await page.waitForTimeout(400);
    await anexar('presenca-rede.json', externas);
    if (externas.length) causa('requisição externa com #presenca em viewport (tiles/CDN)');
    expect(externas).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 05 · Verticais — loops de vídeo (gate: ≥1024 e sem reduce e sem saveData)
// ---------------------------------------------------------------------------
async function videosVerticais(page) {
  return page.evaluate(() => {
    const sec = document.querySelector('section#verticais');
    if (!sec) return null;
    const vs = [...sec.querySelectorAll('video')];
    return {
      total: vs.length,
      comSrc: vs.filter((v) => v.getAttribute('src') || v.querySelector('source[src]') || (v.currentSrc && v.currentSrc !== '')).length,
      tocando: vs.filter((v) => v.classList.contains('is-playing') || (!v.paused && v.currentTime > 0)).length,
      hidden: vs.filter((v) => v.hidden).length
    };
  });
}

test.describe('verticais 390px', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('nenhum vídeo recebe src (0 video[src]) abaixo de 1024', async ({ page }) => {
    pagina('/');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await abrir(page, '/');
    await page.locator('#verticais').scrollIntoViewIfNeeded();
    await page.evaluate(async () => { const s = document.querySelector('#verticais'); const ini = s.offsetTop; for (let y = ini; y < ini + s.offsetHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } });
    await page.waitForTimeout(800);
    const v = await videosVerticais(page);
    await anexar('verticais-390.json', v);
    expect(v, 'section#verticais existe').not.toBeNull();
    if (v.comSrc) causa('vídeo de vertical com src em 390 px (bytes gastos no celular)');
    expect(v.comSrc).toBe(0);
    expect(v.tocando).toBe(0);
  });
});

test.describe('verticais 1440px', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('reduce: 0 video[src] e nenhum tocando', async ({ page }) => {
    pagina('/');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await abrir(page, '/');
    await page.evaluate(async () => { const s = document.querySelector('#verticais'); if (!s) return; const ini = s.offsetTop; for (let y = ini; y < ini + s.offsetHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } });
    await page.waitForTimeout(800);
    const v = await videosVerticais(page);
    await anexar('verticais-reduce.json', v);
    expect(v).not.toBeNull();
    if (v.comSrc || v.tocando) causa('loop de vertical carrega/toca com prefers-reduced-motion');
    expect(v.comSrc).toBe(0);
    expect(v.tocando).toBe(0);
  });

  test('no-preference (controle): ≥ 1 vídeo is-playing após rolar os painéis', async ({ page }) => {
    pagina('/');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await abrir(page, '/');
    await page.evaluate(async () => { const s = document.querySelector('#verticais'); if (!s) return; const ini = s.offsetTop; for (let y = ini; y < ini + s.offsetHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, ini + 200); });
    await page.waitForTimeout(2500);
    const v = await videosVerticais(page);
    await anexar('verticais-controle.json', v);
    expect(v).not.toBeNull();
    expect(v.total, 'painéis com <video>').toBeGreaterThan(0);
    if (!v.tocando) causa('nenhum loop de vertical toca em 1440 sem reduce (mídia ausente ou gate errado) — teste de reduce ficaria vazio');
    expect(v.tocando).toBeGreaterThanOrEqual(1);
  });
});
