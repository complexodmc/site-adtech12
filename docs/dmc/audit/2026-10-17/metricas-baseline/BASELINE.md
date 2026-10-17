# Baseline de métricas — antes do redesign (2026-10-17)

Medido no servidor local `http://127.0.0.1:8080/complexodmc.com.br/` (python http.server, sem compressão/cache de CDN).
Ferramentas: Lighthouse 13.5.0 (mobile, throttling simulado, Chrome headless=new), Playwright 1.64 (Chromium 1248).
Scripts: `docs/dmc/audit/tools/baseline-*.{sh,mjs}`. Evidências brutas nesta pasta (`lighthouse/*.report.{json,html}`, `lighthouse-summary.json`, `viewports.json`, `links.json`, `a11y.json`, `assets-home.json`, `screenshots/`).

Observação de método: o Lighthouse rodou em background enquanto os scripts Playwright executavam a partir da 3ª página (consultoria-imobiliaria e ciclo-fechado) — possível contaminação leve de CPU; o throttling é simulado, então o efeito nos scores é pequeno. Reexecutar `baseline-lighthouse.sh` isolado se precisar de precisão maior.

## 1. Lighthouse mobile

| Página | Perf | A11y | BP | SEO | FCP | LCP | CLS | TBT | Peso total | Requisições |
|---|---|---|---|---|---|---|---|---|---|---|
| index.html (home) | 75 | 95 | 96 | 100 | 3,8 s | 4,58 s | 0,003 | 0 ms | 5.277 KB | 17 |
| pages/planejamento-sucessorio.html | 80 | 94 | 96 | 100 | 2,8 s | 4,30 s | 0,000 | 102 ms | 4.443 KB | 31 |
| pages/consultoria-imobiliaria.html | 59 | 92 | 96 | 100 | 3,0 s | 4,56 s | 0,000 | 792 ms | 4.482 KB | 35 |
| solucoes/consultoria-trabalhista/ciclo-fechado.html | 91 | 100 | 100 | 100 | 2,8 s | 2,81 s | 0,000 | 0 ms | 240 KB | 13 |

Aviso do Lighthouse em consultoria-imobiliaria: "The page loaded too slowly to finish within the time limit. Results may be incomplete." Causa observada: duas requisições `img1.wsimg.com/.../eventbus/web?clientid=...` (status 202, `finished:false`, long-poll) injetadas pelo script de rastreamento GoDaddy/`secureserver.net` em `pages/consultoria-imobiliaria.html:1476`. O mesmo script faz o Playwright nunca atingir `networkidle` nessa página (timeout 45 s em todas as 7 larguras; a página renderiza normalmente).

Maiores oportunidades (por página, `lighthouse-summary.json`):

| Página | Oportunidade | Economia |
|---|---|---|
| home | unused-css-rules | 450 ms / 106 KB |
| home | unminified-css | 300 ms / 47 KB |
| home | unminified-javascript | 16 KB |
| consultoria-imobiliaria | unused-css-rules | 390 ms / 40 KB |
| consultoria-imobiliaria | unminified-css | 190 ms / 21 KB |
| planejamento-sucessorio | unused-css-rules / unminified-css | 180 ms / 38 KB; 180 ms / 19 KB |
| ciclo-fechado | unused-css-rules / unminified-css | 34 KB; 22 KB |

O Lighthouse não lista como "oportunidade" os maiores pesos reais (ver §5): vídeos MP4 e o favicon PNG de 2 MB.

Auditorias reprovadas:
- home: `heading-order` (H1→H3), `target-size` (`button.carousel-dot`), `errors-in-console` (404 em `assets/images/logo.png`, `index.html:1372`).
- planejamento-sucessorio: `color-contrast` (`span.split-divider__text`), `landmark-one-main` (sem `<main>`), `inspector-issues` (cookie de terceiros do embed YouTube).
- consultoria-imobiliaria: `color-contrast` (`span.split-divider__text`), `heading-order` (`h3.split-panel__title`), `landmark-one-main`, `label-content-name-mismatch` (link WhatsApp `a.btn--p…` com texto visível diferente do `aria-label`), `inspector-issues` (cookie).
- ciclo-fechado: nenhuma.

## 2. Viewports (Playwright, 320/375/390/768/1024/1440/1920)

| Página | Overflow horizontal | Erros de console | HTTP ≥ 400 | Nav |
|---|---|---|---|---|
| home | nenhum em 7 larguras | 1 (404 logo.png) em todas | 1: `assets/images/logo.png` 404 | ok |
| planejamento-sucessorio | nenhum | 0 | 0 | ok |
| consultoria-imobiliaria | nenhum | 0 | 0 | timeout `networkidle` 45 s × 7 (tracker GoDaddy) |
| ciclo-fechado | nenhum | 0 | 0 | ok |

`scrollWidth == clientWidth` em todas as 28 combinações (`viewports.json`). Screenshots full-page: `screenshots/<página>-390.png` e `-1440.png` (home-390 tem 11.975 px de altura; o header fixo aparece repetido no meio da captura — artefato da captura full-page, não defeito da página).

## 3. Links (`links.json`)

43 arquivos HTML, 549 referências internas resolvidas contra o filesystem (considera reescrita `/solucoes/:v/:slug` → `.html`).

Internos quebrados (2):
- `complexodmc.com.br/index.html:1372` → `<img src="assets/images/logo.png">` (arquivo não existe; há `onerror` que esconde a imagem, mas gera 404 e erro de console em toda visita).
- `complexodmc.com.br/em-construcao.html:12` → `assets/css/style.css` (existe `styles.css`).

Externos: 38 URLs únicas, 10 não-OK:
- `https://fonts.googleapis.com` e `https://fonts.gstatic.com` respondem 404 à raiz — são `preconnect`, falso positivo.
- **Canônicas apontando para 404 em produção** (`<link rel="canonical">`/og:url): `https://www.complexodmc.com.br/pages/recuperacao-ativos.html` (404) e as 7 URLs `https://www.complexodmc.com.br/solucoes/consultoria-trabalhista/<slug>` (404, com e sem `.html`). Produção hoje não serve essas páginas (verificado com `curl -L`; `pages/planejamento-sucessorio.html` e `/` respondem 200).

## 4. Acessibilidade rápida (`a11y.json`, Playwright 1440)

| Página | lang | H1 | img sem alt | botão sem nome | input sem label | contraste H1 hero |
|---|---|---|---|---|---|---|
| home | pt-BR | **2** ("Consultoria empresarial, tributária e contábil"; "Fale com a gente, conheça nossa empresa e reescreva seu futuro.") | 0/11 | 0 | **4** (`form#contactForm`: 3 input + textarea sem `<label>`/aria-label) | 15,8:1 (#e8edf3 sobre #0f1318) |
| planejamento-sucessorio | pt-BR | 1 | 0/1 | 0 | 0 | 19,8:1 |
| consultoria-imobiliaria | pt-BR | 1 | 0/1 | 0 | 0 | 19,8:1 |
| ciclo-fechado | pt-BR | 1 | 0/1 | 0 | 0 | 19,8:1 |

Saltos de heading: home e consultoria-imobiliaria (H1→H3). Nenhum `<main>` em planejamento-sucessorio e consultoria-imobiliaria (Lighthouse). Contraste do hero medido sobre a cor de fundo computada — os heros não têm mídia atrás do H1 na captura (vídeo/canvas ficam em container separado), portanto o valor é representativo.

## 5. Assets carregados pela home (`assets-home.json`; idêntico em 1440 e 390)

| Tipo | Qtde | Bytes |
|---|---|---|
| media (mp4) | 2 | 4.610 KB (`rino-hero.mp4` 3.640 KB + `rino-video-transparent.mp4` 970 KB) |
| stylesheet | 3 | 276 KB (`styles.css?v=traco4` 158 KB sem minificação; Font Awesome all.min.css) |
| font | 5 | 217 KB (`fa-solid-900.woff2` 150 KB + Inter) |
| document | 1 | 121 KB (`index.html`) |
| image | 2 | 103 KB (`hero-poster.jpg`) |
| script | 3 | 43 KB |
| **Total** | **16** | **5,24 MB** |

Terceiros na home: cdnjs.cloudflare.com, fonts.googleapis.com, fonts.gstatic.com. O MP4 de 3,6 MB é baixado integralmente também em 390 px (sem `<source media>` nem poster-only em mobile).

Páginas internas (via Lighthouse `network-requests`):
- `assets/images/LOGO_RINOCERONTE.png` **1.995 KB** é carregado como favicon (`<link rel="icon">`, linha 10 de planejamento-sucessorio e consultoria-imobiliaria); existe `LOGO_RINOCERONTE.webp` de 182 KB.
- `rino-video-transparent.mp4` 970 KB em todas as internas.
- Embed YouTube `13w3h_VjvGs` carregado no load (`planejamento-sucessorio.html:913`, `consultoria-imobiliaria.html:1090`): +8 requisições youtube.com, doubleclick, jnn-pa.googleapis.com (~700 KB de JS). O bloco lazy `.page-video__frame[data-video]` dessas páginas está vazio (`data-video=""`), ou seja, o vídeo que carrega não é o do bloco padrão.
- `assets/videos/BACKGROUND2.gif` tem 75 MB no repositório (não carregado pelas 4 páginas medidas; verificar referências antes de deploy).

## 6. Conformidade (texto público das 4 páginas — Provimento 205/2021 e posicionamento)

- `pages/consultoria-imobiliaria.html:606` — "Reduzimos em até 70% o tempo entre a venda e o repasse bancário" (percentual de resultado sem fonte).
- `pages/consultoria-imobiliaria.html:627` — "fé pública garantida" (promessa).
- `pages/consultoria-imobiliaria.html:884, 887, 1219` — "IA e advogados imobiliários…", "Validação por advogado imobiliário", "diagnóstico gratuito com nossos advogados imobiliários" (apresenta a DMC como escritório de advocacia + oferta "gratuito").
- `pages/consultoria-imobiliaria.html:597` — "Por que regularizar meu empreendimento é urgente?" e `index.html:1662` "Por que o planejamento sucessório é urgente?" (urgência).
- `pages/planejamento-sucessorio.html:131-157` — marquee "+205M Ativos Reais / +86 Holdings Efetivadas / 98% Satisfação dos Clientes / +1200 Famílias Atendidas / 15+ Anos" (estatísticas sem comprovação).
- `index.html` — H1 "Consultoria empresarial, tributária e contábil", `<meta description>` "Escritório de Consultoria Empresarial…", linha 409 "Direito, contabilidade, tributário…", card "Contabilidade" (`:922-925`), `:1041` "sem custo e sem compromisso" (posicionamento contábil; oferta gratuita).
- `solucoes/consultoria-trabalhista/ciclo-fechado.html` — nenhuma ocorrência nos padrões buscados.
