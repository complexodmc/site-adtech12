// =============================================================
// COMPLEXO DMC · Portal — e-mail transacional (Resend) e modelos
// PORTAL-API §4.14, §6.1 · dono: F0m.
//
// - criarEnviadorEmail: POST <resend>/emails no mesmo formato de
//   criarNotificadorEmail (routes/contato.js), sem reply_to, com
//   timeout. NUNCA lança: devolve { enviado:false, motivo } quando falta
//   configuração ou o provedor falha. Destinatário nunca vai em claro ao
//   log (HMAC do identificador).
// - enviarEmSegundoPlano: não espera o provedor (anti-enumeração por
//   tempo, §6.1). Na Vercel, registra a promessa no `waitUntil` do
//   contexto da requisição (mesmo mecanismo de @vercel/functions, sem
//   dependência nova); fora dela, dispara sem await.
// - MODELOS: textos fixos, sóbrios, pt-BR, sem dado além do do próprio
//   destinatário. Todo modelo termina com o aviso "Se não foi você…".
// - montarLinkDeAcesso: links SÓ com `configPortal.baseUrl` (nunca o
//   cabeçalho Host) e o token SÓ no fragmento de acesso-link.html.
// =============================================================
import { resumirErro } from './erros.js';
import { validarEmail } from './validacao.js';
import { hmacIdentificador } from './cripto.js';

export const URL_RESEND_PADRAO = 'https://api.resend.com';
export const ASSINATURA = 'Plataforma Complexo DMC';
export const RODAPE_SEGURANCA = 'Se não foi você, fale com a coordenação pelo Atendimento.';
export const FRAGMENTOS_LINK = Object.freeze(['acesso', 'redefinir', 'email', 'verificar']);

/**
 * Link de uso único da página pública acesso-link.html (o token só no fragmento:
 * não vai a log de servidor nem a Referer). baseUrl ausente → null (fluxo indisponível).
 */
export function montarLinkDeAcesso({ baseUrl, tipo, token }) {
  if (!baseUrl || typeof baseUrl !== 'string') return null;
  if (!FRAGMENTOS_LINK.includes(tipo)) throw new TypeError(`montarLinkDeAcesso: tipo inválido (${String(tipo)}).`);
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) throw new TypeError('montarLinkDeAcesso: token inválido.');
  return `${baseUrl.replace(/\/+$/, '')}/plataforma-ead/acesso-link.html#${tipo}=${token}`;
}

// ---------- modelos ----------
const umaLinha = s => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
const assuntoDe = s => umaLinha(s).slice(0, 180);
const primeiroNome = nome => umaLinha(nome).split(' ')[0] || '';
const saudacao = nome => (primeiroNome(nome) ? `Olá, ${primeiroNome(nome)}.` : 'Olá.');

const FORMATO_DATA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
});
function dataHora(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return FORMATO_DATA.format(x).replace(',', ' às');
}

function corpo(nome, ...paragrafos) {
  return [saudacao(nome), '', ...paragrafos.flatMap(p => [p, '']), RODAPE_SEGURANCA, '', `— ${ASSINATURA}`].join('\n');
}

function exigirLink(link, modelo) {
  if (typeof link !== 'string' || !/^https?:\/\//.test(link)) throw new TypeError(`MODELOS.${modelo}: link ausente.`);
  return link;
}

/** Mascara um e-mail para citar no aviso ao endereço antigo: 'jo***@dominio.com'. */
export function mascararEmail(email) {
  const s = String(email ?? '');
  const i = s.indexOf('@');
  if (i < 1) return '';
  return `${s.slice(0, Math.min(2, i))}***${s.slice(i)}`;
}

/** Cada modelo: (dados) → { assunto (≤ 180), texto puro }. */
export const MODELOS = Object.freeze({
  linkAcesso({ nome, link, validadeMin = 15 } = {}) {
    return {
      assunto: assuntoDe('Seu link de acesso à Plataforma Complexo DMC'),
      texto: corpo(nome,
        `Recebemos um pedido de acesso à sua conta. Para entrar, abra o link abaixo. Ele vale por ${validadeMin} minutos e só pode ser usado uma vez.`,
        exigirLink(link, 'linkAcesso'))
    };
  },
  redefinirSenha({ nome, link, validadeMin = 30 } = {}) {
    return {
      assunto: assuntoDe('Criar uma nova senha na Plataforma Complexo DMC'),
      texto: corpo(nome,
        `Recebemos um pedido para criar uma nova senha. Abra o link abaixo para definir a nova senha. Ele vale por ${validadeMin} minutos e só pode ser usado uma vez.`,
        exigirLink(link, 'redefinirSenha'),
        'Se você não fez o pedido, ignore esta mensagem: a sua senha atual continua valendo.')
    };
  },
  confirmarNovoEmail({ nome, link, validadeHoras = 24 } = {}) {
    return {
      assunto: assuntoDe('Confirme o novo e-mail da sua conta'),
      texto: corpo(nome,
        `Este endereço foi indicado como o novo e-mail da sua conta na Plataforma Complexo DMC. Para confirmar a troca, abra o link abaixo. Ele vale por ${validadeHoras} horas.`,
        exigirLink(link, 'confirmarNovoEmail'))
    };
  },
  verificarEmail({ nome, link, validadeHoras = 24 } = {}) {
    return {
      assunto: assuntoDe('Confirme o seu e-mail'),
      texto: corpo(nome,
        `Para confirmar que este e-mail é seu, abra o link abaixo. Ele vale por ${validadeHoras} horas.`,
        exigirLink(link, 'verificarEmail'))
    };
  },
  avisoSenhaAlterada({ nome, em = null } = {}) {
    const quando = em ? dataHora(em) : null;
    return {
      assunto: assuntoDe('A senha da sua conta foi alterada'),
      texto: corpo(nome, `A senha da sua conta na Plataforma Complexo DMC foi alterada${quando ? ` em ${quando} (horário de Brasília)` : ''}. As outras sessões abertas foram encerradas.`)
    };
  },
  avisoEmailAlterado({ nome, novoEmail = null, pelaCoordenacao = false } = {}) {
    const novo = novoEmail ? mascararEmail(novoEmail) : '';
    return {
      assunto: assuntoDe('O e-mail da sua conta foi alterado'),
      texto: corpo(nome,
        `${pelaCoordenacao ? 'A coordenação alterou' : 'Foi alterado'} o e-mail de acesso da sua conta na Plataforma Complexo DMC${novo ? ` para ${novo}` : ''}. Este endereço deixa de receber as mensagens da plataforma.`)
    };
  },
  aviso2faAlterado({ nome, ativado = false, pelaCoordenacao = false } = {}) {
    const acao = ativado ? 'foi ativada' : (pelaCoordenacao ? 'foi redefinida pela coordenação' : 'foi desativada');
    return {
      assunto: assuntoDe('Verificação em duas etapas da sua conta'),
      texto: corpo(nome, `A verificação em duas etapas da sua conta na Plataforma Complexo DMC ${acao}.`)
    };
  },
  avisoSenhaTemporaria({ nome, expiraEm = null } = {}) {
    const ate = expiraEm ? dataHora(expiraEm) : null;
    return {
      assunto: assuntoDe('Uma senha temporária foi gerada para a sua conta'),
      texto: corpo(nome,
        `A coordenação gerou uma senha temporária para a sua conta na Plataforma Complexo DMC${ate ? `, válida até ${ate} (horário de Brasília)` : ''}. A senha é entregue pela coordenação, nunca por e-mail. No primeiro acesso, você define uma senha nova.`,
        'A senha anterior deixou de valer e as sessões abertas foram encerradas.')
    };
  },
  aviso2faBloqueado({ nome, ateEm = null } = {}) {
    const ate = ateEm ? dataHora(ateEm) : null;
    return {
      assunto: assuntoDe('Tentativas de código bloqueadas na sua conta'),
      texto: corpo(nome,
        `Houve muitas tentativas erradas do código de verificação em duas etapas da sua conta. Por segurança, a verificação ficou bloqueada${ate ? ` até ${ate} (horário de Brasília)` : ' por uma hora'}.`)
    };
  },
  avisoTentativasDeAcesso({ nome } = {}) {
    return {
      assunto: assuntoDe('Tentativas de acesso à sua conta'),
      texto: corpo(nome,
        'Registramos várias tentativas de entrar na sua conta com senha errada. Se foi você, aguarde alguns minutos ou use o link de acesso por e-mail. Se não foi, troque a sua senha em Perfil › Senha e segurança.')
    };
  },
  avisoSenhaErradaLogado({ nome } = {}) {
    return {
      assunto: assuntoDe('Sessão encerrada por tentativas de senha'),
      texto: corpo(nome,
        'Houve várias tentativas com a senha errada numa sessão aberta da sua conta. Por segurança, as sessões foram encerradas e a confirmação de senha ficou bloqueada por alguns minutos.')
    };
  },
  contratoAssinado({ nome, titulo = null, codigo = null, link = null } = {}) {
    const ref = umaLinha(titulo);
    return {
      assunto: assuntoDe(ref ? `Contrato assinado: ${ref}` : 'Contrato assinado'),
      texto: corpo(nome,
        `Registramos a sua assinatura eletrônica${ref ? ` do contrato "${ref}"` : ' do contrato'}.${codigo ? ` Código de verificação: ${umaLinha(codigo)}.` : ''}`,
        link ? `O comprovante fica disponível em: ${exigirLink(link, 'contratoAssinado')}` : 'O comprovante fica disponível em Documentação › Contratos.')
    };
  }
});

// ---------- enviador ----------
function contextoDaVercel() {
  try {
    return globalThis[Symbol.for('@vercel/request-context')]?.get?.() || null;
  } catch {
    return null;
  }
}

/**
 * @param {{ resendApiKey?: string|null, de?: string|null, url?: string, fetchImpl?: Function,
 *   timeoutMs?: number, log?: Console, hmac?: (valor: string) => string }} opcoes
 */
export function criarEnviadorEmail({
  resendApiKey = null, de = null, url = URL_RESEND_PADRAO, fetchImpl = globalThis.fetch, timeoutMs = 5000, log = console, hmac = hmacIdentificador
} = {}) {
  const disponivel = !!(resendApiKey && de);
  const destino = `${String(url || URL_RESEND_PADRAO).replace(/\/+$/, '')}/emails`;

  const referencia = (para) => {
    try { return String(hmac(para)).slice(0, 12); } catch { return 'oculto'; }
  };
  const logar = (motivo, para, err) => {
    try {
      const r = err ? resumirErro(err) : null;
      (log.warn || log.error).call(log, JSON.stringify({ nivel: 'aviso', evento: 'portal.email', motivo, destinatario: referencia(para), ...(r ? { erroResumido: r } : {}) }));
    } catch { /* nada */ }
  };

  /** → { enviado:true } | { enviado:false, motivo:'nao-configurado'|'destinatario-invalido'|'falha-provedor' }. Nunca lança. */
  async function enviar({ para, assunto, texto } = {}) {
    if (!disponivel) return { enviado: false, motivo: 'nao-configurado' };
    const email = validarEmail(para);
    if (!email) { logar('destinatario-invalido', String(para ?? '')); return { enviado: false, motivo: 'destinatario-invalido' }; }
    try {
      const resp = await fetchImpl(destino, {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: de, to: [email], subject: assuntoDe(assunto), text: String(texto ?? '') }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!resp || !resp.ok) {
        logar('falha-provedor', email, new Error(`Resend respondeu HTTP ${resp?.status ?? '?'}`));
        return { enviado: false, motivo: 'falha-provedor' };
      }
      return { enviado: true };
    } catch (err) {
      logar('falha-provedor', email, err);
      return { enviado: false, motivo: 'falha-provedor' };
    }
  }

  /** Dispara sem esperar o provedor. Devolve a promessa (para testes); nunca rejeita. */
  function enviarEmSegundoPlano(mensagem) {
    const p = enviar(mensagem).catch(() => ({ enviado: false, motivo: 'falha-provedor' }));
    const ctx = contextoDaVercel();
    if (ctx && typeof ctx.waitUntil === 'function') {
      try { ctx.waitUntil(p); } catch { /* segue sem waitUntil */ }
    }
    return p;
  }

  return Object.freeze({ disponivel, enviar, enviarEmSegundoPlano });
}
