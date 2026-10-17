// Navegação (<dmc-navbar>, assets/js/navbar.js): mega-menu "Eixos" (clique, Esc,
// teclado, foco), "Acessar" com 2 destinos, gaveta mobile (<1024px) com foco preso
// e devolvido. Roda na home e em uma página de cada família.
import { test, expect } from '@playwright/test';
import { abrir, causa, pagina } from './_site.js';

const AMOSTRA = ['/', '/pages/planejamento-sucessorio.html', '/solucoes/consultoria-trabalhista/ciclo-fechado'];

async function prontoNavbar(page, caminho) {
  pagina(caminho);
  await abrir(page, caminho);
  const ok = await page.locator('dmc-navbar header#navbar').count();
  if (!ok) causa('navbar.js não montou o <dmc-navbar>');
  await expect(page.locator('dmc-navbar header#navbar')).toHaveCount(1);
}
const focoEm = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? (a.id ? '#' + a.id : '') + '|' + a.tagName + '|' + (a.className || '') + '|' + (a.textContent || '').trim().slice(0, 30) : null;
});

for (const caminho of AMOSTRA) {
  test.describe(`desktop ${caminho}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('mega-menu Eixos: clique abre/fecha, 6 eixos com destino 200', async ({ page, request }) => {
      await prontoNavbar(page, caminho);
      const btn = page.locator('button[data-dmc="mega"]');
      const painel = page.locator('#dmc-mega');
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute('aria-expanded', 'false');
      await expect(painel).toBeHidden();
      await btn.click();
      await expect(btn).toHaveAttribute('aria-expanded', 'true');
      await expect(painel).toBeVisible();
      const links = painel.locator('.dmc-mega__item a');
      await expect(links).toHaveCount(6);
      for (const href of await links.evaluateAll((as) => as.map((a) => a.href))) {
        const r = await request.get(href, { failOnStatusCode: false });
        if (r.status() !== 200) causa(`mega-menu: destino ${new URL(href).pathname} → ${r.status()}`);
        expect(r.status(), href).toBe(200);
      }
      await btn.click();
      await expect(btn).toHaveAttribute('aria-expanded', 'false');
      await expect(painel).toBeHidden();
      // clique fora fecha
      await btn.click();
      await expect(painel).toBeVisible();
      await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
      await expect(painel).toBeHidden();
    });

    test('mega-menu Eixos: ↓ abre e foca o 1º eixo; Esc fecha e devolve o foco', async ({ page }) => {
      await prontoNavbar(page, caminho);
      const btn = page.locator('button[data-dmc="mega"]');
      const painel = page.locator('#dmc-mega');
      await btn.focus();
      await page.keyboard.press('ArrowDown');
      await expect(painel).toBeVisible();
      await expect(painel.locator('.dmc-mega__item a').first()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(painel).toBeHidden();
      await expect(btn).toBeFocused();
      await expect(btn).toHaveAttribute('aria-expanded', 'false');
    });

    test('mega-menu Eixos: Tab percorre o painel e, ao sair dele, fecha', async ({ page }) => {
      await prontoNavbar(page, caminho);
      const btn = page.locator('button[data-dmc="mega"]');
      const painel = page.locator('#dmc-mega');
      await btn.focus();
      await page.keyboard.press('ArrowDown');
      const n = await painel.evaluate((el) => el.querySelectorAll('a[href], button').length);
      for (let i = 0; i < n; i++) await page.keyboard.press('Tab');
      const dentro = await painel.evaluate((el) => el.contains(document.activeElement));
      if (dentro) causa('mega-menu: foco não sai do painel com Tab');
      expect(dentro).toBe(false);
      await expect(painel).toBeHidden();
    });

    test('mega-menu Eixos: Enter abre e o próximo Tab entra no painel', async ({ page }) => {
      await prontoNavbar(page, caminho);
      const btn = page.locator('button[data-dmc="mega"]');
      const painel = page.locator('#dmc-mega');
      await btn.focus();
      await page.keyboard.press('Enter');
      await expect(painel).toBeVisible();
      await page.keyboard.press('Tab');
      const onde = await focoEm(page);
      const dentro = await painel.evaluate((el) => el.contains(document.activeElement));
      if (!dentro) causa('mega-menu: Tab após abrir sai do painel (painel só alcançável por ↓)');
      expect(dentro, 'foco após Tab: ' + onde).toBe(true);
    });

    test('foco visível no gatilho Eixos', async ({ page }) => {
      await prontoNavbar(page, caminho);
      const btn = page.locator('button[data-dmc="mega"]');
      await btn.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(btn).toBeFocused();
      const c = await btn.evaluate((el) => { const s = getComputedStyle(el); return { estilo: s.outlineStyle, largura: parseFloat(s.outlineWidth), sombra: s.boxShadow, focoVisivel: el.matches(':focus-visible') }; });
      const visivel = (c.estilo !== 'none' && c.largura > 0) || c.sombra !== 'none';
      if (!visivel) causa('gatilho do mega-menu sem foco visível');
      expect(visivel, JSON.stringify(c)).toBe(true);
    });

    test('Acessar: 2 destinos (Área do aluno e Ad-tech)', async ({ page, request, baseURL }) => {
      await prontoNavbar(page, caminho);
      const btn = page.locator('button[data-dmc="access"]');
      const menu = page.locator('#dmc-access-menu');
      await expect(btn).toBeVisible();
      await btn.click();
      await expect(menu).toBeVisible();
      await expect(btn).toHaveAttribute('aria-expanded', 'true');
      const itens = await menu.locator('a').evaluateAll((as) => as.map((a) => ({ texto: a.textContent.trim(), href: a.href })));
      expect(itens).toHaveLength(2);
      const aluno = itens.find((i) => /Área do aluno/.test(i.texto));
      const adtech = itens.find((i) => /Ad-tech/i.test(i.texto));
      expect(aluno, 'item Área do aluno').toBeTruthy();
      expect(adtech, 'item Ad-tech').toBeTruthy();
      expect(new URL(aluno.href).pathname).toBe('/plataforma-ead/login.html');
      const r = await request.get(aluno.href, { failOnStatusCode: false });
      if (r.status() !== 200) causa(`Área do aluno → ${r.status()}`);
      expect(r.status()).toBe(200);
      expect(adtech.href).toMatch(/^https:\/\/adtech-app\.complexodmc\.com\.br\/?$/);
      expect(aluno.href.startsWith(baseURL)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(btn).toBeFocused();
    });
  });

  test.describe(`mobile 390px ${caminho}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('gaveta: abre, foco preso, Esc fecha e devolve o foco', async ({ page }) => {
      await prontoNavbar(page, caminho);
      const toggle = page.locator('.dmc-nav__toggle');
      const gaveta = page.locator('#dmc-drawer');
      await expect(page.locator('button[data-dmc="mega"]')).toBeHidden();
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(gaveta).toBeVisible();
      await expect(gaveta).toHaveAttribute('role', 'dialog');
      await expect(gaveta).toHaveAttribute('aria-modal', 'true');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('.dmc-drawer__close')).toBeFocused();
      // Acessar dentro da gaveta: 2 destinos
      await expect(gaveta.locator('.dmc-drawer__group a')).toHaveCount(2);
      // Eixos em acordeão
      const acc = gaveta.locator('.dmc-drawer__acc');
      await acc.click();
      await expect(acc).toHaveAttribute('aria-expanded', 'true');
      await expect(gaveta.locator('#dmc-drawer-eixos a')).toHaveCount(6);
      // Tab percorre e continua dentro (ida e volta)
      const total = await gaveta.evaluate((el) => [...el.querySelectorAll('a[href], button:not([disabled])')].filter((n) => n.getClientRects().length).length);
      let escapou = 0;
      for (let i = 0; i < total + 2; i++) {
        await page.keyboard.press('Tab');
        if (!(await gaveta.evaluate((el) => el.contains(document.activeElement)))) escapou++;
      }
      await page.locator('.dmc-drawer__close').focus();
      await page.keyboard.press('Shift+Tab');
      if (!(await gaveta.evaluate((el) => el.contains(document.activeElement)))) escapou++;
      if (escapou) causa('gaveta: foco escapa do diálogo');
      expect(escapou, 'saídas de foco do diálogo').toBe(0);
      await page.keyboard.press('Escape');
      await expect(gaveta).toBeHidden();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
      // Fechar pelo botão também devolve o foco
      await toggle.click();
      await page.locator('.dmc-drawer__close').click();
      await expect(gaveta).toBeHidden();
      await expect(toggle).toBeFocused();
    });
  });
}

test.describe('ponto de quebra 1024px', () => {
  test('1023px usa a gaveta; 1024px usa o mega-menu', async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 800 });
    await prontoNavbar(page, '/');
    await expect(page.locator('.dmc-nav__toggle')).toBeVisible();
    await expect(page.locator('button[data-dmc="mega"]')).toBeHidden();
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.locator('.dmc-nav__toggle')).toBeHidden();
    await expect(page.locator('button[data-dmc="mega"]')).toBeVisible();
  });
});
