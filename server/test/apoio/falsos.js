// =============================================================
// COMPLEXO DMC · Apoio de teste — falsos e geradores determinísticos
// PORTAL-API §9.1 · dono: F0a.
//
// Nada aqui abre rede ou banco. Gemini, Resend e ViaCEP são SEMPRE
// falsos nos testes de servidor. Nenhum CPF real fixo: use
// gerarCpfValido(semente).
// =============================================================
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

/** Log que descarta tudo. */
export const silencioso = Object.freeze({ log() {}, info() {}, warn() {}, error() {}, debug() {} });

/** Log que guarda as linhas por nível: espiao.linhas = [{ nivel, texto }]. */
export function criarLogEspiao() {
  const linhas = [];
  const pegar = nivel => (...args) => { linhas.push({ nivel, texto: args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') }); };
  return { linhas, log: pegar('log'), info: pegar('info'), warn: pegar('warn'), error: pegar('error'), debug: pegar('debug'), texto: () => linhas.map(l => l.texto).join('\n') };
}

// ---------- tempo e aleatoriedade ----------
/**
 * Relógio controlável. `const r = relogio('2026-10-18T12:00:00Z')`:
 *   r() → Date (use como `agora`), r.ms() → número (use como `agora` do throttle),
 *   r.avancar(ms), r.definir(iso).
 */
export function relogio(iso = '2026-10-18T12:00:00.000Z') {
  let t = new Date(iso).getTime();
  if (Number.isNaN(t)) throw new Error('relogio: data inválida');
  const r = () => new Date(t);
  r.ms = () => t;
  r.avancar = (ms) => { t += ms; return r(); };
  r.definir = (novo) => { t = new Date(novo).getTime(); return r(); };
  return r;
}

/** Fonte de bytes determinística (substitui crypto.randomBytes): bytesFixos('x')(n) → Buffer. */
export function bytesFixos(seed = 'semente') {
  let contador = 0;
  return (n) => {
    const partes = [];
    let total = 0;
    while (total < n) {
      const h = createHash('sha256').update(`${seed}:${contador++}`).digest();
      partes.push(h);
      total += h.length;
    }
    return Buffer.concat(partes).subarray(0, n);
  };
}

/** randomInt determinístico com a assinatura de crypto.randomInt([min,] max). */
export function randomInt(seed = 'semente') {
  const bytes = bytesFixos(seed);
  return (a, b) => {
    const [min, max] = b === undefined ? [0, a] : [a, b];
    if (!(max > min)) throw new RangeError('randomInt: max precisa ser maior que min');
    return min + (bytes(6).readUIntBE(0, 6) % (max - min));
  };
}
export const randomIntFixo = randomInt;

// ---------- CPF ----------
/** CPF válido (11 dígitos) derivado da semente — nunca um CPF real fixo. */
export function gerarCpfValido(semente = 'cpf') {
  const h = createHash('sha256').update(String(semente)).digest();
  let base = '';
  for (let i = 0; base.length < 9; i++) base += String(h[i % h.length] % 10);
  if (/^(\d)\1{8}$/.test(base)) base = base.slice(0, 8) + String((Number(base[8]) + 1) % 10);
  const dv = (s, peso) => { let soma = 0; for (let i = 0; i < s.length; i++) soma += Number(s[i]) * (peso - i); const r = (soma * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(base, 10);
  const d2 = dv(base + d1, 11);
  return `${base}${d1}${d2}`;
}

// ---------- fetch falso ----------
function respostaDe(item) {
  const { status = 200, json, texto, headers = {} } = item || {};
  const corpo = json !== undefined ? JSON.stringify(json) : texto ?? '';
  const h = { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers };
  return new Response(status === 204 || status === 304 ? null : corpo, { status, headers: h });
}

/**
 * fetch falso que grava as chamadas (url, metodo, headers, corpo).
 * roteiro: array de respostas (consumidas em ordem; a última se repete),
 * função (chamada) → resposta, ou 'nunca' (nunca responde; respeita AbortSignal).
 * Resposta: { status, json | texto, headers, atrasoMs } ou { erro: Error } (falha de rede).
 */
export function fetchFalso(roteiro = [{ status: 200, json: {} }]) {
  const chamadas = [];
  let i = 0;
  const f = async (url, init = {}) => {
    const headers = {};
    new Headers(init.headers || {}).forEach((v, k) => { headers[k] = v; });
    let corpo = init.body ?? null;
    if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch { /* texto */ } }
    const chamada = { url: String(url), metodo: (init.method || 'GET').toUpperCase(), headers, corpo };
    chamadas.push(chamada);
    const sinal = init.signal;
    if (roteiro === 'nunca' || roteiro?.nuncaResponde) {
      return new Promise((_, rejeitar) => {
        if (sinal) {
          const abortar = () => { const e = new Error('Operação abortada'); e.name = 'AbortError'; rejeitar(e); };
          if (sinal.aborted) abortar(); else sinal.addEventListener('abort', abortar, { once: true });
        }
      });
    }
    let item;
    if (typeof roteiro === 'function') item = await roteiro(chamada);
    else if (Array.isArray(roteiro)) { item = roteiro[Math.min(i, roteiro.length - 1)]; i++; if (typeof item === 'function') item = await item(chamada); } else item = roteiro;
    if (item?.atrasoMs) await new Promise(r => setTimeout(r, item.atrasoMs));
    if (item?.erro) throw item.erro;
    return respostaDe(item);
  };
  f.chamadas = chamadas;
  return f;
}

/**
 * Gemini falso (só para testes da F6b; contrato de §6.10.3). roteiro: array de itens para
 * `:generateContent`, cada um { texto } | { functionCall:{ name, args } } | { finishReason } |
 * { status, json } (cru). GET /v1beta/models/:modelo responde o modelo com generateContent.
 */
export function provedorGeminiFalso(roteiro = [{ texto: 'Resposta de teste.' }], { modelos = null } = {}) {
  let i = 0;
  const f = fetchFalso((chamada) => {
    const u = new URL(chamada.url);
    if (chamada.metodo === 'GET' && /\/v1beta\/models\/[^/:]+$/.test(u.pathname)) {
      const nome = u.pathname.split('/').pop();
      if (modelos && !modelos.includes(nome)) return { status: 404, json: { error: { code: 404, status: 'NOT_FOUND', message: 'model not found' } } };
      return { status: 200, json: { name: `models/${nome}`, supportedGenerationMethods: ['generateContent', 'countTokens'] } };
    }
    if (chamada.metodo === 'POST' && /:generateContent$/.test(u.pathname)) {
      const item = roteiro[Math.min(i, roteiro.length - 1)];
      i++;
      if (item.status || item.json) return { status: item.status || 200, json: item.json ?? {} };
      const parts = item.functionCall ? [{ functionCall: item.functionCall, ...(item.thoughtSignature ? { thoughtSignature: item.thoughtSignature } : {}) }] : [{ text: item.texto ?? '' }];
      return {
        status: 200,
        json: {
          candidates: [{ content: { role: 'model', parts }, finishReason: item.finishReason || 'STOP' }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
        }
      };
    }
    return { status: 404, json: { error: { code: 404, message: 'rota desconhecida no Gemini falso' } } };
  });
  return f;
}

// ---------- serviços falsos ----------
function erroServicoIndisponivel(nome) {
  const e = new Error(`Serviço indisponível: ${nome}`);
  e.name = 'ServicoIndisponivel';
  e.codigo = 'servico-indisponivel';
  e.nome = nome;
  return e;
}

/**
 * Serviços e grupos de OUTRAS fatias como falsos que gravam as chamadas.
 *   servicosFalsos({ 'secretaria.matriculaVigente': async () => null }, { grupos: { busca: [def] }, em: servicos })
 * Com `em` (o localizador da F0m, criarServicos()), registra nele e o devolve. Sem `em`, devolve um
 * localizador próprio com a mesma interface (registrar/obter/tentar/adicionar/todos).
 * Em ambos os casos, `.chamadas[nome]` guarda os argumentos de cada chamada.
 */
export function servicosFalsos(mapa = {}, { grupos = {}, em = null } = {}) {
  const chamadas = {};
  const embrulhar = (nome, impl) => {
    if (typeof impl !== 'function') return impl;
    return (...args) => { (chamadas[nome] ||= []).push(args); return impl(...args); };
  };
  const alvo = em || (() => {
    const registro = new Map();
    const gruposMap = new Map();
    return {
      registrar(nome, impl) { if (registro.has(nome)) throw new Error(`Serviço já registrado: ${nome}`); registro.set(nome, impl); },
      obter(nome) { if (!registro.has(nome)) throw erroServicoIndisponivel(nome); return registro.get(nome); },
      tentar(nome) { return registro.has(nome) ? registro.get(nome) : null; },
      adicionar(grupo, def) { if (!gruposMap.has(grupo)) gruposMap.set(grupo, []); gruposMap.get(grupo).push(def); },
      todos(grupo) { return [...(gruposMap.get(grupo) || [])]; }
    };
  })();
  for (const [nome, impl] of Object.entries(mapa)) alvo.registrar(nome, embrulhar(nome, impl));
  for (const [grupo, defs] of Object.entries(grupos)) for (const d of defs) alvo.adicionar(grupo, d);
  alvo.chamadas = chamadas;
  return alvo;
}

// ---------- arquivos falsos ----------
/** PDF mínimo válido (1 página, sem ação). */
export function pdfMinimo() {
  return montarPdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>']);
}

/** PDF com /OpenAction /JavaScript (conteúdo ativo). */
export function pdfComJavascript() {
  return montarPdf([
    '<< /Type /Catalog /Pages 2 0 R /OpenAction 4 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
    '<< /S /JavaScript /JS (app.alert\\(1\\)) >>'
  ]);
}

/** Monta um PDF 1.4 com os objetos dados (texto) e xref correto. */
export function montarPdf(objetos) {
  let s = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objetos.forEach((o, i) => { offsets.push(Buffer.byteLength(s, 'latin1')); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(s, 'latin1');
  s += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) s += `${String(off).padStart(10, '0')} 00000 n \n`;
  s += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(s, 'latin1');
}

const TABELA_CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const x of buf) c = TABELA_CRC[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunkPng(tipo, dados) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length);
  const td = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ASSINATURA_PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function pngCom(extras = []) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2; // 1×1 RGB 8 bits
  const raw = Buffer.from([0, 214, 176, 105]); // filtro 0 + um pixel ouro DMC
  return Buffer.concat([ASSINATURA_PNG, chunkPng('IHDR', ihdr), ...extras, chunkPng('IDAT', zlib.deflateSync(raw)), chunkPng('IEND', Buffer.alloc(0))]);
}

/** PNG 1×1 válido (CRCs corretos), sem metadados. */
export function pngMinimo() {
  return pngCom();
}

/** PNG com tEXt (Comment) e eXIf — metadados que a foto e o banner devem perder. */
export function pngComTexto() {
  return pngCom([
    chunkPng('tEXt', Buffer.from('Comment\0Metadado de teste', 'latin1')),
    chunkPng('eXIf', Buffer.from('MM\0*\0\0\0\b\0\0', 'latin1'))
  ]);
}

// JPEG 8×8 sem metadados (gerado para este apoio; nenhum conteúdo de terceiros).
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAASABIAAD/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwAGBgYGBgYKBgYKDgoKCg4SDg4ODhIXEhISEhIXHBcXFxcXFxwcHBwcHBwcIiIiIiIiJycnJycsLCwsLCwsLCws/9sAQwEHBwcLCgsTCgoTLh8aHy4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4u/90ABAAB/9oADAMBAAIRAxEAPwDuaKKK+RPYP//Z';

/** JPEG válido sem APP1/Exif. */
export function jpegMinimo() {
  return Buffer.from(JPEG_BASE64, 'base64');
}

/** JPEG com APP1 Exif contendo um IFD de GPS falso (latitude 23°S) — deve sumir no upload de foto. */
export function jpegComExif() {
  const base = jpegMinimo();
  // TIFF big-endian: IFD0 com 1 entrada (GPSInfo 0x8825 → offset 26); GPS IFD com GPSLatitudeRef 'S'.
  const tiff = Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // cabeçalho, IFD0 em 8
    0x00, 0x01, // 1 entrada
    0x88, 0x25, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, // GPSInfo LONG → 26
    0x00, 0x00, 0x00, 0x00, // próximo IFD
    0x00, 0x01, // GPS IFD: 1 entrada
    0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x53, 0x00, 0x00, 0x00, // GPSLatitudeRef ASCII 'S'
    0x00, 0x00, 0x00, 0x00
  ]);
  const conteudo = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([(conteudo.length + 2) >> 8, (conteudo.length + 2) & 255]), conteudo]);
  return Buffer.concat([base.subarray(0, 2), app1, base.subarray(2)]);
}

// WebP 1×1 sem perdas (imagem de teste de detecção de suporte, domínio público).
const WEBP_VP8L_BASE64 = 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

/** WebP 1×1 válido (VP8L), sem metadados. */
export function webpMinimo() {
  return Buffer.from(WEBP_VP8L_BASE64, 'base64');
}

function chunkRiff(tipo, dados) {
  const tam = Buffer.alloc(4);
  tam.writeUInt32LE(dados.length);
  return Buffer.concat([Buffer.from(tipo, 'latin1'), tam, dados, dados.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
}

/** WebP estendido (VP8X com as flags EXIF e XMP) com chunks EXIF e XMP falsos. */
export function webpComExif() {
  const vp8l = webpMinimo().subarray(12); // chunk VP8L completo (cabeçalho + dados)
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x08 | 0x04; // EXIF + XMP
  // largura−1 e altura−1 = 0 (1×1), 24 bits cada: já zerados
  const exif = chunkRiff('EXIF', Buffer.from('MM\0*\0\0\0\b\0\0', 'latin1'));
  const xmp = chunkRiff('XMP ', Buffer.from('<x:xmpmeta>teste</x:xmpmeta>', 'utf8'));
  const corpo = Buffer.concat([Buffer.from('WEBP', 'latin1'), chunkRiff('VP8X', vp8x), vp8l, exif, xmp]);
  const tam = Buffer.alloc(4);
  tam.writeUInt32LE(corpo.length);
  return Buffer.concat([Buffer.from('RIFF', 'latin1'), tam, corpo]);
}

/** HTML com script, enviado como se fosse documento — deve ser recusado (415). */
export function htmlDisfarcado() {
  return Buffer.from('<!doctype html><html><body><script>alert(1)</script>%PDF-1.4</body></html>', 'utf8');
}
