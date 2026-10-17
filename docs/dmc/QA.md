# QA — porta de qualidade (D3)

## Como rodar
| Comando | O quê |
|---|---|
| `npm run test:e2e` | Playwright (Chromium do Playwright), 454 testes, ~2,6 min. Sobe `tests/server/serve.mjs` sozinho |
| `npm run test:lh` | Lighthouse mobile, 5 páginas × 3 execuções (mediana); sai 1 se alguma meta falhar. `LH_RUNS`, `LH_PAGINAS` |
| `npm test` | API `/api/contato` (node --test, sem banco) — inalterado |
| `npm run test:qa-server` | só o servidor de teste, para depurar: http://127.0.0.1:4590 (`QA_PORT`) |

Evidências locais (gitignored): `docs/dmc/qa/<AAAA-MM-DD>/e2e/{resumo.json,resultados.json,relatorio/,artefatos/}`
e `docs/dmc/qa/<AAAA-MM-DD>/lighthouse/{resumo.json,<pagina>.report.html,<pagina>-rN.report.json}`.

## Servidor de teste (`tests/server/`)
- `vercel-rotas.mjs` compila o `vercel.json` real (headers → redirects → filesystem do `outputDirectory` →
  rewrites → 404); as 17 regras saem idênticas ao `.vercel/output/config.json` (teste `vercel-config`).
- Estático com gzip/br, ETag, Range e `cache-control` da Vercel; maiúsculas diferenciadas como na CDN.
- `/api/*` = `api/[...path].js` no mesmo processo (`VERCEL=1`). Banco: `mongod` **descartável** (dbpath temporário,
  porta livre, apagado ao sair). `server/.env` não é lido; URI travada em 127.0.0.1; Resend desligado.
  Sem `mongod` → integração "bloqueado" e o frontend do formulário é testado com a rota interceptada.
- Só no teste: `GET /__qa/estado` e cabeçalho `x-qa-cliente` (simula IPs para o throttle de 5/15 min).

## Grupos (tests/e2e)
rotas (sitemap 200, 13 redirects, 18 arquivos internos ≠ 200, varredura de segredos, sub-recursos, links por página,
crawl) · viewports (7 larguras × 25) · console (desktop + 390) · a11y (axe serious/critical + h1/main/labels/lang) ·
navegacao (mega-menu, Acessar, gaveta, quebra 1024) · home (tablist, #eixo-N) · formulario (frontend + API real) ·
movimento (reduced-motion) · seo (title/description únicos, canonical = sitemap, JSON-LD) · vercel-config.
Ruído externo tolerado: só o listado em `tests/e2e/_site.js` (`RUIDO_EXTERNO`), com motivo; na linha de base, 0 ocorrências.

## Linha de base 2026-10-17 (após 8018600, com migração em curso)
E2E: 454 testes, 384 aprovados, 70 falharam, 0 bloqueados (2 execuções, mesmo resultado).
Lighthouse mobile (Perf/A11y/BP/SEO, LCP, CLS): home 99/100/100/100 1,80 s 0,042 · planejamento-sucessorio 96/100/100/100
1,65 s 0,123 · recuperacao-ativos **74**/98/100/100 1,95 s **1,008** · consultoria-imobiliaria **71**/96/96/100 2,38 s **1,301** ·
ciclo-fechado 100/100/100/100 1,20 s 0. TBT ≤ 3 ms em todas.
Não comparar com o baseline de auditoria (python http.server, sem compressão).
