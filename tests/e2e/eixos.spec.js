// Home · seção 03 "Seis Eixos" (#features) — grade 3×2 sem tablist.
// Contrato: HOME_REDESIGN.md §3.03 e contratos-qa.md §2.2. Substitui home.spec.js.
// 6 article#eixo-N visíveis ao mesmo tempo, 0 role=tab, 6 ícones distintos (<use href="#ico-eN">),
// /#eixo-N via :target, Tab percorre os 6 CTAs com foco visível, destino com o mesmo
// np-pillar-<slug>, <details> fechado com 21 links ≥ 44 px → 200 sem redirect e no sitemap.
import { test, expect } from '@playwright/test';
import { abrir, causa, pagina, anexar, EIXOS, CATALOGO_EIXOS, estaNoSitemap, focoVisivel } from './_site.js';

const VIEWPORTS = [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]];

async function estrutura(page) {
  return page.evaluate(() => {
    const sec = document.querySelector('section#features');
    if (!sec) return null;
    const artigos = [...sec.querySelectorAll('article[id^="eixo-"]')];
    return {
      ariaLabelledby: sec.getAttribute('aria-labelledby'),
      h2: sec.querySelector('h2')?.id || null,
      roles: sec.querySelectorAll('[role="tab"], [role="tabpanel"], [role="tablist"]').length,
      artigos: artigos.map((a) => {
        const r = a.getBoundingClientRect();
        const use = a.querySelector('svg use');
        const href = use ? (use.getAttribute('href') || use.getAttribute('xlink:href')) : null;
        const simbolo = href && href.startsWith('#') ? document.getElementById(href.slice(1)) : null;
        const cta = a.querySelector('a.eixos-item__cta');
        return {
          id: a.id, dataEixo: a.getAttribute('data-eixo'), classe: a.className,
          hidden: a.hidden || getComputedStyle(a).display === 'none' || r.height === 0,
          labelledby: a.getAttribute('aria-labelledby'),
          titulo: a.querySelector('h3')?.textContent.trim() || '', tituloId: a.querySelector('h3')?.id || null,
          svgAriaHidden: a.querySelector('svg')?.getAttribute('aria-hidden') === 'true',
          icone: href, simboloExiste: !!simbolo, simboloTag: simbolo?.tagName.toLowerCase() || null,
          cta: cta ? { href: cta.getAttribute('href'), texto: cta.textContent.trim() } : null
        };
      }),
      details: (() => {
        const d = sec.querySelector('details.eixos-catalogo');
        if (!d) return null;
        return { open: d.open, links: [...d.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')) };
      })()
    };
  });
}

for (const [rotulo, viewport] of VIEWPORTS) {
  test.describe(`seis eixos ${rotulo}px`, () => {
    test.use({ viewport, isMobile: viewport.width < 768 });

    test('estrutura: 6 artigos visíveis, 0 tab/tabpanel, 6 ícones distintos, nomes oficiais', async ({ page }) => {
      pagina('/');
      await abrir(page, '/');
      const e = await estrutura(page);
      await anexar('eixos-estrutura.json', e);
      expect(e, 'section#features existe').not.toBeNull();
      expect(e.ariaLabelledby && e.h2 && e.ariaLabelledby === e.h2, 'aria-labelledby → h2 da seção').toBe(true);
      if (e.roles) causa('role=tab/tabpanel/tablist ainda presente em #features');
      expect(e.roles, 'elementos com role tab/tabpanel/tablist').toBe(0);
      expect(e.artigos.map((a) => a.id)).toEqual(EIXOS.map((x) => `eixo-${x.n}`));
      const ocultos = e.artigos.filter((a) => a.hidden).map((a) => a.id);
      if (ocultos.length) causa('artigo de eixo oculto (todos devem estar visíveis ao mesmo tempo)');
      expect(ocultos).toEqual([]);
      for (const x of EIXOS) {
        const a = e.artigos[x.n - 1];
        expect(a.dataEixo, `${a.id} data-eixo`).toBe(String(x.n));
        expect(a.classe, `${a.id} acento`).toContain(`np-pillar-${x.slug}`);
        expect(a.tituloId, `${a.id} h3 id`).toBe(`eixo-${x.n}-titulo`);
        expect(a.labelledby, `${a.id} aria-labelledby`).toBe(`eixo-${x.n}-titulo`);
        expect(a.titulo, `${a.id} nome oficial`).toMatch(x.nome);
        expect(a.svgAriaHidden, `${a.id} svg aria-hidden`).toBe(true);
        expect(a.icone, `${a.id} <use href>`).toBe(`#ico-e${x.n}`);
        expect(a.simboloExiste && a.simboloTag === 'symbol', `${a.id} symbol #ico-e${x.n} no sprite`).toBe(true);
        expect(a.cta, `${a.id} CTA`).not.toBeNull();
        expect(a.cta.href).toBe(x.href);
        expect(a.cta.texto).toMatch(/Explorar solu[çc][õo]es/i);
      }
      expect(new Set(e.artigos.map((a) => a.titulo)).size, '6 títulos distintos').toBe(6);
      expect(new Set(e.artigos.map((a) => a.icone)).size, '6 ícones distintos').toBe(6);
      // Conteúdo dos símbolos também distinto (ícone exclusivo por eixo, não só id)
      const corpos = await page.evaluate(() => [1, 2, 3, 4, 5, 6].map((n) => (document.getElementById(`ico-e${n}`)?.innerHTML || '').replace(/\s+/g, '')));
      expect(new Set(corpos).size, 'desenhos distintos nos 6 symbols').toBe(6);
      expect(e.artigos.some((a) => /tecnologia/i.test(a.titulo)), '"Tecnologia" não é eixo').toBe(false);
    });

    for (const n of [1, 4, 6]) {
      test(`/#eixo-${n}: artigo em viewport e :target resolvido`, async ({ page }) => {
        pagina(`/#eixo-${n}`);
        await abrir(page, `/#eixo-${n}`);
        await page.waitForTimeout(400);
        const art = page.locator(`#eixo-${n}`);
        await expect(art).toBeVisible();
        const alvo = await page.evaluate((id) => ({ target: document.querySelector(':target')?.id || null, hash: location.hash, scrollY: window.scrollY }), n);
        await anexar('eixo-target.json', alvo);
        if (alvo.target !== `eixo-${n}`) causa(`:target não aponta para #eixo-${n}`);
        expect(alvo.target).toBe(`eixo-${n}`);
        if (!(await art.isVisible()) || !(await art.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; }))) causa(`#eixo-${n} fora da viewport ao abrir /#eixo-${n}`);
        await expect(art).toBeInViewport();
        // Nenhum JS de painel: não há hashchange a tratar; o fio de acento fica aberto via :target
        const artigosVisiveis = await page.locator('#features article[id^="eixo-"]:visible').count();
        expect(artigosVisiveis, 'os 6 artigos continuam visíveis').toBe(6);
      });
    }

    test('teclado: Tab a partir do h2 percorre os 6 CTAs em ordem, cada um com foco visível', async ({ page }) => {
      pagina('/');
      await abrir(page, '/');
      await page.locator('#features').scrollIntoViewIfNeeded();
      await page.evaluate(() => { const h = document.querySelector('#features h2'); h.tabIndex = -1; h.focus(); });
      const sequencia = [];
      for (let i = 1; i <= 6; i++) {
        await page.keyboard.press('Tab');
        const f = await focoVisivel(page);
        const eixo = await page.evaluate(() => document.activeElement?.closest('article[id^="eixo-"]')?.id || null);
        sequencia.push({ passo: i, eixo, ...f });
      }
      await anexar('eixos-teclado.json', sequencia);
      const ordem = sequencia.map((s) => s.eixo);
      if (ordem.join() !== EIXOS.map((x) => `eixo-${x.n}`).join()) causa('Tab não percorre os 6 CTAs na ordem E1→E6 (há outro foco intermediário ou CTA fora da ordem)');
      expect(ordem).toEqual(EIXOS.map((x) => `eixo-${x.n}`));
      const semFoco = sequencia.filter((s) => !s.visivel);
      if (semFoco.length) causa('CTA de eixo sem foco visível (outline/box-shadow)');
      expect(semFoco, JSON.stringify(semFoco)).toEqual([]);
      // O 7.º Tab sai dos artigos (vai ao summary do catálogo ou adiante), não volta ao E1
      await page.keyboard.press('Tab');
      const depois = await page.evaluate(() => ({ eixo: document.activeElement?.closest('article[id^="eixo-"]')?.id || null, tag: document.activeElement?.tagName.toLowerCase() }));
      expect(depois.eixo).toBeNull();
    });

    test('destinos: CTA → 200 sem redirect e <body> com o mesmo np-pillar-<slug>', async ({ page, request }) => {
      pagina('/');
      await abrir(page, '/');
      const ctas = await page.evaluate(() => [...document.querySelectorAll('#features article[id^="eixo-"] a.eixos-item__cta')].map((a) => ({ eixo: a.closest('article').id, slug: [...a.closest('article').classList].find((c) => c.startsWith('np-pillar-')), href: a.getAttribute('href'), url: a.href })));
      expect(ctas).toHaveLength(6);
      const problemas = [];
      const relatorio = [];
      for (const c of ctas) {
        const r = await request.get(c.url, { maxRedirects: 0 });
        const html = r.status() === 200 ? await r.text() : '';
        const body = /<body[^>]*class="([^"]*)"/i.exec(html)?.[1] || '';
        const item = { ...c, status: r.status(), location: r.headers().location || null, bodyClass: body };
        relatorio.push(item);
        if (r.status() !== 200) problemas.push({ ...item, causa: 'destino não responde 200 direto' });
        else if (!body.split(/\s+/).includes(c.slug)) problemas.push({ ...item, causa: 'body da página destino não tem o mesmo np-pillar' });
      }
      await anexar('eixos-destinos.json', relatorio);
      for (const p of problemas) causa(`${p.eixo}: ${p.causa}`);
      expect(problemas).toEqual([]);
    });

    test('catálogo <details>: fechado por padrão, 21 links ≥ 44 px, todos 200 sem redirect e no sitemap', async ({ page, request }) => {
      pagina('/');
      await abrir(page, '/');
      const d = page.locator('#features details.eixos-catalogo');
      await expect(d).toHaveCount(1);
      expect(await d.evaluate((el) => el.open), 'details fechado por padrão').toBe(false);
      await expect(d.locator('summary')).toContainText(/solu[çc][õo]es/i);
      const hrefs = await d.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      await anexar('eixos-catalogo.json', hrefs);
      if (hrefs.length !== 21) causa(`catálogo com ${hrefs.length} links (esperado 21)`);
      expect(hrefs).toHaveLength(21);
      expect([...hrefs].sort()).toEqual([...CATALOGO_EIXOS].sort());
      expect(hrefs.some((h) => /planejamento-sucessorio-empresarial|#contact/.test(h)), 'sem link 301 nem "#contact" no catálogo').toBe(false);
      // Abrir e medir o alvo de toque de cada link
      await d.locator('summary').click();
      expect(await d.evaluate((el) => el.open)).toBe(true);
      const alvos = await d.locator('a[href]').evaluateAll((as) => as.map((a) => { const r = a.getBoundingClientRect(); return { href: a.getAttribute('href'), h: Math.round(r.height), w: Math.round(r.width) }; }));
      const pequenos = alvos.filter((a) => a.h < 44);
      if (pequenos.length) causa(`${pequenos.length} links do catálogo com alvo < 44 px de altura`);
      expect(pequenos, JSON.stringify(pequenos.slice(0, 5))).toEqual([]);
      // Rede: 200 sem redirect e no sitemap
      const ruins = [];
      for (const h of hrefs) {
        const r = await request.get(new URL(h, page.url()).href, { maxRedirects: 0 });
        if (r.status() !== 200) ruins.push({ href: h, status: r.status(), location: r.headers().location || null });
        else if (!estaNoSitemap(h)) ruins.push({ href: h, causa: 'fora do sitemap' });
      }
      for (const r of ruins) causa(`catálogo: ${r.href} ${r.causa || 'responde ' + r.status}`);
      expect(ruins).toEqual([]);
    });
  });
}

test.describe('seis eixos sem JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  test('os 6 artigos, 6 CTAs, sprite e catálogo vêm no HTML servido', async ({ page }) => {
    pagina('/');
    await abrir(page, '/');
    const e = await estrutura(page);
    expect(e).not.toBeNull();
    expect(e.artigos.map((a) => a.id)).toEqual(EIXOS.map((x) => `eixo-${x.n}`));
    expect(e.artigos.filter((a) => a.hidden)).toEqual([]);
    expect(e.artigos.every((a) => a.cta && a.simboloExiste), 'CTA e symbol presentes sem JS').toBe(true);
    expect(e.details?.links).toHaveLength(21);
    expect(e.roles).toBe(0);
  });
});
