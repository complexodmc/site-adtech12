// =============================================================
// COMPLEXO DMC · Portal — RAG do regulamento (PURO)
// PORTAL-API §6.10.5 · índice §8.2 item 6 (mini-portão P1: F6a → F6b),
// DC-70, D-81 · dono: F6a.
//
// fatiar(texto[, { edicao }]) → [{ id, titulo, texto, inicio, fim }]
//   - títulos de seção: linha com '#', 'CAPÍTULO', 'Seção', 'Art.',
//     '1.' / '1.1' (linha curta);
//   - cada seção vira um ou mais trechos de 300–1.500 caracteres,
//     cortados no FIM de parágrafo (parágrafo maior que 1.500 é
//     cortado no fim de frase ou de linha; em último caso, no limite);
//   - invariante: texto.slice(inicio, fim) === trecho.texto;
//   - id: 'e<edicao>-t<nnn>' com `edicao`; sem ela, 't<nnn>'.
//
// recuperar(consulta, trechos, k = 3[, { chave }]) → trechos[]
//   - BM25 (k1 1,2 · b 0,75) sobre título + texto, sem acento,
//     stopwords PT e radical leve; devolve os PRÓPRIOS objetos
//     recebidos (campos extras preservados, ex. `regulamentoId`, D-81),
//     do mais relevante ao menos, só os com pontuação > 0;
//   - índice memorizado por identidade do array (WeakMap) e, com
//     `chave` (ex. `${regulamentoId}:${edicao}`), num cache pequeno.
//
// Sem E/S, sem dependência de banco: a F6b importa este arquivo.
// =============================================================

export const TAMANHO_MIN = 300;
export const TAMANHO_MAX = 1500;
export const K1 = 1.2;
export const B = 0.75;

const TITULO_MAX = 140;

// ---------- títulos de seção ----------
const RE_TITULO = [
  /^\s{0,3}#{1,6}\s+\S/,                       // # Título (markdown mínimo do editor)
  /^\s*CAP[ÍI]TULO\b/i,                        // CAPÍTULO I
  /^\s*SE[ÇC][ÃA]O\b/i,                        // Seção II
  /^\s*Art(?:igo)?\.?\s*\d+/i,                 // Art. 5º
  /^\s*\d{1,3}(?:\.\d{1,3})+\.?\s+\S/,         // 1.1 Frequência
  /^\s*\d{1,3}[.)]\s+\S/                       // 1. Matrícula
];

/** A linha é título de seção? (linha curta que casa com um dos padrões) */
export function ehTitulo(linha) {
  if (typeof linha !== 'string') return false;
  const s = linha.trim();
  if (!s || s.length > 120) return false;
  return RE_TITULO.some(re => re.test(s));
}

/** Texto do título: sem '#', espaços colapsados, até 140 caracteres. */
export function limparTitulo(linha) {
  const s = String(linha ?? '').replace(/^\s{0,3}#{1,6}\s+/, '').replace(/\s+/g, ' ').trim();
  return s.length > TITULO_MAX ? `${s.slice(0, TITULO_MAX - 1).trimEnd()}…` : s;
}

// ---------- parágrafos com posição ----------
/** Blocos separados por linha em branco: [{ inicio, fim }] (fim sem as quebras finais). */
function paragrafos(texto) {
  const out = [];
  const re = /\r?\n[ \t\r]*\n(?:[ \t\r]*\n)*/g; // uma ou mais linhas em branco
  let pos = 0;
  const empurrar = (ini, fimBruto) => {
    let i = ini;
    let f = fimBruto;
    while (i < f && /\s/.test(texto[i])) i++;
    while (f > i && /\s/.test(texto[f - 1])) f--;
    if (f > i) out.push({ inicio: i, fim: f });
  };
  let m;
  while ((m = re.exec(texto)) !== null) {
    empurrar(pos, m.index);
    pos = m.index + m[0].length;
  }
  empurrar(pos, texto.length);
  return out;
}

/** Primeira linha (com posição) de um bloco. */
function primeiraLinha(texto, bloco) {
  const fimLinha = texto.indexOf('\n', bloco.inicio);
  const f = fimLinha < 0 || fimLinha > bloco.fim ? bloco.fim : fimLinha;
  return { texto: texto.slice(bloco.inicio, f), fim: f };
}

/** Corta um bloco maior que TAMANHO_MAX em pedaços ≤ TAMANHO_MAX (fim de frase, de linha ou limite). */
function cortarBlocoLongo(texto, bloco) {
  const pedacos = [];
  let ini = bloco.inicio;
  while (bloco.fim - ini > TAMANHO_MAX) {
    const janela = texto.slice(ini, ini + TAMANHO_MAX);
    let corte = -1;
    for (const re of [/\n/g, /[.!?;:](?=\s)/g]) {
      let m;
      let ultimo = -1;
      while ((m = re.exec(janela)) !== null) if (m.index + 1 >= TAMANHO_MIN) ultimo = m.index + 1;
      if (ultimo > 0) { corte = ultimo; break; }
    }
    if (corte <= 0) {
      const espaco = janela.lastIndexOf(' ');
      corte = espaco >= TAMANHO_MIN ? espaco : TAMANHO_MAX;
    }
    let f = ini + corte;
    while (f > ini && /\s/.test(texto[f - 1])) f--;
    pedacos.push({ inicio: ini, fim: f });
    ini = ini + corte;
    while (ini < bloco.fim && /\s/.test(texto[ini])) ini++;
  }
  if (bloco.fim > ini) pedacos.push({ inicio: ini, fim: bloco.fim });
  return pedacos;
}

/**
 * Divide o texto publicado em trechos consultáveis.
 * @param {string} texto
 * @param {{ edicao?: number }} [opcoes]
 * @returns {{ id:string, titulo:string, texto:string, inicio:number, fim:number }[]}
 */
export function fatiar(texto, opcoes = {}) {
  if (typeof texto !== 'string' || !texto.trim()) return [];
  const edicao = Number.isInteger(opcoes?.edicao) && opcoes.edicao > 0 ? opcoes.edicao : null;

  // 1) Seções: começam em bloco cuja primeira linha é título.
  const secoes = [];
  for (const bloco of paragrafos(texto)) {
    const linha = primeiraLinha(texto, bloco);
    if (ehTitulo(linha.texto) || !secoes.length) {
      const titulo = ehTitulo(linha.texto) ? limparTitulo(linha.texto) : null;
      secoes.push({ titulo, blocos: [bloco] });
    } else {
      secoes[secoes.length - 1].blocos.push(bloco);
    }
  }

  // 2) Trechos: blocos da seção acumulados até 300–1.500 caracteres, corte no fim de parágrafo.
  const trechos = [];
  for (const secao of secoes) {
    const blocos = secao.blocos.flatMap(b => (b.fim - b.inicio > TAMANHO_MAX ? cortarBlocoLongo(texto, b) : [b]));
    const tituloBase = secao.titulo || limparTitulo(primeiraLinha(texto, blocos[0]).texto.slice(0, 80));
    let atual = null;
    let parte = 0;
    const fechar = () => {
      if (!atual) return;
      parte++;
      trechos.push({ titulo: parte === 1 ? tituloBase : `${tituloBase} (continuação)`, inicio: atual.inicio, fim: atual.fim });
      atual = null;
    };
    for (const b of blocos) {
      if (atual && b.fim - atual.inicio > TAMANHO_MAX && atual.fim - atual.inicio >= TAMANHO_MIN) fechar();
      else if (atual && b.fim - atual.inicio > TAMANHO_MAX) fechar(); // pedaço curto + bloco grande: não passa do teto
      atual = atual ? { inicio: atual.inicio, fim: b.fim } : { inicio: b.inicio, fim: b.fim };
    }
    fechar();
  }

  return trechos.map((t, i) => {
    const n = String(i + 1).padStart(3, '0');
    return {
      id: edicao ? `e${edicao}-t${n}` : `t${n}`,
      titulo: t.titulo,
      texto: texto.slice(t.inicio, t.fim),
      inicio: t.inicio,
      fim: t.fim
    };
  });
}

// ---------- termos ----------
const STOPWORDS = new Set((
  'a o as os um uma uns umas de do da dos das d em no na nos nas num numa por pelo pela pelos pelas para pra pro ' +
  'com sem sob sobre ate apos entre que qual quais quem cujo cuja e ou nem mas se ao aos a as e eh ser sao foi ' +
  'era sera estar esta estao esse essa esses essas este estes estas isso isto aquele aquela aquilo como mais menos ' +
  'muito muita muitos muitas meu minha meus minhas seu sua seus suas teu tua nosso nossa eu voce voces ele ela eles ' +
  'elas me mim te lhe lhes nos vos quando onde ja nao sim tem ter ha havia quanto quanta tambem so ainda entao ' +
  'pois porque porque ser deve devem pode podem sera tudo todo toda todos todas cada outro outra outros outras'
).split(/\s+/));

/** Sem acento, minúsculas. */
function semAcento(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Radical leve: plural e vogal temática final (frequência/frequencia, mínima/mínimo → 'minim'). */
export function radical(t) {
  let s = t;
  if (s.length <= 3 || /^\d+$/.test(s)) return s;
  if (s.endsWith('coes')) s = `${s.slice(0, -4)}cao`;
  else if (s.endsWith('oes') || s.endsWith('aes')) s = `${s.slice(0, -3)}ao`;
  else if (s.endsWith('ais')) s = `${s.slice(0, -3)}al`;
  else if (s.endsWith('eis') && s.length > 5) s = `${s.slice(0, -3)}el`;
  else if (s.endsWith('ns')) s = `${s.slice(0, -2)}m`;
  else if (/(r|z|s)es$/.test(s) && s.length > 5) s = s.slice(0, -2);
  else if (s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.endsWith('mente') && s.length > 8) s = s.slice(0, -5);
  if (s.length > 4 && /[aoe]$/.test(s)) s = s.slice(0, -1);
  return s;
}

/** Texto → termos (sem acento, sem stopwords, radical leve). */
export function termos(texto) {
  const out = [];
  for (const bruto of semAcento(texto).split(/[^a-z0-9]+/)) {
    if (!bruto || bruto.length < 2 || STOPWORDS.has(bruto)) continue;
    out.push(radical(bruto));
  }
  return out;
}

// ---------- BM25 ----------
function construirIndice(trechos) {
  const docs = trechos.map((t) => {
    const lista = [...termos(t?.titulo), ...termos(t?.titulo), ...termos(t?.texto)]; // título pesa 2×
    const tf = new Map();
    for (const termo of lista) tf.set(termo, (tf.get(termo) || 0) + 1);
    return { tf, tamanho: lista.length };
  });
  const df = new Map();
  for (const d of docs) for (const termo of d.tf.keys()) df.set(termo, (df.get(termo) || 0) + 1);
  const media = docs.length ? docs.reduce((s, d) => s + d.tamanho, 0) / docs.length : 0;
  return { docs, df, media, n: docs.length };
}

const indicesPorArray = new WeakMap();
const indicesPorChave = new Map();
const MAX_CHAVES = 50;

function indiceDe(trechos, chave) {
  if (chave) {
    const c = indicesPorChave.get(chave);
    if (c && c.trechos === trechos) return c.indice;
  }
  let indice = indicesPorArray.get(trechos);
  if (!indice) {
    indice = construirIndice(trechos);
    indicesPorArray.set(trechos, indice);
  }
  if (chave) {
    if (indicesPorChave.size >= MAX_CHAVES) indicesPorChave.delete(indicesPorChave.keys().next().value);
    indicesPorChave.set(chave, { trechos, indice });
  }
  return indice;
}

/**
 * Os k trechos mais relevantes para a consulta (BM25), do mais ao menos relevante.
 * Devolve os PRÓPRIOS objetos recebidos (campos extras preservados — D-81).
 * @param {string} consulta
 * @param {object[]} trechos [{ titulo, texto, … }]
 * @param {number} [k=3]
 * @param {{ chave?: string }} [opcoes] chave do cache (ex. `${regulamentoId}:${edicao}`)
 */
export function recuperar(consulta, trechos, k = 3, opcoes = {}) {
  if (!Array.isArray(trechos) || !trechos.length) return [];
  const q = [...new Set(termos(consulta))];
  if (!q.length) return [];
  const limite = Number.isInteger(k) && k > 0 ? k : 3;
  const { docs, df, media, n } = indiceDe(trechos, typeof opcoes?.chave === 'string' ? opcoes.chave : null);
  const pontos = docs.map((d, i) => {
    let s = 0;
    for (const termo of q) {
      const f = d.tf.get(termo);
      if (!f) continue;
      const nq = df.get(termo) || 0;
      const idf = Math.log(1 + (n - nq + 0.5) / (nq + 0.5));
      s += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (media ? d.tamanho / media : 1))));
    }
    return { i, s };
  });
  return pontos
    .filter(p => p.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limite)
    .map(p => trechos[p.i]);
}
