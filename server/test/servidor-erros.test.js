// Portal · principal — LIGAÇÃO dos três pontos de server.js (PORTAL-ACADEMICO §8.1 linha
// "Principal", §8.3 G0-b, §9.7; PORTAL-API §5.3 itens 1–3; D-42, D-70, D-82, DC-77).
//
// Só a ligação: as regras do tratamento global (keyValue, body, 413, Mongo → 503,
// `registrado`) são da F0a e ficam em portal-base-util.test.js, sobre tratarErroGlobal
// chamado direto. Aqui:
//   1. o texto de server.js tem os três pontos, uma vez cada e na posição de §5.3;
//   2. o app REAL de server.js, com JSON quebrado contendo a senha em
//      POST /api/auth/senha/trocar, responde 400 `formato-invalido` (JSON) e nenhuma
//      linha de console — log espião — traz a senha.
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
