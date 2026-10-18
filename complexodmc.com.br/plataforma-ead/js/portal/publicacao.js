/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/publicacao.js (F7)
   Detalhe da publicação — PORTAL-UX §6.13 · PORTAL-API §6.11.1.
   publicacao.html?id=<id>: título, autor, data e público; conteúdo
   por tipo — vídeo (DMC_Video da F1b, iframe por DOM API), texto
   (até 46rem, como TEXTO), link externo ([Abrir link] + domínio
   visível, rel="noopener noreferrer", só https) e PDF ([Baixar PDF],
   autenticado por DMC_UI.baixar). Abrir marca a notificação como lida
   (no servidor). Fora do público → 404 → "não encontrada".
   ============================================================= */
(function () {
  'use strict';

  const API = {
    item: (id) => `/portal/publicacoes/${encodeURIComponent(id)}`,
    arquivo: (id) => `/portal/publicacoes/${encodeURIComponent(id)}/arquivo`
  };
  const UI = window.DMC_UI;
  const html = UI.html;
  const ID_RE = /^[a-f0-9]{24}$/;
  const ROTULO_TIPO = { video: 'Vídeo', texto: 'Texto', link: 'Link', pdf: 'PDF' };
  const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' });
  const fmtData = (iso) => (iso ? (UI.fmt && UI.fmt.data ? UI.fmt.data(iso, 'longa') : FMT_DATA.format(new Date(iso))) : '');
  let video = null;

  function autorDe(a) {
    if (!a || !a.nome) return '';
    if (a.papel === 'admin') return 'Coordenação';
    return a.papel === 'professor' ? `${a.nome} · Professor(a)` : a.nome;
  }
  function publicoDe(p) {
    if (!p) return '';
    if (p.tipo === 'todos') return 'Todos os alunos';
    const nomes = [].concat(p.turmas || [], p.cursos || []).filter(Boolean);
    return nomes.join(', ');
  }
  /** Só https; devolve { href, dominio } ou null. */
  function linkSeguro(url) {
    try {
      const u = new URL(String(url || ''));
      if (u.protocol !== 'https:' || u.username || u.password) return null;
      return { href: u.href, dominio: u.hostname };
    } catch { return null; }
  }

  function naoEncontrada(alvo) {
    document.title = 'Publicação não encontrada · Plataforma Complexo DMC';
    const h1 = document.querySelector('[data-com-titulo]');
    h1.textContent = 'Publicação não encontrada';
    UI.estadoVazio(alvo, {
      titulo: 'Não encontramos esta publicação.',
      texto: 'Ela pode ter sido arquivada ou não ser destinada aos seus cursos.',
      acao: { rotulo: 'Ver as publicações', href: 'publicacoes.html' }
    });
  }

  function desenhar(alvo, p) {
    document.title = `${p.titulo} · Publicações · Plataforma Complexo DMC`;
    const h1 = document.querySelector('[data-com-titulo]');
    h1.textContent = p.titulo;
    const meta = document.querySelector('[data-com-meta]');
    meta.textContent = [ROTULO_TIPO[p.tipo] || 'Publicação', autorDe(p.autor), fmtData(p.publicadaEm), publicoDe(p.publico)].filter(Boolean).join(' · ');

    let conteudo = '';
    if (p.tipo === 'texto' || p.corpo) {
      const paragrafos = String(p.corpo || '').split(/\n[ \t]*\n+/).map((s) => s.trim()).filter(Boolean);
      conteudo = html`<div class="pf-leitura">${paragrafos.map((s) => html`<p class="pf-com-texto">${s}</p>`)}</div>`;
    }
    let acoes = '';
    if (p.tipo === 'link') {
      const l = linkSeguro(p.url);
      acoes = l
        ? html`<div class="pf-com-detalhe__acoes"><a class="dmc-btn dmc-btn--primary" href="${l.href}" target="_blank" rel="noopener noreferrer">Abrir link<span class="dmc-sr-only"> (abre em nova aba)</span> ${UI.icone('linkExterno')}</a><span class="pf-com-dominio">${l.dominio}</span></div>`
        : html`<div class="pf-alerta pf-alerta--aviso" role="status"><p>O endereço desta publicação não é seguro (https) e não será aberto.</p></div>`;
    }
    if (p.tipo === 'pdf' && p.temPdf) {
      acoes = html`<div class="pf-com-detalhe__acoes"><button type="button" class="dmc-btn dmc-btn--primary" data-com-baixar>Baixar PDF</button></div>`;
    }
    alvo.innerHTML = html`${p.tipo === 'video' ? html`<div class="pf-com-detalhe__midia pf-palco" data-com-video></div>` : ''}${resumo(p)}${acoes}${conteudo}`;
    alvo.setAttribute('aria-busy', 'false');

    if (p.tipo === 'video') {
      const palco = alvo.querySelector('[data-com-video]');
      if (window.DMC_Video && typeof window.DMC_Video.montar === 'function' && p.video) {
        video = window.DMC_Video.montar(palco, p.video, { titulo: p.titulo });
      } else {
        palco.innerHTML = html`<div class="pf-alerta pf-alerta--aviso" role="status"><p>O vídeo não pôde ser exibido agora. Tente recarregar a página.</p></div>`;
      }
    }
    const baixar = alvo.querySelector('[data-com-baixar]');
    if (baixar) {
      baixar.addEventListener('click', async () => {
        UI.ocupado(baixar, true, 'Baixando…');
        try {
          await UI.baixar(API.arquivo(p.id), `${String(p.titulo).replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'publicacao'}.pdf`);
        } catch (err) {
          UI.toast((err && err.message) || 'Não foi possível baixar o PDF agora.', { tipo: 'erro' });
        } finally {
          UI.ocupado(baixar, false);
        }
      });
    }
  }
  function resumo(p) {
    return p.resumo ? html`<p class="pf-com-detalhe__meta">${p.resumo}</p>` : '';
  }

  async function carregar(ctx) {
    const alvo = document.querySelector('[data-com-detalhe]');
    const params = ctx && ctx.params ? ctx.params : new URLSearchParams(window.location.search);
    const id = params.get('id') || '';
    if (!ID_RE.test(id)) { alvo.setAttribute('aria-busy', 'false'); naoEncontrada(alvo); return; }
    UI.esqueleto(alvo, { tipo: 'texto', linhas: 4 });
    let p;
    try {
      p = await window.DMC_Api.get(API.item(id), { silencioso404: true });
    } catch (err) {
      alvo.setAttribute('aria-busy', 'false');
      if (err && err.status === 404) { naoEncontrada(alvo); return; }
      UI.erroCarga(alvo, err, { tentarDeNovo: () => carregar(ctx) });
      return;
    }
    if (!p || !p.id) { naoEncontrada(alvo); return; }
    desenhar(alvo, p);
    // a notificação foi marcada como lida no servidor: o sino recalcula
    const shell = window.DMC_Shell;
    if (shell && shell.notificacoes && typeof shell.notificacoes.atualizar === 'function') {
      shell.notificacoes.atualizar().catch(() => { /* sino segue como estava */ });
    }
  }

  window.addEventListener('pagehide', () => { if (video && typeof video.destruir === 'function') video.destruir(); });
  window.DMC_Portal.iniciar((ctx) => carregar(ctx), { pagina: 'publicacoes' });
})();
