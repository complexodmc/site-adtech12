// =============================================================
// portal-shell.spec.js (F0s) — PORTAL-ACADEMICO.md §8.5, linha F0s, PARTE G0 (D-61).
//
// O que existe no G0: destino por papel, ?next= validado, guarda de papel do DMC_Portal,
// DMC_bootLogin com e-mail (com e sem sessão), modo restrito do lado do cliente (page.route,
// perfil.html por stub), shell sem rolagem horizontal de 320 a 1920 nos níveis 0 e 2 com
// menu, busca, sino e diálogo abertos, shell que degrada sem DMC_UI (§7.6), foco preso e
// devolvido em gaveta e diálogos, tour só por teclado, axe 0 serious/critical no shell nos
// dois temas em 1440 e 390, literais religados de portal.css iguais aos de tokens.css e o
// menu do backoffice desenhado a partir de `itens` (D-75). CPF, desvio do 2FA e modo
// restrito real ficam no portal-titular.spec.js (F0p, G1).
//
// Páginas de teste: modelo de §6.4 servido por page.route em /plataforma-ead/__qa-shell-*.html,
// com os arquivos REAIS do disco. Rotas /api/portal/* das fatias da fase 1 são simuladas por
// page.route quando o caso precisa de dado; sem simulação, o servidor responde 404 e o shell
// fica em silêncio (UX §10 item 7; tolerado pelo monitorarConsoleERede, D-73).
//
// Casos que dependem de entrega ainda pendente de outra fatia ficam "bloqueado" com o motivo
// (nunca verdes): passo 3/4 da F0b (destinoInicial, requireOrRedirect com next, D-63 nos boots
// legados, boot-index.js).
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as P from './_portal.js';

const QA_FATIA = process.env.QA_FATIA || null;
test.describe.configure({ mode: 'parallel' });
test.skip(!!QA_FATIA && QA_FATIA !== 'F0s', 'portal-shell.spec.js é da F0s');

const FATIA = 'F0s';
const LARGURAS = [320, 375, 390, 768, 1024, 1440, 1920];
const APP_JS = fs.readFileSync(path.join(P.EAD_DISCO, 'js', 'app.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(P.EAD_DISCO, 'index.html'), 'utf8');

// ---------------------------------------------------------------------------
// Entregas de outra fatia (a F0s só testa; a implementação é da F0b, §7.2–§7.3)
// ---------------------------------------------------------------------------
const F0B = {
  destinoInicial: /destinoInicial\s*\(/.test(APP_JS),
  validarNext: /validarNext\s*\(/.test(APP_JS),
  restritoLegado: /precisaTrocarSenha/.test(APP_JS),
  bootIndex: fs.existsSync(path.join(P.EAD_DISCO, 'js', 'portal', 'boot-index.js')) && /boot-index\.js/.test(INDEX_HTML)
};
function bloqueadoSem(condicao, motivo) {
  if (condicao) return;
  test.info().annotations.push({ type: 'bloqueado', description: motivo });
  test.skip(true, `bloqueado: ${motivo}`);
}

// ---------------------------------------------------------------------------
// Página de teste (modelo do <head> de §6.4) e boot
// ---------------------------------------------------------------------------
const CSS = ['../assets/css/tokens.css?v=1', '../assets/css/components.css?v=3', 'css/plataforma.css?v=dev', 'css/portal.css?v=dev'];
const NUCLEO = ['js/api-client.js', 'js/app.js', 'js/portal/ui.js', 'js/shell.js'];
const MAIN = `<a class="dmc-skip" href="#conteudo">Pular para o conteúdo</a>
<main id="conteudo" class="pf-main" tabindex="-1">
  <header class="pf-cabecalho">
    <p class="pf-cabecalho__contexto">Estudos</p>
    <h1 class="pf-cabecalho__titulo">Página de <em>teste</em> do shell</h1>
    <p class="pf-cabecalho__desc">Conteúdo mínimo para conferir o topo, o menu, a faixa, o sino, a conta e o rodapé.</p>
    <div class="pf-cabecalho__acoes"><a class="dmc-btn dmc-btn--primary" href="#conteudo">Ação principal</a><a class="dmc-btn dmc-btn--secondary" href="#conteudo">Ação secundária</a></div>
  </header>
  <p>Parágrafo de teste com texto comum para a régua de leitura da plataforma.</p>
  <dialog class="pf-dialogo pf-dialogo--m" id="qa-dialogo" aria-labelledby="qa-dialogo-titulo">
    <div class="pf-dialogo__cabeca"><h2 class="pf-dialogo__titulo" id="qa-dialogo-titulo" tabindex="-1">Apagar esta conversa de atendimento com um título bem comprido?</h2></div>
    <div class="pf-dialogo__corpo"><p>Doze alunos perdem o registro de conclusão. Esta frase é longa de propósito para conferir a quebra de linha no diálogo.</p></div>
    <div class="pf-dialogo__acoes"><button type="button" class="dmc-btn dmc-btn--secondary" data-pf-acao="cancelar">Cancelar</button><button type="button" class="dmc-btn dmc-btn--secondary pf-btn--perigo" data-pf-acao="confirmar">Apagar conversa</button></div>
  </dialog>
</main>`;

function htmlQa({ shell = 'inicio', ativo = null, corpo = MAIN, scripts = NUCLEO, fim = '', titulo = 'QA shell' } = {}) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<script src="js/portal/pre-pintura.js?v=dev"></script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0b0c0e">
<title>${titulo} · Plataforma Complexo DMC</title>
${CSS.map((h) => `<link rel="stylesheet" href="${h}">`).join('\n')}
</head>
<body data-shell="${shell}"${ativo ? ` data-shell-ativo="${ativo}"` : ''}>
${corpo}
${scripts.map((s) => `<script src="${s}?v=dev"></script>`).join('\n')}
${fim}
</body>
</html>`;
}
const STUB = (nome) => `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${nome}</title></head><body><p id="qa-stub">${nome} (stub do teste)</p></body></html>`;
/** Boot do DMC_Portal: marca o <body> quando o boot roda (o shell já foi montado antes dele). */
const bootPortal = (opcoes = '{}') => `<script>DMC_Portal.iniciar(function (ctx) { document.body.setAttribute('data-qa-boot', ctx.papel || '-'); }, ${opcoes});</script>`;

async function servir(page, nome, corpo) {
  await page.route((u) => u.pathname === `/plataforma-ead/${nome}`, (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: corpo }));
}
async function stubs(page, nomes) {
  for (const n of nomes) await servir(page, n, STUB(n));
}

/**
 * Simula rotas /api/portal/* (chave "MÉTODO /caminho" ou "/caminho" = GET). Sem chave → 404 como
 * o servidor de hoje. Devolve a lista de chamadas feitas pela página.
 */
async function rotearPortal(page, respostas = {}) {
  const chamadas = [];
  await page.route((u) => u.pathname.startsWith('/api/portal/'), async (rota) => {
    const req = rota.request();
    const u = new URL(req.url());
    chamadas.push({ metodo: req.method(), caminho: u.pathname.replace('/api/portal', ''), busca: u.search });
    const chave = Object.keys(respostas).find((k) => {
      const [m, c] = k.includes(' ') ? k.split(' ') : ['GET', k];
      return m === req.method() && u.pathname === `/api/portal${c}`;
    });
    if (!chave) return rota.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Rota não encontrada.' }) });
    const r = typeof respostas[chave] === 'function' ? await respostas[chave](u, req) : respostas[chave];
    return rota.fulfill({ status: (r && r.__status) || 200, contentType: 'application/json', body: JSON.stringify(r && r.__corpo !== undefined ? r.__corpo : r) });
  });
  return chamadas;
}

const NOTIFS = (n = 3) => ({
  naoLidas: n,
  itens: [
    { id: 'n1', tipo: 'avaliacao.corrigida', titulo: 'Avaliação corrigida', texto: 'A atividade modular do Módulo 03 foi corrigida.', link: 'academico.html', lida: false, criadaEm: new Date(Date.now() - 2 * 3600e3).toISOString() },
    { id: 'n2', tipo: 'documento.revisado', titulo: 'Documento revisado', texto: 'O documento DIP foi aprovado pela coordenação.', link: 'documentos.html', lida: false, criadaEm: new Date(Date.now() - 26 * 3600e3).toISOString() },
    { id: 'n3', tipo: 'publicacao.nova', titulo: 'Nova publicação', texto: null, link: null, lida: true, criadaEm: new Date(Date.now() - 5 * 86400e3).toISOString() }
  ]
});
const PENDENCIAS = {
  avisos: [{ id: 'contrato-pendente', tom: 'aviso', texto: 'Há um contrato aguardando sua assinatura.', href: 'contratos.html', rotulo: 'Assinar contrato', dispensavel: false, contador: 1 }],
  contadores: { contratosPendentes: 1, documentosPendentes: 0, documentosNaoEnviados: 2, lancamentosAtrasados: 0, perfilIncompleto: false, precisaTrocarSenha: false, emailNaoVerificado: false, segundoFatorObrigatorio: false, notificacoesNaoLidas: 3 }
};
const BUSCA = (u) => {
  const q = u.searchParams.get('q') || '';
  const tipos = (u.searchParams.get('tipos') || 'cursos,aulas,publicacoes,atendimentos,documentos').split(',');
  const grupos = {};
  if (tipos.includes('cursos')) grupos.cursos = { itens: [{ tipo: 'cursos', id: 'c1', titulo: `Administração patrimonial ${q} e sucessória com um título bem comprido para quebrar`, contexto: 'Curso', href: 'dashboard.html', bloqueado: false }], temMais: false };
  if (tipos.includes('aulas')) grupos.aulas = { itens: [{ tipo: 'aulas', id: 'a1', titulo: `Aula sobre ${q}`, contexto: 'Curso · Módulo 03', href: 'aula.html?id=a1', bloqueado: true }, { tipo: 'aulas', id: 'a2', titulo: `Outra aula ${q}`, contexto: 'Curso · Módulo 04', href: 'aula.html?id=a2', bloqueado: false }], temMais: true };
  return { q, grupos };
};

async function sessao(page, request, papel = 'aluno', extras = {}) {
  const u = await P.criarUsuario(request, { papel });
  await P.entrarComToken(page, u.token, extras);
  return u;
}
async function abrirQa(page, nome, html) {
  await servir(page, nome, html);
  await page.goto(`/plataforma-ead/${nome}`);
  await expect(page.locator('body')).toHaveAttribute('data-qa-boot', /.+/);
}

// ---------------------------------------------------------------------------
// Conferências reutilizadas
// ---------------------------------------------------------------------------
/** 0 rolagem horizontal e nenhum elemento visível do shell (ou diálogo) fora da janela. */
async function semRolagem(page, rotulo) {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const fora = [];
    const seletores = '.pf-topo, .pf-topo *, .pf-faixa, .pf-faixa *, .pf-lateral, .pf-gaveta__painel, .pf-gaveta__painel *, .pf-busca__caixa.is-dialogo *, .pf-busca__painel, .pf-busca__painel *, .pf-notificacoes, .pf-notificacoes *, .pf-conta__painel, .pf-conta__painel *, .pf-rodape, .pf-rodape *, .pf-tour, .pf-tour *, dialog[open], dialog[open] *, .pf-main > *';
    for (const el of document.querySelectorAll(seletores)) {
      if (el.closest('[hidden]') || el.closest('.dmc-sr-only')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'absolute' && cs.clip === 'rect(0px, 0px, 0px, 0px)') continue;
      const b = el.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) continue;
      if (b.left < -1 || b.right > vw + 1) fora.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')} [${Math.round(b.left)}, ${Math.round(b.right)}]`);
    }
    return { vw, sw, fora: fora.slice(0, 6) };
  });
  expect(r.sw, `${rotulo}: scrollWidth ${r.sw} > ${r.vw}`).toBeLessThanOrEqual(r.vw);
  expect(r.fora, `${rotulo}: elementos fora da janela`).toEqual([]);
}

async function axeGraves(page, rotulo) {
  // Espera as transições finitas (fade de painel, entrada de popover): o axe mediria a cor no meio do fade.
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect && a.effect.getComputedTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => null))));
  const r = await new AxeBuilder({ page }).analyze();
  const graves = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ regra: v.id, impacto: v.impact, nos: v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} — ${n.failureSummary.split('\n')[1] || ''}`) }));
  expect(graves, `${rotulo}: ${JSON.stringify(graves, null, 1)}`).toEqual([]);
}

// ===========================================================================
// 1 · Estático: literais religados de portal.css iguais aos de tokens.css (§2.2)
// ===========================================================================
test('estático · literais do escuro religados em portal.css = tokens.css', { tag: ['@F0s'] }, async () => {
  const semComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = semComentarios(fs.readFileSync(path.join(P.RAIZ, 'complexodmc.com.br', 'assets', 'css', 'tokens.css'), 'utf8'));
  const portal = semComentarios(fs.readFileSync(path.join(P.EAD_DISCO, 'css', 'portal.css'), 'utf8'));
  const valor = (css, nome) => {
    const m = css.match(new RegExp(`${nome.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+);`));
    return m ? m[1].trim().replace(/\s+/g, ' ').replace(/\b0\./g, '.') : null;
  };
  // bloco do escuro (camada 1): do primeiro ':root,' até o fechamento
  const ini = portal.indexOf(':root,\nhtml[data-pf-tema="escuro"]');
  const escuro = portal.slice(ini, portal.indexOf('}', ini));
  const pares = [
    ['--pf-texto-1', '--text-1'], ['--pf-texto-2', '--text-2'], ['--pf-texto-3', '--text-3'],
    ['--pf-linha', '--color-line'], ['--pf-linha-forte', '--color-line-strong'], ['--pf-acento-rgb', '--np-accent']
  ];
  for (const [pf, casa] of pares) {
    const a = valor(escuro, pf);
    const b = valor(tokens, casa);
    expect(a, `${pf} no escuro`).not.toBeNull();
    expect(a, `${pf} (portal.css) = ${casa} (tokens.css)`).toBe(b);
  }
  // A camada 2 religa os tokens da casa a partir dos --pf-* (sem ciclo).
  for (const [pf, casa] of pares) expect(portal).toMatch(new RegExp(`${casa.replace(/-/g, '\\-')}:\\s*var\\(${pf.replace(/-/g, '\\-')}\\)`));
});

// ===========================================================================
// 2 · Shell do aluno: anatomia, menu do papel, ativo, conta, rodapé
// ===========================================================================
test('aluno · topo, menu (Estudos, Secretaria, Ajuda), item ativo, Documentação, conta e rodapé', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mon = P.monitorarConsoleERede(page, { fatia: FATIA });
  const aluno = await sessao(page, request, 'aluno');
  await abrirQa(page, '__qa-shell-aluno.html', htmlQa({ shell: 'conteudos', fim: bootPortal() }));

  const topo = page.locator('header.pf-topo');
  await expect(topo).toHaveCount(1);
  await expect(topo).toHaveClass(/shell-top/); // apelido legado (portal-ui.spec da F0b)
  await expect(page.locator('body')).toHaveClass(/has-shell/);
  await expect(page.locator('html')).toHaveAttribute('data-pf-larg', 'x');
  await expect(topo.locator('.pf-marca')).toContainText('Plataforma');
  await expect(topo.locator('.pf-marca')).toHaveAttribute('href', 'dashboard.html');
  await expect(page.locator('[data-user-nome]').first()).toHaveText(aluno.nome);

  const nav = page.locator('.pf-lateral nav.pf-menu[aria-label="Menu principal"]');
  await expect(nav).toBeVisible();
  await expect(nav.locator('.pf-menu__titulo')).toHaveText(['Estudos', 'Secretaria', 'Ajuda']);
  await expect(nav.locator(':scope > .pf-menu__secao > .pf-menu__lista > li > .pf-menu__item .pf-menu__rotulo')).toHaveText([
    'Início', 'Meus cursos', 'Aulas ao vivo', 'Acadêmico', 'Publicações', 'Financeiro', 'Documentação', 'Atendimento', 'Tutoriais', 'Cursos disponíveis'
  ]);
  // alias legado conteudos → inicio
  await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('href', 'dashboard.html');
  // Documentação: submenu fechado, 4 links; abre e fecha
  const doc = nav.locator('button.pf-menu__grupo');
  await expect(doc).toHaveAttribute('aria-expanded', 'false');
  await doc.click();
  await expect(doc).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.locator('.pf-menu__sub a .pf-menu__rotulo')).toHaveText(['Documentos pessoais', 'Declarações e certificados', 'Contratos', 'Comprovantes']);
  expect(await nav.locator('.pf-menu__sub a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(['documentos.html', 'certificados.html', 'contratos.html', 'comprovantes.html']);
  // aluno não vê troca de área
  await expect(page.locator('.pf-lateral__rodape')).not.toContainText('Portal do professor');
  await expect(page.locator('.pf-lateral__rodape')).not.toContainText('Coordenação');

  // Conta: disclosure com perfil, meus dados, tour, sair
  const conta = page.locator('.pf-conta__botao');
  await expect(conta).toHaveAccessibleName(`Sua conta: ${aluno.nome}`);
  await conta.click();
  const painel = page.locator('#pf-conta-painel');
  await expect(painel).toBeVisible();
  await expect(painel.locator('.pf-conta__email')).toHaveText(aluno.email);
  await expect(painel.getByRole('link', { name: 'Meu perfil' })).toHaveAttribute('href', 'perfil.html');
  await expect(painel.getByRole('link', { name: 'Meus dados' })).toHaveAttribute('href', 'meus-dados.html');
  await expect(painel.getByRole('button', { name: 'Rever o tour' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(painel).toBeHidden();
  await expect(conta).toBeFocused();

  // Rodapé no fluxo, depois do <main>
  const rodape = page.locator('footer.pf-rodape');
  await expect(rodape).toHaveCount(1);
  expect(await page.evaluate(() => document.querySelector('main#conteudo').nextElementSibling.matches('footer.pf-rodape'))).toBe(true);
  await expect(rodape.getByRole('link')).toHaveText(['Política de privacidade', 'Meus dados', 'Encarregado de dados', 'Regulamento acadêmico', 'Tutoriais']);
  await mon.verificar();
});

test('aluno · item ativo de submenu abre Documentação; equipe vê a troca de área no rodapé da lateral', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await sessao(page, request, 'professor');
  await abrirQa(page, '__qa-shell-contratos.html', htmlQa({ shell: 'contratos', fim: bootPortal() }));
  const nav = page.locator('.pf-lateral .pf-menu');
  await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('href', 'contratos.html');
  await expect(nav.locator('button.pf-menu__grupo')).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.locator('button.pf-menu__grupo')).toHaveClass(/is-atual/);
  await expect(page.locator('.pf-lateral__rodape').getByRole('link', { name: 'Portal do professor' })).toHaveAttribute('href', 'professor.html#/inicio');
  await page.locator('.pf-conta__botao').click();
  await expect(page.locator('#pf-conta-painel').getByRole('link', { name: 'Portal do professor' })).toBeVisible();
});

// ===========================================================================
// 3 · Backoffice: menu desenhado a partir de `itens` (D-66, D-75)
// ===========================================================================
const ITENS_FALSOS = JSON.stringify([
  { rota: 'correcao', rotulo: 'Correção', grupo: 'ensino', icone: 'navCorrecao', ordem: 5, papeis: ['professor', 'admin'], contagemRotulo: 'a corrigir' },
  { rota: 'inicio', rotulo: 'Visão geral', grupo: null, icone: 'navVisaoGeral', ordem: 1, papeis: ['professor', 'admin'] },
  { rota: 'cursos', rotulo: 'Cursos', grupo: 'ensino', icone: 'navCursos', ordem: 2, papeis: ['professor', 'admin'] },
  { rota: 'conteudo', rotulo: 'Conteúdo', grupo: 'ensino', icone: 'navCursos', ordem: 3, papeis: ['professor', 'admin'], href: 'admin.html' },
  { rota: 'atendimento', rotulo: 'Atendimento', grupo: 'relacionamento', icone: 'navAtendimento', ordem: 10, papeis: ['professor', 'admin'] },
  { rota: 'equipe', rotulo: 'Equipe', grupo: 'gestao', icone: 'navEquipe', ordem: 20, papeis: ['admin'], href: 'professor.html#/equipe' }
]);

for (const forma of ['array', 'funcao']) {
  test(`backoffice · DMC_Portal.iniciar({ area:'backoffice', itens }) em ${forma} desenha grupos, ordem, hrefs, ativo e contagem`, { tag: ['@F0s'] }, async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const mon = P.monitorarConsoleERede(page, { fatia: FATIA });
    await sessao(page, request, 'admin');
    const itens = forma === 'array' ? ITENS_FALSOS : `function (c) { window.__qaItens = { papel: c.papel, temUser: !!c.user }; return ${ITENS_FALSOS}; }`;
    await abrirQa(page, `__qa-shell-bo-${forma}.html`, htmlQa({ shell: 'backoffice', ativo: 'cursos', fim: bootPortal(`{ area: 'backoffice', papeis: ['professor','admin'], itens: ${itens} }`) }));
    if (forma === 'funcao') expect(await page.evaluate(() => window.__qaItens)).toEqual({ papel: 'admin', temUser: true });

    await expect(page.locator('.pf-topo .pf-marca')).toContainText('Coordenação');
    await expect(page.locator('.pf-topo .pf-marca')).toHaveAttribute('href', 'professor.html#/inicio');
    const nav = page.locator('.pf-lateral .pf-menu');
    await expect(nav.locator('.pf-menu__titulo')).toHaveText(['Ensino', 'Relacionamento', 'Gestão']);
    await expect(nav.locator('.pf-menu__item .pf-menu__rotulo')).toHaveText(['Visão geral', 'Cursos', 'Conteúdo', 'Correção', 'Atendimento', 'Equipe']);
    expect(await nav.locator('a.pf-menu__item').evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(['#/inicio', '#/cursos', 'admin.html', '#/correcao', '#/atendimento', 'professor.html#/equipe']);
    await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('href', '#/cursos');
    // definirAtivo (roteador da F8) e definirContador (contagens do resumo)
    await page.evaluate(() => { window.DMC_Shell.definirAtivo('correcao'); window.DMC_Shell.definirContador('correcao', 4); });
    await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('href', '#/correcao');
    await expect(nav.locator('[data-pf-chave="correcao"] .pf-menu__contagem')).toBeVisible();
    await expect(nav.getByRole('link', { name: /^Correção\s*, 4 a corrigir$/ })).toBeVisible();
    await page.evaluate(() => window.DMC_Shell.definirContador('correcao', 0));
    await expect(nav.locator('[data-pf-chave="correcao"] .pf-menu__contagem')).toBeHidden();
    // rodapé do backoffice: Área do aluno · Ajuda · Recolher
    await expect(page.locator('.pf-lateral__rodape .pf-menu__rotulo')).toHaveText(['Área do aluno', 'Ajuda', 'Recolher menu']);
    // faixa no backoffice: só a novidade embutida, levando à Ajuda
    await expect(page.locator('.pf-faixa')).toBeVisible();
    await expect(page.locator('.pf-faixa .pf-faixa__link')).toHaveAttribute('href', 'professor.html#/ajuda');
    await mon.verificar();
  });
}

// ===========================================================================
// 4 · Guarda de papel do DMC_Portal com o shell real (§5.4)
// ===========================================================================
test('guarda · aluno em página da equipe vai ao dashboard com aviso; professor passa e recebe o shell do backoffice', { tag: ['@F0s'] }, async ({ page, request }) => {
  const { aluno, professor } = await P.criarPapeis(request);
  await stubs(page, ['dashboard.html', 'professor.html', 'login.html']);
  const html = htmlQa({ shell: 'backoffice', fim: bootPortal(`{ area: 'backoffice', papeis: ['professor','admin'], itens: ${ITENS_FALSOS} }`) });
  await servir(page, '__qa-shell-guarda.html', html);

  await P.entrarComToken(page, aluno.token);
  await page.goto('/plataforma-ead/__qa-shell-guarda.html');
  await page.waitForURL(/\/plataforma-ead\/dashboard\.html$/);
  expect(await page.evaluate(() => sessionStorage.getItem('dmc:aviso'))).toBe('Área restrita à equipe.');

  await P.entrarComToken(page, professor.token);
  await page.goto('/plataforma-ead/__qa-shell-guarda.html');
  await expect(page.locator('body')).toHaveAttribute('data-qa-boot', 'professor');
  await expect(page.locator('.pf-topo .pf-marca')).toContainText('Professor');
  await expect(page.locator('.pf-lateral .pf-menu__item').first()).toContainText('Visão geral');
});

// ===========================================================================
// 5 · Modo restrito do lado do cliente (D-51, D-63; page.route)
// ===========================================================================
async function meRestrito(page, papel = 'professor') {
  await page.route((u) => u.pathname === '/api/auth/me', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'u-qa-restrito', email: 'qa-restrito@exemplo.invalid', nome: 'Pessoa QA Restrita', iniciais: 'PQ', isAdmin: papel === 'admin', papel, precisaTrocarSenha: true } })
  }));
}

test('restrito · página nova leva a perfil.html#seguranca; no perfil o shell só tem marca, A−/A+, tema e Sair, sem nenhuma chamada', { tag: ['@F0s'] }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = [];
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/api/')) api.push(p); });
  await meRestrito(page);
  await P.entrarComToken(page, 'token-qa-restrito');
  await stubs(page, ['login.html', 'dashboard.html', 'professor.html']);
  await servir(page, '__qa-shell-restrito.html', htmlQa({ fim: bootPortal() }));
  await servir(page, 'perfil.html', htmlQa({ shell: 'perfil', fim: bootPortal() }));
  await page.goto('/plataforma-ead/__qa-shell-restrito.html');
  await page.waitForURL(/\/plataforma-ead\/perfil\.html#seguranca$/);
  await expect(page.locator('body')).toHaveAttribute('data-qa-boot', 'professor');
  await expect(page.locator('body')).toHaveClass(/pf-app--restrito/);
  const topo = page.locator('header.pf-topo');
  await expect(topo).toHaveClass(/pf-topo--restrito/);
  await expect(topo.locator('.pf-marca')).toBeVisible();
  await expect(topo.locator('a')).toHaveCount(0); // a marca não é link no modo restrito
  await expect(topo.getByRole('button', { name: 'Sair' })).toBeVisible();
  await expect(topo.getByRole('group', { name: 'Tamanho do texto' })).toBeVisible();
  await expect(topo.getByRole('button', { name: 'Ativar tema claro' })).toBeVisible();
  for (const s of ['.pf-lateral', '.pf-busca', '.pf-sino', '.pf-faixa', '.pf-conta__painel', '.pf-gaveta', '.pf-rodape']) await expect(page.locator(s), s).toHaveCount(0);
  // tema e A± continuam locais
  await topo.getByRole('button', { name: 'Ativar tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-pf-tema', 'claro');
  // nenhuma chamada além da validação da sessão (uma por página)
  await page.waitForTimeout(400);
  expect(api).toEqual(['/api/auth/me', '/api/auth/me']);
  // Sair apaga só o token e leva ao login
  await topo.getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL(/\/plataforma-ead\/login\.html$/);
  expect(await page.evaluate(() => localStorage.getItem('dmc:token'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('dmc:tema'))).toBe('claro');
});

test('restrito · página legada (dashboard.html) vai a perfil.html#seguranca sem catálogo, liberações nem progresso', { tag: ['@F0s'] }, async ({ page }) => {
  bloqueadoSem(F0B.restritoLegado, 'aguarda a F0b: modo restrito nos boots legados de app.js (D-63, §7.2)');
  const api = [];
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/api/')) api.push(p); });
  await meRestrito(page, 'aluno');
  await P.entrarComToken(page, 'token-qa-restrito');
  await stubs(page, ['perfil.html', 'login.html']);
  await page.goto('/plataforma-ead/dashboard.html');
  await page.waitForURL(/\/plataforma-ead\/perfil\.html#seguranca$/);
  expect(api.filter((p) => /^\/api\/(catalogo|liberacoes|progresso)/.test(p))).toEqual([]);
});

// ===========================================================================
// 5b · Sem sessão (G0-a, §8.6 item 3): obrigado.html é a única página da EAD que
// não vai ao login sem sessão. O shell não chama a API (toda rota do portal daria
// 401): só marca, A−/A+, tema e [Entrar], mais o rodapé estático. 0 resposta 4xx.
// ===========================================================================
test('sem sessão · obrigado.html: shell sem nenhuma chamada à API, [Entrar] com next, 0 resposta 4xx e 0 console.error', { tag: ['@F0s'] }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = [];
  const respostas4xx = [];
  const erros = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) api.push(`${r.method()} ${u.pathname}${u.search}`); });
  page.on('response', (r) => { if (r.status() >= 400) respostas4xx.push(`${r.status()} ${r.url()}`); });
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('pageerror', (e) => erros.push(`pageerror ${e.message}`));
  await P.entrarComToken(page, null); // sem dmc:token
  await stubs(page, ['login.html']);

  await page.goto('/plataforma-ead/obrigado.html');
  const topo = page.locator('header.pf-topo');
  await expect(topo).toHaveClass(/pf-topo--anonimo/);
  await expect(page).toHaveURL(/\/plataforma-ead\/obrigado\.html$/); // continua na página (como no HEAD)
  await expect(page.locator('body')).toHaveClass(/pf-app--anonimo/);
  await expect(page.locator('body')).not.toHaveClass(/pf-app--restrito/);
  const entrar = topo.getByRole('link', { name: 'Entrar' });
  await expect(entrar).toBeVisible();
  await expect(entrar).toHaveAttribute('href', 'login.html?next=obrigado.html');
  await expect(topo.getByRole('group', { name: 'Tamanho do texto' })).toBeVisible();
  await expect(topo.getByRole('button', { name: 'Ativar tema claro' })).toBeVisible();
  for (const s of ['.pf-lateral', '.pf-gaveta', '.pf-busca', '.pf-sino', '.pf-faixa', '.pf-conta', '[data-pf-shell-sair]', '.pf-topo__menu']) await expect(page.locator(s), s).toHaveCount(0);
  await expect(page.locator('.pf-rodape[data-pf-shell="rodape"]')).toBeVisible();
  await expect(page.locator('#obrigado-sem-pedido')).toBeVisible(); // o boot da página seguiu (F0b)

  // tema e A± continuam locais (sem rede)
  await topo.getByRole('button', { name: 'Ativar tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-pf-tema', 'claro');
  await topo.locator('[data-pf-shell-fonte="mais"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-pf-fonte', '1');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  for (const largura of [320, 390, 1920]) {
    await page.setViewportSize({ width: largura, height: 800 });
    await page.waitForTimeout(80);
    await semRolagem(page, `sem sessão ${largura}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await axeGraves(page, 'sem sessão 390 claro');

  // next preserva a query validada; Entrar leva ao login
  await page.goto('/plataforma-ead/obrigado.html?cursos=qa-inexistente');
  await expect(page.locator('.pf-topo--anonimo').getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', `login.html?next=${encodeURIComponent('obrigado.html?cursos=qa-inexistente')}`);
  await page.locator('.pf-topo--anonimo').getByRole('link', { name: 'Entrar' }).click();
  await page.waitForURL(/\/plataforma-ead\/login\.html\?next=obrigado\.html%3Fcursos%3Dqa-inexistente$/);

  expect(api, 'nenhuma chamada à API sem sessão').toEqual([]);
  expect(respostas4xx, '0 resposta 4xx').toEqual([]);
  expect(erros, '0 console.error').toEqual([]);
});

// ===========================================================================
// 6 · Sem DMC_UI o shell degrada (D-60, §7.6)
// ===========================================================================
test('degrada · sem ui.js o shell desenha topo e menu, sem busca, sino nem faixa, e não lança', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push(m.text()); });
  const portal = [];
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/api/portal/')) portal.push(p); });
  // Nome com marcação: o escape próprio mínimo (sem DMC_UI.html) precisa devolver texto.
  const aluno = await P.criarUsuario(request, { papel: 'aluno', nome: 'Pessoa <b>QA</b> & "aspas"' });
  await P.entrarComToken(page, aluno.token);
  const fim = `<script>window.DMC_init().then(function () { window.DMC_Shell.montar('meus-cursos'); document.body.setAttribute('data-qa-boot', 'legado'); });</script>`;
  await abrirQa(page, '__qa-shell-semui.html', htmlQa({ scripts: ['js/api-client.js', 'js/app.js', 'js/shell.js'], fim }));
  expect(await page.evaluate(() => typeof window.DMC_UI)).toBe('undefined');
  await expect(page.locator('header.pf-topo')).toBeVisible();
  await expect(page.locator('.pf-lateral a[aria-current="page"]')).toHaveAttribute('href', 'meus-cursos.html');
  for (const s of ['.pf-busca', '.pf-sino', '.pf-faixa']) await expect(page.locator(s), s).toHaveCount(0);
  await expect(page.locator('[data-user-nome]').first()).toHaveText(aluno.nome);
  // tema, A± e conta continuam (locais)
  await page.locator('.pf-topo').getByRole('button', { name: 'Ativar tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-pf-tema', 'claro');
  await page.locator('.pf-conta__botao').click();
  await expect(page.locator('#pf-conta-painel')).toBeVisible();
  await expect(page.locator('.pf-conta b, .pf-topo b:not(.pf-marca b)')).toHaveCount(0);
  await expect(page.locator('.pf-conta__botao')).toHaveAccessibleName('Sua conta: Pessoa <b>QA</b> & "aspas"');
  expect(portal).toEqual([]);
  expect(erros).toEqual([]);
});

// ===========================================================================
// 7 · Tema e tamanho do texto (§2.7, §2.8)
// ===========================================================================
test('aparência · tema alterna e persiste; A−/A+ vão de −1 a 2 com limite em aria-disabled e rótulo com o tamanho', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await sessao(page, request, 'aluno');
  await abrirQa(page, '__qa-shell-aparencia.html', htmlQa({ fim: bootPortal() }));
  await page.evaluate(() => { window.__ev = []; document.addEventListener('dmc:tema', (e) => window.__ev.push(['tema', e.detail.tema])); document.addEventListener('dmc:fonte', (e) => window.__ev.push(['fonte', e.detail.nivel])); });
  const topo = page.locator('.pf-topo');
  await topo.getByRole('button', { name: 'Ativar tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-pf-tema', 'claro');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f5f3ef');
  await expect(topo.getByRole('button', { name: 'Ativar tema escuro' })).toBeVisible();
  expect(await page.evaluate(() => window.DMC_Shell.tema.obter())).toBe('claro');

  const mais = topo.locator('.pf-topo__acoes > .pf-fonte [data-pf-shell-fonte="mais"]');
  const menos = topo.locator('.pf-topo__acoes > .pf-fonte [data-pf-shell-fonte="menos"]');
  await expect(mais).toHaveAttribute('aria-label', 'A+, aumentar texto, tamanho atual 100%');
  await mais.click(); await mais.click();
  await expect(page.locator('html')).toHaveAttribute('data-pf-fonte', '2');
  await expect(mais).toHaveAttribute('aria-disabled', 'true');
  await expect(mais).toHaveAttribute('aria-label', 'A+, tamanho máximo do texto, tamanho atual 125%');
  await mais.click({ force: true }); // no limite (aria-disabled): nada muda
  await expect(page.locator('html')).toHaveAttribute('data-pf-fonte', '2');
  // nível 2: a janela de 1440 vale 1152 → lateral (g)
  await expect(page.locator('html')).toHaveAttribute('data-pf-larg', 'g');
  for (let i = 0; i < 3; i++) await menos.click();
  await expect(page.locator('html')).toHaveAttribute('data-pf-fonte', '-1');
  await expect(menos).toHaveAttribute('aria-disabled', 'true');
  expect(await page.evaluate(() => window.__ev)).toEqual([['tema', 'claro'], ['fonte', 1], ['fonte', 2], ['fonte', 1], ['fonte', 0], ['fonte', -1]]);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-qa-boot', /.+/);
  await expect(page.locator('html')).toHaveAttribute('data-pf-tema', 'claro');
  await expect(page.locator('html')).toHaveAttribute('data-pf-fonte', '-1');
  // Perfil › conta < 1024: rádios Claro · Escuro · Automático
  await page.setViewportSize({ width: 900, height: 900 });
  await page.locator('.pf-conta__botao').click();
  await page.getByRole('radio', { name: 'Automático' }).check();
  expect(await page.evaluate(() => localStorage.getItem('dmc:tema'))).toBe('auto');
});

// ===========================================================================
// 8 · Faixa do topo (§5.2): pendência > novidade > banners; 404 = silêncio
// ===========================================================================
test('faixa · pendência não dispensável vence; menu ganha o aviso; ao sumir a pendência, novidade e banner se revezam por dispensa', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let comPendencia = true;
  await rotearPortal(page, {
    '/me/pendencias': () => (comPendencia ? PENDENCIAS : { avisos: [], contadores: {} }),
    '/banners': { itens: [{ id: 'b1', titulo: 'Inscrições abertas', texto: 'As inscrições para a turma de novembro estão abertas até o dia 30, com vagas limitadas pela coordenação acadêmica do curso.', link: 'loja.html', imagemUrl: null, local: 'topo' }] }
  });
  await sessao(page, request, 'aluno');
  await abrirQa(page, '__qa-shell-faixa.html', htmlQa({ fim: bootPortal() }));
  const faixa = page.locator('.pf-faixa');
  await expect(faixa).toHaveClass(/pf-faixa--pendencia/);
  await expect(faixa).toContainText('Há um contrato aguardando sua assinatura.');
  await expect(faixa.getByRole('link', { name: 'Assinar contrato' })).toHaveAttribute('href', 'contratos.html');
  await expect(faixa.getByRole('button', { name: 'Dispensar aviso' })).toHaveCount(0);
  // menu: triângulo em Contratos e Documentos; Documentação herda
  const nav = page.locator('.pf-lateral .pf-menu');
  await expect(nav.locator('button.pf-menu__grupo .pf-menu__ponto')).toBeVisible();
  await expect(nav.getByRole('button', { name: /^Documentação\s*, com pendência$/ })).toBeVisible();
  // deslocamento: lateral começa abaixo de topo + faixa
  const medidas = await page.evaluate(() => ({
    faixa: document.querySelector('.pf-faixa').getBoundingClientRect().height,
    var: getComputedStyle(document.documentElement).getPropertyValue('--pf-faixa-h').trim(),
    lateralTopo: document.querySelector('.pf-lateral').getBoundingClientRect().top,
    topo: document.querySelector('.pf-topo').getBoundingClientRect().height
  }));
  expect(medidas.var).toBe(`${Math.ceil(medidas.faixa)}px`);
  expect(Math.abs(medidas.lateralTopo - (medidas.topo + medidas.faixa))).toBeLessThan(2);

  // sem pendência: novidade embutida (dispensável) e, depois de dispensada, o banner
  comPendencia = false;
  await page.evaluate(() => window.DMC_Shell.banner.atualizar());
  await expect(faixa).toHaveClass(/pf-faixa--novidade/);
  await expect(faixa.getByRole('link')).toHaveAttribute('href', 'tutoriais.html#novo-portal');
  await faixa.getByRole('button', { name: 'Dispensar aviso' }).click();
  expect(await page.evaluate(() => localStorage.getItem('dmc:banner:novo-portal:dispensado'))).toBe('1');
  await expect(faixa.getByRole('link')).toHaveAttribute('href', 'loja.html');
  const texto = (await faixa.locator('.pf-faixa__texto').innerText()).trim();
  expect(texto.length).toBeLessThanOrEqual(90);
  expect(texto.endsWith('…')).toBe(true);
  await faixa.getByRole('button', { name: 'Dispensar aviso' }).click();
  await expect(faixa).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pf-faixa-h').trim())).toBe('0px');
});

test('faixa · com todas as rotas ausentes (404) só a novidade aparece e nada vai ao console além do tolerado', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mon = P.monitorarConsoleERede(page, { fatia: FATIA });
  await sessao(page, request, 'aluno');
  await abrirQa(page, '__qa-shell-404.html', htmlQa({ fim: bootPortal() }));
  await expect(page.locator('.pf-faixa')).toHaveClass(/pf-faixa--novidade/);
  await expect(page.locator('.pf-sino__contador')).toBeHidden();
  await expect(page.locator('.pf-sino')).toHaveAttribute('aria-label', 'Notificações');
  await mon.verificar();
});

// ===========================================================================
// 9 · Sino (§5.2)
// ===========================================================================
test('sino · contador neutro (3 e 9+), painel com foco no título, marcar todas e abrir notificação marcam como lidas', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let naoLidas = 12;
  const chamadas = await rotearPortal(page, {
    '/me/notificacoes/resumo': () => ({ naoLidas }),
    '/me/notificacoes': () => NOTIFS(naoLidas),
    'POST /me/notificacoes/lidas': () => { naoLidas = 0; return { ok: true, marcadas: 2 }; },
    'POST /me/notificacoes/n1/lida': { ok: true }
  });
  await stubs(page, ['academico.html']);
  await sessao(page, request, 'aluno');
  await abrirQa(page, '__qa-shell-sino.html', htmlQa({ fim: bootPortal() }));
  const sino = page.locator('.pf-sino');
  // WCAG 2.5.3 (axe label-content-name-mismatch): o nome acessível contém o número visível.
  const nomeDivergente = async () => (await new AxeBuilder({ page }).include('.pf-sino')
    .withRules(['label-content-name-mismatch']).analyze()).violations.map((v) => v.id);
  await expect(sino.locator('.pf-sino__contador')).toHaveText('9+');
  await expect(sino).toHaveAttribute('aria-label', 'Notificações, mais de 9 não lidas');
  expect(await nomeDivergente(), 'sino com 9+').toEqual([]);
  naoLidas = 3;
  expect(await page.evaluate(() => window.DMC_Shell.notificacoes.atualizar())).toBe(3);
  await expect(sino.locator('.pf-sino__contador')).toHaveText('3');
  await expect(sino).toHaveAttribute('aria-label', 'Notificações, 3 não lidas');
  expect(await nomeDivergente(), 'sino com 3').toEqual([]);

  await sino.click();
  const painel = page.locator('#pf-notificacoes');
  await expect(painel).toBeVisible();
  await expect(painel).toHaveAttribute('role', 'dialog');
  await expect(page.locator('#pf-notificacoes-titulo')).toBeFocused();
  await expect(painel.locator('.pf-notificacao')).toHaveCount(3);
  await expect(painel.locator('.pf-notificacao--nao-lida')).toHaveCount(2);
  await expect(painel.getByRole('link', { name: /^Avaliação corrigida\s*, não lida/ })).toBeVisible();
  await expect(painel.getByRole('link', { name: 'Ver todas as notificações' })).toHaveAttribute('href', 'notificacoes.html');
  await page.keyboard.press('Escape');
  await expect(painel).toBeHidden();
  await expect(sino).toBeFocused();

  await sino.click();
  await painel.getByRole('button', { name: 'Marcar todas como lidas' }).click();
  await expect(painel.locator('.pf-notificacoes__status')).toHaveText('Notificações marcadas como lidas.');
  await expect(sino.locator('.pf-sino__contador')).toBeHidden();
  naoLidas = 2;
  await painel.locator('.pf-notificacoes__corpo').evaluate(() => {});
  await page.evaluate(() => window.DMC_Shell.notificacoes.fechar());
  await page.evaluate(() => window.DMC_Shell.notificacoes.abrir());
  await painel.getByRole('link', { name: /Avaliação corrigida/ }).click();
  await page.waitForURL(/\/plataforma-ead\/academico\.html$/);
  expect(chamadas.filter((c) => c.metodo === 'POST').map((c) => c.caminho)).toEqual(['/me/notificacoes/lidas', '/me/notificacoes/n1/lida']);
});

// ===========================================================================
// 10 · Busca global (§5.2; combobox ARIA 1.2)
// ===========================================================================
test('busca · Ctrl K, 2 caracteres, grupos, ↓/Enter por aria-activedescendant, filtro por tipo, Esc fecha e limpa', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const chamadas = await rotearPortal(page, { '/busca': BUSCA });
  await stubs(page, ['aula.html']);
  await sessao(page, request, 'aluno');
  await abrirQa(page, '__qa-shell-busca.html', htmlQa({ fim: bootPortal() }));
  const campo = page.getByRole('combobox', { name: 'Buscar na plataforma' });
  await page.keyboard.press('Control+k');
  await expect(campo).toBeFocused();
  await campo.pressSequentially('a');
  await page.waitForTimeout(400);
  expect(chamadas.filter((c) => c.caminho === '/busca')).toEqual([]);
  await campo.pressSequentially('d');
  await expect(campo).toHaveAttribute('aria-expanded', 'true');
  const lista = page.getByRole('listbox', { name: 'Resultados da busca' });
  await expect(lista.getByRole('group')).toHaveCount(2);
  await expect(lista.getByRole('option')).toHaveCount(4); // 1 curso + 2 aulas + "Ver todos"
  await expect(page.locator('.pf-busca__status')).toHaveText('3 resultados');
  await expect(lista.locator('mark').first()).toHaveText('Ad'); // marca preserva a caixa do título
  await expect(lista.getByRole('option', { name: /Aula sobre ad.*curso não liberado/ })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const ativa = await campo.getAttribute('aria-activedescendant');
  await expect(page.locator(`#${ativa}`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`#${ativa}`)).toContainText('Aula sobre ad');
  // filtro Aulas (aria-pressed) refaz a busca com tipos=aulas
  await page.locator('[data-pf-busca-tipo="aulas"]').click();
  await expect(page.locator('[data-pf-busca-tipo="aulas"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(lista.getByRole('group')).toHaveCount(1);
  expect(chamadas.filter((c) => c.caminho === '/busca').map((c) => new URLSearchParams(c.busca).get('tipos'))).toEqual([null, 'aulas']);
  // ver todos → busca.html com q e tipo
  await expect(lista.getByRole('option', { name: 'Ver todos os resultados de Aulas' })).toBeVisible();
  await campo.focus();
  await page.keyboard.press('Escape');
  await expect(campo).toHaveValue('');
  await expect(campo).toHaveAttribute('aria-expanded', 'false');
  // Enter numa opção segue o href do servidor
  await campo.pressSequentially('ad');
  await expect(lista.getByRole('option')).toHaveCount(3);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/plataforma-ead\/aula\.html\?id=a2$/);
});

test('busca · sem a rota da F0t (404), página legada com catálogo cai na busca local de cursos e aulas', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const aluno = await sessao(page, request, 'aluno');
  const curso = await P.semearCurso(request, { titulo: `Curso QA Zéfiro ${P.uid('x').slice(-4)}`, aulas: [{ titulo: 'Aula zefiro um' }, { titulo: 'Aula outra' }] });
  await P.liberarCurso(request, aluno.id, curso.cursoId);
  await page.goto('/plataforma-ead/meus-cursos.html');
  await expect(page.locator('header.pf-topo')).toBeVisible();
  const campo = page.getByRole('combobox', { name: 'Buscar na plataforma' });
  await campo.click();
  await campo.pressSequentially('zefiro');
  const lista = page.getByRole('listbox', { name: 'Resultados da busca' });
  await expect(lista.getByRole('option', { name: curso.titulo, exact: true })).toBeVisible();
  await expect(lista.getByRole('option', { name: /Aula zefiro um/ })).toBeVisible();
  await lista.getByRole('option', { name: /Aula zefiro um/ }).click();
  // aula.html?id= é o endereço legado; o player novo (F1b) pode reescrevê-lo para ?curso=&modulo=&item=aula:<id>
  await page.waitForURL(new RegExp(`/plataforma-ead/aula\\.html\\?(id=${curso.aulas[0].id}$|.*item=aula%3A${curso.aulas[0].id})`));
});

// ===========================================================================
// 11 · Gaveta, diálogo da busca e painéis: foco preso e devolvido (§5.6, §11)
// ===========================================================================
test('foco · gaveta (390) prende o foco, Esc e véu fecham e devolvem ao botão Menu; busca em tela cheia idem', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await rotearPortal(page, { '/busca': BUSCA });
  await sessao(page, request, 'professor');
  await abrirQa(page, '__qa-shell-gaveta.html', htmlQa({ shell: 'academico', fim: bootPortal() }));
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await expect(page.locator('.pf-lateral')).toBeHidden();
  await menu.click();
  const gaveta = page.getByRole('dialog', { name: 'Menu' });
  await expect(gaveta).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('html')).toHaveClass(/dmc-lock/);
  await expect(gaveta.locator('a[aria-current="page"]')).toBeFocused(); // Acadêmico, no grupo aberto
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#pf-gaveta-painel')), `Tab ${i}`).toBe(true);
  }
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#pf-gaveta-painel'))).toBe(true);
  }
  // grupo em sanfona e troca de área no rodapé da gaveta
  await expect(gaveta.getByRole('button', { name: 'Secretaria' })).toHaveAttribute('aria-expanded', 'false');
  await gaveta.getByRole('button', { name: 'Secretaria' }).click();
  await expect(gaveta.getByRole('link', { name: 'Financeiro' })).toBeVisible();
  await expect(gaveta.getByRole('link', { name: 'Portal do professor' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(gaveta).toBeHidden();
  await expect(menu).toBeFocused();
  await expect(page.locator('html')).not.toHaveClass(/dmc-lock/);
  // véu fecha
  await menu.click();
  await expect(gaveta).toBeVisible();
  await page.mouse.click(380, 400);
  await expect(gaveta).toBeHidden();

  // busca em tela cheia
  const abrir = page.getByRole('button', { name: 'Buscar' });
  await abrir.click();
  const dialogo = page.getByRole('dialog', { name: 'Buscar' });
  await expect(dialogo).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Buscar na plataforma' })).toBeFocused();
  await page.keyboard.type('ad');
  await expect(dialogo.getByRole('listbox', { name: 'Resultados da busca' }).getByRole('option').first()).toBeVisible();
  await expect(dialogo.getByRole('combobox', { name: 'Mostrar' })).toBeVisible(); // filtro vira select < 768
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('.pf-busca__caixa'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(abrir).toBeFocused();
});

test('foco · conta e sino fecham com Esc, clique fora e saída do foco, devolvendo o foco ao botão', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await rotearPortal(page, { '/me/notificacoes/resumo': { naoLidas: 1 }, '/me/notificacoes': NOTIFS(1) });
  await sessao(page, request, 'aluno');
  await abrirQa(page, '__qa-shell-paineis.html', htmlQa({ fim: bootPortal() }));
  const conta = page.locator('.pf-conta__botao');
  await conta.focus();
  await page.keyboard.press('Enter');
  await expect(conta).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Meu perfil' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(conta).toHaveAttribute('aria-expanded', 'false');
  await expect(conta).toBeFocused();
  // clique fora
  await conta.click();
  await page.mouse.click(700, 600);
  await expect(page.locator('#pf-conta-painel')).toBeHidden();
  // sino → conta: um painel por vez
  await page.locator('.pf-sino').click();
  await expect(page.locator('#pf-notificacoes')).toBeVisible();
  await conta.click();
  await expect(page.locator('#pf-notificacoes')).toBeHidden();
  await expect(page.locator('#pf-conta-painel')).toBeVisible();
});

// ===========================================================================
// 12 · Lateral recolhida: dica, flyout e preferência (§5.1, §5.5)
// ===========================================================================
test('lateral · recolher grava a preferência, dica no foco, flyout de Documentação com Esc; 1024–1279 nasce recolhida', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await sessao(page, request, 'aluno');
  await abrirQa(page, '__qa-shell-recolher.html', htmlQa({ fim: bootPortal() }));
  const lateral = page.locator('.pf-lateral');
  expect((await lateral.boundingBox()).width).toBe(264);
  await page.getByRole('button', { name: 'Recolher menu' }).click();
  await expect(page.locator('body')).toHaveClass(/menu-recolhido/);
  expect((await lateral.boundingBox()).width).toBe(72);
  expect(await page.evaluate(() => localStorage.getItem('dmc:menuRecolhido'))).toBe('1');
  // deslocamento do conteúdo acompanha
  expect(Math.round((await page.locator('main#conteudo').boundingBox()).x)).toBe(72);
  // dica no foco (nome acessível continua o rótulo)
  const academico = lateral.getByRole('link', { name: 'Acadêmico' });
  await page.mouse.move(900, 500); // o ponteiro sai da lateral (o mouseleave não pode esconder a dica do foco)
  await academico.focus();
  await expect(page.locator('#pf-dica')).toBeVisible();
  await expect(page.locator('#pf-dica')).toHaveText('Acadêmico');
  await expect(academico).toHaveAttribute('aria-describedby', 'pf-dica');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pf-dica')).toBeHidden();
  // flyout
  const doc = lateral.getByRole('button', { name: 'Documentação' });
  await doc.focus();
  await page.keyboard.press('Enter');
  const sub = page.locator('.pf-menu__sub.is-flyout');
  await expect(sub).toBeVisible();
  await expect(sub.getByRole('link', { name: 'Documentos pessoais' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sub).toHaveCount(0);
  await expect(doc).toBeFocused();
  await expect(doc).toHaveAttribute('aria-expanded', 'false');
  // preferência persiste
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/menu-recolhido/);
  // sem preferência, 1024–1279 nasce recolhida e ≥ 1280 aberta
  await page.evaluate(() => localStorage.removeItem('dmc:menuRecolhido'));
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/menu-recolhido/);
  await page.setViewportSize({ width: 1300, height: 800 });
  await expect(page.locator('body')).not.toHaveClass(/menu-recolhido/);
});

// ===========================================================================
// 13 · Tour só por teclado (§5.7)
// ===========================================================================
test('tour · Rever o tour pela conta, 5 passos só com teclado, foco no título, Concluir devolve o foco ao main e grava visto', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const aluno = await sessao(page, request, 'aluno');
  await abrirQa(page, '__qa-shell-tour.html', htmlQa({ fim: bootPortal() }));
  expect(await page.evaluate(() => window.DMC_Shell.tour.jaVisto())).toBe(false);
  await page.locator('.pf-conta__botao').focus();
  await page.keyboard.press('Enter');
  let achou = false;
  for (let i = 0; i < 12 && !achou; i++) {
    await page.keyboard.press('Tab');
    achou = await page.evaluate(() => document.activeElement && document.activeElement.textContent.trim() === 'Rever o tour');
  }
  expect(achou).toBe(true);
  await page.keyboard.press('Enter');
  const tour = page.getByRole('dialog', { name: 'Menu' }).and(page.locator('.pf-tour'));
  await expect(tour).toBeVisible();
  const titulos = [];
  for (let passo = 1; passo <= 5; passo++) {
    await expect(page.locator('.pf-tour__passo')).toHaveText(`Passo ${passo} de 5`);
    await expect(page.locator('#pf-tour-titulo')).toBeFocused();
    titulos.push((await page.locator('#pf-tour-titulo').innerText()).trim());
    expect(await page.locator('.pf-tour__alvo').count()).toBe(1);
    // Tab até o botão de avançar e Enter
    const rotulo = passo === 5 ? 'Concluir' : 'Próximo';
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) {
      await page.keyboard.press('Tab');
      ok = await page.evaluate((r) => document.activeElement.textContent.trim() === r, rotulo);
    }
    expect(ok, `passo ${passo}: ${rotulo} alcançável por Tab`).toBe(true);
    await page.keyboard.press('Enter');
  }
  expect(titulos).toEqual(['Menu', 'Busca', 'Notificações', 'Tema e texto', 'Tutoriais']);
  await expect(page.locator('.pf-tour')).toHaveCount(0);
  await expect(page.locator('.pf-tour__alvo')).toHaveCount(0);
  await expect(page.locator('main#conteudo')).toBeFocused();
  expect(await page.evaluate((id) => localStorage.getItem(`dmc:tour:primeiro-acesso:${id}`), aluno.id)).toBe('1');
  // automático não repete; Esc pula
  await page.evaluate(() => window.DMC_Shell.tour.iniciar('primeiro-acesso', { automatico: true }));
  await expect(page.locator('.pf-tour')).toHaveCount(0);
  await page.evaluate(() => { window.DMC_Shell.tour.iniciar('outro-guia'); });
  await expect(page.locator('.pf-tour')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pf-tour')).toHaveCount(0);
});

test('tour · automático não dispara com contrato pendente', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await rotearPortal(page, { '/me/pendencias': PENDENCIAS });
  await sessao(page, request, 'aluno');
  await abrirQa(page, '__qa-shell-tour-pend.html', htmlQa({ fim: bootPortal() }));
  await page.evaluate(() => window.DMC_Shell.tour.iniciar('primeiro-acesso', { automatico: true }));
  await expect(page.locator('.pf-tour')).toHaveCount(0);
  expect(await page.evaluate(() => window.DMC_Shell.tour.jaVisto())).toBe(false);
});

// ===========================================================================
// 14 · Sem rolagem horizontal de 320 a 1920, níveis 0 e 2, com menu, busca, sino,
//      conta e diálogo abertos (§8.5 F0s; UX §2.8, §4.13)
// ===========================================================================
async function abrirBuscaComTermo(page) {
  if (await page.locator('.pf-busca__abrir').isVisible()) await page.locator('.pf-busca__abrir').click();
  else await page.locator('.pf-busca__campo').click();
  await page.keyboard.type('ad');
  await expect(page.locator('#pf-busca-lista [role="option"]').first()).toBeVisible();
}

for (const nivel of [0, 2]) {
  test(`rolagem · 320 a 1920 no nível ${nivel} de texto: fechado, menu, busca, sino, conta e diálogo abertos`, { tag: ['@F0s'] }, async ({ page, request }) => {
    test.setTimeout(240_000);
    await rotearPortal(page, { '/busca': BUSCA, '/me/notificacoes/resumo': { naoLidas: 12 }, '/me/notificacoes': NOTIFS(12), '/me/pendencias': PENDENCIAS });
    await sessao(page, request, 'professor', { 'dmc:fonte': String(nivel) });
    await servir(page, '__qa-shell-rolagem.html', htmlQa({ shell: 'contratos', fim: bootPortal() }));
    for (const largura of LARGURAS) {
      const r = `${largura}px, nível ${nivel}`;
      await page.setViewportSize({ width: largura, height: 800 });
      await page.goto('/plataforma-ead/__qa-shell-rolagem.html');
      await expect(page.locator('body')).toHaveAttribute('data-qa-boot', /.+/);
      await expect(page.locator('.pf-faixa')).toHaveClass(/pf-faixa--pendencia/);
      await semRolagem(page, `${r} · fechado`);
      if (await page.locator('.pf-topo__menu').isVisible()) {
        await page.locator('.pf-topo__menu').click();
        await expect(page.locator('.pf-gaveta')).toHaveClass(/is-aberta/);
        const fechados = page.locator('.pf-gaveta .pf-menu__titulo--botao[aria-expanded="false"]');
        while (await fechados.count()) await fechados.first().click();
        await semRolagem(page, `${r} · gaveta com todos os grupos abertos`);
        await page.keyboard.press('Escape');
        await expect(page.locator('.pf-gaveta')).toBeHidden();
      }
      await abrirBuscaComTermo(page);
      await semRolagem(page, `${r} · busca`);
      await page.keyboard.press('Escape');
      await page.locator('.pf-sino').click();
      await expect(page.locator('.pf-notificacao').first()).toBeVisible();
      await semRolagem(page, `${r} · sino`);
      await page.keyboard.press('Escape');
      await page.locator('.pf-conta__botao').click();
      await expect(page.locator('#pf-conta-painel')).toBeVisible();
      await semRolagem(page, `${r} · conta`);
      await page.keyboard.press('Escape');
      await page.evaluate(() => document.getElementById('qa-dialogo').showModal());
      await semRolagem(page, `${r} · diálogo`);
      await page.keyboard.press('Escape');
      // alvos do topo de 44 px (fixos) abaixo de 1024
      if (largura < 1024) {
        const pequenos = await page.evaluate(() => [...document.querySelectorAll('.pf-topo button, .pf-topo a')]
          .filter((e) => e.getClientRects().length && !e.closest('[hidden]') && !e.closest('.pf-popover'))
          .map((e) => ({ c: e.className, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height }))
          .filter((b) => b.w < 43.5 || b.h < 43.5));
        expect(pequenos, `${r}: alvos < 44 px no topo`).toEqual([]);
      }
    }
  });
}

// ===========================================================================
// 15 · axe 0 serious/critical no shell, nos dois temas, 1440 e 390
// ===========================================================================
for (const tema of ['escuro', 'claro']) {
  for (const largura of [1440, 390]) {
    test(`axe · shell no tema ${tema} em ${largura}: fechado, ${largura < 1024 ? 'gaveta' : 'lateral recolhida'}, conta, sino, busca e tour`, { tag: ['@F0s'] }, async ({ page, request }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: largura, height: largura < 1024 ? 844 : 900 });
      await rotearPortal(page, { '/busca': BUSCA, '/me/notificacoes/resumo': { naoLidas: 12 }, '/me/notificacoes': NOTIFS(12), '/me/pendencias': PENDENCIAS });
      await sessao(page, request, 'professor', { 'dmc:tema': tema });
      await abrirQa(page, `__qa-shell-axe-${tema}-${largura}.html`, htmlQa({ shell: 'contratos', fim: bootPortal() }));
      await expect(page.locator('html')).toHaveAttribute('data-pf-tema', tema);
      await expect(page.locator('.pf-sino__contador')).toHaveText('9+'); // dado real com mais de 9 (2.5.3)
      await axeGraves(page, 'fechado');
      if (largura < 1024) {
        await page.locator('.pf-topo__menu').click();
        await expect(page.locator('.pf-gaveta')).toHaveClass(/is-aberta/);
        await axeGraves(page, 'gaveta aberta');
        await page.keyboard.press('Escape');
      } else {
        await page.getByRole('button', { name: 'Recolher menu' }).click();
        await page.locator('.pf-lateral').getByRole('link', { name: 'Acadêmico' }).focus();
        await axeGraves(page, 'lateral recolhida com dica');
        await page.getByRole('button', { name: 'Expandir menu' }).click();
      }
      await page.locator('.pf-conta__botao').click();
      await axeGraves(page, 'conta aberta');
      await page.keyboard.press('Escape');
      await page.locator('.pf-sino').click();
      await expect(page.locator('.pf-notificacao').first()).toBeVisible();
      await axeGraves(page, 'sino aberto');
      await page.keyboard.press('Escape');
      await abrirBuscaComTermo(page);
      await page.keyboard.press('ArrowDown');
      await axeGraves(page, 'busca com resultados');
      await page.keyboard.press('Escape');
      await page.evaluate(() => { window.DMC_Shell.tour.iniciar('qa-axe'); }); // a promessa só resolve no fim do tour
      await expect(page.locator('.pf-tour')).toBeVisible();
      await axeGraves(page, 'tour');
      await page.keyboard.press('Escape');
    });
  }
}

// ===========================================================================
// 16 · Páginas legadas dentro do shell v2 (has-shell, --shell-*, carrinho R10)
// ===========================================================================
// Estrutura das páginas legadas de hoje (.dash-shell, sem main#conteudo nem pulo), montada pelo
// caminho legado DMC_init → DMC_bindHeader → DMC_Shell.montar (as páginas reais estão em obra na fase 1).
const MAIN_LEGADO = `<main class="dash-shell"><div class="dash-inner"><section class="dash-hero"><span class="overline">Curso selecionado</span><h1>Curso legado de teste</h1><p>Bem-vindo, <strong data-user-nome></strong>.</p></section><div id="modules-list"></div></div></main>`;
const BOOT_LEGADO = `<script>window.DMC_init().then(function () { window.DMC_bindHeader(); document.body.setAttribute('data-qa-boot', 'legado'); });</script>`;

test('legado · página com .dash-shell: deslocamento acompanha a lateral (1440 aberta, 1024 recolhida, 390 gaveta), pulo para o conteúdo, sem rolagem', { tag: ['@F0s'] }, async ({ page, request }) => {
  const aluno = await sessao(page, request, 'aluno');
  await servir(page, '__qa-shell-legado.html', htmlQa({ shell: 'conteudos', corpo: MAIN_LEGADO, fim: BOOT_LEGADO }));
  for (const [largura, lateral] of [[1440, 264], [1024, 72], [390, 0]]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto('/plataforma-ead/__qa-shell-legado.html');
    await expect(page.locator('body')).toHaveAttribute('data-qa-boot', 'legado');
    await expect(page.locator('header.pf-topo')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/has-shell/);
    await expect(page.locator('.dash-hero [data-user-nome]')).toHaveText(aluno.nome); // bindHeader legado
    await expect(page.locator('.pf-lateral a[aria-current="page"], .pf-gaveta a[aria-current="page"]').first()).toHaveAttribute('href', 'dashboard.html');
    const m = await page.evaluate(() => {
      const pad = parseFloat(getComputedStyle(document.querySelector('.dash-shell')).paddingLeft);
      const gutter = parseFloat(getComputedStyle(document.querySelector('.pf-rodape')).paddingLeft);
      const lat = document.querySelector('.pf-lateral');
      const larguraLateral = lat && lat.getClientRects().length ? lat.getBoundingClientRect().width : 0;
      const inner = document.querySelector('.dash-inner').getBoundingClientRect();
      const faixa = document.querySelector('.pf-faixa');
      const limite = Math.max(document.querySelector('.pf-topo').getBoundingClientRect().bottom, faixa && !faixa.hidden ? faixa.getBoundingClientRect().bottom : 0);
      return { pad, gutter, larguraLateral, innerLeft: inner.left, innerTop: inner.top + window.scrollY, limite };
    });
    expect(Math.round(m.larguraLateral), `${largura}: lateral`).toBe(lateral);
    expect(Math.round(m.pad), `${largura}: padding-left do .dash-shell`).toBe(Math.round(lateral + m.gutter));
    expect(m.innerLeft, `${largura}: conteúdo não fica sob a lateral`).toBeGreaterThanOrEqual(lateral);
    expect(m.innerTop, `${largura}: conteúdo abaixo do topo e da faixa`).toBeGreaterThanOrEqual(m.limite);
    await expect(page.locator('a.dmc-skip')).toHaveAttribute('href', '#conteudo');
    await expect(page.locator('main.dash-shell')).toHaveAttribute('id', 'conteudo');
    await semRolagem(page, `legado ${largura}`);
  }
});

test('legado · loja.html: carrinho no topo com [data-cart-count] dentro de [data-cart-open], gaveta do carrinho acima do shell', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await sessao(page, request, 'aluno');
  await page.goto('/plataforma-ead/loja.html');
  const botao = page.locator('.pf-topo [data-cart-open]');
  await expect(botao).toBeVisible();
  expect(await page.locator('[data-cart-count]').first().evaluate((el) => !!el.closest('.pf-topo [data-cart-open]'))).toBe(true);
  await expect(botao).toHaveAccessibleName('Carrinho');
  await botao.click();
  await expect(page.locator('#cart-drawer')).toBeVisible();
  const z = await page.evaluate(() => ({ topo: Number(getComputedStyle(document.querySelector('.pf-topo')).zIndex), carrinho: Number(getComputedStyle(document.querySelector('#cart-drawer')).zIndex) }));
  expect(z.carrinho).toBeGreaterThan(z.topo);
  await semRolagem(page, 'loja 390 com o carrinho aberto');
});

// ===========================================================================
// 17 · Destino por papel e ?next= (R1/R2 por papel e next; §5.1, §7.2, §7.3)
// ===========================================================================
test('destino · index.html leva aluno, professor e admin ao destino do papel e respeita next válido', { tag: ['@F0s'] }, async ({ page, request }) => {
  bloqueadoSem(F0B.bootIndex && F0B.destinoInicial, 'aguarda a F0b: js/portal/boot-index.js com DMC_Auth.destinoInicial (§6.2, §7.2)');
  const { aluno, professor, admin } = await P.criarPapeis(request);
  await stubs(page, ['dashboard.html', 'professor.html', 'admin.html', 'meus-cursos.html', 'login.html']);
  for (const [u, destino] of [[aluno, 'dashboard.html'], [professor, 'professor.html'], [admin, 'admin.html']]) {
    await P.entrarComToken(page, u.token);
    await page.goto('/plataforma-ead/index.html');
    await page.waitForURL(new RegExp(`/plataforma-ead/${destino.replace('.', '\\.')}$`));
  }
  await P.entrarComToken(page, aluno.token);
  await page.goto('/plataforma-ead/index.html?next=meus-cursos.html');
  await page.waitForURL(/\/plataforma-ead\/meus-cursos\.html$/);
  await page.goto(`/plataforma-ead/index.html?next=${encodeURIComponent('https://exemplo.invalid/x.html')}`);
  await page.waitForURL(/\/plataforma-ead\/dashboard\.html$/);
  await P.entrarComToken(page, null);
  await page.goto('/plataforma-ead/index.html');
  await page.waitForURL(/\/plataforma-ead\/login\.html/);
});

async function entrarPeloClassico(page, u, query = '') {
  await page.goto(`/plataforma-ead/login-classico.html${query}`);
  await page.locator('#email').fill(u.email);
  await page.locator('#senha').fill(u.senha);
  await page.locator('#acesso-cta').click();
}

test('destino · DMC_bootLogin (login-classico.html) com e-mail, sem sessão: aluno vai ao dashboard; next válido vence; next inválido é ignorado', { tag: ['@F0s'] }, async ({ page, request }) => {
  test.setTimeout(120_000);
  const aluno = await P.criarUsuario(request, { papel: 'aluno' });
  await P.simularCliente(page);
  await stubs(page, ['dashboard.html', 'meus-cursos.html']);
  await P.entrarComToken(page, null);
  await entrarPeloClassico(page, aluno);
  await page.waitForURL(/\/plataforma-ead\/dashboard\.html$/, { timeout: 30_000 });
  expect(await page.evaluate(() => localStorage.getItem('dmc:token'))).toBeTruthy();
  await P.entrarComToken(page, null);
  await entrarPeloClassico(page, aluno, '?next=meus-cursos.html');
  await page.waitForURL(/\/plataforma-ead\/meus-cursos\.html$/, { timeout: 30_000 });
  await P.entrarComToken(page, null);
  await entrarPeloClassico(page, aluno, `?next=${encodeURIComponent('//exemplo.invalid/x.html')}`);
  await page.waitForURL(/\/plataforma-ead\/dashboard\.html$/, { timeout: 30_000 });
});

test('destino · DMC_bootLogin leva professor e admin ao destino do papel, inclusive quando a página abre com sessão', { tag: ['@F0s'] }, async ({ page, request }) => {
  bloqueadoSem(F0B.destinoInicial, 'aguarda a F0b: DMC_Auth.destinoInicial e DMC_bootLogin por papel (§7.2, §7.3, D-44)');
  test.setTimeout(120_000);
  const { professor, admin } = await P.criarPapeis(request);
  await P.simularCliente(page);
  await stubs(page, ['dashboard.html', 'professor.html', 'admin.html']);
  for (const [u, destino] of [[professor, 'professor.html'], [admin, 'admin.html']]) {
    await P.entrarComToken(page, null);
    await entrarPeloClassico(page, u);
    await page.waitForURL(new RegExp(`/plataforma-ead/${destino.replace('.', '\\.')}$`), { timeout: 30_000 });
    // com sessão: abrir o login leva direto ao destino do papel
    await page.goto('/plataforma-ead/login-classico.html');
    await page.waitForURL(new RegExp(`/plataforma-ead/${destino.replace('.', '\\.')}$`), { timeout: 30_000 });
  }
});

test('next · sessão expirada em página nova leva a login.html?next=<página e query> validado', { tag: ['@F0s'] }, async ({ page }) => {
  await stubs(page, ['login.html']);
  await P.entrarComToken(page, 'token-qa-expirado');
  await servir(page, '__qa-shell-next.html', htmlQa({ fim: bootPortal() }));
  await page.goto('/plataforma-ead/__qa-shell-next.html?aba=historico&x=1');
  await page.waitForURL(/\/plataforma-ead\/login\.html\?next=/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('__qa-shell-next.html?aba=historico&x=1');
  expect(await page.evaluate(() => localStorage.getItem('dmc:token'))).toBeNull();
});

test('next · sessão expirada em página legada termina em login.html?next=<página> (R2 com next)', { tag: ['@F0s'] }, async ({ page }) => {
  bloqueadoSem(F0B.validarNext, 'aguarda a F0b: requireOrRedirect com next validado (corrige app.js:56, §5.4, §7.2)');
  await stubs(page, ['login.html']);
  await P.entrarComToken(page, 'token-qa-expirado');
  await page.goto('/plataforma-ead/meus-cursos.html');
  await page.waitForURL(/\/plataforma-ead\/login\.html/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('meus-cursos.html');
});

// ===========================================================================
// 18 · Catálogo pf-* (UX §4.3): amostra com o markup esperado em portal.css —
//      axe sem violação séria nos dois temas (1440 e 390), sem rolagem e impressão em papel
// ===========================================================================
const G = (tom) => `<svg class="pf-estado__glifo" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8"/></svg>`;
const CATALOGO = `<a class="dmc-skip" href="#conteudo">Pular para o conteúdo</a>
<main id="conteudo" class="pf-main" tabindex="-1">
  <header class="pf-cabecalho"><a class="pf-cabecalho__contexto" href="#conteudo">← Turmas</a><h1 class="pf-cabecalho__titulo">Catálogo de <em>componentes</em></h1><p class="pf-cabecalho__desc">Amostra do vocabulário pf-* com o markup esperado.</p><div class="pf-cabecalho__acoes"><button type="button" class="dmc-btn dmc-btn--primary">Salvar alterações</button><button type="button" class="dmc-btn dmc-btn--secondary">Cancelar</button></div></header>
  <nav class="pf-subnav" aria-label="Atendimento"><a class="pf-subnav__link" href="#conteudo" aria-current="page">Assistente</a><a class="pf-subnav__link" href="#conteudo">Seus atendimentos</a><a class="pf-subnav__link" href="#conteudo">Ouvidoria</a></nav>
  <div class="pf-abas" role="tablist" aria-label="Seções"><button type="button" role="tab" class="pf-abas__aba" id="aba-1" aria-selected="true" aria-controls="painel-1">Enturmação atual</button><button type="button" role="tab" class="pf-abas__aba" id="aba-2" aria-selected="false" aria-controls="painel-2" tabindex="-1">Histórico <span class="pf-abas__contador">(2)</span></button></div>
  <section class="pf-abas__painel" role="tabpanel" id="painel-1" aria-labelledby="aba-1">
    <div class="pf-segmento" role="group" aria-label="Filtrar lançamentos"><button type="button" class="pf-segmento__opcao" aria-pressed="true">Todos <span class="pf-segmento__contagem">(12)</span></button><button type="button" class="pf-segmento__opcao" aria-pressed="false">Em aberto</button><button type="button" class="pf-segmento__opcao" aria-pressed="false">Em atraso</button><button type="button" class="pf-segmento__opcao" aria-pressed="false">Pagos</button></div>
    <p><span class="pf-estado pf-estado--sucesso">${G()}Aprovado</span> · <span class="pf-estado pf-estado--aviso pf-estado--destaque">${G()}Vence em 2 dias</span> · <span class="pf-estado pf-estado--erro">${G()}Em atraso</span> · <span class="pf-estado pf-estado--info pf-estado--destaque">${G()}Em revisão</span> · <span class="pf-estado pf-estado--neutro">${G()}Agendado</span></p>
    <div class="pf-alerta pf-alerta--erro" role="alert">${G()}<p class="pf-alerta__titulo">Não foi possível carregar as turmas agora.</p><p>Verifique sua conexão e tente de novo.</p><button type="button" class="dmc-btn dmc-btn--secondary pf-alerta__acao">Tentar de novo</button><details class="pf-alerta__detalhe"><summary>Detalhes para o suporte</summary><p>Código 503</p></details></div>
    <div class="pf-alerta pf-alerta--aviso pf-alerta--compacto">${G()}<p>Pendente: documento ilegível.</p></div>
    <dl class="pf-kpis"><div class="pf-kpi"><dt class="pf-kpi__rotulo">Média parcial</dt><dd class="pf-kpi__valor">7,5</dd><dd class="pf-kpi__nota">2 de 3 módulos</dd></div><div class="pf-kpi"><dt class="pf-kpi__rotulo">Frequência</dt><dd class="pf-kpi__valor">—</dd><dd class="pf-kpi__nota">Sem registros ainda</dd></div><div class="pf-kpi"><dt class="pf-kpi__rotulo">Em aberto</dt><dd class="pf-kpi__valor">R$ 4.990,00</dd><dd class="pf-kpi__nota">3 lançamentos</dd></div><div class="pf-kpi"><dt class="pf-kpi__rotulo">Carga horária</dt><dd class="pf-kpi__valor">42 h</dd><dd class="pf-kpi__nota">de 360 h</dd></div><div class="pf-kpi"><dt class="pf-kpi__rotulo">Em andamento</dt><dd class="pf-kpi__valor">2</dd><dd class="pf-kpi__nota">módulos</dd></div></dl>
    <div class="pf-progresso"><span class="pf-progresso__barra" role="progressbar" aria-valuenow="38" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso do curso" style="--pf-pct: .38"></span><span class="pf-progresso__texto">38%</span></div>
    <table class="pf-tabela"><caption>Lançamentos</caption><thead><tr><th scope="col">Lançamento</th><th scope="col">Status</th><th scope="col" class="pf-tabela__secundaria">Vencimento</th><th scope="col" class="pf-tabela__num">Valor</th><th scope="col" class="pf-tabela__acoes"><span class="dmc-sr-only">Ações</span></th></tr></thead>
      <tbody><tr><td data-rotulo="Lançamento"><a href="#conteudo">Parcela 2/10 · Arquitetura Patrimonial Estratégica com nome comprido</a></td><td data-rotulo="Status"><span class="pf-estado pf-estado--aviso">${G()}Vence em 2 dias</span></td><td data-rotulo="Vencimento" class="pf-tabela__secundaria"><time datetime="2026-10-20">20/10/2026</time></td><td data-rotulo="Valor" class="pf-tabela__num">R$ 499,00</td><td data-rotulo="Ações" class="pf-tabela__acoes"><a class="dmc-btn dmc-btn--link" href="#conteudo">2ª via</a></td></tr></tbody></table>
    <ul class="pf-lista"><li class="pf-lista__linha"><a class="pf-lista__titulo" href="#conteudo">ATD-2026-K7M2QX · Pedido de declaração</a><p class="pf-lista__meta">Respondido há 2 dias</p><div class="pf-lista__acao"><span class="pf-estado pf-estado--info">${G()}Respondido</span></div></li></ul>
    <form class="pf-form" novalidate>
      <p class="pf-obrigatorios">Campos com * são obrigatórios.</p>
      <div class="pf-erros" tabindex="-1" role="alert"><p class="pf-erros__titulo">Corrija 1 campo:</p><ul><li><a href="#qa-cpf">CPF inválido.</a></li></ul></div>
      <div class="pf-campo"><label class="pf-rotulo" for="qa-nome">Nome social <span aria-hidden="true">*</span></label><input class="pf-input" id="qa-nome" required autocomplete="off" aria-describedby="qa-nome-ajuda"><p class="pf-ajuda" id="qa-nome-ajuda">Aparece no lugar do nome de registro.</p></div>
      <div class="pf-campo"><label class="pf-rotulo" for="qa-cpf">CPF</label><input class="pf-input" id="qa-cpf" aria-invalid="true" aria-describedby="qa-cpf-erro" value="123"><p class="pf-erro-campo" id="qa-cpf-erro">${G()}CPF inválido. Confira os 11 dígitos.</p></div>
      <div class="pf-campo"><label class="pf-rotulo" for="qa-uf">UF</label><select class="pf-input" id="qa-uf"><option>SP</option><option>RJ</option></select></div>
      <div class="pf-campo pf-senha-campo"><label class="pf-rotulo" for="qa-senha">Senha atual</label><div class="pf-senha"><input class="pf-input" id="qa-senha" type="password" autocomplete="current-password"><button type="button" class="pf-senha__ver" aria-pressed="false" aria-label="Mostrar senha">${G()}</button></div></div>
      <fieldset class="pf-grupo"><legend>Preferências</legend><label class="pf-check"><input type="checkbox" checked><span>Concordo com este uso</span></label><label class="pf-radio"><input type="radio" name="qa-r" checked><span>Claro</span></label><label class="pf-radio"><input type="radio" name="qa-r"><span>Escuro</span></label></fieldset>
      <button type="button" class="pf-switch" role="switch" aria-checked="true"><span class="pf-switch__trilho"><span class="pf-switch__botao"></span></span><span class="pf-switch__rotulo">No ar</span></button>
      <fieldset class="pf-reautenticacao"><legend>Confirme sua identidade</legend><p>Por segurança, esta ação pede a sua senha.</p><div class="pf-campo pf-reautenticacao__codigo"><label class="pf-rotulo" for="qa-codigo">Código do aplicativo</label><input class="pf-input" id="qa-codigo" inputmode="numeric" autocomplete="one-time-code"></div></fieldset>
    </form>
    <div class="pf-consentimento"><div class="pf-consentimento__texto pf-leitura">Autorizo o registro do meu gênero para estatísticas agregadas de diversidade da plataforma.
A informação aparece só para mim.</div><p class="pf-consentimento__versao">Versão v1</p><label class="pf-check pf-consentimento__check"><input type="checkbox"><span>Concordo com este uso</span></label><p class="pf-consentimento__registro">${G()}Autorizado em 18/10/2026 · versão v1</p></div>
    <p><span class="pf-codigo"><span class="pf-codigo__valor">APE-M01-A01</span><button type="button" class="pf-codigo__copiar">Copiar</button></span></p>
    <div class="pf-upload"><div class="pf-upload__alvo"><p>PDF, JPG ou PNG, até 4 MB</p><button type="button" class="dmc-btn dmc-btn--secondary">Escolher arquivo</button></div><div class="pf-upload__arquivo"><span>documento-de-identidade-frente.pdf · 1,2 MB</span><button type="button" class="dmc-btn dmc-btn--link">Trocar</button></div></div>
    <ol class="pf-linha-tempo"><li class="pf-linha-tempo__item">Coordenação respondeu em 18/10/2026.</li><li class="pf-linha-tempo__item pf-linha-tempo__item--sistema">Protocolo aberto.</li></ol>
    <div class="pf-mais"><p>Mostrando 1–50 de 214</p><button type="button" class="dmc-btn dmc-btn--secondary">Carregar mais 50</button></div>
    <div class="pf-vazio"><p class="pf-vazio__titulo">Nenhum lançamento registrado na sua conta.</p><p class="pf-vazio__texto">Os lançamentos aparecem aqui quando a coordenação os registra.</p></div>
    <div class="pf-capa pf-capa--vertical pf-capa--tipografica" data-sigla="APE" style="max-width: 10rem"></div>
    <div class="pf-documento"><div class="pf-documento__cabeca"><p>Declaração de matrícula</p></div><div class="pf-documento__corpo"><p>Declaramos, para os devidos fins, que a pessoa titular está matriculada.</p></div><div class="pf-documento__rodape"><p>Código DEC-QA00-0001 · validar.html</p><span class="pf-qr" aria-hidden="true"></span></div></div>
  </section>
  <div class="pf-toasts"><div class="pf-toast pf-toast--sucesso" role="status">${G()}<p>Encontro salvo.</p><button type="button" class="pf-toast__fechar pf-btn-icone" aria-label="Fechar aviso">${G()}</button></div></div>
</main>`;

for (const tema of ['escuro', 'claro']) {
  for (const largura of [1440, 390]) {
    test(`catálogo · amostra pf-* no tema ${tema} em ${largura}: axe sem violação séria, sem rolagem`, { tag: ['@F0s'] }, async ({ page, request }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await sessao(page, request, 'aluno', { 'dmc:tema': tema, 'dmc:banner:novo-portal:dispensado': '1' });
      await abrirQa(page, `__qa-shell-catalogo-${tema}-${largura}.html`, htmlQa({ shell: 'atendimento', corpo: CATALOGO, fim: bootPortal() }));
      await axeGraves(page, `catálogo ${tema} ${largura}`);
      await semRolagem(page, `catálogo ${tema} ${largura}`);
      await page.screenshot({ path: test.info().outputPath(`catalogo-${tema}-${largura}.png`), fullPage: true, animations: 'disabled' }); // evidência (fora do git)
      const empilhada = await page.locator('.pf-tabela tbody tr').evaluate((tr) => getComputedStyle(tr).display);
      expect(empilhada, 'tabela empilhada < 44em de contêiner').toBe(largura < 1024 ? 'grid' : 'table-row');
    });
  }
}

test('impressão · shell some, papel em todos os escopos, tabela volta a ser tabela, QR de 28 mm', { tag: ['@F0s'] }, async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await sessao(page, request, 'aluno', { 'dmc:tema': 'escuro' });
  await abrirQa(page, '__qa-shell-impressao.html', htmlQa({ shell: 'academico', corpo: CATALOGO, fim: bootPortal() }));
  await page.emulateMedia({ media: 'print' });
  const r = await page.evaluate(() => {
    const vis = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).display : 'ausente'; };
    return {
      topo: vis('.pf-topo'), lateral: vis('.pf-lateral'), faixa: vis('.pf-faixa'), rodape: vis('.pf-rodape'),
      fundo: getComputedStyle(document.documentElement).getPropertyValue('--pf-fundo').trim(),
      texto: getComputedStyle(document.querySelector('.pf-cabecalho__titulo')).color,
      linha: getComputedStyle(document.querySelector('.pf-tabela tbody tr')).display,
      qr: document.querySelector('.pf-qr').getBoundingClientRect().width
    };
  });
  expect(r).toMatchObject({ topo: 'none', lateral: 'none', faixa: 'none', rodape: 'none', linha: 'table-row' });
  expect(r.fundo).toMatch(/white|#fff|var\(--color-white\)/i);
  expect(r.texto).toBe('rgb(11, 12, 14)');
  expect(Math.round(r.qr)).toBe(Math.round(28 * 96 / 25.4));
});
