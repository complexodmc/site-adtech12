// =============================================================
// QA · Provedores falsos do servidor de QA (PORTAL-ACADEMICO §9.1 e D-41).
//
// Um único servidor HTTP em 127.0.0.1 (porta escolhida pelo sistema, como a
// do mongod descartável) faz o papel dos três provedores externos do portal.
// O serve.mjs aponta PORTAL_GEMINI_URL, PORTAL_VIACEP_URL e PORTAL_RESEND_URL
// para a base dele; o config-portal.js só honra essas variáveis com a regra
// QA_SERVIDOR (D-41). Os caminhos são os mesmos dos provedores reais:
//
//   Gemini  GET  /v1beta/models/:modelo
//           POST /v1beta/models/:modelo:generateContent
//           exige o cabeçalho x-goog-api-key; chave na URL (?key=) → 400
//           (a API proíbe, PORTAL-API §6.10.3). Sem roteiro: texto fixo de teste.
//           Chaves que começam por qa-invalida → 400 API_KEY_INVALID,
//           qa-sem-permissao → 403, qa-limite → 429. Modelo gemini-* existe;
//           *embedding* existe sem generateContent; o resto → 404.
//   ViaCEP  GET  /ws/:cep/json/   (8 dígitos; fora disso → 400 como o real)
//           01310100 → Avenida Paulista (dado público); outro CEP → { erro: "true" }.
//   Resend  POST /emails          (Authorization: Bearer <RESEND_API_KEY do QA>)
//           mensagens aceitas ficam em memória e são lidas em GET /__qa/emails.
//
// Rotas de controle (no servidor PRINCIPAL do QA, mesma origem das páginas;
// não existem na Vercel nem em produção):
//   GET    /__qa/emails[?para=&assunto=&desde=<ISO>]   → { emails:[{ id, recebidoEm, de, para[], assunto, texto, html, corpo }] }
//   DELETE /__qa/emails[?para=]                        → { apagados }
//   POST   /__qa/<gemini|viacep|resend>/roteiro         → 201 { id }
//          corpo { quando?, respostas:[passo…], repetir?:B }
//          quando — gemini: { contem, modelo, chave, rota:'generateContent'|'modelo' }
//                   viacep: { cep } · resend: { para, assunto } (contém, sem caixa)
//          passo  — comum: { status?, corpo?, atrasoMs? (≤ 60000) }
//                   gemini: { texto } · { ferramentas:[{ nome, args }] } (functionCall com
//                   thoughtSignature) · { bloqueio:'SAFETY' } · { finishReason } ·
//                   { erro:{ status, mensagem, motivo } } · { uso:{ entrada, saida } }
//          Cada chamada que casa consome o próximo passo; acabados os passos o roteiro
//          sai (com repetir:true o último passo fica valendo). Vale o primeiro roteiro
//          que casar, na ordem de criação. Os testes rodam em paralelo: use um `quando`
//          com marcador único (destinatário, CEP, texto) — roteiro sem `quando` vale
//          para todos os workers.
//   GET    /__qa/<provedor>/roteiro                     → { roteiros } (pendentes)
//   DELETE /__qa/<provedor>/roteiro[/:id]               → { removidos }
//   GET    /__qa/<provedor>/chamadas[?contem=|?cep=|?para=] → { chamadas } (últimas 500)
//   GET    /__qa/provedores                             → resumo
//
// bloquearHostsReais(): no processo do servidor de QA, fetch para os hosts reais
// dos provedores falha como falha de rede e fica registrado no /__qa/estado.
// Assim nenhum teste chama o provedor real, nem quando uma variável de QA é
// ignorada pelo config-portal (A10, R21).
// =============================================================
import http from 'node:http';
import crypto from 'node:crypto';

export const HOSTS_REAIS = Object.freeze(['generativelanguage.googleapis.com', 'viacep.com.br', 'api.resend.com']);

const LIMITE_CORPO = 1024 * 1024;
const LIMITE_REGISTROS = 500;
const ATRASO_MAXIMO = 60_000;
const MAX_PASSOS = 50;
const TEXTO_PADRAO = 'Resposta de teste do provedor falso do servidor de QA.';
const RE_MODELO = /^[a-z0-9][a-z0-9.-]{1,62}$/;

// Dado público (Correios), no formato em que o ViaCEP o devolve.
const CEPS = new Map([
  ['01310100', {
    cep: '01310-100', logradouro: 'Avenida Paulista', complemento: 'de 612 a 1510 - lado par', unidade: '',
    bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP', estado: 'São Paulo', regiao: 'Sudeste',
    ibge: '3550308', gia: '1004', ddd: '11', siafi: '7107'
  }]
]);

const CHAVES_ESPECIAIS = [
  { re: /^qa-invalida/, status: 400, google: 'INVALID_ARGUMENT', mensagem: 'API key not valid. Please pass a valid API key.', motivo: 'API_KEY_INVALID' },
  { re: /^qa-sem-permissao/, status: 403, google: 'PERMISSION_DENIED', mensagem: 'Permission denied: Consumer has been suspended.', motivo: 'CONSUMER_SUSPENDED' },
  { re: /^qa-limite/, status: 429, google: 'RESOURCE_EXHAUSTED', mensagem: 'Resource has been exhausted (e.g. check quota).', motivo: 'RATE_LIMIT_EXCEEDED' }
];

const STATUS_GOOGLE = { 400: 'INVALID_ARGUMENT', 401: 'UNAUTHENTICATED', 403: 'PERMISSION_DENIED', 404: 'NOT_FOUND', 429: 'RESOURCE_EXHAUSTED', 500: 'INTERNAL', 503: 'UNAVAILABLE', 504: 'DEADLINE_EXCEEDED' };

// ---------------- utilitários ----------------
export function lerCorpo(req, limite = LIMITE_CORPO) {
  return new Promise((ok, erro) => {
    const partes = []; let total = 0; let excedeu = false;
    req.on('data', (c) => { total += c.length; if (total > limite) excedeu = true; else partes.push(c); });
    req.on('end', () => ok({ bruto: Buffer.concat(partes), excedeu, bytes: total }));
    req.on('error', erro);
  });
}

function json(res, status, corpo, extra = {}) {
  const txt = JSON.stringify(corpo);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(txt), ...extra });
  res.end(txt);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const atrasoDe = (passo) => Math.max(0, Math.min(ATRASO_MAXIMO, Number(passo && passo.atrasoMs) || 0));
const contem = (alvo, trecho) => String(alvo || '').toLowerCase().includes(String(trecho).toLowerCase());
const agoraIso = () => new Date().toISOString();

function guardar(lista, item) {
  lista.push(item);
  if (lista.length > LIMITE_REGISTROS) lista.splice(0, lista.length - LIMITE_REGISTROS);
}

function analisarJson(bruto) {
  if (!bruto.length) return { ok: false };
  try { return { ok: true, valor: JSON.parse(bruto.toString('utf8')) }; } catch { return { ok: false }; }
}

// ---------------- roteiros ----------------
const CAMPOS_QUANDO = {
  gemini: ['contem', 'modelo', 'chave', 'rota'],
  viacep: ['cep'],
  resend: ['para', 'assunto']
};

function validarRoteiro(provedor, corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return 'corpo deve ser um objeto { quando?, respostas, repetir? }';
  const quando = corpo.quando ?? {};
  if (typeof quando !== 'object' || Array.isArray(quando) || quando === null) return 'quando deve ser um objeto';
  for (const [k, v] of Object.entries(quando)) {
    if (!CAMPOS_QUANDO[provedor].includes(k)) return `quando.${k} não existe para ${provedor} (use ${CAMPOS_QUANDO[provedor].join(', ')})`;
    if (typeof v !== 'string' || !v || v.length > 500) return `quando.${k} deve ser texto de 1 a 500 caracteres`;
  }
  if (provedor === 'gemini' && quando.rota && !['generateContent', 'modelo'].includes(quando.rota)) return "quando.rota deve ser 'generateContent' ou 'modelo'";
  if (!Array.isArray(corpo.respostas) || !corpo.respostas.length || corpo.respostas.length > MAX_PASSOS) return `respostas deve ter de 1 a ${MAX_PASSOS} passos`;
  for (const p of corpo.respostas) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return 'cada passo deve ser um objeto';
    if (p.status !== undefined && !(Number.isInteger(p.status) && p.status >= 200 && p.status <= 599)) return 'passo.status deve ser um inteiro de 200 a 599';
  }
  return null;
}

function criarRoteiros(casa) {
  const lista = [];
  let seq = 0;
  return {
    adicionar({ quando = {}, respostas, repetir = false }) {
      const id = `r${++seq}`;
      lista.push({ id, quando, respostas, repetir: repetir === true, indice: 0, criadoEm: agoraIso() });
      return id;
    },
    remover(id) {
      if (!id) { const n = lista.length; lista.length = 0; return n; }
      const i = lista.findIndex((r) => r.id === id);
      if (i < 0) return 0;
      lista.splice(i, 1);
      return 1;
    },
    consumir(ctx) {
      const r = lista.find((x) => casa(x.quando, ctx));
      if (!r) return null;
      const passo = r.respostas[r.indice];
      r.indice += 1;
      if (r.indice >= r.respostas.length) {
        if (r.repetir) r.indice = r.respostas.length - 1;
        else lista.splice(lista.indexOf(r), 1);
      }
      return { id: r.id, passo };
    },
    pendentes() {
      return lista.map((r) => ({ id: r.id, quando: r.quando, restantes: r.respostas.length - r.indice, repetir: r.repetir, criadoEm: r.criadoEm }));
    }
  };
}

// ---------------- Gemini ----------------
function erroGoogle(status, { status: st, mensagem, motivo } = {}) {
  const error = { code: status, message: mensagem || `Erro ${status} do provedor falso de QA.`, status: st || STATUS_GOOGLE[status] || 'UNKNOWN' };
  if (motivo) error.details = [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: motivo, domain: 'googleapis.com', metadata: { service: 'generativelanguage.googleapis.com' } }];
  return { error };
}

function infoModelo(modelo) {
  const embed = /embedding/.test(modelo);
  return {
    name: `models/${modelo}`, version: '001', displayName: modelo,
    description: 'Modelo do provedor falso do servidor de QA.',
    inputTokenLimit: embed ? 2048 : 1048576, outputTokenLimit: embed ? 1 : 65536,
    supportedGenerationMethods: embed ? ['embedContent'] : ['generateContent', 'countTokens'],
    ...(embed ? {} : { temperature: 1, topP: 0.95, topK: 64, maxTemperature: 2, thinking: true })
  };
}

const modeloExiste = (m) => /^gemini-/.test(m) || /embedding/.test(m);

function textosDaRequisicao(corpo) {
  const t = [];
  const partes = (c) => (c && Array.isArray(c.parts) ? c.parts : []);
  if (corpo && corpo.systemInstruction) for (const p of partes(corpo.systemInstruction)) if (typeof p.text === 'string') t.push(p.text);
  if (corpo && Array.isArray(corpo.contents)) for (const c of corpo.contents) for (const p of partes(c)) {
    if (typeof p.text === 'string') t.push(p.text);
    if (p.functionResponse) t.push(JSON.stringify(p.functionResponse));
  }
  return t.join('\n');
}

function respostaGemini(passo, { modelo, seq, bytes }) {
  if (passo.corpo !== undefined) return { status: passo.status || 200, corpo: passo.corpo };
  if (passo.erro || (passo.status && passo.status >= 400)) {
    const status = passo.status || 500;
    return { status, corpo: erroGoogle(status, passo.erro || {}) };
  }
  const entrada = Number.isInteger(passo.uso?.entrada) ? passo.uso.entrada : Math.ceil(bytes / 4);
  const base = { modelVersion: modelo, responseId: `qa-${seq}-${crypto.randomBytes(4).toString('hex')}` };
  if (passo.bloqueio) {
    return { status: 200, corpo: { promptFeedback: { blockReason: String(passo.bloqueio) }, usageMetadata: { promptTokenCount: entrada, totalTokenCount: entrada }, ...base } };
  }
  const parts = [];
  if (passo.texto != null) parts.push({ text: String(passo.texto) });
  (Array.isArray(passo.ferramentas) ? passo.ferramentas : []).forEach((f, i) => {
    parts.push({ functionCall: { name: String(f.nome), args: f.args && typeof f.args === 'object' ? f.args : {} }, thoughtSignature: `qa-assinatura-${seq}-${i}` });
  });
  if (!parts.length) parts.push({ text: TEXTO_PADRAO });
  const saida = Number.isInteger(passo.uso?.saida) ? passo.uso.saida : Math.ceil(JSON.stringify(parts).length / 4);
  return {
    status: 200,
    corpo: {
      candidates: [{ content: { parts, role: 'model' }, finishReason: passo.finishReason || 'STOP', index: 0 }],
      usageMetadata: { promptTokenCount: entrada, candidatesTokenCount: saida, totalTokenCount: entrada + saida },
      ...base
    }
  };
}

// ---------------- fábrica ----------------
/**
 * @param {{ chaveResend: string, log?: Function }} opcoes
 */
export function criarProvedoresFalsos({ chaveResend, log = () => {} } = {}) {
  if (!chaveResend) throw new Error('criarProvedoresFalsos: chaveResend obrigatória');
  const emails = [];
  const chamadas = { gemini: [], viacep: [], resend: [] };
  let seq = 0;

  const roteiros = {
    gemini: criarRoteiros((q, ctx) =>
      (!q.rota || q.rota === ctx.rota) && (!q.modelo || q.modelo === ctx.modelo) &&
      (!q.chave || q.chave === ctx.chave) && (!q.contem || contem(ctx.texto, q.contem))),
    viacep: criarRoteiros((q, ctx) => !q.cep || String(q.cep).replace(/\D/g, '') === ctx.cep),
    resend: criarRoteiros((q, ctx) =>
      (!q.para || ctx.para.some((p) => contem(p, q.para))) && (!q.assunto || contem(ctx.assunto, q.assunto)))
  };

  // ----- Gemini -----
  async function gemini(req, res, url) {
    const m = /^\/v1beta\/models\/([^/:]+)(?::([A-Za-z]+))?$/.exec(url.pathname);
    if (!m) return json(res, 404, erroGoogle(404, { mensagem: 'Caminho inexistente no provedor falso (Gemini).' }));
    let modelo;
    try { modelo = decodeURIComponent(m[1]); } catch { modelo = m[1]; }
    const metodoApi = m[2] || null;
    const rota = metodoApi ? 'generateContent' : 'modelo';
    if ((rota === 'modelo' && req.method !== 'GET') || (rota === 'generateContent' && (req.method !== 'POST' || metodoApi !== 'generateContent'))) {
      return json(res, 404, erroGoogle(404, { mensagem: `Método ${req.method} ${metodoApi || ''} não existe no provedor falso.` }));
    }
    const recebido = agoraIso();
    const n = ++seq;
    const chave = String(req.headers['x-goog-api-key'] || '');
    const chaveNaUrl = url.searchParams.has('key');
    const { bruto, excedeu, bytes } = rota === 'generateContent' ? await lerCorpo(req) : { bruto: Buffer.alloc(0), excedeu: false, bytes: 0 };
    const analisado = rota === 'generateContent' ? analisarJson(bruto) : { ok: true, valor: null };
    const registro = {
      seq: n, recebidoEm: recebido, rota, metodo: req.method, modelo,
      chavePresente: !!chave, chaveNaUrl,
      chave: chave.startsWith('qa-') ? chave : (chave ? `…${chave.slice(-4)}` : null),
      bytes, corpo: analisado.ok ? analisado.valor : null, status: null, roteiro: null
    };
    const fim = (status, corpo) => { registro.status = status; guardar(chamadas.gemini, registro); return json(res, status, corpo); };

    if (chaveNaUrl) return fim(400, erroGoogle(400, { mensagem: 'Provedor falso de QA: a chave não pode ir na URL; use o cabeçalho x-goog-api-key.', motivo: 'QA_CHAVE_NA_URL' }));
    if (!chave) return fim(403, erroGoogle(403, { mensagem: "Method doesn't allow unregistered callers (callers without established identity). Please use API Key or other form of API consumer identity to call this API.", motivo: 'SERVICE_DISABLED' }));
    if (excedeu) return fim(400, erroGoogle(400, { mensagem: 'Request payload size exceeds the limit (provedor falso de QA: 1 MiB).' }));
    if (rota === 'generateContent' && (!analisado.ok || !analisado.valor || !Array.isArray(analisado.valor.contents) || !analisado.valor.contents.length)) {
      return fim(400, erroGoogle(400, { mensagem: 'Invalid JSON payload: contents é obrigatório (provedor falso de QA).' }));
    }

    const ctx = { rota, modelo, chave, texto: `${modelo}\n${bruto.toString('utf8')}\n${textosDaRequisicao(analisado.valor)}` };
    const roteado = roteiros.gemini.consumir(ctx);
    if (roteado) {
      registro.roteiro = roteado.id;
      const atraso = atrasoDe(roteado.passo);
      if (atraso) await esperar(atraso);
      if (rota === 'modelo') {
        const p = roteado.passo;
        if (p.corpo !== undefined) return fim(p.status || 200, p.corpo);
        if (p.erro || (p.status && p.status >= 400)) return fim(p.status || 500, erroGoogle(p.status || 500, p.erro || {}));
        return fim(p.status || 200, infoModelo(modelo));
      }
      const r = respostaGemini(roteado.passo, { modelo, seq: n, bytes });
      return fim(r.status, r.corpo);
    }

    const especial = CHAVES_ESPECIAIS.find((c) => c.re.test(chave));
    if (especial) return fim(especial.status, erroGoogle(especial.status, { status: especial.google, mensagem: especial.mensagem, motivo: especial.motivo }));
    if (!RE_MODELO.test(modelo) || !modeloExiste(modelo)) {
      return fim(404, erroGoogle(404, { mensagem: `models/${modelo} is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of available models and their supported methods.` }));
    }
    if (rota === 'modelo') return fim(200, infoModelo(modelo));
    if (/embedding/.test(modelo)) {
      return fim(404, erroGoogle(404, { mensagem: `models/${modelo} is not found for API version v1beta, or is not supported for generateContent.` }));
    }
    const r = respostaGemini({}, { modelo, seq: n, bytes });
    return fim(r.status, r.corpo);
  }

  // ----- ViaCEP -----
  async function viacep(req, res, url) {
    const m = /^\/ws\/([^/]+)\/json\/?$/.exec(url.pathname);
    if (!m || req.method !== 'GET') {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<h2>Not Found (provedor falso de QA)</h2>');
    }
    const cep = m[1];
    const registro = { seq: ++seq, recebidoEm: agoraIso(), cep, status: null, roteiro: null };
    if (!/^\d{8}$/.test(cep)) {
      registro.status = 400; guardar(chamadas.viacep, registro);
      res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<h2>Bad Request (400)</h2>');
    }
    const roteado = roteiros.viacep.consumir({ cep });
    if (roteado) {
      registro.roteiro = roteado.id;
      const atraso = atrasoDe(roteado.passo);
      if (atraso) await esperar(atraso);
      const status = roteado.passo.status || 200;
      registro.status = status; guardar(chamadas.viacep, registro);
      return json(res, status, roteado.passo.corpo !== undefined ? roteado.passo.corpo : (CEPS.get(cep) || { erro: 'true' }));
    }
    registro.status = 200; guardar(chamadas.viacep, registro);
    return json(res, 200, CEPS.get(cep) || { erro: 'true' });
  }

  // ----- Resend -----
  async function resend(req, res, url) {
    if (url.pathname !== '/emails' || req.method !== 'POST') {
      return json(res, 404, { statusCode: 404, name: 'not_found', message: 'The requested endpoint does not exist (provedor falso de QA).' });
    }
    const registro = { seq: ++seq, recebidoEm: agoraIso(), para: [], assunto: null, status: null, roteiro: null, id: null };
    const fim = (status, corpo) => { registro.status = status; guardar(chamadas.resend, registro); return json(res, status, corpo); };
    const auth = String(req.headers.authorization || '');
    const { bruto, excedeu } = await lerCorpo(req);
    if (!/^Bearer\s+\S+/.test(auth)) {
      return fim(401, { statusCode: 401, name: 'missing_api_key', message: 'Missing API key in the authorization header. Include the following header in the request: Authorization: Bearer YOUR_API_KEY' });
    }
    if (auth.replace(/^Bearer\s+/, '') !== chaveResend) return fim(403, { statusCode: 403, name: 'invalid_api_key', message: 'API key is invalid' });
    if (excedeu) return fim(413, { statusCode: 413, name: 'validation_error', message: 'Payload too large (provedor falso de QA: 1 MiB).' });
    const analisado = analisarJson(bruto);
    if (!analisado.ok || !analisado.valor || typeof analisado.valor !== 'object') return fim(400, { statusCode: 400, name: 'invalid_body', message: 'Invalid JSON body.' });
    const c = analisado.valor;
    const para = (Array.isArray(c.to) ? c.to : [c.to]).filter((x) => typeof x === 'string' && x);
    registro.para = para; registro.assunto = typeof c.subject === 'string' ? c.subject : null;
    const faltando = [!c.from && 'from', !para.length && 'to', !c.subject && 'subject', !c.text && !c.html && 'text|html'].filter(Boolean);
    if (faltando.length) return fim(422, { statusCode: 422, name: 'validation_error', message: `Missing required field(s): ${faltando.join(', ')}.` });

    const roteado = roteiros.resend.consumir({ para, assunto: registro.assunto || '' });
    if (roteado) {
      registro.roteiro = roteado.id;
      const atraso = atrasoDe(roteado.passo);
      if (atraso) await esperar(atraso);
      const p = roteado.passo;
      if (p.status && p.status >= 400) return fim(p.status, p.corpo !== undefined ? p.corpo : { statusCode: p.status, name: 'application_error', message: 'Falha simulada pelo roteiro do servidor de QA.' });
      if (p.corpo !== undefined) return fim(p.status || 200, p.corpo);
    }
    const id = crypto.randomUUID();
    registro.id = id;
    guardar(emails, {
      id, recebidoEm: registro.recebidoEm, de: c.from, para, assunto: c.subject,
      texto: typeof c.text === 'string' ? c.text : null, html: typeof c.html === 'string' ? c.html : null, corpo: c
    });
    return fim(200, { id });
  }

  // ----- servidor dos provedores -----
  const servidor = http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url || '/', 'http://127.0.0.1'); } catch { return json(res, 400, { erro: 'URL inválida' }); }
    const p = url.pathname;
    const tratar = p.startsWith('/v1beta/') ? gemini : p.startsWith('/ws/') ? viacep : p === '/emails' ? resend : null;
    if (!tratar) return json(res, 404, { erro: 'Caminho inexistente no provedor falso do servidor de QA.' });
    tratar(req, res, url).catch((e) => {
      log('provedor falso: erro inesperado', e && e.message);
      if (!res.headersSent) json(res, 500, { erro: 'erro interno do provedor falso' });
      else res.destroy();
    });
  });
  servidor.keepAliveTimeout = 1000;

  let base = null;

  // ----- rotas de controle (servidor principal) -----
  function filtrarChamadas(provedor, q) {
    let lista = chamadas[provedor];
    if (provedor === 'gemini' && q.get('contem')) lista = lista.filter((c) => contem(JSON.stringify(c.corpo), q.get('contem')) || contem(c.modelo, q.get('contem')));
    if (provedor === 'viacep' && q.get('cep')) lista = lista.filter((c) => c.cep === q.get('cep').replace(/\D/g, ''));
    if (provedor === 'resend' && q.get('para')) lista = lista.filter((c) => c.para.some((p) => contem(p, q.get('para'))));
    return lista;
  }

  function filtrarEmails(q) {
    let lista = emails;
    if (q.get('para')) lista = lista.filter((e) => e.para.some((p) => contem(p, q.get('para'))));
    if (q.get('assunto')) lista = lista.filter((e) => contem(e.assunto, q.get('assunto')));
    if (q.get('desde')) {
      const d = Date.parse(q.get('desde'));
      if (!Number.isNaN(d)) lista = lista.filter((e) => Date.parse(e.recebidoEm) >= d);
    }
    return lista;
  }

  function resumo() {
    return {
      base,
      urls: base ? { PORTAL_GEMINI_URL: base, PORTAL_VIACEP_URL: base, PORTAL_RESEND_URL: base } : null,
      emails: emails.length,
      chamadas: { gemini: chamadas.gemini.length, viacep: chamadas.viacep.length, resend: chamadas.resend.length },
      roteiros: { gemini: roteiros.gemini.pendentes().length, viacep: roteiros.viacep.pendentes().length, resend: roteiros.resend.pendentes().length }
    };
  }

  const RE_CONTROLE = /^\/__qa\/(gemini|viacep|resend)\/(roteiro|chamadas)(?:\/([A-Za-z0-9]+))?$/;

  /** true se o caminho é uma rota de controle destes provedores (decisão síncrona do roteador). */
  function atende(caminho) {
    return caminho === '/__qa/emails' || caminho === '/__qa/provedores' || RE_CONTROLE.test(caminho);
  }

  /** Trata /__qa/emails, /__qa/provedores e /__qa/<provedor>/(roteiro|chamadas). Só chamar quando atende(caminho). */
  async function tratarRotaQa(req, res, caminho, busca) {
    const q = new URLSearchParams(busca.startsWith('?') ? busca.slice(1) : busca);
    const naoPermitido = (allow) => json(res, 405, { erro: `Use ${allow}.` }, { allow });
    if (caminho === '/__qa/emails') {
      if (req.method === 'GET') return json(res, 200, { emails: filtrarEmails(q) });
      if (req.method === 'DELETE') {
        const alvo = new Set(q.get('para') || q.get('assunto') || q.get('desde') ? filtrarEmails(q) : emails);
        const antes = emails.length;
        for (let i = emails.length - 1; i >= 0; i--) if (alvo.has(emails[i])) emails.splice(i, 1);
        return json(res, 200, { apagados: antes - emails.length });
      }
      return naoPermitido('GET, DELETE');
    }
    if (caminho === '/__qa/provedores') {
      if (req.method !== 'GET') return naoPermitido('GET');
      return json(res, 200, resumo());
    }
    const [, provedor, recurso, id] = RE_CONTROLE.exec(caminho);
    if (recurso === 'chamadas') {
      if (req.method !== 'GET' || id) return naoPermitido('GET');
      return json(res, 200, { chamadas: filtrarChamadas(provedor, q) });
    }
    if (req.method === 'GET' && !id) return json(res, 200, { roteiros: roteiros[provedor].pendentes() });
    if (req.method === 'DELETE') return json(res, 200, { removidos: roteiros[provedor].remover(id || null) });
    if (req.method === 'POST' && !id) {
      const { bruto, excedeu } = await lerCorpo(req);
      if (excedeu) return json(res, 413, { erro: 'Roteiro acima de 1 MiB.' });
      const analisado = analisarJson(bruto);
      const problema = analisado.ok ? validarRoteiro(provedor, analisado.valor) : 'corpo JSON inválido';
      if (problema) return json(res, 400, { erro: problema });
      return json(res, 201, { id: roteiros[provedor].adicionar(analisado.valor) });
    }
    return naoPermitido('GET, POST (sem id), DELETE');
  }

  return {
    /** Sobe em 127.0.0.1 numa porta livre; devolve a base http://127.0.0.1:<porta>. */
    iniciar() {
      return new Promise((ok, erro) => {
        servidor.once('error', erro);
        servidor.listen(0, '127.0.0.1', () => {
          base = `http://127.0.0.1:${servidor.address().port}`;
          ok(base);
        });
      });
    },
    encerrar() {
      return new Promise((ok) => {
        if (!servidor.listening) return ok();
        servidor.close(() => ok());
        servidor.closeAllConnections?.();
      });
    },
    atende,
    tratarRotaQa,
    resumo,
    get base() { return base; }
  };
}

/**
 * Faz o fetch do PROCESSO falhar (como falha de rede) para os hosts reais dos
 * provedores e registra a tentativa. Idempotente.
 */
export function bloquearHostsReais(registrar = () => {}) {
  const original = globalThis.fetch;
  if (typeof original !== 'function' || original.qaBloqueio) return;
  const bloqueado = (host) => HOSTS_REAIS.some((h) => host === h || host.endsWith(`.${h}`));
  const envolto = async function fetchDoServidorDeQa(entrada, init) {
    let u = null;
    try { u = new URL(typeof entrada === 'string' || entrada instanceof URL ? String(entrada) : entrada.url); } catch { u = null; }
    if (u && bloqueado(u.hostname)) {
      registrar({ host: u.hostname, caminho: u.pathname, em: agoraIso() });
      throw new TypeError(`fetch failed (servidor de QA: ${u.hostname} bloqueado; use o provedor falso)`);
    }
    return original(entrada, init);
  };
  envolto.qaBloqueio = true;
  globalThis.fetch = envolto;
}
