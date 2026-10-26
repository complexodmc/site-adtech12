// Home · contratos transversais das 10 seções (HOME_REDESIGN.md §1.3, §2.8, §6; contratos-qa.md §3.2).
// Ordem dos ids; #video antes de #contact; conformidade (0 ocorrências) e atribuição na mesma
// seção quando se cita ato privativo; axe por seção (1440 e 390); overflow por seção (320–1920);
// <img> fora do herói com lazy/width/height/≤ 250 KB; 0 marca/logo de terceiro fora do rodapé.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  abrir, rolarTudo, causa, pagina, anexar, textoVisivel, overflowPorSecao,
  SECOES_HOME, VIEWPORTS, ALTURA_VIEWPORT, RE_CONFORMIDADE, RE_ATO_PRIVATIVO, RE_ATRIBUICAO, RE_MARCAS_TERCEIROS
} from './_site.js';

const LIMITE_IMG = 250 * 1024;

test.describe('estrutura da home', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('ordem das 10 seções, #video antes de #contact, h2 + aria-labelledby, âncoras preservadas', async ({ page }) => {
    pagina('/');
    await abrir(page, '/');
    const e = await page.evaluate(() => {
      const secs = [...document.querySelectorAll('main section[id]')];
      return {
        ids: secs.map((s) => s.id),
        cabecalhos: secs.map((s) => {
          const lab = s.getAttribute('aria-labelledby');
          const alvo = lab ? document.getElementById(lab) : null;
          return { id: s.id, labelledby: lab, alvoTag: alvo?.tagName.toLowerCase() || null, alvoDentro: !!(alvo && s.contains(alvo)), h2: s.querySelectorAll(':scope h2').length, h1: s.querySelectorAll('h1').length };
        }),
        h1: document.querySelectorAll('h1').length,
        mainHome: document.querySelector('main#conteudo')?.classList.contains('home') ?? null,
        videoFrame: !!document.querySelector('#video .page-video__frame[data-video]'),
        ancoras: ['features', 'contact', 'conheca'].filter((id) => !document.getElementById(id)),
        spriteNoMain: !!document.querySelector('main > svg[hidden] symbol[id^="ico-e"]'),
        canvasConheca: document.querySelectorAll('#conheca canvas').length,
        tabsFora: [...document.querySelectorAll('main [role="tab"]')].map((t) => t.closest('section')?.id || '?').filter((id) => id !== 'conheca')
      };
    });
    await anexar('home-estrutura.json', e);
    const presentes = e.ids.filter((id) => SECOES_HOME.includes(id));
    const faltam = SECOES_HOME.filter((id) => !e.ids.includes(id));
    if (faltam.length) causa(`seções ausentes: ${faltam.join(', ')}`);
    expect(faltam).toEqual([]);
    if (presentes.join() !== SECOES_HOME.join()) causa('ordem das seções difere da §1.3');
    expect(presentes).toEqual(SECOES_HOME);
    expect(e.ids.indexOf('video')).toBeLessThan(e.ids.indexOf('contact'));
    expect(e.videoFrame, '#video .page-video__frame[data-video]').toBe(true);
    expect(e.h1, 'um só h1').toBe(1);
    expect(e.ancoras, 'âncoras usadas por navbar/rodapé/internas').toEqual([]);
    const semRotulo = e.cabecalhos.filter((c) => !(c.labelledby && c.alvoDentro && (c.alvoTag === 'h2' || (c.id === 'hero' && c.alvoTag === 'h1'))));
    if (semRotulo.length) causa('seção sem aria-labelledby → h2 próprio');
    expect(semRotulo).toEqual([]);
    const semH2 = e.cabecalhos.filter((c) => c.id !== 'hero' && c.h2 < 1).map((c) => c.id);
    expect(semH2, 'seções 02–10 com h2').toEqual([]);
    // role=tab só na seção 02 (sobreposição do diretor: #conheca fica como está)
    if (e.tabsFora.length) causa(`role=tab fora de #conheca: ${[...new Set(e.tabsFora)].join(', ')}`);
    expect(e.tabsFora).toEqual([]);
    expect(e.spriteNoMain, 'sprite de ícones dos eixos como filho de <main>').toBe(true);
  });

  test('conformidade: 0 ocorrências de promessa/percentual/número sem fonte; atos citados com atribuição na mesma seção', async ({ page }) => {
    pagina('/');
    await abrir(page, '/');
    await rolarTudo(page);
    const porSecao = [];
    for (const id of SECOES_HOME) {
      const texto = await textoVisivel(page, `#${id}`);
      if (texto == null) continue;
      const hits = [...texto.matchAll(new RegExp(RE_CONFORMIDADE.source, 'gi'))].map((m) => ({ termo: m[0], contexto: texto.slice(Math.max(0, m.index - 40), m.index + 60) }));
      const atos = [...texto.matchAll(new RegExp(RE_ATO_PRIVATIVO.source, 'gi'))].map((m) => m[0]);
      porSecao.push({ secao: id, hits, atos: [...new Set(atos.map((a) => a.toLowerCase()))], atribui: RE_ATRIBUICAO.test(texto) });
    }
    await anexar('home-conformidade.json', porSecao);
    const comHit = porSecao.filter((s) => s.hits.length);
    for (const s of comHit) causa(`conformidade em #${s.secao}: ${s.hits.map((h) => `"${h.termo}"`).join(', ')}`);
    expect(comHit.map((s) => ({ secao: s.secao, hits: s.hits.map((h) => h.contexto) }))).toEqual([]);
    const semAtribuicao = porSecao.filter((s) => s.atos.length && !s.atribui);
    for (const s of semAtribuicao) causa(`#${s.secao} cita ato (${s.atos.join(', ')}) sem "parceiros habilitados/cartórios conveniados" na mesma seção`);
    expect(semAtribuicao.map((s) => ({ secao: s.secao, atos: s.atos }))).toEqual([]);
  });

  test('terceiros: 0 marca em texto/alt/aria-label e 0 logo de terceiro fora do rodapé', async ({ page }) => {
    pagina('/');
    await abrir(page, '/');
    await rolarTudo(page);
    const texto = await textoVisivel(page, 'main');
    const marcas = [...texto.matchAll(new RegExp(RE_MARCAS_TERCEIROS.source, 'gi'))].map((m) => ({ termo: m[0], contexto: texto.slice(Math.max(0, m.index - 40), m.index + 60) }));
    const logos = await page.evaluate(() => [...document.querySelectorAll('main img, main svg')]
      .filter((el) => !el.closest('#hero') && !el.closest('footer'))
      .map((el) => ({ tag: el.tagName.toLowerCase(), src: el.getAttribute('src') || '', alt: el.getAttribute('alt') || '', classe: el.className?.baseVal ?? el.className ?? '', label: el.getAttribute('aria-label') || '', titulo: el.querySelector?.('title')?.textContent || '' }))
      .filter((i) => /(?<![a-z])(logo|marca|brand|selo)/i.test(`${i.src} ${i.alt} ${i.classe} ${i.label} ${i.titulo}`) && !/rino|dmc|complexo/i.test(`${i.src} ${i.alt} ${i.classe} ${i.label} ${i.titulo}`)));
    await anexar('home-terceiros.json', { marcas, logos });
    if (marcas.length) causa(`marca de terceiro na home: ${marcas.map((m) => m.termo).join(', ')}`);
    expect(marcas).toEqual([]);
    if (logos.length) causa('logo de terceiro fora do rodapé');
    expect(logos).toEqual([]);
  });

  test('como funciona/conteúdo: datetime ISO ≤ hoje, 0 placeholder, 0 login.html?curso=, links internos 200', async ({ page, request }) => {
    pagina('/');
    await abrir(page, '/');
    const e = await page.evaluate(() => ({
      times: [...document.querySelectorAll('#leituras time')].map((t) => t.getAttribute('datetime')),
      placeholder: [...document.querySelectorAll('#leituras *')].filter((el) => el.children.length === 0 && /lorem|t[íi]tulo do artigo|em breve|substituir/i.test(el.textContent)).map((el) => el.textContent.trim().slice(0, 60)),
      linksPubli: [...document.querySelectorAll('#leituras a[href]')].map((a) => a.href),
      cursoLogin: [...document.querySelectorAll('#como-funciona a[href*="login.html?curso="], #leituras a[href*="login.html?curso="]')].map((a) => a.getAttribute('href')),
      linksEad: [...document.querySelectorAll('#como-funciona a[href]')].map((a) => a.href)
    }));
    await anexar('home-leituras.json', e);
    const hoje = new Date().toISOString().slice(0, 10);
    const ruins = e.times.filter((d) => !/^\d{4}-\d{2}-\d{2}/.test(d || '') || Number.isNaN(Date.parse(d)) || d.slice(0, 10) > hoje);
    expect(ruins, 'datetime inválido ou futuro').toEqual([]);
    if (e.placeholder.length) causa('placeholder de conteúdo em #leituras');
    expect(e.placeholder).toEqual([]);
    if (e.cursoLogin.length) causa('link login.html?curso= em 07/08');
    expect(e.cursoLogin).toEqual([]);
    const quebrados = [];
    for (const u of [...new Set([...e.linksPubli, ...e.linksEad])]) {
      if (!u.startsWith(new URL(page.url()).origin)) continue;
      const r = await request.get(u, { maxRedirects: 0 });
      if (r.status() !== 200) quebrados.push({ url: u, status: r.status() });
    }
    expect(quebrados, 'links internos de 07/08').toEqual([]);
  });
});

for (const [rotulo, viewport] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]) {
  test.describe(`axe por seção ${rotulo}px`, () => {
    test.use({ viewport, isMobile: viewport.width < 768 });
    for (const id of SECOES_HOME) {
      test(`#${id}`, async ({ page }) => {
        pagina(`/#${id}`);
        await abrir(page, '/');
        await rolarTudo(page);
        await page.locator(`#${id}`).scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        // Contraste é do estado final (§7): espera as revelações da seção terminarem (--dur-reveal 700 ms + --stagger × --i,
        // até ~1 s em .fluxo-etapa[--i:4]); senão o axe mistura o texto em fade com o papel e reprova color-contrast.
        await page.waitForFunction((sel) => [...document.querySelectorAll(`${sel} .dmc-reveal`)].every((el) => parseFloat(getComputedStyle(el).opacity) >= 0.999), `#${id}`, { timeout: 3000 }).catch(() => {});
        const r = await new AxeBuilder({ page }).include(`#${id}`).analyze();
        const graves = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => ({ regra: v.id, impacto: v.impact, nos: v.nodes.length, ajuda: v.help, exemplos: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
        await anexar('axe-secao.json', { secao: id, graves, moderadas: r.violations.filter((v) => !['serious', 'critical'].includes(v.impact)).map((v) => ({ regra: v.id, impacto: v.impact, nos: v.nodes.length })) });
        for (const v of graves) causa(`axe ${v.regra} (${v.impacto}) em #${id}`);
        expect(graves, JSON.stringify(graves.map(({ regra, nos, exemplos }) => ({ regra, nos, ex: exemplos[0] })))).toEqual([]);
      });
    }
  });

  test.describe(`imagens ${rotulo}px`, () => {
    test.use({ viewport, isMobile: viewport.width < 768 });
    test('fora do herói: loading=lazy, width/height, decoding=async, src na origem, ≤ 250 KB', async ({ page }) => {
      pagina('/');
      const tamanhos = new Map();
      page.on('response', async (resp) => {
        if (resp.request().resourceType() !== 'image') return;
        try {
          const cl = Number(resp.headers()['content-length']);
          tamanhos.set(resp.url(), Number.isFinite(cl) && cl > 0 ? cl : (await resp.body()).length);
        } catch { /* resposta já descartada */ }
      });
      await abrir(page, '/');
      await rolarTudo(page);
      await page.waitForTimeout(1200);
      const imgs = await page.evaluate(() => [...document.querySelectorAll('main img')].filter((i) => !i.closest('#hero')).map((i) => ({
        src: i.getAttribute('src'), atual: i.currentSrc, lazy: i.getAttribute('loading'), decoding: i.getAttribute('decoding'),
        width: i.getAttribute('width'), height: i.getAttribute('height'), alt: i.getAttribute('alt'), secao: i.closest('section')?.id || null,
        picture: !!i.closest('picture'), fontes: [...(i.closest('picture')?.querySelectorAll('source') || [])].map((s) => s.getAttribute('type')),
        naturalW: i.naturalWidth, exibidaW: Math.round(i.getBoundingClientRect().width)
      })));
      const origem = new URL(page.url()).origin;
      const problemas = [];
      for (const i of imgs) {
        const bytes = tamanhos.get(i.atual) ?? null;
        if (i.lazy !== 'lazy') problemas.push({ ...i, causa: 'sem loading="lazy"' });
        if (!i.width || !i.height) problemas.push({ ...i, causa: 'sem width/height (CLS)' });
        if (i.alt === null) problemas.push({ ...i, causa: 'sem atributo alt' });
        if (i.atual && !i.atual.startsWith(origem) && !i.atual.startsWith('data:')) problemas.push({ ...i, causa: 'src fora da origem' });
        if (bytes !== null && bytes > LIMITE_IMG) problemas.push({ ...i, bytes, causa: `imagem > 250 KB (${Math.round(bytes / 1024)} KB)` });
        if (i.secao === 'verticais') {
          if (!i.picture || !i.fontes.includes('image/avif') || !i.fontes.includes('image/webp')) problemas.push({ ...i, causa: 'vertical sem <picture> avif+webp' });
          if (i.decoding !== 'async') problemas.push({ ...i, causa: 'vertical sem decoding="async"' });
        }
      }
      await anexar('home-imagens.json', { imgs: imgs.map((i) => ({ ...i, bytes: tamanhos.get(i.atual) ?? null })), problemas });
      for (const p of [...new Set(problemas.map((p) => `${p.secao}: ${p.causa}`))]) causa(`imagem em #${p}`);
      expect(problemas.map((p) => ({ secao: p.secao, src: p.src, causa: p.causa }))).toEqual([]);
    });
  });
}

for (const largura of VIEWPORTS) {
  test.describe(`overflow por seção ${largura}px`, () => {
    test.use({ viewport: { width: largura, height: ALTURA_VIEWPORT[largura] }, isMobile: largura < 768, hasTouch: largura < 1024 });
    test('nenhuma seção (nem filho não cortado) ultrapassa a largura da janela, antes e depois de rolar', async ({ page }) => {
      pagina('/');
      await abrir(page, '/');
      await page.waitForTimeout(300);
      const antes = await overflowPorSecao(page);
      await rolarTudo(page);
      await page.waitForTimeout(400);
      const depois = await overflowPorSecao(page);
      await anexar('overflow-secoes.json', { largura, antes, depois });
      const culpadas = [...antes.secoes, ...depois.secoes].filter((s) => s.culpados.length);
      const nomes = [...new Set(culpadas.map((s) => s.secao))];
      for (const n of nomes) causa(`overflow horizontal em #${n} (${largura}px)`);
      expect(nomes, JSON.stringify(culpadas.slice(0, 3))).toEqual([]);
      expect(Math.max(antes.scrollWidth, depois.scrollWidth) - antes.clientWidth, 'scrollWidth − clientWidth').toBeLessThanOrEqual(0);
    });
  });
}
