// Portal · F3b — declarações por curso, histórico, revogação e validação pública (routes/portal-declaracoes.js).
// PORTAL-API §6.7.5–§6.7.6, §8.9, §9.3 (linha academico-declaracoes) · DC-64, DC-65, D-03.
// Montado pelo AGREGADOR real (montarPortal com só este módulo) sobre o banco em memória.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid, MATERIAL_TESTE } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste, criarAppDeTeste } from './apoio/http.js';
import { silencioso } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';

const M = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const { criarAssinador } = await import('../src/portal/cripto.js');
const { criarThrottle } = await import('../src/throttle.js');
const { criarAuditoria } = await import('../src/portal/auditoria.js');
const { INDICES_CERTIFICACAO, camposSeloCertificado, criarServicoDeclaracoes } = await import('../src/portal/certificacao/declaracoes.js');
const { criarRotaDeclaracoes } = await import('../src/routes/portal-declaracoes.js');

const MODULO = { caminho: 'routes/portal-declaracoes.js', fatia: 'F3b', importar: () => import('../src/routes/portal-declaracoes.js') };
const ADM = { usuario: 'u-admin' };
const A1 = { usuario: 'u-aluno1' };

let banco; let server; let api; let servicos;

/** Matrículas da semente lidas do banco (faz o papel da F4a). */
const matriculasFalsas = async (userId) => banco.collection('matriculas').find({ userId: String(userId) }).toArray();

async function subirPortal({ extras = {}, jwtSecret = MATERIAL_TESTE, env = {} } = {}) {
  servicos = criarServicos();
  for (const [nome, impl] of Object.entries(extras)) servicos.registrar(nome, impl);
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret, exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: [MODULO], configPortal: lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: jwtSecret, ...env }), falharCedo: true, log: silencioso
  });
  const app = express();
  app.set('trust proxy', false);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  ({ server } = await subir(app));
  api = cliente(`http://127.0.0.1:${server.address().port}`);
}

const COM_F4A_F3A = {
  'secretaria.matriculasDoAluno': matriculasFalsas,
  'academico.situacaoDoCurso': async () => ({ situacao: 'cursando', frequenciaGeralPct: 82.5, aoVivoPct: 75, gravadoPct: 90, pendencias: [], elegivelCertificado: false, regra: 'aulas' })
};

async function comPerfil(nome = 'u-aluno1', nomeRegistro = 'Ana Beatriz Souza') {
  await banco.collection('perfis').insertOne({ userId: IDS[nome], nomeRegistro, nomeSocial: null });
}

/** Varredura profunda: nenhuma chave proibida e nenhum valor com o nome completo / e-mail. */
function varrer(obj, { nomes = [], email = null } = {}) {
  const proibidas = ['nome', 'nomeAluno', 'nomeTitular', 'email', 'userId', 'matriculaId', 'matriculaNumero', 'nota', 'notaFinal', 'frequenciaPct', 'cpf', 'motivo', 'titulo'];
  const texto = JSON.stringify(obj);
  for (const k of proibidas) assert.ok(!texto.includes(`"${k}"`), `chave proibida no despacho: ${k}`);
  for (const n of nomes) assert.ok(!texto.includes(n), `nome no despacho: ${n}`);
  if (email) assert.ok(!texto.includes(email));
}

describe('declarações e validação pública (F3b)', () => {
  beforeEach(async () => {
    banco = criarBancoMemoria({ indices: [...especificacoesRegistradas(), ...INDICES_CERTIFICACAO] });
    await semear(banco);
  });
  afterEach(async () => { await fechar(server); server = null; });

  test('sem F4a: lista honesta (disponíveis vazias + indisponivel), histórico e quitação vazios; 401 sem sessão', async () => {
    await subirPortal();
    assert.equal((await api.get('/api/portal/me/declaracoes')).status, 401);
    const r = await api.get('/api/portal/me/declaracoes', A1);
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.disponiveis, []);
    assert.deepEqual(r.corpo.quitacao, []);
    assert.deepEqual(r.corpo.historico, []);
    assert.ok(r.corpo.indisponivel.disponiveis);
    const p = await api.post('/api/portal/me/declaracoes', { tipo: 'matricula', matriculaId: IDS['mat-aluno1'] }, A1);
    assert.equal(p.status, 503);
    assert.equal(p.corpo.codigo, 'servico-indisponivel');
  });

  test('elegibilidade por tipo; emissão; idempotência em 24 h; histórico; impressão só do titular', async () => {
    await subirPortal({ extras: COM_F4A_F3A });
    const g = await api.get('/api/portal/me/declaracoes', A1);
    assert.deepEqual(g.corpo.disponiveis.map(d => [d.tipo, d.elegivel]), [['matricula', true], ['frequencia', true], ['conclusao', false]]);
    assert.equal(g.corpo.disponiveis[2].motivo, 'Disponível depois da conclusão do curso, com o certificado emitido.');
    assert.equal(g.corpo.disponiveis[0].matriculaId, IDS['mat-aluno1']);

    const semPerfil = await api.post('/api/portal/me/declaracoes', { tipo: 'matricula', matriculaId: IDS['mat-aluno1'] }, A1);
    assert.equal(semPerfil.status, 409);
    assert.equal(semPerfil.corpo.codigo, 'cadastro-incompleto');
    assert.deepEqual(semPerfil.corpo.faltando, ['nomeRegistro']);

    await comPerfil();
    const r = await api.post('/api/portal/me/declaracoes', { tipo: 'matricula', matriculaId: IDS['mat-aluno1'] }, A1);
    assert.equal(r.status, 201);
    const d = r.corpo.declaracao;
    assert.match(d.codigo, /^DEC(-[2-9A-HJ-NP-Z]{4}){3}$/);
    assert.equal(d.rotulo, 'Declaração de matrícula');
    assert.equal(d.dados.nomeTitular, 'Ana Beatriz Souza');
    assert.equal(d.dados.matriculaNumero, 'MAT-2026-AAAAA2');
    assert.equal(d.dados.turmaCodigo, 'APE-2026-01');
    assert.equal(d.dados.cargaHorariaHoras, 12);
    assert.equal(d.urlValidacao, `/plataforma-ead/validar.html?codigo=${d.codigo}`);
    assert.match(d.hashPrefixo, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);

    const de2 = await api.post('/api/portal/me/declaracoes', { tipo: 'matricula', matriculaId: IDS['mat-aluno1'] }, A1);
    assert.equal(de2.status, 200);
    assert.equal(de2.corpo.declaracao.codigo, d.codigo);

    const f = await api.post('/api/portal/me/declaracoes', { tipo: 'frequencia', matriculaId: IDS['mat-aluno1'] }, A1);
    assert.equal(f.status, 201);
    assert.equal(f.corpo.declaracao.dados.frequenciaPct, 82.5);
    assert.equal(f.corpo.declaracao.dados.ate, '2026-10-18'.slice(0, 4) + f.corpo.declaracao.dados.ate.slice(4));

    const c = await api.post('/api/portal/me/declaracoes', { tipo: 'conclusao', matriculaId: IDS['mat-aluno1'] }, A1);
    assert.equal(c.status, 409);
    assert.equal(c.corpo.codigo, 'nao-elegivel');
    assert.ok(c.corpo.motivo);

    const h = await api.get('/api/portal/me/declaracoes', A1);
    assert.deepEqual(h.corpo.historico.map(x => x.tipo).sort(), ['frequencia', 'matricula']);

    const doc = await api.get(`/api/portal/me/declaracoes/${d.id}`, A1);
    assert.equal(doc.status, 200);
    assert.equal(doc.corpo.codigo, d.codigo);
    assert.equal((await api.get(`/api/portal/me/declaracoes/${d.id}`, { usuario: 'u-aluno2' })).status, 404);
    assert.equal((await api.get('/api/portal/me/declaracoes/nao-e-id', A1)).status, 404);
    assert.ok(await banco.collection('auditoria').findOne({ acao: 'declaracao.emitida' }));
  });

  test('IDOR, formato inválido e tipo fora da lista', async () => {
    await subirPortal({ extras: COM_F4A_F3A });
    await comPerfil();
    assert.equal((await api.post('/api/portal/me/declaracoes', { tipo: 'matricula', matriculaId: IDS['mat-aluno2'] }, A1)).status, 404);
    const fmt = await api.post('/api/portal/me/declaracoes', { tipo: 'matricula', matriculaId: { $gt: '' } }, A1);
    assert.equal(fmt.status, 400);
    assert.equal(fmt.corpo.codigo, 'formato-invalido');
    assert.equal((await api.post('/api/portal/me/declaracoes', { tipo: 'quitacao_anual', matriculaId: IDS['mat-aluno1'] }, A1)).corpo.codigo, 'validacao');
  });

  test('lato sensu: conclusão → 409 certificado-pela-ies; matrícula congela IES e ato de credenciamento', async () => {
    const ies = await banco.collection('ies').insertOne({ nome: 'Instituição Parceira de Teste', cnpj: '11222333000181', atoCredenciamento: 'Portaria de teste nº 1', ativa: true, versao: 1 });
    await banco.collection('cursos').updateOne({ _id: 'curso-01' }, { $set: { nivel: 'pos_graduacao_lato_sensu', iesId: ies.insertedId } });
    await subirPortal({ extras: COM_F4A_F3A });
    await comPerfil();
    const g = await api.get('/api/portal/me/declaracoes', A1);
    assert.deepEqual(g.corpo.disponiveis.map(d => d.tipo), ['matricula', 'frequencia']);
    const c = await api.post('/api/portal/me/declaracoes', { tipo: 'conclusao', matriculaId: IDS['mat-aluno1'] }, A1);
    assert.equal(c.corpo.codigo, 'certificado-pela-ies');
    const m = await api.post('/api/portal/me/declaracoes', { tipo: 'matricula', matriculaId: IDS['mat-aluno1'] }, A1);
    assert.equal(m.status, 201);
    assert.equal(m.corpo.declaracao.dados.iesNome, 'Instituição Parceira de Teste');
    assert.equal(m.corpo.declaracao.dados.iesAtoCredenciamento, 'Portaria de teste nº 1');
    assert.equal(m.corpo.declaracao.dados.nivelRotulo, 'Pós-graduação lato sensu');
  });

  test('limite de 10 pedidos por hora → 429 com Retry-After', async () => {
    await subirPortal({ extras: COM_F4A_F3A });
    await comPerfil();
    for (let i = 0; i < 10; i++) {
      const r = await api.post('/api/portal/me/declaracoes', { tipo: 'matricula', matriculaId: IDS['mat-aluno1'] }, A1);
      assert.ok([200, 201].includes(r.status), `pedido ${i + 1}: ${r.status}`);
    }
    const r = await api.post('/api/portal/me/declaracoes', { tipo: 'matricula', matriculaId: IDS['mat-aluno1'] }, A1);
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
  });

  test('validação DEC: válida e íntegra, sem dado pessoal; adulterada → integro:false; revogada; conferir nome', async () => {
    await subirPortal({ extras: COM_F4A_F3A });
    await comPerfil('u-aluno1', 'Ána Béatriz Souza');
    const r = await api.post('/api/portal/me/declaracoes', { tipo: 'matricula', matriculaId: IDS['mat-aluno1'] }, A1);
    const codigo = r.corpo.declaracao.codigo;
    const v = await api.get(`/api/portal/validar/${codigo.toLowerCase().replace(/-/g, ' - ')}`);
    assert.equal(v.status, 200);
    assert.deepEqual(Object.keys(v.corpo).sort(), ['codigo', 'detalhes', 'emissor', 'emitidoEm', 'hashPrefixo', 'iniciais', 'integro', 'rotulo', 'situacao', 'tipo', 'valido']);
    assert.equal(v.corpo.tipo, 'declaracao');
    assert.equal(v.corpo.iniciais, 'Á. S.');
    assert.equal(v.corpo.integro, true);
    assert.equal(v.corpo.situacao, 'valido');
    assert.equal(v.corpo.detalhes.curso, 'Curso de Teste APE');
    varrer(v.corpo, { nomes: ['Ána Béatriz Souza', 'MAT-2026'], email: 'aluno1@exemplo.invalid' });

    const ok = await api.post(`/api/portal/validar/${codigo}/conferir`, { nome: '  ana beatriz   SOUZA ' });
    assert.deepEqual(ok.corpo, { confere: true });
    const nao = await api.post(`/api/portal/validar/${codigo}/conferir`, { nome: 'Outra Pessoa' });
    assert.deepEqual(nao.corpo, { confere: false });

    await banco.collection('declaracoes').updateOne({ codigo }, { $set: { 'dados.nomeTitular': 'Nome Trocado' } });
    assert.equal((await api.get(`/api/portal/validar/${codigo}`)).corpo.integro, false);
    // kid desconhecido e não declarado como aposentado = kid forjado → false (A08; antes era null, sem alerta)
    await banco.collection('declaracoes').updateOne({ codigo }, { $set: { 'dados.nomeTitular': 'Ána Béatriz Souza', kid: 'ffffffff' } });
    assert.equal((await api.get(`/api/portal/validar/${codigo}`)).corpo.integro, false);

    // revogação (admin, com motivo, auditada)
    const id = r.corpo.declaracao.id;
    assert.equal((await api.post(`/api/portal/admin/declaracoes/${id}/revogar`, { motivo: 'Emitida por engano.' }, A1)).status, 403);
    assert.equal((await api.post(`/api/portal/admin/declaracoes/${id}/revogar`, { motivo: 'curto' }, ADM)).status, 400);
    const rv = await api.post(`/api/portal/admin/declaracoes/${id}/revogar`, { motivo: 'Emitida com dado incorreto.' }, ADM);
    assert.equal(rv.status, 200);
    assert.equal(rv.corpo.declaracao.revogada, true);
    const depois = await api.get(`/api/portal/validar/${codigo}`);
    assert.equal(depois.corpo.situacao, 'revogado');
    varrer(depois.corpo);
    assert.ok(await banco.collection('auditoria').findOne({ acao: 'declaracao.revogada', estado: 'concluido' }));
  });

  test('validação DMC pelo despacho: sem nomeAluno; selo novo íntegro; adulterado → false; legado sem selo → integro e hashPrefixo null', async () => {
    await subirPortal();
    const assinador = servicos.obter('assinador');
    const novo = { codigo: 'DMC-K7Q2-MX9P', userId: IDS['u-aluno1'], cursoId: 'curso-01', nomeAluno: 'Joana da Silva', nomeOrigem: 'registro', tituloCurso: 'Curso de Teste APE', cargaHoraria: '12h', totalAulas: 5, emitidoEm: new Date('2026-10-01T12:00:00Z'), matriculaId: oid('mat-aluno1'), notaFinal: 8, regra: 'aprovacao' };
    Object.assign(novo, assinador.assinar('certificado', camposSeloCertificado(novo)));
    await banco.collection('certificados').insertOne(novo);
    await banco.collection('certificados').insertOne({ codigo: 'DMC-ABCD-EFGH', userId: IDS['u-aluno2'], cursoId: 'curso-01', nomeAluno: 'Pedro Antigo', tituloCurso: 'Curso de Teste APE', cargaHoraria: '12h', totalAulas: 5, emitidoEm: new Date('2026-01-01T12:00:00Z') });

    const v = await api.get('/api/portal/validar/DMC-K7Q2-MX9P');
    assert.equal(v.status, 200);
    assert.equal(v.corpo.tipo, 'certificado');
    assert.equal(v.corpo.iniciais, 'J. S.');
    assert.equal(v.corpo.integro, true);
    assert.match(v.corpo.hashPrefixo, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    assert.deepEqual(v.corpo.detalhes, { tituloCurso: 'Curso de Teste APE', cargaHoraria: '12h' });
    varrer(v.corpo, { nomes: ['Joana da Silva'] });

    const legado = await api.get('/api/portal/validar/DMC-ABCD-EFGH');
    assert.equal(legado.corpo.integro, null);
    assert.equal(legado.corpo.hashPrefixo, null);
    varrer(legado.corpo, { nomes: ['Pedro Antigo'] });

    await banco.collection('certificados').updateOne({ codigo: 'DMC-K7Q2-MX9P' }, { $set: { nomeAluno: 'Joana Adulterada' } });
    assert.equal((await api.get('/api/portal/validar/DMC-K7Q2-MX9P')).corpo.integro, false);
    assert.deepEqual((await api.post('/api/portal/validar/DMC-ABCD-EFGH/conferir', { nome: 'pedro antigo' })).corpo, { confere: true });
  });

  test('código fora do regex → 404 sem consulta; inexistente → 404; outros prefixos pelo grupo validador, com detalhes limpos', async () => {
    await subirPortal({});
    const antes = banco.contagem('findOne');
    for (const c of ['XYZ-1234', 'DEC-0000-0000-0000', 'DMC-AAAA', '%7B%22%24gt%22%3A%22%22%7D']) {
      const r = await api.get(`/api/portal/validar/${c}`);
      assert.equal(r.status, 404, c);
      assert.equal(r.corpo.valido, false);
    }
    assert.equal(banco.contagem('findOne'), antes);
    assert.equal((await api.get('/api/portal/validar/DEC-AAAA-BBBB-CCCC')).status, 404);

    // validadores de outras fatias (FRQ, AVL, CTR) que devolvessem dado pessoal em detalhes: o despacho limpa
    for (const prefixo of ['FRQ', 'AVL', 'CTR']) {
      servicos.adicionar('validador', {
        prefixo,
        validar: async (codigo) => ({ valido: true, codigo, tipo: 'contrato', rotulo: 'X', emitidoEm: null, iniciais: 'J. S.', integro: true, situacao: 'valido', hashPrefixo: null, nomeAluno: 'Vazou', detalhes: { titulo: 'Contrato de Joana', curso: 'C', email: 'x@exemplo.invalid', nested: { cpf: '12345678909' } } }),
        nomeTitular: async () => 'Joana Teste'
      });
    }
    for (const prefixo of ['FRQ', 'AVL', 'CTR']) {
      const r = await api.get(`/api/portal/validar/${prefixo}-AAAA-BBBB-CCCC`);
      assert.equal(r.status, 200);
      varrer(r.corpo, { nomes: ['Joana', 'Vazou'] });
      assert.deepEqual(r.corpo.detalhes, { curso: 'C', nested: {} });
    }
  });

  test('admin: lista com filtros e paginação; q < 3 → 400; aluno e professor → 403; detalhe', async () => {
    await subirPortal({ extras: COM_F4A_F3A });
    await comPerfil();
    await comPerfil('u-aluno2', 'Bruno Teste');
    const a = await api.post('/api/portal/me/declaracoes', { tipo: 'matricula', matriculaId: IDS['mat-aluno1'] }, A1);
    await api.post('/api/portal/me/declaracoes', { tipo: 'frequencia', matriculaId: IDS['mat-aluno1'] }, A1);
    await api.post('/api/portal/me/declaracoes', { tipo: 'matricula', matriculaId: IDS['mat-aluno2'] }, { usuario: 'u-aluno2' });
    assert.equal((await api.get('/api/portal/admin/declaracoes', A1)).status, 403);
    assert.equal((await api.get('/api/portal/admin/declaracoes', { usuario: 'u-prof' })).status, 403);
    const todas = await api.get('/api/portal/admin/declaracoes', ADM);
    assert.equal(todas.corpo.total, 3);
    assert.equal(todas.corpo.itens[0].aluno.email.endsWith('@exemplo.invalid'), true);
    assert.equal((await api.get('/api/portal/admin/declaracoes?tipo=frequencia', ADM)).corpo.total, 1);
    assert.equal((await api.get(`/api/portal/admin/declaracoes?userId=${IDS['u-aluno2']}`, ADM)).corpo.total, 1);
    assert.equal((await api.get('/api/portal/admin/declaracoes?q=Dois', ADM)).corpo.total, 1);
    assert.equal((await api.get(`/api/portal/admin/declaracoes?q=${a.corpo.declaracao.codigo.slice(0, 8)}`, ADM)).corpo.total, 1);
    assert.equal((await api.get('/api/portal/admin/declaracoes?q=ab', ADM)).status, 400);
    const pag = await api.get('/api/portal/admin/declaracoes?porPagina=2&pagina=2', ADM);
    assert.deepEqual([pag.corpo.itens.length, pag.corpo.totalPaginas], [1, 2]);
    const det = await api.get(`/api/portal/admin/declaracoes/${a.corpo.declaracao.id}`, ADM);
    assert.equal(det.corpo.userId, IDS['u-aluno1']);
  });

  test('serviço declaracoes.emitir, exportadores e membro de cascata registrados', async () => {
    await subirPortal({ extras: COM_F4A_F3A });
    await comPerfil();
    await api.get('/api/portal/saude');
    await api.post('/api/portal/me/declaracoes', { tipo: 'matricula', matriculaId: IDS['mat-aluno1'] }, A1);
    assert.equal(typeof servicos.obter('declaracoes.emitir'), 'function');
    const exps = servicos.todos('exportador').map(e => e.dominio);
    assert.deepEqual(exps.sort(), ['certificados', 'declaracoes']);
    const cas = servicos.todos('cascata').find(c => c.dominio === 'certificacao');
    assert.equal(await cas.bloqueios({ tipo: 'curso', id: 'curso-01' }), 1);
    assert.equal(await cas.bloqueios({ tipo: 'aula', id: 'c01-m01-a01' }), 0);
    const exp = await servicos.todos('exportador').find(e => e.dominio === 'declaracoes').exportar(IDS['u-aluno1']);
    assert.equal(exp.length, 1);
    // quitação (F5): substituir quando o conteúdo muda revoga a anterior
    const emitir = servicos.obter('declaracoes.emitir');
    const q1 = await emitir({ tipo: 'quitacao_anual', userId: IDS['u-aluno1'], ano: 2025, dados: { ano: 2025, titular: { nomeRegistro: 'Ana Beatriz Souza' }, totalPagoCentavos: 100 }, substituirSeMudou: true });
    const q2 = await emitir({ tipo: 'quitacao_anual', userId: IDS['u-aluno1'], ano: 2025, dados: { ano: 2025, titular: { nomeRegistro: 'Ana Beatriz Souza' }, totalPagoCentavos: 200 }, substituirSeMudou: true });
    assert.equal(q1.criada && q2.criada, true);
    assert.equal((await banco.collection('declaracoes').findOne({ codigo: q1.declaracao.codigo })).revogada.motivo, 'substituida');
    const q3 = await emitir({ tipo: 'quitacao_anual', userId: IDS['u-aluno1'], ano: 2025, dados: { ano: 2025, titular: { nomeRegistro: 'Ana Beatriz Souza' }, totalPagoCentavos: 200 }, substituirSeMudou: true });
    assert.equal(q3.criada, false);
  });

  test('selo verificável com o material anterior depois da rotação (PORTAL_MATERIAL_ANTERIOR)', async () => {
    const antigo = criarAssinador({ material: MATERIAL_TESTE });
    const emissor = criarServicoDeclaracoes({ repo: n => banco.collection(n), assinador: antigo });
    const { declaracao } = await emissor.emitir({ tipo: 'matricula', userId: IDS['u-aluno1'], matriculaId: oid('mat-aluno1'), cursoId: 'curso-01', dados: { nomeTitular: 'Ana Souza', cursoTitulo: 'Curso de Teste APE' } });
    await subirPortal({ jwtSecret: 'segredo-novo-depois-da-rotacao', env: { PORTAL_MATERIAL_ANTERIOR: MATERIAL_TESTE } });
    const v = await api.get(`/api/portal/validar/${declaracao.codigo}`);
    assert.equal(v.corpo.integro, true);
  });

  // ---------- selo sem atalho para null (A08, achado de G2) ----------
  test('selo DEC (A08): kid trocado → false; hash e kid apagados → false; selo pela metade → false; o curso adulterado nunca sai como íntegro', async () => {
    await subirPortal({ extras: COM_F4A_F3A });
    await comPerfil();
    const r = await api.post('/api/portal/me/declaracoes', { tipo: 'matricula', matriculaId: IDS['mat-aluno1'] }, A1);
    const codigo = r.corpo.declaracao.codigo;
    const col = banco.collection('declaracoes');
    const original = await col.findOne({ codigo });
    const ver = async () => (await api.get(`/api/portal/validar/${codigo}`)).corpo;
    assert.equal((await ver()).integro, true);

    await col.updateOne({ codigo }, { $set: { 'dados.cursoTitulo': 'Curso FALSO', kid: 'deadbeef' } });
    const kidTrocado = await ver();
    assert.equal(kidTrocado.detalhes.curso, 'Curso FALSO');
    assert.equal(kidTrocado.integro, false, 'kid desconhecido não declarado como aposentado é kid forjado');

    await col.updateOne({ codigo }, { $unset: { hash: '', kid: '' } });
    const semSelo = await ver();
    assert.equal(semSelo.integro, false, 'declaração sempre nasce selada: sem hash e sem kid não confere');
    assert.equal(semSelo.hashPrefixo, null);

    await col.updateOne({ codigo }, { $set: { 'dados.cursoTitulo': original.dados.cursoTitulo, hash: original.hash, kid: original.kid } });
    assert.equal((await ver()).integro, true, 'restaurado → volta a conferir');
    await col.updateOne({ codigo }, { $unset: { kid: '' } });
    assert.equal((await ver()).integro, false, 'só o kid apagado');
    await col.updateOne({ codigo }, { $set: { kid: original.kid }, $unset: { hash: '' } });
    assert.equal((await ver()).integro, false, 'só o hash apagado');
    await col.updateOne({ codigo }, { $set: { hash: 12345 } });
    assert.equal((await ver()).integro, false, 'hash de outro tipo');
  });

  test('selo DMC (A08): kid trocado → false; selo pela metade → false; certificado legado (sem hash e sem kid) segue null', async () => {
    await subirPortal();
    const assinador = servicos.obter('assinador');
    const novo = { codigo: 'DMC-K7Q2-MX9P', userId: IDS['u-aluno1'], cursoId: 'curso-01', nomeAluno: 'Joana da Silva', nomeOrigem: 'registro', tituloCurso: 'Curso de Teste APE', cargaHoraria: '12h', totalAulas: 5, emitidoEm: new Date('2026-10-01T12:00:00Z'), matriculaId: oid('mat-aluno1'), notaFinal: 8, regra: 'aprovacao' };
    Object.assign(novo, assinador.assinar('certificado', camposSeloCertificado(novo)));
    await banco.collection('certificados').insertOne(novo);
    const col = banco.collection('certificados');
    const ver = async () => (await api.get('/api/portal/validar/DMC-K7Q2-MX9P')).corpo;
    assert.equal((await ver()).integro, true);

    await col.updateOne({ codigo: novo.codigo }, { $set: { tituloCurso: 'Curso FALSO', kid: 'deadbeef' } });
    assert.equal((await ver()).integro, false, 'kid forjado');
    await col.updateOne({ codigo: novo.codigo }, { $unset: { kid: '' } });
    assert.equal((await ver()).integro, false, 'hash sem kid');
    await col.updateOne({ codigo: novo.codigo }, { $set: { kid: novo.kid }, $unset: { hash: '' } });
    assert.equal((await ver()).integro, false, 'kid sem hash');

    // sem hash E sem kid = forma do certificado legado (DC-65): continua null, e a tela avisa (validar.js)
    await col.updateOne({ codigo: novo.codigo }, { $unset: { hash: '', kid: '' } });
    const legado = await ver();
    assert.equal(legado.integro, null);
    assert.equal(legado.hashPrefixo, null);
  });

  test('selo: kid aposentado declarado em PORTAL_SELO_KIDS_APOSENTADOS → null (selo antigo); sem a declaração → false', async () => {
    const antigo = criarAssinador({ material: MATERIAL_TESTE });
    const emissor = criarServicoDeclaracoes({ repo: n => banco.collection(n), assinador: antigo });
    const { declaracao } = await emissor.emitir({ tipo: 'matricula', userId: IDS['u-aluno1'], matriculaId: oid('mat-aluno1'), cursoId: 'curso-01', dados: { nomeTitular: 'Ana Souza', cursoTitulo: 'Curso de Teste APE' } });
    // rotação concluída: material novo, sem PORTAL_MATERIAL_ANTERIOR
    await subirPortal({ jwtSecret: 'segredo-novo-depois-da-rotacao' });
    assert.equal((await api.get(`/api/portal/validar/${declaracao.codigo}`)).corpo.integro, false, 'kid antigo não declarado');
    await fechar(server); server = null;

    const anterior = process.env.PORTAL_SELO_KIDS_APOSENTADOS;
    process.env.PORTAL_SELO_KIDS_APOSENTADOS = ` 0000000z, ${antigo.kid.toUpperCase()} ;  `;
    try {
      await subirPortal({ jwtSecret: 'segredo-novo-depois-da-rotacao' });
      const v = await api.get(`/api/portal/validar/${declaracao.codigo}`);
      assert.equal(v.corpo.integro, null, 'kid aposentado: selo antigo, não verificável, sem acusar adulteração');
      assert.match(v.corpo.hashPrefixo, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    } finally {
      if (anterior === undefined) delete process.env.PORTAL_SELO_KIDS_APOSENTADOS; else process.env.PORTAL_SELO_KIDS_APOSENTADOS = anterior;
    }
  });

  test('despacho (A08): DEC, FRQ e CTR sem selo → integro:false mesmo que o validador devolva null; AVL sem selo segue null; valores fora de true/false/null → null', async () => {
    await subirPortal({});
    const respostas = {
      FRQ: { tipo: 'frequencia', integro: null, hashPrefixo: null },
      CTR: { tipo: 'contrato', integro: undefined, hashPrefixo: 'zzzz' },
      AVL: { tipo: 'avaliacao', integro: null, hashPrefixo: null }
    };
    for (const prefixo of Object.keys(respostas)) {
      servicos.adicionar('validador', {
        prefixo,
        validar: async (codigo) => ({ valido: true, codigo, rotulo: 'X', emitidoEm: null, iniciais: 'J. S.', situacao: 'valido', detalhes: {}, ...respostas[prefixo] }),
        nomeTitular: async () => 'Joana Teste'
      });
    }
    const ver = async p => (await api.get(`/api/portal/validar/${p}-AAAA-BBBB-CCCC`)).corpo;
    const frq = await ver('FRQ');
    assert.deepEqual([frq.integro, frq.hashPrefixo], [false, null], 'FRQ sempre nasce selado');
    const ctr = await ver('CTR');
    assert.deepEqual([ctr.integro, ctr.hashPrefixo], [false, null], 'CTR: hashPrefixo fora do formato não sai e conta como sem selo');
    const avl = await ver('AVL');
    assert.deepEqual([avl.integro, avl.hashPrefixo], [null, null], 'AVL pode nascer sem selo (falha do assinador): null, a tela avisa');

    // com selo, o despacho não rebaixa nem promove: só normaliza
    respostas.FRQ = { tipo: 'frequencia', integro: 'sim', hashPrefixo: '9C1E-07AB-12CD-34EF' };
    respostas.AVL = { tipo: 'avaliacao', integro: true, hashPrefixo: '9C1E-07AB-12CD-34EF' };
    assert.deepEqual([(await ver('FRQ')).integro, (await ver('FRQ')).hashPrefixo], [null, '9C1E-07AB-12CD-34EF']);
    assert.equal((await ver('AVL')).integro, true);
  });
});

describe('selo: funções puras (A08)', () => {
  test('conferirSelo: sem assinador → null; legado só com exigeSelo:false; mutilado, kid fora do formato ou forjado → false; aposentado → null', async () => {
    const { conferirSelo, lerKidsAposentados } = await import('../src/routes/portal-declaracoes.js');
    const a = criarAssinador({ material: MATERIAL_TESTE });
    const campos = { codigo: 'DEC-AAAA-BBBB-CCCC', dados: { cursoTitulo: 'Curso A' } };
    const { hash, kid } = a.assinar('declaracao', campos);
    const c = (extra) => conferirSelo({ assinador: a, tipo: 'declaracao', campos, hash, kid, ...extra });
    assert.equal(c({}), true);
    assert.equal(c({ campos: { ...campos, dados: { cursoTitulo: 'Curso FALSO' } } }), false);
    assert.equal(c({ assinador: null }), null);
    assert.equal(c({ hash: null, kid: null }), false);
    assert.equal(c({ hash: undefined, kid: '', exigeSelo: false }), null);
    assert.equal(c({ kid: null }), false);
    assert.equal(c({ hash: '' }), false);
    assert.equal(c({ kid: 'DEADBEEF' }), false, 'kid fora do formato (maiúsculas)');
    assert.equal(c({ kid: { $ne: null } }), false, 'kid de outro tipo');
    assert.equal(c({ kid: 'deadbeef' }), false, 'kid forjado');
    assert.equal(c({ kid: 'deadbeef', kidsAposentados: new Set(['deadbeef']) }), null, 'kid aposentado');
    assert.deepEqual([...lerKidsAposentados({ PORTAL_SELO_KIDS_APOSENTADOS: 'ABCD1234, deadbeef;x  0123456' }).kids], ['abcd1234', 'deadbeef']);
    assert.equal(lerKidsAposentados({ PORTAL_SELO_KIDS_APOSENTADOS: 'ABCD1234, deadbeef;x  0123456' }).ignorados, 2);
    assert.equal(lerKidsAposentados({}).kids.size, 0);
  });
});

describe('limites públicos da validação (fábrica)', () => {
  test('conferir: 11ª tentativa em 15 min → 429 com Retry-After', async () => {
    banco = criarBancoMemoria({ indices: INDICES_CERTIFICACAO });
    await semear(banco);
    const repo = n => banco.collection(n);
    const servicosLocais = criarServicos();
    const rotas = criarRotaDeclaracoes({
      repo, servicos: servicosLocais, auditoria: criarAuditoria({ repo, log: silencioso }),
      emissor: criarServicoDeclaracoes({ repo, assinador: criarAssinador({ material: MATERIAL_TESTE }) }), criarThrottle
    });
    const app = criarAppDeTeste({ banco, montar: a => a.use('/api/portal', rotas.publico) });
    const { server: s, base } = await subir(app);
    const c = cliente(base);
    try {
      let ultimo;
      for (let i = 0; i < 11; i++) ultimo = await c.post('/api/portal/validar/DEC-AAAA-BBBB-CCCC/conferir', { nome: 'Alguém' });
      assert.equal(ultimo.status, 429);
      assert.ok(Number(ultimo.headers.get('retry-after')) > 0);
      assert.equal(ultimo.corpo.error, 'Muitas consultas seguidas. Tente em alguns minutos.');
    } finally {
      await fechar(s);
    }
  });
});
