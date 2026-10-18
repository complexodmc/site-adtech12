/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/publicacoes.js (F7)
   Publicações do aluno — PORTAL-UX §6.13 · PORTAL-API §6.11.1.
   - lista GET /portal/publicacoes (o servidor aplica o público:
     só chega o que é para esta conta); filtros por tipo e curso;
   - cards de mídia: vídeo do YouTube com a miniatura de i.ytimg.com
     (única origem de imagem externa na CSP); demais tipos com a capa
     tipográfica e o tipo em overline; "Nova" quando não vista;
   - o card inteiro é o link para publicacao.html?id=;
   - HTML só por DMC_UI.html; sem alert/confirm; vazio honesto.
   ============================================================= */
(function () {
  'use strict';

  const API = {
    lista: '/portal/publicacoes',
    cursos: '/portal/me/cursos'
  };
  const UI = window.DMC_UI;
  const html = UI.html;
  const ROTULO_TIPO = { video: 'Vídeo', texto: 'Texto', link: 'Link', pdf: 'PDF' };
  const TIPOS = [
    { valor: '', rotulo: 'Todas' }, { valor: 'video', rotulo: 'Vídeos' }, { valor: 'texto', rotulo: 'Textos' },
    { valor: 'link', rotulo: 'Links' }, { valor: 'pdf', rotulo: 'PDFs' }
  ];
  const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtData = (iso) => (iso ? (UI.fmt && UI.fmt.data ? UI.fmt.data(iso) : FMT_DATA.format(new Date(iso))) : '');
  const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

  const S = { tipo: '', cursoId: '', pagina: 1, totalPaginas: 1, itens: [], carregando: false };

  /** Autor como o aluno lê: "Ana Lima · Professora" ou "Coordenação". */
  function autorDe(a) {
    if (!a || !a.nome) return '';
    if (a.papel === 'admin') return 'Coordenação';
    return a.papel === 'professor' ? `${a.nome} · Professor(a)` : a.nome;
  }

  function midia(p) {
    const v = p.video;
    if (p.tipo === 'video' && v && v.provedor === 'youtube' && YT_ID_RE.test(String(v.id || ''))) {
      return html`<div class="pf-publicacao__midia">
          <img src="${`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`}" alt="" loading="lazy" decoding="async" width="480" height="270">
          <span class="pf-com-card__play" aria-hidden="true">${UI.icone('play')}</span>
        </div>`;
    }
    return html`<div class="pf-publicacao__midia">
        <div class="pf-capa pf-capa--larga pf-capa--tipografica" data-sigla="${ROTULO_TIPO[p.tipo] || 'Publicação'}" aria-hidden="true"></div>
        ${p.tipo === 'video' ? html`<span class="pf-com-card__play" aria-hidden="true">${UI.icone('play')}</span>` : ''}
        <p class="pf-com-card__tipo" aria-hidden="true">${ROTULO_TIPO[p.tipo] || 'Publicação'}</p>
      </div>`;
  }

  /** Card do aluno (o mesmo desenho que a prévia do editor usa). */
  function card(p) {
    const meta = [autorDe(p.autor), fmtData(p.publicadaEm), (p.publico && p.publico.cursos && p.publico.cursos.length) ? p.publico.cursos.join(', ') : ''].filter(Boolean).join(' · ');
    return html`<li><article class="pf-com-card" data-com-id="${p.id}">
        ${midia(p)}
        <div class="pf-com-card__corpo">
          <h2 class="pf-com-card__titulo"><a class="pf-com-card__link" href="${`publicacao.html?id=${encodeURIComponent(p.id)}`}">${p.titulo}</a></h2>
          ${p.resumo ? html`<p class="pf-com-card__resumo">${p.resumo}</p>` : ''}
          <p class="pf-com-card__meta">${meta}</p>
          ${p.nova ? html`<span class="pf-com-nova">Nova<span class="dmc-sr-only"> publicação, ainda não vista</span></span>` : ''}
          ${p.fixada ? html`<span class="pf-com-fixada">Fixada pela equipe</span>` : ''}
        </div>
      </article></li>`;
  }

  function desenhar() {
    const alvo = document.querySelector('[data-com-lista]');
    alvo.setAttribute('aria-busy', 'false');
    if (!S.itens.length) {
      alvo.innerHTML = '';
      UI.estadoVazio(alvo, {
        titulo: S.tipo || S.cursoId ? 'Nenhuma publicação com estes filtros.' : 'Nenhuma publicação para você ainda.',
        texto: S.tipo || S.cursoId ? 'Troque o tipo ou o curso para ver as demais.' : 'Quando a coordenação ou os professores dos seus cursos publicarem algo, aparece aqui.'
      });
    } else {
      alvo.innerHTML = html`<ul class="pf-com-grade" role="list">${S.itens.map(card)}</ul>`;
    }
    const mais = document.querySelector('[data-com-mais]');
    mais.hidden = S.pagina >= S.totalPaginas;
  }

  async function carregar({ acrescentar = false } = {}) {
    if (S.carregando) return;
    S.carregando = true;
    const alvo = document.querySelector('[data-com-lista]');
    const botao = document.querySelector('[data-com-carregar]');
    if (!acrescentar) { S.pagina = 1; UI.esqueleto(alvo, { tipo: 'cards', linhas: 3 }); } else UI.ocupado(botao, true, 'Carregando…');
    const q = new URLSearchParams();
    if (S.tipo) q.set('tipo', S.tipo);
    if (S.cursoId) q.set('cursoId', S.cursoId);
    q.set('pagina', String(S.pagina));
    try {
      const r = await window.DMC_Api.get(`${API.lista}?${q.toString()}`);
      const itens = r && Array.isArray(r.itens) ? r.itens : [];
      S.itens = acrescentar ? S.itens.concat(itens) : itens;
      S.totalPaginas = (r && r.totalPaginas) || 1;
      desenhar();
      if (acrescentar) UI.anunciar(`${itens.length} publicações carregadas.`);
    } catch (err) {
      alvo.setAttribute('aria-busy', 'false');
      UI.erroCarga(alvo, err, { tentarDeNovo: () => carregar() });
    } finally {
      S.carregando = false;
      if (acrescentar) UI.ocupado(botao, false);
    }
  }

  async function carregarCursos() {
    const campo = document.querySelector('[data-com-campo-curso]');
    const sel = document.querySelector('[data-com-curso]');
    try {
      const r = await window.DMC_Api.get(API.cursos);
      const cursos = (r && Array.isArray(r.itens) ? r.itens : []).map((i) => i && i.curso).filter((c) => c && c.id);
      if (cursos.length < 2) return; // um curso só: o filtro não acrescenta nada
      sel.insertAdjacentHTML('beforeend', html`${cursos.map((c) => html`<option value="${c.id}">${c.titulo}</option>`)}`);
      campo.hidden = false;
    } catch { /* sem a lista de cursos, o filtro some (estado honesto) */ }
  }

  function iniciar(ctx) {
    const p = ctx && ctx.params ? ctx.params : new URLSearchParams(window.location.search);
    const tipoInicial = p.get('tipo');
    if (tipoInicial && Object.prototype.hasOwnProperty.call(ROTULO_TIPO, tipoInicial)) S.tipo = tipoInicial;
    UI.filtros(document.querySelector('[data-com-tipos]'), {
      rotulo: 'Tipo de publicação', opcoes: TIPOS, valor: S.tipo,
      aoMudar: (v) => { S.tipo = v; carregar(); }
    });
    const sel = document.querySelector('[data-com-curso]');
    sel.addEventListener('change', () => { S.cursoId = sel.value; carregar(); });
    document.querySelector('[data-com-carregar]').addEventListener('click', () => {
      if (S.pagina >= S.totalPaginas) return;
      S.pagina += 1;
      carregar({ acrescentar: true });
    });
    carregarCursos();
    return carregar();
  }

  window.DMC_Portal.iniciar((ctx) => iniciar(ctx), { pagina: 'publicacoes' });
})();
