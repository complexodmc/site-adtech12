// =============================================================
// COMPLEXO DMC · PAINEL ADMINISTRATIVO
// CRUD de cursos, módulos e aulas — auto-save em localStorage
// =============================================================
(function () {
  'use strict';

  function bootAdmin() {
    // Em produção: trocar por requireAdminOrRedirect()
    if (!DMC_Auth.requireOrRedirect()) return;
    DMC_bindHeader();

    const I = DMC_Icons;
    const esc = DMC_escapeHtml;
    const Data = DMC_Data;

    let snapshot = Data.get();
    if (!snapshot.cursos.length) {
      const id = Data.uid('curso');
      snapshot.cursos.push({ id, titulo: 'Novo curso', subtitulo: '', cargaHoraria: '', modulos: [] });
      snapshot.cursoAtivoId = id;
      Data.save(snapshot);
    }
    let selectedCursoId = snapshot.cursoAtivoId || snapshot.cursos[0].id;
    if (!snapshot.cursos.find(c => c.id === selectedCursoId)) selectedCursoId = snapshot.cursos[0].id;

    // Botões de cabeçalho com ícones
    document.querySelector('#btn-export').innerHTML = `${I.download} Exportar JSON`;
    document.querySelector('#btn-import').innerHTML = `${I.upload} Importar JSON`;
    document.querySelector('#btn-reset').innerHTML = `${I.refresh} Restaurar seed`;
    document.querySelector('#btn-add-curso').innerHTML = `${I.plus} Novo curso`;

    // ============ TOAST ============
    const toastEl = document.querySelector('#toast');
    let toastTimer;
    function toast(msg) {
      toastEl.textContent = msg;
      toastEl.classList.add('is-show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), 1600);
    }

    // ============ PERSIST ============
    function persist(silent) {
      Data.save(snapshot);
      if (!silent) toast('Salvo');
    }
    function getCurso() { return snapshot.cursos.find(c => c.id === selectedCursoId); }

    // ============ RENDER ============
    function render() {
      renderSidebar();
      renderEditor();
    }

    function renderSidebar() {
      const list = document.querySelector('#curso-list');
      list.innerHTML = snapshot.cursos.map(c => {
        const isSelected = c.id === selectedCursoId;
        const isActive = c.id === snapshot.cursoAtivoId;
        const totalAulas = (c.modulos || []).reduce((s, m) => s + (m.aulas || []).length, 0);
        return `
          <div class="curso-item ${isSelected ? 'is-selected' : ''}" data-curso-id="${c.id}">
            <div>
              <div class="curso-item__title">${esc(c.titulo) || '<em>(sem título)</em>'}</div>
              <div class="curso-item__sub">${(c.modulos || []).length} módulos · ${totalAulas} aulas</div>
            </div>
            ${isActive ? `<span class="curso-item__active">Ativo</span>` : ''}
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
      const curso = getCurso();
      if (!curso) {
        main.innerHTML = `
          <div class="admin-empty">
            <h3>Nenhum curso selecionado</h3>
            <p>Crie um novo curso na barra lateral para começar.</p>
          </div>`;
        return;
      }
      const isActive = curso.id === snapshot.cursoAtivoId;
      main.innerHTML = `
        <section class="editor-section">
          <div class="editor-section__head">
            <div>
              <span class="overline">Curso</span>
              <h2 style="margin-top:0.4rem">Identidade do programa</h2>
            </div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
              ${isActive
                ? `<span class="curso-item__active">Curso ativo no painel do aluno</span>`
                : `<button class="btn-ghost" id="btn-set-active">Definir como ativo</button>`}
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
          <div class="field-row">
            <div>
              <label class="field-label">Subtítulo</label>
              <input class="input" data-curso-field="subtitulo" value="${esc(curso.subtitulo || '')}" placeholder="Linha de apoio do programa">
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

      // Curso fields
      main.querySelectorAll('[data-curso-field]').forEach(el => {
        el.addEventListener('input', () => {
          curso[el.dataset.cursoField] = el.value;
          persist(true);
        });
        el.addEventListener('blur', () => { persist(); renderSidebar(); });
      });

      // Set active
      const setActiveBtn = main.querySelector('#btn-set-active');
      if (setActiveBtn) setActiveBtn.addEventListener('click', () => {
        snapshot.cursoAtivoId = curso.id;
        persist();
        render();
      });

      // Delete curso
      const delCurso = main.querySelector('#btn-delete-curso');
      if (delCurso) delCurso.addEventListener('click', () => {
        if (!confirm(`Excluir o curso "${curso.titulo}"? Essa ação não pode ser desfeita.`)) return;
        snapshot.cursos = snapshot.cursos.filter(c => c.id !== curso.id);
        if (snapshot.cursoAtivoId === curso.id) snapshot.cursoAtivoId = snapshot.cursos[0] ? snapshot.cursos[0].id : null;
        selectedCursoId = snapshot.cursos[0] ? snapshot.cursos[0].id : null;
        persist();
        render();
      });

      // Add módulo
      const addModBtn = main.querySelector('#btn-add-modulo');
      if (addModBtn) addModBtn.addEventListener('click', () => {
        const nextNum = String((curso.modulos || []).length + 1).padStart(2, '0');
        curso.modulos = curso.modulos || [];
        curso.modulos.push({
          id: Data.uid('m'),
          numero: nextNum,
          titulo: 'Novo módulo',
          resumo: '',
          duracao: '',
          aulas: []
        });
        persist();
        render();
      });

      // Módulo fields
      main.querySelectorAll('[data-modulo-field]').forEach(el => {
        el.addEventListener('input', () => {
          const m = curso.modulos.find(x => x.id === el.dataset.moduloId);
          if (m) { m[el.dataset.moduloField] = el.value; persist(true); }
        });
        el.addEventListener('blur', () => { persist(); renderSidebar(); });
      });

      // Módulo: up/down/delete
      main.querySelectorAll('[data-modulo-up]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.moduloUp;
        const idx = curso.modulos.findIndex(m => m.id === id);
        if (idx > 0) { [curso.modulos[idx - 1], curso.modulos[idx]] = [curso.modulos[idx], curso.modulos[idx - 1]]; persist(); render(); }
      }));
      main.querySelectorAll('[data-modulo-down]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.moduloDown;
        const idx = curso.modulos.findIndex(m => m.id === id);
        if (idx >= 0 && idx < curso.modulos.length - 1) { [curso.modulos[idx + 1], curso.modulos[idx]] = [curso.modulos[idx], curso.modulos[idx + 1]]; persist(); render(); }
      }));
      main.querySelectorAll('[data-modulo-delete]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.moduloDelete;
        const m = curso.modulos.find(x => x.id === id);
        if (!m) return;
        if (!confirm(`Excluir o módulo "${m.titulo}" e todas as suas aulas?`)) return;
        curso.modulos = curso.modulos.filter(x => x.id !== id);
        persist();
        render();
      }));
      main.querySelectorAll('[data-modulo-toggle]').forEach(b => b.addEventListener('click', () => {
        const node = b.closest('.admin-module');
        const body = node.querySelector('.admin-module__body');
        body.style.display = body.style.display === 'none' ? '' : 'none';
        b.style.transform = body.style.display === 'none' ? 'rotate(-90deg)' : '';
      }));

      // Aula: add
      main.querySelectorAll('[data-aula-add]').forEach(b => b.addEventListener('click', () => {
        const m = curso.modulos.find(x => x.id === b.dataset.aulaAdd);
        if (!m) return;
        m.aulas = m.aulas || [];
        m.aulas.push({
          id: Data.uid('a'),
          titulo: 'Nova aula',
          duracao: '',
          videoUrl: ''
        });
        persist();
        render();
      }));

      // Aula fields
      main.querySelectorAll('[data-aula-field]').forEach(el => {
        el.addEventListener('input', () => {
          const a = findAulaById(curso, el.dataset.aulaId);
          if (a) { a[el.dataset.aulaField] = el.value; persist(true); }
        });
        el.addEventListener('blur', () => { persist(); });
      });

      // Aula: up/down/delete
      main.querySelectorAll('[data-aula-up]').forEach(b => b.addEventListener('click', () => {
        moveAula(curso, b.dataset.aulaUp, -1);
      }));
      main.querySelectorAll('[data-aula-down]').forEach(b => b.addEventListener('click', () => {
        moveAula(curso, b.dataset.aulaDown, 1);
      }));
      main.querySelectorAll('[data-aula-delete]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.aulaDelete;
        const found = findAulaWithModulo(curso, id);
        if (!found) return;
        if (!confirm(`Excluir a aula "${found.aula.titulo}"?`)) return;
        found.modulo.aulas = found.modulo.aulas.filter(a => a.id !== id);
        persist();
        render();
      }));
    }

    function findAulaById(curso, aulaId) {
      for (const m of curso.modulos || []) {
        const a = (m.aulas || []).find(x => x.id === aulaId);
        if (a) return a;
      }
      return null;
    }
    function findAulaWithModulo(curso, aulaId) {
      for (const m of curso.modulos || []) {
        const a = (m.aulas || []).find(x => x.id === aulaId);
        if (a) return { modulo: m, aula: a };
      }
      return null;
    }
    function moveAula(curso, aulaId, delta) {
      const found = findAulaWithModulo(curso, aulaId);
      if (!found) return;
      const arr = found.modulo.aulas;
      const idx = arr.indexOf(found.aula);
      const ni = idx + delta;
      if (ni < 0 || ni >= arr.length) return;
      [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
      persist();
      render();
    }

    // ============ HEADER ACTIONS ============
    document.querySelector('#btn-add-curso').addEventListener('click', () => {
      const id = Data.uid('curso');
      snapshot.cursos.push({ id, titulo: 'Novo curso', subtitulo: '', cargaHoraria: '', modulos: [] });
      selectedCursoId = id;
      if (!snapshot.cursoAtivoId) snapshot.cursoAtivoId = id;
      persist();
      render();
    });

    document.querySelector('#btn-reset').addEventListener('click', () => {
      if (!confirm('Restaurar o conteúdo original do seed (data.js)? Isso descarta TODAS as suas edições.')) return;
      Data.reset();
      snapshot = Data.get();
      selectedCursoId = snapshot.cursoAtivoId || (snapshot.cursos[0] && snapshot.cursos[0].id);
      toast('Seed restaurado');
      render();
    });

    // Export
    const modalExport = document.querySelector('#modal-export');
    document.querySelector('#btn-export').addEventListener('click', () => {
      const ta = document.querySelector('#export-json');
      ta.value = JSON.stringify(snapshot, null, 2);
      modalExport.classList.add('is-open');
      setTimeout(() => ta.select(), 50);
    });
    document.querySelector('#btn-copy-json').addEventListener('click', async () => {
      const ta = document.querySelector('#export-json');
      try {
        await navigator.clipboard.writeText(ta.value);
        toast('JSON copiado');
      } catch {
        ta.select(); document.execCommand('copy'); toast('JSON copiado');
      }
    });

    // Import
    const modalImport = document.querySelector('#modal-import');
    document.querySelector('#btn-import').addEventListener('click', () => {
      document.querySelector('#import-json').value = '';
      modalImport.classList.add('is-open');
    });
    document.querySelector('#btn-import-confirm').addEventListener('click', () => {
      const txt = document.querySelector('#import-json').value.trim();
      if (!txt) return;
      try {
        const parsed = JSON.parse(txt);
        if (!parsed.cursos || !Array.isArray(parsed.cursos)) throw new Error('JSON precisa ter "cursos" como array');
        snapshot = parsed;
        if (!snapshot.cursoAtivoId && snapshot.cursos[0]) snapshot.cursoAtivoId = snapshot.cursos[0].id;
        selectedCursoId = snapshot.cursoAtivoId;
        persist();
        modalImport.classList.remove('is-open');
        toast('Conteúdo importado');
        render();
      } catch (err) {
        alert('JSON inválido: ' + err.message);
      }
    });

    // Modal close
    document.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', () => {
      modalImport.classList.remove('is-open');
      modalExport.classList.remove('is-open');
    }));
    [modalImport, modalExport].forEach(m => m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.remove('is-open');
    }));

    // ============ LIBERAÇÕES ============
    function renderLiberacoesUI() {
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

      renderLibList();
    }

    function renderLibList() {
      const list = document.querySelector('#lib-list');
      const counter = document.querySelector('#lib-list-count');
      if (!list) return;
      const todas = (DMC_Liberacoes._read && DMC_Liberacoes._read()) || JSON.parse(localStorage.getItem('dmc:liberacoes') || '{}');
      const cursos = (Data.get().cursos || []);
      const findCurso = id => cursos.find(c => c.id === id);
      const emails = Object.keys(todas).filter(e => (todas[e] || []).length > 0);
      counter.textContent = emails.length;

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

      list.querySelectorAll('[data-revoke]').forEach(b => b.addEventListener('click', (e) => {
        e.preventDefault();
        const chip = b.closest('.lib-chip');
        if (!chip) return;
        DMC_Liberacoes.revoke(chip.dataset.email, chip.dataset.curso);
        renderLibList();
        toast('Acesso revogado');
      }));
      list.querySelectorAll('[data-revoke-all]').forEach(b => b.addEventListener('click', () => {
        const email = b.dataset.revokeAll;
        if (!confirm(`Revogar TODOS os acessos de ${email}?`)) return;
        const all = JSON.parse(localStorage.getItem('dmc:liberacoes') || '{}');
        delete all[email];
        localStorage.setItem('dmc:liberacoes', JSON.stringify(all));
        renderLibList();
        toast('Acessos revogados');
      }));
    }

    const libForm = document.querySelector('#lib-form');
    if (libForm) {
      libForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = (document.querySelector('#lib-email').value || '').trim();
        if (!email) return;
        const ids = Array.from(document.querySelectorAll('#lib-cursos input:checked')).map(i => i.value);
        if (!ids.length) { toast('Selecione ao menos um curso'); return; }
        DMC_Liberacoes.grant(email, ids);
        // limpa form
        document.querySelector('#lib-email').value = '';
        document.querySelector('#lib-nome').value = '';
        document.querySelectorAll('#lib-cursos input:checked').forEach(i => i.checked = false);
        renderLibList();
        toast(`${ids.length} curso${ids.length > 1 ? 's' : ''} liberado${ids.length > 1 ? 's' : ''} para ${email}`);
      });
    }
    const libClear = document.querySelector('#lib-clear');
    if (libClear) libClear.addEventListener('click', () => {
      document.querySelector('#lib-email').value = '';
      document.querySelector('#lib-nome').value = '';
      document.querySelectorAll('#lib-cursos input:checked').forEach(i => i.checked = false);
    });

    // Re-renderiza checkboxes de liberação quando os cursos mudam (override de render)
    const _origRender = render;
    render = function () { _origRender(); renderLiberacoesUI(); };

    render();
  }
  window.DMC_bootAdmin = bootAdmin;
})();
