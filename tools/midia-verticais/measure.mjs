// Mede quadros PNG: YAVG/YMIN/YMAX (signalstats do ffmpeg, luma 0–255), % de pixels "preto chapado"
// (luma < 5/255) e % de área em ouro (matiz 30–58°, saturação > .28, valor > .30) — para calibrar
// exposição e o teto de 3 % de ouro (HOME_REDESIGN §4). Uso: node tools/midia-verticais/measure.mjs tools/midia-verticais/out/preview/*.png
import { execFileSync } from 'node:child_process';
const FF = '/opt/homebrew/bin/ffmpeg', FP = '/opt/homebrew/bin/ffprobe';
for (const f of process.argv.slice(2)) {
  const st = execFileSync(FP, ['-v', 'error', '-f', 'lavfi', '-i', `movie=${f},signalstats`, '-show_entries', 'frame_tags=lavfi.signalstats.YMIN,lavfi.signalstats.YAVG,lavfi.signalstats.YMAX', '-of', 'csv=p=0']).toString().trim().split(',');
  const buf = execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 30 });
  let black = 0, gold = 0; const n = buf.length / 3;
  for (let i = 0; i < buf.length; i += 3) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; if (y < 5) black++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx < 77) continue;
    const s = (mx - mn) / mx; if (s < 0.28) continue;
    let h = 0; if (mx === r) h = 60 * (((g - b) / (mx - mn)) % 6); else if (mx === g) h = 60 * ((b - r) / (mx - mn) + 2); else h = 60 * ((r - g) / (mx - mn) + 4); if (h < 0) h += 360;
    if (h >= 30 && h <= 58) gold++;
  }
  console.log(`${f.split('/').pop().padEnd(22)} YMIN ${st[0].padStart(3)} YAVG ${Number(st[1]).toFixed(1).padStart(5)} YMAX ${st[2].padStart(3)} · preto ${(100 * black / n).toFixed(1).padStart(4)} % · ouro ${(100 * gold / n).toFixed(2).padStart(5)} %`);
}
