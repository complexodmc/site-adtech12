// ============================================
// COMPLEXO DMC — MAIN JAVASCRIPT (home)
// Menu: assets/js/navbar.js · Rede neural (#conheca): assets/js/rede-neural.js
// Mapa (#presenca): assets/js/brasil.js · Vídeo do fim da página: assets/js/video.js
// Seções novas da home v2 (docs/dmc/HOME_REDESIGN.md §5.3): initVerticais,
// initNewsletter, initEixosAncora e o WhatsApp qualificado, no fim deste arquivo.
// ============================================

document.addEventListener('DOMContentLoaded', function() {

    const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');

    // ============================================
    // HERÓI — vídeo de fundo
    // O cartaz é o <picture> (.hero__poster). O vídeo fica transparente
    // até tocar (.is-playing) e pausa fora da tela. Com movimento
    // reduzido nenhum <source> casa (media query) e o vídeo é pausado.
    // ============================================
    const heroi = document.getElementById('hero');
    const video = heroi && heroi.querySelector('.hero__video');
    const cartaz = heroi && heroi.querySelector('.hero__poster img');

    if (cartaz) {
        const semCartaz = () => cartaz.classList.add('is-broken');
        if (cartaz.complete && cartaz.naturalWidth === 0) semCartaz();
        cartaz.addEventListener('error', semCartaz);
        // O mesmo arquivo do <picture> vira o poster do vídeo (cache, sem 2º download).
        const usarComoPoster = () => {
            if (video && cartaz.naturalWidth && cartaz.currentSrc) video.poster = cartaz.currentSrc;
        };
        if (cartaz.complete) usarComoPoster();
        else cartaz.addEventListener('load', usarComoPoster);
    }

    if (video) {
        if (reduzMovimento.matches) {
            video.removeAttribute('autoplay');
            video.pause();
        } else {
            const marcar = () => video.classList.add('is-playing');
            video.addEventListener('playing', marcar);
            if (!video.paused && video.readyState > 2) marcar();

            if ('IntersectionObserver' in window) {
                new IntersectionObserver((entradas) => {
                    entradas.forEach((e) => {
                        if (e.isIntersecting) {
                            const p = video.play();
                            if (p && p.catch) p.catch(() => {});
                        } else {
                            video.pause();
                        }
                    });
                }, { threshold: 0.05 }).observe(heroi);
            }
        }
    }

    // ============================================
    // CTA de eixo → formulário com o assunto já escolhido
    // <a href="#contact" data-assunto="E1"> pré-seleciona #cf-eixo.
    // ============================================
    const assunto = document.getElementById('cf-eixo');
    // Vindo de página interna: index.html?assunto=E1#contact
    const assuntoUrl = new URLSearchParams(location.search).get('assunto');
    if (assunto && assuntoUrl && /^E[1-6]$/.test(assuntoUrl)) assunto.value = assuntoUrl;
    document.addEventListener('click', (e) => {
        const cta = e.target.closest && e.target.closest('[data-assunto]');
        if (!cta || !assunto) return;
        const valor = cta.getAttribute('data-assunto');
        if (assunto.querySelector('option[value="' + valor + '"]')) assunto.value = valor;
    });

    // ============================================
    // SCROLL TO TOP BUTTON
    // ============================================
    const scrollToTopBtn = document.getElementById('scrollToTop');

    if (scrollToTopBtn) {
        let scrollTopTicking = false;

        function updateScrollTopBtn() {
            scrollToTopBtn.classList.toggle('visible', window.scrollY > 500);
            scrollTopTicking = false;
        }

        window.addEventListener('scroll', () => {
            if (!scrollTopTicking) {
                window.requestAnimationFrame(updateScrollTopBtn);
                scrollTopTicking = true;
            }
        }, { passive: true });

        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: reduzMovimento.matches ? 'auto' : 'smooth' });
            const marca = document.querySelector('.dmc-brand');
            if (marca) marca.focus({ preventScroll: true });
        });
    }

    // ============================================
    // FORMULÁRIO DE CONTATO → POST /api/contato
    // Contrato: server/src/routes/contato.js. A validação de formato fica com
    // o navegador (required/type/minlength) e a definitiva com o servidor.
    // Estados em #formMessage: enviando / sucesso / erro. Só há "sucesso"
    // quando o servidor responde 2xx com { ok: true } — nunca simulado.
    // ============================================
    const contactForm = document.getElementById('contactForm');

    if (contactForm && contactForm.tagName === 'FORM') {
        const formMessage = document.getElementById('formMessage');
        const submitBtn = contactForm.querySelector('[type="submit"]');
        const rotuloBotao = submitBtn ? submitBtn.textContent : '';
        const endpoint = contactForm.getAttribute('action') || '/api/contato';
        const EMAIL_EQUIPE = 'administrativo@complexodmc.com.br';

        function mostrarEstado(texto, estado) {
            if (!formMessage) return;
            formMessage.textContent = texto;
            formMessage.className = 'form-message is-' + estado;
        }

        function ocupado(sim) {
            if (sim) contactForm.setAttribute('aria-busy', 'true');
            else contactForm.removeAttribute('aria-busy');
            if (submitBtn) {
                submitBtn.disabled = sim;
                submitBtn.textContent = sim ? 'Enviando…' : rotuloBotao;
            }
        }

        // Erro por campo: <p id="cf-email-erro"> logo abaixo do campo, ligado por
        // aria-describedby, para o leitor de tela anunciar o erro certo no campo certo.
        function limparErro(campo) {
            if (!campo || !campo.removeAttribute) return;
            campo.removeAttribute('aria-invalid');
            const erro = campo.id && document.getElementById(campo.id + '-erro');
            if (erro) erro.remove();
            const ids = (campo.getAttribute('aria-describedby') || '').split(/\s+/)
                .filter((id) => id && id !== campo.id + '-erro');
            if (ids.length) campo.setAttribute('aria-describedby', ids.join(' '));
            else campo.removeAttribute('aria-describedby');
        }

        function marcarInvalidos(campos) {
            let primeiro = null;
            Object.keys(campos || {}).forEach((nome) => {
                const campo = contactForm.elements.namedItem(nome);
                if (!campo || !campo.setAttribute || !campo.id) return;
                campo.setAttribute('aria-invalid', 'true');
                const idErro = campo.id + '-erro';
                let erro = document.getElementById(idErro);
                if (!erro) {
                    erro = document.createElement('p');
                    erro.id = idErro;
                    erro.className = 'form-field__error';
                    (campo.closest('.form-field, .form-consent') || campo.parentNode).appendChild(erro);
                }
                erro.textContent = String(campos[nome]);
                const ids = (campo.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
                if (ids.indexOf(idErro) === -1) ids.push(idErro);
                campo.setAttribute('aria-describedby', ids.join(' '));
                if (!primeiro) primeiro = campo;
            });
            if (primeiro && primeiro.focus) primeiro.focus();
        }

        // Ao corrigir um campo apontado pelo servidor, tira a marca e a mensagem de erro.
        contactForm.addEventListener('input', (e) => limparErro(e.target));
        contactForm.addEventListener('change', (e) => limparErro(e.target));

        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (contactForm.getAttribute('aria-busy') === 'true') return;
            contactForm.querySelectorAll('[aria-invalid="true"]').forEach(limparErro);

            const dados = {};
            new FormData(contactForm).forEach((valor, campo) => {
                dados[campo] = typeof valor === 'string' ? valor.trim() : valor;
            });
            const consentimento = contactForm.elements.namedItem('consentimento');
            dados.consentimento = Boolean(consentimento && consentimento.checked);
            dados.origem = contactForm.dataset.origem || dados.origem || window.location.pathname;

            ocupado(true);
            mostrarEstado('Enviando sua mensagem…', 'enviando');

            let resposta;
            let corpo = null;
            try {
                const opcoes = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(dados),
                    credentials: 'same-origin'
                };
                if (window.AbortSignal && typeof AbortSignal.timeout === 'function') {
                    opcoes.signal = AbortSignal.timeout(15000);
                }
                resposta = await fetch(endpoint, opcoes);
                corpo = await resposta.json().catch(() => null);
            } catch (err) {
                ocupado(false);
                mostrarEstado('Não conseguimos falar com o servidor. Confira sua conexão e tente de novo; se preferir, escreva para ' + EMAIL_EQUIPE + '.', 'erro');
                return;
            }
            ocupado(false);

            if (resposta.ok && corpo && corpo.ok === true) {
                contactForm.reset();
                mostrarEstado('Mensagem recebida. Nossa equipe vai retornar pelo contato informado.', 'sucesso');
                return;
            }
            if (resposta.status === 400 && corpo && corpo.campos) {
                marcarInvalidos(corpo.campos);
                mostrarEstado(Object.values(corpo.campos).join(' '), 'erro');
                return;
            }
            if ((resposta.status === 429 || resposta.status === 413 || resposta.status === 400) && corpo && corpo.error) {
                mostrarEstado(corpo.error, 'erro');
                return;
            }
            mostrarEstado('Não foi possível enviar agora. Tente novamente em instantes ou escreva para ' + EMAIL_EQUIPE + '.', 'erro');
        });
    }

    // ============================================
    // REVELAÇÃO (.dmc-reveal) — opacidade + 16px, uma vez.
    // Só existe com JS (html.dmc-js); nunca em conteúdo crítico.
    // ============================================
    const revelar = Array.from(document.querySelectorAll('.dmc-reveal'));
    if (revelar.length) {
        const mostrar = (el) => el.classList.add('is-in');
        if ('IntersectionObserver' in window && !reduzMovimento.matches) {
            const io = new IntersectionObserver((entradas, obs) => {
                entradas.forEach((e) => {
                    if (!e.isIntersecting) return;
                    mostrar(e.target);
                    obs.unobserve(e.target);
                });
            }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
            revelar.forEach((el) => io.observe(el));
        } else {
            revelar.forEach(mostrar);
        }
    }
});

// ============================================================
// HOME v2 — seções novas (docs/dmc/HOME_REDESIGN.md §5.3)
// Tudo abaixo é progressive enhancement: sem JS as seções ficam
// inteiras (poster das verticais, SVG do mapa, POST nativo da newsletter).
// ============================================================
(function () {
  'use strict';

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

  function initVerticais(root = document) {
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

  // ==== 09 · NEWSLETTER ==== initNewsletter()
  // Clone do formulário de contato (acima) para #newsletterForm → POST /api/newsletter.
  // Contrato: server/src/routes/newsletter.js (201 {ok:true} · 200 isca · 400 {error,campos}
  // · 413 · 429 · 503). Copy: docs/dmc/home-redesign/copy.json → newsletter.mensagens.
  // Regras: sucesso SÓ com resposta 2xx e corpo.ok === true; erros nunca contêm
  // "receb"/"cadastrad"; sem JS o form faz POST nativo (novalidate só entra aqui).
  // Sem auto-execução; não toca nada fora da própria seção.

  const EMAIL_NEWSLETTER = 'administrativo@complexodmc.com.br';
  const TIMEOUT_MS = 15000;

  const MENSAGENS_NEWSLETTER = Object.freeze({
    enviando: 'Enviando…',
    sucesso201: 'Inscrição registrada. Você pode sair da lista a qualquer momento pelo link de cada mensagem ou por ' + EMAIL_NEWSLETTER + '.',
    sucesso200: 'Inscrição registrada.',
    revise: 'Revise os campos indicados.',
    nomeVazio: 'Informe seu nome.',
    emailVazio: 'Informe seu e-mail.',
    consentimento: 'Para se inscrever, é preciso autorizar o uso do seu nome e e-mail (LGPD).',
    erro400Json: 'Não foi possível ler os dados enviados. Tente de novo.',
    erro413: 'Conteúdo grande demais. Confira os campos e tente de novo.',
    erro429: 'Muitas tentativas em sequência. Aguarde alguns minutos e tente de novo.',
    erro503: 'Não foi possível registrar agora. Tente de novo em alguns minutos ou escreva para ' + EMAIL_NEWSLETTER + '.',
    erroRede: 'Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.'
  });

  // Guarda final (OAB/LGPD): nenhuma mensagem de erro pode soar como confirmação.
  const PROIBIDO_EM_ERRO = /receb|cadastrad/i;
  function textoErro(texto) {
    return PROIBIDO_EM_ERRO.test(texto) ? MENSAGENS_NEWSLETTER.erro503 : texto;
  }

  // Validação local só dos obrigatórios (HOME_REDESIGN.md §3.09: "valida obrigatórios");
  // formato de e-mail, tamanho mínimo/máximo e demais regras ficam com o servidor
  // (400 {error, campos}), que é a fonte única da regra e o que o QA exercita.
  function validarLocal(valores) {
    const M = MENSAGENS_NEWSLETTER;
    const campos = {};
    if (!String(valores.nome || '').trim()) campos.nome = M.nomeVazio;
    if (!String(valores.email || '').trim()) campos.email = M.emailVazio;
    if (valores.consentimento !== true) campos.consentimento = M.consentimento;
    return campos;
  }

  function initNewsletter(root = document) {
    const form = root.getElementById ? root.getElementById('newsletterForm') : root.querySelector('#newsletterForm');
    if (!form || form.tagName !== 'FORM' || form.dataset.nlPronto === '1') return null;
    form.dataset.nlPronto = '1';

    const mensagem = form.querySelector('#nlMessage');
    const botao = form.querySelector('[type="submit"]');
    const rotuloBotao = botao ? botao.textContent : '';
    const endpoint = form.getAttribute('action') || '/api/newsletter';
    const M = MENSAGENS_NEWSLETTER;

    // Com JS a validação nativa sai de cena (mensagens próprias, por campo);
    // sem JS o navegador continua bloqueando vazios antes do POST nativo.
    form.noValidate = true;

    function mostrarEstado(texto, estado) {
      if (!mensagem) return;
      mensagem.textContent = estado === 'erro' ? textoErro(texto) : texto;
      mensagem.className = 'form-message is-' + estado;
    }

    function ocupado(sim) {
      if (sim) form.setAttribute('aria-busy', 'true');
      else form.removeAttribute('aria-busy');
      if (botao) {
        botao.disabled = sim;
        botao.textContent = sim ? M.enviando : rotuloBotao;
      }
    }

    function limparErro(campo) {
      if (!campo || !campo.removeAttribute || !campo.id) return;
      campo.removeAttribute('aria-invalid');
      const erro = form.querySelector('#' + campo.id + '-erro');
      if (erro) erro.remove();
      const ids = (campo.getAttribute('aria-describedby') || '').split(/\s+/)
        .filter((id) => id && id !== campo.id + '-erro');
      if (ids.length) campo.setAttribute('aria-describedby', ids.join(' '));
      else campo.removeAttribute('aria-describedby');
    }

    function marcarInvalidos(campos) {
      let primeiro = null;
      Object.keys(campos || {}).forEach((nome) => {
        const campo = form.elements.namedItem(nome);
        if (!campo || !campo.setAttribute || !campo.id) return;
        campo.setAttribute('aria-invalid', 'true');
        const idErro = campo.id + '-erro';
        let erro = form.querySelector('#' + idErro);
        if (!erro) {
          erro = document.createElement('p');
          erro.id = idErro;
          erro.className = 'form-field__error';
          (campo.closest('.form-field, .form-consent') || campo.parentNode).appendChild(erro);
        }
        erro.textContent = textoErro(String(campos[nome]));
        const ids = (campo.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        if (ids.indexOf(idErro) === -1) ids.push(idErro);
        campo.setAttribute('aria-describedby', ids.join(' '));
        if (!primeiro) primeiro = campo;
      });
      if (primeiro && primeiro.focus) primeiro.focus();
    }

    form.addEventListener('input', (e) => limparErro(e.target));
    form.addEventListener('change', (e) => limparErro(e.target));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.getAttribute('aria-busy') === 'true') return;
      form.querySelectorAll('[aria-invalid="true"]').forEach(limparErro);

      const dados = {};
      new FormData(form).forEach((valor, campo) => {
        dados[campo] = typeof valor === 'string' ? valor.trim() : valor;
      });
      const consentimento = form.elements.namedItem('consentimento');
      dados.consentimento = Boolean(consentimento && consentimento.checked);
      dados.origem = form.dataset.origem || dados.origem || 'home';

      const invalidos = validarLocal(dados);
      if (Object.keys(invalidos).length) {
        marcarInvalidos(invalidos);
        mostrarEstado(M.revise + ' ' + Object.values(invalidos).join(' '), 'erro');
        return;
      }

      ocupado(true);
      mostrarEstado(M.enviando, 'enviando');

      let resposta;
      let corpo = null;
      try {
        const opcoes = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(dados),
          credentials: 'same-origin'
        };
        if (window.AbortSignal && typeof AbortSignal.timeout === 'function') {
          opcoes.signal = AbortSignal.timeout(TIMEOUT_MS);
        }
        resposta = await fetch(endpoint, opcoes);
        corpo = await resposta.json().catch(() => null);
      } catch (err) {
        ocupado(false);
        mostrarEstado(M.erroRede, 'erro');
        return;
      }
      ocupado(false);

      // Sucesso só com 2xx E { ok: true } — nunca simulado.
      if (resposta.ok && corpo && corpo.ok === true) {
        form.reset();
        mostrarEstado(resposta.status === 201 ? M.sucesso201 : M.sucesso200, 'sucesso');
        return;
      }
      if (resposta.status === 400 && corpo && corpo.campos && typeof corpo.campos === 'object') {
        marcarInvalidos(corpo.campos);
        mostrarEstado(M.revise + ' ' + Object.values(corpo.campos).join(' '), 'erro');
        return;
      }
      if (resposta.status === 400) { mostrarEstado(M.erro400Json, 'erro'); return; }
      if (resposta.status === 413) { mostrarEstado(M.erro413, 'erro'); return; }
      if (resposta.status === 429) { mostrarEstado(M.erro429, 'erro'); return; }
      mostrarEstado(M.erro503, 'erro'); // 503, demais 5xx, 2xx sem ok:true, qualquer outro
    });

    return form;
  }

  // ==== 03 · SEIS EIXOS · âncora #eixo-N ====
  // Sem ARIA, sem replaceState: só garante que o artigo pare abaixo da navbar
  // fixa (scroll-margin-top vem do CSS) quando a página abre com #eixo-1…6.
  function initEixosAncora() {
    const n = (location.hash.match(/^#eixo-([1-6])$/) || [])[1];
    if (!n) return;
    const alvo = document.getElementById('eixo-' + n);
    if (!alvo || !alvo.scrollIntoView) return;
    requestAnimationFrame(() => alvo.scrollIntoView({ block: 'start' }));
  }

  // ==== WhatsApp qualificado (copy.json › contato_ajustes.whatsapp_qualificado) ====
  // Ao clicar em [data-assunto="EN"] ou chegar com ?assunto=EN, o flutuante passa a
  // abrir a conversa já com o eixo; sem eixo, mantém o texto atual do HTML.
  function initWhatsAppQualificado() {
    const flutuante = document.querySelector('.whatsapp-float');
    if (!flutuante) return;
    const TEXTOS = {
      E1: 'Olá! Gostaria de uma conversa inicial sobre Planejamento Patrimonial e Sucessório.',
      E2: 'Olá! Gostaria de uma conversa inicial sobre o eixo Tributário, Fiscal e Corporativo.',
      E3: 'Olá! Gostaria de uma conversa inicial sobre Direito Notarial e Imobiliário.',
      E4: 'Olá! Gostaria de uma conversa inicial sobre Auditoria Empresarial e Contábil.',
      E5: 'Olá! Gostaria de uma conversa inicial sobre Recuperação de Ativos.',
      E6: 'Olá! Gostaria de uma conversa inicial sobre Consultoria Trabalhista.'
    };
    const qualificar = (eixo) => {
      if (!TEXTOS[eixo]) return;
      flutuante.href = 'https://wa.me/5511915267749?text=' + encodeURIComponent(TEXTOS[eixo]);
    };
    qualificar(new URLSearchParams(location.search).get('assunto'));
    document.addEventListener('click', (e) => {
      const cta = e.target.closest && e.target.closest('[data-assunto]');
      if (cta) qualificar(cta.getAttribute('data-assunto'));
    });
  }

  const iniciar = () => {
    initVerticais();
    initNewsletter();
    initEixosAncora();
    initWhatsAppQualificado();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
