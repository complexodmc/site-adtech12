// Console: 0 `console.error` e 0 `pageerror` em cada página do sitemap (desktop e 390px).
// Tolerado só o ruído externo documentado em _site.js (RUIDO_EXTERNO / iframe do YouTube).
import { test, expect } from '@playwright/test';
import { PAGINAS, abrir, rolarTudo, ehRuido, ehConsoleDeTerceiro, causa, pagina, anexar } from './_site.js';

for (const [rotulo, viewport] of [['desktop', { width: 1440, height: 900 }], ['390px', { width: 390, height: 844 }]]) {
  test.describe(`console ${rotulo}`, () => {
    test.use({ viewport, isMobile: viewport.width < 768, hasTouch: viewport.width < 1024 });
    for (const p of PAGINAS) {
      test(p.caminho, async ({ page, baseURL }) => {
        pagina(p.caminho);
        const erros = [];
        const ignorados = [];
        page.on('console', (m) => {
          if (m.type() !== 'error') return;
          const url = m.location()?.url || '';
          const texto = m.text();
          // "Failed to load resource" de recurso externo tolerado (mesma lista dos sub-recursos).
          if (ehConsoleDeTerceiro(m, baseURL) || (/Failed to load resource/.test(texto) && ehRuido(url, texto))) {
            ignorados.push({ texto, url });
            return;
          }
          erros.push({ tipo: 'console.error', texto: texto.slice(0, 300), url: url.replace(baseURL, '') });
        });
        page.on('pageerror', (e) => erros.push({ tipo: 'pageerror', texto: String(e.message).slice(0, 300), pilha: String(e.stack || '').split('\n').slice(0, 3).join(' | ') }));
        await abrir(page, p.caminho);
        await rolarTudo(page);
        await page.waitForTimeout(600);
        await anexar('console.json', { erros, ignorados });
        for (const e of erros) {
          const curto = e.texto.replace(baseURL, '').replace(/\s+/g, ' ').slice(0, 110);
          causa(`${e.tipo}: ${curto}`);
        }
        expect(erros, JSON.stringify(erros.slice(0, 4), null, 1)).toEqual([]);
      });
    }
  });
}
