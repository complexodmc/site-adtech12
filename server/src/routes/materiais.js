// =============================================================
// COMPLEXO DMC · /api — materiais de apoio (PDF) das aulas
// Cada aula guarda um array `materiais`:
//   { id, tipo: 'arquivo'|'link', nome, arquivo, url, tamanho, createdAt,
//     categoria?: 'leitura'|'slides'|'complementar', arquivoId?: OID }
//
// Upload: corpo binário cru (application/pdf) — sem dependência de
// parser multipart. O arquivo vai pra server/uploads/materiais, FORA
// do staticRoot: só sai pela rota GET abaixo, que confere o acesso ao
// curso antes de entregar o PDF.
//
// Portal (PORTAL-API §6.13, §7.3 · dono: F1a):
// - GET confere o acesso ANTES de qualquer entrega, inclusive do
//   redirect de material tipo link (sem acesso → 403 sem Location);
//   aceita docência (acesso.podeVerCurso).
// - Material migrado (`arquivoId`, scripts/migrar-materiais.js) sai da
//   coleção `arquivos` (filtro contexto 'material' + ref.materialId).
// - Aluno com liberação que baixa/abre um material → `progresso_conteudo`
//   { chave:'material:<matId>' } em melhor esforço (falha só loga).
// - PUT aceita `categoria` (aditivo; `nome` ausente não renomeia mais).
// =============================================================
import { Router, raw } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { servicos as servicosDoProcesso } from '../portal/servicos.js';
import { criarAcesso } from '../portal/acesso.js';
import { criarArquivos } from '../portal/arquivos.js';
import { MENSAGENS } from '../portal/erros.js';
import { criarRepositoriosEstudos } from '../portal/estudos/repositorios.js';
import { CATEGORIAS_MATERIAL } from '../portal/estudos/progresso.js';

const MATERIAIS_DIR_PADRAO = path.join(config.uploadsRoot, 'materiais');

const str = v => (v == null ? '' : String(v));

/** Nome exibido pro aluno — sem quebras nem separador de caminho. */
function nomeSeguro(nome, padrao = 'Material de apoio') {
  const limpo = str(nome).replace(/[\r\n\t]+/g, ' ').replace(/[\\/]+/g, '-').trim().slice(0, 160);
  return limpo || padrao;
}

/** Caminho absoluto do arquivo, barrando qualquer coisa fora do diretório. */
function caminhoNoDiretorio(dir, arquivo) {
  const base = path.basename(str(arquivo));
  if (!base || base === '.' || base === '..') return null;
  const alvo = path.join(dir, base);
  if (!alvo.startsWith(dir + path.sep)) return null;
  return alvo;
}

/** Formato entregue ao front (o mesmo em /catalogo e nas rotas daqui). `categoria` é aditivo. */
export function materialPublico(aulaId, m) {
  const tipo = m.tipo === 'link' ? 'link' : 'arquivo';
  return {
    id: m.id,
    tipo,
    nome: m.nome || 'Material de apoio',
    tamanho: Number(m.tamanho) || 0,
    categoria: CATEGORIAS_MATERIAL.includes(m.categoria) ? m.categoria : 'leitura',
    url: tipo === 'link'
      ? str(m.url)
      : `/api/materiais/${encodeURIComponent(aulaId)}/${encodeURIComponent(m.id)}`
  };
}

export function materiaisPublicos(aulaDoc) {
  const lista = Array.isArray(aulaDoc.materiais) ? aulaDoc.materiais : [];
  return lista.map(m => materialPublico(aulaDoc._id, m));
}

/** Cascata: apaga os PDFs das aulas removidas (curso/módulo/aula). Binários em `arquivos` saem pela cascata da F1a. */
export async function apagarArquivosDeAulas(aulaDocs, { dir = MATERIAIS_DIR_PADRAO } = {}) {
  const caminhos = [];
  for (const aula of aulaDocs || []) {
    for (const m of (Array.isArray(aula.materiais) ? aula.materiais : [])) {
      const alvo = m && m.arquivo ? caminhoNoDiretorio(dir, m.arquivo) : null;
      if (alvo) caminhos.push(alvo);
    }
  }
  await Promise.all(caminhos.map(c => fsp.rm(c, { force: true }).catch(() => {})));
}

/**
 * @param {{ repo: (nome: string) => object, servicos?: object, materiaisDir?: string,
 *   exigirLogin?: Function, exigirAdmin?: Function|Function[], maxUploadBytes?: number,
 *   agora?: () => Date, log?: object }} deps
 */
export function criarRotaMateriais({
  repo, servicos = servicosDoProcesso, materiaisDir = MATERIAIS_DIR_PADRAO,
  exigirLogin = requireAuth, exigirAdmin = requireAdmin, maxUploadBytes = config.maxUploadBytes,
  agora = () => new Date(), log = console
} = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarRotaMateriais: informe repo.');
  try {
    fs.mkdirSync(materiaisDir, { recursive: true });
  } catch (err) {
    // Disco somente leitura (Vercel): o upload legado em disco falha na rota; o download do Mongo segue.
    try { (log.warn || log.error).call(log, `[DMC] materiais: pasta de uploads indisponível (${err?.code || 'erro'}).`); } catch { /* nada */ }
  }
  const acessoProprio = criarAcesso({ repo });
  const arquivosProprio = criarArquivos({ repo, agora });
  const acessoDe = () => servicos.tentar('acesso') || acessoProprio;
  const arquivosDe = () => servicos.tentar('arquivos') || arquivosProprio;
  const repos = criarRepositoriosEstudos({ repo });
  const admin = Array.isArray(exigirAdmin) ? exigirAdmin : [exigirAdmin];
  const caminhoDoArquivo = arquivo => caminhoNoDiretorio(materiaisDir, arquivo);

  const router = Router();

  async function acharAula(aulaId) {
    return repo('aulas').findOne({ _id: str(aulaId).trim() });
  }

  async function cursoDaAula(aula) {
    if (!aula?.moduloId) return null;
    const modulo = await repo('modulos').findOne({ _id: String(aula.moduloId) }, { projection: { cursoId: 1 } });
    return modulo?.cursoId ? String(modulo.cursoId) : null;
  }

  /** Admin passa direto; aula "em breve" não entrega material; senão liberação OU docência. */
  async function podeBaixar(req, aula, cursoId) {
    if (req.user?.isAdmin) return true;
    if (aula.disponivel === false) return false;
    if (!cursoId) return false;
    return acessoDe().podeVerCurso(req, cursoId);
  }

  /** Aluno com liberação abriu o material → item `feito` no player (melhor esforço). */
  async function marcarFeito(req, aula, cursoId, matId) {
    try {
      const ctx = await acessoDe().contexto(req);
      if (!ctx?.cursosLiberados?.has(cursoId)) return;
      await repos.marcarConteudo({ userId: String(req.user._id), cursoId, moduloId: String(aula.moduloId), chave: `material:${matId}`, em: agora() });
    } catch (err) {
      try { (log.warn || log.error).call(log, `[portal] materiais: progresso_conteudo não gravado — ${err?.name || 'Error'}`); } catch { /* nada */ }
    }
  }

  // ============ UPLOAD DE PDF (admin) ============
  router.post(
    '/aulas/:aulaId/materiais',
    ...admin,
    raw({ type: ['application/pdf', 'application/octet-stream'], limit: maxUploadBytes }),
    async (req, res) => {
      const aulaId = str(req.params.aulaId).trim();
      const corpo = req.body;
      if (!Buffer.isBuffer(corpo) || !corpo.length) {
        return res.status(415).json({ error: 'Envie o PDF no corpo da requisição com Content-Type: application/pdf.' });
      }
      if (corpo.subarray(0, 5).toString('latin1') !== '%PDF-') {
        return res.status(400).json({ error: 'O arquivo enviado não é um PDF válido.' });
      }

      const aula = await acharAula(aulaId);
      if (!aula) return res.status(404).json({ error: 'Aula não encontrada.' });

      const id = 'mat-' + randomUUID().replace(/-/g, '').slice(0, 12);
      const arquivo = `${id}.pdf`;
      await fsp.writeFile(path.join(materiaisDir, arquivo), corpo);

      const material = {
        id,
        tipo: 'arquivo',
        nome: nomeSeguro(req.query.nome, 'Material.pdf'),
        arquivo,
        tamanho: corpo.length,
        createdAt: new Date()
      };
      await repo('aulas').updateOne({ _id: aulaId }, { $push: { materiais: material } });

      res.json({ material: materialPublico(aulaId, material) });
    }
  );

  // ============ MATERIAL POR LINK EXTERNO (admin) ============
  router.post('/aulas/:aulaId/materiais/link', ...admin, async (req, res) => {
    const aulaId = str(req.params.aulaId).trim();
    const url = str(req.body?.url).trim();
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Informe uma URL começando com http:// ou https://.' });
    }

    const aula = await acharAula(aulaId);
    if (!aula) return res.status(404).json({ error: 'Aula não encontrada.' });

    const material = {
      id: 'mat-' + randomUUID().replace(/-/g, '').slice(0, 12),
      tipo: 'link',
      nome: nomeSeguro(req.body?.nome, 'Material externo'),
      url,
      tamanho: 0,
      createdAt: new Date()
    };
    await repo('aulas').updateOne({ _id: aulaId }, { $push: { materiais: material } });

    res.json({ material: materialPublico(aulaId, material) });
  });

  // ============ RENOMEAR / CATEGORIA (admin) ============
  router.put('/aulas/:aulaId/materiais/:matId', ...admin, async (req, res) => {
    const aulaId = str(req.params.aulaId).trim();
    const matId = str(req.params.matId).trim();
    const b = req.body || {};
    const set = {};
    let nome;
    if (b.categoria !== undefined && b.categoria !== null) {
      if (typeof b.categoria !== 'string' || !CATEGORIAS_MATERIAL.includes(b.categoria)) {
        return res.status(400).json({ error: 'Categoria inválida (leitura, slides ou complementar).', codigo: 'validacao', campos: { categoria: 'Opção inválida.' } });
      }
      set['materiais.$.categoria'] = b.categoria;
    }
    // Sem `categoria`, o contrato antigo vale: o nome é sempre gravado (padrão "Material de apoio").
    if (b.nome !== undefined || !Object.keys(set).length) {
      nome = nomeSeguro(b.nome);
      set['materiais.$.nome'] = nome;
    }

    const { matchedCount } = await repo('aulas').updateOne(
      { _id: aulaId, 'materiais.id': matId },
      { $set: set }
    );
    if (!matchedCount) return res.status(404).json({ error: 'Material não encontrado.' });
    res.json({ ok: true, ...(nome !== undefined ? { nome } : {}), ...(set['materiais.$.categoria'] ? { categoria: b.categoria } : {}) });
  });

  // ============ REMOVER (admin) ============
  router.delete('/aulas/:aulaId/materiais/:matId', ...admin, async (req, res) => {
    const aulaId = str(req.params.aulaId).trim();
    const matId = str(req.params.matId).trim();

    const aula = await acharAula(aulaId);
    if (!aula) return res.status(404).json({ error: 'Aula não encontrada.' });

    const material = (aula.materiais || []).find(m => m.id === matId);
    if (!material) return res.status(404).json({ error: 'Material não encontrado.' });

    await repo('aulas').updateOne({ _id: aulaId }, { $pull: { materiais: { id: matId } } });

    const alvo = material.arquivo ? caminhoDoArquivo(material.arquivo) : null;
    if (alvo) await fsp.rm(alvo, { force: true }).catch(() => {});
    if (material.arquivoId) await arquivosDe().apagar(material.arquivoId).catch(() => {});

    res.json({ ok: true });
  });

  // ============ DOWNLOAD (curso liberado, docência ou admin) ============
  router.get('/materiais/:aulaId/:matId', exigirLogin, async (req, res) => {
    const aulaId = str(req.params.aulaId).trim();
    const matId = str(req.params.matId).trim();

    const aula = await acharAula(aulaId);
    if (!aula) return res.status(404).json({ error: 'Aula não encontrada.' });

    const material = (aula.materiais || []).find(m => m.id === matId);
    if (!material) return res.status(404).json({ error: 'Material não encontrado.' });

    // Acesso ANTES de qualquer entrega — inclusive do redirect do link (API §7.3).
    const cursoId = await cursoDaAula(aula);
    if (!(await podeBaixar(req, aula, cursoId))) {
      return res.status(403).json({ error: MENSAGENS['sem-acesso'], codigo: 'sem-acesso' });
    }
    await marcarFeito(req, aula, cursoId, matId);

    if (material.tipo === 'link') return res.redirect(302, material.url);

    if (material.arquivoId) {
      const arq = await arquivosDe().ler(material.arquivoId, { contexto: 'material', 'ref.materialId': matId });
      if (!arq) return res.status(404).json({ error: 'Arquivo não está mais disponível no servidor.' });
      return arquivosDe().enviar(res, arq, { nome: material.nome });
    }

    const alvo = caminhoDoArquivo(material.arquivo);
    if (!alvo || !fs.existsSync(alvo)) {
      return res.status(404).json({ error: 'Arquivo não está mais disponível no servidor.' });
    }

    const nomeArquivo = /\.pdf$/i.test(material.nome) ? material.nome : `${material.nome}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="material.pdf"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`
    );
    res.sendFile(alvo);
  });

  return router;
}

export default criarRotaMateriais({ repo: nome => getDb().collection(nome) });
