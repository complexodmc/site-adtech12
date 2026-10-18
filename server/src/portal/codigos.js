// =============================================================
// COMPLEXO DMC · Portal — códigos legíveis (PURO)
// PORTAL-API §1.5, §4.6 · dono: F0a.
//
// Alfabeto único de 32 símbolos, sem 0/1/I/O. Como 256 é múltiplo de
// 32, `byte & 31` é uniforme (mesmo desenho de bolsas.js/parcerias.js).
// Ano no fuso de São Paulo. `bytes` é injetável para testes
// determinísticos (padrão: crypto.randomBytes).
// =============================================================
import { randomBytes } from 'node:crypto';
import { anoSP } from './validacao.js';

export const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SIMBOLO = '[2-9A-HJ-NP-Z]';

export const PREFIXOS_ANUAIS = Object.freeze(['MAT', 'ATD', 'OUV']);
export const PREFIXOS_VERIFICACAO = Object.freeze(['DEC', 'FRQ', 'AVL', 'CTR']);

export const CODIGO_ANUAL_RE = Object.freeze({
  MAT: new RegExp(`^MAT-\\d{4}-${SIMBOLO}{6}$`),
  ATD: new RegExp(`^ATD-\\d{4}-${SIMBOLO}{6}$`),
  OUV: new RegExp(`^OUV-\\d{4}-${SIMBOLO}{6}$`)
});
export const CODIGO_VERIFICACAO_RE = new RegExp(`^(DEC|FRQ|AVL|CTR)(-${SIMBOLO}{4}){3}$`);
export const CODIGO_CERTIFICADO_RE = new RegExp(`^DMC-${SIMBOLO}{4}-${SIMBOLO}{4}$`);
export const CODIGO_AULA_RE = /^[A-Z][A-Z0-9]{1,5}-M\d{2}-A\d{2}$/;
export const CODIGO_TURMA_RE = /^[A-Z0-9][A-Z0-9-]{2,23}$/;
export const SIGLA_RE = /^[A-Z][A-Z0-9]{1,5}$/;

/** n símbolos do ALFABETO. */
export function sufixo(n, bytes = randomBytes) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('sufixo: n inteiro ≥ 1.');
  let s = '';
  const b = bytes(n);
  for (let i = 0; i < n; i++) s += ALFABETO[b[i] & 31];
  return s;
}

/** 'MAT-2026-7KQ2MX' (prefixo MAT, ATD ou OUV; ano no fuso de SP). */
export function codigoAnual(prefixo, momento = new Date(), bytes = randomBytes) {
  if (!PREFIXOS_ANUAIS.includes(prefixo)) throw new RangeError(`codigoAnual: prefixo inválido (${prefixo}).`);
  return `${prefixo}-${anoSP(momento)}-${sufixo(6, bytes)}`;
}

/** 'DEC-4F7K-Q9ZM-2HXA' (prefixo DEC, FRQ, AVL ou CTR). */
export function codigoVerificacao(prefixo, bytes = randomBytes) {
  if (!PREFIXOS_VERIFICACAO.includes(prefixo)) throw new RangeError(`codigoVerificacao: prefixo inválido (${prefixo}).`);
  const s = sufixo(12, bytes);
  return `${prefixo}-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

const dois = n => String(n).padStart(2, '0');

/** 'APE-M01-A01' — posições 1–99. */
export function codigoAula(sigla, posModulo, posAula) {
  if (typeof sigla !== 'string' || !SIGLA_RE.test(sigla)) throw new RangeError('codigoAula: sigla inválida.');
  for (const p of [posModulo, posAula]) {
    if (!Number.isInteger(p) || p < 1 || p > 99) throw new RangeError('codigoAula: posição fora de 1–99.');
  }
  return `${sigla}-M${dois(posModulo)}-A${dois(posAula)}`;
}

/** Sugestão de código de turma: 'APE-2026-01'. */
export function codigoTurmaSugerido(sigla, ano, seq) {
  if (typeof sigla !== 'string' || !SIGLA_RE.test(sigla)) throw new RangeError('codigoTurmaSugerido: sigla inválida.');
  if (!Number.isInteger(ano) || ano < 1000 || ano > 9999) throw new RangeError('codigoTurmaSugerido: ano inválido.');
  if (!Number.isInteger(seq) || seq < 1 || seq > 999) throw new RangeError('codigoTurmaSugerido: sequência fora de 1–999.');
  return `${sigla}-${ano}-${dois(seq)}`;
}

/** Senha temporária: 16 símbolos do ALFABETO (≈ 80 bits). */
export function senhaTemporaria(bytes = randomBytes) {
  return sufixo(16, bytes);
}

/** O E11000 foi barrado pelo índice informado (nome do índice na mensagem ou campo no keyPattern)? */
export function duplicadoNoIndice(err, { indice, campo = null } = {}) {
  if (!err || (err.code !== 11000 && err.code !== 11001)) return false;
  const msg = String(err.message || err.errmsg || '');
  const nome = (/index: ([A-Za-z0-9_.$-]+)/.exec(msg) || [])[1] || null;
  if (indice && nome === indice) return true;
  const kp = err.keyPattern && typeof err.keyPattern === 'object' ? err.keyPattern : null;
  if (campo && kp && Object.hasOwn(kp, campo) && Object.keys(kp).length === 1) return true;
  return false;
}

/**
 * Insere com um código sorteado; repete (até `tentativas`) SÓ quando o
 * E11000 vem do índice do código. Outro E11000 (ou outro erro) sobe.
 * @param {(codigo: string) => Promise<any>} inserir
 * @param {() => string} gerar
 * @param {{ indice: string, campo?: string, tentativas?: number }} opcoes
 * @returns {Promise<{ codigo: string, resultado: any }>}
 */
export async function inserirComCodigo(inserir, gerar, { indice, campo = null, tentativas = 3 } = {}) {
  if (typeof inserir !== 'function' || typeof gerar !== 'function') throw new TypeError('inserirComCodigo: informe inserir e gerar.');
  if (!indice && !campo) throw new TypeError('inserirComCodigo: informe o índice do código.');
  let ultimo = null;
  for (let i = 0; i < Math.max(1, tentativas); i++) {
    const codigo = gerar();
    try {
      const resultado = await inserir(codigo);
      return { codigo, resultado };
    } catch (err) {
      if (!duplicadoNoIndice(err, { indice, campo })) throw err;
      ultimo = err;
    }
  }
  throw ultimo;
}
