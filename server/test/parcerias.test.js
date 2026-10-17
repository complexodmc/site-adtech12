// Testes de /api/parcerias sem MongoDB: o repositório, o notificador e o
// middleware de administrador são injetados. Rode com `npm test` na raiz.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  validarCandidatura, validarPartnerLawyers, validarBusinessPartner, ehRobo, corpoParcerias,
  criarRotaParcerias, criarNotificadorParcerias, assuntoEmailCandidatura, corpoEmailCandidatura,
  montarCandidatura, gerarProtocolo, ehDuplicada, transicoesPermitidas, validarTransicao,
  estadoAnteriorAoArquivamento, estadosDoPrograma, validarAtualizacao,
  FUNIS, PROGRAMAS, UFS, PROTOCOLO_RE, POR_PAGINA, THROTTLE_PADRAO
} from '../src/routes/parcerias.js';
import { criarRotaContato, corpoContato } from '../src/routes/contato.js';
import { criarThrottle } from '../src/throttle.js';

// O middleware real de admin (auth.js) importa config.js, que exige as
// variáveis abaixo. Nenhuma conexão é aberta: só requireAuth/requireAdmin.
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const { requireAuth, requireAdmin } = await import('../src/auth.js');

const silencioso = { log() {}, warn() {}, error() {} };

const PL = Object.freeze({
  nome: '  Ana  Beatriz Souza ',
  oab_numero: '123.456',
  oab_seccional: 'sp',
  escritorio: 'Souza Sociedade de Advogados',
  areas: ['tributario', 'Empresarial', 'tributario'],
  cidade: 'São Paulo',
  uf: 'sp',
  email: 'Ana@Souza.adv.br',
  telefone: '(11) 98888-7777',
  apresentacao: 'Atuo há doze anos em direito tributário empresarial,\r\ncom foco em reorganizações societárias.',
  consentimento: true,
  pagina: '/pages/parcerias/partner-lawyers.html?email=ana@souza.adv.br#form',
  utm_source: 'linkedin',
  utm_medium: 'social<script>alert(1)</script>',
  utm_campaign: 'parcerias-2026',
  utm_content: 'x'.repeat(200)
});

const BP = Object.freeze({
  nome: 'Carlos Pereira',
  empresa: 'Pereira Negócios',
  cargo: 'Diretor comercial',
  segmento: 'agronegocio',
  cidade: 'Ribeirão Preto',
  uf: 'SP',
  email: 'carlos@pereira.com.br',
  whatsapp: '+55 (16) 99999-1234',
  experiencia_b2b: '5-a-10-anos',
  perfil_empresas: 'Produtores rurais e cooperativas de médio porte no interior paulista.',
  mensagem: 'Gostaria de entender o modelo de cooperação.',
  consentimento: 'on',
  comunicacoes: 'on',
  pagina: '/pages/parcerias/business-partner.html'
});

const OBRIGATORIOS = {
  'partner-lawyers': ['apresentacao', 'areas', 'cidade', 'consentimento', 'email', 'nome', 'oab_numero', 'oab_seccional', 'telefone', 'uf'],
  'business-partner': ['cargo', 'cidade', 'consentimento', 'email', 'experiencia_b2b', 'nome', 'perfil_empresas', 'segmento', 'uf', 'whatsapp']
};

// ---------- validação: Partner Lawyers ----------
describe('validarCandidatura — partner-lawyers', () => {
  test('aceita envio completo e normaliza', () => {
    const r = validarPartnerLawyers(PL);
    assert.equal(r.ok, true, JSON.stringify(r.erros));
    assert.equal(r.dados.nome, 'Ana Beatriz Souza');
    assert.equal(r.dados.oab_numero, '123456');
    assert.equal(r.dados.oab_seccional, 'SP');
    assert.deepEqual(r.dados.areas, ['tributario', 'empresarial']);
    assert.equal(r.dados.uf, 'SP');
    assert.equal(r.dados.email, 'ana@souza.adv.br');
    assert.equal(r.dados.telefone, '11988887777');
    assert.equal(r.dados.apresentacao.includes('\r'), false);
    assert.equal(r.comunicacoes, false, 'comunicações é opt-in separado: default false');
    assert.equal('consentimento' in r.dados, false);
    assert.equal('website' in r.dados, false);
  });

  test('corpo vazio aponta exatamente os obrigatórios', () => {
    const r = validarPartnerLawyers({});
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.erros).sort(), OBRIGATORIOS['partner-lawyers']);
    assert.equal(r.erros.nome, 'Informe seu nome.');
    assert.equal(r.erros.oab_numero, 'Informe o número de inscrição na OAB.');
    assert.equal(r.erros.areas, 'Selecione ao menos uma área de atuação.');
  });

  test('cada obrigatório ausente gera erro só nele', () => {
    for (const campo of OBRIGATORIOS['partner-lawyers']) {
      const corpo = { ...PL };
      delete corpo[campo];
      const r = validarPartnerLawyers(corpo);
      assert.equal(r.ok, false, campo);
      assert.deepEqual(Object.keys(r.erros), [campo], campo);
    }
  });

  test('OAB: só dígitos (3 a 7) depois de tirar pontos, espaços e hífen', () => {
    for (const ok of ['123', '1234567', '12.345', '123 456', '12-345', 98765]) {
      assert.equal(validarPartnerLawyers({ ...PL, oab_numero: ok }).ok, true, `recusou ${ok}`);
    }
    assert.equal(validarPartnerLawyers({ ...PL, oab_numero: ' 1.234-56 ' }).dados.oab_numero, '123456');
    for (const ruim of ['12', '12345678', '123456A', 'A123456', 'abc', '12/345', '123456E']) {
      assert.match(validarPartnerLawyers({ ...PL, oab_numero: ruim }).erros.oab_numero || '', /OAB inválido/, `aceitou ${ruim}`);
    }
  });

  test('seccional e UF: só as 27 UFs', () => {
    assert.equal(UFS.length, 27);
    const r = validarPartnerLawyers({ ...PL, oab_seccional: 'XX', uf: 'São Paulo' });
    assert.match(r.erros.oab_seccional, /Seccional inválida/);
    assert.match(r.erros.uf, /UF inválida/);
    assert.equal(validarPartnerLawyers({ ...PL, oab_seccional: 'df', uf: 'To' }).ok, true);
  });

  test('áreas: lista enumerada, ≥1, string única ou array, sem repetição', () => {
    assert.match(validarPartnerLawyers({ ...PL, areas: ['tributario', 'penal'] }).erros.areas, /Área de atuação inválida/);
    assert.match(validarPartnerLawyers({ ...PL, areas: [] }).erros.areas, /ao menos uma/);
    assert.match(validarPartnerLawyers({ ...PL, areas: ['', ' '] }).erros.areas, /ao menos uma/);
    assert.deepEqual(validarPartnerLawyers({ ...PL, areas: 'imobiliario' }).dados.areas, ['imobiliario']);
    assert.deepEqual(validarPartnerLawyers({ ...PL, areas: ['Sucessões Patrimônio', 'outra'] }).dados.areas, ['sucessoes-patrimonio', 'outra']);
    const semAreas = { ...PL };
    delete semAreas.areas;
    assert.deepEqual(validarPartnerLawyers({ ...semAreas, 'areas[]': ['trabalhista-empresarial'] }).dados.areas, ['trabalhista-empresarial']);
    assert.equal(validarPartnerLawyers({ ...PL, areas: [{ $ne: null }] }).erros.areas, 'Formato inválido.');
    assert.equal(validarPartnerLawyers({ ...PL, areas: { $in: ['x'] } }).erros.areas, 'Formato inválido.');
  });

  test('e-mail inválido; domínio gratuito não é bloqueado', () => {
    for (const ruim of ['ana@', 'ana.souza.adv.br', 'ana@souza', 'ana @souza.com', 'a@b.c']) {
      assert.match(validarPartnerLawyers({ ...PL, email: ruim }).erros.email || '', /E-mail inválido/, `aceitou ${ruim}`);
    }
    assert.equal(validarPartnerLawyers({ ...PL, email: 'ana@gmail.com' }).ok, true);
  });

  test('telefone: 10 a 13 dígitos', () => {
    assert.match(validarPartnerLawyers({ ...PL, telefone: '9888-7777' }).erros.telefone, /Telefone inválido/);
    assert.match(validarPartnerLawyers({ ...PL, telefone: '12345678901234' }).erros.telefone, /Telefone inválido/);
    assert.equal(validarPartnerLawyers({ ...PL, telefone: '1198888777' }).ok, true);
  });

  test('limites de tamanho', () => {
    const r = validarPartnerLawyers({
      ...PL,
      nome: 'n'.repeat(121),
      escritorio: 'e'.repeat(151),
      cidade: 'c'.repeat(81),
      apresentacao: 'a'.repeat(2001)
    });
    assert.match(r.erros.nome, /muito longo/);
    assert.match(r.erros.escritorio, /muito longo/);
    assert.match(r.erros.cidade, /muito longo/);
    assert.match(r.erros.apresentacao, /muito longa/);
    assert.match(validarPartnerLawyers({ ...PL, apresentacao: 'a'.repeat(29) }).erros.apresentacao, /muito curta/);
    assert.equal(validarPartnerLawyers({ ...PL, apresentacao: 'a'.repeat(30) }).ok, true);
    assert.equal(validarPartnerLawyers({ ...PL, apresentacao: 'a'.repeat(2000) }).ok, true);
    assert.match(validarPartnerLawyers({ ...PL, nome: 'A' }).erros.nome, /nome completo/);
    assert.match(validarPartnerLawyers({ ...PL, nome: '12345' }).erros.nome, /nome completo/);
    assert.equal('escritorio' in validarPartnerLawyers({ ...PL, escritorio: '  ' }).dados, false);
  });

  test('objeto/array onde se espera string → "Formato inválido." (anti-injeção de operador)', () => {
    const r = validarPartnerLawyers({
      ...PL,
      email: { $gt: '' },
      nome: ['a', 'b'],
      oab_numero: { $regex: '.*' },
      oab_seccional: ['SP'],
      escritorio: {},
      cidade: ['x'],
      uf: { $ne: 'SP' },
      telefone: [11],
      apresentacao: { texto: 'x' },
      consentimento: { $exists: true },
      comunicacoes: ['on'],
      pagina: { $where: '1' },
      utm_source: ['a']
    });
    for (const campo of ['email', 'nome', 'oab_numero', 'oab_seccional', 'escritorio', 'cidade', 'uf', 'telefone',
      'apresentacao', 'consentimento', 'comunicacoes', 'pagina', 'utm_source']) {
      assert.equal(r.erros[campo], 'Formato inválido.', campo);
    }
  });

  test('consentimento afirmativo obrigatório; comunicações independente', () => {
    for (const v of [false, 'false', '', undefined, 0, 'nao', 'off']) {
      assert.match(validarPartnerLawyers({ ...PL, consentimento: v }).erros.consentimento || '', /LGPD/, `aceitou ${v}`);
    }
    for (const v of [true, 'true', 'on', '1', 'sim', 1]) {
      assert.equal(validarPartnerLawyers({ ...PL, consentimento: v }).ok, true, `recusou ${v}`);
    }
    assert.equal(validarPartnerLawyers({ ...PL, comunicacoes: 'on' }).comunicacoes, true);
    assert.equal(validarPartnerLawyers({ ...PL, comunicacoes: 'false' }).comunicacoes, false);
    // Aceitar comunicações não supre o consentimento.
    assert.ok(validarPartnerLawyers({ ...PL, consentimento: false, comunicacoes: true }).erros.consentimento);
  });

  test('fonte: página sem query/fragmento; utm só [A-Za-z0-9._-] e até 80', () => {
    const { fonte } = validarPartnerLawyers(PL);
    assert.equal(fonte.pagina, '/pages/parcerias/partner-lawyers.html');
    assert.equal(fonte.utm_source, 'linkedin');
    assert.equal(fonte.utm_medium, 'socialscriptalert1script');
    assert.equal(fonte.utm_campaign, 'parcerias-2026');
    assert.equal(fonte.utm_content.length, 80);
    const vazio = validarPartnerLawyers({ ...PL, pagina: '', utm_source: '<>', utm_medium: undefined, utm_campaign: '', utm_content: '' }).fonte;
    assert.deepEqual(vazio, { pagina: 'nao-informada' });
    assert.equal(validarPartnerLawyers({ ...PL, pagina: 'p'.repeat(500) }).fonte.pagina.length, 120);
  });

  test('corpo não-objeto é tratado como vazio; programa desconhecido explode', () => {
    for (const corpo of [null, undefined, 'x', 42, [PL]]) {
      assert.equal(validarPartnerLawyers(corpo).ok, false);
    }
    assert.throws(() => validarCandidatura('outro-programa', PL), /programa desconhecido/);
  });
});

// ---------- validação: Business Partner ----------
describe('validarCandidatura — business-partner', () => {
  test('aceita envio completo e normaliza', () => {
    const r = validarBusinessPartner(BP);
    assert.equal(r.ok, true, JSON.stringify(r.erros));
    assert.equal(r.dados.whatsapp, '5516999991234');
    assert.equal(r.dados.segmento, 'agronegocio');
    assert.equal(r.dados.experiencia_b2b, '5-a-10-anos');
    assert.equal(r.comunicacoes, true);
    assert.equal('oab_numero' in r.dados, false);
  });

  test('corpo vazio aponta exatamente os obrigatórios', () => {
    const r = validarBusinessPartner({});
    assert.deepEqual(Object.keys(r.erros).sort(), OBRIGATORIOS['business-partner']);
  });

  test('cada obrigatório ausente gera erro só nele', () => {
    for (const campo of OBRIGATORIOS['business-partner']) {
      const corpo = { ...BP };
      delete corpo[campo];
      const r = validarBusinessPartner(corpo);
      assert.equal(r.ok, false, campo);
      assert.deepEqual(Object.keys(r.erros), [campo], campo);
    }
  });

  test('opcionais (empresa, mensagem) podem faltar', () => {
    const corpo = { ...BP };
    delete corpo.empresa;
    delete corpo.mensagem;
    delete corpo.comunicacoes;
    const r = validarBusinessPartner(corpo);
    assert.equal(r.ok, true);
    assert.equal(r.comunicacoes, false);
  });

  test('segmento e experiência fora da lista; WhatsApp e UF inválidos', () => {
    const r = validarBusinessPartner({ ...BP, segmento: 'varejo', experiencia_b2b: '20-anos', whatsapp: '123', uf: 'ZZ', email: 'x@' });
    assert.match(r.erros.segmento, /Segmento inválido/);
    assert.match(r.erros.experiencia_b2b, /Experiência inválida/);
    assert.match(r.erros.whatsapp, /WhatsApp inválido/);
    assert.match(r.erros.uf, /UF inválida/);
    assert.match(r.erros.email, /E-mail inválido/);
    assert.equal(validarBusinessPartner({ ...BP, segmento: 'Construção Civil' }).dados.segmento, 'construcao-civil');
  });

  test('limites de tamanho', () => {
    const r = validarBusinessPartner({
      ...BP,
      empresa: 'e'.repeat(121),
      cargo: 'c'.repeat(81),
      perfil_empresas: 'p'.repeat(1001),
      mensagem: 'm'.repeat(2001)
    });
    assert.match(r.erros.empresa, /muito longo/);
    assert.match(r.erros.cargo, /muito longo/);
    assert.match(r.erros.perfil_empresas, /muito longa/);
    assert.match(r.erros.mensagem, /muito longa/);
    assert.match(validarBusinessPartner({ ...BP, perfil_empresas: 'curto' }).erros.perfil_empresas, /muito curta/);
    assert.equal(validarBusinessPartner({ ...BP, perfil_empresas: 'p'.repeat(10), mensagem: 'm'.repeat(2000) }).ok, true);
    assert.match(validarBusinessPartner({ ...BP, cargo: 'X' }).erros.cargo, /Cargo inválido/);
  });

  test('objeto/array onde se espera string → "Formato inválido."', () => {
    const r = validarBusinessPartner({ ...BP, segmento: ['agronegocio'], experiencia_b2b: { $ne: '' }, whatsapp: {}, cargo: [], mensagem: { a: 1 }, empresa: ['x'] });
    for (const campo of ['segmento', 'experiencia_b2b', 'whatsapp', 'cargo', 'mensagem', 'empresa']) {
      assert.equal(r.erros[campo], 'Formato inválido.', campo);
    }
  });
});

describe('ehRobo (honeypot)', () => {
  test('só dispara com o campo website preenchido', () => {
    assert.equal(ehRobo({}), false);
    assert.equal(ehRobo({ website: '' }), false);
    assert.equal(ehRobo({ website: '  ' }), false);
    assert.equal(ehRobo({ website: 'http://spam.example' }), true);
    assert.equal(ehRobo({ website: { a: 1 } }), true);
  });
});

// ---------- protocolo, documento, duplicidade ----------
describe('protocolo e documento', () => {
  test('protocolo: prefixo do programa, ano de São Paulo, 6 símbolos sem ambíguos', () => {
    const bytes = () => Buffer.from([0, 1, 2, 3, 30, 31]);
    assert.equal(gerarProtocolo('partner-lawyers', new Date('2026-10-17T12:00:00Z'), bytes), 'PL-2026-2345YZ');
    // 02:00 UTC de 1º/jan ainda é 31/dez em São Paulo.
    assert.equal(gerarProtocolo('business-partner', new Date('2027-01-01T02:00:00Z'), bytes), 'BP-2026-2345YZ');
    for (let i = 0; i < 200; i++) {
      const p = gerarProtocolo(i % 2 ? 'business-partner' : 'partner-lawyers');
      assert.match(p, PROTOCOLO_RE);
      assert.doesNotMatch(p.slice(-6), /[01IO]/);
    }
  });

  test('montarCandidatura: estado inicial, consentimento com finalidade, retenção de 24 meses', () => {
    const momento = new Date('2026-10-17T12:00:00Z');
    const { dados, fonte, comunicacoes } = validarPartnerLawyers(PL);
    const doc = montarCandidatura({ programa: 'partner-lawyers', dados, fonte, comunicacoes, momento, protocolo: 'PL-2026-ABCDEF' });
    assert.deepEqual(Object.keys(doc).sort(), [
      'comunicacoes', 'consentimento', 'createdAt', 'dados', 'email', 'fonte', 'historico', 'programa',
      'protocolo', 'responsavel', 'retencaoAte', 'status', 'updatedAt'
    ]);
    assert.equal(doc.status, 'recebido');
    assert.deepEqual(doc.historico, [{ status: 'recebido', em: momento, por: 'sistema' }]);
    assert.equal(doc.responsavel, null);
    assert.deepEqual(doc.consentimento, { aceito: true, em: momento, finalidade: 'avaliacao-candidatura-partner-lawyers' });
    assert.deepEqual(doc.comunicacoes, { aceito: false, em: null });
    assert.equal(doc.retencaoAte.toISOString(), '2028-10-17T12:00:00.000Z');
    assert.equal(doc.email, 'ana@souza.adv.br');
  });

  test('ehDuplicada: mesmo programa, < 24 h, não arquivada', () => {
    const agora = new Date('2026-10-18T12:00:00Z');
    const base = { programa: 'partner-lawyers', status: 'recebido', createdAt: new Date('2026-10-18T00:00:00Z') };
    assert.equal(ehDuplicada(base, 'partner-lawyers', agora), true);
    assert.equal(ehDuplicada(null, 'partner-lawyers', agora), false);
    assert.equal(ehDuplicada(base, 'business-partner', agora), false);
    assert.equal(ehDuplicada({ ...base, status: 'arquivada' }, 'partner-lawyers', agora), false);
    assert.equal(ehDuplicada({ ...base, createdAt: new Date('2026-10-17T11:59:00Z') }, 'partner-lawyers', agora), false);
    assert.equal(ehDuplicada({ ...base, status: 'reuniao' }, 'partner-lawyers', agora), true);
  });
});

// ---------- funil ----------
describe('funil — transições', () => {
  const h = (...estados) => estados.map(status => ({ status }));

  test('listas de estados exportadas', () => {
    assert.deepEqual(FUNIS['partner-lawyers'], ['recebido', 'validacao-profissional', 'avaliacao-institucional', 'reuniao', 'decisao', 'formalizacao']);
    assert.deepEqual(FUNIS['business-partner'], ['recebido', 'qualificacao', 'contato-comercial', 'reuniao', 'proposta-cooperacao', 'decisao']);
    assert.equal(estadosDoPrograma('business-partner').at(-1), 'arquivada');
    assert.deepEqual(estadosDoPrograma('x'), []);
  });

  test('transicoesPermitidas: próximo, anterior e arquivar', () => {
    assert.deepEqual(transicoesPermitidas('partner-lawyers', 'recebido'), ['validacao-profissional', 'arquivada']);
    assert.deepEqual(transicoesPermitidas('partner-lawyers', 'reuniao'), ['decisao', 'avaliacao-institucional', 'arquivada']);
    assert.deepEqual(transicoesPermitidas('partner-lawyers', 'formalizacao'), ['decisao', 'arquivada']);
    assert.deepEqual(transicoesPermitidas('business-partner', 'decisao'), ['proposta-cooperacao', 'arquivada']);
    assert.deepEqual(transicoesPermitidas('business-partner', 'validacao-profissional'), []);
  });

  test('validarTransicao: avançar/voltar um passo é válido; pular é 409', () => {
    const base = { programa: 'partner-lawyers', atual: 'validacao-profissional', historico: h('recebido', 'validacao-profissional') };
    assert.equal(validarTransicao({ ...base, novo: 'avaliacao-institucional' }).ok, true);
    assert.equal(validarTransicao({ ...base, novo: 'recebido' }).ok, true);
    const pulo = validarTransicao({ ...base, novo: 'reuniao' });
    assert.equal(pulo.ok, false);
    assert.equal(pulo.http, 409);
    assert.match(pulo.erro, /Transição inválida.*um passo por vez/);
    assert.equal(validarTransicao({ ...base, novo: 'validacao-profissional' }).http, 409);
    assert.equal(validarTransicao({ programa: 'partner-lawyers', atual: 'recebido', novo: 'formalizacao' }).http, 409);
  });

  test('status de outro programa ou inexistente → 400', () => {
    const r = validarTransicao({ programa: 'partner-lawyers', atual: 'recebido', novo: 'qualificacao' });
    assert.equal(r.http, 400);
    assert.match(r.campos.status, /Status inválido/);
    assert.equal(validarTransicao({ programa: 'business-partner', atual: 'recebido', novo: 'formalizacao' }).http, 400);
  });

  test('arquivar exige nota; vale de qualquer estado', () => {
    const semNota = validarTransicao({ programa: 'business-partner', atual: 'reuniao', novo: 'arquivada' });
    assert.equal(semNota.http, 400);
    assert.match(semNota.campos.nota, /motivo/);
    for (const atual of FUNIS['business-partner']) {
      assert.equal(validarTransicao({ programa: 'business-partner', atual, novo: 'arquivada', nota: 'Fora do perfil' }).ok, true, atual);
    }
  });

  test('reabrir só para o estado anterior ao arquivamento', () => {
    const historico = h('recebido', 'qualificacao', 'contato-comercial', 'arquivada', 'arquivada');
    assert.equal(estadoAnteriorAoArquivamento(historico), 'contato-comercial');
    assert.deepEqual(transicoesPermitidas('business-partner', 'arquivada', historico), ['contato-comercial']);
    assert.equal(validarTransicao({ programa: 'business-partner', atual: 'arquivada', novo: 'contato-comercial', historico }).ok, true);
    const errado = validarTransicao({ programa: 'business-partner', atual: 'arquivada', novo: 'recebido', historico });
    assert.equal(errado.http, 409);
    assert.match(errado.erro, /reaberta.*Contato comercial/);
    assert.equal(validarTransicao({ programa: 'business-partner', atual: 'arquivada', novo: 'qualificacao', historico: [] }).http, 409);
  });

  test('validarAtualizacao: tipos, nota 5–500, responsável e corpo vazio', () => {
    assert.equal(validarAtualizacao({}).vazio, true);
    assert.equal(validarAtualizacao({ status: { $set: 'x' } }).erros.status, 'Formato inválido.');
    assert.match(validarAtualizacao({ nota: 'oi' }).erros.nota, /muito curta/);
    assert.match(validarAtualizacao({ nota: 'n'.repeat(501) }).erros.nota, /muito longa/);
    assert.equal(validarAtualizacao({ status: 'Validação Profissional' }).dados.status, 'validacao-profissional');
    assert.equal(validarAtualizacao({ responsavel: null }).dados.responsavel, null);
    assert.equal(validarAtualizacao({ responsavel: '' }).dados.responsavel, null);
    assert.equal(validarAtualizacao({ responsavel: 'Daniel' }).dados.responsavel, 'Daniel');
    assert.equal(validarAtualizacao({ responsavel: ['a'] }).erros.responsavel, 'Formato inválido.');
  });
});

// ---------- e-mail ----------
describe('criarNotificadorParcerias', () => {
  const doc = () => {
    const { dados, fonte, comunicacoes } = validarPartnerLawyers({ ...PL, nome: 'Ana Souza' });
    return montarCandidatura({ programa: 'partner-lawyers', dados, fonte, comunicacoes, momento: new Date('2026-10-17T12:00:00Z'), protocolo: 'PL-2026-ABCDEF' });
  };

  test('sem chave ou destinatário → null (fallback: só grava e loga)', () => {
    assert.equal(criarNotificadorParcerias({}), null);
    assert.equal(criarNotificadorParcerias({ resendApiKey: 'k' }), null);
    assert.equal(criarNotificadorParcerias({ para: 'a@b.com' }), null);
    assert.equal(criarNotificadorParcerias({ resendApiKey: 'k', para: ' , ' }), null);
  });

  test('assunto por programa, sem quebra de linha', () => {
    assert.equal(assuntoEmailCandidatura(doc()), '[Partner Lawyers] Nova candidatura — Ana Souza');
    const bp = { programa: 'business-partner', dados: { nome: 'Fulano\r\nBcc: x@y.com' } };
    const assunto = assuntoEmailCandidatura(bp);
    assert.equal(assunto, '[Business Partner] Nova candidatura — Fulano Bcc: x@y.com');
    assert.doesNotMatch(assunto, /[\r\n]/);
  });

  test('chama o Resend com texto e reply_to; erro HTTP vira exceção', async () => {
    const chamadas = [];
    let status = 200;
    const fetchImpl = async (url, opts) => { chamadas.push({ url, opts }); return { ok: status < 300, status }; };
    const notificar = criarNotificadorParcerias({ resendApiKey: 'chave-teste', para: 'parcerias@x.com, b@x.com', fetchImpl });
    await notificar(doc());
    const corpo = JSON.parse(chamadas[0].opts.body);
    assert.equal(chamadas[0].url, 'https://api.resend.com/emails');
    assert.equal(chamadas[0].opts.headers.Authorization, 'Bearer chave-teste');
    assert.deepEqual(corpo.to, ['parcerias@x.com', 'b@x.com']);
    assert.equal(corpo.reply_to, 'ana@souza.adv.br');
    assert.match(corpo.text, /Protocolo: PL-2026-ABCDEF/);
    assert.match(corpo.text, /OAB: 123456\/SP/);
    assert.match(corpo.text, /Áreas: Tributário, Empresarial/);
    assert.equal('html' in corpo, false);
    status = 500;
    await assert.rejects(notificar(doc()), /HTTP 500/);
  });

  test('corpo do Business Partner com rótulos', () => {
    const { dados, fonte, comunicacoes } = validarBusinessPartner(BP);
    const txt = corpoEmailCandidatura(montarCandidatura({ programa: 'business-partner', dados, fonte, comunicacoes, momento: new Date(), protocolo: 'BP-2026-ABCDEF' }));
    assert.match(txt, /Segmento: Agronegócio/);
    assert.match(txt, /Experiência B2B: De 5 a 10 anos/);
    assert.match(txt, /WhatsApp: 5516999991234/);
    assert.match(txt, /Aceita comunicações institucionais: sim/);
  });
});

// ---------- HTTP (sem banco) ----------
function criarRepoMemoria() {
  const docs = [];
  let seq = 0;
  const repo = {
    docs,
    falharSalvar: false,
    falharBusca: false,
    segurarSalvar: null,
    antesDeAtualizar: null,
    async buscarDuplicada({ email, programa, desde }) {
      if (repo.falharBusca) throw new Error('sem banco');
      return docs
        .filter(d => d.email === email && d.programa === programa && d.createdAt >= desde && d.status !== 'arquivada')
        .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
    },
    async salvar(doc) {
      if (repo.segurarSalvar) await repo.segurarSalvar;
      if (repo.falharSalvar) throw new Error('sem banco');
      doc._id = `id-${++seq}`;
      docs.push(doc);
      return { insertedId: doc._id };
    },
    async listar({ programa, status, pular, limite }) {
      const f = docs
        .filter(d => d.programa === programa && (!status || d.status === status))
        .sort((a, b) => b.createdAt - a.createdAt);
      return { itens: f.slice(pular, pular + limite).map(d => structuredClone(d)), total: f.length };
    },
    async buscarPorProtocolo(protocolo) {
      const d = docs.find(x => x.protocolo === protocolo);
      return d ? structuredClone(d) : null;
    },
    async atualizarSeStatus(protocolo, statusAtual, { $set, $push }) {
      if (repo.antesDeAtualizar) repo.antesDeAtualizar(protocolo);
      const d = docs.find(x => x.protocolo === protocolo && x.status === statusAtual);
      if (!d) return null;
      Object.assign(d, $set);
      for (const [k, v] of Object.entries($push)) d[k].push(v);
      return structuredClone(d);
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

function cliente(base) {
  const req = (metodo, caminho, corpo, headers = {}) => fetch(base + caminho, {
    method: metodo,
    headers: corpo === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo))
  });
  return {
    post: (caminho, corpo, headers) => req('POST', caminho, corpo, headers),
    get: (caminho, headers) => req('GET', caminho, undefined, headers),
    patch: (caminho, corpo, headers) => req('PATCH', caminho, corpo, headers)
  };
}

function montarApp({ repo, notificar = null, throttle, relogio }) {
  const app = express();
  app.use('/api/parcerias', corpoParcerias());
  app.use(express.json({ limit: '1mb' }));
  app.use(usuarioDeTeste);
  app.use('/api/parcerias', criarRotaParcerias({
    ...repo,
    notificar,
    exigirAdmin: [requireAuth, requireAdmin],
    ...(throttle ? { throttle } : {}),
    agora: () => new Date(relogio.t),
    log: silencioso
  }));
  return app;
}

describe('POST /api/parcerias/* (HTTP, sem banco)', () => {
  let server;
  let api;
  const repo = criarRepoMemoria();
  const notificados = [];
  let falharEmail = false;
  const relogio = { t: Date.parse('2026-10-17T12:00:00Z') };
  let n = 0;
  const unico = () => `pessoa${++n}@exemplo.com.br`;

  before(async () => {
    const app = montarApp({
      repo,
      relogio,
      throttle: criarThrottle({ janelaMs: 60_000, max: 1000 }),
      notificar: async (c) => {
        if (falharEmail) throw new Error('resend fora');
        notificados.push(c);
      }
    });
    const s = await subir(app);
    server = s.server;
    api = cliente(s.base);
  });

  after(() => new Promise((ok) => server.close(ok)));

  test('partner-lawyers válido → 201 com protocolo; grava documento completo e notifica', async () => {
    const antes = repo.docs.length;
    const r = await api.post('/api/parcerias/partner-lawyers', { ...PL, email: 'ana@souza.adv.br' });
    assert.equal(r.status, 201);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.programa, 'partner-lawyers');
    assert.match(j.protocolo, /^PL-2026-[2-9A-HJ-NP-Z]{6}$/);
    assert.equal(j.id, repo.docs.at(-1)._id);
    assert.equal(repo.docs.length, antes + 1);
    const doc = repo.docs.at(-1);
    assert.equal(doc.protocolo, j.protocolo);
    assert.equal(doc.programa, 'partner-lawyers');
    assert.equal(doc.status, 'recebido');
    assert.equal(doc.dados.oab_numero, '123456');
    assert.equal(doc.fonte.pagina, '/pages/parcerias/partner-lawyers.html');
    assert.equal(doc.consentimento.finalidade, 'avaliacao-candidatura-partner-lawyers');
    // Nada de IP, user-agent nem referrer.
    const json = JSON.stringify(doc);
    assert.doesNotMatch(json, /127\.0\.0\.1|user-?agent|referr?er|"ip"/i);
    assert.equal(notificados.at(-1), doc);
  });

  test('business-partner válido → 201 com protocolo BP', async () => {
    const r = await api.post('/api/parcerias/business-partner', { ...BP, email: unico() });
    assert.equal(r.status, 201);
    const j = await r.json();
    assert.match(j.protocolo, /^BP-2026-/);
    assert.equal(j.programa, 'business-partner');
    const doc = repo.docs.at(-1);
    assert.deepEqual(doc.comunicacoes, { aceito: true, em: new Date(relogio.t) });
    assert.equal(doc.consentimento.finalidade, 'avaliacao-candidatura-business-partner');
  });

  test('formulário urlencoded (sem JS) com checkboxes repetidos', async () => {
    const corpo = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...PL, email: unico(), consentimento: 'on', comunicacoes: 'on' })) {
      if (Array.isArray(v)) v.forEach(x => corpo.append(k, x));
      else corpo.append(k, String(v));
    }
    corpo.append('areas', 'recuperacao-ativos');
    const r = await api.post('/api/parcerias/partner-lawyers', corpo.toString(), { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.equal(r.status, 201);
    assert.deepEqual(repo.docs.at(-1).dados.areas, ['tributario', 'empresarial', 'recuperacao-ativos']);
    assert.equal(repo.docs.at(-1).comunicacoes.aceito, true);
  });

  test('a rota define o programa: `programa` do corpo é ignorado', async () => {
    const r1 = await api.post('/api/parcerias/partner-lawyers', { ...PL, email: unico(), programa: 'business-partner' });
    assert.equal(r1.status, 201);
    assert.equal((await r1.json()).programa, 'partner-lawyers');
    assert.equal(repo.docs.at(-1).programa, 'partner-lawyers');
    assert.match(repo.docs.at(-1).protocolo, /^PL-/);
    assert.equal('programa' in repo.docs.at(-1).dados, false);

    const r2 = await api.post('/api/parcerias/business-partner', { ...BP, email: unico(), programa: 'partner-lawyers' });
    assert.equal(r2.status, 201);
    assert.equal(repo.docs.at(-1).programa, 'business-partner');
    assert.match(repo.docs.at(-1).protocolo, /^BP-/);

    // Campos de Partner Lawyers na rota de Business Partner não viram candidatura.
    const antes = repo.docs.length;
    const r3 = await api.post('/api/parcerias/business-partner', { ...PL, email: unico() });
    assert.equal(r3.status, 400);
    assert.equal(repo.docs.length, antes);
    assert.ok(repo.docs.every(d => d.protocolo.startsWith(d.programa === 'partner-lawyers' ? 'PL-' : 'BP-')));
  });

  test('inválido → 400 com campos em português, sem gravar', async () => {
    const antes = repo.docs.length;
    const r = await api.post('/api/parcerias/partner-lawyers', { ...PL, oab_numero: '12', uf: 'XX', email: { $gt: '' } });
    assert.equal(r.status, 400);
    const j = await r.json();
    assert.equal(j.error, 'Revise os campos indicados.');
    assert.match(j.campos.oab_numero, /OAB inválido/);
    assert.match(j.campos.uf, /UF inválida/);
    assert.equal(j.campos.email, 'Formato inválido.');
    assert.equal(repo.docs.length, antes);
  });

  test('JSON malformado → 400; corpo acima de 16 KB → 413', async () => {
    const r = await api.post('/api/parcerias/business-partner', '{"nome": ');
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /Não foi possível ler/);
    const grande = await api.post('/api/parcerias/partner-lawyers', { ...PL, apresentacao: 'a'.repeat(20_000) });
    assert.equal(grande.status, 413);
  });

  test('honeypot → 200 { ok:true } sem protocolo, sem gravar nem notificar', async () => {
    const g = repo.docs.length;
    const nn = notificados.length;
    for (const rota of ['partner-lawyers', 'business-partner']) {
      const r = await api.post(`/api/parcerias/${rota}`, { ...(rota === 'partner-lawyers' ? PL : BP), email: unico(), website: 'http://spam.example' });
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { ok: true });
    }
    assert.equal(repo.docs.length, g);
    assert.equal(notificados.length, nn);
  });

  test('duplicidade: mesmo e-mail + programa em 24 h devolve o protocolo existente', async () => {
    relogio.t = Date.parse('2026-10-17T12:00:00Z');
    const email = 'repetida@exemplo.com.br';
    const primeira = await (await api.post('/api/parcerias/partner-lawyers', { ...PL, email })).json();
    assert.ok(primeira.protocolo);

    relogio.t += 60 * 60 * 1000;
    const g = repo.docs.length;
    const nn = notificados.length;
    const r = await api.post('/api/parcerias/partner-lawyers', { ...PL, email: 'Repetida@Exemplo.com.br' });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, duplicada: true, protocolo: primeira.protocolo, programa: 'partner-lawyers' });
    assert.equal(repo.docs.length, g, 'não cria outra');
    assert.equal(notificados.length, nn, 'não notifica de novo');

    // Outro programa com o mesmo e-mail é outra candidatura.
    assert.equal((await api.post('/api/parcerias/business-partner', { ...BP, email })).status, 201);

    // Passadas 24 h, cria nova.
    relogio.t = Date.parse('2026-10-18T12:00:01Z');
    const nova = await api.post('/api/parcerias/partner-lawyers', { ...PL, email });
    assert.equal(nova.status, 201);
    const jn = await nova.json();
    assert.notEqual(jn.protocolo, primeira.protocolo);

    // Arquivada não conta como duplicada.
    repo.docs.find(d => d.protocolo === jn.protocolo).status = 'arquivada';
    relogio.t += 60_000;
    assert.equal((await api.post('/api/parcerias/partner-lawyers', { ...PL, email })).status, 201);
  });

  test('201 só depois de salvar confirmar', async () => {
    let liberar;
    repo.segurarSalvar = new Promise((ok) => { liberar = ok; });
    const antes = repo.docs.length;
    let respondeu = false;
    const pendente = api.post('/api/parcerias/business-partner', { ...BP, email: unico() }).then((r) => { respondeu = true; return r; });
    await new Promise((ok) => setTimeout(ok, 80));
    assert.equal(respondeu, false, 'respondeu antes do insert terminar');
    assert.equal(repo.docs.length, antes);
    repo.segurarSalvar = null;
    liberar();
    const r = await pendente;
    assert.equal(r.status, 201);
    assert.equal(repo.docs.length, antes + 1);
  });

  test('falha no banco → 503, nunca sucesso falso (insert e consulta de duplicidade)', async () => {
    const msg = 'Não foi possível registrar sua candidatura agora. Tente novamente em instantes.';
    repo.falharSalvar = true;
    try {
      const r = await api.post('/api/parcerias/partner-lawyers', { ...PL, email: unico() });
      assert.equal(r.status, 503);
      const j = await r.json();
      assert.equal(j.error, msg);
      assert.equal(j.ok, undefined);
      assert.equal(j.protocolo, undefined);
    } finally {
      repo.falharSalvar = false;
    }
    repo.falharBusca = true;
    try {
      const r = await api.post('/api/parcerias/business-partner', { ...BP, email: unico() });
      assert.equal(r.status, 503);
      assert.equal((await r.json()).error, msg);
    } finally {
      repo.falharBusca = false;
    }
  });

  test('falha só no e-mail → 201 (candidatura já gravada)', async () => {
    falharEmail = true;
    try {
      const antes = repo.docs.length;
      const r = await api.post('/api/parcerias/partner-lawyers', { ...PL, email: unico() });
      assert.equal(r.status, 201);
      assert.ok((await r.json()).protocolo);
      assert.equal(repo.docs.length, antes + 1);
    } finally {
      falharEmail = false;
    }
  });

  test('colisão de protocolo (E11000) sorteia outro', async () => {
    const app = express();
    const tentativas = [];
    let chamadas = 0;
    app.use('/api/parcerias', corpoParcerias(), criarRotaParcerias({
      ...criarRepoMemoria(),
      salvar: async (doc) => {
        tentativas.push(doc.protocolo);
        if (++chamadas === 1) {
          const e = new Error('E11000 duplicate key error index: uq_parcerias_protocolo dup key: { protocolo: "x" }');
          e.code = 11000;
          throw e;
        }
        return { insertedId: 'ok' };
      },
      gerar: (p, m) => gerarProtocolo(p, m, () => Buffer.from([chamadas, 0, 0, 0, 0, 0])),
      exigirAdmin: [requireAdmin],
      log: silencioso
    }));
    const s = await subir(app);
    try {
      const r = await cliente(s.base).post('/api/parcerias/business-partner', BP);
      assert.equal(r.status, 201);
      assert.equal(tentativas.length, 2);
      assert.notEqual(tentativas[0], tentativas[1]);
      assert.equal((await r.json()).protocolo, tentativas[1]);
    } finally {
      await new Promise((ok) => s.server.close(ok));
    }
  });
});

describe('throttle das parcerias (padrão real: 5 por IP em 15 min)', () => {
  test('6º envio → 429 com Retry-After; contadores separados dos do /api/contato', async () => {
    assert.deepEqual({ ...THROTTLE_PADRAO }, { janelaMs: 15 * 60 * 1000, max: 5 });
    const app = express();
    app.use('/api/contato', corpoContato());
    app.use('/api/parcerias', corpoParcerias());
    app.use('/api/contato', criarRotaContato({ salvar: async () => ({ insertedId: 'c1' }), log: silencioso }));
    // Sem `throttle` injetado: usa o padrão do módulo.
    app.use('/api/parcerias', criarRotaParcerias({ ...criarRepoMemoria(), exigirAdmin: [requireAdmin], log: silencioso }));
    const s = await subir(app);
    const api = cliente(s.base);
    try {
      const status = [];
      for (let i = 0; i < 5; i++) {
        const rota = i % 2 ? 'business-partner' : 'partner-lawyers';
        const corpo = i === 4 ? { website: 'bot' } : { ...(i % 2 ? BP : PL), email: `t${i}@exemplo.com` };
        status.push((await api.post(`/api/parcerias/${rota}`, corpo)).status);
      }
      assert.deepEqual(status, [201, 201, 201, 201, 200]);
      const sexto = await api.post('/api/parcerias/business-partner', { ...BP, email: 't6@exemplo.com' });
      assert.equal(sexto.status, 429);
      assert.ok(Number(sexto.headers.get('retry-after')) > 0);
      assert.match((await sexto.json()).error, /Aguarde/);
      // O contato tem a própria janela: não foi afetado.
      const contato = await api.post('/api/contato', {
        nome: 'Maria Silva', email: 'maria@ex.com', perfil: 'investidor', eixo: 'E1',
        mensagem: 'Mensagem de teste suficiente.', consentimento: true
      });
      assert.equal(contato.status, 201);
    } finally {
      await new Promise((ok) => s.server.close(ok));
    }
  });
});

describe('admin /api/parcerias/admin/candidaturas (HTTP, sem banco)', () => {
  let server;
  let api;
  const repo = criarRepoMemoria();
  const relogio = { t: Date.parse('2026-10-17T12:00:00Z') };
  const ADMIN = { 'x-teste-papel': 'admin' };
  const ALUNO = { 'x-teste-papel': 'aluno' };
  let protocoloPL;

  before(async () => {
    // 30 de Partner Lawyers + 3 de Business Partner, em minutos diferentes.
    for (let i = 0; i < 33; i++) {
      const programa = i < 30 ? 'partner-lawyers' : 'business-partner';
      const corpo = programa === 'partner-lawyers' ? { ...PL, email: `pl${i}@ex.com` } : { ...BP, email: `bp${i}@ex.com` };
      const { dados, fonte, comunicacoes } = validarCandidatura(programa, corpo);
      const momento = new Date(Date.parse('2026-10-01T12:00:00Z') + i * 60_000);
      await repo.salvar(montarCandidatura({ programa, dados, fonte, comunicacoes, momento, protocolo: gerarProtocolo(programa, momento) }));
    }
    protocoloPL = repo.docs[29].protocolo;
    const s = await subir(montarApp({ repo, relogio, throttle: criarThrottle({ janelaMs: 60_000, max: 1000 }) }));
    server = s.server;
    api = cliente(s.base);
  });

  after(() => new Promise((ok) => server.close(ok)));

  const lista = '/api/parcerias/admin/candidaturas?programa=partner-lawyers';
  const det = () => `/api/parcerias/admin/candidaturas/${protocoloPL}`;

  test('sem sessão → 401; sem papel de admin → 403 (lista, detalhe e PATCH)', async () => {
    for (const headers of [{}, ALUNO]) {
      const esperado = headers === ALUNO ? 403 : 401;
      const respostas = [
        await api.get(lista, headers),
        await api.get(det(), headers),
        await api.patch(det(), { status: 'validacao-profissional' }, headers)
      ];
      for (const r of respostas) {
        assert.equal(r.status, esperado);
        const j = await r.json();
        assert.equal(j.itens, undefined);
        assert.equal(j.candidatura, undefined);
      }
    }
    assert.equal(repo.docs[29].status, 'recebido', 'PATCH negado não altera nada');
  });

  test('lista: 25 por página, mais recentes primeiro, com estados e sem textos longos', async () => {
    const r = await api.get(lista, ADMIN);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.porPagina, POR_PAGINA);
    assert.equal(j.itens.length, 25);
    assert.equal(j.total, 30);
    assert.equal(j.totalPaginas, 2);
    assert.deepEqual(j.estados, estadosDoPrograma('partner-lawyers'));
    assert.equal(j.rotulos['validacao-profissional'], 'Validação profissional');
    assert.equal(j.itens[0].protocolo, protocoloPL, 'mais recente primeiro');
    assert.ok(j.itens.every(i => i.programa === 'partner-lawyers'));
    assert.equal(j.itens[0].dados.apresentacao, undefined);
    assert.equal(j.itens[0].historico, undefined);
    assert.equal(typeof j.itens[0].id, 'string');

    const p2 = await (await api.get(`${lista}&pagina=2`, ADMIN)).json();
    assert.equal(p2.itens.length, 5);
    assert.equal(p2.pagina, 2);

    const bp = await (await api.get('/api/parcerias/admin/candidaturas?programa=business-partner', ADMIN)).json();
    assert.equal(bp.total, 3);
    assert.equal(bp.estados.includes('qualificacao'), true);
  });

  test('lista: programa obrigatório; status validado contra o funil do programa', async () => {
    assert.equal((await api.get('/api/parcerias/admin/candidaturas', ADMIN)).status, 400);
    assert.equal((await api.get('/api/parcerias/admin/candidaturas?programa=outro', ADMIN)).status, 400);
    const r = await api.get(`${lista}&status=qualificacao`, ADMIN);
    assert.equal(r.status, 400);
    assert.match((await r.json()).campos.status, /Status inválido/);
    const ok = await (await api.get(`${lista}&status=recebido`, ADMIN)).json();
    assert.equal(ok.total, 30);
  });

  test('detalhe: documento completo + transições permitidas; 404 para protocolo inexistente', async () => {
    const r = await api.get(det(), ADMIN);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.candidatura.protocolo, protocoloPL);
    assert.ok(j.candidatura.dados.apresentacao);
    assert.equal(j.candidatura.historico.length, 1);
    assert.deepEqual(j.permitidos, ['validacao-profissional', 'arquivada']);
    assert.equal((await api.get('/api/parcerias/admin/candidaturas/PL-2026-ZZZZZZ', ADMIN)).status, 404);
    assert.equal((await api.get('/api/parcerias/admin/candidaturas/qualquer-coisa', ADMIN)).status, 404);
    // Protocolo em minúsculas é aceito.
    assert.equal((await api.get(det().toLowerCase(), ADMIN)).status, 200);
  });

  test('PATCH: percorre o funil, registra histórico e barra transição inválida', async () => {
    relogio.t = Date.parse('2026-10-17T13:00:00Z');
    const avancar = await api.patch(det(), { status: 'validacao-profissional', nota: 'OAB conferida no CNA.', programa: 'business-partner' }, ADMIN);
    assert.equal(avancar.status, 200);
    const j = await avancar.json();
    assert.equal(j.candidatura.status, 'validacao-profissional');
    assert.equal(j.candidatura.programa, 'partner-lawyers', 'programa do corpo é ignorado');
    const ultimo = j.candidatura.historico.at(-1);
    assert.deepEqual(ultimo, {
      status: 'validacao-profissional', de: 'recebido', em: '2026-10-17T13:00:00.000Z',
      por: 'admin@dmc.test', nota: 'OAB conferida no CNA.'
    });
    assert.equal(j.candidatura.updatedAt, '2026-10-17T13:00:00.000Z');
    assert.deepEqual(j.permitidos, ['avaliacao-institucional', 'recebido', 'arquivada']);

    const pulo = await api.patch(det(), { status: 'reuniao' }, ADMIN);
    assert.equal(pulo.status, 409);
    assert.match((await pulo.json()).error, /Transição inválida/);

    const mesmo = await api.patch(det(), { status: 'validacao-profissional' }, ADMIN);
    assert.equal(mesmo.status, 409);

    const outroPrograma = await api.patch(det(), { status: 'qualificacao' }, ADMIN);
    assert.equal(outroPrograma.status, 400);

    const voltar = await api.patch(det(), { status: 'recebido', nota: 'Documento ilegível.' }, ADMIN);
    assert.equal(voltar.status, 200);
    assert.equal((await api.patch(det(), { status: 'validacao-profissional' }, ADMIN)).status, 200);
    assert.equal((await api.patch(det(), { status: 'avaliacao-institucional' }, ADMIN)).status, 200);
  });

  test('PATCH: arquivar exige nota; reabrir só para o estado anterior', async () => {
    const semNota = await api.patch(det(), { status: 'arquivada' }, ADMIN);
    assert.equal(semNota.status, 400);
    assert.match((await semNota.json()).campos.nota, /motivo/);
    const notaCurta = await api.patch(det(), { status: 'arquivada', nota: 'não' }, ADMIN);
    assert.equal(notaCurta.status, 400);

    const arquivar = await api.patch(det(), { status: 'arquivada', nota: 'Sem disponibilidade na região.' }, ADMIN);
    assert.equal(arquivar.status, 200);
    const ja = await arquivar.json();
    assert.equal(ja.candidatura.status, 'arquivada');
    assert.deepEqual(ja.permitidos, ['avaliacao-institucional']);

    // Nota depois de arquivada não muda o estado anterior registrado.
    assert.equal((await api.patch(det(), { nota: 'Candidato avisado por e-mail.' }, ADMIN)).status, 200);

    const reabrirErrado = await api.patch(det(), { status: 'recebido' }, ADMIN);
    assert.equal(reabrirErrado.status, 409);
    assert.match((await reabrirErrado.json()).error, /reaberta.*Avaliação institucional/);

    const reabrir = await api.patch(det(), { status: 'avaliacao-institucional', nota: 'Abriu vaga na região.' }, ADMIN);
    assert.equal(reabrir.status, 200);
    assert.equal((await reabrir.json()).candidatura.status, 'avaliacao-institucional');
  });

  test('PATCH: responsável, corpo vazio, tipos inválidos, 404 e concorrência', async () => {
    const resp = await api.patch(det(), { responsavel: 'Daniel Mathias' }, ADMIN);
    assert.equal(resp.status, 200);
    const j = await resp.json();
    assert.equal(j.candidatura.responsavel, 'Daniel Mathias');
    assert.equal(j.candidatura.status, 'avaliacao-institucional');
    assert.equal(j.candidatura.historico.at(-1).responsavel, 'Daniel Mathias');

    assert.equal((await api.patch(det(), {}, ADMIN)).status, 400);
    const tipo = await api.patch(det(), { status: { $set: 'decisao' } }, ADMIN);
    assert.equal(tipo.status, 400);
    assert.equal((await tipo.json()).campos.status, 'Formato inválido.');
    assert.equal((await api.patch('/api/parcerias/admin/candidaturas/BP-2026-ZZZZZZ', { status: 'qualificacao' }, ADMIN)).status, 404);

    // Outro administrador mudou o status entre a leitura e a escrita.
    repo.antesDeAtualizar = (p) => { repo.docs.find(d => d.protocolo === p).status = 'reuniao'; };
    try {
      const r = await api.patch(det(), { status: 'reuniao' }, ADMIN);
      assert.equal(r.status, 409);
      assert.match((await r.json()).error, /alterada por outra pessoa/);
    } finally {
      repo.antesDeAtualizar = null;
    }
  });

  test('não existe rota admin para criar candidatura', async () => {
    const r = await api.post('/api/parcerias/admin/candidaturas', { ...PL, programa: 'partner-lawyers' }, ADMIN);
    assert.equal(r.status, 404);
    assert.equal(Object.keys(PROGRAMAS).length, 2);
  });
});
