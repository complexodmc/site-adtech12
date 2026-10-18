// =============================================================
// E2E da F4b — documentos pessoais e contratos com assinatura nativa.
// Spec: PORTAL-ACADEMICO.md §8.5 (linha F4b), §8.6, D-68, D-74, D-78;
// PORTAL-API.md §6.8.3–§6.8.4; PORTAL-UX.md §6.8, §6.10, §7.15, §7.17, §8.4.
//
// Roda no serve.mjs (mongod descartável; nunca complexodmc_local). A jornada pela
// API vale sempre; as telas do backoffice dependem da hospedeira da F8
// (professor.html + professor.js, P1f) e pulam com o motivo quando ela faltar.
//
//   QA_PORT=4646 QA_WORKERS=2 QA_DATA=<data>-f4b QA_FATIA=F4b \
//   PORTAL_MODULOS=routes/portal/documentos.js,routes/portal/contratos.js,routes/portal-turmas.js,routes/portal-professor.js,routes/portal-declaracoes.js,routes/portal/configuracoes.js \
//   npx playwright test tests/e2e/portal-documentos.spec.js
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import * as P from './_portal.js';
import { conferirQrNaPagina, urlDeValidacao } from './_qr.js';

const EAD = P.BASE_EAD;
const CTR_RE = /^CTR(-[2-9A-HJ-NP-Z]{4}){3}$/;
const HOSPEDEIRA = fs.existsSync(path.join(P.EAD_DISCO, 'professor.html')) && fs.existsSync(path.join(P.EAD_DISCO, 'js', 'portal', 'professor.js'));
const QR_NO_DISCO = fs.existsSync(path.join(P.EAD_DISCO, 'js', 'portal', 'qr.js'));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

test.describe.configure({ mode: 'parallel' });

async function exigirF4b(request, admin) {
  const r = await P.api(request, admin.token).get('/api/portal/admin/documentos/tipos');
  if (r.status === 404) {
    test.info().annotations.push({ type: 'bloqueado', description: 'routes/portal/documentos.js não montado (PORTAL_MODULOS sem a F4b)' });
    test.skip(true, 'bloqueado: F4b não montada');
  }
  expect(r.status, JSON.stringify(r.json)).toBe(200);
}

/** Tipo de documento ativo e exclusivo do teste (escopo: o curso semeado). */
async function criarTipo(A, cursoId, { sigla, nome, formatos = ['pdf', 'jpg', 'png'] }) {
  const r = await A.post('/api/portal/admin/documentos/tipos', { sigla, nome, descricao: 'Orientação de teste.', formatos, escopo: 'cursos', cursoIds: [cursoId], obrigatorio: true, ativo: true, ordem: 1 });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.tipo;
}

const siglaNova = () => `Q${Array.from(crypto.randomBytes(4), (b) => String.fromCharCode(65 + (b % 26))).join('')}`;

/** Aluno com matrícula (F4a) num curso semeado + identificação civil gravada no perfil. */
async function alunoMatriculado(request, admin, { identificado = true } = {}) {
  const aluno = await P.criarUsuario(request, { papel: 'aluno' });
  const C = await P.semearCurso(request, { titulo: `Curso QA Documentação ${Date.now().toString(36)}` });
  const A = P.api(request, admin.token);
  const m = await A.post('/api/portal/admin/matriculas', { email: aluno.email, cursoId: C.cursoId, confirmarSemVerificacao: true, motivo: 'Identidade conferida pela secretaria (QA).' });
  if (m.status === 404) {
    test.info().annotations.push({ type: 'bloqueado', description: 'routes/portal-turmas.js (F4a) não montado' });
    test.skip(true, 'bloqueado: F4a não montada');
  }
  expect(m.status, JSON.stringify(m.json)).toBe(201);
  if (identificado) {
    await P.comBanco(request, (db) => db.collection('perfis').updateOne({ userId: aluno.id }, { $set: { userId: aluno.id, nomeRegistro: `${aluno.nome} Registro`, cpf: P.cpfValido() } }, { upsert: true }));
  }
  return { aluno, C, matricula: m.json.matricula };
}

async function contratoDisponivel(request, admin, matricula, titulo = 'Contrato de prestação de serviços educacionais') {
  const A = P.api(request, admin.token);
  const c = await A.post('/api/portal/admin/contratos', { matriculaId: matricula.id, titulo, confirmarSemVerificacao: true, motivo: 'Identidade conferida pela secretaria (QA).' });
  expect(c.status, JSON.stringify(c.json)).toBe(201);
  const r = await request.fetch(`/api/portal/admin/contratos/${c.json.id}/arquivo`, {
    method: 'POST', headers: { authorization: `Bearer ${admin.token}`, 'content-type': 'application/pdf', 'x-qa-cliente': P.ipNovo() }, data: P.PDF_MINIMO, failOnStatusCode: false
  });
  expect(r.status()).toBe(200);
  return c.json.id;
}

async function fechar(mon) {
  await mon.anexar('console-e-rede');
  await mon.verificar({ tipos: ['pageerror', 'resposta'], rotulo: 'pageerror e respostas' });
}

// ---------------------------------------------------------------
// Jornada pela API (servidor real, banco descartável)
// ---------------------------------------------------------------
test('F4b · API: tipo exigido → envio pelos bytes → revisão com motivo → reenvio; contrato → abrir → assinar → validar CTR', async ({ request }) => {
  await P.exigirMongo(request);
  const { professor, admin } = await P.criarPapeis(request);
  await exigirF4b(request, admin);
  const A = P.api(request, admin.token);
  const { aluno, C, matricula } = await alunoMatriculado(request, admin);
  const U = P.api(request, aluno.token);
  const tipo = await criarTipo(A, C.cursoId, { sigla: siglaNova(), nome: 'Documento de identificação (QA)' });

  const ck = await U.get('/api/portal/me/documentos');
  expect(ck.status).toBe(200);
  expect(ck.json.itens.map((i) => [i.sigla, i.status])).toEqual([[tipo.sigla, 'nao_enviado']]);

  // HTML disfarçado de PDF → 415 pelos bytes; PDF real → 201 em revisão.
  const html = await U.bruto('POST', `/api/portal/me/documentos/tipos/${tipo.id}/envio`, { headers: { 'content-type': 'application/pdf' }, data: Buffer.from('<!doctype html><script>alert(1)</script>') });
  expect(html.status()).toBe(415);
  const env = await U.bruto('POST', `/api/portal/me/documentos/tipos/${tipo.id}/envio`, { headers: { 'content-type': 'application/pdf' }, data: P.PDF_MINIMO });
  expect(env.status()).toBe(201);
  const item = await env.json();
  expect(item).toMatchObject({ status: 'em_revisao', numeroEnvio: 1 });

  // Professor não acessa documentos; outro aluno não baixa (404).
  expect((await P.api(request, professor.token).get('/api/portal/admin/documentos')).status).toBe(403);
  const outro = await P.criarUsuario(request);
  expect((await P.api(request, outro.token).get(`/api/portal/me/documentos/envios/${item.envioId}/arquivo`)).status).toBe(404);
  const meu = await U.bruto('GET', `/api/portal/me/documentos/envios/${item.envioId}/arquivo`);
  expect(meu.status()).toBe(200);
  expect(meu.headers()['content-security-policy']).toBe("default-src 'none'; sandbox");
  expect(sha(await meu.body())).toBe(sha(P.PDF_MINIMO));

  // Revisão: pendente com motivo → o aluno vê o motivo e reenvia (2º envio, histórico preservado).
  const fila = await A.get('/api/portal/admin/documentos');
  const linha = fila.json.itens.find((i) => i.id === item.envioId);
  expect(linha).toBeTruthy();
  const rev = await A.put(`/api/portal/admin/documentos/envios/${item.envioId}/revisao`, { decisao: 'pendente', motivo: 'Imagem cortada no verso (QA).', versao: linha.versao });
  expect(rev.status, JSON.stringify(rev.json)).toBe(200);
  const depois = await U.get('/api/portal/me/documentos');
  expect(depois.json.itens[0]).toMatchObject({ status: 'pendente', motivo: 'Imagem cortada no verso (QA).', podeEnviar: true });
  const pend = await U.get('/api/portal/me/pendencias');
  if (pend.status === 200) expect(pend.json.contadores.documentosPendentes).toBe(1);
  const env2 = await U.bruto('POST', `/api/portal/me/documentos/tipos/${tipo.id}/envio`, { headers: { 'content-type': 'image/png' }, data: P.PNG_1PX });
  expect(env2.status()).toBe(201);
  expect((await env2.json()).numeroEnvio).toBe(2);

  // Contrato: rascunho invisível → PDF anexado → aviso → abrir → assinar → validar.
  const cid = await contratoDisponivel(request, admin, matricula);
  const lista = await U.get('/api/portal/me/contratos');
  const c = lista.json.itens.find((x) => x.id === cid);
  expect(c).toMatchObject({ status: 'pendente', matriculaNumero: matricula.numero });
  expect(c.textoAceite).toContain(c.sha256Pdf);
  if (pend.status === 200) expect((await U.get('/api/portal/me/pendencias')).json.contadores.contratosPendentes).toBe(1);
  const antes = await U.post(`/api/portal/me/contratos/${cid}/assinar`, { aceite: true, sha256Pdf: c.sha256Pdf, senha: aluno.senha });
  expect([antes.status, antes.json.codigo]).toEqual([409, 'abra-o-contrato-antes']);
  expect((await U.bruto('GET', `/api/portal/me/contratos/${cid}/arquivo`)).status()).toBe(200);
  expect((await P.api(request, outro.token).post(`/api/portal/me/contratos/${cid}/assinar`, { aceite: true, sha256Pdf: c.sha256Pdf, senha: outro.senha })).status).toBe(404);
  const errada = await U.post(`/api/portal/me/contratos/${cid}/assinar`, { aceite: true, sha256Pdf: c.sha256Pdf, senha: 'senha-errada-qa' });
  expect([errada.status, Object.keys(errada.json.campos || {})]).toEqual([400, ['senha']]);
  const ok = await U.post(`/api/portal/me/contratos/${cid}/assinar`, { aceite: true, sha256Pdf: c.sha256Pdf, senha: aluno.senha });
  expect(ok.status, JSON.stringify(ok.json)).toBe(200);
  expect(ok.json.codigoVerificacao).toMatch(CTR_RE);
  const val = await P.api(request).get(`/api/portal/validar/${ok.json.codigoVerificacao}`);
  if (val.status !== 404) {
    expect(val.json).toMatchObject({ valido: true, tipo: 'contrato', integro: true, situacao: 'valido' });
    expect(JSON.stringify(val.json)).not.toContain(aluno.email);
    expect(val.json.detalhes.sha256Pdf).toBe(c.sha256Pdf);
  }
  const comp = await U.get(`/api/portal/me/contratos/${cid}/comprovante`);
  expect(comp.json).toMatchObject({ codigoVerificacao: ok.json.codigoVerificacao, sha256Pdf: c.sha256Pdf, hashPrefixo: ok.json.hashPrefixo });
  const de2 = await U.post(`/api/portal/me/contratos/${cid}/assinar`, { aceite: true, sha256Pdf: c.sha256Pdf, senha: aluno.senha });
  expect([de2.status, de2.json.codigo]).toEqual([409, 'contrato-nao-pendente']);
  // A matrícula (F4a) mostra a situação do contrato (contratos.situacaoPorMatricula).
  const mat = await A.get(`/api/portal/admin/matriculas/${matricula.id}`);
  expect(mat.json.matricula.contrato).toMatchObject({ id: cid, status: 'assinado' });
});

// ---------------------------------------------------------------
// Telas do aluno
// ---------------------------------------------------------------
test('F4b · tela Documentos: checklist, enviar pelo diálogo, motivo da pendência e reenvio', async ({ page, request }) => {
  await P.exigirMongo(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  await exigirF4b(request, admin);
  const A = P.api(request, admin.token);
  const { aluno, C } = await alunoMatriculado(request, admin, { identificado: false });
  const tipo = await criarTipo(A, C.cursoId, { sigla: siglaNova(), nome: 'Histórico escolar (QA)', formatos: ['pdf'] });
  const mon = P.monitorarConsoleERede(page);
  await P.simularCliente(page);
  await P.entrarComToken(page, aluno.token);

  await page.goto(`${EAD}documentos.html`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Documentos');
  const linha = page.locator(`[data-doc-tipo="${tipo.id}"]`);
  await expect(linha).toContainText('Histórico escolar (QA)');
  await expect(linha).toContainText('Não enviado');
  await expect(page.locator('#pf-doc-resumo')).toContainText('0 de 1 aprovados');

  await linha.getByRole('button', { name: /^Enviar/ }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('PDF, até 4 MB');
  await expect(dlg).toContainText('Base legal: execução do contrato de matrícula');
  await dlg.locator('input[type="file"]').setInputFiles({ name: 'historico.pdf', mimeType: 'application/pdf', buffer: P.PDF_MINIMO });
  await dlg.getByRole('button', { name: 'Enviar documento' }).click();
  await expect(page.getByText('Documento enviado. A secretaria vai revisar.')).toBeVisible();
  await expect(linha).toContainText('Em revisão');
  await expect(linha.getByRole('button', { name: 'Ver arquivo' })).toBeVisible();

  // A secretaria marca pendente → o aluno vê o motivo e o botão Reenviar.
  const fila = await A.get('/api/portal/admin/documentos');
  const env = fila.json.itens.find((i) => i.aluno.id === aluno.id);
  await A.put(`/api/portal/admin/documentos/envios/${env.id}/revisao`, { decisao: 'pendente', motivo: 'Envie todas as páginas (QA).', versao: env.versao });
  await page.reload();
  await expect(linha).toContainText('Pendente');
  await expect(linha).toContainText('Motivo: Envie todas as páginas (QA).');
  await expect(linha.getByRole('button', { name: /^Reenviar/ })).toBeVisible();

  await fechar(mon);
});

test('F4b · tela Contrato: abrir o PDF libera o aceite, assinatura em 4 passos e comprovante com QR', async ({ page, request, baseURL }) => {
  await P.exigirMongo(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  await exigirF4b(request, admin);
  const { aluno, matricula } = await alunoMatriculado(request, admin);
  const cid = await contratoDisponivel(request, admin, matricula, 'Contrato de matrícula (QA)');
  const mon = P.monitorarConsoleERede(page);
  await P.simularCliente(page);
  await P.entrarComToken(page, aluno.token);
  page.context().on('page', (p) => { p.close().catch(() => {}); });

  await page.goto(`${EAD}contratos.html`);
  const item = page.locator(`[data-doc-contrato="${cid}"]`);
  await expect(item).toContainText('Contrato de matrícula (QA)');
  await expect(item).toContainText(`Matrícula ${matricula.numero}`);
  await expect(item).toContainText('Pendente');
  await item.getByRole('link', { name: 'Assinar' }).click();
  await expect(page).toHaveURL(new RegExp(`contrato\\.html\\?id=${cid}#assinar$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Contrato de matrícula (QA)' })).toBeVisible();
  await expect(page.locator('#pf-doc-aceite')).toBeDisabled();
  await expect(page.locator('.pf-leitura')).toContainText('Li integralmente o contrato «Contrato de matrícula (QA)»');

  await page.getByRole('button', { name: /Abrir contrato \(PDF\)/ }).click();
  await expect(page.locator('#pf-doc-aceite')).toBeEnabled();
  await page.locator('#pf-doc-senha').fill(aluno.senha);
  await page.getByRole('button', { name: 'Assinar contrato' }).click();
  await expect(page.locator('#pf-doc-aceite-erro')).toBeVisible();
  await page.locator('#pf-doc-aceite').check();
  await page.getByRole('button', { name: 'Assinar contrato' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('o endereço de rede da conexão, a identificação do navegador e o código do documento (SHA-256)');
  await dlg.locator('[data-pf-acao="confirmar"]').click();
  await expect(page.getByText(/^Assinado em .+ · Código de verificação CTR(-[2-9A-HJ-NP-Z]{4}){3}$/)).toBeVisible();
  const codigo = (await page.getByText(/Código de verificação CTR-/).textContent()).match(/CTR(-[2-9A-HJ-NP-Z]{4}){3}/)[0];

  await page.getByRole('link', { name: 'Comprovante de assinatura' }).click();
  await expect(page.getByRole('heading', { name: 'Comprovante de assinatura eletrônica' })).toBeVisible();
  await expect(page.locator('.pf-doc-comprovante')).toContainText(codigo);
  await expect(page.locator('.pf-doc-comprovante')).toContainText(`${aluno.nome} Registro`);
  if (QR_NO_DISCO) {
    await conferirQrNaPagina(page, {
      seletor: '.pf-doc-comprovante .pf-qr svg', texto: urlDeValidacao(codigo, { base: baseURL }), rotulo: 'QR do comprovante de assinatura',
      evidencia: process.env.QA_DATA ? { dir: path.join(P.DIR_CAPTURAS, '..', process.env.QA_DATA, 'qr'), nome: 'comprovante-assinatura', bloco: '.pf-documento__rodape' } : null
    });
  } else {
    test.info().annotations.push({ type: 'bloqueado-parcial', description: 'js/portal/qr.js (F0b) ausente: comprovante sem QR' });
  }

  await fechar(mon);
});

// ---------------------------------------------------------------
// Telas da coordenação (professor.html, hospedeira da F8)
// ---------------------------------------------------------------
test('F4b · backoffice: fila de revisão → Marcar pendente; Tipos exigidos; Contratos', async ({ page, request }) => {
  test.skip(!HOSPEDEIRA, 'bloqueado: professor.html/professor.js (F8, P1f) ausentes');
  await P.exigirMongo(request);
  const admin = await P.criarUsuario(request, { papel: 'admin' });
  await exigirF4b(request, admin);
  const A = P.api(request, admin.token);
  const { aluno, C, matricula } = await alunoMatriculado(request, admin);
  const tipo = await criarTipo(A, C.cursoId, { sigla: siglaNova(), nome: 'Diploma de graduação (QA)' });
  const env = await P.api(request, aluno.token).bruto('POST', `/api/portal/me/documentos/tipos/${tipo.id}/envio`, { headers: { 'content-type': 'image/png' }, data: P.PNG_1PX });
  expect(env.status()).toBe(201);
  const envioId = (await env.json()).envioId;
  const cid = await contratoDisponivel(request, admin, matricula, 'Contrato da coordenação (QA)');
  const mon = P.monitorarConsoleERede(page);
  await P.simularCliente(page);
  await P.entrarComToken(page, admin.token);

  await page.goto(`${EAD}professor.html#/documentos?sigla=${tipo.sigla}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Documentos' })).toBeVisible();
  const abrir = page.locator(`a[href="#/documentos/${envioId}"]`);
  await expect(abrir).toBeVisible();
  await abrir.click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`${tipo.sigla} · Diploma de graduação (QA)`);
  await expect(page.locator('[data-doc-previa]')).toHaveAttribute('src', /^blob:/);
  await expect(page.getByText(`${aluno.nome} Registro`)).toBeVisible();
  await page.getByRole('button', { name: 'Marcar pendente' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel(/^Motivo/).selectOption('Ilegível');
  await dlg.getByLabel(/Texto que o aluno lê/).fill('Foto tremida (QA).');
  await dlg.getByRole('button', { name: 'Marcar pendente' }).click();
  await expect(page.getByText('Pendência registrada. O aluno foi notificado.')).toBeVisible();
  const ck = await P.api(request, aluno.token).get('/api/portal/me/documentos');
  expect(ck.json.itens.find((i) => i.tipoId === tipo.id)).toMatchObject({ status: 'pendente', motivo: 'Ilegível. Foto tremida (QA).' });

  await page.goto(`${EAD}professor.html#/documentos/tipos`);
  await expect(page.getByRole('heading', { level: 1, name: 'Tipos de documento exigidos' })).toBeVisible();
  await expect(page.locator('table')).toContainText(tipo.sigla);

  await page.goto(`${EAD}professor.html#/contratos`);
  await expect(page.getByRole('heading', { level: 1, name: 'Contratos' })).toBeVisible();
  await page.locator(`a[href="#/contratos/${cid}"]`).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Contrato da coordenação (QA)' })).toBeVisible();
  await expect(page.getByText('Assinatura nativa')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Substituir PDF' })).toBeVisible();

  await fechar(mon);
});
