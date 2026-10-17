// Teste de reprodução no Chromium (Playwright): cada <video> precisa chegar a
// readyState ≥ 2, sem erro, com o tempo avançando. Grava resultado + captura em
// docs/dmc/qa/2026-10-17/hero/.  Uso: node tools/media/hero/verify.mjs [--channel chrome]
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const qa = path.resolve(here, '../../../docs/dmc/qa/2026-10-17/hero');
const i = process.argv.indexOf('--channel');
const channel = i > 0 ? process.argv[i + 1] : undefined;

const browser = await chromium.launch(channel ? { channel } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(path.join(qa, 'teste-video.html')).href);
const r = await page.evaluate(() => window.QA);
await page.waitForTimeout(1500);
const tag = channel || 'chromium';
await page.screenshot({ path: path.join(qa, `teste-video-${tag}.png`) });
const ok = ['desk', 'webm', 'mob'].every((k) => r[k].readyState >= 2 && !r[k].error && r[k].advanced) && r.pd.w === 1920 && r.pm.w === 720 && !errors.length;
const out = { browser: tag, version: browser.version(), ok, errors, ...r };
await fs.writeFile(path.join(qa, `teste-video-${tag}.json`), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(ok ? 0 : 1);
