// Portal · F6b — Assistente de IA do aluno (PORTAL-API §6.10.3; casos da §9.3, linha
// atendimento-ia). Gemini FALSO (provedorGeminiFalso/fetchFalso): zero rede. Banco em
// memória; serviços de outras fatias como falsos. Rode com `npm test` na raiz.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso, provedorGeminiFalso, fetchFalso, servicosFalsos } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const M = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const E = await import('../src/portal/erros.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const { criarCripto } = await import('../src/portal/cripto.js');
const IA = await import('../src/routes/portal/ia.js');
const T = await import('../src/portal/ia/instrucao.js');
const F = await import('../src/portal/ia/ferramentas.js');

const MATERIAL = 'segredo-de-teste';
const CHAVE = 'AIzaChaveDeTesteDoGemini_0123456789abcdef';
const CPF_ALUNO = '529.982.247-25';

// ---------- falsos de outras fatias ----------
function consentimentosFalsos() {
  const reg = new Map();
  return {
    reg,
    mapa: {
      'consentimentos.registrar': async ({ userId, finalidade, versaoTexto, textoSha256 }) => {
        const em = new Date();
        reg.set(userId, { versaoTexto, textoSha256, em });
        return { finalidade, em };
      },
      'consentimentos.revogar': async ({ userId }) => {
        if (!reg.has(userId)) throw new E.ErroPortal(404, null, 'Sem autorização vigente.');
        reg.delete(userId);
        return { em: new Date() };
      },
      'consentimentos.vigente': async (userId) => reg.get(userId) || null
    }
  };
}

function servicosDeDominio() {
  return {
    'estudos.progressoDoCurso': async () => ({ aulasTotal: 5, aulasConcluidas: 2, pct: 40 }),
    'academico.situacaoDoCurso': async () => ({
      situacao: 'cursando', situacaoRotulo: 'Cursando', frequenciaGeralPct: 80, aoVivoPct: 70, gravadoPct: 90,
      modulos: [{ moduloId: 'c01-m01', titulo: 'Módulo 1', nota: 6.5, situacao: 'em_recuperacao', frequenciaPct: 75, faltas: 1 }]
    }),
    'secretaria.pendenciasDoAluno': async () => ({
      documentos: [{ sigla: 'DOC', nome: 'Documento de identidade', status: 'pendente', motivo: 'RG 12.345.678-9 ilegível, contato fulano@exemplo.invalid' }],
      contratos: [{ id: 'x', titulo: 'Contrato com texto livre', matriculaNumero: 'MAT-2026-AAAAA2', disponivelEm: '2026-10-01T12:00:00.000Z' }]
    }),
    'financeiro.resumoDoAluno': async () => ({ itens: [{ rotuloTipo: 'Parcela 1/3', cursoTitulo: 'Curso de Teste APE', vencimento: '2026-10-30', valorCentavos: 49900, status: 'pendente', descricao: 'texto livre' }] }),
    'atendimento.abertosDoAluno': async () => ([{ protocolo: 'ATD-2026-ABCDEF', categoria: 'academico', assunto: `CPF ${CPF_ALUNO} no assunto`, status: 'aberto' }])
  };
}

const ragFalso = {
  recuperar: (_consulta, trechos, k = 3) => trechos.slice(0, k)
};

// ---------- app ----------
async function subirIa({
  roteiro = [{ texto: 'Resposta de teste.' }], fetchImpl = null, env = {}, extras = {}, comDominio = true,
  semConsentimentoSrv = false, semAtendimento = false, carregarRag = async () => ragFalso, retencao = null
} = {}) {
  const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
  await semear(banco);
  const servicos = criarServicos();
  const cons = consentimentosFalsos();
  const abertos = [];
  const mapa = {
    ...(semConsentimentoSrv ? {} : cons.mapa),
    ...(comDominio ? servicosDeDominio() : {}),
    ...(retencao ? { 'configuracoes.retencao': retencao } : {}),
    ...(semAtendimento ? {} : {
      'atendimento.abrirProtocolo': async (dados) => { abertos.push(dados); return { id: 'p1', protocolo: `ATD-2026-00000${abertos.length}` }; }
    })
  };
  const falsos = servicosFalsos(mapa, { em: servicos });
  const gemini = fetchImpl || provedorGeminiFalso(roteiro);
  const configPortal = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: MATERIAL, ...env });
  const modulo = { caminho: 'routes/portal/ia.js', fatia: 'F6b', importar: async () => ({ default: ctx => IA.montarComDeps(ctx, { fetchImpl: gemini, carregarRag, ...extras }) }) };
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: MATERIAL, exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: [modulo], configPortal, falharCedo: true, log: silencioso
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(E.criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  return { api: cliente(base), server, banco, servicos, falsos, gemini, cons, abertos };
}

async function configurar(banco, { ligado = true, chave = CHAVE, limites = {}, material = MATERIAL } = {}) {
  const cifra = criarCripto({ material });
  await banco.collection('configuracoes').deleteMany({ _id: 'assistente_ia' });
  await banco.collection('configuracoes').insertOne({
    _id: 'assistente_ia', ligado, modelo: 'gemini-2.5-flash',
    chave: chave ? { cifrado: cifra.cifrar(chave, 'gemini-api-key', IA.AAD_CHAVE), final4: chave.slice(-4), salvaEm: new Date(), salvaPor: IDS['u-admin'] } : null,
    limites: { ...IA.LIMITES_PADRAO, ...limites }, ultimoTeste: null, ultimoErro: null, versao: 1
  });
}

async function aceitar(api, usuario = 'u-aluno1') {
  const e = await api.get('/api/portal/me/ia/estado', { usuario });
  const r = await api.post('/api/portal/me/ia/consentimento', { aceito: true, versaoTexto: 'v1', textoSha256: T.sha256Texto(e.corpo.consentimento.texto) }, { usuario });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
}

const chamadasGerar = gemini => gemini.chamadas.filter(c => c.metodo === 'POST' && /:generateContent$/.test(c.url));

// =============================================================
describe('estado honesto e pré-condições', () => {
  let ctx;
  before(async () => { ctx = await subirIa(); });
  after(() => fechar(ctx.server));

  test('sem login → 401; desligado → ia-desligada com consentimento literal, saudação e 4 sugestões', async () => {
    assert.equal((await ctx.api.get('/api/portal/me/ia/estado')).status, 401);
    const r = await ctx.api.get('/api/portal/me/ia/estado', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.corpo.disponivel, false);
    assert.equal(r.corpo.motivo, 'ia-desligada');
    assert.equal(r.corpo.saudacao, 'Olá, Aluna.');
    await ctx.banco.collection('perfis').insertOne({ userId: IDS['u-aluno2'], nomeSocial: 'Duda Social' });
    assert.equal((await ctx.api.get('/api/portal/me/ia/estado', { usuario: 'u-aluno2' })).corpo.saudacao, 'Olá, Duda.', 'nome social primeiro');
    assert.equal(r.corpo.sugestoes.length, 4);
    assert.equal(r.corpo.consentimento.necessario, true);
    assert.equal(r.corpo.consentimento.versaoTexto, 'v1');
    const texto = r.corpo.consentimento.texto;
    for (const trecho of ['situação financeira', 'pendências de documentos e contratos', 'registro técnico', 'cópia anexada fica com o atendimento', '180 dias', '730 dias', 'não presta orientação jurídica']) {
      assert.ok(texto.includes(trecho), trecho);
    }
    assert.equal(texto, T.textoConsentimentoV1({ conversasIaDias: 180, trilhaIaDias: 730 }));
    assert.match(r.corpo.aviso, /imprecisões/);
    assert.equal(r.corpo.limites.caracteresPorMensagem, 2000);
  });

  test('ligado sem chave → ia-sem-chave; chave cifrada com outro material → chave-ilegivel; sem vínculo → sem-curso', async () => {
    await configurar(ctx.banco, { chave: null });
    assert.equal((await ctx.api.get('/api/portal/me/ia/estado', { usuario: 'u-aluno1' })).corpo.motivo, 'ia-sem-chave');
    await configurar(ctx.banco, { material: 'outro-material' });
    assert.equal((await ctx.api.get('/api/portal/me/ia/estado', { usuario: 'u-aluno1' })).corpo.motivo, 'chave-ilegivel');
    const p = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'oi' }, { usuario: 'u-aluno1' });
    assert.equal(p.status, 503);
    assert.equal(p.corpo.codigo, 'chave-ilegivel');
    await configurar(ctx.banco);
    const r = await ctx.api.get('/api/portal/me/ia/estado', { usuario: 'u-intruso' });
    assert.equal(r.corpo.motivo, 'sem-curso');
    const s = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'oi' }, { usuario: 'u-intruso' });
    assert.equal(s.status, 403);
    assert.equal(s.corpo.codigo, 'ia-sem-curso');
    const ok = await ctx.api.get('/api/portal/me/ia/estado', { usuario: 'u-aluno1' });
    assert.equal(ok.corpo.disponivel, true);
    assert.equal(ok.corpo.motivo, null);
  });

  test('sem consentimento → 428 com finalidade; nada vai ao provedor', async () => {
    await configurar(ctx.banco);
    const r = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'Como está o meu desempenho?' }, { usuario: 'u-aluno1' });
    assert.equal(r.status, 428);
    assert.equal(r.corpo.codigo, 'consentimento-necessario');
    assert.equal(r.corpo.finalidade, 'assistente_ia');
    assert.equal(chamadasGerar(ctx.gemini).length, 0);
  });

  test('consentimento: só por consentimentos.registrar; sha divergente → 409 sem gravar; certo → 201 com via ia', async () => {
    const e = await ctx.api.get('/api/portal/me/ia/estado', { usuario: 'u-aluno2' });
    const errado = await ctx.api.post('/api/portal/me/ia/consentimento', { aceito: true, versaoTexto: 'v1', textoSha256: 'a'.repeat(64) }, { usuario: 'u-aluno2' });
    assert.equal(errado.status, 409);
    assert.equal(errado.corpo.codigo, 'conflito-versao');
    assert.equal((ctx.falsos.chamadas['consentimentos.registrar'] || []).length, 0);
    const sha = T.sha256Texto(e.corpo.consentimento.texto);
    const ok = await ctx.api.post('/api/portal/me/ia/consentimento', { aceito: true, versaoTexto: 'v1', textoSha256: sha }, { usuario: 'u-aluno2' });
    assert.equal(ok.status, 201);
    assert.equal(ok.corpo.finalidade, 'assistente_ia');
    const [args] = ctx.falsos.chamadas['consentimentos.registrar'].at(-1);
    assert.equal(args.userId, IDS['u-aluno2']);
    assert.equal(args.finalidade, 'assistente_ia');
    assert.equal(args.via, 'ia');
    assert.equal(args.versaoTexto, 'v1');
    assert.equal(args.textoSha256, sha);
    const depois = await ctx.api.get('/api/portal/me/ia/estado', { usuario: 'u-aluno2' });
    assert.equal(depois.corpo.consentimento.necessario, false);
    const sem = await ctx.api.post('/api/portal/me/ia/consentimento', { aceito: false, versaoTexto: 'v1' }, { usuario: 'u-aluno2' });
    assert.equal(sem.status, 400);
  });
});

describe('serviço de consentimento ausente → 503 (nunca segue sem conferir)', () => {
  let ctx;
  before(async () => { ctx = await subirIa({ semConsentimentoSrv: true }); await configurar(ctx.banco); });
  after(() => fechar(ctx.server));
  test('aceite e mensagem → 503 servico-indisponivel; estado avisa', async () => {
    const a = await ctx.api.post('/api/portal/me/ia/consentimento', { aceito: true, versaoTexto: 'v1' }, { usuario: 'u-aluno1' });
    assert.equal(a.status, 503);
    assert.equal(a.corpo.codigo, 'servico-indisponivel');
    const m = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'oi' }, { usuario: 'u-aluno1' });
    assert.equal(m.status, 503);
    assert.equal(m.corpo.codigo, 'servico-indisponivel');
    const e = await ctx.api.get('/api/portal/me/ia/estado', { usuario: 'u-aluno1' });
    assert.equal(e.corpo.consentimento.registroIndisponivel, true);
    const rv = await ctx.api.post('/api/portal/me/ia/consentimento/revogar', { apagarHistorico: true }, { usuario: 'u-aluno1' });
    assert.equal(rv.status, 503);
  });
});

describe('conversa com o Gemini falso', () => {
  test('cabeçalho x-goog-api-key, URL sem key=, instrução literal, 10 ferramentas, AUTO, CPF mascarado, sem e-mail do perfil', async () => {
    const ctx = await subirIa({ roteiro: [{ texto: 'Seu progresso está nas telas do portal.' }] });
    try {
      await configurar(ctx.banco);
      await aceitar(ctx.api);
      const r = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: `Meu CPF é ${CPF_ALUNO}, como estou?` }, { usuario: 'u-aluno1' });
      assert.equal(r.status, 201, JSON.stringify(r.corpo));
      const [ch] = chamadasGerar(ctx.gemini);
      const u = new URL(ch.url);
      assert.equal(u.host, 'generativelanguage.googleapis.com');
      assert.equal(u.pathname, '/v1beta/models/gemini-2.5-flash:generateContent');
      assert.equal(u.search, '');
      assert.ok(!ch.url.includes('key='));
      assert.equal(ch.headers['x-goog-api-key'], CHAVE);
      const corpo = ch.corpo;
      assert.ok(corpo.systemInstruction.parts[0].text.startsWith(T.INSTRUCAO_V1));
      for (const clausula of ['1. Escopo.', '2. Fora do escopo.', T.FRASE_FORA_DO_ESCOPO, '3. Sem orientação jurídica.', T.FRASE_SEM_ORIENTACAO_JURIDICA, 'disponivel:false', '5. Decisões acadêmicas.', '6. Fontes.', '7. Segurança.', '8. Formato.']) {
        assert.ok(corpo.systemInstruction.parts[0].text.replace(/\s+/g, ' ').includes(clausula), clausula);
      }
      assert.equal(corpo.tools[0].functionDeclarations.length, 10);
      assert.deepEqual(corpo.tools[0].functionDeclarations.map(d => d.name), F.NOMES_FERRAMENTAS);
      assert.equal(corpo.toolConfig.functionCallingConfig.mode, 'AUTO');
      assert.equal(corpo.generationConfig.temperature, 0.2);
      assert.equal(corpo.generationConfig.thinkingConfig.thinkingBudget, 0);
      const bruto = JSON.stringify(corpo);
      assert.ok(!bruto.includes('529.982.247-25') && !bruto.includes('52998224725'), 'CPF não vai ao provedor');
      assert.ok(bruto.includes('[CPF]'));
      assert.ok(!bruto.includes('aluno1@exemplo.invalid'), 'e-mail do perfil não vai ao provedor');
      // resposta e gravação
      const [aluno, assistente] = r.corpo.mensagens;
      assert.equal(aluno.mascarado, true);
      assert.ok(aluno.texto.includes('[CPF]'));
      assert.equal(assistente.papel, 'assistente');
      assert.equal(assistente.versaoInstrucao, 'ia-v1');
      const conv = await ctx.banco.collection('conversas_ia').findOne({ userId: IDS['u-aluno1'] });
      assert.ok(!JSON.stringify(conv).includes('529.982.247-25'));
      assert.equal(conv.expiraEm.getTime() - conv.criadaEm.getTime(), 180 * 24 * 3600 * 1000);
      const trilha = await ctx.banco.collection('ia_trilha').find({}).toArray();
      assert.equal(trilha.length, 1);
      assert.equal(trilha[0].versaoInstrucao, 'ia-v1');
      assert.match(trilha[0].sha256Resposta, /^[a-f0-9]{64}$/);
      const tTxt = JSON.stringify(trilha[0]);
      assert.ok(!tTxt.includes('progresso está') && !tTxt.includes('como estou'), 'trilha sem texto');
      assert.equal(trilha[0].expiraEm.getTime() - trilha[0].em.getTime(), 730 * 24 * 3600 * 1000);
      // lista e leitura
      const l = await ctx.api.get('/api/portal/me/ia/conversas', { usuario: 'u-aluno1' });
      assert.equal(l.corpo.itens.length, 1);
      const g = await ctx.api.get(`/api/portal/me/ia/conversas/${r.corpo.conversa.id}`, { usuario: 'u-aluno1' });
      assert.equal(g.corpo.mensagens.length, 2);
      // IDOR: outro aluno → 404; id inválido → 404
      assert.equal((await ctx.api.get(`/api/portal/me/ia/conversas/${r.corpo.conversa.id}`, { usuario: 'u-aluno2' })).status, 404);
      assert.equal((await ctx.api.get('/api/portal/me/ia/conversas/xyz', { usuario: 'u-aluno1' })).status, 404);
      // continuação
      const c2 = await ctx.api.post(`/api/portal/me/ia/conversas/${r.corpo.conversa.id}/mensagens`, { mensagem: 'E agora?' }, { usuario: 'u-aluno1' });
      assert.equal(c2.status, 200);
      const ch2 = chamadasGerar(ctx.gemini).at(-1);
      assert.equal(ch2.corpo.contents.length, 3, 'histórico + pergunta nova');
      // validação
      assert.equal((await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: { $gt: '' } }, { usuario: 'u-aluno1' })).status, 400);
      assert.equal((await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'x'.repeat(2001) }, { usuario: 'u-aluno1' })).status, 400);
    } finally { await fechar(ctx.server); }
  });

  test('functionCall: userId da sessão, thoughtSignature intacta, saída só com campos enumerados e mascarada, ações do servidor', async () => {
    const ctx = await subirIa({
      roteiro: [
        { functionCall: { name: 'meus_documentos_pendentes', args: { userId: IDS['u-aluno2'] } }, thoughtSignature: 'assinatura-xyz' },
        { texto: 'Você tem um documento pendente. Veja em https://exemplo.invalid/x' }
      ]
    });
    try {
      await configurar(ctx.banco);
      await aceitar(ctx.api);
      const r = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'Tenho documentos pendentes?' }, { usuario: 'u-aluno1' });
      assert.equal(r.status, 201, JSON.stringify(r.corpo));
      const chamadaSrv = ctx.falsos.chamadas['secretaria.pendenciasDoAluno'];
      assert.equal(chamadaSrv.length, 1);
      assert.equal(chamadaSrv[0][0], IDS['u-aluno1'], 'userId vem da sessão, nunca dos args');
      const [, segunda] = chamadasGerar(ctx.gemini);
      const conteudos = segunda.corpo.contents;
      const modelo = conteudos.find(c => c.role === 'model');
      assert.equal(modelo.parts[0].thoughtSignature, 'assinatura-xyz');
      const resposta = conteudos.at(-1).parts[0].functionResponse;
      assert.equal(resposta.name, 'meus_documentos_pendentes');
      assert.deepEqual(Object.keys(resposta.response.itens[0]).sort(), ['nome', 'sigla', 'statusRotulo']);
      const bruto = JSON.stringify(segunda.corpo);
      assert.ok(!bruto.includes('12.345.678') && !bruto.includes('ilegível') && !bruto.includes('fulano@'), 'motivo e RG não saem');
      const assistente = r.corpo.mensagens[1];
      assert.deepEqual(assistente.ferramentasUsadas, ['meus_documentos_pendentes']);
      assert.deepEqual(assistente.acoes, [{ rotulo: 'Abrir Documentos', href: 'documentos.html' }]);
      assert.ok(!assistente.acoes.some(a => a.href.includes('exemplo.invalid')), 'URL do texto não vira ação');
    } finally { await fechar(ctx.server); }
  });

  test('cursoId alheio → curso_nao_encontrado; 3 rodadas → 4ª chamada com mode NONE', async () => {
    const roteiro = [
      { functionCall: { name: 'minhas_notas_e_situacao', args: { cursoId: 'curso-02' } } },
      { functionCall: { name: 'minha_frequencia', args: {} } },
      { functionCall: { name: 'meus_cursos_e_progresso', args: {} } },
      { texto: 'Pronto.' }
    ];
    const ctx = await subirIa({ roteiro });
    try {
      await configurar(ctx.banco);
      await aceitar(ctx.api);
      const r = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'Minhas notas?' }, { usuario: 'u-aluno1' });
      assert.equal(r.status, 201, JSON.stringify(r.corpo));
      const ch = chamadasGerar(ctx.gemini);
      assert.equal(ch.length, 4);
      const resp1 = ch[1].corpo.contents.at(-1).parts[0].functionResponse.response;
      assert.deepEqual(resp1, { erro: 'curso_nao_encontrado' });
      assert.equal(ch[2].corpo.toolConfig.functionCallingConfig.mode, 'AUTO');
      assert.equal(ch[3].corpo.toolConfig.functionCallingConfig.mode, 'NONE');
      const assistente = r.corpo.mensagens[1];
      assert.equal(assistente.texto, 'Pronto.');
      assert.deepEqual(assistente.ferramentasUsadas, ['minhas_notas_e_situacao', 'minha_frequencia', 'meus_cursos_e_progresso']);
      assert.deepEqual(assistente.acoes.map(a => a.href), ['academico.html', 'meus-cursos.html']);
    } finally { await fechar(ctx.server); }
  });

  test('ferramenta sem serviço → disponivel:false; SAFETY → bloqueada', async () => {
    const ctx = await subirIa({
      comDominio: false,
      roteiro: [{ functionCall: { name: 'meus_lancamentos_em_aberto', args: {} } }, { texto: 'Indisponível.' }, { finishReason: 'SAFETY' }]
    });
    try {
      await configurar(ctx.banco);
      await aceitar(ctx.api);
      const r = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'Financeiro?' }, { usuario: 'u-aluno1' });
      const ch = chamadasGerar(ctx.gemini);
      assert.deepEqual(ch[1].corpo.contents.at(-1).parts[0].functionResponse.response, { disponivel: false });
      assert.deepEqual(r.corpo.mensagens[1].acoes, [], 'sem ok, sem ação');
      const b = await ctx.api.post(`/api/portal/me/ia/conversas/${r.corpo.conversa.id}/mensagens`, { mensagem: 'outra' }, { usuario: 'u-aluno1' });
      assert.equal(b.status, 200);
      assert.equal(b.corpo.mensagens[1].bloqueada, true);
    } finally { await fechar(ctx.server); }
  });

  test('429 do provedor → 429 ia-sobrecarregada e nada gravado; tempo esgotado → 503', async () => {
    const ctx = await subirIa({ roteiro: [{ status: 429, json: { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } } }] });
    try {
      await configurar(ctx.banco);
      await aceitar(ctx.api);
      const r = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'oi' }, { usuario: 'u-aluno1' });
      assert.equal(r.status, 429);
      assert.equal(r.corpo.codigo, 'ia-sobrecarregada');
      assert.equal(await ctx.banco.collection('conversas_ia').countDocuments({}), 0);
      assert.equal(await ctx.banco.collection('ia_trilha').countDocuments({}), 0);
      const uso = await ctx.banco.collection('ia_uso_diario').find({}).toArray();
      assert.equal(uso[0]?.mensagens ?? 0, 0, 'teto devolvido');
    } finally { await fechar(ctx.server); }

    const lento = await subirIa({ fetchImpl: fetchFalso('nunca'), env: { PORTAL_IA_TIMEOUT_MS: '1000' } });
    try {
      await configurar(lento.banco);
      await aceitar(lento.api);
      const r = await lento.api.post('/api/portal/me/ia/conversas', { mensagem: 'oi' }, { usuario: 'u-aluno1' });
      assert.equal(r.status, 503);
      assert.equal(r.corpo.codigo, 'ia-tempo-esgotado');
      assert.equal(await lento.banco.collection('conversas_ia').countDocuments({}), 0);
    } finally { await fechar(lento.server); }
  });

  test('limite por hora → 429 com Retry-After; teto global → 503 e auditoria 1× no dia', async () => {
    const ctx = await subirIa();
    try {
      await configurar(ctx.banco, { limites: { mensagensPorHora: 1, mensagensGlobaisPorDia: 2 } });
      await aceitar(ctx.api, 'u-aluno1');
      await aceitar(ctx.api, 'u-aluno2');
      assert.equal((await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'um' }, { usuario: 'u-aluno1' })).status, 201);
      const lim = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'dois' }, { usuario: 'u-aluno1' });
      assert.equal(lim.status, 429);
      assert.equal(lim.corpo.codigo, 'limite');
      assert.ok(Number(lim.headers.get('retry-after')) > 0);
      assert.equal((await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'tres' }, { usuario: 'u-aluno2' })).status, 201);
      await ctx.banco.collection('limites').deleteMany({});
      for (const u of ['u-aluno1', 'u-aluno2']) {
        const t = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'quatro' }, { usuario: u });
        assert.equal(t.status, 503);
        assert.equal(t.corpo.codigo, 'ia-indisponivel');
      }
      const aud = await ctx.banco.collection('auditoria').find({ acao: 'ia.teto_global_atingido' }).toArray();
      assert.equal(aud.length, 1);
      const e = await ctx.api.get('/api/portal/me/ia/estado', { usuario: 'u-aluno1' });
      assert.equal(e.corpo.motivo, 'teto-global');
    } finally { await fechar(ctx.server); }
  });
});

describe('trilha no mesmo fluxo', () => {
  test('falha ao gravar a trilha → 503 ia-indisponivel e nada gravado (nem conversa)', async () => {
    const ctx = await subirIa();
    try {
      await configurar(ctx.banco);
      await aceitar(ctx.api);
      ctx.banco.falhar.insertOne = 'ia_trilha';
      const r = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'oi' }, { usuario: 'u-aluno1' });
      assert.equal(r.status, 503);
      assert.equal(r.corpo.codigo, 'ia-indisponivel');
      ctx.banco.falhar.insertOne = false;
      assert.equal(await ctx.banco.collection('conversas_ia').countDocuments({}), 0);
      assert.equal(await ctx.banco.collection('ia_trilha').countDocuments({}), 0);
      const uso = await ctx.banco.collection('ia_uso_diario').find({}).toArray();
      assert.equal(uso[0]?.mensagens ?? 0, 0, 'teto devolvido');
    } finally { await fechar(ctx.server); }
  });
});

describe('regulamento (RAG) e fontes com regulamentoId (D-81)', () => {
  test('mesmo trechoId no geral e no curso → duas fontes distintas na mensagem e na trilha; texto mascarado', async () => {
    const ctx = await subirIa({ roteiro: [{ functionCall: { name: 'buscar_regulamento', args: { consulta: 'frequência mínima' } } }, { texto: 'Segundo o trecho Frequência, ...' }] });
    try {
      await configurar(ctx.banco);
      await aceitar(ctx.api);
      const reg = ctx.banco.collection('regulamentos');
      const g = await reg.insertOne({ escopo: 'geral', titulo: 'Geral', edicao: 1, status: 'publicado', trechos: [{ id: 'e1-t001', titulo: 'Frequência', texto: 'Frequência mínima de 75%. Dúvidas: secretaria@exemplo.invalid', inicio: 0, fim: 10 }] });
      const c = await reg.insertOne({ escopo: 'curso-01', titulo: 'Curso', edicao: 1, status: 'publicado', trechos: [{ id: 'e1-t001', titulo: 'Avaliação do curso', texto: 'Nota mínima 7.', inicio: 0, fim: 10 }] });
      await reg.insertOne({ escopo: 'curso-02', titulo: 'Outro curso', edicao: 1, status: 'publicado', trechos: [{ id: 'e1-t009', titulo: 'Alheio', texto: 'Não deve aparecer.', inicio: 0, fim: 5 }] });
      const r = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'Qual a frequência mínima?' }, { usuario: 'u-aluno1' });
      assert.equal(r.status, 201, JSON.stringify(r.corpo));
      const fontes = r.corpo.mensagens[1].fontes;
      assert.deepEqual(fontes.map(f => f.regulamentoId).sort(), [String(g.insertedId), String(c.insertedId)].sort());
      assert.ok(fontes.every(f => f.trechoId === 'e1-t001'));
      const trilha = await ctx.banco.collection('ia_trilha').findOne({});
      assert.equal(trilha.fontes.length, 2);
      const bruto = JSON.stringify(chamadasGerar(ctx.gemini));
      assert.ok(!bruto.includes('secretaria@exemplo.invalid'), 'e-mail do regulamento mascarado');
      assert.ok(!bruto.includes('Não deve aparecer'), 'regulamento de curso alheio fora');
    } finally { await fechar(ctx.server); }
  });

  test('sem rag.js (F6a) → buscar_regulamento devolve disponivel:false', async () => {
    const ctx = await subirIa({ carregarRag: async () => null, roteiro: [{ functionCall: { name: 'buscar_regulamento', args: { consulta: 'x' } } }, { texto: 'ok' }] });
    try {
      await configurar(ctx.banco);
      await aceitar(ctx.api);
      await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'regras?' }, { usuario: 'u-aluno1' });
      const ch = chamadasGerar(ctx.gemini);
      assert.deepEqual(ch[1].corpo.contents.at(-1).parts[0].functionResponse.response, { disponivel: false });
    } finally { await fechar(ctx.server); }
  });
});

describe('escalonamento, apagar e revogar', () => {
  test('prévia por fila, escalar sem anexo, 2× → 409, privacidade → 400; professores omitem pares sensíveis', async () => {
    const ctx = await subirIa({
      roteiro: [
        { functionCall: { name: 'meus_lancamentos_em_aberto', args: {} } }, { texto: 'Há uma parcela em aberto.' },
        { texto: 'Sobre o módulo 1, a situação é Em recuperação.' }
      ]
    });
    try {
      await configurar(ctx.banco);
      await aceitar(ctx.api);
      const r = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'Tenho parcelas?' }, { usuario: 'u-aluno1' });
      const id = r.corpo.conversa.id;
      await ctx.api.post(`/api/portal/me/ia/conversas/${id}/mensagens`, { mensagem: 'E o módulo 1?' }, { usuario: 'u-aluno1' });
      const p0 = await ctx.api.get(`/api/portal/me/ia/conversas/${id}/escalonamento`, { usuario: 'u-aluno1' });
      assert.equal(p0.status, 200);
      assert.equal(p0.corpo.categoriaSugerida, 'financeiro');
      assert.equal(p0.corpo.filaPrevista, 'coordenacao');
      assert.equal(p0.corpo.omitiriaMensagens, 0);
      const p1 = await ctx.api.get(`/api/portal/me/ia/conversas/${id}/escalonamento?categoria=academico&cursoId=curso-01`, { usuario: 'u-aluno1' });
      assert.equal(p1.corpo.filaPrevista, 'professores_do_curso');
      assert.equal(p1.corpo.omitiriaMensagens, 1);
      assert.ok(!p1.corpo.resumoSugerido.includes('parcelas'), 'resumo sugerido já sem o par financeiro');
      const p2 = await ctx.api.get(`/api/portal/me/ia/conversas/${id}/escalonamento?categoria=financeiro&cursoId=curso-01`, { usuario: 'u-aluno1' });
      assert.equal(p2.corpo.filaPrevista, 'coordenacao');
      assert.equal((await ctx.api.get(`/api/portal/me/ia/conversas/${id}/escalonamento?categoria=privacidade`, { usuario: 'u-aluno1' })).status, 400);
      assert.equal((await ctx.api.get(`/api/portal/me/ia/conversas/${id}/escalonamento?cursoId=curso-02`, { usuario: 'u-aluno1' })).status, 400);

      const priv = await ctx.api.post(`/api/portal/me/ia/conversas/${id}/escalar`, { categoria: 'privacidade', assunto: 'Meus dados', resumo: 'Quero meus dados.' }, { usuario: 'u-aluno1' });
      assert.equal(priv.status, 400);
      const esc = await ctx.api.post(`/api/portal/me/ia/conversas/${id}/escalar`, { categoria: 'academico', cursoId: 'curso-01', assunto: 'Módulo 1', resumo: 'Quero entender a situação do módulo 1.', incluirConversa: true }, { usuario: 'u-aluno1' });
      assert.equal(esc.status, 201, JSON.stringify(esc.corpo));
      assert.equal(esc.corpo.anexo.omitidas, 1);
      assert.equal(esc.corpo.anexo.incluidas, 2);
      const dados = ctx.abertos[0];
      assert.equal(dados.origem, 'ia');
      assert.equal(dados.userId, IDS['u-aluno1']);
      assert.ok(!JSON.stringify(dados.anexoConversa).includes('parcela'));
      const dup = await ctx.api.post(`/api/portal/me/ia/conversas/${id}/escalar`, { categoria: 'academico', assunto: 'De novo', resumo: 'Outra vez o mesmo pedido.' }, { usuario: 'u-aluno1' });
      assert.equal(dup.status, 409);
      assert.equal(dup.corpo.codigo, 'ja-escalada');
      assert.equal(dup.corpo.protocolo, esc.corpo.protocolo);
      const trilha = await ctx.banco.collection('ia_trilha').find({}).toArray();
      assert.ok(trilha.every(t => t.escalonada === true));
    } finally { await fechar(ctx.server); }
  });

  test('escalar sem anexo (padrão) e sem serviço de atendimento → 503', async () => {
    const ctx = await subirIa({ semAtendimento: true });
    try {
      await configurar(ctx.banco);
      await aceitar(ctx.api);
      const r = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'oi' }, { usuario: 'u-aluno1' });
      const e = await ctx.api.post(`/api/portal/me/ia/conversas/${r.corpo.conversa.id}/escalar`, { categoria: 'tecnico', assunto: 'Acesso', resumo: 'Não consigo abrir a aula.' }, { usuario: 'u-aluno1' });
      assert.equal(e.status, 503);
      assert.equal(e.corpo.codigo, 'servico-indisponivel');
    } finally { await fechar(ctx.server); }
    const ok = await subirIa();
    try {
      await configurar(ok.banco);
      await aceitar(ok.api);
      const r = await ok.api.post('/api/portal/me/ia/conversas', { mensagem: 'oi' }, { usuario: 'u-aluno1' });
      const e = await ok.api.post(`/api/portal/me/ia/conversas/${r.corpo.conversa.id}/escalar`, { categoria: 'tecnico', assunto: 'Acesso', resumo: 'Não consigo abrir a aula.' }, { usuario: 'u-aluno1' });
      assert.equal(e.status, 201);
      assert.equal(e.corpo.anexo, null);
      assert.equal(ok.abertos[0].anexoConversa, null);
    } finally { await fechar(ok.server); }
  });

  test('apagar conversa e tudo: auditoria sem conteúdo; trilha sobrevive; revogar com apagarHistorico via serviço', async () => {
    const ctx = await subirIa();
    try {
      await configurar(ctx.banco);
      await aceitar(ctx.api);
      const a = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'pergunta secreta um' }, { usuario: 'u-aluno1' });
      await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'pergunta secreta dois' }, { usuario: 'u-aluno1' });
      await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'pergunta secreta tres' }, { usuario: 'u-aluno1' });
      assert.equal((await ctx.api.del(`/api/portal/me/ia/conversas/${a.corpo.conversa.id}`, { usuario: 'u-aluno2' })).status, 404);
      assert.equal((await ctx.api.del(`/api/portal/me/ia/conversas/${a.corpo.conversa.id}`, { usuario: 'u-aluno1' })).status, 200);
      const tudo = await ctx.api.del('/api/portal/me/ia/conversas', { usuario: 'u-aluno1' });
      assert.equal(tudo.corpo.apagadas, 2);
      const aud = await ctx.banco.collection('auditoria').find({ acao: 'ia.conversa_apagada' }).toArray();
      assert.equal(aud.length, 2);
      assert.ok(!JSON.stringify(aud).includes('secreta'));
      assert.equal(await ctx.banco.collection('ia_trilha').countDocuments({}), 3);
      await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'mais uma' }, { usuario: 'u-aluno1' });
      // exportador (Meus dados) e painel da coordenação
      const exp = ctx.servicos.todos('exportador').find(d => d.dominio === 'conversasIa');
      const dados = await exp.exportar(IDS['u-aluno1']);
      assert.equal(dados.conversas.length, 1);
      assert.equal(dados.conversas[0].mensagens[0].texto, 'mais uma');
      const painel = ctx.servicos.todos('painel').find(d => d.bloco === 'ia');
      const kpis = await painel.contar();
      assert.deepEqual(Object.keys(kpis).sort(), ['chaveLegivel', 'escalonadas7d', 'ligado', 'mensagens7d', 'tetoGlobalAtingidoHoje']);
      assert.equal(kpis.ligado, true);
      const revogar = ctx.servicos.obter('ia.revogarConsentimento');
      const r = await revogar(IDS['u-aluno1'], { apagarHistorico: true });
      assert.equal(r.apagadas, 1);
      assert.equal(await ctx.banco.collection('ia_trilha').countDocuments({}), 4);
      assert.equal(ctx.cons.reg.has(IDS['u-aluno1']), false);
      assert.equal((await ctx.api.post('/api/portal/me/ia/consentimento/revogar', {}, { usuario: 'u-aluno1' })).status, 404);
      assert.equal(await ctx.servicos.obter('ia.disponivel')(), true);
    } finally { await fechar(ctx.server); }
  });
});

describe('consentimento acompanha os prazos de guarda do texto aceito (LGPD art. 8º §6º e art. 9º II)', () => {
  const DIA = 24 * 60 * 60 * 1000;
  const diasEntre = (a, b) => Math.round((b.getTime() - a.getTime()) / DIA);
  const estado = (api, usuario = 'u-aluno1') => api.get('/api/portal/me/ia/estado', { usuario });

  test('prazo aumentado depois do aceite → aceite antigo não vale: necessario, textoAlterado, 428 sem ir ao Google; novo aceite → prazos novos', async () => {
    const prazos = { conversasIaDias: 180, notificacoesDias: 90, trilhaIaDias: 730 };
    const ctx = await subirIa({ retencao: async () => ({ ...prazos }) });
    try {
      await configurar(ctx.banco);
      await aceitar(ctx.api);
      const antes = await estado(ctx.api);
      assert.equal(antes.corpo.consentimento.necessario, false);
      assert.equal(antes.corpo.consentimento.textoAlterado, undefined);
      const shaAceito = ctx.cons.reg.get(IDS['u-aluno1']).textoSha256;

      Object.assign(prazos, { conversasIaDias: 730, trilhaIaDias: 1825 });
      const e = await estado(ctx.api);
      assert.equal(e.corpo.retencaoDias, 730);
      assert.match(e.corpo.consentimento.texto, /guardadas por 730 dias/);
      assert.notEqual(T.sha256Texto(e.corpo.consentimento.texto), shaAceito);
      assert.equal(e.corpo.consentimento.necessario, true, 'texto com prazo maior que o aceito exige novo aceite');
      assert.equal(e.corpo.consentimento.textoAlterado, true, 'a tela avisa que o texto mudou desde o aceite');
      assert.equal(e.corpo.consentimento.em, undefined);

      const m = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'Como está o meu desempenho?' }, { usuario: 'u-aluno1' });
      assert.equal(m.status, 428, JSON.stringify(m.corpo));
      assert.equal(m.corpo.codigo, 'consentimento-necessario');
      assert.equal(m.corpo.finalidade, 'assistente_ia');
      assert.equal(chamadasGerar(ctx.gemini).length, 0, 'nada vai ao provedor com aceite de outro texto');
      assert.equal(await ctx.banco.collection('conversas_ia').countDocuments({}), 0);
      assert.equal(await ctx.banco.collection('ia_trilha').countDocuments({}), 0);

      await aceitar(ctx.api);
      const depois = await estado(ctx.api);
      assert.equal(depois.corpo.consentimento.necessario, false);
      assert.equal(depois.corpo.consentimento.textoAlterado, undefined);
      const ok = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'Como está o meu desempenho?' }, { usuario: 'u-aluno1' });
      assert.equal(ok.status, 201, JSON.stringify(ok.corpo));
      const conv = await ctx.banco.collection('conversas_ia').findOne({ userId: IDS['u-aluno1'] });
      assert.equal(diasEntre(conv.atualizadaEm, conv.expiraEm), 730);
      const tr = await ctx.banco.collection('ia_trilha').findOne({ userId: IDS['u-aluno1'] });
      assert.equal(diasEntre(tr.em, tr.expiraEm), 1825);
    } finally { await fechar(ctx.server); }
  });

  test('prazo reduzido também muda o texto → novo aceite; aceite gravado sem sha não vale; revogar segue possível', async () => {
    const prazos = { conversasIaDias: 180, notificacoesDias: 90, trilhaIaDias: 730 };
    const ctx = await subirIa({ retencao: async () => ({ ...prazos }) });
    try {
      await configurar(ctx.banco);
      await aceitar(ctx.api);
      Object.assign(prazos, { conversasIaDias: 90, trilhaIaDias: 365 });
      const e = await estado(ctx.api);
      assert.equal(e.corpo.consentimento.necessario, true);
      assert.equal(e.corpo.consentimento.textoAlterado, true);
      ctx.cons.reg.set(IDS['u-aluno2'], { versaoTexto: 'v1', textoSha256: null, em: new Date() });
      const semSha = await estado(ctx.api, 'u-aluno2');
      assert.equal(semSha.corpo.consentimento.necessario, true, 'aceite sem o sha do texto lido não comprova o que foi aceito');
      ctx.cons.reg.set(IDS['u-aluno2'], { versaoTexto: 'v0', textoSha256: T.sha256Texto(e.corpo.consentimento.texto), em: new Date() });
      assert.equal((await estado(ctx.api, 'u-aluno2')).corpo.consentimento.necessario, true, 'versão diferente continua exigindo aceite');
      const rv = await ctx.api.post('/api/portal/me/ia/consentimento/revogar', { apagarHistorico: true }, { usuario: 'u-aluno1' });
      assert.equal(rv.status, 200, 'aceite desatualizado ainda pode ser retirado');
    } finally { await fechar(ctx.server); }
  });

  test('prazo alterado durante a resposta do provedor → conversa e trilha gravadas com o prazo do texto conferido', async () => {
    const prazos = { conversasIaDias: 180, notificacoesDias: 90, trilhaIaDias: 730 };
    const gem = provedorGeminiFalso([{ texto: 'Resposta de teste.' }]);
    const fetchImpl = async (url, init) => {
      if (/:generateContent$/.test(String(url))) Object.assign(prazos, { conversasIaDias: 730, trilhaIaDias: 1825 });
      return gem(url, init);
    };
    const ctx = await subirIa({ fetchImpl, retencao: async () => ({ ...prazos }) });
    try {
      await configurar(ctx.banco);
      await aceitar(ctx.api);
      const r = await ctx.api.post('/api/portal/me/ia/conversas', { mensagem: 'Tenho documentos pendentes?' }, { usuario: 'u-aluno1' });
      assert.equal(r.status, 201, JSON.stringify(r.corpo));
      const conv = await ctx.banco.collection('conversas_ia').findOne({ userId: IDS['u-aluno1'] });
      assert.equal(diasEntre(conv.atualizadaEm, conv.expiraEm), 180);
      const tr = await ctx.banco.collection('ia_trilha').findOne({ userId: IDS['u-aluno1'] });
      assert.equal(diasEntre(tr.em, tr.expiraEm), 730);
    } finally { await fechar(ctx.server); }
  });
});

describe('ferramentas (unidade)', () => {
  test('varredura: cada ferramenta devolve só os campos enumerados', async () => {
    const servicos = servicosFalsos(servicosDeDominio());
    servicos.registrar('academico.proximosEncontros', async () => [{ titulo: 'Encontro', cursoTitulo: 'Curso', moduloTitulo: 'M1', inicioEm: new Date('2026-10-20T22:00:00Z'), turmaCodigo: 'APE-2026-01', url: 'https://sala', id: 'x' }]);
    const acesso = { cursosDoAluno: async () => ['curso-01'], temVinculo: async () => true };
    const repo = () => ({ find: () => ({ toArray: async () => [{ _id: 'curso-01', titulo: 'Curso de Teste APE' }] }) });
    const f = F.criarFerramentas({ servicos, acesso, repo, carregarRag: async () => null, log: silencioso });
    const esperado = {
      meus_cursos_e_progresso: ['aulasConcluidas', 'aulasTotal', 'cursoId', 'progressoPct', 'situacaoRotulo', 'titulo'],
      minhas_notas_e_situacao: ['aguardandoCorrecao', 'curso', 'modulo', 'nota', 'notaMinima', 'situacaoRotulo', 'tentativasRestantes'],
      minha_frequencia: ['aoVivoPct', 'curso', 'faltas', 'frequenciaMinima', 'frequenciaPct', 'gravadoPct', 'modulo'],
      meus_documentos_pendentes: ['nome', 'sigla', 'statusRotulo'],
      meus_contratos_pendentes: ['cursoTitulo', 'disponivelEm'],
      meus_lancamentos_em_aberto: ['cursoTitulo', 'rotuloTipo', 'statusRotulo', 'valor', 'vencimento'],
      minhas_proximas_aulas_ao_vivo: ['curso', 'inicioEm', 'modulo', 'titulo', 'turmaCodigo'],
      meus_atendimentos_abertos: ['assunto', 'categoriaRotulo', 'protocolo', 'statusRotulo']
    };
    for (const [nome, campos] of Object.entries(esperado)) {
      const r = await f.executar(nome, {}, { userId: IDS['u-aluno1'], trechos: [] });
      assert.equal(r.ok, true, nome);
      assert.ok(r.resposta.itens.length > 0, nome);
      for (const item of r.resposta.itens) assert.deepEqual(Object.keys(item).sort(), campos, nome);
    }
    const l = await f.executar('meus_lancamentos_em_aberto', {}, { userId: 'u' });
    assert.equal(l.resposta.itens[0].valor, 'R$ 499,00');
    const a = await f.executar('meus_atendimentos_abertos', {}, { userId: 'u' });
    assert.ok(a.resposta.itens[0].assunto.includes('[CPF]'));
    await assert.rejects(() => f.executar('meus_cursos_e_progresso', {}, {}), /userId/);
  });
});
