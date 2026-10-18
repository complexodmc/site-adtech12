/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/ao-vivo.js (F3a)
   Aulas ao vivo — PORTAL-UX.md §6.6; PORTAL-API §6.7.2.
   Calendário próprio (sem biblioteca): Hoje · Semana · Mês · Lista,
   filtro por curso, ‹ Hoje › e "Entrar na sala" que registra a
   presença (POST …/entrar com keepalive; o link abre em nova aba sem
   depender do retorno). O container #lives-lista é mantido (R8, D5).
   Visão padrão: Lista (encontros recentes e próximos), para que os
   encontros encerrados, de agora e agendados fiquem na mesma tela;
   a escolha fica em dmc:aoVivo:visao. HTML só por DMC_UI.html.
   ============================================================= */
(function () {
  'use strict';

  const API = Object.freeze({
    agenda: '/portal/agenda',
    entrar: id => `/api/portal/encontros/${encodeURIComponent(id)}/entrar`
  });
  const TZ = 'America/Sao_Paulo';
  const CHAVE_VISAO = 'dmc:aoVivo:visao';
  const VISOES = ['hoje', 'semana', 'mes', 'lista'];
  const UI = window.DMC_UI;
  if (!UI || !window.DMC_Portal) return;
  const html = UI.html;

  // ---------------------------------------------------------------
  // Datas de calendário no fuso de SP ('AAAA-MM-DD')
  // ---------------------------------------------------------------
  const fDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fHora = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const fDiaLongo = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
  const fDiaMes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: 'numeric', month: 'long' });
  const fMesAno = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const fSemanaCurta = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'short' });
  const fDataCurta = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });

  const diaSP = d => fDia.format(d instanceof Date ? d : new Date(d));
  const utcDe = dia => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d, 12)); };
  const diaDe = dt => dt.toISOString().slice(0, 10);
  const somarDias = (dia, n) => { const d = utcDe(dia); d.setUTCDate(d.getUTCDate() + n); return diaDe(d); };
  const segundaDe = (dia) => { const d = utcDe(dia); const w = (d.getUTCDay() + 6) % 7; return somarDias(dia, -w); };
  const primeiroDoMes = dia => `${dia.slice(0, 8)}01`;
  const ultimoDoMes = (dia) => { const d = utcDe(primeiroDoMes(dia)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return diaDe(d); };
  const somarMeses = (dia, n) => { const d = utcDe(primeiroDoMes(dia)); d.setUTCMonth(d.getUTCMonth() + n); return diaDe(d); };
  const maiuscula = s => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);
  const hora = iso => fHora.format(new Date(iso));

  function periodo(visao, ref) {
    if (visao === 'hoje') return { de: ref, ate: ref, titulo: maiuscula(`${fDiaLongo.format(utcDe(ref))} de ${ref.slice(0, 4)}`) };
    if (visao === 'semana') {
      const de = segundaDe(ref);
      const ate = somarDias(de, 6);
      return { de, ate, titulo: `Semana de ${fDiaMes.format(utcDe(de))} a ${fDiaMes.format(utcDe(ate))} de ${ate.slice(0, 4)}` };
    }
    if (visao === 'mes') {
      const de = segundaDe(primeiroDoMes(ref));
      const ate = somarDias(segundaDe(ultimoDoMes(ref)), 6);
      return { de, ate, titulo: maiuscula(fMesAno.format(utcDe(ref))) };
    }
    const de = somarDias(ref, -30);
    const ate = somarDias(ref, 60);
    return { de, ate, titulo: `De ${fDiaMes.format(utcDe(de))} de ${de.slice(0, 4)} a ${fDiaMes.format(utcDe(ate))} de ${ate.slice(0, 4)}` };
  }

  function deslocar(visao, ref, sentido) {
    if (visao === 'hoje') return somarDias(ref, sentido);
    if (visao === 'semana') return somarDias(ref, 7 * sentido);
    if (visao === 'mes') return somarMeses(ref, sentido);
    return somarDias(ref, 30 * sentido);
  }

  // ---------------------------------------------------------------
  // Encontro
  // ---------------------------------------------------------------
  const GLIFO = Object.freeze({ sucesso: 'estadoSucesso', aviso: 'estadoAviso', erro: 'estadoErro', info: 'estadoInfo', neutro: 'estadoNeutro' });
  const estado = (rotulo, tom) => html`<span class="pf-estado pf-estado--${tom}">${UI.icone(GLIFO[tom])}${rotulo}</span>`;

  function marcador(e) {
    if (e.status === 'cancelada') return estado('Cancelado', 'neutro');
    if (e.presenca) return estado(`Presença registrada às ${hora(e.presenca.registradaEm)}`, 'sucesso');
    if (e.status === 'ao-vivo') return estado('Ao vivo agora', 'info');
    if (e.status === 'encerrada') return estado('Encerrado', 'neutro');
    return estado('Agendado', 'neutro');
  }

  function metaDe(e) {
    const partes = [];
    if (e.modulo) partes.push(`Módulo ${e.modulo.numero || ''}${e.modulo.titulo ? ` · ${e.modulo.titulo}` : ''}`.replace('Módulo  · ', 'Módulo · '));
    if (e.turma && e.turma.codigo) partes.push(`Turma ${e.turma.codigo}`);
    partes.push(e.cursoTitulo);
    return partes.join(' · ');
  }

  function acaoHtml(e) {
    if (e.status === 'cancelada') {
      return html`<p class="pf-ac-meta">${e.motivoCancelamento ? `Encontro cancelado: ${e.motivoCancelamento}` : 'Encontro cancelado.'}</p>`;
    }
    if (e.podeEntrar && e.url) {
      return html`<a class="dmc-btn dmc-btn--primary" href="${e.url}" target="_blank" rel="noopener" data-ac-entrar="${e.id}">Entrar na sala</a>
        <p class="pf-ac-meta">${e.presenca ? 'Sua presença já está registrada.' : 'Sua presença é registrada ao entrar.'}</p>
        <p class="pf-ac-status" role="status" data-ac-status="${e.id}"></p>`;
    }
    if (e.status === 'agendada' && e.abreEm) {
      const mesmoDia = diaSP(e.abreEm) === diaSP(new Date());
      return html`<p class="pf-ac-meta">${mesmoDia ? `A sala abre às ${hora(e.abreEm)}.` : `A sala abre em ${fDataCurta.format(new Date(e.abreEm))} às ${hora(e.abreEm)}.`}</p>`;
    }
    if (e.status === 'ao-vivo') {
      return html`<p class="pf-ac-meta">Entrada indisponível para a sua matrícula agora. Fale com a equipe pelo <a href="atendimentos.html?novo=1">Atendimento</a>.</p>`;
    }
    if (e.status === 'encerrada' && e.aulaGravada) {
      return html`<a class="dmc-btn dmc-btn--secondary" href="aula.html?id=${encodeURIComponent(e.aulaGravada.id)}">Assistir gravação</a>`;
    }
    return '';
  }

  function encontroHtml(e) {
    return html`<article class="pf-ac-encontro${e.status === 'cancelada' ? ' pf-ac-encontro--cancelado' : ''}" data-encontro="${e.id}">
      <p class="pf-ac-encontro__hora">${hora(e.inicioEm)}–${e.fimEm ? hora(e.fimEm) : ''}</p>
      <div>
        <h3 class="pf-ac-encontro__titulo">${e.titulo}</h3>
        <p class="pf-ac-meta">${metaDe(e)}</p>
        <p class="pf-ac-meta">${marcador(e)}</p>
      </div>
      <div class="pf-ac-encontro__acao">${acaoHtml(e)}</div>
    </article>`;
  }

  function porDia(itens) {
    const mapa = new Map();
    for (const e of itens) {
      const d = diaSP(e.inicioEm);
      if (!mapa.has(d)) mapa.set(d, []);
      mapa.get(d).push(e);
    }
    return mapa;
  }

  function vazio(titulo, texto) {
    return html`<div class="pf-vazio"><p class="pf-vazio__titulo">${titulo}</p>${texto ? html`<p class="pf-vazio__texto">${texto}</p>` : ''}</div>`;
  }

  // ---------------------------------------------------------------
  // Visões
  // ---------------------------------------------------------------
  function listaHtml(itens, semCursos) {
    if (!itens.length) {
      return semCursos
        ? vazio('Nenhum encontro ao vivo agendado para os seus cursos.', 'Quando a coordenação agendar um encontro, ele aparece aqui.')
        : vazio('Nenhum encontro neste período.', 'Use ‹ › para ver outros períodos.');
    }
    const grupos = porDia(itens);
    return html`${[...grupos.entries()].map(([dia, lista]) => html`<section class="pf-ac-dia" aria-label="${maiuscula(fDiaLongo.format(utcDe(dia)))}">
      <h3 class="pf-ac-dia__titulo">${maiuscula(fDiaLongo.format(utcDe(dia)))}</h3>
      ${lista.map(encontroHtml)}
    </section>`)}`;
  }

  function semanaHtml(itens, p, hoje) {
    const grupos = porDia(itens);
    const dias = Array.from({ length: 7 }, (_, i) => somarDias(p.de, i));
    return html`<div class="pf-ac-semana">${dias.map(d => html`<section class="pf-ac-semana__dia${d === hoje ? ' pf-ac-semana__dia--hoje' : ''}" aria-label="${maiuscula(fDiaLongo.format(utcDe(d)))}">
      <p class="pf-ac-semana__cabeca">${fSemanaCurta.format(utcDe(d)).replace('.', '')} ${String(Number(d.slice(8)))}</p>
      ${(grupos.get(d) || []).map(e => html`<button type="button" class="pf-ac-evento${e.status === 'cancelada' ? ' pf-ac-evento--cancelado' : ''}" data-ac-abrir="${e.id}">
        <span class="pf-ac-evento__hora">${hora(e.inicioEm)}–${e.fimEm ? hora(e.fimEm) : ''}</span>
        <span>${e.titulo}</span>
        ${e.modulo ? html`<span class="pf-ac-meta">Módulo ${e.modulo.numero || ''}</span>` : ''}
        ${e.turma && e.turma.codigo ? html`<span class="pf-ac-meta">${e.turma.codigo}</span>` : ''}
        ${e.presenca ? html`<span class="pf-ac-meta">Presença registrada</span>` : ''}
      </button>`)}
    </section>`)}</div>`;
  }

  function mesHtml(itens, p, ref, hoje, selecionado) {
    const grupos = porDia(itens);
    const total = Math.round((utcDe(p.ate) - utcDe(p.de)) / 864e5) + 1;
    const dias = Array.from({ length: total }, (_, i) => somarDias(p.de, i));
    const mesRef = ref.slice(0, 7);
    const nomes = Array.from({ length: 7 }, (_, i) => fSemanaCurta.format(utcDe(somarDias(p.de, i))).replace('.', ''));
    const foco = selecionado && dias.includes(selecionado) ? selecionado : (dias.includes(hoje) && hoje.slice(0, 7) === mesRef ? hoje : `${mesRef}-01`);
    return html`<div class="pf-ac-mes" role="group" aria-label="${maiuscula(fMesAno.format(utcDe(ref)))}">
      ${nomes.map(n => html`<div class="pf-ac-mes__nome" aria-hidden="true">${n}</div>`)}
      ${dias.map((d) => {
        const lista = grupos.get(d) || [];
        const nomeDia = maiuscula(fDiaLongo.format(utcDe(d)));
        const contagem = lista.length ? `${lista.length} ${lista.length === 1 ? 'encontro' : 'encontros'}` : 'sem encontros';
        return html`<button type="button" data-alvo-excecao="dia-do-mes" class="pf-ac-mes__dia${d.slice(0, 7) !== mesRef ? ' pf-ac-mes__dia--fora' : ''}${d === hoje ? ' pf-ac-mes__dia--hoje' : ''}" data-dia="${d}" aria-pressed="${d === selecionado ? 'true' : 'false'}" tabindex="${d === foco ? '0' : '-1'}">
          <span class="pf-ac-mes__numero" aria-hidden="true">${String(Number(d.slice(8)))}</span>
          <span class="dmc-sr-only">${nomeDia}, ${contagem}</span>
          ${lista.length ? html`<span class="pf-ac-mes__ponto" aria-hidden="true"></span>` : ''}
          ${lista.slice(0, 2).map(e => html`<span class="pf-ac-mes__item">${hora(e.inicioEm)} ${e.titulo}</span>`)}
          ${lista.length > 2 ? html`<span class="pf-ac-mes__item" aria-hidden="true">+${lista.length - 2}</span>` : ''}
        </button>`;
      })}
    </div>
    <section class="pf-ac-mes-dia" aria-live="polite">${selecionado ? html`<h3 class="pf-ac-dia__titulo">${maiuscula(fDiaLongo.format(utcDe(selecionado)))}</h3>${(grupos.get(selecionado) || []).length ? (grupos.get(selecionado) || []).map(encontroHtml) : html`<p class="pf-ajuda">Nenhum encontro neste dia.</p>`}` : html`<p class="pf-ajuda">Escolha um dia para ver os encontros.</p>`}</section>`;
  }

  // ---------------------------------------------------------------
  // Diálogo do encontro e convite .ics
  // ---------------------------------------------------------------
  let dialogo = null;
  function abrirDialogo(e) {
    if (!dialogo) {
      dialogo = document.createElement('dialog');
      dialogo.className = 'pf-ac-dialogo';
      dialogo.setAttribute('aria-labelledby', 'ac-dialogo-titulo');
      document.body.appendChild(dialogo);
      dialogo.addEventListener('click', (ev) => {
        if (ev.target === dialogo || ev.target.closest('[data-ac-fechar]')) dialogo.close();
        const ics = ev.target.closest('[data-ac-ics]');
        if (ics && dialogo._encontro) baixarIcs(dialogo._encontro);
      });
    }
    dialogo._encontro = e;
    dialogo.innerHTML = html`<div class="pf-ac-dialogo__corpo">
        <h2 class="pf-ac-dialogo__titulo" id="ac-dialogo-titulo">${e.titulo}</h2>
        <dl>
          <dt>Data e hora</dt><dd>${maiuscula(fDiaLongo.format(utcDe(diaSP(e.inicioEm))))}, ${hora(e.inicioEm)}–${e.fimEm ? hora(e.fimEm) : ''}</dd>
          <dt>Duração</dt><dd>${String(e.duracaoMin)} min</dd>
          <dt>Curso</dt><dd>${e.cursoTitulo}</dd>
          ${e.modulo ? html`<dt>Módulo</dt><dd>${e.modulo.numero ? `${e.modulo.numero} · ` : ''}${e.modulo.titulo}</dd>` : ''}
          <dt>Turma</dt><dd>${e.turma && e.turma.codigo ? e.turma.codigo : 'Todas as turmas do curso'}</dd>
          <dt>Plataforma</dt><dd>${e.plataforma}</dd>
          <dt>Situação</dt><dd>${marcador(e)}</dd>
          ${e.descricao ? html`<dt>Descrição</dt><dd>${e.descricao}</dd>` : ''}
        </dl>
        <div class="pf-ac-encontro__acao">${acaoHtml(e)}</div>
      </div>
      <div class="pf-ac-dialogo__acoes">
        ${e.status !== 'cancelada' ? html`<button type="button" class="dmc-btn dmc-btn--secondary" data-ac-ics="1">Baixar convite (.ics)</button>` : ''}
        <button type="button" class="dmc-btn dmc-btn--secondary" data-ac-fechar="1">Fechar</button>
      </div>`;
    if (typeof dialogo.showModal === 'function') dialogo.showModal(); else dialogo.setAttribute('open', '');
  }

  const icsData = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsTexto = s => String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, m => `\\${m}`).replace(/\r?\n/g, '\\n');
  function baixarIcs(e) {
    const linhas = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Complexo DMC//Plataforma//PT-BR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${e.id}@plataforma.complexodmc.com.br`, `DTSTAMP:${icsData(new Date().toISOString())}`,
      `DTSTART:${icsData(e.inicioEm)}`, `DTEND:${icsData(e.fimEm || e.inicioEm)}`,
      `SUMMARY:${icsTexto(e.titulo)}`, `DESCRIPTION:${icsTexto(`${metaDe(e)}. O link da sala aparece em Aulas ao vivo 15 minutos antes do início.`)}`,
      'END:VEVENT', 'END:VCALENDAR'
    ];
    const blob = new Blob([linhas.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `encontro-${e.id}.ics`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------------------------------------------------------------
  // Presença: clique em "Entrar na sala" (o link abre sozinho)
  // ---------------------------------------------------------------
  function registrarPresenca(link, estadoDaTela) {
    const id = link.getAttribute('data-ac-entrar');
    const saidas = document.querySelectorAll(`[data-ac-status="${CSS.escape(id)}"]`);
    const escrever = (conteudo, sucesso) => saidas.forEach((s) => { s.innerHTML = conteudo; s.classList.toggle('pf-ac-status--sucesso', !!sucesso); });
    const token = window.DMC_Api.token();
    const base = (window.DMC_API_BASE || '/api').replace(/\/$/, '');
    const url = base + API.entrar(id).slice(4);
    fetch(url, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: '{}' })
      .then(async (r) => {
        let corpo = null;
        try { corpo = await r.json(); } catch { corpo = null; }
        if (!r.ok) throw Object.assign(new Error((corpo && corpo.error) || `Erro ${r.status}`), { status: r.status, codigo: corpo && corpo.codigo });
        return corpo;
      })
      .then((corpo) => {
        if (corpo && corpo.presenca) {
          const item = estadoDaTela.itens.find(x => x.id === id);
          if (item) item.presenca = { registradaEm: corpo.presenca.registradaEm, origem: 'ao_vivo', codigo: corpo.presenca.codigo };
          escrever(html`Presença registrada às ${hora(corpo.presenca.registradaEm)}.`, true);
          anunciar(`Presença registrada às ${hora(corpo.presenca.registradaEm)}.`);
        } else if (corpo && corpo.semMatricula) {
          escrever(html`A sala foi aberta. A presença não foi registrada porque sua matrícula ainda está sendo registrada pela coordenação.`, false);
        } else {
          escrever(html`A sala foi aberta.`, false);
        }
      })
      .catch(() => {
        escrever(html`<span class="pf-alerta pf-alerta--aviso pf-alerta--compacto">Não conseguimos registrar sua presença. Avise o <a href="atendimentos.html?novo=1">atendimento</a>.</span>`, false);
      });
  }

  function anunciar(texto) {
    if (typeof UI.anunciar === 'function') { UI.anunciar(texto); return; }
    const el = document.getElementById('ac-anuncio');
    if (el) el.textContent = texto;
  }

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  async function boot(ctx) {
    const lista = document.getElementById('lives-lista');
    const barra = document.getElementById('ac-barra');
    const titulo = document.getElementById('ac-periodo-titulo');
    const filtro = document.getElementById('ac-filtro-curso');
    const hoje = diaSP(new Date());
    let visao = 'lista';
    try { const v = window.localStorage.getItem(CHAVE_VISAO); if (VISOES.indexOf(v) >= 0) visao = v; } catch { /* sem storage */ }
    const st = { visao, ref: hoje, cursoId: ctx.params.get('curso') || '', itens: [], selecionado: visao === 'mes' ? hoje : null, cursosCarregados: false, semCursos: false };
    // CLS (portal-qualidade): a barra já ocupa o lugar desde o HTML (data-ac-espera = invisível);
    // aqui ela aparece com o título do período, numa única troca de layout.
    barra.hidden = false;
    barra.removeAttribute('data-ac-espera');
    titulo.textContent = periodo(st.visao, st.ref).titulo;

    function marcarVisao() {
      for (const b of barra.querySelectorAll('[data-ac-visao]')) b.setAttribute('aria-pressed', String(b.getAttribute('data-ac-visao') === st.visao));
    }

    function desenhar() {
      const p = periodo(st.visao, st.ref);
      titulo.textContent = p.titulo;
      if (st.visao === 'semana') lista.innerHTML = html`${semanaHtml(st.itens, p, hoje)}${st.itens.length ? '' : html`<p class="pf-ajuda">Nenhum encontro nesta semana.</p>`}`;
      else if (st.visao === 'mes') lista.innerHTML = mesHtml(st.itens, p, st.ref, hoje, st.selecionado);
      else lista.innerHTML = listaHtml(st.itens, st.semCursos);
    }

    let pedido = 0;
    async function carregar() {
      const meu = ++pedido;
      const p = periodo(st.visao, st.ref);
      lista.setAttribute('aria-busy', 'true');
      const q = new URLSearchParams({ de: p.de, ate: p.ate });
      if (st.cursoId) q.set('cursoId', st.cursoId);
      try {
        const r = await window.DMC_Api.get(`${API.agenda}?${q.toString()}`);
        if (meu !== pedido || (ctx.sinal && ctx.sinal.aborted)) return;
        st.itens = Array.isArray(r && r.itens) ? r.itens : [];
        if (!st.cursosCarregados && Array.isArray(r && r.cursos)) {
          st.cursosCarregados = true;
          st.semCursos = r.cursos.length === 0;
          for (const c of r.cursos) {
            const o = document.createElement('option');
            o.value = c.id;
            o.textContent = c.titulo;
            filtro.appendChild(o);
          }
          if (st.cursoId) filtro.value = st.cursoId;
        }
        desenhar();
      } catch (err) {
        if (meu !== pedido) return;
        UI.erroCarga(lista, err, { tentarDeNovo: carregar });
      } finally {
        if (meu === pedido) lista.setAttribute('aria-busy', 'false');
      }
    }

    barra.addEventListener('click', (ev) => {
      const nav = ev.target.closest('[data-ac-periodo]');
      if (nav) {
        const s = Number(nav.getAttribute('data-ac-periodo'));
        st.ref = s === 0 ? hoje : deslocar(st.visao, st.ref, s);
        st.selecionado = st.visao === 'mes' && s === 0 ? hoje : null;
        carregar();
        return;
      }
      const v = ev.target.closest('[data-ac-visao]');
      if (v) {
        st.visao = v.getAttribute('data-ac-visao');
        st.selecionado = st.visao === 'mes' && st.ref.slice(0, 7) === hoje.slice(0, 7) ? hoje : null;
        try { window.localStorage.setItem(CHAVE_VISAO, st.visao); } catch { /* sem storage */ }
        marcarVisao();
        carregar();
      }
    });
    filtro.addEventListener('change', () => {
      st.cursoId = filtro.value;
      carregar();
    });

    lista.addEventListener('click', (ev) => {
      const entrar = ev.target.closest('[data-ac-entrar]');
      if (entrar) { registrarPresenca(entrar, st); return; }
      const abrir = ev.target.closest('[data-ac-abrir]');
      if (abrir) {
        const e = st.itens.find(x => x.id === abrir.getAttribute('data-ac-abrir'));
        if (e) abrirDialogo(e);
        return;
      }
      const dia = ev.target.closest('[data-dia]');
      if (dia) {
        st.selecionado = dia.getAttribute('data-dia');
        desenhar();
        const novo = lista.querySelector(`[data-dia="${st.selecionado}"]`);
        if (novo) novo.focus();
      }
    });
    document.addEventListener('click', (ev) => {
      const entrar = ev.target.closest('dialog [data-ac-entrar]');
      if (entrar) registrarPresenca(entrar, st);
    });

    // Mês por teclado: setas entre os dias (tabindex móvel), Enter/Espaço escolhe.
    lista.addEventListener('keydown', (ev) => {
      const dia = ev.target.closest && ev.target.closest('[data-dia]');
      if (!dia) return;
      const passos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (!(ev.key in passos)) return;
      ev.preventDefault();
      const alvo = somarDias(dia.getAttribute('data-dia'), passos[ev.key]);
      const el = lista.querySelector(`[data-dia="${alvo}"]`);
      if (el) {
        dia.tabIndex = -1;
        el.tabIndex = 0;
        el.focus();
      } else {
        st.ref = alvo;
        st.selecionado = alvo;
        carregar().then(() => { const n = lista.querySelector(`[data-dia="${alvo}"]`); if (n) n.focus(); });
      }
    });

    marcarVisao();
    await carregar();
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'ao-vivo' });
})();
