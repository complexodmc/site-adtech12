# Nova home — Especificação B · "cinematic-first"

Diretor de arte B · 2026-10-17 · direção C (Híbrido Executivo), não reaberta.
Insumos: `fatos.md`, `inventario-frontend.md`, `referencia-e-mensagens.md`, `contratos-qa.md`,
`blueprint-newsletter.md`, `DESIGN-SYSTEM.md`, capturas `qa/2026-10-17/home/*.png`.
Nada aqui toca `complexodmc.com.br/`; é o que o `frontend-motion` e o `video-3d-producer`
constroem sem perguntar. `[CEO]` = pendência registrada em `fatos.md §8`, não resolvida aqui.

## 0. Tese visual e as cinco decisões

A home atual é um **catálogo em três camadas** (casa com 6 abas → painel com 6 abas → 21 cards).
A versão B troca catálogo por **sequência cinematográfica**: a profundidade vem da mídia
(painéis grandes, véus de leitura, um único protagonista em movimento), e o texto fica curto,
numerado e sempre sobre superfície sólida. Ritmo claro/escuro em pares, como atos de um filme:

| # | Seção | id | Fundo | Ato |
|---|---|---|---|---|
| 01 | Hero | `hero` | escuro (vídeo) | mantido |
| 02 | A Casa | `conheca` | escuro `--surface-0` | abertura: quem fala |
| 03 | Seis Eixos | `features` | **papel** | leitura |
| 04 | Por que | `porque` | mosaico `--surface-1` + papel | leitura |
| 05 | Verticais | `verticais` | escuro, painéis full-bleed | **clímax visual 1** |
| 06 | Presença | `presenca` | escuro `--surface-0` | **clímax visual 2** (mapa + rede) |
| 07 | Inteligência | `publicacoes` | papel | respiro |
| 08 | Como conduzimos | `treinamentos` | escuro `--surface-1` | método |
| 09 | Newsletter | `newsletter` | papel | captura leve |
| 10 | Vídeo + Contato + rodapé | `video` · `contact` · `rodape` | escuro / papel / `--surface-1` | mantidos |

**Decisão 1 — Um só protagonista em movimento.** A rede neural sai da Casa (hoje duplicada
com o painel) e vira o mapa da seção 06, único canvas da página. Em 02 entra o rinoceronte
(`rino-alpha-gold.webm/.mov`, ativo próprio já usado nas internas) sobre fundo procedural.
**Decisão 2 — Eixos como atlas, não como abas.** `#features` vira grade 3×2 estática em
papel; a tablist morre, o `home.spec.js` é reescrito (contratos-qa §2.2). Os 21 links do
catálogo sobrevivem num `<details>` tipográfico abaixo da grade.
**Decisão 3 — Verticais em pilha cinematográfica.** Cinco painéis 21:9 full-bleed que se
empilham com `position: sticky` (CSS puro, zero JS, só `transform/opacity` no hover). Texto
sempre sobre véu ≥ .80, CTA visível sem hover.
**Decisão 4 — Mapa com profundidade real, sem WebGL.** SVG inline (fallback e mobile) +
Canvas 2D por cima, com três planos de paralaxe (`z` 0,2 / 0,6 / 1) e inclinação estática
`rotateX(6deg)` via `perspective` — lê como 3D, custa como 2D, mede como `movimento.spec`.
**Decisão 5 — Texto nunca sobre imagem sem véu sólido**, nunca ouro como texto sobre papel
(`--np-accent-deep`/`--color-gold-deep`), nenhuma cor literal fora dos tokens.

---

## 1. Infra comum a todas as seções

**Arquivos.** `assets/css/home.css?v=1` carregado depois de `styles.css` (opção A do
inventário). `styles.css` fica com base + herói + `.page-video__*` + `#video` + contato +
flutuantes + reduce (ver §13). Zero mudanças em `tokens.css`/`components.css`.

**Custom properties locais** (declaradas no seletor raiz de cada seção, não em `:root`):
```css
.home { --ratio-panel: 4 / 5; --ratio-wide: 21 / 9; --ratio-still: 16 / 10; --ratio-video: 16 / 9;
        --veil-80: rgba(11,12,14,.82); --veil-0: rgba(11,12,14,0); }
```
(`.home` no `<main id="conteudo" class="home">`.)

**Grade.** `.dmc-wrap` (1240) para texto; `.dmc-wrap--wide` nova = `max-width: var(--container-wide)`
(1440) para mídia das seções 05 e 06. Colunas 4 / 8 / 12 (DESIGN-SYSTEM §4); `gap: var(--grid-gap)`.

**Cabeçalho de seção.** Sempre `.dmc-sec-head` → `p.dmc-overline` + `h2.dmc-h1` (com `<em>`)
+ `p.dmc-lead`. Numeração do ato no overline: `02 · A casa`, `03 · Seis eixos`… (Hanken 12,
caixa-alta, `--font-numeric`). Isso é o único "número" decorativo permitido.

**Revelação.** `.dmc-reveal` (já existe) em blocos abaixo da dobra; stagger por `--i` × 80 ms,
máximo 6 itens por grupo; nunca em `<h2>`.

**Transição entre seções.** Sem degradê entre fundos: corte seco (escuro→papel) ou fio
`.dmc-section--rule` (escuro→escuro). Exceção única: 05→06, onde o último painel sticky
termina e o mapa começa sobre o mesmo `--surface-0` com fio.

**Breakpoints usados**: 640, 768, 1024, 1440 (nenhum outro). Medidas abaixo em 1440 / 1024 /
768 / 390; 320 e 375 herdam 390; 1920 = container centrado.

---

## 2. Seção 02 · A Casa (`#conheca`)

**Objetivo.** Dizer em uma frase quem fala (consultoria em negócios, São Paulo, seis eixos sob
uma governança) e dar à marca um momento de presença física antes do catálogo.

**Fundo.** `--surface-0`. Entra do herói por corte; sai para 03 (papel) por corte.

**Layout.**
| | 1440 | 1024 | 768 | 390 |
|---|---|---|---|---|
| grid | 12 col; texto `1 / span 5`, mídia `7 / span 6` | texto `1 / span 5`, mídia `6 / span 7` | 8 col; texto `1 / -1` acima, mídia `1 / -1` abaixo | 1 col |
| mídia | `aspect-ratio: var(--ratio-panel)` (4:5), altura máx 680 | 4:5, máx 560 | 16:10, largura total | 16:10 |
| padding | `--space-section` | idem | idem | idem |
| alinhamento | texto centrado verticalmente na mídia (`align-self:center`) | idem | — | — |

**Componentes.**
- Reutilizados: `.dmc-sec-head`, `.dmc-overline`, `.dmc-h1`, `.dmc-lead`, `.dmc-btn--secondary`.
- Novos: `.casa` (raiz), `.casa__grid`, `.casa__text`, `.casa__panel` (figura),
  `.casa__backdrop` (`<picture>` procedural), `.casa__rino` (`<video>`), `.casa__legend`.
- **Sai**: `.casa__nav`, `.casa__eixos` (tablist), `.casa__foco*`, `.casa__acoes`,
  `.casa__rede[data-rede]`, `svg.casa__fallback`. `controlador()`/`casa()` de `rede-neural.js`
  morrem com eles.

**Conteúdo.** Overline `02 · A casa`. H2 (mantido) "Decisões complexas pedem *visão integrada*."
Lead: a mensagem aprovada pelo CEO (fatos §3) + "Consultoria em negócios, em São Paulo".
Um só CTA: `dmc-btn--secondary` "Sobre o Complexo DMC" → `pages/sobre.html`. O botão de
contato duplicado sai (está no hero e na navbar). Sem afirmação de equipe/estrutura `[CEO 8]`.

**Estrutura.**
```html
<section class="dmc-section casa" id="conheca" aria-labelledby="casa-title">
  <div class="dmc-wrap casa__grid">
    <div class="casa__text dmc-sec-head">…</div>
    <figure class="casa__panel" aria-hidden="true">
      <picture class="casa__backdrop">…avif/webp 4:5 e 16:10…</picture>
      <video class="casa__rino" muted loop playsinline preload="none" poster="assets/images/rino-alpha-poster.webp" width="480" height="480" tabindex="-1" disablepictureinpicture>
        <source src="…rino-alpha-gold.mov" type='video/mp4; codecs="hvc1"' media="(prefers-reduced-motion: no-preference)">
        <source src="…rino-alpha-gold.webm" type="video/webm" media="(prefers-reduced-motion: no-preference)">
      </video>
    </figure>
  </div>
</section>
```
Vídeo sem `autoplay` (lição do PROGRESS: 0,8 MB antecipados); `main.js` dá `play()` a 200 px
da viewport e `pause()` fora — mesma função do `solucao.js`, portada como `initRino()`.

**Mídia (video-3d-producer).** `casa-backdrop`: cena procedural "átrio de basalto": plano
inclinado escuro `--surface-1`→`--surface-2` com ruído fino (grain 2 %), uma lâmina de luz
quente vinda do alto-direito (ouro a 12 % de opacidade, falloff longo), sem objetos
reconhecíveis. Render SVG/Canvas no Chromium → 1200×1500 (4:5) e 1600×1000 (16:10), AVIF+WebP,
≤ 90 KB / ≤ 60 KB. O rinoceronte entra por cima, centrado, 62 % da largura do painel.

**Motion.** Rino: só play/pause. Painel: entrada `dmc-enter` 700 ms ao revelar. Reduced-motion:
`<source media>` já exclui o vídeo → fica o poster. Nenhum `will-change`.

**A11y.** `<h2 id="casa-title">`; figura `aria-hidden`; nada interativo na mídia. Contraste:
`--text-1` sobre `--surface-0` 17,7:1.

---

## 3. Seção 03 · Seis Eixos (`#features`) — grade editorial 3×2

**Objetivo.** O visitante reconhece o eixo em cinco segundos: ícone, nome, uma frase, um link.

**Fundo.** `.dmc-on-paper` (`--surface-paper`). Entra de 02 por corte; sai para 04 por corte.

**Layout.**
| | 1440 | 1024 | 768 | 390 |
|---|---|---|---|---|
| grade | 3 col × 2, `gap: 0`, células separadas por fio `--color-line-ink` (grid com `border` nas células, sem caixas) | 3 × 2 | 2 × 3 | 1 × 6 |
| célula | `min-height: 320px`, padding `--space-7` | 300 / `--space-6` | 280 / `--space-6` | auto / `--space-6` vertical, 0 horizontal |
| cabeçalho | `.dmc-sec-head` + à direita (col 9–12) nada — respiro | idem | empilhado | empilhado |

**Componentes.**
- Reutilizados: `.dmc-on-paper`, `.dmc-sec-head`, `.dmc-h3`, `.dmc-btn--link`, padrão "fio de
  acento que cresce" (styles 53-65) movido para `home.css` como `.eixos-cell::before`.
- Novos: `.eixos` (raiz, `id="features"`), `.eixos-grid` (`<ol>`), `.eixos-cell`
  (`<li><article id="eixo-N" class="np-pillar-<slug>" data-eixo="N">`), `.eixos-cell__num`,
  `.eixos-cell__icon` (`<svg>` 32 px), `.eixos-cell__title` (`h3.dmc-h3`), `.eixos-cell__desc`,
  `.eixos-cell__cta` (`a.dmc-btn.dmc-btn--link`), `.eixos-catalogo` (`<details>`),
  `.eixos-catalogo__list`.

**Célula.** Ordem visual: linha 1 `E1` (overline no `--np-accent-deep`, `--font-numeric`) +
ícone 32 px alinhado à direita; linha 2 `h3` nome oficial (Hanken 600, `--fs-h3` travado em
24 px na célula); linha 3 descrição ≤ 160 c (fatos §2, `--text-ink-2`, `--fs-body`); linha 4
CTA "Explorar soluções" → página-âncora de fatos §1 (E4 → `pages/contabilidade.html` `[CEO 10]`).
A célula inteira **não** é link (evita texto-âncora gigante); o `h3` recebe `id="eixo-N-titulo"`,
o `article` `aria-labelledby`. Hover/focus-within: fio superior 2 px no acento `scaleX(0→1)`
400 ms, ícone `translateY(-2px)` 240 ms. Sem sombra, sem fundo.

**Os 21 links do catálogo** (hoje `#npGrid`) ficam em `details.eixos-catalogo` logo abaixo da
grade, fechado por padrão: `summary` "Todas as soluções por eixo" (botão 48 px, fio) → `ul`
em 3 colunas (2 em 768, 1 em 390), cada `li` com overline do eixo e lista de links textuais
(`a` 44 px). Não linkar `planejamento-sucessorio-empresarial` (301). Salvar antes
`catalogo-cards.json` como o inventário pede. `#npGrid` deixa de existir; os `href="#npGrid"`
morrem junto com os painéis.

**"Qual é a sua situação?"** sai desta seção; as sete falas (incluindo E6 nova) migram para o
eyebrow dos painéis da seção 05 (ver §5). A busca `#npAskForm` sai; `initBusca` é removido.

**Ícones — 6 vetores inline exclusivos** (`viewBox 0 0 24 24`, `fill:none`,
`stroke:currentColor`, `stroke-width:1.5`, `stroke-linecap/linejoin: round`; renderizados a
24 ou 32 px; cor = `rgb(var(--np-accent-deep))` em papel, `rgb(var(--np-accent))` em escuro):
1. **E1 Patrimonial — "ramo de transmissão"**: haste vertical de (12,4) a (12,11); dela saem
   duas linhas a (6,18) e (18,18); círculos r 2 em (12,4), (6,18), (18,18); linha-base
   (4,21)→(20,21). Lê-se: um patrimônio, dois herdeiros, uma fundação.
2. **E2 Tributário — "pórtico"**: lintel (4,5)→(20,5); três colunas x = 7, 12, 17 de y 5 a 19;
   base (4,19)→(20,19); leve capitel: traço de 2 px em cada coluna em y 7. Regime, créditos,
   estrutura sob uma só viga.
3. **E3 Notarial/Imobiliário — "lote e matrícula"**: losango isométrico (12,5)-(20,10)-(12,15)-(4,10);
   linha interna (4,10)→(12,15)→(20,10) desenhando a aresta frontal; pino vertical (12,15)→(12,20);
   pequeno círculo r 1.5 em (12,20). Terreno visto de cima, preso ao registro.
4. **E4 Auditoria — "lente sobre o livro"**: círculo r 5.5 em (10,10); cabo (14,14)→(20,20);
   dentro da lente duas linhas (7,9)→(13,9) e (7,11.5)→(11.5,11.5) (linhas do razão). Quem lê
   não é quem escreve.
5. **E5 Recuperação — "retorno ao credor"**: caminho `M4 7 H14 a4.5 4.5 0 0 1 0 9 H8`
   (sai do credor, contorna, volta); ponta de seta em (8,16): (10.5,13.5) e (10.5,18.5);
   círculo r 2 em (4,7) (o título). Do título ao patrimônio e de volta.
6. **E6 Trabalhista — "exercício fechado"**: anel r 8 em (12,12) com abertura de 30° no
   topo-direito (arco de 15° a 345° no sentido horário); ponta de seta fechando a abertura;
   quatro marcas radiais de 2 px em 90°, 180°, 270° (trimestres) — a do 0° é a seta;
   ponto r 1.5 no centro. O ciclo que se fecha no ano.
Sem preenchimento, sem sombra, sem degradê. Entregar como `<symbol id="ico-e1">…` em um
`<svg hidden>` no topo do `<main>` + `<use href="#ico-eN">` (6 usos: grade; o mega-menu pode
adotar depois).

**Estrutura.**
```html
<section class="dmc-section dmc-on-paper eixos" id="features" aria-labelledby="eixos-title">
  <div class="dmc-wrap">
    <div class="dmc-sec-head">
      <p class="dmc-overline">03 · Seis eixos</p>
      <h2 class="dmc-h1" id="eixos-title">Seis eixos, <em>uma só governança</em>.</h2>
      <p class="dmc-lead">Comece pela sua situação, não pelo catálogo.</p>
    </div>
    <ol class="eixos-grid">
      <li><article class="eixos-cell np-pillar-patrimonial" id="eixo-1" data-eixo="1" aria-labelledby="eixo-1-titulo">
        <p class="eixos-cell__num">E1</p>
        <svg class="eixos-cell__icon" aria-hidden="true" focusable="false"><use href="#ico-e1"/></svg>
        <h3 class="dmc-h3 eixos-cell__title" id="eixo-1-titulo">Planejamento Patrimonial e Sucessório</h3>
        <p class="eixos-cell__desc">…</p>
        <a class="dmc-btn dmc-btn--link eixos-cell__cta" href="pages/planejamento-sucessorio.html">Explorar soluções</a>
      </article></li>
      … E2–E6 …
    </ol>
    <details class="eixos-catalogo"><summary>Todas as soluções por eixo</summary><ul class="eixos-catalogo__list">…</ul></details>
  </div>
</section>
```
`#eixo-N` via `:target` recebe `scroll-margin-top: calc(var(--header-h-lg) + 24px)` e o fio
de acento aberto (`scaleX(1)`), sem JS.

**Motion.** Revelação em cascata (`--i` 0–5, 80 ms). Hover descrito acima. Reduced: só fade.

**A11y.** `<ol>` com 6 `li`; títulos `h3` distintos; ícones `aria-hidden`; CTAs com nome
visível igual em todos (o `aria-labelledby` do artigo dá contexto por eixo ao leitor que
navega por regiões; opcionalmente `aria-describedby` no CTA → título). Contraste:
`--np-accent-deep` × papel ≥ 4,6:1 (overline 12 px caixa-alta tem peso 600 → aceitável como
texto pequeno com AA); `--text-ink-2` 7,7:1.

---

## 4. Seção 04 · Por que o Complexo DMC? (`#porque`)

**Objetivo.** Seis razões de método, verificáveis (referência §4), antes das verticais.

**Fundo.** Mosaico: seção em `--surface-1`; metade das células em papel. Entra de 03 por corte,
sai para 05 por corte (o primeiro painel das verticais é escuro).

**Layout.**
| | 1440 | 1024 | 768 | 390 |
|---|---|---|---|---|
| grade | 3 × 2, `gap: 1px` com fundo `--color-line` fazendo o fio; células 1,3,5 papel / 2,4,6 `--surface-2` (xadrez) | 3 × 2 | 2 × 3 (xadrez recalculado: ímpares papel) | 1 × 6, alternando |
| célula | `min-height: 300px`, padding `--space-7`, `display:grid; align-content: space-between` | 280 | 260 | auto |
| cabeçalho | `.dmc-sec-head` à esquerda (col 1–7) | idem | — | — |

**Componentes.** Novos: `.porque`, `.porque-grid` (`<ol>`), `.porque-cell`, `.porque-cell--paper`
(aplica os tokens de `.dmc-on-paper` por herança: a célula recebe a própria classe `dmc-on-paper`),
`.porque-cell__num` (counter `decimal-leading-zero`, Newsreader 300, 40 px, `--color-gold` em
escuro / `--color-gold-deep` em papel), `.porque-cell__title` (`h3.dmc-h4`), `.porque-cell__text`
(`--fs-body`, ≤ 3 linhas em 1440), `.porque-cell__link` (só na célula 6 → `pages/tecnologia.html`,
`dmc-btn--link`).

**Conteúdo.** Os seis itens de referência §4, na ordem. Sem número institucional. Célula 6 é a
única com link; Ad-tech features vedadas `[CEO 4]` não aparecem.

**Motion.** Revelação em cascata; numeral entra 80 ms depois do texto (`opacity` só). Hover:
nenhum (não é link). Célula 6: seta do link `translateX(4px)`.

**A11y.** `<h2 id="porque-title">` "Por que o Complexo DMC?"; `ol` semântico (a numeração do
CSS espelha a do DOM). Contraste papel/escuro conforme tokens; o numeral ouro 40 px sobre
`--surface-2` é texto grande (≥ 3:1 exigido; medido 7,35:1 sobre grafite-700 — ok).

---

## 5. Seção 05 · Verticais de Negócios (`#verticais`) — pilha cinematográfica

**Objetivo.** Falar a língua do setor do visitante com cinco imagens grandes e uma decisão por
painel; cada painel leva a uma página real.

**Fundo.** `--surface-0`. Entra de 04 por corte. Sai para 06 por fio.

**Layout — a pilha.**
| | 1440 | 1024 | 768 | 390 |
|---|---|---|---|---|
| painel | `.dmc-wrap--wide` (1440), `aspect-ratio: 21/9`, `max-height: min(72vh, 660px)`, raio `--radius-2` | 21/9, `max-height: 64vh` | `aspect-ratio: 16/10`, sem sticky | mídia 16/10 em cima + texto em `--surface-1` embaixo, sem sticky |
| sticky | `position: sticky; top: calc(var(--header-h-lg) + 16px)`; cada painel seguinte sobe por cima; espaço entre painéis `--space-9` (o scroll "revela") | igual com `top: calc(var(--header-h) + 12px)` | fluxo normal, `gap: --space-8` | fluxo normal, `gap: --space-7` |
| texto | sobre o painel, `grid-column: 1 / span 5` de uma grade interna de 12, padding `--space-8`; véu lateral esquerdo: `linear-gradient(90deg, var(--veil-80) 0 46%, var(--veil-0) 70%)` | `span 6`, véu até 56 % | sobre o painel, véu inferior `linear-gradient(0deg, var(--veil-80) 0 55%, var(--veil-0) 85%)`, texto no rodapé do painel | texto fora da imagem (sem véu) |
| CTA | `dmc-btn--secondary` sempre visível | idem | idem | `dmc-btn--secondary` largura total |

Altura total da seção ≈ 5 × (660 + 64) no desktop — a pilha é longa de propósito: é o clímax.
Para quem não quer rolar, a navbar segue acessível e a seção 06 chega com o último painel.

**Componentes.** Novos: `.verticais`, `.verticais-head` (cabeçalho com tese), `.verticais-stack`
(`<ol>`), `.verticais-panel` (`<li><article>`), `.verticais-panel__media` (`<picture>`),
`.verticais-panel__veil`, `.verticais-panel__body`, `.verticais-panel__eyebrow` (fala do cliente,
Newsreader itálico 18→22, `--text-2`), `.verticais-panel__num` (01–05 overline),
`.verticais-panel__title` (`h3` em `dmc-h2`, Newsreader 300, ≤ 2 linhas em 1440: `max-width: 18ch`),
`.verticais-panel__text` (1 linha; `max-width: 34rem`), `.verticais-panel__cta`.
Reutilizados: `.dmc-sec-head`, `.dmc-btn--secondary`, `.dmc-reveal`.

**Conteúdo** (referência §3, com os ajustes de conformidade de fatos §4):
| # | Painel | H3 | Eyebrow (fala do cliente) | CTA → destino |
|---|---|---|---|---|
| 01 | Construção civil e incorporação | Do terreno à matrícula de cada unidade. | "Tenho um terreno e não sei se o empreendimento fecha." | Avaliar um terreno ou empreendimento → `pages/consultoria-imobiliaria.html` |
| 02 | Famílias que detêm imóveis e terras `[CEO: agro]` | A terra em ordem na matrícula e na sucessão. | "A área está na família há gerações e a matrícula não bate." | Conversar sobre as terras e a sucessão → `pages/registro-imobiliario.html` |
| 03 | Empresas familiares e holdings | Quem herda as quotas e quem assume o comando. | "Os sócios são irmãos e ninguém combinou a sucessão." | Conversar sobre a sucessão da família → `pages/holding-patrimonial.html` |
| 04 | Grupos empresariais | Regime, estrutura e integridade decididos com fundamento. | "São quatro empresas e nenhuma estrutura foi pensada em conjunto." | Pedir o diagnóstico tributário → `pages/planejamento-tributario.html` |
| 05 | Investidores e estrutura patrimonial | Imóveis e participações sob uma estrutura que se explica. | "Tenho imóveis e participações e não sei o que está em meu nome." | Conversar sobre a estrutura do patrimônio → `pages/holding-patrimonial.html` |

Painel 02 usa a formulação genérica autorizada em fatos §4 (sem "agro", "rural", "holding
rural"); se o CEO aprovar a vertical agro, só o rótulo muda. Painel 03 e 05 apontam para a
mesma página — aceitável (público diferente, mesma porta); alternativa para 03:
`pages/pronto-patrimonio.html`. Credores e empregadores ficam cobertos pela grade 03 (E5/E6).

**Mídia (video-3d-producer).** Cinco cenas procedurais, uma linguagem: **arquitetura e luz,
sem pessoas, sem logotipos, sem texto**, paleta `--surface-0..3` + uma única lâmina de luz
quente (ouro ≤ 14 % de opacidade), grain 2 %, névoa de profundidade (fog exponencial) para que
o painel tenha ar de fotografia noturna. Técnica: cena Three.js **offline** (Chromium do
Playwright renderiza um frame; a lib não entra no site) ou Canvas 2D isométrico quando couber.
Saídas: desktop 2560×1097 (21:9) e mobile 1200×750 (16:10), AVIF (q 55) + WebP (q 78), alvo
≤ 120 KB / ≤ 60 KB, `width/height` declarados, `loading="lazy" decoding="async"`.
1. **Construção**: grade de prismas extrudados em alturas variadas (continuação do skyline do
   hero, para costurar hero→verticais), câmera baixa a 18°, luz-chave alto-direita, lado
   esquerdo mergulhado em sombra (onde o texto cai).
2. **Terras**: curvas de nível procedurais (ruído simplex, 18–24 isolinhas, traço 0,8 px
   `--text-3` a 30 %) sobre `--surface-1`; uma parcela delimitada por traço ouro contínuo;
   leve vinheta. 2D puro.
3. **Famílias/holdings**: lâminas de vidro translúcidas empilhadas (7–9 placas 4:1), uma
   deslocada e iluminada por baixo; reflexo difuso; profundidade de campo rasa.
4. **Grupos**: treliça ortogonal de cubos ligados por arestas finas (12–20 nós), vista em
   3/4, nós da base em foco, topo dissolvendo na névoa — *não* é a rede neural (arestas
   retas, nós cúbicos).
5. **Investidores**: átrio longo com colunas em perspectiva de um ponto, piso espelhado,
   luz ao fundo; a fuga à direita deixa o terço esquerdo em sombra.
Poster/placeholder antes da entrega: `--surface-2` com o mesmo véu — a composição já lê como
final porque o texto não depende da imagem.

**Motion.** Sticky é layout, não animação (sem rAF). Ao entrar na viewport, a mídia faz
`scale(1.03→1)` + `opacity` 700 ms (uma vez); hover/focus-within no painel: mídia `scale(1.02)`
400 ms `--ease-out`, seta do CTA 4 px. Reduced: durações 1 ms, `scale` removido; sticky
permanece (não é movimento). 768 e abaixo: sem sticky, sem scale.

**A11y.** `<h2 id="verticais-title">` "Setores diferentes, *a mesma pergunta*." + lead da
referência §3. `ol` de 5 `article`, cada um `aria-labelledby` no `h3`; `<img alt="">` (texto
já está no artigo); único link por painel. Texto sempre sobre véu ≥ .82 → `--text-1` ≥ 15:1 no
pior caso; eyebrow `--text-2` ≥ 9:1. Foco visível no CTA (outline ouro) e `scroll-margin-top`
para que o painel sticky não cubra o foco de quem navega por Tab (os painéis seguintes ficam
abaixo no fluxo; o foco rola a página normalmente).

---

## 6. Seção 06 · Presença (`#presenca`) — mapa com profundidade

**Objetivo.** "De São Paulo, conectados aos desafios do Brasil" — sede em SP e conexão com
onde o ativo ou a empresa estão, **sem** números, praças ou "atuação nacional" `[CEO 1]`.

**Fundo.** `--surface-0` com `.dmc-section--rule` na entrada. Sai para 07 (papel) por corte.

**Layout (35/65).**
| | 1440 | 1024 | 768 | 390 |
|---|---|---|---|---|
| grid | 12 col: texto `1 / span 4`, mapa `6 / span 7` | texto `1 / span 4`, mapa `5 / span 8` | texto `1 / -1`, mapa `1 / -1` abaixo | 1 col |
| mapa | `aspect-ratio: 1`, `max-width: 40rem`, alinhado à direita | `max-width: 34rem` | largura total, máx 32rem centrado | largura total |
| cena 3D | `perspective: 1400px` no wrapper; figura `rotateX(6deg)` estático; paralaxe de ponteiro ±6 px em `translate3d` (lerp .06) | igual | sem perspective, sem canvas | sem perspective, sem canvas |

**Componentes.** Novos: `.presenca`, `.presenca-grid`, `.presenca__text`, `.presenca__scene`
(wrapper `perspective`), `.presenca__map` (figura `data-rede="brasil"`), `svg.presenca__svg`
(fallback + base), `canvas` (injetado), `.presenca__legend` (`dmc-small`: "Sede · São Paulo").
Estados: `is-live` (canvas montado), `data-motion="still|running"` (contrato contratos-qa §2.4).

**SVG inline.** `brasil-estados.svg` re-simplificado para DP 2,5 px (~12 KB), `role="img"
aria-labelledby="presenca-mapa-titulo"` com `<title>` "Mapa do Brasil com a sede em São Paulo";
27 `path[data-uf]` `fill: var(--surface-2)` `stroke: var(--color-line)`; 27 `circle` capitais
r 2,5 `fill: var(--text-3)`; `path[data-uf="SP"].is-sede` `fill: var(--surface-3)` +
`circle#no-SP.is-sede` r 5 ouro + anel r 11 ouro .35. Sem rótulos de cidade além de "SP".

**Canvas 2D (`brasil()` em `rede-neural.js`, reaproveitando `rng/size/place/spawn/loop/start/stop`).**
Só em `(min-width: 768px) and (prefers-reduced-motion: no-preference)`; fora disso, não monta.
Três planos: estados (SVG, z 0 — parado), arestas SP→26 capitais (z 0,4; quadráticas com
curvatura 0,12 × distância, `--text-3` a 18 %), nós (z 0,8; capitais `--text-3`, SP ouro com
halo radial 18 px) e pulsos (z 1; ouro, 1,4–2,3 s por aresta, máx 5 simultâneos, intervalo
900 ms, sempre saindo de SP). Paralaxe: `ptr × 0,035 × z` como hoje. DPR ≤ 2. rAF só com IO e
aba visível. `still()` desenha um quadro sem pulsos quando `reduce` liga ao vivo.

**Conteúdo.** Overline `06 · Presença`. H2 "De São Paulo, *conectados* aos desafios do Brasil."
Lead: "Sede em São Paulo. Fora dela, o atendimento depende do eixo, do escopo e da rede de
parceiros habilitados e cartórios conveniados — e é definido na conversa inicial." (fórmula
aprovada, fatos §3). Legenda: "Rua Riachuelo, 231 · São Paulo". Um `dmc-btn--link`
"Começar pela conversa inicial" → `#contact`. Nenhum número.

**Motion.** Descrito acima; entrada da figura `dmc-enter`. Nada de WebGL (`toDataURL` fiável;
CSP `connect-src 'self'` respeitada — JSON das capitais embutido no módulo, não `fetch`).

**A11y.** Texto carrega o significado; canvas `aria-hidden`; SVG com `role=img` e título.
Teste de geografia: 27 UFs, 1 `.is-sede`, 0 ocorrências de `/\d+\s*(estados|cidades|clientes|%)/`.

---

## 7. Seção 07 · Inteligência & Publicações (`#publicacoes`)

**Objetivo.** Estrutura editorial honesta: uma leitura real, dois espaços sem título nem data.

**Fundo.** `.dmc-on-paper`. Entra de 06 por corte; sai para 08 (escuro) por corte.

**Layout.**
| | 1440 | 1024 | 768 | 390 |
|---|---|---|---|---|
| grid | 12 col: destaque `1 / span 7` (poster 16:9 + texto), slots `9 / span 4` empilhados com fio | destaque `1 / span 7`, slots `8 / span 5` | destaque `1 / -1`, slots em 2 col | 1 col |
| poster | `aspect-ratio: 16/9`, raio `--radius-2` | idem | idem | idem |

**Componentes.** Novos: `.publi`, `.publi-grid`, `.publi-feature` (`<article>`), `.publi-feature__media`,
`.publi-feature__kicker` (overline "Leitura · Planejamento sucessório"), `.publi-feature__title`
(`h3.dmc-h3`), `.publi-feature__text`, `.publi-feature__meta` (`time` "Revisado em
2026-10-17" `--text-ink-3`), `.publi-feature__cta` (`dmc-btn--link` "Ler a análise"),
`.publi-slot` (`<li>` com fio superior, overline "Em preparação", sem título, sem data — classe
`.publicacoes__vazio` exigida pelo contrato de teste), `.publi-slot__hint` ("Receba quando sair"
→ `#newsletter`).

**Conteúdo.** Destaque = `pages/por-que-urgente.html` com o título da página ("Por que planejar
a sucessão em vida"), 1 frase (legítima, inventário, ITCMD, EC 132/2023), `time datetime="2026-10-17"`
(data real de revisão). Slots 2 e 3: só "Em preparação" + link para a newsletter.

**Mídia.** Poster procedural 1600×900: arcos concêntricos finos (Newsreader não — nada de
texto) em `--text-ink-3` a 25 % sobre `--color-paper-2`, um arco em `--color-gold-deep`;
AVIF+WebP ≤ 60 KB. Serve de template de capa para artigos futuros (variar o arco acentuado).

**Motion.** Revelação; hover no destaque: mídia `scale(1.02)` 400 ms. Reduced: nada.

**A11y.** `<h2 id="publi-title">` "Inteligência". `time` ISO ≤ hoje. Contraste
`--text-ink-3` 5,4:1.

---

## 8. Seção 08 · Como conduzimos (`#treinamentos`)

**Objetivo.** Método em quatro etapas + o único programa de formação documentado.

**Fundo.** `--surface-1`. Entra de 07 por corte; sai para 09 (papel) por corte.

**Id.** Mantém `id="treinamentos"` (29 links de entrada). O rótulo "Treinamentos" no navbar e
nos rodapés é decisão a registrar em DECISIONS (contratos-qa §1.8); esta spec não o altera.

**Layout.**
| | 1440 | 1024 | 768 | 390 |
|---|---|---|---|---|
| grid | 12 col: etapas `1 / span 8` como linha do tempo horizontal de 4 colunas com fio superior contínuo; programa `10 / span 3` como coluna lateral com fio esquerdo | etapas `1 / span 8` (4 col), programa `9 / span 4` | etapas em 2 × 2, programa abaixo largura total | etapas empilhadas (lista numerada com fio), programa abaixo |
| etapa | numeral Newsreader 300 48 px ouro, `h3.dmc-h4`, texto ≤ 2 linhas | idem | idem | numeral 36 px |

**Componentes.** Novos: `.metodo`, `.metodo-grid`, `.metodo-steps` (`<ol>`), `.metodo-step`,
`.metodo-step__num`, `.metodo-step__title`, `.metodo-step__text`, `.metodo-programa` (`<aside>`),
`.metodo-programa__kicker` ("Formação institucional"), `.metodo-programa__title` (`h3`),
`.metodo-programa__meta` ("42 horas · online", `--font-numeric`), `.metodo-programa__cta`
(`dmc-btn--secondary` "Conhecer a plataforma" → `plataforma-ead/`). Reutiliza o padrão
`.np-flag-list`/`.treino__meta::before` (counter com fio) portado para `home.css`.

**Conteúdo.** H2 "Como *conduzimos*". Etapas de fatos §3: Diagnóstico → Cenários e decisão →
Estruturação e implementação → Acompanhamento e revisão. Programa: "Arquitetura Patrimonial
Estratégica — 42 horas, online" **sem preço, sem módulos**. Os seis cursos atuais saem
`[CEO 3]`; nenhum link `login.html?curso=`.

**Motion.** Revelação em cascata (4 + 1). Fio superior da linha do tempo `scaleX(0→1)` 700 ms
ao entrar (transform-origin left). Reduced: fade.

**A11y.** `ol` real; `aside` com `aria-labelledby`. Numeral ouro sobre `--surface-1`: 9,2:1.

---

## 9. Seção 09 · Newsletter (`#newsletter`)

**Objetivo.** Captura leve antes do contato; nunca afirmar cadastro sem `{ok:true}` 2xx.

**Fundo.** `.dmc-on-paper`. Entra de 08 por corte; sai para `#video` (escuro) por corte.

**Layout.**
| | 1440 | 1024 | 768 | 390 |
|---|---|---|---|---|
| grid | 12 col: texto `1 / span 5`, form `7 / span 6` | texto `1 / span 5`, form `6 / span 7` | empilhado | empilhado |
| form | 2 linhas: [nome][e-mail] / [empresa][botão]; campos 48 px; `gap: --space-4`; consentimento abaixo em linha única | igual | linha 1: nome + e-mail; linha 2: empresa; botão largura total | tudo empilhado, botão largura total |

**Componentes.** Reutiliza `.form-field`, `.form-consent`, `.form-message`, `.form-hp`,
`.dmc-btn--primary` (em papel → preto). Novos: `.news`, `.news-grid`, `.news__text`,
`.news-form` (`form#newsletterForm[action="/api/newsletter"][method="post"][data-origem="home"]`),
`.news-form__row`, `.news-form__legal` (`dmc-small`: consentimento, descadastro a qualquer
momento pelo link do e-mail, link para `pages/politica-de-privacidade.html` `[CEO: política
com CONFIRMAR]`). Ids do contrato: `nl-nome`, `nl-email`, `nl-empresa`, `nl-consentimento`
(`required`, label com "LGPD"), `nl-website` (honeypot em `aria-hidden`), `#nlMessage[role=status]`.

**Conteúdo.** H2 "Análises para *quem decide*." Lead 1 linha (periodicidade não prometida).
Botão "Quero receber análises". Mensagens: sucesso só com 201; erro de rede/5xx: "Não foi
possível concluir agora. Tente novamente em instantes." (sem "receb"/"cadastrad").

**Motion/JS.** `initNewsletter()` em `main.js`, clone de `initForm` (aria-busy, foco no 1.º
inválido, `aria-describedby`). Sem revelação no formulário (conteúdo funcional).

**A11y.** Labels visíveis; erro com texto; `role=status`. 320 px: campos `min-width: 0` na
grade para zero overflow.

---

## 10. Seção 10 · Vídeo, CTA final, rodapé

- `#video`: mantido como está (penúltimo bloco, antes de `#contact`), cabeçalho com overline
  `Em vídeo`. `data-video=""` até o CEO fornecer o ID `[CEO 11]`.
- `#contact`: mantido intacto (ids, `select#cf-eixo`, `data-assunto`). Só o cabeçalho ganha
  o H2 "Comece pela *decisão a tomar*." e a navbar/hero continuam o canal primário; o botão
  flutuante de WhatsApp passa a montar `?text=` com o eixo quando a visita veio de
  `?assunto=EN` (spec JS pequena em `main.js`).
- Rodapé `#rodape`: mantido; o link "Soluções" → `#features` continua válido; "Treinamentos"
  → `#treinamentos` continua válido (rótulo pendente).

---

## 11. Destino do que existe hoje

| Bloco atual | Destino |
|---|---|
| `#hero` (135-165) | **mantido** sem alteração |
| `.fatos` (167-177) | **removido**; conteúdo absorvido por 04 (itens 1 e 3) e 06 (sede) |
| `#conheca` texto (`.casa__text`) | **mantido** (H2 + lead), reescrito como `.dmc-sec-head` |
| `#conheca` `.casa__eixos` tablist + `.casa__foco` + `.casa__acoes` | **removidos** (eixos vão para 03; CTA de contato duplicado sai; "Sobre" vira o único CTA) |
| `#conheca` `.casa__rede` + `svg.casa__fallback` | **removidos**; a rede renasce como mapa em 06 |
| `#features .np-cases-band` ("Qual é a sua situação?" + busca) | **removido**; as 6 falas + E6 nova viram eyebrow dos painéis 05 (5 usadas; E5/E6 ficam registradas em `referencia-e-mensagens.md` para o mega-menu) |
| `#features .np-axes` (tablist) | **removido**; o `home.spec.js` é reescrito (contratos §2.2) |
| `#features .np-flags` (6 `article#eixo-N`) | **transformados** nas 6 células da grade; ids `#eixo-1..6` preservados; headlines dos painéis guardadas para as internas |
| `#npGrid` (21 `a.np-card`) | **movidos** para `details.eixos-catalogo` como links textuais; `catalogo-cards.json` salvo antes; id `npGrid` extinto |
| `.np-closer` | **removido** |
| `#treinamentos` (6 cursos) | **transformado** em 08 "Como conduzimos"; id mantido |
| `#results` (Ad-tech) | **removido**; vira item 6 de 04 com link para `pages/tecnologia.html` |
| `#video` | **mantido** |
| `#contact` | **mantido** |
| `#rodape`, flutuantes | **mantidos** |

Âncoras garantidas: `#hero`, `#conteudo`, `#conheca`, `#features`, `#eixo-1..6`,
`#treinamentos`, `#video`, `#contact`, `#rodape`. Novas: `#porque`, `#verticais`,
`#presenca`, `#publicacoes`, `#newsletter`.

---

## 12. Especificação para `frontend-motion` (JS) — resumo do que muda

| Arquivo | Remove | Acrescenta |
|---|---|---|
| `main.js` | `initEixos` (257-374), `initBusca` (383-488), `sortearDestaque` | `initRino()` (play/pause por IO, 200 px); `initNewsletter()` (clone de `initForm` com os ids `nl-*`); ajuste do WhatsApp flutuante com `?assunto` |
| `rede-neural.js` | `controlador()`, `casa()`, `stageNet/stages()` | `brasil(fig)` com dados das 27 capitais embutidos (de `geo/brasil.json`), gate `matchMedia` 768 + reduce, `data-motion`, `is-live` |
| `video.js`, `navbar.js` | — | — (navbar: só a decisão de rótulo "Treinamentos", fora desta spec) |
| HTML | ~320 linhas (cases, abas, grid, closer, adtech, fatos) | ~260 linhas (grade, porque, verticais, presença, publicações, método, newsletter, `<svg hidden>` dos 6 símbolos) |

---

## 13. Mapa de estilos — o que morre em `styles.css`

| Linhas | Bloco | Destino |
|---|---|---|
| 1-65 | base + fio de acento | **fica** (o fio é copiado para `home.css` como `.eixos-cell::before`; a versão genérica pode sair quando `.casa__tab/.np-axes/.np-card` sumirem) |
| 67-168 | herói | **fica** intocado |
| 170-197 | `.fatos` | **morre** |
| 199-334 | `.casa*` | **morre**; `.casa` renasce em `home.css` (~40 linhas) |
| 336-449 | `.np-section`, `.np-cases*`, busca | **morre** |
| 451-500 | `.np-axes` | **morre** |
| 502-633 | `.np-flag*`, `.np-spot*`, `.np-flag-list` | **morre** (o counter com fio é portado para `.metodo-step`) |
| 635-694 | `.np-grid`, `.np-card`, `.np-closer` | **morre** |
| 696-727 | `.treinos*` | **morre**; `.metodo` em `home.css` |
| 729-788 | `.adtech*` | **morre** |
| 791-976 | `.page-video__*` + escopo `#video` | **fica** (bloco triplicado; não tocar) |
| 978-1142 | contato | **fica** |
| 1144-1192 | flutuantes + reduce | **fica** |

Resultado: `styles.css` ≈ 1192 → ≈ 560 linhas; `home.css` novo ≈ 520 linhas (≤ 14 KB gzip).
Classes criadas por JS a conferir na varredura de CSS morto: `is-live`, `is-in`, `is-playing`,
`is-broken`, `visible`, `page-video__cover/__play`, `form-field__error`, `is-enviando/sucesso/erro`,
`data-motion`.

---

## 14. Orçamento de performance (não regredir 99/100/100/100)

| Item | Limite | Como |
|---|---|---|
| LCP | ≤ 1,8 s (hoje 1,80) | nada novo antes do poster do herói; `home.css` depois de `styles.css`; `<svg hidden>` dos ícones ≤ 2 KB |
| CLS | ≤ 0,01 | `aspect-ratio` em toda mídia; `width/height` em `<img>`; grade 03 com `min-height`; sticky não altera layout |
| TBT | 0 ms | canvas do mapa só por IO e ≥ 768; sem libs; `brasil()` ≤ 6 KB; nenhum `fetch` |
| CSS | `styles.css` + `home.css` ≤ 35 KB bruto (hoje 49) | ver §13 |
| HTML | ≤ 80 KB (hoje 104) | 21 cards → lista textual; SVG do mapa ~12 KB inline |
| Imagens novas | 5 verticais ≤ 120 KB desktop / ≤ 60 KB mobile cada; casa ≤ 90/60; poster publicação ≤ 60 | AVIF+WebP, `loading="lazy"`, `<picture>` com `media="(max-width: 767px)"` |
| Vídeo extra | rino ≤ 0,8 MB, `preload="none"`, play por IO | reuso do ativo das internas |
| Total sem vídeo do herói | ≤ 1,5 MB | soma acima ≈ 0,9 MB |
| CPU mobile | sem rAF em < 768 | gate em `brasil()`; rino pausa fora da tela |
| Fontes | 0 novas | Newsreader 300/itálico + Hanken 400–600 já carregadas |

---

## 15. Impacto nos testes (referência: `contratos-qa.md`)

- `home.spec.js`: **reescrever** conforme §2.2 (6 artigos visíveis, 0 `role=tab`, `/#eixo-N` em
  viewport via `:target`, Tab percorre 6 CTAs, destino com `np-pillar-<slug>` igual).
- `movimento.spec.js` 49-66: **substituir** pelo bloco do mapa (§2.4: 390 sem canvas; 1440 +
  reduce `data-motion="still"` e rAF ≤ 1/s; controle `running`). `#conheca` continua existindo
  (sem canvas → o teste atual passa até a troca).
- `navegacao`, `a11y`, `console`, `viewports`, `seo`, `rotas`, `formulario`: **mantêm**; atenção
  a `rotas` l. 187/189 (âncoras de §11) e a `viewports` 320 na grade 03, mosaico 04, pilha 05
  (`.dmc-wrap--wide` com `max-width: 100%`), SVG 06 (`width: 100%; height: auto`), form 09.
- Novos: `newsletter.spec.js` (§3.1) e `home-secoes.spec.js` (§3.2: ordem dos ids
  `hero, conheca, features, porque, verticais, presenca, publicacoes, treinamentos, newsletter, video, contact`;
  vídeo antes do contato; conformidade; overflow por seção; axe por seção; imagens lazy ≤ 250 KB).
- Lighthouse: mediana de 3, metas de §14; capturas em `docs/dmc/qa/<data>-home-v2/`.

---

## 16. Aceite visual (checklist do diretor de arte)

1. Em 1440, nenhuma seção tem mais de um padrão de componente; só a cor do eixo muda na grade.
2. Nenhum texto sobre imagem sem véu ≥ .80; nenhum ouro como texto sobre papel.
3. Zero caixas com sombra; fio de 1 px em tudo que separa; raio máximo 4 px na mídia.
4. Um único canvas na página (06); um único vídeo em loop fora do herói (rino, 02).
5. Em 390: 0 overflow, CTAs de 48 px, mídia das verticais acima do texto, mapa estático.
6. Nenhum número institucional, percentual, "garantia", nome de parceiro ou curso fora do
   catálogo; atos privativos sempre atribuídos a parceiros habilitados/cartórios conveniados.
