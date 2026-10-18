// =============================================================
// Apoio E2E do Portal do Aluno e do Professor (F0b · ponto S0).
// Índice: docs/dmc/PORTAL-ACADEMICO.md §8.3 (S0), §9.2, §9.3, §9.6, D-73, D-74, D-76, D-77.
//
// Arquivo com "_" não é spec. Congelado na fase 1 (§8.2 item 2): mudança = pedido
// escrito à F0b via principal. Exporta:
//   PAGINAS_BASE · paginasDoPortal() · urlDaPagina()            (D-74)
//   SELETORES_D5                                                (§9.2 item 2, D-45, D-76)
//   PREFIXOS_API · fatiaDaApi() · donoDoAsset() · fatiasIntegradas()
//   monitorarConsoleERede(page, { fatia }) · esperar(page, …)   (D-73, §8.6 item 3)
//   confirmarNaTela(page, acao?)                                (D-76)
//   banco descartável: estadoQa · exigirMongo · comBanco
//   papéis semeados direto no banco: criarUsuario · criarPapeis
//   sementes: semearCurso · liberarCurso · concluirAulas · semearLives · semearR9 · semearR9b
//   sessão: entrarComToken · api(request, token)
//   mídia de teste: rotearVimeo · rotearMp4 · PNG_1PX · PDF_MINIMO
//   capturas: capturar · capturaDeterministica · decodificarPng · compararPng
//
// Regras: nada aqui toca banco que não seja o mongod descartável do
// tests/server/serve.mjs (a URI vem de GET /__qa/estado e é conferida: só
// 127.0.0.1). Sem mongod, os casos que precisam de banco ficam "bloqueado".
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EAD_DISCO = path.join(RAIZ, 'complexodmc.com.br', 'plataforma-ead');
export const BASE_EAD = '/plataforma-ead/';
export const DIR_CAPTURAS = path.join(RAIZ, 'docs', 'dmc', 'qa', 'portal');

// ---------------------------------------------------------------------------
// Fatias (§8.1). "principal", "2d" e "ninguem" nunca são toleradas pelo monitor.
// ---------------------------------------------------------------------------
export const FATIAS = ['F0a', 'F0m', 'F0t', 'F0b', 'F0s', 'F0p', 'F0r', 'F1a', 'F1b', 'F2', 'F3a', 'F3b', 'F4a', 'F4b', 'F5', 'F6a', 'F6b', 'F7', 'F8'];
export const FASE0 = ['F0a', 'F0m', 'F0b', 'F0s', 'F0r'];

/** QA_INTEGRADAS (lista da principal em PROGRESS.md). Ausente → as cinco da fase 0 (§9.1). */
export function fatiasIntegradas() {
  const bruto = (process.env.QA_INTEGRADAS || '').trim();
  const lista = bruto ? bruto.split(/[\s,;]+/).filter(Boolean) : FASE0;
  return new Set(lista);
}

// ---------------------------------------------------------------------------
// PAGINAS_BASE — as 34 páginas (32 com dono + 2 da 2d), §6.1 e §8.1.
// `url: () => '<pagina>'` (relativa a /plataforma-ead/; urlDaPagina normaliza).
// `legado`: existia antes da rodada. `existe`: arquivo presente no disco agora.
// `papel`: o mínimo para a página abrir sem redirecionar (anonimo · aluno · admin).
// ---------------------------------------------------------------------------
const PAGINAS_DEF = [
  ['index.html', 'F0b', true, 'anonimo'],
  ['loja.html', 'F0r', true, 'aluno'],
  ['obrigado.html', 'F0r', true, 'aluno'],
  ['tutoriais.html', 'F0r', false, 'aluno'],
  ['dashboard.html', 'F1b', true, 'aluno'],
  ['meus-cursos.html', 'F1b', true, 'aluno'],
  ['aula.html', 'F1b', true, 'aluno'],
  ['ao-vivo.html', 'F3a', true, 'aluno'],
  ['academico.html', 'F3a', false, 'aluno'],
  ['comprovantes.html', 'F3a', false, 'aluno'],
  ['certificados.html', 'F3b', true, 'aluno'],
  ['certificado.html', 'F3b', true, 'anonimo'],
  ['validar.html', 'F3b', false, 'anonimo'],
  ['declaracao.html', 'F3b', false, 'aluno'],
  ['documentos.html', 'F4b', false, 'aluno'],
  ['contratos.html', 'F4b', false, 'aluno'],
  ['contrato.html', 'F4b', false, 'aluno'],
  ['financeiro.html', 'F5', false, 'aluno'],
  ['atendimentos.html', 'F6a', false, 'aluno'],
  ['ouvidoria.html', 'F6a', false, 'aluno'],
  ['regulamento.html', 'F6a', false, 'aluno'],
  ['assistente.html', 'F6b', false, 'aluno'],
  ['publicacoes.html', 'F7', false, 'aluno'],
  ['publicacao.html', 'F7', false, 'aluno'],
  ['perfil.html', 'F0p', false, 'aluno'],
  ['meus-dados.html', 'F0p', false, 'aluno'],
  ['notificacoes.html', 'F0p', false, 'aluno'],
  ['busca.html', 'F0p', false, 'aluno'],
  ['acesso-link.html', 'F0p', false, 'anonimo'],
  ['professor.html', 'F8', false, 'admin'],
  ['admin.html', 'F8', true, 'admin'],
  ['parcerias.html', 'F8', true, 'admin'],
  ['login.html', '2d', true, 'anonimo'],
  ['login-classico.html', '2d', true, 'anonimo']
];
export const PAGINAS_BASE = Object.freeze(PAGINAS_DEF.map(([pagina, fatia, legado, papel]) => Object.freeze({
  pagina, fatia, legado, papel,
  existe: fs.existsSync(path.join(EAD_DISCO, pagina)),
  url: () => pagina
})));

/** Caminho absoluto (a partir da origem) de uma entrada de PAGINAS_BASE ou de portal-<x>.paginas.js. */
export function urlDaPagina(entrada, ctx = {}) {
  const u = String(typeof entrada.url === 'function' ? entrada.url(ctx) : entrada.url || entrada.pagina);
  if (/^https?:\/\//i.test(u)) return u;
  return u.startsWith('/') ? u : BASE_EAD + u;
}

// Arquivo de páginas → fatia dona (§6.1, D-74). Um arquivo só declara entradas da própria fatia.
export const ARQUIVOS_DE_PAGINAS = Object.freeze({
  'portal-titular.paginas.js': 'F0p',
  'portal-estudos.paginas.js': 'F1b',
  'portal-avaliacoes.paginas.js': 'F2',
  'portal-academico.paginas.js': 'F3a',
  'portal-declaracoes.paginas.js': 'F3b',
  'portal-secretaria.paginas.js': 'F4a',
  'portal-documentos.paginas.js': 'F4b',
  'portal-financeiro.paginas.js': 'F5',
  'portal-atendimento.paginas.js': 'F6a',
  'portal-assistente.paginas.js': 'F6b',
  'portal-comunicacao.paginas.js': 'F7',
  'portal-professor.paginas.js': 'F8'
});

/**
 * Junta PAGINAS_BASE com o que cada fatia declara em tests/e2e/portal-<x>.paginas.js
 * (`export const PAGINAS = [{ pagina, fatia, url(ctx), preparar?(ctx), hospedeira? }]`).
 * Recusa (lança): arquivo fora da lista, entrada com `fatia` de outra dona, página própria
 * declarada como de outra fatia, página própria repetida e URL repetida.
 * Entrada própria (hospedeira falsa) de uma página que já está em PAGINAS_BASE com a mesma
 * fatia SUBSTITUI a da base (é como a fatia ensina a abrir uma página que exige id).
 * Opções: `{ dir }` (testes do próprio helper), `{ fatia }` (filtra por QA_FATIA).
 */
export async function paginasDoPortal({ dir = path.dirname(fileURLToPath(import.meta.url)), fatia = null, arquivos = null } = {}) {
  const base = new Map(PAGINAS_BASE.map((e) => [e.pagina, { ...e, origem: 'PAGINAS_BASE', hospedeira: false }]));
  const extras = [];
  const proprias = new Map(); // pagina → arquivo que a declarou
  const urls = new Map();
  const nomes = arquivos || fs.readdirSync(dir).filter((n) => /^portal-.+\.paginas\.js$/.test(n)).sort();
  for (const nome of nomes) {
    const dona = ARQUIVOS_DE_PAGINAS[nome];
    if (!dona) throw new Error(`paginasDoPortal: ${nome} não está na lista de arquivos de páginas (D-74).`);
    const mod = await import(pathToFileURL(path.join(dir, nome)).href);
    const lista = mod.PAGINAS || (mod.default && mod.default.PAGINAS) || mod.default;
    if (!Array.isArray(lista)) throw new Error(`paginasDoPortal: ${nome} precisa exportar PAGINAS (array).`);
    for (const e of lista) {
      if (!e || typeof e.pagina !== 'string') throw new Error(`paginasDoPortal: ${nome} tem entrada sem "pagina".`);
      if (e.fatia !== dona) throw new Error(`paginasDoPortal: ${nome} (${dona}) declarou ${e.pagina} com fatia "${e.fatia}" (D-74: só a própria).`);
      if (typeof e.url !== 'function' && typeof e.url !== 'string') throw new Error(`paginasDoPortal: ${nome} › ${e.pagina} sem url.`);
      const entrada = { ...e, hospedeira: !!e.hospedeira, origem: nome };
      if (!entrada.hospedeira) {
        const naBase = base.get(e.pagina);
        if (naBase && naBase.fatia !== dona) {
          throw new Error(`paginasDoPortal: ${nome} declarou ${e.pagina} como própria, mas a dona é ${naBase.fatia} (marque hospedeira:true).`);
        }
        if (proprias.has(e.pagina)) {
          throw new Error(`paginasDoPortal: página própria repetida: ${e.pagina} (${proprias.get(e.pagina)} e ${nome}).`);
        }
        proprias.set(e.pagina, nome);
        if (naBase) base.delete(e.pagina);
      }
      if (typeof e.url === 'string') {
        const chave = urlDaPagina(e);
        if (urls.has(chave)) throw new Error(`paginasDoPortal: URL repetida ${chave} (${urls.get(chave)} e ${nome}).`);
        urls.set(chave, nome);
      }
      extras.push(entrada);
    }
  }
  const todas = [...base.values(), ...extras];
  return fatia ? todas.filter((e) => e.fatia === fatia) : todas;
}

// ---------------------------------------------------------------------------
// SELETORES_D5 — os ÚNICOS seletores de tela da regressão D5 (§9.2 item 2, §9.3).
// A fatia dona é OBRIGADA a preservá-los. Tirar um seletor ou mudar uma asserção =
// pedido escrito à F0b via principal, com justificativa (D-45).
// Notas de uso (estrutura, nunca texto):
//  - R4: o controle de conclusão da aula é o botão/checkbox/switch que fica DENTRO de
//    [data-aula-id]; se a aula estiver recolhida, a D5 abre a sanfona pelo primeiro
//    controle de expansão (button[aria-expanded], [data-toggle-modulo] ou <summary>) que
//    contém a aula sem estar dentro dela. O curso sem acesso leva a loja.html?destacar=<id>
//    (link com [data-curso-id] ou o próprio cartão).
//  - R6: o formulário [data-duvida-form] tem um campo de texto e um botão de envio.
//  - R9: em #certificados-lista o único botão habilitado de um aluno com UM curso pronto
//    emite o certificado (com perfil identificado não há confirmação de nome, D-53).
//  - R10: o item do carrinho em #cart-list tem o título do curso e um botão que o remove;
//    #cart-checkout é um <form> com botão de envio; [data-cart-count] fica dentro do
//    controle que abre #cart-drawer.
//  - R11: atributos do editor (admin.js, F8) listados em `R11`.
// ---------------------------------------------------------------------------
export const SELETORES_D5 = Object.freeze({
  R4: { dono: 'F1b', seletores: ['#modules-list', '[data-curso-id]', '[data-aula-id]'] },
  R5: { dono: 'F1b', seletores: ['#player-root', '#player-stage', '#btn-done', '#player-duvidas'] },
  R6: { dono: 'F1b', seletores: ['#player-duvidas', '[data-duvida-form]'] },
  R7: { dono: 'F1b', seletores: ['#meus-cursos-lista'] },
  R8: { dono: 'F3a', seletores: ['#lives-lista'] },
  R9: { dono: 'F3b', seletores: ['#certificados-lista'] },
  R9b: { dono: 'F3b', seletores: ['#certificados-lista'] },
  R10: { dono: 'F0r (markup de DMC_bootLoja: F0b, D-69; contador no shell: F0s)', seletores: ['#cart-drawer', '#cart-list', '#cart-checkout', '[data-cart-count]', '[data-curso-id]'] },
  R11: {
    dono: 'F8',
    seletores: [
      '#btn-add-curso', '[data-curso-id]', '[data-curso-field="titulo"]', '[data-capa-file]',
      '#btn-add-modulo', '[data-modulo-id]', '[data-modulo-field="titulo"]', '[data-modulo-up]', '[data-modulo-down]',
      '[data-arrasta]', '[data-modulo-toggle]', '[data-aula-add]', '[data-aula-id]', '[data-aula-field="titulo"]',
      '[data-aula-field="videoUrl"]', '[data-aula-toggle]', '[data-roteiro-wrap]', '[data-roteiro-toggle]',
      '[data-roteiro-txt]', '[data-mat-wrap]', '[data-mat-file]', '#btn-export', '#export-json'
    ]
  },
  R13: { dono: 'F8', seletores: ['#pa-restrito'] },
  // Gancho estável dos diálogos do ui.js (exigido no S3, D-76) — usado por confirmarNaTela.
  DIALOGO: { dono: 'F0b', seletores: ['[data-pf-acao="confirmar"]', '[data-pf-acao="cancelar"]'] }
});

// ---------------------------------------------------------------------------
// PREFIXOS_API — prefixo de rota de /api/portal/* e /api/auth/* (novas) → fatia.
// Fonte: PORTAL-API §6 + posse do índice §8.1 (F0a da API = F0t/F0m no índice;
// F3/F4 divididas por D-38 e D-78). O prefixo mais longo (em segmentos) vence;
// ":x" casa com qualquer segmento. Rotas legadas (/api/auth/signin|signup|me,
// /api/catalogo…) não estão aqui: nunca são toleradas.
// ---------------------------------------------------------------------------
const P_ = '/api/portal';
export const PREFIXOS_API = Object.freeze({
  // F0m (montar.js)
  [`${P_}/saude`]: 'F0m',
  // F0t — auth ampliada, titular, equipe, notificações, busca, auditoria, pendências
  '/api/auth/recursos': 'F0t', '/api/auth/2fa': 'F0t', '/api/auth/link-magico': 'F0t', '/api/auth/senha': 'F0t',
  '/api/auth/email': 'F0t', '/api/auth/sessoes': 'F0t',
  [`${P_}/me/perfil`]: 'F0t', [`${P_}/me/dados`]: 'F0t', [`${P_}/me/email`]: 'F0t', [`${P_}/me/notificacoes`]: 'F0t',
  [`${P_}/me/pendencias`]: 'F0t', [`${P_}/busca`]: 'F0t', [`${P_}/cep`]: 'F0t', [`${P_}/admin/auditoria`]: 'F0t',
  [`${P_}/admin/equipe`]: 'F0t', [`${P_}/admin/usuarios`]: 'F0t', [`${P_}/admin/docencias`]: 'F0t',
  [`${P_}/professor/alunos/:u/foto`]: 'F0t', [`${P_}/professor/alunos/:u/resumo`]: 'F0t', [`${P_}/professor/cursos`]: 'F0t',
  // F1a — estudos
  [`${P_}/me/cursos`]: 'F1a', [`${P_}/cursos`]: 'F1a', [`${P_}/modulos`]: 'F1a', [`${P_}/conteudo`]: 'F1a',
  [`${P_}/aulas`]: 'F1a', [`${P_}/materiais`]: 'F1a', [`${P_}/professor/modulos/:m/plano`]: 'F1a',
  [`${P_}/professor/modulos/:m/materiais`]: 'F1a', [`${P_}/professor/aulas`]: 'F1a',
  [`${P_}/professor/cursos/:c/planos`]: 'F1a',
  // F2 — avaliações
  [`${P_}/avaliacoes`]: 'F2', [`${P_}/tentativas`]: 'F2', [`${P_}/professor/avaliacoes`]: 'F2',
  [`${P_}/professor/questoes`]: 'F2', [`${P_}/professor/tentativas`]: 'F2', [`${P_}/professor/correcoes`]: 'F2',
  [`${P_}/professor/modulos/:m/avaliacoes`]: 'F2',
  // F3a — acadêmico, encontros, frequência, comprovantes
  [`${P_}/agenda`]: 'F3a', [`${P_}/encontros`]: 'F3a', [`${P_}/professor/encontros`]: 'F3a',
  [`${P_}/professor/turmas/:t/frequencia`]: 'F3a', [`${P_}/me/academico`]: 'F3a', [`${P_}/me/comprovantes`]: 'F3a',
  [`${P_}/professor/cursos/:c/boletim`]: 'F3a', [`${P_}/professor/matriculas`]: 'F3a',
  // F3b — regras do curso, IES, declarações, validação
  [`${P_}/admin/cursos`]: 'F3b', [`${P_}/admin/ies`]: 'F3b', [`${P_}/admin/modulos`]: 'F3b',
  [`${P_}/admin/declaracoes`]: 'F3b', [`${P_}/me/declaracoes`]: 'F3b', [`${P_}/validar`]: 'F3b',
  // F4a — turmas e matrículas
  [`${P_}/admin/turmas`]: 'F4a', [`${P_}/admin/matriculas`]: 'F4a', [`${P_}/professor/cursos/:c/turmas`]: 'F4a',
  // F4b — documentos e contratos
  [`${P_}/admin/documentos`]: 'F4b', [`${P_}/me/documentos`]: 'F4b', [`${P_}/admin/contratos`]: 'F4b',
  [`${P_}/me/contratos`]: 'F4b', [`${P_}/admin/usuarios/:u/documentos`]: 'F4b', [`${P_}/webhooks/contratos`]: 'F4b',
  // F5 — financeiro e pedido da loja (D-79)
  [`${P_}/admin/financeiro`]: 'F5', [`${P_}/me/financeiro`]: 'F5', [`${P_}/me/pedidos`]: 'F5', [`${P_}/webhooks/financeiro`]: 'F5',
  // F6a — atendimento, ouvidoria, configurações, regulamento
  [`${P_}/me/atendimentos`]: 'F6a', [`${P_}/professor/atendimentos`]: 'F6a', [`${P_}/admin/atendimentos`]: 'F6a',
  [`${P_}/me/ouvidoria`]: 'F6a', [`${P_}/admin/ouvidoria`]: 'F6a', [`${P_}/professor/ouvidoria`]: 'F6a',
  [`${P_}/admin/configuracoes`]: 'F6a', [`${P_}/admin/regulamentos`]: 'F6a', [`${P_}/configuracoes`]: 'F6a',
  [`${P_}/regulamento`]: 'F6a',
  // F6b — assistente de IA
  [`${P_}/me/ia`]: 'F6b', [`${P_}/admin/configuracoes/assistente-ia`]: 'F6b',
  // F7 — publicações, banners, relatórios
  [`${P_}/publicacoes`]: 'F7', [`${P_}/professor/publicacoes`]: 'F7', [`${P_}/banners`]: 'F7',
  [`${P_}/admin/banners`]: 'F7', [`${P_}/admin/relatorios`]: 'F7', [`${P_}/professor/relatorios`]: 'F7',
  // F8 — portal do professor
  [`${P_}/professor/duvidas`]: 'F8', [`${P_}/professor/resumo`]: 'F8', [`${P_}/professor/alunos`]: 'F8',
  [`${P_}/professor/cursos/:c/alunos`]: 'F8'
});
const PREFIXOS_ORDENADOS = Object.entries(PREFIXOS_API)
  .map(([p, f]) => ({ segs: p.split('/').filter(Boolean), fatia: f }))
  .sort((a, b) => b.segs.length - a.segs.length);

/** Fatia dona do caminho de API (prefixo mais longo vence) ou null. */
export function fatiaDaApi(url) {
  let caminho;
  try { caminho = new URL(url, 'http://x').pathname; } catch { return null; }
  const segs = caminho.split('/').filter(Boolean);
  for (const p of PREFIXOS_ORDENADOS) {
    if (p.segs.length > segs.length) continue;
    if (p.segs.every((s, i) => s.startsWith(':') || s === segs[i])) return p.fatia;
  }
  return null;
}

// ---------------------------------------------------------------------------
// POSSE de assets (caminho em plataforma-ead/** → fatia). A fonte é
// tests/tools/posse-ead.mjs (F0r, D-73); enquanto ele não existir, vale a reserva
// abaixo, copiada de §8.1 (só front). Pasta = chave terminada em "/".
// ---------------------------------------------------------------------------
const js = (f, ...n) => Object.fromEntries(n.map((x) => [`js/portal/${x}.js`, f]));
export const POSSE_RESERVA = Object.freeze({
  ...Object.fromEntries(PAGINAS_BASE.map((e) => [e.pagina, e.fatia])),
  'js/api-client.js': 'F0b', 'js/app.js': 'F0b', ...js('F0b', 'pre-pintura', 'ui', 'qr', 'boot-index'), 'js/vendor/qrcode-generator/': 'F0b',
  'js/shell.js': 'F0s', ...js('F0s', 'tour'), 'css/portal.css': 'F0s',
  ...js('F0p', 'perfil', 'meus-dados', 'notificacoes', 'busca', 'acesso-link'),
  ...js('F0r', 'boot-loja', 'boot-obrigado', 'tutoriais'), 'css/plataforma.css': 'F0r',
  ...js('F1b', 'estudos-dados', 'inicio', 'meus-cursos', 'player', 'video', 'prof-conteudo'), 'css/portal-estudos.css': 'F1b',
  ...js('F2', 'avaliacao', 'prof-avaliacoes'), 'css/portal-avaliacao.css': 'F2',
  ...js('F3a', 'academico', 'ao-vivo', 'comprovantes', 'prof-academico'), 'css/portal-academico.css': 'F3a',
  ...js('F3b', 'declaracoes', 'validar', 'declaracao', 'prof-certificacao'), 'css/portal-declaracoes.css': 'F3b',
  ...js('F4a', 'prof-secretaria'), 'css/portal-secretaria.css': 'F4a',
  ...js('F4b', 'documentos', 'contratos', 'contrato', 'prof-documentos'), 'css/portal-documentos.css': 'F4b',
  ...js('F5', 'financeiro', 'prof-financeiro'), 'css/portal-financeiro.css': 'F5',
  ...js('F6a', 'atendimentos', 'ouvidoria', 'regulamento', 'prof-atendimento', 'prof-configuracoes'), 'css/portal-atendimento.css': 'F6a',
  ...js('F6b', 'assistente', 'prof-ia'), 'css/portal-assistente.css': 'F6b',
  ...js('F7', 'publicacoes', 'publicacao', 'prof-comunicacao', 'prof-relatorios'), 'css/portal-comunicacao.css': 'F7',
  ...js('F8', 'professor', 'prof-visao', 'prof-turmas', 'prof-alunos', 'prof-duvidas', 'prof-equipe', 'boot-admin'),
  'js/admin.js': 'F8', 'js/parcerias-admin.js': 'F8', 'css/portal-professor.css': 'F8', 'css/parcerias-admin.css': 'F8',
  'css/business-school.css': '2d', 'js/business-school.js': '2d',
  'css/login.css': 'ninguem', 'js/data.js': 'ninguem', 'js/loja.js': 'ninguem', 'js/eixo-3d.js': 'ninguem',
  'js/login/': 'ninguem', 'js/vendor/three/': 'ninguem'
});

let _posse = null;
/** { mapa, donoDe(caminho), origem } — posse-ead.mjs da F0r quando existir; senão a reserva. */
export async function carregarPosse() {
  if (_posse) return _posse;
  const arq = path.join(RAIZ, 'tests', 'tools', 'posse-ead.mjs');
  let mapa = POSSE_RESERVA;
  let donoExterno = null;
  let origem = 'reserva (_portal.js; tests/tools/posse-ead.mjs ausente)';
  if (fs.existsSync(arq)) {
    try {
      const m = await import(pathToFileURL(arq).href);
      const bruto = m.POSSE || (m.default && m.default.POSSE) || m.default;
      if (bruto instanceof Map) mapa = Object.fromEntries(bruto);
      else if (bruto && typeof bruto === 'object') mapa = bruto;
      if (typeof m.donoDe === 'function') donoExterno = m.donoDe;
      origem = 'tests/tools/posse-ead.mjs';
    } catch (e) {
      origem = `reserva (posse-ead.mjs falhou ao importar: ${e.message.split('\n')[0]})`;
    }
  }
  const donoDe = (rel) => {
    const limpo = String(rel || '').replace(/^\/+/, '').replace(/^plataforma-ead\//, '');
    if (donoExterno) { try { const d = donoExterno(limpo); if (d) return d; } catch { /* cai na tabela */ } }
    if (mapa[limpo]) return mapa[limpo];
    let melhor = null;
    for (const [k, v] of Object.entries(mapa)) {
      if (k.endsWith('/') && limpo.startsWith(k) && (!melhor || k.length > melhor.k.length)) melhor = { k, v };
    }
    return melhor ? melhor.v : null;
  };
  _posse = { mapa, donoDe, origem };
  return _posse;
}

/** Dono do asset local (URL completa ou caminho) — só para /plataforma-ead/**. */
export async function donoDoAsset(url) {
  let p;
  try { p = new URL(url, 'http://x').pathname; } catch { return null; }
  if (!p.startsWith(BASE_EAD)) return null;
  return (await carregarPosse()).donoDe(decodeURIComponent(p.slice(BASE_EAD.length)));
}

// ---------------------------------------------------------------------------
// monitorarConsoleERede(page, { fatia }) — helper único de console/rede (D-73).
// Tolera SÓ: (a) 404 de /api/portal/* (e auth nova) cujo prefixo é de fatia fora de
// QA_INTEGRADAS e diferente da própria; (b) 404 de asset local cujo dono em POSSE é
// fatia não integrada (≠ própria); (c) "Failed to load resource" dessas URLs;
// (c') "Refused to apply style|execute script from '<url>'" (o navegador recusa o
// corpo do 404 pelo MIME): vale como o 404 da URL citada, SÓ se essa URL de fato
// respondeu 404 nesta página (pedido via principal, integração 18/10);
// (d) pageerror/console.error com origem (URL do script) num asset dessas fatias;
// e o que o caso declara com esperar(page, { status, url }). QA_ESTRITO=1 → não
// tolera nada além do declarado. 3xx/2xx nunca contam.
// ---------------------------------------------------------------------------
const _monitores = new WeakMap();
/** Mensagem do Chromium quando um <link>/<script> recebe corpo com MIME errado (ex.: o 404 em text/plain). */
export const RECUSA_MIME_RE = /Refused to (?:apply style|execute script) from '([^']+)'/i;

function casaUrl(padrao, url) {
  if (!padrao) return true;
  if (padrao instanceof RegExp) return padrao.test(url);
  return url.includes(String(padrao));
}
function casaStatus(padrao, status) {
  if (padrao == null) return true;
  return Array.isArray(padrao) ? padrao.includes(status) : padrao === status;
}
function urlDaPilha(pilha) {
  const m = String(pilha || '').match(/https?:\/\/[^\s)]+?\.(?:m?js)(?=[?:#)\s]|$)/);
  return m ? m[0] : null;
}

export function monitorarConsoleERede(page, { fatia = process.env.QA_FATIA || null, estrito = process.env.QA_ESTRITO === '1' } = {}) {
  const reg = { console: [], pageerror: [], respostas: [], falhas: [] };
  const statusPorUrl = new Map(); // toda resposta (inclusive 2xx), para a regra (c')
  const esperadas = [];
  const integradas = fatiasIntegradas();
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const loc = msg.location ? msg.location() : null;
    reg.console.push({ texto: msg.text(), url: (loc && loc.url) || '', pagina: page.url() });
  });
  page.on('pageerror', (err) => reg.pageerror.push({ mensagem: err.message, pilha: err.stack || '', pagina: page.url() }));
  page.on('response', (r) => {
    const s = r.status();
    statusPorUrl.set(r.url(), s);
    if (s >= 400) reg.respostas.push({ status: s, url: r.url(), metodo: r.request().method(), pagina: page.url() });
  });
  page.on('requestfailed', (r) => {
    const erro = (r.failure() && r.failure().errorText) || '';
    // Navegação abortada pelo próprio app (redirecionamento) não é falha.
    if (/ERR_ABORTED/.test(erro)) return;
    reg.falhas.push({ url: r.url(), erro, metodo: r.method(), pagina: page.url() });
  });

  const naoIntegrada = (f) => !!f && FATIAS.includes(f) && f !== fatia && !integradas.has(f);

  async function motivoTolerado(url, status) {
    if (estrito) return null;
    if (status != null && status !== 404) return null;
    const fa = fatiaDaApi(url);
    if (fa && naoIntegrada(fa)) return `404 de API da ${fa} (não integrada)`;
    const fd = await donoDoAsset(url);
    if (fd && naoIntegrada(fd)) return `404 de asset da ${fd} (não integrada)`;
    return null;
  }

  function ehEsperada(item) {
    return esperadas.find((e) => casaStatus(e.status, item.status) && casaUrl(e.url, item.url) && (!e.metodo || !item.metodo || e.metodo === item.metodo)) || null;
  }

  async function classificar() {
    const inesperadas = []; const toleradas = []; const declaradas = [];
    for (const r of reg.respostas) {
      const e = ehEsperada(r);
      if (e) { declaradas.push({ tipo: 'resposta', ...r }); continue; }
      const m = await motivoTolerado(r.url, r.status);
      (m ? toleradas : inesperadas).push({ tipo: 'resposta', ...r, ...(m ? { motivo: m } : {}) });
    }
    for (const c of reg.console) {
      // (c') recusa por MIME do corpo de um 404: classifica como o 404 da URL citada.
      const recusa = String(c.texto).match(RECUSA_MIME_RE);
      if (recusa) {
        const alvo = recusa[1];
        // O Chromium nem sempre emite 'response' para a folha de estilo recusada: sem
        // status registrado, confere a própria URL (GET, mesma sessão do contexto).
        let st = statusPorUrl.has(alvo) ? statusPorUrl.get(alvo) : null;
        if (st == null) {
          try { st = (await page.request.get(alvo, { maxRedirects: 0, timeout: 5_000 })).status(); } catch { st = null; }
        }
        if (st === 404) {
          const e = ehEsperada({ url: alvo, status: 404 });
          if (e) { declaradas.push({ tipo: 'console', ...c, url: alvo }); continue; }
          const m = await motivoTolerado(alvo, 404);
          if (m) { toleradas.push({ tipo: 'console', ...c, url: alvo, motivo: `${m}; recusa de MIME do corpo do 404` }); continue; }
        }
        inesperadas.push({ tipo: 'console', ...c, url: alvo });
        continue;
      }
      const falhaRecurso = /Failed to load resource/i.test(c.texto);
      if (falhaRecurso && c.url) {
        const st = Number((c.texto.match(/status of (\d{3})/) || [])[1]) || null;
        const e = ehEsperada({ url: c.url, status: st });
        if (e) { declaradas.push({ tipo: 'console', ...c }); continue; }
        const m = await motivoTolerado(c.url, st);
        if (m) { toleradas.push({ tipo: 'console', ...c, motivo: m }); continue; }
      } else if (!estrito && c.url) {
        const fd = await donoDoAsset(c.url);
        if (fd && naoIntegrada(fd)) { toleradas.push({ tipo: 'console', ...c, motivo: `erro com origem em asset da ${fd} (não integrada)` }); continue; }
      }
      inesperadas.push({ tipo: 'console', ...c });
    }
    for (const p of reg.pageerror) {
      const origem = urlDaPilha(p.pilha);
      if (!estrito && origem) {
        const fd = await donoDoAsset(origem);
        if (fd && naoIntegrada(fd)) { toleradas.push({ tipo: 'pageerror', ...p, origem, motivo: `erro com origem em asset da ${fd} (não integrada)` }); continue; }
      }
      inesperadas.push({ tipo: 'pageerror', ...p, origem });
    }
    return { inesperadas, toleradas, declaradas, falhasDeRede: reg.falhas.slice() };
  }

  const monitor = {
    fatia, estrito, integradas: [...integradas],
    registro: reg,
    /** Declara uma resposta esperada pelo caso (401/403/404 de IDOR, 409, 429…). */
    esperar({ status, url, metodo } = {}) { esperadas.push({ status, url, metodo }); return monitor; },
    classificar,
    /**
     * Confere. `tipos` limita a verificação (ex.: ['pageerror']); padrão = tudo (D-73).
     * Devolve a classificação; com `lancar` (padrão) reprova se houver inesperadas.
     */
    async verificar({ tipos = null, lancar = true, rotulo = 'console e rede' } = {}) {
      const c = await classificar();
      const alvo = tipos ? c.inesperadas.filter((i) => tipos.includes(i.tipo)) : c.inesperadas;
      if (lancar) {
        expect(alvo, `${rotulo}: ocorrências inesperadas (fatia ${fatia || '—'}, integradas ${[...integradas].join(',') || '—'}${estrito ? ', QA_ESTRITO' : ''}):\n` +
          alvo.map((i) => `  [${i.tipo}] ${i.status || ''} ${i.metodo || ''} ${i.url || i.origem || ''} ${i.texto || i.mensagem || ''}`.replace(/\s+/g, ' ')).join('\n')).toEqual([]);
      }
      return c;
    },
    async anexar(nome = 'console-e-rede') {
      const c = await classificar();
      await test.info().attach(nome, { body: JSON.stringify({ fatia, estrito, integradas: [...integradas], posse: (await carregarPosse()).origem, ...c }, null, 2), contentType: 'application/json' });
      return c;
    }
  };
  _monitores.set(page, monitor);
  return monitor;
}

/** Atalho de D-73: declara uma resposta esperada no monitor já ligado à página. */
export function esperar(page, criterio) {
  const m = _monitores.get(page);
  if (!m) throw new Error('esperar(page): ligue monitorarConsoleERede(page) antes.');
  return m.esperar(criterio);
}

// ---------------------------------------------------------------------------
// confirmarNaTela(page, acao?) — aceita o confirm nativo OU clica no
// [data-pf-acao="confirmar"] do DMC_UI.confirmar (D-76). Ligue ANTES da ação:
//   await confirmarNaTela(page, () => botao.click());
//   // ou: const ok = confirmarNaTela(page); await botao.click(); await ok;
// Devolve 'nativo' | 'pf'. Sem nenhuma confirmação em `timeout` → lança.
// ---------------------------------------------------------------------------
export async function confirmarNaTela(page, acao = null, { timeout = 10_000 } = {}) {
  let via = null;
  const aoDialogo = async (d) => {
    if (via || d.type() === 'beforeunload') { await d.dismiss().catch(() => {}); return; }
    via = 'nativo';
    await d.accept().catch(() => {});
  };
  page.on('dialog', aoDialogo);
  try {
    if (acao) await acao();
    const fim = Date.now() + timeout;
    while (!via && Date.now() < fim) {
      const botao = page.locator('[data-pf-acao="confirmar"]:visible').first();
      if (await botao.count().catch(() => 0)) {
        via = 'pf';
        await botao.click();
        break;
      }
      await page.waitForTimeout(80);
    }
  } finally {
    page.off('dialog', aoDialogo);
  }
  if (!via) throw new Error('confirmarNaTela: nenhuma confirmação (nativa ou [data-pf-acao="confirmar"]) apareceu.');
  return via;
}

// ---------------------------------------------------------------------------
// Banco descartável do serve.mjs
// ---------------------------------------------------------------------------
let _estado = null;
export async function estadoQa(request) {
  if (!_estado) _estado = await (await request.get('/__qa/estado')).json();
  return _estado;
}

/** Pula o caso como "bloqueado" (com o motivo) quando o serve.mjs não tem mongod. */
export async function exigirMongo(request) {
  const est = await estadoQa(request);
  if (!est.mongo) {
    test.info().annotations.push({ type: 'bloqueado', description: `sem MongoDB descartável: ${est.motivo}` });
    test.skip(true, `bloqueado: ${est.motivo}`);
  }
  return est;
}

/** Abre uma conexão ao banco descartável, roda fn(db) e fecha. Recusa URI fora de loopback. */
export async function comBanco(request, fn) {
  const est = await estadoQa(request);
  if (!est.mongo) throw new Error(`banco descartável indisponível: ${est.motivo}`);
  if (!/^mongodb:\/\/127\.0\.0\.1:\d+\/?$/.test(est.mongo.uri)) throw new Error(`URI fora de loopback: ${est.mongo.uri}`);
  if (est.mongo.db === 'complexodmc_local') throw new Error('banco complexodmc_local é proibido nos testes.');
  const c = new MongoClient(est.mongo.uri, { serverSelectionTimeoutMS: 4000 });
  try { await c.connect(); return await fn(c.db(est.mongo.db)); } finally { await c.close(); }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export const uid = (prefixo = 'qa') => `${prefixo}-${crypto.randomBytes(5).toString('hex')}`;
export const ipNovo = () => `10.${crypto.randomInt(1, 254)}.${crypto.randomInt(1, 254)}.${crypto.randomInt(1, 254)}`;

/** CPF com dígitos verificadores válidos (só para o banco descartável). */
export function cpfValido() {
  let base;
  do { base = Array.from({ length: 9 }, () => crypto.randomInt(0, 10)); } while (new Set(base).size === 1);
  const dv = (nums) => { const s = nums.reduce((acc, n, i) => acc + n * (nums.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(base); const d2 = dv([...base, d1]);
  return [...base, d1, d2].join('');
}

export const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
export const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');
// Caixa ftyp de um MP4 (presença e src; a D5 não confere reprodução, D-77).
export const MP4_STUB = Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex');
export const VIMEO_ID = '76979871';
export const URL_VIMEO = `https://player.vimeo.com/video/${VIMEO_ID}`;
export const urlMp4 = (nome = uid('video')) => `/__qa/midia/${nome}.mp4`;

/** Vimeo sem rede externa: stub HTML no lugar do player (D-77). */
export async function rotearVimeo(page) {
  await page.route('https://player.vimeo.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="pt-BR"><title>stub QA</title><body style="margin:0;background:#16181c"></body></html>' }));
}
/** MP4 de mesma origem servido por page.route (D-77). */
export async function rotearMp4(page) {
  await page.route('**/__qa/midia/**', (r) => r.fulfill({ status: 200, contentType: 'video/mp4', body: MP4_STUB }));
}

// ---------------------------------------------------------------------------
// API com sessão
// ---------------------------------------------------------------------------
/** Cliente fino sobre o APIRequestContext com Bearer e IP simulado (throttle por IP). */
export function api(request, token = null, ip = ipNovo()) {
  const cab = (extra = {}) => ({ 'x-qa-cliente': ip, ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra });
  const corpo = async (r) => { const t = await r.text(); try { return t ? JSON.parse(t) : null; } catch { return t; } };
  const chamar = async (metodo, caminho, opts = {}) => {
    const r = await request.fetch(caminho, { method: metodo, headers: cab(opts.headers), data: opts.data, failOnStatusCode: false });
    return { status: r.status(), headers: r.headers(), json: await corpo(r), resposta: r };
  };
  return {
    get: (c, o) => chamar('GET', c, o),
    post: (c, data, o = {}) => chamar('POST', c, { ...o, data }),
    put: (c, data, o = {}) => chamar('PUT', c, { ...o, data }),
    del: (c, o) => chamar('DELETE', c, o),
    bruto: async (metodo, c, o = {}) => request.fetch(c, { method: metodo, headers: cab(o.headers), data: o.data, failOnStatusCode: false })
  };
}

/**
 * Simula um cliente distinto (throttle por IP do serve.mjs) SÓ nas chamadas de /api da
 * mesma origem. Não use page.setExtraHTTPHeaders: o cabeçalho iria também para as
 * fontes do Google e o preflight de CORS derrubaria as fontes (ruído criado pelo teste).
 */
export async function simularCliente(page, ip = ipNovo()) {
  await page.route((u) => u.pathname.startsWith('/api/') && /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(u.origin), (r) => r.continue({ headers: { ...r.request().headers(), 'x-qa-cliente': ip } }));
  return ip;
}

/**
 * Sessão no navegador SEM addInitScript (que reaplicaria o token a cada navegação):
 * abre /__qa/estado (mesma origem, rota só do serve.mjs) e grava o dmc:token.
 */
export async function entrarComToken(page, token, extras = {}) {
  await page.goto('/__qa/estado');
  await page.evaluate(({ t, e }) => {
    if (t) localStorage.setItem('dmc:token', t); else localStorage.removeItem('dmc:token');
    for (const [k, v] of Object.entries(e)) {
      if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  }, { t: token, e: extras });
}

// ---------------------------------------------------------------------------
// Papéis semeados direto no banco descartável (§9.4, §8.5 F0s): o usuário é gravado
// em `users` com `papel` (e `isAdmin` coerente) e a sessão sai do login real
// (POST /api/auth/signin), então o token é o do código em teste.
// ---------------------------------------------------------------------------
function dentroDeTeste() {
  try { test.info(); return true; } catch { return false; }
}

export async function criarUsuario(request, { papel = 'aluno', nome = null, rotulo = papel } = {}) {
  if (dentroDeTeste()) await exigirMongo(request);
  const email = `qa-${rotulo}-${crypto.randomBytes(5).toString('hex')}@exemplo.invalid`;
  const senha = `Qa-${crypto.randomBytes(9).toString('base64url')}`;
  const nomeFinal = nome || `Pessoa QA ${rotulo} ${crypto.randomBytes(2).toString('hex')}`;
  const senhaHash = await bcrypt.hash(senha, 10);
  const doc = { email, senhaHash, nome: nomeFinal, isAdmin: papel === 'admin', papel, createdAt: new Date() };
  const id = await comBanco(request, async (db) => String((await db.collection('users').insertOne(doc)).insertedId));
  const r = await api(request).post('/api/auth/signin', { email, senha });
  expect(r.status, `signin do ${papel} semeado: ${JSON.stringify(r.json)}`).toBe(200);
  return { id, email, senha, nome: nomeFinal, papel, token: r.json.token, user: r.json.user };
}

/** aluno, professor (sem vínculo ainda — docências são da F0t) e admin. */
export async function criarPapeis(request) {
  const [aluno, professor, admin] = await Promise.all([
    criarUsuario(request, { papel: 'aluno' }),
    criarUsuario(request, { papel: 'professor' }),
    criarUsuario(request, { papel: 'admin' })
  ]);
  return { aluno, professor, admin };
}

// ---------------------------------------------------------------------------
// Sementes de catálogo (ids string, como o legado: cursos/modulos/aulas/lives)
// ---------------------------------------------------------------------------
/**
 * Curso com UM módulo. `aulas`: [{ titulo?, videoUrl?, disponivel? }] (padrão: 2 aulas no ar).
 * Sem avaliação: hoje nenhuma coleção de avaliação existe (curso "sem avaliação", R9).
 */
export async function semearCurso(request, { titulo = null, preco = 497, ordem = 900 + crypto.randomInt(0, 99), cargaHoraria = '12h', aulas = null, modulos = 1 } = {}) {
  const cursoId = uid('qa-c');
  const tituloFinal = titulo || `Curso de teste ${cursoId.slice(-6)}`;
  const listaAulas = aulas || [{}, {}];
  const mods = Array.from({ length: modulos }, (_, i) => ({ _id: uid('qa-m'), cursoId, numero: String(i + 1).padStart(2, '0'), titulo: `Módulo de teste ${i + 1} ${cursoId.slice(-4)}`, resumo: '', duracao: '1h', ordem: i + 1, createdAt: new Date() }));
  const docsAulas = listaAulas.map((a, i) => ({
    _id: uid('qa-a'), moduloId: mods[0]._id, titulo: a.titulo || `Aula de teste ${i + 1} ${cursoId.slice(-4)}`,
    duracao: '10min', videoUrl: a.videoUrl == null ? '' : a.videoUrl, ordem: i + 1, disponivel: a.disponivel !== false, materiais: [], createdAt: new Date()
  }));
  await comBanco(request, async (db) => {
    await db.collection('cursos').insertOne({ _id: cursoId, titulo: tituloFinal, subtitulo: '', descricao: 'Curso semeado para a regressão D5.', cargaHoraria, modalidade: 'Online', iconeKey: 'graduation', preco, linkCheckout: '', beneficios: [], ordem, isAtivo: true, createdAt: new Date() });
    await db.collection('modulos').insertMany(mods);
    if (docsAulas.length) await db.collection('aulas').insertMany(docsAulas);
  });
  return {
    cursoId, titulo: tituloFinal, preco, cargaHoraria,
    modulos: mods.map((m) => ({ id: m._id, titulo: m.titulo })),
    moduloId: mods[0]._id,
    aulas: docsAulas.map((a) => ({ id: a._id, titulo: a.titulo, videoUrl: a.videoUrl, disponivel: a.disponivel }))
  };
}

export async function liberarCurso(request, userId, cursoId) {
  await comBanco(request, (db) => db.collection('liberacoes').updateOne(
    { userId: String(userId), cursoId },
    { $setOnInsert: { userId: String(userId), cursoId, grantedAt: new Date(), grantedBy: 'qa-semente' } },
    { upsert: true }
  ));
}

export async function concluirAulas(request, userId, aulaIds) {
  if (!aulaIds.length) return;
  await comBanco(request, (db) => db.collection('progresso').bulkWrite(aulaIds.map((aulaId) => ({
    updateOne: { filter: { userId: String(userId), aulaId }, update: { $setOnInsert: { userId: String(userId), aulaId, completedAt: new Date() } }, upsert: true }
  }))));
}

/** Três encontros pelo relógio: agendada (+2 d), ao vivo (começou há 10 min, 90 min), encerrada (−3 d). */
export async function semearLives(request, cursoId) {
  const agora = Date.now();
  const base = (rot, inicio) => ({ _id: uid('qa-l'), cursoId, titulo: `Encontro ${rot} ${cursoId.slice(-4)}`, descricao: '', inicioEm: new Date(inicio), duracaoMin: 90, url: `https://sala.exemplo.invalid/${rot}-${crypto.randomBytes(3).toString('hex')}`, plataforma: 'Sala QA', createdAt: new Date() });
  const lives = { agendada: base('agendada', agora + 2 * 864e5), aoVivo: base('ao-vivo', agora - 10 * 60e3), encerrada: base('encerrada', agora - 3 * 864e5) };
  await comBanco(request, (db) => db.collection('lives').insertMany(Object.values(lives)));
  return Object.fromEntries(Object.entries(lives).map(([k, l]) => [k, { id: l._id, titulo: l.titulo, url: l.url, inicioEm: l.inicioEm.toISOString() }]));
}

/**
 * Semente do R9: aluno com perfil IDENTIFICADO (nome de registro e CPF gravados direto
 * em `perfis`, formato da API §3.3; `users.nome` = nome de registro, como o perfil manterá)
 * + curso sem avaliação, liberado e com 100% das aulas disponíveis concluídas.
 */
export async function semearR9(request) {
  const nomeRegistro = `Aluna Identificada QA ${crypto.randomBytes(2).toString('hex')}`;
  const aluno = await criarUsuario(request, { papel: 'aluno', nome: nomeRegistro, rotulo: 'r9' });
  const curso = await semearCurso(request, { aulas: [{}, {}, { disponivel: false }] });
  const cpf = cpfValido();
  await comBanco(request, (db) => db.collection('perfis').insertOne({
    userId: aluno.id, nomeRegistro, nomeSocial: null, cpf, passaporte: null, nascimento: null, rg: null,
    genero: null, etnia: null, estadoCivil: null, nacionalidade: null, naturalidade: null, celular: null,
    redes: { instagram: null, facebook: null }, endereco: null, fotoArquivoId: null,
    consentimentos: { genero: null, etnia: null, nomeSocial: null, redes: null, foto: null },
    menorDeIdade: false, versao: 1, criadoEm: new Date(), atualizadoEm: new Date(), atualizadoPor: 'qa-semente'
  }));
  await liberarCurso(request, aluno.id, curso.cursoId);
  await concluirAulas(request, aluno.id, curso.aulas.filter((a) => a.disponivel).map((a) => a.id));
  return { aluno, curso, perfil: { nomeRegistro, cpf } };
}

/** Semente do R9b: aluno SEM perfil, mesmo cenário de curso (D-53, API DC-64). */
export async function semearR9b(request) {
  const aluno = await criarUsuario(request, { papel: 'aluno', rotulo: 'r9b' });
  const curso = await semearCurso(request, { aulas: [{}, {}] });
  await liberarCurso(request, aluno.id, curso.cursoId);
  await concluirAulas(request, aluno.id, curso.aulas.map((a) => a.id));
  return { aluno, curso };
}

/** A fatia está montada no servidor? (sonda uma rota dela com sessão; 404 = ausente). */
export async function fatiaMontada(request, token, sonda) {
  const r = await api(request, token).get(sonda);
  return r.status !== 404;
}

// ---------------------------------------------------------------------------
// Capturas (linha de base §9.2 item 1; evidência fora do git, T4)
// ---------------------------------------------------------------------------
export async function prepararCaptura(page) {
  await page.evaluate(async () => { try { await document.fonts.ready; } catch { /* sem FontFaceSet */ } });
  await page.waitForTimeout(250);
}

/** Captura de página inteira em `dir/<nome>-<largura>.png`; devolve { arquivo, sha256 }. */
export async function capturar(page, { nome, largura, dir, fullPage = true, mascarar = [] }) {
  fs.mkdirSync(dir, { recursive: true });
  await prepararCaptura(page);
  const arquivo = path.join(dir, `${nome}-${largura}.png`);
  const buf = await page.screenshot({ path: arquivo, fullPage, animations: 'disabled', caret: 'hide', mask: mascarar.map((s) => page.locator(s)) });
  return { arquivo, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

/**
 * Captura determinística (para "idêntica antes/depois"): sem rede externa (fontes do
 * Google bloqueadas → fonte de reserva estável), movimento reduzido, animações paradas e
 * <canvas> OCULTO por CSS (cena WebGL; máscara não serve: o canvas ocupa a tela inteira e
 * a máscara pinta por cima de tudo). Mesma máquina + mesmo código → mesmos pixels.
 */
export async function capturaDeterministica(browser, baseURL, { caminho, largura, altura = 900, dir, nome, ocultar = ['canvas'] }) {
  const ctx = await browser.newContext({ baseURL, viewport: { width: largura, height: altura }, reducedMotion: 'reduce', colorScheme: 'dark', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  try {
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto(caminho, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await prepararCaptura(page);
    fs.mkdirSync(dir, { recursive: true });
    const arquivo = path.join(dir, `${nome}-${largura}.png`);
    const buf = await page.screenshot({ path: arquivo, fullPage: true, animations: 'disabled', caret: 'hide', style: ocultar.length ? `${ocultar.join(',')}{visibility:hidden !important}` : undefined });
    return { arquivo, buf, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
  } finally {
    await ctx.close();
  }
}

/** Decodificador PNG mínimo (8 bits, RGB/RGBA, sem entrelaçamento — o que o Chromium gera). */
export function decodificarPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('não é PNG');
  let i = 8; let largura = 0; let altura = 0; let tipo = 0; let prof = 0; let entrel = 0; const idat = [];
  while (i < buf.length) {
    const n = buf.readUInt32BE(i); const t = buf.toString('latin1', i + 4, i + 8); const d = buf.subarray(i + 8, i + 8 + n);
    if (t === 'IHDR') { largura = d.readUInt32BE(0); altura = d.readUInt32BE(4); prof = d[8]; tipo = d[9]; entrel = d[12]; }
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    i += 12 + n;
  }
  if (prof !== 8 || ![2, 6].includes(tipo) || entrel) throw new Error(`PNG não suportado (prof ${prof}, tipo ${tipo}, entrelaçado ${entrel})`);
  const bpp = tipo === 6 ? 4 : 3; const linha = largura * bpp;
  const cru = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(altura * linha);
  for (let y = 0; y < altura; y++) {
    const f = cru[y * (linha + 1)]; const ini = y * (linha + 1) + 1;
    for (let x = 0; x < linha; x++) {
      const a = x >= bpp ? px[y * linha + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * linha + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * linha + x - bpp] : 0;
      const v = cru[ini + x];
      let r;
      if (f === 0) r = v; else if (f === 1) r = v + a; else if (f === 2) r = v + b; else if (f === 3) r = v + ((a + b) >> 1);
      else { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      px[y * linha + x] = r & 0xff;
    }
  }
  return { largura, altura, bpp, px };
}

/** Fração de pixels diferentes do pixel (0,0): captura "lisa" (tudo fundo) dá ~0. */
export function conteudoPng(buf) {
  const { largura, altura, bpp, px } = decodificarPng(buf);
  const total = largura * altura; let dif = 0;
  for (let p = 0; p < total; p++) {
    if (px[p * bpp] !== px[0] || px[p * bpp + 1] !== px[1] || px[p * bpp + 2] !== px[2]) dif++;
  }
  return { largura, altura, fracaoDiferenteDoFundo: dif / total };
}

/** { identicas, mesmasDimensoes, pixelsDiferentes, total } entre dois PNG. */
export function compararPng(a, b) {
  if (Buffer.compare(a, b) === 0) return { identicas: true, mesmasDimensoes: true, pixelsDiferentes: 0, total: null };
  const A = decodificarPng(a); const B = decodificarPng(b);
  if (A.largura !== B.largura || A.altura !== B.altura) return { identicas: false, mesmasDimensoes: false, pixelsDiferentes: null, total: null, dimensoes: [`${A.largura}x${A.altura}`, `${B.largura}x${B.altura}`] };
  let dif = 0; const total = A.largura * A.altura;
  for (let p = 0; p < total; p++) {
    for (let k = 0; k < 3; k++) { if (A.px[p * A.bpp + k] !== B.px[p * B.bpp + k]) { dif++; break; } }
  }
  return { identicas: dif === 0, mesmasDimensoes: true, pixelsDiferentes: dif, total };
}
