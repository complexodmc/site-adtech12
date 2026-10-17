// Importa o handler da função empacotada (.func) e chama GET /api/health via HTTP local.
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const funcDir = process.argv[2];
process.env.VERCEL = '1';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017';
process.env.JWT_SECRET ||= 'dummy-validacao-local';
try {
  const mod = await import(pathToFileURL(path.join(funcDir, 'api', '[...path].js')).href);
  const handler = mod.default;
  const srv = http.createServer((req, res) => handler(req, res));
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const r = await fetch(`http://127.0.0.1:${port}/api/health`);
  console.log(JSON.stringify({ import: 'ok', status: r.status, body: await r.text() }));
  srv.close();
  process.exit(0);
} catch (e) {
  console.log(JSON.stringify({ import: 'falhou', code: e.code, message: String(e.message).split('\n')[0] }));
  process.exit(2);
}
