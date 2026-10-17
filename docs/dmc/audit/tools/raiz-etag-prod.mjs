// Rodada extra: compara em PRODUÇÃO a cópia da RAIZ (/pages, /assets, /index.html)
// com a cópia aninhada (/complexodmc.com.br/...) via HEAD: status, ETag,
// Content-Length, Last-Modified, x-vercel-cache/id. Prova empírica de
// "filesystem vence o rewrite /(.*)": paths que só existem na raiz devolvem 200,
// paths ausentes na raiz caem no rewrite e trazem o ETag da cópia aninhada.
// Uso: node raiz-etag-prod.mjs [rotulo]   (rotulo = "antes-deploy" | "depois-deploy")
import fs from 'node:fs';
const BASE = 'https://www.complexodmc.com.br';
const OUTDIR = '/Users/dmchagas/Site_Complexo_DMC/docs/dmc/audit/2026-10-17/raiz-repositorio';
fs.mkdirSync(OUTDIR, { recursive: true });
const rotulo = process.argv[2] || 'antes-deploy';
const enc = p => p.split('/').map(s => encodeURIComponent(s).replace(/%2F/g, '/')).join('/');
// [grupo, path limpo (raiz), path aninhado equivalente]
const pares = [
  ['index', '/index.html', '/complexodmc.com.br/index.html'],
  ['index', '/', '/complexodmc.com.br/index.html'],
  ['pages-raiz', '/pages/Sobre.html', '/complexodmc.com.br/pages/Sobre.html'],
  ['pages-raiz', '/pages/Apresentação.html', '/complexodmc.com.br/pages/Apresentação.html'],
  ['pages-raiz', '/pages/Jurídico Vendas.html', '/complexodmc.com.br/pages/Jurídico Vendas.html'],
  ['pages-raiz', '/pages/Jurídico Imobiliário.html', '/complexodmc.com.br/pages/Jurídico Imobiliário.html'],
  ['pages-raiz', '/pages/Consultoria Imobiiliária.html', '/complexodmc.com.br/pages/Consultoria Imobiiliária.html'],
  ['css', '/pages/Site_Produtos/shared.css', '/complexodmc.com.br/pages/Site_Produtos/shared.css'],
  ['css', '/pages/css/shared.css', '/complexodmc.com.br/pages/css/shared.css'],
  ['assets-duplicados', '/assets/images/RINO_logo.png', '/complexodmc.com.br/assets/images/RINO_logo.png'],
  ['assets-duplicados', '/assets/images/LOGO_RINOCERONTE.png', '/complexodmc.com.br/assets/images/LOGO_RINOCERONTE.png'],
  ['assets-duplicados', '/assets/videos/rino-video-transparent.mp4', '/complexodmc.com.br/assets/videos/rino-video-transparent.mp4'],
  ['assets-so-aninhado', '/assets/images/hero-poster.jpg', '/complexodmc.com.br/assets/images/hero-poster.jpg'],
  ['assets-so-aninhado', '/assets/images/favicon.png', '/complexodmc.com.br/assets/images/favicon.png'],
  ['assets-so-aninhado', '/assets/js/navbar.js', '/complexodmc.com.br/assets/js/navbar.js'],
  ['assets-inexistente', '/assets/images/daniel-mathias-chagas.jpg', '/complexodmc.com.br/assets/images/daniel-mathias-chagas.jpg'],
  ['pages-aninhado', '/pages/juridico-vendas.html', '/complexodmc.com.br/pages/juridico-vendas.html'],
  ['ead', '/plataforma-ead/login.html', '/complexodmc.com.br/plataforma-ead/login.html'],
];
async function head(p) {
  const url = BASE + enc(p);
  try {
    let r = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    if (r.status === 405) r = await fetch(url, { method: 'GET', redirect: 'manual' });
    const h = Object.fromEntries(['etag', 'content-length', 'content-type', 'last-modified', 'x-vercel-cache', 'x-vercel-id', 'location', 'cache-control'].map(k => [k, r.headers.get(k)]));
    return { url, status: r.status, ...h };
  } catch (e) { return { url, status: 'ERR', erro: String(e.message || e) }; }
}
const res = [];
for (const [grupo, raiz, aninhado] of pares) {
  const a = await head(raiz); const b = await head(aninhado);
  const mesmoEtag = a.etag && b.etag && a.etag === b.etag;
  res.push({ grupo, raiz: a, aninhado: b, mesmoEtag, mesmoTamanho: a['content-length'] === b['content-length'] });
  console.log(`[${grupo}] ${raiz}\n   raiz    : ${a.status} etag=${a.etag} len=${a['content-length']} lm=${a['last-modified']} cache=${a['x-vercel-cache']}\n   aninhado: ${b.status} etag=${b.etag} len=${b['content-length']} lm=${b['last-modified']} cache=${b['x-vercel-cache']}\n   mesmoEtag=${mesmoEtag}`);
}
const out = { geradoEm: new Date().toISOString(), rotulo, base: BASE, resultados: res };
fs.writeFileSync(`${OUTDIR}/etag-prod-${rotulo}.json`, JSON.stringify(out, null, 2));
console.log('salvo', `${OUTDIR}/etag-prod-${rotulo}.json`);
