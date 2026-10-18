# 08 · Método e formação — `#treinamentos`

Parciais: `metodo.html` (fragmento da `<section>`), `metodo.css` (bloco `/* ==== 08 · MÉTODO E FORMAÇÃO ==== */`). Sem JS.
Spec: `docs/dmc/HOME_REDESIGN.md` §3·08 (S9). Copy: `copy.json › metodo_ou_treinamentos` (aplicada literalmente).
Prévia: `preview/_preview-07-08.html` · capturas `preview/metodo-{320,375,390,768,1024,1440,1920}.png`.

## Composição
- Papel, `.dmc-section--rule` (fio tinta com 07 via `_shared.css`: `.dmc-on-paper.dmc-section--rule { border-color: var(--color-line-ink) }`). **`id="treinamentos"` mantido** (28 rodapés + navbar.js); overline "Método e formação".
- `.metodo-grid`: 4 col → 8 col (768) → 12 col (≥1024). Head `1 / -1`.
- `.metodo-etapas` (`ol`, `counter-reset`): cada `li.metodo-etapa` com fio no topo, `padding: var(--space-6) 0`, `::before` = `counter(etapa, decimal-leading-zero)` em `--num-font` (Hanken 500 14, tabular, tracking .08em) `--color-gold-deep`; `h3.dmc-h4` `--text-ink-1`; `p` `--text-ink-2` `max-width: 32rem`.
  - <768: pilha com fio. 768: 2×2, `row-gap: var(--space-6)`. 1024–1439: **2×2 em `1 / span 8`**. ≥1440: 4 em linha em **`1 / span 9`**.
  - Desvio documentado da tabela da spec ("1440/1024: `span 8` em 4 colunas"): em 4 colunas as células medem 137 px (1024) e 180 px (1440) e "Acompanhamento"/"Estruturação" quebram no meio da palavra. Com `span 9` a célula tem 207 px e a palavra mais longa cabe inteira; em 1024 só 2×2 resolve. Aside continua em `10 / span 3`.
- `.metodo-programa` (aside **sem caixa**): fio no topo (<1024) ou à esquerda (≥1024, `padding-left: var(--space-6)`, `align-self: start`). Overline "Formação", `h3.dmc-h4`, meta `.dmc-small` ("Programa de formação institucional · 42 horas · online"), descrição, CTA `.dmc-btn--link` → `plataforma-ead/` (seta `--color-gold-deep`). Sem preço, sem módulos, sem `login.html?curso=`, sem os outros 3 cursos do seed.
- Revelação: `.dmc-reveal` + `--i` 0…4; regra de stagger escopada em `.metodo` (`_shared.css` não a declara). `scroll-margin-top` vem de `_shared.css`.

## Estados
- Link: hover sublinhado `--np-accent-deep` (ouro da casa, pois a seção não tem eixo) + seta 4 px; `:focus-visible` outline `--focus-color-ink`. Alvo 44 px (medido).
- Reduced motion: tokens colapsam; nada próprio.

## Medições (Chromium, DPR 1)
Overflow horizontal: 0 px em 320/375/390/768/1024/1440/1920. Larguras de etapa: 288/340/354 (mobile), 344 (768), 300 (1024), 207 (≥1440); nenhum título quebra palavra.

## Pendências
- **[CEO 3]** demais cursos do seed e os 6 da home antiga ficam fora. **[CEO 15]** rótulo "Treinamentos" no menu/rodapés (proposta: "Método") — fora deste parcial.
- Contratos (§2.6): "Arquitetura Patrimonial Estratégica" existe como `titulo` em `plataforma-ead/js/data.js` (42 horas, Online); `plataforma-ead/` → `index.html` existe; 0 `login.html?curso=`.
