/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/contratos.js (F4b)
   Contratos — PORTAL-UX.md §6.10 (lista); PORTAL-API.md §6.8.4.
   Segmento Pendentes (n) · Assinados · Cancelados · Todos; linha com
   título, nº da matrícula, curso, data (disponibilizado em / assinado
   em) e situação; ações [Visualizar], [Assinar] (pendente) e
   [Comprovante de assinatura] (assinado). A assinatura em si fica em
   contrato.html?id=. HTML só por DMC_UI.html.
   ============================================================= */
(function () {
  'use strict';

  const API = Object.freeze({ lista: '/portal/me/contratos' });
  const UI = window.DMC_UI;
  if (!UI || !window.DMC_Portal) return;
  const html = UI.html;

  const ROTULO = Object.freeze({ pendente: 'Pendente', assinado: 'Assinado', cancelado: 'Cancelado' });
  const TOM = Object.freeze({ pendente: 'aviso', assinado: 'sucesso', cancelado: 'neutro' });
  const FILTROS = ['pendente', 'assinado', 'cancelado', 'todos'];

  function linha(c) {
    const url = `contrato.html?id=${encodeURIComponent(c.id)}`;
    const data = c.status === 'assinado' && c.assinadoEm
      ? `Assinado em ${UI.fmt.dataHora(c.assinadoEm)}`
      : c.status === 'cancelado' && c.canceladoEm
        ? `Cancelado em ${UI.fmt.data(c.canceladoEm)}`
        : `Disponibilizado em ${UI.fmt.data(c.disponivelEm)}`;
    const acoes = [html`<a class="dmc-btn dmc-btn--secondary" href="${url}">Visualizar</a>`];
    if (c.status === 'pendente') acoes.push(html`<a class="dmc-btn dmc-btn--primary" href="${url}#assinar">Assinar</a>`);
    if (c.codigoVerificacao) acoes.push(html`<a class="dmc-btn dmc-btn--link" href="${url}&amp;comprovante=1">Comprovante de assinatura</a>`);
    return html`<li class="pf-doc-contrato" data-doc-contrato="${c.id}">
      <div>
        <p class="pf-doc-contrato__titulo">${c.titulo}</p>
        <ul class="pf-doc-contrato__dados">
          <li class="pf-doc-meta">Matrícula ${c.matriculaNumero || '—'}</li>
          <li class="pf-doc-meta">${c.cursoTitulo || 'Curso'}</li>
          <li class="pf-doc-meta">${data}</li>
          ${c.codigoVerificacao ? html`<li class="pf-doc-meta">Código ${c.codigoVerificacao}</li>` : ''}
        </ul>
      </div>
      <div class="pf-doc-contrato__acoes">${UI.estado(ROTULO[c.status] || c.status, TOM[c.status] || 'neutro')}${acoes}</div>
    </li>`;
  }

  async function boot(ctx) {
    const lista = document.getElementById('pf-doc-contratos');
    const filtroEl = document.getElementById('pf-doc-filtro');
    if (!lista) return;
    let dados = null;
    let filtro = FILTROS.includes(ctx.params.get('status')) ? ctx.params.get('status') : null;
    let controle = null;

    function desenhar() {
      const itens = dados.itens || [];
      const conta = (s) => itens.filter((c) => c.status === s).length;
      if (!filtro) filtro = conta('pendente') ? 'pendente' : 'todos';
      if (!controle) {
        controle = UI.filtros(filtroEl, {
          rotulo: 'Situação dos contratos',
          valor: filtro,
          opcoes: [
            { valor: 'pendente', rotulo: 'Pendentes', contador: conta('pendente') },
            { valor: 'assinado', rotulo: 'Assinados', contador: conta('assinado') },
            { valor: 'cancelado', rotulo: 'Cancelados', contador: conta('cancelado') },
            { valor: 'todos', rotulo: 'Todos', contador: itens.length }
          ],
          aoMudar: (v) => { filtro = v; desenharLista(); }
        });
      }
      desenharLista();
    }

    function desenharLista() {
      if (!(dados.itens || []).length) {
        UI.estadoVazio(lista, { icone: 'navContratos', titulo: 'Nenhum contrato disponível para você.', texto: 'Quando a coordenação anexar o contrato da sua matrícula, ele aparece aqui para leitura e assinatura.' });
        return;
      }
      const itens = (dados.itens || []).filter((c) => filtro === 'todos' || c.status === filtro);
      if (!itens.length) {
        UI.estadoVazio(lista, { titulo: `Nenhum contrato em “${{ pendente: 'Pendentes', assinado: 'Assinados', cancelado: 'Cancelados' }[filtro] || 'Todos'}”.`, texto: 'Escolha outra situação acima para ver os demais contratos.' });
        return;
      }
      lista.innerHTML = html`<ul class="pf-doc-lista">${itens.map(linha)}</ul>`;
      lista.setAttribute('aria-busy', 'false');
    }

    async function carregar() {
      UI.esqueleto(lista, { tipo: 'lista', linhas: 2 });
      try {
        dados = await window.DMC_Api.get(API.lista, { sinal: ctx.sinal });
        desenhar();
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        UI.erroCarga(lista, err, { tentarDeNovo: carregar });
      }
    }

    await carregar();
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'contratos' });
})();
