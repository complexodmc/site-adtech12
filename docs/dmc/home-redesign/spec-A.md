# Nova home — Especificação A · "Editorial-first"

Diretor de arte A · 2026-10-17 · direção C (Híbrido Executivo), não reaberta.
Base: `fatos.md`, `inventario-frontend.md`, `referencia-e-mensagens.md`, `contratos-qa.md`,
`DESIGN-SYSTEM.md`, capturas `qa/2026-10-17/home/*.png`, `index.html` (working tree).
Nada aqui toca `complexodmc.com.br/` nesta fase; é o documento que o frontend implementa sem
perguntar. Copy marcada `[copy]` é proposta a validar pelo content-director; links e fatos vêm
de `fatos.md` e não mudam.

---

## 0. Tese da proposta A

**Uma revista, não um catálogo.** A home atual repete os seis eixos quatro vezes e oferece ~40
pontos de clique antes do formulário. A proposta A substitui isso por dez seções com **um padrão
por seção, um item = uma linha + um link**, e leva a autoridade pela tipografia (Newsreader 300
para teses, Hanken para leitura), por fios de 1 px e por respiro, não por caixas.

As cinco decisões que estruturam tudo:

1. **Ritmo claro/escuro em blocos, não em zebra.** Em vez de alternar a cada seção, a página tem
   quatro grandes mudanças de fundo: ESCURO (01 Hero + 02 Casa) → PAPEL (03 Eixos) → DIVIDIDA
   (04 Por quê: grafite à esquerda, papel à direita) → PAPEL (05 Verticais) → ESCURO (06 Presença +
   07 Inteligência) → PAPEL (08 Método + 09 Newsletter) → ESCURO (vídeo) → PAPEL (10 Contato) →
   rodapé `--surface-1`. Dentro de cada bloco, seções vizinhas se separam por fio, não por cor.
2. **A rede neural sai da Casa e vai para o Brasil.** Um só canvas na página (06), sobre o mapa;
   a seção 02 vira manifesto tipográfico + ficha da casa. Zero duplicidade de "rede" e menos CPU.
3. **O painel `#features` vira índice editorial 3×2.** Sem abas, sem tablist, sem troca de painel,
   sem 18 cards: cada eixo é um `article#eixo-N` com ícone exclusivo, nome, uma linha, um índice
   textual das soluções (preserva **todos** os links) e um CTA "Explorar soluções".
4. **Verticais como fólio numerado**, cinco filas alternadas (mídia 6 colunas / texto 5), headline
   em Newsreader do tamanho de H2, mídia procedural emoldurada sobre papel — a única "fotografia"
   da página além do herói.
5. **Honestidade estrutural**: 07 nasce com um destaque real + dois espaços declarados "em
   preparação"; 08 é "Como conduzimos" (4 etapas) com uma linha sobre o único programa real; 09 nunca
   diz "cadastrado" sem 2xx. Nenhum número, adjetivo ou promessa em lugar algum.

Mapa final das seções e ids (ordem do DOM):

| # | id | Classe raiz | Fundo | Separador com a anterior |
|---|---|---|---|---|
| 01 | `hero` | `.hero` (intocada) | escuro | — |
| 02 | `conheca` | `.dmc-section.dmc-section--rule.casa` | `--surface-0` | fio `--color-line` |
| 03 | `features` | `.dmc-section.dmc-on-paper.eixos` | papel | corte de cor |
| 04 | `porque` | `.dmc-section.porque` | `--surface-0` + painel papel | corte (o papel "estreita" para a direita) |
| 05 | `verticais` | `.dmc-section.dmc-on-paper.verticais` | papel | corte |
| 06 | `presenca` | `.dmc-section.presenca` | `--surface-0` | corte |
| 07 | `publicacoes` | `.dmc-section.dmc-section--rule.publi` | `--surface-0` | fio |
| 08 | `treinamentos` | `.dmc-section.dmc-on-paper.metodo` | papel | corte |
| 09 | `newsletter` | `.dmc-section.dmc-on-paper.dmc-section--rule.news` | papel | fio tinta |
| — | `video` | existente | `--surface-0` | corte |
| 10 | `contact` | existente | papel | corte |
| — | `rodape` | existente | `--surface-1` | — |

Âncoras preservadas: `#hero`, `#conheca`, `#features`, `#eixo-1…6`, `#treinamentos`, `#video`,
`#contact`, `#rodape`, `#conteudo`. Ids novos: `#porque`, `#verticais`, `#presenca`,
`#publicacoes`, `#newsletter`. `#results`, `#npGrid`, `#npAskForm` deixam de existir.

---

## 1. Fundações compartilhadas (valem para todas as seções)

### 1.1 Arquivo CSS
`assets/css/home.css?v=1`, carregado **depois** de `styles.css` (opção A do inventário §5).
Cabeçalho por seção `/* ==== 0N · NOME ==== */`, mobile-first, breakpoints só em
`640 / 768 / 1024 / 1440`, nenhum literal de cor, nenhum `transition: all`, zero `will-change`.
Custom properties locais na raiz da seção:

```css
.home-media { --ratio-panel: 3 / 2; --ratio-panel-m: 16 / 10; --ratio-map: 1; }
```

Ajuste de componente (visual, permitido em `home.css`): `.dmc-on-paper.dmc-section--rule { border-color: var(--color-line-ink); }`.

### 1.2 Grade
`.dmc-wrap` (1240 + gutter) para texto; `--container-wide` (1440) só nas mídias de 05 e no mapa de 06.
12 colunas a partir de 1024, 8 de 768–1023, 4 abaixo. Gap = `--grid-gap` (16→32).
Padrão de cabeçalho de seção = `.dmc-sec-head` (overline + `h2.dmc-h1` com `<em>` + `p.dmc-lead`),
sempre alinhado à esquerda, `max-width: 48rem`. **Nenhum H2 centrado na página.**

### 1.3 Tipografia (classes existentes, sem novas famílias)
| Papel | Classe | Fonte |
|---|---|---|
| Tese de seção | `h2.dmc-h1` | Newsreader 300, `<em>` itálico |
| Headline de vertical | `h3.verticais-item__title` (nova; mesmos valores de `.dmc-h2`) | Newsreader 300 |
| Nome de eixo, título de item | `h3.dmc-h3` / `.dmc-h4` | Hanken 600 |
| Corpo | `--fs-body`, lh 1.65 | Hanken 400 |
| Índice de soluções, legendas | `.dmc-small` (14) | Hanken 400/500 |
| Numeração (01…06) | `font: 500 var(--fs-small) var(--font-text); font-variant-numeric: tabular-nums` cor `rgb(var(--np-accent))` ou `-deep` sobre papel | Hanken |
| Overline | `.dmc-overline` | Hanken 12/0.16em |

Regra de medida: texto corrido ≤ `--measure` (38rem); descrição de eixo ≤ 160 caracteres; frase de
vertical ≤ 200.

### 1.4 Cor e contraste (medidos com os tokens, WCAG 2.x)
- Sobre `--surface-0`: `--text-1` 17,7 · `--text-2` 10,4 · `--text-3` 6,8 · acento de eixo ≥ 8,2 · ouro 9,6.
- Sobre papel: `--text-ink-1` 17,7 · `--text-ink-2` 7,7 · `--text-ink-3` 5,4 · `--np-accent-deep` 4,6 (AA para
  texto normal — usar só em 14 px/500+ ou maior) · ouro `deep` `#82602e` 4,6.
- **Proibido**: `rgb(var(--np-accent))` (parada clara) como texto sobre papel; ouro `#d6b069` como texto
  sobre papel; qualquer texto sobre a mídia procedural sem véu ≥ .80.
- Cor de eixo aparece **apenas** em: ícone, numeração "E1", fio ativo/hover e seta do CTA. Nunca em fundo,
  nunca em título.

### 1.5 Movimento (tokens; herdam `prefers-reduced-motion` → 1 ms)
- Revelação: `.dmc-reveal` (16 px + fade, `--dur-reveal` 700, uma vez) em cabeçalhos de seção, itens de
  lista e mídias — **nunca** no herói, no formulário nem em `#contact`. Stagger por `--i` × 80 ms, teto 5.
- Hover de link/CTA: seta `translateX(4px)` 240 ms (já no `.dmc-btn`); fio `scaleX(0→1)` 400 ms
  `--ease-out` (padrão `::before` de `styles.css` 53-65 — migrar a regra para `home.css` sob os novos seletores).
- Mídia: **sem zoom, sem paralaxe CSS**. A única animação contínua da página é o canvas de 06.
- Canvas: rAF só em viewport e aba ativa; nunca em <768; `still()` em reduce.

### 1.6 Acessibilidade comum
- Cada `section` com `aria-labelledby` apontando para o seu `h2`; um `h1` (herói); `h3` para itens.
- Alvos ≥ 44 px; foco visível = `--focus-color` (ouro) sobre escuro, `--focus-color-ink` sobre papel
  (o `.dmc-on-paper` já redefine).
- SVG decorativo: `aria-hidden="true" focusable="false"`. Mapa: `role="img"` + `aria-labelledby`.
- Ordem de tabulação = ordem de leitura; nada de `tabindex` positivo.

---

## 2. Seção por seção

### 01 · Hero — `#hero` (não mexer)
Mantido byte a byte. Único ajuste **de conteúdo** proposto, fora do CSS/JS do herói: o link secundário
"Conheça os seis eixos" continua em `#features` (válido: 03 mantém o id).

---

### 02 · A Casa — `#conheca`

**Objetivo.** Dizer em uma frase quem é a DMC (consultoria em negócios, seis eixos, uma governança)
e responder à objeção "isso é escritório?" antes de qualquer catálogo. Entrega confiança em 10 s.

**Fundo/transição.** `--surface-0`, mesmo preto do herói; `.dmc-section--rule` dá o fio de 1 px.
A faixa `.fatos` **morre**; seus quatro rótulos viram a ficha.

**Composição.** Manifesto à esquerda, ficha à direita. Sem mídia, sem canvas (decisão 2).

```html
<section class="dmc-section dmc-section--rule casa" id="conheca" aria-labelledby="casa-title">
  <div class="dmc-wrap casa-grid">
    <div class="casa-tese dmc-sec-head dmc-reveal">
      <p class="dmc-overline">Sobre</p>
      <h2 class="dmc-h1" id="casa-title">Decisões complexas pedem <em>visão integrada</em>.</h2>
      <p class="dmc-lead">O Complexo DMC integra seis eixos de especialidade para decisões empresariais, patrimoniais e operacionais de alta complexidade.</p>
      <a class="dmc-btn dmc-btn--link" href="pages/sobre.html">Sobre o Complexo DMC</a>
    </div>
    <dl class="casa-ficha dmc-reveal" style="--i:1">
      <div><dt>Natureza</dt><dd>Consultoria em negócios, com sede em São Paulo.</dd></div>
      <div><dt>Eixos</dt><dd>Seis especialidades integradas sob uma só governança.</dd></div>
      <div><dt>Execução</dt><dd>Atos privativos por sociedades de advogados parceiras, contadores e auditores habilitados e cartórios conveniados.</dd></div>
      <div><dt>Método</dt><dd>Diagnóstico, cenários e decisão, estruturação e implementação, acompanhamento e revisão.</dd></div>
    </dl>
  </div>
</section>
```

**Layout.**
| Largura | Grade |
|---|---|
| 1440/1024 | `.casa-grid` 12 col: tese `1 / span 6`, ficha `8 / span 5`, alinhadas ao topo; ficha com `padding-top: var(--space-3)` para alinhar o primeiro `dt` à linha de base do overline |
| 768 | 8 col: tese `1 / span 8`; ficha `1 / span 8`, `margin-top: var(--space-8)` |
| 390/320 | 1 col; ficha em pilha |

**`.casa-ficha`** (novo): `display:grid; gap:0`; cada `div` = linha com `border-top: 1px solid var(--color-line)`,
`padding-block: var(--space-5)`, grade interna `grid-template-columns: 7rem 1fr` (≥640) ou pilha (<640).
`dt` = `.dmc-overline` em `--text-3`; `dd` = corpo `--text-2`, `max-width: 30rem`. Última linha com
`border-bottom`. Nenhuma caixa.

**CTA.** Um só, link ("Sobre o Complexo DMC"). O botão de contato duplicado sai (há no herói, na navbar
e em 10).

**Remoções.** `casa__rede`, `casa__fallback` (SVG), `casa__eixos` (tablist), `casa__foco`, `casa__acoes`.
`rede-neural.js`: `casa()` e `controlador()` deixam de ser invocados na home (o módulo passa a montar só
`brasil()`); `movimento.spec` l. 49-66 migra para 06 (contratos-qa §2.4). Se `#conheca canvas` não existe,
o teste atual já passa.

**Motion.** `.dmc-reveal` na tese e na ficha (stagger 1). Nada mais.

---

### 03 · Seis Eixos — `#features`

**Objetivo.** Índice completo da casa em uma tela: o visitante vê os seis eixos ao mesmo tempo, reconhece
o seu pela situação e vai à página do eixo. É também onde **todos** os links de soluções continuam vivos.

**Fundo/transição.** Primeira seção em papel (`.dmc-on-paper`), corte seco com o preto da Casa — é o
"virar de página". `padding-block` padrão.

**Composição.** `.dmc-sec-head` + grade 3×2 de `article` separados **só por fios**, sem fundo próprio.

```html
<section class="dmc-section dmc-on-paper eixos" id="features" aria-labelledby="eixos-title">
  <div class="dmc-wrap">
    <div class="dmc-sec-head dmc-reveal">
      <p class="dmc-overline">Seis eixos</p>
      <h2 class="dmc-h1" id="eixos-title">Seis eixos, <em>uma só governança</em>.</h2>
      <p class="dmc-lead">[copy] Comece pela sua situação, não pelo catálogo: cada eixo leva à página com as soluções que o conduzem.</p>
    </div>
    <ol class="eixos-grid" aria-label="Os seis eixos do Complexo DMC">
      <li>
        <article class="eixos-item np-pillar-patrimonial dmc-reveal" id="eixo-1" data-eixo="1" aria-labelledby="eixo-1-titulo" style="--i:0">
          <svg class="eixos-item__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">…</svg>
          <p class="eixos-item__num">E1</p>
          <h3 class="dmc-h3" id="eixo-1-titulo">Planejamento Patrimonial e Sucessório</h3>
          <p class="eixos-item__desc">Sucessão, holding e proteção do patrimônio familiar organizados em vida, com a carga tributária calculada antes de cada ato.</p>
          <p class="eixos-item__index dmc-small"><span class="dmc-sr-only">Soluções: </span>
            <a href="pages/planejamento-sucessorio.html">Planejamento Sucessório</a> ·
            <a href="pages/holding-patrimonial.html">Holding Patrimonial</a> ·
            <a href="pages/blindagem-patrimonial.html">Blindagem Patrimonial</a> ·
            <a href="pages/pronto-patrimonio.html">Proteção Patrimonial</a> ·
            <a href="pages/sucessao-testamentaria.html">Sucessão Testamentária</a>
          </p>
          <a class="dmc-btn dmc-btn--link eixos-item__cta" href="pages/planejamento-sucessorio.html">Explorar soluções<svg …seta…></svg></a>
        </article>
      </li>
      …E2–E6…
    </ol>
  </div>
</section>
```

Ordem, nomes, descrições (≤160) e `href` do CTA: tabela §1 e §2 de `fatos.md`, sem alteração.
Índices de soluções: E1 5 links (o apoio `por-que-urgente` vai para 07); E2 2; E3 5; E4 1
(`contabilidade`; o card "Auditoria Empresarial → #contact" **não** entra — não é página, `[CEO pend. 10]`);
E5 1; E6 7 (Ciclo Fechado + 6). Total 21 links de solução preservados na home.

**Layout.**
| Largura | Grade `.eixos-grid` | Célula |
|---|---|---|
| 1440 | `repeat(3, 1fr)`, `column-gap: var(--grid-gap)`, `row-gap: 0` | `padding: var(--space-8) 0 var(--space-9)`; `border-top: 1px solid var(--color-line-ink)`; altura mínima 22rem (a linha superior alinhada em todas as células pela borda, não por altura) |
| 1024 | idem 3 col | `padding: var(--space-7) 0 var(--space-8)` |
| 768 | `repeat(2, 1fr)` | idem; a 6.ª célula fica sozinha na 3.ª linha, alinhada à esquerda (aceito; sem centrar) |
| 390/320 | 1 col | `padding: var(--space-6) 0`; `border-top` em todas, `border-bottom` na última |

**Célula** (`.eixos-item`): `display:grid; grid-template-rows: auto auto auto 1fr auto auto; gap: var(--space-3)`;
`position:relative`; `::before` = fio de acento 2 px no topo (`rgb(var(--np-accent-deep))`, `scaleX(0)`,
`transform-origin:left`) que cresce em `:hover`, `:focus-within` e `:target` (400 ms) — reaproveita o padrão
de `styles.css` 53-65 migrado. **Sem fundo, sem raio, sem sombra.**
- `__icon`: 32×32 (`width:2rem;height:2rem`), `color: rgb(var(--np-accent-deep))`, `stroke-width:1.5`,
  `margin-bottom: var(--space-2)`.
- `__num`: Hanken 500 14 px tabular, `color: rgb(var(--np-accent-deep))`, `letter-spacing:.08em`.
- `h3.dmc-h3`: `--text-ink-1`, `text-wrap: balance`, máx. 2 linhas em 1440 (os seis nomes cabem).
- `__desc`: corpo 16/17, `--text-ink-2`, `max-width: 32rem`.
- `__index`: 14 px `--text-ink-3`; links `color: inherit; text-decoration: underline; text-underline-offset:.25em;
  text-decoration-color: var(--color-line-ink)`; hover/focus → `--text-ink-1` + `text-decoration-color: currentColor`.
  Separador "·" com `margin-inline:.35em`. Alinhado ao fim da célula (`align-self:end`).
- `__cta`: `.dmc-btn--link` (44 px), cor `--text-ink-1`, seta 16 px em `rgb(var(--np-accent-deep))`.
- `:target` (vinda por `/#eixo-N`): fio aberto + `scroll-margin-top: calc(var(--header-h-lg) + var(--space-6))`.

**Estados.** repouso · hover/focus-within (fio cresce; nada mais muda) · `:target` (fio aberto e permanece).
Sem JS: idêntico (progressive enhancement só no reveal).

**Ícones — seis desenhos exclusivos** (grade 24, traço 1.5, `fill:none; stroke:currentColor;
stroke-linecap:round; stroke-linejoin:round`; exibidos a 32 px aqui e 24 px no mega-menu/rodapé se quiserem
reutilizar). Nenhum é balança, martelo, prédio genérico ou cifrão.

| Eixo | Nome do glifo | Geometria (coordenadas na grade 24) |
|---|---|---|
| E1 Patrimonial e Sucessório | **Transmissão** | círculo r 2.5 em (12,4.5); haste (12,7)→(12,11); travessa (6,11)→(18,11); duas descidas (6,11)→(6,15.5) e (18,11)→(18,15.5); dois círculos r 2.5 em (6,18) e (18,18). Lê-se "de um para a geração seguinte". |
| E2 Tributário, Fiscal e Corporativo | **Praças sobrepostas** | quadrado A (3,3)→(14,14); quadrado B (10,10)→(21,21); a interseção (10..14) fica sem traço interno (desenhar A com o lado inferior/direito interrompidos entre 10 e 14, e B inteiro) — controladora/controlada, consolidação. |
| E3 Notarial e Imobiliário | **Matrícula** | folha (5,2)→(19,22) com dobra no canto superior direito: contorno vai (5,2)→(15,2)→(19,6)→(19,22)→(5,22)→fecha; dobra (15,2)→(15,6)→(19,6); duas linhas de texto (8,10)→(16,10) e (8,13.5)→(13,13.5); selo = círculo r 2 em (15,17.5). |
| E4 Auditoria Empresarial e Contábil | **Lente sobre o livro** | círculo r 6 em (10,10); cabo (14.3,14.3)→(20,20); dentro da lente duas linhas (7,8.5)→(13,8.5) e (7,11.5)→(11,11.5). Quem lê não é quem escreve. |
| E5 Recuperação de Ativos | **Do título ao ativo** | título = retângulo (3,3)→(10,12); ativo = retângulo (13,12)→(21,21) com linha interna (13,15)→(21,15) (tampa de cofre); conector em L (10,7.5)→(16.5,7.5)→(16.5,11) com ponta de seta em (16.5,11): (14.8,9.3) e (18.2,9.3). |
| E6 Consultoria Trabalhista | **Ciclo em quatro tempos** | anel r 8 em (12,12) interrompido em 4 vãos de 20° centrados em 0°/90°/180°/270°; nos 4 vãos um ponto cheio r 1.4 (admissão, decisão, acordo, quitação). Distinto do E5 (que é aberto e retilíneo). |

Os 6 SVGs atuais de `.np-spot-ico` (traço 1.7) são **substituídos** por estes; `data-icone` dos 21
cards são arquivados em `catalogo-cards.json` (ver §4) e não se usam na home.

**Destino do painel atual (decisão explícita).**
| Peça atual | Destino |
|---|---|
| `.np-cases-band` "Qual é a sua situação?" + busca `#npAskForm` | **Removida da home.** As seis falas são boas e vão para `catalogo-cards.json` como insumo do content-director para os heróis das internas e para a FAQ de `sobre.html`. O papel de "entrar pela situação" fica com o lead desta seção e com `select#cf-eixo` ("Ainda não sei"). `initBusca` sai de `main.js`. |
| `.np-axes` (6 abas) | **Removida**; a grade é a própria lista. |
| `.np-flags` (6 `article#eixo-N`) | **Transformada**: os ids `eixo-1…6` passam para as seis células. Headlines ("Sucessão decidida em vida…") e os 3 diferenciais por eixo saem da home (vivem/viverão nas internas); `.np-spot` e `stages()` da rede saem. |
| `#npGrid` 21 `a.np-card` | **Removido**; links preservados em `.eixos-item__index`. Salvar `href, data-icone, data-busca, título, descrição, tags` em `docs/dmc/home-redesign/catalogo-cards.json` antes do corte. |
| `.np-closer` (WhatsApp) | **Removida**; o flutuante e a seção 10 já cobrem. |
| `data-assunto="EN"` | Mantido nos CTAs secundários **das internas**; na home só o `select#cf-eixo` e o `?assunto=` continuam. |

**Impacto nos testes.** `home.spec.js` é reescrito segundo `contratos-qa` §2.2 (6 artigos visíveis,
ícones distintos, `/#eixo-N` em viewport via `:target`, Tab percorre 6 CTAs + índices, destinos 200 com
`np-pillar-*` coerente). `rotas.spec` l. 187/189 continua passando (ids existem). 

---

### 04 · Por que o Complexo DMC? — `#porque`

**Objetivo.** Seis razões de método, verificáveis, lidas em menos de um minuto, respondendo às objeções
("é advocacia?", "vou pagar por opinião?", "quem garante os números?", "IA no meu contrato?").
Tecnologia entra aqui como item 06 com o único link da seção (`pages/tecnologia.html`).

**Fundo/transição — o "mosaico" editorial.** A seção é `--surface-0`, mas à direita um **painel de papel
sangra até a borda da tela**: visto em sequência com 03, o papel que ocupava toda a largura "recolhe"
para 7 colunas e o grafite entra pela esquerda. É um só contraste grande, não seis caixinhas alternadas.

```html
<section class="dmc-section porque" id="porque" aria-labelledby="porque-title">
  <div class="dmc-wrap porque-grid">
    <div class="porque-intro dmc-sec-head dmc-reveal">
      <p class="dmc-overline">Por quê</p>
      <h2 class="dmc-h1" id="porque-title">Por que o <em>Complexo DMC</em>?</h2>
      <p class="dmc-lead">[copy] Seis razões que se verificam no método, não em adjetivos.</p>
    </div>
    <div class="porque-panel dmc-on-paper">
      <ol class="porque-list">
        <li class="porque-item dmc-reveal" style="--i:0">
          <h3 class="dmc-h4">Seis eixos, uma só governança</h3>
          <p>Uma sucessão pode envolver holding, tributo e matrícula ao mesmo tempo; aqui os seis eixos trabalham o mesmo caso sob um só plano e um só responsável pela coordenação.</p>
        </li>
        … itens 2–5 (texto de referencia-e-mensagens §4) …
        <li class="porque-item dmc-reveal" style="--i:5">
          <h3 class="dmc-h4">Tecnologia a serviço dos eixos, com revisão de quem responde</h3>
          <p>Automação documental, dossiês organizados e painel do caso apoiam os seis eixos; nenhum documento sai sem a revisão do parceiro habilitado que responde por ele.</p>
          <a class="dmc-btn dmc-btn--link" href="pages/tecnologia.html">Ver a tecnologia aplicada aos seis eixos</a>
        </li>
      </ol>
    </div>
  </div>
</section>
```

**Layout.**
| Largura | Grade |
|---|---|
| 1440/1024 | `.porque { overflow-x: clip; }` `.porque-grid` 12 col, `align-items:start`. `.porque-intro` `1 / span 4`, `position: sticky; top: calc(var(--header-h-lg) + var(--space-6))`. `.porque-panel` `6 / span 7`, `position:relative; padding: var(--space-9) var(--space-8) var(--space-9) var(--space-9)`; `::before { content:''; position:absolute; inset:0 -100vw 0 0; background: var(--surface-paper); z-index:-1 }` (sangria à direita; o `overflow-x: clip` na seção impede que conte no `scrollWidth`). O `padding-block` da seção vai a 0 e o painel assume `padding-block: var(--space-section)` para o papel encostar nas bordas superior e inferior da seção. |
| 768 | 8 col: intro `1 / span 8` (não sticky), painel `1 / span 8` com `margin-inline: calc(-1 * var(--gutter))` e `padding-inline: var(--gutter)` — papel de borda a borda abaixo do texto. |
| 390/320 | 1 col; mesmo comportamento do 768. |

**Lista** (`.porque-list`): sem marcador nativo; `counter-reset: porque`. Cada `.porque-item`:
`border-top: 1px solid var(--color-line-ink)`, `padding-block: var(--space-6)`, grade
`grid-template-columns: 3rem 1fr` (≥640) com `::before { content: counter(porque, decimal-leading-zero) }`
em Hanken 500 14 tabular `--color-gold-deep` (a seção é da casa; sem cor de eixo). Em <640 o número
sobe para cima do título (`grid-template-columns: 1fr`). `h3.dmc-h4` `--text-ink-1`; `p` corpo
`--text-ink-2`, `max-width: 34rem`. O item 6 tem o único link, `.dmc-btn--link` com `margin-top: var(--space-3)`.
Último item com `border-bottom`.

**Estados.** Nenhum interativo além do link. Reveal com stagger 0…5 (teto 400 ms).

**O que absorve.** `.fatos` (já na Casa) e `#results` Ad-tech inteiro (3 cards saem; o conteúdo pendente
do CEO não é reescrito — item 6 usa só o que `fatos.md` §3 autoriza).

---

### 05 · Verticais de Negócios — `#verticais` (alta prioridade)

**Objetivo.** Falar a língua do setor. Cinco painéis, cada um começa pela decisão do setor e leva à
página real do eixo que a conduz. É a seção "fotográfica" da página — uma vez só, grande, sem overlay.

**Fundo/transição.** Papel (`.dmc-on-paper`); corte com o preto de 04. Sobre papel, as mídias
procedurais (escuras, cinematográficas) viram **molduras** — como fotografias impressas em revista.
Texto nunca sobre a imagem: legibilidade e zero véu.

**Composição.** Tese curta + fólio de cinco filas numeradas, mídia e texto lado a lado, alternando o
lado da mídia (ímpar: mídia à esquerda; par: à direita). Mesma anatomia nas cinco.

```html
<section class="dmc-section dmc-on-paper verticais home-media" id="verticais" aria-labelledby="verticais-title">
  <div class="dmc-wrap">
    <div class="dmc-sec-head dmc-reveal">
      <p class="dmc-overline">Verticais de negócio</p>
      <h2 class="dmc-h1" id="verticais-title">[copy] Setores diferentes, <em>a mesma pergunta</em>: qual é a decisão a tomar e que eixos ela envolve.</h2>
    </div>
  </div>
  <ol class="verticais-list">
    <li>
      <article class="verticais-item dmc-reveal" aria-labelledby="vert-1-titulo">
        <figure class="verticais-item__media">
          <picture>
            <source type="image/avif" media="(min-width:768px)" srcset="assets/images/home/vertical-construcao-1400.avif 1400w, assets/images/home/vertical-construcao-1000.avif 1000w" sizes="(min-width:1024px) 50vw, 100vw">
            <source type="image/webp" media="(min-width:768px)" srcset="…-1400.webp 1400w, …-1000.webp 1000w" sizes="…">
            <source type="image/avif" srcset="assets/images/home/vertical-construcao-m-800.avif">
            <img src="assets/images/home/vertical-construcao-1000.webp" width="1400" height="933" loading="lazy" decoding="async" alt="">
          </picture>
        </figure>
        <div class="verticais-item__body">
          <p class="verticais-item__num">01 <span>Construção civil e incorporação</span></p>
          <h3 class="verticais-item__title" id="vert-1-titulo">Do terreno à matrícula de <em>cada unidade</em>.</h3>
          <p class="verticais-item__text">Due diligence do terreno, incorporação, venda e registro coordenados em um só plano, com atos lavrados por cartórios conveniados e revisão de parceiros habilitados.</p>
          <a class="dmc-btn dmc-btn--secondary" href="pages/consultoria-imobiliaria.html">Avaliar um terreno ou empreendimento<svg …seta…></svg></a>
        </div>
      </article>
    </li>
    … 02 Agronegócio · 03 Empresas familiares e holdings · 04 Grupos empresariais · 05 Investidores e estrutura patrimonial …
  </ol>
</section>
```

Conteúdo (headline, frase, CTA, destino) = `referencia-e-mensagens.md` §3, linhas 1–5, com duas correções
obrigatórias de `fatos.md`: o painel 3 (famílias) aponta para `pages/holding-patrimonial.html` (não para
`planejamento-sucessorio-empresarial`, que é 301); o painel 5 usa "estrutura do patrimônio", nunca "gestão
patrimonial" no sentido CVM — rótulo do número: "Investidores e estrutura patrimonial". Painel 2 (agro)
só com o texto genérico de terras/matrícula/sucessão já autorizado; `[CEO pend.]` registrado no HTML em comentário.
`alt=""` nas mídias (decorativas: o texto ao lado carrega o significado), ou `alt` descritivo curto se o
content-director preferir — nunca repetir a headline.

**Layout.**
| Largura | `.verticais-list` | `.verticais-item` |
|---|---|---|
| 1440 | container `--container-wide` (1440) + gutter; `row-gap: var(--space-11)` (96) | 12 col, `align-items:center`; ímpar: mídia `1 / span 6`, corpo `8 / span 5`; par: mídia `7 / span 6`, corpo `1 / span 5` (`order` por `:nth-child(even)`). Mídia `aspect-ratio: var(--ratio-panel)` (3:2) → ≈ 696×464 px. Corpo `padding-block: var(--space-4)`. |
| 1024 | idem, `row-gap: var(--space-10)` | mídia `1 / span 6` ≈ 470×313; corpo `7 / span 6` |
| 768 | 8 col, `row-gap: var(--space-9)` | mídia `1 / span 8`, `aspect-ratio: var(--ratio-panel-m)` (16:10), `max-height: 28rem`; corpo `1 / span 8` em pilha (sem alternância) |
| 390/320 | 1 col, `row-gap: var(--space-8)` | mídia 16:10 de borda a borda do `.dmc-wrap` (não sangrar: 320 sem overflow); corpo abaixo |

**Mídia** (`.verticais-item__media`): `margin:0; overflow:hidden; border-radius: var(--radius-2)` (4 px);
`background: var(--surface-2)` reservado (evita flash branco antes do lazy); `img { width:100%; height:100%; object-fit:cover; display:block }`.
Sem borda, sem sombra, sem hover.

**Corpo.** `__num`: Hanken 500 14 tabular `--color-gold-deep` + `span` nome do segmento em `--text-ink-3`
(mesmo tamanho, peso 400, `margin-left:.6em`). `__title`: Newsreader 300, `font-size: var(--fs-h2)`,
`line-height: var(--lh-heading)`, `text-wrap: balance`, `max-width: 14ch`, `--text-ink-1`, `<em>` itálico.
`__text`: corpo, `--text-ink-2`, `max-width: 32rem`. CTA `.dmc-btn--secondary` (sobre papel: fio
`--color-control-ink`, texto tinta) — único botão de borda da página fora do contato; visível sem hover.

**Estados.** Reveal por item (mídia e corpo juntos). CTA: hover/focus do `.dmc-btn`.

**Plano de mídia (video-3d-producer)** — `assets/images/home/vertical-<slug>-{1400,1000}.{avif,webp}` e
`vertical-<slug>-m-800.{avif,webp}`; `slug` ∈ `construcao, terras, familia, grupos, patrimonio`.
- **Técnica**: cena WebGL (Three.js local, offline) ou Canvas 2D procedural renderizada pelo Chromium do
  Playwright a 2800×1867 (3:2) e 1600×1000 (16:10), downscale com ffmpeg (`-vf scale=…:flags=lanczos`)
  para AVIF (`libaom-av1 -crf 30 -cpu-used 4`) e WebP (`-q 78`). Grão: ruído monocromático 2–3 % aplicado
  no render (não em CSS). Orçamento: ≤ 90 KB AVIF / ≤ 120 KB WebP em 1400; ≤ 50 KB em 800.
- **Linguagem comum às cinco** (para "ler igual"): câmera 35 mm equivalente, ¾ elevado (~22°), horizonte
  no terço superior; luz-chave quente (3200 K, intensidade baixa) de cima-esquerda, preenchimento frio
  quase nulo, fundo em névoa `--surface-1`→`--surface-0`; materiais foscos em `--color-graphite-700/600`;
  **ouro** (`#d6b069`) só em arestas finas ou um único plano pequeno (≤ 3 % da área); nenhum brilho,
  bloom, lens-flare ou texto; nenhuma figura humana; a parte inferior direita sempre mais escura (onde
  nada será escrito, mas mantém o peso visual para o lado do texto).
- **Cenas**:
  1. `construcao` — massas prismáticas de concreto em obra: lajes empilhadas, grelha de formas, uma
     grua apenas sugerida por uma linha; vista próxima, não skyline (o herói já é cidade).
  2. `terras` — relevo baixo em malha de contorno (heightmap procedural) com divisas de parcelas como
     linhas finas claras; sol rasante; sem plantação literal, sem animais, sem verde saturado.
  3. `familia` — sequência de pórticos de pedra em recuo (enfileirados, cinco profundidades) — a ideia
     de gerações; piso com reflexo fosco.
  4. `grupos` — conjunto de volumes separados sobre um plano escuro ligados por hairlines douradas
     (estrutura societária como massa construída); vista mais alta que as outras (~30°).
  5. `patrimonio` — estratos: lâminas translúcidas empilhadas com arestas em ouro, leve desalinhamento
     entre camadas; a mais sóbria das cinco.
- **Placeholder enquanto não há render**: `figure` com `background: linear-gradient(160deg, var(--surface-3), var(--surface-1))`
  + ruído SVG inline (`feTurbulence baseFrequency .8`, opacidade .06) — já parece final; a `<picture>` entra
  depois sem mudar layout (o `aspect-ratio` reserva o espaço: CLS 0).
- Fotografia real: decisão do CEO; se vier, mesma proporção, mesmo tratamento (dessaturação parcial,
  sombras elevadas para `--surface-1`), mesmos nomes de arquivo.

---

### 06 · Presença Nacional — `#presenca`

**Objetivo.** "De São Paulo, conectados aos desafios do Brasil." Dizer sede e alcance **sem** afirmar
cobertura, praças ou atendimento presencial fora de SP (`[CEO pend. 1]`). É onde a camada "inovação
digital" da direção C ganha a sua única cena animada.

**Fundo/transição.** `--surface-0`, corte com o papel de 05. 35 % texto / 65 % visual.

```html
<section class="dmc-section presenca home-media" id="presenca" aria-labelledby="presenca-title">
  <div class="dmc-wrap presenca-grid">
    <div class="presenca-text dmc-sec-head dmc-reveal">
      <p class="dmc-overline">Presença</p>
      <h2 class="dmc-h1" id="presenca-title">De São Paulo, <em>conectados aos desafios</em> do Brasil.</h2>
      <p class="dmc-lead">[copy · CEO] Sede em São Paulo; casos conduzidos com parceiros habilitados e cartórios conveniados onde o ativo ou a empresa estão — o alcance depende do eixo, do escopo e da rede de parceiros, e é definido na conversa inicial.</p>
      <p class="presenca-sede dmc-small">Rua Riachuelo, 231 · São Paulo, SP</p>
    </div>
    <figure class="presenca-mapa" data-rede="brasil" data-motion="still" aria-labelledby="presenca-mapa-desc">
      <svg class="presenca-mapa__svg" viewBox="0 0 1000 1000" role="img" aria-labelledby="presenca-mapa-desc">
        <title id="presenca-mapa-desc">Mapa do Brasil com a sede do Complexo DMC em São Paulo</title>
        <g class="presenca-mapa__estados"> 27 × <path data-uf="AC" d="…"/> </g>
        <g class="presenca-mapa__capitais"> 26 × <circle data-uf="…" r="2.5"/> + <circle data-uf="SP" class="is-sede" cx="650" cy="719" r="5"/> </g>
      </svg>
      <!-- canvas injetado por JS só em ≥768 e sem reduce -->
    </figure>
  </div>
</section>
```

**Layout.**
| Largura | Grade |
|---|---|
| 1440/1024 | `.presenca-grid` 12 col, `align-items:center`: texto `1 / span 4`; mapa `6 / span 7`, `aspect-ratio: var(--ratio-map)`, `max-width: 42rem`, `justify-self:end` (≈ 672 px em 1440; ≈ 560 em 1024) |
| 768 | 8 col: texto `1 / span 8`; mapa `2 / span 6`, `max-width: 34rem`, `margin-top: var(--space-8)` |
| 390/320 | 1 col; mapa `width:100%`, `max-width: 22rem`, centrado (`margin-inline:auto`) |

**SVG (fallback e base).** `brasil-estados.svg` re-simplificado para ≤ 12 KB (Douglas-Peucker 2–2.5 px),
**inline** no HTML (precisa de classes e `data-uf`; 12 KB é aceitável). Estilo via CSS, não atributos:
`path { fill: var(--surface-2); stroke: var(--color-line-strong); stroke-width: .8; vector-effect: non-scaling-stroke }`;
`path[data-uf="SP"] { fill: var(--surface-3) }`; capitais `fill: var(--text-3)`; `.is-sede { fill: var(--color-gold) }` +
anel `circle r=12 stroke gold .35`. Rótulo "São Paulo" como `<text>` Hanken 11 `--text-2` à direita do nó.
Nada de legenda, nada de número.

**Canvas (desktop).** Nova função `brasil(fig)` em `rede-neural.js` (reutiliza `rng/triplet/rgba/whenNear/size/loop/start/stop`),
montada por `whenNear(fig,'300px 0px')` **somente** se `matchMedia('(min-width:768px)').matches` **e**
`prefers-reduced-motion: no-preference`; caso contrário o SVG é tudo (`data-motion="still"`). Com canvas:
`data-motion="running"`, `is-live` (o SVG permanece visível abaixo — o canvas desenha só a camada de conexões).
Conteúdo do canvas: arestas SP→26 capitais em quadráticas com curvatura leve (controle deslocado 6–10 %
perpendicular, "arcos de voo"), `alpha` base .10 `--text-3`, pulsos ouro saindo de SP (máx. 4 simultâneos,
intervalo 900 ms, duração 1.6–2.4 s, fade senoidal), halo de SP respirando (`lerp`), paralaxe de cursor
`0.02·z` só nos nós (mapa parado); `pointermove` realça a aresta mais próxima. ≤ 30 fps acima de 1024
basta (não é 60-fps material); DPR ≤ 2. `aria-hidden` no canvas. Em `reduce` a mudança ao vivo chama
`still()` (um quadro com arestas, sem pulsos) e marca `data-motion="still"`.

**Motion.** Reveal no texto; o mapa aparece por fade (`.dmc-reveal` na `figure`) antes do canvas montar.

**Testes.** `movimento.spec` l. 49-66 → bloco §2.4 de `contratos-qa` (390: 0 canvas; 1440+reduce:
`still` e ≤ 1 rAF/s; 1440 controle: `running`; 27 UFs; regex de cobertura = 0 hits; 0 requisições externas).

---

### 07 · Inteligência & Publicações — `#publicacoes`

**Objetivo.** Mostrar que a casa pensa e escreve, **sem inventar**: hoje há uma única publicação real
(`pages/por-que-urgente.html`). A seção nasce como destaque editorial + estrutura declarada para as próximas.

**Fundo/transição.** Continua o bloco escuro de 06, separada por `.dmc-section--rule` (fio).

```html
<section class="dmc-section dmc-section--rule publi" id="publicacoes" aria-labelledby="publi-title">
  <div class="dmc-wrap publi-grid">
    <div class="dmc-sec-head dmc-reveal publi-head">
      <p class="dmc-overline">Inteligência</p>
      <h2 class="dmc-h1" id="publi-title">[copy] Análises para <em>quem decide</em>.</h2>
    </div>
    <article class="publi-destaque publicacao np-pillar-patrimonial dmc-reveal" style="--i:1">
      <p class="publi-destaque__meta dmc-small"><span class="publi-destaque__eixo">E1 · Patrimonial e Sucessório</span> <time datetime="2026-10-17">Revisado em 17 out 2026</time></p>
      <h3 class="publi-destaque__title">Por que planejar a sucessão em vida</h3>
      <p class="publi-destaque__text">[copy ≤ 200] Legítima, inventário e ITCMD progressivo (EC 132/2023): o que muda quando a decisão é tomada antes.</p>
      <a class="dmc-btn dmc-btn--link" href="pages/por-que-urgente.html">Ler a análise</a>
    </article>
    <aside class="publi-proximas dmc-reveal publicacoes__vazio" style="--i:2" aria-label="Próximas publicações">
      <p class="dmc-overline">Em preparação</p>
      <ul class="publi-proximas__list">
        <li><span class="publi-proximas__slot"></span><span class="dmc-small">Próxima análise</span></li>
        <li><span class="publi-proximas__slot"></span><span class="dmc-small">Próxima análise</span></li>
      </ul>
      <a class="dmc-btn dmc-btn--link" href="#newsletter">Receber quando publicarmos</a>
    </aside>
  </div>
</section>
```

**Layout.**
| Largura | Grade |
|---|---|
| 1440/1024 | `.publi-grid` 12 col: cabeçalho `1 / span 12` (margem padrão); destaque `1 / span 7`; `aside` `9 / span 4`, `border-left: 1px solid var(--color-line)`, `padding-left: var(--space-6)` |
| 768 | 8 col: destaque `1 / span 8`; aside `1 / span 8`, `border-left:0; border-top: 1px solid var(--color-line); padding: var(--space-6) 0 0` |
| 390/320 | 1 col, idem 768 |

**Destaque.** `__meta`: Hanken 14; `__eixo` em `rgb(var(--np-accent))` (E1 petróleo sobre escuro, 8,7:1);
`time` em `--text-3`. `__title`: Newsreader 300 `--fs-h2`, `max-width: 18ch`. `__text`: `--text-2`,
`max-width: 32rem`. Link 44 px. **Sem imagem** (não há; e um placeholder aqui pareceria capa falsa).
**Aside.** dois `li` com `border-top: 1px solid var(--color-line)`, `padding-block: var(--space-5)`;
`__slot` = traço de 2 rem × 1 px em `--color-line-strong` (um "em branco" tipográfico), texto `--text-3`.
Sem título fictício, sem data. O regex de QA (`lorem|título do artigo|em breve`) não encontra nada; "Em
preparação" está dentro de `.publicacoes__vazio`.

**Quando houver 3 publicações reais**: o `aside` morre e o grid vira 3 colunas de `article.publicacao`
(`4 / span 4` cada), mesma anatomia do destaque (meta, título Newsreader `--fs-h3`, 1 linha, link),
separadas por `border-top`. A data é sempre a real (`<time datetime>` ISO ≤ hoje).

**Decisão a registrar**: o rótulo "Revisado em" + data de commit só se o CEO aceitar expor data;
caso contrário remover `time` e manter o resto (o teste de QA deve tolerar ausência de `time`).

---

### 08 · Como conduzimos (Método) — `#treinamentos`

**Objetivo.** Mostrar o método em quatro etapas (o que o cliente recebe em cada uma) e mencionar o único
programa de formação documentado. Substitui seis cursos sem lastro.

**Fundo/transição.** Papel; corte com o escuro de 07. **O id `treinamentos` é mantido** (28 rodapés +
navbar). Decisão pendente para DECISIONS.md: rótulo "Treinamentos" no navbar/rodapés → "Método" ou
"Como conduzimos" (edição de `navbar.js` + 28 arquivos; não resolver aqui).

```html
<section class="dmc-section dmc-on-paper metodo" id="treinamentos" aria-labelledby="metodo-title">
  <div class="dmc-wrap">
    <div class="dmc-sec-head dmc-reveal">
      <p class="dmc-overline">Método</p>
      <h2 class="dmc-h1" id="metodo-title">[copy] Como <em>conduzimos</em> uma decisão.</h2>
      <p class="dmc-lead">[copy] A conversa inicial leva a um diagnóstico; o diagnóstico, a uma proposta com escopo, etapas e entregas.</p>
    </div>
    <ol class="metodo-etapas">
      <li class="metodo-etapa dmc-reveal" style="--i:0"><h3 class="dmc-h4">Diagnóstico</h3><p>[copy ≤ 140]</p></li>
      <li class="metodo-etapa dmc-reveal" style="--i:1"><h3 class="dmc-h4">Cenários e decisão</h3><p>…</p></li>
      <li class="metodo-etapa dmc-reveal" style="--i:2"><h3 class="dmc-h4">Estruturação e implementação</h3><p>…</p></li>
      <li class="metodo-etapa dmc-reveal" style="--i:3"><h3 class="dmc-h4">Acompanhamento e revisão</h3><p>…</p></li>
    </ol>
    <div class="metodo-formacao dmc-reveal" style="--i:4">
      <p class="dmc-overline">Formação</p>
      <p class="metodo-formacao__txt"><strong>Arquitetura Patrimonial Estratégica</strong> — programa de formação institucional, 42 horas, online.</p>
      <a class="dmc-btn dmc-btn--link" href="plataforma-ead/">Conhecer a plataforma</a>
    </div>
  </div>
</section>
```

**Layout.**
| Largura | `.metodo-etapas` | `.metodo-formacao` |
|---|---|---|
| 1440/1024 | `repeat(4, 1fr)`, `column-gap: var(--grid-gap)`; cada `li` `border-top: 1px solid var(--color-line-ink)`, `padding: var(--space-6) 0`, `counter` 01–04 em `--color-gold-deep` acima do título | `margin-top: var(--space-10)`; grade `grid-template-columns: 8rem 1fr auto`, `align-items: baseline`, `border-top: 1px solid var(--color-line-ink)`, `padding-top: var(--space-6)` |
| 768 | `repeat(2, 1fr)` | `grid-template-columns: 1fr`, gap `--space-3` |
| 390/320 | 1 col | idem |

Sem preço, sem modalidade além de "online", sem os outros 3 cursos do seed e sem os 6 atuais (`[CEO pend. 3]`).
`.treinos__*` de `styles.css` morre.

**Testes.** `contratos-qa` §2.6: todo nome de programa citado existe no catálogo; 0 links `login.html?curso=`.

---

### 09 · Newsletter — `#newsletter`

**Objetivo.** Captura leve para quem não está pronto para o contato. Três campos, consentimento, descadastro,
erro honesto.

**Fundo/transição.** Papel, continuando 08, separada por fio tinta (`.dmc-section--rule` com a cor ajustada).

```html
<section class="dmc-section dmc-on-paper dmc-section--rule news" id="newsletter" aria-labelledby="news-title">
  <div class="dmc-wrap news-grid">
    <div class="dmc-sec-head news-head">
      <p class="dmc-overline">Newsletter</p>
      <h2 class="dmc-h1" id="news-title">[copy] Análises para quem decide, <em>no seu e-mail</em>.</h2>
      <p class="dmc-lead">[copy] Sem periodicidade prometida: escrevemos quando há algo a dizer. Descadastro em um clique, em qualquer mensagem.</p>
    </div>
    <form class="news-form" id="newsletterForm" action="/api/newsletter" method="post" data-origem="home" novalidate>
      <div class="news-form__fields">
        <div class="form-field"><label for="nl-nome">Nome</label><input id="nl-nome" name="nome" autocomplete="name" required></div>
        <div class="form-field"><label for="nl-email">E-mail</label><input id="nl-email" name="email" type="email" autocomplete="email" required></div>
        <div class="form-field"><label for="nl-empresa">Empresa <span class="dmc-small">(opcional)</span></label><input id="nl-empresa" name="empresa" autocomplete="organization"></div>
      </div>
      <div class="form-hp" aria-hidden="true"><label for="nl-website">Site</label><input id="nl-website" name="website" tabindex="-1" autocomplete="off"></div>
      <div class="form-consent"><input type="checkbox" id="nl-consentimento" name="consentimento" required><label for="nl-consentimento">Autorizo o Complexo DMC a usar meu nome e e-mail para enviar análises, nos termos da LGPD e da <a href="pages/politica-de-privacidade.html">Política de Privacidade</a>. Posso me descadastrar a qualquer momento.</label></div>
      <button class="dmc-btn dmc-btn--primary" type="submit">Quero receber análises</button>
      <p class="form-message" id="nlMessage" role="status" aria-live="polite"></p>
    </form>
  </div>
</section>
```

**Layout.**
| Largura | Grade |
|---|---|
| 1440/1024 | `.news-grid` 12 col: cabeçalho `1 / span 5`; form `7 / span 6`. `__fields` = `repeat(3, 1fr)` gap `--grid-gap`; consentimento e botão abaixo; botão à esquerda |
| 768 | 8 col: cabeçalho `1 / span 8`; form `1 / span 8`; `__fields` `repeat(2, 1fr)` (empresa sozinha na 2.ª linha) |
| 390/320 | 1 col; campos em pilha, botão `width:100%` |

Reaproveita `.form-field`, `.form-consent`, `.form-hp`, `.form-message` e os estados `is-enviando/is-sucesso/is-erro`
de `styles.css` 978-1142 (hoje escopados a `.contato`? — se estiverem, o frontend desescopa para `.form-*`
ou duplica mínimo em `home.css`; **não** criar um segundo visual de campo). Campo 48 px, borda
`--color-control-ink`, raio 2. Erro por campo com `aria-describedby` e ícone (padrão do commit `54e66ab`).
JS: `initNewsletter` em `main.js` espelhando `initForm` (`aria-busy`, sucesso só com `{ok:true}` 2xx;
em erro de rede/503 a mensagem diz "não conseguimos registrar agora; tente de novo em instantes" e **nunca**
"cadastrado"). Backend: `blueprint-newsletter.md` (fora deste escopo). Sem JS: `POST` nativo funciona
(urlencoded aceito pelo blueprint).

**Testes.** `newsletter.spec.js` novo (`contratos-qa` §3.1), `a11y` cobre os nomes acessíveis.

---

### Vídeo — `#video` (mantido)
Entre 09 e 10, como hoje; fundo escuro; nada muda além de herdar o `.dmc-reveal` já existente.

### 10 · CTA final + Contato — `#contact` (mantido)
Formulário, ids, `#formMessage`, `select#cf-eixo` intactos. Título pode receber `[copy]` "Comece pela
decisão a tomar." (troca de texto, não de estrutura). Pendência: link da política no `#cf-consentimento`
(PROGRESS l. 72). WhatsApp fica como linha secundária, como hoje.

### Rodapé — `#rodape` (mantido)
Lista "A casa" continua linkando `#features` e `#treinamentos`; "Soluções" → `#features`.

---

## 3. Mapa de estilos — `styles.css` (1192 l.) → `styles.css` + `home.css`

| Linhas atuais | Bloco | Destino |
|---|---|---|
| 17-52 | base (body, links, seleção) | **fica** |
| 53-65 | fio de acento `::before` (`.casa__tab, .np-axes a, .np-card`) | **migra** para `home.css` como `.eixos-item::before` (único uso novo) |
| 67-168 | herói | **fica, intocado** |
| 170-197 | `.fatos` | **morre** |
| 199-334 | `.casa*` (grid, rede, tabs, foco) | **morre**; `home.css` escreve `.casa-grid/.casa-tese/.casa-ficha` (~40 l.) |
| 336-449 | `.np-section`, `.np-cases-band`, busca | **morre** |
| 451-500 | `.np-axes` | **morre** |
| 502-633 | `.np-flags/.np-flag*/.np-spot*` | **morre** |
| 635-680 | `.np-grid/.np-card` | **morre** |
| 682-694 | `.np-closer` | **morre** |
| 696-727 | `.treinos*` | **morre** (o padrão de lista numerada renasce como `.metodo-etapas`) |
| 729-788 | `.adtech*` | **morre** |
| 791-976 | `.page-video__*` + escopo `#video` | **fica** (bloco triplicado; não tocar) |
| 978-1142 | contato + `.form-*` | **fica**; se `.form-*` estiver escopado a `.contato`, generalizar o seletor |
| 1144-1192 | flutuantes + reduce | **fica** |

Estimativa: `styles.css` 49 KB → ~27 KB; `home.css` novo ≈ 11–13 KB (gz ≈ 3,5 KB) com as sete seções;
somados ≤ 35 KB (alvo do inventário). Subir `styles.css?v=c5`, `main.js?v=c4`, `rede-neural.js?v=3`.

`main.js`: morre `initBusca` (383-488) e `sortearDestaque`; `initEixos` morre inteiro (não há tablist);
nasce `initNewsletter` (~60 l.). `rede-neural.js`: `casa()`, `controlador()`, `stageNet/stages` deixam de
ser chamados na home (podem ficar no módulo até a limpeza; marcar `@deprecated`); nasce `brasil()`.

Procedimento de corte: o do inventário §5 (listar seletores → grep no HTML novo → cortar por bloco →
Coverage em 390 e 1440 → suíte completa).

---

## 4. Artefatos a gerar antes do corte
- `docs/dmc/home-redesign/catalogo-cards.json`: 21 cards (`eixo, href, titulo, descricao, data-icone, data-busca, tags`)
  + as 6 falas de "Qual é a sua situação?" + as 6 headlines dos painéis + os 18 diferenciais. É o
  repositório canônico do catálogo depois que o HTML da home deixa de sê-lo.
- `docs/dmc/home-redesign/icones-eixos.svg` (sprite com `symbol#ico-e1…e6`) desenhado a partir da tabela
  de 03, para o frontend colar inline (24 e 32 px testados).
- `docs/dmc/home-redesign/geo/brasil-estados-min.svg` (≤ 12 KB, `data-uf`, classes).
- Renders de 05 (`video-3d-producer`) nos nomes/pesos do plano de mídia; até lá, placeholder CSS.
- `docs/dmc/design-preview.html`: amostras de `.eixos-item`, `.porque-panel`, `.verticais-item`, `.presenca-mapa`
  em 390 e 1440 antes de tocar o `index.html`.

---

## 5. Orçamento de performance (não regredir: 99/100/100/100, LCP 1,80 s, CLS 0,003, TBT 0)

| Item | Limite |
|---|---|
| Nada novo antes do LCP | `home.css` é o único request a mais no caminho crítico (≤ 4 KB gz); sem fonte nova; sem SVG inline acima do herói |
| HTML | 104 KB → ≤ 70 KB (saem 21 cards, 6 painéis, 6 casos, SVGs de rede); o mapa inline custa ≤ 12 KB |
| Imagens de 05 | 5 × ≤ 90 KB AVIF (1400) / ≤ 50 KB (800 mobile); todas `loading="lazy" decoding="async" width height`; nenhuma acima de 250 KB em qualquer formato |
| JS | `main.js` −120 l.; `rede-neural.js` +~150 l. (`brasil()`), montado só por IO a 300 px e só ≥768 sem reduce; zero libs |
| Canvas | ≤ 30 fps, DPR ≤ 2, 0 trabalho fora da viewport; mobile 0 canvas |
| CLS | `aspect-ratio` em todas as mídias e no mapa; `text-wrap: balance` nos H2; headlines de 05 com `max-width` em `ch` |
| Peso total | ≤ 1,5 MB sem o vídeo do herói |
| Metas | Perf ≥ 95 (gate 90), A11y/BP/SEO ≥ 95, LCP ≤ 1,8 s, CLS ≤ 0,01, TBT ≤ 50 ms, 0 overflow 320–1920, 0 erro de console |

---

## 6. Resumo do impacto nos testes (detalhe em `contratos-qa.md`)

| Spec | Efeito |
|---|---|
| `home.spec.js` | reescrever (grid 3×2: §2.2 de contratos-qa) |
| `movimento.spec.js` l. 49-66 | migrar de `#conheca` para `#presenca` (§2.4) |
| `navegacao`, `a11y`, `console`, `viewports`, `seo`, `rotas`, `formulario` | mantêm; âncoras `#features/#treinamentos/#contact/#eixo-N` preservadas |
| novos | `newsletter.spec.js`, `home-secoes.spec.js` (ordem dos ids: `hero, conheca, features, porque, verticais, presenca, publicacoes, treinamentos, newsletter, video, contact`) |
| conformidade | 0 números, 0 "garant", 0 "%", atos privativos sempre com "parceiros habilitados/cartórios conveniados" na mesma seção (02, 04, 05) |

---

## 7. Pendências do CEO citadas nesta spec (não resolvidas aqui)
1. Cobertura fora de SP → texto de 06 usa só a fórmula aprovada.
2. Nomes "Blindagem Patrimonial" (índice E1) / "Blindagem Contratual", "Defesa Empresarial" (índice E6) → mantidos até decisão.
3. Cursos → 08 cita só o programa documentado.
4. Ad-tech (tribunais/API/PCD) → fora de 04.
5. Parceiros nomeados → só por categoria.
6. Rótulo "Treinamentos" no navbar/rodapés vs. seção "Método".
7. Expor data de revisão em 07.
8. Fotografia real para 05 → placeholder procedural até lá.
9. Página de Auditoria Empresarial (índice E4 com 1 link).
10. ID do vídeo da home.
