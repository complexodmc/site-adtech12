# Nova home — Especificação C · "conversion-first"

Diretor de arte C · 2026-10-17 · direção aprovada C (Híbrido Executivo), não reaberta.
Insumos: `fatos.md`, `inventario-frontend.md`, `referencia-e-mensagens.md`, `contratos-qa.md`,
`blueprint-newsletter.md`, `DESIGN-SYSTEM.md`, capturas `qa/2026-10-17/home/*.png`.
Tudo que o frontend precisa está aqui; o que depende do CEO está marcado `[CEO]` e tem
um comportamento padrão definido para não bloquear a implementação.

---

## 0. Tese e regras que valem para a página inteira

**Tese de conversão.** O visitante chega com um problema, não com o nome de um eixo. A home
precisa (1) deixá-lo entrar pela situação dele em menos de uma rolagem depois do herói,
(2) dar razões verificáveis para confiar antes de pedir contato, (3) falar a língua do setor
dele, e (4) oferecer uma saída leve (newsletter) para quem ainda não vai preencher o
formulário. Cada seção tem **um** CTA primário e, no máximo, um link secundário.

**Funil da página** (ordem do DOM = ordem de leitura):

| # | id | Papel no funil | CTA primário | Fundo |
|---|---|---|---|---|
| 01 | `#hero` | atenção | "Converse com nossos especialistas" → `#contact` (existe) | escuro |
| 02 | `#conheca` | identidade em 1 frase | link "Sobre o Complexo DMC" → `pages/sobre.html` | escuro `--surface-0` |
| 03 | `#features` | **entrada por problema → eixo → solução** | "Explorar soluções" ×6 (página-mãe do eixo) | papel |
| 04 | `#porque` | confiança | nenhum botão; 1 link textual → `pages/tecnologia.html` | mosaico escuro/claro |
| 05 | `#verticais` | relevância setorial | 1 CTA nomeado por painel (página real) | escuro `--surface-1` |
| 06 | `#presenca` | alcance sem número | link "Descrever a situação" → `#contact` | escuro `--surface-0` |
| 07 | `#publicacoes` | autoridade editorial | 1 leitura real; link "Receber as próximas análises" → `#newsletter` | papel |
| 08 | `#treinamentos` | método (como será trabalhar) | link "Conhecer a plataforma" → `plataforma-ead/` | papel `--color-paper-2` |
| 09 | `#newsletter` | captura leve | "Quero receber análises" (POST) | escuro `--surface-1` |
| — | `#video` | prova em vídeo (regra da casa) | — | escuro `--surface-0` (existe) |
| 10 | `#contact` + `#rodape` | conversão | "Enviar mensagem" (existe) | papel (existe) |

Ritmo de fundos: escuro · escuro · **papel** · mosaico · escuro · escuro · **papel** · papel-2 ·
escuro · escuro · **papel**. Transições sem degradê: a mudança é no `background` da `section`;
entre duas seções escuras consecutivas usa-se `.dmc-section--rule` (fio 1px). Entre papel e
papel-2 (07→08) não há fio: a diferença de tom basta.

**Canal de conversão único.** O formulário `#contact` com `select#cf-eixo` é o primário em toda
a página. Todo CTA que leve a `#contact` carrega `data-assunto="EN"` quando há eixo. O WhatsApp
flutuante continua existindo, mas (spec JS, §12) só aparece depois que `#porque` entrou na
viewport e recebe `?text=` com o eixo do último `[data-assunto]` clicado — nunca aparece antes
de o visitante ter lido uma razão para confiar.

**Regras de forma** (DESIGN-SYSTEM §1, §8): caixa só para mídia e para campo de formulário;
fio de 1px, numeração `01–06` no acento e respiro fazem a separação. Nenhum chip, pílula, selo,
badge, degradê em texto ou brilho. Cor do eixo só em número, ícone, fio ativo e link.

**Arquivo CSS.** `assets/css/home.css?v=1`, carregado depois de `styles.css?v=c5`, um bloco por
seção (`/* ==== 03 · EIXOS ==== */`), mobile-first, breakpoints só 640 / 768 / 1024 / 1440.
Custom properties locais no seletor raiz da seção (ex.: `.verticais { --ratio-panel: 16/10 }`).
`styles.css` enxugado conforme §13. `tokens.css` e `components.css` **não mudam**.

**Tipografia** (sem classe nova de escala): `.dmc-overline` → `.dmc-h1` (H2 de seção, Newsreader
300, `<em>` itálico numa palavra) → `.dmc-lead`. Títulos de item em `.dmc-h3` (Hanken 600) ou
Newsreader `--fs-h3` quando o item é editorial (verticais, publicações). Corpo `--fs-body`.
Legendas `.dmc-small`. Nenhum H2 com mais de 2 linhas em 1440 (≤ 36 ch) para não re-quebrar
na troca de fonte (CLS).

**Breakpoints e grid** (DESIGN-SYSTEM §4): 4 col até 767 · 8 col 768–1023 · 12 col ≥1024;
`--grid-gap` 16→32; `.dmc-wrap` 1240; `--container-wide` (1440) só em 05 e 06 para a mídia.
Em 320 tudo em 1 coluna, `min-width: 0` em todo item de grid, `overflow-wrap: anywhere` nos
títulos; nenhum elemento com largura fixa > 288 px.

---

## 01 · Herói `#hero` — não mexer

Mantido byte a byte (HTML, CSS 67-168, main.js 17-55). Única alteração permitida, **no texto
do link secundário**: "Conheça os seis eixos" continua apontando para `#features` — é
coerente com a seção 03 nova, que agora abre pela situação do cliente. Se o content-director
preferir "Comece pela sua situação", o `href` continua `#features`.

---

## 02 · A Casa `#conheca`

**Objetivo.** Dizer em uma frase o que a DMC é (consultoria em negócios, São Paulo, seis eixos,
uma governança) e tirar da frente tudo o que atrasa a entrada por problema: a tablist de seis
eixos sai daqui (vai para 03), o botão de contato duplicado sai (já está no herói).

**Fundo.** `--surface-0`, sem fio em cima (o herói termina em preto). Fio `.dmc-section--rule`
**não** usar; a transição para 03 (papel) é o corte claro.

**Layout.**
- 1440/1024: grid 12 col; texto `grid-column: 1 / span 5`; rede `7 / span 6`, `aspect-ratio: 1`,
  `max-width: 34rem`, alinhada ao topo (`align-self: start`), `position: sticky` **removido**
  (a seção fica curta; sticky não faz mais sentido). Altura mínima da seção: conteúdo + padding.
- 768: 8 col; texto `1 / span 8`, rede `2 / span 6` abaixo, `max-width: 28rem`, centrada.
- 390/320: 1 col; texto, depois rede com `aspect-ratio: 1`, `max-width: 100%`.
- Padding `--space-section`; gap `--space-8`.

**Conteúdo.** `p.dmc-overline` "Sobre" · `h2.dmc-h1#casa-title` "Decisões complexas pedem
<em>visão integrada</em>." · `p.dmc-lead` (mensagem central aprovada: "O Complexo DMC integra
seis eixos de especialidade para decisões empresariais, patrimoniais e operacionais de alta
complexidade.") · 1 parágrafo `--fs-body` `--text-2` com natureza e sede: "Consultoria em
negócios, com sede em São Paulo. Contratos, pareceres, escrituração, auditoria e atos notariais
ficam com sociedades de advogados parceiras, contadores e auditores habilitados e cartórios
conveniados; o Complexo DMC coordena o plano e responde pela consultoria." · `a.dmc-btn
dmc-btn--link` "Sobre o Complexo DMC" → `pages/sobre.html`. Nada mais.

**Componentes.** Reutiliza `.casa`, `.casa__grid`, `.casa__text`, `.casa__rede[data-rede="casa"]`
+ `svg.casa__fallback`. **Removidos**: `.casa__nav`, `.casa__eixos` (tablist), `.casa__foco*`,
`.casa__acoes`. A rede neural (`rede-neural.js casa()`) continua: `controlador()` devolve `null`
sem a lista e o canvas segue funcionando com rótulos "E1…E6" — o JS precisa de um ajuste
mínimo para **ler os nomes curtos de `#features`** (`article[data-eixo] [data-curto]`) em vez
da `.casa__eixos` (spec JS §12). O hover no nó do canvas continua realçando; o clique no nó
passa a **rolar até `#eixo-N`** (`scrollIntoView` suave, respeita reduced-motion) — a rede vira
um índice visual da seção seguinte, reforçando o funil.

**Motion.** Canvas como hoje (IO, 30 fps <768, `still()` em reduce). Texto sem reveal (é a
primeira seção após o LCP).

**A11y.** `section[aria-labelledby="casa-title"]`; rede `aria-hidden="true"`. Contraste:
`--text-2` sobre `--surface-0` 10,4:1.

**Testes.** `movimento.spec` l. 53-61 continua válido (`#conheca canvas` parado em reduce)
até migrar para o mapa; adicionar "`#conheca` tem `<h2>` e `aria-labelledby`" (contratos §2.1).

---

## 03 · Seis Eixos `#features` — entrada por problema

**Objetivo.** Em uma tela: "qual é a sua situação?" (6 frases na voz do cliente, uma por eixo,
cada uma já apontando a solução), seguido do grid 3×2 dos eixos com um único CTA cada. É a
seção que mais converte hoje (fala do cliente) movida para onde é lida: imediatamente após a
identidade da casa.

**Fundo.** `.dmc-on-paper` (`--surface-paper`). Transição 02→03: corte seco preto → papel.

### 03a · Situações `.eixos-situacoes`
- `h2.dmc-h1#features-title` "Seis eixos, <em>uma só governança</em>." · overline "Soluções" ·
  `p.dmc-lead` "Comece pela sua situação, não pelo catálogo."
- `h3.dmc-h3` visualmente discreto (`--fs-small`, overline-style, `--text-ink-3`) "Qual é a
  sua situação?" seguido de `ol.eixos-situacoes__lista` com **6 `li`**, cada um `a.eixos-situacao`
  com `class="np-pillar-<slug>"`:
  1. E1 "Tenho imóveis no meu nome, filhos, e nada organizado para o dia em que eu faltar." →
     `pages/holding-patrimonial.html`
  2. E2 "Recebi uma autuação da Receita e não sei se o meu regime tributário ainda faz
     sentido." → `pages/planejamento-tributario.html`
  3. E3 "Vou comprar um terreno e não sei se a matrícula está limpa." →
     `pages/consultoria-imobiliaria.html`
  4. E4 "O banco pediu balanço revisado e os números da empresa não se explicam." →
     `pages/contabilidade.html` (reescrita: a frase atual "minha contabilidade não acompanha"
     posiciona a DMC como escritório contábil — referencia §2.3 item 8)
  5. E5 "Ganhei a ação, mas o devedor sumiu com o dinheiro e a execução não anda." →
     `pages/recuperacao-ativos.html`
  6. E6 "Tenho reclamatórias repetidas com os mesmos pedidos e não sei onde o passivo começa."
     → `solucoes/consultoria-trabalhista/ciclo-fechado.html`
  A frase "Alguém da família faleceu e o inventário não sai do lugar" (E3 duplicada) sai da
  home; continua em `atos-notariais.html`.
- Anatomia do `a.eixos-situacao`: `span.eixos-situacao__num` "E1" (Hanken 600, 12px, cor
  `rgb(var(--np-accent-deep))`) · `q.eixos-situacao__fala` (Newsreader 300 itálico, `--fs-h4`,
  `--text-ink-1`) · `span.eixos-situacao__sol` (Hanken 500 14px, `--text-ink-2`, "→ Holding
  Patrimonial"). Separador: `border-top: 1px var(--color-line-ink)`. Padding-block `--space-5`.
  Hover/focus: `__sol` ganha cor `--np-accent-deep` e seta `translateX(4px)` 240 ms; fio
  superior vira 2px no acento com `scaleX(0→1)` 400 ms (padrão `.np-card::before`).
- Layout: 1440/1024 → 2 colunas × 3 linhas (`grid-template-columns: repeat(2, 1fr)`,
  `column-gap: var(--space-10)`); 768 → 2 colunas; ≤640 → 1 coluna. Alvo mínimo 44 px.
- A busca livre `#npAskForm`/`#npAsk` **sai** (sem resultados mandava para WhatsApp genérico;
  tira foco do formulário qualificado). Quem não se reconhece nas seis tem o grid logo abaixo e
  o `select#cf-eixo` com "Ainda não sei".

### 03b · Grid 3×2 `.eixos-grid`
- `ol.eixos-grid` (lista ordenada: a ordem E1→E6 é semântica) com 6 `li` →
  `article.eixo.np-pillar-<slug>#eixo-N[data-eixo="N"][aria-labelledby="eixo-N-titulo"]`.
- Anatomia do `article.eixo` (de cima para baixo, `display:grid; gap: var(--space-4)`):
  1. `.eixo__topo`: `svg.eixo__icone[aria-hidden]` 32×32 (§ícones) + `span.eixo__num`
     "E1" (`--fs-overline`, caixa-alta, tracking .16em, `rgb(var(--np-accent-deep))`), na
     mesma linha, ícone à esquerda.
  2. `h3.eixo__nome.dmc-h3#eixo-N-titulo` — nome oficial completo (`data-curto` com o nome
     curto para o canvas de 02). Hanken 600 `--fs-h3`, `text-wrap: balance`, ≤ 2 linhas.
  3. `p.eixo__desc` — descrição de `fatos.md §2` (≤160 car.), `--fs-body`, `--text-ink-2`,
     `max-width: 34ch`.
  4. `a.eixo__cta.dmc-btn.dmc-btn--link` "Explorar soluções" → página-mãe (fatos §1). Seta
     SVG 16px. É o único controle do card. Cor do texto `--text-ink-1`; sublinhado e seta no
     `--np-accent-deep`.
  5. `a.eixo__count` **não existe** — o número de soluções e os links de cada uma ficam no
     índice (03c), não no card.
- Separação sem caixa: `border-top: 1px solid var(--color-line-ink)` em cada `article`,
  `padding-top: var(--space-6)`; o fio vira 2px no acento (`::before`, `scaleX`) em `:hover`
  e `:focus-within`. Sem fundo, sem sombra, sem raio.
- `:target` (chegada por `/#eixo-N`): o fio de acento fica em `scaleX(1)` e o ícone recebe
  `color: rgb(var(--np-accent-deep))` — âncora visível sem JS. `scroll-margin-top:
  calc(var(--header-h-lg) + var(--space-6))`.
- Layout: 1440/1024 → `grid-template-columns: repeat(3, minmax(0,1fr))`, `column-gap:
  var(--space-10)`, `row-gap: var(--space-10)`; 768 → 2 col, gap `--space-8`; ≤640 → 1 col,
  gap `--space-7`. Altura mínima do card: nenhuma (o fio nivela). Em 320 o título quebra em 3
  linhas no máximo (`--fs-h3` = 22 px).
- Ordem dos focos por Tab: 6 situações → 6 CTAs "Explorar soluções" → índice. Sem tablist,
  sem `role=tab`, sem `hidden`: **tudo visível ao mesmo tempo**, igual sem JS.

### 03c · Índice de soluções `.eixos-indice`
Preserva na home **todos** os links de solução (BRIEF: catálogo hardcoded no index) sem os 18
cards. É um índice editorial de texto, não um grid de cards.
- `nav.eixos-indice[aria-label="Todas as soluções por eixo"]` com `h3.dmc-small` "Todas as
  soluções" e **6 `ul`** (uma por eixo, `class="np-pillar-<slug>"`), cada uma com `li` de
  cabeçalho (código + nome curto, `--np-accent-deep`) e `li > a` por solução (14px, `--text-ink-2`,
  sublinhado só no hover, alvo 44px de altura por `padding-block`).
- Conteúdo (20 links, fatos §1): E1 Planejamento Sucessório, Holding Patrimonial, Blindagem
  Patrimonial `[CEO nome]`, Proteção Patrimonial, Sucessão Testamentária · E2 Planejamento
  Tributário, Compliance & Governança · E3 Consultoria Imobiliária, Jurídico Imobiliário,
  Jurídico Vendas, Registro Imobiliário, Atos Notariais · E4 Auditoria Empresarial e Contábil
  (`contabilidade.html`) — o card "Auditoria Empresarial → #contact" **sai** (`[CEO pend. 10]`)
  · E5 Recuperação de Ativos · E6 Ciclo Fechado, Blindagem Contratual `[CEO nome]`, Conformidade
  Psicossocial, Decisão Assistida, Câmara de Acordos, Quitação Anual, Defesa Empresarial `[CEO]`.
  **Não linkar** `planejamento-sucessorio-empresarial` (301).
- Layout: ≥1024 → 6 colunas (`grid-template-columns: repeat(6, minmax(0,1fr))`); 768 → 3 col;
  ≤640 → 2 col; 320 → 1 col. `margin-top: var(--space-block)`, fio `border-top` 1px acima.
- Antes de apagar `#npGrid`, exportar `docs/dmc/home-redesign/catalogo-cards.json` (href,
  data-icone, data-busca, título, descrição, tags) — inventário §4 03d.

### Ícones dos seis eixos (inline, exclusivos)
Regras comuns: `viewBox="0 0 24 24"`, `fill="none" stroke="currentColor" stroke-width="1.5"
stroke-linecap="round" stroke-linejoin="round"`, `aria-hidden="true" focusable="false"`,
renderizados a 24 px (índice, mega-menu futuro) e 32 px (grid). Geometria em grade de 2 px,
margem de segurança 2 px, nenhum traço paralelo a menos de 3 px de outro (legibilidade a 24).
Monocromáticos; a cor vem do `color` do pai (`--np-accent-deep` sobre papel, `--np-accent`
sobre escuro). Cada um tem silhueta distinta: ramos, pilha, selo, sobreposição, percurso, ciclo.

| Eixo | Nome do ícone | Geometria (coordenadas no viewBox 24) |
|---|---|---|
| E1 Patrimonial e Sucessório | **Ramos** (transmissão entre gerações) | Círculo r 2,5 em (12, 5). Haste vertical de (12, 7,5) a (12, 11). Barra horizontal de (6, 11) a (18, 11). Dois ramos verticais de (6, 11) e (18, 11) até y 15,5. Dois círculos r 2,5 em (6, 18) e (18, 18). Nenhum preenchimento. Lê-se como árvore de três nós. |
| E2 Tributário, Fiscal e Corporativo | **Estrutura** (sociedade e seus níveis) | Retângulo 6×4 centrado em (12, 5) (x 9–15, y 3–7). Haste de (12, 7) a (12, 10). Barra de (5, 10) a (19, 10). Três hastes de y 10 a y 13 em x 5, 12, 19. Três retângulos 4×4 com topo em y 13: x 3–7, 10–14, 17–21 (y 13–17). Abaixo, uma linha-base de (3, 21) a (21, 21). Só formas retas: é a única peça só com ângulos retos. |
| E3 Direito Notarial e Imobiliário | **Matrícula com selo** (ato lavrado) | Folha: polígono de (6, 3) → (14,5, 3) → (18, 6,5) → (18, 21) → (6, 21) fechado; dobra: polilinha (14,5, 3) → (14,5, 6,5) → (18, 6,5). Três linhas de texto de x 9 a x 15 em y 10, 13 e 16 (a de y 16 vai só até x 12). Selo: círculo r 3 centrado em (16, 17) com um círculo interno r 1 (ponto). O selo sobrepõe a borda direita da folha de propósito. |
| E4 Auditoria Empresarial e Contábil | **Sobreposição** (quem produz × quem lê) | Quadrado A: x 3–15, y 3–15. Quadrado B: x 9–21, y 9–21. A interseção (x 9–15, y 9–15) recebe uma diagonal de (9, 15) a (15, 9) — a "leitura" que atravessa o que os dois têm em comum. Só três traços; silhueta clara a 24 px. |
| E5 Recuperação de Ativos | **Percurso** (do título ao patrimônio) | Círculo r 2,5 em (5, 6) (o título). Caminho ortogonal: (7,5, 6) → (12, 6) → (12, 14) → (15, 14). Ponta de seta em (15, 14): (13, 12) e (13, 16) para (15, 14). Hexágono regular r 3,5 centrado em (18,5, 17,5) (o ativo), vértices a 0°/60°…, com um ponto central r 0,75 preenchido. |
| E6 Consultoria Trabalhista | **Ciclo fechado** (exercício que se encerra) | Quatro arcos de um círculo r 8 centrado em (12, 12), cada arco de 70°, começando em 10°, 100°, 190°, 280° (gaps de 20° nas diagonais). No gap de 10° (lado direito, acima da horizontal) uma ponta de seta de 3 px apontando no sentido horário. No centro, um traço horizontal de (9, 12) a (15, 12) e um traço vertical curto de (12, 9,5) a (12, 12), formando um "T" invertido: a marca de fechamento do exercício. |

Entregar os 6 como `<symbol id="ico-eixo-N">` num `<svg hidden>` no topo do `<main>` e usar
`<use href="#ico-eixo-N">` (um só desenho por eixo, reutilizado por grid, índice e mega-menu
futuro). Peso total ≈ 1,6 KB.

**Motion.** Sem reveal nos cards (conteúdo crítico do funil). Hover: fio `scaleX` 400 ms, seta
240 ms. `:target` sem animação.

**A11y.** `section#features[aria-labelledby="features-title"]`; `ol` reais; cada `article`
com `aria-labelledby`. Contraste: `--np-accent-deep` sobre papel ≥ 4,6:1 (tabela do
DESIGN-SYSTEM) — usado em texto pequeno só para o código "E1" em 600 (passa AA) e para
sublinhado/seta (não textual). `--text-ink-2` 7,7:1.

**Testes.** Substitui `home.spec.js` por `eixos.spec.js` (contratos §2.2): 6 artigos visíveis,
0 `role=tab`, 6 ícones distintos (`innerHTML` ou `use[href]` distintos), `/#eixo-N` em
viewport, CTAs → 200 e `body` da página de destino com o mesmo `np-pillar-*`. Novo: 6
`a.eixos-situacao` → 200; índice com 20 links → 200 e em sitemap; nenhuma `href` com
`planejamento-sucessorio-empresarial`.

---

## 04 · Por que o Complexo DMC? `#porque`

**Objetivo.** Seis razões verificáveis (referencia §4) lidas em menos de 20 s, respondendo às
objeções "isso não é advocacia/contabilidade?", "vou pagar por opinião?", "quem garante os
números?", "IA no meu contrato?". Sem número, sem adjetivo. Absorve a faixa `.fatos` e a seção
Ad-tech `#results`, que morrem.

**Fundo e transição.** Mosaico de 6 células alternando `--surface-1` (escuro) e `--surface-paper`
(claro) em xadrez; a seção em si tem `background: var(--surface-0)`. Vem do papel de 03: a
primeira linha do mosaico começa com célula **clara** à esquerda para o olho não sentir degrau.
Sai para 05 (escuro `--surface-1`): a última célula da direita é escura.

**Layout.**
- Cabeçalho `.dmc-sec-head` sobre escuro: overline "Por que o Complexo DMC?" · H2 "Seis razões
  que se verificam <em>no método</em>, não em adjetivos."
- `ol.porque-mosaico`: 1440/1024 → `grid-template-columns: repeat(3, minmax(0,1fr))`, 2 linhas,
  **sem gap** (células encostadas: é um mosaico, o fio é a mudança de tom); padrão de tom:
  linha 1 = claro/escuro/claro, linha 2 = escuro/claro/escuro. Cada célula `min-height: 20rem`
  em 1440 (18rem em 1024), `padding: var(--space-8)`.
- 768 → 2 col × 3 linhas; tom alternado em xadrez (claro/escuro, escuro/claro, claro/escuro).
  `min-height: 16rem`.
- 390/320 → 1 col; alternância claro/escuro por item; `min-height: auto`, `padding:
  var(--space-7) var(--gutter)`. A seção **sangra** até as bordas no mobile (`.porque-mosaico`
  fora do `.dmc-wrap`, com `padding-inline: var(--gutter)` nas células) para o xadrez ler como
  faixa, não como caixas.
- Anatomia da célula `li.porque-item` (`.porque-item--paper` recebe as regras de `.dmc-on-paper`
  por composição de classe: `class="porque-item dmc-on-paper"`):
  `span.porque-item__num` "01" (Hanken 600 `--fs-overline`, ouro `--color-gold` sobre escuro /
  `--color-gold-deep` sobre papel) · `h3.porque-item__titulo` (Newsreader 300 `--fs-h3`, ≤ 2
  linhas) · `p.porque-item__texto` (`--fs-body`, cor 2 do tema, `max-width: 32ch`). Só o item
  06 tem um `a.dmc-btn.dmc-btn--link` "Ver a tecnologia aplicada aos seis eixos" →
  `pages/tecnologia.html`.
- Conteúdo: os 6 itens de referencia §4, nessa ordem (1 governança · 2 cenários antes do ato ·
  3 consultoria e ato privativo, cada um no seu lugar · 4 quem lê não é quem produz · 5
  indicadores que o cliente vê · 6 tecnologia com revisão de quem responde). Item 3 é o que
  carrega a linha de conformidade: nomes só por categoria `[CEO pend. 5]`.

**Motion.** Reveal por célula (`.dmc-reveal` + `transition-delay: calc(var(--stagger) * var(--i))`,
`--i` 0–5 no HTML), uma vez; em reduce, tudo visível.

**A11y.** `section[aria-labelledby="porque-title"]`; `ol` real. Contraste: ouro `#d6b069` sobre
`--surface-1` 9,0:1; `--color-gold-deep` `#82602e` sobre papel 4,6:1 (passa AA para 12 px/600);
texto 2 ≥ 7,7:1 nos dois temas.

**Testes.** `home-secoes.spec`: 6 `li`, texto sem `\d+\s*%|garant|clientes|anos de`; link único
→ `pages/tecnologia.html` 200; axe por seção em 1440 e 390 (xadrez é onde o contraste erra).

---

## 05 · Verticais de Negócios `#verticais` (alta prioridade)

**Objetivo.** O visitante se reconhece pelo setor e clica em uma ação nomeada que leva a uma
página real. CTA visível sem hover (mobile primeiro). Cinco painéis; credores e empregadores já
têm eixo próprio (E5/E6) e entram pelas situações de 03.

**Fundo.** `--surface-1`, `.dmc-section--rule` no topo (04 termina escuro). Sai para 06
(`--surface-0`) com fio.

**Cabeçalho.** overline "Verticais de negócios" · H2 "Setores diferentes, <em>a mesma
pergunta</em>: qual é a decisão a tomar e que eixos ela envolve." · lead "Cada painel começa
pela situação do seu negócio e leva à página do eixo que a conduz."

**Grade `.verticais-grid`** (dentro de `.dmc-wrap` alargado: `max-width: var(--container-wide)`):
- 1440: 12 col, `gap: var(--grid-gap)`. Painel 1 (construção civil, o mais documentado do site)
  ocupa `1 / span 12` em proporção **21:9** (altura ≈ 560 px a 1344 de largura; `min-height:
  28rem`); painéis 2–5 em 2 linhas × 2 colunas, `span 6` cada, proporção **16:10**.
- 1024: mesmo esquema; painel 1 `aspect-ratio: 2 / 1`; 2–5 `16/10`.
- 768: 8 col; painel 1 `span 8` 16:10; 2–5 `span 4` 4:5 (dois por linha).
- 390/320: 1 col; todos **4:5**, `width: 100%`; gap `--space-5`. Sangria lateral de `--gutter`
  (não full-bleed: mantém o respiro editorial).
- Anatomia de `article.vertical.verticais__item` (QA pede `article.vertical`): `a.vertical__link`
  envolve tudo (um só alvo, `display:grid`, `position:relative`, `border-radius: var(--radius-1)`
  4 px, `overflow:hidden`). Dentro:
  - `picture.vertical__media` → `source[type=image/avif]` + `source[type=image/webp]` com
    `media="(min-width: 768px)"` para a variante larga e, sem media, a 4:5; `img` com
    `width/height` da variante base, `loading="lazy"`, `decoding="async"`, `alt=""`
    (decorativa: o texto do painel está no link).
  - `.vertical__veil`: véu inferior `linear-gradient(180deg, rgba(11,12,14,0) 35%,
    rgba(11,12,14,.82) 100%)` — **único degradê permitido na home**, só como textura de mídia
    para AA do texto (DESIGN-SYSTEM §1 item 4 + inventário §2).
  - `.vertical__texto` ancorado embaixo (`align-self: end`, `padding: var(--space-7)` /
    `--space-5` em mobile): `span.vertical__num` "01" (Hanken 600 12px, ouro) ·
    `span.vertical__setor` (Hanken 500 14px caixa-alta tracking .12em, `--text-2`) ·
    `h3.vertical__headline` (Newsreader 300, `--fs-h2` no painel 1 / `--fs-h3` nos demais, ≤ 2
    linhas, `max-width: 22ch`) · `p.vertical__frase` (`--fs-body`, `--text-2`, `max-width:
    48ch`; **oculta em ≤640** via `display:none` para o painel caber em 4:5 sem cortar) ·
    `span.vertical__cta` com aparência de `.dmc-btn--secondary` (fio, seta) — é `span` porque
    já está dentro do `a`; `min-height: 44px`.
- Conteúdo (referencia §3 + destinos de fatos §4, sem destino repetido):

| # | Setor | Headline | Frase | CTA → destino |
|---|---|---|---|---|
| 01 | Construção civil e incorporação | Do terreno à matrícula de cada unidade. | Due diligence do terreno, incorporação, venda e registro coordenados em um só plano, com atos lavrados por cartórios conveniados e revisão de parceiros habilitados. | "Avaliar um terreno ou empreendimento" → `pages/consultoria-imobiliaria.html` |
| 02 | Empresas familiares e holdings | Quem herda as quotas e quem assume o comando. | Holding, acordo de sócios e protocolo familiar desenhados juntos, com a carga tributária de cada cenário calculada no diagnóstico. | "Conversar sobre a sucessão da família" → `pages/planejamento-sucessorio.html` |
| 03 | Grupos empresariais | Regime, estrutura e integridade decididos com fundamento. | Comparação documentada de regimes com os números da própria empresa, reorganização societária e programa de integridade sob uma só governança. | "Pedir o diagnóstico tributário" → `pages/planejamento-tributario.html` |
| 04 | Investidores e estrutura patrimonial | Imóveis e participações sob uma estrutura que se explica. | Centralização em holding, governança e tributação avaliadas caso a caso, com a leitura independente dos números de cada participação. | "Conversar sobre a estrutura do patrimônio" → `pages/holding-patrimonial.html` |
| 05 | Famílias que detêm imóveis e terras `[CEO: agro]` | A terra em ordem na matrícula e na sucessão. | Retificação de área, regularização fundiária e transmissão das terras entre gerações tratadas em conjunto, antes de qualquer escritura. | "Conversar sobre as terras e a sucessão" → `pages/registro-imobiliario.html` |

  Rótulo do painel 05: o `span.vertical__setor` usa o texto genérico até o CEO aprovar
  "Agronegócio" (fatos §4). Nenhuma palavra "rural" em holding; nada de ITR/CAR.
  "Investidores e **gestão** patrimonial" do brief vira "estrutura patrimonial" (DMC não é
  gestora — fatos §4).

**Plano de mídia (video-3d-producer).** Cinco cenas procedurais, mesma câmera e mesma luz para
lerem como uma série; já parecem finais, e fotografia licenciada (se vier `[CEO pend. 12]`)
entra na mesma moldura com o mesmo véu.
- Técnica: cena WebGL (Three.js local, só no pipeline de render, **nunca no site**) ou Canvas 2D
  renderizada pelo Chromium do Playwright em `deviceScaleFactor: 1`, PNG sem perda → ffmpeg
  `libaom-av1 -crf 30 -still-picture 1` (AVIF) e `libwebp -q 78` (WebP). Nomes:
  `assets/images/verticais/<slug>-{wide,tall}.{avif,webp}`.
- Dimensões: painel 1 `wide` 2016×864 (21:9) + `tall` 960×1200 (4:5); painéis 2–5 `wide`
  1600×1000 (16:10) + `tall` 960×1200. Orçamento: wide ≤ 120 KB AVIF (≤ 160 WebP); tall ≤ 60 KB.
  Ruído de filme 2–3 % (gera textura e mascara banding), vinheta periférica .25.
- Paleta: fundo `--surface-1`→`--surface-3`, volumes grafite `#24272a`–`#3a3e43`, uma luz
  quente lateral (temperatura 3200 K, intensidade baixa) com arestas em ouro `#d6b069` a ≤ 5 %
  da área; nenhum neon, nenhum azul. Horizonte sempre no terço inferior para o texto assentar
  no véu. Profundidade de campo leve (blur 2–4 px no fundo).
- Atmosferas:
  1. Construção/incorporação: volumes prismáticos extrudados em malha urbana vista a 30°, um
     volume central em destaque com linhas de planta (grade 1 px, opacidade .18) sobrepostas
     no chão; sensação de maquete de incorporação à noite.
  2. Famílias/holdings: colunata em perspectiva (pórtico), pisos de pedra escura, luz entrando
     por uma lateral; no fundo, três nós ligados por fio ouro (árvore discreta, ecoando o ícone E1).
  3. Grupos empresariais: cubos aninhados em três escalas (holding → operacionais) sobre plano
     refletor fosco, arestas ouro só no cubo maior.
  4. Investidores/estrutura patrimonial: planos de vidro fosco empilhados (lâminas de um
     balanço) com uma lâmina deslocada iluminada; reflexo ouro no canto.
  5. Terras: terreno em malha topográfica (curvas de nível 1 px, opacidade .22) com relevo
     suave, horizonte ao entardecer em grafite quente; dois marcos de georreferência como
     nós (sem texto).
- Poster/fallback: o próprio WebP é o fallback. Sem vídeo nesta seção.

**Motion.** Reveal por painel (stagger 80 ms). Hover/focus no `a`: `img` `scale(1.03)` 700 ms
`--ease-out` (transform só), `vertical__cta` seta `translateX(4px)`; em reduce, só a cor da
borda do CTA muda. `will-change` **não** usar.

**A11y.** `section[aria-labelledby="verticais-title"]`; cada `article` com `aria-labelledby`
no `h3`; o nome acessível do link = headline + CTA (ambos dentro do `a`). Contraste do texto
sobre o véu: medir pelo pior caso (`rgba(11,12,14,.82)` sobre cinza médio `#6a6e74` da cena =
fundo efetivo ≈ `#1c1d20`) → `--text-1` 15:1, `--text-2` 8,9:1. Foco: `outline` ouro 2 px
`offset -4px` por dentro do painel (não cortar pelo `overflow:hidden`).

**Testes.** Contratos §2.3: 5 links distintos → 200 e em sitemap; `picture` com avif+webp,
`width/height`, lazy; `src` só da origem; 0 overflow em 320; `alt=""` com texto no `a`;
nenhuma imagem > 250 KB.

---

## 06 · Presença Nacional `#presenca`

**Objetivo.** Dizer "de São Paulo, ligados a casos onde o ativo ou a empresa estão" sem afirmar
cobertura (`[CEO pend. 1]`). 35 % texto / 65 % visual; o visual é o mapa real com a rede.

**Fundo.** `--surface-0`, fio `.dmc-section--rule` no topo (05 é `--surface-1`).

**Layout.**
- 1440/1024: 12 col; texto `1 / span 4` (`align-self: center`); figura `6 / span 7`,
  `aspect-ratio: 1`, `max-width: 40rem`, `justify-self: end`.
- 768: 8 col; texto `1 / span 8` acima; figura `2 / span 6` abaixo, `max-width: 30rem`.
- 390/320: 1 col; figura `width: 100%`, `aspect-ratio: 1` — o viewBox é quadrado, então nunca
  há overflow; `max-height: 70vh` por segurança.
- Texto: overline "Presença" · H2 "De São Paulo, <em>conectados</em> aos desafios do Brasil."
  · lead "Sede em São Paulo. Casos conduzidos com sociedades de advogados parceiras, contadores
  e auditores habilitados e cartórios conveniados onde o ativo ou a empresa estão; o alcance
  de cada eixo é definido na conversa inicial." · `address.presenca__sede` (não itálico): "Rua
  Riachuelo, 231 · São Paulo, SP" (`--fs-small`, `--text-3`) · `a.dmc-btn.dmc-btn--link`
  "Descrever a situação" → `#contact`. Nenhum número, nenhuma lista de praças.
- Figura `figure.presenca__mapa[data-motion="still"]`:
  1. `svg.presenca__svg[role="img"][aria-labelledby="presenca-mapa-titulo"]` inline,
     `viewBox="0 0 1000 1000"`, gerado de `geo/brasil.json` **re-simplificado para DP 2,5 px**
     (meta ≤ 12 KB inline), 27 `path[data-uf]` em `g.presenca__ufs` com `fill: var(--surface-2)`
     `stroke: var(--color-line-strong)` `stroke-width: .8` (vector-effect non-scaling);
     `path[data-uf="SP"].is-sede` com `fill: var(--surface-3)` e `stroke: rgb(var(--color-gold-rgb))`
     `stroke-width: 1.2`. `g.presenca__nos`: 27 `circle[data-uf]` r 2,5 `fill: var(--text-3)`,
     SP r 5 ouro + anel r 11 `stroke` ouro `.35`. `g.presenca__linhas`: 26 quadráticas SP →
     capital (curvatura: ponto de controle deslocado 8 % da distância, perpendicular, sempre
     para o lado norte) `stroke` ouro `.14`. `<title id="presenca-mapa-titulo">` "Mapa do
     Brasil com a sede do Complexo DMC em São Paulo." Rótulo "SP" em `<text>` Hanken 11 px ao
     lado do nó (único texto).
  2. `canvas` criado pelo JS **só** se `matchMedia('(min-width:768px)')` **e** `prefers-reduced-motion:
     no-preference`; `position:absolute; inset:0`, `aria-hidden`; a figura marca
     `data-motion="running"`. Em <768 ou reduce: **só o SVG** (brief: fallback estático mobile).
- Mapa mobile = SVG, nítido em qualquer DPR, zero CPU.

**Plano de mídia (video-3d-producer / frontend).** Não há imagem rasterizada: o mapa é SVG +
Canvas 2D (inventário §6). O que o produtor entrega:
- `assets/images/mapa/brasil-ufs.min.svg` (DP 2,5, 27 `path`, atributos `data-uf`,
  `id` removido) para o frontend colar inline; e `brasil-capitais.json` enxuto `{UF:[x,y]}`
  já presente em `brasil.json` → copiar para `assets/js/data/brasil-capitais.js` como `export
  const CAPITAIS` (evita `fetch` e o CSP `connect-src`).
- Camada 3D "discreta": no canvas, três planos de profundidade (`z` .2 mapa parado, `z` .6
  linhas, `z` 1 nós) com paralaxe de cursor `0.035 * z` (função `place()` existente), pulsos
  ouro saindo de SP por uma aresta a cada 900–1400 ms (máx. 5 simultâneos), halo em SP
  (lerp .1), DPR ≤ 2. É "3D" por paralaxe, não por WebGL — custo zero de biblioteca e
  `toDataURL` funciona para o teste de reduce.
- Poster para redes/OG (opcional): render 1200×630 do SVG sobre `--surface-0` com os pulsos
  congelados, `assets/images/og-presenca.webp` ≤ 80 KB.

**Motion.** `whenNear(fig, fn, '300px 0px')`; rAF só com seção visível e aba ativa; paralaxe
com lerp .06; em reduce `still()` um quadro (nós + linhas, sem pulsos) e `data-motion="still"`.
Reveal do texto, sem reveal na figura (SVG é o fallback crítico).

**A11y.** `section[aria-labelledby="presenca-title"]`; SVG `role="img"` com título; canvas
`aria-hidden`. Contraste: texto 1/2/3 sobre `--surface-0` (17,7 / 10,4 / 6,8).

**Testes.** Contratos §2.4: 390 → 0 canvas; 1440 + reduce → `data-motion="still"` e ≤ 1 rAF/s;
1440 controle → `running`; 27 `path[data-uf]`, 1 `.is-sede`; texto sem
`/\d+\s*(estados|cidades|municípios|clientes|%)/i`; 0 requisições fora da origem.
`movimento.spec` l. 49-66 migra para cá.

---

## 07 · Inteligência & Publicações `#publicacoes`

**Objetivo.** Mostrar que a casa escreve sobre o que faz, **só com o que existe** (1 conteúdo
real: `pages/por-que-urgente.html`), e converter o interesse editorial em inscrição (link para
09). Nunca título ou data inventados.

**Fundo.** `.dmc-on-paper`. Transição 06→07: corte escuro → papel.

**Layout.**
- Cabeçalho: overline "Inteligência" · H2 "Análises para <em>quem decide</em>." · lead "Textos
  curtos sobre as decisões que os seis eixos conduzem, revisados por quem responde por cada
  ato."
- `ul.publi-lista`: 1440/1024 → 3 col (`repeat(3, minmax(0,1fr))`, gap `--space-8`); 768 → 3 col
  com gap `--space-6` (cabe: 14–16 px de texto); ≤640 → 1 col. Cada `li` com `border-top` 1 px
  `--color-line-ink`, `padding-top: var(--space-5)`, `min-height: 14rem` em ≥768.
- `article.publicacao` (o real): `p.publi-meta` (`--fs-small`, `--text-ink-3`): "E1 ·
  Patrimonial e Sucessório" (código no `--np-accent-deep` via `np-pillar-patrimonial`) +
  `time[datetime="2026-10-17"]` "Revisado em 17 out 2026" (data de revisão real; se o CEO não
  quiser data, remover o `time` — nunca "publicado em") · `h3.publi-titulo` (Newsreader 300
  `--fs-h3`) "Por que planejar a sucessão em vida" · `p.publi-resumo` (`--fs-body`, `--text-ink-2`,
  3 linhas máx., `-webkit-line-clamp: 3`): "Legítima, inventário e ITCMD progressivo (EC
  132/2023): o que muda quando a sucessão é decidida antes." · `a.dmc-btn.dmc-btn--link` "Ler
  a análise" → `pages/por-que-urgente.html` `[CEO: slug "urgente"]`.
- Dois `li.publi-vazio` (estrutura preparada, **sem título, sem data, sem "em breve"**):
  `p.publi-meta` "Próxima análise" (`--text-ink-3`) · bloco `div.publi-vazio__linhas` com três
  fios de 1 px `--color-line-ink` espaçados `--space-4` (a "pauta" vazia; decorativo,
  `aria-hidden`) · `a.dmc-btn.dmc-btn--link` "Receber quando sair" → `#newsletter`. São
  honestos e convertem.
- Abaixo da lista, `p.publi-rodape` (`--fs-small`, `--text-ink-3`): "Conteúdo informativo, em
  observância ao Provimento 205/2021 do CFOAB." — a mesma frase do rodapé, aqui porque a seção
  é a mais "editorial" da página.

**Motion.** Reveal por `li`, stagger 80 ms.

**A11y.** `section[aria-labelledby="publicacoes-title"]`; `time` ISO; `publi-vazio` sem
heading (não é artigo). Contraste `--text-ink-3` 5,4:1 (AA para 14 px/400 — ok).

**Testes.** Contratos §2.5: link → 200 e em sitemap; `datetime` ≤ hoje; 0 `lorem|título do
artigo|em breve` fora de `.publi-vazio`; sem JSON-LD de `Article` (não acrescentar).

---

## 08 · Como conduzimos `#treinamentos` (metodologia + programa real)

**Objetivo.** Mostrar o método (4 etapas) — é o que o lead compra — e citar o único programa
de formação documentado. Retira os 6 cursos sem lastro (risco de credibilidade e de
conformidade — referencia §6 alerta 1).

**Id.** Mantém `id="treinamentos"` (28 rodapés + navbar apontam para ele; contratos §1.8). O
rótulo "Treinamentos" no navbar e nos rodapés **é decisão a registrar em DECISIONS.md**
(proposta: "Método" → `#treinamentos`, troca de string idêntica nos 28 arquivos + `navbar.js`
`?v=`), não desta spec. Até lá, o `<h2>` da seção é "Como conduzimos" e o overline "Método e
formação" — a âncora continua honesta porque o programa de formação está na seção.

**Fundo.** `.dmc-on-paper` com `background: var(--color-paper-2)` (tom um passo abaixo do 07,
sem fio). Sai para 09 (escuro) com corte.

**Layout.**
- 1440/1024: 12 col; `ol.metodo-etapas` em `1 / span 7`; `aside.metodo-programa` em `9 / span 4`,
  `align-self: start`, `position: sticky; top: calc(var(--header-h-lg) + var(--space-6))`.
- 768: etapas `1 / span 8`; programa abaixo, `span 8`, sem sticky.
- 390/320: 1 col.
- `ol.metodo-etapas`: reutiliza o padrão numerado com fio (`.treinos__lista/.treino*`
  renomeado para `.metodo-etapa*`): `li.metodo-etapa` com `border-top` 1 px, `padding-block:
  var(--space-6)`, grid `auto 1fr` (número `01` Hanken 600 `--fs-overline` `--color-gold-deep`
  · `h3.dmc-h3` + `p` `--text-ink-2` `max-width: 44ch`). Etapas (sobre.html): 01 Diagnóstico ·
  02 Cenários e decisão · 03 Estruturação e implementação · 04 Acompanhamento e revisão. Texto
  de 1 linha por etapa (content-director), sem prazo.
- `aside.metodo-programa[aria-labelledby="metodo-programa-titulo"]`: é a **única caixa de
  texto** da home, justificada por ser um objeto distinto (um programa): `border: 1px solid
  var(--color-line-ink)`, `border-radius: var(--radius-1)`, `padding: var(--space-7)`, fundo
  `--surface-paper`. Conteúdo: overline "Formação" · `h3#metodo-programa-titulo.dmc-h3`
  "Arquitetura Patrimonial Estratégica" · `p.metodo-programa__meta` (`.dmc-small`, lista
  inline separada por "·"): "Programa de formação institucional · 42 horas · online" ·
  `p` (`--fs-body`, `--text-ink-2`): "Os fundamentos do eixo patrimonial e sucessório em dez
  módulos, para empresários, gestores e equipes que decidem com base neles." ·
  `a.dmc-btn.dmc-btn--secondary` "Conhecer a plataforma" → `plataforma-ead/`. **Sem preço**,
  sem "trust/offshore", sem "blindagem", sem os outros 3 cursos do seed `[CEO pend. 3]`.
- Removidos: os 6 `li.treino` atuais e os 6 links `login.html?curso=`.

**Motion.** Reveal das etapas (stagger), nenhum no aside.

**A11y.** `section[aria-labelledby="treinamentos-title"]`; `ol` real; `aside` nomeado.
Contraste de `--color-gold-deep` sobre `--color-paper-2` 4,6:1 (só no número 600).

**Testes.** Contratos §2.6: todo nome de programa citado existe em `plataforma-ead/js/data.js`
como `titulo`; `plataforma-ead/` → 200; 0 `login.html?curso=`.

---

## 09 · Newsletter `#newsletter`

**Objetivo.** Captura leve, três campos, zero atrito, honestidade de estado. Quem veio do 07
chega aqui pela âncora.

**Fundo.** `--surface-1`; corte vindo do papel-2. Sai para `#video` (`--surface-0`) com fio
(`#video` já tem `.dmc-section--rule`).

**Layout.**
- 1440/1024: 12 col; texto `1 / span 5`; `form` `7 / span 6`. Campos: 1440 → **3 campos em
  uma linha** (`repeat(3, minmax(0,1fr))`, gap `--space-4`) + linha de consentimento + botão
  alinhado à esquerda. 1024 → 2+1 (`nome | e-mail` / `empresa`).
- 768: texto acima (`span 8`), form abaixo; campos 2+1.
- 390/320: tudo 1 col; campos 100 %; botão 100 % de largura (`.dmc-btn` com `width:100%` só
  aqui, classe `.news-form__submit`); `padding-inline` do `.dmc-wrap` garante 0 overflow.
- Texto: overline "Newsletter" · H2 "Análises para <em>quem decide</em>, no seu e-mail." ·
  lead "Textos curtos, sem periodicidade prometida: só quando há algo a dizer sobre sucessão,
  tributo, matrícula, números, crédito ou passivo trabalhista." · `p.dmc-small` "Você pode se
  descadastrar a qualquer momento pelo link de cada e-mail." (texto visível com "descadastr",
  contrato QA).
- `form#newsletterForm[action="/api/newsletter"][method="post"][data-origem="home"][novalidate]`
  (contratos §3.1 / blueprint): `label[for]` visível acima de cada campo (`.form-field` já
  existente); `input#nl-nome[name=nome][required][autocomplete=name]` · `#nl-email[type=email]
  [required][autocomplete=email]` · `#nl-empresa[name=empresa][autocomplete=organization]`
  (label "Empresa (opcional)") · `input[type=hidden][name=origem][value=home-newsletter]` ·
  honeypot `.form-hp[aria-hidden=true]` > `#nl-website[name=website][tabindex=-1][autocomplete=off]`
  · `.form-consent` > `input#nl-consentimento[type=checkbox][name=consentimento][required]` +
  `label[for=nl-consentimento]`: "Autorizo o Complexo DMC a usar meu nome e e-mail para enviar
  análises, nos termos da LGPD (Lei 13.709/2018) e da <a href="pages/politica-de-privacidade.html">
  Política de Privacidade</a>." `[CEO pend. 9: política com CONFIRMAR]` · `button.dmc-btn
  .dmc-btn--primary.news-form__submit[type=submit]` "Quero receber análises" · `p#nlMessage
  .form-message[role=status][aria-live=polite]`.
- Estados (mesmo padrão de `#contactForm`, main.js 106-223, duplicado como `initNewsletter`):
  `aria-busy` + botão desabilitado durante o envio; erro por campo com `aria-invalid` +
  `aria-describedby` + `p.form-field__error` com ícone; sucesso só com `2xx {ok:true}` →
  "Inscrição registrada. O primeiro e-mail confirma o endereço." e campos limpos; `400` →
  erros por campo; `429/413/503/falha de rede` → "Não foi possível registrar agora. Tente de
  novo em alguns minutos ou escreva para administrativo@complexodmc.com.br." — **nunca** a
  palavra "recebido/cadastrado" sem 2xx.
- Visual dos campos sobre escuro: já existe em `.contato` para papel; para escuro usar as
  regras do campo de `components.css`? Não há — o form da home é em papel. Definir em
  `home.css` `.news-form` com `background: var(--surface-0)`, `border: 1px solid
  var(--color-control)`, texto `--text-1`, placeholder `--text-3`, foco `outline` ouro.
  48 px de altura, raio 2 px.

**Motion.** Nenhum além dos tokens de estado.

**A11y.** `section[aria-labelledby="newsletter-title"]`; todos os campos com nome acessível
(a11y.spec); `role=status`. Contraste do fio do campo `--color-control` 3,1:1 (UI, ok).

**Testes.** `newsletter.spec.js` (contratos §3.1) — frontend + API; backend conforme
`blueprint-newsletter.md`.

---

## #video · Em vídeo — mantido

Posição: entre 09 e 10, como hoje (penúltimo bloco antes do contato). HTML, CSS (`#video`
escopo) e `video.js` intactos; `data-video=""` até o CEO fornecer o ID `[CEO pend. 11]`. Título
sugerido no `.dmc-sec-head`: "O Complexo DMC <em>em vídeo</em>." (content-director).

## 10 · CTA final + contato `#contact` e rodapé `#rodape` — mantidos

- `#contact`: intacto (form, ids, `#formMessage`, `select#cf-eixo` E1–E6 + "Ainda não sei").
  Única adição permitida: link da Política no rótulo de `#cf-consentimento` (PROGRESS l. 72)
  — já está no HTML atual (captura rodapé). H2 sugerido "Comece pela <em>decisão a tomar</em>."
- WhatsApp dentro do `#contact` continua como secundário (já é link textual).
- Rodapé: intacto; lista "A casa" linka `#features` e `#treinamentos` — só o rótulo
  "Treinamentos" depende da decisão de 08. Adicionar "Newsletter" → `#newsletter` na lista
  "A casa" (1 linha, mesmo estilo).

---

## 11. Destino de tudo que existe hoje

| Hoje | Destino |
|---|---|
| `#hero` | mantido |
| `.fatos` (faixa 4 itens) | **removida**; conteúdo absorvido por 04 (itens 1 e 3) e 06 (sede) |
| `#conheca` tablist `.casa__eixos` + `.casa__foco` + `.casa__acoes` | **removidos**; a casa fica texto + rede; o link "Sobre" vira `dmc-btn--link` |
| `#conheca` `[data-rede="casa"]` + fallback SVG | mantidos; canvas lê nomes de `#features` e clica → `#eixo-N` |
| `.np-cases-band` "Qual é a sua situação?" (6 falas) | **movida** para 03a como `.eixos-situacoes` (6 falas, uma por eixo; E3-inventário sai, E6 entra, E4 reescrita) |
| `#npAskForm` busca livre | **removida** (+ `initBusca` em main.js) |
| `.np-axes` tablist | **removida**; vira `ol.eixos-grid` estática |
| `.np-flags` 6 `article#eixo-N` (headline, lead, 3 diferenciais, 2 CTAs, `.np-spot`) | **transformados**: os ids `#eixo-N` ficam nos 6 `article.eixo` do grid; headline/diferenciais/spot saem da home (vivem nas páginas internas); `data-assunto` continua nos CTAs que forem para `#contact` (nenhum no grid — o CTA é a página) |
| `.np-spot-ico` 6 SVGs | substituídos pelos 6 ícones novos (§03); os antigos ficam disponíveis para as internas |
| `#npGrid` 21 `a.np-card` | **removidos**; links preservados em `nav.eixos-indice` (20; "Auditoria Empresarial → #contact" sai); `catalogo-cards.json` exportado antes |
| `.np-closer` faixa WhatsApp | **removida** |
| `#treinamentos` 6 cursos | **substituídos** por metodologia + 1 programa real; id mantido |
| `#results` Ad-tech | **removido**; vira item 06 de 04 com link para `pages/tecnologia.html` |
| `#video` | mantido na mesma posição |
| `#contact`, `#rodape`, `.whatsapp-float`, `#scrollToTop` | mantidos (WhatsApp ganha regra de aparição, §12) |
| Âncoras `#features`, `#treinamentos`, `#contact`, `#conheca`, `#eixo-1..6`, `#rodape`, `#hero`, `#conteudo` | **todas existem** na nova home |

---

## 12. Especificações para `frontend-motion` (JS / reestruturação)

1. **main.js**: remover `initBusca` e `sortearDestaque`; `initEixos` vira `initEixosAncora`
   (só: se `location.hash` ∈ `#eixo-1..6` ao carregar, `scrollIntoView({block:'start'})`
   respeitando `scroll-margin-top`; sem ARIA de tabs, sem `replaceState`). Manter `#cf-eixo`
   + `?assunto=` + `[data-assunto]`. Novo `initNewsletter` clonando o fluxo do contato.
2. **WhatsApp flutuante**: `.whatsapp-float` nasce `hidden`; IO em `#porque` (threshold 0) o
   revela com `dmc-fade`; cada clique em `[data-assunto="EN"]` grava o eixo em memória e o
   `href` passa a `wa.me/5511915267749?text=` + "Olá, gostaria de uma conversa inicial sobre
   <nome do eixo>." Sem JS: botão visível desde o início (HTML sem `hidden`; a classe `dmc-js`
   aplica o `hidden` inicial).
3. **rede-neural.js**: `controlador()` lê `#features article[data-eixo]` (`data-curto` no
   `h3`); hover em `article` realça o nó; clique no nó → `document.getElementById('eixo-N')
   .scrollIntoView({behavior: reduce ? 'auto' : 'smooth'})` + `focus({preventScroll:true})`
   no `a.eixo__cta`. Exportar `rng/triplet/rgba/whenNear/size/place` para `brasil.js`.
4. **brasil.js** (`type=module`, `defer` implícito): `brasil(fig)` conforme §06; `CAPITAIS`
   importado de `assets/js/data/brasil-capitais.js`; cria canvas só em ≥768 + no-preference;
   `data-motion`; `still()` em reduce; `visibilitychange`; `reduce.addEventListener('change')`.
5. **Reveal**: `.dmc-reveal` + `--i` para stagger nas seções 04, 05, 07, 08; nunca em 02, 03,
   06-SVG, 09, 10.
6. **HTML**: `<svg hidden>` de símbolos dos ícones no topo do `<main>`; ordem das seções
   `hero, conheca, features, porque, verticais, presenca, publicacoes, treinamentos, newsletter,
   video, contact`; `?v=`: `styles.css` c4→c5, `main.js` c3→c4, `rede-neural.js` 2→3,
   `home.css` v1, `brasil.js` v1.

---

## 13. Mapa de estilos — `styles.css` (1192 l.)

| Linhas | Bloco | Destino |
|---|---|---|
| 17-65 | base, `.np-pillar-*` legado, padrão "fio que cresce" | **fica** (o fio é reaproveitado em 03) |
| 67-168 | herói | **fica**, intocado |
| 170-197 | `.fatos` | **morre** |
| 199-334 | `.casa*` | **enxuga**: ficam `.casa`, `.casa__grid`, `.casa__text`, `.casa__rede*` (294-312) e os breakpoints de grid; morrem `.casa__tab*`, `.casa__eixos`, `.casa__foco*`, `.casa__acoes`, `sticky` |
| 336-340 | `.np-section` | **morre** (seção vira `.dmc-section.dmc-on-paper.eixos`) |
| 341-449 | `.np-cases-band`, `.np-ask*`, `.np-case*` | **morre** (a lista de situações é reescrita em `home.css` `.eixos-situacoes*`, ~45 l.) |
| 451-500 | `.np-axes*` | **morre** |
| 502-633 | `.np-flags`, `.np-flag*`, `.np-spot*`, `.np-flag-list` | **morre** (o padrão de lista numerada migra para `.metodo-etapa` em `home.css`) |
| 635-680 | `.np-grid`, `.np-card*` | **morre** |
| 682-694 | `.np-closer` | **morre** |
| 696-727 | `.treinos*` | **morre**; renasce como `.metodo-*` em `home.css` (~40 l.) |
| 729-788 | `.adtech*` | **morre** |
| 791-976 | `.page-video__*` + `#video` | **fica** (bloco triplicado; não tocar) |
| 978-1142 | `.contato*`, `.form-*` | **fica**; `.form-field`, `.form-consent`, `.form-message`, `.form-hp`, `.form-field__error` são reutilizados pela newsletter — mover essas 5 famílias para cima do `#contact` como "formulários" ou referenciá-las como estão (não duplicar) |
| 1144-1192 | flutuantes + reduce | **fica**; `.whatsapp-float[hidden]` ganha 1 regra |

Saldo estimado: `styles.css` ≈ 1192 → ~640 linhas; `home.css` novo ≈ 420 linhas (02 ajustes 20
· 03 120 · 04 60 · 05 80 · 06 50 · 07 40 · 08 50 · 09 40). Total CSS da home 49 KB → ≤ 35 KB
(meta do inventário). Nenhum literal de cor fora de tokens; o único degradê é o véu de 05.

---

## 14. Orçamento de performance (não regredir: Perf ≥ 95, LCP ≤ 1,8 s, CLS ≤ 0,01, TBT 0)

| Item | Hoje | Meta | Como |
|---|---|---|---|
| HTML | ~104 KB | ≤ 70 KB | saem 21 cards + 6 painéis + 6 casos + busca; entram 6 artigos + 20 links de índice + 5 painéis + SVG do mapa ≤ 12 KB + símbolos 1,6 KB |
| CSS render-blocking | tokens 294 l. + components 604 l. + styles 49 KB | styles+home ≤ 35 KB (≤ 9 KB gzip) | §13; `home.css` como 4.º arquivo só durante a migração — fundir em `styles.css` na publicação para não somar request no caminho crítico |
| Fontes | Google Fonts, 2 famílias | iguais (nenhuma nova) | — |
| LCP | poster do herói 1,80 s | ≤ 1,80 s | nada novo antes de `#hero`; `<svg hidden>` de símbolos tem < 2 KB e fica depois do herói no DOM |
| Imagens novas | 0 | 5 painéis: wide ≤ 120 KB AVIF / tall ≤ 60 KB; todas `lazy` + `decoding=async` + `width/height` | só a variante casada com o `media` é baixada; total ≤ 500 KB desktop, ≤ 300 KB mobile |
| Peso total sem vídeo | 1193 KB (com vídeo) | ≤ 1,5 MB | — |
| JS | main 503 l. + rede-neural 621 l. + navbar + video | main −120 l. + newsletter +90; rede-neural −80 (stages) ; `brasil.js` ≈ 180 l.; 0 libs | tudo `defer`/`module`; canvas via IO; nenhum `fetch` (capitais em módulo) |
| CLS | 0,003 | ≤ 0,01 | `aspect-ratio` em toda mídia (painéis, mapa, rede); H2 ≤ 36 ch; `publi-vazio` com `min-height` igual ao artigo real |
| TBT / CPU mobile | 0 ms | 0 ms | mapa sem canvas < 768; casa a 30 fps; sem WebGL |
| Requests de terceiros | fontes + YouTube (lazy) | iguais | mapa e capitais da própria origem (CSP `connect-src 'self'`) |

---

## 15. Impacto nos testes (resumo operacional)

- **Quebram e são reescritos**: `home.spec.js` → `eixos.spec.js` (6 testes × 2 viewports);
  `movimento.spec.js` l. 49-66 → bloco `#presenca`.
- **Mantêm**: `navegacao`, `a11y` (1 `h1`, 1 `main`, campos nomeados — agora +4 da newsletter),
  `console` (0 erros; `brasil.js` sem `fetch`), `viewports` (0 overflow — pontos de risco: índice
  6 col, mosaico sangrado, painéis 21:9, SVG quadrado, form em linha), `seo` (sem JSON-LD
  novo), `rotas` (âncoras `#features/#treinamentos/#contact` preservadas; +31 links internos
  novos: 6 situações + 6 CTAs + 20 índice + 5 verticais + 1 publicação + 1 tecnologia + 1 EAD —
  menos os 21 cards e 6 cursos), `formulario` (intacto).
- **Nascem**: `newsletter.spec.js`, `home-secoes.spec.js` (ordem dos 11 ids, vídeo antes do
  contato, conformidade textual, axe por seção, overflow por seção, imagens).
- **Lighthouse**: `LH_PAGINAS=home LH_RUNS=5` após as etapas 03, 05 e 06 (as que mudam peso).
- Comandos e metas: `contratos-qa.md §4-5`.

---

## 16. Pendências do CEO que esta spec contorna com um padrão (não resolve)

1. Cobertura fora de SP → 06 só com a fórmula aprovada; mapa sem legenda.
2. Nomes "Blindagem"/"Defesa Empresarial" → índice 03c usa os nomes atuais.
3. Cursos → 08 cita só "Arquitetura Patrimonial Estratégica, 42 h, online".
4. Ad-tech features → 04 item 6 sem ARTHEU/API/tribunais/PCD.
5. Parceiros nomeados → só por categoria (02, 04, 05, 06).
6. Agronegócio → painel 05 com rótulo genérico até aprovação.
7. Rótulo "Treinamentos" no navbar/rodapés × seção "Como conduzimos" → DECISIONS.
8. Política de privacidade com `[CONFIRMAR]` → o link da newsletter aponta para ela mesmo assim
   (é a página legal existente); registrar o risco.
9. Fotografia real → painéis procedurais já finais; moldura idêntica se vier foto licenciada.
10. ID do vídeo da home → `data-video=""`.
