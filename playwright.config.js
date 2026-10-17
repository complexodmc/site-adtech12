// Porta de qualidade do site (DECISIONS.md D3) — `npm run test:e2e`.
// Servidor: tests/server/serve.mjs (vercel.json real + /api com MongoDB descartável).
// Evidências: docs/dmc/qa/<AAAA-MM-DD>/e2e/ (resultados.json, relatorio/, artefatos/).
import { defineConfig, devices } from '@playwright/test';

const PORTA = Number(process.env.QA_PORT || 4590);
const DATA = process.env.QA_DATA || new Date().toLocaleDateString('sv-SE');
const SAIDA = `docs/dmc/qa/${DATA}/e2e`;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: `${SAIDA}/artefatos`,
  timeout: 60_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.QA_WORKERS ? Number(process.env.QA_WORKERS) : '50%',
  reporter: [
    ['list'],
    ['json', { outputFile: `${SAIDA}/resultados.json` }],
    ['html', { outputFolder: `${SAIDA}/relatorio`, open: 'never' }],
    ['./tests/e2e/_resumo-reporter.js', { outputFile: `${SAIDA}/resumo.json` }]
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    screenshot: 'only-on-failure',
    trace: 'off',
    serviceWorkers: 'block'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: 'node tests/server/serve.mjs',
    url: `http://127.0.0.1:${PORTA}/__qa/estado`,
    env: { QA_PORT: String(PORTA) },
    reuseExistingServer: process.env.QA_REUSE === '1',
    timeout: 60_000,
    stdout: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 6_000 }
  }
});
