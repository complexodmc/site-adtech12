// Portal · F6b — Configuração do Assistente de IA pela coordenação (PORTAL-API §6.10.4;
// casos da §9.3, linhas atendimento-ia-config e atendimento-ia). Gemini FALSO: zero rede.
// A chave nunca aparece em resposta, auditoria ou banco (só a cifrada e `final4`).
// Rode com `npm test` na raiz.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid, SENHA_FIXTURE, SEGREDO_TOTP_FIXTURE } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso, fetchFalso, servicosFalsos } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const M = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const E = await import('../src/portal/erros.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const { criarCripto } = await import('../src/portal/cripto.js');
const IA = await import('../src/routes/portal/ia.js');
const { codigoTotp, passoAtual } = await import('../src/portal/totp.js');

const MATERIAL = 'segredo-de-teste';
const CHAVE = 'AIzaChaveValidaDoPainel_abcdefghij0123';
const CHAVE_INVALIDA = 'invalidaAIzaChaveRecusada_0000000000';
const BASE = '/api/portal/admin/configuracoes/assistente-ia';

/** Gemini falso do teste de conexão: chave que começa com "invalida" → 400 API_KEY_INVALID; modelo fora de gemini-* → 404. */
function geminiDeTeste() {
  return fetchFalso((ch) => {
    const u = new URL(ch.url);
    const chave = ch.headers['x-goog-api-key'] || '';
    if (u.searchParams.has('key')) return { status: 400, json: { error: { code: 400, message: 'chave na URL' } } };
    if (chave.startsWith('invalida')) return { status: 400, json: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } } };
    const nome = u.pathname.split('/').pop().split(':')[0];
    if (!/^gemini-/.test(nome)) return { status: 404, json: { error: { code: 404, message: 'not found' } } };
    if (ch.metodo === 'GET') return { status: 200, json: { name: `models/${nome}`, displayName: 'Gemini de teste', inputTokenLimit: 1048576, supportedGenerationMethods: ['generateContent'] } };
    return { status: 200, json: { candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 } } };
  });
}

async function subirConfig({ env = {} } = {}) {
  const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
  await semear(banco);
  const servicos = criarServicos();
  servicosFalsos({ 'consentimentos.vigente': async () => ({ versaoTexto: 'v1', textoSha256: 'x', em: new Date() }) }, { em: servicos });
  const gemini = geminiDeTeste();
  const configPortal = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: MATERIAL, ...env });
  const modulo = { caminho: 'routes/portal/ia.js', fatia: 'F6b', importar: async () => ({ default: ctx => IA.montarComDeps(ctx, { fetchImpl: gemini, carregarRag: async () => null }) }) };
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: MATERIAL, exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: [modulo], configPortal, falharCedo: true, log: silencioso
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use(E.criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  return { api: cliente(base), server, banco, servicos, gemini };
}

const admin = { usuario: 'u-admin' };
const reauth = { senha: SENHA_FIXTURE };

// =============================================================
describe('configuração pelo painel', () => {
  let ctx;
  const respostas = [];
  const guardar = r => { respostas.push(r.texto); return r; };
  before(async () => { ctx = await subirConfig(); });
  after(() => fechar(ctx.server));

  test('acesso: sem login 401; aluno e professor 403; GET inicial honesto', async () => {
    assert.equal((await ctx.api.get(BASE)).status, 401);
    assert.equal((await ctx.api.get(BASE, { usuario: 'u-aluno1' })).status, 403);
    assert.equal((await ctx.api.get(BASE, { usuario: 'u-prof' })).status, 403);
    const r = guardar(await ctx.api.get(BASE, admin));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.corpo.ligado, false);
    assert.equal(r.corpo.modelo, 'gemini-2.5-flash');
    assert.deepEqual(r.corpo.chave, { configurada: false, origem: null, final4: null, salvaEm: null, legivel: false });
    assert.deepEqual(r.corpo.limites, { mensagensPorHora: 20, mensagensPorDia: 60, caracteresPorMensagem: 2000, mensagensGlobaisPorDia: 1000 });
    assert.deepEqual(r.corpo.regulamento, { publicado: false, edicao: null, trechos: 0 });
    assert.equal(r.corpo.versao, 0);
    assert.ok(r.corpo.consentimento.texto.includes('Gemini'));
  });

  test('ligar sem chave → 409 ia-sem-chave; modelo inválido → 400', async () => {
    const r = await ctx.api.put(BASE, { ligado: true, versao: 0 }, admin);
    assert.equal(r.status, 409);
    assert.equal(r.corpo.codigo, 'ia-sem-chave');
    const m = await ctx.api.put(BASE, { modelo: 'Gemini 2.5!', versao: 0 }, admin);
    assert.equal(m.status, 400);
    assert.ok(m.corpo.campos.modelo);
  });

  test('salvar chave: sem reautenticação → 400 campos.senha; senha errada → 400 (nunca 401); nada gravado', async () => {
    const sem = await ctx.api.put(`${BASE}/chave`, { chave: CHAVE }, admin);
    assert.equal(sem.status, 400);
    assert.ok(sem.corpo.campos.senha);
    const errada = await ctx.api.put(`${BASE}/chave`, { chave: CHAVE, reautenticacao: { senha: 'senha-errada-123' } }, admin);
    assert.equal(errada.status, 400);
    assert.equal(errada.corpo.campos.senha, 'Senha incorreta.');
    assert.equal(await ctx.banco.collection('configuracoes').countDocuments({ _id: 'assistente_ia' }), 0);
    const formato = await ctx.api.put(`${BASE}/chave`, { chave: 'curta', reautenticacao: reauth }, admin);
    assert.equal(formato.status, 400);
    assert.ok(formato.corpo.campos.chave);
  });

  test('chave recusada pelo Google → 400 chave-recusada-pelo-provedor e nada gravado', async () => {
    const r = await ctx.api.put(`${BASE}/chave`, { chave: CHAVE_INVALIDA, reautenticacao: reauth }, admin);
    assert.equal(r.status, 400);
    assert.equal(r.corpo.codigo, 'chave-recusada-pelo-provedor');
    assert.equal(await ctx.banco.collection('configuracoes').countDocuments({ _id: 'assistente_ia' }), 0);
  });

  test('salvar chave válida: cifrada no banco, só final4 na resposta e na auditoria; teste com x-goog-api-key sem key=', async () => {
    const r = guardar(await ctx.api.put(`${BASE}/chave`, { chave: CHAVE, reautenticacao: reauth }, admin));
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.chave.configurada, true);
    assert.equal(r.corpo.chave.origem, 'painel');
    assert.equal(r.corpo.chave.final4, CHAVE.slice(-4));
    assert.equal(r.corpo.chave.legivel, true);
    assert.equal(r.corpo.versao, 1);
    const doc = await ctx.banco.collection('configuracoes').findOne({ _id: 'assistente_ia' });
    assert.ok(!JSON.stringify(doc).includes(CHAVE), 'só a cifrada no banco');
    assert.equal(doc.chave.cifrado.alg, 'A256GCM');
    assert.equal(criarCripto({ material: MATERIAL }).decifrar(doc.chave.cifrado, 'gemini-api-key', IA.AAD_CHAVE).texto, CHAVE);
    const ultima = ctx.gemini.chamadas.at(-1);
    assert.equal(ultima.metodo, 'GET');
    assert.equal(ultima.headers['x-goog-api-key'], CHAVE);
    assert.ok(!ultima.url.includes('key='));
    const aud = await ctx.banco.collection('auditoria').find({ acao: 'ia.chave_alterada' }).toArray();
    assert.equal(aud.length, 1);
    assert.equal(aud[0].estado, 'concluido');
    assert.equal(aud[0].extra.final4Novo, CHAVE.slice(-4));
  });

  test('ligar, trocar modelo e limites com versão; versão velha → 409 conflito-versao; limites fora da faixa → 400', async () => {
    const r = guardar(await ctx.api.put(BASE, { ligado: true, modelo: 'gemini-2.5-pro', limites: { mensagensPorHora: 10 }, versao: 1 }, admin));
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.ligado, true);
    assert.equal(r.corpo.modelo, 'gemini-2.5-pro');
    assert.equal(r.corpo.limites.mensagensPorHora, 10);
    assert.equal(r.corpo.versao, 2);
    const velho = await ctx.api.put(BASE, { ligado: false, versao: 1 }, admin);
    assert.equal(velho.status, 409);
    assert.equal(velho.corpo.codigo, 'conflito-versao');
    const fora = await ctx.api.put(BASE, { limites: { caracteresPorMensagem: 99999 }, versao: 2 }, admin);
    assert.equal(fora.status, 400);
    const aud = await ctx.banco.collection('auditoria').find({ acao: 'ia.config_alterada' }).toArray();
    assert.equal(aud.length, 1);
    assert.ok(aud[0].mudancas.some(m => m.campo === 'ligado'));
    assert.equal(await ctx.servicos.obter('ia.disponivel')(), true);
  });

  test('testar conexão: efetiva grava ultimoTeste; chave informada inválida → ok:false; 11ª em 10 min → 429', async () => {
    const r = guardar(await ctx.api.post(`${BASE}/testar`, {}, admin));
    assert.equal(r.status, 200);
    assert.equal(r.corpo.ok, true);
    assert.equal(r.corpo.modelo, 'gemini-2.5-pro');
    assert.equal(r.corpo.nomeExibicao, 'Gemini de teste');
    const g = guardar(await ctx.api.get(BASE, admin));
    assert.equal(g.corpo.ultimoTeste.ok, true);
    assert.equal(g.corpo.ultimoTeste.origem, 'painel');
    const inv = guardar(await ctx.api.post(`${BASE}/testar`, { chave: CHAVE_INVALIDA }, admin));
    assert.deepEqual(inv.corpo, { ok: false, codigo: 'chave-invalida' });
    const mod = guardar(await ctx.api.post(`${BASE}/testar`, { modelo: 'outro-modelo' }, admin));
    assert.deepEqual(mod.corpo, { ok: false, codigo: 'modelo-nao-encontrado' });
    let ultimo;
    for (let i = 0; i < 8; i++) ultimo = await ctx.api.post(`${BASE}/testar`, {}, admin);
    assert.equal(ultimo.status, 429);
    assert.ok(Number(ultimo.headers.get('retry-after')) > 0);
  });

  test('uso traz escalonadas e teto; trilha sem conteúdo, auditada, intervalo > 92 dias → 400', async () => {
    await ctx.banco.collection('ia_uso_diario').insertOne({ _id: '2026-10-18', mensagens: 5, tokensEntrada: 100, tokensSaida: 50, escalonadas: 2 });
    await ctx.banco.collection('ia_trilha').insertOne({
      userId: IDS['u-aluno1'], conversaId: 'c1', mensagemId: 'm-1', em: new Date('2026-10-18T11:00:00Z'), modelo: 'gemini-2.5-flash',
      versaoInstrucao: 'ia-v1', ferramentas: [{ nome: 'minha_frequencia', ok: true }], fontes: [{ regulamentoId: 'r1', trechoId: 'e1-t001', titulo: 'Frequência' }],
      bloqueada: false, sugerirAtendimento: false, escalonada: true, tokens: { entrada: 10, saida: 5 }, sha256Resposta: 'a'.repeat(64), expiraEm: new Date('2028-10-18T11:00:00Z')
    });
    const u = guardar(await ctx.api.get(`${BASE}/uso?dias=30`, admin));
    assert.equal(u.status, 200);
    const hoje = u.corpo.porDia.find(d => d.dia === '2026-10-18');
    if (hoje) assert.equal(hoje.escalonadas, 2);
    assert.ok('escalonadas30d' in u.corpo.totais);
    assert.equal(u.corpo.tetoGlobal.porDia, 1000);
    const longo = await ctx.api.get(`${BASE}/trilha?de=2026-01-01&ate=2026-10-18`, admin);
    assert.equal(longo.status, 400);
    const t = guardar(await ctx.api.get(`${BASE}/trilha?de=2026-10-01&ate=2026-10-31`, admin));
    assert.equal(t.status, 200);
    assert.equal(t.corpo.itens.length, 1);
    const item = t.corpo.itens[0];
    assert.equal(item.aluno.nome, 'Aluna Um de Teste');
    assert.deepEqual(item.ferramentas, ['Frequência']);
    assert.deepEqual(item.fontes, ['Frequência']);
    assert.equal(item.escalonada, true);
    assert.ok(!('texto' in item) && !('pergunta' in item) && !('resposta' in item));
    const aud = await ctx.banco.collection('auditoria').find({ acao: 'ia.trilha_consultada' }).toArray();
    assert.equal(aud.length, 1);
    assert.equal(aud[0].extra.de, '2026-10-01');
  });

  test('remover chave: sem reautenticação → 400; com → chave nula e assistente desligado', async () => {
    assert.equal((await ctx.api.post(`${BASE}/chave/remover`, {}, admin)).status, 400);
    const r = guardar(await ctx.api.post(`${BASE}/chave/remover`, { reautenticacao: reauth }, admin));
    assert.equal(r.status, 200);
    assert.equal(r.corpo.chave.configurada, false);
    assert.equal(r.corpo.ligado, false);
    const aud = await ctx.banco.collection('auditoria').find({ acao: 'ia.chave_removida' }).toArray();
    assert.equal(aud.length, 1);
    assert.equal(await ctx.servicos.obter('ia.disponivel')(), false);
  });

  test('a chave NUNCA aparece em resposta alguma nem na auditoria', async () => {
    for (const t of respostas) assert.ok(!t.includes(CHAVE) && !t.includes(CHAVE_INVALIDA), 'resposta com a chave');
    const aud = JSON.stringify(await ctx.banco.collection('auditoria').find({}).toArray());
    assert.ok(!aud.includes(CHAVE) && !aud.includes(CHAVE_INVALIDA), 'auditoria com a chave');
  });
});

describe('auditoria indisponível', () => {
  test('salvar a chave com a auditoria fora → 503 auditoria-indisponivel e nada muda', async () => {
    const ctx = await subirConfig();
    try {
      ctx.banco.falhar.insertOne = 'auditoria';
      const r = await ctx.api.put(`${BASE}/chave`, { chave: CHAVE, reautenticacao: reauth }, admin);
      assert.equal(r.status, 503);
      assert.equal(r.corpo.codigo, 'auditoria-indisponivel');
      ctx.banco.falhar.insertOne = false;
      assert.equal(await ctx.banco.collection('configuracoes').countDocuments({ _id: 'assistente_ia' }), 0);
      assert.ok(!r.texto.includes(CHAVE));
    } finally { await fechar(ctx.server); }
  });
});

describe('GEMINI_API_KEY no ambiente tem precedência', () => {
  let ctx;
  before(async () => { ctx = await subirConfig({ env: { GEMINI_API_KEY: 'AIzaChaveDoAmbiente_zzzzzzzzzzzz9876' } }); });
  after(() => fechar(ctx.server));
  test('origem env, PUT da chave → 409 chave-definida-no-ambiente; pode ligar sem chave do painel', async () => {
    const g = await ctx.api.get(BASE, admin);
    assert.equal(g.corpo.chave.origem, 'env');
    assert.equal(g.corpo.chave.final4, '9876');
    assert.ok(!g.texto.includes('AIzaChaveDoAmbiente'));
    const p = await ctx.api.put(`${BASE}/chave`, { chave: CHAVE, reautenticacao: reauth }, admin);
    assert.equal(p.status, 409);
    assert.equal(p.corpo.codigo, 'chave-definida-no-ambiente');
    const l = await ctx.api.put(BASE, { ligado: true, versao: 0 }, admin);
    assert.equal(l.status, 200, JSON.stringify(l.corpo));
    assert.equal(l.corpo.ligado, true);
    const e = await ctx.api.get('/api/portal/me/ia/estado', { usuario: 'u-aluno1' });
    assert.equal(e.corpo.disponivel, true);
  });
});

describe('reautenticação de quem tem verificação em duas etapas', () => {
  let ctx;
  before(async () => {
    ctx = await subirConfig();
    // u-2fa vira coordenação para o teste (o segredo TOTP dela está na fixture).
    await ctx.banco.collection('users').updateOne({ _id: oid('u-2fa') }, { $set: { isAdmin: true, papel: 'admin' } });
  });
  after(() => fechar(ctx.server));
  test('sem código → 400 campos.codigo; código errado → 400; certo → 200; o mesmo código de novo → 400 (anti-reuso)', async () => {
    const u = { usuario: 'u-2fa' };
    const sem = await ctx.api.put(`${BASE}/chave`, { chave: CHAVE, reautenticacao: { senha: SENHA_FIXTURE } }, u);
    assert.equal(sem.status, 400);
    assert.ok(sem.corpo.campos.codigo);
    const errado = await ctx.api.put(`${BASE}/chave`, { chave: CHAVE, reautenticacao: { senha: SENHA_FIXTURE, codigo: '000000' } }, u);
    assert.equal(errado.status, 400);
    assert.equal(errado.corpo.campos.codigo, 'Código inválido.');
    const codigo = codigoTotp(SEGREDO_TOTP_FIXTURE, passoAtual(Date.now()));
    const ok = await ctx.api.put(`${BASE}/chave`, { chave: CHAVE, reautenticacao: { senha: SENHA_FIXTURE, codigo } }, u);
    assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
    const reuso = await ctx.api.post(`${BASE}/chave/remover`, { reautenticacao: { senha: SENHA_FIXTURE, codigo } }, u);
    assert.equal(reuso.status, 400);
    assert.ok(reuso.corpo.campos.codigo);
    assert.equal((await ctx.api.get(BASE, u)).corpo.chave.configurada, true, 'nada removido');
  });
});
