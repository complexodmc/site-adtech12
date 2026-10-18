// Portal · F0r — guarda estática do front da plataforma EAD (PORTAL-UX.md §3 fase E.1;
// PORTAL-ACADEMICO.md §6.1, §8.3, D-46, D-62, D-73). Roda no `npm test`, sem rede e sem banco.
//
// Varre complexodmc.com.br/plataforma-ead/**/*.{css,html,js} e reprova o que a identidade da
// DMC e a CSP estrita de /plataforma-ead/ não aceitam: neon ciano/verde, fontes antigas, texto
// em degradê, brilho, peso acima de 600, pílula 999px, `transition: all`, fundo decorativo
// legado, cor inline (HTML e JS), emoji, <script> sem src e atributo on*=.
//
// Modos (D-62):
//   (sem variável) ............ G0 e integração de cada G1: varre tudo, menos as entradas de
//                               PENDENTES_FASE_1 (legado de fatia da fase 1 ainda em obra).
//   QA_FATIA=<fatia> .......... só os arquivos da fatia (POSSE); entrada da fatia ainda em
//                               PENDENTES_FASE_1 reprova (o G1 da dona exige a entrada limpa).
//   QA_ESTRITO=1 .............. G2: varre tudo, ignora PENDENTES_FASE_1 e reprova arquivo da
//                               plataforma sem dono em POSSE.
//
// POSSE (caminho → fatia) mora em tests/tools/posse-ead.mjs (F0r), copiada de §8.1 e usada
// também pelo monitorarConsoleERede do _portal.js (D-73). Mudar posse = pedido à F0r via
// principal. Nenhuma exclusão usa número de linha.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  POSSE, FATIAS, DONO_2D, DONO_NINGUEM, RAIZ_REPO, RAIZ_EAD,
  donoDe, arquivosNoDisco, lerPosseDoDocumento, POSSE_PASTAS,
} from '../../tests/tools/posse-ead.mjs';

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

/** Fatias da fase 0 (§8.3): nenhum arquivo delas pode ficar em PENDENTES_FASE_1. */
const FASE_0 = Object.freeze(['F0a', 'F0m', 'F0b', 'F0s', 'F0r']);
/** Fatias da fase 1 (§8.3). A F0r também trabalha na fase 1 (tutoriais), mas é da fase 0. */
const FASE_1 = Object.freeze(FATIAS.filter((f) => !FASE_0.includes(f)));

/**
 * PENDENTES_FASE_1 — arquivos legados de fatias da FASE 1 que ainda violam a guarda no G0 e
 * que as fatias da fase 0 não podem tocar (§8.3, D-46). Caminho (relativo a plataforma-ead/) →
 * fatia dona. Cada dona esvazia a própria entrada no seu G1 (QA_FATIA reprova a entrada que
 * ainda estiver aqui); no G2 a principal apaga a constante, já vazia por regra.
 * Lista final = o que o teste encontrou no G0 (18/10/2026); só fatias da fase 1.
 */
const PENDENTES_FASE_1 = Object.freeze({
  'css/portal-estudos.css': 'F1b', // border-radius: 999px
  'js/portal/perfil.js': 'F0p', // emoji (U+2194)
  'js/portal/prof-duvidas.js': 'F8', // emoji (U+2197)
});

/**
 * Exclusões fixas (motivo de cada uma; nada por número de linha):
 *  - sessão 2d: login.html, login-classico.html, css/business-school.css, js/business-school.js
 *    — proibidos a todas as fatias (§3.4); login-classico.html é a única página fora do padrão
 *    (CEO-5) e só sai com a aposentadoria (D-44);
 *  - css/login.css, js/eixo-3d.js, js/login/* — servem só a login-classico.html (dono: ninguém);
 *  - js/vendor/* — biblioteca de terceiro vendorizada (QR, three.js), não é código nosso.
 */
const EXCLUIDOS = Object.freeze({
  'login.html': 'sessão 2d (proibido, §3.4)',
  'login-classico.html': 'sessão 2d (proibido, §3.4; fora do padrão até D-44)',
  'css/business-school.css': 'sessão 2d (proibido, §3.4)',
  'js/business-school.js': 'sessão 2d (proibido, §3.4)',
  'css/login.css': 'só login-classico.html (dono: ninguém)',
  'js/eixo-3d.js': 'só login-classico.html (dono: ninguém)',
});
const PASTAS_EXCLUIDAS = Object.freeze({
  'js/login/': 'só login-classico.html (dono: ninguém)',
  'js/vendor/': 'biblioteca de terceiro vendorizada',
});

/**
 * Trechos marcados que a guarda ignora, cada um só no seu arquivo (§6.1, UX §3 fase 0 e A):
 * o :root legado e as seções LOGIN/EIXO 3D de plataforma.css são lidos por
 * login-classico.html (sem tokens.css); o @dmc-compat de portal.css neutraliza classes
 * legadas até a limpeza da F0s-final. Marcador sem par, aninhado ou fora do arquivo reprova.
 */
const MARCADORES = Object.freeze({
  'dmc-root-legado': 'css/plataforma.css',
  'dmc-legado-login': 'css/plataforma.css',
  'dmc-compat': 'css/portal.css',
});

/** Regras da guarda (UX §3 E.1). `em`: extensões em que a regra vale. */
const REGRAS = Object.freeze([
  { id: 'neon-hex', re: /#(?:00e7fc|00ff4d|00b8cc|00cfb6|00f5b4|0a7d8c)\b/gi, em: ['css', 'html', 'js'] },
  { id: 'neon-rgba', re: /rgba?\(\s*0\s*,\s*(?:231|255)\b/gi, em: ['css', 'html', 'js'] },
  { id: 'fonte-antiga', re: /Raleway|DM Sans|DM\+Sans|Playfair|Poppins/g, em: ['css', 'html', 'js'] },
  { id: 'texto-em-degrade', re: /-webkit-text-fill-color\s*:\s*transparent/gi, em: ['css', 'html', 'js'] },
  { id: 'brilho', re: /var\(\s*--glow/g, em: ['css', 'html', 'js'] },
  { id: 'peso-acima-de-600', re: /font-weight\s*:\s*(?:700|800|900)\b/g, em: ['css', 'html', 'js'] },
  { id: 'pilula-999px', re: /border-radius\s*:\s*999px/g, em: ['css', 'html', 'js'] },
  { id: 'transition-all', re: /transition\s*:\s*all\b/g, em: ['css', 'html', 'js'] },
  { id: 'bg-grid', re: /bg-grid/g, em: ['css', 'html', 'js'] },
  { id: 'glow-corner', re: /glow-corner/g, em: ['css', 'html', 'js'] },
  { id: 'cor-inline', re: /\bstyle\s*=\s*(?:"[^"]*\b(?:color|background|border)[^"]*"|'[^']*\b(?:color|background|border)[^']*')/gi, em: ['html', 'js'] },
  { id: 'cor-por-style-js', re: /\.style\.(?:color|background|backgroundColor|borderColor)\s*=/g, em: ['js'] },
  { id: 'script-sem-src', re: /<script\b(?![^>]*\bsrc\s*=)[^>]*>/gi, em: ['html'] },
  { id: 'atributo-on', re: /<[a-z][^>]*?\son[a-z]+\s*=\s*["']/gi, em: ['html', 'js'] },
  { id: 'cinza-em-data-uri', re: /data:[^"()]{0,4000}?(?:#|%23)bfbdb9/gi, em: ['css', 'html', 'js'] },
]);

/** Emoji = \p{Extended_Pictographic} (UX §3 E.1), inclusive em comentário. */
const RE_EMOJI = /\p{Extended_Pictographic}️?/gu;

const EXT = (c) => (c.match(/\.(css|html|js)$/) || [])[1] || null;
const LIMITE_ACHADOS = 12;

// ---------------------------------------------------------------------------
// Funções (exportadas só para os casos de teste deste arquivo)
// ---------------------------------------------------------------------------

/** Exclusão fixa do caminho (motivo) ou null. */
function motivoExcluido(c) {
  if (EXCLUIDOS[c]) return EXCLUIDOS[c];
  for (const [p, m] of Object.entries(PASTAS_EXCLUIDAS)) if (c.startsWith(p)) return m;
  return null;
}

/**
 * Apaga (trocando por espaço, preservando as quebras de linha para o número da linha) os
 * trechos entre marcadores. Reprova marcador fora do arquivo dele, sem par ou aninhado.
 * Devolve { texto, erros }.
 */
function semTrechosMarcados(caminho, texto) {
  const erros = [];
  const re = /@(dmc-[a-z-]+):(inicio|fim)\b/g;
  const pilha = [];
  const trechos = [];
  for (const m of texto.matchAll(re)) {
    const nome = m[1];
    if (!Object.hasOwn(MARCADORES, nome)) continue; // @dmc-cabecalho e outros: não excluem nada
    const linha = texto.slice(0, m.index).split('\n').length;
    if (MARCADORES[nome] !== caminho) {
      erros.push(`${caminho}:${linha} marcador @${nome} fora de ${MARCADORES[nome]}`);
      continue;
    }
    if (m[2] === 'inicio') {
      if (pilha.length) erros.push(`${caminho}:${linha} marcador @${nome}:inicio aninhado em @${pilha[pilha.length - 1].nome}`);
      pilha.push({ nome, i: m.index, linha });
    } else {
      const topo = pilha.pop();
      if (!topo) { erros.push(`${caminho}:${linha} marcador @${nome}:fim sem início`); continue; }
      if (topo.nome !== nome) { erros.push(`${caminho}:${linha} marcador @${nome}:fim fecha @${topo.nome}`); continue; }
      trechos.push([topo.i, m.index + m[0].length]);
    }
  }
  for (const p of pilha) erros.push(`${caminho}:${p.linha} marcador @${p.nome}:inicio sem fim`);
  let saida = texto;
  for (const [a, b] of trechos.sort((x, y) => y[0] - x[0])) {
    saida = saida.slice(0, a) + saida.slice(a, b).replace(/[^\n]/g, ' ') + saida.slice(b);
  }
  return { texto: saida, erros };
}

/** Achados de um arquivo: [{ regra, linha, trecho }]. */
function varrer(caminho, textoOriginal) {
  const ext = EXT(caminho);
  const { texto, erros } = semTrechosMarcados(caminho, textoOriginal);
  const achados = erros.map((e) => ({ regra: 'marcador', linha: Number(e.split(':')[1]) || 0, trecho: e }));
  const linhaDe = (i) => texto.slice(0, i).split('\n').length;
  for (const r of REGRAS) {
    if (!r.em.includes(ext)) continue;
    for (const m of texto.matchAll(r.re)) achados.push({ regra: r.id, linha: linhaDe(m.index), trecho: m[0].slice(0, 80) });
  }
  for (const m of texto.matchAll(RE_EMOJI)) achados.push({ regra: 'emoji', linha: linhaDe(m.index), trecho: m[0] });
  return achados.sort((a, b) => a.linha - b.linha);
}

/** Arquivos .css/.html/.js da plataforma (relativos a plataforma-ead/). */
function arquivosDaPlataforma() {
  return arquivosNoDisco().filter((c) => EXT(c));
}

function ler(c) {
  return fs.readFileSync(path.join(RAIZ_EAD, c), 'utf8');
}

function formatar(lista) {
  return lista.map(({ caminho, dono, achados }) => {
    const resumo = achados.slice(0, LIMITE_ACHADOS).map((a) => `    l.${a.linha} [${a.regra}] ${a.trecho}`).join('\n');
    const resto = achados.length > LIMITE_ACHADOS ? `\n    … e mais ${achados.length - LIMITE_ACHADOS}` : '';
    return `  ${caminho} (${dono ?? 'sem dono'}) — ${achados.length} achado(s)\n${resumo}${resto}`;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Modo
// ---------------------------------------------------------------------------
const QA_FATIA = process.env.QA_FATIA || null;
const QA_ESTRITO = process.env.QA_ESTRITO === '1';
const MODO = QA_ESTRITO ? 'estrito (G2)' : QA_FATIA ? `fatia ${QA_FATIA}` : 'padrão (G0 / integração)';

describe(`front-estatico · guarda da plataforma EAD — modo ${MODO}`, () => {
  test('modo válido: QA_FATIA é uma fatia de §8.1', () => {
    if (QA_FATIA) assert.ok(FATIAS.includes(QA_FATIA), `QA_FATIA desconhecida: ${QA_FATIA} (esperado: ${FATIAS.join(', ')})`);
  });

  test('PENDENTES_FASE_1 só tem arquivos de fatias da fase 1, com o dono de POSSE', () => {
    const erros = [];
    for (const [c, fatia] of Object.entries(PENDENTES_FASE_1)) {
      const dono = donoDe(c);
      if (!FASE_1.includes(fatia)) erros.push(`${c}: ${fatia} não é fatia da fase 1 (F0b, F0s e F0r nunca entram, §8.3)`);
      if (dono !== fatia) erros.push(`${c}: PENDENTES_FASE_1 diz ${fatia}, POSSE diz ${dono ?? 'sem dono'}`);
      if (!fs.existsSync(path.join(RAIZ_EAD, c))) erros.push(`${c}: arquivo não existe`);
    }
    assert.deepEqual(erros, []);
  });

  test('POSSE (tests/tools/posse-ead.mjs) igual à tabela de §8.1 do índice', () => {
    const doc = lerPosseDoDocumento();
    assert.deepEqual(doc.repetidos, [], '§8.1 põe o mesmo caminho em dois donos');
    assert.deepEqual({ ...POSSE }, doc.posse, 'POSSE diverge de §8.1 (pedido à F0r via principal)');
    assert.deepEqual({ ...POSSE_PASTAS }, doc.pastas, 'pastas de POSSE divergem de §8.1');
  });

  test('literais do tema escuro religados em portal.css iguais aos de tokens.css (UX §2.2)', () => {
    const portal = fs.readFileSync(path.join(RAIZ_EAD, 'css/portal.css'), 'utf8');
    // Sem comentários: o cabeçalho de tokens.css traz o mapa neon → ouro com nomes de token.
    const tokens = fs.readFileSync(path.join(RAIZ_REPO, 'complexodmc.com.br/assets/css/tokens.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const norm = (v) => v.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').toLowerCase();
    const religados = [...portal.matchAll(/(--pf-[\w-]+)\s*:\s*([^;]+);\s*\/\*\s*=\s*(--[\w-]+) de tokens\.css \(religado\)/g)];
    assert.ok(religados.length >= 6, `esperava ≥ 6 literais religados anotados em portal.css, achei ${religados.length}`);
    const erros = [];
    for (const [, pf, valor, token] of religados) {
      // A 1ª declaração é a do :root (as seguintes são variações por eixo do site).
      const m = tokens.match(new RegExp(`(?:^|[;{\\s])${token.replace(/-/g, '\\-')}\\s*:\\s*([^;]+);`));
      if (!m) { erros.push(`${pf}: ${token} não existe em tokens.css`); continue; }
      if (norm(m[1]) !== norm(valor)) erros.push(`${pf}: portal.css "${valor.trim()}" ≠ tokens.css ${token} "${m[1].trim()}"`);
    }
    assert.deepEqual(erros, []);
  });

  test('marcadores de exclusão: só no arquivo deles, em par e sem aninhar', () => {
    const erros = [];
    for (const c of arquivosDaPlataforma()) {
      if (motivoExcluido(c)) continue;
      erros.push(...semTrechosMarcados(c, ler(c)).erros);
    }
    for (const [nome, arq] of Object.entries(MARCADORES)) {
      if (!ler(arq).includes(`@${nome}:inicio`)) erros.push(`${arq}: marcador @${nome} ausente (o trecho congelado precisa estar marcado)`);
    }
    assert.deepEqual(erros, []);
  });

  test(`nenhuma violação da guarda (${MODO})`, (t) => {
    const todos = arquivosDaPlataforma();
    const alvo = [];
    const semDono = [];
    const pulados = { excluidos: 0, pendentes: [] };
    for (const c of todos) {
      if (motivoExcluido(c)) { pulados.excluidos++; continue; }
      const dono = donoDe(c);
      if (QA_FATIA) {
        if (dono !== QA_FATIA) continue;
        alvo.push(c);
        continue;
      }
      if (dono === null) semDono.push(c);
      if (!QA_ESTRITO && Object.hasOwn(PENDENTES_FASE_1, c)) { pulados.pendentes.push(c); continue; }
      alvo.push(c);
    }

    const reprovados = [];
    for (const c of alvo) {
      const achados = varrer(c, ler(c));
      if (achados.length) reprovados.push({ caminho: c, dono: donoDe(c), achados });
    }
    const erros = [];
    if (reprovados.length) erros.push(`violações da guarda (UX §3 E.1):\n${formatar(reprovados)}`);
    if (QA_FATIA) {
      const daFatia = Object.entries(PENDENTES_FASE_1).filter(([, f]) => f === QA_FATIA).map(([c]) => c);
      if (daFatia.length) erros.push(`entrada da ${QA_FATIA} ainda em PENDENTES_FASE_1 (o G1 exige a entrada limpa): ${daFatia.join(', ')}`);
    }
    if (QA_ESTRITO && semDono.length) erros.push(`arquivos da plataforma sem dono em POSSE (§8.1): ${semDono.join(', ')}`);

    // Diagnóstico: entradas de PENDENTES_FASE_1 que já passariam (a dona pode tirá-las).
    if (!QA_FATIA && !QA_ESTRITO) {
      const limpas = pulados.pendentes.filter((c) => varrer(c, ler(c)).length === 0);
      if (limpas.length) t.diagnostic(`PENDENTES_FASE_1 já limpas (podem sair): ${limpas.join(', ')}`);
      if (semDono.length) t.diagnostic(`sem dono em POSSE (reprova só com QA_ESTRITO=1): ${semDono.join(', ')}`);
    }
    t.diagnostic(`varridos ${alvo.length} de ${todos.length}; excluídos ${pulados.excluidos}; pendentes tolerados ${pulados.pendentes.length}`);
    assert.ok(alvo.length > 0 || QA_FATIA, 'nenhum arquivo varrido');
    assert.equal(erros.length, 0, erros.join('\n\n'));
  });
});

// ---------------------------------------------------------------------------
// A própria guarda: cada regra pega o padrão barrado e deixa passar o equivalente da casa.
// ---------------------------------------------------------------------------
describe('front-estatico · as regras pegam o que devem (amostras sintéticas)', () => {
  const casos = [
    ['css/x.css', '.a { color: #00E7FC; }', 'neon-hex'],
    ['css/x.css', '.a { background: rgba(0,255,77,.1); }', 'neon-rgba'],
    ['css/x.css', '.a { border-color: rgba( 0 , 231 , 252 , 0.4); }', 'neon-rgba'],
    ['css/x.css', '.a { font-family: "DM Sans", sans-serif; }', 'fonte-antiga'],
    ['html.html', '<link href="https://fonts.googleapis.com/css2?family=Raleway">', 'fonte-antiga'],
    ['css/x.css', '.a { -webkit-text-fill-color: transparent; }', 'texto-em-degrade'],
    ['css/x.css', '.a { box-shadow: var(--glow-cyan); }', 'brilho'],
    ['css/x.css', '.a { font-weight: 800; }', 'peso-acima-de-600'],
    ['css/x.css', '.a { border-radius: 999px; }', 'pilula-999px'],
    ['css/x.css', '.a { transition: all .2s; }', 'transition-all'],
    ['html.html', '<body class="bg-grid">', 'bg-grid'],
    ['html.html', '<div class="glow-corner"></div>', 'glow-corner'],
    ['html.html', '<p style="color:#86efac">x</p>', 'cor-inline'],
    ['js/x.js', "el.innerHTML = '<p style=\"text-align:center;color:var(--ink-2)\">x</p>';", 'cor-inline'],
    ['js/x.js', "s.style.borderColor = 'red';", 'cor-por-style-js'],
    ['html.html', '<script>DMC_bootLoja();</script>', 'script-sem-src'],
    ['html.html', '<button onclick="x()">', 'atributo-on'],
    ['js/x.js', 'h = `<a onclick="go()">`;', 'atributo-on'],
    ['css/x.css', ".a { background: url(\"data:image/svg+xml,%3Csvg fill='%23bfbdb9'\"); }", 'cinza-em-data-uri'],
    ['html.html', '<!-- ⚠️ DEV-ONLY -->', 'emoji'],
  ];
  for (const [arq, texto, regra] of casos) {
    test(`${regra} ← ${texto.slice(0, 60)}`, () => {
      assert.ok(varrer(arq, texto).some((a) => a.regra === regra), `a regra ${regra} não pegou`);
    });
  }
  const limpos = [
    ['css/x.css', '.a { color: rgba(var(--pf-acento-rgb), .08); font-weight: var(--fw-semibold); border-radius: var(--radius-1); transition: var(--transition-state); }'],
    ['html.html', '<script src="js/portal/boot-loja.js?v=dev"></script><p class="pf-alerta" hidden>Modo de desenvolvimento</p>'],
    ['js/x.js', "el.style.display = ''; img.onload = () => {}; const c = 'Plataforma Complexo DMC';"],
    ['css/x.css', '.a { color: rgba(0, 0, 0, .5); background: rgba(10,10,10,.6); }'],
  ];
  for (const [arq, texto] of limpos) {
    test(`passa: ${texto.slice(0, 60)}`, () => assert.deepEqual(varrer(arq, texto), []));
  }
  test('marcador sem par, aninhado ou fora do arquivo reprova', () => {
    assert.match(semTrechosMarcados('css/plataforma.css', '/* @dmc-root-legado:inicio */ .a{}').erros.join(), /sem fim/);
    assert.match(semTrechosMarcados('css/plataforma.css', '/* @dmc-root-legado:inicio */ /* @dmc-legado-login:inicio */ /* @dmc-legado-login:fim */ /* @dmc-root-legado:fim */').erros.join(), /aninhado/);
    assert.match(semTrechosMarcados('css/outro.css', '/* @dmc-compat:inicio */ /* @dmc-compat:fim */').erros.join(), /fora de css\/portal\.css/);
    const ok = semTrechosMarcados('css/portal.css', 'a\n/* @dmc-compat:inicio */\n.bg-grid{}\n/* @dmc-compat:fim */\nb');
    assert.deepEqual(ok.erros, []);
    assert.equal(ok.texto.split('\n').length, 5, 'preserva as linhas');
    assert.ok(!ok.texto.includes('bg-grid'));
  });
  test('arquivos excluídos têm motivo e são os de §6.1', () => {
    for (const c of ['login.html', 'login-classico.html', 'css/business-school.css', 'js/business-school.js', 'css/login.css', 'js/eixo-3d.js', 'js/login/cena-three.js', 'js/vendor/three/three.min.js', 'js/vendor/qrcode-generator/qrcode.js']) {
      assert.ok(motivoExcluido(c), `${c} deveria estar excluído`);
    }
    for (const c of ['css/plataforma.css', 'css/portal.css', 'js/app.js', 'loja.html']) assert.equal(motivoExcluido(c), null);
    assert.equal(donoDe('login.html'), DONO_2D);
    assert.equal(donoDe('js/login/x.js'), DONO_NINGUEM);
  });
});
