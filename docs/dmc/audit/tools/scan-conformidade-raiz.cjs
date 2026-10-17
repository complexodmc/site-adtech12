// Rodada extra: varre os 5 HTML da RAIZ do repositório (pages/*.html, fora de
// complexodmc.com.br/) com as mesmas regras de scan-conformidade.cjs
// (Prov. 205/2021 + identidade consultoria × advocacia/contabilidade) e
// acrescenta um check de identidade (títulos, descrição, headings, frases-chave).
const fs = require('fs'); const path = require('path');
const ROOT = '/Users/dmchagas/Site_Complexo_DMC';
const OUTDIR = path.join(ROOT, 'docs/dmc/audit/2026-10-17/raiz-repositorio');
fs.mkdirSync(OUTDIR, { recursive: true });
const files = fs.readdirSync(path.join(ROOT, 'pages')).filter(f => f.endsWith('.html')).map(f => 'pages/' + f);
const rules = [
  ['promessa/garantia', /\bgarant(e|imos|ia|ir|ido|ida|indo|a)\b/i],
  ['percentual/estatística', /\d+\s?%|\b\d{2,}\+|R\$\s?\d/],
  ['êxito/sucesso', /\bêxito\b|\bsucesso\b/i],
  ['honorários/gratuito', /honorári|gratuit|sem custo|preço|valor acessível/i],
  ['urgência', /\burgente|\burgência|agora mesmo|não perca|última chance|antes que seja tarde|imediat/i],
  ['economia/redução prometida', /economi[az]|reduz(a|ir|ção)\b.*(impost|tribut|carga|multa|penalidade)|maximiz/i],
  ['advocacia/escritório', /escritório|advocacia|advogad|OAB\b/i],
  ['contabilidade', /contabilidade|contábil|contador/i],
  ['superlativo/ranking', /melhor(es)? (do|no) mercado|únic[ao]s? no mercado|líder|ranking|n[º°] ?1|mais poderosa|referência no/i],
  ['anos de experiência', /anos (de|no) (atuação|experiência|mercado)/i],
  // extras de identidade (posicionamento não aprovado / resultado financeiro)
  ['identidade: império/milionário', /impéri|milion[áa]ri|bilion[áa]ri|fortuna/i],
  ['identidade: resultado financeiro', /lucro|faturamento|rentabil|retorno (sobre|do) (investimento|capital)|ROI\b/i],
];
const out = []; const summary = {};
for (const rel of files) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // ignora o conteúdo de <style>/<script> (CSS inline cheio de "%"), preservando a numeração de linhas
  const stripped = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, m => m.replace(/[^\n]/g, ''));
  const lines = stripped.split('\n');
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
  const desc = (html.match(/<meta name="description" content="([^"]*)"/i) || [])[1] || '';
  const headings = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map(m => m[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean).slice(0, 40);
  const perRule = {};
  lines.forEach((line, i) => {
    if (/<(script|style|link|meta name="viewport")/.test(line) && !/<meta name="description"/.test(line)) return;
    const metaDesc = line.match(/<meta name="description" content="([^"]*)"/i);
    const titleTag = line.match(/<title>([^<]*)<\/title>/i);
    let text = metaDesc ? metaDesc[1] : titleTag ? titleTag[1] : line.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 3) return;
    const hits = rules.filter(([, re]) => re.test(text)).map(([n]) => n);
    if (!hits.length) return;
    hits.forEach(h => { perRule[h] = (perRule[h] || 0) + 1; });
    const m = text.match(/[^.!?]*(?:garant|%|êxito|sucesso|honorári|gratuit|urgen|imediat|economi|reduz|maximiz|escritório|advocacia|advogad|contabilidade|contábil|contador|melhor|líder|mais poderosa|anos|R\$|\d{2,}\+|impéri|milion|bilion|fortuna|lucro|faturamento|rentabil|ROI)[^.!?]*[.!?]?/i);
    out.push({ file: rel, line: i + 1, rules: hits, phrase: (m ? m[0] : text).trim().slice(0, 240) });
  });
  summary[rel] = { bytes: html.length, title, description: desc, headings, hitsPorRegra: perRule, totalHits: Object.values(perRule).reduce((a, b) => a + b, 0) };
}
fs.writeFileSync(path.join(OUTDIR, 'conformidade-raiz.json'), JSON.stringify({ geradoEm: new Date().toISOString(), resumo: summary, ocorrencias: out }, null, 2));
for (const [f, s] of Object.entries(summary)) {
  console.log(`\n### ${f} (${s.bytes} bytes) — ${s.totalHits} ocorrências`);
  console.log(`title: ${s.title}`); console.log(`desc : ${s.description}`);
  console.log(`regras: ${JSON.stringify(s.hitsPorRegra)}`);
  console.log(`headings(h1-h3, 1os 12): ${s.headings.slice(0, 12).map(h => JSON.stringify(h)).join(' | ')}`);
}
console.log('\n--- amostra de frases (dedup por arquivo+frase, máx 14 por arquivo) ---');
const seen = new Set(); const perFile = {};
for (const o of out) {
  const k = o.file + '|' + o.phrase; if (seen.has(k)) continue; seen.add(k);
  perFile[o.file] = (perFile[o.file] || 0) + 1; if (perFile[o.file] > 45) continue;
  console.log(`${o.file}:${o.line} [${o.rules.join(',')}] ${o.phrase}`);
}
console.log('TOTAL', out.length);
