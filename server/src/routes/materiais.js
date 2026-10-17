// =============================================================
// COMPLEXO DMC · /api — materiais de apoio (PDF) das aulas
// Cada aula guarda um array `materiais`:
//   { id, tipo: 'arquivo'|'link', nome, arquivo, url, tamanho, createdAt }
//
// Upload: corpo binário cru (application/pdf) — sem dependência de
// parser multipart. O arquivo vai pra server/uploads/materiais, FORA
// do staticRoot: só sai pela rota GET abaixo, que confere a liberação
// do curso antes de entregar o PDF.
// =============================================================
import { Router, raw } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { col } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();

const MATERIAIS_DIR = path.join(config.uploadsRoot, 'materiais');
fs.mkdirSync(MATERIAIS_DIR, { recursive: true });

const str = v => (v == null ? '' : String(v));

/** Nome exibido pro aluno — sem quebras nem separador de caminho. */
function nomeSeguro(nome, padrao = 'Material de apoio') {
  const limpo = str(nome).replace(/[\r\n\t]+/g, ' ').replace(/[\\/]+/g, '-').trim().slice(0, 160);
  return limpo || padrao;
}

/** Caminho absoluto do arquivo, barrando qualquer coisa fora do diretório. */
function caminhoDoArquivo(arquivo) {
  const base = path.basename(str(arquivo));
  if (!base || base === '.' || base === '..') return null;
  const alvo = path.join(MATERIAIS_DIR, base);
  if (!alvo.startsWith(MATERIAIS_DIR + path.sep)) return null;
  return alvo;
}

/** Formato entregue ao front (o mesmo em /catalogo e nas rotas daqui). */
export function materialPublico(aulaId, m) {
  const tipo = m.tipo === 'link' ? 'link' : 'arquivo';
  return {
    id: m.id,
    tipo,
    nome: m.nome || 'Material de apoio',
    tamanho: Number(m.tamanho) || 0,
    url: tipo === 'link'
      ? str(m.url)
      : `/api/materiais/${encodeURIComponent(aulaId)}/${encodeURIComponent(m.id)}`
  };
}

export function materiaisPublicos(aulaDoc) {
  const lista = Array.isArray(aulaDoc.materiais) ? aulaDoc.materiais : [];
  return lista.map(m => materialPublico(aulaDoc._id, m));
}

/** Cascata: apaga os PDFs das aulas removidas (curso/módulo/aula). */
export async function apagarArquivosDeAulas(aulaDocs) {
  const caminhos = [];
  for (const aula of aulaDocs || []) {
    for (const m of (Array.isArray(aula.materiais) ? aula.materiais : [])) {
      const alvo = m && m.arquivo ? caminhoDoArquivo(m.arquivo) : null;
      if (alvo) caminhos.push(alvo);
    }
  }
  await Promise.all(caminhos.map(c => fsp.rm(c, { force: true }).catch(() => {})));
}

async function acharAula(aulaId) {
  return col.aulas().findOne({ _id: str(aulaId).trim() });
}

/** Aluno só baixa material de curso liberado; admin passa direto. */
async function podeBaixar(user, aula) {
  if (user.isAdmin) return true;
  // Aula ainda não liberada: o material dela também não sai.
  if (aula.disponivel === false) return false;
  const modulo = await col.modulos().findOne({ _id: aula.moduloId }, { projection: { cursoId: 1 } });
  if (!modulo) return false;
  const lib = await col.liberacoes().findOne({ userId: String(user._id), cursoId: modulo.cursoId });
  return !!lib;
}

// ============ UPLOAD DE PDF (admin) ============
router.post(
  '/aulas/:aulaId/materiais',
  requireAdmin,
  raw({ type: ['application/pdf', 'application/octet-stream'], limit: config.maxUploadBytes }),
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
    await fsp.writeFile(path.join(MATERIAIS_DIR, arquivo), corpo);

    const material = {
      id,
      tipo: 'arquivo',
      nome: nomeSeguro(req.query.nome, 'Material.pdf'),
      arquivo,
      tamanho: corpo.length,
      createdAt: new Date()
    };
    await col.aulas().updateOne({ _id: aulaId }, { $push: { materiais: material } });

    res.json({ material: materialPublico(aulaId, material) });
  }
);

// ============ MATERIAL POR LINK EXTERNO (admin) ============
router.post('/aulas/:aulaId/materiais/link', requireAdmin, async (req, res) => {
  const aulaId = str(req.params.aulaId).trim();
  const url = str(req.body.url).trim();
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'Informe uma URL começando com http:// ou https://.' });
  }

  const aula = await acharAula(aulaId);
  if (!aula) return res.status(404).json({ error: 'Aula não encontrada.' });

  const material = {
    id: 'mat-' + randomUUID().replace(/-/g, '').slice(0, 12),
    tipo: 'link',
    nome: nomeSeguro(req.body.nome, 'Material externo'),
    url,
    tamanho: 0,
    createdAt: new Date()
  };
  await col.aulas().updateOne({ _id: aulaId }, { $push: { materiais: material } });

  res.json({ material: materialPublico(aulaId, material) });
});

// ============ RENOMEAR (admin) ============
router.put('/aulas/:aulaId/materiais/:matId', requireAdmin, async (req, res) => {
  const aulaId = str(req.params.aulaId).trim();
  const matId = str(req.params.matId).trim();
  const nome = nomeSeguro(req.body.nome);

  const { matchedCount } = await col.aulas().updateOne(
    { _id: aulaId, 'materiais.id': matId },
    { $set: { 'materiais.$.nome': nome } }
  );
  if (!matchedCount) return res.status(404).json({ error: 'Material não encontrado.' });
  res.json({ ok: true, nome });
});

// ============ REMOVER (admin) ============
router.delete('/aulas/:aulaId/materiais/:matId', requireAdmin, async (req, res) => {
  const aulaId = str(req.params.aulaId).trim();
  const matId = str(req.params.matId).trim();

  const aula = await acharAula(aulaId);
  if (!aula) return res.status(404).json({ error: 'Aula não encontrada.' });

  const material = (aula.materiais || []).find(m => m.id === matId);
  if (!material) return res.status(404).json({ error: 'Material não encontrado.' });

  await col.aulas().updateOne({ _id: aulaId }, { $pull: { materiais: { id: matId } } });

  const alvo = material.arquivo ? caminhoDoArquivo(material.arquivo) : null;
  if (alvo) await fsp.rm(alvo, { force: true }).catch(() => {});

  res.json({ ok: true });
});

// ============ DOWNLOAD (aluno com curso liberado) ============
router.get('/materiais/:aulaId/:matId', requireAuth, async (req, res) => {
  const aulaId = str(req.params.aulaId).trim();
  const matId = str(req.params.matId).trim();

  const aula = await acharAula(aulaId);
  if (!aula) return res.status(404).json({ error: 'Aula não encontrada.' });

  const material = (aula.materiais || []).find(m => m.id === matId);
  if (!material) return res.status(404).json({ error: 'Material não encontrado.' });
  if (material.tipo === 'link') return res.redirect(302, material.url);

  if (!(await podeBaixar(req.user, aula))) {
    return res.status(403).json({ error: 'Você não tem acesso ao curso desta aula.' });
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

export default router;
