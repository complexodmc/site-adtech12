// ============================================
// COMPLEXO DMC — MAIN JAVASCRIPT (home)
// Menu: assets/js/navbar.js · Rede neural: assets/js/rede-neural.js
// Vídeo do fim da página: assets/js/video.js
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

        function marcarInvalidos(campos) {
            let primeiro = null;
            Object.keys(campos || {}).forEach((nome) => {
                const campo = contactForm.elements.namedItem(nome);
                if (campo && campo.setAttribute) {
                    campo.setAttribute('aria-invalid', 'true');
                    if (!primeiro) primeiro = campo;
                }
            });
            if (primeiro && primeiro.focus) primeiro.focus();
        }

        // Ao corrigir um campo apontado pelo servidor, tira a marca de erro.
        contactForm.addEventListener('input', (e) => {
            if (e.target && e.target.removeAttribute) e.target.removeAttribute('aria-invalid');
        });

        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (contactForm.getAttribute('aria-busy') === 'true') return;
            contactForm.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));

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
// SOLUÇÕES — PAINEL DOS SEIS EIXOS
// Progressive enhancement: sem JS os seis banners (#eixo-1…6) e
// os cards aparecem empilhados e a faixa E1…E6 são âncoras. Aqui a
// faixa vira tablist (setas, Home, End, tabindex móvel) e mostra um
// eixo por vez. Estado inicial: E1, ou o #eixo-N da URL.
// ============================================================
(function () {
  'use strict';

  const initEixos = (cards) => {
    const sec = document.getElementById('features');
    if (!sec) return;

    const abas = Array.from(sec.querySelectorAll('.np-axes a[data-eixo]'));
    const paineis = Array.from(sec.querySelectorAll('.np-flag[data-eixo]'));
    const grade = document.getElementById('npGrid');
    if (!abas.length || !paineis.length) return;

    const lista = sec.querySelector('.np-axes');
    lista.setAttribute('role', 'tablist');
    abas.forEach((aba) => {
      const n = aba.dataset.eixo;
      aba.setAttribute('role', 'tab');
      aba.id = 'aba-eixo-' + n;
      aba.setAttribute('aria-controls', 'eixo-' + n);
      aba.parentElement.setAttribute('role', 'presentation');
    });
    paineis.forEach((p) => {
      p.setAttribute('role', 'tabpanel');
      p.setAttribute('aria-labelledby', 'aba-eixo-' + p.dataset.eixo);
    });

    // Sorteia qual solução do eixo aparece no box "Em destaque" — uma
    // vez por visita e por eixo, para a troca de aba não embaralhar o
    // painel a cada clique. O HTML já vem com um destaque válido (sem JS).
    const sortearDestaque = (painel) => {
      // Um eixo pode fixar o seu destaque no HTML com data-np-spot="fixo".
      // É o caso de um programa que não é um dos cards do catálogo — o
      // sorteio o apagaria a cada visita.
      if (painel.dataset.npSpot === 'fixo' || painel.dataset.npSorteado) return;
      painel.dataset.npSorteado = '1';
      const doEixo = cards.filter((c) => c.dataset.eixo === painel.dataset.eixo && c.querySelector('.np-ico'));
      const spot = painel.querySelector('.np-spot');
      if (!spot || !doEixo.length) return;
      const card = doEixo[Math.floor(Math.random() * doEixo.length)];
      spot.querySelector('.np-spot-ico').innerHTML = card.querySelector('.np-ico').innerHTML;
      spot.querySelector('.np-spot-name').textContent = card.querySelector('.np-ct').textContent;
      spot.querySelector('.np-spot-desc').textContent = card.querySelector('.np-cd').textContent;
      spot.querySelector('.np-spot-link').setAttribute('href', card.getAttribute('href'));
    };

    // Entrada suave: a classe reinicia a animação (CSS: mídia, depois texto).
    const entrar = (el) => {
      if (!el) return;
      el.classList.remove('is-entering');
      void el.offsetWidth;
      el.classList.add('is-entering');
    };

    let atual = null;
    const api = { aoTrocarAba: null, atual: () => atual };

    const ativar = (n, foco, animar) => {
      atual = n;
      abas.forEach((aba) => {
        const ligada = aba.dataset.eixo === n;
        aba.setAttribute('aria-selected', ligada ? 'true' : 'false');
        aba.tabIndex = ligada ? 0 : -1;
      });
      paineis.forEach((p) => {
        p.hidden = p.dataset.eixo !== n;
        if (!p.hidden) {
          sortearDestaque(p);
          if (animar) entrar(p);
        }
      });
      let i = 0;
      cards.forEach((c) => {
        c.hidden = c.dataset.eixo !== n;
        if (!c.hidden) c.style.setProperty('--i', i++);
      });
      if (animar) entrar(grade);
      if (foco) {
        history.replaceState(null, '', '#eixo-' + n);
        document.getElementById('aba-eixo-' + n).focus();
      }
    };

    const irPara = (i) => {
      if (api.aoTrocarAba) api.aoTrocarAba();
      ativar(abas[(i + abas.length) % abas.length].dataset.eixo, true, true);
    };

    abas.forEach((aba, i) => {
      aba.addEventListener('click', (e) => {
        e.preventDefault();
        if (aba.dataset.eixo === atual && !sec.classList.contains('np-busca')) { aba.focus(); return; }
        irPara(i);
      });
      // ← → percorrem as abas; Home/End vão às pontas (padrão de tablist)
      aba.addEventListener('keydown', (e) => {
        const alvo =
          e.key === 'ArrowRight' ? i + 1 :
          e.key === 'ArrowLeft' ? i - 1 :
          e.key === 'Home' ? 0 :
          e.key === 'End' ? abas.length - 1 : null;
        if (alvo === null) return;
        e.preventDefault();
        irPara(alvo);
      });
    });

    sec.classList.add('np-js');
    const naUrl = (location.hash.match(/^#eixo-([1-6])$/) || [])[1];
    ativar(naUrl || '1', false, false);
    // Link externo para #eixo-N: o painel já abriu; leva a faixa de abas à vista.
    if (naUrl) requestAnimationFrame(() => lista.scrollIntoView({ block: 'start' }));
    window.addEventListener('hashchange', () => {
      const h = (location.hash.match(/^#eixo-([1-6])$/) || [])[1];
      if (h && h !== atual) {
        ativar(h, false, true);
        lista.scrollIntoView({ block: 'start' });
      }
    });
    api.ativar = ativar;
    return api;
  };

  // ============================================================
  // O campo "qual é a sua situação"
  // Enquanto a pessoa digita, filtra situações e soluções pelo
  // texto visível + o dicionário de sinônimos em data-busca —
  // tudo no navegador, nada trafega. Se não casar nada, o campo
  // troca de função e vira canal direto de WhatsApp.
  // ============================================================
  const initBusca = (cards, eixos) => {
    const sec = document.getElementById('features');
    const form = document.getElementById('npAskForm');
    const input = document.getElementById('npAsk');
    const status = document.getElementById('npAskStatus');
    const vazio = document.querySelector('.np-ask-empty');
    const limpar = form && form.querySelector('.np-ask-clear');
    const paineis = Array.from(document.querySelectorAll('.np-flag[data-eixo]'));
    const situacoes = Array.from(document.querySelectorAll('.np-cases li'));
    if (!form || !input || !eixos) return;

    const sem = (s) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    // palavras que aparecem em qualquer frase e não distinguem nada
    const vazias = new Set(['que','com','uma','para','meu','minha','nao','dos','das','mas','por','sem','tem','the','and','como','sobre','quero','preciso','estou','tenho','fazer','ser','ter']);

    const indexar = (el) =>
      sem(el.textContent + ' ' + (el.dataset.busca || '')).replace(/\s+/g, ' ');

    const itens = [...cards, ...situacoes.map((li) => li.querySelector('.np-case'))]
      .filter(Boolean)
      .map((el) => ({ el, alvo: el.closest('li') || el, texto: indexar(el) }));

    const texto = (n, sing, plur) => n + ' ' + (n === 1 ? sing : plur);

    const buscar = () => {
      const q = input.value.trim();
      const termos = sem(q)
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !vazias.has(t));

      limpar.hidden = !q;
      sec.classList.toggle('np-busca', termos.length > 0);

      // campo vazio: volta para o modo abas
      if (!termos.length) {
        itens.forEach((i) => {
          i.alvo.hidden = false;
          i.alvo.style.order = '';
        });
        status.textContent = '';
        vazio.hidden = true;
        eixos.ativar(eixos.atual(), false, false);
        return;
      }

      let solucoes = 0;
      let casos = 0;
      itens.forEach((i) => {
        const acertos = termos.filter((t) => i.texto.includes(t)).length;
        i.alvo.hidden = !acertos;
        // quem casa mais termos sobe na grade (order aceita negativo)
        i.alvo.style.order = acertos ? String(-acertos) : '';
        if (acertos) i.el.classList.contains('np-card') ? solucoes++ : casos++;
      });

      // na busca, os banners de eixo saem de cena
      paineis.forEach((p) => (p.hidden = true));

      if (solucoes + casos === 0) {
        status.innerHTML = 'Nada encontrado para <b>' + q.replace(/[<>&]/g, '') + '</b>.';
        vazio.hidden = false;
        vazio.querySelector('.np-ask-wa').href =
          'https://wa.me/5511915267749?text=' +
          encodeURIComponent('Olá! Minha situação: ' + q);
      } else {
        status.innerHTML =
          '<b>' + texto(solucoes, 'solução', 'soluções') + '</b>' +
          (casos ? ' e ' + texto(casos, 'situação', 'situações') : '') +
          ' para “' + q.replace(/[<>&]/g, '') + '”.';
        vazio.hidden = true;
      }
    };

    let tempo;
    input.addEventListener('input', () => {
      clearTimeout(tempo);
      tempo = setTimeout(buscar, 120);
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearTimeout(tempo);
      buscar();
      // Enter sem resultado abre o WhatsApp: é gesto do usuário,
      // então nenhum bloqueador de pop-up atrapalha.
      if (!vazio.hidden) vazio.querySelector('.np-ask-wa').click();
    });
    limpar.addEventListener('click', () => {
      input.value = '';
      buscar();
      input.focus();
    });
    // trocar de eixo pela faixa encerra a busca
    eixos.aoTrocarAba = () => {
      sec.classList.remove('np-busca');
      if (!input.value) return;
      input.value = '';
      itens.forEach((i) => {
        i.alvo.hidden = false;
        i.alvo.style.order = '';
      });
      status.textContent = '';
      vazio.hidden = true;
      limpar.hidden = true;
    };
  };

  const initSolucoes = () => {
    const grid = document.getElementById('npGrid');
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll('.np-card'));
    const eixos = initEixos(cards);
    initBusca(cards, eixos);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSolucoes);
  } else {
    initSolucoes();
  }
})();
