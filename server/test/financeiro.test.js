// Portal · F5 — financeiro manual (PORTAL-API §6.9, §3.3, §8.9–§8.10, §9.3 linha financeiro.test.js;
// índice §8.5 linha F5, CEO-1/EXCEÇÃO 1, D-18, D-79, DC-69).
// Banco em memória (test/apoio), agregador real com SÓ o módulo da fatia
// (routes/portal/financeiro.js), serviços de outras fatias como falsos (a emissão
// de declarações usa o serviço da F3b pelo contrato `declaracoes.emitir`). Nenhum Mongo.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ObjectId } from 'mongodb';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso, relogio, pdfMinimo, servicosFalsos } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';

const M = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos, executarAvisos, montarPainel } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const { criarTratarErroGlobal } = await import('../src/portal/erros.js');
const { hojeSP } = await import('../src/portal/validacao.js');
const C = await import('../src/portal/financeiro/calculo.js');
const { INDICES_FINANCEIRO } = await import('../src/portal/financeiro/repositorios.js');
const { criarServicoDeclaracoes, INDICES_CERTIFICACAO } = await import('../src/portal/certificacao/declaracoes.js');

const CFG_TESTE = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });
const MODULO = M.MODULOS_PADRAO.find(m => m.caminho === 'routes/portal/financeiro.js');
const MODULO_F3B = M.MODULOS_PADRAO.find(m => m.caminho === 'routes/portal-declaracoes.js');
const ADM = { usuario: 'u-admin' };
const A1 = { usuario: 'u-aluno1' };
const A2 = { usuario: 'u-aluno2' };
const ATD_RE = /^ATD-\d{4}-[2-9A-HJ-NP-Z]{6}$/;

/**
 * Sobe o agregador só com a F5. `instituicao` controla configuracoes.instituicao (F6a falso);
 * `semAtendimento` deixa atendimento.abrirProtocolo de fora (503 do pedido).
 */
async function subirPortal({ instituicao = { razaoSocial: 'Complexo DMC Educação Ltda.', cnpj: '11222333000181' }, semAtendimento = false, agora = relogio(), comF3b = false } = {}) {
  const banco = criarBancoMemoria({ indices: [...especificacoesRegistradas(), ...INDICES_FINANCEIRO, ...INDICES_CERTIFICACAO] });
  await semear(banco);
  await banco.collection('cursos').updateOne({ _id: 'curso-02' }, { $set: { preco: 1990.0 } });
  await banco.collection('cursos').insertMany([
    { _id: 'curso-03', titulo: 'Curso sem preço', isAtivo: true, ordem: 3 },
    { _id: 'curso-04', titulo: 'Curso inativo', isAtivo: false, preco: 500, ordem: 4 }
  ]);
  await banco.collection('perfis').insertOne({ userId: IDS['u-aluno2'], nomeRegistro: 'Aluno Dois de Teste', cpf: '52998224725' });
  const servicos = criarServicos();
  const estado = { instituicao };
  const protocolosAbertos = [];
  const mapa = {
    'secretaria.matriculasDoAluno': async (userId) => (await banco.collection('matriculas').find({ userId: String(userId) }).toArray()).map(m => ({ ...m, id: m._id.toHexString() })),
    'configuracoes.instituicao': async () => estado.instituicao,
    'declaracoes.emitir': (args) => criarServicoDeclaracoes({ repo: n => banco.collection(n), assinador: () => servicos.tentar('assinador'), agora }).emitir(args)
  };
  if (comF3b) delete mapa['declaracoes.emitir']; // o módulo real da F3b registra o serviço
  if (!semAtendimento) {
    let seq = 0;
    mapa['atendimento.abrirProtocolo'] = async (dados) => {
      const protocolo = `ATD-2026-${'ABCDEF'.slice(0, 5)}${'23456789'[seq++ % 8]}`;
      const doc = { userId: String(dados.userId), protocolo, categoria: dados.categoria, origem: dados.origem, assunto: dados.assunto, status: 'aberto', pedido: { ...dados.pedido, em: agora() }, criadoEm: agora() };
      const r = await banco.collection('protocolos').insertOne(doc);
      protocolosAbertos.push(dados);
      return { id: String(r.insertedId), protocolo };
    };
  }
  const falsos = servicosFalsos(mapa, { em: servicos });
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: comF3b ? [MODULO, MODULO_F3B] : [MODULO], configPortal: CFG_TESTE, falharCedo: true, log: silencioso, agora
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  await portal.carregar();
  return { api: cliente(base), server, banco, servicos, portal, estado, chamadas: falsos.chamadas, protocolosAbertos, agora };
}

const auditorias = (banco, acao) => banco.documentos('auditoria').filter(a => a.acao === acao);
const reqDe = async (banco, nome) => ({ user: await banco.collection('users').findOne({ _id: oid(nome) }), ip: '127.0.0.1' });

async function lancar(ctx, corpo, opcoes = ADM) {
  const r = await ctx.api.post('/api/portal/admin/financeiro/lancamentos', corpo, opcoes);
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  return r.corpo.lancamento;
}

const SEGREDOS_RE = /senhaHash|segredo|JWT_SECRET|RESEND_API_KEY|GEMINI_API_KEY|"cpf"|52998224725/;

// =============================================================
describe('regras puras (calculo.js)', () => {
  test('status derivado com virada de dia em São Paulo (02:00Z do dia 18 = dia 17 em SP)', () => {
    const l = { situacao: 'pendente', vencimento: '2026-10-17' };
    assert.equal(C.statusDe(l, hojeSP(new Date('2026-10-18T02:00:00Z'))), 'aberto');
    assert.equal(C.statusDe(l, hojeSP(new Date('2026-10-18T03:00:00Z'))), 'atrasado');
    assert.equal(C.statusDe({ ...l, situacao: 'pago' }, '2030-01-01'), 'pago');
    assert.equal(C.statusDe({ ...l, situacao: 'cancelado' }, '2000-01-01'), 'cancelado');
  });

  test('"Vence em N dias" só com N ≤ 3 (D-18)', () => {
    const hoje = '2026-10-18';
    assert.equal(C.venceEmDias({ situacao: 'pendente', vencimento: '2026-10-18' }, hoje), 0);
    assert.equal(C.venceEmDias({ situacao: 'pendente', vencimento: '2026-10-21' }, hoje), 3);
    assert.equal(C.venceEmDias({ situacao: 'pendente', vencimento: '2026-10-22' }, hoje), null);
    assert.equal(C.venceEmDias({ situacao: 'pendente', vencimento: '2026-10-17' }, hoje), null, 'atrasado não "vence em"');
    assert.equal(C.venceEmDias({ situacao: 'pago', vencimento: '2026-10-19' }, hoje), null);
  });

  test('lote a partir de 31/01: 31/01, 28/02, 31/03 (último dia quando o dia não existe)', () => {
    assert.deepEqual(C.planejarParcelas('2027-01-31', 3), ['2027-01-31', '2027-02-28', '2027-03-31']);
    assert.deepEqual(C.planejarParcelas('2028-01-31', 2), ['2028-01-31', '2028-02-29'], 'bissexto');
    assert.deepEqual(C.planejarParcelas('2026-11-15', 3), ['2026-11-15', '2026-12-15', '2027-01-15'], 'vira o ano');
    assert.equal(C.planejarParcelas('2026-11-15', 61).length, 0);
    assert.equal(C.planejarParcelas('2026-02-30', 2).length, 0);
  });

  test('KPIs em centavos: ignoram cancelado; total = aberto + atrasado + pago; pago usa valorPagoCentavos', () => {
    const hoje = '2026-10-18';
    const k = C.calcularKpis([
      { situacao: 'pendente', vencimento: '2026-10-30', valorCentavos: 49900 },
      { situacao: 'pendente', vencimento: '2026-10-01', valorCentavos: 10001 },
      { situacao: 'pago', vencimento: '2026-09-01', valorCentavos: 49900, pagamento: { valorPagoCentavos: 45000 } },
      { situacao: 'cancelado', vencimento: '2026-09-01', valorCentavos: 99999 }
    ], hoje);
    assert.deepEqual(k, {
      total: { valorCentavos: 49900 + 10001 + 45000, qtd: 3 },
      emAberto: { valorCentavos: 49900, qtd: 1 },
      emAtraso: { valorCentavos: 10001, qtd: 1 },
      pago: { valorCentavos: 45000, qtd: 1 }
    });
    assert.equal(k.total.valorCentavos, k.emAberto.valorCentavos + k.emAtraso.valorCentavos + k.pago.valorCentavos);
  });

  test('rótulos, preço legado em centavos e mensagem do pedido', () => {
    assert.equal(C.rotuloTipo({ tipo: 'parcela', parcela: { n: 2, de: 10 } }), 'Parcela 2/10');
    assert.equal(C.rotuloTipo({ tipo: 'matricula' }), 'Matrícula');
    assert.equal(C.rotuloTipo({ tipo: 'taxa' }), 'Taxa');
    assert.equal(C.centavosDoPreco(1990.0), 199000);
    assert.equal(C.centavosDoPreco(0), null);
    assert.equal(C.centavosDoPreco('abc'), null);
    assert.equal(C.centavosDoPreco(undefined), null);
    assert.equal(C.somaOuNulo([100, null]), null);
    assert.equal(C.moedaTexto(199000), 'R$ 1.990,00');
    const msg = C.mensagemDoPedido([{ titulo: 'A', valorCentavos: 199000 }, { titulo: 'B', valorCentavos: null }], null);
    assert.match(msg, /– A — R\$ 1\.990,00/);
    assert.match(msg, /– B — valor a confirmar/);
    assert.match(msg, /Total: a confirmar\./);
    assert.equal(C.chaveDoPedido(['z', 'a', 'z']), 'a,z');
  });
});

// =============================================================
describe('acesso e estado vazio', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('sem sessão → 401; aluno e professor nas rotas da coordenação → 403', async () => {
    assert.equal((await ctx.api.get('/api/portal/me/financeiro')).status, 401);
    assert.equal((await ctx.api.post('/api/portal/me/pedidos', { cursoIds: ['curso-02'] })).status, 401);
    for (const u of ['u-aluno1', 'u-prof', 'u-prof-t1']) {
      assert.equal((await ctx.api.get('/api/portal/admin/financeiro/lancamentos', { usuario: u })).status, 403, u);
      const r = await ctx.api.post('/api/portal/admin/financeiro/lancamentos', { userId: IDS['u-aluno1'], tipo: 'taxa', vencimento: '2026-11-10', valorCentavos: 100 }, { usuario: u });
      assert.equal(r.status, 403, u);
    }
    assert.equal(ctx.banco.documentos('lancamentos').length, 0, 'nada gravado');
  });

  test('estado vazio honesto: listas vazias e KPIs zerados (nenhum dado de exemplo)', async () => {
    const r = await ctx.api.get('/api/portal/me/financeiro', A1);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepEqual(r.corpo.itens, []);
    assert.deepEqual(r.corpo.anos, []);
    for (const k of ['total', 'emAberto', 'emAtraso', 'pago']) assert.deepEqual(r.corpo.kpis[k], { valorCentavos: 0, qtd: 0 });
    const adm = await ctx.api.get('/api/portal/admin/financeiro/lancamentos', ADM);
    assert.equal(adm.status, 200);
    assert.deepEqual(adm.corpo.itens, []);
    assert.equal(adm.corpo.total, 0);
  });

  test('status inválido na query cai em "todos"; lista em query → 400 formato-invalido', async () => {
    const r = await ctx.api.get('/api/portal/me/financeiro?status=qualquer', A1);
    assert.equal(r.corpo.status, 'todos');
    const f = await ctx.api.get('/api/portal/me/financeiro?cursoId=curso-01&cursoId=curso-02', A1);
    assert.equal(f.status, 400);
    assert.equal(f.corpo.codigo, 'formato-invalido');
  });
});

// =============================================================
describe('lançamentos da coordenação', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('criar: matrícula do aluno, curso e nº vindos da matrícula; campo de cartão descartado; auditado e notificado', async () => {
    const l = await lancar(ctx, {
      userId: IDS['u-aluno1'], matriculaId: IDS['mat-aluno1'], tipo: 'matricula', vencimento: '2026-11-03', valorCentavos: 49900,
      formaPrevista: 'pix', descricao: 'Pedido ATD-2026-ABCDE2', cartao: { numero: '4111111111111111', cvv: '123' }, numeroCartao: '4111'
    });
    assert.equal(l.status, 'aberto');
    assert.equal(l.rotuloTipo, 'Matrícula');
    assert.equal(l.cursoId, 'curso-01');
    assert.equal(l.cursoTitulo, 'Curso de Teste APE');
    assert.equal(l.matriculaNumero, 'MAT-2026-AAAAA2');
    assert.equal(l.origem, 'manual');
    assert.equal(l.versao, 1);
    const doc = ctx.banco.documentos('lancamentos')[0];
    assert.ok(!('cartao' in doc) && !('numeroCartao' in doc), 'nenhum campo de cartão existe');
    assert.doesNotMatch(JSON.stringify(doc), /4111/);
    const aud = auditorias(ctx.banco, 'lancamento.criado');
    assert.equal(aud.length, 1);
    assert.equal(aud[0].estado, 'concluido');
    assert.equal(aud[0].alvoUserId, IDS['u-aluno1']);
    const n = ctx.banco.documentos('notificacoes').filter(x => x.tipo === 'lancamento.criado');
    assert.equal(n.length, 1);
    assert.equal(n[0].userId, IDS['u-aluno1']);
    assert.equal(n[0].link, 'financeiro.html');
  });

  test('400: matrícula de outro aluno, de outro curso, aluno inexistente, valor e data inválidos, objeto em texto', async () => {
    const base = { userId: IDS['u-aluno1'], tipo: 'taxa', vencimento: '2026-11-10', valorCentavos: 1000 };
    const outro = await ctx.api.post('/api/portal/admin/financeiro/lancamentos', { ...base, matriculaId: IDS['mat-aluno2'] }, ADM);
    assert.equal(outro.status, 400);
    assert.ok(outro.corpo.campos.matriculaId);
    const curso = await ctx.api.post('/api/portal/admin/financeiro/lancamentos', { ...base, matriculaId: IDS['mat-aluno1'], cursoId: 'curso-02' }, ADM);
    assert.equal(curso.status, 400);
    assert.match(curso.corpo.campos.matriculaId, /outro curso/);
    const semAluno = await ctx.api.post('/api/portal/admin/financeiro/lancamentos', { ...base, userId: new ObjectId().toHexString() }, ADM);
    assert.equal(semAluno.status, 400);
    assert.ok(semAluno.corpo.campos.userId);
    for (const [campo, valor] of [['valorCentavos', 0], ['valorCentavos', 12.5], ['valorCentavos', 100000001], ['vencimento', '2026-02-30'], ['tipo', 'mensalidade']]) {
      const r = await ctx.api.post('/api/portal/admin/financeiro/lancamentos', { ...base, [campo]: valor }, ADM);
      assert.equal(r.status, 400, `${campo}=${valor}`);
      assert.ok(r.corpo.campos[campo], campo);
    }
    const parcela = await ctx.api.post('/api/portal/admin/financeiro/lancamentos', { ...base, tipo: 'parcela' }, ADM);
    assert.equal(parcela.status, 400);
    const injecao = await ctx.api.post('/api/portal/admin/financeiro/lancamentos', { ...base, descricao: { $gt: '' } }, ADM);
    assert.equal(injecao.status, 400);
    assert.equal(injecao.corpo.codigo, 'formato-invalido');
    assert.equal(ctx.banco.documentos('lancamentos').length, 1, 'só o lançamento do teste anterior');
  });

  test('lote: parcelas 1/N..N/N mensais a partir de 31/01; uma notificação; auditoria única', async () => {
    const notifAntes = ctx.banco.documentos('notificacoes').length;
    const r = await ctx.api.post('/api/portal/admin/financeiro/lancamentos/lote', {
      userId: IDS['u-aluno1'], matriculaId: IDS['mat-aluno1'], cursoId: 'curso-01', quantidade: 3, primeiroVencimento: '2027-01-31', valorCentavos: 41500, formaPrevista: 'boleto'
    }, ADM);
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.criados.length, 3);
    const docs = ctx.banco.documentos('lancamentos').filter(d => d.loteId === r.corpo.loteId).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    assert.deepEqual(docs.map(d => d.vencimento), ['2027-01-31', '2027-02-28', '2027-03-31']);
    assert.deepEqual(docs.map(d => C.rotuloTipo(d)), ['Parcela 1/3', 'Parcela 2/3', 'Parcela 3/3']);
    assert.equal(ctx.banco.documentos('notificacoes').length - notifAntes, 1);
    assert.equal(auditorias(ctx.banco, 'lancamento.lote_criado').length, 1);
    const semMat = await ctx.api.post('/api/portal/admin/financeiro/lancamentos/lote', { userId: IDS['u-aluno1'], quantidade: 2, primeiroVencimento: '2027-01-31', valorCentavos: 100 }, ADM);
    assert.equal(semMat.status, 400);
    const muitas = await ctx.api.post('/api/portal/admin/financeiro/lancamentos/lote', { userId: IDS['u-aluno1'], matriculaId: IDS['mat-aluno1'], quantidade: 61, primeiroVencimento: '2027-01-31', valorCentavos: 100 }, ADM);
    assert.equal(muitas.status, 400);
  });

  test('pagar, estornar e cancelar: transições, 409s e auditoria com antes/depois', async () => {
    const l = await lancar(ctx, { userId: IDS['u-aluno1'], tipo: 'taxa', vencimento: '2026-10-25', valorCentavos: 9900 });
    const url = `/api/portal/admin/financeiro/lancamentos/${l.id}`;
    const futuro = await ctx.api.post(`${url}/pagamento`, { em: '2026-10-19', forma: 'pix', versao: 1 }, ADM);
    assert.equal(futuro.status, 400, 'pagamento no futuro');
    const diferente = await ctx.api.post(`${url}/pagamento`, { em: '2026-10-18', forma: 'pix', valorPagoCentavos: 9000, versao: 1 }, ADM);
    assert.equal(diferente.status, 400);
    assert.ok(diferente.corpo.campos.observacao, 'valor diferente pede observação');
    const pago = await ctx.api.post(`${url}/pagamento`, { em: '2026-10-18', forma: 'pix', valorPagoCentavos: 9000, observacao: 'Desconto combinado com a coordenação.', versao: 1 }, ADM);
    assert.equal(pago.status, 200, JSON.stringify(pago.corpo));
    assert.equal(pago.corpo.lancamento.status, 'pago');
    assert.equal(pago.corpo.lancamento.pagoEm, '2026-10-18');
    assert.equal(pago.corpo.lancamento.valorPagoCentavos, 9000);
    assert.equal(pago.corpo.lancamento.versao, 2);
    const audPago = auditorias(ctx.banco, 'lancamento.pago').at(-1);
    assert.deepEqual(audPago.mudancas.find(m => m.campo === 'situacao'), { campo: 'situacao', de: 'pendente', para: 'pago' });
    assert.ok(audPago.mudancas.find(m => m.campo === 'pagamento.valorPagoCentavos' && m.para === 9000));

    const deNovo = await ctx.api.post(`${url}/pagamento`, { em: '2026-10-18', forma: 'pix', versao: 2 }, ADM);
    assert.equal(deNovo.status, 409);
    assert.equal(deNovo.corpo.codigo, 'transicao-invalida');
    const cancelarPago = await ctx.api.post(`${url}/cancelar`, { motivo: 'Lançado em duplicidade.', versao: 2 }, ADM);
    assert.equal(cancelarPago.status, 409, 'pago precisa ser estornado antes');
    const velha = await ctx.api.post(`${url}/estorno`, { motivo: 'Pagamento não compensado.', versao: 1 }, ADM);
    assert.equal(velha.status, 409);
    assert.equal(velha.corpo.codigo, 'conflito-versao');
    const semMotivo = await ctx.api.post(`${url}/estorno`, { versao: 2 }, ADM);
    assert.equal(semMotivo.status, 400);

    const estorno = await ctx.api.post(`${url}/estorno`, { motivo: 'Pagamento não compensado.', versao: 2 }, ADM);
    assert.equal(estorno.status, 200);
    assert.equal(estorno.corpo.lancamento.status, 'aberto');
    assert.equal(estorno.corpo.lancamento.pagamento, null);
    const hist = estorno.corpo.lancamento.historico.find(h => h.acao === 'estornado');
    assert.equal(hist.de.valorPagoCentavos, 9000, 'o pagamento estornado fica no histórico');
    assert.equal(hist.motivo, 'Pagamento não compensado.');
    const audEst = auditorias(ctx.banco, 'lancamento.estornado').at(-1);
    assert.deepEqual(audEst.mudancas.find(m => m.campo === 'situacao'), { campo: 'situacao', de: 'pago', para: 'pendente' });
    assert.equal(audEst.motivo, 'Pagamento não compensado.');

    const curto = await ctx.api.post(`${url}/cancelar`, { motivo: 'curto', versao: 3 }, ADM);
    assert.equal(curto.status, 400, 'motivo do cancelamento 10–500');
    const cancel = await ctx.api.post(`${url}/cancelar`, { motivo: 'Lançado em duplicidade.', versao: 3 }, ADM);
    assert.equal(cancel.status, 200);
    assert.equal(cancel.corpo.lancamento.status, 'cancelado');
    assert.equal(auditorias(ctx.banco, 'lancamento.cancelado').at(-1).mudancas[0].para, 'cancelado');
    const editar = await ctx.api.put(url, { valorCentavos: 100, motivo: 'Ajuste de valor.', versao: 4 }, ADM);
    assert.equal(editar.status, 409);
    assert.equal(editar.corpo.codigo, 'so-pendente-manual');
  });

  test('editar só pendente manual, com motivo e versão; gateway não é editável à mão', async () => {
    const l = await lancar(ctx, { userId: IDS['u-aluno1'], tipo: 'taxa', vencimento: '2026-12-10', valorCentavos: 5000 });
    const url = `/api/portal/admin/financeiro/lancamentos/${l.id}`;
    const ok = await ctx.api.put(url, { vencimento: '2026-12-15', motivo: 'Pedido do aluno.', versao: 1 }, ADM);
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.lancamento.vencimento, '2026-12-15');
    assert.deepEqual(auditorias(ctx.banco, 'lancamento.alterado').at(-1).mudancas, [{ campo: 'vencimento', de: '2026-12-10', para: '2026-12-15' }]);
    const velha = await ctx.api.put(url, { vencimento: '2026-12-16', motivo: 'Pedido do aluno.', versao: 1 }, ADM);
    assert.equal(velha.corpo.codigo, 'conflito-versao');
    const _id = new ObjectId();
    await ctx.banco.collection('lancamentos').insertOne({
      _id, userId: IDS['u-aluno1'], tipo: 'taxa', vencimento: '2026-12-01', valorCentavos: 100, situacao: 'pendente', origem: 'gateway',
      externo: { gateway: 'exemplo', cobrancaId: 'c-1' }, historico: [], versao: 1
    });
    for (const [metodo, sufixo, corpo] of [['put', '', { valorCentavos: 1, motivo: 'Ajuste.', versao: 1 }], ['post', '/pagamento', { em: '2026-10-18', forma: 'pix', versao: 1 }], ['post', '/cancelar', { motivo: 'Cancelamento manual.', versao: 1 }]]) {
      const r = await ctx.api[metodo](`/api/portal/admin/financeiro/lancamentos/${_id.toHexString()}${sufixo}`, corpo, ADM);
      assert.equal(r.status, 409, sufixo);
      assert.equal(r.corpo.codigo, 'so-pendente-manual');
    }
    const det = await ctx.api.get(`/api/portal/admin/financeiro/lancamentos/${_id.toHexString()}`, ADM);
    assert.equal(det.corpo.lancamento.origem, 'gateway');
    assert.equal(det.corpo.lancamento.externo.cobrancaId, 'c-1');
  });

  test('NFS-e e 2ª via: http → 400; link https; PDF ≤ 4 MB; cancelado → 409 lancamento-cancelado', async () => {
    const l = await lancar(ctx, { userId: IDS['u-aluno1'], tipo: 'taxa', vencimento: '2026-11-20', valorCentavos: 2500 });
    const url = `/api/portal/admin/financeiro/lancamentos/${l.id}`;
    const nfseRuim = await ctx.api.put(`${url}/nfse`, { numero: '2026 123' }, ADM);
    assert.equal(nfseRuim.status, 400);
    const nfse = await ctx.api.put(`${url}/nfse`, { numero: '2026/123', emitidaEm: '2026-10-18' }, ADM);
    assert.equal(nfse.corpo.lancamento.nfseNumero, '2026/123');
    const remover = await ctx.api.post(`${url}/nfse/remover`, { motivo: 'Número digitado errado.' }, ADM);
    assert.equal(remover.corpo.lancamento.nfseNumero, null);
    const removerDeNovo = await ctx.api.post(`${url}/nfse/remover`, { motivo: 'Número digitado errado.' }, ADM);
    assert.equal(removerDeNovo.status, 404);
    assert.equal(auditorias(ctx.banco, 'lancamento.nfse_registrada').length, 1);
    assert.equal(auditorias(ctx.banco, 'lancamento.nfse_removida').length, 1);

    const http = await ctx.api.put(`${url}/segunda-via`, { url: 'http://banco.exemplo/boleto' }, ADM);
    assert.equal(http.status, 400);
    assert.ok(http.corpo.campos.url);
    const js = await ctx.api.put(`${url}/segunda-via`, { url: 'javascript:alert(1)' }, ADM);
    assert.equal(js.status, 400);
    const link = await ctx.api.put(`${url}/segunda-via`, { url: 'https://banco.exemplo/boleto/1' }, ADM);
    assert.equal(link.status, 200);
    const vista = (await ctx.api.get('/api/portal/me/financeiro', A1)).corpo.itens.find(i => i.id === l.id);
    assert.deepEqual(vista.segundaVia, { tipo: 'link', disponivel: true });
    assert.ok(!('url' in vista.segundaVia), 'a URL só sai pela rota da 2ª via');
    const sv = await ctx.api.get(`/api/portal/me/financeiro/lancamentos/${l.id}/segunda-via`, A1);
    assert.deepEqual(sv.corpo, { url: 'https://banco.exemplo/boleto/1' });

    const pdf = await ctx.api.post(`${url}/segunda-via/arquivo`, undefined, { ...ADM, corpoCru: pdfMinimo(), tipo: 'application/pdf' });
    assert.equal(pdf.status, 200, JSON.stringify(pdf.corpo));
    const bin = await ctx.api.raw(`/api/portal/me/financeiro/lancamentos/${l.id}/segunda-via`, { headers: { 'x-teste-usuario': 'u-aluno1' } });
    assert.equal(bin.status, 200);
    assert.equal(bin.headers.get('content-type'), 'application/pdf');
    assert.equal(bin.headers.get('cache-control'), 'private, no-store');
    assert.match(bin.headers.get('content-disposition'), /^attachment;/);
    const naoPdf = await ctx.api.post(`${url}/segunda-via/arquivo`, undefined, { ...ADM, corpoCru: Buffer.from('<html>oi</html>'), tipo: 'application/pdf' });
    assert.equal(naoPdf.status, 415);
    assert.equal(ctx.banco.documentos('arquivos').length, 1, 'um binário só');

    const alheio = await ctx.api.get(`/api/portal/me/financeiro/lancamentos/${l.id}/segunda-via`, A2);
    assert.equal(alheio.status, 404, 'acesso cruzado → 404');
    const idRuim = await ctx.api.get('/api/portal/me/financeiro/lancamentos/xyz/segunda-via', A1);
    assert.equal(idRuim.status, 404);

    const atual = await ctx.api.get(`${url}`, ADM);
    await ctx.api.post(`${url}/cancelar`, { motivo: 'Taxa dispensada pela coordenação.', versao: atual.corpo.lancamento.versao }, ADM);
    const cancelada = await ctx.api.get(`/api/portal/me/financeiro/lancamentos/${l.id}/segunda-via`, A1);
    assert.equal(cancelada.status, 409);
    assert.equal(cancelada.corpo.codigo, 'lancamento-cancelado');
    const del = await ctx.api.del(`${url}/segunda-via`, ADM);
    assert.deepEqual(del.corpo, { ok: true });
    assert.equal(ctx.banco.documentos('arquivos').length, 0, 'o binário sai junto');
  });

  test('lista da coordenação: aluno, filtros (q, origem, período), KPIs do filtro e paginação', async () => {
    const r = await ctx.api.get('/api/portal/admin/financeiro/lancamentos?q=Aluna%20Um', ADM);
    assert.equal(r.status, 200);
    assert.ok(r.corpo.itens.length > 0);
    assert.ok(r.corpo.itens.every(i => i.aluno.id === IDS['u-aluno1'] && i.aluno.email === 'aluno1@exemplo.invalid'));
    const ninguem = await ctx.api.get('/api/portal/admin/financeiro/lancamentos?q=Ningu%C3%A9m%20Existe', ADM);
    assert.equal(ninguem.corpo.total, 0);
    const gateway = await ctx.api.get('/api/portal/admin/financeiro/lancamentos?origem=gateway', ADM);
    assert.ok(gateway.corpo.itens.every(i => i.origem === 'gateway'));
    const periodo = await ctx.api.get('/api/portal/admin/financeiro/lancamentos?venceDe=2027-01-01&venceAte=2027-12-31', ADM);
    assert.ok(periodo.corpo.itens.every(i => i.vencimento.startsWith('2027-')));
    const pagina = await ctx.api.get('/api/portal/admin/financeiro/lancamentos?porPagina=2', ADM);
    assert.equal(pagina.corpo.itens.length, 2);
    assert.ok(pagina.corpo.totalPaginas >= 2);
    assert.doesNotMatch(JSON.stringify(r.corpo), SEGREDOS_RE);
  });
});

// =============================================================
describe('visão do aluno: chips, KPIs, IDOR, virada de dia', () => {
  const clock = relogio('2026-10-18T02:00:00.000Z'); // 17/10 em São Paulo
  let ctx;
  let ids;
  before(async () => {
    ctx = await subirPortal({ agora: clock });
    const l = c => lancar(ctx, { userId: IDS['u-aluno1'], ...c });
    ids = {
      vence17: (await l({ tipo: 'taxa', vencimento: '2026-10-17', valorCentavos: 1000 })).id,
      futuro: (await l({ tipo: 'matricula', vencimento: '2026-10-19', valorCentavos: 2000 })).id,
      pago: (await l({ tipo: 'taxa', vencimento: '2026-09-10', valorCentavos: 3000 })).id,
      cancelado: (await l({ tipo: 'taxa', vencimento: '2026-09-01', valorCentavos: 4000 })).id
    };
    await ctx.api.post(`/api/portal/admin/financeiro/lancamentos/${ids.pago}/pagamento`, { em: '2026-09-10', forma: 'boleto', versao: 1 }, ADM);
    await ctx.api.post(`/api/portal/admin/financeiro/lancamentos/${ids.cancelado}/cancelar`, { motivo: 'Lançamento indevido.', versao: 1 }, ADM);
    await lancar(ctx, { userId: IDS['u-aluno2'], tipo: 'taxa', vencimento: '2026-10-01', valorCentavos: 777 });
  });
  after(() => fechar(ctx.server));

  test('02:00Z do dia 18 = dia 17 em SP: vencimento 17/10 ainda "Em aberto"; às 03:00Z vira "Em atraso"', async () => {
    clock.definir('2026-10-18T02:00:00.000Z');
    const antes = await ctx.api.get('/api/portal/me/financeiro', A1);
    assert.equal(antes.corpo.hoje, '2026-10-17');
    assert.equal(antes.corpo.itens.find(i => i.id === ids.vence17).status, 'aberto');
    assert.equal(antes.corpo.itens.find(i => i.id === ids.vence17).venceEmDias, 0);
    assert.equal(antes.corpo.kpis.emAtraso.qtd, 0);
    clock.definir('2026-10-18T03:00:00.000Z');
    const depois = await ctx.api.get('/api/portal/me/financeiro', A1);
    assert.equal(depois.corpo.itens.find(i => i.id === ids.vence17).status, 'atrasado');
    assert.equal(depois.corpo.kpis.emAtraso.valorCentavos, 1000);
    assert.equal(depois.corpo.itens[0].id, ids.vence17, 'atrasados primeiro em "todos"');
    assert.equal(depois.corpo.itens.at(-1).id, ids.cancelado, 'cancelados no fim de "todos"');
  });

  test('KPIs não mudam com o chip; cancelados só em "todos"; somas em centavos conferidas', async () => {
    clock.definir('2026-10-18T12:00:00.000Z');
    const todos = await ctx.api.get('/api/portal/me/financeiro?status=todos', A1);
    assert.deepEqual(todos.corpo.kpis, {
      total: { valorCentavos: 6000, qtd: 3 },
      emAberto: { valorCentavos: 2000, qtd: 1 },
      emAtraso: { valorCentavos: 1000, qtd: 1 },
      pago: { valorCentavos: 3000, qtd: 1 }
    });
    assert.deepEqual(todos.corpo.contagens, { todos: 4, aberto: 1, atrasado: 1, pago: 1, cancelado: 1 });
    for (const s of ['aberto', 'atrasado', 'pago']) {
      const r = await ctx.api.get(`/api/portal/me/financeiro?status=${s}`, A1);
      assert.deepEqual(r.corpo.kpis, todos.corpo.kpis, `chip ${s}`);
      assert.ok(r.corpo.itens.length === 1 && r.corpo.itens.every(i => i.status === s), s);
    }
    const pago = (await ctx.api.get('/api/portal/me/financeiro?status=pago', A1)).corpo.itens[0];
    assert.equal(pago.pagoEm, '2026-09-10');
    assert.equal(pago.formaRotulo, 'Boleto');
    const futuro = todos.corpo.itens.find(i => i.id === ids.futuro);
    assert.equal(futuro.venceEmDias, 1, 'vence em 1 dia');
    assert.ok(!todos.corpo.itens.some(i => 'historico' in i || 'pagamento' in i), 'aluno não vê o histórico interno');
    assert.deepEqual(todos.corpo.anos, [2026]);
    const filtroAno = await ctx.api.get('/api/portal/me/financeiro?ano=2025', A1);
    assert.equal(filtroAno.corpo.kpis.total.qtd, 0);
  });

  test('IDOR: cada aluno vê só os próprios lançamentos', async () => {
    const a2 = await ctx.api.get('/api/portal/me/financeiro', A2);
    assert.equal(a2.corpo.itens.length, 1);
    assert.equal(a2.corpo.itens[0].valorCentavos, 777);
    assert.ok(!a2.corpo.itens.some(i => Object.values(ids).includes(i.id)));
    const sv = await ctx.api.get(`/api/portal/me/financeiro/lancamentos/${ids.futuro}/segunda-via`, A2);
    assert.equal(sv.status, 404);
  });

  test('serviços e grupos: resumoDoAluno, aviso lancamento-atraso, painel e exportador', async () => {
    const resumo = await ctx.servicos.obter('financeiro.resumoDoAluno')(IDS['u-aluno1']);
    assert.equal(resumo.totalEmAbertoCentavos, 2000);
    assert.equal(resumo.totalEmAtrasoCentavos, 1000);
    assert.deepEqual(resumo.itens.map(i => i.status).sort(), ['aberto', 'atrasado']);
    const { avisos, contadores } = await executarAvisos(ctx.servicos, await reqDe(ctx.banco, 'u-aluno1'), { log: silencioso });
    assert.equal(contadores.lancamentosAtrasados, 1);
    const aviso = avisos.find(a => a.id === 'lancamento-atraso');
    assert.equal(aviso.dispensavel, false);
    assert.equal(aviso.href, 'financeiro.html?status=atrasado');
    assert.ok(avisos.find(a => a.id === 'lancamento-vencendo'), 'L13: vence em ≤ 3 dias');
    const painel = await montarPainel(ctx.servicos, await reqDe(ctx.banco, 'u-admin'), { cursoIds: null }, { log: silencioso });
    assert.deepEqual(painel.financeiro.emAtraso, { qtd: 2, valorCentavos: 1777 });
    const exp = ctx.servicos.todos('exportador').find(e => e.dominio === 'financeiro');
    assert.equal((await exp.exportar(IDS['u-aluno1'])).lancamentos.length, 4);
    const sob = ctx.servicos.todos('notificacaoSobDemanda').find(d => d.tipo === 'lancamento.vencendo');
    const emitidas = [];
    await sob.gerar(IDS['u-aluno1'], { agora: clock(), emitir: async (n) => { emitidas.push(n); } });
    assert.equal(emitidas.length, 1);
    assert.equal(emitidas[0].chave, `lancamento:${ids.futuro}:vencendo`);
    const rel = ctx.servicos.todos('relatorio').find(r => r.id === 'financeiro');
    const linhas = await rel.consultar(await reqDe(ctx.banco, 'u-admin'), {});
    assert.equal(linhas.length, 5);
    assert.ok(!linhas.some(l => 'cpf' in l));
    const res = await rel.resumir(await reqDe(ctx.banco, 'u-admin'), {});
    assert.equal(res.kpis.find(k => k.chave === 'lancamentosEmAtraso').valor, 2);
  });
});

// =============================================================
describe('declaração anual de quitação', () => {
  let ctx;
  before(async () => {
    ctx = await subirPortal();
    const base = { userId: IDS['u-aluno2'], matriculaId: IDS['mat-aluno2'] };
    const a = await lancar(ctx, { ...base, tipo: 'matricula', vencimento: '2025-03-10', valorCentavos: 49900 });
    const b = await lancar(ctx, { ...base, tipo: 'parcela', parcela: { n: 1, de: 1 }, vencimento: '2025-04-10', valorCentavos: 49900 });
    ctx.ids = { a: a.id, b: b.id };
    await lancar(ctx, { ...base, tipo: 'taxa', vencimento: '2024-05-10', valorCentavos: 1000 });
  });
  after(() => fechar(ctx.server));
  const emitir = (ano, op = A2) => ctx.api.post(`/api/portal/me/financeiro/declaracoes/${ano}`, {}, op);

  test('ano em curso → 409; sem lançamentos → 404; débito no ano → 409 com qtd', async () => {
    const atual = await emitir(2026);
    assert.equal(atual.status, 409);
    assert.equal(atual.corpo.codigo, 'ano-em-curso');
    const vazio = await emitir(2023);
    assert.equal(vazio.status, 404);
    assert.equal(vazio.corpo.codigo, 'sem-lancamentos-no-ano');
    const debito = await emitir(2025);
    assert.equal(debito.status, 409);
    assert.equal(debito.corpo.codigo, 'ha-debitos-no-ano');
    assert.equal(debito.corpo.qtd, 2);
    const anos = await ctx.servicos.obter('financeiro.anosDeclaraveis')(IDS['u-aluno2']);
    assert.deepEqual(anos.map(a => [a.ano, a.disponivel]), [[2025, false], [2024, false]]);
    assert.equal(anos[0].motivo, 'Há lançamentos em aberto neste ano.');
  });

  test('instituição pendente → 409; cadastro incompleto → 409; sucesso, idempotência e revogação por substituição', async () => {
    for (const id of [ctx.ids.a, ctx.ids.b]) {
      const r = await ctx.api.post(`/api/portal/admin/financeiro/lancamentos/${id}/pagamento`, { em: '2025-04-10', forma: 'pix', versao: 1 }, ADM);
      assert.equal(r.status, 200);
    }
    ctx.estado.instituicao = null;
    const semInst = await emitir(2025);
    assert.equal(semInst.status, 409);
    assert.equal(semInst.corpo.codigo, 'dados-da-instituicao-pendentes');
    const anos = await ctx.servicos.obter('financeiro.anosDeclaraveis')(IDS['u-aluno2']);
    assert.equal(anos[0].disponivel, false);
    ctx.estado.instituicao = { razaoSocial: 'Complexo DMC Educação Ltda.', cnpj: '11222333000181' };

    await lancar(ctx, { userId: IDS['u-aluno1'], tipo: 'taxa', vencimento: '2025-02-01', valorCentavos: 100 });
    const id1 = ctx.banco.documentos('lancamentos').find(d => d.userId === IDS['u-aluno1'] && d.vencimento === '2025-02-01')._id.toHexString();
    await ctx.api.post(`/api/portal/admin/financeiro/lancamentos/${id1}/pagamento`, { em: '2025-02-01', forma: 'pix', versao: 1 }, ADM);
    const incompleto = await emitir(2025, A1);
    assert.equal(incompleto.status, 409);
    assert.equal(incompleto.corpo.codigo, 'cadastro-incompleto');
    assert.deepEqual(incompleto.corpo.faltando, ['nomeRegistro', 'documento']);

    const ok = await emitir(2025);
    assert.equal(ok.status, 201, JSON.stringify(ok.corpo));
    const d = ok.corpo.declaracao;
    assert.equal(d.tipo, 'quitacao_anual');
    assert.match(d.codigo, /^DEC(-[2-9A-HJ-NP-Z]{4}){3}$/);
    assert.equal(d.dados.totalPagoCentavos, 99800);
    assert.equal(d.dados.itens.length, 2);
    assert.equal(d.dados.emissor.razaoSocial, 'Complexo DMC Educação Ltda.');
    assert.equal(d.dados.titular.nomeRegistro, 'Aluno Dois de Teste');
    assert.match(d.urlValidacao, /validar\.html\?codigo=DEC-/);
    assert.ok(d.hash && d.hashPrefixo);

    const igual = await emitir(2025);
    assert.equal(igual.status, 200, 'idempotente');
    assert.equal(igual.corpo.declaracao.codigo, d.codigo);

    const nfse = await ctx.api.put(`/api/portal/admin/financeiro/lancamentos/${ctx.ids.a}/nfse`, { numero: 'NF-2025-1' }, ADM);
    assert.equal(nfse.status, 200);
    const nova = await emitir(2025);
    assert.equal(nova.status, 201, 'conteúdo mudou (nova NFS-e): emite nova');
    assert.notEqual(nova.corpo.declaracao.codigo, d.codigo);
    const antiga = ctx.banco.documentos('declaracoes').find(x => x.codigo === d.codigo);
    assert.equal(antiga.revogada.motivo, 'substituida');
    const lista = await ctx.servicos.obter('financeiro.anosDeclaraveis')(IDS['u-aluno2']);
    assert.deepEqual(lista[0], { ano: 2025, disponivel: true, motivo: null, emitida: { codigo: nova.corpo.declaracao.codigo, emitidaEm: nova.corpo.declaracao.emitidaEm } });
  });

  test('ano fora do padrão → 400', async () => {
    assert.equal((await emitir('abc')).status, 400);
    assert.equal((await emitir(1999)).status, 400);
  });
});

// =============================================================
describe('pedido da loja → atendimento financeiro (DC-69)', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));
  const pedir = (corpo, op = A1) => ctx.api.post('/api/portal/me/pedidos', corpo, op);

  test('itens e total recalculados do catálogo (preço do cliente ignorado); protocolo com a 1ª mensagem do servidor', async () => {
    const r = await pedir({ cursoIds: ['curso-02', 'curso-02'], preco: 1, total: 1, titulo: 'Falso', itens: [{ cursoId: 'curso-02', valorCentavos: 1 }] });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.match(r.corpo.protocolo, ATD_RE);
    assert.deepEqual(r.corpo.pedido, { itens: [{ cursoId: 'curso-02', titulo: 'Curso de Teste Sem Sigla', valorCentavos: 199000 }], totalCentavos: 199000 });
    assert.equal(r.corpo.reaproveitado, false);
    const [args] = ctx.chamadas['atendimento.abrirProtocolo'].at(-1);
    assert.equal(args.categoria, 'financeiro');
    assert.equal(args.origem, 'humano');
    assert.equal(args.assunto, 'Pedido de matrícula');
    assert.equal(args.pedido.chave, 'curso-02');
    assert.match(args.mensagem, /Curso de Teste Sem Sigla — R\$ 1\.990,00/);
    assert.match(args.mensagem, /Total: R\$ 1\.990,00\./);
    const aud = auditorias(ctx.banco, 'pedido.criado');
    assert.equal(aud.length, 1);
    assert.deepEqual(aud[0].extra.cursoIds, ['curso-02']);
    assert.doesNotMatch(JSON.stringify(aud[0]), /@exemplo\.invalid/, 'auditoria sem e-mail');
    assert.equal(ctx.banco.documentos('lancamentos').length, 0, 'nada lançado automaticamente');
  });

  test('mesmo pedido em < 24 h → 200 reaproveitado sem novo protocolo', async () => {
    const antes = ctx.chamadas['atendimento.abrirProtocolo'].length;
    const r = await pedir({ cursoIds: ['curso-02'] });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.reaproveitado, true);
    assert.equal(r.corpo.pedido.totalCentavos, 199000);
    assert.equal(ctx.chamadas['atendimento.abrirProtocolo'].length, antes);
  });

  test('curso sem preço → valorCentavos null e total null (nada inventado)', async () => {
    const r = await pedir({ cursoIds: ['curso-03', 'curso-02'] });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.pedido.totalCentavos, null);
    assert.equal(r.corpo.pedido.itens.find(i => i.cursoId === 'curso-03').valorCentavos, null);
    const [args] = ctx.chamadas['atendimento.abrirProtocolo'].at(-1);
    assert.equal(args.pedido.chave, 'curso-02,curso-03', 'chave ordenada');
    assert.match(args.mensagem, /valor a confirmar/);
  });

  test('400 campos.cursoIds: vazio, inexistente, inativo, fora do regex, objeto; 409 ja-liberado', async () => {
    // limite de 5/h por conta: os casos se dividem entre duas contas sem liberação
    const casos = [[{}, 'u-intruso'], [{ cursoIds: [] }, 'u-intruso'], [{ cursoIds: ['nao-existe'] }, 'u-intruso'], [{ cursoIds: ['curso-04'] }, 'u-intruso'], [{ cursoIds: ['a b'] }, 'u-intruso'], [{ cursoIds: [{ $gt: '' }] }, 'u-ex']];
    for (const [corpo, usuario] of casos) {
      const r = await pedir(corpo, { usuario });
      assert.equal(r.status, 400, JSON.stringify(corpo));
      assert.ok(r.corpo.campos.cursoIds, JSON.stringify(corpo));
    }
    const inativo = await pedir({ cursoIds: ['curso-04', 'curso-02'] }, { usuario: 'u-ex' });
    assert.equal(inativo.status, 400);
    assert.deepEqual(inativo.corpo.cursoIds, ['curso-04'], 'os recusados voltam para a loja tirar do carrinho');
    const lib = await pedir({ cursoIds: ['curso-01', 'curso-02'] }, A2);
    assert.equal(lib.status, 409);
    assert.equal(lib.corpo.codigo, 'ja-liberado');
    assert.deepEqual(lib.corpo.cursoIds, ['curso-01']);
    assert.equal(ctx.banco.documentos('protocolos').filter(p => p.userId !== IDS['u-aluno1']).length, 0, 'nada aberto nos recusados');
  });

  test('matrícula concluída sem liberação não bloqueia; 6º pedido na hora → 429', async () => {
    await ctx.banco.collection('liberacoes').deleteOne({ userId: IDS['u-aluno2'], cursoId: 'curso-01' });
    await ctx.banco.collection('matriculas').updateOne({ _id: oid('mat-aluno2') }, { $set: { status: 'concluida', vigente: false } });
    const ok = await pedir({ cursoIds: ['curso-01'] }, A2); // 2º pedido da conta na hora
    assert.equal(ok.status, 201, 'aceito');
    for (let i = 3; i <= 5; i++) assert.equal((await pedir({ cursoIds: ['curso-01'] }, A2)).status, 200, `pedido ${i} reaproveitado`);
    const r = await pedir({ cursoIds: ['curso-02'] }, A2);
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
  });

  test('sem atendimento.abrirProtocolo (F6a fora) → 503 e nada gravado', async () => {
    const outro = await subirPortal({ semAtendimento: true });
    try {
      const r = await outro.api.post('/api/portal/me/pedidos', { cursoIds: ['curso-02'] }, A1);
      assert.equal(r.status, 503);
      assert.equal(r.corpo.codigo, 'servico-indisponivel');
      assert.equal(outro.banco.documentos('protocolos').length, 0);
      assert.equal(auditorias(outro.banco, 'pedido.criado').length, 0);
    } finally {
      await fechar(outro.server);
    }
  });
});

// =============================================================
describe('quitação pelo serviço real da F3b: validação pública sem CPF', () => {
  let ctx;
  before(async () => {
    ctx = await subirPortal({ comF3b: true });
    const r = await ctx.api.post('/api/portal/admin/financeiro/lancamentos', { userId: IDS['u-aluno2'], tipo: 'taxa', vencimento: '2025-06-10', valorCentavos: 15000 }, ADM);
    assert.equal(r.status, 201);
    const p = await ctx.api.post(`/api/portal/admin/financeiro/lancamentos/${r.corpo.lancamento.id}/pagamento`, { em: '2025-06-10', forma: 'pix', versao: 1 }, ADM);
    assert.equal(p.status, 200);
  });
  after(() => fechar(ctx.server));

  test('emite pela F3b; a validação pública mostra iniciais e situação, nunca CPF nem nome completo', async () => {
    const r = await ctx.api.post('/api/portal/me/financeiro/declaracoes/2025', {}, A2);
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    const codigo = r.corpo.declaracao.codigo;
    const v = await ctx.api.get(`/api/portal/validar/${codigo}`);
    assert.equal(v.status, 200, JSON.stringify(v.corpo));
    assert.equal(v.corpo.valido, true);
    assert.equal(v.corpo.situacao, 'valido');
    const texto = JSON.stringify(v.corpo);
    assert.doesNotMatch(texto, /52998224725|529\.982\.247-25/, 'sem CPF');
    assert.doesNotMatch(texto, /Aluno Dois de Teste/, 'sem nome completo');
    assert.doesNotMatch(texto, /valorPagoCentavos|totalPagoCentavos/, 'sem valores');
    const lista = await ctx.servicos.obter('financeiro.anosDeclaraveis')(IDS['u-aluno2']);
    assert.equal(lista[0].emitida.codigo, codigo);
  });
});
