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
  // Após DMC_init(), Auth.user() retorna { id, email, nome, iniciais, isAdmin,
  // papel, … } ou null. Contrato: docs/dmc/PORTAL-ACADEMICO.md §7.2 (as
  // assinaturas que a sessão 2d usa não mudam; o resto é acréscimo).
  // =============================================================
  let _user = null;
  let _sessaoPromise = null;   // última validação da sessão (Auth.init); o DMC_init reaproveita
  let _recursosPromise = null;

  const NEXT_RE = /^[a-z0-9_-]+\.html(\?.*)?$/i; // a mesma regra do login da 2d
  const PAPEIS = ['aluno', 'professor', 'admin'];
  const DESTINO_RESTRITO = 'perfil.html#seguranca';
  const CHAVE_AVISO = 'dmc:aviso';
  const MSG_SEGUNDO_FATOR = 'Digite o código do aplicativo autenticador.';

  /** papelDe() do servidor (§5.1): isAdmin manda; professor só com papel gravado; o resto é aluno. */
  function papelDe(user) {
    if (!user) return null;
    if (user.isAdmin === true) return 'admin';
    return user.papel === 'professor' ? 'professor' : 'aluno';
  }
  /** user() só GANHA campos: `papel` sempre presente (servidor antigo → derivado de isAdmin). */
  function normalizarUser(user) {
    if (!user || typeof user !== 'object') return null;
    return Object.assign({}, user, { papel: papelDe(user) });
  }
  function validarNext(s) {
    return typeof s === 'string' && NEXT_RE.test(s) ? s : '';
  }
  /** Nome do arquivo da página atual (/plataforma-ead/dashboard → dashboard.html). */
  function paginaAtual() {
    let seg = String(window.location.pathname || '').split('/').pop() || '';
    try { seg = decodeURIComponent(seg); } catch { /* fica cru */ }
    if (seg && !/\.[a-z0-9]+$/i.test(seg)) seg += '.html';
    return seg;
  }
  function urlDeLogin() {
    const next = validarNext(paginaAtual() + (window.location.search || ''));
    return next ? `login.html?next=${encodeURIComponent(next)}` : 'login.html';
  }
  function gravarAviso(texto) {
    try { window.sessionStorage.setItem(CHAVE_AVISO, texto); } catch { /* sem storage: só não há aviso */ }
  }
  function estaRestrito() {
    return !!(_user && _user.precisaTrocarSenha === true);
  }
  /**
   * Modo restrito nas páginas legadas (D-63): com senha temporária, leva a
   * perfil.html#seguranca sem desenhar nada. Em perfil.html não redireciona (sem laço).
   */
  function desviarSeRestrito() {
    if (!estaRestrito()) return false;
    if (paginaAtual() === 'perfil.html') return false;
    window.location.replace(DESTINO_RESTRITO);
    return true;
  }
  /** E-mail como veio (aparado); CPF com ou sem máscara vira só os 11 dígitos (o servidor reconhece). */
  function normalizarIdentificador(valor) {
    const s = String(valor == null ? '' : valor).trim();
    const digitos = s.replace(/[.\-\s]/g, '');
    return /^\d{11}$/.test(digitos) ? digitos : s;
  }
  function erroSegundoFator(dados) {
    const err = new Error(MSG_SEGUNDO_FATOR);
    err.codigo = 'segundo-fator';
    err.desafio = dados.desafio;
    err.dados = { segundoFator: true, desafio: dados.desafio, expiraEm: dados.expiraEm, metodos: dados.metodos };
    return err;
  }
  /** Grava a sessão de uma resposta de login; com 2FA ativo REJEITA sem gravar token (API §10.4). */
  function gravarSessao(dados) {
    if (dados && dados.segundoFator === true) throw erroSegundoFator(dados);
    api().setToken(dados && dados.token);
    _user = normalizarUser(dados && dados.user);
    return dados;
  }

  const Auth = {
    NEXT_RE,
    init() {
      _user = null;
      const p = (async () => {
        if (!api().token()) return null;
        try {
          const { user } = await api().get('/auth/me');
          _user = normalizarUser(user);
        } catch {
          // token expirado/inválido — o cliente já limpou o storage no 401
          _user = null;
        }
        return _user;
      })();
      _sessaoPromise = p;
      return p;
    },
    isLogged() { return !!_user; },
    user() { return _user; },
    async signIn(identificador, senha) {
      const dados = await api().post('/auth/signin', { email: normalizarIdentificador(identificador), senha });
      return gravarSessao(dados);
    },
    async signUp(email, senha, nome) {
      const dados = await api().post('/auth/signup', {
        email: email.trim(),
        senha,
        nome: (nome || '').trim()
      });
      // A API já devolve a sessão pronta — sem etapa de confirmação por e-mail.
      api().setToken(dados.token);
      _user = normalizarUser(dados.user);
      return { ...dados, session: dados.token ? { token: dados.token } : null };
    },
    async signOut() {
      api().setToken(null);
      _user = null;
    },
    /** Sem sessão: `to` ou login.html?next=<página atual validada> (corrige o antigo app.js:56). */
    requireOrRedirect(to) {
      if (!this.isLogged()) { window.location.href = to == null ? urlDeLogin() : to; return false; }
      return true;
    },
    requireAdminOrRedirect(to = 'dashboard.html') {
      if (!this.requireOrRedirect()) return false;
      if (!_user.isAdmin) { window.location.href = to; return false; }
      return true;
    },

    // ---------------- acréscimos (F0b, fase 0) ----------------
    validarNext,
    papel() { return papelDe(_user); },
    /** admin satisfaz qualquer papel. Aceita lista ou argumentos soltos. */
    temPapel(...papeis) {
      const p = papelDe(_user);
      if (!p) return false;
      if (p === 'admin') return true;
      return papeis.flat().indexOf(p) >= 0;
    },
    destinoInicial() {
      const p = papelDe(_user);
      if (p === 'professor') return 'professor.html';
      if (p === 'admin') return 'admin.html';
      return 'dashboard.html';
    },
    /** Professor ou admin; aluno vai a `to` com o aviso "Área restrita à equipe." (§5.4). */
    requireProfessorOrRedirect(to = 'dashboard.html') {
      if (!this.requireOrRedirect()) return false;
      if (!this.temPapel('professor')) {
        gravarAviso('Área restrita à equipe.');
        window.location.href = to;
        return false;
      }
      return true;
    },
    /** O que o servidor oferece (API §6.1); rota ausente (404) = nada disponível. */
    recursos() {
      if (!_recursosPromise) {
        _recursosPromise = api().get('/auth/recursos', { silencioso404: true }).then((r) => {
          const b = r && typeof r === 'object' ? r : {};
          return {
            loginPorCpf: b.loginPorCpf === true,
            linkMagico: b.linkMagico === true,
            recuperacaoSenha: b.recuperacaoSenha === true,
            doisFatores: b.doisFatores === true,
            senhaTemporariaPelaCoordenacao: b.senhaTemporariaPelaCoordenacao === true
          };
        });
        _recursosPromise.catch(() => { _recursosPromise = null; });
      }
      return _recursosPromise;
    },
    /** Segundo passo do login com 2FA: grava a sessão. Código de 6 dígitos ou 'XXXX-XXXX'. */
    async verificar2fa(desafio, codigo) {
      const dados = await api().post('/auth/2fa/verificar', { desafio, codigo: String(codigo == null ? '' : codigo).trim() });
      gravarSessao(dados);
      return dados;
    },
    async pedirLinkMagico(email) {
      return api().post('/auth/link-magico', { email: String(email == null ? '' : email).trim() });
    },
    /** Pode rejeitar 'segundo-fator' (o link não dispensa o 2FA) ou 'link-invalido'. */
    async consumirLinkMagico(token) {
      const dados = await api().post('/auth/link-magico/consumir', { token });
      return gravarSessao(dados);
    },
    async esqueciSenha(email) {
      return api().post('/auth/senha/esqueci', { email: String(email == null ? '' : email).trim() });
    },
    /** Não loga: a tela leva ao login (para não pular o 2FA). */
    async redefinirSenha(token, novaSenha) {
      return api().post('/auth/senha/redefinir', { token, novaSenha });
    },
    /** Regrava o token devolvido (as outras sessões caem) e sai do modo restrito. */
    async trocarSenha(senhaAtual, novaSenha) {
      const dados = await api().post('/auth/senha/trocar', { senhaAtual, novaSenha });
      if (dados && dados.token) api().setToken(dados.token);
      if (_user) _user = Object.assign({}, _user, { precisaTrocarSenha: false });
      return dados;
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
        roteiro: typeof aula.roteiro === 'string' ? aula.roteiro : undefined,
        // Rótulo do encontro ("Sexta · noite", API §6.13): mesmo cuidado do roteiro —
        // só vai quando a tela o carregou (undefined some do JSON).
        rotuloEncontro: typeof aula.rotuloEncontro === 'string' ? aula.rotuloEncontro : undefined
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
    /** PUT legado do material com só os campos informados ({ nome?, categoria? }, API §6.13). */
    async atualizarMaterial(aulaId, materialId, campos) {
      const c = campos || {};
      const corpo = {};
      if (typeof c.nome === 'string') corpo.nome = c.nome;
      if (typeof c.categoria === 'string') corpo.categoria = c.categoria;
      return api().put(
        `/aulas/${encodeURIComponent(aulaId)}/materiais/${encodeURIComponent(materialId)}`,
        corpo
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
      // Professor docente: o catálogo marca `liberado:true` no curso que ele leciona
      // (API §7.1); nada confia em isAdmin para professor.
      const curso = Data.getCursoById(cursoId);
      if (curso && curso.liberado === true) return true;
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
  // DMC_init()                    = sessão + catálogo + liberações + progresso (como sempre)
  // DMC_init({ catalogo: false }) = só valida a sessão
  // Memo por parte: uma 2ª chamada com catálogo carrega só o que falta.
  // MODO RESTRITO (D-63): com user().precisaTrocarSenha, não chama /api/catalogo,
  // /api/liberacoes/me nem /api/progresso e RESOLVE sem rejeitar (nunca redireciona:
  // o login da 2d também usa esta função; quem desvia é o DMC_Portal ou o boot legado).
  let _catalogoPromise = null;
  async function DMC_init(opcoes) {
    const comCatalogo = !(opcoes && opcoes.catalogo === false);
    await (_sessaoPromise || Auth.init());
    // Data é leitura autenticada — só carrega se logado e fora do modo restrito
    if (!comCatalogo || !_user || estaRestrito()) return;
    if (!_catalogoPromise) {
      _catalogoPromise = Promise.all([Data.init(), Liberacoes.init(), Progress.init()]).then(() => undefined);
      _catalogoPromise.catch(() => { _catalogoPromise = null; });
    }
    await _catalogoPromise;
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
  // SVG próprio (UX §4.12): viewBox 24, traço 1,5, pontas e junções redondas,
  // currentColor, sem preenchimento (exceto ponto e triângulo de play). Os ícones
  // legados mantêm o nome e o tamanho; os novos nascem com 20 px (o CSS ajusta).
  const ic = (corpo, tam = 20) => `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${corpo}</svg>`;
  const PONTO = (cx, cy, r = 0.9) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;
  const FOLHA = '<path d="M14 3H6.5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V7.5z"/><path d="M14 3v4.5h4.5"/>';
  const BALAO = '<path d="M4 5h16v11H9.5L4 20z"/>';
  const I = {
    // ---- legados (nomes e tamanhos de sempre, redesenhados no traço 1,5) ----
    check: ic('<path d="m4.5 12.5 4.5 4.5 10.5-10.5"/>', 12),
    chevronDown: ic('<path d="m6 9 6 6 6-6"/>', 14),
    chevronLeft: ic('<path d="m15 18-6-6 6-6"/>', 14),
    chevronRight: ic('<path d="m9 18 6-6-6-6"/>', 14),
    chevronUp: ic('<path d="m18 15-6-6-6 6"/>', 12),
    chevronDownSmall: ic('<path d="m6 9 6 6 6-6"/>', 12),
    play: ic('<path d="M7.5 5v14l11-7z" fill="currentColor" stroke="none"/>', 14),
    clock: ic('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 14),
    book: ic('<path d="M12 6.5C9.8 5 7 4.6 3.5 5v13.5c3.5-.4 6.3 0 8.5 1.5 2.2-1.5 5-1.9 8.5-1.5V5c-3.5-.4-6.3 0-8.5 1.5z"/><path d="M12 6.5V20"/>', 14),
    plus: ic('<path d="M12 5v14M5 12h14"/>', 14),
    trash: ic('<path d="M4 6.5h16"/><path d="M9.5 6.5V4h5v2.5"/><path d="M6.5 6.5 7.5 20h9l1-13.5"/><path d="M10.5 10.5v6M13.5 10.5v6"/>', 14),
    download: ic('<path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M4.5 19.5h15"/>', 14),
    upload: ic('<path d="M12 15.5v-11"/><path d="m7 9 5-5 5 5"/><path d="M4.5 19.5h15"/>', 14),
    refresh: ic('<path d="M19.5 5v4.5H15"/><path d="M4.5 19v-4.5H9"/><path d="M5.5 9.5a7 7 0 0 1 12.6-1.8l1.4 1.8M18.5 14.5a7 7 0 0 1-12.6 1.8L4.5 14.5"/>', 14),
    cart: ic('<circle cx="9" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/><path d="M2.5 3.5h3l2.4 11.2a1.5 1.5 0 0 0 1.5 1.3h8.4a1.5 1.5 0 0 0 1.5-1.2l1.4-7.3H6.5"/>', 16),
    lock: ic('<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 14),
    unlock: ic('<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 7.8-1.2"/>', 14),
    sparkle: ic('<path d="M12 3.5 13.6 10.4 20.5 12 13.6 13.6 12 20.5 10.4 13.6 3.5 12 10.4 10.4z"/>', 14),
    close: ic('<path d="M6 6l12 12M18 6 6 18"/>', 14),
    search: ic('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', 14),
    grip: ic(PONTO(9, 6, 1.4) + PONTO(15, 6, 1.4) + PONTO(9, 12, 1.4) + PONTO(15, 12, 1.4) + PONTO(9, 18, 1.4) + PONTO(15, 18, 1.4), 12),
    playLarge: ic('<path d="M7.5 5v14l11-7z" fill="currentColor" stroke="none"/>', 40),
    file: ic(FOLHA + '<path d="M9 13h6M9 16.5h4"/>', 16),
    imagem: ic('<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 15-5-5-11 9.5"/>', 16),
    roteiro: ic('<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9h17M8 4.5 6 9M14 4.5 12 9M7.5 13h9M7.5 16.5h5"/>', 16),
    externalLink: ic('<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', 14),
    chat: ic(BALAO, 16),
    send: ic('<path d="M21 3 10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5-7.5-4z"/>', 14),
    reply: ic('<path d="M9.5 17 4.5 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4.5"/>', 14),
    menu: ic('<path d="M4 7h16M4 12h16M4 17h16"/>', 18),
    navConteudos: ic('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.3-2.5z" fill="currentColor" stroke="none"/>', 18),
    navCertificados: ic('<circle cx="12" cy="9" r="5.5"/><path d="m9.6 9 1.7 1.7 3.1-3.2"/><path d="m8.7 13.5-1.2 7 4.5-2.2 4.5 2.2-1.2-7"/>', 18),
    navLoja: ic('<path d="M3.5 9 5 4h14l1.5 5"/><path d="M4.5 9h15v10.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z"/><path d="M9.5 13h5"/>', 18),
    navAdmin: ic('<path d="M12 3 19.5 6v5.5c0 4.5-3.1 8.2-7.5 9.5-4.4-1.3-7.5-5-7.5-9.5V6z"/><circle cx="12" cy="10.5" r="2"/><path d="M8.7 16a3.8 3.8 0 0 1 6.6 0"/>', 18),
    calendar: ic('<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', 14),
    print: ic('<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="1.5"/><path d="M7 14h10v6.5H7z"/>', 14),
    award: ic('<circle cx="12" cy="9" r="5.5"/><path d="m9.6 9 1.7 1.7 3.1-3.2"/><path d="m8.7 13.5-1.2 7 4.5-2.2 4.5 2.2-1.2-7"/>', 32),

    // ---- navegação do aluno ----
    navInicio: ic('<path d="M3 9.5 12 4l9 5.5"/><path d="M3 20h18"/><path d="M6 11v6.5M10 11v6.5M14 11v6.5M18 11v6.5"/>'),
    navMeusCursos: ic('<path d="m12 4 9 4.5-9 4.5-9-4.5z"/><path d="m3 12.5 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>'),
    navAoVivo: ic(PONTO(12, 12, 2) + '<path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 15.8a5.4 5.4 0 0 0 0-7.6M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 18.7a9.5 9.5 0 0 0 0-13.4"/>'),
    navAcademico: ic('<path d="M4 20h16"/><path d="M6.5 17v-6M10.5 17V6M14.5 17v-4M18.5 17V9"/>'),
    navPublicacoes: ic('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.3-2.5z" fill="currentColor" stroke="none"/>'),
    navFinanceiro: ic('<path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z"/><path d="M9 8h6M9 12h6M9 16h3.5"/>'),
    navDocumentacao: ic('<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>'),
    navDocumentos: ic('<rect x="3" y="5" width="18" height="14" rx="1.5"/><circle cx="9" cy="11" r="2"/><path d="M6 16a3 3 0 0 1 6 0M14.5 10h4M14.5 14h4"/>'),
    navDeclaracoes: ic(FOLHA + '<circle cx="12" cy="13" r="2.5"/><path d="m10.6 15.1-.6 3.9 2-1 2 1-.6-3.9"/>'),
    navContratos: ic('<path d="M3 21h18"/><path d="M19.5 3.5c-7 .7-11.2 5.6-12.4 12.6L6.2 18l1.9-.9c7-1.2 11.5-5.4 11.4-13.6z"/><path d="m8.5 15.5 5.5-6"/>'),
    navComprovantes: ic(FOLHA + '<path d="m9 14 2 2 4-4"/>'),
    navAtendimento: ic(BALAO),
    navTutoriais: ic('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6"/>' + PONTO(12, 16.8)),
    navCursosDisponiveis: ic('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'),

    // ---- navegação da equipe ----
    navVisaoGeral: ic('<rect x="3.5" y="3.5" width="7" height="9" rx="1"/><rect x="13.5" y="3.5" width="7" height="5" rx="1"/><rect x="13.5" y="11.5" width="7" height="9" rx="1"/><rect x="3.5" y="15.5" width="7" height="5" rx="1"/>'),
    navCursos: ic('<path d="M12 6.5C9.8 5 7 4.6 3.5 5v13.5c3.5-.4 6.3 0 8.5 1.5 2.2-1.5 5-1.9 8.5-1.5V5c-3.5-.4-6.3 0-8.5 1.5z"/><path d="M12 6.5V20"/>'),
    navTurmas: ic('<circle cx="8.5" cy="9" r="3"/><path d="M3 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="16.5" cy="8" r="2.5"/><path d="M15.5 13.6a4.6 4.6 0 0 1 5.5 4.4"/>'),
    navAvaliacoes: ic('<rect x="5" y="4.5" width="14" height="16.5" rx="1.5"/><path d="M9 4.5V3h6v1.5"/><path d="m9 13 2 2 4-4.5"/>'),
    navCorrecao: ic('<path d="M4 20h7"/><path d="m14.5 4.5 5 5L10 19H5v-5z"/><path d="m12.5 6.5 5 5"/>'),
    navDuvidas: ic(BALAO + '<path d="M10.2 8.6a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4"/>' + PONTO(12, 13.7, 0.8)),
    navOuvidoria: ic(BALAO + '<path d="M12 7.5 15 8.6v2.2c0 1.6-1.2 2.9-3 3.4-1.8-.5-3-1.8-3-3.4V8.6z"/>'),
    navAlunos: ic('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
    navMatriculas: ic('<rect x="4" y="3.5" width="16" height="17" rx="1.5"/><path d="M9.5 3.5v2h5v-2"/><circle cx="12" cy="11" r="2.3"/><path d="M8 17a4 4 0 0 1 8 0"/>'),
    navEquipe: ic('<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 10-5.5"/><circle cx="17.5" cy="17" r="2"/><path d="M17.5 13.5v1.5M17.5 19v1.5M14 17h1.5M19.5 17H21"/>'),
    navRelatorios: ic('<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M8 16.5v-4M12 16.5V8M16 16.5v-6"/>'),
    navAuditoria: ic('<path d="M4 6h9M4 11h7M4 16h6"/><circle cx="16.5" cy="15" r="4"/><path d="M16.5 13v2l1.3 1.2"/>'),
    navConfig: ic('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
    navParcerias: ic('<path d="M3 11.5 7 8l3 1.5 3-2 4 1 4 3"/><path d="m7 8-3.5 6 5 4.5 2.5-1.5 2.5 1.5 4-3.5 2-3.5"/><path d="m10 16 2-2M12.5 17.5l2-2"/>'),
    navBanners: ic('<path d="M4 10v4h3l7 4V6l-7 4z"/><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5"/>'),

    // ---- utilitários ----
    busca: ic('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
    sino: ic('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
    temaSol: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
    temaLua: ic('<path d="M20 14.6A8 8 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"/>'),
    tema: ic('<path d="M20 14.6A8 8 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"/>'),
    fonteMenos: ic('<path d="m3.5 18.5 4.5-13 4.5 13"/><path d="M5.2 14h5.6"/><path d="M15.5 12h5"/>'),
    fonteMais: ic('<path d="m3.5 18.5 4.5-13 4.5 13"/><path d="M5.2 14h5.6"/><path d="M15.5 12h5M18 9.5v5"/>'),
    conta: ic('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>'),
    sair: ic('<path d="M14.5 4H19a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4.5"/><path d="m10 8-4 4 4 4M6 12h10"/>'),
    recolher: ic('<path d="m14.5 6-6 6 6 6"/><path d="M19 5v14"/>'),
    expandir: ic('<path d="m9.5 6 6 6-6 6"/><path d="M5 5v14"/>'),
    chevron: ic('<path d="m6 9.5 6 6 6-6"/>'),
    seta: ic('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    fechar: ic('<path d="M6 6l12 12M18 6 6 18"/>'),
    carrinho: ic('<circle cx="9" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/><path d="M2.5 3.5h3l2.4 11.2a1.5 1.5 0 0 0 1.5 1.3h8.4a1.5 1.5 0 0 0 1.5-1.2l1.4-7.3H6.5"/>'),
    tipoDocumento: ic(FOLHA + '<path d="M9 13h6M9 16.5h4"/>'),
    ponto: ic('<circle cx="12" cy="12" r="3.5"/>'),
    // Glifos de estado: a forma muda com o tom (nunca só a cor, UX §2.3).
    estadoSucesso: ic('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 10"/>'),
    estadoInfo: ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/>' + PONTO(12, 8)),
    estadoAviso: ic('<path d="M12 4 21 20H3z"/><path d="M12 10v4"/>' + PONTO(12, 17)),
    estadoErro: ic('<path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z"/><path d="M12 7.5v5.5"/>' + PONTO(12, 16.3)),
    estadoNeutro: ic('<circle cx="12" cy="12" r="8"/><path d="M8.5 12h7"/>'),
    video: ic('<rect x="3" y="6" width="13" height="12" rx="1.5"/><path d="m16 10.5 5-3v9l-5-3z"/>'),
    pdf: ic(FOLHA + '<path d="M8.5 17.5v-5h1.6a1.5 1.5 0 0 1 0 3H8.5M13 12.5v5h.9a1.8 1.8 0 0 0 1.8-1.8v-1.4a1.8 1.8 0 0 0-1.8-1.8z"/>'),
    slides: ic('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8.5 20h7"/>'),
    linkExterno: ic('<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    baixar: ic('<path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M4.5 19.5h15"/>'),
    enviarArquivo: ic('<path d="M12 15.5v-11"/><path d="m7 9 5-5 5 5"/><path d="M4.5 19.5h15"/>'),
    imprimir: ic('<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="1.5"/><path d="M7 14h10v6.5H7z"/>'),
    qr: ic('<rect x="4" y="4" width="6" height="6" rx=".5"/><rect x="14" y="4" width="6" height="6" rx=".5"/><rect x="4" y="14" width="6" height="6" rx=".5"/><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM20 14v1.5M14 20h1.5"/>'),
    copiar: ic('<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="1.5"/><path d="M15.5 8.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9.5a1 1 0 0 0 1 1h3.5"/>'),
    cadeado: ic('<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    calendario: ic('<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    relogio: ic('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    enviar: ic('<path d="M21 3 10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5-7.5-4z"/>'),
    anexo: ic('<path d="m20 11.5-7.8 7.8a5 5 0 0 1-7-7l8.1-8.1a3.3 3.3 0 0 1 4.7 4.7l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4"/>'),
    mais: ic(PONTO(6, 12, 1.3) + PONTO(12, 12, 1.3) + PONTO(18, 12, 1.3)),
    filtro: ic('<path d="M4 6.5h16M7 12h10M10 17.5h4"/>'),
    olho: ic('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
    escudo: ic('<path d="M12 3 19.5 6v5.5c0 4.5-3.1 8.2-7.5 9.5-4.4-1.3-7.5-5-7.5-9.5V6z"/>'),
    telaCheia: ic('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')
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
    // Só a sessão: a tela de acesso não usa catálogo.
    await DMC_init({ catalogo: false });
    const next = validarNext(new URLSearchParams(window.location.search).get('next') || '');
    // Destino (D-44, §7.3): senha temporária → perfil; senão next válido; senão o destino do papel.
    const destino = () => (estaRestrito() ? DESTINO_RESTRITO : (next || Auth.destinoInicial()));
    if (Auth.isLogged()) { window.location.href = destino(); return; }
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
    const ehEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    const ehCpf = (v) => /^\d{11}$/.test(String(v).replace(/[.\-\s]/g, ''));

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
      // Entrada: e-mail OU CPF (11 dígitos, com ou sem máscara). Cadastro: só e-mail.
      const identificador = (form.email.value || '').trim();
      const senha = form.senha ? (form.senha.value || '') : '';
      const nome = form.nome ? (form.nome.value || '').trim() : '';
      if (mode === 'signup') {
        if (!identificador || !ehEmail(identificador)) { showError('Informe um e-mail válido.'); return; }
      } else if (!identificador || !(ehEmail(identificador) || ehCpf(identificador))) {
        showError('Informe um e-mail ou CPF válido.'); return;
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
          await Auth.signUp(identificador, senha, nome);
        } else {
          await Auth.signIn(identificador, senha);
        }
        // Gancho de transição visual da tela de acesso. Só roda com
        // autenticação já aceita e nunca pode impedir a navegação.
        if (typeof window.DMC_onLoginSuccess === 'function') {
          try { await window.DMC_onLoginSuccess(); }
          catch (errTransicao) { console.warn('[DMC] transição de acesso:', errTransicao); }
        }
        window.location.href = destino();
      } catch (err) {
        // 2FA ativo: esta tela não tem o passo do código — segue pelo login principal (API §10.4).
        if (err && err.codigo === 'segundo-fator') {
          gravarAviso('Esta conta usa verificação em duas etapas. Continue pelo login principal.');
          window.location.href = next ? `login.html?next=${encodeURIComponent(next)}` : 'login.html';
          return;
        }
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
    if (desviarSeRestrito()) return; // D-63: senha temporária → perfil.html#seguranca, sem desenhar nada
    bindHeader();

    const allCursos = (Data.get().cursos || []);
    if (!allCursos.length) {
      document.querySelector('main').innerHTML = '<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhum curso cadastrado.</p><p class="pf-vazio__texto">Acesse o painel administrativo para criar o primeiro.</p></div>';
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
    if (desviarSeRestrito()) return; // D-63: senha temporária → perfil.html#seguranca, sem desenhar nada
    bindHeader();

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    let curso = id ? Data.findCursoByAulaId(id) : null;
    if (curso) Data.setCursoEscolhido(curso.id);
    if (!curso) curso = Data.getActiveCurso();
    if (!curso) {
      document.querySelector('#player-root').innerHTML = '<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhum curso cadastrado.</p></div>';
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
      document.querySelector('#player-root').innerHTML = '<div class="pf-vazio"><p class="pf-vazio__titulo">Aula não encontrada.</p></div>';
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
               data-aside-aula="${escapeHtml(a.id)}" data-aside-link role="link" tabindex="0">
            <span class="aside-aula__check">${I.check}</span>
            <span class="aside-aula__title">${rotulo}</span>
            <span class="aside-aula__dur">${escapeHtml(a.duracao || '')}</span>
          </div>`;
      }).join('');
      return `<div class="aside-modulo-head">Módulo ${escapeHtml(m.numero)} — ${escapeHtml(m.titulo)}</div>${ativos}`;
    }).join('');
    // Delegação (sem onclick inline, §7.3 e CSP de §9.6): clique ou Enter abre a aula.
    const abrirDoAside = (alvo) => {
      const el = alvo && alvo.closest ? alvo.closest('[data-aside-link]') : null;
      if (el) window.location.href = `aula.html?id=${encodeURIComponent(el.dataset.asideAula)}`;
    };
    aside.onclick = (e) => abrirDoAside(e.target);
    aside.onkeydown = (e) => { if (e.key === 'Enter') abrirDoAside(e.target); };
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
    if (desviarSeRestrito()) return; // D-63: senha temporária → perfil.html#seguranca, sem desenhar nada
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
    if (desviarSeRestrito()) return; // D-63: senha temporária → perfil.html#seguranca, sem desenhar nada
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
    if (desviarSeRestrito()) return; // D-63: senha temporária → perfil.html#seguranca, sem desenhar nada
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
  // LOJA — markup de D-69 (sem inclinação, brilho nem cor inline) e
  // pedido registrado como atendimento (D-79, API §6.9 item 4).
  // Classes e ids fixos (§7.3, §7.10): loja-card, loja-card__pill,
  // loja-card__stats, loja-card__vazio, #cart-drawer, #cart-list,
  // #cart-checkout, [data-cart-count], #cart-alerta.
  // =============================================================
  const RE_PROTOCOLO_ATD = /^ATD-\d{4}-[2-9A-HJ-NP-Z]{6}$/;
  const PEDIDO_URL = '/portal/me/pedidos';
  const MSG_PEDIDO_FALHOU = 'Não foi possível registrar o pedido agora. Seu carrinho foi mantido. Tente de novo em alguns minutos.';

  /** Preço ausente nunca vira R$ 0,00 (UX §6.19). */
  function precoOuAConfirmar(v) {
    return Number(v) > 0 ? formatPreco(v) : 'Valor a confirmar';
  }
  /** Glifo de estado decorativo para markup gerado aqui. */
  function glifo(chave) {
    return String(I[chave] || '').replace(/^<svg\b/, '<svg aria-hidden="true" focusable="false"');
  }
  function listaDeNomes(nomes) {
    if (nomes.length <= 1) return nomes[0] || '';
    return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  }
  function avisar(texto, tipo) {
    if (window.DMC_UI && typeof window.DMC_UI.toast === 'function') {
      window.DMC_UI.toast(texto, { tipo: tipo || 'sucesso', duracaoMs: 3000 });
      return;
    }
    let t = document.querySelector('#toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = texto;
    t.classList.add('is-show');
    clearTimeout(avisar._t);
    avisar._t = setTimeout(() => t.classList.remove('is-show'), 1800);
  }

  async function bootLoja() {
    await DMC_init();
    if (!Auth.requireOrRedirect()) return;
    if (desviarSeRestrito()) return; // D-63: senha temporária → perfil.html#seguranca, sem desenhar nada
    bindHeader();

    const allCursos = Data.get().cursos || [];
    const grid = document.querySelector('#loja-grid');
    if (!grid) return;
    const params = new URLSearchParams(window.location.search);
    const destacarId = params.get('destacar');

    function renderGrid() {
      grid.innerHTML = allCursos.map(c => {
        const id = escapeHtml(c.id);
        const liberado = Liberacoes.has(c.id);
        const noCart = Carrinho.has(c.id);
        const beneficios = (c.beneficios || []).map(b => `<li>${I.check}<span>${escapeHtml(b)}</span></li>`).join('');
        const totalAulas = (c.modulos || []).reduce((s, m) => s + (m.aulas || []).length, 0);
        const iconSvg = COURSE_ICONS[c.iconeKey] || COURSE_ICONS.graduation;
        const capa = capaSrc(c);
        const modalidade = c.modalidade || 'Online';
        const modalidadeClasse = modalidade.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
        const isDestacado = c.id === destacarId;
        let cta;
        if (liberado) {
          cta = `<button type="button" class="loja-cta loja-cta--access" data-acessar="${id}">${I.unlock} Curso liberado · Acessar</button>`;
        } else if (noCart) {
          cta = `<button type="button" class="loja-cta loja-cta--in" data-toggle-cart="${id}" aria-pressed="true">${I.check} No carrinho</button>`;
        } else {
          cta = `<button type="button" class="loja-cta loja-cta--add" data-toggle-cart="${id}" aria-pressed="false">${I.cart} Adicionar ao carrinho</button>`;
        }
        return `
          <article class="loja-card ${isDestacado ? 'is-destacado' : ''}" data-curso-id="${id}">
            <div class="loja-card__inner">
              ${liberado ? `<span class="loja-card__badge loja-card__badge--owned">${I.unlock} Liberado</span>` : ''}
              ${isDestacado && !liberado ? `<span class="loja-card__badge loja-card__badge--featured">${I.sparkle} Selecionado</span>` : ''}
              ${capa
                ? `<div class="loja-card__capa"><img src="${escapeHtml(capa)}" alt="" loading="lazy"></div>`
                : `<div class="loja-card__icon">${iconSvg}</div>`}
              <span class="loja-card__pill loja-card__pill--${escapeHtml(modalidadeClasse)}">${escapeHtml(modalidade)}</span>
              <h3 class="loja-card__title">${escapeHtml(c.titulo)}</h3>
              <p class="loja-card__desc">${escapeHtml(c.descricao || c.subtitulo || '')}</p>
              <ul class="loja-card__beneficios">${beneficios || '<li class="loja-card__vazio">Sem benefícios cadastrados</li>'}</ul>
              <div class="loja-card__stats">
                <span>${I.clock}<strong>${escapeHtml(c.cargaHoraria || '—')}</strong></span>
                <span>${I.book}<strong>${(c.modulos || []).length} módulos · ${totalAulas} aulas</strong></span>
              </div>
              <div class="loja-card__footer">
                <div class="loja-card__price">
                  <span class="loja-card__price-label">Investimento</span>
                  <span class="loja-card__price-value">${precoOuAConfirmar(c.preco)}</span>
                </div>
                ${cta}
              </div>
            </div>
          </article>`;
      }).join('');

      bindCardActions();

      if (destacarId) {
        let target = null;
        try { target = grid.querySelector(`[data-curso-id="${CSS.escape(destacarId)}"]`); } catch { target = null; }
        if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
      }
    }

    function bindCardActions() {
      grid.querySelectorAll('[data-toggle-cart]').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = b.dataset.toggleCart;
        const wasIn = Carrinho.has(id);
        Carrinho.toggle(id);
        renderGrid();
        renderDrawer();
        avisar(wasIn ? 'Removido do carrinho.' : 'Adicionado ao carrinho.');
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
    /** Mostra ou esconde sem depender do CSS do [hidden] (display é layout, não cor). */
    function exibir(el, sim) {
      if (!el) return;
      el.hidden = !sim;
      el.style.display = sim ? '' : 'none';
    }

    function totalDoCarrinho(ids) {
      const cursos = ids.map(id => Data.getCursoById(id)).filter(Boolean);
      if (cursos.some(c => !(Number(c.preco) > 0))) return 'A confirmar pela coordenação';
      return formatPreco(Carrinho.total());
    }

    function renderDrawer() {
      const ids = Carrinho.items();
      const has = ids.length > 0;
      exibir(emptyEl, !has);
      exibir(listEl, has);
      exibir(checkoutForm, has);

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
                <div class="cart-item__price">${precoOuAConfirmar(c.preco)}</div>
              </div>
              <button type="button" class="cart-item__remove" data-remove-cart="${escapeHtml(c.id)}" aria-label="Remover ${escapeHtml(c.titulo)} do carrinho">${I.close}</button>
            </div>`;
        }).join('');
        listEl.querySelectorAll('[data-remove-cart]').forEach(b => b.addEventListener('click', () => {
          Carrinho.remove(b.dataset.removeCart);
          renderGrid();
          renderDrawer();
          avisar('Item removido do carrinho.');
        }));
      }
      if (totalEl) totalEl.textContent = totalDoCarrinho(ids);
      document.querySelectorAll('[data-cart-count]').forEach(el => {
        const n = Carrinho.count();
        el.textContent = n;
        el.classList.toggle('is-empty', n === 0);
      });
    }

    document.querySelectorAll('[data-cart-open]').forEach(btn => btn.addEventListener('click', openDrawer));
    document.querySelectorAll('[data-cart-close]').forEach(btn => btn.addEventListener('click', closeDrawer));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

    // ---- avisos da gaveta: bloco fixo #cart-alerta (HTML da F0r; criado aqui se faltar) ----
    function blocoAlerta() {
      let el = document.querySelector('#cart-alerta');
      if (!el && checkoutForm && checkoutForm.parentNode) {
        el = document.createElement('div');
        el.id = 'cart-alerta';
        el.className = 'pf-alerta';
        el.setAttribute('role', 'status');
        el.hidden = true;
        checkoutForm.parentNode.insertBefore(el, checkoutForm);
      }
      return el;
    }
    function mostrarAlerta(tom, texto, acao) {
      const el = blocoAlerta();
      if (!el) return;
      const chave = { info: 'estadoInfo', aviso: 'estadoAviso', erro: 'estadoErro', sucesso: 'estadoSucesso' }[tom] || 'estadoInfo';
      el.className = `pf-alerta pf-alerta--${tom}`;
      el.innerHTML = `${glifo(chave)}<p>${escapeHtml(texto)}</p>${acao
        ? `<button type="button" class="dmc-btn dmc-btn--secondary pf-alerta__acao" data-cart-alerta-acao>${escapeHtml(acao.rotulo)}</button>`
        : ''}`;
      if (acao) el.querySelector('[data-cart-alerta-acao]').addEventListener('click', acao.aoClicar);
      el.hidden = false;
    }
    function esconderAlerta() {
      const el = document.querySelector('#cart-alerta');
      if (!el) return;
      el.hidden = true;
      el.className = 'pf-alerta';
      el.replaceChildren();
    }
    function tirarDoCarrinho(ids) {
      const tirados = [];
      ids.forEach(id => {
        if (Carrinho.has(id)) {
          const c = Data.getCursoById(id);
          tirados.push(c ? c.titulo : id);
          Carrinho.remove(id);
        }
      });
      renderGrid();
      renderDrawer();
      return tirados;
    }
    function idsDoErro(err) {
      const d = (err && err.dados) || {};
      if (Array.isArray(d.cursoIds)) return d.cursoIds.map(String);
      if (err && err.campos && Array.isArray(err.campos.cursoIds)) return err.campos.cursoIds.map(String);
      return null;
    }

    let enviandoPedido = false;
    function tratarErroDoPedido(err, ids) {
      const status = err && err.status;
      if (status === 401) { window.location.href = urlDeLogin(); return; }
      if (err && err.codigo === 'troca-de-senha-obrigatoria') { window.location.replace(DESTINO_RESTRITO); return; }
      if (status === 409 && err.codigo === 'ja-liberado') {
        const nomes = tirarDoCarrinho(idsDoErro(err) || []);
        if (nomes.length) {
          mostrarAlerta('info', nomes.length === 1
            ? `Você já tem acesso a ${nomes[0]}. Ele saiu do pedido.`
            : `Você já tem acesso a ${listaDeNomes(nomes)}. Eles saíram do pedido.`);
        } else {
          mostrarAlerta('info', err.message);
        }
        return;
      }
      if (status === 400 && err.campos && err.campos.cursoIds) {
        // Cursos recusados: os que o servidor listou; sem lista, os que o catálogo não tem mais à venda.
        const recusados = idsDoErro(err) || ids.filter(id => {
          const c = Data.getCursoById(id);
          return !c || c.isAtivo === false;
        });
        const nomes = tirarDoCarrinho(recusados);
        if (nomes.length) {
          mostrarAlerta('aviso', nomes.length === 1
            ? `${nomes[0]} não está mais disponível e saiu do pedido.`
            : `${listaDeNomes(nomes)} não estão mais disponíveis e saíram do pedido.`);
        } else {
          mostrarAlerta('aviso', typeof err.campos.cursoIds === 'string' ? err.campos.cursoIds : err.message);
        }
        return;
      }
      if (status === 429 || status === 503) { mostrarAlerta('erro', err.message); return; }
      if (status && status >= 400 && status < 500) { mostrarAlerta('erro', err.message); return; }
      // Rede ou outro 5xx: carrinho mantido, sem navegar.
      mostrarAlerta('erro', MSG_PEDIDO_FALHOU, {
        rotulo: 'Tentar de novo',
        aoClicar: () => { if (checkoutForm.requestSubmit) checkoutForm.requestSubmit(); else checkoutForm.dispatchEvent(new Event('submit', { cancelable: true })); }
      });
    }

    if (checkoutForm) checkoutForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ids = Carrinho.items();
      if (!ids.length || enviandoPedido) return;
      const botao = checkoutForm.querySelector('[type="submit"]');
      const rotulo = botao ? botao.textContent : '';
      enviandoPedido = true;
      if (botao) { botao.disabled = true; botao.setAttribute('aria-busy', 'true'); botao.textContent = 'Registrando pedido…'; }
      esconderAlerta();
      const liberarBotao = () => {
        enviandoPedido = false;
        if (botao) { botao.disabled = false; botao.removeAttribute('aria-busy'); botao.textContent = rotulo; }
      };
      let resposta;
      try {
        // Só os ids do carrinho: preço, título e total são do servidor (nunca do navegador).
        resposta = await api().post(PEDIDO_URL, { cursoIds: ids }, { silencioso404: true });
      } catch (err) {
        liberarBotao();
        tratarErroDoPedido(err, ids);
        return;
      }
      if (resposta === null) {
        // 404: a rota da F5 ainda não está montada → caminho legado, com o texto honesto
        // de pedido NÃO registrado no obrigado (D-79; mantém o R10 verde na fase 0).
        const user = Auth.user() || {};
        const queryParams = new URLSearchParams({
          cursos: ids.join(','),
          email: user.email || '',
          total: Carrinho.total().toFixed(2)
        });
        window.location.href = `obrigado.html?${queryParams.toString()}`;
        return;
      }
      const protocolo = resposta && typeof resposta.protocolo === 'string' ? resposta.protocolo : '';
      if (!RE_PROTOCOLO_ATD.test(protocolo)) {
        liberarBotao();
        mostrarAlerta('erro', MSG_PEDIDO_FALHOU);
        return;
      }
      // O carrinho só esvazia depois do registro.
      Carrinho.clear();
      window.location.href = `obrigado.html?protocolo=${encodeURIComponent(protocolo)}${resposta.reaproveitado === true ? '&existente=1' : ''}`;
    });

    renderGrid();
    renderDrawer();
    window.addEventListener('dmc:carrinho:change', renderDrawer);
  }
  window.DMC_bootLoja = bootLoja;

  // =============================================================
  // OBRIGADO — pedido registrado (itens e total do SERVIDOR, lidos
  // do atendimento ATD) ou, sem protocolo válido, o texto honesto de
  // pedido não registrado (D-69, D-79; UX §6.19). Não libera curso:
  // a liberação é da coordenação, depois da confirmação do pagamento.
  // =============================================================
  async function bootObrigado() {
    await DMC_init();
    if (desviarSeRestrito()) return; // D-63
    bindHeader();
    const params = new URLSearchParams(window.location.search);
    const protocoloBruto = (params.get('protocolo') || '').trim();
    const protocolo = RE_PROTOCOLO_ATD.test(protocoloBruto) ? protocoloBruto : '';
    const user = Auth.user();

    const list = document.querySelector('#obrigado-list');
    const totalEl = document.querySelector('[data-obrigado-total]');
    const emailEl = document.querySelector('[data-obrigado-email]');
    if (emailEl) emailEl.textContent = (user && user.email) || (params.get('email') || '').trim() || '—';

    function itemHtml(titulo, sub, preco, icone) {
      return `
        <div class="obrigado-item">
          <div class="obrigado-item__icon">${icone || COURSE_ICONS.graduation}</div>
          <div>
            <div class="obrigado-item__title">${escapeHtml(titulo)}</div>
            ${sub ? `<div class="obrigado-item__sub">${escapeHtml(sub)}</div>` : ''}
          </div>
          <div class="obrigado-item__price">${escapeHtml(preco)}</div>
        </div>`;
    }
    function vazio(titulo, texto, link) {
      return `<div class="pf-vazio"><p class="pf-vazio__titulo">${escapeHtml(titulo)}</p>${texto ? `<p class="pf-vazio__texto">${escapeHtml(texto)}</p>` : ''}${link ? `<p class="pf-vazio__acoes"><a href="${escapeHtml(link.href)}">${escapeHtml(link.rotulo)}</a></p>` : ''}</div>`;
    }

    let cursoIdsDoPedido = [];

    if (protocolo) {
      // Caminho novo: o carrinho já foi esvaziado pela loja depois do registro.
      document.querySelectorAll('[data-obrigado-protocolo]').forEach(el => { el.textContent = protocolo; });
      document.querySelectorAll('a[data-obrigado-atendimento]').forEach(a => { a.href = `atendimentos.html?protocolo=${encodeURIComponent(protocolo)}`; });
      if (params.get('existente') === '1') document.querySelectorAll('[data-obrigado-existente]').forEach(el => { el.hidden = false; });
      let at;
      try {
        at = await api().get(`/portal/me/atendimentos/${encodeURIComponent(protocolo)}`, { silencioso404: true });
      } catch (err) {
        if (err && err.status === 401) { window.location.href = urlDeLogin(); return; }
        if (list) {
          list.innerHTML = `<div class="pf-alerta pf-alerta--erro" role="alert">${glifo('estadoErro')}<p class="pf-alerta__titulo">Não foi possível carregar o pedido agora.</p><p>${escapeHtml(err && err.status ? err.message : 'Verifique sua conexão e tente de novo.')}</p><button type="button" class="dmc-btn dmc-btn--secondary pf-alerta__acao" data-obrigado-tentar>Tentar de novo</button></div>`;
          list.querySelector('[data-obrigado-tentar]').addEventListener('click', () => window.location.reload());
        }
        return;
      }
      const pedido = at && (at.pedido || (at.atendimento && at.atendimento.pedido) || (at.protocolo && typeof at.protocolo === 'object' ? at.protocolo.pedido : null));
      if (!at || !pedido) {
        if (list) list.innerHTML = vazio('Não encontramos este pedido.', '', { href: 'atendimentos.html', rotulo: 'Ver seus atendimentos' });
        if (totalEl) totalEl.textContent = '—';
        return;
      }
      const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
      cursoIdsDoPedido = Array.isArray(pedido.cursoIds) && pedido.cursoIds.length ? pedido.cursoIds.map(String) : itens.map(i => String(i.cursoId));
      if (list) {
        list.innerHTML = itens.map(i => {
          const c = Data.getCursoById(i.cursoId);
          const preco = Number.isInteger(i.valorCentavos) ? formatPreco(i.valorCentavos / 100) : 'Valor a confirmar';
          return itemHtml(i.titulo || (c && c.titulo) || i.cursoId, c ? `${c.modalidade || 'Online'} · ${c.cargaHoraria || ''}` : '', preco, c && COURSE_ICONS[c.iconeKey]);
        }).join('');
      }
      if (totalEl) totalEl.textContent = Number.isInteger(pedido.totalCentavos) ? formatPreco(pedido.totalCentavos / 100) : 'A confirmar pela coordenação';
      if (user && cursoIdsDoPedido[0]) Data.setCursoEscolhido(cursoIdsDoPedido[0]);
    } else {
      // Sem protocolo válido (inclusive o endereço legado do 404): pedido NÃO registrado.
      const semPedido = document.querySelector('#obrigado-sem-pedido');
      if (semPedido) semPedido.hidden = false;
      const cursoIds = (params.get('cursos') || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!cursoIds.length) {
        if (list) list.innerHTML = vazio('Nenhum curso recebido.', '', { href: 'loja.html', rotulo: 'Voltar aos cursos disponíveis' });
        if (totalEl) totalEl.textContent = '—';
        return;
      }
      Carrinho.clear();
      cursoIdsDoPedido = cursoIds;
      const cursos = cursoIds.map(id => Data.getCursoById(id)).filter(Boolean);
      if (list) {
        list.innerHTML = cursos.map(c => itemHtml(c.titulo, `${c.modalidade || 'Online'} · ${c.cargaHoraria || ''}`, precoOuAConfirmar(c.preco), COURSE_ICONS[c.iconeKey])).join('');
      }
      // Total recalculado do catálogo (o da query não é confiável).
      if (totalEl) {
        totalEl.textContent = cursos.length && cursos.every(c => Number(c.preco) > 0)
          ? formatPreco(cursos.reduce((s, c) => s + Number(c.preco), 0))
          : 'A confirmar pela coordenação';
      }
      if (user && cursoIds[0]) Data.setCursoEscolhido(cursoIds[0]);
    }

    // DEV-ONLY: simular pagamento aprovado (só localhost e com a flag no servidor).
    // A caixa nasce com `hidden` (HTML da F0r) e aparece por hidden = false (D-69);
    // o resultado sai em #dev-pay-status como pf-alerta (sem cor inline).
    const devBox = document.querySelector('#dev-pay-box');
    const devBtn = document.querySelector('#btn-dev-pay');
    const devStatus = document.querySelector('#dev-pay-status');
    const isLocalDev = ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
    if (devBox && devBtn && devStatus && user && cursoIdsDoPedido.length && isLocalDev) {
      devBox.hidden = false;
      devBox.removeAttribute('style'); // HTML antigo: display:none inline (some quando a F0r troca por hidden)
      const ids = cursoIdsDoPedido.slice();
      const rotuloDev = devBtn.textContent;
      devBtn.addEventListener('click', async () => {
        devBtn.disabled = true;
        devBtn.textContent = 'Liberando…';
        devStatus.removeAttribute('style');
        try {
          await api().post('/liberacoes/dev/simular-pagamento', { cursoIds: ids });
          await Liberacoes.init();
          devStatus.className = 'pf-alerta pf-alerta--sucesso';
          devStatus.hidden = false;
          devStatus.textContent = `${ids.length} curso${ids.length > 1 ? 's' : ''} liberado${ids.length > 1 ? 's' : ''}. Redirecionando para o painel…`;
          setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
        } catch (err) {
          devBtn.disabled = false;
          devBtn.textContent = rotuloDev;
          devStatus.className = 'pf-alerta pf-alerta--erro';
          devStatus.hidden = false;
          devStatus.textContent = 'Erro: ' + (err && err.message ? err.message : 'falha desconhecida');
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
