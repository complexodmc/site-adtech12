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

    // Teto da capa no servidor (capas.js) — repetido aqui só pra avisar
    // antes de subir 12 MB e tomar 413.
    const CAPA_MAX_MB = 8;

    // Quais roteiros estão abertos. O editor re-renderiza inteiro a cada
    // salvamento; sem isso o painel fechava na cara de quem estava escrevendo.
    const roteirosAbertos = new Set();

    // Mesma história para os módulos: adicionar uma aula reconstrói o
    // editor, e sem esta memória todos os módulos recolhiam — quem
    // estava trabalhando no módulo 7 era devolvido ao topo da lista.
    const modulosAbertos = new Set();

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
      renderLivesUI();
      renderDuvidasUI();
    }

    function renderSidebar() {
      const list = document.querySelector('#curso-list');
      if (!list) return;
      list.innerHTML = snapshot.cursos.map(c => {
        const isSelected = c.id === selectedCursoId;
        const totalAulas = (c.modulos || []).reduce((s, m) => s + (m.aulas || []).length, 0);
        return `
          <div class="curso-item ${isSelected ? 'is-selected' : ''}" data-curso-id="${c.id}">
            <span class="curso-item__thumb">${
              DMC_capaSrc(c) ? `<img src="${esc(DMC_capaSrc(c))}" alt="" loading="lazy">` : I.imagem
            }</span>
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

          <div class="field-row">
            <div>
              <label class="field-label">Capa do curso</label>
              <div class="capa-box" data-capa-wrap>${capaHtml(curso)}</div>
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

          <!-- Barra de manobra: com dezenas de módulos, filtrar é mais
               rápido do que rolar. A busca varre número, título e o
               título das aulas, e abre sozinha o módulo que casou. -->
          <div class="modulos-barra">
            <div class="modulos-busca">
              ${I.search || ''}
              <input type="search" id="filtro-modulos" class="input"
                     placeholder="Buscar módulo ou aula…" autocomplete="off"
                     aria-label="Filtrar módulos e aulas">
            </div>
            <div class="modulos-barra__acoes">
              <button type="button" class="btn-linha" id="btn-expandir-tudo">Abrir todos</button>
              <button type="button" class="btn-linha" id="btn-recolher-tudo">Recolher todos</button>
            </div>
          </div>
          <p class="modulos-vazio" id="modulos-vazio" hidden>Nenhum módulo ou aula corresponde à busca.</p>

          <div class="admin-modules" id="modules-edit">${(curso.modulos || []).map((m, idx) => renderModulo(m, idx, curso.modulos.length)).join('')}</div>

          <button class="btn-add-modulo" id="btn-add-modulo">${I.plus} Adicionar módulo</button>
        </section>
      `;

      bindEditorEvents();
    }

    function renderModulo(m, idx, total) {
      const aulasHtml = (m.aulas || []).map((a, ai) => `
        <div class="admin-aula ${a.disponivel === false ? 'is-embreve' : ''}" data-aula-id="${a.id}" data-modulo-id="${m.id}">
          <div class="handle">
            <button data-aula-up="${a.id}" ${ai === 0 ? 'disabled' : ''} title="Mover para cima">${I.chevronUp}</button>
            <button data-aula-down="${a.id}" ${ai === m.aulas.length - 1 ? 'disabled' : ''} title="Mover para baixo">${I.chevronDownSmall}</button>
          </div>
          <input class="input aula-num-input" value="${esc(m.numero)}.${String(ai + 1).padStart(2, '0')}" disabled title="Numeração automática">
          <input class="input" data-aula-field="titulo" data-aula-id="${a.id}" value="${esc(a.titulo)}" placeholder="Título da aula">
          <input class="input" data-aula-field="duracao" data-aula-id="${a.id}" value="${esc(a.duracao || '')}" placeholder="Ex.: 32min">
          <input class="input" data-aula-field="videoUrl" data-aula-id="${a.id}" value="${esc(a.videoUrl || '')}" placeholder="https://vimeo.com/... ou MP4 direto">
          ${disponibilidadeHtml(a)}
          <button class="btn-icon danger" data-aula-delete="${a.id}" title="Excluir aula">${I.trash}</button>
          <div class="aula-mats" data-mat-wrap="${a.id}">${materiaisHtml(a)}</div>
          <div class="aula-roteiro" data-roteiro-wrap="${a.id}">${roteiroHtml(a)}</div>
        </div>
      `).join('');

      // Módulo nasce RECOLHIDO. Com 10 módulos e 45 aulas abertos de
      // uma vez a página passava de 12 mil pixels: achar um módulo para
      // editar ou excluir virava rolagem às cegas. Recolhido, a mesma
      // tela cabe numa dobra e a lista funciona como índice.
      const nAulas = (m.aulas || []).length;
      const aberto = modulosAbertos.has(m.id);
      return `
        <article class="admin-module${aberto ? '' : ' is-recolhido'}" data-modulo-id="${m.id}" draggable="false">
          <div class="admin-module__head">
            <div class="admin-module__title-row">
              <!-- A pegada é o único ponto arrastável do card: se o
                   article inteiro fosse draggable, selecionar texto
                   dentro dos campos viraria arrasto. -->
              <div class="handle" data-arrasta="${m.id}" draggable="true"
                   title="Arraste para reordenar">
                <button data-modulo-up="${m.id}" ${idx === 0 ? 'disabled' : ''} aria-label="Mover módulo para cima">${I.chevronUp}</button>
                <span class="handle__pega" aria-hidden="true">${I.grip}</span>
                <button data-modulo-down="${m.id}" ${idx === total - 1 ? 'disabled' : ''} aria-label="Mover módulo para baixo">${I.chevronDownSmall}</button>
              </div>
              <input class="input" data-modulo-field="numero" data-modulo-id="${m.id}" value="${esc(m.numero)}" placeholder="01" style="text-align:center;font-family:'Playfair Display',serif;font-weight:600;font-size:1rem">
              <input class="input" data-modulo-field="titulo" data-modulo-id="${m.id}" value="${esc(m.titulo)}" placeholder="Título do módulo">
              <input class="input" data-modulo-field="duracao" data-modulo-id="${m.id}" value="${esc(m.duracao || '')}" placeholder="Ex.: 4h 20min">
              <button class="mod-acao mod-acao--abrir" data-modulo-toggle="${m.id}" aria-expanded="false">
                <span class="mod-acao__n" data-contagem-aulas>${nAulas}</span>
                <span class="mod-acao__rot">${nAulas === 1 ? 'aula' : 'aulas'}</span>
                <span class="mod-acao__seta" aria-hidden="true">${I.chevronDownSmall}</span>
              </button>
              <button class="mod-acao mod-acao--excluir" data-modulo-delete="${m.id}">
                ${I.trash}<span>Excluir</span>
              </button>
            </div>
          </div>

          <!-- Confirmação no lugar do confirm() do navegador: aqui dá
               para dizer QUANTAS aulas somem junto, que é a informação
               que evita o clique arrependido. -->
          <div class="mod-confirma" data-modulo-confirma="${m.id}" hidden>
            <span class="mod-confirma__txt">
              Excluir <b>${esc(m.titulo) || 'este módulo'}</b>${nAulas ? ` e suas <b>${nAulas} ${nAulas === 1 ? 'aula' : 'aulas'}</b>` : ''}? Não dá para desfazer.
            </span>
            <button class="mod-confirma__no" data-modulo-cancel="${m.id}">Cancelar</button>
            <button class="mod-confirma__sim" data-modulo-confirm="${m.id}">Excluir mesmo assim</button>
          </div>

          <div class="admin-module__body">
            <label class="field-label">Resumo</label>
            <textarea class="input" data-modulo-field="resumo" data-modulo-id="${m.id}" placeholder="Breve descrição do módulo">${esc(m.resumo || '')}</textarea>
            <span class="overline" style="font-size:0.62rem;display:block;margin-top:1.25rem">Aulas (${nAulas})</span>
            <div class="admin-aulas">${aulasHtml}</div>
            <button class="btn-add-aula" data-aula-add="${m.id}">${I.plus} Adicionar aula</button>
          </div>
        </article>`;
    }

    // ============ DISPONIBILIDADE DA AULA ============
    // Aula "em breve" continua na lista do aluno, com cadeado, e o servidor
    // não manda vídeo nem material dela. Serve pra montar o curso inteiro
    // antes de gravar e ir soltando aula por aula.
    function disponibilidadeHtml(aula) {
      const ligada = aula.disponivel !== false;
      return `
        <button type="button" class="aula-status ${ligada ? 'is-on' : 'is-off'}"
                data-aula-toggle="${aula.id}" role="switch" aria-checked="${ligada}"
                title="${ligada ? 'Aula visível para o aluno — clique para deixar em breve' : 'Aula em breve — clique para liberar'}">
          <span class="aula-status__luz" aria-hidden="true"></span>
          <span class="aula-status__txt">${ligada ? 'No ar' : 'Em breve'}</span>
        </button>`;
    }

    function bindDisponibilidade(main, curso) {
      main.querySelectorAll('[data-aula-toggle]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const found = findAulaWithModulo(curso, btn.dataset.aulaToggle);
          if (!found) return;
          const novo = found.aula.disponivel === false;   // desligada → liga
          found.aula.disponivel = novo;
          btn.disabled = true;
          try {
            await Data.upsertAula(found.aula, found.modulo.id);
          } catch (err) {
            found.aula.disponivel = !novo;
            toastErr(err);
            btn.disabled = false;
            return;
          }
          btn.disabled = false;
          btn.classList.toggle('is-on', novo);
          btn.classList.toggle('is-off', !novo);
          btn.setAttribute('aria-checked', String(novo));
          btn.title = novo
            ? 'Aula visível para o aluno — clique para deixar em breve'
            : 'Aula em breve — clique para liberar';
          const txt = btn.querySelector('.aula-status__txt');
          if (txt) txt.textContent = novo ? 'No ar' : 'Em breve';
          const linha = btn.closest('.admin-aula');
          if (linha) linha.classList.toggle('is-embreve', !novo);
          toast(novo ? 'Aula liberada para os alunos' : 'Aula marcada como "em breve"');
        });
      });
    }

    // ============ CAPA DO CURSO (imagem) ============
    // Sobe pela rota própria (/cursos/:id/capa) — não passa pelo PUT do
    // curso, que salva só texto. Sem capa, o card volta ao ícone.
    function capaHtml(curso) {
      const src = DMC_capaSrc(curso);
      return `
        <div class="capa-preview ${src ? '' : 'is-vazia'}" data-capa-preview>
          ${src
            ? `<img src="${esc(src)}" alt="Capa de ${esc(curso.titulo)}">`
            : `<span class="capa-preview__vazio">${I.imagem} Sem capa</span>`}
        </div>
        <div class="capa-acoes">
          <p class="capa-dica" data-capa-status>Imagem do card na loja e no painel do aluno. JPG, PNG, WebP ou GIF — até ${CAPA_MAX_MB} MB. Proporção 16:9 (ex.: 1280×720) é a que melhor encaixa.</p>
          <div class="capa-botoes">
            <label class="btn-mini" title="Escolher uma imagem do seu computador">
              ${I.upload} ${src ? 'Trocar imagem' : 'Enviar imagem'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden data-capa-file>
            </label>
            ${src ? `<button type="button" class="btn-mini danger" data-capa-del>${I.trash} Remover capa</button>` : ''}
          </div>
        </div>`;
    }

    function refreshCapa(curso) {
      const wrap = document.querySelector('[data-capa-wrap]');
      if (!wrap) return;
      wrap.innerHTML = capaHtml(curso);
      bindCapa(curso);
      renderSidebar();
    }

    function bindCapa(curso) {
      const wrap = document.querySelector('[data-capa-wrap]');
      if (!wrap) return;
      const status = wrap.querySelector('[data-capa-status]');
      const setStatus = (msg) => { if (status) status.textContent = msg; };

      const fileInput = wrap.querySelector('[data-capa-file]');
      if (fileInput) fileInput.addEventListener('change', async () => {
        const arquivo = (fileInput.files || [])[0];
        fileInput.value = '';
        if (!arquivo) return;
        if (!/^image\//.test(arquivo.type)) { alert(`"${arquivo.name}" não é uma imagem.`); return; }
        if (arquivo.size > CAPA_MAX_MB * 1024 * 1024) {
          alert(`A imagem tem ${DMC_formatBytes(arquivo.size)} — o limite é ${CAPA_MAX_MB} MB.`);
          return;
        }
        setStatus(`Enviando ${arquivo.name}…`);
        try {
          curso.capaUrl = await Data.uploadCapa(curso.id, arquivo);
        } catch (err) { toastErr(err); setStatus('Não foi possível enviar a imagem.'); return; }
        refreshCapa(curso);
        toast('Capa atualizada');
      });

      const delBtn = wrap.querySelector('[data-capa-del]');
      if (delBtn) delBtn.addEventListener('click', async () => {
        if (!confirm('Remover a capa deste curso? O card volta a mostrar o ícone.')) return;
        try { await Data.removerCapa(curso.id); }
        catch (err) { toastErr(err); return; }
        curso.capaUrl = '';
        refreshCapa(curso);
        toast('Capa removida');
      });
    }

    // ============ ROTEIRO DE GRAVAÇÃO (só admin) ============
    // Anotação interna da aula: resumo do vídeo, tópicos, deixas. A API só
    // devolve esse texto pra conta admin — o aluno nunca recebe o campo.
    function resumoRoteiro(texto) {
      const limpo = (texto || '').trim();
      if (!limpo) return { chip: 'em branco', vazio: true };
      const palavras = limpo.split(/\s+/).length;
      return { chip: `${palavras} ${palavras === 1 ? 'palavra' : 'palavras'}`, vazio: false };
    }

    function roteiroHtml(aula) {
      const texto = aula.roteiro || '';
      const aberto = roteirosAbertos.has(aula.id);
      const info = resumoRoteiro(texto);
      return `
        <button type="button" class="roteiro-head" data-roteiro-toggle aria-expanded="${aberto}">
          ${I.roteiro}
          <span class="roteiro-head__label">Roteiro de gravação</span>
          <span class="roteiro-head__chip ${info.vazio ? 'is-vazio' : ''}" data-roteiro-chip>${info.chip}</span>
          <span class="roteiro-head__seta" aria-hidden="true">${I.chevronDownSmall}</span>
        </button>
        <div class="roteiro-body" data-roteiro-body ${aberto ? '' : 'hidden'}>
          <p class="roteiro-hint">${I.lock} Visível só aqui no painel administrativo — não aparece para o aluno.</p>
          <textarea class="input roteiro-txt" data-roteiro-txt rows="6" maxlength="20000"
            placeholder="Resumo do vídeo: tópicos na ordem de gravação, deixas, exemplos a citar, o que mostrar na tela…">${esc(texto)}</textarea>
          <div class="roteiro-foot">
            <span class="roteiro-status" data-roteiro-status>Salva sozinho ao sair do campo.</span>
            <button type="button" class="btn-mini" data-roteiro-save>${I.check} Salvar roteiro</button>
          </div>
        </div>`;
    }

    function bindRoteiro(aula, moduloId) {
      const wrap = document.querySelector(`[data-roteiro-wrap="${aula.id}"]`);
      if (!wrap) return;
      const head = wrap.querySelector('[data-roteiro-toggle]');
      const body = wrap.querySelector('[data-roteiro-body]');
      const txt = wrap.querySelector('[data-roteiro-txt]');
      const chip = wrap.querySelector('[data-roteiro-chip]');
      const status = wrap.querySelector('[data-roteiro-status]');
      const btnSalvar = wrap.querySelector('[data-roteiro-save]');
      if (!head || !body || !txt) return;

      const setStatus = (msg, tipo) => {
        if (!status) return;
        status.textContent = msg;
        status.className = 'roteiro-status' + (tipo ? ' is-' + tipo : '');
      };

      // Textarea cresce com o texto até um teto — roteiro longo sem rolagem
      // dupla, mas sem esticar a linha da aula até o infinito.
      function ajustaAltura() {
        txt.style.height = 'auto';
        txt.style.height = Math.min(txt.scrollHeight + 2, 520) + 'px';
      }

      function pintaChip() {
        if (!chip) return;
        const info = resumoRoteiro(txt.value);
        chip.textContent = info.chip;
        chip.classList.toggle('is-vazio', info.vazio);
      }

      head.addEventListener('click', () => {
        const abrindo = body.hidden;
        body.hidden = !abrindo;
        head.setAttribute('aria-expanded', String(abrindo));
        wrap.classList.toggle('is-aberto', abrindo);
        if (abrindo) { roteirosAbertos.add(aula.id); ajustaAltura(); txt.focus(); }
        else roteirosAbertos.delete(aula.id);
      });

      txt.addEventListener('input', () => {
        ajustaAltura();
        pintaChip();
        setStatus('Alterações não salvas…', 'sujo');
      });

      async function salvar() {
        const valor = txt.value;
        if (valor === (aula.roteiro || '')) { setStatus('Roteiro salvo.', 'ok'); return true; }
        const anterior = aula.roteiro || '';
        aula.roteiro = valor;
        setStatus('Salvando…');
        try {
          await Data.upsertAula(aula, moduloId);
        } catch (err) {
          aula.roteiro = anterior;
          toastErr(err);
          setStatus('Não foi possível salvar. Tente de novo.', 'erro');
          return false;
        }
        pintaChip();
        setStatus('Roteiro salvo.', 'ok');
        return true;
      }

      txt.addEventListener('blur', () => { salvar(); });
      // mousedown antes do blur: sem isto o clique no botão dispara dois PUTs.
      if (btnSalvar) {
        btnSalvar.addEventListener('mousedown', e => e.preventDefault());
        btnSalvar.addEventListener('click', async () => { if (await salvar()) toast('Roteiro salvo'); });
      }

      if (roteirosAbertos.has(aula.id)) { wrap.classList.add('is-aberto'); ajustaAltura(); }
    }

    // ============ MATERIAIS DE APOIO (PDF) ============
    function hostDe(url) {
      try { return new URL(url).hostname.replace(/^www\./, ''); }
      catch { return 'link'; }
    }

    function materiaisHtml(aula) {
      const mats = aula.materiais || [];
      const itens = mats.length
        ? mats.map(m => `
            <div class="mat-row" data-mat-id="${esc(m.id)}">
              <span class="mat-row__badge ${m.tipo === 'link' ? 'is-link' : ''}">${m.tipo === 'link' ? 'LINK' : 'PDF'}</span>
              <input class="input mat-row__nome" data-mat-nome value="${esc(m.nome)}" placeholder="Nome exibido para o aluno">
              <span class="mat-row__meta" title="${esc(m.tipo === 'link' ? m.url : m.nome)}">${m.tipo === 'link' ? esc(hostDe(m.url)) : DMC_formatBytes(m.tamanho)}</span>
              <button class="btn-icon" data-mat-open title="Abrir material">${I.download}</button>
              <button class="btn-icon danger" data-mat-del title="Remover material">${I.trash}</button>
            </div>`).join('')
        : `<p class="mat-empty">Nenhum material anexado nesta aula.</p>`;

      return `
        <div class="aula-mats__head">
          <span class="aula-mats__label" data-mat-status>${I.file} Material de apoio${mats.length ? ` · ${mats.length}` : ''}</span>
          <div class="aula-mats__actions">
            <label class="btn-mini" title="Enviar um PDF do seu computador">
              ${I.upload} Anexar PDF
              <input type="file" accept="application/pdf,.pdf" multiple hidden data-mat-file>
            </label>
            <button type="button" class="btn-mini" data-mat-link>${I.plus} Link externo</button>
          </div>
        </div>
        <div class="mat-list">${itens}</div>`;
    }

    function refreshMateriais(aula) {
      const wrap = document.querySelector(`[data-mat-wrap="${aula.id}"]`);
      if (!wrap) return;
      wrap.innerHTML = materiaisHtml(aula);
      bindMateriais(aula);
    }

    function bindMateriais(aula) {
      const wrap = document.querySelector(`[data-mat-wrap="${aula.id}"]`);
      if (!wrap) return;
      const status = wrap.querySelector('[data-mat-status]');
      const setStatus = (txt) => { if (status) status.innerHTML = txt; };

      // ----- Anexar PDF (upload) -----
      const fileInput = wrap.querySelector('[data-mat-file]');
      if (fileInput) fileInput.addEventListener('change', async () => {
        const arquivos = Array.from(fileInput.files || []);
        fileInput.value = '';
        if (!arquivos.length) return;

        aula.materiais = aula.materiais || [];
        let enviados = 0;
        for (const arquivo of arquivos) {
          if (!/pdf$/i.test(arquivo.type) && !/\.pdf$/i.test(arquivo.name)) {
            alert(`"${arquivo.name}" não é um PDF.`);
            continue;
          }
          setStatus(`${I.upload} Enviando ${arquivo.name}… (${enviados + 1}/${arquivos.length})`);
          try {
            const material = await Data.uploadMaterial(aula.id, arquivo);
            aula.materiais.push(material);
            enviados++;
          } catch (err) { toastErr(err); }
        }
        refreshMateriais(aula);
        if (enviados) toast(enviados > 1 ? `${enviados} materiais anexados` : 'Material anexado');
      });

      // ----- Link externo -----
      const linkBtn = wrap.querySelector('[data-mat-link]');
      if (linkBtn) linkBtn.addEventListener('click', async () => {
        const url = (prompt('Cole o link do material (Drive, Dropbox, PDF hospedado…):') || '').trim();
        if (!url) return;
        const padrao = decodeURIComponent((url.split('?')[0].split('/').pop() || 'Material externo'));
        const nome = (prompt('Nome que o aluno vai ver:', padrao) || padrao).trim();
        try {
          const material = await Data.addMaterialLink(aula.id, nome, url);
          aula.materiais = aula.materiais || [];
          aula.materiais.push(material);
        } catch (err) { toastErr(err); return; }
        refreshMateriais(aula);
        toast('Link adicionado');
      });

      // ----- Renomear / abrir / remover -----
      wrap.querySelectorAll('.mat-row').forEach(row => {
        const matId = row.dataset.matId;
        const material = (aula.materiais || []).find(m => m.id === matId);
        if (!material) return;

        const nomeInput = row.querySelector('[data-mat-nome]');
        if (nomeInput) nomeInput.addEventListener('blur', async () => {
          const novo = nomeInput.value.trim();
          if (!novo || novo === material.nome) { nomeInput.value = material.nome; return; }
          try { await Data.renameMaterial(aula.id, matId, novo); }
          catch (err) { toastErr(err); nomeInput.value = material.nome; return; }
          material.nome = novo;
          toast('Salvo');
        });

        const openBtn = row.querySelector('[data-mat-open]');
        if (openBtn) openBtn.addEventListener('click', async () => {
          try { await DMC_abrirMaterial(material); }
          catch (err) { toastErr(err); }
        });

        const delBtn = row.querySelector('[data-mat-del]');
        if (delBtn) delBtn.addEventListener('click', async () => {
          if (!confirm(`Remover o material "${material.nome}"?`)) return;
          try { await Data.deleteMaterial(aula.id, matId); }
          catch (err) { toastErr(err); return; }
          aula.materiais = (aula.materiais || []).filter(m => m.id !== matId);
          refreshMateriais(aula);
          toast('Material removido');
        });
      });
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
      // ----- Excluir módulo: pede confirmação no próprio card -----
      function fecharConfirmacoes() {
        main.querySelectorAll('[data-modulo-confirma]').forEach(c => { c.hidden = true; });
        main.querySelectorAll('.admin-module').forEach(n => n.classList.remove('is-em-risco'));
      }
      main.querySelectorAll('[data-modulo-delete]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.moduloDelete;
        const caixa = main.querySelector(`[data-modulo-confirma="${id}"]`);
        const jaAberta = caixa && !caixa.hidden;
        fecharConfirmacoes();
        if (caixa && !jaAberta) {
          caixa.hidden = false;
          b.closest('.admin-module').classList.add('is-em-risco');
          const sim = caixa.querySelector('[data-modulo-confirm]');
          if (sim) sim.focus();
        }
      }));
      main.querySelectorAll('[data-modulo-cancel]').forEach(b => b.addEventListener('click', fecharConfirmacoes));
      main.querySelectorAll('[data-modulo-confirm]').forEach(b => b.addEventListener('click', async () => {
        const id = b.dataset.moduloConfirm;
        b.disabled = true;
        try { await Data.deleteModulo(id); }
        catch (err) { b.disabled = false; toastErr(err); return; }
        await Data.refresh();
        refreshSnapshot();
        toast('Módulo excluído');
        render();
      }));

      // ----- Abrir/recolher -----
      function alternar(node, abrir) {
        const fechado = abrir == null ? !node.classList.contains('is-recolhido') : !abrir;
        node.classList.toggle('is-recolhido', fechado);
        const bt = node.querySelector('[data-modulo-toggle]');
        if (bt) bt.setAttribute('aria-expanded', String(!fechado));
        // Registrado aqui e lido no render: é o que faz o módulo
        // continuar aberto depois de adicionar uma aula.
        if (fechado) modulosAbertos.delete(node.dataset.moduloId);
        else modulosAbertos.add(node.dataset.moduloId);
      }
      main.querySelectorAll('[data-modulo-toggle]').forEach(b => {
        b.addEventListener('click', () => alternar(b.closest('.admin-module')));
      });
      // Clicar no cabeçalho também abre — alvo grande, menos mira.
      main.querySelectorAll('.admin-module__head').forEach(head => {
        head.addEventListener('click', ev => {
          if (ev.target.closest('input, textarea, button')) return;
          alternar(head.closest('.admin-module'));
        });
      });
      // ----- Arrastar para reordenar -----
      // Levar o módulo 10 ao topo custava 9 cliques; aqui é um gesto só.
      // O drop calcula a posição pela metade do card sob o cursor.
      const listaModulos = main.querySelector('#modules-edit');
      if (listaModulos) {
        let arrastando = null;
        listaModulos.querySelectorAll('[data-arrasta]').forEach(pega => {
          pega.addEventListener('dragstart', ev => {
            arrastando = pega.closest('.admin-module');
            arrastando.classList.add('is-arrastando');
            ev.dataTransfer.effectAllowed = 'move';
            // Firefox só inicia o arrasto se algo for escrito aqui.
            ev.dataTransfer.setData('text/plain', arrastando.dataset.moduloId);
          });
          pega.addEventListener('dragend', () => {
            if (arrastando) arrastando.classList.remove('is-arrastando');
            listaModulos.querySelectorAll('.admin-module').forEach(n => n.classList.remove('is-alvo'));
            arrastando = null;
          });
        });

        listaModulos.addEventListener('dragover', ev => {
          if (!arrastando) return;
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'move';
          const sobre = ev.target.closest('.admin-module');
          listaModulos.querySelectorAll('.admin-module').forEach(n => n.classList.remove('is-alvo'));
          if (sobre && sobre !== arrastando) sobre.classList.add('is-alvo');
        });

        listaModulos.addEventListener('drop', ev => {
          if (!arrastando) return;
          ev.preventDefault();
          const sobre = ev.target.closest('.admin-module');
          if (!sobre || sobre === arrastando) return;
          const nodes = [...listaModulos.querySelectorAll('.admin-module')];
          const de = nodes.indexOf(arrastando);
          let para = nodes.indexOf(sobre);
          // Soltou na metade de baixo do card? Entra depois dele.
          const r = sobre.getBoundingClientRect();
          if (ev.clientY > r.top + r.height / 2 && para < de) para += 1;
          else if (ev.clientY < r.top + r.height / 2 && para > de) para -= 1;
          moverModulo(curso, de, para);
        });
      }

      const btAbrir = main.querySelector('#btn-expandir-tudo');
      const btFechar = main.querySelector('#btn-recolher-tudo');
      if (btAbrir) btAbrir.addEventListener('click', () => main.querySelectorAll('.admin-module').forEach(n => alternar(n, true)));
      if (btFechar) btFechar.addEventListener('click', () => main.querySelectorAll('.admin-module').forEach(n => alternar(n, false)));

      // ----- Busca -----
      const filtro = main.querySelector('#filtro-modulos');
      if (filtro) {
        const vazio = main.querySelector('#modulos-vazio');
        filtro.addEventListener('input', () => {
          const termo = filtro.value.trim().toLowerCase();
          let achou = 0;
          main.querySelectorAll('.admin-module').forEach(node => {
            const mod = curso.modulos.find(x => x.id === node.dataset.moduloId);
            if (!mod) return;
            if (!termo) {
              node.hidden = false;
              node.querySelectorAll('.admin-aula').forEach(a => { a.hidden = false; });
              alternar(node, false);
              achou++;
              return;
            }
            const noModulo = `${mod.numero} ${mod.titulo}`.toLowerCase().includes(termo);
            const aulasCasadas = (mod.aulas || []).filter(a => (a.titulo || '').toLowerCase().includes(termo));
            const casou = noModulo || aulasCasadas.length > 0;
            node.hidden = !casou;
            if (!casou) return;
            achou++;
            // Casou por aula: abre e mostra só as aulas que interessam.
            alternar(node, !noModulo);
            node.querySelectorAll('.admin-aula').forEach(el => {
              el.hidden = noModulo ? false : !aulasCasadas.some(a => a.id === el.dataset.aulaId);
            });
          });
          if (vazio) vazio.hidden = achou > 0;
        });
      }

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
          materiais: [],
          roteiro: '',
          disponivel: true,
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

      // ----- Disponibilidade de cada aula -----
      bindDisponibilidade(main, curso);

      // ----- Capa do curso -----
      bindCapa(curso);

      // ----- Materiais de apoio e roteiro de cada aula -----
      (curso.modulos || []).forEach(m => (m.aulas || []).forEach(a => {
        bindMateriais(a);
        bindRoteiro(a, m.id);
      }));
    }

    /**
     * Move um módulo de posição.
     *
     * Antes: trocava dois módulos, mandava dois PUT completos, recarregava
     * o catálogo inteiro e reconstruía a página — 2,5 s e 4 requisições por
     * clique, com todos os módulos recolhendo no caminho.
     *
     * Agora a lista muda na tela imediatamente e a ordem vai ao servidor
     * numa única chamada, em segundo plano. Se o servidor recusar, a
     * ordem antiga volta — o otimismo é desfeito, não escondido.
     */
    async function moverModulo(curso, de, para) {
      const lista = curso.modulos;
      if (de === para || de < 0 || para < 0 || de >= lista.length || para >= lista.length) return;

      const anterior = lista.slice();
      const [item] = lista.splice(de, 1);
      lista.splice(para, 0, item);
      lista.forEach((m, i) => { m.ordem = i + 1; });
      redesenharModulos(curso);

      try {
        await Data.reordenarModulos(curso.id, lista.map(m => m.id));
        toast('Ordem salva');
      } catch (err) {
        curso.modulos = anterior;
        curso.modulos.forEach((m, i) => { m.ordem = i + 1; });
        redesenharModulos(curso);
        toastErr(err);
      }
    }

    /** Redesenha só a lista de módulos, sem tocar no resto do editor. */
    function redesenharModulos(curso) {
      const alvo = document.querySelector('#modules-edit');
      if (!alvo) return;
      alvo.innerHTML = (curso.modulos || [])
        .map((m, i) => renderModulo(m, i, curso.modulos.length)).join('');
      bindEditorEvents();
    }

    async function swapModulos(curso, i, j) {
      await moverModulo(curso, i, j);
      return;
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
      container.innerHTML = cursos.map(c => {
        const meta = [c.modalidade || 'Online', c.cargaHoraria].filter(Boolean).join(' · ');
        const totalAulas = (c.modulos || []).reduce((s, m) => s + (m.aulas || []).length, 0);
        return `
        <label class="lib-curso">
          <input type="checkbox" value="${c.id}">
          <span class="lib-curso__marca" aria-hidden="true"></span>
          <span class="lib-curso__texto">
            <span class="lib-curso__title">${esc(c.titulo) || '<em>(curso sem título)</em>'}</span>
            <span class="lib-curso__meta">${esc(meta)}${totalAulas ? ` · ${totalAulas} aulas` : ''}</span>
          </span>
        </label>`;
      }).join('');

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
              <span class="lib-row__quem">
                <strong>${esc(email)}</strong>
                <span class="lib-row__n">${ids.length} ${ids.length === 1 ? 'curso' : 'cursos'}</span>
              </span>
              <button class="lib-row__tudo" data-revoke-all="${esc(email)}">Revogar tudo</button>
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
    // ============ AULAS AO VIVO ============
    const Lives = window.DMC_Lives;
    const quandoData = window.DMC_formatarDataHora;

    /** <input type="datetime-local"> não aceita ISO com fuso: precisa do
     *  horário local já formatado como YYYY-MM-DDTHH:MM. */
    function paraInputLocal(iso) {
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return '';
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    function preencherCursosDaLive() {
      const sel = document.querySelector('#live-curso');
      if (!sel) return;
      const atual = sel.value;
      sel.innerHTML = (Data.get().cursos || [])
        .map(c => `<option value="${esc(c.id)}">${esc(c.titulo) || '(curso sem título)'}</option>`)
        .join('');
      if (atual) sel.value = atual;
    }

    async function renderLivesUI() {
      const list = document.querySelector('#lives-list');
      if (!list) return;
      preencherCursosDaLive();

      let itens = [];
      try {
        itens = await Lives.listar();
      } catch (err) {
        list.innerHTML = `<div class="lib-empty">Não foi possível carregar: ${esc(err.message)}</div>`;
        return;
      }

      const counter = document.querySelector('#lives-count');
      if (counter) counter.textContent = itens.length;

      const btn = document.querySelector('#btn-lives-refresh');
      if (btn) btn.innerHTML = `${I.refresh} Atualizar`;

      if (!itens.length) {
        list.innerHTML = '<div class="lib-empty">Nenhum encontro agendado. Use o formulário ao lado para criar o primeiro.</div>';
        return;
      }

      const rotulo = { 'ao-vivo': 'AO VIVO AGORA', 'agendada': 'Agendada', 'encerrada': 'Encerrada' };
      list.innerHTML = itens.map(l => `
        <div class="lib-row">
          <div class="lib-row__head">
            <span class="lib-row__quem">
              <strong>${esc(l.titulo)}</strong>
              <span class="lib-row__n">${esc(rotulo[l.status] || l.status)}</span>
            </span>
            <span style="display:flex;gap:0.4rem">
              <button class="lib-row__tudo" data-live-editar="${esc(l.id)}">Editar</button>
              <button class="lib-row__tudo" data-live-apagar="${esc(l.id)}">Remover</button>
            </span>
          </div>
          <div class="lib-row__chips" style="flex-direction:column;align-items:flex-start;gap:0.2rem">
            <span class="lib-curso__meta">${esc(l.cursoTitulo)}</span>
            <span class="lib-curso__meta">${esc(quandoData(l.inicioEm))} · ${l.duracaoMin} min · ${esc(l.plataforma)}</span>
          </div>
        </div>`).join('');

      list.querySelectorAll('[data-live-editar]').forEach(b => b.addEventListener('click', () => {
        const l = itens.find(x => x.id === b.dataset.liveEditar);
        if (!l) return;
        document.querySelector('#live-id').value = l.id;
        document.querySelector('#live-curso').value = l.cursoId;
        document.querySelector('#live-titulo').value = l.titulo;
        document.querySelector('#live-inicio').value = paraInputLocal(l.inicioEm);
        document.querySelector('#live-plataforma').value = l.plataforma === 'Online' ? '' : l.plataforma;
        document.querySelector('#live-duracao').value = l.duracaoMin;
        document.querySelector('#live-url').value = l.url || '';
        document.querySelector('#live-descricao').value = l.descricao || '';
        document.querySelector('#lives-pane').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));

      list.querySelectorAll('[data-live-apagar]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Remover este encontro da agenda?')) return;
        try { await Lives.apagar(b.dataset.liveApagar); }
        catch (err) { toastErr(err); return; }
        toast('Encontro removido');
        renderLivesUI();
      }));
    }

    function limparFormLive() {
      ['#live-id', '#live-titulo', '#live-inicio', '#live-plataforma', '#live-url', '#live-descricao']
        .forEach(sel => { const el = document.querySelector(sel); if (el) el.value = ''; });
      const dur = document.querySelector('#live-duracao');
      if (dur) dur.value = 90;
    }

    const liveForm = document.querySelector('#live-form');
    if (liveForm) {
      liveForm.addEventListener('submit', async e => {
        e.preventDefault();
        const inicio = document.querySelector('#live-inicio').value;
        if (!inicio) { toast('Informe data e hora'); return; }
        const btn = liveForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
          await Lives.salvar({
            // Sem id preenchido é encontro novo — o servidor faz upsert.
            id: document.querySelector('#live-id').value || Data.uid('live'),
            cursoId: document.querySelector('#live-curso').value,
            titulo: document.querySelector('#live-titulo').value,
            // O <input datetime-local> devolve horário local; o Date converte pra UTC.
            inicioEm: new Date(inicio).toISOString(),
            duracaoMin: Number(document.querySelector('#live-duracao').value) || 90,
            plataforma: document.querySelector('#live-plataforma').value,
            url: document.querySelector('#live-url').value,
            descricao: document.querySelector('#live-descricao').value
          });
        } catch (err) {
          toastErr(err);
          btn.disabled = false;
          return;
        }
        btn.disabled = false;
        limparFormLive();
        toast('Encontro salvo');
        renderLivesUI();
      });
    }
    document.querySelector('#live-clear')?.addEventListener('click', limparFormLive);
    document.querySelector('#btn-lives-refresh')?.addEventListener('click', () => renderLivesUI());

    // ============ DÚVIDAS DOS ALUNOS ============
    // Fila de perguntas feitas nas aulas. Responder daqui é o mesmo POST
    // que o instrutor faria na página da aula — muda só de onde ele parte.
    const Duvidas = window.DMC_Duvidas;
    const quando = window.DMC_formatarQuando;

    async function renderDuvidasUI() {
      const box = document.querySelector('#duvidas-admin');
      if (!box) return;
      box.innerHTML = '<div class="lib-empty">Carregando dúvidas…</div>';

      let dados;
      try {
        dados = await Duvidas.pendentes();
      } catch (err) {
        box.innerHTML = `<div class="lib-empty">Não foi possível carregar: ${esc(err.message)}</div>`;
        return;
      }

      const itens = dados.itens || [];
      const btnRefresh = document.querySelector('#btn-duvidas-refresh');
      if (btnRefresh) {
        btnRefresh.innerHTML = `${I.refresh} Atualizar${dados.pendentes ? ` · ${dados.pendentes} sem resposta` : ''}`;
      }

      if (!itens.length) {
        box.innerHTML = '<div class="lib-empty">Nenhuma dúvida em aberto. Tudo respondido por aqui.</div>';
        return;
      }

      box.innerHTML = itens.map(d => `
        <article class="dv-row ${d.respondida ? 'is-respondida' : ''}" data-dv="${esc(d.id)}">
          <div class="dv-row__head">
            <span class="duvida__avatar">${esc(d.autorIniciais)}</span>
            <div class="dv-row__ident">
              <span class="dv-row__autor">${esc(d.autorNome)}</span>
              <span class="dv-row__origem">${esc(d.cursoTitulo)} · ${esc(d.aulaTitulo)}</span>
            </div>
            <span class="duvida__quando">${esc(quando(d.createdAt))}</span>
            <a class="btn-ghost dv-row__link" href="aula.html?id=${encodeURIComponent(d.aulaId)}" target="_blank" rel="noopener">Abrir aula</a>
          </div>
          <p class="duvida__texto">${esc(d.texto)}</p>
          <form class="resposta-form" data-dv-responder="${esc(d.id)}">
            <textarea class="input" rows="2" maxlength="8000" placeholder="Responder como instrutor…"></textarea>
            <button class="btn-primary" type="submit" style="width:auto;margin-top:0;gap:0.5rem">${I.reply} Responder</button>
          </form>
        </article>`).join('');

      box.querySelectorAll('[data-dv-responder]').forEach(form => {
        form.addEventListener('submit', async e => {
          e.preventDefault();
          const area = form.querySelector('textarea');
          const texto = area.value.trim();
          if (texto.length < 2) { area.focus(); return; }
          const btn = form.querySelector('button[type="submit"]');
          btn.disabled = true;
          try {
            await Duvidas.responder(form.dataset.dvResponder, texto);
          } catch (err) {
            toastErr(err);
            btn.disabled = false;
            return;
          }
          toast('Resposta publicada');
          renderDuvidasUI();
        });
      });
    }

    const btnDuvidasRefresh = document.querySelector('#btn-duvidas-refresh');
    if (btnDuvidasRefresh) {
      btnDuvidasRefresh.innerHTML = `${I.refresh} Atualizar`;
      btnDuvidasRefresh.addEventListener('click', () => renderDuvidasUI());
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
