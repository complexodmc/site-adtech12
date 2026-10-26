// =============================================================
// COMPLEXO DMC · Portal — arquivos (binários no Mongo, coleção `arquivos`)
// PORTAL-API §1.6, §3.3 (arquivos), §4.12 · dono: F0m.
//
// - Tipo SEMPRE pelos bytes (o Content-Type do cliente é ignorado).
// - PDF com conteúdo ativo é recusado na entrada (filtro); a barreira
//   principal continua sendo a entrega: attachment + CSP sandbox +
//   nosniff (§1.6).
// - Foto, banner e capa perdem os metadados (EXIF/XMP/IPTC/texto);
//   documentos NÃO são alterados (o hash é evidência).
// - Entrega sem IDOR: `ler`/`metadados` exigem o filtro do contexto (e do
//   dono) no MESMO find; sem filtro é erro de programação.
// - Nada vai ao disco (funciona na Vercel); o nome original enviado não
//   é guardado: `nomeDownload` é gerado pelo chamador, sem dado pessoal.
// =============================================================
import express from 'express';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { Binary, ObjectId } from 'mongodb';
import { ErroPortal } from './erros.js';
import { ID_RE } from './validacao.js';

const MIB = 1024 * 1024;

export const TIPOS_ARQUIVO = Object.freeze({ pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' });
export const CONTEXTOS_ARQUIVO = Object.freeze(['material', 'foto_perfil', 'documento', 'contrato', 'segunda_via', 'publicacao_pdf', 'banner', 'tcc', 'capa']);
const CHAVES_REF = Object.freeze(['cursoId', 'moduloId', 'materialId', 'entidadeId']);
const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const comoBuffer = v => (Buffer.isBuffer(v) ? v : v instanceof Binary ? Buffer.from(v.buffer) : v instanceof Uint8Array ? Buffer.from(v) : null);

// =============================================================
// Detecção de tipo
// =============================================================
/** 'pdf' | 'jpg' | 'png' | 'webp' | null, só pelos bytes iniciais. */
export function detectarTipo(buf) {
  const b = comoBuffer(buf);
  if (!b || b.length < 4) return null;
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 8 && b.subarray(0, 8).equals(ASSINATURA_PNG)) return 'png';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

// =============================================================
// PDF com conteúdo ativo (filtro de entrada)
// =============================================================
// Tudo aqui é LINEAR no tamanho do arquivo (G2 · DoS algorítmico, CWE-407): uma passada de
// tokenização, dicionários disjuntos, tetos de streams, de filtros por stream e de bytes
// descomprimidos. Um corpo de 4 MiB termina em fração de segundo, qualquer que seja o formato.
const MARCADORES_ATIVOS = Object.freeze([
  'Encrypt', 'JavaScript', 'JS', 'Launch', 'EmbeddedFile', 'RichMedia', 'XFA', 'SubmitForm', 'ImportData', 'GoToR', 'GoToE', 'Rendition'
]);
// Espaço do PDF (ISO 32000 tabela 1): NUL, HT, LF, FF, CR e espaço. NÃO é o `\s` do JS (que não
// tem o NUL e tem o 0xA0): '/Launch\0' é o nome /Launch para o leitor.
const ESPACO_PDF = '\\x00\\t\\n\\f\\r ';
const FIM_DE_NOME = `(?=[${ESPACO_PDF}/<>\\[\\]()%{}]|$)`;
// Cada letra do marcador pode vir escrita como '#xx' dentro do nome ('/J#61vaScript' é /JavaScript);
// a expressão casa o nome cru — sem normalizar o texto antes, sem uma chamada por '#' — e só quando o
// nome termina num delimitador ou espaço do PDF (pega /JS, não /JSfoo nem /JS#20).
const hexDe = c => c.charCodeAt(0).toString(16).padStart(2, '0').split('').map(d => (/[a-f]/.test(d) ? `[${d}${d.toUpperCase()}]` : d)).join('');
const padraoDoNome = nome => nome.split('').map(c => `(?:${c}|#${hexDe(c)})`).join('');
const marcadoresRe = lista => new RegExp(`/(${lista.map(padraoDoNome).join('|')})${FIM_DE_NOME}`);
const MARCADOR_RE = marcadoresRe(MARCADORES_ATIVOS);
// Marcadores de 5 letras ou mais: procurados no arquivo INTEIRO, inclusive nos dados de stream que
// não são abertos (imagem, fonte) — por acaso, em dado binário, a chance é desprezível; assim nada
// que um leitor tolerante reconstrua como objeto fica fora da varredura.
const MARCADOR_LONGO_RE = marcadoresRe(MARCADORES_ATIVOS.filter(m => m.length >= 5));
const NOME_PDF_RE = new RegExp(`/[^${ESPACO_PDF}/<>\\[\\]()%{}]+`, 'g');

const LIMITE_STREAMS = 10_000;   // acima disso: recusado ('estrutura'); nos 411 PDFs reais conferidos na G2, o maior tinha 725
const LIMITE_SUSPEITOS = 1_000;  // 'stream' fora da estrutura (comentário, string): acima disso, 'estrutura'
const LIMITE_FILTROS = 8;        // filtros encadeados num stream
const JANELA_SUSPEITO = 1024;    // texto examinado antes de um 'stream' fora da estrutura

const ESPACO = new Uint8Array(256);
for (const c of [0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]) ESPACO[c] = 1;
const DELIM = new Uint8Array(256);
for (const c of '()<>[]{}/%') DELIM[c.charCodeAt(0)] = 1;
const BYTES_ENDSTREAM = Buffer.from('endstream', 'latin1');

/** Decodifica '#xx' dentro dos nomes PDF ('/J#61vaScript' → '/JavaScript'). Texto em latin1. */
export function normalizarNomesPdf(texto) {
  if (!texto.includes('#')) return texto;
  return texto.replace(NOME_PDF_RE, nome => (nome.includes('#') ? decodificarNome(nome) : nome));
}

function marcadorEm(texto, re = MARCADOR_RE) {
  const m = re.exec(texto);
  return m ? decodificarNome(m[1]) : null;
}

const ativo = motivo => ({ ativo: true, motivo });

// ---------- léxico mínimo (texto latin1; código de caractere = byte) ----------
function pularBrancos(s, i) {
  const n = s.length;
  for (;;) {
    while (i < n && ESPACO[s.charCodeAt(i)]) i++;
    if (i < n && s.charCodeAt(i) === 0x25) { // % comentário até o fim da linha
      while (i < n && s.charCodeAt(i) !== 0x0a && s.charCodeAt(i) !== 0x0d) i++;
      continue;
    }
    return i;
  }
}

function fimRegular(s, i) {
  const n = s.length;
  while (i < n && !ESPACO[s.charCodeAt(i)] && !DELIM[s.charCodeAt(i)]) i++;
  return i;
}

/** Fim (exclusivo) da string literal que abre em i: parênteses aninhados, '\' escapa o byte seguinte. */
function fimString(s, i) {
  const n = s.length;
  let prof = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 0x5c) { i += 2; continue; }
    i++;
    if (c === 0x28) prof++;
    else if (c === 0x29 && --prof === 0) return i;
  }
  return n;
}

function fimHex(s, i) {
  const j = s.indexOf('>', i + 1);
  return j < 0 ? s.length : j + 1;
}

const INTEIRO_RE = /^\d+$/;

/** Fim (exclusivo) de UM objeto que começa em i (já sem brancos); referência 'N G R' conta como um. */
function fimObjeto(s, i) {
  const n = s.length;
  const c = s.charCodeAt(i);
  if (c === 0x2f) return fimRegular(s, i + 1);
  if (c === 0x28) return fimString(s, i);
  if ((c === 0x3c && s.charCodeAt(i + 1) === 0x3c) || c === 0x5b) {
    let prof = 0;
    while (i < n) {
      i = pularBrancos(s, i);
      if (i >= n) break;
      const x = s.charCodeAt(i);
      if (x === 0x3c && s.charCodeAt(i + 1) === 0x3c) { prof++; i += 2; }
      else if (x === 0x3e && s.charCodeAt(i + 1) === 0x3e) { prof--; i += 2; }
      else if (x === 0x5b) { prof++; i++; }
      else if (x === 0x5d) { prof--; i++; }
      else if (x === 0x28) i = fimString(s, i);
      else if (x === 0x3c) i = fimHex(s, i);
      else if (x === 0x2f) i = fimRegular(s, i + 1);
      else if (DELIM[x] || x === 0x3e) i++;
      else i = fimRegular(s, i);
      if (prof <= 0) return i;
    }
    return n;
  }
  if (c === 0x3c) return fimHex(s, i);
  if (DELIM[c] || c === 0x3e) return i + 1;
  const j = fimRegular(s, i);
  if (INTEIRO_RE.test(s.slice(i, j))) { // referência indireta?
    const k = pularBrancos(s, j);
    const k2 = fimRegular(s, k);
    if (k2 > k && INTEIRO_RE.test(s.slice(k, k2))) {
      const k3 = pularBrancos(s, k2);
      if (s.charCodeAt(k3) === 0x52 && fimRegular(s, k3) === k3 + 1) return k3 + 1;
    }
  }
  return j;
}

function decodificarNome(nome) {
  return nome.includes('#') ? nome.replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : nome;
}

/** Chaves do NÍVEL DE CIMA de um dicionário ('<< … >>') → Map(chave → [valor cru, …]). Chave repetida guarda todos. */
function lerChaves(dic) {
  const chaves = new Map();
  const n = dic.length;
  let i = 2;
  while (i < n) {
    i = pularBrancos(dic, i);
    if (i >= n) break;
    const c = dic.charCodeAt(i);
    if (c === 0x3e && dic.charCodeAt(i + 1) === 0x3e) break;
    if (c !== 0x2f) { i = fimObjeto(dic, i); continue; }
    const fimChave = fimRegular(dic, i + 1);
    const chave = decodificarNome(dic.slice(i + 1, fimChave));
    const v = pularBrancos(dic, fimChave);
    const fechou = v >= n || (dic.charCodeAt(v) === 0x3e && dic.charCodeAt(v + 1) === 0x3e);
    const fimValor = fechou ? v : fimObjeto(dic, v);
    if (!chaves.has(chave)) chaves.set(chave, []);
    chaves.get(chave).push(dic.slice(v, fimValor));
    i = Math.max(fimValor, fimChave);
  }
  return chaves;
}

/**
 * Tokeniza o arquivo: comentários, strings literais e hexadecimais ficam de fora; um stream só
 * começa com a palavra 'stream' logo depois do '>>' de um dicionário de nível 0 (fora de array).
 * @returns {{ streams: Array<{ dic:{ini:number,fim:number}, chave:number, ini:number, fim:number, fimBruto:number }>, excesso:boolean }}
 */
function tokenizarPdf(b) {
  const n = b.length;
  const streams = [];
  let i = 0;
  let prof = 0;
  let arr = 0;
  let dicIni = -1;
  let ultimoDic = null;
  while (i < n) {
    const c = b[i];
    if (ESPACO[c]) { i++; continue; }
    if (c === 0x25) { while (i < n && b[i] !== 0x0a && b[i] !== 0x0d) i++; continue; }
    if (c === 0x28) {
      let d = 0;
      while (i < n) { const x = b[i]; if (x === 0x5c) { i += 2; continue; } i++; if (x === 0x28) d++; else if (x === 0x29 && --d === 0) break; }
      ultimoDic = null; continue;
    }
    if (c === 0x3c) {
      if (b[i + 1] === 0x3c) { if (prof === 0) dicIni = i; prof++; i += 2; ultimoDic = null; continue; }
      i++; while (i < n && b[i] !== 0x3e) i++; i++;
      ultimoDic = null; continue;
    }
    if (c === 0x3e && b[i + 1] === 0x3e) {
      i += 2;
      if (prof > 0 && --prof === 0 && arr === 0) { ultimoDic = { ini: dicIni, fim: i }; continue; }
      ultimoDic = null; continue;
    }
    if (c === 0x5b) { if (prof === 0) arr++; i++; ultimoDic = null; continue; }
    if (c === 0x5d) { if (prof === 0 && arr > 0) arr--; i++; ultimoDic = null; continue; }
    if (c === 0x2f) { i++; while (i < n && !ESPACO[b[i]] && !DELIM[b[i]]) i++; ultimoDic = null; continue; }
    if (DELIM[c] || c === 0x3e) { i++; ultimoDic = null; continue; }
    const t0 = i;
    while (i < n && !ESPACO[b[i]] && !DELIM[b[i]]) i++;
    const ehStream = ultimoDic && i - t0 === 6 && b[t0] === 0x73 && b.toString('latin1', t0, i) === 'stream';
    const dic = ultimoDic;
    ultimoDic = null;
    if (!ehStream) continue;
    if (streams.length >= LIMITE_STREAMS) return { streams, excesso: true };
    let ini = i;
    while (ini < n && (b[ini] === 0x20 || b[ini] === 0x09)) ini++;
    if (b[ini] === 0x0d && b[ini + 1] === 0x0a) ini += 2;
    else if (b[ini] === 0x0a || b[ini] === 0x0d) ini++;
    const fimBruto = b.indexOf(BYTES_ENDSTREAM, ini);
    if (fimBruto < 0) { streams.push({ dic, chave: t0, ini, fim: n, fimBruto: -1 }); break; }
    let fim = fimBruto;
    if (b[fim - 1] === 0x0a) fim--;
    if (b[fim - 1] === 0x0d) fim--;
    streams.push({ dic, chave: t0, ini, fim: Math.max(ini, fim), fimBruto });
    i = fimBruto + BYTES_ENDSTREAM.length;
  }
  return { streams, excesso: false };
}

// ---------- filtros (cada um com teto de saída: passou → RangeError → 'compressao') ----------
function criarSaida(limite, estimativa) {
  let buf = Buffer.allocUnsafe(Math.max(1, Math.min(limite, Math.max(64, estimativa))));
  let k = 0;
  const crescer = () => {
    if (k >= limite) throw new RangeError('teto de saída do filtro');
    const novo = Buffer.allocUnsafe(Math.min(limite, buf.length * 2));
    buf.copy(novo, 0, 0, k);
    buf = novo;
  };
  return {
    byte(v) { if (k >= buf.length) crescer(); buf[k++] = v; },
    fim() { return buf.subarray(0, k); }
  };
}

function inflar(dados, limite) {
  return zlib.inflateSync(dados, { maxOutputLength: Math.max(1, limite), finishFlush: zlib.constants.Z_SYNC_FLUSH });
}

function deHex(dados, limite) {
  const s = criarSaida(limite, dados.length >> 1);
  let alto = -1;
  for (let i = 0; i < dados.length; i++) {
    const c = dados[i];
    if (c === 0x3e) break;
    if (ESPACO[c]) continue;
    const m = c | 0x20;
    let v;
    if (c >= 0x30 && c <= 0x39) v = c - 0x30;
    else if (m >= 0x61 && m <= 0x66) v = m - 0x57;
    else throw new Error('ASCIIHexDecode: caractere inválido');
    if (alto < 0) alto = v; else { s.byte((alto << 4) | v); alto = -1; }
  }
  if (alto >= 0) s.byte(alto << 4);
  return s.fim();
}

function de85(dados, limite) {
  const s = criarSaida(limite, dados.length);
  const g = [0, 0, 0, 0, 0];
  let q = 0;
  const emitir = (nBytes) => {
    let v = 0;
    for (let j = 0; j < 5; j++) v = v * 85 + g[j];
    if (v > 0xffffffff) throw new Error('ASCII85Decode: grupo inválido');
    for (let j = 0; j < nBytes; j++) s.byte(Math.floor(v / 2 ** (24 - 8 * j)) & 0xff);
  };
  for (let i = 0; i < dados.length; i++) {
    const c = dados[i];
    if (ESPACO[c]) continue;
    if (c === 0x7e) break; // '~>'
    if (c === 0x7a && q === 0) { for (let j = 0; j < 4; j++) s.byte(0); continue; }
    if (c < 0x21 || c > 0x75) throw new Error('ASCII85Decode: caractere inválido');
    g[q++] = c - 0x21;
    if (q === 5) { emitir(4); q = 0; }
  }
  if (q === 1) throw new Error('ASCII85Decode: grupo final incompleto');
  if (q > 1) { for (let j = q; j < 5; j++) g[j] = 84; emitir(q - 1); }
  return s.fim();
}

function deRunLength(dados, limite) {
  const s = criarSaida(limite, dados.length * 2);
  let i = 0;
  while (i < dados.length) {
    const l = dados[i++];
    if (l === 128) break;
    if (l < 128) { const fim = Math.min(dados.length, i + l + 1); while (i < fim) s.byte(dados[i++]); }
    else { if (i >= dados.length) break; const v = dados[i++]; for (let j = 0; j < 257 - l; j++) s.byte(v); }
  }
  return s.fim();
}

function deLzw(dados, limite, { earlyChange = 1 } = {}) {
  const pref = new Int16Array(4096);
  const suf = new Uint8Array(4096);
  const tam = new Uint16Array(4096);
  for (let k = 0; k < 256; k++) { pref[k] = -1; suf[k] = k; tam[k] = 1; }
  const pilha = new Uint8Array(4097);
  const s = criarSaida(limite, dados.length * 3);
  let largura = 9;
  let prox = 258;
  let ant = -1;
  let acum = 0;
  let bits = 0;
  const escrever = (cod) => { // string do código na pilha; devolve o tamanho
    let c = cod;
    const p = tam[cod];
    for (let q = p - 1; q >= 0; q--) { pilha[q] = suf[c]; c = pref[c]; }
    return p;
  };
  for (let i = 0; i < dados.length; i++) {
    acum = ((acum << 8) | dados[i]) & 0xffffff;
    bits += 8;
    while (bits >= largura) {
      bits -= largura;
      const cod = (acum >>> bits) & ((1 << largura) - 1);
      if (cod === 256) { largura = 9; prox = 258; ant = -1; continue; }
      if (cod === 257) return s.fim();
      let p;
      if (cod < prox) p = escrever(cod);
      else if (cod === prox && ant >= 0) { p = escrever(ant); pilha[p] = pilha[0]; p++; }
      else throw new Error('LZWDecode: código inválido');
      for (let q = 0; q < p; q++) s.byte(pilha[q]);
      if (ant >= 0 && prox < 4096) {
        pref[prox] = ant; suf[prox] = pilha[0]; tam[prox] = tam[ant] + 1; prox++;
        if (prox + earlyChange >= (1 << largura) && largura < 12) largura++;
      }
      ant = cod;
    }
  }
  return s.fim();
}

const DECODIFICADORES = Object.freeze({
  FlateDecode: inflar, ASCIIHexDecode: deHex, ASCII85Decode: de85, RunLengthDecode: deRunLength, LZWDecode: deLzw
});
// Abreviações que os leitores aceitam também fora de imagem inline.
const ALIAS_FILTRO = Object.freeze({ Fl: 'FlateDecode', AHx: 'ASCIIHexDecode', A85: 'ASCII85Decode', LZW: 'LZWDecode', RL: 'RunLengthDecode', CCF: 'CCITTFaxDecode', DCT: 'DCTDecode', JPX: 'JPXDecode' });
// Saída é imagem (pixels), nunca objeto PDF.
const FILTROS_IMAGEM = new Set(['DCTDecode', 'JPXDecode', 'CCITTFaxDecode', 'JBIG2Decode']);

/** Valor de /Filter → lista de nomes; null = não dá para saber (referência, repetido, item que não é nome, longa demais). */
function lerCadeia(valores) {
  if (!valores) return [];
  if (valores.length !== 1) return null;
  const v = valores[0];
  if (v === 'null') return [];
  const nomes = [];
  let i = 0;
  if (v.charCodeAt(0) === 0x2f) { nomes.push(v.slice(1)); }
  else if (v.charCodeAt(0) === 0x5b) {
    i = 1;
    for (;;) {
      i = pularBrancos(v, i);
      if (i >= v.length) return null;
      const c = v.charCodeAt(i);
      if (c === 0x5d) break;
      if (c !== 0x2f) return null;
      const f = fimRegular(v, i + 1);
      nomes.push(v.slice(i + 1, f));
      i = f;
    }
  } else return null;
  if (nomes.length > LIMITE_FILTROS) return null;
  return nomes.map(x => { const d = decodificarNome(x); return ALIAS_FILTRO[d] || d; });
}

const PREDITOR_RE = new RegExp(`/Predictor${FIM_DE_NOME}`, 'g');
const PREDITOR_UM_RE = new RegExp(`/Predictor[${ESPACO_PDF}]+1(?![0-9.])`, 'g');
const EARLY_ZERO_RE = new RegExp(`/EarlyChange[${ESPACO_PDF}]+0(?![0-9.])`);
const REF_RE = /^\d+[\x00\t\n\f\r ]+\d+[\x00\t\n\f\r ]+R$/;

/** /DecodeParms: o preditor (PNG/TIFF) muda os bytes depois do filtro; se houver (ou se não der para ver), true. */
function temPreditor(valores) {
  if (!valores) return false;
  for (const v0 of valores) {
    const v = normalizarNomesPdf(v0);
    if (REF_RE.test(v)) return true;
    const todos = (v.match(PREDITOR_RE) || []).length;
    const triviais = (v.match(PREDITOR_UM_RE) || []).length;
    if (todos !== triviais) return true;
  }
  return false;
}

function nomeEm(valores, ...aceitos) {
  return !!valores && valores.some(v => aceitos.includes(decodificarNome(v.trim())));
}

function classificarStream(dicTexto) {
  const k = lerChaves(dicTexto);
  const objStm = nomeEm(k.get('Type'), '/ObjStm') || (k.has('N') && k.has('First')) || k.has('Extends');
  const cadeia = lerCadeia(k.get('Filter'));
  const binario = nomeEm(k.get('Subtype'), '/Image', '/Type1C', '/CIDFontType0C', '/OpenType')
    || k.has('Length1') || k.has('Alternate')
    || (cadeia !== null && cadeia.some(f => FILTROS_IMAGEM.has(f)));
  const parms = k.get('DecodeParms');
  const earlyChange = parms && parms.some(v => EARLY_ZERO_RE.test(normalizarNomesPdf(v))) ? 0 : 1;
  const comprimento = k.get('Length')?.length === 1 && INTEIRO_RE.test(k.get('Length')[0]) ? Number(k.get('Length')[0]) : null;
  return { objStm, cadeia, binario, preditor: temPreditor(parms), earlyChange, comprimento };
}

const OBJSTM_JANELA_RE = new RegExp(`/(ObjStm|Extends)${FIM_DE_NOME}`);
const N_RE = new RegExp(`/N${FIM_DE_NOME}`);
const FIRST_RE = new RegExp(`/First${FIM_DE_NOME}`);

/**
 * Procura conteúdo ativo num PDF (filtro de entrada; a entrega sandbox é a barreira principal).
 * 1. arquivo inteiro: marcadores de 5 letras ou mais em qualquer ponto (também escritos com '#xx');
 * 2. tokenização (comentário, string e hex não abrem stream; 'stream' só depois do '>>' de um
 *    dicionário); fora dos dados dos streams: todos os marcadores; 'stream' fora da estrutura com
 *    cara de object stream → 'objstm-ilegivel';
 * 3. cada stream: cadeia INTEIRA de filtros (Flate, ASCIIHex, ASCII85, LZW, RunLength, com as
 *    abreviações) aplicada com teto total e razão máxima (bomba → 'compressao'); object stream
 *    (/Type /ObjStm, ou /N + /First) que não dá para abrir → 'objstm-ilegivel'; filtro
 *    desconhecido em stream que não é imagem → 'filtro-desconhecido'; mais de 10.000 streams →
 *    'estrutura';
 * 4. marcadores: /Encrypt /JavaScript /JS /Launch /EmbeddedFile /RichMedia /XFA /SubmitForm
 *    /ImportData /GoToR /GoToE /Rendition (as ações perigosas de /AA e /OpenAction usam esses
 *    mesmos nomes em /S; um /OpenAction só de navegação, ex. [página /Fit], passa).
 * Streams de dado binário (imagem, programa de fonte, perfil ICC) não são descomprimidos: não
 * carregam objetos PDF e só gerariam falso positivo. A razão só conta acima de `minimoParaRazao`.
 * @returns {{ ativo:boolean, motivo:string|null }}
 */
export function pdfTemConteudoAtivo(buf, { tetoDescomprimido = 16 * MIB, razaoMaxima = 100, minimoParaRazao = MIB } = {}) {
  const b = comoBuffer(buf);
  if (!b || !b.length) return { ativo: false, motivo: null };
  const texto = b.toString('latin1');

  const longo = marcadorEm(texto, MARCADOR_LONGO_RE);
  if (longo) return ativo(longo);

  const { streams, excesso } = tokenizarPdf(b);
  if (excesso) return ativo('estrutura');
  const info = streams.map(s => ({ ...s, ...classificarStream(texto.slice(s.dic.ini, s.dic.fim)) }));
  // Dado que o leitor NÃO trata como stream (depois de um /Length direto menor) volta para a varredura de fora.
  for (const s of info) s.corte = s.fimBruto < 0 ? -1 : (s.comprimento !== null && s.ini + s.comprimento < s.fim ? s.ini + s.comprimento : s.fimBruto);

  // Arquivo cru fora dos dados dos streams (dicionários, objetos, comentários, strings, trailer).
  let fora = '';
  let pos = 0;
  for (const s of info) { if (s.corte < 0) break; fora += texto.slice(pos, s.ini) + ' '; pos = s.corte; }
  fora += texto.slice(pos);
  const noCru = marcadorEm(fora);
  if (noCru) return ativo(noCru);

  // 'stream' fora da estrutura (em comentário, string, dicionário aninhado…): um leitor com outro
  // léxico pode abri-lo; se o texto antes tem cara de object stream, na dúvida, recusa.
  const reStream = /stream(?:\r\n|\n|\r)/g;
  let suspeitos = 0;
  let k = 0;
  let m;
  while ((m = reStream.exec(texto))) {
    const idx = m.index;
    while (k < info.length && info[k].corte >= 0 && info[k].corte <= idx) k++;
    const s = info[k];
    if (s && s.chave === idx) continue;
    if (s && s.corte >= 0 && idx >= s.ini) { reStream.lastIndex = s.corte; continue; }
    if (texto.slice(Math.max(0, idx - 3), idx) === 'end') continue;
    if (++suspeitos > LIMITE_SUSPEITOS) return ativo('estrutura');
    const antes = k > 0 && info[k - 1].corte >= 0 ? info[k - 1].corte : 0;
    const bruta = texto.slice(Math.max(antes, idx - JANELA_SUSPEITO), idx);
    const j = bruta.lastIndexOf('obj'); // janela limitada: o lastIndexOf é sobre no máximo 1 KiB
    const janela = normalizarNomesPdf(j >= 0 ? bruta.slice(j) : bruta);
    if (OBJSTM_JANELA_RE.test(janela) || (N_RE.test(janela) && FIRST_RE.test(janela))) return ativo('objstm-ilegivel');
  }

  let total = 0;
  for (const s of info) {
    if (s.fimBruto < 0) { if (s.objStm) return ativo('objstm-ilegivel'); continue; }
    const { objStm, cadeia, binario } = s;
    if (objStm) {
      if (!cadeia || cadeia.some(f => !DECODIFICADORES[f]) || s.preditor) return ativo('objstm-ilegivel');
    } else {
      if (binario) continue;
      if (!cadeia || cadeia.some(f => !DECODIFICADORES[f])) return ativo('filtro-desconhecido');
    }
    const dados = b.subarray(s.ini, s.fim);
    if (!cadeia.length) {
      const mm = marcadorEm(texto.slice(s.ini, s.fim));
      if (mm) return ativo(mm);
      continue;
    }
    if (tetoDescomprimido - total <= 0) return ativo('compressao');
    const limite = Math.min(tetoDescomprimido - total, Math.max(minimoParaRazao, dados.length * razaoMaxima));
    let saida = dados;
    try {
      for (const f of cadeia) {
        saida = DECODIFICADORES[f](saida, limite, { earlyChange: s.earlyChange });
        total += saida.length;
        if (total > tetoDescomprimido) return ativo('compressao');
      }
    } catch (err) {
      if (err instanceof RangeError || err?.code === 'ERR_BUFFER_TOO_LARGE') return ativo('compressao');
      if (objStm) return ativo('objstm-ilegivel');
      continue; // stream corrompido que não abre: o conteúdo fica de fora (o dicionário já foi varrido)
    }
    if (saida.length > minimoParaRazao && saida.length / Math.max(1, dados.length) > razaoMaxima) return ativo('compressao');
    const mm = marcadorEm(saida.toString('latin1'));
    if (mm) return ativo(mm);
  }
  return { ativo: false, motivo: null };
}

// =============================================================
// Metadados de imagem
// =============================================================
function imagemInvalida() {
  return new ErroPortal(415, 'tipo-de-arquivo', 'Imagem corrompida ou em formato não aceito.');
}

function limparJpeg(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw imagemInvalida();
  const partes = [b.subarray(0, 2)];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw imagemInvalida();
    let j = i;
    while (j < b.length && b[j] === 0xff) j++; // bytes de preenchimento
    if (j >= b.length) throw imagemInvalida();
    const marcador = b[j];
    if (marcador === 0xd9) { partes.push(Buffer.from([0xff, 0xd9])); return Buffer.concat(partes); }
    if ((marcador >= 0xd0 && marcador <= 0xd7) || marcador === 0x01) { partes.push(Buffer.from([0xff, marcador])); i = j + 1; continue; }
    if (j + 3 > b.length) throw imagemInvalida();
    const tam = b.readUInt16BE(j + 1);
    const fim = j + 1 + tam;
    if (tam < 2 || fim > b.length) throw imagemInvalida();
    if (marcador === 0xda) { partes.push(Buffer.from([0xff]), b.subarray(j)); return Buffer.concat(partes); } // SOS: o resto vai inteiro
    // APP1 (Exif/XMP), APP13 (IPTC/Photoshop) e COM saem; APP0, APP2 (ICC), APP14 e o resto ficam.
    if (marcador !== 0xe1 && marcador !== 0xed && marcador !== 0xfe) partes.push(Buffer.from([0xff]), b.subarray(j, fim));
    i = fim;
  }
  throw imagemInvalida();
}

const CHUNKS_PNG_REMOVIDOS = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME']);

function limparPng(b) {
  if (b.length < 8 || !b.subarray(0, 8).equals(ASSINATURA_PNG)) throw imagemInvalida();
  const partes = [b.subarray(0, 8)];
  let i = 8;
  let fimEncontrado = false;
  while (i < b.length) {
    if (i + 12 > b.length) throw imagemInvalida();
    const tam = b.readUInt32BE(i);
    const tipo = b.subarray(i + 4, i + 8).toString('latin1');
    const fim = i + 12 + tam;
    if (fim > b.length) throw imagemInvalida();
    if (!CHUNKS_PNG_REMOVIDOS.has(tipo)) partes.push(b.subarray(i, fim));
    i = fim;
    if (tipo === 'IEND') { fimEncontrado = true; break; }
  }
  if (!fimEncontrado) throw imagemInvalida();
  return Buffer.concat(partes);
}

function limparWebp(b) {
  if (b.length < 12 || b.subarray(0, 4).toString('latin1') !== 'RIFF' || b.subarray(8, 12).toString('latin1') !== 'WEBP') throw imagemInvalida();
  const limite = Math.min(b.length, 8 + b.readUInt32LE(4));
  const chunks = [];
  let i = 12;
  while (i + 8 <= limite) {
    const tipo = b.subarray(i, i + 4).toString('latin1');
    const tam = b.readUInt32LE(i + 4);
    if (i + 8 + tam > limite) throw imagemInvalida();
    const fim = Math.min(limite, i + 8 + tam + (tam % 2));
    if (tipo !== 'EXIF' && tipo !== 'XMP ') chunks.push(Buffer.from(b.subarray(i, fim)));
    i = fim;
  }
  if (!chunks.length) throw imagemInvalida();
  for (const c of chunks) {
    if (c.subarray(0, 4).toString('latin1') === 'VP8X' && c.length > 8) c[8] &= ~(0x08 | 0x04); // flags EXIF e XMP
  }
  const corpo = Buffer.concat([Buffer.from('WEBP', 'latin1'), ...chunks]);
  const cab = Buffer.alloc(8);
  cab.write('RIFF', 0, 'latin1');
  cab.writeUInt32LE(corpo.length, 4);
  return Buffer.concat([cab, corpo]);
}

/**
 * Remove metadados: JPEG APP1/APP13/COM; PNG tEXt/iTXt/zTXt/eXIf/tIME; WebP EXIF/XMP (+ flags do VP8X).
 * Estrutura inválida → ErroPortal 415 `tipo-de-arquivo`.
 */
export function removerMetadadosImagem(buf, tipo) {
  const b = comoBuffer(buf);
  if (!b) throw imagemInvalida();
  if (tipo === 'jpg') return limparJpeg(b);
  if (tipo === 'png') return limparPng(b);
  if (tipo === 'webp') return limparWebp(b);
  throw new TypeError(`removerMetadadosImagem: tipo sem tratamento (${String(tipo)}).`);
}

// =============================================================
// Entrada (corpo cru) — [parser, verificador]
// =============================================================
/**
 * @param {{ limiteBytes:number, tipos:string[], recusarPdfAtivo?:boolean }} opcoes
 * @returns {[Function, Function]} express.raw + verificador; req.arquivo = { buf, tipo }.
 *   415 `tipo-de-arquivo` (vazio ou tipo fora da lista) · 415 `pdf-ativo` · 413 `arquivo-grande` (pelo parser).
 */
export function lerCorpoBinario({ limiteBytes, tipos, recusarPdfAtivo = true } = {}) {
  if (!(limiteBytes > 0)) throw new TypeError('lerCorpoBinario: informe limiteBytes.');
  if (!Array.isArray(tipos) || !tipos.length || tipos.some(t => !Object.hasOwn(TIPOS_ARQUIVO, t))) throw new TypeError('lerCorpoBinario: tipos inválidos.');
  const parser = express.raw({ type: () => true, limit: limiteBytes });
  function verificarArquivo(req, _res, next) {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return next(new ErroPortal(415, 'tipo-de-arquivo'));
    const tipo = detectarTipo(buf);
    if (!tipo || !tipos.includes(tipo)) return next(new ErroPortal(415, 'tipo-de-arquivo'));
    if (tipo === 'pdf' && recusarPdfAtivo && pdfTemConteudoAtivo(buf).ativo) return next(new ErroPortal(415, 'pdf-ativo'));
    req.arquivo = { buf, tipo };
    return next();
  }
  return [parser, verificarArquivo];
}

// =============================================================
// Repositório e entrega
// =============================================================
/** Nome de download seguro (sem dado pessoal: quem chama gera), com a extensão do tipo. */
export function nomeDeDownload(nome, tipo) {
  const ext = Object.hasOwn(TIPOS_ARQUIVO, tipo) ? tipo : 'bin';
  let base = String(nome ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 80);
  if (!base) base = 'arquivo';
  return `${base}.${ext}`;
}

function tipoDoMime(mime) {
  return Object.keys(TIPOS_ARQUIVO).find(k => TIPOS_ARQUIVO[k] === mime) || null;
}

function idDe(id) {
  if (id instanceof ObjectId) return id;
  const s = id === null || id === undefined ? '' : String(id);
  return ID_RE.test(s) ? new ObjectId(s) : null;
}

function conferirFiltro(filtro) {
  if (!filtro || typeof filtro !== 'object' || Array.isArray(filtro)) throw new TypeError('arquivos: filtro obrigatório ({ contexto, …dono }).');
  if (!CONTEXTOS_ARQUIVO.includes(filtro.contexto)) throw new TypeError('arquivos: filtro sem contexto válido.');
  if (Object.hasOwn(filtro, '_id') || Object.hasOwn(filtro, 'dados')) throw new TypeError('arquivos: o filtro não leva _id nem dados.');
}

function saidaDe(doc, comDados) {
  if (!doc) return null;
  const out = {
    id: String(doc._id), contexto: doc.contexto, donoUserId: doc.donoUserId ?? null, ref: doc.ref || {},
    nomeDownload: doc.nomeDownload, mime: doc.mime, tamanho: doc.tamanho, sha256: doc.sha256,
    criadoEm: doc.criadoEm ?? null, criadoPor: doc.criadoPor ?? null
  };
  if (comDados) out.dados = comoBuffer(doc.dados);
  return out;
}

/**
 * @param {{ repo: (nome: string) => object, agora?: () => Date }} deps
 */
export function criarArquivos({ repo, agora = () => new Date() } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarArquivos: informe repo(nome).');
  const colecao = () => repo('arquivos');

  async function salvar({ contexto, donoUserId = null, ref = {}, buf, tipo, nomeDownload, por = null } = {}) {
    if (!CONTEXTOS_ARQUIVO.includes(contexto)) throw new TypeError(`arquivos.salvar: contexto inválido (${String(contexto)}).`);
    const b = comoBuffer(buf);
    if (!b || !b.length) throw new TypeError('arquivos.salvar: conteúdo vazio.');
    if (!Object.hasOwn(TIPOS_ARQUIVO, tipo) || detectarTipo(b) !== tipo) throw new TypeError('arquivos.salvar: tipo não confere com os bytes.');
    const refLimpo = {};
    for (const k of CHAVES_REF) {
      if (ref && ref[k] !== undefined && ref[k] !== null && String(ref[k])) refLimpo[k] = String(ref[k]);
    }
    if (contexto !== 'material') delete refLimpo.cursoId; // ref.cursoId só em material (API §3.3)
    const sha256 = createHash('sha256').update(b).digest('hex');
    const mime = TIPOS_ARQUIVO[tipo];
    const doc = {
      contexto,
      donoUserId: donoUserId === null || donoUserId === undefined ? null : String(donoUserId),
      ref: refLimpo,
      nomeDownload: nomeDeDownload(nomeDownload, tipo),
      mime,
      tamanho: b.length,
      sha256,
      dados: new Binary(b),
      criadoEm: agora(),
      criadoPor: por === null || por === undefined ? null : String(por)
    };
    const r = await colecao().insertOne(doc);
    return { id: String(r.insertedId), sha256, tamanho: b.length, mime };
  }

  /** Projeção sem `dados`. `filtro` OBRIGATÓRIO ({ contexto, …dono }), aplicado no MESMO find. */
  async function metadados(id, filtro) {
    conferirFiltro(filtro);
    const _id = idDe(id);
    if (!_id) return null;
    return saidaDe(await colecao().findOne({ _id, ...filtro }, { projection: { dados: 0 } }), false);
  }

  /** Com `dados` (Buffer). `filtro` OBRIGATÓRIO, como em metadados. */
  async function ler(id, filtro) {
    conferirFiltro(filtro);
    const _id = idDe(id);
    if (!_id) return null;
    return saidaDe(await colecao().findOne({ _id, ...filtro }), true);
  }

  async function apagar(id) {
    const _id = idDe(id);
    if (!_id) return;
    await colecao().deleteOne({ _id });
  }

  /**
   * Entrega o binário com os cabeçalhos de §1.6: privado (`private, no-store`) ou público
   * (`public, max-age=31536000, immutable`, banners e capas); sempre nosniff, CSP sandbox e
   * CORP same-origin; `inline` só vale para imagem (PDF sai sempre como attachment).
   */
  function enviar(res, arq, { nome = null, inline = false, publico = false } = {}) {
    const dados = comoBuffer(arq?.dados);
    if (!dados) throw new TypeError('arquivos.enviar: arquivo sem dados (use ler(), não metadados()).');
    const tipo = tipoDoMime(arq.mime);
    const mime = tipo ? TIPOS_ARQUIVO[tipo] : 'application/octet-stream';
    const imagem = tipo === 'jpg' || tipo === 'png' || tipo === 'webp';
    const nomeFinal = nomeDeDownload(nome || arq.nomeDownload, tipo || 'bin');
    res.set({
      'Content-Type': mime,
      'Content-Length': String(dados.length),
      'Cache-Control': publico ? 'public, max-age=31536000, immutable' : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Disposition': `${inline && imagem ? 'inline' : 'attachment'}; filename="${nomeFinal}"`
    });
    res.status(200).end(dados);
  }

  return Object.freeze({ salvar, metadados, ler, apagar, enviar });
}
