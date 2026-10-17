// Compara dois snapshots de raiz-etag-prod.mjs (ex.: antes-deploy × depois-deploy).
// Para cada par (path limpo da raiz × path aninhado) classifica:
//   OK-identico      : raiz e aninhado com o mesmo ETag (cópias byte a byte iguais, ou raiz removida e rewrite caiu no aninhado)
//   OK-404-ambos     : path não existe em nenhuma cópia
//   DIVERGE          : raiz 200 com ETag ≠ aninhado 200 → a URL limpa serve a cópia da raiz, desatualizada em relação ao aninhado
//   SO-RAIZ          : raiz 200 e aninhado 404 → arquivo existe só na raiz (filesystem venceu o rewrite)
//   MUDOU-vs-ANTES   : o ETag da raiz mudou entre os snapshots (informativo)
// Uso: node raiz-etag-compare.mjs antes-deploy depois-deploy
import fs from 'node:fs';
const DIR = '/Users/dmchagas/Site_Complexo_DMC/docs/dmc/audit/2026-10-17/raiz-repositorio';
const [a = 'antes-deploy', b = 'depois-deploy'] = process.argv.slice(2);
const load = r => JSON.parse(fs.readFileSync(`${DIR}/etag-prod-${r}.json`, 'utf8'));
const A = load(a), B = load(b);
const idx = Object.fromEntries(A.resultados.map(r => [r.raiz.url, r]));
let falhas = 0;
for (const r of B.resultados) {
  const ra = r.raiz, an = r.aninhado; const antes = idx[ra.url];
  let classe;
  if (ra.status === 404 && an.status === 404) classe = 'OK-404-ambos';
  else if (ra.status === 200 && an.status === 404) classe = 'SO-RAIZ';
  else if (ra.status === 200 && an.status === 200 && ra.etag === an.etag) classe = 'OK-identico';
  else if (ra.status === 200 && an.status === 200) classe = 'DIVERGE';
  else classe = `OUTRO(${ra.status}/${an.status})`;
  const mudou = antes && antes.raiz.etag !== ra.etag ? ' MUDOU-vs-ANTES' : '';
  if (classe === 'DIVERGE' || classe === 'SO-RAIZ') falhas++;
  console.log(`${classe.padEnd(14)} [${r.grupo}] ${decodeURIComponent(ra.url.replace(B.base, ''))} raiz=${ra.etag} aninhado=${an.etag}${mudou}`);
}
console.log(`\n${falhas === 0 ? 'APROVADO' : 'FALHOU'}: ${falhas} par(es) em DIVERGE/SO-RAIZ (${a} → ${b})`);
process.exit(falhas ? 1 : 0);
