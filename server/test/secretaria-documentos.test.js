// Portal · F4b — documentos pessoais (PORTAL-API §6.8.3, §3.3, §3.4, §4.4, §4.12;
// índice §8.5 linha F4b, D-78). Banco em memória (test/apoio), agregador real com SÓ o
// módulo da fatia (routes/portal/documentos.js) e os serviços da F4a como falsos
// (secretaria.matriculasDoAluno / alunosDoCurso lendo as matrículas semeadas). Nenhum Mongo.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste, CABECALHO_USUARIO } from './apoio/http.js';
import { silencioso, pdfMinimo, pdfComJavascript, htmlDisfarcado, pngMinimo, jpegMinimo, servicosFalsos } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';

const M = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos, executarAvisos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const { criarTratarErroGlobal } = await import('../src/portal/erros.js');
const { INDICES_DOCUMENTACAO, montarChecklist, tipoExigido } = await import('../src/portal/documentacao/repositorios.js');

const CFG_TESTE = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });
const MODULO = M.MODULOS_PADRAO.find(m => m.caminho === 'routes/portal/documentos.js');
const sha = buf => createHash('sha256').update(buf).digest('hex');

/** Falsos da F4a lendo as matrículas do banco em memória (mesma forma dos serviços reais). */
function falsosF4a(banco) {
  return {
    'secretaria.matriculasDoAluno': async (userId) => (await banco.collection('matriculas').find({ userId: String(userId) }).toArray()).map(m => ({ ...m, id: String(m._id) })),
    'secretaria.alunosDoCurso': async ({ cursoId }) => (await banco.collection('matriculas').find({ cursoId: String(cursoId), status: { $in: ['ativa', 'trancada', 'concluida'] } }).toArray())
      .map(m => ({ matriculaId: String(m._id), numero: m.numero, userId: m.userId, status: m.status }))
  };
}

async function subirPortal({ comF4a = true, extras = {} } = {}) {
  const banco = criarBancoMemoria({ indices: [...especificacoesRegistradas(), ...INDICES_DOCUMENTACAO] });
  await semear(banco);
  const servicos = criarServicos();
  const falsos = servicosFalsos({ ...(comF4a ? falsosF4a(banco) : {}), ...extras }, { em: servicos });
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: [MODULO], configPortal: CFG_TESTE, falharCedo: true, log: silencioso
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  await portal.carregar();
  return { api: cliente(base), base, server, banco, servicos, falsos, portal };
}

const enviar = (ctx, tipoId, buf, usuario = 'u-aluno1', tipo = 'application/octet-stream') =>
  ctx.api.post(`/api/portal/me/documentos/tipos/${tipoId}/envio`, undefined, { usuario, corpoCru: buf, tipo });

async function baixar(base, caminho, usuario) {
  const r = await fetch(base + caminho, { headers: { [CABECALHO_USUARIO]: usuario } });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, headers: r.headers, buf };
}

async function criarTipo(ctx, corpo) {
  const r = await ctx.api.post('/api/portal/admin/documentos/tipos', corpo, { usuario: 'u-admin' });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo.tipo;
}

/** Nenhum JSON do domínio vaza segredo nem binário. */
function semSegredo(corpo) {
  const t = JSON.stringify(corpo);
  for (const k of ['senhaHash', '"dados"', 'segredo', 'arquivoId']) assert.ok(!t.includes(k), `JSON com ${k}: ${t.slice(0, 200)}`);
}

// =============================================================
describe('funções puras do checklist', () => {
  test('exigido: ativo + escopo todos (com matrícula) ou curso em comum; sem matrícula nada é exigido', () => {
    const todos = { _id: oid('T1'), sigla: 'DOC', ativo: true, escopo: 'todos' };
    const doCurso = { _id: oid('T2'), sigla: 'DIP', ativo: true, escopo: 'cursos', cursoIds: ['curso-02'] };
    assert.equal(tipoExigido(todos, ['curso-01']), true);
    assert.equal(tipoExigido(todos, []), false);
    assert.equal(tipoExigido(doCurso, ['curso-01']), false);
    assert.equal(tipoExigido(doCurso, ['curso-02']), true);
    assert.equal(tipoExigido({ ...todos, ativo: false }, ['curso-01']), false);
  });
  test('status derivado nao_enviado, tipo não mais exigido com envio fica exigido:false, resumo só dos exigidos', () => {
    const t1 = { _id: oid('T1'), sigla: 'DOC', nome: 'Identidade', ativo: true, escopo: 'todos', ordem: 2, formatos: ['pdf'] };
    const t2 = { _id: oid('T2'), sigla: 'DIP', nome: 'Diploma', ativo: false, escopo: 'todos', ordem: 1, formatos: ['pdf'] };
    const envio = { _id: oid('mat-aluno1'), tipoId: oid('T2'), atual: true, status: 'aprovado', numeroEnvio: 1, enviadoEm: new Date() };
    const ck = montarChecklist({ tipos: [t1, t2], envios: [envio], cursoIds: ['curso-01'], limiteBytes: 4 });
    assert.deepEqual(ck.itens.map(i => [i.sigla, i.status, i.exigido, i.podeEnviar]), [['DIP', 'aprovado', false, false], ['DOC', 'nao_enviado', true, true]]);
    assert.deepEqual(ck.resumo, { exigidos: 1, aprovados: 0, emRevisao: 0, pendentes: 0, naoEnviados: 1 });
  });
});

// =============================================================
describe('documentos pessoais (rotas)', () => {
  let ctx;
  let tipoDoc;
  let tipoDip;
  before(async () => {
    ctx = await subirPortal();
    tipoDoc = await criarTipo(ctx, { sigla: 'doc', nome: 'Documento de identificação com foto', descricao: 'RG, CNH ou passaporte.', formatos: ['pdf', 'jpg', 'png'], escopo: 'todos', obrigatorio: true, ativo: true, ordem: 1 });
    tipoDip = await criarTipo(ctx, { sigla: 'DIP', nome: 'Diploma de graduação', formatos: ['pdf'], escopo: 'cursos', cursoIds: ['curso-01'], obrigatorio: true, ativo: true, ordem: 2 });
  });
  after(async () => { await fechar(ctx?.server); });

  test('montagem: rotas da API §6.8.3 e o serviço secretaria.pendenciasDoAluno', () => {
    const est = ctx.portal.estadoDoPortal();
    assert.deepEqual(est.falhas, []);
    const rotas = est.rotas['routes/portal/documentos.js'];
    for (const r of [
      'GET /api/portal/me/documentos', 'POST /api/portal/me/documentos/tipos/:tipoId/envio', 'GET /api/portal/me/documentos/envios/:envioId/arquivo',
      'GET /api/portal/admin/documentos', 'PUT /api/portal/admin/documentos/envios/:envioId/revisao', 'GET /api/portal/admin/documentos/envios/:envioId/arquivo',
      'GET /api/portal/admin/usuarios/:userId/documentos', 'GET /api/portal/admin/documentos/tipos', 'POST /api/portal/admin/documentos/tipos',
      'PUT /api/portal/admin/documentos/tipos/:id', 'DELETE /api/portal/admin/documentos/tipos/:id', 'POST /api/portal/admin/documentos/tipos/sugeridos'
    ]) assert.ok(rotas.includes(r), `falta ${r}`);
    assert.equal(typeof ctx.servicos.tentar('secretaria.pendenciasDoAluno'), 'function');
    assert.deepEqual(est.indices['routes/portal/documentos.js'].sort(), INDICES_DOCUMENTACAO.map(i => i.opcoes.name).sort());
  });

  test('401 sem sessão; professor e aluno 403 na coordenação', async () => {
    assert.equal((await ctx.api.get('/api/portal/me/documentos')).status, 401);
    assert.equal((await ctx.api.get('/api/portal/admin/documentos', { usuario: 'u-prof' })).status, 403);
    assert.equal((await ctx.api.get('/api/portal/admin/documentos/tipos', { usuario: 'u-aluno1' })).status, 403);
    assert.equal((await ctx.api.post('/api/portal/admin/documentos/tipos', { sigla: 'XX', nome: 'Teste' }, { usuario: 'u-prof' })).status, 403);
  });

  test('tipos: validação, sigla única, cursos desconhecidos, formato-invalido com objeto', async () => {
    const r1 = await ctx.api.post('/api/portal/admin/documentos/tipos', { sigla: 'D1', nome: 'Teste' }, { usuario: 'u-admin' });
    assert.equal(r1.status, 400);
    assert.ok(r1.corpo.campos.sigla);
    const r2 = await ctx.api.post('/api/portal/admin/documentos/tipos', { sigla: 'DOC', nome: 'Duplicado' }, { usuario: 'u-admin' });
    assert.deepEqual([r2.status, r2.corpo.codigo], [409, 'sigla-em-uso']);
    const r3 = await ctx.api.post('/api/portal/admin/documentos/tipos', { sigla: 'XYZ', nome: 'Com curso falso', escopo: 'cursos', cursoIds: ['nao-existe'] }, { usuario: 'u-admin' });
    assert.equal(r3.status, 400);
    assert.ok(r3.corpo.campos.cursoIds);
    const r4 = await ctx.api.post('/api/portal/admin/documentos/tipos', { sigla: 'XYZ', nome: { $ne: 1 } }, { usuario: 'u-admin' });
    assert.deepEqual([r4.status, r4.corpo.codigo], [400, 'formato-invalido']);
    assert.match(r4.corpo.requestId || '', /^r-/);
  });

  test('sugeridos DOC/DIP/CERT/HIS/RES nascem INATIVOS e não aparecem para o aluno', async () => {
    const r = await ctx.api.post('/api/portal/admin/documentos/tipos/sugeridos', {}, { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.criados, ['CERT', 'HIS', 'RES']); // DOC e DIP já existiam
    const de2 = await ctx.api.post('/api/portal/admin/documentos/tipos/sugeridos', {}, { usuario: 'u-admin' });
    assert.deepEqual(de2.corpo.criados, []);
    const tipos = await ctx.api.get('/api/portal/admin/documentos/tipos', { usuario: 'u-admin' });
    const porSigla = Object.fromEntries(tipos.corpo.itens.map(t => [t.sigla, t]));
    for (const s of ['CERT', 'HIS', 'RES']) assert.equal(porSigla[s].ativo, false);
    const ck = await ctx.api.get('/api/portal/me/documentos', { usuario: 'u-aluno1' });
    assert.deepEqual(ck.corpo.itens.map(i => i.sigla), ['DOC', 'DIP']);
  });

  test('checklist do aluno: nao_enviado, formatos, limite 4 MB; aluno sem matrícula vê vazio', async () => {
    const r = await ctx.api.get('/api/portal/me/documentos', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.limiteBytes, 4 * 1024 * 1024);
    assert.deepEqual(r.corpo.formatos, ['pdf', 'jpg', 'png']);
    assert.deepEqual(r.corpo.itens.map(i => [i.sigla, i.status, i.exigido, i.podeEnviar]), [['DOC', 'nao_enviado', true, true], ['DIP', 'nao_enviado', true, true]]);
    assert.deepEqual(r.corpo.resumo, { exigidos: 2, aprovados: 0, emRevisao: 0, pendentes: 0, naoEnviados: 2 });
    const vazio = await ctx.api.get('/api/portal/me/documentos', { usuario: 'u-intruso' });
    assert.deepEqual([vazio.status, vazio.corpo.itens], [200, []]);
    semSegredo(r.corpo);
  });

  test('liberação ainda sem matrícula também exige os documentos (acesso.cursosDoAluno: liberações ∪ matrículas)', async () => {
    await ctx.banco.collection('liberacoes').insertOne({ userId: IDS['u-ex'], cursoId: 'curso-01', grantedAt: new Date(), grantedBy: IDS['u-admin'] });
    const r = await ctx.api.get('/api/portal/me/documentos', { usuario: 'u-ex' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.itens.map(i => [i.sigla, i.status, i.exigido]), [['DOC', 'nao_enviado', true], ['DIP', 'nao_enviado', true]]);
    await ctx.banco.collection('liberacoes').deleteOne({ userId: IDS['u-ex'] });
  });

  test('envio: tipo pelos bytes; HTML disfarçado e PDF ativo → 415; formato fora do tipo → 415; > 4 MB → 413', async () => {
    const html = await enviar(ctx, tipoDoc.id, htmlDisfarcado(), 'u-aluno2', 'application/pdf');
    assert.deepEqual([html.status, html.corpo.codigo], [415, 'tipo-de-arquivo']);
    const ativo = await enviar(ctx, tipoDoc.id, pdfComJavascript(), 'u-aluno2');
    assert.deepEqual([ativo.status, ativo.corpo.codigo], [415, 'pdf-ativo']);
    const jpg = await enviar(ctx, tipoDip.id, jpegMinimo(), 'u-aluno2', 'image/jpeg');
    assert.deepEqual([jpg.status, jpg.corpo.codigo], [415, 'tipo-de-arquivo']);
    const grande = Buffer.concat([pdfMinimo(), Buffer.alloc(4 * 1024 * 1024 + 10, 0x20)]);
    const g = await enviar(ctx, tipoDoc.id, grande, 'u-aluno2', 'application/pdf');
    assert.deepEqual([g.status, g.corpo.codigo], [413, 'arquivo-grande']);
    const inexistente = await enviar(ctx, '0123456789abcdef01234567', pdfMinimo(), 'u-aluno2');
    assert.equal(inexistente.status, 404);
    const intruso = await enviar(ctx, tipoDoc.id, pdfMinimo(), 'u-intruso');
    assert.equal(intruso.status, 404); // não exigido (sem matrícula)
    assert.equal(ctx.banco.documentos('documentos_enviados').filter(e => e.userId === IDS['u-aluno2']).length, 0);
  });

  test('envio e reenvio: histórico preservado, binário anterior apagado, sha256 guardado', async () => {
    const pdf = pdfMinimo();
    const r1 = await enviar(ctx, tipoDoc.id, pdf);
    assert.equal(r1.status, 201, JSON.stringify(r1.corpo));
    assert.deepEqual([r1.corpo.status, r1.corpo.numeroEnvio, r1.corpo.mime], ['em_revisao', 1, 'application/pdf']);
    const png = pngMinimo();
    const r2 = await enviar(ctx, tipoDoc.id, png, 'u-aluno1', 'image/png');
    assert.equal(r2.status, 201);
    assert.deepEqual([r2.corpo.status, r2.corpo.numeroEnvio, r2.corpo.mime], ['em_revisao', 2, 'image/png']);
    const envios = ctx.banco.documentos('documentos_enviados').filter(e => e.userId === IDS['u-aluno1']).sort((a, b) => a.numeroEnvio - b.numeroEnvio);
    assert.deepEqual(envios.map(e => [e.numeroEnvio, e.status, e.atual, !!e.arquivoId]), [[1, 'substituido', false, false], [2, 'em_revisao', true, true]]);
    assert.equal(envios[0].sha256, sha(pdf));
    assert.equal(envios[1].sha256, sha(png));
    const binarios = ctx.banco.documentos('arquivos').filter(a => a.contexto === 'documento' && a.donoUserId === IDS['u-aluno1']);
    assert.equal(binarios.length, 1);
    assert.ok(ctx.banco.documentos('auditoria').filter(a => a.acao === 'documento.enviado').length >= 2);
  });

  test('download só do titular ou da coordenação, por header, com os cabeçalhos de arquivo privado', async () => {
    const env = ctx.banco.documentos('documentos_enviados').find(e => e.userId === IDS['u-aluno1'] && e.atual);
    const id = String(env._id);
    const meu = await baixar(ctx.base, `/api/portal/me/documentos/envios/${id}/arquivo`, 'u-aluno1');
    assert.equal(meu.status, 200);
    assert.equal(sha(meu.buf), env.sha256);
    assert.match(meu.headers.get('content-disposition'), /^attachment; filename="DOC-v2\.png"$/);
    assert.equal(meu.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(meu.headers.get('content-security-policy'), "default-src 'none'; sandbox");
    assert.equal(meu.headers.get('cache-control'), 'private, no-store');
    // IDOR: outro aluno e professor não leem.
    assert.equal((await baixar(ctx.base, `/api/portal/me/documentos/envios/${id}/arquivo`, 'u-aluno2')).status, 404);
    assert.equal((await baixar(ctx.base, `/api/portal/admin/documentos/envios/${id}/arquivo`, 'u-prof')).status, 403);
    assert.equal((await baixar(ctx.base, `/api/portal/admin/documentos/envios/${id}/arquivo`, 'u-aluno2')).status, 403);
    const adm = await baixar(ctx.base, `/api/portal/admin/documentos/envios/${id}/arquivo`, 'u-admin');
    assert.equal(adm.status, 200);
    assert.ok(ctx.banco.documentos('auditoria').some(a => a.acao === 'documento.baixado_pela_equipe' && a.entidade.id === id));
    // Envio substituído não tem mais binário.
    const velho = ctx.banco.documentos('documentos_enviados').find(e => e.userId === IDS['u-aluno1'] && !e.atual);
    assert.equal((await baixar(ctx.base, `/api/portal/me/documentos/envios/${String(velho._id)}/arquivo`, 'u-aluno1')).status, 404);
  });

  test('fila da coordenação: em revisão do mais antigo; não enviados calculados; detalhe com histórico', async () => {
    await enviar(ctx, tipoDip.id, pdfMinimo(), 'u-aluno2');
    const f = await ctx.api.get('/api/portal/admin/documentos', { usuario: 'u-admin' });
    assert.equal(f.status, 200);
    assert.deepEqual(f.corpo.itens.map(i => [i.sigla, i.aluno.id, i.status]), [['DOC', IDS['u-aluno1'], 'em_revisao'], ['DIP', IDS['u-aluno2'], 'em_revisao']]);
    assert.deepEqual(f.corpo.itens[0].cursos, ['Curso de Teste APE']);
    const ne = await ctx.api.get('/api/portal/admin/documentos?status=nao_enviado', { usuario: 'u-admin' });
    assert.deepEqual(ne.corpo.itens.map(i => [i.sigla, i.aluno.id]).sort(), [['DIP', IDS['u-aluno1']], ['DOC', IDS['u-aluno2']]].sort());
    const q = await ctx.api.get('/api/portal/admin/documentos?q=dois', { usuario: 'u-admin' });
    assert.deepEqual(q.corpo.itens.map(i => i.aluno.id), [IDS['u-aluno2']]);
    const det = await ctx.api.get(`/api/portal/admin/documentos/envios/${f.corpo.itens[0].id}`, { usuario: 'u-admin' });
    assert.equal(det.status, 200);
    assert.deepEqual(det.corpo.historico.map(h => [h.numeroEnvio, h.status]), [[2, 'em_revisao'], [1, 'substituido']]);
    assert.equal(det.corpo.proximo, f.corpo.itens[1].id);
    semSegredo(det.corpo);
    const doAluno = await ctx.api.get(`/api/portal/admin/usuarios/${IDS['u-aluno1']}/documentos`, { usuario: 'u-admin' });
    assert.equal(doAluno.corpo.itens.length, 2);
    assert.equal((await ctx.api.get('/api/portal/admin/usuarios/0123456789abcdef01234567/documentos', { usuario: 'u-admin' })).status, 404);
  });

  test('revisão: motivo obrigatório no pendente, versão, transições, notificação e aprovado não se reenvia', async () => {
    const env = ctx.banco.documentos('documentos_enviados').find(e => e.userId === IDS['u-aluno1'] && e.atual);
    const id = String(env._id);
    const semMotivo = await ctx.api.put(`/api/portal/admin/documentos/envios/${id}/revisao`, { decisao: 'pendente', versao: env.versao }, { usuario: 'u-admin' });
    assert.equal(semMotivo.status, 400);
    assert.ok(semMotivo.corpo.campos.motivo);
    const velha = await ctx.api.put(`/api/portal/admin/documentos/envios/${id}/revisao`, { decisao: 'aprovado', versao: env.versao + 5 }, { usuario: 'u-admin' });
    assert.deepEqual([velha.status, velha.corpo.codigo], [409, 'conflito-versao']);
    const pend = await ctx.api.put(`/api/portal/admin/documentos/envios/${id}/revisao`, { decisao: 'pendente', motivo: 'Imagem cortada no verso.', versao: env.versao }, { usuario: 'u-admin' });
    assert.equal(pend.status, 200, JSON.stringify(pend.corpo));
    assert.deepEqual([pend.corpo.envio.status, pend.corpo.envio.motivo], ['pendente', 'Imagem cortada no verso.']);
    const ck = await ctx.api.get('/api/portal/me/documentos', { usuario: 'u-aluno1' });
    assert.deepEqual([ck.corpo.itens[0].status, ck.corpo.itens[0].motivo], ['pendente', 'Imagem cortada no verso.']);
    const not = ctx.banco.documentos('notificacoes').filter(n => n.userId === IDS['u-aluno1'] && n.tipo === 'documento.revisado');
    assert.equal(not.length, 1);
    assert.equal(not[0].link, 'documentos.html');
    // pendente → aprovado não é transição da API (só em_revisao → aprovado/pendente e aprovado → pendente).
    const inv = await ctx.api.put(`/api/portal/admin/documentos/envios/${id}/revisao`, { decisao: 'aprovado', versao: pend.corpo.envio.versao }, { usuario: 'u-admin' });
    assert.deepEqual([inv.status, inv.corpo.codigo], [409, 'transicao-invalida']);
    // Reenvio do pendente → em_revisao (3º envio) → aprovado → reenvio recusado → "solicitar novo envio".
    const r3 = await enviar(ctx, tipoDoc.id, pdfMinimo());
    assert.deepEqual([r3.status, r3.corpo.numeroEnvio], [201, 3]);
    const novo = ctx.banco.documentos('documentos_enviados').find(e => e.userId === IDS['u-aluno1'] && e.atual && e.sigla === 'DOC');
    const ap = await ctx.api.put(`/api/portal/admin/documentos/envios/${String(novo._id)}/revisao`, { decisao: 'aprovado', versao: novo.versao }, { usuario: 'u-admin' });
    assert.equal(ap.status, 200);
    const recusa = await enviar(ctx, tipoDoc.id, pdfMinimo());
    assert.deepEqual([recusa.status, recusa.corpo.codigo], [409, 'documento-aprovado']);
    const sol = await ctx.api.put(`/api/portal/admin/documentos/envios/${String(novo._id)}/revisao`, { decisao: 'pendente', motivo: 'Documento vencido.', versao: ap.corpo.envio.versao }, { usuario: 'u-admin' });
    assert.equal(sol.status, 200);
    assert.ok(ctx.banco.documentos('auditoria').filter(a => a.acao === 'documento.revisado' && a.estado === 'concluido').length >= 3);
  });

  test('auditoria que falha → 503 e o envio fica intacto', async () => {
    const env = ctx.banco.documentos('documentos_enviados').find(e => e.userId === IDS['u-aluno2'] && e.atual);
    ctx.banco.falhar.insertOne = (col) => col === 'auditoria';
    try {
      const r = await ctx.api.put(`/api/portal/admin/documentos/envios/${String(env._id)}/revisao`, { decisao: 'aprovado', versao: env.versao }, { usuario: 'u-admin' });
      assert.deepEqual([r.status, r.corpo.codigo], [503, 'auditoria-indisponivel']);
    } finally { delete ctx.banco.falhar.insertOne; }
    const depois = ctx.banco.documentos('documentos_enviados').find(e => String(e._id) === String(env._id));
    assert.deepEqual([depois.status, depois.versao], ['em_revisao', env.versao]);
  });

  test('tipos: sigla não muda depois do 1º envio; exclusão só sem envios; desativar mantém o envio (exigido:false)', async () => {
    const t = (await ctx.api.get('/api/portal/admin/documentos/tipos', { usuario: 'u-admin' })).corpo.itens.find(x => x.sigla === 'DIP');
    assert.equal(t.emUso, true);
    const s = await ctx.api.put(`/api/portal/admin/documentos/tipos/${t.id}`, { sigla: 'DIPL', versao: t.versao }, { usuario: 'u-admin' });
    assert.deepEqual([s.status, s.corpo.codigo], [409, 'tipo-em-uso']);
    const del = await ctx.api.del(`/api/portal/admin/documentos/tipos/${t.id}`, { usuario: 'u-admin' });
    assert.deepEqual([del.status, del.corpo.codigo], [409, 'tipo-em-uso']);
    const off = await ctx.api.put(`/api/portal/admin/documentos/tipos/${t.id}`, { ativo: false, versao: t.versao }, { usuario: 'u-admin' });
    assert.equal(off.status, 200);
    const ck = await ctx.api.get('/api/portal/me/documentos', { usuario: 'u-aluno2' });
    const dip = ck.corpo.itens.find(i => i.sigla === 'DIP');
    assert.deepEqual([dip.exigido, dip.status, dip.podeEnviar], [false, 'em_revisao', false]);
    const res = (await ctx.api.get('/api/portal/admin/documentos/tipos', { usuario: 'u-admin' })).corpo.itens.find(x => x.sigla === 'RES');
    const delRes = await ctx.api.del(`/api/portal/admin/documentos/tipos/${res.id}`, { usuario: 'u-admin' });
    assert.deepEqual([delRes.status, delRes.corpo], [200, { ok: true }]);
    const conflito = await ctx.api.put(`/api/portal/admin/documentos/tipos/${t.id}`, { nome: 'Outro nome', versao: t.versao }, { usuario: 'u-admin' });
    assert.deepEqual([conflito.status, conflito.corpo.codigo], [409, 'conflito-versao']);
  });

  test('serviço pendenciasDoAluno, avisos documento-pendente/nao-enviado e painel', async () => {
    const pend = await ctx.servicos.obter('secretaria.pendenciasDoAluno')(IDS['u-aluno1']);
    // DIP foi desativado no caso anterior: deixa de ser exigido e sai das pendências.
    assert.deepEqual(pend.documentos.map(d => [d.sigla, d.status]), [['DOC', 'pendente']]);
    assert.deepEqual(pend.contratos, []);
    const user = await ctx.banco.collection('users').findOne({ _id: oid('u-aluno1') });
    const { contadores, avisos } = await executarAvisos(ctx.servicos, { user }, { log: silencioso });
    assert.equal(contadores.documentosPendentes, 1);
    assert.equal(contadores.documentosNaoEnviados, 0);
    assert.ok(avisos.every(a => a.href === 'documentos.html'));
    const painel = ctx.servicos.todos('painel').find(p => p.bloco === 'documentos');
    const n = await painel.contar({ user: { isAdmin: true, papel: 'admin' } }, { cursoIds: null });
    assert.deepEqual(Object.keys(n).sort(), ['emRevisao', 'naoEnviadosObrigatorios', 'pendentes']);
    assert.ok(Number.isInteger(n.naoEnviadosObrigatorios));
    const exp = await ctx.servicos.todos('exportador').find(e => e.dominio === 'documentos').exportar(IDS['u-aluno1']);
    assert.ok(exp.envios.length >= 3);
    semSegredo(exp);
  });

  test('limite de 20 envios por hora por aluno → 429 com Retry-After', async () => {
    // u-aluno2 já usou alguns envios; esgota o resto.
    let ultimo;
    for (let i = 0; i < 25; i++) {
      ultimo = await enviar(ctx, tipoDoc.id, htmlDisfarcado(), 'u-aluno2', 'application/pdf');
      if (ultimo.status === 429) break;
    }
    assert.equal(ultimo.status, 429);
    assert.equal(ultimo.corpo.codigo, 'limite');
    assert.ok(Number(ultimo.headers.get('retry-after')) > 0);
  });
});

// =============================================================
describe('sem a F4a (cursos do aluno indisponíveis)', () => {
  let ctx;
  before(async () => { ctx = await subirPortal({ comF4a: false }); });
  after(async () => { await fechar(ctx?.server); });

  test('GET /me/documentos e envio → 503 servico-indisponivel, nada gravado', async () => {
    const t = await criarTipo(ctx, { sigla: 'DOC', nome: 'Documento de identificação', escopo: 'todos', ativo: true });
    const r = await ctx.api.get('/api/portal/me/documentos', { usuario: 'u-aluno1' });
    assert.deepEqual([r.status, r.corpo.codigo], [503, 'servico-indisponivel']);
    const e = await enviar(ctx, t.id, pdfMinimo());
    assert.deepEqual([e.status, e.corpo.codigo], [503, 'servico-indisponivel']);
    assert.equal(ctx.banco.documentos('documentos_enviados').length, 0);
    assert.equal(ctx.banco.documentos('arquivos').length, 0);
    // A fila de envios da coordenação continua (sem a coluna de cursos).
    const f = await ctx.api.get('/api/portal/admin/documentos', { usuario: 'u-admin' });
    assert.deepEqual([f.status, f.corpo.itens], [200, []]);
  });
});
