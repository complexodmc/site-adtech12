// Portal · principal — LIGAÇÃO dos três pontos de server.js (PORTAL-ACADEMICO §8.1 linha
// "Principal", §8.3 G0-b, §9.7; PORTAL-API §5.3 itens 1–3; D-42, D-70, D-82, DC-77).
//
// Só a ligação: as regras do tratamento global (keyValue, body, 413, Mongo → 503,
// `registrado`) são da F0a e ficam em portal-base-util.test.js, sobre tratarErroGlobal
// chamado direto. Aqui:
//   1. o texto de server.js tem os três pontos, uma vez cada e na posição de §5.3;
//   2. o app REAL de server.js, com JSON quebrado contendo a senha em
//      POST /api/auth/senha/trocar, responde 400 `formato-invalido` (JSON) e nenhuma
//      linha de console — log espião — traz a senha;
//   3. `Cache-Control: no-store` em toda /api, montado antes de qualquer rota (§9.8 A05,
//      achado do G2): texto + app real sem banco; os 200 com banco em tests/e2e/api-cache.spec.js.
// O JSON é recusado pelo express.json global, antes de ensureConnected: nenhum Mongo é
// aberto (a URI aponta para uma porta morta de loopback) e server/.env nunca é lido.
// Rode com `npm test` na raiz (ou `NODE_ENV=test node --test server/test/servidor-erros.test.js`).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO_SERVIDOR = path.resolve(__dirname, '../src/server.js');

// Antes de importar server.js: sem .env (DOTENV_CONFIG_PATH), sem listen (NODE_ENV=test,
// senão start() tentaria o banco e sairia do processo) e sem banco alcançável.
process.env.DOTENV_CONFIG_PATH = '/dev/null';
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:9/?serverSelectionTimeoutMS=500';
process.env.MONGODB_DB = 'complexodmc_servidor_erros_qa';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';

// Senhas fictícias e distintivas; o trecho sem aspas força o "Unexpected token" do V8,
// cuja mensagem cita um pedaço do corpo, e o body-parser guarda o corpo cru em err.body.
const SENHA_ATUAL = 'Qa-Atual-7731-Zx';
const SENHA_NOVA = 'Qa-Nova-5512-Zx';
const CORPO_QUEBRADO = `{"senhaAtual":"${SENHA_ATUAL}","senhaNova": ${SENHA_NOVA}}`;
const FRAGMENTOS_PROIBIDOS = [SENHA_ATUAL, SENHA_NOVA, 'Qa-Atual', 'Qa-Nova'];

// ---------------------------------------------------------------------------
// 1. Texto de server.js: os três pontos, uma vez cada, na ordem de §5.3
// ---------------------------------------------------------------------------
describe('server.js — três pontos da principal (texto)', () => {
  const fonte = fs.readFileSync(ARQUIVO_SERVIDOR, 'utf8');
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const posicoes = (trecho) => {
    const r = [];
    for (let i = semComentarios.indexOf(trecho); i >= 0; i = semComentarios.indexOf(trecho, i + 1)) r.push(i);
    return r;
  };
  const unica = (trecho) => {
    const p = posicoes(trecho);
    assert.equal(p.length, 1, `esperado exatamente 1 ocorrência de «${trecho}» em server.js; achei ${p.length}`);
    return p[0];
  };

  test('ponto 1: import de montarPortal e tratarErroGlobal de ./portal/montar.js', () => {
    unica("import { montarPortal, tratarErroGlobal } from './portal/montar.js';");
  });

  test('ponto 2: app.use(\'/api\', montarPortal()) depois de auth e dos formulários, antes do LMS legado', () => {
    const montagem = unica("app.use('/api', montarPortal());");
    const antes = [
      "app.use('/api', loadUser);",
      "app.use('/api/auth', authRoutes);",
      "app.use('/api/contato', criarRotaContato(",
      "app.use('/api/parcerias', criarRotaParcerias(",
      "app.use('/api/vitrine', criarRotaVitrine(",
      "app.use('/api/bolsas', criarRotaBolsas("
    ];
    const depois = [
      "app.use('/api/liberacoes', liberacoesRoutes);",
      "app.use('/api/progresso', progressoRoutes);",
      "app.use('/api/lives', livesRoutes);",
      "app.use('/api', certificadosRoutes);",
      "app.use('/api', catalogoRoutes);",
      "app.use('/api', (_req, res) => res.status(404)"
    ];
    for (const t of antes) {
      const p = posicoes(t);
      assert.ok(p.length >= 1, `server.js perdeu «${t}»`);
      assert.ok(Math.max(...p) < montagem, `«${t}» deveria vir ANTES do agregador (API §5.3 item 2)`);
    }
    for (const t of depois) {
      const p = posicoes(t);
      assert.ok(p.length >= 1, `server.js perdeu «${t}»`);
      assert.ok(Math.min(...p) > montagem, `«${t}» deveria vir DEPOIS do agregador (API §5.3 item 2)`);
    }
  });

  test('ponto 3: app.use(tratarErroGlobal) é o handler de erro final e o bloco anônimo saiu', () => {
    const tratador = unica('app.use(tratarErroGlobal);');
    const estatico = unica('app.use(express.static(');
    assert.ok(tratador > estatico, 'o tratamento de erro global deve vir depois do express.static, como o bloco que substituiu');
    const ultimoAppUse = Math.max(...posicoes('app.use('));
    assert.equal(ultimoAppUse, tratador, 'nenhum app.use() pode vir depois de app.use(tratarErroGlobal)');
    assert.doesNotMatch(semComentarios, /app\.use\(\s*(async\s+)?(function\b[^(]*)?\(\s*_?err\b/, 'sobrou um handler de erro próprio em server.js (API §5.3 item 3)');
  });
});

// ---------------------------------------------------------------------------
// 2. App real: JSON quebrado com a senha → 400 formato-invalido, log sem a senha
// ---------------------------------------------------------------------------
describe('server.js — JSON quebrado chega ao tratarErroGlobal (app real)', () => {
  const METODOS = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
  const originais = {};
  const linhas = [];
  let servidor = null;
  let base = null;

  before(async () => {
    // Log espião desde ANTES do import: pega também os avisos de carga do app.
    for (const m of METODOS) {
      originais[m] = console[m];
      console[m] = (...args) => {
        linhas.push(args.map((a) => (typeof a === 'string' ? a : (() => {
          try { return a instanceof Error ? `${a.name}: ${a.message} ${JSON.stringify(a)}` : JSON.stringify(a); } catch { return String(a); }
        })())).join(' '));
      };
    }
    const { app } = await import('../src/server.js');
    await new Promise((ok, erro) => {
      servidor = app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${servidor.address().port}`; ok(); });
      servidor.on('error', erro);
    });
  });

  after(async () => {
    for (const m of METODOS) console[m] = originais[m];
    if (servidor) {
      servidor.closeAllConnections?.();
      await new Promise((ok) => servidor.close(() => ok()));
    }
  });

  test('POST /api/auth/senha/trocar com JSON quebrado → 400 { codigo: "formato-invalido" } e nenhuma linha de log com a senha', async () => {
    const r = await fetch(`${base}/api/auth/senha/trocar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer token-qualquer' },
      body: CORPO_QUEBRADO
    });
    const texto = await r.text();
    const diagnostico = `status ${r.status}, corpo ${texto.slice(0, 200)}`;

    assert.equal(r.status, 400, diagnostico);
    assert.match(r.headers.get('content-type') || '', /^application\/json/, `resposta deveria ser JSON (handler padrão do Express devolve HTML) — ${diagnostico}`);
    const corpo = JSON.parse(texto);
    assert.equal(corpo.codigo, 'formato-invalido', diagnostico);
    assert.equal(corpo.error, 'Formato inválido.', diagnostico);
    for (const f of FRAGMENTOS_PROIBIDOS) assert.ok(!texto.includes(f), `a resposta ecoa «${f}»`);

    const vazadas = linhas.filter((l) => FRAGMENTOS_PROIBIDOS.some((f) => l.includes(f)));
    assert.deepEqual(vazadas, [], 'o log não pode trazer a senha nem trecho do corpo');
  });
});

// ---------------------------------------------------------------------------
// 3. Cache-Control: no-store em TODA /api (§9.8 A05, ASVS 8.2.1 — achado do G2)
// ---------------------------------------------------------------------------
// O `semCache` do agregador só cobre /api/portal/* e as rotas novas de /api/auth/*. As
// legadas montadas fora dele (/api/auth/me, signin, liberacoes, certificados, lives,
// progresso, duvidas, parcerias/admin) saíam sem Cache-Control e a Vercel aplicava
// `public, max-age=0, must-revalidate`: o navegador guardava o JSON autenticado em disco.
// server.js põe `no-store` antes de qualquer rota de /api; quem quer cache (capas, vitrine,
// materiais, arquivos) sobrescreve depois, no próprio router. Aqui:
//   a. texto — o no-store é a PRIMEIRA montagem de /api (antes dos parsers e de /api/health);
//   b. app real, sem banco — 200 de /api/health, 413 do parser do contato e 503 (banco fora)
//      das rotas legadas saem com `no-store`; o site estático fica fora (não é /api).
// Os 200 autenticados das rotas legadas, com banco, ficam no E2E tests/e2e/api-cache.spec.js.
describe('server.js — Cache-Control: no-store em toda /api (A05)', () => {
  const fonte = fs.readFileSync(ARQUIVO_SERVIDOR, 'utf8');
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const MARCA = "res.set('Cache-Control', 'no-store')";
  const METODOS = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
  const originais = {};
  let servidor = null;
  let base = null;

  before(async () => {
    // Os 503 de banco fora logam pelo tratarErroGlobal; silenciados só neste bloco.
    for (const m of METODOS) { originais[m] = console[m]; console[m] = () => {}; }
    const { app } = await import('../src/server.js');
    await new Promise((ok, erro) => {
      servidor = app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${servidor.address().port}`; ok(); });
      servidor.on('error', erro);
    });
  });

  after(async () => {
    for (const m of METODOS) console[m] = originais[m];
    if (servidor) {
      servidor.closeAllConnections?.();
      await new Promise((ok) => servidor.close(() => ok()));
    }
  });

  test('texto: o no-store fica dentro da PRIMEIRA montagem de /api, em app.use(\'/api\', …)', () => {
    const marca = semComentarios.indexOf(MARCA);
    assert.ok(marca >= 0, `server.js não tem «${MARCA}»`);
    assert.equal(semComentarios.indexOf(MARCA, marca + 1), -1, `«${MARCA}» deve aparecer uma vez só`);
    const montagens = [...semComentarios.matchAll(/app\.(?:use|get|post|put|patch|delete|all)\(\s*'\/api[^']*'/g)].map((m) => m.index);
    assert.ok(montagens.length > 1, 'server.js sem montagens de /api?');
    assert.ok(montagens[0] < marca && marca < montagens[1],
      'o no-store deve estar na PRIMEIRA montagem de /api (antes de corpoContato, /api/health e das rotas legadas)');
    assert.match(semComentarios.slice(montagens[0], marca), /^app\.use\(\s*'\/api'\s*,/, 'a primeira montagem deve ser app.use(\'/api\', …) — /api inteira');
  });

  const CASOS = [
    { nome: 'GET /api/health (200, sem banco)', metodo: 'GET', caminho: '/api/health', status: 200 },
    {
      nome: 'POST /api/contato com corpo > 16 KB (413 do parser próprio, antes do JSON global)',
      metodo: 'POST', caminho: '/api/contato', status: 413,
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mensagem: 'x'.repeat(17 * 1024) })
    },
    { nome: 'GET /api/auth/me legado com Bearer (503, banco fora)', metodo: 'GET', caminho: '/api/auth/me', status: 503, headers: { authorization: 'Bearer token-qualquer' } },
    { nome: 'GET /api/liberacoes/me legado com Bearer (503, banco fora)', metodo: 'GET', caminho: '/api/liberacoes/me', status: 503, headers: { authorization: 'Bearer token-qualquer' } }
  ];
  for (const c of CASOS) {
    test(`${c.nome} → Cache-Control: no-store`, async () => {
      const r = await fetch(`${base}${c.caminho}`, { method: c.metodo, headers: c.headers, body: c.body });
      const texto = await r.text();
      const diagnostico = `status ${r.status}, cache-control «${r.headers.get('cache-control')}», corpo ${texto.slice(0, 160)}`;
      assert.equal(r.status, c.status, diagnostico);
      assert.equal(r.headers.get('cache-control'), 'no-store', diagnostico);
    });
  }

  test('site estático (/index.html) fica fora: sem no-store', async () => {
    const r = await fetch(`${base}/index.html`);
    await r.arrayBuffer();
    assert.equal(r.status, 200);
    assert.doesNotMatch(r.headers.get('cache-control') || '', /no-store/, 'o no-store vale só para /api');
  });
});
