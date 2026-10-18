// Portal · F3b — rota LEGADA de certificados (routes/certificados.js) com a regra nova.
// PORTAL-API §6.7.7, §8.11, §9.3 (linha academico-legado) · R9/R9b (D5).
// Banco em memória + serviços falsos; nenhum Mongo real. Rode com `npm test` na raiz.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid, MATERIAL_TESTE } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, criarAppDeTeste } from './apoio/http.js';
import { silencioso, servicosFalsos } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';

const { criarRotaCertificados } = await import('../src/routes/certificados.js');
const { INDICES_CERTIFICACAO, camposSeloCertificado } = await import('../src/portal/certificacao/declaracoes.js');
const { criarAssinador } = await import('../src/portal/cripto.js');
const { criarPerfisLeitura } = await import('../src/portal/perfis-leitura.js');
const { criarAuditoria } = await import('../src/portal/auditoria.js');

const AULAS_DISPONIVEIS = ['c01-m01-a01', 'c01-m01-a02', 'c01-m01-a03', 'c01-m02-a01', 'c01-m02-a02'];
const exigirLogin = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Sessão expirada. Entre de novo.' }));

let banco; let server; let api; let srv; let assinador; let log;

/** Sobe a rota com os serviços pedidos (o núcleo — perfis, assinador, auditoria — sempre existe desde o G0). */
async function subirCom(extras = {}, { semNucleo = false } = {}) {
  const repo = nome => banco.collection(nome);
  assinador = criarAssinador({ material: MATERIAL_TESTE });
  const perfis = criarPerfisLeitura({ repo });
  const nucleo = semNucleo ? {} : {
    assinador, auditoria: criarAuditoria({ repo, log: silencioso }),
    'perfis.publicos': perfis.publicos, 'perfis.identificacao': perfis.identificacao
  };
  srv = servicosFalsos({ ...nucleo, ...extras });
  log = { avisos: [], warn(t) { this.avisos.push(String(t)); }, error() {}, log() {}, info() {} };
  const app = criarAppDeTeste({ banco, montar: (a) => a.use('/api', criarRotaCertificados({ repo, servicos: srv, exigirLogin, log })) });
  ({ server } = await subir(app));
  const { port } = server.address();
  api = cliente(`http://127.0.0.1:${port}`);
}

async function concluirTudo(aluno = 'u-aluno1', aulas = AULAS_DISPONIVEIS) {
  await banco.collection('progresso').insertMany(aulas.map(aulaId => ({ userId: IDS[aluno], aulaId, completedAt: new Date() })));
}

const matriculaFalsa = (status = 'ativa') => ({ _id: oid('mat-aluno1'), numero: 'MAT-2026-AAAAA2', userId: IDS['u-aluno1'], cursoId: 'curso-01', status, turmaCodigo: 'APE-2026-01', nomeEmDocumentos: null });

describe('certificados legado (F3b)', () => {
  beforeEach(async () => {
    banco = criarBancoMemoria({ indices: INDICES_CERTIFICACAO });
    await semear(banco);
  });
  afterEach(async () => { await fechar(server); server = null; });

  test('401 sem sessão nas rotas do titular; validação legada é pública', async () => {
    await subirCom();
    assert.equal((await api.get('/api/certificados')).status, 401);
    assert.equal((await api.get('/api/cursos/curso-01/certificado')).status, 401);
    assert.equal((await api.post('/api/cursos/curso-01/certificado', {})).status, 401);
    assert.equal((await api.get('/api/certificados/validar/DMC-AAAA-BBBB')).status, 404);
  });

  test('R9b: aluno SEM perfil, curso sem avaliação → GET prévio com nomePrevisto/nomeOrigem/notaMinima; emite com o nome da conta', async () => {
    await subirCom();
    await concluirTudo();
    const g = await api.get('/api/cursos/curso-01/certificado', { usuario: 'u-aluno1' });
    assert.equal(g.status, 200);
    assert.deepEqual(
      { emitido: g.corpo.emitido, total: g.corpo.total, concluidas: g.corpo.concluidas, faltam: g.corpo.faltam, elegivel: g.corpo.elegivel, regra: g.corpo.regra },
      { emitido: false, total: 5, concluidas: 5, faltam: 0, elegivel: true, regra: 'aulas' }
    );
    assert.equal(g.corpo.nomePrevisto, 'Aluna Um de Teste');
    assert.equal(g.corpo.nomeOrigem, 'conta');
    assert.equal(g.corpo.notaMinima, 7);
    assert.deepEqual(g.corpo.pendencias, []);

    const r = await api.post('/api/cursos/curso-01/certificado', {}, { usuario: 'u-aluno1' });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.novo, true);
    const c = r.corpo.certificado;
    assert.match(c.codigo, /^DMC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    assert.equal(c.nomeAluno, 'Aluna Um de Teste');
    assert.equal(c.nomeOrigem, 'conta');
    assert.match(c.hashPrefixo, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);

    // validação legada: formato de hoje, sem campos novos
    const v = await api.get(`/api/certificados/validar/${c.codigo}`);
    assert.equal(v.status, 200);
    assert.deepEqual(Object.keys(v.corpo).sort(), ['certificado', 'valido']);
    assert.deepEqual(Object.keys(v.corpo.certificado).sort(), ['cargaHoraria', 'codigo', 'emitidoEm', 'nomeAluno', 'tituloCurso']);
    assert.equal(v.corpo.certificado.nomeAluno, 'Aluna Um de Teste');

    // idempotente
    const de2 = await api.post('/api/cursos/curso-01/certificado', {}, { usuario: 'u-aluno1' });
    assert.equal(de2.status, 200);
    assert.equal(de2.corpo.novo, false);
    assert.equal(de2.corpo.certificado.codigo, c.codigo);

    // lista com hashPrefixo; selo recalculável pelo assinador
    const lista = await api.get('/api/certificados', { usuario: 'u-aluno1' });
    assert.equal(lista.corpo.itens.length, 1);
    assert.equal(lista.corpo.itens[0].hashPrefixo, c.hashPrefixo);
    const doc = await banco.collection('certificados').findOne({ codigo: c.codigo });
    assert.equal(assinador.verificar('certificado', camposSeloCertificado(doc), doc.hash, doc.kid), true);
    assert.equal(assinador.verificar('certificado', camposSeloCertificado({ ...doc, nomeAluno: 'Outra Pessoa' }), doc.hash, doc.kid), false);

    // auditoria do evento
    const aud = await banco.collection('auditoria').findOne({ acao: 'certificado.emitido' });
    assert.equal(aud.entidade.id, c.codigo);
    assert.deepEqual(aud.extra, { nomeOrigem: 'conta', regra: 'aulas' });
  });

  test('sem nenhum serviço de outra fatia (servicosFalsos vazios): regra aulas, nunca 503; selo existe', async () => {
    await subirCom();
    await concluirTudo();
    const r = await api.post('/api/cursos/curso-01/certificado', {}, { usuario: 'u-aluno1' });
    assert.equal(r.status, 201);
    const doc = await banco.collection('certificados').findOne({ codigo: r.corpo.certificado.codigo });
    assert.equal(doc.regra, 'aulas');
    assert.equal(doc.matriculaId, null);
    assert.equal(doc.notaFinal, null);
    assert.ok(doc.hash && doc.kid);
    assert.ok(log.avisos.some(t => t.includes('ausente na rota legada')));
  });

  test('faltam aulas → 409 nao-elegivel com a mensagem de hoje', async () => {
    await subirCom();
    await concluirTudo('u-aluno1', AULAS_DISPONIVEIS.slice(0, 3));
    const r = await api.post('/api/cursos/curso-01/certificado', {}, { usuario: 'u-aluno1' });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.codigo, 'nao-elegivel');
    assert.equal(r.corpo.error, 'Conclua todas as aulas para emitir o certificado. Faltam 2 de 5.');
    assert.equal(r.corpo.pendencias[0].tipo, 'aulas');
  });

  test('sem liberação → 403; curso inexistente → 404', async () => {
    await subirCom();
    assert.equal((await api.post('/api/cursos/curso-02/certificado', {}, { usuario: 'u-aluno1' })).status, 403);
    assert.equal((await api.post('/api/cursos/nao-existe/certificado', {}, { usuario: 'u-aluno1' })).status, 404);
  });

  test('com avaliação modular reprovada (F2 + F4a falsos) → 409 nao-elegivel com pendência do módulo', async () => {
    await subirCom({
      'secretaria.matriculaVigente': async () => matriculaFalsa(),
      'secretaria.garantirMatricula': async () => matriculaFalsa(),
      'avaliacoes.notaDoModulo': async (_mat, moduloId) => (moduloId === 'c01-m01'
        ? { temModular: true, nota: 5, situacao: 'reprovado', aguardandoCorrecao: false, finalizada: true, tentativas: { usadas: 2, permitidas: 2, restantes: 0 } }
        : { temModular: false, nota: null, situacao: 'concluido' })
    });
    await concluirTudo();
    const g = await api.get('/api/cursos/curso-01/certificado', { usuario: 'u-aluno1' });
    assert.equal(g.corpo.regra, 'aprovacao');
    assert.equal(g.corpo.elegivel, false);
    assert.equal(g.corpo.situacaoCurso, 'reprovado');
    const r = await api.post('/api/cursos/curso-01/certificado', {}, { usuario: 'u-aluno1' });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.codigo, 'nao-elegivel');
    assert.equal(r.corpo.pendencias[0].tipo, 'modulo');
    assert.equal(r.corpo.pendencias[0].moduloId, 'c01-m01');
    assert.match(r.corpo.error, /Módulo 01 · Módulo 1: reprovado \(nota 5; mínimo 7\)\./);
  });

  test('aprovado: regra aprovacao, congela matrícula/nota e conclui a matrícula pelo serviço', async () => {
    await subirCom({
      'secretaria.matriculaVigente': async () => matriculaFalsa(),
      'secretaria.garantirMatricula': async () => matriculaFalsa(),
      'secretaria.concluirMatricula': async () => ({ ok: true }),
      'avaliacoes.notaDoModulo': async (_mat, moduloId) => (moduloId === 'c01-m01'
        ? { temModular: true, nota: 8.5, situacao: 'aprovado' } : { temModular: false, nota: null, situacao: 'concluido' })
    });
    await concluirTudo();
    const r = await api.post('/api/cursos/curso-01/certificado', {}, { usuario: 'u-aluno1' });
    assert.equal(r.status, 201);
    const doc = await banco.collection('certificados').findOne({ codigo: r.corpo.certificado.codigo });
    assert.equal(doc.regra, 'aprovacao');
    assert.equal(doc.notaFinal, 8.5);
    assert.equal(doc.matriculaNumero, 'MAT-2026-AAAAA2');
    assert.equal(doc.turmaCodigo, 'APE-2026-01');
    const ch = srv.chamadas['secretaria.concluirMatricula'];
    assert.equal(ch.length, 1);
    assert.equal(ch[0][0], IDS['mat-aluno1']);
    assert.equal(ch[0][1].certificadoCodigo, doc.codigo);
    assert.equal(assinador.verificar('certificado', camposSeloCertificado(doc), doc.hash, doc.kid), true);
  });

  test('emitido antigo (sem selo) segue válido mesmo com a regra nova não cumprida; lista com hashPrefixo null', async () => {
    await subirCom({
      'secretaria.garantirMatricula': async () => matriculaFalsa(),
      'avaliacoes.notaDoModulo': async () => ({ temModular: true, nota: 2, situacao: 'reprovado' })
    });
    await banco.collection('certificados').insertOne({
      codigo: 'DMC-ABCD-EFGH', userId: IDS['u-aluno1'], cursoId: 'curso-01', nomeAluno: 'Aluna Um de Teste',
      tituloCurso: 'Curso de Teste APE', cargaHoraria: '12h', totalAulas: 5, emitidoEm: new Date('2026-01-10T12:00:00Z')
    });
    const r = await api.post('/api/cursos/curso-01/certificado', {}, { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.novo, false);
    assert.equal(r.corpo.certificado.codigo, 'DMC-ABCD-EFGH');
    assert.equal(r.corpo.certificado.hashPrefixo, null);
    const g = await api.get('/api/cursos/curso-01/certificado', { usuario: 'u-aluno1' });
    assert.equal(g.corpo.emitido, true);
    const v = await api.get('/api/certificados/validar/dmc-abcd-efgh');
    assert.equal(v.status, 200);
    assert.equal(v.corpo.certificado.nomeAluno, 'Aluna Um de Teste');
  });

  test('curso sem avaliação com frequenciaMinima e sem F3a → 409 nao-elegivel (frequência não apurada)', async () => {
    await banco.collection('cursos').updateOne({ _id: 'curso-01' }, { $set: { criterios: { frequenciaMinima: 75 } } });
    await subirCom();
    await concluirTudo();
    const r = await api.post('/api/cursos/curso-01/certificado', {}, { usuario: 'u-aluno1' });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.codigo, 'nao-elegivel');
    assert.deepEqual(r.corpo.pendencias, [{ tipo: 'frequencia', texto: 'Frequência ainda não apurada.' }]);
  });

  test('com F3a (situacaoDoCurso) a regra e as pendências vêm dela; notaMinima do curso no GET (D-80)', async () => {
    await banco.collection('cursos').updateOne({ _id: 'curso-01' }, { $set: { criterios: { notaMinima: 6, frequenciaMinima: 75 } } });
    await subirCom({
      'academico.situacaoDoCurso': async () => ({
        situacao: 'cursando', elegivelCertificado: false, regra: 'aulas', mediaParcial: null, frequenciaGeralPct: 60,
        pendencias: [{ tipo: 'frequencia', texto: 'Frequência de 60%; o mínimo do curso é 75%.' }]
      })
    });
    await concluirTudo();
    const g = await api.get('/api/cursos/curso-01/certificado', { usuario: 'u-aluno1' });
    assert.equal(g.corpo.notaMinima, 6);
    assert.equal(g.corpo.elegivel, false);
    assert.deepEqual(g.corpo.pendencias, [{ tipo: 'frequencia', texto: 'Frequência de 60%; o mínimo do curso é 75%.' }]);
  });

  test('lato sensu → 409 certificado-pela-ies', async () => {
    await banco.collection('cursos').updateOne({ _id: 'curso-01' }, { $set: { nivel: 'pos_graduacao_lato_sensu' } });
    await subirCom();
    await concluirTudo();
    const r = await api.post('/api/cursos/curso-01/certificado', {}, { usuario: 'u-aluno1' });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.codigo, 'certificado-pela-ies');
  });

  test('nome: registro (mesmo com social diferente) → registro; social por ato da coordenação → social; só social → 409 cadastro-incompleto', async () => {
    await concluirTudo();
    await banco.collection('perfis').insertOne({ userId: IDS['u-aluno1'], nomeRegistro: 'Ana Registro da Silva', nomeSocial: 'Ana Social' });
    await subirCom();
    const g = await api.get('/api/cursos/curso-01/certificado', { usuario: 'u-aluno1' });
    assert.equal(g.corpo.nomePrevisto, 'Ana Registro da Silva');
    assert.equal(g.corpo.nomeOrigem, 'registro');
    await fechar(server);

    await subirCom({ 'secretaria.garantirMatricula': async () => ({ ...matriculaFalsa(), nomeEmDocumentos: { usar: 'social' } }) });
    const r = await api.post('/api/cursos/curso-01/certificado', {}, { usuario: 'u-aluno1' });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.certificado.nomeAluno, 'Ana Social');
    assert.equal(r.corpo.certificado.nomeOrigem, 'social');
    await fechar(server);

    // u-aluno2: perfil só com nome social
    await concluirTudo('u-aluno2');
    await banco.collection('perfis').insertOne({ userId: IDS['u-aluno2'], nomeRegistro: null, nomeSocial: 'Beto Social' });
    await subirCom();
    const r2 = await api.post('/api/cursos/curso-01/certificado', {}, { usuario: 'u-aluno2' });
    assert.equal(r2.status, 409);
    assert.equal(r2.corpo.codigo, 'cadastro-incompleto');
    assert.deepEqual(r2.corpo.faltando, ['nomeRegistro']);
    const g2 = await api.get('/api/cursos/curso-01/certificado', { usuario: 'u-aluno2' });
    assert.equal(g2.corpo.nomePrevisto, null);
    assert.deepEqual(g2.corpo.faltando, ['nomeRegistro']);
  });

  test('reconciliação (§8.8): certificado emitido com matrícula ainda ativa → conclui na leitura; falha não muda a resposta', async () => {
    let falhar = true;
    await subirCom({
      'secretaria.matriculaVigente': async () => matriculaFalsa('ativa'),
      'secretaria.concluirMatricula': async () => { if (falhar) throw new Error('fora do ar'); return { ok: true }; }
    });
    await banco.collection('certificados').insertOne({
      codigo: 'DMC-WXYZ-2345', userId: IDS['u-aluno1'], cursoId: 'curso-01', nomeAluno: 'Aluna Um de Teste',
      tituloCurso: 'Curso de Teste APE', cargaHoraria: '12h', totalAulas: 5, emitidoEm: new Date('2026-02-10T12:00:00Z')
    });
    const r1 = await api.get('/api/cursos/curso-01/certificado', { usuario: 'u-aluno1' });
    assert.equal(r1.status, 200);
    assert.equal(r1.corpo.emitido, true);
    assert.ok(log.avisos.some(t => t.includes('reconciliação da matrícula falhou')));
    falhar = false;
    await api.get('/api/cursos/curso-01/certificado', { usuario: 'u-aluno1' });
    const ch = srv.chamadas['secretaria.concluirMatricula'];
    assert.equal(ch.length, 2);
    assert.equal(ch[1][1].certificadoCodigo, 'DMC-WXYZ-2345');
    assert.equal(ch[1][1].resultadoFinal.regra, 'aulas');
  });

  test('CPF ausente não bloqueia; resposta sem senhaHash nem userId de terceiros', async () => {
    await concluirTudo();
    await banco.collection('perfis').insertOne({ userId: IDS['u-aluno1'], nomeRegistro: 'Ana Registro', cpf: null });
    await subirCom();
    const r = await api.post('/api/cursos/curso-01/certificado', {}, { usuario: 'u-aluno1' });
    assert.equal(r.status, 201);
    const texto = JSON.stringify(r.corpo);
    assert.ok(!texto.includes('senhaHash'));
    assert.ok(!texto.includes('"hash"'));
  });
});
