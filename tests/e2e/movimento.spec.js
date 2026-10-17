// prefers-reduced-motion: o vídeo do herói não toca e fica o cartaz (poster).
// Controle: sem a preferência o <video> escolhe uma fonte (o teste não é vazio).
import { test, expect } from '@playwright/test';
import { abrir, causa, pagina, anexar } from './_site.js';

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
