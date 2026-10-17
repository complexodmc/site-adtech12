// Varre o texto visível das páginas internas e lista frases com padrões vedados
// (Prov. 205/2021 + posicionamento consultoria × advocacia/contabilidade).
const fs = require('fs'); const path = require('path');
const ROOT = '/Users/dmchagas/Site_Complexo_DMC/complexodmc.com.br';
const OUT = '/Users/dmchagas/Site_Complexo_DMC/docs/dmc/audit/2026-10-17/paginas-internas/conformidade.json';
const files = [
  ...fs.readdirSync(path.join(ROOT, 'pages')).filter(f => f.endsWith('.html') && !/backup|mouse/.test(f)).map(f => 'pages/' + f),
  ...fs.readdirSync(path.join(ROOT, 'solucoes/consultoria-trabalhista')).filter(f => f.endsWith('.html')).map(f => 'solucoes/consultoria-trabalhista/' + f),
];
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
];
const out = [];
for (const rel of files) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = html.split('\n');
  lines.forEach((line, i) => {
    if (/<(script|style|link|meta name="viewport")/.test(line) && !/<meta name="description"/.test(line)) return;
    // texto visível + atributos de conteúdo (title, meta description, alt, aria-label)
    const metaDesc = line.match(/<meta name="description" content="([^"]*)"/i);
    const titleTag = line.match(/<title>([^<]*)<\/title>/i);
    let text = metaDesc ? metaDesc[1] : titleTag ? titleTag[1] : line.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 3) return;
    const hits = rules.filter(([, re]) => re.test(text)).map(([n]) => n);
    if (!hits.length) return;
    const m = text.match(/[^.!?]*(?:garant|%|êxito|sucesso|honorári|gratuit|urgen|imediat|economi|reduz|maximiz|escritório|advocacia|advogad|contabilidade|contábil|contador|melhor|líder|mais poderosa|anos|R\$|\d{2,}\+)[^.!?]*[.!?]?/i);
    out.push({ file: rel, line: i + 1, rules: hits, phrase: (m ? m[0] : text).trim().slice(0, 240) });
  });
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
const seen = new Set();
for (const o of out) { const k = o.file + '|' + o.phrase; if (seen.has(k)) continue; seen.add(k); console.log(`${o.file}:${o.line} [${o.rules.join(',')}] ${o.phrase}`); }
console.log('TOTAL', out.length);
