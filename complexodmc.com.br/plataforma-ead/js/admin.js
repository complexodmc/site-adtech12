// =============================================================
// COMPLEXO DMC · PAINEL ADMINISTRATIVO
// CRUD de cursos, módulos e aulas — write-through pra API MongoDB.
// =============================================================
(function () {
  'use strict';

  async function bootAdmin() {
    await DMC_init();
    if (!DMC_Auth.requireAdminOrRedirect()) return;
    DMC_bindHeader();

    const I = DMC_Icons;
    const esc = DMC_escapeHtml;
    const Data = DMC_Data;
    const Liberacoes = DMC_Liberacoes;

    let snapshot = Data.get();
    if (!snapshot.cursos.length) {
      const novo = makeNovoCurso();
      try { await Data.upsertCurso(novo); }
      catch (err) { alert('Erro ao criar curso inicial: ' + err.message); return; }
      await Data.refresh();
      snapshot = Data.get();
    }

    let selectedCursoId = snapshot.cursos[0].id;

    // Botões de cabeçalho
    const btnAddCurso = document.querySelector('#btn-add-curso');
    if (btnAddCurso) btnAddCurso.innerHTML = `${I.plus} Novo curso`;
    // Export/import/reset eram localStorage — não fazem mais sentido.
    // Deixo Export como "exportar JSON do estado atual" (útil pra backup).
    const btnExport = document.querySelector('#btn-export');
    const btnImport = document.querySelector('#btn-import');
    const btnReset = document.querySelector('#btn-reset');
    if (btnExport) btnExport.innerHTML = `${I.download} Exportar JSON`;
    if (btnImport) btnImport.style.display = 'none';   // import desativado (precisaria bulk-insert)
    if (btnReset) btnReset.style.display = 'none';     // reset desativado (rodar seed.sql se quiser)

    // ============ TOAST ============
    const toastEl = document.querySelector('#toast');
    let toastTimer;
    function toast(msg) {
      if (!toastEl) return;
      toastEl.textContent = msg;
      toastEl.classList.add('is-show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), 1600);
    }
    function toastErr(err) {
      console.error(err);
      toast('Erro: ' + (err && err.message ? err.message : 'salvar'));
    }

    // ============ HELPERS ============
    function getCurso() { return snapshot.cursos.find(c => c.id === selectedCursoId); }
    function refreshSnapshot() { snapshot = Data.get(); }

    function makeNovoCurso() {
      const proximaOrdem = (snapshot.cursos.reduce((m, c) => Math.max(m, c.ordem || 0), 0)) + 1;
      return {
        id: Data.uid('curso'),
        titulo: 'Novo curso',
        subtitulo: '',
        descricao: '',
        cargaHoraria: '',
        modalidade: 'Online',
        iconeKey: 'graduation',
        preco: 0,
        linkCheckout: '',
        beneficios: [],
        ordem: proximaOrdem,
        isAtivo: true,
        modulos: []
      };
    }

    // ============ RENDER ============
    function render() {
      renderSidebar();
      renderEditor();
      renderLiberacoesUI();
    }

    function renderSidebar() {
      const list = document.querySelector('#curso-list');
      if (!list) return;
      list.innerHTML = snapshot.cursos.map(c => {
        const isSelected = c.id === selectedCursoId;
        const totalAulas = (c.modulos || []).reduce((s, m) => s + (m.aulas || []).length, 0);
        return `
          <div class="curso-item ${isSelected ? 'is-selected' : ''}" data-curso-id="${c.id}">
            <div>
              <div class="curso-item__title">${esc(c.titulo) || '<em>(sem título)</em>'}</div>
              <div class="curso-item__sub">${(c.modulos || []).length} módulos · ${totalAulas} aulas</div>
            </div>
          </div>`;
      }).join('');
      list.querySelectorAll('.curso-item').forEach(el => {
        el.addEventListener('click', () => {
          selectedCursoId = el.dataset.cursoId;
          render();
        });
      });
    }

    function renderEditor() {
      const main = document.querySelector('#curso-editor');
      if (!main) return;
      const curso = getCurso();
      if (!curso) {
        main.innerHTML = `
          <div class="admin-empty">
            <h3>Nenhum curso selecionado</h3>
            <p>Crie um novo curso na barra lateral para começar.</p>
          </div>`;
        return;
      }
      main.innerHTML = `
        <section class="editor-section">
          <div class="editor-section__head">
            <div>
              <span class="overline">Curso</span>
              <h2 style="margin-top:0.4rem">Identidade do programa</h2>
            </div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
              <button class="btn-ghost danger" id="btn-delete-curso">${I.trash} Excluir curso</button>
            </div>
          </div>

          <div class="field-row cols-2">
            <div>
              <label class="field-label">Título</label>
              <input class="input" data-curso-field="titulo" value="${esc(curso.titulo)}" placeholder="Nome do programa">
            </div>
            <div>
              <label class="field-label">Carga horária</label>
              <input class="input" data-curso-field="cargaHoraria" value="${esc(curso.cargaHoraria || '')}" placeholder="Ex.: 42h">
            </div>
          </div>
          <div class="field-row cols-2">
            <div>
              <label class="field-label">Modalidade</label>
              <input class="input" data-curso-field="modalidade" value="${esc(curso.modalidade || 'Online')}" placeholder="Online / Presencial / Híbrido">
            </div>
            <div>
              <label class="field-label">Preço (R$)</label>
              <input class="input" type="number" min="0" step="0.01" data-curso-field="preco" value="${Number(curso.preco) || 0}" placeholder="0.00">
            </div>
          </div>
          <div class="field-row">
            <div>
              <label class="field-label">Subtítulo</label>
              <input class="input" data-curso-field="subtitulo" value="${esc(curso.subtitulo || '')}" placeholder="Linha de apoio do programa">
            </div>
          </div>
          <div class="field-row">
            <div>
              <label class="field-label">Descrição</label>
              <textarea class="input" data-curso-field="descricao" placeholder="Descrição completa do programa">${esc(curso.descricao || '')}</textarea>
            </div>
          </div>
        </section>

        <section class="editor-section">
          <div class="editor-section__head">
            <div>
              <span class="overline">Estrutura</span>
              <h2 style="margin-top:0.4rem">Módulos e aulas</h2>
            </div>
            <div style="font-size:0.78rem;color:var(--ink-3);letter-spacing:0.06em">
              ${(curso.modulos || []).length} módulos · ${(curso.modulos || []).reduce((s,m) => s + m.aulas.length, 0)} aulas
            </div>
          </div>

          <div class="admin-modules" id="modules-edit">${(curso.modulos || []).map((m, idx) => renderModulo(m, idx, curso.modulos.length)).join('')}</div>

          <button class="btn-add-modulo" id="btn-add-modulo">${I.plus} Adicionar módulo</button>
        </section>
      `;

      bindEditorEvents();
    }

    function renderModulo(m, idx, total) {
      const aulasHtml = (m.aulas || []).map((a, ai) => `
        <div class="admin-aula" data-aula-id="${a.id}" data-modulo-id="${m.id}">
          <div class="handle">
            <button data-aula-up="${a.id}" ${ai === 0 ? 'disabled' : ''} title="Mover para cima">${I.chevronUp}</button>
            <button data-aula-down="${a.id}" ${ai === m.aulas.length - 1 ? 'disabled' : ''} title="Mover para baixo">${I.chevronDownSmall}</button>
          </div>
          <input class="input aula-num-input" value="${esc(m.numero)}.${String(ai + 1).padStart(2, '0')}" disabled title="Numeração automática">
          <input class="input" data-aula-field="titulo" data-aula-id="${a.id}" value="${esc(a.titulo)}" placeholder="Título da aula">
          <input class="input" data-aula-field="duracao" data-aula-id="${a.id}" value="${esc(a.duracao || '')}" placeholder="Ex.: 32min">
          <input class="input" data-aula-field="videoUrl" data-aula-id="${a.id}" value="${esc(a.videoUrl || '')}" placeholder="https://vimeo.com/... ou MP4 direto">
          <button class="btn-icon danger" data-aula-delete="${a.id}" title="Excluir aula">${I.trash}</button>
        </div>
      `).join('');

      return `
        <article class="admin-module" data-modulo-id="${m.id}">
          <div class="admin-module__head">
            <div class="admin-module__title-row">
              <div class="handle">
                <button data-modulo-up="${m.id}" ${idx === 0 ? 'disabled' : ''} title="Mover para cima">${I.chevronUp}</button>
                <button data-modulo-down="${m.id}" ${idx === total - 1 ? 'disabled' : ''} title="Mover para baixo">${I.chevronDownSmall}</button>
              </div>
              <input class="input" data-modulo-field="numero" data-modulo-id="${m.id}" value="${esc(m.numero)}" placeholder="01" style="text-align:center;font-family:'Playfair Display',serif;font-weight:600;font-size:1rem">
              <input class="input" data-modulo-field="titulo" data-modulo-id="${m.id}" value="${esc(m.titulo)}" placeholder="Título do módulo">
              <input class="input" data-modulo-field="duracao" data-modulo-id="${m.id}" value="${esc(m.duracao || '')}" placeholder="Ex.: 4h 20min">
              <button class="btn-icon" data-modulo-toggle="${m.id}" title="Recolher/expandir aulas">${I.chevronDownSmall}</button>
              <button class="btn-icon danger" data-modulo-delete="${m.id}" title="Excluir módulo">${I.trash}</button>
            </div>
            <div style="margin-top:1rem">
              <label class="field-label">Resumo</label>
              <textarea class="input" data-modulo-field="resumo" data-modulo-id="${m.id}" placeholder="Breve descrição do módulo">${esc(m.resumo || '')}</textarea>
            </div>
          </div>
          <div class="admin-module__body">
            <span class="overline" style="font-size:0.62rem">Aulas (${(m.aulas || []).length})</span>
            <div class="admin-aulas">${aulasHtml}</div>
            <button class="btn-add-aula" data-aula-add="${m.id}">${I.plus} Adicionar aula</button>
          </div>
        </article>`;
    }

    // ============ EVENT BINDING ============
    function bindEditorEvents() {
      const main = document.querySelector('#curso-editor');
      const curso = getCurso();
      if (!main || !curso) return;

      // ----- Curso fields: salva no blur -----
      main.querySelectorAll('[data-curso-field]').forEach(el => {
        el.addEventListener('blur', async () => {
          const field = el.dataset.cursoField;
          let value = el.value;
          if (field === 'preco') value = Number(value) || 0;
          if (curso[field] === value) return;
          curso[field] = value;
          try { await Data.upsertCurso(curso); toast('Salvo'); }
          catch (err) { toastErr(err); return; }
          renderSidebar();
        });
      });

      // ----- Delete curso -----
      const delCurso = main.querySelector('#btn-delete-curso');
      if (delCurso) delCurso.addEventListener('click', async () => {
        if (!confirm(`Excluir o curso "${curso.titulo}"? Essa ação não pode ser desfeita.`)) return;
        try { await Data.deleteCurso(curso.id); }
        catch (err) { toastErr(err); return; }
        await Data.refresh();
        refreshSnapshot();
        selectedCursoId = snapshot.cursos[0] ? snapshot.cursos[0].id : null;
        toast('Curso excluído');
        render();
      });

      // ----- Add módulo -----
      const addModBtn = main.querySelector('#btn-add-modulo');
      if (addModBtn) addModBtn.addEventListener('click', async () => {
        const ordem = (curso.modulos || []).length + 1;
        const novo = {
          id: Data.uid('m'),
          numero: String(ordem).padStart(2, '0'),
          titulo: 'Novo módulo',
          resumo: '',
          duracao: '',
          ordem,
          aulas: []
        };
        try { await Data.upsertModulo(novo, curso.id); }
        catch (err) { toastErr(err); return; }
        await Data.refresh();
        refreshSnapshot();
        toast('Módulo adicionado');
        render();
      });

      // ----- Módulo fields: salva no blur -----
      main.querySelectorAll('[data-modulo-field]').forEach(el => {
        el.addEventListener('blur', async () => {
          const m = curso.modulos.find(x => x.id === el.dataset.moduloId);
          if (!m) return;
          const field = el.dataset.moduloField;
          if (m[field] === el.value) return;
          m[field] = el.value;
          try { await Data.upsertModulo(m, curso.id); toast('Salvo'); }
          catch (err) { toastErr(err); return; }
          renderSidebar();
        });
      });

      // ----- Módulo: up/down/delete -----
      main.querySelectorAll('[data-modulo-up]').forEach(b => b.addEventListener('click', async () => {
        const id = b.dataset.moduloUp;
        const idx = curso.modulos.findIndex(m => m.id === id);
        if (idx <= 0) return;
        await swapModulos(curso, idx - 1, idx);
      }));
      main.querySelectorAll('[data-modulo-down]').forEach(b => b.addEventListener('click', async () => {
        const id = b.dataset.moduloDown;
        const idx = curso.modulos.findIndex(m => m.id === id);
        if (idx < 0 || idx >= curso.modulos.length - 1) return;
        await swapModulos(curso, idx, idx + 1);
      }));
      main.querySelectorAll('[data-modulo-delete]').forEach(b => b.addEventListener('click', async () => {
        const id = b.dataset.moduloDelete;
        const m = curso.modulos.find(x => x.id === id);
        if (!m) return;
        if (!confirm(`Excluir o módulo "${m.titulo}" e todas as suas aulas?`)) return;
        try { await Data.deleteModulo(id); }
        catch (err) { toastErr(err); return; }
        await Data.refresh();
        refreshSnapshot();
        toast('Módulo excluído');
        render();
      }));
      main.querySelectorAll('[data-modulo-toggle]').forEach(b => b.addEventListener('click', () => {
        const node = b.closest('.admin-module');
        const body = node.querySelector('.admin-module__body');
        body.style.display = body.style.display === 'none' ? '' : 'none';
        b.style.transform = body.style.display === 'none' ? 'rotate(-90deg)' : '';
      }));

      // ----- Aula: add -----
      main.querySelectorAll('[data-aula-add]').forEach(b => b.addEventListener('click', async () => {
        const m = curso.modulos.find(x => x.id === b.dataset.aulaAdd);
        if (!m) return;
        const ordem = (m.aulas || []).length + 1;
        const novo = {
          id: Data.uid('a'),
          titulo: 'Nova aula',
          duracao: '',
          videoUrl: '',
          ordem
        };
        try { await Data.upsertAula(novo, m.id); }
        catch (err) { toastErr(err); return; }
        await Data.refresh();
        refreshSnapshot();
        toast('Aula adicionada');
        render();
      }));

      // ----- Aula fields: salva no blur -----
      main.querySelectorAll('[data-aula-field]').forEach(el => {
        el.addEventListener('blur', async () => {
          const found = findAulaWithModulo(curso, el.dataset.aulaId);
          if (!found) return;
          const field = el.dataset.aulaField;
          if (found.aula[field] === el.value) return;
          found.aula[field] = el.value;
          try { await Data.upsertAula(found.aula, found.modulo.id); toast('Salvo'); }
          catch (err) { toastErr(err); }
        });
      });

      // ----- Aula: up/down/delete -----
      main.querySelectorAll('[data-aula-up]').forEach(b => b.addEventListener('click', async () => {
        await swapAulas(curso, b.dataset.aulaUp, -1);
      }));
      main.querySelectorAll('[data-aula-down]').forEach(b => b.addEventListener('click', async () => {
        await swapAulas(curso, b.dataset.aulaDown, 1);
      }));
      main.querySelectorAll('[data-aula-delete]').forEach(b => b.addEventListener('click', async () => {
        const id = b.dataset.aulaDelete;
        const found = findAulaWithModulo(curso, id);
        if (!found) return;
        if (!confirm(`Excluir a aula "${found.aula.titulo}"?`)) return;
        try { await Data.deleteAula(id); }
        catch (err) { toastErr(err); return; }
        await Data.refresh();
        refreshSnapshot();
        toast('Aula excluída');
        render();
      }));
    }

    async function swapModulos(curso, i, j) {
      const a = curso.modulos[i], b = curso.modulos[j];
      const ordemA = a.ordem, ordemB = b.ordem;
      a.ordem = ordemB; b.ordem = ordemA;
      try {
        await Promise.all([
          Data.upsertModulo(a, curso.id),
          Data.upsertModulo(b, curso.id)
        ]);
      } catch (err) { toastErr(err); return; }
      await Data.refresh();
      refreshSnapshot();
      render();
    }
    async function swapAulas(curso, aulaId, delta) {
      const found = findAulaWithModulo(curso, aulaId);
      if (!found) return;
      const arr = found.modulo.aulas;
      const idx = arr.indexOf(found.aula);
      const ni = idx + delta;
      if (ni < 0 || ni >= arr.length) return;
      const a = arr[idx], b = arr[ni];
      const ordemA = a.ordem, ordemB = b.ordem;
      a.ordem = ordemB; b.ordem = ordemA;
      try {
        await Promise.all([
          Data.upsertAula(a, found.modulo.id),
          Data.upsertAula(b, found.modulo.id)
        ]);
      } catch (err) { toastErr(err); return; }
      await Data.refresh();
      refreshSnapshot();
      render();
    }
    function findAulaWithModulo(curso, aulaId) {
      for (const m of curso.modulos || []) {
        const a = (m.aulas || []).find(x => x.id === aulaId);
        if (a) return { modulo: m, aula: a };
      }
      return null;
    }

    // ============ HEADER ACTIONS ============
    if (btnAddCurso) btnAddCurso.addEventListener('click', async () => {
      const novo = makeNovoCurso();
      try { await Data.upsertCurso(novo); }
      catch (err) { toastErr(err); return; }
      await Data.refresh();
      refreshSnapshot();
      selectedCursoId = novo.id;
      toast('Curso criado');
      render();
    });

    // Export JSON do estado atual (read-only — backup)
    const modalExport = document.querySelector('#modal-export');
    if (btnExport && modalExport) {
      btnExport.addEventListener('click', () => {
        const ta = document.querySelector('#export-json');
        ta.value = JSON.stringify(snapshot, null, 2);
        modalExport.classList.add('is-open');
        setTimeout(() => ta.select(), 50);
      });
      const btnCopy = document.querySelector('#btn-copy-json');
      if (btnCopy) btnCopy.addEventListener('click', async () => {
        const ta = document.querySelector('#export-json');
        try { await navigator.clipboard.writeText(ta.value); toast('JSON copiado'); }
        catch { ta.select(); document.execCommand('copy'); toast('JSON copiado'); }
      });
    }

    // Modal close
    document.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', () => {
      if (modalExport) modalExport.classList.remove('is-open');
    }));
    if (modalExport) modalExport.addEventListener('click', (e) => {
      if (e.target === modalExport) modalExport.classList.remove('is-open');
    });

    // ============ LIBERAÇÕES ============
    async function renderLiberacoesUI() {
      const cursos = (Data.get().cursos || []);
      const container = document.querySelector('#lib-cursos');
      if (!container) return;
      container.innerHTML = cursos.map(c => `
        <label class="lib-curso">
          <input type="checkbox" value="${c.id}">
          <span class="lib-curso__title">${esc(c.titulo)}</span>
          <span class="lib-curso__meta">${esc(c.modalidade || 'Online')} · ${esc(c.cargaHoraria || '')}</span>
        </label>
      `).join('');

      try { await Liberacoes.loadAll(); }
      catch (err) { toastErr(err); }
      renderLibList();
    }

    function renderLibList() {
      const list = document.querySelector('#lib-list');
      const counter = document.querySelector('#lib-list-count');
      if (!list) return;
      const todas = Liberacoes.allByEmail();
      const cursos = (Data.get().cursos || []);
      const findCurso = id => cursos.find(c => c.id === id);
      const emails = Object.keys(todas).filter(e => (todas[e] || []).length > 0);
      if (counter) counter.textContent = emails.length;

      if (!emails.length) {
        list.innerHTML = `<div class="lib-empty">Nenhum aluno com acesso liberado ainda.</div>`;
        return;
      }
      list.innerHTML = emails.map(email => {
        const ids = todas[email] || [];
        const chips = ids.map(id => {
          const c = findCurso(id);
          const titulo = c ? c.titulo : `(curso ${id})`;
          return `
            <span class="lib-chip" data-email="${esc(email)}" data-curso="${esc(id)}">
              ${esc(titulo)}
              <button class="lib-chip__x" data-revoke title="Revogar acesso" aria-label="Revogar acesso">
                ${I.trash}
              </button>
            </span>`;
        }).join('');
        return `
          <div class="lib-row">
            <div class="lib-row__head">
              <strong>${esc(email)}</strong>
              <button class="btn-icon danger" data-revoke-all="${esc(email)}" title="Revogar todos os acessos">${I.trash}</button>
            </div>
            <div class="lib-row__chips">${chips}</div>
          </div>`;
      }).join('');

      list.querySelectorAll('[data-revoke]').forEach(b => b.addEventListener('click', async (e) => {
        e.preventDefault();
        const chip = b.closest('.lib-chip');
        if (!chip) return;
        try { await Liberacoes.revokeByEmail(chip.dataset.email, chip.dataset.curso); }
        catch (err) { toastErr(err); return; }
        await Liberacoes.loadAll();
        renderLibList();
        toast('Acesso revogado');
      }));
      list.querySelectorAll('[data-revoke-all]').forEach(b => b.addEventListener('click', async () => {
        const email = b.dataset.revokeAll;
        if (!confirm(`Revogar TODOS os acessos de ${email}?`)) return;
        try { await Liberacoes.revokeAllByEmail(email); }
        catch (err) { toastErr(err); return; }
        await Liberacoes.loadAll();
        renderLibList();
        toast('Acessos revogados');
      }));
    }

    const libForm = document.querySelector('#lib-form');
    if (libForm) {
      libForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = (document.querySelector('#lib-email').value || '').trim();
        if (!email) return;
        const ids = Array.from(document.querySelectorAll('#lib-cursos input:checked')).map(i => i.value);
        if (!ids.length) { toast('Selecione ao menos um curso'); return; }
        try { await Liberacoes.grantByEmail(email, ids); }
        catch (err) { alert(err.message); return; }
        document.querySelector('#lib-email').value = '';
        const libNome = document.querySelector('#lib-nome');
        if (libNome) libNome.value = '';
        document.querySelectorAll('#lib-cursos input:checked').forEach(i => i.checked = false);
        await Liberacoes.loadAll();
        renderLibList();
        toast(`${ids.length} curso${ids.length > 1 ? 's' : ''} liberado${ids.length > 1 ? 's' : ''} para ${email}`);
      });
    }
    const libClear = document.querySelector('#lib-clear');
    if (libClear) libClear.addEventListener('click', () => {
      document.querySelector('#lib-email').value = '';
      const libNome = document.querySelector('#lib-nome');
      if (libNome) libNome.value = '';
      document.querySelectorAll('#lib-cursos input:checked').forEach(i => i.checked = false);
    });

    render();
  }
  window.DMC_bootAdmin = bootAdmin;
})();
