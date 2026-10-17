// =============================================================
// QA · Lighthouse mobile (porta de qualidade, DECISIONS.md D3) — `npm run test:lh`
//
// Sobe tests/server/serve.mjs (vercel.json real, gzip/br; sem MongoDB — as páginas
// medidas não chamam a API), roda LH_RUNS execuções por página (padrão 3, em série:
// paralelo distorce Performance) e guarda a MEDIANA por Performance.
// Saída: docs/dmc/qa/<AAAA-MM-DD>/lighthouse/
//   <pagina>-r<N>.report.json   todas as execuções
//   <pagina>.report.html        relatório da mediana
//   resumo.json                 notas, LCP/CLS/TBT, metas e auditorias reprovadas
// Metas: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95.
// Sai com código 1 se alguma meta falhar. Variáveis: LH_RUNS, QA_LH_PORT, QA_DATA,
// CHROME_PATH, LH_PAGINAS (lista separada por vírgula de nomes abaixo).
// Reaproveita os parâmetros de docs/dmc/audit/tools/baseline-lighthouse.sh.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.QA_LH_PORT || 4591);
const BASE = `http://127.0.0.1:${PORTA}`;
const RUNS = Math.max(1, Number(process.env.LH_RUNS || 3));
const DATA = process.env.QA_DATA || new Date().toLocaleDateString('sv-SE');
const SAIDA = path.join(RAIZ, 'docs', 'dmc', 'qa', DATA, 'lighthouse');
const METAS = { performance: 90, accessibility: 95, bestPractices: 95, seo: 95 };

const TODAS = [
  ['home', '/'],
  ['planejamento-sucessorio', '/pages/planejamento-sucessorio.html'],
  ['recuperacao-ativos', '/pages/recuperacao-ativos.html'],
  ['consultoria-imobiliaria', '/pages/consultoria-imobiliaria.html'],
  ['ciclo-fechado', '/solucoes/consultoria-trabalhista/ciclo-fechado']
];
const filtro = (process.env.LH_PAGINAS || '').split(',').map((s) => s.trim()).filter(Boolean);
const PAGINAS = filtro.length ? TODAS.filter(([n]) => filtro.includes(n)) : TODAS;

function chrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(mac)) return mac;
  return null; // o lighthouse procura sozinho (chrome-launcher)
}

async function subirServidor() {
  const proc = spawn(process.execPath, [path.join(RAIZ, 'tests', 'server', 'serve.mjs')], {
    env: { ...process.env, QA_PORT: String(PORTA), QA_NO_MONGO: '1' }, stdio: ['ignore', 'pipe', 'inherit']
  });
  proc.stdout.on('data', (d) => process.stdout.write(String(d)));
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(BASE + '/__qa/estado')).ok) return proc; } catch { /* subindo */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  proc.kill('SIGTERM');
  throw new Error('servidor de teste não subiu em ' + BASE);
}

function rodarLighthouse(url, arquivoBase) {
  const bin = path.join(RAIZ, 'node_modules', '.bin', 'lighthouse');
  const args = [url,
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
    '--form-factor=mobile', '--screenEmulation.mobile',
    '--only-categories=performance,accessibility,best-practices,seo',
    '--output=json', `--output-path=${arquivoBase}.report.json`, '--quiet'];
  const env = { ...process.env };
  const c = chrome();
  if (c) env.CHROME_PATH = c;
  const r = spawnSync(bin, args, { env, encoding: 'utf8', timeout: 180_000 });
  if (r.status !== 0) throw new Error(`lighthouse falhou (${r.status}): ${(r.stderr || '').split('\n').slice(-4).join(' ')}`);
  return JSON.parse(fs.readFileSync(`${arquivoBase}.report.json`, 'utf8'));
}

function resumir(lhr) {
  const a = lhr.audits;
  const nota = (k) => Math.round((lhr.categories[k]?.score ?? 0) * 100);
  const ms = (k) => (a[k]?.numericValue != null ? Math.round(a[k].numericValue) : null);
  const reprovadas = (cat) => lhr.categories[cat].auditRefs
    .filter((r) => r.weight > 0 && a[r.id] && a[r.id].score !== null && a[r.id].score < 0.9)
    .map((r) => ({ id: r.id, nota: a[r.id].score, valor: a[r.id].displayValue || undefined }));
  return {
    url: lhr.finalDisplayedUrl,
    lighthouse: lhr.lighthouseVersion,
    avisos: lhr.runWarnings,
    notas: { performance: nota('performance'), accessibility: nota('accessibility'), bestPractices: nota('best-practices'), seo: nota('seo') },
    metricas: {
      FCP_ms: ms('first-contentful-paint'), LCP_ms: ms('largest-contentful-paint'),
      CLS: a['cumulative-layout-shift']?.numericValue != null ? Number(a['cumulative-layout-shift'].numericValue.toFixed(3)) : null,
      TBT_ms: ms('total-blocking-time'), SI_ms: ms('speed-index')
    },
    elementoLCP: a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet?.slice(0, 160) || null,
    pesoTotalKB: Math.round((a['total-byte-weight']?.numericValue || 0) / 1024),
    reprovadas: {
      performance: reprovadas('performance'), accessibility: reprovadas('accessibility'),
      bestPractices: reprovadas('best-practices'), seo: reprovadas('seo')
    }
  };
}

fs.mkdirSync(SAIDA, { recursive: true });
const servidor = await subirServidor();
const { ReportGenerator } = await import('lighthouse/report/generator/report-generator.js');
const resultado = [];
let falhou = false;
try {
  for (const [nome, caminho] of PAGINAS) {
    const execs = [];
    for (let i = 1; i <= RUNS; i++) {
      process.stdout.write(`[lh] ${nome} ${i}/${RUNS} … `);
      const lhr = rodarLighthouse(BASE + caminho, path.join(SAIDA, `${nome}-r${i}`));
      execs.push({ i, lhr, perf: Math.round((lhr.categories.performance?.score ?? 0) * 100) });
      console.log(`perf ${execs.at(-1).perf}`);
    }
    const ordenadas = [...execs].sort((x, y) => x.perf - y.perf);
    const mediana = ordenadas[Math.floor((ordenadas.length - 1) / 2)];
    fs.writeFileSync(path.join(SAIDA, `${nome}.report.html`), ReportGenerator.generateReportHtml(mediana.lhr));
    const r = resumir(mediana.lhr);
    const metas = Object.fromEntries(Object.entries(METAS).map(([k, m]) => [k, { meta: m, nota: r.notas[k], ok: r.notas[k] >= m }]));
    if (Object.values(metas).some((m) => !m.ok)) falhou = true;
    resultado.push({ pagina: nome, caminho, execucoes: RUNS, execucaoMediana: mediana.i, performancePorExecucao: execs.map((e) => e.perf), ...r, metas });
  }
} finally {
  servidor.kill('SIGTERM');
}

const resumo = { geradoEm: new Date().toISOString(), base: BASE, formFactor: 'mobile (simulado, padrão Lighthouse)', metas: METAS, aprovado: !falhou, paginas: resultado };
fs.writeFileSync(path.join(SAIDA, 'resumo.json'), JSON.stringify(resumo, null, 2));
console.log('\n[lh] pagina                     Perf A11y  BP  SEO   LCP    CLS    TBT');
for (const p of resultado) {
  const n = p.notas; const m = p.metricas;
  console.log(`[lh] ${p.pagina.padEnd(26)} ${String(n.performance).padStart(4)} ${String(n.accessibility).padStart(4)} ${String(n.bestPractices).padStart(3)} ${String(n.seo).padStart(4)}  ${(m.LCP_ms / 1000).toFixed(2)}s ${String(m.CLS).padStart(6)} ${String(m.TBT_ms).padStart(5)}ms ${Object.values(p.metas).every((x) => x.ok) ? 'ok' : 'ABAIXO DA META'}`);
}
console.log(`[lh] resumo: ${path.relative(RAIZ, path.join(SAIDA, 'resumo.json'))}`);
process.exit(falhou ? 1 : 0);
