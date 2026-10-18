// =============================================================
// COMPLEXO DMC · Portal — Meus dados (canal do titular, LGPD) e o
// serviço `consentimentos.*` (único escritor da coleção `consentimentos`)
// PORTAL-API §6.3.3, §6.3.4, §4.4 (DC-72), §3.3 · índice D-55 · dono: F0t.
//
// Serviços registrados (nome fixo):
//   consentimentos.registrar({ userId, finalidade, versaoTexto, textoSha256, via, req }) → { finalidade, em }
//   consentimentos.revogar({ userId, finalidade, via, req }) → { em }
//   consentimentos.vigente(userId, finalidade) → { versaoTexto, textoSha256, em } | null
// Só inserção em `consentimentos` (histórico completo); o espelho
// `perfis.consentimentos` (só perfil_*) acompanha o último registro.
// Auditoria `executar` em registrar e revogar: falha → 503 e nada grava.
//
// Rotas (aluno, /api/portal/me/dados/*): resumo (categorias, base legal,
// operadores, encarregado — nunca inventado), consentimentos (as 6
// finalidades, aceite avulso das 5 do perfil, revogação com o efeito),
// exportação JSON (3/dia, persistente; sem hash, segredo nem código).
// Pedidos de correção/eliminação: POST /portal/me/atendimentos (F6a).
// =============================================================
import { ObjectId } from 'mongodb';
import { ErroPortal, MENSAGENS } from '../../portal/erros.js';
import { truncarIp, lerEnum } from '../../portal/validacao.js';
import { registrarIndices } from '../../portal/indices.js';
import { exportarDoTitular } from '../../portal/servicos.js';
import { papelDe } from '../../portal/papeis.js';
import {
  FINALIDADES, FINALIDADES_PERFIL, CHAVE_ESPELHO, ROTULOS, EFEITO_REVOGACAO, textoConsentimento, VERSAO_TEXTO_ATUAL
} from '../../portal/consentimentos-textos.js';

export const INDICES_CONSENTIMENTOS = Object.freeze([
  { colecao: 'consentimentos', chave: { userId: 1, finalidade: 1, em: -1 }, opcoes: { name: 'ix_consent_user' } }
]);
registrarIndices(INDICES_CONSENTIMENTOS);

const VIAS = Object.freeze(['perfil', 'meus_dados', 'ia']);
const SHA256_RE = /^[a-f0-9]{64}$/;
const iso = d => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);
export const LIMITE_EXPORTACAO = Object.freeze({ janelaMs: 24 * 60 * 60 * 1000, max: 3 });

/**
 * Serviço `consentimentos.*` (API §4.4, DC-72).
 * @param {{ repo, auditoria, agora? }} deps
 */
export function criarConsentimentos({ repo, auditoria, agora = () => new Date() } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarConsentimentos: informe repo.');
  if (!auditoria) throw new TypeError('criarConsentimentos: informe auditoria.');

  async function ultimo(userId, finalidade) {
    const docs = await repo('consentimentos').find({ userId: String(userId), finalidade }, { sort: { em: -1, _id: -1 }, limit: 1 }).toArray();
    return docs[0] || null;
  }

  /** Último registro de cada finalidade: { [finalidade]: doc|null }. */
  async function ultimosDe(userId) {
    const docs = await repo('consentimentos').find({ userId: String(userId) }, { sort: { em: -1, _id: -1 }, limit: 500 }).toArray();
    const out = Object.fromEntries(FINALIDADES.map(f => [f, null]));
    for (const d of docs) if (Object.hasOwn(out, d.finalidade) && !out[d.finalidade]) out[d.finalidade] = d;
    return out;
  }

  /** Espelho `perfis.consentimentos` ({ genero, etnia, nomeSocial, redes, foto }) a partir do histórico. */
  async function espelhoDe(userId) {
    const u = await ultimosDe(userId);
    const out = {};
    for (const f of FINALIDADES_PERFIL) {
      const d = u[f];
      out[CHAVE_ESPELHO[f]] = d ? { aceito: d.aceito === true, versaoTexto: d.versaoTexto, em: d.em } : null;
    }
    return out;
  }

  async function atualizarEspelho(userId, finalidade, valor) {
    const chave = CHAVE_ESPELHO[finalidade];
    if (!chave) return;
    // Sem perfil ainda: o espelho nasce junto do perfil (perfil.js lê o histórico).
    await repo('perfis').updateOne({ userId: String(userId), consentimentos: { $type: 'object' } }, { $set: { [`consentimentos.${chave}`]: valor } });
  }

  function conferirFinalidade(finalidade) {
    if (!FINALIDADES.includes(finalidade)) {
      throw new ErroPortal(400, 'validacao', undefined, { campos: { finalidade: 'Finalidade desconhecida.' } });
    }
  }

  async function vigente(userId, finalidade) {
    if (!FINALIDADES.includes(finalidade)) return null;
    const u = await ultimo(userId, finalidade);
    return u && u.aceito === true ? { versaoTexto: u.versaoTexto, textoSha256: u.textoSha256 ?? null, em: u.em } : null;
  }

  /**
   * Grava o aceite (só inserção) e o espelho, depois de auditar (executar). O chamador conferiu o texto.
   * `efeito` (opcional, só F0t): mutação extra feita dentro do mesmo registro de auditoria.
   */
  async function registrar({ userId, finalidade, versaoTexto, textoSha256, via, req = null, efeito = null } = {}) {
    conferirFinalidade(finalidade);
    if (!VIAS.includes(via)) throw new TypeError(`consentimentos.registrar: via inválida (${String(via)}).`);
    if (typeof versaoTexto !== 'string' || !versaoTexto) throw new ErroPortal(400, 'validacao', undefined, { campos: { versaoTexto: 'Versão do texto desconhecida.' } });
    if (typeof textoSha256 !== 'string' || !SHA256_RE.test(textoSha256)) throw new TypeError('consentimentos.registrar: textoSha256 inválido.');
    const uid = String(userId);
    const em = agora();
    await auditoria.executar({
      acao: 'consentimento.registrado', entidade: { tipo: 'consentimento', id: `${uid}:${finalidade}` }, alvoUserId: uid,
      extra: { finalidade, versaoTexto, via }
    }, req, async () => {
      await repo('consentimentos').insertOne({
        userId: uid, finalidade, aceito: true, versaoTexto, textoSha256, em, ipTruncado: truncarIp(req?.ip) ?? null, via
      });
      await atualizarEspelho(uid, finalidade, { aceito: true, versaoTexto, em });
      if (typeof efeito === 'function') await efeito();
    });
    return { finalidade, em };
  }

  /** Grava a revogação (registro `aceito:false`); sem aceite vigente → 404. */
  async function revogar({ userId, finalidade, via, req = null, efeito = null } = {}) {
    conferirFinalidade(finalidade);
    if (!VIAS.includes(via)) throw new TypeError(`consentimentos.revogar: via inválida (${String(via)}).`);
    const uid = String(userId);
    const v = await vigente(uid, finalidade);
    if (!v) throw new ErroPortal(404, null, 'Não há autorização vigente para esta finalidade.');
    const em = agora();
    await auditoria.executar({
      acao: 'consentimento.revogado', entidade: { tipo: 'consentimento', id: `${uid}:${finalidade}` }, alvoUserId: uid,
      extra: { finalidade, versaoTexto: v.versaoTexto, via }
    }, req, async () => {
      await repo('consentimentos').insertOne({
        userId: uid, finalidade, aceito: false, versaoTexto: v.versaoTexto, textoSha256: v.textoSha256, em, ipTruncado: truncarIp(req?.ip) ?? null, via
      });
      await atualizarEspelho(uid, finalidade, { aceito: false, versaoTexto: v.versaoTexto, em });
      if (typeof efeito === 'function') await efeito();
    });
    return { em };
  }

  return Object.freeze({ registrar, revogar, vigente, ultimosDe, espelhoDe });
}

/**
 * Apaga o dado ligado à finalidade do perfil (efeito da revogação, API §6.3.1).
 * Nome social → users.nome volta ao nome de registro; foto → binário apagado e users.temFoto:false.
 */
export async function apagarDadoDaFinalidade({ repo, arquivos = null, agora = () => new Date() }, userId, finalidade) {
  const uid = String(userId);
  const perfil = await repo('perfis').findOne({ userId: uid });
  const userOid = new ObjectId(uid);
  const t = agora();
  const $set = { atualizadoEm: t, atualizadoPor: uid };
  switch (finalidade) {
    case 'perfil_genero': $set.genero = null; break;
    case 'perfil_etnia': $set.etnia = null; break;
    case 'perfil_redes': $set.redes = { instagram: null, facebook: null }; break;
    case 'perfil_nome_social': {
      $set.nomeSocial = null;
      if (perfil?.nomeRegistro) await repo('users').updateOne({ _id: userOid }, { $set: { nome: perfil.nomeRegistro } });
      break;
    }
    case 'perfil_foto': {
      if (perfil?.fotoArquivoId && arquivos) await arquivos.apagar(perfil.fotoArquivoId);
      $set.fotoArquivoId = null;
      await repo('users').updateOne({ _id: userOid }, { $set: { temFoto: false } });
      break;
    }
    default: return;
  }
  if (perfil) await repo('perfis').updateOne({ userId: uid }, { $set, $inc: { versao: 1 } });
}

// ---------- conteúdo do resumo (texto fixo, sóbrio; nada inventado) ----------
const VOCE = 'Você';
const COORD = 'Coordenação';
const PROF = 'Professores das suas turmas';
export const CATEGORIAS = Object.freeze([
  { chave: 'conta', rotulo: 'Conta de acesso (e-mail, papel, senha protegida, verificação em duas etapas)', baseLegal: 'Execução de contrato (LGPD, art. 7º, V)', finalidade: 'Permitir o seu acesso e proteger a conta.', retencao: 'Enquanto a conta existir; os registros de segurança seguem os prazos definidos pela coordenação.', visivelPara: [VOCE, COORD] },
  { chave: 'identificacao', rotulo: 'Identificação (nome de registro, CPF ou passaporte, nascimento, nacionalidade, naturalidade, RG, estado civil)', baseLegal: 'Execução de contrato e cumprimento de obrigação legal (LGPD, art. 7º, V e II)', finalidade: 'Matrícula, contratos, declarações e certificados.', retencao: 'Enquanto durar o vínculo e pelos prazos legais de guarda de documentos acadêmicos e fiscais.', visivelPara: [VOCE, COORD] },
  { chave: 'nomeSocial', rotulo: 'Nome social', baseLegal: 'Consentimento (LGPD, art. 7º, I)', finalidade: 'Usar o nome de exibição que você escolheu.', retencao: 'Até você retirar a autorização.', visivelPara: [VOCE, COORD, PROF] },
  { chave: 'contato', rotulo: 'Contato (e-mail e celular)', baseLegal: 'Execução de contrato (LGPD, art. 7º, V)', finalidade: 'Comunicação sobre os seus cursos e a sua conta.', retencao: 'Enquanto durar o vínculo.', visivelPara: [VOCE, COORD, `${PROF} (só o e-mail)`] },
  { chave: 'endereco', rotulo: 'Endereço', baseLegal: 'Execução de contrato e cumprimento de obrigação legal (LGPD, art. 7º, V e II)', finalidade: 'Contratos, documentos fiscais e correspondência.', retencao: 'Enquanto durar o vínculo e pelos prazos legais aplicáveis.', visivelPara: [VOCE, COORD] },
  { chave: 'redes', rotulo: 'Perfis de redes sociais', baseLegal: 'Consentimento (LGPD, art. 7º, I)', finalidade: 'Contato da coordenação.', retencao: 'Até você retirar a autorização.', visivelPara: [VOCE, COORD] },
  { chave: 'foto', rotulo: 'Foto do perfil', baseLegal: 'Consentimento (LGPD, art. 7º, I)', finalidade: 'Identificação visual no portal.', retencao: 'Até você retirar a foto ou a autorização.', visivelPara: [VOCE, COORD, PROF] },
  { chave: 'diversidade', rotulo: 'Gênero e cor ou etnia', baseLegal: 'Consentimento específico e destacado para dado sensível (LGPD, art. 11, I)', finalidade: 'Estatísticas agregadas de diversidade (grupos com 5 ou mais pessoas).', retencao: 'Até você retirar a autorização.', visivelPara: [VOCE] },
  { chave: 'estudos', rotulo: 'Estudos (progresso, avaliações, frequência, declarações e certificados)', baseLegal: 'Execução de contrato (LGPD, art. 7º, V)', finalidade: 'Acompanhar o curso e emitir os documentos acadêmicos.', retencao: 'Enquanto durar o vínculo e pelos prazos de guarda de registros acadêmicos.', visivelPara: [VOCE, COORD, PROF] },
  { chave: 'documentosContratos', rotulo: 'Documentos pessoais enviados e contratos', baseLegal: 'Execução de contrato e cumprimento de obrigação legal (LGPD, art. 7º, V e II)', finalidade: 'Conferência da matrícula e assinatura eletrônica.', retencao: 'Pelos prazos legais de guarda de documentos.', visivelPara: [VOCE, COORD] },
  { chave: 'financeiro', rotulo: 'Lançamentos financeiros', baseLegal: 'Execução de contrato e cumprimento de obrigação legal (LGPD, art. 7º, V e II)', finalidade: 'Cobrança, comprovantes e declarações de quitação.', retencao: 'Pelos prazos legais de guarda fiscal.', visivelPara: [VOCE, COORD] },
  { chave: 'atendimento', rotulo: 'Atendimentos, ouvidoria e notificações', baseLegal: 'Execução de contrato e legítimo interesse (LGPD, art. 7º, V e IX)', finalidade: 'Responder aos seus pedidos e avisar sobre eventos da conta.', retencao: 'Notificações: pelo prazo de retenção configurado pela coordenação; atendimentos: enquanto durar o vínculo.', visivelPara: [VOCE, COORD] },
  { chave: 'assistente', rotulo: 'Conversas com o Assistente de IA', baseLegal: 'Consentimento (LGPD, art. 7º, I)', finalidade: 'Responder às suas perguntas sobre a plataforma.', retencao: 'Pelo prazo informado no texto de autorização do assistente; você pode apagar o histórico.', visivelPara: [VOCE] }
]);

export function operadoresDeclarados({ emailConfigurado = false } = {}) {
  const lista = [
    { nome: 'Vercel', finalidade: 'Hospedagem da plataforma', quando: 'Em todo acesso', internacional: true },
    { nome: 'MongoDB Atlas', finalidade: 'Banco de dados', quando: 'Em todo acesso', internacional: true }
  ];
  if (emailConfigurado) lista.push({ nome: 'Resend', finalidade: 'Envio de e-mails da plataforma', quando: 'Quando um e-mail é enviado a você', internacional: true });
  lista.push(
    { nome: 'Google Gemini', finalidade: 'Assistente de IA', quando: 'Só se você autorizar o assistente', internacional: true },
    { nome: 'ViaCEP', finalidade: 'Consulta de endereço pelo CEP (só o CEP é enviado)', quando: 'Quando você busca um CEP', internacional: false },
    { nome: 'Google Fonts', finalidade: 'Fontes das páginas (recebe o seu endereço IP)', quando: 'Em toda página', internacional: true },
    { nome: 'YouTube (youtube-nocookie) e Vimeo', finalidade: 'Exibição de vídeos (recebem o seu endereço IP)', quando: 'Quando a aula ou publicação usa o provedor', internacional: true },
    { nome: 'Plataforma da sala do encontro ao vivo (Zoom, Meet, Teams ou outra)', finalidade: 'Encontros ao vivo', quando: 'Quando você clica em Entrar', internacional: true }
  );
  return lista;
}

export const TEXTO_POLITICA = 'Os seus dados pessoais são tratados conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018) e a Política de Privacidade do Complexo DMC. Pedidos de acesso, correção, eliminação ou informação sobre compartilhamento são feitos por aqui e respondidos em até 15 dias.';

/**
 * @param {{ router, repo, auditoria, consentimentos, contador, servicos, email?, arquivos?, agora?, log? }} deps
 */
export function criarRotaMeusDados(deps = {}) {
  const { router, repo, auditoria, consentimentos, contador, servicos, email = null, arquivos = null, agora = () => new Date(), log = console } = deps;
  if (!router) throw new TypeError('criarRotaMeusDados: informe router.');
  if (typeof repo !== 'function' || !auditoria || !consentimentos || !contador || !servicos) {
    throw new TypeError('criarRotaMeusDados: informe repo, auditoria, consentimentos, contador e servicos.');
  }

  router.get('/me/dados/resumo', async (_req, res) => {
    let encarregado = null;
    const publicas = servicos.tentar('configuracoes.publicas');
    if (typeof publicas === 'function') {
      try {
        const r = await publicas();
        const e = r?.encarregado;
        if (e && typeof e === 'object' && typeof e.nome === 'string' && e.nome.trim()) {
          encarregado = { nome: e.nome, email: e.email ?? null, telefone: e.telefone ?? null, canalUrl: e.canalUrl ?? null };
        }
      } catch (err) {
        try { (log.warn || log.error).call(log, `[portal] meus-dados: configuracoes.publicas falhou (${err?.name || 'erro'})`); } catch { /* nada */ }
      }
    }
    res.json({ categorias: CATEGORIAS, operadores: operadoresDeclarados({ emailConfigurado: !!email?.disponivel }), encarregado, textoPolitica: TEXTO_POLITICA });
  });

  router.get('/me/dados/consentimentos', async (req, res) => {
    const ultimos = await consentimentos.ultimosDe(req.user._id);
    res.json({
      itens: FINALIDADES.map(f => {
        const d = ultimos[f];
        return { finalidade: f, rotulo: ROTULOS[f], aceito: d?.aceito === true, versaoTexto: d?.versaoTexto ?? null, em: iso(d?.em), efeitoRevogacao: EFEITO_REVOGACAO[f] };
      })
    });
  });

  router.post('/me/dados/consentimentos', async (req, res) => {
    const c = req.body || {};
    const finalidade = lerEnum(c.finalidade, FINALIDADES_PERFIL, 'finalidade', { obrigatorio: true });
    if (c.aceito !== true) throw new ErroPortal(400, 'validacao', undefined, { campos: { aceito: 'Marque a autorização para registrar.' } });
    const versao = c.versaoTexto ?? VERSAO_TEXTO_ATUAL;
    if (typeof versao !== 'string') throw new ErroPortal(400, 'formato-invalido');
    const t = textoConsentimento(finalidade, versao);
    if (!t) throw new ErroPortal(400, 'validacao', undefined, { campos: { versaoTexto: 'Versão do texto desconhecida.' } });
    const r = await consentimentos.registrar({ userId: req.user._id, finalidade, versaoTexto: t.versaoTexto, textoSha256: t.textoSha256, via: 'meus_dados', req });
    res.status(201).json({ finalidade: r.finalidade, em: iso(r.em) });
  });

  router.post('/me/dados/consentimentos/:finalidade/revogar', async (req, res) => {
    const finalidade = req.params.finalidade;
    if (!FINALIDADES.includes(finalidade)) throw new ErroPortal(404, null, 'Finalidade não encontrada.');
    const userId = String(req.user._id);
    if (finalidade === 'assistente_ia') {
      const apagarHistorico = req.body?.apagarHistorico === true;
      const revogarIa = servicos.obter('ia.revogarConsentimento'); // ausente → 503 servico-indisponivel
      const r = await revogarIa(userId, { apagarHistorico, req });
      return res.json({ ok: true, efeito: EFEITO_REVOGACAO[finalidade], ...(Number.isFinite(r?.apagadas) ? { apagadas: r.apagadas } : {}) });
    }
    await consentimentos.revogar({
      userId, finalidade, via: 'meus_dados', req,
      efeito: () => apagarDadoDaFinalidade({ repo, arquivos, agora }, userId, finalidade)
    });
    res.json({ ok: true, efeito: EFEITO_REVOGACAO[finalidade] });
  });

  router.get('/me/dados/exportacao', async (req, res) => {
    const userId = String(req.user._id);
    const lim = await contador.consumir(`exportacao:${userId}`, LIMITE_EXPORTACAO);
    if (!lim.ok) throw new ErroPortal(429, 'limite', 'Você já gerou 3 exportações hoje. Tente de novo amanhã.', { retryAfterSeg: lim.retryAfterSeg, persistente: true });
    const { secoes, indisponiveis } = await exportarDoTitular(servicos, userId, { log });
    await auditoria.registrar({ acao: 'titular.exportacao', entidade: { tipo: 'usuario', id: userId }, alvoUserId: userId, extra: { secoes: Object.keys(secoes), indisponiveis } }, req);
    const t = agora();
    const dia = t.toISOString().slice(0, 10).replace(/-/g, '');
    const corpo = { versaoFormato: 1, geradoEm: t.toISOString(), ...secoes, ...(indisponiveis.length ? { secoesIndisponiveis: indisponiveis } : {}) };
    res.set('Content-Disposition', `attachment; filename="meus-dados-${dia}.json"`);
    res.type('application/json').send(JSON.stringify(corpo, null, 2));
  });

  return router;
}

// ---------- exportadores da F0t (grupo `exportador`, §6.3.4) ----------
/** Conta (sem hash, segredo, token nem códigos). */
export function criarExportadorConta({ repo }) {
  return {
    dominio: 'conta',
    async exportar(userId) {
      const u = await repo('users').findOne({ _id: new ObjectId(String(userId)) });
      if (!u) return null;
      return {
        id: String(u._id), email: u.email, nome: u.nome ?? null, papel: papelDe(u), criadoEm: iso(u.createdAt || u.criadoEm),
        ultimoLoginEm: iso(u.ultimoLoginEm), emailVerificadoEm: iso(u.emailVerificadoEm), senhaAlteradaEm: iso(u.senhaAlteradaEm),
        senhaOrigem: u.senhaOrigem ?? null, doisFatoresAtivo: u.doisFatoresAtivo === true, temFoto: u.temFoto === true
      };
    }
  };
}

/** Perfil completo do titular (inclui CPF, RG, gênero e etnia: é o próprio titular). */
export function criarExportadorPerfil({ repo }) {
  return {
    dominio: 'perfil',
    async exportar(userId) {
      const p = await repo('perfis').findOne({ userId: String(userId) }, { projection: { _id: 0 } });
      if (!p) return null;
      const { fotoArquivoId, ...resto } = p;
      return { ...resto, temFoto: !!fotoArquivoId };
    }
  };
}

/** Histórico completo de aceites e revogações. */
export function criarExportadorConsentimentos({ repo }) {
  return {
    dominio: 'consentimentos',
    async exportar(userId) {
      const docs = await repo('consentimentos').find({ userId: String(userId) }, { sort: { em: 1, _id: 1 }, projection: { _id: 0, userId: 0 } }).toArray();
      return docs.map(d => ({ ...d, em: iso(d.em) }));
    }
  };
}

/**
 * Leitor do localizador para uso NAS REQUISIÇÕES. O `ctx.servicos` do montar é o lote do
 * módulo; depois de confirmado, `lote.todos(g)` devolve as definições do módulo duas vezes
 * (base + lote). O Set remove a repetição (mesma referência).
 */
export function leitorDeServicos(srv) {
  return Object.freeze({
    tentar: nome => srv.tentar(nome),
    obter: nome => srv.obter(nome),
    todos: grupo => [...new Set(srv.todos(grupo))]
  });
}

/** Montagem no agregador (API §5.1). */
export default async function montar(ctx) {
  const c = ctx.comum;
  const consentimentos = criarConsentimentos({ repo: c.repo, auditoria: c.auditoria, agora: c.agora });
  ctx.servicos.registrar('consentimentos.registrar', consentimentos.registrar);
  ctx.servicos.registrar('consentimentos.revogar', consentimentos.revogar);
  ctx.servicos.registrar('consentimentos.vigente', consentimentos.vigente);
  ctx.servicos.adicionar('exportador', criarExportadorConta({ repo: c.repo }));
  ctx.servicos.adicionar('exportador', criarExportadorPerfil({ repo: c.repo }));
  ctx.servicos.adicionar('exportador', criarExportadorConsentimentos({ repo: c.repo }));
  criarRotaMeusDados({
    router: ctx.rotas.aluno, repo: c.repo, auditoria: c.auditoria, consentimentos, contador: c.contador,
    servicos: leitorDeServicos(ctx.servicos), email: c.email, arquivos: c.arquivos, agora: c.agora, log: c.log
  });
}

export { MENSAGENS };
