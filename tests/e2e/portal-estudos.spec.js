// =============================================================
// E2E da F1b — telas de estudos (Início, Meus cursos, player).
// Spec: PORTAL-ACADEMICO.md §8.5 (linha F1b), §8.6, D-74, D-77; PORTAL-UX.md §6.1–§6.3.
//
// Roda no serve.mjs (mongod descartável). Os casos valem nos dois modos do
// estudos-dados.js: com as rotas da F1a montadas ("servidor") e, enquanto não
// estiverem, no modo de compatibilidade ("legado"); o que só existe no modo
// servidor (% assistido gravado) é conferido quando a F1a está montada.
// Vídeo: YouTube por page.route (stub), MP4 de mesma origem a partir de
// tests/fixtures/video-teste.mp4 (VP9, toca no Chromium do Playwright).
//
//   QA_PORT=4658 QA_FATIA=F1b QA_DATA=<data>-f1b npx playwright test tests/e2e/portal-estudos.spec.js
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as P from './_portal.js';

const EAD = P.BASE_EAD;
const caminhoDe = (resp) => new URL(resp.url()).pathname;
const FIXTURE_MP4 = fs.readFileSync(path.join(P.RAIZ, 'tests', 'fixtures', 'video-teste.mp4'));
const YT_ID = 'dQw4w9WgXcQ';

async function fechar(mon) {
  await mon.anexar('console-e-rede');
  await mon.verificar({ rotulo: 'console, pageerror e respostas' });
}

async function rotearYoutube(page) {
  await page.route('https://www.youtube-nocookie.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="pt-BR"><title>stub QA</title><body></body></html>' }));
}
async function rotearMp4Real(page) {
  await page.route('**/qa/video-teste.mp4', (r) => r.fulfill({ status: 200, contentType: 'video/mp4', body: FIXTURE_MP4, headers: { 'accept-ranges': 'none' } }));
}

/** Aluno com UM curso liberado; `concluidas` = índices de aulas já concluídas. */
async function alunoComCurso(request, { aulas, concluidas = [], titulo = null } = {}) {
  const aluno = await P.criarUsuario(request);
  const C = await P.semearCurso(request, { aulas, titulo });
  await P.liberarCurso(request, aluno.id, C.cursoId);
  if (concluidas.length) await P.concluirAulas(request, aluno.id, concluidas.map((i) => C.aulas[i].id));
  return { aluno, C };
}

const modoDe = (page) => page.evaluate(() => (window.DMC_Estudos ? window.DMC_Estudos.modo() : null));

test.describe.configure({ mode: 'parallel' });

test('F1b · Início: herói do curso ativo, meus cursos, trilha e outros cursos; troca de curso sem recarregar', async ({ page, request }) => {
  await P.exigirMongo(request);
  const aluno = await P.criarUsuario(request);
  const A = await P.semearCurso(request, { aulas: [{}, {}, {}] });
  const B = await P.semearCurso(request, { aulas: [{}, {}] });
  const S = await P.semearCurso(request);
  await P.liberarCurso(request, aluno.id, A.cursoId);
  await P.liberarCurso(request, aluno.id, B.cursoId);
  await P.concluirAulas(request, aluno.id, [A.aulas[0].id]);
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token, { 'dmc:cursoEscolhido': null });

  await page.goto(`${EAD}dashboard.html?curso=${A.cursoId}`);
  const heroi = page.locator('#inicio-heroi');
  await expect(heroi.getByRole('heading', { level: 1 })).toHaveText(A.titulo);
  await expect(heroi).toContainText('33% concluído · 1 de 3 aulas');
  const acessar = heroi.getByRole('link', { name: 'Acessar aulas' });
  expect(await acessar.getAttribute('href')).toContain(`curso=${A.cursoId}`);
  expect(await heroi.getByRole('link', { name: 'Acadêmico' }).getAttribute('href')).toBe(`academico.html?curso=${A.cursoId}`);
  // O "Módulos 10" fixo do HTML antigo não existe mais.
  await expect(page.locator('[data-stat-modulos]')).toHaveCount(0);

  // ③ Meus cursos: os dois liberados; ⑥ Outros cursos: o não liberado, levando à loja.
  const capas = page.locator('#inicio-meus-cursos');
  await expect(capas.locator(`a[data-curso-id="${A.cursoId}"]`)).toHaveAttribute('aria-current', 'true');
  await expect(capas.locator(`a[data-curso-id="${B.cursoId}"]`)).toBeVisible();
  await expect(page.locator(`#catalog-track [data-curso-id="${S.cursoId}"] a[href="loja.html?destacar=${S.cursoId}"]`)).toBeVisible();
  await expect(capas.locator(`[data-curso-id="${S.cursoId}"]`)).toHaveCount(0);

  // ⑤ Trilha do curso ativo com a aula (R4 preservado).
  await expect(page.locator(`#modules-list [data-aula-id="${A.aulas[1].id}"]`)).toBeVisible();

  // Trocar de curso pela capa: redesenha herói e trilha, foco no H1, escolha persiste.
  await page.evaluate(() => { window.__qaSemRecarga = true; });
  await capas.locator(`a[data-curso-id="${B.cursoId}"]`).click();
  await expect(heroi.getByRole('heading', { level: 1 })).toHaveText(B.titulo);
  await expect(heroi.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.locator(`#modules-list [data-aula-id="${B.aulas[0].id}"]`)).toBeAttached();
  await expect(capas.locator(`a[data-curso-id="${B.cursoId}"]`)).toHaveAttribute('aria-current', 'true');
  expect(await page.evaluate(() => localStorage.getItem('dmc:cursoEscolhido'))).toBe(B.cursoId);
  expect(page.url()).toContain(`curso=${B.cursoId}`);
  expect(await page.evaluate(() => window.__qaSemRecarga === true), 'a troca de curso não recarrega a página').toBe(true);
  await fechar(mon);
});

test('F1b · Início sem curso liberado: vazio honesto com caminhos', async ({ page, request }) => {
  await P.exigirMongo(request);
  const aluno = await P.criarUsuario(request);
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token, { 'dmc:cursoEscolhido': null });
  await page.goto(`${EAD}dashboard.html`);
  await expect(page.locator('#inicio-heroi')).toContainText('Você ainda não tem um curso liberado.');
  await expect(page.locator('#inicio-heroi').getByRole('link', { name: 'Ver cursos disponíveis' })).toHaveAttribute('href', 'loja.html');
  await expect(page.locator('#inicio-meus-cursos')).toBeHidden();
  await fechar(mon);
});

test('F1b · Meus cursos: "Continuar" leva ao primeiro conteúdo pendente (corrige aula.html?id=undefined)', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { aluno, C } = await alunoComCurso(request, { aulas: [{}, {}, {}], concluidas: [0] });
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}meus-cursos.html`);
  const lista = page.locator('#meus-cursos-lista');
  await expect(lista).toContainText(C.titulo);
  await expect(lista).toContainText('33% · 1 de 3 aulas');
  // Filtros com contagem
  await expect(page.getByRole('button', { name: 'Em andamento (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Concluídos (0)' }).click();
  await expect(lista).toContainText('Nenhum curso concluído ainda.');
  await page.getByRole('button', { name: 'Todos (1)' }).click();

  const continuar = lista.getByRole('link', { name: new RegExp(`^Continuar`) });
  const href = await continuar.getAttribute('href');
  expect(href).not.toContain('undefined');
  await continuar.click();
  await expect(page).toHaveURL(new RegExp(`aula\\.html\\?curso=${C.cursoId}.*item=aula%3A${C.aulas[1].id}`));
  await expect(page.locator('#player-titulo')).toHaveText(C.aulas[1].titulo);
  await fechar(mon);
});

test('F1b · player: YouTube (watch, youtu.be, shorts) vira youtube-nocookie.com/embed por DOM API', async ({ page, request }) => {
  await P.exigirMongo(request);
  const urls = [`https://www.youtube.com/watch?v=${YT_ID}`, `https://youtu.be/${YT_ID}`, `https://www.youtube.com/shorts/${YT_ID}`];
  const { aluno, C } = await alunoComCurso(request, { aulas: urls.map((videoUrl) => ({ videoUrl })) });
  const mon = P.monitorarConsoleERede(page);
  await rotearYoutube(page);
  await P.entrarComToken(page, aluno.token);
  for (const aula of C.aulas) {
    await page.goto(`${EAD}aula.html?id=${encodeURIComponent(aula.id)}`);
    await expect(page.locator('#player-root')).toContainText(aula.titulo);
    const iframe = page.locator('#player-stage iframe');
    await expect(iframe).toHaveCount(1);
    const src = await iframe.getAttribute('src');
    expect(src, aula.titulo).toMatch(new RegExp(`^https://www\\.youtube-nocookie\\.com/embed/${YT_ID}\\?`));
    expect(src).toContain('enablejsapi=1');
    expect(await iframe.getAttribute('title')).toBe(`Vídeo: ${aula.titulo}`);
    expect(await iframe.getAttribute('allowfullscreen')).not.toBeNull();
  }
  await fechar(mon);
});

test('F1b · player: navegação linear "n de N" e conclusão por teclado, anunciadas', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { aluno, C } = await alunoComCurso(request, { aulas: [{}, {}, {}, { disponivel: false }] });
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}aula.html?curso=${C.cursoId}`);
  const posicao = page.locator('[data-player-posicao]');
  await expect(posicao).toHaveAttribute('aria-live', 'polite');
  await expect(posicao).toHaveText(/^1 de 3 · Módulo 01$/);
  await expect(page.locator('#player-titulo')).toHaveText(C.aulas[0].titulo);
  await expect(page.locator('#btn-prev')).toBeDisabled();

  // Próximo por teclado
  await page.locator('#btn-next').focus();
  await page.keyboard.press('Enter');
  await expect(posicao).toHaveText(/^2 de 3/);
  await expect(page.locator('#player-titulo')).toHaveText(C.aulas[1].titulo);
  await expect(page).toHaveURL(new RegExp(`item=aula%3A${C.aulas[1].id}`));

  // Conclusão por teclado: PUT legado, rótulo troca (sem aria-pressed) e anúncio
  const done = page.locator('#btn-done');
  await expect(done).toHaveAttribute('aria-label', 'Marcar como concluído');
  expect(await done.getAttribute('aria-pressed')).toBeNull();
  const put = page.waitForResponse((r) => r.request().method() === 'PUT' && caminhoDe(r) === `/api/progresso/${C.aulas[1].id}`);
  await done.focus();
  await page.keyboard.press('Enter');
  expect((await put).ok()).toBe(true);
  await expect(done).toHaveAttribute('aria-label', 'Desmarcar conclusão');
  await expect(page.locator('[data-player-estado]')).toContainText('Concluído');
  await expect.poll(() => page.locator('[role="status"], [aria-live]').filter({ hasText: 'Aula concluída.' }).count()).toBeGreaterThan(0);

  // Aula "em breve" na coluna: sem link, com cadeado e "Em breve" no nome acessível
  const bloqueada = page.locator('#player-modulos .pf-est-item.is-bloqueado');
  await expect(bloqueada).toHaveCount(1);
  await expect(bloqueada).toContainText('(Em breve)');

  // Voltar do navegador volta ao item anterior
  await page.goBack();
  await expect(posicao).toHaveText(/^1 de 3/);
  await fechar(mon);
});

test('F1b · player: materiais aparecem e baixam (PDF autenticado e link em nova aba)', async ({ page, request }) => {
  await P.exigirMongo(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  const { aluno, C } = await alunoComCurso(request, { aulas: [{}] });
  const aulaId = C.aulas[0].id;
  const A = P.api(request, admin.token);
  const up = await A.bruto('POST', `/api/aulas/${aulaId}/materiais?nome=${encodeURIComponent('Texto-base.pdf')}`, { headers: { 'content-type': 'application/pdf' }, data: P.PDF_MINIMO });
  expect(up.status(), await up.text()).toBeLessThan(300);
  const ln = await A.post(`/api/aulas/${aulaId}/materiais/link`, { nome: 'Leitura complementar', url: 'https://exemplo.invalid/leitura' });
  expect(ln.status, JSON.stringify(ln.json)).toBeLessThan(300);

  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}aula.html?id=${encodeURIComponent(aulaId)}`);
  const mats = page.locator('#player-materiais');
  await expect(mats).toBeVisible();
  await expect(mats).toContainText('Texto-base.pdf');
  await expect(mats).toContainText('Leitura complementar');
  const link = mats.locator('a[href="https://exemplo.invalid/leitura"]');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);

  // PDF: download autenticado (ou aba nova, quando o núcleo abre PDF em blob:)
  const download = page.waitForEvent('download', { timeout: 10_000 }).then((d) => ({ tipo: 'download', nome: d.suggestedFilename() })).catch(() => null);
  const aba = page.context().waitForEvent('page', { timeout: 10_000 }).then(() => ({ tipo: 'aba' })).catch(() => null);
  const req = page.waitForResponse((r) => /\/api\/(portal\/)?materiais\//.test(caminhoDe(r)) && r.request().method() === 'GET');
  await mats.getByRole('button', { name: /Baixar/ }).click();
  expect((await req).status()).toBe(200);
  const res = await Promise.race([download, aba]);
  expect(res, 'o material abriu ou baixou').not.toBeNull();
  if (res.tipo === 'download') expect(res.nome).toBe('Texto-base.pdf');

  // Os materiais também estão na coluna, na seção "Material de apoio"
  await expect(page.locator('#player-modulos')).toContainText('Material de apoio');
  await fechar(mon);
});

test('F1b · player: MP4 de mesma origem toca e mede o % assistido', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { aluno, C } = await alunoComCurso(request, { aulas: [{ videoUrl: '/qa/video-teste.mp4' }] });
  const aula = C.aulas[0];
  const mon = P.monitorarConsoleERede(page);
  await rotearMp4Real(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}aula.html?id=${encodeURIComponent(aula.id)}`);
  const video = page.locator('#player-stage video');
  await expect(video).toHaveCount(1);
  expect(await video.evaluate((v) => v.src)).toBe(new URL('/qa/video-teste.mp4', page.url()).href);
  const modo = await modoDe(page);
  const assistido = modo === 'servidor'
    ? page.waitForResponse((r) => r.request().method() === 'POST' && caminhoDe(r) === `/api/portal/aulas/${aula.id}/assistido`)
    : null;
  await video.evaluate(async (v) => { v.muted = true; v.playbackRate = 4; await v.play(); });
  await expect.poll(() => video.evaluate((v) => v.ended), { timeout: 15_000 }).toBe(true);
  await expect(page.locator('[data-player-assistido]')).toContainText(/Assistido \d+% \(medido pelo navegador\)/);
  if (assistido) {
    const r = await assistido;
    expect(r.status()).toBe(200);
    const corpo = r.request().postDataJSON();
    expect(corpo.fonte).toBe('nativo');
    expect(corpo.pct).toBeGreaterThan(0);
  }
  await fechar(mon);
});

test('F1b · contagens iguais em Início, Meus cursos e player (regra única: aula em breve fora da conta)', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { aluno, C } = await alunoComCurso(request, { aulas: [{}, {}, {}, { disponivel: false }], concluidas: [0, 1] });
  const mon = P.monitorarConsoleERede(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await P.entrarComToken(page, aluno.token);
  // Regra única (API §6.5): % = piso(concluídas disponíveis ÷ disponíveis); 2 de 3 → 66%.
  await page.goto(`${EAD}dashboard.html?curso=${C.cursoId}`);
  await expect(page.locator('#inicio-heroi')).toContainText('66% concluído · 2 de 3 aulas');
  await page.goto(`${EAD}meus-cursos.html`);
  await expect(page.locator('#meus-cursos-lista')).toContainText('66% · 2 de 3 aulas');
  await page.goto(`${EAD}aula.html?curso=${C.cursoId}`);
  await expect(page.locator('[data-player-progresso]')).toContainText('66% do curso');
  await expect(page.locator('#player-modulos .pf-est-modulo__meta').first()).toContainText(/2 de 3 aulas · 66%$/);
  await fechar(mon);
});

test('F1b · capas: sem imagem, capa tipográfica; com capa 16:9, recorte central; miniatura do módulo com o número', async ({ page, request }) => {
  await P.exigirMongo(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  const aluno = await P.criarUsuario(request);
  const semCapa = await P.semearCurso(request);
  const comCapa = await P.semearCurso(request);
  await P.liberarCurso(request, aluno.id, semCapa.cursoId);
  await P.liberarCurso(request, aluno.id, comCapa.cursoId);
  const up = await P.api(request, admin.token).bruto('POST', `/api/cursos/${comCapa.cursoId}/capa`, { headers: { 'content-type': 'image/png' }, data: P.PNG_1PX });
  expect(up.status(), await up.text()).toBeLessThan(300);
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}meus-cursos.html`);
  const cartaoSem = page.locator(`#meus-cursos-lista [data-curso="${semCapa.cursoId}"]`);
  await expect(cartaoSem.locator('.pf-est-capa-tipo')).toHaveText(semCapa.titulo);
  const img = page.locator(`#meus-cursos-lista [data-curso="${comCapa.cursoId}"] img`);
  await expect(img).toHaveCount(1);
  expect(await img.evaluate((i) => getComputedStyle(i).objectFit)).toBe('cover');
  expect(await img.evaluate((i) => getComputedStyle(i).objectPosition)).toBe('50% 50%');
  await page.goto(`${EAD}aula.html?curso=${semCapa.cursoId}`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('#player-modulos .pf-est-mini--numero').first()).toHaveText('01');
  await fechar(mon);
});

test('F1b · player sem acesso: vazio honesto, nenhum vídeo', async ({ page, request }) => {
  await P.exigirMongo(request);
  const aluno = await P.criarUsuario(request);
  const S = await P.semearCurso(request, { aulas: [{ videoUrl: P.URL_VIMEO }] });
  const mon = P.monitorarConsoleERede(page);
  P.esperar(page, { status: 403, url: `/api/portal/cursos/${S.cursoId}/trilha` });
  await P.rotearVimeo(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}aula.html?curso=${S.cursoId}`);
  await expect(page.locator('#player-root')).toContainText('Este curso não está liberado na sua conta.');
  await expect(page.getByRole('link', { name: 'Ver cursos disponíveis' })).toHaveAttribute('href', `loja.html?destacar=${S.cursoId}`);
  await expect(page.locator('iframe, video')).toHaveCount(0);
  await fechar(mon);
});

test('F1b · sem rolagem horizontal de 320 a 1920 (texto nível 0 e 2) e 0 violação da CSP estrita nas três telas', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { aluno, C } = await alunoComCurso(request, { aulas: [{ videoUrl: `https://www.youtube.com/watch?v=${YT_ID}` }, {}], titulo: 'Arquitetura Patrimonial Estratégica com um título propositalmente longo para quebrar linha' });
  const mon = P.monitorarConsoleERede(page);
  await rotearYoutube(page);
  await page.addInitScript(() => {
    window.__qaCsp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__qaCsp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await P.entrarComToken(page, aluno.token);
  for (const fonte of ['0', '2']) {
    await page.evaluate((f) => localStorage.setItem('dmc:fonte', f), fonte);
    for (const url of [`dashboard.html?curso=${C.cursoId}`, 'meus-cursos.html', `aula.html?curso=${C.cursoId}`]) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${EAD}${url}`);
      await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
      for (const largura of [320, 390, 768, 1024, 1280, 1440, 1920]) {
        await page.setViewportSize({ width: largura, height: 900 });
        await page.waitForTimeout(80);
        const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        expect(sw, `${url} em ${largura}px, texto nível ${fonte}: scrollWidth ${sw} > ${cw}`).toBeLessThanOrEqual(cw);
      }
      const csp = await page.evaluate(() => window.__qaCsp || []);
      expect(csp, `CSP em ${url}`).toEqual([]);
    }
  }
  await fechar(mon);
});

test('F1b · Plano de ensino: a coordenação edita no backoffice (salva no blur) e o aluno lê no player', async ({ page, request }) => {
  await P.exigirMongo(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  const { aluno, C } = await alunoComCurso(request, { aulas: [{}, {}] });
  const sonda = `/api/portal/professor/cursos/${C.cursoId}/planos`;
  if (!(await P.fatiaMontada(request, admin.token, sonda))) {
    test.info().annotations.push({ type: 'bloqueado', description: 'rotas de plano da F1a não montadas neste servidor' });
    test.skip(true, 'bloqueado: F1a');
  }
  const mon = P.monitorarConsoleERede(page);
  // professor.html (F8) já referencia qr.js (F0b) e tutoriais.js (F0r), ainda ausentes no disco
  // nesta fase: 404 de asset de fase 0 fora da posse da F1b, declarado só enquanto o arquivo não existir.
  for (const nome of ['qr', 'tutoriais']) {
    if (!fs.existsSync(path.join(P.EAD_DISCO, 'js', 'portal', `${nome}.js`))) P.esperar(page, { status: 404, url: new RegExp(`/js/portal/${nome}\\.js`) });
  }
  await P.entrarComToken(page, admin.token);
  await page.goto(`${EAD}professor.html#/cursos/${C.cursoId}/plano`);
  const putPlano = () => page.waitForResponse((r) => r.request().method() === 'PUT' && caminhoDe(r) === `/api/portal/professor/modulos/${C.moduloId}/plano`);

  const ementa = page.locator('#pe-ementa');
  await expect(ementa).toBeVisible();
  await ementa.fill('Ementa de teste do módulo.');
  let put = putPlano();
  await ementa.press('Tab');
  expect((await put).status()).toBe(200);
  await expect(page.locator('[data-pe-estado]')).toContainText('Salvo às');

  const objetivos = page.locator('#pe-objetivos');
  await objetivos.fill('Objetivo A\nObjetivo B');
  put = putPlano();
  await objetivos.press('Tab');
  expect((await put).status()).toBe(200);
  await expect(page.locator('[data-pe-contador="objetivos"]')).toContainText('2 de 30');

  put = putPlano();
  await page.locator('[data-pe-montar]').click();
  expect((await put).status()).toBe(200);
  await expect(page.locator('[data-pe-linha]')).toHaveCount(2);
  await fechar(mon);

  // O aluno vê o plano como primeiro conteúdo do módulo, com o cronograma ligando às aulas.
  const mon2 = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}aula.html?curso=${C.cursoId}&modulo=${C.moduloId}&item=${encodeURIComponent(`plano:${C.moduloId}`)}`);
  const palco = page.locator('#player-stage');
  await expect(palco).toContainText('Ementa de teste do módulo.');
  await expect(palco.getByRole('listitem').filter({ hasText: 'Objetivo B' })).toHaveCount(1);
  await expect(palco.getByRole('link', { name: C.aulas[0].titulo })).toBeVisible();
  await expect(page.locator('[data-player-posicao]')).toHaveText(/^1 de 3/);
  await fechar(mon2);
});

test('F1b · axe: 0 serious/critical nas três telas, temas escuro e claro, 1440 e 390', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { aluno, C } = await alunoComCurso(request, { aulas: [{ videoUrl: `https://www.youtube.com/watch?v=${YT_ID}` }, {}, { disponivel: false }], concluidas: [1] });
  const mon = P.monitorarConsoleERede(page);
  await rotearYoutube(page);
  await P.entrarComToken(page, aluno.token);
  const telas = [[`dashboard.html?curso=${C.cursoId}`, '#conteudo'], ['meus-cursos.html', '#conteudo'], [`aula.html?curso=${C.cursoId}`, '#player-root']];
  const graves = [];
  for (const tema of ['escuro', 'claro']) {
    await page.evaluate((t) => localStorage.setItem('dmc:tema', t), tema);
    for (const largura of [1440, 390]) {
      await page.setViewportSize({ width: largura, height: 900 });
      for (const [url, escopo] of telas) {
        await page.goto(`${EAD}${url}`);
        await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
        await expect(page.locator(escopo)).not.toHaveAttribute('aria-busy', 'true');
        const r = await new AxeBuilder({ page }).include(escopo).exclude('iframe').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        for (const v of r.violations.filter((x) => ['serious', 'critical'].includes(x.impact))) {
          graves.push(`${tema} ${largura} ${url}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
        }
      }
    }
  }
  expect(graves, graves.join('\n')).toEqual([]);
  await fechar(mon);
});

test('F1b · player abaixo de 1280: painel "Módulos" abre, fecha com Esc devolvendo o foco e navega', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { aluno, C } = await alunoComCurso(request, { aulas: [{}, {}, {}] });
  const mon = P.monitorarConsoleERede(page);
  await page.setViewportSize({ width: 1024, height: 800 });
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}aula.html?curso=${C.cursoId}`);
  await expect(page.locator('#player-root')).toHaveAttribute('aria-busy', 'false');
  const botao = page.locator('[data-player-abrir-modulos]');
  const painel = page.locator('#player-modulos');
  await expect(painel).toBeHidden();
  await botao.click();
  await expect(painel).toBeVisible();
  await expect(botao).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-fechar-modulos]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(painel).toBeHidden();
  await expect(botao).toBeFocused();
  await botao.click();
  await painel.getByRole('link', { name: C.aulas[2].titulo }).click();
  await expect(painel).toBeHidden();
  await expect(page.locator('#player-titulo')).toHaveText(C.aulas[2].titulo);
  await expect(page.locator('[data-player-posicao]')).toHaveText(/^3 de 3/);
  await fechar(mon);
});

test('F1b · Início: próxima aula ao vivo (sala aberta) e convite .ics da próxima agendada', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { aluno, C } = await alunoComCurso(request, { aulas: [{}] });
  const lives = await P.semearLives(request, C.cursoId);
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}dashboard.html?curso=${C.cursoId}`);
  const bloco = page.locator('#inicio-ao-vivo');
  await expect(bloco).toContainText(lives.aoVivo.titulo);
  await expect(bloco.getByRole('link', { name: 'Entrar na sala' }).or(bloco.getByRole('button', { name: 'Entrar na sala' }))).toBeVisible();
  // O link da sala não vai para a tela do Início fora do fluxo de presença.
  await expect(bloco.locator(`a[href="${lives.aoVivo.url}"]`)).toHaveCount(0);

  // Sem a aula em andamento, a próxima é a agendada: convite .ics gerado no navegador.
  await P.comBanco(request, (db) => db.collection('lives').deleteOne({ _id: lives.aoVivo.id }));
  await page.reload();
  await expect(bloco).toContainText(lives.agendada.titulo);
  await expect(bloco).toContainText('A sala abre 15 minutos antes do início.');
  const dl = page.waitForEvent('download');
  await bloco.getByRole('button', { name: 'Baixar convite (.ics)' }).click();
  const arquivo = await dl;
  expect(arquivo.suggestedFilename()).toBe('aula-ao-vivo.ics');
  const conteudo = fs.readFileSync(await arquivo.path(), 'utf8');
  expect(conteudo).toContain('BEGIN:VEVENT');
  expect(conteudo).toContain(`SUMMARY:${lives.agendada.titulo}`);
  expect(conteudo).not.toContain(lives.agendada.url);
  await fechar(mon);
});

test('F1b · seção 4: a avaliação publicada aparece na trilha do módulo e o player a monta com DMC_Avaliacao (P1f)', async ({ page, request }) => {
  await P.exigirMongo(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  const { aluno, C } = await alunoComCurso(request, { aulas: [{}] });
  const A = P.api(request, admin.token);
  const titulo = `Atividade modular de teste ${C.cursoId.slice(-4)}`;
  const nova = await A.post(`/api/portal/professor/modulos/${C.moduloId}/avaliacoes`, { tipo: 'modular', titulo, sorteio: { objetivas: 1, dissertativas: 0 }, tentativasMax: 2, tempoLimiteMin: null, embaralharAlternativas: false });
  if (nova.status === 404) { test.info().annotations.push({ type: 'bloqueado', description: 'rotas da F2 não montadas' }); test.skip(true, 'bloqueado: F2'); }
  expect(nova.status, JSON.stringify(nova.json)).toBe(201);
  const avId = nova.json.avaliacao.id;
  const q = await A.post(`/api/portal/professor/avaliacoes/${avId}/questoes`, { tipo: 'objetiva', enunciado: 'Pergunta de teste?', alternativas: [{ texto: 'Sim' }, { texto: 'Não' }], corretaId: 'a' });
  expect(q.status, JSON.stringify(q.json)).toBe(201);
  const pub = await A.post(`/api/portal/professor/avaliacoes/${avId}/publicar`, {});
  expect(pub.status, JSON.stringify(pub.json)).toBe(200);

  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}aula.html?curso=${C.cursoId}`);
  await expect(page.locator('#player-root')).toHaveAttribute('aria-busy', 'false');
  if ((await modoDe(page)) !== 'servidor') { test.info().annotations.push({ type: 'bloqueado', description: 'Conteudo da F1a não montado' }); test.skip(true, 'bloqueado: F1a'); }
  const coluna = page.locator('#player-modulos');
  await expect(coluna).toContainText('Avaliação');
  await expect(page.locator('[data-player-posicao]')).toHaveText(/^1 de 2/);
  await coluna.getByRole('link', { name: titulo }).click();
  await expect(page.locator('[data-player-posicao]')).toHaveText(/^2 de 2/);
  await expect(page.locator('#player-stage')).toHaveClass(/pf-est-palco--avaliacao/);
  await expect(page.locator('#player-stage')).not.toBeEmpty();
  await expect(page.locator('#btn-done')).toBeHidden();
  await fechar(mon);
});

test('F1b · DMC_Video.normalizar (modo de compatibilidade) é igual ao normalizarVideo do servidor (F1a)', async ({ page, request }) => {
  await P.exigirMongo(request);
  const arq = path.join(P.RAIZ, 'server', 'src', 'portal', 'estudos', 'video.js');
  if (!fs.existsSync(arq)) { test.skip(true, 'bloqueado: video.js da F1a ausente'); }
  const { normalizarVideo } = await import(pathToFileURL(arq).href);
  const entradas = [
    `https://www.youtube.com/watch?v=${YT_ID}`, `https://youtu.be/${YT_ID}?t=90`, `https://www.youtube.com/shorts/${YT_ID}`,
    `https://www.youtube.com/live/${YT_ID}`, `https://www.youtube-nocookie.com/embed/${YT_ID}?start=1m30s`, `https://m.youtube.com/watch?v=${YT_ID}&t=1h2m3s`,
    'https://www.youtube.com/watch?v=curto', 'https://www.youtube.com/@canal', `https://www.youtube.com/v/${YT_ID}`,
    'https://vimeo.com/76979871', 'https://vimeo.com/76979871/abc123', 'https://player.vimeo.com/video/76979871?h=ff00',
    'https://vimeo.com/channels/staffpicks/76979871', 'https://player.vimeo.com/outra',
    'https://cdn.exemplo.invalid/aula.mp4', 'https://cdn.exemplo.invalid/aula.webm?x=1', '/assets/videos/aula.mp4', '/qa/video-teste.mp4',
    '/../segredo.mp4', '//evil.example/x.mp4', '/a/./b.mp4', 'https://exemplo.invalid/pagina', 'http://youtube.com/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)', 'data:video/mp4;base64,AAAA', '', '   ', 'https://user:pw@vimeo.com/1', 'https://exemplo.invalid/a b.mp4', null
  ];
  const { aluno } = await alunoComCurso(request, { aulas: [{}] });
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}meus-cursos.html`);
  await page.addScriptTag({ url: `${EAD}js/portal/video.js?v=dev` });
  const cliente = await page.evaluate((lista) => lista.map((u) => window.DMC_Video.normalizar(u)), entradas);
  entradas.forEach((u, i) => expect(cliente[i], `normalizar(${JSON.stringify(u)})`).toEqual(normalizarVideo(u)));
  await fechar(mon);
});

test('F1b · capa vertical do curso (2:3) em Meus cursos e no Início; capa do módulo na miniatura do player', async ({ page, request }) => {
  await P.exigirMongo(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  const { aluno, C } = await alunoComCurso(request, { aulas: [{}] });
  const A = P.api(request, admin.token);
  const cv = await A.bruto('POST', `/api/portal/admin/cursos/${C.cursoId}/capa-vertical`, { headers: { 'content-type': 'image/png' }, data: P.PNG_1PX });
  if (cv.status() === 404 && !(await P.fatiaMontada(request, admin.token, `/api/portal/cursos/${C.cursoId}/trilha`))) {
    test.info().annotations.push({ type: 'bloqueado', description: 'rotas de capa da F1a não montadas' });
    test.skip(true, 'bloqueado: F1a');
  }
  expect(cv.status(), await cv.text()).toBe(200);
  const { capaVerticalUrl } = await cv.json();
  const cm = await A.bruto('POST', `/api/portal/admin/modulos/${C.moduloId}/capa`, { headers: { 'content-type': 'image/png' }, data: P.PNG_1PX });
  expect(cm.status(), await cm.text()).toBe(200);
  const { capaUrl } = await cm.json();

  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}meus-cursos.html`);
  const img = page.locator(`#meus-cursos-lista [data-curso="${C.cursoId}"] img`);
  await expect(img).toHaveAttribute('src', capaVerticalUrl);
  await page.goto(`${EAD}dashboard.html?curso=${C.cursoId}`);
  await expect(page.locator(`#inicio-meus-cursos a[data-curso-id="${C.cursoId}"] img`)).toHaveAttribute('src', capaVerticalUrl);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${EAD}aula.html?curso=${C.cursoId}`);
  const mini = page.locator(`#player-modulos [data-modulo-id="${C.moduloId}"] .pf-est-mini img`);
  await expect(mini).toHaveAttribute('src', capaUrl);
  await expect(mini).toHaveAttribute('alt', '');
  await fechar(mon);
});
