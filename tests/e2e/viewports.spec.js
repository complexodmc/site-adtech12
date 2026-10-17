// Overflow horizontal (scrollWidth > clientWidth) em 7 larguras × páginas do sitemap.
// Mede no carregamento e depois de rolar a página inteira (revelações e lazy-load).
import { test, expect } from '@playwright/test';
import { PAGINAS, VIEWPORTS, abrir, rolarTudo, causa, pagina, anexar } from './_site.js';

const ALTURA = { 320: 640, 375: 812, 390: 844, 768: 1024, 1024: 768, 1440: 900, 1920: 1080 };

async function medir(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const cw = de.clientWidth;
    const culpados = [];
    const cortaX = (el) => {
      for (let a = el.parentElement; a && a !== document.body && a !== de; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox !== 'visible') return true;
      }
      return false;
    };
    const seletor = (el) => {
      const partes = [];
      for (let e = el; e && e.nodeType === 1 && partes.length < 4; e = e.parentElement) {
        let s = e.tagName.toLowerCase();
        if (e.id) { s += '#' + e.id; partes.unshift(s); break; }
        const cls = [...e.classList].slice(0, 2).join('.');
        if (cls) s += '.' + cls;
        partes.unshift(s);
      }
      return partes.join(' > ');
    };
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > cw + 1 || r.left < -1) {
        if (cortaX(el)) continue;
        const pos = getComputedStyle(el).position;
        if (pos === 'fixed') continue; // fixo fora da tela (gaveta fechada) não gera rolagem
        culpados.push({ el: seletor(el), left: Math.round(r.left), right: Math.round(r.right) });
      }
    }
    culpados.sort((a, b) => b.right - a.right);
    return { scrollWidth: de.scrollWidth, clientWidth: cw, bodyScrollWidth: document.body.scrollWidth, culpados: culpados.slice(0, 8) };
  });
}

for (const largura of VIEWPORTS) {
  test.describe(`${largura}px`, () => {
    test.use({ viewport: { width: largura, height: ALTURA[largura] }, isMobile: largura < 768, hasTouch: largura < 1024 });
    for (const p of PAGINAS) {
      test(`overflow ${p.caminho}`, async ({ page }) => {
        pagina(p.caminho);
        await abrir(page, p.caminho);
        await page.waitForTimeout(300);
        const inicio = await medir(page);
        await rolarTudo(page);
        await page.waitForTimeout(400);
        const depois = await medir(page);
        const pior = depois.scrollWidth - depois.clientWidth >= inicio.scrollWidth - inicio.clientWidth ? depois : inicio;
        await anexar('overflow.json', { largura, inicio, depois });
        const excesso = pior.scrollWidth - pior.clientWidth;
        if (excesso > 0) causa(`overflow horizontal em ${largura}px`);
        expect(excesso, `scrollWidth ${pior.scrollWidth} > clientWidth ${pior.clientWidth}; culpados: ${JSON.stringify(pior.culpados.slice(0, 3))}`).toBeLessThanOrEqual(0);
      });
    }
  });
}
