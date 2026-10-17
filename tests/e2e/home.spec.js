// Home: painel dos 6 eixos (role=tablist) — setas, Home/End, tabindex móvel,
// um painel por vez, #eixo-N abre direto; hashchange troca o painel.
import { test, expect } from '@playwright/test';
import { abrir, causa, pagina } from './_site.js';

test.use({ viewport: { width: 1440, height: 900 } });

async function estado(page) {
  return page.evaluate(() => {
    const abas = [...document.querySelectorAll('#features [role="tab"]')];
    const paineis = [...document.querySelectorAll('#features [role="tabpanel"]')];
    return {
      selecionada: abas.findIndex((a) => a.getAttribute('aria-selected') === 'true') + 1,
      tabindex: abas.map((a) => a.tabIndex),
      visiveis: paineis.filter((p) => !p.hidden && p.getClientRects().length).map((p) => p.id),
      foco: document.activeElement?.id || null,
      hash: location.hash
    };
  });
}

test.describe('painel dos eixos', () => {
  test('estrutura ARIA: tablist com 6 tabs ligadas a 6 tabpanels', async ({ page }) => {
    pagina('/');
    await abrir(page, '/');
    const lista = page.locator('#features [role="tablist"]');
    await expect(lista).toHaveCount(1);
    await expect(lista).toHaveAttribute('aria-label', /.+/);
    const abas = lista.locator('[role="tab"]');
    await expect(abas).toHaveCount(6);
    for (let n = 1; n <= 6; n++) {
      const aba = page.locator(`#aba-eixo-${n}`);
      await expect(aba).toHaveAttribute('aria-controls', `eixo-${n}`);
      await expect(page.locator(`#eixo-${n}`)).toHaveAttribute('role', 'tabpanel');
      await expect(page.locator(`#eixo-${n}`)).toHaveAttribute('aria-labelledby', `aba-eixo-${n}`);
    }
    const e = await estado(page);
    expect(e.selecionada).toBe(1);
    expect(e.tabindex).toEqual([0, -1, -1, -1, -1, -1]);
    expect(e.visiveis).toEqual(['eixo-1']);
  });

  test('teclado: → ← Home End (com volta circular) e tabindex móvel', async ({ page }) => {
    pagina('/');
    await abrir(page, '/');
    await page.locator('#aba-eixo-1').focus();
    const passos = [
      ['ArrowRight', 2], ['ArrowRight', 3], ['ArrowLeft', 2], ['End', 6], ['ArrowRight', 1], ['ArrowLeft', 6], ['Home', 1]
    ];
    for (const [tecla, esperado] of passos) {
      await page.keyboard.press(tecla);
      const e = await estado(page);
      if (e.selecionada !== esperado || e.foco !== `aba-eixo-${esperado}`) causa(`tablist: ${tecla} não leva ao E${esperado}`);
      expect(e.selecionada, `${tecla} → E${esperado}`).toBe(esperado);
      expect(e.foco).toBe(`aba-eixo-${esperado}`);
      expect(e.visiveis).toEqual([`eixo-${esperado}`]);
      expect(e.tabindex.filter((t) => t === 0)).toHaveLength(1);
      expect(e.tabindex[esperado - 1]).toBe(0);
    }
    // Tab a partir da aba ativa sai da tablist (não percorre as 6 abas)
    await page.keyboard.press('Tab');
    const depois = await estado(page);
    expect(depois.foco || '').not.toMatch(/^aba-eixo-/);
  });

  test('clique numa aba troca o painel e atualiza #eixo-N', async ({ page }) => {
    pagina('/');
    await abrir(page, '/');
    await page.locator('#aba-eixo-5').click();
    const e = await estado(page);
    expect(e.selecionada).toBe(5);
    expect(e.visiveis).toEqual(['eixo-5']);
    expect(e.hash).toBe('#eixo-5');
  });

  for (const n of [1, 4, 6]) {
    test(`/#eixo-${n} abre o E${n} direto`, async ({ page }) => {
      pagina(`/#eixo-${n}`);
      await abrir(page, `/#eixo-${n}`);
      await page.waitForTimeout(300);
      const e = await estado(page);
      if (e.selecionada !== n) causa(`#eixo-${n} não abre o eixo`);
      expect(e.selecionada).toBe(n);
      expect(e.visiveis).toEqual([`eixo-${n}`]);
      await expect(page.locator('#features [role="tablist"]')).toBeInViewport();
    });
  }

  test('hashchange para #eixo-3 troca o painel sem recarregar', async ({ page }) => {
    pagina('/');
    await abrir(page, '/');
    await page.evaluate(() => { window.__semRecarga = 1; location.hash = '#eixo-3'; });
    await page.waitForTimeout(200);
    const e = await estado(page);
    expect(e.selecionada).toBe(3);
    expect(await page.evaluate(() => window.__semRecarga)).toBe(1);
  });
});
