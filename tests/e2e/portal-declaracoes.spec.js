// =============================================================
// E2E da F3b — certificação: regras do curso, certificados com a regra
// nova, declarações, validação pública e impressão.
// Spec: PORTAL-ACADEMICO.md §8.5 (linha F3b), §8.6, §9.3 (R9, R9b);
// PORTAL-API.md §6.7.1, §6.7.5–§6.7.7, §8.9, §8.11; PORTAL-UX.md §6.9, §7.15,
// §7.22, §8.1–§8.3.
//
// Roda no serve.mjs (mongod descartável; nunca complexodmc_local):
//   QA_PORT=4653 QA_WORKERS=2 QA_DATA=<data>-f3b QA_FATIA=F3b \
//   PORTAL_MODULOS=routes/portal-cursos.js,routes/portal-declaracoes.js,routes/portal-academico.js,routes/portal-encontros.js,routes/portal-turmas.js \
//   PORTAL_MODULOS_IGNORAR=<os 9 módulos da F0t> \
//   npx playwright test tests/e2e/portal-declaracoes.spec.js
// Sem a F4a (portal-turmas.js) o caso de declaração fica "bloqueado" (as
// declarações por curso dependem de `secretaria.matriculasDoAluno`); o resto
// da jornada não depende dela.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import * as P from './_portal.js';

const EAD = P.BASE_EAD;
const DMC_RE = /^DMC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const DEC_RE = /^DEC(-[A-HJ-NP-Z2-9]{4}){3}$/;
const HASH_RE = /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/;
const QR_NO_DISCO = fs.existsSync(path.join(P.EAD_DISCO, 'js', 'portal', 'qr.js'));
const HOSPEDEIRA = fs.existsSync(path.join(P.EAD_DISCO, 'professor.html')) && fs.existsSync(path.join(P.EAD_DISCO, 'js', 'portal', 'professor.js'));

test.describe.configure({ mode: 'parallel' });

/** qr.js é da F0b: enquanto não estiver no disco, o 404 dele é declarado (bloqueio registrado no relatório). */
function toleraQrAusente(mon) {
  if (!QR_NO_DISCO) {
    mon.esperar({ status: 404, url: /\/js\/portal\/qr\.js/ });
    test.info().annotations.push({ type: 'bloqueado-parcial', description: 'js/portal/qr.js (F0b) ausente: documento sem QR, com código e URL' });
  }
  return mon;
}

async function fechar(mon) {
  await mon.anexar('console-e-rede');
  await mon.verificar({ tipos: ['pageerror', 'resposta'], rotulo: 'pageerror e respostas' });
}

async function exigirF3b(request, admin) {
  const r = await P.api(request, admin.token).get('/api/portal/admin/ies');
  if (r.status === 404) {
    test.info().annotations.push({ type: 'bloqueado', description: 'routes/portal-cursos.js não montado (PORTAL_MODULOS sem a F3b)' });
    test.skip(true, 'bloqueado: F3b não montada');
  }
  expect(r.status, JSON.stringify(r.json)).toBe(200);
}

async function perfilComNome(request, userId, nomeRegistro) {
  await P.comBanco(request, (db) => db.collection('perfis').insertOne({
    userId, nomeRegistro, nomeSocial: null, cpf: null, passaporte: null, versao: 1, criadoEm: new Date(), atualizadoEm: new Date(), atualizadoPor: 'qa-semente'
  }));
}

// ---------------------------------------------------------------
// Jornada principal: regras do curso → emissão pela tela → impressão → validação pública
// ---------------------------------------------------------------
test('F3b · regras do curso (admin), emissão pela tela, certificado impresso com selo e validação pública sem dado pessoal', async ({ page, request, browser, baseURL }) => {
  await P.exigirMongo(request);
  const { admin } = await P.criarPapeis(request);
  await exigirF3b(request, admin);
  const A = P.api(request, admin.token);
  const nomeRegistro = `Joana Registro ${Date.now().toString(36)} Quintela`;
  const aluno = await P.criarUsuario(request, { papel: 'aluno', rotulo: 'f3b' });
  await perfilComNome(request, aluno.id, nomeRegistro);
  const C = await P.semearCurso(request, { aulas: [{}, {}, { disponivel: false }] });
  await P.liberarCurso(request, aluno.id, C.cursoId);

  // Regras do curso: sigla gera os códigos de aula; nota mínima exige motivo; versão.
  const sigla = `Q${C.cursoId.slice(-4).replace(/[^A-Za-z0-9]/g, 'X').toUpperCase()}`.slice(0, 6);
  const g0 = await A.get(`/api/portal/admin/cursos/${C.cursoId}/academico`);
  expect(g0.status).toBe(200);
  expect(g0.json.criterios.notaMinima).toBe(7);
  const semMotivo = await A.put(`/api/portal/admin/cursos/${C.cursoId}/academico`, { versao: g0.json.versao, sigla, criterios: { notaMinima: 6 } });
  expect([semMotivo.status, Object.keys(semMotivo.json.campos || {})]).toEqual([400, ['motivo']]);
  const ok = await A.put(`/api/portal/admin/cursos/${C.cursoId}/academico`, { versao: g0.json.versao, sigla, nivel: 'extensao', criterios: { notaMinima: 6 }, motivo: 'Ajuste de critério para o teste de QA.' });
  expect(ok.status, JSON.stringify(ok.json)).toBe(200);
  expect(ok.json).toMatchObject({ sigla, nivelRotulo: 'Extensão', versao: g0.json.versao + 1 });
  expect(ok.json.modulos[0].aulasSemCodigo).toBe(0);
  const conflito = await A.put(`/api/portal/admin/cursos/${C.cursoId}/academico`, { versao: g0.json.versao, nivel: 'curso_livre' });
  expect([conflito.status, conflito.json.codigo]).toEqual([409, 'conflito-versao']);
  // aluno não acessa a área da coordenação
  expect((await P.api(request, aluno.token).get(`/api/portal/admin/cursos/${C.cursoId}/academico`)).status).toBe(403);

  // Antes de concluir: pendência de aulas, regra e nota mínima do servidor
  const U = P.api(request, aluno.token);
  const antes = await U.get(`/api/cursos/${C.cursoId}/certificado`);
  expect(antes.json).toMatchObject({ emitido: false, elegivel: false, total: 2, concluidas: 0, notaMinima: 6, nomeOrigem: 'registro', nomePrevisto: nomeRegistro });
  await P.concluirAulas(request, aluno.id, C.aulas.filter((a) => a.disponivel).map((a) => a.id));

  // Tela: "Declarações e certificados" → [Emitir certificado] (sem confirmação: nome de registro)
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}certificados.html`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Declarações e');
  const lista = page.locator('#certificados-lista');
  const botao = lista.getByRole('button', { name: 'Emitir certificado' });
  await expect(botao).toBeVisible();
  const emitir = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/cursos/${C.cursoId}/certificado`);
  await botao.click();
  const resp = await emitir;
  expect(resp.status()).toBe(201);
  const cert = (await resp.json()).certificado;
  expect(cert.codigo).toMatch(DMC_RE);
  expect(cert.hashPrefixo).toMatch(HASH_RE);
  expect(cert.nomeOrigem).toBe('registro');
  await expect(lista).toContainText(cert.codigo);
  await expect(lista).toContainText(cert.hashPrefixo);
  await fechar(mon);

  // Certificado impresso (público): código, selo e URL de validação, na tela e no papel
  const ctx = await browser.newContext({ baseURL });
  try {
    const pub = await ctx.newPage();
    const monPub = toleraQrAusente(P.monitorarConsoleERede(pub));
    await pub.goto(`${EAD}certificado.html?codigo=${encodeURIComponent(cert.codigo)}`);
    await expect(pub.locator('#cert-root')).toContainText(nomeRegistro);
    await expect(pub.getByText(cert.codigo).first()).toBeVisible();
    await expect(pub.locator('#cert-root')).toContainText(cert.hashPrefixo);
    await expect(pub.locator('#cert-root')).toContainText(`validar.html?codigo=${cert.codigo}`);
    if (QR_NO_DISCO) await expect(pub.locator('#cert-root .pf-qr svg')).toHaveCount(1);
    await pub.emulateMedia({ media: 'print' });
    await expect(pub.getByText(cert.codigo).first()).toBeVisible();
    await expect(pub.locator('#pf-dec-imprimir')).toBeHidden();
    await fechar(monPub);

    // Validação pública: iniciais, nunca o nome; conferir nome com e sem acento
    const val = await ctx.newPage();
    const monVal = P.monitorarConsoleERede(val);
    await val.goto(`${EAD}validar.html?codigo=${encodeURIComponent(cert.codigo.toLowerCase())}`);
    const res = val.locator('#pf-dec-resultado');
    await expect(res).toContainText('Documento válido');
    await expect(res).toContainText('J. Q.');
    await expect(res).toContainText(cert.hashPrefixo);
    await expect(res).not.toContainText(nomeRegistro);
    await val.getByLabel('Conferir nome do titular').fill(nomeRegistro.toLowerCase());
    await val.getByRole('button', { name: 'Conferir' }).click();
    await expect(res).toContainText('O nome confere com o titular deste documento.');
    await val.getByLabel('Conferir nome do titular').fill('Outra Pessoa');
    await val.getByRole('button', { name: 'Conferir' }).click();
    await expect(res).toContainText('O nome não confere.');
    expect(await val.evaluate(() => localStorage.getItem('dmc:token'))).toBeNull();
    await fechar(monVal);
  } finally {
    await ctx.close();
  }

  // Despacho sem dado pessoal; legado inalterado (D5)
  const d = await P.api(request).get(`/api/portal/validar/${cert.codigo}`);
  expect(d.status).toBe(200);
  expect(d.json).toMatchObject({ valido: true, tipo: 'certificado', integro: true, situacao: 'valido', hashPrefixo: cert.hashPrefixo, iniciais: 'J. Q.' });
  expect(JSON.stringify(d.json)).not.toContain(nomeRegistro);
  expect(JSON.stringify(d.json)).not.toContain(aluno.email);
  const leg = await P.api(request).get(`/api/certificados/validar/${cert.codigo}`);
  expect(Object.keys(leg.json.certificado).sort()).toEqual(['cargaHoraria', 'codigo', 'emitidoEm', 'nomeAluno', 'tituloCurso']);
});

// ---------------------------------------------------------------
// R9b pela tela: aluno sem perfil → confirmação do nome da conta antes de emitir (D-53)
// ---------------------------------------------------------------
test('F3b · aluno sem perfil: confirma o nome da conta antes de emitir; [Completar cadastro] leva ao perfil', async ({ page, request }) => {
  await P.exigirMongo(request);
  const s = await P.semearR9b(request);
  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, s.aluno.token);
  await page.goto(`${EAD}certificados.html`);
  const lista = page.locator('#certificados-lista');
  await lista.getByRole('button', { name: 'Emitir certificado' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText(`«${s.aluno.nome}», da sua conta`);
  await expect(dlg.getByRole('link', { name: 'Completar cadastro' })).toHaveAttribute('href', 'perfil.html#identificacao');
  const emitir = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/cursos/${s.curso.cursoId}/certificado`);
  await P.confirmarNaTela(page);
  const resp = await emitir;
  expect(resp.status()).toBe(201);
  const cert = (await resp.json()).certificado;
  expect(cert.nomeOrigem).toBe('conta');
  await expect(lista).toContainText(cert.codigo);
  await fechar(mon);
});

// ---------------------------------------------------------------
// Não apto: pendência com o texto do servidor e o link que resolve; nada de número fixo
// ---------------------------------------------------------------
test('F3b · curso com frequência mínima: pendência literal do servidor com link para Comprovantes; sem [Emitir]; certificado antigo segue válido', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { admin } = await P.criarPapeis(request);
  await exigirF3b(request, admin);
  const aluno = await P.criarUsuario(request, { papel: 'aluno', rotulo: 'f3b-freq' });
  await perfilComNome(request, aluno.id, 'Pedro Frequência QA');
  const C = await P.semearCurso(request, { aulas: [{}, {}] });
  const C2 = await P.semearCurso(request, { aulas: [{}] });
  await P.liberarCurso(request, aluno.id, C.cursoId);
  await P.liberarCurso(request, aluno.id, C2.cursoId);
  await P.concluirAulas(request, aluno.id, C.aulas.map((a) => a.id));
  const A = P.api(request, admin.token);
  const g = await A.get(`/api/portal/admin/cursos/${C.cursoId}/academico`);
  const put = await A.put(`/api/portal/admin/cursos/${C.cursoId}/academico`, { versao: g.json.versao, criterios: { frequenciaMinima: 75 } });
  expect(put.status, JSON.stringify(put.json)).toBe(200);
  // Certificado emitido antes desta rodada (sem selo) no segundo curso: continua válido
  const codigoAntigo = 'DMC-QA2B-7K9M';
  await P.comBanco(request, (db) => db.collection('certificados').insertOne({
    codigo: codigoAntigo, userId: aluno.id, cursoId: C2.cursoId, nomeAluno: 'Pedro Frequência QA', tituloCurso: C2.titulo, cargaHoraria: '12h', totalAulas: 1, emitidoEm: new Date('2026-01-15T12:00:00Z')
  }));

  const status = await P.api(request, aluno.token).get(`/api/cursos/${C.cursoId}/certificado`);
  expect(status.json.elegivel).toBe(false);
  const textoPendencia = status.json.pendencias.find((p) => p.tipo === 'frequencia').texto;

  const mon = P.monitorarConsoleERede(page);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}certificados.html`);
  const linha = page.locator(`#certificados-lista [data-curso="${C.cursoId}"]`);
  await expect(linha).toContainText(textoPendencia);
  await expect(linha.getByRole('link', { name: 'Ver comprovantes de frequência' })).toHaveAttribute('href', `comprovantes.html?curso=${C.cursoId}&tipo=frequencia`);
  await expect(linha.getByRole('button', { name: 'Emitir certificado' })).toHaveCount(0);
  await expect(linha).not.toContainText('7,0');
  const antigo = page.locator(`#certificados-lista [data-curso="${C2.cursoId}"]`);
  await expect(antigo).toContainText(codigoAntigo);
  await expect(antigo).toContainText('Emitido antes da verificação por selo');
  await fechar(mon);

  const v = await P.api(request).get(`/api/portal/validar/${codigoAntigo}`);
  expect(v.json).toMatchObject({ valido: true, integro: null, hashPrefixo: null });
});

// ---------------------------------------------------------------
// Declarações: solicitar pela tela → histórico → declaracao.html (impressão) → validar → revogar
// ---------------------------------------------------------------
test('F3b · declaração de matrícula pela tela, impressa com código e URL, validada e revogada pela coordenação', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { admin } = await P.criarPapeis(request);
  await exigirF3b(request, admin);
  const turmas = await P.api(request, admin.token).get('/api/portal/admin/turmas');
  if (turmas.status === 404) {
    test.info().annotations.push({ type: 'bloqueado', description: 'routes/portal-turmas.js (F4a) não montado: declarações por curso dependem de secretaria.matriculasDoAluno' });
    test.skip(true, 'bloqueado: F4a não montada');
  }
  const aluno = await P.criarUsuario(request, { papel: 'aluno', rotulo: 'f3b-dec' });
  const nomeRegistro = `Ana Declaração QA ${Date.now().toString(36)}`;
  await perfilComNome(request, aluno.id, nomeRegistro);
  const C = await P.semearCurso(request, { aulas: [{}] });
  // Liberação pelo legado: a F4a materializa a matrícula
  const lib = await P.api(request, admin.token).post('/api/liberacoes', { email: aluno.email, cursoIds: [C.cursoId] });
  expect(lib.status, JSON.stringify(lib.json)).toBe(200);

  const mon = P.monitorarConsoleERede(page);
  toleraQrAusente(mon);
  await P.entrarComToken(page, aluno.token);
  await page.goto(`${EAD}certificados.html#solicitar`);
  await expect(page.locator('#pf-dec-tipo')).toBeVisible();
  await page.locator('#pf-dec-tipo').selectOption('matricula');
  await expect(page.locator('#pf-dec-ref option')).toContainText([C.titulo]);
  const pedido = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/portal/me/declaracoes');
  await page.getByRole('button', { name: 'Solicitar declaração' }).click();
  const r = await pedido;
  expect(r.status()).toBe(201);
  const dec = (await r.json()).declaracao;
  expect(dec.codigo).toMatch(DEC_RE);
  const hist = page.locator('#pf-dec-historico');
  await expect(hist).toContainText(dec.codigo);
  await hist.getByRole('link', { name: 'Abrir' }).first().click();
  await expect(page).toHaveURL(new RegExp(`declaracao\\.html\\?id=${dec.id}`));
  const doc = page.locator('#pf-dec-doc');
  await expect(doc).toContainText('Declaração de matrícula');
  await expect(doc).toContainText(`Declaramos que ${nomeRegistro} está matriculado(a) no curso ${C.titulo}`);
  await expect(doc).toContainText(dec.codigo);
  await expect(doc).toContainText(`validar.html?codigo=${dec.codigo}`);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText(dec.codigo).first()).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await fechar(mon);

  // Outro aluno não abre a declaração (IDOR)
  const outro = await P.criarUsuario(request, { papel: 'aluno', rotulo: 'f3b-idor' });
  expect((await P.api(request, outro.token).get(`/api/portal/me/declaracoes/${dec.id}`)).status).toBe(404);

  // Validação e revogação (coordenação, com motivo e auditoria)
  const v = await P.api(request).get(`/api/portal/validar/${dec.codigo}`);
  expect(v.json).toMatchObject({ valido: true, tipo: 'declaracao', situacao: 'valido', integro: true });
  expect(JSON.stringify(v.json)).not.toContain(nomeRegistro);
  const rev = await P.api(request, admin.token).post(`/api/portal/admin/declaracoes/${dec.id}/revogar`, { motivo: 'Revogação de teste de QA da F3b.' });
  expect(rev.status, JSON.stringify(rev.json)).toBe(200);
  const v2 = await P.api(request).get(`/api/portal/validar/${dec.codigo}`);
  expect(v2.json.situacao).toBe('revogado');

  // A coordenação abre o documento de outro titular (rota de admin) e vê a revogação
  const monAdm = toleraQrAusente(P.monitorarConsoleERede(page));
  await P.entrarComToken(page, admin.token);
  await page.goto(`${EAD}declaracao.html?id=${dec.id}`);
  await expect(page.locator('#pf-dec-doc')).toContainText('Esta declaração foi revogada');
  await expect(page.locator('#pf-dec-doc')).toContainText(dec.codigo);
  await fechar(monAdm);
  // Validação pública da revogada
  await page.goto(`${EAD}validar.html?codigo=${dec.codigo}`);
  await expect(page.locator('#pf-dec-resultado')).toContainText('Este documento foi revogado em');
});

// Estado de erro dos documentos mantém um h1 (varredura de títulos, falha da F3b)
test('F3b · declaração sem id ou alheia e certificado sem código: estado vazio com h1', async ({ page, request }) => {
  await P.exigirMongo(request);
  const aluno = await P.criarUsuario(request, { papel: 'aluno', rotulo: 'f3b-h1' });
  const mon = P.monitorarConsoleERede(page);
  mon.esperar({ status: 404, url: /\/api\/portal\/me\/declaracoes\/[a-f0-9]{24}$/ });
  await P.entrarComToken(page, aluno.token);
  const h1 = page.locator('#pf-dec-doc h1');
  await page.goto(`${EAD}declaracao.html`);
  await expect(h1).toHaveText('Declaração não encontrada');
  await expect(page.locator('h1')).toHaveCount(1);
  await page.goto(`${EAD}declaracao.html?id=${'0'.repeat(23)}1`);
  await expect(h1).toHaveText('Declaração não encontrada');
  await expect(page.locator('#pf-dec-doc')).toContainText('Ela não existe ou não pertence à sua conta.');
  await expect(page.locator('h1')).toHaveCount(1);
  await page.goto(`${EAD}certificado.html`);
  await expect(page.locator('#cert-root h1')).toHaveText('Certificado não localizado');
  await expect(page.locator('h1')).toHaveCount(1);
  await mon.anexar('console-e-rede');
  await mon.verificar({ tipos: ['pageerror'], rotulo: 'pageerror' });
});

// ---------------------------------------------------------------
// Backoffice (hospedeira da F8): critérios dos cursos e declarações emitidas
// ---------------------------------------------------------------
test('F3b · backoffice: critérios dos cursos e declarações emitidas abrem para a coordenação', async ({ page, request }) => {
  test.skip(!HOSPEDEIRA, 'bloqueado: professor.html/professor.js (F8, P1f) ausentes');
  await P.exigirMongo(request);
  const { admin } = await P.criarPapeis(request);
  await exigirF3b(request, admin);
  const C = await P.semearCurso(request, { aulas: [{}] });
  const mon = P.monitorarConsoleERede(page);
  toleraQrAusente(mon);
  await P.entrarComToken(page, admin.token);
  await page.goto(`${EAD}professor.html#/configuracoes/cursos`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Critérios dos cursos');
  const linha = page.locator('#pf-dec-cursos tr', { hasText: C.titulo });
  await expect(linha).toContainText('7,0');
  await linha.getByRole('button', { name: 'Editar' }).click();
  await expect(page.locator('#pf-dec-form-curso')).toBeVisible();
  await page.goto(`${EAD}professor.html#/documentos/declaracoes`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Declarações emitidas');
  await expect(page.locator('#pf-dec-lista-adm')).not.toContainText('Carregando');
  await mon.anexar('console-e-rede');
  await mon.verificar({ tipos: ['pageerror'], rotulo: 'pageerror' });
});

// ---------------------------------------------------------------
// Selo (A08, achado do G2): registro editado direto no banco nunca aparece como
// "Documento válido". Antes, trocar o kid ou apagar hash/kid dava integro:null e a
// tela mostrava "Documento válido" sem alerta; com integro:false, o marcador verde
// ficava ao lado do alerta vermelho.
// ---------------------------------------------------------------
const ALFABETO_CODIGO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const blocoCodigo = () => Array.from({ length: 4 }, () => ALFABETO_CODIGO[Math.floor(Math.random() * ALFABETO_CODIGO.length)]).join('');

test('F3b · selo: certificado adulterado, kid trocado ou selo pela metade e declaração sem selo → "Não confere" (validação e impressão); legado avisa', async ({ page, request }) => {
  await P.exigirMongo(request);
  const { admin } = await P.criarPapeis(request);
  await exigirF3b(request, admin);
  const aluno = await P.criarUsuario(request, { papel: 'aluno', rotulo: 'f3b-selo' });
  await perfilComNome(request, aluno.id, `Selo Registro ${Date.now().toString(36)} Quintela`);
  const C = await P.semearCurso(request, { aulas: [{}] });
  await P.liberarCurso(request, aluno.id, C.cursoId);
  await P.concluirAulas(request, aluno.id, C.aulas.map((a) => a.id));
  const em = await P.api(request, aluno.token).post(`/api/cursos/${C.cursoId}/certificado`, {});
  expect(em.status, JSON.stringify(em.json)).toBe(201);
  const cert = em.json.certificado;
  expect(cert.hashPrefixo).toMatch(HASH_RE);
  const certs = (fn) => P.comBanco(request, (db) => fn(db.collection('certificados')));

  const mon = toleraQrAusente(P.monitorarConsoleERede(page));
  await P.simularCliente(page);
  const res = page.locator('#pf-dec-resultado');
  const titulo = res.locator('h2');
  const abrir = async (codigo) => {
    await page.goto(`${EAD}validar.html?codigo=${encodeURIComponent(codigo)}`);
    await expect(titulo).toBeVisible();
  };
  const naoConfere = async (rotulo) => {
    await expect(titulo, rotulo).toHaveText('Não confere');
    await expect(res.locator('[data-selo="nao-confere"]'), rotulo).toContainText('não confere com o selo de emissão');
    await expect(res, rotulo).not.toContainText('Documento válido');
  };

  // íntegro: marcador verde, sem alerta
  await abrir(cert.codigo);
  await expect(titulo).toHaveText('Documento válido');
  await expect(res.locator('[data-selo]')).toHaveCount(0);

  // dados adulterados → "Não confere" (antes: "Documento válido" ao lado do alerta)
  await certs((c) => c.updateOne({ codigo: cert.codigo }, { $set: { tituloCurso: 'Curso FALSO QA' } }));
  await abrir(cert.codigo);
  await naoConfere('dados adulterados');
  // + kid trocado → continua "Não confere" (antes: integro null, nenhum alerta)
  await certs((c) => c.updateOne({ codigo: cert.codigo }, { $set: { kid: 'deadbeef' } }));
  await abrir(cert.codigo);
  await naoConfere('kid trocado');
  // + kid apagado (selo pela metade)
  await certs((c) => c.updateOne({ codigo: cert.codigo }, { $unset: { kid: '' } }));
  await abrir(cert.codigo);
  await naoConfere('hash sem kid');
  // impressão pública do certificado: alerta no documento, na tela e no papel
  await page.goto(`${EAD}certificado.html?codigo=${encodeURIComponent(cert.codigo)}`);
  const alertaCert = page.locator('#cert-root [data-selo="nao-confere"]');
  await expect(alertaCert).toContainText('não vale como documento');
  await page.emulateMedia({ media: 'print' });
  await expect(alertaCert).toBeVisible();
  await page.emulateMedia({ media: 'screen' });

  // declaração sem selo: nenhuma emissão legítima produz (declaracoes.emitir sempre sela)
  const codigoDec = `DEC-${blocoCodigo()}-${blocoCodigo()}-${blocoCodigo()}`;
  await P.comBanco(request, (db) => db.collection('declaracoes').insertOne({
    codigo: codigoDec, tipo: 'matricula', userId: aluno.id, matriculaId: null, cursoId: C.cursoId, ano: null,
    solicitadaEm: new Date(), emitidaEm: new Date(), dados: { nomeTitular: 'Titular Forjado', cursoTitulo: 'Curso FALSO QA' },
    iniciaisTitular: 'T. F.', revogada: null
  }));
  const vDec = await P.api(request).get(`/api/portal/validar/${codigoDec}`);
  expect(vDec.json).toMatchObject({ valido: true, tipo: 'declaracao', integro: false, hashPrefixo: null });
  await abrir(codigoDec);
  await naoConfere('declaração sem selo');
  await expect(res.locator('dl')).toContainText('Ausente');

  // sem hash E sem kid = forma do certificado legado (DC-65): segue null, e a tela diz que não confere pelo selo
  await certs((c) => c.updateOne({ codigo: cert.codigo }, { $unset: { hash: '', kid: '' } }));
  await abrir(cert.codigo);
  await expect(titulo).toHaveText('Documento válido');
  await expect(res.locator('[data-selo="anterior"]')).toContainText('não podem ser conferidos');
  await expect(res.locator('dl')).toContainText('Emitido antes da verificação por selo');
  await fechar(mon);
});

test('F3b · selo não verificável (integro:null fora do legado): aviso explícito e marcador "Selo não verificado", nunca "Documento válido"', async ({ page }) => {
  const codigo = `DEC-${blocoCodigo()}-${blocoCodigo()}-${blocoCodigo()}`;
  const corpo = {
    valido: true, codigo, tipo: 'declaracao', rotulo: 'Declaração de matrícula', emitidoEm: '2026-10-01T12:00:00.000Z', emissor: 'Complexo DMC',
    iniciais: 'A. S.', integro: null, situacao: 'valido', hashPrefixo: '9C1E-07AB-12CD-34EF', detalhes: { curso: 'Curso de Teste', ano: null, nivelRotulo: null }
  };
  // resposta do despacho para um selo de kid aposentado (PORTAL_SELO_KIDS_APOSENTADOS) ou servidor sem assinador
  await page.route((u) => u.pathname === `/api/portal/validar/${codigo}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) }));
  const mon = P.monitorarConsoleERede(page);
  await page.goto(`${EAD}validar.html?codigo=${codigo}`);
  const res = page.locator('#pf-dec-resultado');
  await expect(res.locator('h2')).toHaveText('Selo não verificado');
  await expect(res.locator('[data-selo="nao-verificado"]')).toContainText('Não foi possível verificar o selo de emissão');
  await expect(res).not.toContainText('Documento válido');
  await expect(res).toContainText('9C1E-07AB-12CD-34EF');
  await mon.anexar('console-e-rede');
  await mon.verificar({ tipos: ['pageerror'], rotulo: 'pageerror' });
});
