// Portal · F1a — rotas LEGADAS de estudos (catálogo, progresso, materiais) com as correções
// de autorização da PORTAL-API §7.1–§7.4 e o contrato preservado (D5, DC-74, DC-78).
// Banco em memória (test/apoio), nenhum Mongo real. Rode: NODE_ENV=test node --test server/test/estudos-legado.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';

const { criarBancoMemoria } = await import('./apoio/banco-memoria.js');
const { semear, IDS } = await import('./apoio/fixtures-portal.js');
const { subir, fechar, cliente, usuarioDeTeste } = await import('./apoio/http.js');
const { silencioso, pdfMinimo } = await import('./apoio/falsos.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { tratarErroGlobal } = await import('../src/portal/erros.js');
const { montarPortal } = await import('../src/portal/montar.js');
const { criarRotaCatalogo } = await import('../src/routes/catalogo.js');
const { criarRotaProgresso } = await import('../src/routes/progresso.js');
const { criarRotaMateriais } = await import('../src/routes/materiais.js');
const { criarArquivos } = await import('../src/portal/arquivos.js');

const exigirLogin = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' }));
const soAdmin = [exigirLogin, (req, res, next) => (req.user.isAdmin ? next() : res.status(403).json({ error: 'Acesso restrito ao administrador.' }))];

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dmc-f1a-materiais-'));

/** App no formato do server.js: [agregador opcional] → progresso → materiais → catálogo → 404 → erro global. */
async function montarApp({ servicos = criarServicos(), comPortal = null } = {}) {
  const banco = criarBancoMemoria();
  await semear(banco);
  const repo = nome => banco.collection(nome);
  const app = express();
  app.use(express.json());
  app.use(usuarioDeTeste({ banco }));
  if (comPortal) app.use('/api', comPortal({ banco, servicos }));
  app.use('/api/progresso', criarRotaProgresso({ repo, servicos, exigirLogin, log: silencioso }));
  app.use('/api', criarRotaMateriais({ repo, servicos, exigirLogin, exigirAdmin: soAdmin, materiaisDir: DIR, log: silencioso }));
  app.use('/api', criarRotaCatalogo({ repo, servicos, exigirLogin, exigirAdmin: soAdmin, log: silencioso }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(tratarErroGlobal);
  const { server, base } = await subir(app);
  return { banco, repo, servicos, server, api: cliente(base) };
}

const cursoDe = (corpo, id) => corpo.cursos.find(c => c.id === id);
const aulasDe = curso => curso.modulos.flatMap(m => m.aulas);

describe('catálogo (§7.1)', () => {
  let ctx;
  before(async () => { ctx = await montarApp(); });
  after(async () => { await fechar(ctx.server); });

  test('intruso: curso bloqueado sem videoUrl/materiais/video, mas com módulos, aulas e contagens (loja intacta)', async () => {
    const r = await ctx.api.get('/api/catalogo', { usuario: 'u-intruso' });
    assert.equal(r.status, 200);
    const c1 = cursoDe(r.corpo, 'curso-01');
    assert.equal(c1.liberado, false);
    assert.equal(c1.modulos.length, 2);
    assert.equal(aulasDe(c1).length, 6);
    for (const a of aulasDe(c1)) {
      assert.equal(a.videoUrl, '');
      assert.deepEqual(a.materiais, []);
      assert.equal(a.video, null);
      assert.ok(a.titulo);
      assert.equal(a.roteiro, undefined);
    }
    assert.equal(c1.sigla, 'APE');
    assert.equal(typeof c1.preco, 'number');
  });

  test('aluno liberado: igual a hoje (videoUrl, materiais) + aditivos video/codigo/rotuloEncontro; em breve sem vídeo', async () => {
    const r = await ctx.api.get('/api/catalogo', { usuario: 'u-aluno1' });
    const c1 = cursoDe(r.corpo, 'curso-01');
    assert.equal(c1.liberado, true);
    const a1 = aulasDe(c1).find(a => a.id === 'c01-m01-a01');
    assert.equal(a1.videoUrl, 'https://player.vimeo.com/video/100001');
    assert.equal(a1.video.provedor, 'vimeo');
    assert.equal(a1.video.src, 'https://player.vimeo.com/video/100001?api=1&dnt=1');
    assert.ok(Array.isArray(a1.materiais));
    assert.ok('codigo' in a1 && 'rotuloEncontro' in a1);
    const emBreve = aulasDe(c1).find(a => a.id === 'c01-m02-a03');
    assert.equal(emBreve.disponivel, false);
    assert.equal(emBreve.videoUrl, '');
    assert.equal(emBreve.video, null);
    const c2 = cursoDe(r.corpo, 'curso-02');
    assert.equal(c2.liberado, false);
    assert.ok(aulasDe(c2).every(a => a.videoUrl === '' && a.video === null));
  });

  test('admin vê tudo com roteiro; docente (sem liberação) recebe o conteúdo do curso que leciona', async () => {
    const adm = await ctx.api.get('/api/catalogo', { usuario: 'u-admin' });
    const c2 = cursoDe(adm.corpo, 'curso-02');
    assert.equal(c2.liberado, true);
    assert.ok(aulasDe(c2).every(a => typeof a.roteiro === 'string' && a.videoUrl));
    const prof = await ctx.api.get('/api/catalogo', { usuario: 'u-prof' });
    const c1 = cursoDe(prof.corpo, 'curso-01');
    assert.equal(c1.liberado, true);
    assert.ok(aulasDe(c1).filter(a => a.disponivel).every(a => a.videoUrl && a.roteiro === undefined));
    assert.equal(cursoDe(prof.corpo, 'curso-02').liberado, false);
    // professor rebaixado com docência gravada perde o acesso
    const ex = await ctx.api.get('/api/catalogo', { usuario: 'u-ex' });
    assert.equal(cursoDe(ex.corpo, 'curso-01').liberado, false);
  });

  test('sem login → 401', async () => {
    assert.equal((await ctx.api.get('/api/catalogo')).status, 401);
  });

  test('PUT /aulas/:id aceita rotuloEncontro (ausente não apaga; objeto → 400)', async () => {
    const put = await ctx.api.put('/api/aulas/c01-m01-a01', { moduloId: 'c01-m01', titulo: 'Aula 1 de teste', duracao: '20 min', videoUrl: 'https://player.vimeo.com/video/100001', ordem: 1, rotuloEncontro: 'Sexta · noite' }, { usuario: 'u-admin' });
    assert.equal(put.status, 200);
    assert.equal((await ctx.repo('aulas').findOne({ _id: 'c01-m01-a01' })).rotuloEncontro, 'Sexta · noite');
    await ctx.api.put('/api/aulas/c01-m01-a01', { moduloId: 'c01-m01', titulo: 'Aula 1 de teste', ordem: 1, videoUrl: 'https://player.vimeo.com/video/100001' }, { usuario: 'u-admin' });
    assert.equal((await ctx.repo('aulas').findOne({ _id: 'c01-m01-a01' })).rotuloEncontro, 'Sexta · noite');
    const ruim = await ctx.api.put('/api/aulas/c01-m01-a01', { moduloId: 'c01-m01', rotuloEncontro: { $gt: '' } }, { usuario: 'u-admin' });
    assert.equal(ruim.status, 400);
    assert.equal(ruim.corpo.codigo, 'formato-invalido');
    const cat = await ctx.api.get('/api/catalogo', { usuario: 'u-aluno1' });
    assert.equal(aulasDe(cursoDe(cat.corpo, 'curso-01')).find(a => a.id === 'c01-m01-a01').rotuloEncontro, 'Sexta · noite');
  });
});

describe('progresso (§7.2, DC-78)', () => {
  let ctx;
  const ouvidos = [];
  before(async () => {
    const servicos = criarServicos();
    servicos.adicionar('aoConcluirAula', async c => { ouvidos.push(c); });
    ctx = await montarApp({ servicos });
  });
  after(async () => { await fechar(ctx.server); });

  test('PUT sem acesso ao curso → 403 sem-acesso e nada gravado', async () => {
    const r = await ctx.api.put('/api/progresso/c01-m01-a01', {}, { usuario: 'u-intruso' });
    assert.equal(r.status, 403);
    assert.equal(r.corpo.codigo, 'sem-acesso');
    assert.equal(r.corpo.error, 'Você não tem acesso ao curso desta aula.');
    assert.equal(await ctx.repo('progresso').countDocuments({ userId: IDS['u-intruso'] }), 0);
    const outro = await ctx.api.put('/api/progresso/c02-m01-a01', {}, { usuario: 'u-aluno1' });
    assert.equal(outro.status, 403);
  });

  test('aluno liberado: 200 idempotente com a data original, origem manual, aoConcluirAula 1×', async () => {
    const a = await ctx.api.put('/api/progresso/c01-m01-a01', {}, { usuario: 'u-aluno1' });
    assert.equal(a.status, 200);
    assert.equal(a.corpo.ok, true);
    assert.equal(a.corpo.aulaId, 'c01-m01-a01');
    assert.match(a.corpo.completedAt, /^\d{4}-\d{2}-\d{2}T/);
    await new Promise(r => setTimeout(r, 5));
    const b = await ctx.api.put('/api/progresso/c01-m01-a01', {}, { usuario: 'u-aluno1' });
    assert.equal(b.corpo.completedAt, a.corpo.completedAt);
    const doc = await ctx.repo('progresso').findOne({ userId: IDS['u-aluno1'], aulaId: 'c01-m01-a01' });
    assert.equal(doc.origem, 'manual');
    const meus = ouvidos.filter(o => o.userId === IDS['u-aluno1'] && o.aulaId === 'c01-m01-a01');
    assert.equal(meus.length, 1);
    assert.equal(meus[0].via, 'conclusao_manual');
    assert.equal(meus[0].cursoId, 'curso-01');
    assert.equal(meus[0].moduloId, 'c01-m01');
  });

  test('aula em breve continua 403 para aluno; admin isento', async () => {
    assert.equal((await ctx.api.put('/api/progresso/c01-m02-a03', {}, { usuario: 'u-aluno1' })).status, 403);
    assert.equal((await ctx.api.put('/api/progresso/c01-m02-a03', {}, { usuario: 'u-admin' })).status, 200);
  });

  test('admin SEM liberação e docente sem liberação: PUT 200 { ok, aulaId, completedAt } e DELETE 200 { ok } — nunca 204', async () => {
    for (const u of ['u-admin', 'u-prof']) {
      const p = await ctx.api.put('/api/progresso/c01-m01-a02', {}, { usuario: u });
      assert.equal(p.status, 200, u);
      assert.deepEqual(Object.keys(p.corpo).sort(), ['aulaId', 'completedAt', 'ok']);
      assert.equal(typeof p.corpo.completedAt, 'string');
      const g = await ctx.api.get('/api/progresso', { usuario: u });
      assert.ok(g.corpo.itens.some(i => i.aulaId === 'c01-m01-a02'));
      const d = await ctx.api.del('/api/progresso/c01-m01-a02', { usuario: u });
      assert.equal(d.status, 200);
      assert.deepEqual(d.corpo, { ok: true });
    }
    assert.equal(await ctx.repo('frequencias').countDocuments({}), 0);
  });

  test('aula inexistente → 404; sem login → 401', async () => {
    assert.equal((await ctx.api.put('/api/progresso/nao-existe', {}, { usuario: 'u-aluno1' })).status, 404);
    assert.equal((await ctx.api.put('/api/progresso/c01-m01-a01', {})).status, 401);
  });
});

describe('materiais (§7.3)', () => {
  let ctx;
  before(async () => {
    ctx = await montarApp();
    const agora = new Date();
    fs.writeFileSync(path.join(DIR, 'mat-arq0000001.pdf'), pdfMinimo());
    await ctx.repo('aulas').updateOne({ _id: 'c01-m01-a01' }, { $set: { materiais: [
      { id: 'mat-link000001', tipo: 'link', nome: 'Leitura externa', url: 'https://exemplo.invalid/texto', tamanho: 0, createdAt: agora },
      { id: 'mat-arq0000001', tipo: 'arquivo', nome: 'Texto-base.pdf', arquivo: 'mat-arq0000001.pdf', tamanho: 100, createdAt: agora }
    ] } });
  });
  after(async () => { await fechar(ctx.server); });

  test('link SEM acesso → 403 sem Location (antes redirecionava); com acesso → 302', async () => {
    const r = await ctx.api.get('/api/materiais/c01-m01-a01/mat-link000001', { usuario: 'u-intruso' });
    assert.equal(r.status, 403);
    assert.equal(r.headers.get('location'), null);
    assert.equal(r.corpo.codigo, 'sem-acesso');
    const ok = await ctx.api.get('/api/materiais/c01-m01-a01/mat-link000001', { usuario: 'u-aluno1' });
    assert.equal(ok.status, 302);
    assert.equal(ok.headers.get('location'), 'https://exemplo.invalid/texto');
  });

  test('download por aluno liberado (arquivo e link) grava progresso_conteudo sem mudar a resposta; docente baixa sem gravar', async () => {
    const r = await ctx.api.get('/api/materiais/c01-m01-a01/mat-arq0000001', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/pdf');
    const feitos = await ctx.repo('progresso_conteudo').find({ userId: IDS['u-aluno1'] }).toArray();
    assert.deepEqual(feitos.map(f => f.chave).sort(), ['material:mat-arq0000001', 'material:mat-link000001']);
    assert.ok(feitos.every(f => f.cursoId === 'curso-01' && f.moduloId === 'c01-m01'));
    const prof = await ctx.api.get('/api/materiais/c01-m01-a01/mat-arq0000001', { usuario: 'u-prof' });
    assert.equal(prof.status, 200);
    assert.equal(await ctx.repo('progresso_conteudo').countDocuments({ userId: IDS['u-prof'] }), 0);
  });

  test('falha ao gravar progresso_conteudo não muda a resposta', async () => {
    ctx.banco.falhar.updateOne = 'progresso_conteudo';
    try {
      const r = await ctx.api.get('/api/materiais/c01-m01-a01/mat-link000001', { usuario: 'u-aluno2' });
      assert.equal(r.status, 302);
      assert.equal(await ctx.repo('progresso_conteudo').countDocuments({ userId: IDS['u-aluno2'] }), 0);
    } finally {
      delete ctx.banco.falhar.updateOne;
    }
  });

  test('material migrado (arquivoId) sai de `arquivos` com o filtro do material; id de outro contexto → 404', async () => {
    const arquivos = criarArquivos({ repo: ctx.repo });
    const salvo = await arquivos.salvar({ contexto: 'material', ref: { cursoId: 'curso-01', moduloId: 'c01-m01', materialId: 'mat-migrado0001' }, buf: pdfMinimo(), tipo: 'pdf', nomeDownload: 'migrado' });
    const outro = await arquivos.salvar({ contexto: 'documento', donoUserId: IDS['u-aluno2'], buf: pdfMinimo(), tipo: 'pdf', nomeDownload: 'rg' });
    const { ObjectId } = await import('mongodb');
    await ctx.repo('aulas').updateOne({ _id: 'c01-m01-a02' }, { $set: { materiais: [
      { id: 'mat-migrado0001', tipo: 'arquivo', nome: 'Migrado.pdf', arquivo: 'nao-existe.pdf', arquivoId: new ObjectId(salvo.id), tamanho: 10 },
      { id: 'mat-forjado0001', tipo: 'arquivo', nome: 'Forjado.pdf', arquivo: 'nao-existe.pdf', arquivoId: new ObjectId(outro.id), tamanho: 10 }
    ] } });
    const ok = await ctx.api.get('/api/materiais/c01-m01-a02/mat-migrado0001', { usuario: 'u-aluno1' });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'application/pdf');
    assert.match(ok.headers.get('content-disposition'), /^attachment/);
    const forjado = await ctx.api.get('/api/materiais/c01-m01-a02/mat-forjado0001', { usuario: 'u-aluno1' });
    assert.equal(forjado.status, 404);
  });

  test('PUT aceita categoria sem renomear; categoria inválida → 400', async () => {
    const r = await ctx.api.put('/api/aulas/c01-m01-a01/materiais/mat-link000001', { categoria: 'slides' }, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    const m = (await ctx.repo('aulas').findOne({ _id: 'c01-m01-a01' })).materiais.find(x => x.id === 'mat-link000001');
    assert.equal(m.categoria, 'slides');
    assert.equal(m.nome, 'Leitura externa');
    assert.equal((await ctx.api.put('/api/aulas/c01-m01-a01/materiais/mat-link000001', { categoria: 'video' }, { usuario: 'u-admin' })).status, 400);
    const legado = await ctx.api.put('/api/aulas/c01-m01-a01/materiais/mat-link000001', { nome: 'Novo nome' }, { usuario: 'u-admin' });
    assert.deepEqual(legado.corpo, { ok: true, nome: 'Novo nome' });
  });
});

describe('DELETE com o grupo cascata (§7.4)', () => {
  test('bloqueio → 409 tem-registros e nada apagado; sem bloqueio apaga e chama apagar de cada membro; membro que falha → 503', async () => {
    const servicos = criarServicos();
    const apagados = [];
    let bloquear = true;
    servicos.adicionar('cascata', { dominio: 'teste', bloqueios: async alvo => (bloquear && alvo.id === 'c01-m01-a01' ? 1 : 0), apagar: async alvo => { apagados.push(alvo); } });
    const ctx = await montarApp({ servicos });
    try {
      const b = await ctx.api.del('/api/aulas/c01-m01-a01', { usuario: 'u-admin' });
      assert.equal(b.status, 409);
      assert.equal(b.corpo.codigo, 'tem-registros');
      assert.ok(await ctx.repo('aulas').findOne({ _id: 'c01-m01-a01' }));
      assert.equal(apagados.length, 0);
      bloquear = false;
      const ok = await ctx.api.del('/api/aulas/c01-m01-a01', { usuario: 'u-admin' });
      assert.equal(ok.status, 200);
      assert.equal(await ctx.repo('aulas').findOne({ _id: 'c01-m01-a01' }), null);
      assert.deepEqual(apagados, [{ tipo: 'aula', id: 'c01-m01-a01' }]);
      const mod = await ctx.api.del('/api/modulos/c01-m02', { usuario: 'u-admin' });
      assert.equal(mod.status, 200);
      servicos.adicionar('cascata', { dominio: 'quebrado', bloqueios: async () => { throw new Error('x'); }, apagar: async () => {} });
      const falha = await ctx.api.del('/api/cursos/curso-02', { usuario: 'u-admin' });
      assert.equal(falha.status, 503);
      assert.ok(await ctx.repo('cursos').findOne({ _id: 'curso-02' }));
      assert.equal((await ctx.api.del('/api/cursos/curso-02', { usuario: 'u-aluno1' })).status, 403);
    } finally { await fechar(ctx.server); }
  });
});

describe('agregador com módulo que lança no montar (DC-74, routers REAIS)', () => {
  test('GET /api/catalogo, PUT /api/progresso e o material continuam respondendo', async () => {
    const comPortal = ({ banco, servicos }) => montarPortal({
      getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin, exigirAdmin: soAdmin, servicos, falharCedo: false, log: silencioso, filtro: null,
      modulos: [{ caminho: 'routes/teste/quebrado.js', fatia: 'TESTE', importar: async () => ({ default: async (c) => {
        c.rotas.aluno.get('/quebrado', (_q, r) => r.json({ ok: true }));
        throw new Error('falha simulada no montar');
      } }) }]
    });
    const ctx = await montarApp({ comPortal });
    try {
      const cat = await ctx.api.get('/api/catalogo', { usuario: 'u-aluno1' });
      assert.equal(cat.status, 200);
      assert.equal(cursoDe(cat.corpo, 'curso-01').liberado, true);
      assert.equal((await ctx.api.put('/api/progresso/c01-m01-a01', {}, { usuario: 'u-aluno1' })).status, 200);
      assert.equal((await ctx.api.get('/api/portal/quebrado', { usuario: 'u-aluno1' })).status, 404);
      const saude = await ctx.api.get('/api/portal/saude');
      assert.equal(saude.corpo.modulos.comFalha, 1);
    } finally { await fechar(ctx.server); }
  });
});

describe('scripts/migrar-materiais.js (dry-run padrão, idempotente, nunca apaga o disco)', () => {
  test('simula, depois migra, repete sem duplicar; o download passa a sair do Mongo', async () => {
    const { migrarMateriais } = await import('../scripts/migrar-materiais.js');
    const ctx = await montarApp();
    try {
      fs.writeFileSync(path.join(DIR, 'mat-migr000001.pdf'), pdfMinimo());
      fs.writeFileSync(path.join(DIR, 'mat-html000001.pdf'), '<html></html>');
      await ctx.repo('aulas').updateOne({ _id: 'c01-m01-a03' }, { $set: { materiais: [
        { id: 'mat-migr000001', tipo: 'arquivo', nome: 'Apostila.pdf', arquivo: 'mat-migr000001.pdf', tamanho: 10 },
        { id: 'mat-html000001', tipo: 'arquivo', nome: 'Falso.pdf', arquivo: 'mat-html000001.pdf', tamanho: 10 },
        { id: 'mat-sumiu00001', tipo: 'arquivo', nome: 'Sumiu.pdf', arquivo: 'mat-sumiu00001.pdf', tamanho: 10 },
        { id: 'mat-link000009', tipo: 'link', nome: 'Link', url: 'https://exemplo.invalid' }
      ] } });
      const simulacao = await migrarMateriais({ repo: ctx.repo, dir: DIR, log: silencioso });
      assert.equal(simulacao.migraveis, 1);
      assert.equal(simulacao.invalidos, 1);
      assert.equal(simulacao.semArquivo, 1);
      assert.equal(await ctx.repo('arquivos').countDocuments({}), 0, 'simulação não grava');
      const r1 = await migrarMateriais({ repo: ctx.repo, dir: DIR, aplicar: true, log: silencioso });
      assert.equal(r1.migrados, 1);
      const r2 = await migrarMateriais({ repo: ctx.repo, dir: DIR, aplicar: true, log: silencioso });
      assert.equal(r2.migrados, 0);
      assert.equal(r2.jaMigrados, 1);
      assert.equal(await ctx.repo('arquivos').countDocuments({ contexto: 'material' }), 1, 'idempotente');
      const arq = await ctx.repo('arquivos').findOne({ contexto: 'material' });
      assert.deepEqual(arq.ref, { cursoId: 'curso-01', moduloId: 'c01-m01', materialId: 'mat-migr000001', entidadeId: 'c01-m01-a03' });
      assert.ok(fs.existsSync(path.join(DIR, 'mat-migr000001.pdf')), 'disco intacto');
      fs.rmSync(path.join(DIR, 'mat-migr000001.pdf'));
      const d = await ctx.api.get('/api/materiais/c01-m01-a03/mat-migr000001', { usuario: 'u-aluno1' });
      assert.equal(d.status, 200, 'sai do Mongo mesmo sem o arquivo no disco');
    } finally { await fechar(ctx.server); }
  });
});

after(() => { fs.rmSync(DIR, { recursive: true, force: true }); });
