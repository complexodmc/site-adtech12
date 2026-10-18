/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/documentos.js (F4b)
   Documentos pessoais — PORTAL-UX.md §6.8; PORTAL-API.md §6.8.3.
   Checklist dos tipos exigidos (siglas DOC, DIP, CERT, HIS, RES e
   outras vindas da configuração), situação Não enviado · Em revisão ·
   Aprovado · Pendente (com o motivo da secretaria), envio e reenvio
   por DMC_UI.upload (PDF/JPG/PNG até 4 MB; o servidor confere pelos
   bytes) e "Ver arquivo" por download autenticado (DMC_UI.abrirArquivo).
   HTML só por DMC_UI.html; sem script inline nem on*=.
   ============================================================= */
(function () {
  'use strict';

  const API = Object.freeze({
    lista: '/portal/me/documentos',
    envio: (tipoId) => `/portal/me/documentos/tipos/${encodeURIComponent(tipoId)}/envio`,
    arquivo: (envioId) => `/portal/me/documentos/envios/${encodeURIComponent(envioId)}/arquivo`
  });
  const UI = window.DMC_UI;
  if (!UI || !window.DMC_Portal) return;
  const html = UI.html;

  const ROTULO = Object.freeze({ nao_enviado: 'Não enviado', em_revisao: 'Em revisão', aprovado: 'Aprovado', pendente: 'Pendente' });
  const TOM = Object.freeze({ nao_enviado: 'neutro', em_revisao: 'info', aprovado: 'sucesso', pendente: 'aviso' });
  const BASE_LEGAL = 'Base legal: execução do contrato de matrícula. O arquivo fica guardado pelo prazo da política de retenção.';
  const ROTULO_FORMATO = { pdf: 'PDF', jpg: 'JPG', png: 'PNG' };

  const listaFormatos = (fs) => {
    const r = (fs || []).map((f) => ROTULO_FORMATO[f] || String(f).toUpperCase());
    return r.length <= 1 ? (r[0] || '') : `${r.slice(0, -1).join(', ')} ou ${r[r.length - 1]}`;
  };
  const megas = (n) => `${Math.round((Number(n) || 0) / (1024 * 1024))} MB`;

  function linha(i, limite) {
    const acoes = [];
    if (i.temArquivo && i.envioId) {
      acoes.push(html`<button type="button" class="dmc-btn dmc-btn--secondary" data-doc-ver="${i.envioId}" data-doc-nome="${i.sigla}-v${i.numeroEnvio}">Ver arquivo</button>`);
    }
    if (i.podeEnviar) {
      const rot = i.status === 'nao_enviado' ? 'Enviar' : 'Reenviar';
      const classe = i.status === 'em_revisao' ? 'dmc-btn dmc-btn--secondary' : 'dmc-btn dmc-btn--primary';
      acoes.push(html`<button type="button" class="${classe}" data-doc-enviar="${i.tipoId}" aria-label="${rot}: ${i.nome}">${rot}</button>`);
    }
    const nota = i.status === 'aprovado'
      ? html`<p class="pf-doc-item__nota">Para trocar um documento aprovado, fale com a secretaria.</p>`
      : (!i.exigido ? html`<p class="pf-doc-item__nota">Não é mais exigido para a sua matrícula.</p>` : '');
    const envio = i.enviadoEm ? html`<span class="pf-doc-meta">${i.numeroEnvio > 1 ? `${i.numeroEnvio}º envio` : '1º envio'} em ${UI.fmt.dataHora(i.enviadoEm)}${i.revisadoEm ? ` · revisado em ${UI.fmt.data(i.revisadoEm)}` : ''}</span>` : '';
    const orientacao = [i.descricao, `${listaFormatos(i.formatos)}, até ${megas(limite)}.`].filter(Boolean).join(' ');
    return html`<li class="pf-doc-item" data-doc-tipo="${i.tipoId}" data-doc-status="${i.status}">
      <span class="pf-doc-sigla" aria-hidden="true">${i.sigla}</span>
      <div>
        <p class="pf-doc-item__nome"><span class="dmc-sr-only">${i.sigla} · </span>${i.nome}${i.obrigatorio ? '' : html` <span class="pf-doc-meta">(opcional)</span>`}</p>
        <p class="pf-doc-item__desc">${orientacao}</p>
        ${envio}
        ${i.status === 'pendente' && i.motivo ? html`<div class="pf-alerta pf-alerta--aviso pf-alerta--compacto pf-doc-item__motivo">${UI.icone('estadoAviso')}<p>Motivo: ${i.motivo}</p></div>` : ''}
      </div>
      <div class="pf-doc-item__situacao">${UI.estado(ROTULO[i.status] || i.status, TOM[i.status] || 'neutro')}</div>
      <div class="pf-doc-item__acoes">${acoes}${nota}</div>
    </li>`;
  }

  async function boot(ctx) {
    const conteudo = document.getElementById('pf-doc-conteudo');
    const resumoEl = document.getElementById('pf-doc-resumo');
    if (!conteudo) return;
    let dados = null;

    function desenhar() {
      const itens = dados.itens || [];
      const r = dados.resumo || {};
      if (!itens.length) {
        resumoEl.hidden = true;
        UI.estadoVazio(conteudo, {
          icone: 'navDocumentos', titulo: 'Nenhum documento exigido no momento.',
          texto: 'Quando a coordenação pedir documentos para a sua matrícula, eles aparecem aqui.'
        });
        return;
      }
      if (r.exigidos) {
        const pct = Math.round((r.aprovados / r.exigidos) * 100);
        resumoEl.innerHTML = html`<p class="pf-doc-resumo__texto">${r.aprovados} de ${r.exigidos} aprovados</p>${UI.progresso(pct, { rotulo: `${r.aprovados} de ${r.exigidos} documentos aprovados` })}`;
        resumoEl.hidden = false;
      } else {
        resumoEl.hidden = true;
      }
      conteudo.innerHTML = html`<ul class="pf-doc-lista">${itens.map((i) => linha(i, dados.limiteBytes))}</ul>`;
      conteudo.setAttribute('aria-busy', 'false');
    }

    async function carregar() {
      UI.esqueleto(conteudo, { tipo: 'lista', linhas: 3 });
      try {
        dados = await window.DMC_Api.get(API.lista, { sinal: ctx.sinal });
        desenhar();
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        resumoEl.hidden = true;
        UI.erroCarga(conteudo, err, { tentarDeNovo: carregar });
      }
    }

    async function abrirEnvio(tipoId, gatilho) {
      const item = (dados && dados.itens || []).find((i) => i.tipoId === tipoId);
      if (!item) return;
      const resultado = await UI.upload({
        titulo: `${item.status === 'nao_enviado' ? 'Enviar' : 'Reenviar'}: ${item.nome}`,
        formatos: item.formatos && item.formatos.length ? item.formatos : dados.formatos,
        maxBytes: dados.limiteBytes,
        avisoBaseLegal: BASE_LEGAL,
        rotuloEnviar: 'Enviar documento',
        enviar: async (arquivo) => {
          try {
            return await window.DMC_Api.upload(API.envio(tipoId), arquivo, arquivo.type || 'application/octet-stream');
          } catch (err) {
            if (err && err.codigo === 'pdf-ativo') {
              const e = new Error('Este PDF não pode ser aceito. Gere um novo PDF e tente de novo.');
              e.status = 415;
              throw e;
            }
            if (err && err.status === 415 && !err.message) err.message = `Formato não aceito. Envie ${listaFormatos(item.formatos)}.`;
            throw err;
          }
        }
      });
      if (!resultado) { if (gatilho) gatilho.focus(); return; }
      UI.toast('Documento enviado. A secretaria vai revisar.', { tipo: 'sucesso' });
      await carregar();
      const alvo = conteudo.querySelector(`[data-doc-tipo="${CSS.escape(tipoId)}"] button`);
      if (alvo) alvo.focus();
    }

    conteudo.addEventListener('click', async (e) => {
      const enviar = e.target.closest('[data-doc-enviar]');
      if (enviar) { abrirEnvio(enviar.getAttribute('data-doc-enviar'), enviar); return; }
      const ver = e.target.closest('[data-doc-ver]');
      if (ver) {
        UI.ocupado(ver, true, 'Abrindo…');
        try {
          await UI.abrirArquivo(API.arquivo(ver.getAttribute('data-doc-ver')), { nome: ver.getAttribute('data-doc-nome') });
        } catch (err) {
          UI.toast(err && err.message ? err.message : 'Não foi possível abrir o arquivo.', { tipo: 'erro' });
        } finally {
          UI.ocupado(ver, false);
        }
      }
    });

    await carregar();
  }

  window.DMC_Portal.iniciar(boot, { pagina: 'documentos' });
})();
