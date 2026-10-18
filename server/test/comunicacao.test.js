// Portal · F7 — publicações e banners. PORTAL-API §6.11.1–§6.11.2, §3.3 (F7), §3.4, §3.5
// (publicacao.nova), índice §8.5 (F7). Agregador real com os módulos da F7, banco em
// memória; nenhum Mongo, nenhuma rede.
//   NODE_ENV=test node --test server/test/comunicacao.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ObjectId } from 'mongodb';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso, pdfMinimo, pdfComJavascript, pngComTexto, jpegMinimo } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const M = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const E = await import('../src/portal/erros.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const P = await import('../src/portal/comunicacao/publico.js');

const CFG = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });
const MODULOS_F7 = M.MODULOS_PADRAO.filter(m => m.fatia === 'F7');
const DIA = 24 * 3600 * 1000;
const hex = v => (v instanceof ObjectId ? v.toHexString() : String(v));

/** Falsos da F4a a partir do banco: turmas da matrícula vigente e turmas do curso. */
function falsosSecretaria(servicos, banco, { comTurmas = true } = {}) {
  if (!comTurmas) return;
  servicos.registrar('secretaria.turmasDoAluno', async (userId) => {
    const ms = await banco.collection('matriculas').find({ userId: String(userId), status: { $in: ['ativa', 'trancada'] } }).toArray();
    return ms.map(m => hex(m.turmaId)).filter(Boolean);
  });
  servicos.registrar('secretaria.turmasDoCurso', async (cursoId) => {
    const ts = await banco.collection('turmas').find({ cursoId }).toArray();
    return ts.map(t => ({ id: hex(t._id), codigo: t.codigo, nome: t.nome, status: 'aberta', modalidade: t.modalidade, alunos: 0 }));
  });
}

async function subirPortal({ comTurmas = true } = {}) {
  const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
  await semear(banco);
  const servicos = criarServicos();
  falsosSecretaria(servicos, banco, { comTurmas });
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: MODULOS_F7, configPortal: CFG, falharCedo: true, log: silencioso
  });
  await portal.carregar();
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(E.criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  return { api: cliente(base), server, banco, servicos, base };
}

function semChaves(obj, proibidas, caminho = '$') {
  if (Array.isArray(obj)) return obj.forEach((v, i) => semChaves(v, proibidas, `${caminho}[${i}]`));
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      assert.ok(!proibidas.includes(k), `chave proibida ${k} em ${caminho}`);
      semChaves(v, proibidas, `${caminho}.${k}`);
    }
  }
}
const SEGREDOS = ['senhaHash', 'cpf', 'segredo', 'dados'];

const texto = (extra = {}) => ({ titulo: 'Aviso da turma', resumo: 'Resumo curto do aviso.', tipo: 'texto', corpo: 'Texto do aviso para os alunos.', publico: { tipo: 'curso', cursoIds: ['curso-01'] }, ...extra });

describe('publicações', () => {
  let ctx;
  const ids = {};
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('401 sem sessão; aluno → 403 nas rotas da equipe', async () => {
    assert.equal((await ctx.api.get('/api/portal/publicacoes')).status, 401);
    assert.equal((await ctx.api.post('/api/portal/professor/publicacoes', texto())).status, 401);
    const r = await ctx.api.post('/api/portal/professor/publicacoes', texto(), { usuario: 'u-aluno1' });
    assert.equal(r.status, 403);
    assert.equal(r.corpo.codigo, 'papel-insuficiente');
  });

  test('público no servidor: professor só os próprios cursos/turmas; "todos" só admin', async () => {
    const todos = await ctx.api.post('/api/portal/professor/publicacoes', texto({ publico: { tipo: 'todos' } }), { usuario: 'u-prof' });
    assert.equal(todos.status, 403);
    assert.equal(todos.corpo.codigo, 'publico-fora-dos-seus-cursos');
    const alheio = await ctx.api.post('/api/portal/professor/publicacoes', texto({ publico: { tipo: 'curso', cursoIds: ['curso-02'] } }), { usuario: 'u-prof' });
    assert.equal(alheio.status, 403);
    // docência só de turma: o curso inteiro não; a própria turma sim; a outra turma não
    const t1Curso = await ctx.api.post('/api/portal/professor/publicacoes', texto(), { usuario: 'u-prof-t1' });
    assert.equal(t1Curso.status, 403);
    const t2 = await ctx.api.post('/api/portal/professor/publicacoes', texto({ publico: { tipo: 'turma', turmaIds: [IDS.T2] } }), { usuario: 'u-prof-t1' });
    assert.equal(t2.status, 403);
    const t1 = await ctx.api.post('/api/portal/professor/publicacoes', texto({ titulo: 'Só da turma 1', publico: { tipo: 'turma', turmaIds: [IDS.T1] } }), { usuario: 'u-prof-t1' });
    assert.equal(t1.status, 201);
    assert.equal(t1.corpo.publicacao.status, 'rascunho');
    assert.deepEqual(t1.corpo.publicacao.publico.cursoIds, ['curso-01']);
    assert.deepEqual(t1.corpo.publicacao.publico.turmas, ['APE-2026-01']);
    ids.turma1 = t1.corpo.publicacao.id;
    const ok = await ctx.api.post('/api/portal/professor/publicacoes', texto(), { usuario: 'u-prof' });
    assert.equal(ok.status, 201);
    ids.curso = ok.corpo.publicacao.id;
    const adm = await ctx.api.post('/api/portal/professor/publicacoes', texto({ titulo: 'Para todos', publico: { tipo: 'todos' } }), { usuario: 'u-admin' });
    assert.equal(adm.status, 201);
    ids.todos = adm.corpo.publicacao.id;
  });

  test('validação: formato-invalido com objeto, vídeo e link inválidos, campos por tipo no publicar', async () => {
    const obj = await ctx.api.post('/api/portal/professor/publicacoes', texto({ titulo: { $ne: 1 } }), { usuario: 'u-prof' });
    assert.equal(obj.status, 400);
    assert.equal(obj.corpo.codigo, 'formato-invalido');
    const curto = await ctx.api.post('/api/portal/professor/publicacoes', texto({ titulo: 'ab' }), { usuario: 'u-prof' });
    assert.equal(curto.status, 400);
    assert.ok(curto.corpo.campos.titulo);
    const video = await ctx.api.post('/api/portal/professor/publicacoes', texto({ tipo: 'video', videoUrl: 'https://exemplo.com/video' }), { usuario: 'u-prof' });
    assert.equal(video.status, 400);
    assert.ok(video.corpo.campos.videoUrl);
    const http = await ctx.api.post('/api/portal/professor/publicacoes', texto({ tipo: 'link', url: 'http://exemplo.com' }), { usuario: 'u-prof' });
    assert.equal(http.status, 400);
    const js = await ctx.api.post('/api/portal/professor/publicacoes', texto({ tipo: 'link', url: 'javascript:alert(1)' }), { usuario: 'u-prof' });
    assert.equal(js.status, 400);
    const semPub = await ctx.api.post('/api/portal/professor/publicacoes', texto({ publico: undefined }), { usuario: 'u-prof' });
    assert.equal(semPub.status, 400);
    const vazio = await ctx.api.post('/api/portal/professor/publicacoes', texto({ titulo: 'Rascunho sem corpo', corpo: '' }), { usuario: 'u-prof' });
    assert.equal(vazio.status, 201);
    const pub = await ctx.api.post(`/api/portal/professor/publicacoes/${vazio.corpo.publicacao.id}/publicar`, {}, { usuario: 'u-prof' });
    assert.equal(pub.status, 400);
    assert.ok(pub.corpo.campos.corpo);
  });

  test('PUT: rascunho legítimo + publico todos → 403; versão errada → 409; edição de outro professor → 404', async () => {
    const atual = (await ctx.api.get(`/api/portal/professor/publicacoes/${ids.curso}`, { usuario: 'u-prof' })).corpo.publicacao;
    const todos = await ctx.api.put(`/api/portal/professor/publicacoes/${ids.curso}`, { versao: atual.versao, publico: { tipo: 'todos' } }, { usuario: 'u-prof' });
    assert.equal(todos.status, 403);
    assert.equal(todos.corpo.codigo, 'publico-fora-dos-seus-cursos');
    const velha = await ctx.api.put(`/api/portal/professor/publicacoes/${ids.curso}`, { versao: atual.versao + 5, titulo: 'Outro título' }, { usuario: 'u-prof' });
    assert.equal(velha.status, 409);
    assert.equal(velha.corpo.codigo, 'conflito-versao');
    const alheia = await ctx.api.put(`/api/portal/professor/publicacoes/${ids.curso}`, { versao: atual.versao, titulo: 'Invasão' }, { usuario: 'u-prof-t1' });
    assert.equal(alheia.status, 404);
    const ok = await ctx.api.put(`/api/portal/professor/publicacoes/${ids.curso}`, { versao: atual.versao, titulo: 'Aviso do curso' }, { usuario: 'u-prof' });
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.publicacao.versao, atual.versao + 1);
  });

  test('publicar → aluno do público vê; fora do público → 404; sem vínculo não vê "todos"', async () => {
    for (const [id, u] of [[ids.curso, 'u-prof'], [ids.turma1, 'u-prof-t1'], [ids.todos, 'u-admin']]) {
      const r = await ctx.api.post(`/api/portal/professor/publicacoes/${id}/publicar`, {}, { usuario: u });
      assert.equal(r.status, 200, id);
      assert.equal(r.corpo.publicacao.status, 'publicada');
    }
    const a1 = await ctx.api.get('/api/portal/publicacoes', { usuario: 'u-aluno1' });
    assert.equal(a1.status, 200);
    const vistos1 = a1.corpo.itens.map(i => i.id).sort();
    assert.deepEqual(vistos1, [ids.curso, ids.turma1, ids.todos].sort());
    const a2 = await ctx.api.get('/api/portal/publicacoes', { usuario: 'u-aluno2' });
    assert.deepEqual(a2.corpo.itens.map(i => i.id).sort(), [ids.curso, ids.todos].sort());
    assert.equal((await ctx.api.get(`/api/portal/publicacoes/${ids.turma1}`, { usuario: 'u-aluno2' })).status, 404);
    const intruso = await ctx.api.get('/api/portal/publicacoes', { usuario: 'u-intruso' });
    assert.deepEqual(intruso.corpo.itens, []);
    assert.equal((await ctx.api.get(`/api/portal/publicacoes/${ids.todos}`, { usuario: 'u-intruso' })).status, 404);
    const det = await ctx.api.get(`/api/portal/publicacoes/${ids.curso}`, { usuario: 'u-aluno1' });
    assert.equal(det.status, 200);
    assert.equal(det.corpo.corpo, 'Texto do aviso para os alunos.');
    assert.equal(det.corpo.autor.nome, 'Professora Geral de Teste');
    const adm = a1.corpo.itens.find(i => i.id === ids.todos);
    assert.equal(adm.autor.nome, 'Coordenação');
    semChaves(a1.corpo, [...SEGREDOS, 'userId', 'videoUrl', 'arquivoId']);
    // rascunho não aparece para o aluno
    const rasc = await ctx.api.post('/api/portal/professor/publicacoes', texto({ titulo: 'Rascunho escondido' }), { usuario: 'u-prof' });
    assert.equal((await ctx.api.get(`/api/portal/publicacoes/${rasc.corpo.publicacao.id}`, { usuario: 'u-aluno1' })).status, 404);
    // id malformado
    assert.equal((await ctx.api.get('/api/portal/publicacoes/nao-e-id', { usuario: 'u-aluno1' })).status, 404);
    // filtros
    const soVideo = await ctx.api.get('/api/portal/publicacoes?tipo=video', { usuario: 'u-aluno1' });
    assert.deepEqual(soVideo.corpo.itens, []);
    assert.equal((await ctx.api.get('/api/portal/publicacoes?tipo=podcast', { usuario: 'u-aluno1' })).status, 400);
  });

  test('vídeo do YouTube vira card incorporável (normalizarVideo); link só https', async () => {
    const v = await ctx.api.post('/api/portal/professor/publicacoes', texto({ titulo: 'Aula extra em vídeo', tipo: 'video', corpo: '', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }), { usuario: 'u-prof' });
    assert.equal(v.status, 201);
    await ctx.api.post(`/api/portal/professor/publicacoes/${v.corpo.publicacao.id}/publicar`, {}, { usuario: 'u-prof' });
    const l = await ctx.api.post('/api/portal/professor/publicacoes', texto({ titulo: 'Leitura recomendada', tipo: 'link', corpo: '', url: 'https://exemplo.com/artigo' }), { usuario: 'u-prof' });
    await ctx.api.post(`/api/portal/professor/publicacoes/${l.corpo.publicacao.id}/publicar`, {}, { usuario: 'u-prof' });
    const lista = await ctx.api.get('/api/portal/publicacoes', { usuario: 'u-aluno1' });
    const card = lista.corpo.itens.find(i => i.id === v.corpo.publicacao.id);
    assert.equal(card.video.provedor, 'youtube');
    assert.equal(card.video.id, 'dQw4w9WgXcQ');
    assert.match(card.video.src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
    const link = lista.corpo.itens.find(i => i.id === l.corpo.publicacao.id);
    assert.equal(link.url, 'https://exemplo.com/artigo');
    assert.equal(link.video, null);
  });

  test('PDF: envio (≤ 4 MB, sem conteúdo ativo), download só do público, sempre attachment', async () => {
    const p = await ctx.api.post('/api/portal/professor/publicacoes', texto({ titulo: 'Material em PDF', tipo: 'pdf', corpo: '' }), { usuario: 'u-prof' });
    const id = p.corpo.publicacao.id;
    const semArq = await ctx.api.post(`/api/portal/professor/publicacoes/${id}/publicar`, {}, { usuario: 'u-prof' });
    assert.equal(semArq.status, 400);
    assert.ok(semArq.corpo.campos.arquivo);
    const ativo = await ctx.api.post(`/api/portal/professor/publicacoes/${id}/arquivo`, undefined, { usuario: 'u-prof', corpoCru: pdfComJavascript(), tipo: 'application/pdf' });
    assert.equal(ativo.status, 415);
    const png = await ctx.api.post(`/api/portal/professor/publicacoes/${id}/arquivo`, undefined, { usuario: 'u-prof', corpoCru: jpegMinimo(), tipo: 'application/pdf' });
    assert.equal(png.status, 415);
    const ok = await ctx.api.post(`/api/portal/professor/publicacoes/${id}/arquivo`, undefined, { usuario: 'u-prof', corpoCru: pdfMinimo(), tipo: 'application/pdf' });
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.temPdf, true);
    assert.equal((await ctx.api.post(`/api/portal/professor/publicacoes/${id}/publicar`, {}, { usuario: 'u-prof' })).status, 200);
    const baixar = await ctx.api.get(`/api/portal/publicacoes/${id}/arquivo`, { usuario: 'u-aluno1' });
    assert.equal(baixar.status, 200);
    assert.equal(baixar.headers.get('content-type'), 'application/pdf');
    assert.match(baixar.headers.get('content-disposition'), /^attachment;/);
    assert.equal(baixar.headers.get('cache-control'), 'private, no-store');
    assert.equal((await ctx.api.get(`/api/portal/publicacoes/${id}/arquivo`, { usuario: 'u-intruso' })).status, 404);
  });

  test('autor rebaixado (u-ex) → 403 no PUT e no publicar; professor que perde a docência → 403 ao arquivar', async () => {
    const t = new Date();
    const r = await ctx.banco.collection('publicacoes').insertOne({
      titulo: 'Do ex-professor', resumo: null, tipo: 'texto', corpo: 'Texto antigo.', videoUrl: null, url: null, arquivoId: null,
      publico: { tipo: 'curso', cursoIds: ['curso-01'], turmaIds: [] }, autor: { userId: IDS['u-ex'], nome: 'Ex', papel: 'professor' },
      status: 'rascunho', fixada: false, publicadaEm: null, versao: 1, criadoEm: t, atualizadoEm: t
    });
    const id = String(r.insertedId);
    const put = await ctx.api.put(`/api/portal/professor/publicacoes/${id}`, { versao: 1, titulo: 'Mudança' }, { usuario: 'u-ex' });
    assert.equal(put.status, 403);
    const pub = await ctx.api.post(`/api/portal/professor/publicacoes/${id}/publicar`, {}, { usuario: 'u-ex' });
    assert.equal(pub.status, 403);
    // docência de turma removida: o autor não arquiva mais a publicação da turma
    await ctx.banco.collection('docencias').deleteOne({ userId: IDS['u-prof-t1'] });
    const arq = await ctx.api.post(`/api/portal/professor/publicacoes/${ids.turma1}/arquivar`, {}, { usuario: 'u-prof-t1' });
    assert.equal(arq.status, 403);
    assert.equal(arq.corpo.codigo, 'publico-fora-dos-seus-cursos');
    // a coordenação arquiva; some do aluno
    const adm = await ctx.api.post(`/api/portal/professor/publicacoes/${ids.turma1}/arquivar`, {}, { usuario: 'u-admin' });
    assert.equal(adm.status, 200);
    assert.equal(adm.corpo.publicacao.status, 'arquivada');
    assert.equal((await ctx.api.get(`/api/portal/publicacoes/${ids.turma1}`, { usuario: 'u-aluno1' })).status, 404);
  });

  test('DELETE: autor só rascunho (409 na publicada); admin remove', async () => {
    const pub = await ctx.api.del(`/api/portal/professor/publicacoes/${ids.curso}`, { usuario: 'u-prof' });
    assert.equal(pub.status, 409);
    const rasc = await ctx.api.post('/api/portal/professor/publicacoes', texto({ titulo: 'Para apagar' }), { usuario: 'u-prof' });
    assert.equal((await ctx.api.del(`/api/portal/professor/publicacoes/${rasc.corpo.publicacao.id}`, { usuario: 'u-prof' })).status, 200);
    assert.equal(await ctx.banco.collection('publicacoes').findOne({ _id: new ObjectId(rasc.corpo.publicacao.id) }), null);
  });

  test('lista da equipe: professor vê as próprias + publicadas do escopo; admin vê tudo', async () => {
    const prof = await ctx.api.get('/api/portal/professor/publicacoes', { usuario: 'u-prof' });
    assert.equal(prof.status, 200);
    assert.ok(prof.corpo.itens.every(i => i.autor.userId === IDS['u-prof'] || i.status === 'publicada'));
    const rasc = await ctx.api.get('/api/portal/professor/publicacoes?status=rascunho', { usuario: 'u-prof' });
    assert.ok(rasc.corpo.itens.every(i => i.status === 'rascunho' && i.autor.userId === IDS['u-prof']));
    const adm = await ctx.api.get('/api/portal/professor/publicacoes', { usuario: 'u-admin' });
    assert.ok(adm.corpo.total >= prof.corpo.total);
    semChaves(adm.corpo, SEGREDOS);
  });

  test('publicacao.nova sob demanda (30 dias, público compatível) e "nova" na lista; abrir marca como lida', async () => {
    const def = ctx.servicos.todos('notificacaoSobDemanda').find(d => d.tipo === 'publicacao.nova');
    assert.ok(def);
    const emitir = ctx.servicos.obter('notificacoes').emitir;
    await def.gerar(IDS['u-aluno2'], { agora: new Date(), emitir });
    const nots = await ctx.banco.collection('notificacoes').find({ userId: IDS['u-aluno2'], tipo: 'publicacao.nova' }).toArray();
    assert.ok(nots.length >= 2);
    assert.ok(nots.every(n => /^publicacao\.html\?id=[a-f0-9]{24}$/.test(n.link) && n.chave.startsWith('publicacao:')));
    assert.ok(!nots.some(n => n.chave === `publicacao:${ids.turma1}`), 'turma alheia não notifica');
    // idempotente (chave)
    await def.gerar(IDS['u-aluno2'], { agora: new Date(), emitir });
    assert.equal((await ctx.banco.collection('notificacoes').find({ userId: IDS['u-aluno2'], tipo: 'publicacao.nova' }).toArray()).length, nots.length);
    const antes = await ctx.api.get('/api/portal/publicacoes', { usuario: 'u-aluno2' });
    assert.equal(antes.corpo.itens.find(i => i.id === ids.curso).nova, true);
    await ctx.api.get(`/api/portal/publicacoes/${ids.curso}`, { usuario: 'u-aluno2' });
    const depois = await ctx.api.get('/api/portal/publicacoes', { usuario: 'u-aluno2' });
    assert.equal(depois.corpo.itens.find(i => i.id === ids.curso).nova, false);
    // publicação de mais de 30 dias não notifica
    await ctx.banco.collection('publicacoes').updateOne({ _id: new ObjectId(ids.todos) }, { $set: { publicadaEm: new Date(Date.now() - 40 * DIA) } });
    await def.gerar(IDS['u-aluno1'], { agora: new Date(), emitir });
    assert.equal(await ctx.banco.collection('notificacoes').findOne({ userId: IDS['u-aluno1'], chave: `publicacao:${ids.todos}` }), null);
  });

  test('busca (grupo publicacoes) respeita o público', async () => {
    const def = ctx.servicos.todos('busca').find(d => d.tipo === 'publicacoes');
    const user = await ctx.banco.collection('users').findOne({ _id: new ObjectId(IDS['u-intruso']) });
    const termos = [/aviso/i];
    const nada = await def.buscar({ user }, termos, { limite: 5 });
    assert.deepEqual(nada.itens, []);
    const a1 = await ctx.banco.collection('users').findOne({ _id: new ObjectId(IDS['u-aluno1']) });
    const r = await def.buscar({ user: a1 }, termos, { limite: 5 });
    assert.ok(r.itens.some(i => i.id === ids.curso && i.href === `publicacao.html?id=${ids.curso}`));
  });

  test('auditoria das ações da F7', async () => {
    const acoes = new Set((await ctx.banco.collection('auditoria').find({}).toArray()).map(a => a.acao));
    for (const a of ['publicacao.criada', 'publicacao.alterada', 'publicacao.publicada', 'publicacao.arquivada', 'publicacao.removida']) assert.ok(acoes.has(a), a);
  });
});

describe('publicações sem a F4a (público por turma indisponível)', () => {
  let ctx;
  before(async () => { ctx = await subirPortal({ comTurmas: false }); });
  after(() => fechar(ctx.server));
  test('turma → 400 honesto; curso segue', async () => {
    const t = await ctx.api.post('/api/portal/professor/publicacoes', texto({ publico: { tipo: 'turma', turmaIds: [IDS.T1] } }), { usuario: 'u-admin' });
    assert.equal(t.status, 400);
    assert.match(t.corpo.error || t.corpo.mensagem || JSON.stringify(t.corpo), /turma/i);
    assert.equal((await ctx.api.post('/api/portal/professor/publicacoes', texto(), { usuario: 'u-prof' })).status, 201);
  });
});

describe('banners', () => {
  let ctx;
  const agora = Date.now();
  const iso = ms => new Date(ms).toISOString();
  const banner = (extra = {}) => ({
    titulo: 'Semana de boas-vindas', texto: 'Programação da semana no Início.', local: 'inicio', link: { url: 'tutoriais.html', rotulo: 'Saiba mais' },
    inicioEm: iso(agora - DIA), fimEm: iso(agora + 5 * DIA), publico: { papeis: ['aluno'], tipo: 'todos' }, ordem: 1, ativo: true, ...extra
  });
  const ids = {};
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('só a coordenação gerencia (professor e aluno → 403; sem sessão → 401)', async () => {
    assert.equal((await ctx.api.get('/api/portal/admin/banners')).status, 401);
    assert.equal((await ctx.api.get('/api/portal/admin/banners', { usuario: 'u-prof' })).status, 403);
    assert.equal((await ctx.api.post('/api/portal/admin/banners', banner(), { usuario: 'u-aluno1' })).status, 403);
    assert.equal((await ctx.api.get('/api/portal/banners')).status, 401);
  });

  test('validação: vigência ≤ 366 dias, fim depois do início, link interno ou https, faixa ≤ 90', async () => {
    const longo = await ctx.api.post('/api/portal/admin/banners', banner({ fimEm: iso(agora + 400 * DIA) }), { usuario: 'u-admin' });
    assert.equal(longo.status, 400);
    assert.ok(longo.corpo.campos.fimEm);
    const invertido = await ctx.api.post('/api/portal/admin/banners', banner({ fimEm: iso(agora - 2 * DIA) }), { usuario: 'u-admin' });
    assert.equal(invertido.status, 400);
    for (const url of ['javascript:alert(1)', 'http://exemplo.com', '//exemplo.com', 'https://user:pw@exemplo.com']) {
      const r = await ctx.api.post('/api/portal/admin/banners', banner({ link: { url, rotulo: 'Ver' } }), { usuario: 'u-admin' });
      assert.equal(r.status, 400, url);
    }
    const faixa = await ctx.api.post('/api/portal/admin/banners', banner({ local: 'topo', texto: 'x'.repeat(91) }), { usuario: 'u-admin' });
    assert.equal(faixa.status, 400);
    const semPapel = await ctx.api.post('/api/portal/admin/banners', banner({ publico: { papeis: [], tipo: 'todos' } }), { usuario: 'u-admin' });
    assert.equal(semPapel.status, 400);
    const obj = await ctx.api.post('/api/portal/admin/banners', banner({ titulo: { $gt: '' } }), { usuario: 'u-admin' });
    assert.equal(obj.corpo.codigo, 'formato-invalido');
  });

  test('vigência no servidor: no ar aparece; agendado, encerrado e inativo não', async () => {
    const criar = async (nome, extra) => {
      const r = await ctx.api.post('/api/portal/admin/banners', banner({ titulo: nome, ...extra }), { usuario: 'u-admin' });
      assert.equal(r.status, 201, nome);
      ids[nome] = r.corpo.banner.id;
      return r.corpo.banner;
    };
    const noAr = await criar('No ar agora', {});
    assert.equal(noAr.estado, 'no-ar');
    assert.equal((await criar('Agendado', { inicioEm: iso(agora + 2 * DIA), fimEm: iso(agora + 4 * DIA) })).estado, 'agendado');
    assert.equal((await criar('Encerrado', { inicioEm: iso(agora - 10 * DIA), fimEm: iso(agora - 1 * DIA) })).estado, 'encerrado');
    await criar('Inativo', { ativo: false });
    await criar('Faixa do topo', { local: 'topo', texto: 'Matrículas abertas para a nova turma.', link: { url: 'https://exemplo.com/inscricao', rotulo: 'Ver' } });
    await criar('Só curso dois', { publico: { papeis: ['aluno'], tipo: 'curso', cursoIds: ['curso-02'] } });
    await criar('Só turma um', { publico: { papeis: ['aluno'], tipo: 'turma', turmaIds: [IDS.T1] } });
    await criar('Para professores', { publico: { papeis: ['professor'], tipo: 'todos' } });

    const ini = await ctx.api.get('/api/portal/banners?local=inicio', { usuario: 'u-aluno1' });
    assert.equal(ini.status, 200);
    const titulos = ini.corpo.itens.map(b => b.titulo).sort();
    assert.deepEqual(titulos, ['No ar agora', 'Só turma um'].sort());
    const item = ini.corpo.itens.find(b => b.titulo === 'No ar agora');
    assert.equal(item.link, 'tutoriais.html');
    assert.equal(item.linkRotulo, 'Saiba mais');
    assert.equal(item.local, 'inicio');
    semChaves(ini.corpo, ['publico', 'criadoPor', 'versao', ...SEGREDOS]);
    const a2 = await ctx.api.get('/api/portal/banners?local=inicio', { usuario: 'u-aluno2' });
    assert.deepEqual(a2.corpo.itens.map(b => b.titulo), ['No ar agora']);
    const topo = await ctx.api.get('/api/portal/banners?local=topo', { usuario: 'u-aluno1' });
    assert.deepEqual(topo.corpo.itens.map(b => b.titulo), ['Faixa do topo']);
    assert.equal(topo.corpo.itens[0].linkExterno, true);
    // sem vínculo: 'todos' não aparece para o papel aluno
    assert.deepEqual((await ctx.api.get('/api/portal/banners?local=inicio', { usuario: 'u-intruso' })).corpo.itens, []);
    // papel
    const prof = await ctx.api.get('/api/portal/banners?local=inicio', { usuario: 'u-prof' });
    assert.deepEqual(prof.corpo.itens.map(b => b.titulo), ['Para professores']);
    assert.equal((await ctx.api.get('/api/portal/banners?local=lateral', { usuario: 'u-aluno1' })).status, 400);
  });

  test('imagem: JPG/PNG/WebP ≤ 1 MB sem metadados, nome novo, pública e imutável; faixa do topo sem imagem', async () => {
    const id = ids['No ar agora'];
    const r = await ctx.api.post(`/api/portal/admin/banners/${id}/imagem`, undefined, { usuario: 'u-admin', corpoCru: pngComTexto(), tipo: 'image/png' });
    assert.equal(r.status, 200);
    assert.match(r.corpo.imagemUrl, /^\/api\/portal\/banners\/imagens\/ban-[a-f0-9]{12}\.png$/);
    const img = await ctx.api.raw(r.corpo.imagemUrl.replace('/api', '/api'));
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.ok(!img.texto.includes('tEXt'), 'metadados removidos');
    const pdf = await ctx.api.post(`/api/portal/admin/banners/${id}/imagem`, undefined, { usuario: 'u-admin', corpoCru: pdfMinimo(), tipo: 'image/png' });
    assert.equal(pdf.status, 415);
    const topo = await ctx.api.post(`/api/portal/admin/banners/${ids['Faixa do topo']}/imagem`, undefined, { usuario: 'u-admin', corpoCru: jpegMinimo(), tipo: 'image/jpeg' });
    assert.equal(topo.status, 400);
    assert.equal((await ctx.api.raw('/api/portal/banners/imagens/ban-000000000000.png')).status, 404);
    assert.equal((await ctx.api.raw('/api/portal/banners/imagens/..%2F..%2Fsegredo')).status, 404);
  });

  test('PUT com versão (409), texto alternativo opcional e remoção', async () => {
    const id = ids['No ar agora'];
    const lista = await ctx.api.get('/api/portal/admin/banners', { usuario: 'u-admin' });
    const atual = lista.corpo.itens.find(b => b.id === id);
    const velho = await ctx.api.put(`/api/portal/admin/banners/${id}`, { versao: atual.versao + 3, titulo: 'Novo' }, { usuario: 'u-admin' });
    assert.equal(velho.status, 409);
    const ok = await ctx.api.put(`/api/portal/admin/banners/${id}`, { versao: atual.versao, imagemAlt: 'Fachada da sede na Avenida Paulista', ordem: 2 }, { usuario: 'u-admin' });
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.banner.imagemAlt, 'Fachada da sede na Avenida Paulista');
    const ini = await ctx.api.get('/api/portal/banners?local=inicio', { usuario: 'u-aluno1' });
    assert.equal(ini.corpo.itens.find(b => b.id === id).imagemAlt, 'Fachada da sede na Avenida Paulista');
    assert.equal((await ctx.api.del(`/api/portal/admin/banners/${ids.Encerrado}`, { usuario: 'u-admin' })).status, 200);
    assert.equal((await ctx.api.del(`/api/portal/admin/banners/${ids.Encerrado}`, { usuario: 'u-admin' })).status, 404);
    const acoes = new Set((await ctx.banco.collection('auditoria').find({}).toArray()).map(a => a.acao));
    for (const a of ['banner.criado', 'banner.alterado', 'banner.removido']) assert.ok(acoes.has(a), a);
  });
});

describe('regra de público (puro)', () => {
  test('visivelPara: todos exige vínculo; curso e turma pela interseção', () => {
    const esc = { admin: false, vinculo: false, cursos: new Set(['c1']), turmas: new Set([IDS.T1]) };
    assert.equal(P.visivelPara({ tipo: 'todos' }, esc), false);
    assert.equal(P.visivelPara({ tipo: 'todos' }, { ...esc, vinculo: true }), true);
    assert.equal(P.visivelPara({ tipo: 'curso', cursoIds: ['c1'] }, esc), true);
    assert.equal(P.visivelPara({ tipo: 'curso', cursoIds: ['c2'] }, esc), false);
    assert.equal(P.visivelPara({ tipo: 'turma', cursoIds: ['c1'], turmaIds: [new ObjectId(IDS.T1)] }, esc), true);
    assert.equal(P.visivelPara({ tipo: 'turma', cursoIds: ['c1'], turmaIds: [new ObjectId(IDS.T2)] }, esc), false);
    assert.equal(P.visivelPara({ tipo: 'turma', cursoIds: ['c1'], turmaIds: [new ObjectId(IDS.T2)] }, { ...esc, cursosGeral: new Set(['c1']) }), true);
  });
  test('estadoDoBanner e lerLinkBanner', () => {
    const t = new Date('2026-10-18T12:00:00Z');
    assert.equal(P.estadoDoBanner({ ativo: true, inicioEm: '2026-10-19T00:00:00Z', fimEm: '2026-10-20T00:00:00Z' }, t), 'agendado');
    assert.equal(P.estadoDoBanner({ ativo: true, inicioEm: '2026-10-01T00:00:00Z', fimEm: '2026-10-18T12:00:00Z' }, t), 'encerrado');
    assert.equal(P.estadoDoBanner({ ativo: false, inicioEm: '2026-10-01T00:00:00Z', fimEm: '2026-10-30T00:00:00Z' }, t), 'inativo');
    assert.equal(P.lerLinkBanner('tutoriais.html#novo-portal'), 'tutoriais.html#novo-portal');
    assert.equal(P.lerLinkBanner('https://exemplo.com/x'), 'https://exemplo.com/x');
    assert.equal(P.lerLinkBanner('javascript:alert(1)'), null);
  });
});
