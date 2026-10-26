// =============================================================
// Conferência da MATRIZ DE COBERTURA do blueprint (índice §4, M1–M17) — D-58, §9.9 item 2.
//
// Fonte: docs/dmc/PORTAL-ACADEMICO.md §4 (uma linha por item do blueprint e do escopo do CEO).
// Dono: sessão principal (§8.1, linha "Principal"). Só lê: não grava nada no repositório.
//
// Para cada linha da matriz:
//   1. DISCO (reprova): toda tela, rota, arquivo, global, classe e coleção citados existem —
//      página `*.html` em plataforma-ead/; rota `GET /portal/...`/`/api/...` montada (o agregador
//      é montado em memória com os 27 módulos reais e banco falso, sem rede nem Mongo, e as rotas
//      legadas são lidas dos Routers de server.js); rota `#/...` registrada por
//      `DMC_Professor.registrar({ rota | pai })`; arquivo `.js/.css/.mjs`; global `DMC_*` definido;
//      classe `pf-*` presente em CSS/JS/HTML da plataforma; coleção citada usada no servidor.
//      Linha só com exceção do CEO (E1/E2/E3) passa sem artefato, desde que a exceção exista em §3.2.
//   2. REFERÊNCIAS (reprova): seção `UX §`, `API §` e `§` do índice existe; D-nn existe em §11;
//      DC-nn existe na API ou na UX; Lnn existe em §12; nome de fatia é um dos 19 de §8.1.
//   3. D-58 (documental, informativo): linha C com tela/rota cita seção da UX/API (na linha, por
//      "idem" ou pelo preâmbulo do bloco); termo do item presente em cada seção citada (tabela
//      TERMOS quando existe; senão, termos tirados da própria linha — heurístico, não reprova).
//   4. "C · 2d": conferida como C e, sem o registro do item 1a de §9.9 em PROGRESS.md, listada
//      como "pendente da 2d" (nunca C pleno).
//
// Uso (raiz do repositório):
//   node tests/tools/conferir-matriz.mjs                → resumo + divergências; saída 1 se reprovar
//   node tests/tools/conferir-matriz.mjs --linhas       → também o veredito linha a linha
//   node tests/tools/conferir-matriz.mjs --json <arq>   → grava o resultado completo em JSON
//   node tests/tools/conferir-matriz.mjs --linha 3.8.2  → detalhe de uma linha
//   opção: --doc <arquivo> (outra cópia do índice; usada na prova por mutação)
// Saída: 0 = limpo (disco e referências) · 1 = divergência · 2 = erro de execução.
// O server/.env NUNCA é lido (DOTENV_CONFIG_PATH=/dev/null); nenhuma porta é aberta.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EAD_REL = 'complexodmc.com.br/plataforma-ead/';
const EAD = path.join(RAIZ, EAD_REL);
const DOCS = path.join(RAIZ, 'docs/dmc');
const FATIAS = ['F0a', 'F0m', 'F0t', 'F0b', 'F0s', 'F0p', 'F0r', 'F1a', 'F1b', 'F2',
  'F3a', 'F3b', 'F4a', 'F4b', 'F5', 'F6a', 'F6b', 'F7', 'F8'];
const GUARDA_CHUVA = ['F0', 'F1', 'F3', 'F4', 'F6']; // nomes de antes da divisão (D-37, D-59, D-78)
/** Prefixos de domínio das classes (§8.2 item 4). */
const DOMINIOS = ['est', 'av', 'ac', 'dec', 'sec', 'doc', 'fin', 'at', 'ia', 'com', 'prof'];
const METODOS = 'GET|POST|PUT|DELETE|PATCH';

/** Termos fixos por item (D-58; o resto é derivado da própria linha). */
const TERMOS = Object.freeze({
  '3.8.2': ['nome social', 'nomeSocial'],
  '3.8.10': ['gênero', 'genero'],
  '3.8.11': ['etnia'],
  '3.8.20': ['CEP'],
  '3.8.21': ['foto'],
  '3.9.8': ['A−', 'A+', 'tamanho do texto', 'fonte'],
  '3.2.8': ['gabarito'],
  '3.7.14': ['denúncia', 'denuncia'],
});

// ------------------------------------------------------------------
// utilitários de texto
// ------------------------------------------------------------------
const ler = (abs) => fs.readFileSync(abs, 'utf8');
const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => semAcento(String(s)).toLowerCase();
const PARADAS = new Set(['sobre', 'quando', 'entre', 'depois', 'antes', 'cada', 'para', 'pelo',
  'pela', 'como', 'mesma', 'mesmo', 'outro', 'outra', 'linha', 'campo', 'item', 'itens', 'dados', 'status', 'tela']);

function arquivosSob(relDir, filtro = () => true) {
  const out = [];
  const andar = (abs) => {
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(abs, e.name);
      if (e.isDirectory()) andar(p);
      else if (filtro(e.name)) out.push(p);
    }
  };
  andar(path.join(RAIZ, relDir));
  return out;
}

// ------------------------------------------------------------------
// Documentos: seções, decisões, lacunas
// ------------------------------------------------------------------
function indexarSecoes(texto) {
  const linhas = texto.split('\n');
  const cab = [];
  linhas.forEach((l, i) => {
    const m = l.match(/^(#{1,6})\s+(\d+(?:\.\d+)*)\.?\s/);
    if (m) cab.push({ nivel: m[1].length, num: m[2], i });
  });
  const secoes = new Map();
  cab.forEach((c, k) => {
    let fim = linhas.length;
    for (let j = k + 1; j < cab.length; j++) if (cab[j].nivel <= c.nivel) { fim = cab[j].i; break; }
    secoes.set(c.num, linhas.slice(c.i, fim).join('\n'));
  });
  return secoes;
}

function carregarDocumentos(arquivoIndice = path.join(DOCS, 'PORTAL-ACADEMICO.md')) {
  const indice = ler(arquivoIndice);
  const api = ler(path.join(DOCS, 'PORTAL-API.md'));
  const ux = ler(path.join(DOCS, 'PORTAL-UX.md'));
  const progresso = ler(path.join(DOCS, 'PROGRESS.md'));
  const decisoes = new Set([...indice.matchAll(/^\| (D-\d+) \|/gm)].map((m) => m[1]));
  const ini12 = indice.indexOf('## 12.');
  const fim12 = indice.indexOf('## 13.', ini12);
  const lacunas = new Map();
  for (const m of indice.slice(ini12, fim12).matchAll(/^\| (L\d+) \| ([^|]*)\|/gm)) {
    lacunas.set(m[1], /fechada/i.test(m[2]) ? 'fechada' : 'aberta');
  }
  const ini32 = indice.indexOf('### 3.2');
  const excecoes = new Set([...indice.slice(ini32, indice.indexOf('### 3.3', ini32)).matchAll(/\*\*(E\d)\*\*/g)].map((m) => m[1]));
  const dcs = new Set([...api.matchAll(/\bDC-\d+\b/g), ...ux.matchAll(/\bDC-\d+\b/g)].map((m) => m[0]));
  return {
    indice, api, ux, progresso, decisoes, lacunas, excecoes, dcs,
    secoes: { indice: indexarSecoes(indice), api: indexarSecoes(api), ux: indexarSecoes(ux) },
  };
}

// ------------------------------------------------------------------
// Matriz §4
// ------------------------------------------------------------------
const PAPEL_COLUNA = [
  [/^#$/, 'id'], [/^(Item|Campo|Fase|Entidade|Necessidade)/i, 'item'], [/^(Tela|Seção da tela|Telas que)/i, 'tela'],
  [/^Endpoint/i, 'endpoint'], [/^Coleção/i, 'colecao'], [/^(Equivalente|Como é atendido)/i, 'descricao'],
  [/^Onde/i, 'onde'], [/^Fatias?$/i, 'fatia'], [/^St$/i, 'st'],
];
/** Documento padrão de um `§` sem rótulo, por papel de coluna. */
const DOC_PADRAO = { tela: 'ux', endpoint: 'api', colecao: 'api', descricao: 'indice', onde: 'indice', st: 'indice', fatia: 'indice' };

function celulas(linha) {
  // divide por | que não esteja escapado (\|) — a matriz usa \| dentro de crase
  const out = [];
  let atual = '';
  for (let i = 0; i < linha.length; i++) {
    if (linha[i] === '\\' && linha[i + 1] === '|') { atual += '|'; i++; continue; }
    if (linha[i] === '|') { out.push(atual.trim()); atual = ''; continue; }
    atual += linha[i];
  }
  out.push(atual.trim());
  return out.slice(1, -1);
}

export function lerMatriz(indice) {
  const ini = indice.indexOf('## 4. Matriz de cobertura');
  const fim = indice.indexOf('### M18', ini);
  const trecho = indice.slice(ini, fim);
  const blocos = [];
  let bloco = null;
  for (const linha of trecho.split('\n')) {
    const mb = linha.match(/^### (M\d+) — (.*)$/);
    if (mb) { bloco = { id: mb[1], titulo: mb[2], preambulo: '', cabecalho: null, linhas: [] }; blocos.push(bloco); continue; }
    if (!bloco) continue;
    if (!linha.startsWith('|')) { if (!bloco.cabecalho) bloco.preambulo += linha + '\n'; continue; }
    const c = celulas(linha);
    if (c.every((x) => /^-+$/.test(x))) continue;
    if (!bloco.cabecalho) {
      bloco.cabecalho = c.map((h) => (PAPEL_COLUNA.find(([re]) => re.test(h)) || [null, 'outro'])[1]);
      continue;
    }
    const linhaM = { bloco: bloco.id, id: c[0], celulas: {} };
    bloco.cabecalho.forEach((papel, k) => { linhaM.celulas[papel] = c[k] ?? ''; });
    bloco.linhas.push(linhaM);
  }
  return blocos;
}

/**
 * Referências de seção num texto: [{doc, sec, explicita}]. O rótulo UX/API vale no nível de
 * parênteses em que aparece e nos de dentro; fecha com o `)` daquele nível ou com `;` (ex.:
 * "UX §10; §9.6" → §9.6 volta ao padrão da coluna; "(UX §8.5, F0p), … §6.15" → §6.15 volta ao
 * rótulo de fora). `explicita` = o rótulo veio do texto, não do padrão da coluna.
 */
function referenciasDeSecao(texto, docPadrao) {
  const refs = [];
  const pilha = [{ doc: docPadrao, explicita: false }];
  const topo = () => pilha[pilha.length - 1];
  const re = /\b(UX|API)\b|([;()])|§\s?(\d+(?:\.\d+)*)(?:\s?[–-]\s?§?\s?(\d+(?:\.\d+)*))?(\s+do blueprint)?/g;
  let m;
  while ((m = re.exec(texto))) {
    if (m[1]) { pilha[pilha.length - 1] = { doc: m[1].toLowerCase(), explicita: true }; continue; }
    if (m[2] === '(') { pilha.push({ doc: topo().doc, explicita: false }); continue; } // rótulo de fora vale, mas não é explícito aqui
    if (m[2] === ')') { if (pilha.length > 1) pilha.pop(); continue; }
    if (m[2] === ';') { pilha[pilha.length - 1] = { doc: pilha.length > 1 ? pilha[pilha.length - 2].doc : docPadrao, explicita: false }; continue; }
    if (m[5]) continue; // "§4 do blueprint"
    refs.push({ doc: topo().doc, sec: m[3], explicita: topo().explicita });
    if (m[4]) refs.push({ doc: topo().doc, sec: m[4], explicita: topo().explicita, fimDeFaixa: true });
  }
  return refs;
}

function expandirOpcionais(p) {
  const m = p.match(/\(([^()]*)\)/);
  if (!m) return [p];
  const antes = p.slice(0, m.index);
  const depois = p.slice(m.index + m[0].length);
  const alts = ['', ...m[1].split('|').map((s) => s.trim()).filter(Boolean)];
  return alts.flatMap((a) => expandirOpcionais(antes + a + depois));
}

const normRota = (p) => {
  let s = p.split('?')[0].split('#')[0].replace(/[).,;:]+$/, '');
  s = s.replace(/\/:[A-Za-z_][\w]*\??/g, '/:').replace(/\/\*\w*/g, '/*').replace(/\/+$/, '');
  if (s.startsWith('/portal/') || s === '/portal') s = '/api' + s;
  if (s.startsWith('/auth/')) s = '/api' + s;
  return s;
};

/** Tira os `)` finais sem par (o `)` que fecha um grupo opcional fica). */
function aparar(caminho) {
  let c = caminho.replace(/[.]+$/, '');
  const conta = (s, ch) => s.split(ch).length - 1;
  while (c.endsWith(')') && conta(c, ')') > conta(c, '(')) c = c.slice(0, -1);
  return c;
}

/**
 * Rotas citadas numa célula, na ordem: [{metodos:[], caminho, relativo}]. Rota relativa
 * (`…/:id/lida`, `/exportacao`) é resolvida contra a anterior da mesma célula pelo chamador.
 * Famílias e moldes (`/api/portal/*`, `js/portal/<pagina>.js`) não são rota.
 */
function rotasCitadas(texto) {
  const MET = `(?:\\b((?:${METODOS})(?:\\/(?:${METODOS}))*)\\s+)?`;
  const reAbs = new RegExp(`${MET}(?<![\\w./-])(\\/(?:api\\/)?(?:portal|auth)\\/[^\\s\`,;]*|\\/api\\/[a-z][^\\s\`,;]*)`, 'g');
  const reRel = new RegExp(`${MET}…(\\/[^\\s\`,;]*)`, 'g');
  const reBare = /`(\/[a-z][\w\-/:]*)`/g;
  const achados = [];
  for (const m of texto.matchAll(reAbs)) achados.push({ pos: m.index, metodos: m[1] ? m[1].split('/') : [], caminho: m[2], relativo: false });
  for (const m of texto.matchAll(reRel)) achados.push({ pos: m.index, metodos: m[1] ? m[1].split('/') : [], caminho: m[2], relativo: true });
  for (const m of texto.matchAll(reBare)) {
    if (/^\/(api|portal|auth)\//.test(m[1])) continue;
    achados.push({ pos: m.index, metodos: [], caminho: m[1], relativo: true });
  }
  return achados
    .sort((a, b) => a.pos - b.pos)
    .map((a) => ({ ...a, caminho: aparar(a.caminho) }))
    .filter((a) => !/[*<>]/.test(a.caminho));
}

// ------------------------------------------------------------------
// Disco: rotas montadas, páginas, rotas #/, arquivos, globais, classes, coleções
// ------------------------------------------------------------------
async function rotasMontadas() {
  process.env.DOTENV_CONFIG_PATH = '/dev/null'; // nunca lê server/.env
  process.env.DOTENV_CONFIG_QUIET = 'true';
  process.env.NODE_ENV = 'test';                // silencia os avisos de configuração
  process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-conferir-matriz';
  process.env.JWT_SECRET ||= 'segredo-apenas-para-conferir-matriz';
  const imp = (rel) => import(pathToFileURL(path.join(RAIZ, rel)).href);
  const M = await imp('server/src/portal/montar.js');
  const { criarBancoMemoria } = await imp('server/test/apoio/banco-memoria.js');
  const { silencioso } = await imp('server/test/apoio/falsos.js');
  const { lerConfigPortal } = await imp('server/src/portal/config-portal.js');
  const { especificacoesRegistradas } = await imp('server/src/portal/indices.js');
  const { criarServicos } = await imp('server/src/portal/servicos.js');
  const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-apenas-para-conferir-matriz', servicos: criarServicos(),
    configPortal: lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-apenas-para-conferir-matriz' }),
    falharCedo: false, log: silencioso,
  });
  await portal.carregar();
  const estado = portal.estadoDoPortal();
  const rotas = new Set();
  for (const lista of Object.values(estado.rotas)) for (const r of lista) rotas.add(r);
  // legado: Routers default de server.js, com o prefixo do app.use
  const fonte = ler(path.join(RAIZ, 'server/src/server.js'));
  const imports = Object.fromEntries([...fonte.matchAll(/^import (\w+) from '\.\/routes\/([\w-]+)\.js';/gm)].map((m) => [m[1], m[2]]));
  const legado = [];
  for (const m of fonte.matchAll(/^app\.use\('([^']+)',\s*(\w+)\);/gm)) {
    const arq = imports[m[2]];
    if (!arq) continue;
    const mod = await imp(`server/src/routes/${arq}.js`);
    for (const r of M.listarRotas(mod.default, m[1])) { rotas.add(r); legado.push(r); }
  }
  return { rotas, estado, legado: legado.length };
}

function indiceDoDisco() {
  const ead = arquivosSob(EAD_REL);
  const paginas = new Set(fs.readdirSync(EAD).filter((n) => n.endsWith('.html')));
  const js = ead.filter((p) => p.endsWith('.js') && !p.includes(`${path.sep}vendor${path.sep}`));
  const css = ead.filter((p) => p.endsWith('.css'));
  const htmlTxt = [...paginas].map((p) => ler(path.join(EAD, p))).join('\n');
  const jsTxt = js.map((p) => ler(p)).join('\n');
  const cssTxt = css.map((p) => ler(p)).join('\n') + '\n' + ['tokens.css', 'components.css']
    .map((n) => path.join(RAIZ, 'complexodmc.com.br/assets/css', n)).filter((p) => fs.existsSync(p)).map(ler).join('\n');
  const portalJs = arquivosSob(`${EAD_REL}js/portal`, (n) => n.endsWith('.js')).map(ler).join('\n');
  const hash = new Set();
  for (const m of portalJs.matchAll(/\b(?:rota|pai):\s*['"`]([^'"`]+)['"`]/g)) hash.add(m[1].replace(/:[A-Za-z_]\w*/g, ':'));
  const globais = new Set();
  for (const m of jsTxt.matchAll(/\b(DMC_\w+)\s*=(?!=)/g)) globais.add(m[1]);
  for (const m of jsTxt.matchAll(/\bfunction\s+(DMC_\w+)/g)) globais.add(m[1]);
  for (const m of jsTxt.matchAll(/\[['"](DMC_\w+)['"]\]\s*=/g)) globais.add(m[1]);
  const todos = [...ead, ...arquivosSob('server'), ...arquivosSob('tests'), ...arquivosSob('complexodmc.com.br/assets/css')];
  const porNome = new Map();
  for (const p of todos) {
    const n = path.basename(p);
    if (!porNome.has(n)) porNome.set(n, []);
    porNome.get(n).push(path.relative(RAIZ, p));
  }
  const servidorTxt = arquivosSob('server/src', (n) => n.endsWith('.js')).map(ler).join('\n');
  const colecoesNoCodigo = new Set();
  for (const m of servidorTxt.matchAll(/\b(?:collection|repo)\(\s*['"]([a-z_]+)['"]/g)) colecoesNoCodigo.add(m[1]);
  for (const m of servidorTxt.matchAll(/\bcolecao:\s*['"]([a-z_]+)['"]/g)) colecoesNoCodigo.add(m[1]);
  for (const m of servidorTxt.matchAll(/\bcol\.([a-z_]+)\b/g)) colecoesNoCodigo.add(m[1]);
  return { paginas, hash, globais, porNome, htmlTxt, jsTxt, cssTxt, servidorTxt, colecoesNoCodigo };
}

/** Coleções documentadas: as novas de §8.1 ("Posse de dados") + as legadas do cabeçalho de db.js. */
function colecoesDocumentadas(indice) {
  const ini = indice.indexOf('**Posse de dados**');
  const fim = indice.indexOf('### 8.2', ini);
  const novas = new Set();
  const trecho = indice.slice(ini, fim);
  const corte = trecho.indexOf('tem dono por documento'); // depois disso: documentos de `configuracoes` e campos
  // só o conteúdo inteiro da crase em snake_case (`erros.js`, `consentimentos.*`, serviços ficam de fora)
  for (const [, t] of trecho.slice(0, corte > 0 ? corte : undefined).matchAll(/`([a-z][a-z0-9_]+)`/g)) novas.add(t);
  const legadas = new Set();
  const db = ler(path.join(RAIZ, 'server/src/db.js'));
  for (const [, t] of db.matchAll(/^\/\/\s{2,}([a-z_]+)\s+\{/gm)) legadas.add(t);
  return { novas, legadas, todas: new Set([...novas, ...legadas]) };
}

// ------------------------------------------------------------------
// Conferência de uma linha
// ------------------------------------------------------------------
function codigosDeStatus(st) {
  const cods = new Set();
  for (const m of st.matchAll(/\b(C|A|R|E[123]|2d)\b|\b(L\d+)(?:\s?[–-]\s?L(\d+))?/g)) {
    if (m[1]) cods.add(m[1]);
    else if (m[3]) for (let k = Number(m[2].slice(1)); k <= Number(m[3]); k++) cods.add(`L${k}`);
    else cods.add(m[2]);
  }
  return cods;
}

function termosDaLinha(l) {
  if (TERMOS[l.id]) return { fixos: true, termos: TERMOS[l.id].map(norm) };
  const t = new Set();
  const textos = ['tela', 'endpoint', 'colecao', 'descricao', 'item'].map((k) => l.celulas[k] || '');
  for (const s of textos) {
    for (const [, c] of s.matchAll(/`([^`]+)`/g)) {
      for (const q of (c.match(/\?([^`]+)$/) || [, ''])[1].split(/[&=|]/)) if (q.length >= 4) t.add(norm(q));
      const limpo = c.replace(/^(GET|POST|PUT|DELETE|PATCH)(\/\w+)*\s+/, '').replace(/[?(].*$/, '');
      if (limpo.length >= 4) t.add(norm(limpo));
      for (const seg of limpo.split(/[./\s]+/)) if (seg.length >= 5 && !seg.startsWith(':')) t.add(norm(seg));
    }
    for (const [, p] of s.matchAll(/\b([a-z0-9-]+\.html)\b/g)) t.add(p);
  }
  for (const w of norm(l.celulas.item || '').split(/[^a-z0-9]+/)) if (w.length >= 5 && !PARADAS.has(w)) t.add(w);
  return { fixos: false, termos: [...t] };
}

function conferirLinha(l, bloco, ctx, anterior) {
  const r = { id: l.id, bloco: l.bloco, status: [...codigosDeStatus(l.celulas.st || '')], disco: [], referencias: [], componentes: [], d58: [], d58estrito: [], verificados: 0, avisos: [] };
  const cods = new Set(r.status);
  const soExcecao = [...cods].every((c) => /^E\d$/.test(c)) && cods.size > 0;
  const herdar = (papel) => {
    const v = l.celulas[papel] || '';
    if (/^idem\b/i.test(v) && anterior) return `${anterior.celulas[papel] || ''} ${v}`;
    return v;
  };
  const textoPorPapel = {};
  for (const papel of Object.keys(l.celulas)) textoPorPapel[papel] = herdar(papel);
  if (bloco.preambulo.trim()) textoPorPapel.preambulo = bloco.preambulo;
  l.celulasEfetivas = textoPorPapel;

  // -- exceções citadas existem em §3.2
  for (const c of cods) if (/^E\d$/.test(c) && !ctx.docs.excecoes.has(c)) r.referencias.push(`exceção ${c} não existe no §3.2`);

  // -- fatias (faixas como "F1–F7" e "F1a–F8" são permitidas)
  const fatiaTxt = (l.celulas.fatia || '') + ' ' + (bloco.cabecalho.includes('fatia') ? '' : (l.celulas.outro || ''));
  const semFaixas = fatiaTxt.replace(/\bF\d[a-z]?\s?[–-]\s?F\d[a-z]?\b/g, ' ');
  for (const m of semFaixas.matchAll(/\bF\d[a-z]?\b/g)) {
    if (FATIAS.includes(m[0])) continue;
    r.referencias.push(GUARDA_CHUVA.includes(m[0]) ? `fatia "${m[0]}" é nome de antes da divisão (use a fatia de §8.1)` : `fatia inexistente: ${m[0]}`);
  }

  const todo = Object.entries(textoPorPapel).filter(([p]) => p !== 'item' && p !== 'id');
  // -- referências de seção, D-nn, DC-nn, Lnn
  for (const [papel, txt] of todo) {
    const docPadrao = papel === 'preambulo' ? 'indice' : DOC_PADRAO[papel] || 'indice';
    for (const ref of referenciasDeSecao(txt, docPadrao)) {
      if (ctx.docs.secoes[ref.doc].has(ref.sec)) continue;
      if (!ref.explicita && ctx.docs.secoes.indice.has(ref.sec)) {
        r.avisos.push(`§${ref.sec} sem rótulo na coluna ${papel} (padrão ${ref.doc.toUpperCase()}): resolvida no índice`);
        continue;
      }
      r.referencias.push(`seção ${ref.doc === 'indice' ? 'do índice' : ref.doc.toUpperCase()} §${ref.sec} não existe (${papel})`);
    }
    for (const [d] of txt.matchAll(/\bD-\d+\b/g)) if (!ctx.docs.decisoes.has(d)) r.referencias.push(`${d} não existe em §11`);
    for (const [d] of txt.matchAll(/\bDC-\d+\b/g)) if (!ctx.docs.dcs.has(d)) r.referencias.push(`${d} não existe na API nem na UX`);
  }
  for (const c of cods) if (/^L\d+$/.test(c)) {
    if (!ctx.docs.lacunas.has(c)) r.referencias.push(`lacuna ${c} não existe em §12`);
    else if (ctx.docs.lacunas.get(c) === 'fechada') r.avisos.push(`lacuna ${c} já fechada em §12 e ainda citada no status`);
  }

  // -- disco
  const textoDisco = todo.filter(([p]) => p !== 'preambulo' && p !== 'st' && p !== 'fatia').map(([, t]) => t).join('\n');
  // páginas
  for (const [, p] of textoDisco.matchAll(/\b([a-z0-9-]+\.html)\b/g)) {
    r.verificados++;
    if (!ctx.disco.paginas.has(p)) r.disco.push(`página ausente: ${p}`);
  }
  // rotas da API (relativa = contra a última resolvida na mesma célula, encurtando o prefixo)
  const casa = (cam, metodos) => ctx.rotas.normalizadas.some(([met, c]) => c === cam && (!metodos || metodos.includes(met)));
  for (const papel of ['endpoint', 'descricao', 'onde', 'tela', 'colecao']) {
    const txt = textoPorPapel[papel];
    if (!txt) continue;
    let base = null;
    for (const rota of rotasCitadas(txt)) {
      const metodos = rota.metodos.length ? rota.metodos : null;
      if (rota.relativo && !base) {
        // sem rota absoluta antes na célula: confere por sufixo contra as rotas montadas
        const sufixo = normRota(`/x${rota.caminho}`).replace(/^\/api\/x|^\/x/, '');
        const achadas = ctx.rotas.normalizadas.filter(([met, c]) => c.endsWith(sufixo) && (!metodos || metodos.includes(met)));
        r.verificados++;
        if (achadas.length) r.avisos.push(`rota relativa sem base na célula ${papel} (…${rota.caminho}) resolvida por sufixo: ${[...new Set(achadas.map(([m, c]) => `${m} ${c}`))].slice(0, 3).join(' | ')}`);
        else r.disco.push(`rota não montada: ${rota.metodos.join('/') || '(qualquer método)'} …${rota.caminho} (nenhuma rota termina assim)`);
        continue;
      }
      const faltando = [];
      let resolvida = null;
      for (const v of expandirOpcionais(rota.caminho)) {
        let candidatos;
        if (!rota.relativo) candidatos = [normRota(v)];
        else {
          const segs = base.split('/');
          candidatos = [];
          for (let k = segs.length; k >= 3; k--) candidatos.push(normRota(segs.slice(0, k).join('/') + v));
        }
        const achado = candidatos.find((c) => casa(c, metodos));
        if (achado) resolvida ||= achado;
        else faltando.push(rota.relativo ? `${v} (tentado: ${candidatos.join(' | ')})` : normRota(v));
      }
      r.verificados++;
      if (faltando.length) r.disco.push(`rota não montada: ${rota.metodos.join('/') || '(qualquer método)'} ${faltando.join(' ; ')}`);
      if (resolvida) base = resolvida;
      else if (!rota.relativo) base = normRota(expandirOpcionais(rota.caminho)[0]);
    }
  }
  // rotas do backoffice (#/…), com alternativas "a|b|c" no último segmento
  for (const [, h] of textoDisco.matchAll(/#\/([a-z0-9/:_-]+(?:\|[a-z0-9_-]+)*)/gi)) {
    const partes = h.split('|');
    const pai = partes[0].split('/').slice(0, -1).join('/');
    for (const v of [partes[0], ...partes.slice(1).map((p) => `${pai}/${p}`)]) {
      r.verificados++;
      if (!ctx.disco.hash.has(v.replace(/\/$/, '').replace(/:[A-Za-z_]\w*/g, ':'))) r.disco.push(`rota do backoffice não registrada: #/${v}`);
    }
  }
  // arquivos citados
  for (const [, f] of textoDisco.matchAll(/`([\w./-]+\.(?:js|css|mjs))`/g)) {
    if (f.includes('<')) continue;
    r.verificados++;
    const existe = f.includes('/')
      ? [path.join(EAD, f), path.join(RAIZ, f), path.join(RAIZ, 'server', f), path.join(RAIZ, 'server/src', f), path.join(RAIZ, 'tests', f)].some((p) => fs.existsSync(p))
      : ctx.disco.porNome.has(f);
    if (!existe) r.disco.push(`arquivo ausente: ${f}${f === 'login-portal.spec.js' ? ' (principal com a 2d, §9.9 item 1a)' : ''}`);
  }
  // globais DMC_* e métodos
  for (const [, g, met] of textoDisco.matchAll(/\b(DMC_[A-Za-z]+)(?:\.([a-zA-Z]+))?/g)) {
    r.verificados++;
    if (!ctx.disco.globais.has(g)) { r.disco.push(`global não definido: ${g}`); continue; }
    if (met && !new RegExp(`\\b${met}\\s*(?:[:=(]|\\()`).test(ctx.disco.jsTxt)) r.disco.push(`método não encontrado: ${g}.${met}`);
  }
  // componentes pf-* (nome do catálogo da UX; a fatia pode usar o prefixo do domínio, §8.2 item 4)
  for (const [, cls] of textoDisco.matchAll(/`(pf-[a-z0-9_-]+)`/g)) {
    r.verificados++;
    const regra = (nome) => new RegExp(`\\.${nome.replace(/-/g, '\\-')}(?![\\w-])`).test(ctx.disco.cssTxt);
    if (regra(cls)) continue;
    const resto = cls.slice(3);
    const filhos = (nome) => new RegExp(`\\.${nome.replace(/-/g, '\\-')}(?:__|--)[\\w-]+`).test(ctx.disco.cssTxt);
    const comDominio = DOMINIOS.map((d) => `pf-${d}-${resto}`).filter((n) => regra(n) || filhos(n));
    if (comDominio.length) { r.componentes.push(`${cls} → ${comDominio.join(', ')} (prefixo de domínio)`); continue; }
    if (filhos(cls)) { r.componentes.push(`${cls} → só elementos/modificadores BEM no CSS`); continue; }
    const baseMod = cls.split('--')[0];
    if (baseMod !== cls && regra(baseMod)) { r.componentes.push(`${cls} → modificador sem regra própria; base ${baseMod} existe`); continue; }
    if (ctx.disco.jsTxt.includes(cls) || ctx.disco.htmlTxt.includes(cls)) { r.componentes.push(`${cls} → só no JS/HTML (estilo herdado da classe-base)`); continue; }
    r.componentes.push(`${cls} → AUSENTE com esse nome (nem com prefixo de domínio)`);
  }
  // coleções citadas (só as documentadas em §8.1 "Posse de dados" e as legadas de db.js)
  const colTxt = Object.entries(textoPorPapel).filter(([p]) => p === 'colecao' || (l.bloco === 'M13' && p === 'tela')).map(([, t]) => t).join(' ');
  const citadas = new Set();
  for (const [, tok] of colTxt.matchAll(/`([a-z][a-z0-9_]+)(?=[.`{ ])/g)) if (ctx.colecoes.todas.has(tok)) citadas.add(tok);
  for (const tok of citadas) {
    r.verificados++;
    if (!ctx.disco.colecoesNoCodigo.has(tok) && !new RegExp(`['"\`]${tok}['"\`]`).test(ctx.disco.servidorTxt)) r.disco.push(`coleção documentada e não usada no servidor: ${tok}`);
  }

  // -- linha só com exceção: precisa da exceção válida; sem artefato é o esperado
  r.soExcecao = soExcecao;

  // -- D-58 (documental): seção citada na própria linha, no preâmbulo do bloco ou herdada da linha
  //    anterior do mesmo bloco (a matriz cita a seção na 1ª linha do grupo); termo em cada seção.
  const telaPropria = (l.celulas.tela || '').trim();
  const endPropria = (l.celulas.endpoint || '').trim();
  const pre = textoPorPapel.preambulo || '';
  const so = (refs, doc) => refs.filter((x) => x.doc === doc && !x.fimDeFaixa);
  const fonte = (proprias, doPre, herdadas) => (proprias.length ? ['linha', proprias] : doPre.length ? ['preâmbulo', doPre]
    : herdadas?.length ? ['herdada', herdadas] : [null, []]);
  const [origemUx, refsUx] = fonte(so(referenciasDeSecao(telaPropria, 'ux'), 'ux'),
    so(referenciasDeSecao((pre.match(/Tela:[^\n]*/) || [''])[0], 'ux'), 'ux'), anterior?.refsUx);
  const [origemApi, refsApi] = fonte(so(referenciasDeSecao(endPropria, 'api'), 'api'),
    so(referenciasDeSecao((pre.match(/Endpoint:[\s\S]*/) || [''])[0], 'api'), 'api'), anterior?.refsApi);
  l.refsUx = refsUx;
  l.refsApi = refsApi;
  r.origemSecoes = { ux: origemUx, api: origemApi };
  if (cods.has('C')) {
    const tela = (textoPorPapel.tela || '').trim();
    const end = (textoPorPapel.endpoint || '').trim();
    const temTela = tela && tela !== '—';
    const temRota = end && end !== '—' && !/^—/.test(end);
    const citaDecisao = (t) => /\bD-\d+\b/.test(t);
    if (temTela && !['linha', 'preâmbulo'].includes(origemUx) && !citaDecisao(telaPropria)) r.d58estrito.push('tela sem seção da UX na própria linha');
    if (temRota && !['linha', 'preâmbulo'].includes(origemApi) && !citaDecisao(endPropria)) r.d58estrito.push('rota sem seção da API na própria linha');
    if (temTela && !origemUx && !citaDecisao(telaPropria)) r.d58.push('tela sem seção da UX (nem herdada no bloco)');
    if (temRota && !origemApi && !citaDecisao(endPropria)) r.d58.push('rota sem seção da API (nem herdada no bloco)');
    const { fixos, termos } = termosDaLinha(l);
    const temTermo = (ref) => {
      const txt = ctx.docs.secoes[ref.doc].get(ref.sec);
      return !txt || !termos.length || termos.some((x) => norm(txt).includes(x));
    };
    const rotulo = (ref) => `${ref.doc.toUpperCase()} §${ref.sec}`;
    const sufixoTermo = fixos ? ` (${TERMOS[l.id].join(' / ')})` : '';
    for (const [origem, refs] of [[origemUx, temTela ? refsUx : []], [origemApi, temRota ? refsApi : []]]) {
      const unicas = [...new Map(refs.map((x) => [`${x.doc}:${x.sec}`, x])).values()];
      if (!unicas.length) continue;
      if (origem === 'linha') {
        // seção citada na própria linha: o termo precisa estar em CADA uma (D-58)
        for (const ref of unicas) if (!temTermo(ref)) r.d58.push(`${fixos ? 'termo' : 'nenhum termo da linha'} ausente em ${rotulo(ref)}${sufixoTermo}`);
      } else if (!unicas.some(temTermo)) {
        // seção do preâmbulo ou herdada: basta uma delas
        r.d58.push(`${fixos ? 'termo' : 'nenhum termo da linha'} ausente nas seções ${origem === 'herdada' ? 'herdadas' : 'do preâmbulo'} (${unicas.map(rotulo).join(', ')})${sufixoTermo}`);
      }
    }
  }
  if (cods.has('2d')) {
    const registrado = /login-portal\.spec\.js[^\n]*(✅|verde|aprovad)/i.test(ctx.docs.progresso) && /item 1a[^\n]*(✅|cumprid|entregue)/i.test(ctx.docs.progresso);
    r.pendente2d = !registrado;
  }
  r.ok = r.disco.length === 0 && r.referencias.length === 0;
  return r;
}

// ------------------------------------------------------------------
export async function conferir({ doc } = {}) {
  const docs = carregarDocumentos(doc);
  const blocos = lerMatriz(docs.indice);
  const montadas = await rotasMontadas();
  const normalizadas = [];
  for (const r of montadas.rotas) {
    const [met, ...resto] = r.split(' ');
    for (const v of expandirOpcionais(resto.join(' ').replace(/\{([^{}]*)\}/g, '($1)'))) normalizadas.push([met, normRota(v)]);
  }
  const disco = indiceDoDisco();
  const colecoes = colecoesDocumentadas(docs.indice);
  const colecoesSemUso = [...colecoes.todas].filter((c) => !disco.colecoesNoCodigo.has(c)
    && !new RegExp(`['"\`]${c}['"\`]`).test(disco.servidorTxt)).sort();
  const ctx = { docs, disco, rotas: { normalizadas }, colecoes };
  const linhas = [];
  for (const b of blocos) {
    let anterior = null;
    for (const l of b.linhas) { linhas.push(conferirLinha(l, b, ctx, anterior)); anterior = l; }
  }
  return { blocos, linhas, montadas, docs, colecoes, colecoesSemUso };
}

function resumo(res, { porLinha, linha }) {
  const { linhas, blocos, montadas } = res;
  const st = (c) => linhas.filter((l) => l.status.includes(c)).length;
  console.log('conferir-matriz · docs/dmc/PORTAL-ACADEMICO.md §4 contra o disco (D-58)');
  console.log(`  rotas montadas: ${montadas.rotas.size} (agregador: ${montadas.estado.carregados}/${montadas.estado.esperados} módulos, ${montadas.estado.falhas.length} falha(s), ${montadas.estado.ausentes.length} ausente(s); legado: ${montadas.legado})`);
  console.log(`  linhas: ${linhas.length} em ${blocos.length} blocos · C ${st('C')} · A ${st('A')} · R ${st('R')} · E1 ${st('E1')} · E2 ${st('E2')} · E3 ${st('E3')} · 2d ${st('2d')} · com lacuna ${linhas.filter((l) => l.status.some((c) => /^L/.test(c))).length}`);
  console.log(`  artefatos conferidos no disco: ${linhas.reduce((a, l) => a + l.verificados, 0)}`);
  const porBloco = {};
  for (const l of linhas) porBloco[l.bloco] = (porBloco[l.bloco] || 0) + 1;
  console.log(`  por bloco: ${Object.entries(porBloco).map(([b, n]) => `${b} ${n}`).join(' · ')}`);

  const disco = linhas.filter((l) => l.disco.length);
  const refs = linhas.filter((l) => l.referencias.length);
  const d58 = linhas.filter((l) => l.d58.length);
  const so = linhas.filter((l) => l.soExcecao);
  const p2d = linhas.filter((l) => l.pendente2d);
  const lac = linhas.filter((l) => l.status.some((c) => /^L/.test(c)));
  console.log(`\n1. DISCO — ${disco.length ? `REPROVADO: ${disco.length} linha(s)` : 'ok: toda tela, rota, arquivo, global, classe e coleção citados existem'}`);
  for (const l of disco) for (const d of l.disco) console.log(`  ${l.id.padEnd(7)} ${d}`);
  console.log(`\n2. REFERÊNCIAS — ${refs.length ? `REPROVADO: ${refs.length} linha(s)` : 'ok: seções, decisões, DC, lacunas e fatias citadas existem'}`);
  for (const l of refs) for (const d of l.referencias) console.log(`  ${l.id.padEnd(7)} ${d}`);
  const comp = linhas.filter((l) => l.componentes.length);
  const compAusentes = comp.filter((l) => l.componentes.some((c) => c.includes('AUSENTE')));
  console.log(`\n   coleções documentadas (§8.1 + db.js): ${res.colecoes.todas.size}; sem uso no servidor: ${res.colecoesSemUso.join(', ') || 'nenhuma'}`);
  console.log(`\n2b. COMPONENTES pf-* (nome do catálogo da UX × classe no código; informativo) — ${comp.length} linha(s) com nome diferente, ${compAusentes.length} sem equivalente`);
  for (const l of comp) for (const c of l.componentes) console.log(`  ${l.id.padEnd(7)} ${c}`);
  console.log(`\n3. EXCEÇÕES DO CEO — ${so.length} linha(s) só com exceção: ${so.map((l) => `${l.id} (${l.status.join('·')})`).join(', ') || '—'}`);
  console.log(`   linhas com exceção ao lado de entrega: ${linhas.filter((l) => !l.soExcecao && l.status.some((c) => /^E/.test(c))).map((l) => l.id).join(', ') || '—'}`);
  console.log(`\n4. "C · 2d" — ${p2d.length ? `pendente da 2d (sem o item 1a de §9.9 registrado em PROGRESS.md): ${p2d.map((l) => l.id).join(', ')}` : 'nenhuma pendente'}`);
  console.log(`\n5. LACUNAS citadas — ${lac.map((l) => `${l.id} (${l.status.filter((c) => /^L/.test(c)).join(', ')})`).join(', ') || '—'}`);
  const estrito = linhas.filter((l) => l.d58estrito.length);
  console.log(`\n6. D-58 (documental; não reprova) — leitura estrita (seção na própria linha ou no preâmbulo): ${estrito.length} linha(s) C sem seção própria (${estrito.filter((l) => l.d58estrito.some((d) => d.includes('UX'))).length} de tela, ${estrito.filter((l) => l.d58estrito.some((d) => d.includes('API'))).length} de rota); com a seção herdada da linha anterior do bloco: ${d58.length} linha(s) com problema`);
  const tipos = {};
  for (const l of d58) for (const d of l.d58) { const k = d.replace(/ §[\d.]+.*$/, ' §…'); tipos[k] = (tipos[k] || 0) + 1; }
  for (const [k, n] of Object.entries(tipos)) console.log(`  ${n} × ${k}`);
  for (const l of d58) console.log(`  ${l.id.padEnd(7)} ${l.d58.join('; ')}`);
  const avisos = linhas.filter((l) => l.avisos.length);
  if (avisos.length) {
    console.log(`\navisos (${avisos.reduce((a, l) => a + l.avisos.length, 0)}):`);
    for (const l of avisos) for (const a of l.avisos) console.log(`  ${l.id.padEnd(7)} ${a}`);
  }
  if (porLinha) {
    console.log('\nlinha a linha:');
    for (const l of linhas) console.log(`  ${l.ok ? 'ok ' : 'NÃO'} ${l.id.padEnd(7)} [${l.status.join('·')}] ${l.verificados} artefato(s)${l.d58.length ? ` · D-58: ${l.d58.length}` : ''}`);
  }
  if (linha) {
    const l = linhas.find((x) => x.id === linha);
    console.log(l ? `\n${JSON.stringify(l, null, 2)}` : `\nlinha ${linha} não encontrada`);
  }
  const reprova = disco.length + refs.length;
  console.log(`\nRESULTADO: ${reprova ? `REPROVADO — ${disco.length} linha(s) com artefato ausente, ${refs.length} com referência inválida` : 'LIMPO (disco e referências)'} · D-58: ${d58.length} linha(s) · pendentes da 2d: ${p2d.length}`);
  return reprova ? 1 : 0;
}

const executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDireto) {
  const args = process.argv.slice(2);
  const valor = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  let codigo = 2;
  try {
    const res = await conferir({ doc: valor('--doc') ? path.resolve(valor('--doc')) : undefined });
    codigo = resumo(res, { porLinha: args.includes('--linhas'), linha: valor('--linha') });
    const json = valor('--json');
    if (json) {
      fs.mkdirSync(path.dirname(path.resolve(json)), { recursive: true });
      fs.writeFileSync(path.resolve(json), JSON.stringify({
        geradoEm: new Date().toISOString(),
        rotasMontadas: [...res.montadas.rotas].sort(),
        linhas: res.linhas,
      }, null, 2) + '\n');
    }
  } catch (err) {
    console.error(`conferir-matriz: ${err.stack || err.message}`);
  }
  process.exit(codigo);
}
