/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/declaracoes.js
   "Declarações e certificados" (certificados.html) — fatia F3b.
   Spec: docs/dmc/PORTAL-UX.md §6.9 · PORTAL-API.md §6.7.5, §6.7.7.

   Três seções na mesma página (#certificados, #solicitar, #historico):
   1. Certificados: emitidos (código, selo abreviado, ver/imprimir, copiar
      link) e, para cada curso liberado sem certificado, o que o servidor
      diz (elegivel, regra, pendencias[], notaMinima) — nenhum número fixo.
   2. Solicitar declaração (matrícula, frequência, conclusão; quitação
      anual da F5 quando o servidor a oferece).
   3. Histórico de solicitações.
   Preserva #certificados-lista (R9, R9b). DMC_bootCertificados vira
   apelido deste boot. HTML só por DMC_UI.html; sem alert/confirm.
   ============================================================= */
(function () {
  'use strict';

  const API = Object.freeze({
    liberacoes: '/liberacoes/me',
    certificados: '/certificados',
    certificado: (cursoId) => `/cursos/${encodeURIComponent(cursoId)}/certificado`,
    declaracoes: '/portal/me/declaracoes',
    quitacao: (ano) => `/portal/me/financeiro/declaracoes/${encodeURIComponent(ano)}`
  });

  const ROTULOS_TIPO = {
    matricula: 'Declaração de matrícula',
    frequencia: 'Declaração de frequência',
    conclusao: 'Declaração de conclusão',
    quitacao_anual: 'Declaração financeira anual (quitação)'
  };

  // ---------- utilidades (com o núcleo quando existe; local enquanto a F0b termina) ----------
  const UI = () => window.DMC_UI;
  const html = (partes, ...valores) => UI().html(partes, ...valores);
  const cru = (s) => UI().cru(s);
  const icone = (k) => (UI() && typeof UI().icone === 'function' ? UI().icone(k) : '');

  const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  function fmtData(iso) {
    const f = UI() && UI().fmt && UI().fmt.data;
    if (typeof f === 'function') return f(iso);
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? FMT_DATA.format(d) : '—';
  }
  function fmtNota(n) {
    const f = UI() && UI().fmt && UI().fmt.nota;
    if (typeof f === 'function') return f(n);
    return (Math.round(Number(n) * 10) / 10).toFixed(1).replace('.', ',');
  }
  function estado(rotulo, tom) {
    const f = UI() && UI().estado;
    if (typeof f === 'function') return cru(f(rotulo, tom));
    return html`<span class="pf-estado pf-estado--${tom}">${rotulo}</span>`;
  }

  function anunciar(texto, tipo) {
    const ui = UI();
    if (ui && typeof ui.toast === 'function') { ui.toast(texto, { tipo: tipo || 'info' }); return; }
    const vivo = document.getElementById('pf-dec-anuncio');
    if (vivo) vivo.textContent = texto;
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      anunciar('Link de validação copiado.', 'sucesso');
    } catch (_e) {
      anunciar(`Link de validação: ${texto}`, 'info');
    }
  }

  const urlAbsoluta = (rel) => new URL(rel, window.location.href).href;
  const urlValidacao = (codigo) => urlAbsoluta(`validar.html?codigo=${encodeURIComponent(codigo)}`);

  /** GET que tolera rota ausente (fatia ainda não montada) → null. */
  async function getOuNulo(caminho) {
    try {
      return await window.DMC_Api.get(caminho);
    } catch (err) {
      if (err && err.status === 404) return null;
      throw err;
    }
  }

  // ---------- diálogo local (nome da conta antes de emitir; D-53, D-76) ----------
  function dialogoNomeDaConta(nome) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'pf-dialogo pf-dialogo--p';
      d.setAttribute('aria-labelledby', 'pf-dec-dlg-titulo');
      d.innerHTML = html`
        <div class="pf-dialogo__cabeca"><h2 class="pf-dialogo__titulo" id="pf-dec-dlg-titulo">Confirme o nome do certificado</h2></div>
        <div class="pf-dialogo__corpo">
          <p>O certificado sairá com o nome «${nome}», da sua conta. Para que conste o nome de registro, complete o cadastro antes.</p>
        </div>
        <div class="pf-dialogo__acoes">
          <button type="button" class="dmc-btn dmc-btn--link" data-pf-acao="cancelar">Cancelar</button>
          <a class="dmc-btn dmc-btn--secondary" href="perfil.html#identificacao">Completar cadastro</a>
          <button type="button" class="dmc-btn dmc-btn--primary" data-pf-acao="confirmar">Emitir assim mesmo</button>
        </div>`;
      let resultado = false;
      d.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pf-acao]');
        if (!b) return;
        resultado = b.getAttribute('data-pf-acao') === 'confirmar';
        d.close();
      });
      d.addEventListener('close', () => { d.remove(); resolve(resultado); });
      document.body.appendChild(d);
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
      const cancelar = d.querySelector('[data-pf-acao="cancelar"]');
      if (cancelar) cancelar.focus();
    });
  }

  // ---------- 1. Certificados ----------
  function linkDaPendencia(p, cursoId, status) {
    const c = encodeURIComponent(cursoId);
    switch (p.tipo) {
      case 'aulas':
        return html`<a class="pf-dec-falta__link" href="aula.html?curso=${c}">Continuar as aulas</a>${status && Number.isFinite(status.total) && status.total > 0 ? html` <span class="pf-dec-cert__meta">${status.concluidas} de ${status.total} aulas</span>` : ''}`;
      case 'modulo':
        return html`<a class="pf-dec-falta__link" href="academico.html?curso=${c}#modulo-${p.moduloId || ''}">Ver no Acadêmico</a>`;
      case 'frequencia':
        return html`<a class="pf-dec-falta__link" href="comprovantes.html?curso=${c}&tipo=frequencia">Ver comprovantes de frequência</a>`;
      case 'tcc':
        return p.moduloId
          ? html`<a class="pf-dec-falta__link" href="academico.html?curso=${c}#modulo-${p.moduloId}">Ver no Acadêmico</a>`
          : html`<a class="pf-dec-falta__link" href="atendimentos.html?novo=1&categoria=academico&curso=${c}">Falar com o atendimento</a>`;
      case 'carga':
        return html`<a class="pf-dec-falta__link" href="atendimentos.html?novo=1&categoria=academico&curso=${c}">Falar com o atendimento</a>`;
      default:
        return '';
    }
  }

  function fraseDaRegra(status) {
    if (status.regra === 'aprovacao') {
      const nota = typeof status.notaMinima === 'number' ? ` (nota mínima ${fmtNota(status.notaMinima)})` : '';
      return `Para emitir: concluir 100% das aulas disponíveis e ser aprovado em todos os módulos com avaliação${nota}.`;
    }
    return 'Para emitir: concluir 100% das aulas disponíveis.';
  }

  function linhaEmitido(c) {
    const selo = c.hashPrefixo
      ? html`Selo <span class="pf-dec-cert__codigo">${c.hashPrefixo}</span>`
      : 'Emitido antes da verificação por selo';
    return html`
      <li class="pf-dec-cert" data-curso="${c.cursoId}">
        <div>
          <p class="pf-dec-cert__estado">${estado('Emitido', 'sucesso')}</p>
          <h3 class="pf-dec-cert__titulo">${c.tituloCurso || 'Curso'}</h3>
          <p class="pf-dec-cert__meta">${c.cargaHoraria ? `${c.cargaHoraria} · ` : ''}Emitido em ${fmtData(c.emitidoEm)}</p>
          <p class="pf-dec-cert__meta">Código <span class="pf-dec-cert__codigo">${c.codigo}</span> · ${selo}</p>
        </div>
        <div class="pf-dec-cert__acoes">
          <a class="dmc-btn dmc-btn--secondary" href="certificado.html?codigo=${encodeURIComponent(c.codigo)}" target="_blank" rel="noopener">Ver e imprimir</a>
          <button type="button" class="dmc-btn dmc-btn--link" data-copiar="${urlValidacao(c.codigo)}">Copiar link de validação</button>
        </div>
      </li>`;
  }

  function linhaPendente(cursoId, s) {
    const titulo = s.tituloCurso || 'Curso';
    const meta = s.cargaHoraria ? html`<p class="pf-dec-cert__meta">${s.cargaHoraria}</p>` : '';
    const ies = (s.pendencias || []).find((p) => p.tipo === 'certificado-pela-ies');
    if (ies) {
      return html`
        <li class="pf-dec-cert" data-curso="${cursoId}">
          <div>
            <p class="pf-dec-cert__estado">${estado('Pela instituição parceira', 'info')}</p>
            <h3 class="pf-dec-cert__titulo">${titulo}</h3>${meta}
            <p class="pf-dec-cert__regra">${ies.texto}</p>
          </div>
        </li>`;
    }
    if (s.elegivel) {
      const faltaCadastro = Array.isArray(s.faltando) && s.faltando.length;
      const acao = faltaCadastro
        ? html`<a class="dmc-btn dmc-btn--secondary" href="perfil.html#identificacao">Completar cadastro</a>`
        : html`<button type="button" class="dmc-btn dmc-btn--primary" data-emitir="${cursoId}">Emitir certificado</button>`;
      return html`
        <li class="pf-dec-cert" data-curso="${cursoId}">
          <div>
            <p class="pf-dec-cert__estado">${estado('Apto para emitir', 'sucesso')}</p>
            <h3 class="pf-dec-cert__titulo">${titulo}</h3>${meta}
            ${faltaCadastro ? html`<p class="pf-dec-cert__regra">Informe o nome de registro no seu cadastro antes de emitir o certificado.</p>` : ''}
          </div>
          <div class="pf-dec-cert__acoes">${acao}</div>
        </li>`;
    }
    const pend = Array.isArray(s.pendencias) ? s.pendencias : [];
    const corpo = pend.length
      ? html`
          <p class="pf-dec-cert__regra">${fraseDaRegra(s)}</p>
          <p class="pf-dec-cert__meta">O que falta</p>
          <ul class="pf-dec-falta">${pend.map((p) => html`
            <li class="pf-dec-falta__item"><span>${p.texto}</span>${linkDaPendencia(p, cursoId, s)}</li>`)}
          </ul>`
      : html`<p class="pf-dec-cert__regra">${fraseDaRegra(s)}</p>`;
    return html`
      <li class="pf-dec-cert" data-curso="${cursoId}">
        <div>
          <p class="pf-dec-cert__estado">${pend.length ? estado('Em andamento', 'neutro') : estado('Ainda não apurado', 'neutro')}</p>
          <h3 class="pf-dec-cert__titulo">${titulo}</h3>${meta}
          ${corpo}
        </div>
      </li>`;
  }

  // ---------- 2. Solicitar declaração ----------
  function montarSolicitar(el, dados, aoEmitir) {
    if (!dados) {
      el.innerHTML = html`<div class="pf-alerta pf-alerta--aviso" role="status"><p>A solicitação de declarações está indisponível no momento. Tente de novo mais tarde.</p></div>`;
      return;
    }
    const disponiveis = Array.isArray(dados.disponiveis) ? dados.disponiveis : [];
    const quitacao = Array.isArray(dados.quitacao) ? dados.quitacao : [];
    const tipos = [];
    for (const t of ['matricula', 'frequencia', 'conclusao']) if (disponiveis.some((d) => d.tipo === t)) tipos.push(t);
    if (quitacao.length) tipos.push('quitacao_anual');
    if (!tipos.length) {
      const texto = dados.indisponivel && dados.indisponivel.disponiveis
        ? dados.indisponivel.disponiveis
        : 'Nenhuma declaração disponível: as declarações por curso aparecem quando há matrícula registrada.';
      el.innerHTML = html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nada para solicitar agora</p><p class="pf-vazio__texto">${texto}</p></div>`;
      return;
    }
    el.innerHTML = html`
      <form class="pf-dec-form" id="pf-dec-form" novalidate>
        <div class="pf-campo">
          <label class="pf-rotulo" for="pf-dec-tipo">Tipo</label>
          <select class="pf-input" id="pf-dec-tipo" name="tipo">
            ${tipos.map((t) => html`<option value="${t}">${ROTULOS_TIPO[t]}</option>`)}
          </select>
        </div>
        <div class="pf-campo">
          <label class="pf-rotulo" for="pf-dec-ref" id="pf-dec-ref-rotulo">Curso</label>
          <select class="pf-input" id="pf-dec-ref" name="ref" aria-describedby="pf-dec-motivo"></select>
          <p class="pf-dec-motivo pf-ajuda" id="pf-dec-motivo" aria-live="polite"></p>
        </div>
        <div class="pf-dec-form__acoes">
          <button type="submit" class="dmc-btn dmc-btn--primary" id="pf-dec-enviar">Solicitar declaração</button>
        </div>
        <div id="pf-dec-form-erro"></div>
      </form>`;
    const form = el.querySelector('#pf-dec-form');
    const tipo = el.querySelector('#pf-dec-tipo');
    const ref = el.querySelector('#pf-dec-ref');
    const rotuloRef = el.querySelector('#pf-dec-ref-rotulo');
    const motivo = el.querySelector('#pf-dec-motivo');
    const enviar = el.querySelector('#pf-dec-enviar');
    const erro = el.querySelector('#pf-dec-form-erro');

    function opcoes() {
      const t = tipo.value;
      if (t === 'quitacao_anual') {
        rotuloRef.textContent = 'Ano';
        ref.innerHTML = html`${quitacao.map((q) => html`<option value="${String(q.ano)}">${String(q.ano)}${q.disponivel ? '' : ' (indisponível)'}</option>`)}`;
      } else {
        rotuloRef.textContent = 'Curso';
        const doTipo = disponiveis.filter((d) => d.tipo === t);
        ref.innerHTML = html`${doTipo.map((d) => html`<option value="${d.matriculaId}">${d.cursoTitulo}${d.matriculaNumero ? ` · ${d.matriculaNumero}` : ''}${d.elegivel ? '' : ' (indisponível)'}</option>`)}`;
      }
      atualizarMotivo();
    }
    function atual() {
      const t = tipo.value;
      if (t === 'quitacao_anual') return quitacao.find((q) => String(q.ano) === ref.value) || null;
      return disponiveis.find((d) => d.tipo === t && d.matriculaId === ref.value) || null;
    }
    function atualizarMotivo() {
      const a = atual();
      const ok = a && (tipo.value === 'quitacao_anual' ? a.disponivel : a.elegivel);
      motivo.textContent = ok ? '' : (a && a.motivo ? a.motivo : '');
      enviar.disabled = !ok;
      erro.innerHTML = '';
    }
    tipo.addEventListener('change', opcoes);
    ref.addEventListener('change', atualizarMotivo);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const a = atual();
      if (!a) return;
      enviar.disabled = true;
      enviar.setAttribute('aria-busy', 'true');
      erro.innerHTML = '';
      try {
        const r = tipo.value === 'quitacao_anual'
          ? await window.DMC_Api.post(API.quitacao(a.ano), {})
          : await window.DMC_Api.post(API.declaracoes, { tipo: tipo.value, matriculaId: a.matriculaId });
        anunciar('Declaração emitida. Ela está no histórico abaixo.', 'sucesso');
        await aoEmitir(r && r.declaracao);
      } catch (err) {
        let texto = (err && err.message) || 'Não foi possível emitir agora. Tente de novo.';
        let extra = '';
        if (err && err.codigo === 'dados-da-instituicao-pendentes') {
          texto = 'A declaração anual está indisponível no momento: a coordenação ainda não cadastrou os dados da instituição.';
          extra = html`<p class="pf-alerta__acao"><a href="atendimentos.html?novo=1&categoria=financeiro">Avisar o atendimento</a></p>`;
        } else if (err && err.codigo === 'cadastro-incompleto') {
          extra = html`<p class="pf-alerta__acao"><a href="perfil.html#identificacao">Completar cadastro</a></p>`;
        } else if (err && err.dados && err.dados.motivo && err.dados.motivo !== texto) {
          texto = `${texto} ${err.dados.motivo}`;
        }
        erro.innerHTML = html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>${texto}</p>${extra}</div>`;
      } finally {
        enviar.removeAttribute('aria-busy');
        atualizarMotivo();
      }
    });
    opcoes();
  }

  // ---------- 3. Histórico ----------
  function montarHistorico(el, dados) {
    const lista = dados && Array.isArray(dados.historico) ? dados.historico : null;
    if (!lista) {
      el.innerHTML = html`<p class="pf-ajuda">O histórico de solicitações está indisponível no momento.</p>`;
      return;
    }
    if (!lista.length) {
      el.innerHTML = html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhuma declaração solicitada ainda</p><p class="pf-vazio__texto">As declarações que você solicitar ficam registradas aqui, com o código de validação.</p></div>`;
      return;
    }
    el.innerHTML = html`
      <table class="pf-tabela">
        <caption class="dmc-sr-only">Histórico de solicitações de declarações</caption>
        <thead><tr>
          <th scope="col">Solicitada em</th><th scope="col">Tipo</th><th scope="col">Referência</th>
          <th scope="col">Código de validação</th><th scope="col">Situação</th><th scope="col" class="pf-tabela__acoes">Ações</th>
        </tr></thead>
        <tbody>${lista.map((d) => html`
          <tr>
            <td data-rotulo="Solicitada em">${fmtData(d.emitidaEm)}</td>
            <td data-rotulo="Tipo">${d.rotulo || ROTULOS_TIPO[d.tipo] || 'Declaração'}</td>
            <td data-rotulo="Referência">${d.cursoTitulo || (d.ano ? String(d.ano) : '—')}</td>
            <td data-rotulo="Código de validação"><span class="pf-dec-cert__codigo">${d.codigo}</span></td>
            <td data-rotulo="Situação">${d.revogada ? estado('Revogada', 'aviso') : estado('Emitida', 'sucesso')}</td>
            <td data-rotulo="Ações" class="pf-tabela__acoes">
              <a class="dmc-btn dmc-btn--link" href="declaracao.html?id=${encodeURIComponent(d.id)}">Abrir</a>
              <button type="button" class="dmc-btn dmc-btn--link" data-copiar="${urlValidacao(d.codigo)}">Copiar link</button>
            </td>
          </tr>`)}
        </tbody>
      </table>`;
  }

  // ---------- boot ----------
  async function boot(ctx) {
    const lista = document.getElementById('certificados-lista');
    const solicitar = document.getElementById('pf-dec-solicitar');
    const historico = document.getElementById('pf-dec-historico');
    if (!lista) return;

    const status = new Map(); // cursoId → GET do certificado (não emitido)
    let emitidos = [];

    async function carregarCertificados() {
      const [libs, certs] = await Promise.all([
        window.DMC_Api.get(API.liberacoes).catch(() => ({ cursoIds: [] })),
        window.DMC_Api.get(API.certificados)
      ]);
      emitidos = (certs && certs.itens) || [];
      const comCert = new Set(emitidos.map((c) => c.cursoId));
      const ids = ((libs && libs.cursoIds) || []).filter((id) => !comCert.has(id));
      status.clear();
      const respostas = await Promise.all(ids.map((id) => window.DMC_Api.get(API.certificado(id)).then((s) => [id, s]).catch(() => [id, null])));
      for (const [id, s] of respostas) {
        if (s && s.emitido && s.certificado) emitidos.push(s.certificado);
        else if (s) status.set(id, s);
      }
    }

    function pintarCertificados() {
      lista.removeAttribute('aria-busy');
      const pendentes = [...status.entries()];
      if (!emitidos.length && !pendentes.length) {
        lista.innerHTML = html`
          <div class="pf-vazio">
            <p class="pf-vazio__titulo">Nenhum certificado emitido ainda.</p>
            <p class="pf-vazio__texto">Os certificados aparecem aqui conforme você conclui os cursos liberados para a sua conta.</p>
            <div class="pf-vazio__acoes"><a class="dmc-btn dmc-btn--secondary" href="loja.html">Conhecer os cursos</a></div>
          </div>`;
        return;
      }
      const ordem = (s) => (s.elegivel ? 0 : 1);
      pendentes.sort((a, b) => ordem(a[1]) - ordem(b[1]));
      const aptos = pendentes.filter(([, s]) => s.elegivel);
      const demais = pendentes.filter(([, s]) => !s.elegivel);
      lista.innerHTML = html`
        <ul class="pf-dec-lista">
          ${aptos.map(([id, s]) => linhaPendente(id, s))}
          ${emitidos.map(linhaEmitido)}
          ${demais.map(([id, s]) => linhaPendente(id, s))}
        </ul>
        ${emitidos.length ? '' : html`<p class="pf-ajuda">Nenhum certificado emitido ainda.</p>`}`;
    }

    async function carregarDeclaracoes() {
      try {
        return await getOuNulo(API.declaracoes);
      } catch (_e) {
        return null;
      }
    }

    async function recarregarDeclaracoes() {
      const d = await carregarDeclaracoes();
      if (solicitar) montarSolicitar(solicitar, d, recarregarDeclaracoes);
      if (historico) montarHistorico(historico, d);
    }

    document.addEventListener('click', async (e) => {
      const copiarBtn = e.target.closest('[data-copiar]');
      if (copiarBtn) { await copiar(copiarBtn.getAttribute('data-copiar')); return; }
      const btn = e.target.closest('[data-emitir]');
      if (!btn || !lista.contains(btn)) return;
      const cursoId = btn.getAttribute('data-emitir');
      const s = status.get(cursoId);
      if (s && s.nomeOrigem === 'conta') {
        const ok = await dialogoNomeDaConta(s.nomePrevisto || '');
        if (!ok) return;
      }
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      try {
        const r = await window.DMC_Api.post(API.certificado(cursoId), {});
        if (r && r.certificado) {
          status.delete(cursoId);
          emitidos = [r.certificado, ...emitidos.filter((c) => c.codigo !== r.certificado.codigo)];
        }
        pintarCertificados();
        anunciar('Certificado emitido.', 'sucesso');
      } catch (err) {
        if (err && err.status === 409 && err.dados && Array.isArray(err.dados.pendencias) && s) {
          status.set(cursoId, { ...s, elegivel: false, pendencias: err.dados.pendencias });
          pintarCertificados();
        } else {
          btn.disabled = false;
          btn.removeAttribute('aria-busy');
        }
        const linha = lista.querySelector(`[data-curso="${CSS.escape(cursoId)}"]`);
        const alvo = linha ? linha.querySelector('div') : lista;
        const caixa = document.createElement('div');
        caixa.className = 'pf-alerta pf-alerta--erro';
        caixa.setAttribute('role', 'alert');
        caixa.innerHTML = html`<p>${(err && err.message) || 'Não foi possível emitir agora. Tente de novo.'}</p>${err && err.codigo === 'cadastro-incompleto' ? html`<p class="pf-alerta__acao"><a href="perfil.html#identificacao">Completar cadastro</a></p>` : ''}`;
        alvo.appendChild(caixa);
      }
    });

    // Carrega as três seções em paralelo e pinta todas no mesmo quadro: enquanto a lista está
    // aria-busy, Solicitar e Histórico ficam fora do layout (portal-declaracoes.css), então nada
    // já visível é empurrado quando os dados chegam (CLS).
    lista.setAttribute('aria-busy', 'true');
    const [falhaCert, decl] = await Promise.all([
      carregarCertificados().then(() => null, (err) => err || new Error('Falha ao carregar os certificados.')),
      carregarDeclaracoes()
    ]);
    if (solicitar) montarSolicitar(solicitar, decl, recarregarDeclaracoes);
    if (historico) montarHistorico(historico, decl);
    try {
      if (falhaCert) throw falhaCert;
      pintarCertificados();
    } catch (err) {
      lista.removeAttribute('aria-busy');
      if (UI() && typeof UI().erroCarga === 'function') UI().erroCarga(lista, err, { tentarDeNovo: () => window.location.reload() });
      else lista.textContent = 'Não foi possível carregar os certificados agora.';
    }
    if (ctx && ctx.main && window.location.hash) {
      const alvo = document.getElementById(window.location.hash.slice(1));
      if (alvo) alvo.scrollIntoView();
    }
  }

  function iniciar() {
    if (window.DMC_Portal && typeof window.DMC_Portal.iniciar === 'function') {
      return window.DMC_Portal.iniciar(boot, { pagina: 'certificados' });
    }
    return boot({});
  }

  // Apelido do boot legado (UX §6.9): quem chamava DMC_bootCertificados() cai aqui.
  window.DMC_bootCertificados = iniciar;
  iniciar();
})();
