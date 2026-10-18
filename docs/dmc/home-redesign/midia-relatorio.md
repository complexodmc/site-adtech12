# Mídia das 5 verticais — relatório de produção (rodada 2 · 2026-10-17)

Re-render das cinco cenas com as prescrições do diretor de arte da rodada 2 (notas: construcao 5, familias 6,75,
grupos 3,75, patrimonio 4,75, terras 4,5 — todas < 8). Tudo procedural (Three.js r170 + `examples/jsm` no Chromium do
Playwright, ANGLE/Metal), sem IA generativa, sem material de terceiros, sem pessoas/logos/texto. Pipeline em
`tools/midia-home/` (`README.md` lá, com os comandos e a lista completa do que mudou por cena); nada do pipeline vai
para `complexodmc.com.br/`. Nomes de arquivo, dimensões e orçamentos não mudaram; `index.html`/CSS/JS não foram tocados.

## Comum às cinco
- Herói único e composição em terços; domo de céu com gradiente/nuvens/brilho do sol (`skyDome`); exposição por cena;
  aberração cromática .0015→.0007; grão em luminância com corte em L < .05 (sem grão no preto); dessaturação das altas
  luzes onde a key quente estourava; vinheta .28–.32 e faixa inferior escura preservadas.
- **Loop corrigido**: o movimento usava `sin(t·2π)`, logo os quadros 0 e 72 coincidiam (o diretor viu "nada se move entre
  0/72"). Agora é `cos`: extremos em t = 0 e t = 0,5, período 6 s, emenda 143→0 igual à diferença entre quadros vizinhos.
- Medição nova (`tools/midia-home/measure.mjs`): YAVG/YMIN/YMAX por `signalstats`, % de preto (< 5/255) e % de ouro
  (matiz 30–58°, sat > .28). Este medidor dá ≈ 0,55× o YAVG citado nas prescrições (a rodada 1 media 16–33 aqui, 30–35
  lá); o alvo "55–65" foi perseguido como 30–55 neste medidor.

## Por cena — prescrição → o que foi feito → medido (poster desktop)

| Cena | Principais respostas às prescrições | YAVG · preto · ouro | PSNR 143→0 / 0→1 / 0→72 |
|---|---|---|---|
| construcao | laje em execução (forma, armadura, escoras, guarda-corpo 1,1 u/1,5 u, pranchas 0,25 u) no terço direito a 38 mm/11 u; sol a 7° de trás-esquerda (rim) + spot 3200 K cone 26° só no herói; topo da laje lavado por RectArea dourada; fundo com vãos 4/5,5/7 u, lajes fechadas, telas, torre recuada em silhueta; chão com 2 sulcos de pneu + 2 poças; cabo de 2 px + paleta de 3 caixas; flicker 2 % a 7 Hz; FogExp2 .018 na cor do céu | 33,4 · 0,0 % · 1,5 % | 37,1 / 37,2 / 23,7 dB |
| familias | cantaria 0,6 u com 3 padrões de bloco, junta 8 mm, chanfro 6 mm, albedo ±8 %, veios; lintel 0,8 u + cornija 2 degraus; filete de ouro 25 mm enquadrado (câmera 1,5 u, pitch +4°) com RectArea rasante; 4 raios de abertura alta à direita + poeira; paredes laterais com rebatida; luz no fim do eixo; fuga no terço direito (x −0,35, yaw 6°); dolly 3 u + yaw ±1,2°; key −30 %, altas luzes dessaturadas 25 % | 41,8 · 1,2 % · 0,6 % | 37,7 / 37,8 / 21,8 dB |
| grupos | torre-matriz em pele de vidro (montantes 1,5 u, lajes 3,6 u, forro iluminado, 3–5 % de janelas acesas), pilotis + marquise com friso de ouro, passarela de vidro, 3 filiais escalonadas, skyline em névoa, calçada paginada/meio-fio/canteiro/balizadores; câmera da calçada 32 mm a 2 u, pitch 12° para cima, tilt ±1,5° + dolly 2 u; céu de fim de tarde com nuvens; trilhos de luz removidos | 27,7 · 6,9 % · 2,0 % | 41,6 / 41,7 / 18,8 dB |
| patrimonio | vidro #2c3036 transmission .92/ior 1.52 com faces de canto próprias (borda que "acende"), contraluz RectArea atrás da pilha, top light 2×2 u, parede de concreto aparente (tábuas 0,3 u, furos 1,2 u) lavada de cima, pedestal polido com AO de contato e base chanfrada; pilha inteira no terço esquerdo (4,4×2,9 u a 26 u, 85 mm), 60 % livre à direita; ouro só em espaçadores + perfil 15 mm da lâmina do meio; lâminas ±25 mm (defasagem 0,4 s), luz varre 3 u, órbita ±2° | 34,5 · 4,9 % · 0,4 % | 40,9 / 41,2 / 21,9 dB |
| terras | sol a 14° de trás-direita, céu horizonte quente → grafite, 3 camadas de névoa; talhões irregulares com carreadores, sulcos a 30 % (normal/roughness) seguindo curva de nível, talhão-herói mais escuro; estrada com 2 trilhas de roda; mourões 0,15 u, porteira, curral, silo + galpão em silhueta; copas irregulares em grupos nas baixadas (30 % da densidade); DOF a 18 u; travelling 6 u + descida 0,5 u; topos dourados removidos | 51,2 · 0,0 % · 9,8 %* | 34,7 / 36,7 / 23,7 dB |

\* em `terras` o medidor de ouro conta a faixa de céu laranja do pôr-do-sol (matiz 30–40°), não acento de marca; o
ouro propriamente dito é só o rim nas copas/água. Se a direção preferir, baixar a saturação do horizonte (`skyDome`
hor #4a3c2e → #3e3a34) resolve sem reabrir a cena.

Todas as cinco: 0→72 < 24 dB (movimento legível), emenda 143→0 ≈ 0→1 (loop limpo, sem crossfade).

### Divergências do número literal (motivo medido)
- `construcao`: FogExp2 .02→.018 e câmera a 36 u (a 26 u o herói ocupava o centro e não havia céu); pitch 3,6° em vez
  de 4°→−8° para a lança da grua entrar no quadro (torre 13,5 u); horizonte ≈ 33 %.
- `familias`: pórticos de 5,4 u (não 7) e pitch +4°: era a única forma de enquadrar o filete do 2.º pórtico a 50 mm.
- `grupos`: das duas prescrições conflitantes (calçada 28 mm/pitch 20° vs. 3/4 alto 40–60 mm) foi adotada a da calçada,
  com 32 mm/12° para a matriz tangenciar o topo; o ambiente de reflexo é mais claro que o céu visível (vidro a 4 % de
  Fresnel sobre céu escuro devolve preto); horizonte fica baixo por construção do ângulo.
- `patrimonio`: RectArea de contraluz a 2,2 (não 7–12): a reflexão LTC no topo das lâminas virava uma "caixa branca";
  pilha a 26 u para caber no terço (a 20 u, 60 % do quadro).
- `terras`: `spread` do céu .075 porque o quadro só vê ≈ 7° acima do horizonte; sombras com hemisférica neutra-fria
  para quebrar a monocromia marrom.

## Pesos medidos (`ls -la`, limites da §4)

| Arquivo | Dimensões | Peso | Limite | Codificação |
|---|---|---|---|---|
| assets/images/home/vertical-construcao.avif / .webp | 2560×1097 | 48,8 KB / 82,7 KB | 110 / 150 KB | svtav1 crf 22 · cwebp q78 |
| assets/images/home/vertical-construcao-m.avif / .webp | 1200×750 | 23,1 KB / 34,9 KB | 60 / 80 KB | idem |
| assets/images/home/vertical-familias.avif / .webp | 1600×1000 | 12,8 KB / 26,2 KB | 90 / 120 KB | idem |
| assets/images/home/vertical-familias-m.avif / .webp | 1200×750 | 9,3 KB / 16,3 KB | 60 / 80 KB | idem |
| assets/images/home/vertical-grupos.avif / .webp | 1600×1000 | 21,5 KB / 36,2 KB | 90 / 120 KB | idem |
| assets/images/home/vertical-grupos-m.avif / .webp | 1200×750 | 15,3 KB / 24,3 KB | 60 / 80 KB | idem |
| assets/images/home/vertical-patrimonio.avif / .webp | 1600×1000 | 19,5 KB / 34,2 KB | 90 / 120 KB | idem |
| assets/images/home/vertical-patrimonio-m.avif / .webp | 1200×750 | 14,1 KB / 22,9 KB | 60 / 80 KB | idem |
| assets/images/home/vertical-terras.avif / .webp | 1600×1000 | 26,6 KB / 54,9 KB | 90 / 120 KB | idem |
| assets/images/home/vertical-terras-m.avif / .webp | 1200×750 | 19,8 KB / 37,3 KB | 60 / 80 KB | idem |
| assets/videos/home/vertical-construcao.webm / .mp4 | 1680×720, 6,000 s, 24 fps, 144 q. | 864 KB / 637 KB | 1 MB | vp9 crf 36 · x264 crf 27 |
| assets/videos/home/vertical-familias.webm / .mp4 | 1280×800 | 332 KB / 713 KB | 1 MB | vp9 crf 36 · x264 crf 24 |
| assets/videos/home/vertical-grupos.webm / .mp4 | 1280×800 | 560 KB / 700 KB | 1 MB | vp9 crf 36 · x264 crf 24 |
| assets/videos/home/vertical-patrimonio.webm / .mp4 | 1280×800 | 252 KB / 385 KB | 1 MB | vp9 crf 36 · x264 crf 24 |
| assets/videos/home/vertical-terras.webm / .mp4 | 1280×800 | 509 KB / 913 KB | 1 MB | vp9 crf 36 · x264 crf 24 |

Totais: imagens ≈ 595 KB (20 arquivos), vídeos ≈ 5,7 MB (só sob demanda, por painel visível). Detalhe por arquivo com o
comando exato: `tools/midia-home/out/pesos.json`.

## Comandos usados
```sh
node tools/midia-home/render.mjs --preview     # iteração (960 px, t=0 e t=0,5) + --q debug=nokey,nohemi,noenv,up,noback,noedge
node tools/midia-home/measure.mjs tools/midia-home/out/preview/*.png   # YAVG / preto / ouro
node tools/midia-home/render.mjs               # posters + 144 quadros PNG/cena
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
- Crop a 100 % de `construcao` (2560 px): sem franjas de aberração, grão fino só nos meios-tons.

## Autoavaliação / pendências para a rodada 3
- `grupos` continua a mais escura (YAVG 27,7 neste medidor; preto 6,9 %): a física do vidro escuro visto de frente limita;
  subir `exposure` 1.65→1.8 ou clarear o ambiente de reflexo custa pouco se a direção quiser mais meio-tom.
- `terras`: copas em elipsoides ainda leem "lisas" de perto; billboards com alpha fbm seriam o próximo passo; a
  monocromia quente diminuiu (sombras neutras, altas luzes dessaturadas), mas o céu laranja ainda puxa a paleta.
- `patrimonio`: o reflexo do contraluz no topo das lâminas é visível como um brilho quente atrás da pilha — leitura de
  "vidro retroiluminado"; se incomodar, `back.intensity` 2.2→1.2.
- `construcao`: o céu ocupa ≈ 20 % (não o terço) porque a lança da grua precisou caber no quadro.

## Para a integração (agente-B / verticais.js)
Inalterado: `<picture>` com `source type=image/avif` + `image/webp`, `width/height` declarados (2560×1097 /
1600×1000; `-m` 1200×750 em ≤768); `<video muted loop playsinline preload="none" aria-hidden="true">` com `src`
injetado por IntersectionObserver só ≥1024 e sem `prefers-reduced-motion`/`saveData`; WebM primeiro, MP4 de fallback.
Faixa inferior e canto inferior esquerdo já vêm mais escuros do render; mantém-se o véu ≥ .80 sob o texto.
