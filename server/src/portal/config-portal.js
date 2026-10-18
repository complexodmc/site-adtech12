// =============================================================
// COMPLEXO DMC · Portal — configuração (ÚNICO módulo do portal que lê
// process.env; o config.js legado não muda)
// PORTAL-API §4.17, §11 · índice D-41 (regra QA_SERVIDOR) · dono: F0a.
//
// Regra QA_SERVIDOR (D-41): as variáveis de isolamento e de provedor
// falso (PORTAL_MODULOS, PORTAL_MODULOS_IGNORAR, PORTAL_GEMINI_URL,
// PORTAL_VIACEP_URL, PORTAL_RESEND_URL) só valem com
//   QA_SERVIDOR === '1'  (definida APENAS pelo tests/server/serve.mjs)
//   && VERCEL_ENV ausente (a Vercel real sempre a define)
//   && NODE_ENV !== 'production'
// e, nas URLs, esquema http: com host 127.0.0.1. Fora disso são
// IGNORADAS, com aviso (só o nome da variável, nunca o valor). A regra
// não olha VERCEL porque o serve.mjs define VERCEL=1.
//
// Carrega o .env (dotenv é idempotente e não sobrescreve variáveis já
// definidas) para não depender da ordem de import em relação ao config.js.
// =============================================================
import 'dotenv/config';

export const PROVEDORES_PADRAO = Object.freeze({
  gemini: 'https://generativelanguage.googleapis.com',
  viacep: 'https://viacep.com.br',
  resend: 'https://api.resend.com'
});

const MIB = 1024 * 1024;
export const FOTO_MAX_BYTES = 2 * MIB;
export const BANNER_MAX_BYTES = 1 * MIB;
export const MAX_ARQUIVO_MB_PADRAO = 4;
export const MAX_ARQUIVO_MB_VERCEL = 4;

const VARIAVEIS_URL_QA = Object.freeze({ gemini: 'PORTAL_GEMINI_URL', viacep: 'PORTAL_VIACEP_URL', resend: 'PORTAL_RESEND_URL' });

function lista(valor) {
  return String(valor || '')
    .split(',')
    .map(s => s.trim().replace(/^\.\//, '').replace(/^server\/src\//, '').replace(/^src\//, ''))
    .filter(Boolean);
}

function urlBase(valor, { exigirHttps }) {
  let u;
  try { u = new URL(valor); } catch { return null; }
  if (u.username || u.password || u.search || u.hash) return null;
  if (u.protocol !== 'https:' && (exigirHttps || u.protocol !== 'http:')) return null;
  return (u.origin + u.pathname).replace(/\/+$/, '');
}

function urlProvedorQa(valor) {
  let u;
  try { u = new URL(valor); } catch { return null; }
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || u.username || u.password || u.search || u.hash) return null;
  return (u.origin + u.pathname).replace(/\/+$/, '');
}

function congelar(obj) {
  for (const v of Object.values(obj)) if (v && typeof v === 'object' && !Object.isFrozen(v)) congelar(v);
  return Object.freeze(obj);
}

/**
 * Lê a configuração do portal. Puro em relação ao `env` recebido (os
 * testes passam um objeto próprio).
 */
export function lerConfigPortal(env = process.env) {
  const txt = nome => (typeof env[nome] === 'string' ? env[nome].trim() : '');
  const presente = nome => env[nome] !== undefined && env[nome] !== null;

  const vercel = txt('VERCEL') === '1';
  const nodeEnv = txt('NODE_ENV');
  const producao = nodeEnv === 'production';
  const qa = txt('QA_SERVIDOR') === '1' && !presente('VERCEL_ENV') && !producao;

  const ignoradas = [];
  const invalidas = [];

  // Base dos links de e-mail e do QR: nunca o cabeçalho Host.
  let baseUrl = null;
  let baseUrlOrigem = null;
  if (txt('PORTAL_BASE_URL')) {
    const v = urlBase(txt('PORTAL_BASE_URL'), { exigirHttps: producao });
    if (v) { baseUrl = v; baseUrlOrigem = 'env'; } else invalidas.push('PORTAL_BASE_URL');
  }
  if (!baseUrl && !vercel) {
    const porta = /^\d{1,5}$/.test(txt('PORT')) ? Number(txt('PORT')) : 3000;
    baseUrl = `http://localhost:${porta}`;
    baseUrlOrigem = 'local';
  }

  const timeout = /^\d{1,6}$/.test(txt('PORTAL_IA_TIMEOUT_MS')) ? Number(txt('PORTAL_IA_TIMEOUT_MS')) : NaN;
  const iaTimeoutMs = timeout >= 1000 && timeout <= 120000 ? timeout : (vercel ? 8000 : 20000);

  let mb = /^\d+(\.\d+)?$/.test(txt('PORTAL_MAX_ARQUIVO_MB')) ? Number(txt('PORTAL_MAX_ARQUIVO_MB')) : MAX_ARQUIVO_MB_PADRAO;
  if (!(mb > 0)) mb = MAX_ARQUIVO_MB_PADRAO;
  if (vercel) mb = Math.min(mb, MAX_ARQUIVO_MB_VERCEL);
  const maxArquivoBytes = Math.floor(mb * MIB);

  // Isolamento de módulos no E2E por fatia (só com a regra QA_SERVIDOR).
  let modulosFiltro = { so: null, ignorar: [] };
  const so = lista(env.PORTAL_MODULOS);
  const ignorar = lista(env.PORTAL_MODULOS_IGNORAR);
  if (qa) modulosFiltro = { so: so.length ? so : null, ignorar };
  else {
    if (txt('PORTAL_MODULOS')) ignoradas.push('PORTAL_MODULOS');
    if (txt('PORTAL_MODULOS_IGNORAR')) ignoradas.push('PORTAL_MODULOS_IGNORAR');
  }

  // Provedores: hosts fixos (A10); provedor falso só com a regra QA_SERVIDOR e http://127.0.0.1.
  const urlsProvedor = { ...PROVEDORES_PADRAO };
  for (const [chave, nome] of Object.entries(VARIAVEIS_URL_QA)) {
    if (!txt(nome)) continue;
    const v = qa ? urlProvedorQa(txt(nome)) : null;
    if (v) urlsProvedor[chave] = v; else ignoradas.push(nome);
  }

  return congelar({
    baseUrl,
    baseUrlOrigem,
    resendApiKey: txt('RESEND_API_KEY') || null,
    emailDe: txt('PORTAL_EMAIL_FROM') || txt('LEADS_EMAIL_FROM') || null,
    geminiApiKey: txt('GEMINI_API_KEY') || null,
    iaTimeoutMs,
    maxArquivoBytes,
    fotoMaxBytes: FOTO_MAX_BYTES,
    bannerMaxBytes: BANNER_MAX_BYTES,
    vercel,
    producao,
    doisFatores: txt('PORTAL_2FA') === '1',
    // Material do HKDF (cifra, selo, HMAC de identificador): o JWT_SECRET (decisão do CEO).
    material: txt('JWT_SECRET') || null,
    materialAnterior: txt('PORTAL_MATERIAL_ANTERIOR') || null,
    qa,
    modulosFiltro,
    urlsProvedor,
    estrito: producao || vercel || txt('PORTAL_MODULOS_ESTRITO') === '1',
    falharCedo: nodeEnv === 'test',
    ignoradas,
    invalidas
  });
}

/** Avisos de configuração (nomes de variável e estados; NUNCA valores). */
export function avisosDeConfiguracao(cfg) {
  const a = [];
  if (!cfg.resendApiKey || !cfg.emailDe) a.push('e-mail transacional desligado (RESEND_API_KEY/PORTAL_EMAIL_FROM vazios)');
  if (cfg.baseUrlOrigem !== 'env') {
    a.push(cfg.baseUrl
      ? 'PORTAL_BASE_URL ausente — fora da Vercel os links usam localhost'
      : 'PORTAL_BASE_URL ausente — fluxos por link indisponíveis');
  }
  if (cfg.invalidas?.length) a.push(`variável com formato inválido ignorada (${cfg.invalidas.join(', ')})`);
  if (cfg.geminiApiKey) a.push('GEMINI_API_KEY definida no ambiente — o painel não troca a chave');
  if (!cfg.doisFatores) a.push('PORTAL_2FA desligado — verificação em duas etapas indisponível');
  if (cfg.ignoradas?.length) a.push(`variável de QA ignorada (${cfg.ignoradas.join(', ')}) fora da regra QA_SERVIDOR`);
  if (cfg.materialAnterior) a.push('PORTAL_MATERIAL_ANTERIOR presente — janela de rotação aberta');
  if (!cfg.material) a.push('JWT_SECRET ausente — cifra, selo e HMAC do portal indisponíveis');
  if (cfg.qa) a.push('regra QA_SERVIDOR ativa — filtro de módulos e provedores falsos permitidos');
  return a;
}

export const configPortal = lerConfigPortal();

// Impressos UMA vez no carregamento (a Vercel não executa start()); silêncio nos testes de unidade.
if (process.env.NODE_ENV !== 'test') {
  for (const aviso of avisosDeConfiguracao(configPortal)) console.warn(`[portal] ${aviso}`);
}
