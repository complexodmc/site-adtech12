/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/avaliacao.js (F2)
   Spec: docs/dmc/PORTAL-ACADEMICO.md §7.7 (DMC_Avaliacao), §7.9
   (evento dmc:avaliacao); PORTAL-UX.md §6.4 (Avaliação dentro do
   player) e §7.6 (prévia do professor); PORTAL-API.md §6.6.1.

   CONTRATO
     DMC_Avaliacao.montar(el, { avaliacaoId, cursoId, moduloId,
                                modo = 'aluno' | 'previa' })
       → Promise<{ destruir(): void }>
   Estados: Apresentação → Em andamento → Revisão → Resultado →
   Gabarito (só depois de finalizar). O hospedeiro (player da F1b ou a
   rota #/avaliacoes/:id/previa do professor.html) NÃO calcula nota nem
   situação: ouve `dmc:avaliacao` { avaliacaoId, moduloId, tipo,
   situacao, feito, nota } em `document` e relê o que precisar.

   Regras desta tela: o tempo é do servidor (prazoEm + relógio `agora`
   da resposta); o gabarito só vem do servidor depois de finalizar;
   nenhuma nota é calculada aqui. HTML só por DMC_UI.html; sem alert,
   confirm, prompt, on*= ou script inline.
   ============================================================= */
(function () {
  'use strict';

  if (window.DMC_Avaliacao) return;

  const doc = document;
  const API = {
    avaliacao: (id) => `/portal/avaliacoes/${encodeURIComponent(id)}`,
    iniciar: (id) => `/portal/avaliacoes/${encodeURIComponent(id)}/tentativas`,
    finalizar: (id) => `/portal/avaliacoes/${encodeURIComponent(id)}/finalizar`,
    tentativa: (id) => `/portal/tentativas/${encodeURIComponent(id)}`,
    responder: (id) => `/portal/tentativas/${encodeURIComponent(id)}/respostas`,
    arquivo: (id, q) => `/portal/tentativas/${encodeURIComponent(id)}/respostas/${encodeURIComponent(q)}/arquivo`,
    enviar: (id) => `/portal/tentativas/${encodeURIComponent(id)}/enviar`,
    gabarito: (id) => `/portal/tentativas/${encodeURIComponent(id)}/gabarito`,
    previa: (id) => `/portal/professor/avaliacoes/${encodeURIComponent(id)}/previa`
  };
  const AUTOSAVE_MS = 10000;
  const DIGITACAO_MS = 1200;
  const TCC_MAX = 4 * 1024 * 1024;
  const ANUNCIOS_MIN = [10, 5, 1];
  const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];

  // ---------------------------------------------------------------
  // HTML seguro e ícones próprios (traço 1,5, currentColor)
  // ---------------------------------------------------------------
  function H(partes, ...valores) {
    const ui = window.DMC_UI;
    if (!ui || typeof ui.html !== 'function') throw new Error('DMC_UI ausente: carregue js/portal/ui.js antes de avaliacao.js.');
    return ui.html(partes, ...valores);
  }
  const cru = (s) => window.DMC_UI.cru(s);
  const SVG = {
    certo: '<svg class="pf-av-glifo" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="5 12.5 10 17.5 19 7"/></svg>',
    errado: '<svg class="pf-av-glifo" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    relogio: '<svg class="pf-av-glifo" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><polyline points="12 7.5 12 12 15 14"/></svg>',
    info: '<svg class="pf-av-glifo" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><line x1="12" y1="11" x2="12" y2="16.5"/><line x1="12" y1="7.6" x2="12" y2="7.7"/></svg>'
  };
  const ic = (k) => cru(SVG[k] || '');

  function nos(marcacao) {
    const t = doc.createElement('template');
    t.innerHTML = String(marcacao);
    return t.content;
  }

  // ---------------------------------------------------------------
  // API com erro rico ({ status, codigo, campos, dados }) — o mesmo
  // formato do DMC_Api ampliado (§7.1), sem depender da ordem de entrega.
  // ---------------------------------------------------------------
  function base() { return (window.DMC_API_BASE || '/api').replace(/\/$/, ''); }
  async function pedir(metodo, caminho, corpo, opcoes) {
    const o = opcoes || {};
    const cab = { Accept: 'application/json' };
    const token = window.DMC_Api && typeof window.DMC_Api.token === 'function' ? window.DMC_Api.token() : null;
    if (token) cab.Authorization = `Bearer ${token}`;
    const init = { method: metodo, headers: cab, signal: o.sinal };
    if (o.arquivo) {
      cab['Content-Type'] = o.tipo || 'application/pdf';
      init.body = o.arquivo;
    } else if (corpo !== undefined && metodo !== 'GET') {
      cab['Content-Type'] = 'application/json';
      init.body = JSON.stringify(corpo);
    }
    const res = await fetch(base() + caminho, init);
    if (res.status === 401 && window.DMC_Api && typeof window.DMC_Api.setToken === 'function') window.DMC_Api.setToken(null);
    let dados = null;
    if ((res.headers.get('content-type') || '').indexOf('application/json') >= 0) {
      try { dados = await res.json(); } catch (_e) { dados = null; }
    }
    if (res.ok) return dados;
    const err = new Error((dados && dados.error) || `Erro ${res.status} no servidor.`);
    err.status = res.status;
    if (dados && dados.codigo) err.codigo = dados.codigo;
    if (dados && dados.campos) err.campos = dados.campos;
    err.requestId = (dados && dados.requestId) || res.headers.get('x-request-id') || undefined;
    err.dados = dados;
    throw err;
  }
  const api = {
    get: (c, o) => pedir('GET', c, undefined, o),
    post: (c, corpo, o) => pedir('POST', c, corpo || {}, o),
    put: (c, corpo, o) => pedir('PUT', c, corpo || {}, o),
    enviarArquivo: (c, arquivo, o) => pedir('POST', c, undefined, Object.assign({}, o, { arquivo, tipo: 'application/pdf' }))
  };

  // ---------------------------------------------------------------
  // Formatação (pt-BR, America/Sao_Paulo)
  // ---------------------------------------------------------------
  const TZ = 'America/Sao_Paulo';
  const fmt = {
    nota(n) { return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'; },
    data(iso) { const d = new Date(iso); return iso && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR', { timeZone: TZ }) : '—'; },
    hora(iso) { const d = new Date(iso); return iso && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—'; },
    dataHora(iso) { return iso ? `${fmt.data(iso)} às ${fmt.hora(iso)}` : '—'; },
    duracao(ini, fim) {
      const ms = new Date(fim).getTime() - new Date(ini).getTime();
      if (!Number.isFinite(ms) || ms < 0) return '';
      const min = Math.max(1, Math.round(ms / 60000));
      if (min < 60) return `${min} min`;
      const h = Math.floor(min / 60);
      const r = min % 60;
      return r ? `${h} h ${r} min` : `${h} h`;
    },
    numero(n) { return Number.isFinite(n) ? n.toLocaleString('pt-BR') : '—'; },
    pontos(n) { return Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'; },
    bytes(n) {
      if (!Number.isFinite(n)) return '—';
      if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
      return `${(n / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
    },
    relogio(seg) {
      const s = Math.max(0, Math.floor(seg));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const ss = String(s % 60).padStart(2, '0');
      return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
    }
  };
  const tamanho = (s) => (typeof s === 'string' ? Array.from(s).length : 0);

  // ---------------------------------------------------------------
  // Retorno ao usuário: DMC_UI quando completo; senão reservas locais
  // ---------------------------------------------------------------
  function uiDe(nome) {
    const u = window.DMC_UI;
    if (u && typeof u[nome] === 'function') return u[nome].bind(u);
    const p = window.DMC_Professor && window.DMC_Professor.ui;
    if (p && typeof p[nome] === 'function') return p[nome];
    return null;
  }

  function anunciar(raiz, texto) {
    const f = uiDe('anunciar');
    if (f) { f(texto); return; }
    const viva = raiz.querySelector('[data-av-anuncio]');
    if (!viva) return;
    viva.textContent = '';
    window.setTimeout(() => { viva.textContent = String(texto || ''); }, 30);
  }

  function toast(texto, tipo) {
    const f = uiDe('toast');
    if (f) f(texto, { tipo: tipo || 'info' });
  }

  /** Confirmação acessível: DMC_UI.confirmar (S3) ou <dialog> próprio com foco inicial em Cancelar. */
  function confirmar({ titulo, texto, rotuloConfirmar, rotuloCancelar = 'Cancelar', perigo = false }) {
    const f = window.DMC_UI && typeof window.DMC_UI.confirmar === 'function' ? window.DMC_UI.confirmar : null;
    if (f) return Promise.resolve(f({ titulo, texto, rotuloConfirmar, rotuloCancelar, perigo })).then((v) => !!v);
    return new Promise((resolve) => {
      const dlg = doc.createElement('dialog');
      dlg.className = 'pf-av-dialogo';
      const id = `pf-av-dlg-${Math.random().toString(36).slice(2, 8)}`;
      dlg.setAttribute('aria-labelledby', id);
      dlg.appendChild(nos(H`<div class="pf-av-dialogo__caixa">
        <h2 class="pf-av-dialogo__titulo" id="${id}">${titulo}</h2>
        ${(Array.isArray(texto) ? texto : [texto]).filter(Boolean).map((t) => H`<p class="pf-av-dialogo__texto">${t}</p>`)}
        <div class="pf-av-dialogo__acoes">
          <button type="button" class="dmc-btn dmc-btn--secondary" data-pf-acao="cancelar">${rotuloCancelar}</button>
          <button type="button" class="${perigo ? 'dmc-btn pf-av-btn--perigo' : 'dmc-btn dmc-btn--primary'}" data-pf-acao="confirmar">${rotuloConfirmar}</button>
        </div>
      </div>`));
      let feito = false;
      const fechar = (v) => {
        if (feito) return;
        feito = true;
        try { dlg.close(); } catch (_e) { /* já fechado */ }
        dlg.remove();
        resolve(v);
      };
      dlg.querySelector('[data-pf-acao="cancelar"]').addEventListener('click', () => fechar(false));
      dlg.querySelector('[data-pf-acao="confirmar"]').addEventListener('click', () => fechar(true));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); fechar(false); });
      doc.body.appendChild(dlg);
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      dlg.querySelector('[data-pf-acao="cancelar"]').focus();
    });
  }

  function ocupado(botao, sim, rotulo) {
    const f = window.DMC_UI && typeof window.DMC_UI.ocupado === 'function' ? window.DMC_UI.ocupado : null;
    if (f) { f(botao, sim, rotulo); return; }
    if (!botao) return;
    if (sim) {
      if (!botao.dataset.avRotulo) botao.dataset.avRotulo = botao.textContent;
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      if (rotulo) botao.textContent = rotulo;
    } else {
      botao.disabled = false;
      botao.removeAttribute('aria-busy');
      if (botao.dataset.avRotulo) { botao.textContent = botao.dataset.avRotulo; delete botao.dataset.avRotulo; }
    }
  }

  /** Donut de % de acerto (SVG estático, sem biblioteca). */
  function htmlDonut(pct, rotulo) {
    const ok = Number.isFinite(pct);
    const v = ok ? Math.max(0, Math.min(100, pct)) : 0;
    const r = 52;
    const c = 2 * Math.PI * r;
    const traco = (c * v) / 100;
    const texto = ok ? `${Math.round(v)}%` : '—';
    return H`<figure class="pf-av-donut" role="img" aria-label="${ok ? `${rotulo}: ${texto}` : `${rotulo}: aguardando correção`}">
      <svg viewBox="0 0 120 120" width="160" height="160" aria-hidden="true" focusable="false">
        <circle class="pf-av-donut__trilha" cx="60" cy="60" r="${r}" fill="none" stroke-width="10"/>
        ${ok ? H`<circle class="pf-av-donut__valor" cx="60" cy="60" r="${r}" fill="none" stroke-width="10" stroke-dasharray="${`${traco.toFixed(2)} ${c.toFixed(2)}`}" transform="rotate(-90 60 60)"/>` : ''}
      </svg>
      <figcaption class="pf-av-donut__texto"><span class="pf-av-donut__valor-texto">${texto}</span><span class="pf-av-donut__rotulo">${ok ? 'de acerto' : 'em correção'}</span></figcaption>
    </figure>`;
  }

  const ROTULO_SITUACAO = { cursando: 'Cursando', aprovado: 'Aprovado', em_recuperacao: 'Em recuperação', reprovado: 'Reprovado', concluido: 'Concluído' };
  const TOM_SITUACAO = { aprovado: 'sucesso', em_recuperacao: 'aviso', reprovado: 'erro', cursando: 'neutro', concluido: 'sucesso' };
  const estadoHtml = (rotulo, tom) => H`<span class="${`pf-av-estado pf-av-estado--${tom || 'neutro'}`}"><span class="pf-av-estado__marca" aria-hidden="true"></span>${rotulo}</span>`;

  // =================================================================
  // Componente
  // =================================================================
  function montar(el, opcoes) {
    if (!el || !el.nodeType) return Promise.reject(new TypeError('DMC_Avaliacao.montar: informe o elemento.'));
    const o = opcoes || {};
    if (!o.avaliacaoId) return Promise.reject(new TypeError('DMC_Avaliacao.montar: informe avaliacaoId.'));
    const previa = o.modo === 'previa';
    const controlador = new AbortController();
    const S = {
      dados: null,        // GET avaliação (aluno) ou prévia
      tentativa: null,    // TentativaAluno aberta
      indice: 0,
      pendentes: new Map(), // questaoId → corpo ainda não salvo
      salvoEm: null,
      deslocamentoMs: 0,  // relógio do servidor − relógio local
      timers: [],
      anunciados: new Set(),
      enviando: false,
      destruido: false,
      resultado: null,
      erroTexto: new Map(),
      interagiu: false     // foco programático só depois do 1º gesto (não rouba o foco do hospedeiro na carga)
    };

    el.classList.add('pf-av');
    el.setAttribute('aria-busy', 'true');

    function limparTimers() {
      for (const t of S.timers) { window.clearInterval(t); window.clearTimeout(t); }
      S.timers = [];
    }
    function destruir() {
      S.destruido = true;
      limparTimers();
      controlador.abort();
      salvarPendentes({ silencioso: true }).catch(() => {});
      el.removeEventListener('click', aoClicar);
      el.removeEventListener('change', aoMudar);
      el.removeEventListener('input', aoDigitar);
      el.removeEventListener('keydown', aoTeclar);
    }

    function emitir(extra) {
      const d = S.dados || {};
      const est = d.estado || {};
      doc.dispatchEvent(new CustomEvent('dmc:avaliacao', {
        detail: Object.assign({
          avaliacaoId: o.avaliacaoId, moduloId: o.moduloId || (d.avaliacao && d.avaliacao.modulo && d.avaliacao.modulo.id) || null,
          tipo: d.avaliacao ? d.avaliacao.tipo : null, situacao: est.situacao || null, feito: (d.tentativas || []).length > 0,
          nota: Number.isFinite(est.melhorNota) ? est.melhorNota : null
        }, extra || {})
      }));
    }

    function desenhar(marcacao) {
      el.replaceChildren(nos(H`${marcacao}<p class="dmc-sr-only" role="status" aria-live="polite" data-av-anuncio></p>`));
      el.setAttribute('aria-busy', 'false');
    }

    function focar(seletor) {
      if (!S.interagiu) return;
      const alvo = el.querySelector(seletor);
      if (alvo) { if (!alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1'); try { alvo.focus({ preventScroll: false }); } catch (_e) { alvo.focus(); } }
    }

    function falha(err, tentarDeNovo) {
      if (S.destruido || (err && err.name === 'AbortError')) return;
      if (err && err.status === 401) { window.location.replace('login.html'); return; }
      const f = uiDe('erroCarga');
      if (f) f(el, err, { tentarDeNovo });
      else desenhar(H`<div class="pf-av-alerta pf-av-alerta--erro" role="alert"><p>${(err && err.message) || 'Não foi possível carregar a avaliação.'}</p></div>`);
    }

    // ---------------- cabeçalho e avisos ----------------
    function htmlCabecalho(av) {
      const mod = av.modulo || {};
      const noPlayer = !previa && !!el.closest('#player-root');
      const numero = mod.numero ? `MÓDULO ${String(mod.numero).padStart(2, '0')}` : 'MÓDULO';
      const minima = S.dados && S.dados.estado && Number.isFinite(S.dados.estado.notaMinima) ? S.dados.estado.notaMinima : (S.dados && Number.isFinite(S.dados.notaMinima) ? S.dados.notaMinima : null);
      const tipoTexto = av.tipo === 'modular'
        ? `Conta para a nota do módulo.${minima !== null ? ` Nota mínima: ${fmt.nota(minima)}.` : ''}`
        : 'Não conta para a nota.';
      return H`<header class="pf-av-cabecalho">
        ${noPlayer ? '' : H`<p class="pf-av-overline">${numero} · AVALIAÇÃO</p>`}
        <h2 class="pf-av-titulo" tabindex="-1" data-av-titulo>${av.tipo === 'modular' ? H`Atividade <em>modular</em>` : H`Atividade <em>prévia</em>`}</h2>
        ${noPlayer ? '' : H`<p class="pf-av-subtitulo">${av.titulo}</p>`}
        <p class="pf-av-tipo">${tipoTexto}</p>
      </header>`;
    }

    function htmlAvisos(avisos, instrucoes) {
      const a = avisos || {};
      return H`<section class="pf-av-avisos" aria-labelledby="pf-av-avisos-t">
        <h3 class="pf-av-avisos__titulo" id="pf-av-avisos-t">Avisos importantes</h3>
        <dl class="pf-av-avisos__lista">
          <div><dt>Tentativas</dt><dd>${a.tentativas || '—'}</dd></div>
          <div><dt>Tempo</dt><dd>${a.tempo || '—'}</dd></div>
          <div><dt>Questões</dt><dd>${a.questoes || '—'}</dd></div>
          ${a.correcao ? H`<div><dt>Correção</dt><dd>${a.correcao}</dd></div>` : ''}
          ${a.gabarito ? H`<div><dt>Gabarito</dt><dd>${a.gabarito}</dd></div>` : ''}
        </dl>
        ${instrucoes ? H`<div class="pf-av-instrucoes"><h4 class="pf-av-instrucoes__titulo">Instruções do professor</h4><p class="pf-av-texto-livre">${instrucoes}</p></div>` : ''}
      </section>`;
    }

    function motivoDeBloqueio(d) {
      const e = d.estado || {};
      switch (d.motivoBloqueio) {
        case 'sem-matricula': return 'Sua matrícula neste curso ainda não está registrada. Se você acabou de receber o acesso, aguarde a secretaria ou fale com o atendimento.';
        case 'matricula-nao-ativa': return 'Sua matrícula não está ativa neste curso. Para fazer avaliações, fale com a secretaria.';
        case 'nao-publicada': return 'Esta atividade ainda não foi publicada pelo professor.';
        default: break;
      }
      if (e.finalizada) return 'Você finalizou esta avaliação.';
      if (e.restantes === 0) return `Você usou ${e.permitidas === 1 ? 'a tentativa' : `as ${e.permitidas} tentativas`}.`;
      return '';
    }

    function htmlHistorico(tentativas) {
      const lista = (tentativas || []).filter((t) => t.status !== 'em_andamento');
      if (!lista.length) return '';
      return H`<section class="pf-av-historico" aria-labelledby="pf-av-hist-t">
        <h3 class="pf-av-secao" id="pf-av-hist-t">Histórico de tentativas</h3>
        <table class="pf-av-tabela">
          <caption class="dmc-sr-only">Tentativas enviadas nesta avaliação</caption>
          <thead><tr><th scope="col">Tentativa</th><th scope="col">Início</th><th scope="col">Fim</th><th scope="col">Acertos</th><th scope="col">Nota</th><th scope="col">Situação</th></tr></thead>
          <tbody>${lista.map((t) => H`<tr>
            <th scope="row">${t.numero}</th>
            <td data-rotulo="Início">${fmt.dataHora(t.iniciadaEm)}</td>
            <td data-rotulo="Fim">${fmt.dataHora(t.enviadaEm)}${t.expirada ? ' (tempo esgotado)' : ''}</td>
            <td data-rotulo="Acertos">${t.totalObjetivas ? `${t.acertosObjetivas} de ${t.totalObjetivas}` : '—'}</td>
            <td data-rotulo="Nota">${t.status === 'corrigida' ? fmt.nota(t.nota) : '—'}</td>
            <td data-rotulo="Situação">${t.status === 'corrigida' ? estadoHtml('Corrigida', 'neutro') : estadoHtml('Aguardando correção', 'info')}</td>
          </tr>`)}</tbody>
        </table>
      </section>`;
    }

    // ---------------- 1. Apresentação ----------------
    function desenharApresentacao() {
      limparTimers();
      const d = S.dados;
      const e = d.estado || {};
      const proximo = (e.usadas || 0) + 1;
      const bloqueio = previa ? '' : motivoDeBloqueio(d);
      const pode = previa || e.podeIniciar;
      desenhar(H`${previa ? htmlFaixaPrevia() : ''}
        <div class="pf-av-apresentacao">
          ${htmlCabecalho(d.avaliacao)}
          ${d.novaTentativaLiberada ? H`<div class="pf-av-alerta pf-av-alerta--info" role="status">${ic('info')}<p>Uma nova tentativa foi liberada para você.</p></div>` : ''}
          ${htmlAvisos(d.avisos, d.avaliacao.instrucoes)}
          <div class="pf-av-acoes">
            ${pode
              ? H`<button type="button" class="dmc-btn dmc-btn--primary pf-av-btn" data-av="iniciar">${previa ? 'Começar a prévia' : (d.aberta ? 'Continuar tentativa' : `Iniciar tentativa ${proximo} de ${e.permitidas}`)}</button>`
              : H`<button type="button" class="dmc-btn dmc-btn--primary pf-av-btn" disabled aria-describedby="pf-av-motivo">Iniciar tentativa</button>`}
            ${bloqueio ? H`<p class="pf-av-motivo" id="pf-av-motivo">${bloqueio}</p>` : ''}
          </div>
          ${previa ? '' : htmlHistorico(d.tentativas)}
        </div>`);
    }

    function htmlFaixaPrevia() {
      return H`<div class="pf-av-faixa-previa" role="note">
        <p class="pf-av-faixa-previa__texto"><strong>Pré-visualização</strong> — nada é registrado.</p>
        <div class="pf-av-faixa-previa__acoes">
          <button type="button" class="dmc-btn dmc-btn--secondary pf-av-btn" data-av="sortear">Sortear outra tentativa</button>
          <a class="dmc-btn dmc-btn--link pf-av-btn" href="${`#/avaliacoes/${encodeURIComponent(o.avaliacaoId)}`}">Sair</a>
        </div>
      </div>`;
    }

    async function iniciar(botao) {
      if (previa) {
        S.tentativa = { id: 'previa', numero: 1, prazoEm: null, agora: new Date().toISOString(), questoes: (S.dados.questoes || []).map((q) => Object.assign({}, q, { resposta: null })) };
        S.indice = 0;
        desenharQuestao();
        return;
      }
      const d = S.dados;
      if (d.avaliacao.tempoLimiteMin && !d.aberta) {
        const ok = await confirmar({
          titulo: 'Começar a tentativa?',
          texto: [`Você terá ${d.avaliacao.tempoLimiteMin} minutos.`, 'O cronômetro começa ao confirmar e não pausa se você sair da página.'],
          rotuloConfirmar: 'Começar agora'
        });
        if (!ok) return;
      }
      ocupado(botao, true, 'Preparando…');
      try {
        const t = await api.post(API.iniciar(o.avaliacaoId), {}, { sinal: controlador.signal });
        abrirTentativa(t);
      } catch (err) {
        ocupado(botao, false);
        if (err && err.status === 409) {
          await recarregar();
          toast(err.message, 'aviso');
          return;
        }
        falha(err, () => recarregar());
      }
    }

    // ---------------- 2. Em andamento ----------------
    function abrirTentativa(t) {
      S.tentativa = t;
      S.indice = 0;
      S.pendentes.clear();
      S.anunciados.clear();
      S.deslocamentoMs = t.agora ? new Date(t.agora).getTime() - Date.now() : 0;
      // Primeira questão em branco, para retomar onde parou.
      const i = (t.questoes || []).findIndex((q) => !q.resposta);
      S.indice = i >= 0 ? i : 0;
      desenharQuestao();
      iniciarRelogios();
    }

    function respondida(q) {
      if (S.pendentes.has(q.questaoId)) {
        const p = S.pendentes.get(q.questaoId);
        return q.tipo === 'objetiva' ? !!p.alternativaId : !!(p.texto && p.texto.trim());
      }
      const r = q.resposta;
      if (!r) return false;
      if (q.tipo === 'objetiva') return !!r.alternativaId;
      if (q.tipo === 'dissertativa') return !!(r.texto && r.texto.trim());
      return !!r.sha256;
    }

    function restanteSeg() {
      const t = S.tentativa;
      if (!t || !t.prazoEm) return null;
      return (new Date(t.prazoEm).getTime() - (Date.now() + S.deslocamentoMs)) / 1000;
    }

    function htmlCronometro() {
      const r = restanteSeg();
      if (r === null) return '';
      const tom = r < 60 ? 'erro' : r < 300 ? 'aviso' : 'neutro';
      return H`<p class="${`pf-av-cronometro pf-av-cronometro--${tom}`}" role="timer" aria-label="Tempo restante" data-av-cronometro>${ic('relogio')}<span class="pf-av-cronometro__valor" data-av-relogio>${fmt.relogio(r)}</span>${r < 300 ? H`<span class="pf-av-cronometro__nota">Restam ${Math.max(1, Math.ceil(r / 60))} min</span>` : ''}</p>`;
    }

    function htmlBarra() {
      const t = S.tentativa;
      const total = t.questoes.length;
      const feitas = t.questoes.filter(respondida).length;
      return H`<div class="pf-av-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${feitas}" aria-label="${`${feitas} de ${total} questões respondidas`}"><span class="pf-av-barra__preenchida" data-av-preenchida></span></div>`;
    }

    function htmlNavegador() {
      const t = S.tentativa;
      return H`<nav class="pf-av-navegador" aria-label="Questões" data-av-navegador hidden>
        <ol class="pf-av-navegador__lista">${t.questoes.map((q, i) => {
          const feita = respondida(q);
          const atual = i === S.indice;
          return H`<li><button type="button" class="${`pf-av-navegador__item${atual ? ' is-atual' : ''}${feita ? ' is-feita' : ''}`}" data-av="ir" data-indice="${i}" aria-current="${atual ? 'step' : 'false'}" aria-label="${`Questão ${i + 1}: ${feita ? 'respondida' : 'em branco'}${atual ? ', atual' : ''}`}">${i + 1}<span class="pf-av-navegador__estado" aria-hidden="true">${feita ? '●' : '○'}</span></button></li>`;
        })}</ol>
      </nav>`;
    }

    function htmlQuestao(q, i) {
      const r = S.pendentes.get(q.questaoId) || q.resposta || {};
      const enunciado = H`<p class="pf-av-enunciado">${q.enunciado}</p>`;
      if (q.tipo === 'objetiva') {
        return H`<fieldset class="pf-av-questao" data-questao="${q.questaoId}">
          <legend class="pf-av-questao__legenda"><span class="pf-av-questao__n">Questão ${i + 1}</span>${enunciado}</legend>
          <div class="pf-av-alternativas">${q.alternativas.map((a, k) => {
            const id = `pf-av-${q.questaoId}-${a.id}`;
            return H`<label class="pf-av-alternativa" for="${id}">
              <input type="radio" class="pf-av-alternativa__radio" id="${id}" name="${`q-${q.questaoId}`}" value="${a.id}" ${r.alternativaId === a.id ? cru('checked') : ''} data-av-alternativa="${q.questaoId}">
              <span class="pf-av-alternativa__letra" aria-hidden="true">${LETRAS[k] || ''}</span>
              <span class="pf-av-alternativa__texto">${a.texto}</span>
            </label>`;
          })}</div>
        </fieldset>`;
      }
      if (q.tipo === 'dissertativa') {
        const limite = q.limiteCaracteres || 10000;
        const valor = typeof r.texto === 'string' ? r.texto : '';
        const idT = `pf-av-txt-${q.questaoId}`;
        const erro = S.erroTexto.get(q.questaoId);
        return H`<div class="pf-av-questao" data-questao="${q.questaoId}">
          <p class="pf-av-questao__n">Questão ${i + 1} · dissertativa</p>
          <label class="pf-av-questao__rotulo" for="${idT}">${q.enunciado}</label>
          ${q.orientacao ? H`<p class="pf-av-orientacao" id="${`${idT}-or`}">${q.orientacao}</p>` : ''}
          <textarea class="pf-av-textarea" id="${idT}" rows="10" data-av-texto="${q.questaoId}" data-limite="${limite}" aria-describedby="${[q.orientacao ? `${idT}-or` : '', `${idT}-ct`, erro ? `${idT}-er` : ''].filter(Boolean).join(' ')}" ${erro ? cru('aria-invalid="true"') : ''}>${valor}</textarea>
          <p class="pf-av-contador" id="${`${idT}-ct`}" data-av-contador="${q.questaoId}">${fmt.numero(tamanho(valor))} de ${fmt.numero(limite)} caracteres · Resposta salva automaticamente</p>
          ${erro ? H`<p class="pf-av-erro-campo" id="${`${idT}-er`}" role="alert">${erro}</p>` : ''}
        </div>`;
      }
      const arq = q.resposta && q.resposta.sha256 ? q.resposta : null;
      const idF = `pf-av-arq-${q.questaoId}`;
      return H`<div class="pf-av-questao" data-questao="${q.questaoId}">
        <p class="pf-av-questao__n">Questão ${i + 1} · entrega de arquivo</p>
        <p class="pf-av-questao__rotulo" id="${`${idF}-en`}">${q.enunciado}</p>
        ${q.orientacao ? H`<p class="pf-av-orientacao">${q.orientacao}</p>` : ''}
        <div class="pf-av-upload">
          <label class="dmc-btn dmc-btn--secondary pf-av-btn pf-av-upload__botao" for="${idF}">${arq ? 'Substituir PDF' : 'Enviar PDF'}</label>
          <input type="file" class="dmc-sr-only pf-av-upload__input" id="${idF}" accept="application/pdf,.pdf" data-av-arquivo="${q.questaoId}" aria-describedby="${`${idF}-en ${idF}-st`}">
          <p class="pf-av-upload__estado" id="${`${idF}-st`}" role="status" data-av-arquivo-estado="${q.questaoId}">${arq ? `PDF enviado · ${fmt.bytes(arq.tamanho)} · às ${fmt.hora(arq.em)}` : 'PDF de até 4 MB.'}</p>
        </div>
      </div>`;
    }

    function desenharQuestao(opcoes) {
      const t = S.tentativa;
      const q = t.questoes[S.indice];
      const total = t.questoes.length;
      const ultimo = S.indice === total - 1;
      desenhar(H`${previa ? htmlFaixaPrevia() : ''}
        <div class="pf-av-andamento">
          <div class="pf-av-topo">
            <p class="pf-av-topo__posicao" data-av-posicao tabindex="-1">Questão ${S.indice + 1} de ${total}</p>
            ${htmlCronometro()}
          </div>
          ${htmlBarra()}
          <p class="pf-av-salvo" role="status" data-av-salvo>${S.salvoEm ? `Salvo às ${fmt.hora(S.salvoEm)}` : ''}</p>
          ${htmlQuestao(q, S.indice)}
          ${htmlNavegador()}
          <div class="pf-av-rodape">
            <button type="button" class="dmc-btn dmc-btn--secondary pf-av-btn" data-av="anterior" ${S.indice === 0 ? cru('disabled') : ''}>‹ Anterior</button>
            <button type="button" class="dmc-btn dmc-btn--link pf-av-btn" data-av="questoes" aria-expanded="false">Questões</button>
            ${ultimo
              ? H`<button type="button" class="dmc-btn dmc-btn--primary pf-av-btn" data-av="revisar">Revisar e enviar</button>`
              : H`<button type="button" class="dmc-btn dmc-btn--primary pf-av-btn" data-av="proxima">Próxima ›</button>`}
          </div>
        </div>`);
      const barra = el.querySelector('[data-av-preenchida]');
      if (barra) barra.style.transform = `scaleX(${total ? t.questoes.filter(respondida).length / total : 0})`;
      if (!opcoes || opcoes.focar !== false) focar('[data-av-posicao]');
    }

    function marcarSalvo(iso) {
      S.salvoEm = iso || new Date().toISOString();
      const s = el.querySelector('[data-av-salvo]');
      if (s) s.textContent = `Salvo às ${fmt.hora(S.salvoEm)}`;
    }

    function atualizarBarra() {
      const t = S.tentativa;
      if (!t) return;
      const total = t.questoes.length;
      const feitas = t.questoes.filter(respondida).length;
      const b = el.querySelector('.pf-av-barra');
      if (b) { b.setAttribute('aria-valuenow', String(feitas)); b.setAttribute('aria-label', `${feitas} de ${total} questões respondidas`); }
      const p = el.querySelector('[data-av-preenchida]');
      if (p) p.style.transform = `scaleX(${total ? feitas / total : 0})`;
    }

    function aplicarLocal(questaoId, corpo) {
      const q = S.tentativa.questoes.find((x) => x.questaoId === questaoId);
      if (q) q.resposta = Object.assign({}, q.resposta || {}, corpo);
    }

    async function salvar(questaoId, corpo, { silencioso = false } = {}) {
      if (previa) { aplicarLocal(questaoId, corpo); S.pendentes.delete(questaoId); return; }
      try {
        const r = await api.put(API.responder(S.tentativa.id), Object.assign({ questaoId }, corpo), { sinal: silencioso ? undefined : controlador.signal });
        aplicarLocal(questaoId, corpo);
        const p = S.pendentes.get(questaoId);
        if (p && JSON.stringify(p) === JSON.stringify(corpo)) S.pendentes.delete(questaoId);
        S.erroTexto.delete(questaoId);
        if (!S.destruido) marcarSalvo(r && r.salvoEm);
      } catch (err) {
        if (S.destruido || (err && err.name === 'AbortError')) return;
        if (err && err.codigo === 'tempo-esgotado') { await tempoEsgotado(); return; }
        if (err && err.codigo === 'resposta-longa') {
          S.erroTexto.set(questaoId, (err.campos && err.campos.texto) || err.message);
          desenharQuestao({ focar: false });
          return;
        }
        if (err && err.status === 409) { await recarregar(); toast(err.message, 'aviso'); return; }
        const s = el.querySelector('[data-av-salvo]');
        if (s) s.textContent = 'Não foi possível salvar agora. Tentaremos de novo em instantes.';
      }
    }

    async function salvarPendentes(opcoes) {
      if (!S.tentativa || previa) return;
      const lista = Array.from(S.pendentes.entries());
      for (const [qid, corpo] of lista) await salvar(qid, corpo, opcoes);
    }

    function iniciarRelogios() {
      limparTimers();
      S.timers.push(window.setInterval(() => { salvarPendentes(); }, AUTOSAVE_MS));
      if (!S.tentativa || !S.tentativa.prazoEm) return;
      S.timers.push(window.setInterval(() => {
        if (S.destruido || !S.tentativa) return;
        const r = restanteSeg();
        const alvo = el.querySelector('[data-av-cronometro]');
        if (alvo) {
          const tom = r < 60 ? 'erro' : r < 300 ? 'aviso' : 'neutro';
          alvo.className = `pf-av-cronometro pf-av-cronometro--${tom}`;
          const v = alvo.querySelector('[data-av-relogio]');
          if (v) v.textContent = fmt.relogio(r);
          let nota = alvo.querySelector('.pf-av-cronometro__nota');
          if (r < 300) {
            if (!nota) { nota = doc.createElement('span'); nota.className = 'pf-av-cronometro__nota'; alvo.appendChild(nota); }
            nota.textContent = `Restam ${Math.max(1, Math.ceil(r / 60))} min`;
          } else if (nota) nota.remove();
        }
        for (const m of ANUNCIOS_MIN) {
          if (r <= m * 60 && r > (m * 60) - 5 && !S.anunciados.has(m)) {
            S.anunciados.add(m);
            anunciar(el, m === 1 ? 'Resta 1 minuto.' : `Restam ${m} minutos.`);
          }
        }
        if (r <= 0 && !S.enviando) enviar({ automatico: true });
      }, 1000));
    }

    async function tempoEsgotado() {
      limparTimers();
      S.pendentes.clear();
      const t = S.tentativa;
      S.tentativa = null;
      try {
        S.resultado = await api.get(API.tentativa(t.id), { sinal: controlador.signal });
      } catch (_e) { S.resultado = null; }
      await recarregar({ manterResultado: true, aviso: 'O tempo acabou. Suas respostas foram enviadas.' });
    }

    // ---------------- 3. Revisão ----------------
    function desenharRevisao() {
      const t = S.tentativa;
      const brancos = t.questoes.filter((q) => !respondida(q)).length;
      desenhar(H`${previa ? htmlFaixaPrevia() : ''}
        <div class="pf-av-revisao">
          <div class="pf-av-topo"><h3 class="pf-av-secao" tabindex="-1" data-av-revisao>Revisão da tentativa ${t.numero}</h3>${htmlCronometro()}</div>
          <ol class="pf-av-revisao__lista">${t.questoes.map((q, i) => H`<li class="pf-av-revisao__item">
            <button type="button" class="pf-av-revisao__link" data-av="ir" data-indice="${i}">Questão ${i + 1}</button>
            ${respondida(q) ? estadoHtml('Respondida', 'sucesso') : estadoHtml('Em branco', 'aviso')}
          </li>`)}</ol>
          ${brancos ? H`<p class="pf-av-motivo">${brancos === 1 ? '1 questão está em branco.' : `${brancos} questões estão em branco.`} Questões em branco contam como erradas.</p>` : ''}
          <div class="pf-av-acoes">
            <button type="button" class="dmc-btn dmc-btn--secondary pf-av-btn" data-av="voltar-questoes">Voltar às questões</button>
            <button type="button" class="dmc-btn dmc-btn--primary pf-av-btn" data-av="enviar">Enviar respostas</button>
          </div>
        </div>`);
      focar('[data-av-revisao]');
    }

    async function enviar({ automatico = false, botao = null } = {}) {
      const t = S.tentativa;
      if (!t || S.enviando) return;
      if (previa) {
        desenhar(H`${htmlFaixaPrevia()}<div class="pf-av-alerta pf-av-alerta--info" role="status">${ic('info')}<p>Prévia concluída. Nada foi registrado: na tentativa real, as respostas seriam enviadas agora e as objetivas corrigidas na hora.</p></div>
          <div class="pf-av-acoes"><button type="button" class="dmc-btn dmc-btn--secondary pf-av-btn" data-av="sortear">Sortear outra tentativa</button></div>`);
        return;
      }
      if (!automatico) {
        const ok = await confirmar({
          titulo: `Enviar a tentativa ${t.numero}?`,
          texto: 'Questões em branco contam como erradas. Depois de enviar, não é possível alterar as respostas.',
          rotuloConfirmar: 'Enviar respostas'
        });
        if (!ok) return;
      }
      S.enviando = true;
      if (botao) ocupado(botao, true, 'Enviando…');
      el.setAttribute('aria-busy', 'true');
      const lote = {};
      for (const [qid, corpo] of S.pendentes.entries()) lote[qid] = corpo;
      try {
        S.resultado = await api.post(API.enviar(t.id), Object.keys(lote).length ? { respostas: lote } : {}, { sinal: controlador.signal });
        S.pendentes.clear();
        S.tentativa = null;
        limparTimers();
        await recarregar({ manterResultado: true, aviso: automatico ? 'O tempo acabou. Suas respostas foram enviadas.' : null });
        emitir({ feito: true });
      } catch (err) {
        if (err && err.codigo === 'tempo-esgotado') { S.enviando = false; await tempoEsgotado(); emitir({ feito: true }); return; }
        if (err && err.codigo === 'resposta-longa') {
          S.enviando = false;
          el.setAttribute('aria-busy', 'false');
          if (botao) ocupado(botao, false);
          toast(err.message, 'erro');
          return;
        }
        S.enviando = false;
        falha(err, () => recarregar());
      } finally {
        S.enviando = false;
      }
    }

    // ---------------- 4. Resultado ----------------
    function textoSituacao(d, r) {
      const e = d.estado || {};
      const minima = Number.isFinite(e.notaMinima) ? e.notaMinima : null;
      if (r && r.aguardandoCorrecao) {
        if (r.temEntregaArquivo) return { tom: 'info', rotulo: 'Aguardando correção', texto: 'A entrega aguarda correção do professor. Sua nota sai depois da correção.' };
        const n = r.questoesAguardando || 0;
        return { tom: 'info', rotulo: 'Aguardando correção', texto: `${n === 1 ? '1 questão dissertativa aguarda' : `${n} questões dissertativas aguardam`} correção do professor. Sua nota sai depois da correção.` };
      }
      if (d.avaliacao.tipo !== 'modular') return { tom: 'neutro', rotulo: 'Atividade prévia', texto: 'Esta atividade não conta para a nota do módulo.' };
      const sit = e.situacao;
      if (sit === 'aprovado') return { tom: 'sucesso', rotulo: 'Aprovado no módulo', texto: `Melhor nota ${fmt.nota(e.melhorNota)}${minima !== null ? `; mínima ${fmt.nota(minima)}` : ''}.` };
      if (sit === 'em_recuperacao') return { tom: 'aviso', rotulo: 'Em recuperação', texto: `Melhor nota ${fmt.nota(e.melhorNota)}${e.restantes ? `; você tem mais ${e.restantes === 1 ? '1 tentativa' : `${e.restantes} tentativas`}` : ''}.` };
      if (sit === 'reprovado') return { tom: 'erro', rotulo: 'Reprovado no módulo', texto: `Melhor nota ${fmt.nota(e.melhorNota)}${minima !== null ? `; mínima ${fmt.nota(minima)}` : ''}.` };
      return { tom: 'neutro', rotulo: ROTULO_SITUACAO[sit] || 'Cursando', texto: '' };
    }

    function desenharResultado(aviso) {
      limparTimers();
      const d = S.dados;
      const e = d.estado || {};
      const r = S.resultado;
      const sit = textoSituacao(d, r);
      const minima = Number.isFinite(e.notaMinima) ? e.notaMinima : null;
      const abaixo = d.avaliacao.tipo === 'modular' && Number.isFinite(e.melhorNota) && minima !== null && e.melhorNota < minima;
      const melhorarPrimario = e.podeMelhorar && (abaixo || !Number.isFinite(e.melhorNota));
      const linkAcademico = r && r.linkAcademico ? `${r.linkAcademico}#modulo-${encodeURIComponent(d.avaliacao.modulo && d.avaliacao.modulo.id ? d.avaliacao.modulo.id : (o.moduloId || ''))}` : (d.matricula ? `academico.html?m=${encodeURIComponent(d.matricula.id)}` : 'academico.html');
      const motivoMelhorar = !e.podeMelhorar ? (e.finalizada ? 'Você finalizou esta avaliação.' : (e.restantes === 0 ? `Você usou ${e.permitidas === 1 ? 'a tentativa' : `as ${e.permitidas} tentativas`}.` : motivoDeBloqueio(d))) : '';
      const botaoFinalizar = e.podeFinalizar ? H`<button type="button" class="${melhorarPrimario ? 'dmc-btn dmc-btn--secondary pf-av-btn' : 'dmc-btn dmc-btn--primary pf-av-btn'}" data-av="finalizar">Finalizar e ver gabarito</button>` : '';
      const botaoMelhorar = H`<button type="button" class="${melhorarPrimario ? 'dmc-btn dmc-btn--primary pf-av-btn' : 'dmc-btn dmc-btn--secondary pf-av-btn'}" data-av="melhorar" ${e.podeMelhorar ? '' : cru('disabled aria-describedby="pf-av-motivo-melhorar"')}>Melhorar nota</button>`;
      desenhar(H`<div class="pf-av-resultado">
        ${htmlCabecalho(d.avaliacao)}
        ${aviso ? H`<div class="pf-av-alerta pf-av-alerta--aviso" role="status">${ic('relogio')}<p>${aviso}</p></div>` : ''}
        ${e.concedida || d.novaTentativaLiberada ? H`<div class="pf-av-alerta pf-av-alerta--info" role="status">${ic('info')}<p>Uma nova tentativa foi liberada para você.</p></div>` : ''}
        ${r ? H`<section class="pf-av-resultado__painel" aria-labelledby="pf-av-res-t">
          ${htmlDonut(r.pctAcerto, 'Acerto')}
          <div class="pf-av-resultado__texto">
            <h3 class="pf-av-secao" id="pf-av-res-t" tabindex="-1" data-av-resultado>Tentativa ${r.numero}${r.status === 'corrigida' ? H` · nota <span class="pf-av-nota">${fmt.nota(r.nota)}</span>` : ''}</h3>
            ${r.totalObjetivas ? H`<p>Você acertou ${r.acertosObjetivas} de ${r.totalObjetivas} ${r.totalObjetivas === 1 ? 'questão objetiva' : 'questões objetivas'}.</p>` : ''}
            <p class="pf-av-meta">Início ${fmt.dataHora(r.iniciadaEm)} · Fim ${fmt.dataHora(r.enviadaEm)}${fmt.duracao(r.iniciadaEm, r.enviadaEm) ? ` (${fmt.duracao(r.iniciadaEm, r.enviadaEm)})` : ''}${r.expirada ? ' · tempo esgotado' : ''}</p>
            <p class="pf-av-situacao">${estadoHtml(sit.rotulo, sit.tom)}${sit.texto ? H` <span>${sit.texto}</span>` : ''}</p>
            ${r.codigo ? H`<p class="pf-av-meta">Código de verificação <code class="pf-av-codigo">${r.codigo}</code></p>` : ''}
            ${(r.comentarios || []).filter((c) => c.comentario).length ? H`<details class="pf-av-devolutivas"><summary>Devolutiva do professor</summary>${r.comentarios.filter((c) => c.comentario).map((c) => H`<p class="pf-av-texto-livre">${c.comentario} <span class="pf-av-meta">(${fmt.pontos(c.pontos)} pontos)</span></p>`)}</details>` : ''}
          </div>
        </section>` : ''}
        <div class="pf-av-acoes">
          ${e.finalizada
            ? H`<button type="button" class="dmc-btn dmc-btn--primary pf-av-btn" data-av="gabarito">Ver gabarito</button>`
            : H`${melhorarPrimario ? H`${botaoMelhorar}${botaoFinalizar}` : H`${botaoFinalizar}${botaoMelhorar}`}`}
          <a class="dmc-btn dmc-btn--link pf-av-btn" href="${linkAcademico}">Confira sua nota no Acadêmico →</a>
        </div>
        ${motivoMelhorar && !e.finalizada ? H`<p class="pf-av-motivo" id="pf-av-motivo-melhorar">${motivoMelhorar}</p>` : ''}
        ${htmlHistorico(d.tentativas)}
      </div>`);
      focar(r ? '[data-av-resultado]' : '[data-av-titulo]');
    }

    async function finalizar(botao) {
      const d = S.dados;
      const e = d.estado || {};
      const minima = Number.isFinite(e.notaMinima) ? e.notaMinima : null;
      const textos = [`Ao finalizar, você não poderá fazer novas tentativas. Sua nota será a maior obtida até agora${Number.isFinite(e.melhorNota) ? ` (${fmt.nota(e.melhorNota)})` : ''}.`];
      if (d.avaliacao.tipo === 'modular' && minima !== null && (!Number.isFinite(e.melhorNota) || e.melhorNota < minima)) textos.push(`Abaixo de ${fmt.nota(minima)}, o módulo fica Reprovado.`);
      if (e.aguardandoCorrecao) textos.push('A tentativa em correção continua valendo quando o professor publicar a nota.');
      const ok = await confirmar({ titulo: 'Finalizar e ver o gabarito?', texto: textos, rotuloConfirmar: 'Finalizar e ver gabarito' });
      if (!ok) return;
      ocupado(botao, true, 'Finalizando…');
      try {
        const r = await api.post(API.finalizar(o.avaliacaoId), { confirmar: true }, { sinal: controlador.signal });
        await recarregar({ manterResultado: true });
        emitir({ feito: true });
        if (r && r.gabaritoDisponivel === false && r.gabaritoLiberaEm) toast(`O gabarito completo fica disponível em ${fmt.data(r.gabaritoLiberaEm)}.`, 'info');
        await abrirGabarito();
      } catch (err) {
        ocupado(botao, false);
        if (err && err.status === 409) { await recarregar(); toast(err.message, 'aviso'); return; }
        falha(err, () => recarregar());
      }
    }

    // ---------------- 5. Gabarito ----------------
    async function abrirGabarito() {
      const d = S.dados;
      const lista = (d.tentativas || []).filter((t) => t.status !== 'em_andamento');
      if (!lista.length) return;
      const alvo = S.resultado && lista.some((t) => t.id === S.resultado.id) ? S.resultado.id : lista[lista.length - 1].id;
      el.setAttribute('aria-busy', 'true');
      try {
        const g = await api.get(API.gabarito(alvo), { sinal: controlador.signal });
        desenharGabarito(g, lista);
      } catch (err) {
        if (err && err.codigo === 'gabarito-bloqueado') { el.setAttribute('aria-busy', 'false'); toast(err.message, 'aviso'); return; }
        falha(err, () => abrirGabarito());
      }
    }

    function htmlItemGabarito(q, i, completo) {
      if (q.tipo === 'objetiva') {
        const sua = q.suaResposta && q.suaResposta.alternativaId;
        return H`<li class="pf-av-gabarito__item">
          <p class="pf-av-questao__n">Questão ${i + 1} · ${q.acertou ? H`<span class="pf-av-marca pf-av-marca--certo">${ic('certo')}Correta</span>` : H`<span class="pf-av-marca pf-av-marca--errado">${ic('errado')}Incorreta</span>`}</p>
          <p class="pf-av-enunciado">${q.enunciado}</p>
          <ul class="pf-av-gabarito__alternativas">${(q.alternativas || []).map((a, k) => {
            const marcada = a.id === sua;
            const correta = completo && a.id === q.corretaId;
            return H`<li class="${`pf-av-gabarito__alt${marcada ? ' is-marcada' : ''}${correta ? ' is-correta' : ''}`}">
              <span class="pf-av-alternativa__letra" aria-hidden="true">${LETRAS[k] || ''}</span>
              <span class="pf-av-alternativa__texto">${a.texto}</span>
              ${marcada ? H`<span class="pf-av-gabarito__rotulo">Sua resposta</span>` : ''}
              ${correta ? H`<span class="pf-av-gabarito__rotulo pf-av-gabarito__rotulo--correta">Resposta correta</span>` : ''}
            </li>`;
          })}</ul>
          ${!sua ? H`<p class="pf-av-meta">Você deixou esta questão em branco.</p>` : ''}
          ${completo && q.explicacao ? H`<div class="pf-av-explicacao"><p class="pf-av-explicacao__titulo">Comentário do gabarito</p><p class="pf-av-texto-livre">${q.explicacao}</p></div>` : ''}
        </li>`;
      }
      const sua = q.suaResposta;
      return H`<li class="pf-av-gabarito__item">
        <p class="pf-av-questao__n">Questão ${i + 1} · ${q.tipo === 'arquivo' ? 'entrega de arquivo' : 'dissertativa'}</p>
        <p class="pf-av-enunciado">${q.enunciado}</p>
        <div class="pf-av-explicacao"><p class="pf-av-explicacao__titulo">Sua resposta</p>
          ${q.tipo === 'arquivo'
            ? H`<p>${sua && sua.sha256 ? `PDF enviado (${fmt.bytes(sua.tamanho)})` : 'Nenhum arquivo enviado.'}</p>`
            : H`<p class="pf-av-texto-livre">${sua && sua.texto ? sua.texto : 'Em branco.'}</p>`}
        </div>
        <p class="pf-av-meta">${Number.isFinite(q.pontosObtidos) ? `${fmt.pontos(q.pontosObtidos)} de ${fmt.pontos(q.pontos)} pontos` : 'Aguardando correção do professor.'}</p>
        ${q.comentario ? H`<div class="pf-av-explicacao"><p class="pf-av-explicacao__titulo">Devolutiva do professor</p><p class="pf-av-texto-livre">${q.comentario}</p></div>` : ''}
        ${completo && q.explicacao ? H`<div class="pf-av-explicacao"><p class="pf-av-explicacao__titulo">Comentário do gabarito</p><p class="pf-av-texto-livre">${q.explicacao}</p></div>` : ''}
      </li>`;
    }

    function desenharGabarito(g, lista) {
      const d = S.dados;
      desenhar(H`<div class="pf-av-gabarito">
        ${htmlCabecalho(d.avaliacao)}
        <div class="pf-av-gabarito__topo">
          <h3 class="pf-av-secao" tabindex="-1" data-av-gabarito>Gabarito · tentativa ${g.numero}</h3>
          ${lista.length > 1 ? H`<label class="pf-av-seletor"><span>Tentativa</span><select class="pf-av-select" data-av-tentativa-gabarito>${lista.map((t) => H`<option value="${t.id}" ${t.id === g.tentativaId ? cru('selected') : ''}>${`Tentativa ${t.numero}`}</option>`)}</select></label>` : ''}
        </div>
        ${g.completo ? '' : H`<div class="pf-av-alerta pf-av-alerta--info" role="status">${ic('info')}<p>${d.avaliacao.gabaritoLiberaEm ? `As respostas corretas e os comentários ficam disponíveis em ${fmt.data(d.avaliacao.gabaritoLiberaEm)}.` : 'As respostas corretas ficam disponíveis depois da data definida pelo professor.'} Por enquanto, você vê o que acertou e o que errou.</p></div>`}
        <ol class="pf-av-gabarito__lista">${g.questoes.map((q, i) => htmlItemGabarito(q, i, g.completo))}</ol>
        <div class="pf-av-acoes"><button type="button" class="dmc-btn dmc-btn--secondary pf-av-btn" data-av="voltar-resultado">Voltar ao resultado</button></div>
      </div>`);
      focar('[data-av-gabarito]');
    }

    // ---------------- carga ----------------
    async function recarregar(opcoesR) {
      const r = opcoesR || {};
      if (previa) {
        const p = await api.get(API.previa(o.avaliacaoId), { sinal: controlador.signal });
        S.dados = { avaliacao: Object.assign({ modulo: null }, p.avaliacao), avisos: p.avisos, questoes: p.questoes, notaMinima: p.notaMinima, estado: { notaMinima: p.notaMinima } };
        S.tentativa = null;
        desenharApresentacao();
        return;
      }
      const anterior = S.dados && S.dados.estado ? S.dados.estado : null;
      const d = await api.get(API.avaliacao(o.avaliacaoId), { sinal: controlador.signal });
      if (anterior && anterior.finalizada && d.estado && !d.estado.finalizada) d.estado.concedida = true;
      S.dados = d;
      if (d.aberta) {
        const t = await api.get(API.tentativa(d.aberta.id), { sinal: controlador.signal });
        if (t && Array.isArray(t.questoes)) { abrirTentativa(t); return; }
        S.resultado = t;
      }
      const enviadas = (d.tentativas || []).filter((t) => t.status !== 'em_andamento');
      if (!enviadas.length) { desenharApresentacao(); return; }
      const ultima = enviadas[enviadas.length - 1];
      if (!r.manterResultado || !S.resultado || S.resultado.id !== ultima.id) {
        S.resultado = await api.get(API.tentativa(ultima.id), { sinal: controlador.signal });
      }
      desenharResultado(r.aviso || null);
    }

    // ---------------- eventos (delegação) ----------------
    function irPara(i) {
      if (!S.tentativa) return;
      salvarPendentes();
      S.indice = Math.max(0, Math.min(S.tentativa.questoes.length - 1, i));
      desenharQuestao();
    }

    function aoClicar(ev) {
      S.interagiu = true;
      const b = ev.target.closest('[data-av]');
      if (!b || !el.contains(b) || b.disabled) return;
      const acao = b.getAttribute('data-av');
      switch (acao) {
        case 'iniciar': case 'melhorar': iniciar(b); break;
        case 'anterior': irPara(S.indice - 1); break;
        case 'proxima': irPara(S.indice + 1); break;
        case 'ir': {
          const i = Number(b.getAttribute('data-indice'));
          if (S.tentativa && Number.isInteger(i)) irPara(i);
          break;
        }
        case 'questoes': {
          const nav = el.querySelector('[data-av-navegador]');
          if (!nav) break;
          nav.hidden = !nav.hidden;
          b.setAttribute('aria-expanded', String(!nav.hidden));
          if (!nav.hidden) { const atual = nav.querySelector('.is-atual'); if (atual) atual.focus(); }
          break;
        }
        case 'revisar': salvarPendentes(); desenharRevisao(); break;
        case 'voltar-questoes': desenharQuestao(); break;
        case 'enviar': enviar({ botao: b }); break;
        case 'finalizar': finalizar(b); break;
        case 'gabarito': abrirGabarito(); break;
        case 'voltar-resultado': desenharResultado(); break;
        case 'sortear': recarregar().catch((err) => falha(err, () => recarregar())); break;
        default: break;
      }
    }

    function aoMudar(ev) {
      const alvo = ev.target;
      if (alvo.matches('[data-av-alternativa]')) {
        const qid = alvo.getAttribute('data-av-alternativa');
        const corpo = { alternativaId: alvo.value };
        S.pendentes.set(qid, corpo);
        atualizarBarra();
        salvar(qid, corpo);
        return;
      }
      if (alvo.matches('[data-av-arquivo]')) { enviarArquivo(alvo); return; }
      if (alvo.matches('[data-av-tentativa-gabarito]')) {
        el.setAttribute('aria-busy', 'true');
        api.get(API.gabarito(alvo.value), { sinal: controlador.signal })
          .then((g) => desenharGabarito(g, (S.dados.tentativas || []).filter((t) => t.status !== 'em_andamento')))
          .catch((err) => falha(err, () => abrirGabarito()));
      }
    }

    let digitacao = null;
    function aoDigitar(ev) {
      const alvo = ev.target;
      if (!alvo.matches('[data-av-texto]')) return;
      const qid = alvo.getAttribute('data-av-texto');
      const limite = Number(alvo.getAttribute('data-limite')) || 10000;
      let valor = alvo.value;
      if (tamanho(valor) > limite) {
        valor = Array.from(valor).slice(0, limite).join('');
        alvo.value = valor;
      }
      const ct = el.querySelector(`[data-av-contador="${qid}"]`);
      if (ct) ct.textContent = `${fmt.numero(tamanho(valor))} de ${fmt.numero(limite)} caracteres · Resposta salva automaticamente`;
      S.pendentes.set(qid, { texto: valor });
      atualizarBarra();
      if (digitacao) window.clearTimeout(digitacao);
      digitacao = window.setTimeout(() => { const p = S.pendentes.get(qid); if (p) salvar(qid, p); }, DIGITACAO_MS);
    }

    function aoTeclar(ev) {
      S.interagiu = true;
      if (ev.key === 'Escape') {
        const nav = el.querySelector('[data-av-navegador]');
        if (nav && !nav.hidden) {
          nav.hidden = true;
          const b = el.querySelector('[data-av="questoes"]');
          if (b) { b.setAttribute('aria-expanded', 'false'); b.focus(); }
        }
      }
    }

    async function enviarArquivo(input) {
      const qid = input.getAttribute('data-av-arquivo');
      const estado = el.querySelector(`[data-av-arquivo-estado="${qid}"]`);
      const f = input.files && input.files[0];
      if (!f) return;
      const escrever = (t) => { if (estado) estado.textContent = t; };
      if (f.size > TCC_MAX) { escrever('Arquivo maior que 4 MB.'); return; }
      if (previa) { escrever('Na prévia, o arquivo não é enviado.'); return; }
      escrever('Enviando…');
      try {
        const r = await api.enviarArquivo(API.arquivo(S.tentativa.id, qid), f, { sinal: controlador.signal });
        aplicarLocal(qid, { sha256: r.arquivo.sha256, tamanho: r.arquivo.tamanho, em: r.salvoEm });
        marcarSalvo(r.salvoEm);
        desenharQuestao({ focar: false });
        const novo = el.querySelector(`[data-av-arquivo-estado="${qid}"]`);
        if (novo) novo.textContent = `${f.name} · ${fmt.bytes(r.arquivo.tamanho)} · Enviado às ${fmt.hora(r.salvoEm)}`;
      } catch (err) {
        if (err && err.codigo === 'tempo-esgotado') { await tempoEsgotado(); return; }
        if (err && err.status === 413) { escrever('Arquivo maior que 4 MB.'); return; }
        if (err && err.codigo === 'pdf-ativo') { escrever('Este PDF não pode ser aceito. Gere um novo PDF e tente de novo.'); return; }
        if (err && err.status === 415) { escrever('Envie um arquivo PDF.'); return; }
        escrever((err && err.message) || 'Não foi possível enviar agora.');
      } finally {
        input.value = '';
      }
    }

    el.addEventListener('click', aoClicar);
    el.addEventListener('change', aoMudar);
    el.addEventListener('input', aoDigitar);
    el.addEventListener('keydown', aoTeclar);

    return recarregar()
      .then(() => ({ destruir }))
      .catch((err) => {
        if (S.destruido || (err && err.name === 'AbortError')) return { destruir };
        if (err && err.status === 404) {
          desenhar(H`<div class="pf-av-alerta pf-av-alerta--info" role="status">${ic('info')}<p>Esta atividade não está disponível.</p></div>`);
          return { destruir };
        }
        falha(err, () => recarregar().catch((e) => falha(e)));
        return { destruir };
      });
  }

  window.DMC_Avaliacao = Object.freeze({ montar });
})();
