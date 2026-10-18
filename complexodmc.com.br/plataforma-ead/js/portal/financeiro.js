/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/financeiro.js (F5)
   Financeiro do aluno — PORTAL-UX.md §6.7; PORTAL-API §6.9, §8.10.
   EXCEÇÃO 1 (CEO-1): lançamentos registrados à mão pela coordenação;
   sem pagamento on-line, sem "Meus cartões", sem botão falso. KPIs e
   status vêm do servidor (centavos; virada de dia em São Paulo); nada
   é calculado nem inventado aqui. Chips na URL (?status=). 2ª via por
   link https (rel="noopener noreferrer") ou PDF baixado com o token.
   HTML só por DMC_UI.html (escape). Prefixo próprio: pf-fin-.
   ============================================================= */
(function () {
  'use strict';

  const API = Object.freeze({
    financeiro: (status) => `/portal/me/financeiro${status && status !== 'todos' ? `?status=${encodeURIComponent(status)}` : ''}`,
    segundaVia: (id) => `/portal/me/financeiro/lancamentos/${encodeURIComponent(id)}/segunda-via`
  });
  const LINK_ATENDIMENTO = 'atendimentos.html?novo=1&categoria=financeiro';
  const CHIPS = Object.freeze([
    { valor: 'todos', rotulo: 'Todos' },
    { valor: 'aberto', rotulo: 'Em aberto' },
    { valor: 'atrasado', rotulo: 'Em atraso' },
    { valor: 'pago', rotulo: 'Pagos' },
    { valor: 'cancelado', rotulo: 'Cancelados' }
  ]);
  const ROTULO_CHIP = Object.freeze({ todos: 'Todos', aberto: 'Em aberto', atrasado: 'Em atraso', pago: 'Pagos', cancelado: 'Cancelados' });
  const UI = window.DMC_UI;
  if (!UI || !window.DMC_Portal) return;
  const html = UI.html;

  const moeda = (c) => (Number.isInteger(c) ? UI.fmt.moeda(c) : '—');
  function dia(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
  }
  const qtd = (n, um, varios) => (n === 0 ? 'nenhum' : n === 1 ? `1 ${um}` : `${n} ${varios}`);

  function anunciar(texto) {
    if (typeof UI.anunciar === 'function') { UI.anunciar(texto); return; }
    const el = document.getElementById('fin-anuncio');
    if (el) el.textContent = texto;
  }

  function situacao(item) {
    if (item.status === 'pago') return UI.estado(item.pagoEm ? `Pago em ${dia(item.pagoEm)}` : 'Pago', 'sucesso');
    if (item.status === 'atrasado') return UI.estado('Em atraso', 'erro');
    if (item.status === 'cancelado') return UI.estado('Cancelado', 'neutro');
    if (Number.isInteger(item.venceEmDias)) {
      const n = item.venceEmDias;
      return UI.estado(n === 0 ? 'Vence hoje' : n === 1 ? 'Vence em 1 dia' : `Vence em ${n} dias`, 'aviso');
    }
    return UI.estado('Em aberto', 'info');
  }

  function acaoDaLinha(item, links) {
    if (item.segundaVia && item.segundaVia.disponivel) {
      if (item.segundaVia.tipo === 'link') {
        const url = links.get(item.id);
        if (url) {
          return html`<a class="dmc-btn dmc-btn--secondary pf-fin-acao" href="${url}" target="_blank" rel="noopener noreferrer">2ª via ${UI.icone('linkExterno')}<span class="dmc-sr-only"> (abre em nova aba)</span></a>`;
        }
        return html`<span class="pf-fin-meta">2ª via indisponível agora</span>`;
      }
      return html`<button type="button" class="dmc-btn dmc-btn--secondary pf-fin-acao" data-pf-fin-pdf="${item.id}" data-pf-fin-venc="${item.vencimento}">2ª via (PDF) ${UI.icone('baixar')}</button>`;
    }
    if (item.status === 'aberto' || item.status === 'atrasado') {
      return html`<a class="dmc-btn dmc-btn--link pf-fin-acao" href="${LINK_ATENDIMENTO}">Pedir 2ª via</a>`;
    }
    return html`<span class="pf-fin-traco" aria-hidden="true">—</span>`;
  }

  function tabela(itens, links, chip) {
    const legenda = chip === 'todos' ? 'Lançamentos' : `Lançamentos · ${ROTULO_CHIP[chip]}`;
    return html`<table class="pf-tabela pf-fin-tabela">
      <caption>${legenda}</caption>
      <thead><tr>
        <th scope="col">Lançamento</th>
        <th scope="col">Vencimento</th>
        <th scope="col">Forma</th>
        <th scope="col" class="pf-fin-nowrap">NFS-e</th>
        <th scope="col" class="pf-tabela__num">Valor</th>
        <th scope="col">Situação</th>
        <th scope="col" class="pf-tabela__acoes pf-nao-imprimir"><span class="dmc-sr-only">Ações</span></th>
      </tr></thead>
      <tbody>${itens.map((i) => html`<tr data-pf-fin-linha="${i.id}">
        <th scope="row" class="pf-fin-lanc">
          <span class="pf-fin-lanc__tipo">${i.rotuloTipo}</span>
          ${i.descricao ? html`<span class="pf-fin-meta">${i.descricao}</span>` : ''}
          ${i.cursoTitulo || i.matriculaNumero ? html`<span class="pf-fin-meta">${[i.cursoTitulo, i.matriculaNumero].filter(Boolean).join(' · ')}</span>` : ''}
        </th>
        <td data-rotulo="Vencimento" class="pf-fin-nowrap">${dia(i.vencimento)}</td>
        <td data-rotulo="Forma">${i.formaRotulo || '—'}</td>
        <td data-rotulo="NFS-e">${i.nfseNumero || '—'}</td>
        <td data-rotulo="Valor" class="pf-tabela__num">${moeda(i.status === 'pago' && Number.isInteger(i.valorPagoCentavos) ? i.valorPagoCentavos : i.valorCentavos)}${i.status === 'pago' && Number.isInteger(i.valorPagoCentavos) && i.valorPagoCentavos !== i.valorCentavos ? html`<span class="pf-fin-meta">devido ${moeda(i.valorCentavos)}</span>` : ''}</td>
        <td data-rotulo="Situação">${situacao(i)}</td>
        <td class="pf-tabela__acoes pf-nao-imprimir">${acaoDaLinha(i, links)}</td>
      </tr>`)}</tbody>
    </table>`;
  }

  /** URLs das 2ªs vias por link (a lista não traz a URL; ela sai só pela rota do titular). */
  async function carregarLinks(itens, sinal) {
    const mapa = new Map();
    const comLink = itens.filter((i) => i.segundaVia && i.segundaVia.disponivel && i.segundaVia.tipo === 'link').slice(0, 30);
    await Promise.all(comLink.map(async (i) => {
      try {
        const r = await window.DMC_Api.get(API.segundaVia(i.id), { sinal });
        if (r && typeof r.url === 'string' && /^https:\/\//i.test(r.url)) mapa.set(i.id, r.url);
      } catch (_e) { /* fica "indisponível agora" na linha */ }
    }));
    return mapa;
  }

  async function boot(ctx) {
    const resumo = document.getElementById('fin-resumo');
    const filtroEl = document.getElementById('fin-filtro');
    const listaEl = document.getElementById('fin-lista');
    const impressao = document.getElementById('fin-impressao');
    const imprimir = document.getElementById('fin-imprimir');
    const aviso = document.querySelector('#fin-aviso .pf-alerta');
    const atalhos = document.getElementById('fin-atalhos');
    // O alerta é estático (sem salto de leiaute); só o glifo entra pela coluna reservada a ele.
    if (aviso && !aviso.querySelector('svg')) aviso.insertAdjacentHTML('afterbegin', String(UI.icone('estadoInfo')));

    const inicial = ctx.params.get('status');
    let chip = CHIPS.some((c) => c.valor === inicial) ? inicial : 'todos';
    let controle = null;

    imprimir.addEventListener('click', () => window.print());
    listaEl.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pf-fin-pdf]');
      if (!b) return;
      UI.ocupado(b, true, 'Baixando…');
      try {
        await UI.baixar(API.segundaVia(b.getAttribute('data-pf-fin-pdf')), `segunda-via-${b.getAttribute('data-pf-fin-venc') || 'lancamento'}.pdf`);
        anunciar('Segunda via baixada.');
      } catch (err) {
        UI.toast((err && err.message) || 'Não foi possível baixar a 2ª via agora. Tente de novo.', { tipo: 'erro' });
      } finally {
        UI.ocupado(b, false);
      }
    });

    let primeira = true;
    async function carregar() {
      // Na 1ª carga o esqueleto fica no resumo (HTML); depois, a lista mostra o próprio esqueleto.
      if (!primeira) UI.esqueleto(listaEl, { tipo: 'tabela', linhas: 4 });
      primeira = false;
      let dados;
      try {
        dados = await window.DMC_Api.get(API.financeiro(chip), { sinal: ctx.sinal });
      } catch (err) {
        if (ctx.sinal && ctx.sinal.aborted) return;
        resumo.setAttribute('aria-busy', 'false');
        resumo.replaceChildren();
        listaEl.replaceChildren();
        UI.erroCarga(listaEl, err, { tentarDeNovo: () => carregar() });
        listaEl.setAttribute('aria-busy', 'false');
        atalhos.hidden = false;
        return;
      }
      atalhos.hidden = false;
      const contagens = dados.contagens || {};
      const k = dados.kpis || {};
      resumo.setAttribute('aria-busy', 'false');

      if (!contagens.todos) {
        resumo.replaceChildren();
        filtroEl.replaceChildren();
        impressao.textContent = '';
        UI.estadoVazio(listaEl, {
          titulo: 'Nenhum lançamento registrado na sua conta.',
          texto: 'Se você fez um pagamento e ele não aparece aqui, fale com o atendimento.',
          acao: { rotulo: 'Abrir atendimento', href: LINK_ATENDIMENTO }
        });
        return;
      }

      const atraso = k.emAtraso || { valorCentavos: 0, qtd: 0 };
      UI.kpis(resumo, [
        { rotulo: 'Total', valor: moeda(k.total && k.total.valorCentavos), nota: qtd((k.total && k.total.qtd) || 0, 'lançamento', 'lançamentos') },
        { rotulo: 'Em aberto', valor: moeda(k.emAberto && k.emAberto.valorCentavos), nota: qtd((k.emAberto && k.emAberto.qtd) || 0, 'lançamento', 'lançamentos') },
        { rotulo: 'Pago', valor: moeda(k.pago && k.pago.valorCentavos), nota: qtd((k.pago && k.pago.qtd) || 0, 'lançamento', 'lançamentos') },
        { rotulo: 'Em atraso', valor: moeda(atraso.valorCentavos), nota: qtd(atraso.qtd || 0, 'lançamento', 'lançamentos'), tom: atraso.valorCentavos > 0 ? 'erro' : null }
      ]);

      const opcoes = CHIPS.filter((c) => c.valor !== 'cancelado' || contagens.cancelado > 0 || chip === 'cancelado')
        .map((c) => ({ valor: c.valor, rotulo: c.rotulo, contador: Number.isInteger(contagens[c.valor]) ? contagens[c.valor] : null }));
      // Criado UMA vez (as contagens não mudam com o chip; o DMC_UI.filtros liga os ouvintes no contêiner).
      if (!controle) {
        controle = UI.filtros(filtroEl, {
          rotulo: 'Situação dos lançamentos', opcoes, valor: chip,
          aoMudar: (v) => {
            chip = v;
            const q = new URLSearchParams(window.location.search);
            if (v === 'todos') q.delete('status'); else q.set('status', v);
            try { window.history.replaceState(null, '', `${window.location.pathname}${q.toString() ? `?${q}` : ''}`); } catch (_e) { /* sem histórico */ }
            carregar();
          }
        });
      }

      const itens = Array.isArray(dados.itens) ? dados.itens : [];
      impressao.textContent = `Filtro: ${ROTULO_CHIP[chip]} · situação em ${dia(dados.hoje)}`;
      if (!itens.length) {
        UI.estadoVazio(listaEl, { titulo: `Nenhum lançamento em “${ROTULO_CHIP[chip]}”.`, texto: 'Escolha outra situação acima para ver os demais lançamentos.' });
        anunciar(`Nenhum lançamento em ${ROTULO_CHIP[chip]}.`);
        return;
      }
      const links = await carregarLinks(itens, ctx.sinal);
      listaEl.innerHTML = tabela(itens, links, chip);
      listaEl.setAttribute('aria-busy', 'false');
      anunciar(itens.length === 1 ? '1 lançamento.' : `${itens.length} lançamentos.`);
    }

    await carregar();
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'financeiro' });
})();
