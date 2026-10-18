# 05 · Verticais de Negócios — `#verticais`

Parciais da seção 05 da home (HOME_REDESIGN.md §3·05, S6). Direção C: painéis fotográficos grandes,
movimento discreto, texto sobre véu em desktop e fora da imagem no mobile. Nada foi tocado fora de
`docs/dmc/home-redesign/partials/`.

## Arquivos
| Arquivo | Papel |
|---|---|
| `verticais.html` | fragmento da `<section>` (cabeçalho + `ol.verticais-grid` com 5 `article`) — colar entre `#porque` e `#presenca` |
| `verticais.css` | bloco `/* ==== 05 · VERTICAIS DE NEGÓCIOS ==== */` — concatenar em `home.css` após `porque` |
| `verticais.js` | `export function initVerticais(root = document)` — importar em `main.js?v=c4` e chamar uma vez |
| `preview/` | placeholders TEMPORÁRIOS de mídia, página de preview, scripts e capturas (não entra no site) |

## O que o integrador precisa garantir (`_shared.css`)
O CSS consome, com fallback equivalente, as custom properties de `.home` previstas na §2.3
(`--ratio-wide`, `--ratio-panel`, `--veil`, `--veil-mid`, `--veil-off`, `--num-font`) e a classe
`.dmc-wrap--wide` (`max-width: calc(var(--container-wide) + 2 * var(--gutter))`). Sem
`.dmc-wrap--wide` a grade cai em 1240 (não quebra, só perde a sangria de 1440).
`scroll-margin-top` da `section[id]` também vem de `_shared.css`.

## Composição
- Cabeçalho `.dmc-sec-head.dmc-reveal`: overline, `h2.dmc-h1` com um `<em>`, `p.dmc-lead` (subtítulo do copy.json).
- `ol.verticais-grid` (`aria-label` do copy): painel 01 `--wide` (21:9 em ≥1440, 2:1 em 1024, 16:10 abaixo) + 4 painéis 16:10.
- Cada `article.verticais-item` (`aria-labelledby` → `h3`, `data-vertical=<slug>`, `style="--i:n"` para stagger):
  `figure.__media[aria-hidden]` › `<picture>` AVIF+WebP desktop (`min-width:1024px`) e `-m` abaixo, `img 1200×750 lazy async alt=""`;
  `<video.__loop muted loop playsinline preload=none aria-hidden tabindex=-1 hidden data-src-webm data-src-mp4>` sem `<source>`;
  `span.__veil`; `div.__body` › `__num` (01 ouro + setor em `--text-3`), `__eyebrow` (Newsreader 300 itálico, pergunta
  sem aspas), `h3.__title` (Newsreader 300, `--fs-h2` no 01 / `--fs-h3` nos demais, `max-width:16ch`), `__text`, um só
  `a.dmc-btn--secondary.__cta` com `aria-label` do copy. Heading fora do link; 5 destinos distintos.
- Caminhos de mídia exatamente os da §4: `assets/images/home/vertical-<slug>[-m].{avif,webp}`,
  `assets/videos/home/vertical-<slug>.{webm,mp4}` (gerados em paralelo pelo `video-3d-producer`).

## Layout por largura
| Largura | Grade | Painel 01 | 02–05 | Texto |
|---|---|---|---|---|
| 320/375/390 | 1 col, `gap --space-7` | 16:10 | 16:10 | fora da imagem, fundo `--surface-1`, `padding --space-5/--space-6`, CTA 100 % |
| 768 | 8 col, `gap --space-6` | `1 / -1` | `span 4` | fora da imagem, `padding --space-6`, CTA auto |
| 1024 | 12 col, `gap --grid-gap` | `1 / -1`, 2:1 | `span 6`, 16:10 | sobre o véu, `padding --space-7`, `max-width 30rem`; `__text` oculto nos 02–05 |
| 1440/1920 | idem | 21:9, `max-height min(72vh, 40rem)` | 16:10 | sobre o véu, `padding --space-8`, `max-width 34rem` (01: 40rem); `__text` visível |

Sobreposição em ≥1024 por **empilhamento de grade** (`__media` e `__body` em `grid-area: 1 / 1`, body `align-self:end`),
não por `position:absolute`: a figura reserva a proporção com `::before` (`padding-top: calc(100% / var(--ratio-*))`)
e estica se o texto for mais alto — nada é cortado em nenhuma largura (o absoluto cortava o topo dos painéis 02 e 05
em 1024/1440). Véu = o único degradê da home, inteiro em tokens `--veil*`. Hover/focus-within ≥1024: `scale(1.02)`
400 ms em `img`/`video`. CTA com `outline-offset:-4px` para não ser cortado pelo `overflow:hidden`.

## JS — `initVerticais()`
Gate: `(min-width:1024px)` **e** `prefers-reduced-motion: no-preference` **e** `!navigator.connection.saveData` **e**
`IntersectionObserver`. Fora do gate retorna sem tocar no DOM (0 bytes de vídeo). Dentro: IO `threshold .25` observando a
**`figure`** (o `video[hidden]` tem caixa zero e nunca intersecta) → injeta `<source>` webm+mp4 uma vez, remove `hidden`,
`load()`+`play()`; sai → `pause()`; `visibilitychange` pausa/retoma; `playing` → `is-playing` (fade 700 ms no CSS);
erro no último `<source>` → `is-broken` + volta ao poster; mudança de mq (rotação/reduce) pausa ou retoma o que está na
tela. Sem fetch, sem rAF, sem sticky.

## Preview e verificação (porta 4654)
```
node docs/dmc/home-redesign/partials/preview/gerar-placeholders.mjs   # posters WebP + loops WebM/MP4 procedurais (temporários)
node docs/dmc/home-redesign/partials/preview/montar-preview.mjs       # verticais.preview.html a partir do parcial (só troca caminhos)
node docs/dmc/home-redesign/partials/preview/servir.mjs &             # raiz do repo em 127.0.0.1:4654 (guardar $! e matar só esse PID)
node docs/dmc/home-redesign/partials/preview/capturar.mjs             # 7 viewports + reduce + foco → verticais-*.png
```
Resultado (2026-10-17): **tudo ok** — 0 px de overflow em 320/375/390/768/1024/1440/1920; 5 `article`, 5 links
distintos, 0 heading em link; CTA 48 px; 0 erro de console; <1024 e 1440+reduce → 0 `video[src]/source`;
1024/1440/1920 → `<source>` injetado e `video.is-playing ≥ 1` após rolar. Capturas: `preview/verticais-{320,375,390,768,1024,1440,1920}.png`
e `preview/verticais-1440-foco.png`.

Placeholders do preview: sem `avifenc`/`libaom` nesta máquina, o preview mapeia `.avif → .webp` (o `type` do `<source>`
só orienta a seleção). Isso vale **só** para `preview/`; o parcial aponta para AVIF real.

## Decisões e desvios (para o diretor)
1. **Eyebrow em Newsreader itálico** conforme a tarefa; o `copy.json` pede "sem itálico de citação". Conciliei: pergunta
   direta, sem aspas, sem rótulo "Situação típica", mas em itálico leve (voz do leitor, não depoimento). Se o copy
   prevalecer, trocar `font-style` em `.verticais-item__eyebrow` (1 linha).
2. **Um CTA por painel** (tarefa e spec): o `cta_secundario` do painel 05 ("Planejar a sucessão das terras") ficou de
   fora; a frase do painel já encaminha a sucessão ao eixo patrimonial. Fica para decisão do diretor.
3. Subtítulo do `copy.json` incluído como `p.dmc-lead` no cabeçalho (o esqueleto da spec não o previa).
4. Rótulo do painel 05 permanece "Famílias que detêm imóveis e terras" ([CEO 6]); se aprovado "Agronegócio", muda só o `span`.
5. Testes de `contratos-qa` §2.3 ainda não existem no repositório: as asserções equivalentes estão em `preview/capturar.mjs`
   para o QA transpor para `home-secoes.spec.js`/`movimento.spec.js`.
