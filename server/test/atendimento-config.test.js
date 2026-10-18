// Portal · F6a — configurações e regulamento. PORTAL-API §6.10.5, §9.3 (linha
// atendimento-config), DC-70, D-54, D-81. Inclui o P1 `rag.js` (fatiar, recuperar).
// Agregador real com os módulos da F6a, banco em memória; nenhum Mongo, nenhuma rede.
//   NODE_ENV=test node --test server/test/atendimento-config.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso } from './apoio/falsos.js';
import { fatiar, recuperar, TAMANHO_MAX } from '../src/portal/ia/rag.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const M = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos, montarPainel } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const E = await import('../src/portal/erros.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');

const CFG = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });
const MODULOS_F6A = M.MODULOS_PADRAO.filter(m => m.fatia === 'F6a');
const CNPJ_VALIDO = '11.222.333/0001-81';

const PARAGRAFO = 'A coordenação acompanha cada matrícula e registra as decisões na plataforma, com transparência e prazos claros para o aluno. ';
const REGULAMENTO = [
  'Regulamento acadêmico da Plataforma Complexo DMC.',
  '# 1. Matrícula',
  PARAGRAFO.repeat(4),
  PARAGRAFO.repeat(5),
  '# 2. Avaliação e nota mínima',
  'A nota mínima para aprovação no módulo é 7, numa escala de 0 a 10. Vale a melhor tentativa corrigida.',
  '# 3. Frequência',
  'Frequência mínima de 75% das aulas do módulo, somando aulas ao vivo e gravadas assistidas.',
  'Contato: secretaria@exemplo.invalid.'
].join('\n\n');

async function subirPortal({ iaDisponivel = null } = {}) {
  const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
  await semear(banco);
  const servicos = criarServicos();
  if (iaDisponivel !== null) servicos.registrar('ia.disponivel', async () => iaDisponivel);
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: MODULOS_F6A, configPortal: CFG, falharCedo: true, log: silencioso
  });
  await portal.carregar();
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(E.criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  return { api: cliente(base), server, banco, servicos };
}

describe('rag.js — P1 (fatiar, recuperar)', () => {
  test('fatiar: títulos, ids e invariante texto.slice(inicio, fim) === trecho.texto; teto de 1.500', () => {
    const trechos = fatiar(REGULAMENTO, { edicao: 3 });
    assert.ok(trechos.length >= 4);
    for (const t of trechos) {
      assert.match(t.id, /^e3-t\d{3}$/);
      assert.equal(REGULAMENTO.slice(t.inicio, t.fim), t.texto);
      assert.ok(t.fim - t.inicio <= TAMANHO_MAX, t.id);
    }
    assert.ok(trechos.some(t => t.titulo === '1. Matrícula'));
    assert.ok(trechos.some(t => t.titulo === '3. Frequência'));
    const longo = fatiar(`# Único\n\n${'palavra '.repeat(900)}`);
    assert.ok(longo.length >= 4 && longo.every(t => t.fim - t.inicio <= TAMANHO_MAX));
    assert.deepEqual(fatiar(''), []);
    assert.match(fatiar('Texto sem título.')[0].id, /^t001$/);
  });

  test('recuperar acha "Frequência mínima" por "frequencia minima" e preserva campos extras (D-81)', () => {
    const trechos = fatiar(REGULAMENTO, { edicao: 1 }).map(t => ({ ...t, regulamentoId: 'reg-geral' }));
    const r = recuperar('frequencia minima', trechos);
    assert.equal(r[0].titulo, '3. Frequência');
    assert.equal(r[0].regulamentoId, 'reg-geral');
    assert.ok(trechos.includes(r[0]), 'devolve o PRÓPRIO objeto recebido');
    assert.equal(recuperar('nota minima aprovacao', trechos)[0].titulo, '2. Avaliação e nota mínima');
    assert.deepEqual(recuperar('de a o', trechos), []);
    assert.deepEqual(recuperar('xyzw', trechos), []);
    assert.equal(recuperar('matricula', trechos, 1).length, 1);
  });
});

describe('configurações públicas, encarregado, instituição e retenção', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('públicas: nada nasce preenchido; ia.disponivel false sem o serviço da F6b', async () => {
    assert.equal((await ctx.api.get('/api/portal/configuracoes/publicas')).status, 401);
    const r = await ctx.api.get('/api/portal/configuracoes/publicas', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.encarregado, null);
    assert.equal(r.corpo.instituicao, null);
    assert.equal(r.corpo.ia.disponivel, false);
    assert.equal(r.corpo.email.disponivel, false);
    assert.ok(r.corpo.retencao.some(x => x.categoria === 'conversas_ia' && x.prazo === '180 dias' && x.automatica));
    assert.ok(r.corpo.retencao.some(x => x.categoria === 'cadastro' && x.prazo === null && !x.automatica));
  });

  test('encarregado: 403 para não admin; validações; grava auditado; 409 de versão', async () => {
    assert.equal((await ctx.api.put('/api/portal/admin/configuracoes/encarregado', {}, { usuario: 'u-prof' })).status, 403);
    const vazio = await ctx.api.get('/api/portal/admin/configuracoes/encarregado', { usuario: 'u-admin' });
    assert.equal(vazio.corpo.versao, 0);
    const ruim = await ctx.api.put('/api/portal/admin/configuracoes/encarregado', { nome: 'Encarregada de Teste', email: 'nao-e-email', canalUrl: 'http://inseguro.invalid' }, { usuario: 'u-admin' });
    assert.equal(ruim.status, 400);
    assert.ok(ruim.corpo.campos.email);
    const url = await ctx.api.put('/api/portal/admin/configuracoes/encarregado', { nome: 'Encarregada de Teste', email: 'dpo@exemplo.invalid', canalUrl: 'http://inseguro.invalid' }, { usuario: 'u-admin' });
    assert.ok(url.corpo.campos.canalUrl);
    const obj = await ctx.api.put('/api/portal/admin/configuracoes/encarregado', { nome: { $gt: '' }, email: 'dpo@exemplo.invalid' }, { usuario: 'u-admin' });
    assert.equal(obj.corpo.codigo, 'formato-invalido');
    const ok = await ctx.api.put('/api/portal/admin/configuracoes/encarregado', { nome: 'Encarregada de Teste', email: 'dpo@exemplo.invalid', canalUrl: 'https://canal.exemplo.invalid/lgpd', versao: 0 }, { usuario: 'u-admin' });
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.versao, 1);
    const conflito = await ctx.api.put('/api/portal/admin/configuracoes/encarregado', { nome: 'Outra Pessoa', email: 'dpo@exemplo.invalid', versao: 0 }, { usuario: 'u-admin' });
    assert.equal(conflito.status, 409);
    assert.equal(conflito.corpo.codigo, 'conflito-versao');
    const pub = await ctx.api.get('/api/portal/configuracoes/publicas', { usuario: 'u-aluno2' });
    assert.equal(pub.corpo.encarregado.nome, 'Encarregada de Teste');
    assert.ok(await ctx.banco.collection('auditoria').findOne({ acao: 'config.encarregado_alterado', estado: 'concluido' }));
  });

  test('auditoria indisponível → 503 e o encarregado não muda', async () => {
    const antes = await ctx.banco.collection('configuracoes').findOne({ _id: 'encarregado' });
    ctx.banco.falhar.insertOne = (colecao) => colecao === 'auditoria';
    try {
      const r = await ctx.api.put('/api/portal/admin/configuracoes/encarregado', { nome: 'Outra Encarregada', email: 'outra@exemplo.invalid', versao: antes.versao }, { usuario: 'u-admin' });
      assert.equal(r.status, 503);
      assert.equal(r.corpo.codigo, 'auditoria-indisponivel');
    } finally {
      delete ctx.banco.falhar.insertOne;
    }
    const depois = await ctx.banco.collection('configuracoes').findOne({ _id: 'encarregado' });
    assert.equal(depois.nome, antes.nome);
    assert.equal(depois.versao, antes.versao);
  });

  test('instituição (D-54): CNPJ com DV; endereço ≤ 3 linhas e 300; 1º PUT sem motivo; depois motivo obrigatório e auditado; painel', async () => {
    const painel = async () => (await montarPainel(ctx.servicos, { user: { _id: IDS['u-admin'], isAdmin: true, papel: 'admin' } }, { cursoIds: null }, { log: silencioso })).sistema.instituicaoPendente;
    assert.equal(await painel(), true);
    const base = { razaoSocial: 'Instituição de Teste Ltda', nomeFantasia: 'Teste', cnpj: CNPJ_VALIDO, endereco: 'Rua de Teste, 100\nSão Paulo – SP', versao: 0 };
    const cnpj = await ctx.api.put('/api/portal/admin/configuracoes/instituicao', { ...base, cnpj: '11.222.333/0001-82' }, { usuario: 'u-admin' });
    assert.equal(cnpj.status, 400);
    assert.ok(cnpj.corpo.campos.cnpj);
    const linhas = await ctx.api.put('/api/portal/admin/configuracoes/instituicao', { ...base, endereco: 'a\nb\nc\nd' }, { usuario: 'u-admin' });
    assert.ok(linhas.corpo.campos.endereco);
    const longo = await ctx.api.put('/api/portal/admin/configuracoes/instituicao', { ...base, endereco: 'x'.repeat(301) }, { usuario: 'u-admin' });
    assert.ok(longo.corpo.campos.endereco);
    const primeiro = await ctx.api.put('/api/portal/admin/configuracoes/instituicao', base, { usuario: 'u-admin' });
    assert.equal(primeiro.status, 200);
    assert.equal(primeiro.corpo.instituicao.cnpj, '11222333000181');
    assert.equal(await painel(), false);
    const semMotivo = await ctx.api.put('/api/portal/admin/configuracoes/instituicao', { ...base, razaoSocial: 'Nova Razão Social Ltda', versao: 1 }, { usuario: 'u-admin' });
    assert.equal(semMotivo.status, 400);
    assert.ok(semMotivo.corpo.campos.motivo);
    const comMotivo = await ctx.api.put('/api/portal/admin/configuracoes/instituicao', { ...base, razaoSocial: 'Nova Razão Social Ltda', versao: 1, motivo: 'Alteração contratual registrada.' }, { usuario: 'u-admin' });
    assert.equal(comMotivo.status, 200);
    const aud = await ctx.banco.collection('auditoria').find({ acao: 'config.instituicao_alterada' }).toArray();
    assert.equal(aud.length, 2);
    assert.equal(aud[1].motivo, 'Alteração contratual registrada.');
    assert.deepEqual(await ctx.servicos.obter('configuracoes.instituicao')(), { razaoSocial: 'Nova Razão Social Ltda', nomeFantasia: 'Teste', cnpj: '11222333000181', endereco: 'Rua de Teste, 100\nSão Paulo – SP' });
  });

  test('retenção: limites, trilhaIaDias aceito; reaplicar recalcula conversas, notificações e trilha', async () => {
    const fora = await ctx.api.put('/api/portal/admin/configuracoes/retencao', { conversasIaDias: 10, notificacoesDias: 180, trilhaIaDias: 730 }, { usuario: 'u-admin' });
    assert.equal(fora.status, 400);
    assert.ok(fora.corpo.campos.conversasIaDias);
    const trilha = await ctx.api.put('/api/portal/admin/configuracoes/retencao', { conversasIaDias: 90, notificacoesDias: 60, trilhaIaDias: 2000 }, { usuario: 'u-admin' });
    assert.ok(trilha.corpo.campos.trilhaIaDias);
    const ok = await ctx.api.put('/api/portal/admin/configuracoes/retencao', { conversasIaDias: 90, notificacoesDias: 60, trilhaIaDias: 365, prazosDescritivos: { cadastro: 'enquanto durar a matrícula + 5 anos' }, versao: 0 }, { usuario: 'u-admin' });
    assert.equal(ok.status, 200);
    assert.equal(ok.corpo.retencao.trilhaIaDias, 365);
    assert.equal(ok.corpo.retencao.prazosDescritivos.cadastro, 'enquanto durar a matrícula + 5 anos');
    assert.equal((await ctx.servicos.obter('configuracoes.retencao')()).notificacoesDias, 60);
    const t = new Date('2026-10-01T00:00:00Z');
    await ctx.banco.collection('conversas_ia').insertOne({ userId: IDS['u-aluno1'], atualizadaEm: t, expiraEm: new Date(t.getTime() + 180 * 86400000) });
    await ctx.banco.collection('notificacoes').insertOne({ userId: IDS['u-aluno1'], tipo: 'protocolo.respondido', criadaEm: t, expiraEm: new Date(t.getTime() + 180 * 86400000) });
    await ctx.banco.collection('ia_trilha').insertOne({ userId: IDS['u-aluno1'], em: t, expiraEm: new Date(t.getTime() + 730 * 86400000) });
    const r = await ctx.api.post('/api/portal/admin/configuracoes/retencao/reaplicar', {}, { usuario: 'u-admin' });
    assert.deepEqual(r.corpo, { conversas: 1, notificacoes: 1, trilha: 1 });
    const conv = await ctx.banco.collection('conversas_ia').findOne({ userId: IDS['u-aluno1'] });
    assert.equal(conv.expiraEm.toISOString(), new Date(t.getTime() + 90 * 86400000).toISOString());
    const tr = await ctx.banco.collection('ia_trilha').findOne({ userId: IDS['u-aluno1'] });
    assert.equal(tr.expiraEm.toISOString(), new Date(t.getTime() + 365 * 86400000).toISOString());
    const de_novo = await ctx.api.post('/api/portal/admin/configuracoes/retencao/reaplicar', {}, { usuario: 'u-admin' });
    assert.deepEqual(de_novo.corpo, { conversas: 0, notificacoes: 0, trilha: 0 });
  });
});

describe('ia.disponivel vem do serviço da F6b', () => {
  let ctx;
  before(async () => { ctx = await subirPortal({ iaDisponivel: true }); });
  after(() => fechar(ctx.server));
  test('serviço presente → true', async () => {
    const r = await ctx.api.get('/api/portal/configuracoes/publicas', { usuario: 'u-aluno1' });
    assert.equal(r.corpo.ia.disponivel, true);
  });
});

describe('regulamento (DC-70, D-81)', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('prévia não grava; publicar arquiva o anterior e incrementa a edição; rascunho só se edita antes de publicar', async () => {
    const previa = await ctx.api.post('/api/portal/admin/regulamentos/previa', { texto: REGULAMENTO }, { usuario: 'u-admin' });
    assert.equal(previa.status, 200);
    assert.ok(previa.corpo.trechos.length >= 4);
    assert.ok(previa.corpo.trechos.every(t => typeof t.titulo === 'string' && t.tamanho > 0));
    assert.equal(await ctx.banco.collection('regulamentos').countDocuments({}), 0);

    assert.equal((await ctx.api.post('/api/portal/admin/regulamentos', { escopo: 'geral', titulo: 'Regulamento geral', texto: REGULAMENTO }, { usuario: 'u-prof' })).status, 403);
    const r1 = await ctx.api.post('/api/portal/admin/regulamentos', { escopo: 'geral', titulo: 'Regulamento geral', texto: REGULAMENTO }, { usuario: 'u-admin' });
    assert.equal(r1.status, 201);
    assert.equal(r1.corpo.status, 'rascunho');
    const ed = await ctx.api.put(`/api/portal/admin/regulamentos/${r1.corpo.id}`, { titulo: 'Regulamento acadêmico geral', texto: REGULAMENTO, versao: r1.corpo.versao }, { usuario: 'u-admin' });
    assert.equal(ed.status, 200);
    const p1 = await ctx.api.post(`/api/portal/admin/regulamentos/${r1.corpo.id}/publicar`, {}, { usuario: 'u-admin' });
    assert.equal(p1.status, 200);
    assert.equal(p1.corpo.edicao, 1);
    assert.ok(p1.corpo.trechos.every(t => /^e1-t\d{3}$/.test(t.id)));
    const depois = await ctx.api.put(`/api/portal/admin/regulamentos/${r1.corpo.id}`, { titulo: 'Mudança', texto: 'x', versao: ed.corpo.versao + 1 }, { usuario: 'u-admin' });
    assert.equal(depois.status, 409);
    assert.equal(depois.corpo.codigo, 'transicao-invalida');
    assert.ok(await ctx.banco.collection('auditoria').findOne({ acao: 'regulamento.publicado', estado: 'concluido' }));

    const r2 = await ctx.api.post('/api/portal/admin/regulamentos', { escopo: 'geral', titulo: 'Regulamento geral', texto: `${REGULAMENTO}\n\n# 4. Disposições finais\n\nCasos omissos são decididos pela coordenação.` }, { usuario: 'u-admin' });
    const p2 = await ctx.api.post(`/api/portal/admin/regulamentos/${r2.corpo.id}/publicar`, {}, { usuario: 'u-admin' });
    assert.equal(p2.corpo.edicao, 2);
    const antigo = await ctx.banco.collection('regulamentos').findOne({ edicao: 1 });
    assert.equal(antigo.status, 'arquivado');
    const lista = await ctx.api.get('/api/portal/admin/regulamentos', { usuario: 'u-admin' });
    assert.deepEqual(lista.corpo.itens.map(i => i.status).sort(), ['arquivado', 'publicado']);
    semEspacoTexto(lista.corpo.itens);
  });

  test('leitura do aluno: trechos com âncoras, mesmo escopo da IA, curso alheio fora; todo trechoId de recuperar existe', async () => {
    const rc1 = await ctx.api.post('/api/portal/admin/regulamentos', { escopo: 'curso-01', titulo: 'Regras do curso APE', texto: '# 1. Frequência mínima do curso\n\nNo curso APE, a frequência mínima é de 80%.' }, { usuario: 'u-admin' });
    await ctx.api.post(`/api/portal/admin/regulamentos/${rc1.corpo.id}/publicar`, {}, { usuario: 'u-admin' });
    const rc2 = await ctx.api.post('/api/portal/admin/regulamentos', { escopo: 'curso-02', titulo: 'Regras do curso 2', texto: '# 1. Regra exclusiva\n\nTexto só do curso 2.' }, { usuario: 'u-admin' });
    await ctx.api.post(`/api/portal/admin/regulamentos/${rc2.corpo.id}/publicar`, {}, { usuario: 'u-admin' });
    const ruim = await ctx.api.post('/api/portal/admin/regulamentos', { escopo: 'curso-inexistente', titulo: 'Inválido', texto: 'x' }, { usuario: 'u-admin' });
    assert.equal(ruim.status, 400);

    const r = await ctx.api.get('/api/portal/regulamento', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.itens.map(i => i.escopo), ['geral', 'curso-01']);
    assert.equal(r.corpo.itens[1].cursoTitulo, 'Curso de Teste APE');
    const geral = r.corpo.itens[0];
    assert.equal(geral.edicao, 2);
    for (const t of geral.trechos) {
      assert.deepEqual(Object.keys(t).sort(), ['fim', 'id', 'inicio', 'titulo']);
      assert.match(t.id, /^e2-t\d{3}$/);
    }
    // O mesmo `trechoId` (e1-t001) existe no geral (edição 2 → e2) e no do curso (e1): a âncora leva o regulamentoId.
    assert.notEqual(r.corpo.itens[0].id, r.corpo.itens[1].id);
    // Todo trechoId que `recuperar` devolve (com o regulamentoId anexado, como a F6b faz) existe na leitura do aluno.
    const docs = await ctx.banco.collection('regulamentos').find({ status: 'publicado', escopo: { $in: ['geral', 'curso-01'] } }).toArray();
    const todos = docs.flatMap(d => d.trechos.map(t => ({ ...t, regulamentoId: String(d._id) })));
    for (const consulta of ['frequencia minima', 'nota minima', 'matricula', 'casos omissos']) {
      for (const achado of recuperar(consulta, todos)) {
        const item = r.corpo.itens.find(i => i.id === achado.regulamentoId);
        assert.ok(item, consulta);
        const t = item.trechos.find(x => x.id === achado.id);
        assert.ok(t, `${consulta} → ${achado.id}`);
        assert.equal(item.texto.slice(t.inicio, t.fim), achado.texto);
      }
    }
    const intruso = await ctx.api.get('/api/portal/regulamento', { usuario: 'u-intruso' });
    assert.deepEqual(intruso.corpo.itens.map(i => i.escopo), ['geral']);
    const prof = await ctx.api.get('/api/portal/regulamento', { usuario: 'u-prof' });
    assert.deepEqual(prof.corpo.itens.map(i => i.escopo), ['geral', 'curso-01']);
  });
});

function semEspacoTexto(itens) {
  for (const i of itens) assert.equal(i.trechos, undefined, 'lista do admin vem sem trechos');
}
