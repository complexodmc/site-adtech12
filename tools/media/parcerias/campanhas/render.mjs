// Renderiza as peças de campanha da Central de Parcerias (PROPOSTO — sujeito a revisão).
//   node tools/media/parcerias/campanhas/render.mjs                 # peças + apresentações
//   node tools/media/parcerias/campanhas/render.mjs --only pecas-pl # um arquivo
//   node tools/media/parcerias/campanhas/render.mjs --preview <dir> # PNG de cada slide para conferência
// Peças: cada <article class="art" data-name> vira PNG em docs/dmc/parcerias/campanhas/pecas/.
// Apresentações: apresentacao-*.html viram PDF 16:9 (1600×900) em docs/dmc/parcerias/campanhas/.
// Fundo fotográfico: só se a imagem ORIGINAL existir em complexodmc.com.br/assets/images/parcerias/
// (data-bg="pl-painel.webp" etc.); senão a peça fica só com tipografia + geometria SVG.
import { chromium } from '/Users/dmchagas/Site_Complexo_DMC/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const imgDir = path.join(root, 'complexodmc.com.br/assets/images/parcerias');
const outPecas = path.join(root, 'docs/dmc/parcerias/campanhas/pecas');
const outDocs = path.join(root, 'docs/dmc/parcerias/campanhas');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const only = arg('only') ? arg('only').split(',') : null;
const preview = arg('preview');

const PECAS = ['pecas-pl', 'pecas-bp'];
const DECKS = [['apresentacao-pl', 'apresentacao-partner-lawyers.pdf'], ['apresentacao-bp', 'apresentacao-business-partner.pdf']];
const want = (n) => !only || only.includes(n);

async function preparar(page, file) {
  await page.goto(pathToFileURL(path.join(here, file + '.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const fontesOk = await page.evaluate(() => [
    document.fonts.check('300 40px Newsreader'), document.fonts.check('italic 300 40px Newsreader'),
    document.fonts.check('400 20px "Hanken Grotesk"'), document.fonts.check('600 20px "Hanken Grotesk"')]);
  if (fontesOk.includes(false)) throw new Error(`${file}: fontes do Google não carregaram ${JSON.stringify(fontesOk)}`);
  // fundo fotográfico só se a imagem original existir
  const bgs = await page.$$eval('[data-bg]', (els) => els.map((e) => e.dataset.bg));
  const usados = [];
  for (const nome of [...new Set(bgs)]) {
    const p = path.join(imgDir, nome);
    if (existsSync(p)) {
      usados.push(nome);
      await page.evaluate(([n, href]) => document.querySelectorAll(`[data-bg="${n}"]`).forEach((a) => {
        a.classList.add('has-bg'); a.querySelector('.bg').style.backgroundImage = `url("${href}")`;
      }), [nome, pathToFileURL(p).href]);
    }
  }
  await page.evaluate(() => window.desenharGeo && window.desenharGeo());
  await page.waitForTimeout(300);
  // conferência de texto cortado / sobreposto
  const problemas = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.art, .slide').forEach((a) => {
      const nome = a.dataset.name || a.dataset.pg;
      const A = a.getBoundingClientRect();
      const lock = a.querySelector('.lockup').getBoundingClientRect();
      const foot = a.querySelector('.foot').getBoundingClientRect();
      a.querySelectorAll('.content > *, .content li, .content .cta').forEach((c) => {
        const r = c.getBoundingClientRect();
        if (r.top < lock.bottom + 24) out.push(`${nome}: conteúdo encosta no lockup (${Math.round(lock.bottom + 24 - r.top)}px)`);
        if (r.bottom > foot.top + 1) out.push(`${nome}: conteúdo invade o rodapé`);
        if (r.right > A.right - 40) out.push(`${nome}: conteúdo passa da margem direita`);
      });
      if (foot.bottom > A.bottom + 1) out.push(`${nome}: rodapé cortado`);
      a.querySelectorAll('h1,h2,h3,p,li,span').forEach((t) => { if (t.scrollWidth > t.clientWidth + 2 && getComputedStyle(t).overflow !== 'visible') out.push(`${nome}: texto cortado em ${t.tagName}`); });
    });
    return [...new Set(out)];
  });
  return { usados, problemas };
}

const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 1500 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => { console.error('pageerror', e.message); process.exitCode = 1; });
await fs.mkdir(outPecas, { recursive: true });
let total = 0;

for (const f of PECAS.filter(want)) {
  const { usados, problemas } = await preparar(page, f);
  console.log(`${f}: fundos usados = ${usados.length ? usados.join(', ') : 'nenhum (só tipografia + geometria)'}`);
  problemas.forEach((p) => console.warn('  ATENÇÃO', p));
  const arts = await page.$$('.art');
  for (const a of arts) {
    const nome = await a.getAttribute('data-name');
    await a.screenshot({ path: path.join(outPecas, nome + '.png') });
    total++;
  }
}

for (const [f, pdf] of DECKS.filter(([f]) => want(f))) {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { usados, problemas } = await preparar(page, f);
  console.log(`${f}: fundos usados = ${usados.length ? usados.join(', ') : 'nenhum'}`);
  problemas.forEach((p) => console.warn('  ATENÇÃO', p));
  if (preview) {
    await fs.mkdir(preview, { recursive: true });
    const slides = await page.$$('.slide');
    for (let i = 0; i < slides.length; i++) await slides[i].screenshot({ path: path.join(preview, `${f}-${String(i + 1).padStart(2, '0')}.png`) });
  }
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(outDocs, pdf), width: '1600px', height: '900px', printBackground: true, preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 1700, height: 1500 });
  console.log(`  PDF → ${path.relative(root, path.join(outDocs, pdf))}`);
}

await browser.close();
console.log(`PNG gerados: ${total}`);
