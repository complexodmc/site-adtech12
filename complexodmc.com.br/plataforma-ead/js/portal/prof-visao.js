/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-visao.js (F8)
   Visão geral do backoffice — rota #/inicio.
   Spec: PORTAL-UX.md §7.2; PORTAL-API.md §6.12 (resumo), §6.11.3
   (painel da coordenação, F7); índice §7.8.

   Números reais (D7): cada KPI vem do resumo do professor (serviços de
   nome fixo do servidor) ou do painel da coordenação. Campo null =
   "—" + motivo, nunca 0. Zero real = "0" e "Nada pendente aqui."
   ============================================================= */
(function () {
  'use strict';
  const P = window.DMC_Professor;
  if (!P) return;

  const API = {
    duvidas: '/portal/professor/duvidas?status=pendentes&porPagina=5',
    painel: '/portal/admin/relatorios/painel'
  };
  const SEM_FONTE = 'indisponível no momento';

  function saudacao(agora) {
    const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(agora));
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function somar(cursos, campo) {
    if (!Array.isArray(cursos)) return null;
    let t = 0;
    for (const c of cursos) {
      const v = c[campo];
      if (v === null || v === undefined) return null;
      t += Number(v) || 0;
    }
    return t;
  }

  function encontros(cursos) {
    if (!Array.isArray(cursos)) return null;
    const lista = [];
    for (const c of cursos) {
      if (!Array.isArray(c.proximosEncontros)) return null;
      for (const e of c.proximosEncontros) lista.push({ ...e, cursoTitulo: c.titulo });
    }
    return lista.sort((a, b) => String(a.inicioEm || '').localeCompare(String(b.inicioEm || '')));
  }

  function htmlKpi(ui, k) {
    const valor = Number.isFinite(k.valor) ? ui.fmt.numero(k.valor) : '—';
    const nota = Number.isFinite(k.valor) ? (k.nota || '') : (k.motivo || SEM_FONTE);
    const corpo = ui.html`<span class="pf-kpi__rotulo pf-prof-kpi__rotulo">${k.rotulo}</span>
      <span class="pf-kpi__valor pf-prof-kpi__valor">${valor}</span>
      ${nota ? ui.html`<span class="pf-kpi__nota pf-prof-kpi__nota">${nota}</span>` : ''}`;
    return k.href && Number.isFinite(k.valor)
      ? ui.html`<li class="pf-kpi pf-prof-kpi"><a class="pf-prof-kpi__link" href="${k.href}">${corpo}</a></li>`
      : ui.html`<li class="pf-kpi pf-prof-kpi">${corpo}</li>`;
  }

  function htmlKpis(ui, titulo, kpis) {
    return ui.html`<section class="pf-prof-bloco" aria-labelledby="${`pf-prof-kpis-${titulo}`}">
      <h2 class="pf-prof-overline" id="${`pf-prof-kpis-${titulo}`}">${titulo}</h2>
      <ul class="pf-kpis pf-kpis--link pf-prof-kpis">${kpis.map((k) => htmlKpi(ui, k))}</ul>
    </section>`;
  }

  async function montar(el, ctx) {
    const ui = ctx.ui;
    const agora = new Date();
    const nome = P.primeiroNome(ctx.user && ctx.user.nome);
    // H1: "Boa tarde, <nome>" (itálico só no nome) + data na descrição.
    const h1 = document.querySelector('[data-pf-prof-h1]');
    if (h1) h1.replaceChildren(ui.nos(ui.html`${saudacao(agora)}${nome ? ui.html`, <em>${nome}</em>` : ''}`));
    const desc = document.querySelector('[data-pf-prof-descricao]');
    if (desc) {
      const d = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' });
      desc.textContent = d.charAt(0).toUpperCase() + d.slice(1);
      desc.hidden = false;
    }
    document.title = `Visão geral · ${ctx.papel === 'admin' ? 'Coordenação' : 'Portal do Professor'} · Plataforma Complexo DMC`;

    ui.esqueleto(el, { tipo: 'cards', linhas: 4 });
    const admin = ctx.papel === 'admin';
    const [r, duvidas, painel] = await Promise.all([
      P.resumo({ recarregar: true }),
      ctx.api.get(API.duvidas, { sinal: ctx.sinal }).catch((err) => ({ __erro: err })),
      admin ? ctx.api.get(API.painel, { silencioso404: true, sinal: ctx.sinal }).catch(() => null) : Promise.resolve(null)
    ]);
    el.removeAttribute('aria-busy');

    if (!r) {
      ui.alerta(el, { tom: 'erro', titulo: 'Não foi possível carregar a visão geral.', texto: 'Tente de novo em instantes.' });
      return;
    }
    const cursos = Array.isArray(r.cursos) ? r.cursos : [];
    if (!cursos.length) {
      ui.estadoVazio(el, admin
        ? { titulo: 'Nenhum curso cadastrado.', texto: 'Crie o primeiro em Conteúdo.', acao: { rotulo: 'Abrir Conteúdo', href: 'admin.html' } }
        : { titulo: 'Você ainda não está vinculado a nenhum curso.', texto: 'A coordenação faz esse vínculo em Equipe.' });
      return;
    }

    const prox = encontros(cursos);
    const proximo = prox && prox.length ? prox[0] : null;
    const semMatricula = admin && painel && painel.alunos && Number.isFinite(painel.alunos.liberacoesSemMatricula) ? painel.alunos.liberacoesSemMatricula : null;
    const ensino = [
      {
        rotulo: 'Alunos ativos', valor: somar(cursos, 'alunosAtivos'), href: '#/turmas', motivo: 'depende do módulo de matrículas',
        nota: semMatricula ? `${semMatricula} ${semMatricula === 1 ? 'acesso ainda sem matrícula' : 'acessos ainda sem matrícula'}` : ''
      },
      { rotulo: 'Correções pendentes', valor: somar(cursos, 'correcoesPendentes'), href: '#/correcao', motivo: 'depende do módulo de avaliações' },
      { rotulo: 'Dúvidas abertas', valor: somar(cursos, 'duvidasPendentes'), href: '#/duvidas' },
      { rotulo: 'Atendimentos abertos', valor: somar(cursos, 'atendimentosAbertos'), href: '#/atendimento', motivo: 'depende do módulo de atendimento' },
      {
        rotulo: 'Próximas aulas ao vivo', valor: prox ? prox.length : null, href: '#/ao-vivo', motivo: 'depende do módulo de aulas ao vivo',
        nota: proximo ? `${ui.fmt.data(proximo.inicioEm)} · ${ui.fmt.hora(proximo.inicioEm)}` : 'Nenhuma nos próximos 7 dias'
      }
    ];
    const blocos = [htmlKpis(ui, 'Ensino', ensino)];
    if (admin) {
      const n = (v) => (Number.isFinite(v) ? v : (v && Number.isFinite(v.qtd) ? v.qtd : null));
      const fin = painel && painel.financeiro ? painel.financeiro.emAtraso : null;
      blocos.push(htmlKpis(ui, 'Secretaria', [
        { rotulo: 'Documentos em revisão', valor: painel && painel.documentos ? n(painel.documentos.emRevisao) : null, href: '#/documentos', motivo: 'depende do módulo de documentos' },
        { rotulo: 'Contratos pendentes', valor: painel && painel.contratos ? n(painel.contratos.pendentes) : null, href: '#/contratos', motivo: 'depende do módulo de contratos' },
        {
          rotulo: 'Lançamentos em atraso', valor: n(fin), href: '#/financeiro', motivo: 'depende do módulo financeiro',
          nota: fin && Number.isFinite(fin.valorCentavos) ? ui.fmt.moeda(fin.valorCentavos) : ''
        }
      ]));
    }

    // Filas curtas: dúvidas sem resposta (da F8). As demais filas aparecem quando as fatias donas registram a rota.
    let fila = '';
    if (duvidas && duvidas.__erro) {
      fila = ui.html`<p class="pf-prof-nota">Não foi possível carregar as dúvidas agora.</p>`;
    } else {
      const itens = duvidas && Array.isArray(duvidas.itens) ? duvidas.itens : [];
      fila = itens.length
        ? ui.html`<ul class="pf-prof-lista">${itens.map((d) => ui.html`<li class="pf-prof-lista__item">
            <a class="pf-prof-lista__link" href="#/duvidas">${d.autorNome}</a>
            <span class="pf-prof-lista__meta">${[d.aulaCodigo || d.aulaTitulo, ui.fmt.relativo(d.createdAt)].filter(Boolean).join(' · ')}</span>
          </li>`)}</ul>
          ${duvidas.total > itens.length ? ui.html`<p><a class="pf-prof-link" href="#/duvidas">Ver todas (${duvidas.total})</a></p>` : ''}`
        : ui.html`<p class="pf-prof-nota">Nada pendente aqui.</p>`;
    }

    let agenda;
    if (prox === null) agenda = ui.html`<p class="pf-prof-nota">— A agenda depende do módulo de aulas ao vivo, ainda indisponível.</p>`;
    else if (!prox.length) agenda = ui.html`<p class="pf-prof-nota">Nenhum encontro nos próximos 7 dias.</p>`;
    else {
      agenda = ui.html`<ul class="pf-prof-lista">${prox.slice(0, 8).map((e) => ui.html`<li class="pf-prof-lista__item">
        <span class="pf-prof-tnum">${ui.fmt.data(e.inicioEm)} · ${ui.fmt.hora(e.inicioEm)}</span>
        <span>${e.titulo}</span>
        <span class="pf-prof-lista__meta">${[e.turmaCodigo, e.cursoTitulo].filter(Boolean).join(' · ')}</span>
        ${e.status === 'ao_vivo' || e.status === 'ao vivo' ? ui.html`<span class="pf-prof-estado">Ao vivo agora</span>` : ''}
      </li>`)}</ul>`;
    }

    let avisos = '';
    if (admin && painel && painel.sistema) {
      const s = painel.sistema;
      const lista = [];
      for (const t of Array.isArray(s.avisosConfiguracao) ? s.avisosConfiguracao : []) lista.push({ texto: String(t) });
      if (Array.isArray(s.modulosAusentes) && s.modulosAusentes.length) lista.push({ texto: `${s.modulosAusentes.length} módulo(s) do portal ainda não instalado(s).` });
      if (s.instituicaoPendente === true) lista.push({ texto: 'Dados da instituição não cadastrados: a declaração anual de quitação fica indisponível', href: '#/configuracoes/instituicao' });
      if (painel.alunos && Number.isFinite(painel.alunos.liberacoesSemMatricula) && painel.alunos.liberacoesSemMatricula > 0) {
        lista.push({ texto: `${painel.alunos.liberacoesSemMatricula} liberações sem matrícula`, href: '#/matriculas' });
      }
      if (painel.ia && painel.ia.ligado === false) lista.push({ texto: 'Assistente de IA desligado', href: '#/configuracoes/ia' });
      if (painel.ia && painel.ia.tetoGlobalAtingidoHoje === true) lista.push({ texto: 'Teto diário do assistente atingido hoje', href: '#/configuracoes/ia' });
      avisos = lista.length
        ? ui.html`<section class="pf-prof-coluna__bloco" aria-labelledby="pf-prof-avisos"><h2 class="pf-prof-h2" id="pf-prof-avisos">Avisos do sistema</h2>
            <ul class="pf-prof-lista">${lista.map((a) => ui.html`<li class="pf-prof-lista__item">${a.href ? ui.html`<a class="pf-prof-link" href="${a.href}">${a.texto}</a>` : a.texto}</li>`)}</ul></section>`
        : '';
    }

    el.replaceChildren(ui.nos(ui.html`${blocos}
      <div class="pf-prof-grade">
        <section class="pf-prof-grade__larga" aria-labelledby="pf-prof-fazer">
          <h2 class="pf-prof-overline" id="pf-prof-fazer">Para fazer</h2>
          <section class="pf-prof-coluna__bloco" aria-labelledby="pf-prof-fila-duvidas">
            <h3 class="pf-prof-h2" id="pf-prof-fila-duvidas">Dúvidas sem resposta</h3>
            ${fila}
          </section>
        </section>
        <aside class="pf-prof-grade__estreita" aria-labelledby="pf-prof-agenda">
          <h2 class="pf-prof-overline" id="pf-prof-agenda">Agenda</h2>
          ${agenda}
          ${avisos}
        </aside>
      </div>`));
  }

  P.registrar({ rota: 'inicio', titulo: 'Visão geral', papeis: ['professor', 'admin'], montar });
})();
