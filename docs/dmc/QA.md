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

## Linha de base 2026-10-17-final (porta D3, working tree sobre e2a64dc) — **aprovado**
E2E (`QA_PORT=4631 QA_DATA=2026-10-17-final`, 116 s): **454 testes, 454 aprovados, 0 falharam, 0 bloqueados** —
`qa/2026-10-17-final/e2e/resumo.json`. Por grupo: a11y 50/50 · console 50/50 · formulario 8/8 (API real com `mongod`
descartável: 201/400/isca/429/413) · home 7/7 · movimento 5/5 · navegacao 22/22 · rotas 109/109 (13 redirects, 18 internos ≠ 200,
0 segredos, 0 sub-recursos 4xx/5xx, crawl sem link quebrado) · seo 27/27 · vercel-config 1/1 · viewports 175/175 (0 overflow em
320–1920 × 25). `falhasPorCausa` e `falhasPorPagina` vazios. Ruído externo: 0 ocorrências.
Lighthouse mobile (mediana de 3, serve.mjs com vercel.json real; Perf/A11y/BP/SEO · LCP · CLS · TBT) — `qa/2026-10-17-final/lighthouse/resumo.json`:
home 99/100/100/100 · 1,80 s · 0,003 · 0 ms; planejamento-sucessorio 100/100/100/100 · 1,65 s · 0,007; recuperacao-ativos
100/100/100/100 · 1,20 s · 0,006; consultoria-imobiliaria 100/100/100/100 · 1,65 s · 0,003; ciclo-fechado 100/100/100/100 · 1,21 s · 0.
Extras pedidas na porta (`resumo-extras.json`, mesmo método, serve.mjs :4633): holding-patrimonial 100/100/100/100 · 1,20 s · 0;
compliance-governanca 100/100/100/100 · 1,65 s · 0,001; tecnologia 100/100/100/100 · 1,20 s · 0,001; defesa-empresarial
100/100/100/100 · 1,21 s · 0. Reteste da regressão da v3 (`resumo-contabilidade.json`): contabilidade 100/100/100/100 · 1,21 s ·
**CLS 0,001 em 3/3** (0,166 não reproduzido). Perf por execução: 99/99/99 na home, 100 nas demais 27 execuções. TBT 0 ms em todas.
API (`npm test`, sem banco): 23/23 (corpoEmail, POST /api/contato 201/400/413/429/503/honeypot, notificador Resend).
Segredos (`grep -rIE` chaves/tokens/URIs em `complexodmc.com.br/`): 0 ocorrências (só o nome `tokens.css`).
Conformidade (`scan-conformidade.cjs`, OUT em `qa/2026-10-17-final/conformidade/conformidade.json`, 38 arquivos): **schema reservado 0**
(era 2 na auditoria); frases com ato privativo 139 (era 149), das quais **14 enquadradas como entrega sem atribuição na mesma linha**
(era 51): 11 são o nome do produto "Defesa Empresarial" (title, menu/breadcrumb, cartão da home l. 785, JSON-LD `name`/`itemListElement`
em ciclo-fechado l. 55 e defesa-empresarial l. 45/56; a atribuição "por advogados parceiros habilitados" está na frase/meta/FAQ ao lado)
e 3 em `recuperacao-ativos` (l. 300 cartão SISBAJUD "Bloqueio de ativos financeiros."; l. 501/503 rótulos `via` "Execução de título
extrajudicial" nos dados JS, com citação de artigo). Regras originais 181 hits (era 366), sem hit novo de promessa/percentual sem fonte
revisado nesta rodada; triagem frase a frase é do content-director. 18 páginas `pages/*` e EAD sem JSON-LD (informativo).
Pendência aberta (fora da suíte): `treinamento-interesse` fora do sitemap com `noindex, follow` (SEO 69 só por `is-crawlable`, intencional).

### Anterior — 2026-10-17 (após 8018600, com migração em curso)
E2E: 454 testes, 384 aprovados, 70 falharam, 0 bloqueados (2 execuções, mesmo resultado).
Lighthouse mobile (Perf/A11y/BP/SEO, LCP, CLS): home 99/100/100/100 1,80 s 0,042 · planejamento-sucessorio 96/100/100/100
1,65 s 0,123 · recuperacao-ativos **74**/98/100/100 1,95 s **1,008** · consultoria-imobiliaria **71**/96/96/100 2,38 s **1,301** ·
ciclo-fechado 100/100/100/100 1,20 s 0. TBT ≤ 3 ms em todas.
Não comparar com o baseline de auditoria (python http.server, sem compressão).

## Verificação independente g3-e3 v1 — 2026-10-17 (E3: consultoria-imobiliaria, juridico-imobiliario, juridico-vendas, registro-imobiliario, atos-notariais; working tree sobre e2a64dc)
E2E filtrado (`--grep` pelos 5 slugs, porta 4606): 79 testes, 79 aprovados, 0 falhou, 0 bloqueado — a11y 10, console 10, rotas 19 (inclui 4 redirects do vercel.json), seo 5, viewports 35 — `qa/2026-10-17-g3-e3-v1/e2e/resumo.json`.
Lighthouse mobile (mediana de 3, servidor serve.mjs 4607): as 5 páginas 100/100/100/100, LCP 1,65–1,66 s, CLS 0–0,005, TBT 0 ms — `qa/2026-10-17/internas/g3-e3/v1/lighthouse/resumo.json`.
Checagens diretas (`internas/g3-e3/v1/checagens-diretas.json`): 1 `<h1>` em Newsreader, `main#conteudo`, canonical absoluto = sitemap, favicon-dmc.png, 0 links para index.html/planejamento-sucessorio-empresarial (HTML e DOM pós-navbar.js), 0 iframe YouTube, 0 getImageData, 0 `<i class="fa`, 0 `<link>` de DM Sans/Raleway/Poppins/Inter, 0 `<style>` inline, CTA `../?assunto=E3#contact` (2 por página), 0 overflow em 320–1920, 0 erro de console, 0 4xx — tudo aprovado nas 5.
Conformidade (diff HEAD × working tree, texto visível + meta + JSON-LD): meta idêntica; JSON-LD inexistente antes e depois (0 blocos); texto novo = cabeçalho/rodapé compartilhados, cartões das páginas-irmãs do E3 (com atribuição a parceiros habilitados/cartórios conveniados) e aviso de rodapé sobre atos privativos; texto removido = letreiros do herói repetidos 3×, rótulos de etapas e placeholder do vídeo. Sem promessa, número sem fonte ou ato privativo sem atribuição.
Capturas 390/1440 (rolagem lenta; `.reveal` 100% revelado, `reveal-video.json`): `internas/g3-e3/v1/*.png`. Observação de método: captura com rolagem rápida (20 ms/passo) deixa `.reveal` em opacity 0 e gera faixas pretas falsas.
Resultado: aprovado (0 falhas com dono página; metas de Lighthouse atingidas).

## Verificação independente g1-e1 v1 — 2026-10-17 (E1: holding-patrimonial, blindagem-patrimonial, pronto-patrimonio, sucessao-testamentaria, por-que-urgente; working tree sobre e2a64dc)
E2E filtrado (`--grep` pelos 5 slugs, porta 4602): 75 testes, 75 aprovados, 0 falhou, 0 bloqueado — a11y 10, console 10, rotas 15, seo 5, viewports 35 — `qa/2026-10-17-g1-e1-v1/e2e/resumo.json`.
Lighthouse mobile (mediana de 3, serve.mjs 4603, 3/3 execuções iguais): as 5 páginas 100/100/100/100, LCP 1,20–1,66 s, CLS 0–0,001, TBT 0 ms — `qa/2026-10-17/internas/g1-e1/v1/lighthouse/resumo.json` (+ `*.report.json/html`).
Checagens diretas (`internas/g1-e1/v1/checagens-diretas.json`): 1 `<h1>` em Newsreader (fonte efetivamente carregada: `document.fonts.check('1em Newsreader')` true nas 5), `main#conteudo`, canonical absoluto = sitemap, favicon-dmc.png, 0 links para index.html/planejamento-sucessorio-empresarial (HTML e DOM pós-navbar.js), 0 iframe YouTube, 0 canvas com getImageData (a string aparece só num comentário HTML de por-que-urgente, linha 115; solucao.js 0 ocorrências), 0 `<i class="fa`, 0 `<link>` de DM Sans/Raleway/Poppins/Inter, 0 `<style>` inline, CTA `../?assunto=E1#contact` (2 por página; navbar.js injeta mais 2 `/#contact` absolutos — informativo), 0 overflow em 320–1920, 0 erro de console, 0 4xx — tudo aprovado nas 5.
Conformidade (diff HEAD × working tree, `internas/g1-e1/v1/conformidade/`): title/description idênticos; JSON-LD inexistente antes e depois (0 blocos nas 5); texto novo = cabeçalho/rodapé compartilhados (menu dos 6 eixos, endereço, telefone, aviso "Conteúdo informativo…" com atribuição a parceiros habilitados/cartórios conveniados) e subtítulo do bloco "Conversa" (convite a conversa/diagnóstico, sem promessa); texto removido = letreiro `stats-marquee` do herói (repetido 3×; os fatos permanecem no corpo), rótulos de categoria dos cartões e placeholder do vídeo (por-que-urgente agora com `data-video` + "Assistir no YouTube"). Citações legais (CPC arts. 610–673; CC arts. 1.789/1.846; "maior de 16 anos") já existiam no HEAD. Sem promessa, número sem fonte ou ato privativo sem atribuição. alt do logo passou de "Complexo DMC" (img estática) para navbar.js com aria-label — axe aprovado.
Capturas 390/1440 (`internas/g1-e1/v1/*.png`): `.reveal` 0 não revelados (`reveal.json`); por-que-urgente a 390 precisou de `scrollIntoView` por contêiner — sonda `reveal-probe-por-que-urgente.json` mostra os 7 contêineres com `visible`/opacity 1 em 320/375/390/768 quando entram na janela (artefato de captura, não defeito).
Resultado: aprovado (0 falhas com dono página; metas de Lighthouse atingidas).

## Verificação independente g2-e2-e4-transversais v1 — 2026-10-17 (planejamento-tributario, compliance-governanca, contabilidade, tecnologia, politica-de-privacidade, treinamento-interesse; working tree sobre e2a64dc)
E2E filtrado (`--grep` pelos 6 slugs, porta 4604): 76 testes, 76 aprovados, 0 falhou, 0 bloqueado — a11y 10, console 10, rotas 16, seo 5, viewports 35 — `qa/2026-10-17-g2-e2-e4-transversais-v1/e2e/resumo.json`. `treinamento-interesse` não está no `sitemap.xml`, logo a suíte (que lê PAGINAS do sitemap) não a cobre; coberta só pelas checagens diretas e pelo Lighthouse.
Lighthouse mobile (mediana de 3, serve.mjs 4606, 18 execuções todas Perf 100): as 6 páginas 100/100/100/100, LCP 1,15–1,66 s, CLS 0–0,017, TBT 0 ms — `qa/2026-10-17-g2-e2-e4-transversais-v1/lighthouse/resumo.json`.
Checagens diretas (`internas/g2-e2-e4-transversais/v1/checagens-diretas.json`): nas 6, 1 `<h1>` em Newsreader, `main#conteudo`, favicon-dmc.png, 0 links para index.html/planejamento-sucessorio-empresarial (HTML e DOM), 0 iframe YouTube, 0 getImageData (canvas da malha vem de `solucao.js`, sem getImageData), 0 `<i class="fa`, 0 `<link>` de DM Sans/Raleway/Poppins/Inter, 0 overflow em 320–1920, 0 erro de console, 0 4xx. CTA: `../?assunto=E2#contact` (tributário, compliance), `../?assunto=E4#contact` (contabilidade); tecnologia e política usam `../#contact` (páginas sem eixo; `main.js` só aceita E1–E6). Canonical absoluta = sitemap nas 5 do sitemap.
**Falhas** — `treinamento-interesse`: (a) `<style>` inline de 60 linhas (l. 26–85, espelho do `.dmc-form` da home; o próprio comentário prevê a migração para `components.css`) — dono camada-compartilhada; (b) canonical autorreferente mas página fora do sitemap e sem `noindex` — status de indexação indefinido; dono página (decidir `noindex` ou entrada no sitemap).
Conformidade (diff HEAD × working tree, texto visível + meta): JSON-LD inexistente antes e depois (0 blocos nas 6); texto novo = cabeçalho/rodapé compartilhados com aviso de atos privativos, cartão da página-irmã do E2 (sem promessa), olho "Treinamento"/"Voltar para treinamentos"; texto removido = letreiros do herói (chips e repetição 3× em contabilidade), rótulos decorativos dos cartões da política (`benefit-card__tag`) e números de etapa; FAQs idênticas. Pré-existente (não é texto novo): compliance FAQ "3 a 6 meses" sem fonte.
Capturas 390/1440: `internas/g2-e2-e4-transversais/v1/*.png` (rolagem 120 ms/passo; `.reveal` ocultos = 0 nas 12, `reveal-capturas.json`). A primeira tentativa a 40 ms/passo deixou FAQ e vídeo em opacity 0 no 1440 (faixa preta falsa) — mesmo achado de g3-e3.
Resultado: **não aprovado** nesta rodada por 1 falha com dono página em `treinamento-interesse` (canonical/sitemap/noindex); as 5 páginas do sitemap passam em tudo.

## Verificação independente g4-e5-e6 v1 — 2026-10-17 (recuperacao-ativos + 6 trabalhistas)
Suíte filtrada (QA_PORT=4608): 106 testes, 106 aprovados, 0 falharam, 0 bloqueados — `qa/2026-10-17-g4-e5-e6-v1/e2e/resumo.json`.
Lighthouse mobile (mediana de 3, serve.mjs :4609): as 7 páginas 100/100/100/100, LCP 1,20–1,35 s, CLS 0–0,003, TBT 0 ms —
`qa/2026-10-17/internas/g4-e5-e6/v1/lighthouse/resumo.json`.
Checagens diretas (`…/v1/checagens-diretas.json`): 1 h1 em Newsreader, `main#conteudo`, canonical = sitemap, favicon-dmc,
CTA `../?assunto=E5#contact` / `../../?assunto=E6#contact`, 0 overflow em 7 larguras, 0 erro de console, 0 4xx, 0 iframe,
0 FA, 0 fonte proibida nas 7. **Falha (dono=pagina):** `recuperacao-ativos.html:45` mantém 1 `<style>` inline
(`.ra-growth`/`.ra-tri`, só tokens) — mover para CSS da página. Conformidade: JSON-LD idêntico ao HEAD nas 7; texto novo =
navbar/rodapé compartilhados e rótulos de momento; nenhum número/promessa novo. Capturas 390/1440 em `…/v1/`.

## Verificação independente g4-e5-e6 v2 — 2026-10-17 (recuperacao-ativos + 6 trabalhistas; working tree sobre e2a64dc)
Suíte filtrada (QA_PORT=4608, grep nas 7 rotas): 106 testes, 106 aprovados, 0 falharam, 0 bloqueados —
`qa/2026-10-17-g4-e5-e6-v2/e2e/resumo.json` (a11y 14, console 14, rotas 22, seo 7, viewports 49).
Lighthouse mobile (3 execuções em série, mediana por Performance, serve.mjs :4609 com vercel.json real): as 7 páginas
100/100/100/100 em todas as execuções; LCP 1,20–1,21 s; CLS 0–0,004; TBT 0 ms — `qa/2026-10-17/internas/g4-e5-e6/v2/lighthouse/resumo.json`.
Checagens diretas (`…/v2/checagens-diretas.json`): nas 7 páginas 1 `<h1>` em Newsreader (fonte carregada), `main#conteudo`,
canonical absoluta = sitemap.xml, favicon-dmc.png, 0 link para index.html/planejamento-sucessorio-empresarial, 0 iframe,
0 getImageData, 0 `<i class="fa`, 0 `<link>` de DM Sans/Raleway/Poppins/Inter, **0 `<style>` inline** (pendência da v1
resolvida: `pages/css/recuperacao-ativos.css`), CTA `../?assunto=E5#contact` / `../../?assunto=E6#contact`, 0 overflow em
320/375/390/768/1024/1440/1920, 0 erro de console, 0 4xx.
Conformidade (`…/v2/conformidade/*.texto-visivel.diff`): JSON-LD idêntico ao HEAD (md5) nas 7; texto visível só reestruturado
(navbar/rodapé compartilhados, chips e rótulos de etapa removidos, rótulos de cartão "Fechamento/Conflito/Operação/Conversa",
ticker SISBAJUD… removido, bloco de vídeo movido para antes do CTA, capitalização). Nenhuma promessa, número sem fonte ou
ato privativo novo. Capturas 390/1440 em `…/v2/`. **Resultado: aprovado — 0 falhas.**


## Verificação independente g2-e2-e4-transversais v2 — 2026-10-17 (planejamento-tributario, compliance-governanca, contabilidade, tecnologia, politica-de-privacidade, treinamento-interesse; working tree sobre e2a64dc)
E2E filtrado (`--grep` pelos 6 slugs, porta 4604): 76 testes, 76 aprovados, 0 falhou, 0 bloqueado — a11y 10, console 10, rotas 16, seo 5, viewports 35 — `qa/2026-10-17-g2-e2-e4-transversais-v2/e2e/resumo.json`. `treinamento-interesse` segue fora do sitemap (agora com `noindex, follow`), coberta só por checagens diretas e Lighthouse.
Lighthouse mobile (1 execução, serve.mjs 4605 sem Mongo): as 5 do sitemap 100/100/100/100, LCP 1,17–1,66 s, CLS 0–0,002, TBT 0 ms; `treinamento-interesse` 100/100/100/**69** — única auditoria reprovada `is-crawlable` (efeito do `noindex` adicionado após a v1; demais auditorias de SEO ok), LCP 1,13 s, CLS 0,014 — `qa/2026-10-17-g2-e2-e4-transversais-v2/lighthouse/resumo.json` (+ `*.report.json/html`).
Checagens diretas (`internas/g2-e2-e4-transversais/v2/checagens.json`): nas 6, 1 `<h1>` em Newsreader (computed), `main#conteudo`, canonical absoluta (= sitemap nas 5), favicon-dmc.png, 0 links para index.html/planejamento-sucessorio-empresarial, 0 iframe YouTube, 0 getImageData, 0 `<i class="fa`, 0 `<link>` DM Sans/Raleway/Poppins/Inter, 0 overflow em 320/375/390/768/1024/1440/1920, 0 erro de console, 0 4xx, 0 link interno quebrado. CTA: `../?assunto=E2#contact` (tributário, compliance), `../?assunto=E4#contact` (contabilidade); tecnologia/política/treinamento `../#contact` (sem eixo; `main.js` aceita só E1–E6).
**Falha restante** — `treinamento-interesse.html:29–85`: `<style>` inline (espelho do `.dmc-form`). Corrigível na página (arquivo `pages/css/treinamento-interesse.css`, como feito em `recuperacao-ativos.css`) ou migrando `.dmc-form` para `components.css` (camada). Resolvido desde a v1: `noindex, follow` (status de indexação definido).
Conformidade (diff HEAD × working tree, `conformidade-diff-texto.json`): JSON-LD 0 blocos antes/depois nas 6 (igual à piloto E1); frases novas = cabeçalho/mega-menu/rodapé compartilhados (aviso de atos privativos) + 1 cartão-irmão em tributário ("Programa de integridade…") e em compliance ("Revisão de regime… dentro da lei, com fundamento documentado") — sem promessa, número ou ato privativo sem atribuição; removidas só rótulos curtos (kickers, breadcrumb "Início/Serviços", numerais de etapa, `benefit-card__tag`); atribuição "parceiro contábil habilitado" em contabilidade preservada e ampliada (2 frases novas no processo/FAQ). Pré-existente: compliance FAQ "3 a 6 meses" sem fonte.
Capturas 390/1440: `internas/g2-e2-e4-transversais/v2/*.png` (rolagem 120 ms/passo até o fundo + 400 ms; `.reveal` ocultos = 0 nas 12, `reveal-capturas.json`).
Resultado: **não aprovado** — 1 falha dono página (`<style>` inline em treinamento-interesse) e SEO 69 nessa mesma página por `noindex` intencional; as 5 páginas do sitemap passam em tudo.


## Verificação independente g2-e2-e4-transversais v3 — 2026-10-17 (planejamento-tributario, compliance-governanca, contabilidade, tecnologia, politica-de-privacidade, treinamento-interesse; working tree sobre e2a64dc)
E2E filtrado (`--grep "pages/(…5 slugs…)\.html"`, porta 4604): 76 testes, 76 aprovados, 0 falhou, 0 bloqueado — a11y 10, console 10, rotas 16, seo 5, viewports 35 — `qa/2026-10-17-g2-e2-e4-transversais-v3/e2e/resumo.json`. `treinamento-interesse` segue fora do sitemap (`noindex, follow`), coberta só por checagens diretas e Lighthouse.
Lighthouse mobile (serve.mjs 4605 sem Mongo; 1 execução + repetições onde houve variação): planejamento-tributario 100/100/100/100 (LCP 1,66 s, CLS 0 em 3 execuções); compliance-governanca 100/100/100/100 (1,66 s, 0,001); tecnologia 100/100/100/100 (1,20 s, 0,001); politica-de-privacidade 100/100/100/100 (1,20 s, 0,009); treinamento-interesse 100/100/100/**69** (só `is-crawlable`, `noindex` intencional; 1,20 s, 0,007); **contabilidade 93/100/100/100 — CLS 0,166 em 3 de 5 execuções** (r1, r3, r4; r2 e r5 0,001; LCP 1,20 s, TBT 0) — `qa/2026-10-17-g2-e2-e4-transversais-v3/lighthouse/{resumo.json,*.report.json,*.report.html,contabilidade-r2..r5.report.json}`. Nas v1/v2 a mesma página media 0,001 (4 execuções) — regressão.
Causa medida do CLS (`internas/g2-e2-e4-transversais/v3/cls-layout-shift-sources.txt`, PerformanceObserver `layout-shift` a 412×823, CPU 4×, rede lenta — 6/6 execuções 0,166; páginas-irmãs ≤ 0,005): dois deslocamentos a ~1,25 s quando as web fonts chegam (CSS do Google Fonts carregado com `media="print"` + `onload`): linha do `<em>e Contábil</em>` do `<h1>` (caixa 50 → 38 px), `.page-hero__subtitle` ±3–4 px e `.page-hero__actions` 81,7 → 78,7 → 82,7 px (rótulo "Solicitar a revisão das demonstrações" muda de quebra). Com fontes bloqueadas a diferença estática é de 1 px (`medir-fontes`), logo é o instante da troca, não a métrica do fallback. `fadeInUp` usa só `transform` (não contribui). Dono: camada-compartilhada (troca tardia de fonte no herói; mitigação na camada: preload dos woff2 de Newsreader itálico/Hanken 600 ou `font-display: optional`); contorno de página: encurtar o rótulo do CTA (conteúdo).
Checagens diretas (`internas/g2-e2-e4-transversais/v3/checagens.json`): nas 6, 1 `<h1>` em Newsreader (computed), `main#conteudo`, canonical absoluta (= sitemap nas 5; treinamento fora do sitemap por `noindex`), favicon-dmc.png, 0 links para index.html/planejamento-sucessorio-empresarial (HTML e DOM), 0 iframe YouTube, 0 getImageData, 0 `<i class="fa`, 0 `<link>` DM Sans/Raleway/Poppins/Inter, **0 `<style>` inline (falha da v2 resolvida: `pages/css/treinamento-interesse.css?v=1`)**, overflow `scrollWidth = clientWidth` em 320/375/390/768/1024/1440/1920, 0 erro de console, 0 4xx, 0 link interno quebrado (11–13 por página). CTA: `../?assunto=E2#contact` (tributário, compliance), `../?assunto=E4#contact` (contabilidade); tecnologia/política/treinamento `../#contact` (sem eixo).
Conformidade (diff HEAD × working tree, `conformidade-diff-texto.json`): title/meta iguais nas 6; JSON-LD 0 blocos antes/depois; frases novas comuns = cabeçalho/mega-menu/rodapé compartilhados (aviso de atos privativos); específicas = olhos "Eixo E2", cartão-irmão em tributário ("Programa de integridade…") e compliance ("…dentro da lei, com fundamento documentado"), © 2026, bullets da política sem o travessão, "Treinamento"/"Deixe seu contato"; removidas só chips do herói, numerais de etapa, breadcrumb e `aria-label` de seções em contabilidade. Sem promessa, número sem fonte ou ato privativo sem atribuição. Pré-existente: compliance FAQ "3 a 6 meses" sem fonte.
Capturas 390/1440: `internas/g2-e2-e4-transversais/v3/*.png` (rolagem 120 ms/passo + 400 ms; `.reveal` ocultos = 0 nas 12). O cabeçalho aparece no meio da captura 390 por ser `position: fixed` em captura de página inteira (medido: `top: 0` após voltar ao topo) — artefato, não defeito.
Resultado: **não aprovado** — 0 falhas dono página; meta de CLS não atingida em contabilidade (0,166, dono camada-compartilhada) e SEO 69 em treinamento-interesse por `noindex` intencional.
