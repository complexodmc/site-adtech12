// =============================================================
// COMPLEXO DMC · PLATAFORMA — núcleo do front
// Persistência em localStorage (mock — sem backend)
// =============================================================
(function () {
  'use strict';

  const STORAGE_AUTH = 'dmc:auth';
  const STORAGE_PROGRESS = 'dmc:progress';
  const STORAGE_DATA = 'dmc:data';
  const STORAGE_CURSO_ESCOLHIDO = 'dmc:cursoEscolhido';
  const STORAGE_LIBERACOES = 'dmc:liberacoes';   // { "<email>": ["<cursoId>", ...] }
  const STORAGE_CARRINHO = 'dmc:carrinho';        // ["<cursoId>", ...]

  // =============================================================
  // DATA — multi-curso, com migração automática do seed antigo
  // =============================================================
  const Data = {
    _migrate(raw) {
      if (raw && raw.modulos && raw.curso && !raw.cursos) {
        const cursoId = 'curso-' + Date.now().toString(36);
        return {
          cursos: [{
            id: cursoId,
            titulo: raw.curso.titulo || 'Programa',
            subtitulo: raw.curso.subtitulo || '',
            descricao: raw.curso.descricao || raw.curso.subtitulo || '',
            cargaHoraria: raw.curso.cargaHoraria || '',
            modalidade: 'Online',
            iconeKey: 'graduation',
            preco: 0,
            linkCheckout: '',
            beneficios: [],
            modulos: raw.modulos || []
          }],
          cursoAtivoId: cursoId
        };
      }
      if (raw && raw.cursos) {
        raw.cursos.forEach(c => {
          if (!c.modalidade) c.modalidade = 'Online';
          if (!c.iconeKey) c.iconeKey = 'graduation';
          if (c.descricao == null) c.descricao = c.subtitulo || '';
          if (c.preco == null) c.preco = 0;
          if (c.linkCheckout == null) c.linkCheckout = '';
          if (!Array.isArray(c.beneficios)) c.beneficios = [];
        });
      }
      return raw;
    },
    _seedClone() {
      const seed = window.PLATAFORMA_DATA;
      if (!seed) return { cursos: [], cursoAtivoId: null };
      if (seed.cursos) return JSON.parse(JSON.stringify(seed));
      const cursoId = 'curso-01';
      return {
        cursos: [{
          id: cursoId,
          titulo: seed.curso.titulo || 'Programa',
          subtitulo: seed.curso.subtitulo || '',
          descricao: seed.curso.descricao || seed.curso.subtitulo || '',
          cargaHoraria: seed.curso.cargaHoraria || '',
          modalidade: 'Online',
          iconeKey: 'graduation',
          preco: 0,
          linkCheckout: '',
          beneficios: [],
          modulos: JSON.parse(JSON.stringify(seed.modulos || []))
        }],
        cursoAtivoId: cursoId
      };
    },
    get() {
      try {
        const stored = localStorage.getItem(STORAGE_DATA);
        if (stored) {
          const parsed = JSON.parse(stored);
          const migrated = this._migrate(parsed);
          if (migrated !== parsed) this.save(migrated);
          return migrated;
        }
      } catch (_) {}
      return this._seedClone();
    },
    save(data) { localStorage.setItem(STORAGE_DATA, JSON.stringify(data)); },
    reset() { localStorage.removeItem(STORAGE_DATA); },
    getCursoEscolhidoId() {
      const id = localStorage.getItem(STORAGE_CURSO_ESCOLHIDO);
      if (id) {
        const all = this.get();
        if (all.cursos.find(c => c.id === id)) return id;
      }
      const d = this.get();
      return d.cursoAtivoId || (d.cursos[0] && d.cursos[0].id) || null;
    },
    setCursoEscolhido(id) {
      if (id) localStorage.setItem(STORAGE_CURSO_ESCOLHIDO, id);
      else localStorage.removeItem(STORAGE_CURSO_ESCOLHIDO);
    },
    getActiveCurso() {
      const d = this.get();
      const id = this.getCursoEscolhidoId();
      return d.cursos.find(c => c.id === id) || d.cursos[0] || null;
    },
    getCursoById(id) {
      const d = this.get();
      return d.cursos.find(c => c.id === id) || null;
    },
    findCursoByAulaId(aulaId) {
      const d = this.get();
      for (const c of d.cursos) {
        for (const m of c.modulos || []) {
          if ((m.aulas || []).some(a => a.id === aulaId)) return c;
        }
      }
      return null;
    },
    uid(prefix) {
      return prefix + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
    }
  };
  window.DMC_Data = Data;

  // =============================================================
  // AUTH
  // =============================================================
  const ADMIN_EMAILS = [
    'danielc@complexodmc.com.br',
    'admin@complexodmc.com.br',
    'administrativo@complexodmc.com.br'
  ];

  const Auth = {
    isLogged() { return !!localStorage.getItem(STORAGE_AUTH); },
    login(email, nome) {
      const data = {
        email,
        nome: nome || email.split('@')[0],
        iniciais: (nome || email).split(/[\s.@]/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join(''),
        isAdmin: ADMIN_EMAILS.includes(email.toLowerCase().trim()) || /admin/i.test(email),
        loggedAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_AUTH, JSON.stringify(data));
      return data;
    },
    logout() { localStorage.removeItem(STORAGE_AUTH); },
    user() {
      const raw = localStorage.getItem(STORAGE_AUTH);
      return raw ? JSON.parse(raw) : null;
    },
    requireOrRedirect(to = 'index.html') {
      if (!this.isLogged()) { window.location.href = to; return false; }
      return true;
    },
    requireAdminOrRedirect(to = 'dashboard.html') {
      if (!this.requireOrRedirect()) return false;
      const u = this.user();
      if (!u.isAdmin) { window.location.href = to; return false; }
      return true;
    }
  };
  window.DMC_Auth = Auth;

  // =============================================================
  // LIBERAÇÕES (acesso por email a cursos comprados)
  // =============================================================
  const Liberacoes = {
    _read() {
      try { return JSON.parse(localStorage.getItem(STORAGE_LIBERACOES) || '{}'); }
      catch { return {}; }
    },
    _write(d) { localStorage.setItem(STORAGE_LIBERACOES, JSON.stringify(d)); },
    has(email, cursoId) {
      if (!email || !cursoId) return false;
      const u = Auth.user();
      if (u && u.isAdmin) return true; // admin vê tudo
      const d = this._read();
      const list = d[email.toLowerCase().trim()] || [];
      return list.includes(cursoId);
    },
    grant(email, cursoIds) {
      if (!email) return;
      const key = email.toLowerCase().trim();
      const d = this._read();
      const set = new Set(d[key] || []);
      (Array.isArray(cursoIds) ? cursoIds : [cursoIds]).forEach(id => id && set.add(id));
      d[key] = [...set];
      this._write(d);
    },
    revoke(email, cursoId) {
      if (!email) return;
      const key = email.toLowerCase().trim();
      const d = this._read();
      d[key] = (d[key] || []).filter(id => id !== cursoId);
      this._write(d);
    },
    listFor(email) {
      if (!email) return [];
      const d = this._read();
      return d[email.toLowerCase().trim()] || [];
    }
  };
  window.DMC_Liberacoes = Liberacoes;

  // =============================================================
  // CARRINHO
  // =============================================================
  const Carrinho = {
    _read() {
      try { return JSON.parse(localStorage.getItem(STORAGE_CARRINHO) || '[]'); }
      catch { return []; }
    },
    _write(arr) { localStorage.setItem(STORAGE_CARRINHO, JSON.stringify(arr)); },
    items() { return this._read(); },
    has(cursoId) { return this._read().includes(cursoId); },
    add(cursoId) {
      if (!cursoId) return;
      const arr = this._read();
      if (!arr.includes(cursoId)) {
        arr.push(cursoId);
        this._write(arr);
      }
      this._notify();
    },
    remove(cursoId) {
      const arr = this._read().filter(id => id !== cursoId);
      this._write(arr);
      this._notify();
    },
    toggle(cursoId) {
      if (this.has(cursoId)) this.remove(cursoId);
      else this.add(cursoId);
    },
    clear() { this._write([]); this._notify(); },
    count() { return this._read().length; },
    total() {
      const ids = this._read();
      const d = Data.get();
      let sum = 0;
      ids.forEach(id => {
        const c = d.cursos.find(x => x.id === id);
        if (c && Number(c.preco)) sum += Number(c.preco);
      });
      return sum;
    },
    _notify() {
      window.dispatchEvent(new CustomEvent('dmc:carrinho:change'));
    }
  };
  window.DMC_Carrinho = Carrinho;

  // =============================================================
  // PROGRESSO
  // =============================================================
  const Progress = {
    _read() {
      try { return JSON.parse(localStorage.getItem(STORAGE_PROGRESS) || '{}'); }
      catch { return {}; }
    },
    _write(d) { localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(d)); },
    isDone(aulaId) { return !!this._read()[aulaId]; },
    toggle(aulaId) {
      const d = this._read();
      if (d[aulaId]) delete d[aulaId];
      else d[aulaId] = new Date().toISOString();
      this._write(d);
      return !!d[aulaId];
    },
    set(aulaId, done) {
      const d = this._read();
      if (done) d[aulaId] = new Date().toISOString();
      else delete d[aulaId];
      this._write(d);
    },
    clear() { localStorage.removeItem(STORAGE_PROGRESS); },
    countModulo(modulo) {
      const d = this._read();
      const total = modulo.aulas.length;
      const done = modulo.aulas.filter(a => d[a.id]).length;
      return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    },
    countCurso(curso) {
      const d = this._read();
      let total = 0, done = 0;
      curso.modulos.forEach(m => { total += m.aulas.length; m.aulas.forEach(a => { if (d[a.id]) done++; }); });
      return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    }
  };
  window.DMC_Progress = Progress;

  // =============================================================
  // HELPERS
  // =============================================================
  function findAula(curso, aulaId) {
    if (!curso) return null;
    for (const m of curso.modulos) {
      const a = m.aulas.find(x => x.id === aulaId);
      if (a) return { modulo: m, aula: a, index: m.aulas.indexOf(a) };
    }
    return null;
  }
  function flatAulas(curso) {
    const flat = [];
    curso.modulos.forEach(m => m.aulas.forEach(a => flat.push({ moduloId: m.id, aula: a })));
    return flat;
  }
  function nextAula(curso, aulaId) {
    const flat = flatAulas(curso);
    const idx = flat.findIndex(x => x.aula.id === aulaId);
    return (idx >= 0 && idx < flat.length - 1) ? flat[idx + 1] : null;
  }
  function prevAula(curso, aulaId) {
    const flat = flatAulas(curso);
    const idx = flat.findIndex(x => x.aula.id === aulaId);
    return (idx > 0) ? flat[idx - 1] : null;
  }
  window.DMC_Helpers = { findAula, nextAula, prevAula };

  function formatPreco(v) {
    const n = Number(v) || 0;
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  window.DMC_formatPreco = formatPreco;

  // =============================================================
  // ÍCONES
  // =============================================================
  const I = {
    check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    chevronDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    chevronLeft: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    chevronRight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    chevronUp: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
    chevronDownSmall: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
    clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
    book: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    upload: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    cart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    unlock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
    sparkle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2z"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    playLarge: '<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>'
  };
  window.DMC_Icons = I;

  const COURSE_ICONS = {
    graduation: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 4 2 10l10 6 10-6z"/><path d="M6 12v5a6 6 0 0 0 12 0v-5"/></svg>',
    monitor: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    shield: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 4v6c0 5-3.5 9-9 10-5.5-1-9-5-9-10V6l9-4z"/><path d="M9 12l2 2 4-4"/></svg>',
    building: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M9 21v-7h6v7"/><circle cx="12" cy="11" r="0.8" fill="currentColor"/></svg>',
    briefcase: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="2" y1="13" x2="22" y2="13"/></svg>',
    scale: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7l-3 7a4 4 0 0 0 8 0L7 7"/><path d="M19 7l-3 7a4 4 0 0 0 8 0l-3-7"/><path d="M7 21h10"/></svg>'
  };
  window.DMC_CourseIcons = COURSE_ICONS;

  // =============================================================
  // LOGIN
  // =============================================================
  function bootLogin() {
    if (Auth.isLogged()) { window.location.href = 'dashboard.html'; return; }
    const form = document.querySelector('#login-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      const nome = form.nome ? form.nome.value.trim() : '';
      if (!email) return;
      Auth.login(email, nome);
      window.location.href = 'dashboard.html';
    });
  }
  window.DMC_bootLogin = bootLogin;

  // =============================================================
  // DASHBOARD
  // =============================================================
  function bootDashboard() {
    if (!Auth.requireOrRedirect()) return;
    bindHeader();

    const allCursos = (Data.get().cursos || []);
    if (!allCursos.length) {
      document.querySelector('main').innerHTML = '<p style="padding:6rem;text-align:center;color:var(--ink-2)">Nenhum curso cadastrado. Acesse o painel administrativo para criar o primeiro.</p>';
      return;
    }

    renderCatalog();
    renderActiveCurso();

    function renderCatalog() {
      const track = document.querySelector('#catalog-track');
      if (!track) return;
      const escolhidoId = Data.getCursoEscolhidoId();
      const user = Auth.user();
      const userEmail = user && user.email;
      track.innerHTML = allCursos.map(c => {
        const isSelected = c.id === escolhidoId;
        const liberado = Liberacoes.has(userEmail, c.id);
        const totalAulas = (c.modulos || []).reduce((s, m) => s + (m.aulas || []).length, 0);
        const progress = Progress.countCurso(c);
        let ctaLabel, ctaAction;
        if (liberado) {
          ctaLabel = isSelected ? (progress.done > 0 ? 'Continuar curso' : 'Acessar curso') : 'Selecionar';
          ctaAction = `data-cta-acessar="${c.id}"`;
        } else {
          ctaLabel = `Comprar · ${formatPreco(c.preco)}`;
          ctaAction = `data-cta-comprar="${c.id}"`;
        }
        const iconSvg = COURSE_ICONS[c.iconeKey] || COURSE_ICONS.graduation;
        const modalidade = c.modalidade || 'Online';
        return `
          <article class="course-card ${isSelected ? 'is-selected' : ''} ${liberado ? '' : 'is-locked'}" data-curso-id="${c.id}">
            ${liberado ? '' : `<span class="course-card__lock" title="Curso bloqueado">${I.lock}</span>`}
            <div class="course-card__icon">${iconSvg}</div>
            <h3 class="course-card__title">${escapeHtml(c.titulo)}</h3>
            <p class="course-card__desc">${escapeHtml(c.descricao || c.subtitulo || '')}</p>
            <div class="course-card__meta">
              <span class="course-card__hours">${I.clock} ${escapeHtml(c.cargaHoraria || '—')}</span>
              <span class="course-card__pill course-card__pill--${modalidade.toLowerCase()}">${escapeHtml(modalidade)}</span>
            </div>
            <div class="course-card__foot">
              <span class="course-card__count">${(c.modulos || []).length} módulos · ${totalAulas} aulas</span>
              <button class="course-card__cta" ${ctaAction}>${ctaLabel}</button>
            </div>
          </article>`;
      }).join('');

      track.querySelectorAll('.course-card').forEach(el => {
        el.addEventListener('click', (e) => {
          const id = el.dataset.cursoId;
          if (e.target.closest('[data-cta-comprar]')) {
            e.stopPropagation();
            window.location.href = `loja.html?destacar=${id}`;
            return;
          }
          if (e.target.closest('[data-cta-acessar]') && id === Data.getCursoEscolhidoId()) {
            document.querySelector('.modules-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
          // Clique no card: se liberado, seleciona; se não, manda pra loja
          if (Liberacoes.has(userEmail, id)) {
            Data.setCursoEscolhido(id);
            renderCatalog();
            renderActiveCurso();
          } else {
            window.location.href = `loja.html?destacar=${id}`;
          }
        });
      });

      const wrap = track.parentElement;
      const prev = wrap.querySelector('[data-catalog-prev]');
      const next = wrap.querySelector('[data-catalog-next]');
      const step = () => {
        const card = track.querySelector('.course-card');
        return card ? card.offsetWidth + 24 : 320;
      };
      if (prev) prev.onclick = () => track.scrollBy({ left: -step(), behavior: 'smooth' });
      if (next) next.onclick = () => track.scrollBy({ left: step(), behavior: 'smooth' });
    }

    function renderActiveCurso() {
      const curso = Data.getActiveCurso();
      if (!curso) return;
      const user = Auth.user();
      const liberado = Liberacoes.has(user && user.email, curso.id);

      const c = Progress.countCurso(curso);
      const setText = (sel, v) => document.querySelectorAll(sel).forEach(el => el.textContent = v);
      setText('[data-stat-done]', c.done);
      setText('[data-stat-total]', c.total);
      setText('[data-stat-pct]', c.pct + '%');
      setText('[data-stat-modulos]', curso.modulos.length);
      setText('[data-curso-titulo]', curso.titulo);
      setText('[data-curso-carga]', curso.cargaHoraria || '—');
      const fill = document.querySelector('[data-progress-fill]');
      if (fill) requestAnimationFrame(() => { fill.style.width = c.pct + '%'; });

      const list = document.querySelector('#modules-list');
      if (!list) return;

      if (!liberado) {
        list.innerHTML = `
          <div class="locked-curso">
            <span class="locked-curso__icon">${I.lock}</span>
            <h3>Curso bloqueado</h3>
            <p>Você ainda não tem acesso a <strong>${escapeHtml(curso.titulo)}</strong>. Adquira na loja para liberar todos os módulos e aulas.</p>
            <a class="btn-primary" href="loja.html?destacar=${curso.id}" style="display:inline-flex;width:auto">${I.cart} Ver na loja · ${formatPreco(curso.preco)}</a>
          </div>`;
        return;
      }

      list.innerHTML = curso.modulos.map(m => {
        const p = Progress.countModulo(m);
        const aulasHtml = m.aulas.map((a, i) => {
          const done = Progress.isDone(a.id);
          return `
            <div class="aula ${done ? 'is-done' : ''}" data-aula-id="${a.id}" data-modulo-id="${m.id}">
              <button class="aula__check" data-toggle-aula="${a.id}" aria-label="Marcar concluída">${I.check}</button>
              <div><div class="aula__title">${escapeHtml(a.titulo)}</div></div>
              <div class="aula__num">${escapeHtml(m.numero)}.${String(i + 1).padStart(2, '0')}</div>
              <div class="aula__duracao">${escapeHtml(a.duracao || '')}</div>
            </div>`;
        }).join('');
        return `
          <article class="module" data-modulo-id="${m.id}" style="--p:${p.pct}%">
            <button class="module__head" data-toggle-modulo="${m.id}">
              <span class="module__num serif">${escapeHtml(m.numero)}</span>
              <div class="module__body">
                <h3 class="module__title">${escapeHtml(m.titulo)}</h3>
                <p class="module__resumo">${escapeHtml(m.resumo || '')}</p>
              </div>
              <div class="module__meta">
                <strong>${p.done}/${p.total} aulas</strong>
                ${escapeHtml(m.duracao || '')}
              </div>
              <span class="module__chevron">${I.chevronDown}</span>
            </button>
            <div class="module__progress"></div>
            <div class="module__aulas">${aulasHtml}</div>
          </article>`;
      }).join('');

      list.onclick = (e) => {
        const head = e.target.closest('[data-toggle-modulo]');
        if (head) { head.closest('.module').classList.toggle('is-open'); return; }
        const checkBtn = e.target.closest('[data-toggle-aula]');
        if (checkBtn) {
          e.stopPropagation();
          Progress.toggle(checkBtn.dataset.toggleAula);
          renderActiveCurso();
          renderCatalog();
          return;
        }
        const aula = e.target.closest('.aula');
        if (aula) window.location.href = `aula.html?id=${aula.dataset.aulaId}`;
      };
    }
  }
  window.DMC_bootDashboard = bootDashboard;

  // =============================================================
  // PLAYER
  // =============================================================
  function bootPlayer() {
    if (!Auth.requireOrRedirect()) return;
    bindHeader();

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    let curso = id ? Data.findCursoByAulaId(id) : null;
    if (curso) Data.setCursoEscolhido(curso.id);
    if (!curso) curso = Data.getActiveCurso();
    if (!curso) {
      document.querySelector('#player-root').innerHTML = '<p style="padding:4rem;text-align:center;color:var(--ink-2)">Nenhum curso cadastrado.</p>';
      return;
    }

    // Bloqueia se não liberado
    const user = Auth.user();
    if (!Liberacoes.has(user && user.email, curso.id)) {
      document.querySelector('#player-root').innerHTML = `
        <div class="locked-curso" style="margin:4rem auto;max-width:560px">
          <span class="locked-curso__icon">${I.lock}</span>
          <h3>Aula bloqueada</h3>
          <p>Você ainda não tem acesso ao curso <strong>${escapeHtml(curso.titulo)}</strong>.</p>
          <a class="btn-primary" href="loja.html?destacar=${curso.id}" style="display:inline-flex;width:auto">${I.cart} Ir à loja · ${formatPreco(curso.preco)}</a>
        </div>`;
      return;
    }

    const aulaId = id || (curso.modulos[0] && curso.modulos[0].aulas[0] && curso.modulos[0].aulas[0].id);
    const found = findAula(curso, aulaId);
    if (!found) {
      document.querySelector('#player-root').innerHTML = '<p style="padding:4rem;text-align:center;color:var(--ink-2)">Aula não encontrada.</p>';
      return;
    }
    const { modulo, aula, index } = found;

    const stage = document.querySelector('#player-stage');
    if (aula.videoUrl && aula.videoUrl.trim()) {
      const url = aula.videoUrl.trim();
      const isEmbed = /vimeo\.com|youtube\.com|youtu\.be|player\./i.test(url);
      stage.innerHTML = isEmbed
        ? `<iframe src="${url}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`
        : `<video controls preload="metadata"><source src="${url}"></video>`;
    } else {
      stage.innerHTML = `
        <div class="player-placeholder">
          <div class="player-placeholder__icon">${I.playLarge}</div>
          <p>Aula em produção. Acesse o painel administrativo para preencher o campo <code>videoUrl</code> desta aula com a URL do vídeo (Vimeo, YouTube, S3, Mux ou MP4 direto).</p>
        </div>`;
    }

    document.querySelector('[data-aula-modulo]').textContent = `Módulo ${modulo.numero} · ${modulo.titulo}`;
    document.querySelector('[data-aula-titulo]').textContent = aula.titulo;
    document.querySelector('[data-aula-num]').innerHTML = `${I.book}<span>Aula ${modulo.numero}.${String(index + 1).padStart(2, '0')} · ${modulo.aulas.length} no módulo</span>`;
    document.querySelector('[data-aula-dur]').innerHTML = `${I.clock}<span>${aula.duracao || '—'}</span>`;

    const doneBtn = document.querySelector('#btn-done');
    function refreshDoneBtn() {
      const isDone = Progress.isDone(aula.id);
      doneBtn.innerHTML = isDone ? `${I.check} Aula concluída` : `${I.check} Marcar como concluída`;
      doneBtn.classList.toggle('is-done', isDone);
    }
    doneBtn.addEventListener('click', () => {
      Progress.toggle(aula.id);
      refreshDoneBtn();
      const t = document.querySelector(`[data-aside-aula="${aula.id}"]`);
      if (t) t.classList.toggle('is-done', Progress.isDone(aula.id));
    });
    refreshDoneBtn();

    const prev = prevAula(curso, aula.id);
    const next = nextAula(curso, aula.id);
    const btnPrev = document.querySelector('#btn-prev');
    const btnNext = document.querySelector('#btn-next');
    if (prev) btnPrev.onclick = () => { window.location.href = `aula.html?id=${prev.aula.id}`; };
    else { btnPrev.disabled = true; btnPrev.style.opacity = '0.4'; btnPrev.style.cursor = 'not-allowed'; }
    if (next) btnNext.onclick = () => { window.location.href = `aula.html?id=${next.aula.id}`; };
    else { btnNext.disabled = true; btnNext.style.opacity = '0.4'; btnNext.style.cursor = 'not-allowed'; }

    const aside = document.querySelector('#player-aside-list');
    aside.innerHTML = curso.modulos.map(m => {
      const ativos = m.aulas.map((a, i) => {
        const done = Progress.isDone(a.id);
        const active = a.id === aula.id;
        return `
          <div class="aside-aula ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}"
               data-aside-aula="${a.id}" onclick="window.location.href='aula.html?id=${a.id}'">
            <span class="aside-aula__check">${I.check}</span>
            <span class="aside-aula__title">${escapeHtml(m.numero)}.${String(i + 1).padStart(2, '0')} · ${escapeHtml(a.titulo)}</span>
            <span class="aside-aula__dur">${escapeHtml(a.duracao || '')}</span>
          </div>`;
      }).join('');
      return `<div class="aside-modulo-head">Módulo ${escapeHtml(m.numero)} — ${escapeHtml(m.titulo)}</div>${ativos}`;
    }).join('');
    document.querySelector('[data-curso-titulo]').textContent = curso.titulo;
  }
  window.DMC_bootPlayer = bootPlayer;

  // =============================================================
  // LOJA
  // =============================================================
  function bootLoja() {
    if (!Auth.requireOrRedirect()) return;
    bindHeader();

    const allCursos = Data.get().cursos || [];
    const grid = document.querySelector('#loja-grid');
    if (!grid) return;
    const params = new URLSearchParams(window.location.search);
    const destacarId = params.get('destacar');

    function renderGrid() {
      const user = Auth.user();
      const userEmail = user && user.email;
      grid.innerHTML = allCursos.map(c => {
        const liberado = Liberacoes.has(userEmail, c.id);
        const noCart = Carrinho.has(c.id);
        const beneficios = (c.beneficios || []).map(b => `<li>${I.check}<span>${escapeHtml(b)}</span></li>`).join('');
        const totalAulas = (c.modulos || []).reduce((s, m) => s + (m.aulas || []).length, 0);
        const iconSvg = COURSE_ICONS[c.iconeKey] || COURSE_ICONS.graduation;
        const modalidade = c.modalidade || 'Online';
        const isDestacado = c.id === destacarId;
        let cta;
        if (liberado) {
          cta = `<button class="loja-cta loja-cta--access" data-acessar="${c.id}">${I.unlock} Curso liberado · Acessar</button>`;
        } else if (noCart) {
          cta = `<button class="loja-cta loja-cta--in" data-toggle-cart="${c.id}">${I.check} No carrinho</button>`;
        } else {
          cta = `<button class="loja-cta loja-cta--add" data-toggle-cart="${c.id}">${I.cart} Adicionar ao carrinho</button>`;
        }
        return `
          <article class="loja-card ${isDestacado ? 'is-destacado' : ''}" data-curso-id="${c.id}" data-tilt>
            <div class="loja-card__inner">
              ${liberado ? `<span class="loja-card__badge loja-card__badge--owned">${I.unlock} Liberado</span>` : ''}
              ${isDestacado && !liberado ? `<span class="loja-card__badge loja-card__badge--featured">${I.sparkle} Selecionado</span>` : ''}
              <div class="loja-card__icon">${iconSvg}</div>
              <span class="loja-card__pill loja-card__pill--${modalidade.toLowerCase()}">${escapeHtml(modalidade)}</span>
              <h3 class="loja-card__title">${escapeHtml(c.titulo)}</h3>
              <p class="loja-card__desc">${escapeHtml(c.descricao || c.subtitulo || '')}</p>
              <ul class="loja-card__beneficios">${beneficios || '<li style="opacity:.6">Sem benefícios cadastrados</li>'}</ul>
              <div class="loja-card__stats">
                <span>${I.clock}<strong>${escapeHtml(c.cargaHoraria || '—')}</strong></span>
                <span>${I.book}<strong>${(c.modulos || []).length} módulos · ${totalAulas} aulas</strong></span>
              </div>
              <div class="loja-card__footer">
                <div class="loja-card__price">
                  <span class="loja-card__price-label">Investimento</span>
                  <span class="loja-card__price-value">${formatPreco(c.preco)}</span>
                </div>
                ${cta}
              </div>
            </div>
            <span class="loja-card__shine"></span>
          </article>`;
      }).join('');

      attachTilt();
      bindCardActions();

      if (destacarId) {
        const target = grid.querySelector(`[data-curso-id="${destacarId}"]`);
        if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
      }
    }

    function attachTilt() {
      grid.querySelectorAll('[data-tilt]').forEach(card => {
        card.addEventListener('mousemove', (e) => {
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          const ry = (px - 0.5) * 12;
          const rx = (0.5 - py) * 10;
          card.style.setProperty('--rx', rx + 'deg');
          card.style.setProperty('--ry', ry + 'deg');
          card.style.setProperty('--mx', (px * 100) + '%');
          card.style.setProperty('--my', (py * 100) + '%');
        });
        card.addEventListener('mouseleave', () => {
          card.style.setProperty('--rx', '0deg');
          card.style.setProperty('--ry', '0deg');
        });
      });
    }

    function bindCardActions() {
      grid.querySelectorAll('[data-toggle-cart]').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = b.dataset.toggleCart;
        const wasIn = Carrinho.has(id);
        Carrinho.toggle(id);
        renderGrid();
        renderDrawer();
        showToast(wasIn ? 'Removido do carrinho' : 'Adicionado ao carrinho');
      }));
      grid.querySelectorAll('[data-acessar]').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = b.dataset.acessar;
        Data.setCursoEscolhido(id);
        window.location.href = 'dashboard.html';
      }));
    }

    // ============ Drawer do carrinho (estrutura do user) ============
    const drawer = document.querySelector('#cart-drawer');
    const body = document.querySelector('#cart-body');
    const totalEl = document.querySelector('[data-cart-total]');
    const checkoutBtn = document.querySelector('#btn-checkout');
    const openBtn = document.querySelector('#btn-open-cart');
    const closeBtn = document.querySelector('#btn-close-cart');

    function renderDrawer() {
      const ids = Carrinho.items();
      const foot = document.querySelector('.cart-drawer__foot');
      if (!ids.length) {
        body.innerHTML = `
          <div class="cart-empty">
            <div class="cart-empty__icon">${I.cart}</div>
            <h4>Seu carrinho está vazio</h4>
            <p>Adicione um programa à esquerda para começar.</p>
            <button class="btn-ghost" id="btn-cart-back">Voltar à vitrine</button>
          </div>`;
        body.querySelector('#btn-cart-back')?.addEventListener('click', () => drawer.classList.remove('is-open'));
        if (checkoutBtn) checkoutBtn.disabled = true;
        if (foot) foot.style.display = 'none';
      } else {
        if (foot) foot.style.display = '';
        body.innerHTML = `
          <div class="cart-list">
            ${ids.map(id => {
              const c = Data.getCursoById(id);
              if (!c) return '';
              return `
                <div class="cart-item">
                  <div class="cart-item__icon">${COURSE_ICONS[c.iconeKey] || COURSE_ICONS.graduation}</div>
                  <div class="cart-item__main">
                    <div class="cart-item__title">${escapeHtml(c.titulo)}</div>
                    <div class="cart-item__sub">${escapeHtml(c.modalidade || 'Online')} · ${escapeHtml(c.cargaHoraria || '')}</div>
                    <div class="cart-item__price">${formatPreco(c.preco)}</div>
                  </div>
                  <button class="cart-item__remove" data-remove-cart="${c.id}" title="Remover" aria-label="Remover">${I.close}</button>
                </div>`;
            }).join('')}
          </div>`;
        body.querySelectorAll('[data-remove-cart]').forEach(b => b.addEventListener('click', () => {
          Carrinho.remove(b.dataset.removeCart);
          renderGrid();
          renderDrawer();
          showToast('Item removido');
        }));
        if (checkoutBtn) checkoutBtn.disabled = false;
      }
      if (totalEl) totalEl.textContent = formatPreco(Carrinho.total());
      // Badge do carrinho na nav
      document.querySelectorAll('[data-cart-count]').forEach(el => {
        const n = Carrinho.count();
        el.textContent = n;
        el.classList.toggle('is-empty', n === 0);
      });
    }

    if (openBtn) openBtn.addEventListener('click', () => drawer.classList.add('is-open'));
    if (closeBtn) closeBtn.addEventListener('click', () => drawer.classList.remove('is-open'));
    document.querySelectorAll('[data-cart-close]').forEach(btn => btn.addEventListener('click', () => drawer.classList.remove('is-open')));

    if (checkoutBtn) checkoutBtn.addEventListener('click', () => {
      const ids = Carrinho.items();
      if (!ids.length) return;
      const user = Auth.user() || {};
      const itensTxt = ids.map(id => {
        const c = Data.getCursoById(id);
        return c ? `• ${c.titulo} — ${formatPreco(c.preco)} (${c.modalidade}, ${c.cargaHoraria})` : '';
      }).filter(Boolean).join('\n');
      const total = formatPreco(Carrinho.total());
      const subject = `Pedido Loja Complexo DMC — ${ids.length} programa(s)`;
      const body = [
        'Olá, time administrativo do Complexo DMC.',
        '',
        'Gostaria de adquirir os seguintes programas:',
        '',
        itensTxt,
        '',
        `Total: ${total}`,
        '',
        `Aluno: ${user.nome || ''}`,
        `E-mail: ${user.email || ''}`,
        '',
        'Aguardo o link de pagamento Mercado Pago e a liberação na plataforma.',
        '',
        'Obrigado.'
      ].join('\n');
      const mailto = `mailto:administrativo@complexodmc.com.br?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      // Abre cliente de email do usuário
      window.location.href = mailto;
      // Em paralelo, redireciona pra obrigado.html
      const params = new URLSearchParams({
        cursos: ids.join(','),
        email: user.email || '',
        total: Carrinho.total().toFixed(2)
      });
      setTimeout(() => { window.location.href = `obrigado.html?${params.toString()}`; }, 600);
    });

    function showToast(msg) {
      const t = document.querySelector('#toast');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('is-show');
      clearTimeout(showToast._t);
      showToast._t = setTimeout(() => t.classList.remove('is-show'), 1800);
    }

    renderGrid();
    renderDrawer();
    window.addEventListener('dmc:carrinho:change', renderDrawer);
  }
  window.DMC_bootLoja = bootLoja;

  // =============================================================
  // OBRIGADO (checkout simulado: libera cursos pro email)
  // =============================================================
  function bootObrigado() {
    bindHeader(); // não exige login pra ver, mas se logado mostra nav
    const params = new URLSearchParams(window.location.search);
    const cursoIds = (params.get('cursos') || '').split(',').filter(Boolean);
    const email = (params.get('email') || '').trim();
    const total = params.get('total') || '0';

    const list = document.querySelector('#obrigado-list');
    if (!cursoIds.length) {
      list.innerHTML = '<p style="text-align:center;color:var(--ink-2)">Nenhum curso recebido. Volte à <a href="loja.html" style="color:var(--cyan)">loja</a> para escolher.</p>';
      return;
    }

    // Libera os cursos pro email
    if (email) Liberacoes.grant(email, cursoIds);
    // Limpa carrinho
    Carrinho.clear();

    list.innerHTML = cursoIds.map(id => {
      const c = Data.getCursoById(id);
      if (!c) return '';
      return `
        <div class="obrigado-item">
          <div class="obrigado-item__icon">${COURSE_ICONS[c.iconeKey] || COURSE_ICONS.graduation}</div>
          <div>
            <div class="obrigado-item__title">${escapeHtml(c.titulo)}</div>
            <div class="obrigado-item__sub">${escapeHtml(c.modalidade || 'Online')} · ${escapeHtml(c.cargaHoraria || '')}</div>
          </div>
          <div class="obrigado-item__price">${formatPreco(c.preco)}</div>
        </div>`;
    }).join('');

    const totalEl = document.querySelector('[data-obrigado-total]');
    if (totalEl) totalEl.textContent = formatPreco(total);
    const emailEl = document.querySelector('[data-obrigado-email]');
    if (emailEl) emailEl.textContent = email || '—';

    // Se o aluno estiver logado e for o mesmo email, define o primeiro curso como ativo
    const user = Auth.user();
    if (user && cursoIds[0]) Data.setCursoEscolhido(cursoIds[0]);
  }
  window.DMC_bootObrigado = bootObrigado;

  // =============================================================
  // HEADER (nav comum)
  // =============================================================
  function bindHeader() {
    const user = Auth.user();
    if (user) {
      document.querySelectorAll('[data-user-iniciais]').forEach(el => el.textContent = user.iniciais);
      document.querySelectorAll('[data-user-nome]').forEach(el => el.textContent = user.nome);
    }
    document.querySelectorAll('[data-logout]').forEach(btn => btn.addEventListener('click', () => {
      Auth.logout(); window.location.href = 'index.html';
    }));
    // Esconde Admin pra não-admin
    if (user && !user.isAdmin) {
      document.querySelectorAll('[data-admin-only]').forEach(el => { el.style.display = 'none'; });
    }
    // Atualiza badge do carrinho
    refreshCartBadge();
    window.addEventListener('dmc:carrinho:change', refreshCartBadge);
  }
  function refreshCartBadge() {
    const n = Carrinho.count();
    document.querySelectorAll('[data-cart-count]').forEach(el => {
      el.textContent = n;
      el.classList.toggle('is-empty', n === 0);
    });
  }
  window.DMC_bindHeader = bindHeader;

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  window.DMC_escapeHtml = escapeHtml;
})();
