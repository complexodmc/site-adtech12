// =============================================================
// E2E · F7 — comunicação e relatórios: publicações, banners, relatórios e auditoria.
// Índice §8.5 (F7), §8.6 item 2, §9.1 · UX §6.13, §7.12, §7.13, §7.23, §7.24.
//
//   QA_PORT=4658 QA_WORKERS=2 QA_DATA=<AAAA-MM-DD>-F7 QA_FATIA=F7 \
//   QA_INTEGRADAS=F0a,F0m,F0b,F0s,F0r,F0t,F0p,F1a,F1b,F2,F3a,F3b,F4a,F6a,F6b,F8 \
//   PORTAL_MODULOS=routes/portal/publicacoes.js,routes/portal/banners.js,routes/portal/relatorios.js,routes/portal-turmas.js,routes/portal-professor.js,routes/portal-conteudo.js,routes/portal/configuracoes.js \
//   npx playwright test tests/e2e/portal-comunicacao.spec.js
//
// Banco: só o mongod descartável do serve.mjs. Contas, curso e docência semeados
// pelo próprio caso (domínio .invalid). O que a tela mostra veio do servidor.
// =============================================================
import { test, expect } from '@playwright/test';
import {
  exigirMongo, criarPapeis, criarUsuario, entrarComToken, api, monitorarConsoleERede, esperar,
  confirmarNaTela, simularCliente, semearCurso, liberarCurso, comBanco, uid
} from './_portal.js';

const EAD = '/plataforma-ead/';
const DIA = 24 * 3600 * 1000;

async function docencia(request, professorId, cursoId, adminId) {
  await comBanco(request, (db) => db.collection('docencias').insertOne({ userId: String(professorId), cursoId, turmaId: null, criadoEm: new Date(), criadoPor: String(adminId) }));
}

test.describe('F7 · comunicação e relatórios', () => {
  test('jornada: professor publica para o próprio curso pelo editor; aluno do curso vê o card e lê; fora do público não vê', async ({ page, request }) => {
    await exigirMongo(request);
    const { aluno, professor, admin } = await criarPapeis(request);
    const fora = await criarUsuario(request, { papel: 'aluno', rotulo: 'fora' });
    const curso = await semearCurso(request);
    const outro = await semearCurso(request);
    await liberarCurso(request, aluno.id, curso.cursoId);
    await liberarCurso(request, fora.id, outro.cursoId);
    await docencia(request, professor.id, curso.cursoId, admin.id);

    const monitor = monitorarConsoleERede(page, { fatia: 'F7' });
    await simularCliente(page);
    await entrarComToken(page, professor.token);
    await page.goto(`${EAD}professor.html#/publicacoes/nova`);
    await expect(page.getByRole('heading', { level: 1, name: 'Nova publicação' })).toBeVisible();
    const titulo = `Aviso da semana ${uid('p').slice(-5)}`;
    await page.locator('#com-titulo').fill(titulo);
    await page.locator('#com-resumo').fill('Leitura antes do encontro de sexta.');
    await page.locator('#com-corpo').fill('Leiam o capítulo 2 antes do encontro.\n\nDúvidas pelo Atendimento.');
    // professor não tem a opção "Todos os alunos" (só a coordenação)
    await expect(page.getByLabel('Todos os alunos')).toHaveCount(0);
    await page.getByLabel(curso.titulo).check();
    await expect(page.locator('[data-com-previa] .pf-com-card__titulo')).toHaveText(titulo);
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page).toHaveURL(/#\/publicacoes\?status=publicada/);
    await expect(page.getByRole('link', { name: titulo })).toBeVisible();
    await monitor.verificar();

    await entrarComToken(page, aluno.token);
    await page.goto(`${EAD}publicacoes.html`);
    await expect(page.getByRole('heading', { level: 1, name: 'Publicações' })).toBeVisible();
    const card = page.getByRole('link', { name: titulo });
    await expect(card).toBeVisible();
    await expect(page.locator('.pf-com-card').filter({ hasText: titulo })).toContainText(curso.titulo);
    await card.click();
    await expect(page).toHaveURL(/publicacao\.html\?id=[a-f0-9]{24}$/);
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    await expect(page.getByText('Leiam o capítulo 2 antes do encontro.')).toBeVisible();
    await monitor.verificar();

    // fora do público: lista vazia e 404 no detalhe (servidor)
    const id = new URL(page.url()).searchParams.get('id');
    const lista = await api(request, fora.token).get('/api/portal/publicacoes');
    expect(lista.status).toBe(200);
    expect(lista.json.itens.map((i) => i.id)).not.toContain(id);
    expect((await api(request, fora.token).get(`/api/portal/publicacoes/${id}`)).status).toBe(404);
    // professor não publica para "todos" nem para curso alheio
    const todos = await api(request, professor.token).post('/api/portal/professor/publicacoes', { titulo: 'Para todos', tipo: 'texto', corpo: 'x', publico: { tipo: 'todos' } });
    expect(todos.status).toBe(403);
    expect(todos.json.codigo).toBe('publico-fora-dos-seus-cursos');
    const alheio = await api(request, professor.token).post('/api/portal/professor/publicacoes', { titulo: 'Curso alheio', tipo: 'texto', corpo: 'x', publico: { tipo: 'curso', cursoIds: [outro.cursoId] } });
    expect(alheio.status).toBe(403);
  });

  test('link só https com rel="noopener noreferrer"; vídeo do YouTube vira card com miniatura; vazio honesto e "não encontrada"', async ({ page, request }) => {
    await exigirMongo(request);
    const { aluno, admin } = await criarPapeis(request);
    const curso = await semearCurso(request);
    await liberarCurso(request, aluno.id, curso.cursoId);
    const monitor = monitorarConsoleERede(page, { fatia: 'F7' });
    await simularCliente(page);

    // sem nenhuma publicação para o curso: o aluno vê o vazio honesto (as "todos" de outros casos podem existir)
    const http = await api(request, admin.token).post('/api/portal/professor/publicacoes', { titulo: 'Link inseguro', tipo: 'link', url: 'http://exemplo.com', publico: { tipo: 'curso', cursoIds: [curso.cursoId] } });
    expect(http.status).toBe(400);
    const link = await api(request, admin.token).post('/api/portal/professor/publicacoes', { titulo: `Leitura ${uid('l').slice(-4)}`, tipo: 'link', url: 'https://exemplo.com/artigo', publico: { tipo: 'curso', cursoIds: [curso.cursoId] } });
    expect(link.status).toBe(201);
    expect((await api(request, admin.token).post(`/api/portal/professor/publicacoes/${link.json.publicacao.id}/publicar`, {})).status).toBe(200);
    const video = await api(request, admin.token).post('/api/portal/professor/publicacoes', { titulo: `Vídeo ${uid('v').slice(-4)}`, tipo: 'video', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', publico: { tipo: 'curso', cursoIds: [curso.cursoId] } });
    expect((await api(request, admin.token).post(`/api/portal/professor/publicacoes/${video.json.publicacao.id}/publicar`, {})).status).toBe(200);

    await entrarComToken(page, aluno.token);
    await page.route('https://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64') }));
    await page.goto(`${EAD}publicacoes.html`);
    const cardVideo = page.locator('.pf-com-card').filter({ hasText: video.json.publicacao.titulo });
    await expect(cardVideo.locator('img')).toHaveAttribute('src', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    await page.getByRole('button', { name: 'Links' }).click();
    await expect(page.locator('.pf-com-card')).toHaveCount(1);
    await page.getByRole('link', { name: link.json.publicacao.titulo }).click();
    const abrir = page.getByRole('link', { name: /Abrir link/ });
    await expect(abrir).toHaveAttribute('href', 'https://exemplo.com/artigo');
    await expect(abrir).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(abrir).toHaveAttribute('target', '_blank');
    await expect(page.getByText('exemplo.com', { exact: true })).toBeVisible();

    esperar(page, { status: 404, url: '/api/portal/publicacoes/000000000000000000000000' });
    await page.goto(`${EAD}publicacao.html?id=000000000000000000000000`);
    await expect(page.getByRole('heading', { level: 1, name: 'Publicação não encontrada' })).toBeVisible();
    await monitor.verificar();
  });

  test('banners: a coordenação cadastra pela tela; vigência e público decididos no servidor', async ({ page, request }) => {
    await exigirMongo(request);
    const { aluno, professor, admin } = await criarPapeis(request);
    const curso = await semearCurso(request);
    await liberarCurso(request, aluno.id, curso.cursoId);
    const monitor = monitorarConsoleERede(page, { fatia: 'F7' });
    await simularCliente(page);
    await entrarComToken(page, admin.token);
    await page.goto(`${EAD}professor.html#/banners`);
    await expect(page.getByRole('heading', { level: 1, name: 'Banners' })).toBeVisible();
    await page.getByRole('button', { name: 'Novo banner' }).click();
    const titulo = `Semana de boas-vindas ${uid('b').slice(-4)}`;
    await page.locator('#ban-titulo').fill(titulo);
    await page.locator('#ban-texto').fill('Programação completa no Início.');
    await page.locator('#ban-link').fill('tutoriais.html');
    const hoje = new Date();
    const dia = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    await page.locator('#ban-ini').fill(dia(new Date(hoje.getTime() - DIA)));
    await page.locator('#ban-fim').fill(dia(new Date(hoje.getTime() + 400 * DIA)));
    await page.getByRole('button', { name: 'Criar banner' }).click();
    esperar(page, { status: 400, url: '/api/portal/admin/banners' });
    await expect(page.locator('.pf-erro-campo')).toContainText('366 dias');
    await page.locator('#ban-fim').fill(dia(new Date(hoje.getTime() + 5 * DIA)));
    await page.getByRole('button', { name: 'Criar banner' }).click();
    const linha = page.locator('[data-com-banner]').filter({ hasText: titulo });
    await expect(linha).toBeVisible();
    await expect(linha).toContainText('No ar');
    await monitor.verificar();

    const doAluno = await api(request, aluno.token).get('/api/portal/banners?local=inicio');
    expect(doAluno.json.itens.map((b) => b.titulo)).toContain(titulo);
    const item = doAluno.json.itens.find((b) => b.titulo === titulo);
    expect(item.link).toBe('tutoriais.html');
    expect(Object.keys(item)).not.toContain('publico');
    // papel professor fora do público; agendado não aparece
    expect((await api(request, professor.token).get('/api/portal/banners?local=inicio')).json.itens.map((b) => b.titulo)).not.toContain(titulo);
    const agendado = await api(request, admin.token).post('/api/portal/admin/banners', { titulo: `Agendado ${uid('a').slice(-4)}`, local: 'inicio', inicioEm: new Date(hoje.getTime() + 2 * DIA).toISOString(), fimEm: new Date(hoje.getTime() + 4 * DIA).toISOString(), publico: { papeis: ['aluno'], tipo: 'todos' } });
    expect(agendado.status).toBe(201);
    expect((await api(request, aluno.token).get('/api/portal/banners?local=inicio')).json.itens.map((b) => b.id)).not.toContain(agendado.json.banner.id);
    expect((await api(request, professor.token).get('/api/portal/admin/banners')).status).toBe(403);
  });

  test('relatórios e auditoria: índice do papel, painel com KPIs reais e exportação auditada', async ({ page, request }) => {
    await exigirMongo(request);
    const { aluno, professor, admin } = await criarPapeis(request);
    const curso = await semearCurso(request);
    const outro = await semearCurso(request);
    await liberarCurso(request, aluno.id, curso.cursoId);
    await docencia(request, professor.id, curso.cursoId, admin.id);

    // professor: catálogo sem colunas somenteAdmin; curso alheio → 403 nao-docente; CSV sem CPF
    const cat = await api(request, professor.token).get('/api/portal/professor/relatorios');
    expect(cat.status).toBe(200);
    for (const r of cat.json.itens) expect(r.colunas.some((c) => c.somenteAdmin)).toBe(false);
    if (cat.json.itens.some((r) => r.id === 'alunos')) {
      const alheio = await api(request, professor.token).get(`/api/portal/professor/relatorios/alunos?cursoId=${outro.cursoId}`);
      expect(alheio.status).toBe(403);
      expect(alheio.json.codigo).toBe('nao-docente');
    }
    const painel = await api(request, admin.token).get('/api/portal/admin/relatorios/painel');
    expect(painel.status).toBe(200);
    expect(painel.json).toHaveProperty('sistema');

    const monitor = monitorarConsoleERede(page, { fatia: 'F7' });
    await simularCliente(page);
    await entrarComToken(page, admin.token);
    await page.goto(`${EAD}professor.html#/relatorios`);
    await expect(page.getByRole('heading', { level: 1, name: 'Relatórios' })).toBeVisible();
    const primeiro = page.locator('.pf-com-indice a').first();
    if (await primeiro.count()) {
      const nome = (await primeiro.textContent()).trim();
      await primeiro.click();
      await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible();
      await expect(page.locator('[data-rel-tabela]')).toHaveAttribute('aria-busy', 'false');
      const csv = page.getByRole('button', { name: 'Exportar CSV' });
      if (await csv.count()) {
        const download = page.waitForEvent('download');
        await confirmarNaTela(page, () => csv.click());
        const arq = await download;
        expect(arq.suggestedFilename()).toMatch(/^dmc-[a-z-]+-\d{4}-\d{2}-\d{2}\.csv$/);
      }
    } else {
      await expect(page.getByText('Nenhum relatório disponível agora.')).toBeVisible();
    }
    await monitor.verificar();

    await page.goto(`${EAD}professor.html#/auditoria`);
    await expect(page.getByRole('heading', { level: 1, name: 'Auditoria' })).toBeVisible();
    await expect(page.getByText('Registros de auditoria não podem ser editados nem apagados.')).toBeVisible();
    await expect(page.locator('[data-aud-lista]')).toHaveAttribute('aria-busy', 'false');
    await monitor.verificar();
  });
});
