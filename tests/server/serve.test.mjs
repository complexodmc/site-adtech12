// =============================================================
// QA · Autoteste do servidor de QA (tests/server/serve.mjs): regra QA_SERVIDOR,
// provedores falsos (D-41) e CSP de /plataforma-ead/ reproduzida do vercel.json (D-43).
//
//   node --test tests/server/serve.test.mjs
//
// Sobe o serve.mjs como processo filho em QA_PORT_AUTOTESTE (padrão 4630, porta
// manual da principal, PORTAL-ACADEMICO §9.1) com QA_NO_MONGO=1 e encerra só esse
// filho (pelo PID que ele mesmo iniciou).
// =============================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ_REPO } from './vercel-rotas.mjs';
import { bloquearHostsReais } from './provedores-falsos.mjs';

const PORTA = Number(process.env.QA_PORT_AUTOTESTE || 4630);
const ORIGEM = `http://127.0.0.1:${PORTA}`;

// Política literal de PORTAL-ACADEMICO §9.6 (linha "CSP").
const CSP_ESTRITA = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://i.ytimg.com; media-src 'self' blob: https:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

let filho = null;
let estado = null;
let saida = '';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const qa = (caminho, init) => fetch(ORIGEM + caminho, init);
const jsonDe = async (r) => JSON.parse(await r.text());
const gemini = (caminho, { chave, metodo = 'GET', corpo } = {}) => fetch(estado.provedores.PORTAL_GEMINI_URL + caminho, {
  method: metodo,
  headers: { ...(chave ? { 'x-goog-api-key': chave } : {}), ...(corpo ? { 'content-type': 'application/json' } : {}) },
  body: corpo ? JSON.stringify(corpo) : undefined
});
const pedidoGemini = (texto) => ({ contents: [{ role: 'user', parts: [{ text: texto }] }] });
const roteiro = (provedor, corpo) => qa(`/__qa/${provedor}/roteiro`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
const resend = (corpo, chave = 'qa-falsa') => fetch(estado.provedores.PORTAL_RESEND_URL + '/emails', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(chave ? { authorization: `Bearer ${chave}` } : {}) },
  body: JSON.stringify(corpo)
});

before(async () => {
  filho = spawn(process.execPath, [path.join(RAIZ_REPO, 'tests', 'server', 'serve.mjs')], {
    env: { ...process.env, QA_PORT: String(PORTA), QA_NO_MONGO: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  filho.stdout.on('data', (d) => { saida += d; });
  filho.stderr.on('data', (d) => { saida += d; });
  const limite = Date.now() + 30_000;
  while (Date.now() < limite) {
    if (filho.exitCode !== null) break;
    try { const r = await qa('/__qa/estado'); if (r.ok) { estado = await r.json(); break; } } catch { /* ainda subindo */ }
    await esperar(200);
  }
  assert.ok(estado, `serve.mjs não respondeu em ${ORIGEM}/__qa/estado:\n${saida}`);
});

after(async () => {
  if (filho && filho.exitCode === null) {
    filho.kill('SIGTERM');
    await new Promise((ok) => { filho.once('exit', ok); setTimeout(ok, 8000); });
  }
});

test('estado: chaves de antes mantidas, provedores falsos no ar e regra QA_SERVIDOR ativa no config-portal', () => {
  assert.equal(estado.mongo, null);
  assert.equal(estado.motivo, 'QA_NO_MONGO=1');
  assert.equal(estado.outputDir, 'complexodmc.com.br');
  const base = estado.provedores.PORTAL_GEMINI_URL;
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(estado.provedores.PORTAL_VIACEP_URL, base);
  assert.equal(estado.provedores.PORTAL_RESEND_URL, base);
  assert.deepEqual(estado.externasBloqueadas, []);
  if (fs.existsSync(path.join(RAIZ_REPO, 'server', 'src', 'portal', 'config-portal.js'))) {
    assert.equal(estado.portal.erro, undefined, estado.portal.erro);
    assert.equal(estado.portal.regraQa, true);
    assert.equal(estado.portal.provedoresFalsos, true);
    assert.deepEqual(estado.portal.urlsProvedor, { gemini: base, viacep: base, resend: base });
    assert.equal(estado.portal.baseUrl, ORIGEM);
  }
});

test('CSP: estrita report-only em /plataforma-ead/*, igual à §9.6 e ao vercel.json; login e login-classico seguem a do site', async () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(RAIZ_REPO, 'vercel.json'), 'utf8'));
  const regra = vercel.headers.find((h) => h.source.startsWith('/plataforma-ead/'));
  assert.ok(regra, 'regra de /plataforma-ead/ no vercel.json');
  assert.ok(vercel.headers.indexOf(regra) > vercel.headers.findIndex((h) => h.source === '/(.*)'), 'a regra vem depois da global');
  assert.equal(regra.headers.find((h) => h.key === 'Content-Security-Policy-Report-Only').value, CSP_ESTRITA);
  assert.equal(vercel.functions['api/[...path].js'].includeFiles, 'server/src/**');

  const doSite = vercel.headers.find((h) => h.source === '/(.*)').headers.find((h) => h.key === 'Content-Security-Policy-Report-Only').value;
  for (const p of ['/plataforma-ead/', '/plataforma-ead/dashboard.html', '/plataforma-ead/aula.html?id=x', '/plataforma-ead/loja.html', '/plataforma-ead/js/app.js', '/plataforma-ead/nao-existe.html']) {
    const r = await qa(p, { redirect: 'manual' });
    await r.arrayBuffer();
    assert.equal(r.headers.get('content-security-policy-report-only'), CSP_ESTRITA, p);
    assert.equal(r.headers.get('content-security-policy'), null, `${p}: nada aplicado antes do G2`);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', p);
  }
  for (const p of ['/plataforma-ead/login.html', '/plataforma-ead/login.html?next=parcerias.html', '/plataforma-ead/login-classico.html', '/', '/pages/sobre.html']) {
    const r = await qa(p, { redirect: 'manual' });
    await r.arrayBuffer();
    assert.equal(r.headers.get('content-security-policy-report-only'), doSite, p);
  }
});

test('Gemini falso: GET do modelo exige x-goog-api-key, recusa ?key= e distingue modelo inexistente e sem generateContent', async () => {
  let r = await gemini('/v1beta/models/gemini-2.5-flash', { chave: 'qa-chave-valida-0000000000' });
  assert.equal(r.status, 200);
  const info = await r.json();
  assert.equal(info.name, 'models/gemini-2.5-flash');
  assert.ok(info.supportedGenerationMethods.includes('generateContent'));
  assert.ok(info.inputTokenLimit > 0);

  r = await gemini('/v1beta/models/gemini-2.5-flash');
  assert.equal(r.status, 403);
  r = await gemini('/v1beta/models/gemini-2.5-flash?key=qa-chave-valida-0000000000', { chave: 'qa-chave-valida-0000000000' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.details[0].reason, 'QA_CHAVE_NA_URL');
  r = await gemini('/v1beta/models/modelo-inexistente', { chave: 'qa-chave-valida-0000000000' });
  assert.equal(r.status, 404);
  r = await gemini('/v1beta/models/text-embedding-004', { chave: 'qa-chave-valida-0000000000' });
  assert.equal(r.status, 200);
  assert.ok(!(await r.json()).supportedGenerationMethods.includes('generateContent'));
  r = await gemini('/v1beta/models/gemini-2.5-flash', { chave: 'qa-invalida-000000000000' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.details[0].reason, 'API_KEY_INVALID');
  r = await gemini('/v1beta/models/gemini-2.5-flash', { chave: 'qa-sem-permissao-0000000' });
  assert.equal(r.status, 403);
  r = await gemini('/v1beta/models/gemini-2.5-flash', { chave: 'qa-limite-00000000000000' });
  assert.equal(r.status, 429);
});

test('Gemini falso: generateContent padrão, roteiro por marcador (ferramenta com thoughtSignature → texto) e chamadas registradas', async () => {
  const chave = 'qa-chave-valida-0000000000';
  let r = await gemini('/v1beta/models/gemini-2.5-flash:generateContent', { chave, metodo: 'POST', corpo: pedidoGemini('olá') });
  assert.equal(r.status, 200);
  let c = await r.json();
  assert.equal(typeof c.candidates[0].content.parts[0].text, 'string');
  assert.equal(c.candidates[0].finishReason, 'STOP');
  assert.ok(c.usageMetadata.totalTokenCount > 0);

  r = await gemini('/v1beta/models/gemini-2.5-flash:generateContent', { chave, metodo: 'POST', corpo: { contents: [] } });
  assert.equal(r.status, 400);

  const marcador = `marcador-${Date.now()}`;
  r = await roteiro('gemini', { quando: { contem: marcador }, respostas: [
    { ferramentas: [{ nome: 'meusCursos', args: {} }] },
    { texto: 'Você tem 1 curso em andamento.', atrasoMs: 300 }
  ] });
  assert.equal(r.status, 201);
  const { id } = await r.json();
  assert.match(id, /^r\d+$/);

  r = await gemini('/v1beta/models/gemini-2.5-flash:generateContent', { chave, metodo: 'POST', corpo: pedidoGemini(`Quais cursos? ${marcador}`) });
  c = await r.json();
  const parte = c.candidates[0].content.parts[0];
  assert.equal(parte.functionCall.name, 'meusCursos');
  assert.match(parte.thoughtSignature, /^qa-assinatura-/);

  const t0 = Date.now();
  r = await gemini('/v1beta/models/gemini-2.5-flash:generateContent', { chave, metodo: 'POST', corpo: { contents: [
    { role: 'user', parts: [{ text: `Quais cursos? ${marcador}` }] },
    { role: 'model', parts: [parte] },
    { role: 'user', parts: [{ functionResponse: { name: 'meusCursos', response: { cursos: 1 } } }] }
  ] } });
  c = await r.json();
  assert.ok(Date.now() - t0 >= 280, 'atrasoMs respeitado');
  assert.equal(c.candidates[0].content.parts[0].text, 'Você tem 1 curso em andamento.');

  r = await gemini('/v1beta/models/gemini-2.5-flash:generateContent', { chave, metodo: 'POST', corpo: pedidoGemini(`de novo ${marcador}`) });
  c = await r.json();
  assert.ok(!c.candidates[0].content.parts[0].functionCall, 'roteiro consumido: volta ao padrão');

  const ch = await jsonDe(await qa(`/__qa/gemini/chamadas?contem=${marcador}`));
  assert.equal(ch.chamadas.length, 3);
  assert.equal(ch.chamadas[0].roteiro, id);
  assert.equal(ch.chamadas[0].chavePresente, true);
  assert.equal(ch.chamadas[0].chaveNaUrl, false);
  assert.equal(ch.chamadas[1].corpo.contents[1].parts[0].thoughtSignature, parte.thoughtSignature);
  assert.equal(ch.chamadas[2].roteiro, null);

  r = await roteiro('gemini', { quando: { campoQueNaoExiste: 'x' }, respostas: [{ texto: 'x' }] });
  assert.equal(r.status, 400);
  r = await roteiro('gemini', { quando: { chave: 'qa-roteiro-erro-000000000' }, respostas: [{ status: 503 }], repetir: true });
  assert.equal(r.status, 201);
  const rid = (await r.json()).id;
  for (let i = 0; i < 2; i++) {
    r = await gemini('/v1beta/models/gemini-2.5-flash:generateContent', { chave: 'qa-roteiro-erro-000000000', metodo: 'POST', corpo: pedidoGemini('x') });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error.status, 'UNAVAILABLE');
  }
  assert.deepEqual(await jsonDe(await qa(`/__qa/gemini/roteiro/${rid}`, { method: 'DELETE' })), { removidos: 1 });
});

test('ViaCEP falso: CEP conhecido, inexistente, formato inválido e roteiro de falha', async () => {
  const base = estado.provedores.PORTAL_VIACEP_URL;
  let r = await fetch(`${base}/ws/01310100/json/`);
  assert.equal(r.status, 200);
  const e = await r.json();
  assert.equal(e.logradouro, 'Avenida Paulista');
  assert.equal(e.uf, 'SP');
  r = await fetch(`${base}/ws/99999999/json/`);
  assert.deepEqual(await r.json(), { erro: 'true' });
  r = await fetch(`${base}/ws/123/json/`);
  assert.equal(r.status, 400);
  await r.arrayBuffer();

  await roteiro('viacep', { quando: { cep: '12345-678' }, respostas: [{ status: 500, corpo: { erro: 'falha simulada' } }] });
  r = await fetch(`${base}/ws/12345678/json/`);
  assert.equal(r.status, 500);
  await r.arrayBuffer();
  r = await fetch(`${base}/ws/12345678/json/`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { erro: 'true' });
  const ch = await jsonDe(await qa('/__qa/viacep/chamadas?cep=12345678'));
  assert.deepEqual(ch.chamadas.map((c) => c.status), [500, 200]);
});

test('Resend falso: autenticação, validação, e-mail lido em /__qa/emails, roteiro de falha e limpeza', async () => {
  const para = `aluno-${Date.now()}@exemplo.invalid`;
  const msg = { from: 'Plataforma QA <qa@exemplo.invalid>', to: [para], subject: 'Seu link de acesso', text: 'Abra http://127.0.0.1/plataforma-ead/acesso-link.html#acesso=abc' };
  let r = await resend(msg, null);
  assert.equal(r.status, 401);
  await r.arrayBuffer();
  r = await resend(msg, 'outra-chave');
  assert.equal(r.status, 403);
  await r.arrayBuffer();
  r = await resend({ ...msg, subject: '' });
  assert.equal(r.status, 422);
  await r.arrayBuffer();
  r = await resend(msg);
  assert.equal(r.status, 200);
  const { id } = await r.json();
  assert.match(id, /^[0-9a-f-]{36}$/);

  let lista = (await jsonDe(await qa(`/__qa/emails?para=${encodeURIComponent(para)}`))).emails;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, id);
  assert.equal(lista[0].assunto, 'Seu link de acesso');
  assert.match(lista[0].texto, /#acesso=abc$/);
  assert.deepEqual(lista[0].para, [para]);
  assert.equal(lista[0].corpo.reply_to, undefined);

  await roteiro('resend', { quando: { para }, respostas: [{ status: 500 }] });
  r = await resend(msg);
  assert.equal(r.status, 500);
  await r.arrayBuffer();
  lista = (await jsonDe(await qa(`/__qa/emails?para=${encodeURIComponent(para)}`))).emails;
  assert.equal(lista.length, 1, 'falha simulada não guarda e-mail');

  assert.deepEqual(await jsonDe(await qa(`/__qa/emails?para=${encodeURIComponent(para)}`, { method: 'DELETE' })), { apagados: 1 });
  assert.equal((await jsonDe(await qa(`/__qa/emails?para=${encodeURIComponent(para)}`))).emails.length, 0);
  r = await qa('/__qa/emails', { method: 'POST' });
  assert.equal(r.status, 405);
  await r.arrayBuffer();
});

test('rotas de QA desconhecidas seguem o roteamento de antes (404) e o estático continua igual', async () => {
  let r = await qa('/__qa/nao-existe');
  assert.equal(r.status, 404);
  await r.arrayBuffer();
  r = await qa('/plataforma-ead/dashboard.html');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-qa-arquivo'), 'plataforma-ead/dashboard.html');
  await r.arrayBuffer();
});

test('bloquearHostsReais: fetch aos hosts reais falha como rede e é registrado; o resto passa', async () => {
  const bloqueios = [];
  bloquearHostsReais((t) => bloqueios.push(t));
  for (const u of ['https://api.resend.com/emails', 'https://viacep.com.br/ws/01310100/json/', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash']) {
    await assert.rejects(fetch(u), (e) => e instanceof TypeError && /bloqueado/.test(e.message));
  }
  assert.deepEqual(bloqueios.map((b) => b.host), ['api.resend.com', 'viacep.com.br', 'generativelanguage.googleapis.com']);
  const r = await qa('/__qa/estado');
  assert.equal(r.status, 200);
  await r.arrayBuffer();
});
