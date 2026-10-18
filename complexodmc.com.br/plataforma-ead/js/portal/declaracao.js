/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/declaracao.js
   Documento imprimível — fatia F3b. Dois modos, pelo body[data-pagina]:
   - "declaracao"  → declaracao.html?id=<id> (titular ou coordenação):
                     GET /portal/me/declaracoes/:id (admin: /portal/admin/declaracoes/:id)
   - "certificado" → certificado.html?codigo=DMC-… (pública; D5: o link antigo
                     continua validando e imprimindo): GET /certificados/validar/:codigo
                     (legado, inalterado) + GET /portal/validar/:codigo (selo abreviado).
   Spec: docs/dmc/PORTAL-UX.md §8.2, §8.3, §12 · PORTAL-API.md §6.7.5–§6.7.7, §8.9.
   Folha A4 em papel; rodapé com código, QR (DMC_QR, 29 mm, margem 4) e URL
   de validação, e o selo abreviado. Texto sóbrio, montado só com os dados
   congelados no servidor; nada afirma reconhecimento pelo MEC.
   ============================================================= */
(function () {
  'use strict';

  const API = Object.freeze({
    minha: (id) => `/portal/me/declaracoes/${encodeURIComponent(id)}`,
    admin: (id) => `/portal/admin/declaracoes/${encodeURIComponent(id)}`,
    certLegado: (c) => `/certificados/validar/${encodeURIComponent(c)}`,
    despacho: (c) => `/portal/validar/${encodeURIComponent(c)}`
  });

  const UI = () => window.DMC_UI;
  const html = (p, ...v) => UI().html(p, ...v);
  const cru = (s) => UI().cru(s);
  const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  const FMT_LONGA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric' });
  const data = (iso, longa) => {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return '—';
    return (longa ? FMT_LONGA : FMT_DATA).format(d);
  };
  const pct = (n) => (typeof n === 'number' ? `${String(Math.round(n * 10) / 10).replace('.', ',')}%` : null);
  const horas = (n) => (typeof n === 'number' ? `${String(n).replace('.', ',')} h` : null);
  const moeda = (centavos) => (typeof centavos === 'number'
    ? (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—');
  const urlAbsoluta = (rel) => new URL(rel, window.location.href).href;
  const LATO = 'Pós-graduação lato sensu';

  function qr(texto) {
    const q = window.DMC_QR;
    if (!q || typeof q.svg !== 'function') return '';
    try {
      return html`<div class="pf-qr pf-dec-qr" role="img" aria-label="QR code de validação">${cru(q.svg(texto, { tamanho: 128, margem: 4 }))}</div>`;
    } catch (_e) {
      return '';
    }
  }

  function cabecalho(titulo) {
    return html`
      <div class="pf-documento__cabeca">
        <div class="pf-dec-marca">
          <img src="../assets/images/rino-marca.webp" alt="" width="40" height="40" decoding="async">
          <span class="pf-dec-marca__nome">Complexo <b>DMC</b></span>
        </div>
        <h1 class="pf-dec-doc__titulo">${titulo}</h1>
      </div>`;
  }

  function rodape({ codigo, emitidaEm, hashPrefixo, semSeloTexto, urlRel }) {
    const url = urlAbsoluta(urlRel);
    return html`
      <div class="pf-documento__rodape">
        <div>
          <div class="pf-dec-doc__campos">
            <p><span class="pf-dec-doc__rotulo">Código de validação</span><span class="pf-dec-doc__valor">${codigo}</span></p>
            <p><span class="pf-dec-doc__rotulo">Emitido em</span><span class="pf-dec-doc__valor">${data(emitidaEm)}</span></p>
            <p><span class="pf-dec-doc__rotulo">Selo</span><span class="pf-dec-doc__valor">${hashPrefixo || semSeloTexto || '—'}</span></p>
          </div>
          <p class="pf-dec-doc__url">Confira a autenticidade em ${url}</p>
        </div>
        ${qr(url)}
      </div>`;
  }

  /** Frase do curso com nível e, em lato sensu, a IES (UX §8.3; redação marcada para revisão jurídica, P14). */
  function frasesDoCurso(d) {
    if (d.nivelRotulo === LATO && d.iesNome) {
      const ato = d.iesAtoCredenciamento ? ` (${d.iesAtoCredenciamento})` : '';
      return { curso: `no curso de pós-graduação lato sensu ${d.cursoTitulo}, ofertado por ${d.iesNome}${ato}, com execução pelo Complexo DMC`, lato: true };
    }
    const nivel = d.nivelRotulo ? ` (${d.nivelRotulo})` : '';
    const carga = typeof d.cargaHorariaHoras === 'number' ? `, carga horária de ${horas(d.cargaHorariaHoras)}` : '';
    return { curso: `no curso ${d.cursoTitulo}${nivel}${carga}`, lato: false };
  }

  function corpoDeclaracao(doc) {
    const d = doc.dados || {};
    if (doc.tipo === 'quitacao_anual') {
      const titular = d.titular || {};
      const docto = titular.documento ? ` (${titular.documento.tipo === 'cpf' ? 'CPF' : 'Passaporte'} ${titular.documento.numero})` : '';
      const emissor = d.emissor ? `${d.emissor.razaoSocial}${d.emissor.cnpj ? `, CNPJ ${d.emissor.cnpj}` : ''}` : 'Complexo DMC';
      const itens = Array.isArray(d.itens) ? d.itens : [];
      return html`
        <p class="pf-dec-doc__texto">Declaramos que ${titular.nomeRegistro || ''}${docto} quitou os valores com vencimento em ${String(d.ano || doc.ano || '')} referentes aos serviços educacionais prestados por ${emissor}, conforme a relação abaixo.</p>
        <table class="pf-dec-tabela-itens">
          <caption class="dmc-sr-only">Pagamentos do ano</caption>
          <thead><tr><th scope="col">Pago em</th><th scope="col">Referência</th><th scope="col">NFS-e</th><th scope="col" class="pf-tabela__num">Valor</th></tr></thead>
          <tbody>${itens.map((i) => html`<tr><td>${data(i.pagoEm)}</td><td>${[i.rotuloTipo, i.cursoTitulo].filter(Boolean).join(' · ')}</td><td>${i.nfseNumero || '—'}</td><td class="pf-tabela__num">${moeda(i.valorPagoCentavos)}</td></tr>`)}</tbody>
          <tfoot><tr><th scope="row" colspan="3">Total pago no ano</th><td class="pf-tabela__num">${moeda(d.totalPagoCentavos)}</td></tr></tfoot>
        </table>`;
    }
    const nome = d.nomeTitular || '';
    const f = frasesDoCurso(d);
    const mat = d.matriculaNumero ? `, matrícula ${d.matriculaNumero}` : '';
    const turma = d.turmaCodigo ? `, turma ${d.turmaCodigo}` : '';
    const inicio = d.inicioEm ? `, com início em ${data(d.inicioEm)}` : '';
    if (doc.tipo === 'matricula') {
      return html`<p class="pf-dec-doc__texto">Declaramos que ${nome} está matriculado(a) ${f.curso}${mat}${turma}${inicio}.</p>`;
    }
    if (doc.tipo === 'frequencia') {
      const partes = [pct(d.aoVivoPct) ? `aulas ao vivo: ${pct(d.aoVivoPct)}` : null, pct(d.gravadoPct) ? `aulas gravadas: ${pct(d.gravadoPct)}` : null].filter(Boolean);
      return html`
        <p class="pf-dec-doc__texto">Declaramos que ${nome} está matriculado(a) ${f.curso}${mat}${turma}${inicio}, e registra frequência geral de ${pct(d.frequenciaPct) || '—'} até ${data(d.ate ? `${d.ate}T12:00:00Z` : null)}${partes.length ? ` (${partes.join('; ')})` : ''}.</p>`;
    }
    if (doc.tipo === 'conclusao') {
      const nota = typeof d.notaFinal === 'number' ? `, com nota final ${String(d.notaFinal).replace('.', ',')}` : '';
      const freq = pct(d.frequenciaPct) ? ` e frequência de ${pct(d.frequenciaPct)}` : '';
      return html`<p class="pf-dec-doc__texto">Declaramos que ${nome} concluiu o curso ${d.cursoTitulo}${d.nivelRotulo ? ` (${d.nivelRotulo})` : ''}${typeof d.cargaHorariaHoras === 'number' ? `, carga horária de ${horas(d.cargaHorariaHoras)}` : ''}${mat}, em ${data(d.concluidaEm)}${nota}${freq}.</p>`;
    }
    return html`<p class="pf-dec-doc__texto">Declaração.</p>`;
  }

  function desenharDeclaracao(el, doc) {
    const revogada = doc.revogada
      ? html`<div class="pf-alerta pf-alerta--aviso pf-dec-doc__marcadagua" role="status"><p>Esta declaração foi revogada${doc.revogadaEm ? ` em ${data(doc.revogadaEm)}` : ''} e não vale como documento.</p></div>`
      : '';
    el.innerHTML = html`
      <article class="pf-documento pf-escopo-claro" aria-labelledby="pf-dec-doc-titulo">
        ${cabecalho(doc.rotulo || 'Declaração')}
        <div class="pf-documento__corpo">
          ${revogada}
          ${corpoDeclaracao(doc)}
          <p class="pf-dec-doc__local">Emitida em ${data(doc.emitidaEm, true)}, pela Plataforma Complexo DMC.</p>
        </div>
        ${rodape({ codigo: doc.codigo, emitidaEm: doc.emitidaEm, hashPrefixo: doc.hashPrefixo, urlRel: `validar.html?codigo=${encodeURIComponent(doc.codigo)}` })}
      </article>`;
    const h1 = el.querySelector('h1');
    if (h1) h1.id = 'pf-dec-doc-titulo';
    document.title = `${doc.rotulo || 'Declaração'} · Plataforma Complexo DMC`;
  }

  function desenharCertificado(el, c, despacho) {
    const nivel = despacho && despacho.detalhes && despacho.detalhes.nivelRotulo ? despacho.detalhes.nivelRotulo : null;
    const hash = despacho ? despacho.hashPrefixo : null;
    const semSelo = despacho && despacho.valido && !hash ? 'Emitido antes da verificação por selo' : null;
    el.innerHTML = html`
      <article class="pf-documento pf-escopo-claro cert-doc" aria-labelledby="pf-dec-doc-titulo">
        ${cabecalho('Certificado')}
        <div class="pf-documento__corpo">
          <p class="pf-dec-doc__texto">Certificamos que</p>
          <p class="pf-dec-doc__nome cert-doc__nome">${c.nomeAluno}</p>
          <p class="pf-dec-doc__texto">concluiu o curso <strong>${c.tituloCurso}</strong>${nivel ? ` (${nivel})` : ''}${c.cargaHoraria ? `, com carga horária de ${c.cargaHoraria}` : ''}, oferecido pela Plataforma Complexo DMC.</p>
          <p class="pf-dec-doc__local">Emitido em ${data(c.emitidoEm, true)}.</p>
        </div>
        ${rodape({ codigo: c.codigo, emitidaEm: c.emitidoEm, hashPrefixo: hash, semSeloTexto: semSelo, urlRel: `validar.html?codigo=${encodeURIComponent(c.codigo)}` })}
      </article>`;
    const h1 = el.querySelector('h1');
    if (h1) h1.id = 'pf-dec-doc-titulo';
  }

  function ligarImpressao() {
    const b = document.getElementById('pf-dec-imprimir');
    if (!b) return;
    b.hidden = false;
    b.addEventListener('click', () => window.print());
  }

  function erro(el, titulo, texto) {
    el.removeAttribute('aria-busy');
    el.innerHTML = html`<div class="pf-vazio"><h1 class="pf-cabecalho__titulo">${titulo}</h1><p class="pf-vazio__texto">${texto}</p><div class="pf-vazio__acoes"><a class="dmc-btn dmc-btn--secondary" href="validar.html">Validar um documento</a></div></div>`;
  }

  async function bootCertificado() {
    const el = document.getElementById('cert-root');
    if (!el) return;
    const codigo = String(new URLSearchParams(window.location.search).get('codigo') || '').replace(/\s+/g, '').toUpperCase();
    if (!codigo) { erro(el, 'Certificado não localizado', 'Informe o código do certificado no endereço, no formato ?codigo=DMC-XXXX-XXXX.'); return; }
    const [legado, despacho] = await Promise.all([
      window.DMC_Api.get(API.certLegado(codigo)).catch(() => null),
      window.DMC_Api.get(API.despacho(codigo)).catch(() => null)
    ]);
    if (!legado || !legado.valido || !legado.certificado) {
      erro(el, 'Certificado não localizado', 'Nenhum certificado corresponde a este código. Confira se ele foi digitado corretamente.');
      return;
    }
    desenharCertificado(el, legado.certificado, despacho);
    ligarImpressao();
  }

  async function bootDeclaracao(ctx) {
    const el = document.getElementById('pf-dec-doc');
    if (!el) return;
    const id = String(new URLSearchParams(window.location.search).get('id') || '');
    if (!ctx || !ctx.user) {
      const next = `declaracao.html?id=${encodeURIComponent(id)}`;
      window.location.replace(`login.html?next=${encodeURIComponent(next)}`);
      return;
    }
    if (!/^[a-f0-9]{24}$/.test(id)) { erro(el, 'Declaração não encontrada', 'O endereço não traz uma declaração válida.'); return; }
    // Coordenação lê pela rota de admin (qualquer titular); o aluno, só a própria.
    const caminho = ctx.papel === 'admin' ? API.admin(id) : API.minha(id);
    const doc = await window.DMC_Api.get(caminho).catch(() => null);
    if (!doc) { erro(el, 'Declaração não encontrada', 'Ela não existe ou não pertence à sua conta.'); return; }
    el.removeAttribute('aria-busy');
    desenharDeclaracao(el, doc);
    ligarImpressao();
  }

  const pagina = document.body ? document.body.getAttribute('data-pagina') : '';
  const boot = pagina === 'certificado' ? bootCertificado : bootDeclaracao;
  if (window.DMC_Portal && typeof window.DMC_Portal.iniciar === 'function') {
    window.DMC_Portal.iniciar(boot, { pagina, modo: 'publica' });
  } else {
    const rodar = () => boot({});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rodar, { once: true }); else rodar();
  }
  // Apelido do boot legado (D5): quem chamava DMC_bootCertificadoPublico() cai aqui.
  if (pagina === 'certificado') window.DMC_bootCertificadoPublico = () => bootCertificado();
})();
