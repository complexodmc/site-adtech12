/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/validar.js
   Validação pública de documentos (validar.html?codigo=) — fatia F3b.
   Spec: docs/dmc/PORTAL-UX.md §8.1 · PORTAL-API.md §6.7.6.

   Sem login e sem dado pessoal: a resposta do servidor traz só tipo,
   data, iniciais do titular, curso/ano e o selo abreviado. "Conferir nome"
   pergunta ao servidor se um nome confere (nunca devolve o nome).
   Códigos aceitos: DMC-XXXX-XXXX (certificado) e DEC|FRQ|AVL|CTR-XXXX-XXXX-XXXX.
   ============================================================= */
(function () {
  'use strict';

  const API = Object.freeze({
    validar: (c) => `/portal/validar/${encodeURIComponent(c)}`,
    conferir: (c) => `/portal/validar/${encodeURIComponent(c)}/conferir`
  });
  const RE_CODIGO = /^(DMC-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}|(DEC|FRQ|AVL|CTR)(-[2-9A-HJ-NP-Z]{4}){3})$/;

  const ROTULOS_TIPO = {
    certificado: 'Certificado',
    declaracao: 'Declaração',
    frequencia: 'Comprovante de frequência',
    avaliacao: 'Comprovante de avaliação',
    contrato: 'Contrato assinado'
  };

  const html = (p, ...v) => window.DMC_UI.html(p, ...v);
  const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtData = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? FMT_DATA.format(d) : '—';
  };
  const normalizar = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

  /** Base da API (DMC_Api quando carregado; senão /api). */
  const base = () => (window.DMC_API_BASE || '/api').replace(/\/$/, '');

  async function pedir(caminho, init) {
    const r = await fetch(base() + caminho, { headers: { Accept: 'application/json', ...(init && init.body ? { 'Content-Type': 'application/json' } : {}) }, ...init });
    let corpo = null;
    try { corpo = await r.json(); } catch (_e) { corpo = null; }
    return { status: r.status, corpo };
  }

  function linhaDetalhe(rotulo, valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    return html`<dt>${rotulo}</dt><dd>${valor}</dd>`;
  }

  function desenharValido(el, r) {
    const tipo = r.rotulo || ROTULOS_TIPO[r.tipo] || 'Documento';
    const d = r.detalhes || {};
    const situacao = r.situacao || 'valido';
    let aviso = '';
    if (situacao === 'revogado') aviso = html`<div class="pf-alerta pf-alerta--aviso" role="status"><p>Este documento foi revogado${d.revogadaEm ? ` em ${fmtData(d.revogadaEm)}` : ''}.</p></div>`;
    else if (situacao === 'cancelado') aviso = html`<div class="pf-alerta pf-alerta--aviso" role="status"><p>Este documento foi cancelado${d.canceladoEm ? ` em ${fmtData(d.canceladoEm)}` : ''}.</p></div>`;
    else if (situacao === 'anulado') aviso = html`<div class="pf-alerta pf-alerta--aviso" role="status"><p>Este registro foi anulado${d.anuladoEm ? ` em ${fmtData(d.anuladoEm)}` : ''}.</p></div>`;
    // Selo (A08): "Documento válido" só com integro === true. false → "Não confere" + alerta;
    // null → aviso explícito (selo não verificável), e o certificado legado sem selo diz o que é.
    const integro = r.integro === true ? true : r.integro === false ? false : null;
    const legado = integro === null && r.tipo === 'certificado' && !r.hashPrefixo;
    let integridade = '';
    if (integro === false) integridade = html`<div class="pf-alerta pf-alerta--erro" role="alert" data-selo="nao-confere"><p>O registro deste documento não confere com o selo de emissão. Fale com a coordenação antes de aceitá-lo.</p></div>`;
    else if (legado) integridade = html`<div class="pf-alerta" role="status" data-selo="anterior"><p>Este certificado foi emitido antes da verificação por selo: os dados deste registro não podem ser conferidos por ele. Em caso de dúvida, fale com a coordenação.</p></div>`;
    else if (integro === null) integridade = html`<div class="pf-alerta pf-alerta--aviso" role="alert" data-selo="nao-verificado"><p>Não foi possível verificar o selo de emissão deste documento. Fale com a coordenação antes de aceitá-lo.</p></div>`;
    const selo = r.hashPrefixo
      ? html`<span class="pf-dec-cert__codigo">${r.hashPrefixo}</span> <span class="pf-ajuda">Compare com o código impresso no documento.</span>`
      : (legado ? 'Emitido antes da verificação por selo' : 'Ausente');
    let marcador;
    if (integro === false) marcador = html`<span class="pf-estado pf-estado--erro">Não confere</span>`;
    else if (situacao !== 'valido') marcador = html`<span class="pf-estado pf-estado--aviso">Documento ${situacao === 'revogado' ? 'revogado' : situacao === 'cancelado' ? 'cancelado' : 'anulado'}</span>`;
    else if (integro === null && !legado) marcador = html`<span class="pf-estado pf-estado--aviso">Selo não verificado</span>`;
    else marcador = html`<span class="pf-estado pf-estado--sucesso">Documento válido</span>`;
    el.innerHTML = html`
      <section class="pf-dec-resultado" aria-labelledby="pf-dec-res-titulo">
        <h2 class="pf-secao-titulo" id="pf-dec-res-titulo">${marcador}</h2>
        ${aviso}${integridade}
        <dl class="pf-dec-resultado__dados">
          ${linhaDetalhe('Tipo', tipo)}
          ${linhaDetalhe(r.tipo === 'contrato' ? 'Assinado em' : 'Emitido em', fmtData(d.assinadoEm || r.emitidoEm))}
          ${linhaDetalhe('Titular', r.iniciais || '—')}
          ${linhaDetalhe('Curso', d.tituloCurso || d.curso || null)}
          ${linhaDetalhe('Nível', d.nivelRotulo || null)}
          ${linhaDetalhe('Carga horária', d.cargaHoraria || null)}
          ${linhaDetalhe('Ano de referência', d.ano ? String(d.ano) : null)}
          ${linhaDetalhe('Emissor', r.emissor || 'Complexo DMC')}
          ${linhaDetalhe('Código', r.codigo)}
          <dt>Selo</dt><dd>${selo}</dd>
        </dl>
        <form class="pf-dec-validar__form" id="pf-dec-conferir" novalidate>
          <div class="pf-dec-validar__linha">
            <div class="pf-campo">
              <label class="pf-rotulo" for="pf-dec-nome">Conferir nome do titular</label>
              <input class="pf-input" id="pf-dec-nome" name="nome" type="text" autocomplete="off" maxlength="200" aria-describedby="pf-dec-conferir-res">
            </div>
            <button type="submit" class="dmc-btn dmc-btn--secondary">Conferir</button>
          </div>
          <p class="pf-ajuda" id="pf-dec-conferir-res" aria-live="polite"></p>
        </form>
      </section>`;
    const form = el.querySelector('#pf-dec-conferir');
    const saida = el.querySelector('#pf-dec-conferir-res');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = String(form.nome.value || '').trim();
      if (nome.length < 2) { saida.textContent = 'Digite o nome completo do titular.'; return; }
      const botao = form.querySelector('button');
      botao.disabled = true;
      try {
        const { status, corpo } = await pedir(API.conferir(r.codigo), { method: 'POST', body: JSON.stringify({ nome }) });
        if (status === 429) saida.textContent = 'Muitas consultas seguidas. Tente em alguns minutos.';
        else if (status === 200 && corpo) saida.textContent = corpo.confere ? 'O nome confere com o titular deste documento.' : 'O nome não confere.';
        else saida.textContent = 'Não foi possível conferir agora. Tente de novo.';
      } catch (_e) {
        saida.textContent = 'Não foi possível conferir agora. Verifique sua conexão.';
      } finally {
        botao.disabled = false;
      }
    });
  }

  async function validar(codigo, el) {
    el.innerHTML = html`<p class="pf-ajuda" role="status">Consultando…</p>`;
    if (!RE_CODIGO.test(codigo)) {
      el.innerHTML = html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>Não encontramos documento com este código. Confira as letras e os números.</p></div>`;
      return;
    }
    try {
      const { status, corpo } = await pedir(API.validar(codigo));
      if (status === 200 && corpo && corpo.valido) desenharValido(el, corpo);
      else if (status === 429) el.innerHTML = html`<div class="pf-alerta pf-alerta--aviso" role="alert"><p>Muitas consultas seguidas. Tente em alguns minutos.</p></div>`;
      else if (status === 404) el.innerHTML = html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>Não encontramos documento com este código. Confira as letras e os números.</p></div>`;
      else el.innerHTML = html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>Não foi possível consultar agora. Tente de novo em instantes.</p></div>`;
    } catch (_e) {
      el.innerHTML = html`<div class="pf-alerta pf-alerta--erro" role="alert"><p>Não foi possível consultar agora. Verifique sua conexão.</p></div>`;
    }
    const titulo = el.querySelector('h2');
    if (titulo) { titulo.setAttribute('tabindex', '-1'); titulo.focus(); }
  }

  function boot() {
    const form = document.getElementById('pf-dec-validar-form');
    const campo = document.getElementById('pf-dec-codigo');
    const resultado = document.getElementById('pf-dec-resultado');
    if (!form || !campo || !resultado) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const codigo = normalizar(campo.value);
      campo.value = codigo;
      const url = new URL(window.location.href);
      url.searchParams.set('codigo', codigo);
      window.history.replaceState(null, '', url.pathname + url.search);
      validar(codigo, resultado);
    });
    const inicial = normalizar(new URLSearchParams(window.location.search).get('codigo'));
    if (inicial) {
      campo.value = inicial;
      validar(inicial, resultado);
    }
  }

  if (window.DMC_Portal && typeof window.DMC_Portal.iniciar === 'function') {
    window.DMC_Portal.iniciar(boot, { pagina: 'validar', modo: 'publica' });
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
