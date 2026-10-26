// =============================================================
// COMPLEXO DMC · Portal — atendimento (ATD) e ouvidoria (OUV)
// PORTAL-API §3.3 (F6), §4.4, §6.10.1, §6.10.2 · índice §8.4 · dono: F6a.
//
// Funções puras (rotear, prazo, visões) + `criarServicoAtendimento`,
// usado pelas rotas de routes/portal/{atendimento,ouvidoria}.js e
// registrado com nome fixo pelos módulos de rota:
//   atendimento.abrirProtocolo  (F0t Meus dados · F5 pedido da loja)
//   atendimento.abertosDoAluno  (F6b)
//   atendimento.abertosDoEscopo (F8 resumo)
//   atendimento.ouvidoriaSemParecer (F8 resumo, D-54)
//
// Regras fixas:
// - roteamento: `academico` com curso → fila `professores_do_curso`
//   (docência geral do curso + docência da turma da matrícula vigente
//   + admins); o resto → `coordenacao` (só admin);
// - estados: aberto → (equipe responde) respondido → (aluno escreve)
//   aberto; qualquer lado encerra → encerrado (final);
// - a identidade de quem escreve na ouvidoria NUNCA vai a professor
//   (visão saneada nos 4 tipos; DC-40).
// =============================================================
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { ErroPortal } from '../erros.js';
import { codigoAnual, inserirComCodigo, CODIGO_ANUAL_RE } from '../codigos.js';

export const CATEGORIAS = Object.freeze(['academico', 'secretaria', 'financeiro', 'tecnico', 'privacidade']);
export const ROTULOS_CATEGORIA = Object.freeze({
  academico: 'Acadêmico', secretaria: 'Secretaria', financeiro: 'Financeiro', tecnico: 'Acesso e tecnologia',
  privacidade: 'Privacidade e dados pessoais'
});
export const PEDIDOS_TITULAR = Object.freeze(['acesso', 'correcao', 'eliminacao', 'compartilhamento', 'revogacao_consentimento', 'outro']);
export const STATUS = Object.freeze(['aberto', 'respondido', 'encerrado']);
export const ORIGENS = Object.freeze(['humano', 'ia']);
export const FILAS = Object.freeze(['coordenacao', 'professores_do_curso']);
export const TIPOS_OUVIDORIA = Object.freeze(['elogio', 'denuncia', 'reclamacao', 'sugestao']);
export const ROTULOS_TIPO_OUVIDORIA = Object.freeze({ elogio: 'Elogio', denuncia: 'Denúncia', reclamacao: 'Reclamação', sugestao: 'Sugestão' });

export const MAX_MENSAGENS = 200;
export const PRAZO_PRIVACIDADE_DIAS = 15;
export const NOME_EQUIPE = 'Equipe Complexo DMC';
export const NOME_OUVIDORIA = 'Ouvidoria';
const DIA_MS = 24 * 60 * 60 * 1000;

export const ATD_RE = CODIGO_ANUAL_RE.ATD;
export const OUV_RE = CODIGO_ANUAL_RE.OUV;

/** Índices das coleções da F6a (API §3.3; nomes únicos verificados por portal-base-indices). */
export const INDICES_ATENDIMENTO = Object.freeze([
  { colecao: 'protocolos', chave: { protocolo: 1 }, opcoes: { name: 'uq_atd_protocolo', unique: true } },
  { colecao: 'protocolos', chave: { userId: 1, ultimaAtividadeEm: -1 }, opcoes: { name: 'ix_atd_user' } },
  { colecao: 'protocolos', chave: { status: 1, categoria: 1, ultimaAtividadeEm: -1 }, opcoes: { name: 'ix_atd_fila' } },
  { colecao: 'protocolos', chave: { 'roteamento.cursoId': 1, status: 1 }, opcoes: { name: 'ix_atd_curso' } },
  { colecao: 'protocolos', chave: { 'roteamento.responsavelId': 1, status: 1 }, opcoes: { name: 'ix_atd_resp' } },
  { colecao: 'protocolos', chave: { userId: 1, 'pedido.chave': 1, criadoEm: -1 }, opcoes: { name: 'ix_atd_pedido', partialFilterExpression: { 'pedido.chave': { $type: 'string' } } } }
]);
export const INDICES_OUVIDORIA = Object.freeze([
  { colecao: 'manifestacoes', chave: { protocolo: 1 }, opcoes: { name: 'uq_ouv_protocolo', unique: true } },
  { colecao: 'manifestacoes', chave: { userId: 1, criadoEm: -1 }, opcoes: { name: 'ix_ouv_user' } },
  { colecao: 'manifestacoes', chave: { status: 1, tipo: 1, criadoEm: -1 }, opcoes: { name: 'ix_ouv_fila' } },
  { colecao: 'manifestacoes', chave: { 'encaminhamentos.paraUserId': 1 }, opcoes: { name: 'ix_ouv_enc' } }
]);

// ---------- puros ----------
const hex = v => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && typeof v.toHexString === 'function') return v.toHexString();
  const s = String(v);
  return /^[a-f0-9]{24}$/.test(s) ? s : null;
};
const iso = d => (d instanceof Date ? d.toISOString() : d ?? null);
export const novoIdMensagem = (bytes = randomBytes) => `m-${bytes(6).toString('hex')}`;

/**
 * Fila de um protocolo (função pura, API §6.10.1).
 * @param {{ categoria:string, cursoId?:string|null, turmaId?:string|ObjectId|null }} p
 * @returns {{ fila:'coordenacao'|'professores_do_curso', cursoId:string|null, turmaId:string|null, responsavelId:null }}
 */
export function rotear({ categoria, cursoId = null, turmaId = null } = {}) {
  const curso = typeof cursoId === 'string' && cursoId ? cursoId : null;
  if (categoria === 'academico' && curso) {
    return { fila: 'professores_do_curso', cursoId: curso, turmaId: hex(turmaId), responsavelId: null };
  }
  return { fila: 'coordenacao', cursoId: curso, turmaId: null, responsavelId: null };
}

/** Prazo de resposta (só privacidade: criadoEm + 15 dias, LGPD art. 19). */
export function prazoResposta(categoria, criadoEm) {
  if (categoria !== 'privacidade' || !(criadoEm instanceof Date)) return null;
  return new Date(criadoEm.getTime() + PRAZO_PRIVACIDADE_DIAS * DIA_MS);
}

/** Quem a conversa espera agora. */
export const aguardando = status => (status === 'aberto' ? 'equipe' : status === 'respondido' ? 'aluno' : null);

/** Item de lista do titular. */
export function itemDoAluno(p) {
  return {
    protocolo: p.protocolo,
    categoria: p.categoria,
    pedidoTitular: p.pedidoTitular ?? null,
    assunto: p.assunto,
    status: p.status,
    origem: p.origem,
    criadoEm: iso(p.criadoEm),
    ultimaAtividadeEm: iso(p.ultimaAtividadeEm),
    prazoRespostaEm: iso(p.prazoRespostaEm),
    aguardando: aguardando(p.status)
  };
}

function pedidoPublico(pedido) {
  if (!pedido || typeof pedido !== 'object') return null;
  return {
    cursoIds: Array.isArray(pedido.cursoIds) ? [...pedido.cursoIds] : [],
    itens: (Array.isArray(pedido.itens) ? pedido.itens : []).map(i => ({ cursoId: i.cursoId, titulo: i.titulo, valorCentavos: Number.isInteger(i.valorCentavos) ? i.valorCentavos : null })),
    totalCentavos: Number.isInteger(pedido.totalCentavos) ? pedido.totalCentavos : null,
    em: iso(pedido.em)
  };
}

function anexoPublico(anexo) {
  if (!anexo || typeof anexo !== 'object') return null;
  return {
    mensagens: (Array.isArray(anexo.mensagens) ? anexo.mensagens : []).map(m => ({ papel: m.papel, texto: m.texto, em: iso(m.em) })),
    omitidas: Number(anexo.omitidas) || 0
  };
}

// ---------- protocolo vindo do assistente: recorte por quem lê (API §6.10.3) ----------
// O anexo e o resumo (1ª mensagem) de um protocolo `origem:'ia'` são preparados para a fila
// do MOMENTO do escalonamento: a coordenação recebe tudo; a fila de professores, só os pares
// que não usaram documentos, contratos nem financeiro (filtrarAnexo, F6b). Uma reatribuição
// posterior (fila de professores ou responsável professor) não pode levar ao professor o que
// foi preparado só para a coordenação: o recorte é feito na LEITURA, para quem não é admin,
// e nada é apagado (a coordenação e a titular continuam vendo tudo).

/** Aviso que substitui, para o professor, a resposta do assistente no resumo. */
export const AVISO_RESERVADO_COORDENACAO = '[Resposta do assistente reservada à coordenação.]';
// Cabeçalho que o resumoExtrativo (ia.js) põe antes da última resposta do assistente.
const MARCA_RESPOSTA_IA = /(?:^|\n)[ \t]*Última resposta do assistente:/iu;
const PROFESSORES = 'professores_do_curso';

/**
 * Para que fila o conteúdo do protocolo foi preparado na abertura.
 * Gravado desde a correção (`filaNaAbertura`); em protocolo antigo, deduz pelo lado seguro:
 * só é "da fila de professores" se o anexo foi filtrado (omitidas > 0, o que só o filtro
 * dela faz) ou se o protocolo nunca foi reatribuído e está nessa fila.
 */
export function filaDeAbertura(p) {
  if (FILAS.includes(p?.filaNaAbertura)) return p.filaNaAbertura;
  if (Number(p?.anexoConversa?.omitidas) > 0) return PROFESSORES;
  const reatribuido = (Array.isArray(p?.eventos) ? p.eventos : []).some(e => e?.tipo === 'reatribuido');
  return !reatribuido && p?.roteamento?.fila === PROFESSORES ? PROFESSORES : 'coordenacao';
}

/** Fila para a qual o anexo foi filtrado (`anexoConversa.filtradoPara`; antigo → filaDeAbertura). */
export function anexoFiltradoPara(p) {
  const f = p?.anexoConversa?.filtradoPara;
  return FILAS.includes(f) ? f : filaDeAbertura(p);
}

/** Conta os trechos do anexo como o filtro conta (pergunta + resposta = 1; mensagem solta = 1). */
function contarTrechos(mensagens) {
  const lista = Array.isArray(mensagens) ? mensagens : [];
  let n = 0;
  for (let i = 0; i < lista.length; i++) {
    if (lista[i]?.papel === 'aluno' && lista[i + 1]?.papel === 'assistente') i++;
    n++;
  }
  return n;
}

/** Resumo sem a resposta do assistente (as perguntas são texto da própria titular e ficam). */
export function recortarResumoIa(texto) {
  const s = String(texto ?? '').normalize('NFC');
  const i = s.search(MARCA_RESPOSTA_IA);
  if (i < 0) return s;
  const antes = s.slice(0, i).trimEnd();
  return antes ? `${antes}\n\n${AVISO_RESERVADO_COORDENACAO}` : AVISO_RESERVADO_COORDENACAO;
}

/** Anexo na visão de quem lê: admin vê o gravado; os demais, só o que foi filtrado para professores. */
function anexoParaLeitor(p, leitor) {
  const anexo = anexoPublico(p.anexoConversa);
  if (!anexo || leitor === 'admin' || anexoFiltradoPara(p) === PROFESSORES) return anexo;
  return { mensagens: [], omitidas: anexo.omitidas + contarTrechos(anexo.mensagens) };
}

/** Recorta o resumo (1ª mensagem de protocolo da IA) quando ele foi preparado para a coordenação. */
function textoParaLeitor(p, m, indice, leitor) {
  if (leitor === 'admin' || indice !== 0 || p.origem !== 'ia' || m.autorPapel !== 'aluno') return m.texto;
  return filaDeAbertura(p) === PROFESSORES ? m.texto : recortarResumoIa(m.texto);
}

/** Protocolo completo na visão do titular (equipe assina "Equipe Complexo DMC"). */
export function detalheDoAluno(p, { curso = null } = {}) {
  return {
    ...itemDoAluno(p),
    cursoId: p.cursoId ?? null,
    curso: curso ? { id: curso.id, titulo: curso.titulo } : null,
    mensagens: (p.mensagens || []).map(m => ({
      id: m.id,
      autor: m.autorPapel === 'aluno' ? 'aluno' : 'equipe',
      autorNome: m.autorPapel === 'aluno' ? (m.autorNome || '') : NOME_EQUIPE,
      texto: m.texto,
      em: iso(m.em)
    })),
    anexoConversa: anexoPublico(p.anexoConversa),
    pedido: pedidoPublico(p.pedido),
    primeiraRespostaEm: iso(p.primeiraRespostaEm),
    encerradoEm: iso(p.encerradoEm),
    versao: p.versao
  };
}

/** Item da fila da equipe. */
export function itemDaEquipe(p, { nomes = new Map(), cursos = new Map(), comPedido = false } = {}) {
  const resp = p.roteamento?.responsavelId ?? null;
  return {
    ...itemDoAluno(p),
    aluno: { id: p.userId, nome: p.alunoNome || nomes.get(p.userId)?.nome || '' },
    cursoId: p.cursoId ?? null,
    cursoTitulo: p.cursoId ? (cursos.get(p.cursoId)?.titulo ?? null) : null,
    fila: p.roteamento?.fila ?? 'coordenacao',
    responsavel: resp ? { id: resp, nome: nomes.get(resp)?.nome ?? null } : null,
    primeiraRespostaEm: iso(p.primeiraRespostaEm),
    ...(comPedido ? { pedido: p.pedido ? { itens: pedidoPublico(p.pedido).itens, totalCentavos: pedidoPublico(p.pedido).totalCentavos } : null } : {})
  };
}

/**
 * Protocolo completo na visão da equipe (com aluno, roteamento e autores).
 * `leitor` = papel de quem lê (`papelDe`); só 'admin' recebe o anexo e o resumo da IA como
 * gravados. Ausente → recorte (padrão fechado).
 */
export function detalheDaEquipe(p, { aluno = null, curso = null, nomes = new Map(), leitor = null } = {}) {
  const resp = p.roteamento?.responsavelId ?? null;
  return {
    ...itemDoAluno(p),
    aluno: aluno ? { id: aluno.id, nome: aluno.nome, email: aluno.email ?? null } : { id: p.userId, nome: p.alunoNome || '', email: null },
    cursoId: p.cursoId ?? null,
    curso: curso ? { id: curso.id, titulo: curso.titulo } : null,
    roteamento: {
      fila: p.roteamento?.fila ?? 'coordenacao',
      cursoId: p.roteamento?.cursoId ?? null,
      turmaId: hex(p.roteamento?.turmaId),
      responsavelId: resp,
      responsavelNome: resp ? (nomes.get(resp)?.nome ?? null) : null
    },
    mensagens: (p.mensagens || []).map((m, i) => ({ id: m.id, autor: m.autorPapel === 'aluno' ? 'aluno' : 'equipe', autorPapel: m.autorPapel, autorNome: m.autorNome || '', texto: textoParaLeitor(p, m, i, leitor), em: iso(m.em) })),
    eventos: (p.eventos || []).map(e => ({ tipo: e.tipo, texto: e.texto, em: iso(e.em) })),
    anexoConversa: anexoParaLeitor(p, leitor),
    pedido: pedidoPublico(p.pedido),
    primeiraRespostaEm: iso(p.primeiraRespostaEm),
    encerradoEm: iso(p.encerradoEm),
    motivoEncerramento: p.motivoEncerramento ?? null,
    versao: p.versao
  };
}

// ---------- ouvidoria: visões ----------
export function itemOuvidoriaDoTitular(m) {
  return { protocolo: m.protocolo, tipo: m.tipo, assunto: m.assunto, status: m.status, criadoEm: iso(m.criadoEm), ultimaAtividadeEm: iso(m.ultimaAtividadeEm) };
}

/** Visão do manifestante: completa, SEM encaminhamentos nem pareceres (e sem autorId). */
export function detalheOuvidoriaDoTitular(m, { curso = null } = {}) {
  return {
    ...itemOuvidoriaDoTitular(m),
    texto: m.texto,
    cursoId: m.cursoId ?? null,
    curso: curso ? { id: curso.id, titulo: curso.titulo } : null,
    mensagens: (m.mensagens || []).map(x => ({ id: x.id, autor: x.autorPapel === 'manifestante' ? 'voce' : 'ouvidoria', autorNome: x.autorPapel === 'manifestante' ? 'Você' : NOME_OUVIDORIA, texto: x.texto, em: iso(x.em) })),
    encerradoEm: iso(m.encerradoEm)
  };
}

/** Item da fila da coordenação: SEM identidade. */
export function itemOuvidoriaDaCoordenacao(m, { cursos = new Map(), nomes = new Map() } = {}) {
  const encs = Array.isArray(m.encaminhamentos) ? m.encaminhamentos : [];
  return {
    ...itemOuvidoriaDoTitular(m),
    cursoId: m.cursoId ?? null,
    cursoTitulo: m.cursoId ? (cursos.get(m.cursoId)?.titulo ?? null) : null,
    encaminhadaPara: encs.map(e => ({ id: e.paraUserId, nome: nomes.get(e.paraUserId)?.nome ?? null, comParecer: !!e.parecer }))
  };
}

/** Detalhe da coordenação (sem identidade; ela só vem com ?identidade=1, à parte). */
export function detalheOuvidoriaDaCoordenacao(m, { curso = null, nomes = new Map() } = {}) {
  return {
    ...itemOuvidoriaDoTitular(m),
    texto: m.texto,
    cursoId: m.cursoId ?? null,
    curso: curso ? { id: curso.id, titulo: curso.titulo } : null,
    mensagens: (m.mensagens || []).map(x => ({ id: x.id, autor: x.autorPapel === 'manifestante' ? 'manifestante' : 'ouvidoria', autorNome: x.autorPapel === 'manifestante' ? 'Quem escreveu' : NOME_OUVIDORIA, texto: x.texto, em: iso(x.em) })),
    encaminhamentos: (m.encaminhamentos || []).map(e => ({
      professor: { id: e.paraUserId, nome: nomes.get(e.paraUserId)?.nome ?? null },
      em: iso(e.em),
      observacao: e.observacao,
      parecer: e.parecer ? { texto: e.parecer.texto, em: iso(e.parecer.em) } : null
    })),
    podeEncaminhar: m.tipo !== 'denuncia',
    encerradoEm: iso(m.encerradoEm),
    versao: m.versao
  };
}

/** Último encaminhamento da manifestação a este professor (ou null). */
export function encaminhamentoPara(m, userId) {
  const encs = (Array.isArray(m?.encaminhamentos) ? m.encaminhamentos : []).filter(e => e.paraUserId === userId);
  return encs.length ? encs[encs.length - 1] : null;
}

/**
 * Visão do PROFESSOR — sempre saneada, nos 4 tipos (API §6.10.2): só estas chaves.
 * Nenhum userId, nome, e-mail, mensagens, matrícula, turma, status interno ou outros encaminhamentos.
 */
export function visaoOuvidoriaDoProfessor(m, userId, { curso = null } = {}) {
  const enc = encaminhamentoPara(m, userId);
  return {
    protocolo: m.protocolo,
    tipo: m.tipo,
    assunto: m.assunto,
    texto: m.texto,
    curso: curso ? { titulo: curso.titulo } : null,
    criadoEm: iso(m.criadoEm),
    encaminhadaEm: iso(enc?.em ?? null),
    observacao: enc?.observacao ?? null,
    meuParecer: enc?.parecer ? { texto: enc.parecer.texto, em: iso(enc.parecer.em) } : null
  };
}

/** Consome limites persistentes (depois da validação, para não punir erro de digitação). */
export async function consumirLimites(contador, _req, limites) {
  if (!contador) return;
  for (const { chave, janelaMs, max } of limites) {
    const r = await contador.consumir(chave, { janelaMs, max });
    if (!r.ok) throw new ErroPortal(429, 'limite', undefined, { retryAfterSeg: r.retryAfterSeg, persistente: true });
  }
}

// ---------- fila visível ----------
const formasDoId = ids => ids.flatMap(id => (/^[a-f0-9]{24}$/.test(id) ? [id, new ObjectId(id)] : [id]));

/**
 * Filtro Mongo da fila de atendimentos visível ao requisitante (regra de §4.2):
 * admin → tudo; professor → fila `professores_do_curso` dos cursos com docência geral,
 * das turmas em que é docente (protocolo com `roteamento.turmaId` dela) e os atribuídos a ele.
 * @returns {Promise<object>} filtro (nunca vazio para professor: sem docência → só os atribuídos)
 */
export async function filtroDaFila(acesso, req) {
  const ctx = await acesso.contexto(req);
  if (ctx.papel === 'admin') return {};
  const ors = [{ 'roteamento.responsavelId': ctx.userId }];
  const gerais = [...ctx.cursosDocenteGeral];
  if (gerais.length) ors.push({ 'roteamento.fila': 'professores_do_curso', 'roteamento.cursoId': { $in: gerais } });
  for (const [cursoId, turmas] of ctx.turmasDocente) {
    if (ctx.cursosDocenteGeral.has(cursoId) || !turmas.size) continue;
    ors.push({ 'roteamento.fila': 'professores_do_curso', 'roteamento.cursoId': cursoId, 'roteamento.turmaId': { $in: formasDoId([...turmas]) } });
  }
  return { $or: ors };
}

// ---------- serviço ----------
/**
 * @param {{ repo, servicos, acesso, auditoria, notificacoes, garantia?, agora?, log?, bytes? }} deps
 */
export function criarServicoAtendimento({ repo, servicos, acesso, auditoria = null, notificacoes = null, garantia = null, agora = () => new Date(), log = console, bytes = randomBytes } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarServicoAtendimento: informe repo.');
  if (!servicos) throw new TypeError('criarServicoAtendimento: informe servicos.');
  if (!acesso) throw new TypeError('criarServicoAtendimento: informe acesso.');
  const protocolos = () => repo('protocolos');
  const manifestacoes = () => repo('manifestacoes');

  let indicesProntos = false;
  async function esperarIndices() {
    if (indicesProntos || !garantia) return;
    await garantia.garantir();
    indicesProntos = true;
  }

  /** Turma da matrícula vigente do aluno no curso (serviço da F4a; ausente → null, só a docência geral vê). */
  async function turmaVigente(userId, cursoId) {
    if (!cursoId) return null;
    const f = servicos.tentar('secretaria.matriculaVigente');
    if (typeof f !== 'function') return null;
    try {
      const m = await f(userId, cursoId);
      return hex(m?.turmaId);
    } catch (err) {
      try { log.warn?.(`[portal] secretaria.matriculaVigente falhou no roteamento (${err?.name || 'Erro'})`); } catch { /* nada */ }
      return null;
    }
  }

  async function nomeDeExibicao(userId) {
    const f = servicos.tentar('perfis.publicos');
    if (typeof f === 'function') {
      try {
        const mapa = await f([userId]);
        const p = mapa.get(String(userId));
        if (p) return p.nomeSocial || p.nome || '';
      } catch { /* cai no users */ }
    }
    const id = hex(userId);
    const u = id ? await repo('users').findOne({ _id: new ObjectId(id) }, { projection: { nome: 1 } }) : null;
    return u?.nome || '';
  }

  /**
   * Abre um protocolo ATD (API §4.4). Validação de forma é do chamador (rota); aqui ficam as
   * regras de domínio: `pedido` só em financeiro (erro de programação), privacidade exige pedidoTitular.
   * @returns {Promise<{ id:string, protocolo:string, doc:object }>}
   */
  async function abrirProtocolo({ userId, categoria, pedidoTitular = null, assunto, mensagem, cursoId = null, origem = 'humano', conversaIaId = null, anexoConversa = null, pedido = null, req = null } = {}) {
    if (!userId) throw new TypeError('abrirProtocolo: informe userId.');
    if (!CATEGORIAS.includes(categoria)) throw new TypeError('abrirProtocolo: categoria inválida.');
    if (!ORIGENS.includes(origem)) throw new TypeError('abrirProtocolo: origem inválida.');
    if (pedido && categoria !== 'financeiro') throw new TypeError('abrirProtocolo: pedido só com categoria financeiro.');
    if (categoria === 'privacidade' && !PEDIDOS_TITULAR.includes(pedidoTitular)) {
      throw new ErroPortal(400, 'validacao', undefined, { campos: { pedidoTitular: 'Escolha o tipo de pedido.' } });
    }
    if (typeof assunto !== 'string' || !assunto.trim() || typeof mensagem !== 'string' || !mensagem.trim()) {
      throw new TypeError('abrirProtocolo: assunto e mensagem são obrigatórios.');
    }
    const uid = String(userId);
    const t = agora();
    const turmaId = categoria === 'academico' ? await turmaVigente(uid, cursoId) : null;
    const roteamento = rotear({ categoria, cursoId, turmaId });
    const alunoNome = await nomeDeExibicao(uid);
    const autorPapel = 'aluno'; // o lado do titular (quem abre é sempre o titular, mesmo que seja da equipe)
    const doc = {
      userId: uid,
      alunoNome,
      categoria,
      pedidoTitular: categoria === 'privacidade' ? pedidoTitular : null,
      assunto: assunto.trim(),
      cursoId: cursoId || null,
      origem,
      conversaIaId: conversaIaId ? (typeof conversaIaId === 'object' ? conversaIaId : (hex(conversaIaId) ? new ObjectId(hex(conversaIaId)) : null)) : null,
      // Para quem o conteúdo foi preparado: o ia.js filtra o anexo e monta o resumo pela mesma
      // regra de fila do rotear() acima (teste de paridade em atendimento-protocolos.test.js).
      filaNaAbertura: roteamento.fila,
      anexoConversa: anexoConversa && Array.isArray(anexoConversa.mensagens)
        ? { mensagens: anexoConversa.mensagens.map(m => ({ papel: m.papel, texto: String(m.texto ?? ''), em: m.em instanceof Date ? m.em : new Date(m.em || t) })), omitidas: Number(anexoConversa.omitidas) || 0, filtradoPara: roteamento.fila }
        : null,
      pedido: pedido
        ? {
          chave: String(pedido.chave),
          cursoIds: Array.isArray(pedido.cursoIds) ? pedido.cursoIds.map(String) : [],
          itens: (Array.isArray(pedido.itens) ? pedido.itens : []).map(i => ({ cursoId: String(i.cursoId), titulo: String(i.titulo ?? ''), valorCentavos: Number.isInteger(i.valorCentavos) ? i.valorCentavos : null })),
          totalCentavos: Number.isInteger(pedido.totalCentavos) ? pedido.totalCentavos : null,
          em: t
        }
        : null,
      roteamento: { ...roteamento, turmaId: roteamento.turmaId ? new ObjectId(roteamento.turmaId) : null },
      status: 'aberto',
      mensagens: [{ id: novoIdMensagem(bytes), autorId: uid, autorPapel, autorNome: alunoNome, texto: mensagem.trim(), em: t }],
      eventos: [],
      prazoRespostaEm: prazoResposta(categoria, t),
      primeiraRespostaEm: null,
      ultimaAtividadeEm: t,
      ultimoAutorPapel: 'aluno',
      encerradoEm: null,
      encerradoPor: null,
      motivoEncerramento: null,
      versao: 1,
      criadoEm: t
    };
    await esperarIndices();
    let protocolo = null;
    let id = null;
    await inserirComCodigo(async (codigo) => {
      const r = await protocolos().insertOne({ ...doc, protocolo: codigo });
      protocolo = codigo;
      id = String(r.insertedId);
    }, () => codigoAnual('ATD', t, bytes), { indice: 'uq_atd_protocolo', campo: 'protocolo' });
    doc.protocolo = protocolo;
    doc._id = id;
    if (auditoria) {
      await auditoria.registrar({ acao: 'protocolo.criado', entidade: { tipo: 'protocolo', id: protocolo }, alvoUserId: uid, cursoId: doc.cursoId, extra: { categoria, origem, fila: roteamento.fila } }, req);
    }
    return { id, protocolo, doc };
  }

  /** Protocolos não encerrados do titular (F6b). */
  async function abertosDoAluno(userId) {
    const docs = await protocolos().find({ userId: String(userId), status: { $in: ['aberto', 'respondido'] } }, { projection: { protocolo: 1, categoria: 1, assunto: 1, status: 1, ultimaAtividadeEm: 1 } })
      .sort({ ultimaAtividadeEm: -1 }).limit(50).toArray();
    return docs.map(d => ({ protocolo: d.protocolo, categoria: d.categoria, assunto: d.assunto, status: d.status, ultimaAtividadeEm: iso(d.ultimaAtividadeEm) }));
  }

  /** Abertos visíveis ao requisitante, por curso + atribuídos a ele (F8, resumo). */
  async function abertosDoEscopo(req, cursoIds = []) {
    const filtro = await filtroDaFila(acesso, req);
    const lista = Array.isArray(cursoIds) ? cursoIds.map(String) : [];
    const docs = await protocolos().find({ ...filtro, status: 'aberto' }, { projection: { 'roteamento.cursoId': 1, 'roteamento.responsavelId': 1 } }).limit(20000).toArray();
    const porCurso = Object.fromEntries(lista.map(c => [c, 0]));
    const eu = req?.user?._id ? String(req.user._id) : null;
    let atribuidos = 0;
    for (const d of docs) {
      const c = d.roteamento?.cursoId;
      if (c && Object.hasOwn(porCurso, c)) porCurso[c]++;
      if (eu && d.roteamento?.responsavelId === eu) atribuidos++;
    }
    return { porCurso, atribuidos };
  }

  /** Encaminhamentos de ouvidoria a este professor ainda sem parecer (D-54). */
  async function ouvidoriaSemParecer(userId) {
    const u = String(userId);
    const docs = await manifestacoes().find({ 'encaminhamentos.paraUserId': u }, { projection: { encaminhamentos: 1 } }).limit(20000).toArray();
    let n = 0;
    for (const d of docs) for (const e of d.encaminhamentos || []) if (e.paraUserId === u && !e.parecer) n++;
    return n;
  }

  return Object.freeze({ abrirProtocolo, abertosDoAluno, abertosDoEscopo, ouvidoriaSemParecer, turmaVigente, nomeDeExibicao, esperarIndices });
}

export { CODIGO_ANUAL_RE };
