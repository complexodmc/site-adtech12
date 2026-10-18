/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/tour.js (F0s)
   Spec: docs/dmc/PORTAL-UX.md §5.7 (tour de primeiro acesso), §11;
   PORTAL-ACADEMICO.md §6.5 (?v= por constante no shell.js), §7.6.

   Carregado SOB DEMANDA por js/shell.js (DMC_Shell.tour.iniciar).
   Não cria global: ao carregar, entrega o motor ao shell pelo evento
   interno `dmc:tour:motor` (detail = { executar }) e não faz mais
   nada. Nenhuma rede, nenhum armazenamento (quem grava "visto" é o
   shell, em dmc:tour:<chave>:<userId>).

   executar({ chave, area, papel, largura }) → Promise<'concluido'|'pulado'>
   - 5 passos ancorados no elemento real ([data-tour] do shell e da
     página); alvo ausente ou invisível → o passo cai no botão Menu
     (gaveta) e, sem ele, é pulado. No celular os alvos mudam (Menu,
     ícone de busca, sino, conta).
   - pf-tour: role=dialog aria-modal=false, SEM véu; "Passo n de N",
     [Pular tour] [Anterior] [Próximo]/[Concluir]; foco no título do
     passo; Esc = Pular; ao terminar, foco no <main>.
   - O alvo ganha só o contorno (classe pf-tour__alvo); troca de passo
     por fade de 160 ms (zerado com movimento reduzido, tokens.css).
   ============================================================= */
(function () {
  'use strict';

  const doc = document;

  const TEXTO_EQUIPE_MENU = 'Suas áreas: ensino e relacionamento (e, para a coordenação, secretaria e gestão).';
  const TEXTO_CONTEUDO_PROFESSOR = 'Plano de ensino e materiais de cada módulo.';
  const TEXTO_CONTEUDO_COORDENACAO = 'Plano de ensino, materiais, aulas e avaliações de cada módulo.';

  // alvos: lista de seletores por faixa de largura (p < 768 ≤ m < 1024 ≤ g < 1280 ≤ x).
  function passosDe(area, papel) {
    if (area === 'backoffice') {
      return [
        { titulo: 'Menu', texto: TEXTO_EQUIPE_MENU, alvos: { gaveta: ['[data-tour="menu"]'], lateral: ['[data-tour="menu-lateral"]'] } },
        { titulo: 'Indicadores', texto: 'O que pede ação hoje. Cada número abre a fila correspondente.', alvos: { todas: ['[data-tour="indicadores"]'] }, semReserva: true },
        { titulo: 'Conteúdo', texto: papel === 'admin' ? TEXTO_CONTEUDO_COORDENACAO : TEXTO_CONTEUDO_PROFESSOR, alvos: { todas: ['.pf-lateral [data-tour="item-conteudo"]'] } },
        { titulo: 'Correção', texto: 'Dissertativas entregues aguardando a sua nota.', alvos: { todas: ['.pf-lateral [data-tour="item-correcao"]'] } },
        { titulo: 'Notificações', texto: 'Atendimentos atribuídos a você e manifestações encaminhadas chegam aqui. Entregas e dúvidas aparecem nas filas da Visão geral.', alvos: { todas: ['[data-tour="notificacoes"]'] } }
      ];
    }
    return [
      { titulo: 'Menu', texto: 'Aqui ficam suas áreas: estudos, secretaria e ajuda. Documentação reúne documentos, declarações, contratos e comprovantes.', alvos: { gaveta: ['[data-tour="menu"]'], lateral: ['[data-tour="menu-lateral"]'] } },
      { titulo: 'Busca', texto: 'Encontre cursos, aulas, publicações, atendimentos e documentos.', alvos: { todas: ['[data-tour="busca"]'] } },
      { titulo: 'Notificações', texto: 'Correções, documentos revisados, contratos e aulas ao vivo chegam aqui.', alvos: { todas: ['[data-tour="notificacoes"]'] } },
      { titulo: 'Tema e texto', texto: 'Ajuste o tema e o tamanho do texto. Sua escolha fica salva.', alvos: { gaveta: ['[data-tour="perfil"]'], lateral: ['.pf-topo [data-tour="fonte"]'] } },
      { titulo: 'Tutoriais', texto: 'Guias de uso de cada área. Você pode rever este tour pelo menu da sua conta.', alvos: { p: ['[data-tour="perfil"]'], todas: ['[data-tour="tutoriais"]'] } }
    ];
  }

  function visivel(el) {
    if (!el || el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = window.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  function seletoresDoPasso(passo, largura) {
    const a = passo.alvos || {};
    const gaveta = largura === 'p' || largura === 'm';
    return [].concat(a[largura] || [], (gaveta ? a.gaveta : a.lateral) || [], a.todas || []);
  }

  function alvoDoPasso(passo, largura) {
    for (const s of seletoresDoPasso(passo, largura)) {
      const achado = Array.from(doc.querySelectorAll(s)).find(visivel);
      if (achado) return achado;
    }
    if (passo.semReserva) return null;
    const menu = doc.querySelector('[data-tour="menu"]');
    return visivel(menu) ? menu : null;
  }

  function criarPopover() {
    const raiz = doc.createElement('div');
    raiz.className = 'pf-tour';
    raiz.setAttribute('role', 'dialog');
    raiz.setAttribute('aria-modal', 'false');
    raiz.setAttribute('aria-labelledby', 'pf-tour-titulo');
    raiz.setAttribute('aria-describedby', 'pf-tour-texto');

    const passo = doc.createElement('p');
    passo.className = 'pf-tour__passo';
    const titulo = doc.createElement('p');
    titulo.className = 'pf-tour__titulo';
    titulo.id = 'pf-tour-titulo';
    titulo.tabIndex = -1;
    const texto = doc.createElement('p');
    texto.className = 'pf-tour__texto';
    texto.id = 'pf-tour-texto';

    const acoes = doc.createElement('div');
    acoes.className = 'pf-tour__acoes';
    const botao = (acao, classe, rotulo) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = `dmc-btn ${classe}`;
      b.setAttribute('data-pf-tour', acao);
      b.textContent = rotulo;
      return b;
    };
    const pular = botao('pular', 'dmc-btn--link pf-tour__pular', 'Pular tour');
    const navegacao = doc.createElement('div');
    navegacao.className = 'pf-tour__navegacao';
    const anterior = botao('anterior', 'dmc-btn--secondary', 'Anterior');
    const proximo = botao('proximo', 'dmc-btn--primary', 'Próximo');
    navegacao.append(anterior, proximo);
    acoes.append(pular, navegacao);
    raiz.append(passo, titulo, texto, acoes);
    return { raiz, passo, titulo, texto, anterior, proximo, pular };
  }

  function posicionar(pop, alvo) {
    const margem = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const el = pop.raiz;
    el.style.left = '0px';
    el.style.top = '0px';
    const estreita = vw < 480;
    el.classList.toggle('pf-tour--larga', estreita);
    const w = Math.min(el.offsetWidth, vw - 2 * margem);
    const h = el.offsetHeight;
    let left;
    let top;
    if (!alvo) {
      left = Math.max(margem, (vw - w) / 2);
      top = Math.max(margem, vh - h - margem);
    } else {
      const r = alvo.getBoundingClientRect();
      const alto = r.height > vh * 0.5;
      if (alto && !estreita && r.right + margem + w <= vw - margem) {
        // Alvo alto (a lateral): ao lado, perto do topo dele.
        left = r.right + margem;
        top = Math.min(Math.max(margem, r.top + margem), vh - h - margem);
      } else {
        left = estreita ? margem : Math.min(Math.max(margem, r.left), vw - w - margem);
        if (r.bottom + margem + h <= vh - margem) top = r.bottom + margem;
        else if (r.top - margem - h >= margem) top = r.top - margem - h;
        else top = Math.max(margem, vh - h - margem);
      }
    }
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  function focarMain() {
    const main = doc.getElementById('conteudo') || doc.querySelector('main');
    if (!main) return;
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
  }

  function duracaoDaTroca(el) {
    try {
      const d = parseFloat(window.getComputedStyle(el).transitionDuration) * 1000;
      return Number.isFinite(d) ? d : 0;
    } catch { return 0; }
  }

  function executar(opcoes) {
    const o = opcoes || {};
    const largura = o.largura || 'x';
    const passos = passosDe(o.area === 'backoffice' ? 'backoffice' : 'aluno', o.papel)
      .map((p) => ({ ...p, alvo: alvoDoPasso(p, largura) }))
      .filter((p) => p.alvo || !p.semReserva);

    return new Promise((resolver) => {
      if (!passos.length) { resolver('concluido'); return; }
      const pop = criarPopover();
      let indice = 0;
      let alvoAtual = null;
      let quadro = 0;
      let encerrado = false;

      function marcar(alvo) {
        if (alvoAtual) alvoAtual.classList.remove('pf-tour__alvo');
        alvoAtual = alvo;
        if (alvo) {
          alvo.classList.add('pf-tour__alvo');
          if (typeof alvo.scrollIntoView === 'function') alvo.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }

      function desenhar() {
        const p = passos[indice];
        const n = passos.length;
        pop.passo.textContent = `Passo ${indice + 1} de ${n}`;
        pop.titulo.textContent = p.titulo;
        pop.texto.textContent = p.texto;
        pop.anterior.hidden = indice === 0;
        pop.proximo.textContent = indice === n - 1 ? 'Concluir' : 'Próximo';
        marcar(p.alvo);
        posicionar(pop, p.alvo);
        pop.titulo.focus({ preventScroll: true });
      }

      function irPara(novo) {
        if (encerrado) return;
        if (novo < 0 || novo >= passos.length) return;
        indice = novo;
        const d = duracaoDaTroca(pop.raiz);
        if (d > 20) {
          pop.raiz.classList.add('is-trocando');
          window.setTimeout(() => {
            if (encerrado) return;
            desenhar();
            pop.raiz.classList.remove('is-trocando');
          }, d);
        } else {
          desenhar();
        }
      }

      function terminar(resultado) {
        if (encerrado) return;
        encerrado = true;
        marcar(null);
        doc.removeEventListener('keydown', aoTeclar, true);
        window.removeEventListener('resize', aoMudarJanela);
        window.removeEventListener('scroll', aoMudarJanela, true);
        pop.raiz.remove();
        focarMain();
        resolver(resultado);
      }

      function aoTeclar(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          terminar('pulado');
        }
      }

      function aoMudarJanela() {
        if (quadro) return;
        quadro = window.requestAnimationFrame(() => {
          quadro = 0;
          if (!encerrado) posicionar(pop, passos[indice].alvo);
        });
      }

      pop.raiz.addEventListener('click', (e) => {
        const b = e.target instanceof Element ? e.target.closest('[data-pf-tour]') : null;
        if (!b) return;
        const acao = b.getAttribute('data-pf-tour');
        if (acao === 'pular') terminar('pulado');
        else if (acao === 'anterior') irPara(indice - 1);
        else if (acao === 'proximo') {
          if (indice >= passos.length - 1) terminar('concluido');
          else irPara(indice + 1);
        }
      });

      doc.addEventListener('keydown', aoTeclar, true);
      window.addEventListener('resize', aoMudarJanela, { passive: true });
      window.addEventListener('scroll', aoMudarJanela, { capture: true, passive: true });
      doc.body.appendChild(pop.raiz);
      desenhar();
    });
  }

  doc.dispatchEvent(new CustomEvent('dmc:tour:motor', { detail: Object.freeze({ executar }) }));
})();
