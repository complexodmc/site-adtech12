// Portal · F0m — índices (indices.js), INDICES_LEGADOS e o emulador do Mongo.
// Casos da PORTAL-API §9.3 (linha portal-base-indices), DC-75 e DC-76.
// Nenhum Mongo real, nenhuma rede. Com QA_FATIA=<fatia>, a varredura de
// módulos reais importa só os da fatia (campo `fatia` de MODULOS_PADRAO);
// sem ela, os 27 (os ausentes são pulados).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import {
  registrarIndices, especificacoesRegistradas, especificacoesDasColecoes, criarGarantiaIndices, INDICES_NUCLEO, NOME_INDICE_RE
} from '../src/portal/indices.js';
import { criarBancoMemoria, INDICES_LEGADOS, erroDeRede } from './apoio/banco-memoria.js';
import { criarLogEspiao, silencioso } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTE_DB = fs.readFileSync(path.resolve(__dirname, '../src/db.js'), 'utf8');

/** Índices criados pelo db.js (leitura do fonte): [{ colecao, chave, opcoes }]. */
function indicesDoDbJs() {
  const colecoes = {};
  for (const m of FONTE_DB.matchAll(/(\w+):\s*\(\)\s*=>\s*getDb\(\)\.collection\('([^']+)'\)/g)) colecoes[m[1]] = m[2];
  const lista = [];
  for (const m of FONTE_DB.matchAll(/col\.(\w+)\(\)\.createIndex\((\{[^}]*\}),\s*(\{[^}]*\})\)/g)) {
    lista.push({ colecao: colecoes[m[1]], chave: vm.runInNewContext(`(${m[2]})`), opcoes: vm.runInNewContext(`(${m[3]})`) });
  }
  return lista;
}

const nomes = lista => lista.map(s => s.opcoes.name);

describe('núcleo de índices (F0a/F0m)', () => {
  test('o fonte do db.js foi lido (sanidade do parser)', () => {
    const db = indicesDoDbJs();
    assert.ok(db.length >= 20, `esperava ≥ 20 índices no db.js, li ${db.length}`);
    assert.ok(db.every(s => typeof s.colecao === 'string' && s.opcoes.name), 'cada createIndex com coleção e nome');
  });

  test('INDICES_NUCLEO: nomes no padrão, únicos e já registrados', () => {
    const n = nomes(INDICES_NUCLEO);
    assert.equal(new Set(n).size, n.length, 'nomes únicos');
    for (const s of INDICES_NUCLEO) {
      assert.match(s.opcoes.name, NOME_INDICE_RE);
      if (s.opcoes.name.startsWith('uq_')) assert.equal(s.opcoes.unique, true, s.opcoes.name);
      if (s.opcoes.name.startsWith('ttl_')) assert.equal(s.opcoes.expireAfterSeconds, 0, s.opcoes.name);
    }
    const registrados = new Set(nomes(especificacoesRegistradas()));
    for (const nome of n) assert.ok(registrados.has(nome), `${nome} registrado no carregamento`);
    // Coleções do núcleo da API §3.3 (as da F0t são registradas pelos módulos dela).
    assert.deepEqual([...new Set(INDICES_NUCLEO.map(s => s.colecao))].sort(), ['arquivos', 'auditoria', 'erros_servidor', 'limites', 'notificacoes']);
  });

  test('nomes únicos também contra INDICES_LEGADOS e contra TODO índice do db.js (nome e chave)', () => {
    const db = indicesDoDbJs();
    const nomesLegado = new Set([...nomes(INDICES_LEGADOS), ...nomes(db)]);
    for (const s of especificacoesRegistradas()) {
      assert.ok(!nomesLegado.has(s.opcoes.name), `${s.opcoes.name} colide com índice legado`);
      const mesmaChave = db.find(d => d.colecao === s.colecao && JSON.stringify(Object.entries(d.chave)) === JSON.stringify(Object.entries(s.chave)));
      assert.equal(mesmaChave, undefined, `${s.opcoes.name} repete a chave de ${mesmaChave?.opcoes?.name} (erro 85 no Mongo)`);
    }
  });

  test('INDICES_LEGADOS igual ao fonte do db.js (únicos de users, liberacoes, progresso e certificados) — DC-76', () => {
    const alvo = new Set(['users', 'liberacoes', 'progresso', 'certificados']);
    const doFonte = indicesDoDbJs().filter(s => alvo.has(s.colecao) && s.opcoes.unique === true)
      .map(s => `${s.colecao}|${s.opcoes.name}|${JSON.stringify(s.chave)}`).sort();
    const copia = INDICES_LEGADOS.map(s => `${s.colecao}|${s.opcoes.name}|${JSON.stringify(s.chave)}`).sort();
    assert.deepEqual(copia, doFonte);
  });

  test('especificacoesDasColecoes filtra por coleção (auth-extra garante só as suas)', () => {
    const so = especificacoesDasColecoes(['limites', 'auditoria']);
    assert.ok(so.length >= 8);
    assert.ok(so.every(s => s.colecao === 'limites' || s.colecao === 'auditoria'));
  });
});

describe('registrarIndices', () => {
  test('idêntico é idempotente; mesmo nome com outra forma lança e nada do lote entra', () => {
    const base = { colecao: 'teste_idem', chave: { a: 1 }, opcoes: { name: 'ix_teste_idem_a' } };
    registrarIndices([base]);
    registrarIndices([{ ...base, opcoes: { ...base.opcoes } }]);
    assert.equal(especificacoesRegistradas().filter(s => s.opcoes.name === 'ix_teste_idem_a').length, 1);

    const antes = especificacoesRegistradas().length;
    assert.throws(
      () => registrarIndices([
        { colecao: 'teste_idem', chave: { b: 1 }, opcoes: { name: 'ix_teste_idem_b' } },
        { colecao: 'teste_idem', chave: { c: 1 }, opcoes: { name: 'ix_teste_idem_a' } }
      ]),
      e => e.codigo === 'indice-conflitante'
    );
    assert.equal(especificacoesRegistradas().length, antes, 'lote é tudo ou nada');
    assert.ok(!nomes(especificacoesRegistradas()).includes('ix_teste_idem_b'));
  });

  test('mesma chave com outro nome na mesma coleção → conflito; com filtro parcial diferente é permitido', () => {
    registrarIndices([{ colecao: 'teste_chave', chave: { x: 1, y: -1 }, opcoes: { name: 'ix_teste_chave_xy' } }]);
    assert.throws(() => registrarIndices([{ colecao: 'teste_chave', chave: { x: 1, y: -1 }, opcoes: { name: 'ix_teste_chave_outro' } }]), e => e.codigo === 'indice-conflitante');
    registrarIndices([{ colecao: 'teste_chave', chave: { x: 1, y: -1 }, opcoes: { name: 'ix_teste_chave_xy_parcial', partialFilterExpression: { x: { $type: 'string' } } } }]);
  });

  test('padrão de nome: uq_ ⇔ unique; ttl_ ⇔ expireAfterSeconds; nome obrigatório', () => {
    assert.throws(() => registrarIndices([{ colecao: 'teste_nome', chave: { a: 1 }, opcoes: { name: 'uq_teste_nome' } }]), TypeError);
    assert.throws(() => registrarIndices([{ colecao: 'teste_nome', chave: { a: 1 }, opcoes: { name: 'ix_teste_nome', unique: true } }]), TypeError);
    assert.throws(() => registrarIndices([{ colecao: 'teste_nome', chave: { a: 1 }, opcoes: { name: 'ttl_teste_nome' } }]), TypeError);
    assert.throws(() => registrarIndices([{ colecao: 'teste_nome', chave: { a: 1 }, opcoes: { name: 'ix_teste', expireAfterSeconds: 0 } }]), TypeError);
    assert.throws(() => registrarIndices([{ colecao: 'teste_nome', chave: { a: 1 }, opcoes: {} }]), TypeError);
    assert.throws(() => registrarIndices([{ colecao: 'teste_nome', chave: { a: 2 }, opcoes: { name: 'ix_teste_dir' } }]), TypeError);
    assert.throws(() => registrarIndices([{ colecao: 'Teste Ruim', chave: { a: 1 }, opcoes: { name: 'ix_teste_col' } }]), TypeError);
  });

  test('a lista devolvida é somente leitura', () => {
    const lista = especificacoesRegistradas();
    assert.ok(Object.isFrozen(lista));
    assert.ok(Object.isFrozen(lista[0]) && Object.isFrozen(lista[0].opcoes));
  });
});

describe('criarGarantiaIndices', () => {
  const specA = { colecao: 'garantia_a', chave: { a: 1 }, opcoes: { name: 'ix_garantia_a' } };
  const specB = { colecao: 'garantia_b', chave: { b: 1 }, opcoes: { name: 'uq_garantia_b', unique: true } };

  test('duas chamadas concorrentes → 1 createIndex por especificação', async () => {
    const banco = criarBancoMemoria();
    let soltar;
    banco.portoes.createIndex = new Promise(r => { soltar = r; });
    const g = criarGarantiaIndices({ getDb: () => banco, log: silencioso, especificacoes: [specA, specB] });
    const p = Promise.all([g.garantir(), g.garantir(), g.garantir()]);
    soltar();
    await p;
    await g.garantir();
    assert.equal(banco.contagem('createIndex', 'garantia_a'), 1);
    assert.equal(banco.contagem('createIndex', 'garantia_b'), 1);
    assert.deepEqual(banco.indicesDe('garantia_b').map(i => i.opcoes.name), ['uq_garantia_b']);
  });

  test('registro global: cada especificação do núcleo uma vez; registrada depois roda na chamada seguinte', async () => {
    const banco = criarBancoMemoria();
    const g = criarGarantiaIndices({ getDb: () => banco, log: silencioso });
    await g.garantir();
    const total1 = banco.contagem('createIndex');
    assert.equal(total1, especificacoesRegistradas().length);
    for (const s of INDICES_NUCLEO) assert.ok(banco.indicesDe(s.colecao).some(i => i.opcoes.name === s.opcoes.name), s.opcoes.name);

    registrarIndices([{ colecao: 'garantia_depois', chave: { z: 1 }, opcoes: { name: 'ix_garantia_depois' } }]);
    await g.garantir();
    assert.equal(banco.contagem('createIndex'), total1 + 1, 'só a nova');
    assert.equal(banco.contagem('createIndex', 'garantia_depois'), 1);
  });

  test('falha de rede → rejeita (503 no agregador) e a próxima chamada tenta de novo', async () => {
    const banco = criarBancoMemoria();
    banco.falhar.createIndex = 1;
    const g = criarGarantiaIndices({ getDb: () => banco, log: silencioso, especificacoes: [specA, specB] });
    await assert.rejects(g.garantir(), e => e.name === 'MongoNetworkError');
    await g.garantir();
    assert.equal(banco.contagem('createIndex'), 3, 'a que falhou foi tentada 2×, a outra 1×');
    assert.equal(banco.indicesDe('garantia_a').length + banco.indicesDe('garantia_b').length, 2);
  });

  test('código 85/86 (índice já existe com outra forma) → loga sem dado e segue, sem repetir', async () => {
    const banco = criarBancoMemoria();
    await banco.collection('garantia_a').createIndex({ a: 1 }, { name: 'ix_garantia_a', sparse: true }); // 85 ao recriar
    await banco.collection('garantia_b').createIndex({ outro: 1 }, { name: 'uq_garantia_b', unique: true }); // 86
    const espiao = criarLogEspiao();
    const g = criarGarantiaIndices({ getDb: () => banco, log: espiao, especificacoes: [specA, specB] });
    await g.garantir();
    const erros = espiao.linhas.filter(l => l.nivel === 'error');
    assert.equal(erros.length, 2);
    assert.ok(erros.every(l => /portal\.indice/.test(l.texto)));
    assert.ok(erros.some(l => /ix_garantia_a/.test(l.texto)) && erros.some(l => /uq_garantia_b/.test(l.texto)));
    const antes = banco.contagem('createIndex');
    await g.garantir();
    assert.equal(banco.contagem('createIndex'), antes, 'não tenta de novo');
  });

  test('middleware: next() no sucesso e next(err) na falha de rede', async () => {
    const banco = criarBancoMemoria();
    const g = criarGarantiaIndices({ getDb: () => banco, log: silencioso, especificacoes: [specA] });
    banco.falhar.createIndex = 1;
    const r1 = await new Promise(res => g.middleware({}, {}, res));
    assert.equal(r1?.name, 'MongoNetworkError');
    const r2 = await new Promise(res => g.middleware({}, {}, res));
    assert.equal(r2, undefined);
  });
});

describe('emulador do Mongo com INDICES_LEGADOS (DC-76)', () => {
  test('2º insertOne em users com o mesmo e-mail → E11000 uq_users_email', async () => {
    const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
    await banco.collection('users').insertOne({ email: 'a@exemplo.invalid' });
    await assert.rejects(banco.collection('users').insertOne({ email: 'a@exemplo.invalid' }), e => e.code === 11000 && /uq_users_email/.test(e.message));
  });

  test('2º certificado do mesmo { userId, cursoId } → E11000 uq_certificados', async () => {
    const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
    await banco.collection('certificados').insertOne({ userId: 'u1', cursoId: 'c1', codigo: 'DMC-AAAA-BBBB' });
    await assert.rejects(banco.collection('certificados').insertOne({ userId: 'u1', cursoId: 'c1', codigo: 'DMC-CCCC-DDDD' }), e => e.code === 11000 && /uq_certificados\b/.test(e.message));
  });

  test('índice parcial do núcleo: uq_not_chave só vale com chave string', async () => {
    const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
    const col = banco.collection('notificacoes');
    await col.insertOne({ userId: 'u1', chave: null });
    await col.insertOne({ userId: 'u1', chave: null });
    await col.insertOne({ userId: 'u1', chave: 'k1' });
    await assert.rejects(col.insertOne({ userId: 'u1', chave: 'k1' }), e => e.code === 11000 && /uq_not_chave/.test(e.message));
  });
});

describe('varredura dos módulos reais (MODULOS_PADRAO; QA_FATIA restringe à fatia — DC-75)', () => {
  test('nomes de índice únicos entre os módulos montados e o núcleo, sem colidir com o legado', async () => {
    const { MODULOS_PADRAO, montarPortal } = await import('../src/portal/montar.js');
    const { criarServicos } = await import('../src/portal/servicos.js');
    const { requireAuth, requireAdmin } = await import('../src/auth.js');
    const fatia = process.env.QA_FATIA || null;
    const alvo = fatia ? MODULOS_PADRAO.filter(m => m.fatia === fatia) : MODULOS_PADRAO;
    const banco = criarBancoMemoria();
    const r = montarPortal({
      getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
      servicos: criarServicos(), modulos: alvo, falharCedo: false, log: silencioso
    });
    await r.carregar();
    const estado = r.estadoDoPortal();
    assert.deepEqual(estado.falhas, [], 'módulo presente que não monta é defeito da fatia dona');
    const db = indicesDoDbJs();
    const legado = new Set([...nomes(db), ...nomes(INDICES_LEGADOS)]);
    const vistos = new Map();
    for (const nome of nomes(INDICES_NUCLEO)) vistos.set(nome, 'núcleo');
    for (const [caminho, lista] of Object.entries(estado.indices)) {
      for (const nome of lista) {
        assert.match(nome, NOME_INDICE_RE, `${caminho}: ${nome}`);
        assert.ok(!legado.has(nome), `${caminho}: ${nome} colide com o db.js`);
        assert.ok(!vistos.has(nome), `${caminho}: ${nome} já registrado por ${vistos.get(nome)}`);
        vistos.set(nome, caminho);
      }
    }
    // Registro (núcleo + módulos) sem repetir a chave de um índice do db.js.
    for (const s of especificacoesRegistradas()) {
      const repetida = db.find(d => d.colecao === s.colecao && JSON.stringify(Object.entries(d.chave)) === JSON.stringify(Object.entries(s.chave)));
      assert.equal(repetida, undefined, `${s.opcoes.name} repete ${repetida?.opcoes?.name}`);
    }
    assert.equal(estado.carregados + estado.ausentes.length, alvo.length);
  });
});
