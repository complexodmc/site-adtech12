// =============================================================
// Cache-busting da plataforma EAD: `?v=` = 8 primeiros hexadecimais do SHA-256 do arquivo.
//
// Fonte: docs/dmc/PORTAL-ACADEMICO.md §6.5 e §8.2 item 3. Escrito pela F0r; APLICADO só pela
// sessão principal, no G2 (operação mecânica revisada, idempotente e com dry-run). Na fase 1
// todas as fatias escrevem `?v=dev`, que este script troca pelo hash.
//
// O que reescreve (e nada além do valor de `v`):
//   1. Nos .js da plataforma (fora de js/vendor/* e dos arquivos da 2d): literais de caminho
//      local com `?v=` — ex.: const QR_JS = 'js/portal/qr.js?v=dev' — e a constante
//      VERSAO_TOUR do shell.js, par de CAMINHO_TOUR (tour.js sob demanda, §6.5).
//   2. Nas páginas da raiz da plataforma (nunca login.html nem login-classico.html): todo
//      <script src> e <link href> de .js/.css local dentro de plataforma-ead/, com ou sem `?v=`.
//      Ficam como estão: ../assets/css/tokens.css?v=1 e components.css?v=3 (esquema do site),
//      imagens, URLs de outra origem e âncoras.
//   Como um .js pode citar o hash de outro, a etapa 1 repete até estabilizar; depois a etapa 2
//   usa os hashes finais (o mesmo arquivo tem o mesmo `?v=` em todas as páginas).
//
// Uso (a partir da raiz do repositório):
//   node tests/tools/versionar-ead.mjs              → DRY-RUN (padrão): lista o que mudaria
//   node tests/tools/versionar-ead.mjs --aplicar    → grava (principal, G2)
//   node tests/tools/versionar-ead.mjs --verificar  → saída 1 se algo ainda mudaria (ou se há
//                                                    referência a arquivo inexistente)
//   opções: --raiz <dir> (outra cópia da plataforma-ead) · --resumo (sem a lista linha a linha)
// Saída: 0 ok · 1 (--verificar) há mudança pendente · 2 erro (arquivo citado não existe).
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { RAIZ_EAD, PAGINAS_2D, donoDe, DONO_2D } from './posse-ead.mjs';

/** 8 primeiros hexadecimais do SHA-256 (conteúdo em bytes). */
export function hash8(conteudo) {
  return crypto.createHash('sha256').update(conteudo).digest('hex').slice(0, 8);
}

/** Caminho do arquivo citado, relativo a plataforma-ead/, ou null se não for asset local versionável. */
export function alvoVersionavel(url, { deArquivo = '' } = {}) {
  if (typeof url !== 'string' || !url) return null;
  const limpo = url.trim();
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(limpo)) return null; // outra origem, data:, mailto:, âncora
  const semQuery = limpo.split('#')[0].split('?')[0];
  if (!/\.(?:js|css)$/i.test(semQuery)) return null;
  const base = path.posix.dirname(deArquivo.split(path.sep).join('/'));
  const rel = path.posix.normalize(path.posix.join(base === '.' ? '' : base, semQuery));
  if (!rel || rel.startsWith('../') || rel.startsWith('/')) return null; // fora da plataforma (ex.: ../assets/css/tokens.css)
  return rel;
}

function arquivosJs(raiz) {
  const saida = [];
  const andar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) andar(abs);
      else if (e.name.endsWith('.js')) saida.push(path.relative(raiz, abs).split(path.sep).join('/'));
    }
  };
  andar(path.join(raiz, 'js'));
  return saida.filter((c) => !c.startsWith('js/vendor/') && donoDe(c) !== DONO_2D).sort();
}

function paginas(raiz) {
  return fs.readdirSync(raiz).filter((n) => n.endsWith('.html') && !PAGINAS_2D.includes(n)).sort();
}

const RE_LITERAL_JS = /(['"`])((?:\.\/)?(?:js|css)\/[\w./-]+\.(?:js|css))\?v=([\w.-]+)\1/g;
const RE_VERSAO_TOUR = /(const\s+VERSAO_TOUR\s*=\s*)(['"])([\w.-]*)\2/;
const RE_CAMINHO_TOUR = /const\s+CAMINHO_TOUR\s*=\s*(['"])([^'"]+)\1/;
const RE_TAG = /<(script|link)\b[^>]*>/gi;

/**
 * Planeja a versão de toda a plataforma (sem gravar).
 * Devolve { arquivos: Map<caminho, conteúdoNovo>, mudancas: [{ arquivo, de, para, alvo }], erros: [] }.
 */
export function planejar({ raiz = RAIZ_EAD } = {}) {
  const conteudo = new Map(); // caminho → texto atual (possivelmente já reescrito em memória)
  const ler = (c) => {
    if (!conteudo.has(c)) conteudo.set(c, fs.readFileSync(path.join(raiz, c), 'utf8'));
    return conteudo.get(c);
  };
  const existe = (c) => fs.existsSync(path.join(raiz, c));
  const erros = [];
  const mudancas = [];
  const hashDe = (c) => hash8(Buffer.from(ler(c), 'utf8'));

  // Etapa 1 — literais nos .js, até estabilizar.
  const js = arquivosJs(raiz);
  for (let volta = 0; volta < 10; volta++) {
    let mudou = false;
    for (const c of js) {
      const antes = ler(c);
      let depois = antes.replace(RE_LITERAL_JS, (m, q, ref, v) => {
        const alvo = alvoVersionavel(ref, { deArquivo: 'pagina.html' }); // literais são relativos à página
        if (!alvo || !existe(alvo)) { if (alvo) erros.push(`${c}: cita ${ref}, que não existe`); return m; }
        const h = hashDe(alvo);
        if (h !== v) mudancas.push({ arquivo: c, de: `${ref}?v=${v}`, para: `${ref}?v=${h}`, alvo });
        return `${q}${ref}?v=${h}${q}`;
      });
      const caminhoTour = (depois.match(RE_CAMINHO_TOUR) || [])[2];
      if (caminhoTour && RE_VERSAO_TOUR.test(depois)) {
        const alvo = alvoVersionavel(caminhoTour, { deArquivo: 'pagina.html' });
        if (!alvo || !existe(alvo)) erros.push(`${c}: CAMINHO_TOUR ${caminhoTour} não existe`);
        else {
          const h = hashDe(alvo);
          depois = depois.replace(RE_VERSAO_TOUR, (m, pre, q, v) => {
            if (v !== h) mudancas.push({ arquivo: c, de: `VERSAO_TOUR = '${v}'`, para: `VERSAO_TOUR = '${h}'`, alvo });
            return `${pre}${q}${h}${q}`;
          });
        }
      }
      if (depois !== antes) { conteudo.set(c, depois); mudou = true; }
    }
    if (!mudou) break;
    if (volta === 9) erros.push('literais dos .js não estabilizaram em 10 voltas (referência circular?)');
  }
  // Mudanças repetidas pelas voltas: fica a última de cada (arquivo, alvo).
  const ultima = new Map();
  for (const m of mudancas) ultima.set(`${m.arquivo}|${m.alvo}|${m.de.split('?')[0]}`, m);

  // Etapa 2 — páginas.
  const daPagina = [];
  for (const p of paginas(raiz)) {
    const antes = ler(p);
    const depois = antes.replace(RE_TAG, (tag, nome) => {
      const atributo = nome.toLowerCase() === 'script' ? 'src' : 'href';
      if (nome.toLowerCase() === 'link' && !/\brel\s*=\s*["']?(?:stylesheet|modulepreload|preload)\b/i.test(tag)) return tag;
      const re = new RegExp(`(\\b${atributo}\\s*=\\s*)(["'])([^"']+)\\2`, 'i');
      const m = tag.match(re);
      if (!m) return tag;
      const url = m[3].replace(/&amp;/g, '&');
      const alvo = alvoVersionavel(url, { deArquivo: p });
      if (!alvo) return tag;
      if (!existe(alvo)) { erros.push(`${p}: cita ${url}, que não existe`); return tag; }
      const h = hashDe(alvo);
      const semV = url.replace(/([?&])v=[^&#]*(&|$)/, (x, a, b) => (b ? a : '')).replace(/[?&]$/, '');
      const sep = semV.includes('?') ? '&' : '?';
      const novo = `${semV}${sep}v=${h}`;
      if (novo === url) return tag;
      daPagina.push({ arquivo: p, de: url, para: novo, alvo });
      return tag.replace(re, `$1$2${novo.replace(/&/g, '&amp;').replace(/&amp;amp;/g, '&amp;')}$2`);
    });
    if (depois !== antes) conteudo.set(p, depois);
  }

  const arquivos = new Map();
  for (const [c, t] of conteudo) {
    if (t !== fs.readFileSync(path.join(raiz, c), 'utf8')) arquivos.set(c, t);
  }
  return { arquivos, mudancas: [...ultima.values(), ...daPagina], erros };
}

function principal(args) {
  const iRaiz = args.indexOf('--raiz');
  const raiz = iRaiz >= 0 ? path.resolve(args[iRaiz + 1]) : RAIZ_EAD;
  const aplicar = args.includes('--aplicar');
  const verificar = args.includes('--verificar');
  const resumo = args.includes('--resumo');
  const { arquivos, mudancas, erros } = planejar({ raiz });
  const modo = aplicar ? 'APLICAR' : verificar ? 'VERIFICAR (não grava)' : 'DRY-RUN (não grava)';
  console.log(`versionar-ead · ${modo}`);
  console.log(`  raiz: ${raiz.replace(/[\\/]+$/, "")}${path.sep}`);
  if (!resumo) for (const m of mudancas) console.log(`  ${m.arquivo}: ${m.de} → ${m.para}`);
  for (const e of erros) console.log(`  ERRO: ${e}`);
  console.log(`resumo: ${mudancas.length} referência(s) a trocar em ${arquivos.size} arquivo(s) · ${erros.length} erro(s)`);
  if (erros.length) return 2;
  if (aplicar) {
    for (const [c, t] of arquivos) fs.writeFileSync(path.join(raiz, c), t);
    const segunda = planejar({ raiz });
    if (segunda.arquivos.size) { console.log(`ERRO: não idempotente (${segunda.arquivos.size} arquivo(s) mudariam de novo)`); return 2; }
    console.log(`gravado: ${arquivos.size} arquivo(s); segunda passada sem mudança (idempotente).`);
    return 0;
  }
  if (verificar) return arquivos.size ? 1 : 0;
  console.log('nada foi gravado (dry-run).');
  return 0;
}

const executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDireto) process.exit(principal(process.argv.slice(2)));
