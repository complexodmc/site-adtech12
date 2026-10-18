/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/player.js (F1b)
   Player em modo foco — aula.html. Spec: PORTAL-UX.md §6.3 (player)
   e §6.4 (palco da avaliação, F2); PORTAL-API.md §6.5 (Conteudo,
   sequência, regras de contagem) e §8.4 (% assistido);
   PORTAL-ACADEMICO.md §6.2, §7.7, §7.9 (dmc:progresso), D-74 (P1f).

   URL: aula.html?curso=&modulo=&item=<tipo>:<id>  ·  legado ?id=<aulaId>
        ·  só ?curso=<id> abre o próximo conteúdo não concluído.
   Preserva #player-root, #player-stage, #btn-done, #player-duvidas e
   [data-duvida-form] (R5 e R6, SELETORES_D5) e cria #player-materiais.
   Seção 4 (avaliação): DMC_Avaliacao.montar quando o global existe;
   sem ele, a seção some sem erro. O player não calcula nota nem
   situação: ouve dmc:avaliacao e relê o Conteudo.
   ============================================================= */
(function () {
  'use strict';

  const UI = window.DMC_UI;
  const H = UI.html;
  const enc = encodeURIComponent;
  const MODULO_LARGO = '(min-width: 80em)'; // 1280: coluna fixa; abaixo, painel "Módulos"
  const ROTULOS_SECAO = { plano: 'Plano de ensino', materiais: 'Material de apoio', aulas: 'Aulas gravadas', avaliacoes: 'Avaliação' };
  const ROTULOS_CATEGORIA = { leitura: 'Leitura', slides: 'Slides', complementar: 'Complementar' };
  const PERGUNTA_MAX = 2000;
  const RESPOSTA_MAX = 8000;

  // ---------------------------------------------------------------
  // Utilidades de interface (degradam se o núcleo ainda não tem a peça)
  // ---------------------------------------------------------------
  function ic(chave, reserva) {
    const a = UI.icone(chave);
    return String(a) ? a : UI.icone(reserva || '');
  }

  let regiaoViva = null;
  function anunciar(texto, assertivo) {
    if (typeof UI.anunciar === 'function') { UI.anunciar(texto, { assertivo: !!assertivo }); return; }
    if (!regiaoViva) {
      regiaoViva = document.createElement('p');
      regiaoViva.className = 'dmc-sr-only';
      regiaoViva.setAttribute('role', 'status');
      regiaoViva.setAttribute('aria-live', 'polite');
      document.body.appendChild(regiaoViva);
    }
    regiaoViva.textContent = '';
    setTimeout(() => { regiaoViva.textContent = texto; }, 60);
  }

  function avisar(texto, tipo) {
    if (typeof UI.toast === 'function') { UI.toast(texto, { tipo: tipo || 'info' }); return; }
    const caixa = document.querySelector('[data-player-aviso]');
    if (!caixa) { anunciar(texto, tipo === 'erro'); return; }
    caixa.hidden = false;
    caixa.className = `pf-alerta pf-alerta--${tipo || 'info'} pf-est-aviso`;
    caixa.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    caixa.textContent = texto;
    clearTimeout(avisar.timer);
    if (tipo !== 'erro') avisar.timer = setTimeout(() => { caixa.hidden = true; }, 6000);
  }

  function ocupado(botao, sim, rotulo) {
    if (!botao) return;
    if (typeof UI.ocupado === 'function') { UI.ocupado(botao, sim, rotulo); return; }
    botao.disabled = !!sim;
    botao.setAttribute('aria-busy', sim ? 'true' : 'false');
  }

  function fmtHoras(n) {
    if (n == null || !Number.isFinite(Number(n))) return null;
    if (UI.fmt && typeof UI.fmt.horas === 'function') return UI.fmt.horas(n);
    const v = Math.round(Number(n) * 10) / 10;
    return `${String(v).replace('.', ',')} h`;
  }
  function fmtData(iso) {
    if (!iso) return '';
    if (UI.fmt && typeof UI.fmt.data === 'function') return UI.fmt.data(iso);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
  }
  function fmtBytes(n) {
    if (!n) return '';
    if (UI.fmt && typeof UI.fmt.bytes === 'function') return UI.fmt.bytes(n);
    return typeof window.DMC_formatBytes === 'function' ? window.DMC_formatBytes(n) : `${n} B`;
  }

  function barra(pct, rotulo) {
    const v = pct == null ? 0 : Math.max(0, Math.min(100, Math.round(pct)));
    return H`<span class="pf-est-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-label="${rotulo}"><span class="pf-est-barra__valor" style="${`width:${v}%`}"></span></span>`;
  }

  async function copiar(texto, botao) {
    try {
      await navigator.clipboard.writeText(texto);
      anunciar('Código copiado.');
      if (botao) { botao.dataset.copiado = '1'; setTimeout(() => { delete botao.dataset.copiado; }, 2000); }
    } catch {
      avisar('Não foi possível copiar. Selecione o código e copie manualmente.', 'aviso');
    }
  }

  // ---------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------
  const S = {
    ctx: null,
    cursoId: null,
    moduloId: null,
    chave: null,
    trilha: null,
    conteudos: new Map(),
    abertos: new Set(),
    video: null,
    avaliacao: null,
    el: {}
  };

  const ehEquipe = () => S.ctx && (S.ctx.papel === 'admin' || S.ctx.papel === 'professor');
  const temAvaliacao = () => !!(window.DMC_Avaliacao && typeof window.DMC_Avaliacao.montar === 'function');

  function urlDoItem(cursoId, moduloId, chave) {
    const q = new URLSearchParams({ curso: cursoId });
    if (moduloId) q.set('modulo', moduloId);
    if (chave) q.set('item', chave);
    return `aula.html?${q}`;
  }

  function tipoDe(chave) { return String(chave || '').split(':')[0]; }

  /** Item da chave dentro do Conteudo: { tipo, item }. */
  function itemDe(conteudo, chave) {
    if (!conteudo || !chave) return null;
    const s = conteudo.secoes || {};
    const tipo = tipoDe(chave);
    if (tipo === 'plano') return s.plano && s.plano.item && s.plano.item.chave === chave ? { tipo, item: s.plano.item } : null;
    const lista = tipo === 'material' ? (s.materiais && s.materiais.itens)
      : tipo === 'aula' ? (s.aulas && s.aulas.itens)
        : tipo === 'avaliacao' ? (s.avaliacoes && s.avaliacoes.itens) : null;
    const item = (lista || []).find((i) => i.chave === chave);
    return item ? { tipo, item } : null;
  }

  function feitoDe(tipo, item) {
    if (!item) return false;
    if (tipo === 'aula') return item.concluida === true;
    return item.feito === true;
  }

  /** Sequência navegável: a do servidor, sem aula indisponível e sem avaliação quando a F2 não está na página. */
  function sequenciaNavegavel(conteudo) {
    return (conteudo.sequencia || []).filter((ch) => {
      const t = tipoDe(ch);
      if (t === 'avaliacao' && !temAvaliacao()) return false;
      const r = itemDe(conteudo, ch);
      if (!r) return false;
      if (t === 'aula' && r.item.disponivel === false) return false;
      if (t === 'plano' && r.item.vazio) return false;
      return true;
    });
  }

  function primeiraPendente(conteudo) {
    const seq = sequenciaNavegavel(conteudo);
    return seq.find((ch) => { const r = itemDe(conteudo, ch); return r && !feitoDe(r.tipo, r.item); }) || seq[0] || null;
  }

  function moduloDaTrilha(id) {
    return S.trilha && (S.trilha.modulos || []).find((m) => m.id === id);
  }

  // ---------------------------------------------------------------
  // Carga
  // ---------------------------------------------------------------
  async function carregarConteudo(moduloId, forcar) {
    if (!forcar && S.conteudos.has(moduloId)) return S.conteudos.get(moduloId);
    const c = await window.DMC_Estudos.conteudo(moduloId);
    S.conteudos.set(moduloId, c);
    return c;
  }

  async function recarregarTudo() {
    try {
      const [trilha, conteudo] = await Promise.all([
        window.DMC_Estudos.trilha(S.cursoId),
        carregarConteudo(S.moduloId, true)
      ]);
      S.trilha = trilha;
      S.conteudos.set(S.moduloId, conteudo);
      desenharTopo();
      desenharColuna();
      desenharRodape();
      atualizarMarcador();
    } catch (err) {
      if (err && err.status === 401) throw err;
      console.error('[DMC]', err);
    }
  }

  // ---------------------------------------------------------------
  // Topo
  // ---------------------------------------------------------------
  function desenharTopo() {
    const t = S.trilha;
    const cursoLink = S.el.raiz.querySelector('[data-curso-titulo]');
    if (cursoLink && t) {
      cursoLink.textContent = t.curso.titulo;
      cursoLink.href = `dashboard.html?curso=${enc(t.curso.id)}`;
    }
    const alvo = S.el.raiz.querySelector('[data-player-progresso]');
    if (alvo && t) {
      const tot = t.modulos.reduce((acc, m) => {
        const p = m.progresso || {};
        acc.c += Number(p.aulasConcluidas) || 0; acc.t += Number(p.aulasTotal) || 0; return acc;
      }, { c: 0, t: 0 });
      const pct = tot.t ? Math.floor((tot.c / tot.t) * 100) : null; // regra única do servidor (API §6.5)
      alvo.innerHTML = H`${barra(pct, 'Progresso do curso')}<span class="pf-est-topo__pct">${pct == null ? '—' : `${pct}% do curso`}</span>`;
    }
  }

  // ---------------------------------------------------------------
  // Coluna de módulos
  // ---------------------------------------------------------------
  function glifoModulo(m) {
    const s = m.situacao;
    if (m.concluido || s === 'concluido' || s === 'aprovado') return H`<span class="pf-est-glifo pf-est-glifo--sucesso">${ic('estadoSucesso', 'check')}<span class="dmc-sr-only">${m.situacaoRotulo || 'Concluído'}</span></span>`;
    if (s === 'em-breve') return H`<span class="pf-est-glifo pf-est-glifo--neutro">${ic('cadeado', 'lock')}<span class="dmc-sr-only">Em breve</span></span>`;
    if (s === 'reprovado' || s === 'em-recuperacao') return H`<span class="pf-est-glifo pf-est-glifo--aviso" aria-hidden="true">▲</span><span class="dmc-sr-only">${m.situacaoRotulo}</span>`;
    if (s === 'cursando') return H`<span class="pf-est-glifo pf-est-glifo--info" aria-hidden="true">◐</span><span class="dmc-sr-only">${m.situacaoRotulo || 'Cursando'}</span>`;
    return H`<span class="pf-est-glifo pf-est-glifo--neutro" aria-hidden="true">○</span><span class="dmc-sr-only">${m.situacaoRotulo || 'Não iniciado'}</span>`;
  }

  /** "36 h · 4 de 9 aulas · 44%": % pela regra única do servidor (aulas disponíveis, API §6.5). */
  function metaModulo(m) {
    const p = m.progresso || {};
    const partes = [];
    const ch = fmtHoras(m.chHoras);
    if (ch) partes.push(ch); else if (m.duracaoTexto) partes.push(m.duracaoTexto);
    if (p.aulasTotal) partes.push(`${p.aulasConcluidas || 0} de ${p.aulasTotal} ${p.aulasTotal === 1 ? 'aula' : 'aulas'}`);
    const pct = p.pct != null ? p.pct : (p.aulasTotal ? Math.floor(((p.aulasConcluidas || 0) / p.aulasTotal) * 100) : null);
    if (pct != null) partes.push(`${pct}%`);
    return { texto: partes.join(' · '), pct };
  }

  function iconeDoItem(tipo, item) {
    if (tipo === 'plano') return ic('navAcademico', 'book');
    if (tipo === 'aula') return ic('video', 'play');
    if (tipo === 'avaliacao') return ic('estadoInfo', 'award');
    if (item.tipo === 'link') return ic('linkExterno', 'externalLink');
    if (item.categoria === 'slides') return ic('slides', 'file');
    return ic('pdf', 'file');
  }

  function tituloDoItem(tipo, item) {
    if (tipo === 'plano') return 'Plano de ensino';
    if (tipo === 'aula') return item.rotuloEncontro || item.titulo;
    if (tipo === 'avaliacao') return item.titulo || (item.tipo === 'previa' ? 'Atividade prévia' : 'Atividade modular');
    return item.nome;
  }

  function htmlItem(conteudo, tipo, item) {
    const atual = conteudo.modulo.id === S.moduloId && item.chave === S.chave;
    const feito = feitoDe(tipo, item);
    const titulo = tituloDoItem(tipo, item);
    if (tipo === 'aula' && item.disponivel === false) {
      return H`<li><span class="pf-est-item is-bloqueado">
        <span class="pf-est-item__icone">${ic('cadeado', 'lock')}</span>
        <span class="pf-est-item__titulo">${titulo}<span class="dmc-sr-only"> (Em breve)</span></span>
        <span class="pf-est-item__estado" aria-hidden="true">Em breve</span></span></li>`;
    }
    return H`<li><a class="pf-est-item${atual ? ' is-atual' : ''}${feito ? ' is-feito' : ''}" href="${urlDoItem(conteudo.curso.id, conteudo.modulo.id, item.chave)}" data-chave="${item.chave}" data-modulo="${conteudo.modulo.id}"${atual ? H` aria-current="page"` : ''}>
      <span class="pf-est-item__icone">${iconeDoItem(tipo, item)}</span>
      <span class="pf-est-item__titulo">${titulo}${tipo === 'aula' && item.rotuloEncontro && item.titulo !== item.rotuloEncontro ? H`<span class="pf-est-item__sub">${item.titulo}</span>` : ''}</span>
      <span class="pf-est-item__estado">${feito ? H`${ic('estadoSucesso', 'check')}<span class="dmc-sr-only">Concluído</span>` : ''}</span>
    </a></li>`;
  }

  function contador(secao) {
    if (!secao) return '';
    if (secao.feitos == null) return H`<span class="pf-est-secao__contador">${secao.total}</span>`;
    return H`<span class="pf-est-secao__contador"><span class="dmc-sr-only">Feitos: </span>${secao.feitos}/${secao.total}</span>`;
  }

  function htmlSecoes(conteudo) {
    const s = conteudo.secoes || {};
    const blocos = [];
    if (s.plano && s.plano.item && !s.plano.item.vazio) {
      blocos.push(H`<section class="pf-est-secao" aria-label="${ROTULOS_SECAO.plano}">
        <h2 class="pf-est-secao__titulo">${ROTULOS_SECAO.plano} ${contador(s.plano)}</h2>
        <ul class="pf-est-itens" role="list">${htmlItem(conteudo, 'plano', s.plano.item)}</ul></section>`);
    }
    if (s.materiais && (s.materiais.itens || []).length) {
      const grupos = ['leitura', 'slides', 'complementar'].map((cat) => {
        const itens = s.materiais.itens.filter((i) => (i.categoria || 'leitura') === cat);
        if (!itens.length) return '';
        return H`<p class="pf-est-secao__sub">${ROTULOS_CATEGORIA[cat]}</p><ul class="pf-est-itens" role="list">${itens.map((i) => htmlItem(conteudo, 'material', i))}</ul>`;
      });
      blocos.push(H`<section class="pf-est-secao" aria-label="${ROTULOS_SECAO.materiais}">
        <h2 class="pf-est-secao__titulo">${ROTULOS_SECAO.materiais} ${contador(s.materiais)}</h2>${grupos}</section>`);
    }
    if (s.aulas && (s.aulas.itens || []).length) {
      blocos.push(H`<section class="pf-est-secao" aria-label="${ROTULOS_SECAO.aulas}">
        <h2 class="pf-est-secao__titulo">${ROTULOS_SECAO.aulas} ${contador(s.aulas)}</h2>
        <ul class="pf-est-itens" role="list">${s.aulas.itens.map((i) => htmlItem(conteudo, 'aula', i))}</ul></section>`);
    }
    if (temAvaliacao() && s.avaliacoes && (s.avaliacoes.itens || []).length) {
      blocos.push(H`<section class="pf-est-secao" aria-label="${ROTULOS_SECAO.avaliacoes}">
        <h2 class="pf-est-secao__titulo">${ROTULOS_SECAO.avaliacoes} ${contador(s.avaliacoes)}</h2>
        <ul class="pf-est-itens" role="list">${s.avaliacoes.itens.map((i) => htmlItem(conteudo, 'avaliacao', i))}</ul></section>`);
    }
    if (!blocos.length) return H`<p class="pf-est-coluna__vazio">Nenhum conteúdo publicado neste módulo ainda.</p>`;
    return blocos;
  }

  function miniatura(m) {
    if (m.capaUrl) return H`<span class="pf-est-mini"><img src="${m.capaUrl}" alt="" width="56" height="56" loading="lazy"></span>`;
    return H`<span class="pf-est-mini pf-est-mini--numero" aria-hidden="true">${m.numero}</span>`;
  }

  function desenharColuna() {
    const lista = S.el.modulos.querySelector('[data-player-lista]');
    if (!lista || !S.trilha) return;
    const cab = S.el.modulos.querySelector('[data-player-qtd]');
    if (cab) cab.textContent = `Módulos (${S.trilha.modulos.length})`;
    lista.innerHTML = H`${S.trilha.modulos.map((m) => {
      const aberto = S.abertos.has(m.id);
      const meta = metaModulo(m);
      const conteudo = S.conteudos.get(m.id);
      return H`<li class="pf-est-modulo${m.id === S.moduloId ? ' is-atual' : ''}" data-modulo-id="${m.id}">
        <button type="button" class="pf-est-modulo__botao" aria-expanded="${aberto ? 'true' : 'false'}" aria-controls="${`pf-est-mod-${m.id}`}" data-alternar-modulo="${m.id}">
          ${miniatura(m)}
          <span class="pf-est-modulo__texto">
            <span class="pf-est-modulo__titulo"><span class="dmc-sr-only">Módulo ${m.numero}: </span>${m.titulo}</span>
            <span class="pf-est-modulo__meta">${meta.texto}</span>
            ${meta.pct != null ? barra(meta.pct, `Progresso do módulo ${m.numero}`) : ''}
          </span>
          <span class="pf-est-modulo__estado">${glifoModulo(m)}</span>
        </button>
        <div class="pf-est-modulo__corpo" id="${`pf-est-mod-${m.id}`}"${aberto ? '' : H` hidden`}>
          ${conteudo ? htmlSecoes(conteudo) : (aberto ? H`<p class="pf-est-coluna__vazio">Carregando…</p>` : '')}
        </div>
      </li>`;
    })}`;
  }

  async function alternarModulo(moduloId) {
    if (S.abertos.has(moduloId)) {
      S.abertos.delete(moduloId);
      desenharColuna();
      focarBotaoModulo(moduloId);
      return;
    }
    S.abertos.add(moduloId);
    desenharColuna();
    focarBotaoModulo(moduloId);
    if (!S.conteudos.has(moduloId)) {
      try { await carregarConteudo(moduloId); }
      catch (err) {
        if (err && err.status === 401) throw err;
        avisar('Não foi possível abrir este módulo agora.', 'erro');
        S.abertos.delete(moduloId);
      }
      desenharColuna();
      focarBotaoModulo(moduloId);
    }
  }

  function focarBotaoModulo(moduloId) {
    const b = S.el.modulos.querySelector(`[data-alternar-modulo="${CSS.escape(moduloId)}"]`);
    if (b) b.focus();
  }

  // Painel "Módulos" abaixo de 1280.
  function painelAberto() { return S.el.modulos.getAttribute('data-aberto') === 'true'; }
  // Com o painel aberto, o resto da página fica inerte (foco e leitor de tela só no painel).
  function inerte(sim) {
    S.el.raiz.querySelectorAll('.pf-est-topo, .pf-est-principal, .pf-est-rodape').forEach((n) => { n.inert = !!sim; });
  }
  function abrirPainel() {
    inerte(true);
    S.el.modulos.setAttribute('data-aberto', 'true');
    S.el.botaoModulos.setAttribute('aria-expanded', 'true');
    document.body.classList.add('pf-est-sem-rolagem');
    const fechar = S.el.modulos.querySelector('[data-fechar-modulos]');
    if (fechar) fechar.focus();
  }
  function fecharPainel(devolverFoco) {
    if (!painelAberto()) return;
    S.el.modulos.setAttribute('data-aberto', 'false');
    inerte(false);
    S.el.botaoModulos.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('pf-est-sem-rolagem');
    if (devolverFoco) S.el.botaoModulos.focus();
  }

  // ---------------------------------------------------------------
  // Palco
  // ---------------------------------------------------------------
  function destruirPalco() {
    if (S.video) { try { S.video.destruir(); } catch { /* já destruído */ } S.video = null; }
    if (S.avaliacao) { try { S.avaliacao.destruir(); } catch { /* já destruído */ } S.avaliacao = null; }
  }

  function overlineDe(conteudo, tipo) {
    const sec = tipo === 'plano' ? 'plano' : tipo === 'material' ? 'materiais' : tipo === 'aula' ? 'aulas' : 'avaliacoes';
    return `Módulo ${conteudo.modulo.numero} · ${ROTULOS_SECAO[sec]}`;
  }

  function marcadorEstado(tipo, item) {
    if (tipo === 'aula' && item.disponivel === false) return H`<span class="pf-estado pf-est-estado pf-est-estado--neutro">Em breve</span>`;
    if (tipo === 'avaliacao') return '';
    if (feitoDe(tipo, item)) return H`<span class="pf-estado pf-est-estado pf-est-estado--sucesso">${ic('estadoSucesso', 'check')} Concluído</span>`;
    if (item.feito === null && tipo !== 'aula') return '';
    return H`<span class="pf-estado pf-est-estado pf-est-estado--neutro">Não concluído</span>`;
  }

  function atualizarMarcador() {
    const conteudo = S.conteudos.get(S.moduloId);
    const r = itemDe(conteudo, S.chave);
    const alvo = S.el.raiz.querySelector('[data-player-estado]');
    if (alvo && r) alvo.innerHTML = H`${marcadorEstado(r.tipo, r.item)}`;
  }

  function desenharMeta(conteudo, tipo, item) {
    const meta = S.el.meta;
    const partes = [];
    if (tipo === 'aula') {
      if (item.codigo) {
        partes.push(H`<span class="pf-est-meta__codigo"><span class="dmc-sr-only">Código da aula: </span><code>${item.codigo}</code>
          <button type="button" class="pf-est-copiar" data-copiar="${item.codigo}">${ic('copiar', '')}<span>Copiar</span><span class="dmc-sr-only"> código da aula</span></button></span>`);
      }
      if (item.duracao) partes.push(H`<span>${item.duracao}</span>`);
      if (item.rotuloEncontro || item.encontro) {
        const data = item.encontro && item.encontro.inicioEm ? ` (${fmtData(item.encontro.inicioEm)})` : '';
        partes.push(H`<span>Encontro: ${item.rotuloEncontro || (item.encontro && item.encontro.titulo) || ''}${data}</span>`);
      }
    } else if (tipo === 'material') {
      partes.push(H`<span>${item.tipo === 'link' ? 'Link externo' : `${item.categoria === 'slides' ? 'Slides' : 'PDF'}${item.tamanho ? ` · ${fmtBytes(item.tamanho)}` : ''}`}</span>`);
      if (item.aulaTitulo) partes.push(H`<span>Da aula: ${item.aulaTitulo}</span>`);
    } else if (tipo === 'plano' && item.atualizadoEm) {
      partes.push(H`<span>Atualizado em ${fmtData(item.atualizadoEm)}</span>`);
    }
    meta.innerHTML = H`<p class="pf-est-overline" data-aula-modulo>${overlineDe(conteudo, tipo)}</p>
      <h1 class="pf-est-meta__titulo" id="player-titulo" tabindex="-1" data-aula-titulo>${tipo === 'aula' ? item.titulo : tituloDoItem(tipo, item)}</h1>
      <div class="pf-est-meta__linha">${partes}<span data-player-estado>${marcadorEstado(tipo, item)}</span></div>`;
  }

  function desenharPlano(alvo, plano, conteudo) {
    const seq = new Set(sequenciaNavegavel(conteudo));
    const bib = plano.bibliografia || {};
    const objetivos = plano.objetivos || [];
    const crono = plano.cronograma || [];
    alvo.innerHTML = H`<article class="pf-est-plano">
      ${plano.ementa ? H`<h2>Ementa</h2><p>${plano.ementa}</p>` : ''}
      ${objetivos.length ? H`<h2>Objetivos</h2><ul>${objetivos.map((o) => H`<li>${o}</li>`)}</ul>` : ''}
      ${(bib.basica || []).length || (bib.complementar || []).length ? H`<h2>Bibliografia</h2>
        ${(bib.basica || []).length ? H`<h3>Básica</h3><ul>${bib.basica.map((r) => H`<li>${r}</li>`)}</ul>` : ''}
        ${(bib.complementar || []).length ? H`<h3>Complementar</h3><ul>${bib.complementar.map((r) => H`<li>${r}</li>`)}</ul>` : ''}` : ''}
      ${crono.length ? H`<h2>Cronograma</h2><div class="pf-est-tabela-rolagem"><table class="pf-est-tabela"><caption class="dmc-sr-only">Cronograma do módulo</caption>
        <thead><tr><th scope="col">Encontro</th><th scope="col">Data</th><th scope="col">Tema</th></tr></thead>
        <tbody>${crono.map((l) => H`<tr><td>${l.encontro || '—'}</td><td>${l.data ? fmtData(l.data) : '—'}</td>
          <td>${l.aulaId && seq.has(`aula:${l.aulaId}`) ? H`<a href="${urlDoItem(conteudo.curso.id, conteudo.modulo.id, `aula:${l.aulaId}`)}" data-chave="${`aula:${l.aulaId}`}" data-modulo="${conteudo.modulo.id}">${l.tema}</a>` : l.tema}</td></tr>`)}</tbody></table></div>` : ''}
    </article>`;
  }

  function desenharMaterial(alvo, mat) {
    const ehLink = mat.tipo === 'link';
    alvo.innerHTML = H`<div class="pf-est-material">
      <span class="pf-est-material__icone">${ehLink ? ic('linkExterno', 'externalLink') : ic('pdf', 'file')}</span>
      <div class="pf-est-material__corpo">
        <p class="pf-est-material__nome">${mat.nome}</p>
        <p class="pf-est-material__tipo">${ehLink ? 'Abre em uma nova aba, fora da plataforma.' : `Arquivo PDF${mat.tamanho ? ` · ${fmtBytes(mat.tamanho)}` : ''}`}</p>
      </div>
      ${ehLink
        ? H`<a class="dmc-btn dmc-btn--secondary pf-est-material__acao" href="${mat.url}" target="_blank" rel="noopener noreferrer" data-material-link="${mat.chave}">Abrir link<span class="dmc-sr-only"> (nova aba)</span></a>`
        : H`<button type="button" class="dmc-btn dmc-btn--secondary pf-est-material__acao" data-baixar-material="${mat.chave}">${ic('baixar', 'download')} Abrir material</button>`}
    </div>`;
  }

  async function abrirMaterial(mat, botao) {
    ocupado(botao, true, 'Abrindo…');
    try {
      if (typeof UI.abrirArquivo === 'function') {
        await UI.abrirArquivo(mat.url, { nome: mat.nome });
      } else {
        // Download autenticado por header (nada de token na URL). Sem o
        // núcleo novo, o arquivo é sempre baixado (nunca aberto em blob:, D-47).
        const dados = await window.DMC_Api.blob(mat.url);
        const arquivo = new Blob([await dados.arrayBuffer()], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(arquivo);
        const a = document.createElement('a');
        a.href = url;
        a.download = /\.pdf$/i.test(mat.nome || '') ? mat.nome : `${mat.nome || 'material'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      // O download pelo servidor novo já registra a leitura; relê o módulo.
      if (window.DMC_Estudos.modo() === 'servidor') recarregarTudo();
    } catch (err) {
      if (err && err.status === 401) throw err;
      avisar(`Não foi possível abrir o material. ${err && err.message ? err.message : ''}`.trim(), 'erro');
    } finally {
      ocupado(botao, false);
    }
  }

  function desenharMateriaisDaAula(conteudo, aula) {
    const caixa = S.el.materiais;
    const mats = ((conteudo.secoes.materiais && conteudo.secoes.materiais.itens) || []).filter((m) => m.aulaId === aula.id);
    if (!mats.length) { caixa.hidden = true; caixa.replaceChildren(); return; }
    caixa.hidden = false;
    caixa.innerHTML = H`<h2 class="pf-est-bloco__titulo">Material de apoio desta aula</h2>
      <ul class="pf-est-materiais" role="list">${mats.map((m) => H`<li class="pf-est-materiais__item">
        <span class="pf-est-material__icone">${m.tipo === 'link' ? ic('linkExterno', 'externalLink') : ic('pdf', 'file')}</span>
        <span class="pf-est-materiais__nome">${m.nome}<span class="pf-est-materiais__tipo">${m.tipo === 'link' ? 'Link externo' : `PDF${m.tamanho ? ` · ${fmtBytes(m.tamanho)}` : ''}`}</span></span>
        ${m.tipo === 'link'
          ? H`<a class="pf-est-materiais__acao" href="${m.url}" target="_blank" rel="noopener noreferrer">Abrir<span class="dmc-sr-only"> ${m.nome} (nova aba)</span></a>`
          : H`<button type="button" class="pf-est-materiais__acao" data-baixar-material="${m.chave}">Baixar<span class="dmc-sr-only"> ${m.nome}</span></button>`}
      </li>`)}</ul>`;
  }

  function textoAssistido(aula, pctLocal) {
    if (!aula.video || !aula.video.medivel) return 'Conclua manualmente ao terminar.';
    if (window.DMC_Estudos.modo() !== 'servidor') {
      return pctLocal > 0 ? `Assistido ${Math.round(pctLocal)}% (medido pelo navegador). Conclua manualmente ao terminar.` : 'Conclua manualmente ao terminar.';
    }
    const pct = Math.max(Number(aula.pctVideo) || 0, pctLocal || 0);
    return `Assistido ${Math.round(pct)}% (medido pelo navegador) · conclui sozinha a partir de 90%`;
  }

  let falhasAssistido = 0;
  async function aoProgresso(conteudo, aula, pct, posicaoSeg, duracaoSeg, fonte) {
    const linha = S.el.assistido;
    if (S.chave !== aula.chave) return;
    if (linha) linha.textContent = textoAssistido(aula, pct);
    if (window.DMC_Estudos.modo() !== 'servidor' || falhasAssistido >= 3) return;
    try {
      const r = await window.DMC_Estudos.assistido(aula.id, { posicaoSeg, duracaoSeg, pct, fonte });
      falhasAssistido = 0;
      if (!r) return;
      aula.pctVideo = Math.max(Number(aula.pctVideo) || 0, Number(r.pctMax) || 0);
      if (r.concluida && !aula.concluida) {
        aula.concluida = true;
        aula.concluidaEm = r.concluidaEm || null;
        anunciar('Aula concluída automaticamente.');
        await recarregarTudo();
        desenharBotaoConcluir();
      }
      if (linha && S.chave === aula.chave) linha.textContent = textoAssistido(aula, pct);
    } catch (err) {
      if (err && err.status === 401) { window.location.replace('login.html'); return; }
      falhasAssistido += 1;
      if (falhasAssistido === 1) avisar('Não foi possível salvar seu progresso. Tentaremos de novo.', 'erro');
    }
  }

  function desenharPalco() {
    destruirPalco();
    const conteudo = S.conteudos.get(S.moduloId);
    const r = itemDe(conteudo, S.chave);
    const palco = S.el.palco;
    palco.className = 'pf-est-palco';
    palco.replaceChildren();
    S.el.assistido.hidden = true;
    S.el.materiais.hidden = true;
    S.el.duvidas.hidden = true;

    if (!r) {
      S.el.meta.innerHTML = H`<p class="pf-est-overline">Módulo ${conteudo.modulo.numero}</p><h1 class="pf-est-meta__titulo" id="player-titulo" tabindex="-1">${conteudo.modulo.titulo}</h1>`;
      palco.innerHTML = H`<div class="pf-vazio pf-est-vazio"><p class="pf-est-vazio__titulo">Nenhum conteúdo publicado neste módulo ainda.</p>
        <a class="dmc-btn dmc-btn--secondary" href="dashboard.html">Voltar ao início</a></div>`;
      return;
    }
    const { tipo, item } = r;
    desenharMeta(conteudo, tipo, item);

    if (tipo === 'aula') {
      if (item.disponivel === false) {
        const prox = primeiraPendente(conteudo);
        palco.innerHTML = H`<div class="pf-vazio pf-est-vazio"><span class="pf-est-vazio__icone">${ic('cadeado', 'lock')}</span>
          <p class="pf-est-vazio__titulo">Este conteúdo ainda não foi liberado.</p>
          ${prox ? H`<a class="dmc-btn dmc-btn--secondary" href="${urlDoItem(conteudo.curso.id, conteudo.modulo.id, prox)}" data-chave="${prox}" data-modulo="${conteudo.modulo.id}">Ir para o próximo disponível</a>` : H`<a class="dmc-btn dmc-btn--secondary" href="dashboard.html">Voltar ao início</a>`}</div>`;
        return;
      }
      palco.classList.add('pf-palco', 'pf-est-palco--video');
      S.video = window.DMC_Video.montar(palco, item.video, {
        titulo: item.titulo,
        codigo: item.codigo,
        aoProgresso: (pct, pos, dur, fonte) => aoProgresso(conteudo, item, pct, pos, dur, fonte)
      });
      S.el.assistido.hidden = false;
      S.el.assistido.textContent = textoAssistido(item, 0);
      desenharMateriaisDaAula(conteudo, item);
      desenharDuvidas(item);
      return;
    }
    if (tipo === 'plano') { desenharPlano(palco, item, conteudo); return; }
    if (tipo === 'material') { desenharMaterial(palco, item); return; }
    if (tipo === 'avaliacao' && temAvaliacao()) {
      palco.classList.add('pf-est-palco--avaliacao');
      Promise.resolve(window.DMC_Avaliacao.montar(palco, { avaliacaoId: item.id, cursoId: conteudo.curso.id, moduloId: conteudo.modulo.id, modo: 'aluno' }))
        .then((ctl) => { if (S.chave === item.chave) S.avaliacao = ctl; else if (ctl) ctl.destruir(); })
        .catch((err) => { console.error('[DMC]', err); UI.erroCarga(palco, err, { tentarDeNovo: () => desenharPalco() }); });
    }
  }

  // ---------------------------------------------------------------
  // Rodapé linear
  // ---------------------------------------------------------------
  function desenharBotaoConcluir() {
    const btn = S.el.concluir;
    const conteudo = S.conteudos.get(S.moduloId);
    const r = itemDe(conteudo, S.chave);
    const podeAula = r && r.tipo === 'aula' && r.item.disponivel !== false && r.item.concluida !== null; // equipe sem matrícula: null
    const podeFeito = r && (r.tipo === 'plano' || r.tipo === 'material') && r.item.feito === false && window.DMC_Estudos.modo() === 'servidor';
    if (!podeAula && !podeFeito) { btn.hidden = true; return; }
    btn.hidden = false;
    const feito = feitoDe(r.tipo, r.item);
    const rotulo = feito ? 'Desmarcar conclusão' : 'Marcar como concluído';
    btn.innerHTML = H`<span class="pf-est-rodape__icone">${feito ? ic('estadoSucesso', 'check') : H`<span class="pf-est-circulo" aria-hidden="true"></span>`}</span><span class="pf-est-rodape__rotulo">${rotulo}</span>`;
    btn.setAttribute('aria-label', rotulo);
    btn.classList.toggle('is-feito', feito);
  }

  function desenharRodape() {
    const conteudo = S.conteudos.get(S.moduloId);
    const seq = sequenciaNavegavel(conteudo);
    const i = seq.indexOf(S.chave);
    const N = seq.length;
    const pos = S.el.posicao;
    pos.textContent = i >= 0 ? `${i + 1} de ${N} · Módulo ${conteudo.modulo.numero}` : `Módulo ${conteudo.modulo.numero}`;

    const ant = S.el.anterior;
    const anteriorChave = i > 0 ? seq[i - 1] : null;
    ant.dataset.destino = anteriorChave || '';
    ant.disabled = !anteriorChave;

    const prox = S.el.proximo;
    const proxRotulo = prox.querySelector('[data-rotulo]');
    let rotulo = 'Próximo conteúdo';
    let acao = 'proximo';
    if (i >= 0 && i < N - 1) { acao = 'proximo'; prox.dataset.destino = seq[i + 1]; }
    else {
      prox.dataset.destino = '';
      const p = conteudo.progresso || {};
      const completo = p.itensTotal ? (p.itensFeitos || 0) >= p.itensTotal : seq.every((ch) => { const r = itemDe(conteudo, ch); return r && feitoDe(r.tipo, r.item); });
      if (!completo && N > 0) { rotulo = 'Concluir módulo'; acao = 'concluir-modulo'; }
      else if (conteudo.proximo && conteudo.proximo.moduloId) {
        const pm = moduloDaTrilha(conteudo.proximo.moduloId);
        rotulo = `Ir para o Módulo ${pm ? pm.numero : ''}`.trim();
        acao = 'proximo-modulo';
      } else { rotulo = 'Voltar ao início'; acao = 'inicio'; }
    }
    prox.dataset.acao = acao;
    if (proxRotulo) {
      // Abaixo de 30em o primário mostra o texto curto "Próximo" (UX §6.3, rodapé compacto).
      proxRotulo.innerHTML = acao === 'proximo'
        ? H`<span class="pf-est-rotulo-longo">${rotulo}</span><span class="pf-est-rotulo-curto">Próximo</span>`
        : H`${rotulo}`;
    }
    prox.setAttribute('aria-label', rotulo);
    desenharBotaoConcluir();
  }

  // ---------------------------------------------------------------
  // Navegação
  // ---------------------------------------------------------------
  async function irPara(moduloId, chave, { empilhar = true, focar = true } = {}) {
    if (moduloId !== S.moduloId) {
      try { await carregarConteudo(moduloId); }
      catch (err) {
        if (err && err.status === 401) throw err;
        avisar('Não foi possível abrir este módulo agora.', 'erro');
        return;
      }
      S.moduloId = moduloId;
    }
    const conteudo = S.conteudos.get(moduloId);
    S.chave = chave && itemDe(conteudo, chave) ? chave : primeiraPendente(conteudo);
    S.abertos.add(moduloId);
    if (empilhar) {
      const url = urlDoItem(S.cursoId, S.moduloId, S.chave);
      try { window.history.pushState({ moduloId: S.moduloId, chave: S.chave }, '', url); } catch { /* sem history */ }
    }
    const r = itemDe(conteudo, S.chave);
    document.title = `${r ? (r.tipo === 'aula' ? r.item.titulo : tituloDoItem(r.tipo, r.item)) : 'Aula'} · Plataforma Complexo DMC`;
    desenharColuna();
    desenharPalco();
    desenharRodape();
    if (focar) {
      const h = document.getElementById('player-titulo');
      if (h) h.focus({ preventScroll: false });
      const seq = sequenciaNavegavel(conteudo);
      const i = seq.indexOf(S.chave);
      if (i >= 0) anunciar(`${i + 1} de ${seq.length}: ${r ? tituloDoItem(r.tipo, r.item) : ''}`);
    }
  }

  /** Grava a conclusão (idempotente: o alvo é o valor final, não "inverter"). */
  async function gravarConclusao(r, alvo) {
    if (r.tipo === 'aula') {
      await window.DMC_Estudos.concluirAula(r.item.id, alvo, { cursoId: S.cursoId, moduloId: S.moduloId });
      r.item.concluida = alvo;
      return true;
    }
    const res = await window.DMC_Estudos.feito(r.item.chave, { cursoId: S.cursoId, moduloId: S.moduloId });
    if (res) r.item.feito = true;
    return !!res;
  }

  async function alternarConclusao() {
    const btn = S.el.concluir;
    const conteudo = S.conteudos.get(S.moduloId);
    const r = itemDe(conteudo, S.chave);
    if (!r) return;
    const alvo = r.tipo === 'aula' ? !r.item.concluida : true;
    ocupado(btn, true);
    try {
      const ok = await gravarConclusao(r, alvo);
      if (ok) anunciar(r.tipo === 'aula' ? (alvo ? 'Aula concluída.' : 'Conclusão desmarcada.') : 'Conteúdo concluído.');
      await recarregarTudo();
    } catch (err) {
      if (err && err.status === 401) { window.location.replace('login.html'); return; }
      avisar('Não foi possível salvar seu progresso. Tentaremos de novo.', 'erro');
      // Nova tentativa automática, uma vez, com o mesmo valor final.
      setTimeout(() => {
        gravarConclusao(r, alvo)
          .then((ok) => { if (ok) { anunciar('Progresso salvo.'); return recarregarTudo(); } return null; })
          .catch(() => avisar('Ainda não foi possível salvar seu progresso. Verifique sua conexão e tente de novo.', 'erro'))
          .finally(() => desenharBotaoConcluir());
      }, 5000);
    } finally {
      ocupado(btn, false);
      desenharBotaoConcluir();
      if (!btn.hidden) btn.focus();
    }
  }

  async function aoProximo() {
    const prox = S.el.proximo;
    const acao = prox.dataset.acao;
    const conteudo = S.conteudos.get(S.moduloId);
    if (acao === 'proximo' && prox.dataset.destino) { await irPara(S.moduloId, prox.dataset.destino); return; }
    if (acao === 'proximo-modulo' && conteudo.proximo && conteudo.proximo.moduloId) { await irPara(conteudo.proximo.moduloId, null); return; }
    if (acao === 'inicio') { window.location.href = `dashboard.html?curso=${enc(S.cursoId)}`; return; }
    if (acao === 'concluir-modulo') {
      const r = itemDe(conteudo, S.chave);
      const podeConcluir = r && ((r.tipo === 'aula' && r.item.disponivel !== false) || ((r.tipo === 'plano' || r.tipo === 'material') && r.item.feito === false && window.DMC_Estudos.modo() === 'servidor'));
      if (r && podeConcluir && !feitoDe(r.tipo, r.item)) await alternarConclusao();
      const atualizado = S.conteudos.get(S.moduloId);
      const pendente = sequenciaNavegavel(atualizado).find((ch) => { const x = itemDe(atualizado, ch); return x && !feitoDe(x.tipo, x.item) && x.item.feito !== null; });
      if (pendente && pendente !== S.chave) {
        anunciar('Ainda há conteúdos pendentes neste módulo.');
        await irPara(S.moduloId, pendente);
      } else {
        desenharRodape();
        S.el.proximo.focus();
      }
    }
  }

  // ---------------------------------------------------------------
  // Dúvidas da aula (#player-duvidas, [data-duvida-form]; R6)
  // ---------------------------------------------------------------
  let duvidasAula = null;
  async function desenharDuvidas(aula) {
    const caixa = S.el.duvidas;
    const D = window.DMC_Duvidas;
    if (!D) { caixa.hidden = true; return; }
    caixa.hidden = false;
    duvidasAula = aula.id;
    const ehAdmin = !!(S.ctx.user && S.ctx.user.isAdmin);
    const podeApagar = typeof UI.confirmar === 'function';
    caixa.innerHTML = H`<h2 class="pf-est-bloco__titulo">Dúvidas desta aula <span class="pf-est-secao__contador" data-duvidas-total>—</span></h2>
      <p class="pf-est-duvidas__nota">${ehAdmin ? 'Você responde como coordenação. As respostas ficam visíveis para quem tem acesso a este curso.' : 'Escreva sua dúvida sobre esta aula. A resposta da equipe fica visível para a turma.'}</p>
      <form class="pf-est-duvidas__form" data-duvida-form novalidate>
        <label class="pf-est-campo__rotulo" for="pf-est-duvida-texto">Sua dúvida</label>
        <textarea id="pf-est-duvida-texto" class="pf-est-campo" rows="3" maxlength="${PERGUNTA_MAX}" aria-describedby="pf-est-duvida-contagem" data-duvida-texto></textarea>
        <div class="pf-est-duvidas__rodape">
          <span id="pf-est-duvida-contagem" class="pf-est-duvidas__contagem" data-duvida-chars>0 / ${PERGUNTA_MAX}</span>
          <button type="submit" class="dmc-btn dmc-btn--primary">Enviar dúvida</button>
        </div>
        <p class="pf-est-duvidas__erro" data-duvida-erro role="alert" hidden></p>
      </form>
      <div class="pf-est-duvidas__lista" data-duvidas-lista aria-live="polite"><p class="pf-est-duvidas__vazio">Carregando dúvidas…</p></div>`;

    const form = caixa.querySelector('[data-duvida-form]');
    const campo = caixa.querySelector('[data-duvida-texto]');
    const chars = caixa.querySelector('[data-duvida-chars]');
    const erro = caixa.querySelector('[data-duvida-erro]');
    const lista = caixa.querySelector('[data-duvidas-lista]');
    const total = caixa.querySelector('[data-duvidas-total]');
    let itens = [];

    function pintar() {
      total.textContent = String(itens.length);
      if (!itens.length) { lista.innerHTML = H`<p class="pf-est-duvidas__vazio">Nenhuma dúvida nesta aula ainda.</p>`; return; }
      lista.innerHTML = H`${itens.map((d) => H`<article class="pf-est-duvida" data-duvida="${d.id}">
        <p class="pf-est-duvida__autor">${d.autorNome}${d.minha ? H` <span class="pf-est-duvida__voce">(você)</span>` : ''} · <span class="pf-est-duvida__quando">${window.DMC_formatarQuando ? window.DMC_formatarQuando(d.createdAt) : ''}</span>
          <span class="pf-estado pf-est-estado pf-est-estado--${d.respostas.length ? 'sucesso' : 'neutro'}">${d.respostas.length ? 'Respondida' : 'Aguardando resposta'}</span></p>
        <p class="pf-est-duvida__texto">${d.texto}</p>
        ${d.respostas.map((r) => H`<div class="pf-est-resposta"><p class="pf-est-duvida__autor">${r.autorNome} · equipe</p><p class="pf-est-duvida__texto">${r.texto}</p></div>`)}
        ${(podeApagar && (ehAdmin || d.minha)) ? H`<button type="button" class="pf-est-duvida__acao" data-apagar-duvida="${d.id}">Apagar dúvida</button>` : ''}
        ${ehAdmin ? H`<form class="pf-est-resposta-form" data-responder="${d.id}"><label class="dmc-sr-only" for="${`pf-est-resp-${d.id}`}">Responder</label>
          <textarea id="${`pf-est-resp-${d.id}`}" class="pf-est-campo" rows="2" maxlength="${RESPOSTA_MAX}"></textarea>
          <button type="submit" class="dmc-btn dmc-btn--secondary">Responder</button></form>` : ''}
      </article>`)}`;
    }

    campo.addEventListener('input', () => { chars.textContent = `${campo.value.length} / ${PERGUNTA_MAX}`; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = campo.value.trim();
      erro.hidden = true;
      if (texto.length < 3) { erro.textContent = 'Escreva sua dúvida (mínimo de 3 caracteres).'; erro.hidden = false; campo.focus(); return; }
      const btn = form.querySelector('[type="submit"]');
      ocupado(btn, true, 'Enviando…');
      try {
        const nova = await D.perguntar(aula.id, texto);
        itens.unshift(nova);
        campo.value = '';
        chars.textContent = `0 / ${PERGUNTA_MAX}`;
        pintar();
        anunciar('Dúvida enviada.');
      } catch (err) {
        erro.textContent = err && err.message ? err.message : 'Não foi possível enviar sua dúvida.';
        erro.hidden = false;
      } finally { ocupado(btn, false); }
    });
    lista.addEventListener('submit', async (e) => {
      const alvo = e.target.closest('[data-responder]');
      if (!alvo) return;
      e.preventDefault();
      const area = alvo.querySelector('textarea');
      const texto = area.value.trim();
      if (texto.length < 2) { area.focus(); return; }
      const btn = alvo.querySelector('[type="submit"]');
      ocupado(btn, true);
      try {
        const resp = await D.responder(alvo.dataset.responder, texto);
        const d = itens.find((x) => x.id === alvo.dataset.responder);
        if (d) d.respostas.push(resp);
        pintar();
      } catch (err) {
        avisar(err && err.message ? err.message : 'Não foi possível responder.', 'erro');
        ocupado(btn, false);
      }
    });
    lista.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-apagar-duvida]');
      if (!b) return;
      const ok = await UI.confirmar({ titulo: 'Apagar dúvida', texto: 'A dúvida e as respostas serão removidas.', rotuloConfirmar: 'Apagar', perigo: true });
      if (!ok) return;
      try {
        await D.apagar(b.dataset.apagarDuvida);
        itens = itens.filter((x) => x.id !== b.dataset.apagarDuvida);
        pintar();
        anunciar('Dúvida apagada.');
      } catch (err) { avisar(err && err.message ? err.message : 'Não foi possível apagar.', 'erro'); }
    });

    try {
      const lidas = await D.listar(aula.id);
      if (duvidasAula !== aula.id) return;
      itens = lidas;
      pintar();
    } catch (err) {
      if (err && err.status === 401) throw err;
      lista.innerHTML = H`<p class="pf-est-duvidas__vazio">Não foi possível carregar as dúvidas agora.</p>`;
    }
  }

  // ---------------------------------------------------------------
  // Aparência (tema e A−/A+ do shell; o modo foco não tem o topo global)
  // ---------------------------------------------------------------
  function ligarAparencia() {
    const botao = S.el.raiz.querySelector('[data-player-aparencia]');
    const painel = S.el.raiz.querySelector('#pf-est-aparencia');
    const sh = window.DMC_Shell;
    if (!botao || !painel) return;
    if (!sh || !sh.tema || !sh.fonte) { botao.hidden = true; return; }
    botao.hidden = false; // só aparece com o comportamento ligado
    const fechar = () => { painel.hidden = true; botao.setAttribute('aria-expanded', 'false'); };
    botao.addEventListener('click', () => {
      const abrir = painel.hidden;
      painel.hidden = !abrir;
      botao.setAttribute('aria-expanded', abrir ? 'true' : 'false');
      if (abrir) { const p = painel.querySelector('button'); if (p) p.focus(); }
    });
    painel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-aparencia]');
      if (!b) return;
      const a = b.dataset.aparencia;
      if (a === 'tema') sh.tema.alternar();
      if (a === 'menos') sh.fonte.diminuir();
      if (a === 'mais') sh.fonte.aumentar();
    });
    painel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fechar(); botao.focus(); } });
    document.addEventListener('click', (e) => { if (!painel.hidden && !painel.contains(e.target) && e.target !== botao && !botao.contains(e.target)) fechar(); });
  }

  // ---------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------
  function ligarEventos() {
    // Links de item (coluna, cronograma, "próximo disponível"): navegação no lugar, com histórico.
    S.el.raiz.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-chave]');
      if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
        e.preventDefault();
        if (painelAberto()) fecharPainel(false);
        irPara(a.dataset.modulo, a.dataset.chave).catch(falhaFatal);
        return;
      }
      const m = e.target.closest('[data-alternar-modulo]');
      if (m) { alternarModulo(m.dataset.alternarModulo).catch(falhaFatal); return; }
      const c = e.target.closest('[data-copiar]');
      if (c) { copiar(c.dataset.copiar, c); return; }
      const mat = e.target.closest('[data-baixar-material]');
      if (mat) {
        const conteudo = S.conteudos.get(S.moduloId);
        const r = itemDe(conteudo, mat.dataset.baixarMaterial);
        if (r) abrirMaterial(r.item, mat).catch(falhaFatal);
        return;
      }
      if (e.target.closest('[data-fechar-modulos]')) { fecharPainel(true); }
    });
    S.el.anterior.addEventListener('click', () => {
      if (S.el.anterior.dataset.destino) irPara(S.moduloId, S.el.anterior.dataset.destino).catch(falhaFatal);
    });
    S.el.proximo.addEventListener('click', () => { aoProximo().catch(falhaFatal); });
    S.el.concluir.addEventListener('click', () => { alternarConclusao().catch(falhaFatal); });
    S.el.botaoModulos.addEventListener('click', () => { if (painelAberto()) fecharPainel(true); else abrirPainel(); });
    S.el.botaoModulos.hidden = false; // só aparece com o comportamento ligado (o CSS o esconde a partir de 1280)
    S.el.modulos.addEventListener('keydown', (e) => { if (e.key === 'Escape' && painelAberto()) fecharPainel(true); });
    if (window.matchMedia) {
      const mq = window.matchMedia(MODULO_LARGO);
      const aoMudar = () => { if (mq.matches) fecharPainel(false); };
      if (mq.addEventListener) mq.addEventListener('change', aoMudar);
    }
    window.addEventListener('popstate', () => {
      const p = new URLSearchParams(window.location.search);
      const mod = p.get('modulo') || S.moduloId;
      irPara(mod, p.get('item'), { empilhar: false }).catch(falhaFatal);
    });
    document.addEventListener('dmc:avaliacao', () => { recarregarTudo(); });
  }

  function falhaFatal(err) {
    if (err && err.status === 401) { window.location.replace('login.html'); return; }
    console.error('[DMC]', err);
    avisar('Algo não saiu como esperado. Tente de novo.', 'erro');
  }

  // ---------------------------------------------------------------
  // Estados de página inteira
  // ---------------------------------------------------------------
  function paginaVazia(titulo, texto, acoes) {
    const raiz = S.el.raiz;
    raiz.classList.add('pf-est-player--vazio');
    raiz.innerHTML = H`<div class="pf-vazio pf-est-vazio pf-est-vazio--pagina">
      <h1 class="pf-est-vazio__titulo" tabindex="-1">${titulo}</h1>
      ${texto ? H`<p>${texto}</p>` : ''}
      <div class="pf-est-vazio__acoes">${acoes}</div></div>`;
  }

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  async function boot(ctx) {
    S.ctx = ctx;
    const raiz = document.getElementById('player-root');
    S.el = {
      raiz,
      modulos: document.getElementById('player-modulos'),
      botaoModulos: raiz.querySelector('[data-player-abrir-modulos]'),
      meta: raiz.querySelector('[data-player-meta]'),
      palco: document.getElementById('player-stage'),
      assistido: raiz.querySelector('[data-player-assistido]'),
      materiais: document.getElementById('player-materiais'),
      duvidas: document.getElementById('player-duvidas'),
      posicao: raiz.querySelector('[data-player-posicao]'),
      anterior: document.getElementById('btn-prev'),
      proximo: document.getElementById('btn-next'),
      concluir: document.getElementById('btn-done')
    };
    raiz.setAttribute('aria-busy', 'true');

    const p = ctx.params;
    const E = window.DMC_Estudos;
    let cursoId = p.get('curso');
    let moduloId = p.get('modulo');
    let chave = p.get('item');
    const aulaLegada = p.get('id');

    if (aulaLegada) {
      const loc = E.localizarAula(aulaLegada);
      if (!loc) {
        paginaVazia('Aula não encontrada.', 'O endereço pode estar incompleto ou a aula foi removida.', H`<a class="dmc-btn dmc-btn--primary" href="dashboard.html">Voltar ao início</a>`);
        return;
      }
      cursoId = loc.cursoId; moduloId = loc.moduloId; chave = `aula:${aulaLegada}`;
    }
    if (!cursoId) {
      const meus = await E.meusCursos();
      cursoId = meus.ativoId || (meus.itens[0] && meus.itens[0].curso.id) || null;
      if (!cursoId) {
        paginaVazia('Você ainda não tem um curso liberado.', 'Quando sua matrícula for confirmada, o curso aparece aqui.', H`<a class="dmc-btn dmc-btn--primary" href="loja.html">Ver cursos disponíveis</a>`);
        return;
      }
    }

    let trilha;
    try {
      trilha = await E.trilha(cursoId);
    } catch (err) {
      if (err && (err.status === 403 || err.codigo === 'sem-acesso')) {
        paginaVazia('Este curso não está liberado na sua conta.', null, H`<a class="dmc-btn dmc-btn--primary" href="${`loja.html?destacar=${enc(cursoId)}`}">Ver cursos disponíveis</a>`);
        return;
      }
      if (err && (err.status === 404 || err.codigo === 'nao-encontrado')) {
        paginaVazia('Curso não encontrado.', null, H`<a class="dmc-btn dmc-btn--primary" href="dashboard.html">Voltar ao início</a>`);
        return;
      }
      throw err;
    }
    S.trilha = trilha;
    S.cursoId = cursoId;
    if (window.DMC_Data && typeof window.DMC_Data.setCursoEscolhido === 'function') window.DMC_Data.setCursoEscolhido(cursoId);

    if (!moduloId) {
      moduloId = (trilha.atual && trilha.atual.moduloId) || (trilha.modulos[0] && trilha.modulos[0].id) || null;
      if (!chave && trilha.atual) chave = trilha.atual.chave || null;
    }
    if (!moduloId) {
      paginaVazia('Nenhum conteúdo publicado neste curso ainda.', null, H`<a class="dmc-btn dmc-btn--primary" href="dashboard.html">Voltar ao início</a>`);
      return;
    }

    if (ehEquipe()) {
      const aviso = raiz.querySelector('[data-player-equipe]');
      if (aviso) aviso.hidden = false;
    }

    ligarEventos();
    ligarAparencia();
    desenharTopo();
    await irPara(moduloId, chave, { empilhar: false, focar: false });
    try { window.history.replaceState({ moduloId: S.moduloId, chave: S.chave }, '', urlDoItem(S.cursoId, S.moduloId, S.chave)); } catch { /* sem history */ }
    raiz.setAttribute('aria-busy', 'false');
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'inicio', modo: 'foco', catalogo: true });
})();
