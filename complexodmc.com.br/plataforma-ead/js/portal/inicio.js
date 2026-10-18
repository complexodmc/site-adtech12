/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/inicio.js (F1b)
   Início — dashboard.html. Spec: PORTAL-UX.md §6.1; rotas da F1a
   (PORTAL-API.md §6.5) por DMC_Estudos; pendências da F0t
   (GET /portal/me/pendencias, ausente = bloco some); próxima aula
   ao vivo pelo legado GET /api/lives (presença fica em ao-vivo.html).
   Preserva #modules-list, [data-curso-id], [data-aula-id] (R4),
   #catalog-track e dmc:cursoEscolhido (D5).
   Ordem: ① herói ② para você agora ③ meus cursos ④ (destaques, F7)
   ⑤ trilha do curso ⑥ outros cursos.
   ============================================================= */
(function () {
  'use strict';

  const UI = window.DMC_UI;
  const H = UI.html;
  const enc = encodeURIComponent;
  const API = {
    pendencias: '/portal/me/pendencias',        // F0t
    academico: '/portal/me/academico',          // F3a (turma e carga do CardMatricula, D-35)
    agenda: '/portal/agenda',                   // F3a (próxima aula ao vivo)
    entrar: (id) => `/portal/encontros/${encodeURIComponent(id)}/entrar`,
    banners: '/portal/banners?local=inicio'     // F7 (destaques)
  };

  /** GET opcional: rota de fatia ainda não montada (404) ou indisponível → null, sem quebrar a tela. */
  async function opcional(caminho) {
    try { return await window.DMC_Api.get(caminho, { silencioso404: true }); }
    catch (err) {
      if (err && err.status === 401) throw err;
      return null;
    }
  }

  function ic(chave, reserva) {
    const a = UI.icone(chave);
    return String(a) ? a : UI.icone(reserva || '');
  }
  function anunciar(texto) {
    if (typeof UI.anunciar === 'function') { UI.anunciar(texto); return; }
    const r = document.querySelector('[data-inicio-anuncio]');
    if (r) { r.textContent = ''; setTimeout(() => { r.textContent = texto; }, 60); }
  }
  function avisarErro(texto) {
    if (typeof UI.toast === 'function') { UI.toast(texto, { tipo: 'erro' }); return; }
    const r = document.querySelector('[data-inicio-erro]');
    if (r) { r.hidden = false; r.textContent = texto; }
  }
  function barra(pct, rotulo) {
    const v = pct == null ? 0 : Math.max(0, Math.min(100, Math.round(pct)));
    return H`<span class="pf-est-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-label="${rotulo}"><span class="pf-est-barra__valor" style="${`width:${v}%`}"></span></span>`;
  }
  function fmtData(iso) {
    if (!iso) return '';
    if (UI.fmt && typeof UI.fmt.data === 'function') return UI.fmt.data(iso);
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
  }

  /** Situação do servidor; sem ela (F3a ainda não montada), a do progresso real. */
  function situacao(item) {
    if (item.situacao) return { chave: item.situacao, rotulo: item.situacaoRotulo || item.situacao };
    const p = item.progresso || {};
    if (p.aulasTotal && p.aulasConcluidas >= p.aulasTotal) return { chave: 'concluido', rotulo: 'Concluído' };
    if (p.aulasConcluidas > 0) return { chave: 'cursando', rotulo: 'Cursando' };
    if (!p.aulasTotal) return { chave: 'em-breve', rotulo: 'Em breve' };
    return { chave: 'nao-iniciado', rotulo: 'Não iniciado' };
  }
  const TOM = { concluido: 'sucesso', aprovado: 'sucesso', cursando: 'info', 'em-recuperacao': 'aviso', reprovado: 'erro' };
  function marcador(sit) {
    const tom = TOM[sit.chave] || 'neutro';
    const glifo = tom === 'sucesso' ? ic('estadoSucesso', 'check') : tom === 'info' ? H`<span aria-hidden="true">◐</span>` : tom === 'aviso' ? H`<span aria-hidden="true">▲</span>` : tom === 'erro' ? H`<span aria-hidden="true">◆</span>` : H`<span aria-hidden="true">○</span>`;
    return H`<span class="pf-estado pf-est-estado pf-est-estado--${tom}">${glifo} ${sit.rotulo}</span>`;
  }

  function capa(curso, { vertical = false } = {}) {
    const src = vertical ? (curso.capaVerticalUrl || curso.capaUrl) : curso.capaUrl;
    const url = src && typeof window.DMC_capaSrc === 'function' ? window.DMC_capaSrc({ capaUrl: src }) : src;
    if (url) return H`<img class="pf-est-capa-img" src="${url}" alt="" loading="lazy" decoding="async" width="${vertical ? 400 : 640}" height="${vertical ? 600 : 360}">`;
    return H`<span class="pf-est-capa-tipo" aria-hidden="true">${curso.titulo}</span>`;
  }

  function urlContinuar(item) {
    const c = item.continuar;
    if (c && c.moduloId && c.chave) return `aula.html?curso=${enc(item.curso.id)}&modulo=${enc(c.moduloId)}&item=${enc(c.chave)}`;
    return `aula.html?curso=${enc(item.curso.id)}`;
  }

  const S = { ctx: null, meus: null, academico: null, ativoId: null, trilha: null, abertos: new Set() };

  // ---------------------------------------------------------------
  // ① Herói
  // ---------------------------------------------------------------
  function desenharHeroi() {
    const alvo = document.getElementById('inicio-heroi');
    const item = S.meus.itens.find((i) => i.curso.id === S.ativoId);
    if (!item) {
      alvo.innerHTML = H`<div class="pf-vazio pf-est-vazio">
        <h1 class="pf-est-vazio__titulo" tabindex="-1">Você ainda não tem um curso liberado.</h1>
        <p>Quando sua matrícula for confirmada, o curso aparece aqui.</p>
        <div class="pf-est-vazio__acoes"><a class="dmc-btn dmc-btn--primary" href="loja.html">Ver cursos disponíveis</a>
        <a class="dmc-btn dmc-btn--secondary" href="atendimentos.html">Falar com o atendimento</a></div></div>`;
      return;
    }
    const sit = situacao(item);
    const p = item.progresso || {};
    const completo = p.aulasTotal && p.aulasConcluidas >= p.aulasTotal;
    const catalogo = window.DMC_Estudos.cursoDoCatalogo(item.curso.id);
    const card = S.academico ? (S.academico.atuais || []).find((c) => c.curso && c.curso.id === item.curso.id) : null;
    const turma = card && card.turma ? card.turma.codigo : null;
    const cargaHoras = card && Number.isFinite(card.cargaTotalHoras) ? card.cargaTotalHoras : null;
    const carga = cargaHoras != null ? `${String(cargaHoras).replace('.', ',')} h` : (catalogo && catalogo.cargaHoraria ? catalogo.cargaHoraria : null);
    const equipe = S.ctx.papel === 'professor' || S.ctx.papel === 'admin';
    const temCapa = !!item.curso.capaUrl;
    alvo.innerHTML = H`<section class="pf-heroi pf-est-heroi${temCapa ? '' : ' pf-est-heroi--sem-capa'}" aria-labelledby="inicio-heroi-titulo">
      ${temCapa ? H`<div class="pf-est-heroi__midia">${capa(item.curso)}</div>` : ''}
      <div class="pf-est-heroi__texto">
        <p class="pf-est-overline">Curso ativo</p>
        <h1 class="pf-est-heroi__titulo" id="inicio-heroi-titulo" tabindex="-1" data-curso-titulo>${item.curso.titulo}</h1>
        <p class="pf-est-heroi__meta">${marcador(sit)}
          ${item.matricula && item.matricula.inicioEm ? H`<span>Início em ${fmtData(item.matricula.inicioEm)}</span>` : ''}
          ${turma ? H`<span>Turma ${turma}</span>` : ''}
          ${carga ? H`<span>${carga}</span>` : ''}</p>
        <div class="pf-est-heroi__progresso">
          ${barra(p.pct, 'Progresso do curso')}
          <p>${p.pct == null ? 'Nenhuma aula publicada ainda.' : `${p.pct}% concluído · ${p.aulasConcluidas} de ${p.aulasTotal} aulas`}</p>
        </div>
        ${equipe ? H`<p class="pf-alerta pf-alerta--info pf-est-aviso">Você está vendo este curso como equipe. Seu progresso não entra em notas nem relatórios.</p>` : ''}
        <div class="pf-est-heroi__acoes">
          <a class="dmc-btn dmc-btn--primary" href="${urlContinuar(item)}">${completo ? 'Rever aulas' : 'Acessar aulas'}</a>
          <a class="dmc-btn dmc-btn--secondary" href="${`academico.html?curso=${enc(item.curso.id)}`}">Acadêmico</a>
          ${S.meus.itens.length > 1 ? H`<a class="pf-est-link" href="#inicio-meus-cursos">Trocar de curso</a>` : ''}
        </div>
      </div>
    </section>`;
  }

  // ---------------------------------------------------------------
  // ② Para você agora: pendências (F0t) e próxima aula ao vivo (legado)
  // ---------------------------------------------------------------
  /** Rota da F0t ausente ou indisponível (dados null): o bloco some (UX §10 item 7). */
  function desenharPendencias(dados) {
    const alvo = document.getElementById('inicio-pendencias');
    if (!dados || !Array.isArray(dados.avisos)) { alvo.hidden = true; return; }
    const ordem = { erro: 0, aviso: 1, info: 2 };
    const avisos = dados.avisos.slice().sort((a, b) => (ordem[a.tom] ?? 3) - (ordem[b.tom] ?? 3)).slice(0, 5);
    alvo.hidden = false;
    alvo.innerHTML = H`<h2>Pendências</h2>${avisos.length
      ? H`<ul class="pf-est-pendencias" role="list">${avisos.map((a) => H`<li><a href="${a.href || '#'}">
          <span class="pf-est-glifo pf-est-glifo--${a.tom === 'erro' ? 'aviso' : a.tom === 'aviso' ? 'aviso' : 'info'}" aria-hidden="true">${a.tom === 'erro' ? '◆' : a.tom === 'aviso' ? '▲' : '●'}</span>
          <span>${a.texto}</span><span class="pf-est-pendencias__acao">${a.rotulo || 'Ver'}</span></a></li>`)}</ul>`
      : H`<p class="pf-est-pendencias__nada">Nada pendente no momento.</p>`}`;
  }

  function blocoData(d) {
    const tz = { timeZone: 'America/Sao_Paulo' };
    return {
      semana: d.toLocaleDateString('pt-BR', { ...tz, weekday: 'short' }).replace('.', ''),
      dia: d.toLocaleDateString('pt-BR', { ...tz, day: '2-digit' }),
      mes: d.toLocaleDateString('pt-BR', { ...tz, month: 'short' }).replace('.', ''),
      extenso: d.toLocaleDateString('pt-BR', { ...tz, weekday: 'long', day: 'numeric', month: 'long' }),
      hora: (x) => x.toLocaleTimeString('pt-BR', { ...tz, hour: '2-digit', minute: '2-digit' })
    };
  }

  /** Convite .ics gerado no navegador (sem o link da sala: ele só vale na janela). */
  function baixarConvite(enc) {
    const z = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const limpar = (t) => String(t || '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');
    const ini = new Date(enc.inicioEm);
    const fim = new Date(ini.getTime() + (Number(enc.duracaoMin) || 60) * 60000);
    const texto = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Complexo DMC//Plataforma//PT-BR', 'BEGIN:VEVENT',
      `UID:${enc.id}@complexodmc.com.br`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(ini)}`, `DTEND:${z(fim)}`,
      `SUMMARY:${limpar(enc.titulo)}`, `DESCRIPTION:${limpar(`Aula ao vivo${enc.cursoTitulo ? ` · ${enc.cursoTitulo}` : ''}. A sala abre 15 minutos antes do início, na Plataforma Complexo DMC.`)}`,
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aula-ao-vivo.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function entrarNaSala(enc, botao) {
    // A aba nasce no gesto (sem bloqueio de pop-up); o endereço só chega depois da presença (DC-23).
    const aba = window.open('', '_blank');
    if (aba) aba.opener = null;
    botao.disabled = true;
    try {
      const r = await window.DMC_Api.post(API.entrar(enc.id), {});
      if (r && r.url && /^https:\/\//i.test(r.url)) {
        if (aba) aba.location.href = r.url; else window.location.href = r.url;
        anunciar('Presença registrada. A sala abriu em uma nova aba.');
      } else if (aba) aba.close();
    } catch (err) {
      if (aba) aba.close();
      if (err && err.status === 401) { window.location.replace('login.html'); return; }
      avisarErro(err && err.message ? err.message : 'Não foi possível entrar na sala agora.');
    } finally { botao.disabled = false; }
  }

  /** Agenda da F3a (visibilidade por matrícula e presença automática); sem ela, os encontros legados. */
  async function carregarAoVivo() {
    const agora = Date.now();
    const hoje = new Date(agora).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const ate = new Date(agora + 120 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const agenda = await opcional(`${API.agenda}?de=${hoje}&ate=${ate}`);
    if (agenda && Array.isArray(agenda.itens)) return { viaAgenda: true, itens: agenda.itens };
    if (!window.DMC_Lives) return null;
    try { return { viaAgenda: false, itens: await window.DMC_Lives.listar() }; }
    catch (err) { if (err && err.status === 401) throw err; return null; }
  }

  function desenharAoVivo(fonte) {
    const alvo = document.getElementById('inicio-ao-vivo');
    const meus = new Set(S.meus.itens.map((i) => i.curso.id));
    const agora = Date.now();
    const viaAgenda = !!(fonte && fonte.viaAgenda);
    let proximas = fonte ? fonte.itens.filter((e) => (e.status === 'agendada' || e.status === 'ao-vivo') && (viaAgenda || meus.has(e.cursoId))) : null;
    if (!proximas) { alvo.hidden = true; return; }
    proximas = proximas
      .filter((l) => new Date(l.inicioEm).getTime() + (Number(l.duracaoMin) || 0) * 60000 > agora)
      .sort((a, b) => new Date(a.inicioEm) - new Date(b.inicioEm));
    const l = proximas[0];
    alvo.hidden = false;
    if (!l) {
      alvo.innerHTML = H`<h2>Próxima aula ao vivo</h2><p class="pf-est-pendencias__nada">Nenhuma aula ao vivo agendada.</p>
        <a class="pf-est-link" href="ao-vivo.html">Ver calendário</a>`;
      return;
    }
    const d = new Date(l.inicioEm);
    const b = blocoData(d);
    const fim = new Date(d.getTime() + (Number(l.duracaoMin) || 0) * 60000);
    const aberta = viaAgenda ? l.podeEntrar === true : l.status === 'ao-vivo';
    const cursoTitulo = l.cursoTitulo || ((S.meus.itens.find((i) => i.curso.id === l.cursoId) || {}).curso || {}).titulo || '';
    alvo.innerHTML = H`<h2>Próxima aula ao vivo</h2>
      <div class="pf-est-ao-vivo">
        <p class="pf-est-ao-vivo__data" aria-hidden="true"><span class="pf-est-overline">${b.semana}</span><span class="pf-est-ao-vivo__dia">${b.dia}</span><span class="pf-est-overline">${b.mes}</span></p>
        <div class="pf-est-ao-vivo__corpo">
          <p class="pf-est-ao-vivo__titulo">${l.modulo ? `Módulo ${l.modulo.numero} · ` : ''}${l.titulo}</p>
          <p><span class="dmc-sr-only">${b.extenso}, </span>${b.hora(d)}–${b.hora(fim)}${l.turma ? ` · Turma ${l.turma.codigo}` : ''}${cursoTitulo ? ` · ${cursoTitulo}` : ''}</p>
          ${aberta
            ? (viaAgenda
              ? H`<button type="button" class="dmc-btn dmc-btn--primary" data-entrar-sala>Entrar na sala</button>`
              : H`<a class="dmc-btn dmc-btn--primary" href="ao-vivo.html">Entrar na sala</a>`)
            : H`<p>A sala abre 15 minutos antes do início.</p>
              <button type="button" class="pf-est-link pf-est-link--botao" data-baixar-convite>Baixar convite (.ics)</button>`}
        </div>
      </div>`;
    const conv = alvo.querySelector('[data-baixar-convite]');
    if (conv) conv.addEventListener('click', () => baixarConvite({ ...l, cursoTitulo }));
    const ent = alvo.querySelector('[data-entrar-sala]');
    if (ent) ent.addEventListener('click', () => { entrarNaSala(l, ent).catch(falha); });
  }

  // ---------------------------------------------------------------
  // ④ Destaques gerenciados (F7): até 2, dispensáveis, sem carrossel
  // ---------------------------------------------------------------
  const chaveDispensa = (id) => `dmc:banner:${id}:dispensado`;
  function dispensado(id) { try { return window.localStorage.getItem(chaveDispensa(id)) === '1'; } catch { return false; } }

  function desenharDestaques(dados) {
    const sec = document.getElementById('inicio-destaques');
    const itens = dados && Array.isArray(dados.itens) ? dados.itens.filter((b) => b && b.id && !dispensado(b.id)).slice(0, 2) : [];
    if (!itens.length) { sec.hidden = true; sec.replaceChildren(); return; }
    sec.hidden = false;
    sec.innerHTML = H`<h2 class="dmc-sr-only">Destaques</h2><ul class="pf-est-destaques" role="list">${itens.map((b) => H`<li class="pf-est-destaque" data-destaque="${b.id}">
      ${b.imagemUrl ? H`<span class="pf-est-destaque__img"><img src="${b.imagemUrl}" alt="" loading="lazy" decoding="async" width="960" height="360"></span>` : ''}
      <div class="pf-est-destaque__texto">
        <p class="pf-est-destaque__titulo">${b.titulo}</p>
        ${b.texto ? H`<p>${b.texto}</p>` : ''}
        ${b.link ? H`<a class="pf-est-link" href="${b.link}">Saiba mais<span class="dmc-sr-only">: ${b.titulo}</span></a>` : ''}
      </div>
      <button type="button" class="pf-est-destaque__fechar" data-dispensar="${b.id}" aria-label="${`Dispensar destaque: ${b.titulo}`}">×</button>
    </li>`)}</ul>`;
    sec.addEventListener('click', (e) => {
      const x = e.target.closest('[data-dispensar]');
      if (!x) return;
      try { window.localStorage.setItem(chaveDispensa(x.dataset.dispensar), '1'); } catch { /* sem storage */ }
      const li = x.closest('[data-destaque]');
      if (li) li.remove();
      if (!sec.querySelector('[data-destaque]')) sec.hidden = true;
      anunciar('Destaque dispensado.');
    });
  }

  // ---------------------------------------------------------------
  // ③ Meus cursos (capas verticais)
  // ---------------------------------------------------------------
  function desenharMeusCursos() {
    const sec = document.getElementById('inicio-meus-cursos');
    const lista = sec.querySelector('[data-inicio-capas]');
    if (!S.meus.itens.length) { sec.hidden = true; return; }
    sec.hidden = false;
    lista.innerHTML = H`${S.meus.itens.map((i) => {
      const p = i.progresso || {};
      const atual = i.curso.id === S.ativoId;
      return H`<li><a class="pf-est-capa" href="${`dashboard.html?curso=${enc(i.curso.id)}`}" data-curso-id="${i.curso.id}" aria-current="${atual ? 'true' : 'false'}">
        <span class="pf-capa pf-est-capa__figura">${capa(i.curso, { vertical: true })}</span>
        <span class="pf-est-capa__titulo">${i.curso.titulo}</span>
        ${marcador(situacao(i))}
        <span class="pf-est-capa__pct">${barra(p.pct, `Progresso de ${i.curso.titulo}`)}<span>${p.pct == null ? '—' : `${p.pct}%`}</span></span>
      </a></li>`;
    })}`;
  }

  // ---------------------------------------------------------------
  // ⑤ Trilha do curso (preservada: #modules-list, [data-aula-id])
  // ---------------------------------------------------------------
  function desenharTrilha() {
    const sec = document.getElementById('inicio-trilha');
    const lista = document.getElementById('modules-list');
    const t = S.trilha;
    if (!t) { sec.hidden = true; lista.replaceChildren(); return; }
    sec.hidden = false;
    const abrir = sec.querySelector('[data-trilha-player]');
    if (abrir) abrir.href = `aula.html?curso=${enc(t.curso.id)}`;
    const cat = window.DMC_Estudos.cursoDoCatalogo(t.curso.id);
    const P = window.DMC_Progress;
    const atualId = t.atual && t.atual.moduloId;
    lista.innerHTML = H`${t.modulos.map((m) => {
      const legado = cat ? (cat.modulos || []).find((x) => x.id === m.id) : null;
      const aulas = legado ? legado.aulas || [] : [];
      const p = m.progresso || {};
      const aberto = S.abertos.has(m.id);
      const sit = situacao({ situacao: m.situacao, situacaoRotulo: m.situacaoRotulo, progresso: p });
      const meta = [`${p.aulasConcluidas || 0} de ${p.aulasTotal || 0} aulas`, m.duracaoTexto || (legado && legado.duracao) || ''].filter(Boolean).join(' · ');
      return H`<li class="pf-est-trilha__modulo${m.id === atualId ? ' is-atual' : ''}" data-modulo-id="${m.id}">
        <button type="button" class="pf-est-trilha__cab" aria-expanded="${aberto ? 'true' : 'false'}" aria-controls="${`inicio-mod-${m.id}`}" data-toggle-modulo="${m.id}">
          <span class="pf-est-trilha__num" aria-hidden="true">${m.numero}</span>
          <span><span class="pf-est-trilha__titulo"><span class="dmc-sr-only">Módulo ${m.numero}: </span>${m.titulo}</span>
            ${legado && legado.resumo ? H`<span class="pf-est-trilha__resumo">${legado.resumo}</span>` : ''}</span>
          <span class="pf-est-trilha__meta"><span>${meta}</span>${marcador(sit)}<span class="pf-est-trilha__seta" aria-hidden="true">${ic('chevron', 'chevronDown')}</span></span>
        </button>
        <ul class="pf-est-trilha__aulas" id="${`inicio-mod-${m.id}`}" role="list"${aberto ? '' : H` hidden`}>
          ${aulas.map((a) => {
            const disponivel = a.disponivel !== false;
            const feita = !!(P && P.isDone(a.id));
            if (!disponivel) {
              return H`<li class="pf-est-aula is-embreve" data-aula-id="${a.id}" data-modulo-id="${m.id}">
                <span class="pf-est-aula__check">${ic('cadeado', 'lock')}</span>
                <span class="pf-est-aula__link">${a.titulo}<span class="dmc-sr-only"> (Em breve)</span></span>
                <span class="pf-est-aula__dur">Em breve</span></li>`;
            }
            return H`<li class="pf-est-aula${feita ? ' is-feita' : ''}" data-aula-id="${a.id}" data-modulo-id="${m.id}">
              <button type="button" class="pf-est-aula__check" data-toggle-aula="${a.id}" aria-label="${feita ? `Desmarcar conclusão de ${a.titulo}` : `Marcar ${a.titulo} como concluída`}">${feita ? ic('estadoSucesso', 'check') : H`<span class="pf-est-circulo" aria-hidden="true"></span>`}</button>
              <a class="pf-est-aula__link" href="${`aula.html?curso=${enc(t.curso.id)}&modulo=${enc(m.id)}&item=${enc(`aula:${a.id}`)}`}">${a.titulo}</a>
              <span class="pf-est-aula__dur">${a.duracao || ''}</span></li>`;
          })}
        </ul>
      </li>`;
    })}`;
  }

  async function alternarAula(botao) {
    const aulaId = botao.dataset.toggleAula;
    const P = window.DMC_Progress;
    const feita = !!(P && P.isDone(aulaId));
    botao.disabled = true;
    try {
      await window.DMC_Estudos.concluirAula(aulaId, !feita, { cursoId: S.ativoId });
      anunciar(feita ? 'Conclusão desmarcada.' : 'Aula concluída.');
      await recarregarCurso();
    } catch (err) {
      if (err && err.status === 401) { window.location.replace('login.html'); return; }
      avisarErro('Não foi possível salvar seu progresso. Tente de novo.');
      botao.disabled = false;
    }
    const novo = document.querySelector(`[data-toggle-aula="${CSS.escape(aulaId)}"]`);
    if (novo) novo.focus();
  }

  // ---------------------------------------------------------------
  // ⑥ Outros cursos (catálogo preservado em #catalog-track)
  // ---------------------------------------------------------------
  function desenharOutros() {
    const sec = document.getElementById('inicio-outros');
    const lista = document.getElementById('catalog-track');
    const outros = window.DMC_Estudos.outrosCursos();
    if (!outros.length) { sec.hidden = true; lista.replaceChildren(); return; }
    sec.hidden = false;
    const preco = (v) => (UI.fmt && typeof UI.fmt.reais === 'function' ? UI.fmt.reais(v) : (typeof window.DMC_formatPreco === 'function' ? window.DMC_formatPreco(v) : ''));
    lista.innerHTML = H`${outros.map((c) => H`<li class="pf-est-outro" data-curso-id="${c.id}">
      <span class="pf-capa pf-est-outro__capa">${capa(c)}</span>
      <h3>${c.titulo}</h3>
      <p>${[c.cargaHoraria, c.modalidade].filter(Boolean).join(' · ')}</p>
      ${Number(c.preco) > 0 ? H`<p>${preco(c.preco)}</p>` : ''}
      <a class="pf-est-link" href="${`loja.html?destacar=${enc(c.id)}`}">Conhecer o curso<span class="dmc-sr-only">: ${c.titulo}</span></a>
    </li>`)}`;
  }

  // ---------------------------------------------------------------
  // Curso ativo
  // ---------------------------------------------------------------
  async function carregarTrilha() {
    S.trilha = null;
    if (!S.ativoId) return;
    try { S.trilha = await window.DMC_Estudos.trilha(S.ativoId); }
    catch (err) {
      if (err && err.status === 401) throw err;
      S.trilha = null;
    }
  }

  async function recarregarCurso() {
    S.meus = await window.DMC_Estudos.meusCursos();
    await carregarTrilha();
    desenharHeroi();
    desenharMeusCursos();
    desenharTrilha();
  }

  async function escolherCurso(cursoId, { empilhar = true } = {}) {
    if (!S.meus.itens.some((i) => i.curso.id === cursoId)) return false;
    S.ativoId = cursoId;
    if (window.DMC_Data) window.DMC_Data.setCursoEscolhido(cursoId);
    S.abertos.clear();
    await carregarTrilha();
    if (S.trilha && S.trilha.atual && S.trilha.atual.moduloId) S.abertos.add(S.trilha.atual.moduloId);
    desenharHeroi();
    desenharMeusCursos();
    desenharTrilha();
    if (empilhar) { try { window.history.pushState({ curso: cursoId }, '', `dashboard.html?curso=${enc(cursoId)}`); } catch { /* sem history */ } }
    return true;
  }

  function ligarEventos() {
    document.getElementById('inicio-meus-cursos').addEventListener('click', (e) => {
      const a = e.target.closest('a[data-curso-id]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      escolherCurso(a.dataset.cursoId).then((ok) => {
        if (!ok) return;
        const h = document.getElementById('inicio-heroi-titulo');
        if (h) { h.focus(); h.scrollIntoView({ block: 'start' }); }
        const item = S.meus.itens.find((i) => i.curso.id === S.ativoId);
        if (item) anunciar(`Curso ativo: ${item.curso.titulo}`);
      }).catch(falha);
    });
    document.getElementById('modules-list').addEventListener('click', (e) => {
      const m = e.target.closest('[data-toggle-modulo]');
      if (m) {
        const id = m.dataset.toggleModulo;
        const aberto = m.getAttribute('aria-expanded') === 'true';
        if (aberto) S.abertos.delete(id); else S.abertos.add(id);
        m.setAttribute('aria-expanded', aberto ? 'false' : 'true');
        const painel = document.getElementById(m.getAttribute('aria-controls'));
        if (painel) painel.hidden = aberto;
        return;
      }
      const b = e.target.closest('[data-toggle-aula]');
      if (b) alternarAula(b).catch(falha);
    });
    window.addEventListener('popstate', () => {
      const id = new URLSearchParams(window.location.search).get('curso');
      if (id) escolherCurso(id, { empilhar: false }).catch(falha);
    });
  }

  function falha(err) {
    if (err && err.status === 401) { window.location.replace('login.html'); return; }
    console.error('[DMC]', err);
    avisarErro('Algo não saiu como esperado. Tente de novo.');
  }

  async function boot(ctx) {
    S.ctx = ctx;
    const main = document.getElementById('conteudo');
    main.setAttribute('aria-busy', 'true');
    // Tudo em paralelo e desenhado de uma vez: blocos que chegam depois empurrariam a página (CLS).
    const extras = Promise.all([opcional(API.pendencias), carregarAoVivo(), opcional(API.banners)]);
    extras.catch(() => {}); // a falha (401) é tratada no await abaixo
    try {
      const [meus, academico] = await Promise.all([window.DMC_Estudos.meusCursos(), opcional(API.academico)]);
      S.meus = meus;
      S.academico = academico && Array.isArray(academico.atuais) ? academico : null;
    } catch (err) {
      if (err && err.status === 401) throw err;
      const alvo = document.getElementById('inicio-heroi');
      UI.erroCarga(alvo, Object.assign(err || {}, { message: (err && err.status && err.message) || 'Não foi possível carregar seus cursos.' }), { tentarDeNovo: () => window.location.reload() });
      main.setAttribute('aria-busy', 'false');
      return;
    }
    const pedido = ctx.params.get('curso');
    let escolhido = null; // escolha explícita guardada (DMC_Data.getCursoEscolhidoId cai no 1º do catálogo)
    try { escolhido = window.localStorage.getItem('dmc:cursoEscolhido'); } catch { escolhido = null; }
    const ids = S.meus.itens.map((i) => i.curso.id);
    S.ativoId = (pedido && ids.includes(pedido) && pedido)
      || (escolhido && ids.includes(escolhido) && escolhido)
      || (S.meus.ativoId && ids.includes(S.meus.ativoId) && S.meus.ativoId)
      || ids[0] || null;
    if (S.ativoId && window.DMC_Data) window.DMC_Data.setCursoEscolhido(S.ativoId);
    await carregarTrilha();
    if (S.trilha && S.trilha.atual && S.trilha.atual.moduloId) S.abertos.add(S.trilha.atual.moduloId);

    const [pendencias, aoVivo, banners] = await extras;
    desenharHeroi();
    desenharPendencias(pendencias);
    desenharAoVivo(aoVivo);
    desenharMeusCursos();
    desenharDestaques(banners);
    desenharTrilha();
    desenharOutros();
    ligarEventos();
    main.setAttribute('aria-busy', 'false');
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'inicio', catalogo: true });
})();
