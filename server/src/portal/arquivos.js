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
const MARCADORES_ATIVOS = Object.freeze([
  'Encrypt', 'JavaScript', 'JS', 'Launch', 'EmbeddedFile', 'RichMedia', 'XFA', 'SubmitForm', 'ImportData', 'GoToR', 'GoToE', 'Rendition'
]);
// Nome PDF inteiro: termina num delimitador, espaço ou fim (pega /JS, não /JSfoo).
const MARCADOR_RE = new RegExp(`/(${MARCADORES_ATIVOS.join('|')})(?=[\\s/<>\\[\\]()%{}]|$)`);
const NOME_PDF_RE = /\/[^\s/<>[\]()%{}]+/g;

/** Decodifica '#xx' dentro dos nomes PDF ('/J#61vaScript' → '/JavaScript'). Texto em latin1. */
export function normalizarNomesPdf(texto) {
  return texto.replace(NOME_PDF_RE, nome => (nome.includes('#') ? nome.replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : nome));
}

function marcadorEm(texto) {
  const m = MARCADOR_RE.exec(normalizarNomesPdf(texto));
  return m ? m[1] : null;
}

/** Streams do PDF: dicionário (até 4 KiB antes de 'stream') e intervalo dos dados. */
function listarStreams(texto) {
  const lista = [];
  const re = /stream(?:\r\n|\n|\r)/g;
  let m;
  while ((m = re.exec(texto))) {
    if (texto.slice(Math.max(0, m.index - 3), m.index) === 'end') continue;
    const ini = m.index + m[0].length;
    const fimBruto = texto.indexOf('endstream', ini);
    if (fimBruto < 0) break;
    let fim = fimBruto;
    if (texto[fim - 1] === '\n') fim--;
    if (texto[fim - 1] === '\r') fim--;
    const abre = texto.lastIndexOf('obj', m.index);
    const dic = texto.slice(Math.max(0, abre >= 0 ? abre : 0, m.index - 4096), m.index);
    lista.push({ dic, ini, fim: Math.max(ini, fim), fimBruto });
    re.lastIndex = fimBruto + 9;
  }
  return lista;
}

function classificarStream(dicNormalizado) {
  const objStm = /\/Type\s*\/ObjStm(?![A-Za-z])/.test(dicNormalizado);
  const filtro = /\/Filter\s*(\[\s*)?\/(\w+)/.exec(dicNormalizado);
  const primeiroFiltro = filtro ? filtro[2] : null;
  const binario = /\/Subtype\s*\/Image(?![A-Za-z])/.test(dicNormalizado)
    || /\/Length1(?![A-Za-z0-9])/.test(dicNormalizado)
    || /\/Subtype\s*\/(Type1C|CIDFontType0C|OpenType)(?![A-Za-z])/.test(dicNormalizado)
    || /\/Alternate(?![A-Za-z])/.test(dicNormalizado);
  return { objStm, primeiroFiltro, binario };
}

/**
 * Procura conteúdo ativo num PDF (filtro de entrada; a entrega sandbox é a barreira principal).
 * 1. normaliza nomes '#xx'; 2. varre o arquivo fora dos streams + cada stream sem filtro + cada
 *    stream /FlateDecode descomprimido (inclusive object streams), com teto total e razão máxima
 *    (bomba → motivo 'compressao'); object stream que não dá para abrir → 'objstm-ilegivel';
 * 3. marcadores: /Encrypt /JavaScript /JS /Launch /EmbeddedFile /RichMedia /XFA /SubmitForm
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
  const streams = listarStreams(texto);

  // Arquivo cru fora dos dados dos streams (dicionários, objetos, trailer).
  let fora = '';
  let pos = 0;
  for (const s of streams) { fora += texto.slice(pos, s.ini) + ' '; pos = s.fimBruto; }
  fora += texto.slice(pos);
  const noCru = marcadorEm(fora);
  if (noCru) return { ativo: true, motivo: noCru };

  let total = 0;
  for (const s of streams) {
    const { objStm, primeiroFiltro, binario } = classificarStream(normalizarNomesPdf(s.dic));
    if (binario && !objStm) continue;
    if (!primeiroFiltro) {
      const m = marcadorEm(texto.slice(s.ini, s.fim));
      if (m) return { ativo: true, motivo: m };
      continue;
    }
    if (primeiroFiltro !== 'FlateDecode') {
      if (objStm) return { ativo: true, motivo: 'objstm-ilegivel' };
      continue;
    }
    const dados = b.subarray(s.ini, s.fim);
    const restante = tetoDescomprimido - total;
    if (restante <= 0) return { ativo: true, motivo: 'compressao' };
    const limite = Math.min(restante, Math.max(minimoParaRazao, dados.length * razaoMaxima));
    let saida;
    try {
      saida = zlib.inflateSync(dados, { maxOutputLength: limite, finishFlush: zlib.constants.Z_SYNC_FLUSH });
    } catch (err) {
      if (err instanceof RangeError || err?.code === 'ERR_BUFFER_TOO_LARGE') return { ativo: true, motivo: 'compressao' };
      if (objStm) return { ativo: true, motivo: 'objstm-ilegivel' };
      continue; // stream corrompido que não abre: o conteúdo fica de fora (o dicionário já foi varrido)
    }
    total += saida.length;
    if (saida.length > minimoParaRazao && saida.length / Math.max(1, dados.length) > razaoMaxima) return { ativo: true, motivo: 'compressao' };
    if (total > tetoDescomprimido) return { ativo: true, motivo: 'compressao' };
    const m = marcadorEm(saida.toString('latin1'));
    if (m) return { ativo: true, motivo: m };
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
