// Checagem de links: internos (resolvidos contra o filesystem) e externos (HEAD, tolerante a falha)
// Uso: node docs/dmc/audit/tools/baseline-links.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/dmchagas/Site_Complexo_DMC';
const SITE = path.join(ROOT, 'complexodmc.com.br');
const OUT = path.join(ROOT, 'docs/dmc/audit/2026-10-17/metricas-baseline');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, acc); }
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

const htmlFiles = walk(SITE);
const attrRe = /<(a|link|script|img|source|video|iframe)\b[^>]*?\s(href|src|poster|data-src)\s*=\s*["']([^"']+)["']/gi;

const internalBroken = [];
const externalSet = new Map(); // url -> [files]
let internalChecked = 0;

// Quando a página é servida pelo Vercel, /solucoes/:vertical/:slug (sem .html) é reescrito.
function resolveInternal(file, href) {
  const clean = href.split('#')[0].split('?')[0];
  if (clean === '') return { ok: true }; // âncora na própria página
  let target;
  if (clean.startsWith('/')) target = path.join(SITE, clean);
  else target = path.resolve(path.dirname(file), clean);
  const candidates = [target, target + '.html', path.join(target, 'index.html')];
  for (const c of candidates) {
    if (fs.existsSync(c)) return { ok: true, resolved: c };
  }
  return { ok: false, tried: candidates.map((c) => path.relative(ROOT, c)) };
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  let m;
  attrRe.lastIndex = 0;
  while ((m = attrRe.exec(html))) {
    const href = m[3].trim();
    if (/^(mailto:|tel:|javascript:|data:|#|whatsapp:)/i.test(href)) continue;
    if (/^(https?:)?\/\//i.test(href)) {
      const u = href.startsWith('//') ? 'https:' + href : href;
      if (!externalSet.has(u)) externalSet.set(u, []);
      externalSet.get(u).push(path.relative(ROOT, file));
      continue;
    }
    internalChecked++;
    const r = resolveInternal(file, href);
    if (!r.ok) internalBroken.push({ file: path.relative(ROOT, file), href, tag: m[1], tried: r.tried });
  }
}

// externos: HEAD com timeout, fallback GET
async function check(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    let r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (baseline-audit)' } });
    if (r.status === 405 || r.status === 403 || r.status === 404) {
      r = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (baseline-audit)' } });
    }
    return { url, status: r.status, ok: r.ok };
  } catch (e) {
    return { url, status: 'ERR', ok: false, error: String(e.cause?.code || e.name || e.message).slice(0, 80) };
  } finally { clearTimeout(t); }
}

const urls = [...externalSet.keys()];
const external = [];
const CONC = 8;
for (let i = 0; i < urls.length; i += CONC) {
  const batch = await Promise.all(urls.slice(i, i + CONC).map(check));
  for (const b of batch) external.push({ ...b, files: [...new Set(externalSet.get(b.url))].slice(0, 5), count: externalSet.get(b.url).length });
  process.stdout.write(`externos ${Math.min(i + CONC, urls.length)}/${urls.length}\r`);
}
console.log();

const summary = {
  htmlFiles: htmlFiles.length,
  internalRefsChecked: internalChecked,
  internalBrokenCount: internalBroken.length,
  externalUniqueCount: urls.length,
  externalNotOk: external.filter((e) => !e.ok).length,
};
fs.writeFileSync(path.join(OUT, 'links.json'), JSON.stringify({ summary, internalBroken, external }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log('--- internos quebrados ---');
for (const b of internalBroken) console.log(`${b.file} -> <${b.tag}> ${b.href}`);
console.log('--- externos não OK ---');
for (const e of external.filter((e) => !e.ok)) console.log(`${e.status} ${e.url} (${e.error || ''}) em ${e.files.join(', ')}`);
