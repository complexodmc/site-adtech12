# Filme do herói — cena procedural (fora da raiz pública)

- `scene.js`/`scene.html`: Canvas 2D com projeção 3D própria; `frame(t)` é função pura de t (loop de 12 s, t=12 ≡ t=0). Rinoceronte triangulado da máscara alfa de `LOGO_RINOCERONTE.png`; nenhuma mídia de terceiros.
- `render.mjs`: Playwright/Chromium headless renderiza PNGs com tempo controlado (`--layout wide|tall`, `--times 0,2`, `--no-grain`).
- `build.sh`: gera tudo — `bash tools/media/hero/build.sh` (~75 s): quadros em `out/` (ignorado no git), H.264 e VP9 em dois passos, MP4 9:16 recomposto (câmera própria, não recorte), posters WebP (t=10,6 s, sem grão) e quadros de inspeção em `docs/dmc/qa/2026-10-17/hero/`.
- `verify.mjs`: teste de reprodução (readyState ≥ 2, sem erro, tempo avançando) — `node tools/media/hero/verify.mjs [--channel chrome]`.
- Saídas: `complexodmc.com.br/assets/videos/hero-dmc{.mp4,.webm,-mobile.mp4}` e `assets/images/hero-dmc-poster{,-mobile}.webp`.
- Ajustes: enquadramentos em `LAYOUTS`, ritmo em `TL` e nos tempos `appear/go1/go2/out` de `buildNet`; tamanho via bitrates no `build.sh`.
- Requisitos: Node 24, `npm i` (playwright), `/opt/homebrew/bin/ffmpeg` (libx264, libvpx-vp9), `cwebp`.
- Grão estático e leve de propósito: grão animado triplicava o bitrate e virava borrão a 1,9 Mb/s.
- Roteiro: 0–3 skyline com luz rasante · 3–5 janelas acendem e conectam · 5–8 holding (6 eixos), lotes e fluxos · 8–11 rinoceronte · 11–12 dissolve.
