// =============================================================
// E2E da F5 — financeiro manual (EXCEÇÃO 1: gateway depois) e pedido da loja.
// Spec: PORTAL-ACADEMICO.md §8.5 (linha F5), §8.6, §9.3 (R10), D-18, D-74, D-79;
// PORTAL-API.md §6.9, §8.9–§8.10; PORTAL-UX.md §6.7, §6.19, §7.18.
//
// Roda no serve.mjs (mongod descartável; nunca complexodmc_local). A jornada
// pela API vale sempre; a tela da coordenação depende da hospedeira da F8
// (professor.html + professor.js, P1f) e pula com o motivo quando ela não
// estiver no disco. A matrícula vem da F4a e o protocolo do pedido da F6a.
//
//   QA_PORT=4655 QA_WORKERS=2 QA_DATA=<data>-f5 QA_FATIA=F5 QA_INTEGRADAS=<integradas> \
//   PORTAL_MODULOS=routes/portal/financeiro.js,routes/portal/atendimento.js,routes/portal-turmas.js,routes/portal-professor.js \
//   npx playwright test tests/e2e/portal-financeiro.spec.js
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import * as P from './_portal.js';

const EAD = P.BASE_EAD;
const ATD_RE = /^ATD-\d{4}-[2-9A-HJ-NP-Z]{6}$/;
const HOSPEDEIRA = fs.existsSync(path.join(P.EAD_DISCO, 'professor.html')) && fs.existsSync(path.join(P.EAD_DISCO, 'js', 'portal', 'professor.js'));
const TEXTO_PROIBIDO = /Meus cart[õo]es|Pagar (agora|on-?line)|Pagamento on-?line dispon[ií]vel|Cadastrar cart[ãa]o/i;

test.describe.configure({ mode: 'parallel' });

const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
function somarDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const reais = (centavos) => `R$ ${(centavos / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const normal = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** A F5 está montada? (sem ela, as rotas novas respondem 404) */
async function exigirF5(request, token) {
  const r = await P.api(request, token).get('/api/portal/me/financeiro');
  if (r.status === 404) {
    test.info().annotations.push({ type: 'bloqueado', description: 'routes/portal/financeiro.js não montado (PORTAL_MODULOS sem a F5)' });
    test.skip(true, 'bloqueado: F5 não montada');
  }
  expect(r.status, JSON.stringify(r.json)).toBe(200);
}

/** Matrícula manual pela F4a (sem liberar acesso). */
async function matricular(request, admin, aluno, cursoId) {
  const r = await P.api(request, admin.token).post('/api/portal/admin/matriculas', {
    email: aluno.email, cursoId, liberarAcesso: false, confirmarSemVerificacao: true, motivo: 'Matrícula de teste do financeiro (QA).'
  });
  if (r.status === 404) {
    test.info().annotations.push({ type: 'bloqueado', description: 'routes/portal-turmas.js (F4a) não montado' });
    test.skip(true, 'bloqueado: F4a não montada');
  }
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.matricula;
}

async function fechar(mon) {
  await mon.anexar('console-e-rede');
  await mon.verificar({ tipos: ['pageerror', 'resposta'], rotulo: 'pageerror e respostas' });
}

// ---------------------------------------------------------------
// Jornada pela API (servidor real, banco descartável)
// ---------------------------------------------------------------
test('F5 · API: lançar, lote, pagar, estornar, cancelar; KPIs do aluno; IDOR; quitação do ano em curso', async ({ request }) => {
  await P.exigirMongo(request);
  const { aluno, professor, admin } = await P.criarPapeis(request);
  const outro = await P.criarUsuario(request);
  await exigirF5(request, aluno.token);
  const A = P.api(request, admin.token);
  const U = P.api(request, aluno.token);
  const C = await P.semearCurso(request, { preco: 1990 });
  const m = await matricular(request, admin, aluno, C.cursoId);

  // Estado vazio honesto.
  const vazio = await U.get('/api/portal/me/financeiro');
  expect(vazio.json.itens).toEqual([]);
  expect(vazio.json.kpis.total).toEqual({ valorCentavos: 0, qtd: 0 });

  // Papéis.
  expect((await U.get('/api/portal/admin/financeiro/lancamentos')).status).toBe(403);
  expect((await P.api(request, professor.token).post('/api/portal/admin/financeiro/lancamentos', {})).status).toBe(403);

  const hoje = hojeSP();
  const venc = somarDias(hoje, 2);
  const l = await A.post('/api/portal/admin/financeiro/lancamentos', {
    userId: aluno.id, matriculaId: m.id, tipo: 'matricula', vencimento: venc, valorCentavos: 49900, formaPrevista: 'pix', cartao: '4111111111111111'
  });
  expect(l.status, JSON.stringify(l.json)).toBe(201);
  expect(l.json.lancamento).toMatchObject({ status: 'aberto', venceEmDias: 2, matriculaNumero: m.numero, cursoId: C.cursoId, origem: 'manual' });
  expect(JSON.stringify(l.json)).not.toContain('4111');

  const lote = await A.post('/api/portal/admin/financeiro/lancamentos/lote', {
    userId: aluno.id, matriculaId: m.id, cursoId: C.cursoId, quantidade: 3, primeiroVencimento: somarDias(hoje, -40), valorCentavos: 41500, formaPrevista: 'boleto'
  });
  expect(lote.status, JSON.stringify(lote.json)).toBe(201);
  expect(lote.json.criados).toHaveLength(3);

  // Pagar a 1ª parcela; estornar; pagar de novo.
  const p1 = lote.json.criados[0];
  const pago = await A.post(`/api/portal/admin/financeiro/lancamentos/${p1}/pagamento`, { em: hoje, forma: 'boleto', versao: 1 });
  expect(pago.status, JSON.stringify(pago.json)).toBe(200);
  const dup = await A.post(`/api/portal/admin/financeiro/lancamentos/${p1}/pagamento`, { em: hoje, forma: 'boleto', versao: 2 });
  expect([dup.status, dup.json.codigo]).toEqual([409, 'transicao-invalida']);
  const est = await A.post(`/api/portal/admin/financeiro/lancamentos/${p1}/estorno`, { motivo: 'Boleto devolvido (QA).', versao: 2 });
  expect(est.json.lancamento.status).not.toBe('pago');
  const pago2 = await A.post(`/api/portal/admin/financeiro/lancamentos/${p1}/pagamento`, { em: hoje, forma: 'pix', versao: 3 });
  expect(pago2.json.lancamento.status).toBe('pago');
  // Cancelar a 3ª.
  const p3 = lote.json.criados[2];
  const canc = await A.post(`/api/portal/admin/financeiro/lancamentos/${p3}/cancelar`, { motivo: 'Parcela renegociada (QA).', versao: 1 });
  expect(canc.json.lancamento.status).toBe('cancelado');
  const hist = (await A.get(`/api/portal/admin/financeiro/lancamentos/${p1}`)).json.lancamento.historico.map((h) => h.acao);
  expect(hist).toEqual(['criado', 'pago', 'estornado', 'pago']);

  // 2ª via: http → 400; https → aluno recebe o link.
  expect((await A.put(`/api/portal/admin/financeiro/lancamentos/${l.json.lancamento.id}/segunda-via`, { url: 'http://banco.exemplo/b' })).status).toBe(400);
  expect((await A.put(`/api/portal/admin/financeiro/lancamentos/${l.json.lancamento.id}/segunda-via`, { url: 'https://banco.exemplo/boleto/qa' })).status).toBe(200);
  const sv = await U.get(`/api/portal/me/financeiro/lancamentos/${l.json.lancamento.id}/segunda-via`);
  expect(sv.json).toEqual({ url: 'https://banco.exemplo/boleto/qa' });

  // KPIs do aluno (centavos): aberto 49900 · pago 41500 · atraso = 2ª parcela (vence hoje-10) · cancelada fora.
  const fin = await U.get('/api/portal/me/financeiro');
  expect(fin.json.kpis.pago).toEqual({ valorCentavos: 41500, qtd: 1 });
  expect(fin.json.kpis.emAberto.valorCentavos + fin.json.kpis.emAtraso.valorCentavos).toBe(49900 + 41500);
  expect(fin.json.kpis.total.valorCentavos).toBe(49900 + 41500 + 41500);
  const chip = await U.get('/api/portal/me/financeiro?status=pago');
  expect(chip.json.kpis).toEqual(fin.json.kpis);
  expect(chip.json.itens).toHaveLength(1);

  // IDOR: outra conta não vê nem baixa.
  const alheio = await P.api(request, outro.token).get('/api/portal/me/financeiro');
  expect(alheio.json.itens).toEqual([]);
  expect((await P.api(request, outro.token).get(`/api/portal/me/financeiro/lancamentos/${l.json.lancamento.id}/segunda-via`)).status).toBe(404);

  // Quitação do ano em curso → 409.
  const q = await U.post(`/api/portal/me/financeiro/declaracoes/${hoje.slice(0, 4)}`, {});
  expect([q.status, q.json.codigo]).toEqual([409, 'ano-em-curso']);
});

// ---------------------------------------------------------------
// Tela do aluno (financeiro.html)
// ---------------------------------------------------------------
test('F5 · financeiro.html: vazio honesto; KPIs, chips na URL, 2ª via, impressão; nada de "Meus cartões"', async ({ page, request }) => {
  await P.exigirMongo(request);
  const aluno = await P.criarUsuario(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  await exigirF5(request, aluno.token);
  const C = await P.semearCurso(request, { titulo: `Curso QA Financeiro ${Date.now().toString(36)}` });
  const mon = P.monitorarConsoleERede(page);
  await P.simularCliente(page);
  await P.entrarComToken(page, aluno.token);

  await page.goto(`${EAD}financeiro.html`);
  await expect(page.getByRole('heading', { level: 1, name: 'Financeiro' })).toBeVisible();
  await expect(page.getByText('Nenhum lançamento registrado na sua conta.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir atendimento', exact: true })).toHaveAttribute('href', 'atendimentos.html?novo=1&categoria=financeiro');
  await expect(page.getByText(/O pagamento on-line ainda não está disponível no portal/)).toBeVisible();
  await expect(page.locator('.pf-kpis')).toHaveCount(0);
  expect(await page.locator('main').textContent()).not.toMatch(TEXTO_PROIBIDO);

  // Lançamentos reais pela coordenação.
  const m = await matricular(request, admin, aluno, C.cursoId);
  const A = P.api(request, admin.token);
  const hoje = hojeSP();
  const mk = async (corpo) => {
    const r = await A.post('/api/portal/admin/financeiro/lancamentos', { userId: aluno.id, matriculaId: m.id, ...corpo });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    return r.json.lancamento;
  };
  const aberto = await mk({ tipo: 'matricula', vencimento: somarDias(hoje, 1), valorCentavos: 49900, formaPrevista: 'pix' });
  await mk({ tipo: 'parcela', parcela: { n: 1, de: 2 }, vencimento: somarDias(hoje, -5), valorCentavos: 25000 });
  await A.put(`/api/portal/admin/financeiro/lancamentos/${aberto.id}/segunda-via`, { url: 'https://banco.exemplo/boleto/qa-tela' });

  await page.reload();
  const kpis = page.locator('#fin-resumo .pf-kpi');
  await expect(kpis).toHaveCount(4);
  await expect(kpis.nth(0)).toContainText(reais(74900));
  await expect(kpis.nth(3)).toContainText(reais(25000));
  await expect(kpis.nth(3)).toHaveAttribute('data-tom', 'erro');
  const linhaAberta = page.locator(`[data-pf-fin-linha="${aberto.id}"]`);
  await expect(linhaAberta).toContainText('Vence em 1 dia');
  await expect(linhaAberta).toContainText(m.numero);
  const link = linhaAberta.getByRole('link', { name: /2ª via/ });
  await expect(link).toHaveAttribute('href', 'https://banco.exemplo/boleto/qa-tela');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('[data-pf-fin-linha]')).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath('financeiro-aluno-com-dados.png'), fullPage: true });

  // Chip "Em atraso": URL ?status=atrasado; KPIs iguais; 1 linha.
  const totalAntes = normal(await kpis.nth(0).textContent());
  await page.getByRole('button', { name: /Em atraso/ }).click();
  await expect(page).toHaveURL(/financeiro\.html\?status=atrasado$/);
  await expect(page.locator('[data-pf-fin-linha]')).toHaveCount(1);
  await expect(page.locator('[data-pf-fin-linha]').first()).toContainText('Em atraso');
  await expect(page.locator('[data-pf-fin-linha]').first()).toContainText('Pedir 2ª via');
  expect(normal(await kpis.nth(0).textContent())).toBe(totalAntes);

  // Atalhos (sem cards) e impressão.
  await expect(page.getByRole('link', { name: 'Seus atendimentos' })).toHaveAttribute('href', 'atendimentos.html?categoria=financeiro');
  await expect(page.getByRole('link', { name: 'Declaração anual de quitação' })).toHaveAttribute('href', 'certificados.html?tipo=quitacao#solicitar');
  await expect(page.getByRole('button', { name: 'Imprimir' })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#fin-filtro .pf-segmento')).toBeHidden();
  await expect(page.locator('#fin-impressao')).toBeVisible();
  await expect(page.locator('#fin-impressao')).toContainText('Filtro: Em atraso');
  await expect(page.locator('.pf-fin-tabela')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  expect(await page.locator('main').textContent()).not.toMatch(TEXTO_PROIBIDO);

  await fechar(mon);
});

// ---------------------------------------------------------------
// Loja → obrigado (pedido registrado como atendimento financeiro)
// ---------------------------------------------------------------
test('F5 · loja → obrigado: protocolo e valores do servidor; carrinho vazio; pedido na fila da coordenação', async ({ page, request }) => {
  await P.exigirMongo(request);
  const aluno = await P.criarUsuario(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  await exigirF5(request, aluno.token);
  const C = await P.semearCurso(request, { preco: 1990, titulo: `Curso QA Pedido ${Date.now().toString(36)}` });
  const mon = P.monitorarConsoleERede(page);
  await P.simularCliente(page);
  await P.entrarComToken(page, aluno.token, { 'dmc:carrinho': '[]' });

  await page.goto(`${EAD}loja.html`);
  await page.locator(`[data-curso-id="${C.cursoId}"]`).first().getByRole('button').first().click();
  const carrinho = () => page.evaluate(() => JSON.parse(localStorage.getItem('dmc:carrinho') || '[]'));
  await expect.poll(carrinho).toEqual([C.cursoId]);
  await page.locator('[data-cart-count]').first().click();
  await expect(page.locator('#cart-drawer')).toBeVisible();
  await page.locator('#cart-checkout [type="submit"]').first().click();
  await expect(page).toHaveURL(/obrigado\.html\?protocolo=ATD-/);
  const protocolo = new URL(page.url()).searchParams.get('protocolo');
  expect(protocolo).toMatch(ATD_RE);
  await expect.poll(carrinho).toEqual([]);
  await expect(page.locator('#obrigado-list')).toContainText(C.titulo);
  await expect(page.locator('[data-obrigado-total]')).toHaveText(/1\.990,00/);

  // O pedido chega à fila da coordenação (?pedido=1), com itens e total do catálogo.
  const fila = await P.api(request, admin.token).get('/api/portal/professor/atendimentos?categoria=financeiro&pedido=1');
  expect(fila.status, JSON.stringify(fila.json)).toBe(200);
  const lista = fila.json.itens || [];
  const item = lista.find((x) => x.protocolo === protocolo);
  expect(item, `protocolo ${protocolo} na fila`).toBeTruthy();
  const det = await P.api(request, aluno.token).get(`/api/portal/me/atendimentos/${protocolo}`);
  const pedido = det.json.pedido || (det.json.atendimento && det.json.atendimento.pedido);
  expect(pedido).toMatchObject({ totalCentavos: 199000, itens: [{ cursoId: C.cursoId, valorCentavos: 199000 }] });
  // Nada liberado nem lançado automaticamente.
  expect((await P.api(request, aluno.token).get('/api/liberacoes/me')).json.cursoIds).not.toContain(C.cursoId);
  expect((await P.api(request, aluno.token).get('/api/portal/me/financeiro')).json.itens).toEqual([]);

  await fechar(mon);
});

// ---------------------------------------------------------------
// Tela da coordenação (professor.html, hospedeira da F8)
// ---------------------------------------------------------------
test('F5 · coordenação #/financeiro: Lançar pela busca da matrícula, detalhe, Baixar pagamento', async ({ page, request }) => {
  test.skip(!HOSPEDEIRA, 'bloqueado: professor.html/professor.js (F8, P1f) ausentes');
  await P.exigirMongo(request);
  const aluno = await P.criarUsuario(request, { nome: `Aluna QA Financeiro ${Date.now().toString(36)}` });
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  await exigirF5(request, aluno.token);
  const C = await P.semearCurso(request, { titulo: `Curso QA Coordenação ${Date.now().toString(36)}` });
  const m = await matricular(request, admin, aluno, C.cursoId);
  const mon = P.monitorarConsoleERede(page);
  await P.simularCliente(page);
  await P.entrarComToken(page, admin.token);

  await page.goto(`${EAD}professor.html#/financeiro`);
  await expect(page.getByRole('heading', { level: 1, name: 'Financeiro' })).toBeVisible();
  await expect(page.getByText(/Boleto, Pix e NFS-e automáticos entram quando o gateway for contratado/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pedidos da loja' })).toHaveAttribute('href', /#\/atendimento\?categoria=financeiro&pedido=1/);

  await page.getByRole('button', { name: 'Lançar' }).click();
  let dlg = page.getByRole('dialog');
  await dlg.getByLabel('Aluno ou nº da matrícula').fill(aluno.email);
  await dlg.getByRole('button', { name: 'Buscar matrículas' }).click();
  dlg = page.getByRole('dialog');
  await expect(dlg.getByLabel('Matrícula')).toHaveValue(m.id);
  await dlg.getByLabel('Valor (R$)').fill('1.234,50');
  await dlg.getByLabel(/^Vencimento/).fill(somarDias(hojeSP(), 10));
  await dlg.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/#\/financeiro\/[a-f0-9]{24}$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Matrícula');
  await expect(page.locator('.pf-fin-dl')).toContainText(reais(123450));
  await expect(page.locator('.pf-fin-dl')).toContainText(m.numero);

  await page.getByRole('button', { name: 'Baixar pagamento' }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel('Forma').selectOption('pix');
  await dlg.getByRole('button', { name: 'Registrar pagamento' }).click();
  await expect(page.locator('.pf-fin-dl')).toContainText(/Pago em/);
  await expect(page.getByRole('button', { name: 'Estornar pagamento' })).toBeVisible();
  await expect(page.locator('.pf-fin-historico')).toContainText('Pagamento registrado');
  await page.screenshot({ path: test.info().outputPath('financeiro-coordenacao-detalhe.png'), fullPage: true });
  await page.goto(`${EAD}professor.html#/financeiro?de=&ate=`);
  await expect(page.locator('[data-pf-fin-linha]').first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('financeiro-coordenacao-lista.png'), fullPage: true });

  // O aluno vê o pagamento.
  const fin = await P.api(request, aluno.token).get('/api/portal/me/financeiro?status=pago');
  expect(fin.json.itens.map((i) => i.valorPagoCentavos)).toEqual([123450]);

  // Aba Financeiro na moldura do aluno (D-65).
  await page.goto(`${EAD}professor.html#/alunos/${aluno.id}/financeiro`);
  await expect(page.getByRole('tab', { name: 'Financeiro' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-pf-fin-linha]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Lançar para este aluno' })).toBeVisible();

  await fechar(mon);
});

test('F5 · coordenação: lançamento a partir de um pedido da loja (valor do pedido, "Pedido ATD-…", volta ao atendimento)', async ({ page, request }) => {
  test.skip(!HOSPEDEIRA, 'bloqueado: professor.html/professor.js (F8, P1f) ausentes');
  await P.exigirMongo(request);
  const aluno = await P.criarUsuario(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  await exigirF5(request, aluno.token);
  const C = await P.semearCurso(request, { preco: 1990, titulo: `Curso QA Do Pedido ${Date.now().toString(36)}` });
  const ped = await P.api(request, aluno.token).post('/api/portal/me/pedidos', { cursoIds: [C.cursoId] });
  expect(ped.status, JSON.stringify(ped.json)).toBe(201);
  const protocolo = ped.json.protocolo;
  const m = await matricular(request, admin, aluno, C.cursoId);
  const mon = P.monitorarConsoleERede(page);
  await P.simularCliente(page);
  await P.entrarComToken(page, admin.token);

  await page.goto(`${EAD}professor.html#/financeiro?nova=1&matricula=${m.id}&protocolo=${protocolo}`);
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByRole('heading')).toContainText(m.numero);
  await expect(dlg.getByLabel('Valor (R$)')).toHaveValue('1990,00');
  await expect(dlg.getByLabel('Descrição')).toHaveValue(`Pedido ${protocolo}`);
  await expect(dlg.getByLabel(/^Vencimento/)).toHaveValue('');
  await dlg.getByLabel(/^Vencimento/).fill(somarDias(hojeSP(), 7));
  await dlg.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(new RegExp(`#/atendimento/${protocolo}$`));
  const fin = await P.api(request, aluno.token).get('/api/portal/me/financeiro');
  expect(fin.json.itens).toHaveLength(1);
  expect(fin.json.itens[0]).toMatchObject({ rotuloTipo: 'Matrícula', valorCentavos: 199000, descricao: `Pedido ${protocolo}`, matriculaNumero: m.numero });

  await fechar(mon);
});
