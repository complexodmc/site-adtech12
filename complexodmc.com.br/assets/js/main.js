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

    // Toggle menu
    if (menuToggle && navMenu) {
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
    if (navbar) {
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
            
            const target = document.querySelector(href);
            
            if (target) {
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
    // FORMULÁRIO DE CONTATO
    // ============================================
    const contactForm = document.getElementById('contactForm');
    
    if (contactForm) {
        const formMessage = document.getElementById('formMessage');
        const submitBtn = contactForm.querySelector('.submit-btn');

        function showMessage(message, type) {
            if (formMessage) {
                formMessage.textContent = message;
                formMessage.className = `form-message ${type} show`;
                setTimeout(() => formMessage.classList.remove('show'), 5000);
            }
        }

        function validateForm(formData) {
            const errors = [];

            const nome = (formData.get('nome') || '').trim();
            const email = (formData.get('email') || '').trim();
            const telefone = (formData.get('telefone') || '').trim();
            const mensagem = (formData.get('mensagem') || '').trim();

            if (nome && nome.length < 2) {
                errors.push('Nome deve ter pelo menos 2 caracteres');
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (email && !emailRegex.test(email)) {
                errors.push('Email inválido');
            }

            if (telefone) {
                const digits = telefone.replace(/\D/g, '');
                if (digits.length < 10) {
                    errors.push('Telefone inválido');
                }
            }

            if (mensagem && mensagem.length < 10) {
                errors.push('Mensagem deve ter pelo menos 10 caracteres');
            }

            return errors;
        }

        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(contactForm);
            const errors = validateForm(formData);

            if (errors.length > 0) {
                showMessage(errors[0], 'error');
                return;
            }

            if (submitBtn) {
                submitBtn.classList.add('loading');
                submitBtn.disabled = true;
            }

            try {
                // Simular envio (substituir por sua API)
                await new Promise(resolve => setTimeout(resolve, 1500));
                showMessage('Mensagem enviada com sucesso! Entraremos em contato em breve.', 'success');
                contactForm.reset();
            } catch (err) {
                showMessage('Erro ao enviar mensagem. Por favor, tente novamente.', 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.classList.remove('loading');
                    submitBtn.disabled = false;
                }
            }
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
