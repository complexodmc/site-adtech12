// =============================================================
// COMPLEXO DMC · Portal — validação e normalização (PURO)
// PORTAL-API §1.2, §4.10, §6.3.1 · dono: F0a.
//
// Leitores `ler*` lançam ErroPortal:
//   400 'validacao'        { campos: { [campo]: mensagem } }
//   400 'formato-invalido' quando chega objeto/array/booleano onde se
//                          espera escalar (barra injeção de operador).
// Validadores `validar*` não lançam: devolvem o valor normalizado ou null.
// Nada aqui consulta banco ou rede.
// =============================================================
import { ObjectId } from 'mongodb';
import { texto, EMAIL_RE } from '../routes/contato.js';
import { ErroPortal } from './erros.js';

export { texto, EMAIL_RE } from '../routes/contato.js';
export { truncarIp } from '../routes/newsletter.js';

/** 27 siglas (mesma lista de parcerias/bolsas). */
export const UFS = Object.freeze([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]);

export const ID_RE = /^[a-f0-9]{24}$/;
export const ID_LEGADO_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const LINK_INTERNO_RE = /^[a-z0-9-]+\.html(\?[^#\s]{0,200})?(#[\w/-]{0,80})?$/;

// ---------- erros dos leitores ----------
function invalido(campo, mensagem) {
  return new ErroPortal(400, 'validacao', 'Confira os campos destacados.', { campos: { [campo]: mensagem } });
}
function formatoInvalido(campo) {
  return new ErroPortal(400, 'formato-invalido', 'Formato inválido.', campo ? { campos: { [campo]: 'Formato inválido.' } } : {});
}
const vazio = v => v === undefined || v === null || v === '';
const tamanho = s => [...s].length;

// ---------- leitores ----------
/**
 * Lê `corpo[campo]` como texto (regra `texto()` do contato: NFC, controle removido).
 * @returns {string|null} null quando ausente/vazio e não obrigatório
 */
export function lerTexto(corpo, campo, { min = 0, max = Infinity, obrigatorio = false, multilinha = false } = {}) {
  const bruto = corpo && typeof corpo === 'object' ? corpo[campo] : undefined;
  if (typeof bruto === 'boolean') throw formatoInvalido(campo);
  const s = texto(bruto, { multilinha });
  if (s === null) throw formatoInvalido(campo);
  if (s === '') {
    if (obrigatorio) throw invalido(campo, 'Campo obrigatório.');
    return null;
  }
  const n = tamanho(s);
  if (n < min) throw invalido(campo, `Use pelo menos ${min} caracteres.`);
  if (n > max) throw invalido(campo, `Use no máximo ${max} caracteres.`);
  return s;
}

/** Valor de uma lista fechada (array, Set ou chaves de objeto). */
export function lerEnum(valor, lista, campo, { obrigatorio = false } = {}) {
  if (vazio(valor)) {
    if (obrigatorio) throw invalido(campo, 'Escolha uma opção.');
    return null;
  }
  if (typeof valor !== 'string') throw formatoInvalido(campo);
  const opcoes = Array.isArray(lista) ? lista : lista instanceof Set ? [...lista] : Object.keys(lista || {});
  if (!opcoes.includes(valor)) throw invalido(campo, 'Opção inválida.');
  return valor;
}

function lerNumerico(valor, campo, { min = -Infinity, max = Infinity, obrigatorio = false, inteiro = false, casas = null } = {}) {
  if (vazio(valor)) {
    if (obrigatorio) throw invalido(campo, 'Campo obrigatório.');
    return null;
  }
  let n;
  if (typeof valor === 'number') n = valor;
  else if (typeof valor === 'string') {
    const s = valor.trim();
    const re = inteiro ? /^-?\d+$/ : /^-?\d+([.,]\d+)?$/;
    if (!re.test(s)) throw invalido(campo, inteiro ? 'Informe um número inteiro.' : 'Informe um número.');
    n = Number(s.replace(',', '.'));
  } else throw formatoInvalido(campo);
  if (!Number.isFinite(n)) throw invalido(campo, 'Informe um número.');
  if (inteiro && !Number.isInteger(n)) throw invalido(campo, 'Informe um número inteiro.');
  if (casas !== null) n = Math.round(n * 10 ** casas) / 10 ** casas;
  if (n < min || n > max) {
    const faixa = Number.isFinite(min) && Number.isFinite(max) ? `entre ${min} e ${max}` : Number.isFinite(min) ? `a partir de ${min}` : `até ${max}`;
    throw invalido(campo, `Use um valor ${faixa}.`);
  }
  return n;
}

/** Inteiro (número ou string de dígitos). Ausente → null (ou 400 com `obrigatorio`). */
export function lerInteiro(valor, { min, max, obrigatorio = false } = {}, campo) {
  return lerNumerico(valor, campo, { min, max, obrigatorio, inteiro: true });
}

/** Número (aceita vírgula decimal em string); `casas` arredonda. */
export function lerNumero(valor, { min, max, obrigatorio = false, casas = null } = {}, campo) {
  return lerNumerico(valor, campo, { min, max, obrigatorio, casas });
}

/** Booleano JSON (ou 'true'/'false' vindo de query). Ausente → null. */
export function lerBooleano(valor, campo) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'boolean') return valor;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  throw formatoInvalido(campo);
}

/** ObjectId a partir de hex de 24 (minúsculo); qualquer outra coisa → null (a rota responde 404 sem consultar). */
export function lerId(valor) {
  if (typeof valor !== 'string' || !ID_RE.test(valor)) return null;
  return new ObjectId(valor);
}

/** Id legado (curso/módulo/aula/live): string ^[A-Za-z0-9_-]{1,64}$ ou null. */
export function lerIdLegado(valor) {
  return typeof valor === 'string' && ID_LEGADO_RE.test(valor) ? valor : null;
}

/** ?pagina= (≥ 1; inválido → 1) e ?porPagina= (1–max; inválido → padrão). */
export function lerPagina(query, { porPaginaPadrao = 25, max = 100 } = {}) {
  const inteiroPositivo = v => (typeof v === 'string' && /^\d{1,6}$/.test(v.trim()) ? Number(v) : typeof v === 'number' && Number.isInteger(v) ? v : NaN);
  let pagina = inteiroPositivo(query?.pagina);
  if (!(pagina >= 1)) pagina = 1;
  let porPagina = inteiroPositivo(query?.porPagina);
  if (!(porPagina >= 1 && porPagina <= max)) porPagina = porPaginaPadrao;
  return { pagina, porPagina, pular: (pagina - 1) * porPagina };
}

// ---------- documentos ----------
function digitosDV(base, pesoInicial) {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
  const r = (soma * 10) % 11;
  return r === 10 ? 0 : r;
}

/** CPF com ou sem máscara → 11 dígitos, ou null (DV errado, repetidos, tamanho). */
export function validarCpf(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!/^[\d.\-\s]+$/.test(s)) return null;
  const d = s.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return null;
  if (digitosDV(d.slice(0, 9), 10) !== Number(d[9])) return null;
  if (digitosDV(d.slice(0, 10), 11) !== Number(d[10])) return null;
  return d;
}

/** CNPJ com ou sem máscara → 14 dígitos, ou null. */
export function validarCnpj(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!/^[\d.\-/\s]+$/.test(s)) return null;
  const d = s.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return null;
  const dv = (base) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...base].reduce((acc, c, i) => acc + Number(c) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  if (dv(d.slice(0, 12)) !== Number(d[12])) return null;
  if (dv(d.slice(0, 13)) !== Number(d[13])) return null;
  return d;
}

/** Passaporte: ^[A-Z0-9]{5,20}$ depois de maiúsculas e sem espaço/hífen. */
export function validarPassaporte(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{5,20}$/.test(s) ? s : null;
}

// ---------- datas (calendário e fuso de São Paulo) ----------
const FMT_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** 'AAAA-MM-DD' de uma data real (30/02 e 29/02 fora de bissexto → null), opcionalmente entre min e max. */
export function validarDataCalendario(v, { min = null, max = null } = {}) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (a < 1 || mes < 1 || mes > 12 || dia < 1) return null;
  const d = new Date(Date.UTC(a, mes - 1, dia));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  if (min && s < min) return null;
  if (max && s > max) return null;
  return s;
}

/** "Hoje" no fuso de São Paulo, 'AAAA-MM-DD'. */
export function hojeSP(agora = new Date()) {
  return FMT_SP.format(agora);
}

/** Ano no fuso de São Paulo. */
export function anoSP(agora = new Date()) {
  return Number(hojeSP(agora).slice(0, 4));
}

// ---------- contato e endereço ----------
/** CEP com ou sem hífen → 8 dígitos, ou null. */
export function validarCep(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  if (!/^\d{5}-?\d{3}$/.test(s)) return null;
  const d = s.replace('-', '');
  return d === '00000000' ? null : d;
}

/** Instagram: ^@?[A-Za-z0-9._]{1,30}$ — grava sem '@'. */
export function validarInstagram(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!/^@?[A-Za-z0-9._]{1,30}$/.test(s)) return null;
  return s.replace(/^@/, '');
}

/**
 * Facebook: usuário ou URL facebook.com/fb.com → grava o caminho
 * ('nome.sobrenome' ou 'profile.php?id=123'), ou null.
 */
export function validarFacebook(v) {
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (!s || s.length > 200) return null;
  const USUARIO = /^[A-Za-z0-9.]{3,50}$/;
  if (USUARIO.test(s) && !/\.(com|net|org)(\.br)?$/i.test(s)) return s;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.username || u.password) return null;
  if (!/^((www|m|web|pt-br)\.)?(facebook\.com|fb\.com)$/i.test(u.hostname)) return null;
  const caminho = u.pathname.replace(/^\/+|\/+$/g, '');
  if (caminho.toLowerCase() === 'profile.php') {
    const id = u.searchParams.get('id');
    return id && /^\d{5,20}$/.test(id) ? `profile.php?id=${id}` : null;
  }
  return USUARIO.test(caminho) ? caminho : null;
}

const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99
]);

function numeroBrasileiro(nacional) {
  // DDD válido + 9 dígitos começando por 9 (celular) ou 8 dígitos (fixo).
  if (!/^\d{10,11}$/.test(nacional)) return false;
  if (!DDDS.has(Number(nacional.slice(0, 2)))) return false;
  const assinante = nacional.slice(2);
  if (assinante.length === 9) return assinante[0] === '9';
  return /^[2-9]/.test(assinante);
}

/**
 * Celular em E.164 ('+5511987654321'), ou null.
 * '+' + DDI + 8–15 dígitos; '00' vale como '+'. Sem '+': 10–11 dígitos → assume DDI 55;
 * 12–13 dígitos começando por 55 → Brasil. DDI 55 exige DDD válido + 8–9 dígitos.
 */
export function validarCelular(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  let s = String(v).trim();
  if (!s || !/^[+\d\s().-]+$/.test(s)) return null;
  s = s.replace(/[\s().-]/g, '');
  let internacional = false;
  if (s.startsWith('+')) { internacional = true; s = s.slice(1); } else if (s.startsWith('00')) { internacional = true; s = s.slice(2); }
  if (!/^\d+$/.test(s)) return null;
  if (!internacional) {
    if (s.length === 10 || s.length === 11) return numeroBrasileiro(s) ? `+55${s}` : null;
    if ((s.length === 12 || s.length === 13) && s.startsWith('55')) return numeroBrasileiro(s.slice(2)) ? `+${s}` : null;
    return null;
  }
  if (s.length < 8 || s.length > 15 || s[0] === '0') return null;
  if (s.startsWith('55')) return numeroBrasileiro(s.slice(2)) ? `+${s}` : null;
  return `+${s}`;
}

/** País vazio (padrão) ou 'Brasil'/'Brazil' em qualquer grafia. */
export function ehBrasil(pais) {
  if (pais === undefined || pais === null) return true;
  if (typeof pais !== 'string') return false;
  const n = normalizarNome(pais);
  return n === '' || n === 'brasil' || n === 'brazil';
}

/** Código postal do exterior: 3–12 de [A-Za-z0-9 -], maiúsculas, espaços colapsados. */
export function validarCodigoPostal(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!/^[A-Z0-9 -]{3,12}$/.test(s) || !/[A-Z0-9]/.test(s)) return null;
  return s;
}

// ---------- mascaramento (log e IA) ----------
const CPF_MASCARA_RE = /(?<![\d.\-])\d{3}\.\d{3}\.\d{3}-\d{2}(?![\d.\-])/g;
// 13–19 dígitos agrupados por espaço ou hífen (cartão).
const CARTAO_RE = /(?<![\dA-Za-z])\d(?:[ -]?\d){12,18}(?![\dA-Za-z])/g;
// 7+ dígitos seguidos, com ou sem ponto/hífen entre eles (RG, telefone, conta); sufixo -X do RG.
const NUMERO_RE = /(?<![\dA-Za-z])\d(?:[.-]?\d){6,}(?:-[\dXx])?(?![\dA-Za-z])/g;
const DATA_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const CHAR_LOCAL_EMAIL = /[A-Za-z0-9._%+-]/;
const CHAR_DOMINIO_EMAIL = /[A-Za-z0-9.-]/;

function dominioDeEmail(d) {
  const rotulos = d.split('.');
  return rotulos.length >= 2
    && rotulos.every(r => /^[A-Za-z0-9-]+$/.test(r))
    && /^[A-Za-z]{2,}$/.test(rotulos[rotulos.length - 1]);
}

// Varredura LINEAR a partir de cada '@' (uma regex com o local-part livre seria quadrática
// em textos longos sem '@' — risco de negação de serviço no log e no assistente).
function mascararEmails(s) {
  if (!s.includes('@')) return s;
  let saida = '';
  let ultimo = 0;
  for (let at = s.indexOf('@'); at !== -1; at = s.indexOf('@', at + 1)) {
    if (at < ultimo) continue;
    let ini = at;
    while (ini > ultimo && CHAR_LOCAL_EMAIL.test(s[ini - 1])) ini--;
    let fim = at + 1;
    while (fim < s.length && CHAR_DOMINIO_EMAIL.test(s[fim])) fim++;
    const dominio = s.slice(at + 1, fim).replace(/[.-]+$/, '');
    if (ini === at || !dominioDeEmail(dominio)) continue;
    saida += s.slice(ultimo, ini) + '[E-MAIL]';
    ultimo = at + 1 + dominio.length;
  }
  return saida + s.slice(ultimo);
}

/**
 * Mascara dado pessoal em texto livre: e-mail → [E-MAIL]; CPF (com ou sem máscara) → [CPF];
 * cartão (13–19 dígitos, agrupados ou não) e sequências de 7+ dígitos (RG, telefone, conta) → [NÚMERO].
 * Datas 'AAAA-MM-DD' são preservadas (a IA e o log precisam delas).
 */
export function mascararDadosPessoais(entrada) {
  let s = typeof entrada === 'string' ? entrada : String(entrada ?? '');
  const original = s;
  s = mascararEmails(s);
  s = s.replace(CPF_MASCARA_RE, '[CPF]');
  s = s.replace(CARTAO_RE, '[NÚMERO]');
  s = s.replace(NUMERO_RE, (m) => {
    if (DATA_ISO_RE.test(m)) return m;
    const d = m.replace(/[^\d]/g, '');
    if (d.length === 11 && /^\d+$/.test(m) && validarCpf(m)) return '[CPF]';
    return '[NÚMERO]';
  });
  return { texto: s, mascarado: s !== original };
}

// ---------- URLs e links ----------
/** Só https:, sem credenciais, ≤ 500 caracteres. */
export function validarUrlHttps(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 500 || /\s/.test(s)) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname) return null;
  return u.href.length <= 500 ? u.href : null;
}

/** Link interno relativo da plataforma ('pagina.html?x=1#y'); recusa '//x', 'javascript:', 'https:'. */
export function validarLinkInterno(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return LINK_INTERNO_RE.test(s) ? s : null;
}

// ---------- busca ----------
const CLASSES_SEM_ACENTO = {
  a: '[aáàâãäAÁÀÂÃÄ]', e: '[eéèêëEÉÈÊË]', i: '[iíìîïIÍÌÎÏ]', o: '[oóòôõöOÓÒÔÕÖ]',
  u: '[uúùûüUÚÙÛÜ]', c: '[cçCÇ]', n: '[nñNÑ]'
};
const escaparRegex = s => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/**
 * Termos de busca → RegExp[] escapadas, insensíveis a acento e a caixa (flag i).
 * 2–80 caracteres, até 5 palavras (as demais são ignoradas). Fora disso ou não-string → null.
 */
export function regexBusca(q) {
  if (typeof q !== 'string') return null;
  const s = q.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (tamanho(s) < 2 || tamanho(s) > 80) return null;
  const palavras = normalizarNome(s).split(' ').filter(Boolean).slice(0, 5);
  if (!palavras.length) return null;
  return palavras.map(p => new RegExp(
    [...p].map(ch => CLASSES_SEM_ACENTO[ch] || escaparRegex(ch)).join(''),
    'i'
  ));
}

/** Sem acento, minúsculas, espaços colapsados. */
export function normalizarNome(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Iniciais do primeiro e do último nome: 'Joana da Silva' → 'J. S.'; um nome → 'J.'. */
export function iniciais(nome) {
  const partes = String(nome ?? '').normalize('NFC').trim().split(/\s+/).filter(p => /\p{L}/u.test(p));
  if (!partes.length) return '';
  const letra = p => (p.match(/\p{L}/u) || [''])[0].toLocaleUpperCase('pt-BR');
  const usadas = partes.length === 1 ? [partes[0]] : [partes[0], partes[partes.length - 1]];
  return usadas.map(p => `${letra(p)}.`).join(' ');
}

// Referência explícita para quem importa só o validador de e-mail.
export const validarEmail = (v) => {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return s.length <= 254 && EMAIL_RE.test(s) ? s : null;
};
