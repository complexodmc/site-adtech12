/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-conteudo.js (F1b)
   Backoffice — Cursos (#/cursos) e Plano de ensino
   (#/cursos/:id/plano?modulo=<id>). Expõe DMC_PlanoEnsino, que a F8
   embute no admin.html (UX DC-24).
   Spec: PORTAL-ACADEMICO.md §6.3, §7.7; PORTAL-UX.md §7.3 (com D-53);
   PORTAL-API.md §3.2 (PlanoEnsino, limites) e §6.5 (planos, PUT plano).

   DMC_PlanoEnsino.montar(el, { cursoId, moduloId, somenteLeitura = false })
     → Promise<{ destruir(): void }>
   Lê GET /portal/professor/cursos/:cursoId/planos; grava
   PUT /portal/professor/modulos/:moduloId/plano no blur do campo
   alterado, com `versao` (409 conflito-versao → [Recarregar]).
   ============================================================= */
(function () {
  'use strict';

  if (window.DMC_PlanoEnsino) return;

  const enc = encodeURIComponent;
  const API = {
    planos: (cursoId) => `/portal/professor/cursos/${enc(cursoId)}/planos`,
    plano: (moduloId) => `/portal/professor/modulos/${enc(moduloId)}/plano`
  };
  const LIMITES = { ementa: 8000, objetivos: 30, item: 500, referencias: 50, cronograma: 60, encontro: 60, tema: 300 };

  const ui = () => (window.DMC_Professor && window.DMC_Professor.ui) || window.DMC_UI;
  const api = () => (window.DMC_Professor && window.DMC_Professor.api) || window.DMC_Api;
  const H = (...a) => window.DMC_UI.html(...a);

  function anunciar(texto) {
    const u = ui();
    if (u && typeof u.anunciar === 'function') u.anunciar(texto);
  }
  function hora() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  }
  const linhas = (texto) => String(texto || '').split('\n').map((s) => s.trim()).filter(Boolean);

  // ---------------------------------------------------------------
  // DMC_PlanoEnsino
  // ---------------------------------------------------------------
  async function montar(el, opcoes) {
    const o = opcoes || {};
    const cursoId = o.cursoId;
    const moduloId = o.moduloId;
    const somenteLeitura = o.somenteLeitura === true;
    let destruido = false;
    let modulo = null;
    let plano = null;
    let aulas = [];

    el.setAttribute('aria-busy', 'true');
    el.innerHTML = H`<p class="pf-est-pe__nota">Carregando o plano de ensino…</p>`;

    async function carregar() {
      const dados = await api().get(API.planos(cursoId));
      modulo = ((dados && dados.modulos) || []).find((m) => m.id === moduloId) || null;
      if (!modulo) throw Object.assign(new Error('Módulo não encontrado neste curso.'), { status: 404 });
      plano = modulo.plano || { ementa: '', objetivos: [], bibliografia: { basica: [], complementar: [] }, cronograma: [], versao: 0 };
      aulas = modulo.aulas || [];
    }

    function htmlCronoLinha(l, i) {
      return H`<tr data-pe-linha="${String(i)}">
        <td><label class="dmc-sr-only" for="${`pe-enc-${i}`}">Encontro da linha ${i + 1}</label>
          <input class="pf-est-campo" id="${`pe-enc-${i}`}" data-pe-crono="encontro" maxlength="${LIMITES.encontro}" value="${l.encontro || ''}"${somenteLeitura ? H` readonly` : ''}></td>
        <td><label class="dmc-sr-only" for="${`pe-data-${i}`}">Data da linha ${i + 1} (opcional)</label>
          <input class="pf-est-campo" type="date" id="${`pe-data-${i}`}" data-pe-crono="data" value="${l.data || ''}"${somenteLeitura ? H` readonly` : ''}></td>
        <td><label class="dmc-sr-only" for="${`pe-tema-${i}`}">Tema da linha ${i + 1}</label>
          <input class="pf-est-campo" id="${`pe-tema-${i}`}" data-pe-crono="tema" maxlength="${LIMITES.tema}" value="${l.tema || ''}"${somenteLeitura ? H` readonly` : ''}></td>
        <td><label class="dmc-sr-only" for="${`pe-aula-${i}`}">Aula da linha ${i + 1} (opcional)</label>
          <select class="pf-est-campo" id="${`pe-aula-${i}`}" data-pe-crono="aulaId"${somenteLeitura ? H` disabled` : ''}>
            <option value="">Sem aula</option>
            ${aulas.map((a) => H`<option value="${a.id}"${a.id === l.aulaId ? H` selected` : ''}>${a.codigo ? `${a.codigo} · ` : ''}${a.titulo}</option>`)}
          </select></td>
        <td>${somenteLeitura ? '' : H`<button type="button" class="pf-est-pe__remover" data-pe-remover="${String(i)}">Remover<span class="dmc-sr-only"> a linha ${i + 1}</span></button>`}</td>
      </tr>`;
    }

    function desenhar() {
      const obj = plano.objetivos || [];
      const bib = plano.bibliografia || { basica: [], complementar: [] };
      const crono = plano.cronograma || [];
      const cheio = crono.length >= LIMITES.cronograma;
      el.innerHTML = H`<form class="pf-est-pe" data-pe-form novalidate>
        <p class="pf-est-pe__estado" role="status" data-pe-estado>${plano.atualizadoEm ? `Última gravação em ${new Date(plano.atualizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'Ainda não gravado.'}</p>
        <div class="pf-est-pe__erro" data-pe-erro role="alert" hidden></div>
        <div class="pf-est-pe__campo">
          <label class="pf-est-campo__rotulo" for="pe-ementa">Ementa</label>
          <textarea class="pf-est-campo" id="pe-ementa" rows="5" maxlength="${LIMITES.ementa}" data-pe-campo="ementa" aria-describedby="pe-ementa-ajuda"${somenteLeitura ? H` readonly` : ''}>${plano.ementa || ''}</textarea>
          <p class="pf-est-pe__ajuda" id="pe-ementa-ajuda">Até ${LIMITES.ementa} caracteres.</p>
        </div>
        <div class="pf-est-pe__campo">
          <label class="pf-est-campo__rotulo" for="pe-objetivos">Objetivos</label>
          <textarea class="pf-est-campo" id="pe-objetivos" rows="5" data-pe-campo="objetivos" aria-describedby="pe-objetivos-ajuda"${somenteLeitura ? H` readonly` : ''}>${obj.join('\n')}</textarea>
          <p class="pf-est-pe__ajuda" id="pe-objetivos-ajuda" data-pe-contador="objetivos">Um objetivo por linha · ${obj.length} de ${LIMITES.objetivos} objetivos.</p>
        </div>
        <fieldset class="pf-est-pe__grupo">
          <legend>Bibliografia</legend>
          <div class="pf-est-pe__campo">
            <label class="pf-est-campo__rotulo" for="pe-basica">Básica</label>
            <textarea class="pf-est-campo" id="pe-basica" rows="4" data-pe-campo="basica" aria-describedby="pe-basica-ajuda"${somenteLeitura ? H` readonly` : ''}>${(bib.basica || []).join('\n')}</textarea>
            <p class="pf-est-pe__ajuda" id="pe-basica-ajuda" data-pe-contador="basica">Uma referência por linha · ${(bib.basica || []).length} de até ${LIMITES.referencias}.</p>
          </div>
          <div class="pf-est-pe__campo">
            <label class="pf-est-campo__rotulo" for="pe-complementar">Complementar</label>
            <textarea class="pf-est-campo" id="pe-complementar" rows="4" data-pe-campo="complementar" aria-describedby="pe-complementar-ajuda"${somenteLeitura ? H` readonly` : ''}>${(bib.complementar || []).join('\n')}</textarea>
            <p class="pf-est-pe__ajuda" id="pe-complementar-ajuda" data-pe-contador="complementar">Uma referência por linha · ${(bib.complementar || []).length} de até ${LIMITES.referencias}.</p>
          </div>
        </fieldset>
        <fieldset class="pf-est-pe__grupo">
          <legend>Cronograma</legend>
          <p class="pf-est-pe__ajuda">${crono.length} de até ${LIMITES.cronograma} linhas.</p>
          <div class="pf-est-pe__tabela">
            <table class="pf-est-tabela pf-est-pe__crono">
              <caption class="dmc-sr-only">Cronograma do módulo</caption>
              <thead><tr><th scope="col">Encontro</th><th scope="col">Data</th><th scope="col">Tema</th><th scope="col">Aula</th><th scope="col"><span class="dmc-sr-only">Ações</span></th></tr></thead>
              <tbody data-pe-crono-corpo>${crono.map(htmlCronoLinha)}</tbody>
            </table>
          </div>
          ${somenteLeitura ? '' : H`<div class="pf-est-pe__acoes">
            <button type="button" class="dmc-btn dmc-btn--secondary" data-pe-acrescentar${cheio ? H` disabled aria-describedby="pe-crono-limite"` : ''}>Acrescentar linha</button>
            <button type="button" class="dmc-btn dmc-btn--secondary" data-pe-montar${aulas.length ? '' : H` disabled`}>Montar a partir das aulas gravadas</button>
            ${cheio ? H`<span class="pf-est-pe__ajuda" id="pe-crono-limite">Limite de ${LIMITES.cronograma} linhas atingido.</span>` : ''}
          </div>`}
        </fieldset>
      </form>`;
    }

    function lerCronograma() {
      return Array.from(el.querySelectorAll('[data-pe-linha]')).map((tr) => {
        const v = (c) => { const x = tr.querySelector(`[data-pe-crono="${c}"]`); return x ? x.value.trim() : ''; };
        return { encontro: v('encontro'), data: v('data') || null, tema: v('tema'), aulaId: v('aulaId') || null };
      });
    }

    function mostrarErro(texto, recarregar) {
      const caixa = el.querySelector('[data-pe-erro]');
      if (!caixa) return;
      caixa.hidden = false;
      caixa.className = 'pf-alerta pf-alerta--erro pf-est-pe__erro';
      caixa.innerHTML = H`<p>${texto}</p>${recarregar ? H`<button type="button" class="dmc-btn dmc-btn--secondary" data-pe-recarregar>Recarregar</button>` : ''}`;
    }

    let fila = Promise.resolve();
    function gravar(parcial) {
      fila = fila.then(async () => {
        if (destruido) return;
        const estado = el.querySelector('[data-pe-estado]');
        if (estado) estado.textContent = 'Salvando…';
        try {
          const r = await api().put(API.plano(moduloId), { ...parcial, versao: Number(plano.versao) || 0 });
          plano = r.plano;
          const erro = el.querySelector('[data-pe-erro]');
          if (erro) erro.hidden = true;
          if (estado) estado.textContent = `Salvo às ${hora()}.`;
        } catch (err) {
          if (estado) estado.textContent = 'Não salvo.';
          if (err && err.status === 409) { mostrarErro('Outra pessoa alterou este plano enquanto você editava. Recarregue para ver a versão atual.', true); return; }
          if (err && err.status === 403) { mostrarErro('Só o docente geral do curso ou a coordenação editam o plano de ensino.'); return; }
          if (err && err.campos) {
            mostrarErro(Object.values(err.campos).join(' '));
            return;
          }
          mostrarErro(err && err.message ? err.message : 'Não foi possível salvar o plano agora.');
        }
      });
      return fila;
    }

    function atualizarContador(campo, n) {
      const p = el.querySelector(`[data-pe-contador="${campo}"]`);
      if (!p) return;
      if (campo === 'objetivos') p.textContent = `Um objetivo por linha · ${n} de ${LIMITES.objetivos} objetivos.`;
      else p.textContent = `Uma referência por linha · ${n} de até ${LIMITES.referencias}.`;
    }

    function aoMudar(e) {
      if (somenteLeitura) return;
      const alvo = e.target;
      const campo = alvo.dataset.peCampo;
      if (campo) {
        if (campo === 'ementa') { if (alvo.value !== (plano.ementa || '')) gravar({ ementa: alvo.value }); return; }
        const lista = linhas(alvo.value);
        atualizarContador(campo, lista.length);
        if (campo === 'objetivos') {
          if (lista.length > LIMITES.objetivos) { mostrarErro(`Use no máximo ${LIMITES.objetivos} objetivos.`); return; }
          if (lista.join('\n') !== (plano.objetivos || []).join('\n')) gravar({ objetivos: lista });
          return;
        }
        if (lista.length > LIMITES.referencias) { mostrarErro(`Use no máximo ${LIMITES.referencias} referências por grupo.`); return; }
        const atual = ((plano.bibliografia || {})[campo] || []).join('\n');
        if (lista.join('\n') !== atual) gravar({ bibliografia: { [campo]: lista } });
        return;
      }
      if (alvo.dataset.peCrono) {
        const crono = lerCronograma();
        const incompleta = crono.some((l) => !l.encontro || !l.tema);
        if (incompleta) return; // grava quando a linha tiver encontro e tema
        gravar({ cronograma: crono });
      }
    }

    async function aoClicar(e) {
      if (e.target.closest('[data-pe-recarregar]')) {
        await carregar(); desenhar(); anunciar('Plano recarregado.'); return;
      }
      if (somenteLeitura) return;
      if (e.target.closest('[data-pe-acrescentar]')) {
        const crono = lerCronograma();
        if (crono.length >= LIMITES.cronograma) return;
        plano = { ...plano, cronograma: crono.concat([{ encontro: '', data: null, tema: '', aulaId: null }]) };
        desenhar();
        const nova = el.querySelector(`#pe-enc-${crono.length}`);
        if (nova) nova.focus();
        return;
      }
      const rem = e.target.closest('[data-pe-remover]');
      if (rem) {
        const i = Number(rem.dataset.peRemover);
        const crono = lerCronograma().filter((_, j) => j !== i);
        await gravar({ cronograma: crono.filter((l) => l.encontro && l.tema) });
        plano = { ...plano, cronograma: crono };
        desenhar();
        anunciar('Linha removida.');
        return;
      }
      if (e.target.closest('[data-pe-montar]')) {
        const novas = aulas.slice(0, LIMITES.cronograma).map((a) => ({
          encontro: String(a.rotuloEncontro || a.titulo || '').slice(0, LIMITES.encontro),
          data: a.dataEncontro || null,
          tema: String(a.titulo || '').slice(0, LIMITES.tema),
          aulaId: a.id
        })).filter((l) => l.encontro && l.tema);
        await gravar({ cronograma: novas });
        desenhar();
        anunciar(`Cronograma montado com ${novas.length} ${novas.length === 1 ? 'linha' : 'linhas'}.`);
      }
    }

    try {
      await carregar();
    } catch (err) {
      el.setAttribute('aria-busy', 'false');
      const u = ui();
      if (err && err.status === 403) {
        el.innerHTML = H`<p class="pf-alerta pf-alerta--info pf-est-aviso">Você não é docente deste curso.</p>`;
      } else if (u && typeof u.erroCarga === 'function') u.erroCarga(el, err, { tentarDeNovo: () => montar(el, o) });
      return { destruir() { el.replaceChildren(); } };
    }
    if (destruido) return { destruir() {} };
    desenhar();
    el.setAttribute('aria-busy', 'false');
    const blur = (e) => aoMudar(e);
    const mudanca = (e) => { if (e.target.tagName === 'SELECT' || e.target.type === 'date') aoMudar(e); };
    const clique = (e) => { aoClicar(e).catch((err) => mostrarErro(err && err.message ? err.message : 'Algo não saiu como esperado.')); };
    el.addEventListener('focusout', blur);
    el.addEventListener('change', mudanca);
    el.addEventListener('click', clique);
    return {
      destruir() {
        destruido = true;
        el.removeEventListener('focusout', blur);
        el.removeEventListener('change', mudanca);
        el.removeEventListener('click', clique);
        el.replaceChildren();
      }
    };
  }

  window.DMC_PlanoEnsino = { montar };

  // ---------------------------------------------------------------
  // Rotas do backoffice (só registram; nada é montado fora de professor.html)
  // ---------------------------------------------------------------
  const P = window.DMC_Professor;
  if (!P || typeof P.registrar !== 'function') return;

  P.registrar({
    rota: 'cursos',
    titulo: 'Cursos',
    papeis: ['professor', 'admin'],
    montar(el, ctx) {
      if (ctx.papel === 'professor') ctx.definirTitulo('Meus cursos');
      const cursos = ctx.cursos || [];
      if (!cursos.length) {
        el.innerHTML = ctx.papel === 'admin'
          ? H`<div class="pf-vazio pf-est-vazio"><p class="pf-est-vazio__titulo">Nenhum curso cadastrado.</p><p>Crie o primeiro em Conteúdo.</p><div class="pf-est-vazio__acoes"><a class="dmc-btn dmc-btn--primary" href="admin.html">Abrir Conteúdo</a></div></div>`
          : H`<div class="pf-vazio pf-est-vazio"><p class="pf-est-vazio__titulo">Nenhum curso vinculado a você.</p><p>Quando a coordenação vincular você a um curso, ele aparece aqui.</p></div>`;
        return;
      }
      el.innerHTML = H`<ul class="pf-est-pe-cursos" role="list">${cursos.map((c) => H`<li class="pf-est-pe-cursos__item">
        <p class="pf-est-pe-cursos__titulo">${c.titulo}</p>
        ${c.sigla ? H`<p class="pf-est-pe__ajuda">Sigla ${c.sigla}</p>` : ''}
        <p class="pf-est-pe-cursos__acoes">
          ${ctx.papel === 'admin' ? H`<a class="pf-est-link" href="${`admin.html?curso=${enc(c.id)}`}">Editar conteúdo</a>` : ''}
          <a class="pf-est-link" href="${`#/cursos/${enc(c.id)}/plano`}">Plano de ensino</a>
          <a class="pf-est-link" href="${`#/avaliacoes?curso=${enc(c.id)}`}">Avaliações</a>
          <a class="pf-est-link" href="${`#/turmas?curso=${enc(c.id)}`}">Turmas</a>
          <a class="pf-est-link" href="${`dashboard.html?curso=${enc(c.id)}`}">Ver como aluno</a>
        </p></li>`)}</ul>`;
    }
  });

  P.registrar({
    rota: 'cursos/:id/plano',
    titulo: 'Plano de ensino',
    papeis: ['professor', 'admin'],
    async montar(el, ctx) {
      const cursoId = ctx.params.id;
      const curso = (ctx.cursos || []).find((c) => c.id === cursoId);
      if (curso) ctx.definirTitulo(`Plano de ensino · ${curso.titulo}`);
      let dados;
      try { dados = await ctx.api.get(API.planos(cursoId)); }
      catch (err) {
        if (err && err.status === 401) throw err;
        if (err && err.status === 403) { el.innerHTML = H`<p class="pf-alerta pf-alerta--info pf-est-aviso">Você não é docente deste curso.</p>`; return null; }
        ctx.ui.erroCarga(el, err, { tentarDeNovo: () => ctx.navegar(`cursos/${cursoId}/plano`) });
        return null;
      }
      const modulos = (dados && dados.modulos) || [];
      if (!modulos.length) {
        el.innerHTML = H`<div class="pf-vazio pf-est-vazio"><p class="pf-est-vazio__titulo">Este curso ainda não tem módulos.</p></div>`;
        return null;
      }
      const pedido = ctx.filtros.get('modulo');
      const atual = modulos.some((m) => m.id === pedido) ? pedido : modulos[0].id;
      el.innerHTML = H`<div class="pf-est-pe-tela">
        <p class="pf-est-pe-tela__modulo"><label class="pf-est-campo__rotulo" for="pe-modulo">Módulo</label>
          <select class="pf-est-campo" id="pe-modulo" data-pe-modulo>${modulos.map((m) => H`<option value="${m.id}"${m.id === atual ? H` selected` : ''}>Módulo ${m.numero} · ${m.titulo}</option>`)}</select></p>
        <div data-pe-alvo></div>
        <p class="pf-est-pe__ajuda"><a class="pf-est-link" href="${`aula.html?curso=${enc(cursoId)}&modulo=${enc(atual)}&item=${enc(`plano:${atual}`)}`}">Ver como o aluno vê</a></p>
      </div>`;
      let ctl = await montar(el.querySelector('[data-pe-alvo]'), { cursoId, moduloId: atual });
      const sel = el.querySelector('[data-pe-modulo]');
      const trocar = () => {
        const f = new URLSearchParams(ctx.filtros);
        f.set('modulo', sel.value);
        ctx.navegar(`cursos/${cursoId}/plano`, f);
      };
      sel.addEventListener('change', trocar);
      return { destruir() { sel.removeEventListener('change', trocar); if (ctl) ctl.destruir(); ctl = null; } };
    }
  });
})();
