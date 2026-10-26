# Imagens da Central de Parcerias — render procedural (fora da raiz pública)

Autorização: decisão D9 (docs/dmc/DECISIONS.md). Nenhuma imagem de terceiros, nenhum texto nas imagens.

- `engine.js`: WebGL2, raymarching de SDF (lajes, papel, ardósia, torres de brises, brise em grade) com luz de área estocástica, sombra suave, AO, profundidade de campo, linhas 3D de largura constante em pixels (oclusão pela geometria), tone mapping ACES e grão fino. Acumula N amostras (AA + DOF + penumbra).
- `scenes.js`: as três linguagens — `pl` (Partner Lawyers: papel e pedra em luz rasante, construção de compasso Euclides I.1, champanhe), `bp` (Business Partner: fachada de brises bronze em contraluz rasante, rede ouro que se expande em losango e salta para a torre vizinha), `hub` (as duas se encontram: brise bronze projeta a grade de luz sobre o papel com a construção champanhe). Enquadramentos em `presets` (painel 4:5, hero 16:9 com metade esquerda escura, og 1200×630).
- `render.mjs`: Chromium headless (ANGLE/Metal; cai para SwiftShader) → PNG mestre em `out/png/` (ignorado no git). Estudos: `--only pl-hero --spp 16 --scale 0.5 --ovr '{"pl-hero":{...}}' --probe`.
- `build.mjs`: tudo de ponta a ponta (~1 min): render, WebP (cwebp, maior qualidade ≤ teto) e JPG dos OG (ffmpeg), medição (dimensão, KB, luminância da metade esquerda dos heróis) e quadro de contato `docs/dmc/parcerias/imagens-contato.png`.

Regenerar: `node tools/media/parcerias/build.mjs` · Requisitos: Node 24, `npm i` (playwright), `/opt/homebrew/bin/ffmpeg`, `cwebp`.
Saídas: `complexodmc.com.br/assets/images/parcerias/` (pl/bp-painel{,-800}.webp, pl/bp/hub-hero{,-960}.webp, og-*.jpg).

## Filmes dos heróis (as três cenas)

`render-video.mjs --scene <hub|pl|bp>` refaz a cena do herói com **câmera e luz** em movimento. O que dá vida é a luz, não a câmera: a mancha de luz varre o papel e a linha de sombra sobe pela fachada. Só a câmera mexendo quase não se nota.

**As duas regras do laço** (as duas vêm da mesma escolha e não devem ser desfeitas):
1. Todo termo é seno de harmônico inteiro de `t` (`sin t`, `sin 2t`, `sin 3t`), logo vale 0 em `t=0` e em `t=2π`: o último quadro encosta no primeiro.
2. Como todo termo é 0 em `t=0`, **o quadro 0 é o preset base** — a mesma composição das imagens estáticas. Por isso **o cartaz da página é o do `build.mjs` normal, sem override**, e o vídeo entra por cima sem salto. A emenda do laço cai no ponto de velocidade máxima, onde ninguém a percebe.

Harmônicos diferentes por eixo desenham uma figura de Lissajous fechada, então o movimento não parece um bloco só indo e voltando.

| Cena | Câmera | Luz |
|---|---|---|
| `hub` | órbita: az ±2,0°, el ±1,1°, dist ±0,26 | `lightPos` z ±2,2, y ±0,5 |
| `pl` | órbita: az ±1,8°, el ±1,0°, dist ±0,24 | `light.pos` z ±0,85, y ±0,18 |
| `bp` | `cam.pos` em arco de ±1,0°, altura ±0,5, raio ±0,7 | `sun` gira ±3,5°, y ±0,05 |

As luzes têm sensibilidade muito diferente: no `pl` a janela é estreita e a luz é rasante, então ±0,85 já varre a folha inteira e ±2,0 apaga a cena; no `hub` o vão do brise é largo e aceita ±2,2. Calibre sempre com `--probe-only --frames 4` antes de rodar a sequência.

**Pulso dourado** (`PULSO` e `pulsoAt` em `render-video.mjs`): a parte que conta a história. Uma faixa de luz atravessa os traços dourados — compasso, fio de ligação, rede do brise — uma vez por laço, ao longo do eixo de maior extensão da rede. Ao passar, aviva a cor (×7 no pico), engrossa o traço e acende um halo nos nós. Corre na janela de 12% a 80% do laço, com aceleração suave, entrando e saindo além das pontas da rede; fora dela o ganho é zero. Por isso o quadro 0 continua idêntico ao cartaz e o laço continua sem emenda. O halo tem intensidade proporcional ao pulso, então nada surge ou some de estalo. É um pós-processo da lista de traços (`S.segs`) feito no próprio render: `scenes.js` não sabe do pulso.

`hubScene` recebeu `P0.lightPos` (antes a posição da luz era constante no corpo da função) para que o filme possa movê-la. O padrão é o valor das imagens estáticas, então `build.mjs` não muda de resultado.

- `build-video.mjs --scene <cena>`: PNG → `assets/videos/parcerias-<cena>-hero.{webm,mp4}` (sem áudio, VP9 e H.264).
- Uso na página: o `<img>` é o cartaz (LCP) e o vídeo vem em `.pp-hero__filme` por cima, com `media="(prefers-reduced-motion: no-preference)"` nos dois `<source>`. Quem pede menos movimento não baixa vídeo nenhum. **`.pp-hero__filme` não leva `z-index`**: posicionado, ele já cobre o `<img>` estático e continua abaixo do `::after` (o véu que garante a leitura do texto) e do `::before` da grade do BP. Pôr `z-index` ali apaga o véu.

Regenerar um filme: `node tools/media/parcerias/render-video.mjs --scene pl && node tools/media/parcerias/build-video.mjs --scene pl`
(15 s a 24 fps = 360 quadros; ~17 min por cena a 1600×900 e 40 spp, ~6 min no `bp`. Os PNG ficam em `out/video/<cena>/`, fora do git).
