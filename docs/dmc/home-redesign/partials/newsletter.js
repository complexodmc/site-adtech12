// ==== 09 · NEWSLETTER ==== initNewsletter()
// Clone de initForm (main.js 106-223) para #newsletterForm → POST /api/newsletter.
// Contrato: server/src/routes/newsletter.js (201 {ok:true} · 200 isca · 400 {error,campos}
// · 413 · 429 · 503). Copy: docs/dmc/home-redesign/copy.json → newsletter.mensagens.
// Regras: sucesso SÓ com resposta 2xx e corpo.ok === true; erros nunca contêm
// "receb"/"cadastrad"; sem JS o form faz POST nativo (novalidate só entra aqui).
// Sem auto-execução; não toca nada fora da própria seção.

const EMAIL_EQUIPE = 'administrativo@complexodmc.com.br';
const TIMEOUT_MS = 15000;

export const MENSAGENS_NEWSLETTER = Object.freeze({
  enviando: 'Enviando…',
  sucesso201: 'Inscrição registrada. Você pode sair da lista a qualquer momento pelo link de cada mensagem ou por ' + EMAIL_EQUIPE + '.',
  sucesso200: 'Inscrição registrada.',
  revise: 'Revise os campos indicados.',
  nomeVazio: 'Informe seu nome.',
  nomeCurto: 'Informe seu nome completo.',
  nomeLongo: 'Nome muito longo (máximo de 120 caracteres).',
  emailVazio: 'Informe seu e-mail.',
  emailInvalido: 'E-mail inválido. Confira o endereço digitado.',
  empresaLonga: 'Nome da empresa muito longo (máximo de 120 caracteres).',
  consentimento: 'Para se inscrever, é preciso autorizar o uso do seu nome e e-mail (LGPD).',
  erro400Json: 'Não foi possível ler os dados enviados. Tente de novo.',
  erro413: 'Conteúdo grande demais. Confira os campos e tente de novo.',
  erro429: 'Muitas tentativas em sequência. Aguarde alguns minutos e tente de novo.',
  erro503: 'Não foi possível registrar agora. Tente de novo em alguns minutos ou escreva para ' + EMAIL_EQUIPE + '.',
  erroRede: 'Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.'
});

// Guarda final (OAB/LGPD): nenhuma mensagem de erro pode soar como confirmação.
const PROIBIDO_EM_ERRO = /receb|cadastrad/i;
function textoErro(texto) {
  return PROIBIDO_EM_ERRO.test(texto) ? MENSAGENS_NEWSLETTER.erro503 : texto;
}

// Validação local espelhando a do servidor (só obrigatórios e tamanhos).
export function validarLocal(valores) {
  const M = MENSAGENS_NEWSLETTER;
  const campos = {};
  const nome = String(valores.nome || '').trim();
  const email = String(valores.email || '').trim();
  const empresa = String(valores.empresa || '').trim();
  if (!nome) campos.nome = M.nomeVazio;
  else if (nome.length < 2 || !/\p{L}/u.test(nome)) campos.nome = M.nomeCurto;
  else if (nome.length > 120) campos.nome = M.nomeLongo;
  if (!email) campos.email = M.emailVazio;
  else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) campos.email = M.emailInvalido;
  if (empresa.length > 120) campos.empresa = M.empresaLonga;
  if (valores.consentimento !== true) campos.consentimento = M.consentimento;
  return campos;
}

export function initNewsletter(root = document) {
  const form = root.getElementById ? root.getElementById('newsletterForm') : root.querySelector('#newsletterForm');
  if (!form || form.tagName !== 'FORM' || form.dataset.nlPronto === '1') return null;
  form.dataset.nlPronto = '1';

  const mensagem = form.querySelector('#newsletterMessage');
  const botao = form.querySelector('[type="submit"]');
  const rotuloBotao = botao ? botao.textContent : '';
  const endpoint = form.getAttribute('action') || '/api/newsletter';
  const M = MENSAGENS_NEWSLETTER;

  // Com JS a validação nativa sai de cena (mensagens próprias, por campo);
  // sem JS o navegador continua bloqueando vazios antes do POST nativo.
  form.noValidate = true;

  function mostrarEstado(texto, estado) {
    if (!mensagem) return;
    mensagem.textContent = estado === 'erro' ? textoErro(texto) : texto;
    mensagem.className = 'form-message is-' + estado;
  }

  function ocupado(sim) {
    if (sim) form.setAttribute('aria-busy', 'true');
    else form.removeAttribute('aria-busy');
    if (botao) {
      botao.disabled = sim;
      botao.textContent = sim ? M.enviando : rotuloBotao;
    }
  }

  function limparErro(campo) {
    if (!campo || !campo.removeAttribute || !campo.id) return;
    campo.removeAttribute('aria-invalid');
    const erro = form.querySelector('#' + campo.id + '-erro');
    if (erro) erro.remove();
    const ids = (campo.getAttribute('aria-describedby') || '').split(/\s+/)
      .filter((id) => id && id !== campo.id + '-erro');
    if (ids.length) campo.setAttribute('aria-describedby', ids.join(' '));
    else campo.removeAttribute('aria-describedby');
  }

  function marcarInvalidos(campos) {
    let primeiro = null;
    Object.keys(campos || {}).forEach((nome) => {
      const campo = form.elements.namedItem(nome);
      if (!campo || !campo.setAttribute || !campo.id) return;
      campo.setAttribute('aria-invalid', 'true');
      const idErro = campo.id + '-erro';
      let erro = form.querySelector('#' + idErro);
      if (!erro) {
        erro = document.createElement('p');
        erro.id = idErro;
        erro.className = 'form-field__error';
        (campo.closest('.form-field, .form-consent') || campo.parentNode).appendChild(erro);
      }
      erro.textContent = textoErro(String(campos[nome]));
      const ids = (campo.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      if (ids.indexOf(idErro) === -1) ids.push(idErro);
      campo.setAttribute('aria-describedby', ids.join(' '));
      if (!primeiro) primeiro = campo;
    });
    if (primeiro && primeiro.focus) primeiro.focus();
  }

  form.addEventListener('input', (e) => limparErro(e.target));
  form.addEventListener('change', (e) => limparErro(e.target));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;
    form.querySelectorAll('[aria-invalid="true"]').forEach(limparErro);

    const dados = {};
    new FormData(form).forEach((valor, campo) => {
      dados[campo] = typeof valor === 'string' ? valor.trim() : valor;
    });
    const consentimento = form.elements.namedItem('consentimento');
    dados.consentimento = Boolean(consentimento && consentimento.checked);
    dados.origem = form.dataset.origem || dados.origem || 'home-newsletter';

    const invalidos = validarLocal(dados);
    if (Object.keys(invalidos).length) {
      marcarInvalidos(invalidos);
      mostrarEstado(M.revise + ' ' + Object.values(invalidos).join(' '), 'erro');
      return;
    }

    ocupado(true);
    mostrarEstado(M.enviando, 'enviando');

    let resposta;
    let corpo = null;
    try {
      const opcoes = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(dados),
        credentials: 'same-origin'
      };
      if (window.AbortSignal && typeof AbortSignal.timeout === 'function') {
        opcoes.signal = AbortSignal.timeout(TIMEOUT_MS);
      }
      resposta = await fetch(endpoint, opcoes);
      corpo = await resposta.json().catch(() => null);
    } catch (err) {
      ocupado(false);
      mostrarEstado(M.erroRede, 'erro');
      return;
    }
    ocupado(false);

    // Sucesso só com 2xx E { ok: true } — nunca simulado.
    if (resposta.ok && corpo && corpo.ok === true) {
      form.reset();
      mostrarEstado(resposta.status === 201 ? M.sucesso201 : M.sucesso200, 'sucesso');
      return;
    }
    if (resposta.status === 400 && corpo && corpo.campos && typeof corpo.campos === 'object') {
      marcarInvalidos(corpo.campos);
      mostrarEstado(M.revise + ' ' + Object.values(corpo.campos).join(' '), 'erro');
      return;
    }
    if (resposta.status === 400) { mostrarEstado(M.erro400Json, 'erro'); return; }
    if (resposta.status === 413) { mostrarEstado(M.erro413, 'erro'); return; }
    if (resposta.status === 429) { mostrarEstado(M.erro429, 'erro'); return; }
    mostrarEstado(M.erro503, 'erro'); // 503, demais 5xx, 2xx sem ok:true, qualquer outro
  });

  return form;
}
