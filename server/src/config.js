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
  // Raiz do site estático (complexodmc.com.br/), servido pelo mesmo processo.
  staticRoot: path.resolve(__dirname, '..', '..', 'complexodmc.com.br')
};
