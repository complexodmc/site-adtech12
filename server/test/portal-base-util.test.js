// Portal · F0a — módulos puros e de erro (validacao, codigos, cripto, totp,
// csv, erros, config-portal) e o apoio de teste (banco em memória, fixtures,
// falsos, http). Casos da PORTAL-API §9.3 (linha portal-base-util) e do
// critério G0-a da F0a (índice §8.5). Nenhum Mongo, nenhuma rede.
// Rode com `npm test` na raiz.
import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { ObjectId, Binary } from 'mongodb';
import { createHash, createHmac, hkdfSync } from 'node:crypto';

import * as V from '../src/portal/validacao.js';
import * as C from '../src/portal/codigos.js';
import * as K from '../src/portal/cripto.js';
import * as T from '../src/portal/totp.js';
import * as CSV from '../src/portal/csv.js';
import * as E from '../src/portal/erros.js';
import * as CFG from '../src/portal/config-portal.js';
import { texto as textoContato, EMAIL_RE as EMAIL_CONTATO } from '../src/routes/contato.js';
import { truncarIp as truncarIpNewsletter } from '../src/routes/newsletter.js';
import { UFS as UFS_BOLSAS } from '../src/routes/bolsas.js';
import { criarBancoMemoria, INDICES_LEGADOS, erroDeRede } from './apoio/banco-memoria.js';
import {
  semear, IDS, oid, idDe, MATERIAL_TESTE, SEGREDO_TOTP_FIXTURE, CODIGOS_RECUPERACAO_FIXTURE, SENHA_FIXTURE
} from './apoio/fixtures-portal.js';
import {
  silencioso, criarLogEspiao, relogio, bytesFixos, randomInt, gerarCpfValido, fetchFalso, provedorGeminiFalso,
  servicosFalsos, pdfMinimo, pdfComJavascript, pngMinimo, pngComTexto, jpegMinimo, jpegComExif, webpMinimo,
  webpComExif, htmlDisfarcado
} from './apoio/falsos.js';
import { subir, fechar, cliente, criarAppDeTeste, usuarioDeTeste } from './apoio/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATERIAL = 'material-fixo-de-teste';
const MATERIAL_ANTIGO = 'material-anterior-de-teste';

/** Captura o ErroPortal lançado por fn. */
function pegarErro(fn) {
  try { fn(); } catch (e) { return e; }
  assert.fail('esperava um erro');
}

// =============================================================
// validacao.js
// =============================================================
describe('validacao — reexportações e leitores', () => {
  test('texto, EMAIL_RE e truncarIp são os mesmos dos formulários do site', () => {
    assert.equal(V.texto, textoContato);
    assert.equal(V.EMAIL_RE, EMAIL_CONTATO);
    assert.equal(V.truncarIp, truncarIpNewsletter);
    assert.deepEqual([...V.UFS], [...UFS_BOLSAS]);
    assert.equal(V.UFS.length, 27);
  });

  test('lerTexto normaliza, aplica min/max e obrigatório', () => {
    assert.equal(V.lerTexto({ nome: '  Ana\u0000  Maria ' }, 'nome', { max: 120 }), 'Ana Maria');
    assert.equal(V.lerTexto({}, 'nome'), null);
    assert.equal(V.lerTexto({ nome: '' }, 'nome'), null);
    assert.equal(V.lerTexto({ n: 12 }, 'n'), '12');
    assert.equal(V.lerTexto({ t: 'a\r\n\r\n\r\n\r\nb' }, 't', { multilinha: true }), 'a\n\nb');
    const obrig = pegarErro(() => V.lerTexto({}, 'nome', { obrigatorio: true }));
    assert.ok(obrig instanceof E.ErroPortal);
    assert.equal(obrig.status, 400);
    assert.equal(obrig.codigo, 'validacao');
    assert.equal(obrig.message, 'Confira os campos destacados.');
    assert.deepEqual(Object.keys(obrig.extras.campos), ['nome']);
    assert.match(pegarErro(() => V.lerTexto({ nome: 'A' }, 'nome', { min: 2 })).extras.campos.nome, /pelo menos 2/);
    assert.match(pegarErro(() => V.lerTexto({ nome: 'ação' }, 'nome', { max: 3 })).extras.campos.nome, /no máximo 3/);
    assert.equal(V.lerTexto({ nome: 'ação' }, 'nome', { max: 4 }), 'ação', 'conta caracteres, não bytes');
  });

  test('objeto, array ou booleano onde se espera texto → 400 formato-invalido (injeção de operador)', () => {
    for (const v of [{ $gt: '' }, ['a'], true, false]) {
      const e = pegarErro(() => V.lerTexto({ email: v }, 'email'));
      assert.equal(e.status, 400);
      assert.equal(e.codigo, 'formato-invalido');
    }
  });

  test('lerEnum, lerInteiro, lerNumero, lerBooleano', () => {
    assert.equal(V.lerEnum('b', ['a', 'b'], 'x'), 'b');
    assert.equal(V.lerEnum('b', { a: 1, b: 2 }, 'x'), 'b');
    assert.equal(V.lerEnum(undefined, ['a'], 'x'), null);
    assert.equal(pegarErro(() => V.lerEnum('c', ['a'], 'x')).codigo, 'validacao');
    assert.equal(pegarErro(() => V.lerEnum({ $ne: 'a' }, ['a'], 'x')).codigo, 'formato-invalido');
    assert.equal(pegarErro(() => V.lerEnum('', ['a'], 'x', { obrigatorio: true })).codigo, 'validacao');

    assert.equal(V.lerInteiro('12', { min: 1, max: 20 }, 'n'), 12);
    assert.equal(V.lerInteiro(7, {}, 'n'), 7);
    assert.equal(V.lerInteiro(undefined, {}, 'n'), null);
    assert.equal(pegarErro(() => V.lerInteiro('1.5', {}, 'n')).codigo, 'validacao');
    assert.equal(pegarErro(() => V.lerInteiro(21, { min: 1, max: 20 }, 'n')).extras.campos.n, 'Use um valor entre 1 e 20.');
    assert.equal(pegarErro(() => V.lerInteiro({}, {}, 'n')).codigo, 'formato-invalido');

    assert.equal(V.lerNumero('7,5', { min: 0, max: 10 }, 'nota'), 7.5);
    assert.equal(V.lerNumero(6.95, { casas: 1 }, 'nota'), 7);
    assert.equal(pegarErro(() => V.lerNumero('abc', {}, 'nota')).codigo, 'validacao');

    assert.equal(V.lerBooleano(true, 'b'), true);
    assert.equal(V.lerBooleano('false', 'b'), false);
    assert.equal(V.lerBooleano(undefined, 'b'), null);
    assert.equal(pegarErro(() => V.lerBooleano('sim', 'b')).codigo, 'formato-invalido');
    assert.equal(pegarErro(() => V.lerBooleano({ $exists: true }, 'b')).codigo, 'formato-invalido');
  });

  test('lerId, lerIdLegado e lerPagina', () => {
    const id = V.lerId('64a1b2c3d4e5f60718293a4b');
    assert.ok(id instanceof ObjectId);
    assert.equal(id.toHexString(), '64a1b2c3d4e5f60718293a4b');
    for (const ruim of ['64A1B2C3D4E5F60718293A4B', 'abc', '', null, { $gt: '' }, 123]) assert.equal(V.lerId(ruim), null);
    assert.equal(V.lerIdLegado('curso-01'), 'curso-01');
    assert.equal(V.lerIdLegado('a'.repeat(65)), null);
    assert.equal(V.lerIdLegado('../x'), null);
    assert.equal(V.lerIdLegado({ $ne: 1 }), null);
    assert.deepEqual(V.lerPagina({ pagina: '3', porPagina: '10' }), { pagina: 3, porPagina: 10, pular: 20 });
    assert.deepEqual(V.lerPagina({ pagina: '-1', porPagina: '500' }), { pagina: 1, porPagina: 25, pular: 0 });
    assert.deepEqual(V.lerPagina({ pagina: { $gt: 1 } }, { porPaginaPadrao: 50 }), { pagina: 1, porPagina: 50, pular: 0 });
  });
});

describe('validacao — documentos, datas, contato e endereço', () => {
  test('CPF: gerado válido, com máscara, DV errado, repetidos, tipos', () => {
    for (const semente of ['a', 'b', 'c', 'd', 'e']) {
      const cpf = gerarCpfValido(semente);
      assert.equal(V.validarCpf(cpf), cpf);
      const mascara = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
      assert.equal(V.validarCpf(mascara), cpf);
      const dvErrado = cpf.slice(0, 10) + String((Number(cpf[10]) + 1) % 10);
      assert.equal(V.validarCpf(dvErrado), null);
    }
    for (const ruim of ['111.111.111-11', '00000000000', '123', '1234567890a', '', 12345678909, null]) assert.equal(V.validarCpf(ruim), null);
  });

  test('CNPJ e passaporte', () => {
    const dv = (base) => {
      const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const r = [...base].reduce((a, c, i) => a + Number(c) * pesos[i], 0) % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const base = '112223330001';
    const d1 = dv(base);
    const cnpj = base + d1 + dv(base + d1);
    assert.equal(V.validarCnpj(cnpj), cnpj);
    assert.equal(V.validarCnpj(`${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`), cnpj);
    assert.equal(V.validarCnpj(cnpj.slice(0, 13) + ((Number(cnpj[13]) + 1) % 10)), null);
    assert.equal(V.validarCnpj('11111111111111'), null);
    assert.equal(V.validarPassaporte(' fp 123-456 '), 'FP123456');
    assert.equal(V.validarPassaporte('ab1'), null);
    assert.equal(V.validarPassaporte('A'.repeat(21)), null);
  });

  test('datas de calendário (30/02, bissexto, faixa) e fuso de São Paulo', () => {
    assert.equal(V.validarDataCalendario('2026-02-30'), null);
    assert.equal(V.validarDataCalendario('2026-02-29'), null);
    assert.equal(V.validarDataCalendario('2024-02-29'), '2024-02-29');
    assert.equal(V.validarDataCalendario('2026-13-01'), null);
    assert.equal(V.validarDataCalendario('18/10/2026'), null);
    assert.equal(V.validarDataCalendario('2026-10-18', { min: '2026-10-19' }), null);
    assert.equal(V.validarDataCalendario('2026-10-18', { max: '2026-10-17' }), null);
    assert.equal(V.validarDataCalendario('2026-10-18', { min: '2026-10-18', max: '2026-10-18' }), '2026-10-18');
    const noite = new Date('2026-12-31T23:30:00-03:00');
    assert.equal(V.hojeSP(noite), '2026-12-31');
    assert.equal(V.anoSP(noite), 2026, '31/12 23h30 em SP ainda é 2026 (UTC já é 2027)');
    assert.equal(V.hojeSP(new Date('2026-10-19T02:00:00Z')), '2026-10-18');
  });

  test('CEP, Instagram e Facebook', () => {
    assert.equal(V.validarCep('01310-100'), '01310100');
    assert.equal(V.validarCep('01310100'), '01310100');
    for (const ruim of ['0131-0100', '00000-000', 'abcde-fgh', '', null]) assert.equal(V.validarCep(ruim), null);
    assert.equal(V.validarInstagram('@joana.silva_'), 'joana.silva_');
    assert.equal(V.validarInstagram('Joana'), 'Joana');
    assert.equal(V.validarInstagram('a'.repeat(31)), null);
    assert.equal(V.validarInstagram('joana silva'), null);
    assert.equal(V.validarInstagram('https://instagram.com/joana'), null);
    assert.equal(V.validarFacebook('joana.silva'), 'joana.silva');
    assert.equal(V.validarFacebook('https://www.facebook.com/joana.silva/'), 'joana.silva');
    assert.equal(V.validarFacebook('facebook.com/profile.php?id=100012345678'), 'profile.php?id=100012345678');
    assert.equal(V.validarFacebook('https://evil.example/joana'), null);
    assert.equal(V.validarFacebook('https://user:pw@facebook.com/joana'), null);
    assert.equal(V.validarFacebook('facebook.com'), null);
  });

  test('validarCelular: +55 com e sem +, +351, +1; 7 dígitos → null', () => {
    assert.equal(V.validarCelular('+55 (11) 98765-4321'), '+5511987654321');
    assert.equal(V.validarCelular('55 11 98765-4321'), '+5511987654321');
    assert.equal(V.validarCelular('11987654321'), '+5511987654321');
    assert.equal(V.validarCelular('(21) 3456-7890'), '+552134567890', 'fixo com 8 dígitos');
    assert.equal(V.validarCelular('+351 912 345 678'), '+351912345678');
    assert.equal(V.validarCelular('+1 202 555 0123'), '+12025550123');
    assert.equal(V.validarCelular('0044 7911 123456'), '+447911123456');
    assert.equal(V.validarCelular('1234567'), null);
    assert.equal(V.validarCelular('+1234567'), null);
    assert.equal(V.validarCelular('+55 20 98765-4321'), null, 'DDD 20 não existe');
    assert.equal(V.validarCelular('+55 11 88765-4321'), null, 'celular com 9 dígitos começa por 9');
    assert.equal(V.validarCelular('+1234567890123456'), null, 'mais de 15 dígitos');
    assert.equal(V.validarCelular('abc'), null);
  });

  test('ehBrasil e validarCodigoPostal (exterior)', () => {
    for (const p of [undefined, null, '', 'Brasil', ' BRASIL ', 'brazil']) assert.equal(V.ehBrasil(p), true, String(p));
    for (const p of ['Portugal', 'Brasilia do Sul', 5]) assert.equal(V.ehBrasil(p), false, String(p));
    assert.equal(V.validarCodigoPostal('1000-001'), '1000-001');
    assert.equal(V.validarCodigoPostal(' sw1a   1aa '), 'SW1A 1AA');
    assert.equal(V.validarCodigoPostal('ab'), null);
    assert.equal(V.validarCodigoPostal('<script>'), null);
    assert.equal(V.validarCodigoPostal('---'), null);
    assert.equal(V.validarCodigoPostal('1234567890123'), null);
  });
});

describe('validacao — mascaramento, URLs, busca e nomes', () => {
  test('mascararDadosPessoais: CPF com/sem máscara, RG, cartão, e-mail, telefone; datas preservadas', () => {
    const cpf = gerarCpfValido('masc');
    const cpfMasc = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    const entrada = `cpf ${cpfMasc} e ${cpf}; rg 12.345.678-9; rg2 12.345.678-X; cartão 4111 1111 1111 1111 e 4111-1111-1111-1111;`
      + ` email joana.silva@exemplo.com.br; tel (11) 98765-4321; conta 1234567; data 2026-10-18; turma APE-2026-01; nota 7,5`;
    const { texto: saida, mascarado } = V.mascararDadosPessoais(entrada);
    assert.equal(mascarado, true);
    assert.ok(!saida.includes(cpf) && !saida.includes(cpfMasc), saida);
    assert.equal((saida.match(/\[CPF\]/g) || []).length, 2, saida);
    assert.ok(!/12\.345\.678/.test(saida), saida);
    assert.ok(!/4111/.test(saida), saida);
    assert.ok(!/joana|exemplo\.com/.test(saida), saida);
    assert.ok(saida.includes('[E-MAIL]'));
    assert.ok(!/98765/.test(saida) && !/1234567/.test(saida), saida);
    assert.ok(saida.includes('2026-10-18'), 'data ISO preservada');
    assert.ok(saida.includes('APE-2026-01'), 'código de turma preservado');
    assert.ok(saida.includes('7,5'));
    assert.deepEqual(V.mascararDadosPessoais('nada pessoal aqui'), { texto: 'nada pessoal aqui', mascarado: false });
    assert.equal(V.mascararDadosPessoais('a.b@x.com.br, j@k.com. fim; e@f; @g.com').texto, '[E-MAIL], [E-MAIL]. fim; e@f; @g.com');
  });

  test('mascararDadosPessoais é linear (sem ReDoS) em textos longos', () => {
    for (const s of ['a'.repeat(200_000), '1'.repeat(200_000) + 'x', 'a@'.repeat(100_000), 'a@' + 'a.'.repeat(100_000) + '!', '1.'.repeat(100_000)]) {
      const inicio = performance.now();
      V.mascararDadosPessoais(s);
      assert.ok(performance.now() - inicio < 1500, `lento demais para ${s.slice(0, 6)}…`);
    }
  });

  test('validarUrlHttps e validarLinkInterno', () => {
    assert.equal(V.validarUrlHttps('https://exemplo.invalid/a?b=1'), 'https://exemplo.invalid/a?b=1');
    for (const ruim of ['http://exemplo.invalid', 'javascript:alert(1)', 'https://u:p@exemplo.invalid', `https://x.invalid/${'a'.repeat(500)}`, 'ftp://x', '', { href: 'https://x' }]) {
      assert.equal(V.validarUrlHttps(ruim), null, String(ruim).slice(0, 40));
    }
    for (const ok of ['perfil.html', 'perfil.html#seguranca', 'aula.html?id=c01-m01-a01#duvidas', 'professor.html#/atendimento/ATD-2026-ABCDEF']) {
      assert.equal(V.validarLinkInterno(ok), ok);
    }
    for (const ruim of ['//x', '//evil.example/a.html', 'javascript:alert(1)', 'https://x.invalid/a.html', '../a.html', '/perfil.html', 'Perfil.html', 'a.html?x=1 2']) {
      assert.equal(V.validarLinkInterno(ruim), null, ruim);
    }
  });

  test('regexBusca: escapada, sem acento, limites, objeto → null', () => {
    const [r] = V.regexBusca('.*');
    assert.equal(r.test('qualquer coisa'), false, '.* vira literal');
    assert.equal(r.test('a.*b'), true);
    assert.doesNotThrow(() => V.regexBusca('(('));
    assert.equal(V.regexBusca('('), null, '1 caractere');
    assert.equal(V.regexBusca('((')[0].test('a((b'), true);
    assert.equal(V.regexBusca('$where')[0].test('$where'), true);
    assert.equal(V.regexBusca('$where')[0].test('where'), false);
    assert.equal(V.regexBusca({ $gt: '' }), null);
    assert.equal(V.regexBusca(['a', 'b']), null);
    assert.equal(V.regexBusca('a'), null);
    assert.equal(V.regexBusca('x'.repeat(81)), null);
    assert.equal(V.regexBusca('acao')[0].test('Introdução à AÇÃO'), true);
    assert.equal(V.regexBusca('Ação')[0].test('acao penal'), true);
    assert.equal(V.regexBusca('um dois tres quatro cinco seis sete').length, 5);
    for (const re of V.regexBusca('holding (familiar) [teste]')) assert.equal(re.flags.includes('i'), true);
  });

  test('normalizarNome e iniciais', () => {
    assert.equal(V.normalizarNome('  José   da  SILVA '), 'jose da silva');
    assert.equal(V.iniciais('Joana da Silva'), 'J. S.');
    assert.equal(V.iniciais('Ícaro'), 'Í.');
    assert.equal(V.iniciais('  maria  luiza  de souza '), 'M. S.');
    assert.equal(V.iniciais(''), '');
    assert.equal(V.iniciais(null), '');
  });
});

// =============================================================
// codigos.js
// =============================================================
describe('codigos — formatos e alfabeto', () => {
  test('alfabeto de 32 símbolos sem 0/1/I/O', () => {
    assert.equal(C.ALFABETO.length, 32);
    assert.equal(new Set(C.ALFABETO).size, 32);
    assert.ok(!/[01IO]/.test(C.ALFABETO));
  });

  test('MAT/ATD/OUV com ano de SP (31/12 23h30 → ano corrente)', () => {
    const noite = new Date('2026-12-31T23:30:00-03:00');
    for (const p of ['MAT', 'ATD', 'OUV']) {
      const c = C.codigoAnual(p, noite);
      assert.match(c, C.CODIGO_ANUAL_RE[p]);
      assert.ok(c.startsWith(`${p}-2026-`), c);
    }
    assert.throws(() => C.codigoAnual('XYZ'), RangeError);
  });

  test('DEC/FRQ/AVL/CTR e regex do certificado legado', () => {
    for (const p of ['DEC', 'FRQ', 'AVL', 'CTR']) assert.match(C.codigoVerificacao(p), C.CODIGO_VERIFICACAO_RE);
    assert.throws(() => C.codigoVerificacao('DMC'), RangeError);
    assert.match('DMC-2345-ABCD', C.CODIGO_CERTIFICADO_RE);
    assert.doesNotMatch('DMC-0345-ABCD', C.CODIGO_CERTIFICADO_RE);
    assert.doesNotMatch('DEC-ABCD-EFGH-IJKL', C.CODIGO_VERIFICACAO_RE, 'I fora do alfabeto');
  });

  test('sufixo determinístico com bytes injetados e uniforme sobre o alfabeto', () => {
    assert.equal(C.sufixo(6, bytesFixos('s')), C.sufixo(6, bytesFixos('s')));
    const contagem = new Map();
    const b = bytesFixos('uniforme');
    for (let i = 0; i < 200; i++) for (const ch of C.sufixo(16, b)) contagem.set(ch, (contagem.get(ch) || 0) + 1);
    assert.equal(contagem.size, 32, 'todos os símbolos aparecem');
    for (const ch of contagem.keys()) assert.ok(C.ALFABETO.includes(ch));
  });

  test('código de aula, turma sugerida e senha temporária', () => {
    assert.equal(C.codigoAula('APE', 1, 1), 'APE-M01-A01');
    assert.equal(C.codigoAula('AB12', 12, 9), 'AB12-M12-A09');
    assert.match(C.codigoAula('APE', 99, 99), C.CODIGO_AULA_RE);
    assert.throws(() => C.codigoAula('ape', 1, 1), RangeError);
    assert.throws(() => C.codigoAula('APE', 0, 1), RangeError);
    assert.throws(() => C.codigoAula('APE', 1, 100), RangeError);
    assert.equal(C.codigoTurmaSugerido('APE', 2026, 1), 'APE-2026-01');
    assert.match(C.codigoTurmaSugerido('APE', 2026, 1), C.CODIGO_TURMA_RE);
    const s = C.senhaTemporaria();
    assert.equal(s.length, 16);
    assert.ok([...s].every(ch => C.ALFABETO.includes(ch)));
  });

  test('inserirComCodigo repete só no E11000 do índice do código (até 3×)', async () => {
    const banco = criarBancoMemoria({ indices: [
      { colecao: 'protocolos', chave: { protocolo: 1 }, opcoes: { name: 'uq_protocolos_protocolo', unique: true } },
      { colecao: 'protocolos', chave: { chave: 1 }, opcoes: { name: 'uq_protocolos_chave', unique: true } }
    ] });
    const col = banco.collection('protocolos');
    await col.insertOne({ protocolo: 'ATD-2026-AAAAAA', chave: 'k0' });
    const fila = ['ATD-2026-AAAAAA', 'ATD-2026-AAAAAA', 'ATD-2026-BBBBBB'];
    let tentativas = 0;
    const r = await C.inserirComCodigo(cod => { tentativas++; return col.insertOne({ protocolo: cod, chave: 'k1' }); }, () => fila.shift(), { indice: 'uq_protocolos_protocolo' });
    assert.equal(r.codigo, 'ATD-2026-BBBBBB');
    assert.equal(tentativas, 3);
    assert.ok(r.resultado.insertedId);

    let n = 0;
    await assert.rejects(
      C.inserirComCodigo(() => { n++; return col.insertOne({ protocolo: 'ATD-2026-AAAAAA', chave: `x${n}` }); }, () => 'ATD-2026-AAAAAA', { indice: 'uq_protocolos_protocolo' }),
      e => e.code === 11000
    );
    assert.equal(n, 3, 'desiste depois de 3 sorteios');

    let m = 0;
    await assert.rejects(
      C.inserirComCodigo(() => { m++; return col.insertOne({ protocolo: `ATD-2026-CCCCC${m + 1}`, chave: 'k0' }); }, () => 'x', { indice: 'uq_protocolos_protocolo' }),
      e => e.code === 11000 && /uq_protocolos_chave/.test(e.message)
    );
    assert.equal(m, 1, 'outro índice: sobe na hora');
    await assert.rejects(C.inserirComCodigo(() => { throw new Error('outro'); }, () => 'x', { indice: 'a' }), /outro/);
  });
});

// =============================================================
// cripto.js
// =============================================================
describe('cripto — cifra, rotação e HMAC', () => {
  const k = K.criarCripto({ material: MATERIAL });

  test('cifra ida e volta (AES-256-GCM, formato Cifrado)', () => {
    const c = k.cifrar('chave-de-api-falsa', 'gemini-api-key', 'configuracoes:assistente_ia');
    assert.deepEqual(Object.keys(c), ['v', 'alg', 'kid', 'iv', 'tag', 'ct']);
    assert.equal(c.v, 1);
    assert.equal(c.alg, 'A256GCM');
    assert.match(c.kid, /^[a-f0-9]{8}$/);
    assert.equal(Buffer.from(c.iv, 'base64').length, 12);
    assert.ok(!JSON.stringify(c).includes('chave-de-api-falsa'));
    assert.deepEqual(k.decifrar(c, 'gemini-api-key', 'configuracoes:assistente_ia'), { texto: 'chave-de-api-falsa', recifrar: false });
    assert.notEqual(k.cifrar('x', 'totp').iv, k.cifrar('x', 'totp').iv, 'IV aleatório');
  });

  test('tag adulterada, material diferente, AAD diferente, finalidade diferente e formato estranho → ChaveIlegivelError', () => {
    const c = k.cifrar('segredo', 'totp', 'totp:1');
    const tag = Buffer.from(c.tag, 'base64'); tag[0] ^= 1;
    assert.throws(() => k.decifrar({ ...c, tag: tag.toString('base64') }, 'totp', 'totp:1'), K.ChaveIlegivelError);
    const ct = Buffer.from(c.ct, 'base64'); ct[0] ^= 1;
    assert.throws(() => k.decifrar({ ...c, ct: ct.toString('base64') }, 'totp', 'totp:1'), K.ChaveIlegivelError);
    assert.throws(() => K.criarCripto({ material: 'outro-material' }).decifrar(c, 'totp', 'totp:1'), K.ChaveIlegivelError);
    assert.throws(() => k.decifrar(c, 'totp', 'totp:2'), K.ChaveIlegivelError);
    assert.throws(() => k.decifrar(c, 'gemini-api-key', 'totp:1'), K.ChaveIlegivelError);
    for (const ruim of [null, 'texto', {}, { ...c, v: 2 }, { ...c, alg: 'A128GCM' }]) assert.throws(() => k.decifrar(ruim, 'totp', 'totp:1'), K.ChaveIlegivelError);
    const e = pegarErro(() => k.decifrar(null, 'totp'));
    assert.equal(e.codigo, 'chave-ilegivel');
  });

  test('material anterior decifra com recifrar:true; cifrar usa sempre o atual', () => {
    const antigo = K.criarCripto({ material: MATERIAL_ANTIGO });
    const c = antigo.cifrar('JBSWY3DPEHPK3PXP', 'totp', 'totp:u');
    const novo = K.criarCripto({ material: MATERIAL, materialAnterior: MATERIAL_ANTIGO });
    assert.deepEqual(novo.decifrar(c, 'totp', 'totp:u'), { texto: 'JBSWY3DPEHPK3PXP', recifrar: true });
    const recifrado = novo.cifrar('JBSWY3DPEHPK3PXP', 'totp', 'totp:u');
    assert.equal(recifrado.kid, novo.kidAtual('totp'));
    assert.notEqual(recifrado.kid, c.kid);
    assert.deepEqual(novo.decifrar(recifrado, 'totp', 'totp:u'), { texto: 'JBSWY3DPEHPK3PXP', recifrar: false });
    assert.throws(() => K.criarCripto({ material: MATERIAL }).decifrar(c, 'totp', 'totp:u'), K.ChaveIlegivelError, 'sem a janela de rotação, ilegível');
  });

  test('derivarChave: HKDF por finalidade, finalidade desconhecida e material ausente lançam', () => {
    const esperado = Buffer.from(hkdfSync('sha256', MATERIAL, 'dmc-portal/selo/v1', 'dmc-portal:selo', 32));
    assert.ok(K.derivarChave('selo', MATERIAL).equals(esperado));
    assert.ok(!K.derivarChave('totp', MATERIAL).equals(esperado));
    assert.throws(() => K.derivarChave('outra', MATERIAL), RangeError);
    assert.throws(() => K.derivarChave('selo', ''), TypeError);
    assert.throws(() => K.criarCripto({}), TypeError);
    assert.equal(K.kidDe(esperado), createHash('sha256').update(esperado).digest('hex').slice(0, 8));
  });

  test('hmacIdentificador estável, normalizado e diferente para e-mail e CPF; nunca o valor em claro', () => {
    const cpf = gerarCpfValido('hmac');
    const a = k.hmacIdentificador('Joana@Exemplo.com ');
    assert.equal(a, k.hmacIdentificador('joana@exemplo.com'));
    assert.match(a, /^[a-f0-9]{64}$/);
    const b = k.hmacIdentificador(cpf);
    assert.equal(b, k.hmacIdentificador(`${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`));
    assert.notEqual(a, b);
    assert.notEqual(a, createHash('sha256').update('joana@exemplo.com').digest('hex'), 'HMAC, não sha256 simples');
    assert.notEqual(a, K.criarCripto({ material: 'outro' }).hmacIdentificador('joana@exemplo.com'));
  });

  test('hmacCodigoRecuperacao: HMAC (nunca sha256 simples) com normalização XXXX-XXXX', () => {
    const h = k.hmacCodigoRecuperacao('ABCD-EFGH');
    assert.equal(h, k.hmacCodigoRecuperacao('abcd efgh'));
    assert.equal(h, k.hmacCodigoRecuperacao('ABCDEFGH'));
    assert.notEqual(h, createHash('sha256').update('ABCD-EFGH').digest('hex'));
    assert.equal(K.normalizarCodigoRecuperacao('abcd-efgh'), 'ABCD-EFGH');
  });

  test('tokens, hash, sha256 e comparação em tempo constante', () => {
    const t = K.tokenAleatorio();
    assert.match(t, /^[A-Za-z0-9_-]{43}$/, '32 bytes em base64url');
    assert.notEqual(t, K.tokenAleatorio());
    assert.equal(K.hashToken(t), createHash('sha256').update(t).digest('hex'));
    assert.equal(K.sha256(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal(K.sha256('abc'), K.sha256(Buffer.from('abc')));
    assert.equal(K.iguaisTempoConstante('abc', 'abc'), true);
    assert.equal(K.iguaisTempoConstante('abc', 'abd'), false);
    assert.doesNotThrow(() => K.iguaisTempoConstante('abc', 'abcd'));
    assert.equal(K.iguaisTempoConstante('abc', 'abcd'), false);
    assert.equal(K.iguaisTempoConstante(null, 'a'), false);
    assert.equal(K.iguaisTempoConstante(Buffer.from('x'), 'x'), true);
  });

  test('instância padrão: configurarCripto define o material do processo', () => {
    K.configurarCripto({ material: MATERIAL });
    assert.equal(K.hmacIdentificador('a@b.com'), k.hmacIdentificador('a@b.com'));
    const c = K.cifrar('x', 'totp', 'aad');
    assert.deepEqual(K.decifrar(c, 'totp', 'aad'), { texto: 'x', recifrar: false });
    assert.equal(K.hmacCodigoRecuperacao('ABCD-EFGH'), k.hmacCodigoRecuperacao('ABCD-EFGH'));
  });
});

describe('cripto — canonico e selo HMAC', () => {
  const dados = { codigo: 'DMC-2345-6789', b: 1, a: new Date('2026-10-18T00:00:00Z') };

  test('canonico: chaves ordenadas, Date → ISO, ObjectId → hex, undefined omitido', () => {
    assert.equal(K.canonico({ b: 1, a: 2 }), K.canonico({ a: 2, b: 1 }));
    assert.equal(K.canonico({ b: 1, a: new Date('2026-10-18T00:00:00Z'), x: undefined }), '{"a":"2026-10-18T00:00:00.000Z","b":1}');
    assert.equal(K.canonico({ id: new ObjectId('64a1b2c3d4e5f60718293a4b') }), '{"id":"64a1b2c3d4e5f60718293a4b"}');
    assert.equal(K.canonico({ l: [undefined, 1, { z: 1, y: [2] }] }), '{"l":[null,1,{"y":[2],"z":1}]}');
    assert.equal(K.canonico(null), 'null');
    assert.equal(K.canonico({ n: NaN }), '{"n":null}');
  });

  test('vetor HMAC fixo (selo do certificado)', () => {
    const assinador = K.criarAssinador({ material: MATERIAL });
    const selo = assinador.assinar('certificado', dados);
    assert.deepEqual(selo, { hash: 'ddf5de44eba054dd920662d55a71fa2fe4530056c5ead0de1fa99046a8199b11', kid: '66ba3ade' });
    const chave = Buffer.from(hkdfSync('sha256', MATERIAL, 'dmc-portal/selo/v1', 'dmc-portal:selo', 32));
    const independente = createHmac('sha256', chave).update('certificado\n{"a":"2026-10-18T00:00:00.000Z","b":1,"codigo":"DMC-2345-6789"}').digest('hex');
    assert.equal(selo.hash, independente);
  });

  test('estável; tipo diferente com os mesmos dados → outro selo; trocar 1 campo muda o selo', () => {
    const assinador = K.criarAssinador({ material: MATERIAL });
    const s1 = assinador.assinar('certificado', dados);
    assert.deepEqual(assinador.assinar('certificado', { a: dados.a, b: 1, codigo: dados.codigo }), s1);
    assert.notEqual(assinador.assinar('declaracao', dados).hash, s1.hash);
    assert.notEqual(assinador.assinar('certificado', { ...dados, b: 2 }).hash, s1.hash);
    assert.equal(assinador.verificar('certificado', dados, s1.hash, s1.kid), true);
    assert.equal(assinador.verificar('certificado', { ...dados, codigo: 'DMC-2345-678A' }, s1.hash, s1.kid), false);
    assert.equal(assinador.verificar('certificado', dados, 'nao-hex', s1.kid), false);
    assert.throws(() => assinador.assinar('outro', dados), RangeError);
  });

  test('kid desconhecido → null; material anterior verifica selo antigo', () => {
    const antigo = K.criarAssinador({ material: MATERIAL_ANTIGO });
    const seloAntigo = antigo.assinar('frequencia', dados);
    const atual = K.criarAssinador({ material: MATERIAL });
    assert.equal(atual.verificar('frequencia', dados, seloAntigo.hash, seloAntigo.kid), null);
    assert.equal(atual.verificar('frequencia', dados, seloAntigo.hash, 'ffffffff'), null);
    const rotacao = K.criarAssinador({ material: MATERIAL, materialAnterior: MATERIAL_ANTIGO });
    assert.equal(rotacao.verificar('frequencia', dados, seloAntigo.hash, seloAntigo.kid), true);
    assert.equal(rotacao.assinar('frequencia', dados).kid, atual.kid, 'assina sempre com o atual');
  });
});

// =============================================================
// totp.js
// =============================================================
describe('totp — RFC 6238 (SHA-1, 30 s, 6 dígitos)', () => {
  const segredoRfc = T.base32Codificar(Buffer.from('12345678901234567890', 'ascii'));
  const VETORES = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']];

  test('vetores da RFC 6238 com o segredo guardado CIFRADO', () => {
    const k = K.criarCripto({ material: MATERIAL });
    const aad = T.aadDoSegredo('64a1b2c3d4e5f60718293a4b');
    const guardado = k.cifrar(segredoRfc, 'totp', aad);
    assert.ok(!JSON.stringify(guardado).includes(segredoRfc));
    const { texto: segredo } = k.decifrar(guardado, 'totp', aad);
    for (const [t, codigo] of VETORES) {
      assert.equal(T.codigoTotp(segredo, T.passoAtual(t * 1000)), codigo, `T=${t}`);
      assert.equal(T.verificarTotp(segredo, codigo, { agoraMs: t * 1000 }), T.passoAtual(t * 1000));
    }
  });

  test('base32 ida e volta (RFC 4648) e segredo novo', () => {
    assert.equal(T.base32Codificar(Buffer.from('foobar')), 'MZXW6YTBOI');
    assert.equal(T.base32Decodificar('MZXW6YTBOI').toString(), 'foobar');
    assert.equal(T.base32Decodificar('mzxw 6ytb oi======').toString(), 'foobar');
    for (let n = 0; n < 40; n++) {
      const buf = bytesFixos(`b32-${n}`)(n);
      assert.ok(T.base32Decodificar(T.base32Codificar(buf)).equals(buf), `n=${n}`);
    }
    assert.throws(() => T.base32Decodificar('ABC1'), TypeError);
    const s = T.gerarSegredo();
    assert.match(s, /^[A-Z2-7]{32}$/, '160 bits');
  });

  test('janela ±1 passo e anti-reuso (só passo > ultimoPasso)', () => {
    const agoraMs = 1_760_000_000_000;
    const p = T.passoAtual(agoraMs);
    const s = SEGREDO_TOTP_FIXTURE;
    assert.equal(T.verificarTotp(s, T.codigoTotp(s, p - 1), { agoraMs }), p - 1);
    assert.equal(T.verificarTotp(s, T.codigoTotp(s, p + 1), { agoraMs }), p + 1);
    assert.equal(T.verificarTotp(s, T.codigoTotp(s, p + 2), { agoraMs }), null);
    assert.equal(T.verificarTotp(s, T.codigoTotp(s, p), { agoraMs, janela: 0 }), p);
    assert.equal(T.verificarTotp(s, T.codigoTotp(s, p), { agoraMs, ultimoPasso: p }), null, 'mesmo passo: reuso');
    assert.equal(T.verificarTotp(s, T.codigoTotp(s, p - 1), { agoraMs, ultimoPasso: p - 1 }), null);
    assert.equal(T.verificarTotp(s, T.codigoTotp(s, p + 1), { agoraMs, ultimoPasso: p }), p + 1);
    for (const ruim of ['12345', '1234567', 'abcdef', null, { $gt: '' }]) assert.equal(T.verificarTotp(s, ruim, { agoraMs }), null);
    assert.equal(T.verificarTotp('!!!', '123456', { agoraMs }), null, 'segredo ilegível não lança');
  });

  test('códigos de recuperação: 10 únicos XXXX-XXXX gravados como HMAC', () => {
    const k = K.criarCripto({ material: MATERIAL });
    const { claros, hashes } = T.gerarCodigosRecuperacao(10, { hmac: k.hmacCodigoRecuperacao });
    assert.equal(claros.length, 10);
    assert.equal(new Set(claros).size, 10);
    for (const c of claros) assert.match(c, /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    claros.forEach((c, i) => {
      assert.equal(hashes[i], k.hmacCodigoRecuperacao(c));
      assert.notEqual(hashes[i], createHash('sha256').update(c).digest('hex'));
    });
    assert.throws(() => T.gerarCodigosRecuperacao(3, { hmac: x => x, bytes: () => Buffer.alloc(8) }), /sem variação/);
  });

  test('otpauthUri', () => {
    assert.equal(
      T.otpauthUri({ email: 'joana@exemplo.invalid', segredo: 'JBSWY3DPEHPK3PXP' }),
      'otpauth://totp/Plataforma%20Complexo%20DMC:joana%40exemplo.invalid?secret=JBSWY3DPEHPK3PXP&issuer=Plataforma%20Complexo%20DMC&algorithm=SHA1&digits=6&period=30'
    );
  });
});

// =============================================================
// csv.js
// =============================================================
describe('csv — BOM, ;, CRLF, aspas, anti-fórmula, vírgula decimal, fuso SP', () => {
  const colunas = [
    { chave: 'nome', rotulo: 'Nome' },
    { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' },
    { chave: 'pct', rotulo: 'Frequência', tipo: 'pct' },
    { chave: 'nota', rotulo: 'Nota', tipo: 'nota' },
    { chave: 'qtd', rotulo: 'Qtd', tipo: 'numero' },
    { chave: 'dia', rotulo: 'Vencimento', tipo: 'data' },
    { chave: 'em', rotulo: 'Registrado em', tipo: 'dataHora' }
  ];

  test('formato geral', () => {
    const csv = CSV.gerarCsv(colunas, [
      { nome: 'Ana; "Bia"', valor: 123456, pct: 87.46, nota: 7, qtd: 2.5, dia: '2026-10-05', em: new Date('2026-10-19T02:30:00Z') },
      { nome: null, valor: -50, pct: null, nota: 6.95, qtd: 0, dia: new Date('2026-10-19T01:00:00Z'), em: null }
    ]);
    assert.ok(csv.startsWith('﻿'));
    const linhas = csv.slice(1).split('\r\n');
    assert.equal(linhas.at(-1), '', 'termina em CRLF');
    assert.equal(linhas[0], 'Nome;Valor;Frequência;Nota;Qtd;Vencimento;Registrado em');
    assert.equal(linhas[1], '"Ana; ""Bia""";1234,56;87,5;7,0;2,5;05/10/2026;18/10/2026 23:30');
    assert.equal(linhas[2], ';-0,50;;7,0;0;18/10/2026;', 'data e hora no fuso de SP');
    assert.ok(!csv.includes('\n') || csv.split('\n').length === csv.split('\r\n').length);
  });

  test('anti-fórmula: = + - @ TAB CR ganham apóstrofo (texto); números negativos não', () => {
    const csv = CSV.gerarCsv([{ chave: 'a', rotulo: 'A' }, { chave: 'n', rotulo: 'N', tipo: 'numero' }], [
      { a: '=SOMA(A1:A2)', n: -3 }, { a: '+1', n: 1 }, { a: '-cmd', n: 1 }, { a: '@x', n: 1 }, { a: '\tx', n: 1 }, { a: '\rx', n: 1 },
      { a: 'ok', n: '=HYPERLINK("x")' }
    ]);
    const linhas = csv.slice(1).split('\r\n');
    assert.equal(linhas[1], "'=SOMA(A1:A2);-3");
    assert.equal(linhas[2], "'+1;1");
    assert.equal(linhas[3], "'-cmd;1");
    assert.equal(linhas[4], "'@x;1");
    assert.ok(linhas[5].startsWith("'\tx"));
    assert.ok(linhas[6].startsWith('"\'\rx'), 'CR dentro de aspas');
    assert.equal(linhas.at(-2), 'ok;"\'=HYPERLINK(""x"")"', 'valor não numérico em coluna numérica vira texto protegido');
    assert.equal(CSV.antiFormula('=1'), "'=1");
  });

  test('enviarCsv: cabeçalhos, nome do arquivo e teto de 20.000 linhas', () => {
    const cab = {};
    let corpo = null;
    const res = { set: (k, v) => { cab[k.toLowerCase()] = v; }, send: (b) => { corpo = b; } };
    CSV.enviarCsv(res, 'Notas da Turma', [{ chave: 'a', rotulo: 'A' }], [{ a: 1 }], { agora: () => new Date('2026-12-31T23:30:00-03:00') });
    assert.equal(cab['content-type'], 'text/csv; charset=utf-8');
    assert.equal(cab['content-disposition'], 'attachment; filename="dmc-notas-da-turma-2026-12-31.csv"');
    assert.equal(cab['cache-control'], 'no-store');
    assert.ok(corpo.startsWith('﻿A\r\n1\r\n'));
    assert.equal(CSV.LIMITE_LINHAS_CSV, 20000);
    const e = pegarErro(() => CSV.enviarCsv(res, 'x', [{ chave: 'a', rotulo: 'A' }], new Array(20001).fill({ a: 1 })));
    assert.equal(e.status, 413);
    assert.equal(e.codigo, 'relatorio-grande');
  });
});

// =============================================================
// erros.js
// =============================================================
describe('erros — ErroPortal, catálogo e resumirErro', () => {
  test('ErroPortal: mensagem padrão do catálogo, extras no corpo, internos fora', () => {
    const e = E.erro(429, 'limite', undefined, { retryAfterSeg: 12.2, persistente: true, campos: { a: 'b' } });
    assert.ok(e instanceof E.ErroPortal && e instanceof Error);
    assert.equal(e.message, E.MENSAGENS.limite);
    assert.equal(e.retryAfterSeg, 13);
    assert.equal(e.persistente, true);
    assert.deepEqual(e.extras, { campos: { a: 'b' } });
    assert.equal(E.MENSAGENS['registro-duplicado'], 'Este registro já existe.');
    assert.equal(E.MENSAGENS['formato-invalido'], 'Formato inválido.');
    assert.equal(E.MENSAGENS['servico-indisponivel'], 'Serviço temporariamente indisponível. Tente novamente em instantes.');
    assert.ok(Object.isFrozen(E.MENSAGENS));
    for (const [codigo, msg] of Object.entries(E.MENSAGENS)) {
      assert.match(codigo, /^[a-z0-9]+(-[a-z0-9]+)*$/, `kebab-case: ${codigo}`);
      assert.ok(typeof msg === 'string' && msg.length > 3);
    }
  });

  test('resumirErro: sem body, keyValue nem cabeçalhos; e-mail e CPF mascarados; ≤ 200', () => {
    const cpf = gerarCpfValido('resumo');
    const err = new Error(`E11000 duplicate key error collection: db.users index: uq_users_email dup key: { email: "joana@exemplo.com" } cpf ${cpf}`);
    err.code = 11000;
    err.keyValue = { email: 'joana@exemplo.com' };
    err.keyPattern = { email: 1 };
    err.body = { senha: 'segredo-do-corpo' };
    err.headers = { authorization: 'Bearer abc.def.ghi' };
    const r = E.resumirErro(err);
    assert.deepEqual(Object.keys(r), ['nome', 'codigo', 'indice', 'mensagem']);
    assert.equal(r.codigo, 11000);
    assert.equal(r.indice, 'uq_users_email');
    const json = JSON.stringify(r);
    for (const proibido of ['joana', 'segredo-do-corpo', 'abc.def', cpf, 'keyValue']) assert.ok(!json.includes(proibido), proibido);
    const longo = E.resumirErro(new Error('x'.repeat(500)));
    assert.ok(longo.mensagem.length <= 200);
    const tok = E.resumirErro(new Error('falhou com Bearer eyJabc.def e https://x.invalid/?key=AIzaSECRETA&a=1'));
    assert.ok(!/eyJabc|AIzaSECRETA/.test(tok.mensagem), tok.mensagem);
  });

  test('resumirErro: JSON quebrado nunca leva trecho do corpo', () => {
    let sintaxe;
    try { JSON.parse('{"senha":"segredo-123",'); } catch (e) { sintaxe = e; }
    assert.equal(E.resumirErro(sintaxe).mensagem, 'corpo JSON inválido');
    const parser = Object.assign(new Error('Unexpected token } in JSON at position 20 {"senha":"x"}'), { type: 'entity.parse.failed', body: '{"senha":"x"}' });
    assert.equal(E.resumirErro(parser).mensagem, 'corpo JSON inválido');
    assert.deepEqual(E.resumirErro(null), { nome: 'Error', codigo: null, indice: null, mensagem: 'erro desconhecido' });
    assert.equal(E.resumirErro('texto solto com a@b.com').mensagem, 'texto solto com [E-MAIL]');
    const marcado = Object.assign(new Error('x'), { registrado: true, resumo: { nome: 'N', codigo: null, indice: null, mensagem: 'm' } });
    assert.deepEqual(E.resumirErro(marcado), { nome: 'N', codigo: null, indice: null, mensagem: 'm' });
  });

  test('ehErroDeRedeMongo: no erro original ou no resumo', () => {
    assert.equal(E.ehErroDeRedeMongo(erroDeRede()), true);
    assert.equal(E.ehErroDeRedeMongo(Object.assign(new Error('x'), { name: 'MongoServerSelectionError' })), true);
    assert.equal(E.ehErroDeRedeMongo({ resumo: { nome: 'MongoNetworkTimeoutError' } }), true);
    assert.equal(E.ehErroDeRedeMongo(Object.assign(new Error('x'), { name: 'MongoServerError' })), false);
    assert.equal(E.ehErroDeRedeMongo(null), false);
  });
});

/** res falso para chamar os handlers direto (DC-77). */
function resFalso({ headersSent = false } = {}) {
  const r = { headersSent, statusCode: 200, corpo: undefined, cabecalhos: {}, respondeu: false };
  r.status = (s) => { r.statusCode = s; return r; };
  r.json = (b) => { r.corpo = b; r.respondeu = true; return r; };
  r.set = (k, v) => { r.cabecalhos[k.toLowerCase()] = v; return r; };
  return r;
}
const reqFalso = (extras = {}) => ({ method: 'POST', route: { path: '/senha/trocar' }, ...extras });

describe('tratarErroGlobal chamado direto (DC-77)', () => {
  const agora = () => new Date('2026-10-18T12:00:00Z');

  test('erro com keyValue e body → 500 e UMA linha de log só com nome, código, índice e mensagem', () => {
    const log = criarLogEspiao();
    const h = E.criarTratarErroGlobal({ log, agora });
    const err = Object.assign(new Error('falha ao gravar joana@exemplo.com'), { code: 'X1', keyValue: { email: 'joana@exemplo.com' }, body: { senha: 'segredo-123' } });
    const res = resFalso();
    h(err, reqFalso(), res, () => assert.fail('não chama next'));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.corpo, { error: 'Erro interno no servidor.' });
    assert.equal(log.linhas.length, 1);
    const linha = JSON.parse(log.linhas[0].texto);
    assert.equal(linha.nivel, 'erro');
    assert.equal(linha.status, 500);
    assert.equal(linha.metodo, 'POST');
    assert.equal(linha.rota, '/senha/trocar');
    assert.equal(linha.requestId, null);
    assert.deepEqual(Object.keys(linha.erroResumido), ['nome', 'codigo', 'indice', 'mensagem']);
    assert.ok(!/joana|segredo-123|keyValue|body/.test(log.texto()), log.texto());
  });

  test('entity.too.large com limit → 413 com o texto de hoje (sem log)', () => {
    const log = criarLogEspiao();
    const res = resFalso();
    E.criarTratarErroGlobal({ log })(Object.assign(new Error('too large'), { type: 'entity.too.large', limit: 8 * 1024 * 1024 }), reqFalso(), res, () => {});
    assert.equal(res.statusCode, 413);
    assert.deepEqual(res.corpo, { error: 'Arquivo maior que o limite de 8 MB.' });
    assert.equal(log.linhas.length, 0);
  });

  test('entity.parse.failed → 400 formato-invalido sem logar o corpo', () => {
    const log = criarLogEspiao();
    const res = resFalso();
    const err = Object.assign(new SyntaxError('Unexpected token in JSON {"senha":"segredo-123"'), { type: 'entity.parse.failed', body: '{"senha":"segredo-123"', status: 400 });
    E.criarTratarErroGlobal({ log })(err, reqFalso(), res, () => {});
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.corpo, { error: 'Formato inválido.', codigo: 'formato-invalido' });
    assert.ok(!log.texto().includes('segredo-123'));
  });

  test('MongoNetworkError e resumo com nome Mongo → 503', () => {
    const log = criarLogEspiao();
    const h = E.criarTratarErroGlobal({ log, agora });
    const res = resFalso();
    h(erroDeRede(), reqFalso(), res, () => {});
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.corpo, { error: 'Serviço temporariamente indisponível. Tente novamente em instantes.', codigo: 'servico-indisponivel' });
    assert.equal(log.linhas.length, 1);
    const res2 = resFalso();
    const resumido = Object.assign(new Error('x'), { name: 'Error', registrado: true, resumo: { nome: 'MongoServerSelectionError', codigo: null, indice: null, mensagem: 'x' } });
    h(resumido, reqFalso(), res2, () => {});
    assert.equal(res2.statusCode, 503);
    assert.equal(log.linhas.length, 1, 'registrado:true não gera segunda linha');
  });

  test('registrado:true → nenhuma segunda linha; headersSent → não responde', () => {
    const log = criarLogEspiao();
    const h = E.criarTratarErroGlobal({ log });
    const res = resFalso();
    h(Object.assign(new Error('x'), { registrado: true, resumo: { nome: 'Error', codigo: null, indice: null, mensagem: 'x' } }), reqFalso(), res, () => {});
    assert.equal(res.statusCode, 500);
    assert.equal(log.linhas.length, 0);
    const enviado = resFalso({ headersSent: true });
    h(new Error('depois'), reqFalso(), enviado, () => assert.fail('não chama next'));
    assert.equal(enviado.respondeu, false);
    assert.equal(log.linhas.length, 0);
  });

  test('requestId no corpo só quando há req.requestId; ErroPortal de rota legada vira a resposta dele', () => {
    const h = E.criarTratarErroGlobal({ log: silencioso });
    const sem = resFalso();
    h(new Error('x'), reqFalso(), sem, () => {});
    assert.deepEqual(sem.corpo, { error: 'Erro interno no servidor.' });
    const com = resFalso();
    h(new Error('x'), reqFalso({ requestId: 'r-0123456789ab' }), com, () => {});
    assert.deepEqual(com.corpo, { error: 'Erro interno no servidor.', requestId: 'r-0123456789ab' });
    const portal = resFalso();
    h(E.erro(403, 'sem-acesso'), reqFalso(), portal, () => {});
    assert.equal(portal.statusCode, 403);
    assert.deepEqual(portal.corpo, { error: E.MENSAGENS['sem-acesso'], codigo: 'sem-acesso' });
  });

  test('tratarErroGlobal padrão tem 4 parâmetros (handler de erro do Express)', () => {
    assert.equal(E.tratarErroGlobal.length, 4);
    assert.equal(E.tratarErroPortal.length, 4);
  });
});

describe('tratarErroPortal + tratarErroGlobal num app (agregador simulado)', () => {
  let srv;
  let api;
  const log = criarLogEspiao();
  const gravados = [];
  const repo = (nome) => ({ insertOne: async (d) => { gravados.push({ nome, d }); return { insertedId: 1 }; } });

  before(async () => {
    const app = express();
    app.use(express.json({ limit: '1kb' }));
    const portal = express.Router();
    portal.use(E.idDaRequisicao);
    portal.use(E.semCache);
    portal.get('/validacao', () => { throw E.erro(400, 'validacao', undefined, { campos: { nome: 'Campo obrigatório.' } }); });
    portal.get('/limite', () => { throw E.erro(429, 'muitas-tentativas', undefined, { retryAfterSeg: 30, persistente: true }); });
    portal.get('/duplicado', async () => {
      throw Object.assign(new Error('E11000 duplicate key error collection: db.perfis index: uq_perfis_cpf dup key: { cpf: "52998224725" }'), { code: 11000, keyValue: { cpf: '52998224725' }, keyPattern: { cpf: 1 } });
    });
    portal.get('/servico', () => { throw Object.assign(new Error('Serviço indisponível: secretaria.matriculaVigente'), { name: 'ServicoIndisponivel', codigo: 'servico-indisponivel' }); });
    portal.get('/bug/:id', () => { throw new Error('falha inesperada para joana@exemplo.com'); });
    portal.get('/rede', () => { throw erroDeRede(); });
    portal.post('/eco', (req, res) => res.json(req.body));
    app.use('/api/portal', portal);
    app.use(['/api/auth', '/api/portal'], E.criarTratadorErroPortal({
      registro: E.criarRegistroDeErros({ repo, agora: () => new Date('2026-10-18T12:00:00Z') }),
      log,
      agora: () => new Date('2026-10-18T12:00:00Z')
    }));
    app.use(E.criarTratarErroGlobal({ log }));
    srv = await subir(app);
    api = cliente(srv.base);
  });
  after(() => fechar(srv?.server));

  test('ErroPortal → status, { error, codigo, campos, requestId }, X-Request-Id e no-store', async () => {
    const r = await api.get('/api/portal/validacao');
    assert.equal(r.status, 400);
    assert.match(r.headers.get('x-request-id'), /^r-[a-f0-9]{12}$/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepEqual(r.corpo, { error: 'Confira os campos destacados.', codigo: 'validacao', campos: { nome: 'Campo obrigatório.' }, requestId: r.headers.get('x-request-id') });
  });

  test('429 persistente: Retry-After, sem campos internos no corpo, log como aviso', async () => {
    const antes = log.linhas.length;
    const r = await api.get('/api/portal/limite');
    assert.equal(r.status, 429);
    assert.equal(r.headers.get('retry-after'), '30');
    assert.deepEqual(Object.keys(r.corpo), ['error', 'codigo', 'requestId']);
    const novas = log.linhas.slice(antes);
    assert.equal(novas.length, 1);
    assert.equal(JSON.parse(novas[0].texto).nivel, 'aviso');
  });

  test('E11000 não previsto → 409 registro-duplicado sem keyValue (e sem log: 4xx)', async () => {
    const antes = log.linhas.length;
    const r = await api.get('/api/portal/duplicado');
    assert.equal(r.status, 409);
    assert.deepEqual(r.corpo, { error: 'Este registro já existe.', codigo: 'registro-duplicado', requestId: r.headers.get('x-request-id') });
    assert.ok(!r.texto.includes('52998224725'));
    assert.equal(log.linhas.length, antes);
    assert.ok(!log.texto().includes('52998224725'));
  });

  test('ServicoIndisponivel → 503 servico-indisponivel e registro', async () => {
    const antes = gravados.length;
    const r = await api.get('/api/portal/servico');
    assert.equal(r.status, 503);
    assert.equal(r.corpo.codigo, 'servico-indisponivel');
    assert.equal(gravados.length, antes + 1);
  });

  test('erro inesperado → 1 linha JSON sem e-mail + 1 documento em erros_servidor; global responde 500 sem 2ª linha', async () => {
    const antesLog = log.linhas.length;
    const antesReg = gravados.length;
    const r = await api.get('/api/portal/bug/64a1b2c3d4e5f60718293a4b');
    assert.equal(r.status, 500);
    assert.deepEqual(r.corpo, { error: 'Erro interno no servidor.', requestId: r.headers.get('x-request-id') });
    const novas = log.linhas.slice(antesLog);
    assert.equal(novas.length, 1, 'uma linha só');
    const linha = JSON.parse(novas[0].texto);
    assert.equal(linha.rota, '/bug/:id', 'padrão Express, sem id');
    assert.equal(linha.requestId, r.headers.get('x-request-id'));
    assert.ok(!novas[0].texto.includes('joana'), novas[0].texto);
    assert.equal(gravados.length, antesReg + 1);
    const doc = gravados.at(-1).d;
    assert.equal(gravados.at(-1).nome, 'erros_servidor');
    assert.deepEqual(Object.keys(doc), ['em', 'requestId', 'metodo', 'rota', 'status', 'codigo', 'erroResumido', 'expiraEm']);
    assert.equal(doc.status, 500);
    assert.equal(doc.rota, '/bug/:id');
    assert.ok(doc.erroResumido.length <= 200 && !doc.erroResumido.includes('joana'));
    assert.equal(doc.expiraEm.getTime() - doc.em.getTime(), 30 * 24 * 3600 * 1000);
  });

  test('banco fora → 503 e nenhuma tentativa de gravar em erros_servidor', async () => {
    const antesReg = gravados.length;
    const r = await api.get('/api/portal/rede');
    assert.equal(r.status, 503);
    assert.equal(r.corpo.codigo, 'servico-indisponivel');
    assert.equal(gravados.length, antesReg);
  });

  test('JSON quebrado com senha → 400 formato-invalido e o log sem a senha', async () => {
    const antes = log.linhas.length;
    const r = await api.raw('/api/portal/eco', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"senhaAtual":"segredo-zz9","novaSenha":' });
    assert.equal(r.status, 400);
    assert.deepEqual(r.corpo, { error: 'Formato inválido.', codigo: 'formato-invalido' });
    assert.ok(!log.texto().includes('segredo-zz9'));
    assert.equal(log.linhas.length, antes);
  });

  test('corpo acima do teto → 413 com o texto de hoje', async () => {
    const r = await api.post('/api/portal/eco', { x: 'a'.repeat(3000) });
    assert.equal(r.status, 413);
    assert.match(r.corpo.error, /^Arquivo maior que o limite de \d+ MB\.$/);
  });
});

describe('criarRegistroDeErros nunca lança nem espera o banco', () => {
  test('repo que lança na hora ou rejeita depois', async () => {
    const quebrado = E.criarRegistroDeErros({ repo: () => { throw new Error('MongoDB não conectado'); }, log: silencioso });
    assert.doesNotThrow(() => quebrado.registrar({ req: reqFalso(), status: 500, erro: new Error('x') }));
    const rejeita = E.criarRegistroDeErros({ repo: () => ({ insertOne: () => Promise.reject(new Error('falhou')) }), log: silencioso });
    assert.doesNotThrow(() => rejeita.registrar({ req: reqFalso(), status: 500, erro: new Error('x') }));
    await new Promise(r => setImmediate(r));
    assert.throws(() => E.criarRegistroDeErros({}), /repo/);
  });

  test('idDaRequisicao é idempotente e semCache põe no-store', () => {
    const req = {};
    const res = resFalso();
    E.idDaRequisicao(req, res, () => {});
    const id = req.requestId;
    assert.match(id, /^r-[a-f0-9]{12}$/);
    E.idDaRequisicao(req, res, () => {});
    assert.equal(req.requestId, id);
    assert.equal(res.cabecalhos['x-request-id'], id);
    E.semCache(req, res, () => {});
    assert.equal(res.cabecalhos['cache-control'], 'no-store');
  });
});

// =============================================================
// config-portal.js — regra QA_SERVIDOR (D-41)
// =============================================================
describe('config-portal — regra QA_SERVIDOR e padrões', () => {
  const QA = { QA_SERVIDOR: '1', NODE_ENV: 'test', VERCEL: '1' };

  test('com a regra: PORTAL_MODULOS e URLs http://127.0.0.1 valem (VERCEL=1 não bloqueia)', () => {
    const c = CFG.lerConfigPortal({ ...QA, PORTAL_MODULOS: 'routes/portal/perfil.js, ./routes/portal-turmas.js', PORTAL_MODULOS_IGNORAR: 'server/src/routes/portal/ia.js', PORTAL_GEMINI_URL: 'http://127.0.0.1:4646/gemini/', PORTAL_VIACEP_URL: 'http://127.0.0.1:4646/viacep', PORTAL_RESEND_URL: 'http://127.0.0.1:4646' });
    assert.equal(c.qa, true);
    assert.deepEqual(c.modulosFiltro, { so: ['routes/portal/perfil.js', 'routes/portal-turmas.js'], ignorar: ['routes/portal/ia.js'] });
    assert.deepEqual(c.urlsProvedor, { gemini: 'http://127.0.0.1:4646/gemini', viacep: 'http://127.0.0.1:4646/viacep', resend: 'http://127.0.0.1:4646' });
    assert.deepEqual([...c.ignoradas], []);
  });

  test('sem QA_SERVIDOR, com VERCEL_ENV presente ou em produção: ignoradas com aviso (só o nome)', () => {
    const vars = { PORTAL_MODULOS: 'routes/portal/perfil.js', PORTAL_GEMINI_URL: 'http://127.0.0.1:4646', PORTAL_RESEND_URL: 'http://127.0.0.1:4646' };
    for (const env of [{ ...vars, NODE_ENV: 'test' }, { ...QA, ...vars, VERCEL_ENV: 'preview' }, { ...QA, ...vars, VERCEL_ENV: '' }, { ...QA, ...vars, NODE_ENV: 'production' }]) {
      const c = CFG.lerConfigPortal(env);
      assert.equal(c.qa, false);
      assert.deepEqual(c.modulosFiltro, { so: null, ignorar: [] });
      assert.deepEqual(c.urlsProvedor, { ...CFG.PROVEDORES_PADRAO });
      assert.deepEqual([...c.ignoradas].sort(), ['PORTAL_GEMINI_URL', 'PORTAL_MODULOS', 'PORTAL_RESEND_URL']);
      const avisos = CFG.avisosDeConfiguracao(c).join('\n');
      assert.match(avisos, /variável de QA ignorada \(.*PORTAL_MODULOS.*\) fora da regra QA_SERVIDOR/);
      assert.ok(!avisos.includes('127.0.0.1') && !avisos.includes('perfil.js'), 'nunca o valor');
    }
  });

  test('URL de provedor falso só http:// em 127.0.0.1 (https, localhost e outro host → ignoradas)', () => {
    for (const url of ['https://127.0.0.1:4646', 'http://localhost:4646', 'http://10.0.0.1', 'http://127.0.0.1.evil.example', 'http://u:p@127.0.0.1:1', 'nao-e-url']) {
      const c = CFG.lerConfigPortal({ ...QA, PORTAL_VIACEP_URL: url });
      assert.equal(c.urlsProvedor.viacep, 'https://viacep.com.br', url);
      assert.deepEqual([...c.ignoradas], ['PORTAL_VIACEP_URL'], url);
    }
  });

  test('baseUrl: env, localhost fora da Vercel, null na Vercel; inválida ignorada; produção exige https', () => {
    assert.equal(CFG.lerConfigPortal({ PORTAL_BASE_URL: 'https://complexodmc.com.br/' }).baseUrl, 'https://complexodmc.com.br');
    assert.equal(CFG.lerConfigPortal({ PORT: '4632' }).baseUrl, 'http://localhost:4632');
    assert.equal(CFG.lerConfigPortal({}).baseUrl, 'http://localhost:3000');
    assert.equal(CFG.lerConfigPortal({ VERCEL: '1' }).baseUrl, null);
    const inval = CFG.lerConfigPortal({ VERCEL: '1', PORTAL_BASE_URL: 'javascript:alert(1)' });
    assert.equal(inval.baseUrl, null);
    assert.deepEqual([...inval.invalidas], ['PORTAL_BASE_URL']);
    assert.equal(CFG.lerConfigPortal({ NODE_ENV: 'production', VERCEL: '1', PORTAL_BASE_URL: 'http://complexodmc.com.br' }).baseUrl, null);
    assert.equal(CFG.lerConfigPortal({ PORTAL_BASE_URL: 'http://127.0.0.1:4646' }).baseUrl, 'http://127.0.0.1:4646');
  });

  test('limites, tempos e chaves', () => {
    const local = CFG.lerConfigPortal({});
    assert.equal(local.maxArquivoBytes, 4 * 1024 * 1024);
    assert.equal(local.fotoMaxBytes, 2 * 1024 * 1024);
    assert.equal(local.bannerMaxBytes, 1024 * 1024);
    assert.equal(local.iaTimeoutMs, 20000);
    assert.equal(CFG.lerConfigPortal({ VERCEL: '1' }).iaTimeoutMs, 8000);
    assert.equal(CFG.lerConfigPortal({ PORTAL_MAX_ARQUIVO_MB: '10' }).maxArquivoBytes, 10 * 1024 * 1024);
    assert.equal(CFG.lerConfigPortal({ PORTAL_MAX_ARQUIVO_MB: '10', VERCEL: '1' }).maxArquivoBytes, 4 * 1024 * 1024, 'teto da Vercel');
    assert.equal(CFG.lerConfigPortal({ PORTAL_MAX_ARQUIVO_MB: 'abc' }).maxArquivoBytes, 4 * 1024 * 1024);
    assert.equal(CFG.lerConfigPortal({ PORTAL_2FA: '1' }).doisFatores, true);
    assert.equal(CFG.lerConfigPortal({ PORTAL_2FA: 'true' }).doisFatores, false, 'só "1"');
    assert.equal(CFG.lerConfigPortal({ LEADS_EMAIL_FROM: 'DMC <a@b.invalid>' }).emailDe, 'DMC <a@b.invalid>');
    assert.equal(CFG.lerConfigPortal({ LEADS_EMAIL_FROM: 'x', PORTAL_EMAIL_FROM: 'y' }).emailDe, 'y');
    assert.equal(CFG.lerConfigPortal({ NODE_ENV: 'test' }).falharCedo, true);
    assert.equal(CFG.lerConfigPortal({}).falharCedo, false);
    assert.equal(CFG.lerConfigPortal({}).estrito, false);
    assert.equal(CFG.lerConfigPortal({ PORTAL_MODULOS_ESTRITO: '1' }).estrito, true);
    assert.equal(CFG.lerConfigPortal({ NODE_ENV: 'production' }).estrito, true);
    assert.equal(CFG.lerConfigPortal({ JWT_SECRET: ' s ' }).material, 's');
    assert.ok(Object.isFrozen(local) && Object.isFrozen(local.urlsProvedor));
  });

  test('avisos nunca trazem valores de segredo', () => {
    const c = CFG.lerConfigPortal({ GEMINI_API_KEY: 'chave-super-secreta', RESEND_API_KEY: 're_segredo', PORTAL_MATERIAL_ANTERIOR: 'material-velho', JWT_SECRET: 'jwt-segredo' });
    const avisos = CFG.avisosDeConfiguracao(c).join('\n');
    for (const s of ['chave-super-secreta', 're_segredo', 'material-velho', 'jwt-segredo']) assert.ok(!avisos.includes(s), s);
    assert.match(avisos, /GEMINI_API_KEY definida no ambiente/);
    assert.match(avisos, /PORTAL_MATERIAL_ANTERIOR presente/);
    assert.match(avisos, /PORTAL_2FA desligado/);
    assert.match(avisos, /e-mail transacional desligado/);
    assert.ok(Object.isFrozen(CFG.configPortal));
  });
});

// =============================================================
// Apoio: banco em memória (lista fechada, INDICES_LEGADOS, operadores)
// =============================================================
describe('banco-memoria — lista fechada e INDICES_LEGADOS', () => {
  test('operação ou operador fora da lista lança erro claro', async () => {
    const b = criarBancoMemoria();
    const col = b.collection('x');
    assert.throws(() => col.aggregate([]), /banco-memoria: aggregate não suportado/);
    assert.throws(() => col.replaceOne, /banco-memoria: replaceOne não suportado/);
    assert.throws(() => col.find({}).count(), /banco-memoria: cursor\.count não suportado/);
    await assert.rejects(col.find({ $where: 'true' }).toArray(), /banco-memoria: \$where não suportado/);
    await assert.rejects(col.findOne({ a: { $not: { $eq: 1 } } }), /banco-memoria: \$not não suportado/);
    await assert.rejects(col.findOne({ $nor: [{ a: 1 }] }), /\$nor não suportado/);
    await col.insertOne({ a: 1 });
    await assert.rejects(col.updateOne({ a: 1 }, { a: 2 }), /update sem operadores/);
    await assert.rejects(col.updateOne({ a: 1 }, { $min: { a: 0 } }), /\$min não suportado/);
    await assert.rejects(col.bulkWrite([{ replaceOne: { filter: {}, replacement: {} } }]), /bulkWrite\.replaceOne não suportado/);
    assert.equal(col.then, undefined, 'não é thenable');
  });

  test('INDICES_LEGADOS é a cópia nominal dos índices únicos do db.js em users, liberacoes, progresso e certificados', () => {
    const fonte = fs.readFileSync(path.join(__dirname, '../src/db.js'), 'utf8');
    const colecaoDe = {};
    for (const m of fonte.matchAll(/(\w+):\s*\(\)\s*=>\s*getDb\(\)\.collection\('([^']+)'\)/g)) colecaoDe[m[1]] = m[2];
    const unicos = [];
    for (const m of fonte.matchAll(/col\.(\w+)\(\)\.createIndex\(\s*(\{[^}]*\})\s*,\s*(\{[^}]*\})\s*\)/g)) {
      const colecao = colecaoDe[m[1]];
      if (!['users', 'liberacoes', 'progresso', 'certificados'].includes(colecao)) continue;
      if (!/unique:\s*true/.test(m[3])) continue;
      const chave = Function(`return (${m[2]});`)();
      const nome = /name:\s*'([^']+)'/.exec(m[3])[1];
      unicos.push({ colecao, chave, nome });
    }
    assert.ok(unicos.length >= 5, 'o leitor do fonte achou os índices');
    const legados = INDICES_LEGADOS.map(i => ({ colecao: i.colecao, chave: { ...i.chave }, nome: i.opcoes.name }));
    const ordenar = l => [...l].sort((a, b) => a.nome.localeCompare(b.nome));
    assert.deepEqual(ordenar(legados), ordenar(unicos));
    for (const i of INDICES_LEGADOS) assert.equal(i.opcoes.unique, true);
  });

  test('E11000 de verdade: 2º usuário com o mesmo e-mail e 2º certificado do mesmo { userId, cursoId }', async () => {
    const b = criarBancoMemoria();
    await b.collection('users').insertOne({ email: 'a@exemplo.invalid' });
    await assert.rejects(b.collection('users').insertOne({ email: 'a@exemplo.invalid' }), (e) => {
      assert.equal(e.code, 11000);
      assert.match(e.message, /index: uq_users_email /);
      assert.deepEqual(e.keyPattern, { email: 1 });
      return true;
    });
    await b.collection('certificados').insertOne({ userId: 'u1', cursoId: 'c1', codigo: 'DMC-2345-6789' });
    await assert.rejects(b.collection('certificados').insertOne({ userId: 'u1', cursoId: 'c1', codigo: 'DMC-2345-678A' }), e => /index: uq_certificados /.test(e.message));
    await assert.rejects(b.collection('certificados').insertOne({ userId: 'u2', cursoId: 'c1', codigo: 'DMC-2345-6789' }), e => /uq_certificados_codigo/.test(e.message));
    await assert.rejects(b.collection('liberacoes').insertMany([{ userId: 'u', cursoId: 'c' }, { userId: 'u', cursoId: 'c' }]), e => e.code === 11000);
    await b.collection('progresso').insertOne({ userId: 'u', aulaId: 'a' });
    await assert.rejects(b.collection('progresso').updateOne({ userId: 'x' }, { $set: { userId: 'u', aulaId: 'a' } }, { upsert: true }), e => /uq_progresso/.test(e.message));
  });

  test('índice único parcial (vigente:true) e conflito de especificação (85/86)', async () => {
    const b = criarBancoMemoria({ indices: [{ colecao: 'matriculas', chave: { userId: 1, cursoId: 1 }, opcoes: { name: 'uq_matriculas_vigente', unique: true, partialFilterExpression: { vigente: true } } }] });
    const m = b.collection('matriculas');
    await m.insertOne({ userId: 'u', cursoId: 'c', status: 'concluida' });
    await m.insertOne({ userId: 'u', cursoId: 'c', status: 'cancelada' });
    await m.insertOne({ userId: 'u', cursoId: 'c', status: 'ativa', vigente: true });
    await assert.rejects(m.insertOne({ userId: 'u', cursoId: 'c', status: 'ativa', vigente: true }), e => /uq_matriculas_vigente/.test(e.message));
    await assert.rejects(m.createIndex({ outro: 1 }, { name: 'uq_matriculas_vigente' }), e => e.code === 86);
    await assert.rejects(m.createIndex({ userId: 1, cursoId: 1 }, { name: 'uq_matriculas_vigente', unique: true }), e => e.code === 85);
    assert.equal(await m.createIndex({ userId: 1, cursoId: 1 }, { name: 'uq_matriculas_vigente', unique: true, partialFilterExpression: { vigente: true } }), 'uq_matriculas_vigente', 'idempotente');
    const x = b.collection('x');
    await x.insertMany([{ k: 1 }, { k: 1 }]);
    await assert.rejects(x.createIndex({ k: 1 }, { name: 'uq_x_k', unique: true }), e => e.code === 11000);
    assert.equal(b.contagem('createIndex', 'matriculas'), 3);
  });
});

describe('banco-memoria — consultas e atualizações', () => {
  let b;
  let col;
  before(async () => {
    b = criarBancoMemoria();
    col = b.collection('docs');
    await col.insertMany([
      { _id: 1, nome: 'Ação Penal', tags: ['a', 'b'], n: 5, em: new Date('2026-01-01'), sub: { x: 1 }, itens: [{ id: 'i1', ok: true }, { id: 'i2', ok: false }] },
      { _id: 2, nome: 'Holding', tags: ['b'], n: 10, em: new Date('2026-06-01'), sub: { x: 2 }, itens: [{ id: 'i3', ok: true }] },
      { _id: 3, nome: 'Tributário', n: null, em: new Date('2026-12-01') },
      { _id: 4, nome: 'Sem n' }
    ]);
  });

  const ids = docs => docs.map(d => d._id);

  test('igualdade, caminho com ponto, elemento de array e null = ausente', async () => {
    assert.deepEqual(ids(await col.find({ tags: 'a' }).toArray()), [1]);
    assert.deepEqual(ids(await col.find({ 'sub.x': 2 }).toArray()), [2]);
    assert.deepEqual(ids(await col.find({ 'itens.id': 'i2' }).toArray()), [1]);
    assert.deepEqual(ids(await col.find({ n: null }).toArray()), [3, 4]);
    assert.deepEqual(ids(await col.find({ nome: /^ação/i }).toArray()), [1]);
  });

  test('$in $nin $ne $exists $gt $gte $lt $lte $type $regex $or $and $elemMatch', async () => {
    assert.deepEqual(ids(await col.find({ n: { $in: [5, 10] } }).toArray()), [1, 2]);
    assert.deepEqual(ids(await col.find({ n: { $nin: [5, null] } }).toArray()), [2]);
    assert.deepEqual(ids(await col.find({ n: { $ne: 5 } }).toArray()), [2, 3, 4]);
    assert.deepEqual(ids(await col.find({ n: { $exists: false } }).toArray()), [4]);
    assert.deepEqual(ids(await col.find({ n: { $gt: 5 } }).toArray()), [2]);
    assert.deepEqual(ids(await col.find({ n: { $gte: 5, $lte: 10 } }).toArray()), [1, 2]);
    assert.deepEqual(ids(await col.find({ em: { $lt: new Date('2026-07-01') } }).toArray()), [1, 2]);
    assert.deepEqual(ids(await col.find({ n: { $type: 'number' } }).toArray()), [1, 2]);
    assert.deepEqual(ids(await col.find({ n: { $type: 'null' } }).toArray()), [3]);
    assert.deepEqual(ids(await col.find({ nome: { $regex: 'hold', $options: 'i' } }).toArray()), [2]);
    assert.deepEqual(ids(await col.find({ $or: [{ n: 5 }, { nome: 'Sem n' }] }).toArray()), [1, 4]);
    assert.deepEqual(ids(await col.find({ $and: [{ tags: 'b' }, { n: { $gt: 6 } }] }).toArray()), [2]);
    assert.deepEqual(ids(await col.find({ itens: { $elemMatch: { id: 'i2', ok: false } } }).toArray()), [1]);
    assert.deepEqual(ids(await col.find({ itens: { $elemMatch: { id: 'i1', ok: false } } }).toArray()), []);
    assert.deepEqual(ids(await col.find({ tags: { $elemMatch: { $in: ['a'] } } }).toArray()), [1]);
  });

  test('projeção, ordenação, skip/limit, countDocuments, distinct, findOne', async () => {
    assert.deepEqual(await col.find({ _id: 1 }, { projection: { nome: 1 } }).toArray(), [{ _id: 1, nome: 'Ação Penal' }]);
    assert.deepEqual(await col.find({ _id: 1 }).project({ nome: 1, _id: 0, 'itens.id': 1 }).toArray(), [{ nome: 'Ação Penal', itens: [{ id: 'i1' }, { id: 'i2' }] }]);
    const sem = await col.findOne({ _id: 1 }, { projection: { itens: 0, tags: 0, sub: 0, em: 0 } });
    assert.deepEqual(sem, { _id: 1, nome: 'Ação Penal', n: 5 });
    assert.deepEqual(ids(await col.find({}).sort({ n: -1 }).toArray()), [2, 1, 3, 4]);
    assert.deepEqual(ids(await col.find({}, { sort: { em: 1 }, skip: 1, limit: 2 }).toArray()), [1, 2], 'ausente ordena antes (como null)');
    assert.deepEqual(ids(await col.find({}).sort({ _id: 1 }).skip(1).limit(2).toArray()), [2, 3]);
    assert.equal(await col.countDocuments({ tags: 'b' }), 2);
    assert.deepEqual((await col.distinct('tags')).sort(), ['a', 'b']);
    assert.equal(await col.findOne({ _id: 99 }), null);
    await assert.rejects(col.find({}, { projection: { a: 1, b: 0 } }).toArray(), /projeção mista/);
    const lidos = [];
    for await (const d of col.find({ n: { $gt: 0 } }).sort({ n: 1 })) lidos.push(d._id);
    assert.deepEqual(lidos, [1, 2]);
  });

  test('operador posicional `$` com $elemMatch e com caminho do array', async () => {
    const c = b.collection('auth_2fa');
    await c.insertOne({ userId: 'u', ultimoPasso: 10, codigos: [{ hash: 'h1', usadoEm: null }, { hash: 'h2', usadoEm: null }] });
    const quando = new Date('2026-10-18T12:00:00Z');
    const r = await c.updateOne({ userId: 'u', codigos: { $elemMatch: { hash: 'h2', usadoEm: null } } }, { $set: { 'codigos.$.usadoEm': quando } });
    assert.equal(r.modifiedCount, 1);
    const doc = await c.findOne({ userId: 'u' });
    assert.equal(doc.codigos[0].usadoEm, null);
    assert.deepEqual(doc.codigos[1].usadoEm, quando);
    const de_novo = await c.updateOne({ userId: 'u', codigos: { $elemMatch: { hash: 'h2', usadoEm: null } } }, { $set: { 'codigos.$.usadoEm': quando } });
    assert.equal(de_novo.matchedCount, 0, 'uso único');
    const passo = await c.updateOne({ userId: 'u', ultimoPasso: { $lt: 10 } }, { $set: { ultimoPasso: 10 } });
    assert.equal(passo.modifiedCount, 0, 'anti-reuso do TOTP');
    const m = b.collection('modulos');
    await m.insertOne({ _id: 'm1', materiais: [{ id: 'mat-1', categoria: 'leitura' }, { id: 'mat-2', categoria: 'leitura' }] });
    await m.updateOne({ _id: 'm1', 'materiais.id': 'mat-2' }, { $set: { 'materiais.$.categoria': 'slides' } });
    assert.deepEqual((await m.findOne({ _id: 'm1' })).materiais.map(x => x.categoria), ['leitura', 'slides']);
    await assert.rejects(m.updateOne({ _id: 'm1' }, { $set: { 'materiais.$.categoria': 'x' } }), /posicional sem correspondência/);
  });

  test('$inc $max $push($each,$slice) $pull $addToSet $unset $setOnInsert e upsert', async () => {
    const c = b.collection('upd');
    const r1 = await c.updateOne({ chave: 'k', tipo: 'login' }, { $inc: { n: 1 }, $setOnInsert: { criadoEm: 'agora' } }, { upsert: true });
    assert.equal(r1.upsertedCount, 1);
    await c.updateOne({ chave: 'k' }, { $inc: { n: 2 }, $setOnInsert: { criadoEm: 'outro' } }, { upsert: true });
    let d = await c.findOne({ chave: 'k' });
    assert.equal(d.n, 3);
    assert.equal(d.tipo, 'login', 'upsert copia a igualdade do filtro');
    assert.equal(d.criadoEm, 'agora', '$setOnInsert só na inserção');
    await c.updateOne({ chave: 'k' }, { $max: { pct: 40 } });
    await c.updateOne({ chave: 'k' }, { $max: { pct: 30 } });
    await c.updateOne({ chave: 'k' }, { $push: { hist: { $each: [1, 2, 3, 4], $slice: -3 } } });
    await c.updateOne({ chave: 'k' }, { $addToSet: { tags: { $each: ['a', 'a', 'b'] } } });
    await c.updateOne({ chave: 'k' }, { $pull: { hist: { $gte: 4 } } });
    await c.updateOne({ chave: 'k' }, { $unset: { tipo: '' } });
    d = await c.findOne({ chave: 'k' });
    assert.equal(d.pct, 40, '$max não diminui');
    assert.deepEqual(d.hist, [2, 3]);
    assert.deepEqual(d.tags, ['a', 'b']);
    assert.equal('tipo' in d, false);
    await assert.rejects(c.updateOne({ chave: 'k' }, { $set: { _id: new ObjectId() } }), e => e.code === 66);
    const sem = await c.updateOne({ chave: 'nao' }, { $set: { a: 1 } });
    assert.deepEqual([sem.matchedCount, sem.modifiedCount, sem.upsertedId], [0, 0, null]);
    const many = await c.updateMany({}, { $set: { marcado: true } });
    assert.equal(many.matchedCount, 1);
  });

  test('findOneAndUpdate: consumo atômico de token (corrida com portão → só uma passa)', async () => {
    const t = b.collection('auth_tokens');
    const expira = new Date('2026-10-18T12:15:00Z');
    await t.insertOne({ hash: 'th', tipo: 'link_magico', usadoEm: null, expiraEm: expira });
    let abrir;
    b.portoes.findOneAndUpdate = new Promise(r => { abrir = r; });
    const consumir = () => t.findOneAndUpdate(
      { hash: 'th', tipo: 'link_magico', usadoEm: null, expiraEm: { $gt: new Date('2026-10-18T12:00:00Z') } },
      { $set: { usadoEm: new Date('2026-10-18T12:00:01Z') } },
      { returnDocument: 'after' }
    );
    const p1 = consumir();
    const p2 = consumir();
    abrir();
    const [r1, r2] = await Promise.all([p1, p2]);
    delete b.portoes.findOneAndUpdate;
    assert.equal([r1, r2].filter(Boolean).length, 1);
    assert.ok((r1 || r2).usadoEm instanceof Date);
    assert.equal(await t.findOneAndUpdate({ hash: 'th', usadoEm: null }, { $set: { usadoEm: new Date() } }), null);
    const meta = await t.findOneAndUpdate({ hash: 'novo' }, { $set: { usadoEm: null } }, { upsert: true, returnDocument: 'after', includeResultMetadata: true });
    assert.equal(meta.ok, 1);
    assert.equal(meta.value.hash, 'novo');
  });

  test('insertMany ordered:false segue e lança MongoBulkWriteError; ordered:true para', async () => {
    const n = criarBancoMemoria({ indices: [{ colecao: 'notificacoes', chave: { userId: 1, chave: 1 }, opcoes: { name: 'uq_not_chave', unique: true, partialFilterExpression: { chave: { $type: 'string' } } } }] });
    const c = n.collection('notificacoes');
    await c.insertOne({ userId: 'u1', chave: 'k' });
    await assert.rejects(c.insertMany([{ userId: 'u1', chave: 'k' }, { userId: 'u2', chave: 'k' }, { userId: 'u1', chave: null }, { userId: 'u1', chave: null }], { ordered: false }), (e) => {
      assert.equal(e.name, 'MongoBulkWriteError');
      assert.equal(e.code, 11000);
      assert.deepEqual(e.writeErrors.map(w => w.index), [0]);
      assert.equal(e.insertedCount, 3);
      return true;
    });
    assert.equal(await c.countDocuments({}), 4);
    await assert.rejects(c.insertMany([{ userId: 'u3', chave: 'k' }, { userId: 'u3', chave: 'k' }, { userId: 'u4', chave: 'k' }]), e => e.insertedCount === 1);
    assert.equal(await c.countDocuments({ userId: 'u4' }), 0);
  });

  test('falha de rede injetada, insertOne muta o documento, Buffer volta como Binary, TTL', async () => {
    const f = criarBancoMemoria();
    f.falhar.findOne = 1;
    await assert.rejects(f.collection('a').findOne({}), e => e.name === 'MongoNetworkError');
    assert.equal(await f.collection('a').findOne({}), null, 'só a próxima chamada falhou');
    f.falhar.insertOne = 'b';
    await assert.rejects(f.collection('b').insertOne({}), e => E.ehErroDeRedeMongo(e));
    await f.collection('a').insertOne({});
    f.falhar = {};
    const doc = { nome: 'x', dados: Buffer.from('conteudo') };
    const { insertedId } = await f.collection('arquivos').insertOne(doc);
    assert.ok(doc._id instanceof ObjectId && doc._id.equals(insertedId));
    const lido = await f.collection('arquivos').findOne({ _id: insertedId });
    assert.ok(lido.dados instanceof Binary);
    assert.equal(Buffer.from(lido.dados.buffer).toString(), 'conteudo');
    lido.nome = 'alterado';
    assert.equal((await f.collection('arquivos').findOne({ _id: insertedId })).nome, 'x', 'devolve cópia');
    await f.collection('limites').createIndex({ expiraEm: 1 }, { name: 'ttl_limites', expireAfterSeconds: 0 });
    await f.collection('limites').insertMany([{ expiraEm: new Date('2026-10-18T11:00:00Z') }, { expiraEm: new Date('2026-10-18T13:00:00Z') }]);
    assert.equal(f.expirar(new Date('2026-10-18T12:00:00Z')), 1);
    assert.equal(await f.collection('limites').countDocuments({}), 1);
  });
});

// =============================================================
// Apoio: fixtures, falsos e http
// =============================================================
describe('apoio — fixtures do portal', () => {
  let banco;
  let dados;
  before(async () => {
    banco = criarBancoMemoria();
    dados = await semear(banco);
  });

  test('cursos, módulos, aulas ("em breve"), turmas, usuários, liberações, matrículas e docências', async () => {
    assert.equal(await banco.collection('cursos').countDocuments({}), 2);
    assert.equal((await banco.collection('cursos').findOne({ _id: 'curso-01' })).sigla, 'APE');
    assert.equal((await banco.collection('cursos').findOne({ _id: 'curso-02' })).sigla, undefined);
    assert.equal(await banco.collection('modulos').countDocuments({ cursoId: 'curso-01' }), 2);
    assert.equal(await banco.collection('aulas').countDocuments({ moduloId: { $in: ['c01-m01', 'c01-m02'] } }), 6);
    assert.equal(await banco.collection('aulas').countDocuments({ disponivel: false }), 1);
    assert.equal(await banco.collection('users').countDocuments({}), 9);
    assert.equal(await banco.collection('liberacoes').countDocuments({ cursoId: 'curso-01' }), 2);
    assert.equal(await banco.collection('liberacoes').countDocuments({ userId: IDS['u-intruso'] }), 0);
    const m1 = await banco.collection('matriculas').findOne({ userId: IDS['u-aluno1'] });
    assert.ok(m1.turmaId.equals(oid('T1')));
    assert.match(m1.numero, C.CODIGO_ANUAL_RE.MAT);
    const docT1 = await banco.collection('docencias').findOne({ userId: IDS['u-prof-t1'] });
    assert.ok(docT1.turmaId.equals(oid('T1')));
    assert.equal((await banco.collection('docencias').findOne({ userId: IDS['u-prof'] })).turmaId, null);
    const ex = await banco.collection('users').findOne({ _id: oid('u-ex') });
    assert.equal(ex.papel, 'aluno');
    assert.equal(await banco.collection('docencias').countDocuments({ userId: IDS['u-ex'] }), 1, 'rebaixado com docência gravada');
    assert.equal(idDe('u-admin'), IDS['u-admin']);
    assert.throws(() => idDe('u-nao-existe'), /desconhecida/);
  });

  test('senha das contas confere com SENHA_FIXTURE; u-temp e u-2fa com os estados certos', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const temp = await banco.collection('users').findOne({ _id: oid('u-temp') });
    assert.equal(await bcrypt.compare(SENHA_FIXTURE, temp.senhaHash), true);
    assert.equal(temp.senhaTemporaria, true);
    assert.equal(temp.senhaTemporariaExpiraEm.getTime() - dados.agora.getTime(), 72 * 3600 * 1000);
    const a2 = await banco.collection('auth_2fa').findOne({ userId: IDS['u-2fa'] });
    const { texto } = K.criarCripto({ material: MATERIAL_TESTE }).decifrar(a2.segredo, 'totp', T.aadDoSegredo(IDS['u-2fa']));
    assert.equal(texto, SEGREDO_TOTP_FIXTURE);
    assert.equal(a2.codigos.length, 10);
    assert.equal(a2.codigos[0].hash, K.criarCripto({ material: MATERIAL_TESTE }).hmacCodigoRecuperacao(CODIGOS_RECUPERACAO_FIXTURE[0]));
    assert.ok(!JSON.stringify(a2).includes(SEGREDO_TOTP_FIXTURE), 'segredo só cifrado');
  });
});

describe('apoio — falsos', () => {
  test('geradores determinísticos', () => {
    assert.equal(gerarCpfValido('x'), gerarCpfValido('x'));
    assert.notEqual(gerarCpfValido('x'), gerarCpfValido('y'));
    assert.ok(bytesFixos('a')(5).equals(bytesFixos('a')(5)));
    const ri = randomInt('r');
    const v = ri(1, 7);
    assert.ok(v >= 1 && v < 7);
    assert.equal(randomInt('r')(1, 7), v);
    const r = relogio('2026-10-18T12:00:00Z');
    assert.equal(r().toISOString(), '2026-10-18T12:00:00.000Z');
    r.avancar(1000);
    assert.equal(r.ms(), Date.parse('2026-10-18T12:00:01Z'));
  });

  test('arquivos: PDF, PNG (CRC), JPEG com Exif, WebP, HTML disfarçado', () => {
    assert.ok(pdfMinimo().toString('latin1').startsWith('%PDF-1.4'));
    assert.ok(pdfMinimo().toString('latin1').trimEnd().endsWith('%%EOF'));
    assert.ok(!/JavaScript/.test(pdfMinimo().toString('latin1')));
    assert.ok(/\/S \/JavaScript/.test(pdfComJavascript().toString('latin1')));
    const png = pngMinimo();
    assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    assert.ok(pngComTexto().includes(Buffer.from('tEXt')));
    assert.ok(!png.includes(Buffer.from('tEXt')));
    const jpg = jpegComExif();
    assert.deepEqual([...jpg.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe1]);
    assert.ok(jpg.includes(Buffer.from('Exif\0\0', 'latin1')));
    assert.ok(!jpegMinimo().includes(Buffer.from('Exif', 'latin1')));
    for (const w of [webpMinimo(), webpComExif()]) {
      assert.equal(w.subarray(0, 4).toString(), 'RIFF');
      assert.equal(w.readUInt32LE(4), w.length - 8, 'tamanho RIFF coerente');
      assert.equal(w.subarray(8, 12).toString(), 'WEBP');
    }
    assert.ok(webpComExif().includes(Buffer.from('EXIF')));
    assert.ok(htmlDisfarcado().toString().startsWith('<!doctype html>'));
  });

  test('fetchFalso grava chamadas; modo "nunca" respeita AbortSignal; erro de rede', async () => {
    const f = fetchFalso([{ status: 201, json: { ok: true } }, { erro: new TypeError('fetch failed') }]);
    const r = await f('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer re_x' }, body: JSON.stringify({ to: 'a' }) });
    assert.equal(r.status, 201);
    assert.deepEqual(await r.json(), { ok: true });
    assert.deepEqual(f.chamadas[0], { url: 'https://api.resend.com/emails', metodo: 'POST', headers: { authorization: 'Bearer re_x' }, corpo: { to: 'a' } });
    await assert.rejects(f('https://x'), /fetch failed/);
    const nunca = fetchFalso('nunca');
    const inicio = Date.now();
    await assert.rejects(nunca('https://x', { signal: AbortSignal.timeout(30) }), e => e.name === 'AbortError' || e.name === 'TimeoutError');
    assert.ok(Date.now() - inicio < 1000);
  });

  test('provedorGeminiFalso: modelo e generateContent roteirizado', async () => {
    const g = provedorGeminiFalso([{ texto: 'Olá.' }, { functionCall: { name: 'meusCursos', args: {} } }]);
    const m = await g('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash', { headers: { 'x-goog-api-key': 'k' } });
    assert.deepEqual((await m.json()).supportedGenerationMethods.includes('generateContent'), true);
    const r1 = await (await g('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', { method: 'POST', body: '{}' })).json();
    assert.equal(r1.candidates[0].content.parts[0].text, 'Olá.');
    const r2 = await (await g('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', { method: 'POST', body: '{}' })).json();
    assert.equal(r2.candidates[0].content.parts[0].functionCall.name, 'meusCursos');
    assert.equal(g.chamadas[0].headers['x-goog-api-key'], 'k');
  });

  test('servicosFalsos: registra, grava chamadas e o ausente lança servico-indisponivel', async () => {
    const s = servicosFalsos({ 'secretaria.matriculaVigente': async (u, c) => ({ u, c }) }, { grupos: { busca: [{ tipo: 'cursos' }] } });
    assert.deepEqual(await s.obter('secretaria.matriculaVigente')('u1', 'c1'), { u: 'u1', c: 'c1' });
    assert.deepEqual(s.chamadas['secretaria.matriculaVigente'], [['u1', 'c1']]);
    assert.equal(s.tentar('nao.existe'), null);
    const e = pegarErro(() => s.obter('nao.existe'));
    assert.equal(e.codigo, 'servico-indisponivel');
    assert.deepEqual(s.todos('busca'), [{ tipo: 'cursos' }]);
    assert.throws(() => s.registrar('secretaria.matriculaVigente', () => {}), /já registrado/);
    const outro = servicosFalsos({}, { em: s });
    assert.equal(outro, s, 'com `em`, registra no localizador dado');
  });
});

describe('apoio — http e usuarioDeTeste', () => {
  let srv;
  let api;
  let banco;
  before(async () => {
    banco = criarBancoMemoria();
    await semear(banco);
    await banco.collection('users').updateOne({ _id: oid('u-intruso') }, { $set: { desativadoEm: new Date() } });
    const app = criarAppDeTeste({ banco, montar: (a) => {
      a.get('/api/quem', (req, res) => res.json({ id: req.user ? String(req.user._id) : null }));
      a.get('/api/erro', () => { throw new Error('x'); });
    } });
    const direto = express();
    direto.locals.banco = banco;
    direto.use(usuarioDeTeste);
    direto.get('/quem', (req, res) => res.json({ id: req.user ? String(req.user._id) : null }));
    app.use('/direto', direto);
    srv = await subir(app);
    api = cliente(srv.base);
  });
  after(() => fechar(srv?.server));

  test('cabeçalho x-teste-usuario com nome de fixture ou hex', async () => {
    assert.deepEqual((await api.get('/api/quem', { usuario: 'u-aluno1' })).corpo, { id: IDS['u-aluno1'] });
    assert.deepEqual((await api.get('/api/quem', { usuario: IDS['u-prof'] })).corpo, { id: IDS['u-prof'] });
    assert.deepEqual((await api.get('/api/quem')).corpo, { id: null });
    assert.deepEqual((await api.get('/api/quem', { usuario: 'lixo' })).corpo, { id: null });
  });

  test('conta desativada fica anônima (papel do loadUser)', async () => {
    assert.deepEqual((await api.get('/api/quem', { usuario: 'u-intruso' })).corpo, { id: null });
  });

  test('uso direto com app.locals.banco; 404 JSON e handler global no app de teste', async () => {
    assert.deepEqual((await api.get('/direto/quem', { usuario: 'u-admin' })).corpo, { id: IDS['u-admin'] });
    const nf = await api.get('/api/nao-existe');
    assert.equal(nf.status, 404);
    assert.deepEqual(nf.corpo, { error: 'Rota não encontrada.' });
    const mock500 = mock.method(console, 'error', () => {});
    try {
      const r = await api.get('/api/erro');
      assert.equal(r.status, 500);
      assert.deepEqual(r.corpo, { error: 'Erro interno no servidor.' });
      assert.equal(mock500.mock.callCount(), 1);
    } finally {
      mock500.mock.restore();
    }
  });
});
