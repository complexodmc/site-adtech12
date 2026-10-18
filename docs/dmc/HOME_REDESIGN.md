# HOME REDESIGN — Especificação definitiva

Diretor de arte (síntese) · 2026-10-17 · direção C (Híbrido Executivo), não reaberta.
Vencedora do júri: **A — Editorial-first** (esqueleto, ritmo de fundos, 04, 06 com um só canvas,
07 sem imagem, mapa de estilos). Enxertos de **B** (painéis grandes com véu tokenizado, eyebrow
na voz do cliente nas verticais, sprite `<symbol>` dos ícones, `details` do catálogo, 2 linhas no
form, mapa com 3 planos de paralaxe) e de **C** (destinos distintos nas verticais, "estrutura
patrimonial", máquina de estados da newsletter, WhatsApp qualificado, regras de 320 px, aside do
programa nomeado, "Newsletter" no rodapé).

Fontes: `docs/dmc/home-redesign/{fatos,inventario-frontend,contratos-qa,referencia-e-mensagens,
blueprint-newsletter,spec-A,spec-B,spec-C,juiz-2-frontend,julgamento-juiz-3}.md`, `BRIEF.md`,
`DECISIONS.md` (D1–D9, T5, T6), `DESIGN-SYSTEM.md`, `tokens.css`, `components.css`, `styles.css`,
`index.html` (working tree). Nada aqui toca `complexodmc.com.br/` nesta fase; os agentes escrevem
em `docs/dmc/home-redesign/partials/` e o integrador monta.

Convenção de marcação: `[copy]` = texto proposto a validar pelo content-director (fatos e links
não mudam); `[CEO n]` = pendência da §8; **negrito** = contrato (teste ou âncora).

---

## 1. Diagnóstico e decisões

### 1.1 O que a home atual erra (resumo do que as três specs e o júri concordam)
- Os seis eixos aparecem quatro vezes (faixa `.fatos`, tablist da Casa, painel `#features` com
  6 abas + 6 banners + 21 cards, rodapé); ~40 pontos de clique antes do formulário; nenhuma seção
  responde "por que confiar".
- Seis cursos sem lastro no catálogo da EAD; Ad-tech com seção própria e card "sob avaliação".
- Nenhuma seção fala a língua do setor; sede só no rodapé; nenhuma captura leve.
- Dois motivos visuais iguais (rede neural na Casa e no painel); dois canais de conversão
  competindo (form qualificado × WhatsApp genérico).

### 1.2 Decisões da síntese (resolvem as contradições apontadas pelo júri)

| # | Decisão | Vem de | Resolve |
|---|---|---|---|
| S1 | **Ritmo de fundo em blocos, não zebra**: ESCURO (01+02) → PAPEL (03) → DIVIDIDO (04) → ESCURO (05+06) → PAPEL (07+08+09) → ESCURO (vídeo) → PAPEL (10) → rodapé `--surface-1`. Vizinhas do mesmo bloco separadas por fio, nunca por cor. | A | zebra de B/C a partir de 07; 07 fraco após o mapa (juiz 3) — 07 abre o bloco de papel |
| S2 | **Um só canvas na página** (06). A Casa fica tipográfica; `rede-neural.js` sai da home. | A, B | CPU mobile, duplicidade de motivo, interação cega de C |
| S3 | **03 = grade 3×2 só com fios** (ícone, E-n, nome, descrição ≤ 160, CTA) + `details.eixos-catalogo` fechado abaixo com os 21 links em alvos de 44 px. Sem índice inline, sem situações aqui. | A + B | índice de 14 px de A (tap targets); três listas de C |
| S4 | **Voz do cliente volta à home uma única vez**: eyebrow em Newsreader itálico em cada painel de 05 (5 falas setoriais). As 6 falas por eixo (E4 reescrita, E6 nova — C) vão para `catalogo-cards.json` como insumo das internas e do mega-menu. | B (lugar), C (copy) | A matava a fala; C repetia três vezes |
| S5 | **04 = painel de papel que sangra à direita** com intro sticky; numeração Hanken 14 (não Newsreader 40: CLS); `isolation: isolate` no painel. Item 1 renomeado "Um caso, um plano, um responsável" (a frase "seis eixos, uma só governança" fica só no H2 de 03). | A + juiz 2/3 | seis caixas de B/C; repetição 03↔04; bug do `z-index:-1` |
| S6 | **05 = painéis grandes em `--container-wide`**: painel 1 (construção) 21:9 em toda a largura do container + 4 painéis 16:10 em 2×2; **≥1024 texto sobre véu tokenizado** (`--hero-veil*`), **≤1023 texto fora da imagem** em `--surface-1`; **loop WebM ≤ 6 s / ≤ 1 MB por painel** com gate IO + ≥1024 + sem reduce + sem `saveData`; poster como fallback; nomes de arquivo do CEO. Heading fora do link; um CTA por painel. Sem sticky. | C (hierarquia), B (véu/eyebrow), A (texto fora em mobile), D9 (movimento) | A contrariava a direção de imagem; pilha sticky de B (WCAG 2.4.11); link de 40 palavras de C |
| S7 | **06 incorpora D9**: "Sede em São Paulo, casos conduzidos em todo o Brasil e no exterior" sem números. Mapa SVG inline + Canvas 2D com 3 planos de paralaxe; **sem** `perspective/rotateX` (borra traços, desloca hit-test). Capitais embutidas em módulo (sem `fetch`). | B/C + juiz 3 | as três ignoravam a D9; risco do rotateX |
| S8 | **07 sem imagem**; 1 destaque real + aside "Em preparação" (sem título, sem data) com CTA "Receber quando sair" → `#newsletter`; slots com `min-height` do destaque; sem linha do Provimento (já está no rodapé). H2 de 07 ≠ H2 de 09. | A + C | capa falsa de B; "selo OAB" de C; H2 iguais |
| S9 | **08 = método em 4 etapas + aside do programa real** (sem caixa, fio à esquerda; texto de público; sem preço/módulos). `id="treinamentos"` mantido; overline "Método e formação" mantém a âncora honesta. | A + B/C | cursos fantasma |
| S10 | **09 em papel**, `form.dmc-form.news-form`, 2 linhas [nome][e-mail] / [empresa][botão]; sucesso só com 2xx `{ok:true}` e texto "Inscrição registrada." (sem prometer e-mail); erros por código HTTP sem "receb/cadastrad". | A (papel), B (2 linhas), C (estados) | segundo visual de campo de C; promessa de e-mail |
| S11 | **WhatsApp flutuante continua visível desde o início** (esconder até 04 é decisão do CEO — `[CEO 13]`); ganha `?text=` com o eixo do último `[data-assunto]`/`?assunto=`. | C (qualificação) − gimmick | canal removido sem pedido |
| S12 | **Sem numeração de ato no overline** ("02 · A casa"): juiz 1 leu como tropo de template. Números só dentro de listas (04, 05, 08), Hanken 500 14 tabular. | A | — |
| S13 | **Fórmula completa de atribuição de atos** (sociedades de advogados parceiras, contadores e auditores habilitados, cartórios conveniados) **uma vez, em 04.3**. Nas demais seções só a categoria pertinente ("atos lavrados por cartórios conveniados" em 05.1). Sem "atos privativos"/"natureza" em título ou rótulo. | juiz 3 | litania em 02/04/05/06/07 |
| S14 | **Ícones**: geometria de A (Transmissão, Praças sobrepostas, Matrícula, Lente, Título→Ativo, Ciclo em 4 tempos) entregues como `<symbol id="ico-e1…e6">` em `<svg hidden>` + `<use>`. | A (desenho) + B/C (sprite) | 6 cópias inline |
| S15 | **Rinoceronte em vídeo na Casa: não** (0,82 MB fora do brief, lê como mascote). Fica como `[CEO 14]` opcional. | juízes | orçamento e marca |
| S16 | **`home.css` separado durante a construção; fundido em `styles.css` na publicação** (não somar request render-blocking). | inventário §5 + juízes | 4.º CSS no caminho crítico |

### 1.3 Mapa final das seções

| # | id | Classe raiz | Fundo | Separador com a anterior | Parciais |
|---|---|---|---|---|---|
| 01 | `hero` | `.hero` | escuro | — | **não mexer** |
| 02 | `conheca` | `.dmc-section.dmc-section--rule.casa` | `--surface-0` | fio `--color-line` | `casa.{html,css}` |
| 03 | `features` | `.dmc-section.dmc-on-paper.eixos` | papel | corte | `eixos.{html,css}` + `icones-eixos.svg` |
| 04 | `porque` | `.dmc-section.porque` | `--surface-0` + painel papel à direita | corte (papel "recolhe") | `porque.{html,css}` |
| 05 | `verticais` | `.dmc-section.verticais` | `--surface-0` | corte | `verticais.{html,css,js}` |
| 06 | `presenca` | `.dmc-section.dmc-section--rule.presenca` | `--surface-0` | fio | `presenca.{html,css,js}` + `brasil-min.svg` + `brasil-capitais.js` |
| 07 | `publicacoes` | `.dmc-section.dmc-on-paper.publi` | papel | corte | `publicacoes.{html,css}` |
| 08 | `treinamentos` | `.dmc-section.dmc-on-paper.dmc-section--rule.metodo` | papel | fio tinta | `metodo.{html,css}` |
| 09 | `newsletter` | `.dmc-section.dmc-on-paper.dmc-section--rule.news` | papel | fio tinta | `newsletter.{html,css,js}` |
| — | `video` | existente | `--surface-0` | corte | mantido |
| 10 | `contact` | existente | papel | corte | mantido (+ H2 `[copy]`) |
| — | `rodape` | existente | `--surface-1` | — | +1 link "Newsletter" |

**Âncoras garantidas**: `#hero`, `#conteudo`, `#conheca`, `#features`, `#eixo-1…6`,
`#treinamentos`, `#video`, `#contact`, `#rodape`. **Novas**: `#porque`, `#verticais`,
`#presenca`, `#publicacoes`, `#newsletter`. **Extintas**: `#results`, `#npGrid`, `#npAskForm`,
`#npAsk`, `#npAskStatus`, `#aba-eixo-N`, `#casa-tab-N`, `#casa-foco-N`.

---

## 2. Arquitetura das 10 seções e convenções compartilhadas

### 2.1 Arquivos e montagem
- Cada agente escreve **só** os seus parciais em `docs/dmc/home-redesign/partials/`:
  `<secao>.html` (fragmento da `<section>` inteira, sem `<html>/<head>`), `<secao>.css`
  (bloco com cabeçalho `/* ==== 0N · NOME ==== */`), `<secao>.js` (função `init<Secao>()`
  exportada, sem auto-execução, sem acesso a nada fora da própria seção).
- `_shared.css` (integrador): custom properties locais em `.home` (ver 2.3) e ajustes de
  componente permitidos (2.4). É o primeiro bloco de `home.css`.
- Integrador (`frontend-motion`) concatena: `_shared.css` → `casa` → `eixos` → `porque` →
  `verticais` → `presenca` → `publicacoes` → `metodo` → `newsletter` em
  `assets/css/home.css?v=1` (depois de `styles.css?v=c5`); cola os HTML na ordem do DOM em
  `index.html`; cola `icones-eixos.svg` (`<svg hidden>`) como primeiro filho de `<main>`;
  importa os `init*` em `main.js?v=c4` e `brasil.js?v=1`. Na publicação, funde `home.css` em
  `styles.css` (S16).
- `<main id="conteudo" class="home">` recebe a classe `home` (escopo das custom properties).

### 2.2 Prefixos e nomes
- Bloco por seção: `casa-`, `eixos-`, `porque-`, `verticais-`, `presenca-`, `publi-`,
  `metodo-`, `news-`. Elemento `__`, variante `--`, estado `is-*` (classe) ou `data-*`.
- Reutilizar antes de criar: `.dmc-wrap`, `.dmc-section`, `.dmc-section--rule`,
  `.dmc-on-paper`, `.dmc-sec-head`, `.dmc-overline`, `.dmc-h1/.dmc-h2/.dmc-h3/.dmc-h4`,
  `.dmc-lead`, `.dmc-small`, `.dmc-btn(--primary|--secondary|--link)`, `.dmc-reveal`,
  `.dmc-sr-only`, `.dmc-form` + `.form-field/.form-consent/.form-hp/.form-message/.form-field__error`,
  `.np-pillar-<slug>` (acento por eixo).
- **Proibido**: literal de cor (só tokens; o único degradê da home é o véu de 05 com
  `--hero-veil*`), `transition: all`, `will-change`, `box-shadow` (zero caixas com sombra),
  raio > 4 px em mídia (`--radius-2`) e > 2 px em controles, `tabindex` positivo, `!important`,
  fontes novas, breakpoints fora de 640/768/1024/1440, `fetch` (CSP `connect-src 'self'`),
  JSON-LD novo, `role=tab/tabpanel` em qualquer lugar da home.

### 2.3 Custom properties locais (`_shared.css`)
```css
.home {
  --ratio-wide: 21 / 9;      /* painel 1 de 05 em ≥1024 */
  --ratio-panel: 16 / 10;    /* demais painéis e todos em <1024 */
  --ratio-map: 1;            /* viewBox quadrado do Brasil */
  --veil: var(--hero-veil);          /* .86 */
  --veil-mid: var(--hero-veil-mid);  /* .60 */
  --veil-off: var(--hero-veil-off);  /* 0   */
  --num-font: 500 var(--fs-small) / 1 var(--font-text);   /* numeração 01…06 */
}
```
Nenhuma edição em `tokens.css`/`components.css` (compartilhados com 26 internas).

### 2.4 Ajustes de componente permitidos (só em `_shared.css`)
- `.dmc-on-paper.dmc-section--rule { border-color: var(--color-line-ink); }` (fio tinta entre
  seções de papel).
- `.home .dmc-sec-head { max-width: 48rem; }` já é o padrão; **nenhum H2 centrado**.
- Fio de acento que cresce (migrado de `styles.css` 53-65):
  `.eixos-item::before { content:''; position:absolute; inset:0 0 auto 0; height:2px;
  background: rgb(var(--np-accent-deep)); transform: scaleX(0); transform-origin:left;
  transition: transform var(--dur-slow) var(--ease-out); }` e `:hover/:focus-within/:target → scaleX(1)`.

### 2.5 Grade e breakpoints
- Texto em `.dmc-wrap` (1240); mídia de 05 e mapa de 06 em `.dmc-wrap--wide`
  (`max-width: var(--container-wide)`, 1440; classe nova em `_shared.css`).
- 12 colunas ≥1024, 8 em 768–1023, 4 abaixo; `gap: var(--grid-gap)`; **todo item de grid com
  `min-width: 0`**; títulos com `overflow-wrap: anywhere`; nenhum elemento de largura fixa > 288 px.
- Viewports de aceite: **320 / 375 / 390 / 768 / 1024 / 1440 / 1920** — 0 px de overflow
  antes e depois de rolar (`viewports.spec`). 320 e 375 herdam as regras de 390; 1920 =
  container centrado (nada estica além de 1440).
- `scroll-margin-top: calc(var(--header-h-lg) + var(--space-6))` em toda `section[id]` e nos
  `article#eixo-N`.

### 2.6 Tipografia e contraste (medidos com os tokens)
| Papel | Classe | Fonte |
|---|---|---|
| H2 de seção | `h2.dmc-h1` com `<em>` em uma expressão | Newsreader 300 |
| Headline de vertical, título de publicação | `h3` com `font-size: var(--fs-h2)` / `--fs-h3` | Newsreader 300 |
| Eyebrow (voz do cliente) | `.verticais-item__eyebrow` | Newsreader 300 itálico, `--fs-h4` |
| Nome de eixo, título de item | `h3.dmc-h3` / `.dmc-h4` | Hanken 600 |
| Corpo | `--fs-body`, lh 1.65 | Hanken 400 |
| Numeração 01…06 / E1…E6 | `font: var(--num-font)`, `font-variant-numeric: tabular-nums`, tracking .08em | Hanken 500 |
| Overline | `.dmc-overline` | Hanken 12 / .16em |

Contraste: sobre `--surface-0` — `--text-1` 17,7 · `--text-2` 10,4 · `--text-3` 6,8 · ouro 9,6 ·
acento de eixo ≥ 8,2. Sobre papel — `--text-ink-1` 17,7 · `--text-ink-2` 7,7 · `--text-ink-3` 5,4 ·
`--np-accent-deep` 4,6 (**só** em 14 px/500+ ou em ícone/fio/seta) · `--color-gold-deep` 4,6.
**Proibido**: `rgb(var(--np-accent))` ou `#d6b069` como texto sobre papel; texto sobre mídia sem
véu ≥ .80. **Cor de eixo só em ícone, E-n, fio e seta** — nunca em fundo, título ou corpo.

### 2.7 Movimento (tokens; `prefers-reduced-motion` colapsa para 1 ms automaticamente)
- Revelação: `.dmc-reveal` (16 px + fade, 700 ms, uma vez) em cabeçalhos e itens de 04, 05,
  07, 08 e na figura de 06; `style="--i:n"` para stagger (80 ms × n, teto 5). **Nunca** em
  02 (primeira seção após o LCP), nos artigos de 03 (conteúdo do funil), no SVG de 06, nos
  formulários (09, 10) e em `#contact`.
- Hover: seta `translateX(4px)` 240 ms (já no `.dmc-btn`); fio `scaleX(0→1)` 400 ms; mídia de
  05 `scale(1.02)` 400 ms só em `:hover/:focus-within` do painel e só ≥1024.
- Contínuo: só o canvas de 06 (rAF com IO + `visibilitychange`, ≤ 30 fps, DPR ≤ 2, nunca <768)
  e os loops de vídeo de 05 (play/pause por IO, só ≥1024, sem reduce, sem `saveData`).

### 2.8 Acessibilidade comum
- Cada `section` com `aria-labelledby` → seu `h2`; um só `h1` (herói); `h3` para itens; nenhum
  heading dentro de `<a>`.
- Alvos ≥ 44 px (`.dmc-btn--link` já tem); foco visível por `--focus-color` (ouro) no escuro e
  `--focus-color-ink` no papel (`.dmc-on-paper` já redefine); `outline-offset` negativo onde
  houver `overflow:hidden` (painéis de 05).
- SVG decorativo `aria-hidden="true" focusable="false"`; mapa `role="img"` + `<title>`;
  `<video>` decorativo `aria-hidden="true" tabindex="-1"`.
- Ordem de tabulação = ordem de leitura.

---

## 3. Especificação seção a seção

### 01 · Hero — `#hero` (não mexer)
Mantido byte a byte (HTML 135-165, CSS 67-168 + 1190-1192, `main.js` 17-55). O link
secundário "Conheça os seis eixos" continua em `#features`.

---

### 02 · A Casa — `#conheca` · parciais `casa.html`, `casa.css`

**Objetivo.** Em 10 s: quem fala (consultoria em negócios, São Paulo) e como trabalha, sem
catálogo e sem antecipar 04 e 08.

**Fundo/transição.** `--surface-0`, `.dmc-section--rule` (fio de 1 px com o herói). A faixa
`.fatos` morre; seus rótulos vão para 04 (eixos, parceiros, cartórios) e 06 (sede).

```html
<section class="dmc-section dmc-section--rule casa" id="conheca" aria-labelledby="casa-title">
  <div class="dmc-wrap casa-grid">
    <div class="casa-tese dmc-sec-head">
      <p class="dmc-overline">Sobre</p>
      <h2 class="dmc-h1" id="casa-title">Decisões complexas pedem <em>visão integrada</em>.</h2>
      <p class="dmc-lead">O Complexo DMC integra seis eixos de especialidade para decisões empresariais, patrimoniais e operacionais de alta complexidade.</p>
      <a class="dmc-btn dmc-btn--link" href="pages/sobre.html">Sobre o Complexo DMC<svg …seta 16…></svg></a>
    </div>
    <dl class="casa-ficha">
      <div><dt>O que somos</dt><dd>[copy] Consultoria em negócios, com sede em São Paulo.</dd></div>
      <div><dt>Como trabalhamos</dt><dd>[copy] Seis especialidades sob uma só coordenação; cada ato que a lei reserva a profissionais habilitados fica com quem pode praticá-lo.</dd></div>
    </dl>
  </div>
</section>
```
A ficha tem **duas** linhas (juiz 3): não lista as categorias de parceiros (isso é 04.3) nem as
etapas do método (isso é 08). Sem afirmação de equipe/estrutura `[CEO 8]`. O botão de contato
duplicado sai (herói, navbar e 10 já o têm).

| Largura | `.casa-grid` |
|---|---|
| 1440/1024 | 12 col, `align-items:start`: tese `1 / span 6`; ficha `8 / span 5`, `padding-top: var(--space-3)` |
| 768 | 8 col: tese `1 / -1`; ficha `1 / -1`, `margin-top: var(--space-8)` |
| 390/375/320 | 1 col, pilha |

`.casa-ficha`: `display:grid; gap:0`; cada `div` com `border-top: 1px solid var(--color-line)`,
`padding-block: var(--space-5)`, grade `7rem 1fr` (≥640) / pilha (<640); último `div` com
`border-bottom`. `dt` = estilo `.dmc-overline` em `--text-3`; `dd` corpo `--text-2`,
`max-width: 30rem`. Sem caixa, sem mídia, sem canvas, sem reveal.

**Destino do atual.** `.casa__nav`, `.casa__eixos` (tablist), `.casa__foco*`, `.casa__acoes`,
`.casa__rede[data-rede="casa"]`, `svg.casa__fallback` **saem**. `rede-neural.js` deixa de ser
carregado pela home (ver §5). `movimento.spec` l. 49-66 migra para 06; com `#conheca` sem
canvas o teste atual já passa até a troca.

**Testes.** `#conheca` existe, tem `h2` e `aria-labelledby`; 0 `canvas`; 0 `role=tab`.

---

### 03 · Seis Eixos — `#features` · parciais `eixos.html`, `eixos.css`, `icones-eixos.svg`

**Objetivo.** Os seis eixos numa tela, mesma anatomia, só a cor muda; CTA leva à página-âncora.
Todos os 21 links de solução continuam na home, recolhidos.

**Fundo/transição.** Primeira seção em papel; corte seco com o preto de 02.

```html
<section class="dmc-section dmc-on-paper eixos" id="features" aria-labelledby="eixos-title">
  <div class="dmc-wrap">
    <div class="dmc-sec-head">
      <p class="dmc-overline">Seis eixos</p>
      <h2 class="dmc-h1" id="eixos-title">Seis eixos, <em>uma só governança</em>.</h2>
      <p class="dmc-lead">[copy] Comece pela sua situação, não pelo catálogo: cada eixo leva à página com as soluções que o conduzem.</p>
    </div>
    <ol class="eixos-grid" aria-label="Os seis eixos do Complexo DMC">
      <li>
        <article class="eixos-item np-pillar-patrimonial" id="eixo-1" data-eixo="1" aria-labelledby="eixo-1-titulo">
          <svg class="eixos-item__icon" aria-hidden="true" focusable="false"><use href="#ico-e1"/></svg>
          <p class="eixos-item__num">E1</p>
          <h3 class="dmc-h3" id="eixo-1-titulo">Planejamento Patrimonial e Sucessório</h3>
          <p class="eixos-item__desc">Sucessão, holding e proteção do patrimônio familiar organizados em vida, com a carga tributária calculada antes de cada ato.</p>
          <a class="dmc-btn dmc-btn--link eixos-item__cta" href="pages/planejamento-sucessorio.html">Explorar soluções<svg …seta…></svg></a>
        </article>
      </li>
      … E2–E6 (nomes, descrições ≤160 e hrefs = fatos.md §1–2, sem alteração) …
    </ol>
    <details class="eixos-catalogo">
      <summary>Todas as soluções por eixo</summary>
      <div class="eixos-catalogo__grid">
        <ul class="np-pillar-patrimonial" aria-label="Planejamento Patrimonial e Sucessório">
          <li class="eixos-catalogo__head">E1 · Patrimonial e Sucessório</li>
          <li><a href="pages/planejamento-sucessorio.html">Planejamento Sucessório</a></li>
          <li><a href="pages/holding-patrimonial.html">Holding Patrimonial</a></li>
          <li><a href="pages/blindagem-patrimonial.html">Blindagem Patrimonial</a></li><!-- [CEO 2] nome -->
          <li><a href="pages/pronto-patrimonio.html">Proteção Patrimonial</a></li>
          <li><a href="pages/sucessao-testamentaria.html">Sucessão Testamentária</a></li>
        </ul>
        … E2 (2) · E3 (5) · E4 (1: contabilidade.html) · E5 (1) · E6 (7: ciclo-fechado + 6) …
      </div>
    </details>
  </div>
</section>
```
Ordem e destinos dos CTAs: E1 `planejamento-sucessorio` · E2 `planejamento-tributario` · E3
`consultoria-imobiliaria` · E4 `contabilidade` `[CEO 10]` · E5 `recuperacao-ativos` · E6
`solucoes/consultoria-trabalhista/ciclo-fechado.html`. Catálogo: 21 links; **não** linkar
`planejamento-sucessorio-empresarial` (301) nem "Auditoria Empresarial → #contact" (não é página).

| Largura | `.eixos-grid` | `.eixos-item` |
|---|---|---|
| 1440 | `repeat(3, minmax(0,1fr))`, `column-gap: var(--grid-gap)`, `row-gap: 0` | `padding: var(--space-8) 0 var(--space-9)`; `border-top: 1px solid var(--color-line-ink)` |
| 1024 | idem | `padding: var(--space-7) 0 var(--space-8)` |
| 768 | `repeat(2, …)` (6.ª célula sozinha à esquerda; aceito) | idem |
| 390/375/320 | 1 col | `padding: var(--space-6) 0`; última com `border-bottom` |

`.eixos-item`: `position:relative; display:grid; grid-template-rows: auto auto auto 1fr auto;
gap: var(--space-3); min-width:0`. `::before` = fio de acento (2.4). **Sem fundo, raio, sombra;
a célula não é link** (nome acessível curto). `__icon` 32×32 `color: rgb(var(--np-accent-deep))`.
`__num` `font: var(--num-font)` `rgb(var(--np-accent-deep))`. `h3` `--text-ink-1`,
`text-wrap: balance`. `__desc` `--text-ink-2`, `max-width: 32rem`. `__cta` `--text-ink-1`,
seta em `rgb(var(--np-accent-deep))`, `align-self:end`. `:target` → fio aberto e permanece.

`.eixos-catalogo`: `margin-top: var(--space-block)`; `summary` = linha de 48 px com
`border-top: 1px solid var(--color-line-ink)`, Hanken 500 14, chevron 16 px que gira 180° em
`[open]` (240 ms), `list-style:none` (+ `::-webkit-details-marker{display:none}`), `cursor:pointer`.
`__grid`: ≥1024 `repeat(3, …)` · 768 `repeat(2, …)` · <768 1 col; `gap: var(--space-6) var(--grid-gap)`;
`padding-block: var(--space-6)`. `__head` `font: var(--num-font)` `rgb(var(--np-accent-deep))`,
`margin-bottom: var(--space-2)`. `li > a`: `display:block; padding-block: .55em` (alvo ≥ 44 px),
14 px `--text-ink-2`, sublinhado `text-decoration-color: var(--color-line-ink)`, hover/focus
`--text-ink-1` + `currentColor`. Sem JS; `details` nativo.

**Ícones (`icones-eixos.svg`)** — `<svg hidden xmlns="http://www.w3.org/2000/svg">` com 6
`<symbol id="ico-eN" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
stroke-linecap="round" stroke-linejoin="round">`; testados a 24 e 32 px; ≤ 2 KB no total.
Nenhum é balança, martelo, prédio genérico ou cifrão.

| Eixo | Glifo | Geometria (grade 24) |
|---|---|---|
| E1 | **Transmissão** | círculo r 2.5 em (12,4.5); haste (12,7)→(12,11); travessa (6,11)→(18,11); descidas (6,11)→(6,15.5) e (18,11)→(18,15.5); círculos r 2.5 em (6,18) e (18,18) |
| E2 | **Praças sobrepostas** | quadrado A (3,3)→(14,14) com os lados inferior e direito interrompidos entre 10 e 14; quadrado B (10,10)→(21,21) inteiro — controladora/controlada |
| E3 | **Matrícula** | folha (5,2)→(15,2)→(19,6)→(19,22)→(5,22)→fecha; dobra (15,2)→(15,6)→(19,6); linhas (8,10)→(16,10) e (8,13.5)→(13,13.5); selo círculo r 2 em (15,17.5) |
| E4 | **Lente sobre o livro** | círculo r 6 em (10,10); cabo (14.3,14.3)→(20,20); dentro, linhas (7,8.5)→(13,8.5) e (7,11.5)→(11,11.5) |
| E5 | **Do título ao ativo** | retângulo (3,3)→(10,12); retângulo (13,12)→(21,21) com linha (13,15)→(21,15); conector (10,7.5)→(16.5,7.5)→(16.5,11) com seta (14.8,9.3)/(18.2,9.3) |
| E6 | **Ciclo em quatro tempos** | anel r 8 em (12,12) com 4 vãos de 20° em 0/90/180/270°; ponto cheio r 1.4 em cada vão |

**Destino do atual.** `.np-cases-band` + `#npAskForm` **saem** (falas → S4 e `catalogo-cards.json`);
`.np-axes` **sai**; `.np-flags` → ids `#eixo-N` passam às células (headlines e 3 diferenciais
por eixo vão para `catalogo-cards.json`/internas); `#npGrid` **sai** (links → `details`);
`.np-closer` **sai**; `.np-spot-ico` substituídos pelo sprite. `data-assunto` na home fica só
no `select#cf-eixo`/`?assunto=`.

**Testes** (`contratos-qa` §2.2, 2 viewports): 6 artigos visíveis, 0 `hidden`, 0 `role=tab`;
6 `use[href]` distintos; sem JS tudo presente; `/#eixo-N` em viewport via `:target`; Tab
percorre 6 CTAs com foco visível; destino 200 sem redirect e `body.np-pillar-<slug>` igual;
`details` fechado por padrão com 21 links → 200 e em sitemap.

---

### 04 · Por que o Complexo DMC? — `#porque` · parciais `porque.html`, `porque.css`

**Objetivo.** Seis razões de método (referência §4), lidas em < 1 min; responde "é advocacia?",
"vou pagar por opinião?", "quem garante os números?", "IA no meu contrato?". Absorve `.fatos`
e `#results` (Ad-tech vira item 6 com o único link).

**Fundo/transição — o mosaico editorial.** Seção `--surface-0`; **painel de papel à direita
sangra até a borda da tela**: visto após 03, o papel que ocupava tudo "recolhe" para 7 colunas
e o grafite entra pela esquerda. Um só contraste grande, não seis caixas.

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
        <li class="porque-item dmc-reveal" style="--i:0"><h3 class="dmc-h4">[copy] Um caso, um plano, um responsável</h3><p>Uma sucessão pode envolver holding, tributo e matrícula ao mesmo tempo; aqui os seis eixos trabalham o mesmo caso sob um só plano e um só responsável pela coordenação.</p></li>
        <li … --i:1><h3>Cenários antes do ato</h3><p>…referência §4.2…</p></li>
        <li … --i:2><h3>[copy] Cada ato com quem a lei habilita</h3><p>Contratos, pareceres e petições são de sociedades de advogados parceiras; escrituração e parecer de auditoria, de contadores e auditores habilitados; escrituras e registros, de cartórios conveniados. O Complexo DMC coordena o plano e responde pela consultoria.</p></li>
        <li … --i:3><h3>Quem lê os números não é quem os produz</h3><p>…§4.4…</p></li>
        <li … --i:4><h3>Acompanhamento com indicadores que o cliente vê</h3><p>…§4.5…</p></li>
        <li … --i:5><h3>Tecnologia a serviço dos eixos, com revisão de quem responde</h3><p>…§4.6…</p>
          <a class="dmc-btn dmc-btn--link" href="pages/tecnologia.html">Ver a tecnologia aplicada aos seis eixos<svg …/></svg></a></li>
      </ol>
    </div>
  </div>
</section>
```
Item 3 é a **única** ocorrência da fórmula completa de atribuição (S13). Sem ARTHEU, IA de
minutas, tribunais, API, PCD `[CEO 4]`; parceiros só por categoria `[CEO 5]`.

| Largura | Grade |
|---|---|
| 1440/1024 | `.porque { padding-block: 0; overflow-x: clip; }` `.porque-grid` 12 col `align-items:start`. `.porque-intro` `1 / span 4`, `position: sticky; top: calc(var(--header-h-lg) + var(--space-6))`, `padding-block: var(--space-section)`. `.porque-panel` `6 / span 7`, `position:relative; isolation:isolate; padding: var(--space-section) var(--space-8) var(--space-section) var(--space-9)`; `::before { content:''; position:absolute; inset:0 -100vw 0 0; background: var(--surface-paper); z-index:-1 }` |
| 768 | 8 col: intro `1 / -1` (não sticky), `padding-top: var(--space-section)`; painel `1 / -1`, `margin-inline: calc(-1 * var(--gutter))`, `padding: var(--space-9) var(--gutter)`; `::before` vira `inset:0` (sem sangria extra) |
| 390/375/320 | 1 col; igual a 768 |

`.porque-list`: `counter-reset: porque`; `.porque-item`: `border-top: 1px solid var(--color-line-ink)`,
`padding-block: var(--space-6)`, grade `3rem 1fr` (≥640) / 1 col (<640, número acima do título);
`::before { content: counter(porque, decimal-leading-zero); font: var(--num-font); color: var(--color-gold-deep) }`
(seção da casa: ouro, não cor de eixo). `h3.dmc-h4` `--text-ink-1`; `p` `--text-ink-2`,
`max-width: 34rem`; último item com `border-bottom`. Único link no item 6, `margin-top: var(--space-3)`.

**Motion.** Reveal com stagger 0–5. **A11y.** `ol` real; números CSS espelham o DOM.
**Testes.** 6 `li`; texto sem `\d+\s*%|garant|clientes|anos de`; 1 link → `pages/tecnologia.html` 200;
axe por seção em 1440 e 390; `getBoundingClientRect().right ≤ clientWidth` (a sangria não conta
no `scrollWidth` por causa do `overflow-x: clip`).

---

### 05 · Verticais de Negócios — `#verticais` (alta prioridade) · parciais `verticais.html`, `verticais.css`, `verticais.js`

**Objetivo.** Falar a língua do setor com painéis fotográficos grandes e movimento discreto; a
decisão do setor como headline, a fala do cliente como eyebrow, um CTA nomeado para uma página
real. Painel 1 (construção civil, segmento mais documentado) manda.

**Fundo/transição.** `--surface-0`; corte com o papel de 04 (o papel sangrado termina, o preto
volta inteiro). Sai para 06 com fio.

```html
<section class="dmc-section verticais" id="verticais" aria-labelledby="verticais-title">
  <div class="dmc-wrap">
    <div class="dmc-sec-head dmc-reveal">
      <p class="dmc-overline">Verticais de negócio</p>
      <h2 class="dmc-h1" id="verticais-title">[copy] Setores diferentes, <em>a mesma pergunta</em>: qual é a decisão a tomar e que eixos ela envolve.</h2>
    </div>
  </div>
  <ol class="dmc-wrap dmc-wrap--wide verticais-grid">
    <li class="verticais-cell verticais-cell--wide">
      <article class="verticais-item dmc-reveal" aria-labelledby="vert-1-titulo" data-vertical="construcao">
        <figure class="verticais-item__media" aria-hidden="true">
          <picture>
            <source type="image/avif" media="(min-width:1024px)" srcset="assets/images/home/vertical-construcao.avif">
            <source type="image/webp" media="(min-width:1024px)" srcset="assets/images/home/vertical-construcao.webp">
            <source type="image/avif" srcset="assets/images/home/vertical-construcao-m.avif">
            <img src="assets/images/home/vertical-construcao-m.webp" width="1200" height="750" loading="lazy" decoding="async" alt="">
          </picture>
          <video class="verticais-item__loop" muted loop playsinline preload="none" tabindex="-1" disablepictureinpicture hidden
                 data-src-webm="assets/videos/home/vertical-construcao.webm" data-src-mp4="assets/videos/home/vertical-construcao.mp4"></video>
          <span class="verticais-item__veil"></span>
        </figure>
        <div class="verticais-item__body">
          <p class="verticais-item__num">01 <span>Construção civil e incorporação</span></p>
          <p class="verticais-item__eyebrow">“Tenho um terreno e não sei se o empreendimento fecha.”</p>
          <h3 class="verticais-item__title" id="vert-1-titulo">Do terreno à matrícula de <em>cada unidade</em>.</h3>
          <p class="verticais-item__text">Due diligence do terreno, incorporação, venda e registro coordenados em um só plano, com atos lavrados por cartórios conveniados.</p>
          <a class="dmc-btn dmc-btn--secondary" href="pages/consultoria-imobiliaria.html">Avaliar um terreno ou empreendimento<svg …/></svg></a>
        </div>
      </article>
    </li>
    <li class="verticais-cell"> … 02 … </li> … 05 …
  </ol>
</section>
```

**Conteúdo** (referência §3 + fatos §4; cinco destinos distintos; sem "gestão patrimonial"):

| # | slug | Setor (`__num span`) | Eyebrow (voz do cliente) `[copy]` | Headline | Frase (≤ 200) | CTA → destino |
|---|---|---|---|---|---|---|
| 01 | `construcao` | Construção civil e incorporação | "Tenho um terreno e não sei se o empreendimento fecha." | Do terreno à matrícula de *cada unidade*. | Due diligence do terreno, incorporação, venda e registro coordenados em um só plano, com atos lavrados por cartórios conveniados. | Avaliar um terreno ou empreendimento → `pages/consultoria-imobiliaria.html` |
| 02 | `familias` | Empresas familiares e holdings | "Os sócios são irmãos e ninguém combinou a sucessão." | Quem herda as quotas e *quem assume o comando*. | Holding, acordo de sócios e protocolo familiar desenhados juntos, com a carga tributária de cada cenário calculada no diagnóstico. | Conversar sobre a sucessão da família → `pages/planejamento-sucessorio.html` |
| 03 | `grupos` | Grupos empresariais | "São quatro empresas e nenhuma estrutura foi pensada em conjunto." | Regime, estrutura e integridade *decididos com fundamento*. | Comparação documentada de regimes com os números da própria empresa, reorganização societária e programa de integridade sob uma só governança. | Pedir o diagnóstico tributário → `pages/planejamento-tributario.html` |
| 04 | `patrimonio` | Investidores e estrutura patrimonial | "Tenho imóveis e participações e não sei o que está em meu nome." | Imóveis e participações sob uma estrutura *que se explica*. | Centralização em holding, governança e tributação avaliadas caso a caso, com a leitura independente dos números de cada participação. | Conversar sobre a estrutura do patrimônio → `pages/holding-patrimonial.html` |
| 05 | `terras` | Famílias que detêm imóveis e terras `[CEO 6]` | "A área está na família há gerações e a matrícula não bate." | A terra em ordem *na matrícula e na sucessão*. | Retificação de área, regularização fundiária e transmissão das terras entre gerações tratadas em conjunto, antes de qualquer escritura. | Conversar sobre as terras e a sucessão → `pages/registro-imobiliario.html` |

Painel 05 só com o texto genérico autorizado (sem "agro", "rural", ITR, CAR); se o CEO aprovar
"Agronegócio", muda só o rótulo. Credores (E5) e empregadores (E6) ficam cobertos por 03.

**Layout.**
| Largura | `.verticais-grid` | painel 1 (`--wide`) | painéis 2–5 | texto |
|---|---|---|---|---|
| 1440 | 12 col, `gap: var(--grid-gap)`, `margin-top: var(--space-block)` | `1 / -1`, mídia `aspect-ratio: var(--ratio-wide)` (≈ 1344×576), `max-height: min(72vh, 40rem)` | `span 6`, `aspect-ratio: var(--ratio-panel)` (≈ 656×410) | **sobre o véu**: `__body` absoluto `inset:0`, `display:grid; align-content:end`, `padding: var(--space-8)`, `max-width: 34rem` (painel 1: `max-width: 40rem`) |
| 1024 | idem | `aspect-ratio: 2 / 1` | `span 6`, 16:10 | sobre o véu, `padding: var(--space-7)`, `max-width: 30rem`; `__text` oculto nos painéis 2–5 (`display:none`) para caber |
| 768 | 8 col, `gap: var(--space-6)` | `1 / -1`, 16:10 | `span 4`, 16:10 | **fora da imagem**: `__body` em fluxo abaixo da `figure`, fundo `--surface-1`, `padding: var(--space-6)`; `__veil` e `video` ausentes (`display:none`) |
| 390/375/320 | 1 col, `gap: var(--space-7)` | 16:10, largura do `.dmc-wrap` (não sangrar) | idem | fora da imagem, `padding: var(--space-5) var(--space-5) var(--space-6)`; CTA `width:100%` |

`.verticais-item`: `position:relative; display:grid; border-radius: var(--radius-2); overflow:hidden;
background: var(--surface-1); min-width:0`. `__media`: `margin:0; position:relative; overflow:hidden;
background: var(--surface-2)` (reserva de cor antes do lazy); `img, video { position:absolute;
inset:0; width:100%; height:100%; object-fit:cover; display:block }`; `video` por cima do `img`
com `opacity:0 → 1` (700 ms) quando `is-playing`. `__veil` (só ≥1024): `position:absolute;
inset:0; background: linear-gradient(90deg, var(--veil) 0 42%, var(--veil-off) 72%),
linear-gradient(0deg, var(--veil-mid) 0 30%, var(--veil-off) 60%)` — o único degradê da home,
inteiro em tokens; contraste pior caso `--text-1` ≥ 15:1, `--text-2` ≥ 8,9:1.
`__num`: `font: var(--num-font)` ouro (`--color-gold` sobre escuro) + `span` setor em `--text-3`
peso 400 `margin-left: .6em`. `__eyebrow`: Newsreader 300 itálico `--fs-h4`, `--text-2`,
`max-width: 28rem`. `__title`: Newsreader 300 `font-size: var(--fs-h2)` (painel 1) / `--fs-h3`
(2–5), `line-height: var(--lh-heading)`, `text-wrap: balance`, `max-width: 16ch`, `--text-1`.
`__text`: corpo `--text-2`, `max-width: 32rem`. CTA `.dmc-btn--secondary` (fio
`--color-line-strong`, seta ouro) **visível sem hover**, `outline-offset: -4px` em foco (não
cortar pelo `overflow:hidden`). O `h3` **não** está dentro de link; um só `a` por painel.

**Motion.** Reveal por painel (`--i` 0–4). ≥1024 `:hover/:focus-within` → `img, video
{ transform: scale(1.02) }` 400 ms `--ease-out`. Loop de vídeo (`verticais.js`,
`initVerticais()`): gate `matchMedia('(min-width:1024px)')` **e** `prefers-reduced-motion:
no-preference` **e** `!navigator.connection?.saveData`; IO `threshold .25`: ao entrar, injeta
`<source>` a partir de `data-src-*` (uma vez), remove `hidden`, `play()`; ao sair, `pause()`;
`visibilitychange` pausa; `playing` → classe `is-playing`. Fora do gate o `video` nunca recebe
`src` (0 bytes) e o poster `<picture>` é a imagem final. Sem sticky, sem rAF.

**Plano de mídia** — ver §4 (nomes `assets/images/home/vertical-<slug>[-m].{avif,webp}`,
`assets/videos/home/vertical-<slug>.{webm,mp4}`). Placeholder até o render: `figure` com
`background: linear-gradient(160deg, var(--surface-3), var(--surface-1))` + ruído SVG inline
(`feTurbulence baseFrequency .8`, opacidade .06) — já lê como final; `aspect-ratio` reserva o
espaço (CLS 0). Fotografia licenciada `[CEO 12]` entra com os mesmos nomes e proporções.

**Testes** (`contratos-qa` §2.3): 5 `article` em `#verticais`, 5 links distintos → 200 sem
redirect e em sitemap; `picture` com avif+webp, `img[width][height][loading=lazy][decoding=async]`;
`alt=""` com headline no `article`; nenhuma imagem > 250 KB; 0 overflow em 320; em 390 0 `video[src]`;
em 1440 + reduce 0 `video[src]`; em 1440 controle `video.is-playing` em ≥ 1 painel após rolar.

---

### 06 · Presença Nacional — `#presenca` · parciais `presenca.html`, `presenca.css`, `presenca.js` (→ `assets/js/brasil.js`), `brasil-min.svg`, `brasil-capitais.js`

**Objetivo.** "De São Paulo, conectados aos desafios do Brasil." Sede + alcance nacional e
internacional (**D9**) sem números, praças ou legenda de cobertura. É a única cena animada fora
do herói — a camada "inovação digital" da direção C.

**Fundo/transição.** `--surface-0`, `.dmc-section--rule` (fio com 05). 35 % texto / 65 % visual.

```html
<section class="dmc-section dmc-section--rule presenca" id="presenca" aria-labelledby="presenca-title">
  <div class="dmc-wrap presenca-grid">
    <div class="presenca-text dmc-sec-head dmc-reveal">
      <p class="dmc-overline">Presença</p>
      <h2 class="dmc-h1" id="presenca-title">De São Paulo, <em>conectados aos desafios</em> do Brasil.</h2>
      <p class="dmc-lead">[copy · D9] Sede em São Paulo e casos conduzidos em todo o Brasil e no exterior, com parceiros habilitados e cartórios conveniados onde o ativo ou a empresa estão.</p>
      <address class="presenca-sede dmc-small">Rua Riachuelo, 231 · São Paulo, SP</address>
      <a class="dmc-btn dmc-btn--link" href="#contact">Descrever a situação<svg …/></svg></a>
    </div>
    <figure class="presenca-mapa dmc-reveal" data-rede="brasil" data-motion="still" style="--i:1">
      <svg class="presenca-mapa__svg" viewBox="0 0 1000 1000" role="img" aria-labelledby="presenca-mapa-titulo">
        <title id="presenca-mapa-titulo">Mapa do Brasil com a sede do Complexo DMC em São Paulo</title>
        <g class="presenca-mapa__ufs"> 27 × <path data-uf="XX" d="…"/> </g>
        <g class="presenca-mapa__nos"> 26 × <circle data-uf="XX" cx cy r="2.5"/> + <circle data-uf="SP" class="is-sede" cx="650" cy="719" r="5"/> </g>
        <text class="presenca-mapa__rotulo" x="668" y="724">São Paulo</text>
      </svg>
      <!-- canvas injetado por brasil.js só em ≥768 e sem reduce -->
    </figure>
  </div>
</section>
```
`address { font-style: normal }`. Nenhum número, nenhuma lista de praças, nenhuma legenda.

| Largura | `.presenca-grid` |
|---|---|
| 1440/1024 | 12 col `align-items:center`: texto `1 / span 4`; mapa `6 / span 7`, `aspect-ratio: var(--ratio-map)`, `max-width: 42rem` (1440) / `38rem` (1024), `justify-self:end` |
| 768 | 8 col: texto `1 / -1`; mapa `2 / span 6`, `max-width: 34rem`, `margin-top: var(--space-8)` |
| 390/375/320 | 1 col; mapa `width:100%; max-width: 22rem; margin-inline:auto` (viewBox quadrado: nunca estoura) |

**SVG inline (`brasil-min.svg`)**: gerado de `geo/brasil.json` re-simplificado (Douglas-Peucker
2–2,5 px; **meta ≤ 12 KB, limite 16 KB** — medir; acima disso usar DP 3 px). Estilo por CSS:
`path { fill: var(--surface-2); stroke: var(--color-line-strong); stroke-width: .8; vector-effect: non-scaling-stroke }`;
`path[data-uf="SP"] { fill: var(--surface-3) }`; `circle { fill: var(--text-3) }`;
`.is-sede { fill: var(--color-gold) }` + anel `circle r=12 fill=none stroke=var(--color-gold) opacity=.35`;
`__rotulo` Hanken 11 `fill: var(--text-2)`. **Sem** `perspective/rotateX` (S7).

**Canvas (`assets/js/brasil.js`, módulo autônomo ~200 l., sem dependência de `rede-neural.js`)**:
`import { CAPITAIS } from './data/brasil-capitais.js'` (27 pares `[x,y]` copiados de
`brasil.json`; sem `fetch`). `whenNear(fig, '300px 0px')` monta **só** se
`matchMedia('(min-width:768px)')` **e** `prefers-reduced-motion: no-preference`; caso
contrário `data-motion="still"` e o SVG é tudo. Com canvas: `position:absolute; inset:0;
aria-hidden`, `is-live` na figura, `data-motion="running"`. Três planos: SVG (z 0, parado) ·
arestas SP→26 capitais em quadráticas com controle deslocado 8 % perpendicular (z .6,
`--text-3` a .14) · nós e pulsos (z 1; SP ouro com halo `lerp .1`; pulsos ouro saindo de SP,
máx. 4, intervalo 900 ms, 1,6–2,4 s, fade senoidal). Paralaxe de cursor `0.02·z` com lerp .06;
`pointermove` realça a aresta mais próxima. ≤ 30 fps, DPR ≤ 2, rAF só com IO + aba visível.
`reduce.addEventListener('change')` → `still()` (um quadro, sem pulsos) + `data-motion="still"`.
Cores lidas por `getComputedStyle` (`--color-gold-rgb`, `--text-3` → expor
`--text-3-rgb: 154,152,147` em `_shared.css` para não duplicar literal).

**Motion.** Reveal no texto e na figura (o SVG já está no HTML; o canvas entra por `opacity` 700 ms).

**Testes** (`contratos-qa` §2.4, substitui `movimento.spec` l. 49-66): 390 → 0 `canvas`, SVG
visível; 1440 + reduce → `data-motion="still"` e ≤ 1 rAF/s; 1440 controle → `running` e > 10
rAF/s; 27 `path[data-uf]`, 1 `.is-sede`; texto sem `/\d+\s*(estados|países|cidades|municípios|clientes|%)/i`;
0 requisições fora da origem.

---

### 07 · Inteligência & Publicações — `#publicacoes` · parciais `publicacoes.html`, `publicacoes.css`

**Objetivo.** Mostrar que a casa escreve, **só com o que existe** (1 publicação real:
`pages/por-que-urgente.html`). Vazio honesto que converte para 09.

**Fundo/transição.** Papel; corte com o preto de 06 (abre o bloco de papel 07+08+09).

```html
<section class="dmc-section dmc-on-paper publi" id="publicacoes" aria-labelledby="publi-title">
  <div class="dmc-wrap publi-grid">
    <div class="dmc-sec-head dmc-reveal publi-head">
      <p class="dmc-overline">Inteligência</p>
      <h2 class="dmc-h1" id="publi-title">[copy] O que escrevemos sobre <em>o que fazemos</em>.</h2>
    </div>
    <article class="publi-destaque publicacao np-pillar-patrimonial dmc-reveal" style="--i:1" aria-labelledby="publi-1-titulo">
      <p class="publi-destaque__meta dmc-small"><span class="publi-destaque__eixo">E1 · Patrimonial e Sucessório</span> <time datetime="2026-10-17">Revisado em 17 out 2026</time></p><!-- time: [CEO 7] -->
      <h3 class="publi-destaque__title" id="publi-1-titulo">Por que planejar a sucessão em vida</h3>
      <p class="publi-destaque__text">[copy ≤ 200] Legítima, inventário e ITCMD progressivo (EC 132/2023): o que muda quando a decisão é tomada antes.</p>
      <a class="dmc-btn dmc-btn--link" href="pages/por-que-urgente.html">Ler a análise<svg …/></svg></a>
    </article>
    <aside class="publi-proximas publicacoes__vazio dmc-reveal" style="--i:2" aria-labelledby="publi-proximas-titulo">
      <p class="dmc-overline" id="publi-proximas-titulo">Em preparação</p>
      <ul class="publi-proximas__list" aria-hidden="true"><li><span class="publi-proximas__slot"></span></li><li><span class="publi-proximas__slot"></span></li></ul>
      <a class="dmc-btn dmc-btn--link" href="#newsletter">Receber quando sair<svg …/></svg></a>
    </aside>
  </div>
</section>
```

| Largura | `.publi-grid` |
|---|---|
| 1440/1024 | 12 col: head `1 / -1`; destaque `1 / span 7`; aside `9 / span 4`, `border-left: 1px solid var(--color-line-ink)`, `padding-left: var(--space-6)`, `min-height` = altura do destaque (grid `align-items: stretch`) |
| 768 | 8 col: destaque `1 / -1`; aside `1 / -1`, `border-left:0; border-top: 1px solid var(--color-line-ink); padding: var(--space-6) 0 0` |
| 390/375/320 | 1 col, idem 768 |

Destaque: `__eixo` em `rgb(var(--np-accent-deep))` (E1 petróleo deep sobre papel 4,6:1 em 14/500);
`time` `--text-ink-3`; `__title` Newsreader 300 `--fs-h2`, `max-width: 18ch`, `--text-ink-1`;
`__text` `--text-ink-2`, `max-width: 32rem`. **Sem imagem**. Aside: dois `li` com
`border-top: 1px solid var(--color-line-ink)`, `padding-block: var(--space-5)`; `__slot` =
traço 2 rem × 1 px `--color-line-ink`. Sem título fictício, sem data, sem "em breve", sem linha do
Provimento. Quando houver 3 publicações reais: o aside morre e o grid vira 3 `article.publicacao`
(`span 4`), mesma anatomia (meta, título `--fs-h3`, 1 linha, link), `time` ISO ≤ hoje.

**Testes** (`contratos-qa` §2.5): link → 200 e em sitemap; `datetime` válido e ≤ hoje (tolerar
ausência); 0 `lorem|título do artigo|em breve` fora de `.publicacoes__vazio`; sem JSON-LD `Article`.

---

### 08 · Como conduzimos (Método e formação) — `#treinamentos` · parciais `metodo.html`, `metodo.css`

**Objetivo.** O método em quatro etapas (o que o cliente recebe) + o único programa de formação
documentado. Substitui seis cursos sem lastro `[CEO 3]`.

**Fundo/transição.** Papel; `.dmc-section--rule` com fio tinta (continua 07). **Id mantido**
(28 rodapés + `navbar.js`); rótulo "Treinamentos" no menu/rodapés → `[CEO 15]`.

```html
<section class="dmc-section dmc-on-paper dmc-section--rule metodo" id="treinamentos" aria-labelledby="metodo-title">
  <div class="dmc-wrap metodo-grid">
    <div class="dmc-sec-head dmc-reveal metodo-head">
      <p class="dmc-overline">Método e formação</p>
      <h2 class="dmc-h1" id="metodo-title">[copy] Como <em>conduzimos</em> uma decisão.</h2>
      <p class="dmc-lead">[copy] A conversa inicial leva a um diagnóstico; o diagnóstico, a uma proposta com escopo, etapas e entregas.</p>
    </div>
    <ol class="metodo-etapas">
      <li class="metodo-etapa dmc-reveal" style="--i:0"><h3 class="dmc-h4">Diagnóstico</h3><p>[copy ≤ 140]</p></li>
      <li … --i:1><h3>Cenários e decisão</h3><p>…</p></li>
      <li … --i:2><h3>Estruturação e implementação</h3><p>…</p></li>
      <li … --i:3><h3>Acompanhamento e revisão</h3><p>…</p></li>
    </ol>
    <aside class="metodo-programa dmc-reveal" style="--i:4" aria-labelledby="metodo-programa-titulo">
      <p class="dmc-overline">Formação</p>
      <h3 class="dmc-h4" id="metodo-programa-titulo">Arquitetura Patrimonial Estratégica</h3>
      <p class="metodo-programa__meta dmc-small">Programa de formação institucional · 42 horas · online</p>
      <p>[copy] Os fundamentos do eixo patrimonial e sucessório para empresários, gestores e equipes que decidem com base neles.</p>
      <a class="dmc-btn dmc-btn--link" href="plataforma-ead/">Conhecer a plataforma<svg …/></svg></a>
    </aside>
  </div>
</section>
```

| Largura | `.metodo-grid` |
|---|---|
| 1440/1024 | 12 col: head `1 / -1`; etapas `1 / span 8` em `repeat(4, minmax(0,1fr))`, `column-gap: var(--grid-gap)`; aside `10 / span 3`, `border-left: 1px solid var(--color-line-ink)`, `padding-left: var(--space-6)`, `align-self:start` |
| 768 | 8 col: etapas `1 / -1` em `repeat(2, …)`, `row-gap: var(--space-6)`; aside `1 / -1`, `border-left:0; border-top: 1px solid var(--color-line-ink); padding: var(--space-6) 0 0; margin-top: var(--space-8)` |
| 390/375/320 | 1 col; etapas em pilha com fio |

`.metodo-etapa`: `border-top: 1px solid var(--color-line-ink)`, `padding: var(--space-6) 0`,
`counter-reset` na `ol`; `::before` = `counter(etapa, decimal-leading-zero)` em
`font: var(--num-font)` `--color-gold-deep`, `margin-bottom: var(--space-3)`; `h3` `--text-ink-1`;
`p` `--text-ink-2`. Aside **sem caixa** (fio à esquerda). Sem preço, sem módulos ("trust/offshore",
"blindagem"), sem os outros 3 cursos do seed, sem `login.html?curso=`.

**Testes** (`contratos-qa` §2.6): todo nome de programa citado existe como `titulo` em
`plataforma-ead/js/data.js`; `plataforma-ead/` → 200; 0 links `login.html?curso=`.

---

### 09 · Newsletter — `#newsletter` · parciais `newsletter.html`, `newsletter.css`, `newsletter.js`

**Objetivo.** Captura leve: nome, e-mail, empresa opcional, consentimento, descadastro; nunca
afirmar cadastro sem 2xx `{ok:true}`.

**Fundo/transição.** Papel, `.dmc-section--rule` com fio tinta (fecha o bloco de papel; `#video`
vem em corte).

```html
<section class="dmc-section dmc-on-paper dmc-section--rule news" id="newsletter" aria-labelledby="news-title">
  <div class="dmc-wrap news-grid">
    <div class="dmc-sec-head news-head">
      <p class="dmc-overline">Newsletter</p>
      <h2 class="dmc-h1" id="news-title">[copy] Receba as <em>próximas análises</em>.</h2>
      <p class="dmc-lead">[copy] Textos curtos, sem periodicidade prometida: só quando há algo a dizer sobre sucessão, tributo, matrícula, números, crédito ou passivo trabalhista.</p>
      <p class="dmc-small news-head__legal">Você pode se descadastrar a qualquer momento pelo link de cada e-mail.</p>
    </div>
    <form class="dmc-form news-form" id="newsletterForm" action="/api/newsletter" method="post" data-origem="home" novalidate aria-describedby="nlMessage">
      <div class="news-form__row">
        <div class="form-field"><label for="nl-nome">Nome</label><input id="nl-nome" name="nome" autocomplete="name" required></div>
        <div class="form-field"><label for="nl-email">E-mail</label><input id="nl-email" name="email" type="email" autocomplete="email" required></div>
      </div>
      <div class="news-form__row">
        <div class="form-field"><label for="nl-empresa">Empresa <span class="form-opcional">(opcional)</span></label><input id="nl-empresa" name="empresa" autocomplete="organization"></div>
        <div class="news-form__submit"><button class="dmc-btn dmc-btn--primary" type="submit">Quero receber análises</button></div>
      </div>
      <div class="form-hp" aria-hidden="true"><label for="nl-website">Site</label><input id="nl-website" name="website" tabindex="-1" autocomplete="off"></div>
      <div class="form-consent"><input type="checkbox" id="nl-consentimento" name="consentimento" required><label for="nl-consentimento">Autorizo o Complexo DMC a usar meu nome e e-mail para enviar análises, nos termos da LGPD (Lei 13.709/2018) e da <a href="pages/politica-de-privacidade.html">Política de Privacidade</a>.</label></div>
      <p class="form-message" id="nlMessage" role="status" aria-live="polite"></p>
    </form>
  </div>
</section>
```
**O `<form>` leva `class="dmc-form"`** (juiz 2: `.form-field/.form-consent/.form-message` estão
escopados a `.dmc-form` em `styles.css` 1018-1057) — nenhum segundo visual de campo.

| Largura | `.news-grid` | `.news-form__row` |
|---|---|---|
| 1440/1024 | 12 col: head `1 / span 5`; form `7 / span 6` | `repeat(2, minmax(0,1fr))`, `gap: var(--space-4)`; `__submit` alinhado ao fim (`align-self:end`) |
| 768 | 8 col: head `1 / -1`; form `1 / -1` | 2 col (linha 2: empresa + botão) |
| 390/375/320 | 1 col | 1 col; botão `width:100%` |

`newsletter.js` (`initNewsletter()`, clone de `initForm` de `main.js` 106-223): `aria-busy` +
botão desabilitado durante o envio; valida obrigatórios (`:invalid`, foco no 1.º); envia JSON
`{nome, email, empresa, consentimento:true, origem: form.dataset.origem}`; **sucesso só com 2xx e
`{ok:true}`** → "Inscrição registrada." (ponto; sem prometer e-mail) e campos limpos; `400`
`{error, campos}` → `aria-invalid` + `aria-describedby` + `p.form-field__error` com ícone (padrão
`54e66ab`), foco no 1.º inválido; `429/413/503/falha de rede` → "Não foi possível registrar agora.
Tente de novo em alguns minutos ou escreva para administrativo@complexodmc.com.br." — a mensagem
de erro **nunca** contém "receb" nem "cadastrad". Sem JS: `POST` nativo (urlencoded aceito pelo
blueprint). Backend: `blueprint-newsletter.md` (fullstack-architect; bloqueio `RESEND_API_KEY`
não impede o 201 + persistência).

**Testes**: `newsletter.spec.js` (`contratos-qa` §3.1) + `server/test/newsletter.test.js`;
`a11y` cobre nomes acessíveis; texto visível da seção contém "descadastr" e o `label` do
consentimento contém "LGPD" e o link da política `[CEO 9]`.

---

### Vídeo — `#video` (mantido)
Penúltimo bloco, antes de `#contact`; `data-video=""` até o ID `[CEO 11]`. H2 `[copy]` "O
Complexo DMC <em>em vídeo</em>." (troca de texto só).

### 10 · CTA final + Contato — `#contact` (mantido)
Form, ids, `#formMessage`, `select#cf-eixo`, `data-origem="home"` intactos. H2 `[copy]` "Comece
pela <em>decisão a tomar</em>." WhatsApp dentro da seção segue como link secundário.

### Rodapé — `#rodape` (mantido + ajustes da sessão "Parcerias + header")
Lista "Sobre": acrescentar `<li><a href="#newsletter">Newsletter</a></li>` (mesmo estilo);
renomear "Área do aluno" → **"DMC Business School"** (href `plataforma-ead/login.html`) e
"Ad-tech" → **"ADTECH"** (mesmo href); `<li><a href="parcerias/">Parcerias</a></li>` após
"Tecnologia" **só quando** `complexodmc.com.br/parcerias/index.html` existir no HEAD. Links
`#features` e `#treinamentos` continuam válidos.

**Grafia oficial em todo texto novo da home: "ADTECH"** (nunca "Ad-tech"/"Plataforma Ad-tech").
Vale para o item 6 de 04 e para qualquer `alt`/`aria-label`; neste documento "Ad-tech" aparece
apenas como referência interna a seções/pendências antigas.

### Flutuantes (mantidos; 1 regra JS)
`.whatsapp-float` visível desde o início (S11). `main.js`: ao clicar em `[data-assunto="EN"]` ou
ao chegar com `?assunto=EN`, o `href` passa a `wa.me/5511915267749?text=` +
encodeURIComponent("Olá! Gostaria de uma conversa inicial sobre <nome curto do eixo>.");
sem eixo, mantém o texto atual.

---

## 4. Plano de mídia para o `video-3d-producer`

**Linguagem comum às cinco cenas** (brief de direção; faz as cinco "lerem igual"): câmera 35 mm
equivalente, ¾ elevado (~22°; cena `grupos` ~30°), horizonte no terço superior; luz-chave quente
3200 K de cima-esquerda, intensidade baixa; preenchimento frio quase nulo; névoa de profundidade
`--surface-1`→`--surface-0`; materiais foscos em `--color-graphite-700/600`; **ouro `#d6b069`
≤ 3 % da área** (arestas finas ou um único plano pequeno); grão monocromático 2–3 % aplicado no
render (não em CSS); vinheta .2; **canto inferior esquerdo e faixa inferior sempre mais escuros**
(onde o texto cai em ≥1024); nenhum brilho, bloom, lens-flare, texto, pessoa, logotipo, neon ou
azul saturado. Loop: movimento de câmera ≤ 2 % de deslocamento (dolly/paralaxe lenta) com
ping-pong ou costura por crossfade de 12 quadros; ≤ 6 s; sem áudio.

**Técnica.** Cena Three.js (lib local só no pipeline, **nunca no site**) ou Canvas 2D, renderizada
pelo Chromium do Playwright em `deviceScaleFactor: 1`; quadros PNG → ffmpeg:
AVIF `libaom-av1 -crf 30 -still-picture 1`, WebP `-q 78`, WebM `libvpx-vp9 -b:v 0 -crf 36 -g 60`,
MP4 `libx264 -crf 24 -pix_fmt yuv420p -movflags +faststart`. `width/height` dos posters declarados
no HTML conforme abaixo.

| Arquivo | Dimensões | Formato | Orçamento | Cena / atmosfera |
|---|---|---|---|---|
| `assets/images/home/vertical-construcao.{avif,webp}` | 2560×1097 (21:9) | poster desktop | ≤ 110 KB AVIF / ≤ 150 KB WebP | massas prismáticas de concreto em obra: lajes empilhadas, grelha de formas, grua sugerida por uma linha; vista próxima (o herói já é skyline); maquete noturna |
| `assets/images/home/vertical-construcao-m.{avif,webp}` | 1200×750 (16:10) | poster mobile/768 | ≤ 60 KB / ≤ 80 KB | idem, reenquadrado |
| `assets/videos/home/vertical-construcao.{webm,mp4}` | 1680×720 | loop ≤ 6 s | ≤ 1 MB cada | dolly lateral lento |
| `assets/images/home/vertical-familias.{avif,webp}` | 1600×1000 (16:10) | poster desktop | ≤ 90 KB / ≤ 120 KB | pórticos de pedra em recuo (cinco profundidades = gerações), piso com reflexo fosco |
| `assets/images/home/vertical-familias-m.{avif,webp}` | 1200×750 | poster mobile | ≤ 60 KB | idem |
| `assets/videos/home/vertical-familias.{webm,mp4}` | 1280×800 | loop ≤ 6 s | ≤ 1 MB | avanço lento pelo eixo dos pórticos |
| `assets/images/home/vertical-grupos.{avif,webp}` + `-m` | 1600×1000 / 1200×750 | posters | idem | volumes separados sobre plano escuro ligados por hairlines douradas (estrutura societária como massa construída); vista ~30° — **não** é a rede neural (arestas retas, nós cúbicos) |
| `assets/videos/home/vertical-grupos.{webm,mp4}` | 1280×800 | loop | ≤ 1 MB | órbita de 3° |
| `assets/images/home/vertical-patrimonio.{avif,webp}` + `-m` | idem | posters | idem | lâminas translúcidas empilhadas com arestas em ouro, leve desalinhamento entre camadas; a mais sóbria |
| `assets/videos/home/vertical-patrimonio.{webm,mp4}` | 1280×800 | loop | ≤ 1 MB | luz deslizando pelas arestas |
| `assets/images/home/vertical-terras.{avif,webp}` + `-m` | idem | posters | idem | relevo baixo em malha de contorno (heightmap), divisas de parcelas em linhas claras, uma parcela em traço ouro; sol rasante; sem plantação, animais ou verde saturado |
| `assets/videos/home/vertical-terras.{webm,mp4}` | 1280×800 | loop | ≤ 1 MB | sombra do sol rasante varrendo |
| `docs/dmc/home-redesign/partials/brasil-min.svg` → inline | viewBox 0 0 1000 1000 | SVG | ≤ 12 KB (limite 16) | 27 `path[data-uf]` DP 2–2,5 px + 27 `circle[data-uf]`, SP `r=5.is-sede`; sem `id`, sem `fill/stroke` inline |
| `docs/dmc/home-redesign/partials/brasil-capitais.js` → `assets/js/data/` | — | módulo ES | ≤ 1 KB | `export const CAPITAIS = { AC:[x,y], … SP:[650.1,719.3] }` |
| `docs/dmc/home-redesign/partials/icones-eixos.svg` | 6 `<symbol>` 24×24 | SVG | ≤ 2 KB | geometria da §3·03 |
| (opcional, P3) `assets/images/og-presenca.webp` | 1200×630 | WebP | ≤ 80 KB | mapa sobre `--surface-0` com pulsos congelados |

Total de mídia nova no pior caso desktop (5 posters + 5 loops): ≈ 0,5 MB de imagem + ≤ 5 MB de
vídeo **sob demanda** (só o painel visível, só ≥1024, só sem reduce/saveData — nunca no peso
inicial nem no Lighthouse mobile). Mobile: 5 × ≤ 60 KB.

**Entrega**: arquivos nos caminhos finais + `docs/dmc/home-redesign/midia-relatorio.md` com peso
medido, comando ffmpeg usado e captura de contato (contact sheet) das cinco cenas lado a lado.

---

## 5. Plano de CSS/JS

### 5.1 Arquivos
| Arquivo | Ação | Versão |
|---|---|---|
| `assets/css/tokens.css`, `components.css` | **não mudam nesta frente** (`components.css` já está em `?v=3` pela sessão "Parcerias + header" — não editar aqui) | — |
| `assets/css/styles.css` | enxugar (5.2) | `?v=c4` → `c5` |
| `assets/css/home.css` | **novo** (concatenação dos parciais; ≤ 14 KB bruto / ≤ 4 KB gz); fundir em `styles.css` na publicação | `?v=1` |
| `assets/js/main.js` | − `initEixos`, `initBusca`, `sortearDestaque`; + `initNewsletter`, `initVerticais`, regra do WhatsApp | `?v=c3` → `c4` |
| `assets/js/rede-neural.js` | **deixa de ser carregado pela home**; arquivo permanece se alguma interna o usar (`grep -l rede-neural pages/ solucoes/`), senão marcar `@deprecated` | — |
| `assets/js/brasil.js` | **novo**, `type=module`, autônomo | `?v=1` |
| `assets/js/data/brasil-capitais.js` | **novo** | importado por `brasil.js` |
| `assets/js/video.js`, `navbar.js` | não mudam nesta frente (`navbar.js` já está em `?v=c4` pela sessão do header; rótulo "Treinamentos" = `[CEO 15]`) | — |
| `index.html` | ordem do DOM: `hero, conheca, features, porque, verticais, presenca, publicacoes, treinamentos, newsletter, video, contact`; `<main class="home">`; `<svg hidden>` dos ícones; `<link home.css>` após `styles.css`; `<script type=module brasil.js>` no lugar de `rede-neural.js` | — |

### 5.2 Mapa de estilos — `styles.css` (1192 l.)
| Linhas | Bloco | Destino |
|---|---|---|
| 17-52 | base | **fica** |
| 53-65 | fio de acento `::before` | **migra** para `_shared.css` como `.eixos-item::before`; o original morre com `.casa__tab/.np-axes/.np-card` |
| 67-168 | herói | **fica, intocado** |
| 170-197 | `.fatos` | **morre** |
| 199-334 | `.casa*` | **morre**; `casa.css` reescreve `.casa-grid/.casa-tese/.casa-ficha` (~35 l.) |
| 336-449 | `.np-section`, `.np-cases-band`, busca | **morre** |
| 451-500 | `.np-axes` | **morre** |
| 502-633 | `.np-flags/.np-flag*/.np-spot*` | **morre** |
| 635-680 | `.np-grid/.np-card` | **morre** |
| 682-694 | `.np-closer` | **morre** |
| 696-727 | `.treinos*` | **morre** (renasce como `.metodo-etapas`) |
| 729-788 | `.adtech*` | **morre** |
| 791-976 | `.page-video__*` + escopo `#video` | **fica** (bloco triplicado; não tocar) |
| 978-1142 | contato + `.dmc-form .form-*` | **fica**; a newsletter reutiliza via `class="dmc-form"` |
| 1144-1192 | flutuantes + reduce | **fica** |

Estimativa: `styles.css` 49 KB → ~27 KB; `home.css` ≈ 12 KB; soma ≤ 35 KB (meta do inventário).
Procedimento de corte: inventário §5 (listar seletores → grep no HTML novo, atenção às classes
criadas por JS: `is-playing`, `is-broken`, `is-in`, `is-live`, `visible`, `page-video__cover/__play`,
`form-field__error`, `is-enviando/sucesso/erro`, `data-motion` → cortar por bloco → Coverage em 390
e 1440 → suíte completa).

### 5.3 JS por parcial
- `verticais.js` → `initVerticais()` (gate + IO + `data-src-*` → `<source>`; `is-playing`).
- `presenca.js` → vira `assets/js/brasil.js` (módulo; `whenNear`, `size`, `loop/start/stop`,
  `still`, `data-motion`; cópia local das helpers `rng/triplet/rgba` — ~30 l.).
- `newsletter.js` → `initNewsletter()` (estados da §3·09).
- `main.js`: `initEixosAncora()` opcional (se `location.hash ∈ #eixo-1..6` ao carregar,
  `scrollIntoView` respeitando `scroll-margin-top`; sem ARIA, sem `replaceState`); WhatsApp
  qualificado. `.dmc-reveal` (IO existente) cobre as seções novas sem código.

### 5.4 Artefatos antes do corte (integrador)
- `docs/dmc/home-redesign/catalogo-cards.json`: 21 cards (`eixo, href, titulo, descricao,
  data-icone, data-busca, tags`) + 6 falas atuais + 6 falas reescritas (C: E4 "O banco pediu
  balanço revisado e os números da empresa não se explicam."; E6 "Tenho reclamatórias repetidas
  com os mesmos pedidos e não sei onde o passivo começa.") + 6 headlines dos painéis + 18
  diferenciais. Repositório canônico do catálogo depois que o HTML deixa de sê-lo.
- `docs/dmc/design-preview.html`: amostras de `.eixos-item`, `.porque-panel`, `.verticais-item`
  (21:9 e 16:10), `.presenca-mapa`, `.news-form` em 390 e 1440 antes de tocar o `index.html`.

---

## 6. Impacto em testes (detalhe em `contratos-qa.md`)

| Spec | Efeito |
|---|---|
| `home.spec.js` | **reescrever** → `eixos.spec.js` (§2.2: 6 artigos, 0 tabs, ícones distintos, `:target`, Tab, destinos com `np-pillar`, `details` com 21 links) |
| `movimento.spec.js` l. 49-66 | **substituir** pelo bloco `#presenca` (§2.4) + 2 asserções de vídeo de 05 (390 e reduce: 0 `video[src]`) |
| `navegacao`, `a11y`, `console`, `viewports`, `seo`, `rotas`, `formulario` | **mantêm**; `rotas` l. 187/189 exige as âncoras da §1.3; `viewports` por seção em 320 (03 grade, 04 sangria com `overflow-x: clip`, 05 painéis, 06 SVG, 09 form) |
| novos | `newsletter.spec.js` (§3.1), `home-secoes.spec.js` (§3.2: ordem dos 11 ids; `#video` antes de `#contact`; conformidade `\d+\s*%|garant|\d+\s*(clientes|anos de|prêmios|R\$)|líder|ranking|depoimento` = 0; atos citados com "parceiros habilitados|cartórios conveniados" na mesma seção; axe por seção 1440/390; overflow por seção; `img` fora do herói com lazy/width/height/≤ 250 KB; 0 `<img>/<svg>` de logo de terceiro fora do rodapé) |
| `server/test/newsletter.test.js` | novo (node --test, sem banco) |
| Lighthouse | `LH_PAGINAS=home LH_RUNS=5` após 03, 05 e 06; mediana; evidências em `docs/dmc/qa/<data>-home-v2/` |
| `QA.md` | atualizar a linha "home (tablist, #eixo-N)" |

Aprovação: todas as metas da §7 em **duas execuções consecutivas** da suíte filtrada e do
Lighthouse; qualquer "bloqueado" com motivo e dono.

---

## 7. Orçamento de performance e a11y (não regredir 99/100/100/100 · LCP 1,80 s · CLS 0,003 · TBT 0)

| Item | Limite |
|---|---|
| Caminho crítico | nada novo antes do poster do herói; `home.css` ≤ 4 KB gz (fundido em `styles.css` na publicação); sem fonte nova; `<svg hidden>` ≤ 2 KB após o herói no DOM |
| HTML | 104 KB → ≤ 72 KB (saem 21 cards, 6 painéis, 6 casos, SVGs de rede; entram 6 células, `details`, 5 painéis, mapa ≤ 12–16 KB) |
| CSS | `styles.css` + `home.css` ≤ 35 KB bruto |
| Imagens | 5 posters desktop ≤ 110 KB AVIF (painel 1) / ≤ 90 KB (2–5); mobile ≤ 60 KB; todas `lazy`, `decoding=async`, `width/height`; nenhuma > 250 KB em qualquer formato |
| Vídeo | só ≥1024 + no-preference + sem `saveData`, só o painel visível, `preload="none"`, `src` injetado por IO; ≤ 1 MB por loop; **0 bytes no Lighthouse mobile** |
| JS | `main.js` −120 l. / +~150 l.; `brasil.js` ≤ 7 KB; 0 libs; 0 `fetch`; tudo `defer`/`module` |
| Canvas | 1 na página; ≤ 30 fps; DPR ≤ 2; 0 rAF fora da viewport/aba; 0 canvas <768 |
| CLS | `aspect-ratio` em toda mídia e no mapa; `text-wrap: balance` + `max-width` em `ch` nos H2/headlines; numeração em Hanken 14 (sem numeral grande em Newsreader); `publicacoes__vazio` com a altura do destaque |
| Peso total | ≤ 1,5 MB sem o vídeo do herói e sem os loops (sob demanda) |
| Metas | Perf ≥ 95 (gate 90), A11y/BP/SEO ≥ 95, LCP ≤ 1,8 s, CLS ≤ 0,01, TBT ≤ 50 ms, 0 overflow 320–1920, 0 erro de console, axe 0 serious/critical em 1440 e 390 |
| A11y | 1 `h1`, 1 `main`; `aria-labelledby` em 9 seções; 0 heading em link; alvos ≥ 44 px (CTAs 48; links do `details` ≥ 44 por padding); foco visível e não obscurecido (sem sticky sobre conteúdo focável); mapa `role=img` com título; vídeos `aria-hidden`; contraste conforme §2.6 |

### Checklist de aceite visual do diretor de arte (gate antes do QA)
1. Em 1440 cada seção tem **um** padrão de componente; na grade 03 só a cor do eixo muda.
2. Zero caixa com sombra; fio de 1 px separa; raio máx. 4 px em mídia, 2 px em controle.
3. Nenhum texto sobre imagem sem véu ≥ .80; nenhum ouro/acento claro como texto sobre papel.
4. Um só canvas (06); vídeo fora do herói só nos painéis de 05 e só ≥1024.
5. Fundo em blocos (§1.2 S1), não zebra; fio só entre vizinhas do mesmo bloco.
6. Em 390: 0 overflow, CTAs 48 px, texto fora da imagem em 05, mapa estático, `details` fechado.
7. Nenhum número institucional, percentual, "garantia", nome de parceiro ou curso fora do
   catálogo; lista completa de atribuição só em 04.3; "Provimento" só no rodapé.
8. Nada que pareça escritório contábil, escritório genérico ou startup futurista: sem balança,
   martelo, prédio, cifrão, neon, azul saturado, glassmorphism, badges.

---

## 8. Pendências para o CEO (não resolvidas aqui; comportamento padrão definido)

| # | Pendência | Padrão adotado até a decisão |
|---|---|---|
| 1 | ~~Cobertura fora de SP~~ — **resolvida pela D9** | 06 afirma Brasil e exterior, sem números |
| 2 | Nomes "Blindagem Patrimonial", "Blindagem Contratual", "Defesa Empresarial" | nomes atuais no `details` de 03 |
| 3 | Cursos ativos na EAD (seed × `data.js` deprecado) | 08 cita só "Arquitetura Patrimonial Estratégica, 42 horas, online" |
| 4 | Ad-tech (tribunais/cartórios, API, PCD) | fora de 04 |
| 5 | Parceiros nomeados (Bear Finance, CRC, sociedades, cartórios) | só por categoria, uma vez (04.3) |
| 6 | Vertical "Agronegócio" | painel 05 com rótulo genérico "Famílias que detêm imóveis e terras" |
| 7 | Expor data de revisão em 07 | `time` presente; remover se não aprovado (teste tolera) |
| 8 | Texto de `sobre.html` ("um responsável por eixo") | 02 não amplia afirmações de equipe |
| 9 | Política de privacidade com `[CONFIRMAR]` | consentimento de 09 linka a página existente; risco registrado |
| 10 | Página de Auditoria Empresarial / slug `contabilidade` | CTA E4 → `contabilidade.html`; card "→ #contact" removido |
| 11 | ID do vídeo da home | `data-video=""` |
| 12 | Fotografia real para 05 | renders procedurais com nomes estáveis; troca sem retrabalho |
| 13 | **Esconder o WhatsApp flutuante até 04 entrar na viewport** (proposta de C) | visível desde o início, com `?text=` qualificado |
| 14 | **Rinoceronte em vídeo na Casa** (proposta de B; 0,82 MB) | não entra |
| 15 | **Rótulo "Treinamentos" no menu e em 28 rodapés** vs. seção "Método e formação" | `id="treinamentos"` mantido; rótulo intocado; proposta: "Método" (sed de string idêntica + `navbar.js ?v=`) |
| 16 | H2 do contato "Comece pela decisão a tomar" e do vídeo | `[copy]` ao content-director |

---

## 9. Backlog P0–P3 e divisão de trabalho

Seis agentes de seção trabalham **em paralelo e sem se falar**: cada um lê só §2 e a sua
subseção de §3, escreve apenas os seus parciais e um `README` de 10 linhas (o que entregou,
o que testou em 320/390/768/1024/1440/1920, pendências). O integrador monta.

| Prioridade | Tarefa | Dono | Entrega |
|---|---|---|---|
| **P0** | `catalogo-cards.json` (antes de qualquer corte) | frontend-motion | `docs/dmc/home-redesign/catalogo-cards.json` |
| P0 | `_shared.css` + `dmc-wrap--wide` + fio de acento migrado | frontend-motion | `partials/_shared.css` |
| P0 | 03 Seis Eixos (grade + `details` + sprite) | agente-A (creative-webdesigner) | `partials/eixos.{html,css}`, `partials/icones-eixos.svg` |
| P0 | 05 Verticais (painéis, véu, loops, placeholder) | agente-B (creative-webdesigner) | `partials/verticais.{html,css,js}` |
| P0 | 06 Presença (SVG min, canvas, dados) | agente-C (frontend-motion) | `partials/presenca.{html,css}`, `brasil.js`, `brasil-min.svg`, `brasil-capitais.js` |
| P0 | Mídia das 5 verticais (posters + loops) | video-3d-producer | §4 + `midia-relatorio.md` |
| P0 | Copy `[copy]` de todas as seções (≤ limites de caracteres; conformidade) | content-director | `docs/dmc/home-redesign/copy-final.md` |
| P0 | API `/api/newsletter` (blueprint) + `server/test/newsletter.test.js` | fullstack-architect | `server/src/routes/newsletter.js` |
| **P1** | 02 Casa + 04 Por quê | agente-D (creative-webdesigner) | `partials/casa.{html,css}`, `partials/porque.{html,css}` |
| P1 | 07 Publicações + 08 Método | agente-E (creative-webdesigner) | `partials/publicacoes.{html,css}`, `partials/metodo.{html,css}` |
| P1 | 09 Newsletter (form + estados) | agente-F (frontend-motion) | `partials/newsletter.{html,css,js}` |
| P1 | `design-preview.html` com amostras em 390/1440 | integrador | `docs/dmc/design-preview.html` |
| P1 | Integração: `index.html`, `home.css`, `main.js?v=c4`, `styles.css?v=c5` (corte por bloco), rodapé "Newsletter", WhatsApp qualificado | frontend-motion | `complexodmc.com.br/` (fase 2) |
| P1 | Testes: `eixos.spec.js`, `movimento.spec.js` (bloco 06 + vídeo 05), `newsletter.spec.js`, `home-secoes.spec.js`; Lighthouse ×5 | qa-engineer | `tests/e2e/*`, `docs/dmc/qa/<data>-home-v2/` |
| **P2** | Fundir `home.css` em `styles.css` para publicação; Coverage 390/1440; `QA.md` | frontend-motion + qa | — |
| P2 | Registrar em `DECISIONS.md`: S1–S16, pendências 13–16 | diretor de arte | `docs/dmc/DECISIONS.md` |
| P2 | Mega-menu e rodapé adotam `<use href="#ico-eN">` (fora da home exige sprite em cada página — avaliar) | frontend-motion | — |
| **P3** | `og-presenca.webp`; self-host das fontes; template de artigo para 07 (quando houver 3 publicações); imagem opcional para 02 | video-3d-producer / content-director | — |

**Ordem de corte na integração**: 1) `catalogo-cards.json` → 2) colar `<svg hidden>` e as 9
seções novas no `index.html` **mantendo as antigas escondidas** por 1 commit (comparação visual)
→ 3) remover blocos antigos (HTML, depois CSS por bloco, depois JS) → 4) subir `?v=` → 5) suíte
completa (454 testes) + Lighthouse ×5 → 6) fundir `home.css`. Rollback: `git checkout main`
(T1); nunca publicar fora das condições de D3.
