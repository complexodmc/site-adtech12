// Testes do POST /api/contato sem MongoDB: salvar/notificar são injetados.
// Rode com `npm test` na raiz (node --test).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  validarContato, ehRobo, corpoContato, criarRotaContato, criarNotificadorEmail, corpoEmail
} from '../src/routes/contato.js';
import { criarThrottle } from '../src/throttle.js';

const VALIDO = Object.freeze({
  nome: '  Maria  da Silva ',
  email: 'Maria@Exemplo.com.br',
  telefone: '(11) 99999-0000',
  empresa: 'Silva Agro',
  perfil: 'produtor-rural',
  eixo: 'E1',
  mensagem: 'Quero entender as opções de planejamento sucessório.',
  consentimento: true,
  origem: 'home'
});

const silencioso = { log() {}, warn() {}, error() {} };

// ---------- validação pura ----------
describe('validarContato', () => {
  test('aceita envio completo e normaliza', () => {
    const r = validarContato(VALIDO);
    assert.equal(r.ok, true);
    assert.deepEqual(r.erros, {});
    assert.equal(r.dados.nome, 'Maria da Silva');
    assert.equal(r.dados.email, 'maria@exemplo.com.br');
    assert.equal(r.dados.perfil, 'produtor-rural');
    assert.equal(r.dados.eixo, 'E1');
    assert.equal(r.dados.origem, 'home');
    assert.equal('consentimento' in r.dados, false);
  });

  test('corpo vazio: aponta todos os obrigatórios, em português', () => {
    const r = validarContato({});
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.erros).sort(),
      ['consentimento', 'eixo', 'email', 'mensagem', 'nome', 'perfil']);
    assert.equal(r.erros.nome, 'Informe seu nome.');
    assert.equal(r.erros.email, 'Informe seu e-mail.');
    assert.equal(r.dados.origem, 'nao-informada');
  });

  test('corpo não-objeto é tratado como vazio', () => {
    for (const corpo of [null, undefined, 'x', 42, [VALIDO]]) {
      assert.equal(validarContato(corpo).ok, false);
    }
  });

  test('rejeita e-mail, perfil, eixo, telefone e tamanhos inválidos', () => {
    const r = validarContato({
      ...VALIDO,
      email: 'maria@',
      perfil: 'astronauta',
      eixo: 'E9',
      telefone: '1234',
      mensagem: 'curta'
    });
    assert.equal(r.ok, false);
    assert.match(r.erros.email, /E-mail inválido/);
    assert.match(r.erros.perfil, /Perfil inválido/);
    assert.match(r.erros.eixo, /Assunto inválido/);
    assert.match(r.erros.telefone, /Telefone inválido/);
    assert.match(r.erros.mensagem, /muito curta/);

    const longo = validarContato({ ...VALIDO, mensagem: 'a'.repeat(4001), nome: 'n'.repeat(121) });
    assert.match(longo.erros.mensagem, /muito longa/);
    assert.match(longo.erros.nome, /muito longo/);
  });

  test('tipos estruturados (objeto/array) são recusados', () => {
    const r = validarContato({ ...VALIDO, email: { $gt: '' }, nome: ['a', 'b'] });
    assert.equal(r.erros.email, 'Formato inválido.');
    assert.equal(r.erros.nome, 'Formato inválido.');
  });

  test('consentimento precisa ser afirmativo', () => {
    for (const v of [false, 'false', '', undefined, 0, 'nao']) {
      assert.ok(validarContato({ ...VALIDO, consentimento: v }).erros.consentimento, `aceitou ${v}`);
    }
    for (const v of [true, 'true', 'on', '1', 'sim']) {
      assert.equal(validarContato({ ...VALIDO, consentimento: v }).ok, true, `recusou ${v}`);
    }
  });

  test('normaliza rótulos de perfil/eixo e opcionais vazios', () => {
    const r = validarContato({ ...VALIDO, perfil: 'Empresário', eixo: 'Não sei', telefone: '', empresa: ' ' });
    assert.equal(r.ok, true);
    assert.equal(r.dados.perfil, 'empresario');
    assert.equal(r.dados.eixo, 'nao-sei');
    assert.equal('telefone' in r.dados, false);
    assert.equal('empresa' in r.dados, false);
  });

  test('interesse em treinamento dispensa eixo e mensagem', () => {
    const r = validarContato({
      nome: 'João Souza', email: 'joao@ex.com', perfil: 'investidor',
      curso: 'Regularização Imobiliária', consentimento: 'on', origem: 'treinamento-interesse'
    });
    assert.equal(r.ok, true, JSON.stringify(r.erros));
    assert.equal(r.dados.curso, 'Regularização Imobiliária');
    assert.equal('eixo' in r.dados, false);
  });

  test('remove caracteres de controle e corta a origem', () => {
    const r = validarContato({ ...VALIDO, nome: 'Ana\u0000\u0007 Lima', origem: 'x'.repeat(500) });
    assert.equal(r.dados.nome, 'Ana Lima');
    assert.equal(r.dados.origem.length, 120);
  });
});

describe('ehRobo (honeypot)', () => {
  test('só dispara com o campo website preenchido', () => {
    assert.equal(ehRobo({}), false);
    assert.equal(ehRobo({ website: '' }), false);
    assert.equal(ehRobo({ website: '   ' }), false);
    assert.equal(ehRobo({ website: 'http://spam.example' }), true);
    assert.equal(ehRobo({ website: ['x'] }), true);
  });
});

describe('criarThrottle', () => {
  test('janela deslizante por IP com relógio injetado', () => {
    let t = 0;
    const th = criarThrottle({ janelaMs: 1000, max: 2, agora: () => t });
    const chamar = (ip) => {
      let status = 200;
      let passou = false;
      const res = { set() { return res; }, status(s) { status = s; return res; }, json() { return res; } };
      th({ ip }, res, () => { passou = true; });
      return passou ? 'next' : status;
    };
    assert.equal(chamar('1.1.1.1'), 'next');
    assert.equal(chamar('1.1.1.1'), 'next');
    assert.equal(chamar('1.1.1.1'), 429);
    assert.equal(chamar('2.2.2.2'), 'next', 'outro IP não é afetado');
    t = 1001;
    assert.equal(chamar('1.1.1.1'), 'next', 'janela expirou');
  });
});

describe('corpoEmail', () => {
  test('monta texto legível com rótulos', () => {
    const { dados } = validarContato(VALIDO);
    const txt = corpoEmail({ ...dados, createdAt: new Date('2026-10-17T12:00:00Z') });
    assert.match(txt, /Perfil: Produtor rural/);
    assert.match(txt, /Assunto: Planejamento Patrimonial e Sucessório/);
    assert.match(txt, /Recebido em: 2026-10-17T12:00:00.000Z/);
  });
});

// ---------- HTTP ----------
describe('POST /api/contato (HTTP, sem banco)', () => {
  let server;
  let base;
  const gravados = [];
  const notificados = [];
  let falharGravacao = false;
  let falharEmail = false;
  const throttle = criarThrottle({ janelaMs: 60_000, max: 1000 });

  before(async () => {
    const app = express();
    app.use('/api/contato', corpoContato());
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/contato', criarRotaContato({
      salvar: async (lead) => {
        if (falharGravacao) throw new Error('sem banco');
        gravados.push(lead);
        return { insertedId: `id-${gravados.length}` };
      },
      notificar: async (lead) => {
        if (falharEmail) throw new Error('smtp fora');
        notificados.push(lead);
      },
      throttle,
      agora: () => new Date('2026-10-17T12:00:00Z'),
      log: silencioso
    }));
    // Limite baixo só para provar o 429, em outra rota.
    app.use('/api/contato-limite', corpoContato(), criarRotaContato({
      salvar: async () => ({ insertedId: 'x' }),
      throttle: criarThrottle({ janelaMs: 60_000, max: 2 }),
      log: silencioso
    }));
    await new Promise((ok) => { server = app.listen(0, '127.0.0.1', ok); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((ok) => server.close(ok)));

  const post = (caminho, corpo, headers = { 'Content-Type': 'application/json' }) =>
    fetch(base + caminho, { method: 'POST', headers, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });

  test('válido → 201, grava e notifica', async () => {
    const antes = gravados.length;
    const r = await post('/api/contato', VALIDO);
    assert.equal(r.status, 201);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.id, `id-${antes + 1}`);
    const lead = gravados.at(-1);
    assert.equal(lead.email, 'maria@exemplo.com.br');
    assert.equal(lead.status, 'novo');
    assert.equal(lead.consentimento.aceito, true);
    assert.ok(lead.createdAt instanceof Date);
    assert.equal(notificados.at(-1), lead);
  });

  test('formulário urlencoded (sem JS) também é aceito', async () => {
    const corpo = new URLSearchParams({ ...VALIDO, consentimento: 'on' }).toString();
    const r = await post('/api/contato', corpo, { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.equal(r.status, 201);
  });

  test('inválido → 400 com campos', async () => {
    const antes = gravados.length;
    const r = await post('/api/contato', { ...VALIDO, email: 'x', consentimento: false });
    assert.equal(r.status, 400);
    const j = await r.json();
    assert.equal(j.error, 'Revise os campos indicados.');
    assert.ok(j.campos.email);
    assert.ok(j.campos.consentimento);
    assert.equal(gravados.length, antes);
  });

  test('JSON malformado → 400', async () => {
    const r = await post('/api/contato', '{"nome": ');
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /Não foi possível ler/);
  });

  test('honeypot → 200 silencioso, sem gravar nem notificar', async () => {
    const g = gravados.length;
    const n = notificados.length;
    const r = await post('/api/contato', { ...VALIDO, website: 'http://spam.example' });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal(gravados.length, g);
    assert.equal(notificados.length, n);
  });

  test('corpo acima de 16 KB → 413', async () => {
    const r = await post('/api/contato', { ...VALIDO, mensagem: 'a'.repeat(20_000) });
    assert.equal(r.status, 413);
  });

  test('falha no banco → 503, nunca sucesso falso', async () => {
    falharGravacao = true;
    try {
      const r = await post('/api/contato', VALIDO);
      assert.equal(r.status, 503);
      assert.equal((await r.json()).ok, undefined);
    } finally {
      falharGravacao = false;
    }
  });

  test('falha só no e-mail → 201 (lead já gravado)', async () => {
    falharEmail = true;
    try {
      const antes = gravados.length;
      const r = await post('/api/contato', VALIDO);
      assert.equal(r.status, 201);
      assert.equal(gravados.length, antes + 1);
    } finally {
      falharEmail = false;
    }
  });

  test('excesso → 429 com Retry-After', async () => {
    assert.equal((await post('/api/contato-limite', VALIDO)).status, 201);
    assert.equal((await post('/api/contato-limite', { website: 'bot' })).status, 200);
    const r = await post('/api/contato-limite', VALIDO);
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    assert.match((await r.json()).error, /Aguarde/);
  });
});

describe('criarNotificadorEmail', () => {
  test('sem chave ou destinatário → null (fallback: só grava)', () => {
    assert.equal(criarNotificadorEmail({}), null);
    assert.equal(criarNotificadorEmail({ resendApiKey: 'k' }), null);
    assert.equal(criarNotificadorEmail({ para: 'a@b.com' }), null);
  });

  test('chama a API do Resend com texto e reply_to; erro HTTP vira exceção', async () => {
    const chamadas = [];
    let status = 200;
    const fetchImpl = async (url, opts) => { chamadas.push({ url, opts }); return { ok: status < 300, status }; };
    const notificar = criarNotificadorEmail({ resendApiKey: 'chave-teste', para: 'a@x.com, b@x.com', fetchImpl });
    const { dados } = validarContato(VALIDO);
    const lead = { ...dados, createdAt: new Date() };

    await notificar(lead);
    const { url, opts } = chamadas[0];
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(opts.headers.Authorization, 'Bearer chave-teste');
    const corpo = JSON.parse(opts.body);
    assert.deepEqual(corpo.to, ['a@x.com', 'b@x.com']);
    assert.equal(corpo.reply_to, 'maria@exemplo.com.br');
    assert.match(corpo.subject, /Maria da Silva/);
    assert.equal('html' in corpo, false);

    status = 422;
    await assert.rejects(notificar(lead), /HTTP 422/);
  });
});

// ---------- Verticais de Negócio (/verticais-de-negocio/**) ----------
describe('validarContato — campos de vertical', () => {
  const VERTICAL = Object.freeze({
    nome: 'João Pereira', email: 'joao@exemplo.com', telefone: '(11) 98888-7777',
    segmento: 'agronegocio-patrimonio-rural', faturamento: '20-50mi', patrimonio: '50-200mi',
    motivo: 'sucessao-inventario', consentimento: 'true', origem: 'verticais-de-negocio/agronegocio-patrimonio-rural/'
  });

  test('segmento válido dispensa perfil, eixo e mensagem; deriva perfil e eixo', () => {
    const r = validarContato(VERTICAL);
    assert.equal(r.ok, true, JSON.stringify(r.erros));
    assert.equal(r.dados.segmento, 'agronegocio-patrimonio-rural');
    assert.equal(r.dados.perfil, 'produtor-rural');
    assert.equal(r.dados.eixo, 'E1');
    assert.equal(r.dados.faturamento, '20-50mi');
    assert.equal(r.dados.patrimonio, '50-200mi');
    assert.equal(r.dados.motivo, 'sucessao-inventario');
    assert.equal('mensagem' in r.dados, false);
  });

  test('perfil e eixo enviados prevalecem sobre os derivados', () => {
    const r = validarContato({ ...VERTICAL, perfil: 'investidor', eixo: 'E5' });
    assert.equal(r.ok, true);
    assert.equal(r.dados.perfil, 'investidor');
    assert.equal(r.dados.eixo, 'E5');
  });

  test('segmento, faturamento, patrimônio e motivo fora da lista são rejeitados', () => {
    const r = validarContato({ ...VERTICAL, segmento: 'x', faturamento: 'y', patrimonio: 'z', motivo: 'w' });
    assert.equal(r.ok, false);
    for (const k of ['faturamento', 'motivo', 'patrimonio', 'segmento']) assert.ok(k in r.erros, k);
    // sem segmento válido não há de onde derivar perfil/eixo, e a mensagem volta a ser obrigatória
    for (const k of ['perfil', 'eixo', 'mensagem']) assert.ok(k in r.erros, k);
  });

  test('sem segmento, o contrato antigo continua: mensagem, perfil e eixo obrigatórios', () => {
    const r = validarContato({ nome: 'Ana', email: 'ana@exemplo.com', consentimento: true });
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.erros).sort(), ['eixo', 'mensagem', 'perfil']);
  });

  test('o e-mail à equipe traz segmento, faturamento, patrimônio e motivo por extenso', () => {
    const { dados } = validarContato(VERTICAL);
    const lead = { ...dados, createdAt: new Date('2026-10-18T12:00:00Z') };
    const corpo = corpoEmail(lead);
    assert.match(corpo, /Segmento: Agronegócio e Patrimônio Rural \(agronegocio-patrimonio-rural\)/);
    assert.match(corpo, /Faturamento anual: R\$ 20–50 mi/);
    assert.match(corpo, /Patrimônio envolvido: R\$ 50–200 mi/);
    assert.match(corpo, /Motivo do contato: Sucessão ou inventário/);
  });
});
