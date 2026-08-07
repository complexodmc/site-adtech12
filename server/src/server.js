// =============================================================
// COMPLEXO DMC · Servidor da Plataforma EAD
// Sobe a API /api/* (MongoDB) e serve o site estático de
// complexodmc.com.br/ no mesmo processo/porta.
// =============================================================
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { connect, close } from './db.js';
import { loadUser } from './auth.js';
import authRoutes from './routes/auth.js';
import catalogoRoutes from './routes/catalogo.js';
import liberacoesRoutes from './routes/liberacoes.js';
import progressoRoutes from './routes/progresso.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

if (config.corsOrigins.length) {
  app.use('/api', cors({ origin: config.corsOrigins, credentials: false }));
}

// ============ Throttle de tentativas de credencial ============
// Janela deslizante em memória por IP, sem dependência externa.
// Vale só pra signin/signup — quem valida senha. NÃO pode pegar o
// GET /auth/me: o front chama ele a cada carregamento de página, e
// o throttle derrubaria a sessão de quem só está navegando.
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX = 20;
const authHits = new Map();

function throttleAuth(req, res, next) {
  const ip = req.ip || 'desconhecido';
  const agora = Date.now();
  const hits = (authHits.get(ip) || []).filter(t => agora - t < AUTH_WINDOW_MS);
  if (hits.length >= AUTH_MAX) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
  }
  hits.push(agora);
  authHits.set(ip, hits);
  next();
}
setInterval(() => {
  const agora = Date.now();
  for (const [ip, hits] of authHits) {
    const vivos = hits.filter(t => agora - t < AUTH_WINDOW_MS);
    if (vivos.length) authHits.set(ip, vivos);
    else authHits.delete(ip);
  }
}, AUTH_WINDOW_MS).unref();

// ============ API ============
app.get('/api/health', (_req, res) => res.json({ ok: true, db: config.mongoDb }));

app.use('/api', loadUser);
app.post('/api/auth/signin', throttleAuth);
app.post('/api/auth/signup', throttleAuth);
app.use('/api/auth', authRoutes);
app.use('/api/liberacoes', liberacoesRoutes);
app.use('/api/progresso', progressoRoutes);
app.use('/api', catalogoRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// ============ Site estático ============
app.use(express.static(config.staticRoot, { extensions: ['html'] }));

// ============ Erros ============
app.use((err, _req, res, _next) => {
  console.error('[DMC] erro não tratado:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Erro interno no servidor.' });
});

// ============ Boot ============
const server = await (async () => {
  try {
    await connect();
    console.log(`[DMC] MongoDB conectado — banco "${config.mongoDb}"`);
  } catch (err) {
    console.error('[DMC] falha ao conectar no MongoDB:', err.message);
    console.error('[DMC] confira MONGODB_URI no .env e se o seu IP está liberado em Network Access no Atlas.');
    process.exit(1);
  }

  const s = app.listen(config.port, () => {
    console.log(`[DMC] servidor em http://localhost:${config.port}`);
    console.log(`[DMC] plataforma em http://localhost:${config.port}/plataforma-ead/`);
    if (config.devSimularPagamento) {
      console.warn('[DMC] ⚠️  DEV_SIMULAR_PAGAMENTO=true — alunos podem liberar cursos pra si mesmos. Não use em produção.');
    }
  });
  return s;
})();

async function shutdown(sinal) {
  console.log(`\n[DMC] ${sinal} recebido, encerrando…`);
  server.close();
  await close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
