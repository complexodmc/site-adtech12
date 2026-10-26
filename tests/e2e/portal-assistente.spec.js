// =============================================================
// portal-assistente.spec.js (F6b) — PORTAL-ACADEMICO.md §8.5, linha F6b.
// Assistente acadêmico do aluno (assistente.html) e a configuração do
// Assistente pela coordenação (professor.html#/configuracoes/ia, prof-ia.js),
// com o Gemini FALSO do servidor de QA (tests/server/provedores-falsos.mjs,
// D-41): nenhuma chamada sai para o Google.
//
//   QA_PORT=4657 QA_WORKERS=2 QA_DATA=<AAAA-MM-DD>-F6b QA_FATIA=F6b \
//     npx playwright test tests/e2e/portal-assistente.spec.js
//
// Serial: a configuração do Assistente é um documento único do banco
// descartável (configuracoes._id='assistente_ia').
// =============================================================
import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as P from './_portal.js';

const QA_FATIA = process.env.QA_FATIA || null;
test.skip(!!QA_FATIA && QA_FATIA !== 'F6b', 'portal-assistente.spec.js é da F6b');
test.describe.configure({ mode: 'serial' });

const CFG = '/api/portal/admin/configuracoes/assistente-ia';
const CHAVE_QA = `qa-chave-valida-${crypto.randomBytes(8).toString('hex')}`;
const EAD = (p) => `/plataforma-ead/${p}`;
/** Marca do roteiro do Gemini falso sem dígitos: o servidor mascara 7+ dígitos seguidos como
 *  [NÚMERO] (mascararDadosPessoais) e um uid hexadecimal às vezes os tem, o que desfazia o `contem`. */
const marcaDeTeste = (prefixo) => P.uid(prefixo).replace(/\d/g, (d) => 'ghijklmnop'[Number(d)]);

let admin;
let aluno;
let semCurso;
let curso;

/** Deixa o Assistente ligado com a chave do painel (pela API), caso o caso de UI não tenha deixado. */
async function garantirLigado(request) {
  const a = P.api(request, admin.token);
  let cfg = (await a.get(CFG)).json;
  if (!cfg.chave.configurada) {
    const r = await a.put(`${CFG}/chave`, { chave: CHAVE_QA, reautenticacao: { senha: admin.senha } });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    cfg = r.json;
  }
  if (!cfg.ligado) {
    const r = await a.put(CFG, { ligado: true, versao: cfg.versao });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
  }
}

/** Capturas para revisão visual (só com QA_CAPTURAS=1; ficam nos artefatos do caso). */
async function capturar(page, nome) {
  if (process.env.QA_CAPTURAS !== '1') return;
  await page.screenshot({ path: test.info().outputPath(`${nome}.png`), fullPage: true });
}

async function roteiroGemini(request, quando, respostas) {
  const r = await request.post('/__qa/gemini/roteiro', { data: { quando, respostas } });
  expect(r.status()).toBe(201);
}

test.beforeAll(async ({ request }) => {
  await P.exigirMongo(request);
  admin = await P.criarUsuario(request, { papel: 'admin', rotulo: 'ia-admin' });
  aluno = await P.criarUsuario(request, { papel: 'aluno', nome: 'Beatriz Teste Assistente', rotulo: 'ia-aluno' });
  semCurso = await P.criarUsuario(request, { papel: 'aluno', nome: 'Carlos Sem Curso', rotulo: 'ia-sem-curso' });
  curso = await P.semearCurso(request, { titulo: `Curso do assistente ${P.uid('c')}` });
  await P.liberarCurso(request, aluno.id, curso.cursoId);
  await P.comBanco(request, (db) => db.collection('configuracoes').deleteOne({ _id: 'assistente_ia' }));
});

test('assistente desligado: estado honesto e atalho para a equipe', { tag: ['@F6b'] }, async ({ page }) => {
  const monitor = P.monitorarConsoleERede(page, { fatia: 'F6b' });
  await P.entrarComToken(page, aluno.token);
  await page.goto(EAD('assistente.html'));
  await expect(page.getByText('O assistente não está disponível no momento.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Iniciar atendimento com a equipe' })).toHaveAttribute('href', 'atendimentos.html?novo=1');
  await expect(page.locator('nav.pf-subnav a[aria-current="page"]')).toHaveText('Assistente');
  await expect(page.locator('#pf-ia-campo')).toHaveCount(0);
  await monitor.verificar();
});

test('coordenação cola a chave do Gemini, liga e testa a conexão (prof-ia.js)', { tag: ['@F6b'] }, async ({ page, request }) => {
  const monitor = P.monitorarConsoleERede(page, { fatia: 'F6b' });
  await P.entrarComToken(page, admin.token);
  await page.goto(EAD('professor.html#/configuracoes/ia'));
  await expect(page.getByRole('heading', { name: 'Chave da API do Google Gemini' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Nenhuma chave configurada.')).toBeVisible();

  await page.getByLabel('Nova chave').fill(CHAVE_QA);
  await page.getByRole('button', { name: 'Salvar chave' }).click();
  const senha = page.getByLabel('Senha atual');
  await expect(senha).toBeVisible();
  await senha.fill(admin.senha);
  await page.locator('[data-pf-acao="confirmar"]:visible').click();
  await expect(page.locator('[data-ia-adm="situacao"]')).toContainText(`Configurada pelo painel · termina em ••••${CHAVE_QA.slice(-4)}`);
  await expect(page.getByLabel('Nova chave')).toHaveValue('');

  await page.getByRole('switch', { name: 'Assistente disponível para os alunos' }).check();
  await expect(page.getByText('Assistente ligado para os alunos.')).toBeVisible();

  await page.getByRole('button', { name: 'Testar conexão' }).click();
  await expect(page.getByText(/Conexão confirmada: o modelo gemini-2\.5-flash respondeu/)).toBeVisible();
  await capturar(page, 'professor-configuracoes-ia');

  // A chave nunca volta: nem na tela nem na API.
  expect(await page.content()).not.toContain(CHAVE_QA);
  const r = await P.api(request, admin.token).get(CFG);
  expect(JSON.stringify(r.json)).not.toContain(CHAVE_QA);
  expect(r.json.chave).toMatchObject({ configurada: true, origem: 'painel', final4: CHAVE_QA.slice(-4), legivel: true });
  // O teste foi ao provedor falso pelo cabeçalho, nunca por ?key=.
  const ch = await (await request.get('/__qa/gemini/chamadas')).json();
  const minhas = ch.chamadas.filter((c) => c.chave === CHAVE_QA);
  expect(minhas.length).toBeGreaterThan(0);
  expect(minhas.every((c) => c.chavePresente && !c.chaveNaUrl)).toBe(true);
  // professor.html é hospedeira (F8) e carrega arquivos de outras fatias ainda em obra (ex.: qr.js da
  // F0b, tutoriais.js da F0r): aqui só reprovam erros de script e falhas das rotas da F6b.
  const c = await monitor.anexar('console-e-rede-professor');
  expect(c.inesperadas.filter((i) => i.tipo === 'pageerror' || /assistente-ia|prof-ia\.js|portal-assistente\.css/.test(String(i.url || i.origem || '')))).toEqual([]);
});

test('aluno: consentimento, saudação, pergunta com ferramenta, ação do servidor, equipe e apagar histórico', { tag: ['@F6b'] }, async ({ page, request }) => {
  await garantirLigado(request);
  const marca = marcaDeTeste('ia');
  await roteiroGemini(request, { contem: marca }, [
    { ferramentas: [{ nome: 'sugerir_falar_com_equipe', args: { motivo: 'teste de QA', categoria: 'academico' } }] },
    { texto: `Resposta de teste ${marca}. Veja https://exemplo.invalid/link` }
  ]);
  const monitor = P.monitorarConsoleERede(page, { fatia: 'F6b' });
  await P.entrarComToken(page, aluno.token);
  await page.goto(EAD('assistente.html'));

  // Consentimento antes do 1º uso (texto literal do servidor)
  await expect(page.getByRole('heading', { name: 'Antes de começar' })).toBeVisible();
  await expect(page.getByText(/serviço de inteligência artificial do Google \(Gemini\)/)).toBeVisible();
  await expect(page.getByText('Versão v1 do texto')).toBeVisible();
  await expect(page.locator('#pf-ia-campo')).toHaveCount(0);
  await capturar(page, 'assistente-consentimento');
  await page.getByRole('button', { name: 'Concordo e quero usar' }).click();

  // Saudação, sugestões e aviso fixo
  await expect(page.getByRole('heading', { name: 'Olá, Beatriz.' })).toBeVisible();
  await expect(page.locator('[data-ia-sugestao]')).toHaveCount(4);
  await expect(page.getByText('Respostas geradas por IA podem conter imprecisões.', { exact: false })).toBeVisible();

  // Pergunta → ferramenta → resposta como texto + ação montada pelo servidor
  await page.getByLabel('Sua pergunta').fill(`Minha pergunta ${marca}`);
  await page.getByLabel('Sua pergunta').press('Enter');
  const log = page.getByRole('log', { name: 'Mensagens da conversa' });
  await expect(log.getByText(`Resposta de teste ${marca}.`, { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(log.getByRole('link', { name: 'Falar com a equipe →' })).toHaveAttribute('href', 'assistente.html#equipe');
  await expect(log.locator('a[href*="exemplo.invalid"]')).toHaveCount(0);
  await expect(page.locator('[data-ia="boasvindas"]')).toBeHidden();

  // Histórico lateral
  await expect(page.getByRole('button', { name: `Minha pergunta ${marca}`, exact: true })).toBeVisible();
  await capturar(page, 'assistente-resposta-1440');
  if (process.env.QA_CAPTURAS === '1') {
    await page.setViewportSize({ width: 390, height: 844 });
    await capturar(page, 'assistente-resposta-390');
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  // O provedor recebeu a chave só no cabeçalho e nunca o e-mail do aluno
  const chamadas = (await (await request.get(`/__qa/gemini/chamadas?contem=${marca}`)).json()).chamadas;
  expect(chamadas.length).toBe(2);
  for (const c of chamadas) {
    expect(c.chavePresente && !c.chaveNaUrl).toBe(true);
    expect(JSON.stringify(c.corpo)).not.toContain(aluno.email);
  }

  // Falar com a equipe → protocolo pelo atendimento.abrirProtocolo (F6a)
  await page.getByRole('button', { name: 'Falar com a equipe' }).first().click();
  const dialogo = page.getByRole('dialog', { name: 'Falar com a equipe' });
  await expect(dialogo.getByLabel('Resumo')).not.toHaveValue('');
  await expect(dialogo.getByLabel('Anexar esta conversa ao atendimento')).not.toBeChecked();
  await dialogo.getByLabel('Assunto').fill('Dúvida levada pelo assistente');
  await capturar(page, 'assistente-falar-com-a-equipe');
  await dialogo.getByRole('button', { name: 'Abrir atendimento' }).click();
  await expect(dialogo.getByText(/Atendimento ATD-\d{4}-[A-Z0-9]{6} aberto/)).toBeVisible();
  await page.keyboard.press('Escape');

  // Apagar todo o histórico (com confirmação)
  await P.confirmarNaTela(page, () => page.getByRole('button', { name: 'Apagar todo o histórico' }).click());
  await expect(page.getByText('Nenhuma conversa ainda.')).toBeVisible();
  await monitor.verificar();
});

test('fonte do regulamento vira link para o trecho em regulamento.html (D-81)', { tag: ['@F6b'] }, async ({ page, request }) => {
  await garantirLigado(request);
  const marca = marcaDeTeste('reg');
  const titulo = 'Frequência mínima';
  const texto = `# ${titulo}\nA frequência mínima exigida é de 75% em cada módulo, somando as aulas ao vivo e as gravadas.`;
  const regId = await P.comBanco(request, async (db) => String((await db.collection('regulamentos').insertOne({
    escopo: curso.cursoId, titulo: 'Regulamento do curso (QA)', edicao: 1, status: 'publicado', texto,
    trechos: [{ id: 'e1-t001', titulo, texto, inicio: 0, fim: texto.length }],
    publicadoEm: new Date(), publicadoPor: admin.id, versao: 1, criadoEm: new Date(), criadoPor: admin.id, atualizadoEm: new Date()
  })).insertedId));
  await roteiroGemini(request, { contem: marca }, [
    { ferramentas: [{ nome: 'buscar_regulamento', args: { consulta: 'frequência mínima' } }] },
    { texto: `Segundo o trecho ${titulo}, a frequência mínima é de 75% em cada módulo.` }
  ]);
  const monitor = P.monitorarConsoleERede(page, { fatia: 'F6b' });
  await P.entrarComToken(page, aluno.token);
  await page.goto(EAD('assistente.html'));
  await expect(page.getByRole('heading', { name: 'Olá, Beatriz.' })).toBeVisible();
  await page.getByLabel('Sua pergunta').fill(`Qual é a frequência mínima? ${marca}`);
  await page.getByLabel('Sua pergunta').press('Enter');
  const log = page.getByRole('log', { name: 'Mensagens da conversa' });
  const fonte = log.getByRole('link', { name: titulo });
  await expect(fonte).toHaveAttribute('href', `regulamento.html#r-${regId}-e1-t001`, { timeout: 15_000 });
  // O trecho do regulamento foi ao provedor como dado (functionResponse), já mascarado.
  const chamadas = (await (await request.get(`/__qa/gemini/chamadas?contem=${marca}`)).json()).chamadas;
  expect(JSON.stringify(chamadas.at(-1).corpo)).toContain('frequência mínima exigida');
  await fonte.click();
  await expect(page).toHaveURL(new RegExp(`regulamento\\.html#r-${regId}-e1-t001$`));
  await expect(page.locator(`[id="r-${regId}-e1-t001"]`)).toBeVisible();
  await monitor.verificar();
});

test('provedor fora do ar: mensagem honesta, texto preservado, nada gravado', { tag: ['@F6b'] }, async ({ page, request }) => {
  await garantirLigado(request);
  const marca = marcaDeTeste('falha');
  await roteiroGemini(request, { contem: marca }, [{ status: 500, erro: { mensagem: 'falha simulada' } }]);
  const monitor = P.monitorarConsoleERede(page, { fatia: 'F6b' });
  monitor.esperar({ status: 503, url: /\/api\/portal\/me\/ia\/conversas/ });
  await P.entrarComToken(page, aluno.token);
  await page.goto(EAD('assistente.html'));
  await expect(page.getByRole('heading', { name: 'Olá, Beatriz.' })).toBeVisible();
  await page.getByLabel('Sua pergunta').fill(`Pergunta que falha ${marca}`);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Não consegui responder agora. Tente de novo ou fale com a equipe.')).toBeVisible();
  await expect(page.getByLabel('Sua pergunta')).toHaveValue(`Pergunta que falha ${marca}`);
  await expect(page.getByRole('button', { name: `Pergunta que falha ${marca}`, exact: true })).toHaveCount(0);
  await monitor.verificar();
});

test('aluno sem curso liberado: estado honesto (sem compositor)', { tag: ['@F6b'] }, async ({ page, request }) => {
  await garantirLigado(request);
  const monitor = P.monitorarConsoleERede(page, { fatia: 'F6b' });
  await P.entrarComToken(page, semCurso.token);
  await page.goto(EAD('assistente.html'));
  await expect(page.getByText('O assistente atende alunos com curso liberado ou matrícula ativa.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Iniciar atendimento com a equipe' })).toBeVisible();
  await expect(page.locator('#pf-ia-campo')).toHaveCount(0);
  await monitor.verificar();
});

test('prazo de guarda alterado depois do aceite: o aluno é avisado, lê o texto novo e autoriza de novo (LGPD art. 8º §6º)', { tag: ['@F6b'] }, async ({ page, request }) => {
  await garantirLigado(request);
  const RET = '/api/portal/admin/configuracoes/retencao';
  const a = P.api(request, admin.token);
  const outro = await P.criarUsuario(request, { papel: 'aluno', nome: 'Diana Teste Prazos', rotulo: 'ia-prazos' });
  await P.liberarCurso(request, outro.id, curso.cursoId);
  const b = P.api(request, outro.token);

  // Aceite do texto com os prazos de agora (pela API, como a tela faz: versão + sha256 do texto exibido)
  const e0 = (await b.get('/api/portal/me/ia/estado')).json;
  const sha0 = crypto.createHash('sha256').update(e0.consentimento.texto, 'utf8').digest('hex');
  expect((await b.post('/api/portal/me/ia/consentimento', { aceito: true, versaoTexto: e0.consentimento.versaoTexto, textoSha256: sha0 })).status).toBe(201);
  expect((await b.get('/api/portal/me/ia/estado')).json.consentimento.necessario).toBe(false);

  const atual = (await a.get(RET)).json;
  expect(atual && atual.retencao, JSON.stringify(atual)).toBeTruthy();
  const r0 = atual.retencao;
  const prazos = Object.fromEntries(Object.entries(r0.prazosDescritivos || {}).filter(([, v]) => typeof v === 'string' && v));
  const novoPrazo = r0.conversasIaDias === 365 ? 366 : 365;
  const put = await a.put(RET, { conversasIaDias: novoPrazo, notificacoesDias: r0.notificacoesDias, trilhaIaDias: r0.trilhaIaDias, prazosDescritivos: prazos, versao: atual.versao });
  expect(put.status, JSON.stringify(put.json)).toBe(200);
  try {
    const e1 = (await b.get('/api/portal/me/ia/estado')).json;
    expect(e1.consentimento.necessario).toBe(true);
    expect(e1.consentimento.textoAlterado).toBe(true);
    expect((await b.post('/api/portal/me/ia/conversas', { mensagem: 'Como está o meu desempenho?' })).status).toBe(428);

    const monitor = P.monitorarConsoleERede(page, { fatia: 'F6b' });
    await P.entrarComToken(page, outro.token);
    await page.goto(EAD('assistente.html'));
    const bloco = page.locator('[data-ia="consentimento"]');
    await expect(page.getByRole('heading', { name: 'Antes de começar' })).toBeVisible();
    await expect(bloco.getByRole('status').filter({ hasText: 'O texto da autorização foi atualizado. Leia a versão atual antes de concordar.' })).toBeVisible();
    await expect(bloco).toBeFocused();
    await expect(bloco.getByText(`As conversas ficam guardadas por ${novoPrazo} dias`, { exact: false })).toBeVisible();
    await expect(page.locator('#pf-ia-campo')).toHaveCount(0);
    await capturar(page, 'assistente-consentimento-prazo-alterado');
    await page.getByRole('button', { name: 'Concordo e quero usar' }).click();
    await expect(page.getByRole('heading', { name: 'Olá, Diana.' })).toBeVisible();
    const e2 = (await b.get('/api/portal/me/ia/estado')).json;
    expect(e2.consentimento.necessario).toBe(false);
    expect(e2.consentimento.textoAlterado).toBeUndefined();
    await monitor.verificar();
  } finally {
    const v = (await a.get(RET)).json.versao;
    const volta = await a.put(RET, { conversasIaDias: r0.conversasIaDias, notificacoesDias: r0.notificacoesDias, trilhaIaDias: r0.trilhaIaDias, prazosDescritivos: prazos, versao: v });
    expect(volta.status, JSON.stringify(volta.json)).toBe(200);
  }
});

test('qualidade: axe nos dois temas (1440 e 390), sem rolagem horizontal de 320 a 1920, alvos de 44 px', { tag: ['@F6b'] }, async ({ page, request }) => {
  await garantirLigado(request);
  const marca = marcaDeTeste('qual');
  await roteiroGemini(request, { contem: marca }, [{ texto: `Resumo da sua situação:\n- Curso em andamento\n- Nenhum documento pendente informado` }]);
  const r = await P.api(request, aluno.token).post('/api/portal/me/ia/conversas', { mensagem: `Como estou indo? ${marca}` });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  const titulo = r.json.conversa.titulo;
  const monitor = P.monitorarConsoleERede(page, { fatia: 'F6b' });

  const abrirConversa = async (largura) => {
    await page.goto(EAD('assistente.html'));
    await expect(page.getByRole('heading', { name: 'Olá, Beatriz.' })).toBeVisible();
    if (largura < 1024) await page.getByRole('button', { name: 'Conversas', exact: true }).click();
    await page.getByRole('button', { name: titulo, exact: true }).click();
    await expect(page.getByRole('log').getByText('Curso em andamento')).toBeVisible();
  };

  for (const tema of ['escuro', 'claro']) {
    for (const largura of [1440, 390]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await P.entrarComToken(page, aluno.token, { 'dmc:tema': tema });
      await abrirConversa(largura);
      await expect(page.locator('html')).toHaveAttribute('data-pf-tema', tema);
      const axe = await new AxeBuilder({ page }).include('#conteudo').analyze();
      const graves = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), `axe ${tema} ${largura}`).toEqual([]);
      if (largura < 1024) {
        const pequenos = await page.evaluate(() => [...document.querySelectorAll('[data-ia="layout"] button, [data-ia="layout"] a, [data-ia="layout"] textarea')]
          .filter((e) => e.offsetParent !== null && !e.closest('[data-alvo-excecao]'))
          .map((e) => ({ t: (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 40), h: e.getBoundingClientRect().height }))
          .filter((x) => x.h < 43.5));
        expect(pequenos, `alvos menores que 44 px (${tema})`).toEqual([]);
      }
    }
  }
  for (const largura of [320, 1920]) {
    for (const fonte of ['0', '2']) {
      await page.setViewportSize({ width: largura, height: 900 });
      await P.entrarComToken(page, aluno.token, { 'dmc:tema': 'escuro', 'dmc:fonte': fonte });
      await abrirConversa(largura);
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sobra, `rolagem horizontal em ${largura}px, fonte ${fonte}`).toBeLessThanOrEqual(0);
    }
  }
  await monitor.verificar();
});

test('coordenação: Uso (agregado) e Trilha das respostas (só metadados, consulta sob demanda)', { tag: ['@F6b'] }, async ({ page }) => {
  const monitor = P.monitorarConsoleERede(page, { fatia: 'F6b' });
  await P.entrarComToken(page, admin.token);
  await page.goto(EAD('professor.html#/configuracoes/ia/uso'));
  await expect(page.getByText('Conversas (30 dias)')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('table')).toContainText('Mensagens');
  await page.getByRole('link', { name: 'Trilha das respostas' }).click();
  await expect(page.getByText('Cada consulta fica registrada na auditoria. A trilha não contém o texto das conversas.')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0); // nada é consultado ao abrir
  // Pelo e-mail (único): no banco reaproveitado (QA_REUSE=1) há várias "Beatriz Teste Assistente".
  await page.getByLabel('Aluno (opcional: nome ou e-mail)').fill(aluno.email);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByLabel('Aluno escolhido')).toHaveValue(aluno.id);
  await page.getByRole('button', { name: 'Consultar' }).click();
  const tabela = page.getByRole('table');
  await expect(tabela).toContainText('ia-v1');
  await expect(tabela).toContainText('Beatriz Teste Assistente');
  await expect(tabela).not.toContainText('Minha pergunta');
  await expect(tabela).not.toContainText('Resposta de teste');
  const c = await monitor.anexar('console-e-rede-professor');
  expect(c.inesperadas.filter((i) => i.tipo === 'pageerror' || /assistente-ia|prof-ia\.js|portal-assistente\.css|admin\/usuarios/.test(String(i.url || i.origem || '')))).toEqual([]);
});
