# Mídia das 5 verticais — relatório de produção (rodada 3 · 2026-10-17)

Re-render das cinco cenas com as prescrições do diretor de arte da rodada 3 (notas: construcao 5,75, familias 6, grupos 4,
patrimonio 5,75, terras 5 — todas < 8). Tudo procedural (Three.js r170 + `examples/jsm` no Chromium do Playwright,
ANGLE/Metal), sem IA generativa, sem material de terceiros, sem pessoas/logos/texto. Pipeline em `tools/midia-home/`
(`README.md` lá, secção "Rodada 3", com a lista completa do que mudou por cena e as calibrações); nada do pipeline vai para
`complexodmc.com.br/`. Nomes de arquivo, dimensões e orçamentos não mudaram; `index.html`/CSS/JS não foram tocados.

## Comum às cinco
- Helpers novos em `scenes.js`: `halo` (lâmpadas sem flare em linha), `envFromSky` (o vidro reflete o próprio domo),
  `detailNormal` (2.ª escala de relevo sem segundo material), `crownTex` (copas em billboard), `lightBand` (luz interna que
  varre um pavimento); `skyDome` com nuvens estratificadas rasantes (`bands`) e faixa fria acima do horizonte (`coldBand`).
- Loop: todo movimento continua em `cos(t·2π)` com período 6 s; a emenda 143→0 foi medida de novo (tabela) e um termo não
  periódico do vento de `terras` (`uWind·0,8`) foi corrigido para `·0,5` (36,5 dB na emenda, igual à diferença entre vizinhos).
- Medidor (`measure.mjs`): YAVG/YMIN/YMAX, % de preto (< 5/255) e % de "ouro" (matiz 30–58°, sat > .28). Em `terras` o
  ouro medido é o solo (palha/arado), não acento de marca; o céu laranja da rodada 2 (9,8 %) saiu.

## Por cena — prescrição → o que foi feito → medido (poster desktop)

| Cena | Principais respostas às prescrições | YAVG · preto · ouro | PSNR 143→0 / 0→1 / 0→72 |
|---|---|---|---|
| construcao | temperaturas separadas: névoa/céu/PMREM em grafite neutro-frio, sol neutro lateral (18°) só para a sombra longa da torre da grua (sem gobo, VSM radius 2), 3200 K só no spot do herói + RectArea dourada na laje; câmera +1,5 u, horizonte ≈ 30 % (lança cortada); sulcos ×2, roughness 2 oitavas, 4 poças; escoras com base/cabeçote em U + travamento em X, tábuas 0,05 u, pilares 0,5 u com junta; contrapeso em 3 blocos; carga retirada, trolley junto à torre, moitão desce 0,3 u, lança gira 3°; postes só com halo; nuvem baixa estratificada | 35,0 · 0,0 % · 1,5 % | 38,1 / 38,1 / 24,5 dB |
| familias | forro de concreto a 7,3 u (fecha o triângulo preto) com rebatida piso→forro; paredes laterais na mesma cantaria dos pilares (fiadas 0,6 u, juntas por normal) com lavagem frontal fria; névoa neutra; pórticos com 3 larguras de bloco alternadas, defasagem de fiada, lascas, bush-hammer, albedo ±12 %, cornija 3 degraus; fim do eixo: nicho 0,4 u + porta de bronze 0,1 u lavada de cima (ponto focal); raios em 2 cones com ±15 % em 6 s; piso roughness .45 (sem hot spot); poeira mais legível | 61,8 · 0,0 % · 0,4 % | 36,5 / 36,6 / 21,3 dB |
| grupos | metáfora mantida, cena refeita: câmera 3/4 alta a 45 mm (pitch 5°, horizonte ≈ 45 %), matriz no terço esquerdo, pódio novo com marquise + pilotis no primeiro plano direito; vidro #8c949a roughness .08 metalness .9 refletindo o PMREM do domo (faixa quente do céu); montantes 0,15 u e lajes com offset 0,02 u; forros 2700 K em faixas contínuas + 2–3 % de módulos inteiros a L ≈ .6; núcleo dos pilotis sem lóbulo especular; calçada #3a3836 com paginação só por normal; balizadores com poças (PointLight); faixa de luz varre 1 u + dolly lateral 1,5 u; céu #3e3a34 com nuvens; exposição 2,15 | 33,5 · 2,8 % · 1,3 % | 39,0 / 39,1 / 24,2 dB |
| patrimonio | sala com parede de concreto aparente a 6 u (tábuas + furos, lavada de cima), piso de pedra com juntas, rodapé; pedestal 6,2×4,2 u com `Reflector` sob véu (reflexo "aterrado"); 6 lâminas: base 2× (0,14 u), lâmina central deslocada 0,3 u com perfil de ouro, demais arestas em aço grafite, espaçadores de ouro; vidro com `transmission` .92 (vê-se a lâmina de baixo); contraluz 1,0, top light em spot estreito (dentro do pedestal); keys dessaturadas; FogExp2 .03; pilha no terço direito | 31,3 · 2,3 % · 0,6 % | 37,8 / 37,8 / 24,7 dB |
| terras | céu #3e3a34 → #1e2126 com faixa fria e nuvem rasante, hemisférica #3b4250 (sombras frias), key menos laranja, pós desat .5; uso por talhão (arado escuro / palha / faixas verde-oliva × solo / pasto) dessaturado; relevo 2 escalas (3 u + pedras 0,6 u + normal de detalhe 60×); pitch 15° (horizonte no terço superior), DOF a 24 u; silos com cúpula e anéis, galpão de duas águas com beiral; copas em billboards cruzados (alpha fbm, 2 variantes, sombra com forma) só atrás de z −20 | 50,2 · 0,3 % · 6,0 %* | 36,5 / 36,6 / 20,4 dB |

\* solo palha/arado (matiz 35–45°), não ouro de marca; o céu é neutro.

Todas as cinco: 0→72 ≤ 24,7 dB (movimento legível), emenda 143→0 ≈ 0→1 (loop limpo, sem crossfade).

### Divergências do número literal (motivo medido)
- `construcao`: pitch 5,2° em vez de "−6° a mais" (a −6° o horizonte ia a 8 % e o céu sumia; adotado horizonte geométrico
  27 %, linha de névoa ≈ 35 %); sol a 18° (a 7° a sombra da torre tinha 110 u e virava mancha). Gancho retirado (opção dada).
- `familias`: a parede esquerda já tinha fiadas de 0,6 u — a leitura de "tijolo" vinha da névoa sépia e da ausência de luz
  frontal; corrigido por névoa neutra + lavagem fria, não por escala. Forro em vez de "domo" (galeria coberta).
- `grupos`: horizonte ≈ 45 % (pedido 40 %: a 40 % a marquise do pódio saía do quadro); YAVG 33,5 (pedido 35–40 neste
  medidor) — subir `exposure` 2,15→2,3 custa pouco se a direção preferir.
- `patrimonio`: top light como spot (RectArea/LTC sobre vidro com transmissão estourava os topos); pilha no terço direito,
  conforme o aceite visual registrado no próprio arquivo (texto à esquerda como nas outras quatro).
- `terras`: sulcos mantidos em 0,8 u (0,02 u = 0,2 px na textura); o detalhe fino vem da normal tileada.

## Pesos medidos (`ls -la`, limites da §4)

| Arquivo | Dimensões | Peso | Limite | Codificação |
|---|---|---|---|---|
| assets/images/home/vertical-construcao.avif / .webp | 2560×1097 | 54,3 KB / 84,0 KB | 110 / 150 KB | svtav1 crf 22 · cwebp q78 |
| assets/images/home/vertical-construcao-m.avif / .webp | 1200×750 | 27,2 KB / 36,9 KB | 60 / 80 KB | idem |
| assets/images/home/vertical-familias.avif / .webp | 1600×1000 | 32,2 KB / 53,7 KB | 90 / 120 KB | idem |
| assets/images/home/vertical-familias-m.avif / .webp | 1200×750 | 20,2 KB / 30,0 KB | 60 / 80 KB | idem |
| assets/images/home/vertical-grupos.avif / .webp | 1600×1000 | 22,6 KB / 40,6 KB | 90 / 120 KB | idem |
| assets/images/home/vertical-grupos-m.avif / .webp | 1200×750 | 16,5 KB / 27,1 KB | 60 / 80 KB | idem |
| assets/images/home/vertical-patrimonio.avif / .webp | 1600×1000 | 23,2 KB / 38,7 KB | 90 / 120 KB | idem |
| assets/images/home/vertical-patrimonio-m.avif / .webp | 1200×750 | 17,8 KB / 26,5 KB | 60 / 80 KB | idem |
| assets/images/home/vertical-terras.avif / .webp | 1600×1000 | 47,3 KB / 87,6 KB | 90 / 120 KB | idem |
| assets/images/home/vertical-terras-m.avif / .webp | 1200×750 | 35,9 KB / 60,7 KB | 60 / 80 KB | idem |
| assets/videos/home/vertical-construcao.webm / .mp4 | 1680×720, 6,000 s, 24 fps, 144 q. | 789 KB / 579 KB | 1 MB | vp9 crf 36 · x264 crf 24 |
| assets/videos/home/vertical-familias.webm / .mp4 | 1280×800 | 666 KB / 518 KB | 1 MB | idem |
| assets/videos/home/vertical-grupos.webm / .mp4 | 1280×800 | 406 KB / 563 KB | 1 MB | idem |
| assets/videos/home/vertical-patrimonio.webm / .mp4 | 1280×800 | 358 KB / 555 KB | 1 MB | idem |
| assets/videos/home/vertical-terras.webm / .mp4 | 1280×800 | 770 KB / 609 KB | 1 MB | idem |

Totais: imagens ≈ 800 KB (20 arquivos), vídeos ≈ 5,7 MB (só sob demanda, por painel visível). Detalhe por arquivo com o
comando exato: `tools/midia-home/out/pesos.json`.

## Comandos usados
```sh
node tools/midia-home/render.mjs --preview     # iteração (960 px, t=0 e t=0,5) + --q debug=nokey,nohemi,noenv,up,noback,nosweep
node tools/midia-home/measure.mjs tools/midia-home/out/preview/*.png   # YAVG / preto / ouro
node tools/midia-home/render.mjs               # posters + 144 quadros PNG/cena   (--only <slug> para uma cena)
node tools/midia-home/encode.mjs               # AVIF libsvtav1 · WebP cwebp · WebM VP9 · MP4 x264 (reaperta se estourar)
node tools/midia-home/contact.mjs              # → docs/dmc/home-redesign/midia-contact-sheet.png (5 posters, 640 px)
node tools/midia-home/verify.mjs               # Chromium: WebM toca/avança/loopa; AVIF/WebP carregam
```

## Verificação
- ffprobe: VP9 Profile 0 e H.264 High, yuv420p, 24 fps, 144 quadros, 6,000 s, sem áudio, faststart.
- Playwright/Chromium (`verify.mjs`): 5/5 WebM `canplaythrough`, avançam e fazem loop; `canPlayType(avc1.640029)` =
  probably; 20/20 imagens carregam nas dimensões declaradas.
- Safari: perfil H.264 High/yuv420p/faststart é o compatível; teste visual no Safari continua pendente (sem WebKit do
  Playwright nesta máquina).
- Contact sheet: `docs/dmc/home-redesign/midia-contact-sheet.png` (5650×640, ordem construcao, familias, grupos,
  patrimonio, terras).

## Autoavaliação / pendências para a rodada 4
- `grupos`: continua a cena mais "maquete" das cinco — a pele de vidro agora reflete o céu e tem profundidade, mas as
  janelas acesas, mesmo em módulos inteiros e 2700 K, ainda leem como retângulos; o próximo passo seria interior visível
  (forro + divisórias atrás de vidro com transmissão), o que dobra o custo de render.
- `terras`: o solo brasileiro continua marrom (6 % no medidor de ouro); se a direção quiser menos, a alavanca é
  `USE`/albedos em `colorFn` ou `desat` .5→.6.
- `familias`: com o forro e a rebatida a cena ficou mais clara (YAVG 62); se incomodar, `ceilBounce` .5→.3.
- `patrimonio`: o `Reflector` custa um passe extra; o véu a .5 mantém o reflexo discreto — ajustar opacidade se a direção
  quiser mais ou menos espelho.

## Para a integração (agente-B / verticais.js)
Inalterado: `<picture>` com `source type=image/avif` + `image/webp`, `width/height` declarados (2560×1097 /
1600×1000; `-m` 1200×750 em ≤768); `<video muted loop playsinline preload="none" aria-hidden="true">` com `src`
injetado por IntersectionObserver só ≥1024 e sem `prefers-reduced-motion`/`saveData`; WebM primeiro, MP4 de fallback.
Faixa inferior e canto inferior esquerdo já vêm mais escuros do render; mantém-se o véu ≥ .80 sob o texto.
