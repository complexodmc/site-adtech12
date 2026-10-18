// Portal · F3a — comprovantes (trilha imprimível) · PORTAL-API §6.7.4, D-40;
// linha `academico-comprovantes` da §9.3. Rode com `npm test` na raiz.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, AGORA_FIXTURE } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente, usuarioDeTeste } from './apoio/http.js';
import { silencioso, servicosFalsos } from './apoio/falsos.js';

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const M = await import('../src/portal/montar.js');
const { requireAuth, requireAdmin } = await import('../src/auth.js');
const { criarServicos } = await import('../src/portal/servicos.js');
const { lerConfigPortal } = await import('../src/portal/config-portal.js');

const CFG = lerConfigPortal({ NODE_ENV: 'test', JWT_SECRET: 'segredo-de-teste' });
const MODULOS_F3A = M.MODULOS_PADRAO.filter(m => m.fatia === 'F3a');
const AGORA = new Date(AGORA_FIXTURE);
const DIA = 86400000;

const TENTATIVAS = [
  { tentativaId: 't1', matriculaId: IDS['mat-aluno1'], cursoId: 'curso-01', codigo: 'AVL-2345-6789-ABCD', avaliacaoId: 'av1', avaliacao: 'Avaliação do Módulo 1', avaliacaoTipo: 'modular', moduloId: 'c01-m01', modulo: 'Módulo 1', numero: 1, iniciadaEm: new Date(AGORA.getTime() - 3 * DIA), enviadaEm: new Date(AGORA.getTime() - 3 * DIA + 3600000), pctAcerto: 90, nota: 9, status: 'corrigida', hash: 'a'.repeat(64) },
  { tentativaId: 't2', matriculaId: IDS['mat-aluno1'], cursoId: 'curso-01', codigo: 'AVL-2345-6789-ABCE', avaliacaoId: 'av1', avaliacao: 'Avaliação do Módulo 1', avaliacaoTipo: 'modular', moduloId: 'c01-m01', modulo: 'Módulo 1', numero: 2, iniciadaEm: new Date(AGORA.getTime() - DIA), enviadaEm: new Date(AGORA.getTime() - DIA + 600000), pctAcerto: 50, nota: 5, status: 'aguardando_correcao', hash: 'b'.repeat(64) }
];

async function subirF3a({ falsos = {} } = {}) {
  const banco = criarBancoMemoria();
  await semear(banco, { agora: AGORA });
  await banco.collection('lives').insertOne({ _id: 'e1', cursoId: 'curso-01', turmaId: null, titulo: 'Sexta · noite', inicioEm: new Date(AGORA.getTime() - 5 * 60000), duracaoMin: 90, url: 'https://sala.exemplo.invalid/e1' });
  const servicos = criarServicos();
  servicosFalsos(falsos, { em: servicos });
  const portal = M.montarPortal({
    getDb: () => banco, jwtSecret: 'segredo-de-teste', exigirLogin: requireAuth, exigirAdmin: [requireAuth, requireAdmin],
    servicos, modulos: MODULOS_F3A, configPortal: CFG, falharCedo: true, log: silencioso, agora: () => new Date(AGORA)
  });
  const app = express();
  app.use(express.json());
  app.use('/api', usuarioDeTeste({ banco }));
  app.use('/api', portal);
  app.use(M.tratarErroGlobal);
  const { server, base } = await subir(app);
  return { banco, api: cliente(base), fechar: () => fechar(server) };
}

describe('GET /portal/me/comprovantes', () => {
  test('só os próprios; frequência com código e hash; aguardando correção sem selo nem nota', async () => {
    const t = await subirF3a({ falsos: { 'avaliacoes.tentativasDoAluno': async userId => (userId === IDS['u-aluno1'] ? TENTATIVAS : []) } });
    try {
      assert.equal((await t.api.get('/api/portal/me/comprovantes')).status, 401);
      assert.equal((await t.api.post('/api/portal/encontros/e1/entrar', {}, { usuario: 'u-aluno1' })).status, 200);
      const r = await t.api.get('/api/portal/me/comprovantes', { usuario: 'u-aluno1' });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.total, 3);
      assert.equal(r.corpo.urlValidacao, 'validar.html?codigo=');
      assert.equal(r.corpo.titular.nome, 'Aluna Um de Teste');
      assert.deepEqual(r.corpo.titular.matriculas, ['MAT-2026-AAAAA2']);
      const [freq, aguardando, corrigida] = r.corpo.itens; // mais recentes primeiro
      assert.equal(freq.tipo, 'frequencia');
      assert.equal(freq.origem, 'ao_vivo');
      assert.match(freq.codigo, /^FRQ-/);
      assert.match(freq.hash, /^[a-f0-9]{64}$/);
      assert.equal(freq.encontro.titulo, 'Sexta · noite');
      assert.equal(freq.curso, 'Curso de Teste APE');
      assert.equal(aguardando.status, 'aguardando_correcao');
      assert.equal(aguardando.codigo, null);
      assert.equal(aguardando.hash, null);
      assert.equal(aguardando.nota, null);
      assert.equal(corrigida.codigo, 'AVL-2345-6789-ABCD');
      assert.equal(corrigida.pctAcerto, 90);
      const outro = await t.api.get('/api/portal/me/comprovantes', { usuario: 'u-aluno2' });
      assert.equal(outro.corpo.total, 0);
      assert.doesNotMatch(r.texto, /senhaHash|matriculaId|"userId"/);
    } finally { await t.fechar(); }
  });

  test('filtros tipo, curso e período; data inválida → 400; sem F2 só a frequência', async () => {
    const t = await subirF3a();
    try {
      await t.api.post('/api/portal/encontros/e1/entrar', {}, { usuario: 'u-aluno1' });
      const so = await t.api.get('/api/portal/me/comprovantes?tipo=frequencia&cursoId=curso-01&de=2026-10-18&ate=2026-10-18', { usuario: 'u-aluno1' });
      assert.equal(so.corpo.total, 1);
      assert.equal(so.corpo.avaliacoesDisponiveis, false);
      assert.equal((await t.api.get('/api/portal/me/comprovantes?de=2026-10-19', { usuario: 'u-aluno1' })).corpo.total, 0);
      assert.equal((await t.api.get('/api/portal/me/comprovantes?cursoId=curso-02', { usuario: 'u-aluno1' })).corpo.total, 0);
      assert.equal((await t.api.get('/api/portal/me/comprovantes?de=18/10/2026', { usuario: 'u-aluno1' })).status, 400);
      assert.equal((await t.api.get('/api/portal/me/comprovantes?tipo=boleto', { usuario: 'u-aluno1' })).status, 400);
      assert.equal((await t.api.get('/api/portal/me/comprovantes?tipo=avaliacoes', { usuario: 'u-aluno1' })).corpo.total, 0);
    } finally { await t.fechar(); }
  });
});

describe('GET /portal/professor/matriculas/:id/comprovantes', () => {
  test('professor só da docência; sem titular', async () => {
    const t = await subirF3a();
    try {
      await t.api.post('/api/portal/encontros/e1/entrar', {}, { usuario: 'u-aluno1' });
      const r = await t.api.get(`/api/portal/professor/matriculas/${IDS['mat-aluno1']}/comprovantes`, { usuario: 'u-prof-t1' });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.total, 1);
      assert.equal(r.corpo.titular, undefined);
      assert.equal((await t.api.get(`/api/portal/professor/matriculas/${IDS['mat-aluno2']}/comprovantes`, { usuario: 'u-prof-t1' })).status, 404);
      assert.equal((await t.api.get(`/api/portal/professor/matriculas/${IDS['mat-aluno1']}/comprovantes`, { usuario: 'u-aluno1' })).status, 403);
    } finally { await t.fechar(); }
  });
});
