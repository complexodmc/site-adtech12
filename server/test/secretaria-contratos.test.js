// Portal · F4b — contratos com assinatura eletrônica simples nativa (PORTAL-API §6.8.4,
// §3.3, §3.4, §4.4, §4.7; índice §8.5 linha F4b, D-03, D-78). Banco em memória, agregador
// real com SÓ o módulo da fatia (routes/portal/contratos.js); os serviços da F4a
// (secretaria.matriculaPorId / vincularContrato) são falsos que gravam as chamadas. Nenhum Mongo.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid, SENHA_FIXTURE, SEGREDO_TOTP_FIXTURE } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste, CABECALHO_USUARIO } from './apoio/http.js';
import { silencioso, pdfMinimo, pdfComJavascript, htmlDisfarcado, montarPdf, servicosFalsos } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';

const M = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos, executarAvisos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const { criarTratarErroGlobal } = await import('../src/portal/erros.js');
const { codigoTotp, passoAtual } = await import('../src/portal/totp.js');
const { INDICES_DOCUMENTACAO, textoAceiteV1, camposSeloContrato } = await import('../src/portal/documentacao/repositorios.js');

const CFG_TESTE = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });
const MODULO = M.MODULOS_PADRAO.find(m => m.caminho === 'routes/portal/contratos.js');
const CTR_RE = /^CTR(-[2-9A-HJ-NP-Z]{4}){3}$/;
const sha = buf => createHash('sha256').update(buf).digest('hex');
const pdfB = () => montarPdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] >>']);

function falsosF4a(banco) {
  return {
    'secretaria.matriculaPorId': async (id) => {
      const m = await banco.collection('matriculas').findOne({ _id: new ObjectId(String(id)) });
      return m ? { ...m, id: String(m._id) } : null;
    },
    'secretaria.vincularContrato': async (matriculaId, contratoId) => {
      await banco.collection('matriculas').updateOne({ _id: new ObjectId(String(matriculaId)) }, { $set: { contratoId: contratoId ? new ObjectId(String(contratoId)) : null } });
      return { id: String(matriculaId) };
    }
  };
}

async function subirPortal({ comF4a = true } = {}) {
  const banco = criarBancoMemoria({ indices: [...especificacoesRegistradas(), ...INDICES_DOCUMENTACAO] });
  await semear(banco);
  // Matrícula da conta com 2FA (u-2fa) e perfis com identificação civil para quem assina.
  const agora = new Date();
  await banco.collection('matriculas').insertOne({
    _id: new ObjectId('000000000000000000000c09'), numero: 'MAT-2026-AAAAA9', userId: IDS['u-2fa'], cursoId: 'curso-01',
    turmaId: null, status: 'ativa', vigente: true, inicioEm: agora, origem: 'admin', contratoId: null, enturmacoes: [], historico: [], versao: 1, criadoEm: agora, atualizadoEm: agora
  });
  const servicos = criarServicos();
  const falsos = servicosFalsos(comF4a ? falsosF4a(banco) : {}, { em: servicos });
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

const anexar = (ctx, id, buf, { motivo = null, usuario = 'u-admin' } = {}) => ctx.api.post(`/api/portal/admin/contratos/${id}/arquivo`, undefined, {
  usuario, corpoCru: buf, tipo: 'application/pdf', headers: motivo ? { 'x-motivo': encodeURIComponent(motivo) } : {}
});

async function abrir(ctx, id, usuario = 'u-aluno1') {
  const r = await fetch(`${ctx.base}/api/portal/me/contratos/${id}/arquivo`, { headers: { [CABECALHO_USUARIO]: usuario } });
  return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) };
}

const assinar = (ctx, id, corpo, usuario = 'u-aluno1') => ctx.api.post(`/api/portal/me/contratos/${id}/assinar`, corpo, { usuario, headers: { 'user-agent': 'Navegador de teste/1.0' } });

function semSegredo(corpo) {
  const t = JSON.stringify(corpo);
  for (const k of ['senhaHash', '"dados"', 'segredo', '"hash"', '"kid"', '"numero":"1']) assert.ok(!t.includes(k), `JSON com ${k}: ${t.slice(0, 300)}`);
}

const CPF_A1 = '39053344705';

// =============================================================
describe('contratos (rotas e assinatura)', () => {
  let ctx;
  let contratoId;
  before(async () => { ctx = await subirPortal(); });
  after(async () => { await fechar(ctx?.server); });

  test('montagem: rotas da API §6.8.4, serviços e grupos; webhook do provedor NÃO montado', async () => {
    const est = ctx.portal.estadoDoPortal();
    assert.deepEqual(est.falhas, []);
    const rotas = est.rotas['routes/portal/contratos.js'];
    for (const r of [
      'GET /api/portal/me/contratos', 'GET /api/portal/me/contratos/:id/arquivo', 'POST /api/portal/me/contratos/:id/assinar',
      'GET /api/portal/me/contratos/:id/comprovante', 'POST /api/portal/admin/contratos', 'POST /api/portal/admin/contratos/:id/arquivo',
      'POST /api/portal/admin/contratos/:id/cancelar', 'GET /api/portal/admin/contratos', 'GET /api/portal/admin/contratos/:id', 'GET /api/portal/admin/contratos/:id/arquivo'
    ]) assert.ok(rotas.includes(r), `falta ${r}`);
    assert.ok(!rotas.some(r => /webhooks/.test(r)));
    assert.equal((await ctx.api.post('/api/portal/webhooks/contratos/d4sign', {}, { usuario: 'u-admin' })).status, 404);
    for (const n of ['secretaria.temContratoAssinado', 'contratos.situacaoPorMatricula']) assert.equal(typeof ctx.servicos.tentar(n), 'function');
    assert.ok(ctx.servicos.todos('validador').some(v => v.prefixo === 'CTR'));
  });

  test('papéis: 401 sem sessão; aluno e professor 403 na coordenação', async () => {
    assert.equal((await ctx.api.get('/api/portal/me/contratos')).status, 401);
    assert.equal((await ctx.api.get('/api/portal/admin/contratos', { usuario: 'u-prof' })).status, 403);
    assert.equal((await ctx.api.post('/api/portal/admin/contratos', { matriculaId: IDS['mat-aluno1'], titulo: 'X' }, { usuario: 'u-aluno1' })).status, 403);
  });

  test('criar: validação, e-mail não confirmado pede confirmação auditada, vínculo SÓ pelo serviço da F4a, duplicado 409', async () => {
    const semTitulo = await ctx.api.post('/api/portal/admin/contratos', { matriculaId: IDS['mat-aluno1'] }, { usuario: 'u-admin' });
    assert.equal(semTitulo.status, 400);
    const objeto = await ctx.api.post('/api/portal/admin/contratos', { matriculaId: IDS['mat-aluno1'], titulo: { $gt: '' } }, { usuario: 'u-admin' });
    assert.deepEqual([objeto.status, objeto.corpo.codigo], [400, 'formato-invalido']);
    const inexistente = await ctx.api.post('/api/portal/admin/contratos', { matriculaId: '0123456789abcdef01234567', titulo: 'Contrato de teste' }, { usuario: 'u-admin' });
    assert.equal(inexistente.status, 404);
    const r409 = await ctx.api.post('/api/portal/admin/contratos', { matriculaId: IDS['mat-aluno1'], titulo: 'Contrato de matrícula do Curso APE' }, { usuario: 'u-admin' });
    assert.deepEqual([r409.status, r409.corpo.codigo], [409, 'email-nao-verificado']);
    assert.ok('criadaEm' in r409.corpo.conta);
    assert.equal(ctx.banco.documentos('contratos').length, 0);
    const ok = await ctx.api.post('/api/portal/admin/contratos', {
      matriculaId: IDS['mat-aluno1'], titulo: 'Contrato de matrícula do Curso APE', confirmarSemVerificacao: true, motivo: 'Identidade conferida pela secretaria por telefone.'
    }, { usuario: 'u-admin' });
    assert.equal(ok.status, 201, JSON.stringify(ok.corpo));
    contratoId = ok.corpo.id;
    assert.deepEqual(ctx.falsos.chamadas['secretaria.vincularContrato'].map(a => [a[0], a[1]]), [[IDS['mat-aluno1'], contratoId]]);
    const m = await ctx.banco.collection('matriculas').findOne({ _id: oid('mat-aluno1') });
    assert.equal(String(m.contratoId), contratoId);
    const aud = ctx.banco.documentos('auditoria').find(a => a.acao === 'contrato.criado');
    assert.deepEqual([aud.estado, aud.extra.semVerificacao, aud.motivo], ['concluido', true, 'Identidade conferida pela secretaria por telefone.']);
    const dup = await ctx.api.post('/api/portal/admin/contratos', { matriculaId: IDS['mat-aluno1'], titulo: 'Outro', confirmarSemVerificacao: true, motivo: 'Identidade conferida pela secretaria.' }, { usuario: 'u-admin' });
    assert.deepEqual([dup.status, dup.corpo.codigo], [409, 'contrato-pendente-existe']);
    // Rascunho (sem PDF) não aparece ao aluno.
    const meus = await ctx.api.get('/api/portal/me/contratos', { usuario: 'u-aluno1' });
    assert.deepEqual([meus.status, meus.corpo.pendentes, meus.corpo.itens], [200, 0, []]);
    const sit = await ctx.servicos.obter('contratos.situacaoPorMatricula')([IDS['mat-aluno1'], IDS['mat-aluno2']]);
    assert.deepEqual([...sit.entries()], [[IDS['mat-aluno1'], { id: contratoId, status: 'pendente' }]]);
  });

  test('anexar PDF: só PDF sem conteúdo ativo; 1º envio disponibiliza e notifica; aviso não dispensável no portal', async () => {
    const html = await anexar(ctx, contratoId, htmlDisfarcado());
    assert.deepEqual([html.status, html.corpo.codigo], [415, 'tipo-de-arquivo']);
    const ativo = await anexar(ctx, contratoId, pdfComJavascript());
    assert.deepEqual([ativo.status, ativo.corpo.codigo], [415, 'pdf-ativo']);
    const pdf = pdfMinimo();
    const r = await anexar(ctx, contratoId, pdf);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.sha256Pdf, sha(pdf));
    assert.ok(r.corpo.disponivelEm);
    const not = ctx.banco.documentos('notificacoes').filter(n => n.tipo === 'contrato.disponivel');
    assert.deepEqual(not.map(n => [n.userId, n.link]), [[IDS['u-aluno1'], `contrato.html?id=${contratoId}`]]);
    const meus = await ctx.api.get('/api/portal/me/contratos', { usuario: 'u-aluno1' });
    assert.equal(meus.corpo.pendentes, 1);
    const item = meus.corpo.itens[0];
    assert.deepEqual([item.status, item.matriculaNumero, item.cursoTitulo, item.visualizado], ['pendente', 'MAT-2026-AAAAA2', 'Curso de Teste APE', false]);
    assert.equal(item.textoAceite, textoAceiteV1('Contrato de matrícula do Curso APE', sha(pdf)));
    assert.match(item.textoAceite, /^Li integralmente o contrato «Contrato de matrícula do Curso APE», identificado pelo código SHA-256 [a-f0-9]{64}, e concordo com os seus termos\. Assino eletronicamente com meu acesso pessoal à Plataforma Complexo DMC\.$/);
    const user = await ctx.banco.collection('users').findOne({ _id: oid('u-aluno1') });
    const { avisos, contadores } = await executarAvisos(ctx.servicos, { user }, { log: silencioso });
    assert.equal(contadores.contratosPendentes, 1);
    assert.deepEqual(avisos.map(a => [a.id, a.dispensavel, a.href]), [['contrato-pendente', false, `contrato.html?id=${contratoId}`]]);
    const pend = ctx.servicos.tentar('secretaria.pendenciasDoAluno');
    assert.equal(pend, null); // é da documentos.js; aqui só o módulo de contratos
  });

  test('IDOR: outro aluno não lê, não abre, não assina e não vê comprovante (404)', async () => {
    assert.equal((await abrir(ctx, contratoId, 'u-aluno2')).status, 404);
    assert.equal((await assinar(ctx, contratoId, { aceite: true, sha256Pdf: 'x', senha: SENHA_FIXTURE }, 'u-aluno2')).status, 404);
    assert.equal((await ctx.api.get(`/api/portal/me/contratos/${contratoId}/comprovante`, { usuario: 'u-aluno2' })).status, 404);
    assert.deepEqual((await ctx.api.get('/api/portal/me/contratos', { usuario: 'u-aluno2' })).corpo.itens, []);
    assert.equal((await ctx.api.get('/api/portal/me/contratos/nao-e-id/comprovante', { usuario: 'u-aluno1' })).status, 404);
  });

  test('assinatura: validações na ordem da API (abrir → hash → aceite → senha → cadastro)', async () => {
    const atual = (await ctx.api.get('/api/portal/me/contratos', { usuario: 'u-aluno1' })).corpo.itens[0];
    const antes = await assinar(ctx, contratoId, { aceite: true, sha256Pdf: atual.sha256Pdf, senha: SENHA_FIXTURE });
    assert.deepEqual([antes.status, antes.corpo.codigo], [409, 'abra-o-contrato-antes']);
    const aberto = await abrir(ctx, contratoId);
    assert.equal(aberto.status, 200);
    assert.equal(sha(aberto.buf), atual.sha256Pdf);
    assert.match(aberto.headers.get('content-disposition'), /^attachment; filename="contrato-MAT-2026-AAAAA2\.pdf"$/);
    assert.equal(aberto.headers.get('content-security-policy'), "default-src 'none'; sandbox");
    assert.equal(ctx.banco.documentos('auditoria').filter(a => a.acao === 'contrato.visualizado').length, 1);
    await abrir(ctx, contratoId); // 2º download não regrava
    assert.equal(ctx.banco.documentos('auditoria').filter(a => a.acao === 'contrato.visualizado').length, 1);
    const hashErrado = await assinar(ctx, contratoId, { aceite: true, sha256Pdf: 'a'.repeat(64), senha: SENHA_FIXTURE });
    assert.deepEqual([hashErrado.status, hashErrado.corpo.codigo], [409, 'contrato-alterado']);
    const semAceite = await assinar(ctx, contratoId, { aceite: 'sim', sha256Pdf: atual.sha256Pdf, senha: SENHA_FIXTURE });
    assert.equal(semAceite.status, 400);
    assert.ok(semAceite.corpo.campos.aceite);
    const senhaErrada = await assinar(ctx, contratoId, { aceite: true, sha256Pdf: atual.sha256Pdf, senha: 'errada-errada' });
    assert.equal(senhaErrada.status, 400); // nunca 401 (o cliente apagaria a sessão)
    assert.ok(senhaErrada.corpo.campos.senha);
    const semCadastro = await assinar(ctx, contratoId, { aceite: true, sha256Pdf: atual.sha256Pdf, senha: SENHA_FIXTURE });
    assert.deepEqual([semCadastro.status, semCadastro.corpo.codigo, semCadastro.corpo.faltando], [409, 'cadastro-incompleto', ['nomeRegistro', 'documento']]);
    assert.equal((await ctx.banco.collection('contratos').findOne({ _id: new ObjectId(contratoId) })).status, 'pendente');
  });

  test('substituição do PDF pendente exige motivo, zera a visualização e invalida o hash aberto', async () => {
    const anterior = (await ctx.api.get('/api/portal/me/contratos', { usuario: 'u-aluno1' })).corpo.itens[0].sha256Pdf;
    const semMotivo = await anexar(ctx, contratoId, pdfB());
    assert.equal(semMotivo.status, 400);
    assert.ok(semMotivo.corpo.campos.motivo);
    const sub = await anexar(ctx, contratoId, pdfB(), { motivo: 'Correção da cláusula de prazos.' });
    assert.equal(sub.status, 200, JSON.stringify(sub.corpo));
    assert.equal(sub.corpo.substituido, true);
    const c = await ctx.banco.collection('contratos').findOne({ _id: new ObjectId(contratoId) });
    assert.equal(c.visualizadoEm, null);
    assert.deepEqual(c.substituicoes.map(s => [s.sha256Anterior, s.sha256Novo, s.motivo]), [[anterior, sha(pdfB()), 'Correção da cláusula de prazos.']]);
    assert.equal(ctx.banco.documentos('arquivos').filter(a => a.contexto === 'contrato').length, 1);
    await abrir(ctx, contratoId);
    const velho = await assinar(ctx, contratoId, { aceite: true, sha256Pdf: anterior, senha: SENHA_FIXTURE });
    assert.deepEqual([velho.status, velho.corpo.codigo], [409, 'contrato-alterado']);
  });

  test('assinatura válida: evidências, selo, código CTR; assinado é imutável e o hash exibido = hash assinado', async () => {
    await ctx.banco.collection('perfis').insertOne({ userId: IDS['u-aluno1'], nomeRegistro: 'Aluna Um de Registro', cpf: CPF_A1 });
    const atual = (await ctx.api.get('/api/portal/me/contratos', { usuario: 'u-aluno1' })).corpo.itens[0];
    const r = await assinar(ctx, contratoId, { aceite: true, sha256Pdf: atual.sha256Pdf.toUpperCase(), senha: SENHA_FIXTURE });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.status, 'assinado');
    assert.match(r.corpo.codigoVerificacao, CTR_RE);
    assert.match(r.corpo.hashPrefixo, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    assert.equal(r.corpo.urlValidacao, `/plataforma-ead/validar.html?codigo=${r.corpo.codigoVerificacao}`);
    const c = await ctx.banco.collection('contratos').findOne({ _id: new ObjectId(contratoId) });
    const a = c.assinatura;
    assert.equal(a.metodo, 'eletronica_simples_nativa');
    assert.equal(a.sha256Pdf, atual.sha256Pdf);
    assert.equal(c.sha256Pdf, a.sha256Pdf);
    assert.deepEqual(a.fatores, ['sessao', 'senha']);
    assert.equal(a.ipTruncado, '127.0.0.0/24');
    assert.equal(a.userAgent, 'Navegador de teste/1.0');
    assert.deepEqual(a.identificacaoNoAto, { nomeRegistro: 'Aluna Um de Registro', documento: { tipo: 'cpf', numero: CPF_A1 }, email: 'aluno1@exemplo.invalid' });
    assert.equal(a.textoAceite, textoAceiteV1(c.titulo, c.sha256Pdf));
    assert.equal(a.versaoTexto, 'v1');
    const assinador = ctx.servicos.obter('assinador');
    assert.equal(assinador.verificar('contrato', camposSeloContrato(c), a.hash, a.kid), true);
    assert.equal(ctx.banco.documentos('auditoria').find(x => x.acao === 'contrato.assinado').estado, 'concluido');
    // Imutável: nova assinatura, novo PDF e cancelamento duplo.
    const de2 = await assinar(ctx, contratoId, { aceite: true, sha256Pdf: atual.sha256Pdf, senha: SENHA_FIXTURE });
    assert.deepEqual([de2.status, de2.corpo.codigo], [409, 'contrato-nao-pendente']);
    const pdfNovo = await anexar(ctx, contratoId, pdfMinimo(), { motivo: 'Tentativa de troca depois de assinado.' });
    assert.deepEqual([pdfNovo.status, pdfNovo.corpo.codigo], [409, 'contrato-nao-pendente']);
    assert.equal((await ctx.banco.collection('contratos').findOne({ _id: new ObjectId(contratoId) })).sha256Pdf, a.sha256Pdf);
    assert.equal(await ctx.servicos.obter('secretaria.temContratoAssinado')(IDS['u-aluno1']), true);
    assert.equal(await ctx.servicos.obter('secretaria.temContratoAssinado')(IDS['u-aluno2']), false);
  });

  test('comprovante (titular e coordenação) e validação pública CTR sem dado pessoal', async () => {
    const comp = await ctx.api.get(`/api/portal/me/contratos/${contratoId}/comprovante`, { usuario: 'u-aluno1' });
    assert.equal(comp.status, 200);
    for (const k of ['titulo', 'matriculaNumero', 'cursoTitulo', 'assinadoEm', 'codigoVerificacao', 'sha256Pdf', 'fatores', 'ipTruncado', 'versaoTexto', 'textoAceite', 'hashPrefixo', 'urlValidacao', 'signatario', 'userAgent']) {
      assert.ok(k in comp.corpo, `comprovante sem ${k}`);
    }
    assert.ok(!JSON.stringify(comp.corpo).includes(CPF_A1));
    semSegredo(comp.corpo);
    const det = await ctx.api.get(`/api/portal/admin/contratos/${contratoId}`, { usuario: 'u-admin' });
    assert.equal(det.status, 200);
    assert.equal(det.corpo.contrato.assinatura.identificacaoNoAto.documento.numero, '***.533.447-**');
    assert.ok(!JSON.stringify(det.corpo).includes(CPF_A1));
    const v = ctx.servicos.todos('validador').find(x => x.prefixo === 'CTR');
    const val = await v.validar(comp.corpo.codigoVerificacao);
    assert.deepEqual([val.valido, val.tipo, val.iniciais, val.integro, val.situacao], [true, 'contrato', 'A. R.', true, 'valido']);
    assert.equal(val.detalhes.sha256Pdf, comp.corpo.sha256Pdf);
    assert.ok(!JSON.stringify(val).includes('Aluna'));
    assert.ok(!JSON.stringify(val).includes(comp.corpo.titulo));
    assert.equal(await v.nomeTitular(comp.corpo.codigoVerificacao), 'Aluna Um de Registro');
    assert.equal(await v.validar('CTR-2222-2222-2222'), null);
    // Edição direta no banco é detectada pelo selo.
    await ctx.banco.collection('contratos').updateOne({ _id: new ObjectId(contratoId) }, { $set: { 'assinatura.ipTruncado': '10.0.0.0' } });
    assert.equal((await v.validar(comp.corpo.codigoVerificacao)).integro, false);
    await ctx.banco.collection('contratos').updateOne({ _id: new ObjectId(contratoId) }, { $set: { 'assinatura.ipTruncado': '127.0.0.0/24' } });
  });

  test('cancelar: motivo obrigatório; distrato preserva a assinatura; validação passa a "cancelado"; notifica', async () => {
    const curto = await ctx.api.post(`/api/portal/admin/contratos/${contratoId}/cancelar`, { motivo: 'curto' }, { usuario: 'u-admin' });
    assert.equal(curto.status, 400);
    const r = await ctx.api.post(`/api/portal/admin/contratos/${contratoId}/cancelar`, { motivo: 'Distrato a pedido do aluno (QA).' }, { usuario: 'u-admin' });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.contrato.status, 'cancelado');
    assert.ok(r.corpo.contrato.assinatura);
    const de2 = await ctx.api.post(`/api/portal/admin/contratos/${contratoId}/cancelar`, { motivo: 'De novo, não pode (QA).' }, { usuario: 'u-admin' });
    assert.deepEqual([de2.status, de2.corpo.codigo], [409, 'transicao-invalida']);
    const v = ctx.servicos.todos('validador').find(x => x.prefixo === 'CTR');
    const c = await ctx.banco.collection('contratos').findOne({ _id: new ObjectId(contratoId) });
    assert.equal((await v.validar(c.codigoVerificacao)).situacao, 'cancelado');
    assert.equal(ctx.banco.documentos('notificacoes').filter(n => n.tipo === 'contrato.cancelado').length, 1);
    assert.equal(await ctx.servicos.obter('secretaria.temContratoAssinado')(IDS['u-aluno1']), true);
    const lista = await ctx.api.get('/api/portal/admin/contratos?status=cancelado', { usuario: 'u-admin' });
    assert.deepEqual(lista.corpo.itens.map(i => [i.id, i.aluno.nome, i.matriculaNumero]), [[contratoId, 'Aluna Um de Teste', 'MAT-2026-AAAAA2']]);
    assert.equal(lista.corpo.contagem.cancelado, 1);
  });

  test('2FA ativo exige o código do aplicativo; credencial redefinida há < 72 h bloqueia (409)', async () => {
    await ctx.banco.collection('perfis').insertOne({ userId: IDS['u-2fa'], nomeRegistro: 'Conta Dois Fatores', passaporte: { numero: 'XP123456', pais: 'PT' } });
    const cr = await ctx.api.post('/api/portal/admin/contratos', { matriculaId: '000000000000000000000c09', titulo: 'Contrato do curso APE' }, { usuario: 'u-admin' });
    assert.equal(cr.status, 201, JSON.stringify(cr.corpo));
    const id = cr.corpo.id;
    await anexar(ctx, id, pdfMinimo());
    await abrir(ctx, id, 'u-2fa');
    const hash = (await ctx.api.get('/api/portal/me/contratos', { usuario: 'u-2fa' })).corpo.itens[0].sha256Pdf;
    const sem = await assinar(ctx, id, { aceite: true, sha256Pdf: hash, senha: SENHA_FIXTURE }, 'u-2fa');
    assert.equal(sem.status, 400);
    assert.ok(sem.corpo.campos.codigo);
    const errado = await assinar(ctx, id, { aceite: true, sha256Pdf: hash, senha: SENHA_FIXTURE, codigo: '000000' }, 'u-2fa');
    assert.equal(errado.status, 400);
    const codigo = codigoTotp(SEGREDO_TOTP_FIXTURE, passoAtual(Date.now()));
    const ok = await assinar(ctx, id, { aceite: true, sha256Pdf: hash, senha: SENHA_FIXTURE, codigo }, 'u-2fa');
    assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
    const c = await ctx.banco.collection('contratos').findOne({ _id: new ObjectId(id) });
    assert.deepEqual(c.assinatura.fatores, ['sessao', 'senha', 'totp']);
    assert.deepEqual(c.assinatura.identificacaoNoAto.documento, { tipo: 'passaporte', numero: 'XP123456' });

    // Credencial redefinida pela coordenação há 1 h (aluno2).
    await ctx.banco.collection('users').updateOne({ _id: oid('u-aluno2') }, { $set: { credencialRedefinidaPelaCoordenacaoEm: new Date(Date.now() - 3600 * 1000) } });
    const c2 = await ctx.api.post('/api/portal/admin/contratos', { matriculaId: IDS['mat-aluno2'], titulo: 'Contrato do aluno dois', confirmarSemVerificacao: true, motivo: 'Identidade conferida pela secretaria.' }, { usuario: 'u-admin' });
    await anexar(ctx, c2.corpo.id, pdfMinimo());
    await abrir(ctx, c2.corpo.id, 'u-aluno2');
    const h2 = (await ctx.api.get('/api/portal/me/contratos', { usuario: 'u-aluno2' })).corpo.itens[0].sha256Pdf;
    const bloqueado = await assinar(ctx, c2.corpo.id, { aceite: true, sha256Pdf: h2, senha: SENHA_FIXTURE }, 'u-aluno2');
    assert.deepEqual([bloqueado.status, bloqueado.corpo.codigo], [409, 'reautenticacao-necessaria']);
  });

  test('auditoria que falha → 503 e o contrato fica intacto (pendente, sem código)', async () => {
    const pend = ctx.banco.documentos('contratos').find(c => c.userId === IDS['u-aluno2']);
    await ctx.banco.collection('users').updateOne({ _id: oid('u-aluno2') }, { $set: { credencialRedefinidaPelaCoordenacaoEm: null } });
    await ctx.banco.collection('perfis').insertOne({ userId: IDS['u-aluno2'], nomeRegistro: 'Aluno Dois de Registro', cpf: '11144477735' });
    ctx.banco.falhar.insertOne = (col) => col === 'auditoria';
    try {
      const r = await assinar(ctx, String(pend._id), { aceite: true, sha256Pdf: pend.sha256Pdf, senha: SENHA_FIXTURE }, 'u-aluno2');
      assert.deepEqual([r.status, r.corpo.codigo], [503, 'auditoria-indisponivel']);
    } finally { delete ctx.banco.falhar.insertOne; }
    const depois = await ctx.banco.collection('contratos').findOne({ _id: pend._id });
    assert.deepEqual([depois.status, depois.codigoVerificacao, depois.assinatura, depois.versao], ['pendente', null, null, pend.versao]);
  });

  test('limite de 10 tentativas de assinatura em 15 min → 429', async () => {
    const pend = ctx.banco.documentos('contratos').find(c => c.userId === IDS['u-aluno2']);
    let ultimo;
    for (let i = 0; i < 12; i++) {
      ultimo = await assinar(ctx, String(pend._id), { aceite: false, sha256Pdf: pend.sha256Pdf, senha: SENHA_FIXTURE }, 'u-aluno2');
      if (ultimo.status === 429) break;
    }
    assert.deepEqual([ultimo.status, ultimo.corpo.codigo], [429, 'limite']);
  });
});

// =============================================================
describe('sem a F4a (serviços de matrícula ausentes)', () => {
  let ctx;
  before(async () => { ctx = await subirPortal({ comF4a: false }); });
  after(async () => { await fechar(ctx?.server); });

  test('POST /portal/admin/contratos → 503 servico-indisponivel e nada é gravado', async () => {
    const r = await ctx.api.post('/api/portal/admin/contratos', { matriculaId: IDS['mat-aluno1'], titulo: 'Contrato de teste' }, { usuario: 'u-admin' });
    assert.deepEqual([r.status, r.corpo.codigo], [503, 'servico-indisponivel']);
    assert.equal(ctx.banco.documentos('contratos').length, 0);
    assert.equal(ctx.banco.documentos('auditoria').filter(a => a.acao === 'contrato.criado').length, 0);
    const lista = await ctx.api.get('/api/portal/me/contratos', { usuario: 'u-aluno1' });
    assert.deepEqual([lista.status, lista.corpo.itens], [200, []]);
  });
});
