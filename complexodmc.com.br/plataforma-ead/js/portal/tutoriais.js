/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/tutoriais.js (F0r)
   Central de ajuda — PORTAL-UX.md §6.17 (tutoriais.html, aluno) e
   §7.20 (#/ajuda e #/ajuda/:guia em professor.html, equipe); tour
   de primeiro acesso pelo DMC_Shell.tour (UX §5.7).

   - tutoriais.html: os guias do aluno são HTML estático na própria
     página (funcionam sem JS). Este arquivo acrescenta a busca local
     ("Buscar nos tutoriais"), o índice com a seção atual, o botão
     [Rever o tour do portal] e os trechos com data-recurso, que só
     aparecem quando DMC_Auth.recursos() confirma o recurso (sem
     resposta, ficam escondidos: nada de "em breve").
   - professor.html: registra as rotas ajuda e ajuda/:guia no
     DMC_Professor (F8). Os guias da equipe moram aqui, versionados;
     cada guia declara as rotas que descreve e só aparece quando
     todas estão registradas e o papel permite (guia só de tela que
     existe, UX §7.20).

   Sem script embutido nem atributo de evento; HTML só por
   DMC_UI.html (escape). Nenhuma chamada à API.
   ============================================================= */
(function () {
  'use strict';

  const doc = document;
  const body = doc.body;
  if (!body) return;

  // ---------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------
  const UI = () => window.DMC_UI || null;
  const ESC_RE = /[&<>"'`]/g;
  const escapar = (v) => {
    const ui = UI();
    if (ui && typeof ui.esc === 'function') return ui.esc(v);
    return String(v == null ? '' : v).replace(ESC_RE, (c) => `&#${c.charCodeAt(0)};`);
  };
  function html(partes, ...valores) {
    const ui = UI();
    if (ui && typeof ui.html === 'function') return ui.html(partes, ...valores);
    let s = partes[0];
    valores.forEach((v, i) => {
      const um = (x) => (x && typeof x === 'object' && '__cru' in x ? x.__cru : escapar(x));
      s += (Array.isArray(v) ? v.map(um).join('') : um(v)) + partes[i + 1];
    });
    return s;
  }
  const cru = (s) => {
    const ui = UI();
    return ui && typeof ui.cru === 'function' ? ui.cru(s) : Object.freeze({ __cru: String(s) });
  };
  function nos(marcacao) {
    const t = doc.createElement('template');
    t.innerHTML = String(marcacao); // marcacao vem SEMPRE de html`` (escape)
    return t.content;
  }

  /** Busca sem acento e sem caixa. */
  const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  const estreito = () => !!(window.matchMedia && window.matchMedia('(max-width: 63.99em)').matches);

  function tourDisponivel() {
    const s = window.DMC_Shell;
    const u = window.DMC_Auth && typeof window.DMC_Auth.user === 'function' ? window.DMC_Auth.user() : null;
    return !!(s && s.tour && typeof s.tour.iniciar === 'function' && !(u && u.precisaTrocarSenha));
  }
  function iniciarTour() {
    const s = window.DMC_Shell;
    if (!s || !s.tour || typeof s.tour.iniciar !== 'function') return;
    Promise.resolve(s.tour.iniciar('primeiro-acesso')).catch((err) => console.error('[DMC]', err));
  }
  function ligarTour(raiz) {
    const ok = tourDisponivel();
    raiz.querySelectorAll('[data-tut-tour]').forEach((b) => {
      if (b.hidden !== !ok) b.hidden = !ok;
      if (ok && !b.dataset.tutLigado) {
        b.dataset.tutLigado = '1';
        b.addEventListener('click', iniciarTour);
      }
    });
  }

  // ---------------------------------------------------------------
  // Guias da equipe (#/ajuda). Passos em texto com duas marcas:
  // **Rótulo do botão** (negrito) e [texto](#/rota | pagina.html).
  // `rotas` = telas descritas: o guia some se alguma não estiver
  // registrada em professor.html. `papeis` = quem vê o guia.
  // ---------------------------------------------------------------
  const PA = ['professor', 'admin'];
  const A = ['admin'];
  const P = ['professor'];
  const GUIAS_EQUIPE = Object.freeze([
    {
      id: 'plano-de-ensino', papeis: P, rotas: ['cursos', 'cursos/:id/plano'],
      titulo: 'Montar um módulo: o plano de ensino',
      passos: [
        'Abra [Meus cursos](#/cursos). Em cada curso, o link **Plano de ensino** abre os planos dos módulos.',
        'Escolha o módulo que você vai preencher.',
        'Preencha os objetivos (um por linha), a bibliografia básica e a complementar (uma referência por linha) e o cronograma, com encontro, data e tema. Para acrescentar linhas ao cronograma, use **Acrescentar linha**.',
        'Se o módulo já tem aulas gravadas, **Montar a partir das aulas gravadas** preenche o cronograma com elas, para você revisar.',
        'Cada campo é salvo ao sair dele. As aulas, os vídeos e a estrutura do módulo são cadastrados pela coordenação.'
      ]
    },
    {
      id: 'montar-modulo', papeis: A, rotas: ['cursos', 'cursos/:id/plano'],
      titulo: 'Montar um módulo: plano, materiais e aulas',
      passos: [
        'Abra [Conteúdo](admin.html) no menu. O editor mostra os **Programas cadastrados**; para criar um, use **Novo curso**.',
        'No curso, use **Adicionar módulo** e, dentro do módulo, **Adicionar aula** para cada aula gravada, com o vídeo e os materiais.',
        'Abra o **Plano de ensino** do módulo para preencher objetivos, bibliografia e cronograma. O mesmo plano aparece em [Cursos](#/cursos).',
        'Para liberar o curso a um aluno, use a seção **Liberar cursos para alunos** do editor.'
      ]
    },
    {
      id: 'avaliacao', papeis: PA, rotas: ['avaliacoes', 'avaliacoes/:id/configuracao', 'avaliacoes/:id/questoes/nova', 'avaliacoes/:id/previa'],
      titulo: 'Criar e publicar uma avaliação',
      passos: [
        'Abra [Avaliações](#/avaliacoes). A tabela mostra cada módulo e os tipos de avaliação; no módulo desejado, use **Criar**.',
        'Na aba **Configuração**, defina as regras da avaliação e use **Salvar configuração**.',
        'Na aba de questões, use **Nova questão**. Nas objetivas, **Adicionar alternativa** acrescenta opções. Termine com **Salvar questão** ou **Salvar e criar outra**.',
        'Confira tudo na **Pré-visualização**, que mostra a avaliação como o aluno verá.',
        'Use **Publicar** e confirme. Para tirar do ar, **Despublicar**. As notas ficam na aba **Resultados**.'
      ]
    },
    {
      id: 'correcao', papeis: PA, rotas: ['correcao', 'correcao/:tentativaId'],
      titulo: 'Corrigir dissertativas',
      passos: [
        'Abra [Correção](#/correcao). O número ao lado do item no menu mostra o que está a corrigir.',
        'Escolha a tentativa. Se o aluno enviou arquivo, **Baixar entrega (PDF)** traz a resposta.',
        'Dê a nota de cada questão e o comentário. Use **Anterior** e **Próxima** para percorrer as questões.',
        'Use **Publicar correção**. O aluno é avisado e vê a nota no Acadêmico.',
        'Para ajustar depois, **Revisar correção** e **Salvar revisão**. Para dar mais uma chance ao aluno, **Conceder nova tentativa**.'
      ]
    },
    {
      id: 'encontro', papeis: PA, rotas: ['ao-vivo', 'ao-vivo/novo', 'ao-vivo/:encontroId'],
      titulo: 'Agendar um encontro e acompanhar a presença',
      passos: [
        'Abra [Aulas ao vivo](#/ao-vivo) e use **Novo encontro**.',
        'Escolha o curso, a turma e o módulo; informe o início (horário de Brasília), a duração, o título e o **Link da sala (https)**; e use **Agendar encontro**.',
        'A presença do aluno é registrada quando ele usa **Entrar na sala** no portal.',
        'Depois do encontro, abra-o para conferir a lista. Para registrar quem participou por outro meio, use **Lançar presença**; um registro errado sai com **Anular**.',
        'Na turma, a aba **Frequência** reúne a presença de todos os encontros.'
      ]
    },
    {
      id: 'duvidas-atendimentos', papeis: PA, rotas: ['duvidas', 'atendimento', 'atendimento/:protocolo'],
      titulo: 'Responder dúvidas e atendimentos',
      passos: [
        'Abra [Dúvidas](#/duvidas). Cada dúvida mostra a aula de onde veio.',
        'Escreva a resposta e use **Publicar resposta**. Se a dúvida já foi resolvida de outra forma, **Marcar como resolvida sem responder**; para voltar atrás, **Reabrir**.',
        'Em [Atendimento](#/atendimento), abra o protocolo, escreva e use **Enviar resposta**. O aluno é avisado.',
        'Com o assunto resolvido, use **Encerrar atendimento**.'
      ]
    },
    {
      id: 'parecer', papeis: P, rotas: ['ouvidoria', 'ouvidoria/:protocolo'],
      titulo: 'Dar parecer numa manifestação encaminhada',
      passos: [
        'Abra [Ouvidoria (encaminhadas)](#/ouvidoria). Aparecem só as manifestações que a coordenação encaminhou a você.',
        'Abra a manifestação e leia o histórico.',
        'Escreva o parecer e use **Enviar parecer**. A resposta ao aluno é da coordenação.'
      ]
    },
    {
      id: 'atendimento-coordenacao', papeis: A, rotas: ['atendimento', 'atendimento/:protocolo', 'ouvidoria', 'ouvidoria/:protocolo'],
      titulo: 'Distribuir atendimentos e encaminhar manifestações',
      passos: [
        'Em [Atendimento](#/atendimento), abra o protocolo e use **Reatribuir** para passá-lo a outra pessoa da equipe.',
        'Na [Ouvidoria](#/ouvidoria), abra a manifestação. Para pedir a opinião de um professor, use **Encaminhar ao professor**; o parecer dele volta para a manifestação.',
        'Responda ao aluno com **Enviar resposta** e, ao final, **Encerrar**.'
      ]
    },
    {
      id: 'matricular', papeis: A, rotas: ['matriculas', 'matriculas/:id', 'turmas/nova'],
      titulo: 'Matricular e enturmar',
      passos: [
        'Abra [Matrículas](#/matriculas) e use **Nova matrícula**. Informe o e-mail do aluno, o curso e a modalidade, e confirme com **Matricular**.',
        'Alunos que já tinham o curso liberado entram de uma vez com **Gerar matrículas a partir das liberações**.',
        'Para abrir uma turma, use [Nova turma](#/turmas/nova) e **Criar turma**.',
        'Selecione as matrículas na lista e use **Enturmar** para colocá-las na turma.',
        'Para levar a lista a outro sistema, use **Exportar CSV**.'
      ]
    },
    {
      id: 'pedidos-titulares', papeis: A, rotas: ['atendimento', 'atendimento/:protocolo'],
      titulo: 'Responder pedidos dos titulares',
      passos: [
        'O aluno faz pedidos sobre os próprios dados em Meus dados. Cada pedido chega como protocolo em [Atendimento](#/atendimento).',
        'Abra o protocolo: o campo **Tipo de pedido** diz o que foi pedido (acesso, correção, eliminação, informação sobre compartilhamento, revogação de consentimento ou outro).',
        'Responda com **Enviar resposta**, explicando o que foi feito, e encerre o protocolo com **Encerrar atendimento**.'
      ]
    },
    {
      id: 'assistente-ia', papeis: A, rotas: ['configuracoes/ia'],
      titulo: 'Configurar o assistente de IA',
      passos: [
        'Abra [Configurações › Assistente de IA](#/configuracoes/ia).',
        'Cole a chave da API do Gemini e use **Salvar chave**. Por segurança, o portal pede a sua senha antes de gravar.',
        'Use **Testar conexão** para confirmar que a chave funciona.',
        'Ajuste o modelo e os limites de uso e use **Salvar modelo e limites**.',
        'O consumo fica em [Uso](#/configuracoes/ia/uso) e as respostas dadas, com as fontes citadas, em [Trilha das respostas](#/configuracoes/ia/trilha). Para desligar, **Remover chave**.'
      ]
    },
    {
      id: 'regulamento', papeis: A, rotas: ['configuracoes/regulamento'],
      titulo: 'Publicar o regulamento acadêmico',
      passos: [
        'Abra [Configurações › Regulamento acadêmico](#/configuracoes/regulamento).',
        'Escreva ou cole o texto e use **Salvar rascunho**. O rascunho não aparece para os alunos.',
        'Use **Ver trechos** para conferir como o texto foi dividido em seções; é por elas que o assistente cita a fonte.',
        'Use **Publicar edição**. A edição publicada passa a valer na página do regulamento e no assistente.'
      ]
    },
    {
      id: 'instituicao', papeis: A, rotas: ['configuracoes/instituicao'],
      titulo: 'Cadastrar os dados da instituição',
      passos: [
        'Abra [Configurações › Instituição](#/configuracoes/instituicao).',
        'Preencha os dados que saem nos documentos emitidos pela plataforma.',
        'Use **Salvar dados da instituição**.'
      ]
    }
  ].map((g) => Object.freeze({ ...g, papeis: Object.freeze(g.papeis.slice()), rotas: Object.freeze(g.rotas.slice()), passos: Object.freeze(g.passos.slice()) })));

  const HREF_GUIA_RE = /^(?:#\/[a-z0-9/:-]*|[a-z0-9_-]+\.html(?:#[a-z0-9-]*)?)$/i;

  /** Passo → HTML: escapa tudo e só depois aplica as duas marcas (negrito e link interno). */
  function passoHtml(texto) {
    let s = escapar(texto);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (todo, rotulo, href) => (HREF_GUIA_RE.test(href) ? `<a href="${href}">${rotulo}</a>` : rotulo));
    return cru(s);
  }

  function guiasVisiveis(papel) {
    const P8 = window.DMC_Professor;
    const temRota = P8 && typeof P8.temRota === 'function' ? (r) => P8.temRota(r) : null;
    const noMenu = new Set();
    if (!temRota && P8 && typeof P8.itensDoMenu === 'function') {
      (P8.itensDoMenu(papel) || []).forEach((i) => { if (i && i.rota) noMenu.add(i.rota); });
    }
    const existe = (r) => (temRota ? temRota(r) : noMenu.has(r.split('/')[0]));
    const p = papel === 'admin' ? 'admin' : 'professor';
    return GUIAS_EQUIPE.filter((g) => g.papeis.indexOf(p) >= 0 && g.rotas.every(existe));
  }

  /** #/ajuda e #/ajuda/:guia (montado como painel em professor.html). */
  function montarAjuda(el, ctx) {
    const papel = (ctx && ctx.papel) || 'professor';
    const guias = guiasVisiveis(papel);
    const pedido = ctx && ctx.params ? ctx.params.guia : null;
    const atual = pedido ? guias.find((g) => g.id === pedido) : null;
    el.replaceChildren(nos(html`
      <div class="pf-tut-equipe__acoes">
        <button type="button" class="dmc-btn dmc-btn--secondary" data-tut-tour>Rever o tour</button>
        <a class="pf-tut-equipe__aluno" href="tutoriais.html">Guias da área do aluno</a>
      </div>
      ${pedido && !atual ? html`<div class="pf-alerta pf-alerta--info" role="status"><p>Este guia não está disponível para o seu perfil. Abaixo, os guias disponíveis.</p></div>` : ''}
      ${guias.length ? html`<div class="pf-tut pf-tut--equipe">
        <nav class="pf-tut-indice" aria-label="Guias da equipe">
          <details class="pf-tut-indice__detalhes"${estreito() ? '' : cru(' open')} data-tut-detalhes>
            <summary class="pf-tut-indice__resumo">Guias</summary>
            <ul class="pf-tut-indice__lista">${guias.map((g) => html`<li><a class="pf-tut-indice__link" href="${`#/ajuda/${g.id}`}"${atual && atual.id === g.id ? cru(' aria-current="page"') : ''}>${g.titulo}</a></li>`)}</ul>
          </details>
        </nav>
        <div class="pf-tut-artigos">${guias.map((g) => html`<article class="pf-tut-artigo" id="${`pf-ajuda-${g.id}`}" aria-labelledby="${`pf-ajuda-${g.id}-t`}">
            <h2 class="pf-tut-artigo__titulo" id="${`pf-ajuda-${g.id}-t`}" tabindex="-1">${g.titulo}</h2>
            <ol class="pf-tut-passos">${g.passos.map((p) => html`<li>${passoHtml(p)}</li>`)}</ol>
          </article>`)}</div>
      </div>` : html`<div class="pf-vazio"><p class="pf-vazio__titulo">Nenhum guia disponível para o seu perfil.</p><p class="pf-vazio__texto">Os guias aparecem conforme as telas da equipe ficam disponíveis.</p></div>`}`));
    ligarTour(el);
    if (atual) {
      const art = el.querySelector(`#pf-ajuda-${atual.id}`);
      window.setTimeout(() => {
        if (!art || !art.isConnected) return;
        art.scrollIntoView({ block: 'start' });
        const t = art.querySelector('.pf-tut-artigo__titulo');
        if (t) t.focus({ preventScroll: true });
      }, 0);
    }
    return { destruir() { el.replaceChildren(); } };
  }

  if (body.dataset.pagina === 'professor') {
    const P8 = window.DMC_Professor;
    if (P8 && typeof P8.registrar === 'function') {
      P8.registrar({ rota: 'ajuda', titulo: 'Ajuda', papeis: PA, montar: montarAjuda });
      P8.registrar({ rota: 'ajuda/:guia', titulo: 'Ajuda', papeis: PA, montar: montarAjuda });
    }
    return;
  }

  if (body.dataset.pagina !== 'tutoriais') return;

  // ---------------------------------------------------------------
  // tutoriais.html (aluno)
  // ---------------------------------------------------------------
  const main = doc.getElementById('conteudo');
  if (!main) return;

  function ligarBusca() {
    const caixa = main.querySelector('[data-tut-busca]');
    const campo = caixa && caixa.querySelector('input');
    const status = main.querySelector('[data-tut-status]');
    const vazio = main.querySelector('[data-tut-vazio]');
    if (!caixa || !campo) return;
    const artigos = Array.from(main.querySelectorAll('.pf-tut-artigo'));
    const textos = new Map(artigos.map((a) => [a, normalizar(a.textContent)]));
    let espera = 0;
    function filtrar() {
      const termos = normalizar(campo.value).split(' ').filter(Boolean);
      let visiveis = 0;
      artigos.forEach((a) => {
        const ok = !termos.length || termos.every((t) => textos.get(a).indexOf(t) >= 0);
        a.hidden = !ok;
        if (ok) visiveis++;
        const link = main.querySelector(`.pf-tut-indice__link[href="#${CSS.escape(a.id)}"]`);
        if (link && link.parentElement) link.parentElement.hidden = !ok;
      });
      main.querySelectorAll('[data-tut-categoria]').forEach((c) => {
        c.hidden = !c.querySelector('.pf-tut-artigo:not([hidden])');
      });
      main.querySelectorAll('[data-tut-indice]').forEach((g) => {
        g.hidden = !g.querySelector('li:not([hidden])');
      });
      if (vazio) vazio.hidden = visiveis > 0;
      if (status) status.textContent = termos.length ? (visiveis === 1 ? '1 guia encontrado.' : `${visiveis} guias encontrados.`) : '';
    }
    campo.addEventListener('input', () => { window.clearTimeout(espera); espera = window.setTimeout(filtrar, 120); });
    campo.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && campo.value) { ev.preventDefault(); campo.value = ''; filtrar(); }
    });
  }

  /** Trechos com data-recurso: só aparecem quando o servidor confirma o recurso. */
  async function aplicarRecursos() {
    const trechos = Array.from(main.querySelectorAll('[data-recurso]'));
    if (!trechos.length) return;
    const Auth = window.DMC_Auth;
    let r = null;
    try { r = Auth && typeof Auth.recursos === 'function' ? await Auth.recursos() : null; } catch { r = null; }
    trechos.forEach((t) => { t.hidden = !(r && r[t.getAttribute('data-recurso')] === true); });
  }

  function marcarAtual(id) {
    main.querySelectorAll('.pf-tut-indice__link').forEach((a) => {
      if (a.getAttribute('href') === `#${id}`) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
  }

  function irPara(id, { focar = true } = {}) {
    if (!id) return false;
    const art = doc.getElementById(id);
    if (!art || !art.classList.contains('pf-tut-artigo')) return false;
    if (art.hidden) {
      const campo = main.querySelector('[data-tut-busca] input');
      if (campo) { campo.value = ''; campo.dispatchEvent(new Event('input')); }
      art.hidden = false;
      const cat = art.closest('[data-tut-categoria]');
      if (cat) cat.hidden = false;
    }
    art.scrollIntoView({ block: 'start' });
    const t = art.querySelector('.pf-tut-artigo__titulo');
    if (focar && t) t.focus({ preventScroll: true });
    marcarAtual(id);
    return true;
  }

  function ligarIndice() {
    const det = main.querySelector('[data-tut-detalhes]');
    main.querySelectorAll('.pf-tut-indice__link').forEach((a) => a.addEventListener('click', (ev) => {
      const id = (a.getAttribute('href') || '').slice(1);
      if (!id) return;
      ev.preventDefault();
      window.history.replaceState(null, '', `#${id}`);
      irPara(id);
      if (det && estreito()) det.open = false;
    }));
    window.addEventListener('hashchange', () => irPara(window.location.hash.slice(1)));
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver((entradas) => {
        const v = entradas.filter((e) => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top);
        if (v.length) marcarAtual(v[0].target.id);
      }, { rootMargin: '0px 0px -70% 0px' });
      main.querySelectorAll('.pf-tut-artigo').forEach((a) => obs.observe(a));
    }
  }

  function ligarPagina() {
    ligarBusca();
    ligarIndice();
    ligarTour(doc);
    aplicarRecursos();
    const hash = window.location.hash.slice(1);
    if (hash) window.setTimeout(() => irPara(hash), 0);
  }

  // Sem troca de layout depois da pintura (CLS): no celular o índice nasce fechado (HTML);
  // no desktop ele abre agora, numa coluna própria que não empurra os artigos.
  const detalhes = main.querySelector('[data-tut-detalhes]');
  if (detalhes && !estreito()) detalhes.open = true;

  if (window.DMC_Portal && typeof window.DMC_Portal.iniciar === 'function') {
    window.DMC_Portal.iniciar(() => ligarPagina(), { pagina: 'tutoriais' });
  } else {
    // Núcleo ausente: os guias continuam legíveis (HTML estático); só a busca e o índice.
    ligarBusca();
    ligarIndice();
  }
})();
