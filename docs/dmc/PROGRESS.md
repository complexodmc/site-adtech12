# DMC PRIME — PROGRESSO

Após compactação de contexto: retome daqui. Não refaça auditoria concluída.

| Etapa | Status | Evidência |
|---|---|---|
| 1 Descoberta | ✅ concluída 2026-10-17 | BRIEF.md |
| 2 Auditoria DMC × Planning | ✅ consolidada 2026-10-17 (12 relatórios: 8 iniciais + extras raiz do repositório, deploy Vercel/D5, schema/atos privativos, chromakey/regrade) | docs/dmc/AUDIT.md (inventário, matriz, baseline, violações, backlog, riscos, bloqueios); evidências em docs/dmc/audit/2026-10-17/{site-producao,…,raiz-repositorio,backend-vercel,conformidade-schema,hero}/ |
| 3 Estratégia / direção | ✅ aprovada (opção C) | DECISIONS.md D2 |
| 4 Engenharia paralela | ✅ 1ª rodada | b3e03b4 (contato+headers), 8e7f2f7 (conformidade), 0e20496 (tokens) |
| 5 Implementação criativa | ✅ home + 26 páginas internas na direção C (onda 1 pilotos e2a64dc; onda 2 = 24 páginas em 4 grupos com verificação independente); navbar.js sem 301 e Tab no mega-menu. **Home v2 (2026-10-17) consolidada na árvore de trabalho, não commitada**: 10 seções (`#porque`, `#verticais`, `#presenca`, `#publicacoes`, `#newsletter` novas; `#conheca`, hero, contato, vídeo e rodapé mantidos), loops procedurais das 5 verticais, `POST /api/newsletter` + descadastro, 684/684 e2e, Lighthouse home 100/100/100/100; relatório ao CEO pronto; aguarda aprovação do CEO para commit (squash, T4) | docs/dmc/home-redesign/RELATORIO-CEO.md; integracao/README.md; aceite/*.md; `qa/2026-10-17-home-v2-r2/` |
| 6 Mídias e 3D | ✅ filme do hero + rede neural (home); rino dourado com alpha nativo nas páginas de E1/E3 (chromakey e getImageData removidos); og-image, favicons; por página só `data-video` lazy (IDs do YouTube a definir pelo CEO) | e0b7744, 8018600 |
| 7 QA | ✅ porta D3 aprovada 2026-10-17: E2E 454/454, API 23/23, Lighthouse mobile 100/100/100/100 em 9 internas e 99/100/100/100 na home, 0 segredos, 0 overflow 320–1920 | docs/dmc/QA.md; `docs/dmc/qa/2026-10-17-final/` |
| 8 Entrega / publicação | 🔄 T5 preparada (vercel.json `outputDirectory`, raiz do git limpa, sitemap/robots, engines 24.x, DEPLOY.md); publicar só após rotação T3 + D3 | docs/dmc/DEPLOY.md; DECISIONS.md T5 |

## Testes (aprovado / falhou / bloqueado)

| Teste | Resultado | Observação |
|---|---|---|
| Portal acadêmico, G2 cache `?v=` (principal, 18/10 12:09, porta 4628; ensaio numa cópia isolada na 4625) | árvore real: falhou como esperado (323 `?v=dev` em 34 arquivos, `--verificar` saída 1; links ok). Cópia com `--aplicar`: aprovado | Na cópia, `versionar-ead.mjs --aplicar` grava 34 arquivos, 0 erro, idempotente; depois disso, G2 2/2, `npm test` 959/959, D5 14/14, `portal-qualidade` + `portal-shell` 106/106 (4 pulados com motivo, 0 erro de console). **Na árvore real o script não foi aplicado**: a fase 1 segue aberta (F4b, F5, F7 e as correções de F2/F6a), e qualquer edição posterior invalida o hash. Além disso, `tests/e2e/portal-ui.spec.js:1835` (F0b, congelado) exige `boot-index.js?v=dev` literal e reprova depois do `--aplicar` (visto na cópia). Pedido à F0b: aceitar `?v=(dev\|[0-9a-f]{8})`. Ordem antes do deploy: congelar as fatias, corrigir a F0b, rodar `node tests/tools/versionar-ead.mjs --aplicar`, rodar `QA_ESTRITO=1 npx playwright test tests/e2e/portal-qualidade.spec.js -g G2` e informar à 2d os `?v=` de `api-client.js`/`app.js` (§6.5) — `docs/dmc/qa/2026-10-18-g2-cache-principal/` |
| Portal acadêmico, verificador integrado da tarde, rodada 2 (QA, 18/10 12:00, 19 fatias, `QA_INTEGRADAS` completa) | falhou (3: 2 F2 alvo 18×18 em `#/correcao` 390; 1 F6a teste com corrida entre casos de regulamento) | `npm test` 959/959; E2E 596/606 (3 falharam, 7 pulados com motivo); D5 15/15; jornadas 11/11; varredura de 340 aberturas: 0 console/4xx/5xx/rolagem/neon/axe serious; G2: links ok, cache aguarda `versionar-ead --aplicar` — `qa/2026-10-18-tarde-r2/`, QA.md |
| Revisão final do arquiteto — home v2 (2026-10-17, árvore de trabalho sobre b26a462, porta 4670) | aprovado (0 falhas; 0 resíduos no diff) | Playwright próprio em 390 e 1440: 0 erro de console/pageerror/requestfailed/4xx; 11 ids na ordem; 1 h1; `role=tab` só em `#conheca`; 390 → 0 vídeo com `src`, mapa `still`; 1440 → 5 loops carregados após rolar e pausados fora da tela (`is-playing` é classe de fade, não de estado), `data-motion="paused"` ao sair; rodapé = Newsletter / DMC Business School / ADTECH, sem "Parcerias"; 27 links internos → 200; 0 âncora quebrada. `vercel.json`/`sitemap.xml` sem diff; `home.css` provisório removido (S16); versões de cache `components.css?v=3`, `styles.css?v=c7`, `navbar.js?v=c4`, `main.js?v=c4`. Pendências do CEO consolidadas em RELATORIO-CEO.md §5 (20 itens; 9 = política de privacidade é condição de publicação) |
| Home v2 rodada 2 — suíte completa + Lighthouse home + `npm test` (QA, 2026-10-17, sobre b26a462) | aprovado (0 falhas, 0 bloqueados; 2 execuções consecutivas) | E2E **684/684** (mongod descartável ok, 184 s): a11y 58 · console 58 · eixos 15 · formulario 8 · home-secoes 35 · movimento 14 · navegacao 40 · newsletter 12 · newsletter-descadastro 15 · parcerias 73 · rotas 121 · seo 31 · vercel-config 1 · viewports 203 (0 overflow 320–1920). As 10 pendências da r1 fecharam; nenhum teste alterado. Lighthouse home **100/100/100/100, LCP 1,65 s, CLS 0,003, TBT 3 ms** (99/100/100 por execução); 2.ª execução: filtrada 84/84 + LH 100/100/100/100, LCP 1,66 s. Observação P3 (camada): CLS 0,042 só na 1.ª execução de cada lote, por troca de web font no `h1` do herói (fora do escopo). `npm test` 129/129. Segredos 0 — `qa/2026-10-17-home-v2-r2/{e2e,lighthouse}/resumo.json`, `2a-execucao/{e2e,lighthouse}/resumo.json` |
| Verificação independente — página de descadastro da newsletter + seção Newsletter da política (QA, 2026-10-17, sobre 67e37c3) | aprovado (0 falhas; 2 pendências não bloqueantes) | `tests/e2e/newsletter-descadastro.spec.js` 15/15 na porta 4662 (API real, `mongod` descartável); Lighthouse mobile 100/100/100/69 (SEO só `is-crawlable`, `noindex` intencional; LCP 1,5 s, CLS 0,013); overflow 0 em 320/375/390/768/1440; axe 0 serious/critical (só `region` do `.whatsapp-float`, site inteiro); foco visível; 24 hrefs 200 + âncoras ok; isca, vazio, 400 por campo, 202 neutro; API: inscrito × não inscrito × já saído = mesma resposta 202/77 B, 429 por e-mail (3/24 h) e por IP (5/15 min), 403 Origin estranho, HTML sem JS com `X-Frame-Options: DENY`; política 0 console/0 overflow/âncoras ok. Pendências: content-director — 4 `[CONFIRMAR]` novos visíveis na seção `#newsletter`; frontend-motion P3 — `.whatsapp-float` fora de landmark — `qa/2026-10-17/newsletter-descadastro/{e2e/resumo.json,lighthouse-mobile.json,probe.json,*.png}` |
| Home v2 rodada 1 — suíte completa + Lighthouse home + `npm test` (QA, 2026-10-17, sobre b26a462) | falhou (10 pendências: 8 página, 1 camada, 1 conteúdo; 9 falhas de teste corrigidas) | E2E 665: 646 aprovados, 19 falharam, 0 bloqueados (mongod ok). Página (frontend-motion): newsletter 8 — `data-origem="home-newsletter"`/`#newsletterMessage` vs spec `home`/`#nlMessage` (index.html l. 717–718/752, main.js l. ~407) e `validarLocal` torna o 400 inalcançável. Camada (frontend-motion): `brasil.js` `data-motion="on"` vs spec `running`. Conteúdo (content-director): `#publicacoes` cita "inventário" sem atribuição na seção (copy.json l. 261). Teste corrigido: overflow ×7 (honeypot `.form-hp` off-screen), terceiros ×1 (`/logo/` casava "catalogo"), axe `#treinamentos` ×1 (amostra em meio ao fade; repouso 5,17:1) → `home-secoes` 34/35 na reexecução. Lighthouse home 99/100/100/100, **LCP 1,96 s > 1,8 s (§7)**, CLS 0,003, TBT 20 ms — 4.º CSS render-blocking `home.css` (S16: fundir em styles.css), dono camada. `npm test` 129/129. Segredos 0 — `qa/2026-10-17-home-v2-r1/{e2e,lighthouse}/resumo.json`, `apos-ajuste-teste/e2e/resumo.json` |
| Verificação independente — cabeçalho + Acessar + Central de Parcerias + candidaturas (QA, 2026-10-17) | aprovado (0 falha do pacote) · 4 pendências P3 · 4 de conformidade (CEO) | `tests/e2e/parcerias.spec.js` 73/73 (API real com `mongod` descartável; estável 3×). Suíte completa 650/669 — as 19 falhas são home/newsletter (`newsletter` 8, `home-secoes` 10, `movimento` 1). `vercel build` ok, 4 redirects `^/parcerias…$`; API 129/129; Lighthouse mobile 99–100/100/100/100 em parcerias, advogados-parceiros, business-partner, tecnologia e planejamento-sucessorio (CLS ≤ 0,002). P3: `/parcerias/partner-lawyers/` com barra 404 (`vercel.json:96`), throttle compartilhado PL+BP, corrida → 2 candidaturas, sem JS mostra JSON. ADTECH sem resposta daqui. CEO: "Agente Prospector", "percentuais" no FAQ BP, h1 "Excelência profissional", `[CONFIRMAR]` de retenção na política — `docs/dmc/QA_REPORT.md`, `qa/2026-10-17-parcerias/e2e/`, `qa/2026-10-17/parcerias/` |
| Suíte da nova home escrita, ainda não executada (QA, 2026-10-17) | bloqueado (home nova em montagem) | 4 specs: `tests/e2e/eixos.spec.js` (15, substitui `home.spec.js` — removido), `movimento.spec.js` (14: herói + `#conheca` mantidos; `#presenca` e `#verticais` novos), `newsletter.spec.js` (12; API real com `mongod` descartável), `home-secoes.spec.js` (35: ordem dos ids, conformidade, terceiros, axe por seção 1440/390, imagens ≤ 250 KB, overflow por seção 320–1920). `npx playwright test --list`: 76 testes nos 4 arquivos, 596 na suíte (sintaxe ok). Helpers em `tests/e2e/_site.js` (`SECOES_HOME`, `EIXOS`, `CATALOGO_EIXOS`, `RE_CONFORMIDADE`, `instalarContadorRaf/contarRaf`, `textoVisivel`, `focoVisivel`, `overflowPorSecao`, `estaNoSitemap`). Destrava quando frontend-motion entregar a home nova: `QA_PORT=<porta> QA_DATA=<data>-home-v2 npx playwright test tests/e2e/{eixos,movimento,newsletter,home-secoes,formulario}.spec.js` (ver QA.md §Grupos) |
| Contratos de teste do redesign da home (QA, 2026-10-17) | aprovado (linha de base 20/20) · pendências abertas | `docs/dmc/home-redesign/contratos-qa.md`: home.spec 7/7 quebram com o grid; movimento.spec precisa de novo método para canvas WebGL; a home deve preservar `#features` (28 links de entrada), `#treinamentos` (28) e `#contact` (44); `POST /api/newsletter` inexistente (backend-engineer); 6 cursos da home fora do catálogo da EAD (content-director). Base medida: home 7/7, movimento 5/5, formulario 8/8 — `qa/2026-10-17-contratos-qa/e2e/` |
| Verificação g4-e5-e6 v2 — recuperacao-ativos + 6 trabalhistas (QA independente, 2026-10-17) | aprovado (0 falhas) | Suíte filtrada 106/106; Lighthouse mobile 100/100/100/100 nas 7 (LCP ≤ 1,21 s, CLS ≤ 0,004, TBT 0); checagens diretas ok nas 7 incl. 0 `<style>` inline (pendência v1 resolvida em `pages/css/recuperacao-ativos.css`); JSON-LD idêntico ao HEAD; texto sem mudança de sentido — `qa/2026-10-17-g4-e5-e6-v2/e2e/resumo.json`, `qa/2026-10-17/internas/g4-e5-e6/v2/` |
| Verificação g4-e5-e6 v1 — recuperacao-ativos + 6 trabalhistas (QA independente, 2026-10-17) | falhou (1 pendência dono=pagina) | Suíte filtrada 106/106; Lighthouse mobile 100/100/100/100 nas 7 (LCP ≤ 1,35 s, CLS ≤ 0,003); checagens diretas ok nas 7; JSON-LD/texto sem mudança de sentido. Pendência: `recuperacao-ativos.html:45` `<style>` inline (`.ra-growth`, `.ra-tri`) — `qa/2026-10-17-g4-e5-e6-v1/e2e/resumo.json`, `qa/2026-10-17/internas/g4-e5-e6/v1/` |
| Suíte D3 final — rotas/redirects/segredos/sub-recursos/links/crawl (QA 2026-10-17-final, 454/454) | aprovado (109/109) | sitemap 200, 13 redirects do vercel.json, 18 arquivos internos ≠ 200, 0 segredos, 0 sub-recursos 4xx/5xx, links por página sem 301/404 (navbar.js corrigido), crawl sem link quebrado — `qa/2026-10-17-final/e2e/resumo.json` |
| Suíte D3 final — viewports 320/375/390/768/1024/1440/1920 × 25 páginas | aprovado (175/175) | 0 overflow horizontal (scrollWidth = clientWidth) — `qa/2026-10-17-final/e2e/resumo.json` |
| Suíte D3 final — console (desktop + 390) | aprovado (50/50) | 0 erro de console, 0 ruído externo (`RUIDO_EXTERNO` sem ocorrência) — `qa/2026-10-17-final/e2e/resumo.json` |
| Suíte D3 final — acessibilidade (axe serious/critical + h1/main/labels/lang) | aprovado (50/50) | 0 violação axe; `main#conteudo`, 1 h1, labels e lang nas 25 — `qa/2026-10-17-final/e2e/resumo.json` |
| Suíte D3 final — navegação (mega-menu, Acessar, gaveta, quebra 1024) | aprovado (22/22) | teclado no painel dos eixos, foco preso/devolvido na gaveta, 2 destinos de Acessar — `qa/2026-10-17-final/e2e/resumo.json` |
| Suíte D3 final — home (tablist, #eixo-N) | aprovado (7/7) | tablist ARIA e âncoras #eixo-1..6 — `qa/2026-10-17-final/e2e/resumo.json` |
| Suíte D3 final — formulário (frontend + API real) | aprovado (8/8) | `mongod` descartável: 201 válido, 400 inválido, honeypot silencioso, 429 throttle, 413; erro por campo com `aria-describedby` — `qa/2026-10-17-final/e2e/resumo.json` |
| Suíte D3 final — movimento (prefers-reduced-motion) | aprovado (5/5) | durações 1 ms, vídeo do herói substituído pelo cartaz — `qa/2026-10-17-final/e2e/resumo.json` |
| Suíte D3 final — SEO on-page (title/description únicos, canonical = sitemap, JSON-LD) | aprovado (27/27) | 0 LegalService/ProfessionalService; canonical absoluta nas 25 do sitemap — `qa/2026-10-17-final/e2e/resumo.json` |
| Suíte D3 final — vercel-config (17 regras = .vercel/output/config.json) | aprovado (1/1) | `qa/2026-10-17-final/e2e/resumo.json` |
| Lighthouse mobile final (5 padrão + holding-patrimonial, compliance-governanca, tecnologia, defesa-empresarial + reteste contabilidade; mediana de 3) | aprovado (10/10) | home 99/100/100/100 (LCP 1,80 s, CLS 0,003); as outras 9 páginas 100/100/100/100, LCP 1,20–1,65 s, CLS ≤ 0,007, TBT 0 ms; contabilidade CLS 0,001 em 3/3 (regressão da v3 não reproduzida) — `qa/2026-10-17-final/lighthouse/{resumo,resumo-extras,resumo-contabilidade}.json` |
| API `npm test` + varredura de conformidade (QA 2026-10-17-final) | aprovado (23/23) · informativo | API 23/23 sem banco. `scan-conformidade.cjs`: schema reservado 0; 139 frases com ato privativo, 14 como entrega sem atribuição na mesma linha (11 = nome do produto "Defesa Empresarial"; 3 em recuperacao-ativos l. 300/501/503) — triagem do content-director; `qa/2026-10-17-final/conformidade/conformidade.json` |
| Lighthouse mobile D3 (5 páginas, mediana de 3) | falhou (2/5) | home 99/100/100/100; planejamento-sucessorio 96 (CLS 0,123); recuperacao-ativos 74 (CLS 1,008); consultoria-imobiliaria 71/96/96 (CLS 1,301, `.page-hero__inner`); ciclo-fechado 100 — `qa/2026-10-17/lighthouse/resumo.json` |
| Verificação g3-e3 v1 (E3, 5 páginas: consultoria-imobiliaria, juridico-imobiliario, juridico-vendas, registro-imobiliario, atos-notariais) — 2026-10-17 | aprovado | E2E filtrado 79/79; Lighthouse mobile 100/100/100/100 nas 5 (LCP 1,65 s, CLS ≤ 0,005); checagens diretas (h1 Newsreader, main#conteudo, canonical, favicon, links, fontes, CTA E3, overflow 320–1920, console, 4xx) 0 falhas; conformidade por diff sem texto novo com promessa/número/ato privativo sem atribuição — `qa/2026-10-17-g3-e3-v1/e2e/resumo.json`, `qa/2026-10-17/internas/g3-e3/v1/` |
| Verificação g2-e2-e4-transversais v3 (mesmas 6 páginas) — 2026-10-17 | falhou (0 falhas dono página; CLS 0,166 em contabilidade, dono camada) | E2E filtrado 76/76; Lighthouse mobile 100/100/100/100 em tributário, compliance, tecnologia, política (CLS ≤ 0,009); `treinamento-interesse` 100/100/100/69 (`noindex` intencional) e `<style>` inline resolvido (`pages/css/treinamento-interesse.css`); **contabilidade 93/100/100/100, CLS 0,166 em 3/5 execuções** (era 0,001 nas v1/v2): troca tardia das web fonts re-quebra o `<em>` do h1 e o rótulo do CTA "Solicitar a revisão das demonstrações" (6/6 com CPU 4×; irmãs ≤ 0,005); checagens diretas 0 falhas nas 6; conformidade por diff sem texto novo com promessa/número/ato privativo — `qa/2026-10-17-g2-e2-e4-transversais-v3/{e2e,lighthouse}/resumo.json`, `qa/2026-10-17/internas/g2-e2-e4-transversais/v3/` |
| Verificação g2-e2-e4-transversais v2 (mesmas 6 páginas) — 2026-10-17 | falhou (1 falha dono página; 5/6 páginas limpas) | E2E filtrado 76/76; Lighthouse mobile 100/100/100/100 nas 5 do sitemap (LCP ≤ 1,66 s, CLS ≤ 0,002); `treinamento-interesse` 100/100/100/69 (só `is-crawlable`, pelo `noindex` que resolveu a pendência da v1); checagens diretas 0 falhas nas 5; `treinamento-interesse.html:29–85` `<style>` inline persiste (página: `pages/css/treinamento-interesse.css`, ou camada: `.dmc-form` em components.css); conformidade por diff sem texto novo com promessa/número/ato privativo sem atribuição — `qa/2026-10-17-g2-e2-e4-transversais-v2/{e2e,lighthouse}/resumo.json`, `qa/2026-10-17/internas/g2-e2-e4-transversais/v2/` |
| Verificação g2-e2-e4-transversais v1 (planejamento-tributario, compliance-governanca, contabilidade, tecnologia, politica-de-privacidade, treinamento-interesse) — 2026-10-17 | falhou (1 falha dono página; 5/6 páginas limpas) | E2E filtrado 76/76 (treinamento-interesse fora do sitemap, não coberta pela suíte); Lighthouse mobile 100/100/100/100 nas 6 (LCP ≤ 1,66 s, CLS ≤ 0,017); checagens diretas 0 falhas nas 5 do sitemap; `treinamento-interesse`: `<style>` inline (l. 26–85, aguarda `.dmc-form` em components.css — camada) e canonical sem entrada no sitemap nem `noindex` (página); conformidade por diff sem texto novo com promessa/número/ato privativo sem atribuição — `qa/2026-10-17-g2-e2-e4-transversais-v1/{e2e,lighthouse}/resumo.json`, `qa/2026-10-17/internas/g2-e2-e4-transversais/v1/` |
| Verificação g1-e1 v1 (E1, 5 páginas: holding-patrimonial, blindagem-patrimonial, pronto-patrimonio, sucessao-testamentaria, por-que-urgente) — 2026-10-17 | aprovado | E2E filtrado 75/75; Lighthouse mobile 100/100/100/100 nas 5 (LCP 1,20–1,66 s, CLS ≤ 0,001); checagens diretas (h1 Newsreader carregada, main#conteudo, canonical, favicon, links, fontes, CTA E1, overflow 320–1920, console, 4xx) 0 falhas; conformidade por diff: JSON-LD inexistente antes/depois, texto novo só cabeçalho/rodapé e CTA sem promessa, citações legais pré-existentes — `qa/2026-10-17-g1-e1-v1/e2e/resumo.json`, `qa/2026-10-17/internas/g1-e1/v1/` |
| Lighthouse mobile (baseline, 4 páginas) | aprovado (medido) | home 75/95/96/100, LCP 4,58 s; consultoria-imobiliaria Perf 59; ciclo-fechado 91 — `metricas-baseline/lighthouse-summary.json` |
| Playwright viewports 320–1920 (overflow) | aprovado | 0/28 combinações com overflow horizontal — `metricas-baseline/viewports.json` |
| Playwright crawl prod × local | aprovado (executado) | inventário e diffs em `site-producao/inventario.json` |
| Links internos (43 HTML) | aprovado (local, T5 2026-10-17) | varredura `href/src/url()` nos 73 HTML/CSS/JS da pasta pública após remover raiz, resíduos e mídias órfãs: 0 referências locais quebradas (44 falsos positivos: IDs do YouTube em `data-video`, `#noiseFilter`, template literals da EAD); `em-construcao.html` removido |
| Canônicas em produção | corrigido no repo (aguarda deploy) | causa era o roteamento; com `outputDirectory` as 8 páginas respondem 200 no emulador; `sitemap.xml` regenerado dos arquivos reais (25 URLs, `lastmod` 2026-10-17; trabalhistas sem `.html`, `pages/*.html` com; sem thank-you/backup/mouse/`-empresarial`); `robots.txt` → sitemap, `Disallow: /plataforma-ead/ /api/` |
| Formulário de contato (submit) | aprovado (local) | `POST /api/contato` 201/400/200-isca/413/429; Playwright nos 2 forms; `npm test` 23/23 — commit b3e03b4. Prod: aguarda deploy |
| Exposição de segredos em prod | falhou (corrigido no repo, aguarda rotação + deploy — T3) | `GET /server/.env` → 200 (808 B); `server/src/*` e `server/uploads/*` públicos |
| Headers de segurança | corrigido no repo | `vercel.json` headers (CSP em report-only); aguarda deploy |
| Roteamento Vercel (rewrites/redirects) | aprovado (build local + emulador; aguarda deploy) | `vercel build` 64.5.0 ok sem login; `docs/dmc/audit/tools/vercel-build-check.sh` → APROVADO; emulador do `config.json` compilado (`audit/tools/emulador-rotas.mjs`): `/` idêntica a `complexodmc.com.br/index.html`, `/pages/planejamento-sucessorio.html` 200, `/solucoes/consultoria-trabalhista/ciclo-fechado` 200, `/server/.env` 307, `/complexodmc.com.br[/index.html]` 301 → `/`, `/index.html` 301, raiz antiga percent-encoded 301, robots/sitemap 200, `/api/health` 200, `_np_`/mouse/backup/BACKGROUND2 404; Playwright (`audit/tools/pw-smoke.mjs`) em 4 páginas: 0 sub-recursos 4xx, 0 erros de console. Não validado: proxy real da Vercel (só após deploy) |
| Acessibilidade rápida | falhou | home 2 H1 e 4 inputs sem label; 21/28 páginas sem `<main>`; toggle sem aria-expanded |
| Console sem erros | falhou | logo.png 404 na home (7/7 larguras); embed YouTube abortado em 3 páginas |
| Conformidade de texto (scan) | aprovado | varredura do texto visível: restam só fundamentos legais (ITCMD 8%, CPC art. 523) e "seguro garantia" — commit 8e7f2f7 |
| Conformidade — raiz do repo (5 páginas fora de `complexodmc.com.br/`) | falhou | 100 ocorrências ("escritório de Direito", "impérios", "milionários", R$ 200MM, +180 construtoras, placeholder de dev visível, foto do CEO 404), todas 200 em prod — `raiz-repositorio/conformidade-raiz.json`, `prod-raiz-paginas.json` |
| Scan estendido: JSON-LD e atos privativos (E5/E6) | falhou | 1 `provider.@type = LegalService` (`recuperacao-ativos.html:62`; após 8e7f2f7 virou `ProfessionalService`, depreciado — alvo é `Organization @id`); 149 frases com atos privativos (E5 58, E6 `defesa-empresarial` 42) sem atribuição a advogado; JSON-LD ausente em 31/39 páginas (home incluída); EAD 0 — `conformidade-schema/conformidade.json`, `jsonld-renderizado.json`; gate D3 = 0 hits schema + 0 frases "entrega" sem atribuição |
| Raiz do repo servida em prod (ETag = md5) | falhou | 10 arquivos da raiz 200 em prod e iguais ao repo; 8 pares DIVERGE/SO-RAIZ (2 index, 5 pages, 1 css); `/pages/Sobre.html` 200 vs cópia aninhada 404 — `raiz-repositorio/etag-prod-antes-deploy.json`; pós-deploy: `tools/raiz-etag-prod.mjs` + `raiz-etag-compare.mjs` (aprovado = 0 pares). **T5: raiz removida do git** (`index.html`, `pages/{Sobre,Apresentação,Jurídico Vendas,Jurídico Imobiliário,Consultoria Imobiiliária}.html`, `pages/Site_Produtos/shared.css`, `assets/images/{RINO_logo,LOGO_RINOCERONTE}.png`, `assets/videos/rino-video-transparent.mp4` — EAD e `solucoes/` usam a cópia aninhada, idêntica) + 301 percent-encoded no `vercel.json`; estático do build = 115 arquivos só da pasta pública |
| Resíduos da pasta pública (T5) | aprovado | removidos: `_np_390/diag/test.html`, `em-construcao.html` + `assets/css/em-construcao.css` (nada linkava), `pages/mouse.html`, `pages/recuperacao-ativos.backup-2026-08-26.html`, `assets/videos/BACKGROUND2.gif` (73 MB) e 13 imagens órfãs em HEAD e no checkpoint 4b59d15 (`BLINDAGEM PATRIMONIAL`, `COMPLIENCE`, `Gemini_Generated_Image… (1)`, `HOLDING_PATRIMONIAL`, `PLANEJAMENTO_TRIBUTARIO`, `SUCESSAO-TESTAMENTARIA`, `SUCESSORIO`, `planejamento-sucessorio-card/-icon.png/.webp`, `urgencia-icon.png/.webp`, `doacao-clausulas-protecao.svg`). Mantidas por dúvida (órfãs hoje): `ABSTRACT1-3`, `FUNDO-SITE`, `FONDO-SITE-CELUAR`, `hero-poster.jpg`, `AD-TECH-IMAGE`, `BALANCA/MARTELO/TEMPLO`, `RINO_3D/CARA/COM_EFEITOS`, `bear-finance.*`, `urso-bear.mp4`, `URSO-BEARFINANCE`, `rino-hero.mp4`, `rino-video.mp4` — decidir após fechar a home |
| Chromakey — main thread em mobile (Playwright, CPU 4×, 10 s scroll) | falhou (medido) | home 63,6% com laço vs 21,8% sem; `display:none` no canvas não reduz (68,2%); planejamento-sucessorio 67,1% vs 33,9% (+ laço `tech-net-canvas`); 5,0–5,5 ms/frame; FPS 59–60 (risco é bateria/térmica, não jank) — `metricas-baseline/chromakey.json`, `tools/chromakey-cpu.cjs` |
| Regrade do rino por ffmpeg (gold-mono / lut3d) | aprovado (viável) | vídeo é verde (97,5%), não ciano; gold-mono 99,7% dourado com matte intacto, 720p H.264 3,48 MB; alpha nativo VP9 820 KB + HEVC 1,41 MB gerados; 9:16 <800 KB só com corte a 6 s — `hero/regrade-stats.json`, `hue-distribuicao.json`. Escolha dourado × prata: CEO |
| HEVC alpha em Safari/iOS | bloqueado | sem aparelho real; WebM alpha + poster PNG como fallback |
| MongoDB local (ping) | aprovado | 122 ms, 9 coleções |
| networkidle em consultoria-imobiliaria | bloqueado | tracker GoDaddy mantém long-poll (timeout 45 s) |
| Envio de e-mail (SMTP) | bloqueado | nenhuma variável SMTP/Resend em `.env`/`.env.example` |
| Variáveis Vercel / allowlist Atlas | bloqueado | não verificáveis localmente |
| Exposição `server/.env.bak-atlas` em prod | falhou | `GET /server/.env.bak-atlas` → 200 (628 B), fora do probe anterior; localmente traz URI Atlas com usuário:senha (cluster `siteadtech`) e o mesmo `JWT_SECRET` de `server/.env`. Probe novo: `tools/exposicao-prod.sh` → 18 falhas — `backend-vercel/exposicao-prod-v2.txt` |
| `.vercelignore` com `server/` (P0 do AUDIT §5) | falhou | `vercel build` termina "ok", mas a função fica sem `server/src` → `ERR_MODULE_NOT_FOUND` ao importar `api/[...path].js` (derruba `/api/*`, viola D5). Build local com os arquivos ainda no disco dá falso positivo — `backend-vercel/cenario-B-ignore-server/`, `func-runtime-check.txt` |
| `.vercelignore` restrito (mantém `server/src`) | falhou | função íntegra (`/api/health` 200), mas o estático ainda publica `server/src/**` + `server/package.json` (14 arquivos) só escondidos pelo 307 — `backend-vercel/cenario-C-ignore-restrito/static-files.txt` |
| `outputDirectory: "complexodmc.com.br"` em `vercel.json` | aprovado | estático = pasta pública (113 arquivos; 0 `server/`, 0 `.env*`; `robots.txt`, `sitemap.xml`, `/solucoes/*` e `plataforma-ead/` na raiz; sem stub); função contém `server/src/server.js` e responde `/api/health` 200; `tools/vercel-build-check.sh` → APROVADO — `backend-vercel/cenario-D-outputDirectory/`, proposta em `backend-vercel/proposta/` |
| `vercel build` com `engines.node = "20.x"` (HEAD) | falhou | CLI 64.5.0 recusa: `BUILD_UTILS_NODE_VERSION_DISCONTINUED`; projeto na Vercel já em 24.x — `backend-vercel/engines-node-20-falha.txt` |

## Bloqueios
- Geração de vídeo por IA / Blender: indisponíveis → cenas procedurais + ffmpeg.
- E-mail de aviso de lead: precisa de `RESEND_API_KEY`, `LEADS_EMAIL_TO`, `LEADS_EMAIL_FROM` (domínio verificado) — CEO. Sem isso o lead é gravado no banco, sem aviso.
- Política de privacidade: rascunho em `pages/politica-de-privacidade.html` (sitemap + rodapés de `pages/` e das 7 trabalhistas); **não publicar** com os `[CONFIRMAR]` (itens 6–9 abaixo). O rótulo de consentimento da home (`index.html`, `#cf-consentimento`) ainda não linka a página — home/frontend (o de `treinamento-interesse` já linka).
- Variáveis de ambiente da Vercel, allowlist do Atlas e `DEV_SIMULAR_PAGAMENTO` em prod: não verificáveis daqui.
- Hotfix T3: pré-requisitos do repositório cumpridos em T5 (`engines.node` 24.x, `vercel.json` com `outputDirectory`, build-check APROVADO, `.vercel/output` antigo com os `.env` apagado e reconstruído sem eles). Resta ao CEO: rotação das credenciais (incluindo a do `server/.env.bak-atlas`) e autorização do deploy — roteiro em `docs/dmc/DEPLOY.md`.
- `server/uploads/` (PDFs/capas da EAD) é gitignored: deploy via Git publica a função sem esses arquivos (`/api/materiais/*` 404) — precisa de armazenamento persistente (backend-engineer, D5). Via CLI sobem empacotados, somente leitura.
- Aprovações do CEO pendentes: headline final (proposta em uso); regrade do rino dourado (gold-mono) × prata/grafite (lut3d) — tiras em `audit/2026-10-17/hero/*-comparacao.png`; nome "Defesa Empresarial" (alternativa "Gestão do Contencioso Trabalhista"); conteúdo da futura `pages/sobre.html` (substitui `Sobre.html` da raiz). Login → D6; números → D7; tecnologia.html → D1 (transversal).
- iPhone real para validar HEVC alpha antes de trocar o chromakey.

## Rodada 2026-10-17 tarde (sessão de retomada)
- Gate D3 de conteúdo: frases de ato privativo sem atribuição 40 → 15 (8 = nome "Defesa Empresarial", aguarda CEO;
  3 = simulador explicativo de E5; 4 = home/pilotos, corrigidas na home em 8018600). Schema reservado: 0.
- Home: Ad-tech sem "integração com tribunais e cartórios", "API" e "PCDs" (aguardam confirmação do CEO), 3 cartões;
  E4 "Auditoria e Inteligência Contábil"; `?assunto=EN#contact` pré-seleciona o eixo vindo das páginas internas.
- Divergência a confirmar (CEO): o content-director trocou "ato/pacote/mensalidade com SLA" por "escopo apresentado
  em proposta" em `consultoria-imobiliaria`, `juridico-imobiliario` e `juridico-vendas` (forma de pagamento em
  publicidade — Provimento 205/2021). Manter é a recomendação.
- `juridico-vendas` já estava diferenciado de `juridico-imobiliario` (title, H1, produtos): não fundir.
- CNPJ/razão social/encarregado: sem fonte no repositório — `[CONFIRMAR]` da privacidade seguem abertos.

## Pendências de conteúdo para o CEO (conformidade, commit 8e7f2f7)
1. Nome do parceiro contábil e do auditor habilitado (CRC) — citar a Bear Finance como em `quitacao-anual`?
2. Parcerias para usucapião/pareceres e atendimento fora de SP — confirmar antes de publicar.
3. Elaboração de contratos e pareceres é atividade privativa da advocacia: definir como o site apresenta a execução (sociedade de advogados parceira/conveniada).
4. Fatos jurídicos a revisar por profissional habilitado: prazo de registro (FAQ de registro-imobiliario; "30 dias" removido) e inventário extrajudicial frente à Res. CNJ 571/2024.
5. Gráfico 100/110/120% de recuperacao-ativos: é ilustração do art. 523 do CPC (não é resultado) — recomendação: manter.

## Pendências de conteúdo — rodada 2026-10-17 (content-director)
Feito: `docs/dmc/EIXOS-COPY.md` (conteúdo-mestre E1–E6 para painel, mega-menu e páginas
internas); `pages/politica-de-privacidade.html` (LGPD, padrão das páginas de serviço, sem
herói de malha) + `sitemap.xml`; FAQ (5–6 perguntas, componente `.faq-item` + acordeão inline
+ JSON-LD `FAQPage`, padrão de `recuperacao-ativos`) nas 7 páginas trabalhistas, antes do
bloco de vídeo; link "Política de Privacidade" nos rodapés (17 de `pages/` deixam de apontar
para `#`; 7 trabalhistas ganham o link). `ciclo-fechado`: "Cuidamos de todo o jurídico
trabalhista" → "Coordenamos toda a frente trabalhista". QA local (Playwright 320/390/1440): 0
overflow, acordeão abre, nenhuma resposta cortada, 0 erro de console.
**Exceção ao bloco de vídeo:** `pages/politica-de-privacidade.html` (página legal), além de
`mouse.html` e `treinamento-interesse.html`.

6. Privacidade — razão social, CNPJ e nome/canal do encarregado (art. 41).
7. Privacidade — prazo de retenção dos leads (sugestão: 24 meses do último contato) e data de
   vigência.
8. Privacidade — região do cluster Atlas e da função Vercel (transferência internacional,
   art. 33); política própria da Área do aluno (EAD).
9. Script GoDaddy (`img1.wsimg.com/tccl.min.js`) em `consultoria-imobiliaria`,
   `juridico-imobiliario` e `juridico-vendas`: remover (frontend) e apagar o parágrafo de
   exceção da política. Único rastreador do site; sem analytics/pixel.
10. **Incidente T3 × LGPD:** credenciais do Atlas expostas em prod (leads e alunos) podem
    exigir comunicação à ANPD e aos titulares (art. 48; Res. CD/ANPD 15/2024, 3 dias úteis) —
    avaliar com o jurídico.
11. EIXOS-COPY — `[CONFIRMAR]` por eixo (holding rural; IBS/CBS; IA de minutas; cartórios
    conveniados; ARTHEU; página de Auditoria Empresarial) e divergências listadas no fim do
    arquivo: "mensalidade dedicada" em `consultoria-imobiliaria`; nome "Blindagem"; slugs
    `por-que-urgente` e `contabilidade`; Lei 13.140/2015 × art. 42, par. único (mediação
    trabalhista) em `camara-de-acordos`; backup `recuperacao-ativos.backup-2026-08-26.html`
    na pasta pública.
12. Trabalhista — "Parecer jurídico em 24–48 h" (`decisao-assistida`) sem atribuição a advogado
    (ver item 3).

## Revisão editorial final da home — 2026-10-17 (content-director, sobre aba355e)
Feito em `complexodmc.com.br/index.html` (só texto, metas e JSON-LD; classes/ids/data-* intactos):
title 50 car. · meta description 150 car. (igual em OG/Twitter) · `og:image` (`hero-poster.jpg`,
1280×720) · JSON-LD `Organization @id #organization` + `WebSite` + `WebPage` só com dados do
rodapé (sem CNPJ) — parseia · H1 único, H2 por seção · hero `aria-hidden` no `.hero__media`
(vídeo decorativo, mudo, `tabindex=-1`) está correto. Copy: painel dos eixos confere com
EIXOS-COPY sem os `[CONFIRMAR]` (ARTHEU e IA de minutas fora); 14 cards/destaques reescritos
(promessa → método: "sem inventário judicial", "eficiência tributária/fiscal", "minutas em
minutos", "resolve o conflito", "execução do que é seu", "especialistas em direito imobiliário");
intro de "A casa" × "Soluções" × rodapé sem repetição; treinamentos sem "domine/aprenda
estratégias avançadas"; "30 minutos" retirado; linha legal do rodapé reescrita (não cita o
Provimento como se a DMC fosse sociedade de advogados; atribui atos privativos a parceiros e
cartórios). Mega-menu (`navbar.js`) confere com EIXOS-COPY. Scan do texto visível: 0 promessas;
restam só "Blindagem" (divergência 2) e "24 horas" (carga horária).
**Para o CEO:** (a) nomes "Blindagem Patrimonial/Contratual" e "Proteção Patrimonial" (card de
`pronto-patrimonio`) — manter ou trocar (divergência 2); (b) treinamentos: confirmar cursos
ativos na EAD e cargas/formatos (20/16/24/18/12/8 h; presencial e híbrido); (c) Ad-tech:
"Integração com tribunais e cartórios", "Integração via API" e "Acessível para PCDs" — confirmar
que a plataforma entrega isso hoje; (d) logo do JSON-LD = `RINO_logo.png` (1280×560) — ok?
**Para frontend/mídia:** gerar `og-image.jpg` 1200×630 a partir do novo poster do hero (hoje
aponta para o poster antigo); pré-seleção do `select#cf-eixo` pelo `data-assunto` dos CTAs.

## Seção "Sobre" da home + página institucional — 2026-10-17
Feito: seção `#conheca` redesenhada (overline "Sobre", headline "Decisões complexas pedem visão
integrada.", lead = mensagem central do CEO, tablist dos seis eixos com setas/Home/End, foco do
eixo com fade + 8px, CTAs primário → `#contact` e secundário → `pages/sobre.html`); rede neural
reescrita (anel com arco lento, brilho radial sutil, linhas finas, pulsos, rótulos número + nome
curto, avanço automático a cada 5 s até a primeira interação, nó clicável, reduce = quadro
estático); `pages/sobre.html` nova (content-director); "A casa" → "Sobre" no menu/gaveta/rodapés;
`sitemap.xml`. QA local: 0 overflow e 0 erro de console em 390/1024/1440; interações verificadas
por script (clique, teclado, hover lista↔rede, clique no nó, reduced-motion sem animação nem
avanço). Capturas em `docs/dmc/qa/2026-10-17/sobre/`.
**Para o CEO:** (a) revisar o texto de `pages/sobre.html` (afirmação "um responsável por eixo e
governança comum" veio do briefing, não de documento-fonte); (b) nomes dos parceiros habilitados
e cartórios conveniados continuam só por categoria; (c) atendimento fora de SP respondido como
"definido na conversa inicial".

## Página Sobre v2 (layout na estrutura da Planning) — 2026-10-17
Pedido do CEO: a v1 de `pages/sobre.html` "não está adequada"; seguir planning.com.br/sobre como
modelo de layout. Refeita com CSS próprio `pages/css/sobre.css` (namespace `sb-`, só tokens) e
abas em `assets/js/sobre.js`. Estrutura: herói com cartaz do rinoceronte + trilha · faixa preta
de fatos sobreposta (só fatos D7) · "Somos o Complexo DMC" (malha `.sol-net` + texto) · "Quem
conduz" (CEO) · propósito em faixa escura · seis eixos em abas (pergunta, especialidade, para
quem, quando procurar — de EIXOS-COPY) · método 01–04 · governança "quem assina o quê" · FAQ ·
`#video` · conversa + sede. Corpo em papel, faixas escuras. JSON-LD: AboutPage, FAQPage (igual
ao HTML) e BreadcrumbList. QA: 0 overflow 320–1920, 0 erro de console, contraste ≥ 5,1:1, abas
por clique/setas/Home/End/`#sb-eixo-N`, sem JS = seis painéis empilhados; e2e `--grep sobre`
15/16 — a falha são os links `/parcerias/*` do menu, WIP da sessão de Parcerias.
**Para o CEO:** foto e demais sócios do bloco "Quem conduz"; linha do tempo e selos só com datas
e prêmios comprovados.

## Página Sobre v3 — fotos e documento institucional (2026-10-17)
Fonte: "Complexo-DMC-Institucional" (PDF do CEO, em ~/Downloads) + 5 fotos enviadas no chat.
Fotos tratadas (recorte, cor única, nitidez, vinheta leve; WebP em 2 larguras, sem metadados/GPS) em
`assets/images/sobre/`: recepção 3º, sala de atendimento 3º (porta-retratos desfocados, sem objetos
pessoais), estúdio 7º, portaria (rosto do porteiro desfocado) e retratos P&B 4:5 de Daniel, Dr. Matheus
e Darci (os dois últimos extraídos do PDF). Descartada: estações de trabalho (telas com documentos).
Página: fatos 3 andares/5 competências/6 eixos/1 endereço; "Somos" com foto e texto da apresentação;
"Quem responde" (3 retratos, cargos e registros CRA/OAB/CRC); trajetória 01–04; instalações (quadro de
andares + galeria); método com entrega por etapa + 4 princípios; FAQ "fora de SP" com o atendimento
digital do 7º; sede com sala 32, CEP, prédio, razão social e CNPJ (também no JSON-LD). Governança
intacta. `solucao.js` saiu da página. e2e `--grep sobre` 17/17; 0 overflow; 0 erro de console.
**Para o CEO (conformidade):** (a) o PDF descreve jurídico e contabilidade internos; governança e
rodapé dizem que atos privativos são de parceiros — decidir com o responsável jurídico; (b) fora:
"remuneração por resultado/honorários de êxito" (Prov. 205/2021 veda divulgar honorários) e "reunião
de 30 minutos sem compromisso".

## Portal acadêmico — Portal do Aluno e Portal do Professor (2026-10-18)
Especificação: `docs/dmc/PORTAL-ACADEMICO.md` (índice, prevalece) + `PORTAL-API.md` + `PORTAL-UX.md`. Decisões em
`DECISIONS.md`, seção "Portal acadêmico (2026-10-18)", PA-1…PA-9.

| Item | Status (atualizado em 18/10/2026, 10:45; criado às 06:30) |
|---|---|
| Especificação | ✅ consolidada e revista três vezes (API, UX e índice; registro no índice §15–§17); 19 fatias, D-01…D-82 |
| Propagação de D-37…D-82 à API e à UX (índice §14 item 1) | ⏳ pendente: a API não cita D-70…D-82 e a UX não cita D-52…D-82; até lá vale a regra de §0/§11 |
| Fase 0 | 🔄 iniciada em 18/10/2026 por autorização do CEO ("execute com máxima qualidade"); ordem F0a → F0m ∥ F0b ∥ F0s ∥ F0r + principal, S0–S3 (PA-6) |
| Sessão 2d | ⚠️ encerrou às 01:12 de 18/10 sem commitar o próprio trabalho (`login.html`, `login-classico.html`, `business-school.{css,js}`, rotas `vitrine`/`bolsas` + testes, acréscimos em `server.js`/`db.js`/`config.js`). Conferido às 09:05: nenhum desses arquivos mudou depois de 01:07 (último: `business-school.css`, 01:06) — não há sessão 2d ativa. Reconferido às 10:41: igual (`login.html` 01:02, `login-classico.html` 00:47, `business-school.js` 01:04, `business-school.css` 01:06, `vitrine`/`bolsas`/`db.js`/`config.js` 00:33–00:39; último commit do repositório `9c0309c`, 01:11) |
| Aviso à 2d (§5.5, itens 1–10 e 7a) | ⛔ **bloqueado formalmente em 18/10/2026, 09:05**: sem destinatário, porque a sessão 2d encerrou (acima). O conteúdo do aviso é a §5.5 do índice, sem acréscimo; item 7 (`?v=`): as páginas da plataforma carregam `js/api-client.js?v=dev` e `js/app.js?v=dev`, e `login.html`/`login-classico.html` carregam os dois sem `?v=` (sempre a versão em disco); o hash sai no G2 (`versionar-ead.mjs`). Pedido de liberação de `server.js` (item 7a): registrado às 06:30, não entregue; liberação: não houve. Entrega quando a 2d for retomada ou o CEO indicar quem responde por ela; se nada mudar até 19/10/2026 (um dia de trabalho, D-70), o CEO é avisado junto com a decisão pendente de PA-9. Reconferido às 10:10 com `sonda-contratos.mjs` (serve.mjs na porta 4630): 0 global ou método do HEAD sumido, 0 item faltando de §7.1–§7.7, signup e `/me` com os 5 campos legados + `papel`, `precisaTrocarSenha`, `temFoto`, `doisFatoresAtivo`, `emailVerificado`, 0 erro de console (`docs/dmc/qa/2026-10-18-g0a-r3-principal/verificador/contratos.json`). Reconferido às 10:41 (serve.mjs na porta 4630, PID próprio encerrado; `docs/dmc/qa/2026-10-18-g0a-r4-principal/`): sonda com 0 quebra HEAD → atual (só `DMC_init` ganhou `opcoes`), 0 item faltando, 0 ícone faltando, 0 erro; `login.html` e `login-classico.html` abertos sobre o núcleo atual fazem `signIn` → `user()` (5 campos legados + os 5 novos) → `DMC_init()` → `DMC_capaSrc` → `signOut` com 0 erro de console e 0 resposta ≥ 400 (`login-2d-consumidores.json`); `business-school.js` usa só `isLogged`, `signIn`, `signUp`, `signOut`, `user`, `DMC_init`, `DMC_capaSrc`. O lado do código está pronto; o que falta é o destinatário. **Decisão do CEO: pendente** (nenhuma registrada até 10:45). Opções: (1) indicar quem responde pela 2d, e a principal entrega a §5.5 (itens 1–10 e 7a) e registra aqui a data; ou (2) aceitar por escrito o plano B (D-70) e abrir a fase 1 sem o aviso, que fica para quando a 2d voltar (riscos R19 e R26: entrada só por e-mail no login da 2d, `PORTAL_2FA` desligado, linhas 6.3 e 17.25 "C · 2d"). A principal não registra decisão em nome do CEO: até lá, o critério "contrato da 2d entregue" do G0-a continua ⛔ |
| S2 (cabeçalho aplicado, D-60) | ✅ aplicado pela principal em 18/10, ~07:30 (D5 antes/depois em `docs/dmc/qa/2026-10-18-s2-antes` e `-s2-depois`). Conferido às 09:00 com `node tests/tools/cabecalho-ead.mjs --verificar`: 27 páginas, 0 mudança pendente, 2 recusadas (da 2d), 0 erro. D5 (inclusive L0, captura de `login-classico.html` idêntica) + `portal-ui` 45/45 na verificação do G0-a (`docs/dmc/qa/2026-10-18-g0a-verif/e2e-d5-ui.txt`) |
| `server.js` | Plano B (D-70). Os três pontos foram aplicados pela principal como acréscimo sobre o arquivo em disco (arquivo gravado às 07:55; `montar.js` existe desde 07:36): l. 33 `import { montarPortal, tratarErroGlobal } from './portal/montar.js';`, l. 161 `app.use('/api', montarPortal());` (depois de `bolsas`, antes de `liberacoes`), l. 183 `app.use(tratarErroGlobal);` no lugar do bloco anônimo. As linhas da 2d (vitrine, bolsas) ficaram intactas. Commit de `server.js` depende da decisão do CEO de PA-9 (levaria junto as linhas da 2d) |
| G0-a — itens da principal | 🔄 em correção (verificação das 08:53). Corrigidos às 09:05: (a) registro do aviso da §5.5 e do bloqueio (linha acima); (b) `tests/e2e/vercel-config.spec.js` passa a conferir o cabeçalho efetivo — dashboard, loja, admin, `/plataforma-ead/`, `/plataforma-ead` e `css/plataforma.css` com a CSP estrita em report-only (com `QA_ESTRITO=1`, no G2, exige a mesma política aplicada); `login(.html)` e `login-classico(.html)` com a report-only do site e sem CSP aplicada: 10 aprovados, 1 bloqueado (`regras do emulador = config.json`: `.vercel/output/config.json` de 17/10 22:12 é mais antigo que o `vercel.json`; falta `npx vercel build`) |
| Pedido à F2 (G0-a r2, D-74, §8.2 item 1) | ⏳ encaminhado pela principal em 18/10/2026, 10:10: em `tests/e2e/portal-avaliacoes.paginas.js` (posse da F2), acrescentar `hospedeira: true` nas 5 entradas (`aula.html` é da F1b; `professor.html`, da F8). Hoje o carregador `paginasDoPortal()` (F0b) recusa o arquivo e o caso "os portal-<x>.paginas.js são válidos" do `portal-qualidade` falha no G0 (reconferido às 10:09, porta 4631: 1 falhou). Os outros 8 arquivos passam um a um, e o conjunto sem o da F2 também (50 entradas). Numa cópia fora do repositório com a correção, o conjunto passa (55 entradas, as 5 da F2 hospedeiras). A principal não edita o arquivo; reconfere quando a F2 avisar |
| G0-b (D-70) | ✅ critérios atendidos em 18/10, 09:00: três pontos aplicados; `server/test/servidor-erros.test.js` 4/4 (texto dos três pontos na posição de API §5.3 + app real: JSON quebrado com a senha em `POST /api/auth/senha/trocar` → 400 `formato-invalido` e log espião sem a senha; reprova, conferido por mutação, com o bloco anônimo antigo e com um handler que loga o erro); `npm test` 836/836; `serve.mjs` (porta 4630) `GET /api/portal/saude` 200 `{ok:true, esperados:27, carregados:21, comFalha:0}` = 21 arquivos de módulo presentes (ausentes: `documentos`, `contratos` · F4b; `financeiro` · F5; `publicacoes`, `banners`, `relatorios` · F7). Reconferido às 10:41 (porta 4630): `{ok:true, esperados:27, carregados:27, comFalha:0}` — os 6 módulos antes ausentes já existem em disco (não integrados). O G0-b só abre o E2E e o G1 da fase 1 depois do G0-a |
| Aceite do login da 2d (API §10.8, `login-portal.spec.js`) | ⏳ pendente; `PORTAL_2FA` desligado até ele (D-71) |
| `QA_INTEGRADAS` (D-73) | fase 0 e G0: `F0a,F0m,F0b,F0s,F0r` (é também o padrão do `_portal.js` com a variável ausente, §9.1). Fase 1: nenhuma fatia integrada ainda — a lista cresce a cada G1 integrado. Nenhum commit de fatia até agora |
| Publicação | ⛔ bloqueada pelos itens de segurança do incidente T3 (índice §13, 1ª linha; §9.9 item 5) e sujeita a decisão do CEO na rodada (D3) |
