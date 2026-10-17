// Varre o texto visível das páginas (home + /pages + /solucoes + EAD) e lista frases com
// padrões vedados (Prov. 205/2021 + posicionamento consultoria × advocacia/contabilidade).
//
// Rodada extra 2026-10-17 (lacuna E5/E6): duas regras novas —
//   (A) "schema/tipo reservado": JSON-LD com @type de atividade reservada
//       (LegalService, Attorney, Notary, AccountingService, LawFirm, Lawyer, Accountant) ou
//       `provider.@type` fora de Organization/ProfessionalService;
//   (B) "ato privativo": verbos/atos privativos de advogado (penhora, bloqueio, audiência,
//       contestação, recurso, defesa judicial, ajuizar, execução judicial, embargos…) no texto
//       visível e nas strings do JSON-LD, com enquadramento (entrega | explicativo | neutro) e
//       flag de atribuição a advogados/parceiros na mesma linha.
// Também passou a ignorar blocos <style> e comentários HTML (o scan anterior marcava
// `border-radius: 50%` como "percentual"); dentro de <script> comuns só lê literais de texto.
//
// Uso: node scan-conformidade.cjs            → grava OUT (env OUT) e imprime resumo
//      OUT=/caminho/x.json node scan-conformidade.cjs
// A saída padrão é conformidade-schema/conformidade.json; o JSON original da área
// paginas-internas (formato antigo, só lista de hits) fica preservado.
const fs = require('fs'); const path = require('path');
const ROOT = '/Users/dmchagas/Site_Complexo_DMC/complexodmc.com.br';
const OUT = process.env.OUT || '/Users/dmchagas/Site_Complexo_DMC/docs/dmc/audit/2026-10-17/conformidade-schema/conformidade.json';
const list = (dir, pre) => fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.html')).sort().map(f => pre + f);
const files = [
  'index.html',
  ...list('pages', 'pages/'),
  ...list('solucoes/consultoria-trabalhista', 'solucoes/consultoria-trabalhista/'),
  ...list('plataforma-ead', 'plataforma-ead/'),
];

// ---- regras originais (texto) ----
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
const PHRASE = /[^.!?]*(?:garant|%|êxito|sucesso|honorári|gratuit|urgen|imediat|economi|reduz|maximiz|escritório|advocacia|advogad|contabilidade|contábil|contador|melhor|líder|mais poderosa|anos|R\$|\d{2,}\+)[^.!?]*[.!?]?/i;

// ---- regra B: atos privativos de advogado (Lei 8.906/94, art. 1º) ----
// termos fortes: sempre marcados
const PRIV_FORTE = /\b(penhora(s|d[oa]s?|r)?|bloqueios?|audi[êe]ncias?|contesta[çc][ãa]o|contestar|ajuiz(ar|amento|ad[oa]s?)|cumprimento de senten[çc]a|embargos|impugna[çc][ãa]o|sustenta[çc][ãa]o oral|peti[çc][ãa]o|peticion\w*|liminar|incidente de desconsidera[çc][ãa]o|desconsidera[çc][ãa]o da personalidade|adjudica[çc][ãa]o|aliena[çc][ãa]o judicial|levantamento de valores|reclamat[óo]rias?|inqu[ée]rito civil|a[çc][ãa]o civil p[úu]blica|agravos?|recurso (ordin[áa]rio|de revista|especial|extraordin[áa]rio|administrativo)|recorrer|defesa (empresarial|judicial|da empresa|em (reclamat[óo]ria|a[çc][ãa]o|ju[íi]zo)|administrativa|t[ée]cnica no incidente|desde a cita[çc][ãa]o)|a empresa (é )?defendida|defend(e|emos|er|id[oa]s?)\b|execu[çc][ãa]o (de t[íi]tulos?|do t[íi]tulo|judicial|fiscal|trabalhista|for[çc]ada|da d[íi]vida|do cr[ée]dito|de cr[ée]ditos|efetiva|assistida)|fraude [àa] execu[çc][ãa]o|embargos [àa] execu[çc][ãa]o|garantia d[ae] execu[çc][ãa]o|fase de execu[çc][ãa]o|t[íi]tulo executivo)\b/gi;
// termos ambíguos: só contam com contexto judicial na mesma frase
const PRIV_AMBIGUO = /\b(execu[çc][ãa]o|executar|recursos?)\b/gi;
const JUDICIAL = /\b(t[íi]tulos?|senten[çc]a|cr[ée]dito|d[íi]vida|judicia(l|is)|fiscal|trabalhista|for[çc]ada|fraude|embargos|garantia|cumprimento|devedor|credor|ju[íi]zo|processo|penhora|condena[çc][ãa]o|inst[âa]ncia|vara|tribunal|TST|TRT|MPT|agravo|revista|ordin[áa]rio|dep[óo]sito recursal|executiv[oa]|reclamat[óo]ria|liquida[çc][ãa]o|autos|liti[gí]io|contencioso|intima[çc][ãa]o)\b/i;
// enquadramento: a frase apresenta o ato como entrega/serviço próprio?
const ENTREGA = /^(condu[çc][ãa]o|pedidos? de|convers[ãa]o|resposta|acompanhamento|impugna[çc][ãa]o|revis[ãa]o|contesta[çc][ãa]o|prova|defesa|execu[çc][ãa]o|recursos?|bloqueio|penhora)\b|\b(conduzimos|conduzid[oa]s?|condu[çc][ãa]o|nós|nossa|nosso|entregamos|realizamos|executamos|fazemos|cuidamos|assumimos|acompanhad[oa]s?|preparad[oa]s?|apresentamos|sob um mesmo comando|sob um respons[áa]vel|defendida|defendemos|at[ée] o fim|do que [ée] seu|o que entregamos|entregas?)\b/i;
const EXPLICATIVO = /\bart\.|\bCPC\b|\bCLT\b|C[óo]digo|S[úu]mula|\bLei\s?\d|STF|Supremo/i;
const ATRIBUICAO = /advogad|escrit[óo]rio parceir|parceir|habilitad|conveniad|Bear Finance|respons[áa]vel t[ée]cnico|contratad[oa]s? pela empresa|terceiros? habilitad/i;

// ---- regra A: tipos schema.org ----
const SCHEMA_DENY = /^(LegalService|Attorney|Notary|AccountingService|LawFirm|Lawyer|Accountant)$/;
const PROVIDER_ALLOW = /^(Organization|ProfessionalService)$/;

const stripTags = s => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
// não quebra frase depois de "art.", "arts.", "inc.", "nº"
const sentences = t => t.split(/(?<=(?<!\barts?|\binc|\bn[º°])[.!?;])\s+/).filter(Boolean);

function privHits(text) {
  const out = [];
  for (const s of sentences(text)) {
    const termos = new Set();
    for (const m of s.matchAll(PRIV_FORTE)) termos.add(m[0].toLowerCase());
    if (JUDICIAL.test(s)) for (const m of s.matchAll(PRIV_AMBIGUO)) termos.add(m[0].toLowerCase());
    if (!termos.size) continue;
    out.push({
      termos: [...termos],
      enquadramento: ENTREGA.test(s) ? 'entrega' : EXPLICATIVO.test(s) ? 'explicativo' : 'neutro',
      atribuicao: ATRIBUICAO.test(s),
      frase: s.trim().slice(0, 240),
    });
  }
  return out;
}

function walkLd(node, p, acc) {
  if (Array.isArray(node)) return node.forEach((n, i) => walkLd(n, `${p}[${i}]`, acc));
  if (!node || typeof node !== 'object') return;
  if (node['@type']) acc.types.push({ path: p, type: node['@type'] });
  for (const [k, v] of Object.entries(node)) {
    if (k === 'provider' && v && typeof v === 'object') acc.providers.push({ path: `${p}.provider`, type: v['@type'] || null, name: v.name || null });
    if (typeof v === 'string' && k !== '@context' && k !== '@type' && k !== 'url' && k !== 'item' && !/^https?:/.test(v)) acc.strings.push({ path: `${p}.${k}`, value: v });
    else walkLd(v, `${p}.${k}`, acc);
  }
}

const hits = [], schemaHits = [], resumo = [];
for (const rel of files) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = html.split('\n');
  const fileRes = { file: rel, linhas: lines.length, jsonld: { blocos: 0, tipos: [], providers: [], erros: [] }, privativo: { frases: 0, entregaSemAtribuicao: 0, termos: {} }, regrasOriginais: 0 };

  // ---- JSON-LD ----
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) {
    fileRes.jsonld.blocos++;
    const startLine = html.slice(0, m.index).split('\n').length;
    let data; try { data = JSON.parse(m[1]); } catch (e) { fileRes.jsonld.erros.push({ line: startLine, erro: String(e.message) }); continue; }
    const acc = { types: [], providers: [], strings: [] };
    walkLd(data, `ld@${startLine}`, acc);
    fileRes.jsonld.tipos.push(...acc.types.map(t => t.type));
    fileRes.jsonld.providers.push(...acc.providers);
    for (const t of acc.types) {
      const types = [].concat(t.type);
      for (const ty of types) if (SCHEMA_DENY.test(ty)) schemaHits.push({ file: rel, line: startLine, rule: 'schema/tipo reservado', path: t.path, type: ty });
    }
    for (const pv of acc.providers) if (!pv.type || !PROVIDER_ALLOW.test(pv.type)) schemaHits.push({ file: rel, line: startLine, rule: 'schema/provider', path: pv.path, type: pv.type, name: pv.name });
    for (const s of acc.strings) {
      const r = rules.filter(([, rx]) => rx.test(s.value)).map(([n]) => n);
      if (r.length) { fileRes.regrasOriginais++; hits.push({ file: rel, line: startLine, where: s.path, rules: r, phrase: s.value.slice(0, 240) }); }
      for (const h of privHits(s.value)) { fileRes.privativo.frases++; if (h.enquadramento === 'entrega' && !h.atribuicao) fileRes.privativo.entregaSemAtribuicao++; for (const t of h.termos) fileRes.privativo.termos[t] = (fileRes.privativo.termos[t] || 0) + 1; hits.push({ file: rel, line: startLine, where: s.path, rules: ['ato privativo'], ...h, phrase: h.frase }); }
    }
  }

  // ---- texto visível ----
  let inStyle = false, inScript = false, inComment = false;
  lines.forEach((line, i) => {
    let text = null;
    if (inComment) { if (/-->/.test(line)) inComment = false; return; }
    if (/<!--/.test(line) && !/-->/.test(line)) { inComment = true; return; }
    if (inStyle) { if (/<\/style>/i.test(line)) inStyle = false; return; }
    if (/<style[\s>]/i.test(line) && !/<\/style>/i.test(line)) { inStyle = true; return; }
    if (inScript) {
      if (/<\/script>/i.test(line)) inScript = false;
      const strs = line.match(/(['"`])((?:(?!\1).){25,})\1/g);
      if (!strs) return;
      text = strs.map(s => s.slice(1, -1)).join(' ');
    } else if (/<script[\s>]/i.test(line)) {
      if (!/<\/script>/i.test(line)) inScript = true; return;
    }
    if (text === null) {
      if (/<(link|meta name="viewport")/.test(line) && !/<meta name="description"/.test(line)) return;
      const metaDesc = line.match(/<meta name="description" content="([^"]*)"/i);
      const titleTag = line.match(/<title>([^<]*)<\/title>/i);
      text = metaDesc ? metaDesc[1] : titleTag ? titleTag[1] : stripTags(line.replace(/<!--.*?-->/g, ' '));
    }
    if (!text || text.length < 3) return;
    const r = rules.filter(([, rx]) => rx.test(text)).map(([n]) => n);
    if (r.length) { fileRes.regrasOriginais++; const pm = text.match(PHRASE); hits.push({ file: rel, line: i + 1, rules: r, phrase: (pm ? pm[0] : text).trim().slice(0, 240) }); }
    for (const h of privHits(text)) { fileRes.privativo.frases++; if (h.enquadramento === 'entrega' && !h.atribuicao) fileRes.privativo.entregaSemAtribuicao++; for (const t of h.termos) fileRes.privativo.termos[t] = (fileRes.privativo.termos[t] || 0) + 1; hits.push({ file: rel, line: i + 1, rules: ['ato privativo'], ...h, phrase: h.frase }); }
  });
  resumo.push(fileRes);
}

const totals = {
  arquivos: files.length,
  hitsRegrasOriginais: hits.filter(h => !h.rules.includes('ato privativo')).length,
  hitsAtoPrivativo: hits.filter(h => h.rules.includes('ato privativo')).length,
  hitsSchema: schemaHits.length,
  paginasSemJsonLd: resumo.filter(r => r.jsonld.blocos === 0).map(r => r.file),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ geradoEm: new Date().toISOString(), totals, schemaHits, resumo, hits }, null, 2));

console.log('== (A) schema/tipo reservado + provider fora de Organization/ProfessionalService ==');
for (const s of schemaHits) console.log(`${s.file}:${s.line} [${s.rule}] ${s.path} → ${s.type}${s.name ? ' (' + s.name + ')' : ''}`);
console.log('\n== (B) atos privativos — frases por arquivo (entrega sem atribuição | total) ==');
for (const r of resumo.filter(r => r.privativo.frases)) console.log(`${r.file}: ${r.privativo.entregaSemAtribuicao} | ${r.privativo.frases}  ${JSON.stringify(r.privativo.termos)}`);
console.log('\n== (B) frases enquadradas como ENTREGA sem atribuição a advogados/parceiros ==');
const seen = new Set();
for (const h of hits.filter(h => h.rules.includes('ato privativo') && h.enquadramento === 'entrega' && !h.atribuicao)) { const k = h.file + '|' + h.phrase; if (seen.has(k)) continue; seen.add(k); console.log(`${h.file}:${h.line}${h.where ? ' ' + h.where : ''} [${h.termos.join(',')}] ${h.phrase}`); }
console.log('\n== JSON-LD por arquivo ==');
for (const r of resumo) console.log(`${r.file}: blocos=${r.jsonld.blocos} tipos=${[...new Set(r.jsonld.tipos.flat())].join('/') || '-'} providers=${r.jsonld.providers.map(p => p.type).join('/') || '-'}${r.jsonld.erros.length ? ' ERROS=' + JSON.stringify(r.jsonld.erros) : ''}`);
console.log('\nTOTAIS', JSON.stringify(totals));
