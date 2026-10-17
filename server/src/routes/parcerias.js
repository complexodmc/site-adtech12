// =============================================================
// COMPLEXO DMC · /api/parcerias — candidaturas aos programas de parceria
//   POST  /api/parcerias/partner-lawyers     advogados e sociedades de advocacia
//   POST  /api/parcerias/business-partner    parceiros de negócios B2B
//   GET   /api/parcerias/admin/candidaturas?programa=&status=&pagina=
//   GET   /api/parcerias/admin/candidaturas/:protocolo
//   PATCH /api/parcerias/admin/candidaturas/:protocolo   { status?, nota?, responsavel? }
//
// A modalidade vem SEMPRE da rota, nunca de um campo do corpo.
// Mesmo desenho do /api/contato: parser próprio de 16 KB, honeypot
// `website`, throttle por IP (contadores próprios), validação pura e
// testável, e nunca responde sucesso sem gravar.
//
// Este módulo NÃO importa db.js, config.js nem auth.js: o server.js
// injeta o repositório, o notificador e o middleware de administrador.
// Assim os testes rodam sem MongoDB.
// =============================================================
import express, { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { criarThrottle } from '../throttle.js';

// ---------- programas ----------
export const PROGRAMAS = Object.freeze({
  'partner-lawyers': Object.freeze({ rotulo: 'Partner Lawyers', prefixo: 'PL' }),
  'business-partner': Object.freeze({ rotulo: 'Business Partner', prefixo: 'BP' })
});

export const UFS = Object.freeze([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]);

export const AREAS_PL = Object.freeze({
  'empresarial': 'Empresarial',
  'sucessoes-patrimonio': 'Sucessões e patrimônio',
  'imobiliario': 'Imobiliário',
  'tributario': 'Tributário',
  'trabalhista-empresarial': 'Trabalhista empresarial',
  'recuperacao-ativos': 'Recuperação de ativos',
  'outra': 'Outra'
});

export const SEGMENTOS_BP = Object.freeze({
  'consultoria-empresarial': 'Consultoria empresarial',
  'desenvolvimento-negocios': 'Desenvolvimento de negócios',
  'representacao-comercial-b2b': 'Representação comercial B2B',
  'mercado-imobiliario': 'Mercado imobiliário',
  'construcao-civil': 'Construção civil',
  'agronegocio': 'Agronegócio',
  'rede-empresarial': 'Rede empresarial',
  'outro': 'Outro'
});

export const EXPERIENCIAS_B2B = Object.freeze({
  'ate-2-anos': 'Até 2 anos',
  '2-a-5-anos': 'De 2 a 5 anos',
  '5-a-10-anos': 'De 5 a 10 anos',
  'mais-de-10-anos': 'Mais de 10 anos'
});

// ---------- funil (estados reais; só administrador altera) ----------
export const ESTADO_INICIAL = 'recebido';
export const ESTADO_ARQUIVADA = 'arquivada';

export const FUNIS = Object.freeze({
  'partner-lawyers': Object.freeze([
    'recebido', 'validacao-profissional', 'avaliacao-institucional', 'reuniao', 'decisao', 'formalizacao'
  ]),
  'business-partner': Object.freeze([
    'recebido', 'qualificacao', 'contato-comercial', 'reuniao', 'proposta-cooperacao', 'decisao'
  ])
});

export const ROTULOS_ESTADOS = Object.freeze({
  'recebido': 'Recebido',
  'validacao-profissional': 'Validação profissional',
  'avaliacao-institucional': 'Avaliação institucional',
  'qualificacao': 'Qualificação',
  'contato-comercial': 'Contato comercial',
  'reuniao': 'Reunião',
  'proposta-cooperacao': 'Proposta de cooperação',
  'decisao': 'Decisão',
  'formalizacao': 'Formalização',
  'arquivada': 'Arquivada'
});

/** Funil do programa + `arquivada` no fim (lista usada pela tela admin). */
export function estadosDoPrograma(programa) {
  const funil = FUNIS[programa];
  return funil ? [...funil, ESTADO_ARQUIVADA] : [];
}

// ---------- limites ----------
export const LIMITES = Object.freeze({
  nome: 120,
  email: 254,
  telefone: 30,
  escritorio: 150,
  empresa: 120,
  cargo: 80,
  cidade: 80,
  apresentacao: 2000,
  perfil_empresas: 1000,
  mensagem: 2000,
  pagina: 120,
  utm: 80,
  nota: 500,
  responsavel: 120
});
export const MINIMOS = Object.freeze({ nome: 2, cargo: 2, cidade: 2, apresentacao: 30, perfil_empresas: 10, nota: 5 });

export const CORPO_MAX = '16kb';
export const THROTTLE_PADRAO = Object.freeze({ janelaMs: 15 * 60 * 1000, max: 5 });
export const JANELA_DUPLICIDADE_MS = 24 * 60 * 60 * 1000;
export const RETENCAO_MESES = 24;
export const POR_PAGINA = 25;
export const UTM_CAMPOS = Object.freeze(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']);

const ERRO_TIPO = 'Formato inválido.';
const ACEITES = new Set(['true', 'on', '1', 'sim', 'yes']);
// Mesmo padrão do /api/contato.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------- normalização ----------
// Retorna string limpa, '' para ausente, ou null quando o tipo é inválido
// (objeto/array — barra tentativa de injetar operador ou estrutura).
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

function chave(valor) {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_/]+/g, '-');
}

function objeto(corpo) {
  return corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
}

// Checkbox: true só com valor afirmativo; null quando o tipo é inválido
// (objeto/array). Qualquer outra string ou número conta como "não".
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

// Grava só os dígitos (DDD + número; aceita 55 na frente).
function lerTelefone(valor, { vazio, invalido }) {
  const s = texto(valor);
  if (s === null) return { erro: ERRO_TIPO };
  if (!s) return { erro: vazio };
  const digitos = s.replace(/\D/g, '');
  if (s.length > LIMITES.telefone || digitos.length < 10 || digitos.length > 13) return { erro: invalido };
  return { valor: digitos };
}

function lerUf(valor, { vazio, invalido }) {
  const s = texto(valor);
  if (s === null) return { erro: ERRO_TIPO };
  if (!s) return { erro: vazio };
  const uf = s.toUpperCase();
  if (!UFS.includes(uf)) return { erro: invalido };
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

// Número de inscrição: só dígitos depois de tirar pontos, espaços e hífen.
function lerOab(valor) {
  const s = texto(valor);
  if (s === null) return { erro: ERRO_TIPO };
  if (!s) return { erro: 'Informe o número de inscrição na OAB.' };
  const n = s.replace(/[.\s-]/g, '');
  if (!/^\d{3,7}$/.test(n)) return { erro: 'Número da OAB inválido. Informe só os dígitos da inscrição (3 a 7).' };
  return { valor: n };
}

// Array (JSON) ou valores repetidos (checkbox em form urlencoded).
function lerAreas(valor) {
  if (valor === undefined || valor === null || valor === '') return { erro: 'Selecione ao menos uma área de atuação.' };
  const lista = Array.isArray(valor) ? valor : [valor];
  if (lista.length > 20) return { erro: ERRO_TIPO };
  const areas = [];
  for (const item of lista) {
    const s = texto(item);
    if (s === null) return { erro: ERRO_TIPO };
    if (!s) continue;
    const k = chave(s);
    if (!Object.hasOwn(AREAS_PL, k)) return { erro: 'Área de atuação inválida. Escolha opções da lista.' };
    if (!areas.includes(k)) areas.push(k);
  }
  if (!areas.length) return { erro: 'Selecione ao menos uma área de atuação.' };
  return { valor: areas };
}

function aplicar(resultado, campo, erros, dados) {
  if (resultado.erro) erros[campo] = resultado.erro;
  else if (resultado.valor !== undefined) dados[campo] = resultado.valor;
}

const regraNome = {
  obrigatorio: true, min: MINIMOS.nome, max: LIMITES.nome, letra: true,
  vazio: 'Informe seu nome.',
  curto: 'Informe seu nome completo.',
  longo: `Nome muito longo (máximo de ${LIMITES.nome} caracteres).`
};

const regraCidade = {
  obrigatorio: true, min: MINIMOS.cidade, max: LIMITES.cidade, letra: true,
  vazio: 'Informe a cidade.',
  curto: 'Cidade inválida.',
  longo: `Nome da cidade muito longo (máximo de ${LIMITES.cidade} caracteres).`
};

const regraUf = { vazio: 'Selecione a UF.', invalido: 'UF inválida. Escolha uma das opções da lista.' };

function camposPartnerLawyers(c, erros, dados) {
  aplicar(lerTexto(c.nome, regraNome), 'nome', erros, dados);
  aplicar(lerOab(c.oab_numero), 'oab_numero', erros, dados);
  aplicar(lerUf(c.oab_seccional, {
    vazio: 'Selecione a seccional da OAB.',
    invalido: 'Seccional inválida. Escolha uma UF da lista.'
  }), 'oab_seccional', erros, dados);
  aplicar(lerTexto(c.escritorio, {
    max: LIMITES.escritorio,
    longo: `Nome do escritório muito longo (máximo de ${LIMITES.escritorio} caracteres).`
  }), 'escritorio', erros, dados);
  aplicar(lerAreas(c.areas !== undefined ? c.areas : c['areas[]']), 'areas', erros, dados);
  aplicar(lerTexto(c.cidade, regraCidade), 'cidade', erros, dados);
  aplicar(lerUf(c.uf, regraUf), 'uf', erros, dados);
  aplicar(lerEmail(c.email), 'email', erros, dados);
  aplicar(lerTelefone(c.telefone, {
    vazio: 'Informe um telefone com DDD.',
    invalido: 'Telefone inválido. Informe DDD e número.'
  }), 'telefone', erros, dados);
  aplicar(lerTexto(c.apresentacao, {
    obrigatorio: true, min: MINIMOS.apresentacao, max: LIMITES.apresentacao, multilinha: true,
    vazio: 'Escreva uma breve apresentação profissional.',
    curto: `Apresentação muito curta (mínimo de ${MINIMOS.apresentacao} caracteres).`,
    longo: `Apresentação muito longa (máximo de ${LIMITES.apresentacao} caracteres).`
  }), 'apresentacao', erros, dados);
}

function camposBusinessPartner(c, erros, dados) {
  aplicar(lerTexto(c.nome, regraNome), 'nome', erros, dados);
  aplicar(lerTexto(c.empresa, {
    max: LIMITES.empresa,
    longo: `Nome da empresa muito longo (máximo de ${LIMITES.empresa} caracteres).`
  }), 'empresa', erros, dados);
  aplicar(lerTexto(c.cargo, {
    obrigatorio: true, min: MINIMOS.cargo, max: LIMITES.cargo, letra: true,
    vazio: 'Informe seu cargo ou função.',
    curto: 'Cargo inválido.',
    longo: `Cargo muito longo (máximo de ${LIMITES.cargo} caracteres).`
  }), 'cargo', erros, dados);
  aplicar(lerOpcao(c.segmento, SEGMENTOS_BP, {
    vazio: 'Selecione o segmento de atuação.',
    invalido: 'Segmento inválido. Escolha uma das opções da lista.'
  }), 'segmento', erros, dados);
  aplicar(lerTexto(c.cidade, regraCidade), 'cidade', erros, dados);
  aplicar(lerUf(c.uf, regraUf), 'uf', erros, dados);
  aplicar(lerEmail(c.email), 'email', erros, dados);
  aplicar(lerTelefone(c.whatsapp, {
    vazio: 'Informe um WhatsApp com DDD.',
    invalido: 'WhatsApp inválido. Informe DDD e número.'
  }), 'whatsapp', erros, dados);
  aplicar(lerOpcao(c.experiencia_b2b, EXPERIENCIAS_B2B, {
    vazio: 'Selecione o tempo de experiência em relacionamento B2B.',
    invalido: 'Experiência inválida. Escolha uma das opções da lista.'
  }), 'experiencia_b2b', erros, dados);
  aplicar(lerTexto(c.perfil_empresas, {
    obrigatorio: true, min: MINIMOS.perfil_empresas, max: LIMITES.perfil_empresas, multilinha: true,
    vazio: 'Descreva o perfil das empresas com que você se relaciona (setores e porte).',
    curto: `Descrição muito curta (mínimo de ${MINIMOS.perfil_empresas} caracteres).`,
    longo: `Descrição muito longa (máximo de ${LIMITES.perfil_empresas} caracteres).`
  }), 'perfil_empresas', erros, dados);
  aplicar(lerTexto(c.mensagem, {
    max: LIMITES.mensagem, multilinha: true,
    longo: `Mensagem muito longa (máximo de ${LIMITES.mensagem} caracteres).`
  }), 'mensagem', erros, dados);
}

// `pagina` e utm_*: não são campos do usuário — só limpa e corta.
// A página perde query e fragmento (podem carregar dado pessoal).
function lerFonte(c, erros) {
  const fonte = {};
  const pagina = texto(c.pagina);
  if (pagina === null) erros.pagina = ERRO_TIPO;
  else fonte.pagina = (pagina.split(/[?#]/)[0].trim() || 'nao-informada').slice(0, LIMITES.pagina);
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
// campos conhecidos e validados; qualquer outra chave do corpo (inclusive
// `programa`) é ignorada.
export function validarCandidatura(programa, corpo) {
  if (!Object.hasOwn(PROGRAMAS, programa)) throw new Error(`validarCandidatura: programa desconhecido "${programa}".`);
  const c = objeto(corpo);
  const erros = {};
  const dados = {};

  if (programa === 'partner-lawyers') camposPartnerLawyers(c, erros, dados);
  else camposBusinessPartner(c, erros, dados);

  // Consentimento LGPD (obrigatório) e opt-in de comunicações (opcional, separado).
  const consentimento = lerAceite(c.consentimento);
  if (consentimento === null) erros.consentimento = ERRO_TIPO;
  else if (!consentimento) {
    erros.consentimento = 'Para avaliarmos sua candidatura, é preciso autorizar o tratamento dos seus dados (LGPD).';
  }
  const comunicacoes = lerAceite(c.comunicacoes);
  if (comunicacoes === null) erros.comunicacoes = ERRO_TIPO;

  const fonte = lerFonte(c, erros);

  return { ok: Object.keys(erros).length === 0, erros, dados, fonte, comunicacoes: comunicacoes === true };
}

export const validarPartnerLawyers = (corpo) => validarCandidatura('partner-lawyers', corpo);
export const validarBusinessPartner = (corpo) => validarCandidatura('business-partner', corpo);

// Campo isca: invisível para pessoas, preenchido por robôs.
export function ehRobo(corpo) {
  const v = corpo && typeof corpo === 'object' ? corpo.website : undefined;
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

// ---------- protocolo ----------
// 32 símbolos, sem os ambíguos 0, 1, I e O. 256 é múltiplo de 32, então
// `byte & 31` é uniforme.
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const PROTOCOLO_RE = /^(PL|BP)-\d{4}-[2-9A-HJ-NP-Z]{6}$/;
const anoSP = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' });

export function gerarProtocolo(programa, momento = new Date(), bytes = randomBytes) {
  const { prefixo } = PROGRAMAS[programa];
  let sufixo = '';
  for (const b of bytes(6)) sufixo += ALFABETO[b & 31];
  return `${prefixo}-${anoSP.format(momento)}-${sufixo}`;
}

// ---------- documento ----------
function somarMeses(data, meses) {
  const d = new Date(data.getTime());
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d;
}

/**
 * Documento de `parcerias_candidaturas`. `email` fica também na raiz: é a
 * chave da checagem de duplicidade (índice email+programa+createdAt).
 * Não há IP, user-agent nem referrer — de propósito.
 */
export function montarCandidatura({ programa, dados, fonte, comunicacoes, momento, protocolo }) {
  return {
    protocolo,
    programa,
    email: dados.email,
    dados,
    fonte,
    status: ESTADO_INICIAL,
    historico: [{ status: ESTADO_INICIAL, em: momento, por: 'sistema' }],
    responsavel: null,
    consentimento: { aceito: true, em: momento, finalidade: `avaliacao-candidatura-${programa}` },
    comunicacoes: { aceito: Boolean(comunicacoes), em: comunicacoes ? momento : null },
    // Informativo: a política de retenção depende do CEO. Sem índice TTL.
    retencaoAte: somarMeses(momento, RETENCAO_MESES),
    createdAt: momento,
    updatedAt: momento
  };
}

/** Mesma regra da consulta do repositório: mesmo e-mail + programa, < 24 h, não arquivada. */
export function ehDuplicada(doc, programa, momento) {
  if (!doc || doc.programa !== programa || doc.status === ESTADO_ARQUIVADA) return false;
  const criado = doc.createdAt instanceof Date ? doc.createdAt.getTime() : NaN;
  return criado >= momento.getTime() - JANELA_DUPLICIDADE_MS;
}

// ---------- funil: transições ----------
/**
 * Estado em que a candidatura estava antes de ser arquivada: o último
 * registro do histórico anterior ao bloco final de registros `arquivada`
 * (a transição em si e eventuais notas posteriores).
 */
export function estadoAnteriorAoArquivamento(historico) {
  const h = Array.isArray(historico) ? historico : [];
  let i = h.length - 1;
  while (i >= 0 && h[i] && h[i].status === ESTADO_ARQUIVADA) i--;
  return i >= 0 && h[i] ? h[i].status : null;
}

/** Destinos válidos a partir de `atual`: próximo, anterior e arquivar — ou só reabrir. */
export function transicoesPermitidas(programa, atual, historico) {
  const funil = FUNIS[programa];
  if (!funil) return [];
  if (atual === ESTADO_ARQUIVADA) {
    const anterior = estadoAnteriorAoArquivamento(historico);
    return anterior && funil.includes(anterior) ? [anterior] : [];
  }
  const i = funil.indexOf(atual);
  if (i === -1) return [];
  const destinos = [];
  if (i + 1 < funil.length) destinos.push(funil[i + 1]);
  if (i > 0) destinos.push(funil[i - 1]);
  destinos.push(ESTADO_ARQUIVADA);
  return destinos;
}

const rotulo = (estado) => ROTULOS_ESTADOS[estado] || estado;

/**
 * Valida a mudança de `atual` para `novo`. Devolve { ok:true } ou
 * { ok:false, http:400|409, erro, campos? }.
 */
export function validarTransicao({ programa, atual, novo, nota, historico }) {
  if (!estadosDoPrograma(programa).includes(novo)) {
    return { ok: false, http: 400, erro: 'Revise os campos indicados.', campos: { status: 'Status inválido para este programa.' } };
  }
  if (novo === atual) {
    return { ok: false, http: 409, erro: `A candidatura já está em "${rotulo(atual)}".` };
  }
  if (novo === ESTADO_ARQUIVADA && !nota) {
    return {
      ok: false, http: 400, erro: 'Revise os campos indicados.',
      campos: { nota: `Para arquivar, registre o motivo na nota (${MINIMOS.nota} a ${LIMITES.nota} caracteres).` }
    };
  }
  const permitidos = transicoesPermitidas(programa, atual, historico);
  if (!permitidos.includes(novo)) {
    if (atual === ESTADO_ARQUIVADA) {
      const anterior = permitidos[0];
      return {
        ok: false, http: 409,
        erro: anterior
          ? `Candidatura arquivada só pode ser reaberta no estado anterior ao arquivamento ("${rotulo(anterior)}").`
          : 'Não foi possível identificar o estado anterior ao arquivamento no histórico.'
      };
    }
    const opcoes = permitidos.map(e => `"${rotulo(e)}"`).join(', ');
    return {
      ok: false, http: 409,
      erro: `Transição inválida: de "${rotulo(atual)}" não é possível ir para "${rotulo(novo)}". ` +
        `O funil avança ou volta um passo por vez. Opções agora: ${opcoes}.`
    };
  }
  return { ok: true };
}

/** Corpo do PATCH admin: { status?, nota?, responsavel? }. */
export function validarAtualizacao(corpo) {
  const c = objeto(corpo);
  const erros = {};
  const dados = {};

  if (c.status !== undefined && c.status !== null) {
    const s = texto(c.status);
    if (s === null) erros.status = ERRO_TIPO;
    else if (s) dados.status = chave(s);
  }

  if (c.nota !== undefined && c.nota !== null) {
    const r = lerTexto(c.nota, {
      min: MINIMOS.nota, max: LIMITES.nota, multilinha: true,
      curto: `Nota muito curta (mínimo de ${MINIMOS.nota} caracteres).`,
      longo: `Nota muito longa (máximo de ${LIMITES.nota} caracteres).`
    });
    aplicar(r, 'nota', erros, dados);
  }

  if (Object.hasOwn(c, 'responsavel')) {
    if (c.responsavel === null) dados.responsavel = null;
    else {
      const r = texto(c.responsavel);
      if (r === null) erros.responsavel = ERRO_TIPO;
      else if (r.length > LIMITES.responsavel) erros.responsavel = `Responsável muito longo (máximo de ${LIMITES.responsavel} caracteres).`;
      else dados.responsavel = r || null;
    }
  }

  const ok = Object.keys(erros).length === 0;
  return { ok, erros, dados, vazio: ok && Object.keys(dados).length === 0 };
}

// ---------- corpo da requisição ----------
// Parser próprio, com teto pequeno. O server.js monta isto ANTES do
// express.json global (1 MB): o corpo já chega consumido e o global
// apenas segue adiante. `extended: false` transforma checkboxes
// repetidos (areas=a&areas=b) em array.
export function corpoParcerias() {
  return [
    express.json({ limit: CORPO_MAX }),
    express.urlencoded({ extended: false, limit: CORPO_MAX }),
    (err, _req, res, next) => {
      if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Conteúdo grande demais. Reduza os textos e tente de novo.' });
      }
      if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
        return res.status(400).json({ error: 'Não foi possível ler os dados enviados.' });
      }
      next(err);
    }
  ];
}

// ---------- notificação por e-mail (Resend, via fetch — sem dependência) ----------
// Sem chave ou destinatário devolve null: a candidatura só é gravada e logada.
export function criarNotificadorParcerias({ resendApiKey, para, de, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  if (!resendApiKey || !para) return null;
  const destinatarios = String(para).split(',').map(s => s.trim()).filter(Boolean);
  if (!destinatarios.length) return null;
  const remetente = de || 'Site Complexo DMC <onboarding@resend.dev>';

  return async function notificar(candidatura) {
    const resp = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remetente,
        to: destinatarios,
        reply_to: candidatura.dados.email,
        subject: assuntoEmailCandidatura(candidatura),
        text: corpoEmailCandidatura(candidatura)
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!resp.ok) throw new Error(`Resend respondeu HTTP ${resp.status}`);
    return { enviado: true };
  };
}

export function assuntoEmailCandidatura(c) {
  const programa = PROGRAMAS[c.programa] ? PROGRAMAS[c.programa].rotulo : c.programa;
  return `[${programa}] Nova candidatura — ${c.dados.nome}`.replace(/[\r\n]+/g, ' ').slice(0, 180);
}

export function corpoEmailCandidatura(c) {
  const d = c.dados;
  const linhas = [
    `Programa: ${PROGRAMAS[c.programa] ? PROGRAMAS[c.programa].rotulo : c.programa}`,
    `Protocolo: ${c.protocolo}`,
    `Nome: ${d.nome}`
  ];
  if (c.programa === 'partner-lawyers') {
    linhas.push(
      `OAB: ${d.oab_numero}/${d.oab_seccional}`,
      `Escritório: ${d.escritorio || '—'}`,
      `Áreas: ${(d.areas || []).map(a => AREAS_PL[a] || a).join(', ')}`
    );
  } else {
    linhas.push(
      `Empresa: ${d.empresa || '—'}`,
      `Cargo: ${d.cargo}`,
      `Segmento: ${SEGMENTOS_BP[d.segmento] || d.segmento}`,
      `Experiência B2B: ${EXPERIENCIAS_B2B[d.experiencia_b2b] || d.experiencia_b2b}`
    );
  }
  linhas.push(
    `Cidade/UF: ${d.cidade}/${d.uf}`,
    `E-mail: ${d.email}`,
    c.programa === 'partner-lawyers' ? `Telefone: ${d.telefone}` : `WhatsApp: ${d.whatsapp}`,
    `Aceita comunicações institucionais: ${c.comunicacoes && c.comunicacoes.aceito ? 'sim' : 'não'}`,
    `Página: ${c.fonte && c.fonte.pagina ? c.fonte.pagina : '—'}`,
    `Recebido em: ${c.createdAt.toISOString()}`,
    ''
  );
  if (c.programa === 'partner-lawyers') {
    linhas.push('Apresentação:', d.apresentacao);
  } else {
    linhas.push('Perfil das empresas:', d.perfil_empresas, '', 'Mensagem:', d.mensagem || '—');
  }
  return linhas.join('\n');
}

// ---------- repositório MongoDB ----------
// Recebe uma função que devolve a coleção (col.parcerias), chamada só na
// hora do uso — a conexão é aberta depois que o módulo é montado.
const PROJECAO_LISTA = Object.freeze({ 'dados.apresentacao': 0, 'dados.perfil_empresas': 0, 'dados.mensagem': 0, historico: 0 });

export function criarRepositorioParcerias(colecao) {
  return {
    buscarDuplicada: ({ email, programa, desde }) => colecao().findOne(
      { email, programa, createdAt: { $gte: desde }, status: { $ne: ESTADO_ARQUIVADA } },
      { sort: { createdAt: -1 }, projection: { protocolo: 1, programa: 1, status: 1, createdAt: 1 } }
    ),
    salvar: (doc) => colecao().insertOne(doc),
    async listar({ programa, status, pular, limite }) {
      const filtro = { programa };
      if (status) filtro.status = status;
      const [itens, total] = await Promise.all([
        colecao().find(filtro, { projection: PROJECAO_LISTA }).sort({ createdAt: -1 }).skip(pular).limit(limite).toArray(),
        colecao().countDocuments(filtro)
      ]);
      return { itens, total };
    },
    buscarPorProtocolo: (protocolo) => colecao().findOne({ protocolo }),
    // Atualiza só se o status ainda for o lido (concorrência otimista entre administradores).
    atualizarSeStatus: (protocolo, statusAtual, update) => colecao().findOneAndUpdate(
      { protocolo, status: statusAtual }, update, { returnDocument: 'after' }
    )
  };
}

// ---------- formato entregue ao painel ----------
function paraAdmin(doc) {
  const { _id, ...resto } = doc;
  return { id: _id !== undefined ? String(_id) : undefined, ...resto };
}

function resumoAdmin(doc) {
  const { historico: _h, dados = {}, ...resto } = paraAdmin(doc);
  const { apresentacao: _a, perfil_empresas: _p, mensagem: _m, ...dadosCurtos } = dados;
  return { ...resto, dados: dadosCurtos };
}

function quemAlterou(user) {
  if (user && user.email) return String(user.email);
  if (user && user._id !== undefined) return String(user._id);
  return 'admin';
}

// ---------- rotas ----------
export function criarRotaParcerias({
  salvar,
  buscarDuplicada,
  listar,
  buscarPorProtocolo,
  atualizarSeStatus,
  exigirAdmin,
  notificar = null,
  throttle = criarThrottle({
    ...THROTTLE_PADRAO,
    mensagem: 'Muitos envios em sequência. Aguarde alguns minutos e tente de novo.'
  }),
  gerar = gerarProtocolo,
  agora = () => new Date(),
  log = console
}) {
  for (const [nome, fn] of Object.entries({ salvar, buscarDuplicada, listar, buscarPorProtocolo, atualizarSeStatus })) {
    if (typeof fn !== 'function') throw new Error(`criarRotaParcerias: informe ${nome}().`);
  }
  const guardas = [].concat(exigirAdmin || []);
  if (!guardas.length || guardas.some(g => typeof g !== 'function')) {
    throw new Error('criarRotaParcerias: informe exigirAdmin (middleware de administrador).');
  }

  const router = Router();

  // ----- candidatura pública: um handler por programa, fixado pela rota -----
  function receber(programa) {
    const { rotulo: nomePrograma } = PROGRAMAS[programa];

    return async (req, res) => {
      const corpo = req.body;

      if (ehRobo(corpo)) {
        log.warn(`[DMC] parcerias/${programa}: honeypot preenchido — envio descartado sem gravar.`);
        return res.status(200).json({ ok: true });
      }

      const { ok, erros, dados, fonte, comunicacoes } = validarCandidatura(programa, corpo);
      if (!ok) {
        return res.status(400).json({ error: 'Revise os campos indicados.', campos: erros });
      }

      const momento = agora();

      // Duplicidade: findOne antes do insert. Corrida residual: dois envios
      // simultâneos do mesmo e-mail podem passar ambos pela consulta — a
      // janela de 24 h não cabe num índice único; o throttle por IP limita.
      let existente;
      try {
        existente = await buscarDuplicada({
          email: dados.email,
          programa,
          desde: new Date(momento.getTime() - JANELA_DUPLICIDADE_MS)
        });
      } catch (err) {
        log.error(`[DMC] parcerias/${programa}: falha ao consultar duplicidade:`, err && err.message);
        return res.status(503).json({ error: 'Não foi possível registrar sua candidatura agora. Tente novamente em instantes.' });
      }
      if (ehDuplicada(existente, programa, momento)) {
        log.log(`[DMC] parcerias/${programa}: envio repetido em 24 h — mantida a candidatura ${existente.protocolo}.`);
        return res.status(200).json({ ok: true, duplicada: true, protocolo: existente.protocolo, programa });
      }

      let candidatura;
      let id;
      try {
        // Protocolo tem índice único: em colisão (raríssima), sorteia de novo.
        for (let tentativa = 1; ; tentativa++) {
          candidatura = montarCandidatura({
            programa, dados, fonte, comunicacoes, momento, protocolo: gerar(programa, momento)
          });
          try {
            const r = await salvar(candidatura);
            id = r && r.insertedId !== undefined ? String(r.insertedId) : undefined;
            break;
          } catch (err) {
            const colisao = err && err.code === 11000 && /protocolo/.test(String(err.message || ''));
            if (!colisao || tentativa >= 3) throw err;
          }
        }
      } catch (err) {
        log.error(`[DMC] parcerias/${programa}: falha ao gravar candidatura:`, err && err.message);
        return res.status(503).json({ error: 'Não foi possível registrar sua candidatura agora. Tente novamente em instantes.' });
      }

      // Já está gravada: falha no e-mail não vira erro para quem enviou.
      if (notificar) {
        try {
          await notificar(candidatura);
          log.log(`[DMC] parcerias/${programa}: ${candidatura.protocolo} gravada; equipe notificada por e-mail.`);
        } catch (err) {
          log.error(`[DMC] parcerias/${programa}: ${candidatura.protocolo} gravada, mas o e-mail de notificação falhou:`, err && err.message);
        }
      } else {
        log.log(`[DMC] parcerias/${programa}: ${candidatura.protocolo} gravada (${nomePrograma}); e-mail de notificação não configurado.`);
      }

      res.status(201).json({ ok: true, id, protocolo: candidatura.protocolo, programa });
    };
  }

  router.post('/partner-lawyers', throttle, receber('partner-lawyers'));
  router.post('/business-partner', throttle, receber('business-partner'));

  // ----- painel administrativo -----
  const erroBanco = (res, err, acao) => {
    log.error(`[DMC] parcerias/admin: falha ao ${acao}:`, err && err.message);
    return res.status(503).json({ error: 'Não foi possível acessar as candidaturas agora. Tente novamente em instantes.' });
  };

  const lerProtocolo = (v) => {
    const p = typeof v === 'string' ? v.trim().toUpperCase() : '';
    return PROTOCOLO_RE.test(p) ? p : null;
  };

  router.get('/admin/candidaturas', ...guardas, async (req, res) => {
    const q = req.query || {};
    const programa = typeof q.programa === 'string' ? q.programa.trim() : '';
    if (!Object.hasOwn(PROGRAMAS, programa)) {
      return res.status(400).json({
        error: 'Revise os campos indicados.',
        campos: { programa: 'Informe o programa: partner-lawyers ou business-partner.' }
      });
    }
    const estados = estadosDoPrograma(programa);
    let status = null;
    if (q.status !== undefined && q.status !== '') {
      status = typeof q.status === 'string' ? chave(q.status.trim()) : '';
      if (!estados.includes(status)) {
        return res.status(400).json({ error: 'Revise os campos indicados.', campos: { status: 'Status inválido para este programa.' } });
      }
    }
    const n = typeof q.pagina === 'string' && /^\d{1,6}$/.test(q.pagina) ? Number(q.pagina) : 1;
    const pagina = Math.max(1, n);

    try {
      const { itens, total } = await listar({ programa, status, pular: (pagina - 1) * POR_PAGINA, limite: POR_PAGINA });
      res.json({
        ok: true,
        programa,
        status,
        pagina,
        porPagina: POR_PAGINA,
        total,
        totalPaginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
        estados,
        rotulos: Object.fromEntries(estados.map(e => [e, rotulo(e)])),
        itens: itens.map(resumoAdmin)
      });
    } catch (err) {
      return erroBanco(res, err, 'listar');
    }
  });

  router.get('/admin/candidaturas/:protocolo', ...guardas, async (req, res) => {
    const protocolo = lerProtocolo(req.params.protocolo);
    if (!protocolo) return res.status(404).json({ error: 'Candidatura não encontrada.' });
    let doc;
    try {
      doc = await buscarPorProtocolo(protocolo);
    } catch (err) {
      return erroBanco(res, err, 'consultar');
    }
    if (!doc) return res.status(404).json({ error: 'Candidatura não encontrada.' });
    res.json({
      ok: true,
      candidatura: paraAdmin(doc),
      estados: estadosDoPrograma(doc.programa),
      permitidos: transicoesPermitidas(doc.programa, doc.status, doc.historico)
    });
  });

  router.patch('/admin/candidaturas/:protocolo', ...guardas, async (req, res) => {
    const protocolo = lerProtocolo(req.params.protocolo);
    if (!protocolo) return res.status(404).json({ error: 'Candidatura não encontrada.' });

    const v = validarAtualizacao(req.body);
    if (!v.ok) return res.status(400).json({ error: 'Revise os campos indicados.', campos: v.erros });
    if (v.vazio) return res.status(400).json({ error: 'Nada para atualizar. Envie status, nota ou responsavel.' });

    let doc;
    try {
      doc = await buscarPorProtocolo(protocolo);
    } catch (err) {
      return erroBanco(res, err, 'consultar');
    }
    if (!doc) return res.status(404).json({ error: 'Candidatura não encontrada.' });

    const { status: novo, nota } = v.dados;
    const mudaResponsavel = Object.hasOwn(v.dados, 'responsavel');
    // Status igual ao atual junto de nota/responsável é só "sem mudança de estado".
    const mudaStatus = novo !== undefined && (novo !== doc.status || (nota === undefined && !mudaResponsavel));

    const momento = agora();
    const entrada = { status: doc.status, em: momento, por: quemAlterou(req.user) };
    const set = { updatedAt: momento };

    if (mudaStatus) {
      const t = validarTransicao({ programa: doc.programa, atual: doc.status, novo, nota, historico: doc.historico });
      if (!t.ok) {
        return res.status(t.http).json(t.campos ? { error: t.erro, campos: t.campos } : { error: t.erro });
      }
      set.status = novo;
      entrada.status = novo;
      entrada.de = doc.status;
    }
    if (nota !== undefined) entrada.nota = nota;
    if (mudaResponsavel) {
      set.responsavel = v.dados.responsavel;
      entrada.responsavel = v.dados.responsavel;
    }

    let atualizado;
    try {
      atualizado = await atualizarSeStatus(protocolo, doc.status, { $set: set, $push: { historico: entrada } });
    } catch (err) {
      return erroBanco(res, err, 'atualizar');
    }
    if (!atualizado) {
      return res.status(409).json({ error: 'A candidatura foi alterada por outra pessoa enquanto você editava. Recarregue e tente de novo.' });
    }
    log.log(`[DMC] parcerias/admin: ${protocolo} ${entrada.de ? `${entrada.de} → ${entrada.status}` : 'atualizada'} por ${entrada.por}.`);
    res.json({
      ok: true,
      candidatura: paraAdmin(atualizado),
      estados: estadosDoPrograma(atualizado.programa),
      permitidos: transicoesPermitidas(atualizado.programa, atualizado.status, atualizado.historico)
    });
  });

  return router;
}
