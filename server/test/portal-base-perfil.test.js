// Portal · F0t — Perfil, consentimentos (serviço `consentimentos.*`, DC-72), CEP pelo
// servidor e Meus dados (PORTAL-API §6.3; casos de §9.3, linha portal-base-perfil).
// Banco em memória + agregador real com os módulos da F0t; ViaCEP e Resend falsos.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso, fetchFalso, gerarCpfValido, jpegComExif, pngMinimo, servicosFalsos } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const { montarPortal, MODULOS_PADRAO } = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');
const { especificacoesRegistradas } = await import('../src/portal/indices.js');
const { criarTratarErroGlobal, tratarErroPortal } = await import('../src/portal/erros.js');
const { criarThrottle } = await import('../src/throttle.js');
const { TEXTOS, textoConsentimento } = await import('../src/portal/consentimentos-textos.js');
const { criarRotaCep } = await import('../src/routes/portal/cep.js');
await import('../src/routes/portal/perfil.js');
await import('../src/routes/portal/meus-dados.js');

const MODULOS_F0T = MODULOS_PADRAO.filter(m => m.fatia === 'F0t');
const ENV_EMAIL = { RESEND_API_KEY: 'chave-falsa', PORTAL_EMAIL_FROM: 'Plataforma <nao-responda@exemplo.invalid>', PORTAL_BASE_URL: 'https://portal.exemplo.invalid' };
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');
const esperar = ms => new Promise(r => setTimeout(r, ms));

async function subirPortal({ env = ENV_EMAIL, prep = async () => {}, falsos = {}, grupos = {}, agora = null } = {}) {
  const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
  await semear(banco);
  await prep(banco);
  const fetchImpl = fetchFalso([{ status: 200, json: { id: 'falso' } }]);
  const servicos = criarServicos();
  servicosFalsos(falsos, { grupos, em: servicos });
  const portal = montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: MODULOS_F0T, configPortal: lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste', ...env }),
    falharCedo: true, log: silencioso, fetchImpl, ...(agora ? { agora } : {})
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(criarTratarErroGlobal({ log: silencioso }));
  const { server, base } = await subir(app);
  const api = cliente(base);
  await api.get('/api/portal/saude');
  return { api, server, banco, fetchImpl, servicos };
}

const PERFIL_BASICO = (cpf) => ({
  versao: 0, nomeRegistro: 'Aluna Um da Silva', cpf: `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`,
  nascimento: '15/03/1990', nacionalidade: 'Brasileira', celular: '(11) 98765-4321',
  endereco: { pais: 'Brasil', cep: '01310-100', logradouro: 'Avenida Paulista', numero: '1000', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'sp' }
});

function semSegredo(corpo) {
  assert.doesNotMatch(JSON.stringify(corpo), /senhaHash|"segredo"|codigosRecuperacao|"dados":\{"type":"Buffer"/);
}

describe('perfil do titular', () => {
  let ctx;
  const cpfA = gerarCpfValido('aluno1');
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('GET sem perfil → campos vazios, versao 0, bases legais e os 5 textos v1 literais (D-55)', async () => {
    const r = await ctx.api.get('/api/portal/me/perfil', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.versao, 0);
    assert.equal(r.corpo.perfil.cpf, null);
    assert.equal(r.corpo.perfil.email, 'aluno1@exemplo.invalid');
    assert.equal(r.corpo.completude.completo, false);
    assert.deepEqual(r.corpo.travados, []);
    assert.equal(r.corpo.basesLegais.genero.visivelPara.join(','), 'Você');
    assert.equal(r.corpo.textosConsentimento.perfil_genero.texto, 'Autorizo o registro do meu gênero para estatísticas agregadas de diversidade da plataforma. A informação aparece só para mim; a coordenação vê apenas totais de grupos com 5 ou mais pessoas, e ela nunca é usada em decisões sobre mim nem mostrada à equipe. Posso retirar a autorização em Meus dados, e a informação é apagada.');
    assert.equal(r.corpo.textosConsentimento.perfil_etnia.texto, 'Autorizo o registro da minha cor ou etnia (classificação do IBGE) para estatísticas agregadas de diversidade da plataforma. A informação aparece só para mim; a coordenação vê apenas totais de grupos com 5 ou mais pessoas, e ela nunca é usada em decisões sobre mim nem mostrada à equipe. Posso retirar a autorização em Meus dados, e a informação é apagada.');
    assert.deepEqual(Object.keys(r.corpo.textosConsentimento).sort(), ['perfil_etnia', 'perfil_foto', 'perfil_genero', 'perfil_nome_social', 'perfil_redes']);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal((await ctx.api.get('/api/portal/me/perfil')).status, 401);
  });

  test('PUT normaliza (CPF, data dd/mm/aaaa, celular, UF), audita mascarado e sincroniza users.nome', async () => {
    const r = await ctx.api.put('/api/portal/me/perfil', PERFIL_BASICO(cpfA), { usuario: 'u-aluno1' });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.perfil.cpf, cpfA);
    assert.equal(r.corpo.perfil.nascimento, '1990-03-15');
    assert.equal(r.corpo.perfil.celular, '+5511987654321');
    assert.equal(r.corpo.perfil.endereco.uf, 'SP');
    assert.equal(r.corpo.perfil.endereco.cep, '01310100');
    assert.equal(r.corpo.versao, 1);
    assert.equal(r.corpo.completude.completo, true);
    assert.ok(r.corpo.travados.includes('cpf'), 'CPF preenchido só muda pela secretaria');
    // Sem secretaria.temContratoAssinado (F4b) a trava não é conferida: os preenchidos ficam travados.
    assert.equal(r.corpo.travaConferida, false);
    assert.deepEqual(r.corpo.travados.sort(), ['cpf', 'nascimento', 'nomeRegistro']);
    const u = await ctx.banco.collection('users').findOne({ _id: oid('u-aluno1') });
    assert.equal(u.nome, 'Aluna Um da Silva');
    const aud = await ctx.banco.collection('auditoria').findOne({ acao: 'perfil.alterado', alvoUserId: IDS['u-aluno1'] });
    assert.equal(aud.estado, 'concluido');
    const mCpf = aud.mudancas.find(m => m.campo === 'cpf');
    assert.deepEqual([mCpf.de, mCpf.para], ['(alterado)', '(alterado)']);
    assert.ok(!JSON.stringify(aud).includes(cpfA));
  });

  test('versão errada → 409 conflito-versao; CPF inválido → 400; objeto em campo de texto → 400 formato-invalido', async () => {
    assert.equal((await ctx.api.put('/api/portal/me/perfil', { versao: 0, celular: '11987654321' }, { usuario: 'u-aluno1' })).corpo.codigo, 'conflito-versao');
    const inv = await ctx.api.put('/api/portal/me/perfil', { versao: 0, cpf: '111.111.111-11' }, { usuario: 'u-aluno2' });
    assert.equal(inv.status, 400);
    assert.ok(inv.corpo.campos.cpf);
    const f = await ctx.api.put('/api/portal/me/perfil', { versao: 0, nomeRegistro: { $gt: '' } }, { usuario: 'u-aluno2' });
    assert.equal(f.status, 400);
    assert.equal(f.corpo.codigo, 'formato-invalido');
    assert.equal((await ctx.api.put('/api/portal/me/perfil', { nomeRegistro: 'Sem Versão' }, { usuario: 'u-aluno2' })).status, 400);
  });

  test('CPF em uso → 409 (sem revelar a conta); 4ª resposta no dia → 429 e auditoria perfil.cpf_conflito sem CPF em claro', async () => {
    const codigos = [];
    for (let i = 0; i < 4; i++) {
      const r = await ctx.api.put('/api/portal/me/perfil', { versao: 0, cpf: cpfA }, { usuario: 'u-aluno2' });
      codigos.push(r.status);
      if (r.status === 409) assert.equal(r.corpo.codigo, 'cpf-em-uso');
    }
    assert.deepEqual(codigos, [409, 409, 409, 429]);
    const auds = await ctx.banco.collection('auditoria').find({ acao: 'perfil.cpf_conflito' }).toArray();
    assert.equal(auds.length, 4);
    assert.ok(auds.every(a => /^[a-f0-9]{64}$/.test(a.extra.cpfHmac) && !JSON.stringify(a).includes(cpfA)));
    const lim = await ctx.banco.collection('limites').find({}).toArray();
    assert.ok(lim.every(l => !l.chave.includes(cpfA)));
  });

  test('gênero sem consentimento → 428 perfil_genero; "prefiro não informar" sem consentimento grava; com aceite no mesmo PUT grava e registra textoSha256', async () => {
    const sem = await ctx.api.put('/api/portal/me/perfil', { versao: 1, genero: 'feminino' }, { usuario: 'u-aluno1' });
    assert.equal(sem.status, 428);
    assert.equal(sem.corpo.codigo, 'consentimento-necessario');
    assert.equal(sem.corpo.finalidade, 'perfil_genero');
    const pni = await ctx.api.put('/api/portal/me/perfil', { versao: 1, genero: 'prefiro_nao_informar' }, { usuario: 'u-aluno1' });
    assert.equal(pni.status, 200);
    const com = await ctx.api.put('/api/portal/me/perfil', { versao: 2, genero: 'feminino', etnia: 'parda', consentimentos: { genero: { aceito: true, versaoTexto: 'v1' }, etnia: { aceito: true, versaoTexto: 'v1' } } }, { usuario: 'u-aluno1' });
    assert.equal(com.status, 200, JSON.stringify(com.corpo));
    assert.equal(com.corpo.perfil.genero, 'feminino');
    assert.equal(com.corpo.consentimentos.genero.aceito, true);
    const reg = await ctx.banco.collection('consentimentos').findOne({ userId: IDS['u-aluno1'], finalidade: 'perfil_genero' });
    assert.equal(reg.textoSha256, sha(TEXTOS.perfil_genero.v1));
    assert.equal(reg.via, 'perfil');
    const espelho = (await ctx.banco.collection('perfis').findOne({ userId: IDS['u-aluno1'] })).consentimentos;
    assert.equal(espelho.genero.aceito, true);
    assert.equal(espelho.etnia.aceito, true);
  });

  test('nome social e redes sem consentimento → 428; com aceite gravam; users.nome = nome social', async () => {
    const ns = await ctx.api.put('/api/portal/me/perfil', { versao: 3, nomeSocial: 'Ana Social' }, { usuario: 'u-aluno1' });
    assert.equal(ns.corpo.finalidade, 'perfil_nome_social');
    const rd = await ctx.api.put('/api/portal/me/perfil', { versao: 3, redes: { instagram: '@ana.um' } }, { usuario: 'u-aluno1' });
    assert.equal(rd.corpo.finalidade, 'perfil_redes');
    const ok = await ctx.api.put('/api/portal/me/perfil', {
      versao: 3, nomeSocial: 'Ana Social', redes: { instagram: '@ana.um', facebook: 'https://www.facebook.com/ana.um' },
      consentimentos: { nomeSocial: { aceito: true, versaoTexto: 'v1' }, redes: { aceito: true, versaoTexto: 'v1' } }
    }, { usuario: 'u-aluno1' });
    assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
    assert.equal(ok.corpo.perfil.redes.instagram, 'ana.um');
    assert.equal(ok.corpo.perfil.redes.facebook, 'ana.um');
    assert.equal((await ctx.banco.collection('users').findOne({ _id: oid('u-aluno1') })).nome, 'Ana Social');
  });

  test('revogar gênero, nome social e redes apaga o valor na hora e grava o histórico; sem aceite vigente → 404', async () => {
    for (const f of ['perfil_genero', 'perfil_nome_social', 'perfil_redes']) {
      const r = await ctx.api.post(`/api/portal/me/dados/consentimentos/${f}/revogar`, {}, { usuario: 'u-aluno1' });
      assert.equal(r.status, 200, f);
      assert.ok(r.corpo.efeito);
    }
    const p = await ctx.banco.collection('perfis').findOne({ userId: IDS['u-aluno1'] });
    assert.equal(p.genero, null);
    assert.equal(p.nomeSocial, null);
    assert.deepEqual(p.redes, { instagram: null, facebook: null });
    assert.equal(p.etnia, 'parda', 'só a finalidade revogada');
    assert.equal(p.consentimentos.genero.aceito, false);
    assert.equal((await ctx.banco.collection('users').findOne({ _id: oid('u-aluno1') })).nome, 'Aluna Um da Silva');
    const hist = await ctx.banco.collection('consentimentos').find({ userId: IDS['u-aluno1'], finalidade: 'perfil_genero' }).toArray();
    assert.deepEqual(hist.map(h => h.aceito), [true, false]);
    assert.equal((await ctx.api.post('/api/portal/me/dados/consentimentos/perfil_genero/revogar', {}, { usuario: 'u-aluno1' })).status, 404);
    assert.equal((await ctx.api.post('/api/portal/me/dados/consentimentos/qualquer/revogar', {}, { usuario: 'u-aluno1' })).status, 404);
    const auds = await ctx.banco.collection('auditoria').find({ acao: 'consentimento.revogado', alvoUserId: IDS['u-aluno1'] }).toArray();
    assert.equal(auds.length, 3);
  });

  test('GET /me/dados/consentimentos lista as 6 finalidades; POST com assistente_ia → 400 e nada gravado', async () => {
    const r = await ctx.api.get('/api/portal/me/dados/consentimentos', { usuario: 'u-aluno1' });
    assert.deepEqual(r.corpo.itens.map(i => i.finalidade).sort(), ['assistente_ia', 'perfil_etnia', 'perfil_foto', 'perfil_genero', 'perfil_nome_social', 'perfil_redes']);
    const etnia = r.corpo.itens.find(i => i.finalidade === 'perfil_etnia');
    assert.equal(etnia.aceito, true);
    assert.ok(etnia.em && etnia.efeitoRevogacao);
    const antes = await ctx.banco.collection('consentimentos').countDocuments({});
    const ia = await ctx.api.post('/api/portal/me/dados/consentimentos', { finalidade: 'assistente_ia', aceito: true, versaoTexto: 'v1' }, { usuario: 'u-aluno1' });
    assert.equal(ia.status, 400);
    assert.equal((await ctx.api.post('/api/portal/me/dados/consentimentos', { finalidade: 'perfil_foto', aceito: true, versaoTexto: 'v9' }, { usuario: 'u-aluno1' })).status, 400);
    assert.equal(await ctx.banco.collection('consentimentos').countDocuments({}), antes);
  });

  test('foto: sem perfil_foto → 428; com aceite → EXIF removido; GIF → 415; 3 MB → 413; GET e DELETE', async () => {
    const sem = await ctx.api.post('/api/portal/me/perfil/foto', undefined, { usuario: 'u-aluno1', corpoCru: jpegComExif(), tipo: 'image/jpeg' });
    assert.equal(sem.status, 428);
    assert.equal(sem.corpo.finalidade, 'perfil_foto');
    const ac = await ctx.api.post('/api/portal/me/dados/consentimentos', { finalidade: 'perfil_foto', aceito: true, versaoTexto: 'v1' }, { usuario: 'u-aluno1' });
    assert.equal(ac.status, 201);
    const gif = await ctx.api.post('/api/portal/me/perfil/foto', undefined, { usuario: 'u-aluno1', corpoCru: Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'binary'), tipo: 'image/gif' });
    assert.equal(gif.status, 415);
    const grande = Buffer.concat([jpegComExif(), Buffer.alloc(3 * 1024 * 1024)]);
    assert.equal((await ctx.api.post('/api/portal/me/perfil/foto', undefined, { usuario: 'u-aluno1', corpoCru: grande, tipo: 'image/jpeg' })).status, 413);
    const ok = await ctx.api.post('/api/portal/me/perfil/foto', undefined, { usuario: 'u-aluno1', corpoCru: jpegComExif(), tipo: 'image/jpeg' });
    assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
    assert.equal(ok.corpo.temFoto, true);
    const baixada = await ctx.api.raw('/api/portal/me/perfil/foto', { headers: { 'x-teste-usuario': 'u-aluno1' } });
    assert.equal(baixada.status, 200);
    assert.equal(baixada.headers.get('cache-control'), 'private, no-store');
    const bytes = Buffer.from(baixada.texto, 'latin1');
    assert.ok(!bytes.includes(Buffer.from('Exif')), 'metadados removidos');
    assert.equal((await ctx.banco.collection('users').findOne({ _id: oid('u-aluno1') })).temFoto, true);
    // Professor vinculado vê a foto (inline); intruso não.
    assert.equal((await ctx.api.get(`/api/portal/professor/alunos/${IDS['u-aluno1']}/foto`, { usuario: 'u-prof' })).status, 200);
    assert.equal((await ctx.api.get(`/api/portal/professor/alunos/${IDS['u-aluno1']}/foto`, { usuario: 'u-prof-t1' })).status, 200);
    assert.equal((await ctx.api.get(`/api/portal/professor/alunos/${IDS['u-aluno1']}/foto`, { usuario: 'u-intruso' })).status, 403);
    // Revogar a foto apaga o binário.
    const rv = await ctx.api.post('/api/portal/me/dados/consentimentos/perfil_foto/revogar', {}, { usuario: 'u-aluno1' });
    assert.equal(rv.status, 200);
    assert.equal(await ctx.banco.collection('arquivos').countDocuments({ contexto: 'foto_perfil', donoUserId: IDS['u-aluno1'] }), 0);
    assert.equal((await ctx.api.get('/api/portal/me/perfil/foto', { usuario: 'u-aluno1' })).status, 404);
    assert.equal((await ctx.banco.collection('users').findOne({ _id: oid('u-aluno1') })).temFoto, false);
  });

  test('endereço no exterior grava sem CEP/UF e o cadastro fica completo; celular +351 aceito', async () => {
    const r = await ctx.api.put('/api/portal/me/perfil', {
      versao: 0, nomeRegistro: 'Pessoa do Exterior', passaporte: { numero: 'ab 123456', paisEmissor: 'Portugal' }, nacionalidade: 'Portuguesa',
      nascimento: '1985-07-01', celular: '+351 912 345 678',
      endereco: { pais: 'Portugal', codigoPostal: '1000-001', regiao: 'Lisboa', logradouro: 'Rua Augusta', numero: '10', cidade: 'Lisboa' }
    }, { usuario: 'u-intruso' });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.perfil.endereco.cep, null);
    assert.equal(r.corpo.perfil.endereco.uf, null);
    assert.equal(r.corpo.perfil.endereco.codigoPostal, '1000-001');
    assert.equal(r.corpo.perfil.passaporte.numero, 'AB123456');
    assert.equal(r.corpo.perfil.celular, '+351912345678');
    assert.equal(r.corpo.completude.completo, true, JSON.stringify(r.corpo.completude));
  });

  test('troca de e-mail ponta a ponta: link de 24 h ao NOVO endereço (só no fragmento) → confirmar → aviso ao antigo', async () => {
    const senhaErrada = await ctx.api.post('/api/portal/me/perfil/email', { novoEmail: 'aluno2.novo@exemplo.invalid', senha: 'errada-123' }, { usuario: 'u-aluno2' });
    assert.equal(senhaErrada.status, 400);
    assert.ok(senhaErrada.corpo.campos.senha);
    const r = await ctx.api.post('/api/portal/me/perfil/email', { novoEmail: 'aluno2.novo@exemplo.invalid', senha: 'senha-de-teste-123' }, { usuario: 'u-aluno2' });
    assert.equal(r.status, 202);
    await esperar(20);
    const envio = ctx.fetchImpl.chamadas.find(c => c.corpo?.to?.[0] === 'aluno2.novo@exemplo.invalid');
    const m = /https:\/\/portal\.exemplo\.invalid\/plataforma-ead\/acesso-link\.html#email=([A-Za-z0-9_-]+)/.exec(envio.corpo.text);
    assert.ok(m, 'link com PORTAL_BASE_URL e token no fragmento');
    const c = await ctx.api.post('/api/auth/email/confirmar', { token: m[1] });
    assert.equal(c.status, 200);
    const u = await ctx.banco.collection('users').findOne({ _id: oid('u-aluno2') });
    assert.equal(u.email, 'aluno2.novo@exemplo.invalid');
    assert.ok(u.emailVerificadoEm instanceof Date);
    assert.equal((await ctx.api.post('/api/auth/email/confirmar', { token: m[1] })).status, 410, 'uso único');
    await esperar(20);
    assert.ok(ctx.fetchImpl.chamadas.some(x => x.corpo?.to?.[0] === 'aluno2@exemplo.invalid' && /alterado/i.test(x.corpo.subject)));
  });

  test('exportação: perfil e consentimentos, SEM senhaHash/segredo; exportador externo incluído; 4ª no dia → 429', async () => {
    const r = await ctx.api.get('/api/portal/me/dados/exportacao', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-disposition'), /attachment; filename="meus-dados-\d{8}\.json"/);
    const corpo = JSON.parse(r.texto);
    assert.equal(corpo.versaoFormato, 1);
    assert.equal(corpo.perfil.cpf, cpfA);
    assert.equal(corpo.conta.email, 'aluno1@exemplo.invalid');
    assert.ok(Array.isArray(corpo.consentimentos) && corpo.consentimentos.length >= 4);
    assert.ok(Array.isArray(corpo.notificacoes));
    semSegredo(corpo);
    assert.doesNotMatch(r.texto, /senhaHash|segredo|fotoArquivoId/);
    assert.equal((await ctx.banco.collection('auditoria').countDocuments({ acao: 'titular.exportacao' })), 1);
    await ctx.api.get('/api/portal/me/dados/exportacao', { usuario: 'u-aluno1' });
    await ctx.api.get('/api/portal/me/dados/exportacao', { usuario: 'u-aluno1' });
    const quarta = await ctx.api.get('/api/portal/me/dados/exportacao', { usuario: 'u-aluno1' });
    assert.equal(quarta.status, 429);
    assert.ok(quarta.headers.get('retry-after'));
  });

  test('resumo de Meus dados: categorias com visivelPara, operadores declarados e encarregado nulo quando não indicado', async () => {
    const r = await ctx.api.get('/api/portal/me/dados/resumo', { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.ok(r.corpo.categorias.every(c => Array.isArray(c.visivelPara) && c.visivelPara.length && c.baseLegal));
    const nomes = r.corpo.operadores.map(o => o.nome).join(' | ');
    for (const n of ['Google Fonts', 'YouTube', 'Vimeo', 'sala do encontro ao vivo', 'ViaCEP', 'Resend']) assert.match(nomes, new RegExp(n));
    assert.equal(r.corpo.encarregado, null);
  });
});

describe('perfil: travas, IA delegada, coordenação e auditoria indisponível', () => {
  let ctx;
  const cpf = gerarCpfValido('trava');
  before(async () => {
    ctx = await subirPortal({
      falsos: {
        'ia.revogarConsentimento': async () => ({ apagadas: 2 }),
        'configuracoes.publicas': async () => ({ encarregado: { nome: 'Encarregado Cadastrado', email: 'dpo@exemplo.invalid', telefone: null, canalUrl: null } })
      },
      grupos: { exportador: [{ dominio: 'progresso', exportar: async () => ({ aulas: 3 }) }] },
      prep: async (banco) => {
        const agora = new Date();
        await banco.collection('perfis').insertMany([
          { userId: IDS['u-aluno1'], nomeRegistro: 'Aluna Certificada', cpf, nascimento: '1990-01-01', consentimentos: {}, versao: 1, criadoEm: agora },
          { userId: IDS['u-aluno2'], nomeRegistro: 'Aluno Sem Contrato', nascimento: '1991-01-01', consentimentos: {}, versao: 1, criadoEm: agora },
          { userId: IDS['u-intruso'], nomeRegistro: 'Pessoa Com Genero', genero: 'outro', etnia: 'preta', consentimentos: {}, versao: 1, criadoEm: agora }
        ]);
        await banco.collection('certificados').insertOne({ codigo: 'DMC-AAAA-BBBB', userId: IDS['u-aluno1'], cursoId: 'curso-01', emitidoEm: agora });
      }
    });
  });
  after(() => fechar(ctx.server));

  test('certificado emitido trava nome de registro e nascimento (409 campo-travado); sem o serviço de contratos → 503 (nunca destrava sem conferir)', async () => {
    const t = await ctx.api.put('/api/portal/me/perfil', { versao: 1, nomeRegistro: 'Outro Nome' }, { usuario: 'u-aluno1' });
    assert.equal(t.status, 409);
    assert.equal(t.corpo.codigo, 'campo-travado');
    assert.ok(t.corpo.campos.nomeRegistro);
    const g = await ctx.api.get('/api/portal/me/perfil', { usuario: 'u-aluno1' });
    assert.deepEqual(g.corpo.travados.sort(), ['cpf', 'nascimento', 'nomeRegistro']);
    const s = await ctx.api.put('/api/portal/me/perfil', { versao: 1, nomeRegistro: 'Outro Nome' }, { usuario: 'u-aluno2' });
    assert.equal(s.status, 503);
    assert.equal(s.corpo.codigo, 'servico-indisponivel');
    const vazio = await ctx.api.put('/api/portal/me/perfil', { versao: 1, celular: '11987654321' }, { usuario: 'u-aluno2' });
    assert.equal(vazio.status, 200, 'campo não travável grava normalmente');
  });

  test('revogar o assistente delega a ia.revogarConsentimento (F6b)', async () => {
    const r = await ctx.api.post('/api/portal/me/dados/consentimentos/assistente_ia/revogar', { apagarHistorico: true }, { usuario: 'u-aluno1' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.apagadas, 2);
    const chamada = ctx.servicos.chamadas['ia.revogarConsentimento'][0];
    assert.equal(chamada[0], IDS['u-aluno1']);
    assert.equal(chamada[1].apagarHistorico, true);
  });

  test('coordenação: vê gênero/etnia como "restrito"; PUT sem motivo → 400; com motivo ignora a trava e audita mascarado', async () => {
    const g = await ctx.api.get(`/api/portal/admin/usuarios/${IDS['u-intruso']}/perfil`, { usuario: 'u-admin' });
    assert.equal(g.status, 200);
    assert.equal(g.corpo.perfil.genero, 'restrito');
    assert.equal(g.corpo.perfil.etnia, 'restrito');
    assert.ok(!JSON.stringify(g.corpo).includes('"outro"') && !JSON.stringify(g.corpo).includes('preta'));
    assert.equal((await ctx.banco.collection('auditoria').countDocuments({ acao: 'perfil.visualizado_pela_equipe' })), 1);
    assert.equal((await ctx.api.put(`/api/portal/admin/usuarios/${IDS['u-aluno1']}/perfil`, { versao: 1, nomeRegistro: 'Nome Corrigido' }, { usuario: 'u-admin' })).status, 400);
    const novoCpf = gerarCpfValido('corrigido');
    const r = await ctx.api.put(`/api/portal/admin/usuarios/${IDS['u-aluno1']}/perfil`, { versao: 1, nomeRegistro: 'Nome Corrigido', cpf: novoCpf, genero: 'feminino', motivo: 'Correção pedida pela aluna em protocolo' }, { usuario: 'u-admin' });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    const p = await ctx.banco.collection('perfis').findOne({ userId: IDS['u-aluno1'] });
    assert.equal(p.nomeRegistro, 'Nome Corrigido');
    assert.equal(p.cpf, novoCpf);
    assert.equal(p.genero ?? null, null, 'coordenação não edita gênero');
    const aud = await ctx.banco.collection('auditoria').findOne({ acao: 'perfil.alterado_pela_equipe' });
    assert.equal(aud.motivo, 'Correção pedida pela aluna em protocolo');
    assert.ok(aud.mudancas.some(m => m.campo === 'cpf' && m.de === '(alterado)'));
    assert.equal((await ctx.api.get(`/api/portal/admin/usuarios/${IDS['u-aluno1']}/perfil`, { usuario: 'u-prof' })).status, 403);
  });

  test('auditoria que falha → 503 e NADA muda (PUT do perfil e aceite avulso)', async () => {
    ctx.banco.falhar.insertOne = (colecao) => colecao === 'auditoria';
    try {
      const r = await ctx.api.put('/api/portal/me/perfil', { versao: 2, celular: '11912345678' }, { usuario: 'u-aluno2' });
      assert.equal(r.status, 503);
      assert.equal(r.corpo.codigo, 'auditoria-indisponivel');
      const c = await ctx.api.post('/api/portal/me/dados/consentimentos', { finalidade: 'perfil_foto', aceito: true, versaoTexto: 'v1' }, { usuario: 'u-aluno2' });
      assert.equal(c.status, 503);
    } finally { ctx.banco.falhar.insertOne = false; }
    const p = await ctx.banco.collection('perfis').findOne({ userId: IDS['u-aluno2'] });
    assert.equal(p.celular, '+5511987654321');
    assert.equal(await ctx.banco.collection('consentimentos').countDocuments({ userId: IDS['u-aluno2'] }), 0);
  });

  test('resumo traz o encarregado configurado; exportação inclui o exportador de outra fatia', async () => {
    const r = await ctx.api.get('/api/portal/me/dados/resumo', { usuario: 'u-aluno2' });
    assert.equal(r.corpo.encarregado.nome, 'Encarregado Cadastrado');
    const e = await ctx.api.get('/api/portal/me/dados/exportacao', { usuario: 'u-aluno2' });
    assert.deepEqual(JSON.parse(e.texto).progresso, { aulas: 3 });
  });
});

describe('serviço consentimentos.* (DC-72)', () => {
  let ctx;
  before(async () => { ctx = await subirPortal(); });
  after(() => fechar(ctx.server));

  test('registrar via ia grava o textoSha256 do chamador e não toca perfis.consentimentos; vigente; revogar; desconhecida → 400; sem aceite → 404', async () => {
    const registrar = ctx.servicos.obter('consentimentos.registrar');
    const revogar = ctx.servicos.obter('consentimentos.revogar');
    const vigente = ctx.servicos.obter('consentimentos.vigente');
    await ctx.banco.collection('perfis').insertOne({ userId: IDS['u-aluno1'], nomeRegistro: 'Aluna', consentimentos: { genero: null, etnia: null, nomeSocial: null, redes: null, foto: null }, versao: 1 });
    const hashIa = 'a'.repeat(64);
    const r = await registrar({ userId: IDS['u-aluno1'], finalidade: 'assistente_ia', versaoTexto: 'ia-v1', textoSha256: hashIa, via: 'ia', req: null });
    assert.equal(r.finalidade, 'assistente_ia');
    const doc = await ctx.banco.collection('consentimentos').findOne({ finalidade: 'assistente_ia' });
    assert.equal(doc.textoSha256, hashIa);
    assert.equal(doc.via, 'ia');
    const p = await ctx.banco.collection('perfis').findOne({ userId: IDS['u-aluno1'] });
    assert.deepEqual(p.consentimentos, { genero: null, etnia: null, nomeSocial: null, redes: null, foto: null });
    assert.equal((await vigente(IDS['u-aluno1'], 'assistente_ia')).textoSha256, hashIa);
    await revogar({ userId: IDS['u-aluno1'], finalidade: 'assistente_ia', via: 'ia', req: null });
    assert.equal(await vigente(IDS['u-aluno1'], 'assistente_ia'), null);
    await assert.rejects(revogar({ userId: IDS['u-aluno1'], finalidade: 'assistente_ia', via: 'ia', req: null }), e => e.status === 404);
    await assert.rejects(registrar({ userId: IDS['u-aluno1'], finalidade: 'outra', versaoTexto: 'v1', textoSha256: hashIa, via: 'ia' }), e => e.status === 400);
    const auds = await ctx.banco.collection('auditoria').find({ alvoUserId: IDS['u-aluno1'], acao: { $in: ['consentimento.registrado', 'consentimento.revogado'] } }).toArray();
    assert.equal(auds.length, 2);
    assert.ok(auds.every(a => a.estado === 'concluido'));
  });

  test('auditoria que falha → 503 e nada é gravado', async () => {
    const registrar = ctx.servicos.obter('consentimentos.registrar');
    const t = textoConsentimento('perfil_foto');
    ctx.banco.falhar.insertOne = (colecao) => colecao === 'auditoria';
    try {
      await assert.rejects(registrar({ userId: IDS['u-aluno2'], finalidade: 'perfil_foto', versaoTexto: 'v1', textoSha256: t.textoSha256, via: 'meus_dados' }), e => e.status === 503);
    } finally { ctx.banco.falhar.insertOne = false; }
    assert.equal(await ctx.banco.collection('consentimentos').countDocuments({ userId: IDS['u-aluno2'] }), 0);
  });

  test('revogar o assistente sem a F6b montada → 503 servico-indisponivel', async () => {
    const r = await ctx.api.post('/api/portal/me/dados/consentimentos/assistente_ia/revogar', {}, { usuario: 'u-aluno1' });
    assert.equal(r.status, 503);
    assert.equal(r.corpo.codigo, 'servico-indisponivel');
  });
});

describe('CEP pelo servidor (ViaCEP falso)', () => {
  async function subirCep(roteiro, { timeoutMs } = {}) {
    const banco = criarBancoMemoria({ indices: especificacoesRegistradas() });
    await semear(banco);
    const fetchImpl = fetchFalso(roteiro);
    const router = express.Router();
    criarRotaCep({ router, repo: n => banco.collection(n), fetchImpl, urlViaCep: 'http://127.0.0.1:9', throttle: criarThrottle, log: silencioso, ...(timeoutMs ? { timeoutMs } : {}) });
    const app = express();
    app.use(express.json());
    app.use('/api', usuarioDeTeste({ banco }));
    app.use('/api/portal', router);
    app.use('/api/portal', tratarErroPortal);
    const { server, base } = await subir(app);
    return { api: cliente(base), server, banco, fetchImpl };
  }

  test('inválido → 400; sucesso → só o CEP sai; segunda consulta vem do cache (fetch 1×)', async () => {
    const c = await subirCep([{ status: 200, json: { cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' } }]);
    try {
      assert.equal((await c.api.get('/api/portal/cep/123', { usuario: 'u-aluno1' })).status, 400);
      const r = await c.api.get('/api/portal/cep/01310-100', { usuario: 'u-aluno1' });
      assert.equal(r.status, 200);
      assert.deepEqual(r.corpo, { cep: '01310100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP', fonte: 'viacep' });
      assert.equal(c.fetchImpl.chamadas[0].url, 'http://127.0.0.1:9/ws/01310100/json/');
      const r2 = await c.api.get('/api/portal/cep/01310100', { usuario: 'u-aluno2' });
      assert.equal(r2.corpo.fonte, 'cache');
      assert.equal(c.fetchImpl.chamadas.length, 1);
      assert.ok(await c.banco.collection('cache_cep').findOne({ _id: '01310100' }));
    } finally { await fechar(c.server); }
  });

  test('erro:"true" → 404 cep-nao-encontrado (cacheado); UF inválida → 503; HTTP 500 → 503; timeout → 503', async () => {
    const c = await subirCep([{ status: 200, json: { erro: 'true' } }, { status: 200, json: { localidade: 'X', uf: 'ZZ' } }, { status: 500, json: {} }]);
    try {
      const n = await c.api.get('/api/portal/cep/99999999', { usuario: 'u-aluno1' });
      assert.equal(n.status, 404);
      assert.equal(n.corpo.codigo, 'cep-nao-encontrado');
      assert.equal((await c.api.get('/api/portal/cep/99999999', { usuario: 'u-aluno1' })).status, 404);
      assert.equal(c.fetchImpl.chamadas.length, 1);
      const uf = await c.api.get('/api/portal/cep/11111111', { usuario: 'u-aluno1' });
      assert.equal(uf.status, 503);
      assert.equal(uf.corpo.codigo, 'cep-indisponivel');
      assert.equal((await c.api.get('/api/portal/cep/22222222', { usuario: 'u-aluno1' })).status, 503);
      assert.equal(await c.banco.collection('cache_cep').findOne({ _id: '11111111' }), null, 'falha não cacheia');
    } finally { await fechar(c.server); }
    const lento = await subirCep('nunca', { timeoutMs: 50 });
    try {
      const t0 = Date.now();
      const r = await lento.api.get('/api/portal/cep/01001000', { usuario: 'u-aluno1' });
      assert.equal(r.status, 503);
      assert.ok(Date.now() - t0 < 2000);
    } finally { await fechar(lento.server); }
  });

  test('31ª consulta em 10 min → 429', async () => {
    const c = await subirCep([{ status: 200, json: { logradouro: 'Rua', bairro: 'B', localidade: 'C', uf: 'SP' } }]);
    try {
      let ultimo;
      for (let i = 0; i < 31; i++) ultimo = await c.api.get('/api/portal/cep/01001000', { usuario: 'u-aluno1' });
      assert.equal(ultimo.status, 429);
      assert.ok(ultimo.headers.get('retry-after'));
    } finally { await fechar(c.server); }
  });
});

describe('relatório diversidade (grupo relatorio)', () => {
  test('só consentidos, sem "prefiro não informar", células < 5 viram "<5"', async () => {
    const { criarRelatorioDiversidade } = await import('../src/routes/portal/perfil.js');
    const banco = criarBancoMemoria();
    const sim = { aceito: true, versaoTexto: 'v1', em: new Date() };
    const nao = { aceito: false, versaoTexto: 'v1', em: new Date() };
    const docs = [];
    for (let i = 0; i < 6; i++) docs.push({ userId: `f${i}`, genero: 'feminino', etnia: 'parda', consentimentos: { genero: sim, etnia: sim } });
    for (let i = 0; i < 3; i++) docs.push({ userId: `m${i}`, genero: 'masculino', etnia: 'branca', consentimentos: { genero: sim, etnia: nao } });
    docs.push({ userId: 'x', genero: 'prefiro_nao_informar', consentimentos: { genero: sim } });
    docs.push({ userId: 'y', genero: 'feminino', consentimentos: { genero: nao } });
    await banco.collection('perfis').insertMany(docs);
    const r = criarRelatorioDiversidade({ repo: n => banco.collection(n) });
    assert.deepEqual(r.papeis, ['admin']);
    const linhas = await r.consultar();
    const g = Object.fromEntries(linhas.filter(l => l.dimensao === 'Gênero').map(l => [l.categoria, l.pessoas]));
    assert.deepEqual(g, { Feminino: 6, Masculino: '<5', 'Não binário': '<5', Outro: '<5' });
    const e = Object.fromEntries(linhas.filter(l => l.dimensao !== 'Gênero').map(l => [l.categoria, l.pessoas]));
    assert.equal(e.Parda, 6);
    assert.equal(e.Branca, '<5', 'etnia sem consentimento vigente não conta');
    assert.ok(linhas.every(l => !Object.hasOwn(l, 'userId')));
  });
});

// Achado G2 (LGPD art. 11, revisão de segurança §9.8): o relatório era contado na hora e a trilha
// dizia quem consentiu em perfil_genero/perfil_etnia e que o campo 'genero'/'etnia' mudou. Duas
// leituras do relatório + o horário do evento revelavam o gênero ou a etnia de uma pessoa nomeada.
describe('diversidade sem inferência individual (achado G2)', () => {
  let ctx;
  let relogio = new Date('2026-10-05T15:00:00Z');
  const em = iso => { relogio = new Date(iso); };
  const hex = i => (0xb000 + i).toString(16).padStart(24, '0');
  const SIM = { aceito: true, versaoTexto: 'v1', em: new Date('2026-09-01T12:00:00Z') };
  const CONSENTE_GENERO = { genero: { aceito: true, versaoTexto: 'v1' } };
  const VAZA = /perfil_genero|perfil_etnia|"campo":"genero"|"campo":"etnia"|genero:|etnia:/;

  before(async () => {
    ctx = await subirPortal({
      agora: () => new Date(relogio),
      prep: async banco => {
        const users = [];
        const perfis = [];
        for (let i = 0; i < 10; i++) {
          users.push({ _id: oid(hex(i)), email: `div${i}@exemplo.invalid`, nome: `Pessoa ${i} de Teste`, papel: 'aluno', isAdmin: false, createdAt: new Date('2026-08-01T12:00:00Z') });
          if (i < 5) {
            perfis.push({
              userId: hex(i), nomeRegistro: `Pessoa ${i} de Teste`, genero: 'feminino', etnia: 'parda', redes: { instagram: null, facebook: null },
              consentimentos: { genero: SIM, etnia: SIM, nomeSocial: null, redes: null, foto: null }, menorDeIdade: false, versao: 1
            });
          }
        }
        await banco.collection('users').insertMany(users);
        await banco.collection('perfis').insertMany(perfis);
      }
    });
  });
  after(() => fechar(ctx.server));

  const definicao = () => [...new Set(ctx.servicos.todos('relatorio'))].find(d => d.id === 'diversidade');
  async function ler() {
    const linhas = await definicao().consultar({ user: { _id: oid('u-admin'), papel: 'admin' } }, {}, { limite: 20000 });
    const de = dim => Object.fromEntries(linhas.filter(l => l.dimensao === dim).map(l => [l.categoria, l.pessoas]));
    return { genero: de('Gênero'), etnia: de('Cor ou etnia (IBGE)'), retratoDe: linhas[0]?.retratoDe ?? null, linhas };
  }
  const putGenero = (usuario, versao, genero, consentimentos = CONSENTE_GENERO) =>
    ctx.api.put('/api/portal/me/perfil', { versao, genero, ...(consentimentos ? { consentimentos } : {}) }, { usuario });

  test('um cadastro novo NÃO muda a contagem na leitura seguinte (retrato mensal, não tempo real)', async () => {
    const antes = await ler();
    assert.equal(antes.genero.Feminino, 5);
    em('2026-10-05T16:00:00Z');
    const put = await putGenero('u-aluno2', 0, 'feminino');
    assert.equal(put.status, 200, JSON.stringify(put.corpo));
    em('2026-10-05T17:00:00Z');
    const depois = await ler();
    assert.equal(depois.genero.Feminino, 5, 'Feminino 5 → 6 logo depois do cadastro revelaria o gênero de u-aluno2');
    assert.equal(String(depois.retratoDe).slice(0, 10), '2026-10-05');
    assert.ok(definicao().colunas.some(c => c.chave === 'retratoDe' && c.tipo === 'data'));
    assert.match(definicao().descricao, /^Retrato mensal, não em tempo real: .*pelo menos 5 pessoas/);
  });

  test('a trilha não diz qual dado de diversidade mudou nem a finalidade (gênero × etnia); a prova do aceite segue em consentimentos', async () => {
    const auds = await ctx.banco.collection('auditoria').find({ 'ator.userId': IDS['u-aluno2'] }).toArray();
    assert.doesNotMatch(JSON.stringify(auds), VAZA);
    const cons = auds.find(a => a.acao === 'consentimento.registrado');
    assert.equal(cons.extra.finalidade, 'diversidade');
    assert.equal(cons.entidade.id, `${IDS['u-aluno2']}:diversidade`);
    const alt = auds.find(a => a.acao === 'perfil.alterado');
    assert.deepEqual(alt.mudancas, [{ campo: 'diversidade', de: '(alterado)', para: '(alterado)' }]);
    const tela = await ctx.api.get(`/api/portal/admin/auditoria?alvoUserId=${IDS['u-aluno2']}`, { usuario: 'u-admin' });
    assert.equal(tela.status, 200);
    assert.ok(tela.corpo.total >= 2);
    assert.doesNotMatch(JSON.stringify(tela.corpo), VAZA);
    const prova = await ctx.banco.collection('consentimentos').findOne({ userId: IDS['u-aluno2'], finalidade: 'perfil_genero' });
    assert.equal(prova.aceito, true);
    assert.equal(prova.textoSha256, sha(TEXTOS.perfil_genero.v1));
  });

  test('registros antigos saem generalizados na tela e no CSV; o filtro por entidade não separa gênero de etnia', async () => {
    const uid = hex(0);
    const base = { ator: { userId: uid, papel: 'aluno', ipTruncado: null }, alvoUserId: uid, cursoId: null, motivo: null, estado: 'concluido', erro: null };
    await ctx.banco.collection('auditoria').insertMany([
      { ...base, em: new Date('2026-09-01T12:00:00Z'), concluidoEm: new Date('2026-09-01T12:00:00Z'), acao: 'consentimento.registrado', entidade: { tipo: 'consentimento', id: `${uid}:perfil_genero` }, mudancas: null, extra: { finalidade: 'perfil_genero', versaoTexto: 'v1', via: 'perfil' } },
      { ...base, em: new Date('2026-09-01T12:00:01Z'), concluidoEm: new Date('2026-09-01T12:00:01Z'), acao: 'perfil.alterado', entidade: { tipo: 'perfil', id: uid }, extra: null,
        mudancas: [{ campo: 'genero', de: '(alterado)', para: '(alterado)' }, { campo: 'etnia', de: '(alterado)', para: '(alterado)' }, { campo: 'estadoCivil', de: null, para: 'solteiro' }] }
    ]);
    const tela = await ctx.api.get(`/api/portal/admin/auditoria?alvoUserId=${uid}`, { usuario: 'u-admin' });
    assert.equal(tela.status, 200);
    assert.doesNotMatch(JSON.stringify(tela.corpo), VAZA);
    assert.deepEqual(tela.corpo.itens.find(i => i.acao === 'perfil.alterado').mudancas.map(m => m.campo), ['diversidade', 'estadoCivil']);
    assert.equal(tela.corpo.itens.find(i => i.acao === 'consentimento.registrado').entidade.id, `${uid}:diversidade`);
    const csv = await ctx.api.get(`/api/portal/admin/auditoria?alvoUserId=${uid}&formato=csv`, { usuario: 'u-admin' });
    assert.equal(csv.status, 200);
    assert.doesNotMatch(String(csv.corpo), VAZA);
    const totais = [];
    for (const f of ['perfil_genero', 'perfil_etnia', 'diversidade']) {
      const r = await ctx.api.get(`/api/portal/admin/auditoria?entidadeId=${uid}:${f}`, { usuario: 'u-admin' });
      assert.equal(r.status, 200);
      totais.push(r.corpo.total);
    }
    assert.deepEqual(totais, [1, 1, 1], 'o filtro devolve o mesmo conjunto para gênero, etnia e diversidade');
  });

  test('o retrato só é refeito no mês seguinte E com 5+ pessoas cuja mudança afeta a contagem; revogação no mês não aparece', async () => {
    em('2026-11-02T15:00:00Z');
    let r = await ler();
    assert.equal(r.genero.Feminino, 5, 'só 1 pessoa mudou desde o retrato de outubro: não renova');
    assert.equal(String(r.retratoDe).slice(0, 10), '2026-10-05');
    const pni = await putGenero(hex(9), 0, 'prefiro_nao_informar', null);
    assert.equal(pni.status, 200, JSON.stringify(pni.corpo));
    for (const i of [5, 6, 7]) assert.equal((await putGenero(hex(i), 0, 'feminino')).status, 200);
    r = await ler();
    assert.equal(r.genero.Feminino, 5, '4 pessoas com mudança que conta ("prefiro não informar" não conta): ainda não renova');
    assert.equal((await putGenero(hex(8), 0, 'feminino')).status, 200);
    r = await ler();
    assert.equal(r.genero.Feminino, 10, '5 pessoas: renova');
    assert.equal(String(r.retratoDe).slice(0, 10), '2026-11-02');
    assert.equal(r.etnia.Parda, 5, 'a etnia não teve 5 mudanças: segue o retrato de outubro');
    const rev = await ctx.api.post('/api/portal/me/dados/consentimentos/perfil_genero/revogar', {}, { usuario: 'u-aluno2' });
    assert.equal(rev.status, 200);
    assert.equal((await ler()).genero.Feminino, 10, 'a revogação não aparece no mesmo mês');
    const audRev = await ctx.banco.collection('auditoria').findOne({ acao: 'consentimento.revogado', 'ator.userId': IDS['u-aluno2'] });
    assert.equal(audRev.extra.finalidade, 'diversidade');
    assert.equal((await ctx.banco.collection('perfis').findOne({ userId: IDS['u-aluno2'] })).genero, null, 'o valor continua apagado na hora');
    assert.equal((await ctx.banco.collection('perfis').findOne({ userId: IDS['u-aluno2'] })).diversidadeAlteradaEm.genero.toISOString(), '2026-11-02T15:00:00.000Z', 'a revogação conta como mudança para o próximo retrato');
    assert.equal((await ctx.banco.collection('perfis').findOne({ userId: hex(9) })).diversidadeAlteradaEm, undefined, '"prefiro não informar" sem autorização não marca');
    em('2026-12-03T15:00:00Z');
    r = await ler();
    assert.equal(r.genero.Feminino, 10, 'dezembro com 1 mudança: segue o retrato de novembro');
    assert.equal(String(r.retratoDe).slice(0, 10), '2026-11-02');
    const retratos = await ctx.banco.collection('diversidade_retratos').find({}, { projection: { _id: 0 } }).toArray();
    assert.ok(retratos.length >= 3);
    assert.doesNotMatch(JSON.stringify(retratos), /userId|[a-f0-9]{24}/, 'o retrato guarda só os totais publicados');
  });

  test('pela rota de relatórios (F7): JSON com a coluna "Retrato de" e a descrição; CSV continua recusado', async () => {
    const { criarRotasRelatorios } = await import('../src/routes/portal/relatorios.js');
    const rotas = criarRotasRelatorios({ servicos: ctx.servicos, acesso: {}, auditoria: { registrar: async () => null } });
    const app = express();
    app.use(express.json());
    app.use('/api', usuarioDeTeste({ banco: ctx.banco }));
    app.use('/api/portal/professor', rotas.professor);
    app.use(criarTratarErroGlobal({ log: silencioso }));
    const { server, base } = await subir(app);
    try {
      const api = cliente(base);
      const j = await api.get('/api/portal/professor/relatorios/diversidade', { usuario: 'u-admin' });
      assert.equal(j.status, 200, JSON.stringify(j.corpo));
      assert.ok(j.corpo.relatorio.colunas.some(c => c.chave === 'retratoDe' && c.tipo === 'data'));
      const datas = Object.fromEntries(j.corpo.itens.map(i => [i.dimensao, i.retratoDe]));
      assert.deepEqual(datas, { 'Gênero': '2026-11-02T15:00:00.000Z', 'Cor ou etnia (IBGE)': '2026-10-05T15:00:00.000Z' }, 'cada dimensão com o seu retrato');
      assert.equal((await api.get('/api/portal/professor/relatorios/diversidade?formato=csv', { usuario: 'u-admin' })).status, 400);
      const cat = await api.get('/api/portal/professor/relatorios', { usuario: 'u-admin' });
      assert.match(cat.corpo.itens.find(i => i.id === 'diversidade').descricao, /^Retrato mensal/);
    } finally { await fechar(server); }
  });
});

describe('textos de consentimento', () => {
  test('pngMinimo é aceito como foto (sanidade do apoio) e os textos têm sha256 estável', () => {
    assert.ok(pngMinimo().length > 0);
    assert.equal(textoConsentimento('perfil_redes').textoSha256, sha(TEXTOS.perfil_redes.v1));
    assert.equal(textoConsentimento('perfil_redes', 'v2'), null);
    assert.equal(textoConsentimento('assistente_ia'), null, 'o texto da IA é da F6b');
  });
});
