# Contratos de teste afetados pelo redesign da home

QA · 2026-10-17 · working tree sobre `db32651` (branch `feat/dmc-prime`).
Linha de base medida hoje (suíte filtrada por home, `mongod` descartável, porta 4641):
**20/20 aprovados** — home 7/7, movimento 5/5, formulario 8/8 (`qa/2026-10-17-contratos-qa/e2e/`).
Lighthouse mobile da home (mediana de 3, `qa/2026-10-17-final/lighthouse/resumo.json`):
**99/100/100/100**, LCP 1,80 s, CLS 0,003, TBT 0 ms, peso total 1.193 KB.

Este documento não altera teste nem produto. Ele diz o que quebra, o que muda e o que nasce.

---

## 1. Asserções que dependem da estrutura atual da home

Legenda: **quebra** = falha certa com a nova estrutura; **risco** = depende de como for implementado; **mantém** = contrato que a nova home precisa honrar sem mudança no teste.

### 1.1 `tests/e2e/home.spec.js` — painel dos eixos (7 testes, todos **quebram**)

| Linha | Asserção | Depende de |
|---|---|---|
| 10–11 | `#features [role="tab"]` / `#features [role="tabpanel"]` | `main.js` l. 265–278 injeta `role=tablist/tab/tabpanel` em `.np-axes a[data-eixo]` e `.np-flag[data-eixo]` |
| 26–28 | exatamente 1 `[role="tablist"]` em `#features`, com `aria-label` | idem |
| 30 | 6 `[role="tab"]` | 6 `<a href="#eixo-N" data-eixo="N">` em `.np-axes` (`index.html` l. 367–416) |
| 32–35 | `#aba-eixo-N[aria-controls="eixo-N"]`; `#eixo-N[role=tabpanel][aria-labelledby=aba-eixo-N]` | ids criados por JS (`main.js` l. 271–277); artigos `#eixo-1..6` (`index.html` l. 417, 445, 473, 501, 529, 557) |
| 38–40 | estado inicial: E1 selecionado, `tabindex` `[0,-1,-1,-1,-1,-1]`, só `eixo-1` visível | `ativar('1')` (`main.js` l. 361–362); `p.hidden` nos demais |
| 46–58 | → ← Home End com volta circular; foco em `#aba-eixo-N`; 1 só painel visível | `keydown` (`main.js` l. 347–357) |
| 61–63 | Tab a partir da aba ativa sai da faixa | `tabindex` móvel |
| 69–73 | clique em `#aba-eixo-5` → `location.hash === '#eixo-5'` | `history.replaceState` (`main.js` l. 331) |
| 77–86 | `/#eixo-N` abre o painel N e a tablist fica em viewport | `naUrl` + `scrollIntoView` (`main.js` l. 361–364) |
| 89–96 | `location.hash = '#eixo-3'` troca o painel sem recarregar | `hashchange` (`main.js` l. 365–371) |

Observação medida: o working tree já tem **uma segunda tablist** em `#conheca` (`casa-tab-1..6` → `casa-foco-1..6`, `index.html` l. 212–254, controlada por `rede-neural.js` l. 43–47). Nenhum teste a cobre hoje. A seção 02 ("A Casa") vai substituí-la ou mantê-la — ver §2.1.

### 1.2 `tests/e2e/movimento.spec.js` — reduced-motion (5 testes)

| Linha | Asserção | Status |
|---|---|---|
| 8–9, 23–45 | `.hero__video`, `.hero__poster img`: com `reduce` não toca e o cartaz aparece; sem preferência escolhe `currentSrc` | **mantém** (hero não muda) |
| 53 | `page.locator('#conheca')` existe | **risco** — se a seção 02 trocar o id, o teste falha por timeout |
| 56 | `#conheca canvas` (ausente ou parado) | **risco** — a rede neural muda de seção (06 Presença Nacional) |
| 58–61 | compara `canvas.toDataURL()` em dois instantes (700 ms) | **quebra silenciosa** com WebGL: sem `preserveDrawingBuffer` o `toDataURL` devolve quadro vazio nas duas leituras → "não mudou" = falso aprovado. Um canvas 3D exige outro método (§2.4) |

### 1.3 `tests/e2e/navegacao.spec.js` — navbar (22 testes)

| Linha | Asserção | Status |
|---|---|---|
| 7 | `AMOSTRA` inclui `/` | **mantém** |
| 12–14 | `dmc-navbar header#navbar` montado | **mantém** (`navbar.js` fora do escopo) |
| 27–41 | mega-menu com 6 destinos → 200 | **mantém** |
| 107–130, 133–177, 180–190 | Acessar, gaveta, quebra 1024 | **mantém** |

Dependência indireta: `navbar.js` gera `href` para `#features` (l. 144), `#treinamentos` (l. 154, 175) e `#contact` (l. 161, 178). Ver §1.8.

### 1.4 `tests/e2e/a11y.spec.js` (2 testes na home)

| Linha | Asserção | Status |
|---|---|---|
| 12–15 | axe após `rolarTudo` (revela `.reveal/.dmc-reveal`) — 0 serious/critical | **mantém**; cresce com as 10 seções (contraste ouro `#d6b069` sobre branco quente é o ponto fraco provável: 4,5:1 exige fundo escuro ou texto grande) |
| 51 | exatamente 1 `<h1>` | **mantém** — as seções 02–09 usam `<h2>`; hoje `#results` usa `<h2 class="dmc-h1">` (classe, não tag — ok) |
| 52 | exatamente 1 `<main>` (`main#conteudo`, `index.html` l. 133) | **mantém** |
| 48–54 | todo `input/select/textarea` com nome acessível | **mantém**; passa a incluir os campos da newsletter |
| 53 | `lang` começa com `pt` | **mantém** |

### 1.5 `tests/e2e/console.spec.js` (2 testes na home: 1440 e 390)

l. 14–28: 0 `console.error` e 0 `pageerror` após `rolarTudo`. Tolerância só para `RUIDO_EXTERNO` (`_site.js` l. 24–30: YouTube/Google). **Mantém**; o WebGL (contexto perdido, shader, `getContext` nulo em 390 sem GPU) e o `fetch` do JSON do mapa entram na conta.

### 1.6 `tests/e2e/viewports.spec.js` (7 testes na home)

l. 46–63: `scrollWidth − clientWidth ≤ 0` em 320/375/390/768/1024/1440/1920, medido no carregamento e após `rolarTudo`, com lista de culpados. **Mantém**. Pontos de atenção da nova home: grid 3×2 (03), mosaico (04), painéis fotográficos (05), SVG do mapa com `viewBox 0 0 1000 1000` (06) e formulário em linha da newsletter (09) a 320 px.

### 1.7 `tests/e2e/seo.spec.js` (1 teste na home)

l. 39–63: `<title>` e `meta description` únicos, 1 canonical = `https://www.complexodmc.com.br/`, JSON-LD que faz parse e sem `LegalService/ProfessionalService/Attorney`. **Mantém**. Se a seção 07 ganhar JSON-LD de `Article`/`BlogPosting`, ele entra no parse e na lista de tipos.

### 1.8 `tests/e2e/rotas.spec.js` — links e sub-recursos

| Linha | Asserção | Status |
|---|---|---|
| 121–147 | sub-recursos da home sem 4xx/5xx após rolar | **mantém**; cobre imagens AVIF/WebP das verticais, `geo/brasil.json`, ícones dos eixos |
| 166–194 | links internos renderizados → 200 sem redirect; **l. 187** âncora precisa existir na página de destino; **l. 189** âncora precisa existir na própria página | **quebra** se a home perder algum id abaixo |
| 197–232 | crawl a partir do sitemap | **mantém** |
| 92–118 | nenhum segredo em arquivo público | **mantém** |

Âncoras da home exigidas por páginas internas (contagem no working tree, `grep -rhoE` em `pages/` e `solucoes/`):

| Âncora | Links de entrada | Onde |
|---|---|---|
| `#treinamentos` | **28** (`../#treinamentos` 21 + `../../#treinamentos` 7) + `navbar.js` l. 154/175 | seção 08 precisa manter `id="treinamentos"` (ou um elemento com esse id) mesmo virando "Metodologia" |
| `#features` | **28** (20 + 7 + 1 `../index.html#features`) + `navbar.js` l. 144 | seção 03 mantém `id="features"` |
| `#contact` | **44** (`?assunto=E1..E6#contact` 34 + `../#contact` 9 + `../index.html#contact` 2) + `navbar.js` l. 161/178 | seção 10 mantém; `?assunto=` exige `#cf-eixo` + `main.js` l. 61–64 |
| `#eixo-1..6` | 0 externos; só `.np-axes` interna | livres para virar âncora de artigo |

### 1.9 `tests/e2e/formulario.spec.js` (8 testes) — **mantém** integralmente

ids `#contactForm`, `#cf-nome/email/telefone/empresa/perfil/eixo/mensagem/consentimento/website`, `#formMessage[role=status]`, `action="/api/contato"`, `data-origem="home"` (l. 26–47, 109, 149). Contrato da API (l. 185–210): 201 grava · 400 `{error, campos}` · isca 200 sem gravar · 6.º envio do mesmo IP 429 com `Retry-After` · >16 KB 413. É o molde da newsletter (§3.1).

### 1.10 Infra e metas

| Arquivo:linha | Contrato |
|---|---|
| `_site.js` 13–21 | `PAGINAS` vem do `sitemap.xml` (26 URLs) — a home é `/` |
| `_site.js` 24–30 | qualquer domínio de terceiro novo (mapa, fontes, CDN) sem entrada em `RUIDO_EXTERNO` reprova em console/sub-recursos |
| `_site.js` 59–70 | `rolarTudo` em passos de 0,9 × viewport, 40 ms — seções com `.reveal` e lazy-load são reveladas assim |
| `playwright.config.js` 6–8, 33–41 | `QA_PORT` (4590), `QA_DATA`, saída `docs/dmc/qa/<data>/e2e/`; `webServer` = `tests/server/serve.mjs`; `QA_REUSE=1` reaproveita |
| `tests/server/serve.mjs` 62–64, 97–100, 213–218 | `mongod` do PATH (há: `/opt/homebrew/bin/mongod`); `server/.env` nunca lido; `x-qa-cliente` simula IP |
| `vercel.json` rewrites | `/api/(.*)` → função; `connect-src 'self'`, `img-src 'self' data: blob: https://i.ytimg.com`, `frame-src` só YouTube/Vimeo (CSP report-only) |
| `tests/lighthouse.mjs` 27, 29–36, 72–74, 113 | metas 90/95/95/95; `home` = `/`; `LH_PAGINAS` filtra; mobile simulado; mediana por Performance |

---

## 2. Como os testes devem evoluir (cobertura igual ou maior)

### 2.1 Seção 02 — A Casa (`#conheca`)
- Se a tablist `casa-tab-N/casa-foco-N` **permanecer**: migrar os 3 testes de teclado/ARIA de `home.spec.js` l. 23–64 para `#conheca [role="tablist"]` (ids `casa-tab-N` → `casa-foco-N`), sem hash.
- Se **sair**: nenhum teste de tablist na home; `movimento.spec.js` l. 49–66 passa a mirar a seção do mapa (§2.4).
- Em ambos os casos: asserção nova "`#conheca` existe, tem `<h2>` e `aria-labelledby`".

### 2.2 Seção 03 — Seis Eixos (`#features`, grid 3×2)
Contrato proposto: `section#features` → 6 `article#eixo-N.np-pillar-<slug>[data-eixo="N"]`, cada um com `<h3 id="eixo-N-titulo">`, `aria-labelledby`, 1 `<svg aria-hidden="true">` e 1 `a.eixo__cta` ("Explorar soluções").

Substitui os 7 testes atuais por:
1. **Estrutura**: 6 artigos, todos visíveis ao mesmo tempo (0 `hidden`), 6 títulos distintos, 6 ícones com `innerHTML` distintos (ícone exclusivo por eixo), nenhum `role=tab/tabpanel` na seção.
2. **Sem JS**: `javaScriptEnabled:false` → os 6 artigos e CTAs estão no HTML servido (hoje a faixa também é progressive enhancement).
3. **`/#eixo-N` (N ∈ {1,4,6})**: `#eixo-N` em viewport (`toBeInViewport`) e `:target` resolvido; sem `hashchange` sintético (não há painel a trocar).
4. **Teclado**: Tab a partir do `<h2>` da seção percorre os 6 CTAs na ordem E1→E6 e cada um tem foco visível (`outline` ou `box-shadow`, mesmo critério de `navegacao.spec.js` l. 101–104).
5. **Destino certo**: `href` de cada CTA → 200 sem redirect e o `<body class>` da página de destino contém o mesmo `np-pillar-<slug>` do artigo (medido hoje: planejamento-sucessorio/patrimonial, planejamento-tributario/fiscal, consultoria-imobiliaria/imobiliario, contabilidade/auditoria, recuperacao-ativos/ativos, ciclo-fechado/trabalhista). Vale também para E6 em `solucoes/` (`body.sol-page.np-eixo.np-pillar-trabalhista`).
6. **Ordem e nomes**: E1…E6 com os nomes do `BRIEF.md` (regex por eixo); "Tecnologia" não aparece como eixo.

Cobertura: antes 7 testes/1 viewport; depois 6 testes × 2 viewports (1440, 390) = 12.

### 2.3 Seção 05 — Verticais
`section#verticais` → 5 `article.vertical`, cada um com 1 link, `<picture>` com `source[type=image/avif]` + `source[type=image/webp]` + `<img width height loading="lazy" decoding="async" alt>`; `alt` não vazio ou `alt=""` + texto do título no próprio `<a>`. Testes: 5 links distintos → 200 sem redirect e presentes no sitemap; `width/height` declarados (CLS); nenhuma `src` fora da origem; em 320 px nenhum culpado de overflow.

### 2.4 Seção 06 — Presença Nacional (mapa + 3D)
Contrato: `section#presenca` com `<svg role="img" aria-labelledby>` inline (27 `path[data-uf]`, `path[data-uf="SP"].is-sede`), camada 3D em `.presenca__3d` que só monta canvas quando `matchMedia('(min-width:768px)')` e `prefers-reduced-motion: no-preference`; o componente marca `data-motion="still"|"running"` no contêiner.

Testes (substituem `movimento.spec.js` l. 49–66):
1. **390 px** (qualquer preferência): 0 `canvas` em `#presenca`; SVG visível (fallback estático).
2. **1440 + reduce**: 0 `canvas` ou `data-motion="still"`; contador de `requestAnimationFrame` (injetado com `addInitScript` antes do carregamento) ≤ 1 chamada em 1 s com `#presenca` em viewport.
3. **1440 + no-preference (controle)**: `data-motion="running"` e contador > 10 em 1 s.
4. **Geografia**: 27 UFs, SP único `.is-sede`; texto da seção sem número de cobertura (`/\d+\s*(estados|cidades|municípios|clientes|%)/i` → 0 ocorrências).
5. **Fontes externas**: 0 requisições fora da origem disparadas pela seção (tiles, CDN de Three.js) — CSP `connect-src 'self'`.

### 2.5 Seção 07 — Publicações
`section#publicacoes` → `article.publicacao` com `<h3>`, `<time datetime>` ISO ≤ hoje e 1 link; **ou** `.publicacoes__vazio` (estrutura preparada). Testes: cada link interno → 200 e em sitemap; externo → `HEAD` 200/301 com `failOnStatusCode:false` e `causa` se bloqueado; `datetime` válido e não futuro; 0 ocorrências de `lorem|título do artigo|em breve` fora de `.publicacoes__vazio`.

### 2.6 Seção 08 — Metodologia/Treinamentos
Mantém `id="treinamentos"` (28 links de entrada, §1.8). Teste: todo nome de programa citado na seção existe como `titulo` de curso em `plataforma-ead/js/data.js` (hoje só "Arquitetura Patrimonial Estratégica", 42 horas, Online); links `plataforma-ead/*` → 200; 0 links `login.html?curso=` com nome fora do catálogo (hoje há 6 — `index.html` l. 886–919).

### 2.7 Seção 09 — Newsletter (API real)
Ver §3.1. Reaproveita o padrão de `formulario.spec.js` (frontend + integração com `mongod` descartável, `bloqueado` sem `mongod`).

### 2.8 Lighthouse
`tests/lighthouse.mjs` não muda; a home continua em `TODAS`. Acrescentar à `resumir()` (opcional) `mainthread-work-breakdown` e `third-party-summary` para medir o custo do 3D.

---

## 3. Novos testes a criar

### 3.1 `tests/e2e/newsletter.spec.js`
Contrato de frontend: `form#newsletterForm[action="/api/newsletter"][method=post][data-origem="home"]`, `#nl-nome`, `#nl-email`, `#nl-empresa` (opcional), `#nl-consentimento[required]` com `label[for]` contendo "LGPD" e link para `/pages/politica-de-privacidade.html`, honeypot `#nl-website` (`tabindex=-1`, `autocomplete=off`, dentro de `aria-hidden="true"`), `#nlMessage[role=status]`, botão "Quero receber análises", texto visível com "descadastr".

Contrato de API (`POST /api/newsletter`, espelho de `server/src/routes/contato.js`): parser próprio 16 KB (`server.js` l. 30 — hoje só `/api/contato` tem; o global é 1 MB); throttle por IP (`criarThrottle`, `throttle.js`); 201 `{ok:true,id}` grava em coleção própria com `consentimento.{aceito,em}` e `origem`; 400 `{error, campos}`; isca → 200 `{ok:true}` sem gravar; e-mail repetido → 200 sem duplicar; 429 com `Retry-After`; 413; 503 se o banco falhar.

| Teste | Esperado |
|---|---|
| obrigatórios vazios | 0 POST; `:invalid` em `nl-nome`, `nl-email`, `nl-consentimento`; foco no 1.º |
| válido | 201; `#nlMessage` anuncia confirmação; campos limpos; corpo `{email, consentimento:true, origem:'home'}`; 1 documento no banco |
| inválido (400) | `aria-invalid`, `aria-describedby` com o erro do campo, foco no 1.º inválido |
| isca | 200; mensagem neutra; 0 documentos |
| API: 6.º envio do mesmo IP | 429 + `Retry-After` |
| API: > 16 KB | 413 |
| API: e-mail repetido | 200 e `count === 1` |
| falha de rede (`page.route` → `abort()`) e 503 | `#nlMessage` **não** contém "receb"/"cadastrad"; contém orientação de tentar de novo |
| sem `mongod` | integração `bloqueado` com motivo (como `formulario.spec.js` l. 176–183) |

Também: `server/test/newsletter.test.js` (node --test, sem banco) no molde de `server/test/contato.test.js`.

### 3.2 `tests/e2e/home-secoes.spec.js`
- **Ordem das 10 seções**: ids em ordem no DOM: `hero, conheca, features, porque, verticais, presenca, publicacoes, treinamentos, newsletter, video, contact` (os nomes novos a confirmar com frontend-motion; o teste lê a lista de um array único).
- **Vídeo antes do contato**: `#video .page-video__frame[data-video]` existe e precede `#contact`.
- **Links das verticais e publicações ≠ 404** (§2.3, §2.5).
- **Sem marcas de terceiros indevidas**: texto visível + `alt` + `aria-label` da home sem `Google Ads|Meta Ads|Facebook|Instagram|LinkedIn|TikTok|Forbes|Exame (revista)|Valor|Estadão|Folha de S\.?Paulo`; 0 `<img>`/`<svg>` com `logo` de terceiro fora do rodapé. Hoje: "Facebook" só em comentário OG (l. 13), "Exame" como substantivo (l. 756), "folha" = folha de pagamento — o regex precisa de contexto (`Revista Exame`, `Folha de S.Paulo`).
- **Conformidade automática** (complementa `docs/dmc/audit/tools/scan-conformidade.cjs`): texto visível sem `\d+\s*%`, `garant`, `\d+\s*(clientes|anos de|prêmios|R\$)`, `líder|melhor do|ranking|depoimento`; atos privativos citados com "parceiros habilitados|cartórios conveniados" na mesma seção.
- **Mapa com fallback em reduced-motion** (§2.4).
- **0 overflow 320–1920**: já coberto por `viewports.spec.js`; acrescentar medição **por seção** (`getBoundingClientRect().right ≤ clientWidth` para cada `section`) para apontar a seção culpada.
- **axe por seção**: `AxeBuilder.include('#features')` etc. nas 1440 e 390, para que a falha nomeie a seção; mantém o axe global de `a11y.spec.js`.
- **Imagens**: toda `<img>` fora do hero com `loading="lazy"`, `width`/`height`, formato AVIF/WebP na `<picture>`; nenhuma acima de 250 KB (lido de `response.headers()['content-length']`).

### 3.3 Ajustes em arquivos existentes
- `movimento.spec.js`: substituir l. 49–66 pelo bloco do mapa; manter hero.
- `home.spec.js`: reescrever conforme §2.2 (ou renomear para `eixos.spec.js`).
- `_site.js`: acrescentar `contarRaf(page)` (hook de `requestAnimationFrame`) e `textoVisivel(page)`.
- `docs/dmc/QA.md` §Grupos: atualizar a linha "home (tablist, #eixo-N)".

---

## 4. Comandos exatos

```bash
# Suíte filtrada pela home (hoje: home + movimento + formulario; depois: + newsletter + home-secoes)
cd /Users/dmchagas/Site_Complexo_DMC
QA_PORT=4641 QA_DATA=2026-10-17-home-v1 npx playwright test \
  tests/e2e/home.spec.js tests/e2e/movimento.spec.js tests/e2e/formulario.spec.js \
  tests/e2e/newsletter.spec.js tests/e2e/home-secoes.spec.js

# Testes de qualquer spec que anotem pagina('/') — a11y, console, viewports, rotas, seo da home
QA_PORT=4641 QA_DATA=2026-10-17-home-v1 npx playwright test --grep "› /$|› / |overflow /$|› /#"

# Reaproveitando um servidor já de pé (depuração)
QA_PORT=4641 npm run test:qa-server &   # guarde o PID: QA_PID=$!
QA_PORT=4641 QA_REUSE=1 npx playwright test tests/e2e/home.spec.js
kill $QA_PID                              # só o PID que você iniciou

# Lighthouse mobile só da home (3 execuções, mediana; porta 4591 por padrão)
LH_PAGINAS=home QA_DATA=2026-10-17-home-v1 npm run test:lh
# 5 execuções quando houver variação de CLS/TBT
LH_PAGINAS=home LH_RUNS=5 QA_DATA=2026-10-17-home-v1 npm run test:lh

# API sem banco (inclui o futuro server/test/newsletter.test.js)
npm test
```

Evidências: `docs/dmc/qa/2026-10-17-home-v1/e2e/{resumo.json,resultados.json,relatorio/}` e `.../lighthouse/{resumo.json,home.report.html,home-r1..3.report.json}`. Não passar `--reporter` na linha de comando: isso descarta os reporters do `playwright.config.js` e grava `resumo.json` na raiz (aconteceu nesta medição; arquivo removido).

---

## 5. Metas e critérios de aprovação

| Métrica | Meta | Hoje (home) |
|---|---|---|
| Lighthouse Performance (mobile, mediana de 3) | ≥ 90; **alvo de não-regressão ≥ 95** | 99 |
| Accessibility / Best Practices / SEO | ≥ 95 cada | 100/100/100 |
| LCP | ≤ 2,5 s; alvo ≤ 2,0 s | 1,80 s |
| CLS | ≤ 0,1; alvo ≤ 0,02 | 0,003 |
| TBT | ≤ 200 ms; alvo ≤ 50 ms (3D é o risco) | 0 ms |
| Peso total | ≤ 1,5 MB na primeira dobra mobile; imagens das verticais lazy | 1.193 KB |
| E2E home (todos os grupos com `pagina('/')`) | 100 % aprovados, 0 bloqueados com `mongod` presente | 20/20 no recorte medido |
| Overflow 320–1920 | 0 px em 7 larguras, antes e depois de rolar | 0 |
| axe serious/critical | 0 em 1440 e 390 | 0 |
| Console | 0 erros próprios; `RUIDO_EXTERNO` sem entrada nova | 0 |
| Links internos | 0 quebrados, 0 via redirect, 0 âncoras inexistentes (`#features`, `#treinamentos`, `#contact` preservadas) | 0 |
| Newsletter | 201/400/isca/429/413/503 + falha de rede sem falso sucesso | não existe |
| Conformidade | 0 hits de promessa/percentual/número sem fonte no texto novo | 0 novos (`scan-conformidade.cjs`) |

Aprovação da home: todas as linhas acima dentro da meta em **duas execuções consecutivas** da suíte filtrada e do Lighthouse (mediana), com evidência em `docs/dmc/qa/<data>/`. Qualquer "bloqueado" precisa de motivo e dono.
