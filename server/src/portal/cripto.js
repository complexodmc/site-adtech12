// =============================================================
// COMPLEXO DMC · Portal — criptografia (cifra, HMAC, selo, tokens)
// PORTAL-API §4.7 · dono: F0a. Só node:crypto (nenhuma dependência nova).
//
// Material: o JWT_SECRET (decisão do CEO), derivado por HKDF com sal
// próprio por finalidade. O agregador (F0m) e o auth-extra (F0t) chamam
// `configurarCripto({ material, materialAnterior })`; sem essa chamada,
// as funções de nível de módulo usam `configPortal.material`
// (JWT_SECRET) e `configPortal.materialAnterior` (PORTAL_MATERIAL_ANTERIOR).
// `criarCripto` e `criarAssinador` recebem o material explicitamente
// (testes e serviços `cifra`/`assinador` da F0m).
//
// Rotação: o material anterior só DECIFRA e VERIFICA; `decifrar` avisa
// `recifrar:true` para o chamador regravar com o material atual.
// ChaveIlegivelError nunca deve virar 500 (quem chama trata, §4.7).
// =============================================================
import {
  hkdfSync, createHmac, createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual
} from 'node:crypto';
import { configPortal } from './config-portal.js';

export const FINALIDADES = Object.freeze(['gemini-api-key', 'totp', 'selo', 'codigos-2fa', 'identificador']);
export const TIPOS_SELO = Object.freeze(['certificado', 'frequencia', 'avaliacao', 'declaracao', 'contrato']);

export class ChaveIlegivelError extends Error {
  constructor(mensagem = 'Conteúdo cifrado ilegível com o material atual ou anterior.') {
    super(mensagem);
    this.name = 'ChaveIlegivelError';
    this.codigo = 'chave-ilegivel';
  }
}

function conferirMaterial(material) {
  if ((typeof material !== 'string' || !material) && !(Buffer.isBuffer(material) && material.length)) {
    throw new TypeError('cripto: material ausente (JWT_SECRET).');
  }
}

const memoChaves = new Map();

/** HKDF-SHA256 do material com sal e info próprios da finalidade → 32 bytes. */
export function derivarChave(finalidade, material) {
  if (!FINALIDADES.includes(finalidade)) throw new RangeError(`cripto: finalidade desconhecida (${finalidade}).`);
  conferirMaterial(material);
  const id = createHash('sha256').update(material).digest('hex') + ':' + finalidade;
  let chave = memoChaves.get(id);
  if (!chave) {
    chave = Buffer.from(hkdfSync('sha256', material, `dmc-portal/${finalidade}/v1`, `dmc-portal:${finalidade}`, 32));
    if (memoChaves.size > 64) memoChaves.clear();
    memoChaves.set(id, chave);
  }
  return chave;
}

/** 8 primeiros hex de sha256(chave). */
export function kidDe(chave) {
  return createHash('sha256').update(chave).digest('hex').slice(0, 8);
}

// ---------- puros (sem material) ----------
/** Token aleatório em base64url (padrão 32 bytes = 256 bits). */
export function tokenAleatorio(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

/** sha256 hex do token (o token em claro nunca é gravado). */
export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function sha256(dado) {
  return createHash('sha256').update(typeof dado === 'string' ? Buffer.from(dado, 'utf8') : dado).digest('hex');
}

/** Comparação em tempo constante; tamanhos diferentes (ou tipos inválidos) = false, sem lançar. */
export function iguaisTempoConstante(a, b) {
  const buf = v => (Buffer.isBuffer(v) ? v : v instanceof Uint8Array ? Buffer.from(v) : typeof v === 'string' ? Buffer.from(v, 'utf8') : null);
  const x = buf(a);
  const y = buf(b);
  if (!x || !y || x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

function normalizarCanonico(v) {
  if (v === null) return null;
  if (v === undefined || typeof v === 'function' || typeof v === 'symbol') return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.from(v).toString('base64');
  if ((v._bsontype === 'ObjectId' || v._bsontype === 'ObjectID') && typeof v.toHexString === 'function') return v.toHexString();
  if (Array.isArray(v)) return v.map(x => { const n = normalizarCanonico(x); return n === undefined ? null : n; });
  const out = {};
  for (const k of Object.keys(v).sort()) {
    const n = normalizarCanonico(v[k]);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

/** JSON estável: chaves ordenadas, Date → ISO, ObjectId → hex, undefined omitido. */
export function canonico(valor) {
  const n = normalizarCanonico(valor);
  return JSON.stringify(n === undefined ? null : n);
}

// ---------- selo HMAC ----------
/**
 * Assinador de selos verificáveis: HMAC-SHA256(derivarChave('selo'), `${tipo}\n${canonico(dados)}`).
 * verificar → true/false com kid atual ou anterior; kid desconhecido → null.
 */
export function criarAssinador({ material, materialAnterior = null } = {}) {
  const chave = derivarChave('selo', material);
  const kid = kidDe(chave);
  const anterior = materialAnterior ? derivarChave('selo', materialAnterior) : null;
  const kidAnterior = anterior ? kidDe(anterior) : null;
  const conferirTipo = tipo => { if (!TIPOS_SELO.includes(tipo)) throw new RangeError(`assinador: tipo desconhecido (${tipo}).`); };
  const calcular = (k, tipo, dados) => createHmac('sha256', k).update(`${tipo}\n${canonico(dados)}`, 'utf8').digest('hex');
  return Object.freeze({
    kid,
    assinar(tipo, dados) {
      conferirTipo(tipo);
      return { hash: calcular(chave, tipo, dados), kid };
    },
    verificar(tipo, dados, hash, kidRecebido) {
      conferirTipo(tipo);
      const k = kidRecebido === kid ? chave : (kidAnterior && kidRecebido === kidAnterior ? anterior : null);
      if (!k) return null;
      if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) return false;
      return iguaisTempoConstante(calcular(k, tipo, dados), hash);
    }
  });
}

// ---------- instância com material ----------
function normalizarIdentificador(valor) {
  const s = String(valor ?? '').normalize('NFC').trim().toLowerCase();
  return /^[\d.\-\s/]+$/.test(s) ? s.replace(/\D/g, '') : s;
}

/** 'xxxx-xxxx', 'XXXXXXXX' ou 'XXXX XXXX' → 'XXXX-XXXX'. */
export function normalizarCodigoRecuperacao(codigo) {
  const s = String(codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

/**
 * Funções que dependem do material. `cifrar` usa SEMPRE o material atual;
 * `decifrar` aceita o atual e o anterior (este com `recifrar:true`).
 */
export function criarCripto({ material, materialAnterior = null } = {}) {
  conferirMaterial(material);
  const chaveDe = (finalidade, m) => derivarChave(finalidade, m);

  function cifrar(texto, finalidade, aad = '') {
    const chave = chaveDe(finalidade, material);
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', chave, iv);
    c.setAAD(Buffer.from(String(aad ?? ''), 'utf8'));
    const ct = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
    return { v: 1, alg: 'A256GCM', kid: kidDe(chave), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') };
  }

  function decifrar(cifrado, finalidade, aad = '') {
    if (!cifrado || typeof cifrado !== 'object' || cifrado.v !== 1 || cifrado.alg !== 'A256GCM'
      || typeof cifrado.kid !== 'string' || typeof cifrado.iv !== 'string' || typeof cifrado.tag !== 'string' || typeof cifrado.ct !== 'string') {
      throw new ChaveIlegivelError('Conteúdo cifrado em formato desconhecido.');
    }
    const atual = chaveDe(finalidade, material);
    let chave = null;
    let recifrar = false;
    if (cifrado.kid === kidDe(atual)) chave = atual;
    else if (materialAnterior) {
      const ant = chaveDe(finalidade, materialAnterior);
      if (cifrado.kid === kidDe(ant)) { chave = ant; recifrar = true; }
    }
    if (!chave) throw new ChaveIlegivelError();
    try {
      const d = createDecipheriv('aes-256-gcm', chave, Buffer.from(cifrado.iv, 'base64'));
      d.setAAD(Buffer.from(String(aad ?? ''), 'utf8'));
      d.setAuthTag(Buffer.from(cifrado.tag, 'base64'));
      const texto = Buffer.concat([d.update(Buffer.from(cifrado.ct, 'base64')), d.final()]).toString('utf8');
      return { texto, recifrar };
    } catch {
      throw new ChaveIlegivelError();
    }
  }

  /** HMAC-SHA256 do identificador normalizado (e-mail minúsculo; CPF só dígitos) — hex. */
  function hmacIdentificador(valor) {
    return createHmac('sha256', chaveDe('identificador', material)).update(normalizarIdentificador(valor), 'utf8').digest('hex');
  }

  /** HMAC-SHA256 do código de recuperação 'XXXX-XXXX' (nunca sha256 simples). */
  function hmacCodigoRecuperacao(codigo) {
    return createHmac('sha256', chaveDe('codigos-2fa', material)).update(normalizarCodigoRecuperacao(codigo), 'utf8').digest('hex');
  }

  return Object.freeze({
    cifrar,
    decifrar,
    hmacIdentificador,
    hmacCodigoRecuperacao,
    kidAtual: finalidade => kidDe(chaveDe(finalidade, material)),
    assinador: criarAssinador({ material, materialAnterior })
  });
}

// ---------- instância padrão do processo ----------
let padrao = null;

/** Define o material do processo (chamado pelo agregador e pelo auth-extra). */
export function configurarCripto({ material, materialAnterior = null } = {}) {
  padrao = criarCripto({ material, materialAnterior });
  return padrao;
}

/** Instância padrão: a configurada, senão JWT_SECRET/PORTAL_MATERIAL_ANTERIOR do config-portal. */
export function criptoPadrao() {
  if (!padrao) padrao = criarCripto({ material: configPortal.material, materialAnterior: configPortal.materialAnterior });
  return padrao;
}

export const cifrar = (texto, finalidade, aad) => criptoPadrao().cifrar(texto, finalidade, aad);
export const decifrar = (cifrado, finalidade, aad) => criptoPadrao().decifrar(cifrado, finalidade, aad);
export const hmacIdentificador = valor => criptoPadrao().hmacIdentificador(valor);
export const hmacCodigoRecuperacao = codigo => criptoPadrao().hmacCodigoRecuperacao(codigo);
