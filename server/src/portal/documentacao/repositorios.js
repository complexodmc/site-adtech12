// =============================================================
// COMPLEXO DMC · Portal — documentação: documentos pessoais e contratos
// PORTAL-API §3.3 (F4b: tipos_documento, documentos_enviados, contratos),
// §4.7 (selo do contrato), §6.8.3–§6.8.4 · índice §8.1 (F4b), D-78 · dono: F4b.
//
// Funções puras e formas de saída usadas pelas duas rotas da fatia
// (routes/portal/documentos.js e routes/portal/contratos.js):
// - INDICES_DOCUMENTACAO: índices das três coleções (nomes explícitos;
//   o agregador os garante por indices.js — nada em db.js).
// - Checklist do aluno: tipos exigidos (escopo 'todos' ou cursos do
//   aluno), status derivado 'nao_enviado', resumo "3 de 5 aprovados".
// - Contrato: texto de aceite v1 literal, campos do selo, formas para o
//   aluno, a coordenação e o comprovante (sem CPF em claro).
// Nada aqui toca `matriculas` (F4a): matrícula só por serviço.
// =============================================================
import { ObjectId } from 'mongodb';

export const COLECOES = Object.freeze({
  tipos: 'tipos_documento',
  envios: 'documentos_enviados',
  contratos: 'contratos',
  users: 'users',
  perfis: 'perfis',
  cursos: 'cursos'
});

/** PORTAL-API §3.3 (F4b). */
export const INDICES_DOCUMENTACAO = Object.freeze([
  { colecao: 'tipos_documento', chave: { sigla: 1 }, opcoes: { name: 'uq_tipodoc_sigla', unique: true } },
  { colecao: 'tipos_documento', chave: { ativo: 1, ordem: 1 }, opcoes: { name: 'ix_tipodoc_ativo' } },
  { colecao: 'documentos_enviados', chave: { userId: 1, tipoId: 1 }, opcoes: { name: 'uq_docenv_atual', unique: true, partialFilterExpression: { atual: true } } },
  { colecao: 'documentos_enviados', chave: { status: 1, enviadoEm: 1 }, opcoes: { name: 'ix_docenv_fila' } },
  { colecao: 'documentos_enviados', chave: { userId: 1, enviadoEm: -1 }, opcoes: { name: 'ix_docenv_user' } },
  { colecao: 'contratos', chave: { userId: 1, status: 1, criadoEm: -1 }, opcoes: { name: 'ix_ctr_user' } },
  { colecao: 'contratos', chave: { matriculaId: 1 }, opcoes: { name: 'ix_ctr_matricula' } },
  { colecao: 'contratos', chave: { status: 1, criadoEm: -1 }, opcoes: { name: 'ix_ctr_fila' } },
  { colecao: 'contratos', chave: { codigoVerificacao: 1 }, opcoes: { name: 'uq_ctr_codigo', unique: true, partialFilterExpression: { codigoVerificacao: { $type: 'string' } } } }
].map(e => Object.freeze(e)));

export const FORMATOS_DOCUMENTO = Object.freeze(['pdf', 'jpg', 'png']);
export const ESCOPOS = Object.freeze(['todos', 'cursos']);
export const STATUS_ENVIO = Object.freeze(['em_revisao', 'aprovado', 'pendente', 'substituido']);
export const STATUS_ITEM = Object.freeze(['nao_enviado', 'em_revisao', 'aprovado', 'pendente']);
export const STATUS_CONTRATO = Object.freeze(['pendente', 'assinado', 'cancelado']);
export const SIGLA_DOCUMENTO_RE = /^[A-Z]{2,6}$/;
export const DIA_MS = 24 * 60 * 60 * 1000;

export const ROTULOS_STATUS_DOCUMENTO = Object.freeze({
  nao_enviado: 'Não enviado', em_revisao: 'Em revisão', aprovado: 'Aprovado', pendente: 'Pendente', substituido: 'Substituído'
});
export const ROTULOS_STATUS_CONTRATO = Object.freeze({ pendente: 'Pendente', assinado: 'Assinado', cancelado: 'Cancelado' });

/**
 * Sugestão inicial (API §6.8.3): nasce INATIVA (D7) — a coordenação revisa nome,
 * orientação e escopo e só então ativa. O significado das siglas é pendência do CEO
 * (índice §13); os nomes abaixo são ponto de partida editável.
 */
export const TIPOS_SUGERIDOS = Object.freeze([
  { sigla: 'DOC', nome: 'Documento de identificação com foto', descricao: 'RG, CNH ou passaporte, frente e verso.' },
  { sigla: 'DIP', nome: 'Diploma', descricao: 'Diploma do curso exigido para a matrícula, frente e verso.' },
  { sigla: 'CERT', nome: 'Certidão de nascimento ou casamento', descricao: 'Cópia legível da certidão.' },
  { sigla: 'HIS', nome: 'Histórico escolar', descricao: 'Histórico do curso exigido para a matrícula.' },
  { sigla: 'RES', nome: 'Comprovante de residência', descricao: 'Emitido nos últimos 90 dias.' }
].map(t => Object.freeze(t)));

export const VERSAO_TEXTO_ACEITE = 'v1';
export const ROTULO_CONTRATO_PUBLICO = 'Contrato de prestação de serviços educacionais';
export const METODO_ASSINATURA = 'eletronica_simples_nativa';
/** Janela depois de a coordenação redefinir o acesso em que a assinatura fica bloqueada (§6.8.4). */
export const JANELA_REAUTENTICACAO_MS = 72 * 60 * 60 * 1000;

/** Texto de aceite v1 — exibido no passo 2 e gravado literal na evidência (API §6.8.4). */
export function textoAceiteV1(titulo, sha256Pdf) {
  return `Li integralmente o contrato «${String(titulo ?? '')}», identificado pelo código SHA-256 ${String(sha256Pdf ?? '')}, `
    + 'e concordo com os seus termos. Assino eletronicamente com meu acesso pessoal à Plataforma Complexo DMC.';
}

/** Mesma URL pública de validação das declarações (validar.html, F3b). */
export const urlValidacao = codigo => `/plataforma-ead/validar.html?codigo=${encodeURIComponent(String(codigo))}`;

/** 16 primeiros hex do selo em grupos de 4 ('9C1E-07AB-…'); sem selo → null. */
export function hashPrefixo(hash) {
  if (typeof hash !== 'string' || !/^[a-f0-9]{16,}$/i.test(hash)) return null;
  return hash.slice(0, 16).toUpperCase().match(/.{4}/g).join('-');
}

export const hex = v => {
  if (v === null || v === undefined) return null;
  if (v instanceof ObjectId) return v.toHexString();
  const s = String(v);
  return s || null;
};

export function paraObjectId(v) {
  if (v instanceof ObjectId) return v;
  return typeof v === 'string' && /^[a-f0-9]{24}$/.test(v) ? new ObjectId(v) : null;
}

export const iso = d => (d instanceof Date ? d.toISOString() : (d ? new Date(d).toISOString() : null));

/** Campos assinados do contrato (API §4.7), na ordem do contrato. */
export function camposSeloContrato(c) {
  const a = c?.assinatura || {};
  return {
    contratoId: hex(c?._id),
    codigoVerificacao: c?.codigoVerificacao ?? null,
    sha256Pdf: a.sha256Pdf ?? null,
    em: a.em ?? null,
    userId: a.userId ?? null,
    identificacaoNoAto: a.identificacaoNoAto ?? null,
    textoAceite: a.textoAceite ?? null,
    versaoTexto: a.versaoTexto ?? null,
    fatores: Array.isArray(a.fatores) ? a.fatores : [],
    ipTruncado: a.ipTruncado ?? null,
    userAgent: a.userAgent ?? null,
    tokenEmitidoEm: a.tokenEmitidoEm ?? null,
    senhaDefinidaEm: a.senhaDefinidaEm ?? null,
    origemSenha: a.origemSenha ?? null,
    credencialRedefinidaPelaCoordenacaoEm: a.credencialRedefinidaPelaCoordenacaoEm ?? null
  };
}

/** CPF/passaporte nunca saem inteiros: '***.456.789-**' ou '••••1234'. */
export function mascararDocumento(doc) {
  if (!doc || typeof doc !== 'object' || !doc.numero) return null;
  const n = String(doc.numero);
  if (doc.tipo === 'cpf') {
    const d = n.replace(/\D/g, '');
    return { tipo: 'cpf', numero: d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '***' };
  }
  return { tipo: doc.tipo || 'passaporte', numero: n.length > 4 ? `••••${n.slice(-4)}` : '••••' };
}

export function criarRepositorios({ repo }) {
  if (typeof repo !== 'function') throw new TypeError('criarRepositorios (documentação): informe repo(nome).');
  const c = {};
  for (const [k, nome] of Object.entries(COLECOES)) c[k] = () => repo(nome);
  return Object.freeze(c);
}

// =============================================================
// Documentos pessoais — checklist (puro)
// =============================================================
const porOrdem = (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || String(a.sigla).localeCompare(String(b.sigla));

/**
 * O tipo é exigido deste aluno? Ativo E (escopo 'todos' ou curso em comum).
 * Leitura adotada: sem nenhuma matrícula não cancelada, nada é exigido (os documentos
 * são "para a sua matrícula", UX §6.8) — equipe sem matrícula vê o vazio honesto.
 */
export function tipoExigido(tipo, cursoIds) {
  if (!tipo || tipo.ativo !== true) return false;
  const meus = Array.isArray(cursoIds) ? cursoIds.map(String) : [];
  if (!meus.length) return false;
  if (tipo.escopo === 'todos') return true;
  return (Array.isArray(tipo.cursoIds) ? tipo.cursoIds : []).some(c => meus.includes(String(c)));
}

/** Uma linha do checklist (GET /portal/me/documentos). */
export function itemDoChecklist(tipo, envio, exigido) {
  const status = envio ? envio.status : 'nao_enviado';
  return {
    tipoId: hex(tipo._id),
    sigla: tipo.sigla,
    nome: tipo.nome,
    descricao: tipo.descricao || '',
    obrigatorio: tipo.obrigatorio === true,
    exigido: !!exigido,
    formatos: Array.isArray(tipo.formatos) && tipo.formatos.length ? [...tipo.formatos] : [...FORMATOS_DOCUMENTO],
    status,
    motivo: status === 'pendente' ? (envio?.motivo ?? null) : null,
    numeroEnvio: envio ? envio.numeroEnvio : null,
    enviadoEm: envio ? iso(envio.enviadoEm) : null,
    revisadoEm: envio ? iso(envio.revisadoEm) : null,
    envioId: envio ? hex(envio._id) : null,
    temArquivo: !!(envio && envio.arquivoId),
    mime: envio?.mime ?? null,
    tamanho: envio?.tamanho ?? null,
    podeEnviar: !!exigido && tipo.ativo === true && status !== 'aprovado'
  };
}

/**
 * @param {{ tipos: object[], envios: object[], cursoIds: string[], limiteBytes: number }} p
 *   tipos = os ativos + os que têm envio atual do aluno; envios = os do aluno.
 */
export function montarChecklist({ tipos, envios, cursoIds, limiteBytes }) {
  const atuais = new Map((envios || []).filter(e => e && e.atual === true).map(e => [hex(e.tipoId), e]));
  const itens = [];
  const vistos = new Set();
  for (const t of [...(tipos || [])].sort(porOrdem)) {
    const id = hex(t._id);
    if (vistos.has(id)) continue;
    vistos.add(id);
    const exigido = tipoExigido(t, cursoIds);
    const envio = atuais.get(id) || null;
    if (!exigido && !envio) continue;
    itens.push(itemDoChecklist(t, envio, exigido));
  }
  const exigidos = itens.filter(i => i.exigido);
  const conta = s => exigidos.filter(i => i.status === s).length;
  return {
    limiteBytes,
    formatos: [...FORMATOS_DOCUMENTO],
    itens,
    resumo: {
      exigidos: exigidos.length,
      aprovados: conta('aprovado'),
      emRevisao: conta('em_revisao'),
      pendentes: conta('pendente'),
      naoEnviados: conta('nao_enviado')
    }
  };
}

/** Tipo para a coordenação (catálogo de tipos). */
export function tipoPublico(t, { emUso = null } = {}) {
  return {
    id: hex(t._id), sigla: t.sigla, nome: t.nome, descricao: t.descricao || '',
    formatos: Array.isArray(t.formatos) ? [...t.formatos] : [], escopo: t.escopo || 'todos',
    cursoIds: Array.isArray(t.cursoIds) ? t.cursoIds.map(String) : [], obrigatorio: t.obrigatorio === true,
    ativo: t.ativo === true, ordem: Number(t.ordem) || 0, versao: t.versao ?? 1,
    criadoEm: iso(t.criadoEm), atualizadoEm: iso(t.atualizadoEm),
    ...(emUso === null ? {} : { emUso: !!emUso })
  };
}

/** Envio para a coordenação (fila e detalhe), sem binário. */
export function envioPublico(e, { aluno = null, tipoNome = null } = {}) {
  return {
    id: hex(e._id),
    aluno: aluno ? { id: aluno.id, nome: aluno.nome ?? null, email: aluno.email ?? null } : { id: String(e.userId), nome: null, email: null },
    tipoId: hex(e.tipoId), sigla: e.sigla, tipoNome,
    numeroEnvio: e.numeroEnvio, atual: e.atual === true, enviadoEm: iso(e.enviadoEm),
    mime: e.mime ?? null, tamanho: e.tamanho ?? null, sha256: e.sha256 ?? null, temArquivo: !!e.arquivoId,
    status: e.status, motivo: e.motivo ?? null, revisadoEm: iso(e.revisadoEm), versao: e.versao ?? 1
  };
}

export const extensaoDoMime = mime => ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[mime] || 'pdf');

// =============================================================
// Contratos — formas de saída (puro)
// =============================================================
/** Lista do aluno (GET /portal/me/contratos). */
export function contratoParaAluno(c) {
  const assinado = c.assinatura ? iso(c.assinatura.em) : null;
  return {
    id: hex(c._id),
    titulo: c.titulo,
    matriculaNumero: c.matriculaNumero ?? null,
    cursoTitulo: c.cursoTitulo ?? null,
    status: c.status,
    disponivelEm: iso(c.disponivelEm),
    visualizado: !!c.visualizadoEm,
    assinadoEm: assinado,
    canceladoEm: c.cancelamento ? iso(c.cancelamento.em) : null,
    sha256Pdf: c.sha256Pdf ?? null,
    tamanho: c.tamanho ?? null,
    codigoVerificacao: c.codigoVerificacao ?? null,
    hashPrefixo: c.assinatura ? hashPrefixo(c.assinatura.hash) : null,
    urlValidacao: c.codigoVerificacao ? urlValidacao(c.codigoVerificacao) : null,
    textoAceite: c.status === 'pendente' && c.sha256Pdf ? textoAceiteV1(c.titulo, c.sha256Pdf) : null,
    versaoTexto: VERSAO_TEXTO_ACEITE
  };
}

/** Evidências para impressão (comprovante de assinatura). Sem CPF, e-mail nem userId. */
export function comprovanteDe(c) {
  const a = c.assinatura || {};
  return {
    id: hex(c._id),
    titulo: c.titulo,
    matriculaNumero: c.matriculaNumero ?? null,
    cursoTitulo: c.cursoTitulo ?? null,
    status: c.status,
    assinadoEm: iso(a.em),
    canceladoEm: c.cancelamento ? iso(c.cancelamento.em) : null,
    signatario: a.identificacaoNoAto?.nomeRegistro ?? null,
    codigoVerificacao: c.codigoVerificacao ?? null,
    sha256Pdf: a.sha256Pdf ?? null,
    metodo: a.metodo ?? METODO_ASSINATURA,
    fatores: Array.isArray(a.fatores) ? [...a.fatores] : [],
    ipTruncado: a.ipTruncado ?? null,
    userAgent: a.userAgent ?? null,
    versaoTexto: a.versaoTexto ?? null,
    textoAceite: a.textoAceite ?? null,
    hashPrefixo: hashPrefixo(a.hash),
    urlValidacao: c.codigoVerificacao ? urlValidacao(c.codigoVerificacao) : null
  };
}

/** Linha da lista da coordenação. */
export function contratoParaLista(c, { aluno = null } = {}) {
  return {
    id: hex(c._id),
    aluno: aluno ? { id: aluno.id, nome: aluno.nome ?? null, email: aluno.email ?? null } : { id: String(c.userId), nome: null, email: null },
    matriculaId: hex(c.matriculaId), matriculaNumero: c.matriculaNumero ?? null,
    cursoId: c.cursoId ?? null, cursoTitulo: c.cursoTitulo ?? null, titulo: c.titulo,
    status: c.status, rascunho: c.status === 'pendente' && !c.disponivelEm,
    disponivelEm: iso(c.disponivelEm), visualizadoEm: iso(c.visualizadoEm),
    assinadoEm: c.assinatura ? iso(c.assinatura.em) : null, canceladoEm: c.cancelamento ? iso(c.cancelamento.em) : null,
    codigoVerificacao: c.codigoVerificacao ?? null, versao: c.versao ?? 1
  };
}

/** Detalhe da coordenação: completo, com evidências (documento mascarado). */
export function contratoParaAdmin(c, { aluno = null } = {}) {
  const base = contratoParaLista(c, { aluno });
  const a = c.assinatura;
  return {
    ...base,
    sha256Pdf: c.sha256Pdf ?? null,
    tamanho: c.tamanho ?? null,
    temArquivo: !!c.arquivoId,
    provedor: { nome: c.provedor?.nome || 'nativo' },
    substituicoes: (Array.isArray(c.substituicoes) ? c.substituicoes : []).map(s => ({
      em: iso(s.em), por: s.por ?? null, sha256Anterior: s.sha256Anterior ?? null, sha256Novo: s.sha256Novo ?? null, motivo: s.motivo ?? null
    })),
    cancelamento: c.cancelamento ? { em: iso(c.cancelamento.em), por: c.cancelamento.por ?? null, motivo: c.cancelamento.motivo ?? null } : null,
    assinatura: a ? {
      metodo: a.metodo, em: iso(a.em),
      identificacaoNoAto: {
        nomeRegistro: a.identificacaoNoAto?.nomeRegistro ?? null,
        documento: mascararDocumento(a.identificacaoNoAto?.documento),
        email: a.identificacaoNoAto?.email ?? null
      },
      sha256Pdf: a.sha256Pdf, textoAceite: a.textoAceite, versaoTexto: a.versaoTexto, fatores: [...(a.fatores || [])],
      ipTruncado: a.ipTruncado ?? null, userAgent: a.userAgent ?? null, tokenEmitidoEm: iso(a.tokenEmitidoEm),
      senhaDefinidaEm: iso(a.senhaDefinidaEm), origemSenha: a.origemSenha ?? null,
      credencialRedefinidaPelaCoordenacaoEm: iso(a.credencialRedefinidaPelaCoordenacaoEm),
      emailVerificado: a.emailVerificado === true, hashPrefixo: hashPrefixo(a.hash)
    } : null,
    hashPrefixo: a ? hashPrefixo(a.hash) : null,
    urlValidacao: c.codigoVerificacao ? urlValidacao(c.codigoVerificacao) : null,
    textoAceite: c.status === 'pendente' && c.sha256Pdf ? textoAceiteV1(c.titulo, c.sha256Pdf) : null
  };
}

