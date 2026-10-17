// Resolve hrefs/src relativos de cada página interna contra o sistema de arquivos.
// Uso: node docs/dmc/audit/tools/check-links.cjs
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/dmchagas/Site_Complexo_DMC/complexodmc.com.br';
const OUT = '/Users/dmchagas/Site_Complexo_DMC/docs/dmc/audit/2026-10-17/paginas-internas/links.json';

const files = [
  ...fs.readdirSync(path.join(ROOT, 'pages')).filter(f => f.endsWith('.html')).map(f => 'pages/' + f),
  ...fs.readdirSync(path.join(ROOT, 'solucoes/consultoria-trabalhista')).filter(f => f.endsWith('.html')).map(f => 'solucoes/consultoria-trabalhista/' + f),
];
const attrRe = /\b(href|src|poster|data-video)\s*=\s*["']([^"']+)["']/g;
const report = [];
for (const rel of files) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = html.split('\n');
  const broken = []; const external = new Set(); const anchors = new Set();
  const ids = new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(m => m[1]));
  lines.forEach((line, i) => {
    for (const m of line.matchAll(attrRe)) {
      const attr = m[1]; let url = m[2].trim();
      if (!url || url.startsWith('#') && attr === 'href') { if (url.length > 1 && !ids.has(url.slice(1))) broken.push({ line: i + 1, attr, url, reason: 'âncora inexistente na página' }); continue; }
      if (/^(https?:|mailto:|tel:|javascript:|data:|\/\/)/i.test(url)) { external.add(url); continue; }
      if (attr === 'data-video') continue;
      const [p, hash] = url.split('#'); const clean = p.split('?')[0];
      let target;
      if (clean.startsWith('/')) target = path.join(ROOT, clean); else target = path.resolve(path.dirname(path.join(ROOT, rel)), clean);
      if (clean === '') target = path.join(ROOT, rel);
      let exists = fs.existsSync(target);
      // vercel rewrite: /solucoes/:vertical/:slug -> .html
      if (!exists && /\/solucoes\/[^/]+\/[a-z0-9-]+$/.test(target) && fs.existsSync(target + '.html')) exists = true;
      if (!exists && fs.existsSync(target) === false && clean.endsWith('/') && fs.existsSync(path.join(target, 'index.html'))) exists = true;
      if (!exists) broken.push({ line: i + 1, attr, url, resolved: target.replace(ROOT, ''), reason: 'arquivo não existe' });
      else if (hash && target.endsWith('.html')) {
        const tHtml = fs.readFileSync(target, 'utf8');
        if (!new RegExp(`\\bid\\s*=\\s*["']${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(tHtml)) broken.push({ line: i + 1, attr, url, resolved: target.replace(ROOT, '') + '#' + hash, reason: 'âncora inexistente no destino' });
      }
    }
  });
  report.push({ file: rel, broken, externalCount: external.size, external: [...external] });
}
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
for (const r of report) { console.log(`${r.file}: ${r.broken.length} quebrado(s)`); r.broken.forEach(b => console.log('   L' + b.line, b.attr, b.url, '->', b.resolved || '', '|', b.reason)); }
