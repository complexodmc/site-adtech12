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
navegacao (mega-menu, Acessar, gaveta, quebra 1024) · formulario (frontend + API real) ·
seo (title/description únicos, canonical = sitemap, JSON-LD) · vercel-config ·
**eixos** (substitui `home`; 1440 + 390 + sem JS: 6 `article#eixo-N` visíveis, 0 `role=tab`, 6 `<use href="#ico-eN">` distintos,
`/#eixo-N` via `:target`, Tab pelos 6 CTAs com foco visível, destinos 200 sem redirect com o mesmo `np-pillar-<slug>`,
`details` fechado com 21 links ≥ 44 px → 200 e no sitemap; 15 testes) ·
**movimento** (herói reduce/controle em desktop e 390; `#conheca` canvas parado/ausente — mantido; `#presenca`: 390 → 0 canvas e
SVG visível, 1440 + reduce → `data-motion="still"` e ≤ 1 rAF/s, controle → `running` e > 10 rAF/s e pára com aba oculta,
27 UFs/1 sede/sem número de cobertura, 0 requisições externas; `#verticais`: 0 `video[src]` em 390 e em reduce, controle
`is-playing`; 14 testes) ·
**newsletter** (`#newsletterForm` → `POST /api/newsletter`: contrato do form + LGPD + honeypot, obrigatórios, 201 válido
com documento em `newsletter_inscricoes`, 400 por campo com `aria-describedby`, isca 200, 429/413/503 e falha de rede sem
falso sucesso; API real com `mongod` descartável: 201/400/isca/429 + `Retry-After`, e-mail repetido = 1 documento, 413,
urlencoded 201; sem `mongod` → integração "bloqueado"; 12 testes) ·
**home-secoes** (ordem dos 11 ids `hero…video, contact`, `#video` antes de `#contact`, h2 + `aria-labelledby`, âncoras
`#features/#treinamentos/#contact/#newsletter`, `role=tab` só em `#conheca`; conformidade = 0 ocorrências por seção e atribuição
na mesma seção quando cita ato; 0 marca/logo de terceiro fora do rodapé; `time[datetime]` ≤ hoje, 0 placeholder, 0
`login.html?curso=`; axe por seção em 1440 e 390 (22); imagens fora do herói lazy/width/height/≤ 250 KB e `<picture>` avif+webp
nas verticais (2); overflow por seção 320–1920 (7); 35 testes).
**newsletter-descadastro** (`pages/newsletter-descadastro.html` → `POST /api/newsletter/descadastro { email }`; fora do sitemap, por isso
overflow 320/390/768/1440 + console, estrutura/noindex/canonical, axe serious/critical, teclado, 400 por campo (API real), 202 neutro (API real),
429/503/403 simulados e falha de rede sem falso sucesso, envio sem JS → HTML, link `#newsletter` da política; 15 testes).
Comandos filtrados (porta própria; não passar `--reporter`):
`QA_PORT=<porta> QA_DATA=<data>-home-v2 npx playwright test tests/e2e/eixos.spec.js tests/e2e/movimento.spec.js tests/e2e/newsletter.spec.js tests/e2e/home-secoes.spec.js tests/e2e/formulario.spec.js`
· só a estrutura: `npx playwright test tests/e2e/home-secoes.spec.js --grep "estrutura da home"` · só axe por seção: `--grep "axe por seção"`
· só overflow por seção: `--grep "overflow por seção"` · só API da newsletter: `tests/e2e/newsletter.spec.js --grep "integração"`.
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

## Contratos de teste do redesign da home — 2026-10-17 (QA, working tree sobre db32651)
Mapa em `docs/dmc/home-redesign/contratos-qa.md`: asserções com arquivo:linha que dependem da estrutura atual (home.spec 7/7 quebram com o grid de eixos;
movimento.spec l. 53–61 mira `#conheca canvas` e usa `toDataURL`, inútil para WebGL; rotas.spec l. 187/189 exige que a home preserve `#features` (28 links de entrada),
`#treinamentos` (28) e `#contact` (44, 34 com `?assunto=E1..E6`)), evolução proposta por seção, 2 specs novos (`newsletter.spec.js`, `home-secoes.spec.js`), comandos
filtrados (`LH_PAGINAS=home npm run test:lh`) e metas. Linha de base medida (home + movimento + formulario, `mongod` descartável, porta 4641): **20/20 aprovados** —
`qa/2026-10-17-contratos-qa/e2e/`. Não existe `POST /api/newsletter` (server.js devolve 404 em `/api/*` desconhecido) — dono backend-engineer.

## Verificação independente — cabeçalho + Acessar + Central de Parcerias + candidaturas — 2026-10-17 (working tree 21:47 sobre b26a462)
Relatório para o CEO: `docs/dmc/QA_REPORT.md`. Spec novo **`tests/e2e/parcerias.spec.js` (73 testes)**: estrutura/SEO das 3 páginas (canonical com barra,
og:image 200 e 1200×630 reais, FAQPage = FAQ visível, BreadcrumbList = trilha), FAQ por teclado, `#video` antes do CTA, links internos, 4 redirects;
formulários contra a API real (`mongod` descartável): 201 + protocolo `^(PL|BP)-AAAA-[2-9A-HJ-NP-Z]{6}$`, modalidade pela rota, duplicidade com o mesmo
protocolo, erro por campo no cliente e no servidor, honeypot, 429 (`x-qa-cliente`), 413, duplo clique, sem dado pessoal em URL/evento, `*_submit_success`
só após o 201 (resposta retida), UTMs saneadas, envio sem JS; painel admin (redirect, 401/403, lista por programa, "Acesso restrito"); 503/rede com rota
interceptada; cabeçalho e overflow em 7 larguras × (3 páginas + tecnologia). Estável em `--repeat-each=3` (219/219).
`vercel build` (64.5.0, sem login): redirects compilados `^/parcerias$` etc., `vercel-config` 1/1.
Suíte completa (porta 4651): **669 testes, 650 aprovados, 19 falharam, 0 bloqueado** — 0 do pacote (parcerias 73, navegacao 40, rotas 121, seo 31, viewports 203,
console 58, a11y 58, vercel-config 1); as 19 são home/newsletter (`newsletter` 8, `home-secoes` 10, `movimento` 1 `#presenca`) — `qa/2026-10-17-parcerias/e2e/resumo.json`.
API `npm test` 129/129. Lighthouse mobile (mediana de 3, 4655): parcerias 99/100/100/100, advogados-parceiros 100/100/100/100, business-partner 99/100/100/100,
tecnologia 100/100/100/100, planejamento-sucessorio 100/100/100/100; LCP 1,20–1,88 s, CLS ≤ 0,002, TBT 0 — `qa/2026-10-17/parcerias/lighthouse/resumo.json`.
Conformidade (4 páginas, FAQ aberto + meta + JSON-LD + alt): 0 percentual numérico/R$/comissão/remuneração afirmativa/garantia afirmativa/número institucional/selo
— `qa/2026-10-17/parcerias/conformidade.json`. Capturas antes (prod, só GET) × depois: `qa/2026-10-17/parcerias/capturas/`.
Pendências P3: `/parcerias/partner-lawyers/` com barra → 404 (`vercel.json:96`); contador do throttle compartilhado PL+BP (`routes/parcerias.js:773-774`);
corrida medida (2 envios simultâneos → 2 candidaturas, documentada); sem JS mostra JSON cru. ADTECH (`adtech-app…`, 64.181.172.211) sem resposta em 443/80 daqui.
Conformidade para o CEO: "Agente Prospector" (`navbar.js:69`, `parcerias/index.html:175`), "percentuais" no FAQ do BP, h1 "Excelência profissional", `[CONFIRMAR]` da retenção na política (l. 199).

## Home v2 — rodada 1 (QA, 2026-10-17, working tree sobre b26a462) — **falhou** (10 pendências reais; 9 falhas eram do teste)
Comandos: `QA_PORT=4660 QA_DATA=2026-10-17-home-v2-r1 npm run test:e2e` (mongod descartável subiu; 199 s) · `LH_PAGINAS=home LH_RUNS=3 QA_LH_PORT=4661 QA_DATA=2026-10-17-home-v2-r1 npm run test:lh` · `npm test`.
E2E: **665 testes, 646 aprovados, 19 falharam, 0 bloqueados** — `qa/2026-10-17-home-v2-r1/e2e/resumo.json` (HTML em `e2e/relatorio/`). Por grupo: a11y 58/58 · console 58/58 · eixos 15/15 ·
formulario 8/8 · home-secoes 25/35 · movimento 13/14 · navegacao 40/40 · newsletter 4/12 · parcerias 69/69 · rotas 121/121 · seo 31/31 · vercel-config 1/1 · viewports 203/203 (0 overflow 320–1920 × 29 páginas).
Falhas por causa e dono:
- **newsletter 8 — página (frontend-motion)**: `index.html` l. 717–718 `data-origem="home-newsletter"` (spec `"home"`, HOME_REDESIGN l. 677; contratos-qa §3.1) e l. 752 `id="newsletterMessage"` (spec `#nlMessage`, l. 688) + `main.js` l. ~407 `querySelector('#newsletterMessage')` → 7 testes não encontram `#nlMessage`. 8.ª (400): `main.js` `validarLocal` (l. 386–400) barra e-mail sem TLD e nome < 2 letras no cliente, nunca faz POST → o 400 do servidor fica inalcançável pela UI (spec l. 702: só "valida obrigatórios"). Se a validação local for mantida por decisão, QA passa a simular o 400 com `page.route`.
- **movimento 1 — camada (frontend-motion, `brasil.js` l. 11/179)**: escreve `data-motion="on"`; spec exige `"running"` (HOME_REDESIGN l. 544/556; contratos-qa l. 136/141). O resto está certo: 1 canvas em 1440, SVG visível, 27 UFs, sede SP, rAF 60/s (desenho limitado a 30 fps), pára com aba oculta.
- **home-secoes conformidade 1 — conteúdo (content-director)**: `#publicacoes` "Legítima, inventário e ITCMD…" (`copy.json` l. 261) cita "inventário" sem categoria de atribuição na seção (S13). Decidir: acrescentar a categoria pertinente na seção ou declarar títulos editoriais isentos (aí o QA restringe `RE_ATO_PRIVATIVO` em `#publicacoes`).
- **home-secoes 9 — teste (corrigido nesta rodada)**: (a) overflow ×7: `div.form-hp` (honeypot `position:absolute; left:-10000px`, styles.css:602) em `#newsletter`/`#contact` — não gera rolagem (scrollWidth = clientWidth; viewports 203/203) e o contrato §3.1 exige honeypot fora da tela; `overflowPorSecao` (`_site.js`) passa a ignorar elementos posicionados inteiramente à esquerda da janela, gate `scrollWidth − clientWidth` mantido. (b) terceiros ×1: `/logo/` casava `eixos-cata**logo**__chev`; agora `(?<![a-z])(logo|marca|brand|selo)`. (c) axe `#treinamentos` 1440 ×1: axe amostrava `.metodo-programa > .dmc-overline` em meio ao fade de `.dmc-reveal` (700 ms + 80 ms × `--i:4` ≈ 1,0 s; o teste esperava 500 ms); em repouso rgb(130,96,46) sobre #f5f3ef = **5,17:1** (`diag/overline-treinamentos.txt`); o teste agora espera opacity 1 nos `.dmc-reveal` da seção. Reexecução de `home-secoes` após os ajustes: **34/35** (só a conformidade) — `qa/2026-10-17-home-v2-r1/apos-ajuste-teste/e2e/resumo.json`.
Lighthouse mobile home (mediana de 3, LH 13.5.0) — `qa/2026-10-17-home-v2-r1/lighthouse/resumo.json`: **99/100/100/100 · LCP 1,96 s · CLS 0,003 · TBT 20 ms**; Perf por execução 99/99/99; LCP 1,963/1,963/1,957 s; CLS 0,042/0,003/0,003 (1 de 3 acima de 0,01). Gate 90 ok, mas **LCP > 1,8 s (§7)**: +0,16 s sobre a base 1,80 s. LCP = poster do herói (`hero-dmc-poster-mobile.webp`, fetchpriority=high). Causa: 4 CSS render-blocking (tokens 6 KB, components 6, styles 7, **home.css 8 KB** — est. 454 ms) + CSS do Google Fonts; a base tinha 3 CSS. S16 manda fundir `home.css` em `styles.css` na publicação — dono camada (frontend-motion). Peso 1 212 KB (inclui `hero-dmc-mobile.mp4` 1 003 KB, herói pré-existente).
API `npm test`: **129/129** (24 suítes; contato, newsletter, parcerias, admin). Segredos em `complexodmc.com.br/`, `api/`, `vercel.json`: 0; `.env` não rastreado.
Sobreposições conferidas: (b) `components.css?v=3`, `navbar.js?v=c4`, rodapé "DMC Business School"/"ADTECH", sem link "Parcerias"; (a) `rede-neural.js?v=2` carregado, 2 canvas (`#conheca`, `#presenca`) com gate.

## Home v2 — rodada 2 (QA, 2026-10-17, working tree sobre b26a462) — **aprovado** (0 falhas, 0 bloqueados; 2 execuções consecutivas verdes)
Comandos: `QA_PORT=4660 QA_DATA=2026-10-17-home-v2-r2 npm run test:e2e` (mongod descartável 127.0.0.1:60369 subiu; 184 s) · `LH_PAGINAS=home LH_RUNS=3 QA_LH_PORT=4661 QA_DATA=2026-10-17-home-v2-r2 npm run test:lh` · `npm test`. 2.ª execução consecutiva (§6): suíte filtrada `eixos+movimento+newsletter+home-secoes+formulario` **84/84** + Lighthouse ×3 — `qa/2026-10-17-home-v2-r2/2a-execucao/{e2e,lighthouse}/resumo.json`.
E2E: **684 testes, 684 aprovados, 0 falharam, 0 bloqueados** — `qa/2026-10-17-home-v2-r2/e2e/resumo.json` (HTML em `e2e/relatorio/`, stdout em `e2e-stdout.log`). Por grupo: a11y 58/58 · console 58/58 · eixos 15/15 · formulario 8/8 · home-secoes 35/35 · movimento 14/14 · navegacao 40/40 · newsletter 12/12 · newsletter-descadastro 15/15 · parcerias 73/73 · rotas 121/121 · seo 31/31 · vercel-config 1/1 · viewports 203/203 (0 overflow 320–1920 × 29 páginas). As 10 pendências da rodada 1 fecharam: newsletter 8 (`data-origem="home"`, `#nlMessage`, 400 alcançável), movimento 1 (`brasil.js` `data-motion="running"`), conformidade 1 (`#publicacoes`). Nenhum teste alterado nesta rodada.
Lighthouse mobile home (mediana de 3, LH 13.5.0) — `qa/2026-10-17-home-v2-r2/lighthouse/resumo.json`: **100/100/100/100 · LCP 1,65 s · CLS 0,003 · TBT 3 ms** (Perf por execução 99/100/100; LCP 1,660/1,652/1,652 s). 2.ª execução: 100/100/100/100 · LCP 1,66 s · CLS 0,003 · TBT 13 ms (99/100/100). §7: Perf ≥ 95 ok, LCP ≤ 1,8 s ok (era 1,96 s na r1; `home.css` fundido — 20 requisições), CLS ≤ 0,01 ok (mediana), TBT ≤ 50 ms ok, 0 auditoria reprovada nas 4 categorias. Peso 1 192 KB, dos quais `hero-dmc-mobile.mp4` 1 003 KB (herói pré-existente, excluído do orçamento §7); 0 bytes dos loops das verticais no mobile.
Observação (não bloqueia; dono camada, frontend-motion, P3): na 1.ª execução de cada lote (cache de fonte frio) CLS = 0,042 em `h1#hero-title` por troca das web fonts Newsreader/Hanken (`layout-shifts` dos `home-r1.report.json`); execuções 2–3 = 0,003. Mesmo padrão da r1 e da suíte final D3 (herói fora do escopo pela sobreposição (b)). Mitigação sugerida: `size-adjust`/`ascent-override` na fonte de fallback ou `font-display: optional` no display do herói.
API `npm test`: **129/129** (24 suítes; `server-test.log`). Segredos em `complexodmc.com.br/` (grep por chave/token/senha/URI Mongo): 0 — só o JWT em `localStorage` do cliente da EAD; `server/.env` não rastreado.
Sobreposições conferidas: (b) `components.css?v=3` (l. 107), `navbar.js?v=c4` (l. 110), rodapé "DMC Business School" (l. 910) / "ADTECH" (l. 911), sem link "Parcerias"; (a) `rede-neural.js?v=2` carregado (l. 946), 2 canvas (`#conheca`, `#presenca`) com gate — `movimento` 14/14.

## Verificação independente — página de descadastro da newsletter + seção Newsletter da política — 2026-10-17 (QA, working tree sobre 67e37c3) — **aprovado**
Alvo: `pages/newsletter-descadastro.html` + `pages/js/newsletter-descadastro.js` + `pages/css/newsletter-descadastro.css`; diff de `pages/politica-de-privacidade.html` (seção `#newsletter` + 4 referências).
Servidor `tests/server/serve.mjs` na porta 4662 (PID guardado e encerrado; `mongod` descartável 127.0.0.1:60097).
Comandos: `QA_PORT=4662 QA_REUSE=1 QA_DATA=2026-10-17/newsletter-descadastro npx playwright test tests/e2e/newsletter-descadastro.spec.js` · `npx lighthouse …/pages/newsletter-descadastro.html --form-factor=mobile` · sonda ad-hoc (axe completo 320/375 com `reducedMotion`, anéis de foco, 24 hrefs + âncoras, navbar, isca pela UI, envio vazio, política em 320) · curl na API.
E2E: **15/15** — `qa/2026-10-17/newsletter-descadastro/e2e/resumo.json`. Lighthouse mobile **100/100/100/69** (LCP 1,5 s, CLS 0,013, TBT 0); SEO 69 = só `is-crawlable`, pelo `noindex` intencional (mesma isenção de treinamento-interesse) — `lighthouse-mobile.json`.
Sonda (`probe.json`, capturas `descadastro-320.png`, `descadastro-1440.png`, `politica-newsletter-320.png`): overflow 0 em 320/375; axe só `region` moderado no `.whatsapp-float` (padrão de todas as páginas, não serious); foco visível em input (2px #82602e), botão, CTA do herói, links do aside (3px) e rodapé; 24 hrefs internos 200 e 7 âncoras existem (`#newsletter`, `#features`, `#treinamentos`, `#contact`, `#artheu`, `#bloadhound`, `#portal`); navbar.js montou 39 links com profundidade certa; isca preenchida pela UI → 200 `{ok:true}` e "Pedido recebido." (neutro); envio vazio com JS → 400, `#nd-email-erro` "Informe seu e-mail.", `aria-invalid` + `aria-describedby`; 0 `<style>` inline; 0 segredos; `meta robots noindex`, fora do sitemap.
API (curl, `x-qa-cliente`): e-mail inscrito × nunca inscrito × já descadastrado → **mesma resposta 202, 77 B** (sem vazamento de existência); 4.º pedido ao mesmo e-mail em 24 h → 429; 6.º do mesmo IP → 429; `Origin` estranho → 403; isca → 200; urlencoded + `Accept: text/html` → 202 HTML com `X-Frame-Options: DENY`, `Cache-Control: no-store`, CSP fechado; `GET ?token=inválido` → 400 HTML.
Política: 0 console, 0 overflow em 320, âncoras `#newsletter/#parcerias/#compartilhamento` existem, 0 link interno quebrado; texto da página ("resposta é sempre a mesma", "não afeta os envios já feitos", "inscrição é reativada") coerente com a seção; Provimento 205: 0 promessa/número.
Pendências (não bloqueiam a página): (1) content-director — a seção `#newsletter` da política publica 4 marcadores `[CONFIRMAR: …]` visíveis (IP truncado, ferramenta de disparo, ferramenta de envio, prazo de retenção pós-descadastro); a página já tinha 7 (total 11). (2) frontend-motion (camada, P3) — `.whatsapp-float` fora de landmark (axe `region`, moderado, site inteiro). (3) Ruído da sonda, não do produto: `extraHTTPHeaders x-qa-cliente` dispara preflight CORS no Google Fonts; o spec de viewport (sem o cabeçalho) mediu 0 erros de console.

## Portal acadêmico — verificador integrado da tarde, rodada 2 — 2026-10-18 12:00 (QA, working tree sobre 9c0309c) — **falhou** (3 falhas de qualidade, 0 de produto nas fatias da tarde)
Escopo: as 19 fatias juntas, sem `QA_FATIA`, `QA_INTEGRADAS` com as 19 (lista de 404 tolerados vazia). Portas 4626 (servidor real, banco `complexodmc_portal_tarde2_qa`, seed + `seed-portal-qa --senha`) e 4627 (`serve.mjs`, mongod descartável). Os dois servidores foram encerrados pelo PID.
- `npm test`: **959/959** — `qa/2026-10-18-tarde-r2/logs/npm-test.log`.
- E2E portal (16 specs, 4 workers, 443 s): **606 testes, 596 aprovados, 3 falharam, 7 pulados com motivo** — `qa/2026-10-18-tarde-r2/e2e/resumo.json`. D5 **15/15**. Rodada 1: 97 falhas; o alvo 34×44 do "Ajuda" (F0s) e o `.gitignore secret*` estão corrigidos.
- Falha 1 e 2 (F2): `professor.html#/correcao` em 390, claro e escuro: `input 18×18` (checkbox "Ocultar nome dos alunos", `prof-avaliacoes.js:661` + `portal-avaliacao.css:452`). Correção: `label.pf-check` com `data-alvo-excecao="rotulo-clicavel"`, como em `acesso-link.js:342`.
- Falha 3 (F6a, só do teste): "regulamento: índice, âncora…" (`portal-atendimento.spec.js:181`) corre em paralelo com o caso da l. 259, que publica outro regulamento geral. Rodado sozinho passa 2/2 (`logs/reexec-f6a.log`). Correção: `test.describe.configure({ mode: 'serial' })` nos casos de regulamento, ou escopo de curso próprio.
- Pulados: 2FA ×2 (`PORTAL_2FA` desligado, D-71), `index.html` só redireciona ×2, F8 moldura (todas as abas têm dona), G2 ×2 (só com `QA_ESTRITO=1`).
- G2 com `QA_ESTRITO=1`: links **aprovado** (todo href interno e dos menus responde 200). Cache **falhou** (esperado antes da publicação): 325 referências `?v=dev`. Correção: `tests/tools/versionar-ead.mjs --aplicar` (principal) — `qa/2026-10-18-tarde-r2-g2/e2e/resumo.json`.
- Jornadas na 4626 (tela, tolerância 0): **11/11**. Aluno: enviar documento, assinar contrato (CTR íntegro em validar.html), financeiro com KPIs iguais aos da API e 0 rolagem em 390, publicações, destaque no Início. Coordenação: tipo de documento, revisar, anexar contrato, lançar e baixar pagamento, publicar, 2 banners, 3 relatórios com CSV (sem CPF e sem fórmula), auditoria. O banner do topo foi conferido com o aluno B (o aluno A tem lançamento em atraso, e pela UX §5.2 a faixa de pendência tem prioridade e não se dispensa) — `qa/2026-10-18-tarde-r2/jornadas/capturas/J01…J11`, `logs/jornadas.log`, `logs/jornadas-b.log`.
- Varredura (aluno, anônimo, professor, coordenação × escuro/claro × 390/1440): 340 aberturas em 72 páginas/rotas. **0** console.error, **0** pageerror, **0** 4xx/5xx, **0** requestfailed, **0** rolagem, **0** neon, **0** axe serious/critical. Só `login-classico.html` (2d, fora das 19) tem neon 77–85 e rolagem em 390 — `qa/2026-10-18-tarde-r2/varredura/varredura-{aluno,backoffice}.json`.
- Segredos: 0 em `complexodmc.com.br/` e `api/`; `node --check` sem erro em `js/portal/*.js` e `server/src/{portal,routes}/**`; `/api/portal/saude` 27/27 módulos.
