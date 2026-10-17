// =============================================================
// QA · Compila o vercel.json REAL do repositório em rotas testáveis.
//
// Reproduz o subconjunto do path-to-regexp v6 que a Vercel usa em
// `source` (literais, `:nome`, `:nome(re)`, `(re)`, modificadores * + ?)
// e a ordem de roteamento da plataforma:
//   headers (todas as que casam) → redirects (primeira que casa)
//   → filesystem (outputDirectory) → rewrites (com check) → 404.
// A saída de sourceToRegex é idêntica ao `src` que o `vercel build`
// grava em .vercel/output/config.json (conferido em tests/e2e/vercel-config.spec.js).
// Sem dependência: o path-to-regexp do node_modules é o v8 do Express,
// com outra sintaxe.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const ESPECIAIS = /[.+*?^${}()|[\]\\]/g;
const escapar = (s) => s.replace(ESPECIAIS, '\\$&');
const PADRAO = '[^/]+?';

// Converte um `source` da Vercel em { regex, nomes } (nomes na ordem dos grupos).
export function sourceToRegex(source) {
  const tokens = [];
  let i = 0;
  let literal = '';
  let anonimos = 0;
  const flush = () => { if (literal) { tokens.push({ tipo: 'lit', valor: literal }); literal = ''; } };
  while (i < source.length) {
    const c = source[i];
    if (c === '\\') { literal += source[i + 1] ?? ''; i += 2; continue; }
    if (c === ':' || c === '(') {
      let nome = null;
      if (c === ':') {
        let j = i + 1;
        while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j++;
        nome = source.slice(i + 1, j);
        i = j;
      }
      let padrao = null;
      if (source[i] === '(') {
        let prof = 1; let j = i + 1;
        while (j < source.length && prof > 0) {
          if (source[j] === '\\') { j += 2; continue; }
          if (source[j] === '(') prof++;
          else if (source[j] === ')') prof--;
          j++;
        }
        padrao = source.slice(i + 1, j - 1);
        i = j;
      }
      let mod = '';
      if ('*+?'.includes(source[i] ?? '#')) { mod = source[i]; i++; }
      let prefixo = '';
      if (literal.endsWith('/')) { prefixo = '/'; literal = literal.slice(0, -1); }
      flush();
      tokens.push({ tipo: 'param', nome: nome ?? String(anonimos++), padrao: padrao ?? PADRAO, mod, prefixo });
      continue;
    }
    literal += c; i++;
  }
  flush();

  let corpo = '';
  const nomes = [];
  for (const t of tokens) {
    if (t.tipo === 'lit') { corpo += escapar(t.valor); continue; }
    nomes.push(t.nome);
    const p = t.padrao; const pre = escapar(t.prefixo);
    if (t.prefixo) {
      if (t.mod === '*' || t.mod === '+') {
        corpo += `(?:${pre}((?:${p})(?:${pre}(?:${p}))*))${t.mod === '*' ? '?' : ''}`;
      } else {
        corpo += `(?:${pre}(${p}))${t.mod}`;
      }
    } else {
      corpo += `(${p})${t.mod}`;
    }
  }
  return { src: `^${corpo}$`, regex: new RegExp(`^${corpo}$`), nomes };
}

// Substitui $1… e :nome no destino.
export function substituir(destino, m, nomes) {
  let d = destino.replace(/\$(\d+)/g, (_, n) => m[Number(n)] ?? '');
  d = d.replace(/:([A-Za-z_][A-Za-z0-9_]*)\*?/g, (todo, nome) => {
    const idx = nomes.indexOf(nome);
    return idx >= 0 ? (m[idx + 1] ?? '') : todo;
  });
  return d;
}

export function carregarVercel(arquivo = path.join(RAIZ_REPO, 'vercel.json')) {
  const cfg = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const outputDir = path.resolve(RAIZ_REPO, cfg.outputDirectory || '.');
  const headers = (cfg.headers || []).map((h) => ({ ...sourceToRegex(h.source), source: h.source, headers: Object.fromEntries(h.headers.map((x) => [x.key, x.value])) }));
  const redirects = (cfg.redirects || []).map((r) => ({
    ...sourceToRegex(r.source), source: r.source, destination: r.destination,
    status: r.statusCode ?? (r.permanent === false ? 307 : 308)
  }));
  const rewrites = (cfg.rewrites || []).map((r) => ({ ...sourceToRegex(r.source), source: r.source, destination: r.destination }));
  return { cfg, outputDir, headers, redirects, rewrites };
}

// Decide o que fazer com um pathname CRU (percent-encoded, como chega no servidor).
// Retorna { headers, acao: 'redirect'|'arquivo'|'api'|'404', ... }.
export function rotear(vc, pathnameCru, existeArquivo) {
  const hs = {};
  for (const h of vc.headers) if (h.regex.test(pathnameCru)) Object.assign(hs, h.headers);
  for (const r of vc.redirects) {
    const m = pathnameCru.match(r.regex);
    if (m) return { headers: hs, acao: 'redirect', status: r.status, location: substituir(r.destination, m, r.nomes), regra: r.source };
  }
  const arq = existeArquivo(pathnameCru);
  if (arq) return { headers: hs, acao: 'arquivo', arquivo: arq };
  for (const r of vc.rewrites) {
    const m = pathnameCru.match(r.regex);
    if (!m) continue;
    const destino = substituir(r.destination, m, r.nomes).split('?')[0];
    if (destino.startsWith('/api/')) return { headers: hs, acao: 'api', regra: r.source };
    const a2 = existeArquivo(destino);
    if (a2) return { headers: hs, acao: 'arquivo', arquivo: a2, regra: r.source };
  }
  return { headers: hs, acao: '404' };
}
