// =============================================================
// portal-ui.spec.js (F0b) — PORTAL-ACADEMICO.md §8.5, linha F0b.
//
// Parte S0 (esta): autotestes dos helpers do _portal.js que as outras fatias usam —
// confirmarNaTela (D-76), monitorarConsoleERede (D-73) e paginasDoPortal (D-74).
// Rodam sobre páginas montadas pelo próprio teste (page.setContent / page.route),
// sem tocar arquivo da EAD.
// Parte S1 (no fim do arquivo): js/portal/pre-pintura.js (tema e nível de texto antes da
// pintura, metas, páginas públicas em papel, "auto", outra aba) e js/portal/ui.js mínimo
// (DMC_UI.html/esc/cru/icone/erroCarga e DMC_Portal.iniciar: sessão, modo restrito D-63,
// guarda de papel §5.4, itens D-75, erro de carga). Páginas de teste servidas por page.route
// em /plataforma-ead/__qa-s1-*.html, carregando os arquivos REAIS do disco.
// Parte S3 (no fim do arquivo, passos 3–5 da ordem interna da F0b): DMC_Api (erros,
// silencioso404, sinal, cabeçalhos), acréscimos de DMC_Auth/DMC_init/DMC_Data/DMC_Icons,
// modo restrito nos boots legados (D-63), DMC_UI completo (abrirArquivo, rascunho de 401,
// reautenticar, consentimento, confirmar com data-pf-acao, formulário, upload, tabela,
// abas, filtros, fmt/valida/mascara), DMC_QR + vendor, boot-index.js, DMC_bootLogin,
// loja e obrigado (D-69) e o pedido da loja por page.route (D-79).
// Parte F0b-final (no fim do arquivo, fase 2, §7.3 e §8.5): prova por grep de que os boots
// mortos saíram de app.js e de que ninguém chama os nomes antigos, e os apelidos que levam
// ao boot novo de cada página.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { test, expect } from '@playwright/test';
import * as P from './_portal.js';

const QA_FATIA = process.env.QA_FATIA || null;
test.describe.configure({ mode: 'parallel' });
test.skip(!!QA_FATIA && QA_FATIA !== 'F0b', 'portal-ui.spec.js é da F0b');

// ---------------------------------------------------------------------------
// confirmarNaTela — nativo e DMC_UI.confirmar (gancho [data-pf-acao])
// ---------------------------------------------------------------------------
const PAGINA_CONFIRMA = `<!doctype html><html lang="pt-BR"><body>
<button id="nativo" onclick="document.body.dataset.r = String(confirm('Apagar?'))">Nativo</button>
<button id="pf" onclick="abrir()">Diálogo</button>
<div id="dlg" role="dialog" hidden><p>Apagar?</p>
  <button data-pf-acao="cancelar" onclick="fechar('cancelado')">Cancelar</button>
  <button data-pf-acao="confirmar" onclick="fechar('confirmado')">Apagar</button></div>
<script>
  function abrir(){ setTimeout(function(){ document.getElementById('dlg').hidden = false; }, 150); }
  function fechar(r){ document.getElementById('dlg').hidden = true; document.body.dataset.r = r; }
</script></body></html>`;

test('S0 · confirmarNaTela aceita o confirm nativo', { tag: ['@F0b'] }, async ({ page }) => {
  await page.setContent(PAGINA_CONFIRMA);
  const via = await P.confirmarNaTela(page, () => page.locator('#nativo').click());
  expect(via).toBe('nativo');
  await expect(page.locator('body')).toHaveAttribute('data-r', 'true');
});

test('S0 · confirmarNaTela clica em [data-pf-acao="confirmar"] (DMC_UI.confirmar)', { tag: ['@F0b'] }, async ({ page }) => {
  await page.setContent(PAGINA_CONFIRMA);
  const pendente = P.confirmarNaTela(page);
  await page.locator('#pf').click();
  expect(await pendente).toBe('pf');
  await expect(page.locator('body')).toHaveAttribute('data-r', 'confirmado');
});

test('S0 · confirmarNaTela lança quando nenhuma confirmação aparece', { tag: ['@F0b'] }, async ({ page }) => {
  await page.setContent('<!doctype html><body><button id="b">nada</button></body>');
  await expect(P.confirmarNaTela(page, () => page.locator('#b').click(), { timeout: 600 })).rejects.toThrow(/nenhuma confirmação/);
});

// ---------------------------------------------------------------------------
// monitorarConsoleERede — tolera só a lista da fase e reprova 404 fora dela
// ---------------------------------------------------------------------------
async function paginaComFetches(page, urls) {
  await page.goto('/__qa/estado');
  await page.evaluate(async (lista) => { for (const u of lista) { try { await fetch(u); } catch { /* rede */ } } }, urls);
  await page.waitForTimeout(150);
}
async function rotear404(page, padroes) {
  for (const p of padroes) await page.route(p, (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Rota não encontrada."}' }));
}

test('S0 · monitor tolera 404 de API e de asset de fatia não integrada (≠ própria) e reprova o resto', { tag: ['@F0b'] }, async ({ page }) => {
  await rotear404(page, ['**/api/portal/me/financeiro', '**/plataforma-ead/js/portal/financeiro.js', '**/api/catalogo-que-nao-existe', '**/plataforma-ead/js/portal/ui.js', '**/api/portal/me/cursos']);
  const mon = P.monitorarConsoleERede(page, { fatia: 'F1a', estrito: false });
  expect(new Set(mon.integradas)).toEqual(P.fatiasIntegradas());
  await paginaComFetches(page, ['/api/portal/me/financeiro', '/plataforma-ead/js/portal/financeiro.js', '/api/catalogo-que-nao-existe', '/plataforma-ead/js/portal/ui.js', '/api/portal/me/cursos']);
  const c = await mon.verificar({ lancar: false });
  const tol = c.toleradas.filter((i) => i.tipo === 'resposta').map((i) => new URL(i.url).pathname).sort();
  const ines = c.inesperadas.filter((i) => i.tipo === 'resposta').map((i) => new URL(i.url).pathname).sort();
  if (P.fatiasIntegradas().has('F5')) {
    expect(ines).toContain('/api/portal/me/financeiro');
  } else {
    expect(tol).toEqual(['/api/portal/me/financeiro', '/plataforma-ead/js/portal/financeiro.js']);
  }
  // Rota inexistente fora do mapa, asset da F0b (integrada) e rota da PRÓPRIA fatia: nunca tolerados
  expect(ines).toEqual(expect.arrayContaining(['/api/catalogo-que-nao-existe', '/plataforma-ead/js/portal/ui.js', '/api/portal/me/cursos']));
  await expect(mon.verificar({ tipos: ['resposta'] })).rejects.toThrow();
});

test('S0 · monitor com QA_ESTRITO não tolera nada; esperar() libera só o declarado', { tag: ['@F0b'] }, async ({ page }) => {
  await rotear404(page, ['**/api/portal/me/financeiro']);
  await page.route('**/api/portal/me/limite', (r) => r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"x"}' }));
  const mon = P.monitorarConsoleERede(page, { fatia: 'F1a', estrito: true });
  P.esperar(page, { status: 429, url: '/api/portal/me/limite' });
  await paginaComFetches(page, ['/api/portal/me/financeiro', '/api/portal/me/limite']);
  const c = await mon.verificar({ lancar: false });
  expect(c.toleradas).toEqual([]);
  expect(c.inesperadas.filter((i) => i.tipo === 'resposta').map((i) => new URL(i.url).pathname)).toEqual(['/api/portal/me/financeiro']);
  expect(c.declaradas.filter((i) => i.tipo === 'resposta').map((i) => i.status)).toEqual([429]);
});

test('S0 · monitor com QA_ESTRITO: falha de rede sem resposta conta como \'rede\' (esperar({ url }) declara) e o filtro tipos não vale; fora do G2, nada muda', { tag: ['@F0b'] }, async ({ page }) => {
  await page.route('**/api/portal/qa-rede/falha', (r) => r.abort('failed'));
  await page.route('**/api/portal/qa-rede/declarada', (r) => r.abort('connectionrefused'));
  const estrito = P.monitorarConsoleERede(page, { fatia: 'F0b', estrito: true });
  const solto = P.monitorarConsoleERede(page, { fatia: 'F0b', estrito: false });
  estrito.esperar({ url: '/api/portal/qa-rede/declarada' });
  await paginaComFetches(page, ['/api/portal/qa-rede/falha', '/api/portal/qa-rede/declarada']);
  await expect.poll(() => estrito.registro.falhas.length).toBe(2);
  const c = await estrito.verificar({ lancar: false });
  expect(c.inesperadas.filter((i) => i.tipo === 'rede').map((i) => new URL(i.url).pathname)).toEqual(['/api/portal/qa-rede/falha']);
  expect(c.declaradas.filter((i) => i.tipo === 'rede').map((i) => new URL(i.url).pathname)).toEqual(['/api/portal/qa-rede/declarada']);
  await expect(estrito.verificar({ tipos: ['pageerror'] })).rejects.toThrow(/\[rede\]/);
  // Fora do G2 a falha de rede só é registrada (falhasDeRede) e o filtro tipos vale.
  const s = await solto.verificar({ tipos: ['pageerror', 'resposta'] });
  expect(s.inesperadas.some((i) => i.tipo === 'rede')).toBe(false);
  expect(s.falhasDeRede).toHaveLength(2);
});

test('S0 · monitor reprova pageerror e tolera o de origem em asset de fatia não integrada', { tag: ['@F0b'] }, async ({ page }) => {
  await page.route('**/plataforma-ead/js/portal/financeiro.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'setTimeout(function(){ throw new Error("falha F5 em obra"); }, 0);' }));
  await page.route('**/plataforma-ead/js/portal/ui.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'setTimeout(function(){ throw new Error("falha F0b"); }, 0);' }));
  const mon = P.monitorarConsoleERede(page, { fatia: 'F1b', estrito: false });
  await page.goto('/__qa/estado');
  await page.evaluate(() => {
    for (const s of ['/plataforma-ead/js/portal/financeiro.js', '/plataforma-ead/js/portal/ui.js']) {
      const el = document.createElement('script'); el.src = s; document.head.appendChild(el);
    }
  });
  await expect.poll(() => mon.registro.pageerror.length).toBe(2);
  const c = await mon.verificar({ lancar: false });
  const msgs = (l) => l.filter((i) => i.tipo === 'pageerror').map((i) => i.mensagem);
  if (!P.fatiasIntegradas().has('F5')) expect(msgs(c.toleradas)).toEqual(['falha F5 em obra']);
  expect(msgs(c.inesperadas)).toContain('falha F0b');
});

test('S0 · monitor: "Refused to apply style/execute script from <url>" vale como o 404 da URL citada; sem 404 ou de fatia integrada, reprova', { tag: ['@F0b'] }, async ({ page }) => {
  // Como o servidor real (vercel.json): X-Content-Type-Options: nosniff liga a checagem estrita de MIME.
  const nosniff = { 'X-Content-Type-Options': 'nosniff' };
  const texto404 = (r) => r.fulfill({ status: 404, contentType: 'text/plain', headers: nosniff, body: 'Não encontrado' });
  await page.route('**/plataforma-ead/css/portal-financeiro.css*', texto404);
  await page.route('**/plataforma-ead/js/portal/financeiro.js*', texto404);
  await page.route('**/plataforma-ead/js/portal/ui.js*', texto404);
  // 200 com MIME errado não é 404: nunca tolerado
  await page.route('**/plataforma-ead/js/portal/prof-financeiro.js*', (r) => r.fulfill({ status: 200, contentType: 'text/plain', headers: nosniff, body: 'x' }));
  await page.route('**/plataforma-ead/__qa-s0-recusa.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="pt-BR"><head><title>QA</title></head><body><p>recusa</p></body></html>' }));
  const mon = P.monitorarConsoleERede(page, { fatia: 'F1b', estrito: false });
  await page.goto('/plataforma-ead/__qa-s0-recusa.html');
  await page.evaluate(() => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/plataforma-ead/css/portal-financeiro.css?v=qa'; document.head.appendChild(l);
    for (const s of ['/plataforma-ead/js/portal/financeiro.js?v=qa', '/plataforma-ead/js/portal/ui.js?v=qa', '/plataforma-ead/js/portal/prof-financeiro.js?v=qa']) {
      const el = document.createElement('script'); el.src = s; document.head.appendChild(el);
    }
  });
  await expect.poll(() => mon.registro.console.filter((c) => P.RECUSA_MIME_RE.test(c.texto)).length).toBe(4);
  const c = await mon.verificar({ lancar: false });
  const recusas = (l) => l.filter((i) => i.tipo === 'console' && P.RECUSA_MIME_RE.test(i.texto)).map((i) => new URL(i.url).pathname).sort();
  // A folha recusada não gera 'response' no Chromium: o monitor confere a URL no servidor (o
  // page.route acima não vale para esse GET). Com o arquivo da F5 no disco, não há 404: reprova.
  const css = '/plataforma-ead/css/portal-financeiro.css';
  const cssNoDisco = fs.existsSync(path.join(P.EAD_DISCO, 'css', 'portal-financeiro.css'));
  if (!P.fatiasIntegradas().has('F5')) {
    expect(recusas(c.toleradas)).toEqual(cssNoDisco ? ['/plataforma-ead/js/portal/financeiro.js'] : [css, '/plataforma-ead/js/portal/financeiro.js']);
  }
  expect(recusas(c.inesperadas)).toEqual(expect.arrayContaining(['/plataforma-ead/js/portal/prof-financeiro.js', '/plataforma-ead/js/portal/ui.js', ...(cssNoDisco ? [css] : [])]));
  // QA_ESTRITO: nada tolerado
  const estrito = P.monitorarConsoleERede(page, { fatia: 'F1b', estrito: true });
  await page.evaluate(() => { const el = document.createElement('script'); el.src = '/plataforma-ead/js/portal/financeiro.js?v=qa2'; document.head.appendChild(el); });
  await expect.poll(() => estrito.registro.console.filter((x) => P.RECUSA_MIME_RE.test(x.texto)).length).toBe(1);
  expect((await estrito.verificar({ lancar: false })).toleradas).toEqual([]);
});

test('S0 · fatiaDaApi: o prefixo mais longo vence', { tag: ['@F0b'] }, async () => {
  expect(P.fatiaDaApi('/api/portal/admin/configuracoes/assistente-ia/chave')).toBe('F6b');
  expect(P.fatiaDaApi('/api/portal/admin/configuracoes/encarregado')).toBe('F6a');
  expect(P.fatiaDaApi('/api/portal/admin/usuarios/abc/documentos')).toBe('F4b');
  expect(P.fatiaDaApi('/api/portal/admin/usuarios/abc/papel')).toBe('F0t');
  expect(P.fatiaDaApi('/api/portal/professor/cursos/c1/boletim')).toBe('F3a');
  expect(P.fatiaDaApi('/api/portal/professor/cursos')).toBe('F0t');
  expect(P.fatiaDaApi('/api/portal/me/pedidos')).toBe('F5');
  expect(P.fatiaDaApi('/api/catalogo')).toBeNull();
  expect(P.fatiaDaApi('/api/auth/signin')).toBeNull();
});

// ---------------------------------------------------------------------------
// paginasDoPortal — recusa fatia alheia e página própria repetida (D-74)
// ---------------------------------------------------------------------------
function dirCom(testInfo, arquivos) {
  const dir = testInfo.outputPath('paginas');
  fs.mkdirSync(dir, { recursive: true });
  for (const [nome, corpo] of Object.entries(arquivos)) fs.writeFileSync(path.join(dir, nome), corpo);
  return dir;
}

test('S0 · PAGINAS_BASE tem as 34 páginas, cada uma com dono, e paginasDoPortal() sem arquivos de fatia devolve a base', { tag: ['@F0b'] }, async ({}, testInfo) => {
  expect(P.PAGINAS_BASE).toHaveLength(34);
  expect(new Set(P.PAGINAS_BASE.map((e) => e.pagina)).size).toBe(34);
  for (const e of P.PAGINAS_BASE) expect([...P.FATIAS, '2d']).toContain(e.fatia);
  expect(P.PAGINAS_BASE.filter((e) => e.fatia === '2d').map((e) => e.pagina).sort()).toEqual(['login-classico.html', 'login.html']);
  expect(P.PAGINAS_BASE.filter((e) => e.legado).length).toBe(13);
  const todas = await P.paginasDoPortal({ dir: dirCom(testInfo, {}), estrito: false });
  expect(todas).toHaveLength(34);
  expect(P.urlDaPagina(todas.find((e) => e.pagina === 'aula.html'))).toBe('/plataforma-ead/aula.html');
});

test('S0 · paginasDoPortal junta as entradas da fatia (própria substitui a base; hospedeira soma)', { tag: ['@F0b'] }, async ({}, testInfo) => {
  const dir = dirCom(testInfo, {
    'portal-avaliacoes.paginas.js': "export const PAGINAS = [{ pagina: 'aula.html', fatia: 'F2', hospedeira: true, url: () => 'aula.html?item=avaliacao:x' }, { pagina: 'professor.html', fatia: 'F2', hospedeira: true, url: () => 'professor.html#/avaliacoes' }];",
    'portal-documentos.paginas.js': "export const PAGINAS = [{ pagina: 'contrato.html', fatia: 'F4b', url: (c) => 'contrato.html?id=' + (c.id || 'x') }];"
  });
  const todas = await P.paginasDoPortal({ dir, estrito: false });
  expect(todas.filter((e) => e.pagina === 'contrato.html')).toHaveLength(1);
  expect(P.urlDaPagina(todas.find((e) => e.pagina === 'contrato.html'), { id: '42' })).toBe('/plataforma-ead/contrato.html?id=42');
  expect(todas.filter((e) => e.pagina === 'aula.html')).toHaveLength(2);
  expect((await P.paginasDoPortal({ dir, fatia: 'F2', estrito: false })).map((e) => e.pagina).sort()).toEqual(['aula.html', 'professor.html']);
});

test('S0 · paginasDoPortal recusa entrada com fatia de outra dona', { tag: ['@F0b'] }, async ({}, testInfo) => {
  const dir = dirCom(testInfo, { 'portal-financeiro.paginas.js': "export const PAGINAS = [{ pagina: 'financeiro.html', fatia: 'F6a', url: () => 'financeiro.html' }];" });
  await expect(P.paginasDoPortal({ dir, estrito: false })).rejects.toThrow(/fatia "F6a"/);
});

test('S0 · paginasDoPortal recusa página própria repetida e página alheia sem hospedeira', { tag: ['@F0b'] }, async ({}, testInfo) => {
  const repetida = dirCom(testInfo, { 'portal-financeiro.paginas.js': "export const PAGINAS = [{ pagina: 'financeiro.html', fatia: 'F5', url: () => 'financeiro.html' }, { pagina: 'financeiro.html', fatia: 'F5', url: () => 'financeiro.html?aba=2' }];" });
  await expect(P.paginasDoPortal({ dir: repetida, estrito: false })).rejects.toThrow(/repetida/);
  const alheia = path.join(testInfo.outputPath('alheia'));
  fs.mkdirSync(alheia, { recursive: true });
  fs.writeFileSync(path.join(alheia, 'portal-comunicacao.paginas.js'), "export const PAGINAS = [{ pagina: 'aula.html', fatia: 'F7', url: () => 'aula.html' }];");
  await expect(P.paginasDoPortal({ dir: alheia, estrito: false })).rejects.toThrow(/dona é F1b/);
  const fora = path.join(testInfo.outputPath('fora'));
  fs.mkdirSync(fora, { recursive: true });
  fs.writeFileSync(path.join(fora, 'portal-inventado.paginas.js'), 'export const PAGINAS = [];');
  await expect(P.paginasDoPortal({ dir: fora, estrito: false })).rejects.toThrow(/não está na lista/);
});

test('S0 · paginasDoPortal com QA_ESTRITO (G2) não tolera ausência: os 12 arquivos de páginas e toda página no disco; os arquivos reais passam', { tag: ['@F0b'] }, async ({}, testInfo) => {
  const nomes = Object.keys(P.ARQUIVOS_DE_PAGINAS);
  expect(nomes).toHaveLength(12);
  // Falta um arquivo: recusa e diz qual (e de quem); sem estrito, a mesma pasta passa.
  const parcial = dirCom(testInfo, Object.fromEntries(nomes.slice(1).map((n) => [n, 'export const PAGINAS = [];'])));
  await expect(P.paginasDoPortal({ dir: parcial, estrito: true })).rejects.toThrow(new RegExp(`ausente: ${nomes[0].replace(/\./g, '\\.')} \\(${P.ARQUIVOS_DE_PAGINAS[nomes[0]]}\\)`));
  expect(await P.paginasDoPortal({ dir: parcial, estrito: false })).toHaveLength(34);
  // Os 12 presentes, mas a página não existe no disco (ead vazio): recusa listando as páginas.
  const completa = testInfo.outputPath('completa');
  fs.mkdirSync(completa, { recursive: true });
  for (const n of nomes) fs.writeFileSync(path.join(completa, n), 'export const PAGINAS = [];');
  const eadVazio = testInfo.outputPath('ead-vazio');
  fs.mkdirSync(eadVazio, { recursive: true });
  await expect(P.paginasDoPortal({ dir: completa, estrito: true, ead: eadVazio })).rejects.toThrow(/não existe no disco: .*dashboard\.html/);
  expect(await P.paginasDoPortal({ dir: completa, estrito: true })).toHaveLength(34);
  // Os portal-<x>.paginas.js reais do repositório e as 34 páginas passam no modo estrito.
  const reais = await P.paginasDoPortal({ estrito: true });
  for (const b of P.PAGINAS_BASE) expect(reais.some((e) => e.pagina === b.pagina), b.pagina).toBe(true);
  expect(P.PAGINAS_BASE.filter((b) => !b.existe).map((b) => b.pagina)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Sementes e comparação de capturas
// ---------------------------------------------------------------------------
test('S0 · papéis semeados direto no banco descartável: aluno, professor e admin entram pelo login real', { tag: ['@F0b'] }, async ({ request }) => {
  const { aluno, professor, admin } = await P.criarPapeis(request);
  for (const [u, papel, isAdmin] of [[aluno, 'aluno', false], [professor, 'professor', false], [admin, 'admin', true]]) {
    const me = await P.api(request, u.token).get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.json.user).toMatchObject({ email: u.email, isAdmin });
    const doc = await P.comBanco(request, (db) => db.collection('users').findOne({ email: u.email }));
    expect(doc).toMatchObject({ papel, isAdmin });
  }
});

test('S0 · sementes R9 (perfil identificado) e R9b (sem perfil) gravadas no banco descartável', { tag: ['@F0b'] }, async ({ request }) => {
  const r9 = await P.semearR9(request);
  const r9b = await P.semearR9b(request);
  const [perfil9, perfil9b] = await P.comBanco(request, (db) => Promise.all([db.collection('perfis').findOne({ userId: r9.aluno.id }), db.collection('perfis').findOne({ userId: r9b.aluno.id })]));
  expect(perfil9).toMatchObject({ nomeRegistro: r9.perfil.nomeRegistro, cpf: r9.perfil.cpf });
  expect(perfil9.cpf).toMatch(/^\d{11}$/);
  expect(perfil9b).toBeNull();
  for (const s of [r9, r9b]) {
    const st = await P.api(request, s.aluno.token).get(`/api/cursos/${s.curso.cursoId}/certificado`);
    expect(st.json).toMatchObject({ emitido: false, elegivel: true, faltam: 0 });
  }
});

test('S0 · compararPng: idênticas, 1 pixel diferente e dimensões diferentes', { tag: ['@F0b'] }, async ({ page }) => {
  await page.setViewportSize({ width: 40, height: 30 });
  await page.setContent('<body style="margin:0;background:#222"><div id="p" style="position:absolute;left:5px;top:5px;width:1px;height:1px;background:#222"></div></body>');
  const a = await page.screenshot();
  const b = await page.screenshot();
  expect(P.compararPng(a, b)).toMatchObject({ identicas: true });
  await page.evaluate(() => { document.getElementById('p').style.background = '#fff'; });
  const c = await page.screenshot();
  expect(P.compararPng(a, c)).toMatchObject({ identicas: false, mesmasDimensoes: true, pixelsDiferentes: 1, total: 1200 });
  await page.setViewportSize({ width: 41, height: 30 });
  expect(P.compararPng(a, await page.screenshot())).toMatchObject({ identicas: false, mesmasDimensoes: false });
});

// =============================================================================
// S1 · js/portal/pre-pintura.js (final) e js/portal/ui.js mínimo
// Páginas de teste: modelo do <head> de §6.4 servido por page.route em
// /plataforma-ead/__qa-s1-*.html; os scripts e CSS vêm do disco (serve.mjs).
// =============================================================================
const MAIN_S1 = '<a class="dmc-skip" href="#conteudo">Pular para o conteúdo</a><main id="conteudo" class="pf-main" tabindex="-1"><p>Carregando…</p></main>';
const CSS_S1 = '<link rel="stylesheet" href="../assets/css/tokens.css?v=1">\n<link rel="stylesheet" href="css/portal.css?v=dev">';
// Sonda no <head>, DEPOIS dos metas e do CSS e ANTES do <body>: o que ela lê é o que a 1ª pintura usa.
const SONDA_S1 = `<script>(function () {
  var h = document.documentElement, cs = getComputedStyle(h);
  window.__sonda = { tema: h.getAttribute('data-pf-tema'), fonte: h.getAttribute('data-pf-fonte'), pfJs: h.classList.contains('pf-js'),
    esquema: document.querySelector('meta[name="color-scheme"]').getAttribute('content'),
    cor: document.querySelector('meta[name="theme-color"]').getAttribute('content'),
    fundo: cs.backgroundColor, tamanho: cs.fontSize, temBody: !!document.body };
})();</script>`;
const NUCLEO_S1 = ['js/api-client.js', 'js/app.js', 'js/portal/ui.js'];
const ESCURO = { esquema: 'dark', cor: '#0b0c0e', fundo: 'rgb(11, 12, 14)' };
const PAPEL = { esquema: 'light', cor: '#f5f3ef', fundo: 'rgb(245, 243, 239)' };

function htmlS1({ cabeca = '', corpo = MAIN_S1, scripts = [], fim = '', shell = 'inicio' } = {}) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<script src="js/portal/pre-pintura.js?v=dev"></script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0b0c0e">
<title>QA S1 · Plataforma Complexo DMC</title>
${cabeca}
</head>
<body data-shell="${shell}" data-pagina="${shell}">
${corpo}
${scripts.map((s) => `<script src="${s}?v=dev"></script>`).join('\n')}
${fim}
</body>
</html>`;
}
const STUB_S1 = (nome) => `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${nome}</title></head><body><p>${nome} (stub do teste)</p></body></html>`;

/** Serve `corpo` em /plataforma-ead/<caminho> (sem query; com ou sem .html, como vier). */
async function servirS1(page, caminho, corpo) {
  await page.route((u) => u.pathname === `/plataforma-ead/${caminho}`, (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: corpo }));
}
/** Destinos de redirecionamento viram stubs (não carregam a página real). */
async function stubsS1(page, nomes = ['login.html', 'dashboard.html', 'professor.html', 'perfil.html']) {
  for (const n of nomes) await servirS1(page, n, STUB_S1(n));
}
async function preferenciasS1(page, valores) {
  await page.goto('/__qa/estado');
  await page.evaluate((v) => {
    for (const [k, x] of Object.entries(v)) { if (x == null) localStorage.removeItem(k); else localStorage.setItem(k, x); }
    sessionStorage.clear();
  }, valores);
}
/** Registra cada escrita de data-pf-tema/data-pf-fonte no <html> e se o <body> já existia. */
async function gravarMutacoesS1(page) {
  await page.addInitScript(() => {
    window.__mut = [];
    new MutationObserver((rs) => {
      for (const r of rs) {
        if (r.target === document.documentElement) {
          window.__mut.push({ attr: r.attributeName, valor: document.documentElement.getAttribute(r.attributeName), temBody: !!document.body });
        }
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-pf-tema', 'data-pf-fonte'] });
  });
}
function errosS1(page) {
  const erros = { console: [], pagina: [] };
  page.on('console', (m) => { if (m.type() === 'error') erros.console.push(m.text()); });
  page.on('pageerror', (e) => erros.pagina.push(e.message));
  return erros;
}
async function eventosS1(page) {
  await page.evaluate(() => {
    window.__eventos = [];
    document.addEventListener('dmc:tema', (e) => window.__eventos.push({ tipo: 'tema', ...e.detail }));
    document.addEventListener('dmc:fonte', (e) => window.__eventos.push({ tipo: 'fonte', ...e.detail }));
  });
}

// ---------------------------------------------------------------------------
// pre-pintura.js
// ---------------------------------------------------------------------------
test('S1 · pre-pintura: sem preferência → escuro, nível 0, pf-js e metas do escuro antes do <body>', { tag: ['@F0b'] }, async ({ page }) => {
  const erros = errosS1(page);
  await preferenciasS1(page, { 'dmc:tema': null, 'dmc:fonte': null });
  await gravarMutacoesS1(page);
  await servirS1(page, '__qa-s1-tema.html', htmlS1({ cabeca: CSS_S1 + SONDA_S1 }));
  await page.goto('/plataforma-ead/__qa-s1-tema.html');
  expect(await page.evaluate(() => window.__sonda)).toEqual({ tema: 'escuro', fonte: '0', pfJs: true, esquema: ESCURO.esquema, cor: ESCURO.cor, fundo: ESCURO.fundo, tamanho: '16px', temBody: false });
  // Uma escrita de cada atributo, antes do <body>: nada troca depois (sem flash).
  expect(await page.evaluate(() => window.__mut)).toEqual([
    { attr: 'data-pf-tema', valor: 'escuro', temBody: false },
    { attr: 'data-pf-fonte', valor: '0', temBody: false }
  ]);
  await expect(page.locator('meta[name="color-scheme"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
  expect(erros).toEqual({ console: [], pagina: [] });
});

test('S1 · pre-pintura: claro + nível 2 gravados → papel, metas claros e 125% já na 1ª pintura', { tag: ['@F0b'] }, async ({ page }) => {
  await preferenciasS1(page, { 'dmc:tema': 'claro', 'dmc:fonte': '2' });
  await gravarMutacoesS1(page);
  await servirS1(page, '__qa-s1-tema.html', htmlS1({ cabeca: CSS_S1 + SONDA_S1 }));
  await page.goto('/plataforma-ead/__qa-s1-tema.html');
  expect(await page.evaluate(() => window.__sonda)).toEqual({ tema: 'claro', fonte: '2', pfJs: true, esquema: PAPEL.esquema, cor: PAPEL.cor, fundo: PAPEL.fundo, tamanho: '20px', temBody: false });
  expect(await page.evaluate(() => window.__mut)).toEqual([
    { attr: 'data-pf-tema', valor: 'claro', temBody: false },
    { attr: 'data-pf-fonte', valor: '2', temBody: false }
  ]);
  // O meta nasce "dark" no HTML e já está "light" quando o parser chega à sonda; continua um só.
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f5f3ef');
  await expect(page.locator('meta[name="color-scheme"]')).toHaveCount(1);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
  expect(await page.evaluate(() => window.DMC_PrePintura.estado())).toEqual({ tema: 'claro', preferencia: 'claro', fonte: 2, publica: false });
});

test('S1 · pre-pintura: nível −1 e 1; valores inválidos e localStorage bloqueado caem no padrão sem erro', { tag: ['@F0b'] }, async ({ page }) => {
  const erros = errosS1(page);
  await servirS1(page, '__qa-s1-tema.html', htmlS1({ cabeca: CSS_S1 + SONDA_S1, scripts: ['js/portal/ui.js'] }));
  const casos = [
    [{ 'dmc:tema': 'escuro', 'dmc:fonte': '-1' }, { tema: 'escuro', fonte: '-1', tamanho: '15px' }],
    [{ 'dmc:tema': 'claro', 'dmc:fonte': '1' }, { tema: 'claro', fonte: '1', tamanho: '18px' }],
    [{ 'dmc:tema': 'neon', 'dmc:fonte': '7' }, { tema: 'escuro', fonte: '0', tamanho: '16px' }],
    [{ 'dmc:tema': '__proto__', 'dmc:fonte': 'constructor' }, { tema: 'escuro', fonte: '0', tamanho: '16px' }],
    [{ 'dmc:tema': ' claro', 'dmc:fonte': '2.0' }, { tema: 'escuro', fonte: '0', tamanho: '16px' }]
  ];
  for (const [prefs, esperado] of casos) {
    await preferenciasS1(page, prefs);
    await page.goto('/plataforma-ead/__qa-s1-tema.html');
    const s = await page.evaluate(() => window.__sonda);
    expect({ tema: s.tema, fonte: s.fonte, tamanho: s.tamanho }, JSON.stringify(prefs)).toEqual(esperado);
  }
  // Armazenamento negado (modo privado restrito, política do navegador): padrão, sem exceção.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Acesso negado.', 'SecurityError'); } });
  });
  await page.goto('/plataforma-ead/__qa-s1-tema.html');
  const s = await page.evaluate(() => window.__sonda);
  expect({ tema: s.tema, fonte: s.fonte, esquema: s.esquema }).toEqual({ tema: 'escuro', fonte: '0', esquema: 'dark' });
  expect(await page.evaluate(() => typeof window.DMC_UI.html)).toBe('function');
  expect(erros).toEqual({ console: [], pagina: [] });
});

test('S1 · pre-pintura: "auto" segue o aparelho e acompanha a troca; preferência fixa não', { tag: ['@F0b'] }, async ({ page }) => {
  await preferenciasS1(page, { 'dmc:tema': 'auto', 'dmc:fonte': null });
  await page.emulateMedia({ colorScheme: 'light' });
  await servirS1(page, '__qa-s1-tema.html', htmlS1({ cabeca: CSS_S1 + SONDA_S1 }));
  await page.goto('/plataforma-ead/__qa-s1-tema.html');
  expect((await page.evaluate(() => window.__sonda)).tema).toBe('claro');
  await eventosS1(page);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-pf-tema', 'escuro');
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0b0c0e');
  expect(await page.evaluate(() => window.__eventos)).toEqual([{ tipo: 'tema', tema: 'escuro', preferencia: 'auto' }]);

  // O shell grava a escolha e reaplica pelo mesmo código (sem duplicar a regra dos metas).
  await page.evaluate(() => { localStorage.setItem('dmc:tema', 'claro'); window.DMC_PrePintura.aplicar({ notificar: true }); });
  await expect(page.locator('html')).toHaveAttribute('data-pf-tema', 'claro');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(150);
  await expect(page.locator('html')).toHaveAttribute('data-pf-tema', 'claro');
  expect(await page.evaluate(() => window.__eventos)).toEqual([
    { tipo: 'tema', tema: 'escuro', preferencia: 'auto' },
    { tipo: 'tema', tema: 'claro', preferencia: 'claro' }
  ]);
  // aplicar() sem notificar e sem mudança: nenhum evento.
  await page.evaluate(() => window.DMC_PrePintura.aplicar());
  expect(await page.evaluate(() => window.__eventos.length)).toBe(2);
});

test('S1 · pre-pintura: páginas públicas nascem em papel com qualquer preferência; nível de texto vale', { tag: ['@F0b'] }, async ({ page }) => {
  await preferenciasS1(page, { 'dmc:tema': 'escuro', 'dmc:fonte': '1' });
  for (const caminho of ['validar.html', 'certificado.html', 'declaracao.html', 'acesso-link.html', 'acesso-link', 'validar']) {
    await servirS1(page, caminho, htmlS1({ cabeca: CSS_S1 + SONDA_S1 }));
    await page.goto(`/plataforma-ead/${caminho}?codigo=DMC-QA00-0001`);
    expect(await page.evaluate(() => window.__sonda), caminho).toEqual({ tema: 'claro', fonte: '1', pfJs: true, esquema: PAPEL.esquema, cor: PAPEL.cor, fundo: PAPEL.fundo, tamanho: '18px', temBody: false });
    expect((await page.evaluate(() => window.DMC_PrePintura.estado())).publica, caminho).toBe(true);
  }
  // Página interna com a mesma preferência continua escura.
  await servirS1(page, '__qa-s1-tema.html', htmlS1({ cabeca: CSS_S1 + SONDA_S1 }));
  await page.goto('/plataforma-ead/__qa-s1-tema.html');
  expect((await page.evaluate(() => window.__sonda)).tema).toBe('escuro');
});

test('S1 · pre-pintura: troca feita em outra aba é aplicada aqui (storage) com dmc:tema e dmc:fonte', { tag: ['@F0b'] }, async ({ page }) => {
  await preferenciasS1(page, { 'dmc:tema': 'escuro', 'dmc:fonte': '0' });
  await servirS1(page, '__qa-s1-tema.html', htmlS1({ cabeca: CSS_S1 + SONDA_S1 }));
  await page.goto('/plataforma-ead/__qa-s1-tema.html');
  await eventosS1(page);
  const outra = await page.context().newPage();
  try {
    await outra.goto('/__qa/estado');
    await outra.evaluate(() => { localStorage.setItem('dmc:tema', 'claro'); localStorage.setItem('dmc:fonte', '2'); });
    await expect(page.locator('html')).toHaveAttribute('data-pf-tema', 'claro');
    await expect(page.locator('html')).toHaveAttribute('data-pf-fonte', '2');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f5f3ef');
    await expect.poll(() => page.evaluate(() => window.__eventos.length)).toBe(2);
    expect(await page.evaluate(() => window.__eventos)).toEqual(expect.arrayContaining([
      { tipo: 'tema', tema: 'claro', preferencia: 'claro' }, { tipo: 'fonte', nivel: 2 }
    ]));
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('20px');
  } finally {
    await outra.close();
  }
});

// ---------------------------------------------------------------------------
// ui.js mínimo — DMC_UI.html / esc / cru / icone / erroCarga
// ---------------------------------------------------------------------------
// Contrato completo de §7.5 (S3): a lista exata das chaves publicadas.
const CHAVES_DMC_UI = ['abas', 'abrirArquivo', 'alerta', 'anunciar', 'baixar', 'barras', 'carregarScript', 'chip', 'codigo',
  'confirmar', 'consentimento', 'cru', 'dialogo', 'donut', 'erroCarga', 'esc', 'esqueleto', 'estado', 'estadoVazio', 'filtros',
  'fmt', 'formulario', 'html', 'icone', 'imagemProtegida', 'kpis', 'mascara', 'ocupado', 'progresso', 'reautenticar', 'tabela',
  'toast', 'upload', 'valida'];

test('S1 · ui.js sozinho: só define DMC_UI e DMC_Portal — nenhuma chamada de rede, nenhum erro', { tag: ['@F0b'] }, async ({ page }) => {
  const erros = errosS1(page);
  const chamadas = [];
  page.on('request', (r) => { if (['fetch', 'xhr'].includes(r.resourceType())) chamadas.push(r.url()); });
  await preferenciasS1(page, { 'dmc:token': null });
  await servirS1(page, '__qa-s1-ui.html', htmlS1({ scripts: ['js/portal/ui.js'] }));
  await page.goto('/plataforma-ead/__qa-s1-ui.html');
  expect(await page.evaluate(() => ({
    ui: Object.keys(window.DMC_UI).sort(), portal: Object.keys(window.DMC_Portal),
    iconeSemApp: String(window.DMC_UI.icone('check')), main: document.getElementById('conteudo').textContent
  }))).toEqual({ ui: CHAVES_DMC_UI, portal: ['iniciar'], iconeSemApp: '', main: 'Carregando…' });
  expect(chamadas).toEqual([]);
  expect(erros).toEqual({ console: [], pagina: [] });
});

test('S1 · DMC_UI.html escapa texto e atributos, concatena arrays, aceita aninhado e cru, bloqueia URL perigosa', { tag: ['@F0b'] }, async ({ page }) => {
  await preferenciasS1(page, { 'dmc:token': null });
  await servirS1(page, '__qa-s1-ui.html', htmlS1({ scripts: NUCLEO_S1 }));
  await page.goto('/plataforma-ead/__qa-s1-ui.html');
  const r = await page.evaluate(() => {
    const { html, cru, esc } = window.DMC_UI;
    const s = (x) => String(x);
    const ataque = '"><script>window.__xss=1</script><img src=x onerror="window.__xss=2">';
    const montar = (h) => { const d = document.createElement('div'); d.innerHTML = h; document.body.appendChild(d); return d; };
    const d1 = montar(html`<p class="q" title="${ataque}" data-x='${"' onmouseover='window.__xss=3"}'>${ataque}</p>`);
    const d2 = montar(html`<p class=${'a onclick=window.__xss=4'} id=${'b'}>t</p>`);
    const lista = html`<ul>${['a', '<b>', ['c', null, undefined, false, 0]].map((x) => html`<li>${x}</li>`)}</ul>`;
    const fakeCru = JSON.parse('{"__cru":"<img src=x onerror=window.__xss=5>"}');
    return {
      texto: s(html`<p>${'<b>&"\''}</p>`),
      d1: { scripts: d1.querySelectorAll('script, img').length, title: d1.firstChild.getAttribute('title'), dataX: d1.firstChild.getAttribute('data-x'), conteudo: d1.firstChild.textContent, attrs: d1.firstChild.getAttributeNames() },
      d2: { attrs: d2.firstChild.getAttributeNames(), classe: d2.firstChild.getAttribute('class'), id: d2.firstChild.id, saida: s(html`<p class=${'a b'}>`) },
      igualNoTexto: s(html`<p>total = ${'1 2'}</p>`),
      aspasDentroDeValor: s(html`<p title="a=${'b c'}">`),
      lista: s(lista),
      vazios: s(html`${null}|${undefined}|${false}|${0}|${''}|${true}`),
      cru: s(html`<div>${cru('<b>ok</b>')}</div>`),
      cruFalso: s(html`<div>${fakeCru}</div>`),
      aninhado: s(html`<section>${html`<h2>${'<x>'}</h2>`}</section>`),
      urls: [
        s(html`<a href="${'javascript:window.__xss=6'}">`),
        s(html`<a href="${' JaVa\nScRiPt:window.__xss=7'}">`),
        s(html`<a href=${'javascript:x'}>`),
        s(html`<iframe src="${'data:text/html,<script>1</script>'}">`),
        s(html`<a href="${'https://complexodmc.com.br/?a=1&b=2'}">`),
        s(html`<a href="${'aula.html?id=1&x=2'}">`),
        s(html`<a href="${'mailto:contato@exemplo.invalid'}">`),
        s(html`<img src="${'data:image/png;base64,iVBORw0KGgo='}">`),
        s(html`<img src="${'blob:http://127.0.0.1/abc'}">`),
        s(html`<a href="aula.html?id=${'javascript:1'}">`)
      ],
      tipo: typeof html`x`,
      primitivo: typeof String(html`x`),
      instancia: html`x` instanceof String,
      concat: html`<b>${'a'}</b>` + '!',
      json: JSON.stringify({ h: html`<i>${'x'}</i>` }),
      escIgual: ['<a href="x">', "'", '&amp;', null, undefined, 0, false, 'çãé'].every((v) => esc(v) === window.DMC_escapeHtml(v)),
      semTag: (() => { try { html('<p>x</p>'); return 'sem erro'; } catch (e) { return e.name; } })(),
      xss: window.__xss || 0
    };
  });
  expect(r.texto).toBe('<p>&lt;b&gt;&amp;&quot;&#39;</p>');
  expect(r.d1).toEqual({ scripts: 0, title: '"><script>window.__xss=1</script><img src=x onerror="window.__xss=2">', dataX: "' onmouseover='window.__xss=3", conteudo: '"><script>window.__xss=1</script><img src=x onerror="window.__xss=2">', attrs: ['class', 'title', 'data-x'] });
  expect(r.d2).toEqual({ attrs: ['class', 'id'], classe: 'a onclick=window.__xss=4', id: 'b', saida: '<p class="a b">' });
  expect(r.igualNoTexto).toBe('<p>total = 1 2</p>');
  expect(r.aspasDentroDeValor).toBe('<p title="a=b c">');
  expect(r.lista).toBe('<ul><li>a</li><li>&lt;b&gt;</li><li>c0</li></ul>');
  expect(r.vazios).toBe('|||0||true');
  expect(r.cru).toBe('<div><b>ok</b></div>');
  expect(r.cruFalso).toBe('<div>[object Object]</div>');
  expect(r.aninhado).toBe('<section><h2>&lt;x&gt;</h2></section>');
  expect(r.urls).toEqual([
    '<a href="about:invalid#dmc">',
    '<a href="about:invalid#dmc">',
    '<a href="about:invalid#dmc">',
    '<iframe src="about:invalid#dmc">',
    '<a href="https://complexodmc.com.br/?a=1&amp;b=2">',
    '<a href="aula.html?id=1&amp;x=2">',
    '<a href="mailto:contato@exemplo.invalid">',
    '<img src="data:image/png;base64,iVBORw0KGgo=">',
    '<img src="blob:http://127.0.0.1/abc">',
    '<a href="aula.html?id=javascript:1">'
  ]);
  expect(r).toMatchObject({ tipo: 'object', primitivo: 'string', instancia: true, concat: '<b>a</b>!', json: '{"h":"<i>x</i>"}', escIgual: true, semTag: 'TypeError', xss: 0 });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__xss || 0)).toBe(0);
});

test('S1 · DMC_UI.icone: aria-hidden por padrão, role=img + aria-label com rótulo, chave desconhecida vazia', { tag: ['@F0b'] }, async ({ page }) => {
  await preferenciasS1(page, { 'dmc:token': null });
  await servirS1(page, '__qa-s1-ui.html', htmlS1({ scripts: NUCLEO_S1 }));
  await page.goto('/plataforma-ead/__qa-s1-ui.html');
  const r = await page.evaluate(() => {
    const { icone, html } = window.DMC_UI;
    const d = document.createElement('div');
    d.innerHTML = html`<button type="button">${icone('check')} Concluir</button><span>${icone('lock', { rotulo: 'Bloqueado "até" <amanhã>' })}</span>`;
    const [a, b] = d.querySelectorAll('svg');
    const at = (el) => Object.fromEntries(['aria-hidden', 'focusable', 'role', 'aria-label'].map((n) => [n, el.getAttribute(n)]));
    window.DMC_Icons.__qaDuplo = '<svg aria-hidden="false" role="presentation" viewBox="0 0 24 24"><path d="M0 0"/></svg>';
    return {
      decorativo: at(a), rotulado: at(b),
      desconhecida: String(icone('naoExiste')), proto: String(icone('__proto__')), construtor: String(icone('constructor')),
      semDuplicar: String(icone('__qaDuplo')),
      botaoNome: d.querySelector('button').textContent.trim()
    };
  });
  expect(r.decorativo).toEqual({ 'aria-hidden': 'true', focusable: 'false', role: null, 'aria-label': null });
  expect(r.rotulado).toEqual({ 'aria-hidden': null, focusable: 'false', role: 'img', 'aria-label': 'Bloqueado "até" <amanhã>' });
  expect(r).toMatchObject({ desconhecida: '', proto: '', construtor: '', botaoNome: 'Concluir' });
  expect(r.semDuplicar).toBe('<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M0 0"/></svg>');
});

test('S1 · DMC_UI.erroCarga: pf-alerta--erro no lugar do conteúdo, mensagem só da API, código recolhido e [Tentar de novo]', { tag: ['@F0b'] }, async ({ page }) => {
  await preferenciasS1(page, { 'dmc:token': null });
  await servirS1(page, '__qa-s1-ui.html', htmlS1({ scripts: NUCLEO_S1 }));
  await page.goto('/plataforma-ead/__qa-s1-ui.html');
  await page.evaluate(() => {
    window.__tentou = 0;
    const main = document.getElementById('conteudo');
    main.setAttribute('aria-busy', 'true');
    const err = Object.assign(new Error('Serviço indisponível no momento.'), { status: 503, codigo: 'servico-indisponivel', requestId: 'req-qa-1' });
    window.DMC_UI.erroCarga(main, err, { tentarDeNovo: () => { window.__tentou += 1; } });
  });
  const alerta = page.locator('#conteudo > .pf-alerta.pf-alerta--erro[role="alert"]');
  await expect(alerta).toHaveCount(1);
  await expect(page.locator('#conteudo')).toHaveAttribute('aria-busy', 'false');
  await expect(alerta).toContainText('Não foi possível carregar esta página agora.');
  await expect(alerta).toContainText('Serviço indisponível no momento.');
  await expect(alerta.locator('details.pf-alerta__detalhe')).not.toHaveAttribute('open', '');
  await expect(alerta.locator('details.pf-alerta__detalhe p')).toHaveText('Código 503 · servico-indisponivel · Requisição req-qa-1');
  await alerta.getByRole('button', { name: 'Tentar de novo' }).click();
  expect(await page.evaluate(() => window.__tentou)).toBe(1);
  // Erro de código (sem status): a mensagem interna não vai à tela.
  await page.evaluate(() => window.DMC_UI.erroCarga(document.getElementById('conteudo'), new TypeError("Cannot read properties of undefined (reading 'x')")));
  await expect(alerta).not.toContainText('Cannot read');
  await expect(alerta).toContainText('Verifique sua conexão e tente de novo.');
  await expect(alerta.getByRole('button')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// DMC_Portal.iniciar — sessão, modo restrito, guarda de papel, shell, erro
// ---------------------------------------------------------------------------
// Boots serializados para a página de teste (rodam no navegador).
function bootRegistra(ctx) {
  sessionStorage.setItem('qa:boot:' + location.pathname, '1');
  window.__ctx = { nome: ctx.user ? ctx.user.nome : null, papel: ctx.papel, restrito: ctx.restrito, aba: ctx.params.get('aba'), mainId: ctx.main.id, abortado: ctx.sinal.aborted, chaves: Object.keys(ctx).sort() };
  window.__sinal = ctx.sinal;
  ctx.main.innerHTML = window.DMC_UI.html`<h1 id="qa-ok" tabindex="-1">Olá, ${ctx.user ? ctx.user.nome : 'visitante'}</h1>`;
}
function bootFalha() { throw new TypeError("Cannot read properties of undefined (reading 'qa')"); }
function bootFalhaApi() { return Promise.reject(Object.assign(new Error('Serviço indisponível no momento.'), { status: 503, codigo: 'servico-indisponivel' })); }
function bootSessaoExpirou() { return Promise.reject(Object.assign(new Error('Sessão expirada.'), { status: 401 })); }
const scriptBoot = (boot, opcoes = '{}') => `<script>DMC_Portal.iniciar(${boot.toString()}, ${opcoes});</script>`;
const paginaPortal = (boot = bootRegistra, opcoes = '{}', extra = '') => htmlS1({ scripts: [...NUCLEO_S1, 'js/shell.js'], fim: extra + scriptBoot(boot, opcoes) });
const nextDe = (url) => new URL(url).searchParams.get('next');
async function lerSessao(page) {
  return page.evaluate(() => Object.fromEntries(Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)])));
}

test('S1 · DMC_Portal sem sessão: login.html?next=<página atual validada>, boot não roda, nenhuma chamada à API', { tag: ['@F0b'] }, async ({ page }) => {
  const api = [];
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/api/')) api.push(p); });
  await preferenciasS1(page, { 'dmc:token': null });
  await stubsS1(page);
  await servirS1(page, '__qa-s1-portal.html', paginaPortal());
  await page.goto('/plataforma-ead/__qa-s1-portal.html?aba=2&x=a%20b');
  await page.waitForURL(/\/plataforma-ead\/login\.html\?/);
  expect(nextDe(page.url())).toBe('__qa-s1-portal.html?aba=2&x=a%20b');
  expect(await lerSessao(page)).toEqual({});
  expect(api).toEqual([]);
});

test('S1 · DMC_Portal aluno: ctx completo, shell montado, sinal abortado no pagehide, console e rede limpos', { tag: ['@F0b'] }, async ({ page, request }) => {
  const aluno = await P.criarUsuario(request, { papel: 'aluno' });
  const mon = P.monitorarConsoleERede(page, { fatia: 'F0b' });
  await P.entrarComToken(page, aluno.token);
  await servirS1(page, '__qa-s1-portal.html', paginaPortal());
  await page.goto('/plataforma-ead/__qa-s1-portal.html?aba=2');
  await expect(page.locator('#qa-ok')).toHaveText(`Olá, ${aluno.nome}`);
  expect(await page.evaluate(() => window.__ctx)).toEqual({
    nome: aluno.nome, papel: 'aluno', restrito: false, aba: '2', mainId: 'conteudo', abortado: false,
    chaves: ['main', 'papel', 'params', 'restrito', 'sinal', 'user']
  });
  await expect(page.locator('.shell-top')).toHaveCount(1);
  await expect(page.locator('[data-user-nome]').first()).toHaveText(aluno.nome);
  expect(await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })); return window.__sinal.aborted; })).toBe(true);
  await mon.verificar();
});

test('S1 · DMC_Portal guarda de papel (§5.4): aluno → dashboard, professor → professor.html, admin passa; itens só depois da guarda', { tag: ['@F0b'] }, async ({ page, request }) => {
  const { aluno, professor, admin } = await P.criarPapeis(request);
  await stubsS1(page);
  const itens = "{ papeis: PAPEIS, itens: function (c) { sessionStorage.setItem('qa:itens', c.papel); return []; } }";
  const casos = [
    // [usuário, papeis, destino esperado (null = passa), aviso]
    [aluno, "['professor','admin']", 'dashboard.html', 'Área restrita à equipe.'],
    [aluno, "['admin']", 'dashboard.html', 'Área restrita à coordenação.'],
    [professor, "['admin']", 'professor.html', 'Área restrita à coordenação.'],
    [professor, "['professor','admin']", null, null],
    [admin, "['admin']", null, null],
    [admin, "['aluno']", null, null]
  ];
  for (const [u, papeis, destino, aviso] of casos) {
    const rotulo = `${u.papel} em ${papeis}`;
    await preferenciasS1(page, { 'dmc:token': u.token });
    await servirS1(page, '__qa-s1-guarda.html', paginaPortal(bootRegistra, itens.replace('PAPEIS', papeis)));
    await page.goto('/plataforma-ead/__qa-s1-guarda.html');
    if (destino) {
      await page.waitForURL(new RegExp(`/plataforma-ead/${destino.replace('.', '\\.')}$`));
      expect(await lerSessao(page), rotulo).toEqual({ 'dmc:aviso': aviso });
    } else {
      await expect(page.locator('#qa-ok'), rotulo).toHaveText(`Olá, ${u.nome}`);
      expect((await page.evaluate(() => window.__ctx)).papel, rotulo).toBe(u.papel);
      expect(await lerSessao(page), rotulo).toEqual({ 'qa:itens': u.papel, 'qa:boot:/plataforma-ead/__qa-s1-guarda.html': '1' });
    }
  }
});

test('S1 · DMC_Portal modo restrito (D-63, page.route): fora do perfil → perfil.html#seguranca sem catálogo; no perfil roda com restrito', { tag: ['@F0b'] }, async ({ page }) => {
  const api = [];
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/api/')) api.push(p); });
  await page.route((u) => u.pathname === '/api/auth/me', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'u-qa', email: 'qa-restrito@exemplo.invalid', nome: 'Pessoa QA Restrita', iniciais: 'PQ', isAdmin: false, papel: 'professor', precisaTrocarSenha: true } })
  }));
  await preferenciasS1(page, { 'dmc:token': 'token-qa-restrito' });
  await stubsS1(page, ['login.html', 'dashboard.html', 'professor.html']);
  await servirS1(page, '__qa-s1-portal.html', paginaPortal());
  await servirS1(page, 'perfil.html', paginaPortal(bootRegistra, "{ papeis: ['aluno','professor','admin'] }"));
  await page.goto('/plataforma-ead/__qa-s1-portal.html');
  await page.waitForURL(/\/plataforma-ead\/perfil\.html#seguranca$/);
  await expect(page.locator('#qa-ok')).toHaveText('Olá, Pessoa QA Restrita');
  expect(await page.evaluate(() => window.__ctx)).toMatchObject({ papel: 'professor', restrito: true });
  expect(await lerSessao(page)).toEqual({ 'qa:boot:/plataforma-ead/perfil.html': '1' });
  // Só a validação da sessão, uma por página: nada de /api/catalogo, /api/liberacoes/me, /api/progresso.
  expect(api).toEqual(['/api/auth/me', '/api/auth/me']);
});

test('S1 · DMC_Portal erro: boot que falha → pf-alerta--erro + console.error [DMC] sem pageerror; 401 → login com next; sessão não confirmada não manda ao login', { tag: ['@F0b'] }, async ({ page, request }) => {
  const aluno = await P.criarUsuario(request, { papel: 'aluno' });
  const erros = errosS1(page);
  await stubsS1(page);
  await preferenciasS1(page, { 'dmc:token': aluno.token });

  await servirS1(page, '__qa-s1-erro.html', paginaPortal(bootFalha));
  await page.goto('/plataforma-ead/__qa-s1-erro.html');
  const alerta = page.locator('#conteudo > .pf-alerta--erro[role="alert"]');
  await expect(alerta).toContainText('Não foi possível carregar esta página agora.');
  await expect(alerta).not.toContainText('Cannot read');
  expect(erros.console.filter((t) => t.startsWith('[DMC]'))).toHaveLength(1);
  expect(erros.pagina).toEqual([]);
  // [Tentar de novo] recarrega a página.
  await Promise.all([page.waitForEvent('load'), alerta.getByRole('button', { name: 'Tentar de novo' }).click()]);
  await expect(alerta).toHaveCount(1);

  await servirS1(page, '__qa-s1-erro-api.html', paginaPortal(bootFalhaApi));
  await page.goto('/plataforma-ead/__qa-s1-erro-api.html');
  await expect(alerta).toContainText('Serviço indisponível no momento.');
  await expect(alerta.locator('.pf-alerta__detalhe p')).toHaveText('Código 503 · servico-indisponivel');

  await servirS1(page, '__qa-s1-erro401.html', paginaPortal(bootSessaoExpirou));
  await page.goto('/plataforma-ead/__qa-s1-erro401.html?aba=3');
  await page.waitForURL(/\/plataforma-ead\/login\.html\?/);
  expect(nextDe(page.url())).toBe('__qa-s1-erro401.html?aba=3');

  // /api/auth/me fora do ar (503) com token guardado: não é sessão expirada → erro de carga, sem ir ao login.
  await page.route((u) => u.pathname === '/api/auth/me', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Serviço indisponível."}' }));
  await servirS1(page, '__qa-s1-portal.html', paginaPortal());
  await page.goto('/plataforma-ead/__qa-s1-portal.html');
  await expect(alerta).toContainText('Não foi possível carregar esta página agora.');
  expect(new URL(page.url()).pathname).toBe('/plataforma-ead/__qa-s1-portal.html');
  expect(await page.evaluate(() => localStorage.getItem('dmc:token'))).toBe(aluno.token);
  expect(erros.pagina).toEqual([]);
});

test('S1 · DMC_Portal repassa ao DMC_Shell.montar (modo, area, restrito, itens, papel); modo publica sem guarda nem shell', { tag: ['@F0b'] }, async ({ page, request }) => {
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  const shellFalso = `<script>window.__montar = [];
    window.DMC_Shell = { tema: {}, montar: function (ativo, o) { window.__montar.push({ ativo: ativo, modo: o.modo, area: o.area, restrito: o.restrito, papel: o.papel, itens: o.itens }); } };</script>`;
  const comShellFalso = (boot, opcoes) => htmlS1({ scripts: NUCLEO_S1, fim: shellFalso + scriptBoot(boot, opcoes), shell: 'backoffice' });

  await preferenciasS1(page, { 'dmc:token': admin.token });
  await servirS1(page, '__qa-s1-shell.html', comShellFalso(bootRegistra, "{ pagina: 'qa', area: 'backoffice', papeis: ['professor','admin'], itens: function (c) { return [{ rota: 'inicio', rotulo: c.papel, temUser: !!c.user }]; } }"));
  await page.goto('/plataforma-ead/__qa-s1-shell.html');
  await expect(page.locator('#qa-ok')).toBeVisible();
  expect(await page.evaluate(() => window.__montar)).toEqual([{ ativo: 'qa', modo: 'padrao', area: 'backoffice', restrito: false, papel: 'admin', itens: [{ rota: 'inicio', rotulo: 'admin', temUser: true }] }]);

  // modo foco + pagina padrão = body[data-shell]
  await servirS1(page, '__qa-s1-foco.html', comShellFalso(bootRegistra, "{ modo: 'foco', itens: [1, 2] }"));
  await page.goto('/plataforma-ead/__qa-s1-foco.html');
  await expect(page.locator('#qa-ok')).toBeVisible();
  expect(await page.evaluate(() => window.__montar)).toEqual([{ ativo: 'backoffice', modo: 'foco', area: 'aluno', restrito: false, papel: 'admin', itens: [1, 2] }]);

  // publica: sem token, sem redirecionar, sem shell, boot com user null
  const api = [];
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/api/')) api.push(p); });
  await preferenciasS1(page, { 'dmc:token': null });
  await servirS1(page, '__qa-s1-publica.html', comShellFalso(bootRegistra, "{ modo: 'publica' }"));
  await page.goto('/plataforma-ead/__qa-s1-publica.html');
  await expect(page.locator('#qa-ok')).toHaveText('Olá, visitante');
  expect(await page.evaluate(() => window.__montar)).toEqual([]);
  expect(await page.evaluate(() => window.__ctx)).toMatchObject({ nome: null, papel: null, restrito: false });
  expect(new URL(page.url()).pathname).toBe('/plataforma-ead/__qa-s1-publica.html');
  expect(api).toEqual([]);
});

// =============================================================================
// S3 · contratos publicados (§7.1–§7.5, §7.7) e critérios do G0-a da F0b (§8.5):
// DMC_Api, acréscimos de DMC_Auth/DMC_init/DMC_Data/DMC_Liberacoes/DMC_Icons, modo restrito
// nos boots legados (D-63), DMC_UI completo (escape, abrirArquivo, rascunho de 401,
// reautenticar, consentimento, diálogos com data-pf-acao), DMC_QR + vendor, boot-index.js,
// loja e obrigado (D-69) e o pedido da loja (D-79) por page.route.
// =============================================================================
const APP_JS_S3 = () => fs.readFileSync(path.join(P.EAD_DISCO, 'js', 'app.js'), 'utf8');
const VENDOR_QR = path.join(P.EAD_DISCO, 'js', 'vendor', 'qrcode-generator', 'qrcode.js');
const json = (status, corpo, extra = {}) => ({ status, contentType: 'application/json', body: JSON.stringify(corpo), ...extra });
/** Página de teste com o núcleo (+ extras) e, opcionalmente, um boot por DMC_Portal. */
const paginaS3 = ({ scripts = [], corpo = MAIN_S1, fim = '', shell = 'inicio' } = {}) => htmlS1({ scripts: [...NUCLEO_S1, ...scripts], corpo, fim, shell });
/** Trecho de app.js de uma função (do `async function nome` até a próxima `window.DMC_`). */
function trechoDe(fonte, nome) {
  const ini = fonte.indexOf(`async function ${nome}(`);
  expect(ini, `${nome} em app.js`).toBeGreaterThan(-1);
  const fim = fonte.indexOf(`window.DMC_${nome.replace(/^boot/, 'boot')}`, ini);
  return fonte.slice(ini, fim > ini ? fim : undefined);
}
/** /api/auth/me simulado (modo restrito e afins). */
async function meSimulado(page, user) {
  const rota = (u) => u.pathname === '/api/auth/me';
  const tratar = (r) => r.fulfill(json(200, { user }));
  await page.route(rota, tratar);
  return () => page.unroute(rota, tratar);
}
/** page.evaluate que dispara navegação: o contexto pode sumir antes da resposta. */
const avaliarENavegar = (page, fn) => page.evaluate(fn).catch(() => null);
const USER_RESTRITO = { id: 'u-qa-r', email: 'qa-restrito@exemplo.invalid', nome: 'Pessoa QA Restrita', iniciais: 'PQ', isAdmin: false, papel: 'aluno', precisaTrocarSenha: true };

// ---------------------------------------------------------------------------
// DMC_Api (§7.1)
// ---------------------------------------------------------------------------
test('S3 · DMC_Api: erro com status, codigo, campos, requestId (corpo ou X-Request-Id) e dados; silencioso404; sinal; cabecalhos; 401 apaga o token e avisa', { tag: ['@F0b'] }, async ({ page }) => {
  const vistos = [];
  await page.route((u) => u.pathname.startsWith('/api/qa-s3/'), async (r) => {
    const u = new URL(r.request().url());
    const h = r.request().headers();
    vistos.push({ caminho: u.pathname, metodo: r.request().method(), auth: h.authorization || null, motivo: h['x-motivo'] || null, corpo: r.request().postData() });
    switch (u.pathname) {
      case '/api/qa-s3/validacao': return r.fulfill(json(400, { error: 'Confira os campos destacados.', codigo: 'validacao', campos: { nome: 'Obrigatório.' }, requestId: 'r-corpo-1' }));
      case '/api/qa-s3/cabecalho': return r.fulfill(json(503, { error: 'Serviço indisponível no momento.', codigo: 'servico-indisponivel' }, { headers: { 'X-Request-Id': 'r-cab-2' } }));
      case '/api/qa-s3/texto': return r.fulfill({ status: 500, contentType: 'text/plain', body: 'falha crua' });
      case '/api/qa-s3/ausente': return r.fulfill(json(404, { error: 'Rota não encontrada.' }));
      case '/api/qa-s3/troca': return r.fulfill(json(403, { error: 'Crie uma senha pessoal para continuar.', codigo: 'troca-de-senha-obrigatoria' }));
      case '/api/qa-s3/lento': await new Promise((ok) => setTimeout(ok, 1500)); return r.fulfill(json(200, { ok: true })).catch(() => {});
      case '/api/qa-s3/sessao': return r.fulfill(json(401, { error: 'Sessão expirada. Faça login novamente.' }));
      default: return r.fulfill(json(200, { ok: true }));
    }
  });
  await preferenciasS1(page, { 'dmc:token': 'tok-qa-s3' });
  await servirS1(page, '__qa-s3-api.html', paginaS3());
  await page.goto('/plataforma-ead/__qa-s3-api.html');
  const r = await page.evaluate(async () => {
    const A = window.DMC_Api;
    const pega = async (p) => {
      try { await p; return null; } catch (e) {
        return { message: e.message, status: e.status, codigo: e.codigo ?? null, campos: e.campos ?? null, requestId: e.requestId ?? null, dados: e.dados ?? null, nome: e.name };
      }
    };
    const ev = [];
    window.addEventListener('dmc:sessao-expirada', () => ev.push('sessao-expirada'));
    window.addEventListener('dmc:troca-de-senha', () => ev.push('troca-de-senha'));
    const res = {};
    res.validacao = await pega(A.post('/qa-s3/validacao', { nome: '' }));
    res.cabecalho = await pega(A.get('/qa-s3/cabecalho'));
    res.texto = await pega(A.get('/qa-s3/texto'));
    res.ausente = await pega(A.get('/qa-s3/ausente'));
    res.silencioso = await A.get('/qa-s3/ausente', { silencioso404: true });
    res.blobSilencioso = await A.blob('/qa-s3/ausente', { silencioso404: true });
    res.troca = await pega(A.get('/qa-s3/troca'));
    const c = new AbortController();
    const p = A.get('/qa-s3/lento', { sinal: c.signal });
    setTimeout(() => c.abort(), 100);
    res.abortado = await pega(p);
    res.put = await A.put('/api/qa-s3/ok', { a: 1 }, { cabecalhos: { 'X-Motivo': encodeURIComponent('Correção pedida'), Authorization: 'Bearer forjado' } });
    res.del = await A.del('/qa-s3/ok');
    res.postSemCorpo = await A.post('/qa-s3/ok');
    res.antesDo401 = A.token();
    res.sessao = await pega(A.get('/qa-s3/sessao'));
    res.tokenDepois = A.token();
    res.storage = localStorage.getItem('dmc:token');
    res.eventos = ev;
    return res;
  });
  expect(r.validacao).toEqual({ message: 'Confira os campos destacados.', status: 400, codigo: 'validacao', campos: { nome: 'Obrigatório.' }, requestId: 'r-corpo-1', dados: { error: 'Confira os campos destacados.', codigo: 'validacao', campos: { nome: 'Obrigatório.' }, requestId: 'r-corpo-1' }, nome: 'Error' });
  expect(r.cabecalho).toMatchObject({ message: 'Serviço indisponível no momento.', status: 503, codigo: 'servico-indisponivel', requestId: 'r-cab-2', campos: null });
  expect(r.texto).toMatchObject({ message: 'Erro 500 no servidor.', status: 500, codigo: null, dados: null });
  expect(r.ausente).toMatchObject({ message: 'Rota não encontrada.', status: 404 });
  expect(r.silencioso).toBeNull();
  expect(r.blobSilencioso).toBeNull();
  expect(r.troca).toMatchObject({ status: 403, codigo: 'troca-de-senha-obrigatoria' });
  expect(r.abortado).toMatchObject({ nome: 'AbortError' });
  expect(r).toMatchObject({ put: { ok: true }, del: { ok: true }, postSemCorpo: { ok: true }, antesDo401: 'tok-qa-s3', tokenDepois: null, storage: null });
  expect(r.eventos).toEqual(['troca-de-senha', 'sessao-expirada']);
  const put = vistos.find((v) => v.metodo === 'PUT');
  // '/api/...' vindo do servidor respeita a base; o Authorization é sempre o do token (nunca o de `cabecalhos`).
  expect(put).toMatchObject({ caminho: '/api/qa-s3/ok', auth: 'Bearer tok-qa-s3', motivo: encodeURIComponent('Correção pedida'), corpo: '{"a":1}' });
  expect(vistos.find((v) => v.metodo === 'DELETE').corpo).toBeNull();
  expect(vistos.find((v) => v.metodo === 'POST' && v.caminho === '/api/qa-s3/ok').corpo).toBe('{}');
});

// ---------------------------------------------------------------------------
// DMC_Auth (§7.2): acréscimos, segundo fator, CPF, destino e guardas
// ---------------------------------------------------------------------------
test('S3 · DMC_Auth: NEXT_RE/validarNext, papel/temPapel/destinoInicial por papel semeado, user() com papel', { tag: ['@F0b'] }, async ({ page, request }) => {
  const { aluno, professor, admin } = await P.criarPapeis(request);
  await servirS1(page, '__qa-s3-auth.html', paginaS3());
  for (const [u, papel, destino] of [[aluno, 'aluno', 'dashboard.html'], [professor, 'professor', 'professor.html'], [admin, 'admin', 'admin.html']]) {
    await preferenciasS1(page, { 'dmc:token': u.token });
    await page.goto('/plataforma-ead/__qa-s3-auth.html');
    const r = await page.evaluate(async () => {
      const A = window.DMC_Auth;
      await window.DMC_init({ catalogo: false });
      return {
        papel: A.papel(), userPapel: A.user().papel, isAdmin: A.user().isAdmin, destino: A.destinoInicial(),
        aluno: A.temPapel('aluno'), professor: A.temPapel('professor'), admin: A.temPapel('admin'), lista: A.temPapel(['professor', 'admin']),
        next: ['meus-cursos.html', 'aula.html?id=1&x=2', '//exemplo.invalid/x.html', 'https://exemplo.invalid/a.html', '../a.html', 'a.html#x', 'javascript:alert(1)', '', null].map((s) => A.validarNext(s)),
        re: A.NEXT_RE.source
      };
    });
    expect(r, papel).toMatchObject({ papel, userPapel: papel, isAdmin: papel === 'admin', destino });
    expect({ aluno: r.aluno, professor: r.professor, admin: r.admin, lista: r.lista }, papel).toEqual({
      // um papel por conta (§5.1); só o admin satisfaz qualquer papel
      aluno: papel !== 'professor', professor: papel !== 'aluno', admin: papel === 'admin', lista: papel !== 'aluno'
    });
    expect(r.next).toEqual(['meus-cursos.html', 'aula.html?id=1&x=2', '', '', '', '', '', '', '']);
    expect(r.re).toBe('^[a-z0-9_-]+\\.html(\\?.*)?$');
  }
  // Servidor antigo (sem papel no /me): papel derivado de isAdmin; papel 'admin' sem isAdmin não dá privilégio.
  for (const [user, esperado] of [[{ id: 'a', email: 'a@x.invalid', nome: 'A', iniciais: 'A', isAdmin: true }, 'admin'], [{ id: 'b', email: 'b@x.invalid', nome: 'B', iniciais: 'B', isAdmin: false, papel: 'admin' }, 'aluno']]) {
    await meSimulado(page, user); // a rota mais nova vence
    await preferenciasS1(page, { 'dmc:token': 'tok-qa' });
    await page.goto('/plataforma-ead/__qa-s3-auth.html');
    expect(await page.evaluate(async () => { await window.DMC_init({ catalogo: false }); return [window.DMC_Auth.papel(), window.DMC_Auth.user().papel]; })).toEqual([esperado, esperado]);
  }
});

test('S3 · DMC_Auth.requireOrRedirect leva a login.html?next=<página validada>; requireProfessorOrRedirect barra aluno com aviso; requireAdminOrRedirect inalterado', { tag: ['@F0b'] }, async ({ page, request }) => {
  const { aluno, professor } = await P.criarPapeis(request);
  await stubsS1(page, ['login.html', 'dashboard.html', 'professor.html']);
  await servirS1(page, '__qa-s3-guarda.html', paginaS3());
  // Sem sessão: next com página e query
  await preferenciasS1(page, { 'dmc:token': null });
  await page.goto('/plataforma-ead/__qa-s3-guarda.html?aba=historico&x=1');
  await avaliarENavegar(page, async () => { await window.DMC_init(); window.DMC_Auth.requireOrRedirect(); });
  await page.waitForURL(/\/plataforma-ead\/login\.html\?next=/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('__qa-s3-guarda.html?aba=historico&x=1');
  // `to` explícito continua valendo
  await page.goto('/plataforma-ead/__qa-s3-guarda.html');
  await avaliarENavegar(page, async () => { await window.DMC_init(); window.DMC_Auth.requireOrRedirect('dashboard.html'); });
  await page.waitForURL(/\/plataforma-ead\/dashboard\.html$/);
  // Aluno na guarda de professor → dashboard + aviso
  await preferenciasS1(page, { 'dmc:token': aluno.token });
  await page.goto('/plataforma-ead/__qa-s3-guarda.html');
  await avaliarENavegar(page, async () => { await window.DMC_init({ catalogo: false }); window.DMC_Auth.requireProfessorOrRedirect(); });
  await page.waitForURL(/\/plataforma-ead\/dashboard\.html$/);
  expect(await lerSessao(page)).toEqual({ 'dmc:aviso': 'Área restrita à equipe.' });
  // Professor passa na guarda de professor e cai no `to` da guarda de admin (contrato estável, §5.4)
  await preferenciasS1(page, { 'dmc:token': professor.token });
  await page.goto('/plataforma-ead/__qa-s3-guarda.html');
  expect(await page.evaluate(async () => { await window.DMC_init({ catalogo: false }); return window.DMC_Auth.requireProfessorOrRedirect(); })).toBe(true);
  await avaliarENavegar(page, () => { window.DMC_Auth.requireAdminOrRedirect(); });
  await page.waitForURL(/\/plataforma-ead\/dashboard\.html$/);
});

test('S3 · DMC_Auth: signIn com CPF mascarado envia só os dígitos; 2FA rejeita "segundo-fator" sem gravar token; verificar2fa, link mágico, recuperação e troca de senha', { tag: ['@F0b'] }, async ({ page }) => {
  const corpos = {};
  const desafio = { segundoFator: true, desafio: 'desafio-qa', expiraEm: '2026-10-18T12:05:00.000Z', metodos: ['totp', 'recuperacao'] };
  const userOk = { id: 'u-qa-2fa', email: 'qa-2fa@exemplo.invalid', nome: 'Pessoa QA', iniciais: 'PQ', isAdmin: false, papel: 'professor', doisFatoresAtivo: true };
  await page.route((u) => u.pathname.startsWith('/api/auth/') && u.pathname !== '/api/auth/me', (r) => {
    const p = new URL(r.request().url()).pathname;
    corpos[p] = JSON.parse(r.request().postData() || 'null');
    switch (p) {
      case '/api/auth/signin': return r.fulfill(json(200, desafio));
      case '/api/auth/2fa/verificar': return r.fulfill(json(200, { token: 'tok-2fa', user: userOk, codigosRestantes: 8 }));
      case '/api/auth/link-magico': return r.fulfill(json(503, { error: 'O envio de e-mails está indisponível no momento.', codigo: 'email-indisponivel' }));
      case '/api/auth/link-magico/consumir': return r.fulfill(json(200, desafio));
      case '/api/auth/senha/esqueci': return r.fulfill(json(202, { ok: true, mensagem: 'Se houver uma conta com esse e-mail, enviamos um link.' }));
      case '/api/auth/senha/redefinir': return r.fulfill(json(200, { ok: true }));
      case '/api/auth/senha/trocar': return r.fulfill(json(200, { ok: true, token: 'tok-novo' }));
      default: return r.fulfill(json(404, { error: 'Rota não encontrada.' }));
    }
  });
  await preferenciasS1(page, { 'dmc:token': null });
  await servirS1(page, '__qa-s3-auth2.html', paginaS3());
  await page.goto('/plataforma-ead/__qa-s3-auth2.html');
  const r = await page.evaluate(async () => {
    const A = window.DMC_Auth;
    const pega = async (p) => { try { return { ok: await p }; } catch (e) { return { erro: { message: e.message, codigo: e.codigo, desafio: e.desafio, dados: e.dados } }; } };
    const out = {};
    out.signin = await pega(A.signIn(' 529.982.247-25 ', 'senha-qa'));
    out.tokenDepoisSignin = window.DMC_Api.token();
    out.logado = A.isLogged();
    out.verificar = await pega(A.verificar2fa('desafio-qa', ' 123456 '));
    out.tokenDepoisVerificar = window.DMC_Api.token();
    out.papel = A.papel();
    out.link = await pega(A.pedirLinkMagico(' qa@exemplo.invalid '));
    out.consumir = await pega(A.consumirLinkMagico('token-link'));
    out.esqueci = await pega(A.esqueciSenha('qa@exemplo.invalid'));
    out.redefinir = await pega(A.redefinirSenha('token-redef', 'NovaSenha#2026'));
    out.tokenDepoisRedefinir = window.DMC_Api.token();
    out.trocar = await pega(A.trocarSenha('atual', 'NovaSenha#2026'));
    out.tokenDepoisTrocar = window.DMC_Api.token();
    out.restritoDepois = A.user() && A.user().precisaTrocarSenha;
    return out;
  });
  expect(corpos['/api/auth/signin']).toEqual({ email: '52998224725', senha: 'senha-qa' });
  expect(r.signin.erro).toEqual({ message: 'Digite o código do aplicativo autenticador.', codigo: 'segundo-fator', desafio: 'desafio-qa', dados: desafio });
  expect(r).toMatchObject({ tokenDepoisSignin: null, logado: false });
  expect(corpos['/api/auth/2fa/verificar']).toEqual({ desafio: 'desafio-qa', codigo: '123456' });
  expect(r.verificar.ok).toMatchObject({ token: 'tok-2fa', codigosRestantes: 8 });
  expect(r).toMatchObject({ tokenDepoisVerificar: 'tok-2fa', papel: 'professor' });
  expect(corpos['/api/auth/link-magico']).toEqual({ email: 'qa@exemplo.invalid' });
  expect(r.link.erro).toMatchObject({ codigo: 'email-indisponivel' });
  expect(r.consumir.erro).toMatchObject({ codigo: 'segundo-fator', desafio: 'desafio-qa' });
  expect(r.esqueci.ok).toMatchObject({ ok: true });
  expect(r.redefinir.ok).toEqual({ ok: true });
  expect(r.tokenDepoisRedefinir).toBe('tok-2fa'); // redefinir não loga
  expect(corpos['/api/auth/senha/trocar']).toEqual({ senhaAtual: 'atual', novaSenha: 'NovaSenha#2026' });
  expect(r).toMatchObject({ tokenDepoisTrocar: 'tok-novo', restritoDepois: false });
});

test('S3 · DMC_Auth.recursos(): booleanos do servidor; rota ausente (404) = tudo falso, sem lançar', { tag: ['@F0b'] }, async ({ page }) => {
  await preferenciasS1(page, { 'dmc:token': null });
  await servirS1(page, '__qa-s3-recursos.html', paginaS3());
  await page.goto('/plataforma-ead/__qa-s3-recursos.html');
  const real = await page.evaluate(() => window.DMC_Auth.recursos());
  expect(Object.keys(real).sort()).toEqual(['doisFatores', 'linkMagico', 'loginPorCpf', 'recuperacaoSenha', 'senhaTemporariaPelaCoordenacao']);
  for (const v of Object.values(real)) expect(typeof v).toBe('boolean');
  await page.route((u) => u.pathname === '/api/auth/recursos', (r) => r.fulfill(json(404, { error: 'Rota não encontrada.' })));
  await page.goto('/plataforma-ead/__qa-s3-recursos.html');
  expect(await page.evaluate(() => window.DMC_Auth.recursos())).toEqual({ loginPorCpf: false, linkMagico: false, recuperacaoSenha: false, doisFatores: false, senhaTemporariaPelaCoordenacao: false });
});

// ---------------------------------------------------------------------------
// DMC_init (§7.2, D-63) e boots legados no modo restrito
// ---------------------------------------------------------------------------
test('S3 · DMC_init: {catalogo:false} só valida a sessão; memo por parte; restrito não chama catálogo, liberações nem progresso e resolve', { tag: ['@F0b'] }, async ({ page, request }) => {
  const aluno = await P.criarUsuario(request, { papel: 'aluno' });
  const api = [];
  page.on('request', (q) => { const p = new URL(q.url()).pathname; if (p.startsWith('/api/')) api.push(p); });
  await preferenciasS1(page, { 'dmc:token': aluno.token });
  await servirS1(page, '__qa-s3-init.html', paginaS3());
  await page.goto('/plataforma-ead/__qa-s3-init.html');
  await page.evaluate(() => window.DMC_init({ catalogo: false }));
  expect(api).toEqual(['/api/auth/me']);
  await page.evaluate(async () => { await window.DMC_init(); await window.DMC_init(); await window.DMC_init({ catalogo: true }); });
  expect(api.slice().sort()).toEqual(['/api/auth/me', '/api/catalogo', '/api/liberacoes/me', '/api/progresso'].sort());

  api.length = 0;
  await meSimulado(page, USER_RESTRITO);
  await page.goto('/plataforma-ead/__qa-s3-init.html');
  const r = await page.evaluate(async () => {
    const x = await window.DMC_init().then(() => 'resolveu', (e) => `rejeitou: ${e.message}`);
    return { x, restrito: window.DMC_Auth.user().precisaTrocarSenha, url: location.pathname };
  });
  expect(r).toEqual({ x: 'resolveu', restrito: true, url: '/plataforma-ead/__qa-s3-init.html' }); // não redireciona (o login da 2d usa)
  expect(api).toEqual(['/api/auth/me']);
});

// Os cinco primeiros são apelidos desde a F0b-final (§7.3): carregam o boot novo da página
// (js/portal/*.js), que aplica o modo restrito pelo DMC_Portal.iniciar. Loja e obrigado
// continuam em app.js.
const BOOTS_LEGADOS = ['DMC_bootDashboard', 'DMC_bootPlayer', 'DMC_bootMeusCursos', 'DMC_bootAoVivo', 'DMC_bootCertificados', 'DMC_bootLoja', 'DMC_bootObrigado'];
test('S3 · boots legados de app.js (apelidos e os que ficam) no modo restrito (D-63, page.route): perfil.html#seguranca sem catálogo, liberações nem progresso', { tag: ['@F0b'] }, async ({ page }) => {
  const api = [];
  page.on('request', (q) => { const p = new URL(q.url()).pathname; if (p.startsWith('/api/')) api.push(p); });
  await meSimulado(page, USER_RESTRITO);
  await stubsS1(page, ['perfil.html', 'login.html']);
  await preferenciasS1(page, { 'dmc:token': 'tok-qa-restrito' });
  for (const boot of BOOTS_LEGADOS) {
    api.length = 0;
    await servirS1(page, `__qa-s3-${boot}.html`, paginaS3({ scripts: ['js/shell.js'], corpo: '<main id="conteudo"><div id="loja-grid"></div><div id="obrigado-list"></div></main>', fim: `<script>window.${boot}();</script>` }));
    await page.goto(`/plataforma-ead/__qa-s3-${boot}.html`);
    await page.waitForURL(/\/plataforma-ead\/perfil\.html#seguranca$/);
    expect(api.filter((p) => /^\/api\/(catalogo|liberacoes|progresso)/.test(p)), boot).toEqual([]);
  }
  // As páginas reais da loja e do obrigado (boots legados) fazem o mesmo.
  for (const pg of ['loja.html', 'obrigado.html?cursos=x']) {
    api.length = 0;
    await page.goto(`/plataforma-ead/${pg}`);
    await page.waitForURL(/\/plataforma-ead\/perfil\.html#seguranca$/);
    expect(api.filter((p) => /^\/api\/(catalogo|liberacoes|progresso)/.test(p)), pg).toEqual([]);
  }
});

// ---------------------------------------------------------------------------
// DMC_Data, DMC_Liberacoes, DMC_Icons (§7.3)
// ---------------------------------------------------------------------------
test('S3 · DMC_Data.upsertAula envia rotuloEncontro só quando carregado; atualizarMaterial só com os campos dados; DMC_Liberacoes.has aceita curso.liberado', { tag: ['@F0b'] }, async ({ page, request }) => {
  const professor = await P.criarUsuario(request, { papel: 'professor' });
  const puts = [];
  await page.route((u) => /^\/api\/(aulas)\//.test(u.pathname), (r) => {
    puts.push({ caminho: new URL(r.request().url()).pathname, corpo: JSON.parse(r.request().postData() || '{}') });
    return r.fulfill(json(200, { ok: true }));
  });
  await page.route((u) => u.pathname === '/api/catalogo', (r) => r.fulfill(json(200, { cursos: [
    { id: 'c-docente', titulo: 'Curso que leciona', liberado: true, modulos: [] },
    { id: 'c-outro', titulo: 'Outro curso', modulos: [] }
  ] })));
  await preferenciasS1(page, { 'dmc:token': professor.token });
  await servirS1(page, '__qa-s3-data.html', paginaS3());
  await page.goto('/plataforma-ead/__qa-s3-data.html');
  const r = await page.evaluate(async () => {
    await window.DMC_init();
    const D = window.DMC_Data;
    await D.upsertAula({ id: 'a1', titulo: 'Aula', rotuloEncontro: 'Sexta · noite' }, 'm1');
    await D.upsertAula({ id: 'a2', titulo: 'Aula 2' }, 'm1');
    await D.atualizarMaterial('a1', 'mat1', { categoria: 'slides' });
    await D.atualizarMaterial('a1', 'mat2', { nome: 'Leitura base', categoria: 'leitura', extra: 'x' });
    return { docente: window.DMC_Liberacoes.has(null, 'c-docente'), outro: window.DMC_Liberacoes.has('c-outro'), funcoes: typeof D.renameMaterial };
  });
  expect(puts[0]).toMatchObject({ caminho: '/api/aulas/a1', corpo: { moduloId: 'm1', titulo: 'Aula', rotuloEncontro: 'Sexta · noite' } });
  expect('rotuloEncontro' in puts[1].corpo).toBe(false);
  expect('roteiro' in puts[1].corpo).toBe(false);
  expect(puts[2]).toEqual({ caminho: '/api/aulas/a1/materiais/mat1', corpo: { categoria: 'slides' } });
  expect(puts[3]).toEqual({ caminho: '/api/aulas/a1/materiais/mat2', corpo: { nome: 'Leitura base', categoria: 'leitura' } });
  expect(r).toEqual({ docente: true, outro: false, funcoes: 'function' });
});

const ICONES_S3 = ['navInicio', 'navMeusCursos', 'navAoVivo', 'navAcademico', 'navPublicacoes', 'navFinanceiro', 'navDocumentacao',
  'navDocumentos', 'navDeclaracoes', 'navContratos', 'navComprovantes', 'navAtendimento', 'navTutoriais', 'navCursosDisponiveis',
  'navVisaoGeral', 'navCursos', 'navTurmas', 'navAvaliacoes', 'navCorrecao', 'navDuvidas', 'navOuvidoria', 'navAlunos',
  'navMatriculas', 'navEquipe', 'navRelatorios', 'navAuditoria', 'navConfig', 'navParcerias', 'navBanners', 'busca', 'sino', 'tema',
  'fonteMenos', 'fonteMais', 'conta', 'sair', 'recolher', 'expandir', 'chevron', 'seta', 'fechar', 'check', 'estadoSucesso',
  'estadoInfo', 'estadoAviso', 'estadoErro', 'estadoNeutro', 'play', 'video', 'pdf', 'slides', 'linkExterno', 'baixar', 'enviarArquivo',
  'imprimir', 'qr', 'copiar', 'cadeado', 'calendario', 'relogio', 'enviar', 'anexo', 'mais', 'filtro', 'olho', 'escudo', 'telaCheia'];
const ICONES_LEGADOS = ['check', 'chevronDown', 'chevronLeft', 'chevronRight', 'chevronUp', 'chevronDownSmall', 'play', 'clock', 'book',
  'plus', 'trash', 'download', 'upload', 'refresh', 'cart', 'lock', 'unlock', 'sparkle', 'close', 'search', 'grip', 'playLarge', 'file',
  'imagem', 'roteiro', 'externalLink', 'chat', 'send', 'reply', 'menu', 'navConteudos', 'navMeusCursos', 'navAoVivo', 'navCertificados',
  'navLoja', 'navAdmin', 'calendar', 'print', 'award'];
test('S3 · DMC_Icons: o conjunto da UX §4.12 (viewBox 24, traço 1,5, currentColor) e os legados com o mesmo nome', { tag: ['@F0b'] }, async ({ page }) => {
  await preferenciasS1(page, { 'dmc:token': null });
  await servirS1(page, '__qa-s3-icones.html', paginaS3());
  await page.goto('/plataforma-ead/__qa-s3-icones.html');
  const r = await page.evaluate((chaves) => chaves.map((k) => {
    const s = window.DMC_Icons[k];
    if (typeof s !== 'string') return { k, falta: true };
    const d = document.createElement('div'); d.innerHTML = s; const svg = d.firstElementChild;
    return { k, tag: svg && svg.tagName.toLowerCase(), viewBox: svg && svg.getAttribute('viewBox'), traco: svg && svg.getAttribute('stroke-width'), cor: svg && svg.getAttribute('stroke'), filhos: svg ? svg.children.length : 0 };
  }), [...new Set([...ICONES_S3, ...ICONES_LEGADOS])]);
  for (const i of r) expect(i, i.k).toMatchObject({ tag: 'svg', viewBox: '0 0 24 24', traco: '1.5', cor: 'currentColor' });
  for (const i of r) expect(i.filhos, i.k).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// DMC_QR (§7.7) + vendor (MIT, SHA-256 registrado)
// ---------------------------------------------------------------------------
function matrizDoVendor(texto, nivel = 'M') {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(VENDOR_QR, 'utf8'), sandbox);
  const q = sandbox.qrcode(0, nivel);
  q.addData(texto);
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (__, c) => q.isDark(r, c)));
}
function matrizDoSvg(svg) {
  const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  const margem = Number(/data-pf-qr-margem="(\d+)"/.exec(svg)[1]);
  const n = Number(vb[1]) - 2 * margem;
  const m = Array.from({ length: n }, () => Array(n).fill(false));
  const d = /<path fill="#000" d="([^"]*)"/.exec(svg)[1];
  for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let k = 0; k < Number(w); k++) m[Number(y) - margem][Number(x) - margem + k] = true;
  }
  return { m, margem, lado: Number(vb[1]) };
}
test('S3 · DMC_QR: vendor com o SHA-256 registrado e licença MIT; svg com <title>, fundo branco, margem 4 e a mesma matriz do qrcode-generator', { tag: ['@F0b'] }, async ({ page }) => {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(VENDOR_QR)).digest('hex');
  const fonteQr = fs.readFileSync(path.join(P.EAD_DISCO, 'js', 'portal', 'qr.js'), 'utf8');
  expect(fonteQr).toContain(`const VENDOR_SHA256 = '${sha}'`);
  expect(fonteQr).toContain(`SHA-256 do qrcode.js: ${sha}`);
  const licenca = fs.readFileSync(path.join(path.dirname(VENDOR_QR), 'LICENSE'), 'utf8');
  expect(licenca).toMatch(/^MIT License/);
  expect(licenca).toContain('Copyright (c) 2009 Kazuhiko Arase');

  const erros = errosS1(page);
  await preferenciasS1(page, { 'dmc:token': null });
  await servirS1(page, '__qa-s3-qr.html', htmlS1({ scripts: ['js/portal/qr.js'] }));
  await page.goto('/plataforma-ead/__qa-s3-qr.html');
  const url = 'https://complexodmc.com.br/plataforma-ead/validar.html?codigo=DEC-QA00-QA00-0001';
  const r = await page.evaluate(async (texto) => {
    await window.DMC_QR.pronto;
    const Q = window.DMC_QR;
    let semTexto = null;
    try { Q.svg(''); } catch (e) { semTexto = e.name; }
    return { svg: Q.svg(texto), svg2: Q.svg(texto, { tamanho: 192, margem: 2, nivel: 'H', titulo: 'QR de validação' }), sha: Q.VENDOR_SHA256, congelado: Object.isFrozen(Q), semTexto, utf8: Q.matriz('Declaração ção') };
  }, url);
  expect(r).toMatchObject({ sha, congelado: true, semTexto: 'TypeError' });
  expect(r.svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="128" height="128" /);
  expect(r.svg).toContain('<title>Código QR</title>');
  expect(r.svg).toMatch(/<rect width="\d+" height="\d+" fill="#fff"\/>/);
  const esperado = matrizDoVendor(url, 'M');
  const lido = matrizDoSvg(r.svg);
  expect(lido.margem).toBe(4);
  expect(lido.lado).toBe(esperado.length + 8);
  expect(lido.m).toEqual(esperado);
  const lido2 = matrizDoSvg(r.svg2);
  expect(r.svg2).toContain('<title>QR de validação</title>');
  expect(r.svg2).toMatch(/width="192" height="192"/);
  expect(lido2.margem).toBe(2);
  expect(lido2.m).toEqual(matrizDoVendor(url, 'H'));
  expect(r.utf8.length).toBeGreaterThan(20);
  expect(erros).toEqual({ console: [], pagina: [] });
});

test('S3 · qr.js carrega o vendor sozinho: certificado.html sem erro de MIME; DMC_UI.carregarScript(qr.js) só resolve com o gerador pronto; outra origem recusada', { tag: ['@F0b'] }, async ({ page }) => {
  const mon = P.monitorarConsoleERede(page, { fatia: 'F0b' });
  await preferenciasS1(page, { 'dmc:token': null });
  await page.goto('/plataforma-ead/certificado.html?codigo=DMC-QA00-0000');
  await expect.poll(() => page.evaluate(() => !!(window.DMC_QR && typeof window.qrcode === 'function'))).toBe(true);
  const c = await mon.classificar();
  expect(c.inesperadas.filter((i) => /qr\.js|qrcode|MIME/i.test(`${i.url || ''} ${i.texto || ''} ${i.mensagem || ''}`))).toEqual([]);

  await servirS1(page, '__qa-s3-qr2.html', paginaS3());
  await page.goto('/plataforma-ead/__qa-s3-qr2.html');
  const r = await page.evaluate(async () => {
    const antes = typeof window.DMC_QR;
    await window.DMC_UI.carregarScript('js/portal/qr.js?v=dev');
    const svg = window.DMC_QR.svg('otpauth://totp/Complexo%20DMC:qa@exemplo.invalid?secret=JBSWY3DPEHPK3PXP&issuer=Complexo%20DMC');
    const mesma = window.DMC_UI.carregarScript('js/portal/qr.js?v=dev') === window.DMC_UI.carregarScript('js/portal/qr.js?v=dev');
    const fora = await window.DMC_UI.carregarScript('https://exemplo.invalid/x.js').then(() => 'carregou', (e) => e.message);
    return { antes, temSvg: svg.startsWith('<svg'), mesma, fora, scripts: [...document.scripts].filter((s) => /qrcode\.js/.test(s.src)).length };
  });
  expect(r).toEqual({ antes: 'undefined', temSvg: true, mesma: true, fora: 'Só scripts da própria plataforma podem ser carregados.', scripts: 1 });
});

// ---------------------------------------------------------------------------
// Arquivos (D-47): tipo refeito pelos bytes; HTML e SVG nunca abrem em aba
// ---------------------------------------------------------------------------
test('S3 · DMC_UI.abrirArquivo: text/html e image/svg+xml baixam e não abrem aba (mesmo com Content-Type mentindo); PDF e PNG abrem com o tipo refeito; aba bloqueada baixa; sem leitor de PDF baixa com o nome', { tag: ['@F0b'] }, async ({ page, request }) => {
  // O PDF só abre em aba onde o navegador tem leitor (o Chromium sem interface não tem, e a aba
  // blob: viraria download com nome aleatório). Aqui o leitor é declarado; o caso sem leitor vem no fim.
  await page.addInitScript(() => { if (!window.__semLeitorPdf) Object.defineProperty(Navigator.prototype, 'pdfViewerEnabled', { configurable: true, get: () => !window.__semLeitorPdf }); });
  const aluno = await P.criarUsuario(request, { papel: 'aluno' });
  const ARQ = {
    html: { tipo: 'application/pdf', corpo: Buffer.from('<!doctype html><script>window.opener && (window.opener.__roubado = localStorage.getItem("dmc:token"))</script>') },
    svg: { tipo: 'image/svg+xml', corpo: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') },
    pdf: { tipo: 'text/html', corpo: P.PDF_MINIMO },
    png: { tipo: 'application/octet-stream', corpo: P.PNG_1PX }
  };
  await page.route((u) => u.pathname.startsWith('/api/qa-s3/arquivo/'), (r) => {
    const k = new URL(r.request().url()).pathname.split('/').pop();
    return r.fulfill({ status: 200, contentType: ARQ[k].tipo, body: ARQ[k].corpo });
  });
  await preferenciasS1(page, { 'dmc:token': aluno.token });
  await servirS1(page, '__qa-s3-arquivo.html', paginaS3({ corpo: '<main id="conteudo"><button id="abrir" type="button">Abrir</button></main>' }));
  await page.goto('/plataforma-ead/__qa-s3-arquivo.html');
  await page.evaluate(() => {
    window.__abertos = []; window.__blobs = [];
    const abrir = window.open;
    window.open = function (u, alvo) { window.__abertos.push(String(u)); return window.__bloquear ? null : abrir.call(window, u, alvo); };
    const criar = URL.createObjectURL;
    URL.createObjectURL = function (b) { window.__blobs.push(b && b.type); return criar.call(URL, b); };
    document.getElementById('abrir').addEventListener('click', () => {
      window.__fim = window.DMC_UI.abrirArquivo(`/api/qa-s3/arquivo/${window.__qual}`, { nome: `arquivo-${window.__qual}` }).then(() => 'ok', (e) => e.message);
    });
  });
  const popups = [];
  page.context().on('page', (p) => popups.push(p));
  for (const k of ['html', 'svg']) {
    await page.evaluate((q) => { window.__qual = q; window.__abertos = []; window.__blobs = []; }, k);
    const download = page.waitForEvent('download');
    await page.locator('#abrir').click();
    const d = await download;
    expect(await page.evaluate(() => window.__fim)).toBe('ok');
    expect(await page.evaluate(() => ({ abertos: window.__abertos, blobs: window.__blobs })), k).toEqual({ abertos: [], blobs: ['application/octet-stream'] });
    expect(d.suggestedFilename()).toBe(`arquivo-${k}`);
  }
  expect(popups).toEqual([]);
  for (const [k, tipo] of [['pdf', 'application/pdf'], ['png', 'image/png']]) {
    await page.evaluate((q) => { window.__qual = q; window.__abertos = []; window.__blobs = []; }, k);
    const popup = page.waitForEvent('popup');
    await page.locator('#abrir').click();
    const p = await popup;
    expect(await page.evaluate(() => window.__fim)).toBe('ok');
    const r = await page.evaluate(() => ({ abertos: window.__abertos, blobs: window.__blobs }));
    expect(r.blobs, k).toEqual([tipo]);
    expect(r.abertos[0], k).toMatch(/^blob:http:\/\/127\.0\.0\.1:\d+\//);
    await p.close();
  }
  expect(await page.evaluate(() => window.__roubado || null)).toBeNull();
  // Aba bloqueada pelo navegador → download
  await page.evaluate(() => { window.__qual = 'pdf'; window.__bloquear = true; window.__abertos = []; window.__blobs = []; });
  const d2 = page.waitForEvent('download');
  await page.locator('#abrir').click();
  expect((await d2).suggestedFilename()).toBe('arquivo-pdf.pdf');
  expect(await page.evaluate(() => window.__blobs)).toEqual(['application/pdf', 'application/octet-stream']);
  // Sem leitor de PDF (pdfViewerEnabled === false): baixa direto com o nome, sem aba
  await page.evaluate(() => { window.__semLeitorPdf = true; window.__bloquear = false; window.__abertos = []; window.__blobs = []; });
  expect(await page.evaluate(() => navigator.pdfViewerEnabled)).toBe(false);
  const d3 = page.waitForEvent('download');
  await page.locator('#abrir').click();
  expect((await d3).suggestedFilename()).toBe('arquivo-pdf.pdf');
  expect(await page.evaluate(() => ({ abertos: window.__abertos, blobs: window.__blobs }))).toEqual({ abertos: [], blobs: ['application/octet-stream'] });
});

// ---------------------------------------------------------------------------
// Rascunho de 401 (§7.4, D-47)
// ---------------------------------------------------------------------------
const FORMS_RASCUNHO = `<a class="dmc-skip" href="#conteudo">Pular para o conteúdo</a><main id="conteudo" class="pf-main" tabindex="-1"><h1>Rascunho</h1></main>`;
function bootRascunho(ctx) {
  ctx.main.insertAdjacentHTML('beforeend', `
    <form id="marcado" data-pf-rascunho="atendimento">
      <input name="assunto"><textarea name="mensagem"></textarea>
      <input name="contato" autocomplete="email"><input name="nomeCompleto" autocomplete="section-a name">
      <input name="senha" type="password"><input name="codigo" autocomplete="one-time-code"><input type="hidden" name="versao" value="7">
      <input name="cep" autocomplete="postal-code"><input name="exceto" data-pf-sem-rascunho>
      <label><input type="checkbox" name="urgente" value="sim"> Urgente</label>
      <select name="categoria"><option value="">-</option><option value="financeiro">Financeiro</option></select>
    </form>
    <form id="livre"><input name="naoMarcado"></form>
    <button id="sair" type="button">Chamar API</button>`);
  document.getElementById('sair').addEventListener('click', () => { window.DMC_Api.get('/qa-s3/expirou').catch(() => {}); });
}
test('S3 · rascunho de 401: só o formulário marcado e sem senha, código, dado pessoal nem oculto; repõe depois do login e apaga; perfil nunca guarda', { tag: ['@F0b'] }, async ({ page, request }) => {
  const aluno = await P.criarUsuario(request, { papel: 'aluno' });
  await page.route((u) => u.pathname === '/api/qa-s3/expirou', (r) => r.fulfill(json(401, { error: 'Sessão expirada. Faça login novamente.' })));
  await stubsS1(page, ['login.html']);
  await preferenciasS1(page, { 'dmc:token': aluno.token });
  await servirS1(page, '__qa-s3-rascunho.html', paginaS3({ corpo: FORMS_RASCUNHO, fim: scriptBoot(bootRascunho), shell: 'atendimento' }));
  await page.goto('/plataforma-ead/__qa-s3-rascunho.html?aba=nova');
  const f = page.locator('#marcado');
  await f.locator('[name="assunto"]').fill('Dúvida sobre o módulo 2');
  await f.locator('[name="mensagem"]').fill('Linha 1\nLinha 2');
  for (const [n, v] of [['contato', 'qa@exemplo.invalid'], ['nomeCompleto', 'Fulana de Tal'], ['senha', 'Segredo#1'], ['codigo', '123456'], ['cep', '01310-100'], ['exceto', 'nao']]) await f.locator(`[name="${n}"]`).fill(v);
  await f.locator('[name="urgente"]').check();
  await f.locator('[name="categoria"]').selectOption('financeiro');
  await page.locator('#livre [name="naoMarcado"]').fill('fora');
  await page.locator('#sair').click();
  await page.waitForURL(/\/plataforma-ead\/login\.html\?next=/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('__qa-s3-rascunho.html?aba=nova');
  const sessao = await lerSessao(page);
  expect(Object.keys(sessao)).toEqual(['dmc:rascunho:__qa-s3-rascunho']);
  const salvo = JSON.parse(sessao['dmc:rascunho:__qa-s3-rascunho']);
  expect(salvo.formularios).toEqual({ atendimento: { assunto: 'Dúvida sobre o módulo 2', mensagem: 'Linha 1\nLinha 2', urgente: ['sim'], categoria: 'financeiro' } });
  expect(JSON.stringify(salvo)).not.toMatch(/Segredo|123456|qa@exemplo|Fulana|01310|fora|"7"/);
  expect(await page.evaluate(() => localStorage.getItem('dmc:token'))).toBeNull();

  // Depois de entrar de novo: repõe, avisa e apaga
  await P.entrarComToken(page, aluno.token);
  await page.goto('/plataforma-ead/__qa-s3-rascunho.html?aba=nova');
  await expect(f.locator('[name="assunto"]')).toHaveValue('Dúvida sobre o módulo 2');
  await expect(f.locator('[name="mensagem"]')).toHaveValue('Linha 1\nLinha 2');
  await expect(f.locator('[name="urgente"]')).toBeChecked();
  await expect(f.locator('[name="categoria"]')).toHaveValue('financeiro');
  await expect(f.locator('[name="senha"]')).toHaveValue('');
  await expect(page.locator('.pf-toast')).toContainText('Recuperamos o que você tinha digitado');
  expect(await lerSessao(page)).toEqual({});

  // Em perfil.html (e meus-dados, contrato, assistente) nada vai a rascunho, nem com a marca.
  await servirS1(page, 'perfil.html', paginaS3({ corpo: FORMS_RASCUNHO, fim: scriptBoot(bootRascunho) }));
  await page.goto('/plataforma-ead/perfil.html');
  await f.locator('[name="assunto"]').fill('Algo');
  await page.locator('#sair').click();
  await page.waitForURL(/\/plataforma-ead\/login\.html/);
  expect(await lerSessao(page)).toEqual({});
});

// ---------------------------------------------------------------------------
// Diálogos: confirmar (data-pf-acao, D-76), reautenticar (D-57), formulario, upload
// ---------------------------------------------------------------------------
async function abrirPaginaUi(page, request, { user = null, rotas = null } = {}) {
  const aluno = user ? null : await P.criarUsuario(request, { papel: 'aluno' });
  if (rotas) await rotas(page);
  await preferenciasS1(page, { 'dmc:token': user ? 'tok-qa' : aluno.token });
  if (user) await meSimulado(page, user);
  // Sem shell: o diálogo e os componentes não dependem dele (e o token simulado não serve às rotas do shell).
  await servirS1(page, '__qa-s3-ui.html', paginaS3({ corpo: `${MAIN_S1}<button id="gatilho" type="button">Gatilho</button>`, fim: scriptBoot(bootRegistra) }));
  await page.goto('/plataforma-ead/__qa-s3-ui.html');
  await expect(page.locator('#qa-ok')).toBeVisible();
}

test('S3 · DMC_UI.confirmar: foco em Cancelar, data-pf-acao nos dois botões, confirmarNaTela passa; Esc e Cancelar devolvem false; motivo 10–500 devolve {motivo}', { tag: ['@F0b'] }, async ({ page, request }) => {
  await abrirPaginaUi(page, request);
  await page.locator('#gatilho').focus();
  await page.evaluate(() => { window.__r = window.DMC_UI.confirmar({ titulo: 'Apagar esta conversa?', texto: '<b>12</b> mensagens somem.', rotuloConfirmar: 'Apagar conversa', perigo: true }); });
  const dlg = page.locator('dialog.pf-dialogo[open]');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('[data-pf-acao="cancelar"]')).toBeFocused();
  await expect(dlg.locator('[data-pf-acao="confirmar"]')).toHaveText('Apagar conversa');
  await expect(dlg.locator('[data-pf-acao="confirmar"]')).toHaveClass(/pf-btn--perigo/);
  await expect(dlg.locator('.pf-dialogo__corpo p')).toHaveText('<b>12</b> mensagens somem.'); // texto escapado
  await expect(dlg).toHaveAttribute('aria-labelledby', /pf-dialogo-titulo/);
  expect(await P.confirmarNaTela(page)).toBe('pf');
  expect(await page.evaluate(() => window.__r)).toBe(true);
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('#gatilho')).toBeFocused(); // foco volta ao gatilho

  await page.evaluate(() => { window.__r = window.DMC_UI.confirmar({ titulo: 'Sair?' }); });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__r)).toBe(false);
  await page.evaluate(() => { window.__r = window.DMC_UI.confirmar({ titulo: 'Sair?' }); });
  await page.locator('[data-pf-acao="cancelar"]').click();
  expect(await page.evaluate(() => window.__r)).toBe(false);

  await page.evaluate(() => { window.__r = window.DMC_UI.confirmar({ titulo: 'Revogar?', motivo: true, exigirTexto: 'REVOGAR' }); });
  await page.locator('[data-pf-acao="confirmar"]').click();
  await expect(page.locator('.pf-erro-campo')).toHaveCount(2);
  await page.getByLabel(/Motivo \(fica registrado na auditoria\)/).fill('Pedido do titular por escrito.');
  await page.getByLabel('Para confirmar, digite REVOGAR').fill('REVOGAR');
  await page.locator('[data-pf-acao="confirmar"]').click();
  expect(await page.evaluate(() => window.__r)).toEqual({ motivo: 'Pedido do titular por escrito.' });
});

test('S3 · DMC_UI.dialogo: acao opcional vira data-pf-acao (confirmarNaTela passa); um só botão "Fechar"; Esc devolve null', { tag: ['@F0b'] }, async ({ page, request }) => {
  await abrirPaginaUi(page, request);
  await page.evaluate(() => {
    window.__r = window.DMC_UI.dialogo({ titulo: 'Publicar avaliação?', conteudo: '<p>Os alunos recebem uma notificação.</p>',
      acoes: [{ rotulo: 'Cancelar', valor: false, tipo: 'secundario', acao: 'cancelar' }, { rotulo: 'Publicar', valor: true, tipo: 'primario', acao: 'confirmar' }, { rotulo: 'Outro', valor: 'x', acao: 'qualquer' }] });
  });
  const dlg = page.locator('dialog.pf-dialogo[open]');
  await expect(dlg.locator('[data-pf-acao="cancelar"]')).toHaveText('Cancelar');
  await expect(dlg.locator('[data-pf-acao="confirmar"]')).toHaveText('Publicar');
  await expect(dlg.getByRole('button', { name: 'Outro' })).not.toHaveAttribute('data-pf-acao', /./);
  expect(await P.confirmarNaTela(page)).toBe('pf');
  expect(await page.evaluate(() => window.__r)).toBe(true);
  // Sem ações: um único "Fechar" (nenhum × duplicado no cabeçalho)
  await page.evaluate(() => { window.__r = window.DMC_UI.dialogo({ titulo: 'Senha temporária', conteudo: '<p>Anote agora.</p>' }); });
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Fechar' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.__r)).toBeNull();
});

test('S3 · DMC_UI.reautenticar: botão só com senha; 400 campos.senha mantém o diálogo com "Senha incorreta." no campo; outro erro vira alerta no diálogo; 429 fecha com toast; nada em storage', { tag: ['@F0b'] }, async ({ page, request }) => {
  const respostas = [];
  await abrirPaginaUi(page, request, {
    rotas: async (p) => p.route((u) => u.pathname === '/api/qa-s3/chave', (r) => {
      const corpo = JSON.parse(r.request().postData() || '{}');
      respostas.push(corpo);
      const fila = [
        json(400, { error: 'Confira os campos destacados.', codigo: 'validacao', campos: { senha: 'Senha atual incorreta.' } }),
        json(503, { error: 'Serviço indisponível no momento.', codigo: 'servico-indisponivel' }),
        json(200, { ok: true, configurada: true, ultimos4: 'AbCd' }),
        json(429, { error: 'Muitas tentativas. Tente de novo em alguns minutos.', codigo: 'muitas-tentativas' })
      ];
      return r.fulfill(fila[respostas.length - 1]);
    })
  });
  await page.locator('#gatilho').focus();
  await page.evaluate(() => {
    window.__r = window.DMC_UI.reautenticar({ rotuloConfirmar: 'Salvar chave', enviar: (reautenticacao) => window.DMC_Api.put('/qa-s3/chave', { chave: 'AIza-qa', reautenticacao }) });
  });
  const dlg = page.locator('dialog.pf-dialogo--p[open]');
  await expect(dlg.locator('.pf-dialogo__titulo')).toHaveText('Confirme sua identidade');
  await expect(dlg.locator('fieldset.pf-reautenticacao')).toBeVisible();
  const senha = dlg.getByLabel('Senha atual', { exact: true });
  await expect(senha).toBeFocused();
  await expect(senha).toHaveAttribute('autocomplete', 'current-password');
  await expect(dlg.getByLabel('Código do aplicativo')).toHaveCount(0); // sem 2FA ativo
  const salvar = dlg.locator('[data-pf-acao="confirmar"]');
  await expect(salvar).toHaveText('Salvar chave');
  await expect(salvar).toBeDisabled();
  await senha.fill('errada');
  await expect(salvar).toBeEnabled();
  await senha.press('Enter'); // Enter confirma
  await expect(dlg.locator('.pf-erro-campo')).toHaveText('Senha incorreta.');
  await expect(senha).toHaveAttribute('aria-invalid', 'true');
  await expect(dlg).toBeVisible();
  await senha.fill('certa-mas-servidor-fora');
  await salvar.click();
  await expect(dlg.locator('.pf-alerta--erro')).toContainText('Serviço indisponível no momento.');
  await expect(dlg).toBeVisible();
  await salvar.click();
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.__r)).toEqual({ ok: true, configurada: true, ultimos4: 'AbCd' });
  await expect(page.locator('#gatilho')).toBeFocused();
  expect(respostas.map((c) => c.reautenticacao)).toEqual([{ senha: 'errada' }, { senha: 'certa-mas-servidor-fora' }, { senha: 'certa-mas-servidor-fora' }]);

  // 429: fecha, toast de erro com a mensagem do servidor e o aviso de sessão encerrada; resolve null
  await page.evaluate(() => {
    window.__r = window.DMC_UI.reautenticar({ rotuloConfirmar: 'Remover chave', enviar: (reautenticacao) => window.DMC_Api.put('/qa-s3/chave', { reautenticacao }) });
  });
  await page.getByLabel('Senha atual', { exact: true }).fill('qualquer');
  await page.locator('[data-pf-acao="confirmar"]').click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('.pf-toast--erro[role="alert"]')).toContainText('Muitas tentativas. Tente de novo em alguns minutos. Por segurança, sua sessão foi encerrada. Entre de novo.');
  expect(await page.evaluate(() => window.__r)).toBeNull();
  const guardado = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(guardado).not.toMatch(/errada|certa-mas|qualquer/);
});

test('S3 · reautenticação com 2FA ativo (Código do aplicativo, 400 campos.codigo) e dentro de confirmar/formulario (um diálogo só, enviar(valores, reautenticacao))', { tag: ['@F0b'] }, async ({ page, request }) => {
  const recebidos = [];
  await abrirPaginaUi(page, request, {
    user: { id: 'u-qa-adm', email: 'qa-adm@exemplo.invalid', nome: 'Coordenação QA', iniciais: 'CQ', isAdmin: true, papel: 'admin', doisFatoresAtivo: true },
    rotas: async (p) => {
      await p.route((u) => u.pathname === '/api/qa-s3/papel', (r) => {
        recebidos.push(JSON.parse(r.request().postData() || '{}'));
        return r.fulfill(recebidos.length === 1 ? json(400, { error: 'Confira os campos destacados.', codigo: 'validacao', campos: { codigo: 'Código inválido.' } }) : json(200, { ok: true }));
      });
      await p.route((u) => /^\/api\/(catalogo|liberacoes\/me|progresso)$/.test(u.pathname), (r) => r.fulfill(json(200, { cursos: [], cursoIds: [], itens: [] })));
    }
  });
  await page.evaluate(() => {
    window.__r = window.DMC_UI.confirmar({
      titulo: 'Alterar o papel para Coordenação?', motivo: true, reautenticar: true, rotuloConfirmar: 'Alterar papel',
      enviar: (valores, reautenticacao) => window.DMC_Api.put('/qa-s3/papel', { papel: 'admin', motivo: valores.motivo, reautenticacao })
    });
  });
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  const dlg = page.locator('dialog[open]');
  await expect(dlg.locator('fieldset.pf-reautenticacao')).toHaveCount(1);
  await dlg.getByLabel(/Motivo/).fill('Assume a coordenação do curso em 2026.');
  await dlg.getByLabel('Senha atual', { exact: true }).fill('Senha#1');
  const codigo = dlg.getByLabel('Código do aplicativo');
  await expect(codigo).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(codigo).toHaveAttribute('inputmode', 'numeric');
  await codigo.fill('000000');
  await dlg.locator('[data-pf-acao="confirmar"]').click();
  await expect(dlg.locator('.pf-erro-campo')).toHaveText('Código inválido.');
  await expect(dlg.getByLabel(/Motivo/)).toHaveValue('Assume a coordenação do curso em 2026.'); // o resto preservado
  await codigo.fill('123456');
  await dlg.locator('[data-pf-acao="confirmar"]').click();
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.__r)).toEqual({ ok: true });
  expect(recebidos[1]).toEqual({ papel: 'admin', motivo: 'Assume a coordenação do curso em 2026.', reautenticacao: { senha: 'Senha#1', codigo: '123456' } });

  // formulario: validação local com resumo pf-erros e foco; erro de campo do servidor; devolve valores
  await page.evaluate(() => {
    window.__f = window.DMC_UI.formulario({
      titulo: 'Novo encontro', rotuloEnviar: 'Salvar encontro',
      campos: [{ nome: 'titulo', rotulo: 'Título', tipo: 'text', obrigatorio: true, max: 80 }, { nome: 'email', rotulo: 'E-mail de contato', tipo: 'email' },
        { nome: 'vagas', rotulo: 'Vagas', tipo: 'number' }, { nome: 'aceite', rotulo: 'Confirmo os dados', tipo: 'checkbox', obrigatorio: true },
        { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: [{ valor: 'ao_vivo', rotulo: 'Ao vivo' }, 'gravado'] }],
      validar: (v) => (v.vagas != null && v.vagas < 1 ? { vagas: 'Pelo menos 1 vaga.' } : null)
    });
  });
  const form = page.locator('dialog[open]');
  await expect(form.getByLabel('Título')).toBeFocused();
  await form.getByLabel('E-mail de contato').fill('sem-arroba');
  await form.locator('[data-pf-acao="confirmar"]').click();
  await expect(form.locator('.pf-erros')).toBeFocused();
  await expect(form.locator('.pf-erros li')).toHaveCount(3);
  await form.getByLabel('Título').fill('Encontro 1');
  await form.getByLabel('E-mail de contato').fill('qa@exemplo.invalid');
  await form.getByLabel('Vagas').fill('0');
  await form.getByLabel('Confirmo os dados').check();
  await form.locator('[data-pf-acao="confirmar"]').click();
  await expect(form.locator('.pf-erros li')).toHaveText(['Vagas: Pelo menos 1 vaga.']);
  await form.getByLabel('Vagas').fill('30');
  await form.getByLabel('Tipo').selectOption('gravado');
  await form.locator('[data-pf-acao="confirmar"]').click();
  expect(await page.evaluate(() => window.__f)).toEqual({ titulo: 'Encontro 1', email: 'qa@exemplo.invalid', vagas: 30, aceite: true, tipo: 'gravado' });
});

test('S3 · DMC_UI.upload: formato e tamanho conferidos no cliente, [Trocar], 415 do servidor no campo, envio devolve o resultado', { tag: ['@F0b'] }, async ({ page, request }) => {
  let chamadas = 0;
  await abrirPaginaUi(page, request, {
    rotas: async (p) => p.route((u) => u.pathname === '/api/qa-s3/upload', (r) => {
      chamadas++;
      return r.fulfill(chamadas === 1 ? json(415, { error: 'O PDF tem conteúdo ativo e não pode ser aceito.', codigo: 'tipo-nao-aceito' }) : json(201, { id: 'doc-1' }));
    })
  });
  await page.evaluate(() => {
    window.__u = window.DMC_UI.upload({ titulo: 'Enviar documento de identidade', formatos: ['pdf', 'jpg', 'png'], maxBytes: 4 * 1024 * 1024, avisoBaseLegal: 'Base legal: obrigação legal.',
      rotuloEnviar: 'Enviar documento', enviar: (f) => window.DMC_Api.upload('/qa-s3/upload', f, f.type) });
  });
  const dlg = page.locator('dialog[open]');
  await expect(dlg.locator('.pf-upload__alvo')).toContainText('PDF, JPG ou PNG, até 4 MB');
  await dlg.locator('[data-pf-acao="confirmar"]').click();
  await expect(dlg.locator('.pf-erro-campo')).toHaveText('Escolha um arquivo.');
  const input = dlg.locator('input[type="file"]');
  await input.setInputFiles({ name: 'foto.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(dlg.locator('.pf-erro-campo')).toHaveText('Formato não aceito. Envie PDF, JPG ou PNG.');
  await input.setInputFiles({ name: 'grande.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(4 * 1024 * 1024 + 1) });
  await expect(dlg.locator('.pf-erro-campo')).toHaveText('Arquivo maior que 4 MB.');
  await input.setInputFiles({ name: 'rg.pdf', mimeType: 'application/pdf', buffer: P.PDF_MINIMO });
  await expect(dlg.locator('.pf-upload__arquivo')).toContainText('rg.pdf');
  await expect(dlg.locator('.pf-erro-campo')).toHaveCount(0);
  await dlg.locator('[data-pf-acao="confirmar"]').click();
  await expect(dlg.locator('.pf-erro-campo')).toHaveText('O PDF tem conteúdo ativo e não pode ser aceito.');
  await dlg.locator('[data-pf-acao="confirmar"]').click();
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.__u)).toEqual({ id: 'doc-1' });
});

// ---------------------------------------------------------------------------
// Consentimento (D-57): texto literal; 428 reabre com o texto novo e foco nele
// ---------------------------------------------------------------------------
test('S3 · DMC_UI.consentimento: texto literal do servidor; caixa no mesmo envio; 428 reabre com o texto novo e foco; botões registram e retiram', { tag: ['@F0b'] }, async ({ page, request }) => {
  const TEXTO = 'Autorizo o registro do meu <b>gênero</b> para estatísticas agregadas.\nA informação aparece só para mim & a coordenação vê só totais.';
  const NOVO = 'Texto v2: autorizo o uso do nome social em declarações.\nPosso retirar a qualquer momento.';
  let chamadas = 0;
  await abrirPaginaUi(page, request, {
    rotas: async (p) => p.route((u) => u.pathname === '/api/qa-s3/perfil', (r) => {
      chamadas++;
      return r.fulfill(chamadas === 1 ? json(428, { error: 'É preciso aceitar o texto atualizado.', codigo: 'consentimento-necessario', finalidade: 'nome_social', texto: NOVO, versaoTexto: 'v2' }) : json(200, { ok: true }));
    })
  });
  const r = await page.evaluate(async ({ TEXTO }) => {
    const el = document.createElement('div'); el.id = 'cons'; document.getElementById('conteudo').appendChild(el);
    window.__c = window.DMC_UI.consentimento(el, { texto: TEXTO, versaoTexto: 'v1', modo: 'caixa' });
    return { texto: el.querySelector('.pf-consentimento__texto').textContent, temB: !!el.querySelector('.pf-consentimento__texto b'), leitura: el.querySelector('.pf-consentimento__texto').classList.contains('pf-leitura'), aceite: window.__c.aceite(), versao: el.querySelector('.pf-consentimento__versao').textContent };
  }, { TEXTO });
  expect(r).toEqual({ texto: TEXTO, temB: false, leitura: true, aceite: null, versao: 'Versão v1' });
  await page.locator('#cons').getByLabel('Concordo com este uso').check();
  expect(await page.evaluate(() => window.__c.aceite())).toEqual({ aceito: true, versaoTexto: 'v1' });
  // Envio com 428 → exigir() com o texto do servidor
  await page.evaluate(async () => {
    try { await window.DMC_Api.put('/qa-s3/perfil', { nomeSocial: 'Ana', consentimentos: { nome_social: window.__c.aceite() } }); } catch (e) {
      if (e.status === 428) window.__c.exigir({ texto: e.dados.texto, versaoTexto: e.dados.versaoTexto });
    }
  });
  const cons = page.locator('#cons');
  await expect(cons).toHaveClass(/is-exigido/);
  // Foco no controle do aceite, descrito pelo texto literal (o leitor de tela lê o texto novo).
  const caixa428 = cons.getByLabel('Concordo com este uso');
  await expect(caixa428).toBeFocused();
  await expect(caixa428).not.toBeChecked();
  expect(await caixa428.evaluate((e) => document.getElementById(e.getAttribute('aria-describedby')).textContent)).toBe(NOVO);
  expect(await cons.locator('.pf-consentimento__texto').evaluate((e) => e.textContent)).toBe(NOVO);
  await expect(cons.locator('.pf-consentimento__versao')).toHaveText('Versão v2');
  expect(await page.evaluate(() => window.__c.aceite())).toBeNull();
  await cons.getByLabel('Concordo com este uso').check();
  expect(await page.evaluate(() => window.__c.aceite())).toEqual({ aceito: true, versaoTexto: 'v2' });

  // Modo botões (foto, assistente): aceitar registra; erro fica no componente; retirar volta ao pendente
  await page.evaluate(() => {
    const el = document.createElement('div'); el.id = 'cons2'; document.getElementById('conteudo').appendChild(el);
    window.__falhar = true;
    window.__c2 = window.DMC_UI.consentimento(el, {
      texto: 'Autorizo o uso da minha foto no portal.', versaoTexto: 'v1', modo: 'botoes', rotulos: { aceitar: 'Concordo', recusar: 'Agora não' },
      aoAceitar: () => (window.__falhar ? Promise.reject(Object.assign(new Error('Serviço indisponível no momento.'), { status: 503 })) : Promise.resolve()),
      aoRecusar: () => Promise.resolve(), aoRetirar: () => Promise.resolve()
    });
  });
  const c2 = page.locator('#cons2');
  await c2.getByRole('button', { name: 'Concordo' }).click();
  await expect(c2.locator('.pf-alerta--erro')).toContainText('Serviço indisponível no momento.');
  await page.evaluate(() => { window.__falhar = false; });
  await c2.getByRole('button', { name: 'Concordo' }).click();
  const hoje = await page.evaluate(() => window.DMC_UI.fmt.data(new Date().toISOString()));
  await expect(c2.locator('.pf-consentimento__registro')).toHaveText(`Autorizado em ${hoje} · versão v1`);
  await c2.getByRole('button', { name: 'Retirar autorização' }).click();
  await expect(c2.locator('.pf-consentimento__registro')).toHaveText('Autorização retirada.');
  await expect(c2.getByRole('button', { name: 'Concordo' })).toBeVisible();
  // Registro vigente vindo do servidor
  await page.evaluate(() => {
    const el = document.createElement('div'); el.id = 'cons3'; document.getElementById('conteudo').appendChild(el);
    window.__c3 = window.DMC_UI.consentimento(el, { texto: 'Texto', versaoTexto: 'v1', registro: { em: '2026-10-18', versaoTexto: 'v1' } });
  });
  await expect(page.locator('#cons3 .pf-consentimento__registro')).toHaveText('Autorizado em 18/10/2026 · versão v1');
  expect(await page.evaluate(() => { const a = window.__c3.aceite(); window.__c3.destruir(); return [a, document.getElementById('cons3').innerHTML, document.getElementById('cons3').className]; })).toEqual([null, '', '']);
});

// ---------------------------------------------------------------------------
// Componentes de tela, formatação e validação
// ---------------------------------------------------------------------------
test('S3 · toast (máx. 3, erro fica com role=alert, info some, ação não some), anunciar, estado, progresso, codigo [Copiar], kpis, donut, barras, esqueleto, vazio, alerta, ocupado', { tag: ['@F0b'] }, async ({ page, request }) => {
  await abrirPaginaUi(page, request);
  await page.evaluate(() => {
    const U = window.DMC_UI;
    U.toast('Primeiro.', { tipo: 'sucesso', duracaoMs: 400 });
    U.toast('Falhou.', { tipo: 'erro', duracaoMs: 100 });
    U.toast('Com ação.', { tipo: 'info', duracaoMs: 100, acao: { rotulo: 'Desfazer', aoClicar: () => { window.__desfez = true; } } });
    U.toast('Quarto.', { tipo: 'aviso', duracaoMs: 400 });
  });
  await expect(page.locator('.pf-toast')).toHaveCount(3); // o mais antigo saiu
  await expect(page.locator('.pf-toast--erro')).toHaveAttribute('role', 'alert');
  await expect(page.locator('.pf-toast--aviso')).toHaveAttribute('role', 'status');
  await page.waitForTimeout(900);
  await expect(page.locator('.pf-toast')).toHaveCount(2); // erro e com ação ficam
  await page.locator('.pf-toast').getByRole('button', { name: 'Desfazer' }).click();
  expect(await page.evaluate(() => window.__desfez)).toBe(true);
  await page.locator('.pf-toast--erro').getByRole('button', { name: 'Fechar aviso' }).click();
  await expect(page.locator('.pf-toast')).toHaveCount(0);

  await page.evaluate(() => window.DMC_UI.anunciar('Encontro salvo.', { assertivo: true }));
  await expect(page.locator('#pf-anuncio-assertivo')).toHaveText('Encontro salvo.');

  const r = await page.evaluate(() => {
    const U = window.DMC_UI;
    const m = document.getElementById('conteudo');
    const caixa = (id) => { const d = document.createElement('div'); d.id = id; m.appendChild(d); return d; };
    const est = String(U.estado('Em atraso', 'erro', { destaque: true }));
    const prog = String(U.progresso(37.6, { rotulo: 'Progresso do curso' }));
    caixa('cod').innerHTML = U.codigo('a3f9c2e1b4d5f6a7b8c9d0e1', { curto: true });
    U.kpis(caixa('kpis'), [{ rotulo: 'Média parcial', valor: '7,5', nota: '2 de 3 módulos' }, { rotulo: 'Frequência', valor: null, nota: 'Sem registros ainda' }, { rotulo: 'Em aberto', valor: 'R$ 1,00', href: 'financeiro.html' }]);
    U.donut(caixa('donut'), { pct: 90, rotulo: '90% de acerto' });
    U.barras(caixa('barras'), { legenda: 'Alunos por curso', linhas: [{ rotulo: 'A', valor: 10 }, { rotulo: 'B', valor: 5, texto: '5 alunos' }] });
    const esq = caixa('esq'); U.esqueleto(esq, { tipo: 'tabela', linhas: 4 });
    const vazio = U.estadoVazio(caixa('vazio'), { icone: 'navFinanceiro', titulo: 'Nenhum lançamento registrado.', texto: 'Aparecem aqui quando a coordenação registra.', acao: { rotulo: 'Falar com a equipe', href: 'atendimentos.html' } });
    const al = U.alerta(caixa('alerta'), { tom: 'sucesso', titulo: 'Pronto', texto: 'Salvo.' });
    const b = document.createElement('button'); b.innerHTML = '<span>Salvar</span>'; m.appendChild(b);
    U.ocupado(b, true, 'Salvando…'); const durante = [b.disabled, b.getAttribute('aria-busy'), b.textContent];
    U.ocupado(b, false); const depois = [b.disabled, b.getAttribute('aria-busy'), b.innerHTML];
    return {
      est, prog, chip: U.chip === U.estado,
      cod: document.querySelector('#cod .pf-codigo__valor').textContent,
      kpis: [...document.querySelectorAll('#kpis .pf-kpi__valor')].map((x) => x.textContent), kpiLink: document.querySelector('#kpis .pf-kpi--link a').getAttribute('href'),
      donut: document.querySelector('#donut svg').getAttribute('aria-label'), arco: document.querySelector('#donut .pf-donut__arco').getAttribute('stroke-dasharray'),
      barras: [...document.querySelectorAll('#barras .pf-barras__barra')].map((x) => x.getAttribute('style')), caption: document.querySelector('#barras caption').textContent,
      esq: [esq.getAttribute('aria-busy'), esq.querySelectorAll('.pf-esqueleto').length, esq.textContent.trim()],
      vazio: [vazio.className, vazio.querySelector('.pf-vazio__titulo').textContent, vazio.querySelector('a').getAttribute('href')],
      alerta: [al.className, al.getAttribute('role')], durante, depois
    };
  });
  expect(r.est).toMatch(/^<span class="pf-estado pf-estado--erro pf-estado--destaque"><svg class="pf-estado__glifo"[^>]*aria-hidden="true"/);
  expect(r.est).toMatch(/Em atraso<\/span>$/);
  expect(r.prog).toBe('<div class="pf-progresso"><span class="pf-progresso__barra" role="progressbar" aria-valuenow="38" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso do curso" style="--pf-pct: 0.38"></span><span class="pf-progresso__texto">38%</span></div>');
  expect(r).toMatchObject({ chip: true, cod: 'a3f9c2e1b4d5…', kpis: ['7,5', '—', 'R$ 1,00'], kpiLink: 'financeiro.html', donut: '90% de acerto', arco: '90 100', barras: ['--pf-pct: 1', '--pf-pct: 0.5'], caption: 'Alunos por curso' });
  expect(r.esq).toEqual(['true', 5, 'Carregando…']);
  expect(r.vazio).toEqual(['pf-vazio', 'Nenhum lançamento registrado.', 'atendimentos.html']);
  expect(r.alerta).toEqual(['pf-alerta pf-alerta--sucesso', 'status']);
  expect(r.durante).toEqual([true, 'true', 'Salvando…']);
  expect(r.depois).toEqual([false, null, '<span>Salvar</span>']);
  // [Copiar] copia o valor INTEIRO e anuncia
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('#cod .pf-codigo__copiar').click();
  await expect(page.locator('#cod .pf-codigo')).toHaveClass(/is-copiado/);
  await expect(page.locator('#cod .pf-codigo__copiar')).toHaveText('Copiado');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('a3f9c2e1b4d5f6a7b8c9d0e1');
});

test('S3 · tabela (caption, th[scope], ordenação com aria-sort, linha clicável por botão, seleção, "Carregar mais", vazio), abas (setas, Home/End, hash) e filtros (aria-pressed; select < 30em com mais de 4)', { tag: ['@F0b'] }, async ({ page, request }) => {
  await abrirPaginaUi(page, request);
  await page.evaluate(() => {
    const U = window.DMC_UI;
    const m = document.getElementById('conteudo');
    const el = document.createElement('div'); el.id = 'tab'; m.appendChild(el);
    window.__cliques = []; window.__sel = []; window.__mais = 0;
    window.__t = U.tabela(el, {
      legenda: 'Lançamentos', chaveLinha: 'id',
      colunas: [{ chave: 'descricao', rotulo: 'Lançamento', ordenavel: true }, { chave: 'status', rotulo: 'Status', tipo: 'status' },
        { chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data', secundaria: true }, { chave: 'valor', rotulo: 'Valor', tipo: 'moeda', ordenavel: true }],
      linhas: [{ id: 'l1', descricao: 'Parcela 2/10', status: { rotulo: 'Em aberto', tom: 'aviso' }, vencimento: '2026-10-20', valor: 49900 },
        { id: 'l2', descricao: 'Matrícula <script>', status: { rotulo: 'Pago', tom: 'sucesso' }, vencimento: null, valor: 10000 }],
      aoClicarLinha: (l) => window.__cliques.push(l.id),
      selecao: { acoes: [{ rotulo: 'Exportar', aoClicar: (ids) => window.__sel.push(ids) }] },
      paginacao: { mostrando: 2, total: 3, carregarMais: () => { window.__mais++; return Promise.resolve(); } }
    });
  });
  const tab = page.locator('#tab table.pf-tabela');
  await expect(tab.locator('caption')).toHaveText('Lançamentos');
  await expect(tab.locator('thead th[scope="col"]')).toHaveCount(5);
  await expect(tab.locator('tbody th[scope="row"]')).toHaveText(['Parcela 2/10', 'Matrícula <script>']);
  await expect(tab.locator('tbody td[data-rotulo="Valor"]')).toHaveText(['R$ 499,00', 'R$ 100,00']);
  await expect(tab.locator('tbody td[data-rotulo="Vencimento"]').first()).toHaveText('20/10/2026');
  await expect(tab.locator('tbody .pf-estado--aviso')).toHaveText('Em aberto');
  const ordValor = tab.locator('th', { hasText: 'Valor' });
  await expect(ordValor).toHaveAttribute('aria-sort', 'none');
  await ordValor.getByRole('button').click();
  await expect(tab.locator('th', { hasText: 'Valor' })).toHaveAttribute('aria-sort', 'ascending');
  await expect(tab.locator('tbody th[scope="row"]')).toHaveText(['Matrícula <script>', 'Parcela 2/10']);
  await tab.locator('tbody').getByRole('button', { name: 'Parcela 2/10' }).click();
  expect(await page.evaluate(() => window.__cliques)).toEqual(['l1']);
  await page.locator('#tab').getByLabel('Selecionar todas').check();
  await page.locator('#tab').getByRole('button', { name: 'Exportar' }).click();
  expect(await page.evaluate(() => window.__sel)).toEqual([['l2', 'l1']]);
  await expect(page.locator('#tab .pf-mais')).toContainText('Mostrando 1–2 de 3');
  await page.locator('#tab').getByRole('button', { name: 'Carregar mais' }).click();
  expect(await page.evaluate(() => window.__mais)).toBe(1);
  await page.evaluate(() => window.__t.atualizar([], null));
  await expect(page.locator('#tab .pf-vazio')).toBeVisible();

  // Abas
  await page.evaluate(() => {
    const el = document.createElement('div'); el.id = 'abas'; document.getElementById('conteudo').appendChild(el);
    el.innerHTML = '<section data-pf-painel="atual"><p>Atual</p></section><section data-pf-painel="historico"><p>Histórico</p></section>';
    window.__trocas = [];
    window.__a = window.DMC_UI.abas(el, { rotulo: 'Seções', abas: [{ id: 'atual', rotulo: 'Enturmação atual' }, { id: 'historico', rotulo: 'Histórico', contador: 2 }, { id: 'extra', rotulo: 'Extra' }], ativa: 'atual', hash: true, aoTrocar: (id) => window.__trocas.push(id) });
  });
  const lista = page.getByRole('tablist', { name: 'Seções' });
  await expect(lista.getByRole('tab')).toHaveText(['Enturmação atual', 'Histórico (2)', 'Extra']);
  await expect(lista.getByRole('tab', { name: 'Enturmação atual' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Enturmação atual' })).toHaveText('Atual');
  await lista.getByRole('tab', { name: 'Enturmação atual' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(lista.getByRole('tab', { name: /Histórico/ })).toBeFocused();
  await expect(lista.getByRole('tab', { name: /Histórico/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-pf-painel="atual"]')).toBeHidden();
  expect(new URL(page.url()).hash).toBe('#historico');
  await page.keyboard.press('End');
  await expect(lista.getByRole('tab', { name: 'Extra' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(lista.getByRole('tab', { name: 'Enturmação atual' })).toBeFocused();
  expect(await page.evaluate(() => window.__trocas)).toEqual(['historico', 'extra', 'atual']);
  await expect(lista.getByRole('tab', { name: 'Extra' })).toHaveAttribute('tabindex', '-1');

  // Filtros
  await page.evaluate(() => {
    const el = document.createElement('div'); el.id = 'filtros'; document.getElementById('conteudo').appendChild(el);
    window.__f = [];
    window.__fil = window.DMC_UI.filtros(el, { rotulo: 'Filtrar lançamentos', valor: 'todos', aoMudar: (v) => window.__f.push(v),
      opcoes: [{ valor: 'todos', rotulo: 'Todos', contador: 12 }, { valor: 'aberto', rotulo: 'Em aberto' }, { valor: 'atraso', rotulo: 'Em atraso' }, { valor: 'pagos', rotulo: 'Pagos' }, { valor: 'cancelados', rotulo: 'Cancelados' }] });
  });
  const grupo = page.getByRole('group', { name: 'Filtrar lançamentos' });
  await expect(grupo.getByRole('button', { name: 'Todos (12)' })).toHaveAttribute('aria-pressed', 'true');
  await grupo.getByRole('button', { name: 'Em atraso' }).click();
  await expect(grupo.getByRole('button', { name: 'Em atraso' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__f)).toEqual(['atraso']);
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator('#filtros select')).toHaveValue('atraso');
  await page.locator('#filtros').getByLabel('Mostrar').selectOption('pagos');
  expect(await page.evaluate(() => window.__f)).toEqual(['atraso', 'pagos']);
});

test('S3 · fmt, valida e mascara (pt-BR, America/Sao_Paulo; mesmo algoritmo de CPF e CEP do servidor)', { tag: ['@F0b'] }, async ({ page }) => {
  await preferenciasS1(page, { 'dmc:token': null });
  await servirS1(page, '__qa-s3-fmt.html', paginaS3({ corpo: '<main id="conteudo"><input id="cpf"><input id="tel"><input id="cep"><input id="data"><input id="moeda"></main>' }));
  await page.goto('/plataforma-ead/__qa-s3-fmt.html');
  const r = await page.evaluate(() => {
    const { fmt, valida } = window.DMC_UI;
    const agora = new Date('2026-10-18T15:00:00.000Z');
    return {
      data: [fmt.data('2026-10-18T02:30:00.000Z'), fmt.data('2026-10-18'), fmt.data('2026-10-18', 'longa'), fmt.data(null), fmt.data('x')],
      dataHora: fmt.dataHora('2026-10-18T21:14:00.000Z'), hora: fmt.hora('2026-10-18T21:14:00.000Z'),
      relativo: [fmt.relativo('2026-10-18T14:59:30.000Z', agora), fmt.relativo('2026-10-18T14:55:00.000Z', agora), fmt.relativo('2026-10-17T15:00:00.000Z', agora), fmt.relativo('2026-10-14T15:00:00.000Z', agora), fmt.relativo('2026-10-18T15:30:00.000Z', agora)],
      moeda: [fmt.moeda(123450), fmt.moeda(0), fmt.moeda(null)], reais: fmt.reais(1544.5),
      cpf: [fmt.cpf('52998224725'), fmt.cpfMascarado('529.982.247-25')], cep: fmt.cep('01310100'), tel: [fmt.telefone('11987654321'), fmt.telefone('1134567890')],
      bytes: [fmt.bytes(512), fmt.bytes(12 * 1024), fmt.bytes(1.2 * 1024 * 1024), fmt.bytes(4 * 1024 * 1024)],
      numero: [fmt.numero(1234.5, 1), fmt.pct(92), fmt.pct(37.56, 1), fmt.nota(7.5), fmt.nota(7), fmt.nota(null)],
      duracao: [fmt.duracao(45), fmt.duracao(60), fmt.duracao(90)], horas: [fmt.horas(42), fmt.horas(1.5)],
      valida: [valida.cpf('529.982.247-25'), valida.cpf('52998224724'), valida.cpf('11111111111'), valida.cpf('5299822472a'),
        valida.email('qa@exemplo.invalid'), valida.email('qa@exemplo'), valida.cep('01310-100'), valida.cep('00000000'), valida.cep('1310-100')]
    };
  });
  expect(r).toEqual({
    data: ['17/10/2026', '18/10/2026', '18 de outubro de 2026', '—', '—'],
    dataHora: '18/10/2026 às 18:14', hora: '18:14',
    relativo: ['agora há pouco', 'há 5 min', 'ontem', 'há 4 dias', 'em 30 min'],
    moeda: ['R$ 1.234,50', 'R$ 0,00', '—'], reais: 'R$ 1.544,50',
    cpf: ['529.982.247-25', '***.982.247-**'], cep: '01310-100', tel: ['(11) 98765-4321', '(11) 3456-7890'],
    bytes: ['512 B', '12 KB', '1,2 MB', '4 MB'],
    numero: ['1.234,5', '92%', '37,6%', '7,5', '7,0', '—'],
    duracao: ['45 min', '1 h', '1 h 30 min'], horas: ['42 h', '1,5 h'],
    valida: [true, false, false, false, true, false, true, false, false]
  });
  await page.evaluate(() => { for (const [id, tipo] of [['cpf', 'cpf'], ['tel', 'telefone'], ['cep', 'cep'], ['data', 'data'], ['moeda', 'moeda']]) window.DMC_UI.mascara(document.getElementById(id), tipo); });
  await page.locator('#cpf').pressSequentially('529982247259');
  await page.locator('#tel').fill('(11) 98765-4321 ramal');
  await page.locator('#cep').pressSequentially('01310100');
  await page.locator('#data').pressSequentially('18102026');
  await page.locator('#moeda').pressSequentially('123450');
  expect(await page.evaluate(() => ['cpf', 'tel', 'cep', 'data', 'moeda'].map((id) => document.getElementById(id).value))).toEqual(['529.982.247-25', '(11) 98765-4321', '01310-100', '18/10/2026', '1.234,50']);
  await expect(page.locator('#cpf')).toHaveAttribute('inputmode', 'numeric');
});

// ---------------------------------------------------------------------------
// index.html (boot-index.js) e DMC_bootLogin (login-classico.html)
// ---------------------------------------------------------------------------
test('S3 · index.html sem <script> inline nem on*=; boot-index.js: sem token → login com next; senha temporária → perfil; sessão → destino', { tag: ['@F0b'] }, async ({ page, request }) => {
  const index = fs.readFileSync(path.join(P.EAD_DISCO, 'index.html'), 'utf8');
  expect(index).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
  expect(index).not.toMatch(/\son[a-z]+\s*=/i);
  expect(index).not.toMatch(/\sstyle\s*=/i);
  expect(index).toContain('<script src="js/portal/boot-index.js?v=dev"></script>');
  await stubsS1(page, ['login.html', 'perfil.html', 'dashboard.html', 'professor.html', 'admin.html', 'meus-cursos.html']);
  await preferenciasS1(page, { 'dmc:token': null });
  await page.goto('/plataforma-ead/index.html?next=meus-cursos.html');
  await page.waitForURL(/\/plataforma-ead\/login\.html\?next=meus-cursos\.html$/);
  const tirarMe = await meSimulado(page, USER_RESTRITO);
  await preferenciasS1(page, { 'dmc:token': 'tok-qa-restrito' });
  await page.goto('/plataforma-ead/index.html?next=meus-cursos.html');
  await page.waitForURL(/\/plataforma-ead\/perfil\.html#seguranca$/);
  await tirarMe();
  const prof = await P.criarUsuario(request, { papel: 'professor' });
  await P.entrarComToken(page, prof.token);
  await page.goto('/plataforma-ead/index.html');
  await page.waitForURL(/\/plataforma-ead\/professor\.html$/);
  await P.entrarComToken(page, 'token-qa-expirado');
  await page.goto('/plataforma-ead/index.html');
  await page.waitForURL(/\/plataforma-ead\/login\.html$/);
});

test('S3 · DMC_bootLogin: 2FA desvia para login.html?next= com dmc:aviso e sem token; senha temporária vai ao perfil', { tag: ['@F0b'] }, async ({ page }) => {
  await stubsS1(page, ['login.html', 'perfil.html', 'dashboard.html']);
  await P.simularCliente(page);
  await page.route((u) => u.pathname === '/api/auth/signin', (r) => r.fulfill(json(200, { segundoFator: true, desafio: 'd-qa', expiraEm: '2026-10-18T12:05:00.000Z', metodos: ['totp'] })));
  await preferenciasS1(page, { 'dmc:token': null });
  await page.goto('/plataforma-ead/login-classico.html?next=meus-cursos.html');
  await page.locator('#email').fill('52998224725');
  await page.locator('#senha').fill('senha-qa-1');
  await page.locator('#acesso-cta').click();
  await page.waitForURL(/\/plataforma-ead\/login\.html\?next=meus-cursos\.html$/, { timeout: 30_000 });
  expect(await lerSessao(page)).toEqual({ 'dmc:aviso': 'Esta conta usa verificação em duas etapas. Continue pelo login principal.' });
  expect(await page.evaluate(() => localStorage.getItem('dmc:token'))).toBeNull();
  await meSimulado(page, USER_RESTRITO);
  await preferenciasS1(page, { 'dmc:token': 'tok-qa-restrito' });
  await page.goto('/plataforma-ead/login-classico.html?next=meus-cursos.html');
  await page.waitForURL(/\/plataforma-ead\/perfil\.html#seguranca$/, { timeout: 30_000 });
});

// ---------------------------------------------------------------------------
// Loja e obrigado (D-69) e pedido da loja (D-79) — page.route no lugar da F5/F6a
// ---------------------------------------------------------------------------
test('S3 · D-69: markup de DMC_bootLoja/DMC_bootObrigado sem data-tilt, loja-card__shine, style= nem .style.* de cor; app.js sem on*= inline', { tag: ['@F0b'] }, async ({ page, request }) => {
  const app = APP_JS_S3();
  for (const nome of ['bootLoja', 'bootObrigado']) {
    const t = trechoDe(app, nome);
    expect(t, nome).not.toMatch(/data-tilt|loja-card__shine|attachTilt|\.style\.(color|background|backgroundColor|borderColor|border)\b|style="/);
  }
  expect(app).not.toMatch(/\son[a-z]+="/i);
  expect(app).toContain('loja-card__vazio');
  // Na tela: curso sem benefícios usa a classe; nenhum atributo style com cor no grid
  const aluno = await P.criarUsuario(request, { papel: 'aluno' });
  const C = await P.semearCurso(request, { preco: 0 });
  const mon = P.monitorarConsoleERede(page, { fatia: 'F0b' });
  await P.entrarComToken(page, aluno.token, { 'dmc:carrinho': '[]' });
  await page.goto('/plataforma-ead/loja.html');
  const card = page.locator(`#loja-grid [data-curso-id="${C.cursoId}"]`);
  await expect(card).toHaveClass(/loja-card/);
  await expect(card.locator('.loja-card__vazio')).toHaveText('Sem benefícios cadastrados');
  await expect(card.locator('.loja-card__price-value')).toHaveText('Valor a confirmar'); // nunca R$ 0,00
  await expect(page.locator('#loja-grid [data-tilt], #loja-grid .loja-card__shine')).toHaveCount(0);
  expect(await page.locator('#loja-grid [style]').evaluateAll((els) => els.map((e) => e.getAttribute('style')).filter((s) => /color|background|border/i.test(s)))).toEqual([]);
  await mon.verificar({ tipos: ['pageerror', 'resposta'] });
});

async function lojaComCarrinho(page, request, n = 2) {
  const aluno = await P.criarUsuario(request, { papel: 'aluno' });
  const cursos = await Promise.all(Array.from({ length: n }, (_, i) => P.semearCurso(request, { preco: [1234.5, 310, 99][i] })));
  await P.entrarComToken(page, aluno.token, { 'dmc:carrinho': JSON.stringify(cursos.map((c) => c.cursoId)) });
  await page.goto('/plataforma-ead/loja.html');
  await page.locator('[data-cart-count]').first().click();
  await expect(page.locator('#cart-drawer')).toBeVisible();
  return { aluno, cursos };
}
const carrinhoDe = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('dmc:carrinho') || '[]'));
const PROTOCOLO_QA = 'ATD-2026-K7M2QX';

test('S3 · D-79 checkout 201: envia só cursoIds; esvazia o carrinho; obrigado.html?protocolo= mostra itens e total do ATENDIMENTO (nunca da query); reaproveitado → &existente=1', { tag: ['@F0b'] }, async ({ page, request }) => {
  const enviados = [];
  let reaproveitado = false;
  await page.route((u) => u.pathname === '/api/portal/me/pedidos', (r) => {
    enviados.push({ metodo: r.request().method(), corpo: JSON.parse(r.request().postData() || 'null') });
    return r.fulfill(json(reaproveitado ? 200 : 201, { protocolo: PROTOCOLO_QA, pedido: { itens: [], totalCentavos: 1 }, reaproveitado }));
  });
  const leituras = [];
  await page.route((u) => u.pathname === `/api/portal/me/atendimentos/${PROTOCOLO_QA}`, (r) => {
    leituras.push(r.request().url());
    return r.fulfill(json(200, { protocolo: PROTOCOLO_QA, categoria: 'financeiro', status: 'aberto', pedido: { cursoIds: ['x1', 'x2'], itens: [{ cursoId: 'x1', titulo: 'Curso registrado no servidor', valorCentavos: 12345 }, { cursoId: 'x2', titulo: 'Curso sem preço', valorCentavos: null }], totalCentavos: null } }));
  });
  const { aluno, cursos } = await lojaComCarrinho(page, request);
  const botao = page.locator('#cart-checkout [type="submit"]');
  await botao.click();
  await page.waitForURL(new RegExp(`/plataforma-ead/obrigado\\.html\\?protocolo=${PROTOCOLO_QA}$`));
  expect(enviados).toEqual([{ metodo: 'POST', corpo: { cursoIds: cursos.map((c) => c.cursoId) } }]);
  expect(await carrinhoDe(page)).toEqual([]);
  await expect(page.locator('#obrigado-list')).toContainText('Curso registrado no servidor');
  await expect(page.locator('#obrigado-list')).toContainText('R$ 123,45');
  await expect(page.locator('#obrigado-list')).toContainText('Valor a confirmar');
  await expect(page.locator('[data-obrigado-total]')).toHaveText('A confirmar pela coordenação');
  await expect(page.locator('[data-obrigado-email]')).toHaveText(aluno.email);
  expect(leituras).toHaveLength(1);
  // Query forjada não muda nada: valores sempre do atendimento
  await page.goto(`/plataforma-ead/obrigado.html?protocolo=${PROTOCOLO_QA}&total=0.01&cursos=forjado`);
  await expect(page.locator('#obrigado-list')).toContainText('Curso registrado no servidor');
  await expect(page.locator('#obrigado-list')).not.toContainText('forjado');
  // reaproveitado → &existente=1
  reaproveitado = true;
  await page.evaluate((ids) => localStorage.setItem('dmc:carrinho', JSON.stringify(ids)), cursos.map((c) => c.cursoId));
  await page.goto('/plataforma-ead/loja.html');
  await page.locator('[data-cart-count]').first().click();
  await page.locator('#cart-checkout [type="submit"]').click();
  await page.waitForURL(new RegExp(`/plataforma-ead/obrigado\\.html\\?protocolo=${PROTOCOLO_QA}&existente=1$`));
  // Protocolo de outra conta (404): "Não encontramos este pedido." + atendimentos
  await page.route((u) => u.pathname === `/api/portal/me/atendimentos/${PROTOCOLO_QA}`, (r) => r.fulfill(json(404, { error: 'Não encontrado.' })));
  await page.goto(`/plataforma-ead/obrigado.html?protocolo=${PROTOCOLO_QA}`);
  await expect(page.locator('#obrigado-list .pf-vazio__titulo')).toHaveText('Não encontramos este pedido.');
  await expect(page.locator('#obrigado-list a[href="atendimentos.html"]')).toBeVisible();
});

test('S3 · D-79 checkout 409 ja-liberado e 400 campos.cursoIds tiram os cursos do carrinho com aviso; 429/503/rede mantêm o carrinho sem navegar', { tag: ['@F0b'] }, async ({ page, request }) => {
  let resposta = null;
  await page.route((u) => u.pathname === '/api/portal/me/pedidos', (r) => (resposta === 'rede' ? r.abort('failed') : r.fulfill(resposta)));
  const { cursos } = await lojaComCarrinho(page, request, 3);
  const [C1, C2, C3] = cursos;
  const enviar = () => page.locator('#cart-checkout [type="submit"]').click();
  const alerta = page.locator('#cart-alerta');

  resposta = json(409, { error: 'Você já tem acesso a um dos cursos.', codigo: 'ja-liberado', cursoIds: [C1.cursoId] });
  await enviar();
  await expect(alerta).toHaveClass(/pf-alerta--info/);
  await expect(alerta).toContainText(`Você já tem acesso a ${C1.titulo}. Ele saiu do pedido.`);
  expect(await carrinhoDe(page)).toEqual([C2.cursoId, C3.cursoId]);
  expect(new URL(page.url()).pathname).toBe('/plataforma-ead/loja.html');

  resposta = json(400, { error: 'Confira os campos destacados.', codigo: 'validacao', campos: { cursoIds: 'Curso fora de venda.' }, cursoIds: [C2.cursoId] });
  await enviar();
  await expect(alerta).toHaveClass(/pf-alerta--aviso/);
  await expect(alerta).toContainText(`${C2.titulo} não está mais disponível e saiu do pedido.`);
  expect(await carrinhoDe(page)).toEqual([C3.cursoId]);

  for (const [status, msg] of [[429, 'Você fez muitos pedidos nesta hora. Tente de novo mais tarde.'], [503, 'Serviço indisponível no momento.']]) {
    resposta = json(status, { error: msg, codigo: status === 429 ? 'muitas-tentativas' : 'servico-indisponivel' });
    await enviar();
    await expect(alerta).toHaveClass(/pf-alerta--erro/);
    await expect(alerta).toContainText(msg);
    expect(await carrinhoDe(page)).toEqual([C3.cursoId]);
    expect(new URL(page.url()).pathname).toBe('/plataforma-ead/loja.html');
    await expect(page.locator('#cart-checkout [type="submit"]')).toBeEnabled();
  }
  resposta = 'rede';
  await enviar();
  await expect(alerta).toContainText('Não foi possível registrar o pedido agora. Seu carrinho foi mantido. Tente de novo em alguns minutos.');
  await expect(alerta.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  expect(await carrinhoDe(page)).toEqual([C3.cursoId]);
  // [Tentar de novo] reenvia (agora com sucesso → obrigado)
  resposta = json(201, { protocolo: PROTOCOLO_QA, pedido: { itens: [], totalCentavos: null }, reaproveitado: false });
  await page.route((u) => u.pathname === `/api/portal/me/atendimentos/${PROTOCOLO_QA}`, (r) => r.fulfill(json(200, { protocolo: PROTOCOLO_QA, pedido: { cursoIds: [C3.cursoId], itens: [{ cursoId: C3.cursoId, titulo: C3.titulo, valorCentavos: 9900 }], totalCentavos: 9900 } })));
  await alerta.getByRole('button', { name: 'Tentar de novo' }).click();
  await page.waitForURL(/\/plataforma-ead\/obrigado\.html\?protocolo=/);
  await expect(page.locator('[data-obrigado-total]')).toHaveText('R$ 99,00');
});

test('S3 · D-79 checkout 404 (F5 ausente): caminho legado; obrigado sem protocolo mostra #obrigado-sem-pedido, a lista da query e esvazia o carrinho', { tag: ['@F0b'] }, async ({ page, request }) => {
  await page.route((u) => u.pathname === '/api/portal/me/pedidos', (r) => r.fulfill(json(404, { error: 'Rota não encontrada.' })));
  // obrigado.html com o markup fixo da F0r (§7.10): a seção nasce com hidden e a F0b a mostra.
  const OBRIGADO_F0R = paginaS3({ scripts: ['js/shell.js'], shell: 'loja', corpo: `<main id="conteudo" class="obrigado-shell"><h1>Pedido</h1>
    <section id="obrigado-sem-pedido" hidden><p>Seu pedido ainda não foi registrado. Para concluir, fale com a equipe pelo Atendimento.</p><a href="atendimentos.html?novo=1&amp;categoria=financeiro">Falar com a equipe</a></section>
    <div id="obrigado-list"></div><strong data-obrigado-total>—</strong><strong data-obrigado-email>—</strong>
    <div id="dev-pay-box" hidden><button id="btn-dev-pay" type="button">Simular pagamento aprovado</button><p id="dev-pay-status" hidden></p></div></main>`, fim: '<script>DMC_bootObrigado();</script>' });
  await servirS1(page, 'obrigado.html', OBRIGADO_F0R);
  const { cursos } = await lojaComCarrinho(page, request);
  await page.locator('#cart-checkout [type="submit"]').click();
  await page.waitForURL(/\/plataforma-ead\/obrigado\.html\?cursos=/);
  const q = new URL(page.url()).searchParams;
  expect(q.get('cursos')).toBe(cursos.map((c) => c.cursoId).join(','));
  await expect(page.locator('#obrigado-sem-pedido')).toBeVisible();
  await expect(page.locator('#obrigado-sem-pedido a')).toHaveAttribute('href', 'atendimentos.html?novo=1&categoria=financeiro');
  for (const c of cursos) await expect(page.locator('#obrigado-list')).toContainText(c.titulo);
  await expect(page.locator('[data-obrigado-total]')).toHaveText('R$ 1.544,50'); // do catálogo, não da query
  expect(await carrinhoDe(page)).toEqual([]);
  // Caixa de desenvolvimento: aparece por hidden=false (localhost); sem a flag do servidor → erro em pf-alerta--erro
  await expect(page.locator('#dev-pay-box')).toBeVisible();
  await page.locator('#btn-dev-pay').click();
  await expect(page.locator('#dev-pay-status')).toHaveClass('pf-alerta pf-alerta--erro');
  await expect(page.locator('#dev-pay-status')).toBeVisible();
  expect(await page.locator('#dev-pay-status').getAttribute('style')).toBeNull();
  // Sem cursos na query: vazio honesto com link comum para a loja
  await page.goto('/plataforma-ead/obrigado.html');
  await expect(page.locator('#obrigado-list .pf-vazio__titulo')).toHaveText('Nenhum curso recebido.');
  await expect(page.locator('#obrigado-list a[href="loja.html"]')).toBeVisible();
  // Protocolo inválido = sem protocolo
  await page.goto('/plataforma-ead/obrigado.html?protocolo=ATD-2026-000123&cursos=' + cursos[0].cursoId);
  await expect(page.locator('#obrigado-sem-pedido')).toBeVisible();
});

// ---------------------------------------------------------------------------
// F0b-final (§7.3, §8.5): boots mortos removidos de app.js, com prova por grep, e os
// cinco nomes antigos como apelidos dos boots novos (js/portal/*.js).
// ---------------------------------------------------------------------------
const APELIDOS_F0B_FINAL = {
  DMC_bootDashboard: 'dashboard.html',
  DMC_bootPlayer: 'aula.html',
  DMC_bootMeusCursos: 'meus-cursos.html',
  DMC_bootAoVivo: 'ao-vivo.html',
  DMC_bootCertificados: 'certificados.html'
};
/** Caminhos (pathname) dos <script src> locais da página real que vêm DEPOIS de js/app.js, na ordem. */
function scriptsDepoisDoApp(pagina) {
  const html = fs.readFileSync(path.join(P.EAD_DISCO, pagina), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const srcs = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"'?#]+)/gi)].map((m) => m[1]);
  const i = srcs.indexOf('js/app.js');
  expect(i, `${pagina} carrega js/app.js`).toBeGreaterThan(-1);
  return srcs.slice(i + 1).map((s) => `/plataforma-ead/${s}`);
}
/** Arquivos da EAD (páginas da raiz e js/**, sem vendor) — a base da prova por grep. */
function arquivosDaEad() {
  const saida = fs.readdirSync(P.EAD_DISCO).filter((n) => n.endsWith('.html'));
  const andar = (rel) => {
    for (const e of fs.readdirSync(path.join(P.EAD_DISCO, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) { if (r !== 'js/vendor') andar(r); } else if (e.name.endsWith('.js')) saida.push(r);
    }
  };
  andar('js');
  return saida.sort();
}

test('F0b-final · prova por grep: app.js sem os boots mortos; nenhuma página nem script chama os cinco nomes antigos; ficam os contratos da 2d e os boots de §7.3', { tag: ['@F0b'] }, async () => {
  const app = APP_JS_S3();
  for (const nome of ['bootDashboard', 'bootPlayer', 'bootMeusCursos', 'bootAoVivo', 'bootCertificados']) {
    expect(app, nome).not.toMatch(new RegExp(`function ${nome}\\s*\\(`));
  }
  expect(app).not.toMatch(/renderDuvidasDaAula|renderMateriaisDaAula|player-aside-list|data-aside-aula|\balert\(|\bconfirm\(|\bprompt\(/);
  for (const nome of ['bootLogin', 'bootLoja', 'bootObrigado', 'bootCertificadoPublico']) expect(app, nome).toMatch(new RegExp(`async function ${nome}\\(`));
  expect(app).toMatch(/function bindHeader\(/);
  for (const g of ['DMC_Auth', 'DMC_init', 'DMC_capaSrc', 'DMC_bootLogin', 'DMC_bootLoja', 'DMC_bootObrigado', 'DMC_bootCertificadoPublico', 'DMC_bindHeader',
    'DMC_Data', 'DMC_Liberacoes', 'DMC_Progress', 'DMC_Carrinho', 'DMC_Helpers', 'DMC_Icons', 'DMC_escapeHtml']) {
    expect(app, g).toContain(`window.${g} = `);
  }
  // Chamada = nome seguido de "(" fora de linha de comentário (falso positivo reprova; nunca o contrário).
  const chamadas = [];
  for (const rel of arquivosDaEad()) {
    if (rel === 'js/app.js') continue;
    const linhas = fs.readFileSync(path.join(P.EAD_DISCO, rel), 'utf8').split('\n');
    linhas.forEach((l, i) => {
      if (/^\s*(?:\/\/|\/?\*)/.test(l)) return;
      for (const m of l.matchAll(/\bDMC_boot(?:Dashboard|Player|MeusCursos|AoVivo|Certificados)\s*\(/g)) chamadas.push(`${rel}:${i + 1}: ${m[0]}`);
    });
  }
  expect(chamadas).toEqual([]);
});

test('F0b-final · apelidos: cada nome antigo carrega, na ordem da página real, os scripts que faltam e roda o boot novo (DMC_Portal.iniciar); duas chamadas = uma carga', { tag: ['@F0b'] }, async ({ page }) => {
  await preferenciasS1(page, { 'dmc:token': null });
  await stubsS1(page, ['login.html']);
  const pedidos = [];
  page.on('request', (q) => { const u = new URL(q.url()); if (q.resourceType() === 'script' && u.pathname.startsWith('/plataforma-ead/js/')) pedidos.push(u.pathname); });
  const mon = P.monitorarConsoleERede(page, { fatia: 'F0b' });
  const PROPRIOS = ['/plataforma-ead/js/portal/pre-pintura.js', '/plataforma-ead/js/api-client.js', '/plataforma-ead/js/app.js'];
  for (const [boot, pagina] of Object.entries(APELIDOS_F0B_FINAL)) {
    const esperados = scriptsDepoisDoApp(pagina);
    expect(esperados.length, `${pagina}: scripts depois de app.js`).toBeGreaterThan(1);
    // Página com SÓ o cliente e app.js (sem ui.js): o apelido carrega a cadeia inteira.
    pedidos.length = 0;
    await servirS1(page, `__qa-f0b-${boot}.html`, htmlS1({ scripts: ['js/api-client.js', 'js/app.js'] }));
    await page.goto(`/plataforma-ead/__qa-f0b-${boot}.html`);
    const mesma = await page.evaluate((b) => { const x = window[b](); const y = window[b](); return typeof x.then === 'function' && x === y; }, boot);
    expect(mesma, `${boot}: duas chamadas devolvem a mesma carga`).toBe(true);
    // Sem sessão, o DMC_Portal.iniciar do boot novo leva ao login com next: prova de que o boot rodou.
    await page.waitForURL(new RegExp(`/plataforma-ead/login\\.html\\?next=__qa-f0b-${boot}\\.html$`));
    expect(pedidos.filter((p) => !PROPRIOS.includes(p)), `${boot} → ${pagina}`).toEqual(esperados);
  }
  // Script que a página já tem não é carregado de novo (mesmo caminho, qualquer ?v=).
  pedidos.length = 0;
  await servirS1(page, '__qa-f0b-ja-carregado.html', paginaS3({ scripts: ['js/shell.js'] }));
  await page.goto('/plataforma-ead/__qa-f0b-ja-carregado.html');
  await page.evaluate(() => { window.DMC_bootAoVivo(); });
  await page.waitForURL(/\/plataforma-ead\/login\.html\?next=__qa-f0b-ja-carregado\.html$/);
  expect(pedidos.filter((p) => p.endsWith('/js/portal/ui.js'))).toHaveLength(1);
  expect(pedidos.filter((p) => p.endsWith('/js/shell.js'))).toHaveLength(1);
  expect(pedidos.filter((p) => p.endsWith('/js/portal/ao-vivo.js'))).toHaveLength(1);
  await mon.verificar();
});
