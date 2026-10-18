// =============================================================
// COMPLEXO DMC · Portal — Banners (Faixa do topo · Destaque no Início)
// PORTAL-API §6.11.2 · §3.3 (F7) · §4.12 (imagem pública) · D-09, D-28 · dono: F7.
//
//   publico GET  /portal/banners/imagens/:arquivo     (imagem; public, immutable)
//   aluno   GET  /portal/banners?local=topo|inicio    (vigentes agora, papel e público; por ordem)
//   admin   GET|POST /portal/admin/banners · PUT|DELETE /portal/admin/banners/:id
//           POST|DELETE /portal/admin/banners/:id/imagem  (JPG/PNG/WebP ≤ 1 MB, sem metadados)
//
// Vigência decidida no SERVIDOR (`inicioEm ≤ agora < fimEm` e `ativo`);
// período ≤ 366 dias. Público pela mesma regra das publicações
// (`portal/comunicacao/publico.js`), mais os papéis. A faixa do topo é só
// texto (≤ 90 caracteres) e sem imagem. A imagem é decorativa por padrão;
// quando a coordenação descreve a imagem (`imagemAlt`), o front usa a
// descrição como texto alternativo.
// O banner "Conheça o novo portal" é do front (não existe no banco).
// =============================================================
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { randomBytes } from 'node:crypto';
import { ErroPortal } from '../../portal/erros.js';
import { lerTexto, lerEnum, lerInteiro, lerBooleano } from '../../portal/validacao.js';
import { papelDe } from '../../portal/papeis.js';
import { lerCorpoBinario, removerMetadadosImagem } from '../../portal/arquivos.js';
import {
  INDICES_BANNERS, lerPublico, conferirPublico, escopoDoLeitor, visivelPara, descreverPublicos, lerLinkBanner,
  estadoDoBanner, DIA_MS, VIGENCIA_MAX_DIAS
} from '../../portal/comunicacao/publico.js';

export const LOCAIS_BANNER = Object.freeze(['topo', 'inicio']);
export const LIMITE_TEXTO_TOPO = 90;
export const BANNER_ARQUIVO_RE = /^ban-[a-f0-9]{12}\.(jpg|png|webp)$/;
const MAX_IMAGEM_PADRAO = 1024 * 1024;
const BASE_IMAGEM = '/api/portal/banners/imagens/';

const naoEncontrado = () => new ErroPortal(404, null, 'Não encontramos este banner.');
const invalido = (campos, mensagem = 'Confira os campos destacados.') => new ErroPortal(400, 'validacao', mensagem, { campos });
const idDe = v => (typeof v === 'string' && /^[a-f0-9]{24}$/.test(v) ? new ObjectId(v) : null);
const iso = d => (d ? new Date(d).toISOString() : null);

/** Data/hora ISO 8601 (ou 'AAAA-MM-DD', início do dia em São Paulo). → Date | erro 400. */
export function lerInstante(v, campo, { fimDoDia = false } = {}) {
  if (typeof v !== 'string' || !v.trim()) throw invalido({ [campo]: 'Informe a data.' });
  const s = v.trim();
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(`${s}T${fimDoDia ? '23:59:59.999' : '00:00:00.000'}-03:00`);
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) d = new Date(s);
  else throw invalido({ [campo]: 'Data inválida.' });
  if (Number.isNaN(d.getTime())) throw invalido({ [campo]: 'Data inválida.' });
  return d;
}

/** Valida o corpo do banner (criação: completo; edição: parcial sobre o atual). */
export function lerBanner(corpo, atual = null) {
  const tem = k => Object.hasOwn(corpo, k);
  const base = atual || {};
  const out = {};
  const local = !atual || tem('local') ? lerEnum(corpo.local, LOCAIS_BANNER, 'local', { obrigatorio: true }) : base.local;
  if (!atual || tem('local')) out.local = local;
  if (!atual || tem('titulo')) out.titulo = lerTexto(corpo, 'titulo', { min: 3, max: 80, obrigatorio: true });
  if (!atual || tem('texto') || tem('local')) {
    const max = local === 'topo' ? LIMITE_TEXTO_TOPO : 160;
    const fonte = tem('texto') ? corpo : { texto: base.texto ?? null };
    out.texto = lerTexto(fonte, 'texto', { max, obrigatorio: local === 'topo' });
  }
  if (!atual || tem('link')) {
    const l = corpo.link;
    if (l === undefined || l === null || l === '') out.link = null;
    else {
      const bruto = typeof l === 'string' ? { url: l } : l;
      if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto) || typeof bruto.url !== 'string') {
        throw new ErroPortal(400, 'formato-invalido', 'Formato inválido.', { campos: { link: 'Formato inválido.' } });
      }
      const url = lerLinkBanner(bruto.url);
      if (!url) throw invalido({ link: 'Use um caminho da plataforma (ex.: tutoriais.html) ou um endereço https://.' });
      const rotulo = lerTexto(bruto, 'rotulo', { min: 2, max: 40 }) || 'Saiba mais';
      out.link = { url, rotulo };
    }
  }
  if (!atual || tem('imagemAlt')) out.imagemAlt = lerTexto(corpo, 'imagemAlt', { max: 140 });
  const inicioEm = !atual || tem('inicioEm') ? lerInstante(corpo.inicioEm, 'inicioEm') : new Date(base.inicioEm);
  const fimEm = !atual || tem('fimEm') ? lerInstante(corpo.fimEm, 'fimEm', { fimDoDia: true }) : new Date(base.fimEm);
  if (!atual || tem('inicioEm') || tem('fimEm')) {
    if (fimEm.getTime() <= inicioEm.getTime()) throw invalido({ fimEm: 'O fim precisa ser depois do início.' });
    if (fimEm.getTime() - inicioEm.getTime() > VIGENCIA_MAX_DIAS * DIA_MS) throw invalido({ fimEm: `O período vai até ${VIGENCIA_MAX_DIAS} dias.` });
    out.inicioEm = inicioEm;
    out.fimEm = fimEm;
  }
  if (!atual || tem('ordem')) out.ordem = lerInteiro(corpo.ordem ?? 0, { min: 0, max: 999 }, 'ordem') ?? 0;
  if (!atual || tem('ativo')) {
    const a = lerBooleano(corpo.ativo ?? true, 'ativo');
    out.ativo = a !== false;
  }
  return out;
}

/** URL pública da imagem (ou null). */
export const imagemUrlDe = b => (b?.imagem?.arquivo ? `${BASE_IMAGEM}${b.imagem.arquivo}` : null);

/**
 * Fábrica das rotas (testável com falsos).
 * @returns {{ publico: Router, aluno: Router, admin: Router }}
 */
export function criarRotasBanners({
  repo, servicos, acesso, auditoria, arquivos = null, maxImagemBytes = MAX_IMAGEM_PADRAO, agora = () => new Date(), log = console
} = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarRotasBanners: informe repo.');
  if (!servicos) throw new TypeError('criarRotasBanners: informe servicos.');
  if (!acesso) throw new TypeError('criarRotasBanners: informe acesso.');
  if (!auditoria) throw new TypeError('criarRotasBanners: informe auditoria.');
  const col = () => repo('banners');
  const deps = { acesso, servicos, repo };
  const publico = Router();
  const aluno = Router();
  const admin = Router();
  void log;

  // ---------- público: imagem ----------
  publico.get('/banners/imagens/:arquivo', async (req, res) => {
    const nome = String(req.params.arquivo || '');
    if (!BANNER_ARQUIVO_RE.test(nome) || !arquivos) throw new ErroPortal(404, null, 'Imagem não encontrada.');
    const b = await col().findOne({ 'imagem.arquivo': nome }, { projection: { imagem: 1 } });
    if (!b?.imagem?.arquivoId) throw new ErroPortal(404, null, 'Imagem não encontrada.');
    const arq = await arquivos.ler(b.imagem.arquivoId, { contexto: 'banner' });
    if (!arq) throw new ErroPortal(404, null, 'Imagem não encontrada.');
    arquivos.enviar(res, arq, { nome, inline: true, publico: true });
  });

  // ---------- logado: vigentes ----------
  aluno.get('/banners', async (req, res) => {
    const local = lerEnum(req.query.local || null, LOCAIS_BANNER, 'local');
    const t = agora();
    const f = { ativo: true, inicioEm: { $lte: t }, fimEm: { $gt: t } };
    if (local) f.local = local;
    const papel = papelDe(req.user);
    const docs = await col().find(f).sort({ ordem: 1, inicioEm: -1 }).limit(50).toArray();
    const escopo = await escopoDoLeitor(req, deps);
    const itens = docs
      .filter(b => Array.isArray(b.publico?.papeis) && b.publico.papeis.includes(papel))
      .filter(b => visivelPara(b.publico, escopo))
      .slice(0, 10)
      .map(b => ({
        id: String(b._id), titulo: b.titulo, texto: b.texto ?? null,
        link: b.link?.url ?? null, linkRotulo: b.link?.rotulo ?? null, linkExterno: /^https:/i.test(b.link?.url || ''),
        imagemUrl: imagemUrlDe(b), imagemAlt: b.imagemAlt ?? null, local: b.local
      }));
    res.json({ itens });
  });

  // ---------- coordenação ----------
  async function saidaAdmin(docs) {
    const publicoDe = await descreverPublicos(docs, deps);
    const t = agora();
    return docs.map(b => ({
      id: String(b._id), titulo: b.titulo, texto: b.texto ?? null, link: b.link ?? null,
      imagemUrl: imagemUrlDe(b), imagemAlt: b.imagemAlt ?? null, local: b.local,
      inicioEm: iso(b.inicioEm), fimEm: iso(b.fimEm), publico: publicoDe(b), ordem: b.ordem ?? 0, ativo: b.ativo === true,
      estado: estadoDoBanner(b, t), versao: b.versao, criadoEm: iso(b.criadoEm), atualizadoEm: iso(b.atualizadoEm)
    }));
  }

  admin.get('/banners', async (_req, res) => {
    const docs = await col().find({}).sort({ local: 1, ordem: 1, inicioEm: -1 }).limit(500).toArray();
    res.json({ itens: await saidaAdmin(docs) });
  });

  admin.post('/banners', async (req, res) => {
    const corpo = req.body && typeof req.body === 'object' ? req.body : {};
    const campos = lerBanner(corpo);
    const pub = await conferirPublico(req, lerPublico(corpo.publico, { comPapeis: true }), deps);
    const t = agora();
    const doc = { ...campos, imagem: null, publico: pub, versao: 1, criadoEm: t, criadoPor: String(req.user._id), atualizadoEm: t };
    const r = await col().insertOne(doc);
    doc._id = r.insertedId;
    await auditoria.registrar({ acao: 'banner.criado', entidade: { tipo: 'banner', id: String(doc._id) }, extra: { local: doc.local } }, req);
    res.status(201).json({ banner: (await saidaAdmin([doc]))[0] });
  });

  async function carregar(req) {
    const _id = idDe(req.params.id);
    if (!_id) throw naoEncontrado();
    const b = await col().findOne({ _id });
    if (!b) throw naoEncontrado();
    return b;
  }

  async function gravar(req, b, set, acao, extra = {}) {
    const t = agora();
    const r = await col().updateOne({ _id: b._id, versao: b.versao }, { $set: { ...set, atualizadoEm: t }, $inc: { versao: 1 } });
    if (!r.modifiedCount) throw new ErroPortal(409, 'conflito-versao');
    await auditoria.registrar({ acao, entidade: { tipo: 'banner', id: String(b._id) }, ...extra }, req);
    return { ...b, ...set, atualizadoEm: t, versao: b.versao + 1 };
  }

  admin.put('/banners/:id', async (req, res) => {
    const b = await carregar(req);
    const corpo = req.body && typeof req.body === 'object' ? req.body : {};
    const versao = lerInteiro(corpo.versao, { min: 1, obrigatorio: true }, 'versao');
    if (versao !== b.versao) throw new ErroPortal(409, 'conflito-versao');
    const set = lerBanner(corpo, b);
    if (Object.hasOwn(corpo, 'publico')) set.publico = await conferirPublico(req, lerPublico(corpo.publico, { comPapeis: true }), deps);
    if ((set.local ?? b.local) === 'topo' && b.imagem && (set.local === 'topo')) set.imagem = null;
    const mudados = Object.keys(set).filter(k => JSON.stringify(set[k]) !== JSON.stringify(b[k]));
    const novo = await gravar(req, b, set, 'banner.alterado', { mudancas: mudados.map(campo => ({ campo })) });
    if (set.imagem === null && b.imagem?.arquivoId && arquivos) await arquivos.apagar(b.imagem.arquivoId).catch(() => {});
    res.json({ banner: (await saidaAdmin([novo]))[0] });
  });

  admin.delete('/banners/:id', async (req, res) => {
    const b = await carregar(req);
    const r = await col().deleteOne({ _id: b._id });
    if (!r.deletedCount) throw naoEncontrado();
    if (b.imagem?.arquivoId && arquivos) await arquivos.apagar(b.imagem.arquivoId).catch(() => {});
    await auditoria.registrar({ acao: 'banner.removido', entidade: { tipo: 'banner', id: String(b._id) }, extra: { local: b.local } }, req);
    res.json({ ok: true });
  });

  admin.post('/banners/:id/imagem', ...lerCorpoBinario({ limiteBytes: maxImagemBytes, tipos: ['jpg', 'png', 'webp'] }), async (req, res) => {
    const b = await carregar(req);
    if (!arquivos) throw new ErroPortal(503, 'servico-indisponivel');
    if (b.local === 'topo') throw invalido({ imagem: 'A faixa do topo é só texto.' });
    const { buf, tipo } = req.arquivo;
    const limpo = removerMetadadosImagem(buf, tipo);
    const arquivo = `ban-${randomBytes(6).toString('hex')}.${tipo}`;
    const salvo = await arquivos.salvar({ contexto: 'banner', ref: { entidadeId: String(b._id) }, buf: limpo, tipo, nomeDownload: arquivo, por: String(req.user._id) });
    let novo;
    try {
      novo = await gravar(req, b, { imagem: { arquivo, arquivoId: new ObjectId(salvo.id), mime: salvo.mime } }, 'banner.alterado', { mudancas: [{ campo: 'imagem' }] });
    } catch (err) {
      await arquivos.apagar(salvo.id).catch(() => {});
      throw err;
    }
    if (b.imagem?.arquivoId) await arquivos.apagar(b.imagem.arquivoId).catch(() => {});
    res.json({ imagemUrl: imagemUrlDe(novo) });
  });

  admin.delete('/banners/:id/imagem', async (req, res) => {
    const b = await carregar(req);
    if (b.imagem) {
      await gravar(req, b, { imagem: null }, 'banner.alterado', { mudancas: [{ campo: 'imagem' }] });
      if (b.imagem.arquivoId && arquivos) await arquivos.apagar(b.imagem.arquivoId).catch(() => {});
    }
    res.json({ ok: true });
  });

  return { publico, aluno, admin };
}

export default async function montar(ctx) {
  const { comum, rotas, servicos } = ctx;
  comum.registrarIndices(INDICES_BANNERS);
  const r = criarRotasBanners({
    repo: comum.repo, servicos, acesso: comum.acesso, auditoria: comum.auditoria, arquivos: comum.arquivos,
    maxImagemBytes: comum.configPortal?.bannerMaxBytes || MAX_IMAGEM_PADRAO, agora: comum.agora, log: comum.log
  });
  rotas.publico.use(r.publico);
  rotas.aluno.use(r.aluno);
  rotas.admin.use(r.admin);
}
