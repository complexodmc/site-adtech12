/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-academico.js (F3a)
   Backoffice do acadêmico, registrado em professor.html (F8, D-65/D-66):
     #/ao-vivo                 agenda de encontros (docência; admin = todos)
     #/ao-vivo/novo            novo encontro (turma, módulo, aula gravada)
     #/ao-vivo/:encontroId     editar, cancelar, presenças (lançar/anular)
     #/turmas/:id/frequencia   matriz de frequência (aba da turma)
     #/turmas/:id/encontros    encontros da turma (aba da turma)
     #/turmas/:id/notas        boletim da turma (aba da turma)
     #/alunos/:userId/academico  ResumoMatricula do aluno (aba do aluno)
   Spec: PORTAL-UX.md §7.4, §7.5, §7.9; PORTAL-API.md §6.7.2–§6.7.3.
   Os números vêm do servidor (fonte única de frequência, §8.7): nada é
   calculado aqui. HTML só por ui.html; sem alert/confirm/prompt.
   ============================================================= */
(function () {
  'use strict';
  const P = window.DMC_Professor;
  if (!P) return;

  const API = Object.freeze({
    agenda: '/portal/agenda',
    encontros: '/portal/professor/encontros',
    encontro: id => `/portal/professor/encontros/${encodeURIComponent(id)}`,
    cancelar: id => `/portal/professor/encontros/${encodeURIComponent(id)}/cancelar`,
    presencas: id => `/portal/professor/encontros/${encodeURIComponent(id)}/presencas`,
    matriz: id => `/portal/professor/turmas/${encodeURIComponent(id)}/frequencia`,
    boletim: (cursoId, turmaId) => `/portal/professor/cursos/${encodeURIComponent(cursoId)}/boletim?turmaId=${encodeURIComponent(turmaId)}`,
    turmasDoCurso: cursoId => `/portal/professor/cursos/${encodeURIComponent(cursoId)}/turmas`,
    resumo: id => `/portal/professor/matriculas/${encodeURIComponent(id)}/academico`,
    catalogo: '/catalogo'
  });
  const TZ = 'America/Sao_Paulo';
  const PA = ['professor', 'admin'];
  const fDataHora = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fHora = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const fDiaSemana = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', hour: '2-digit', hour12: false });
  const fDiaMesCurto = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
  const dataHora = iso => (iso ? fDataHora.format(new Date(iso)) : '—');
  const diaMes = iso => (iso ? fDiaMesCurto.format(new Date(iso)) : '—');
  const pct = n => (typeof n === 'number' ? `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—');
  const nota = n => (typeof n === 'number' ? n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—');
  const horas = n => (typeof n === 'number' ? `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h` : '—');
  const STATUS = Object.freeze({ agendada: ['Agendado', 'neutro'], 'ao-vivo': ['Ao vivo agora', 'info'], encerrada: ['Encerrado', 'neutro'], cancelada: ['Cancelado', 'neutro'] });
  const CELULA = Object.freeze({ presente: ['P', 'Presente', 'sucesso'], compensado: ['G', 'Compensado pela gravação', 'sucesso'], falta: ['F', 'Falta', 'erro'], em_andamento: ['…', 'Em andamento', 'info'], futuro: ['·', 'Ainda não aconteceu', 'neutro'] });
  const SITUACAO = Object.freeze({ cursando: ['Cursando', 'info'], aprovado: ['Aprovado', 'sucesso'], concluido: ['Concluído', 'sucesso'], em_recuperacao: ['Em recuperação', 'aviso'], reprovado: ['Reprovado', 'erro'] });

  /** datetime-local (horário de Brasília) → ISO. */
  function isoDeLocal(v) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v || '')) return null;
    const d = new Date(`${v}:00-03:00`);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  /** ISO → valor de datetime-local em horário de Brasília. */
  function localDeIso(iso) {
    if (!iso) return '';
    const d = new Date(new Date(iso).getTime() - 3 * 3600000);
    return d.toISOString().slice(0, 16);
  }
  /** Rótulo sugerido do encontro pela data e hora (UX §7.9): "Sexta · noite". */
  function rotuloSugerido(iso) {
    if (!iso) return '';
    const partes = fDiaSemana.formatToParts(new Date(iso));
    const dia = (partes.find(p => p.type === 'weekday') || {}).value || '';
    const h = Number((partes.find(p => p.type === 'hour') || {}).value);
    const periodo = h < 12 ? 'manhã' : (h < 18 ? 'tarde' : 'noite');
    const nome = dia.replace('-feira', '');
    return nome ? `${nome.charAt(0).toLocaleUpperCase('pt-BR')}${nome.slice(1)} · ${periodo}` : '';
  }

  function estado(ui, rotulo, tom) {
    return ui.html`<span class="${`pf-estado pf-estado--${tom}`}">${ui.icone ? ui.icone(`estado${tom.charAt(0).toUpperCase()}${tom.slice(1)}`) : ''}${rotulo}</span>`;
  }
  const nos = (ui, h) => (typeof ui.nos === 'function' ? ui.nos(h) : (() => { const t = document.createElement('template'); t.innerHTML = String(h); return t.content; })());

  function erroDoCampo(err) {
    const campos = err && err.campos ? Object.values(err.campos).join(' ') : '';
    return [err && err.message, campos].filter(Boolean).join(' ');
  }

  // ---------------------------------------------------------------
  // #/ao-vivo — lista de encontros (−30 a +90 dias)
  // ---------------------------------------------------------------
  async function montarAgenda(el, ctx) {
    const ui = ctx.ui;
    const curso = ctx.filtros.get('curso') || '';
    const acoes = document.querySelector('[data-pf-prof-acoes]');
    if (acoes) acoes.replaceChildren(nos(ui, ui.html`<a class="dmc-btn dmc-btn--primary" href="#/ao-vivo/novo">Novo encontro</a>`));
    ui.esqueleto(el, { tipo: 'tabela', linhas: 5 });
    const de = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const ate = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
    const q = new URLSearchParams({ de, ate });
    if (curso) q.set('cursoId', curso);
    let r;
    try { r = await ctx.api.get(`${API.agenda}?${q}`); } catch (err) { if (err && err.status === 401) throw err; ui.erroCarga(el, err, { tentarDeNovo: () => montarAgenda(el, ctx) }); return; }
    el.removeAttribute('aria-busy');
    const itens = (r && r.itens) || [];
    const cursos = (r && r.cursos) || [];
    el.replaceChildren(nos(ui, ui.html`
      ${cursos.length > 1 ? ui.html`<div class="pf-ac-filtros"><div class="pf-campo"><label class="pf-rotulo" for="ac-prof-curso">Curso</label>
        <select class="pf-input" id="ac-prof-curso" data-ac-prof-curso><option value="">Todos</option>${cursos.map(c => ui.html`<option value="${c.id}"${c.id === curso ? ' selected' : ''}>${c.titulo}</option>`)}</select></div></div>` : ''}
      ${itens.length ? ui.html`<table class="pf-tabela">
        <caption>${`Encontros de ${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')} (${itens.length})`}</caption>
        <thead><tr><th scope="col">Data e hora</th><th scope="col">Encontro</th><th scope="col">Turma</th><th scope="col">Módulo</th><th scope="col">Situação</th><th scope="col" class="pf-tabela__acoes">Ações</th></tr></thead>
        <tbody>${itens.map(e => ui.html`<tr>
          <td data-rotulo="Data e hora" class="pf-ac-num">${dataHora(e.inicioEm)}–${e.fimEm ? fHora.format(new Date(e.fimEm)) : ''}</td>
          <td data-rotulo="Encontro">${e.titulo}<br><span class="pf-ac-meta">${e.cursoTitulo}</span></td>
          <td data-rotulo="Turma">${e.turma && e.turma.codigo ? e.turma.codigo : 'Curso inteiro'}</td>
          <td data-rotulo="Módulo">${e.modulo ? `${e.modulo.numero || ''} ${e.modulo.titulo}`.trim() : '—'}</td>
          <td data-rotulo="Situação">${estado(ui, (STATUS[e.status] || STATUS.agendada)[0], (STATUS[e.status] || STATUS.agendada)[1])}${typeof e.esperados === 'number' ? ui.html`<br><span class="pf-ac-meta">${`${e.presentes} de ${e.esperados} presentes`}</span>` : ''}</td>
          <td class="pf-tabela__acoes"><a class="dmc-btn dmc-btn--secondary" href="${`#/ao-vivo/${encodeURIComponent(e.id)}`}">Abrir</a></td>
        </tr>`)}</tbody></table>`
      : ui.html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhum encontro neste período.</p><p class="pf-vazio__texto">Agende o primeiro em Novo encontro.</p></div>`}`));
    const aoMudar = (ev) => {
      const s = ev.target.closest('[data-ac-prof-curso]');
      if (s) ctx.navegar('ao-vivo', s.value ? new URLSearchParams({ curso: s.value }) : undefined);
    };
    el.addEventListener('change', aoMudar);
    return { destruir() { el.removeEventListener('change', aoMudar); } };
  }

  // ---------------------------------------------------------------
  // Formulário do encontro (novo e edição)
  // ---------------------------------------------------------------
  async function opcoesDoCurso(ctx, cursoId) {
    const [turmas, cat] = await Promise.all([
      cursoId ? ctx.api.get(API.turmasDoCurso(cursoId), { silencioso404: true }).catch(() => null) : null,
      ctx.api.get(API.catalogo).catch(() => null)
    ]);
    const curso = cat && Array.isArray(cat.cursos) ? cat.cursos.find(c => c.id === cursoId) : null;
    return { turmas: (turmas && turmas.itens) || null, modulos: curso ? (curso.modulos || []) : [] };
  }

  function formularioHtml(ui, ctx, { encontro = null, opcoes = { turmas: null, modulos: [] }, cursoId = '' }) {
    const e = encontro || {};
    const mod = (opcoes.modulos || []).find(m => m.id === (e.moduloId || (e.modulo && e.modulo.id))) || null;
    return ui.html`<form class="pf-ac-form" data-ac-form novalidate>
      <div class="pf-ac-filtros">
        <div class="pf-campo"><label class="pf-rotulo" for="ac-e-curso">Curso</label>
          <select class="pf-input" id="ac-e-curso" name="cursoId" required${encontro ? ' disabled' : ''}>
            <option value="">Escolha o curso</option>
            ${(ctx.cursos || []).map(c => ui.html`<option value="${c.id}"${c.id === cursoId ? ' selected' : ''}>${c.titulo}</option>`)}
          </select></div>
        <div class="pf-campo"><label class="pf-rotulo" for="ac-e-turma">Turma</label>
          <select class="pf-input" id="ac-e-turma" name="turmaId">
            <option value="">Curso inteiro (todas as turmas)</option>
            ${(opcoes.turmas || []).map(t => ui.html`<option value="${t.id}"${e.turma && e.turma.id === t.id ? ' selected' : ''}>${t.codigo}</option>`)}
          </select></div>
        <div class="pf-campo"><label class="pf-rotulo" for="ac-e-modulo">Módulo</label>
          <select class="pf-input" id="ac-e-modulo" name="moduloId">
            <option value="">Sem módulo</option>
            ${(opcoes.modulos || []).map(m => ui.html`<option value="${m.id}"${mod && mod.id === m.id ? ' selected' : ''}>${`${m.numero || ''} ${m.titulo}`.trim()}</option>`)}
          </select></div>
        <div class="pf-campo"><label class="pf-rotulo" for="ac-e-aula">Aula gravada correspondente</label>
          <select class="pf-input" id="ac-e-aula" name="aulaGravadaId">
            <option value="">Nenhuma</option>
            ${(mod ? mod.aulas || [] : []).map(a => ui.html`<option value="${a.id}"${e.aulaGravadaId === a.id ? ' selected' : ''}>${a.titulo}</option>`)}
          </select></div>
      </div>
      <div class="pf-ac-filtros">
        <div class="pf-campo"><label class="pf-rotulo" for="ac-e-inicio">Início (horário de Brasília)</label>
          <input class="pf-input" type="datetime-local" id="ac-e-inicio" name="inicioEm" required value="${localDeIso(e.inicioEm)}"></div>
        <div class="pf-campo"><label class="pf-rotulo" for="ac-e-duracao">Duração (min)</label>
          <input class="pf-input" type="number" id="ac-e-duracao" name="duracaoMin" min="15" max="720" step="5" value="${String(e.duracaoMin || 180)}"></div>
        <div class="pf-campo"><label class="pf-rotulo" for="ac-e-titulo">Título</label>
          <input class="pf-input" type="text" id="ac-e-titulo" name="titulo" required maxlength="180" value="${e.titulo || ''}">
          <p class="pf-ajuda" data-ac-sugestao></p></div>
      </div>
      <div class="pf-ac-filtros">
        <div class="pf-campo"><label class="pf-rotulo" for="ac-e-url">Link da sala (https)</label>
          <input class="pf-input" type="url" id="ac-e-url" name="url" maxlength="500" inputmode="url" value="${e.url || ''}"></div>
        <div class="pf-campo"><label class="pf-rotulo" for="ac-e-plataforma">Plataforma</label>
          <input class="pf-input" type="text" id="ac-e-plataforma" name="plataforma" maxlength="60" value="${e.plataforma || ''}"></div>
      </div>
      <div class="pf-campo"><label class="pf-rotulo" for="ac-e-descricao">Descrição</label>
        <textarea class="pf-input" id="ac-e-descricao" name="descricao" rows="3" maxlength="2000">${e.descricao || ''}</textarea></div>
      <p class="pf-ajuda">O aluno vê o link só na janela da sala (15 minutos antes até o fim). A presença é registrada quando ele entra pelo portal.</p>
      <div class="pf-alerta pf-alerta--erro" role="alert" data-ac-erro hidden></div>
      <p class="pf-ac-links"><button type="submit" class="dmc-btn dmc-btn--primary">${encontro ? 'Salvar alterações' : 'Agendar encontro'}</button></p>
    </form>`;
  }

  function ligarFormulario(form, ctx, { encontro = null, opcoes, aoSalvar }) {
    const ui = ctx.ui;
    const sel = n => form.querySelector(`[name="${n}"]`);
    const erroEl = form.querySelector('[data-ac-erro]');
    const sugerir = () => {
      const iso = isoDeLocal(sel('inicioEm').value);
      const s = rotuloSugerido(iso);
      const alvo = form.querySelector('[data-ac-sugestao]');
      alvo.textContent = s ? `Sugestão de rótulo: ${s}` : '';
      if (s && !sel('titulo').value.trim()) sel('titulo').value = s;
    };
    const recarregarModulos = async () => {
      const cursoId = sel('cursoId').value;
      const o = await opcoesDoCurso(ctx, cursoId);
      opcoes.turmas = o.turmas; opcoes.modulos = o.modulos;
      sel('turmaId').replaceChildren(nos(ui, ui.html`<option value="">Curso inteiro (todas as turmas)</option>${(o.turmas || []).map(t => ui.html`<option value="${t.id}">${t.codigo}</option>`)}`));
      sel('moduloId').replaceChildren(nos(ui, ui.html`<option value="">Sem módulo</option>${o.modulos.map(m => ui.html`<option value="${m.id}">${`${m.numero || ''} ${m.titulo}`.trim()}</option>`)}`));
      sel('aulaGravadaId').replaceChildren(nos(ui, ui.html`<option value="">Nenhuma</option>`));
    };
    const aoMudar = (ev) => {
      if (ev.target === sel('cursoId')) recarregarModulos();
      if (ev.target === sel('moduloId')) {
        const m = (opcoes.modulos || []).find(x => x.id === sel('moduloId').value);
        sel('aulaGravadaId').replaceChildren(nos(ui, ui.html`<option value="">Nenhuma</option>${(m ? m.aulas || [] : []).map(a => ui.html`<option value="${a.id}">${a.titulo}</option>`)}`));
      }
      if (ev.target === sel('inicioEm')) sugerir();
    };
    const aoEnviar = async (ev) => {
      ev.preventDefault();
      erroEl.hidden = true;
      const inicioEm = isoDeLocal(sel('inicioEm').value);
      const corpo = {
        titulo: sel('titulo').value.trim(), inicioEm, duracaoMin: Number(sel('duracaoMin').value) || 180,
        url: sel('url').value.trim(), plataforma: sel('plataforma').value.trim(), descricao: sel('descricao').value,
        turmaId: sel('turmaId').value || null, moduloId: sel('moduloId').value || null, aulaGravadaId: sel('aulaGravadaId').value || null
      };
      if (!encontro) corpo.cursoId = sel('cursoId').value;
      else corpo.versao = encontro.versao;
      if (!inicioEm || !corpo.titulo || (!encontro && !corpo.cursoId)) {
        erroEl.replaceChildren(nos(ui, ui.html`<p>Preencha curso, início e título.</p>`));
        erroEl.hidden = false;
        return;
      }
      const botao = form.querySelector('[type="submit"]');
      ui.ocupado(botao, true, 'Salvando…');
      try {
        const r = encontro ? await ctx.api.put(API.encontro(encontro.id), corpo) : await ctx.api.post(API.encontros, corpo);
        ui.toast(encontro ? 'Encontro atualizado.' : 'Encontro agendado.', { tipo: 'sucesso' });
        aoSalvar(r.encontro);
      } catch (err) {
        if (err && err.status === 401) throw err;
        const texto = err && err.codigo === 'conflito-versao' ? 'O encontro foi alterado por outra pessoa. Recarregue a página e tente de novo.' : (erroDoCampo(err) || 'Não foi possível salvar.');
        erroEl.replaceChildren(nos(ui, ui.html`<p>${texto}</p>`));
        erroEl.hidden = false;
      } finally {
        ui.ocupado(botao, false);
      }
    };
    form.addEventListener('change', aoMudar);
    form.addEventListener('submit', aoEnviar);
    if (!encontro) sugerir();
    return () => { form.removeEventListener('change', aoMudar); form.removeEventListener('submit', aoEnviar); };
  }

  async function montarNovo(el, ctx) {
    const ui = ctx.ui;
    const cursoId = ctx.filtros.get('curso') || ((ctx.cursos || []).length === 1 ? ctx.cursos[0].id : '');
    const opcoes = await opcoesDoCurso(ctx, cursoId);
    el.removeAttribute('aria-busy');
    el.replaceChildren(nos(ui, formularioHtml(ui, ctx, { opcoes, cursoId })));
    const soltar = ligarFormulario(el.querySelector('[data-ac-form]'), ctx, { opcoes, aoSalvar: e => ctx.navegar(`ao-vivo/${e.id}`) });
    return { destruir: soltar };
  }

  /** Encontro de curso inteiro aberto por docente só de turma: só leitura (gestão da docência geral). */
  function montarEncontroLeitura(el, ctx, e) {
    const ui = ctx.ui;
    el.removeAttribute('aria-busy');
    const cancelado = e.status === 'cancelada';
    const st = STATUS[e.status] || STATUS.agendada;
    el.replaceChildren(nos(ui, ui.html`
      <p class="pf-ac-meta">${e.cursoTitulo} · ${dataHora(e.inicioEm)} · ${estado(ui, st[0], st[1])}</p>
      ${cancelado ? ui.html`<div class="pf-alerta pf-alerta--aviso" role="note"><p>Encontro cancelado${e.motivoCancelamento ? `: ${e.motivoCancelamento}` : '.'}</p></div>` : ''}
      <div class="pf-alerta pf-alerta--aviso" role="note" data-ac-somente-leitura><p>Encontro do curso inteiro. Editar, cancelar e lançar presenças cabem à docência geral do curso ou à coordenação. A frequência dos seus alunos está na matriz de cada turma.</p></div>
      <h2 class="pf-secao-titulo pf-ac-secao">Dados do encontro</h2>
      <dl class="pf-ac-matricula__dados">
        <div><dt>Turma</dt><dd>${e.turma && e.turma.codigo ? e.turma.codigo : 'Curso inteiro (todas as turmas)'}</dd></div>
        <div><dt>Módulo</dt><dd>${e.modulo ? `${e.modulo.numero || ''} ${e.modulo.titulo}`.trim() : '—'}</dd></div>
        <div><dt>Aula gravada correspondente</dt><dd>${e.aulaGravada ? e.aulaGravada.titulo : '—'}</dd></div>
        <div><dt>Duração</dt><dd class="pf-ac-num">${`${e.duracaoMin} min`}</dd></div>
        <div><dt>Plataforma</dt><dd>${e.plataforma || '—'}</dd></div>
        <div><dt>Link da sala</dt><dd>${e.url ? ui.html`<a href="${e.url}" target="_blank" rel="noopener noreferrer">${e.url}</a>` : '—'}</dd></div>
      </dl>
      ${e.descricao ? ui.html`<p class="pf-ajuda">${e.descricao}</p>` : ''}
      <p class="pf-ac-links"><a class="dmc-btn dmc-btn--secondary" href="#/ao-vivo">Voltar à agenda</a></p>`));
  }

  // ---------------------------------------------------------------
  // #/ao-vivo/:encontroId — editar, cancelar, presenças
  // ---------------------------------------------------------------
  async function montarEncontro(el, ctx) {
    const ui = ctx.ui;
    const id = ctx.params.encontroId;
    ui.esqueleto(el, { tipo: 'texto', linhas: 6 });
    let enc;
    let pres;
    try {
      enc = await ctx.api.get(API.encontro(id));
      // Gestão pela docência GRAVADA (§6.7.2): sem ela, presenças nem são pedidas (o servidor daria 404).
      if (enc.encontro.podeGerir !== false) pres = await ctx.api.get(API.presencas(id));
    } catch (err) {
      if (err && err.status === 401) throw err;
      ui.erroCarga(el, err, { tentarDeNovo: () => montarEncontro(el, ctx) });
      return;
    }
    const e = enc.encontro;
    ctx.definirTitulo(e.titulo);
    if (!pres) { montarEncontroLeitura(el, ctx, e); return; }
    const opcoes = await opcoesDoCurso(ctx, e.cursoId);
    el.removeAttribute('aria-busy');
    const cancelado = e.status === 'cancelada';
    el.replaceChildren(nos(ui, ui.html`
      <p class="pf-ac-meta">${e.cursoTitulo} · ${dataHora(e.inicioEm)} · ${estado(ui, (STATUS[e.status] || STATUS.agendada)[0], (STATUS[e.status] || STATUS.agendada)[1])}</p>
      ${cancelado ? ui.html`<div class="pf-alerta pf-alerta--aviso" role="note"><p>Encontro cancelado${e.motivoCancelamento ? `: ${e.motivoCancelamento}` : '.'}</p></div>` : ''}
      <h2 class="pf-secao-titulo pf-ac-secao">Presenças</h2>
      <p class="pf-ac-meta">${`${pres.presentes} de ${pres.esperados} presentes`}. Presença = registrada ao entrar na sala pelo portal; "compensada" = aula gravada correspondente concluída.</p>
      ${pres.itens.length ? ui.html`<table class="pf-tabela">
        <caption>Alunos esperados neste encontro</caption>
        <thead><tr><th scope="col">Aluno</th><th scope="col">Matrícula</th><th scope="col">Presença</th><th scope="col" class="pf-tabela__acoes">Ações</th></tr></thead>
        <tbody>${pres.itens.map(i => ui.html`<tr>
          <td data-rotulo="Aluno">${i.aluno.nomeSocial || i.aluno.nome || '—'}</td>
          <td data-rotulo="Matrícula" class="pf-ac-num">${i.numero || '—'}</td>
          <td data-rotulo="Presença">${i.presenca && !i.presenca.anulada ? estado(ui, `Presente · ${dataHora(i.presenca.registradaEm)}${i.presenca.via === 'lancamento_professor' ? ' (lançada)' : ''}`, 'sucesso')
            : (i.presenca && i.presenca.anulada ? estado(ui, 'Registro anulado', 'neutro') : (i.compensadaPorGravacao ? estado(ui, 'Compensada pela gravação', 'sucesso') : estado(ui, 'Sem presença', 'neutro')))}</td>
          <td class="pf-tabela__acoes">${i.presenca && !i.presenca.anulada
            ? ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-ac-presenca="${i.matriculaId}" data-ac-presente="0">Anular</button>`
            : ui.html`<button type="button" class="dmc-btn dmc-btn--secondary" data-ac-presenca="${i.matriculaId}" data-ac-presente="1">Lançar presença</button>`}</td>
        </tr>`)}</tbody></table>`
      : ui.html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhum aluno esperado.</p><p class="pf-vazio__texto">Os esperados são as matrículas vigentes da turma do encontro (ou do curso, sem turma).</p></div>`}
      <h2 class="pf-secao-titulo pf-ac-secao">Dados do encontro</h2>
      ${formularioHtml(ui, ctx, { encontro: { ...e, cursoId: e.cursoId }, opcoes, cursoId: e.cursoId })}
      ${cancelado ? '' : ui.html`<h2 class="pf-secao-titulo pf-ac-secao">Cancelar ou excluir</h2>
        <p class="pf-ajuda">Encontro com presença registrada não pode ser excluído: cancele, e o registro fica na trilha.</p>
        <p class="pf-ac-links"><button type="button" class="dmc-btn dmc-btn--secondary" data-ac-cancelar>Cancelar encontro</button>
        <button type="button" class="dmc-btn dmc-btn--secondary pf-btn--perigo" data-ac-excluir>Excluir</button></p>`}`));
    const soltar = ligarFormulario(el.querySelector('[data-ac-form]'), ctx, { encontro: e, opcoes, aoSalvar: () => montarEncontro(el, ctx) });

    const aoClicar = async (ev) => {
      const b = ev.target.closest('[data-ac-presenca]');
      if (b) {
        const presente = b.getAttribute('data-ac-presente') === '1';
        const r = await ui.confirmar({ titulo: presente ? 'Lançar presença' : 'Anular presença', texto: presente ? 'A presença fica registrada como lançada pelo professor, com o motivo na auditoria.' : 'O registro é mantido na trilha como anulado, com o motivo na auditoria.', rotuloConfirmar: presente ? 'Lançar' : 'Anular', motivo: true, perigo: !presente });
        if (!r) return;
        const motivo = typeof r === 'object' && r.motivo ? r.motivo : '';
        if (motivo.trim().length < 10) { ui.toast('Informe um motivo com pelo menos 10 caracteres.', { tipo: 'erro' }); return; }
        try {
          await ctx.api.post(API.presencas(id), { matriculaId: b.getAttribute('data-ac-presenca'), presente, motivo });
          ui.toast(presente ? 'Presença lançada.' : 'Presença anulada.', { tipo: 'sucesso' });
          montarEncontro(el, ctx);
        } catch (err) { if (err && err.status === 401) throw err; ui.toast(erroDoCampo(err) || 'Não foi possível salvar.', { tipo: 'erro' }); }
        return;
      }
      if (ev.target.closest('[data-ac-cancelar]')) {
        const r = await ui.confirmar({ titulo: 'Cancelar encontro', texto: 'Os alunos esperados são avisados. O encontro deixa de contar na frequência.', rotuloConfirmar: 'Cancelar encontro', rotuloCancelar: 'Voltar', motivo: true, perigo: true });
        if (!r) return;
        const motivo = typeof r === 'object' && r.motivo ? r.motivo : '';
        try {
          await ctx.api.post(API.cancelar(id), { motivo });
          ui.toast('Encontro cancelado.', { tipo: 'sucesso' });
          montarEncontro(el, ctx);
        } catch (err) { if (err && err.status === 401) throw err; ui.toast(erroDoCampo(err) || 'Não foi possível cancelar.', { tipo: 'erro' }); }
        return;
      }
      if (ev.target.closest('[data-ac-excluir]')) {
        const r = await ui.confirmar({ titulo: 'Excluir encontro', texto: 'A exclusão só é aceita sem presença registrada.', rotuloConfirmar: 'Excluir', rotuloCancelar: 'Voltar', perigo: true });
        if (!r) return;
        try {
          await ctx.api.del(API.encontro(id));
          ui.toast('Encontro excluído.', { tipo: 'sucesso' });
          ctx.navegar('ao-vivo');
        } catch (err) { if (err && err.status === 401) throw err; ui.toast(erroDoCampo(err) || 'Não foi possível excluir.', { tipo: 'erro' }); }
      }
    };
    el.addEventListener('click', aoClicar);
    return { destruir() { soltar(); el.removeEventListener('click', aoClicar); } };
  }

  // ---------------------------------------------------------------
  // Abas da turma: frequência (matriz), encontros, notas
  // ---------------------------------------------------------------
  async function montarMatriz(el, ctx) {
    const ui = ctx.ui;
    const turma = ctx.turma || { id: ctx.params.id };
    ui.esqueleto(el, { tipo: 'tabela', linhas: 5 });
    let m;
    try { m = await ctx.api.get(API.matriz(turma.id)); } catch (err) { if (err && err.status === 401) throw err; ui.erroCarga(el, err, { tentarDeNovo: () => montarMatriz(el, ctx) }); return; }
    el.removeAttribute('aria-busy');
    if (!m.alunos.length) { el.replaceChildren(nos(ui, ui.html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhuma matrícula nesta turma.</p></div>`)); return; }
    el.replaceChildren(nos(ui, ui.html`
      <p class="pf-ac-meta">Legenda: P presente · G compensado pela aula gravada · F falta · … em andamento · · ainda não aconteceu. A mesma conta do Acadêmico do aluno e dos comprovantes.</p>
      <div class="pf-ac-matriz" role="region" aria-label="Matriz de frequência (role na horizontal)" tabindex="0">
      <table class="pf-tabela pf-tabela--nunca-empilhar">
        <caption>${`Frequência da turma ${m.turma.codigo || ''}`}</caption>
        <thead><tr><th scope="col">Aluno</th><th scope="col" class="pf-tabela__num">Frequência</th><th scope="col" class="pf-tabela__num">Faltas</th>
          ${m.encontros.map(e => ui.html`<th scope="col" class="pf-tabela__num" title="${`${e.titulo} · ${dataHora(e.inicioEm)} · ${e.presentes}/${e.esperados} presentes`}">${diaMes(e.inicioEm)}</th>`)}</tr></thead>
        <tbody>${m.alunos.map(a => ui.html`<tr>
          <th scope="row">${a.nomeSocial || a.nome || '—'}<br><span class="pf-ac-meta">${a.numero || ''}</span></th>
          <td class="pf-tabela__num">${a.resumo ? pct(a.resumo.frequenciaPct) : '—'}${a.resumo ? ui.html`<br><span class="pf-ac-meta">${`ao vivo ${pct(a.resumo.aoVivoPct)} · gravado ${pct(a.resumo.gravadoPct)}`}</span>` : ''}</td>
          <td class="pf-tabela__num">${a.resumo ? String(a.resumo.faltas) : '—'}</td>
          ${a.celulas.map(c => { const d = CELULA[c.estado] || CELULA.futuro; return ui.html`<td class="pf-tabela__num"><span class="${`pf-estado pf-estado--${d[2]}`}" title="${d[1]}"><span aria-hidden="true">${d[0]}</span><span class="dmc-sr-only">${d[1]}</span></span></td>`; })}
        </tr>`)}</tbody>
      </table></div>`));
  }

  async function montarEncontrosDaTurma(el, ctx) {
    const ui = ctx.ui;
    const turma = ctx.turma || { id: ctx.params.id };
    const de = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
    const ate = new Date(Date.now() + 180 * 864e5).toISOString().slice(0, 10);
    let r;
    try { r = await ctx.api.get(`${API.agenda}?${new URLSearchParams({ de, ate, ...(turma.cursoId ? { cursoId: turma.cursoId } : {}) })}`); } catch (err) { if (err && err.status === 401) throw err; ui.erroCarga(el, err); return; }
    el.removeAttribute('aria-busy');
    const itens = (r.itens || []).filter(e => !e.turma || e.turma.id === turma.id);
    el.replaceChildren(nos(ui, ui.html`<p class="pf-ac-links"><a class="dmc-btn dmc-btn--primary" href="${`#/ao-vivo/novo${turma.cursoId ? `?curso=${encodeURIComponent(turma.cursoId)}` : ''}`}">Novo encontro</a></p>
      ${itens.length ? ui.html`<ul class="pf-lista">${itens.map(e => ui.html`<li class="pf-lista__linha">
          <a class="pf-lista__titulo" href="${`#/ao-vivo/${encodeURIComponent(e.id)}`}">${e.titulo}</a>
          <p class="pf-lista__meta">${`${dataHora(e.inicioEm)} · ${e.turma ? `Turma ${e.turma.codigo}` : 'Curso inteiro'}${e.modulo ? ` · Módulo ${e.modulo.numero || ''}` : ''} · ${(STATUS[e.status] || STATUS.agendada)[0]}`}</p>
        </li>`)}</ul>`
      : ui.html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhum encontro para esta turma.</p></div>`}`));
  }

  async function montarNotas(el, ctx) {
    const ui = ctx.ui;
    const turma = ctx.turma || { id: ctx.params.id };
    if (!turma.cursoId) { el.replaceChildren(nos(ui, ui.html`<div class="pf-vazio"><p class="pf-vazio__titulo">Turma sem curso identificado.</p></div>`)); return; }
    let b;
    try { b = await ctx.api.get(API.boletim(turma.cursoId, turma.id)); } catch (err) { if (err && err.status === 401) throw err; ui.erroCarga(el, err); return; }
    el.removeAttribute('aria-busy');
    if (!b.alunos.length) { el.replaceChildren(nos(ui, ui.html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhuma matrícula nesta turma.</p></div>`)); return; }
    el.replaceChildren(nos(ui, ui.html`<div class="pf-ac-matriz" role="region" aria-label="Boletim da turma (role na horizontal)" tabindex="0"><table class="pf-tabela pf-tabela--nunca-empilhar">
      <caption>Boletim da turma (nota do módulo = maior nota da avaliação modular publicada)</caption>
      <thead><tr><th scope="col">Aluno</th>${b.modulos.map(m => ui.html`<th scope="col" class="pf-tabela__num" title="${m.titulo}">${`M${m.numero}`}</th>`)}</tr></thead>
      <tbody>${b.alunos.map(a => ui.html`<tr><th scope="row">${a.nomeSocial || a.nome || '—'}</th>
        ${a.celulas.map(c => { const s = SITUACAO[c.situacao] || SITUACAO.cursando; return ui.html`<td class="pf-tabela__num">${nota(c.nota)}<br><span class="${`pf-estado pf-estado--${s[1]}`}">${s[0]}</span><br><span class="pf-ac-meta">${`freq. ${pct(c.frequenciaPct)}`}</span></td>`; })}</tr>`)}</tbody>
    </table></div>`));
  }

  // ---------------------------------------------------------------
  // Aba Acadêmico do aluno
  // ---------------------------------------------------------------
  async function montarAlunoAcademico(el, ctx) {
    const ui = ctx.ui;
    if (!ctx.matriculaId) {
      el.replaceChildren(nos(ui, ui.html`<div class="pf-vazio"><p class="pf-vazio__titulo">Liberação ainda sem matrícula.</p><p class="pf-vazio__texto">Notas e frequência aparecem quando a matrícula for registrada pela coordenação.</p></div>`));
      return;
    }
    ui.esqueleto(el, { tipo: 'tabela', linhas: 5 });
    let r;
    try { r = await ctx.api.get(API.resumo(ctx.matriculaId)); } catch (err) { if (err && err.status === 401) throw err; ui.erroCarga(el, err, { tentarDeNovo: () => montarAlunoAcademico(el, ctx) }); return; }
    el.removeAttribute('aria-busy');
    const k = r.kpis;
    const c = r.matricula;
    const sit = SITUACAO[c.situacaoCurso] || SITUACAO.cursando;
    el.replaceChildren(nos(ui, ui.html`
      <p class="pf-ac-meta">${`${c.curso.titulo} · ${c.numero || '—'} · ${c.turma && c.turma.codigo ? `Turma ${c.turma.codigo}` : 'Sem turma'} · ${c.statusRotulo}`} · ${estado(ui, sit[0], sit[1])}</p>
      <dl class="pf-kpis">
        <div class="pf-kpi"><dt class="pf-kpi__rotulo">Média parcial</dt><dd class="pf-kpi__valor">${nota(k.mediaParcial)}</dd>${k.mediaParcial === null ? ui.html`<dd class="pf-kpi__nota">Sem notas ainda</dd>` : ''}</div>
        <div class="pf-kpi"><dt class="pf-kpi__rotulo">Frequência geral</dt><dd class="pf-kpi__valor">${pct(k.frequenciaGeralPct)}</dd><dd class="pf-kpi__nota">${`ao vivo ${pct(k.aoVivoPct)} · gravado ${pct(k.gravadoPct)}`}</dd></div>
        <div class="pf-kpi"><dt class="pf-kpi__rotulo">Módulos</dt><dd class="pf-kpi__valor">${String(k.modulos.total)}</dd><dd class="pf-kpi__nota">${`${k.modulos.aprovados + k.modulos.concluidos} aprovados ou concluídos`}</dd></div>
        <div class="pf-kpi"><dt class="pf-kpi__rotulo">Em andamento</dt><dd class="pf-kpi__valor">${String(k.emAndamento)}</dd></div>
      </dl>
      <table class="pf-tabela">
        <caption>Desempenho por módulo</caption>
        <thead><tr><th scope="col">Módulo</th><th scope="col" class="pf-tabela__num">CH</th><th scope="col" class="pf-tabela__num">Média</th><th scope="col">Frequência</th><th scope="col" class="pf-tabela__num">Faltas</th><th scope="col">Situação</th></tr></thead>
        <tbody>${r.linhas.map(l => { const s = SITUACAO[l.situacao] || SITUACAO.cursando; return ui.html`<tr>
          <th scope="row">${`${l.numero} · ${l.titulo}`}</th>
          <td data-rotulo="CH" class="pf-tabela__num">${horas(l.chHoras)}</td>
          <td data-rotulo="Média" class="pf-tabela__num">${l.aguardandoCorrecao && l.media === null ? 'Em correção' : nota(l.media)}</td>
          <td data-rotulo="Frequência">${l.frequencia ? `${pct(l.frequencia.pct)} · ao vivo ${pct(l.frequencia.aoVivoPct)} · gravado ${pct(l.frequencia.gravadoPct)}` : '—'}</td>
          <td data-rotulo="Faltas" class="pf-tabela__num">${l.frequencia ? String(l.frequencia.faltas) : '—'}</td>
          <td data-rotulo="Situação">${estado(ui, l.situacaoRotulo || s[0], s[1])}</td></tr>`; })}</tbody>
      </table>
      ${r.pendencias.length ? ui.html`<h2 class="pf-secao-titulo pf-ac-secao">Pendências para o certificado</h2><ul>${r.pendencias.map(p => ui.html`<li>${p.texto}</li>`)}</ul>` : ''}
      <p class="pf-ac-regra">${`Nota mínima ${nota(r.notaMinima)}.`} Frequência = presença ao vivo ou conclusão da aula gravada correspondente.</p>`));
  }

  // ---------------------------------------------------------------
  // Registro (§6.3)
  // ---------------------------------------------------------------
  P.registrar({ rota: 'ao-vivo', titulo: 'Aulas ao vivo', papeis: PA, montar: montarAgenda });
  P.registrar({ rota: 'ao-vivo/novo', titulo: 'Novo encontro', papeis: PA, montar: montarNovo });
  P.registrar({ rota: 'ao-vivo/:encontroId', titulo: 'Encontro', papeis: PA, montar: montarEncontro });
  P.registrar({ rota: 'turmas/:id/frequencia', titulo: 'Frequência', papeis: PA, pai: 'turmas/:id', aba: 'frequencia', montar: montarMatriz });
  P.registrar({ rota: 'turmas/:id/notas', titulo: 'Notas', papeis: PA, pai: 'turmas/:id', aba: 'notas', montar: montarNotas });
  P.registrar({ rota: 'turmas/:id/encontros', titulo: 'Encontros', papeis: PA, pai: 'turmas/:id', aba: 'encontros', montar: montarEncontrosDaTurma });
  P.registrar({ rota: 'alunos/:userId/academico', titulo: 'Acadêmico', papeis: PA, pai: 'alunos/:userId', aba: 'academico', montar: montarAlunoAcademico });
})();
