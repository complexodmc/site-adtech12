// =============================================================
// Contraste (WCAG 2.x) e distância de cor (ΔE_OK, OKLab) da plataforma EAD.
//
// Fonte: docs/dmc/PORTAL-UX.md §2.2 (superfícies, texto, acento, ação, controles, trilho),
// §2.3 (cores de estado, destaque, ΔE entre aviso, erro e acento) e §4.5 (estado marcado).
// Os valores esperados de cada par são os publicados na UX; a ferramenta mede de novo e reprova
// quando (a) um par sem exceção documentada fica abaixo do mínimo, (b) o valor medido diverge do
// publicado (cor ou tabela fora de sincronia), (c) no escuro, ΔE_OK < 0,08 entre aviso, erro e acento,
// (d) um token da casa citado pela UX mudou em tokens.css, (e) css/portal.css (quando existir, S1)
// declara um --pf-* com valor diferente do da UX.
//
// Uso:
//   node tests/tools/contraste.mjs                 → relatório; saída 0 = tudo conforme
//   node tests/tools/contraste.mjs --json          → resultados em JSON
//   node tests/tools/contraste.mjs --css <arq>     → outro portal.css (padrão: plataforma-ead/css/portal.css)
//   node tests/tools/contraste.mjs --tokens <arq>  → outro tokens.css (padrão: assets/css/tokens.css)
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKENS_PADRAO = path.join(RAIZ_REPO, 'complexodmc.com.br/assets/css/tokens.css');
const PORTAL_PADRAO = path.join(RAIZ_REPO, 'complexodmc.com.br/plataforma-ead/css/portal.css');

// Tolerância contra o valor publicado: a UX publica 2 casas (razão) e 3 casas (ΔE); a composição
// do destaque é feita em 8 bits, como o navegador pinta.
const TOL_RAZAO = 0.015;
const TOL_DELTA = 0.0015;
const MIN_TEXTO = 4.5; // WCAG 1.4.3
const MIN_UI = 3.0; // WCAG 1.4.11
const MIN_DELTA_ESCURO = 0.08; // UX §2.3

// ------------------------------------------------------------------
// Cor
// ------------------------------------------------------------------

/** '#rgb' | '#rrggbb' | 'rgb(r,g,b)' | 'rgba(r,g,b,a)' | 'r, g, b' → {r,g,b,a} (0–255, a 0–1) ou null. */
export function paraRgb(valor) {
  if (typeof valor !== 'string') return null;
  const v = valor.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  m = v.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/);
  if (m) {
    let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (!Number.isFinite(a)) a = 1;
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  m = v.match(/^([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: 1 };
  return null;
}

const linear = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminancia = ({ r, g, b }) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** Compõe uma cor com alfa sobre um fundo opaco, em sRGB e arredondando a 8 bits (como o navegador pinta). */
export function comporSobre(frente, fundo) {
  const f = typeof frente === 'string' ? paraRgb(frente) : frente;
  const b = typeof fundo === 'string' ? paraRgb(fundo) : fundo;
  const a = f.a ?? 1;
  const c = (x, y) => Math.round(x * a + y * (1 - a));
  return { r: c(f.r, b.r), g: c(f.g, b.g), b: c(f.b, b.b), a: 1 };
}

/** Razão de contraste WCAG 2.x (frente com alfa é composta sobre o fundo). */
export function razaoContraste(frente, fundo) {
  const b = typeof fundo === 'string' ? paraRgb(fundo) : fundo;
  let f = typeof frente === 'string' ? paraRgb(frente) : frente;
  if (!f || !b) throw new Error(`cor inválida: ${frente} × ${fundo}`);
  if ((b.a ?? 1) < 1) throw new Error(`fundo com alfa precisa ser composto antes: ${fundo}`);
  if ((f.a ?? 1) < 1) f = comporSobre(f, b);
  const l1 = luminancia(f);
  const l2 = luminancia(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** OKLab (Björn Ottosson) de uma cor sRGB opaca. */
export function oklab(cor) {
  const c = typeof cor === 'string' ? paraRgb(cor) : cor;
  const r = linear(c.r); const g = linear(c.g); const b = linear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/** ΔE_OK: distância euclidiana em OKLab (L de 0 a 1). */
export function deltaEOK(a, b) {
  const x = oklab(a); const y = oklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

// ------------------------------------------------------------------
// Especificação (UX §2.2 e §2.3) — valor de cada --pf-* por tema e o token da casa de origem
// ------------------------------------------------------------------

const t = (valor, token) => (token ? { valor, token } : { valor });

export const ESPEC = Object.freeze({
  escuro: {
    '--pf-fundo': t('#0b0c0e', '--surface-0'),
    '--pf-painel': t('#121416', '--surface-1'),
    '--pf-painel-2': t('#1a1c1f', '--surface-2'),
    '--pf-painel-3': t('#24272a', '--surface-3'),
    '--pf-campo': t('#0b0c0e', '--surface-0'),
    '--pf-linha': { valor: 'rgba(255, 255, 255, 0.1)', token: '--color-line', religado: true },
    '--pf-linha-forte': { valor: 'rgba(255, 255, 255, 0.18)', token: '--color-line-strong', religado: true },
    '--pf-controle': t('#67696c', '--color-control'),
    '--pf-controle-forte': t('#7d7f83'),
    '--pf-trilha': t('#36383c', '--color-graphite-600'),
    '--pf-texto-1': { valor: '#f5f3f0', token: '--text-1', religado: true },
    '--pf-texto-2': { valor: '#bfbdb9', token: '--text-2', religado: true },
    '--pf-texto-3': { valor: '#9a9893', token: '--text-3', religado: true },
    '--pf-acento': t('#d6b069', '--color-gold'),
    '--pf-acento-rgb': t('214, 176, 105', '--color-gold-rgb'),
    '--pf-acento-hover': t('#e7d3b1', '--color-gold-soft'),
    '--pf-acao': t('#d6b069'),
    '--pf-acao-hover': t('#e7d3b1'),
    '--pf-acao-texto': t('#0b0c0e', '--text-on-gold'),
    '--pf-foco': t('#d6b069', '--color-gold'),
    '--pf-sucesso': t('#8ec899'),
    '--pf-aviso': t('#dd881b'),
    '--pf-erro': t('#e88f84', '--color-error'),
    '--pf-info': t('#8caed7'),
  },
  claro: {
    '--pf-fundo': t('#f5f3ef', '--color-paper'),
    '--pf-painel': t('#ffffff', '--color-white'),
    '--pf-painel-2': t('#e9e6e0', '--color-paper-2'),
    '--pf-painel-3': t('#dedad3'),
    '--pf-campo': t('#ffffff', '--color-white'),
    '--pf-linha': t('rgba(11, 12, 14, 0.14)', '--color-line-ink'),
    '--pf-linha-forte': t('rgba(11, 12, 14, 0.24)'),
    '--pf-controle': t('#7f8285', '--color-control-ink'),
    '--pf-controle-forte': t('#6e7175'),
    '--pf-trilha': t('#d9d5cd'),
    '--pf-texto-1': t('#0b0c0e', '--text-ink-1'),
    '--pf-texto-2': t('#4a4d52', '--text-ink-2'),
    '--pf-texto-3': t('#616368', '--text-ink-3'),
    '--pf-acento': t('#82602e', '--color-gold-deep'),
    '--pf-acento-rgb': t('130, 96, 46'),
    '--pf-acento-hover': t('#6b4e24'),
    '--pf-acao': t('#0b0c0e', '--color-black'),
    '--pf-acao-hover': t('#24272a', '--color-graphite-700'),
    '--pf-acao-texto': t('#f5f3ef', '--color-paper'),
    '--pf-foco': t('#82602e', '--color-gold-deep'),
    '--pf-sucesso': t('#466e59'),
    '--pf-aviso': t('#9a5518'),
    '--pf-erro': t('#9b463e'),
    '--pf-info': t('#4d688a'),
  },
});

/** Alfa do fundo de destaque das cores de estado (UX §2.3) e o fundo sobre o qual a UX mediu. */
const DESTAQUE = { escuro: { alfa: 0.12, sobre: '--pf-painel' }, claro: { alfa: 0.08, sobre: '--pf-painel' } };
/** Fundo de destaque do neutro (UX §2.3). */
const DESTAQUE_NEUTRO = { escuro: 'rgba(255, 255, 255, 0.06)', claro: 'rgba(11, 12, 14, 0.05)' };

const REGRA_1 = 'regra 1 de §2.2: campo dentro de --pf-painel-2/-3 usa --pf-controle-forte';
const REGRA_2 = 'regra 2 de §2.2: no claro, --pf-painel-3 não recebe texto abaixo de --pf-texto-2, acento nem marcador';
const SEM_DESTAQUE = 'proibido em pf-tabela/pf-lista/pf-linha-tempo (§2.3): ali o marcador é só glifo + texto';

// ------------------------------------------------------------------
// Pares publicados
// ------------------------------------------------------------------

const FUNDOS = ['--pf-fundo', '--pf-painel', '--pf-painel-2', '--pf-painel-3'];

function linhaDeTabela(tema, frente, valores, minimo, ref, excecoes = {}) {
  return valores.map((doc, i) => (doc === null ? null : {
    tema, frente, fundo: FUNDOS[i], documentado: doc, minimo, ref, excecao: excecoes[i] || null,
  })).filter(Boolean);
}

/** Lista fechada dos pares medidos (UX §2.2, §2.3 e §4.5). */
export const PARES = Object.freeze([
  // §2.2 — texto, acento e controles (fundo · painel · painel-2 · painel-3)
  ...linhaDeTabela('escuro', '--pf-texto-1', [17.67, 16.67, 15.42, 13.56], MIN_TEXTO, 'UX §2.2'),
  ...linhaDeTabela('escuro', '--pf-texto-2', [10.43, 9.84, 9.10, 8.00], MIN_TEXTO, 'UX §2.2'),
  ...linhaDeTabela('escuro', '--pf-texto-3', [6.79, 6.41, 5.92, 5.21], MIN_TEXTO, 'UX §2.2'),
  ...linhaDeTabela('escuro', '--pf-acento', [9.57, 9.03, 8.35, 7.35], MIN_TEXTO, 'UX §2.2'),
  ...linhaDeTabela('escuro', '--pf-acento-hover', [13.37, 12.62, 11.67, 10.26], MIN_TEXTO, 'UX §2.2'),
  ...linhaDeTabela('escuro', '--pf-controle', [3.55, 3.35, 3.10, 2.73], MIN_UI, 'UX §2.2', { 3: REGRA_1 }),
  ...linhaDeTabela('escuro', '--pf-controle-forte', [4.88, 4.60, 4.26, 3.74], MIN_UI, 'UX §2.2 e §4.5'),
  ...linhaDeTabela('claro', '--pf-texto-1', [17.66, 19.57, 15.71, 14.05], MIN_TEXTO, 'UX §2.2'),
  ...linhaDeTabela('claro', '--pf-texto-2', [7.66, 8.49, 6.81, 6.09], MIN_TEXTO, 'UX §2.2'),
  ...linhaDeTabela('claro', '--pf-texto-3', [5.43, 6.01, 4.83, 4.32], MIN_TEXTO, 'UX §2.2', { 3: REGRA_2 }),
  ...linhaDeTabela('claro', '--pf-acento', [5.17, 5.73, 4.60, 4.12], MIN_TEXTO, 'UX §2.2', { 3: REGRA_2 }),
  ...linhaDeTabela('claro', '--pf-acento-hover', [6.91, 7.66, 6.15, null], MIN_TEXTO, 'UX §2.2'),
  ...linhaDeTabela('claro', '--pf-controle', [3.49, 3.86, 3.10, 2.77], MIN_UI, 'UX §2.2', { 3: REGRA_1 }),
  ...linhaDeTabela('claro', '--pf-controle-forte', [4.43, 4.90, 3.94, 3.52], MIN_UI, 'UX §2.2 e §4.5'),
  // §2.2 — texto do primário sobre a ação (e hover); preenchimento do acento sobre o trilho
  { tema: 'escuro', frente: '--pf-acao-texto', fundo: '--pf-acao', documentado: 9.57, minimo: MIN_TEXTO, ref: 'UX §2.2' },
  { tema: 'escuro', frente: '--pf-acao-texto', fundo: '--pf-acao-hover', documentado: 13.37, minimo: MIN_TEXTO, ref: 'UX §2.2' },
  { tema: 'claro', frente: '--pf-acao-texto', fundo: '--pf-acao', documentado: 17.66, minimo: MIN_TEXTO, ref: 'UX §2.2' },
  { tema: 'claro', frente: '--pf-acao-texto', fundo: '--pf-acao-hover', documentado: 13.55, minimo: MIN_TEXTO, ref: 'UX §2.2' },
  { tema: 'escuro', frente: '--pf-acento', fundo: '--pf-trilha', documentado: 5.75, minimo: MIN_UI, ref: 'UX §2.2 (progresso)' },
  { tema: 'claro', frente: '--pf-acento', fundo: '--pf-trilha', documentado: 3.92, minimo: MIN_UI, ref: 'UX §2.2 (progresso)' },
  // §4.5 — botão do switch ligado (--pf-fundo) sobre o trilho em --pf-acento
  { tema: 'escuro', frente: '--pf-fundo', fundo: '--pf-acento', documentado: 9.57, minimo: MIN_UI, ref: 'UX §4.5 (switch)' },
  { tema: 'claro', frente: '--pf-fundo', fundo: '--pf-acento', documentado: 5.17, minimo: MIN_UI, ref: 'UX §4.5 (switch)' },
  // §2.3 — estados: escuro (fundo · painel · painel-2 · destaque), claro (papel · branco · papel-2 · destaque)
  ...['sucesso', 'aviso', 'erro', 'info'].flatMap((estado) => {
    const tab = {
      sucesso: { escuro: [10.13, 9.56, 8.84, 7.64], claro: [5.21, 5.78, 4.64, 5.17] },
      aviso: { escuro: [7.09, 6.69, 6.19, 5.68], claro: [5.14, 5.70, 4.57, 5.09] },
      erro: { escuro: [8.10, 7.64, 7.07, 6.34], claro: [5.67, 6.29, 5.05, 5.59] },
      info: { escuro: [8.53, 8.05, 7.44, 6.63], claro: [5.17, 5.73, 4.60, 5.16] },
    }[estado];
    return ['escuro', 'claro'].flatMap((tema) => [
      ...tab[tema].slice(0, 3).map((doc, i) => ({
        tema, frente: `--pf-${estado}`, fundo: FUNDOS[i], documentado: doc, minimo: MIN_TEXTO, ref: 'UX §2.3',
      })),
      {
        tema, frente: `--pf-${estado}`, fundo: `destaque(--pf-${estado})`, destaque: estado,
        documentado: tab[tema][3], minimo: MIN_TEXTO, ref: 'UX §2.3 (fundo de destaque)',
      },
    ]);
  }),
  { tema: 'escuro', frente: '--pf-aviso', fundo: '--pf-painel-3', documentado: 5.44, minimo: MIN_TEXTO, ref: 'UX §2.3' },
  // §2.3 — destaque sobre papel-2 no claro: abaixo de AA, por isso proibido em tabela, lista e linha do tempo
  ...[['aviso', 4.13], ['info', 4.17], ['sucesso', 4.20]].map(([estado, doc]) => ({
    tema: 'claro', frente: `--pf-${estado}`, fundo: `destaque(--pf-${estado}) sobre --pf-painel-2`,
    destaque: estado, destaqueSobre: '--pf-painel-2', documentado: doc, minimo: MIN_TEXTO,
    ref: 'UX §2.3', excecao: SEM_DESTAQUE,
  })),
  // §2.3 — neutro = --pf-texto-2 sobre o destaque neutro (a UX publica só o piso: ≥ 8,00 · ≥ 6,81)
  { tema: 'escuro', frente: '--pf-texto-2', fundo: 'destaque neutro', destaqueNeutro: true, piso: 8.00, minimo: MIN_TEXTO, ref: 'UX §2.3 (neutro)' },
  { tema: 'claro', frente: '--pf-texto-2', fundo: 'destaque neutro', destaqueNeutro: true, piso: 6.81, minimo: MIN_TEXTO, ref: 'UX §2.3 (neutro)' },
  // Alternativas recusadas pela UX (o motivo da recusa é a própria medida)
  { tema: 'claro', frente: '#aa5047', rotulo: '--color-error-ink', fundo: '--pf-painel-2', documentado: 4.27, minimo: MIN_TEXTO, ref: 'UX DC-04', excecao: 'recusado: por isso o erro no claro é #9b463e' },
  { tema: 'claro', frente: '#bfbdb9', rotulo: 'seta do select em data-URI (bs-input)', fundo: '--pf-campo', documentado: 1.88, minimo: MIN_UI, ref: 'UX §2.7', excecao: 'recusado: seta por mask-image com currentColor' },
]);

/** Distâncias ΔE_OK (UX §2.3, DC-04). */
export const DISTANCIAS = Object.freeze([
  { tema: 'escuro', a: '--pf-aviso', b: '--pf-acento', documentado: 0.097, minimo: MIN_DELTA_ESCURO, ref: 'UX §2.3, DC-04' },
  { tema: 'escuro', a: '--pf-aviso', b: '--pf-erro', documentado: 0.100, minimo: MIN_DELTA_ESCURO, ref: 'UX §2.3, DC-04' },
  { tema: 'escuro', a: '--pf-erro', b: '--pf-acento', documentado: null, minimo: MIN_DELTA_ESCURO, ref: 'UX §2.3' },
  {
    tema: 'claro', a: '--pf-aviso', b: '--pf-acento', documentado: 0.047, minimo: null, ref: 'UX §2.3, DC-04',
    excecao: 'exceção registrada (DC-04): aviso só com triângulo + texto, nunca ponto ou fio isolado nem vizinho de --pf-acento',
  },
  {
    tema: 'claro', a: '--pf-aviso', b: '--pf-erro', documentado: 0.061, minimo: null, ref: 'UX §2.3',
    excecao: 'exceção registrada (DC-04): forma codifica o estado (triângulo × losango)',
  },
  { tema: 'claro', a: '--pf-erro', b: '--pf-acento', documentado: null, minimo: null, ref: 'UX §2.3 (informativo)' },
  // alternativas recusadas (DC-04 e quadro de críticas da UX): a medida mostra o motivo
  { tema: 'escuro', a: '#e39b62', rotulo: 'âmbar do rascunho', b: '--pf-acento', documentado: 0.053, minimo: null, ref: 'UX DC-04', excecao: 'recusado' },
  { tema: 'escuro', a: '#ee8a3c', rotulo: 'aviso proposto na revisão', b: '--pf-erro', documentado: 0.075, minimo: null, ref: 'UX §15', excecao: 'recusado' },
]);

// ------------------------------------------------------------------
// Leitura de CSS (tokens.css e portal.css)
// ------------------------------------------------------------------

/** Blocos de regra com o seletor, o corpo plano e os ancestrais (@media etc.). Basta para blocos de variáveis. */
export function blocosCss(css) {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocos = [];
  const pilha = [];
  let buf = '';
  for (const ch of limpo) {
    if (ch === '{') { pilha.push(buf.trim()); buf = ''; }
    else if (ch === '}') {
      const seletor = pilha.pop() ?? '';
      blocos.push({ seletor, corpo: buf, ancestrais: [...pilha] });
      buf = '';
    } else buf += ch;
  }
  return blocos;
}

function declaracoes(corpo) {
  const d = {};
  for (const [, nome, valor] of corpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) d[nome] = valor.trim();
  return d;
}

/** Variáveis do :root de nível superior de tokens.css. */
export function lerTokens(arquivo = TOKENS_PADRAO) {
  const d = {};
  for (const b of blocosCss(fs.readFileSync(arquivo, 'utf8'))) {
    if (b.ancestrais.length) continue;
    if (!b.seletor.split(',').map((s) => s.trim()).includes(':root')) continue;
    Object.assign(d, declaracoes(b.corpo));
  }
  return d;
}

/**
 * Variáveis --pf-* dos blocos de tema de portal.css, fora de @media: blocos cuja lista de seletores tem,
 * como item próprio (não descendente), `html[data-pf-tema="escuro"]` ou `html[data-pf-tema="claro"]`.
 * (`html[data-pf-tema="escuro"] .pf-leitura` é superfície que inverte, não o tema.)
 */
export function lerTemasPortal(arquivo) {
  const temas = { escuro: {}, claro: {} };
  for (const b of blocosCss(fs.readFileSync(arquivo, 'utf8'))) {
    if (b.ancestrais.length) continue;
    const itens = b.seletor.split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    for (const tema of ['escuro', 'claro']) {
      const re = new RegExp(`^(html)?\\[data-pf-tema\\s*=\\s*["']?${tema}["']?\\s*\\]$`);
      if (itens.some((s) => re.test(s))) Object.assign(temas[tema], declaracoes(b.corpo));
    }
  }
  return temas;
}

/** Resolve var(--x[, fallback]) recursivamente nos escopos dados (o primeiro que tiver a variável vence). */
export function resolver(valor, escopos, profundidade = 0) {
  if (valor == null || profundidade > 20) return null;
  const v = String(valor).trim();
  const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (!m) return v;
  for (const e of escopos) if (Object.hasOwn(e, m[1])) return resolver(e[m[1]], escopos, profundidade + 1);
  return m[2] ? resolver(m[2], escopos, profundidade + 1) : null;
}

/** Forma canônica para comparar valores de cor ('#rrggbb' ou 'rgba(r, g, b, a)' ou 'r, g, b'). */
export function canonica(valor) {
  const c = paraRgb(valor);
  if (!c) return String(valor).trim().toLowerCase();
  if (/^\s*[\d.]+\s*,/.test(valor)) return `${c.r}, ${c.g}, ${c.b}`;
  if (c.a < 1) return `rgba(${c.r}, ${c.g}, ${c.b}, ${+c.a.toFixed(3)})`;
  return `#${[c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

// ------------------------------------------------------------------
// Medição
// ------------------------------------------------------------------

function corDoPar(tema, nome) {
  if (nome.startsWith('#')) return nome;
  const e = ESPEC[tema][nome];
  if (!e) throw new Error(`token sem valor na especificação: ${tema} ${nome}`);
  return e.valor;
}

function fundoDoPar(par) {
  const { tema } = par;
  if (par.destaqueNeutro) {
    const sobre = ESPEC[tema]['--pf-painel'].valor;
    return comporSobre(DESTAQUE_NEUTRO[tema], sobre);
  }
  if (par.destaque) {
    const cor = paraRgb(ESPEC[tema][`--pf-${par.destaque}`].valor);
    const sobre = ESPEC[tema][par.destaqueSobre || DESTAQUE[tema].sobre].valor;
    return comporSobre({ ...cor, a: DESTAQUE[tema].alfa }, sobre);
  }
  return paraRgb(corDoPar(tema, par.fundo));
}

const arred = (x, casas) => Math.round(x * 10 ** casas) / 10 ** casas;

/** Mede todos os pares e distâncias e confere tokens.css e (se existir) portal.css. */
export function medir({ tokens = TOKENS_PADRAO, portal = PORTAL_PADRAO } = {}) {
  const falhas = [];
  const avisos = [];

  const pares = PARES.map((p) => {
    const medido = razaoContraste(paraRgb(corDoPar(p.tema, p.frente)), fundoDoPar(p));
    const r = { ...p, medido: arred(medido, 3) };
    const nome = `${p.tema} ${p.rotulo || p.frente} × ${p.fundo}`;
    if (p.documentado != null && Math.abs(medido - p.documentado) > TOL_RAZAO) {
      r.status = 'divergente';
      falhas.push(`${nome}: medido ${medido.toFixed(2)}, UX publica ${p.documentado.toFixed(2)} (${p.ref})`);
    } else if (p.piso != null && medido + TOL_RAZAO < p.piso) {
      r.status = 'divergente';
      falhas.push(`${nome}: medido ${medido.toFixed(2)}, UX publica ≥ ${p.piso.toFixed(2)} (${p.ref})`);
    } else if (medido < p.minimo) {
      r.status = p.excecao ? 'excecao' : 'reprovado';
      if (!p.excecao) falhas.push(`${nome}: ${medido.toFixed(2)} < ${p.minimo} (${p.ref})`);
    } else {
      r.status = 'ok';
      if (p.excecao && !p.excecao.startsWith('recusado') && !p.excecao.startsWith('proibido')) {
        avisos.push(`${nome}: exceção documentada, mas o par passa (${medido.toFixed(2)})`);
      }
    }
    return r;
  });

  const distancias = DISTANCIAS.map((d) => {
    const medido = deltaEOK(corDoPar(d.tema, d.a), corDoPar(d.tema, d.b));
    const r = { ...d, medido: arred(medido, 4) };
    const nome = `${d.tema} ΔE_OK ${d.rotulo || d.a} × ${d.b}`;
    if (d.documentado != null && Math.abs(medido - d.documentado) > TOL_DELTA) {
      r.status = 'divergente';
      falhas.push(`${nome}: medido ${medido.toFixed(3)}, UX publica ${d.documentado.toFixed(3)} (${d.ref})`);
    } else if (d.minimo != null && medido < d.minimo) {
      r.status = 'reprovado';
      falhas.push(`${nome}: ${medido.toFixed(3)} < ${d.minimo} (${d.ref})`);
    } else {
      r.status = d.excecao ? 'excecao' : d.minimo == null ? 'informativo' : 'ok';
    }
    return r;
  });

  // tokens.css: o valor de origem de cada --pf-* ainda é o que a UX mediu
  const fonte = { tokens: path.relative(RAIZ_REPO, tokens), portal: null };
  let vars = {};
  try { vars = lerTokens(tokens); } catch (e) { falhas.push(`tokens.css ilegível: ${e.message}`); }
  const conferenciaTokens = [];
  for (const tema of ['escuro', 'claro']) {
    for (const [nome, e] of Object.entries(ESPEC[tema])) {
      if (!e.token) continue;
      const v = resolver(`var(${e.token})`, [vars]);
      const ok = v != null && canonica(v) === canonica(e.valor);
      conferenciaTokens.push({ tema, nome, token: e.token, esperado: e.valor, emTokens: v, ok });
      if (!ok) falhas.push(`tokens.css: ${e.token} = ${v ?? 'ausente'}, UX mediu ${nome} (${tema}) com ${e.valor}`);
    }
  }

  // portal.css (S1, F0s): os --pf-* declarados nos blocos de tema batem com a UX
  const conferenciaPortal = [];
  if (portal && fs.existsSync(portal)) {
    fonte.portal = path.relative(RAIZ_REPO, portal);
    const temas = lerTemasPortal(portal);
    if (!Object.keys(temas.escuro).length && !Object.keys(temas.claro).length) {
      avisos.push(`${fonte.portal}: nenhum bloco com html[data-pf-tema="escuro|claro"] fora de @media; conferência do portal.css não feita`);
    }
    for (const tema of ['escuro', 'claro']) {
      if (!Object.keys(temas[tema]).length) continue;
      const escopos = tema === 'claro' ? [temas.claro, temas.escuro, vars] : [temas.escuro, vars];
      for (const [nome, e] of Object.entries(ESPEC[tema])) {
        if (!Object.hasOwn(temas[tema], nome)) {
          avisos.push(`${fonte.portal}: ${nome} não declarado no bloco do tema ${tema}`);
          continue;
        }
        const v = resolver(temas[tema][nome], escopos);
        const ok = v != null && canonica(v) === canonica(e.valor);
        conferenciaPortal.push({ tema, nome, declarado: temas[tema][nome], resolvido: v, esperado: e.valor, ok });
        if (v == null) avisos.push(`${fonte.portal}: ${nome} (${tema}) não resolvido: ${temas[tema][nome]}`);
        else if (!ok) falhas.push(`${fonte.portal}: ${nome} (${tema}) = ${v}, UX: ${e.valor}`);
        if (e.religado && tema === 'escuro' && v != null && /var\(/.test(temas[tema][nome])) {
          falhas.push(`${fonte.portal}: ${nome} deve levar o literal ${e.valor} (religado, UX §2.2), não ${temas[tema][nome]}`);
        }
      }
    }
  }

  return { pares, distancias, conferenciaTokens, conferenciaPortal, fonte, falhas, avisos };
}

// ------------------------------------------------------------------
// Relatório
// ------------------------------------------------------------------

const virgula = (x, casas) => x.toFixed(casas).replace('.', ',');

function relatorio(res) {
  const linhas = [];
  linhas.push('contraste · UX §2.2–§2.3 e §4.5 (WCAG 2.x; ΔE_OK em OKLab; destaque composto em 8 bits)');
  linhas.push(`  tokens.css: ${res.fonte.tokens} · portal.css: ${res.fonte.portal ?? 'ausente (S1 da F0s): conferidos só os valores da UX'}`);
  for (const tema of ['escuro', 'claro']) {
    linhas.push('');
    linhas.push(`TEMA ${tema.toUpperCase()}`);
    linhas.push(`  ${'par'.padEnd(58)} ${'medido'.padStart(7)} ${'UX'.padStart(7)} ${'mín'.padStart(4)}  resultado`);
    for (const p of res.pares.filter((x) => x.tema === tema)) {
      const nome = `${p.rotulo || p.frente} × ${p.fundo}`;
      const doc = p.documentado != null ? virgula(p.documentado, 2) : p.piso != null ? `≥${virgula(p.piso, 2)}` : '—';
      const st = p.status === 'excecao' ? `exceção: ${p.excecao}` : p.status;
      linhas.push(`  ${nome.padEnd(58)} ${virgula(p.medido, 2).padStart(7)} ${doc.padStart(7)} ${virgula(p.minimo, 1).padStart(4)}  ${st}`);
    }
  }
  linhas.push('');
  linhas.push('ΔE_OK (escuro: mínimo 0,08 entre aviso, erro e acento)');
  for (const d of res.distancias) {
    const nome = `${d.tema} ${d.rotulo ? `${d.a} (${d.rotulo})` : d.a} × ${d.b}`;
    const doc = d.documentado != null ? virgula(d.documentado, 3) : '—';
    const st = d.status === 'excecao' ? `${d.excecao}` : d.status;
    linhas.push(`  ${nome.padEnd(58)} ${virgula(d.medido, 3).padStart(7)} ${doc.padStart(7)} ${(d.minimo != null ? virgula(d.minimo, 2) : '—').padStart(4)}  ${st}`);
  }
  linhas.push('');
  const tk = res.conferenciaTokens;
  linhas.push(`tokens.css: ${tk.filter((x) => x.ok).length}/${tk.length} tokens de origem iguais aos medidos pela UX`);
  if (res.fonte.portal) {
    const pc = res.conferenciaPortal;
    linhas.push(`portal.css: ${pc.filter((x) => x.ok).length}/${pc.length} --pf-* iguais à UX`);
  }
  const conta = (s) => res.pares.filter((p) => p.status === s).length;
  linhas.push(`pares: ${res.pares.length} (ok ${conta('ok')} · exceção documentada ${conta('excecao')} · reprovado ${conta('reprovado')} · divergente ${conta('divergente')}) · distâncias: ${res.distancias.length}`);
  for (const a of res.avisos) linhas.push(`aviso: ${a}`);
  for (const f of res.falhas) linhas.push(`ERRO: ${f}`);
  linhas.push(res.falhas.length ? `REPROVADO (${res.falhas.length})` : 'OK: contrastes e distâncias conforme a UX');
  return linhas.join('\n');
}

const executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDireto) {
  const args = process.argv.slice(2);
  const valorDe = (flag, padrao) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : padrao; };
  const res = medir({ tokens: valorDe('--tokens', TOKENS_PADRAO), portal: valorDe('--css', PORTAL_PADRAO) });
  if (args.includes('--json')) console.log(JSON.stringify(res, null, 2));
  else console.log(relatorio(res));
  process.exit(res.falhas.length ? 1 : 0);
}
