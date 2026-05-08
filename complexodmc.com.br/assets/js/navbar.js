class DMCNavbar extends HTMLElement {
  connectedCallback() {
    const path = window.location.pathname;
    const inPages = path.includes('/pages/');
    const isHome = !inPages;

    const homeHashPrefix = inPages ? '../index.html' : '';
    const logoHref = inPages ? '../index.html' : '#';
    const consultoriaHref = inPages ? 'consultoria-imobiliaria.html' : 'pages/consultoria-imobiliaria.html';
    const cursosHref = inPages ? '../plataforma-ead/login.html' : 'plataforma-ead/login.html';
    const navClass = isHome ? 'navbar navbar-index' : 'navbar';

    this.innerHTML = `
      <nav class="${navClass}" id="navbar" aria-label="Navegação principal">
        <div class="nav-container">
          <a href="${logoHref}" class="logo" aria-label="Complexo DMC - Página Inicial">
            <div class="logo-brand">
              <span class="logo-brand-name">COMPLEXO <span class="logo-brand-accent">DMC</span></span>
              <span class="logo-brand-tagline">Business Consulting</span>
            </div>
          </a>
          <ul class="nav-menu" id="navMenu">
            <li><a href="${homeHashPrefix}#hero" class="nav-link">Início</a></li>
            <li><a href="${homeHashPrefix}#conheca" class="nav-link">Sobre</a></li>
            <li><a href="${homeHashPrefix}#features" class="nav-link">Produtos</a></li>
            <li><a href="${homeHashPrefix}#contact" class="nav-link">Fale Conosco</a></li>
            <li><a href="${consultoriaHref}" class="nav-link">Consultoria Imobiliária</a></li>
            <li><a href="${cursosHref}" class="nav-link">Cursos</a></li>
            <li><a href="https://adtech-app.complexodmc.com.br" class="nav-cta" id="loginBtn"><span>Login</span></a></li>
          </ul>
          <button class="menu-toggle" id="menuToggle" aria-label="Menu">
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
          </button>
        </div>
      </nav>
    `;

    this._setupInteractions();
  }

  _setupInteractions() {
    if (window.__dmcNavbarInteractionsBound) return;
    window.__dmcNavbarInteractionsBound = true;

    const navbar = this.querySelector('#navbar');
    const menuToggle = this.querySelector('#menuToggle');
    const navMenu = this.querySelector('#navMenu');
    const navLinks = this.querySelectorAll('.nav-link');

    if (menuToggle && navMenu) {
      menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        navMenu.classList.toggle('active');
        navMenu.classList.toggle('open');
        menuToggle.classList.toggle('active');
        menuToggle.classList.toggle('open');
        document.body.classList.toggle('menu-open');
      });

      navLinks.forEach((link) => {
        link.addEventListener('click', () => {
          navMenu.classList.remove('active', 'open');
          menuToggle.classList.remove('active', 'open');
          document.body.classList.remove('menu-open');
        });
      });

      document.addEventListener('click', (e) => {
        if (!navMenu.contains(e.target) && !menuToggle.contains(e.target) && navMenu.classList.contains('active')) {
          navMenu.classList.remove('active', 'open');
          menuToggle.classList.remove('active', 'open');
          document.body.classList.remove('menu-open');
        }
      });

      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (window.innerWidth > 992) {
            navMenu.classList.remove('active', 'open');
            menuToggle.classList.remove('active', 'open');
            document.body.classList.remove('menu-open');
          }
        }, 250);
      });
    }

    if (navbar) {
      let ticking = false;
      const updateNavbar = () => {
        if (window.scrollY > 50) navbar.classList.add('scrolled');
        else navbar.classList.remove('scrolled');
        ticking = false;
      };
      window.addEventListener('scroll', () => {
        if (!ticking) {
          window.requestAnimationFrame(updateNavbar);
          ticking = true;
        }
      });
      updateNavbar();
    }
  }
}

customElements.define('dmc-navbar', DMCNavbar);
