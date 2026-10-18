# Inventário técnico do frontend da home — base para o redesign

Levantado em 2026-10-17 sobre `feat/dmc-prime` (working tree). Fontes lidas na íntegra:
`complexodmc.com.br/index.html` (1164 l.), `assets/css/tokens.css` (294), `components.css` (604),
`styles.css` (1192), `assets/js/main.js` (503), `rede-neural.js` (621), `video.js` (111),
`navbar.js` (368), `pages/css/eixos.css` (1058, só blocos 0–3), `tests/e2e/*.spec.js`,
`tests/lighthouse.mjs`, `docs/dmc/qa/2026-10-17-final/lighthouse/resumo.json`.

Ordem de carga da home (`index.html:106-113`):
`tokens.css?v=1` → `components.css?v=2` → `styles.css?v=c4`; scripts `navbar.js?v=c3` (defer),
`main.js?v=c3` (defer), `video.js?v=1` (defer), `rede-neural.js?v=2` (`type=module`).
`<script>document.documentElement.classList.add('dmc-js')</script>` inline na l. 93 é o gate de
tudo que depende de JS (`.dmc-reveal`, fade do vídeo, foco da casa).

---

## 1. Componentes e classes reutilizáveis

Todos em `components.css` (prefixo `dmc-`), consomem só tokens, convivem com qualquer CSS legado.

| Classe | Onde | O que faz | Exemplo de uso |
|---|---|---|---|
| `.dmc-wrap` | components 19-25 | container `--container` (1240) + `--gutter` lateral, `margin-inline:auto` | `<div class="dmc-wrap">…</div>` |
| `.dmc-section` | 105-108 | `padding-block: var(--space-section)` (64→144), `position:relative` | `<section class="dmc-section" id="x">` |
| `.dmc-section--rule` | 109 | `border-top` 1px `--color-line` (fio entre seções escuras) | `class="dmc-section dmc-section--rule"` |
| `.dmc-on-paper` | 95-102 | seção clara: fundo `--surface-paper`, texto `--text-ink-1`, redefine `--focus-color`, overline → `--np-accent-deep`, lead → `--text-ink-2`, botões invertem (primário preto) | `<section class="dmc-section dmc-on-paper">` — hoje: `#treinamentos`, `#contact`, `.np-cases-band` |
| `.dmc-sec-head` | 110-116 | grid `gap: --space-5`, `max-width: 48rem`, `margin-bottom: --space-block`; zera margens dos filhos | `<div class="dmc-sec-head"><p class="dmc-overline">…</p><h2 class="dmc-h1">…</h2><p class="dmc-lead">…</p></div>` |
| `.dmc-overline` | 56-62 | 12px caixa-alta, tracking .16em, cor `rgb(var(--np-accent))` (ouro fora de eixo; cor do eixo dentro de `.np-pillar-*`) | `<p class="dmc-overline">Sobre</p>` |
| `.dmc-display` / `.dmc-h1` / `.dmc-h2` | 63-75 | Newsreader 300, `text-wrap: balance`; `<em>` = itálico (substitui "palavra em degradê"); tamanhos `--fs-display/h1/h2` | `<h2 class="dmc-h1">Seis eixos, <em>uma só governança</em></h2>` (na home os H2 de seção usam `.dmc-h1`; `.dmc-display` só no H1 do herói) |
| `.dmc-h3` / `.dmc-h4` | 76-84 | Hanken 600, `--fs-h3`/`--fs-h4`, lh 1.35 | `<h3 class="dmc-h3">` |
| `.dmc-lead` | 85-91 | `--fs-lead` 18→22, lh 1.55, `max-width: --measure` (38rem), `--text-2` | `<p class="dmc-lead">` |
| `.dmc-small` | 92 | 14px, `--text-3` | legendas |
| `.dmc-btn` | 119-148 | inline-flex, 48px, Hanken 600 14px, raio 2px, svg 16px com `translateX(4px)` no hover; `:focus-visible` outline ouro; `[disabled]`/`aria-disabled` opacidade .4 | base obrigatória das variantes |
| `.dmc-btn--primary` | 150-151 | ouro + texto preto; hover `--color-gold-soft`; em papel → preto/papel | `<a class="dmc-btn dmc-btn--primary" href="#contact">Converse… <svg…></a>` |
| `.dmc-btn--secondary` | 153-155 | fio `--color-line-strong`, seta no acento, hover borda no acento; em papel → fio `--color-control-ink` | `<a class="dmc-btn dmc-btn--secondary" href="#contact" data-assunto="E1">` |
| `.dmc-btn--link` | 157-166 | 44px, sublinhado offset .5em, sem padding | `<a class="dmc-btn dmc-btn--link" href="#features">Ver os seis eixos</a>` |
| `.dmc-reveal` | 588-594 | `html.dmc-js .dmc-reveal {opacity:0; translateY(16px)}` → `.is-in` por IntersectionObserver em main.js 229-244 (threshold .12, rootMargin -40px, uma vez; reduced-motion mostra tudo) | nunca em conteúdo crítico/LCP. Hoje só em `#video .page-video__frame` (l. 989) |
| `.dmc-sr-only` / `.dmc-skip` | 27-53 | texto só para leitor de tela / "pular para o conteúdo" (navbar.js injeta o skip para `#conteudo`) | — |
| `@keyframes dmc-enter / dmc-drop / dmc-fade` | 596-604 | entrada 16px+fade; queda 8px; fade puro. Reutilizáveis via `animation: dmc-enter var(--dur-reveal) var(--ease-out) both` | usado pelo herói (styles 164), `.np-flag.is-entering` (632), `.np-grid.is-entering` (680) |

**Acento por eixo — `--np-accent`** (tokens.css 135-139 e 250-279). Formato `"R, G, B"`:
`rgb(var(--np-accent))`, `rgba(var(--np-accent), .2)`. Três paradas: `--np-accent` (sobre escuro),
`--np-accent-deep` (texto sobre papel), `--np-accent-soft` (realce). Padrão no `:root` = ouro.
Classes: `.np-pillar-patrimonial` (E1 petróleo) · `-fiscal` (E2 sálvia) · `-imobiliario` (E3 ardósia)
· `-auditoria` (E4 cobre) · `-ativos` (E5 rosé) · `-trabalhista` (E6 violeta). Basta pôr a classe no
ancestral (li, article, a, g do SVG) e todo `rgb(var(--np-accent))` abaixo troca de cor. Exemplos
vivos: `.casa__eixos li`, `.casa__foco-item`, `.np-axes li`, `.np-flag`, `.np-card`, `.np-case`,
`.dmc-footer__list li`, `.dmc-mega__item` (navbar.js) e até `<g class="np-pillar-x" style="color:rgb(var(--np-accent))">`
no SVG fallback (index 200-205). `.np-pillar-tecnologia` não existe de propósito (cai no ouro).
Em `eixos.css` o acento não está redeclarado (herda tokens via `@import`); o bloco 0 só mapeia nomes
legados (`--primary-green`, `--card-accent`…) para `rgb(var(--np-accent))`.

**Padrões "fio de acento que cresce"** (styles 53-65): `.casa__tab::before, .np-axes a::before,
.np-card::before` = barra 2px no topo, `scaleX(0)`→`scaleX(1)` em `--dur-slow`. O mesmo padrão
vive em `.dmc-mega__item a::before` (components 353-364). Reaproveitável em qualquer lista editorial.

**Padrão "lista numerada com fio"**: `.np-flag-list` (519-540, `counter(diferencial, decimal-leading-zero)`
no acento) e `.treino__meta::before` (725, counter `treino` em `--color-gold-deep`). Serve ao grid
3×2 dos eixos e à seção "Por que a DMC".

**`.page-video__*`** (styles 804-957, bloco **triplicado** com `pages/css/shared.css` e
`consultoria-imobiliaria.css` — mexeu em um, mexa nos três e suba o `?v=`). Markup:
```html
<section class="dmc-section dmc-section--rule page-section" id="video" aria-labelledby="video-titulo">
  <div class="dmc-wrap"><div class="dmc-sec-head">…</div>
    <div class="page-video__frame dmc-reveal" data-video="" data-video-title="Complexo DMC">
      <div class="page-video__empty"><span class="page-video__play" aria-hidden="true"><svg…></span>
        <p class="page-video__empty-title">…</p><p class="page-video__empty-text">…</p></div>
    </div></div></section>
```
`video.js` só age quando `data-video` tem ID/URL do YouTube: troca o `__empty` por `button.page-video__cover`
(miniatura `i.ytimg.com` lazy + `.page-video__play`) e, no clique, pelo `<iframe youtube-nocookie>`.
Os ajustes de tema da home ficam no escopo `#video .page-video__*` (959-976) para não divergir das cópias.
O bloco triplicado ainda tem valores fora do sistema (raio 16px, `transition: box-shadow`, fallback
`0, 231, 252` ciano, `font-weight: 700`) — a home já os neutraliza no escopo `#video`.

---

## 2. Tokens disponíveis (tokens.css) e lacunas

**Cor**: `--color-black #0b0c0e`, `--color-graphite-900/800/700/600/500/400`, `--color-white`,
`--color-paper #f5f3ef`, `--color-paper-2 #e9e6e0`; ouro `--color-gold #d6b069`, `--color-gold-deep`,
`--color-gold-soft`, `--color-gold-rgb` (triplet); fios `--color-line` (.10), `--color-line-strong` (.18),
`--color-line-ink` (sobre papel), `--color-control`, `--color-control-ink`; `--color-error(-ink)`,
`--color-success`. Papéis: `--surface-0…3`, `--surface-glass`, `--surface-paper`; `--text-1/2/3`,
`--text-ink-1/2/3`, `--text-on-gold`. Foco: `--focus-color(-ink)`, `--focus-width 2px`, `--focus-offset 3px`.
Véu do herói: `--hero-veil` (.86), `--hero-veil-mid` (.6), `--hero-veil-off`. Eixo: `--np-accent(-deep/-soft)`.

**Tipografia**: `--font-text` (Hanken), `--font-display` (Newsreader), `--font-numeric` (tnum/lnum);
pesos `--fw-light/regular/medium/semibold` (teto 600); escala fluida `--fs-display` 40→88,
`--fs-h1` 36→64, `--fs-h2` 30→48, `--fs-h3` 22→32, `--fs-h4`/`--fs-lead` 18→22, `--fs-body` 16→17,
`--fs-small` 14, `--fs-overline` 12; `--lh-display/heading/snug/body`; `--tracking-*`; `--measure 38rem`.

**Espaço**: `--space-0…13` (0→160px, escala 4/8), `--space-section` 64→144, `--space-block` 40→80,
`--gutter` 16→48, `--grid-gap` 16→32, `--grid-columns 12`; `--container 77.5rem`, `--container-wide 90rem`,
`--container-text 46rem`; `--header-h 4rem`, `--header-h-lg 4.5rem`, `--hit 2.75rem`.

**Forma**: `--radius-0/1/2/3` (0/2/4/8px — teto 8), `--border-hair 1px`, `--border-accent 2px`,
`--shadow-raise`, `--shadow-overlay`.

**Movimento**: `--dur-fast 160` / `--dur-base 240` / `--dur-slow 400` / `--dur-reveal 700` /
`--dur-hero 1200` ms, `--stagger 80ms`, `--reveal-distance 16px`; `--ease-standard/out/in-out/exit`;
`--transition-move` (transform+opacity, slow) e `--transition-state` (cor/fundo/borda/opacidade, fast).
`@media (prefers-reduced-motion: reduce)` leva durações a 1ms (não 0, para `transitionend` disparar)
e `--reveal-distance` a 0.

**Camadas**: `--z-below/base/raised/sticky/float 999/header 1000/menu 1001/drawer 1101/modal/toast`.

**Lacunas para as seções novas** (propor em `home.css` como custom properties locais, não em tokens.css
sem decisão):
- Não há token de **proporção de mídia** (`aspect-ratio`): a home usa literais 16/10, 4/5, 1, 16/9.
  Sugestão: `--ratio-panel: 4 / 5; --ratio-wide: 16 / 10; --ratio-video: 16 / 9` no escopo da seção.
- Não há **cor de nó/linha para mapa** além do ouro e `--text-3`. A rede usa `[154,152,147]`,
  `[191,189,185]`, `[245,243,240]` literais em JS = `--text-3/2/1`; expor `--text-1-rgb/-2-rgb/-3-rgb`
  (triplets) evitaria duplicar valores entre CSS e canvas.
- Não há **superfície para painel fotográfico/placeholder procedural** (degradê sutil permitido só como
  textura de mídia, nunca em texto). Usar `--surface-1`→`--surface-3` + ruído SVG inline em `home.css`.
- `--container-wide` (1440) existe mas não é usado: candidato para os painéis das Verticais (05) e o
  mapa (06), mantendo o texto em `--container`.
- Breakpoints não são tokens (CSS não permite var em `@media`); valores canônicos: 374, 640, 767/768,
  1024, 1200, 1440, 1920. Manter esses e não inventar 900/1100.
- Fontes ainda vêm do Google Fonts (preload + `media=print onload`); o self-host em `assets/fonts/`
  (DESIGN-SYSTEM §3) continua pendente — não é bloqueio, mas é a única origem externa no caminho crítico.

---

## 3. Contratos que NÃO podem quebrar

### navbar.js (template injetado em `<dmc-navbar>`, l. 123-181)
- Links gerados: `#hero` (marca, só na home), `#features` ("Ver os seis eixos na página inicial" no
  rodapé do mega-menu), `#treinamentos` (item "Treinamentos" no menu desktop e na gaveta; além do
  navbar, a âncora está **hardcoded no rodapé estático de 27 páginas internas** como
  `../#treinamentos` / `../../#treinamentos` e no rodapé da home, l. 1126 — total 29 arquivos HTML), `#contact`
  (CTA "Converse com nossos especialistas", desktop e gaveta), `pages/sobre.html`,
  `plataforma-ead/login.html`, `https://adtech-app.complexodmc.com.br`.
- `isHome` = `location.pathname === root || root + 'index.html'`; `data-root="./"` no `<html>` da home
  é a fonte da raiz. Página nova fora de `/pages/` ou `/solucoes/` precisa declarar `data-root`.
- Fallback sem JS dentro de `<dmc-navbar>` (index 121-131): `a.dmc-nav__toggle[href="#rodape"]` →
  o rodapé precisa continuar com `id="rodape"`.
- `skipTarget`: usa `#conteudo` se existir (hoje `<main id="conteudo">`, l. 133).
- `data-over` no `<dmc-navbar>` = barra transparente até 24px de rolagem (classe `is-scrolled`).
- Testes: `navegacao.spec.js` exige `dmc-navbar header#navbar`, 6 links no mega-menu com destino 200,
  2 links em `.dmc-drawer__group`, 6 em `#dmc-drawer-eixos`, Ad-tech → `adtech-app…`.
- **Se a seção 08 virar "Metodologia" e perder `id="treinamentos"`**, o item "Treinamentos" do navbar
  aponta para âncora morta em 29 páginas (navbar.js + 28 rodapés estáticos). Opções: manter
  `id="treinamentos"` na seção nova (menos honesto se não houver cursos) ou alterar `template()` em
  navbar.js (rótulo + hash), subir `?v=` **e** editar os 28 rodapés (sed seguro: a string é idêntica).
  Decisão a registrar em DECISIONS.md, não resolver sozinho.

### main.js
- **Herói** (17-55): `#hero`, `.hero__video`, `.hero__poster img`; classes `is-broken`, `is-playing`;
  IO threshold .05 pausa/retoma o vídeo. (Hero não será tocado, mas o id `#hero` é alvo da marca.)
- **Assunto do form** (61-70): `#cf-eixo` (`<select name="eixo">` com `<option value="E1…E6">`);
  qualquer `[data-assunto="EN"]` clicado pré-seleciona; `?assunto=EN` na URL também — **24 arquivos**
  internos linkam `../?assunto=EN#contact`. Manter o select com esses values e o id.
- **Voltar ao topo** (75-97): `#scrollToTop` + classe `.visible` a partir de 500px; foca `.dmc-brand`.
- **Formulário** (106-223): `form#contactForm[action="/api/contato"]`, `#formMessage.form-message`
  (classes `is-enviando/is-sucesso/is-erro`), campos `cf-nome, cf-email, cf-telefone, cf-empresa,
  cf-perfil, cf-eixo, cf-mensagem, cf-website (honeypot .form-hp), cf-consentimento`, `input[name=origem]`,
  `data-origem`, `.form-field`/`.form-consent` (onde o `<p class="form-field__error" id="cf-x-erro">`
  é anexado). Sucesso só com `{ok:true}` 2xx. `formulario.spec.js` espera exatamente esses ids inválidos.
- **Revelação** (229-244): `.dmc-reveal` → `.is-in`.
- **Painel dos eixos** `initEixos` (257-374): `#features`, `.np-axes a[data-eixo]` (vira `role=tab`,
  `id="aba-eixo-N"`, `aria-controls="eixo-N"`), `.np-flag[data-eixo]` (vira `role=tabpanel`,
  `aria-labelledby`), `#npGrid .np-card[data-eixo]`, `.np-spot` + `.np-spot-ico/-name/-desc/-link`,
  `data-np-spot="fixo"`, classe `np-js` na seção, `is-entering`, `--i` nos cards, `history.replaceState('#eixo-N')`,
  `hashchange`. Estado inicial E1 ou `#eixo-N` da URL; `lista.scrollIntoView` quando vem por hash.
- **Busca** `initBusca` (383-488): `#npAskForm`, `#npAsk`, `#npAskStatus`, `.np-ask-empty`, `.np-ask-clear`,
  `.np-ask-wa`, `.np-cases li .np-case[data-busca]`, `.np-card[data-busca]`, classe `np-busca` na seção.
  Se `#npAskForm` sumir, `initBusca` retorna cedo sem erro (guarda em 392).
- `home.spec.js` fixa: 1 `[role=tablist]` em `#features` com `aria-label`, **6 tabs** `#aba-eixo-N`
  com `aria-controls="eixo-N"`, 6 `#eixo-N[role=tabpanel][aria-labelledby=aba-eixo-N]`, tabindex
  `[0,-1,-1,-1,-1,-1]`, setas/Home/End circulares, clique muda `location.hash`, `/#eixo-N` abre direto
  e leva a tablist à viewport, `hashchange` sem recarregar.
  **O brief da seção 03 (grid 3×2 estático sem abas) invalida este spec inteiro**: ou a seção nova
  mantém uma tablist (pode ser a própria grade com `role=tablist`?) ou `home.spec.js` é reescrito
  junto. As âncoras `#eixo-1..6` devem continuar existindo (2 arquivos externos + mega-menu antigo
  + regra do BRIEF).

### rede-neural.js (módulo)
- `[data-rede="casa"]` (a `<div class="casa__rede">`, index 196) recebe um `<canvas>`; classes `is-live`
  (esconde `.casa__fallback`), `is-pointer`. `controlador()` lê `.casa__eixos [data-hub]` (+`data-curto`),
  `.casa__tab[aria-selected]`, `.casa__foco-item` (`is-active`), e marca `is-hover` no `li`.
  Lê `--np-accent` computado de cada `li` e `--color-gold-rgb` do `:root`.
- `.np-flag[data-eixo] .np-spot-stage` recebe `svg.np-net` estático + classe `has-net` (dispara 600px
  antes de `#features`).
- `movimento.spec.js` exige: com `prefers-reduced-motion: reduce`, `#conheca canvas` não muda entre dois
  `toDataURL()` (ou não existe). Fora desse spec, **nenhum HTML/JS linka `#conheca`** (só comentários
  em index 185 e rede-neural 4): manter o id custa nada e preserva o teste; a sticky `.casa__rede` só
  vale ≥1024.

### video.js
- `.page-video__frame[data-video]` (+ `data-video-title`); cria `.page-video__cover`, `.page-video__play`,
  `<iframe>`. Sem ID, não toca no DOM. `#video` é referenciado só pela home (CSS de escopo).

### Outros
- `<main id="conteudo">` único, **1 só `<h1>`** (a11y.spec), `canonical` = sitemap, 1 JSON-LD válido
  (seo.spec), `overflow-x: clip` no body + 0 overflow em 7 larguras (viewports.spec).
- `.whatsapp-float` e `#scrollToTop.scroll-to-top` fora do `<main>` (1153-1162).
- Rodapé `footer.dmc-footer#rodape` com `nav[aria-labelledby=rodape-eixos]` (6 links com `np-pillar-*`),
  `rodape-casa`, contato, `.dmc-footer__legal` com a linha dos atos privativos (1147).

---

## 4. Seções atuais — linhas, CSS, JS, veredito

| # | Seção (id / classe) | index.html | styles.css | JS | Pode sair / virar o quê |
|---|---|---|---|---|---|
| 01 | Herói `#hero.hero` | 135-165 | 67-168 + 1190-1192 (reduce esconde vídeo) | main.js 17-55 | **Não mexer** (aprovado). Já cumpre: `<picture>` poster LCP com mobile, `<video>` com `<source media>` + reduced-motion, fade `is-playing`, pausa fora da tela, entrada `dmc-enter` escalonada. |
| 01b | Fatos `.fatos` (sem id) | 167-177 | 170-197 | — | **Removível com segurança** (ninguém linka; só grade de 4 `li`). Conteúdo ("6 eixos", "Parceiros", "Cartórios", "São Paulo") pode migrar para 04 "Por que a DMC". |
| 02 | Sobre `#conheca.dmc-section.casa` | 179-262 | 199-334 | rede-neural.js `controlador()`+`casa()` (41-562) | **Transformar, não apagar**: vira "A Casa". Manter `id="conheca"` (movimento.spec, sobre.html) e `[data-rede="casa"]`. O tablist `.casa__eixos` + `.casa__foco` é opcional — se a casa deixar de listar eixos (eles vão para 03), `controlador()` retorna `null` e `casa(fig, null)` segue funcionando (sem rótulos de nome: `NOME` fica vazio, só "E1…E6"). Atenção: labels desenhados no canvas dependem de `data-curto` dos `li`. |
| 03 | Soluções `#features.np-section` | 264-872 | 336-694 | main.js `initEixos`/`initBusca`; rede-neural `stages()` | Subdividido abaixo. |
| 03a | `.np-cases-band.dmc-on-paper` (situações + busca `#npAskForm`) | 284-362 | 341-449 | main.js 383-488 | **Removível** (brief não a prevê). Guarda em `initBusca` evita erro. Se sair, apagar `initBusca` e o CSS 341-449 (~110 l.). As 6 "falas do cliente" são copy boa para reaproveitar em 04/05. |
| 03b | `.np-eixos` → `.np-axes` (abas) | 364-410 | 451-500 | `initEixos` | **Transformar**: a grade 3×2 pode ser a própria `ul.np-axes` reestilizada (6 `li.np-pillar-*` já com código, nome, contagem). Para manter `home.spec.js`, continuar `role=tablist` ligado aos `#eixo-N`; para o grid estático do brief, reescrever o spec. |
| 03c | `.np-flags` → 6 `article.np-flag#eixo-N` (título, desc, 3 diferenciais, 2 CTAs, `aside.np-spot` com `.np-spot-stage` + destaque) | 412-584 | 502-633 | `initEixos`, `sortearDestaque`, rede-neural `stages()` | **Transformar**: os `#eixo-N` precisam existir (âncoras externas). Podem virar as 6 células do grid (ícone, nome, descrição curta, CTA "Explorar soluções" → `href` do painel atual: E1 planejamento-sucessorio, E2 planejamento-tributario, E3 consultoria-imobiliaria, E4 contabilidade, E5 recuperacao-ativos, E6 ciclo-fechado — os mesmos de `EIXOS` em navbar.js 41-54). O `data-assunto="EN"` nos CTAs secundários é o gancho do form; manter se o CTA for `#contact`. `.np-spot-ico` tem 6 SVGs de ícone já vetoriais (24×24, traço 1.7) reaproveitáveis como "ícone exclusivo por eixo" (e os `data-icone` dos 21 cards dão mais 21). |
| 03d | `#npGrid.np-grid` → 21 `a.np-card` | 586-852 | 635-680 | `initEixos` (hide/show), `initBusca`, `sortearDestaque` lê `.np-ico/.np-ct/.np-cd` | **Removível da home** (brief: CTA leva à página interna). É o único catálogo hardcoded completo (BRIEF: "catálogo dos eixos hardcoded em index.html") — antes de apagar, salvar a lista (href, data-icone, data-busca, título, descrição, tags) em `docs/dmc/home-redesign/catalogo-cards.json` para o mega-menu/footers/sobre não perderem a referência. `#npGrid` é alvo de `href="#npGrid"` nos 6 "Ver as N soluções do eixo" (429 etc.). |
| 03e | `.np-closer` (faixa WhatsApp) | 854-870 | 682-694 | — | **Removível**; CTA final (10) já existe. |
| 08 | Treinamentos `#treinamentos.dmc-section.dmc-on-paper.treinos` | 874-922 | 696-727 | — | **Conteúdo inválido** (6 cursos sem lastro no catálogo EAD; o real é "Arquitetura Patrimonial Estratégica", 42 h, online — `plataforma-ead/js/data.js:24-27`). Transformar em "Metodologia" + menção ao programa real. **Id é contrato do navbar** (ver §3). CSS `.treinos__lista/.treino*` reaproveitável como lista numerada em papel. |
| 09 | Ad-tech `#results.dmc-section.adtech` | 924-972 | 729-788 | — | **Removível com segurança**: `#results` não é linkado por ninguém (0 arquivos fora do index). Ad-tech vira item de 04 com link `pages/tecnologia.html`. Cards "Integrações sob avaliação / Fluxo Integrado / Painel do Caso" são pendência do CEO — não reescrever. |
| 07 | Vídeo `#video.dmc-section.dmc-section--rule.page-section` | 974-997 | 791-976 | video.js | **Manter** (regra: toda página termina com o vídeo antes do contato). Posição: entre 09 Newsletter e 10 CTA, ou imediatamente antes de `#contact` — hoje é o penúltimo bloco, manter. |
| 10 | Contato `#contact.dmc-section.dmc-on-paper.contato` | 999-1093 | 978-1142 | main.js 106-223 | **Manter intacto** (form + ids + `#formMessage`). Falta o link da política no rótulo de `#cf-consentimento` (PROGRESS.md l. 72). |
| — | Rodapé `footer.dmc-footer#rodape` | 1096-1151 | components 508-586 | navbar fallback → `#rodape` | **Manter**. Lista "Sobre" (1123-1131) linka `#features` (1125) e `#treinamentos` (1126) — ajustar junto com a decisão do id. |
| — | Flutuantes | 1153-1162 | 1144-1186 | main.js 75-97 | Manter. |

Seções **novas** sem nada hoje: 04 Por que a DMC, 05 Verticais, 06 Presença Nacional, 09 Newsletter.
Newsletter precisa de endpoint (`/api/...` em `server/` — fora do escopo frontend; prever o mesmo
padrão de `#contactForm`: `aria-busy`, `role=status`, sucesso só com `{ok:true}`, honeypot, consentimento).

Peso do que sai: HTML 03a+03d+03e+09 ≈ 300 linhas; CSS ≈ 341-449, 635-694, 729-788 ≈ 280 linhas;
JS `initBusca` ≈ 105 linhas + `sortearDestaque` 15.

---

## 5. Organização do CSS novo e remoção de CSS morto

**Proposta de arquivos**
1. `tokens.css` e `components.css` **não mudam** (compartilhados com 26 internas; qualquer edição
   exige regressão em todas).
2. `styles.css` continua sendo "a home" — mas hoje mistura base (17-65), herói, e seções que vão
   morrer. Duas opções:
   - **A (recomendada)**: criar `assets/css/home.css?v=1` carregado **depois** de `styles.css`, com as
     seções novas (02 casa redesenhada, 03 grid, 04, 05, 06, 08, 09) em blocos com prefixo por seção
     (`.casa-*`, `.eixos-*`, `.porque-*`, `.verticais-*`, `.brasil-*`, `.metodo-*`, `.news-*`), e
     enxugar `styles.css` para: base + herói + `.page-video__*` + `#video` + contato + flutuantes +
     reduce. Ao final da migração, fundir os dois ou manter `home.css` como "seções" e `styles.css`
     como "base + herói + contato". Vantagem: o herói aprovado fica fisicamente intocado, diff
     legível, `?v=` independente.
   - **B**: editar `styles.css` in-place. Menos arquivos, mas diff enorme num arquivo que o CEO já
     aprovou visualmente.
3. Convenções dentro de `home.css`: um cabeçalho por seção com `/* ==== 0N · NOME ==== */`, mobile
   primeiro, breakpoints só em 640/768/1024/1440, nenhum literal de cor (só tokens; `--np-accent` para
   eixo), nenhum `transition: all`, `will-change` só em elementos que animam continuamente (canvas do
   mapa; nunca em texto). Custom properties locais da seção declaradas no seletor raiz da seção
   (`.brasil { --ratio-mapa: 1; }`).
4. **Página de referência de componentes**: `docs/dmc/design-preview.html` já existe; adicionar lá
   amostras do grid 3×2, do painel de vertical e do mapa antes de levar ao index.

**Como remover CSS morto com segurança**
1. Antes de cortar HTML, listar seletores de `styles.css` e procurar cada classe no `index.html` novo:
   `grep -o '^\.[a-zA-Z0-9_-]*' styles.css | sort -u | while read c; do grep -q "${c#.}" index.html || echo "$c"; done`
   (atenção a classes criadas por JS: `is-playing`, `is-broken`, `is-in`, `is-entering`, `np-js`,
   `np-busca`, `has-net`, `is-live`, `is-pointer`, `is-hover`, `is-active`, `visible`, `page-video__cover`,
   `page-video__play`, `form-field__error`, `is-enviando/sucesso/erro` — não aparecem no HTML).
2. Cortar por bloco inteiro (os blocos de `styles.css` são contíguos e comentados), nunca regra a regra.
3. Chrome DevTools → Coverage em 390 e 1440 após rolar a página inteira: confirmar 0 regras não usadas
   fora de estados (`:hover`, `[hidden]`).
4. Subir `?v=` de `styles.css` (c4 → c5) e de `home.css`; Lighthouse não penaliza CSS morto além de
   bytes, mas 49 KB → alvo ≤ 35 KB para `styles.css + home.css` somados.
5. Rodar `npx playwright test` inteiro (454 testes); os specs quebram cedo se algum id sumir.

**JS**: mesma lógica — `main.js` perde `initBusca` e `sortearDestaque`; `rede-neural.js` perde
`stageNet/stages` se `.np-spot-stage` sair; novo módulo `assets/js/brasil.js` (ou função nova em
`rede-neural.js`) para o mapa. Manter `type=module` para o canvas e `defer` para o resto.

---

## 6. Como a rede neural é desenhada e como virar o mapa do Brasil

**Hoje (`rede-neural.js`, Canvas 2D, zero dependências, 621 l.)**
- Inicia por `whenNear(fig, fn, '300px 0px')` (IO) — nunca no caminho do LCP; `#features` recebe os
  SVGs estáticos a 600px.
- `casa(fig, ctrl)`: cria `<canvas>` dentro de `[data-rede="casa"]`; `size()` lê `clientWidth/Height`,
  DPR ≤ 2 (≤ 1.5 em <768), raio do anel por tamanho; `build()` com `rng(7)` determinístico: 1 centro,
  6 hubs no hexágono, 4–6 satélites por hub, 5–12 nós livres, arestas `spine/leaf/mesh`.
- `loop(t)`: `requestAnimationFrame` só com `running` (IO `threshold:0` + `visibilitychange`); em
  `lite` (<768) limita a ~30 fps (`t - lastFrame < 32`); paralaxe de cursor `ptr` com lerp .06 e
  deslocamento `0.035 * z` por profundidade; pulsos nascem em `spawn()` (máx 7/4, intervalo 700/1200 ms)
  e percorrem uma aresta em 1.4–2.3 s com fade senoidal; glows por hub com lerp .1; avanço automático
  do eixo a cada 5 s até a primeira interação.
- `draw(t, settle)`: `setTransform(dpr)`, `clearRect`, anel externo + arco cônico lento, arestas
  (alpha base + glow + proximidade do cursor), pulsos, nós, hubs com halo radial, rótulos
  `fillText` em Hanken (só "E1" em lite), centro "DMC".
- **Reduced-motion**: `start()` chama `still()` = `draw(0, true)` um quadro, redesenha só em interação
  (`ctrl.on`, pointer). `reduce.addEventListener('change')` alterna ao vivo. É o que `movimento.spec`
  mede.
- **Sem JS / sem canvas**: `svg.casa__fallback` do HTML permanece; com canvas, `is-live` apaga o SVG
  por opacidade (`styles` 308-311).
- Cores: `--color-gold-rgb` e `--np-accent` lidos por `getComputedStyle` (triplets), texto em literais
  (ver lacuna §2).
- Acessibilidade: `aria-hidden` no `fig`; a interação semântica fica na `.casa__eixos` (tablist real),
  o canvas só espelha (`ctrl.select/setHover`). Esse desacoplamento é o padrão a repetir.

**Reaproveitar para 06 "Presença Nacional" (mapa + nós + pulsos + paralaxe)**
- Dados prontos: `docs/dmc/home-redesign/geo/brasil.json` (`viewBox 0 0 1000 1000`, 27 `estados[]`
  com `sigla/nome/regiao/d` já simplificados Douglas-Peucker 1.4px, `nos_capitais{}` com 27 pares
  `[x,y]`, SP em `[650.1, 719.3]`) e `brasil-estados.svg` (27 `path#uf-XX` em `g#estados`
  `fill #1a1c1f stroke #fff .12` + `g#capitais` com 27 `circle#no-XX`, SP `r=5`, demais `r=2.5`).
  27 KB cada — o SVG inline no HTML custa ~27 KB; preferir `<img src=…svg>` ou `<use>` externo, ou
  simplificar mais (DP 2–2.5 px para ~12 KB).
- **Fallback estático = o SVG** (`brasil-estados.svg` com classes `np-pillar-*` nos nós se quiser cor
  por eixo), exatamente como `.casa__fallback`: fica no HTML, o canvas entra por cima com `is-live`.
  Mobile (<768): o brief pede fallback estático → `lite` pode simplesmente **não criar o canvas** e
  deixar o SVG (economiza CPU e bateria; Lighthouse mobile não vê o canvas).
- **Canvas por cima**: nova função `brasil(fig)` no mesmo módulo (ou `assets/js/brasil.js` que importa
  `rng/triplet/rgba/whenNear` — hoje não exportados; exportar com `export` sem quebrar o auto-init).
  Reaproveitar `size()` (DPR cap), `place()` (paralaxe `ptr.x * 0.035 * z` — mapa `z` baixo, nós
  `z` alto, para o mapa quase parado e os nós flutuando), `spawn/pulses` (arestas = SP → cada capital,
  `back:false` sempre: o pulso "sai de São Paulo"), `loop/start/stop` (IO + visibility + reduce) sem
  alteração.
- Desenho: fundo dos estados **não** no canvas — deixar o SVG abaixo (ou `Path2D` de cada `d`
  escalado `S/1000`, custa 27 `fill` por quadro — aceitável em desktop, desnecessário se o SVG já
  está lá). No canvas só: arestas SP→capitais (quadráticas com leve curvatura para não cruzar reto
  o mapa), nós (SP r 5 ouro + halo; capitais r 2.5 `--text-3`), pulsos ouro, e rótulo "SP" ou
  "São Paulo" em Hanken 11–12px. Nada de números de cobertura (brief); nós = capitais, não "clientes".
- Interação: `pointermove` só para paralaxe e um leve realce da aresta mais próxima (reusar o bloco
  `if (ptr.on)` de `draw`); sem `click`. Teclado/leitor: o mapa é `aria-hidden`; o texto (35%) carrega
  o significado — título "De São Paulo, conectados aos desafios do Brasil".
- Layout: 35/65 → `grid-column: 1 / span 4` texto, `6 / span 7` mapa em ≥1024 (padrão `.casa__grid`
  5/6 invertido); `aspect-ratio: 1` na figura (viewBox quadrado); `max-width` 34–40rem como `.casa__rede`.
- `prefers-reduced-motion`: `still()` um quadro (nós + arestas, sem pulsos) — mesmo contrato do
  `movimento.spec` (dois `toDataURL` iguais).
- Pendência do CEO: "atendimento fora de SP não confirmado" — o mapa deve falar de **conexão/alcance
  dos desafios**, não de "atuação em 27 estados". Não desenhar legenda de cobertura.

---

## 7. Regras de movimento vigentes e orçamento de performance

**Movimento (tokens + DESIGN-SYSTEM §5, já aplicado em toda a home)**
- Só `transform`/`opacity` deslocam; cor de estado pode transitar (`--transition-state`). Nunca
  `all`, `box-shadow`, `width`, `top/left`, `height`. (Exceção legada: o bloco triplicado
  `.page-video__*` 814/877/909 transita `box-shadow` — a home anula no escopo `#video`.)
- Durações: 160 (estado) / 240 (micro: seta, chevron) / 400 (fio de acento, troca de foco) /
  700 (reveal, troca de painel, fade do vídeo) / 1200 ms (entrada do herói); stagger 80 ms
  (`.np-flag-body` 80 ms após a mídia; cards `--i * 40ms`; herói `nth-child × 80ms`).
- Revelação: 16 px + fade, uma vez, só com `html.dmc-js`, nunca em conteúdo crítico; IO
  `threshold .12`, `rootMargin -40px`.
- Hover: seta `translateX(4px)` 240 ms; fio `scaleX(0→1)` 400 ms `--ease-out`.
- Reduced-motion: durações 1 ms, distância 0, vídeo do herói `display:none`, canvas estático,
  `scroll-behavior: auto`. Toda animação nova deve ler os tokens (herda o colapso automaticamente).
- `will-change`: hoje **zero ocorrências** em styles/components. Manter assim; só o `<canvas>` do mapa
  justificaria `will-change: transform` se houver paralaxe via CSS (não há — paralaxe é no desenho).
- Canvas: rAF só na viewport e aba ativa; ≤ 30 fps em <768; DPR ≤ 1.5/2; nunca sobre texto.

**Orçamento de performance (não regredir)**
- Baseline medida (`qa/2026-10-17-final/lighthouse/resumo.json`, Lighthouse 13.5, mobile simulado,
  mediana de 3): **Performance 99 / A11y 100 / BP 100 / SEO 100; FCP 1,20 s; LCP 1,80 s; CLS 0,003;
  TBT 0 ms; SI 1,20 s; peso total 1193 KB**. Metas do gate (`tests/lighthouse.mjs:27`): Perf ≥ 90,
  A11y/BP/SEO ≥ 95. Alvo do redesign: manter ≥ 95 Perf, LCP ≤ 1,8 s, CLS ≤ 0,01, TBT 0.
- O LCP é o `<picture>` do herói (`hero-dmc-poster.webp` 70 KB / mobile 40 KB, `fetchpriority=high`,
  `width/height`). **Nada novo pode entrar antes dele**: sem CSS/JS extra bloqueante no `<head>`,
  sem fonte adicional, sem SVG inline grande acima do herói. `home.css` extra ≤ 15 KB gzip é aceitável
  (CSS é render-blocking: 1 arquivo a mais = 1 request a mais no caminho crítico — alternativa: fundir
  em `styles.css` na publicação).
- Peso hoje: HTML ~104 KB (21 cards + 6 painéis + 6 casos + SVGs inline); vídeo desktop 2,8 MB mp4 /
  2,25 MB webm (`preload=metadata`, só ≥768), mobile 1,0 MB. Imagens novas (verticais 05,
  placeholders procedurais): WebP/AVIF, `loading="lazy"`, `decoding="async"`, `width/height` sempre,
  `<picture>` com variante mobile; alvo ≤ 120 KB por painel desktop, ≤ 60 KB mobile; total da página
  ≤ 1,5 MB sem o vídeo.
- JS: tudo `defer`/`module`; `rede-neural.js` só inicia via IO. O mapa segue o mesmo padrão
  (`whenNear`, `'300px 0px'`). Zero libs — se Three.js entrasse (`assets/js/vendor/three.<ver>.min.js`
  local, ~150 KB gzip) teria de ser `import()` dinâmico só em ≥1024 e só perto da viewport; Canvas 2D
  já cobre o brief do mapa sem custo.
- CLS: fontes com `display=swap` + preload; qualquer bloco novo com mídia precisa de `aspect-ratio`
  ou `width/height` reservados; a troca de painel por `hidden` (não por altura) foi o que zerou CLS.
  Em internas a troca tardia de fonte re-quebrou H1 (CLS 0,12–0,17) — para a home, `text-wrap: balance`
  nos H2 e `max-width` em `ch` já mitigam; evitar títulos longos de 2 linhas que viram 3 ao trocar
  a fonte.
- CPU em mobile: histórico de 63% de main thread com chromakey (PROGRESS l. 56) — por isso o mapa deve
  **não animar** em <768 (SVG estático) e o `casa()` já roda a 30 fps.
- Testes a rodar após cada etapa: `npx playwright test --grep "home|a11y|viewports|console|seo|formulario|movimento"`
  e `node tests/lighthouse.mjs` (3 execuções, mediana). Capturas em `docs/dmc/qa/<data>-home-v2/`.
