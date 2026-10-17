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
