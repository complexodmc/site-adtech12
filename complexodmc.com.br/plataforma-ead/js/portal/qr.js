/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/qr.js (F0b)
   Spec: docs/dmc/PORTAL-ACADEMICO.md §7.7 (DMC_QR), D-47 (margem 4),
   D-68 (conferência determinística em tests/e2e/_qr.js), D-72 (onde há QR:
   certificado, declaração, comprovante de assinatura e o 2FA do Perfil).

   DMC_QR.svg(texto, { tamanho = 128, margem = 4, nivel = 'M', titulo }) → string
     SVG com <title>, fundo branco próprio (também no tema escuro) e módulos
     pretos. `margem` em módulos: 4 = zona de silêncio da ISO/IEC 18004.
     Formato (para quem confere a matriz, D-68): viewBox "0 0 L L" em
     módulos (L = módulos + 2 × margem); um <rect> branco do tamanho todo e
     um <path> com um retângulo por sequência horizontal de módulos escuros
     ("M<x> <y>h<n>v1h-<n>z", já deslocado pela margem).
   DMC_QR.matriz(texto, { nivel = 'M' }) → boolean[][] (linha × coluna; true = escuro)
   DMC_QR.pronto → Promise<void>  (gerador carregado; o DMC_Portal e o
     DMC_UI.carregarScript esperam por ela antes de entregar a página)

   Codificação: modo Byte com os bytes UTF-8 do texto, versão automática
   (typeNumber 0), correção de erro `nivel` — a mesma matriz que
   `qrcode(0, nivel); addData(texto); make()` gera para texto ASCII.

   Gerador: biblioteca de terceiro VENDORIZADA (T2; nada de CDN em página
   autenticada): js/vendor/qrcode-generator/qrcode.js — qrcode-generator
   2.0.4, Kazuhiko Arase, licença MIT (js/vendor/qrcode-generator/LICENSE).
     SHA-256 do qrcode.js: 79ec86f82856005b1c887905cfccfcfbec3821ca61c7fd5a952faa5f778f791c
     Integridade do pacote npm (sha512, conferida no download):
       mZSiP6RnbHl4xL2Ap5HfkjLnmxfKcPWpWe/c+5XxCuetEenqmNFf1FH/ftXPCtFG5/TDobjsjz6sSNL0Sr8Z9g==
   Trocar a versão = trocar o arquivo, o SHA-256 acima e VENDOR_SHA256 (o
   portal-ui.spec.js confere o arquivo contra a constante).
   ============================================================= */
(function () {
  'use strict';

  if (window.DMC_QR) return; // carregado duas vezes: o primeiro vale

  const VENDOR_SHA256 = '79ec86f82856005b1c887905cfccfcfbec3821ca61c7fd5a952faa5f778f791c';
  const VENDOR_VERSAO = '2.0.4';
  const NIVEIS = ['L', 'M', 'Q', 'H'];

  // URL do gerador relativa a ESTE script (funciona em qualquer página e em carga dinâmica).
  const atual = document.currentScript;
  const base = atual && atual.src ? atual.src : new URL('js/portal/qr.js', window.location.href).href;
  const URL_VENDOR = `${new URL('../vendor/qrcode-generator/qrcode.js', base).href.replace(/[?#].*$/, '')}?v=${VENDOR_VERSAO}`;

  function gerador() {
    return typeof window.qrcode === 'function' ? window.qrcode : null;
  }

  const pronto = gerador() ? Promise.resolve() : new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = URL_VENDOR;
    s.async = false;
    s.onload = () => (gerador() ? ok() : falha(new Error('DMC_QR: o gerador de QR carregou sem definir qrcode().')));
    s.onerror = () => falha(new Error('DMC_QR: não foi possível carregar o gerador de QR.'));
    (document.head || document.documentElement).appendChild(s);
  });
  pronto.catch(() => { /* svg() lança com a mensagem; quem chama decide o estado honesto */ });

  function exigirGerador() {
    const g = gerador();
    if (!g) throw new Error('DMC_QR: o gerador de QR ainda não carregou (aguarde DMC_QR.pronto).');
    return g;
  }

  function bytesUtf8(g, texto) {
    const f = g.stringToBytesFuncs && g.stringToBytesFuncs['UTF-8'];
    if (typeof f === 'function') return f(texto);
    return Array.from(new TextEncoder().encode(texto));
  }

  function codificar(texto, nivel) {
    if (typeof texto !== 'string' || !texto) throw new TypeError('DMC_QR: informe o texto do QR (string não vazia).');
    const g = exigirGerador();
    const qr = g(0, NIVEIS.indexOf(nivel) >= 0 ? nivel : 'M');
    let binario = '';
    for (const b of bytesUtf8(g, texto)) binario += String.fromCharCode(b & 0xff);
    qr.addData(binario, 'Byte');
    qr.make();
    return qr;
  }

  function matriz(texto, opcoes) {
    const o = opcoes || {};
    const qr = codificar(texto, o.nivel);
    const n = qr.getModuleCount();
    const linhas = [];
    for (let r = 0; r < n; r++) {
      const linha = [];
      for (let c = 0; c < n; c++) linha.push(qr.isDark(r, c));
      linhas.push(linha);
    }
    return linhas;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function svg(texto, opcoes) {
    const o = opcoes || {};
    const tamanho = Number(o.tamanho) > 0 ? Math.round(Number(o.tamanho)) : 128;
    const margem = Number.isFinite(Number(o.margem)) && Number(o.margem) >= 0 ? Math.floor(Number(o.margem)) : 4;
    const titulo = o.titulo != null && String(o.titulo).trim() ? String(o.titulo).trim() : 'Código QR';
    const m = matriz(texto, { nivel: o.nivel });
    const n = m.length;
    const lado = n + 2 * margem;
    let d = '';
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!m[r][c]) { c++; continue; }
        let fim = c;
        while (fim < n && m[r][fim]) fim++;
        const largura = fim - c;
        d += `M${c + margem} ${r + margem}h${largura}v1h-${largura}z`;
        c = fim;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges" role="img" focusable="false" data-pf-qr-modulos="${n}" data-pf-qr-margem="${margem}"><title>${esc(titulo)}</title><rect width="${lado}" height="${lado}" fill="#fff"/><path fill="#000" d="${d}"/></svg>`;
  }

  window.DMC_QR = Object.freeze({ svg, matriz, pronto, VENDOR_SHA256, VENDOR_VERSAO });
})();
