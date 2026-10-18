// =============================================================
// COMPLEXO DMC · Apoio de teste — HTTP (servidor efêmero + cliente)
// PORTAL-API §9.1 · dono: F0a.
//
//   const { server, base } = await subir(app);   // listen(0, '127.0.0.1')
//   const api = cliente(base);
//   const r = await api.get('/api/portal/me/perfil', { usuario: 'u-aluno1' });
//   r.status, r.headers, r.corpo (JSON ou texto)
//   await fechar(server);
//
// usuarioDeTeste: cabeçalho `x-teste-usuario: <fixture ou hex>` → req.user
// lido do banco em memória (faz o papel do loadUser, inclusive conta
// desativada → anônimo). Uso: app.use(usuarioDeTeste({ banco })) ou, com
// app.locals.banco definido, app.use(usuarioDeTeste).
// =============================================================
import express from 'express';
import { ObjectId } from 'mongodb';
import { IDS } from './fixtures-portal.js';
import { tratarErroGlobal } from '../../src/portal/erros.js';

export const CABECALHO_USUARIO = 'x-teste-usuario';

/** Sobe o app numa porta efêmera de 127.0.0.1. */
export function subir(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}`, porta: port });
    });
    server.on('error', reject);
  });
}

export function fechar(server) {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

function idDoCabecalho(valor) {
  if (typeof valor !== 'string' || !valor) return null;
  if (Object.hasOwn(IDS, valor)) return IDS[valor];
  return /^[a-f0-9]{24}$/.test(valor) ? valor : null;
}

async function carregarUsuario(req, { banco = null, usuarios = null } = {}) {
  const id = idDoCabecalho(req.get(CABECALHO_USUARIO));
  if (!id) return null;
  if (usuarios) return usuarios[id] || Object.values(usuarios).find(u => String(u?._id) === id) || null;
  const b = banco || req.app?.locals?.banco;
  if (!b) throw new Error('usuarioDeTeste: informe { banco } ou defina app.locals.banco');
  return b.collection('users').findOne({ _id: new ObjectId(id) });
}

/**
 * Middleware de usuário de teste. Duas formas:
 *   app.use(usuarioDeTeste({ banco }))      — fábrica (banco em memória ou mapa `usuarios`)
 *   app.use(usuarioDeTeste)                 — direto, lendo app.locals.banco
 */
export function usuarioDeTeste(a, b, c) {
  const comoMiddleware = typeof c === 'function';
  const opcoes = comoMiddleware ? {} : (a || {});
  const middleware = async (req, _res, next) => {
    try {
      const user = await carregarUsuario(req, opcoes);
      if (user && !user.desativadoEm) req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
  return comoMiddleware ? middleware(a, b, c) : middleware;
}

/**
 * App de teste no formato do server.js: JSON 1 MB → usuarioDeTeste → montar(app) → 404 JSON → tratarErroGlobal.
 * @param {{ banco?: object, montar?: (app) => void, limiteJson?: string }} opcoes
 */
export function criarAppDeTeste({ banco = null, montar = () => {}, limiteJson = '1mb' } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (banco) app.locals.banco = banco;
  app.use(express.json({ limit: limiteJson }));
  app.use(usuarioDeTeste({ banco }));
  montar(app);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(tratarErroGlobal);
  return app;
}

async function lerResposta(r) {
  const texto = await r.text();
  let corpo = texto;
  if ((r.headers.get('content-type') || '').includes('application/json')) {
    try { corpo = JSON.parse(texto); } catch { /* fica o texto */ }
  }
  return { status: r.status, headers: r.headers, corpo, texto };
}

/**
 * Cliente fetch: get/post/put/del/raw. Opções: { usuario, token, headers, corpoCru, tipo }.
 *   usuario → cabeçalho x-teste-usuario; token → Authorization: Bearer.
 */
export function cliente(base) {
  const pedir = async (metodo, caminho, corpo, { usuario = null, token = null, headers = {}, corpoCru = null, tipo = null } = {}) => {
    const h = { ...headers };
    if (usuario) h[CABECALHO_USUARIO] = usuario;
    if (token) h.authorization = `Bearer ${token}`;
    let body;
    if (corpoCru !== null) { body = corpoCru; if (tipo) h['content-type'] = tipo; }
    else if (corpo !== undefined) { body = typeof corpo === 'string' ? corpo : JSON.stringify(corpo); h['content-type'] = tipo || 'application/json'; }
    const r = await fetch(base + caminho, { method: metodo, headers: h, body, redirect: 'manual' });
    return lerResposta(r);
  };
  return {
    get: (caminho, opcoes) => pedir('GET', caminho, undefined, opcoes),
    post: (caminho, corpo = {}, opcoes) => pedir('POST', caminho, corpo, opcoes),
    put: (caminho, corpo = {}, opcoes) => pedir('PUT', caminho, corpo, opcoes),
    del: (caminho, opcoes) => pedir('DELETE', caminho, undefined, opcoes),
    raw: (caminho, init = {}) => fetch(base + caminho, { redirect: 'manual', ...init }).then(lerResposta)
  };
}
