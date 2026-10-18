# Mídia das 5 verticais da home — pipeline procedural (não publicado)

Cenas Three.js r170 + `examples/jsm` (`vendor/`, baixado pelos comandos abaixo, gitignored)
renderizadas pelo Chromium do Playwright (ANGLE/Metal) → PNG → ffmpeg/cwebp → caminhos finais em
`complexodmc.com.br/assets/{images,videos}/home/`. Espec.: `docs/dmc/HOME_REDESIGN.md` §4;
direção do CEO: `docs/dmc/home-redesign/fatos.md`; relatório: `docs/dmc/home-redesign/midia-relatorio.md`.

```sh
# 1) dependências locais do pipeline (nunca no site, nunca no package.json)
curl -sL -o tools/midia-home/vendor/three.module.js https://unpkg.com/three@0.170.0/build/three.module.js
cd /tmp && npm pack three@0.170.0 --silent && tar xzf three-0.170.0.tgz && \
  mkdir -p "$OLDPWD/tools/midia-home/vendor/jsm" && \
  cp -R package/examples/jsm/{geometries,environments,postprocessing,shaders,lights,lines,objects,utils,math} \
        "$OLDPWD/tools/midia-home/vendor/jsm/" && cd -
# 2) iteração visual (1 quadro a t=0 e 1 a t=0,5 por cena, 960 px) → out/preview/
node tools/midia-home/render.mjs --preview            # --only terras  --q debug=nokey,nohemi,noenv  --suffix -x
# 3) render completo: posters (desktop + mobile) e 144 quadros/cena → out/stills, out/frames
node tools/midia-home/render.mjs                      # --only terras  --stills  --frames 144
# 4) codificação com orçamento (AVIF libsvtav1, WebP cwebp, WebM VP9, MP4 H.264) → assets/
node tools/midia-home/encode.mjs                      # --only terras  --skip-video
# 5) contact sheet (5 posters, 640 px de altura) + verificação em Chromium
node tools/midia-home/contact.mjs
node tools/midia-home/verify.mjs
# 6) medição (calibração de exposição/ouro): YAVG/YMIN/YMAX (signalstats), % preto (<5/255), % ouro (matiz 30–58°)
node tools/midia-home/measure.mjs tools/midia-home/out/preview/*.png
```

Arquivos: `scene.html` (página de render, importmap `three` + `three/addons/`), `scenes.js`
(5 cenas + pós comum), `render.mjs`, `encode.mjs`, `contact.mjs`, `verify.mjs`, `measure.mjs`.
Flags de diagnóstico (`--q debug=...`): `nokey`, `nohemi`, `noenv`, `up` (câmera 15° mais alta, para ver o céu),
`noback`/`noedge` (patrimônio).

## Rodada 1 (prescrições do diretor de arte, 2026-10-17) — o que está em `scenes.js`
- PBR: `MeshStandard/Physical` com normal/roughness procedurais (CanvasTexture fbm → Sobel), `RoundedBoxGeometry`
  em lajes/pilares/blocos/lâminas, `scene.environment` por PMREM (`RoomEnvironment`, gradiente de céu ou
  "estúdio" com faixa quente + janela fria na galeria), key 3200 K (`#ffc89c`) em contraluz/lateral,
  `HemisphereLight` fria, sem `AmbientLight`; sombras `VSMShadowMap` 4096 com `radius` (macias).
- Atmosfera: `FogExp2` + névoa baixa (planos com alpha fbm) + domo de céu em gradiente (shader, `fog:false`).
- DOF: `EffectComposer` → `RenderPass` → `BokehPass` (focus/aperture/maxblur por cena) → `ShaderPass(POST)`.
- Pós comum: aberração cromática .0015, vinheta .28–.32, canto inferior esquerdo e faixa inferior mais
  escuros (texto), curva S (lift .02 · gamma .95 · gain 1.05), dessaturação dos meios-tons (0–15 %),
  grão monocromático 2–3 % ponderado por luminância; ACES, exposição 1.15.
- Loop: todo movimento é senoidal com período = 6 s (quadro 144 ≡ quadro 0, sem crossfade).

Calibrações que divergem do número literal da prescrição (motivo medido no preview):
- Densidades de `FogExp2` reduzidas (.028→.013, .035→.012, .05→.02): com a câmera a 37–46 u o fator de
  névoa passava de 60–80 % e as três cenas ficavam pretas.
- Albedos "de aparência" (#2a2c2e, #121416…) subidos ~1,6–2× em linear: a 2,5 % de refletância nenhuma
  luz devolve imagem; a cor percebida continua grafite depois do ACES.
- `construcao`: `environmentIntensity` .35→.2 e key 3.2→7 (com o IBL a .5 a key não aparecia: PSNR 37 dB
  entre "com key" e "sem key"); spots de obra 40→260 cd (decay 1.6, distância 18 u) e sem sombra (VSM).
- `terras`: sulcos de arado 0,35→0,8 u (0,35 u = 4 px na textura de 2048 → aliasing/"speckle"); força do
  normal map independente do tamanho da textura (`nStrength·6`, não `N/64`).
- `patrimonio`: 85 mm a 20 u (a 14 u o quadro tem 6 u de largura e a lâmina de 5,2 u não cabe no terço);
  parede de fundo lavada por um spot (vidro com transmissão precisa de algo iluminado atrás).

## Rodada 2 (prescrições do diretor de arte, 2026-10-17, notas 3,75–6,75) — o que mudou em `scenes.js`
- Helpers novos: `skyDome` (gradiente + névoa de horizonte + nuvens fbm no shader + brilho suave do sol), `concreteMaps`
  (manchas de cura, tábuas de forma, furos de ancoragem), `beamPlane` (raio de luz alinhado à key, aditivo, alpha fbm),
  `dust` (poeira em suspensão, pontos de 2 px), `netMat` (tela de obra), `line2` (cabos em 2 px com `LineMaterial`).
- Exposição por cena (`exposure` devolvido pela cena → `toneMappingExposure`), aberração .0015→.0007, grão em
  luminância com corte em L < .05 (`smoothstep(.05,.14,lum)`), dessaturação de altas luzes (`desatHi`).
- Loop: `s = cos(t·2π)` em vez de `sin` — com `sin`, os quadros 0 e 72 tinham a mesma posição de câmera (por isso o
  movimento "não lia" entre 0/72). Com `cos` os extremos caem em t = 0 e t = 0,5; o período continua 6 s (sem emenda).
- `construcao`: herói único (laje em execução: forma de madeira, armadura em malha, escoras, guarda-corpo 1,1 u a cada
  1,5 u, rodapé, pranchas 0,25 u) no terço direito, 38 mm a 11 u, sol a ≈ 7° de trás-esquerda (rim) + spot 3200 K de
  cone 26° só no herói + RectArea dourada lavando o topo da laje; fundo com vãos 4/5,5/7 u, lajes fechadas com painéis,
  telas, torre alta recuada; chão com 2 sulcos de pneu + 2 poças; grua com cabo de 2 px e paleta de 3 caixas; flicker 2 %
  a 7 Hz; céu quente→grafite; FogExp2 .018 cor do céu.
- `familias`: cantaria (fiadas de 0,6 u com 3 padrões de bloco, junta 8 mm, chanfro 6 mm, albedo ±8 % por instância,
  2 roughness), veios por normal map, lintel 0,8 u saliente + cornija de 2 degraus, filete de ouro 25 mm com RectArea
  rasante, 4 raios de uma abertura alta à direita + poeira, luz no fim do eixo (ponto focal), paredes laterais em concreto
  com rebatida, câmera a 1,5 u deslocada 0,35 u à esquerda com yaw 6° (fuga no terço direito), dolly 3 u + yaw ±1,2°.
- `grupos`: metáfora trocada — torre-matriz em pele de vidro (montantes 0,1 u a cada 1,5 u, lajes 0,4 u a cada 3,6 u,
  forro iluminado por pavimento + 3–5 % de janelas acesas por `emissiveMap`), pilotis, marquise com friso de ouro,
  passarela de vidro para a filial 1, 3 filiais escalonadas, skyline de 20 prismas a 85–125 u, calçada paginada, meio-fio,
  canteiro, balizadores; câmera da calçada (32 mm a 2 u, pitch 12° para cima, tilt ±1,5° + dolly 2 u); trilhos removidos.
- `patrimonio`: vidro #2c3036 transmission .92 ior 1.52 + faces de canto com material próprio (a luz que entra pelas faces
  sai pela borda), RectArea de contraluz 3,2×2,2 u atrás da pilha, top light 2×2 u, parede de concreto aparente com tábuas
  e furos lavada de cima, pedestal polido com AO de contato (CanvasTexture), base com chanfro, pilha 4,4×2,9 u a 26 u
  (cabe no terço esquerdo com 60 % livre à direita), perfil de ouro 15 mm só na lâmina do meio, lâminas ±25 mm com
  defasagem 0,4 s, luz varre 3 u, órbita ±2°.
- `terras`: sol a ≈ 14° de trás-direita (#ffc9a0), céu gradiente com `spread` .075 (o quadro só vê 7° de céu), talhões
  com bordas irregulares (fbm) e carreadores, sulcos a 30 % de contraste por normal/roughness com orientação por curva de
  nível (perpendicular ao gradiente do relevo no centróide) e jitter, estrada com acostamento + 2 trilhas de roda +
  canteiro central, mourões 0,15 u a cada 3 u, porteira, curral com 4 réguas, silo duplo + galpão em silhueta, copas em
  3 elipsoides com ruído em grupos de 2–5 nas baixadas (≈ 30 % da densidade anterior), 3 camadas de névoa, vento no
  vertex shader, travelling 6 u com descida 0,5 u, DOF a 18 u; topos de mourão dourados removidos.

Calibrações que divergem do número literal (medidas com `measure.mjs`, que dá YAVG ≈ 0,55× o valor citado pelo diretor —
rodada 1 media 16–33 aqui contra 30–35 lá): alvo adotado YAVG 30–55 neste medidor; FogExp2 .02→.018 (construção),
.05→.035 (famílias); ambiente de reflexo de `grupos` mais claro que o céu visível (#8a6a4a a 1.4) porque o vidro a 4 % de
Fresnel sobre um céu escuro devolve preto; `patrimonio` a 26 u (a 20 u a pilha não cabe no terço) e RectArea de
contraluz a 2,2 (a 8–12 a reflexão LTC no topo das lâminas virava uma "caixa branca").
