// =============================================================
// COMPLEXO DMC · /api/newsletter — inscrição e descadastro da newsletter
//   POST /api/newsletter                     inscrição (JSON ou urlencoded)
//   GET  /api/newsletter/descadastro?token=  página de confirmação (não altera nada)
//   POST /api/newsletter/descadastro         efetiva — por `token` (link) ou `email`
//
// Mesmo desenho do /api/contato: parser próprio de 16 KB (corpoContato),
// honeypot `website`, throttle por IP (instâncias próprias), validação pura
// e testável, `salvar`/`descadastrar` injetados e NUNCA sucesso sem gravar.
//
// Dedupe por e-mail é silencioso: gravar e "já existia" respondem o mesmo
// 201 { ok: true } (um único findOneAndUpdate com upsert nos dois casos).
// Consentimento fica registrado (data, IP truncado — só com gravarIp —, origem,
// versão da política, id do texto aceito, base legal) — prova do art. 8º §2º.
// Token de descadastro: HMAC-SHA256 com JWT_SECRET, só node:crypto.
//
// Revisão 2026-10-17 (docs/dmc/home-redesign/newsletter-revisao.md):
// allowlist de Origin + limite por e-mail alvo no descadastro por e-mail,
// e-mail só ASCII sem caracteres de formato, negociação JSON×HTML única,
// headers de segurança nas páginas HTML, logs sem dado pessoal, histórico
// de descadastros preservado, aviso interno só em inscrição nova/reativada.
//
// Este módulo NÃO importa db.js nem config.js (ver blueprint-newsletter.md).
// =============================================================
import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import net from 'node:net';
import { criarThrottle } from '../throttle.js';
import { texto, aceitou, EMAIL_RE } from './contato.js';

export const LIMITES = Object.freeze({ nome: 120, email: 254, empresa: 120, origem: 120 });
export const THROTTLE_PADRAO = Object.freeze({ janelaMs: 15 * 60 * 1000, max: 5 });
// Descadastro por e-mail (sem prova de posse): além do limite por IP, cada
// endereço-alvo só pode ser objeto de poucos pedidos por dia.
export const THROTTLE_EMAIL_ALVO = Object.freeze({ janelaMs: 24 * 60 * 60 * 1000, max: 3 });
// Quantos registros de consentimento/descadastro ficam no documento (os mais recentes).
export const HISTORICO_MAX = 50;

// Textos do checkbox, versionados. O id (chave) é o que vai para o banco; o
// front deve copiar o texto daqui. Se o sentido mudar, acrescente 'v2' e
// troque TEXTO_CONSENTIMENTO — o histórico continua provando o que foi aceito.
export const TEXTOS_CONSENTIMENTO = Object.freeze({
  v1: 'Autorizo o Complexo DMC a usar meu nome e e-mail para enviar análises e conteúdos institucionais, nos termos da LGPD e da Política de Privacidade. Posso cancelar a qualquer momento.'
});
export const TEXTO_CONSENTIMENTO = 'v1';
export const BASE_LEGAL = 'consentimento'; // LGPD art. 7º, I
export const EMAIL_SUPORTE = 'administrativo@complexodmc.com.br';

const ERRO_TIPO = 'Formato inválido.';
const ERRO_EMAIL = 'E-mail inválido. Confira o endereço digitado.';
const PREFIXO_TOKEN = 'dmc-newsletter-descadastro:v1:';
// Caracteres de formato (Cf: ZWSP, ZWJ, BOM…) e soft hyphen: invisíveis, não
// fazem parte de nenhum endereço real e criariam chave de dedupe "diferente".
const INVISIVEIS_RE = /[\p{Cf}­]/gu;
const ASCII_VISIVEL_RE = /^[\x21-\x7E]+$/;

export const MENSAGENS = Object.freeze({
  throttleInscricao: 'Muitas inscrições em sequência. Aguarde alguns minutos e tente de novo.',
  throttleDescadastro: 'Muitas solicitações em sequência. Aguarde alguns minutos e tente de novo.',
  throttleEmailAlvo: 'Já recebemos pedidos recentes para este e-mail. Tente novamente mais tarde.',
  origemRecusada: 'Pedido recusado: origem não autorizada.',
  revise: 'Revise os campos indicados.',
  indisponivel: 'Não foi possível registrar sua inscrição agora. Tente novamente em instantes.',
  descadastroIndisponivel: 'Não foi possível concluir o descadastro agora. Tente novamente em instantes.',
  linkInvalido: `Link inválido. Para sair da lista, escreva para ${EMAIL_SUPORTE}.`,
  descadastroEmail: 'Se este e-mail estiver na lista, ele será removido.',
  descadastroFeito: 'Pronto. Este e-mail não receberá mais as nossas análises.',
  semPolitica: 'Inscrição temporariamente indisponível. Tente novamente mais tarde.'
});

// ---------- validação (pura) ----------
// Normaliza o e-mail para chave de dedupe: remove invisíveis, exige ASCII
// visível (sem IDN/`İ` que mudam ao passar por toLowerCase) e minúsculas.
export function normalizarEmail(valor) {
  const bruto = texto(valor);
  if (bruto === null) return { erro: ERRO_TIPO };
  const email = bruto.replace(INVISIVEIS_RE, '').trim();
  if (!email) return { erro: 'Informe seu e-mail.' };
  if (email.length > LIMITES.email || !ASCII_VISIVEL_RE.test(email) || !EMAIL_RE.test(email)) return { erro: ERRO_EMAIL };
  return { email: email.toLowerCase() };
}

export function validarInscricao(corpo) {
  const c = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
  const erros = {};
  const dados = {};

  const nome = texto(c.nome);
  if (nome === null) erros.nome = ERRO_TIPO;
  else if (!nome) erros.nome = 'Informe seu nome.';
  else if (nome.length < 2 || !/\p{L}/u.test(nome)) erros.nome = 'Informe seu nome completo.';
  else if (nome.length > LIMITES.nome) erros.nome = `Nome muito longo (máximo de ${LIMITES.nome} caracteres).`;
  else dados.nome = nome;

  const email = normalizarEmail(c.email);
  if (email.erro) erros.email = email.erro;
  else dados.email = email.email;

  const empresa = texto(c.empresa);
  if (empresa === null) erros.empresa = ERRO_TIPO;
  else if (empresa.length > LIMITES.empresa) erros.empresa = `Nome da empresa muito longo (máximo de ${LIMITES.empresa} caracteres).`;
  else if (empresa) dados.empresa = empresa;

  if (!aceitou(c.consentimento)) {
    erros.consentimento = 'Para receber nossas análises, é preciso autorizar o uso do seu nome e e-mail (LGPD).';
  }

  // origem — não é campo do usuário: só limpa e corta
  const origem = texto(c.origem);
  dados.origem = (origem || 'nao-informada').slice(0, LIMITES.origem);

  return { ok: Object.keys(erros).length === 0, erros, dados };
}

// Só o e-mail (POST /descadastro por autoatendimento).
export function validarEmail(valor) {
  const r = normalizarEmail(valor);
  return r.erro ? { ok: false, erro: r.erro } : { ok: true, email: r.email };
}

// Campo isca: invisível para pessoas, preenchido por robôs.
export function ehRobo(corpo) {
  const v = corpo && typeof corpo === 'object' ? corpo.website : undefined;
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

// ---------- IP truncado ----------
// IPv4 → /24 (último octeto zerado); IPv6 → /48 (3 primeiros hextetos).
// '::ffff:a.b.c.d' é IPv4 mapeado. Qualquer coisa que não seja IP → null.
export function truncarIp(ip) {
  if (typeof ip !== 'string' || !ip.trim()) return null;
  let s = ip.trim();
  const mapeado = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(s);
  if (mapeado) s = mapeado[1];
  if (net.isIPv4(s)) {
    const [a, b, c] = s.split('.');
    return `${a}.${b}.${c}.0/24`;
  }
  const semZona = s.split('%')[0];
  if (net.isIPv6(semZona)) {
    const [esq, dir = ''] = semZona.split('::');
    const e = esq ? esq.split(':') : [];
    const d = dir ? dir.split(':') : [];
    const faltam = 8 - e.length - d.length;
    const hextetos = [...e, ...Array(Math.max(0, faltam)).fill('0'), ...d];
    const prefixo = hextetos.slice(0, 3).map(h => (h.replace(/^0+(?=.)/, '') || '0').toLowerCase());
    return `${prefixo.join(':')}::/48`;
  }
  return null;
}

// ---------- origem da requisição (CSRF do descadastro por e-mail) ----------
// Devolve o host (minúsculo, sem porta) de uma URL/origem, ou null.
function hostDe(valor) {
  try {
    return new URL(valor).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Sem Origin e sem Referer (curl, clientes de e-mail) → permitido: o
// navegador sempre manda Origin em POST cross-site, então o ataque de
// "form auto-submit" numa página de terceiro cai aqui. Lista vazia → aceita tudo.
export function origemPermitida(req, origensPermitidas) {
  if (!origensPermitidas || !origensPermitidas.length) return true;
  const cabecalho = req.get('origin') || req.get('referer');
  if (!cabecalho) return true;           // curl, clientes sem navegador
  const host = hostDe(cabecalho);        // 'null' (origem opaca) → sem host → recusa
  if (!host) return false;
  return origensPermitidas.some(o => (hostDe(o) || String(o).toLowerCase()) === host);
}

// ---------- token de descadastro (HMAC-SHA256, sem expiração) ----------
function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function assinar(segredo, email) {
  return createHmac('sha256', segredo).update(PREFIXO_TOKEN + email, 'utf8').digest();
}

export function gerarTokenDescadastro(email, segredo) {
  if (!segredo) throw new Error('gerarTokenDescadastro: segredo ausente.');
  const e = String(email).trim().toLowerCase();
  return `${b64url(e)}.${b64url(assinar(segredo, e))}`;
}

// Devolve o e-mail (minúsculo) se o token for íntegro; senão null.
export function verificarTokenDescadastro(token, segredo) {
  if (!segredo || typeof token !== 'string') return null;
  const partes = token.trim().split('.');
  if (partes.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(partes[0]) || !/^[A-Za-z0-9_-]+$/.test(partes[1])) return null;
  let email;
  try {
    email = Buffer.from(partes[0], 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!email || email !== email.toLowerCase() || email.length > LIMITES.email || !EMAIL_RE.test(email)) return null;
  const esperado = assinar(segredo, email);
  const recebido = Buffer.from(partes[1], 'base64url');
  if (recebido.length !== esperado.length) return null;
  return timingSafeEqual(recebido, esperado) ? email : null;
}

// ---------- log sem dado pessoal ----------
// Erros do driver ecoam a chave duplicada ("dup key: { email: ... }") e, às
// vezes, o documento. Fica só nome/código e a mensagem com e-mails redigidos.
export function resumirErro(err) {
  if (!err) return 'erro desconhecido';
  const nome = err.name || 'Error';
  const codigo = err.code !== undefined ? ` code=${err.code}` : '';
  const msg = String(err.message || '')
    .replace(/dup key: \{.*\}/s, 'dup key: {…}')
    .replace(/[^\s@"'{}<>]+@[^\s@"'{}<>]+/g, '[e-mail]')
    .slice(0, 300);
  return `${nome}${codigo}: ${msg}`;
}

// ---------- apresentação ----------
export function mascararEmail(email) {
  const [local = '', dominio = ''] = String(email).split('@');
  const visivel = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visivel}***@${dominio}`;
}

function escapar(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Headers de toda resposta HTML desta rota (também fora da Vercel): sem cache,
// sem iframe (clickjacking do botão "Confirmar"), sem referrer (a URL do GET
// carrega o e-mail codificado no token), CSP fechado para página sem script.
export const HEADERS_HTML = Object.freeze({
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
});

// HTML mínimo, sem script, estilos inline (o CSP acima permite).
function pagina(titulo, miolo) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${escapar(titulo)} — Complexo DMC</title>
</head>
<body style="margin:0;background:#0b0b0c;color:#f2f2f2;font-family:Georgia,'Times New Roman',serif;">
<main style="max-width:36rem;margin:0 auto;padding:4rem 1.5rem;">
<p style="margin:0 0 2rem;font-family:Arial,Helvetica,sans-serif;font-size:.8rem;letter-spacing:.2em;text-transform:uppercase;color:#c9a44a;">Complexo DMC</p>
<h1 style="font-size:1.75rem;font-weight:normal;margin:0 0 1rem;">${escapar(titulo)}</h1>
${miolo}
<p style="margin:3rem 0 0;font-family:Arial,Helvetica,sans-serif;font-size:.8rem;color:#9a9a9a;">Dúvidas: <a href="mailto:${EMAIL_SUPORTE}" style="color:#c9a44a;">${EMAIL_SUPORTE}</a></p>
</main>
</body>
</html>`;
}

export function htmlConfirmacao(token, email) {
  return pagina('Confirmar descadastro', `
<p style="line-height:1.6;margin:0 0 1.5rem;">Você pediu para que <strong>${escapar(mascararEmail(email))}</strong> deixe de receber as análises do Complexo DMC. Confirme abaixo.</p>
<form method="post" action="" style="margin:0;">
<input type="hidden" name="token" value="${escapar(token)}">
<button type="submit" style="background:#c9a44a;color:#0b0b0c;border:0;padding:.9rem 1.6rem;font-family:Arial,Helvetica,sans-serif;font-size:.95rem;cursor:pointer;">Confirmar descadastro</button>
</form>`);
}

export function htmlConcluido() {
  return pagina('Descadastro concluído', `<p style="line-height:1.6;margin:0;">${escapar(MENSAGENS.descadastroFeito)}</p>`);
}

export function htmlLinkInvalido() {
  return pagina('Este link não é válido', `<p style="line-height:1.6;margin:0;">Este link não é válido. Para sair da lista, escreva para <a href="mailto:${EMAIL_SUPORTE}" style="color:#c9a44a;">${EMAIL_SUPORTE}</a>.</p>`);
}

export function htmlIndisponivel() {
  return pagina('Tente novamente em instantes', `<p style="line-height:1.6;margin:0;">${escapar(MENSAGENS.descadastroIndisponivel)}</p>`);
}

export function htmlMensagem(titulo, mensagem) {
  return pagina(titulo, `<p style="line-height:1.6;margin:0;">${escapar(mensagem)}</p>`);
}

// ---------- notificação interna (reuso de criarNotificadorEmail do contato) ----------
export function assuntoEmailInscricao(i) {
  return `Nova inscrição na newsletter — ${i.nome}`.replace(/[\r\n]+/g, ' ').slice(0, 180);
}

export function corpoEmailInscricao(i) {
  const c = (i.consentimentos && i.consentimentos[0]) || {};
  return [
    `Nome: ${i.nome}`,
    `E-mail: ${i.email}`,
    `Empresa: ${i.empresa || '—'}`,
    `Origem: ${i.origem}`,
    `Recebido em: ${(c.em || i.criadoEm || new Date()).toISOString()}`,
    `Política de Privacidade: versão ${c.politicaVersao || '—'} (texto ${c.texto || '—'})`
  ].join('\n');
}

// ---------- repositório MongoDB (recebe a coleção por função; testável com fake) ----------
// Upsert atômico e idempotente: cria, atualiza e REATIVA quem se descadastrou e
// voltou. findOneAndUpdate devolve o documento ANTERIOR (null se inseriu) — é o
// que diz à rota se a inscrição é nova/reativada (aviso interno) sem segunda
// consulta. Histórico de descadastros NÃO é apagado na reinscrição.
// Com o índice único em `email`, corrida entre dois upserts pode dar E11000:
// repete uma vez (ainda com upsert, caso o concorrente tenha sumido) e, se
// falhar de novo, propaga (→ 503). Nunca resolve sem ter gravado.
export function criarRepositorioNewsletter(colecao) {
  if (typeof colecao !== 'function') throw new Error('criarRepositorioNewsletter: informe () => col.newsletter().');

  function operacaoUpsert(i) {
    const momento = i.atualizadoEm || new Date();
    const set = { nome: i.nome, status: 'ativa', origem: i.origem, atualizadoEm: momento };
    const unset = { descadastro: '' };
    if (i.empresa) set.empresa = i.empresa;
    else unset.empresa = '';
    return {
      $setOnInsert: { email: i.email, criadoEm: i.criadoEm || momento },
      $set: set,
      $push: { consentimentos: { $each: i.consentimentos || [], $slice: -HISTORICO_MAX } },
      $unset: unset
    };
  }

  const OPCOES = { upsert: true, returnDocument: 'before', projection: { _id: 0, status: 1 } };

  async function upsert(c, i) {
    const op = operacaoUpsert(i);
    const r = await c.findOneAndUpdate({ email: i.email }, op, OPCOES);
    // Driver ≥ 6 devolve o documento (ou null); com includeResultMetadata, { ok, value }.
    const antes = r && typeof r === 'object' && 'ok' in r && 'value' in r ? r.value : r;
    return { nova: !antes, reativada: Boolean(antes && antes.status === 'descadastrada') };
  }

  return {
    async salvar(i) {
      const c = colecao();
      try {
        return await upsert(c, i);
      } catch (err) {
        if (!err || err.code !== 11000) throw err;
        return upsert(c, i); // se lançar de novo, propaga → 503
      }
    },
    async descadastrar(email, { via, em = new Date() } = {}) {
      const registro = { em, via };
      await colecao().updateOne(
        { email, status: 'ativa' },
        {
          $set: { status: 'descadastrada', descadastro: registro, atualizadoEm: em },
          $push: { descadastros: { $each: [registro], $slice: -HISTORICO_MAX } }
        }
      );
    }
  };
}

// ---------- limite por chave arbitrária (e-mail alvo) ----------
function criarContador({ janelaMs, max, agora = Date.now }) {
  const hits = new Map();
  const limpeza = setInterval(() => {
    const t = agora();
    for (const [k, lista] of hits) {
      const vivos = lista.filter(h => t - h < janelaMs);
      if (vivos.length) hits.set(k, vivos);
      else hits.delete(k);
    }
  }, janelaMs);
  limpeza.unref?.();
  return {
    // Devolve 0 se permitido (e registra), senão os segundos até liberar.
    registrar(chave) {
      const t = agora();
      const recentes = (hits.get(chave) || []).filter(h => t - h < janelaMs);
      if (recentes.length >= max) return Math.max(1, Math.ceil((janelaMs - (t - recentes[0])) / 1000));
      recentes.push(t);
      hits.set(chave, recentes);
      return 0;
    },
    limpar() { hits.clear(); }
  };
}

// ---------- rota ----------
export function criarRotaNewsletter({
  salvar,
  descadastrar,
  segredo,
  politicaVersao = 'nao-informada',
  exigirPoliticaVersao = false,
  gravarIp = false,
  origensPermitidas = [],
  notificar = null,
  throttle = criarThrottle({ ...THROTTLE_PADRAO, mensagem: MENSAGENS.throttleInscricao }),
  throttleDescadastro = criarThrottle({ ...THROTTLE_PADRAO, mensagem: MENSAGENS.throttleDescadastro }),
  limiteEmailAlvo = THROTTLE_EMAIL_ALVO,
  agora = () => new Date(),
  log = console
}) {
  if (typeof salvar !== 'function') throw new Error('criarRotaNewsletter: informe salvar(inscricao).');
  if (typeof descadastrar !== 'function') throw new Error('criarRotaNewsletter: informe descadastrar(email, meta).');
  if (!segredo) throw new Error('criarRotaNewsletter: informe segredo (JWT_SECRET) para os tokens de descadastro.');

  const router = Router();
  const contadorEmail = criarContador({ ...limiteEmailAlvo, agora: () => agora().getTime() });

  // JSON é o padrão (fetch com `*/*`, curl, quem envia JSON). HTML só para
  // quem declara preferir text/html e não mandou JSON — o form sem JS.
  const quer = (req, tipo) => String(req.get('accept') || '').toLowerCase().includes(tipo);
  const prefereJson = (req) => Boolean(req.is('application/json')) || !quer(req, 'text/html');
  const html = (res, status, corpo) => res.status(status).set(HEADERS_HTML).type('html').send(corpo);
  const responder = (req, res, status, corpoJson, corpoHtml) =>
    (prefereJson(req) ? res.status(status).json(corpoJson) : html(res, status, corpoHtml));

  const semPolitica = exigirPoliticaVersao && politicaVersao === 'nao-informada';
  if (politicaVersao === 'nao-informada') {
    log.warn(`[DMC] newsletter: NEWSLETTER_POLITICA_VERSAO vazia — ${semPolitica
      ? 'inscrições serão RECUSADAS (503) até a variável ser definida.'
      : 'consentimentos serão gravados com politicaVersao "nao-informada".'}`);
  }

  // ----- inscrição -----
  router.post('/', throttle, async (req, res) => {
    const corpo = req.body;

    if (ehRobo(corpo)) {
      log.warn('[DMC] newsletter: honeypot preenchido — envio descartado sem gravar.');
      return res.status(200).json({ ok: true });
    }

    const { ok, erros, dados } = validarInscricao(corpo);
    if (!ok) return res.status(400).json({ error: MENSAGENS.revise, campos: erros });

    if (semPolitica) {
      log.error('[DMC] newsletter: inscrição recusada — NEWSLETTER_POLITICA_VERSAO não definida em produção.');
      return res.status(503).json({ error: MENSAGENS.semPolitica });
    }

    const momento = agora();
    const inscricao = {
      ...dados,
      status: 'ativa',
      criadoEm: momento,
      atualizadoEm: momento,
      consentimentos: [{
        em: momento,
        ipTruncado: gravarIp ? truncarIp(req.ip) : null,
        origem: dados.origem,
        politicaVersao,
        texto: TEXTO_CONSENTIMENTO,
        baseLegal: BASE_LEGAL
      }]
    };

    let resultado;
    try {
      resultado = await salvar(inscricao);
    } catch (err) {
      log.error('[DMC] newsletter: falha ao gravar inscrição:', resumirErro(err));
      return res.status(503).json({ error: MENSAGENS.indisponivel });
    }

    // Já gravado: falha no e-mail interno não vira erro para quem se inscreveu.
    // Aviso só para inscrição nova ou reativada (reenvio do mesmo e-mail não
    // inunda a equipe); `salvar` sem retorno = avisa (compatibilidade).
    const avisar = !resultado || resultado.nova === true || resultado.reativada === true;
    if (notificar && avisar) {
      try {
        await notificar(inscricao);
        log.log(`[DMC] newsletter: inscrição registrada (origem ${inscricao.origem}); equipe notificada por e-mail.`);
      } catch (err) {
        log.error('[DMC] newsletter: inscrição registrada, mas o e-mail de notificação falhou:', resumirErro(err));
      }
    } else {
      log.log(`[DMC] newsletter: inscrição registrada (origem ${inscricao.origem}); ${notificar ? 'reenvio — sem aviso' : 'e-mail de notificação não configurado'}.`);
    }

    // Sem id e sem distinguir "nova" de "já existia": não revela quem está na lista.
    res.status(201).json({ ok: true });
  });

  // ----- descadastro: página de confirmação (GET nunca altera estado) -----
  router.get('/descadastro', (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const email = verificarTokenDescadastro(token, segredo);
    if (!email) return html(res, 400, htmlLinkInvalido());
    html(res, 200, htmlConfirmacao(token.trim(), email));
  });

  // ----- descadastro: efetiva -----
  router.post('/descadastro', throttleDescadastro, async (req, res) => {
    const corpo = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};

    if (ehRobo(corpo)) {
      log.warn('[DMC] newsletter: honeypot preenchido no descadastro — descartado.');
      return res.status(200).json({ ok: true });
    }

    const tokenBruto = typeof corpo.token === 'string' ? corpo.token.trim() : (corpo.token === undefined ? '' : null);
    if (tokenBruto === null || tokenBruto) {
      const email = tokenBruto ? verificarTokenDescadastro(tokenBruto, segredo) : null;
      if (!email) return responder(req, res, 400, { error: MENSAGENS.linkInvalido }, htmlLinkInvalido());
      try {
        await descadastrar(email, { via: 'token', em: agora() });
      } catch (err) {
        log.error('[DMC] newsletter: falha ao descadastrar (token):', resumirErro(err));
        return responder(req, res, 503, { error: MENSAGENS.descadastroIndisponivel }, htmlIndisponivel());
      }
      log.log('[DMC] newsletter: descadastro via token processado.');
      // Mesma resposta se já estava descadastrado ou nunca existiu.
      return responder(req, res, 200, { ok: true }, htmlConcluido());
    }

    // Autoatendimento por e-mail (sem prova de posse): só da própria origem,
    // limitado por IP (acima) e por endereço-alvo. Resposta idêntica exista ou não.
    if (!origemPermitida(req, origensPermitidas)) {
      log.warn('[DMC] newsletter: descadastro por e-mail recusado — Origin/Referer fora da lista permitida.');
      return responder(req, res, 403, { error: MENSAGENS.origemRecusada }, htmlMensagem('Pedido recusado', MENSAGENS.origemRecusada));
    }
    const v = validarEmail(corpo.email);
    if (!v.ok) {
      return responder(req, res, 400, { error: MENSAGENS.revise, campos: { email: v.erro } }, htmlMensagem('Revise o e-mail', v.erro));
    }
    const espera = contadorEmail.registrar(v.email);
    if (espera) {
      res.set('Retry-After', String(espera));
      return responder(req, res, 429, { error: MENSAGENS.throttleEmailAlvo }, htmlMensagem('Aguarde', MENSAGENS.throttleEmailAlvo));
    }
    try {
      await descadastrar(v.email, { via: 'email', em: agora() });
    } catch (err) {
      log.error('[DMC] newsletter: falha ao descadastrar (e-mail):', resumirErro(err));
      return responder(req, res, 503, { error: MENSAGENS.descadastroIndisponivel }, htmlIndisponivel());
    }
    log.log('[DMC] newsletter: descadastro via e-mail processado.');
    responder(req, res, 202, { ok: true, mensagem: MENSAGENS.descadastroEmail }, htmlMensagem('Pedido recebido', MENSAGENS.descadastroEmail));
  });

  router.limparContadores = () => contadorEmail.limpar();
  return router;
}
