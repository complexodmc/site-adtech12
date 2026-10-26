// =============================================================
// COMPLEXO DMC · Servidor da Plataforma EAD
// Sobe a API /api/* (MongoDB) e serve o site estático de
// complexodmc.com.br/ no mesmo processo/porta.
// =============================================================
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { connect, close, col } from './db.js';
import { loadUser } from './auth.js';
import authRoutes from './routes/auth.js';
import catalogoRoutes from './routes/catalogo.js';
import liberacoesRoutes from './routes/liberacoes.js';
import progressoRoutes from './routes/progresso.js';
import materiaisRoutes from './routes/materiais.js';
import capasRoutes from './routes/capas.js';
import duvidasRoutes from './routes/duvidas.js';
import livesRoutes from './routes/lives.js';
import certificadosRoutes from './routes/certificados.js';
import { criarRotaContato, corpoContato, criarNotificadorEmail } from './routes/contato.js';
import { requireAuth, requireAdmin } from './auth.js';
import {
  criarRotaParcerias, corpoParcerias, criarNotificadorParcerias, criarRepositorioParcerias
} from './routes/parcerias.js';
import {
  criarRotaNewsletter, criarRepositorioNewsletter, assuntoEmailInscricao, corpoEmailInscricao
} from './routes/newsletter.js';
import { capaUrl } from './routes/capas.js';
import { criarRotaVitrine, criarListagemVitrine } from './routes/vitrine.js';
import {
  criarRotaBolsas, corpoBolsas, criarNotificadorBolsas, criarRepositorioBolsas
} from './routes/bolsas.js';
import { montarPortal, tratarErroGlobal } from './portal/montar.js';

const app = express();

app.disable('x-powered-by');
// IP real atrás do proxy da Vercel (1 salto); localmente não confia em X-Forwarded-For.
// Ver config.trustProxy. É o que dá sentido ao throttle por IP.
app.set('trust proxy', config.trustProxy);
// Nenhuma resposta da API vai para cache (§9.8 A05, ASVS 8.2.1): sem o cabeçalho, a Vercel
// aplica `public, max-age=0, must-revalidate` e o navegador guarda o JSON autenticado em
// disco. Primeiro de tudo em /api, inclusive antes dos parsers (413/400 também saem assim).
// Quem quer cache (capas, vitrine, materiais, arquivos) sobrescreve no próprio router.
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
// /api/contato tem parser próprio com teto de 16 KB. Fica antes do JSON global:
// o corpo já chega consumido e o parser de 1 MB apenas segue adiante.
app.use('/api/contato', corpoContato());
// Idem para as candidaturas de parceria (/api/parcerias): 16 KB, antes do global.
app.use('/api/parcerias', corpoParcerias());
// Newsletter: mesmo parser de 16 KB do contato (JSON + urlencoded, 413/400 tratados),
// com o texto do 413 sem falar em "mensagem" (o form não tem esse campo).
app.use('/api/newsletter', corpoContato({ mensagem413: 'Conteúdo grande demais. Reduza o texto dos campos e tente de novo.' }));
// Idem para a pré-inscrição no Concurso de Bolsas (/api/bolsas): 16 KB, antes do global.
app.use('/api/bolsas', corpoBolsas());
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
app.get('/api/health/db', async (_req, res, next) => {
  try {
    await ensureConnected();
    res.json({ ok: true, db: config.mongoDb });
  } catch (err) {
    next(err);
  }
});

// Newsletter fica ANTES do middleware de conexão abaixo: a rota chama
// ensureConnected() dentro do próprio try, e banco fora vira 503 (não 500).
const repoNewsletter = criarRepositorioNewsletter(() => col.newsletter());
app.use('/api/newsletter', criarRotaNewsletter({
  salvar: async (i) => { await ensureConnected(); return repoNewsletter.salvar(i); },
  descadastrar: async (email, meta) => { await ensureConnected(); return repoNewsletter.descadastrar(email, meta); },
  segredo: config.jwtSecret,
  politicaVersao: config.newsletter.politicaVersao,
  exigirPoliticaVersao: config.newsletter.exigirPoliticaVersao,
  gravarIp: config.newsletter.gravarIp,
  origensPermitidas: config.newsletter.origensPermitidas,
  // Sem reply_to: a equipe não responde ao inscrito, e o endereço pode ter sido
  // digitado por terceiro.
  notificar: config.newsletter.notificar
    ? criarNotificadorEmail({ ...config.newsletter.email, assunto: assuntoEmailInscricao, corpo: corpoEmailInscricao, replyTo: null })
    : null
}));
// Avisos de configuração da newsletter no carregamento do módulo (a Vercel não
// executa start()); o aviso de politicaVersao sai de dentro da própria rota.
if (config.newsletter.notificar && (!config.newsletter.email.resendApiKey || !config.newsletter.email.para)) {
  console.log('[DMC] /api/newsletter: NEWSLETTER_NOTIFICAR=true, mas RESEND_API_KEY/NEWSLETTER_EMAIL_TO vazios — só grava e loga.');
}
if (!config.newsletter.gravarIp) {
  console.log('[DMC] /api/newsletter: IP truncado NÃO é gravado no consentimento (NEWSLETTER_GRAVAR_IP != "true") — coerente com a Política de Privacidade publicada.');
}

app.use('/api', async (_req, _res, next) => {
  try {
    await ensureConnected();
    next();
  } catch (err) {
    next(err);
  }
});
app.use('/api', loadUser);
app.post('/api/auth/signin', throttleAuth);
app.post('/api/auth/signup', throttleAuth);
app.use('/api/auth', authRoutes);
// Formulários do site institucional (home, interesse em treinamento).
app.use('/api/contato', criarRotaContato({
  salvar: (lead) => col.leads().insertOne(lead),
  notificar: criarNotificadorEmail(config.leadsEmail)
}));
// Candidaturas dos programas de parceria (Partner Lawyers / Business Partner)
// + painel admin do funil. Throttle próprio, separado do contato.
app.use('/api/parcerias', criarRotaParcerias({
  ...criarRepositorioParcerias(() => col.parcerias()),
  notificar: criarNotificadorParcerias(config.parceriasEmail),
  exigirAdmin: [requireAuth, requireAdmin]
}));
// Vitrine pública da DMC Business School: cursos ativos com contagens reais
// de módulos/aulas — sem token, sem vídeo, material, roteiro, checkout ou preço.
app.use('/api/vitrine', criarRotaVitrine({
  listar: criarListagemVitrine({ cursos: col.cursos, modulos: col.modulos, aulas: col.aulas, capaUrl })
}));
// Pré-inscrições do Concurso de Bolsas (um registro por e-mail) + lista da
// equipe. Throttle próprio, separado do contato e das parcerias.
app.use('/api/bolsas', criarRotaBolsas({
  ...criarRepositorioBolsas(() => col.bolsas()),
  notificar: criarNotificadorBolsas(config.bolsasEmail),
  exigirAdmin: [requireAuth, requireAdmin]
}));
// Portal do Aluno/Professor (docs/dmc/PORTAL-API.md §5.3): ponto único de montagem.
// Cada módulo é isolado — um que falhe fica de fora sem derrubar login nem LMS.
app.use('/api', montarPortal());
app.use('/api/liberacoes', liberacoesRoutes);
app.use('/api/progresso', progressoRoutes);
app.use('/api/lives', livesRoutes);
// Antes do catálogo: /cursos/:id/certificado é mais específico que /cursos/:id.
app.use('/api', certificadosRoutes);
// Antes do catálogo: /aulas/:id/materiais é mais específico que /aulas/:id.
app.use('/api', materiaisRoutes);
// Idem: /aulas/:id/duvidas antes de /aulas/:id.
app.use('/api', duvidasRoutes);
// Idem: /cursos/:id/capa antes de /cursos/:id.
app.use('/api', capasRoutes);
app.use('/api', catalogoRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// ============ Site estático ============
app.use(express.static(config.staticRoot, { extensions: ['html'] }));

// ============ Erros ============
// 413 (com o teto em MB), Mongo fora → 503, JSON quebrado → 400 e o resto → 500,
// com log resumido (sem corpo nem cabeçalhos) — server/src/portal/erros.js.
app.use(tratarErroGlobal);

let connectPromise = null;

async function ensureConnected() {
  if (!connectPromise) {
    connectPromise = connect()
      .then(() => {
        console.log(`[DMC] MongoDB conectado — banco "${config.mongoDb}"`);
      })
      .catch((err) => {
        connectPromise = null;
        throw err;
      });
  }
  return connectPromise;
}

export async function handler(req, res) {
  return app(req, res);
}

export { app, ensureConnected };
export default handler;

// ============ Boot ============
async function start() {
  try {
    await ensureConnected();
  } catch (err) {
    console.error('[DMC] falha ao conectar no MongoDB:', err.message);
    console.error('[DMC] confira MONGODB_URI no .env e se o seu IP está liberado em Network Access no Atlas.');
    process.exit(1);
  }

  const s = app.listen(config.port, () => {
    console.log(`[DMC] servidor em http://localhost:${config.port}`);
    console.log(`[DMC] plataforma em http://localhost:${config.port}/plataforma-ead/`);
    if (!config.leadsEmail.resendApiKey || !config.leadsEmail.para) {
      console.log('[DMC] /api/contato: e-mail de aviso desligado (RESEND_API_KEY/LEADS_EMAIL_TO vazios) — leads só vão para a coleção "leads".');
    }
    if (!config.parceriasEmail.resendApiKey || !config.parceriasEmail.para) {
      console.log('[DMC] /api/parcerias: e-mail de aviso desligado (RESEND_API_KEY/PARCERIAS_EMAIL_TO vazios) — candidaturas só vão para "parcerias_candidaturas".');
    }
    if (!config.bolsasEmail.resendApiKey || !config.bolsasEmail.para) {
      console.log('[DMC] /api/bolsas: e-mail de aviso desligado (RESEND_API_KEY/BOLSAS_EMAIL_TO vazios) — pré-inscrições só vão para "bolsas_preinscricoes".');
    }
    if (!config.newsletter.notificar) {
      console.log('[DMC] /api/newsletter: aviso interno por inscrição desligado (NEWSLETTER_NOTIFICAR != "true") — inscrições só vão para "newsletter_inscricoes".');
    }
    if (config.devSimularPagamento) {
      console.warn('[DMC] ⚠️  DEV_SIMULAR_PAGAMENTO=true — alunos podem liberar cursos pra si mesmos. Não use em produção.');
    }
  });
  return s;
}

const shouldListen = process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'test';
const server = shouldListen ? await start() : null;

async function shutdown(sinal) {
  if (!server) return;
  console.log(`\n[DMC] ${sinal} recebido, encerrando…`);
  server.close();
  await close();
  process.exit(0);
}
if (server) {
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
