// O emulador de rotas (tests/server/vercel-rotas.mjs) precisa compilar o vercel.json
// exatamente como o `vercel build`: compara cada regra com .vercel/output/config.json.
// Sem build local recente → "bloqueado" (rode `npx vercel build` para gerar).
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { carregarVercel, RAIZ_REPO } from '../server/vercel-rotas.mjs';

test('regras do emulador = config.json compilado pela Vercel', async () => {
  const compilado = path.join(RAIZ_REPO, '.vercel', 'output', 'config.json');
  const fonte = path.join(RAIZ_REPO, 'vercel.json');
  const motivo = !fs.existsSync(compilado) ? 'sem .vercel/output/config.json'
    : fs.statSync(compilado).mtimeMs < fs.statSync(fonte).mtimeMs ? 'config.json mais antigo que o vercel.json' : null;
  if (motivo) {
    test.info().annotations.push({ type: 'bloqueado', description: `${motivo} — rode \`npx vercel build\`` });
    test.skip(true, motivo);
  }
  const srcs = new Set(JSON.parse(fs.readFileSync(compilado, 'utf8')).routes.filter((r) => r.src).map((r) => r.src));
  const vc = carregarVercel();
  const diferentes = [...vc.headers, ...vc.redirects, ...vc.rewrites].filter((r) => !srcs.has(r.src)).map((r) => ({ source: r.source, src: r.src }));
  expect(diferentes).toEqual([]);
});
