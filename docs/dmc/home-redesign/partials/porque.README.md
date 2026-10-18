# 04 · Por que o Complexo DMC? — `#porque`

Parciais da seção 04 da home (HOME_REDESIGN.md §3·04; copy de `copy.json › porque`).
Só CSS + HTML: não há `porque.js`.

| Arquivo | Conteúdo |
|---|---|
| `porque.html` | `<section class="dmc-section porque" id="porque" aria-labelledby="porque-title">` com intro (`.dmc-sec-head`) e painel de papel (`.porque-panel.dmc-on-paper`) com `<ol class="porque-list">` de 6 `li.porque-item.dmc-reveal` (`--i:0…5`). |
| `porque.css` | Bloco `/* ==== 04 · POR QUE O COMPLEXO DMC? ==== */`, 2,9 KB bruto. Breakpoints usados: 640 / 768 / 1024. |
| `preview/porque-{320,390,768,1024,1440}.png` | Capturas de página inteira (prévia com uma faixa de papel antes e uma de grafite depois, para ler a transição 03 → 04 → 05). |
| `preview/porque-medidas.json` | Medições por viewport (overflow, sticky, contagens, cores computadas, status do link). |

## Como foi montado
- **Mosaico editorial**: seção em `--surface-0`; em ≥1024 a intro ocupa `1 / span 4` e fica
  `position: sticky; top: calc(var(--header-h-lg) + var(--space-6))`; o painel ocupa `6 / span 7`
  e sangra até a borda direita via `::before { inset: 0 -100vw 0 0 }` dentro de
  `isolation: isolate`; a seção tem `overflow-x: clip` (não cria contêiner de rolagem, então o
  sticky funciona e a sangria não entra no `scrollWidth`).
- **<1024**: intro `1 / -1` (estática) com `padding-top: var(--space-section)`; painel `1 / -1`
  com `margin-inline: calc(-1 * var(--gutter))` e `padding: var(--space-9) var(--gutter)`
  (papel de borda a borda, sem sangria extra: `::before { inset: 0 }`).
- **Lista**: `ol` real com `counter-reset: porque`; número em `::before` com
  `font: var(--num-font)` (fallback local idêntico à definição de `_shared.css` §2.3),
  `tabular-nums`, tracking .08em, cor `--color-gold-deep` (seção da casa: ouro, não cor de eixo).
  ≥640: grade `3rem minmax(0,1fr)`; <640: número acima do título. Fio `--color-line-ink` de 1 px
  por item, `border-bottom` no último. `h3.dmc-h4` em `--text-ink-1`; `p` em `--text-ink-2`,
  `max-width: 34rem`. Um único link (item 06, `.dmc-btn--link`, seta inline).
- **Sem** cor literal, sombra, raio, `!important`, `transition: all`, `will-change`, fonte nova,
  breakpoint fora de 640/768/1024, `role=tab`.
- A regra comum `section[id] { scroll-margin-top }` (§2.5) fica em `_shared.css`, não aqui.

## Resultado da prévia (Playwright, Chromium, porta 4656, `tests/server/serve.mjs`)
| Largura | `scrollWidth` antes/depois de rolar | `.porque-panel` right ≤ `clientWidth` | intro |
|---|---|---|---|
| 320 | 320 / 320 | 320 ≤ 320 | static |
| 390 | 390 / 390 | 390 ≤ 390 | static |
| 768 | 768 / 768 | 768 ≤ 768 | static |
| 1024 | 1024 / 1024 | 988 ≤ 1024 | sticky |
| 1440 | 1440 / 1440 | 1340 ≤ 1440 | sticky |

Em todas: 6 `li`; 1 link → `pages/tecnologia.html` (HTTP 200); CTA ≥ 44 px; numeração
Hanken Grotesk 500 14 px; `/\d+\s*%|garant|clientes|anos de/` = 0 ocorrências; "cartórios
conveniados" (fórmula completa de atribuição, S13) = 1 ocorrência; 0 erros de console.
A prévia é montada em memória (`page.route` em `/__preview/porque.html`) sobre
`tokens.css` + `components.css?v=3` + `porque.css`; nada foi gravado em `complexodmc.com.br/`.

## Para o integrador (`frontend-motion`)
1. Colar `porque.html` após `#features` e antes de `#verticais`; `porque.css` entra em
   `home.css` após `eixos`.
2. `--num-font` precisa existir em `.home` (`_shared.css`); o fallback no CSS só cobre a prévia.
3. `.dmc-reveal` já é tratado pelo IO de `main.js`; nenhum JS novo.
4. Testes sugeridos (§3·04): 6 `li`, regex de conformidade, 1 link 200, axe em 1440/390,
   `getBoundingClientRect().right ≤ clientWidth` do painel.
