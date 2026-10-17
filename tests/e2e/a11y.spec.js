// Acessibilidade: axe-core (0 violações serious/critical) + estrutura mínima
// (1 h1, 1 <main>, controles de formulário com nome acessível, lang pt).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PAGINAS, abrir, rolarTudo, causa, pagina, anexar } from './_site.js';

test.describe('axe serious/critical', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  for (const p of PAGINAS) {
    test(p.caminho, async ({ page }) => {
      pagina(p.caminho);
      await abrir(page, p.caminho);
      await rolarTudo(page); // .reveal/.dmc-reveal só ficam visíveis depois de rolar
      await page.waitForTimeout(700);
      const r = await new AxeBuilder({ page }).analyze();
      const graves = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      // Nó dentro de iframe: target = [seletor do iframe, seletor interno]. Conta como falha
      // (o usuário recebe), mas a causa fica marcada — no site, o caso real é o embed direto
      // do YouTube em vez da fachada de assets/js/video.js.
      const iframes = await page.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => f.src));
      const resumo = graves.map((v) => ({
        regra: v.id, impacto: v.impact, nos: v.nodes.length, ajuda: v.help,
        emIframe: v.nodes.every((n) => n.target.length > 1),
        exemplos: v.nodes.slice(0, 3).map((n) => n.target.join(' '))
      }));
      await anexar('axe.json', { iframes, graves: resumo, moderadas: r.violations.filter((v) => !graves.includes(v)).map((v) => ({ regra: v.id, impacto: v.impact, nos: v.nodes.length })), incompletas: r.incomplete.length });
      const terceiro = iframes.some((u) => /youtube(-nocookie)?\.com/.test(u)) ? 'iframe do YouTube embutido direto' : 'iframe';
      for (const v of resumo) causa(`axe ${v.regra} (${v.impacto})${v.emIframe ? ` — dentro de ${terceiro}` : ''}`);
      expect(resumo, JSON.stringify(resumo.map(({ regra, nos, exemplos }) => ({ regra, nos, ex: exemplos[0] })))).toEqual([]);
    });
  }
});

test.describe('estrutura (h1, main, labels, lang)', () => {
  for (const p of PAGINAS) {
    test(p.caminho, async ({ page }) => {
      pagina(p.caminho);
      await abrir(page, p.caminho);
      await page.waitForTimeout(200);
      const e = await page.evaluate(() => {
        const nomeAcessivel = (el) => {
          if (el.labels && [...el.labels].some((l) => l.textContent.trim())) return true;
          if ((el.getAttribute('aria-label') || '').trim()) return true;
          const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
          if (ids.some((id) => (document.getElementById(id)?.textContent || '').trim())) return true;
          return !!(el.getAttribute('title') || '').trim();
        };
        const controles = [...document.querySelectorAll('input, select, textarea')]
          .filter((el) => !['hidden', 'submit', 'button', 'reset', 'image'].includes((el.getAttribute('type') || '').toLowerCase()));
        return {
          h1: document.querySelectorAll('h1').length,
          main: document.querySelectorAll('main, [role="main"]').length,
          lang: document.documentElement.getAttribute('lang') || '',
          semLabel: controles.filter((el) => !nomeAcessivel(el)).map((el) => el.outerHTML.slice(0, 120))
        };
      });
      await anexar('estrutura.json', e);
      if (e.h1 !== 1) causa(`${e.h1} h1 (esperado 1)`);
      if (e.main !== 1) causa(`${e.main} <main> (esperado 1)`);
      if (e.semLabel.length) causa('controle de formulário sem nome acessível');
      if (!/^pt/i.test(e.lang)) causa('html sem lang="pt-BR"');
      expect.soft(e.h1, 'quantidade de h1').toBe(1);
      expect.soft(e.main, 'quantidade de <main>').toBe(1);
      expect.soft(e.semLabel, 'controles sem nome acessível').toEqual([]);
      expect.soft(e.lang, 'lang do <html>').toMatch(/^pt/i);
    });
  }
});
