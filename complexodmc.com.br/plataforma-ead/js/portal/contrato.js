/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/contrato.js (F4b)
   Contrato — PORTAL-UX.md §6.10 (visualizar e assinar), §8.4
   (comprovante de assinatura imprimível com QR), §12; PORTAL-API.md §6.8.4.

   contrato.html?id=<id>                 titular: documento + assinatura em 4 passos
   contrato.html?id=<id>&comprovante=1   comprovante de assinatura (folha em papel + QR)
   contrato.html?id=<id>&admin=1[&comprovante=1]   coordenação (só leitura e comprovante)

   O PDF não é embutido (CSP): [Abrir contrato (PDF)] por blob autenticado
   (DMC_UI.abrirArquivo, tipo refeito no cliente, D-47). O SHA-256 exibido é o
   que o servidor confere na assinatura. Senha e código do aplicativo nunca vão
   a rascunho (o formulário não tem data-pf-rascunho, D-47).
   ============================================================= */
(function () {
  'use strict';

  const API = Object.freeze({
    meus: '/portal/me/contratos',
    arquivo: (id) => `/portal/me/contratos/${encodeURIComponent(id)}/arquivo`,
    assinar: (id) => `/portal/me/contratos/${encodeURIComponent(id)}/assinar`,
    comprovante: (id) => `/portal/me/contratos/${encodeURIComponent(id)}/comprovante`,
    admin: (id) => `/portal/admin/contratos/${encodeURIComponent(id)}`,
    adminArquivo: (id) => `/portal/admin/contratos/${encodeURIComponent(id)}/arquivo`,
    adminComprovante: (id) => `/portal/admin/contratos/${encodeURIComponent(id)}/comprovante`
  });
  const UI = window.DMC_UI;
  if (!UI || !window.DMC_Portal) return;
  const html = UI.html;
  const cru = UI.cru;

  const ROTULO = Object.freeze({ pendente: 'Pendente', assinado: 'Assinado', cancelado: 'Cancelado' });
  const TOM = Object.freeze({ pendente: 'aviso', assinado: 'sucesso', cancelado: 'neutro' });
  const FATORES = Object.freeze({ sessao: 'sessão autenticada', senha: 'senha pessoal', totp: 'código do aplicativo autenticador' });
  const ID_RE = /^[a-f0-9]{24}$/;
  const urlAbsoluta = (rel) => new URL(rel, window.location.href).href;
  const dataHoraLonga = (iso) => (iso ? `${UI.fmt.data(iso)} às ${UI.fmt.hora(iso)}` : '—');

  function qr(texto) {
    const q = window.DMC_QR;
    if (!q || typeof q.svg !== 'function') return '';
    try {
      return html`<div class="pf-qr" role="img" aria-label="QR code para validar esta assinatura">${cru(q.svg(texto, { tamanho: 128, margem: 4 }))}</div>`;
    } catch (_e) {
      return '';
    }
  }

  function dado(rotulo, valor) {
    return html`<div><dt>${rotulo}</dt><dd>${valor == null || valor === '' ? '—' : valor}</dd></div>`;
  }

  // ---------------------------------------------------------------
  // Comprovante (folha em papel, §8.4)
  // ---------------------------------------------------------------
  function comprovanteHtml(c) {
    const url = urlAbsoluta(c.urlValidacao || `validar.html?codigo=${encodeURIComponent(c.codigoVerificacao || '')}`);
    const fatores = (c.fatores || []).map((f) => FATORES[f] || f).join(' + ');
    return html`<div class="pf-doc-acoes pf-nao-imprimir">
        <button type="button" class="dmc-btn dmc-btn--primary" data-doc-imprimir>Imprimir ou salvar em PDF</button>
        <a class="dmc-btn dmc-btn--secondary" href="${`validar.html?codigo=${encodeURIComponent(c.codigoVerificacao || '')}`}">Abrir a validação pública</a>
      </div>
      <article class="pf-documento pf-doc-comprovante" aria-labelledby="pf-doc-comp-titulo">
        <div class="pf-documento__cabeca">
          <span class="pf-doc-marca"><img src="../assets/images/rino-marca.webp" alt="" width="40" height="40" decoding="async"><span>Complexo <b>DMC</b></span></span>
          <h1 id="pf-doc-comp-titulo">Comprovante de assinatura eletrônica</h1>
        </div>
        <div class="pf-documento__corpo">
          <dl class="pf-doc-dados">
            ${dado('Contrato', c.titulo)}
            ${dado('Matrícula', c.matriculaNumero)}
            ${dado('Curso', c.cursoTitulo)}
            ${dado('Signatário (nome de registro)', c.signatario)}
            ${dado('Data e hora (horário de Brasília)', dataHoraLonga(c.assinadoEm))}
            ${dado('Método', 'Assinatura eletrônica simples, pela própria plataforma')}
            ${dado('Fatores de autenticação', fatores)}
            ${dado('Endereço de rede (truncado)', c.ipTruncado)}
            ${dado('Navegador', c.userAgent)}
            ${dado('Versão do texto de aceite', c.versaoTexto)}
            ${c.canceladoEm ? dado('Situação', `Cancelado em ${UI.fmt.data(c.canceladoEm)} (a assinatura registrada é preservada)`) : ''}
          </dl>
          <dl class="pf-doc-dados"><div><dt>SHA-256 do PDF assinado</dt><dd class="pf-doc-hash">${c.sha256Pdf}</dd></div></dl>
          <p class="pf-doc-comprovante__aceite">Texto de aceite registrado: “${c.textoAceite}”</p>
        </div>
        <div class="pf-documento__rodape">
          <div>
            <dl class="pf-doc-dados">
              ${dado('Código de verificação', c.codigoVerificacao)}
              ${dado('Selo', c.hashPrefixo)}
            </dl>
            <p class="pf-doc-comprovante__url">Confira a autenticidade em ${url}</p>
          </div>
          ${qr(url)}
        </div>
      </article>`;
  }

  async function mostrarComprovante(raiz, id, admin, ctx) {
    UI.esqueleto(raiz, { tipo: 'texto', linhas: 6 });
    try {
      const c = await window.DMC_Api.get(admin ? API.adminComprovante(id) : API.comprovante(id), { sinal: ctx.sinal });
      document.getElementById('pf-doc-titulo').textContent = 'Comprovante de assinatura';
      document.title = 'Comprovante de assinatura · Plataforma Complexo DMC';
      raiz.innerHTML = comprovanteHtml(c);
      raiz.setAttribute('aria-busy', 'false');
      const imprimir = raiz.querySelector('[data-doc-imprimir]');
      if (imprimir) imprimir.addEventListener('click', () => window.print());
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      UI.erroCarga(raiz, err, { tentarDeNovo: () => mostrarComprovante(raiz, id, admin, ctx) });
    }
  }

  // ---------------------------------------------------------------
  // Titular: documento + assinatura em 4 passos
  // ---------------------------------------------------------------
  function documentoHtml(c, { admin = false } = {}) {
    return html`<section class="pf-doc-secao" aria-labelledby="pf-doc-sec-documento">
      <h2 id="pf-doc-sec-documento">Documento</h2>
      <dl class="pf-doc-dados">
        ${dado('Situação', cru(UI.estado(ROTULO[c.status] || c.status, TOM[c.status] || 'neutro')))}
        ${dado('Matrícula', c.matriculaNumero)}
        ${dado('Curso', c.cursoTitulo)}
        ${dado('Disponibilizado em', c.disponivelEm ? UI.fmt.data(c.disponivelEm) : '—')}
        ${c.assinadoEm ? dado('Assinado em', dataHoraLonga(c.assinadoEm)) : ''}
        ${c.canceladoEm ? dado('Cancelado em', UI.fmt.data(c.canceladoEm)) : ''}
      </dl>
      <div class="pf-doc-acoes">
        <button type="button" class="dmc-btn dmc-btn--secondary" data-doc-abrir${admin ? ' data-doc-admin' : ''}>${UI.icone('pdf')}Abrir contrato (PDF)</button>
      </div>
      ${c.sha256Pdf ? html`<p class="pf-ajuda">Código SHA-256 do PDF (identifica esta versão do documento):</p><div class="pf-doc-hash">${cru(UI.codigo(c.sha256Pdf))}</div>` : ''}
    </section>`;
  }

  function assinaturaHtml(c, { aberto, doisFatores }) {
    return html`<section class="pf-doc-secao" id="assinar" aria-labelledby="pf-doc-sec-assinatura" tabindex="-1">
      <h2 id="pf-doc-sec-assinatura">Assinatura eletrônica</h2>
      <form id="pf-doc-form-assinar" novalidate>
        <ol class="pf-doc-assinatura">
          <li class="pf-doc-passo${aberto ? ' is-feito' : ''}" data-doc-passo="1">
            <p class="pf-doc-passo__titulo">Abra e leia o contrato.</p>
            <p class="pf-ajuda" data-doc-passo1-texto>${aberto
              ? 'Contrato aberto. Você pode seguir para o aceite.'
              : 'Use o botão “Abrir contrato (PDF)” acima. O aceite fica disponível depois de abrir, para que a versão assinada seja a mesma que você leu.'}</p>
          </li>
          <li class="pf-doc-passo${aberto ? '' : ' is-bloqueado'}" data-doc-passo="2">
            <p class="pf-doc-passo__titulo">Leia o texto de aceite.</p>
            <fieldset data-doc-etapa${aberto ? '' : ' disabled'}>
              <legend class="dmc-sr-only">Aceite dos termos</legend>
              <div class="pf-leitura"><p>${c.textoAceite || ''}</p></div>
              <label class="pf-check" data-alvo-excecao="rotulo-clicavel"><input type="checkbox" name="aceite" id="pf-doc-aceite"> <span>Li e concordo com os termos deste contrato</span></label>
              <p class="pf-erro-campo" id="pf-doc-aceite-erro" hidden></p>
            </fieldset>
          </li>
          <li class="pf-doc-passo${aberto ? '' : ' is-bloqueado'}" data-doc-passo="3">
            <p class="pf-doc-passo__titulo">Confirme sua senha.</p>
            <fieldset data-doc-etapa${aberto ? '' : ' disabled'}>
              <legend class="dmc-sr-only">Confirmação de identidade</legend>
              <div class="pf-campo">
                <label class="pf-rotulo" for="pf-doc-senha">Senha atual</label>
                <input class="pf-input" type="password" id="pf-doc-senha" name="senha" autocomplete="current-password" aria-describedby="pf-doc-senha-erro">
                <p class="pf-erro-campo" id="pf-doc-senha-erro" hidden></p>
              </div>
              ${doisFatores ? html`<div class="pf-campo">
                <label class="pf-rotulo" for="pf-doc-codigo">Código do aplicativo</label>
                <input class="pf-input" type="text" id="pf-doc-codigo" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" aria-describedby="pf-doc-codigo-ajuda pf-doc-codigo-erro">
                <p class="pf-ajuda" id="pf-doc-codigo-ajuda">6 dígitos do aplicativo autenticador.</p>
                <p class="pf-erro-campo" id="pf-doc-codigo-erro" hidden></p>
              </div>` : ''}
            </fieldset>
          </li>
          <li class="pf-doc-passo${aberto ? '' : ' is-bloqueado'}" data-doc-passo="4">
            <p class="pf-doc-passo__titulo">Assine.</p>
            <div data-doc-aviso-passo4></div>
            <button type="submit" class="dmc-btn dmc-btn--primary" id="pf-doc-assinar"${aberto ? '' : ' disabled'}>Assinar contrato</button>
          </li>
        </ol>
      </form>
      <div class="pf-doc-resultado" data-doc-resultado aria-live="polite"></div>
    </section>`;
  }

  function assinadoHtml(c) {
    const comp = `contrato.html?id=${encodeURIComponent(c.id)}&comprovante=1`;
    return html`<section class="pf-doc-secao" aria-labelledby="pf-doc-sec-assinado">
      <h2 id="pf-doc-sec-assinado">Assinatura eletrônica</h2>
      <div class="pf-alerta pf-alerta--sucesso" role="status">${UI.icone('estadoSucesso')}
        <p>Assinado em ${dataHoraLonga(c.assinadoEm)} · Código de verificação ${c.codigoVerificacao}</p>
      </div>
      <div class="pf-doc-acoes">
        <a class="dmc-btn dmc-btn--primary" href="${comp}">Comprovante de assinatura</a>
        <a class="dmc-btn dmc-btn--secondary" href="${`validar.html?codigo=${encodeURIComponent(c.codigoVerificacao)}`}">Validação pública</a>
      </div>
    </section>`;
  }

  function erroNoCampo(id, texto) {
    const p = document.getElementById(`${id}-erro`);
    const input = document.getElementById(id);
    if (p) { p.textContent = texto || ''; p.hidden = !texto; }
    if (input) {
      if (texto) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    }
  }

  async function boot(ctx) {
    const raiz = document.getElementById('pf-doc-contrato');
    const tituloEl = document.getElementById('pf-doc-titulo');
    if (!raiz) return;
    const id = ctx.params.get('id') || '';
    const admin = ctx.papel === 'admin' && ctx.params.get('admin') === '1';
    if (!ID_RE.test(id)) {
      UI.estadoVazio(raiz, { titulo: 'Contrato não encontrado.', texto: 'Confira o endereço ou volte à lista de contratos.', acao: { rotulo: 'Ver contratos', href: 'contratos.html' } });
      return;
    }
    if (ctx.params.get('comprovante') === '1') { await mostrarComprovante(raiz, id, admin, ctx); return; }

    let c = null;
    let abertoNestaVisita = false;
    const doisFatores = !!(ctx.user && ctx.user.doisFatoresAtivo);

    async function carregar() {
      UI.esqueleto(raiz, { tipo: 'texto', linhas: 5 });
      try {
        if (admin) {
          c = (await window.DMC_Api.get(API.admin(id), { sinal: ctx.sinal })).contrato;
        } else {
          const r = await window.DMC_Api.get(API.meus, { sinal: ctx.sinal });
          c = (r.itens || []).find((x) => x.id === id) || null;
        }
        if (!c) {
              UI.estadoVazio(raiz, { titulo: 'Contrato não encontrado.', texto: 'Ele pode ter sido retirado pela coordenação. Volte à lista de contratos.', acao: { rotulo: 'Ver contratos', href: 'contratos.html' } });
          return;
        }
        desenhar();
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        UI.erroCarga(raiz, err, { tentarDeNovo: carregar });
      }
    }

    function desenhar() {
      tituloEl.textContent = c.titulo;
      document.title = `${c.titulo} · Plataforma Complexo DMC`;
      const partes = [html`<p class="pf-cabecalho__desc pf-doc-subtitulo">Matrícula ${c.matriculaNumero || '—'} · ${c.cursoTitulo || 'Curso'}${c.disponivelEm ? ` · disponibilizado em ${UI.fmt.data(c.disponivelEm)}` : ''}</p>`, documentoHtml(c, { admin })];
      if (c.status === 'pendente' && !admin) partes.push(assinaturaHtml(c, { aberto: c.visualizado || abertoNestaVisita, doisFatores }));
      else if (c.codigoVerificacao) partes.push(assinadoHtml(c));
      else if (c.status === 'cancelado') partes.push(html`<div class="pf-alerta pf-alerta--info pf-doc-secao">${UI.icone('estadoInfo')}<p>Este contrato foi cancelado pela coordenação e não pode mais ser assinado.</p></div>`);
      raiz.innerHTML = html`${partes}`;
      raiz.setAttribute('aria-busy', 'false');
      ligar();
      if (window.location.hash === '#assinar') {
        const sec = document.getElementById('assinar');
        if (sec) sec.focus();
      }
    }

    function liberarPassos() {
      abertoNestaVisita = true;
      raiz.querySelectorAll('[data-doc-etapa]').forEach((f) => { f.disabled = false; });
      raiz.querySelectorAll('.pf-doc-passo').forEach((li) => li.classList.remove('is-bloqueado'));
      const p1 = raiz.querySelector('[data-doc-passo="1"]');
      if (p1) p1.classList.add('is-feito');
      const t = raiz.querySelector('[data-doc-passo1-texto]');
      if (t) t.textContent = 'Contrato aberto. Você pode seguir para o aceite.';
      const b = document.getElementById('pf-doc-assinar');
      if (b) b.disabled = false;
    }

    function ligar() {
      const abrir = raiz.querySelector('[data-doc-abrir]');
      if (abrir) {
        abrir.addEventListener('click', async () => {
          UI.ocupado(abrir, true, 'Abrindo…');
          try {
            await UI.abrirArquivo(admin ? API.adminArquivo(c.id) : API.arquivo(c.id), { nome: `contrato-${c.matriculaNumero || c.id}.pdf` });
            if (!admin && c.status === 'pendente') {
              liberarPassos();
              UI.anunciar('Contrato aberto. O aceite está disponível.');
            }
          } catch (err) {
            UI.toast(err && err.message ? err.message : 'Não foi possível abrir o contrato.', { tipo: 'erro' });
          } finally {
            UI.ocupado(abrir, false);
          }
        });
      }
      const form = document.getElementById('pf-doc-form-assinar');
      if (form) form.addEventListener('submit', (e) => { e.preventDefault(); enviarAssinatura(); });
    }

    function mostrarAvisoPasso4(tom, texto, acao) {
      const el = raiz.querySelector('[data-doc-aviso-passo4]');
      if (!el) return;
      if (!texto) { el.replaceChildren(); return; }
      UI.alerta(el, { tom, texto, acao });
    }

    async function enviarAssinatura() {
      const aceite = document.getElementById('pf-doc-aceite');
      const senha = document.getElementById('pf-doc-senha');
      const codigo = document.getElementById('pf-doc-codigo');
      erroNoCampo('pf-doc-aceite', null);
      erroNoCampo('pf-doc-senha', null);
      if (codigo) erroNoCampo('pf-doc-codigo', null);
      mostrarAvisoPasso4(null, null);
      let primeiro = null;
      if (!aceite.checked) { erroNoCampo('pf-doc-aceite', 'Marque “Li e concordo com os termos deste contrato”.'); primeiro = primeiro || aceite; }
      if (!senha.value) { erroNoCampo('pf-doc-senha', 'Digite a sua senha.'); primeiro = primeiro || senha; }
      if (codigo && !/^\d{6}$/.test(codigo.value.replace(/\s/g, ''))) { erroNoCampo('pf-doc-codigo', 'Digite os 6 dígitos do aplicativo.'); primeiro = primeiro || codigo; }
      if (primeiro) { primeiro.focus(); return; }

      const ok = await UI.confirmar({
        titulo: 'Assinar o contrato',
        texto: 'Ficam registrados: seu nome, a data e a hora (horário de Brasília), o endereço de rede da conexão, a identificação do navegador e o código do documento (SHA-256).',
        rotuloConfirmar: 'Assinar', rotuloCancelar: 'Cancelar'
      });
      if (!ok) return;
      const botao = document.getElementById('pf-doc-assinar');
      UI.ocupado(botao, true, 'Assinando…');
      try {
        const corpo = { aceite: true, sha256Pdf: c.sha256Pdf, senha: senha.value };
        if (codigo) corpo.codigo = codigo.value.replace(/\s/g, '');
        const r = await window.DMC_Api.post(API.assinar(c.id), corpo);
        senha.value = '';
        if (codigo) codigo.value = '';
        c = Object.assign({}, c, { status: 'assinado', assinadoEm: r.assinadoEm, codigoVerificacao: r.codigoVerificacao, hashPrefixo: r.hashPrefixo });
        UI.toast('Contrato assinado.', { tipo: 'sucesso' });
        desenhar();
        if (window.DMC_Shell && window.DMC_Shell.banner && typeof window.DMC_Shell.banner.atualizar === 'function') {
          try { await window.DMC_Shell.banner.atualizar(); } catch (_e) { /* faixa se atualiza na próxima página */ }
        }
      } catch (err) {
        UI.ocupado(botao, false);
        tratarErro(err);
      }
    }

    function tratarErro(err) {
      const codigo = err && err.codigo;
      const campos = (err && err.campos) || {};
      if (campos.senha) { erroNoCampo('pf-doc-senha', campos.senha === 'Digite a sua senha.' ? campos.senha : 'Senha incorreta.'); document.getElementById('pf-doc-senha').focus(); return; }
      if (campos.codigo) { erroNoCampo('pf-doc-codigo', 'Código inválido.'); const el = document.getElementById('pf-doc-codigo'); if (el) el.focus(); return; }
      if (campos.aceite) { erroNoCampo('pf-doc-aceite', campos.aceite); return; }
      if (codigo === 'abra-o-contrato-antes') {
        abertoNestaVisita = false; c.visualizado = false; desenhar();
        mostrarAvisoPasso4('aviso', 'Abra o contrato antes de assinar.');
        return;
      }
      if (codigo === 'contrato-alterado') {
        abertoNestaVisita = false;
        carregar().then(() => mostrarAvisoPasso4('aviso', 'O documento mudou desde que foi aberto. Abra novamente.'));
        return;
      }
      if (codigo === 'contrato-nao-pendente') {
        carregar().then(() => UI.toast('Este contrato não está mais pendente.', { tipo: 'aviso' }));
        return;
      }
      if (codigo === 'cadastro-incompleto') {
        mostrarAvisoPasso4('aviso', 'Complete seu cadastro antes de assinar: nome de registro e CPF ou passaporte.', { rotulo: 'Completar cadastro', href: 'perfil.html#identificacao' });
        return;
      }
      if (codigo === 'reautenticacao-necessaria') {
        mostrarAvisoPasso4('info', err.message, { rotulo: 'Falar com o atendimento', href: 'atendimentos.html?novo=1' });
        return;
      }
      mostrarAvisoPasso4('erro', (err && err.message) || 'Não foi possível assinar agora. Tente de novo em instantes.');
    }

    await carregar();
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'contratos' });
})();
