// Configuração legada (server/src/config.js) — força do JWT_SECRET e do
// PORTAL_MATERIAL_ANTERIOR em produção (revisão OWASP §9.8, A02/A05).
//
// O JWT_SECRET assina os JWT HS256 e é o material do HKDF da cifra, do selo e do
// HMAC do descadastro. Em produção (NODE_ENV=production ou VERCEL_ENV presente)
// a carga é recusada quando ele tem menos de 32 bytes, é o texto de exemplo do
// .env.example, é repetitivo ou é igual ao PORTAL_MATERIAL_ANTERIOR — e o log diz
// o motivo sem nunca trazer o valor. Fora de produção só avisa; nos testes, nada.
//
// Parte 1: funções puras, chamadas com um `env` próprio.
// Parte 2: a carga real do módulo num processo filho (o config.js encerra o
// processo), com ambiente mínimo: sem .env (DOTENV_CONFIG_PATH), URI de Mongo
// numa porta morta de loopback (nada conecta) e nenhuma porta aberta.
// Rode com `npm test` na raiz (ou `NODE_ENV=test node --test server/test/config-segredos.test.js`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO_CONFIG = path.resolve(__dirname, '../src/config.js');

process.env.DOTENV_CONFIG_PATH = '/dev/null';
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';

const mod = await import(pathToFileURL(ARQUIVO_CONFIG).href);

const EXEMPLO = 'troque-por-um-segredo-longo-e-aleatorio'; // server/.env.example, linha do JWT_SECRET
const forte = () => crypto.randomBytes(48).toString('base64'); // = openssl rand -base64 48
const motivos = (env, variavel = 'JWT_SECRET') =>
  mod.problemasDosSegredos(env).filter(p => p.variavel === variavel).map(p => p.motivo).sort();

describe('config.js · problemasDosSegredos (puro)', () => {
  test('exporta as funções e o mínimo de 32 bytes', () => {
    assert.equal(typeof mod.problemasDosSegredos, 'function');
    assert.equal(typeof mod.ehProducao, 'function');
    assert.equal(mod.SEGREDO_MIN_BYTES, 32);
  });

  test('o texto de exemplo do .env.example é recusado (também colado com aspas)', () => {
    assert.ok(motivos({ JWT_SECRET: EXEMPLO }).includes('exemplo'));
    assert.ok(motivos({ JWT_SECRET: `"${EXEMPLO}"` }).includes('exemplo'));
    assert.ok(motivos({ JWT_SECRET: EXEMPLO.toUpperCase() + '-producao-2026' }).includes('exemplo'));
  });

  test('menos de 32 bytes é recusado; 32 bytes aleatórios passam; conta bytes, não caracteres', () => {
    assert.deepEqual(motivos({ JWT_SECRET: 'x' }), ['curto', 'repetitivo']);
    assert.deepEqual(motivos({ JWT_SECRET: 'segredo-apenas-para-testes' }), ['curto']);
    const base = crypto.randomBytes(48).toString('hex');
    assert.deepEqual(motivos({ JWT_SECRET: base.slice(0, 31) }), ['curto']);
    assert.deepEqual(motivos({ JWT_SECRET: base.slice(0, 32) }), []);
    // 16 caracteres, 32 bytes em UTF-8: não é curto.
    assert.ok(!motivos({ JWT_SECRET: 'áéíóúâêôãõçàüñœø' }).includes('curto'));
  });

  test('valor repetitivo (menos de 8 caracteres distintos) é recusado', () => {
    assert.deepEqual(motivos({ JWT_SECRET: 'a'.repeat(64) }), ['repetitivo']);
    assert.deepEqual(motivos({ JWT_SECRET: 'abcabcabc'.repeat(8) }), ['repetitivo']);
  });

  test('os formatos que a documentação manda gerar passam (e o do serve.mjs, 24 bytes em hex)', () => {
    assert.deepEqual(mod.problemasDosSegredos({ JWT_SECRET: forte() }), []);
    assert.deepEqual(mod.problemasDosSegredos({ JWT_SECRET: crypto.randomBytes(48).toString('hex') }), []);
    assert.deepEqual(mod.problemasDosSegredos({ JWT_SECRET: crypto.randomBytes(24).toString('hex') }), []);
  });

  test('espaços nas pontas são ignorados como no required() (o valor útil é o aparado)', () => {
    assert.deepEqual(motivos({ JWT_SECRET: '   x' + ' '.repeat(40) }), ['curto', 'repetitivo']);
  });

  test('PORTAL_MATERIAL_ANTERIOR: ausente ou vazio não é problema', () => {
    assert.deepEqual(mod.problemasDosSegredos({ JWT_SECRET: forte() }), []);
    assert.deepEqual(mod.problemasDosSegredos({ JWT_SECRET: forte(), PORTAL_MATERIAL_ANTERIOR: '' }), []);
    assert.deepEqual(mod.problemasDosSegredos({ JWT_SECRET: forte(), PORTAL_MATERIAL_ANTERIOR: '   ' }), []);
  });

  test('PORTAL_MATERIAL_ANTERIOR igual ao JWT_SECRET é recusado (a rotação não trocou o segredo)', () => {
    const s = forte();
    assert.deepEqual(motivos({ JWT_SECRET: s, PORTAL_MATERIAL_ANTERIOR: s }, 'PORTAL_MATERIAL_ANTERIOR'), ['igual-ao-atual']);
    assert.deepEqual(motivos({ JWT_SECRET: s, PORTAL_MATERIAL_ANTERIOR: ` ${s} ` }, 'PORTAL_MATERIAL_ANTERIOR'), ['igual-ao-atual']);
    assert.deepEqual(motivos({ JWT_SECRET: s, PORTAL_MATERIAL_ANTERIOR: s }), []);
  });

  test('PORTAL_MATERIAL_ANTERIOR passa pelas mesmas regras de força', () => {
    const s = forte();
    assert.deepEqual(motivos({ JWT_SECRET: s, PORTAL_MATERIAL_ANTERIOR: EXEMPLO }, 'PORTAL_MATERIAL_ANTERIOR'), ['exemplo']);
    assert.deepEqual(motivos({ JWT_SECRET: s, PORTAL_MATERIAL_ANTERIOR: 'curto-demais' }, 'PORTAL_MATERIAL_ANTERIOR'), ['curto']);
    assert.deepEqual(mod.problemasDosSegredos({ JWT_SECRET: s, PORTAL_MATERIAL_ANTERIOR: forte() }), []);
  });

  test('nenhum problema traz o valor do segredo', () => {
    const fraco = 'Segredo-Fraco-Distintivo-7';
    const texto = JSON.stringify(mod.problemasDosSegredos({ JWT_SECRET: fraco, PORTAL_MATERIAL_ANTERIOR: fraco }));
    assert.ok(!texto.includes(fraco));
  });
});

describe('config.js · ehProducao (puro)', () => {
  test('NODE_ENV=production ou VERCEL_ENV presente = produção', () => {
    assert.equal(mod.ehProducao({ NODE_ENV: 'production' }), true);
    assert.equal(mod.ehProducao({ NODE_ENV: ' production ' }), true);
    assert.equal(mod.ehProducao({ VERCEL_ENV: 'production' }), true);
    assert.equal(mod.ehProducao({ VERCEL_ENV: 'preview' }), true);
    assert.equal(mod.ehProducao({ VERCEL: '1', VERCEL_ENV: 'development' }), true);
  });

  test('VERCEL=1 sozinho (serve.mjs de QA), NODE_ENV=test e ambiente vazio não são produção', () => {
    assert.equal(mod.ehProducao({ VERCEL: '1' }), false);
    assert.equal(mod.ehProducao({ NODE_ENV: 'test' }), false);
    assert.equal(mod.ehProducao({ NODE_ENV: 'development' }), false);
    assert.equal(mod.ehProducao({}), false);
  });
});

// ---------------------------------------------------------------------------
// Parte 2 — a carga real do módulo (processo filho)
// ---------------------------------------------------------------------------
function carregar(envExtra) {
  const env = {
    PATH: process.env.PATH,
    DOTENV_CONFIG_PATH: '/dev/null',
    DOTENV_CONFIG_QUIET: 'true',
    MONGODB_URI: 'mongodb://127.0.0.1:9/sem-conexao-nos-testes',
    ...envExtra
  };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
  const codigo = `import(${JSON.stringify(pathToFileURL(ARQUIVO_CONFIG).href)})`
    + `.then(m => { console.log('carregou ' + m.config.jwtSecret.length); })`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], {
    cwd: os.tmpdir(), env, encoding: 'utf8', timeout: 20_000
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

describe('config.js · carga em produção (processo filho)', () => {
  test('NODE_ENV=production com o texto de exemplo: recusa, saída 1, motivo no log sem o valor', () => {
    const r = carregar({ NODE_ENV: 'production', JWT_SECRET: EXEMPLO });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(!r.stdout.includes('carregou'));
    assert.match(r.stderr, /JWT_SECRET/);
    assert.match(r.stderr, /exemplo/);
    assert.match(r.stderr, /openssl rand -base64 48/);
    assert.ok(!r.stderr.includes(EXEMPLO), 'o log não pode trazer o valor');
  });

  test('VERCEL_ENV=production com 1 caractere: recusa', () => {
    const r = carregar({ VERCEL: '1', VERCEL_ENV: 'production', JWT_SECRET: 'x' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /JWT_SECRET/);
    assert.match(r.stderr, /32 bytes/);
  });

  test('produção com PORTAL_MATERIAL_ANTERIOR igual ao JWT_SECRET: recusa, sem o valor no log', () => {
    const s = forte();
    const r = carregar({ NODE_ENV: 'production', JWT_SECRET: s, PORTAL_MATERIAL_ANTERIOR: s });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /PORTAL_MATERIAL_ANTERIOR/);
    assert.ok(!r.stderr.includes(s));
  });

  test('produção com segredo forte (e anterior forte e distinto): carrega, sem aviso', () => {
    const r = carregar({ NODE_ENV: 'production', VERCEL_ENV: 'production', JWT_SECRET: forte(), PORTAL_MATERIAL_ANTERIOR: forte() });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /carregou 64/);
    assert.equal(r.stderr, '');
  });

  test('JWT_SECRET ausente continua com a mensagem e a saída de antes', () => {
    const r = carregar({ NODE_ENV: 'production', JWT_SECRET: undefined });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Variável de ambiente JWT_SECRET não definida/);
  });

  test('fora de produção um segredo fraco carrega, com aviso sem o valor', () => {
    const r = carregar({ JWT_SECRET: EXEMPLO });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /carregou/);
    assert.match(r.stderr, /aviso/i);
    assert.match(r.stderr, /JWT_SECRET/);
    assert.ok(!r.stderr.includes(EXEMPLO));
  });

  test('o servidor de QA (VERCEL=1, sem VERCEL_ENV, 24 bytes em hex) carrega sem aviso', () => {
    const r = carregar({ VERCEL: '1', JWT_SECRET: crypto.randomBytes(24).toString('hex') });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.stderr, '');
  });

  test('NODE_ENV=test com segredo fraco: carrega em silêncio (testes de unidade)', () => {
    const r = carregar({ NODE_ENV: 'test', JWT_SECRET: 'segredo-apenas-para-testes' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.stderr, '');
  });
});
