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
