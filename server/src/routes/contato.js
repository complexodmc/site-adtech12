// =============================================================
// COMPLEXO DMC · POST /api/contato — formulários do site institucional
// Recebe o lead, valida no servidor, descarta robô (honeypot), grava
// em `leads` e, se houver credencial, avisa a equipe por e-mail.
//
// Este módulo NÃO importa db.js nem config.js: o server.js injeta
// `salvar` e `notificar`. Assim os testes rodam sem MongoDB.
// =============================================================
import express, { Router } from 'express';
import { criarThrottle } from '../throttle.js';

export const PERFIS = Object.freeze({
  'empresario': 'Empresário(a)',
  'incorporadora-construtora': 'Incorporadora / construtora',
  'familia-empresaria': 'Família empresária',
  'produtor-rural': 'Produtor rural',
  'investidor': 'Investidor(a)',
  'outro': 'Outro'
});

export const EIXOS = Object.freeze({
  'E1': 'Planejamento Patrimonial e Sucessório',
  'E2': 'Tributário, Fiscal e Corporativo',
  'E3': 'Direito Notarial e Imobiliário',
  'E4': 'Auditoria Empresarial e Contábil',
  'E5': 'Recuperação de Ativos',
  'E6': 'Consultoria Trabalhista',
  'nao-sei': 'Ainda não sei'
});

// Verticais de Negócio (/verticais-de-negocio/**): o formulário qualifica
// pelo segmento, pelo porte e pelo evento. Listas = tools/verticais/dados.mjs.
export const SEGMENTOS = Object.freeze({
  'familias-empresarias-holdings': { nome: 'Famílias Empresárias, Holdings e Grandes Patrimônios', eixo: 'E1', perfil: 'familia-empresaria' },
  'agronegocio-patrimonio-rural': { nome: 'Agronegócio e Patrimônio Rural', eixo: 'E1', perfil: 'produtor-rural' },
  'incorporacao-construcao-imobiliario': { nome: 'Incorporação, Construção Civil e Mercado Imobiliário', eixo: 'E3', perfil: 'incorporadora-construtora' },
  'cartorios-servicos-registrais': { nome: 'Cartórios e Serviços Notariais e Registrais', eixo: 'E3', perfil: 'outro' },
  'infraestrutura-saneamento-energia': { nome: 'Infraestrutura, Saneamento e Energia', eixo: 'E3', perfil: 'empresario' },
  'industria-comercio-distribuicao': { nome: 'Indústria, Comércio e Distribuição', eixo: 'E2', perfil: 'empresario' },
  'saude-profissionais-liberais': { nome: 'Saúde e Profissionais Liberais de Alta Renda', eixo: 'E4', perfil: 'empresario' },
  'educacao-terceiro-setor': { nome: 'Educação e Terceiro Setor', eixo: 'E4', perfil: 'outro' },
  'credito-garantias-instituicoes-financeiras': { nome: 'Crédito, Garantias e Instituições Financeiras', eixo: 'E5', perfil: 'investidor' },
  'outro': { nome: 'Outro segmento', eixo: 'nao-sei', perfil: 'outro' }
});
export const FATURAMENTOS = Object.freeze({
  'ate-5mi': 'Até R$ 5 mi', '5-20mi': 'R$ 5–20 mi', '20-50mi': 'R$ 20–50 mi', '50-300mi': 'R$ 50–300 mi',
  'acima-300mi': 'Acima de R$ 300 mi', 'pessoa-fisica': 'Pessoa física / família'
});
export const PATRIMONIOS = Object.freeze({
  'ate-10mi': 'Até R$ 10 mi', '10-50mi': 'R$ 10–50 mi', '50-200mi': 'R$ 50–200 mi', 'acima-200mi': 'Acima de R$ 200 mi',
  'nao-informar': 'Prefiro não informar'
});
export const MOTIVOS = Object.freeze({
  'sucessao-inventario': 'Sucessão ou inventário', 'planejamento-patrimonial': 'Planejamento patrimonial',
  'fiscalizacao-passivo': 'Fiscalização ou passivo tributário', 'regularizacao-imovel': 'Regularização de imóvel ou estoque',
  'bloqueio-recuperacao': 'Bloqueio judicial ou recuperação de ativos', 'auditoria-contas': 'Auditoria ou prestação de contas',
  'trabalhista': 'Questão trabalhista', 'tecnologia-cartorio': 'Tecnologia para cartório', 'outro': 'Outro'
});

export const LIMITES = Object.freeze({
  nome: 120,
  email: 254,
  telefone: 30,
  empresa: 120,
  mensagem: 4000,
  curso: 150,
  origem: 120
});

export const MENSAGEM_MIN = 10;
export const CORPO_MAX = '16kb';
export const THROTTLE_PADRAO = Object.freeze({ janelaMs: 15 * 60 * 1000, max: 5 });

const ERRO_TIPO = 'Formato inválido.';
const ACEITES = new Set(['true', 'on', '1', 'sim', 'yes']);

// ---------- normalização ----------
// Retorna string limpa, '' para ausente, ou null quando o tipo é inválido
// (objeto/array — barra tentativa de injetar operador ou estrutura).
// Exportada para os outros formulários do site (newsletter) usarem a MESMA regra.
export function texto(valor, { multilinha = false } = {}) {
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

function normalizarEixo(valor) {
  if (/^e[1-6]$/i.test(valor)) return valor.toUpperCase();
  return chave(valor);
}

export function aceitou(valor) {
  if (valor === true || valor === 1) return true;
  return typeof valor === 'string' && ACEITES.has(valor.trim().toLowerCase());
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------- validação (pura) ----------
// Regras:
//   nome, email, perfil, consentimento — sempre obrigatórios
//   eixo e mensagem — obrigatórios, exceto quando `curso` vem preenchido
//   (cadastro de interesse em treinamento)
//   telefone, empresa, curso, origem — opcionais
//   segmento, faturamento, patrimonio, motivo — opcionais (Verticais de
//   Negócio); com `segmento` válido, perfil e eixo são derivados dele
//   quando não vêm, e a mensagem passa a ser opcional (vai um resumo).
export function validarContato(corpo) {
  const c = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
  const erros = {};
  const dados = {};

  // nome
  const nome = texto(c.nome);
  if (nome === null) erros.nome = ERRO_TIPO;
  else if (!nome) erros.nome = 'Informe seu nome.';
  else if (nome.length < 2 || !/\p{L}/u.test(nome)) erros.nome = 'Informe seu nome completo.';
  else if (nome.length > LIMITES.nome) erros.nome = `Nome muito longo (máximo de ${LIMITES.nome} caracteres).`;
  else dados.nome = nome;

  // email
  const email = texto(c.email);
  if (email === null) erros.email = ERRO_TIPO;
  else if (!email) erros.email = 'Informe seu e-mail.';
  else if (email.length > LIMITES.email || !EMAIL_RE.test(email)) erros.email = 'E-mail inválido. Confira o endereço digitado.';
  else dados.email = email.toLowerCase();

  // telefone (opcional)
  const telefone = texto(c.telefone);
  if (telefone === null) erros.telefone = ERRO_TIPO;
  else if (telefone) {
    const digitos = telefone.replace(/\D/g, '');
    if (telefone.length > LIMITES.telefone || digitos.length < 10 || digitos.length > 13) {
      erros.telefone = 'Telefone inválido. Informe DDD e número.';
    } else {
      dados.telefone = telefone;
    }
  }

  // empresa (opcional)
  const empresa = texto(c.empresa);
  if (empresa === null) erros.empresa = ERRO_TIPO;
  else if (empresa.length > LIMITES.empresa) erros.empresa = `Nome da empresa muito longo (máximo de ${LIMITES.empresa} caracteres).`;
  else if (empresa) dados.empresa = empresa;

  // curso (opcional) — define se é contato geral ou interesse em treinamento
  const curso = texto(c.curso);
  if (curso === null) erros.curso = ERRO_TIPO;
  else if (curso.length > LIMITES.curso) erros.curso = `Nome do curso muito longo (máximo de ${LIMITES.curso} caracteres).`;
  else if (curso) dados.curso = curso;
  const interesseEmCurso = Boolean(dados.curso);

  // segmento (opcional) — Verticais de Negócio
  const segmento = texto(c.segmento);
  if (segmento === null) erros.segmento = ERRO_TIPO;
  else if (segmento && !Object.hasOwn(SEGMENTOS, chave(segmento))) erros.segmento = 'Segmento inválido. Escolha uma das opções da lista.';
  else if (segmento) dados.segmento = chave(segmento);
  const vertical = dados.segmento ? SEGMENTOS[dados.segmento] : null;

  // faturamento, patrimonio, motivo (opcionais; só valores das listas)
  const lista = (nome, tabela, rotulo) => {
    const v = texto(c[nome]);
    if (v === null) erros[nome] = ERRO_TIPO;
    else if (v && !Object.hasOwn(tabela, chave(v))) erros[nome] = `${rotulo} inválido. Escolha uma das opções da lista.`;
    else if (v) dados[nome] = chave(v);
  };
  lista('faturamento', FATURAMENTOS, 'Faturamento');
  lista('patrimonio', PATRIMONIOS, 'Patrimônio');
  lista('motivo', MOTIVOS, 'Motivo');

  // perfil (derivado do segmento quando não vem)
  const perfil = texto(c.perfil) || (vertical ? vertical.perfil : '');
  if (perfil === null) erros.perfil = ERRO_TIPO;
  else if (!perfil) erros.perfil = 'Selecione o seu perfil.';
  else if (!Object.hasOwn(PERFIS, chave(perfil))) erros.perfil = 'Perfil inválido. Escolha uma das opções da lista.';
  else dados.perfil = chave(perfil);

  // eixo (derivado do segmento quando não vem)
  const eixo = texto(c.eixo) || (vertical ? vertical.eixo : '');
  if (eixo === null) erros.eixo = ERRO_TIPO;
  else if (!eixo) {
    if (!interesseEmCurso) erros.eixo = 'Selecione o assunto do contato (ou "Ainda não sei").';
  } else if (!Object.hasOwn(EIXOS, normalizarEixo(eixo))) {
    erros.eixo = 'Assunto inválido. Escolha uma das opções da lista.';
  } else {
    dados.eixo = normalizarEixo(eixo);
  }

  // mensagem
  const mensagem = texto(c.mensagem, { multilinha: true });
  if (mensagem === null) erros.mensagem = ERRO_TIPO;
  else if (!mensagem) {
    if (!interesseEmCurso && !vertical) erros.mensagem = 'Escreva sua mensagem.';
  } else if (mensagem.length < MENSAGEM_MIN) {
    erros.mensagem = `Mensagem muito curta (mínimo de ${MENSAGEM_MIN} caracteres).`;
  } else if (mensagem.length > LIMITES.mensagem) {
    erros.mensagem = `Mensagem muito longa (máximo de ${LIMITES.mensagem} caracteres).`;
  } else {
    dados.mensagem = mensagem;
  }

  // consentimento LGPD
  if (!aceitou(c.consentimento)) {
    erros.consentimento = 'Para enviarmos uma resposta, é preciso autorizar o uso dos seus dados (LGPD).';
  }

  // origem (página) — não é campo do usuário: só limpa e corta
  const origem = texto(c.origem);
  dados.origem = (origem || 'nao-informada').slice(0, LIMITES.origem);

  return { ok: Object.keys(erros).length === 0, erros, dados };
}

// Campo isca: invisível para pessoas, preenchido por robôs.
export function ehRobo(corpo) {
  const v = corpo && typeof corpo === 'object' ? corpo.website : undefined;
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

// ---------- corpo da requisição ----------
// Parser próprio, com teto pequeno. O server.js monta isto ANTES do
// express.json global (1 MB): o corpo já chega consumido e o global
// apenas segue adiante.
// `mensagem413` é opcional (padrão: texto do contato); a newsletter, que não
// tem campo mensagem, passa o seu.
export const MENSAGEM_413 = 'Conteúdo grande demais. Reduza a mensagem e tente de novo.';
export function corpoContato({ mensagem413 = MENSAGEM_413 } = {}) {
  return [
    express.json({ limit: CORPO_MAX }),
    express.urlencoded({ extended: false, limit: CORPO_MAX }),
    (err, _req, res, next) => {
      if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: mensagem413 });
      }
      if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
        return res.status(400).json({ error: 'Não foi possível ler os dados enviados.' });
      }
      next(err);
    }
  ];
}

// ---------- notificação por e-mail (Resend, via fetch — sem dependência) ----------
// Sem RESEND_API_KEY ou LEADS_EMAIL_TO devolve null: o lead só é gravado e logado.
// `assunto` e `corpo` são opcionais (padrão: e-mail de lead do contato); a
// newsletter passa os seus. `replyTo` (padrão: e-mail de quem enviou) pode ser
// `null` para o aviso sair sem reply_to.
export function criarNotificadorEmail({
  resendApiKey, para, de, fetchImpl = globalThis.fetch, timeoutMs = 5000,
  assunto = assuntoEmail, corpo = corpoEmail, replyTo = (lead) => lead.email
} = {}) {
  if (!resendApiKey || !para) return null;
  const destinatarios = String(para).split(',').map(s => s.trim()).filter(Boolean);
  const remetente = de || 'Site Complexo DMC <onboarding@resend.dev>';

  return async function notificar(lead) {
    const resp = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remetente,
        to: destinatarios,
        ...(replyTo ? { reply_to: replyTo(lead) } : {}),
        subject: assunto(lead),
        text: corpo(lead)
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!resp.ok) throw new Error(`Resend respondeu HTTP ${resp.status}`);
    return { enviado: true };
  };
}

export function assuntoEmail(lead) {
  const tipo = lead.curso ? 'Interesse em treinamento'
    : lead.segmento ? `Lead de vertical — ${(SEGMENTOS[lead.segmento] || {}).nome || lead.segmento}`
    : 'Novo contato pelo site';
  return `${tipo} — ${lead.nome}`.replace(/[\r\n]+/g, ' ').slice(0, 180);
}

export function corpoEmail(lead) {
  const linhas = [
    `Nome: ${lead.nome}`,
    `E-mail: ${lead.email}`,
    `Telefone: ${lead.telefone || '—'}`,
    `Empresa: ${lead.empresa || '—'}`,
    `Perfil: ${PERFIS[lead.perfil] || lead.perfil}`,
    `Assunto: ${lead.eixo ? EIXOS[lead.eixo] : '—'}`
  ];
  if (lead.curso) linhas.push(`Treinamento: ${lead.curso}`);
  if (lead.segmento) {
    linhas.push(`Segmento: ${(SEGMENTOS[lead.segmento] || {}).nome || lead.segmento} (${lead.segmento})`);
    linhas.push(`Faturamento anual: ${FATURAMENTOS[lead.faturamento] || '—'}`);
    linhas.push(`Patrimônio envolvido: ${PATRIMONIOS[lead.patrimonio] || '—'}`);
    linhas.push(`Motivo do contato: ${MOTIVOS[lead.motivo] || '—'}`);
  }
  linhas.push(`Origem: ${lead.origem}`, `Recebido em: ${lead.createdAt.toISOString()}`, '', 'Mensagem:', lead.mensagem || '—');
  return linhas.join('\n');
}

// ---------- rota ----------
export function criarRotaContato({
  salvar,
  notificar = null,
  throttle = criarThrottle({
    ...THROTTLE_PADRAO,
    mensagem: 'Muitos envios em sequência. Aguarde alguns minutos e tente de novo.'
  }),
  agora = () => new Date(),
  log = console
}) {
  if (typeof salvar !== 'function') throw new Error('criarRotaContato: informe salvar(lead).');
  const router = Router();

  router.post('/', throttle, async (req, res) => {
    const corpo = req.body;

    if (ehRobo(corpo)) {
      log.warn('[DMC] contato: honeypot preenchido — envio descartado sem gravar.');
      return res.status(200).json({ ok: true });
    }

    const { ok, erros, dados } = validarContato(corpo);
    if (!ok) {
      return res.status(400).json({ error: 'Revise os campos indicados.', campos: erros });
    }

    const momento = agora();
    const lead = {
      ...dados,
      consentimento: { aceito: true, em: momento },
      status: 'novo',
      createdAt: momento
    };

    let id;
    try {
      const r = await salvar(lead);
      id = r && r.insertedId !== undefined ? String(r.insertedId) : undefined;
    } catch (err) {
      log.error('[DMC] contato: falha ao gravar lead:', err && err.message);
      return res.status(503).json({ error: 'Não foi possível registrar seu contato agora. Tente novamente em instantes.' });
    }

    // Lead já está salvo: falha no e-mail não vira erro para quem enviou.
    if (notificar) {
      try {
        await notificar(lead);
        log.log(`[DMC] contato: lead ${id ?? '?'} gravado (origem ${lead.origem}); equipe notificada por e-mail.`);
      } catch (err) {
        log.error(`[DMC] contato: lead ${id ?? '?'} gravado, mas o e-mail de notificação falhou:`, err && err.message);
      }
    } else {
      log.log(`[DMC] contato: lead ${id ?? '?'} gravado (origem ${lead.origem}); e-mail de notificação não configurado.`);
    }

    res.status(201).json({ ok: true, id });
  });

  return router;
}
