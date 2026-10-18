// Testes do /api/newsletter sem MongoDB: salvar/descadastrar/notificar são injetados.
// Rode com `npm test` na raiz (node --test). Nunca lê server/.env.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  validarInscricao, validarEmail, normalizarEmail, truncarIp, gerarTokenDescadastro, verificarTokenDescadastro,
  criarRotaNewsletter, criarRepositorioNewsletter, mascararEmail, ehRobo, resumirErro, origemPermitida,
  corpoEmailInscricao, assuntoEmailInscricao, TEXTO_CONSENTIMENTO, TEXTOS_CONSENTIMENTO, BASE_LEGAL,
  HISTORICO_MAX, HEADERS_HTML, MENSAGENS
} from '../src/routes/newsletter.js';
import { corpoContato, criarNotificadorEmail } from '../src/routes/contato.js';
import { criarThrottle } from '../src/throttle.js';

const VALIDO = Object.freeze({
  nome: '  Maria  da Silva ',
  email: 'Maria@Exemplo.com.br',
  empresa: 'Silva Agro',
  consentimento: true,
  origem: 'home-newsletter'
});

const SEGREDO = 'teste';
const silencioso = { log() {}, warn() {}, error() {} };

// ---------- validação pura ----------
describe('validarInscricao', () => {
  test('aceita envio completo e normaliza', () => {
    const r = validarInscricao(VALIDO);
    assert.equal(r.ok, true);
    assert.deepEqual(r.erros, {});
    assert.equal(r.dados.nome, 'Maria da Silva');
    assert.equal(r.dados.email, 'maria@exemplo.com.br');
    assert.equal(r.dados.empresa, 'Silva Agro');
    assert.equal(r.dados.origem, 'home-newsletter');
    assert.equal('consentimento' in r.dados, false);
  });

  test('empresa vazia não entra em dados', () => {
    const r = validarInscricao({ ...VALIDO, empresa: '  ' });
    assert.equal(r.ok, true);
    assert.equal('empresa' in r.dados, false);
  });

  test('corpo vazio: nome, email e consentimento em português', () => {
    const r = validarInscricao({});
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.erros).sort(), ['consentimento', 'email', 'nome']);
    assert.equal(r.erros.nome, 'Informe seu nome.');
    assert.equal(r.erros.email, 'Informe seu e-mail.');
    assert.match(r.erros.consentimento, /LGPD/);
    assert.equal(r.dados.origem, 'nao-informada');
  });

  test('corpo não-objeto é tratado como vazio', () => {
    for (const corpo of [null, undefined, 'x', 42, [VALIDO]]) {
      assert.equal(validarInscricao(corpo).ok, false);
    }
  });

  test('e-mail inválido, nome curto, tamanhos e tipos estruturados', () => {
    assert.match(validarInscricao({ ...VALIDO, email: 'maria@' }).erros.email, /E-mail inválido/);
    assert.equal(validarInscricao({ ...VALIDO, nome: 'M' }).erros.nome, 'Informe seu nome completo.');
    assert.equal(validarInscricao({ ...VALIDO, nome: '12' }).erros.nome, 'Informe seu nome completo.');
    const longo = validarInscricao({ ...VALIDO, nome: 'n'.repeat(121), empresa: 'e'.repeat(121) });
    assert.match(longo.erros.nome, /muito longo \(máximo de 120/);
    assert.match(longo.erros.empresa, /muito longo \(máximo de 120/);
    const tipos = validarInscricao({ ...VALIDO, email: { $gt: '' }, nome: ['a', 'b'], empresa: { x: 1 } });
    assert.equal(tipos.erros.email, 'Formato inválido.');
    assert.equal(tipos.erros.nome, 'Formato inválido.');
    assert.equal(tipos.erros.empresa, 'Formato inválido.');
  });

  test('e-mail: aceita "+", remove invisíveis (ZWSP/soft hyphen) e recusa não-ASCII (İ, IDN)', () => {
    assert.equal(validarInscricao({ ...VALIDO, email: 'maria+dmc@exemplo.com.br' }).dados.email, 'maria+dmc@exemplo.com.br');
    // ZWSP e soft hyphen dentro do endereço: a chave de dedupe não pode ser "outra".
    const zwsp = validarInscricao({ ...VALIDO, email: 'maria\u200b@exemplo.com' });
    assert.equal(zwsp.ok, true);
    assert.equal(zwsp.dados.email, 'maria@exemplo.com');
    assert.equal(validarInscricao({ ...VALIDO, email: 'ma\u00adria@exemplo.com\ufeff' }).dados.email, 'maria@exemplo.com');
    // Só invisíveis → "Informe seu e-mail."
    assert.equal(validarInscricao({ ...VALIDO, email: '\u200b\u200c' }).erros.email, 'Informe seu e-mail.');
    // Não-ASCII: toLowerCase mudaria a chave (İ → i̇) e IDN sem punycode não é entregável.
    assert.match(validarInscricao({ ...VALIDO, email: '\u0130@exemplo.com' }).erros.email, /E-mail inválido/);
    assert.match(validarInscricao({ ...VALIDO, email: 'maria@exémplo.com' }).erros.email, /E-mail inválido/);
    assert.match(validarInscricao({ ...VALIDO, email: 'maria @exemplo.com' }).erros.email, /E-mail inválido/);
  });

  test('validarEmail segue as mesmas regras (descadastro por e-mail)', () => {
    assert.deepEqual(validarEmail(' Maria\u200b@Exemplo.com.br '), { ok: true, email: 'maria@exemplo.com.br' });
    assert.deepEqual(validarEmail('maria+x@exemplo.com.br'), { ok: true, email: 'maria+x@exemplo.com.br' });
    assert.equal(validarEmail('').erro, 'Informe seu e-mail.');
    assert.equal(validarEmail(undefined).erro, 'Informe seu e-mail.');
    assert.equal(validarEmail({ $gt: '' }).erro, 'Formato inválido.');
    assert.match(validarEmail('x').erro, /E-mail inválido/);
    assert.match(validarEmail('\u0130@x.com').erro, /E-mail inválido/);
    assert.match(normalizarEmail('a'.repeat(250) + '@x.com').erro, /E-mail inválido/);
  });

  test('texto do consentimento versionado e base legal', () => {
    assert.ok(TEXTOS_CONSENTIMENTO[TEXTO_CONSENTIMENTO]);
    assert.match(TEXTOS_CONSENTIMENTO.v1, /Posso cancelar a qualquer momento\./);
    assert.equal(BASE_LEGAL, 'consentimento');
  });

  test('consentimento precisa ser afirmativo', () => {
    for (const v of [false, 'false', '', undefined, 0, 'nao']) {
      assert.ok(validarInscricao({ ...VALIDO, consentimento: v }).erros.consentimento, `aceitou ${v}`);
    }
    for (const v of [true, 'true', 'on', '1', 'sim', 'yes']) {
      assert.equal(validarInscricao({ ...VALIDO, consentimento: v }).ok, true, `recusou ${v}`);
    }
  });

  test('origem é cortada em 120 e tem padrão', () => {
    assert.equal(validarInscricao({ ...VALIDO, origem: 'x'.repeat(500) }).dados.origem.length, 120);
    assert.equal(validarInscricao({ ...VALIDO, origem: '' }).dados.origem, 'nao-informada');
    assert.equal(validarInscricao({ ...VALIDO, origem: ['a'] }).dados.origem, 'nao-informada');
  });
});

describe('ehRobo (honeypot)', () => {
  test('só dispara com website preenchido', () => {
    assert.equal(ehRobo({}), false);
    assert.equal(ehRobo({ website: '  ' }), false);
    assert.equal(ehRobo({ website: 'http://spam.example' }), true);
    assert.equal(ehRobo({ website: ['x'] }), true);
  });
});

describe('truncarIp', () => {
  test('IPv4 → /24, IPv4 mapeado → /24, IPv6 → /48, ausente → null', () => {
    assert.equal(truncarIp('203.0.113.77'), '203.0.113.0/24');
    assert.equal(truncarIp('::ffff:203.0.113.77'), '203.0.113.0/24');
    assert.equal(truncarIp('2001:db8:abcd:12::1'), '2001:db8:abcd::/48');
    assert.equal(truncarIp('2001:0db8:0000:0000:0000:0000:0000:0001'), '2001:db8:0::/48');
    assert.equal(truncarIp('::1'), '0:0:0::/48');
    assert.equal(truncarIp('fe80::1%eth0'), 'fe80:0:0::/48');
    assert.equal(truncarIp(undefined), null);
    assert.equal(truncarIp(''), null);
    assert.equal(truncarIp('desconhecido'), null);
  });
});

describe('resumirErro (log sem dado pessoal)', () => {
  test('redige dup key e e-mails; mantém nome e código', () => {
    const err = Object.assign(new Error('E11000 duplicate key error collection: x.newsletter_inscricoes index: uq_newsletter_email dup key: { email: "vitima@exemplo.com.br" }'), { code: 11000, name: 'MongoServerError' });
    const r = resumirErro(err);
    assert.doesNotMatch(r, /vitima/);
    assert.doesNotMatch(r, /exemplo\.com\.br/);
    assert.match(r, /^MongoServerError code=11000: E11000 duplicate key error/);
    assert.doesNotMatch(resumirErro(new Error('documento { email: "a@b.com", nome: "x" }')), /a@b\.com/);
    assert.equal(resumirErro(null), 'erro desconhecido');
    assert.equal(resumirErro(new Error('rede')), 'Error: rede');
  });
});

describe('origemPermitida (CSRF do descadastro por e-mail)', () => {
  const req = (h) => ({ get: (k) => h[k.toLowerCase()] });
  const lista = ['https://complexodmc.com.br', 'https://www.complexodmc.com.br', 'http://localhost'];
  test('sem Origin/Referer passa; própria origem passa; terceiro e "null" não', () => {
    assert.equal(origemPermitida(req({}), lista), true);
    assert.equal(origemPermitida(req({ origin: 'https://complexodmc.com.br' }), lista), true);
    assert.equal(origemPermitida(req({ origin: 'https://WWW.complexodmc.com.br' }), lista), true);
    assert.equal(origemPermitida(req({ origin: 'http://localhost:4590' }), lista), true);
    assert.equal(origemPermitida(req({ referer: 'https://complexodmc.com.br/pages/politica-de-privacidade.html' }), lista), true);
    assert.equal(origemPermitida(req({ origin: 'https://evil.example' }), lista), false);
    assert.equal(origemPermitida(req({ origin: 'https://complexodmc.com.br.evil.example' }), lista), false);
    assert.equal(origemPermitida(req({ origin: 'null' }), lista), false);
    assert.equal(origemPermitida(req({ referer: 'https://evil.example/x' }), lista), false);
    assert.equal(origemPermitida(req({ origin: 'https://evil.example' }), []), true, 'lista vazia aceita tudo');
  });
});

describe('token de descadastro (HMAC)', () => {
  test('ida e volta', () => {
    const t = gerarTokenDescadastro('Maria@Exemplo.com.br', SEGREDO);
    assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(verificarTokenDescadastro(t, SEGREDO), 'maria@exemplo.com.br');
  });

  test('e-mail alterado, assinatura alterada, segredo diferente e formato inválido', () => {
    const t = gerarTokenDescadastro('maria@exemplo.com.br', SEGREDO);
    const [email, assinatura] = t.split('.');
    const outroEmail = Buffer.from('mario@exemplo.com.br').toString('base64url');
    assert.equal(verificarTokenDescadastro(`${outroEmail}.${assinatura}`, SEGREDO), null);
    const assinaturaAlterada = (assinatura[0] === 'A' ? 'B' : 'A') + assinatura.slice(1);
    assert.equal(verificarTokenDescadastro(`${email}.${assinaturaAlterada}`, SEGREDO), null);
    assert.equal(verificarTokenDescadastro(t, 'outro-segredo'), null);
    assert.equal(verificarTokenDescadastro('sem-ponto', SEGREDO), null);
    assert.equal(verificarTokenDescadastro('', SEGREDO), null);
    assert.equal(verificarTokenDescadastro(undefined, SEGREDO), null);
    assert.equal(verificarTokenDescadastro({ token: t }, SEGREDO), null);
  });

  test('tamanhos diferentes não lançam (timingSafeEqual protegido)', () => {
    const [email] = gerarTokenDescadastro('maria@exemplo.com.br', SEGREDO).split('.');
    assert.equal(verificarTokenDescadastro(`${email}.abc`, SEGREDO), null);
    assert.equal(verificarTokenDescadastro(`${email}.${'A'.repeat(200)}`, SEGREDO), null);
  });

  test('mascararEmail', () => {
    assert.equal(mascararEmail('maria@exemplo.com.br'), 'ma***@exemplo.com.br');
    assert.equal(mascararEmail('ab@x.com'), 'a***@x.com');
  });
});

describe('e-mail interno', () => {
  test('assunto e corpo em texto puro', () => {
    const i = {
      nome: 'Maria da Silva', email: 'maria@exemplo.com.br', origem: 'home-newsletter',
      consentimentos: [{ em: new Date('2026-10-17T12:00:00Z'), politicaVersao: '2026-10-17', texto: 'v1' }]
    };
    assert.equal(assuntoEmailInscricao(i), 'Nova inscrição na newsletter — Maria da Silva');
    const txt = corpoEmailInscricao(i);
    assert.match(txt, /Empresa: —/);
    assert.match(txt, /Recebido em: 2026-10-17T12:00:00.000Z/);
    assert.match(txt, /versão 2026-10-17 \(texto v1\)/);
  });

  test('criarNotificadorEmail aceita assunto/corpo próprios; reply_to por padrão, removível com replyTo: null', async () => {
    const chamadas = [];
    const fetchImpl = async (url, opts) => { chamadas.push({ url, opts }); return { ok: true, status: 200 }; };
    const base = { resendApiKey: 'k', para: 'equipe@x.com', fetchImpl, assunto: assuntoEmailInscricao, corpo: corpoEmailInscricao };
    const i = { nome: 'Ana', email: 'ana@x.com', origem: 'qa', consentimentos: [] };
    await criarNotificadorEmail(base)(i);
    const corpo = JSON.parse(chamadas[0].opts.body);
    assert.equal(corpo.subject, 'Nova inscrição na newsletter — Ana');
    assert.equal(corpo.reply_to, 'ana@x.com');
    assert.match(corpo.text, /E-mail: ana@x.com/);
    // Newsletter em produção: sem reply_to (endereço pode ter sido digitado por terceiro).
    await criarNotificadorEmail({ ...base, replyTo: null })(i);
    assert.equal('reply_to' in JSON.parse(chamadas[1].opts.body), false);
  });
});

// ---------- repositório (coleção falsa) ----------
describe('criarRepositorioNewsletter', () => {
  const em = new Date('2026-10-17T12:00:00Z');
  const inscricao = { email: 'a@x.com', nome: 'Ana', origem: 'qa', criadoEm: em, atualizadoEm: em, consentimentos: [{ em }] };

  function fake({ antes = null, falhas = 0 } = {}) {
    const chamadas = [];
    let restantes = falhas;
    return {
      chamadas,
      colecao: () => ({
        async findOneAndUpdate(filtro, op, opts) {
          chamadas.push({ tipo: 'findOneAndUpdate', filtro, op, opts });
          if (restantes > 0) { restantes--; throw Object.assign(new Error('E11000 dup key: { email: "a@x.com" }'), { code: 11000 }); }
          return antes;
        },
        async updateOne(filtro, op, opts) {
          chamadas.push({ tipo: 'updateOne', filtro, op, opts });
          return { matchedCount: 1 };
        }
      })
    };
  }

  test('upsert: $setOnInsert/$set/$push com $slice/$unset; devolve nova/reativada', async () => {
    const f = fake();
    const repo = criarRepositorioNewsletter(f.colecao);
    assert.deepEqual(await repo.salvar(inscricao), { nova: true, reativada: false });
    const c = f.chamadas[0];
    assert.deepEqual(c.filtro, { email: 'a@x.com' });
    assert.equal(c.opts.upsert, true);
    assert.equal(c.opts.returnDocument, 'before');
    assert.deepEqual(c.op.$setOnInsert, { email: 'a@x.com', criadoEm: em });
    assert.equal(c.op.$set.status, 'ativa');
    assert.equal('empresa' in c.op.$set, false);
    // Só o descadastro vigente some; o histórico `descadastros` fica.
    assert.deepEqual(c.op.$unset, { descadastro: '', empresa: '' });
    assert.deepEqual(c.op.$push, { consentimentos: { $each: [{ em }], $slice: -HISTORICO_MAX } });

    assert.deepEqual(await criarRepositorioNewsletter(fake({ antes: { status: 'ativa' } }).colecao).salvar(inscricao), { nova: false, reativada: false });
    assert.deepEqual(await criarRepositorioNewsletter(fake({ antes: { status: 'descadastrada' } }).colecao).salvar(inscricao), { nova: false, reativada: true });
    // Formato com metadados ({ ok, value }) também é aceito.
    assert.deepEqual(await criarRepositorioNewsletter(() => ({ async findOneAndUpdate() { return { ok: 1, value: null }; } })).salvar(inscricao), { nova: true, reativada: false });
  });

  test('descadastrar: $set do vigente + $push no histórico', async () => {
    const f = fake();
    await criarRepositorioNewsletter(f.colecao).descadastrar('a@x.com', { via: 'token', em });
    const d = f.chamadas.at(-1);
    assert.equal(d.tipo, 'updateOne');
    assert.deepEqual(d.filtro, { email: 'a@x.com', status: 'ativa' });
    assert.deepEqual(d.op.$set.descadastro, { em, via: 'token' });
    assert.equal(d.op.$set.status, 'descadastrada');
    assert.deepEqual(d.op.$push, { descadastros: { $each: [{ em, via: 'token' }], $slice: -HISTORICO_MAX } });
  });

  test('E11000 na corrida: repete uma vez (ainda com upsert); segunda falha propaga', async () => {
    const f = fake({ antes: { status: 'ativa' }, falhas: 1 });
    assert.deepEqual(await criarRepositorioNewsletter(f.colecao).salvar(inscricao), { nova: false, reativada: false });
    assert.equal(f.chamadas.length, 2);
    assert.equal(f.chamadas[1].opts.upsert, true, 'retry mantém upsert: se o concorrente sumiu, ainda grava');
    const g = fake({ falhas: 2 });
    await assert.rejects(criarRepositorioNewsletter(g.colecao).salvar(inscricao), (e) => e.code === 11000);
  });

  test('outros erros do banco propagam', async () => {
    const repo = criarRepositorioNewsletter(() => ({ async findOneAndUpdate() { throw new Error('rede'); } }));
    await assert.rejects(repo.salvar(inscricao), /rede/);
  });
});

// ---------- HTTP ----------
describe('/api/newsletter (HTTP, sem banco)', () => {
  let server;
  let base;
  const lista = new Map();        // e-mail → documento (simula o upsert)
  const chamadasSalvar = [];
  const chamadasDescadastrar = [];
  const notificados = [];
  let falharGravacao = false;
  let falharDescadastro = false;
  let falharEmail = false;
  let erroGravacao = () => new Error('sem banco');
  const logs = [];
  const logColeta = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) };
  const AGORA = new Date('2026-10-17T12:00:00Z');
  const ORIGENS = ['https://complexodmc.com.br', 'https://www.complexodmc.com.br', 'http://localhost'];

  before(async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use('/api/newsletter', corpoContato({ mensagem413: 'Conteúdo grande demais. Reduza o texto dos campos e tente de novo.' }));
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/newsletter', criarRotaNewsletter({
      salvar: async (i) => {
        if (falharGravacao) throw erroGravacao();
        chamadasSalvar.push(i);
        const atual = lista.get(i.email);
        lista.set(i.email, atual
          ? { ...atual, ...i, consentimentos: [...atual.consentimentos, ...i.consentimentos] }
          : { ...i });
        return { nova: !atual, reativada: Boolean(atual && atual.status === 'descadastrada') };
      },
      descadastrar: async (email, meta) => {
        if (falharDescadastro) throw new Error('sem banco');
        chamadasDescadastrar.push({ email, ...meta });
        const atual = lista.get(email);
        if (atual && atual.status === 'ativa') lista.set(email, { ...atual, status: 'descadastrada' });
      },
      notificar: async (i) => {
        if (falharEmail) throw new Error('smtp fora');
        notificados.push(i);
      },
      segredo: SEGREDO,
      politicaVersao: '2026-10-17',
      gravarIp: true,
      origensPermitidas: ORIGENS,
      throttle: criarThrottle({ janelaMs: 60_000, max: 1000 }),
      throttleDescadastro: criarThrottle({ janelaMs: 60_000, max: 1000 }),
      limiteEmailAlvo: { janelaMs: 60_000, max: 3 },
      agora: () => AGORA,
      log: logColeta
    }));
    // Limite baixo só para provar o 429, em outra rota (padrões: gravarIp=false, sem allowlist).
    const limitada = [];
    app.use('/api/newsletter-limite', corpoContato(), criarRotaNewsletter({
      salvar: async (i) => { limitada.push(i); },
      descadastrar: async () => {},
      segredo: SEGREDO,
      throttle: criarThrottle({ janelaMs: 60_000, max: 2, mensagem: MENSAGENS.throttleInscricao }),
      log: silencioso
    }));
    chamadasSalvar.limitada = limitada;
    // Produção sem NEWSLETTER_POLITICA_VERSAO: recusa com 503.
    app.use('/api/newsletter-sem-politica', corpoContato(), criarRotaNewsletter({
      salvar: async () => { throw new Error('não deveria gravar'); },
      descadastrar: async () => {},
      segredo: SEGREDO,
      exigirPoliticaVersao: true,
      log: silencioso
    }));
    await new Promise((ok) => { server = app.listen(0, '127.0.0.1', ok); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((ok) => server.close(ok)));

  const post = (caminho, corpo, headers = { 'Content-Type': 'application/json' }) =>
    fetch(base + caminho, { method: 'POST', headers, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });

  test('válido → 201 { ok: true } sem id; salvar recebe inscrição completa', async () => {
    const r = await post('/api/newsletter', VALIDO, { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.77' });
    assert.equal(r.status, 201);
    assert.deepEqual(await r.json(), { ok: true });
    const i = chamadasSalvar.at(-1);
    assert.equal(i.email, 'maria@exemplo.com.br');
    assert.equal(i.nome, 'Maria da Silva');
    assert.equal(i.status, 'ativa');
    assert.equal(i.criadoEm, AGORA);
    assert.equal(i.consentimentos.length, 1);
    const c = i.consentimentos[0];
    assert.equal(c.em, AGORA);
    assert.equal(c.ipTruncado, '203.0.113.0/24');
    assert.equal(c.origem, 'home-newsletter');
    assert.equal(c.politicaVersao, '2026-10-17');
    assert.equal(c.texto, TEXTO_CONSENTIMENTO);
    assert.equal(c.baseLegal, 'consentimento');
    assert.equal(notificados.at(-1), i, 'inscrição nova → equipe avisada');
  });

  test('gravarIp=false (padrão) → ipTruncado null mesmo com IP conhecido', async () => {
    const r = await post('/api/newsletter-limite', { ...VALIDO, email: 'ip@exemplo.com.br' }, { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.77' });
    assert.equal(r.status, 201);
    assert.equal(chamadasSalvar.limitada.at(-1).consentimentos[0].ipTruncado, null);
  });

  test('exigirPoliticaVersao sem versão → 503, salvar não chamado', async () => {
    const r = await post('/api/newsletter-sem-politica', VALIDO);
    assert.equal(r.status, 503);
    assert.equal((await r.json()).ok, undefined);
  });

  test('mesmo e-mail duas vezes → 201 e 201 com corpos idênticos (dedupe silencioso); reenvio não avisa a equipe', async () => {
    const n = notificados.length;
    const r1 = await post('/api/newsletter', VALIDO);
    const r2 = await post('/api/newsletter', { ...VALIDO, nome: 'Maria Silva' });
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.equal(await r1.text(), await r2.text());
    assert.equal(lista.size, 1);
    assert.equal(lista.get('maria@exemplo.com.br').nome, 'Maria Silva');
    assert.equal(notificados.length, n, 'reinscrição do mesmo e-mail não gera aviso');
  });

  test('ZWSP no e-mail não cria segunda chave', async () => {
    const r = await post('/api/newsletter', { ...VALIDO, email: 'maria\u200b@exemplo.com.br' });
    assert.equal(r.status, 201);
    assert.equal(lista.size, 1);
  });

  test('urlencoded com consentimento=on → 201', async () => {
    const corpo = new URLSearchParams({ nome: 'João Souza', email: 'joao@ex.com.br', consentimento: 'on', origem: 'home-newsletter' }).toString();
    const r = await post('/api/newsletter', corpo, { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.equal(r.status, 201);
    assert.equal(chamadasSalvar.at(-1).email, 'joao@ex.com.br');
  });

  test('inválido → 400 com campos; salvar não chamado', async () => {
    const antes = chamadasSalvar.length;
    const r = await post('/api/newsletter', { ...VALIDO, email: 'x', consentimento: false });
    assert.equal(r.status, 400);
    const j = await r.json();
    assert.equal(j.error, 'Revise os campos indicados.');
    assert.ok(j.campos.email);
    assert.ok(j.campos.consentimento);
    assert.equal(chamadasSalvar.length, antes);
  });

  test('JSON malformado → 400; corpo > 16 KB → 413', async () => {
    const r = await post('/api/newsletter', '{"nome": ');
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /Não foi possível ler/);
    const g = await post('/api/newsletter', { ...VALIDO, empresa: 'a'.repeat(20_000) });
    assert.equal(g.status, 413);
    assert.equal((await g.json()).error, 'Conteúdo grande demais. Reduza o texto dos campos e tente de novo.');
  });

  test('honeypot → 200 { ok: true }, nada gravado nem notificado', async () => {
    const s = chamadasSalvar.length;
    const n = notificados.length;
    const r = await post('/api/newsletter', { ...VALIDO, website: 'http://spam.example' });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal(chamadasSalvar.length, s);
    assert.equal(notificados.length, n);
  });

  test('salvar lança → 503 sem ok; log não contém o e-mail (E11000 com dup key)', async () => {
    falharGravacao = true;
    erroGravacao = () => Object.assign(new Error('E11000 duplicate key error dup key: { email: "maria@exemplo.com.br" }'), { code: 11000, name: 'MongoServerError' });
    logs.length = 0;
    try {
      const r = await post('/api/newsletter', VALIDO);
      assert.equal(r.status, 503);
      const j = await r.json();
      assert.equal(j.ok, undefined);
      assert.match(j.error, /Não foi possível registrar sua inscrição/);
      const falha = logs.find(l => /falha ao gravar/.test(l));
      assert.ok(falha);
      assert.doesNotMatch(falha, /maria@exemplo/);
      assert.match(falha, /code=11000/);
    } finally {
      falharGravacao = false;
      erroGravacao = () => new Error('sem banco');
    }
  });

  test('notificar lança → 201 (inscrição já gravada)', async () => {
    falharEmail = true;
    try {
      const antes = chamadasSalvar.length;
      const r = await post('/api/newsletter', { ...VALIDO, email: 'nova@exemplo.com.br' });
      assert.equal(r.status, 201);
      assert.equal(chamadasSalvar.length, antes + 1);
    } finally {
      falharEmail = false;
    }
  });

  test('reativação após descadastro avisa a equipe', async () => {
    lista.set('volta@exemplo.com.br', { email: 'volta@exemplo.com.br', status: 'descadastrada', consentimentos: [] });
    const n = notificados.length;
    const r = await post('/api/newsletter', { ...VALIDO, email: 'volta@exemplo.com.br' });
    assert.equal(r.status, 201);
    assert.equal(notificados.length, n + 1);
  });

  test('excesso → 429 com Retry-After', async () => {
    assert.equal((await post('/api/newsletter-limite', VALIDO)).status, 201);
    assert.equal((await post('/api/newsletter-limite', { website: 'bot' })).status, 200);
    const r = await post('/api/newsletter-limite', VALIDO);
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    assert.match((await r.json()).error, /Muitas inscrições/);
  });

  // ----- descadastro -----
  test('GET /descadastro?token=válido → 200 HTML com form, e-mail mascarado, nada alterado', async () => {
    const antes = chamadasDescadastrar.length;
    const token = gerarTokenDescadastro('maria@exemplo.com.br', SEGREDO);
    const r = await fetch(`${base}/api/newsletter/descadastro?token=${encodeURIComponent(token)}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    const html = await r.text();
    assert.match(html, /<form method="post"/);
    assert.match(html, /name="token"/);
    assert.match(html, /ma\*\*\*@exemplo\.com\.br/);
    assert.doesNotMatch(html, /maria@exemplo/);
    assert.doesNotMatch(html, /<script/i);
    assert.equal(chamadasDescadastrar.length, antes);
    assert.equal(lista.get('maria@exemplo.com.br').status, 'ativa');
    for (const [k, v] of Object.entries(HEADERS_HTML)) assert.equal(r.headers.get(k), v, k);
  });

  test('GET /descadastro com token lixo ou sem token → 400, não revela nada, mesmos headers', async () => {
    for (const q of ['?token=lixo', '?token=', '', '?token[]=a']) {
      const r = await fetch(`${base}/api/newsletter/descadastro${q}`);
      assert.equal(r.status, 400, q);
      const html = await r.text();
      assert.match(html, /não é válido/);
      assert.match(html, /administrativo@complexodmc\.com\.br/);
      assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
      assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    }
  });

  test('POST /descadastro {token} válido → 200; via token; repetir → 200 igual', async () => {
    const token = gerarTokenDescadastro('maria@exemplo.com.br', SEGREDO);
    const r1 = await post('/api/newsletter/descadastro', { token }, { 'Content-Type': 'application/json', Accept: 'application/json' });
    assert.equal(r1.status, 200);
    assert.deepEqual(await r1.json(), { ok: true });
    assert.deepEqual(chamadasDescadastrar.at(-1), { email: 'maria@exemplo.com.br', via: 'token', em: AGORA });
    assert.equal(lista.get('maria@exemplo.com.br').status, 'descadastrada');

    const r2 = await post('/api/newsletter/descadastro', { token }, { 'Content-Type': 'application/json', Accept: 'application/json' });
    assert.equal(r2.status, 200);
    assert.deepEqual(await r2.json(), { ok: true });

    // Token de quem nunca existiu: mesma resposta.
    const r3 = await post('/api/newsletter/descadastro', { token: gerarTokenDescadastro('ninguem@x.com', SEGREDO) },
      { 'Content-Type': 'application/json', Accept: 'application/json' });
    assert.equal(r3.status, 200);
    assert.deepEqual(await r3.json(), { ok: true });
  });

  test('POST /descadastro: form com Accept text/html → HTML; fetch JSON sem Accept (*/*) → JSON; urlencoded com */* → JSON', async () => {
    const token = gerarTokenDescadastro('maria@exemplo.com.br', SEGREDO);
    const form = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' };
    const r = await post('/api/newsletter/descadastro', new URLSearchParams({ token }).toString(), form);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(await r.text(), /não receberá mais/);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    // fetch() padrão: Content-Type JSON, Accept */* → JSON (JSON.parse não quebra no front).
    const f = await post('/api/newsletter/descadastro', { token });
    assert.equal(f.status, 200);
    assert.match(f.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await f.json(), { ok: true });
    // curl -d (urlencoded, Accept */*) → JSON.
    const c = await post('/api/newsletter/descadastro', new URLSearchParams({ token }).toString(), { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.match(c.headers.get('content-type'), /application\/json/);
    // JSON enviado com Accept text/html → JSON mesmo assim (quem fala JSON recebe JSON).
    const j = await post('/api/newsletter/descadastro', { token }, { 'Content-Type': 'application/json', Accept: 'text/html' });
    assert.match(j.headers.get('content-type'), /application\/json/);
  });

  test('POST /descadastro {token} inválido → 400 (JSON ou HTML)', async () => {
    const j = await post('/api/newsletter/descadastro', { token: 'lixo' }, { 'Content-Type': 'application/json', Accept: 'application/json' });
    assert.equal(j.status, 400);
    assert.match((await j.json()).error, /Link inválido/);
    const h = await post('/api/newsletter/descadastro', new URLSearchParams({ token: 'lixo' }).toString(),
      { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' });
    assert.equal(h.status, 400);
    assert.match(h.headers.get('content-type'), /text\/html/);
    assert.equal(h.headers.get('cache-control'), 'no-store');
  });

  test('POST /descadastro {email} existente e inexistente → 202 com corpo idêntico; via email', async () => {
    // Reativa antes para provar a mudança de estado.
    await post('/api/newsletter', VALIDO);
    assert.equal(lista.get('maria@exemplo.com.br').status, 'ativa');
    assert.equal(lista.get('maria@exemplo.com.br').consentimentos.length >= 2, true);

    const r1 = await post('/api/newsletter/descadastro', { email: 'Maria@Exemplo.com.br' });
    const r2 = await post('/api/newsletter/descadastro', { email: 'ninguem@exemplo.com.br' });
    assert.equal(r1.status, 202);
    assert.equal(r2.status, 202);
    const t1 = await r1.text();
    assert.equal(t1, await r2.text());
    assert.deepEqual(JSON.parse(t1), { ok: true, mensagem: 'Se este e-mail estiver na lista, ele será removido.' });
    assert.equal(chamadasDescadastrar.at(-2).email, 'maria@exemplo.com.br');
    assert.equal(chamadasDescadastrar.at(-2).via, 'email');
    assert.equal(lista.get('maria@exemplo.com.br').status, 'descadastrada');
  });

  test('POST /descadastro {email: "x"} → 400 campos.email; {} → 400', async () => {
    const r = await post('/api/newsletter/descadastro', { email: 'x' });
    assert.equal(r.status, 400);
    assert.match((await r.json()).campos.email, /E-mail inválido/);
    const v = await post('/api/newsletter/descadastro', {});
    assert.equal(v.status, 400);
    assert.equal((await v.json()).campos.email, 'Informe seu e-mail.');
    const t = await post('/api/newsletter/descadastro', { token: ['a'] }, { 'Content-Type': 'application/json', Accept: 'application/json' });
    assert.equal(t.status, 400);
  });

  test('POST /descadastro {email} por form sem JS (Accept text/html) → 202 HTML; e-mail inválido → 400 HTML', async () => {
    const form = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' };
    const r = await post('/api/newsletter/descadastro', 'email=form%40exemplo.com.br', form);
    assert.equal(r.status, 202);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(await r.text(), /Se este e-mail estiver na lista/);
    const e = await post('/api/newsletter/descadastro', 'email=x', form);
    assert.equal(e.status, 400);
    assert.match(e.headers.get('content-type'), /text\/html/);
    assert.match(await e.text(), /Revise o e-mail/);
  });

  test('POST /descadastro {email} com Origin de terceiro → 403 sem chamar descadastrar; própria origem e sem Origin passam', async () => {
    const antes = chamadasDescadastrar.length;
    const form = { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example' };
    const r = await post('/api/newsletter/descadastro', 'email=vitima%40exemplo.com.br', form);
    assert.equal(r.status, 403);
    assert.match((await r.json()).error, /origem não autorizada/);
    const ref = await post('/api/newsletter/descadastro', { email: 'vitima@exemplo.com.br' }, { 'Content-Type': 'application/json', Referer: 'https://evil.example/p' });
    assert.equal(ref.status, 403);
    assert.equal(chamadasDescadastrar.length, antes);
    const ok = await post('/api/newsletter/descadastro', { email: 'vitima@exemplo.com.br' }, { 'Content-Type': 'application/json', Origin: 'https://www.complexodmc.com.br' });
    assert.equal(ok.status, 202);
    assert.equal(chamadasDescadastrar.length, antes + 1);
    // Token válido com Origin de terceiro continua aceito (o token é a prova).
    const t = await post('/api/newsletter/descadastro', { token: gerarTokenDescadastro('vitima@exemplo.com.br', SEGREDO) }, { 'Content-Type': 'application/json', Origin: 'https://evil.example' });
    assert.equal(t.status, 200);
  });

  test('POST /descadastro {email}: mesmo endereço-alvo de IPs distintos → 429 após o limite por e-mail', async () => {
    const antes = chamadasDescadastrar.length;
    const cabecalhos = (ip) => ({ 'Content-Type': 'application/json', 'X-Forwarded-For': ip });
    for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      assert.equal((await post('/api/newsletter/descadastro', { email: 'alvo@exemplo.com.br' }, cabecalhos(ip))).status, 202);
    }
    const r = await post('/api/newsletter/descadastro', { email: 'Alvo\u200b@exemplo.com.br' }, cabecalhos('198.51.100.4'));
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    assert.match((await r.json()).error, /pedidos recentes para este e-mail/);
    assert.equal(chamadasDescadastrar.length, antes + 3);
    // Outro endereço segue livre.
    assert.equal((await post('/api/newsletter/descadastro', { email: 'outro@exemplo.com.br' }, cabecalhos('198.51.100.4'))).status, 202);
  });

  test('POST /descadastro honeypot → 200 neutro', async () => {
    const antes = chamadasDescadastrar.length;
    const r = await post('/api/newsletter/descadastro', { email: 'maria@exemplo.com.br', website: 'bot' });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal(chamadasDescadastrar.length, antes);
  });

  test('descadastrar lança → 503 (token e e-mail)', async () => {
    falharDescadastro = true;
    try {
      const token = gerarTokenDescadastro('maria@exemplo.com.br', SEGREDO);
      const a = await post('/api/newsletter/descadastro', { token }, { 'Content-Type': 'application/json', Accept: 'application/json' });
      assert.equal(a.status, 503);
      assert.equal((await a.json()).ok, undefined);
      logs.length = 0;
      const b = await post('/api/newsletter/descadastro', { email: 'maria@exemplo.com.br' });
      assert.equal(b.status, 503);
      assert.equal((await b.json()).ok, undefined);
      assert.ok(logs.some(l => /falha ao descadastrar \(e-mail\)/.test(l)));
      assert.ok(logs.every(l => !/maria@exemplo/.test(l)), 'log sem e-mail');
    } finally {
      falharDescadastro = false;
    }
  });

  test('criarRotaNewsletter exige salvar, descadastrar e segredo', () => {
    assert.throws(() => criarRotaNewsletter({ descadastrar() {}, segredo: 's' }), /salvar/);
    assert.throws(() => criarRotaNewsletter({ salvar() {}, segredo: 's' }), /descadastrar/);
    assert.throws(() => criarRotaNewsletter({ salvar() {}, descadastrar() {} }), /segredo/);
  });
});
