// =============================================================
// COMPLEXO DMC · Configuração — lê o .env e valida o essencial.
// =============================================================
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`[DMC] Variável de ambiente ${name} não definida. Copie server/.env.example para server/.env e preencha.`);
    process.exit(1);
  }
  return v.trim();
}

// ---------- Força dos segredos (OWASP A02/A05) ----------
// O JWT_SECRET assina os JWT (HS256) e é o material do HKDF do portal (cifra
// AES-256-GCM, selo, HMAC) e do HMAC do descadastro da newsletter; o
// PORTAL_MATERIAL_ANTERIOR ainda decifra e verifica durante a rotação. Em
// produção a carga é RECUSADA se um deles for curto, repetitivo, o texto de
// exemplo do .env.example ou se o anterior for igual ao atual. Fora de
// produção só avisa (nunca nos testes). O log nunca traz o valor.
export const SEGREDO_MIN_BYTES = 32;
const SEGREDO_MIN_DISTINTOS = 8;
const TRECHOS_DE_EXEMPLO = Object.freeze(['troque-por']); // server/.env.example
const MOTIVOS_SEGREDO = Object.freeze({
  curto: `tem menos de ${SEGREDO_MIN_BYTES} bytes`,
  repetitivo: `tem menos de ${SEGREDO_MIN_DISTINTOS} caracteres distintos`,
  exemplo: 'é o texto de exemplo do .env.example',
  'igual-ao-atual': 'é igual ao JWT_SECRET (a rotação não trocou o segredo)'
});

/** Produção = NODE_ENV=production ou VERCEL_ENV presente (a Vercel real sempre a define; o serve.mjs de QA, não). */
export function ehProducao(env = process.env) {
  return String(env.NODE_ENV || '').trim() === 'production' || env.VERCEL_ENV !== undefined;
}

function motivosDeFraqueza(valor) {
  const m = [];
  if (Buffer.byteLength(valor, 'utf8') < SEGREDO_MIN_BYTES) m.push('curto');
  if (new Set(Array.from(valor)).size < SEGREDO_MIN_DISTINTOS) m.push('repetitivo');
  const minusculo = valor.toLowerCase();
  if (TRECHOS_DE_EXEMPLO.some(t => minusculo.includes(t))) m.push('exemplo');
  return m;
}

/**
 * Problemas de força do JWT_SECRET e do PORTAL_MATERIAL_ANTERIOR. Puro em
 * relação ao `env`. Devolve [{ variavel, motivo }] — nunca o valor.
 * Ausência do JWT_SECRET é do required(); anterior vazio = sem rotação.
 */
export function problemasDosSegredos(env = process.env) {
  const txt = nome => (typeof env[nome] === 'string' ? env[nome].trim() : '');
  const atual = txt('JWT_SECRET');
  const anterior = txt('PORTAL_MATERIAL_ANTERIOR');
  const problemas = [];
  if (atual) for (const motivo of motivosDeFraqueza(atual)) problemas.push({ variavel: 'JWT_SECRET', motivo });
  if (anterior) {
    for (const motivo of motivosDeFraqueza(anterior)) problemas.push({ variavel: 'PORTAL_MATERIAL_ANTERIOR', motivo });
    if (atual && anterior === atual) problemas.push({ variavel: 'PORTAL_MATERIAL_ANTERIOR', motivo: 'igual-ao-atual' });
  }
  return problemas;
}

function conferirSegredos(env = process.env) {
  const problemas = problemasDosSegredos(env);
  if (!problemas.length) return;
  const porVariavel = new Map();
  for (const { variavel, motivo } of problemas) {
    porVariavel.set(variavel, [...(porVariavel.get(variavel) || []), MOTIVOS_SEGREDO[motivo]]);
  }
  if (ehProducao(env)) {
    for (const [variavel, motivos] of porVariavel) {
      console.error(`[DMC] ${variavel} recusado em produção: ${motivos.join('; ')}.`);
    }
    console.error('[DMC] Gere um segredo novo com `openssl rand -base64 48` e grave-o no painel da Vercel '
      + '(o PORTAL_MATERIAL_ANTERIOR, se usado, é o segredo anterior real e diferente do atual).');
    process.exit(1);
  }
  if (String(env.NODE_ENV || '').trim() !== 'test') {
    for (const [variavel, motivos] of porVariavel) {
      console.warn(`[DMC] aviso: ${variavel} fraco (${motivos.join('; ')}) — aceito só fora de produção.`);
    }
  }
}

// Teto do upload de material de apoio (PDF das aulas).
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB) || 25;

// Quantos proxies à frente do Express são confiáveis para ler o IP real
// (req.ip) do X-Forwarded-For. Na Vercel há exatamente um, que sobrescreve
// o cabeçalho com o IP do cliente — por isso 1. Fora dela o padrão é não
// confiar: sem proxy, qualquer cliente forjaria o cabeçalho e escaparia
// do throttle.
function trustProxy() {
  const v = (process.env.TRUST_PROXY || '').trim();
  if (!v) return process.env.VERCEL === '1' ? 1 : false;
  if (/^\d+$/.test(v)) return Number(v);
  if (v === 'false') return false;
  if (v === 'true') return true;
  return v; // ex.: "loopback", lista de IPs/CIDR
}

export const config = {
  mongoUri: required('MONGODB_URI'),
  mongoDb: (process.env.MONGODB_DB || 'complexodmc').trim(),
  // Tempo máximo para achar o servidor Mongo. Na Vercel a função dura 10 s:
  // 5 s garante que banco fora vire 503 (contato/newsletter) e não 504 do edge.
  mongoServerSelectionTimeoutMs: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS)
    || (process.env.VERCEL === '1' ? 5000 : 15000),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN || '7d').trim(),
  port: Number(process.env.PORT) || 3000,
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  devSimularPagamento: String(process.env.DEV_SIMULAR_PAGAMENTO || '').toLowerCase() === 'true',
  trustProxy: trustProxy(),
  // Aviso de novo lead (/api/contato). Opcional: sem chave ou destinatário,
  // o lead só é gravado em `leads` e registrado no log.
  leadsEmail: {
    resendApiKey: (process.env.RESEND_API_KEY || '').trim(),
    para: (process.env.LEADS_EMAIL_TO || '').trim(),
    de: (process.env.LEADS_EMAIL_FROM || '').trim()
  },
  // Aviso de nova candidatura (/api/parcerias). Opcional: mesmo provedor do
  // contato; destinatário próprio, com LEADS_EMAIL_TO de reserva.
  parceriasEmail: {
    resendApiKey: (process.env.RESEND_API_KEY || '').trim(),
    para: (process.env.PARCERIAS_EMAIL_TO || '').trim() || (process.env.LEADS_EMAIL_TO || '').trim(),
    de: (process.env.LEADS_EMAIL_FROM || '').trim()
  },
  // Aviso de nova pré-inscrição no Concurso de Bolsas (/api/bolsas). Opcional:
  // mesmo provedor do contato; destinatário próprio, com LEADS_EMAIL_TO de reserva.
  bolsasEmail: {
    resendApiKey: (process.env.RESEND_API_KEY || '').trim(),
    para: (process.env.BOLSAS_EMAIL_TO || '').trim() || (process.env.LEADS_EMAIL_TO || '').trim(),
    de: (process.env.LEADS_EMAIL_FROM || '').trim()
  },
  // Newsletter (/api/newsletter). politicaVersao é gravada em cada consentimento
  // (em produção, sem ela a inscrição é recusada com 503); o IP truncado só é
  // gravado com NEWSLETTER_GRAVAR_IP=true (a Política publicada hoje diz que o
  // IP não é gravado); o aviso interno por inscrição é opcional e desligado.
  newsletter: {
    politicaVersao: (process.env.NEWSLETTER_POLITICA_VERSAO || '').trim() || 'nao-informada',
    exigirPoliticaVersao: process.env.NODE_ENV === 'production',
    gravarIp: String(process.env.NEWSLETTER_GRAVAR_IP || '').toLowerCase() === 'true',
    // Origens aceitas no descadastro por e-mail (CSRF): produção + CORS_ORIGINS
    // + localhost fora da Vercel. Pedidos sem Origin/Referer (curl) passam.
    origensPermitidas: [
      'https://complexodmc.com.br', 'https://www.complexodmc.com.br',
      ...(process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
      ...(process.env.NEWSLETTER_ORIGENS || '').split(',').map(s => s.trim()).filter(Boolean),
      ...(process.env.VERCEL === '1' && process.env.NODE_ENV === 'production' ? [] : ['http://localhost', 'http://127.0.0.1'])
    ],
    notificar: String(process.env.NEWSLETTER_NOTIFICAR || '').toLowerCase() === 'true',
    email: {
      resendApiKey: (process.env.RESEND_API_KEY || '').trim(),
      para: (process.env.NEWSLETTER_EMAIL_TO || '').trim() || (process.env.LEADS_EMAIL_TO || '').trim(),
      de: (process.env.LEADS_EMAIL_FROM || '').trim()
    }
  },
  // Raiz do site estático (complexodmc.com.br/), servido pelo mesmo processo.
  staticRoot: path.resolve(__dirname, '..', '..', 'complexodmc.com.br'),
  // Materiais de apoio (PDF) ficam FORA do staticRoot — só saem pela API,
  // depois de checar a liberação do curso.
  uploadsRoot: process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(__dirname, '..', 'uploads'),
  maxUploadMb,
  maxUploadBytes: maxUploadMb * 1024 * 1024
};

// Depois do required(): segredo ausente mantém a mensagem de sempre.
conferirSegredos(process.env);
