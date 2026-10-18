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

// CSP da plataforma EAD (PORTAL-ACADEMICO §9.6, D-43): confere o cabeçalho EFETIVO, como
// o navegador o recebe do serve.mjs (que aplica o vercel.json real pela mesma regra de rotas).
// G0/G1: política estrita em report-only em toda /plataforma-ead/*; G2 (QA_ESTRITO=1): a mesma
// política APLICADA. login(.html) e login-classico(.html), da 2d, seguem com a report-only do
// site até a 2d tirar o script inline — nas duas fases.
const CSP_PLATAFORMA = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://i.ytimg.com; media-src 'self' blob: https:; " +
  "frame-src https://www.youtube-nocookie.com https://player.vimeo.com; connect-src 'self'; object-src 'none'; base-uri 'none'; " +
  "form-action 'self'; frame-ancestors 'none'";
const CSP_APLICADA = process.env.QA_ESTRITO === '1';

function cspDoSite() {
  const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ_REPO, 'vercel.json'), 'utf8'));
  const global = (cfg.headers || []).find((h) => h.source === '/(.*)');
  return global?.headers.find((x) => x.key === 'Content-Security-Policy-Report-Only')?.value ?? null;
}

test.describe('CSP efetiva de /plataforma-ead/ (D-43)', () => {
  const PLATAFORMA = [
    '/plataforma-ead/dashboard.html', '/plataforma-ead/loja.html', '/plataforma-ead/admin.html',
    '/plataforma-ead/', '/plataforma-ead', '/plataforma-ead/css/plataforma.css'
  ];
  for (const url of PLATAFORMA) {
    test(`plataforma: ${url} traz a CSP estrita ${CSP_APLICADA ? 'aplicada (G2)' : 'em report-only (G0/G1)'}`, async ({ request }) => {
      const r = await request.get(url, { maxRedirects: 0 });
      expect(r.status(), url).toBe(200);
      const h = r.headers();
      if (CSP_APLICADA) {
        expect(h['content-security-policy'], `${url}: Content-Security-Policy`).toBe(CSP_PLATAFORMA);
      } else {
        expect(h['content-security-policy-report-only'], `${url}: Content-Security-Policy-Report-Only`).toBe(CSP_PLATAFORMA);
        expect(h['content-security-policy'], `${url}: nenhuma CSP aplicada antes do G2`).toBeUndefined();
      }
    });
  }

  const DA_2D = [
    ['/plataforma-ead/login.html', 200], ['/plataforma-ead/login-classico.html', 200],
    ['/plataforma-ead/login', null], ['/plataforma-ead/login-classico', null]
  ];
  for (const [url, status] of DA_2D) {
    test(`2d: ${url} segue com a report-only do site, sem a estrita`, async ({ request }) => {
      const site = cspDoSite();
      expect(site, 'vercel.json: regra global "/(.*)" sem Content-Security-Policy-Report-Only').toBeTruthy();
      expect(site).not.toBe(CSP_PLATAFORMA);
      const r = await request.get(url, { maxRedirects: 0 });
      if (status !== null) expect(r.status(), url).toBe(status);
      const h = r.headers();
      expect(h['content-security-policy-report-only'], `${url}: Content-Security-Policy-Report-Only`).toBe(site);
      expect(h['content-security-policy'], `${url}: CSP aplicada não vale para as páginas da 2d`).toBeUndefined();
    });
  }
});
