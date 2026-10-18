# 06 · Presença Nacional (`#presenca`) — parciais

Spec: `docs/dmc/HOME_REDESIGN.md` §3·06 (S7) · copy: `home-redesign/copy.json › presenca` (D9) ·
geografia: `home-redesign/geo/brasil.json` + `brasil-estados.svg`.

## Arquivos
| Arquivo | Destino na integração | Notas |
|---|---|---|
| `presenca.html` | colado no `index.html` entre `#verticais` e `#publicacoes` | SVG inline `role="img" aria-labelledby="presenca-mapa-titulo"`; texto 35 / mapa 65; copy literal da D9, sem números |
| `presenca.css` | bloco `/* ==== 06 · PRESENÇA NACIONAL ==== */` do `home.css` | só tokens; movimento só `opacity`; usa `--ratio-map` e espera `--text-3-rgb: 154, 152, 147` em `_shared.css` (fallback embutido no JS) |
| `brasil-min.svg` | fonte do SVG inline (já colado em `presenca.html`) | **11 319 B** (meta ≤ 12 KB). DP 2,5 px + coordenadas inteiras; 27 `path[data-uf]`, 26 `circle[data-uf] r=2.5` + `circle[data-uf=SP].is-sede r=5` + anel `.presenca-mapa__anel r=12`; sem `id/fill/stroke` inline |
| `brasil-capitais.js` | `assets/js/data/brasil-capitais.js` | `export const CAPITAIS = { AC:[x,y] … SP:[650.1,719.3] }` (chaves por UF) + `SEDE='SP'`; 805 B |
| `brasil.js` | `assets/js/brasil.js?v=1` (`<script type="module">`) | autônomo (~230 l.); **trocar o import** `./brasil-capitais.js` → `./data/brasil-capitais.js`. Exporta `initPresenca(root)` (idempotente) e já se auto-inicia |
| `preview/presenca-preview.html` | não publicar | página de preview servida da raiz do repositório |
| `preview/presenca-{320,390,1024,1440,1440-reduce}.png` | — | capturas Playwright |

## Comportamento do canvas (`brasil.js`)
- Monta só quando a figura chega a 300 px da viewport **e** `(min-width:768px)` **e** `prefers-reduced-motion: no-preference`. Abaixo de 768 ou com reduce: nenhum `<canvas>`, o SVG é tudo.
- Três planos: SVG (z 0, parado) · arestas SP→26 capitais em quadráticas com controle 8 % perpendicular (z .6, `--text-3` a .14) · nós + pulsos ouro (z 1; halo da sede com `lerp .1`; máx. 4 pulsos, intervalo 900 ms, 1,6–2,4 s, fade senoidal). Paralaxe `0.02·z` do cursor com `lerp .06`; `pointermove` realça a aresta mais próxima. Com o canvas vivo (`.is-live`) os `circle` do SVG somem por `opacity` para não duplicar os nós.
- Desenho ≤ 30 fps (rAF re-armado a cada quadro, draw a cada ≥ 33 ms), DPR ≤ 2, rAF só com IO + aba visível; `ResizeObserver` redimensiona; `change` de `(min-width:768px)` desmonta/monta; `change` de reduce → quadro estático.
- `data-motion` no `figure[data-rede="brasil"]`: `on` (animando) · `off` (pausado: fora da viewport / aba oculta) · `still` (sem canvas ou quadro estático). Atenção: `contratos-qa.md` §2.4 fala em `"running"` e em `.presenca__3d`/`path.is-sede` — esta entrega segue a tarefa/§3·06 (`on|off|still`, `.is-sede` no `circle`); alinhar o spec de teste ao integrar.

## Medições (Chromium headless, Playwright, DPR 1, porta 4655)
| Viewport | canvas | `data-motion` | rAF/s | draws/s | CPU main-thread | overflow | erros console | req. externas |
|---|---|---|---|---|---|---|---|---|
| 320 | 0 | still | 0 | 0 | 0 % | 0 px | 0 | 0 |
| 390 | 0 | still | 0 | 0 | 0 % | 0 px | 0 | 0 |
| 1024 (hover) | 1 | on | 60 | ~22–30 | 1,7 % | 0 px | 0 | 0 |
| 1440 (hover) | 1 | on | 60 | ~22–30 | 1,6 % | 0 px | 0 | 0 |
| 1440 + reduce | 0 | still | 0 | 0 | 0 % | 0 px | 0 | 0 |

Pausas verificadas: aba oculta → 0 draws/s e `off`; volta → `on`; redimensionar para 700 px → canvas removido e `still`; voltar a 1440 → remonta. 27 `path[data-uf]`, 27 `circle[data-uf]`, 1 `.is-sede`; texto sem `/\d+\s*(estados|países|cidades|municípios|clientes|%)/i`.

## Como testar
```sh
cd /Users/dmchagas/Site_Complexo_DMC
python3 -m http.server 4655 --bind 127.0.0.1 &  PID=$!
open http://127.0.0.1:4655/docs/dmc/home-redesign/partials/preview/presenca-preview.html
# ... depois: kill $PID
```
Checar: 390 → sem canvas, SVG visível; 1440 → `figure[data-motion="on"]`, pulsos ouro e paralaxe ao mover o cursor; DevTools › Rendering › emular `prefers-reduced-motion` → `still`; aba em segundo plano → `off`.

## Regenerar o SVG
Script usado (DP configurável): parse de `brasil.json › estados[].d`, Douglas-Peucker por anel, arredondamento inteiro, remoção de anéis < 3 pontos. 2,0 px → 13,9 KB · **2,5 px → 11,3 KB** · 3,0 px → 10,0 KB.
