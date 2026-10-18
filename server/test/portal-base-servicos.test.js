// Portal · F0t — notificações, pendências, busca e auditoria (PORTAL-API §6.4; casos de
// §9.3, linha portal-base-servicos). A busca é testada SÓ com provedores falsos do grupo
// `busca` (D-64): os provedores reais são das fatias donas. Nenhum Mongo, nenhuma rede.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ObjectId } from 'mongodb';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso, fetchFalso, servicosFalsos } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const { montarPortal, MODULOS_PADRAO } = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const { criarTratarErroGlobal } = await import('../src/portal/erros.js');
await import('../src/routes/portal/perfil.js');

const MODULOS_F0T = MODULOS_PADRAO.filter(m => m.fatia === 'F0t');
const ENV_EMAIL = { RESEND_API_KEY: 'chave-falsa', PORTAL_EMAIL_FROM: 'Plataforma <nao-responda@exemplo.invalid>', PORTAL_BASE_URL: 'https://portal.exemplo.invalid' };

async function subirPortal({ env = ENV_EMAIL, prep = async () => {}, falsos = {}, grupos = {} } = {}) {
  const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
  await semear(banco);
  await prep(banco);
  const servicos = criarServicos();
  servicosFalsos(falsos, { grupos, em: servicos });
  const portal = montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: MODULOS_F0T, configPortal: lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste', ...env }),
    falharCedo: true, log: silencioso, fetchImpl: fetchFalso([{ status: 200, json: {} }])
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  return { api: cliente(base), server, banco, servicos };
}

const notif = (userId, i, extra = {}) => ({
  _id: new ObjectId(), userId, tipo: 'documento.revisado', titulo: `Documento revisado ${i}`, texto: 'Seu documento foi revisado.',
  link: 'documentos.html', entidade: null, chave: null, lida: false, lidaEm: null, criadaEm: new Date(Date.UTC(2026, 9, 18, 10, i)), expiraEm: new Date('2027-04-01'), ...extra
});

describe('notificações', () => {
  let ctx;
  let alheia;
  let varreu = 0;
  before(async () => {
    ctx = await subirPortal({
      grupos: { notificacaoSobDemanda: [{ tipo: 'encontro.proximo', gerar: async () => { varreu++; } }] },
      prep: async (banco) => {
        const docs = Array.from({ length: 30 }, (_, i) => notif(IDS['u-aluno1'], i, i < 3 ? { lida: true } : {}));
        const outro = notif(IDS['u-aluno2'], 0);
        alheia = String(outro._id);
        await banco.collection('notificacoes').insertMany([...docs, outro]);
      }
    });
  });
  after(() => fechar(ctx.server));

  test('resumo conta as não lidas e roda a varredura sob demanda', async () => {
    const r = await ctx.api.get('/api/portal/me/notificacoes/resumo', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { naoLidas: 27 });
    assert.equal(varreu, 1);
    // O intervalo de 5 min da varredura é do serviço da F0m (provado com Mongo real em portal-base-integracao).
    assert.equal((await ctx.api.get('/api/portal/me/notificacoes/resumo')).status, 401);
  });

  test('lista paginada (25), mais recentes primeiro, filtro de não lidas; só as próprias', async () => {
    const r = await ctx.api.get('/api/portal/me/notificacoes', { usuario: 'u-aluno1' });
    assert.equal(r.corpo.itens.length, 25);
    assert.equal(r.corpo.total, 30);
    assert.equal(r.corpo.totalPaginas, 2);
    assert.equal(r.corpo.itens[0].titulo, 'Documento revisado 29');
    assert.deepEqual(Object.keys(r.corpo.itens[0]).sort(), ['criadaEm', 'id', 'lida', 'link', 'texto', 'tipo', 'titulo']);
    const p2 = await ctx.api.get('/api/portal/me/notificacoes?pagina=2', { usuario: 'u-aluno1' });
    assert.equal(p2.corpo.itens.length, 5);
    const nl = await ctx.api.get('/api/portal/me/notificacoes?naoLidas=1&porPagina=100', { usuario: 'u-aluno1' });
    assert.equal(nl.corpo.total, 27);
    assert.ok(nl.corpo.itens.every(i => i.lida === false));
    assert.ok(!JSON.stringify(r.corpo).includes(alheia));
  });

  test('marcar lida (idempotente); alheia e id inválido → 404; marcar todas', async () => {
    const lista = await ctx.api.get('/api/portal/me/notificacoes?naoLidas=1', { usuario: 'u-aluno1' });
    const id = lista.corpo.itens[0].id;
    assert.deepEqual((await ctx.api.post(`/api/portal/me/notificacoes/${id}/lida`, {}, { usuario: 'u-aluno1' })).corpo, { ok: true });
    assert.equal((await ctx.api.post(`/api/portal/me/notificacoes/${id}/lida`, {}, { usuario: 'u-aluno1' })).status, 200);
    assert.equal((await ctx.api.post(`/api/portal/me/notificacoes/${alheia}/lida`, {}, { usuario: 'u-aluno1' })).status, 404);
    assert.equal((await ctx.api.post('/api/portal/me/notificacoes/nao-e-id/lida', {}, { usuario: 'u-aluno1' })).status, 404);
    assert.equal((await ctx.api.get('/api/portal/me/notificacoes/resumo', { usuario: 'u-aluno1' })).corpo.naoLidas, 26);
    const todas = await ctx.api.post('/api/portal/me/notificacoes/lidas', {}, { usuario: 'u-aluno1' });
    assert.deepEqual(todas.corpo, { ok: true, marcadas: 26 });
    assert.equal((await ctx.banco.collection('notificacoes').findOne({ _id: new ObjectId(alheia) })).lida, false);
  });
});

describe('pendências (grupo aviso)', () => {
  test('aviso de contrato NÃO dispensável vem primeiro; contador de fatia ausente = null; ids fixos preenchem a sua chave', async () => {
    const ctx = await subirPortal({
      grupos: {
        aviso: [
          { id: 'contrato-pendente', gerar: async () => [{ id: 'contrato-pendente', tom: 'aviso', texto: 'Há 1 contrato aguardando a sua assinatura.', href: 'contratos.html', rotulo: 'Assinar', dispensavel: false, contador: 1 }] },
          { id: 'documento-pendente', gerar: async () => [] }
        ]
      },
      prep: async (banco) => { await banco.collection('notificacoes').insertOne(notif(IDS['u-aluno1'], 1)); }
    });
    try {
      const r = await ctx.api.get('/api/portal/me/pendencias', { usuario: 'u-aluno1' });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.avisos[0].id, 'contrato-pendente');
      assert.equal(r.corpo.avisos[0].dispensavel, false);
      const ids = r.corpo.avisos.map(a => a.id);
      assert.ok(ids.includes('perfil-incompleto'));
      assert.ok(ids.includes('email-nao-verificado'));
      assert.deepEqual(r.corpo.contadores, {
        contratosPendentes: 1, documentosPendentes: 0, documentosNaoEnviados: null, lancamentosAtrasados: null,
        perfilIncompleto: true, precisaTrocarSenha: false, emailNaoVerificado: true, segundoFatorObrigatorio: false, notificacoesNaoLidas: 1
      });
      const adm = await ctx.api.get('/api/portal/me/pendencias', { usuario: 'u-admin' });
      assert.equal(adm.corpo.contadores.emailNaoVerificado, false);
      assert.equal(adm.corpo.contadores.segundoFatorObrigatorio, false, 'sem PORTAL_2FA');
      assert.equal((await ctx.api.get('/api/portal/me/pendencias', { usuario: 'u-temp' })).status, 403, 'senha temporária: só a troca de senha');
    } finally { await fechar(ctx.server); }
  });

  test('sem e-mail transacional não há aviso de e-mail; com PORTAL_2FA o admin sem 2FA recebe o aviso obrigatório', async () => {
    const ctx = await subirPortal({ env: { PORTAL_2FA: '1' } });
    try {
      const r = await ctx.api.get('/api/portal/me/pendencias', { usuario: 'u-aluno1' });
      assert.equal(r.corpo.contadores.emailNaoVerificado, false);
      const adm = await ctx.api.get('/api/portal/me/pendencias', { usuario: 'u-admin' });
      assert.equal(adm.corpo.contadores.segundoFatorObrigatorio, true);
      assert.equal(adm.corpo.avisos[0].id, '2fa-obrigatorio');
    } finally { await fechar(ctx.server); }
  });
});

describe('busca (provedores falsos)', () => {
  let ctx;
  const recebidos = [];
  before(async () => {
    ctx = await subirPortal({
      grupos: {
        busca: [
          {
            tipo: 'cursos', papeis: ['aluno', 'professor', 'admin'],
            async buscar(_req, termos, { limite }) {
              recebidos.push(termos);
              const base = ['Introdução ao Direito Imobiliário', 'Regularização fundiária', '.* curinga literal'];
              const itens = base.filter(t => termos.every(re => re.test(t))).map((t, i) => ({ id: `c${i}`, titulo: t, contexto: 'Curso', href: `dashboard.html?curso=c${i}`, bloqueado: false }));
              return { itens: itens.slice(0, limite), temMais: itens.length > limite };
            }
          },
          { tipo: 'documentos', papeis: ['admin'], buscar: async () => ({ itens: [{ id: 'd1', titulo: 'Documento', href: 'professor.html#/documentos', bloqueado: false }], temMais: false }) },
          { tipo: 'publicacoes', papeis: ['aluno', 'admin'], buscar: async () => ({ itens: [{ id: 'p1', titulo: 'Externo', href: 'https://evil.example/x', bloqueado: false }, { id: 'p2', titulo: 'Aviso', href: 'publicacao.html?id=p2' }], temMais: false }) },
          { tipo: 'atendimentos', papeis: ['aluno'], buscar: async () => { throw new Error('provedor quebrado'); } }
        ]
      }
    });
  });
  after(() => fechar(ctx.server));

  test('q curta, longa ou ausente → 400; tipos desconhecidos → 400; página sem tipo único → 400', async () => {
    for (const q of ['?q=a', '', `?q=${'x'.repeat(81)}`, '?q=ab&tipos=cursos,xyz', '?q=ab&pagina=2', '?q=ab&limite=50']) {
      const r = await ctx.api.get(`/api/portal/busca${q}`, { usuario: 'u-aluno1' });
      assert.equal(r.status, 400, q);
    }
    assert.equal((await ctx.api.get('/api/portal/busca?q=ab')).status, 401);
  });

  test('acento-insensível, E entre palavras, grupos sem permissão OMITIDOS, href externo descartado, provedor que falha omitido', async () => {
    const r = await ctx.api.get('/api/portal/busca?q=introducao%20direito', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.grupos.cursos.itens.map(i => i.titulo), ['Introdução ao Direito Imobiliário']);
    assert.equal(r.corpo.grupos.documentos, undefined, 'aluno não busca documentos de outros');
    assert.equal(r.corpo.grupos.atendimentos, undefined, 'provedor com falha fica de fora');
    assert.deepEqual(r.corpo.grupos.publicacoes.itens.map(i => i.id), ['p2']);
    const adm = await ctx.api.get('/api/portal/busca?q=documento&tipos=documentos', { usuario: 'u-admin' });
    assert.deepEqual(Object.keys(adm.corpo.grupos), ['documentos']);
  });

  test('regex inofensiva: ".*" é texto literal, não curinga', async () => {
    const r = await ctx.api.get('/api/portal/busca?q=.*&tipos=cursos', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.grupos.cursos.itens.map(i => i.titulo), ['.* curinga literal']);
    assert.ok(recebidos.at(-1).every(re => re instanceof RegExp && re.test('.*') && !re.test('Regularização')));
  });
});

describe('auditoria (consulta da coordenação)', () => {
  let ctx;
  before(async () => {
    ctx = await subirPortal({
      prep: async (banco) => {
        const em = i => new Date(Date.UTC(2026, 9, 10, 12, i));
        const ator = { userId: IDS['u-admin'], papel: 'admin', ipTruncado: '127.0.0.0/24' };
        const base = { cursoId: null, mudancas: null, motivo: null, extra: null, estado: 'concluido', concluidoEm: null, erro: null };
        const atd = new ObjectId(); const ouv = new ObjectId(); const ctr = new ObjectId();
        await banco.collection('protocolos').insertOne({ _id: atd, protocolo: 'ATD-2026-ABCDEF' });
        await banco.collection('manifestacoes').insertOne({ _id: ouv, protocolo: 'OUV-2026-ABCDEF' });
        await banco.collection('contratos').insertOne({ _id: ctr, codigoVerificacao: 'CTR-ABCD-EFGH-JKLM' });
        await banco.collection('auditoria').insertMany([
          { ...base, em: em(1), acao: 'contrato.criado', ator, alvoUserId: IDS['u-aluno1'], entidade: { tipo: 'contrato', id: String(ctr) } },
          { ...base, em: em(2), acao: 'contrato.assinado', ator: { ...ator, userId: IDS['u-aluno1'], papel: 'aluno' }, alvoUserId: IDS['u-aluno1'], entidade: { tipo: 'contrato', id: String(ctr) } },
          { ...base, em: em(3), acao: 'matricula.criada', ator, alvoUserId: IDS['u-aluno1'], entidade: { tipo: 'matricula', id: IDS['mat-aluno1'] }, mudancas: [{ campo: 'status', de: null, para: 'ativa' }] },
          { ...base, em: em(4), acao: 'protocolo.reatribuido', ator, alvoUserId: IDS['u-aluno2'], entidade: { tipo: 'protocolo', id: String(atd) }, motivo: 'Fila errada' },
          { ...base, em: em(5), acao: 'ouvidoria.encaminhada', ator, alvoUserId: null, entidade: { tipo: 'manifestacao', id: String(ouv) } },
          { ...base, em: em(6), acao: 'perfil.alterado', ator: { userId: null, papel: 'sistema', ipTruncado: null }, alvoUserId: IDS['u-aluno2'], entidade: { tipo: 'perfil', id: IDS['u-aluno2'] }, mudancas: [{ campo: 'nomeRegistro', de: null, para: 'Novo' }], motivo: '=1+1' }
        ]);
      }
    });
  });
  after(() => fechar(ctx.server));

  test('só coordenação; mais recentes primeiro; ator e alvo com nome; PUT/DELETE inexistentes (404)', async () => {
    assert.equal((await ctx.api.get('/api/portal/admin/auditoria', { usuario: 'u-prof' })).status, 403);
    const r = await ctx.api.get('/api/portal/admin/auditoria', { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.itens[0].acao, 'perfil.alterado');
    const prot = r.corpo.itens.find(i => i.acao === 'protocolo.reatribuido');
    assert.equal(prot.ator.nome, 'Coordenação de Teste');
    assert.equal(prot.alvo.nome, 'Aluno Dois de Teste');
    assert.equal(r.corpo.itens[0].ator.papel, 'sistema');
    assert.equal((await ctx.api.put('/api/portal/admin/auditoria', {}, { usuario: 'u-admin' })).status, 404);
    assert.equal((await ctx.api.del('/api/portal/admin/auditoria', { usuario: 'u-admin' })).status, 404);
  });

  test('filtro por prefixo e por ação exata; ação malformada → 400', async () => {
    const pre = await ctx.api.get('/api/portal/admin/auditoria?acao=contrato.', { usuario: 'u-admin' });
    assert.deepEqual(pre.corpo.itens.map(i => i.acao), ['contrato.assinado', 'contrato.criado']);
    const ex = await ctx.api.get('/api/portal/admin/auditoria?acao=contrato.criado', { usuario: 'u-admin' });
    assert.equal(ex.corpo.total, 1);
    assert.equal((await ctx.api.get('/api/portal/admin/auditoria?acao=$where', { usuario: 'u-admin' })).status, 400);
  });

  test('?objeto= resolve MAT, ATD, OUV, CTR e e-mail no servidor; nada encontrado → lista vazia', async () => {
    const casos = [['MAT-2026-AAAAA2', ['matricula.criada']], ['ATD-2026-ABCDEF', ['protocolo.reatribuido']], ['OUV-2026-ABCDEF', ['ouvidoria.encaminhada']], ['CTR-ABCD-EFGH-JKLM', ['contrato.assinado', 'contrato.criado']]];
    for (const [obj, acoes] of casos) {
      const r = await ctx.api.get(`/api/portal/admin/auditoria?objeto=${obj}`, { usuario: 'u-admin' });
      assert.deepEqual(r.corpo.itens.map(i => i.acao), acoes, obj);
    }
    const e = await ctx.api.get('/api/portal/admin/auditoria?objeto=aluno2@exemplo.invalid', { usuario: 'u-admin' });
    assert.deepEqual(e.corpo.itens.map(i => i.acao), ['perfil.alterado', 'protocolo.reatribuido']);
    const nada = await ctx.api.get('/api/portal/admin/auditoria?objeto=MAT-2026-ZZZZZZ', { usuario: 'u-admin' });
    assert.deepEqual(nada.corpo.itens, []);
    assert.equal((await ctx.api.get('/api/portal/admin/auditoria?objeto=qualquer-coisa', { usuario: 'u-admin' })).status, 400);
  });

  test('CSV com BOM, ";" e anti-fórmula; gera relatorio.exportado', async () => {
    const r = await ctx.api.get('/api/portal/admin/auditoria?formato=csv', { usuario: 'u-admin' });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/csv/);
    assert.match(r.headers.get('content-disposition'), /dmc-auditoria-\d{4}-\d{2}-\d{2}\.csv/);
    assert.match(r.texto, /Data e hora;Ação;Quem fez/);
    assert.ok(r.texto.includes("'=1+1"), 'célula que começa com = recebe apóstrofo');
    assert.ok(!/;=1\+1/.test(r.texto));
    assert.equal(await ctx.banco.collection('auditoria').countDocuments({ acao: 'relatorio.exportado' }), 1);
  });

  test('acima de 20.000 linhas → 413 relatorio-grande', async () => {
    const ator = { userId: null, papel: 'sistema', ipTruncado: null };
    const docs = Array.from({ length: 20001 }, (_, i) => ({ em: new Date(Date.UTC(2026, 0, 1, 0, 0, i)), acao: 'auth.login_sucesso', ator, alvoUserId: null, cursoId: null, entidade: { tipo: 'usuario', id: 'x' }, mudancas: null, motivo: null, extra: null, estado: 'concluido' }));
    await ctx.banco.collection('auditoria').insertMany(docs);
    const r = await ctx.api.get('/api/portal/admin/auditoria?formato=csv&acao=auth.login_sucesso', { usuario: 'u-admin' });
    assert.equal(r.status, 413);
    assert.equal(r.corpo.codigo, 'relatorio-grande');
  });
});

describe('varredura de segredo nas respostas da F0t (API §9.2)', () => {
  test('nenhum GET devolve senhaHash, segredo TOTP, hash de token, códigos ou binário', async () => {
    const ctx = await subirPortal({
      prep: async (banco) => {
        await banco.collection('perfis').insertOne({ userId: IDS['u-aluno1'], nomeRegistro: 'Aluna', cpf: '52998224725', consentimentos: {}, versao: 1 });
        await banco.collection('auth_tokens').insertOne({ tipo: 'link_magico', userId: IDS['u-aluno1'], hash: 'f'.repeat(64), criadoEm: new Date(), expiraEm: new Date(Date.now() + 60000), usadoEm: null, tentativas: 0, dados: {} });
      }
    });
    try {
      const rotas = {
        'u-aluno1': ['/api/auth/2fa', '/api/portal/me/perfil', '/api/portal/me/dados/resumo', '/api/portal/me/dados/consentimentos', '/api/portal/me/dados/exportacao', '/api/portal/me/notificacoes', '/api/portal/me/pendencias'],
        'u-2fa': ['/api/auth/2fa', '/api/portal/me/perfil', '/api/portal/me/dados/exportacao'],
        'u-prof': ['/api/portal/professor/cursos', `/api/portal/professor/alunos/${IDS['u-aluno1']}/resumo`],
        'u-admin': ['/api/portal/admin/equipe', '/api/portal/admin/usuarios', `/api/portal/admin/usuarios/${IDS['u-2fa']}`, `/api/portal/admin/usuarios/${IDS['u-aluno1']}/perfil`, '/api/portal/admin/auditoria']
      };
      for (const [usuario, lista] of Object.entries(rotas)) {
        for (const rota of lista) {
          const r = await ctx.api.get(rota, { usuario });
          assert.equal(r.status, 200, `${usuario} ${rota}`);
          const s = typeof r.corpo === 'string' ? r.corpo : JSON.stringify(r.corpo);
          assert.doesNotMatch(s, /senhaHash|"segredo"|"pendente"|"hash"|"codigos"|"dados":\{"type"|ffffffffffffffff|\$2[aby]\$/, `${usuario} ${rota}`);
        }
      }
      // Professor nunca vê CPF do aluno.
      const prof = await ctx.api.get(`/api/portal/professor/alunos/${IDS['u-aluno1']}/resumo`, { usuario: 'u-prof' });
      assert.doesNotMatch(JSON.stringify(prof.corpo), /52998224725/);
    } finally { await fechar(ctx.server); }
  });
});
