// ==== 05 · VERTICAIS DE NEGÓCIOS · loops de vídeo decorativos ====
// Spec: docs/dmc/HOME_REDESIGN.md §3·05 e §2.7. Exportado, sem auto-execução;
// o integrador chama initVerticais() a partir de main.js (?v=c4).
//
// Gate (todos obrigatórios): viewport ≥ 1024 · prefers-reduced-motion: no-preference
// · !navigator.connection.saveData · IntersectionObserver disponível.
// Fora do gate o <video> nunca recebe <source> (0 bytes; o <picture> é a imagem final).
// Dentro: IO threshold .25 → ao entrar injeta <source> a partir de data-src-webm /
// data-src-mp4 (uma vez), remove hidden e play(); ao sair pause(); visibilitychange
// pausa/retoma; evento playing → classe is-playing (CSS faz o fade). Sem fetch, sem rAF,
// sem acesso a nada fora de #verticais.

export function initVerticais(root = document) {
  const secao = root.querySelector('#verticais');
  if (!secao) return;

  const loops = Array.from(secao.querySelectorAll('video.verticais-item__loop[data-src-webm], video.verticais-item__loop[data-src-mp4]'));
  if (!loops.length || typeof IntersectionObserver !== 'function' || typeof matchMedia !== 'function') return;

  const mqLargura = matchMedia('(min-width: 1024px)');
  const mqMovimento = matchMedia('(prefers-reduced-motion: no-preference)');
  const economia = () => Boolean(navigator.connection && navigator.connection.saveData);
  const liberado = () => mqLargura.matches && mqMovimento.matches && !economia();

  if (!liberado()) return;   // nunca anexa src: Lighthouse mobile e reduce ficam em 0 bytes

  const visiveis = new Set();

  function preparar(video) {
    if (video.dataset.pronto === '1') return;
    video.dataset.pronto = '1';
    const fontes = [
      ['webm', 'video/webm'],
      ['mp4', 'video/mp4']
    ];
    for (const [chave, tipo] of fontes) {
      const src = video.dataset['src' + chave.charAt(0).toUpperCase() + chave.slice(1)];
      if (!src) continue;
      const source = document.createElement('source');
      source.src = src;
      source.type = tipo;
      video.appendChild(source);
    }
    video.addEventListener('playing', () => video.classList.add('is-playing'), { passive: true });
    // Último <source> falhou → nenhuma fonte tocável: volta ao poster.
    const ultimo = video.lastElementChild;
    if (ultimo) ultimo.addEventListener('error', () => {
      video.classList.remove('is-playing');
      video.classList.add('is-broken');
      video.hidden = true;
    }, { once: true });
    video.hidden = false;
    video.load();
  }

  function tocar(video) {
    if (!liberado() || document.hidden || video.classList.contains('is-broken')) return;
    preparar(video);
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  function pausar(video) {
    if (!video.paused) video.pause();
  }

  // Observa a <figure> (sempre renderizada), não o <video>: com [hidden] ele tem caixa
  // zero e nunca "entra" na viewport.
  const io = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      const video = e.target.querySelector('video.verticais-item__loop');
      if (!video) continue;
      if (e.isIntersecting) { visiveis.add(video); tocar(video); }
      else { visiveis.delete(video); pausar(video); }
    }
  }, { threshold: 0.25 });

  loops.forEach((v) => io.observe(v.closest('.verticais-item__media') || v.parentElement));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) loops.forEach(pausar);
    else visiveis.forEach(tocar);
  });

  // Saiu do gate (rotacionou, ativou reduce): pausa; voltou: retoma só o que está na tela.
  const reavaliar = () => { if (liberado()) visiveis.forEach(tocar); else loops.forEach(pausar); };
  if (typeof mqLargura.addEventListener === 'function') {
    mqLargura.addEventListener('change', reavaliar);
    mqMovimento.addEventListener('change', reavaliar);
  }
}
