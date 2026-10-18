/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/video.js (F1b)
   Spec: PORTAL-ACADEMICO.md §7.7 (DMC_Video), PORTAL-API.md §4.11
   (normalizarVideo) e §8.4 (% assistido), PORTAL-UX.md §6.3 (palco).

   DMC_Video.montar(el, video, { titulo, codigo, aoProgresso })
     → { destruir(): void, pct(): number }
   video = { provedor:'youtube'|'vimeo'|'arquivo'|'externo', id, hash,
             inicioSeg, src, medivel } (aula.video da API) ou null.
   - iframe e <video> criados por DOM API (nunca innerHTML com URL);
   - 'externo' vira o link "Abrir vídeo em nova aba" (nunca iframe);
   - % medido por postMessage, sem script do provedor, conferindo
     event.origin e event.source; falha = só o botão manual;
   - aoProgresso(pct, posicaoSeg, duracaoSeg, fonte) é chamado a
     cada 15 s de reprodução, na pausa e no fim (API §8.4).

   DMC_Video.normalizar(url) (acréscimo): a mesma tabela da API
   §4.11, só para o modo de compatibilidade do estudos-dados.js
   enquanto GET /portal/modulos/:id/conteudo não está montado.
   ============================================================= */
(function () {
  'use strict';

  if (window.DMC_Video) return;

  const RE_YT_ID = /^[A-Za-z0-9_-]{11}$/;
  const ORIGENS_YT = ['https://www.youtube-nocookie.com', 'https://www.youtube.com'];
  const ORIGEM_VIMEO = 'https://player.vimeo.com';
  const INTERVALO_ENVIO_SEG = 15;
  const OCULTAR_CODIGO_MS = 3000;

  // ---------------------------------------------------------------
  // normalizar(url): porte fiel de server/src/portal/estudos/video.js
  // (normalizarVideo, F1a). O E2E da F1b compara os dois numa tabela.
  // ---------------------------------------------------------------
  const VIMEO_ID_RE = /^\d{1,15}$/;
  const VIMEO_HASH_RE = /^[A-Za-z0-9]{1,32}$/;
  const MESMA_ORIGEM_RE = /^\/[A-Za-z0-9_-][A-Za-z0-9/_.-]*\.(mp4|webm)$/i;
  const ARQUIVO_RE = /\.(mp4|webm|ogg)$/i;
  const URL_MAX = 2048;
  const HOSTS_YOUTUBE = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
  const HOSTS_YOUTU_BE = new Set(['youtu.be', 'www.youtu.be']);
  const HOSTS_VIMEO = new Set(['vimeo.com', 'www.vimeo.com']);
  const HOSTS_VIMEO_PLAYER = new Set(['player.vimeo.com']);

  function lerInicioSeg(valor) {
    if (typeof valor !== 'string' || !valor) return null;
    const s = valor.trim().toLowerCase();
    if (/^\d{1,6}$/.test(s)) { const n = Number(s); return n > 0 ? n : null; }
    const m = /^(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/.exec(s);
    if (!m || (!m[1] && !m[2] && !m[3])) return null;
    const total = (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
    return total > 0 ? total : null;
  }
  function youtube(id, inicioSeg) {
    if (!RE_YT_ID.test(id || '')) return null;
    const src = `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&rel=0&modestbranding=1${inicioSeg ? `&start=${inicioSeg}` : ''}`;
    return { provedor: 'youtube', id, hash: null, inicioSeg: inicioSeg || null, src, medivel: true };
  }
  function vimeo(id, hash) {
    if (!VIMEO_ID_RE.test(id || '')) return null;
    const h = hash && VIMEO_HASH_RE.test(hash) ? hash : null;
    const src = `https://player.vimeo.com/video/${id}?api=1&dnt=1${h ? `&h=${h}` : ''}`;
    return { provedor: 'vimeo', id, hash: h, inicioSeg: null, src, medivel: true };
  }
  function mesmaOrigem(s) {
    if (!MESMA_ORIGEM_RE.test(s)) return null;
    if (s.includes('//') || s.split('/').some((seg) => seg === '..' || seg === '.')) return null;
    return { provedor: 'arquivo', id: null, hash: null, inicioSeg: null, src: s, medivel: true };
  }
  function doYoutube(u) {
    const partes = u.pathname.split('/').filter(Boolean);
    const inicio = lerInicioSeg(u.searchParams.get('t') || u.searchParams.get('start') || '');
    if (HOSTS_YOUTU_BE.has(u.hostname)) return partes.length === 1 ? youtube(partes[0], inicio) : null;
    if (partes[0] === 'watch' && partes.length === 1) return youtube(u.searchParams.get('v') || '', inicio);
    if (['embed', 'shorts', 'live', 'v'].includes(partes[0]) && partes.length === 2) return youtube(partes[1], inicio);
    return undefined;
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
  function normalizar(url) {
    if (typeof url !== 'string') return null;
    const s = url.trim();
    if (!s || s.length > URL_MAX || /[\s\u0000-\u001f\u007f\\]/.test(s)) return null;
    if (s.startsWith('/')) return s.startsWith('//') ? null : mesmaOrigem(s);
    let u;
    try { u = new URL(s); } catch { return null; }
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
    if (ARQUIVO_RE.test(u.pathname)) return { provedor: 'arquivo', id: null, hash: null, inicioSeg: null, src: u.href, medivel: true };
    return { provedor: 'externo', id: null, hash: null, inicioSeg: null, src: u.href, medivel: false };
  }

  let contador = 0;
  const movimentoReduzido = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function lerMensagem(dados) {
    if (dados && typeof dados === 'object') return dados;
    if (typeof dados !== 'string') return null;
    try { return JSON.parse(dados); } catch { return null; }
  }

  /**
   * Monta o vídeo em `el` (o palco). Devolve { destruir, pct }.
   */
  function montar(el, video, opcoes) {
    const o = opcoes || {};
    const titulo = o.titulo ? String(o.titulo) : 'Aula';
    const aoProgresso = typeof o.aoProgresso === 'function' ? o.aoProgresso : null;
    const limpar = [];
    let pctMax = 0;
    let destruido = false;

    el.replaceChildren();
    const caixa = document.createElement('div');
    caixa.className = 'pf-est-video';
    el.appendChild(caixa);

    // Sem vídeo ou vídeo externo: sem iframe.
    if (!video || !video.provedor) {
      const p = document.createElement('p');
      p.className = 'pf-est-video__vazio';
      p.textContent = 'O vídeo desta aula ainda não foi publicado.';
      caixa.appendChild(p);
      caixa.classList.add('pf-est-video--vazio');
      return { destruir() { el.replaceChildren(); }, pct: () => 0 };
    }
    if (video.provedor === 'externo') {
      caixa.classList.add('pf-est-video--vazio');
      const a = document.createElement('a');
      a.className = 'dmc-btn dmc-btn--secondary pf-est-video__externo';
      a.href = /^https:\/\//i.test(video.src || '') ? video.src : '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Abrir vídeo em nova aba';
      caixa.appendChild(a);
      return { destruir() { el.replaceChildren(); }, pct: () => 0 };
    }

    // Rótulo com o código da aula sobre o vídeo (pf-palco__codigo).
    let rotulo = null;
    let timerRotulo = null;
    if (o.codigo) {
      rotulo = document.createElement('span');
      rotulo.className = 'pf-palco__codigo pf-est-video__codigo';
      rotulo.setAttribute('aria-hidden', 'true'); // o código também está na meta, com [Copiar]
      rotulo.textContent = String(o.codigo);
      caixa.appendChild(rotulo);
    }
    function aoTocar() {
      if (!rotulo || movimentoReduzido()) return;
      clearTimeout(timerRotulo);
      timerRotulo = setTimeout(() => rotulo.classList.add('is-oculto'), OCULTAR_CODIGO_MS);
    }
    function aoPausar() {
      if (!rotulo) return;
      clearTimeout(timerRotulo);
      rotulo.classList.remove('is-oculto');
    }

    // Contagem de reprodução: envia a cada 15 s tocados, na pausa e no fim.
    let ultimaPos = null;
    let acumulado = 0;
    let ultimoEstado = { pct: 0, pos: 0, dur: null };
    function registrar(pos, dur, fonte) {
      if (!Number.isFinite(pos) || pos < 0) return;
      const duracao = Number.isFinite(dur) && dur > 0 ? dur : null;
      const pct = duracao ? Math.max(0, Math.min(100, (pos / duracao) * 100)) : 0;
      if (pct > pctMax) pctMax = pct;
      if (ultimaPos != null) {
        const delta = pos - ultimaPos;
        if (delta > 0 && delta <= 5) acumulado += delta;
      }
      ultimaPos = pos;
      ultimoEstado = { pct, pos, dur: duracao, fonte };
      if (acumulado >= INTERVALO_ENVIO_SEG) {
        acumulado = 0;
        emitir();
      }
    }
    function emitir() {
      if (!aoProgresso || destruido || !video.medivel) return;
      const e = ultimoEstado;
      if (!e.fonte) return;
      try { aoProgresso(Math.round(e.pct * 10) / 10, Math.round(e.pos), e.dur ? Math.round(e.dur) : null, e.fonte); }
      catch (err) { console.error('[DMC]', err); }
    }

    if (video.provedor === 'arquivo') {
      const v = document.createElement('video');
      v.controls = true;
      v.preload = 'metadata';
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.className = 'pf-est-video__midia';
      v.setAttribute('aria-label', `Vídeo: ${titulo}`);
      v.src = video.src;
      caixa.appendChild(v);
      const on = (ev, fn) => { v.addEventListener(ev, fn); limpar.push(() => v.removeEventListener(ev, fn)); };
      on('timeupdate', () => registrar(v.currentTime, v.duration, 'nativo'));
      on('play', aoTocar);
      on('pause', () => { aoPausar(); registrar(v.currentTime, v.duration, 'nativo'); emitir(); });
      on('ended', () => { registrar(v.duration || v.currentTime, v.duration, 'nativo'); emitir(); });
      return finalizar();
    }

    // iframe (YouTube nocookie ou Vimeo) por DOM API.
    contador += 1;
    const playerId = `pf-est-video-${contador}`;
    const iframe = document.createElement('iframe');
    iframe.id = playerId;
    iframe.className = 'pf-est-video__midia';
    iframe.title = `Vídeo: ${titulo}`;
    iframe.setAttribute('allow', 'fullscreen; picture-in-picture; encrypted-media');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.loading = 'lazy';

    let origensAceitas = [];
    let destino = '';
    if (video.provedor === 'youtube' && RE_YT_ID.test(String(video.id || ''))) {
      const q = new URLSearchParams({ enablejsapi: '1', rel: '0', modestbranding: '1', playsinline: '1', origin: window.location.origin });
      if (Number(video.inicioSeg) > 0) q.set('start', String(Math.floor(Number(video.inicioSeg))));
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}?${q}`;
      origensAceitas = ORIGENS_YT;
      destino = 'https://www.youtube-nocookie.com';
    } else if (video.provedor === 'vimeo' && VIMEO_ID_RE.test(String(video.id || ''))) {
      const q = new URLSearchParams({ api: '1', dnt: '1', player_id: playerId });
      if (video.hash && VIMEO_HASH_RE.test(String(video.hash))) q.set('h', String(video.hash));
      iframe.src = `https://player.vimeo.com/video/${encodeURIComponent(video.id)}?${q}`;
      origensAceitas = [ORIGEM_VIMEO];
      destino = ORIGEM_VIMEO;
    } else {
      const p = document.createElement('p');
      p.className = 'pf-est-video__vazio';
      p.textContent = 'Não foi possível abrir este vídeo.';
      caixa.classList.add('pf-est-video--vazio');
      caixa.appendChild(p);
      return { destruir() { el.replaceChildren(); }, pct: () => 0 };
    }
    caixa.appendChild(iframe);

    function postar(msg) {
      try {
        if (iframe.contentWindow) iframe.contentWindow.postMessage(JSON.stringify(msg), destino);
      } catch { /* provedor ainda não carregou: medição fica para o próximo aviso */ }
    }

    const ehYoutube = video.provedor === 'youtube';
    let duracaoYt = null;
    let sondaYt = null;
    function aoCarregar() {
      if (ehYoutube) {
        postar({ event: 'listening', id: playerId, channel: 'widget' });
        postar({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: playerId, channel: 'widget' });
        // Algumas versões só respondem depois de um segundo "listening".
        clearInterval(sondaYt);
        let tentativas = 0;
        sondaYt = setInterval(() => {
          tentativas += 1;
          postar({ event: 'listening', id: playerId, channel: 'widget' });
          if (tentativas >= 5) clearInterval(sondaYt);
        }, 1500);
      } else {
        ['timeupdate', 'pause', 'ended', 'play'].forEach((ev) => postar({ method: 'addEventListener', value: ev }));
      }
    }
    iframe.addEventListener('load', aoCarregar);
    limpar.push(() => iframe.removeEventListener('load', aoCarregar));

    function aoMensagem(ev) {
      if (origensAceitas.indexOf(ev.origin) < 0) return;
      if (ev.source !== iframe.contentWindow) return;
      const m = lerMensagem(ev.data);
      if (!m) return;
      if (ehYoutube) {
        clearInterval(sondaYt);
        const info = m.info;
        if (m.event === 'infoDelivery' && info && typeof info === 'object') {
          if (Number.isFinite(info.duration) && info.duration > 0) duracaoYt = info.duration;
          if (Number.isFinite(info.currentTime)) registrar(info.currentTime, duracaoYt, 'youtube');
          if (info.playerState === 1) aoTocar();
          if (info.playerState === 2) { aoPausar(); emitir(); }
          if (info.playerState === 0) { if (duracaoYt) registrar(duracaoYt, duracaoYt, 'youtube'); emitir(); }
        } else if (m.event === 'onStateChange') {
          if (m.info === 1) aoTocar();
          if (m.info === 2) { aoPausar(); emitir(); }
          if (m.info === 0) { if (duracaoYt) registrar(duracaoYt, duracaoYt, 'youtube'); emitir(); }
        }
        return;
      }
      // Vimeo
      if (m.event === 'ready') { aoCarregar(); return; }
      const d = m.data || {};
      if (m.event === 'timeupdate') registrar(Number(d.seconds), Number(d.duration), 'vimeo');
      else if (m.event === 'play') aoTocar();
      else if (m.event === 'pause') { aoPausar(); emitir(); }
      else if (m.event === 'ended') { registrar(Number(d.duration) || Number(d.seconds), Number(d.duration), 'vimeo'); emitir(); }
    }
    window.addEventListener('message', aoMensagem);
    limpar.push(() => window.removeEventListener('message', aoMensagem));
    limpar.push(() => clearInterval(sondaYt));

    return finalizar();

    function finalizar() {
      return {
        destruir() {
          if (destruido) return;
          destruido = true;
          clearTimeout(timerRotulo);
          limpar.forEach((fn) => { try { fn(); } catch { /* já removido */ } });
          el.replaceChildren();
        },
        pct: () => Math.round(pctMax * 10) / 10
      };
    }
  }

  window.DMC_Video = { montar, normalizar };
})();
