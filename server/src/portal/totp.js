// =============================================================
// COMPLEXO DMC · Portal — TOTP (RFC 6238: HMAC-SHA1, 30 s, 6 dígitos)
// PORTAL-API §4.15 · dono: F0a. Só node:crypto.
//
// O segredo é guardado CIFRADO (`cripto.cifrar(segredo, 'totp',
// aadDoSegredo(userId))`) em auth_2fa; aqui só se trabalha com o base32
// já decifrado. O anti-reuso é ATÔMICO no banco (quem grava é a F0t):
//   updateOne({ userId, ultimoPasso:{ $lt: passo } }, { $set:{ ultimoPasso: passo } })
// — `verificarTotp` só recusa passos ≤ ultimoPasso já conhecidos.
// =============================================================
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ALFABETO } from './codigos.js';
import { hmacCodigoRecuperacao } from './cripto.js';

export const PERIODO_SEG = 30;
export const DIGITOS = 6;
export const EMISSOR = 'Plataforma Complexo DMC';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** AAD da cifra do segredo TOTP: amarra o segredo cifrado à conta (convenção da F0a para a F0t). */
export const aadDoSegredo = userId => `totp:${String(userId)}`;

export function base32Codificar(buf) {
  const b = Buffer.from(buf);
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const byte of b) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += B32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += B32[(valor << (5 - bits)) & 31];
  return saida;
}

export function base32Decodificar(s) {
  const limpo = String(s ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!/^[A-Z2-7]*$/.test(limpo)) throw new TypeError('base32 inválido.');
  let bits = 0;
  let valor = 0;
  const bytes = [];
  for (const ch of limpo) {
    valor = (valor << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Segredo novo (160 bits por padrão) em base32. */
export function gerarSegredo(bytes = 20) {
  return base32Codificar(randomBytes(bytes));
}

export function passoAtual(agoraMs) {
  return Math.floor(Number(agoraMs) / (PERIODO_SEG * 1000));
}

/** HOTP(segredo, passo) com 6 dígitos. */
export function codigoTotp(segredoB32, passo) {
  const chave = base32Decodificar(segredoB32);
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const h = createHmac('sha1', chave).update(contador).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

/**
 * Confere o código na janela ±`janela` passos. Devolve o passo aceito (sempre > ultimoPasso)
 * ou null. Quem chama grava o passo de forma atômica (anti-reuso).
 */
export function verificarTotp(segredoB32, codigo, { agoraMs = Date.now(), ultimoPasso = null, janela = 1 } = {}) {
  if (typeof codigo !== 'string' && typeof codigo !== 'number') return null;
  const c = String(codigo).replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  let segredoValido = true;
  try { base32Decodificar(segredoB32); } catch { segredoValido = false; }
  if (!segredoValido) return null;
  const p = passoAtual(agoraMs);
  const minimo = Number.isFinite(ultimoPasso) ? ultimoPasso : -Infinity;
  let aceito = null;
  for (let d = -janela; d <= janela; d++) {
    const passo = p + d;
    if (passo < 0) continue;
    const ok = timingSafeEqual(Buffer.from(codigoTotp(segredoB32, passo)), Buffer.from(c));
    if (ok && passo > minimo && aceito === null) aceito = passo;
  }
  return aceito;
}

/** otpauth://totp/… para o QR desenhado no front (DMC_QR). */
export function otpauthUri({ email, segredo }) {
  const emissor = encodeURIComponent(EMISSOR);
  const rotulo = `${emissor}:${encodeURIComponent(String(email ?? ''))}`;
  return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${emissor}&algorithm=SHA1&digits=${DIGITOS}&period=${PERIODO_SEG}`;
}

/**
 * n códigos de recuperação 'XXXX-XXXX' (alfabeto sem 0/1/I/O), exibidos UMA vez,
 * e os HMACs para gravar (nunca o sha256 simples do código).
 */
export function gerarCodigosRecuperacao(n = 10, { hmac = hmacCodigoRecuperacao, bytes = randomBytes } = {}) {
  const claros = [];
  const vistos = new Set();
  let tentativas = 0;
  while (claros.length < n) {
    if (++tentativas > n * 20) throw new Error('gerarCodigosRecuperacao: fonte de bytes sem variação.');
    const b = bytes(8);
    let s = '';
    for (let i = 0; i < 8; i++) s += ALFABETO[b[i] & 31];
    const codigo = `${s.slice(0, 4)}-${s.slice(4)}`;
    if (vistos.has(codigo)) continue;
    vistos.add(codigo);
    claros.push(codigo);
  }
  return { claros, hashes: claros.map(c => hmac(c)) };
}
