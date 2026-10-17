// ============================================
// COMPLEXO DMC - MAIN JAVASCRIPT
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    
    // ============================================
    // MENU MOBILE (HAMBURGER) - VERSÃO MELHORADA
    // ============================================
    const menuToggle = document.getElementById('menuToggle');
    const navMenu = document.getElementById('navMenu');
    const navLinks = document.querySelectorAll('.nav-link');
    const body = document.body;

    // Toggle menu — pulado se <dmc-navbar> já vinculou os listeners
    if (menuToggle && navMenu && !window.__dmcNavbarInteractionsBound) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            navMenu.classList.toggle('active');
            menuToggle.classList.toggle('active');
            body.classList.toggle('menu-open');
        });

        // Fechar menu ao clicar em um link
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                menuToggle.classList.remove('active');
                body.classList.remove('menu-open');
            });
        });

        // Fechar menu ao clicar no overlay (fora do menu)
        document.addEventListener('click', (e) => {
            const isClickInsideMenu = navMenu.contains(e.target);
            const isClickOnToggle = menuToggle.contains(e.target);
            
            if (!isClickInsideMenu && !isClickOnToggle && navMenu.classList.contains('active')) {
                navMenu.classList.remove('active');
                menuToggle.classList.remove('active');
                body.classList.remove('menu-open');
            }
        });

        // Fechar menu e resetar ao redimensionar para desktop
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (window.innerWidth > 992) {
                    navMenu.classList.remove('active');
                    menuToggle.classList.remove('active');
                    body.classList.remove('menu-open');
                }
            }, 250);
        });
    }
    
    // ============================================
    // NAVBAR SCROLL EFFECT
    // ============================================
    const navbar = document.getElementById('navbar');
    if (navbar && !window.__dmcNavbarInteractionsBound) {
        let ticking = false;

        function updateNavbar() {
            const scrollY = window.scrollY;

            if (scrollY > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }

            ticking = false;
        }

        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(updateNavbar);
                ticking = true;
            }
        });

        // Atualizar no carregamento inicial
        updateNavbar();
    }
    
    // ============================================
    // ACTIVE LINK NO MENU (Scroll Spy)
    // ============================================
    const sections = document.querySelectorAll('section[id]');
    const navLinksMenu = document.querySelectorAll('.nav-menu .nav-link');
    let activeLinkTicking = false;

    function setActiveLink() {
        const scrollY = window.scrollY;
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 100;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');
            
            if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
                navLinksMenu.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
        
        activeLinkTicking = false;
    }

    window.addEventListener('scroll', () => {
        if (!activeLinkTicking) {
            window.requestAnimationFrame(setActiveLink);
            activeLinkTicking = true;
        }
    });

    // Atualizar link ativo no carregamento inicial
    setActiveLink();
    
    // ============================================
    // SMOOTH SCROLL PARA LINKS ÂNCORA
    // ============================================
    const smoothScrollLinks = document.querySelectorAll('a[href^="#"]');
    
    smoothScrollLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');

            // Ignorar links vazios ou apenas "#"
            if (href === '#' || href === '') return;

            // As abas dos eixos (E1…E6) têm navegação própria: trocam
            // o banner e o catálogo sem sair do lugar.
            if (this.closest('.np-axes')) return;

            const target = document.querySelector(href);

            // Alvo escondido (display:none) tem offsetTop 0 — rolar
            // para ele jogaria a página inteira para o topo.
            if (target && target.getClientRects().length) {
                e.preventDefault();
                
                // Offset para compensar o navbar fixo
                const navbarHeight = navbar ? navbar.offsetHeight : 0;
                const targetPosition = target.offsetTop - navbarHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // ============================================
    // SCROLL TO TOP BUTTON
    // ============================================
    const scrollToTopBtn = document.getElementById('scrollToTop');
    
    if (scrollToTopBtn) {
        let scrollTopTicking = false;
        
        function updateScrollTopBtn() {
            if (window.scrollY > 500) {
                scrollToTopBtn.classList.add('visible');
            } else {
                scrollToTopBtn.classList.remove('visible');
            }
            scrollTopTicking = false;
        }
        
        window.addEventListener('scroll', () => {
            if (!scrollTopTicking) {
                window.requestAnimationFrame(updateScrollTopBtn);
                scrollTopTicking = true;
            }
        });
        
        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
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
    // ANIMAÇÕES DE ENTRADA (Intersection Observer)
    // ============================================
    const observerOptions = {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const fadeInObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in-visible', 'active');
            }
        });
    }, observerOptions);
    
    // Observar elementos que devem animar
    const animateElements = document.querySelectorAll('.feature-card, .treinamento-card, .insta-post, .complexo-card, .adtech-feature-card, .reveal');
    animateElements.forEach(el => {
        el.classList.add('fade-in-element');
        fadeInObserver.observe(el);
    });
    
    // ============================================
    // ANIMAÇÕES DE TEXTO
    // ============================================
    const textObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, index * 50);
                textObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.2, rootMargin: '0px 0px -30px 0px' });
    
    document.querySelectorAll('.section-title, .section-subtitle, .section-description').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
        textObserver.observe(el);
    });
    
    // ============================================
    // NUMBER COUNTER ANIMATION
    // ============================================
    function animateNumber(element, target, duration = 2000) {
        const start = 0;
        const startTime = performance.now();
        const isPercentage = target.includes('%');
        const isPlus = target.includes('+');
        const isX = target.includes('x');
        const numericTarget = parseFloat(target.replace(/[^0-9.]/g, ''));
        
        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function (ease-out)
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = start + (numericTarget - start) * easeOut;
            
            if (isPercentage) {
                element.textContent = Math.floor(current) + '%';
            } else if (isPlus) {
                element.textContent = Math.floor(current) + 'M+';
            } else if (isX) {
                element.textContent = Math.floor(current) + 'x';
            } else {
                element.textContent = Math.floor(current);
            }
            
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = target;
            }
        }
        
        requestAnimationFrame(update);
    }
    
    const numberObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const numberElement = entry.target.querySelector('.result-number');
                if (numberElement && !numberElement.dataset.animated) {
                    const targetValue = numberElement.textContent.trim();
                    numberElement.dataset.animated = 'true';
                    animateNumber(numberElement, targetValue);
                }
                numberObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });
    
    document.querySelectorAll('.result-card').forEach(card => {
        numberObserver.observe(card);
    });
    
    // ============================================
    // FAQ ACCORDION
    // ============================================
    document.querySelectorAll('.faq-question').forEach(question => {
        question.addEventListener('click', () => {
            const faqItem = question.parentElement;
            const isActive = faqItem.classList.contains('active');
            
            // Close all FAQ items
            document.querySelectorAll('.faq-item').forEach(item => {
                item.classList.remove('active');
            });
            
            // Open clicked item if it wasn't active
            if (!isActive) {
                faqItem.classList.add('active');
            }
        });
    });
    
    // ============================================
    // LAZY LOADING DE IMAGENS
    // ============================================
    const lazyImages = document.querySelectorAll('img[loading="lazy"]');
    
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src || img.src;
                    img.classList.add('loaded');
                    imageObserver.unobserve(img);
                }
            });
        });
        
        lazyImages.forEach(img => imageObserver.observe(img));
    }
    
    // ============================================
    // CARROSSEL DE TREINAMENTOS
    // ============================================
    const track = document.querySelector('.carousel-track');
    const cards = document.querySelectorAll('.carousel-track .treinamento-card');
    const prevBtn = document.querySelector('.carousel-btn-prev');
    const nextBtn = document.querySelector('.carousel-btn-next');
    const dots = document.querySelectorAll('.carousel-dot');
    const wrapper = document.querySelector('.carousel-wrapper');
    const containerEl = document.querySelector('.carousel-container');
    
    if (track && cards.length > 0) {
        let currentIndex = 0;
        const totalCards = cards.length;
        
        // Função para verificar se é mobile
        function isMobile() {
            return window.innerWidth <= 768;
        }
        
        // Atualizar visual do carrossel
        function updateCarousel() {
            console.debug('carousel:updateCarousel called', { currentIndex, totalCards });
            
            if (isMobile()) {
                // Em mobile, cada card ocupa 100% e não precisa centralização complexa
                const cardWidth = cards[0].offsetWidth;
                const gap = 16; // 1rem em mobile
                const translateX = currentIndex * (cardWidth + gap);
                track.style.transform = `translateX(-${translateX}px)`;
            } else {
                // Em desktop, centralizar o card ativo
                const cardWidth = cards[0].offsetWidth;
                const gap = 32; // 2rem
                    // Use a largura da carousel-container (sem contar botões) para centralizar
                    const containerWidth = containerEl ? containerEl.offsetWidth : wrapper.offsetWidth;

                    // Calcular o offset lateral necessário para que o primeiro/último card possam ser centrados
                    const centerOffset = Math.max(0, Math.round((containerWidth / 2) - (cardWidth / 2)));

                    // Aplicar padding dinâmico ao track para permitir centralizar o primeiro/último card
                    track.style.paddingLeft = `${centerOffset}px`;
                    track.style.paddingRight = `${centerOffset}px`;

                    // Calcular larguras para limitar o movimento
                    const trackFullWidth = (totalCards * (cardWidth + gap)) - gap; // largura total dos cards
                    const effectiveTrackWidth = trackFullWidth + (2 * centerOffset);

                    // Para centralizar o card atual, translateX deve ser cardIndex * (cardWidth + gap)
                    let translateX = currentIndex * (cardWidth + gap);

                    // Calcular máximo de translate possível
                    const maxTranslate = Math.max(0, effectiveTrackWidth - containerWidth);
                    if (translateX < 0) translateX = 0;
                    if (translateX > maxTranslate) translateX = maxTranslate;

                    track.style.transform = `translateX(-${translateX}px)`;
            }
            
            // Atualizar classes dos cards
            cards.forEach((card, index) => {
                card.classList.remove('active', 'adjacent');
                
                if (index === currentIndex) {
                    card.classList.add('active');
                } else if (index === currentIndex - 1 || index === currentIndex + 1) {
                    card.classList.add('adjacent');
                }
            });
            
            // Atualizar estado dos botões
            if (prevBtn) prevBtn.disabled = currentIndex === 0;
            if (nextBtn) nextBtn.disabled = currentIndex === totalCards - 1;
            
            // Atualizar indicadores (dots)
            dots.forEach((dot, index) => {
                dot.classList.toggle('active', index === currentIndex);
            });
        }
        
        // Ir para slide anterior
        function goToPrev() {
            if (currentIndex > 0) {
                currentIndex--;
                updateCarousel();
            }
        }
        
        // Ir para próximo slide
        function goToNext() {
            if (currentIndex < totalCards - 1) {
                currentIndex++;
                updateCarousel();
            }
        }
        
        // Ir para slide específico (pelos dots)
        function goToSlide(index) {
            if (index >= 0 && index < totalCards) {
                currentIndex = index;
                updateCarousel();
            }
        }
        
        // Event listeners dos botões
        if (prevBtn) prevBtn.addEventListener('click', goToPrev);
        if (nextBtn) nextBtn.addEventListener('click', goToNext);
        
        // Event listeners dos dots
        dots.forEach((dot, index) => {
            dot.addEventListener('click', () => goToSlide(index));
        });
        
        // Clicar no card adjacente para ir até ele
        cards.forEach((card, index) => {
            card.addEventListener('click', () => {
                if (index !== currentIndex && !isMobile()) {
                    goToSlide(index);
                }
            });
        });
        
        // Suporte a swipe/touch para mobile
        let touchStartX = 0;
        let touchEndX = 0;
        
        track.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        
        track.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        }, { passive: true });
        
        function handleSwipe() {
            const swipeThreshold = 50;
            const diff = touchStartX - touchEndX;
            
            if (diff > swipeThreshold) {
                goToNext();
            } else if (diff < -swipeThreshold) {
                goToPrev();
            }
        }
        
        // Suporte a navegação por teclado
        document.addEventListener('keydown', (e) => {
            const carouselSection = document.querySelector('.treinamentos-section');
            if (!carouselSection) return;
            const rect = carouselSection.getBoundingClientRect();
            const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
            
            if (isVisible) {
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    goToPrev();
                }
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    goToNext();
                }
            }
        });
        
        // Atualizar no redimensionamento
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                updateCarousel();
            }, 100);
        });
        
        // Inicializar - importante: esperar o layout estar pronto
        setTimeout(() => {
            updateCarousel();
        }, 100);
    }
    
    // ============================================
    // PREVENÇÃO DE FLASH NO CARREGAMENTO
    // ============================================
    window.addEventListener('load', () => {
        document.body.classList.add('loaded');
    });

    console.log('🚀 Complexo DMC - JavaScript inicializado com sucesso!');
});

// ============================================
// UTILITÁRIOS GLOBAIS
// ============================================

// Debounce function para otimizar eventos
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function para otimizar scroll events
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
// ============================================
// CARROSSEL DE SERVIÇOS (independente)
// ============================================
(function () {
  const initServicosCarousel = () => {
    const track = document.querySelector('.servicos-carousel-track');
    const container = document.querySelector('.servicos-carousel-container');
    const prevBtn = document.querySelector('.servicos-carousel-btn-prev');
    const nextBtn = document.querySelector('.servicos-carousel-btn-next');
    if (!track || !container) return;

    const cards = track.querySelectorAll('.servico-card');
    if (!cards.length) return;

    let offset = 0;

    function getStep() {
      const cardWidth = cards[0].offsetWidth;
      const gap = parseFloat(getComputedStyle(track).gap) || 24;
      return cardWidth + gap;
    }

    function maxOffset() {
      const totalWidth = (cards.length * getStep()) - (parseFloat(getComputedStyle(track).gap) || 24);
      return Math.max(0, totalWidth - container.offsetWidth);
    }

    function update() {
      offset = Math.min(Math.max(0, offset), maxOffset());
      track.style.transform = `translateX(-${offset}px)`;
      if (prevBtn) prevBtn.disabled = offset <= 0;
      if (nextBtn) nextBtn.disabled = offset >= maxOffset() - 1;
    }

    if (prevBtn) prevBtn.addEventListener('click', () => { offset -= getStep(); update(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { offset += getStep(); update(); });

    let touchStartX = 0;
    track.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
    track.addEventListener('touchend', (e) => {
      const diff = touchStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) > 50) {
        offset += diff > 0 ? getStep() : -getStep();
        update();
      }
    }, { passive: true });

    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(update, 100);
    });

    update();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initServicosCarousel);
  } else {
    initServicosCarousel();
  }
})();

// ============================================================
// SOLUÇÕES — GRID POR EIXO
// Progressive enhancement: os cards são links e funcionam sem
// JS. Aqui só se acrescenta o reveal por card e o glow que
// segue o cursor.
// ============================================================
(function () {
  'use strict';

  // ============================================================
  // Abas por eixo (E1…E6)
  // Cada aba comanda um banner e o recorte do catálogo. O eixo de
  // abertura é sorteado a cada visita — a menos que a URL traga
  // #eixo-N, que sempre vence, para o link continuar compartilhável.
  // ============================================================
  const initEixos = (cards) => {
    const sec = document.getElementById('features');
    if (!sec) return;

    const abas = Array.from(sec.querySelectorAll('.np-axes a[data-eixo]'));
    const paineis = Array.from(sec.querySelectorAll('.np-flag[data-eixo]'));
    if (!abas.length || !paineis.length) return;

    const lista = document.querySelector('.np-axes');
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

    // Sorteia qual solução do eixo aparece no box "Em destaque".
    // O HTML já vem com uma delas preenchida, então quem não roda
    // JS continua vendo um destaque válido.
    const sortearDestaque = (painel) => {
      // Um eixo pode fixar o seu destaque no HTML com data-np-spot="fixo".
      // É o caso de um programa que não é um dos cards do catálogo — o
      // sorteio o apagaria a cada visita.
      if (painel.dataset.npSpot === 'fixo') return;
      const doEixo = cards.filter((c) => c.dataset.eixo === painel.dataset.eixo);
      const spot = painel.querySelector('.np-spot');
      if (!spot || !doEixo.length) return;
      const card = doEixo[Math.floor(Math.random() * doEixo.length)];
      spot.querySelector('.np-spot-ico').innerHTML = card.querySelector('.np-ico').innerHTML;
      spot.querySelector('.np-spot-name').textContent = card.querySelector('.np-ct').textContent;
      spot.querySelector('.np-spot-desc').textContent = card.querySelector('.np-cd').textContent;
      spot.querySelector('.np-spot-link').setAttribute('href', card.getAttribute('href'));
    };

    let atual = null;
    const api = { aoTrocarAba: null, atual: () => atual };

    const ativar = (n, foco) => {
      atual = n;
      abas.forEach((aba) => {
        const ligada = aba.dataset.eixo === n;
        aba.setAttribute('aria-selected', ligada ? 'true' : 'false');
        aba.tabIndex = ligada ? 0 : -1;
      });
      paineis.forEach((p) => {
        p.hidden = p.dataset.eixo !== n;
        if (!p.hidden) sortearDestaque(p);
      });
      cards.forEach((c) => {
        c.hidden = c.dataset.eixo !== n;
      });
      if (foco) {
        history.replaceState(null, '', '#eixo-' + n);
        document.getElementById('aba-eixo-' + n).focus();
      }
    };

    abas.forEach((aba, i) => {
      aba.addEventListener('click', (e) => {
        e.preventDefault();
        // trocar de eixo encerra a busca em andamento
        if (api.aoTrocarAba) api.aoTrocarAba();
        ativar(aba.dataset.eixo, true);
      });
      // ← → percorrem as abas, como manda o padrão de tablist
      aba.addEventListener('keydown', (e) => {
        const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!passo) return;
        e.preventDefault();
        ativar(abas[(i + passo + abas.length) % abas.length].dataset.eixo, true);
      });
    });

    sec.classList.add('np-js');
    const naUrl = (location.hash.match(/^#eixo-([1-6])$/) || [])[1];
    ativar(naUrl || String(1 + Math.floor(Math.random() * abas.length)), false);
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
    const form = document.getElementById('npAskForm');
    const input = document.getElementById('npAsk');
    const status = document.getElementById('npAskStatus');
    const vazio = document.querySelector('.np-ask-empty');
    const limpar = form && form.querySelector('.np-ask-clear');
    const paineis = Array.from(document.querySelectorAll('.np-flag[data-eixo]'));
    const situacoes = Array.from(document.querySelectorAll('.np-cases li'));
    if (!form || !input || !eixos) return;

    const sem = (s) =>
      s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

      // campo vazio: volta para o modo abas
      if (!termos.length) {
        itens.forEach((i) => {
          i.alvo.hidden = false;
          i.alvo.style.order = '';
        });
        status.textContent = '';
        vazio.hidden = true;
        eixos.ativar(eixos.atual(), false);
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
      if (!input.value) return;
      input.value = '';
      itens.forEach((i) => (i.alvo.hidden = false));
      status.textContent = '';
      vazio.hidden = true;
      limpar.hidden = true;
    };
  };

  const initSolucoes = () => {
    const grid = document.getElementById('npGrid');
    if (!grid) return;

    const cards = Array.from(grid.querySelectorAll('.np-card'));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------- Reveal por card ----------
    if ('IntersectionObserver' in window) {
      grid.classList.add('np-anim');
      const revealObserver = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('np-in');
            obs.unobserve(entry.target);
          });
        },
        { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
      );
      cards.forEach((card) => revealObserver.observe(card));

      // Rede de segurança: o estado inicial dos cards é opacity 0.
      // Se o observer não rodar (aba em background, motor sem rAF,
      // erro de terceiros), a seção mais importante do site ficaria
      // invisível. Depois de 2s todo card pendente é revelado.
      setTimeout(() => {
        cards.forEach((card) => card.classList.add('np-in'));
        revealObserver.disconnect();
      }, 2000);
    }

    // ---------- Abas por eixo ----------
    // Sem JS o HTML entrega os seis banners e os 18 cards
    // empilhados. Daqui pra frente a faixa E1…E6 vira aba: um
    // eixo por vez, sorteado a cada visita e endereçável por
    // #eixo-N.
    const eixos = initEixos(cards);

    // ---------- Campo de situação: busca e, sem resultado, canal ----------
    initBusca(cards, eixos);

    // ---------- Glow acompanhando o cursor ----------
    if (!reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      grid.addEventListener(
        'pointermove',
        (e) => {
          const card = e.target.closest('.np-card');
          if (!card) return;
          const rect = card.getBoundingClientRect();
          card.style.setProperty('--np-mx', ((e.clientX - rect.left) / rect.width) * 100 + '%');
          card.style.setProperty('--np-my', ((e.clientY - rect.top) / rect.height) * 100 + '%');
        },
        { passive: true }
      );
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSolucoes);
  } else {
    initSolucoes();
  }
})();
