// =============================================================
// Cache-Control das respostas da API — PORTAL-ACADEMICO §9.8 A05, ASVS 8.2.1 (achado do G2).
//
// O `semCache` do agregador (montar.js) só cobre /api/portal/* e as rotas novas de
// /api/auth/*. As legadas, montadas fora dele em server.js, saíam sem Cache-Control e a
// Vercel aplicava `public, max-age=0, must-revalidate`: o navegador guardava em disco o JSON
// autenticado (nome, e-mail e papel; na coordenação, os e-mails de todos os alunos e as
// candidaturas). server.js agora põe `no-store` em toda /api antes de qualquer rota; quem
// quer cache (capas, vitrine, materiais, arquivos) sobrescreve no próprio router.
//
// Contra o serve.mjs (a mesma função da Vercel, com o mongod descartável). Unidade, sem
// banco: server/test/servidor-erros.test.js §3. Dono: principal (spec do site, §8.1).
//   QA_PORT=4657 npx playwright test tests/e2e/api-cache.spec.js
// =============================================================
import { test, expect } from '@playwright/test';
import * as P from './_portal.js';

const resumo = (r) => `status ${r.status}, cache-control «${r.headers['cache-control']}», corpo ${JSON.stringify(r.json)?.slice(0, 160)}`;

test.describe('API: Cache-Control: no-store nas respostas autenticadas (A05)', () => {
  test('aluno: rotas legadas (auth/me, liberacoes/me, certificados, lives, progresso) e portal → 200 no-store', async ({ request }) => {
    const aluno = await P.criarUsuario(request, { papel: 'aluno' });
    const cli = P.api(request, aluno.token);
    for (const caminho of ['/api/auth/me', '/api/liberacoes/me', '/api/certificados', '/api/lives', '/api/progresso', '/api/portal/saude']) {
      const r = await cli.get(caminho);
      expect.soft(r.status, `${caminho}: ${resumo(r)}`).toBe(200);
      expect.soft(r.headers['cache-control'], `${caminho}: ${resumo(r)}`).toBe('no-store');
    }
  });

  test('coordenação: liberacoes (e-mails de todos), parcerias/admin/candidaturas e duvidas/pendentes → 200 no-store', async ({ request }) => {
    const admin = await P.criarUsuario(request, { papel: 'admin' });
    const cli = P.api(request, admin.token);
    for (const caminho of ['/api/liberacoes', '/api/parcerias/admin/candidaturas?programa=partner-lawyers', '/api/duvidas/pendentes']) {
      const r = await cli.get(caminho);
      expect.soft(r.status, `${caminho}: ${resumo(r)}`).toBe(200);
      expect.soft(r.headers['cache-control'], `${caminho}: ${resumo(r)}`).toBe('no-store');
    }
  });

  test('signup e signin legados (POST, devolvem o token) → no-store', async ({ request }) => {
    await P.exigirMongo(request);
    const cli = P.api(request);
    const email = `${P.uid('qa-cache')}@exemplo.invalid`;
    const senha = `Qa-${P.uid('senha')}`;
    const cadastro = await cli.post('/api/auth/signup', { email, senha, nome: 'Pessoa QA cache' });
    expect.soft(cadastro.status, `signup: ${resumo(cadastro)}`).toBe(201);
    expect.soft(cadastro.headers['cache-control'], 'signup').toBe('no-store');
    const entrada = await cli.post('/api/auth/signin', { email, senha });
    expect.soft(entrada.status, `signin: ${resumo(entrada)}`).toBe(200);
    expect.soft(entrada.headers['cache-control'], 'signin').toBe('no-store');
  });

  test('sem sessão: 401 de rota legada e 404 da API → no-store', async ({ request }) => {
    await P.exigirMongo(request);
    const cli = P.api(request);
    const semToken = await cli.get('/api/auth/me');
    expect.soft(semToken.status, resumo(semToken)).toBe(401);
    expect.soft(semToken.headers['cache-control'], '/api/auth/me sem token').toBe('no-store');
    const inexistente = await cli.get(`/api/${P.uid('rota-inexistente')}`);
    expect.soft(inexistente.status, resumo(inexistente)).toBe(404);
    expect.soft(inexistente.headers['cache-control'], '404 da API').toBe('no-store');
  });

  test('quem quer cache mantém o seu: GET /api/vitrine/cursos → public, max-age=300', async ({ request }) => {
    await P.exigirMongo(request);
    const r = await P.api(request).get('/api/vitrine/cursos');
    expect(r.status, resumo(r)).toBe(200);
    expect(r.headers['cache-control'], resumo(r)).toBe('public, max-age=300');
  });
});
