// =============================================================
// Qualidade transversal do Portal (F0r · PORTAL-ACADEMICO.md §9.6; UX §3 fase E.2; D-46, D-67,
// D-68, D-73, D-74). Roda sobre paginasDoPortal() do _portal.js: PAGINAS_BASE + o que cada
// fatia declara em tests/e2e/portal-<x>.paginas.js (páginas próprias e URLs hospedeiras).
//
// Por página × tema (escuro, claro) × largura (1440, 390):
//   detector de neon (§9.6: cada elemento visível, ::before/::after e interativos com :hover e
//   :focus-visible forçados por CDP; matiz 120–200° com S > 60%, alfa ignorado) · axe 0
//   serious/critical (completo, ou só color-contrast e link-in-text-block nas páginas legadas de
//   fatias da fase 1 ainda não integradas, D-46) · tipografia (H1 Newsreader 300, corpo Hanken,
//   nenhum peso > 600) · alvos ≥ 44 px abaixo de 1024 (exceção: data-alvo-excecao) · CSP estrita
//   report-only sem violação · console e rede pelo monitorarConsoleERede (D-73) · nenhum
//   <script> de outra origem · nenhuma URL com token= · CLS < 0,1 · captura para revisão humana.
// Por página: rolagem horizontal em 320, 375, 390, 768, 1024, 1440 e 1920, níveis 0 e 2 de texto,
// com a gaveta do menu e os diálogos da página abertos; alto contraste (forced-colors) capturado.
// Impressão (onde houver documento): shell oculto, tinta escura e o QR conferido por _qr.js.
// Só no G2 (QA_ESTRITO=1): links internos 200 e `?v=` igual ao hash (versionar-ead.mjs).
//
// Escopo (D-62, D-67, D-74):
//   QA_FATIA=<fatia> → só as entradas com fatia === QA_FATIA (páginas próprias e hospedeiras);
//   sem QA_FATIA     → G0 e integração: entradas das fatias da fase 0 e de QA_INTEGRADAS, mais as
//                      páginas legadas de PAGINAS_BASE (estas só com neon e axe de cor enquanto a
//                      dona não integrou), menos PAGINAS_PENDENTES_G0 no neon e no axe de cor;
//   QA_ESTRITO=1     → tudo, sem tolerância (G2).
// Páginas da sessão 2d (login.html, login-classico.html) ficam fora: não são desta rodada.
//
// Comandos (portas da F0r na fase 0: 4634 manual / 4648 Playwright, §9.1):
//   QA_PORT=4648 QA_WORKERS=2 QA_DATA=<data>-f0r npx playwright test tests/e2e/portal-qualidade.spec.js
//   QA_PORT=4648 QA_FATIA=F0r QA_DATA=<data>-f0r npx playwright test tests/e2e/portal-qualidade.spec.js
// Evidências: docs/dmc/qa/<QA_DATA>/qualidade/ (fora do git, T4).
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as P from './_portal.js';
import { conferirQrNaPagina, matrizEsperada, lerSvgDoQr, compararMatrizes, urlDeValidacao } from './_qr.js';
import { donoDe } from '../tools/posse-ead.mjs';
import { planejar as planejarVersoes } from '../tools/versionar-ead.mjs';

const QA_FATIA = process.env.QA_FATIA || null;
const QA_ESTRITO = process.env.QA_ESTRITO === '1';
const INTEGRADAS = P.fatiasIntegradas();
const DATA = process.env.QA_DATA || new Date().toLocaleDateString('sv-SE');
const SAIDA = path.join(P.RAIZ, 'docs', 'dmc', 'qa', DATA, 'qualidade');
const EAD = P.BASE_EAD;
const TEMAS = ['escuro', 'claro'];
const LARGURAS = [1440, 390];
const LARGURAS_ROLAGEM = [320, 375, 390, 768, 1024, 1440, 1920];
const ALTURA = 900;
const PAGINAS_2D = ['login.html', 'login-classico.html'];
/** Públicas sem shell que nascem em papel (§6.4): o tema escolhido não se aplica a elas.
 *  Espelha PUBLICAS de js/portal/pre-pintura.js (validar, certificado, declaracao, acesso-link). */
const PUBLICAS_EM_PAPEL = ['certificado.html', 'validar.html', 'declaracao.html', 'acesso-link.html'];

// ---------------------------------------------------------------------------
// PENDENTES_FASE_1 → PAGINAS_PENDENTES_G0 (D-67). A lista mora no front-estatico.test.js (fonte
// única; é lida como texto para não executar o node:test aqui). Fica de fora do detector e do
// axe de cor, no G0, a página que carrega CSS ou JS pendente com cor barrada (neon ou cor inline).
// ---------------------------------------------------------------------------
const ARQ_ESTATICO = path.join(P.RAIZ, 'server', 'test', 'front-estatico.test.js');
export function lerPendentesFase1(texto = fs.readFileSync(ARQ_ESTATICO, 'utf8')) {
  const m = texto.match(/const PENDENTES_FASE_1 = Object\.freeze\(\{([\s\S]*?)\}\);/);
  if (!m) throw new Error('PENDENTES_FASE_1 não encontrada em server/test/front-estatico.test.js');
  return Object.fromEntries([...m[1].matchAll(/['"]([^'"]+)['"]\s*:\s*['"](F\w+)['"]/g)].map((x) => [x[1], x[2]]));
}
const COR_BARRADA = /#(?:00e7fc|00ff4d|00b8cc|00cfb6|00f5b4|0a7d8c)\b|rgba?\(\s*0\s*,\s*(?:231|255)\b|\bstyle\s*=\s*["'][^"']*\b(?:color|background|border)|\.style\.(?:color|background|backgroundColor|borderColor)\s*=/i;
function assetsDaPagina(pagina) {
  const arq = path.join(P.EAD_DISCO, pagina);
  if (!fs.existsSync(arq)) return [];
  const html = fs.readFileSync(arq, 'utf8');
  return [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"'#?]+)/gi)].map((x) => x[1]).filter((u) => /\.(?:js|css)$/.test(u) && !/^(?:[a-z]+:|\/\/|\.\.\/)/i.test(u));
}
export const PENDENTES_FASE_1 = lerPendentesFase1();
export const PAGINAS_PENDENTES_G0 = Object.freeze(P.PAGINAS_BASE.map((e) => e.pagina).filter((pg) => assetsDaPagina(pg).some((a) => {
  if (!Object.hasOwn(PENDENTES_FASE_1, a)) return false;
  const f = path.join(P.EAD_DISCO, a);
  return fs.existsSync(f) && COR_BARRADA.test(fs.readFileSync(f, 'utf8'));
})));

// ---------------------------------------------------------------------------
// Entradas e escopo
// ---------------------------------------------------------------------------
let ERRO_PAGINAS = null;
let ENTRADAS;
try {
  ENTRADAS = await P.paginasDoPortal(QA_FATIA ? { fatia: QA_FATIA } : {});
} catch (e) {
  ERRO_PAGINAS = e.message;
  // Segue só com a base (o teste de entradas acima reprova e diz qual arquivo corrigir).
  ENTRADAS = P.PAGINAS_BASE.filter((x) => !QA_FATIA || x.fatia === QA_FATIA).map((x) => ({ ...x, origem: 'PAGINAS_BASE', hospedeira: false }));
}

/**
 * Páginas de fatia da fase 0 que são entrega da FASE 1 (G1): ficam fora do G0 e entram com
 * QA_FATIA da dona, na integração do G1 dela (QA_INTEGRADAS com "<fatia>:fase1") e no G2.
 */
const TRABALHO_DE_FASE_1 = Object.freeze({ 'tutoriais.html': 'F0r (tutoriais, G1; D-78)' });

/** Páginas legadas de PAGINAS_BASE fora da 2d (hoje 11): o piso do escopo de cor no G0 (D-67). */
const LEGADAS = Object.freeze(P.PAGINAS_BASE.filter((b) => b.legado && !PAGINAS_2D.includes(b.pagina)).map((b) => b.pagina));

/**
 * 'completo' (todas as verificações) · 'cor' (neon + axe de cor, D-46) · null (fora do escopo).
 * "Legada" é decidida pelo NOME da página em PAGINAS_BASE, não pela entrada: quando a dona
 * ensina a URL em portal-<x>.paginas.js, paginasDoPortal() troca a entrada da base pela dela,
 * que chega sem `legado` (D-74). Entrada hospedeira mede a tela de outra fatia e não conta.
 * O 2º argumento só existe para o caso que trava essa regra (abaixo); a execução usa o ambiente.
 */
function modoDa(e, { estrito = QA_ESTRITO, fatia = QA_FATIA, integradas = INTEGRADAS } = {}) {
  if (PAGINAS_2D.includes(e.pagina)) return null;
  if (!fs.existsSync(path.join(P.EAD_DISCO, e.pagina))) return null; // página de fatia ainda ausente (R13)
  if (estrito) return 'completo';
  if (fatia) return e.fatia === fatia ? 'completo' : null;
  if (TRABALHO_DE_FASE_1[e.pagina] && !integradas.has(`${e.fatia}:fase1`)) return null;
  if (P.FASE0.includes(e.fatia) || integradas.has(e.fatia)) return 'completo';
  if (!e.hospedeira && LEGADAS.includes(e.pagina)) return 'cor';
  return null;
}

/** URLs com id para as páginas da base que precisam dele (as fatias ensinam as suas no .paginas.js). */
const URL_DA_BASE = {
  'aula.html': (c) => `aula.html?id=${encodeURIComponent(c.aulaId)}`,
  'certificado.html': (c) => `certificado.html?codigo=${encodeURIComponent(c.codigo || 'DMC-0000-0000')}`,
  'obrigado.html': (c) => `obrigado.html?cursos=${encodeURIComponent(c.cursoCarrinhoId)}&email=${encodeURIComponent(c.email)}&total=${c.precoCarrinho}`,
};
/** Estados extras das páginas da F0r (UX §6.19). */
const ESTADOS = {
  'loja.html': [{ nome: 'padrao' }, { nome: 'carrinho', carrinho: true }],
  'obrigado.html': [{ nome: 'sem-pedido' }, { nome: 'registrado', registrado: true }],
};
const PROTOCOLO_QA = 'ATD-2026-QAPRTB';
const PAGINAS_DE_DOCUMENTO = new Set(['certificado.html', 'declaracao.html', 'comprovantes.html', 'contrato.html', 'academico.html', 'financeiro.html', 'regulamento.html']);

const CASOS = [];
const vistos = new Set();
for (const e of ENTRADAS) {
  const modo = modoDa(e);
  if (!modo) continue;
  const id = `${e.pagina}${e.origem && e.origem !== 'PAGINAS_BASE' ? ` (${e.origem}${e.hospedeira ? ', hospedeira' : ''})` : ''}`;
  for (const est of ESTADOS[e.pagina] && e.origem === 'PAGINAS_BASE' ? ESTADOS[e.pagina] : [{ nome: 'padrao' }]) {
    const chave = `${id}#${est.nome}#${typeof e.url === 'function' ? e.url({}) : e.url}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    CASOS.push({ entrada: e, modo, estado: est, rotulo: `${id}${est.nome !== 'padrao' ? ` · ${est.nome}` : ''}`, urlRotulo: chave.split('#').slice(2).join('#') });
  }
}
// Rótulo único: uma fatia pode hospedar várias telas na mesma página (professor.html#/…), e o
// Playwright recusa título repetido. Só o rótulo repetido ganha a URL; os demais não mudam.
const REPETIDOS = new Set(CASOS.map((c) => c.rotulo).filter((r, i, a) => a.indexOf(r) !== i));
for (const c of CASOS) if (REPETIDOS.has(c.rotulo)) c.rotulo += ` · ${c.urlRotulo}`;

// ---------------------------------------------------------------------------
// Sementes (por worker): aluno com curso liberado, curso para o carrinho, certificado emitido,
// professor e admin. Banco: só o mongod descartável do serve.mjs.
// ---------------------------------------------------------------------------
let S = null;
test.beforeAll(async ({ request }) => {
  const est = await P.estadoQa(request);
  if (!est.mongo) return;
  const r9b = await P.semearR9b(request);
  const curso = await P.semearCurso(request, { aulas: [{ videoUrl: P.URL_VIMEO }, {}, { disponivel: false }], preco: 1290 });
  const carrinho = await P.semearCurso(request, { preco: 890 });
  await P.liberarCurso(request, r9b.aluno.id, curso.cursoId);
  await P.semearLives(request, curso.cursoId);
  const cert = await P.api(request, r9b.aluno.token).post(`/api/cursos/${r9b.curso.cursoId}/certificado`, {});
  const codigo = cert.json && (cert.json.codigo || (cert.json.certificado && cert.json.certificado.codigo)) || null;
  const [professor, admin] = await Promise.all([P.criarUsuario(request, { papel: 'professor' }), P.criarUsuario(request, { papel: 'admin' })]);
  S = {
    aluno: r9b.aluno, professor, admin,
    ctx: {
      cursoId: curso.cursoId, moduloId: curso.moduloId, aulaId: curso.aulas[0].id, codigo,
      cursoCarrinhoId: carrinho.cursoId, precoCarrinho: '890.00', tituloCarrinho: carrinho.titulo, email: r9b.aluno.email,
    },
  };
});

function tokenDo(papel) {
  if (!S || papel === 'anonimo' || papel == null) return null;
  return (S[papel] || S.aluno).token;
}

function urlDoCaso(c, ctx) {
  const e = c.entrada;
  if (c.estado.registrado) return `${EAD}obrigado.html?protocolo=${PROTOCOLO_QA}`;
  if (e.origem === 'PAGINAS_BASE' && URL_DA_BASE[e.pagina]) return EAD + URL_DA_BASE[e.pagina](ctx);
  return P.urlDaPagina(e, ctx);
}

async function abrir(page, c, { tema, nivel = 0, largura, abrirCarrinho = true }) {
  await page.setViewportSize({ width: largura, height: ALTURA });
  await P.rotearVimeo(page);
  await P.simularCliente(page);
  // Fontes do Google: CSS vazio local (determinístico e sem rede externa; o cômputo da família
  // não depende do download). Nada mais sai de 127.0.0.1.
  await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (r) => r.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '' }));
  if (c.estado.registrado) {
    await page.route(`**/api/portal/me/atendimentos/${PROTOCOLO_QA}`, (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ protocolo: PROTOCOLO_QA, pedido: { cursoIds: [S.ctx.cursoCarrinhoId], itens: [{ cursoId: S.ctx.cursoCarrinhoId, titulo: S.ctx.tituloCarrinho, valorCentavos: 89000 }], totalCentavos: 89000 } }),
    }));
  }
  const extras = { 'dmc:tema': tema, 'dmc:fonte': String(nivel) };
  if (c.estado.carrinho) extras['dmc:carrinho'] = JSON.stringify([S.ctx.cursoCarrinhoId]);
  const papel = c.entrada.papel || (P.PAGINAS_BASE.find((b) => b.pagina === c.entrada.pagina) || {}).papel || 'aluno';
  await P.entrarComToken(page, tokenDo(papel), extras);
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (ev) => window.__csp.push({ diretiva: ev.violatedDirective, bloqueado: String(ev.blockedURI).slice(0, 120), origem: ev.sourceFile ? `${String(ev.sourceFile).split('/').pop()}:${ev.lineNumber}` : '' }));
    window.__cls = 0;
    try { new PerformanceObserver((l) => { for (const x of l.getEntries()) if (!x.hadRecentInput) window.__cls += x.value; }).observe({ type: 'layout-shift', buffered: true }); } catch { /* sem a API */ }
  });
  const preparar = c.entrada.preparar ? await c.entrada.preparar({ ...S.ctx, request: page.request }) : null;
  const ctx = { ...S.ctx, ...(preparar || {}) };
  await page.goto(urlDoCaso(c, ctx), { waitUntil: 'load' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(async () => { try { await document.fonts.ready; } catch { /* */ } });
  if (c.estado.carrinho && abrirCarrinho) {
    const botao = page.locator('[data-cart-open], :is(button, a):has([data-cart-count])').first();
    if (await botao.count()) { await botao.click(); await expect(page.locator('#cart-drawer')).toBeVisible(); }
  }
  await esperarTransicoes(page);
}

/** A página só redireciona (ex.: index.html)? Então não há tela própria a medir. */
function redirecionou(page, c) {
  return (new URL(page.url()).pathname.split('/').pop() || 'index.html') !== c.entrada.pagina;
}

async function esperarTransicoes(page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect && a.effect.getComputedTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => null))));
  await page.waitForTimeout(150);
}

// ---------------------------------------------------------------------------
// Detector de neon (§9.6, prevalece sobre a UX §3 E.2, D-46)
// ---------------------------------------------------------------------------
const SELETOR_INTERATIVOS = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"], [role="tab"], [role="menuitem"]';

async function varrerNeon(page) {
  return page.evaluate((SEL) => {
    const PROPS = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'text-decoration-color', 'fill', 'stroke', 'box-shadow', 'text-shadow'];
    const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    function oklabParaRgb(L, a, b) {
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
      return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]
        .map((x) => Math.max(0, Math.min(255, gam(Math.max(0, Math.min(1, x))) * 255)));
    }
    const desconhecidas = new Set();
    function cores(valor) {
      const out = [];
      if (!valor || valor === 'none') return out;
      for (const m of valor.matchAll(/(rgba?|color|oklch|oklab|hsla?|lab|lch)\(([^()]*)\)/g)) {
        const f = m[1];
        const a = m[2].replace(/\//g, ' ').replace(/,/g, ' ').trim().split(/\s+/);
        const pct = (x) => parseFloat(x) / (String(x).endsWith('%') ? 100 : 1);
        let rgb = null;
        if (f === 'rgb' || f === 'rgba') rgb = a.slice(0, 3).map(Number);
        else if (f === 'color' && a[0] === 'srgb') rgb = a.slice(1, 4).map((x) => Number(x) * 255);
        else if (f === 'oklab') rgb = oklabParaRgb(pct(a[0]), Number(a[1]), Number(a[2]));
        else if (f === 'oklch') { const H = (parseFloat(a[2]) || 0) * Math.PI / 180; rgb = oklabParaRgb(pct(a[0]), Number(a[1]) * Math.cos(H), Number(a[1]) * Math.sin(H)); }
        else { desconhecidas.add(m[0]); continue; }
        if (rgb.some((x) => Number.isNaN(x))) { desconhecidas.add(m[0]); continue; }
        out.push({ texto: m[0], rgb });
      }
      return out;
    }
    function hsl([r, g, b]) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2; const d = max - min;
      if (d === 0) return { h: 0, s: 0, l };
      const s = d / (1 - Math.abs(2 * l - 1));
      let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
      return { h, s, l };
    }
    const neon = (rgb) => { const { h, s } = hsl(rgb); return h >= 120 && h <= 200 && s > 0.6; };
    const rotulo = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.classList && el.classList.length ? `.${[...el.classList].slice(0, 3).join('.')}` : '');
    const visivel = (el) => { if (!el.getClientRects().length) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const fora = new Set(['SCRIPT', 'STYLE', 'IMG', 'VIDEO', 'IFRAME', 'CANVAS', 'SOURCE', 'NOSCRIPT', 'PICTURE']);
    const todos = [...document.querySelectorAll('body, body *')].filter((el) => !fora.has(el.tagName) && visivel(el));
    const forcado = !!window.__pfForcado;
    const alvo = forcado ? todos.filter((el) => el.matches(SEL)) : todos;
    const achados = [];
    const vistos = new Set();
    for (const el of alvo) {
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        if (pseudo && (!cs.content || cs.content === 'none' || cs.content === 'normal')) continue;
        for (const p of PROPS) {
          for (const c of cores(cs.getPropertyValue(p))) {
            if (!neon(c.rgb)) continue;
            const k = `${rotulo(el)}${pseudo || ''}|${p}|${c.texto}`;
            if (vistos.has(k)) continue;
            vistos.add(k);
            if (achados.length < 200) achados.push({ el: rotulo(el) + (pseudo || ''), prop: p, cor: c.texto, estado: forcado ? 'hover+focus-visible' : 'normal' });
          }
        }
      }
    }
    return { elementos: alvo.length, achados, desconhecidas: [...desconhecidas].slice(0, 10) };
  }, SELETOR_INTERATIVOS);
}

async function neonComEstadosForcados(page) {
  const normal = await varrerNeon(page);
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: SELETOR_INTERATIVOS });
    for (const nodeId of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover', 'focus-visible'] }).catch(() => {});
    await page.evaluate(() => { window.__pfForcado = true; });
    const forcado = await varrerNeon(page);
    for (const nodeId of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => {});
    await page.evaluate(() => { window.__pfForcado = false; });
    return { normal, forcado, interativos: nodeIds.length };
  } finally {
    await cdp.detach().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Demais conferências de tela
// ---------------------------------------------------------------------------
/** modo: 'completo' · 'cor' (só color-contrast e link-in-text-block) · 'sem-cor' (completo menos essas duas). */
async function axeGraves(page, modo) {
  const b = new AxeBuilder({ page });
  if (modo === 'cor') b.withRules(['color-contrast', 'link-in-text-block']);
  if (modo === 'sem-cor') b.disableRules(['color-contrast', 'link-in-text-block']);
  const r = await b.analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ regra: v.id, impacto: v.impact, nos: v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')} — ${(n.failureSummary || '').split('\n')[1] || ''}`.slice(0, 220)) }));
}

async function tipografia(page) {
  return page.evaluate(() => {
    const visivel = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    const fam = (cs) => cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    const h1 = [...document.querySelectorAll('h1')].filter(visivel).map((el) => ({ texto: el.textContent.trim().slice(0, 60), familia: fam(getComputedStyle(el)), peso: getComputedStyle(el).fontWeight }));
    const corpo = fam(getComputedStyle(document.body));
    const pesados = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visivel(el) || !el.childNodes.length) continue;
      const temTexto = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!temTexto) continue;
      const w = Number(getComputedStyle(el).fontWeight);
      if (w > 600 && pesados.length < 10) pesados.push(`${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ')[0]}` : ''} ${w}`);
    }
    return { h1, corpo, pesados };
  });
}

async function alvosPequenos(page) {
  return page.evaluate((SEL) => {
    const pequenos = [];
    for (const el of document.querySelectorAll(SEL)) {
      if (el.closest('[data-alvo-excecao], [hidden], [aria-hidden="true"], .dmc-sr-only')) continue;
      if (el.matches('.dmc-skip') && document.activeElement !== el) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || (el.type === 'hidden')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      // Link dentro de frase (WCAG 2.5.8, exceção "inline"): não é alvo isolado.
      if (el.tagName === 'A' && cs.display === 'inline' && el.parentElement && /^(P|LI|SPAN|SMALL|TD|DD|LABEL|EM|STRONG)$/.test(el.parentElement.tagName)) continue;
      // Campo de texto: a altura conta, a largura é do layout.
      const campo = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio)$/.test(el.type);
      if (r.height < 43.5 || (!campo && r.width < 43.5)) pequenos.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ').slice(0, 2).join('.')}` : ''} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return pequenos.slice(0, 15);
  }, SELETOR_INTERATIVOS);
}

async function rolagem(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const sw = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
    return { vw, sw };
  });
}

async function redeLimpa(page, urlsVistas) {
  const scriptsDeFora = await page.evaluate(() => [...document.scripts].map((s) => s.src).filter((s) => s && new URL(s, location.href).origin !== location.origin));
  const comToken = urlsVistas.filter((u) => /[?&#]token=/i.test(u));
  return { scriptsDeFora, comToken };
}

function gravar(nome, dados) {
  fs.mkdirSync(SAIDA, { recursive: true });
  fs.writeFileSync(path.join(SAIDA, `${nome}.json`), JSON.stringify(dados, null, 2));
}
const arquivoSeguro = (s) => s.replace(/[^a-z0-9.-]+/gi, '_').replace(/_+/g, '_').slice(0, 120);

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------
test.describe('qualidade · entradas', () => {
  test('paginasDoPortal(): os portal-<x>.paginas.js são válidos (D-74)', async () => {
    expect(ERRO_PAGINAS, 'paginasDoPortal() recusou um portal-<x>.paginas.js; a dona corrige o arquivo').toBeNull();
  });
  test('PAGINAS_PENDENTES_G0 derivada de PENDENTES_FASE_1 só com páginas de fatias da fase 1 (D-67)', async () => {
    gravar('_escopo', {
      modo: QA_ESTRITO ? 'estrito' : QA_FATIA ? `fatia ${QA_FATIA}` : 'G0/integração', integradas: [...INTEGRADAS],
      pendentesFase1: PENDENTES_FASE_1, paginasPendentesG0: PAGINAS_PENDENTES_G0,
      casos: CASOS.map((c) => ({ rotulo: c.rotulo, fatia: c.entrada.fatia, modo: c.modo })),
    });
    for (const pg of PAGINAS_PENDENTES_G0) {
      const dona = (P.PAGINAS_BASE.find((b) => b.pagina === pg) || {}).fatia;
      expect(P.FASE0.includes(dona), `${pg} é da ${dona} (fase 0): não pode ficar de fora`).toBe(false);
    }
    expect(CASOS.length, 'nenhuma página no escopo').toBeGreaterThan(0);
  });
  test('escopo do G0: as 11 páginas legadas fora da 2d, menos PAGINAS_PENDENTES_G0, têm caso de neon e axe de cor (D-67)', async () => {
    test.skip(!!QA_FATIA, `QA_FATIA=${QA_FATIA}: o escopo é só o da fatia (D-62)`);
    expect(LEGADAS.length, `PAGINAS_BASE com ${LEGADAS.length} páginas legadas fora da 2d (esperadas 11): ${LEGADAS.join(', ')}`).toBe(11);
    const esperadas = LEGADAS.filter((pg) => QA_ESTRITO || !PAGINAS_PENDENTES_G0.includes(pg));
    const medidas = new Set(CASOS.filter((c) => !c.entrada.hospedeira && (c.modo === 'cor' || c.modo === 'completo')).map((c) => c.entrada.pagina));
    const faltando = esperadas.filter((pg) => !medidas.has(pg));
    gravar('_escopo-legadas', { legadas: LEGADAS, paginasPendentesG0: PAGINAS_PENDENTES_G0, esperadas, medidas: [...medidas].filter((pg) => LEGADAS.includes(pg)), faltando });
    expect(faltando, `páginas legadas sem neon e axe de cor no ${QA_ESTRITO ? 'G2' : 'G0'}`).toEqual([]);
  });
  test('modoDa(): página legada que a dona ensina em portal-<x>.paginas.js continua \'cor\' (D-67, D-74)', async () => {
    const g0 = { estrito: false, fatia: null, integradas: new Set(P.FASE0) };
    const trocada = (pagina, fatia, origem) => ({ pagina, fatia, origem, hospedeira: false, url: () => pagina });
    // Entrada que substituiu a da base: chega sem `legado` (é o que paginasDoPortal() devolve).
    expect(modoDa(trocada('dashboard.html', 'F1b', 'portal-estudos.paginas.js'), g0)).toBe('cor');
    expect(modoDa(trocada('meus-cursos.html', 'F1b', 'portal-estudos.paginas.js'), g0)).toBe('cor');
    expect(modoDa(trocada('aula.html', 'F1b', 'portal-estudos.paginas.js'), g0)).toBe('cor');
    expect(modoDa(trocada('ao-vivo.html', 'F3a', 'portal-academico.paginas.js'), g0)).toBe('cor');
    // A entrada da base continua 'cor'.
    expect(modoDa({ ...P.PAGINAS_BASE.find((b) => b.pagina === 'certificados.html'), origem: 'PAGINAS_BASE', hospedeira: false }, g0)).toBe('cor');
    // Hospedeira mede a tela de outra fatia: não herda o modo da página legada.
    expect(modoDa({ pagina: 'aula.html', fatia: 'F2', origem: 'portal-avaliacoes.paginas.js', hospedeira: true, url: () => 'aula.html' }, g0)).toBeNull();
    // Dona integrada → completo; 2d → fora; QA_FATIA de outra → fora; estrito → completo.
    expect(modoDa(trocada('dashboard.html', 'F1b', 'portal-estudos.paginas.js'), { ...g0, integradas: new Set([...P.FASE0, 'F1b']) })).toBe('completo');
    expect(modoDa(trocada('login.html', '2d', 'PAGINAS_BASE'), g0)).toBeNull();
    expect(modoDa(trocada('dashboard.html', 'F1b', 'portal-estudos.paginas.js'), { ...g0, fatia: 'F8' })).toBeNull();
    expect(modoDa(trocada('ao-vivo.html', 'F3a', 'portal-academico.paginas.js'), { ...g0, estrito: true })).toBe('completo');
  });
});

for (const c of CASOS) {
  const fora = !QA_ESTRITO && !QA_FATIA && PAGINAS_PENDENTES_G0.includes(c.entrada.pagina);
  test.describe(`qualidade · ${c.rotulo} [${c.entrada.fatia} · ${c.modo}]`, () => {
    for (const tema of TEMAS) {
      for (const largura of LARGURAS) {
        test(`${tema} · ${largura}`, { tag: [`@${c.entrada.fatia}`] }, async ({ page }) => {
          test.skip(!S, 'bloqueado: sem MongoDB descartável para as sementes');
          test.setTimeout(90_000);
          const mon = P.monitorarConsoleERede(page, { fatia: QA_FATIA || c.entrada.fatia });
          const urls = [];
          page.on('request', (r) => urls.push(r.url()));
          await abrir(page, c, { tema, largura });
          const nome = arquivoSeguro(`${c.rotulo}-${tema}-${largura}`);
          fs.mkdirSync(SAIDA, { recursive: true });
          await page.screenshot({ path: path.join(SAIDA, `${nome}.png`), fullPage: true, animations: 'disabled' });

          const res = { pagina: c.entrada.pagina, rotulo: c.rotulo, fatia: c.entrada.fatia, modo: c.modo, tema, largura, url: page.url(), temaAplicado: await page.evaluate(() => document.documentElement.getAttribute('data-pf-tema')) };
          // Página que só redireciona (index.html) mede outra página: fica registrada e sai (R1 da D5 cobre).
          const final = new URL(page.url()).pathname.split('/').pop() || 'index.html';
          if (final !== c.entrada.pagina) {
            res.redireciona = final;
            gravar(nome, res);
            test.info().annotations.push({ type: 'redireciona', description: `${c.entrada.pagina} → ${final}: sem tela própria, nada a medir aqui` });
            return;
          }
          if (!PUBLICAS_EM_PAPEL.includes(c.entrada.pagina)) expect.soft(res.temaAplicado, 'tema aplicado pelo pre-pintura.js').toBe(tema);
          // Lidos ANTES do neon e do axe: o axe pré-carrega o CSSOM das folhas de outra origem por
          // XHR (fontes do Google), o que a CSP registraria como connect-src da página.
          const csp = await page.evaluate(() => (window.__csp || []).slice());
          const cls = await page.evaluate(() => Math.round((window.__cls || 0) * 1000) / 1000);

          if (!fora) {
            const neon = await neonComEstadosForcados(page);
            res.neon = neon;
            expect.soft([...neon.normal.achados, ...neon.forcado.achados], `neon em ${c.rotulo} (${tema}, ${largura})`).toEqual([]);
          } else res.neon = `fora no G0: ${c.entrada.pagina} em PAGINAS_PENDENTES_G0 (D-67)`;

          if (!fora || c.modo === 'completo') {
            res.axe = await axeGraves(page, fora ? 'sem-cor' : c.modo);
            expect.soft(res.axe, `axe ${c.modo} em ${c.rotulo} (${tema}, ${largura})`).toEqual([]);
          }

          if (c.modo === 'completo') {
            res.tipografia = await tipografia(page);
            for (const h of res.tipografia.h1) {
              expect.soft(h.familia, `H1 "${h.texto}" em Newsreader`).toBe('Newsreader');
              expect.soft(h.peso, `H1 "${h.texto}" peso 300`).toBe('300');
            }
            expect.soft(res.tipografia.corpo, 'corpo em Hanken Grotesk').toBe('Hanken Grotesk');
            expect.soft(res.tipografia.pesados, 'nenhum peso acima de 600').toEqual([]);
            if (largura < 1024) {
              res.alvos = await alvosPequenos(page);
              expect.soft(res.alvos, 'alvos ≥ 44 px abaixo de 1024').toEqual([]);
            }
            res.csp = csp;
            expect.soft(res.csp, 'CSP estrita (report-only) sem violação').toEqual([]);
            res.cls = cls;
            expect.soft(res.cls, 'CLS < 0,1').toBeLessThan(0.1);
            res.rede = await redeLimpa(page, urls);
            expect.soft(res.rede.scriptsDeFora, 'nenhum <script> de outra origem').toEqual([]);
            expect.soft(res.rede.comToken, 'nenhuma URL com token=').toEqual([]);
            const cl = await mon.classificar();
            res.console = { inesperadas: cl.inesperadas, toleradas: cl.toleradas.length };
            expect.soft(cl.inesperadas, 'console e rede (monitorarConsoleERede, D-73)').toEqual([]);
          }
          gravar(nome, res);
        });
      }
    }

    if (c.modo === 'completo') {
      test('rolagem horizontal 320–1920 nos níveis 0 e 2, com gaveta e diálogos abertos', { tag: [`@${c.entrada.fatia}`] }, async ({ page }) => {
        test.skip(!S, 'bloqueado: sem MongoDB descartável para as sementes');
        test.setTimeout(150_000);
        const falhas = [];
        for (const nivel of [0, 2]) {
          for (const largura of LARGURAS_ROLAGEM) {
            await abrir(page, c, { tema: 'escuro', nivel, largura, abrirCarrinho: false });
            if (redirecionou(page, c)) { test.skip(true, `${c.entrada.pagina} só redireciona`); return; }
            const r0 = await rolagem(page);
            if (r0.sw > r0.vw) falhas.push(`${largura}px nível ${nivel}: ${r0.sw} > ${r0.vw}`);
            const menu = page.locator('.pf-topo__menu');
            if (await menu.isVisible().catch(() => false)) {
              await menu.click();
              await esperarTransicoes(page);
              const r1 = await rolagem(page);
              if (r1.sw > r1.vw) falhas.push(`${largura}px nível ${nivel}, gaveta aberta: ${r1.sw} > ${r1.vw}`);
              await page.keyboard.press('Escape');
            }
            const carrinho = page.locator('[data-cart-open], :is(button, a):has([data-cart-count])').first();
            if (c.entrada.pagina === 'loja.html' && await carrinho.isVisible().catch(() => false)) {
              await carrinho.click();
              await esperarTransicoes(page);
              const r2 = await rolagem(page);
              if (r2.sw > r2.vw) falhas.push(`${largura}px nível ${nivel}, carrinho aberto: ${r2.sw} > ${r2.vw}`);
              const caixa = await page.locator('.cart-drawer__panel').boundingBox();
              if (caixa && caixa.x + caixa.width > largura + 1) falhas.push(`${largura}px nível ${nivel}: gaveta do carrinho passa da janela`);
              await page.keyboard.press('Escape');
            }
          }
        }
        expect(falhas).toEqual([]);
      });

      test('alto contraste (forced-colors): captura para revisão humana', { tag: [`@${c.entrada.fatia}`] }, async ({ page }) => {
        test.skip(!S, 'bloqueado: sem MongoDB descartável para as sementes');
        await page.emulateMedia({ forcedColors: 'active' });
        await abrir(page, c, { tema: 'escuro', largura: 1440 });
        test.skip(redirecionou(page, c), `${c.entrada.pagina} só redireciona`);
        fs.mkdirSync(SAIDA, { recursive: true });
        await page.screenshot({ path: path.join(SAIDA, `${arquivoSeguro(`${c.rotulo}-forced-colors`)}.png`), fullPage: true, animations: 'disabled' });
        const h1 = await page.locator('h1:visible').count();
        expect(h1, 'a página continua com o título visível').toBeGreaterThan(0);
      });

      if (PAGINAS_DE_DOCUMENTO.has(c.entrada.pagina)) {
        test('impressão: shell oculto, tinta escura e QR conferido onde houver', { tag: [`@${c.entrada.fatia}`] }, async ({ page, baseURL }) => {
          test.skip(!S, 'bloqueado: sem MongoDB descartável para as sementes');
          await abrir(page, c, { tema: 'escuro', largura: 1440 });
          await page.emulateMedia({ media: 'print' });
          const r = await page.evaluate(() => {
            const vis = (s) => [...document.querySelectorAll(s)].some((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
            const lum = (cor) => { const m = cor.match(/\d+(\.\d+)?/g) || [0, 0, 0]; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
            const texto = document.querySelector('main') || document.body;
            return { shell: vis('.pf-topo, .pf-lateral, .pf-rodape, .shell-top, .shell-side'), luminanciaTexto: lum(getComputedStyle(texto).color) };
          });
          expect.soft(r.shell, 'shell oculto na impressão').toBe(false);
          expect.soft(r.luminanciaTexto, 'tinta escura na impressão').toBeLessThan(0.35);
          const pdf = await page.pdf({ format: 'A4', printBackground: true });
          fs.mkdirSync(SAIDA, { recursive: true });
          fs.writeFileSync(path.join(SAIDA, `${arquivoSeguro(c.rotulo)}.pdf`), pdf);
          await page.emulateMedia({ media: 'screen' });
          const temQr = await page.locator('svg[data-pf-qr-modulos]').count();
          if (temQr && S.ctx.codigo && c.entrada.pagina === 'certificado.html') {
            await conferirQrNaPagina(page, { texto: urlDeValidacao(S.ctx.codigo, { base: baseURL }), evidencia: { dir: SAIDA, nome: arquivoSeguro(c.rotulo) }, rotulo: c.rotulo });
          }
        });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// _qr.js contra um QR gerado na hora pelo DMC_QR (D-68)
// ---------------------------------------------------------------------------
test.describe('qualidade · _qr.js (D-68)', () => {
  test('confere a matriz do DMC_QR gerado na hora, a zona de silêncio e o lado impresso', { tag: ['@F0r'] }, async ({ page, baseURL }) => {
    await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('/__qa/estado');
    await page.addScriptTag({ url: `${EAD}js/portal/qr.js?v=dev` });
    await page.evaluate(() => window.DMC_QR.pronto);
    const texto = urlDeValidacao('DEC-2026-QA7K2M', { base: baseURL });
    await page.evaluate((t) => {
      document.body.innerHTML = `<div id="bloco-qr" style="padding:8px;background:#fff">${window.DMC_QR.svg(t, { tamanho: 128, margem: 4 })}</div>`;
    }, texto);
    const r = await conferirQrNaPagina(page, { texto, evidencia: { dir: SAIDA, nome: '_qr-gerado-na-hora', bloco: '#bloco-qr' }, rotulo: 'QR gerado na hora' });
    expect(r.margem).toBe(4);
    expect(r.ladoMm).toBeGreaterThanOrEqual(28);
    // A mesma matriz que o DMC_QR expõe (DMC_QR.matriz) bate com a do Node.
    const doNavegador = await page.evaluate((t) => window.DMC_QR.matriz(t), texto);
    expect(compararMatrizes(doNavegador, matrizEsperada(texto)).iguais).toBe(true);
  });

  test('reprova matriz trocada, margem < 4 e lado < 28 mm', { tag: ['@F0r'] }, async ({ page, baseURL }) => {
    const texto = urlDeValidacao('DEC-2026-QA7K2M', { base: baseURL });
    const outro = urlDeValidacao('DEC-2026-QA7K2N', { base: baseURL });
    await page.goto('/__qa/estado');
    await page.addScriptTag({ url: `${EAD}js/portal/qr.js?v=dev` });
    await page.evaluate(() => window.DMC_QR.pronto);
    const svgOutro = await page.evaluate((t) => window.DMC_QR.svg(t), outro);
    expect(compararMatrizes(lerSvgDoQr(svgOutro).matriz, matrizEsperada(texto)).iguais, 'matriz de outro código não pode passar').toBe(false);
    const svgMargem2 = await page.evaluate((t) => window.DMC_QR.svg(t, { margem: 2 }), texto);
    expect(lerSvgDoQr(svgMargem2).margem).toBe(2);
    await page.evaluate((t) => { document.body.innerHTML = window.DMC_QR.svg(t, { tamanho: 64 }); }, texto);
    await expect(conferirQrNaPagina(page, { texto, rotulo: 'QR pequeno' })).rejects.toThrow(/lado impresso/);
  });
});

// ---------------------------------------------------------------------------
// Só no G2 (QA_ESTRITO=1): links internos e cache por hash (§6.5, §9.6)
// ---------------------------------------------------------------------------
test.describe('qualidade · G2 (QA_ESTRITO=1)', () => {
  test('cache: todo asset local com ?v= igual ao hash atual, igual em todas as páginas', { tag: ['@integracao'] }, async () => {
    test.skip(!QA_ESTRITO, 'só no G2 (QA_ESTRITO=1): na fase 1 todas as fatias escrevem ?v=dev (§6.5)');
    const { mudancas, erros } = planejarVersoes();
    expect(erros, 'referências a arquivos inexistentes').toEqual([]);
    expect(mudancas.map((m) => `${m.arquivo}: ${m.de} → ${m.para}`), 'rode tests/tools/versionar-ead.mjs --aplicar (principal)').toEqual([]);
  });

  test('links: todo href interno estático e dos menus renderizados responde 200', { tag: ['@integracao'] }, async ({ page, request }) => {
    test.skip(!QA_ESTRITO, 'só no G2 (QA_ESTRITO=1): na fase 1 os menus apontam para páginas ainda ausentes (R13)');
    test.skip(!S, 'bloqueado: sem MongoDB descartável para as sementes');
    test.setTimeout(240_000);
    const hrefs = new Set();
    for (const papel of ['aluno', 'professor', 'admin']) {
      for (const pg of P.PAGINAS_BASE.filter((b) => !PAGINAS_2D.includes(b.pagina) && b.existe)) {
        await P.entrarComToken(page, tokenDo(papel));
        await page.goto(EAD + (URL_DA_BASE[pg.pagina] ? URL_DA_BASE[pg.pagina](S.ctx) : pg.pagina), { waitUntil: 'load' });
        await page.waitForLoadState('networkidle').catch(() => {});
        for (const h of await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href))) {
          const u = new URL(h);
          if (u.origin === new URL(page.url()).origin && u.pathname.startsWith('/plataforma-ead/')) hrefs.add(u.origin + u.pathname);
        }
      }
    }
    const quebrados = [];
    for (const h of hrefs) {
      const r = await request.get(h, { maxRedirects: 0, failOnStatusCode: false });
      if (r.status() !== 200) quebrados.push(`${r.status()} ${h}`);
    }
    expect(quebrados).toEqual([]);
  });
});

// Sanidade do mapa de posse usado pelo monitor (D-73): toda página do escopo tem dono.
test('qualidade · POSSE cobre as páginas do escopo', async () => {
  const semDono = CASOS.map((c) => c.entrada.pagina).filter((pg) => donoDe(pg) === null);
  expect(semDono).toEqual([]);
});
