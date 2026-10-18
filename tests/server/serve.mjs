// =============================================================
// QA · Servidor de teste do site, fiel ao vercel.json do repositório.
//
//   node tests/server/serve.mjs            → http://127.0.0.1:4590 (QA_PORT)
//
// - Estático: `outputDirectory` do vercel.json, com redirects, rewrites
//   e headers reais (tests/server/vercel-rotas.mjs), gzip/br, ETag, Range
//   e cache-control como a CDN da Vercel (public, max-age=0, must-revalidate).
// - /api/*: a mesma função da Vercel (api/[...path].js → Express) no mesmo
//   processo, com VERCEL=1.
// - Banco: SEMPRE um mongod DESCARTÁVEL (dbpath temporário, porta livre),
//   apagado ao sair. O server/.env NÃO é lido (DOTENV_CONFIG_PATH=/dev/null)
//   e a URI é conferida: só 127.0.0.1 na porta do mongod que este processo
//   subiu. Sem mongod → a API sobe apontando para uma porta morta e os
//   testes de integração ficam "bloqueado" (GET /__qa/estado diz o motivo).
//   QA_NO_MONGO=1 pula o mongod (Lighthouse não usa a API).
// - /__qa/estado: rota só deste servidor (não existe na Vercel).
// - Cabeçalho `x-qa-cliente: <ip>`: só aqui, vira o X-Forwarded-For da função
//   (simula clientes distintos para o throttle por IP).
// =============================================================
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { carregarVercel, rotear, RAIZ_REPO } from './vercel-rotas.mjs';

const PORTA = Number(process.env.QA_PORT || 4590);
const vc = carregarVercel();
const log = (...a) => console.log('[qa-server]', ...a);

// ---------------- MongoDB descartável ----------------
const estado = { mongo: null, motivo: null, outputDir: path.relative(RAIZ_REPO, vc.outputDir) };
let mongod = null;
let dbpath = null;

function portaLivre() {
  return new Promise((ok, erro) => {
    const s = net.createServer();
    s.once('error', erro);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
  });
}

function limparRestos() {
  for (const d of fs.readdirSync(os.tmpdir())) {
    const m = d.match(/^dmc-qa-mongo-(\d+)$/);
    if (!m) continue;
    try { process.kill(Number(m[1]), 0); } catch { fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true }); }
  }
}

function acharMongod() {
  try { return execFileSync('which', ['mongod'], { encoding: 'utf8' }).trim() || null; } catch { return null; }
}

async function subirMongo() {
  if (process.env.QA_NO_MONGO === '1') { estado.motivo = 'QA_NO_MONGO=1'; return null; }
  const bin = acharMongod();
  if (!bin) { estado.motivo = 'mongod não encontrado no PATH (instale mongodb-community ou rode com Docker)'; return null; }
  limparRestos();
  const porta = await portaLivre();
  dbpath = fs.mkdtempSync(path.join(os.tmpdir(), 'dmc-qa-mongo-tmp-'));
  const final = path.join(os.tmpdir(), `dmc-qa-mongo-${process.pid}`);
  fs.rmSync(final, { recursive: true, force: true });
  fs.renameSync(dbpath, final);
  dbpath = final;
  mongod = spawn(bin, ['--dbpath', dbpath, '--port', String(porta), '--bind_ip', '127.0.0.1', '--nounixsocket',
    '--logpath', path.join(dbpath, 'mongod.log'), '--wiredTigerCacheSizeGB', '0.25'], { stdio: 'ignore' });
  mongod.on('exit', (c) => { if (c && !saindo) log('mongod saiu com código', c); });
  const uri = `mongodb://127.0.0.1:${porta}`;
  const { MongoClient } = await import('mongodb');
  const limite = Date.now() + 20000;
  while (Date.now() < limite) {
    try {
      const c = new MongoClient(uri, { serverSelectionTimeoutMS: 800 });
      await c.connect(); await c.db('admin').command({ ping: 1 }); await c.close();
      return uri;
    } catch { await new Promise((r) => setTimeout(r, 300)); }
  }
  estado.motivo = 'mongod não respondeu em 20 s (ver ' + path.join(dbpath, 'mongod.log') + ')';
  return null;
}

const uriMongo = await subirMongo();
const DB = 'dmc_qa_e2e';
if (uriMongo) estado.mongo = { uri: uriMongo, db: DB };

// Ambiente da função — definido ANTES de importar o server.js.
process.env.DOTENV_CONFIG_PATH = '/dev/null';   // nunca lê server/.env nem .env da raiz
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.VERCEL = '1';                       // não abre a porta 3000; trust proxy = 1 como na Vercel
process.env.MONGODB_URI = uriMongo || 'mongodb://127.0.0.1:9/?serverSelectionTimeoutMS=1000';
process.env.MONGODB_DB = DB;
process.env.JWT_SECRET = crypto.randomBytes(24).toString('hex');
process.env.RESEND_API_KEY = '';                // nenhum e-mail sai do teste
process.env.LEADS_EMAIL_TO = '';
process.env.LEADS_EMAIL_FROM = '';
process.env.NEWSLETTER_NOTIFICAR = '';          // nenhum aviso interno sai do teste
process.env.NEWSLETTER_POLITICA_VERSAO = 'qa';
process.env.DEV_SIMULAR_PAGAMENTO = 'false';
process.env.CORS_ORIGINS = '';

// Trava: a URI efetiva só pode ser loopback.
if (!/^mongodb:\/\/127\.0\.0\.1:\d+(\/|$|\?)/.test(process.env.MONGODB_URI)) {
  console.error('[qa-server] URI do MongoDB não é loopback — abortando para não tocar banco real.');
  process.exit(2);
}

let funcao = null;
try {
  funcao = (await import(pathToFileURL(path.join(RAIZ_REPO, 'api', '[...path].js')).href)).default;
} catch (e) {
  estado.funcao = 'falhou ao importar: ' + (e.code || '') + ' ' + e.message.split('\n')[0];
  log(estado.funcao);
}

// ---------------- Estático ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json', '.vtt': 'text/vtt'
};
const COMPRIMIVEL = /^(text\/|application\/(json|xml|javascript|manifest)|image\/svg)/;

function existeArquivo(pathnameCru) {
  let rel;
  try { rel = decodeURIComponent(pathnameCru); } catch { return null; }
  if (rel.includes('\0')) return null;
  let f = path.join(vc.outputDir, rel);
  if (f !== vc.outputDir && !f.startsWith(vc.outputDir + path.sep)) return null;
  try {
    let st = fs.statSync(f);
    if (st.isDirectory()) { f = path.join(f, 'index.html'); st = fs.statSync(f); }
    if (!st.isFile()) return null;
    // A Vercel diferencia maiúsculas; o APFS do macOS não. Confere o nome real.
    const real = fs.realpathSync.native(f);
    if (real !== f && real.toLowerCase() === f.toLowerCase()) return null;
    return f;
  } catch { return null; }
}

const cacheGz = new Map();
function comprimido(arquivo, st, alg) {
  const k = `${arquivo}|${st.mtimeMs}|${alg}`;
  if (!cacheGz.has(k)) {
    const buf = fs.readFileSync(arquivo);
    cacheGz.set(k, alg === 'br'
      ? zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } })
      : zlib.gzipSync(buf, { level: 9 }));
  }
  return cacheGz.get(k);
}

function servirArquivo(req, res, arquivo, extra, status = 200) {
  const st = fs.statSync(arquivo);
  const tipo = MIME[path.extname(arquivo).toLowerCase()] || 'application/octet-stream';
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const h = { ...extra, 'content-type': tipo, 'cache-control': 'public, max-age=0, must-revalidate', etag, 'accept-ranges': 'bytes', vary: 'Accept-Encoding', 'x-qa-arquivo': path.relative(vc.outputDir, arquivo) };
  if (status === 200 && req.headers['if-none-match'] === etag) { res.writeHead(304, h); return res.end(); }
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (status === 200 && range) {
    let ini = range[1] === '' ? st.size - Number(range[2]) : Number(range[1]);
    let fim = range[1] === '' || range[2] === '' ? st.size - 1 : Math.min(Number(range[2]), st.size - 1);
    if (ini < 0) ini = 0;
    if (ini > fim || ini >= st.size) { res.writeHead(416, { ...h, 'content-range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...h, 'content-range': `bytes ${ini}-${fim}/${st.size}`, 'content-length': fim - ini + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(arquivo, { start: ini, end: fim }).pipe(res);
  }
  const ae = String(req.headers['accept-encoding'] || '');
  const alg = COMPRIMIVEL.test(tipo) && st.size > 512 ? (/\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : null) : null;
  if (alg) {
    const corpo = comprimido(arquivo, st, alg);
    res.writeHead(status, { ...h, 'content-encoding': alg, 'content-length': corpo.length });
    return res.end(req.method === 'HEAD' ? undefined : corpo);
  }
  res.writeHead(status, { ...h, 'content-length': st.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(arquivo).pipe(res);
}

// ---------------- HTTP ----------------
const servidor = http.createServer((req, res) => {
  const bruto = req.url || '/';
  const q = bruto.indexOf('?');
  const pathnameCru = q >= 0 ? bruto.slice(0, q) : bruto;
  const busca = q >= 0 ? bruto.slice(q) : '';

  if (pathnameCru === '/__qa/estado') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(estado));
  }

  const r = rotear(vc, pathnameCru, existeArquivo);
  if (r.acao === 'redirect') {
    const loc = r.location.includes('?') || !busca ? r.location : r.location + busca;
    res.writeHead(r.status, { ...r.headers, location: loc, 'x-qa-regra': r.regra });
    return res.end();
  }
  if (r.acao === 'arquivo') {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { ...r.headers, allow: 'GET, HEAD' }); return res.end(); }
    return servirArquivo(req, res, r.arquivo, r.headers);
  }
  if (r.acao === 'api') {
    if (!funcao) { res.writeHead(500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: estado.funcao })); }
    for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
    // A Vercel sobrescreve X-Forwarded-For com o IP do cliente. Só neste servidor de
    // teste, `x-qa-cliente: <ip>` simula clientes distintos (o throttle de /api/contato
    // é 5 envios/15 min por IP e a suíte faz mais que isso a partir de 127.0.0.1).
    const simulado = String(req.headers['x-qa-cliente'] || '');
    req.headers['x-forwarded-for'] = /^[\d.:a-f]{3,45}$/i.test(simulado) ? simulado : (req.socket.remoteAddress || '127.0.0.1');
    delete req.headers['x-qa-cliente'];
    return funcao(req, res);
  }
  const p404 = existeArquivo('/404.html');
  if (p404) return servirArquivo(req, res, p404, r.headers, 404);
  res.writeHead(404, { ...r.headers, 'content-type': 'text/plain; charset=utf-8' });
  res.end('404 — não encontrado');
});

let saindo = false;
async function encerrar(sinal) {
  if (saindo) return;
  saindo = true;
  log(`${sinal}: encerrando`);
  servidor.close();
  if (mongod && mongod.exitCode === null) {
    mongod.kill('SIGTERM');
    await new Promise((ok) => { mongod.once('exit', ok); setTimeout(ok, 4000); });
  }
  if (dbpath) fs.rmSync(dbpath, { recursive: true, force: true });
  process.exit(0);
}
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => encerrar(s));
process.on('exit', () => { if (mongod && mongod.exitCode === null) try { mongod.kill('SIGKILL'); } catch { /* já saiu */ } });

servidor.listen(PORTA, '127.0.0.1', () => {
  log(`http://127.0.0.1:${PORTA}  (estático: ${estado.outputDir}; mongo: ${uriMongo ? uriMongo + '/' + DB + ' descartável' : 'indisponível — ' + estado.motivo})`);
});
