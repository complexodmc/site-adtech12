// Utilitários compartilhados da suíte e2e. Arquivos com "_" não são specs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PUBLICO = path.join(RAIZ, 'complexodmc.com.br');
export const ORIGEM_PROD = 'https://www.complexodmc.com.br';
export const VIEWPORTS = [320, 375, 390, 768, 1024, 1440, 1920];

// Páginas = URLs do sitemap.xml real, convertidas para caminho local.
export const PAGINAS = (() => {
  const xml = fs.readFileSync(path.join(PUBLICO, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(([, loc]) => {
    const u = new URL(loc);
    const caminho = u.pathname;
    const nome = caminho === '/' ? 'home' : caminho.replace(/^\/(pages|solucoes)\//, '').replace(/\.html$/, '');
    return { loc, caminho, nome };
  });
})();

// Ruído externo tolerado — cada entrada precisa de justificativa.
export const RUIDO_EXTERNO = [
  // video.js tenta a capa maxresdefault e cai para hqdefault no `error` (fallback previsto);
  // vídeos sem capa HD devolvem 404 no i.ytimg.com. Não é recurso do site.
  { url: /^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/maxresdefault\.jpg/, motivo: 'fallback de capa do YouTube (video.js)' },
  // Rede bloqueada/offline: só domínios do YouTube/Google, nunca a própria origem.
  { url: /^https:\/\/([a-z0-9-]+\.)*(youtube(-nocookie)?\.com|ytimg\.com|googlevideo\.com|doubleclick\.net|google\.com|gstatic\.com)\//, falha: /ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|BLOCKED_BY_CLIENT|CONNECTION_REFUSED|ABORTED)/, motivo: 'YouTube/Google bloqueado ou offline' }
];

export function ehRuido(url, textoFalha = '') {
  return RUIDO_EXTERNO.find((r) => r.url.test(url) && (!r.falha || r.falha.test(textoFalha))) || null;
}

// Mensagens de console vindas de iframes de terceiros (YouTube) não são do site.
export function ehConsoleDeTerceiro(msg, origemSite) {
  const loc = msg.location && msg.location();
  const url = (loc && loc.url) || '';
  return !!url && !url.startsWith(origemSite) && /youtube(-nocookie)?\.com|ytimg\.com|googlevideo\.com|doubleclick\.net/.test(url);
}

export function causa(descricao) {
  test.info().annotations.push({ type: 'causa', description: descricao });
}
export function pagina(caminho) {
  test.info().annotations.push({ type: 'pagina', description: caminho });
}
export async function anexar(nome, dados) {
  await test.info().attach(nome, { body: JSON.stringify(dados, null, 2), contentType: 'application/json' });
}

export async function abrir(page, caminho, { esperar = 'load' } = {}) {
  const resp = await page.goto(caminho, { waitUntil: esperar, timeout: 45_000 });
  return resp;
}

// Rola até o fim em passos (dispara lazy-load e revelações) e volta ao topo.
export async function rolarTudo(page) {
  await page.evaluate(async () => {
    const passo = Math.max(300, Math.floor(window.innerHeight * 0.9));
    for (let y = 0; y < document.documentElement.scrollHeight; y += passo) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 250));
    window.scrollTo(0, 0);
  });
}

// ---------------------------------------------------------------------------
// Nova home (docs/dmc/HOME_REDESIGN.md §2–§3, §6; home-redesign/contratos-qa.md)
// ---------------------------------------------------------------------------

// Ordem obrigatória dos ids de <section> na home (§1.3). Desde 2026-10-25 a home não tem mais
// #publicacoes, #treinamentos nem #newsletter; no lugar entram #como-funciona (antes do mapa) e #leituras (depois do
// mapa, antes do vídeo). `#video` precede `#contact`.
export const SECOES_HOME = ['hero', 'conheca', 'features', 'porque', 'verticais', 'como-funciona', 'presenca', 'leituras', 'video', 'contact'];

// Altura padrão por largura (mesma tabela de viewports.spec.js).
export const ALTURA_VIEWPORT = { 320: 640, 375: 812, 390: 844, 768: 1024, 1024: 768, 1440: 900, 1920: 1080 };

// Seis eixos — nome oficial, slug de acento e página-âncora (fatos.md §1; sem alteração).
export const EIXOS = [
  { n: 1, slug: 'patrimonial', href: 'pages/planejamento-sucessorio.html', nome: /Planejamento Patrimonial e Sucess[óo]rio/i },
  { n: 2, slug: 'fiscal', href: 'pages/planejamento-tributario.html', nome: /Tribut[áa]rio, Fiscal e Corporativo/i },
  { n: 3, slug: 'imobiliario', href: 'pages/consultoria-imobiliaria.html', nome: /Direito Notarial e Imobili[áa]rio/i },
  { n: 4, slug: 'auditoria', href: 'pages/contabilidade.html', nome: /Auditoria Empresarial e Cont[áa]bil/i },
  { n: 5, slug: 'ativos', href: 'pages/recuperacao-ativos.html', nome: /Recupera[çc][ãa]o de Ativos/i },
  { n: 6, slug: 'trabalhista', href: 'solucoes/consultoria-trabalhista/ciclo-fechado.html', nome: /Consultoria Trabalhista/i }
];

// Catálogo recolhido (<details class="eixos-catalogo">): 21 links (5+2+5+1+1+7).
// Nunca: planejamento-sucessorio-empresarial (301) nem "#contact" como solução.
export const CATALOGO_EIXOS = [
  'pages/planejamento-sucessorio.html', 'pages/holding-patrimonial.html', 'pages/blindagem-patrimonial.html', 'pages/pronto-patrimonio.html', 'pages/sucessao-testamentaria.html',
  'pages/planejamento-tributario.html', 'pages/compliance-governanca.html',
  'pages/consultoria-imobiliaria.html', 'pages/juridico-imobiliario.html', 'pages/juridico-vendas.html', 'pages/registro-imobiliario.html', 'pages/atos-notariais.html',
  'pages/contabilidade.html',
  'pages/recuperacao-ativos.html',
  'solucoes/consultoria-trabalhista/ciclo-fechado.html', 'solucoes/consultoria-trabalhista/blindagem-contratual.html', 'solucoes/consultoria-trabalhista/conformidade-psicossocial.html',
  'solucoes/consultoria-trabalhista/decisao-assistida.html', 'solucoes/consultoria-trabalhista/camara-de-acordos.html', 'solucoes/consultoria-trabalhista/quitacao-anual.html', 'solucoes/consultoria-trabalhista/defesa-empresarial.html'
];

// Conformidade (Provimento OAB 205/2021; §6 da especificação): 0 ocorrências no texto visível.
export const RE_CONFORMIDADE = /\d+\s*%|garant|\d+\s*(clientes|anos de|pr[êe]mios|R\$)|\bl[íi]der\b|melhor do|ranking|depoimento/i;
// Atos que a lei reserva a profissionais habilitados (subconjunto da regra B de
// docs/dmc/audit/tools/scan-conformidade.cjs). Se a seção cita, a mesma seção atribui.
export const RE_ATO_PRIVATIVO = /\b(penhora\w*|bloqueios?|audi[êe]ncias?|contesta[çc][ãa]o|ajuiz\w*|embargos|liminar|peti[çc][ãa]o|reclamat[óo]rias?|defesa (empresarial|judicial|da empresa)|execu[çc][ãa]o (de t[íi]tulos?|judicial|fiscal|trabalhista)|escrituras? (p[úu]blica|lavrada)|lavra\w*|registro de im[óo]veis|matr[íi]cula|invent[áa]rio|usucapi[ãa]o|retifica[çc][ãa]o de [áa]rea)\b/i;
export const RE_ATRIBUICAO = /parceir\w+ habilitad|cart[óo]rios? conveniad|advogad|habilitad|conveniad/i;
// Marcas de terceiros que não podem aparecer como chancela na home (texto, alt, aria-label, logos).
export const RE_MARCAS_TERCEIROS = /Google Ads|Meta Ads|Facebook|Instagram|LinkedIn|TikTok|Forbes|Revista Exame|Valor Econ[ôo]mico|Estad[ãa]o|Folha de S\.?\s?Paulo/i;

// Pergunta ao servidor de QA (tests/server/serve.mjs) se há mongod descartável.
let _estadoServidor = null;
export async function estadoServidor(request) {
  if (!_estadoServidor) _estadoServidor = await (await request.get('/__qa/estado')).json();
  return _estadoServidor;
}

// Caminho local (sem origem) de um href relativo à home, já normalizado como o sitemap
// (as 7 trabalhistas aparecem sem `.html` no sitemap, servidas por rewrite).
export function caminhoNoSitemap(href) {
  const p = new URL(href, ORIGEM_PROD + '/').pathname;
  return p.startsWith('/solucoes/') ? p.replace(/\.html$/, '') : p;
}
export function estaNoSitemap(href) {
  const alvo = caminhoNoSitemap(href);
  return PAGINAS.some((p) => p.caminho === alvo);
}

// Contador de requestAnimationFrame: instalar ANTES de abrir a página.
// window.__raf = { total } acumula desde o carregamento; contarRaf() mede uma janela.
export async function instalarContadorRaf(page) {
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame.bind(window);
    window.__raf = { total: 0 };
    window.requestAnimationFrame = (cb) => { window.__raf.total++; return original(cb); };
  });
}
// Conta chamadas de rAF numa janela de `ms` (descarta o que veio antes).
export async function contarRaf(page, ms = 1000) {
  return page.evaluate(async (janela) => {
    const inicio = window.__raf ? window.__raf.total : 0;
    await new Promise((r) => setTimeout(r, janela));
    return window.__raf ? window.__raf.total - inicio : -1;
  }, ms);
}

// Texto visível (innerText ignora display:none/visibility:hidden) + alt + aria-label de um seletor.
export async function textoVisivel(page, seletor = 'main') {
  return page.evaluate((sel) => {
    const raiz = document.querySelector(sel);
    if (!raiz) return null;
    const extras = [...raiz.querySelectorAll('[alt], [aria-label], [title]')]
      .map((el) => [el.getAttribute('alt'), el.getAttribute('aria-label'), el.getAttribute('title')].filter(Boolean).join(' '));
    return (raiz.innerText + '\n' + extras.join('\n')).replace(/\s+/g, ' ').trim();
  }, seletor);
}

// Foco visível: outline ou box-shadow não nulos no elemento ativo (critério de navegacao.spec.js).
export async function focoVisivel(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { id: null, visivel: false };
    const cs = getComputedStyle(el);
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const sombra = cs.boxShadow && cs.boxShadow !== 'none';
    return { id: el.id || null, tag: el.tagName.toLowerCase(), href: el.getAttribute('href'), visivel: outline || sombra, outline: cs.outline, boxShadow: cs.boxShadow };
  });
}

// Overflow horizontal por seção: devolve as seções cujo retângulo (ou de algum filho
// não cortado por overflow-x) ultrapassa a largura da janela.
export async function overflowPorSecao(page) {
  return page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const cortaX = (el, teto) => {
      for (let a = el.parentElement; a && a !== teto.parentElement && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== 'visible') return true;
      }
      return false;
    };
    const resultado = [];
    for (const sec of document.querySelectorAll('main section[id]')) {
      const r = sec.getBoundingClientRect();
      const culpados = [];
      if (r.right > cw + 1 || r.left < -1) culpados.push({ el: 'section#' + sec.id, left: Math.round(r.left), right: Math.round(r.right) });
      for (const el of sec.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        const cs = getComputedStyle(el);
        // Posicionado e inteiro à esquerda da janela (padrão "fora da tela" do honeypot .form-hp, que o contrato da
        // newsletter — contratos-qa.md §3.1 — exige): em LTR não gera rolagem horizontal; o gate real continua sendo
        // scrollWidth − clientWidth, conferido no spec.
        const escondidoEsq = b.right <= 0 && (cs.position === 'absolute' || cs.position === 'fixed');
        if ((b.right > cw + 1 || b.left < -1) && !escondidoEsq && !cortaX(el, sec) && cs.position !== 'fixed') {
          let s = el.tagName.toLowerCase();
          if (el.id) s += '#' + el.id; else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.');
          culpados.push({ el: s, left: Math.round(b.left), right: Math.round(b.right) });
        }
        if (culpados.length >= 5) break;
      }
      resultado.push({ secao: sec.id, right: Math.round(r.right), culpados });
    }
    return { clientWidth: cw, scrollWidth: document.documentElement.scrollWidth, secoes: resultado };
  });
}
