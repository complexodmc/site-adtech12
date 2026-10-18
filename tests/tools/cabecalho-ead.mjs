// =============================================================
// Cabeçalho único das páginas da plataforma EAD (operação mecânica do S2).
//
// Fonte: docs/dmc/PORTAL-ACADEMICO.md §6.4 (modelo do <head> e cascata), §8.2 item 3 e §8.3 (S1/S2, D-60);
// docs/dmc/PORTAL-UX.md §2.1. Escrito pela F0r; APLICADO só pela sessão principal, no S2.
//
// O que faz, em cada página da raiz de plataforma-ead/ (nunca login.html nem login-classico.html, da 2d):
//   1. <head>: troca SÓ o bloco entre <!-- @dmc-cabecalho:inicio … --> e <!-- @dmc-cabecalho:fim -->.
//      Na primeira vez (sem marcadores) o bloco absorve o que o modelo de §6.4 já declara — charset,
//      viewport, robots, title, description, favicon, preconnect, fontes, tokens/components/plataforma/
//      portal.css e pre-pintura.js — e o resto do <head> (meta referrer, CSS de domínio, comentários) fica
//      depois do marcador de fim, na ordem original. Fontes antigas (DM Sans/Raleway/Playfair) e o favicon
//      turquesa saem; `?v=` já existente em arquivo local é preservado (versionar-ead.mjs), novo = `dev`.
//   2. <body>: tira a classe `bg-grid`, remove <div class="glow-corner"> vazio e troca
//      <span class="gradient-text">x</span> por <em>x</em>.
//   3. Insere <script src="js/portal/ui.js?v=dev"> antes de js/shell.js (sem shell.js: depois de
//      js/app.js; sem app.js: depois de js/api-client.js; sem nenhum: antes de </body>).
// É idempotente: rodar de novo não muda nada (a própria ferramenta confere isso antes de gravar).
//
// Uso:
//   node tests/tools/cabecalho-ead.mjs                  → DRY-RUN (padrão): mostra o diff, não grava nada
//   node tests/tools/cabecalho-ead.mjs --aplicar        → grava (principal, S2; exige o S1 no disco)
//   node tests/tools/cabecalho-ead.mjs --verificar      → saída 1 se alguma página ainda mudaria
//   opções: --raiz <dir>  outra cópia da plataforma-ead (padrão: a do repositório)
//           --forcar      grava mesmo sem js/portal/pre-pintura.js, js/portal/ui.js e css/portal.css
//           --resumo      sem o diff
//           <pagina.html …>  só essas páginas (da raiz da plataforma-ead)
// Saída: 0 ok · 1 (--verificar) há mudança pendente · 2 erro, página recusada ou S1 ausente no --aplicar.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAIZ_EAD, PAGINAS_2D, DONO_2D, donoDe } from './posse-ead.mjs';

export const MARCA_INICIO = '<!-- @dmc-cabecalho:inicio · gerado por tests/tools/cabecalho-ead.mjs; o que fica fora dos marcadores é da página -->';
export const MARCA_FIM = '<!-- @dmc-cabecalho:fim -->';
const RE_INICIO = /<!--\s*@dmc-cabecalho:inicio[\s\S]*?-->/g;
const RE_FIM = /<!--\s*@dmc-cabecalho:fim[\s\S]*?-->/g;

/** Mesmo link de fontes do site e do login (UX §2.1 item 4), com & escapado como no site. */
const FONTES_HREF = 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400..600&amp;family=Newsreader:ital,opsz,wght@0,48,300;1,48,300&amp;display=swap';
/** ?v= quando a página ainda não tem (§6.5: tokens/components no esquema do site; locais = dev na fase 0/1). */
const V_PADRAO = { 'pre-pintura': 'dev', tokens: '1', components: '3', plataforma: 'dev', portal: 'dev' };
const UI_JS = 'js/portal/ui.js';
const UI_TAG = `<script src="${UI_JS}?v=dev"></script>`;
/** Arquivos do S1 que as páginas passam a carregar: sem eles, --aplicar recusa (daria 404). */
export const REQUISITOS_S1 = Object.freeze(['js/portal/pre-pintura.js', 'js/portal/ui.js', 'css/portal.css']);
/** Ordem do modelo de §6.4 (cada chave aparece uma vez no bloco). */
const CHAVES = ['charset', 'pre-pintura', 'viewport', 'robots', 'color-scheme', 'theme-color', 'title', 'description',
  'icon', 'apple-touch-icon', 'preconnect-googleapis', 'preconnect-gstatic', 'fontes',
  'tokens', 'components', 'plataforma', 'portal'];

// ------------------------------------------------------------------
// HTML mínimo (o <head> das páginas é simples; nada de DOM completo)
// ------------------------------------------------------------------

const decodificar = (s) => String(s ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Atributos da tag de abertura. */
export function atributos(tag) {
  const abre = (tag.match(/^<[a-z][\w-]*\b([^>]*)>/i) || [])[1] || '';
  const at = {};
  for (const m of abre.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    at[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return at;
}

/** Caminho local sem query nem ./ ('css/plataforma.css?v=x' → 'css/plataforma.css'). */
const caminhoLocal = (url) => decodificar(url).split('#')[0].split('?')[0].replace(/^\.\//, '');
const versaoDe = (url) => (decodificar(url).match(/[?&]v=([^&#]+)/) || [])[1] || null;

/** Divide o conteúdo do <head> em nós (comentário, title/script/style/noscript, meta/link/base, texto). */
export function nosDoHead(txt) {
  const re = /<!--[\s\S]*?-->|<(title|script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>|<(?:meta|link|base)\b[^>]*>/gi;
  const nos = [];
  let ultimo = 0;
  let m;
  while ((m = re.exec(txt))) {
    const antes = txt.slice(ultimo, m.index);
    if (antes.trim()) nos.push({ raw: antes.trim(), chave: null, texto: true });
    nos.push({ raw: m[0], chave: classificar(m[0]) });
    ultimo = re.lastIndex;
  }
  const resto = txt.slice(ultimo);
  if (resto.trim()) nos.push({ raw: resto.trim(), chave: null, texto: true });
  return nos;
}

/** Chave do modelo de §6.4 que o nó representa, ou null (fica fora do bloco). */
export function classificar(raw) {
  if (raw.startsWith('<!--')) return null;
  const tag = (raw.match(/^<([a-z]+)/i) || [])[1]?.toLowerCase();
  const at = atributos(raw);
  if (tag === 'title') return 'title';
  if (tag === 'meta') {
    if ('charset' in at) return 'charset';
    const nome = (at.name || '').toLowerCase();
    if (['viewport', 'robots', 'color-scheme', 'theme-color', 'description'].includes(nome)) return nome;
    return null;
  }
  if (tag === 'link') {
    const rel = (at.rel || '').toLowerCase().split(/\s+/);
    const href = decodificar(at.href || '');
    if (rel.includes('apple-touch-icon')) return 'apple-touch-icon';
    if (rel.includes('icon')) return 'icon';
    if (rel.includes('preconnect') && /^https:\/\/fonts\.googleapis\.com\/?$/.test(href)) return 'preconnect-googleapis';
    if (rel.includes('preconnect') && /^https:\/\/fonts\.gstatic\.com\/?$/.test(href)) return 'preconnect-gstatic';
    if (href.startsWith('https://fonts.googleapis.com/css')) return 'fontes';
    if (rel.includes('stylesheet')) {
      const c = caminhoLocal(href);
      if (/(^|\/)assets\/css\/tokens\.css$/.test(c)) return 'tokens';
      if (/(^|\/)assets\/css\/components\.css$/.test(c)) return 'components';
      if (c === 'css/plataforma.css') return 'plataforma';
      if (c === 'css/portal.css') return 'portal';
    }
    return null;
  }
  if (tag === 'script' && caminhoLocal(at.src || '') === 'js/portal/pre-pintura.js') return 'pre-pintura';
  if (tag === 'noscript') {
    const dentro = raw.replace(/^<noscript\b[^>]*>|<\/noscript\s*>$/gi, '').trim();
    if (/^<link\b[^>]*>$/i.test(dentro) && classificar(dentro) === 'fontes') return 'fontes';
  }
  return null;
}

// ------------------------------------------------------------------
// Bloco do cabeçalho
// ------------------------------------------------------------------

/** Junta o que a página já tinha (title, description, ?v=) e registra o que sai. */
function absorver(nos, avisos) {
  const dados = { title: null, description: null, versoes: {}, robots: null, vistos: {} };
  for (const n of nos) {
    if (!n.chave) continue;
    dados.vistos[n.chave] = (dados.vistos[n.chave] || 0) + 1;
    const at = atributos(n.raw);
    if (n.chave === 'title') {
      const t = n.raw.replace(/^<title\b[^>]*>|<\/title\s*>$/gi, '').trim();
      if (dados.title !== null && t !== dados.title) avisos.push(`<title> repetido; mantido o primeiro: "${dados.title}"`);
      if (dados.title === null) dados.title = t;
    } else if (n.chave === 'description') {
      if (dados.description === null) dados.description = at.content ?? '';
    } else if (n.chave === 'robots') {
      dados.robots = at.content ?? '';
    } else if (['tokens', 'components', 'plataforma', 'portal'].includes(n.chave)) {
      const v = versaoDe(at.href);
      if (v && !dados.versoes[n.chave]) dados.versoes[n.chave] = v;
    } else if (n.chave === 'pre-pintura') {
      const v = versaoDe(at.src);
      if (v && !dados.versoes[n.chave]) dados.versoes[n.chave] = v;
    }
  }
  if (dados.robots !== null && dados.robots.replace(/\s+/g, '') !== 'noindex,nofollow') {
    avisos.push(`meta robots era "${dados.robots}"; o modelo de §6.4 fixa "noindex, nofollow"`);
  }
  for (const [k, n] of Object.entries(dados.vistos)) {
    if (n > 1 && k !== 'fontes') avisos.push(`${k} aparecia ${n} vezes no <head>; o bloco declara uma`);
  }
  return dados;
}

const attr = (s) => String(s).replace(/"/g, '&quot;');

/** Linhas do bloco (sem indentação), na ordem do modelo de §6.4. */
export function linhasDoBloco(dados) {
  const v = (k) => dados.versoes[k] || V_PADRAO[k];
  const L = [MARCA_INICIO, '<meta charset="UTF-8">',
    `<script src="js/portal/pre-pintura.js?v=${v('pre-pintura')}"></script>`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow">',
    '<meta name="color-scheme" content="dark">',
    '<meta name="theme-color" content="#0b0c0e">'];
  if (dados.title !== null) L.push(`<title>${dados.title}</title>`);
  if (dados.description !== null) L.push(`<meta name="description" content="${attr(dados.description)}">`);
  L.push(
    '<link rel="icon" type="image/png" sizes="64x64" href="../assets/images/favicon-dmc.png">',
    '<link rel="apple-touch-icon" href="../assets/images/apple-touch-icon.png">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="${FONTES_HREF}">`,
    `<link rel="stylesheet" href="../assets/css/tokens.css?v=${v('tokens')}">`,
    `<link rel="stylesheet" href="../assets/css/components.css?v=${v('components')}">`,
    `<link rel="stylesheet" href="css/plataforma.css?v=${v('plataforma')}">`,
    `<link rel="stylesheet" href="css/portal.css?v=${v('portal')}">`,
    MARCA_FIM,
  );
  return L;
}

function descreverTroca(nos, dados) {
  const partes = [];
  const novos = ['tokens', 'components', 'portal', 'pre-pintura', 'color-scheme', 'theme-color', 'apple-touch-icon']
    .filter((k) => !dados.vistos[k]);
  if (novos.length) partes.push(`passa a ter ${novos.join(', ')}`);
  const fontesAntigas = nos.filter((n) => n.chave === 'fontes' && /DM\+Sans|Raleway|Playfair|Poppins/i.test(decodificar(n.raw)));
  if (fontesAntigas.length) partes.push('fontes DM Sans/Raleway → Hanken Grotesk/Newsreader');
  const icone = nos.find((n) => n.chave === 'icon');
  if (icone && !/favicon-dmc\.png/.test(icone.raw)) partes.push(`favicon ${path.basename(caminhoLocal(atributos(icone.raw).href || ''))} → favicon-dmc.png`);
  return partes.join('; ');
}

// ------------------------------------------------------------------
// Transformação de uma página
// ------------------------------------------------------------------

/**
 * Transforma o HTML de uma página. Puro: não lê nem grava disco.
 * @returns {{ saida: string, mudou: boolean, acoes: string[], avisos: string[], erros: string[] }}
 */
export function transformar(original) {
  const acoes = [];
  const avisos = [];
  const erros = [];
  const crlf = original.includes('\r\n');
  let html = crlf ? original.replace(/\r\n/g, '\n') : original;

  const abre = html.match(/<head\b[^>]*>/i);
  const fecha = html.match(/<\/head\s*>/i);
  if (!abre || !fecha || fecha.index < abre.index) {
    return { saida: original, mudou: false, acoes, avisos, erros: ['sem <head>…</head>'] };
  }
  const iniHead = abre.index + abre[0].length;
  const fimHead = fecha.index;
  const head = html.slice(iniHead, fimHead);
  const corpo = html.slice(fimHead);
  const nIni = (head.match(RE_INICIO) || []).length;
  const nFim = (head.match(RE_FIM) || []).length;
  if ((corpo.match(RE_INICIO) || []).length || (corpo.match(RE_FIM) || []).length) {
    erros.push('marcador @dmc-cabecalho fora do <head>');
  }
  if (nIni !== nFim || nIni > 1) erros.push(`marcadores @dmc-cabecalho sem par ou repetidos (início ${nIni}, fim ${nFim})`);
  if (erros.length) return { saida: original, mudou: false, acoes, avisos, erros };

  let novoHead;
  if (nIni === 0) {
    // Primeira aplicação: o bloco absorve o que o modelo declara; o resto fica depois do fim, na ordem.
    const nos = nosDoHead(head);
    const dados = absorver(nos, avisos);
    if (dados.title === null) avisos.push('página sem <title>');
    const indent = (head.match(/\n([ \t]*)\S/) || [])[1] ?? '  ';
    const fechaIndent = (head.match(/\n([ \t]*)$/) || [])[1] ?? '';
    const fora = nos.filter((n) => !n.chave);
    for (const n of fora) {
      if (n.raw.startsWith('<!--')) avisos.push(`comentário do <head> mantido fora do bloco; conferir se continua verdadeiro: ${n.raw.replace(/\s+/g, ' ').slice(0, 110)}`);
      else if (n.texto) avisos.push(`texto solto no <head> mantido: ${n.raw.slice(0, 80)}`);
      else if (/^<script\b/i.test(n.raw)) avisos.push(`<script> no <head> mantido fora do bloco (o modelo põe scripts no fim do <body>): ${n.raw.slice(0, 80)}`);
    }
    const linhas = [...linhasDoBloco(dados), ...fora.map((n) => n.raw)];
    novoHead = `\n${linhas.map((l) => indent + l).join('\n')}\n${fechaIndent}`;
    const troca = descreverTroca(nos, dados);
    acoes.push(`<head>: bloco @dmc-cabecalho criado${troca ? ` (${troca})` : ''}${fora.length ? `; ${fora.length} item(ns) da página mantido(s) depois do bloco` : ''}`);
  } else {
    // Já marcado: troca só o trecho entre os marcadores; o que está fora fica intocado.
    const mi = RE_INICIO.exec(head); RE_INICIO.lastIndex = 0;
    const mf = RE_FIM.exec(head); RE_FIM.lastIndex = 0;
    if (mf.index < mi.index) {
      return { saida: original, mudou: false, acoes, avisos, erros: ['marcador de fim antes do de início'] };
    }
    const dentro = head.slice(mi.index + mi[0].length, mf.index);
    const nos = nosDoHead(dentro);
    const dados = absorver(nos, avisos);
    const indent = (head.slice(0, mi.index).match(/([ \t]*)$/) || [])[1] ?? '';
    const estranhos = nos.filter((n) => !n.chave);
    for (const n of estranhos) avisos.push(`item que não é do modelo estava dentro do bloco; movido para depois do fim: ${n.raw.slice(0, 80)}`);
    const fora = nosDoHead(head.slice(0, mi.index) + head.slice(mf.index + mf[0].length)).filter((n) => n.chave);
    for (const n of fora) avisos.push(`fora do bloco há "${n.chave}", que o bloco já declara; revisar à mão: ${n.raw.slice(0, 80)}`);
    const linhas = [...linhasDoBloco(dados), ...estranhos.map((n) => n.raw)];
    const bloco = linhas.map((l, i) => (i === 0 ? l : indent + l)).join('\n');
    novoHead = head.slice(0, mi.index) + bloco + head.slice(mf.index + mf[0].length);
    if (novoHead !== head) acoes.push('<head>: bloco @dmc-cabecalho atualizado');
  }

  let novoCorpo = corpo;

  // <body>: sai a classe bg-grid
  novoCorpo = novoCorpo.replace(/<body\b[^>]*>/i, (tag) => tag.replace(/(\s)class\s*=\s*(["'])([^"']*)\2/i, (m, esp, q, classes) => {
    const lista = classes.split(/\s+/).filter(Boolean);
    if (!lista.includes('bg-grid')) return m;
    acoes.push('<body>: classe bg-grid removida');
    const resto = lista.filter((c) => c !== 'bg-grid');
    return resto.length ? `${esp}class=${q}${resto.join(' ')}${q}` : '';
  }));

  // <div class="glow-corner"> vazio (a linha inteira, quando está sozinho nela)
  const temGlow = (classes) => classes.split(/\s+/).some((c) => c === 'glow-corner' || c.startsWith('glow-corner--'));
  let glows = 0;
  // (as linhas em branco que seguiam o div viram uma só)
  novoCorpo = novoCorpo.replace(/^[ \t]*<div\b([^>]*)>\s*<\/div>[ \t]*\n((?:[ \t]*\n)*)/gm, (m, a, brancas) => {
    const c = (a.match(/\sclass\s*=\s*(["'])([^"']*)\1/i) || [])[2];
    if (c && temGlow(c)) { glows += 1; return brancas ? '\n' : ''; }
    return m;
  });
  novoCorpo = novoCorpo.replace(/<div\b([^>]*)>\s*<\/div>/g, (m, a) => {
    const c = (a.match(/\sclass\s*=\s*(["'])([^"']*)\1/i) || [])[2];
    if (c && temGlow(c)) { glows += 1; return ''; }
    return m;
  });
  if (glows) acoes.push(`<div class="glow-corner"> removido (${glows})`);

  // .gradient-text → <em> (só <span> sem tags dentro; o resto vira aviso)
  let gradientes = 0;
  novoCorpo = novoCorpo.replace(/<span\b([^>]*)>([^<]*)<\/span>/g, (m, a, dentro) => {
    const cm = a.match(/(\s)class\s*=\s*(["'])([^"']*)\2/i);
    if (!cm) return m;
    const lista = cm[3].split(/\s+/).filter(Boolean);
    if (!lista.includes('gradient-text')) return m;
    gradientes += 1;
    const resto = lista.filter((c) => c !== 'gradient-text');
    const outros = a.replace(cm[0], resto.length ? `${cm[1]}class=${cm[2]}${resto.join(' ')}${cm[2]}` : '');
    return `<em${outros}>${dentro}</em>`;
  });
  if (gradientes) acoes.push(`.gradient-text → <em> (${gradientes})`);

  // ui.js antes de shell.js
  const temUi = new RegExp(`<script\\b[^>]*\\bsrc\\s*=\\s*["']${UI_JS.replace(/[./]/g, '\\$&')}(\\?[^"']*)?["']`, 'i').test(novoCorpo);
  if (!temUi) {
    const linhaDe = (arquivo) => new RegExp(`^([ \\t]*)<script\\b[^>]*\\bsrc\\s*=\\s*["']${arquivo.replace(/[./]/g, '\\$&')}(\\?[^"']*)?["'][^>]*>\\s*</script>[ \\t]*$`, 'm');
    let m;
    if ((m = novoCorpo.match(linhaDe('js/shell.js')))) {
      novoCorpo = `${novoCorpo.slice(0, m.index)}${m[1]}${UI_TAG}\n${novoCorpo.slice(m.index)}`;
      acoes.push('ui.js inserido antes de js/shell.js');
    } else if ((m = novoCorpo.match(linhaDe('js/app.js'))) || (m = novoCorpo.match(linhaDe('js/api-client.js')))) {
      const fim = m.index + m[0].length;
      novoCorpo = `${novoCorpo.slice(0, fim)}\n${m[1]}${UI_TAG}${novoCorpo.slice(fim)}`;
      acoes.push(`ui.js inserido depois de ${/app\.js/.test(m[0]) ? 'js/app.js' : 'js/api-client.js'} (página sem js/shell.js)`);
    } else {
      const fb = novoCorpo.match(/^([ \t]*)<\/body\s*>/im);
      if (fb) {
        novoCorpo = `${novoCorpo.slice(0, fb.index)}${fb[1]}  ${UI_TAG}\n${novoCorpo.slice(fb.index)}`;
        acoes.push('ui.js inserido antes de </body> (página sem scripts do núcleo)');
      } else {
        erros.push('sem </body> para inserir ui.js');
      }
    }
  }

  html = html.slice(0, iniHead) + novoHead + novoCorpo;
  const verif = conferirResultado(html);
  erros.push(...verif.erros);
  avisos.push(...verif.avisos);
  const saida = crlf ? html.replace(/\n/g, '\r\n') : html;
  return { saida, mudou: saida !== original, acoes, avisos, erros };
}

/** Pós-condições do modelo de §6.4 / S2 sobre o resultado. */
export function conferirResultado(html) {
  const erros = [];
  const avisos = [];
  const head = html.slice(0, (html.match(/<\/head\s*>/i) || { index: html.length }).index);
  const contar = (re, txt = html) => (txt.match(re) || []).length;
  if (contar(/<meta\b[^>]*\bname\s*=\s*["']color-scheme["']/gi, head) !== 1) erros.push('o <head> precisa de exatamente um meta color-scheme');
  if (contar(/<meta\b[^>]*\bname\s*=\s*["']theme-color["']/gi, head) !== 1) erros.push('o <head> precisa de exatamente um meta theme-color');
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => atributos(m[0]).src || '(inline)');
  if (!scripts.length || caminhoLocal(scripts[0]) !== 'js/portal/pre-pintura.js') erros.push('pre-pintura.js precisa ser o primeiro <script> da página');
  const iUi = scripts.findIndex((s) => caminhoLocal(s) === UI_JS);
  const iShell = scripts.findIndex((s) => caminhoLocal(s) === 'js/shell.js');
  if (scripts.filter((s) => caminhoLocal(s) === UI_JS).length !== 1) erros.push('ui.js precisa aparecer exatamente uma vez');
  if (iShell >= 0 && iUi > iShell) erros.push('ui.js precisa vir antes de js/shell.js');
  const css = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => atributos(m[0])).filter((a) => /stylesheet/i.test(a.rel || ''))
    .map((a) => caminhoLocal(a.href || ''));
  const ordem = ['tokens.css', 'components.css', 'css/plataforma.css', 'css/portal.css']
    .map((f) => css.findIndex((c) => c === f || c.endsWith(`/${f}`)));
  if (ordem.some((i) => i < 0) || ordem.some((i, k) => k && i < ordem[k - 1])) erros.push('cascata fora da ordem tokens → components → plataforma → portal');
  for (const [re, o] of [[/\bbg-grid\b/, 'bg-grid'], [/\bglow-corner\b/, 'glow-corner'], [/\bgradient-text\b/, 'gradient-text'],
    [/DM\+Sans|Raleway|Playfair|Poppins/, 'fonte antiga'], [/LOGO_RINOCERONTE/, 'LOGO_RINOCERONTE']]) {
    if (re.test(html)) avisos.push(`ainda há ${o} na página (fora do alcance da ferramenta; dono da página corrige)`);
  }
  if (/RINO_logo\.png/.test(html)) avisos.push('RINO_logo.png no corpo (UX §2.1 item 3: sai da plataforma; troca do dono da página)');
  if (!/<html\b[^>]*\blang\s*=\s*["']pt-BR["']/i.test(html)) avisos.push('<html> sem lang="pt-BR"');
  return { erros, avisos };
}

// ------------------------------------------------------------------
// Diff unificado (sem dependências; páginas têm poucas centenas de linhas)
// ------------------------------------------------------------------

export function diffUnificado(a, b, rotulo, contexto = 2) {
  const A = a.split('\n');
  const B = b.split('\n');
  const n = A.length;
  const m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { ops.push({ t: ' ', s: A[i], i, j }); i += 1; j += 1; }
    else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) { ops.push({ t: '-', s: A[i], i, j }); i += 1; }
    else { ops.push({ t: '+', s: B[j], i, j }); j += 1; }
  }
  const mudancas = ops.map((o, k) => (o.t === ' ' ? -1 : k)).filter((k) => k >= 0);
  if (!mudancas.length) return '';
  const saida = [`--- a/${rotulo}`, `+++ b/${rotulo}`];
  let k = 0;
  while (k < mudancas.length) {
    let ini = Math.max(0, mudancas[k] - contexto);
    let fim = Math.min(ops.length - 1, mudancas[k] + contexto);
    while (k + 1 < mudancas.length && mudancas[k + 1] - contexto <= fim + 1) {
      k += 1;
      fim = Math.min(ops.length - 1, mudancas[k] + contexto);
    }
    const trecho = ops.slice(ini, fim + 1);
    const velhas = trecho.filter((o) => o.t !== '+').length;
    const novas = trecho.filter((o) => o.t !== '-').length;
    const ia = trecho[0].i + 1;
    const ib = trecho[0].j + 1;
    saida.push(`@@ -${velhas ? ia : ia - 1},${velhas} +${novas ? ib : ib - 1},${novas} @@`);
    for (const o of trecho) saida.push(`${o.t}${o.s}`);
    k += 1;
    ini = fim;
  }
  return saida.join('\n');
}

// ------------------------------------------------------------------
// Linha de comando
// ------------------------------------------------------------------

function principal(argv) {
  const args = argv.slice(2);
  const opc = { aplicar: false, verificar: false, forcar: false, resumo: false, raiz: RAIZ_EAD, paginas: [] };
  for (let k = 0; k < args.length; k += 1) {
    const a = args[k];
    if (a === '--aplicar') opc.aplicar = true;
    else if (a === '--verificar') opc.verificar = true;
    else if (a === '--forcar') opc.forcar = true;
    else if (a === '--resumo') opc.resumo = true;
    else if (a === '--raiz') { opc.raiz = path.resolve(args[k + 1] || ''); k += 1; }
    else if (a === '--dry-run') { /* padrão */ }
    else if (a.startsWith('--')) { console.error(`opção desconhecida: ${a}`); return 2; }
    else opc.paginas.push(a);
  }
  if (opc.aplicar && opc.verificar) { console.error('use --aplicar OU --verificar'); return 2; }
  if (!fs.existsSync(opc.raiz) || !fs.statSync(opc.raiz).isDirectory()) { console.error(`raiz inexistente: ${opc.raiz}`); return 2; }

  const modo = opc.aplicar ? 'APLICAR (grava)' : opc.verificar ? 'VERIFICAR (não grava)' : 'DRY-RUN (não grava nada)';
  console.log(`cabecalho-ead · ${modo}`);
  console.log(`  raiz: ${opc.raiz}`);

  const faltamS1 = REQUISITOS_S1.filter((f) => !fs.existsSync(path.join(opc.raiz, f)));
  if (faltamS1.length) {
    const msg = `S1 incompleto, ainda não existem: ${faltamS1.join(', ')} (as páginas dariam 404 neles)`;
    if (opc.aplicar && !opc.forcar) { console.error(`  RECUSADO: ${msg}. Use --forcar só em cópia de teste.`); return 2; }
    console.log(`  aviso: ${msg}`);
  }

  let codigo = 0;
  const explicitas = opc.paginas.length > 0;
  let lista;
  if (explicitas) {
    lista = opc.paginas.map((p) => {
      const abs = path.resolve(opc.raiz, p);
      return path.relative(opc.raiz, abs).split(path.sep).join('/');
    });
  } else {
    lista = fs.readdirSync(opc.raiz).filter((f) => f.endsWith('.html')).sort();
  }

  const totais = { mudaria: 0, igual: 0, recusada: 0, erro: 0 };
  for (const rel of lista) {
    const dono = donoDe(rel);
    if (PAGINAS_2D.includes(rel) || dono === DONO_2D) {
      totais.recusada += 1;
      console.log(`\n== ${rel} · RECUSADA: página da sessão 2d (proibida a todas as fatias, §3.4); nunca é reescrita`);
      if (explicitas) codigo = 2;
      continue;
    }
    if (rel.includes('/') || rel.startsWith('..') || !rel.endsWith('.html')) {
      totais.erro += 1;
      console.log(`\n== ${rel} · ERRO: só páginas .html na raiz da plataforma-ead`);
      codigo = 2;
      continue;
    }
    const arq = path.join(opc.raiz, rel);
    if (!fs.existsSync(arq)) {
      totais.erro += 1;
      console.log(`\n== ${rel} · ERRO: arquivo não existe`);
      codigo = 2;
      continue;
    }
    const original = fs.readFileSync(arq, 'utf8');
    const r = transformar(original);
    if (!r.erros.length && r.mudou) {
      const segunda = transformar(r.saida);
      if (segunda.mudou || segunda.erros.length) r.erros.push('não idempotente: uma segunda passada mudaria o resultado (defeito da ferramenta)');
    }
    const rotuloDono = dono ? ` (${dono})` : ' (sem dono em POSSE)';
    if (r.erros.length) {
      totais.erro += 1;
      codigo = 2;
      console.log(`\n== ${rel}${rotuloDono} · ERRO (nada gravado)`);
      for (const e of r.erros) console.log(`   erro: ${e}`);
      continue;
    }
    if (!r.mudou) {
      totais.igual += 1;
      console.log(`\n== ${rel}${rotuloDono} · sem mudança`);
      for (const a of r.avisos) console.log(`   aviso: ${a}`);
      continue;
    }
    totais.mudaria += 1;
    console.log(`\n== ${rel}${rotuloDono} · ${opc.aplicar ? 'GRAVADA' : 'mudaria'}`);
    for (const a of r.acoes) console.log(`   - ${a}`);
    for (const a of r.avisos) console.log(`   aviso: ${a}`);
    if (!opc.resumo) {
      const d = diffUnificado(original.replace(/\r\n/g, '\n'), r.saida.replace(/\r\n/g, '\n'), rel);
      console.log(d.split('\n').map((l) => `   ${l}`).join('\n'));
    }
    if (opc.aplicar) fs.writeFileSync(arq, r.saida);
    if (opc.verificar && codigo === 0) codigo = 1;
  }

  console.log(`\nresumo: ${lista.length} página(s) · ${opc.aplicar ? 'gravadas' : 'mudariam'} ${totais.mudaria} · sem mudança ${totais.igual} · recusadas (2d) ${totais.recusada} · erro ${totais.erro}`);
  if (!opc.aplicar) console.log(opc.verificar ? 'nada foi gravado (verificar).' : 'nada foi gravado (dry-run). Gravar: --aplicar (só a sessão principal, no S2, com o S1 no disco).');
  return codigo;
}

const executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDireto) process.exit(principal(process.argv));
