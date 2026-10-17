// =============================================================
// COMPLEXO DMC · PLATAFORMA — núcleo do front
// Persistência na API MongoDB (/api). Cache em memória +
// localStorage só pra escolha de curso ativo e carrinho.
// =============================================================
(function () {
  'use strict';

  const STORAGE_CURSO_ESCOLHIDO = 'dmc:cursoEscolhido';
  const STORAGE_CARRINHO = 'dmc:carrinho';

  const api = () => window.DMC_Api;

  // =============================================================
  // AUTH — wrapper síncrono em volta da API + token JWT
  // Após DMC_init(), Auth.user() retorna { id, email, nome, iniciais, isAdmin } ou null.
  // =============================================================
  let _user = null;

  const Auth = {
    async init() {
      _user = null;
      if (!api().token()) return null;
      try {
        const { user } = await api().get('/auth/me');
        _user = user || null;
      } catch {
        // token expirado/inválido — o cliente já limpou o storage no 401
        _user = null;
      }
      return _user;
    },
    isLogged() { return !!_user; },
    user() { return _user; },
    async signIn(email, senha) {
      const dados = await api().post('/auth/signin', { email: email.trim(), senha });
      api().setToken(dados.token);
      _user = dados.user;
      return dados;
    },
    async signUp(email, senha, nome) {
      const dados = await api().post('/auth/signup', {
        email: email.trim(),
        senha,
        nome: (nome || '').trim()
      });
      // A API já devolve a sessão pronta — sem etapa de confirmação por e-mail.
      api().setToken(dados.token);
      _user = dados.user;
      return { ...dados, session: dados.token ? { token: dados.token } : null };
    },
    async signOut() {
      api().setToken(null);
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
  // DATA — multi-curso (cache em memória, fonte: API /api/catalogo)
  // Estrutura: { cursos: [{ id, titulo, ..., modulos: [{ ..., aulas: [...] }] }] }
  // A API já devolve tudo em camelCase e ordenado.
  // =============================================================
  let _data = { cursos: [] };

  const Data = {
    async init() {
      const { cursos } = await api().get('/catalogo');
      _data = { cursos: cursos || [] };
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
      await api().put(`/cursos/${encodeURIComponent(curso.id)}`, {
        titulo: curso.titulo || '',
        subtitulo: curso.subtitulo || '',
        descricao: curso.descricao || '',
        cargaHoraria: curso.cargaHoraria || '',
        modalidade: curso.modalidade || 'Online',
        iconeKey: curso.iconeKey || 'graduation',
        preco: Number(curso.preco) || 0,
        linkCheckout: curso.linkCheckout || '',
        beneficios: Array.isArray(curso.beneficios) ? curso.beneficios : [],
        ordem: curso.ordem || 0,
        isAtivo: curso.isAtivo !== false
      });
    },
    async deleteCurso(cursoId) {
      await api().del(`/cursos/${encodeURIComponent(cursoId)}`);
    },
    // ============ CAPA DO CURSO (imagem) ============
    async uploadCapa(cursoId, arquivo) {
      const { capaUrl } = await api().upload(
        `/cursos/${encodeURIComponent(cursoId)}/capa`,
        arquivo,
        arquivo.type || 'application/octet-stream'
      );
      return capaUrl;
    },
    async removerCapa(cursoId) {
      await api().del(`/cursos/${encodeURIComponent(cursoId)}/capa`);
    },
    async upsertModulo(modulo, cursoId) {
      await api().put(`/modulos/${encodeURIComponent(modulo.id)}`, {
        cursoId,
        numero: modulo.numero || '',
        titulo: modulo.titulo || '',
        resumo: modulo.resumo || '',
        duracao: modulo.duracao || '',
        ordem: modulo.ordem || 0
      });
    },
    async deleteModulo(moduloId) {
      await api().del(`/modulos/${encodeURIComponent(moduloId)}`);
    },
    /** Grava a ordem de todos os módulos do curso numa requisição só. */
    async reordenarModulos(cursoId, ids) {
      await api().put('/modulos/ordem', { cursoId, ids });
    },
    async upsertAula(aula, moduloId) {
      await api().put(`/aulas/${encodeURIComponent(aula.id)}`, {
        moduloId,
        titulo: aula.titulo || '',
        duracao: aula.duracao || '',
        videoUrl: aula.videoUrl || '',
        ordem: aula.ordem || 0,
        disponivel: aula.disponivel !== false,
        // Roteiro de gravação: campo interno do admin. A API só devolve
        // esse texto pra admin, então o `?? undefined` evita que uma tela
        // sem o campo carregado mande string vazia e apague o roteiro.
        roteiro: typeof aula.roteiro === 'string' ? aula.roteiro : undefined
      });
    },
    async deleteAula(aulaId) {
      await api().del(`/aulas/${encodeURIComponent(aulaId)}`);
    },
    // ============ MATERIAIS DE APOIO (PDF) ============
    async uploadMaterial(aulaId, arquivo) {
      const qs = new URLSearchParams({ nome: arquivo.name || 'Material.pdf' });
      const { material } = await api().upload(
        `/aulas/${encodeURIComponent(aulaId)}/materiais?${qs}`,
        arquivo,
        'application/pdf'
      );
      return material;
    },
    async addMaterialLink(aulaId, nome, url) {
      const { material } = await api().post(
        `/aulas/${encodeURIComponent(aulaId)}/materiais/link`,
        { nome, url }
      );
      return material;
    },
    async renameMaterial(aulaId, materialId, nome) {
      await api().put(
        `/aulas/${encodeURIComponent(aulaId)}/materiais/${encodeURIComponent(materialId)}`,
        { nome }
      );
    },
    async deleteMaterial(aulaId, materialId) {
      await api().del(
        `/aulas/${encodeURIComponent(aulaId)}/materiais/${encodeURIComponent(materialId)}`
      );
    }
  };
  window.DMC_Data = Data;

  /**
   * Abre um material de apoio.
   * Link externo vai direto; PDF do servidor exige o token JWT no header,
   * então baixa como blob e dispara o download por um <a> temporário.
   */
  async function abrirMaterial(material) {
    if (!material) return;
    if (material.tipo === 'link') {
      window.open(material.url, '_blank', 'noopener');
      return;
    }
    const dados = await api().blob(material.url);
    const objUrl = URL.createObjectURL(dados);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = /\.pdf$/i.test(material.nome) ? material.nome : `${material.nome}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
  }
  window.DMC_abrirMaterial = abrirMaterial;

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }
  window.DMC_formatBytes = formatBytes;

  // =============================================================
  // DÚVIDAS (Q&A por aula — aluno pergunta, instrutor responde)
  // Sem cache: a lista é lida na abertura da aula e atualizada
  // pontualmente a cada envio, então não há estado pra ficar velho.
  // =============================================================
  const Duvidas = {
    async listar(aulaId) {
      const { itens } = await api().get(`/aulas/${encodeURIComponent(aulaId)}/duvidas`);
      return itens || [];
    },
    async perguntar(aulaId, texto) {
      const { duvida } = await api().post(`/aulas/${encodeURIComponent(aulaId)}/duvidas`, { texto });
      return duvida;
    },
    async responder(duvidaId, texto) {
      const { resposta } = await api().post(`/duvidas/${encodeURIComponent(duvidaId)}/respostas`, { texto });
      return resposta;
    },
    async apagar(duvidaId) {
      await api().del(`/duvidas/${encodeURIComponent(duvidaId)}`);
    },
    async apagarResposta(duvidaId, respostaId) {
      await api().del(`/duvidas/${encodeURIComponent(duvidaId)}/respostas/${encodeURIComponent(respostaId)}`);
    },
    async marcarResolvida(duvidaId, resolvida) {
      await api().put(`/duvidas/${encodeURIComponent(duvidaId)}/resolvida`, { resolvida: !!resolvida });
    },
    /** Fila do painel administrativo — só admin. */
    async pendentes() {
      return api().get('/duvidas/pendentes');
    }
  };
  window.DMC_Duvidas = Duvidas;

  /** Data relativa curta; acima de uma semana vira data absoluta. */
  function formatarQuando(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const seg = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (seg < 60) return 'agora há pouco';
    const min = Math.round(seg / 60);
    if (min < 60) return `há ${min} min`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `há ${hr}h`;
    const dia = Math.round(hr / 24);
    if (dia < 7) return dia === 1 ? 'ontem' : `há ${dia} dias`;
    return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  window.DMC_formatarQuando = formatarQuando;

  // =============================================================
  // AULAS AO VIVO
  // O servidor calcula o status ('agendada' | 'ao-vivo' | 'encerrada')
  // e só manda a URL quando a sala está aberta — o front não recalcula
  // nada disso, senão o relógio do aluno viraria regra de acesso.
  // =============================================================
  const Lives = {
    async listar() {
      const { itens } = await api().get('/lives');
      return itens || [];
    },
    async salvar(live) {
      await api().put(`/lives/${encodeURIComponent(live.id)}`, {
        cursoId: live.cursoId,
        titulo: live.titulo,
        descricao: live.descricao,
        inicioEm: live.inicioEm,
        duracaoMin: live.duracaoMin,
        url: live.url,
        plataforma: live.plataforma
      });
    },
    async apagar(id) {
      await api().del(`/lives/${encodeURIComponent(id)}`);
    }
  };
  window.DMC_Lives = Lives;

  // =============================================================
  // CERTIFICADOS
  // Emissão exige 100% das aulas disponíveis concluídas; a checagem
  // é do servidor. Aqui só perguntamos e mostramos o que falta.
  // =============================================================
  const Certificados = {
    async meus() {
      const { itens } = await api().get('/certificados');
      return itens || [];
    },
    async status(cursoId) {
      return api().get(`/cursos/${encodeURIComponent(cursoId)}/certificado`);
    },
    async emitir(cursoId) {
      const { certificado } = await api().post(`/cursos/${encodeURIComponent(cursoId)}/certificado`);
      return certificado;
    },
    async validar(codigo) {
      return api().get(`/certificados/validar/${encodeURIComponent(codigo)}`);
    }
  };
  window.DMC_Certificados = Certificados;

  /** Data/hora por extenso, curta — usada na agenda das aulas ao vivo. */
  function formatarDataHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).replace(',', ' ·');
  }
  window.DMC_formatarDataHora = formatarDataHora;

  function formatarData(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }
  window.DMC_formatarData = formatarData;

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
      try {
        const { cursoIds } = await api().get('/liberacoes/me');
        (cursoIds || []).forEach(id => _libsUser.add(id));
      } catch (err) {
        console.warn('[DMC] erro liberacoes:', err.message);
      }
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
      const { byEmail } = await api().get('/liberacoes');
      _libsAll = byEmail || {};
      return _libsAll;
    },
    allByEmail() { return _libsAll || {}; },
    async grantByEmail(email, cursoIds) {
      const ids = (Array.isArray(cursoIds) ? cursoIds : [cursoIds]).filter(Boolean);
      if (!ids.length) return;
      await api().post('/liberacoes', { email: email.toLowerCase().trim(), cursoIds: ids });
    },
    async revokeByEmail(email, cursoId) {
      const qs = new URLSearchParams({ email: email.toLowerCase().trim(), cursoId });
      await api().del(`/liberacoes?${qs}`);
    },
    async revokeAllByEmail(email) {
      const qs = new URLSearchParams({ email: email.toLowerCase().trim() });
      await api().del(`/liberacoes?${qs}`);
    }
  };
  window.DMC_Liberacoes = Liberacoes;

  // =============================================================
  // PROGRESSO — cache em memória, write-through pra API
  // =============================================================
  let _progress = new Map(); // aulaId -> completedAt ISO

  const Progress = {
    async init() {
      _progress = new Map();
      if (!_user) return;
      try {
        const { itens } = await api().get('/progresso');
        (itens || []).forEach(r => _progress.set(r.aulaId, r.completedAt));
      } catch (err) {
        console.warn('[DMC] erro progresso:', err.message);
      }
    },
    isDone(aulaId) { return _progress.has(aulaId); },
    async toggle(aulaId) {
      if (!_user) return false;
      const wasDone = _progress.has(aulaId);
      const anterior = _progress.get(aulaId);
      // Atualiza otimista e desfaz se a API recusar.
      if (wasDone) {
        _progress.delete(aulaId);
        try { await api().del(`/progresso/${encodeURIComponent(aulaId)}`); }
        catch (err) { _progress.set(aulaId, anterior); throw err; }
        return false;
      } else {
        _progress.set(aulaId, new Date().toISOString());
        try {
          const { completedAt } = await api().put(`/progresso/${encodeURIComponent(aulaId)}`);
          if (completedAt) _progress.set(aulaId, completedAt);
        } catch (err) { _progress.delete(aulaId); throw err; }
        return true;
      }
    },
    async set(aulaId, done) {
      const isDone = _progress.has(aulaId);
      if (isDone === !!done) return;
      return this.toggle(aulaId);
    },
    // Aula "em breve" fica fora da conta: senão o aluno via 8/12 com
    // quatro aulas que ele nem pode abrir, e o percentual nunca fechava.
    countModulo(modulo) {
      const aulas = (modulo.aulas || []).filter(aulaDisponivel);
      const total = aulas.length;
      const done = aulas.filter(a => _progress.has(a.id)).length;
      return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    },
    countCurso(curso) {
      let total = 0, done = 0;
      (curso.modulos || []).forEach(m => {
        (m.aulas || []).filter(aulaDisponivel).forEach(a => { total++; if (_progress.has(a.id)) done++; });
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
  /** Aula sem o campo (base antiga) conta como disponível. */
  function aulaDisponivel(aula) { return !aula || aula.disponivel !== false; }
  window.DMC_aulaDisponivel = aulaDisponivel;

  function flatAulas(curso) {
    const flat = [];
    curso.modulos.forEach(m => m.aulas.forEach(a => flat.push({ moduloId: m.id, aula: a })));
    return flat;
  }
  // Avançar/voltar salta o que ainda está "em breve": o botão nunca leva
  // o aluno para uma tela bloqueada.
  function nextAula(curso, aulaId) {
    const flat = flatAulas(curso);
    const idx = flat.findIndex(x => x.aula.id === aulaId);
    if (idx < 0) return null;
    for (let i = idx + 1; i < flat.length; i++) if (aulaDisponivel(flat[i].aula)) return flat[i];
    return null;
  }
  function prevAula(curso, aulaId) {
    const flat = flatAulas(curso);
    const idx = flat.findIndex(x => x.aula.id === aulaId);
    if (idx < 0) return null;
    for (let i = idx - 1; i >= 0; i--) if (aulaDisponivel(flat[i].aula)) return flat[i];
    return null;
  }
  window.DMC_Helpers = { findAula, nextAula, prevAula };

  // A API devolve a capa como caminho ("/api/capas/x.jpg"). Em página
  // servida por outra origem (DMC_API_BASE), o <img> precisa da URL cheia.
  function capaSrc(curso) {
    const u = curso && curso.capaUrl;
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    const base = (window.DMC_API_BASE || '').replace(/\/$/, '');
    return base ? base + u.replace(/^\/api/, '') : u;
  }
  window.DMC_capaSrc = capaSrc;

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
    search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>',
    grip: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    playLarge: '<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
    file: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
    imagem: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 20"/></svg>',
    roteiro: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 4l-2 5M14 4l-2 5"/><line x1="7" y1="13" x2="17" y2="13"/><line x1="7" y1="16.5" x2="13" y2="16.5"/></svg>',
    externalLink: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    chat: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.5 8.5 0 0 1 4 11.5a8.38 8.38 0 0 1 8.5-8.4 8.38 8.38 0 0 1 8.5 8.4z"/></svg>',
    send: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    reply: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>',
    menu: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    navConteudos: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10 9 15 12 10 15 10 9" fill="currentColor" stroke="none"/></svg>',
    navMeusCursos: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9.5 2v9l2.5-1.8L14.5 11V2"/></svg>',
    navAoVivo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 16.5a6.4 6.4 0 0 0 0-9"/><path d="M4.5 4.5a10.6 10.6 0 0 0 0 15M19.5 19.5a10.6 10.6 0 0 0 0-15"/></svg>',
    navCertificados: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><polyline points="9 8.8 11.2 11 15 7.2"/><path d="M8.4 14.2L7 22l5-2.4L17 22l-1.4-7.8"/></svg>',
    navLoja: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9 13h6"/></svg>',
    navAdmin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 3.5v6c0 4.6-3.2 8.4-8 9.5-4.8-1.1-8-4.9-8-9.5v-6z"/><circle cx="12" cy="10.5" r="2"/><path d="M8.5 16.5a4 4 0 0 1 7 0"/></svg>',
    calendar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>',
    print: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    award: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><polyline points="9 8.8 11.2 11 15 7.2"/><path d="M8.4 14.2L7 22l5-2.4L17 22l-1.4-7.8"/></svg>'
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
    function clearNotice() {
      if (noticeEl) { noticeEl.textContent = ''; noticeEl.hidden = true; }
    }
    function getMode() { return form.getAttribute('data-auth-mode') === 'signup' ? 'signup' : 'signin'; }

    // Tabs — quem troca o modo é a camada de interface (login-experience.js),
    // que é síncrona e já está no ar quando o usuário clica; aqui só reagimos
    // ao evento limpando as mensagens do modo anterior.
    form.addEventListener('dmc:auth-mode', () => { clearError(); clearNotice(); });

    // Fallback: sem a camada de interface, o formulário ainda precisa nascer
    // coerente com o modo declarado no HTML.
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
      submitBtn.textContent = mode === 'signup' ? 'Criando conta…' : 'Acessando…';
      try {
        if (mode === 'signup') {
          await Auth.signUp(email, senha, nome);
        } else {
          await Auth.signIn(email, senha);
        }
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next');
        const safeNext = next && /^[a-z0-9_-]+\.html(\?.*)?$/i.test(next) ? next : 'dashboard.html';
        // Gancho de transição visual da tela de acesso. Só roda com
        // autenticação já aceita e nunca pode impedir a navegação.
        if (typeof window.DMC_onLoginSuccess === 'function') {
          try { await window.DMC_onLoginSuccess(); }
          catch (errTransicao) { console.warn('[DMC] transição de acesso:', errTransicao); }
        }
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
        const capa = capaSrc(c);
        const modalidade = c.modalidade || 'Online';
        return `
          <article class="course-card ${isSelected ? 'is-selected' : ''} ${liberado ? '' : 'is-locked'}" data-curso-id="${c.id}">
            ${liberado ? '' : `<span class="course-card__lock" title="Curso bloqueado">${I.lock}</span>`}
            ${capa
              ? `<div class="course-card__capa"><img src="${escapeHtml(capa)}" alt="" loading="lazy"></div>`
              : `<div class="course-card__icon">${iconSvg}</div>`}
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
          const numero = `${escapeHtml(m.numero)}.${String(i + 1).padStart(2, '0')}`;
          if (!aulaDisponivel(a)) {
            return `
            <div class="aula is-embreve" data-aula-id="${a.id}" data-modulo-id="${m.id}" title="Aula ainda não liberada">
              <span class="aula__check aula__check--lock">${I.lock}</span>
              <div>
                <div class="aula__title">${escapeHtml(a.titulo)}</div>
                <span class="aula__tag">Em breve</span>
              </div>
              <div class="aula__num">${numero}</div>
              <div class="aula__duracao">${escapeHtml(a.duracao || '')}</div>
            </div>`;
          }
          return `
            <div class="aula ${done ? 'is-done' : ''}" data-aula-id="${a.id}" data-modulo-id="${m.id}">
              <button class="aula__check" data-toggle-aula="${a.id}" aria-label="Marcar concluída">${I.check}</button>
              <div><div class="aula__title">${escapeHtml(a.titulo)}</div></div>
              <div class="aula__num">${numero}</div>
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
        if (aula && !aula.classList.contains('is-embreve')) {
          window.location.href = `aula.html?id=${aula.dataset.aulaId}`;
        }
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

    // Entrou pelo link direto numa aula ainda não liberada: mostra o aviso
    // e para por aqui — o servidor já não mandou vídeo nem material.
    if (!aulaDisponivel(aula)) {
      const proxima = nextAula(curso, aula.id);
      document.querySelector('#player-root').innerHTML = `
        <div class="locked-curso" style="margin:4rem auto;max-width:560px">
          <span class="locked-curso__icon">${I.lock}</span>
          <h3>Aula em breve</h3>
          <p><strong>${escapeHtml(aula.titulo)}</strong> ainda não foi liberada pelo instrutor. Assim que sair, ela aparece no seu painel.</p>
          <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
            <a class="btn-primary" href="dashboard.html" style="display:inline-flex;width:auto">${I.book} Voltar ao painel</a>
            ${proxima ? `<a class="btn-ghost" href="aula.html?id=${proxima.aula.id}">Ir para a próxima aula liberada</a>` : ''}
          </div>
        </div>`;
      return;
    }

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

    renderMateriaisDaAula(aula);
    renderDuvidasDaAula(aula);

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
        const rotulo = `${escapeHtml(m.numero)}.${String(i + 1).padStart(2, '0')} · ${escapeHtml(a.titulo)}`;
        if (!aulaDisponivel(a)) {
          return `
          <div class="aside-aula is-embreve" data-aside-aula="${a.id}" title="Aula ainda não liberada">
            <span class="aside-aula__check">${I.lock}</span>
            <span class="aside-aula__title">${rotulo}</span>
            <span class="aside-aula__dur">Em breve</span>
          </div>`;
        }
        return `
          <div class="aside-aula ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}"
               data-aside-aula="${a.id}" onclick="window.location.href='aula.html?id=${a.id}'">
            <span class="aside-aula__check">${I.check}</span>
            <span class="aside-aula__title">${rotulo}</span>
            <span class="aside-aula__dur">${escapeHtml(a.duracao || '')}</span>
          </div>`;
      }).join('');
      return `<div class="aside-modulo-head">Módulo ${escapeHtml(m.numero)} — ${escapeHtml(m.titulo)}</div>${ativos}`;
    }).join('');
    document.querySelector('[data-curso-titulo]').textContent = curso.titulo;
  }
  window.DMC_bootPlayer = bootPlayer;

  /** Materiais de apoio da aula (PDFs anexados no painel administrativo). */
  function renderMateriaisDaAula(aula) {
    const wrap = document.querySelector('#player-materiais');
    if (!wrap) return;
    const mats = aula.materiais || [];
    if (!mats.length) {
      wrap.innerHTML = '';
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    wrap.innerHTML = `
      <div class="mats-head">
        <span class="overline">Material de apoio</span>
        <span class="mats-count">${mats.length}</span>
      </div>
      <div class="mats-grid">
        ${mats.map(m => `
          <button class="mat-card" type="button" data-material-id="${escapeHtml(m.id)}">
            <span class="mat-card__icon">${I.file}</span>
            <span class="mat-card__body">
              <span class="mat-card__nome">${escapeHtml(m.nome)}</span>
              <span class="mat-card__meta">${m.tipo === 'link' ? 'Link externo' : `PDF · ${formatBytes(m.tamanho)}`}</span>
            </span>
            <span class="mat-card__go">${m.tipo === 'link' ? I.externalLink : I.download}</span>
          </button>`).join('')}
      </div>`;

    wrap.querySelectorAll('[data-material-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const material = mats.find(m => m.id === btn.dataset.materialId);
        btn.classList.add('is-loading');
        btn.disabled = true;
        try { await abrirMaterial(material); }
        catch (err) { alert('Não foi possível abrir o material: ' + err.message); }
        btn.classList.remove('is-loading');
        btn.disabled = false;
      });
    });
  }

  /**
   * Q&A da aula. O aluno pergunta; só admin/instrutor responde — por isso
   * o formulário de resposta e os botões de moderação só são montados
   * quando quem está logado é admin. A lista é redesenhada inteira a cada
   * mudança: são poucas dúvidas por aula e isso evita estado duplicado.
   */
  async function renderDuvidasDaAula(aula) {
    const wrap = document.querySelector('#player-duvidas');
    if (!wrap) return;

    const PERGUNTA_MAX = 2000;
    const RESPOSTA_MAX = 8000;
    const ehAdmin = !!(Auth.user() && Auth.user().isAdmin);
    let itens = [];

    wrap.innerHTML = `
      <div class="duvidas__head">
        <span class="duvidas__head-icon">${I.chat}</span>
        <span class="overline">Dúvidas desta aula</span>
        <span class="mats-count" data-duvidas-total>—</span>
      </div>
      <p class="duvidas__nota">${ehAdmin
        ? 'Você responde como <strong>instrutor</strong>. Suas respostas ficam visíveis para todos os alunos com acesso a este curso.'
        : 'Escreva sua dúvida sobre esta aula. O instrutor responde por aqui, e a resposta fica visível para toda a turma.'}</p>

      <form class="duvida-form" data-duvida-form>
        <textarea class="input" data-duvida-texto rows="3" maxlength="${PERGUNTA_MAX}"
          placeholder="${ehAdmin ? 'Publicar uma pergunta frequente desta aula…' : 'Qual é a sua dúvida sobre esta aula?'}"></textarea>
        <div class="duvida-form__foot">
          <span class="duvida-form__count" data-duvida-chars>0 / ${PERGUNTA_MAX}</span>
          <button class="btn-primary" type="submit" style="width:auto;margin-top:0;gap:0.5rem">${I.send} Enviar dúvida</button>
        </div>
      </form>

      <div class="duvidas__list" data-duvidas-list>
        <p class="duvidas__vazio">Carregando dúvidas…</p>
      </div>`;

    const form = wrap.querySelector('[data-duvida-form]');
    const campo = wrap.querySelector('[data-duvida-texto]');
    const chars = wrap.querySelector('[data-duvida-chars]');
    const lista = wrap.querySelector('[data-duvidas-list]');
    const total = wrap.querySelector('[data-duvidas-total]');

    campo.addEventListener('input', () => {
      chars.textContent = `${campo.value.length} / ${PERGUNTA_MAX}`;
    });
    // Ctrl/Cmd+Enter envia sem tirar a mão do teclado.
    campo.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit();
    });

    function htmlResposta(duvidaId, r) {
      return `
        <div class="resposta" data-resposta="${escapeHtml(r.id)}">
          <span class="resposta__avatar">${escapeHtml(r.autorIniciais)}</span>
          <div class="resposta__body">
            <div class="resposta__ident">
              <span class="resposta__autor">${escapeHtml(r.autorNome)}</span>
              <span class="tag-instrutor">Instrutor</span>
              <span class="duvida__quando">${escapeHtml(formatarQuando(r.createdAt))}</span>
            </div>
            <p class="resposta__texto">${escapeHtml(r.texto)}</p>
          </div>
          ${ehAdmin ? `<button class="duvida__acao danger" type="button" title="Apagar resposta"
                        data-apagar-resposta="${escapeHtml(r.id)}" data-duvida-id="${escapeHtml(duvidaId)}">${I.trash}</button>` : ''}
        </div>`;
    }

    function htmlDuvida(d) {
      const respondida = d.respostas.length > 0;
      const podeApagar = ehAdmin || d.minha;
      return `
        <article class="duvida ${respondida ? 'is-respondida' : ''}" data-duvida="${escapeHtml(d.id)}">
          <div class="duvida__head">
            <span class="duvida__avatar">${escapeHtml(d.autorIniciais)}</span>
            <div class="duvida__ident">
              <span class="duvida__autor">${escapeHtml(d.autorNome)}${d.minha ? ' <span class="tag-voce">você</span>' : ''}</span>
              <span class="duvida__quando">${escapeHtml(formatarQuando(d.createdAt))}</span>
            </div>
            <span class="duvida__badge ${respondida ? 'is-ok' : 'is-open'}">
              ${respondida ? `${I.check} Respondida` : 'Aguardando resposta'}
            </span>
            ${podeApagar ? `<button class="duvida__acao danger" type="button" title="Apagar dúvida"
                             data-apagar="${escapeHtml(d.id)}">${I.trash}</button>` : ''}
          </div>

          <p class="duvida__texto">${escapeHtml(d.texto)}</p>

          ${d.respostas.length ? `<div class="duvida__respostas">${d.respostas.map(r => htmlResposta(d.id, r)).join('')}</div>` : ''}

          ${ehAdmin ? `
            <form class="resposta-form" data-responder="${escapeHtml(d.id)}">
              <textarea class="input" rows="2" maxlength="${RESPOSTA_MAX}" placeholder="Responder como instrutor…"></textarea>
              <button class="btn-ghost" type="submit" style="gap:0.5rem">${I.reply} Responder</button>
            </form>` : ''}
        </article>`;
    }

    function pintar() {
      total.textContent = itens.length;
      if (!itens.length) {
        lista.innerHTML = `<p class="duvidas__vazio">Nenhuma dúvida por aqui ainda. Seja o primeiro a perguntar.</p>`;
        return;
      }
      lista.innerHTML = itens.map(htmlDuvida).join('');
    }

    // ---- carga inicial
    try {
      itens = await Duvidas.listar(aula.id);
      pintar();
    } catch (err) {
      lista.innerHTML = `<p class="duvidas__vazio">Não foi possível carregar as dúvidas: ${escapeHtml(err.message)}</p>`;
    }

    // ---- nova pergunta
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const texto = campo.value.trim();
      if (texto.length < 3) { campo.focus(); return; }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const nova = await Duvidas.perguntar(aula.id, texto);
        itens.unshift(nova);
        campo.value = '';
        chars.textContent = `0 / ${PERGUNTA_MAX}`;
        pintar();
      } catch (err) {
        alert('Não foi possível enviar: ' + err.message);
      }
      btn.disabled = false;
    });

    // ---- resposta do instrutor (delegação: a lista é redesenhada inteira)
    lista.addEventListener('submit', async e => {
      const alvo = e.target.closest('[data-responder]');
      if (!alvo) return;
      e.preventDefault();
      const duvidaId = alvo.dataset.responder;
      const area = alvo.querySelector('textarea');
      const texto = area.value.trim();
      if (texto.length < 2) { area.focus(); return; }
      const btn = alvo.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const resposta = await Duvidas.responder(duvidaId, texto);
        const d = itens.find(x => x.id === duvidaId);
        if (d) { d.respostas.push(resposta); d.resolvida = true; }
        pintar();
      } catch (err) {
        alert('Não foi possível responder: ' + err.message);
        btn.disabled = false;
      }
    });

    // ---- exclusões
    lista.addEventListener('click', async e => {
      const btnDuvida = e.target.closest('[data-apagar]');
      if (btnDuvida) {
        if (!confirm('Apagar esta dúvida? As respostas também serão removidas.')) return;
        btnDuvida.disabled = true;
        try {
          await Duvidas.apagar(btnDuvida.dataset.apagar);
          itens = itens.filter(x => x.id !== btnDuvida.dataset.apagar);
          pintar();
        } catch (err) {
          alert('Não foi possível apagar: ' + err.message);
          btnDuvida.disabled = false;
        }
        return;
      }

      const btnResposta = e.target.closest('[data-apagar-resposta]');
      if (btnResposta) {
        if (!confirm('Apagar esta resposta?')) return;
        const { apagarResposta, duvidaId } = btnResposta.dataset;
        btnResposta.disabled = true;
        try {
          await Duvidas.apagarResposta(duvidaId, apagarResposta);
          const d = itens.find(x => x.id === duvidaId);
          if (d) {
            d.respostas = d.respostas.filter(r => r.id !== apagarResposta);
            d.resolvida = d.respostas.length > 0;
          }
          pintar();
        } catch (err) {
          alert('Não foi possível apagar: ' + err.message);
          btnResposta.disabled = false;
        }
      }
    });
  }

  // =============================================================
  // MEUS CURSOS (só os liberados, com progresso)
  // =============================================================
  async function bootMeusCursos() {
    await DMC_init();
    if (!Auth.requireOrRedirect()) return;
    bindHeader();

    const lista = document.querySelector('#meus-cursos-lista');
    if (!lista) return;

    const meus = (Data.get().cursos || []).filter(c => Liberacoes.has(c.id));

    if (!meus.length) {
      lista.innerHTML = `
        <div class="estado-vazio">
          <span class="estado-vazio__icon">${I.navMeusCursos}</span>
          <h3>Você ainda não tem cursos liberados</h3>
          <p>Assim que adquirir um programa, ele aparece aqui com a trilha completa e o seu progresso.</p>
          <a class="btn-primary" href="loja.html" style="display:inline-flex;width:auto">${I.cart} Conhecer os programas</a>
        </div>`;
      return;
    }

    lista.innerHTML = meus.map(c => {
      const p = Progress.countCurso(c);
      const totalAulas = (c.modulos || []).reduce((s, m) => s + (m.aulas || []).length, 0);
      const capa = capaSrc(c);
      const concluido = p.total > 0 && p.done >= p.total;
      const rotulo = concluido ? 'Revisar curso' : (p.done > 0 ? 'Continuar de onde parei' : 'Começar o curso');
      return `
        <article class="meu-curso" data-curso="${escapeHtml(c.id)}">
          <div class="meu-curso__capa">
            ${capa
              ? `<img src="${escapeHtml(capa)}" alt="" loading="lazy">`
              : `<span class="meu-curso__icone">${COURSE_ICONS[c.iconeKey] || COURSE_ICONS.graduation}</span>`}
            ${concluido ? `<span class="meu-curso__selo">${I.check} Concluído</span>` : ''}
          </div>
          <div class="meu-curso__corpo">
            <h3>${escapeHtml(c.titulo)}</h3>
            <p>${escapeHtml(c.subtitulo || c.descricao || '')}</p>
            <div class="meu-curso__meta">
              <span>${I.clock} ${escapeHtml(c.cargaHoraria || '—')}</span>
              <span>${(c.modulos || []).length} módulos · ${totalAulas} aulas</span>
            </div>
            <div class="meu-curso__progresso">
              <div class="progress-bar"><div class="progress-bar__fill" style="width:${p.pct}%"></div></div>
              <span class="meu-curso__pct">${p.done}/${p.total} aulas · ${p.pct}%</span>
            </div>
            <div class="meu-curso__acoes">
              <button class="btn-primary" type="button" data-continuar="${escapeHtml(c.id)}" style="width:auto;margin-top:0">${rotulo}</button>
              ${concluido ? `<a class="btn-ghost" href="certificados.html">${I.navCertificados} Certificado</a>` : ''}
            </div>
          </div>
        </article>`;
    }).join('');

    lista.addEventListener('click', e => {
      const btn = e.target.closest('[data-continuar]');
      if (!btn) return;
      const curso = meus.find(c => c.id === btn.dataset.continuar);
      Data.setCursoEscolhido(curso.id);
      // Retoma na primeira aula disponível ainda não concluída.
      const pendente = flatAulas(curso).filter(aulaDisponivel).find(a => !Progress.isDone(a.id));
      window.location.href = pendente ? `aula.html?id=${encodeURIComponent(pendente.id)}` : 'dashboard.html';
    });
  }
  window.DMC_bootMeusCursos = bootMeusCursos;

  // =============================================================
  // AULAS AO VIVO
  // =============================================================
  async function bootAoVivo() {
    await DMC_init();
    if (!Auth.requireOrRedirect()) return;
    bindHeader();

    const lista = document.querySelector('#lives-lista');
    if (!lista) return;
    lista.innerHTML = '<p class="lista-carregando">Carregando agenda…</p>';

    let itens;
    try {
      itens = await Lives.listar();
    } catch (err) {
      lista.innerHTML = `<div class="estado-vazio"><h3>Não foi possível carregar a agenda</h3><p>${escapeHtml(err.message)}</p></div>`;
      return;
    }

    if (!itens.length) {
      lista.innerHTML = `
        <div class="estado-vazio">
          <span class="estado-vazio__icon">${I.navAoVivo}</span>
          <h3>Nenhum encontro ao vivo agendado</h3>
          <p>Quando um encontro for marcado para algum curso seu, ele aparece aqui com data, horário e o link da sala.</p>
        </div>`;
      return;
    }

    const grupos = [
      { chave: 'ao-vivo',   titulo: 'Acontecendo agora',   itens: itens.filter(l => l.status === 'ao-vivo') },
      { chave: 'agendada',  titulo: 'Próximos encontros',  itens: itens.filter(l => l.status === 'agendada') },
      // Encerradas em ordem inversa: a última que aconteceu vem primeiro.
      { chave: 'encerrada', titulo: 'Encontros anteriores', itens: itens.filter(l => l.status === 'encerrada').reverse() }
    ].filter(g => g.itens.length);

    lista.innerHTML = grupos.map(g => `
      <section class="lives-grupo">
        <div class="lives-grupo__head">
          <span class="overline">${escapeHtml(g.titulo)}</span>
          <span class="mats-count">${g.itens.length}</span>
        </div>
        ${g.itens.map(l => cardLive(l)).join('')}
      </section>`).join('');

    function cardLive(l) {
      const aoVivo = l.status === 'ao-vivo';
      const encerrada = l.status === 'encerrada';
      return `
        <article class="live-card is-${escapeHtml(l.status)}">
          <div class="live-card__quando">
            <span class="live-card__data">${escapeHtml(formatarDataHora(l.inicioEm))}</span>
            <span class="live-card__dur">${I.clock} ${l.duracaoMin} min</span>
          </div>
          <div class="live-card__corpo">
            <span class="live-card__curso">${escapeHtml(l.cursoTitulo)}</span>
            <h3>${escapeHtml(l.titulo)}</h3>
            ${l.descricao ? `<p>${escapeHtml(l.descricao)}</p>` : ''}
            <span class="live-card__plataforma">${escapeHtml(l.plataforma)}</span>
          </div>
          <div class="live-card__acao">
            ${aoVivo ? '<span class="live-badge is-live"><i></i> Ao vivo</span>' : ''}
            ${encerrada ? '<span class="live-badge is-off">Encerrada</span>' : ''}
            ${l.url && !encerrada
              ? `<a class="btn-primary" href="${escapeHtml(l.url)}" target="_blank" rel="noopener" style="width:auto;margin-top:0">${I.externalLink} Entrar na sala</a>`
              : (encerrada ? '' : `<span class="live-card__espera">Sala abre 15 min antes</span>`)}
          </div>
        </article>`;
    }
  }
  window.DMC_bootAoVivo = bootAoVivo;

  // =============================================================
  // CERTIFICADOS (área do aluno)
  // =============================================================
  async function bootCertificados() {
    await DMC_init();
    if (!Auth.requireOrRedirect()) return;
    bindHeader();

    const lista = document.querySelector('#certificados-lista');
    if (!lista) return;
    lista.innerHTML = '<p class="lista-carregando">Carregando certificados…</p>';

    const meus = (Data.get().cursos || []).filter(c => Liberacoes.has(c.id));
    if (!meus.length) {
      lista.innerHTML = `
        <div class="estado-vazio">
          <span class="estado-vazio__icon">${I.navCertificados}</span>
          <h3>Nenhum curso para certificar ainda</h3>
          <p>Os certificados aparecem aqui conforme você conclui os cursos que adquirir.</p>
          <a class="btn-primary" href="loja.html" style="display:inline-flex;width:auto">${I.cart} Conhecer os programas</a>
        </div>`;
      return;
    }

    let emitidos = [];
    try { emitidos = await Certificados.meus(); }
    catch (err) { console.warn('[DMC] erro certificados:', err.message); }
    const porCurso = new Map(emitidos.map(c => [c.cursoId, c]));

    function pintar() {
      lista.innerHTML = meus.map(c => {
        const cert = porCurso.get(c.id);
        const p = Progress.countCurso(c);
        if (cert) {
          return `
            <article class="cert-card is-emitido">
              <span class="cert-card__medalha">${I.award}</span>
              <div class="cert-card__corpo">
                <span class="overline">Certificado emitido</span>
                <h3>${escapeHtml(cert.tituloCurso || c.titulo)}</h3>
                <p class="cert-card__linha">Concluído em ${escapeHtml(formatarData(cert.emitidoEm))}${cert.cargaHoraria ? ` · ${escapeHtml(cert.cargaHoraria)}` : ''}</p>
                <p class="cert-card__codigo">Código de validação <code>${escapeHtml(cert.codigo)}</code></p>
              </div>
              <div class="cert-card__acoes">
                <a class="btn-primary" href="certificado.html?codigo=${encodeURIComponent(cert.codigo)}" target="_blank" rel="noopener" style="width:auto;margin-top:0">${I.print} Ver e imprimir</a>
              </div>
            </article>`;
        }
        const completo = p.total > 0 && p.done >= p.total;
        return `
          <article class="cert-card ${completo ? 'is-pronto' : ''}">
            <span class="cert-card__medalha">${I.award}</span>
            <div class="cert-card__corpo">
              <span class="overline">${completo ? 'Pronto para emitir' : 'Em andamento'}</span>
              <h3>${escapeHtml(c.titulo)}</h3>
              <div class="cert-card__progresso">
                <div class="progress-bar"><div class="progress-bar__fill" style="width:${p.pct}%"></div></div>
                <span>${p.done}/${p.total} aulas · ${p.pct}%</span>
              </div>
              ${completo
                ? '<p class="cert-card__linha">Você concluiu todas as aulas disponíveis deste curso.</p>'
                : `<p class="cert-card__linha">Faltam ${p.total - p.done} aula${p.total - p.done === 1 ? '' : 's'} para liberar a emissão.</p>`}
            </div>
            <div class="cert-card__acoes">
              <button class="btn-primary" type="button" data-emitir="${escapeHtml(c.id)}"
                      ${completo ? '' : 'disabled'} style="width:auto;margin-top:0">${I.navCertificados} Emitir certificado</button>
              ${completo ? '' : `<a class="btn-ghost" href="meus-cursos.html">Continuar curso</a>`}
            </div>
          </article>`;
      }).join('');
    }
    pintar();

    lista.addEventListener('click', async e => {
      const btn = e.target.closest('[data-emitir]');
      if (!btn) return;
      btn.disabled = true;
      try {
        const cert = await Certificados.emitir(btn.dataset.emitir);
        porCurso.set(cert.cursoId, cert);
        pintar();
      } catch (err) {
        alert('Não foi possível emitir: ' + err.message);
        btn.disabled = false;
      }
    });
  }
  window.DMC_bootCertificados = bootCertificados;

  // =============================================================
  // CERTIFICADO — página pública de validação e impressão
  // Não exige sessão: é o link que o aluno manda pra terceiros.
  // =============================================================
  async function bootCertificadoPublico() {
    const raiz = document.querySelector('#cert-root');
    if (!raiz) return;

    const codigo = (new URLSearchParams(window.location.search).get('codigo') || '').trim();
    if (!codigo) {
      raiz.innerHTML = renderInvalido('Informe o código do certificado no endereço, no formato <code>?codigo=DMC-XXXX-XXXX</code>.');
      return;
    }

    let dados;
    try {
      dados = await Certificados.validar(codigo);
    } catch (err) {
      raiz.innerHTML = renderInvalido(`Nenhum certificado corresponde ao código <strong>${escapeHtml(codigo)}</strong>. Confira se ele foi digitado corretamente.`);
      return;
    }

    const c = dados.certificado;
    raiz.innerHTML = `
      <div class="cert-toolbar">
        <span class="cert-toolbar__ok">${I.check} Certificado autêntico</span>
        <button class="btn-primary" type="button" id="btn-imprimir" style="width:auto;margin-top:0">${I.print} Imprimir / salvar PDF</button>
      </div>

      <article class="cert-doc">
        <header class="cert-doc__head">
          <img class="cert-doc__logo" src="../assets/images/RINO_logo.png" alt="Complexo DMC">
          <span class="cert-doc__marca">Complexo DMC</span>
        </header>

        <span class="cert-doc__overline">Certificado de conclusão</span>
        <p class="cert-doc__intro">Certificamos que</p>
        <h1 class="cert-doc__nome">${escapeHtml(c.nomeAluno)}</h1>
        <p class="cert-doc__texto">
          concluiu integralmente o programa de formação
          <strong>${escapeHtml(c.tituloCurso)}</strong>${c.cargaHoraria ? `, com carga horária de ${escapeHtml(c.cargaHoraria)}` : ''},
          cumprindo todas as aulas e atividades previstas na trilha.
        </p>

        <footer class="cert-doc__foot">
          <div class="cert-doc__campo">
            <span class="cert-doc__valor">${escapeHtml(formatarData(c.emitidoEm))}</span>
            <span class="cert-doc__rotulo">Data de emissão</span>
          </div>
          <div class="cert-doc__campo">
            <span class="cert-doc__valor cert-doc__codigo">${escapeHtml(c.codigo)}</span>
            <span class="cert-doc__rotulo">Código de validação</span>
          </div>
        </footer>

        <p class="cert-doc__nota">
          A autenticidade deste certificado pode ser verificada em
          <strong>complexodmc.com.br/plataforma-ead/certificado.html?codigo=${escapeHtml(c.codigo)}</strong>
        </p>
      </article>`;

    document.querySelector('#btn-imprimir').addEventListener('click', () => window.print());

    function renderInvalido(msg) {
      return `
        <div class="estado-vazio cert-invalido">
          <span class="estado-vazio__icon">${I.close}</span>
          <h3>Certificado não localizado</h3>
          <p>${msg}</p>
        </div>`;
    }
  }
  window.DMC_bootCertificadoPublico = bootCertificadoPublico;

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
        const capa = capaSrc(c);
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
              ${capa
                ? `<div class="loja-card__capa"><img src="${escapeHtml(capa)}" alt="" loading="lazy"></div>`
                : `<div class="loja-card__icon">${iconSvg}</div>`}
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
  // pelo admin no painel, após confirmação de pagamento.
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
          await api().post('/liberacoes/dev/simular-pagamento', { cursoIds });
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
    // Páginas do aluno declaram <body data-shell="chave">; o shell monta a
    // barra e o menu antes daqui, então os [data-user-*] abaixo já existem.
    if (document.body.dataset.shell && window.DMC_Shell) {
      window.DMC_Shell.montar(document.body.dataset.shell);
    }
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
