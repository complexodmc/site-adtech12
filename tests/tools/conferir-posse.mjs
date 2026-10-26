// =============================================================
// Conferência da POSSE do portal (índice §8.1) contra o disco e o git — D-59, §9.9 item 2.
//
// Fonte: docs/dmc/PORTAL-ACADEMICO.md §8.1 (tabela de posse, com expansão das chaves `{…}`).
// Dono: sessão principal (§8.1, linha "Principal"). Só lê: não grava nada no repositório.
//
// O que confere:
//   A. Documento: nenhum caminho em duas fatias; nenhuma fatia com arquivo proibido
//      (server.js, db.js, config.js, login.html, login-classico.html, business-school.*);
//      nenhum caminho de fatia repetido nas linhas Principal, Proibidos ou Ninguém (exceto
//      server.js e login-classico.html, citados de propósito nas linhas Principal e Proibidos);
//      a cópia `POSSE` de tests/tools/posse-ead.mjs (F0r) igual à tabela, no front.
//   B. Documento → disco: todo caminho declarado existe (arquivo ou pasta). Os da lista
//      OPCIONAIS saem como aviso, com o motivo.
//   C. Disco → documento: todo arquivo do perímetro do portal tem exatamente um dono.
//      Perímetro: complexodmc.com.br/plataforma-ead/**, server/src/**, server/test/**,
//      server/scripts/**, tests/**, api/**. Specs e apoios do site em tests/e2e/ (o que não é
//      portal-*, _portal.js, _qr.js nem login-portal.spec.js) são da principal pela regra da
//      linha "Principal" ("e2e/_site.js e specs do site") — saem marcados "por regra".
//   D. Resíduos no perímetro (_np_*, backup, .orig, ~, .antes, .novo, cópia).
//   E. Git: commits "feat(portal)" do ramo (<base>..HEAD) que tocaram arquivo proibido; em
//      server.js, só os três pontos da principal (import, app.use('/api', montarPortal()),
//      app.use(tratarErroGlobal) no lugar do bloco anônimo — §3.4, D-42, D-82). Arquivo
//      proibido modificado no working tree sai como aviso (fora de commit de fatia).
//   F. Contagem por fatia comparada com a frase "Por fatia: …" do próprio §8.1 (informativo).
//
// Uso (raiz do repositório):
//   node tests/tools/conferir-posse.mjs                 → relatório; saída 1 se houver ERRO
//   node tests/tools/conferir-posse.mjs --json <arq>    → também grava o resultado em JSON
//   node tests/tools/conferir-posse.mjs --listar F3a    → caminhos declarados da fatia
//   opções: --base <ref> (padrão main) · --doc <arquivo>
// Saída: 0 = limpo · 1 = há ERRO · 2 = uso inválido / documento ilegível.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { POSSE, POSSE_PASTAS, lerPosseDoDocumento } from './posse-ead.mjs';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EAD = 'complexodmc.com.br/plataforma-ead/';

export const FATIAS = Object.freeze([
  'F0a', 'F0m', 'F0t', 'F0b', 'F0s', 'F0p', 'F0r', 'F1a', 'F1b', 'F2',
  'F3a', 'F3b', 'F4a', 'F4b', 'F5', 'F6a', 'F6b', 'F7', 'F8',
]);
const PRINCIPAL = 'principal';
const PROIBIDOS = 'proibidos';
const NINGUEM = 'ninguem';

/** Proibidos a TODAS as fatias (§3.4). */
export const PROIBIDOS_A_FATIAS = Object.freeze([
  'server/src/server.js', 'server/src/db.js', 'server/src/config.js',
  `${EAD}login.html`, `${EAD}login-classico.html`, `${EAD}css/business-school.css`, `${EAD}js/business-school.js`,
]);
/** Os dois únicos caminhos citados em duas linhas, de propósito (§8.1, parágrafo depois da tabela). */
const SOBREPOSICAO_PERMITIDA = new Set(['server/src/server.js', `${EAD}login-classico.html`]);

/** Caminhos da tabela que podem faltar no disco, com o motivo (aviso, não erro). */
const OPCIONAIS = Object.freeze({
  'tests/e2e/login-portal.spec.js': 'da principal COM a sessão 2d (§9.9 item 1a, D-71); a 2d não está ativa',
});

/** As três linhas que a principal pode acrescentar em server.js (§8.1 linha "Principal"). */
const PONTOS_SERVER_JS = Object.freeze([
  "import { montarPortal, tratarErroGlobal } from './portal/montar.js';",
  "app.use('/api', montarPortal());",
  'app.use(tratarErroGlobal);',
]);

const PERIMETRO = Object.freeze([EAD, 'server/src/', 'server/test/', 'server/scripts/', 'tests/', 'api/']);
const ARQUIVOS_RAIZ = new Set(['vercel.json', 'package.json', 'playwright.config.js', '.gitignore']);
const RESIDUO = /(^|\/)_np_|\.bak($|[.-])|\.orig$|~$|\.antes($|[.-])|\.novo\.|\.rascunho\.|\.tmp$|\.swp$|(^|[ ._-])(copy|copia|cópia)([ ._-]|$)| 2\.[a-z]+$/i;

// ------------------------------------------------------------------
// Leitura de §8.1
// ------------------------------------------------------------------

/** Expande chaves `{a,b}` (vários grupos, sem aninhamento). */
export function expandirChaves(s) {
  const m = s.match(/\{([^{}]*)\}/);
  if (!m) return [s];
  const antes = s.slice(0, m.index);
  const depois = s.slice(m.index + m[0].length);
  return m[1].split(',').flatMap((parte) => expandirChaves(antes + parte.trim() + depois));
}

/** Caminho do documento → caminho do repositório (ou null se o trecho não é caminho). */
export function resolverCaminho(t) {
  if (!/^[A-Za-z0-9_.\-/[\]*]+$/.test(t)) return null; // código, aspas, espaços → não é caminho
  if (/^(js|css)\//.test(t) || /^[a-z0-9-]+\.html$/.test(t)) return EAD + t;
  if (/^(server|tests|docs|api|complexodmc\.com\.br)\//.test(t)) return t;
  if (ARQUIVOS_RAIZ.has(t)) return t;
  return null; // ex.: `cabecalho-ead.mjs` citado como operação, não como posse
}

function rotuloParaDono(rotulo) {
  const id = (rotulo.match(/\*\*([^*]+)\*\*/) || [])[1] || '';
  if (FATIAS.includes(id)) return id;
  if (/^Principal/i.test(id)) return PRINCIPAL;
  if (/^Proibidos/i.test(id)) return PROIBIDOS;
  if (/^Ningu/i.test(id)) return NINGUEM;
  return null;
}

/** { arquivos: Map<caminho, Set<dono>>, pastas: Map<prefixo/, Set<dono>>, porDono, frasePorFatia } */
export function lerPosse(doc) {
  const texto = fs.readFileSync(doc, 'utf8');
  const ini = texto.indexOf('### 8.1');
  const fim = texto.indexOf('### 8.2', ini);
  if (ini < 0 || fim < 0) throw new Error(`§8.1 não encontrada em ${doc}`);
  const trecho = texto.slice(ini, fim);
  const arquivos = new Map();
  const pastas = new Map();
  const porDono = new Map();
  const anotar = (mapa, chave, dono) => {
    if (!mapa.has(chave)) mapa.set(chave, new Set());
    mapa.get(chave).add(dono);
    if (!porDono.has(dono)) porDono.set(dono, new Set());
    porDono.get(dono).add(chave);
  };
  for (const linha of trecho.split('\n')) {
    if (!linha.startsWith('| **')) continue;
    const celulas = linha.split('|');
    const dono = rotuloParaDono(celulas[1] || '');
    if (!dono) continue;
    const corpo = celulas.slice(2).join('|');
    for (const [, crase] of corpo.matchAll(/`([^`]+)`/g)) {
      for (const t of expandirChaves(crase.trim())) {
        // Pasta: `js/login/*`, `tests/server/*`, `docs/dmc/*` ou `server/src/portal/financeiro/` (pasta inteira).
        const pasta = (t.match(/^(.*\/)\*{1,2}$/) || [])[1] || (t.endsWith('/') ? t : null);
        if (pasta) {
          const c = resolverCaminho(pasta + 'x'); // resolve o prefixo como se fosse um arquivo dentro dela
          if (c) anotar(pastas, c.slice(0, -1), dono); // guarda com a barra final
          continue;
        }
        const c = resolverCaminho(t);
        if (c) anotar(arquivos, c, dono);
      }
    }
  }
  const frase = (trecho.match(/Por fatia:([^(]+)/) || [])[1] || '';
  const frasePorFatia = Object.fromEntries([...frase.matchAll(/(F\d[a-z]?)\s+(\d+)/g)].map(([, f, n]) => [f, Number(n)]));
  return { arquivos, pastas, porDono, frasePorFatia };
}

// ------------------------------------------------------------------
// Disco e git
// ------------------------------------------------------------------

function arquivosDoPerimetro() {
  const saida = [];
  const andar = (rel) => {
    const abs = path.join(RAIZ, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name === '.DS_Store' || e.name === 'node_modules') continue;
      const r = rel + e.name;
      if (e.isDirectory()) andar(r + '/');
      else saida.push(r);
    }
  };
  for (const p of PERIMETRO) andar(p);
  return saida.sort();
}

const existe = (rel) => fs.existsSync(path.join(RAIZ, rel));

function git(args) {
  try {
    return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
}

/** server.js num commit: só os três pontos (linhas de código acrescentadas) e a troca do bloco anônimo. */
function conferirServerJs(sha) {
  const diff = git(['show', '--format=', '--unified=0', sha, '--', 'server/src/server.js']) || '';
  const acrescentadas = [];
  const removidas = [];
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++') || l.startsWith('---')) continue;
    if (l.startsWith('+')) acrescentadas.push(l.slice(1).trim());
    else if (l.startsWith('-')) removidas.push(l.slice(1).trim());
  }
  const codigo = acrescentadas.filter((l) => l && !l.startsWith('//'));
  const fora = codigo.filter((l) => !PONTOS_SERVER_JS.includes(l));
  const rem = removidas.filter(Boolean);
  const blocoAnonimo = rem.length === 0 || (/^app\.use\(\(err,/.test(rem[0]) && rem[rem.length - 1] === '});'
    && codigo.includes('app.use(tratarErroGlobal);'));
  return { acrescentadas: codigo, fora, removidas: rem.length, ok: fora.length === 0 && blocoAnonimo };
}

// ------------------------------------------------------------------
// Conferência
// ------------------------------------------------------------------

export function conferir({ doc, base = 'main' }) {
  const posse = lerPosse(doc);
  const secao = (nome) => ({ nome, erros: [], avisos: [], info: [] });
  const S = {
    A: secao('A · documento'), B: secao('B · documento → disco'), C: secao('C · disco → documento'),
    D: secao('D · resíduos'), E: secao('E · git (arquivos proibidos)'), F: secao('F · contagem por fatia'),
  };

  // ---- A. documento
  for (const [c, donos] of posse.arquivos) {
    const fatias = [...donos].filter((d) => FATIAS.includes(d));
    const especiais = [...donos].filter((d) => !FATIAS.includes(d));
    if (fatias.length > 1) S.A.erros.push(`caminho em duas fatias: ${c} (${fatias.join(' e ')})`);
    if (fatias.length && PROIBIDOS_A_FATIAS.includes(c)) S.A.erros.push(`fatia com arquivo proibido: ${c} (${fatias.join(', ')})`);
    if (fatias.length && especiais.length) S.A.erros.push(`caminho de fatia também na linha ${especiais.join('/')}: ${c}`);
    if (!fatias.length && especiais.length > 1 && !SOBREPOSICAO_PERMITIDA.has(c)) {
      S.A.erros.push(`caminho em duas linhas especiais: ${c} (${especiais.join(' e ')})`);
    }
  }
  for (const [p, donos] of posse.pastas) if (donos.size > 1) S.A.erros.push(`pasta em dois donos: ${p} (${[...donos].join(' e ')})`);
  for (const pr of PROIBIDOS_A_FATIAS) {
    for (const [p, donos] of posse.pastas) {
      const fatias = [...donos].filter((d) => FATIAS.includes(d));
      if (fatias.length && pr.startsWith(p)) S.A.erros.push(`fatia ${fatias.join(', ')} com pasta que contém o proibido ${pr}`);
    }
  }
  // cópia POSSE (F0r) = tabela, no front
  const docFront = lerPosseDoDocumento(doc);
  for (const r of docFront.repetidos) S.A.erros.push(`posse-ead: §8.1 com dois donos: ${r}`);
  for (const [c, dono] of Object.entries(docFront.posse)) {
    if (POSSE[c] !== dono) S.A.erros.push(`posse-ead: ${c} — POSSE ${POSSE[c] ?? 'ausente'}, §8.1 ${dono}`);
  }
  for (const c of Object.keys(POSSE)) if (!Object.hasOwn(docFront.posse, c)) S.A.erros.push(`posse-ead: sobra em POSSE: ${c}`);
  for (const [p, d] of Object.entries(docFront.pastas)) {
    if (POSSE_PASTAS[p] !== d) S.A.erros.push(`posse-ead: pasta ${p} — POSSE ${POSSE_PASTAS[p] ?? 'ausente'}, §8.1 ${d}`);
  }
  const fatiasNaTabela = FATIAS.filter((f) => posse.porDono.has(f));
  S.A.info.push(`${fatiasNaTabela.length} fatias na tabela; ${posse.arquivos.size} arquivos e ${posse.pastas.size} pastas declarados`);
  S.A.info.push(`POSSE de posse-ead.mjs: ${Object.keys(POSSE).length} caminhos de front + ${Object.keys(POSSE_PASTAS).length} pastas, conferidos contra §8.1`);

  // ---- B. documento → disco
  for (const [c, donos] of posse.arquivos) {
    if (existe(c)) continue;
    if (OPCIONAIS[c]) S.B.avisos.push(`declarado e ausente (previsto): ${c} — ${OPCIONAIS[c]}`);
    else S.B.erros.push(`declarado e ausente no disco: ${c} (${[...donos].join(', ')})`);
  }
  for (const [p, donos] of posse.pastas) {
    if (!existe(p)) S.B.erros.push(`pasta declarada e ausente: ${p} (${[...donos].join(', ')})`);
  }

  // ---- C. disco → documento
  const disco = arquivosDoPerimetro();
  const donoDe = (c) => {
    const donos = new Set(posse.arquivos.get(c) || []);
    for (const [p, ds] of posse.pastas) if (c.startsWith(p)) for (const d of ds) donos.add(d);
    return donos;
  };
  const porRegra = [];
  const contagem = {};
  for (const c of disco) {
    let donos = donoDe(c);
    if (donos.size === 0 && /^tests\/e2e\/[^/]+$/.test(c)
      && !/^tests\/e2e\/(portal-|_portal\.js$|_qr\.js$|login-portal\.spec\.js$)/.test(c)) {
      donos = new Set([PRINCIPAL]);
      porRegra.push(c);
    }
    const lista = [...donos];
    if (lista.length === 0) S.C.erros.push(`no disco sem dono em §8.1: ${c}`);
    else if (lista.length > 1 && !(lista.length === 2 && SOBREPOSICAO_PERMITIDA.has(c))) {
      S.C.erros.push(`no disco com dois donos: ${c} (${lista.join(' e ')})`);
    }
    for (const d of lista) contagem[d] = (contagem[d] || 0) + 1;
  }
  S.C.info.push(`${disco.length} arquivos no perímetro (${PERIMETRO.join(', ')})`);
  if (porRegra.length) S.C.info.push(`principal por regra ("specs do site", §8.1): ${porRegra.map((c) => path.basename(c)).join(', ')}`);

  // ---- D. resíduos
  for (const c of disco) if (RESIDUO.test(c)) S.D.erros.push(`resíduo no perímetro: ${c}`);

  // ---- E. git
  if (git(['rev-parse', '--is-inside-work-tree']) === null) S.E.avisos.push('git indisponível — seção não conferida');
  else {
    const log = git(['log', `${base}..HEAD`, '--format=%h%x09%s']) || '';
    const commitsPortal = log.split('\n').filter(Boolean).map((l) => l.split('\t')).filter(([, s]) => /^feat\(portal\)/.test(s || ''));
    S.E.info.push(`commits "feat(portal)" em ${base}..HEAD: ${commitsPortal.map(([h]) => h).join(', ') || 'nenhum'}`);
    for (const [sha, assunto] of commitsPortal) {
      const tocados = (git(['show', '--name-only', '--format=', sha]) || '').split('\n').filter(Boolean);
      for (const pr of PROIBIDOS_A_FATIAS.filter((p) => tocados.includes(p))) {
        if (pr === 'server/src/server.js') {
          const r = conferirServerJs(sha);
          const resumo = `${sha} server.js: ${r.acrescentadas.length} linha(s) de código acrescentada(s), ${r.removidas} removida(s)`;
          if (r.ok) S.E.info.push(`${resumo} — só os três pontos da principal (import, montarPortal, tratarErroGlobal no lugar do bloco anônimo)`);
          else S.E.erros.push(`${resumo} — fora dos três pontos: ${r.fora.join(' | ') || '(remoção fora do bloco anônimo)'}`);
        } else {
          S.E.erros.push(`${sha} (${assunto.slice(0, 40)}…) tocou arquivo proibido: ${pr}`);
        }
      }
    }
    const status = git(['status', '--porcelain', '--', ...PROIBIDOS_A_FATIAS]) || '';
    for (const l of status.split('\n').filter(Boolean)) {
      const arq = l.slice(3).trim();
      const st = (git(['diff', '--numstat', '--', arq]) || '').trim().split(/\s+/);
      S.E.avisos.push(`proibido modificado no working tree, fora de commit de fatia: ${arq} (+${st[0] || '?'} −${st[1] || '?'})`);
    }
    for (const pr of PROIBIDOS_A_FATIAS) {
      const ultimo = (git(['log', '-1', '--format=%h %s', '--', pr]) || '').trim();
      S.E.info.push(`${pr.replace(EAD, 'plataforma-ead/')}: último commit ${ultimo.slice(0, 70) || '—'}`);
    }
  }

  // ---- F. contagem por fatia (frase do documento × tabela)
  for (const f of FATIAS) {
    const n = (posse.porDono.get(f) || new Set()).size;
    const frase = posse.frasePorFatia[f];
    const linha = `${f}: ${n} declarados · ${contagem[f] || 0} arquivos no disco${frase !== undefined ? ` · frase do §8.1: ${frase}` : ''}`;
    if (frase !== undefined && frase !== n) S.F.avisos.push(`${linha} (a frase do §8.1 está desatualizada)`);
    else S.F.info.push(linha);
  }

  const erros = Object.values(S).flatMap((s) => s.erros);
  const avisos = Object.values(S).flatMap((s) => s.avisos);
  return { secoes: S, erros, avisos };
}

function imprimir(r) {
  console.log('conferir-posse · docs/dmc/PORTAL-ACADEMICO.md §8.1 contra o disco e o git (D-59)');
  for (const s of Object.values(r.secoes)) {
    console.log(`\n${s.nome} — ${s.erros.length ? `REPROVADO (${s.erros.length})` : 'ok'}`);
    for (const l of s.info) console.log(`  · ${l}`);
    for (const l of s.avisos) console.log(`  aviso: ${l}`);
    for (const l of s.erros) console.log(`  ERRO: ${l}`);
  }
  console.log(`\nRESULTADO: ${r.erros.length ? `REPROVADO — ${r.erros.length} erro(s)` : 'LIMPO'} · ${r.avisos.length} aviso(s)`);
}

const executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDireto) {
  const args = process.argv.slice(2);
  const valor = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
  const doc = path.resolve(RAIZ, valor('--doc') || 'docs/dmc/PORTAL-ACADEMICO.md');
  let r;
  try {
    if (args.includes('--listar')) {
      const dono = valor('--listar');
      const posse = lerPosse(doc);
      if (!posse.porDono.has(dono)) { console.error(`uso: --listar <${FATIAS.join('|')}|${PRINCIPAL}|${PROIBIDOS}|${NINGUEM}>`); process.exit(2); }
      for (const c of [...posse.porDono.get(dono)].sort()) console.log(c);
      process.exit(0);
    }
    r = conferir({ doc, base: valor('--base') || 'main' });
  } catch (err) {
    console.error(`conferir-posse: ${err.message}`);
    process.exit(2);
  }
  imprimir(r);
  const json = valor('--json');
  if (json) {
    fs.mkdirSync(path.dirname(path.resolve(json)), { recursive: true });
    fs.writeFileSync(path.resolve(json), JSON.stringify({ geradoEm: new Date().toISOString(), ...r }, null, 2) + '\n');
  }
  process.exit(r.erros.length ? 1 : 0);
}
