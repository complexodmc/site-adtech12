# Mídia das 10 verticais de negócio — pipeline procedural (não publicado)

Cartaz WebP + loop de vídeo (6 s, 24 fps, 144 quadros, sem áudio) para a seção/páginas "Verticais de Negócio".
Cenas Three.js r170 renderizadas pelo Chromium do Playwright (ANGLE/Metal) → PNG → cwebp/ffmpeg.
O vendor (three + examples/jsm) é o de `tools/midia-home/vendor/` (importmap em `scene.html` aponta para `../midia-home/vendor/`).

Saídas finais (geradas por `encode.mjs`):
- `complexodmc.com.br/assets/images/verticais/<slug>-hero.webp` (1600×900, ≤ 140 KB) e `<slug>-hero-m.webp` (960×540, ≤ 60 KB) — quadro 0 do loop (poster/LCP).
- `complexodmc.com.br/assets/videos/verticais/<slug>-hero.webm` (VP9) e `<slug>-hero.mp4` (H.264 yuv420p, faststart) — 1280×720, ≤ 1,5 MB.

Slugs: `indice`, `familias-empresarias-holdings`, `agronegocio-patrimonio-rural`, `incorporacao-construcao-imobiliario`,
`cartorios-servicos-registrais`, `infraestrutura-saneamento-energia`, `industria-comercio-distribuicao`,
`saude-profissionais-liberais`, `educacao-terceiro-setor`, `credito-garantias-instituicoes-financeiras` (lista em `slugs.mjs`).

```sh
# vendor (só se tools/midia-home/vendor/ não existir — ver tools/midia-home/README.md)
# 1) iteração visual: 1 quadro a t=0 e 1 a t=0,5 por cena, 960×540 → out/preview/
node tools/midia-verticais/render.mjs --preview            # --only indice,saude-profissionais-liberais
# 2) render completo: cartazes (1600×900 + 960×540) e 144 quadros/cena a 1280×720 → out/stills, out/frames
node tools/midia-verticais/render.mjs                      # --only <slug>  --stills  --frames 144
# 3) codificação com orçamento (WebP, WebM VP9, MP4 H.264) → assets/{images,videos}/verticais/
node tools/midia-verticais/encode.mjs                      # --only <slug>  --skip-video
# 4) medição (YAVG alvo ≈ 30–55 neste medidor; ouro ≤ 3 %)
node tools/midia-verticais/measure.mjs tools/midia-verticais/out/preview/*.png
```

Arquivos: `scene.html` (página de render), `scenes.js` (helpers + 10 cenas + pós comum), `render.mjs`, `encode.mjs`,
`measure.mjs`, `slugs.mjs`. `out/` é gitignored.

Linguagem (HOME_REDESIGN §4): fundo grafite/preto, ouro ≤ 3 %, PBR com texturas procedurais, névoa, DOF, pós comum
(vinheta, grão, ACES, canto inferior esquerdo e faixa inferior mais escuros para o texto do herói à esquerda), motivo no
terço direito. Loop: todo movimento é `cos(t·2π)` com período 6 s → quadro 144 ≡ quadro 0, sem crossfade.
Cenas `familias-empresarias-holdings`, `agronegocio-patrimonio-rural` e `incorporacao-construcao-imobiliario` são as de
`tools/midia-home/scenes.js` (rodada 3) reaproveitadas em 16:9 com exposição reajustada; as outras sete são novas.
