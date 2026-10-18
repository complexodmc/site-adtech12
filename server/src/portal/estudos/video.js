// =============================================================
// COMPLEXO DMC · Portal — normalização de vídeo (puro)
// PORTAL-API §4.11 · índice §8.2 item 6 (P1: a F7 importa) · dono: F1a.
//
// normalizarVideo(url) → { provedor, id, hash, inicioSeg, src, medivel } | null
//   youtube  → src https://www.youtube-nocookie.com/embed/ID?enablejsapi=1&rel=0&modestbranding=1[&start=N]
//   vimeo    → src https://player.vimeo.com/video/ID?api=1&dnt=1[&h=HASH]
//   arquivo  → https://…(.mp4|.webm|.ogg) ou caminho da MESMA origem (/…/x.mp4|.webm)
//   externo  → outro https:// (o front abre em nova aba; nunca em iframe)
//   null     → http://, javascript:, data:, vazio, inválido, credenciais na URL
// O vídeo normalizado NÃO é gravado: é calculado na leitura (API §3.2, aulas).
// Assinatura congelada (P1): só acréscimos.
// =============================================================

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID_RE = /^\d{1,15}$/;
const VIMEO_HASH_RE = /^[A-Za-z0-9]{1,32}$/;
const MESMA_ORIGEM_RE = /^\/[A-Za-z0-9_-][A-Za-z0-9/_.-]*\.(mp4|webm)$/i;
const ARQUIVO_RE = /\.(mp4|webm|ogg)$/i;
const URL_MAX = 2048;

const HOSTS_YOUTUBE = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const HOSTS_YOUTU_BE = new Set(['youtu.be', 'www.youtu.be']);
const HOSTS_VIMEO = new Set(['vimeo.com', 'www.vimeo.com']);
const HOSTS_VIMEO_PLAYER = new Set(['player.vimeo.com']);

/** `t=`/`start=` do YouTube: "90", "90s", "1m30s", "1h2m3s" → segundos (inteiro ≥ 0) ou null. */
export function lerInicioSeg(valor) {
  if (typeof valor !== 'string' || !valor) return null;
  const s = valor.trim().toLowerCase();
  if (/^\d{1,6}$/.test(s)) {
    const n = Number(s);
    return n > 0 ? n : null;
  }
  const m = /^(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/.exec(s);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  const total = (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
  return total > 0 ? total : null;
}

function youtube(id, inicioSeg) {
  if (!YOUTUBE_ID_RE.test(id || '')) return null;
  const src = `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&rel=0&modestbranding=1${inicioSeg ? `&start=${inicioSeg}` : ''}`;
  return { provedor: 'youtube', id, hash: null, inicioSeg: inicioSeg || null, src, medivel: true };
}

function vimeo(id, hash) {
  if (!VIMEO_ID_RE.test(id || '')) return null;
  const h = hash && VIMEO_HASH_RE.test(hash) ? hash : null;
  const src = `https://player.vimeo.com/video/${id}?api=1&dnt=1${h ? `&h=${h}` : ''}`;
  return { provedor: 'vimeo', id, hash: h, inicioSeg: null, src, medivel: true };
}

/** Caminho da mesma origem: `/assets/videos/aula.mp4`; recusa `..`, `//`, `\`. */
function mesmaOrigem(s) {
  if (!MESMA_ORIGEM_RE.test(s)) return null;
  if (s.includes('//') || s.split('/').some(seg => seg === '..' || seg === '.')) return null;
  return { provedor: 'arquivo', id: null, hash: null, inicioSeg: null, src: s, medivel: true };
}

function doYoutube(u) {
  const partes = u.pathname.split('/').filter(Boolean);
  const inicio = lerInicioSeg(u.searchParams.get('t') || u.searchParams.get('start') || '');
  if (HOSTS_YOUTU_BE.has(u.hostname)) {
    return partes.length === 1 ? youtube(partes[0], inicio) : null;
  }
  if (partes[0] === 'watch' && partes.length === 1) return youtube(u.searchParams.get('v') || '', inicio);
  if (['embed', 'shorts', 'live', 'v'].includes(partes[0]) && partes.length === 2) return youtube(partes[1], inicio);
  return undefined; // página do YouTube que não é vídeo (canal, playlist): segue como externo
}

function doVimeo(u) {
  const partes = u.pathname.split('/').filter(Boolean);
  if (HOSTS_VIMEO_PLAYER.has(u.hostname)) {
    if (partes[0] === 'video' && partes.length === 2) return vimeo(partes[1], u.searchParams.get('h'));
    return null;
  }
  if (partes.length >= 1 && partes.length <= 2 && VIMEO_ID_RE.test(partes[0])) return vimeo(partes[0], partes[1] || null);
  if (partes.length >= 3 && partes.length <= 4 && ['channels', 'groups'].includes(partes[0]) && VIMEO_ID_RE.test(partes[partes.length - 1])) {
    return vimeo(partes[partes.length - 1], null);
  }
  return undefined;
}

/**
 * @param {unknown} url valor cru de `aulas.videoUrl` (ou de publicação)
 * @returns {{ provedor:'youtube'|'vimeo'|'arquivo'|'externo', id:string|null, hash:string|null,
 *   inicioSeg:number|null, src:string, medivel:boolean } | null}
 */
export function normalizarVideo(url) {
  if (typeof url !== 'string') return null;
  const s = url.trim();
  if (!s || s.length > URL_MAX || /[\s\u0000-\u001f\u007f\\]/.test(s)) return null;
  if (s.startsWith('/')) return s.startsWith('//') ? null : mesmaOrigem(s);
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password || !u.hostname) return null;
  const host = u.hostname.toLowerCase();

  if (HOSTS_YOUTUBE.has(host) || HOSTS_YOUTU_BE.has(host)) {
    const r = doYoutube(u);
    if (r !== undefined) return r;
  } else if (HOSTS_VIMEO.has(host) || HOSTS_VIMEO_PLAYER.has(host)) {
    const r = doVimeo(u);
    if (r !== undefined) return r;
  }
  if (ARQUIVO_RE.test(u.pathname)) {
    return { provedor: 'arquivo', id: null, hash: null, inicioSeg: null, src: u.href, medivel: true };
  }
  return { provedor: 'externo', id: null, hash: null, inicioSeg: null, src: u.href, medivel: false };
}

export default normalizarVideo;
