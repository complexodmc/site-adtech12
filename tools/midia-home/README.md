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

## Rodada 3 (prescrições do diretor de arte, 2026-10-17, notas 4–6) — o que mudou em `scenes.js`
- Helpers novos: `halo` (sprite radial aditivo para lâmpadas, substitui o flare em linha), `envFromSky` (PMREM do próprio
  `skyDome` → o vidro reflete a faixa quente do céu), `detailNormal` (2.ª normal tileada somada por `onBeforeCompile`),
  `crownTex` (copa de árvore com alpha fbm, 2 variantes), `lightBand` (faixa de luz interna que varre um pavimento).
  `skyDome` ganhou `bands` (nuvens estratificadas rasantes em espaço azimute × altura) e `coldBand`/`coldCol` (faixa fria
  logo acima do horizonte).
- `construcao`: temperaturas separadas — névoa/céu/ambiente em grafite neutro-frio (#3a3734→#1d1c1b, PMREM topo #3a3f48),
  sol neutro lateral (#d3d6da, 18°) só para a sombra longa da torre da grua sobre o pátio (VSM radius 2; sem gobo), 3200 K só
  no spot do herói + RectArea dourada no topo da laje; câmera +1,5 u e horizonte ≈ 30 % (lança cortada pelo quadro); chão com
  normal dos sulcos ×2, roughness em 2 oitavas e 4 poças; escoras com placa de base/cabeçote em U e travamento em X, tábuas de
  borda 0,05 u + sarrafo, pilares 0,5 u com junta de concretagem (normal); contrapeso em 3 blocos; gancho/carga retirados
  (trolley junto à torre com moitão curto que desce 0,3 u), lança gira 3°; postes só com halo; nuvem baixa estratificada.
- `familias`: forro de concreto a 7,3 u (fecha o "triângulo preto"), rebatida piso→forro (RectArea 0,5 para cima); paredes
  laterais em cantaria (fiadas 0,6 u, 3 larguras de bloco, juntas por normal) na mesma tonalidade dos pilares, com lavagem
  frontal fria 1,3; névoa neutra (#242322); pórticos com 3 conjuntos de larguras de bloco alternados, defasagem de fiada,
  lascas (fbm 3 oitavas), bush-hammer (micro 3 oitavas, nStrength .6), albedo ±12 %, cornija de 3 degraus; fim do eixo com
  parede de cantaria, nicho recuado 0,4 u, porta de bronze 0,1 u com frisos, spot 520 + RectArea 7 + ponto 14 no batente;
  raios em 2 cones (largo .45×, estreito 1,2×) com intensidade ±15 % em 6 s (cos); poeira 200 pts a .13; piso roughness .45.
- `grupos`: câmera 3/4 alta a 45 mm (x 33, y 12,5, z 64, yaw 27°, pitch 5°; horizonte ≈ 45 %), matriz no terço esquerdo, pódio
  novo (10×10×9,6 u) com marquise e pilotis no primeiro plano direito; vidro `MeshPhysical` #8c949a roughness .08 metalness .9
  com `envFromSky` 1.0; montantes 0,1×0,15 u e lajes 0,18 u instanciadas (offset 0,02 u, sem z-fighting); forros 2700 K em
  faixas contínuas (55 % dos pavimentos) + 2–3 % de módulos inteiros acesos a rgb(108,78,50); núcleo dos pilotis opaco;
  calçada #3a3836 com paginação só por normal; 6 balizadores com PointLight (poças); faixa de luz varre 1 u no 6.º
  pavimento; dolly lateral 1,5 u; céu horizonte #3e3a34 com nuvens estratificadas; hemi 2,4; exposição 2,15.
- `patrimonio`: sala — parede de concreto aparente a 6 u (14 tábuas, 4 furos por tile, lavada de cima por RectArea 1,8 + spot
  70, luz neutra), piso de pedra escura com juntas 1,2 u (normal) fosco (roughness .86), rodapé; pedestal 6,2×4,2×0,5 u com
  `Reflector` sob véu (opacidade .5) = reflexo "aterrado" da pilha; 6 lâminas: base 0,14 u (2×), lâmina central (i = 3)
  deslocada 0,3 u com perfil de ouro 0,03 u, demais arestas em aço grafite, espaçadores de ouro r 0,022; vidro com
  `transmission` .92 (ior 1,52, thickness .12, atenuação #6e8088 a 1,6 u) — vê-se a lâmina de baixo através da de cima;
  contraluz 1,0; top light spot 9 (cone .24, dentro do pedestal) varre 3 u; keys dessaturadas (#ffdcc2) para o ouro medido
  ficar só no metal; FogExp2 .03; exposição 1,95; pilha no terço direito (texto à esquerda, como nas outras quatro).
- `terras`: céu horizonte #3e3a34 → zênite #1e2126 com faixa fria #2a2d33 e nuvem rasante; névoa #45423e; hemi #3b4250 a 1,0
  (sombras neutro-frias); key #ffd0ae; uso por talhão (arado escuro / palha / faixas de cultura verde-oliva × solo a 3 u /
  pasto) com albedos dessaturados; relevo em 2 escalas (fbm 3 u + pedras 0,6 u na textura de 2048 + normal de detalhe
  tileada 60× a .6); câmera pitch 15° (horizonte no terço superior) e DOF a 24 u (talhão em primeiro plano nítido); silos a
  (26, −50) com cúpula e anéis, galpão de duas águas com beiral 0,3 u, cumeeira e empenas; copas em billboards cruzados (3
  planos, 2 variantes, `alphaTest` .5, sombra com forma) só em z < −20, 14 grupos nas grotas + 6 no açude; pós desat .5.

Calibrações que divergem do número literal (motivo medido no preview, `measure.mjs`):
- `construcao`: pitch 5,2° (não "−6°" a mais): a −6° adicionais o horizonte subia a ≈ 8 % e o céu sumia; a 5,2° o horizonte
  geométrico fica a 27 % e a linha visível da névoa a ≈ 35 %. Sol a 18° (não 7°): a 7° a sombra da torre tinha 110 u e virava
  mancha; a 18° cruza o pátio com forma.
- `familias`: fiadas da parede 0,6 u = as dos pilares (a leitura de "tijolo" vinha da névoa sépia e da falta de luz frontal,
  não da escala); forro a 7,3 u com RectArea de rebatida (a hemisférica não ilumina superfícies voltadas para baixo).
- `grupos`: horizonte ≈ 45 % (pedido 40 %): a 40 % a marquise do pódio saía do quadro; YAVG 34 neste medidor (pedido 35–40).
- `patrimonio`: top light como `SpotLight` (não RectArea): LTC no vidro com transmissão estourava os topos; piso fosco
  (.86) porque qualquer brilho do piso era contado como "ouro" pelo medidor.
- `terras`: sulcos mantidos em 0,8 u (0,02 u = 0,2 px na textura de 2048 → aliasing); o detalhe fino vem da normal tileada.
