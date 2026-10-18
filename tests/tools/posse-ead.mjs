// =============================================================
// POSSE da plataforma EAD: caminho de `complexodmc.com.br/plataforma-ead/**` → fatia.
//
// Fonte: docs/dmc/PORTAL-ACADEMICO.md §8.1 (tabela de posse), copiada à mão pela F0r.
// Mudança de posse = pedido escrito à F0r via principal (§6.1); nunca edição direta.
//
// Quem usa (D-62, D-73):
//   - server/test/front-estatico.test.js (modos QA_FATIA / QA_ESTRITO);
//   - tests/e2e/_portal.js → monitorarConsoleERede (404 de asset de fatia não integrada);
//   - tests/tools/cabecalho-ead.mjs (recusa páginas da sessão 2d).
//
// Uso como script (confere a cópia contra o documento e contra o disco):
//   node tests/tools/posse-ead.mjs             → confere; arquivo sem dono no disco = aviso
//   node tests/tools/posse-ead.mjs --estrito   → arquivo sem dono no disco reprova (G2)
//   node tests/tools/posse-ead.mjs --listar F0r → lista os caminhos da fatia
// Saída 0 = cópia fiel (e, com --estrito, disco todo com dono); 1 = divergência.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Prefixo dos caminhos de front no repositório (POSSE usa caminhos relativos a ele). */
export const PREFIXO_EAD = 'complexodmc.com.br/plataforma-ead/';
export const RAIZ_EAD = path.join(RAIZ_REPO, PREFIXO_EAD);

/** As 19 fatias de §8.1, na ordem da tabela. */
export const FATIAS = Object.freeze([
  'F0a', 'F0m', 'F0t', 'F0b', 'F0s', 'F0p', 'F0r', 'F1a', 'F1b', 'F2',
  'F3a', 'F3b', 'F4a', 'F4b', 'F5', 'F6a', 'F6b', 'F7', 'F8',
]);
/** Donos que não são fatia: arquivos da sessão 2d (proibidos a todas) e "ninguém" (sem mudança prevista). */
export const DONO_2D = '2d';
export const DONO_NINGUEM = 'ninguem';

// Arquivos de front por dono (só os de plataforma-ead/**; as fatias só de servidor — F0a, F0m, F0t,
// F1a — não têm entrada). Chaves `{…}` de §8.1 já expandidas.
const POR_DONO = {
  F0b: [
    'index.html',
    'js/api-client.js', 'js/app.js',
    'js/portal/pre-pintura.js', 'js/portal/ui.js', 'js/portal/qr.js', 'js/portal/boot-index.js',
    'js/vendor/qrcode-generator/qrcode.js', 'js/vendor/qrcode-generator/LICENSE',
  ],
  F0s: ['js/shell.js', 'js/portal/tour.js', 'css/portal.css'],
  F0p: [
    'perfil.html', 'meus-dados.html', 'notificacoes.html', 'busca.html', 'acesso-link.html',
    'js/portal/perfil.js', 'js/portal/meus-dados.js', 'js/portal/notificacoes.js', 'js/portal/busca.js',
    'js/portal/acesso-link.js',
  ],
  F0r: [
    'loja.html', 'obrigado.html', 'tutoriais.html',
    'js/portal/boot-loja.js', 'js/portal/boot-obrigado.js', 'js/portal/tutoriais.js',
    'css/plataforma.css',
  ],
  F1b: [
    'dashboard.html', 'meus-cursos.html', 'aula.html',
    'js/portal/estudos-dados.js', 'js/portal/inicio.js', 'js/portal/meus-cursos.js', 'js/portal/player.js',
    'js/portal/video.js', 'js/portal/prof-conteudo.js',
    'css/portal-estudos.css',
  ],
  F2: ['js/portal/avaliacao.js', 'js/portal/prof-avaliacoes.js', 'css/portal-avaliacao.css'],
  F3a: [
    'ao-vivo.html', 'academico.html', 'comprovantes.html',
    'js/portal/academico.js', 'js/portal/ao-vivo.js', 'js/portal/comprovantes.js', 'js/portal/prof-academico.js',
    'css/portal-academico.css',
  ],
  F3b: [
    'certificados.html', 'certificado.html', 'validar.html', 'declaracao.html',
    'js/portal/declaracoes.js', 'js/portal/validar.js', 'js/portal/declaracao.js', 'js/portal/prof-certificacao.js',
    'css/portal-declaracoes.css',
  ],
  F4a: ['js/portal/prof-secretaria.js', 'css/portal-secretaria.css'],
  F4b: [
    'documentos.html', 'contratos.html', 'contrato.html',
    'js/portal/documentos.js', 'js/portal/contratos.js', 'js/portal/contrato.js', 'js/portal/prof-documentos.js',
    'css/portal-documentos.css',
  ],
  F5: ['financeiro.html', 'js/portal/financeiro.js', 'js/portal/prof-financeiro.js', 'css/portal-financeiro.css'],
  F6a: [
    'atendimentos.html', 'ouvidoria.html', 'regulamento.html',
    'js/portal/atendimentos.js', 'js/portal/ouvidoria.js', 'js/portal/regulamento.js',
    'js/portal/prof-atendimento.js', 'js/portal/prof-configuracoes.js',
    'css/portal-atendimento.css',
  ],
  F6b: ['assistente.html', 'js/portal/assistente.js', 'js/portal/prof-ia.js', 'css/portal-assistente.css'],
  F7: [
    'publicacoes.html', 'publicacao.html',
    'js/portal/publicacoes.js', 'js/portal/publicacao.js', 'js/portal/prof-comunicacao.js',
    'js/portal/prof-relatorios.js',
    'css/portal-comunicacao.css',
  ],
  F8: [
    'professor.html', 'admin.html', 'parcerias.html',
    'js/portal/professor.js', 'js/portal/prof-visao.js', 'js/portal/prof-turmas.js', 'js/portal/prof-alunos.js',
    'js/portal/prof-duvidas.js', 'js/portal/prof-equipe.js', 'js/portal/boot-admin.js',
    'js/admin.js', 'js/parcerias-admin.js',
    'css/portal-professor.css', 'css/parcerias-admin.css',
  ],
  [DONO_2D]: ['login.html', 'login-classico.html', 'css/business-school.css', 'js/business-school.js'],
  [DONO_NINGUEM]: ['js/data.js', 'js/loja.js', 'js/eixo-3d.js', 'css/login.css'],
};

/** Pastas inteiras (prefixo → dono). §8.1, linha "Ninguém": `js/login/*` e `js/vendor/three/*`. */
export const POSSE_PASTAS = Object.freeze({
  'js/login/': DONO_NINGUEM,
  'js/vendor/three/': DONO_NINGUEM,
});

/** Caminho (relativo a plataforma-ead/) → dono. */
export const POSSE = Object.freeze(Object.fromEntries(
  Object.entries(POR_DONO).flatMap(([dono, lista]) => lista.map((c) => [c, dono])),
));

/** Páginas da sessão 2d: nenhuma ferramenta da plataforma as reescreve. */
export const PAGINAS_2D = Object.freeze(POR_DONO[DONO_2D].filter((c) => c.endsWith('.html')));

/**
 * Normaliza caminho de arquivo ou URL para a chave de POSSE (relativa a plataforma-ead/).
 * Aceita: 'js/app.js', './js/app.js?v=dev', '/plataforma-ead/js/app.js',
 * 'http://127.0.0.1:4631/plataforma-ead/css/portal.css?v=1#x',
 * 'complexodmc.com.br/plataforma-ead/login.html' e caminho absoluto do disco.
 * Devolve null para o que está fora da plataforma (ex.: ../assets/css/tokens.css).
 */
export function normalizarCaminho(caminhoOuUrl) {
  if (typeof caminhoOuUrl !== 'string' || !caminhoOuUrl) return null;
  let c = caminhoOuUrl.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(c)) {
    try { c = new URL(c).pathname; } catch { return null; }
  }
  c = c.split('#')[0].split('?')[0];
  try { c = decodeURIComponent(c); } catch { /* mantém como veio */ }
  c = c.replace(/\\/g, '/');
  const absRaiz = RAIZ_EAD.replace(/\\/g, '/');
  if (c.startsWith(absRaiz)) return c.slice(absRaiz.length) || null;
  const marca = '/plataforma-ead/';
  const i = c.indexOf(marca);
  if (i >= 0) c = c.slice(i + marca.length);
  else if (c.startsWith('plataforma-ead/')) c = c.slice('plataforma-ead/'.length);
  else if (c.startsWith('/')) return null; // caminho de site fora da plataforma
  c = path.posix.normalize(c).replace(/^\.\//, '');
  if (!c || c === '.' || c.startsWith('../')) return null;
  return c;
}

/** Dono do arquivo: 'F0b'…'F8', '2d', 'ninguem' ou null (sem dono em §8.1). */
export function donoDe(caminhoOuUrl) {
  const c = normalizarCaminho(caminhoOuUrl);
  if (!c) return null;
  if (Object.hasOwn(POSSE, c)) return POSSE[c];
  for (const [pasta, dono] of Object.entries(POSSE_PASTAS)) if (c.startsWith(pasta)) return dono;
  return null;
}

/** Caminhos (relativos a plataforma-ead/) de um dono; pastas aparecem com a barra final. */
export function arquivosDaFatia(dono) {
  const arquivos = Object.entries(POSSE).filter(([, d]) => d === dono).map(([c]) => c);
  const pastas = Object.entries(POSSE_PASTAS).filter(([, d]) => d === dono).map(([p]) => p);
  return [...arquivos, ...pastas];
}

// ------------------------------------------------------------------
// Conferência contra o documento e o disco (só quando rodado como script)
// ------------------------------------------------------------------

/** Expande chaves `{a,b}` (vários grupos, sem aninhamento), como em §8.1. */
export function expandirChaves(s) {
  const m = s.match(/\{([^{}]*)\}/);
  if (!m) return [s];
  const antes = s.slice(0, m.index);
  const depois = s.slice(m.index + m[0].length);
  return m[1].split(',').flatMap((parte) => expandirChaves(antes + parte.trim() + depois));
}

/** É caminho de front (relativo a plataforma-ead/)? Os de servidor, testes, site e raiz ficam de fora. */
function ehCaminhoDeFront(c) {
  return /^(js|css)\/\S+$/.test(c) || /^[a-z0-9-]+\.html$/.test(c);
}

/** Lê §8.1 do índice e devolve { posse: {caminho: dono}, pastas: {prefixo: dono}, repetidos: [] }. */
export function lerPosseDoDocumento(arquivoDoc = path.join(RAIZ_REPO, 'docs/dmc/PORTAL-ACADEMICO.md')) {
  const texto = fs.readFileSync(arquivoDoc, 'utf8');
  const ini = texto.indexOf('### 8.1');
  const fim = texto.indexOf('### 8.2', ini);
  if (ini < 0 || fim < 0) throw new Error(`§8.1 não encontrada em ${arquivoDoc}`);
  const posse = {};
  const pastas = {};
  const repetidos = [];
  for (const linha of texto.slice(ini, fim).split('\n')) {
    if (!linha.startsWith('| **')) continue;
    const celulas = linha.split('|');
    const rotulo = celulas[1] || '';
    const id = (rotulo.match(/\*\*([^*]+)\*\*/) || [])[1] || '';
    let dono;
    if (FATIAS.includes(id)) dono = id;
    else if (/^Proibidos/i.test(id)) dono = DONO_2D;
    else if (/^Ningu/i.test(id)) dono = DONO_NINGUEM;
    else continue; // "Principal" não é fatia e não é dona de arquivo de front (§8.1)
    const arquivos = celulas.slice(2).join('|');
    for (const [, crase] of arquivos.matchAll(/`([^`]+)`/g)) {
      for (const c of expandirChaves(crase.trim())) {
        if (!ehCaminhoDeFront(c)) continue;
        if (c.endsWith('/*')) { pastas[c.slice(0, -1)] = dono; continue; }
        if (Object.hasOwn(posse, c) && posse[c] !== dono) repetidos.push(`${c}: ${posse[c]} e ${dono}`);
        posse[c] = dono;
      }
    }
  }
  return { posse, pastas, repetidos };
}

/** Arquivos .html/.css/.js (e LICENSE) de plataforma-ead/ no disco, relativos a ela. */
export function arquivosNoDisco(raiz = RAIZ_EAD) {
  const saida = [];
  const andar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) andar(abs);
      else if (/\.(html|css|js|mjs)$/.test(e.name) || e.name === 'LICENSE') {
        saida.push(path.relative(raiz, abs).split(path.sep).join('/'));
      }
    }
  };
  if (fs.existsSync(raiz)) andar(raiz);
  return saida.sort();
}

function conferir({ estrito }) {
  const problemas = [];
  const avisos = [];
  const doc = lerPosseDoDocumento();
  for (const r of doc.repetidos) problemas.push(`§8.1 põe o mesmo caminho em dois donos: ${r}`);
  for (const [c, dono] of Object.entries(doc.posse)) {
    if (!Object.hasOwn(POSSE, c)) problemas.push(`falta em POSSE: ${c} (§8.1: ${dono})`);
    else if (POSSE[c] !== dono) problemas.push(`dono divergente: ${c} — POSSE ${POSSE[c]}, §8.1 ${dono}`);
  }
  for (const c of Object.keys(POSSE)) {
    if (!Object.hasOwn(doc.posse, c)) problemas.push(`sobra em POSSE (não está em §8.1): ${c}`);
  }
  for (const [p, dono] of Object.entries(doc.pastas)) {
    if (POSSE_PASTAS[p] !== dono) problemas.push(`pasta divergente: ${p} — POSSE ${POSSE_PASTAS[p] ?? 'ausente'}, §8.1 ${dono}`);
  }
  for (const p of Object.keys(POSSE_PASTAS)) {
    if (!Object.hasOwn(doc.pastas, p)) problemas.push(`pasta sobrando em POSSE_PASTAS: ${p}`);
  }

  const disco = arquivosNoDisco();
  const semDono = disco.filter((c) => donoDe(c) === null);
  for (const c of semDono) (estrito ? problemas : avisos).push(`no disco sem dono em POSSE: ${c}`);

  const porDono = {};
  for (const d of Object.values(POSSE)) porDono[d] = (porDono[d] || 0) + 1;
  const paginas = Object.keys(POSSE).filter((c) => c.endsWith('.html'));
  const modulos = Object.keys(POSSE).filter((c) => c.endsWith('.js'));
  const presentes = disco.filter((c) => donoDe(c) !== null).length;

  console.log('posse-ead · conferência de POSSE contra docs/dmc/PORTAL-ACADEMICO.md §8.1 e o disco');
  console.log(`  caminhos em POSSE: ${Object.keys(POSSE).length} + ${Object.keys(POSSE_PASTAS).length} pastas`);
  console.log(`  páginas: ${paginas.length} (${paginas.filter((c) => POSSE[c] !== DONO_2D).length} com dono entre as fatias + ${PAGINAS_2D.length} da 2d)`);
  console.log(`  arquivos .js: ${modulos.length} (fatias: ${modulos.filter((c) => FATIAS.includes(POSSE[c])).length})`);
  console.log(`  por dono: ${Object.entries(porDono).map(([d, n]) => `${d} ${n}`).join(' · ')}`);
  console.log(`  no disco: ${disco.length} arquivos, ${presentes} com dono, ${semDono.length} sem dono`);
  for (const a of avisos) console.log(`  aviso: ${a}`);
  for (const p of problemas) console.log(`  ERRO: ${p}`);
  console.log(problemas.length ? `REPROVADO (${problemas.length})` : 'OK: POSSE igual a §8.1');
  return problemas.length ? 1 : 0;
}

const executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDireto) {
  const args = process.argv.slice(2);
  const iListar = args.indexOf('--listar');
  if (iListar >= 0) {
    const dono = args[iListar + 1];
    if (!dono || (!FATIAS.includes(dono) && dono !== DONO_2D && dono !== DONO_NINGUEM)) {
      console.error(`uso: --listar <${FATIAS.join('|')}|${DONO_2D}|${DONO_NINGUEM}>`);
      process.exit(2);
    }
    for (const c of arquivosDaFatia(dono)) console.log(c);
    process.exit(0);
  }
  process.exit(conferir({ estrito: args.includes('--estrito') }));
}
