// Uso: node chromakey-cpu.cjs <outJson> <shotDir>
// Mede o custo do laço de chromakey (drawImage + getImageData + putImageData por rAF)
// em mobile 390x844 (DPR 3) com CPU throttling 4x, durante 10 s de scroll contínuo.
// Três condições por página:
//   com-chromakey        — página como está
//   canvas-display-none  — canvas oculto via CSS injetado; o laço JS continua rodando
//   sem-laco             — rino-video-transparent.mp4 bloqueado → init() nunca roda
// Usa Google Chrome (channel 'chrome') porque o Chromium do Playwright não decodifica H.264.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Variáveis de ambiente opcionais: THROTTLE=6 CONDS=canvas-display-none,sem-laco RUNS=1 MERGE=1
// (MERGE=1 funde no JSON existente, substituindo medições da mesma página×condição×throttle)
const outJson = process.argv[2];
const shotDir = process.argv[3];
const BASE = 'http://127.0.0.1:8080/complexodmc.com.br/';
const THROTTLE = Number(process.env.THROTTLE || 4);
const SCROLL_MS = 10000;
const SCROLL_STEP = 120; // px a cada 50 ms (~2.400 px/s)
const RUNS = Number(process.env.RUNS || 2);
const ONLY_CONDS = process.env.CONDS ? process.env.CONDS.split(',') : null;
const MERGE = process.env.MERGE === '1';

const PAGES = [
  { id: 'home', url: BASE + 'index.html', canvas: '#rinoCanvas', video: '#rinoSrc', scene: '.orbit-scene' },
  { id: 'planejamento-sucessorio', url: BASE + 'pages/planejamento-sucessorio.html', canvas: '#rinoCanvasPS', video: '#rinoSrcPS', scene: '.ps-orbit-scene' },
];
const CONDS = [
  { id: 'com-chromakey', desc: 'pagina como esta (laco ativo, canvas visivel)' },
  { id: 'canvas-display-none', desc: 'canvas display:none injetado; laco JS continua' },
  { id: 'sem-laco', desc: 'rino-video-transparent.mp4 bloqueado; init() nunca roda' },
];

function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
function metric(m, name) { const e = m.metrics.find(x => x.name === name); return e ? e.value : null; }

async function measure(browser, pg, cond, run) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  if (cond.id === 'sem-laco') await ctx.route('**/rino-video-transparent.mp4', r => r.abort());
  const injectCss = 'html{scroll-behavior:auto !important}' + (cond.id === 'canvas-display-none' ? '#rinoCanvas,#rinoCanvasPS{display:none !important}' : '');
  await ctx.addInitScript((css) => {
    // no instante do init script ainda não há <html>; injeta quando o DOM existir
    const add = () => { const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st); };
    try { if (document.head || document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add, { once: true }); } catch (e) { document.addEventListener('DOMContentLoaded', add, { once: true }); }
  }, injectCss);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  const tNav = Date.now();
  await page.goto(pg.url, { waitUntil: 'load', timeout: 90000 });
  const loadMs = Date.now() - tNav;
  await page.addStyleTag({ content: injectCss }); // garantia: também após o load
  await page.waitForTimeout(3000); // tempo para o vídeo iniciar e o laço começar

  const state0 = await page.evaluate(({ canvas, video }) => {
    const c = document.querySelector(canvas), v = document.querySelector(video);
    return {
      canvasInternalW: c ? c.width : null, canvasDisplay: c ? getComputedStyle(c).display : null,
      canvasCssW: c ? c.getBoundingClientRect().width : null, canvasTop: c ? c.getBoundingClientRect().top : null,
      videoTime: v ? v.currentTime : null, videoPaused: v ? v.paused : null, videoReady: v ? v.readyState : null,
      scrollHeight: document.documentElement.scrollHeight,
    };
  }, pg);

  const m0 = await cdp.send('Performance.getMetrics');
  const r = await page.evaluate(async ({ ms, step }) => {
    const longTasks = [];
    const po = new PerformanceObserver(list => { for (const e of list.getEntries()) longTasks.push(Math.round(e.duration)); });
    po.observe({ type: 'longtask', buffered: false });
    const maxY = document.documentElement.scrollHeight - innerHeight;
    let dir = 1;
    const timer = setInterval(() => {
      const y = window.scrollY;
      if (y >= maxY - 1) dir = -1; else if (y <= 0) dir = 1;
      window.scrollBy(0, dir * step);
    }, 50);
    const gaps = [];
    const t0 = performance.now(); let last = t0; let n = 0;
    await new Promise(res => {
      function tick(now) { n++; gaps.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(tick); else res(); }
      requestAnimationFrame(tick);
    });
    clearInterval(timer); po.disconnect();
    const elapsed = last - t0;
    return { frames: n, elapsedMs: Math.round(elapsed), gaps: gaps.slice(1), longTasks, maxY };
  }, { ms: SCROLL_MS, step: SCROLL_STEP });
  const m1 = await cdp.send('Performance.getMetrics');

  const state1 = await page.evaluate(({ video }) => { const v = document.querySelector(video); return { videoTime: v ? v.currentTime : null, videoPaused: v ? v.paused : null }; }, pg);

  const gaps = r.gaps;
  const result = {
    page: pg.id, cond: cond.id, run, cpuThrottle: THROTTLE, viewport: '390x844@3x', loadMs,
    estado: { ...state0, videoTimeDepois: state1.videoTime, videoPausedDepois: state1.videoPaused },
    scroll: { ms: r.elapsedMs, passoPx: SCROLL_STEP, intervaloMs: 50, alcanceMaxY: r.maxY },
    fps: { medio: +(r.frames / (r.elapsedMs / 1000)).toFixed(1), frames: r.frames },
    frameGapMs: { p50: +pct(gaps, 0.5).toFixed(1), p95: +pct(gaps, 0.95).toFixed(1), max: +Math.max(...gaps).toFixed(1), acima50: gaps.filter(g => g > 50).length, acima100: gaps.filter(g => g > 100).length },
    longTasks: { n: r.longTasks.length, totalMs: r.longTasks.reduce((a, b) => a + b, 0), maxMs: r.longTasks.length ? Math.max(...r.longTasks) : 0 },
    mainThread: {
      taskDurationMs: Math.round((metric(m1, 'TaskDuration') - metric(m0, 'TaskDuration')) * 1000),
      scriptDurationMs: Math.round((metric(m1, 'ScriptDuration') - metric(m0, 'ScriptDuration')) * 1000),
      layoutDurationMs: Math.round((metric(m1, 'LayoutDuration') - metric(m0, 'LayoutDuration')) * 1000),
      recalcStyleMs: Math.round((metric(m1, 'RecalcStyleDuration') - metric(m0, 'RecalcStyleDuration')) * 1000),
    },
  };
  result.mainThread.ocupacaoPct = +(100 * result.mainThread.taskDurationMs / r.elapsedMs).toFixed(1);

  // Microbenchmark do custo de UMA iteração do laço (mesmo código do site), só na condição real, run 1
  if (cond.id === 'com-chromakey' && run === 1) {
    const bench = async (rate) => {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      return page.evaluate(({ canvas, video }) => {
        const c = document.querySelector(canvas), v = document.querySelector(video);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const N = 30; const t0 = performance.now();
        for (let k = 0; k < N; k++) {
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const f = ctx.getImageData(0, 0, c.width, c.height); const d = f.data;
          for (let i = 0; i < d.length; i += 4) { if (d[i] < 50 && d[i + 1] < 50 && d[i + 2] < 50) d[i + 3] = 0; }
          ctx.putImageData(f, 0, 0);
        }
        return +((performance.now() - t0) / N).toFixed(2);
      }, pg);
    };
    result.custoPorFrameMs = { cpu4x: await bench(4), cpu1x: await bench(1), pixelsPorFrame: state0.canvasInternalW * state0.canvasInternalW };
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  }
  // Screenshot da cena da órbita (evidência visual) no run 1
  if (run === 1 && shotDir && (cond.id === 'com-chromakey' || cond.id === 'sem-laco')) {
    try {
      await page.evaluate(() => window.scrollTo(0, 0));
      const el = page.locator(pg.scene).first();
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await el.screenshot({ path: path.join(shotDir, `chromakey-${pg.id}-${cond.id}-390.png`) });
    } catch (e) { result.screenshotErro = e.message; }
  }
  await ctx.close();
  return result;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ver = browser.version();
  let results = [];
  const conds = ONLY_CONDS ? CONDS.filter(c => ONLY_CONDS.includes(c.id)) : CONDS;
  if (MERGE && fs.existsSync(outJson)) {
    const prev = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    results = prev.medicoes.filter(m => !(m.cpuThrottle === THROTTLE && conds.some(c => c.id === m.cond)));
  }
  for (let run = 1; run <= RUNS; run++) {
    for (const pg of PAGES) for (const cond of conds) {
      const res = await measure(browser, pg, cond, run);
      results.push(res);
      console.log(`${pg.id} | ${cond.id} | run ${run} | fps ${res.fps.medio} | longTasks ${res.longTasks.n} (${res.longTasks.totalMs} ms, max ${res.longTasks.maxMs}) | gap p95 ${res.frameGapMs.p95} ms | main ${res.mainThread.ocupacaoPct}% | canvasW ${res.estado.canvasInternalW} display ${res.estado.canvasDisplay} vt ${res.estado.videoTime}->${res.estado.videoTimeDepois}`);
    }
  }
  await browser.close();
  // Resumo por página × condição (média dos runs)
  const resumo = {};
  for (const r of results) {
    const k = `${r.page}|${r.cond}|${r.cpuThrottle}`;
    resumo[k] = resumo[k] || { page: r.page, cond: r.cond, cpuThrottle: r.cpuThrottle, runs: 0, fps: 0, longTasksN: 0, longTasksMs: 0, longTaskMax: 0, gapP95: 0, gapMax: 0, mainPct: 0 };
    const s = resumo[k]; s.runs++; s.fps += r.fps.medio; s.longTasksN += r.longTasks.n; s.longTasksMs += r.longTasks.totalMs; s.longTaskMax = Math.max(s.longTaskMax, r.longTasks.maxMs); s.gapP95 += r.frameGapMs.p95; s.gapMax = Math.max(s.gapMax, r.frameGapMs.max); s.mainPct += r.mainThread.ocupacaoPct;
  }
  for (const s of Object.values(resumo)) { s.fps = +(s.fps / s.runs).toFixed(1); s.longTasksN = +(s.longTasksN / s.runs).toFixed(1); s.longTasksMs = Math.round(s.longTasksMs / s.runs); s.gapP95 = +(s.gapP95 / s.runs).toFixed(1); s.mainPct = +(s.mainPct / s.runs).toFixed(1); }
  const out = {
    geradoEm: new Date().toISOString(), navegador: `Google Chrome ${ver} (headless, channel chrome)`, metodo: {
      viewport: '390x844, DPR 3, isMobile, hasTouch', cpuThrottle: 'Emulation.setCPUThrottlingRate (campo cpuThrottle em cada medição; 4x padrão)', scroll: `${SCROLL_MS} ms, scrollBy ${SCROLL_STEP}px a cada 50 ms, desce e sobe; scroll-behavior:auto forçado`,
      fps: 'contagem de callbacks de requestAnimationFrame / tempo decorrido', longTasks: 'PerformanceObserver longtask (>50 ms) durante o scroll', mainThread: 'delta de Performance.getMetrics (CDP) TaskDuration/ScriptDuration durante o scroll',
      condicoes: CONDS, paginas: PAGES.map(p => ({ id: p.id, url: p.url })), runs: RUNS,
    }, resumo: Object.values(resumo), medicoes: results,
  };
  fs.writeFileSync(outJson, JSON.stringify(out, null, 2));
  console.log('salvo', outJson);
})().catch(e => { console.error(e); process.exit(1); });
