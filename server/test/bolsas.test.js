// Testes de /api/bolsas sem MongoDB: o repositório, o notificador e o
// middleware de administrador são injetados. Rode com `npm test` na raiz.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  validarPreInscricao, ehRobo, corpoBolsas, criarRotaBolsas, criarNotificadorBolsas, criarRepositorioBolsas,
  assuntoEmailPreInscricao, corpoEmailPreInscricao, montarPreInscricao, gerarProtocolo, chaveDuplicada,
  PERFIS, AREAS, UFS, PROTOCOLO_RE, POR_PAGINA, THROTTLE_PADRAO, OBRIGATORIOS, MENSAGENS, LIMITES
} from '../src/routes/bolsas.js';
import { criarRotaContato, corpoContato } from '../src/routes/contato.js';
import { criarThrottle } from '../src/throttle.js';

// O middleware real de admin (auth.js) importa config.js, que exige as
// variáveis abaixo. Nenhuma conexão é aberta: só requireAuth/requireAdmin.
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const { requireAuth, requireAdmin } = await import('../src/auth.js');

const silencioso = { log() {}, warn() {}, error() {} };

const BASE = Object.freeze({
  nome: '  Joana   da Silva ',
  email: ' Joana.Silva@Exemplo.com.br ',
  whatsapp: '+55 (11) 98765-4321',
  cidade: 'Campinas',
  uf: 'sp',
  perfil: 'Estudante Graduação',
  area: 'holding-patrimonial',
  motivacao: 'Quero estudar holding patrimonial.\r\n\r\n\r\n\r\nPara ajudar minha família.  ',
  consentimento: 'on',
  pagina: 'https://complexodmc.com.br/plataforma-ead/login.html?email=joana@exemplo.com#bolsas',
  utm_source: 'instagram',
  utm_medium: 'bio<script>alert(1)</script>',
  utm_campaign: 'bolsas-2026',
  utm_content: 'x'.repeat(200)
});

const MINIMO = Object.freeze({
  nome: 'Rui Alves', email: 'rui@exemplo.com', cidade: 'Belém', uf: 'PA',
  perfil: 'profissional', area: 'tecnologia', consentimento: true
});

// ---------- validação ----------
describe('validarPreInscricao', () => {
  test('aceita envio completo e normaliza', () => {
    const r = validarPreInscricao(BASE);
    assert.equal(r.ok, true, JSON.stringify(r.erros));
    assert.deepEqual(r.dados, {
      nome: 'Joana da Silva',
      email: 'joana.silva@exemplo.com.br',
      whatsapp: '5511987654321',
      cidade: 'Campinas',
      uf: 'SP',
      perfil: 'estudante-graduacao',
      area: 'holding-patrimonial',
      motivacao: 'Quero estudar holding patrimonial.\n\nPara ajudar minha família.'
    });
    assert.equal(r.comunicacoes, false, 'comunicações é opt-in separado: padrão false');
    assert.deepEqual(r.fonte, {
      pagina: '/plataforma-ead/login.html',
      utm_source: 'instagram',
      utm_medium: 'bioscriptalert1script',
      utm_campaign: 'bolsas-2026',
      utm_content: 'x'.repeat(LIMITES.utm)
    });
  });

  test('opções do contrato: perfis, áreas e 27 UFs', () => {
    assert.deepEqual(Object.keys(PERFIS), ['estudante-graduacao', 'recem-formado', 'profissional', 'outro']);
    assert.deepEqual(Object.keys(AREAS), [
      'planejamento-sucessorio-patrimonial', 'holding-patrimonial', 'notarial-imobiliario', 'negocios-vendas', 'tecnologia'
    ]);
    assert.equal(UFS.length, 27);
    for (const perfil of Object.keys(PERFIS)) assert.equal(validarPreInscricao({ ...MINIMO, perfil }).dados.perfil, perfil);
    for (const area of Object.keys(AREAS)) assert.equal(validarPreInscricao({ ...MINIMO, area }).dados.area, area);
    for (const uf of UFS) assert.equal(validarPreInscricao({ ...MINIMO, uf: uf.toLowerCase() }).dados.uf, uf);
  });

  test('só obrigatórios: whatsapp, motivação e comunicações são opcionais', () => {
    const r = validarPreInscricao(MINIMO);
    assert.equal(r.ok, true, JSON.stringify(r.erros));
    assert.equal('whatsapp' in r.dados, false);
    assert.equal('motivacao' in r.dados, false);
    assert.equal(r.comunicacoes, false);
    assert.deepEqual(r.fonte, { pagina: 'nao-informada' });
  });

  test('corpo vazio aponta exatamente os obrigatórios', () => {
    for (const vazio of [{}, undefined, null, [], 'texto']) {
      const r = validarPreInscricao(vazio);
      assert.equal(r.ok, false);
      assert.deepEqual(Object.keys(r.erros).sort(), [...OBRIGATORIOS].sort());
    }
    const r = validarPreInscricao({});
    assert.equal(r.erros.nome, 'Informe seu nome.');
    assert.equal(r.erros.email, 'Informe seu e-mail.');
    assert.equal(r.erros.cidade, 'Informe a cidade.');
    assert.equal(r.erros.uf, 'Selecione a UF.');
    assert.equal(r.erros.perfil, 'Selecione seu perfil.');
    assert.equal(r.erros.area, 'Selecione a área de interesse.');
    assert.match(r.erros.consentimento, /LGPD/);
  });

  test('cada obrigatório ausente gera erro só nele', () => {
    for (const campo of OBRIGATORIOS) {
      const corpo = { ...BASE };
      delete corpo[campo];
      const r = validarPreInscricao(corpo);
      assert.equal(r.ok, false, campo);
      assert.deepEqual(Object.keys(r.erros), [campo], campo);
    }
  });

  test('nome: 2–120 com ao menos uma letra', () => {
    assert.equal(validarPreInscricao({ ...MINIMO, nome: 'Lu' }).ok, true);
    assert.equal(validarPreInscricao({ ...MINIMO, nome: 'A' }).erros.nome, 'Informe seu nome completo.');
    assert.equal(validarPreInscricao({ ...MINIMO, nome: '12345' }).erros.nome, 'Informe seu nome completo.');
    assert.equal(validarPreInscricao({ ...MINIMO, nome: 'a'.repeat(120) }).ok, true);
    assert.match(validarPreInscricao({ ...MINIMO, nome: 'a'.repeat(121) }).erros.nome, /muito longo/);
  });

  test('e-mail: formato, teto de 254, gravado em minúsculas', () => {
    for (const ruim of ['joana@', 'joana.exemplo.com', 'joana@exemplo', 'jo ana@exemplo.com', 'a@b.c']) {
      assert.match(validarPreInscricao({ ...MINIMO, email: ruim }).erros.email || '', /E-mail inválido/, `aceitou ${ruim}`);
    }
    assert.match(validarPreInscricao({ ...MINIMO, email: `${'a'.repeat(250)}@x.com` }).erros.email, /E-mail inválido/);
    assert.equal(validarPreInscricao({ ...MINIMO, email: 'RUI@Gmail.COM' }).dados.email, 'rui@gmail.com');
  });

  test('whatsapp opcional: 10–13 dígitos, gravado só com dígitos', () => {
    for (const [entrada, saida] of [['11987654321', '11987654321'], ['(11) 3333-4444', '1133334444'], ['+55 11 98765 4321', '5511987654321']]) {
      assert.equal(validarPreInscricao({ ...MINIMO, whatsapp: entrada }).dados.whatsapp, saida);
    }
    assert.equal('whatsapp' in validarPreInscricao({ ...MINIMO, whatsapp: '   ' }).dados, false);
    for (const ruim of ['1234', '123456789', '12345678901234', `11 98765-4321${' '.repeat(10)}x${'-'.repeat(20)}`]) {
      assert.match(validarPreInscricao({ ...MINIMO, whatsapp: ruim }).erros.whatsapp || '', /WhatsApp inválido/, `aceitou ${ruim}`);
    }
  });

  test('cidade 2–80; UF só as 27', () => {
    assert.equal(validarPreInscricao({ ...MINIMO, cidade: 'X' }).erros.cidade, 'Cidade inválida.');
    assert.equal(validarPreInscricao({ ...MINIMO, cidade: '1234' }).erros.cidade, 'Cidade inválida.');
    assert.match(validarPreInscricao({ ...MINIMO, cidade: 'c'.repeat(81) }).erros.cidade, /muito longo/);
    for (const ruim of ['XX', 'São Paulo', 'S']) {
      assert.match(validarPreInscricao({ ...MINIMO, uf: ruim }).erros.uf || '', /UF inválida/, `aceitou ${ruim}`);
    }
  });

  test('perfil e área: chave ou rótulo digitado; fora da lista é recusado', () => {
    assert.equal(validarPreInscricao({ ...MINIMO, perfil: 'Recém formado' }).dados.perfil, 'recem-formado');
    assert.equal(validarPreInscricao({ ...MINIMO, perfil: 'PROFISSIONAL' }).dados.perfil, 'profissional');
    assert.equal(validarPreInscricao({ ...MINIMO, area: 'Holding Patrimonial' }).dados.area, 'holding-patrimonial');
    assert.equal(validarPreInscricao({ ...MINIMO, area: 'negocios_vendas' }).dados.area, 'negocios-vendas');
    for (const ruim of ['empresario', 'constructor', '__proto__', 'toString']) {
      assert.match(validarPreInscricao({ ...MINIMO, perfil: ruim }).erros.perfil || '', /Perfil inválido/, `aceitou ${ruim}`);
    }
    for (const ruim of ['tributario', 'trabalhista', 'hasOwnProperty']) {
      assert.match(validarPreInscricao({ ...MINIMO, area: ruim }).erros.area || '', /Área inválida/, `aceitou ${ruim}`);
    }
  });

  test('motivação opcional, até 400, multilinha', () => {
    assert.equal(validarPreInscricao({ ...MINIMO, motivacao: 'm'.repeat(400) }).ok, true);
    assert.match(validarPreInscricao({ ...MINIMO, motivacao: 'm'.repeat(401) }).erros.motivacao, /máximo de 400/);
    assert.equal(validarPreInscricao({ ...MINIMO, motivacao: 'linha 1\r\nlinha 2\u0000' }).dados.motivacao, 'linha 1\nlinha 2');
  });

  test('consentimento obrigatório e afirmativo; comunicações separado', () => {
    for (const sim of [true, 'true', 'on', '1', 1, 'sim', 'yes', ' ON ']) {
      assert.equal(validarPreInscricao({ ...MINIMO, consentimento: sim }).ok, true, `recusou ${sim}`);
    }
    for (const nao of [false, 'false', 'off', '0', 0, '', 'nao']) {
      assert.match(validarPreInscricao({ ...MINIMO, consentimento: nao }).erros.consentimento || '', /LGPD/, `aceitou ${nao}`);
    }
    assert.equal(validarPreInscricao({ ...MINIMO, comunicacoes: 'on' }).comunicacoes, true);
    assert.equal(validarPreInscricao({ ...MINIMO, comunicacoes: 'off' }).comunicacoes, false);
  });

  test('objeto/array/booleano em campo de texto → "Formato inválido."', () => {
    const textos = ['nome', 'email', 'whatsapp', 'cidade', 'uf', 'perfil', 'area', 'motivacao', 'pagina', 'utm_source', 'utm_content'];
    for (const ruim of [{ $ne: null }, ['a'], true]) {
      for (const campo of textos) {
        const r = validarPreInscricao({ ...BASE, [campo]: ruim });
        assert.equal(r.ok, false, `${campo}=${JSON.stringify(ruim)}`);
        assert.deepEqual(r.erros, { [campo]: 'Formato inválido.' }, campo);
      }
    }
    for (const campo of ['consentimento', 'comunicacoes']) {
      assert.deepEqual(validarPreInscricao({ ...BASE, [campo]: { $gt: '' } }).erros, { [campo]: 'Formato inválido.' });
    }
  });

  test('campos fora do contrato são ignorados', () => {
    const r = validarPreInscricao({
      ...MINIMO, status: 'aprovado', bolsa: '100%', protocolo: 'BOL-2026-AAAAAA', createdAt: '2020-01-01',
      isAdmin: true, website: '', consentimento: 'on', $where: '1'
    });
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.dados).sort(), ['area', 'cidade', 'email', 'nome', 'perfil', 'uf']);
  });

  test('fonte: página só com o caminho (sem host, query e fragmento), até 80', () => {
    const pag = (pagina) => validarPreInscricao({ ...MINIMO, pagina }).fonte.pagina;
    assert.equal(pag('/plataforma-ead/login.html?next=x#bolsas'), '/plataforma-ead/login.html');
    assert.equal(pag('http://127.0.0.1:4611/plataforma-ead/login.html'), '/plataforma-ead/login.html');
    assert.equal(pag('/pages/<img src=x onerror=alert(1)>.html'), '/pages/imgsrcxonerroralert1.html');
    assert.equal(pag('/' + 'a'.repeat(200)).length, LIMITES.pagina);
    assert.equal(pag('???'), 'nao-informada');
    assert.equal(pag(''), 'nao-informada');
  });
});

describe('ehRobo (honeypot)', () => {
  test('website preenchido = robô', () => {
    assert.equal(ehRobo({ website: 'http://spam.example' }), true);
    assert.equal(ehRobo({ website: { a: 1 } }), true);
    assert.equal(ehRobo({ website: 0 }), true);
    assert.equal(ehRobo({ website: '' }), false);
    assert.equal(ehRobo({ website: '   ' }), false);
    assert.equal(ehRobo({}), false);
    assert.equal(ehRobo(undefined), false);
  });
});

// ---------- protocolo, documento e erros do driver ----------
describe('protocolo e documento', () => {
  test('protocolo BOL-AAAA-XXXXXX, alfabeto sem 0/1/I/O, sorteado via crypto', () => {
    const momento = new Date('2026-10-18T12:00:00Z');
    const vistos = new Set();
    for (let i = 0; i < 300; i++) {
      const p = gerarProtocolo(momento);
      assert.match(p, PROTOCOLO_RE);
      assert.ok(p.startsWith('BOL-2026-'));
      assert.equal(/[01IO]/.test(p.slice(9)), false);
      vistos.add(p);
    }
    assert.ok(vistos.size > 295, 'sorteio repetiu demais');
    assert.equal(gerarProtocolo(momento, () => Buffer.from([0, 1, 31, 32, 255, 8])), 'BOL-2026-23Z2ZA');
  });

  test('ano no fuso de São Paulo', () => {
    assert.ok(gerarProtocolo(new Date('2027-01-01T02:59:59Z')).startsWith('BOL-2026-'));
    assert.ok(gerarProtocolo(new Date('2027-01-01T03:00:00Z')).startsWith('BOL-2027-'));
  });

  test('documento: forma exata, sem IP, user-agent ou referrer', () => {
    const momento = new Date('2026-10-18T12:00:00Z');
    const { dados, fonte, comunicacoes } = validarPreInscricao(BASE);
    const doc = montarPreInscricao({ dados, fonte, comunicacoes, momento, protocolo: 'BOL-2026-ABCDEF' });
    assert.deepEqual(Object.keys(doc), ['protocolo', 'email', 'dados', 'fonte', 'status', 'consentimento', 'comunicacoes', 'createdAt']);
    assert.equal(doc.email, 'joana.silva@exemplo.com.br');
    assert.equal(doc.status, 'pre-inscrito');
    assert.deepEqual(doc.consentimento, { aceito: true, em: momento, finalidade: 'aviso-concurso-bolsas' });
    assert.deepEqual(doc.comunicacoes, { aceito: false, em: null });
    assert.equal(doc.createdAt, momento);
    const json = JSON.stringify(doc).toLowerCase();
    for (const proibido of ['"ip', 'useragent', 'user-agent', 'referer', 'referrer']) assert.equal(json.includes(proibido), false, proibido);
    const comOptIn = montarPreInscricao({ dados, fonte, comunicacoes: true, momento, protocolo: 'BOL-2026-ABCDEF' });
    assert.deepEqual(comOptIn.comunicacoes, { aceito: true, em: momento });
  });

  test('chaveDuplicada: e-mail × protocolo (keyPattern ou nome do índice)', () => {
    const e = (props) => Object.assign(new Error(props.message || 'E11000'), { code: 11000, ...props });
    assert.equal(chaveDuplicada(e({ keyPattern: { email: 1 } })), 'email');
    assert.equal(chaveDuplicada(e({ keyPattern: { protocolo: 1 } })), 'protocolo');
    assert.equal(chaveDuplicada(e({
      message: 'E11000 duplicate key error collection: qa.bolsas_preinscricoes index: uq_bolsas_email dup key: { email: "protocolo@x.com" }'
    })), 'email', 'e-mail com "protocolo" no endereço não confunde');
    assert.equal(chaveDuplicada(e({ message: 'E11000 duplicate key error index: uq_bolsas_protocolo dup key: { protocolo: "x" }' })), 'protocolo');
    assert.equal(chaveDuplicada(e({ message: 'E11000 duplicate key error index: outro_indice dup key: { x: 1 }' })), null);
    assert.equal(chaveDuplicada(Object.assign(new Error('x'), { code: 11001 })), null);
    assert.equal(chaveDuplicada(null), null);
  });
});

// ---------- e-mail ----------
describe('criarNotificadorBolsas', () => {
  const doc = () => {
    const { dados, fonte, comunicacoes } = validarPreInscricao({ ...BASE, comunicacoes: 'on' });
    return montarPreInscricao({ dados, fonte, comunicacoes, momento: new Date('2026-10-18T12:00:00Z'), protocolo: 'BOL-2026-ABCDEF' });
  };

  test('sem chave ou destinatário → null (só grava e loga)', () => {
    assert.equal(criarNotificadorBolsas({}), null);
    assert.equal(criarNotificadorBolsas({ resendApiKey: 're_x', para: '' }), null);
    assert.equal(criarNotificadorBolsas({ resendApiKey: '', para: 'equipe@dmc.test' }), null);
    assert.equal(criarNotificadorBolsas({ resendApiKey: 're_x', para: ' , ' }), null);
  });

  test('envia pelo Resend com reply_to, assunto e corpo da pré-inscrição', async () => {
    const chamadas = [];
    const notificar = criarNotificadorBolsas({
      resendApiKey: 're_teste', para: 'a@dmc.test, b@dmc.test',
      fetchImpl: async (url, opcoes) => { chamadas.push({ url, opcoes }); return { ok: true, status: 200 }; }
    });
    assert.deepEqual(await notificar(doc()), { enviado: true });
    assert.equal(chamadas.length, 1);
    const { url, opcoes } = chamadas[0];
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(opcoes.method, 'POST');
    assert.equal(opcoes.headers.Authorization, 'Bearer re_teste');
    const corpo = JSON.parse(opcoes.body);
    assert.equal(corpo.from, 'Site Complexo DMC <onboarding@resend.dev>');
    assert.deepEqual(corpo.to, ['a@dmc.test', 'b@dmc.test']);
    assert.equal(corpo.reply_to, 'joana.silva@exemplo.com.br');
    assert.equal(corpo.subject, '[Concurso de Bolsas] Nova pré-inscrição — Joana da Silva');
    assert.match(corpo.text, /Protocolo: BOL-2026-ABCDEF/);
    assert.match(corpo.text, /Perfil: Estudante de graduação/);
    assert.match(corpo.text, /Área de interesse: Holding Patrimonial/);
    assert.match(corpo.text, /Aceita comunicações institucionais: sim/);
    assert.match(corpo.text, /Página: \/plataforma-ead\/login.html/);
  });

  test('HTTP de erro do Resend vira exceção; assunto sem quebra de linha', async () => {
    const notificar = criarNotificadorBolsas({ resendApiKey: 're_x', para: 'a@dmc.test', de: 'DMC <site@dmc.test>', fetchImpl: async () => ({ ok: false, status: 422 }) });
    await assert.rejects(notificar(doc()), /HTTP 422/);
    const d = doc();
    d.dados.nome = 'Nome\r\nBcc: x@y.com';
    assert.equal(assuntoEmailPreInscricao(d).includes('\n'), false);
    assert.match(corpoEmailPreInscricao({ ...d, dados: { ...d.dados, whatsapp: undefined, motivacao: undefined } }), /WhatsApp: —[\s\S]*Motivação:\n—$/);
  });
});

// ---------- HTTP ----------
// Repositório em memória que imita o MongoDB: índices únicos em email e
// protocolo lançam o mesmo E11000 (code, keyPattern, mensagem) do driver.
function erroDuplicado(campo, valor) {
  const e = new Error(`E11000 duplicate key error collection: qa.bolsas_preinscricoes index: uq_bolsas_${campo} dup key: { ${campo}: "${valor}" }`);
  e.name = 'MongoServerError';
  e.code = 11000;
  e.keyPattern = { [campo]: 1 };
  e.keyValue = { [campo]: valor };
  return e;
}

function criarRepoMemoria() {
  const docs = [];
  let seq = 0;
  const repo = {
    docs,
    portao: null,
    falharSalvar: false,
    falharBusca: false,
    falharLista: false,
    async salvar(doc) {
      if (repo.portao) await repo.portao;
      if (repo.falharSalvar) throw Object.assign(new Error('connection refused'), { name: 'MongoNetworkError' });
      if (docs.some(d => d.email === doc.email)) throw erroDuplicado('email', doc.email);
      if (docs.some(d => d.protocolo === doc.protocolo)) throw erroDuplicado('protocolo', doc.protocolo);
      doc._id = `id-${++seq}`;
      docs.push(doc);
      return { acknowledged: true, insertedId: doc._id };
    },
    async buscarPorEmail(email) {
      if (repo.falharBusca) throw new Error('sem banco');
      const d = docs.find(x => x.email === email);
      return d ? { _id: d._id, protocolo: d.protocolo, email: d.email, createdAt: d.createdAt } : null;
    },
    async listar({ pular, limite }) {
      if (repo.falharLista) throw new Error('sem banco');
      const f = [...docs].sort((a, b) => b.createdAt - a.createdAt);
      return { itens: f.slice(pular, pular + limite).map(d => structuredClone(d)), total: f.length };
    }
  };
  return repo;
}

// Faz o papel do loadUser global: usuário vem de um header de teste.
function usuarioDeTeste(req, _res, next) {
  const papel = req.get('x-teste-papel');
  if (papel === 'admin') req.user = { _id: 'u-admin', email: 'admin@dmc.test', isAdmin: true };
  if (papel === 'aluno') req.user = { _id: 'u-aluno', email: 'aluno@dmc.test', isAdmin: false };
  next();
}

async function subir(app) {
  let server;
  await new Promise((ok) => { server = app.listen(0, '127.0.0.1', ok); });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

const fechar = (server) => new Promise((ok) => server.close(ok));

function cliente(base) {
  const req = (metodo, caminho, corpo, headers = {}) => fetch(base + caminho, {
    method: metodo,
    headers: corpo === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo))
  });
  return {
    post: (caminho, corpo, headers) => req('POST', caminho, corpo, headers),
    get: (caminho, headers) => req('GET', caminho, undefined, headers),
    metodo: req
  };
}

function montarApp({ repo, notificar = null, throttle, relogio = { t: Date.parse('2026-10-18T12:00:00Z') }, ...extra }) {
  const app = express();
  app.use('/api/bolsas', corpoBolsas());
  app.use(express.json({ limit: '1mb' }));
  app.use(usuarioDeTeste);
  app.use('/api/bolsas', criarRotaBolsas({
    salvar: repo.salvar,
    buscarPorEmail: repo.buscarPorEmail,
    listar: repo.listar,
    notificar,
    exigirAdmin: [requireAuth, requireAdmin],
    ...(throttle ? { throttle } : {}),
    agora: () => new Date(relogio.t),
    log: silencioso,
    ...extra
  }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  return app;
}

const ROTA = '/api/bolsas/pre-inscricao';

describe('POST /api/bolsas/pre-inscricao (HTTP, sem banco)', () => {
  let server;
  let api;
  const repo = criarRepoMemoria();
  const notificados = [];
  let falharEmail = false;
  const relogio = { t: Date.parse('2026-10-18T12:00:00Z') };
  let n = 0;
  const unico = () => `pessoa${++n}@exemplo.com.br`;

  before(async () => {
    const s = await subir(montarApp({
      repo,
      relogio,
      throttle: criarThrottle({ janelaMs: 60_000, max: 1000 }),
      notificar: async (doc) => {
        if (falharEmail) throw new Error('resend fora');
        notificados.push(doc);
      }
    }));
    server = s.server;
    api = cliente(s.base);
  });

  after(() => fechar(server));

  test('válido → 201 { ok, protocolo } só; grava o documento completo e notifica', async () => {
    const r = await api.post(ROTA, BASE);
    assert.equal(r.status, 201);
    const j = await r.json();
    assert.deepEqual(Object.keys(j), ['ok', 'protocolo']);
    assert.equal(j.ok, true);
    assert.match(j.protocolo, PROTOCOLO_RE);
    assert.ok(j.protocolo.startsWith('BOL-2026-'));
    assert.equal(repo.docs.length, 1);
    const doc = repo.docs[0];
    assert.equal(doc.protocolo, j.protocolo);
    assert.equal(doc.email, 'joana.silva@exemplo.com.br');
    assert.equal(doc.status, 'pre-inscrito');
    assert.equal(doc.dados.perfil, 'estudante-graduacao');
    assert.equal(doc.fonte.pagina, '/plataforma-ead/login.html');
    assert.deepEqual(doc.consentimento, { aceito: true, em: new Date(relogio.t), finalidade: 'aviso-concurso-bolsas' });
    assert.deepEqual(doc.comunicacoes, { aceito: false, em: null });
    assert.equal(doc.createdAt.getTime(), relogio.t);
    assert.equal(notificados.at(-1).protocolo, j.protocolo);
  });

  test('mesmo e-mail (maiúsculas/espaços) → 200 duplicada com o protocolo existente; nada muda', async () => {
    const original = repo.docs[0];
    const antes = repo.docs.length;
    const avisos = notificados.length;
    const r = await api.post(ROTA, { ...MINIMO, nome: 'Outra Pessoa', email: '  JOANA.SILVA@exemplo.com.br' });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, duplicada: true, protocolo: original.protocolo });
    assert.equal(repo.docs.length, antes);
    assert.equal(repo.docs[0].dados.nome, 'Joana da Silva', 'não sobrescreve a pré-inscrição existente');
    assert.equal(notificados.length, avisos, 'duplicada não notifica de novo');
  });

  test('corrida: dois envios simultâneos do mesmo e-mail → um 201, um 200 duplicada, um registro', async () => {
    const email = unico();
    let liberar;
    repo.portao = new Promise((ok) => { liberar = ok; });
    const antes = repo.docs.length;
    const pendentes = [api.post(ROTA, { ...MINIMO, email }), api.post(ROTA, { ...MINIMO, email: email.toUpperCase() })];
    await new Promise((ok) => setTimeout(ok, 60));
    repo.portao = null;
    liberar();
    const respostas = await Promise.all(pendentes);
    const corpos = await Promise.all(respostas.map(r => r.json()));
    assert.deepEqual(respostas.map(r => r.status).sort(), [200, 201]);
    const [criada, duplicada] = respostas[0].status === 201 ? corpos : [corpos[1], corpos[0]];
    assert.equal(duplicada.duplicada, true);
    assert.equal(duplicada.protocolo, criada.protocolo);
    assert.equal(repo.docs.length, antes + 1);
    assert.equal(repo.docs.filter(d => d.email === email).length, 1);
  });

  test('201 só depois de salvar confirmar', async () => {
    let liberar;
    repo.portao = new Promise((ok) => { liberar = ok; });
    const antes = repo.docs.length;
    let respondeu = false;
    const pendente = api.post(ROTA, { ...MINIMO, email: unico() }).then((r) => { respondeu = true; return r; });
    await new Promise((ok) => setTimeout(ok, 80));
    assert.equal(respondeu, false, 'respondeu antes do insert terminar');
    assert.equal(repo.docs.length, antes);
    repo.portao = null;
    liberar();
    const r = await pendente;
    assert.equal(r.status, 201);
    assert.equal(repo.docs.length, antes + 1);
  });

  test('inválido → 400 com campos; nada gravado', async () => {
    const antes = repo.docs.length;
    const r = await api.post(ROTA, { ...MINIMO, email: unico(), uf: 'XX', area: 'tributario', consentimento: false });
    assert.equal(r.status, 400);
    const j = await r.json();
    assert.equal(j.error, MENSAGENS.revise);
    assert.equal(j.error, 'Revise os campos indicados.');
    assert.deepEqual(Object.keys(j.campos).sort(), ['area', 'consentimento', 'uf']);
    assert.equal(j.ok, undefined);
    assert.equal(j.protocolo, undefined);
    assert.equal(repo.docs.length, antes);
  });

  test('honeypot → 200 { ok:true } sem protocolo, nada gravado nem notificado (mesmo com corpo inválido)', async () => {
    const antes = repo.docs.length;
    const avisos = notificados.length;
    for (const corpo of [{ ...MINIMO, email: unico(), website: 'http://spam.example' }, { website: 'x' }]) {
      const r = await api.post(ROTA, corpo);
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { ok: true });
    }
    assert.equal(repo.docs.length, antes);
    assert.equal(notificados.length, avisos);
  });

  test('urlencoded (form sem JS) → 201 com opt-in de comunicações registrado', async () => {
    const email = unico();
    const form = new URLSearchParams({ ...MINIMO, email, consentimento: 'on', comunicacoes: 'on', pagina: '/plataforma-ead/login.html' });
    const r = await api.metodo('POST', ROTA, form.toString(), { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.equal(r.status, 201);
    const doc = repo.docs.find(d => d.email === email);
    assert.deepEqual(doc.comunicacoes, { aceito: true, em: new Date(relogio.t) });
    // Campo repetido vira lista → recusado como formato inválido.
    const rep = await api.metodo('POST', ROTA, `${form.toString()}&area=tecnologia`, { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.equal(rep.status, 400);
    assert.equal((await rep.json()).campos.area, 'Formato inválido.');
  });

  test('corpo ilegível → 400; acima de 16 KB → 413; sem tipo conhecido → 400 com campos', async () => {
    const ruim = await api.metodo('POST', ROTA, '{"nome": ', { 'Content-Type': 'application/json' });
    assert.equal(ruim.status, 400);
    assert.deepEqual(await ruim.json(), { error: MENSAGENS.ilegivel });

    const grande = await api.post(ROTA, { ...MINIMO, email: unico(), motivacao: 'x'.repeat(17 * 1024) });
    assert.equal(grande.status, 413);
    assert.deepEqual(await grande.json(), { error: MENSAGENS.grande });

    const textoPuro = await api.metodo('POST', ROTA, 'nome=Rui', { 'Content-Type': 'text/plain' });
    assert.equal(textoPuro.status, 400);
    assert.ok((await textoPuro.json()).campos.nome);

    const lista = await api.post(ROTA, [MINIMO]);
    assert.equal(lista.status, 400);
  });

  test('campos fora do contrato não chegam ao banco', async () => {
    const email = unico();
    const r = await api.post(ROTA, { ...MINIMO, email, status: 'aprovado', bolsa: '100%', protocolo: 'BOL-2026-AAAAAA', createdAt: '2020-01-01' });
    assert.equal(r.status, 201);
    const doc = repo.docs.find(d => d.email === email);
    assert.equal(doc.status, 'pre-inscrito');
    assert.notEqual(doc.protocolo, 'BOL-2026-AAAAAA');
    assert.equal(doc.createdAt.getTime(), relogio.t);
    assert.equal(JSON.stringify(doc).includes('100%'), false);
  });

  test('falha no banco → 503, nunca sucesso falso (insert e busca da duplicada)', async () => {
    const antes = repo.docs.length;
    repo.falharSalvar = true;
    try {
      const r = await api.post(ROTA, { ...MINIMO, email: unico() });
      assert.equal(r.status, 503);
      assert.deepEqual(await r.json(), { error: MENSAGENS.indisponivel });
    } finally {
      repo.falharSalvar = false;
    }
    repo.falharBusca = true;
    try {
      const r = await api.post(ROTA, { ...MINIMO, email: 'joana.silva@exemplo.com.br' });
      assert.equal(r.status, 503, 'E11000 + busca falhando não pode virar 200');
      assert.deepEqual(await r.json(), { error: MENSAGENS.indisponivel });
    } finally {
      repo.falharBusca = false;
    }
    assert.equal(repo.docs.length, antes);
  });

  test('falha só no e-mail → 201 (pré-inscrição já gravada)', async () => {
    falharEmail = true;
    try {
      const antes = repo.docs.length;
      const r = await api.post(ROTA, { ...MINIMO, email: unico() });
      assert.equal(r.status, 201);
      assert.match((await r.json()).protocolo, PROTOCOLO_RE);
      assert.equal(repo.docs.length, antes + 1);
    } finally {
      falharEmail = false;
    }
  });

  test('sem notificador configurado → 201 normalmente', async () => {
    const s = await subir(montarApp({ repo: criarRepoMemoria(), throttle: criarThrottle({ janelaMs: 60_000, max: 1000 }) }));
    try {
      assert.equal((await cliente(s.base).post(ROTA, MINIMO)).status, 201);
    } finally {
      await fechar(s.server);
    }
  });
});

describe('E11000 — casos do driver', () => {
  const throttle = () => criarThrottle({ janelaMs: 60_000, max: 1000 });

  test('colisão de protocolo sorteia outro', async () => {
    const repo = criarRepoMemoria();
    const tentativas = [];
    let chamadas = 0;
    const s = await subir(montarApp({
      repo: {
        ...repo,
        salvar: async (doc) => {
          tentativas.push(doc.protocolo);
          if (++chamadas === 1) throw erroDuplicado('protocolo', doc.protocolo);
          return repo.salvar(doc);
        }
      },
      throttle: throttle(),
      gerar: (m) => gerarProtocolo(m, () => Buffer.from([chamadas, 0, 0, 0, 0, 0]))
    }));
    try {
      const r = await cliente(s.base).post(ROTA, MINIMO);
      assert.equal(r.status, 201);
      assert.equal(tentativas.length, 2);
      assert.notEqual(tentativas[0], tentativas[1]);
      assert.equal((await r.json()).protocolo, tentativas[1]);
    } finally {
      await fechar(s.server);
    }
  });

  test('E11000 de e-mail só pela mensagem (sem keyPattern) → 200 duplicada', async () => {
    const repo = criarRepoMemoria();
    const s = await subir(montarApp({
      repo: {
        ...repo,
        salvar: async () => {
          throw Object.assign(new Error('E11000 duplicate key error collection: x.bolsas_preinscricoes index: uq_bolsas_email dup key: { email: "rui@exemplo.com" }'), { code: 11000 });
        },
        buscarPorEmail: async (email) => (email === 'rui@exemplo.com' ? { protocolo: 'BOL-2026-ABCDEF' } : null)
      },
      throttle: throttle()
    }));
    try {
      const r = await cliente(s.base).post(ROTA, MINIMO);
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { ok: true, duplicada: true, protocolo: 'BOL-2026-ABCDEF' });
    } finally {
      await fechar(s.server);
    }
  });

  test('E11000 de e-mail, mas o registro sumiu → tenta de novo; persistindo, 503', async () => {
    const repo = criarRepoMemoria();
    let chamadas = 0;
    const s1 = await subir(montarApp({
      repo: {
        ...repo,
        salvar: async (doc) => {
          if (++chamadas === 1) throw erroDuplicado('email', doc.email);
          return repo.salvar(doc);
        },
        buscarPorEmail: async () => null
      },
      throttle: throttle()
    }));
    try {
      assert.equal((await cliente(s1.base).post(ROTA, MINIMO)).status, 201);
      assert.equal(chamadas, 2);
    } finally {
      await fechar(s1.server);
    }

    let sempre = 0;
    const s2 = await subir(montarApp({
      repo: { ...repo, salvar: async (doc) => { sempre++; throw erroDuplicado('email', doc.email); }, buscarPorEmail: async () => null },
      throttle: throttle()
    }));
    try {
      const r = await cliente(s2.base).post(ROTA, { ...MINIMO, email: 'outra@exemplo.com' });
      assert.equal(r.status, 503);
      assert.equal(sempre, 3, 'no máximo 3 tentativas');
    } finally {
      await fechar(s2.server);
    }
  });

  test('outro erro do banco (não E11000) → 503 sem nova tentativa', async () => {
    let chamadas = 0;
    const repo = criarRepoMemoria();
    const s = await subir(montarApp({
      repo: { ...repo, salvar: async () => { chamadas++; throw Object.assign(new Error('not primary'), { code: 10107 }); } },
      throttle: throttle()
    }));
    try {
      assert.equal((await cliente(s.base).post(ROTA, MINIMO)).status, 503);
      assert.equal(chamadas, 1);
    } finally {
      await fechar(s.server);
    }
  });
});

describe('throttle da pré-inscrição (padrão real: 5 por IP em 15 min)', () => {
  test('6º envio → 429 com Retry-After; contador separado do /api/contato', async () => {
    assert.deepEqual({ ...THROTTLE_PADRAO }, { janelaMs: 15 * 60 * 1000, max: 5 });
    const app = express();
    app.use('/api/contato', corpoContato());
    app.use('/api/bolsas', corpoBolsas());
    app.use('/api/contato', criarRotaContato({ salvar: async () => ({ insertedId: 'c1' }), log: silencioso }));
    // Sem `throttle` injetado: usa o padrão do módulo.
    const repo = criarRepoMemoria();
    app.use('/api/bolsas', criarRotaBolsas({ ...repo, exigirAdmin: [requireAdmin], log: silencioso }));
    const s = await subir(app);
    const api = cliente(s.base);
    try {
      const corpos = [
        { ...MINIMO, email: 't1@exemplo.com' },          // 201
        { ...MINIMO, email: 'T1@exemplo.com' },          // 200 duplicada
        { ...MINIMO, email: 't3@exemplo.com', uf: 'XX' }, // 400
        { website: 'bot' },                               // 200 honeypot
        { ...MINIMO, email: 't5@exemplo.com' }           // 201
      ];
      const status = [];
      for (const corpo of corpos) status.push((await api.post(ROTA, corpo)).status);
      assert.deepEqual(status, [201, 200, 400, 200, 201]);
      const sexto = await api.post(ROTA, { ...MINIMO, email: 't6@exemplo.com' });
      assert.equal(sexto.status, 429);
      assert.ok(Number(sexto.headers.get('retry-after')) > 0);
      assert.deepEqual(await sexto.json(), { error: MENSAGENS.excesso });
      assert.equal(repo.docs.length, 2);
      // O contato tem a própria janela: não foi afetado.
      const contato = await api.post('/api/contato', {
        nome: 'Maria Silva', email: 'maria@ex.com', perfil: 'investidor', eixo: 'E1',
        mensagem: 'Mensagem de teste suficiente.', consentimento: true
      });
      assert.equal(contato.status, 201);
    } finally {
      await fechar(s.server);
    }
  });
});

describe('admin GET /api/bolsas/admin/pre-inscricoes (HTTP, sem banco)', () => {
  let server;
  let api;
  const repo = criarRepoMemoria();
  const ADMIN = { 'x-teste-papel': 'admin' };
  const ALUNO = { 'x-teste-papel': 'aluno' };
  const LISTA = '/api/bolsas/admin/pre-inscricoes';

  before(async () => {
    for (let i = 0; i < 30; i++) {
      const { dados, fonte, comunicacoes } = validarPreInscricao({ ...MINIMO, email: `p${i}@exemplo.com` });
      const momento = new Date(Date.parse('2026-10-01T12:00:00Z') + i * 60_000);
      await repo.salvar(montarPreInscricao({ dados, fonte, comunicacoes, momento, protocolo: gerarProtocolo(momento) }));
    }
    const s = await subir(montarApp({ repo, throttle: criarThrottle({ janelaMs: 60_000, max: 1000 }) }));
    server = s.server;
    api = cliente(s.base);
  });

  after(() => fechar(server));

  test('sem sessão → 401; sem papel de admin → 403; nada vaza', async () => {
    const semSessao = await api.get(LISTA);
    assert.equal(semSessao.status, 401);
    const j401 = await semSessao.json();
    assert.equal(j401.itens, undefined);
    const aluno = await api.get(LISTA, ALUNO);
    assert.equal(aluno.status, 403);
    const j403 = await aluno.json();
    assert.equal(j403.error, 'Acesso restrito a administradores.');
    assert.equal(j403.itens, undefined);
  });

  test('admin → 200: 25 por página, total, mais recentes primeiro, sem cache', async () => {
    const r = await api.get(`${LISTA}?pagina=1`, ADMIN);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.pagina, 1);
    assert.equal(j.porPagina, POR_PAGINA);
    assert.equal(POR_PAGINA, 25);
    assert.equal(j.total, 30);
    assert.equal(j.totalPaginas, 2);
    assert.equal(j.itens.length, 25);
    assert.equal(j.itens[0].email, 'p29@exemplo.com', 'mais recente primeiro');
    assert.equal(typeof j.itens[0].id, 'string');
    assert.equal(j.itens[0]._id, undefined);
    assert.match(j.itens[0].protocolo, PROTOCOLO_RE);
    assert.equal(j.itens[0].status, 'pre-inscrito');
    assert.deepEqual(j.rotulos.areas, { ...AREAS });
    assert.deepEqual(j.rotulos.perfis, { ...PERFIS });

    const p2 = await (await api.get(`${LISTA}?pagina=2`, ADMIN)).json();
    assert.equal(p2.pagina, 2);
    assert.equal(p2.itens.length, 5);
    assert.equal(p2.itens.at(-1).email, 'p0@exemplo.com');
    const longe = await (await api.get(`${LISTA}?pagina=99`, ADMIN)).json();
    assert.deepEqual([longe.itens.length, longe.total], [0, 30]);
  });

  test('página inválida cai na 1', async () => {
    for (const p of ['abc', '0', '-1', '1e3', '', '1234567']) {
      const j = await (await api.get(`${LISTA}?pagina=${encodeURIComponent(p)}`, ADMIN)).json();
      assert.equal(j.pagina, 1, `pagina=${p}`);
    }
    const j = await (await api.get(`${LISTA}?pagina=1&pagina=2`, ADMIN)).json();
    assert.equal(j.pagina, 1);
  });

  test('falha do banco → 503', async () => {
    repo.falharLista = true;
    try {
      const r = await api.get(LISTA, ADMIN);
      assert.equal(r.status, 503);
      assert.deepEqual(await r.json(), { error: MENSAGENS.adminIndisponivel });
    } finally {
      repo.falharLista = false;
    }
  });

  test('não existe rota de escrita na lista admin', async () => {
    for (const metodo of ['POST', 'PATCH', 'DELETE', 'PUT']) {
      const r = await api.metodo(metodo, LISTA, { status: 'aprovado' }, ADMIN);
      assert.equal(r.status, 404, metodo);
    }
  });
});

describe('criarRepositorioBolsas e dependências', () => {
  test('repositório usa insertOne, findOne por e-mail e lista por createdAt desc', async () => {
    const chamadas = [];
    const colecao = () => ({
      insertOne: async (doc) => { chamadas.push(['insertOne', doc]); return { insertedId: 'x' }; },
      findOne: async (filtro, opcoes) => { chamadas.push(['findOne', filtro, opcoes]); return null; },
      find: (filtro) => {
        const c = { filtro };
        chamadas.push(['find', c]);
        return {
          sort(s) { c.sort = s; return this; },
          skip(n) { c.skip = n; return this; },
          limit(n) { c.limit = n; return this; },
          toArray: async () => [{ _id: 'a' }]
        };
      },
      countDocuments: async (filtro) => { chamadas.push(['countDocuments', filtro]); return 1; }
    });
    const repo = criarRepositorioBolsas(colecao);
    await repo.salvar({ email: 'a@b.com' });
    await repo.buscarPorEmail('a@b.com');
    assert.deepEqual(await repo.listar({ pular: 25, limite: 25 }), { itens: [{ _id: 'a' }], total: 1 });
    assert.deepEqual(chamadas[0], ['insertOne', { email: 'a@b.com' }]);
    assert.deepEqual(chamadas[1], ['findOne', { email: 'a@b.com' }, { projection: { protocolo: 1, email: 1, createdAt: 1 } }]);
    const find = chamadas.find(c => c[0] === 'find')[1];
    assert.deepEqual(find, { filtro: {}, sort: { createdAt: -1 }, skip: 25, limit: 25 });
  });

  test('criarRotaBolsas exige repositório e middleware de admin', () => {
    const repo = criarRepoMemoria();
    assert.throws(() => criarRotaBolsas({ ...repo, salvar: undefined, exigirAdmin: [requireAdmin] }), /salvar/);
    assert.throws(() => criarRotaBolsas({ ...repo, buscarPorEmail: undefined, exigirAdmin: [requireAdmin] }), /buscarPorEmail/);
    assert.throws(() => criarRotaBolsas({ ...repo }), /exigirAdmin/);
    assert.throws(() => criarRotaBolsas({ ...repo, exigirAdmin: ['x'] }), /exigirAdmin/);
  });
});
