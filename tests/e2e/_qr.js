// =============================================================
// Conferência determinística do QR dos documentos (F0r · D-68; PORTAL-ACADEMICO.md §9.6).
//
// O Chromium do repositório não tem BarcodeDetector e o headless não rasteriza PDF; por isso
// o QR é conferido pela MATRIZ: a do SVG que o DMC_QR desenhou na página é comparada, módulo a
// módulo, com a que o MESMO gerador vendorizado (js/vendor/qrcode-generator/qrcode.js, MIT)
// produz aqui no Node para o texto esperado (em geral a URL de validar.html?codigo=). Também
// confere a zona de silêncio (≥ 4 módulos) e o lado impresso (≥ 28 mm sob `print`, 96 px =
// 25,4 mm) e guarda a captura do bloco como evidência. A leitura com celular fica no checklist
// de homologação (§9.9 item 2a), feita pela principal. Nenhuma dependência nova.
//
// Uso (F3b, F4b e o portal-qualidade):
//   import { conferirQrNaPagina, urlDeValidacao } from './_qr.js';
//   const r = await conferirQrNaPagina(page, {
//     seletor: '.pf-dec-qr svg', texto: urlDeValidacao(codigo, { base: baseURL }),
//     evidencia: { dir: 'docs/dmc/qa/<data>/qr', nome: 'declaracao' } });
//   // r = { iguais, diferencas, modulos, margem, ladoMm, captura }; já faz os expects.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const VENDOR_QR = path.join(RAIZ, 'complexodmc.com.br', 'plataforma-ead', 'js', 'vendor', 'qrcode-generator', 'qrcode.js');
export const MARGEM_MINIMA = 4; // módulos (ISO/IEC 18004)
export const LADO_MINIMO_MM = 28;
const MM_POR_PX = 25.4 / 96;
const NIVEIS = ['L', 'M', 'Q', 'H'];

let _gerador = null;
/** O qrcode() do arquivo vendorizado, avaliado num contexto isolado do vm (sem require nem rede). */
export function geradorVendorizado() {
  if (_gerador) return _gerador;
  const codigo = fs.readFileSync(VENDOR_QR, 'utf8');
  const ctx = vm.createContext({ TextEncoder });
  _gerador = vm.runInContext(`${codigo}\n;qrcode`, ctx, { filename: VENDOR_QR });
  if (typeof _gerador !== 'function') throw new Error('_qr.js: o gerador vendorizado não definiu qrcode().');
  return _gerador;
}

/**
 * Matriz esperada (linha × coluna; true = escuro) com a MESMA codificação do DMC_QR (qr.js, F0b):
 * modo Byte com os bytes UTF-8 do texto, versão automática (typeNumber 0), nível `nivel`.
 */
export function matrizEsperada(texto, { nivel = 'M' } = {}) {
  if (typeof texto !== 'string' || !texto) throw new TypeError('_qr.js: informe o texto esperado do QR.');
  const g = geradorVendorizado();
  const qr = g(0, NIVEIS.includes(nivel) ? nivel : 'M');
  let binario = '';
  for (const b of Buffer.from(texto, 'utf8')) binario += String.fromCharCode(b);
  qr.addData(binario, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (__, c) => qr.isDark(r, c)));
}

/**
 * Lê o SVG do DMC_QR: viewBox "0 0 L L" em módulos, <rect> branco do tamanho todo e um <path>
 * com "M<x> <y>h<n>v1h-<n>z" por sequência de módulos escuros (formato documentado em qr.js).
 * Devolve { lado, margem, modulos, matriz, fundoBranco }. Lança se o formato não bater.
 */
export function lerSvgDoQr(svg) {
  const s = String(svg || '');
  const vb = s.match(/viewBox\s*=\s*"0 0 (\d+) (\d+)"/);
  if (!vb || vb[1] !== vb[2]) throw new Error('_qr.js: SVG sem viewBox quadrado "0 0 L L".');
  const lado = Number(vb[1]);
  const d = (s.match(/<path\b[^>]*\sd\s*=\s*"([^"]*)"/) || [])[1];
  if (d == null) throw new Error('_qr.js: SVG sem <path d> dos módulos.');
  const fundoBranco = /<rect\b[^>]*\bwidth\s*=\s*"(\d+)"[^>]*\bheight\s*=\s*"(\d+)"[^>]*\bfill\s*=\s*"#fff(?:fff)?"/i.test(s)
    && Number((s.match(/<rect\b[^>]*\bwidth\s*=\s*"(\d+)"/) || [])[1]) === lado;
  const escuros = new Set();
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const re = /M(\d+) (\d+)h(\d+)v1h-(\d+)z/g;
  let consumido = 0;
  for (const m of d.matchAll(re)) {
    const [x, y, w, w2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (w !== w2) throw new Error(`_qr.js: segmento inconsistente "${m[0]}".`);
    for (let i = 0; i < w; i++) escuros.add(`${y},${x + i}`);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w - 1); maxY = Math.max(maxY, y);
    consumido += m[0].length;
  }
  if (consumido !== d.trim().length) throw new Error('_qr.js: <path d> fora do formato do DMC_QR.');
  if (!escuros.size) throw new Error('_qr.js: QR sem módulos escuros.');
  // Os padrões de posição põem módulo escuro na 1ª linha e na 1ª coluna: a margem é o deslocamento.
  const margem = Math.min(minX, minY);
  const modulos = lado - 2 * margem;
  if (maxX - margem + 1 !== modulos || maxY - margem + 1 !== modulos) throw new Error('_qr.js: margens desiguais no SVG.');
  const atributoMargem = Number((s.match(/data-pf-qr-margem\s*=\s*"(\d+)"/) || [])[1]);
  if (Number.isFinite(atributoMargem) && atributoMargem !== margem) throw new Error(`_qr.js: data-pf-qr-margem=${atributoMargem} ≠ margem desenhada ${margem}.`);
  const matriz = Array.from({ length: modulos }, (_, r) => Array.from({ length: modulos }, (__, c) => escuros.has(`${r + margem},${c + margem}`)));
  return { lado, margem, modulos, matriz, fundoBranco };
}

/** Compara duas matrizes; `diferencas` = até 20 posições [linha, coluna] divergentes. */
export function compararMatrizes(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return { iguais: false, diferencas: [], motivo: `tamanhos diferentes: ${a && a.length} × ${b && b.length}` };
  }
  const dif = [];
  let total = 0;
  for (let r = 0; r < a.length; r++) {
    for (let c = 0; c < a.length; c++) {
      if (!!a[r][c] !== !!(b[r] && b[r][c])) { total++; if (dif.length < 20) dif.push([r, c]); }
    }
  }
  return { iguais: total === 0, diferencas: dif, total };
}

/**
 * URL absoluta de validação pública (a que vai dentro do QR, §9.6): base = PORTAL_BASE_URL
 * (o serve.mjs define http://127.0.0.1:<QA_PORT>) ou a `base` informada (ex.: baseURL do teste).
 */
export function urlDeValidacao(codigo, { base = process.env.PORTAL_BASE_URL } = {}) {
  if (!base) throw new Error('_qr.js: informe a base (PORTAL_BASE_URL ou { base: baseURL }).');
  return new URL(`/plataforma-ead/validar.html?codigo=${encodeURIComponent(codigo)}`, base).href;
}

/**
 * Confere o QR na página, sob `print`: matriz igual à esperada, margem ≥ 4, lado ≥ 28 mm, fundo
 * branco; grava a captura do bloco (prova de que aparece na impressão). Faz os expects e devolve
 * o relatório. `seletor`: o <svg> do QR (padrão: o primeiro svg[data-pf-qr-modulos]).
 */
export async function conferirQrNaPagina(page, {
  texto, seletor = 'svg[data-pf-qr-modulos]', nivel = 'M', evidencia = null, rotulo = 'QR',
  margemMinima = MARGEM_MINIMA, ladoMinimoMm = LADO_MINIMO_MM, manterPrint = false,
} = {}) {
  await page.emulateMedia({ media: 'print' });
  try {
    const alvo = page.locator(seletor).first();
    await expect(alvo, `${rotulo}: SVG do QR presente sob print`).toBeVisible();
    const svg = await alvo.evaluate((el) => el.outerHTML);
    const caixa = await alvo.evaluate((el) => { const r = el.getBoundingClientRect(); return { largura: r.width, altura: r.height }; });
    let captura = null;
    if (evidencia && evidencia.dir) {
      fs.mkdirSync(evidencia.dir, { recursive: true });
      captura = path.join(evidencia.dir, `${evidencia.nome || 'qr'}-print.png`);
      const bloco = evidencia.bloco ? page.locator(evidencia.bloco).first() : alvo;
      await bloco.screenshot({ path: captura, animations: 'disabled' });
    }
    const lido = lerSvgDoQr(svg);
    const esperado = matrizEsperada(texto, { nivel });
    const cmp = compararMatrizes(lido.matriz, esperado);
    const ladoMm = Math.min(caixa.largura, caixa.altura) * MM_POR_PX;
    const relatorio = { iguais: cmp.iguais, diferencas: cmp.diferencas, totalDiferencas: cmp.total ?? null, modulos: lido.modulos, modulosEsperados: esperado.length, margem: lido.margem, ladoMm: Math.round(ladoMm * 10) / 10, fundoBranco: lido.fundoBranco, captura, texto };
    expect(cmp.iguais, `${rotulo}: matriz do SVG ≠ matriz esperada para "${texto}" (${JSON.stringify(relatorio)})`).toBe(true);
    expect(lido.margem, `${rotulo}: zona de silêncio`).toBeGreaterThanOrEqual(margemMinima);
    expect(ladoMm, `${rotulo}: lado impresso em mm`).toBeGreaterThanOrEqual(ladoMinimoMm);
    expect(lido.fundoBranco, `${rotulo}: fundo branco do tamanho todo`).toBe(true);
    return relatorio;
  } finally {
    if (!manterPrint) await page.emulateMedia({ media: 'screen' });
  }
}
