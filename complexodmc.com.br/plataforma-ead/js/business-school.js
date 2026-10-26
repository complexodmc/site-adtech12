/* DMC Business School (login.html), módulo ES: 1 acesso aluno|professor via DMC_Auth
   (app.js) · 2 catálogo GET /api/vitrine/cursos · 3 bolsas POST /api/bolsas/pre-inscricao
   + credencial viva. Nada fixo nem simulado; dado por textContent; textos no HTML (data-*). */
const d = document, html = d.documentElement, $ = (id) => d.getElementById(id);
const qsa = (s, c = d) => [...c.querySelectorAll(s)];
const on = (n, ev, fn) => n.addEventListener(ev, fn);
const tx = (id, v) => { $(id).textContent = v; };
const REDUZ = matchMedia('(prefers-reduced-motion: reduce)');
const API = (window.DMC_API_BASE || '/api').replace(/\/$/, '');
const NEXT_OK = /^[a-z0-9_-]+\.html(\?.*)?$/i; // mesma regra do app.js
const AREAS = Object.fromEntries(qsa('#bf-area option').filter((o) => o.value).map((o) => [o.value, o.textContent.trim()]));

const el = (tag, cls, t) => Object.assign(d.createElement(tag), cls ? { className: cls } : {}, t != null ? { textContent: t } : {});
const svg = (tag, a) => {
  const e = d.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in a) e.setAttribute(k, a[k]);
  return e;
};
const icone = (id, cls) => {
  const s = svg('svg', { class: cls || '', 'aria-hidden': 'true' });
  s.appendChild(svg('use', { href: '#bs-i-' + id }));
  return s;
};
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const suave = () => (REDUZ.matches ? 'auto' : 'smooth');
const params = () => new URLSearchParams(location.search);
const plural = (n, um, mais) => n + ' ' + (n === 1 ? um : mais);
const casos = (box, caso) => qsa('[data-caso]', box).forEach((n) => { n.hidden = !n.dataset.caso.split(' ').includes(caso); });
const comContato = (alvo, msg) => {
  alvo.textContent = msg + ' ';
  alvo.append($('bs-contato').content.cloneNode(true));
};

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const prng = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const curva = (raio, n) => {
  let s = '';
  for (let i = 0; i <= n; i++) {
    const t = (Math.PI * 2 * i) / n, q = raio(t);
    s += (i ? 'L' : 'M') + (q * Math.cos(t)).toFixed(1) + ' ' + (q * Math.sin(t)).toFixed(1);
  }
  return s + 'Z';
};
// guilhochê (desenho de diploma) do hash do nome; centro livre para o monograma
function roseta(seed, grande) {
  const r = prng(hash(seed)), out = [], ondas = 7 + Math.floor(r() * 9);
  const faixa = (raio, amp, k, linhas, n) => {
    for (let i = 0; i < linhas; i++) {
      const f = (i / linhas) * Math.PI * 2;
      out.push(curva((t) => raio + amp * Math.sin(k * t + f), n));
    }
  };
  faixa(76, 8 + r() * 5, ondas, grande ? 28 : 13 + Math.floor(r() * 7), grande ? 420 : 240);
  faixa(46, 5 + r() * 3.5, ondas + 3 + Math.floor(r() * 6), grande ? 16 : 8 + Math.floor(r() * 5), grande ? 300 : 200);
  faixa(31, 2.6 + r() * 1.6, 12 + Math.floor(r() * 13), 2, 220);
  out.push('M0-96a96 96 0 1 1 0 192a96 96 0 1 1 0-192ZM0-92.5a92.5 92.5 0 1 1 0 185a92.5 92.5 0 1 1 0-185Z');
  return out;
}

/* ================= 1 · ACESSO ================= */
const card = $('acesso'), entrada = $('bs-entrada'), sessao = $('bs-sessao'), form = $('bs-form');
const nome = $('bs-nome'), email = $('bs-email'), senha = $('bs-senha'), erro = $('bs-erro'), aviso = $('bs-aviso'), enviar = $('bs-enviar');
const perfilBox = d.querySelector('.bs-perfil'), abasBox = d.querySelector('.bs-abas');
const radios = qsa('[role=radio]', perfilBox), abas = qsa('[role=tab]', abasBox);
const est = { perfil: 'aluno', aba: 'entrar' };
const M = erro.dataset, AV = aviso.dataset, RB = enviar.dataset;
let initPromise = Promise.resolve();

const auth = () => window.DMC_Auth;
const logado = () => !!(auth() && auth().isLogged());
const proximo = () => {
  const n = params().get('next');
  return n && NEXT_OK.test(n) ? n : '';
};
const rotular = (t) => { enviar.firstElementChild.textContent = t || (est.perfil === 'professor' ? RB.professor : est.aba === 'criar' ? RB.criar : RB.entrar); };
const limpar = () => {
  erro.textContent = aviso.textContent = '';
  [nome, email, senha].forEach((c) => c.removeAttribute('aria-invalid'));
};

function sincronizar() {
  const prof = est.perfil === 'professor', criar = !prof && est.aba === 'criar';
  perfilBox.dataset.perfil = est.perfil;
  radios.forEach((r) => {
    const ok = r.dataset.perfil === est.perfil;
    r.setAttribute('aria-checked', ok);
    r.tabIndex = ok ? 0 : -1;
  });
  abas.forEach((t) => {
    const ok = (t.id === 'aba-criar') === criar;
    t.setAttribute('aria-selected', ok);
    t.tabIndex = ok ? 0 : -1;
  });
  abasBox.hidden = prof;
  $('bs-nota-prof').hidden = !prof;
  qsa('[data-so=criar]', form).forEach((n) => { n.hidden = !criar; });
  nome.required = criar;
  email.autocomplete = criar ? 'email' : 'username';
  senha.autocomplete = criar ? 'new-password' : 'current-password';
  if (prof) { form.removeAttribute('role'); form.removeAttribute('aria-labelledby'); form.setAttribute('aria-label', 'Acesso do professor'); }
  else { form.setAttribute('role', 'tabpanel'); form.removeAttribute('aria-label'); form.setAttribute('aria-labelledby', criar ? 'aba-criar' : 'aba-entrar'); }
  rotular();
  limpar();
}
const setPerfil = (p) => { est.perfil = p; if (p === 'professor') est.aba = 'entrar'; sincronizar(); };
const setAba = (a) => { est.aba = a; sincronizar(); };

// setas/Home/End, tabindex móvel
function teclado(itens, ativar, vertical) {
  itens.forEach((item, i) => {
    on(item, 'click', () => ativar(item));
    on(item, 'keydown', (e) => {
      const n = itens.length, k = e.key;
      const j = k === 'ArrowRight' || (vertical && k === 'ArrowDown') ? (i + 1) % n
        : k === 'ArrowLeft' || (vertical && k === 'ArrowUp') ? (i + n - 1) % n
          : k === 'Home' ? 0 : k === 'End' ? n - 1 : -1;
      if (j < 0) return;
      e.preventDefault();
      ativar(itens[j]);
      itens[j].focus();
    });
  });
}
teclado(radios, (r) => setPerfil(r.dataset.perfil), true);
teclado(abas, (t) => setAba(t.id === 'aba-criar' ? 'criar' : 'entrar'));

on($('bs-ver-senha'), 'click', (e) => {
  const ver = senha.type === 'password';
  senha.type = ver ? 'text' : 'password';
  e.currentTarget.setAttribute('aria-pressed', ver);
});
const caps = (ligado) => {
  $('bs-caps').hidden = !ligado;
  if (ligado) senha.setAttribute('aria-describedby', 'bs-caps'); else senha.removeAttribute('aria-describedby');
};
['keydown', 'keyup'].forEach((t) => on(senha, t, (e) => { if (e.getModifierState) caps(e.getModifierState('CapsLock')); }));
on(senha, 'blur', () => caps(false));
on(form, 'input', (e) => { erro.textContent = ''; e.target.removeAttribute('aria-invalid'); });

const ocupado = (sim) => {
  enviar.disabled = sim;
  enviar.setAttribute('aria-busy', sim);
  rotular(sim && RB.ocupado);
};
const invalido = (c, msg) => {
  erro.textContent = msg;
  c.setAttribute('aria-invalid', 'true');
  c.focus();
};

on(form, 'submit', async (e) => {
  e.preventDefault();
  const Au = auth(), criar = est.perfil === 'aluno' && est.aba === 'criar';
  const n = nome.value.trim(), em = email.value.trim(), s = senha.value;
  limpar();
  if (!Au) { erro.textContent = M.carregar; return; }
  if (criar && !n) return invalido(nome, M.nome);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return invalido(email, M.email);
  if (s.length < 6) return invalido(senha, M.senha);
  ocupado(true);
  try {
    await (criar ? Au.signUp(em, s, n) : Au.signIn(em, s));
  } catch (err) {
    ocupado(false);
    erro.textContent = (err && err.message) || M.falha;
    return;
  }
  const u = Au.user();
  // perfil "Professor": papel === 'professor' ou isAdmin (índice §5.5 item 5); destino por papel
  if (est.perfil === 'professor' && !(u && (u.isAdmin || u.papel === 'professor'))) {
    ocupado(false);
    mostrarSessao(u, M.prof);
    $('bs-ir-aluno').focus();
    return;
  }
  aviso.textContent = AV.liberado;
  location.href = proximo() || (est.perfil === 'professor' ? (u.isAdmin ? 'admin.html' : 'professor.html') : 'dashboard.html');
});

function mostrarSessao(u, msg) {
  html.classList.remove('bs-verificando');
  entrada.hidden = true;
  sessao.hidden = false;
  tx('bs-sessao-nome', (u && (u.nome || u.email)) || 'sua conta');
  tx('bs-sessao-aviso', msg || '');
  $('bs-ir-admin').hidden = !(u && u.isAdmin);
}
on($('bs-sair'), 'click', async () => {
  try { await auth().signOut(); } catch (e) { /* sessão local já saiu */ }
  sessao.hidden = true;
  entrada.hidden = false;
  form.reset();
  est.aba = 'entrar';
  setPerfil('aluno');
  aviso.textContent = AV.saiu;
  email.focus();
});

initPromise = (async () => {
  const p = params();
  if (p.get('modo') === 'professor') est.perfil = 'professor';
  else if (p.get('aba') === 'criar') est.aba = 'criar';
  sincronizar();
  if (typeof window.DMC_init === 'function') { try { await window.DMC_init(); } catch (e) { /* segue */ } }
  d.querySelector('.bs-campos').disabled = false;
  html.classList.remove('bs-verificando');
  const u = auth() && auth().user();
  if (u) mostrarSessao(u);
  else if (!auth()) erro.textContent = M.carregar;
})();

/* ================= 2 · CATÁLOGO ================= */
const lista = $('bs-cards'), estado = $('bs-cat-estado'), contagem = $('bs-contagem'), busca = $('bs-busca'), E = estado.dataset;
const esqueletos = qsa('.bs-card--esqueleto', lista).map((n) => n.cloneNode(true));
const filtro = { area: 'todas', modalidade: 'todas', q: '' };
let cursos = [], carregado = false;
// área por palavra-chave; descrição só se título/subtítulo não casarem
const casa = (texto) => {
  const t = norm(texto);
  return /holding/.test(t) ? 'holding-patrimonial'
    : /sucess|patrimon/.test(t) ? 'planejamento-sucessorio-patrimonial'
    : /imobili|notar|registr|matricula/.test(t) ? 'notarial-imobiliario'
    : /venda|negoci|comercial/.test(t) ? 'negocios-vendas'
    : /tecnolog|digital|automa/.test(t) || /(^|[^\p{L}])IA([^\p{L}]|$)/u.test(texto) ? 'tecnologia' : '';
};
const modDe = (m) => {
  const t = norm(m);
  return /hibrid|semipresencial/.test(t) ? 'hibrido' : /presencial/.test(t) ? 'presencial'
    : !t || /online|on-line|ead|distancia|remot|ao vivo|gravad/.test(t) ? 'online' : '';
};
const capaUrl = (u) => {
  if (typeof u !== 'string' || !u) return '';
  if (typeof window.DMC_capaSrc === 'function') u = window.DMC_capaSrc({ capaUrl: u }) || '';
  return /^(https?:\/\/|\/(?!\/))/i.test(u) ? u : '';
};
const txt = (v) => (v == null ? '' : String(v).trim());
const num = (v) => (Number(v) > 0 ? Math.floor(Number(v)) : 0);

function arte(c) {
  const box = el('div', 'bs-arte'), r = prng(hash(c.id + '|' + c.titulo));
  const arcos = svg('svg', { class: 'bs-arte__arcos', viewBox: '0 0 160 100', preserveAspectRatio: 'xMidYMid slice' });
  const cx = 92 + r() * 46 | 0, cy = 16 + r() * 34 | 0;
  for (let i = 1; i < 5; i++) arcos.appendChild(svg('circle', { cx, cy, r: i * 15 + r() * 6 | 0, 'stroke-dasharray': i % 2 ? 'none' : '1.5 3' }));
  box.append(arcos, icone(/^[a-z]+$/.test(c.icone) && $('bs-i-' + c.icone) ? c.icone : 'graduation', 'bs-arte__icone'));
  return box;
}

function cartao(c) {
  const li = el('li', 'bs-card'), capa = el('div', 'bs-card__capa'), corpo = el('div', 'bs-card__corpo'), bloco = el('div', 'bs-card__bloco');
  const src = capaUrl(c.capaUrl);
  capa.setAttribute('aria-hidden', 'true');
  if (src) {
    const img = Object.assign(el('img'), { alt: '', width: 640, height: 400, loading: 'lazy', decoding: 'async' });
    img.onerror = () => capa.replaceChildren(arte(c));
    img.src = src;
    capa.appendChild(img);
  } else capa.appendChild(arte(c));
  if (c.area) corpo.appendChild(el('p', 'bs-card__area', AREAS[c.area]));
  bloco.appendChild(el('h3', 'bs-card__titulo', c.titulo));
  if (c.subtitulo) bloco.appendChild(el('p', 'bs-card__sub', c.subtitulo));
  corpo.appendChild(bloco);
  const meta = [c.modulos && plural(c.modulos, 'módulo', 'módulos'), c.aulas && plural(c.aulas, 'aula', 'aulas'), c.cargaHoraria, c.modalidade].filter(Boolean);
  if (meta.length) corpo.appendChild(el('p', 'bs-card__meta', meta.join(' · ')));
  const a = el('a', 'dmc-btn dmc-btn--secondary bs-card__cta', 'Quero me inscrever');
  a.href = 'loja.html?destacar=' + encodeURIComponent(c.id);
  a.append(el('span', 'dmc-sr-only', ' em ' + c.titulo), ' ', icone('seta'));
  on(a, 'click', (e) => {
    if (logado()) return;
    e.preventDefault();
    initPromise.then(() => { if (logado()) location.href = a.href; else paraCadastro(c); });
  });
  corpo.appendChild(a);
  li.append(capa, corpo);
  return li;
}

function paraCadastro(c) {
  const p = params();
  p.set('next', 'loja.html?destacar=' + encodeURIComponent(c.id));
  p.delete('modo');
  p.delete('aba');
  history.replaceState(null, '', location.pathname + '?' + p + '#acesso');
  est.perfil = 'aluno';
  setAba('criar');
  aviso.textContent = AV.curso.replace('{curso}', c.titulo);
  card.scrollIntoView({ behavior: suave(), block: 'start' });
  setTimeout(() => nome.focus({ preventScroll: true }), REDUZ.matches ? 0 : 500);
}

function estadoCat(msg, botao, acao) {
  estado.replaceChildren();
  if (!msg) return;
  estado.appendChild(el('p', null, msg));
  if (botao) {
    const b = el('button', 'dmc-btn dmc-btn--secondary', botao);
    b.type = 'button';
    b.onclick = acao;
    estado.appendChild(b);
  }
}
function render() {
  const q = norm(filtro.q.trim()), filtrando = filtro.area !== 'todas' || filtro.modalidade !== 'todas' || !!q;
  const vis = cursos.filter((c) => (filtro.area === 'todas' || c.area === filtro.area) &&
    (filtro.modalidade === 'todas' || c.mod === filtro.modalidade) && (!q || norm(c.titulo + ' ' + c.subtitulo).includes(q)));
  lista.replaceChildren(...vis.map(cartao));
  lista.setAttribute('aria-busy', 'false');
  const n = vis.length;
  contagem.textContent = !n ? '' : filtrando ? plural(n, 'curso', 'cursos') + ' nesta seleção' : plural(n, 'curso publicado', 'cursos publicados');
  estadoCat(n ? '' : E.vazio, filtrando && E.limpar, limparFiltros);
}
async function carregar() {
  carregado = false;
  estadoCat('');
  contagem.textContent = '';
  lista.replaceChildren(...esqueletos.map((n) => n.cloneNode(true)));
  lista.setAttribute('aria-busy', 'true');
  try {
    const res = await fetch(API + '/vitrine/cursos', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(res.status);
    const dados = await res.json();
    if (!Array.isArray(dados && dados.cursos)) throw new Error('formato');
    cursos = dados.cursos.filter((c) => c && c.id != null && txt(c.titulo)).map((c) => {
      const o = {
        id: String(c.id), titulo: txt(c.titulo), subtitulo: txt(c.subtitulo), cargaHoraria: txt(c.cargaHoraria),
        modalidade: txt(c.modalidade), icone: txt(c.iconeKey), capaUrl: c.capaUrl, modulos: num(c.modulos), aulas: num(c.aulas)
      };
      o.area = casa(o.titulo + ' ' + o.subtitulo) || casa(txt(c.descricao));
      o.mod = modDe(o.modalidade);
      return o;
    });
    carregado = true;
    render();
  } catch (e) {
    lista.replaceChildren();
    lista.setAttribute('aria-busy', 'false');
    estadoCat(E.falha, E.tentar, carregar);
  }
}

const rotuloDe = (n) => d.querySelector('input[name=' + n + ']:checked').parentNode.textContent.trim();
const aplicar = () => {
  tx('bs-filtros-resumo', 'Área: ' + rotuloDe('bs-area') + ' · Modalidade: ' + rotuloDe('bs-modalidade'));
  if (carregado) render();
};
const marcarRadio = (n, v) => qsa('input[name=' + n + ']').forEach((r) => { r.checked = r.value === v; });
function limparFiltros() {
  Object.assign(filtro, { area: 'todas', modalidade: 'todas', q: '' });
  busca.value = '';
  marcarRadio('bs-area', 'todas');
  marcarRadio('bs-modalidade', 'todas');
  aplicar();
}
qsa('input[name=bs-area], input[name=bs-modalidade]').forEach((r) => on(r, 'change', () => { filtro[r.name.slice(3)] = r.value; aplicar(); }));
let buscaT = 0;
on(busca, 'input', () => {
  clearTimeout(buscaT);
  buscaT = setTimeout(() => { filtro.q = busca.value; aplicar(); }, 180);
});
const alternar = $('bs-filtros-alternar');
on(alternar, 'click', () => {
  const abrir = alternar.getAttribute('aria-expanded') !== 'true';
  alternar.setAttribute('aria-expanded', abrir);
  $('bs-filtros-grupos').classList.toggle('is-aberto', abrir);
});
qsa('[data-bs-area]').forEach((a) => on(a, 'click', () => {
  filtro.area = a.dataset.bsArea;
  marcarRadio('bs-area', filtro.area);
  aplicar();
}));
carregar();

/* ================= 3 · CONCURSO DE BOLSAS ================= */
const secao = $('bolsas'), bf = $('bs-bolsa'), F = bf.elements, bErro = $('bf-erro'), bEnviar = $('bf-enviar'), conf = $('bf-confirmacao'), B = bErro.dataset;
const palco = d.querySelector('.bs-cred-palco'), cred = $('bs-cred'), camadas = qsa('.bs-cred__camada', cred);
const PADRAO = 'dmc business school';
const rotuloEnviar = bEnviar.firstElementChild.textContent;
let semente = PADRAO, seloT = 0, seloUlt = 0, seloPronto = false;

// credencial viva: só no navegador
function desenharSelo() {
  const i = camadas[0].classList.contains('is-ativa') ? 0 : 1, nova = camadas[1 - i];
  nova.replaceChildren(...roseta(semente).map((p) => svg('path', { d: p })));
  camadas[i].classList.remove('is-ativa');
  nova.classList.add('is-ativa');
}
function agendarSelo(n) {
  const s = norm(n) || PADRAO;
  if (s === semente) return;
  semente = s;
  if (!seloPronto || seloT) return;
  seloT = setTimeout(() => requestAnimationFrame(() => { seloT = 0; seloUlt = Date.now(); desenharSelo(); }), Math.max(0, 160 - (Date.now() - seloUlt)));
}
const iniciais = (n) => {
  const p = n.split(' ').filter(Boolean);
  return p.length ? ([...p[0]][0] + (p.length > 1 ? [...p[p.length - 1]][0] : '')).toUpperCase() : '';
};
function atualizarCred() {
  const n = F.nome.value.trim().replace(/\s+/g, ' '), cid = F.cidade.value.trim(), uf = F.uf.value;
  tx('bs-cred-nome', n || 'Seu nome');
  tx('bs-cred-area', AREAS[F.area.value] || 'A escolher');
  tx('bs-cred-local', cid && uf ? cid + ' · ' + uf : cid || uf || '—');
  tx('bs-cred-monograma', iniciais(n));
  agendarSelo(n);
}

if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  let raf = 0, ev = null;
  const inclinar = () => {
    raf = 0;
    if (!ev) return;
    const b = palco.getBoundingClientRect(), x = (ev.clientX - b.left) / b.width - 0.5, y = (ev.clientY - b.top) / b.height - 0.5;
    cred.classList.add('is-inclinando');
    cred.style.transform = 'rotateX(' + (-y * 7).toFixed(2) + 'deg) rotateY(' + (x * 9).toFixed(2) + 'deg)';
  };
  on(palco, 'pointermove', (e) => { if (!REDUZ.matches) { ev = e; raf = raf || requestAnimationFrame(inclinar); } });
  on(palco, 'pointerleave', () => {
    ev = null;
    cancelAnimationFrame(raf);
    raf = 0;
    cred.classList.remove('is-inclinando');
    cred.style.transform = '';
  });
}

// desenha perto da tela; rotação CSS pausa fora
function preparar() {
  if (seloPronto) return;
  seloPronto = true;
  desenharSelo();
  $('bs-fundo-roseta').replaceChildren(...roseta('complexo dmc', innerWidth >= 768).map((p) => svg('path', { d: p })));
}
if ('IntersectionObserver' in window) {
  new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) preparar();
    secao.classList.toggle('is-visivel', e.isIntersecting);
  }), { rootMargin: '300px 0px' }).observe(secao);
} else preparar();

// contrato da API (servidor revalida)
const REGRAS = {
  nome: (v) => v.length >= 2 && v.length <= 120 && /\p{L}/u.test(v),
  email: (v) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
  whatsapp: (v) => /^(\d{10,13})?$/.test(v.replace(/\D/g, '')),
  cidade: (v) => v.length >= 2 && v.length <= 80,
  uf: (v) => /^[A-Z]{2}$/.test(v),
  perfil: (v) => !!v,
  area: (v) => !!AREAS[v],
  motivacao: (v) => v.length <= 400,
  consentimento: () => F.consentimento.checked
};
const CAMPOS = Object.keys(REGRAS);
const alvoDe = (n) => (!CAMPOS.includes(n) ? null : n === 'perfil' ? $('bf-perfil') : F[n]);
const controles = (n, alvo) => (n === 'perfil' ? qsa('input', alvo) : [alvo]);
const validar = () => Object.fromEntries(CAMPOS.filter((n) => !REGRAS[n](F[n].value.trim())).map((n) => [n, alvoDe(n).dataset.erro]));
const descr = (alvo, id, por) => {
  const l = (alvo.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && x !== id);
  if (por) l.push(id);
  if (l.length) alvo.setAttribute('aria-describedby', l.join(' ')); else alvo.removeAttribute('aria-describedby');
};
function marcar(n, msg) {
  const alvo = alvoDe(n), id = 'bf-' + n + '-erro';
  if (!alvo) return null;
  let p = $(id);
  if (!p) {
    p = el('p', 'bs-erro-campo');
    p.id = id;
    (n === 'perfil' ? alvo : alvo.closest('.bs-campo, .bs-aceite')).appendChild(p);
  }
  p.textContent = String(msg);
  descr(alvo, id, true);
  if (n === 'perfil') alvo.dataset.invalido = '';
  const cs = controles(n, alvo);
  cs.forEach((c) => c.setAttribute('aria-invalid', 'true'));
  return cs[0];
}
function desmarcar(n) {
  const alvo = alvoDe(n), p = $('bf-' + n + '-erro');
  if (p) p.remove();
  if (!alvo) return;
  descr(alvo, 'bf-' + n + '-erro', false);
  delete alvo.dataset.invalido;
  controles(n, alvo).forEach((c) => c.removeAttribute('aria-invalid'));
}
const mostrarErros = (erros) => {
  let primeiro = null;
  CAMPOS.forEach((n) => { const c = erros[n] ? marcar(n, erros[n]) : null; primeiro = primeiro || c; });
  if (primeiro) primeiro.focus();
  return !!primeiro;
};

const contar = () => tx('bf-contador', F.motivacao.value.length + '/400');
on(bf, 'input', (e) => {
  const n = e.target.name;
  bErro.textContent = '';
  desmarcar(n);
  if (n === 'motivacao') contar();
  if (n === 'nome' || n === 'cidade') atualizarCred();
});
on(bf, 'change', (e) => {
  desmarcar(e.target.name);
  if (e.target.name === 'area' || e.target.name === 'uf') atualizarCred();
});

function payload() {
  const p = params(), wa = F.whatsapp.value.replace(/\D/g, ''), mot = F.motivacao.value.trim();
  const o = {
    nome: F.nome.value.trim(), email: F.email.value.trim().toLowerCase(), cidade: F.cidade.value.trim(), uf: F.uf.value,
    perfil: F.perfil.value, area: F.area.value, consentimento: F.consentimento.checked, comunicacoes: F.comunicacoes.checked,
    website: F.website.value, pagina: 'business-school'
  };
  if (wa) o.whatsapp = wa;
  if (mot) o.motivacao = mot;
  ['source', 'medium', 'campaign', 'content'].forEach((k) => {
    const v = (p.get('utm_' + k) || '').replace(/[^\w.-]/g, '').slice(0, 80);
    if (v) o['utm_' + k] = v;
  });
  return o;
}
const ocupadoB = (sim) => {
  bf.setAttribute('aria-busy', sim);
  bEnviar.disabled = sim;
  bEnviar.firstElementChild.textContent = sim ? bEnviar.dataset.ocupado : rotuloEnviar;
};

function confirmar(dados) {
  const prot = typeof dados.protocolo === 'string' ? dados.protocolo : '', mob = innerWidth < 1024;
  const caso = dados.duplicada ? 'dup' : prot ? 'ok' : 'sem';
  casos(conf, caso);
  casos($('bs-carimbo'), caso);
  tx('bf-conf-codigo', prot);
  tx('bs-cred-protocolo', prot || 'registrado');
  tx('bs-carimbo-protocolo', prot);
  bf.hidden = true;
  conf.hidden = false;
  cred.classList.remove('is-carimbada');
  void cred.offsetWidth;
  cred.classList.add('is-carimbada');
  conf.focus({ preventScroll: true });
  (mob ? palco : conf).scrollIntoView({ behavior: suave(), block: mob ? 'start' : 'nearest' });
}

on(bf, 'submit', async (e) => {
  e.preventDefault();
  if (bEnviar.disabled) return;
  bErro.textContent = '';
  CAMPOS.forEach(desmarcar);
  const erros = validar();
  if (Object.keys(erros).length) {
    bErro.textContent = B.revise;
    mostrarErros(erros);
    return;
  }
  ocupadoB(true);
  let res, dados = null;
  try {
    res = await fetch(API + '/bolsas/pre-inscricao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload())
    });
    dados = await res.json().catch(() => null);
  } catch (x) {
    ocupadoB(false);
    comContato(bErro, B.rede);
    return;
  }
  ocupadoB(false);
  const st = res.status;
  if ((st === 201 || st === 200) && dados && dados.ok === true) { confirmar(dados); return; }
  if (st === 400 && dados && dados.campos && typeof dados.campos === 'object') {
    bErro.textContent = typeof dados.error === 'string' ? dados.error : B.revise;
    if (!mostrarErros(dados.campos)) comContato(bErro, B.falha);
    return;
  }
  comContato(bErro, B['s' + st] || B.falha);
});

const indicar = $('bs-indicar'), I = indicar.dataset;
on(indicar, 'click', async () => {
  const url = location.origin + location.pathname + '#bolsas';
  tx('bs-indicar-status', '');
  if (navigator.share) {
    try {
      await navigator.share({ title: I.titulo, text: I.texto, url });
      return;
    } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    tx('bs-indicar-status', I.copiado);
  } catch (e) { tx('bs-indicar-status', I.copie + ' ' + url); }
});

contar();
atualizarCred();
