// =============================================================
// COMPLEXO DMC · PLATAFORMA — núcleo do front
// Persistência em Supabase. Cache em memória + localStorage só
// pra escolha de curso ativo e carrinho.
// =============================================================
(function () {
  'use strict';

  const STORAGE_CURSO_ESCOLHIDO = 'dmc:cursoEscolhido';
  const STORAGE_CARRINHO = 'dmc:carrinho';

  const supa = () => window.DMC_supa;

  // =============================================================
  // AUTH — wrapper síncrono em volta do Supabase Auth
  // Após DMC_init(), Auth.user() retorna { id, email, nome, iniciais, isAdmin } ou null.
  // =============================================================
  let _user = null;

  const Auth = {
    async init() {
      const { data: { session } } = await supa().auth.getSession();
      if (!session) { _user = null; return null; }
      const u = session.user;
      // Busca profile pra pegar is_admin e nome
      const { data: profile, error } = await supa()
        .from('profiles')
        .select('email, nome, is_admin')
        .eq('id', u.id)
        .maybeSingle();
      if (error) console.warn('[DMC] erro ao carregar profile:', error.message);
      const nome = (profile && profile.nome) || u.email.split('@')[0];
      _user = {
        id: u.id,
        email: (profile && profile.email) || u.email,
        nome,
        iniciais: nome.split(/[\s.@]/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join(''),
        isAdmin: !!(profile && profile.is_admin)
      };
      return _user;
    },
    isLogged() { return !!_user; },
    user() { return _user; },
    async signIn(email, senha) {
      const { data, error } = await supa().auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) throw error;
      await this.init();
      return data;
    },
    async signUp(email, senha, nome) {
      const { data, error } = await supa().auth.signUp({
        email: email.trim(),
        password: senha,
        options: { data: { nome: (nome || '').trim() } }
      });
      if (error) throw error;
      // Se "Confirm email" estiver desligado no Supabase, já vem com session.
      // Se estiver ligado, data.session é null e o user precisa confirmar pelo email.
      if (data && data.session) await this.init();
      return data;
    },
    async signOut() {
      await supa().auth.signOut();
      _user = null;
    },
    requireOrRedirect(to = 'login.html') {
      if (!this.isLogged()) { window.location.href = to; return false; }
      return true;
    },
    requireAdminOrRedirect(to = 'dashboard.html') {
      if (!this.requireOrRedirect()) return false;
      if (!_user.isAdmin) { window.location.href = to; return false; }
      return true;
    }
  };
  window.DMC_Auth = Auth;

  // =============================================================
  // DATA — multi-curso (cache em memória, fonte: Supabase)
  // Estrutura: { cursos: [{ id, titulo, ..., modulos: [{ ..., aulas: [...] }] }] }
  // Mantém field names em camelCase pra não quebrar a UI.
  // =============================================================
  let _data = { cursos: [] };

  function mapCursoFromDb(row, modulos) {
    return {
      id: row.id,
      titulo: row.titulo,
      subtitulo: row.subtitulo || '',
      descricao: row.descricao || '',
      cargaHoraria: row.carga_horaria || '',
      modalidade: row.modalidade || 'Online',
      iconeKey: row.icone_key || 'graduation',
      preco: Number(row.preco) || 0,
      linkCheckout: row.link_checkout || '',
      beneficios: Array.isArray(row.beneficios) ? row.beneficios : [],
      ordem: row.ordem || 0,
      isAtivo: row.is_ativo !== false,
      modulos: modulos || []
    };
  }
  function mapModuloFromDb(row, aulas) {
    return {
      id: row.id,
      cursoId: row.curso_id,
      numero: row.numero || '',
      titulo: row.titulo,
      resumo: row.resumo || '',
      duracao: row.duracao || '',
      ordem: row.ordem || 0,
      aulas: aulas || []
    };
  }
  function mapAulaFromDb(row) {
    return {
      id: row.id,
      moduloId: row.modulo_id,
      titulo: row.titulo,
      duracao: row.duracao || '',
      videoUrl: row.video_url || '',
      ordem: row.ordem || 0
    };
  }

  const Data = {
    async init() {
      const [cursosRes, modulosRes, aulasRes] = await Promise.all([
        supa().from('cursos').select('*').order('ordem', { ascending: true }),
        supa().from('modulos').select('*').order('ordem', { ascending: true }),
        supa().from('aulas').select('*').order('ordem', { ascending: true })
      ]);
      if (cursosRes.error) throw cursosRes.error;
      if (modulosRes.error) throw modulosRes.error;
      if (aulasRes.error) throw aulasRes.error;

      const aulasByModulo = new Map();
      (aulasRes.data || []).forEach(a => {
        if (!aulasByModulo.has(a.modulo_id)) aulasByModulo.set(a.modulo_id, []);
        aulasByModulo.get(a.modulo_id).push(mapAulaFromDb(a));
      });
      const modulosByCurso = new Map();
      (modulosRes.data || []).forEach(m => {
        if (!modulosByCurso.has(m.curso_id)) modulosByCurso.set(m.curso_id, []);
        modulosByCurso.get(m.curso_id).push(mapModuloFromDb(m, aulasByModulo.get(m.id) || []));
      });
      _data = {
        cursos: (cursosRes.data || []).map(c => mapCursoFromDb(c, modulosByCurso.get(c.id) || []))
      };
      return _data;
    },
    async refresh() { return this.init(); },
    get() { return _data; },
    getCursoEscolhidoId() {
      const id = localStorage.getItem(STORAGE_CURSO_ESCOLHIDO);
      if (id && _data.cursos.find(c => c.id === id)) return id;
      return _data.cursos[0] ? _data.cursos[0].id : null;
    },
    setCursoEscolhido(id) {
      if (id) localStorage.setItem(STORAGE_CURSO_ESCOLHIDO, id);
      else localStorage.removeItem(STORAGE_CURSO_ESCOLHIDO);
    },
    getActiveCurso() {
      const id = this.getCursoEscolhidoId();
      return _data.cursos.find(c => c.id === id) || _data.cursos[0] || null;
    },
    getCursoById(id) {
      return _data.cursos.find(c => c.id === id) || null;
    },
    findCursoByAulaId(aulaId) {
      for (const c of _data.cursos) {
        for (const m of c.modulos || []) {
          if ((m.aulas || []).some(a => a.id === aulaId)) return c;
        }
      }
      return null;
    },
    uid(prefix) {
      return prefix + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
    },
    // ============ MUTATIONS (admin) ============
    async upsertCurso(curso) {
      const row = {
        id: curso.id,
        titulo: curso.titulo || '',
        subtitulo: curso.subtitulo || null,
        descricao: curso.descricao || null,
        carga_horaria: curso.cargaHoraria || null,
        modalidade: curso.modalidade || 'Online',
        icone_key: curso.iconeKey || 'graduation',
        preco: Number(curso.preco) || 0,
        link_checkout: curso.linkCheckout || null,
        beneficios: Array.isArray(curso.beneficios) ? curso.beneficios : [],
        ordem: curso.ordem || 0,
        is_ativo: curso.isAtivo !== false
      };
      const { error } = await supa().from('cursos').upsert(row);
      if (error) throw error;
    },
    async deleteCurso(cursoId) {
      const { error } = await supa().from('cursos').delete().eq('id', cursoId);
      if (error) throw error;
    },
    async upsertModulo(modulo, cursoId) {
      const row = {
        id: modulo.id,
        curso_id: cursoId,
        numero: modulo.numero || '',
        titulo: modulo.titulo || '',
        resumo: modulo.resumo || null,
        duracao: modulo.duracao || null,
        ordem: modulo.ordem || 0
      };
      const { error } = await supa().from('modulos').upsert(row);
      if (error) throw error;
    },
    async deleteModulo(moduloId) {
      const { error } = await supa().from('modulos').delete().eq('id', moduloId);
      if (error) throw error;
    },
    async upsertAula(aula, moduloId) {
      const row = {
        id: aula.id,
        modulo_id: moduloId,
        titulo: aula.titulo || '',
        duracao: aula.duracao || null,
        video_url: aula.videoUrl || null,
        ordem: aula.ordem || 0
      };
      const { error } = await supa().from('aulas').upsert(row);
      if (error) throw error;
    },
    async deleteAula(aulaId) {
      const { error } = await supa().from('aulas').delete().eq('id', aulaId);
      if (error) throw error;
    }
  };
  window.DMC_Data = Data;

  // =============================================================
  // LIBERAÇÕES (acesso por user a cursos)
  // Cache: Set<cursoId> do usuário logado.
  // =============================================================
  let _libsUser = new Set();   // liberações do usuário logado
  let _libsAll = null;          // { email -> [cursoId] } — só admin carrega isso

  const Liberacoes = {
    async init() {
      _libsUser = new Set();
      if (!_user) return;
      const { data, error } = await supa()
        .from('liberacoes')
        .select('curso_id')
        .eq('user_id', _user.id);
      if (error) { console.warn('[DMC] erro liberacoes:', error.message); return; }
      (data || []).forEach(r => _libsUser.add(r.curso_id));
    },
    has(_email, cursoId) {
      // assinatura mantém compat: 1º arg ignorado (era email), checa pelo user logado
      if (!cursoId) { cursoId = _email; }
      if (!_user) return false;
      if (_user.isAdmin) return true;
      return _libsUser.has(cursoId);
    },
    listForCurrentUser() { return [..._libsUser]; },
    // ============ ADMIN ============
    async loadAll() {
      // Não há FK direta liberacoes → profiles (ambos apontam pra auth.users),
      // então o PostgREST não infere o join. Faz em 2 queries.
      const { data: libs, error: lErr } = await supa()
        .from('liberacoes')
        .select('curso_id, user_id');
      if (lErr) throw lErr;
      const userIds = [...new Set((libs || []).map(r => r.user_id))];
      let emailById = {};
      if (userIds.length) {
        const { data: profs, error: pErr } = await supa()
          .from('profiles')
          .select('id, email')
          .in('id', userIds);
        if (pErr) throw pErr;
        (profs || []).forEach(p => { emailById[p.id] = p.email; });
      }
      const byEmail = {};
      (libs || []).forEach(r => {
        const email = emailById[r.user_id];
        if (!email) return;
        if (!byEmail[email]) byEmail[email] = [];
        byEmail[email].push(r.curso_id);
      });
      _libsAll = byEmail;
      return byEmail;
    },
    allByEmail() { return _libsAll || {}; },
    async grantByEmail(email, cursoIds) {
      const { data: profile, error: pErr } = await supa()
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) throw new Error(`Aluno ${email} não tem conta na plataforma. Crie a conta no Supabase Auth primeiro.`);
      const ids = Array.isArray(cursoIds) ? cursoIds : [cursoIds];
      const rows = ids.filter(Boolean).map(cid => ({
        user_id: profile.id,
        curso_id: cid,
        granted_by: _user ? _user.id : null
      }));
      if (!rows.length) return;
      const { error } = await supa().from('liberacoes').upsert(rows);
      if (error) throw error;
    },
    async revokeByEmail(email, cursoId) {
      const { data: profile, error: pErr } = await supa()
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return;
      const { error } = await supa()
        .from('liberacoes')
        .delete()
        .eq('user_id', profile.id)
        .eq('curso_id', cursoId);
      if (error) throw error;
    },
    async revokeAllByEmail(email) {
      const { data: profile, error: pErr } = await supa()
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return;
      const { error } = await supa()
        .from('liberacoes')
        .delete()
        .eq('user_id', profile.id);
      if (error) throw error;
    }
  };
  window.DMC_Liberacoes = Liberacoes;

  // =============================================================
  // PROGRESSO — cache em memória, write-through pro Supabase
  // =============================================================
  let _progress = new Map(); // aulaId -> completed_at ISO

  const Progress = {
    async init() {
      _progress = new Map();
      if (!_user) return;
      const { data, error } = await supa()
        .from('progresso')
        .select('aula_id, completed_at')
        .eq('user_id', _user.id);
      if (error) { console.warn('[DMC] erro progresso:', error.message); return; }
      (data || []).forEach(r => _progress.set(r.aula_id, r.completed_at));
    },
    isDone(aulaId) { return _progress.has(aulaId); },
    async toggle(aulaId) {
      if (!_user) return false;
      const wasDone = _progress.has(aulaId);
      if (wasDone) {
        _progress.delete(aulaId);
        const { error } = await supa()
          .from('progresso').delete()
          .eq('user_id', _user.id).eq('aula_id', aulaId);
        if (error) { _progress.set(aulaId, new Date().toISOString()); throw error; }
        return false;
      } else {
        const now = new Date().toISOString();
        _progress.set(aulaId, now);
        const { error } = await supa()
          .from('progresso')
          .upsert({ user_id: _user.id, aula_id: aulaId, completed_at: now });
        if (error) { _progress.delete(aulaId); throw error; }
        return true;
      }
    },
    async set(aulaId, done) {
      const isDone = _progress.has(aulaId);
      if (isDone === !!done) return;
      return this.toggle(aulaId);
    },
    countModulo(modulo) {
      const total = (modulo.aulas || []).length;
      const done = (modulo.aulas || []).filter(a => _progress.has(a.id)).length;
      return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    },
    countCurso(curso) {
      let total = 0, done = 0;
      (curso.modulos || []).forEach(m => {
        (m.aulas || []).forEach(a => { total++; if (_progress.has(a.id)) done++; });
      });
      return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    }
  };
  window.DMC_Progress = Progress;

  // =============================================================
  // CARRINHO (continua em localStorage — efêmero)
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
      if (!arr.includes(cursoId)) { arr.push(cursoId); this._write(arr); }
      this._notify();
    },
    remove(cursoId) {
      this._write(this._read().filter(id => id !== cursoId));
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
      let sum = 0;
      ids.forEach(id => {
        const c = Data.getCursoById(id);
        if (c && Number(c.preco)) sum += Number(c.preco);
      });
      return sum;
    },
    _notify() { window.dispatchEvent(new CustomEvent('dmc:carrinho:change')); }
  };
  window.DMC_Carrinho = Carrinho;

  // =============================================================
  // BOOTSTRAP — chamada única no início de cada página
  // =============================================================
  let _initPromise = null;
  async function DMC_init() {
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      await Auth.init();
      // Data é leitura pública (autenticada) — só carrega se logado
      if (_user) {
        await Promise.all([Data.init(), Liberacoes.init(), Progress.init()]);
      }
    })();
    return _initPromise;
  }
  window.DMC_init = DMC_init;

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
  // LOGIN / SIGNUP — toggle entre modos via [data-auth-mode] no form
  // Modos: 'signin' (default) e 'signup'
  // =============================================================
  async function bootLogin() {
    await DMC_init();
    if (Auth.isLogged()) { window.location.href = 'dashboard.html'; return; }
    const form = document.querySelector('#login-form');
    if (!form) return;
    const errorEl = document.querySelector('#login-error');
    const submitBtn = form.querySelector('button[type="submit"]');
    const noticeEl = document.querySelector('#login-notice');

    function showError(msg) {
      if (errorEl) { errorEl.textContent = msg; errorEl.hidden = false; }
    }
    function clearError() {
      if (errorEl) { errorEl.textContent = ''; errorEl.hidden = true; }
    }
    function showNotice(msg) {
      if (noticeEl) { noticeEl.textContent = msg; noticeEl.hidden = false; }
    }
    function clearNotice() {
      if (noticeEl) { noticeEl.textContent = ''; noticeEl.hidden = true; }
    }
    function getMode() { return form.getAttribute('data-auth-mode') === 'signup' ? 'signup' : 'signin'; }

    // Tabs
    const tabs = document.querySelectorAll('[data-auth-tab]');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.authTab;
        form.setAttribute('data-auth-mode', mode);
        tabs.forEach(t => t.classList.toggle('is-active', t === tab));
        document.querySelectorAll('[data-auth-only]').forEach(el => {
          const visibleIn = el.dataset.authOnly.split(',').map(s => s.trim());
          el.style.display = visibleIn.includes(mode) ? '' : 'none';
        });
        submitBtn.textContent = mode === 'signup' ? 'Criar conta' : 'Acessar plataforma';
        clearError(); clearNotice();
      });
    });
    // Inicializa visibilidade
    const initialMode = getMode();
    document.querySelectorAll('[data-auth-only]').forEach(el => {
      const visibleIn = el.dataset.authOnly.split(',').map(s => s.trim());
      el.style.display = visibleIn.includes(initialMode) ? '' : 'none';
    });

    form.addEventListener('input', clearError);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError(); clearNotice();
      const mode = getMode();
      const email = (form.email.value || '').trim();
      const senha = form.senha ? (form.senha.value || '') : '';
      const nome = form.nome ? (form.nome.value || '').trim() : '';
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('Informe um e-mail válido.'); return;
      }
      if (!senha || senha.length < 6) {
        showError('A senha precisa ter pelo menos 6 caracteres.'); return;
      }
      if (mode === 'signup' && !nome) {
        showError('Informe seu nome.'); return;
      }
      const originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = mode === 'signup' ? 'Criando conta…' : 'Entrando…';
      try {
        if (mode === 'signup') {
          const { session } = await Auth.signUp(email, senha, nome);
          if (!session) {
            showNotice('Conta criada. Confirme seu e-mail para acessar a plataforma.');
            submitBtn.disabled = false;
            submitBtn.textContent = originalLabel;
            return;
          }
        } else {
          await Auth.signIn(email, senha);
        }
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next');
        const safeNext = next && /^[a-z0-9_-]+\.html(\?.*)?$/i.test(next) ? next : 'dashboard.html';
        window.location.href = safeNext;
      } catch (err) {
        showError(err && err.message ? err.message : (mode === 'signup' ? 'Falha no cadastro.' : 'Falha no login.'));
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }
  window.DMC_bootLogin = bootLogin;

  // =============================================================
  // DASHBOARD
  // =============================================================
  async function bootDashboard() {
    await DMC_init();
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
      track.innerHTML = allCursos.map(c => {
        const isSelected = c.id === escolhidoId;
        const liberado = Liberacoes.has(c.id);
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
          if (Liberacoes.has(id)) {
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
      const liberado = Liberacoes.has(curso.id);

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

      list.onclick = async (e) => {
        const head = e.target.closest('[data-toggle-modulo]');
        if (head) { head.closest('.module').classList.toggle('is-open'); return; }
        const checkBtn = e.target.closest('[data-toggle-aula]');
        if (checkBtn) {
          e.stopPropagation();
          try { await Progress.toggle(checkBtn.dataset.toggleAula); }
          catch (err) { alert('Falha ao salvar progresso: ' + err.message); return; }
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
  async function bootPlayer() {
    await DMC_init();
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

    if (!Liberacoes.has(curso.id)) {
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
    doneBtn.addEventListener('click', async () => {
      doneBtn.disabled = true;
      try { await Progress.toggle(aula.id); }
      catch (err) { alert('Falha ao salvar: ' + err.message); doneBtn.disabled = false; return; }
      refreshDoneBtn();
      const t = document.querySelector(`[data-aside-aula="${aula.id}"]`);
      if (t) t.classList.toggle('is-done', Progress.isDone(aula.id));
      doneBtn.disabled = false;
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
  async function bootLoja() {
    await DMC_init();
    if (!Auth.requireOrRedirect()) return;
    bindHeader();

    const allCursos = Data.get().cursos || [];
    const grid = document.querySelector('#loja-grid');
    if (!grid) return;
    const params = new URLSearchParams(window.location.search);
    const destacarId = params.get('destacar');

    function renderGrid() {
      grid.innerHTML = allCursos.map(c => {
        const liberado = Liberacoes.has(c.id);
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

    // ============ Drawer do carrinho ============
    const drawer = document.querySelector('#cart-drawer');
    const emptyEl = document.querySelector('#cart-empty');
    const listEl = document.querySelector('#cart-list');
    const checkoutForm = document.querySelector('#cart-checkout');
    const totalEl = document.querySelector('[data-cart-total]');

    function openDrawer() {
      if (!drawer) return;
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
    }
    function closeDrawer() {
      if (!drawer) return;
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
    }

    function renderDrawer() {
      const ids = Carrinho.items();
      const has = ids.length > 0;
      if (emptyEl) emptyEl.style.display = has ? 'none' : '';
      if (listEl) listEl.style.display = has ? '' : 'none';
      if (checkoutForm) checkoutForm.style.display = has ? '' : 'none';

      if (listEl) {
        listEl.innerHTML = ids.map(id => {
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
        }).join('');
        listEl.querySelectorAll('[data-remove-cart]').forEach(b => b.addEventListener('click', () => {
          Carrinho.remove(b.dataset.removeCart);
          renderGrid();
          renderDrawer();
          showToast('Item removido');
        }));
      }
      if (totalEl) totalEl.textContent = formatPreco(Carrinho.total());
      document.querySelectorAll('[data-cart-count]').forEach(el => {
        const n = Carrinho.count();
        el.textContent = n;
        el.classList.toggle('is-empty', n === 0);
      });
    }

    document.querySelectorAll('[data-cart-open]').forEach(btn => btn.addEventListener('click', openDrawer));
    document.querySelectorAll('[data-cart-close]').forEach(btn => btn.addEventListener('click', closeDrawer));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

    if (checkoutForm) checkoutForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const ids = Carrinho.items();
      if (!ids.length) return;
      const user = Auth.user() || {};
      const queryParams = new URLSearchParams({
        cursos: ids.join(','),
        email: user.email || '',
        total: Carrinho.total().toFixed(2)
      });
      window.location.href = `obrigado.html?${queryParams.toString()}`;
    });

    function showToast(msg) {
      let t = document.querySelector('#toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'toast';
        document.body.appendChild(t);
      }
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
  // OBRIGADO — exibe pedido e limpa carrinho.
  // Não libera mais cursos automaticamente: a liberação é manual
  // pelo admin via Supabase, após confirmação de pagamento.
  // =============================================================
  async function bootObrigado() {
    await DMC_init();
    bindHeader();
    const params = new URLSearchParams(window.location.search);
    const cursoIds = (params.get('cursos') || '').split(',').filter(Boolean);
    const email = (params.get('email') || '').trim();
    const total = params.get('total') || '0';

    const list = document.querySelector('#obrigado-list');
    if (!cursoIds.length) {
      list.innerHTML = '<p style="text-align:center;color:var(--ink-2)">Nenhum curso recebido. Volte à <a href="loja.html" style="color:var(--cyan)">loja</a> para escolher.</p>';
      return;
    }

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

    if (Auth.user() && cursoIds[0]) Data.setCursoEscolhido(cursoIds[0]);

    // ⚠️ DEV-ONLY: botão de simular pagamento aprovado.
    // Visível só em localhost/127.0.0.1 — em produção fica escondido.
    const devBox = document.querySelector('#dev-pay-box');
    const devBtn = document.querySelector('#btn-dev-pay');
    const devStatus = document.querySelector('#dev-pay-status');
    const isLocalDev = ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
    if (devBox && Auth.user() && cursoIds.length && isLocalDev) {
      devBox.style.display = '';
      devBtn.addEventListener('click', async () => {
        devBtn.disabled = true;
        devBtn.textContent = 'Liberando…';
        try {
          const { error } = await supa().rpc('dev_simular_pagamento', { curso_ids: cursoIds });
          if (error) throw error;
          await Liberacoes.init();
          devStatus.style.display = '';
          devStatus.textContent = `${cursoIds.length} curso${cursoIds.length > 1 ? 's' : ''} liberado${cursoIds.length > 1 ? 's' : ''} com sucesso. Redirecionando para o painel…`;
          setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
        } catch (err) {
          devBtn.disabled = false;
          devBtn.textContent = 'Simular pagamento aprovado';
          devStatus.style.display = '';
          devStatus.textContent = 'Erro: ' + (err && err.message ? err.message : 'falha desconhecida');
          devStatus.style.background = 'rgba(248,113,113,0.10)';
          devStatus.style.borderColor = 'rgba(248,113,113,0.35)';
          devStatus.style.color = '#fca5a5';
        }
      });
    }
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
    document.querySelectorAll('[data-logout]').forEach(btn => btn.addEventListener('click', async () => {
      await Auth.signOut();
      window.location.href = 'login.html';
    }));
    if (user && !user.isAdmin) {
      document.querySelectorAll('[data-admin-only]').forEach(el => { el.style.display = 'none'; });
    }
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
