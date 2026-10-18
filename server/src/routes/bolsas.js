// =============================================================
// COMPLEXO DMC · /api/bolsas — Concurso de Bolsas da DMC Business School
//   POST /api/bolsas/pre-inscricao                  pré-inscrição pública
//   GET  /api/bolsas/admin/pre-inscricoes?pagina=1  lista da equipe (admin)
//
// Pré-inscrição NÃO é inscrição no concurso nem promessa de bolsa: o
// registro serve para avisar a pessoa quando o concurso for aberto
// (finalidade do consentimento: `aviso-concurso-bolsas`). Critérios,
// quantidade de bolsas e datas não existem aqui — nada é inventado.
//
// Mesmo desenho de /api/parcerias: parser próprio de 16 KB, honeypot
// `website`, throttle por IP (contador próprio), validação pura e
// testável, e nunca responde sucesso sem gravar. Duplicidade: um
// registro por e-mail, garantido pelo índice ÚNICO `uq_bolsas_email`
// (sem corrida) — tenta inserir; E11000 do e-mail → devolve o protocolo
// da pré-inscrição existente.
//
// Este módulo NÃO importa db.js, config.js nem auth.js: o server.js
// injeta o repositório, o notificador e o middleware de administrador.
// Assim os testes rodam sem MongoDB.
// =============================================================
import express, { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { criarThrottle } from '../throttle.js';

// ---------- opções ----------
export const PERFIS = Object.freeze({
  'estudante-graduacao': 'Estudante de graduação',
  'recem-formado': 'Recém-formado(a)',
  'profissional': 'Profissional',
  'outro': 'Outro'
});

// As cinco áreas de capacitação da DMC Business School.
export const AREAS = Object.freeze({
  'planejamento-sucessorio-patrimonial': 'Planejamento Sucessório e Patrimonial',
  'holding-patrimonial': 'Holding Patrimonial',
  'notarial-imobiliario': 'Direito Notarial e Imobiliário',
  'negocios-vendas': 'Negócios e Vendas',
  'tecnologia': 'Tecnologia'
});

export const UFS = Object.freeze([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]);

// ---------- limites ----------
export const LIMITES = Object.freeze({ nome: 120, email: 254, whatsapp: 30, cidade: 80, motivacao: 400, pagina: 80, utm: 80 });
export const MINIMOS = Object.freeze({ nome: 2, cidade: 2 });
export const CORPO_MAX = '16kb';
export const THROTTLE_PADRAO = Object.freeze({ janelaMs: 15 * 60 * 1000, max: 5 });
export const POR_PAGINA = 25;
export const UTM_CAMPOS = Object.freeze(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']);
export const STATUS_INICIAL = 'pre-inscrito';
export const FINALIDADE_CONSENTIMENTO = 'aviso-concurso-bolsas';
export const OBRIGATORIOS = Object.freeze(['nome', 'email', 'cidade', 'uf', 'perfil', 'area', 'consentimento']);

export const MENSAGENS = Object.freeze({
  revise: 'Revise os campos indicados.',
  indisponivel: 'Não foi possível registrar sua pré-inscrição agora. Tente novamente em instantes.',
  adminIndisponivel: 'Não foi possível acessar as pré-inscrições agora. Tente novamente em instantes.',
  excesso: 'Muitos envios em sequência. Aguarde alguns minutos e tente de novo.',
  grande: 'Conteúdo grande demais. Reduza os textos e tente de novo.',
  ilegivel: 'Não foi possível ler os dados enviados.'
});

const ERRO_TIPO = 'Formato inválido.';
const ACEITES = new Set(['true', 'on', '1', 'sim', 'yes']);
// Mesmo padrão do /api/contato e das parcerias.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------- normalização ----------
// String limpa, '' para ausente, ou null quando o tipo é inválido
// (objeto/array/booleano — barra operador ou estrutura no lugar de texto).
function texto(valor, { multilinha = false } = {}) {
  if (valor === undefined || valor === null) return '';
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  let s = String(valor).normalize('NFC');
  if (multilinha) {
    s = s.replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
  } else {
    s = s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ');
  }
  return s.trim();
}

// "Recém formado" → "recem-formado": aceita rótulo digitado ou a chave.
function chave(valor) {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_/]+/g, '-');
}

function objeto(corpo) {
  return corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
}

// Checkbox: true só com valor afirmativo; null quando o tipo é inválido.
function lerAceite(valor) {
  if (valor === undefined || valor === null) return false;
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return valor === 1;
  if (typeof valor !== 'string') return null;
  return ACEITES.has(valor.trim().toLowerCase());
}

// ---------- leitores de campo ----------
// Cada leitor devolve { valor } (undefined = opcional ausente) ou { erro }.
function lerTexto(valor, { obrigatorio = false, min = 0, max, multilinha = false, letra = false, vazio, curto, longo }) {
  const s = texto(valor, { multilinha });
  if (s === null) return { erro: ERRO_TIPO };
  if (!s) return obrigatorio ? { erro: vazio } : { valor: undefined };
  if (s.length < min || (letra && !/\p{L}/u.test(s))) return { erro: curto };
  if (s.length > max) return { erro: longo };
  return { valor: s };
}

function lerEmail(valor) {
  const s = texto(valor);
  if (s === null) return { erro: ERRO_TIPO };
  if (!s) return { erro: 'Informe seu e-mail.' };
  if (s.length > LIMITES.email || !EMAIL_RE.test(s)) return { erro: 'E-mail inválido. Confira o endereço digitado.' };
  return { valor: s.toLowerCase() };
}

// Opcional. Grava só os dígitos (DDD + número; aceita 55 na frente).
function lerWhatsapp(valor) {
  const s = texto(valor);
  if (s === null) return { erro: ERRO_TIPO };
  if (!s) return { valor: undefined };
  const digitos = s.replace(/\D/g, '');
  if (s.length > LIMITES.whatsapp || digitos.length < 10 || digitos.length > 13) {
    return { erro: 'WhatsApp inválido. Informe DDD e número (ou deixe em branco).' };
  }
  return { valor: digitos };
}

function lerUf(valor) {
  const s = texto(valor);
  if (s === null) return { erro: ERRO_TIPO };
  if (!s) return { erro: 'Selecione a UF.' };
  const uf = s.toUpperCase();
  if (!UFS.includes(uf)) return { erro: 'UF inválida. Escolha uma das opções da lista.' };
  return { valor: uf };
}

function lerOpcao(valor, opcoes, { vazio, invalido }) {
  const s = texto(valor);
  if (s === null) return { erro: ERRO_TIPO };
  if (!s) return { erro: vazio };
  const k = chave(s);
  if (!Object.hasOwn(opcoes, k)) return { erro: invalido };
  return { valor: k };
}

function aplicar(resultado, campo, erros, dados) {
  if (resultado.erro) erros[campo] = resultado.erro;
  else if (resultado.valor !== undefined) dados[campo] = resultado.valor;
}

// `pagina` e utm_*: não são campos do usuário — só limpa e corta.
// A página fica só com o caminho: sem esquema/host, query e fragmento
// (podem carregar dado pessoal) e só com [A-Za-z0-9._/-].
function lerFonte(c, erros) {
  const fonte = {};
  const pagina = texto(c.pagina);
  if (pagina === null) erros.pagina = ERRO_TIPO;
  else {
    const caminho = pagina.split(/[?#]/)[0].replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
    fonte.pagina = caminho.replace(/[^A-Za-z0-9._/-]/g, '').slice(0, LIMITES.pagina) || 'nao-informada';
  }
  for (const k of UTM_CAMPOS) {
    const v = texto(c[k]);
    if (v === null) { erros[k] = ERRO_TIPO; continue; }
    const limpo = v.replace(/[^A-Za-z0-9._-]/g, '').slice(0, LIMITES.utm);
    if (limpo) fonte[k] = limpo;
  }
  return fonte;
}

// ---------- validação (pura) ----------
// Devolve { ok, erros, dados, fonte, comunicacoes }. `dados` só contém
// campos conhecidos e validados; qualquer outra chave do corpo (status,
// protocolo, bolsa…) é ignorada.
export function validarPreInscricao(corpo) {
  const c = objeto(corpo);
  const erros = {};
  const dados = {};

  aplicar(lerTexto(c.nome, {
    obrigatorio: true, min: MINIMOS.nome, max: LIMITES.nome, letra: true,
    vazio: 'Informe seu nome.',
    curto: 'Informe seu nome completo.',
    longo: `Nome muito longo (máximo de ${LIMITES.nome} caracteres).`
  }), 'nome', erros, dados);
  aplicar(lerEmail(c.email), 'email', erros, dados);
  aplicar(lerWhatsapp(c.whatsapp), 'whatsapp', erros, dados);
  aplicar(lerTexto(c.cidade, {
    obrigatorio: true, min: MINIMOS.cidade, max: LIMITES.cidade, letra: true,
    vazio: 'Informe a cidade.',
    curto: 'Cidade inválida.',
    longo: `Nome da cidade muito longo (máximo de ${LIMITES.cidade} caracteres).`
  }), 'cidade', erros, dados);
  aplicar(lerUf(c.uf), 'uf', erros, dados);
  aplicar(lerOpcao(c.perfil, PERFIS, {
    vazio: 'Selecione seu perfil.',
    invalido: 'Perfil inválido. Escolha uma das opções da lista.'
  }), 'perfil', erros, dados);
  aplicar(lerOpcao(c.area, AREAS, {
    vazio: 'Selecione a área de interesse.',
    invalido: 'Área inválida. Escolha uma das opções da lista.'
  }), 'area', erros, dados);
  aplicar(lerTexto(c.motivacao, {
    max: LIMITES.motivacao, multilinha: true,
    longo: `Texto muito longo (máximo de ${LIMITES.motivacao} caracteres).`
  }), 'motivacao', erros, dados);

  // Consentimento LGPD (obrigatório) e opt-in de comunicações (opcional, separado).
  const consentimento = lerAceite(c.consentimento);
  if (consentimento === null) erros.consentimento = ERRO_TIPO;
  else if (!consentimento) {
    erros.consentimento = 'Para registrarmos sua pré-inscrição, é preciso autorizar o tratamento dos seus dados (LGPD).';
  }
  const comunicacoes = lerAceite(c.comunicacoes);
  if (comunicacoes === null) erros.comunicacoes = ERRO_TIPO;

  const fonte = lerFonte(c, erros);

  return { ok: Object.keys(erros).length === 0, erros, dados, fonte, comunicacoes: comunicacoes === true };
}

// Campo isca: invisível para pessoas, preenchido por robôs.
export function ehRobo(corpo) {
  const v = corpo && typeof corpo === 'object' ? corpo.website : undefined;
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

// ---------- protocolo ----------
// 32 símbolos, sem os ambíguos 0, 1, I e O. 256 é múltiplo de 32, então
// `byte & 31` é uniforme. Ano no fuso de São Paulo.
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const PROTOCOLO_RE = /^BOL-\d{4}-[2-9A-HJ-NP-Z]{6}$/;
const anoSP = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' });

export function gerarProtocolo(momento = new Date(), bytes = randomBytes) {
  let sufixo = '';
  for (const b of bytes(6)) sufixo += ALFABETO[b & 31];
  return `BOL-${anoSP.format(momento)}-${sufixo}`;
}

// ---------- documento ----------
/**
 * Documento de `bolsas_preinscricoes`. `email` fica também na raiz: é a
 * chave do índice único (um registro por e-mail). Não há IP, user-agent
 * nem referrer — de propósito.
 */
export function montarPreInscricao({ dados, fonte, comunicacoes, momento, protocolo }) {
  return {
    protocolo,
    email: dados.email,
    dados,
    fonte,
    status: STATUS_INICIAL,
    consentimento: { aceito: true, em: momento, finalidade: FINALIDADE_CONSENTIMENTO },
    comunicacoes: { aceito: Boolean(comunicacoes), em: comunicacoes ? momento : null },
    createdAt: momento
  };
}

/**
 * Qual índice único barrou o insert (E11000): 'email', 'protocolo' ou null.
 * Usa keyPattern (driver 6) e, na falta dele, o nome do índice na mensagem.
 */
export function chaveDuplicada(err) {
  if (!err || err.code !== 11000) return null;
  const kp = err.keyPattern && typeof err.keyPattern === 'object' ? err.keyPattern : null;
  if (kp && Object.hasOwn(kp, 'email')) return 'email';
  if (kp && Object.hasOwn(kp, 'protocolo')) return 'protocolo';
  const indice = (/index: (\S+)/.exec(String(err.message || '')) || [])[1];
  if (indice === 'uq_bolsas_email' || indice === 'email_1') return 'email';
  if (indice === 'uq_bolsas_protocolo' || indice === 'protocolo_1') return 'protocolo';
  return null;
}

// ---------- log sem dado pessoal ----------
// O driver ecoa a chave duplicada ("dup key: { email: ... }"): no log fica
// só nome/código e a mensagem com e-mails redigidos.
function resumirErro(err) {
  if (!err) return 'erro desconhecido';
  const codigo = err.code !== undefined ? ` code=${err.code}` : '';
  const msg = String(err.message || '')
    .replace(/dup key: \{.*\}/s, 'dup key: {…}')
    .replace(/[^\s@"'{}<>]+@[^\s@"'{}<>]+/g, '[e-mail]')
    .slice(0, 300);
  return `${err.name || 'Error'}${codigo}: ${msg}`;
}

// ---------- corpo da requisição ----------
// Parser próprio, com teto pequeno. O server.js monta isto ANTES do
// express.json global (1 MB): o corpo já chega consumido e o global
// apenas segue adiante.
export function corpoBolsas() {
  return [
    express.json({ limit: CORPO_MAX }),
    express.urlencoded({ extended: false, limit: CORPO_MAX }),
    (err, _req, res, next) => {
      if (err && err.type === 'entity.too.large') return res.status(413).json({ error: MENSAGENS.grande });
      if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
        return res.status(400).json({ error: MENSAGENS.ilegivel });
      }
      next(err);
    }
  ];
}

// ---------- notificação por e-mail (Resend, via fetch — sem dependência) ----------
// Sem chave ou destinatário devolve null: a pré-inscrição só é gravada e logada.
export function criarNotificadorBolsas({ resendApiKey, para, de, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  if (!resendApiKey || !para) return null;
  const destinatarios = String(para).split(',').map(s => s.trim()).filter(Boolean);
  if (!destinatarios.length) return null;
  const remetente = de || 'Site Complexo DMC <onboarding@resend.dev>';

  return async function notificar(pre) {
    const resp = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remetente,
        to: destinatarios,
        reply_to: pre.dados.email,
        subject: assuntoEmailPreInscricao(pre),
        text: corpoEmailPreInscricao(pre)
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!resp.ok) throw new Error(`Resend respondeu HTTP ${resp.status}`);
    return { enviado: true };
  };
}

export function assuntoEmailPreInscricao(p) {
  return `[Concurso de Bolsas] Nova pré-inscrição — ${p.dados.nome}`.replace(/[\r\n]+/g, ' ').slice(0, 180);
}

export function corpoEmailPreInscricao(p) {
  const d = p.dados;
  return [
    `Protocolo: ${p.protocolo}`,
    `Nome: ${d.nome}`,
    `E-mail: ${d.email}`,
    `WhatsApp: ${d.whatsapp || '—'}`,
    `Cidade/UF: ${d.cidade}/${d.uf}`,
    `Perfil: ${PERFIS[d.perfil] || d.perfil}`,
    `Área de interesse: ${AREAS[d.area] || d.area}`,
    `Aceita comunicações institucionais: ${p.comunicacoes && p.comunicacoes.aceito ? 'sim' : 'não'}`,
    `Página: ${p.fonte && p.fonte.pagina ? p.fonte.pagina : '—'}`,
    `Recebido em: ${p.createdAt.toISOString()}`,
    '',
    'Motivação:',
    d.motivacao || '—'
  ].join('\n');
}

// ---------- repositório MongoDB ----------
// Recebe uma função que devolve a coleção (col.bolsas), chamada só na
// hora do uso — a conexão é aberta depois que o módulo é montado.
export function criarRepositorioBolsas(colecao) {
  return {
    salvar: (doc) => colecao().insertOne(doc),
    buscarPorEmail: (email) => colecao().findOne({ email }, { projection: { protocolo: 1, email: 1, createdAt: 1 } }),
    async listar({ pular, limite }) {
      const [itens, total] = await Promise.all([
        colecao().find({}).sort({ createdAt: -1 }).skip(pular).limit(limite).toArray(),
        colecao().countDocuments({})
      ]);
      return { itens, total };
    }
  };
}

function paraAdmin(doc) {
  const { _id, ...resto } = doc;
  return { id: _id !== undefined ? String(_id) : undefined, ...resto };
}

// ---------- rotas ----------
export function criarRotaBolsas({
  salvar,
  buscarPorEmail,
  listar,
  exigirAdmin,
  notificar = null,
  throttle = criarThrottle({ ...THROTTLE_PADRAO, mensagem: MENSAGENS.excesso }),
  gerar = gerarProtocolo,
  agora = () => new Date(),
  log = console
}) {
  for (const [nome, fn] of Object.entries({ salvar, buscarPorEmail, listar })) {
    if (typeof fn !== 'function') throw new Error(`criarRotaBolsas: informe ${nome}().`);
  }
  const guardas = [].concat(exigirAdmin || []);
  if (!guardas.length || guardas.some(g => typeof g !== 'function')) {
    throw new Error('criarRotaBolsas: informe exigirAdmin (middleware de administrador).');
  }

  const router = Router();

  // Grava; E11000 do e-mail vira "duplicada" com o protocolo existente
  // (cobre a corrida de dois envios simultâneos). Colisão de protocolo
  // (raríssima) sorteia outro. Qualquer outra falha sobe (→ 503).
  async function registrar({ dados, fonte, comunicacoes, momento }) {
    for (let tentativa = 1; ; tentativa++) {
      const doc = montarPreInscricao({ dados, fonte, comunicacoes, momento, protocolo: gerar(momento) });
      try {
        await salvar(doc);
        return { doc };
      } catch (err) {
        const duplicado = chaveDuplicada(err);
        if (duplicado === 'protocolo' && tentativa < 3) continue;
        if (duplicado === 'email') {
          const existente = await buscarPorEmail(dados.email);
          if (existente && existente.protocolo) return { existente };
          if (tentativa < 3) continue; // apagada entre o insert e a busca
        }
        throw err;
      }
    }
  }

  router.post('/pre-inscricao', throttle, async (req, res) => {
    const corpo = req.body;

    if (ehRobo(corpo)) {
      log.warn('[DMC] bolsas: honeypot preenchido — envio descartado sem gravar.');
      return res.status(200).json({ ok: true });
    }

    const { ok, erros, dados, fonte, comunicacoes } = validarPreInscricao(corpo);
    if (!ok) return res.status(400).json({ error: MENSAGENS.revise, campos: erros });

    let resultado;
    try {
      resultado = await registrar({ dados, fonte, comunicacoes, momento: agora() });
    } catch (err) {
      log.error('[DMC] bolsas: falha ao gravar pré-inscrição:', resumirErro(err));
      return res.status(503).json({ error: MENSAGENS.indisponivel });
    }

    if (resultado.existente) {
      log.log(`[DMC] bolsas: e-mail já pré-inscrito — mantida a pré-inscrição ${resultado.existente.protocolo}.`);
      return res.status(200).json({ ok: true, duplicada: true, protocolo: resultado.existente.protocolo });
    }

    const { doc } = resultado;
    // Já está gravada: falha no e-mail não vira erro para quem enviou.
    if (notificar) {
      try {
        await notificar(doc);
        log.log(`[DMC] bolsas: ${doc.protocolo} gravada; equipe notificada por e-mail.`);
      } catch (err) {
        log.error(`[DMC] bolsas: ${doc.protocolo} gravada, mas o e-mail de notificação falhou:`, resumirErro(err));
      }
    } else {
      log.log(`[DMC] bolsas: ${doc.protocolo} gravada; e-mail de notificação não configurado.`);
    }

    res.status(201).json({ ok: true, protocolo: doc.protocolo });
  });

  // ----- lista da equipe (requireAuth + requireAdmin injetados) -----
  router.get('/admin/pre-inscricoes', ...guardas, async (req, res) => {
    const q = req.query || {};
    const n = typeof q.pagina === 'string' && /^\d{1,6}$/.test(q.pagina) ? Number(q.pagina) : 1;
    const pagina = Math.max(1, n);
    let lista;
    try {
      lista = await listar({ pular: (pagina - 1) * POR_PAGINA, limite: POR_PAGINA });
    } catch (err) {
      log.error('[DMC] bolsas/admin: falha ao listar:', resumirErro(err));
      return res.status(503).json({ error: MENSAGENS.adminIndisponivel });
    }
    const total = Number(lista && lista.total) || 0;
    res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      pagina,
      porPagina: POR_PAGINA,
      total,
      totalPaginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
      rotulos: { perfis: PERFIS, areas: AREAS },
      itens: (lista && Array.isArray(lista.itens) ? lista.itens : []).map(paraAdmin)
    });
  });

  return router;
}
