#!/usr/bin/env bash
# Regenera o filme do herói da home a partir da cena procedural.
# Quadros (PNG) → MP4 H.264 + WebM VP9 + MP4 9:16 + posters WebP + quadros de inspeção.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
FF="${FFMPEG:-/opt/homebrew/bin/ffmpeg}"
OUT="$HERE/out"
VID="$ROOT/complexodmc.com.br/assets/videos"
IMG="$ROOT/complexodmc.com.br/assets/images"
QA="$ROOT/docs/dmc/qa/2026-10-17/hero"
FPS=25
POSTER_T="${POSTER_T:-10.60}"
mkdir -p "$OUT" "$QA"

echo "== quadros"
node "$HERE/render.mjs" --layout wide --fps $FPS --out "$OUT/wide" --workers 6
node "$HERE/render.mjs" --layout tall --fps $FPS --out "$OUT/tall" --workers 6
node "$HERE/render.mjs" --layout wide --times "$POSTER_T" --no-grain --out "$OUT/poster-wide" --workers 1
node "$HERE/render.mjs" --layout tall --times "$POSTER_T" --no-grain --out "$OUT/poster-tall" --workers 1

echo "== H.264 (2 passes)"
h264() { # entrada saída bitrate maxrate bufsize
  local log="$OUT/$(basename "$2" .mp4)"
  local common=(-framerate $FPS -i "$1/f%04d.png" -c:v libx264 -preset veryslow -b:v "$3" -maxrate "$4" -bufsize "$5"
    -profile:v high -level:v 4.1 -pix_fmt yuv420p -g 50 -an -passlogfile "$log")
  "$FF" -v error -y "${common[@]}" -pass 1 -f mp4 /dev/null
  "$FF" -v error -y "${common[@]}" -pass 2 -movflags +faststart "$2"
}
h264 "$OUT/wide" "$VID/hero-dmc.mp4" 1850k 2800k 3700k
h264 "$OUT/tall" "$VID/hero-dmc-mobile.mp4" 700k 1100k 1400k

echo "== VP9 (2 passes)"
vp9=(-framerate $FPS -i "$OUT/wide/f%04d.png" -c:v libvpx-vp9 -b:v 1500k -maxrate 2200k -minrate 600k
  -pix_fmt yuv420p -row-mt 1 -tile-columns 2 -g 50 -auto-alt-ref 1 -lag-in-frames 25 -an -passlogfile "$OUT/hero-dmc-vp9")
"$FF" -v error -y "${vp9[@]}" -deadline good -cpu-used 4 -pass 1 -f webm /dev/null
"$FF" -v error -y "${vp9[@]}" -deadline good -cpu-used 1 -pass 2 "$VID/hero-dmc.webm"

echo "== posters (quadro do rinoceronte sobre a cidade, sem grão)"
cwebp -quiet -q 90 -m 6 -sharp_yuv "$OUT/poster-wide/t$POSTER_T.png" -o "$IMG/hero-dmc-poster.webp"
cwebp -quiet -q 88 -m 6 -sharp_yuv "$OUT/poster-tall/t$POSTER_T.png" -o "$IMG/hero-dmc-poster-mobile.webp"

echo "== quadros de inspeção (do MP4 final) + emenda do loop"
for t in 0 2 4 6 8 10; do
  "$FF" -v error -y -ss $t -i "$VID/hero-dmc.mp4" -frames:v 1 "$QA/quadro-${t}s.png"
  "$FF" -v error -y -ss $t -i "$VID/hero-dmc-mobile.mp4" -frames:v 1 "$QA/mobile-quadro-${t}s.png"
done
N=$(( 12 * FPS ))
"$FF" -v error -y -i "$OUT/wide/f$(printf %04d $((N-1))).png" -i "$OUT/wide/f0000.png" \
  -filter_complex "[0][1]hstack,scale=1920:-1" "$QA/emenda-loop-ultimo-x-primeiro.png"
"$FF" -v error -y -i "$VID/hero-dmc.mp4" -i "$VID/hero-dmc.mp4" -filter_complex \
  "[0]trim=start=11.4,setpts=PTS-STARTPTS[a];[1]trim=end=0.6,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1,fps=5,scale=480:-1,tile=6x1" \
  -frames:v 1 "$QA/emenda-loop-11.4s-a-0.6s.png"
ls -la "$VID"/hero-dmc* "$IMG"/hero-dmc-poster*
