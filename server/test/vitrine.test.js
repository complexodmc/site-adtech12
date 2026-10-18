// Testes de /api/vitrine sem MongoDB: `listar` e as coleções são injetados.
// Rode com `npm test` na raiz.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  criarRotaVitrine, criarListagemVitrine, paraVitrine,
  CAMPOS_VITRINE, CACHE_VITRINE, PROJECAO_CURSO, MENSAGEM_503
} from '../src/routes/vitrine.js';

const silencioso = { log() {}, warn() {}, error() {} };

// Tudo o que um curso tem no banco — inclusive o que não pode vazar.
const cursoCheio = (over = {}) => ({
  _id: 'holding-patrimonial',
  titulo: 'Holding Patrimonial',
  subtitulo: 'Estruturação e governança',
  descricao: 'Descrição do curso.',
  cargaHoraria: '12h',
  modalidade: 'Online',
  iconeKey: 'building',
  preco: 1997,
  linkCheckout: 'https://pagamento.exemplo/checkout-secreto',
  beneficios: ['Certificado'],
  ordem: 2,
  isAtivo: true,
  capaUrl: '/api/capas/capa-abc123.webp',
  capa: { arquivo: 'capa-abc123.webp', dados: Buffer.from('binario-da-capa') },
  roteiro: 'roteiro-interno-de-gravacao',
  videoUrl: 'https://player.vimeo.com/video/video-secreto',
  materiais: [{ nome: 'apostila-privada.pdf' }],
  modulos: 3,
  aulas: 9,
  ...over
});

// Nada disto pode aparecer no JSON público.
const VAZAMENTOS = [
  'videoUrl', 'video-secreto', 'materiais', 'apostila-privada', 'roteiro', 'linkCheckout', 'checkout-secreto',
  'preco', '1997', 'beneficios', 'binario-da-capa', '"capa"', 'isAtivo', '"ordem"', '"_id"'
];

async function subir(app) {
  let server;
  await new Promise((ok) => { server = app.listen(0, '127.0.0.1', ok); });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

function montarApp(listar) {
  const app = express();
  app.use('/api/vitrine', criarRotaVitrine({ listar, log: silencioso }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  return app;
}

describe('paraVitrine (whitelist do contrato)', () => {
  test('só os campos do contrato, com os valores do curso', () => {
    const v = paraVitrine(cursoCheio());
    assert.deepEqual(Object.keys(v), [...CAMPOS_VITRINE]);
    assert.deepEqual(v, {
      id: 'holding-patrimonial',
      titulo: 'Holding Patrimonial',
      subtitulo: 'Estruturação e governança',
      descricao: 'Descrição do curso.',
      cargaHoraria: '12h',
      modalidade: 'Online',
      iconeKey: 'building',
      capaUrl: '/api/capas/capa-abc123.webp',
      modulos: 3,
      aulas: 9
    });
  });

  test('padrões do catálogo e contagens inválidas viram 0', () => {
    const v = paraVitrine({ _id: 'x', titulo: 'Curso', modalidade: '', iconeKey: null, modulos: -1, aulas: '7' });
    assert.equal(v.modalidade, 'Online');
    assert.equal(v.iconeKey, 'graduation');
    assert.equal(v.capaUrl, '');
    assert.equal(v.subtitulo, '');
    assert.equal(v.modulos, 0);
    assert.equal(v.aulas, 0, 'string não é contagem');
    assert.equal(paraVitrine({ id: 'y', modulos: [{}, {}], aulas: 2.5 }).modulos, 2, 'lista conta pelo tamanho');
    assert.equal(paraVitrine({ id: 'y', aulas: 2.5 }).aulas, 0);
    assert.equal(paraVitrine({ id: 'y', titulo: { $ne: 1 } }).titulo, '', 'objeto não vira texto');
  });
});

describe('GET /api/vitrine/cursos (HTTP, sem banco)', () => {
  let server;
  let base;
  let resposta = [];
  let falhar = false;

  before(async () => {
    const s = await subir(montarApp(async () => {
      if (falhar) {
        const e = new Error('connect ECONNREFUSED 127.0.0.1:27017');
        e.name = 'MongoServerSelectionError';
        throw e;
      }
      return resposta;
    }));
    server = s.server;
    base = s.base;
  });

  after(() => new Promise((ok) => server.close(ok)));

  test('200 público: só ativos, por ordem, sem nenhum campo privado, com cache de 5 min', async () => {
    resposta = [
      cursoCheio({ _id: 'c3', titulo: 'Terceiro', ordem: 3 }),
      cursoCheio({ _id: 'inativo', titulo: 'Inativo', ordem: 0, isAtivo: false }),
      cursoCheio({ _id: 'c1', titulo: 'Primeiro', ordem: 1, isAtivo: undefined }),
      cursoCheio({ _id: 'c2', titulo: 'Segundo', ordem: 2 })
    ];
    // Sem Authorization: a vitrine não exige sessão.
    const r = await fetch(`${base}/api/vitrine/cursos`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), CACHE_VITRINE);
    assert.equal(CACHE_VITRINE, 'public, max-age=300');
    assert.match(r.headers.get('content-type'), /application\/json/);
    const texto = await r.text();
    for (const proibido of VAZAMENTOS) assert.equal(texto.includes(proibido), false, `vazou ${proibido}`);
    const j = JSON.parse(texto);
    assert.deepEqual(Object.keys(j), ['cursos']);
    assert.deepEqual(j.cursos.map(c => c.id), ['c1', 'c2', 'c3'], 'inativo fora; ordem crescente');
    for (const c of j.cursos) assert.deepEqual(Object.keys(c), [...CAMPOS_VITRINE]);
    assert.equal(j.cursos[0].modulos, 3);
    assert.equal(j.cursos[0].aulas, 9);
  });

  test('token inválido não atrapalha (rota pública)', async () => {
    resposta = [cursoCheio()];
    const r = await fetch(`${base}/api/vitrine/cursos`, { headers: { Authorization: 'Bearer lixo' } });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).cursos.length, 1);
  });

  test('lista vazia ou formato inesperado → 200 { cursos: [] }', async () => {
    for (const vazio of [[], null, { cursos: [cursoCheio()] }, [null, 'x', 3]]) {
      resposta = vazio;
      const r = await fetch(`${base}/api/vitrine/cursos`);
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { cursos: [] });
    }
  });

  test('falha de banco → 503 JSON sem cache e sem lista', async () => {
    falhar = true;
    try {
      const r = await fetch(`${base}/api/vitrine/cursos`);
      assert.equal(r.status, 503);
      assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await r.json(), { error: MENSAGEM_503 });
    } finally {
      falhar = false;
    }
  });

  test('só leitura: POST não existe', async () => {
    const r = await fetch(`${base}/api/vitrine/cursos`, { method: 'POST' });
    assert.equal(r.status, 404);
  });
});

// Coleções falsas: registram a consulta e devolvem dados prontos.
function colecoesFalsas({ cursos = [], modulos = [], grupos = [] } = {}) {
  const chamadas = { cursos: [], modulos: [], aulas: [] };
  const cursor = (lista, registro) => ({
    sort(s) { registro.sort = s; return this; },
    toArray: async () => lista
  });
  return {
    chamadas,
    cursos: () => ({
      find(filtro, opcoes) {
        const r = { filtro, opcoes };
        chamadas.cursos.push(r);
        return cursor(cursos, r);
      }
    }),
    modulos: () => ({
      find(filtro, opcoes) {
        const r = { filtro, opcoes };
        chamadas.modulos.push(r);
        return cursor(modulos, r);
      }
    }),
    aulas: () => ({
      aggregate(pipeline) {
        chamadas.aulas.push(pipeline);
        return { toArray: async () => grupos };
      }
    })
  };
}

const capaUrlFalsa = (c) => (c && c.capa && c.capa.arquivo ? `/api/capas/${c.capa.arquivo}` : '');

describe('criarListagemVitrine (consultas reais, coleções falsas)', () => {
  test('contagens reais por curso; consulta sem vídeo, material, roteiro, checkout, preço ou binário da capa', async () => {
    const f = colecoesFalsas({
      cursos: [
        { _id: 'a', titulo: 'A', ordem: 1, isAtivo: true, capa: { arquivo: 'capa-a.webp' } },
        { _id: 'b', titulo: 'B', ordem: 2 },
        { _id: 'c', titulo: 'C', ordem: 3 }
      ],
      modulos: [
        { _id: 'm1', cursoId: 'a' }, { _id: 'm2', cursoId: 'a' }, { _id: 'm3', cursoId: 'b' }
      ],
      grupos: [{ _id: 'm1', n: 3 }, { _id: 'm2', n: 2 }, { _id: 'm-orfao', n: 7 }]
    });
    const listar = criarListagemVitrine({ cursos: f.cursos, modulos: f.modulos, aulas: f.aulas, capaUrl: capaUrlFalsa });
    const lista = await listar();

    assert.deepEqual(lista.map(c => [c.id, c.modulos, c.aulas]), [['a', 2, 5], ['b', 1, 0], ['c', 0, 0]]);
    assert.equal(lista[0].capaUrl, '/api/capas/capa-a.webp');
    assert.equal(lista[1].capaUrl, '');

    const [qc] = f.chamadas.cursos;
    assert.deepEqual(qc.filtro, { isAtivo: { $ne: false } });
    assert.deepEqual(qc.sort, { ordem: 1 });
    assert.deepEqual(qc.opcoes.projection, { ...PROJECAO_CURSO });
    const campos = Object.keys(qc.opcoes.projection);
    for (const privado of ['videoUrl', 'materiais', 'roteiro', 'linkCheckout', 'preco', 'beneficios', 'capa', 'capa.dados']) {
      assert.equal(campos.includes(privado), false, `projeção pede ${privado}`);
    }
    assert.ok(campos.includes('capa.arquivo'), 'capaUrl precisa só do nome do arquivo');

    const [qm] = f.chamadas.modulos;
    assert.deepEqual(qm.filtro, { cursoId: { $in: ['a', 'b', 'c'] } });
    assert.deepEqual(qm.opcoes.projection, { _id: 1, cursoId: 1 });

    assert.deepEqual(f.chamadas.aulas[0], [
      { $match: { moduloId: { $in: ['m1', 'm2', 'm3'] } } },
      { $group: { _id: '$moduloId', n: { $sum: 1 } } }
    ]);
  });

  test('ponta a ponta com a rota: o JSON sai só com o contrato', async () => {
    const f = colecoesFalsas({
      // A coleção falsa ignora a projeção e devolve tudo: a garantia não depende dela.
      cursos: [cursoCheio({ _id: 'a', ordem: 1, modulos: undefined, aulas: undefined })],
      modulos: [{ _id: 'm1', cursoId: 'a' }],
      grupos: [{ _id: 'm1', n: 4 }]
    });
    const s = await subir(montarApp(criarListagemVitrine({ cursos: f.cursos, modulos: f.modulos, aulas: f.aulas, capaUrl: capaUrlFalsa })));
    try {
      const r = await fetch(`${s.base}/api/vitrine/cursos`);
      assert.equal(r.status, 200);
      const texto = await r.text();
      for (const proibido of VAZAMENTOS) assert.equal(texto.includes(proibido), false, `vazou ${proibido}`);
      assert.deepEqual(JSON.parse(texto).cursos, [{
        id: 'a', titulo: 'Holding Patrimonial', subtitulo: 'Estruturação e governança', descricao: 'Descrição do curso.',
        cargaHoraria: '12h', modalidade: 'Online', iconeKey: 'building', capaUrl: '/api/capas/capa-abc123.webp',
        modulos: 1, aulas: 4
      }]);
    } finally {
      await new Promise((ok) => s.server.close(ok));
    }
  });

  test('sem cursos não consulta módulos; sem módulos não agrega aulas', async () => {
    const vazio = colecoesFalsas();
    assert.deepEqual(await criarListagemVitrine(vazio)(), []);
    assert.equal(vazio.chamadas.modulos.length, 0);

    const semModulos = colecoesFalsas({ cursos: [{ _id: 'a', ordem: 1 }] });
    const lista = await criarListagemVitrine(semModulos)();
    assert.deepEqual(lista.map(c => [c.id, c.modulos, c.aulas, c.capaUrl]), [['a', 0, 0, '']]);
    assert.equal(semModulos.chamadas.aulas.length, 0);
  });

  test('falha do banco sobe (a rota transforma em 503)', async () => {
    const f = colecoesFalsas();
    const listar = criarListagemVitrine({
      ...f,
      cursos: () => ({ find: () => ({ sort() { return this; }, toArray: async () => { throw new Error('banco fora'); } }) })
    });
    await assert.rejects(listar(), /banco fora/);
  });

  test('dependências obrigatórias', () => {
    assert.throws(() => criarRotaVitrine({}), /listar/);
    const f = colecoesFalsas();
    assert.throws(() => criarListagemVitrine({ ...f, aulas: undefined }), /aulas/);
    assert.throws(() => criarListagemVitrine({ ...f, capaUrl: 'x' }), /capaUrl/);
  });
});
