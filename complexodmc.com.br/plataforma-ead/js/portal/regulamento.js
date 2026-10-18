/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/regulamento.js (F6a)
   Regulamento acadêmico — PORTAL-UX §6.20 · PORTAL-API §6.10.5 · DC-70, D-81.
   - lê GET /portal/regulamento (geral + cursos do usuário, publicados);
   - corta `texto` em [inicio, fim) de cada trecho do SERVIDOR (o mesmo
     `fatiar` do assistente) e põe a âncora r-<regulamentoId>-<trechoId>;
     regulamento sem `trechos` sai inteiro, sem índice nem âncoras;
   - chegada por âncora: rola e foca o H3; âncora que não existe (edição
     arquivada) → foco no H1 + aviso com a edição tirada do trechoId;
   - texto renderizado como TEXTO (DMC_UI.html), nunca HTML.
   ============================================================= */
(function () {
  'use strict';

  const API = { regulamento: '/portal/regulamento' };
  const UI = window.DMC_UI;
  const html = UI.html;
  const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtData = (iso) => (iso ? (UI.fmt && UI.fmt.data ? UI.fmt.data(iso) : FMT_DATA.format(new Date(iso))) : '—');
  const ANCORA_RE = /^#r-([a-f0-9]{24})-(e(\d+)-t\d{3})$/;

  const ancora = (regId, trechoId) => `r-${regId}-${trechoId}`;
  const semMarca = (s) => String(s || '').replace(/^\s{0,3}#{1,6}\s+/, '').replace(/\s+/g, ' ').trim();

  /** Parágrafos do trecho (linha em branco separa); a 1ª linha some quando repete o título. */
  function paragrafosDoTrecho(texto, titulo) {
    const linhas = String(texto || '').split(/\r?\n/);
    if (linhas.length && semMarca(linhas[0]) === semMarca(titulo)) linhas.shift();
    return linhas.join('\n').split(/\n[ \t]*\n+/).map((p) => p.replace(/^\s{0,3}#{1,6}\s+/gm, '').trim()).filter(Boolean);
  }

  function rotuloGrupo(r) { return r.escopo === 'geral' ? 'Regulamento geral' : (r.cursoTitulo || r.titulo); }

  function desenhar(alvo, itens) {
    const indice = html`<nav class="pf-at-indice pf-nao-imprimir" aria-label="Seções do regulamento">
        <details open data-reg-detalhes>
          <summary>Seções</summary>
          ${itens.filter((r) => Array.isArray(r.trechos) && r.trechos.length).map((r) => html`<div class="pf-at-indice__grupo">
            <p class="pf-at-indice__titulo">${rotuloGrupo(r)}</p>
            <ul class="pf-at-indice__lista">${r.trechos.map((t) => html`<li><a class="pf-at-indice__link" href="#${ancora(r.id, t.id)}" data-reg-link="${ancora(r.id, t.id)}">${t.titulo}</a></li>`)}</ul>
          </div>`)}
        </details>
      </nav>`;
    const corpo = itens.map((r) => {
      const meta = html`<p class="pf-at-reg__meta">${r.escopo === 'geral' ? '' : html`Curso: ${r.cursoTitulo || '—'} · `}Edição ${r.edicao} · publicada em ${fmtData(r.publicadoEm)}</p>`;
      const temTrechos = Array.isArray(r.trechos) && r.trechos.length;
      const blocos = temTrechos
        ? r.trechos.map((t) => {
          const pedaco = typeof r.texto === 'string' ? r.texto.slice(t.inicio, t.fim) : '';
          return html`<section class="pf-at-trecho" id="${ancora(r.id, t.id)}" aria-labelledby="${ancora(r.id, t.id)}-h">
              <h3 id="${ancora(r.id, t.id)}-h" tabindex="-1">${t.titulo}</h3>
              ${paragrafosDoTrecho(pedaco, t.titulo).map((p) => html`<p>${p}</p>`)}
            </section>`;
        })
        : String(r.texto || '').split(/\n[ \t]*\n+/).filter((p) => p.trim()).map((p) => html`<p>${p.trim()}</p>`);
      return html`<article class="pf-at-reg" aria-labelledby="reg-${r.id}">
          <h2 class="pf-at-reg__titulo" id="reg-${r.id}">${r.titulo}</h2>
          ${meta}
          <div class="pf-leitura">${blocos}</div>
        </article>`;
    });
    const endereco = `${window.location.origin}${window.location.pathname}`;
    alvo.innerHTML = html`${indice}<div class="pf-at-texto">${corpo}<p class="pf-so-impressao pf-at-reg__meta">Texto em vigor publicado em ${endereco}</p></div>`;
    const det = alvo.querySelector('[data-reg-detalhes]');
    if (det && window.matchMedia && window.matchMedia('(max-width: 63.99em)').matches) det.open = false;
    observarSecoes(alvo);
    alvo.querySelectorAll('[data-reg-link]').forEach((a) => a.addEventListener('click', (ev) => {
      ev.preventDefault();
      const id = a.dataset.regLink;
      window.history.replaceState(null, '', `#${id}`);
      irPara(id);
      if (det && window.matchMedia && window.matchMedia('(max-width: 63.99em)').matches) det.open = false;
    }));
  }

  function irPara(id) {
    const sec = document.getElementById(id);
    if (!sec) return false;
    sec.scrollIntoView({ block: 'start' });
    const h = sec.querySelector('h3');
    if (h) h.focus({ preventScroll: true });
    marcarAtual(id);
    return true;
  }

  function marcarAtual(id) {
    document.querySelectorAll('[data-reg-link]').forEach((a) => {
      if (a.dataset.regLink === id) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
  }

  function observarSecoes(alvo) {
    if (!('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver((entradas) => {
      const visiveis = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visiveis.length) marcarAtual(visiveis[0].target.id);
    }, { rootMargin: '0px 0px -70% 0px' });
    alvo.querySelectorAll('.pf-at-trecho').forEach((s) => obs.observe(s));
  }

  function avisoAncoraAntiga(hash) {
    const m = ANCORA_RE.exec(hash);
    const aviso = document.querySelector('[data-reg-aviso]');
    const texto = m ? `O trecho citado era da edição ${m[3]}, que não está mais em vigor. Abaixo, o texto em vigor.` : 'O trecho citado não está mais em vigor.';
    if (aviso) aviso.innerHTML = html`<div class="pf-alerta pf-alerta--info" role="status"><p>${texto}</p></div>`;
    const h1 = document.querySelector('[data-reg-titulo]');
    if (h1) h1.focus();
  }

  async function carregar() {
    const alvo = document.querySelector('[data-reg-conteudo]');
    alvo.setAttribute('aria-busy', 'true');
    let r;
    try {
      r = await window.DMC_Api.get(API.regulamento);
    } catch (err) {
      UI.erroCarga(alvo, err, { tentarDeNovo: carregar });
      return;
    }
    alvo.setAttribute('aria-busy', 'false');
    const itens = (r && Array.isArray(r.itens)) ? r.itens : [];
    if (!itens.length) {
      alvo.innerHTML = html`<div class="pf-vazio"><p class="pf-vazio__titulo">A coordenação ainda não publicou o regulamento.</p><p class="pf-vazio__texto">Dúvidas sobre regras podem ser levadas à equipe pelo Atendimento.</p></div>`;
      return;
    }
    const imprimir = document.querySelector('[data-reg-imprimir]');
    if (imprimir) {
      imprimir.hidden = false;
      imprimir.addEventListener('click', () => window.print());
    }
    desenhar(alvo, itens);
    seguirAncora();
    window.addEventListener('hashchange', seguirAncora);
  }

  /** Âncora atual (#r-…): rola e foca o trecho; se não existe mais, avisa e foca o H1. */
  function seguirAncora() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#r-')) return;
    const aviso = document.querySelector('[data-reg-aviso]');
    if (aviso) aviso.textContent = '';
    if (!irPara(hash.slice(1))) avisoAncoraAntiga(hash);
  }

  window.DMC_Portal.iniciar(() => carregar(), { pagina: 'regulamento' });
})();
