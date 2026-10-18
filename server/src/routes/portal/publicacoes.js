// =============================================================
// COMPLEXO DMC · Portal — Publicações (vídeo · texto · link · PDF)
// PORTAL-API §6.11.1 · §3.3 (F7) · §3.4 (auditoria F7) · §3.5
// (publicacao.nova, sob demanda) · índice §8.5 (F7) · dono: F7.
//
//   aluno     GET  /portal/publicacoes                 (?tipo&cursoId&q&pagina)
//             GET  /portal/publicacoes/:id             (+ corpo; marca a notificação como lida)
//             GET  /portal/publicacoes/:id/arquivo     (PDF, sempre attachment)
//   professor GET  /portal/professor/publicacoes       (?status&pagina)
//             GET  /portal/professor/publicacoes/:id
//             POST /portal/professor/publicacoes       (201 rascunho)
//             PUT  /portal/professor/publicacoes/:id   (parcial + versao)
//             POST /portal/professor/publicacoes/:id/arquivo  (PDF cru ≤ 4 MB)
//             POST /portal/professor/publicacoes/:id/publicar · …/arquivar
//             DELETE /portal/professor/publicacoes/:id (autor: só rascunho · admin)
//
// Regra de público (a MESMA no POST, no PUT, no publicar e no arquivar):
// `portal/comunicacao/publico.js`. Vídeo sai SEMPRE por normalizarVideo
// (F1a, P1) — nunca a URL crua para o aluno; link só https.
// Grupos: busca (publicacoes), notificacaoSobDemanda (publicacao.nova).
// =============================================================
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { ErroPortal } from '../../portal/erros.js';
import { lerTexto, lerEnum, lerPagina, lerBooleano, lerInteiro, regexBusca, validarUrlHttps, ID_LEGADO_RE } from '../../portal/validacao.js';
import { papelDe, ROTULOS_PAPEL } from '../../portal/papeis.js';
import { lerCorpoBinario } from '../../portal/arquivos.js';
import { normalizarVideo } from '../../portal/estudos/video.js';
import {
  INDICES_PUBLICACOES, lerPublico, conferirPublico, escopoDoLeitor, filtroDeVisibilidade, visivelPara, descreverPublicos, DIA_MS
} from '../../portal/comunicacao/publico.js';

export const TIPOS_PUBLICACAO = Object.freeze(['video', 'texto', 'link', 'pdf']);
export const STATUS_PUBLICACAO = Object.freeze(['rascunho', 'publicada', 'arquivada']);
export const ROTULOS_TIPO = Object.freeze({ video: 'Vídeo', texto: 'Texto', link: 'Link', pdf: 'PDF' });
const JANELA_NOVA_MS = 30 * DIA_MS;
const MAX_PDF_PADRAO = 4 * 1024 * 1024;

const naoEncontrada = () => new ErroPortal(404, null, 'Não encontramos esta publicação.');
const iso = d => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : (d ? new Date(d).toISOString() : null));
const idDe = v => (typeof v === 'string' && /^[a-f0-9]{24}$/.test(v) ? new ObjectId(v) : null);
const invalido = (campos, mensagem = 'Confira os campos destacados.') => new ErroPortal(400, 'validacao', mensagem, { campos });
const chaveNotificacao = id => `publicacao:${id}`;

/** Vídeo aceito na publicação: YouTube ou Vimeo (o card incorpora). → url normalizável | erro 400. */
export function lerVideoUrl(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw new ErroPortal(400, 'formato-invalido', 'Formato inválido.', { campos: { videoUrl: 'Formato inválido.' } });
  const s = v.trim();
  const n = s.length <= 500 ? normalizarVideo(s) : null;
  if (!n || (n.provedor !== 'youtube' && n.provedor !== 'vimeo')) throw invalido({ videoUrl: 'Use um link do YouTube ou do Vimeo.' });
  return s;
}

/** Link externo da publicação: só https. */
export function lerUrl(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw new ErroPortal(400, 'formato-invalido', 'Formato inválido.', { campos: { url: 'Formato inválido.' } });
  const u = validarUrlHttps(v);
  if (!u) throw invalido({ url: 'Use um endereço que comece com https://.' });
  return u;
}

/** Campos exigidos para publicar, por tipo. → objeto de campos com erro (vazio = ok). */
export function faltasParaPublicar(doc) {
  const campos = {};
  if (!doc.titulo || [...doc.titulo].length < 3) campos.titulo = 'Informe o título (3 a 140 caracteres).';
  if (doc.tipo === 'texto' && !doc.corpo) campos.corpo = 'Escreva o texto da publicação.';
  if (doc.tipo === 'video' && !doc.videoUrl) campos.videoUrl = 'Informe o link do vídeo (YouTube ou Vimeo).';
  if (doc.tipo === 'link' && !doc.url) campos.url = 'Informe o endereço (https://).';
  if (doc.tipo === 'pdf' && !doc.arquivoId) campos.arquivo = 'Envie o PDF (até 4 MB).';
  return campos;
}

/** Nome do autor para o aluno: "Nome · Professora/Professor" ou "Coordenação". */
function autorPublico(autor) {
  if (!autor) return { nome: null, papel: null };
  if (autor.papel === 'admin') return { nome: 'Coordenação', papel: 'admin' };
  return { nome: autor.nome || null, papel: autor.papel || null };
}

/**
 * Fábrica das rotas (testável com falsos).
 * @returns {{ aluno: Router, professor: Router, busca: object, sobDemanda: object }}
 */
export function criarRotasPublicacoes({
  repo, servicos, acesso, auditoria, arquivos = null, maxPdfBytes = MAX_PDF_PADRAO, agora = () => new Date(), log = console
} = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarRotasPublicacoes: informe repo.');
  if (!servicos) throw new TypeError('criarRotasPublicacoes: informe servicos.');
  if (!acesso) throw new TypeError('criarRotasPublicacoes: informe acesso.');
  if (!auditoria) throw new TypeError('criarRotasPublicacoes: informe auditoria.');
  const col = () => repo('publicacoes');
  const aluno = Router();
  const professor = Router();
  const deps = { acesso, servicos, repo };

  const avisar = (texto, err) => { try { (log.warn || log.error).call(log, `[portal] publicações: ${texto}${err ? ` (${err.message})` : ''}`); } catch { /* nada */ } };

  async function naoLidas(userId, ids) {
    if (!ids.length) return new Set();
    try {
      const docs = await repo('notificacoes').find({ userId, chave: { $in: ids.map(chaveNotificacao) }, lida: false }, { projection: { chave: 1 } }).toArray();
      return new Set(docs.map(d => String(d.chave).slice('publicacao:'.length)));
    } catch (err) {
      avisar('notificações indisponíveis para o "nova"', err);
      return new Set();
    }
  }

  function itemDoAluno(d, publicoDe, novas) {
    const p = publicoDe(d);
    const id = String(d._id);
    return {
      id,
      titulo: d.titulo,
      resumo: d.resumo ?? null,
      tipo: d.tipo,
      video: d.tipo === 'video' && d.videoUrl ? normalizarVideo(d.videoUrl) : null,
      url: d.tipo === 'link' ? (d.url ?? null) : null,
      temPdf: d.tipo === 'pdf' && !!d.arquivoId,
      publico: { tipo: p.tipo, cursos: p.cursos, turmas: p.turmas },
      autor: autorPublico(d.autor),
      publicadaEm: iso(d.publicadaEm),
      fixada: d.fixada === true,
      nova: novas.has(id)
    };
  }

  async function itemDaEquipe(req, d, publicoDe) {
    const admin = papelDe(req.user) === 'admin';
    const autor = String(d.autor?.userId) === String(req.user._id);
    return {
      id: String(d._id),
      titulo: d.titulo,
      resumo: d.resumo ?? null,
      tipo: d.tipo,
      corpo: d.corpo ?? null,
      videoUrl: d.videoUrl ?? null,
      video: d.videoUrl ? normalizarVideo(d.videoUrl) : null,
      url: d.url ?? null,
      temPdf: !!d.arquivoId,
      publico: publicoDe(d),
      autor: { userId: d.autor?.userId ?? null, nome: d.autor?.nome ?? null, papel: d.autor?.papel ?? null, rotuloPapel: ROTULOS_PAPEL[d.autor?.papel] || null },
      status: d.status,
      fixada: d.fixada === true,
      publicadaEm: iso(d.publicadaEm),
      criadoEm: iso(d.criadoEm),
      atualizadoEm: iso(d.atualizadoEm),
      versao: d.versao,
      podeEditar: admin || autor
    };
  }

  // ========================= aluno (logado) =========================
  aluno.get('/publicacoes', async (req, res) => {
    const userId = String(req.user._id);
    const escopo = await escopoDoLeitor(req, deps);
    const f = { status: 'publicada' };
    const vis = filtroDeVisibilidade(escopo);
    const e = [];
    if (vis) e.push(vis);
    const tipo = lerEnum(req.query.tipo || null, TIPOS_PUBLICACAO, 'tipo');
    if (tipo) f.tipo = tipo;
    if (req.query.cursoId !== undefined && req.query.cursoId !== '') {
      if (typeof req.query.cursoId !== 'string' || !ID_LEGADO_RE.test(req.query.cursoId)) throw invalido({ cursoId: 'Curso inválido.' });
      f['publico.cursoIds'] = req.query.cursoId;
    }
    if (req.query.q !== undefined && req.query.q !== '') {
      const termos = regexBusca(typeof req.query.q === 'string' ? req.query.q : null);
      if (!termos) throw invalido({ q: 'Use de 2 a 80 caracteres.' });
      for (const re of termos) e.push({ $or: [{ titulo: { $regex: re.source, $options: 'i' } }, { resumo: { $regex: re.source, $options: 'i' } }] });
    }
    if (e.length) f.$and = e;
    const { pagina, porPagina, pular } = lerPagina(req.query, { porPaginaPadrao: 24, max: 60 });
    const [total, docs] = await Promise.all([
      col().countDocuments(f),
      col().find(f, { projection: { corpo: 0 } }).sort({ fixada: -1, publicadaEm: -1 }).skip(pular).limit(porPagina).toArray()
    ]);
    const publicoDe = await descreverPublicos(docs, deps);
    const novas = await naoLidas(userId, docs.map(d => String(d._id)));
    res.json({ itens: docs.map(d => itemDoAluno(d, publicoDe, novas)), pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) });
  });

  /** Publicação que o requisitante pode abrir (publicada no público, ou autor/admin). */
  async function abrivel(req) {
    const _id = idDe(req.params.id);
    if (!_id) throw naoEncontrada();
    const d = await col().findOne({ _id });
    if (!d) throw naoEncontrada();
    const papel = papelDe(req.user);
    const autor = String(d.autor?.userId) === String(req.user._id);
    if (papel === 'admin' || (autor && (papel === 'professor'))) return d;
    if (d.status !== 'publicada') throw naoEncontrada();
    const escopo = await escopoDoLeitor(req, deps);
    if (!visivelPara(d.publico, escopo)) throw naoEncontrada();
    return d;
  }

  async function marcarLida(userId, id) {
    try {
      await repo('notificacoes').updateMany({ userId, chave: chaveNotificacao(id), lida: false }, { $set: { lida: true, lidaEm: agora() } });
    } catch (err) {
      avisar('não marcou a notificação como lida', err);
    }
  }

  aluno.get('/publicacoes/:id', async (req, res) => {
    const d = await abrivel(req);
    const publicoDe = await descreverPublicos([d], deps);
    const id = String(d._id);
    await marcarLida(String(req.user._id), id);
    res.json({ ...itemDoAluno(d, publicoDe, new Set()), corpo: d.tipo === 'texto' ? (d.corpo ?? null) : (d.corpo ?? null) });
  });

  aluno.get('/publicacoes/:id/arquivo', async (req, res) => {
    const d = await abrivel(req);
    if (!d.arquivoId || !arquivos) throw naoEncontrada();
    const arq = await arquivos.ler(d.arquivoId, { contexto: 'publicacao_pdf', 'ref.entidadeId': String(d._id) });
    if (!arq) throw naoEncontrada();
    await marcarLida(String(req.user._id), String(d._id));
    arquivos.enviar(res, arq, { nome: d.titulo || 'publicacao' });
  });

  // ========================= equipe (professor · admin) =========================
  async function filtroDaEquipe(req) {
    if (papelDe(req.user) === 'admin') return {};
    const escopo = await escopoDoLeitor(req, deps);
    const vis = filtroDeVisibilidade(escopo);
    return { $or: [{ 'autor.userId': String(req.user._id) }, { status: 'publicada', ...(vis || {}) }] };
  }

  professor.get('/publicacoes', async (req, res) => {
    const f = await filtroDaEquipe(req);
    const status = lerEnum(req.query.status || null, STATUS_PUBLICACAO, 'status');
    if (status) f.status = status;
    const { pagina, porPagina, pular } = lerPagina(req.query, { porPaginaPadrao: 25, max: 100 });
    const [total, docs] = await Promise.all([
      col().countDocuments(f),
      col().find(f, { projection: { corpo: 0 } }).sort({ atualizadoEm: -1 }).skip(pular).limit(porPagina).toArray()
    ]);
    const publicoDe = await descreverPublicos(docs, deps);
    const itens = [];
    for (const d of docs) itens.push(await itemDaEquipe(req, d, publicoDe));
    res.json({ itens, pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) });
  });

  /** Publicação editável: autor (com papel de equipe — o agregador já exige) ou admin. Outra → 404. */
  async function editavel(req) {
    const _id = idDe(req.params.id);
    if (!_id) throw naoEncontrada();
    const d = await col().findOne({ _id });
    if (!d) throw naoEncontrada();
    if (papelDe(req.user) === 'admin') return d;
    if (String(d.autor?.userId) !== String(req.user._id)) throw naoEncontrada();
    return d;
  }

  professor.get('/publicacoes/:id', async (req, res) => {
    const _id = idDe(req.params.id);
    if (!_id) throw naoEncontrada();
    const f = { _id, ...(await filtroDaEquipe(req)) };
    const d = await col().findOne(f);
    if (!d) throw naoEncontrada();
    const publicoDe = await descreverPublicos([d], deps);
    res.json({ publicacao: await itemDaEquipe(req, d, publicoDe) });
  });

  function lerCampos(corpo, { parcial }) {
    const out = {};
    const tem = k => Object.hasOwn(corpo, k);
    if (!parcial || tem('titulo')) out.titulo = lerTexto(corpo, 'titulo', { min: 3, max: 140, obrigatorio: true });
    if (!parcial || tem('tipo')) out.tipo = lerEnum(corpo.tipo, TIPOS_PUBLICACAO, 'tipo', { obrigatorio: true });
    if (!parcial || tem('resumo')) out.resumo = lerTexto(corpo, 'resumo', { max: 280 });
    if (!parcial || tem('corpo')) out.corpo = lerTexto(corpo, 'corpo', { max: 20000, multilinha: true });
    if (!parcial || tem('videoUrl')) out.videoUrl = lerVideoUrl(corpo.videoUrl);
    if (!parcial || tem('url')) out.url = lerUrl(corpo.url);
    if (!parcial || tem('fixada')) out.fixada = lerBooleano(corpo.fixada ?? false, 'fixada') === true;
    return out;
  }

  professor.post('/publicacoes', async (req, res) => {
    const corpo = req.body && typeof req.body === 'object' ? req.body : {};
    const campos = lerCampos(corpo, { parcial: false });
    const publico = await conferirPublico(req, lerPublico(corpo.publico), deps);
    const t = agora();
    const doc = {
      ...campos, arquivoId: null, publico,
      autor: { userId: String(req.user._id), nome: req.user.nome || null, papel: papelDe(req.user) },
      status: 'rascunho', publicadaEm: null, versao: 1, criadoEm: t, atualizadoEm: t
    };
    const r = await col().insertOne(doc);
    doc._id = r.insertedId;
    await auditoria.registrar({ acao: 'publicacao.criada', entidade: { tipo: 'publicacao', id: String(doc._id) }, extra: { tipo: doc.tipo, publico: publico.tipo } }, req);
    const publicoDe = await descreverPublicos([doc], deps);
    res.status(201).json({ publicacao: await itemDaEquipe(req, doc, publicoDe) });
  });

  async function gravar(req, d, set, acao, extra = {}) {
    const t = agora();
    const r = await col().updateOne({ _id: d._id, versao: d.versao }, { $set: { ...set, atualizadoEm: t }, $inc: { versao: 1 } });
    if (!r.modifiedCount) throw new ErroPortal(409, 'conflito-versao');
    const novo = { ...d, ...set, atualizadoEm: t, versao: d.versao + 1 };
    await auditoria.registrar({ acao, entidade: { tipo: 'publicacao', id: String(d._id) }, ...extra }, req);
    return novo;
  }

  professor.put('/publicacoes/:id', async (req, res) => {
    const d = await editavel(req);
    const corpo = req.body && typeof req.body === 'object' ? req.body : {};
    const versao = lerInteiro(corpo.versao, { min: 1, obrigatorio: true }, 'versao');
    if (versao !== d.versao) throw new ErroPortal(409, 'conflito-versao');
    const set = lerCampos(corpo, { parcial: true });
    const admin = papelDe(req.user) === 'admin';
    if (Object.hasOwn(corpo, 'publico')) set.publico = await conferirPublico(req, lerPublico(corpo.publico), deps);
    else if (!admin || d.status === 'publicada') {
      // Edição de publicação já publicada (ou de autor sem docência): revalida o público gravado.
      await conferirPublico(req, { ...d.publico, turmaIds: (d.publico?.turmaIds || []).map(String) }, deps);
    }
    if (d.status === 'publicada') {
      const faltas = faltasParaPublicar({ ...d, ...set });
      if (Object.keys(faltas).length) throw invalido(faltas);
    }
    const mudados = Object.keys(set).filter(k => JSON.stringify(set[k]) !== JSON.stringify(d[k]));
    const novo = await gravar(req, d, set, 'publicacao.alterada', { mudancas: mudados.map(campo => ({ campo })) });
    const publicoDe = await descreverPublicos([novo], deps);
    res.json({ publicacao: await itemDaEquipe(req, novo, publicoDe) });
  });

  professor.post('/publicacoes/:id/arquivo', ...lerCorpoBinario({ limiteBytes: maxPdfBytes, tipos: ['pdf'] }), async (req, res) => {
    const d = await editavel(req);
    if (!arquivos) throw new ErroPortal(503, 'servico-indisponivel');
    if (papelDe(req.user) !== 'admin') await conferirPublico(req, { ...d.publico, turmaIds: (d.publico?.turmaIds || []).map(String) }, deps);
    const salvo = await arquivos.salvar({
      contexto: 'publicacao_pdf', donoUserId: d.autor?.userId ?? null, ref: { entidadeId: String(d._id) },
      buf: req.arquivo.buf, tipo: 'pdf', nomeDownload: d.titulo || 'publicacao', por: String(req.user._id)
    });
    try {
      await gravar(req, d, { arquivoId: new ObjectId(salvo.id) }, 'publicacao.alterada', { mudancas: [{ campo: 'arquivo' }] });
    } catch (err) {
      await arquivos.apagar(salvo.id).catch(() => {});
      throw err;
    }
    if (d.arquivoId) await arquivos.apagar(d.arquivoId).catch(() => {});
    res.json({ temPdf: true });
  });

  professor.post('/publicacoes/:id/publicar', async (req, res) => {
    const d = await editavel(req);
    if (d.status === 'publicada') {
      const publicoDe = await descreverPublicos([d], deps);
      return res.json({ publicacao: await itemDaEquipe(req, d, publicoDe) });
    }
    const faltas = faltasParaPublicar(d);
    if (Object.keys(faltas).length) throw invalido(faltas, 'Faltam informações para publicar.');
    await conferirPublico(req, { ...d.publico, turmaIds: (d.publico?.turmaIds || []).map(String) }, deps);
    const novo = await gravar(req, d, { status: 'publicada', publicadaEm: d.publicadaEm || agora() }, 'publicacao.publicada', { extra: { publico: d.publico?.tipo ?? null } });
    const publicoDe = await descreverPublicos([novo], deps);
    res.json({ publicacao: await itemDaEquipe(req, novo, publicoDe) });
  });

  professor.post('/publicacoes/:id/arquivar', async (req, res) => {
    const d = await editavel(req);
    if (papelDe(req.user) !== 'admin') await conferirPublico(req, { ...d.publico, turmaIds: (d.publico?.turmaIds || []).map(String) }, deps);
    const novo = d.status === 'arquivada' ? d : await gravar(req, d, { status: 'arquivada', fixada: false }, 'publicacao.arquivada');
    const publicoDe = await descreverPublicos([novo], deps);
    res.json({ publicacao: await itemDaEquipe(req, novo, publicoDe) });
  });

  professor.delete('/publicacoes/:id', async (req, res) => {
    const d = await editavel(req);
    if (papelDe(req.user) !== 'admin' && d.status !== 'rascunho') {
      throw new ErroPortal(409, null, 'Só rascunhos podem ser removidos. Arquive a publicação.');
    }
    const r = await col().deleteOne({ _id: d._id, versao: d.versao });
    if (!r.deletedCount) throw new ErroPortal(409, 'conflito-versao');
    if (d.arquivoId && arquivos) await arquivos.apagar(d.arquivoId).catch(() => {});
    await auditoria.registrar({ acao: 'publicacao.removida', entidade: { tipo: 'publicacao', id: String(d._id) }, extra: { status: d.status } }, req);
    res.json({ ok: true });
  });

  // ========================= grupos =========================
  const busca = {
    tipo: 'publicacoes',
    papeis: ['aluno', 'professor', 'admin'],
    async buscar(req, termos, { limite = 5, pular = 0 } = {}) {
      const escopo = await escopoDoLeitor(req, deps);
      const vis = filtroDeVisibilidade(escopo);
      const e = termos.map(re => ({ $or: [{ titulo: { $regex: re.source, $options: 'i' } }, { resumo: { $regex: re.source, $options: 'i' } }] }));
      if (vis) e.push(vis);
      const docs = await col().find({ status: 'publicada', $and: e }, { projection: { titulo: 1, tipo: 1, publicadaEm: 1 } })
        .sort({ publicadaEm: -1 }).skip(pular).limit(limite + 1).toArray();
      return {
        itens: docs.slice(0, limite).map(d => ({
          tipo: 'publicacoes', id: String(d._id), titulo: d.titulo,
          contexto: `${ROTULOS_TIPO[d.tipo] || 'Publicação'}`, href: `publicacao.html?id=${String(d._id)}`, bloqueado: false
        })),
        temMais: docs.length > limite
      };
    }
  };

  const sobDemanda = {
    tipo: 'publicacao.nova',
    async gerar(userId, { agora: momento, emitir }) {
      const _id = idDe(String(userId));
      if (!_id) return;
      const user = await repo('users').findOne({ _id }, { projection: { senhaHash: 0 } });
      if (!user || user.desativadoEm) return;
      const req = { user };
      const escopo = await escopoDoLeitor(req, deps);
      const vis = filtroDeVisibilidade(escopo);
      const desde = Math.max(momento.getTime() - JANELA_NOVA_MS, user.createdAt ? new Date(user.createdAt).getTime() : 0);
      const f = { status: 'publicada', publicadaEm: { $gte: new Date(desde) }, 'autor.userId': { $ne: String(userId) }, ...(vis || {}) };
      const docs = await col().find(f, { projection: { titulo: 1 } }).sort({ publicadaEm: -1 }).limit(50).toArray();
      for (const d of docs) {
        const id = String(d._id);
        await emitir({
          userIds: [String(userId)], tipo: 'publicacao.nova', titulo: 'Nova publicação',
          texto: d.titulo, link: `publicacao.html?id=${id}`, entidade: { tipo: 'publicacao', id }, chave: chaveNotificacao(id)
        });
      }
    }
  };

  return { aluno, professor, busca, sobDemanda };
}

export default async function montar(ctx) {
  const { comum, rotas, servicos } = ctx;
  comum.registrarIndices(INDICES_PUBLICACOES);
  const r = criarRotasPublicacoes({
    repo: comum.repo, servicos, acesso: comum.acesso, auditoria: comum.auditoria, arquivos: comum.arquivos,
    maxPdfBytes: comum.configPortal?.maxArquivoBytes || MAX_PDF_PADRAO, agora: comum.agora, log: comum.log
  });
  rotas.aluno.use(r.aluno);
  rotas.professor.use(r.professor);
  servicos.adicionar('busca', r.busca);
  servicos.adicionar('notificacaoSobDemanda', r.sobDemanda);
}
