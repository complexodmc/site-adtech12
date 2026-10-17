// Emulador local do roteamento da Vercel a partir de .vercel/output/config.json (Build Output v3).
// Fases: rotas antes de `handle: filesystem` (redirects) -> filesystem -> rotas até `handle: error`
// (rewrites com `check`) -> 404. Função api/[...path].func importada como no vercel-func-smoke.mjs.
// NÃO é o proxy da Vercel; serve para conferir a config compilada antes do deploy.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();
const out = path.join(root, '.vercel', 'output');
const cfg = JSON.parse(fs.readFileSync(path.join(out, 'config.json'), 'utf8'));
const staticDir = path.join(out, 'static');
const funcDir = path.join(out, 'functions', 'api', '[...path].func');
process.env.VERCEL = '1';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017';
process.env.JWT_SECRET ||= 'dummy-validacao-local';
let fn = null;
try { fn = (await import(pathToFileURL(path.join(funcDir, 'api', '[...path].js')).href)).default; }
catch (e) { console.error('função não importou:', e.code, e.message.split('\n')[0]); }

const phases = { pre: [], fs: [], err: [] };
let cur = 'pre';
for (const r of cfg.routes) {
  if (r.handle === 'filesystem') { cur = 'fs'; continue; }
  if (r.handle === 'error') { cur = 'err'; continue; }
  if (r.handle === 'miss' || r.handle === 'hit' || r.handle === 'resource') { cur = 'skip'; continue; }
  if (cur !== 'skip') phases[cur].push(r);
}
const headersFor = (p) => {
  const h = {};
  for (const r of cfg.routes) { if (r.continue && r.headers && new RegExp(r.src).test(p)) Object.assign(h, r.headers); }
  return h;
};
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.xml': 'application/xml', '.txt': 'text/plain', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
function staticFile(p) {
  let f = path.join(staticDir, decodeURIComponent(p));
  if (!f.startsWith(staticDir)) return null;
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
}
function sub(tpl, m) { return tpl.replace(/\$(\d+)/g, (_, i) => m[+i] ?? ''); }

const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = url.pathname;
  const extra = headersFor(p);
  const finish = (code, body, h = {}) => { res.writeHead(code, { ...extra, ...h }); res.end(body); };
  const tryFile = (pp) => { const f = staticFile(pp); if (!f) return false; finish(200, fs.readFileSync(f), { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'x-served-file': path.relative(staticDir, f) }); return true; };
  const runFn = () => { if (!fn) return finish(500, 'função ausente'); req.url = p + url.search; fn(req, res); return true; };
  const handle = (r, m) => {
    if (r.status && r.headers?.Location) { finish(r.status, '', { location: sub(r.headers.Location, m) }); return true; }
    if (r.dest) {
      const d = sub(r.dest, m).split('?')[0];
      if (d.startsWith('/api/[...path]')) return runFn();
      if (tryFile(d)) return true;
      if (r.check) { p = d; return false; }
    }
    if (r.status && !r.dest) { finish(r.status, ''); return true; }
    return false;
  };
  for (const r of phases.pre) { if (r.headers && r.continue) continue; const m = p.match(new RegExp(r.src)); if (m && handle(r, m)) return; }
  if (tryFile(p)) return;
  for (const r of phases.fs) { const m = p.match(new RegExp(r.src)); if (m && handle(r, m)) return; }
  if (tryFile(p)) return;
  finish(404, 'not found');
});
srv.listen(+(process.env.PORT || 8081), '127.0.0.1', () => console.log('emulador em http://127.0.0.1:' + srv.address().port));
