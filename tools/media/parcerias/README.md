# Imagens da Central de Parcerias — render procedural (fora da raiz pública)

Autorização: decisão D9 (docs/dmc/DECISIONS.md). Nenhuma imagem de terceiros, nenhum texto nas imagens.

- `engine.js`: WebGL2, raymarching de SDF (lajes, papel, ardósia, torres de brises, brise em grade) com luz de área estocástica, sombra suave, AO, profundidade de campo, linhas 3D de largura constante em pixels (oclusão pela geometria), tone mapping ACES e grão fino. Acumula N amostras (AA + DOF + penumbra).
- `scenes.js`: as três linguagens — `pl` (Partner Lawyers: papel e pedra em luz rasante, construção de compasso Euclides I.1, champanhe), `bp` (Business Partner: fachada de brises bronze em contraluz rasante, rede ouro que se expande em losango e salta para a torre vizinha), `hub` (as duas se encontram: brise bronze projeta a grade de luz sobre o papel com a construção champanhe). Enquadramentos em `presets` (painel 4:5, hero 16:9 com metade esquerda escura, og 1200×630).
- `render.mjs`: Chromium headless (ANGLE/Metal; cai para SwiftShader) → PNG mestre em `out/png/` (ignorado no git). Estudos: `--only pl-hero --spp 16 --scale 0.5 --ovr '{"pl-hero":{...}}' --probe`.
- `build.mjs`: tudo de ponta a ponta (~1 min): render, WebP (cwebp, maior qualidade ≤ teto) e JPG dos OG (ffmpeg), medição (dimensão, KB, luminância da metade esquerda dos heróis) e quadro de contato `docs/dmc/parcerias/imagens-contato.png`.

Regenerar: `node tools/media/parcerias/build.mjs` · Requisitos: Node 24, `npm i` (playwright), `/opt/homebrew/bin/ffmpeg`, `cwebp`.
Saídas: `complexodmc.com.br/assets/images/parcerias/` (pl/bp-painel{,-800}.webp, pl/bp/hub-hero{,-960}.webp, og-*.jpg).
