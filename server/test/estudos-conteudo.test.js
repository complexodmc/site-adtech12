// Portal · F1a — normalizarVideo (P1), Conteudo em seções, trilha, plano de ensino, materiais do
// módulo, busca de aulas e capas (PORTAL-API §4.11, §6.5, D-56). Banco em memória.
// Rode: NODE_ENV=test node --test server/test/estudos-conteudo.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';

const { criarBancoMemoria } = await import('./apoio/banco-memoria.js');
const { semear, IDS, AGORA_FIXTURE } = await import('./apoio/fixtures-portal.js');
const { subir, fechar, cliente, usuarioDeTeste } = await import('./apoio/http.js');
const {
  silencioso, pdfMinimo, pdfComJavascript, pngComTexto, jpegComExif, webpMinimo, htmlDisfarcado
} = await import('./apoio/falsos.js');
const { criarServicos, executarBusca } = await import('../src/portal/servicos.js');
const { tratarErroGlobal } = await import('../src/portal/erros.js');
const { montarPortal } = await import('../src/portal/montar.js');
const { normalizarVideo } = await import('../src/portal/estudos/video.js');
const { criarArquivos } = await import('../src/portal/arquivos.js');

const exigirLogin = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' }));
const soAdmin = [exigirLogin, (req, res, next) => (req.user.isAdmin ? next() : res.status(403).json({ error: 'Acesso restrito ao administrador.' }))];
const MODULO = { caminho: 'routes/portal-conteudo.js', fatia: 'F1a', importar: () => import('../src/routes/portal-conteudo.js') };

async function montarApp({ extras = {} } = {}) {
  const banco = criarBancoMemoria();
  await semear(banco);
  const servicos = criarServicos();
  for (const [n, f] of Object.entries(extras)) servicos.registrar(n, f);
  const portal = montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin, exigirAdmin: soAdmin, servicos, modulos: [MODULO], filtro: null,
    falharCedo: true, agora: () => new Date(AGORA_FIXTURE), log: silencioso
  });
  const app = express();
  app.use(express.json());
  app.use(usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(tratarErroGlobal);
  const { server, base } = await subir(app);
  return { banco, servicos, server, api: cliente(base), repo: n => banco.collection(n) };
}

const pdfCru = (api, caminho, buf, usuario) => api.raw(caminho, { method: 'POST', headers: { 'x-teste-usuario': usuario, 'content-type': 'application/pdf' }, body: buf });
const imgCru = (api, caminho, buf, usuario) => api.raw(caminho, { method: 'POST', headers: { 'x-teste-usuario': usuario, 'content-type': 'application/octet-stream' }, body: buf });

describe('normalizarVideo (§4.11, P1)', () => {
  const Y = 'dQw4w9WgXcQ';
  const NOCOOKIE = `https://www.youtube-nocookie.com/embed/${Y}?enablejsapi=1&rel=0&modestbranding=1`;
  const casos = [
    [`https://www.youtube.com/watch?v=${Y}`, { provedor: 'youtube', id: Y, src: NOCOOKIE, medivel: true }],
    [`https://youtu.be/${Y}`, { provedor: 'youtube', id: Y, src: NOCOOKIE }],
    [`https://youtube.com/shorts/${Y}`, { provedor: 'youtube', id: Y }],
    [`https://www.youtube.com/live/${Y}`, { provedor: 'youtube', id: Y }],
    [`https://www.youtube.com/embed/${Y}`, { provedor: 'youtube', id: Y }],
    [`https://www.youtube-nocookie.com/embed/${Y}`, { provedor: 'youtube', id: Y }],
    [`https://www.youtube.com/watch?v=${Y}&t=1m30s`, { inicioSeg: 90, src: `${NOCOOKIE}&start=90` }],
    [`https://youtu.be/${Y}?t=42`, { inicioSeg: 42 }],
    ['https://vimeo.com/76979871', { provedor: 'vimeo', id: '76979871', hash: null, src: 'https://player.vimeo.com/video/76979871?api=1&dnt=1', medivel: true }],
    ['https://vimeo.com/76979871/abc123def0', { provedor: 'vimeo', hash: 'abc123def0', src: 'https://player.vimeo.com/video/76979871?api=1&dnt=1&h=abc123def0' }],
    ['https://player.vimeo.com/video/76979871?h=abc123def0', { provedor: 'vimeo', hash: 'abc123def0' }],
    ['https://player.vimeo.com/video/76979871', { provedor: 'vimeo', hash: null }],
    ['https://cdn.exemplo.invalid/aulas/a1.mp4', { provedor: 'arquivo', id: null, src: 'https://cdn.exemplo.invalid/aulas/a1.mp4', medivel: true }],
    ['https://cdn.exemplo.invalid/aulas/a1.webm?token=x', { provedor: 'arquivo' }],
    ['/assets/videos/a.mp4', { provedor: 'arquivo', src: '/assets/videos/a.mp4', medivel: true }],
    ['/qa/video-teste.mp4', { provedor: 'arquivo' }],
    ['https://exemplo.invalid/pagina', { provedor: 'externo', medivel: false, src: 'https://exemplo.invalid/pagina' }],
    // host fora da lista nunca vira youtube/vimeo (o front não embute `externo`, só abre em nova aba)
    [`https://youtube.com.exemplo.invalid/watch?v=${Y}`, { provedor: 'externo', medivel: false }],
    [`https://exemplo.invalid/embed/${Y}`, { provedor: 'externo', medivel: false }],
    ['https://vimeo.com.exemplo.invalid/76979871', { provedor: 'externo', medivel: false }]
  ];
  for (const [url, esperado] of casos) {
    test(url, () => {
      const r = normalizarVideo(url);
      assert.ok(r, url);
      for (const [k, v] of Object.entries(esperado)) assert.deepEqual(r[k], v, `${url} → ${k}`);
    });
  }
  test('recusa javascript:, data:, http:, vazio, credenciais, ID inválido, ../ e // de mesma origem', () => {
    for (const u of ['javascript:alert(1)', 'data:video/mp4;base64,AAAA', `http://www.youtube.com/watch?v=${Y}`, '', '   ', null, 42, { href: 'x' },
      'https://user:senha@vimeo.com/1', 'https://www.youtube.com/watch?v=curto', '/../x.mp4', '/a/../x.mp4', '//host/x.mp4', '/x.mov', 'nao é url']) {
      assert.equal(normalizarVideo(u), null, String(u));
    }
  });
});

describe('Conteudo do módulo e trilha (§6.5)', () => {
  let ctx;
  before(async () => {
    ctx = await montarApp({
      extras: {
        'avaliacoes.resumoDoModulo': async (matriculaId, moduloId) => (moduloId === 'c01-m01' ? [
          { id: 'av-mod', tipo: 'modular', titulo: 'Avaliação do módulo', publicada: true, nQuestoes: 10, tentativasMax: 3, usadas: 0, restantes: 3, tempoLimiteMin: null, melhorNota: null, situacao: null, finalizada: false, feito: false },
          { id: 'av-prev', tipo: 'previa', titulo: 'Atividade prévia', publicada: true, nQuestoes: 5, tentativasMax: 1, usadas: 1, restantes: 0, tempoLimiteMin: 20, melhorNota: 8, situacao: null, finalizada: true, feito: true },
          { id: 'av-rasc', tipo: 'modular', titulo: 'Rascunho', publicada: false, nQuestoes: 0, tentativasMax: 1, usadas: 0, restantes: 1, tempoLimiteMin: null, melhorNota: null, situacao: null, finalizada: false, feito: false }
        ] : [])
      }
    });
    await ctx.repo('aulas').updateOne({ _id: 'c01-m01-a01' }, { $set: { videoUrl: 'https://youtu.be/dQw4w9WgXcQ', codigo: 'APE-M01-A01', rotuloEncontro: 'Sexta · noite' } });
    await ctx.repo('lives').insertOne({ _id: 'live-1', cursoId: 'curso-01', titulo: 'Encontro 2', inicioEm: new Date('2026-11-07T22:00:00Z'), aulaGravadaId: 'c01-m01-a02' });
    await ctx.repo('progresso').insertOne({ userId: IDS['u-aluno1'], aulaId: 'c01-m01-a01', completedAt: new Date(AGORA_FIXTURE) });
  });
  after(async () => { await fechar(ctx.server); });

  test('aluno: seções, contadores e sequencia na ordem; vídeo normalizado; aula em breve sem vídeo e fora do total', async () => {
    const r = await ctx.api.get('/api/portal/modulos/c01-m01/conteudo', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    const c = r.corpo;
    assert.deepEqual(c.curso, { id: 'curso-01', titulo: 'Curso de Teste APE', sigla: 'APE' });
    assert.equal(c.modulo.posicao, 1);
    assert.equal(c.modulo.totalModulos, 2);
    assert.equal(c.modulo.capaUrl, null);
    assert.equal(c.secoes.plano.total, 0, 'plano vazio fora do total');
    assert.equal(c.secoes.plano.item.vazio, true);
    const a1 = c.secoes.aulas.itens[0];
    assert.equal(a1.codigo, 'APE-M01-A01');
    assert.equal(a1.rotuloEncontro, 'Sexta · noite');
    assert.equal(a1.video.provedor, 'youtube');
    assert.equal(a1.video.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0&modestbranding=1');
    assert.equal(a1.concluida, true);
    assert.equal(a1.videoUrl, undefined, 'nunca a URL crua');
    const a2 = c.secoes.aulas.itens[1];
    assert.equal(a2.rotuloEncontro, 'Sábado · noite', 'derivado do encontro vinculado (fuso SP)');
    assert.equal(a2.encontro.id, 'live-1');
    assert.equal(c.secoes.aulas.total, 3);
    assert.equal(c.secoes.aulas.feitos, 1);
    assert.deepEqual(c.secoes.avaliacoes.itens.map(a => a.id), ['av-prev', 'av-mod'], 'prévia antes da modular; rascunho invisível');
    assert.equal(c.secoes.avaliacoes.feitos, 1);
    assert.deepEqual(c.sequencia, ['aula:c01-m01-a01', 'aula:c01-m01-a02', 'aula:c01-m01-a03', 'avaliacao:av-prev', 'avaliacao:av-mod']);
    assert.deepEqual(c.progresso, { itensFeitos: 2, itensTotal: 5, aulasConcluidas: 1, aulasTotal: 3, pct: 33 });
    assert.deepEqual(c.anterior, { moduloId: null });
    assert.deepEqual(c.proximo, { moduloId: 'c01-m02' });
    const m2 = await ctx.api.get('/api/portal/modulos/c01-m02/conteudo', { usuario: 'u-aluno1' });
    const emBreve = m2.corpo.secoes.aulas.itens.find(a => a.id === 'c01-m02-a03');
    assert.equal(emBreve.disponivel, false);
    assert.equal(emBreve.video, null);
    assert.equal(m2.corpo.secoes.aulas.total, 2);
    assert.ok(!m2.corpo.sequencia.includes('aula:c01-m02-a03'));
  });

  test('intruso 403; professor docente sem liberação 200 com feito/pctVideo null e avaliação não publicada visível', async () => {
    const i = await ctx.api.get('/api/portal/modulos/c01-m01/conteudo', { usuario: 'u-intruso' });
    assert.equal(i.status, 403);
    assert.equal(i.corpo.codigo, 'sem-acesso');
    const p = await ctx.api.get('/api/portal/modulos/c01-m01/conteudo', { usuario: 'u-prof' });
    assert.equal(p.status, 200);
    assert.ok(p.corpo.secoes.aulas.itens.every(a => a.pctVideo === null && a.concluida === null));
    assert.equal(p.corpo.secoes.aulas.feitos, null);
    assert.equal(p.corpo.progresso.itensFeitos, null);
    assert.ok(p.corpo.secoes.avaliacoes.itens.some(a => a.id === 'av-rasc' && a.publicada === false));
    assert.equal((await ctx.api.get('/api/portal/modulos/nao-existe/conteudo', { usuario: 'u-aluno1' })).status, 404);
    assert.equal((await ctx.api.get('/api/portal/modulos/c01-m01/conteudo')).status, 401);
  });

  test('trilha: módulos com progresso, numero/posição, capaUrl null e atual = 1ª pendente', async () => {
    const r = await ctx.api.get('/api/portal/cursos/curso-01/trilha', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.modulos.length, 2);
    const [m1, m2] = r.corpo.modulos;
    assert.equal(m1.numero, '01');
    assert.equal(m1.capaUrl, null);
    assert.equal(m1.situacao, null, 'sem F3a → null');
    assert.deepEqual(m1.progresso, { aulasConcluidas: 1, aulasTotal: 3, pct: 33, itensFeitos: 2, itensTotal: 5 });
    assert.equal(m1.concluido, false);
    assert.equal(m2.progresso.aulasTotal, 2);
    assert.deepEqual(r.corpo.atual, { moduloId: 'c01-m01', chave: 'aula:c01-m01-a02' });
    assert.equal((await ctx.api.get('/api/portal/cursos/curso-02/trilha', { usuario: 'u-aluno1' })).status, 403);
  });
});

describe('plano de ensino (§6.5, DC-61)', () => {
  let ctx;
  before(async () => { ctx = await montarApp(); });
  after(async () => { await fechar(ctx.server); });
  const URL_PLANO = '/api/portal/professor/modulos/c01-m01/plano';
  const PLANO = {
    versao: 0,
    ementa: 'Fundamentos do tema.\nSegunda linha.',
    objetivos: ['Entender o básico', '  ', 'Aplicar em casos'],
    bibliografia: { basica: ['Autor A. Obra. 2020.'], complementar: ['Autor B. Artigo. 2021.'] },
    cronograma: [{ encontro: 'Sexta · noite', data: '2026-11-07', tema: 'Abertura', aulaId: 'c01-m01-a01' }, { encontro: 'Sábado · manhã', data: null, tema: 'Casos', aulaId: null }]
  };

  test('docente geral grava; volta IGUAL em GET …/planos e no Conteudo; auditoria plano.alterado', async () => {
    const r = await ctx.api.put(URL_PLANO, PLANO, { usuario: 'u-prof' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.plano.versao, 1);
    assert.deepEqual(r.corpo.plano.objetivos, ['Entender o básico', 'Aplicar em casos'], 'item vazio descartado');
    const planos = await ctx.api.get('/api/portal/professor/cursos/curso-01/planos', { usuario: 'u-prof' });
    assert.equal(planos.status, 200);
    const doGet = planos.corpo.modulos.find(m => m.id === 'c01-m01').plano;
    const conteudo = await ctx.api.get('/api/portal/modulos/c01-m01/conteudo', { usuario: 'u-aluno1' });
    const item = conteudo.corpo.secoes.plano.item;
    for (const k of ['ementa', 'objetivos', 'bibliografia', 'cronograma', 'vazio', 'atualizadoEm']) assert.deepEqual(item[k], doGet[k], k);
    assert.equal(item.chave, 'plano:c01-m01');
    assert.equal(item.feito, false);
    assert.equal(conteudo.corpo.secoes.plano.total, 1);
    assert.equal(conteudo.corpo.sequencia[0], 'plano:c01-m01');
    const aud = await ctx.repo('auditoria').findOne({ acao: 'plano.alterado' });
    assert.equal(aud.entidade.id, 'c01-m01');
    // aulas do GET …/planos com rotulo e data do encontro vinculado
    await ctx.repo('lives').insertOne({ _id: 'live-9', cursoId: 'curso-01', titulo: 'E', inicioEm: new Date('2026-11-08T01:30:00Z'), aulaGravadaId: 'c01-m01-a02' });
    const p2 = await ctx.api.get('/api/portal/professor/cursos/curso-01/planos', { usuario: 'u-admin' });
    const a2 = p2.corpo.modulos[0].aulas.find(a => a.id === 'c01-m01-a02');
    assert.equal(a2.dataEncontro, '2026-11-07', 'dia em São Paulo (22h30 de 07/11)');
    assert.equal(a2.rotuloEncontro, 'Sábado · noite');
  });

  test('PUT só com objetivos não apaga a bibliografia; versão errada → 409; plano feito pelo aluno', async () => {
    const r = await ctx.api.put(URL_PLANO, { versao: 1, objetivos: ['Só um'] }, { usuario: 'u-prof' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.plano.bibliografia.basica, ['Autor A. Obra. 2020.']);
    assert.deepEqual(r.corpo.plano.objetivos, ['Só um']);
    const velho = await ctx.api.put(URL_PLANO, { versao: 1, ementa: 'x' }, { usuario: 'u-admin' });
    assert.equal(velho.status, 409);
    assert.equal(velho.corpo.codigo, 'conflito-versao');
    const f = await ctx.api.post('/api/portal/conteudo/feito', { chave: 'plano:c01-m01' }, { usuario: 'u-aluno1' });
    assert.equal(f.status, 200);
  });

  test('docente só de turma, aluno e ex-professor → 403; GET planos de intruso → 403', async () => {
    const t1 = await ctx.api.put(URL_PLANO, { versao: 2, ementa: 'x' }, { usuario: 'u-prof-t1' });
    assert.equal(t1.status, 403);
    assert.equal(t1.corpo.codigo, 'nao-docente');
    assert.equal((await ctx.api.put(URL_PLANO, { versao: 2 }, { usuario: 'u-aluno1' })).status, 403);
    assert.equal((await ctx.api.put(URL_PLANO, { versao: 2 }, { usuario: 'u-ex' })).status, 403);
    assert.equal((await ctx.api.get('/api/portal/professor/cursos/curso-02/planos', { usuario: 'u-prof' })).status, 403);
    assert.equal((await ctx.api.get('/api/portal/professor/cursos/curso-01/planos', { usuario: 'u-prof-t1' })).status, 200, 'docente de turma lê');
  });

  test('validação com `campos` por item e formato-invalido', async () => {
    const casos = [
      [{ objetivos: Array.from({ length: 31 }, (_, i) => `Objetivo ${i}`) }, 'objetivos'],
      [{ objetivos: ['a', 'b', 'c', 'd', 'x'.repeat(501)] }, 'objetivos.4'],
      [{ bibliografia: { basica: Array.from({ length: 51 }, (_, i) => `Ref ${i}`) } }, 'bibliografia.basica'],
      [{ cronograma: Array.from({ length: 61 }, (_, i) => ({ encontro: `E${i}`, tema: 'T' })) }, 'cronograma'],
      [{ cronograma: [{}, {}, {}, { encontro: 'E', tema: 'T', data: '2026-02-30' }] }, 'cronograma.3.data'],
      [{ cronograma: [{}, {}, {}, { encontro: 'E', tema: '  ', data: '2026-02-03' }] }, 'cronograma.3.tema'],
      [{ cronograma: [{ encontro: 'E', tema: 'T', aulaId: 'c01-m02-a01' }] }, 'cronograma.0.aulaId']
    ];
    for (const [corpo, campo] of casos) {
      const r = await ctx.api.put(URL_PLANO, { versao: 2, ...corpo }, { usuario: 'u-prof' });
      assert.equal(r.status, 400, campo);
      assert.equal(r.corpo.codigo, 'validacao', campo);
      assert.ok(Object.hasOwn(r.corpo.campos, campo), `${campo} em ${JSON.stringify(r.corpo.campos)}`);
    }
    for (const corpo of [{ objetivos: 'texto no lugar da lista' }, { ementa: { $gt: '' } }, { bibliografia: ['x'] }, { cronograma: 'x' }]) {
      const r = await ctx.api.put(URL_PLANO, { versao: 2, ...corpo }, { usuario: 'u-prof' });
      assert.equal(r.status, 400);
      assert.equal(r.corpo.codigo, 'formato-invalido', JSON.stringify(corpo));
    }
  });

  test('plano com ementa e listas vazias → vazio:true e fora do total', async () => {
    const r = await ctx.api.put(URL_PLANO, { versao: 2, ementa: '', objetivos: [], bibliografia: { basica: [], complementar: [] }, cronograma: [] }, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.plano.vazio, true);
    const c = await ctx.api.get('/api/portal/modulos/c01-m01/conteudo', { usuario: 'u-aluno1' });
    assert.equal(c.corpo.secoes.plano.total, 0);
    assert.ok(!c.corpo.sequencia.includes('plano:c01-m01'));
  });
});

describe('materiais do módulo e download (§6.5, §4.12)', () => {
  let ctx;
  before(async () => { ctx = await montarApp(); });
  after(async () => { await fechar(ctx.server); });
  const BASE = '/api/portal/professor/modulos/c01-m01/materiais';

  test('PDF 201; não-PDF/sem corpo 415; PDF ativo 415; categoria/nome inválidos 400; link http 400; docente de turma 403', async () => {
    const ok = await pdfCru(ctx.api, `${BASE}?nome=Texto-base.pdf&categoria=leitura`, pdfMinimo(), 'u-prof');
    assert.equal(ok.status, 201);
    assert.equal(ok.corpo.material.tipo, 'arquivo');
    assert.match(ok.corpo.material.url, /^\/api\/portal\/materiais\/[a-f0-9]{24}$/);
    ctx.matArquivo = ok.corpo.material;
    assert.equal((await pdfCru(ctx.api, `${BASE}?nome=x&categoria=leitura`, Buffer.from('<html></html>'), 'u-prof')).status, 415);
    assert.equal((await pdfCru(ctx.api, `${BASE}?nome=x&categoria=leitura`, Buffer.alloc(0), 'u-prof')).status, 415);
    const ativo = await pdfCru(ctx.api, `${BASE}?nome=x&categoria=leitura`, pdfComJavascript(), 'u-prof');
    assert.equal(ativo.status, 415);
    assert.equal(ativo.corpo.codigo, 'pdf-ativo');
    assert.equal((await pdfCru(ctx.api, `${BASE}?nome=x&categoria=video`, pdfMinimo(), 'u-prof')).status, 400);
    assert.equal((await pdfCru(ctx.api, `${BASE}?categoria=slides`, pdfMinimo(), 'u-prof')).status, 400);
    assert.equal((await pdfCru(ctx.api, `${BASE}?nome=x&categoria=leitura`, pdfMinimo(), 'u-prof-t1')).status, 403);
    const http = await ctx.api.post(`${BASE}/link`, { nome: 'Site', url: 'http://exemplo.invalid', categoria: 'complementar' }, { usuario: 'u-prof' });
    assert.equal(http.status, 400);
    assert.equal((await ctx.api.post(`${BASE}/link`, { nome: 'JS', url: 'javascript:alert(1)', categoria: 'complementar' }, { usuario: 'u-prof' })).status, 400);
    const link = await ctx.api.post(`${BASE}/link`, { nome: 'Site', url: 'https://exemplo.invalid/a', categoria: 'complementar' }, { usuario: 'u-admin' });
    assert.equal(link.status, 201);
    ctx.matLink = link.corpo.material;
  });

  test('acima do teto → 413 (teto de 4 MiB)', async () => {
    const grande = Buffer.concat([pdfMinimo(), Buffer.alloc(4 * 1024 * 1024 + 10, 0x20)]);
    const r = await pdfCru(ctx.api, `${BASE}?nome=x&categoria=leitura`, grande, 'u-prof');
    assert.equal(r.status, 413);
  });

  test('Conteudo lista por categoria; download confere acesso ANTES e marca feito; IDOR de outro contexto → 404', async () => {
    const c = await ctx.api.get('/api/portal/modulos/c01-m01/conteudo', { usuario: 'u-aluno1' });
    assert.deepEqual(c.corpo.secoes.materiais.itens.map(m => m.categoria), ['leitura', 'complementar']);
    assert.equal(c.corpo.secoes.materiais.itens[0].feito, false);
    assert.equal((await ctx.api.get(ctx.matArquivo.url, { usuario: 'u-intruso' })).status, 403);
    assert.equal(await ctx.repo('progresso_conteudo').countDocuments({}), 0);
    const d = await ctx.api.get(ctx.matArquivo.url, { usuario: 'u-aluno1' });
    assert.equal(d.status, 200);
    assert.equal(d.headers.get('content-type'), 'application/pdf');
    assert.match(d.headers.get('content-disposition'), /^attachment/);
    assert.equal(d.headers.get('cache-control'), 'private, no-store');
    const c2 = await ctx.api.get('/api/portal/modulos/c01-m01/conteudo', { usuario: 'u-aluno1' });
    assert.equal(c2.corpo.secoes.materiais.itens[0].feito, true);
    assert.equal(c2.corpo.secoes.materiais.feitos, 1);
    const arquivos = criarArquivos({ repo: ctx.repo });
    for (const contexto of ['contrato', 'documento', 'segunda_via']) {
      const s = await arquivos.salvar({ contexto, donoUserId: IDS['u-aluno1'], buf: pdfMinimo(), tipo: 'pdf', nomeDownload: contexto });
      assert.equal((await ctx.api.get(`/api/portal/materiais/${s.id}`, { usuario: 'u-aluno1' })).status, 404, contexto);
    }
    assert.equal((await ctx.api.get('/api/portal/materiais/nao-e-id', { usuario: 'u-aluno1' })).status, 404);
    // binário órfão (material removido do módulo) ou de outro material/curso → 404
    const orfao = await arquivos.salvar({ contexto: 'material', ref: { cursoId: 'curso-01', moduloId: 'c01-m01', materialId: 'mat-orfao00001' }, buf: pdfMinimo(), tipo: 'pdf', nomeDownload: 'x' });
    assert.equal((await ctx.api.get(`/api/portal/materiais/${orfao.id}`, { usuario: 'u-aluno1' })).status, 404);
    // material migrado preso a aula "em breve": aluno 403, docente geral 200
    const { ObjectId } = await import('mongodb');
    const emBreve = await arquivos.salvar({ contexto: 'material', ref: { cursoId: 'curso-01', moduloId: 'c01-m02', materialId: 'mat-embreve001', entidadeId: 'c01-m02-a03' }, buf: pdfMinimo(), tipo: 'pdf', nomeDownload: 'x' });
    await ctx.repo('aulas').updateOne({ _id: 'c01-m02-a03' }, { $set: { materiais: [{ id: 'mat-embreve001', tipo: 'arquivo', nome: 'X.pdf', arquivoId: new ObjectId(emBreve.id), tamanho: 1 }] } });
    assert.equal((await ctx.api.get(`/api/portal/materiais/${emBreve.id}`, { usuario: 'u-aluno1' })).status, 403);
    assert.equal((await ctx.api.get(`/api/portal/materiais/${emBreve.id}`, { usuario: 'u-prof' })).status, 200);
  });

  test('PUT renomeia/categoria/ordem; DELETE apaga o binário junto; categoria de material legado da aula', async () => {
    const put = await ctx.api.put(`${BASE}/${ctx.matArquivo.id}`, { nome: 'Novo', categoria: 'slides', ordem: 5 }, { usuario: 'u-prof' });
    assert.equal(put.status, 200);
    assert.equal(put.corpo.material.categoria, 'slides');
    assert.equal((await ctx.api.put(`${BASE}/mat-nao-existe`, { nome: 'x' }, { usuario: 'u-prof' })).status, 404);
    const arqId = ctx.matArquivo.url.split('/').pop();
    const del = await ctx.api.del(`${BASE}/${ctx.matArquivo.id}`, { usuario: 'u-prof' });
    assert.equal(del.status, 200);
    assert.equal(await ctx.repo('arquivos').countDocuments({ contexto: 'material', 'ref.materialId': ctx.matArquivo.id }), 0, 'binário apagado');
    assert.equal((await ctx.api.get(`/api/portal/materiais/${arqId}`, { usuario: 'u-aluno1' })).status, 404);
    await ctx.repo('aulas').updateOne({ _id: 'c01-m01-a02' }, { $set: { materiais: [{ id: 'mat-legado0001', tipo: 'link', nome: 'L', url: 'https://exemplo.invalid' }] } });
    const cat = await ctx.api.put('/api/portal/professor/aulas/c01-m01-a02/materiais/mat-legado0001', { categoria: 'complementar' }, { usuario: 'u-prof' });
    assert.equal(cat.status, 200);
    assert.equal((await ctx.repo('aulas').findOne({ _id: 'c01-m01-a02' })).materiais[0].categoria, 'complementar');
  });

  test('PUT aulas/:id/academico grava rótulo e gera código com a sigla', async () => {
    const r = await ctx.api.put('/api/portal/professor/aulas/c01-m02-a02/academico', { rotuloEncontro: 'Sábado · manhã' }, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.aula, { id: 'c01-m02-a02', codigo: 'APE-M02-A02', rotuloEncontro: 'Sábado · manhã' });
    const semSigla = await ctx.api.put('/api/portal/professor/aulas/c02-m01-a01/academico', { rotuloEncontro: 'X' }, { usuario: 'u-admin' });
    assert.equal(semSigla.corpo.aula.codigo, null);
  });
});

describe('busca de aulas e cursos (grupo busca)', () => {
  let ctx;
  before(async () => { ctx = await montarApp(); await ctx.api.get('/api/portal/saude'); /* carga dos módulos */ });
  after(async () => { await fechar(ctx.server); });

  test('aulas só de curso acessível, sem videoUrl/materiais; cursos marcam bloqueado', async () => {
    const req = async u => ({ user: await ctx.repo('users').findOne({ _id: (await import('mongodb')).ObjectId.createFromHexString(IDS[u]) }) });
    const termos = [/aula/i];
    const intruso = await executarBusca(ctx.servicos, await req('u-intruso'), termos, { log: silencioso });
    assert.deepEqual(intruso.aulas.itens, []);
    assert.ok(intruso.cursos === undefined || intruso.cursos.itens.length === 0);
    const aluno = await executarBusca(ctx.servicos, await req('u-aluno1'), termos, { limite: 10, log: silencioso });
    assert.ok(aluno.aulas.itens.length > 0);
    for (const it of aluno.aulas.itens) {
      assert.match(it.href, /^aula\.html\?curso=curso-01&/);
      assert.equal(it.videoUrl, undefined);
      assert.equal(it.materiais, undefined);
    }
    assert.ok(!aluno.aulas.itens.some(i => i.id === 'c01-m02-a03'), 'em breve fora para aluno');
    const cursos = await executarBusca(ctx.servicos, await req('u-aluno1'), [/curso de teste/i], { log: silencioso });
    const c2 = cursos.cursos.itens.find(i => i.id === 'curso-02');
    assert.equal(c2.bloqueado, true);
    assert.match(c2.href, /^loja\.html\?destacar=curso-02$/);
  });
});

describe('capas (D-56)', () => {
  let ctx;
  before(async () => { ctx = await montarApp(); });
  after(async () => { await fechar(ctx.server); });

  test('admin envia capa vertical: metadados removidos, nome novo a cada envio, binário anterior apagado; pública com cache longo', async () => {
    const r1 = await imgCru(ctx.api, '/api/portal/admin/cursos/curso-01/capa-vertical', jpegComExif(), 'u-admin');
    assert.equal(r1.status, 200);
    assert.match(r1.corpo.capaVerticalUrl, /^\/api\/portal\/conteudo\/imagens\/cap-[a-f0-9]{12}\.jpg$/);
    const img = await ctx.api.raw(r1.corpo.capaVerticalUrl);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    const salvo = (await ctx.repo('arquivos').find({ contexto: 'capa' }).toArray())[0];
    assert.ok(!Buffer.from(salvo.dados.buffer ?? salvo.dados).includes(Buffer.from('Exif')), 'EXIF removido');
    const r2 = await imgCru(ctx.api, '/api/portal/admin/cursos/curso-01/capa-vertical', pngComTexto(), 'u-admin');
    assert.notEqual(r2.corpo.capaVerticalUrl, r1.corpo.capaVerticalUrl);
    assert.equal(await ctx.repo('arquivos').countDocuments({ contexto: 'capa' }), 1, 'anterior apagado');
    assert.equal((await ctx.api.raw(r1.corpo.capaVerticalUrl)).status, 404);
    const me = await ctx.api.get('/api/portal/me/cursos', { usuario: 'u-aluno1' });
    assert.equal(me.corpo.itens[0].curso.capaVerticalUrl, r2.corpo.capaVerticalUrl);
    assert.ok(await ctx.repo('auditoria').findOne({ acao: 'curso.capa_alterada' }));
  });

  test('capa do módulo aparece na trilha e no Conteudo; DELETE zera e apaga', async () => {
    const r = await imgCru(ctx.api, '/api/portal/admin/modulos/c01-m01/capa', webpMinimo(), 'u-admin');
    assert.equal(r.status, 200);
    const t = await ctx.api.get('/api/portal/cursos/curso-01/trilha', { usuario: 'u-aluno1' });
    assert.equal(t.corpo.modulos[0].capaUrl, r.corpo.capaUrl);
    const c = await ctx.api.get('/api/portal/modulos/c01-m01/conteudo', { usuario: 'u-aluno1' });
    assert.equal(c.corpo.modulo.capaUrl, r.corpo.capaUrl);
    const d = await ctx.api.del('/api/portal/admin/modulos/c01-m01/capa', { usuario: 'u-admin' });
    assert.equal(d.status, 200);
    assert.equal((await ctx.repo('modulos').findOne({ _id: 'c01-m01' })).capa, null);
    assert.equal((await ctx.api.raw(r.corpo.capaUrl)).status, 404);
    assert.ok(await ctx.repo('auditoria').findOne({ acao: 'modulo.capa_alterada' }));
  });

  test('GIF/HTML disfarçado → 415; > 1 MB → 413; professor e aluno → 403; nome fora do padrão → 404; curso inexistente 404', async () => {
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(40)]);
    assert.equal((await imgCru(ctx.api, '/api/portal/admin/cursos/curso-01/capa-vertical', gif, 'u-admin')).status, 415);
    assert.equal((await imgCru(ctx.api, '/api/portal/admin/cursos/curso-01/capa-vertical', htmlDisfarcado(), 'u-admin')).status, 415);
    const grande = Buffer.concat([jpegComExif(), Buffer.alloc(1024 * 1024 + 10)]);
    assert.equal((await imgCru(ctx.api, '/api/portal/admin/cursos/curso-01/capa-vertical', grande, 'u-admin')).status, 413);
    const prof = await imgCru(ctx.api, '/api/portal/admin/cursos/curso-01/capa-vertical', jpegComExif(), 'u-prof');
    assert.equal(prof.status, 403);
    assert.equal((await imgCru(ctx.api, '/api/portal/admin/cursos/curso-01/capa-vertical', jpegComExif(), 'u-aluno1')).status, 403);
    assert.equal((await ctx.api.raw('/api/portal/conteudo/imagens/qualquer.jpg')).status, 404);
    assert.equal((await ctx.api.raw('/api/portal/conteudo/imagens/cap-000000000000.jpg')).status, 404);
    assert.equal((await imgCru(ctx.api, '/api/portal/admin/cursos/nao-existe/capa-vertical', jpegComExif(), 'u-admin')).status, 404);
    const del = await ctx.api.del('/api/portal/admin/cursos/curso-01/capa-vertical', { usuario: 'u-admin' });
    assert.equal(del.status, 200);
  });
});

describe('varredura: nenhum segredo nem binário no JSON', () => {
  test('Conteudo e me/cursos não trazem senhaHash, videoUrl cru, dados de arquivo', async () => {
    const ctx = await montarApp();
    try {
      for (const u of ['/api/portal/me/cursos', '/api/portal/modulos/c01-m01/conteudo', '/api/portal/cursos/curso-01/trilha']) {
        const r = await ctx.api.get(u, { usuario: 'u-aluno1' });
        assert.equal(r.status, 200, u);
        assert.doesNotMatch(r.texto, /senhaHash|"videoUrl"|"dados"|segredo/, u);
      }
    } finally { await fechar(ctx.server); }
  });
});
