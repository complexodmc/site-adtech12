/* =============================================================
   COMPLEXO DMC · PLATAFORMA · js/portal/prof-ia.js (F6b)
   Configurações › Assistente de IA (coordenação), dentro de
   professor.html: #/configuracoes/ia · /uso · /trilha.
   Spec: PORTAL-UX.md §7.22 · PORTAL-API.md §6.10.4 · índice §6.3,
   §7.8 (DMC_Professor.registrar), D-57 (reautenticação).

   - A chave colada NUNCA volta do servidor: a tela mostra só
     configurada sim/não, origem (painel|ambiente), 4 últimos
     caracteres e data. O campo nunca é pré-preenchido nem vai a
     rascunho; é limpo depois de salvar.
   - Salvar e remover a chave pedem a senha (DMC_UI.reautenticar; sem
     ele, o diálogo de confirmação do portal com reautenticação).
   - Trilha: só metadados; a consulta só roda em [Consultar] (cada
     consulta é auditada).
   ============================================================= */
(function () {
  'use strict';

  const API = {
    config: '/portal/admin/configuracoes/assistente-ia',
    chave: '/portal/admin/configuracoes/assistente-ia/chave',
    remover: '/portal/admin/configuracoes/assistente-ia/chave/remover',
    testar: '/portal/admin/configuracoes/assistente-ia/testar',
    uso: (dias) => `/portal/admin/configuracoes/assistente-ia/uso?dias=${dias}`,
    trilha: (q) => `/portal/admin/configuracoes/assistente-ia/trilha?${q}`,
    usuarios: (q) => `/portal/admin/usuarios?${new URLSearchParams({ q, papel: 'aluno' }).toString()}`
  };
  const ABAS = [
    ['configuracoes/ia', 'Configuração'],
    ['configuracoes/ia/uso', 'Uso'],
    ['configuracoes/ia/trilha', 'Trilha das respostas']
  ];
  const OUTRAS = [
    ['configuracoes/regulamento', 'Regulamento'], ['configuracoes/privacidade', 'Privacidade e dados'],
    ['configuracoes/instituicao', 'Instituição'], ['configuracoes/cursos', 'Critérios dos cursos']
  ];
  const LIMITES = [
    ['mensagensPorHora', 'Mensagens por aluno por hora', 1, 200, ''],
    ['mensagensPorDia', 'Mensagens por aluno por dia', 1, 2000, ''],
    ['caracteresPorMensagem', 'Caracteres por mensagem', 200, 4000, ''],
    ['mensagensGlobaisPorDia', 'Mensagens por dia, somando todos os alunos', 1, 100000,
      'Ao atingir este teto, o assistente fica indisponível para todos até a meia-noite (horário de Brasília). Protege o custo da conta do Google.']
  ];
  const TEXTO_TESTE = {
    'chave-invalida': 'O Google recusou a chave (400). Confira se ela foi copiada inteira.',
    'sem-permissao': 'O Google recusou a chave (403). Confira se ela está ativa e com acesso à API Gemini.',
    'modelo-nao-encontrado': 'Modelo não encontrado (404). Confira o nome.',
    'modelo-sem-generatecontent': 'Este modelo não gera texto (generateContent). Use outro identificador.',
    'limite-provedor': 'Limite de uso do projeto atingido (429). Tente mais tarde.',
    'tempo-esgotado': 'Sem resposta em 15 s. Tente de novo.',
    'falha-rede': 'Não foi possível falar com o Google agora. Tente de novo.'
  };

  const $ = (sel, el) => el.querySelector(sel);

  function fmtData(iso, comHora) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return comHora
        ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
        : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    } catch { return ''; }
  }
  const fmtNum = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('pt-BR') : '—');

  function abas(ui, atual) {
    const h = ui.html;
    return h`<nav class="pf-ia-adm__abas" aria-label="Assistente de IA">
        ${ABAS.map(([rota, rotulo]) => h`<a class="pf-ia-adm__aba" href="#/${rota}"${rota === atual ? h` aria-current="page"` : ''}>${rotulo}</a>`)}
      </nav>
      <p class="pf-ia-nota">Outras configurações: ${OUTRAS.map(([rota, rotulo], i) => h`${i ? ' · ' : ''}<a class="pf-ia-link" href="#/${rota}">${rotulo}</a>`)}</p>`;
  }

  /** Reautenticação: DMC_UI.reautenticar (D-57) ou a reserva do portal (confirmar com reautenticar). */
  function reautenticar(ui, { rotuloConfirmar, texto, enviar }) {
    if (typeof ui.reautenticar === 'function') {
      return ui.reautenticar({ titulo: 'Confirme sua identidade', texto, rotuloConfirmar, enviar });
    }
    return ui.confirmar({ titulo: 'Confirme sua identidade', texto, rotuloConfirmar, reautenticar: true, enviar: (_valores, reaut) => enviar(reaut) });
  }

  // ---------------------------------------------------------------
  // Configuração
  // ---------------------------------------------------------------
  function montarConfiguracao(el, ctx) {
    const { api, ui } = ctx;
    const h = ui.html;
    let cfg = null;
    let destruido = false;

    function situacaoDaChave(c) {
      if (c.origem === 'env') {
        return h`<p class="pf-ia-adm__situacao" data-ia-adm="situacao">Definida no servidor (GEMINI_API_KEY) — tem prioridade. Para trocar, altere a variável no ambiente de hospedagem.${c.final4 ? h` Termina em ••••${c.final4}.` : ''}</p>`;
      }
      if (c.origem === 'painel' && !c.legivel) {
        return h`<p class="pf-ia-alerta pf-ia-alerta--aviso" data-ia-adm="situacao">A chave salva não pode mais ser lida (o segredo do servidor mudou). Cole a chave de novo.</p>`;
      }
      if (c.origem === 'painel') {
        return h`<p class="pf-ia-adm__situacao" data-ia-adm="situacao">Configurada pelo painel · termina em ••••${c.final4 || ''}${c.salvaEm ? h` · alterada em ${fmtData(c.salvaEm)}` : ''} · <a class="pf-ia-link" href="#/auditoria?area=ia">Ver na auditoria</a></p>`;
      }
      return h`<p class="pf-ia-adm__situacao" data-ia-adm="situacao">Nenhuma chave configurada.</p>`;
    }

    function textoTeste(t) {
      if (!t) return '';
      if (t.ok) {
        const seg = Number(t.latenciaMs || 0) / 1000;
        const tempo = seg < 0.1 ? 'menos de 0,1 s' : `${seg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
        return `Conexão confirmada: o modelo ${t.modelo} respondeu em ${tempo}.`;
      }
      return TEXTO_TESTE[t.codigo] || 'O teste não passou. Tente de novo.';
    }

    function desenhar(aviso) {
      const c = cfg.chave;
      const env = c.origem === 'env';
      const reg = cfg.regulamento || {};
      el.innerHTML = h`<div class="pf-ia-adm">
        ${abas(ui, 'configuracoes/ia')}
        <p>O assistente responde aos alunos com base nos dados acadêmicos de cada um e no regulamento publicado. Ele só lê: não altera dados nem decide nada acadêmico.</p>
        <div data-ia-adm="aviso">${aviso ? h`<p class="pf-ia-alerta pf-ia-alerta--${aviso.tom}" role="${aviso.tom === 'erro' ? 'alert' : 'status'}">${aviso.texto}</p>` : ''}</div>

        <section class="pf-ia-adm__secao" aria-labelledby="pf-ia-adm-disp">
          <h2 id="pf-ia-adm-disp">Disponibilidade</h2>
          <label class="pf-ia-switch" data-alvo-excecao="rotulo-clicavel">
            <input type="checkbox" role="switch" data-ia-adm="ligado"${cfg.ligado ? h` checked` : ''}>
            <span>Assistente disponível para os alunos</span>
          </label>
          ${!cfg.ligado || !c.configurada || !c.legivel ? h`<p class="pf-ia-campo__ajuda">Os alunos veem o assistente indisponível e o atalho Falar com a equipe.</p>` : ''}
        </section>

        <section class="pf-ia-adm__secao" aria-labelledby="pf-ia-adm-chave">
          <h2 id="pf-ia-adm-chave">Chave da API do Google Gemini</h2>
          ${situacaoDaChave(c)}
          <div class="pf-ia-campo">
            <label for="pf-ia-adm-campo-chave">Nova chave</label>
            <div class="pf-ia-adm__linha">
              <input id="pf-ia-adm-campo-chave" type="password" autocomplete="off" spellcheck="false" data-ia-adm="chave"
                aria-describedby="pf-ia-adm-chave-ajuda pf-ia-adm-chave-erro"${env ? h` disabled` : ''}>
              <button type="button" class="dmc-btn dmc-btn--secondary pf-ia-btn" data-ia-adm="mostrar" aria-pressed="false"${env ? h` disabled` : ''}>Mostrar</button>
            </div>
            <p class="pf-ia-campo__ajuda" id="pf-ia-adm-chave-ajuda">Cole a chave criada no Google AI Studio. Ela é guardada cifrada no servidor e nunca volta para o navegador.</p>
            <p class="pf-ia-campo__erro" id="pf-ia-adm-chave-erro" data-ia-adm="erro-chave" role="alert"></p>
          </div>
          <div class="pf-ia-adm__linha">
            <button type="button" class="dmc-btn dmc-btn--primary pf-ia-btn" data-ia-adm="salvar-chave"${env ? h` disabled` : ''}>Salvar chave</button>
            <button type="button" class="dmc-btn dmc-btn--secondary pf-ia-btn" data-ia-adm="testar">Testar conexão</button>
            ${c.origem === 'painel' ? h`<button type="button" class="pf-ia-link pf-ia-link--perigo" data-ia-adm="remover">Remover chave</button>` : ''}
          </div>
          <p class="pf-ia-adm__status" role="status" data-ia-adm="status">${cfg.ultimoTeste ? `Último teste (${fmtData(cfg.ultimoTeste.em, true)}): ${textoTeste(cfg.ultimoTeste.ok ? { ok: true, modelo: cfg.ultimoTeste.modelo, latenciaMs: cfg.ultimoTeste.latenciaMs } : cfg.ultimoTeste)}` : ''}</p>
        </section>

        <form class="pf-ia-adm__secao" data-ia-adm="form" novalidate aria-labelledby="pf-ia-adm-modelo-t">
          <h2 id="pf-ia-adm-modelo-t">Modelo e limites</h2>
          <div class="pf-ia-campo">
            <label for="pf-ia-adm-modelo">Modelo</label>
            <input id="pf-ia-adm-modelo" name="modelo" type="text" value="${cfg.modelo}" maxlength="63" spellcheck="false" autocomplete="off" aria-describedby="pf-ia-adm-modelo-ajuda">
            <p class="pf-ia-campo__ajuda" id="pf-ia-adm-modelo-ajuda">Use o identificador exato do modelo (padrão: gemini-2.5-flash).</p>
            <p class="pf-ia-campo__erro" data-erro="modelo" role="alert"></p>
          </div>
          <div class="pf-ia-adm__limites">
            ${LIMITES.map(([chave, rotulo, min, max, ajuda]) => h`<div class="pf-ia-campo">
              <label for="pf-ia-adm-${chave}">${rotulo}</label>
              <input id="pf-ia-adm-${chave}" name="${chave}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${cfg.limites[chave]}">
              ${ajuda ? h`<p class="pf-ia-campo__ajuda">${ajuda}</p>` : ''}
              <p class="pf-ia-campo__erro" data-erro="limites.${chave}" role="alert"></p>
            </div>`)}
          </div>
          <p class="pf-ia-campo__ajuda">Os prazos de guarda (conversas e trilha técnica) ficam em <a class="pf-ia-link" href="#/configuracoes/privacidade">Privacidade e dados</a>.</p>
          <div class="pf-ia-adm__linha"><button type="submit" class="dmc-btn dmc-btn--primary pf-ia-btn" data-ia-adm="salvar">Salvar modelo e limites</button></div>
        </form>

        <section class="pf-ia-adm__secao" aria-labelledby="pf-ia-adm-reg">
          <h2 id="pf-ia-adm-reg">Regulamento consultado</h2>
          <p class="pf-ia-adm__situacao">${reg.publicado ? `Regulamento geral publicado: edição ${reg.edicao}, ${fmtNum(reg.trechos)} trechos.` : 'Nenhum regulamento geral publicado. Sem ele, o assistente responde que a informação não está no regulamento.'}
            <a class="pf-ia-link" href="#/configuracoes/regulamento">Abrir Regulamento</a></p>
        </section>

        <details class="pf-ia-adm__secao">
          <summary>Texto da autorização mostrado aos alunos (versão ${cfg.consentimento ? cfg.consentimento.versaoTexto : 'v1'})</summary>
          <div class="pf-leitura">${String((cfg.consentimento && cfg.consentimento.texto) || '').split(/\n+/).filter(Boolean).map((p) => h`<p>${p}</p>`)}</div>
        </details>
      </div>`;
      ligar();
    }

    function aviso(tom, texto) {
      const alvo = $('[data-ia-adm="aviso"]', el);
      if (alvo) alvo.innerHTML = h`<p class="pf-ia-alerta pf-ia-alerta--${tom}" role="${tom === 'erro' ? 'alert' : 'status'}">${texto}</p>`;
    }

    async function recarregar(av) {
      cfg = await api.get(API.config);
      if (!destruido) desenhar(av);
    }

    function ligar() {
      const campoChave = $('[data-ia-adm="chave"]', el);
      const erroChave = $('[data-ia-adm="erro-chave"]', el);
      const status = $('[data-ia-adm="status"]', el);

      $('[data-ia-adm="mostrar"]', el).addEventListener('click', (ev) => {
        const b = ev.currentTarget;
        const mostrar = campoChave.type === 'password';
        campoChave.type = mostrar ? 'text' : 'password';
        b.setAttribute('aria-pressed', String(mostrar));
        b.textContent = mostrar ? 'Ocultar' : 'Mostrar';
      });

      $('[data-ia-adm="ligado"]', el).addEventListener('change', async (ev) => {
        const caixa = ev.currentTarget;
        caixa.disabled = true;
        try {
          cfg = await api.put(API.config, { ligado: caixa.checked, versao: cfg.versao });
          desenhar({ tom: 'sucesso', texto: cfg.ligado ? 'Assistente ligado para os alunos.' : 'Assistente desligado.' });
        } catch (err) {
          caixa.checked = !caixa.checked;
          caixa.disabled = false;
          if (err && err.codigo === 'conflito-versao') { await recarregar({ tom: 'aviso', texto: 'A configuração foi alterada por outra pessoa. Confira e tente de novo.' }); return; }
          aviso('erro', (err && err.message) || 'Não foi possível salvar.');
        }
      });

      $('[data-ia-adm="salvar-chave"]', el).addEventListener('click', async () => {
        erroChave.textContent = '';
        const chave = campoChave.value.trim();
        if (!/^[A-Za-z0-9_-]{20,200}$/.test(chave)) {
          erroChave.textContent = chave ? 'A chave tem formato inválido (20 a 200 letras, números, "-" ou "_").' : 'Cole a chave antes de salvar.';
          campoChave.focus();
          return;
        }
        let erroDaChave = null;
        const r = await reautenticar(ui, {
          rotuloConfirmar: 'Salvar chave',
          texto: 'Por segurança, salvar a chave do Gemini pede a sua senha.',
          enviar: async (reautenticacao) => {
            try {
              return await api.put(API.chave, { chave, testarAntes: true, reautenticacao });
            } catch (err) {
              if (err && (err.codigo === 'chave-recusada-pelo-provedor' || (err.campos && err.campos.chave))) { erroDaChave = err; return null; }
              throw err;
            }
          }
        });
        if (erroDaChave) {
          erroChave.textContent = erroDaChave.codigo === 'chave-recusada-pelo-provedor' ? 'O Google recusou esta chave. Nada foi salvo.' : String(erroDaChave.campos.chave);
          campoChave.focus();
          return;
        }
        if (r && typeof r === 'object' && r.chave) {
          cfg = r;
          desenhar({ tom: 'sucesso', texto: `Chave salva (termina em ••••${r.chave.final4}).` });
        }
      });

      const remover = $('[data-ia-adm="remover"]', el);
      if (remover) {
        remover.addEventListener('click', async () => {
          const r = await reautenticar(ui, {
            rotuloConfirmar: 'Remover chave',
            texto: 'O assistente fica indisponível para os alunos até uma nova chave ser salva.',
            enviar: (reautenticacao) => api.post(API.remover, { reautenticacao })
          });
          if (r && typeof r === 'object' && r.chave) {
            cfg = r;
            desenhar({ tom: 'info', texto: 'Chave removida. O assistente está indisponível para os alunos.' });
          }
        });
      }

      $('[data-ia-adm="testar"]', el).addEventListener('click', async (ev) => {
        const b = ev.currentTarget;
        b.disabled = true;
        b.setAttribute('aria-busy', 'true');
        status.textContent = 'Testando a conexão…';
        const modelo = $('#pf-ia-adm-modelo', el).value.trim();
        const chave = campoChave && !campoChave.disabled ? campoChave.value.trim() : '';
        try {
          const t = await api.post(API.testar, { ...(chave ? { chave } : {}), ...(modelo ? { modelo } : {}) });
          status.textContent = textoTeste(t);
          if (!chave) { cfg = await api.get(API.config); }
        } catch (err) {
          status.textContent = err && err.codigo === 'ia-sem-chave' ? 'Nenhuma chave configurada. Cole a chave e salve antes de testar.'
            : (err && err.message) || 'Não foi possível testar agora.';
        } finally {
          b.disabled = false;
          b.removeAttribute('aria-busy');
        }
      });

      $('[data-ia-adm="form"]', el).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const form = ev.currentTarget;
        form.querySelectorAll('[data-erro]').forEach((p) => { p.textContent = ''; });
        const modelo = form.modelo.value.trim();
        const limites = {};
        let invalido = false;
        if (!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(modelo)) { $('[data-erro="modelo"]', form).textContent = 'Use o identificador exato do modelo (ex.: gemini-2.5-flash).'; invalido = true; }
        for (const [chave, , min, max] of LIMITES) {
          const v = Number(form[chave].value);
          if (!Number.isInteger(v) || v < min || v > max) { $(`[data-erro="limites.${chave}"]`, form).textContent = `Use um número inteiro de ${min} a ${max}.`; invalido = true; }
          limites[chave] = v;
        }
        if (invalido) return;
        const botao = $('[data-ia-adm="salvar"]', form);
        botao.disabled = true;
        try {
          cfg = await api.put(API.config, { modelo, limites, versao: cfg.versao });
          desenhar({ tom: 'sucesso', texto: 'Modelo e limites salvos.' });
        } catch (err) {
          botao.disabled = false;
          if (err && err.codigo === 'conflito-versao') { await recarregar({ tom: 'aviso', texto: 'A configuração foi alterada por outra pessoa. Confira e salve de novo.' }); return; }
          if (err && err.campos) for (const [k, v] of Object.entries(err.campos)) { const p = $(`[data-erro="${k}"]`, form); if (p) p.textContent = v; }
          aviso('erro', (err && err.message) || 'Não foi possível salvar.');
        }
      });
    }

    ui.esqueleto(el, { tipo: 'texto', linhas: 6 });
    recarregar().catch((err) => { if (!destruido) ui.erroCarga(el, err, { tentarDeNovo: () => recarregar() }); });
    return { destruir() { destruido = true; } };
  }

  // ---------------------------------------------------------------
  // Uso
  // ---------------------------------------------------------------
  function montarUso(el, ctx) {
    const { api, ui } = ctx;
    const h = ui.html;
    let destruido = false;
    async function carregar() {
      const u = await api.get(API.uso(30));
      if (destruido) return;
      const t = u.tetoGlobal || {};
      el.innerHTML = h`<div class="pf-ia-adm">
        ${abas(ui, 'configuracoes/ia/uso')}
        <dl class="pf-ia-kpis">
          <div class="pf-ia-kpi"><dt>Conversas (30 dias)</dt><dd>${fmtNum(u.totais && u.totais.conversas30d)}</dd></div>
          <div class="pf-ia-kpi"><dt>Levadas à equipe (30 dias)</dt><dd>${fmtNum(u.totais && u.totais.escalonadas30d)}</dd></div>
          <div class="pf-ia-kpi"><dt>Teto diário</dt><dd>${fmtNum(t.porDia)}${t.atingidoHoje ? h` <span class="pf-ia-alerta pf-ia-alerta--aviso">Teto atingido hoje</span>` : ''}</dd></div>
        </dl>
        ${(u.porDia || []).length ? h`<table class="pf-ia-tabela">
            <caption>Uso por dia (últimos 30 dias, sem identificação de alunos)</caption>
            <thead><tr><th scope="col">Dia</th><th scope="col">Mensagens</th><th scope="col">Levadas à equipe</th><th scope="col">Tokens de entrada</th><th scope="col">Tokens de saída</th></tr></thead>
            <tbody>${u.porDia.map((d) => h`<tr><td>${d.dia.split('-').reverse().join('/')}</td><td class="pf-ia-num">${fmtNum(d.mensagens)}</td><td class="pf-ia-num">${fmtNum(d.escalonadas)}</td><td class="pf-ia-num">${fmtNum(d.tokensEntrada)}</td><td class="pf-ia-num">${fmtNum(d.tokensSaida)}</td></tr>`)}</tbody>
          </table>` : h`<p class="pf-ia-nota">Nenhum uso registrado nos últimos 30 dias.</p>`}
        <p><a class="pf-ia-link" href="#/atendimento?origem=ia">Atendimentos abertos pelo assistente</a></p>
      </div>`;
    }
    ui.esqueleto(el, { tipo: 'tabela', linhas: 4 });
    carregar().catch((err) => { if (!destruido) ui.erroCarga(el, err, { tentarDeNovo: () => carregar() }); });
    return { destruir() { destruido = true; } };
  }

  // ---------------------------------------------------------------
  // Trilha das respostas (só metadados; consulta auditada)
  // ---------------------------------------------------------------
  function montarTrilha(el, ctx) {
    const { api, ui } = ctx;
    const h = ui.html;
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const semana = new Date(Date.now() - 6 * 24 * 3600 * 1000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    let itens = [];
    let pagina = 1;
    let filtros = null;
    el.innerHTML = h`<div class="pf-ia-adm">
      ${abas(ui, 'configuracoes/ia/trilha')}
      <p class="pf-ia-alerta pf-ia-alerta--info">Cada consulta fica registrada na auditoria. A trilha não contém o texto das conversas.</p>
      <form class="pf-ia-adm__secao" data-ia-adm="filtros" novalidate>
        <div class="pf-ia-adm__limites">
          <div class="pf-ia-campo"><label for="pf-ia-tr-de">De</label><input id="pf-ia-tr-de" name="de" type="date" value="${semana}"></div>
          <div class="pf-ia-campo"><label for="pf-ia-tr-ate">Até</label><input id="pf-ia-tr-ate" name="ate" type="date" value="${hoje}"></div>
          <div class="pf-ia-campo"><label for="pf-ia-tr-busca">Aluno (opcional: nome ou e-mail)</label>
            <div class="pf-ia-adm__linha"><input id="pf-ia-tr-busca" type="search" minlength="3" maxlength="80" spellcheck="false" autocomplete="off" aria-describedby="pf-ia-tr-busca-ajuda">
              <button type="button" class="dmc-btn dmc-btn--secondary pf-ia-btn" data-ia-adm="buscar-aluno">Buscar</button></div>
            <p class="pf-ia-campo__ajuda" id="pf-ia-tr-busca-ajuda">Digite pelo menos 3 letras e escolha o aluno na lista.</p>
          </div>
          <div class="pf-ia-campo"><label for="pf-ia-tr-aluno">Aluno escolhido</label>
            <select id="pf-ia-tr-aluno" name="userId"><option value="">Todos os alunos</option></select>
          </div>
        </div>
        <p class="pf-ia-campo__erro" data-ia-adm="erro-filtros" role="alert"></p>
        <div class="pf-ia-adm__linha"><button type="submit" class="dmc-btn dmc-btn--primary pf-ia-btn">Consultar</button></div>
      </form>
      <div data-ia-adm="resultado" aria-live="polite"></div>
    </div>`;
    const resultado = $('[data-ia-adm="resultado"]', el);
    const selAluno = $('#pf-ia-tr-aluno', el);
    $('[data-ia-adm="buscar-aluno"]', el).addEventListener('click', async () => {
      const termo = $('#pf-ia-tr-busca', el).value.trim();
      const erro = $('[data-ia-adm="erro-filtros"]', el);
      erro.textContent = '';
      if (termo.length < 3) { erro.textContent = 'Digite pelo menos 3 letras para buscar o aluno.'; return; }
      try {
        const r = await api.get(API.usuarios(termo));
        const lista = (r && r.itens) || [];
        selAluno.innerHTML = h`<option value="">Todos os alunos</option>${lista.map((u) => h`<option value="${u.id}">${u.nome || u.email} — ${u.email}</option>`)}`;
        if (lista.length) { selAluno.value = lista[0].id; selAluno.focus(); } else erro.textContent = 'Nenhum aluno encontrado.';
      } catch (err) {
        erro.textContent = (err && err.status === 404) ? 'A busca de alunos ainda não está disponível.' : ((err && err.message) || 'Não foi possível buscar alunos.');
      }
    });

    function desenhar(resp) {
      if (!itens.length) { resultado.innerHTML = h`<p class="pf-ia-nota">Nenhuma resposta no período.</p>`; return; }
      resultado.innerHTML = h`<table class="pf-ia-tabela">
          <caption>${fmtNum(resp.total)} respostas no período</caption>
          <thead><tr><th scope="col">Quando</th><th scope="col">Aluno</th><th scope="col">Modelo</th><th scope="col">Versão da instrução</th><th scope="col">Ferramentas</th><th scope="col">Fontes</th><th scope="col">Levada à equipe</th><th scope="col">SHA-256 da resposta</th></tr></thead>
          <tbody>${itens.map((i) => h`<tr>
            <td>${fmtData(i.em, true)}</td>
            <td>${i.aluno && i.aluno.id ? h`<a class="pf-ia-link" href="#/alunos/${encodeURIComponent(i.aluno.id)}">${i.aluno.nome || i.aluno.id}</a>` : '—'}</td>
            <td>${i.modelo}</td><td>${i.versaoInstrucao}</td>
            <td>${(i.ferramentas || []).join(' · ') || '—'}</td>
            <td>${(i.fontes || []).join(' · ') || '—'}</td>
            <td>${i.escalonada ? 'Sim' : 'Não'}${i.bloqueada ? ' · Bloqueada pelo filtro de segurança' : ''}${i.sugerirAtendimento ? ' · Sugeriu falar com a equipe' : ''}</td>
            <td><span class="pf-ia-hash" title="${i.sha256Resposta}">${String(i.sha256Resposta || '').slice(0, 12)}…</span></td>
          </tr>`)}</tbody>
        </table>
        ${resp.pagina < resp.totalPaginas ? h`<p><button type="button" class="dmc-btn dmc-btn--secondary pf-ia-btn" data-ia-adm="mais">Carregar mais</button></p>` : ''}`;
      const mais = $('[data-ia-adm="mais"]', resultado);
      if (mais) mais.addEventListener('click', () => consultar(pagina + 1));
    }

    async function consultar(p) {
      const q = new URLSearchParams({ de: filtros.de, ate: filtros.ate, pagina: String(p), ...(filtros.userId ? { userId: filtros.userId } : {}) });
      try {
        const r = await api.get(API.trilha(q.toString()));
        pagina = r.pagina;
        itens = p === 1 ? r.itens : itens.concat(r.itens);
        desenhar(r);
      } catch (err) {
        ui.alerta(resultado, { tom: 'erro', texto: (err && err.message) || 'Não foi possível consultar a trilha.' });
      }
    }

    $('[data-ia-adm="filtros"]', el).addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = ev.currentTarget;
      const erro = $('[data-ia-adm="erro-filtros"]', el);
      erro.textContent = '';
      const de = f.de.value;
      const ate = f.ate.value;
      const userId = String(f.userId.value || '').trim();
      if (!de || !ate) { erro.textContent = 'Informe as duas datas.'; return; }
      const dias = (new Date(`${ate}T12:00:00Z`) - new Date(`${de}T12:00:00Z`)) / 86400000;
      if (dias < 0) { erro.textContent = 'A data final vem antes da inicial.'; return; }
      if (dias > 92) { erro.textContent = 'Escolha um intervalo de até 92 dias.'; return; }
      if (userId && !/^[a-f0-9]{24}$/.test(userId)) { erro.textContent = 'Identificador de aluno inválido.'; return; }
      filtros = { de, ate, userId };
      consultar(1);
    });
    return { destruir() {} };
  }

  // ---------------------------------------------------------------
  // Registro no portal do professor (só a coordenação)
  // ---------------------------------------------------------------
  function registrar() {
    const P = window.DMC_Professor;
    if (!P || typeof P.registrar !== 'function') return; // fora de professor.html: nada a fazer
    P.registrar({ rota: 'configuracoes/ia', titulo: 'Assistente de IA', papeis: ['admin'], montar: montarConfiguracao });
    P.registrar({ rota: 'configuracoes/ia/uso', titulo: 'Assistente de IA · Uso', papeis: ['admin'], montar: montarUso });
    P.registrar({ rota: 'configuracoes/ia/trilha', titulo: 'Assistente de IA · Trilha das respostas', papeis: ['admin'], montar: montarTrilha });
  }
  registrar();
})();
