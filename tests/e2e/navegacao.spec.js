// Navegação (<dmc-navbar>, assets/js/navbar.js): mega-menu "Eixos" (clique, Esc,
// teclado, foco), "Parcerias" com 3 destinos, "Acessar" (portal com 4 plataformas:
// 2 com login real, 2 em estruturação → apresentação em tecnologia.html), CTA
// dourado, gaveta mobile (<1200px) com foco preso e devolvido. Roda na home e em
// uma página de cada família.
import { test, expect } from '@playwright/test';
import { abrir, causa, pagina } from './_site.js';

const AMOSTRA = ['/', '/pages/planejamento-sucessorio.html', '/solucoes/consultoria-trabalhista/ciclo-fechado', '/parcerias/advogados-parceiros/'];

// Contraste WCAG entre duas cores "rgb(r, g, b)".
function contraste(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

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

    test('Acessar: portal com 4 plataformas; login só onde há destino real', async ({ page, request, baseURL }) => {
      await prontoNavbar(page, caminho);
      const btn = page.locator('button[data-dmc="access"]');
      const menu = page.locator('#dmc-access-menu');
      await expect(btn).toBeVisible();
      await btn.click();
      await expect(menu).toBeVisible();
      await expect(btn).toHaveAttribute('aria-expanded', 'true');
      const itens = await menu.locator('.dmc-portal__item a').evaluateAll((as) => as.map((a) => ({
        nome: a.querySelector('b').textContent.trim(), texto: a.textContent.trim(), href: a.href
      })));
      expect(itens.map((i) => i.nome)).toEqual(['DMC Business School', 'ADTECH', 'Artheu IA', 'Bloadhound']);
      const [school, adtech, artheu, bloadhound] = itens;
      // Login real: plataforma EAD (mesma origem) e ADTECH (app próprio).
      expect(new URL(school.href).pathname).toBe('/plataforma-ead/login.html');
      expect(school.href.startsWith(baseURL)).toBe(true);
      expect(adtech.href).toMatch(/^https:\/\/adtech-app\.complexodmc\.com\.br\/?$/);
      for (const i of [school, adtech]) expect(i.texto, i.nome).toMatch(/Entrar/);
      // Sem URL confirmada: nada de "Entrar"; leva à apresentação institucional.
      for (const [i, ancora] of [[artheu, '#artheu'], [bloadhound, '#bloadhound']]) {
        expect(i.texto, i.nome).toMatch(/Em estruturação/);
        expect(i.texto, i.nome).not.toMatch(/Entrar/);
        const u = new URL(i.href);
        expect(u.pathname + u.hash).toBe('/pages/tecnologia.html' + ancora);
      }
      for (const i of [school, artheu]) {
        const r = await request.get(i.href, { failOnStatusCode: false });
        if (r.status() !== 200) causa(`Acessar: ${i.nome} → ${r.status()}`);
        expect(r.status(), i.nome).toBe(200);
      }
      // As âncoras existem na página de tecnologia.
      const tec = await (await request.get('/pages/tecnologia.html')).text();
      for (const id of ['portal', 'business-school', 'adtech', 'artheu', 'bloadhound']) {
        if (!new RegExp(`id="${id}"`).test(tec)) causa(`tecnologia.html sem id="${id}"`);
        expect(tec, `id="${id}"`).toMatch(new RegExp(`id="${id}"`));
      }
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(btn).toBeFocused();
    });

    test('Parcerias: 3 destinos 200; ↓ abre e foca; Esc devolve o foco', async ({ page, request }) => {
      await prontoNavbar(page, caminho);
      const btn = page.locator('button[data-dmc="parcerias"]');
      const menu = page.locator('#dmc-sub-parcerias');
      await expect(btn).toBeVisible();
      await btn.focus();
      await page.keyboard.press('ArrowDown');
      await expect(menu).toBeVisible();
      await expect(menu.locator('a').first()).toBeFocused();
      const hrefs = await menu.locator('a').evaluateAll((as) => as.map((a) => new URL(a.href).pathname));
      expect(hrefs).toEqual(['/parcerias/', '/parcerias/advogados-parceiros/', '/parcerias/business-partner/']);
      for (const h of hrefs) {
        const r = await request.get(h, { failOnStatusCode: false });
        if (r.status() !== 200) causa(`Parcerias: ${h} → ${r.status()}`);
        expect(r.status(), h).toBe(200);
      }
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(btn).toBeFocused();
      if (caminho.startsWith('/parcerias/')) {
        await expect(btn).toHaveClass(/is-current/);
        await btn.click();
        await expect(menu.locator('a[aria-current="page"]')).toHaveCount(1);
      }
    });

    test('Tecnologia e CTA dourado: destinos reais e contraste ≥ 4,5:1', async ({ page, request }) => {
      await prontoNavbar(page, caminho);
      const tec = page.locator('.dmc-nav__links a.dmc-nav__link', { hasText: 'Tecnologia' });
      await expect(tec).toHaveCount(1);
      expect(new URL(await tec.evaluate((a) => a.href)).pathname).toBe('/pages/tecnologia.html');
      const cta = page.locator('.dmc-nav__cta--bar');
      await expect(cta).toBeVisible();
      await expect(cta).toHaveText(/Converse com nossos especialistas/);
      const destino = new URL(await cta.evaluate((a) => a.href));
      expect(destino.pathname + destino.hash).toBe('/#contact');
      const cor = await cta.evaluate((el) => { const s = getComputedStyle(el); return { fundo: s.backgroundColor, texto: s.color, altura: el.getBoundingClientRect().height }; });
      expect(cor.fundo).toBe('rgb(214, 176, 105)');
      const c = contraste(cor.fundo, cor.texto);
      if (c < 4.5) causa(`CTA com contraste ${c.toFixed(2)}:1`);
      expect(c).toBeGreaterThanOrEqual(4.5);
      expect(cor.altura).toBeGreaterThanOrEqual(44);
      const r = await request.get('/pages/tecnologia.html', { failOnStatusCode: false });
      expect(r.status()).toBe(200);
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
      // Acessar dentro da gaveta: as 4 plataformas; CTA dourado presente
      await expect(gaveta.locator('.dmc-drawer__group a')).toHaveCount(4);
      await expect(gaveta.locator('.dmc-nav__cta--drawer')).toBeVisible();
      // Eixos e Parcerias em acordeão
      const acc = gaveta.locator('.dmc-drawer__acc[aria-controls="dmc-drawer-eixos"]');
      await acc.click();
      await expect(acc).toHaveAttribute('aria-expanded', 'true');
      await expect(gaveta.locator('#dmc-drawer-eixos a')).toHaveCount(6);
      const accP = gaveta.locator('.dmc-drawer__acc[aria-controls="dmc-drawer-parcerias"]');
      if ((await accP.getAttribute('aria-expanded')) !== 'true') await accP.click();
      await expect(accP).toHaveAttribute('aria-expanded', 'true');
      await expect(gaveta.locator('#dmc-drawer-parcerias a')).toHaveCount(3);
      await expect(gaveta.locator('.dmc-drawer__list > li > a', { hasText: 'Tecnologia' })).toHaveCount(1);
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

test.describe('pontos de quebra da barra', () => {
  test('1199px usa a gaveta; 1200px usa a barra completa', async ({ page }) => {
    await page.setViewportSize({ width: 1199, height: 800 });
    await prontoNavbar(page, '/');
    await expect(page.locator('.dmc-nav__toggle')).toBeVisible();
    await expect(page.locator('button[data-dmc="mega"]')).toBeHidden();
    await expect(page.locator('button[data-dmc="access"]')).toBeHidden();
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.locator('.dmc-nav__toggle')).toBeHidden();
    await expect(page.locator('button[data-dmc="mega"]')).toBeVisible();
    await expect(page.locator('button[data-dmc="parcerias"]')).toBeVisible();
    await expect(page.locator('button[data-dmc="access"]')).toBeVisible();
  });

  test('CTA na barra a partir de 768px; abaixo, só na gaveta', async ({ page }) => {
    await page.setViewportSize({ width: 767, height: 800 });
    await prontoNavbar(page, '/');
    await expect(page.locator('.dmc-nav__cta--bar')).toBeHidden();
    await page.setViewportSize({ width: 768, height: 800 });
    await expect(page.locator('.dmc-nav__cta--bar')).toBeVisible();
  });

  test('altura da barra: 64px abaixo de 1024, 72px a partir de 1024', async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 800 });
    await prontoNavbar(page, '/pages/sobre.html');
    const altura = () => page.locator('.dmc-nav__bar').evaluate((el) => el.getBoundingClientRect().height);
    expect(await altura()).toBe(64);
    await page.setViewportSize({ width: 1024, height: 800 });
    expect(await altura()).toBe(72);
  });

  test('sem sobreposição nem estouro da barra de 1200 a 1920', async ({ page }) => {
    await prontoNavbar(page, '/pages/planejamento-sucessorio.html');
    for (const w of [1200, 1280, 1366, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 800 });
      const m = await page.evaluate(() => {
        const bar = document.querySelector('.dmc-nav__bar');
        const box = (s) => bar.querySelector(s).getBoundingClientRect();
        const cs = getComputedStyle(bar);
        const b = bar.getBoundingClientRect();
        return {
          folga: box('.dmc-nav__side').left - box('.dmc-nav__links').right,
          direita: b.right - parseFloat(cs.paddingRight) - box('.dmc-nav__side').right,
          linhas: [...bar.querySelectorAll('.dmc-nav__link, .dmc-nav__trigger, .dmc-nav__cta')].filter((el) => el.getClientRects().length && el.getBoundingClientRect().height > 50).length
        };
      });
      if (m.folga < 16 || m.direita < -1 || m.linhas) causa(`barra em ${w}px: ${JSON.stringify(m)}`);
      expect(m.folga, `folga em ${w}px`).toBeGreaterThanOrEqual(16);
      expect(m.direita, `estouro à direita em ${w}px`).toBeGreaterThanOrEqual(-1);
      expect(m.linhas, `itens quebrando linha em ${w}px`).toBe(0);
    }
  });
});
