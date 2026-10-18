/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-avaliacoes.js (F2)
   Telas de avaliação e correção do Portal do Professor e da
   coordenação, registradas em DMC_Professor (professor.html, F8).
   Spec: PORTAL-ACADEMICO.md §6.3 (rotas), §7.8 (registrar/ctx);
   PORTAL-UX.md §7.6 (Avaliações), §7.7 (Correção e nova tentativa);
   PORTAL-API.md §6.6.2.

   Rotas (#/…): avaliacoes · avaliacoes/:id · avaliacoes/:id/
   configuracao|questoes|resultados · avaliacoes/:id/questoes/nova ·
   avaliacoes/:id/questoes/:qid · avaliacoes/:id/previa · correcao ·
   correcao/:tentativaId.

   A prévia monta DMC_Avaliacao (avaliacao.js, carregado antes deste
   arquivo). Nenhuma nota é calculada aqui: o efeito da correção vem
   do servidor (simulado, sem gravar). HTML só por ctx.ui.html.
   ============================================================= */
(function () {
  'use strict';

  const P = window.DMC_Professor;
  if (!P || typeof P.registrar !== 'function') return; // fora do professor.html: nada a registrar

  const API = {
    cursos: '/portal/professor/avaliacoes',
    doCurso: (c) => `/portal/professor/cursos/${encodeURIComponent(c)}/avaliacoes`,
    criar: (m) => `/portal/professor/modulos/${encodeURIComponent(m)}/avaliacoes`,
    avaliacao: (id) => `/portal/professor/avaliacoes/${encodeURIComponent(id)}`,
    questoes: (id) => `/portal/professor/avaliacoes/${encodeURIComponent(id)}/questoes`,
    publicar: (id) => `/portal/professor/avaliacoes/${encodeURIComponent(id)}/publicar`,
    despublicar: (id) => `/portal/professor/avaliacoes/${encodeURIComponent(id)}/despublicar`,
    resultados: (id) => `/portal/professor/avaliacoes/${encodeURIComponent(id)}/resultados`,
    concessoes: (id) => `/portal/professor/avaliacoes/${encodeURIComponent(id)}/concessoes`,
    questao: (q) => `/portal/professor/questoes/${encodeURIComponent(q)}`,
    questaoAtiva: (q) => `/portal/professor/questoes/${encodeURIComponent(q)}/ativa`,
    correcoes: '/portal/professor/correcoes',
    tentativa: (t) => `/portal/professor/tentativas/${encodeURIComponent(t)}`,
    correcao: (t) => `/portal/professor/tentativas/${encodeURIComponent(t)}/correcao`,
    recorrecao: (t) => `/portal/professor/tentativas/${encodeURIComponent(t)}/recorrecao`,
    entrega: (t, q) => `/portal/professor/tentativas/${encodeURIComponent(t)}/respostas/${encodeURIComponent(q)}/arquivo`
  };
  const EQUIPE = ['professor', 'admin'];
  const CHAVE_CEGA = 'dmc:correcaoCega';
  const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const ROTULO_TIPO = { previa: 'Atividade prévia', modular: 'Atividade modular' };
  const ROTULO_QUESTAO = { objetiva: 'Objetiva', dissertativa: 'Dissertativa', arquivo: 'Arquivo (PDF)' };
  const ROTULO_SITUACAO = { cursando: 'Cursando', aprovado: 'Aprovado', em_recuperacao: 'Em recuperação', reprovado: 'Reprovado' };
  const TOM_SITUACAO = { cursando: 'neutro', aprovado: 'sucesso', em_recuperacao: 'aviso', reprovado: 'erro' };

  const doc = document;
  function nos(marcacao) {
    const t = doc.createElement('template');
    t.innerHTML = String(marcacao);
    return t.content;
  }
  const nota = (ui, n) => (Number.isFinite(n) ? ui.fmt.nota(n) : '—');
  const pts = (n) => (Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—');
  const num = (n) => (Number.isFinite(n) ? n.toLocaleString('pt-BR') : '—');
  const modRotulo = (m) => (m && m.numero ? `Módulo ${String(m.numero).padStart(2, '0')}` : 'Módulo');
  function cortar(s, max) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  }
  function estadoAvaliacao(ui, a) {
    if (!a) return ui.estado('Sem avaliação', 'neutro');
    return a.publicada ? ui.estado('Publicada', 'sucesso') : ui.estado('Rascunho', 'aviso');
  }
  function erroEm(ctx, el, err, tentar) {
    if (err && err.name === 'AbortError') return;
    if (err && err.status === 401) throw err;
    ctx.ui.erroCarga(el, err, { tentarDeNovo: tentar });
  }
  function textoDoErro(err) {
    if (!err) return 'Não foi possível concluir agora.';
    if (err.campos) {
      const k = Object.keys(err.campos)[0];
      if (k) return `${err.message} ${err.campos[k]}`;
    }
    return err.message || 'Não foi possível concluir agora.';
  }

  // =============================================================
  // Lista — #/avaliacoes
  // =============================================================
  async function montarLista(el, ctx) {
    const { ui, api } = ctx;
    const H = ui.html;
    ui.esqueleto(el, { tipo: 'tabela', linhas: 4 });
    let cursos;
    try { cursos = (await api.get(API.cursos, { sinal: ctx.sinal })).cursos || []; } catch (err) { erroEm(ctx, el, err, () => montarLista(el, ctx)); return; }
    el.removeAttribute('aria-busy');
    if (!cursos.length) {
      ui.estadoVazio(el, { titulo: 'Nenhum curso vinculado', texto: 'Quando a coordenação vincular você a um curso, as avaliações dele aparecem aqui.' });
      return;
    }
    let atual = ctx.filtros.get('curso');
    if (!cursos.some((c) => c.id === atual)) atual = cursos[0].id;

    el.replaceChildren(nos(H`<div class="pf-av-prof">
      <p class="pf-av-campo__ajuda">Cada módulo pode ter uma atividade prévia (não conta nota) e uma atividade modular (define a nota do módulo).</p>
      <div class="pf-av-filtros" data-av-filtro-curso>
        ${cursos.length <= 4
          ? H`<div class="pf-av-segmento" role="group" aria-label="Curso">${cursos.map((c) => H`<button type="button" class="pf-av-segmento__botao" data-curso="${c.id}" aria-pressed="${c.id === atual ? 'true' : 'false'}">${c.sigla || cortar(c.titulo, 28)}</button>`)}</div>`
          : H`<label class="pf-av-campo"><span class="pf-av-campo__rotulo">Curso</span><select class="pf-av-input" data-curso-select>${cursos.map((c) => H`<option value="${c.id}" ${c.id === atual ? ui.cru('selected') : ''}>${c.titulo}</option>`)}</select></label>`}
      </div>
      <div data-av-tabela></div>
    </div>`));
    const alvo = el.querySelector('[data-av-tabela]');

    async function carregar(cursoId) {
      ui.esqueleto(alvo, { tipo: 'tabela', linhas: 4 });
      let dados;
      try { dados = await api.get(API.doCurso(cursoId), { sinal: ctx.sinal }); } catch (err) { erroEm(ctx, alvo, err, () => carregar(cursoId)); return; }
      alvo.removeAttribute('aria-busy');
      if (!dados.modulos.length) {
        ui.estadoVazio(alvo, { titulo: 'Curso sem módulos', texto: 'Cadastre os módulos no editor de conteúdo antes de criar avaliações.' });
        return;
      }
      const linhas = [];
      for (const m of dados.modulos) {
        for (const tipo of ['previa', 'modular']) {
          const a = (m.avaliacoes || []).find((x) => x.tipo === tipo) || null;
          linhas.push({ m, tipo, a });
        }
      }
      alvo.replaceChildren(nos(H`<table class="pf-av-tabela pf-av-tabela--prof">
        <caption class="dmc-sr-only">Avaliações por módulo de ${dados.curso.titulo}</caption>
        <thead><tr><th scope="col">Módulo</th><th scope="col">Atividade</th><th scope="col">Estado</th><th scope="col">Banco</th><th scope="col">Por tentativa</th><th scope="col">Tentativas</th><th scope="col">Tempo</th><th scope="col"><span class="dmc-sr-only">Ações</span></th></tr></thead>
        <tbody>${linhas.map(({ m, tipo, a }) => H`<tr>
          <th scope="row">${modRotulo(m)} · ${m.titulo}${m.tipo === 'tcc' ? ' (TCC)' : ''}</th>
          <td data-rotulo="Atividade">${ROTULO_TIPO[tipo]}</td>
          <td data-rotulo="Estado">${estadoAvaliacao(ui, a)}</td>
          <td data-rotulo="Banco">${a ? `${num(a.banco.objetivasAtivas)} objetivas · ${num(a.banco.dissertativasAtivas)} dissertativas${m.tipo === 'tcc' ? ` · ${num(a.banco.arquivosAtivas)} arquivo` : ''}` : '—'}</td>
          <td data-rotulo="Por tentativa">${a ? [a.sorteio.objetivas, a.sorteio.dissertativas, a.sorteio.arquivos].filter((n, i) => n || i < 2).join(' + ') : '—'}</td>
          <td data-rotulo="Tentativas">${a ? num(a.tentativasMax) : '—'}</td>
          <td data-rotulo="Tempo">${a ? (a.tempoLimiteMin ? `${a.tempoLimiteMin} min` : 'Livre') : '—'}</td>
          <td>${a
            ? H`<a class="dmc-btn dmc-btn--secondary" href="${`#/avaliacoes/${a.id}/configuracao`}">Editar<span class="dmc-sr-only"> ${ROTULO_TIPO[tipo]} do ${modRotulo(m)}</span></a>`
            : (dados.podeEditar ? H`<button type="button" class="dmc-btn dmc-btn--secondary" data-criar="${m.id}" data-tipo="${tipo}">Criar<span class="dmc-sr-only"> ${ROTULO_TIPO[tipo]} do ${modRotulo(m)}</span></button>` : '—')}</td>
        </tr>`)}</tbody>
      </table>
      <p class="pf-av-campo__ajuda">Nota mínima do curso: ${nota(ui, dados.notaMinima)} — definida pela coordenação.</p>`));
      alvo.querySelectorAll('[data-criar]').forEach((b) => b.addEventListener('click', async () => {
        const tipo = b.getAttribute('data-tipo');
        const moduloId = b.getAttribute('data-criar');
        const m = dados.modulos.find((x) => x.id === moduloId);
        ui.ocupado(b, true, 'Criando…');
        try {
          const r = await api.post(API.criar(moduloId), {
            tipo, titulo: `${ROTULO_TIPO[tipo]} · ${modRotulo(m)}`, instrucoes: '',
            sorteio: { objetivas: 1, dissertativas: 0, arquivos: 0 }, tentativasMax: tipo === 'modular' ? 2 : 3,
            tempoLimiteMin: null, embaralharAlternativas: true, gabaritoLiberaEm: null
          });
          ui.toast('Rascunho criado. Ajuste a configuração e cadastre as questões antes de publicar.', { tipo: 'sucesso' });
          ctx.navegar(`avaliacoes/${r.avaliacao.id}/configuracao`);
        } catch (err) {
          ui.ocupado(b, false);
          ui.toast(textoDoErro(err), { tipo: 'erro' });
        }
      }));
    }

    el.querySelectorAll('[data-curso]').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('[data-curso]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      carregar(b.getAttribute('data-curso'));
    }));
    const sel = el.querySelector('[data-curso-select]');
    if (sel) sel.addEventListener('change', () => carregar(sel.value));
    await carregar(atual);
  }

  // =============================================================
  // Editor — #/avaliacoes/:id(/configuracao|questoes|resultados)
  // =============================================================
  async function carregarAvaliacao(ctx, id) {
    return ctx.api.get(API.questoes(id), { sinal: ctx.sinal });
  }

  function htmlTopoEditor(ctx, d, aba) {
    const { ui } = ctx;
    const H = ui.html;
    const a = d.avaliacao;
    const abas = [
      { id: 'configuracao', rotulo: 'Configuração' },
      { id: 'questoes', rotulo: `Banco de questões (${a.banco.objetivasAtivas + a.banco.dissertativasAtivas + a.banco.arquivosAtivas})` },
      { id: 'resultados', rotulo: 'Resultados' }
    ];
    return H`<div class="pf-av-linha">
        <p class="pf-av-overline">Avaliações · ${d.curso ? (d.curso.sigla || d.curso.titulo) : ''} · ${modRotulo(d.modulo)}${d.modulo && d.modulo.titulo ? ` · ${d.modulo.titulo}` : ''}</p>
        ${estadoAvaliacao(ui, a)}
      </div>
      <div class="pf-av-acoes">
        <a class="dmc-btn dmc-btn--secondary" href="${`#/avaliacoes/${a.id}/previa`}">Pré-visualizar como aluno</a>
        ${d.podeEditar && !a.publicada ? H`<button type="button" class="dmc-btn dmc-btn--primary" data-av-publicar>Publicar</button>` : ''}
        ${a.publicada && (d.podeEditar) ? H`<button type="button" class="dmc-btn dmc-btn--secondary" data-av-despublicar>Despublicar</button>` : ''}
        <a class="dmc-btn dmc-btn--link" href="#/avaliacoes">← Avaliações</a>
      </div>
      <nav class="pf-av-abas" aria-label="Seções da avaliação">${abas.map((x) => H`<a class="pf-av-aba" href="${`#/avaliacoes/${a.id}/${x.id}`}" ${x.id === aba ? ui.cru('aria-current="page"') : ''}>${x.rotulo}</a>`)}</nav>`;
  }

  function ligarAcoesDoTopo(el, ctx, d, recarregar) {
    const { ui, api } = ctx;
    const H = ui.html;
    const a = d.avaliacao;
    const pub = el.querySelector('[data-av-publicar]');
    if (pub) pub.addEventListener('click', async () => {
      const objetivas = d.itens.filter((q) => q.ativa && q.tipo === 'objetiva');
      const diss = d.itens.filter((q) => q.ativa && q.tipo === 'dissertativa');
      const arqs = d.itens.filter((q) => q.ativa && q.tipo === 'arquivo');
      const itens = [
        { ok: objetivas.length >= a.sorteio.objetivas, texto: `Objetivas: ${objetivas.length} ativas para ${a.sorteio.objetivas} por tentativa` },
        { ok: diss.length >= a.sorteio.dissertativas, texto: `Dissertativas: ${diss.length} ativas para ${a.sorteio.dissertativas} por tentativa` },
        ...(a.sorteio.arquivos ? [{ ok: arqs.length >= a.sorteio.arquivos, texto: `Entregas de arquivo: ${arqs.length} ativas para ${a.sorteio.arquivos}` }] : []),
        { ok: objetivas.every((q) => q.corretaId), texto: 'Toda objetiva com a alternativa correta marcada' },
        { ok: diss.concat(arqs).every((q) => q.pontos > 0), texto: 'Toda dissertativa e entrega com pontos' }
      ];
      const tudoOk = itens.every((i) => i.ok);
      const conteudo = H`<ul class="pf-av-checklist">${itens.map((i) => H`<li class="${i.ok ? 'is-ok' : 'is-falta'}"><span aria-hidden="true">${i.ok ? '✓' : '✕'}</span><span>${i.texto}${i.ok ? '' : ' — pendente'}</span></li>`)}</ul>
        <p class="pf-av-campo__ajuda">Os alunos do curso recebem uma notificação.</p>`;
      const v = await ui.dialogo({
        titulo: 'Publicar avaliação?', conteudo: nos(conteudo),
        acoes: [{ rotulo: 'Cancelar', valor: false, tipo: 'secundario', acao: 'cancelar' }].concat(tudoOk ? [{ rotulo: 'Publicar', valor: true, tipo: 'primario', acao: 'confirmar' }] : [])
      });
      if (!v) return;
      ui.ocupado(pub, true, 'Publicando…');
      try {
        const r = await api.post(API.publicar(a.id), {});
        ui.toast(`Avaliação publicada. Os alunos já veem a atividade no ${modRotulo(d.modulo)}.`, { tipo: 'sucesso' });
        if (r.avisos && r.avisos.length) ui.toast(r.avisos[0], { tipo: 'aviso' });
        recarregar();
      } catch (err) {
        ui.ocupado(pub, false);
        ui.toast(textoDoErro(err), { tipo: 'erro' });
      }
    });
    const desp = el.querySelector('[data-av-despublicar]');
    if (desp) desp.addEventListener('click', async () => {
      const r = await ui.confirmar({
        titulo: 'Despublicar avaliação?',
        texto: 'A atividade some para os alunos e deixa de contar na regra de aprovação. Com tentativas feitas, só a coordenação pode despublicar.',
        rotuloConfirmar: 'Despublicar', perigo: true, motivo: true
      });
      if (!r) return;
      try {
        await api.post(API.despublicar(a.id), { motivo: r.motivo });
        ui.toast('Avaliação despublicada.', { tipo: 'sucesso' });
        recarregar();
      } catch (err) { ui.toast(textoDoErro(err), { tipo: 'erro' }); }
    });
  }

  function montarEditor(abaFixa) {
    return async function (el, ctx) {
      const { ui } = ctx;
      const id = ctx.params.id;
      const aba = abaFixa || 'configuracao';
      ui.esqueleto(el, { tipo: 'texto', linhas: 5 });
      let d;
      try { d = await carregarAvaliacao(ctx, id); } catch (err) {
        if (err && err.status === 404) { ui.estadoVazio(el, { titulo: 'Avaliação não encontrada', texto: 'Ela pode ter sido excluída.', acao: { rotulo: 'Voltar às avaliações', href: '#/avaliacoes' } }); return; }
        erroEm(ctx, el, err, () => montarEditor(abaFixa)(el, ctx)); return;
      }
      el.removeAttribute('aria-busy');
      ctx.definirTitulo(ROTULO_TIPO[d.avaliacao.tipo] || 'Avaliação');
      const recarregar = () => montarEditor(abaFixa)(el, ctx);
      el.replaceChildren(nos(ctx.ui.html`<div class="pf-av-prof">${htmlTopoEditor(ctx, d, aba)}<section data-av-aba></section></div>`));
      ligarAcoesDoTopo(el, ctx, d, recarregar);
      const alvo = el.querySelector('[data-av-aba]');
      if (aba === 'questoes') return montarBanco(alvo, ctx, d, recarregar);
      if (aba === 'resultados') return montarResultados(alvo, ctx, d);
      return montarConfiguracao(alvo, ctx, d, recarregar);
    };
  }

  function montarConfiguracao(el, ctx, d, recarregar) {
    const { ui, api } = ctx;
    const H = ui.html;
    const a = d.avaliacao;
    const tcc = d.modulo && d.modulo.tipo === 'tcc';
    const travado = !d.podeEditar;
    const comTentativas = a.tentativas > 0;
    const dis = travado ? ui.cru('disabled') : '';
    const liberaLocal = a.gabaritoLiberaEm ? new Date(new Date(a.gabaritoLiberaEm).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
    el.replaceChildren(nos(H`<form class="pf-av-cartao" data-av-config novalidate>
      ${travado ? H`<p class="pf-av-campo__ajuda">Somente a docência geral do curso e a coordenação editam a configuração.</p>` : ''}
      ${comTentativas ? H`<p class="pf-av-campo__ajuda">Já há tentativas: composição, tempo e tentativas valem só para as tentativas novas, e o tipo não muda.</p>` : ''}
      <div class="pf-av-grade pf-av-grade--2">
        <fieldset class="pf-av-campo">
          <legend class="pf-av-campo__rotulo">Tipo</legend>
          <label class="pf-av-check"><input type="radio" name="tipo" value="previa" ${a.tipo === 'previa' ? ui.cru('checked') : ''} ${travado || comTentativas ? ui.cru('disabled') : ''}> Atividade prévia — não conta para a nota do módulo</label>
          <label class="pf-av-check"><input type="radio" name="tipo" value="modular" ${a.tipo === 'modular' ? ui.cru('checked') : ''} ${travado || comTentativas ? ui.cru('disabled') : ''}> Atividade modular — a melhor tentativa vira a nota do módulo</label>
        </fieldset>
        <label class="pf-av-campo"><span class="pf-av-campo__rotulo">Título</span><input class="pf-av-input" name="titulo" maxlength="160" required value="${a.titulo}" ${dis}><span class="pf-av-campo__erro" data-erro="titulo" hidden></span></label>
        <label class="pf-av-campo"><span class="pf-av-campo__rotulo">Instruções ao aluno</span><textarea class="pf-av-input" name="instrucoes" rows="4" maxlength="4000" ${dis}>${a.instrucoes}</textarea></label>
        <fieldset class="pf-av-campo">
          <legend class="pf-av-campo__rotulo">Composição por tentativa</legend>
          <label class="pf-av-linha">Objetivas <input class="pf-av-input pf-av-input--curto" type="number" name="objetivas" min="0" max="100" value="${a.sorteio.objetivas}" ${dis}> de ${num(a.banco.objetivasAtivas)} no banco</label>
          <label class="pf-av-linha">Dissertativas <input class="pf-av-input pf-av-input--curto" type="number" name="dissertativas" min="0" max="100" value="${a.sorteio.dissertativas}" ${dis}> de ${num(a.banco.dissertativasAtivas)} no banco</label>
          ${tcc ? H`<label class="pf-av-linha">Arquivos <input class="pf-av-input pf-av-input--curto" type="number" name="arquivos" min="0" max="100" value="${a.sorteio.arquivos}" ${dis}> de ${num(a.banco.arquivosAtivas)} no banco</label>` : ''}
          <span class="pf-av-campo__erro" data-erro="sorteio" hidden></span>
        </fieldset>
        <label class="pf-av-campo"><span class="pf-av-campo__rotulo">Tentativas (1 a 10)</span><input class="pf-av-input pf-av-input--curto" type="number" name="tentativasMax" min="1" max="10" value="${a.tentativasMax}" ${dis}><span class="pf-av-campo__erro" data-erro="tentativasMax" hidden></span></label>
        <fieldset class="pf-av-campo">
          <legend class="pf-av-campo__rotulo">Tempo</legend>
          <label class="pf-av-check"><input type="radio" name="tempo" value="livre" ${a.tempoLimiteMin ? '' : ui.cru('checked')} ${dis}> Livre</label>
          <label class="pf-av-check"><input type="radio" name="tempo" value="limite" ${a.tempoLimiteMin ? ui.cru('checked') : ''} ${dis}> Limite de <input class="pf-av-input pf-av-input--curto" type="number" name="tempoLimiteMin" min="5" max="600" value="${a.tempoLimiteMin || 60}" aria-label="Minutos" ${dis}> minutos</label>
          <span class="pf-av-campo__erro" data-erro="tempoLimiteMin" hidden></span>
        </fieldset>
        <label class="pf-av-check"><input type="checkbox" name="embaralharAlternativas" ${a.embaralharAlternativas ? ui.cru('checked') : ''} ${dis}> Embaralhar alternativas</label>
        <label class="pf-av-campo"><span class="pf-av-campo__rotulo">Liberar o gabarito completo a partir de (opcional)</span><input class="pf-av-input" type="datetime-local" name="gabaritoLiberaEm" value="${liberaLocal}" ${dis}><span class="pf-av-campo__ajuda">Antes da data, quem finaliza vê só o que acertou e errou.</span></label>
      </div>
      <p class="pf-av-campo__ajuda">Nota mínima do curso: ${nota(ui, d.notaMinima)} — definida pela coordenação.</p>
      ${d.avisos ? H`<section class="pf-av-avisos pf-av-avisos--previa" aria-labelledby="pf-av-avisos-prev">
        <h3 class="pf-av-avisos__titulo" id="pf-av-avisos-prev">Avisos importantes — como o aluno verá</h3>
        <dl class="pf-av-avisos__lista">
          <div><dt>Tentativas</dt><dd>${d.avisos.tentativas}</dd></div>
          <div><dt>Tempo</dt><dd>${d.avisos.tempo}</dd></div>
          <div><dt>Questões</dt><dd>${d.avisos.questoes}</dd></div>
          <div><dt>Correção</dt><dd>${d.avisos.correcao}</dd></div>
          <div><dt>Gabarito</dt><dd>${d.avisos.gabarito}</dd></div>
        </dl>
        <p class="pf-av-campo__ajuda">Reflete a configuração salva.</p>
      </section>` : ''}
      ${travado ? '' : H`<div class="pf-av-acoes"><button type="submit" class="dmc-btn dmc-btn--primary">Salvar configuração</button></div>`}
      <div data-av-config-alerta></div>
    </form>`));
    const form = el.querySelector('[data-av-config]');
    if (travado) return;
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      form.querySelectorAll('[data-erro]').forEach((x) => { x.hidden = true; x.textContent = ''; });
      const f = new FormData(form);
      const tipoSel = form.querySelector('input[name="tipo"]:checked');
      const corpo = {
        titulo: String(f.get('titulo') || '').trim(),
        instrucoes: String(f.get('instrucoes') || ''),
        sorteio: { objetivas: Number(f.get('objetivas') || 0), dissertativas: Number(f.get('dissertativas') || 0), arquivos: tcc ? Number(f.get('arquivos') || 0) : 0 },
        tentativasMax: Number(f.get('tentativasMax')),
        tempoLimiteMin: f.get('tempo') === 'limite' ? Number(f.get('tempoLimiteMin')) : null,
        embaralharAlternativas: !!f.get('embaralharAlternativas'),
        gabaritoLiberaEm: f.get('gabaritoLiberaEm') ? new Date(String(f.get('gabaritoLiberaEm'))).toISOString() : null,
        versao: a.versao
      };
      if (tipoSel && !tipoSel.disabled) corpo.tipo = tipoSel.value;
      const botao = form.querySelector('[type="submit"]');
      ui.ocupado(botao, true, 'Salvando…');
      try {
        await api.put(API.avaliacao(a.id), corpo);
        ui.toast('Configuração salva.', { tipo: 'sucesso' });
        recarregar();
      } catch (err) {
        ui.ocupado(botao, false);
        if (err && err.codigo === 'conflito-versao') {
          ui.alerta(form.querySelector('[data-av-config-alerta]'), { tom: 'aviso', titulo: 'Alguém alterou esta avaliação enquanto você editava.', texto: 'Recarregue para ver a versão atual.' });
          return;
        }
        if (err && err.campos) {
          for (const [k, v] of Object.entries(err.campos)) {
            const chave = k.indexOf('sorteio') === 0 ? 'sorteio' : k;
            const alvo = form.querySelector(`[data-erro="${chave}"]`);
            if (alvo) { alvo.hidden = false; alvo.textContent = v; }
          }
        }
        ui.toast(textoDoErro(err), { tipo: 'erro' });
      }
    });
  }

  function montarBanco(el, ctx, d, recarregar) {
    const { ui, api } = ctx;
    const H = ui.html;
    const a = d.avaliacao;
    const tcc = d.modulo && d.modulo.tipo === 'tcc';
    const filtros = [{ v: 'todas', r: 'Todas' }, { v: 'objetiva', r: 'Objetivas' }, { v: 'dissertativa', r: 'Dissertativas' }]
      .concat(tcc ? [{ v: 'arquivo', r: 'Arquivos' }] : []).concat([{ v: 'arquivadas', r: 'Arquivadas' }]);
    let filtro = 'todas';
    let busca = '';
    el.replaceChildren(nos(H`<div class="pf-av-prof">
      <div class="pf-av-filtros">
        <div class="pf-av-segmento" role="group" aria-label="Filtrar questões">${filtros.map((x) => H`<button type="button" class="pf-av-segmento__botao" data-filtro="${x.v}" aria-pressed="${x.v === filtro ? 'true' : 'false'}">${x.r}</button>`)}</div>
        <label class="pf-av-campo"><span class="pf-av-campo__rotulo">Buscar no enunciado</span><input class="pf-av-input" type="search" data-busca></label>
        ${d.podeEditar ? H`<a class="dmc-btn dmc-btn--primary" href="${`#/avaliacoes/${a.id}/questoes/nova`}">Nova questão</a>` : ''}
      </div>
      <div data-lista></div>
    </div>`));
    const lista = el.querySelector('[data-lista]');
    function desenhar() {
      const termo = busca.toLowerCase();
      const itens = d.itens.filter((q) => (filtro === 'arquivadas' ? !q.ativa : (q.ativa && (filtro === 'todas' || q.tipo === filtro))))
        .filter((q) => !termo || q.enunciado.toLowerCase().indexOf(termo) >= 0);
      if (!itens.length) {
        ui.estadoVazio(lista, { titulo: d.itens.length ? 'Nenhuma questão neste filtro' : 'Banco vazio', texto: d.itens.length ? 'Troque o filtro ou a busca.' : 'Cadastre as questões que serão sorteadas a cada tentativa.' });
        return;
      }
      lista.replaceChildren(nos(H`<table class="pf-av-tabela pf-av-tabela--prof">
        <caption class="dmc-sr-only">Questões do banco</caption>
        <thead><tr><th scope="col">Nº</th><th scope="col">Tipo</th><th scope="col">Enunciado</th><th scope="col">Pontos</th><th scope="col">Uso</th><th scope="col"><span class="dmc-sr-only">Ações</span></th></tr></thead>
        <tbody>${itens.map((q) => H`<tr>
          <th scope="row">${d.itens.indexOf(q) + 1}</th>
          <td data-rotulo="Tipo">${ROTULO_QUESTAO[q.tipo]}</td>
          <td data-rotulo="Enunciado">${cortar(q.enunciado, 90)}</td>
          <td data-rotulo="Pontos">${pts(q.pontos)}</td>
          <td data-rotulo="Uso">${q.sorteada ? 'Já sorteada' : '—'}</td>
          <td><div class="pf-av-linha">
            <a class="dmc-btn dmc-btn--secondary" href="${`#/avaliacoes/${a.id}/questoes/${q.id}`}">${d.podeEditar ? 'Editar' : 'Ver'}<span class="dmc-sr-only"> questão ${d.itens.indexOf(q) + 1}</span></a>
            ${d.podeEditar ? H`<button type="button" class="dmc-btn dmc-btn--link" data-duplicar="${q.id}">Duplicar</button>
            <button type="button" class="dmc-btn dmc-btn--link" data-ativa="${q.id}">${q.ativa ? 'Arquivar' : 'Reativar'}</button>
            ${q.sorteada ? '' : H`<button type="button" class="dmc-btn dmc-btn--link" data-excluir="${q.id}">Excluir</button>`}` : ''}
          </div></td>
        </tr>`)}</tbody>
      </table>`));
    }
    el.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
      filtro = b.getAttribute('data-filtro');
      el.querySelectorAll('[data-filtro]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      desenhar();
    }));
    el.querySelector('[data-busca]').addEventListener('input', (ev) => { busca = ev.target.value || ''; desenhar(); });
    lista.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const q = d.itens.find((x) => x.id === (b.getAttribute('data-duplicar') || b.getAttribute('data-ativa') || b.getAttribute('data-excluir')));
      if (!q) return;
      try {
        if (b.hasAttribute('data-duplicar')) {
          const corpo = { tipo: q.tipo, enunciado: q.enunciado, explicacao: q.explicacao, pontos: q.pontos };
          if (q.tipo === 'objetiva') { corpo.alternativas = q.alternativas; corpo.corretaId = q.corretaId; } else { corpo.orientacao = q.orientacao; corpo.respostaReferencia = q.respostaReferencia; if (q.tipo === 'dissertativa') corpo.limiteCaracteres = q.limiteCaracteres; }
          await api.post(API.questoes(a.id), corpo);
          ui.toast('Questão duplicada.', { tipo: 'sucesso' });
        } else if (b.hasAttribute('data-ativa')) {
          await api.put(API.questaoAtiva(q.id), { ativa: !q.ativa, versao: q.versao });
          ui.toast(q.ativa ? 'Questão arquivada. Ela não entra nos próximos sorteios.' : 'Questão reativada.', { tipo: 'sucesso' });
        } else {
          const ok = await ui.confirmar({ titulo: 'Excluir questão?', texto: 'A questão sai do banco. Esta ação não pode ser desfeita.', rotuloConfirmar: 'Excluir', perigo: true });
          if (!ok) return;
          await api.del(API.questao(q.id));
          ui.toast('Questão excluída.', { tipo: 'sucesso' });
        }
        recarregar();
      } catch (err) { ui.toast(textoDoErro(err), { tipo: 'erro' }); }
    });
    desenhar();
  }

  async function montarResultados(el, ctx, d) {
    const { ui, api } = ctx;
    const H = ui.html;
    const a = d.avaliacao;
    ui.esqueleto(el, { tipo: 'tabela', linhas: 4 });
    let r;
    try { r = await api.get(API.resultados(a.id), { sinal: ctx.sinal }); } catch (err) { erroEm(ctx, el, err, () => montarResultados(el, ctx, d)); return; }
    el.removeAttribute('aria-busy');
    const k = r.kpis || {};
    const kpis = [
      { r: 'Alunos que fizeram', v: k.alunos === null || k.alunos === undefined ? `${num(k.fizeram)}` : `${num(k.fizeram)} de ${num(k.alunos)}` },
      { r: 'Média das melhores notas', v: nota(ui, k.mediaMelhores) },
      ...(a.tipo === 'modular' ? [{ r: 'Aprovados', v: num(k.aprovados) }, { r: 'Em recuperação', v: num(k.emRecuperacao) }] : []),
      { r: 'A corrigir', v: num(k.aCorrigir) }
    ];
    el.replaceChildren(nos(H`<div class="pf-av-prof">
      <dl class="pf-av-kpis">${kpis.map((x) => H`<div class="pf-av-kpi"><dt>${x.r}</dt><dd>${x.v}</dd></div>`)}</dl>
      ${r.itens.length ? H`<table class="pf-av-tabela pf-av-tabela--prof">
        <caption class="dmc-sr-only">Resultado por aluno</caption>
        <thead><tr><th scope="col">Aluno</th><th scope="col">Turma</th><th scope="col">Tentativas</th><th scope="col">Melhor nota</th><th scope="col">Situação</th><th scope="col"><span class="dmc-sr-only">Ações</span></th></tr></thead>
        <tbody>${r.itens.map((i) => H`<tr>
          <th scope="row">${i.aluno.nomeSocial || i.aluno.nome || 'Aluno'}</th>
          <td data-rotulo="Turma">${i.turmaCodigo || 'Sem turma'}</td>
          <td data-rotulo="Tentativas">${i.tentativas.usadas} de ${i.tentativas.permitidas}${i.finalizada ? ' · finalizada' : ''}</td>
          <td data-rotulo="Melhor nota">${nota(ui, i.melhorNota)}</td>
          <td data-rotulo="Situação">${i.aguardandoCorrecao ? ui.estado('Aguardando correção', 'info') : (i.situacao ? ui.estado(ROTULO_SITUACAO[i.situacao], TOM_SITUACAO[i.situacao]) : '—')}</td>
          <td><button type="button" class="dmc-btn dmc-btn--link" data-conceder="${i.matriculaId}">Conceder tentativa<span class="dmc-sr-only"> a ${i.aluno.nome || 'aluno'}</span></button></td>
        </tr>`)}</tbody>
      </table>` : H`<div class="pf-av-vazio"><p class="pf-av-vazio__titulo">Nenhuma tentativa ainda</p><p>Os resultados aparecem quando os alunos enviarem a primeira tentativa.</p></div>`}
    </div>`));
    el.querySelectorAll('[data-conceder]').forEach((b) => b.addEventListener('click', () => {
      const item = r.itens.find((x) => x.matriculaId === b.getAttribute('data-conceder'));
      conceder(ctx, a, item, () => montarResultados(el, ctx, d));
    }));
  }

  async function conceder(ctx, avaliacao, item, depois) {
    const { ui, api } = ctx;
    const resumo = `${ROTULO_TIPO[avaliacao.tipo]} · ${item.tentativas.usadas} de ${item.tentativas.permitidas} tentativas usadas · melhor nota ${nota(ui, item.melhorNota)}${item.situacao ? ` · ${ROTULO_SITUACAO[item.situacao]}` : ''}`;
    const r = await ui.confirmar({
      titulo: 'Conceder nova tentativa?',
      texto: `${resumo}.${item.finalizada ? ' O aluno já viu o gabarito: a nova tentativa sorteia questões do banco e pode repetir questões.' : ''}`,
      rotuloConfirmar: 'Conceder 1 tentativa', motivo: true
    });
    if (!r) return;
    try {
      await api.post(API.concessoes(avaliacao.id), { matriculaId: item.matriculaId, quantidade: 1, motivo: r.motivo });
      ui.toast('Nova tentativa concedida. O aluno foi notificado.', { tipo: 'sucesso' });
      if (depois) depois();
    } catch (err) { ui.toast(textoDoErro(err), { tipo: 'erro' }); }
  }

  // =============================================================
  // Editor de questão — #/avaliacoes/:id/questoes/nova | :qid
  // =============================================================
  async function montarQuestao(el, ctx) {
    const { ui, api } = ctx;
    const H = ui.html;
    const id = ctx.params.id;
    const qid = ctx.params.qid || 'nova';
    ui.esqueleto(el, { tipo: 'texto', linhas: 5 });
    let d;
    try { d = await carregarAvaliacao(ctx, id); } catch (err) { erroEm(ctx, el, err, () => montarQuestao(el, ctx)); return; }
    el.removeAttribute('aria-busy');
    const nova = qid === 'nova';
    const q = nova ? null : d.itens.find((x) => x.id === qid);
    if (!nova && !q) { ui.estadoVazio(el, { titulo: 'Questão não encontrada', acao: { rotulo: 'Voltar ao banco', href: `#/avaliacoes/${id}/questoes` } }); return; }
    ctx.definirTitulo(nova ? 'Nova questão' : 'Editar questão');
    const tcc = d.modulo && d.modulo.tipo === 'tcc';
    const tipos = ['objetiva', 'dissertativa'].concat(tcc ? ['arquivo'] : []);
    let tipo = q ? q.tipo : 'objetiva';
    const somenteLeitura = !d.podeEditar;
    let alternativas = q && q.tipo === 'objetiva' ? q.alternativas.map((x) => ({ id: x.id, texto: x.texto })) : [{ id: 'a', texto: '' }, { id: 'b', texto: '' }];
    let correta = q && q.corretaId ? q.corretaId : null;

    function htmlAlternativas() {
      return H`${alternativas.map((alt, i) => H`<div class="pf-av-alt-linha">
        <span class="pf-av-alternativa__letra" aria-hidden="true">${LETRAS[i]}</span>
        <label class="pf-av-check"><input type="radio" name="correta" value="${alt.id}" ${correta === alt.id ? ui.cru('checked') : ''} ${somenteLeitura ? ui.cru('disabled') : ''}><span class="dmc-sr-only">Alternativa ${LETRAS[i]} é a </span>Correta</label>
        <input class="pf-av-input" data-alt="${alt.id}" value="${alt.texto}" maxlength="1000" aria-label="${`Texto da alternativa ${LETRAS[i]}`}" ${somenteLeitura ? ui.cru('disabled') : ''}>
        ${alternativas.length > 2 && !somenteLeitura ? H`<button type="button" class="dmc-btn dmc-btn--link" data-remover="${alt.id}">Remover<span class="dmc-sr-only"> alternativa ${LETRAS[i]}</span></button>` : ''}
      </div>`)}
      ${alternativas.length < 6 && !somenteLeitura ? H`<button type="button" class="dmc-btn dmc-btn--secondary" data-adicionar>Adicionar alternativa</button>` : ''}`;
    }

    function desenhar() {
      const dis = somenteLeitura ? ui.cru('disabled') : '';
      el.replaceChildren(nos(H`<form class="pf-av-prof" data-questao-form novalidate>
        <p class="pf-av-overline">Avaliações · ${modRotulo(d.modulo)} · ${ROTULO_TIPO[d.avaliacao.tipo]}</p>
        ${q && q.sorteada ? H`<div class="pf-av-alerta pf-av-alerta--aviso" role="status"><p>Esta questão já foi sorteada. As tentativas já feitas mantêm a versão original.</p></div>` : ''}
        <div class="pf-av-cartao pf-av-grade">
          <div class="pf-av-campo"><span class="pf-av-campo__rotulo" id="pf-av-tipo-q">Tipo</span>
            <div class="pf-av-segmento" role="group" aria-labelledby="pf-av-tipo-q">${tipos.map((t) => H`<button type="button" class="pf-av-segmento__botao" data-tipo="${t}" aria-pressed="${t === tipo ? 'true' : 'false'}" ${!nova ? ui.cru('disabled') : ''}>${ROTULO_QUESTAO[t]}</button>`)}</div>
          </div>
          <label class="pf-av-campo"><span class="pf-av-campo__rotulo">Enunciado</span><textarea class="pf-av-input" name="enunciado" rows="5" maxlength="4000" ${dis}>${q ? q.enunciado : ''}</textarea><span class="pf-av-campo__erro" data-erro="enunciado" hidden></span></label>
          ${tipo === 'objetiva' ? H`<fieldset class="pf-av-campo"><legend class="pf-av-campo__rotulo">Alternativas (de 2 a 6; marque a correta)</legend><div class="pf-av-alts" data-alts>${htmlAlternativas()}</div><span class="pf-av-campo__erro" data-erro="corretaId" hidden></span><span class="pf-av-campo__erro" data-erro="alternativas" hidden></span></fieldset>
            <label class="pf-av-campo"><span class="pf-av-campo__rotulo">Comentário do gabarito (o aluno vê depois de finalizar)</span><textarea class="pf-av-input" name="explicacao" rows="3" maxlength="4000" ${dis}>${q ? q.explicacao : ''}</textarea></label>` : ''}
          ${tipo !== 'objetiva' ? H`<label class="pf-av-campo"><span class="pf-av-campo__rotulo">Orientação ao aluno (aparece acima do campo de resposta)</span><textarea class="pf-av-input" name="orientacao" rows="3" maxlength="2000" ${dis}>${q && q.orientacao ? q.orientacao : ''}</textarea></label>` : ''}
          ${tipo === 'dissertativa' ? H`<label class="pf-av-campo"><span class="pf-av-campo__rotulo">Limite de caracteres (100 a 10.000)</span><input class="pf-av-input pf-av-input--curto" type="number" name="limiteCaracteres" min="100" max="10000" value="${q && q.limiteCaracteres ? q.limiteCaracteres : 4000}" ${dis}><span class="pf-av-campo__ajuda">Vale para as tentativas iniciadas depois da alteração.</span><span class="pf-av-campo__erro" data-erro="limiteCaracteres" hidden></span></label>
            <label class="pf-av-campo"><span class="pf-av-campo__rotulo">Resposta de referência (só quem corrige vê)</span><textarea class="pf-av-input" name="respostaReferencia" rows="4" maxlength="8000" ${dis}>${q && q.respostaReferencia ? q.respostaReferencia : ''}</textarea></label>` : ''}
          ${tipo === 'arquivo' ? H`<p class="pf-av-campo__ajuda">O aluno envia um PDF de até 4 MB. A entrega é corrigida em Correção.</p>` : ''}
          <label class="pf-av-campo"><span class="pf-av-campo__rotulo">Pontos</span><input class="pf-av-input pf-av-input--curto" type="number" name="pontos" min="0.25" max="100" step="0.25" value="${q ? q.pontos : 1}" ${dis}><span class="pf-av-campo__erro" data-erro="pontos" hidden></span></label>
        </div>
        <div class="pf-av-acoes">
          ${somenteLeitura ? '' : H`<button type="submit" class="dmc-btn dmc-btn--primary" data-salvar="voltar">Salvar questão</button>${nova ? H`<button type="submit" class="dmc-btn dmc-btn--secondary" data-salvar="outra">Salvar e criar outra</button>` : ''}`}
          <a class="dmc-btn dmc-btn--link" href="${`#/avaliacoes/${id}/questoes`}">← Banco de questões</a>
        </div>
      </form>`));
      ligar();
    }

    function lerAlternativas() {
      el.querySelectorAll('[data-alt]').forEach((inp) => {
        const alt = alternativas.find((x) => x.id === inp.getAttribute('data-alt'));
        if (alt) alt.texto = inp.value;
      });
      const r = el.querySelector('input[name="correta"]:checked');
      correta = r ? r.value : null;
    }

    function ligar() {
      const form = el.querySelector('[data-questao-form]');
      el.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => { lerAlternativas(); tipo = b.getAttribute('data-tipo'); desenhar(); }));
      const caixa = el.querySelector('[data-alts]');
      if (caixa) caixa.addEventListener('click', (ev) => {
        const b = ev.target.closest('button');
        if (!b) return;
        lerAlternativas();
        if (b.hasAttribute('data-adicionar')) {
          const livre = ['a', 'b', 'c', 'd', 'e', 'f'].find((x) => !alternativas.some((y) => y.id === x));
          alternativas.push({ id: livre, texto: '' });
        } else if (b.hasAttribute('data-remover')) {
          alternativas = alternativas.filter((x) => x.id !== b.getAttribute('data-remover'));
          if (!alternativas.some((x) => x.id === correta)) correta = null;
        }
        caixa.replaceChildren(nos(htmlAlternativas()));
      });
      let modoSalvar = 'voltar';
      form.querySelectorAll('[data-salvar]').forEach((b) => b.addEventListener('click', () => { modoSalvar = b.getAttribute('data-salvar'); }));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (somenteLeitura) return;
        lerAlternativas();
        form.querySelectorAll('[data-erro]').forEach((x) => { x.hidden = true; x.textContent = ''; });
        const f = new FormData(form);
        const corpo = { enunciado: String(f.get('enunciado') || ''), pontos: Number(f.get('pontos') || 1) };
        if (nova) corpo.tipo = tipo;
        if (tipo === 'objetiva') {
          corpo.alternativas = alternativas.map((x) => ({ id: x.id, texto: x.texto }));
          corpo.corretaId = correta;
          corpo.explicacao = String(f.get('explicacao') || '');
          if (!correta) {
            const e = form.querySelector('[data-erro="corretaId"]');
            e.hidden = false; e.textContent = 'Marque a alternativa correta.';
            return;
          }
        } else {
          corpo.orientacao = String(f.get('orientacao') || '') || null;
          if (tipo === 'dissertativa') {
            corpo.limiteCaracteres = Number(f.get('limiteCaracteres') || 4000);
            corpo.respostaReferencia = String(f.get('respostaReferencia') || '') || null;
          }
        }
        if (!nova) corpo.versao = q.versao;
        const botao = form.querySelector(`[data-salvar="${modoSalvar}"]`);
        ui.ocupado(botao, true, 'Salvando…');
        try {
          if (nova) await api.post(API.questoes(id), corpo); else await api.put(API.questao(q.id), corpo);
          ui.toast('Questão salva.', { tipo: 'sucesso' });
          if (modoSalvar === 'outra') { montarQuestao(el, ctx); return; }
          ctx.navegar(`avaliacoes/${id}/questoes`);
        } catch (err) {
          ui.ocupado(botao, false);
          if (err && err.campos) {
            for (const [k, v] of Object.entries(err.campos)) {
              const alvo = form.querySelector(`[data-erro="${k.split('.')[0]}"]`);
              if (alvo) { alvo.hidden = false; alvo.textContent = v; }
            }
          }
          if (err && err.codigo === 'conflito-versao') ui.toast('Alguém alterou esta questão enquanto você editava. Recarregue a página.', { tipo: 'aviso' });
          else ui.toast(textoDoErro(err), { tipo: 'erro' });
        }
      });
    }
    desenhar();
  }

  // =============================================================
  // Prévia — #/avaliacoes/:id/previa
  // =============================================================
  async function montarPrevia(el, ctx) {
    ctx.definirTitulo('Pré-visualização');
    if (!window.DMC_Avaliacao || typeof window.DMC_Avaliacao.montar !== 'function') {
      ctx.ui.alerta(el, { tom: 'erro', titulo: 'Pré-visualização indisponível', texto: 'Recarregue a página e tente de novo.' });
      return null;
    }
    return window.DMC_Avaliacao.montar(el, { avaliacaoId: ctx.params.id, modo: 'previa' });
  }

  // =============================================================
  // Fila de correção — #/correcao
  // =============================================================
  function lerCega() { try { return window.localStorage.getItem(CHAVE_CEGA) === '1'; } catch (_e) { return false; } }
  function gravarCega(v) { try { window.localStorage.setItem(CHAVE_CEGA, v ? '1' : '0'); } catch (_e) { /* sem armazenamento */ } }

  async function montarFila(el, ctx) {
    const { ui, api } = ctx;
    const H = ui.html;
    let status = ctx.filtros.get('status') === 'corrigida' ? 'corrigida' : 'aguardando_correcao';
    let cursoId = ctx.filtros.get('curso') || '';
    let cursos = [];
    try { cursos = (await api.get(API.cursos, { sinal: ctx.sinal })).cursos || []; } catch (err) { erroEm(ctx, el, err, () => montarFila(el, ctx)); return; }
    el.replaceChildren(nos(H`<div class="pf-av-prof">
      <div class="pf-av-filtros">
        <div class="pf-av-segmento" role="group" aria-label="Situação da correção" data-status></div>
        ${cursos.length > 1 ? H`<label class="pf-av-campo"><span class="pf-av-campo__rotulo">Curso</span><select class="pf-av-input" data-curso><option value="">Todos</option>${cursos.map((c) => H`<option value="${c.id}" ${c.id === cursoId ? ui.cru('selected') : ''}>${c.titulo}</option>`)}</select></label>` : ''}
        <label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" data-cega ${lerCega() ? ui.cru('checked') : ''}><span>Ocultar nome dos alunos durante a correção</span></label>
      </div>
      <div data-fila></div>
    </div>`));
    const alvo = el.querySelector('[data-fila]');
    const seg = el.querySelector('[data-status]');
    async function carregar() {
      ui.esqueleto(alvo, { tipo: 'tabela', linhas: 4 });
      const q = new URLSearchParams({ status });
      if (cursoId) q.set('cursoId', cursoId);
      let r;
      try { r = await api.get(`${API.correcoes}?${q.toString()}`, { sinal: ctx.sinal }); } catch (err) { erroEm(ctx, alvo, err, carregar); return; }
      alvo.removeAttribute('aria-busy');
      seg.replaceChildren(nos(H`<button type="button" class="pf-av-segmento__botao" data-st="aguardando_correcao" aria-pressed="${status === 'aguardando_correcao' ? 'true' : 'false'}">A corrigir (${num(r.contagens.aguardando)})</button><button type="button" class="pf-av-segmento__botao" data-st="corrigida" aria-pressed="${status === 'corrigida' ? 'true' : 'false'}">Corrigidas (${num(r.contagens.corrigidas)})</button>`));
      const cega = lerCega();
      if (!r.itens.length) {
        ui.estadoVazio(alvo, { titulo: status === 'corrigida' ? 'Nenhuma correção publicada' : 'Nenhuma dissertativa aguardando correção.', texto: status === 'corrigida' ? 'As correções publicadas aparecem aqui.' : 'Quando um aluno enviar uma tentativa com dissertativa ou entrega de arquivo, ela aparece aqui.' });
        return;
      }
      alvo.replaceChildren(nos(H`<table class="pf-av-tabela pf-av-tabela--prof">
        <caption class="dmc-sr-only">${status === 'corrigida' ? 'Tentativas corrigidas' : 'Tentativas a corrigir, mais antigas primeiro'}</caption>
        <thead><tr><th scope="col">Aluno</th><th scope="col">Curso</th><th scope="col">Módulo</th><th scope="col">Avaliação</th><th scope="col">${status === 'corrigida' ? 'Publicada' : 'Entregue'}</th><th scope="col">${status === 'corrigida' ? 'Nota' : 'Pendentes'}</th><th scope="col"><span class="dmc-sr-only">Ações</span></th></tr></thead>
        <tbody>${r.itens.map((i, n) => H`<tr>
          <th scope="row">${cega ? `Aluno ${n + 1}` : (i.aluno.nomeSocial || i.aluno.nome || 'Aluno')}</th>
          <td data-rotulo="Curso">${i.curso.sigla || i.curso.titulo}</td>
          <td data-rotulo="Módulo">${modRotulo(i.modulo)}</td>
          <td data-rotulo="Avaliação">${ROTULO_TIPO[i.avaliacao.tipo] || ''}${i.avaliacao.titulo ? ` · ${i.avaliacao.titulo}` : ''}</td>
          <td data-rotulo="${status === 'corrigida' ? 'Publicada' : 'Entregue'}">${ui.fmt.relativo(status === 'corrigida' ? i.corrigidaEm : i.enviadaEm)}</td>
          <td data-rotulo="${status === 'corrigida' ? 'Nota' : 'Pendentes'}">${status === 'corrigida' ? nota(ui, i.nota) : num(i.dissertativasPendentes)}</td>
          <td><a class="dmc-btn dmc-btn--secondary" href="${`#/correcao/${i.tentativaId}`}">${status === 'corrigida' ? 'Ver' : 'Corrigir'}<span class="dmc-sr-only"> tentativa de ${cega ? `Aluno ${n + 1}` : (i.aluno.nome || 'aluno')}</span></a></td>
        </tr>`)}</tbody>
      </table>`));
    }
    seg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-st]');
      if (!b) return;
      status = b.getAttribute('data-st');
      carregar();
    });
    const sel = el.querySelector('[data-curso]');
    if (sel) sel.addEventListener('change', () => { cursoId = sel.value; carregar(); });
    el.querySelector('[data-cega]').addEventListener('change', (ev) => { gravarCega(ev.target.checked); carregar(); });
    await carregar();
  }

  // =============================================================
  // Correção — #/correcao/:tentativaId
  // =============================================================
  async function montarCorrecao(el, ctx) {
    const { ui, api } = ctx;
    const H = ui.html;
    const id = ctx.params.tentativaId;
    ui.esqueleto(el, { tipo: 'texto', linhas: 6 });
    let d;
    try { d = await api.get(API.tentativa(id), { sinal: ctx.sinal }); } catch (err) {
      if (err && err.status === 404) { ui.estadoVazio(el, { titulo: 'Tentativa não encontrada', texto: 'Ela não existe ou não é de uma turma sua.', acao: { rotulo: 'Voltar à correção', href: '#/correcao' } }); return; }
      erroEm(ctx, el, err, () => montarCorrecao(el, ctx)); return;
    }
    el.removeAttribute('aria-busy');
    ctx.definirTitulo(d.tentativa.status === 'corrigida' ? 'Correção publicada' : 'Corrigir tentativa');
    const t = d.tentativa;
    const manuais = t.questoes.filter((q) => q.tipo !== 'objetiva');
    const rascunho = new Map(manuais.map((q) => [q.questaoId, { pontos: q.correcao && Number.isFinite(q.correcao.pontos) ? q.correcao.pontos : null, comentario: q.correcao ? (q.correcao.comentario || '') : '' }]));
    let indice = 0;
    let versao = t.versao;
    let efeito = d.efeito;
    const publicada = t.status === 'corrigida';
    const cega = lerCega();
    const nomeAluno = cega ? 'Aluno' : (d.aluno.nomeSocial || d.aluno.nome || 'Aluno');
    let modoRevisao = false;

    function contexto() {
      return H`<p class="pf-av-overline">${d.curso ? (d.curso.sigla || d.curso.titulo) : ''} · ${modRotulo(d.modulo)} · ${d.avaliacao ? ROTULO_TIPO[d.avaliacao.tipo] : ''}</p>
        <p class="pf-av-meta">${nomeAluno} · tentativa ${t.numero} de ${d.avaliacao ? d.avaliacao.permitidas : '—'} · entregue em ${ui.fmt.dataHora(t.enviadaEm)}</p>
        <p><a class="dmc-btn dmc-btn--link" href="#/correcao">← Correção</a></p>`;
    }

    function textoEfeito(e) {
      if (!e) return '';
      if (!e.contaParaNota) return 'Esta atividade não conta para a nota do módulo.';
      if (!e.completa) return '';
      const mod = modRotulo(d.modulo);
      if (e.situacaoModulo === 'aprovado') return `Com esta nota o ${mod} fica Aprovado.`;
      if (e.situacaoModulo === 'em_recuperacao') return `Com esta nota o ${mod} fica Em recuperação${Number.isFinite(e.restantes) ? ` (${e.restantes === 1 ? '1 tentativa restante' : `${e.restantes} tentativas restantes`})` : ''}.`;
      if (e.situacaoModulo === 'reprovado') return `Com esta nota o ${mod} fica Reprovado (sem tentativas). Você pode conceder nova tentativa.`;
      return '';
    }

    function desenharQuestao() {
      const q = manuais[indice];
      const r = rascunho.get(q.questaoId);
      const resposta = q.resposta || {};
      const editavel = !publicada || modoRevisao;
      el.replaceChildren(nos(H`<div class="pf-av-prof">
        ${contexto()}
        <div class="pf-av-linha"><p class="pf-av-topo__posicao" tabindex="-1" data-pos>Questão ${indice + 1} de ${manuais.length}</p>
          <button type="button" class="dmc-btn dmc-btn--secondary" data-ir="-1" ${indice === 0 ? ui.cru('disabled') : ''}>Anterior</button>
          <button type="button" class="dmc-btn dmc-btn--secondary" data-ir="1" ${indice === manuais.length - 1 ? ui.cru('disabled') : ''}>Próxima</button>
          <button type="button" class="dmc-btn dmc-btn--link" data-resumo>Resumo</button>
        </div>
        <div class="pf-av-grade pf-av-grade--7-5">
          <div class="pf-av-cartao">
            <p class="pf-av-questao__n">${ROTULO_QUESTAO[q.tipo]} · vale ${pts(q.pontos)} ${q.pontos === 1 ? 'ponto' : 'pontos'}</p>
            <p class="pf-av-enunciado">${q.enunciado}</p>
            ${q.tipo === 'arquivo'
              ? (resposta.arquivo ? H`<p>PDF · ${ui.fmt.bytes ? ui.fmt.bytes(resposta.arquivo.tamanho) : `${num(resposta.arquivo.tamanho)} bytes`} · enviado em ${ui.fmt.dataHora(resposta.em)}</p><button type="button" class="dmc-btn dmc-btn--secondary" data-baixar="${q.questaoId}">Baixar entrega (PDF)</button>` : H`<p class="pf-av-meta">Nenhum arquivo enviado.</p>`)
              : H`<div class="pf-av-resposta-aluno">${resposta.texto ? resposta.texto : 'Em branco.'}</div>
                <p class="pf-av-contador">${num(resposta.texto ? Array.from(resposta.texto).length : 0)} de ${num(q.limiteCaracteres || 10000)} caracteres</p>`}
            ${q.orientacao ? H`<details class="pf-av-devolutivas"><summary>Orientação ao aluno</summary><p class="pf-av-texto-livre">${q.orientacao}</p></details>` : ''}
            ${q.respostaReferencia ? H`<details class="pf-av-devolutivas"><summary>Resposta de referência</summary><p class="pf-av-texto-livre">${q.respostaReferencia}</p></details>` : ''}
          </div>
          <form class="pf-av-cartao pf-av-fixo" id="pf-av-pontos-form" data-pontos-form novalidate>
            <label class="pf-av-campo"><span class="pf-av-campo__rotulo">Pontos</span>
              <span class="pf-av-pontos">
                <button type="button" class="dmc-btn dmc-btn--secondary pf-av-pontos__botao" data-passo="-0.25" aria-label="Diminuir 0,25" ${editavel ? '' : ui.cru('disabled')}>−</button>
                <input class="pf-av-input" type="number" name="pontos" min="0" max="${q.pontos}" step="0.25" value="${r.pontos === null ? '' : r.pontos}" ${editavel ? '' : ui.cru('disabled')}>
                <button type="button" class="dmc-btn dmc-btn--secondary pf-av-pontos__botao" data-passo="0.25" aria-label="Aumentar 0,25" ${editavel ? '' : ui.cru('disabled')}>+</button>
              </span>
              <span class="pf-av-campo__ajuda">Pontos da questão: ${r.pontos === null ? '—' : pts(r.pontos)} de ${pts(q.pontos)}</span>
              <span class="pf-av-campo__erro" data-erro hidden></span>
            </label>
            <label class="pf-av-campo"><span class="pf-av-campo__rotulo">Devolutiva para o aluno</span><textarea class="pf-av-input" name="comentario" rows="6" maxlength="4000" ${editavel ? '' : ui.cru('disabled')}>${r.comentario}</textarea><span class="pf-av-campo__ajuda">Diga o que sustentou a nota e o que faltou.</span></label>
            ${editavel ? H`<div class="pf-av-acoes"><button type="submit" class="dmc-btn dmc-btn--primary">${indice === manuais.length - 1 ? 'Salvar e ver resumo' : 'Salvar e ir para a próxima'}</button></div>` : ''}
            <p class="pf-av-salvo" role="status" data-salvo></p>
          </form>
        </div>
        ${editavel ? H`<div class="pf-av-barra-fixa"><span>Questão ${indice + 1} de ${manuais.length} · vale ${pts(q.pontos)}</span><button type="submit" form="pf-av-pontos-form" class="dmc-btn dmc-btn--primary">${indice === manuais.length - 1 ? 'Salvar e resumo' : 'Salvar e próxima'}</button></div>` : ''}
      </div>`));
      el.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => { lerForm(); indice += Number(b.getAttribute('data-ir')); desenharQuestao(); focarPos(); }));
      el.querySelector('[data-resumo]').addEventListener('click', () => { lerForm(); desenharResumo(); });
      el.querySelectorAll('[data-passo]').forEach((b) => b.addEventListener('click', () => {
        const inp = el.querySelector('input[name="pontos"]');
        const atual = Number(inp.value || 0);
        inp.value = String(Math.max(0, Math.min(q.pontos, Math.round((atual + Number(b.getAttribute('data-passo'))) * 4) / 4)));
      }));
      const baixar = el.querySelector('[data-baixar]');
      if (baixar) baixar.addEventListener('click', () => baixarEntrega(q.questaoId));
      el.querySelector('[data-pontos-form]').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        lerForm();
        const r2 = rascunho.get(q.questaoId);
        const erro = el.querySelector('[data-erro]');
        if (r2.pontos === null || r2.pontos < 0 || r2.pontos > q.pontos || Math.abs(Math.round(r2.pontos * 4) - r2.pontos * 4) > 1e-9) {
          erro.hidden = false; erro.textContent = `Informe de 0 a ${pts(q.pontos)}, em passos de 0,25.`;
          return;
        }
        if (modoRevisao) { avancar(); return; }
        const botao = ev.submitter || ev.target.querySelector('[type="submit"]');
        ui.ocupado(botao, true, 'Salvando…');
        try {
          const resp = await api.put(API.correcao(t.id), { itens: [{ questaoId: q.questaoId, pontos: r2.pontos, comentario: r2.comentario }], publicar: false, versao });
          versao = resp.tentativa.versao;
          efeito = resp.efeito;
          avancar();
          const s = el.querySelector('[data-salvo]');
          if (s) s.textContent = `Salvo às ${ui.fmt.hora(new Date().toISOString())}`;
        } catch (err) {
          ui.ocupado(botao, false);
          tratarErroCorrecao(err);
        }
      });
    }

    function avancar() {
      if (indice < manuais.length - 1) { indice++; desenharQuestao(); focarPos(); } else desenharResumo();
    }
    function focarPos() { const p = el.querySelector('[data-pos]'); if (p) p.focus(); }

    function lerForm() {
      const form = el.querySelector('[data-pontos-form]');
      if (!form) return;
      const q = manuais[indice];
      const v = form.querySelector('input[name="pontos"]').value;
      rascunho.set(q.questaoId, { pontos: v === '' ? null : Number(v), comentario: form.querySelector('textarea[name="comentario"]').value || '' });
    }

    async function baixarEntrega(questaoId) {
      const baixar = window.DMC_UI && typeof window.DMC_UI.baixar === 'function' ? window.DMC_UI.baixar : null;
      try {
        if (baixar) { await baixar(API.entrega(t.id, questaoId), `entrega-tentativa-${t.numero}.pdf`); return; }
        const blob = await api.blob(API.entrega(t.id, questaoId));
        const url = URL.createObjectURL(new Blob([await blob.arrayBuffer()], { type: 'application/octet-stream' }));
        const a = doc.createElement('a');
        a.href = url;
        a.download = `entrega-tentativa-${t.numero}.pdf`;
        doc.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) { ui.toast(textoDoErro(err), { tipo: 'erro' }); }
    }

    function tratarErroCorrecao(err) {
      if (err && err.codigo === 'conflito-versao') {
        ui.toast('Alguém alterou esta correção enquanto você editava. A versão atual foi carregada.', { tipo: 'aviso' });
        montarCorrecao(el, ctx);
        return;
      }
      if (err && err.codigo === 'transicao-invalida') {
        ui.toast('A correção já foi publicada. Use Revisar correção.', { tipo: 'aviso' });
        montarCorrecao(el, ctx);
        return;
      }
      ui.toast(textoDoErro(err), { tipo: 'erro' });
    }

    function desenharResumo(opcoesR) {
      const faltam = manuais.filter((q) => rascunho.get(q.questaoId).pontos === null).length;
      const somaManual = manuais.reduce((s, q) => s + (rascunho.get(q.questaoId).pontos || 0), 0);
      const totalManual = manuais.reduce((s, q) => s + q.pontos, 0);
      const notaT = publicada && !modoRevisao ? t.nota : (efeito ? efeito.notaTentativa : null);
      el.replaceChildren(nos(H`<div class="pf-av-prof">
        ${contexto()}
        <section class="pf-av-cartao" aria-labelledby="pf-av-resumo-t">
          <h2 class="pf-av-secao" id="pf-av-resumo-t" tabindex="-1" data-resumo-t>Resumo da correção</h2>
          <p>Objetivas: ${num(t.acertosObjetivas)} de ${num(t.totalObjetivas)} (corrigidas automaticamente) · ${manuais.some((q) => q.tipo === 'arquivo') ? 'Dissertativas e entregas' : 'Dissertativas'}: ${pts(somaManual)} de ${pts(totalManual)} pts · Nota da tentativa: ${nota(ui, notaT)}</p>
          ${faltam ? H`<p class="pf-av-motivo" id="pf-av-faltam">Faltam pontos em ${faltam === 1 ? '1 questão' : `${faltam} questões`}.</p>` : ''}
          ${!publicada && efeito ? H`<p>${textoEfeito(efeito)}</p>` : ''}
          ${publicada && !modoRevisao ? H`<p>Correção publicada em ${ui.fmt.dataHora(t.corrigidaEm)}${t.codigo ? H` · código <code class="pf-av-codigo">${t.codigo}</code>` : ''}.</p>` : ''}
          <ol class="pf-av-revisao__lista">${manuais.map((q, i) => H`<li class="pf-av-revisao__item"><button type="button" class="pf-av-revisao__link" data-questao="${i}">Questão ${i + 1}</button><span>${rascunho.get(q.questaoId).pontos === null ? 'sem pontos' : `${pts(rascunho.get(q.questaoId).pontos)} de ${pts(q.pontos)}`}</span></li>`)}</ol>
          <div class="pf-av-acoes">
            ${!publicada ? H`<button type="button" class="dmc-btn dmc-btn--primary" data-publicar ${faltam ? ui.cru('disabled aria-describedby="pf-av-faltam"') : ''}>Publicar correção</button>` : ''}
            ${publicada && !modoRevisao ? H`<button type="button" class="dmc-btn dmc-btn--secondary" data-revisar>Revisar correção</button>` : ''}
            ${publicada && modoRevisao ? H`<button type="button" class="dmc-btn dmc-btn--primary" data-salvar-revisao ${faltam ? ui.cru('disabled') : ''}>Salvar revisão</button>` : ''}
            ${d.avaliacao && d.efeito && d.efeito.contaParaNota ? H`<button type="button" class="dmc-btn dmc-btn--link" data-conceder>Conceder nova tentativa</button>` : ''}
          </div>
        </section>
      </div>`));
      const tit = el.querySelector('[data-resumo-t]');
      if (tit && !(opcoesR && opcoesR.semFoco)) tit.focus();
      el.querySelectorAll('[data-questao]').forEach((b) => b.addEventListener('click', () => { indice = Number(b.getAttribute('data-questao')); desenharQuestao(); focarPos(); }));
      const pub = el.querySelector('[data-publicar]');
      if (pub) pub.addEventListener('click', async () => {
        ui.ocupado(pub, true, 'Publicando…');
        try {
          await api.put(API.correcao(t.id), { itens: [], publicar: true, versao });
          ui.toast('Correção publicada. O aluno foi notificado.', { tipo: 'sucesso' });
          montarCorrecao(el, ctx);
        } catch (err) { ui.ocupado(pub, false); tratarErroCorrecao(err); }
      });
      const rev = el.querySelector('[data-revisar]');
      if (rev) rev.addEventListener('click', () => { modoRevisao = true; indice = 0; desenharQuestao(); focarPos(); });
      const salvarRev = el.querySelector('[data-salvar-revisao]');
      if (salvarRev) salvarRev.addEventListener('click', async () => {
        const r = await ui.confirmar({ titulo: 'Salvar a revisão da correção?', texto: 'A nova nota substitui a anterior. A mudança fica registrada na auditoria e o aluno é notificado.', rotuloConfirmar: 'Salvar revisão', motivo: true });
        if (!r) return;
        try {
          await api.put(API.recorrecao(t.id), { itens: manuais.map((q) => ({ questaoId: q.questaoId, pontos: rascunho.get(q.questaoId).pontos, comentario: rascunho.get(q.questaoId).comentario })), motivo: r.motivo, versao });
          ui.toast('Revisão salva. O aluno foi notificado.', { tipo: 'sucesso' });
          montarCorrecao(el, ctx);
        } catch (err) { tratarErroCorrecao(err); }
      });
      const con = el.querySelector('[data-conceder]');
      if (con) con.addEventListener('click', () => conceder(ctx, { id: d.avaliacao.id, tipo: d.avaliacao.tipo }, {
        matriculaId: t.matriculaId, tentativas: { usadas: d.usadas, permitidas: d.avaliacao.permitidas }, melhorNota: efeito ? efeito.notaModulo : null, situacao: efeito ? efeito.situacaoModulo : null, finalizada: false
      }));
    }

    if (!manuais.length || publicada) { desenharResumo({ semFoco: true }); return; }
    desenharQuestao();
  }

  // =============================================================
  // Registro (§6.3)
  // =============================================================
  const editor = montarEditor(null);
  P.registrar({ rota: 'avaliacoes', titulo: 'Avaliações', papeis: EQUIPE, montar: montarLista });
  P.registrar({ rota: 'avaliacoes/:id', titulo: 'Avaliação', papeis: EQUIPE, montar: editor });
  P.registrar({ rota: 'avaliacoes/:id/configuracao', titulo: 'Avaliação', papeis: EQUIPE, montar: montarEditor('configuracao') });
  P.registrar({ rota: 'avaliacoes/:id/questoes', titulo: 'Avaliação', papeis: EQUIPE, montar: montarEditor('questoes') });
  P.registrar({ rota: 'avaliacoes/:id/resultados', titulo: 'Avaliação', papeis: EQUIPE, montar: montarEditor('resultados') });
  P.registrar({ rota: 'avaliacoes/:id/questoes/nova', titulo: 'Nova questão', papeis: EQUIPE, montar: montarQuestao });
  P.registrar({ rota: 'avaliacoes/:id/questoes/:qid', titulo: 'Questão', papeis: EQUIPE, montar: montarQuestao });
  P.registrar({ rota: 'avaliacoes/:id/previa', titulo: 'Pré-visualização', papeis: EQUIPE, montar: montarPrevia });
  P.registrar({
    rota: 'correcao', titulo: 'Correção', papeis: EQUIPE, montar: montarFila,
    resumo: async (ctx) => {
      try {
        const r = await ctx.api.get(`${API.correcoes}?status=aguardando_correcao&porPagina=1`);
        return { valor: r && r.contagens ? r.contagens.aguardando : null, rotulo: 'Correções pendentes', rota: 'correcao', tom: r && r.contagens && r.contagens.aguardando ? 'aviso' : 'neutro' };
      } catch (_e) { return { valor: null, rotulo: 'Correções pendentes', rota: 'correcao' }; }
    }
  });
  P.registrar({ rota: 'correcao/:tentativaId', titulo: 'Corrigir tentativa', papeis: EQUIPE, montar: montarCorrecao });
})();
