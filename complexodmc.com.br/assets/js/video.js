/* ============================================================
   COMPLEXO DMC — Vídeo da página

   Cada página termina com um quadro reservado ao vídeo do
   próprio tema:

     <div class="page-video__frame" data-video="" data-video-title="...">

   Enquanto data-video está vazio, o quadro fica como o HTML o
   entrega: o cartaz "espaço reservado". Basta escrever ali o ID
   ou a URL do YouTube para o vídeo entrar no ar — nada mais
   precisa ser tocado.

   O embed não é carregado junto com a página: primeiro entra
   uma capa (imagem + botão de play) e só o clique traz o
   iframe. Uma página com vídeo pesa o mesmo que uma sem.
   ============================================================ */
(function () {
  'use strict';

  /* Aceita o que estiver mais à mão: o ID cru, o link curto, a
     URL de watch, a de embed ou a de Shorts. */
  function extraiId(valor) {
    var texto = (valor || '').trim();
    if (!texto) return '';
    if (/^[\w-]{11}$/.test(texto)) return texto;

    var padroes = [
      /youtu\.be\/([\w-]{11})/,
      /[?&]v=([\w-]{11})/,
      /\/embed\/([\w-]{11})/,
      /\/shorts\/([\w-]{11})/,
      /\/live\/([\w-]{11})/
    ];
    for (var i = 0; i < padroes.length; i++) {
      var achado = texto.match(padroes[i]);
      if (achado) return achado[1];
    }
    return '';
  }

  function montaIframe(quadro, id, titulo) {
    var iframe = document.createElement('iframe');
    iframe.src =
      'https://www.youtube-nocookie.com/embed/' +
      id +
      '?autoplay=1&rel=0&modestbranding=1';
    iframe.title = titulo;
    iframe.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.setAttribute('allowfullscreen', '');
    quadro.innerHTML = '';
    quadro.appendChild(iframe);
    iframe.focus();
  }

  function montaCapa(quadro, id, titulo) {
    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'page-video__cover';
    botao.setAttribute('aria-label', 'Assistir ao vídeo: ' + titulo);

    var capa = document.createElement('img');
    capa.alt = '';
    capa.loading = 'lazy';
    capa.decoding = 'async';
    capa.src = 'https://i.ytimg.com/vi/' + id + '/maxresdefault.jpg';
    // Nem todo vídeo tem miniatura em alta; a de sempre é a hq.
    capa.addEventListener('error', function trocaMiniatura() {
      capa.removeEventListener('error', trocaMiniatura);
      capa.src = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
    });

    var play = document.createElement('span');
    play.className = 'page-video__play';
    play.setAttribute('aria-hidden', 'true');
    play.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6L19 12z"/></svg>';

    botao.appendChild(capa);
    botao.appendChild(play);
    botao.addEventListener('click', function () {
      montaIframe(quadro, id, titulo);
    });

    quadro.innerHTML = '';
    quadro.appendChild(botao);
  }

  function inicia() {
    var quadros = document.querySelectorAll('.page-video__frame[data-video]');

    for (var i = 0; i < quadros.length; i++) {
      var quadro = quadros[i];
      var id = extraiId(quadro.getAttribute('data-video'));
      if (!id) continue; // sem vídeo publicado: fica o cartaz do HTML

      var titulo =
        quadro.getAttribute('data-video-title') ||
        document.title.split('|')[0].trim() ||
        'Complexo DMC';
      montaCapa(quadro, id, titulo);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicia);
  } else {
    inicia();
  }
})();
