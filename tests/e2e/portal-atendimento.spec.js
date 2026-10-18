// =============================================================
// E2E · F6a — Atendimento, Ouvidoria, Regulamento e configurações.
// Índice §8.5 (F6a), §8.6 item 2, §9.1 · UX §6.12, §6.20, §7.10, §7.11, §7.22.
//
//   QA_PORT=4656 QA_WORKERS=2 QA_DATA=<AAAA-MM-DD>-F6a QA_FATIA=F6a \
//   PORTAL_MODULOS=routes/portal/atendimento.js,routes/portal/ouvidoria.js,routes/portal/configuracoes.js,routes/portal-professor.js,routes/portal/ia.js,routes/portal/documentos.js \
//   PORTAL_MODULOS_IGNORAR=<os 9 módulos da F0t> npx playwright test tests/e2e/portal-atendimento.spec.js
//
// Banco: só o mongod descartável do serve.mjs. Contas e dados semeados pelo
// próprio caso (domínio .invalid). Nada de dado inventado na tela: o que o
// caso confere veio do servidor.
// =============================================================
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  exigirMongo, criarPapeis, criarUsuario, entrarComToken, api, monitorarConsoleERede, esperar,
  confirmarNaTela, simularCliente, semearCurso, liberarCurso
} from './_portal.js';

const ATD = /^ATD-\d{4}-[2-9A-HJ-NP-Z]{6}$/;
const OUV = /^OUV-\d{4}-[2-9A-HJ-NP-Z]{6}$/;
const EAD = '/plataforma-ead/';

test.describe('F6a · atendimento, ouvidoria e regulamento', () => {
  test('jornada principal do aluno: abrir atendimento, ler a resposta da equipe, responder e encerrar', async ({ page, request }) => {
    await exigirMongo(request);
    const { aluno, admin } = await criarPapeis(request);
    const monitor = monitorarConsoleERede(page, { fatia: 'F6a' });
    await simularCliente(page);
    await entrarComToken(page, aluno.token);

    await page.goto(`${EAD}atendimentos.html`);
    await expect(page.getByRole('heading', { level: 1, name: /Seus atendimentos/ })).toBeVisible();
    await expect(page.locator('.pf-subnav__link[aria-current="page"]')).toHaveText('Seus atendimentos');
    await expect(page.getByText('Você ainda não abriu nenhum atendimento.')).toBeVisible();

    await page.getByRole('button', { name: 'Iniciar atendimento' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Iniciar atendimento' });
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: 'Abrir atendimento' }).click();
    await expect(dlg.locator('.pf-erro-campo').first()).toBeVisible(); // validação antes de enviar
    await dlg.getByLabel('Categoria').selectOption('secretaria');
    await dlg.getByLabel('Assunto').fill('Declaração de matrícula');
    await dlg.getByLabel('Mensagem').fill('Preciso de uma declaração de matrícula para apresentar no trabalho.');
    await dlg.getByRole('button', { name: 'Abrir atendimento' }).click();
    await expect(dlg).toBeHidden();

    await expect(page.locator('[data-at-conversa-titulo]')).toHaveText('Declaração de matrícula');
    // DMC_UI.codigo (F0b) põe o protocolo em .pf-codigo__valor ao lado do [Copiar];
    // sem o DMC_UI.codigo, atendimentos.js degrada para <span class="pf-at-codigo">.
    const protocolo = (await page.locator('.pf-at-meta .pf-codigo__valor, .pf-at-meta .pf-at-codigo').first().textContent()).trim();
    expect(protocolo).toMatch(ATD);
    await expect(page.getByText(`Atendimento ${protocolo} aberto.`)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`protocolo=${protocolo}`));

    // Resposta da coordenação (fila `coordenacao`): pela API real.
    const r = await api(request, admin.token).post(`/api/portal/professor/atendimentos/${protocolo}/mensagens`, { texto: 'Declaração emitida. Está disponível em Documentação.' });
    expect(r.status).toBe(201);

    await page.reload();
    await expect(page.getByText('Declaração emitida. Está disponível em Documentação.')).toBeVisible();
    await expect(page.locator('.pf-at-msg--equipe .pf-at-msg__autor')).toContainText('Equipe Complexo DMC');
    await expect(page.locator('.pf-at-meta')).toContainText('Respondido');
    await expect(page.locator('.pf-at-meta')).toContainText('Aguardando você');

    await page.getByLabel('Responder').fill('Recebi, obrigada.');
    await page.getByRole('button', { name: 'Enviar mensagem' }).click();
    await expect(page.getByText('Recebi, obrigada.')).toBeVisible();
    await expect(page.locator('.pf-at-meta')).toContainText('Aberto');

    await confirmarNaTela(page, () => page.getByRole('button', { name: 'Encerrar atendimento' }).click());
    await expect(page.getByRole('button', { name: 'Iniciar novo atendimento' })).toBeVisible();
    await expect(page.locator('.pf-at-meta')).toContainText('Encerrado');

    // Lista: o protocolo aparece com a situação; filtro "Encerrados".
    await page.getByRole('link', { name: '← Seus atendimentos' }).click();
    await expect(page.getByRole('link', { name: protocolo })).toBeVisible();
    await page.getByRole('button', { name: /Encerrados/ }).click();
    await expect(page.getByRole('link', { name: protocolo })).toBeVisible();
    await page.getByRole('button', { name: /Abertos/ }).click();
    await expect(page.getByText('Nenhum atendimento com estes filtros.')).toBeVisible();

    await monitor.verificar();
  });

  test('privacidade: tipo de pedido obrigatório e prazo de 15 dias calculado pelo servidor; ?novo=1 pré-preenche', async ({ page, request }) => {
    await exigirMongo(request);
    const aluno = await criarUsuario(request, { papel: 'aluno', rotulo: 'privacidade' });
    const monitor = monitorarConsoleERede(page, { fatia: 'F6a' });
    await simularCliente(page);
    await entrarComToken(page, aluno.token);
    await page.goto(`${EAD}atendimentos.html?novo=1&categoria=privacidade`);
    const dlg = page.getByRole('dialog', { name: 'Iniciar atendimento' });
    await expect(dlg.getByLabel('Categoria')).toHaveValue('privacidade');
    await expect(dlg.getByText('A coordenação responde em até 15 dias.')).toBeVisible();
    await dlg.getByLabel('Assunto').fill('Acesso aos meus dados');
    await dlg.getByLabel('Mensagem').fill('Quero receber uma cópia dos meus dados pessoais.');
    await dlg.getByRole('button', { name: 'Abrir atendimento' }).click();
    await expect(dlg.getByText('Escolha o tipo de pedido.')).toBeVisible();
    await dlg.getByLabel('Tipo de pedido').selectOption('acesso');
    await dlg.getByRole('button', { name: 'Abrir atendimento' }).click();
    await expect(page.locator('.pf-at-meta')).toContainText('Prazo de resposta');
    await expect(page.locator('.pf-at-meta')).toContainText('Acesso aos meus dados');
    await expect(page.getByText(/Resposta até \d{2}\/\d{2}\/\d{4}\./)).toBeVisible();
    await monitor.verificar();
  });

  test('IDOR: protocolo de outra pessoa → "Não encontramos este atendimento" (404 esperado)', async ({ page, request }) => {
    await exigirMongo(request);
    const dona = await criarUsuario(request, { papel: 'aluno', rotulo: 'dona' });
    const outra = await criarUsuario(request, { papel: 'aluno', rotulo: 'outra' });
    const criado = await api(request, dona.token).post('/api/portal/me/atendimentos', { categoria: 'tecnico', assunto: 'Acesso ao portal', mensagem: 'Não consigo abrir uma aula.' });
    expect(criado.status).toBe(201);
    const monitor = monitorarConsoleERede(page, { fatia: 'F6a' });
    esperar(page, { status: 404, url: `/api/portal/me/atendimentos/${criado.json.protocolo}` });
    await simularCliente(page);
    await entrarComToken(page, outra.token);
    await page.goto(`${EAD}atendimentos.html?protocolo=${criado.json.protocolo}`);
    await expect(page.getByText('Não encontramos este atendimento.')).toBeVisible();
    await expect(page.getByText('Acesso ao portal')).toHaveCount(0);
    await monitor.verificar();
  });

  test('ouvidoria: registrar manifestação com aviso de identidade fixo e ver a resposta assinada "Ouvidoria"', async ({ page, request }) => {
    await exigirMongo(request);
    const { aluno, admin } = await criarPapeis(request);
    const monitor = monitorarConsoleERede(page, { fatia: 'F6a' });
    await simularCliente(page);
    await entrarComToken(page, aluno.token);
    await page.goto(`${EAD}ouvidoria.html`);
    await expect(page.locator('.pf-subnav__link[aria-current="page"]')).toHaveText('Ouvidoria');
    await expect(page.getByText('Nenhuma manifestação registrada.')).toBeVisible();
    await expect(page.getByText('Sua identidade nunca é mostrada a professores.', { exact: false })).toBeVisible();
    await expect(page.getByText('Apurada só pela coordenação; não é encaminhada a professores.')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /resguardar/i })).toHaveCount(0);

    await page.getByRole('radio', { name: /Elogio/ }).check();
    await page.getByLabel('Assunto').fill('Atendimento da secretaria');
    await page.getByLabel('Mensagem').fill('A secretaria respondeu rápido e com clareza. Obrigada pelo cuidado.');
    await page.getByRole('button', { name: 'Registrar manifestação' }).click();
    const aviso = page.getByText(/Manifestação OUV-\d{4}-[2-9A-HJ-NP-Z]{6} registrada\./);
    await expect(aviso).toBeVisible();
    const ouv = (await aviso.textContent()).match(/OUV-\d{4}-[2-9A-HJ-NP-Z]{6}/)[0];
    expect(ouv).toMatch(OUV);
    await expect(page.getByRole('link', { name: ouv })).toBeVisible();

    const resp = await api(request, admin.token).post(`/api/portal/admin/ouvidoria/${ouv}/mensagens`, { texto: 'Obrigada pelo retorno. Repassamos à equipe.' });
    expect(resp.status).toBe(201);
    await page.getByRole('link', { name: ouv }).click();
    await expect(page.getByText('Obrigada pelo retorno. Repassamos à equipe.')).toBeVisible();
    await expect(page.locator('.pf-at-msg--equipe .pf-at-msg__autor')).toContainText('Ouvidoria');
    await expect(page.locator('.pf-at-meta')).toContainText('Respondido');
    await monitor.verificar();
  });

  test('ouvidoria: professor recebe só a versão saneada e envia parecer; denúncia não se encaminha (409)', async ({ request }) => {
    await exigirMongo(request);
    const { aluno, professor, admin } = await criarPapeis(request);
    const a = api(request, aluno.token);
    const elogio = await a.post('/api/portal/me/ouvidoria', { tipo: 'reclamacao', assunto: 'Correção atrasada', texto: 'A correção da atividade demorou mais do que o combinado no plano.' });
    const denuncia = await a.post('/api/portal/me/ouvidoria', { tipo: 'denuncia', assunto: 'Conduta inadequada', texto: 'Relato de conduta inadequada em um encontro ao vivo do curso.' });
    expect(elogio.status).toBe(201);
    const adm = api(request, admin.token);
    const den = await adm.post(`/api/portal/admin/ouvidoria/${denuncia.json.protocolo}/encaminhar`, { professorId: professor.id, observacao: 'Peço o seu parecer sobre o caso.' });
    expect(den.status).toBe(409);
    const enc = await adm.post(`/api/portal/admin/ouvidoria/${elogio.json.protocolo}/encaminhar`, { professorId: professor.id, observacao: 'Peço o seu parecer sobre o caso.' });
    expect(enc.status).toBe(201);
    const p = api(request, professor.token);
    const visao = await p.get(`/api/portal/professor/ouvidoria/${elogio.json.protocolo}`);
    expect(visao.status).toBe(200);
    expect(Object.keys(visao.json).sort()).toEqual(['assunto', 'criadoEm', 'curso', 'encaminhadaEm', 'meuParecer', 'observacao', 'protocolo', 'texto', 'tipo']);
    expect(JSON.stringify(visao.json)).not.toContain(aluno.email);
    expect(JSON.stringify(visao.json)).not.toContain(aluno.id);
    const par = await p.post(`/api/portal/professor/ouvidoria/${elogio.json.protocolo}/parecer`, { texto: 'O atraso ocorreu por ajuste no calendário; já regularizado.' });
    expect(par.status).toBe(201);
    const dup = await p.post(`/api/portal/professor/ouvidoria/${elogio.json.protocolo}/parecer`, { texto: 'Segundo parecer que não deve ser aceito.' });
    expect(dup.status).toBe(409);
    expect((await p.get(`/api/portal/professor/ouvidoria/${denuncia.json.protocolo}`)).status).toBe(404);
  });

  test('regulamento: índice, âncora r-<regulamentoId>-<trechoId> com foco no H3 e aviso de edição fora de vigor', async ({ page, request }) => {
    await exigirMongo(request);
    const { aluno, admin } = await criarPapeis(request);
    const monitor = monitorarConsoleERede(page, { fatia: 'F6a' });
    const adm = api(request, admin.token);
    const texto = [
      'Regulamento acadêmico de teste.',
      '# 1. Matrícula', 'A matrícula é registrada pela coordenação depois da confirmação do pagamento.',
      '# 2. Avaliação e nota mínima', 'A nota mínima para aprovação no módulo é 7, numa escala de 0 a 10.',
      '# 3. Frequência', 'Frequência mínima de 75% das aulas do módulo.'
    ].join('\n\n');
    const criado = await adm.post('/api/portal/admin/regulamentos', { escopo: 'geral', titulo: 'Regulamento acadêmico', texto });
    expect(criado.status).toBe(201);
    const pub = await adm.post(`/api/portal/admin/regulamentos/${criado.json.id}/publicar`, {});
    expect(pub.status).toBe(200);
    const leitura = await api(request, aluno.token).get('/api/portal/regulamento');
    const reg = leitura.json.itens.find((i) => i.id === criado.json.id);
    const freq = reg.trechos.find((t) => t.titulo === '3. Frequência');
    expect(freq.id).toMatch(/^e\d+-t\d{3}$/);

    await simularCliente(page);
    await entrarComToken(page, aluno.token);
    await page.goto(`${EAD}regulamento.html#r-${reg.id}-${freq.id}`);
    const h3 = page.locator(`#r-${reg.id}-${freq.id} h3`);
    await expect(h3).toHaveText('3. Frequência');
    await expect(h3).toBeFocused();
    await expect(page.getByRole('navigation', { name: 'Seções do regulamento' }).getByRole('link', { name: '2. Avaliação e nota mínima' })).toBeVisible();
    await expect(page.getByText('Frequência mínima de 75% das aulas do módulo.')).toBeVisible();
    await expect(page.locator('.pf-at-trecho h3', { hasText: '# ' })).toHaveCount(0);

    await page.goto(`${EAD}regulamento.html#r-${'0'.repeat(24)}-e9-t001`);
    await expect(page.getByText('O trecho citado era da edição 9, que não está mais em vigor. Abaixo, o texto em vigor.')).toBeVisible();
    await expect(page.locator('[data-reg-titulo]')).toBeFocused();
    await monitor.verificar();
  });

  test('backoffice (coordenação): fila, resposta pelo compositor e dados da instituição com motivo na alteração', async ({ page, request }) => {
    await exigirMongo(request);
    const { aluno, admin } = await criarPapeis(request);
    const curso = await semearCurso(request, { titulo: 'Curso F6a de teste' });
    await liberarCurso(request, aluno.id, curso.cursoId);
    const criado = await api(request, aluno.token).post('/api/portal/me/atendimentos', { categoria: 'financeiro', assunto: 'Segunda via do boleto', mensagem: 'Preciso da segunda via da parcela de outubro.' });
    expect(criado.status).toBe(201);
    const protocolo = criado.json.protocolo;
    await simularCliente(page);
    await entrarComToken(page, admin.token);

    await page.goto(`${EAD}professor.html#/atendimento`);
    await expect(page.getByRole('link', { name: protocolo })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('link', { name: protocolo }).click();
    await expect(page.locator('.pf-at-meta')).toContainText(aluno.nome);
    await page.getByLabel('Resposta ao aluno').fill('A segunda via foi registrada em Financeiro.');
    await page.getByRole('button', { name: 'Enviar resposta' }).click();
    await expect(page.getByText('A segunda via foi registrada em Financeiro.')).toBeVisible();
    const det = await api(request, aluno.token).get(`/api/portal/me/atendimentos/${protocolo}`);
    expect(det.json.status).toBe('respondido');

    await page.goto(`${EAD}professor.html#/configuracoes/instituicao`);
    await expect(page.getByText('Dados da instituição não cadastrados: a declaração anual de quitação fica indisponível.')).toBeVisible({ timeout: 15_000 });
    await page.getByLabel('Razão social').fill('Instituição de Teste Ltda');
    await page.getByLabel('CNPJ').fill('11222333000181');
    await page.getByRole('button', { name: 'Salvar dados da instituição' }).click();
    await expect(page.getByLabel('Motivo (fica registrado na auditoria)')).toBeVisible();
    await page.getByLabel('Razão social').fill('Instituição de Teste Renomeada Ltda');
    await page.getByRole('button', { name: 'Salvar dados da instituição' }).click();
    await expect(page.locator('.pf-erro-campo')).toContainText('motivo');
    await page.getByLabel('Motivo (fica registrado na auditoria)').fill('Alteração contratual registrada.');
    await page.getByRole('button', { name: 'Salvar dados da instituição' }).click();
    await expect(page.getByLabel('Razão social')).toHaveValue('Instituição de Teste Renomeada Ltda');
  });

  test('acessibilidade e layout das páginas da F6a: axe sem serious/critical e sem rolagem horizontal (2 temas, 1440 e 390)', async ({ browser, request }) => {
    await exigirMongo(request);
    const { aluno, admin } = await criarPapeis(request);
    const a = api(request, aluno.token);
    const atd = await a.post('/api/portal/me/atendimentos', { categoria: 'tecnico', assunto: 'Acesso ao vídeo', mensagem: 'O vídeo da aula 2 não carrega no celular.' });
    await api(request, admin.token).post(`/api/portal/professor/atendimentos/${atd.json.protocolo}/mensagens`, { texto: 'Atualize o aplicativo do navegador e tente de novo.' });
    await a.post('/api/portal/me/ouvidoria', { tipo: 'sugestao', assunto: 'Legendas nas aulas', texto: 'Seria útil ter legendas em todas as aulas gravadas.' });
    // Regulamento de CURSO próprio (não 'geral'): com fullyParallel, publicar outra edição
    // geral arquivaria a do caso "regulamento: índice, âncora…" no meio dele (âncora some).
    const curso = await semearCurso(request, { titulo: 'Curso F6a de acessibilidade' });
    await liberarCurso(request, aluno.id, curso.cursoId);
    const reg = await api(request, admin.token).post('/api/portal/admin/regulamentos', { escopo: curso.cursoId, titulo: 'Regulamento do curso', texto: '# 1. Matrícula\n\nRegistrada pela coordenação.\n\n# 2. Frequência\n\nMínimo de 75%.' });
    expect(reg.status).toBe(201);
    expect((await api(request, admin.token).post(`/api/portal/admin/regulamentos/${reg.json.id}/publicar`, {})).status).toBe(200);
    const urls = ['atendimentos.html', `atendimentos.html?protocolo=${atd.json.protocolo}`, 'ouvidoria.html', 'regulamento.html'];
    for (const tema of ['escuro', 'claro']) {
      for (const largura of [1440, 390]) {
        const ctx = await browser.newContext({ viewport: { width: largura, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
        const page = await ctx.newPage();
        await simularCliente(page);
        await entrarComToken(page, aluno.token, { 'dmc:tema': tema });
        for (const u of urls) {
          await page.goto(`${EAD}${u}`);
          await expect(page.locator('#conteudo [aria-busy="true"]:visible')).toHaveCount(0, { timeout: 10_000 });
          const r = await new AxeBuilder({ page }).include('#conteudo').analyze();
          const graves = r.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
          expect(graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), `${tema} ${largura} ${u}`).toEqual([]);
          const rolagem = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(rolagem, `rolagem horizontal em ${tema} ${largura} ${u}`).toBeLessThanOrEqual(0);
        }
        await ctx.close();
      }
    }
  });
});
