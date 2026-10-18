# Integração da home v2 — relatório do integrador (2026-10-17)

Branch `feat/dmc-prime`, a partir do HEAD b26a462. Spec: `docs/dmc/HOME_REDESIGN.md` (§1.3, §2, §5) com as
sobreposições do diretor (seção 02 `#conheca` intocada; navbar/hero/contato/rodapé não redesenhados;
`components.css`/`navbar.js` não editados). Nada foi commitado.

## O que entrou
| Arquivo | Conteúdo |
|---|---|
| `complexodmc.com.br/index.html` | `<main id="conteudo" class="home">`; sprite `icones-eixos.svg` como `<svg hidden>` primeiro filho de `<main>`; ordem do DOM `hero → conheca → features (eixos) → porque → verticais → presenca → publicacoes → treinamentos (metodo) → newsletter → video → contact`; `components.css?v=3`, `styles.css?v=c5`, `home.css?v=1` (logo após `styles.css`), `navbar.js?v=c4`, `main.js?v=c4`, `rede-neural.js?v=2` mantido, `+ <script type="module" src="assets/js/brasil.js?v=1">`. H2 de `#video` ("O Complexo DMC *em vídeo*.") e de `#contact` ("Comece pela *decisão a tomar*.") + overline/lead conforme `copy.json`; texto do vazio do vídeo "em preparação". Rodapé: `+ Newsletter (#newsletter)`, "Área do aluno" → "DMC Business School", "Ad-tech" → "ADTECH", frase da marca com "no Brasil e no exterior" (D9); sem "Parcerias". |
| `assets/css/home.css` (novo) | `_shared → eixos → porque → verticais → presenca → publicacoes → metodo → newsletter`, cabeçalho por bloco. Única alteração nos parciais: o fio `.eixos-item::before` ficou só em `_shared` (com `inset:-1px` para cobrir a hairline) e saiu de `eixos.css`. |
| `assets/js/main.js` | Removidos `initEixos`, `initBusca`, `sortearDestaque`, `initSolucoes` (painel/tablist antigo). Adicionados, numa IIFE no fim: `initVerticais` (de `verticais.js`), `initNewsletter` + `validarLocal` + `MENSAGENS_NEWSLETTER` (de `newsletter.js`, sem `export`), `initEixosAncora` (`#eixo-N` → `scrollIntoView`, sem ARIA/replaceState) e `initWhatsAppQualificado` (`[data-assunto=EN]` / `?assunto=EN` → `href` do `.whatsapp-float` com o texto do eixo). Hero, CTA→`#cf-eixo`, scrollToTop, formulário de contato e `.dmc-reveal` intactos. |
| `assets/js/brasil.js` (novo) | `presenca.js` do parcial; import trocado para `./data/brasil-capitais.js`. |
| `assets/js/data/brasil-capitais.js` (novo) | cópia do parcial. |
| `assets/css/styles.css` | Cortados por bloco: `.fatos` (170-198), `.np-section/.np-cases*/busca/.np-axes/.np-flag*/.np-spot*/.np-grid/.np-card/.np-closer`, `.treinos*`, `.adtech*` (336-790). Fio de acento reduzido a `.casa__tab::before`. Mantidos: base, herói, **bloco `.casa*` inteiro**, `.page-video__*` (triplicado, intocado), contato + `.dmc-form .form-*`, flutuantes, reduce. Seletores órfãos restantes: só classes criadas por JS (`is-enviando/erro/sucesso`) e `page-video__caption` (bloco triplicado). |
| `index.html` (a11y) | `aria-label` do link "Receber quando sair" de `#publicacoes` passou a conter o texto visível (axe `label-content-name-mismatch`). |

## O que saiu do index.html
`.fatos`; `#features` antigo (`.np-section`, `.np-cases-band`, `#npAskForm/#npAsk/#npAskStatus`, `.np-axes`, `.np-flags`, `#npGrid` com 18 cards, `.np-closer`); `#treinamentos` antigo (`.treinos`); `#results` (`.adtech`). Âncoras extintas: `#results`, `#npGrid`, `#npAskForm`, `#npAsk`, `#npAskStatus`, `#aba-eixo-N`. `#eixo-1…6` continuam (artigos de `#features`).

## Tamanhos (bytes brutos · gzip)
| Arquivo | HEAD | Agora |
|---|---|---|
| `index.html` | 98 470 | 84 609 · gz 20 108 |
| `styles.css` | 42 156 | 23 921 · gz 6 496 |
| `home.css` | — | 28 519 · gz 7 296 (com os comentários dos parciais; orçamento §7 fala em ≤ 14 KB / ≤ 4 KB gz — ver pendências) |
| `main.js` | 21 254 | 26 467 · gz 7 702 |
| `brasil.js` + `data/brasil-capitais.js` | — | 10 089 + 805 |

## Mídia referenciada
Todos os 20 posters (`assets/images/home/vertical-<slug>[-m].{avif,webp}`, 700 KB) e os 10 loops
(`assets/videos/home/vertical-<slug>.{webm,mp4}`, 5,4 MB) existem nos caminhos da §4. Nenhum faltante.

## Verificação (servidor `tests/server/serve.mjs`, `QA_PORT=4660 QA_NO_MONGO=1`, PID guardado e encerrado ao fim)
- `verificacao.json`: 390 e 1440 → 0 erros de console/pageerror/requestfailed/4xx; overflow 0 px antes e depois de rolar; 11 ids na ordem; `#eixo-1…6` presentes; sprite é o primeiro filho de `<main>`; 1 `h1`; 0 `role=tab` nas seções novas; 1 canvas em `#conheca`; rodapé com "Newsletter / DMC Business School / ADTECH"; 0 `img` sem `width/height`; 27 links internos → 200; 0 âncora quebrada. Em `#features`, os 6 `a.eixos-item__cta` são os únicos focáveis antes do `summary`.
- Com rolagem real por seção: 1440 → `#verticais` 3 `video.is-playing` (os 2 fora da tela ficam sem `<source>`), `#presenca` canvas 1 / `data-motion="on"` (→ `off` ao sair); 390 → 0 `<source>`, 0 canvas, `still`.
- axe (`@axe-core/playwright`) por seção nova em 390 e 1440, com `.dmc-reveal` assentado: 0 serious/critical.
- Lighthouse mobile (`LH_PAGINAS=home LH_RUNS=1 QA_LH_PORT=4661`): **Perf 99 · A11y 100 · BP 100 · SEO 100 · LCP 1,96 s · CLS 0,003 · TBT 7 ms** (`docs/dmc/qa/2026-10-17/lighthouse/resumo.json`).
- Capturas de página inteira: `home-390.png`, `home-1440.png` (reveal forçado após rolar; sem isso as seções com `.dmc-reveal` saem vazias na captura).

## Suíte e2e (QA_REUSE=1 QA_PORT=4660; home-secoes, viewports, movimento, console, newsletter, eixos, a11y)
371 passaram, 21 falharam — todas por contrato de teste, não por defeito da página:
1. `movimento.spec` espera `data-motion="running"`; a entrega (§3·06 / tarefa) usa `on|off|still`.
2. `newsletter.spec` espera `#nlMessage` e `data-origem="home"` (contratos-qa §3.1); o parcial/blueprint usa `#newsletterMessage` e `home-newsletter`. Decidir um lado e alinhar (1 linha no HTML ou no teste).
3. `home-secoes` "overflow por seção": acusa `div.form-hp` (honeypot em `left:-10000px`) em `#newsletter` **e em `#contact`** — o contato é o do HEAD, logo o critério do teste precisa ignorar elementos à esquerda da janela.
4. `home-secoes` "terceiros": a regex `/logo|marca|brand|selo/` casa com `eixos-cata**logo**__chev` (falso positivo; usar `\b`).
5. `home-secoes` "conformidade": `#publicacoes` cita "inventário" sem a fórmula de atribuição na mesma seção — questão de copy (`copy.json › publicacoes`), fora do integrador.
6. axe `color-contrast` em `.metodo-programa > .dmc-overline` (1440) e `label-content-name-mismatch` em `#publicacoes`: o segundo foi corrigido no HTML; o primeiro não reproduz com o reveal assentado (cor 130,96,46 sobre 245,243,239 = 5,18:1) — o teste roda o axe durante a transição de opacidade; forçar `is-in`/aguardar antes de analisar.

## Como testar
```sh
cd /Users/dmchagas/Site_Complexo_DMC
QA_PORT=4660 QA_NO_MONGO=1 node tests/server/serve.mjs & PID=$!
open http://127.0.0.1:4660/           # 390: SVG do mapa, posters; 1440: loops + canvas ao rolar
QA_REUSE=1 QA_PORT=4660 npx playwright test tests/e2e/home-secoes.spec.js tests/e2e/viewports.spec.js
LH_PAGINAS=home LH_RUNS=5 QA_LH_PORT=4661 node tests/lighthouse.mjs
kill $PID
```
