// =============================================================
// COMPLEXO DMC · Portal — Configurações e regulamento acadêmico
// PORTAL-API §6.10.5 · §3.3 (configuracoes, regulamentos) · DC-70, D-54,
// D-81 · dono: F6a (documentos `encarregado`, `instituicao`, `retencao`
// de `configuracoes` e a coleção `regulamentos`; `assistente_ia` é da F6b).
//
//   GET  /api/portal/configuracoes/publicas
//   GET  /api/portal/regulamento
//   GET·PUT /api/portal/admin/configuracoes/{encarregado,instituicao,retencao}
//   POST /api/portal/admin/configuracoes/retencao/reaplicar
//   GET·POST /api/portal/admin/regulamentos · POST …/previa
//   PUT  /api/portal/admin/regulamentos/:id · POST …/:id/publicar
//
// Serviços: configuracoes.publicas · .instituicao · .retencao.
// Grupo painel: sistema.instituicaoPendente (D-54). Nada nasce preenchido.
// =============================================================
import { Router } from 'express';
import { ErroPortal } from '../../portal/erros.js';
import { lerTexto, lerInteiro, lerId, validarEmail, validarUrlHttps, validarCnpj, validarCelular } from '../../portal/validacao.js';
import { fatiar } from '../../portal/ia/rag.js';

export const RETENCAO_PADRAO = Object.freeze({ conversasIaDias: 180, notificacoesDias: 180, trilhaIaDias: 730 });
export const LIMITES_RETENCAO = Object.freeze({
  conversasIaDias: [30, 730], notificacoesDias: [30, 730], trilhaIaDias: [180, 1825]
});
/** Categorias de retenção manual (prazo descritivo, UX §7.22). */
export const CATEGORIAS_RETENCAO = Object.freeze([
  { categoria: 'cadastro', rotulo: 'Cadastro' },
  { categoria: 'documentos', rotulo: 'Documentos pessoais' },
  { categoria: 'academico', rotulo: 'Frequência e avaliações' },
  { categoria: 'financeiro', rotulo: 'Lançamentos financeiros' },
  { categoria: 'contratos', rotulo: 'Contratos e evidências' },
  { categoria: 'protocolos', rotulo: 'Protocolos e ouvidoria' },
  { categoria: 'auditoria', rotulo: 'Auditoria' }
]);
export const TEXTO_MAX_REGULAMENTO = 200000;
const DIA_MS = 24 * 60 * 60 * 1000;

export const INDICES_CONFIGURACOES = Object.freeze([
  { colecao: 'regulamentos', chave: { escopo: 1, status: 1, edicao: -1 }, opcoes: { name: 'ix_reg_escopo' } }
]);

const iso = d => (d instanceof Date ? d.toISOString() : d ?? null);
const invalido = (campo, msg) => new ErroPortal(400, 'validacao', undefined, { campos: { [campo]: msg } });

/** Lê `versao` (0/ausente = documento novo). */
function lerVersao(corpo) {
  if (corpo.versao === undefined || corpo.versao === null || corpo.versao === '' || corpo.versao === 0) return 0;
  return lerInteiro(corpo.versao, { min: 0, obrigatorio: true }, 'versao');
}

/** Retenção efetiva (documento ou padrão). */
export function retencaoEfetiva(doc) {
  const r = { ...RETENCAO_PADRAO };
  for (const k of Object.keys(RETENCAO_PADRAO)) {
    const n = Number(doc?.[k]);
    const [min, max] = LIMITES_RETENCAO[k];
    if (Number.isInteger(n) && n >= min && n <= max) r[k] = n;
  }
  const prazos = doc?.prazosDescritivos && typeof doc.prazosDescritivos === 'object' ? doc.prazosDescritivos : {};
  r.prazosDescritivos = Object.fromEntries(CATEGORIAS_RETENCAO.map(c => [c.categoria, typeof prazos[c.categoria] === 'string' && prazos[c.categoria].trim() ? prazos[c.categoria] : null]));
  return r;
}

function encarregadoPublico(doc) {
  if (!doc || typeof doc.nome !== 'string' || !doc.nome.trim()) return null;
  return { nome: doc.nome, email: doc.email ?? null, telefone: doc.telefone ?? null, canalUrl: doc.canalUrl ?? null };
}

function instituicaoPublica(doc) {
  if (!doc || typeof doc.razaoSocial !== 'string' || !doc.razaoSocial.trim()) return null;
  return { razaoSocial: doc.razaoSocial, nomeFantasia: doc.nomeFantasia ?? null, cnpj: doc.cnpj, endereco: doc.endereco ?? null };
}

function regulamentoDoAdmin(d, { cursoTitulo = null } = {}) {
  return {
    id: String(d._id), escopo: d.escopo, cursoTitulo, titulo: d.titulo, edicao: d.edicao ?? null, status: d.status,
    texto: d.texto, trechosConsultaveis: Array.isArray(d.trechos) ? d.trechos.length : 0,
    publicadoEm: iso(d.publicadoEm), publicadoPor: d.publicadoPor ?? null, criadoEm: iso(d.criadoEm), atualizadoEm: iso(d.atualizadoEm), versao: d.versao
  };
}

/**
 * Fábrica (testável com falsos).
 * @returns {{ aluno: Router, admin: Router, servicos: { publicas, instituicao, retencao }, painel: object }}
 */
export function criarRotasConfiguracoes({ repo, servicos, acesso, auditoria, configPortal = {}, agora = () => new Date() } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarRotasConfiguracoes: informe repo.');
  if (!servicos) throw new TypeError('criarRotasConfiguracoes: informe servicos.');
  if (!acesso) throw new TypeError('criarRotasConfiguracoes: informe acesso.');
  if (!auditoria) throw new TypeError('criarRotasConfiguracoes: informe auditoria.');
  const cfg = () => repo('configuracoes');
  const regs = () => repo('regulamentos');

  const aluno = Router();
  const admin = Router();

  // ---------- serviços ----------
  async function instituicao() {
    return instituicaoPublica(await cfg().findOne({ _id: 'instituicao' }));
  }
  async function retencao() {
    return retencaoEfetiva(await cfg().findOne({ _id: 'retencao' }));
  }
  async function iaDisponivel() {
    const f = servicos.tentar('ia.disponivel');
    if (typeof f !== 'function') return false;
    try { return (await f()) === true; } catch { return false; }
  }
  async function publicas() {
    const [enc, inst, ret, ia] = await Promise.all([cfg().findOne({ _id: 'encarregado' }), instituicao(), retencao(), iaDisponivel()]);
    const emailOk = !!(configPortal?.resendApiKey && configPortal?.emailDe);
    return {
      encarregado: encarregadoPublico(enc),
      instituicao: inst ? { razaoSocial: inst.razaoSocial, cnpj: inst.cnpj } : null,
      retencao: [
        { categoria: 'conversas_ia', rotulo: 'Conversas com o assistente', prazo: `${ret.conversasIaDias} dias`, automatica: true },
        { categoria: 'notificacoes', rotulo: 'Notificações', prazo: `${ret.notificacoesDias} dias`, automatica: true },
        { categoria: 'trilha_ia', rotulo: 'Trilha técnica do assistente', prazo: `${ret.trilhaIaDias} dias`, automatica: true },
        ...CATEGORIAS_RETENCAO.map(c => ({ categoria: c.categoria, rotulo: c.rotulo, prazo: ret.prazosDescritivos[c.categoria], automatica: false }))
      ],
      ia: { disponivel: ia },
      limitesArquivo: {
        documentoBytes: Number(configPortal?.maxArquivoBytes) || null,
        fotoBytes: Number(configPortal?.fotoMaxBytes) || null,
        bannerBytes: Number(configPortal?.bannerMaxBytes) || null
      },
      email: { disponivel: emailOk }
    };
  }

  /** Grava um documento de configuração com controle de versão; auditoria `executar`. */
  async function gravarConfig(req, _id, valores, { acao, campos, motivo = null }) {
    const versao = lerVersao(req.body || {});
    const atual = await cfg().findOne({ _id });
    if ((atual ? atual.versao : 0) !== versao) throw new ErroPortal(409, 'conflito-versao');
    const t = agora();
    const eu = String(req.user._id);
    await auditoria.executar({
      acao, entidade: { tipo: 'configuracao', id: _id }, mudancas: auditoria.mudancas(atual || {}, valores, campos), motivo
    }, req, async () => {
      if (!atual) {
        await cfg().insertOne({ _id, ...valores, versao: 1, atualizadoEm: t, atualizadoPor: eu });
      } else {
        const r = await cfg().updateOne({ _id, versao }, { $set: { ...valores, atualizadoEm: t, atualizadoPor: eu }, $inc: { versao: 1 } });
        if (r.modifiedCount !== 1) throw new ErroPortal(409, 'conflito-versao');
      }
    });
    return cfg().findOne({ _id });
  }

  const comMeta = (doc, publico) => (doc ? { ...publico, versao: doc.versao, atualizadoEm: iso(doc.atualizadoEm) } : null);

  // ---------- rotas do usuário logado ----------
  aluno.get('/configuracoes/publicas', async (_req, res) => {
    res.json(await publicas());
  });

  aluno.get('/regulamento', async (req, res) => {
    const userId = String(req.user._id);
    const ctx = await acesso.contexto(req);
    const escopos = new Set(['geral', ...(await acesso.cursosDoAluno(userId)), ...ctx.cursosDocente]);
    const filtro = ctx.papel === 'admin' ? { status: 'publicado' } : { status: 'publicado', escopo: { $in: [...escopos] } };
    const docs = await regs().find(filtro).toArray();
    const cursosIds = docs.map(d => d.escopo).filter(e => e !== 'geral');
    const cursos = cursosIds.length ? await repo('cursos').find({ _id: { $in: cursosIds } }, { projection: { titulo: 1, ordem: 1 } }).toArray() : [];
    const titulos = new Map(cursos.map(c => [String(c._id), c]));
    docs.sort((a, b) => (a.escopo === 'geral' ? -1 : b.escopo === 'geral' ? 1 : (Number(titulos.get(a.escopo)?.ordem) || 0) - (Number(titulos.get(b.escopo)?.ordem) || 0)));
    res.json({
      itens: docs.map(d => ({
        id: String(d._id), escopo: d.escopo, cursoTitulo: d.escopo === 'geral' ? null : (titulos.get(d.escopo)?.titulo ?? null),
        titulo: d.titulo, edicao: d.edicao, publicadoEm: iso(d.publicadoEm), texto: d.texto,
        trechos: (d.trechos || []).map(t => ({ id: t.id, titulo: t.titulo, inicio: t.inicio, fim: t.fim }))
      }))
    });
  });

  // ---------- encarregado ----------
  admin.get('/configuracoes/encarregado', async (_req, res) => {
    const doc = await cfg().findOne({ _id: 'encarregado' });
    res.json({ encarregado: comMeta(doc, encarregadoPublico(doc) || { nome: null, email: null, telefone: null, canalUrl: null }), versao: doc?.versao ?? 0 });
  });

  admin.put('/configuracoes/encarregado', async (req, res) => {
    const corpo = req.body || {};
    const nome = lerTexto(corpo, 'nome', { min: 3, max: 120, obrigatorio: true });
    const emailBruto = lerTexto(corpo, 'email', { max: 254, obrigatorio: true });
    const email = validarEmail(emailBruto);
    if (!email) throw invalido('email', 'E-mail inválido.');
    const telBruto = lerTexto(corpo, 'telefone', { max: 30 });
    const telefone = telBruto ? (validarCelular(telBruto) || (/^[\d\s()+-]{8,20}$/.test(telBruto) ? telBruto.trim() : null)) : null;
    if (telBruto && !telefone) throw invalido('telefone', 'Telefone inválido.');
    const urlBruta = lerTexto(corpo, 'canalUrl', { max: 500 });
    const canalUrl = urlBruta ? validarUrlHttps(urlBruta) : null;
    if (urlBruta && !canalUrl) throw invalido('canalUrl', 'Use um endereço https.');
    const doc = await gravarConfig(req, 'encarregado', { nome, email, telefone, canalUrl }, { acao: 'config.encarregado_alterado', campos: ['nome', 'email', 'telefone', 'canalUrl'] });
    res.json({ encarregado: comMeta(doc, encarregadoPublico(doc)), versao: doc.versao });
  });

  // ---------- instituição ----------
  admin.get('/configuracoes/instituicao', async (_req, res) => {
    const doc = await cfg().findOne({ _id: 'instituicao' });
    res.json({ instituicao: comMeta(doc, instituicaoPublica(doc)), versao: doc?.versao ?? 0 });
  });

  admin.put('/configuracoes/instituicao', async (req, res) => {
    const corpo = req.body || {};
    const razaoSocial = lerTexto(corpo, 'razaoSocial', { min: 3, max: 160, obrigatorio: true });
    const nomeFantasia = lerTexto(corpo, 'nomeFantasia', { max: 160 });
    const cnpjBruto = lerTexto(corpo, 'cnpj', { max: 20, obrigatorio: true });
    const cnpj = validarCnpj(cnpjBruto);
    if (!cnpj) throw invalido('cnpj', 'CNPJ inválido. Confira os números.');
    const endereco = lerTexto(corpo, 'endereco', { max: 300, multilinha: true });
    if (endereco && endereco.split(/\r?\n/).length > 3) throw invalido('endereco', 'Use no máximo 3 linhas.');
    const atual = await cfg().findOne({ _id: 'instituicao' });
    let motivo = null;
    if (atual && instituicaoPublica(atual)) {
      motivo = lerTexto(corpo, 'motivo', { min: 10, max: 500, multilinha: true });
      if (!motivo) throw invalido('motivo', 'Informe o motivo da alteração (fica registrado na auditoria).');
    }
    const doc = await gravarConfig(req, 'instituicao', { razaoSocial, nomeFantasia, cnpj, endereco }, {
      acao: 'config.instituicao_alterada', campos: ['razaoSocial', 'nomeFantasia', 'cnpj', 'endereco'], motivo
    });
    res.json({ instituicao: comMeta(doc, instituicaoPublica(doc)), versao: doc.versao });
  });

  // ---------- retenção ----------
  admin.get('/configuracoes/retencao', async (_req, res) => {
    const doc = await cfg().findOne({ _id: 'retencao' });
    res.json({ retencao: retencaoEfetiva(doc), categorias: CATEGORIAS_RETENCAO, limites: LIMITES_RETENCAO, padrao: RETENCAO_PADRAO, salvo: !!doc, versao: doc?.versao ?? 0 });
  });

  admin.put('/configuracoes/retencao', async (req, res) => {
    const corpo = req.body || {};
    const valores = {};
    for (const k of Object.keys(RETENCAO_PADRAO)) {
      const [min, max] = LIMITES_RETENCAO[k];
      valores[k] = lerInteiro(corpo[k], { min, max, obrigatorio: true }, k);
    }
    const prazos = corpo.prazosDescritivos ?? {};
    if (typeof prazos !== 'object' || Array.isArray(prazos)) throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { prazosDescritivos: 'Formato inválido.' } });
    valores.prazosDescritivos = {};
    for (const c of CATEGORIAS_RETENCAO) {
      valores.prazosDescritivos[c.categoria] = lerTexto(prazos, c.categoria, { max: 200 });
    }
    const doc = await gravarConfig(req, 'retencao', valores, { acao: 'config.retencao_alterada', campos: ['conversasIaDias', 'notificacoesDias', 'trilhaIaDias', 'prazosDescritivos'] });
    res.json({ retencao: retencaoEfetiva(doc), versao: doc.versao });
  });

  admin.post('/configuracoes/retencao/reaplicar', async (_req, res) => {
    const ret = await retencao();
    async function reaplicar(colecao, campoBase, dias) {
      const docs = await repo(colecao).find({}, { projection: { [campoBase]: 1, expiraEm: 1 } }).limit(200000).toArray();
      let n = 0;
      const ops = [];
      for (const d of docs) {
        const base = d[campoBase];
        if (!(base instanceof Date)) continue;
        const novo = new Date(base.getTime() + dias * DIA_MS);
        if (d.expiraEm instanceof Date && d.expiraEm.getTime() === novo.getTime()) continue;
        ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { expiraEm: novo } } } });
        n++;
      }
      for (let i = 0; i < ops.length; i += 500) await repo(colecao).bulkWrite(ops.slice(i, i + 500), { ordered: false });
      return n;
    }
    const [conversas, notificacoes, trilha] = await Promise.all([
      reaplicar('conversas_ia', 'atualizadaEm', ret.conversasIaDias),
      reaplicar('notificacoes', 'criadaEm', ret.notificacoesDias),
      reaplicar('ia_trilha', 'em', ret.trilhaIaDias)
    ]);
    res.json({ conversas, notificacoes, trilha });
  });

  // ---------- regulamentos ----------
  async function cursoTitulo(escopo) {
    if (escopo === 'geral') return null;
    const c = await repo('cursos').findOne({ _id: escopo }, { projection: { titulo: 1 } });
    return c?.titulo ?? null;
  }

  admin.get('/regulamentos', async (_req, res) => {
    const docs = await regs().find({}, { projection: { trechos: 0 } }).sort({ criadoEm: -1 }).limit(500).toArray();
    const comTrechos = await regs().find({ status: { $in: ['publicado', 'arquivado'] } }, { projection: { trechos: 1 } }).toArray();
    const contagem = new Map(comTrechos.map(d => [String(d._id), Array.isArray(d.trechos) ? d.trechos.length : 0]));
    const cursosIds = [...new Set(docs.map(d => d.escopo).filter(e => e !== 'geral'))];
    const cursos = cursosIds.length ? await repo('cursos').find({ _id: { $in: cursosIds } }, { projection: { titulo: 1 } }).toArray() : [];
    const titulos = new Map(cursos.map(c => [String(c._id), c.titulo]));
    const ids = [...new Set(docs.map(d => d.publicadoPor).filter(Boolean))];
    const f = servicos.tentar('perfis.publicos');
    let nomes = new Map();
    if (typeof f === 'function' && ids.length) { try { nomes = await f(ids); } catch { nomes = new Map(); } }
    res.json({
      itens: docs.map(d => ({
        ...regulamentoDoAdmin({ ...d, trechos: new Array(contagem.get(String(d._id)) || 0) }, { cursoTitulo: d.escopo === 'geral' ? null : (titulos.get(d.escopo) ?? null) }),
        publicadoPorNome: d.publicadoPor ? (nomes.get(d.publicadoPor)?.nome ?? null) : null
      }))
    });
  });

  admin.post('/regulamentos', async (req, res) => {
    const corpo = req.body || {};
    if (typeof corpo.escopo !== 'string' || !corpo.escopo) throw invalido('escopo', 'Escolha o escopo.');
    const escopo = corpo.escopo;
    if (escopo !== 'geral') {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(escopo) || !(await repo('cursos').findOne({ _id: escopo }, { projection: { _id: 1 } }))) {
        throw invalido('escopo', 'Curso não encontrado.');
      }
    }
    const titulo = lerTexto(corpo, 'titulo', { min: 3, max: 140, obrigatorio: true });
    const texto = lerTexto(corpo, 'texto', { min: 1, max: TEXTO_MAX_REGULAMENTO, obrigatorio: true, multilinha: true });
    const t = agora();
    const eu = String(req.user._id);
    const doc = { escopo, titulo, edicao: null, status: 'rascunho', texto, trechos: [], publicadoEm: null, publicadoPor: null, versao: 1, criadoEm: t, criadoPor: eu, atualizadoEm: t };
    const r = await regs().insertOne(doc);
    doc._id = r.insertedId;
    await auditoria.registrar({ acao: 'regulamento.criado', entidade: { tipo: 'regulamento', id: String(r.insertedId) }, cursoId: escopo === 'geral' ? null : escopo }, req);
    res.status(201).json(regulamentoDoAdmin(doc, { cursoTitulo: await cursoTitulo(escopo) }));
  });

  admin.post('/regulamentos/previa', async (req, res) => {
    const texto = lerTexto(req.body || {}, 'texto', { min: 1, max: TEXTO_MAX_REGULAMENTO, obrigatorio: true, multilinha: true });
    res.json({ trechos: fatiar(texto).map(t => ({ titulo: t.titulo, tamanho: t.fim - t.inicio })) });
  });

  admin.put('/regulamentos/:id', async (req, res) => {
    const id = lerId(req.params.id);
    if (!id) throw new ErroPortal(404, null, 'Regulamento não encontrado.');
    const corpo = req.body || {};
    const titulo = lerTexto(corpo, 'titulo', { min: 3, max: 140, obrigatorio: true });
    const texto = lerTexto(corpo, 'texto', { min: 1, max: TEXTO_MAX_REGULAMENTO, obrigatorio: true, multilinha: true });
    const versao = lerInteiro(corpo.versao, { min: 1, obrigatorio: true }, 'versao');
    const doc = await regs().findOne({ _id: id });
    if (!doc) throw new ErroPortal(404, null, 'Regulamento não encontrado.');
    if (doc.status !== 'rascunho') throw new ErroPortal(409, 'transicao-invalida', 'Só um rascunho pode ser editado. Crie uma nova edição.');
    if (doc.versao !== versao) throw new ErroPortal(409, 'conflito-versao');
    const t = agora();
    const r = await regs().updateOne({ _id: id, versao, status: 'rascunho' }, { $set: { titulo, texto, atualizadoEm: t }, $inc: { versao: 1 } });
    if (r.modifiedCount !== 1) throw new ErroPortal(409, 'conflito-versao');
    await auditoria.registrar({ acao: 'regulamento.alterado', entidade: { tipo: 'regulamento', id: String(id) }, cursoId: doc.escopo === 'geral' ? null : doc.escopo }, req);
    const novo = await regs().findOne({ _id: id });
    res.json(regulamentoDoAdmin(novo, { cursoTitulo: await cursoTitulo(novo.escopo) }));
  });

  admin.post('/regulamentos/:id/publicar', async (req, res) => {
    const id = lerId(req.params.id);
    if (!id) throw new ErroPortal(404, null, 'Regulamento não encontrado.');
    const doc = await regs().findOne({ _id: id });
    if (!doc) throw new ErroPortal(404, null, 'Regulamento não encontrado.');
    if (doc.status !== 'rascunho') throw new ErroPortal(409, 'transicao-invalida', 'Esta edição já foi publicada.');
    const anteriores = await regs().find({ escopo: doc.escopo, status: { $in: ['publicado', 'arquivado'] } }, { projection: { edicao: 1, status: 1 } }).toArray();
    const edicao = anteriores.reduce((m, d) => Math.max(m, Number(d.edicao) || 0), 0) + 1;
    const trechos = fatiar(doc.texto, { edicao });
    const t = agora();
    const eu = String(req.user._id);
    await auditoria.executar({
      acao: 'regulamento.publicado', entidade: { tipo: 'regulamento', id: String(id) }, cursoId: doc.escopo === 'geral' ? null : doc.escopo,
      extra: { edicao, trechos: trechos.length, escopo: doc.escopo }
    }, req, async () => {
      const r = await regs().updateOne({ _id: id, status: 'rascunho', versao: doc.versao }, {
        $set: { status: 'publicado', edicao, trechos, publicadoEm: t, publicadoPor: eu, atualizadoEm: t }, $inc: { versao: 1 }
      });
      if (r.modifiedCount !== 1) throw new ErroPortal(409, 'conflito-versao');
      await regs().updateMany({ escopo: doc.escopo, status: 'publicado', _id: { $ne: id } }, { $set: { status: 'arquivado', atualizadoEm: t }, $inc: { versao: 1 } });
    });
    res.json({ id: String(id), edicao, trechos: trechos.map(x => ({ id: x.id, titulo: x.titulo, inicio: x.inicio, fim: x.fim })) });
  });

  // ---------- painel (D-54 c) ----------
  const painel = {
    bloco: 'sistema',
    chaves: ['instituicaoPendente'],
    papeis: ['admin'],
    async contar() {
      return { instituicaoPendente: !(await instituicao()) };
    }
  };

  /** Relatório `retencao` (admin): registros das categorias manuais que passaram do prazo — sem prazo numérico, não há linha inventada. */
  const relatorio = {
    id: 'retencao',
    titulo: 'Retenção',
    papeis: ['admin'],
    filtros: [],
    colunas: [
      { chave: 'categoria', rotulo: 'Categoria', tipo: 'texto' },
      { chave: 'prazo', rotulo: 'Prazo descritivo', tipo: 'texto' },
      { chave: 'situacao', rotulo: 'Situação', tipo: 'texto' }
    ],
    async consultar() {
      const ret = await retencao();
      return CATEGORIAS_RETENCAO.map(c => ({
        categoria: c.rotulo,
        prazo: ret.prazosDescritivos[c.categoria] ?? null,
        situacao: ret.prazosDescritivos[c.categoria] ? 'Revisão manual pela coordenação' : 'A definir'
      }));
    }
  };

  return { aluno, admin, servicosPublicos: { publicas, instituicao, retencao }, painel, relatorio };
}

export default async function montar(ctx) {
  const { comum, rotas, servicos } = ctx;
  comum.registrarIndices(INDICES_CONFIGURACOES);
  const r = criarRotasConfiguracoes({
    repo: comum.repo, servicos, acesso: comum.acesso, auditoria: comum.auditoria, configPortal: comum.configPortal, agora: comum.agora
  });
  rotas.aluno.use(r.aluno);
  rotas.admin.use(r.admin);
  servicos.registrar('configuracoes.publicas', r.servicosPublicos.publicas);
  servicos.registrar('configuracoes.instituicao', r.servicosPublicos.instituicao);
  servicos.registrar('configuracoes.retencao', r.servicosPublicos.retencao);
  servicos.adicionar('painel', r.painel);
  servicos.adicionar('relatorio', r.relatorio);
}

