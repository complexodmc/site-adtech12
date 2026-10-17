// =============================================================
// COMPLEXO DMC · /api — capa (imagem) de cada curso
// O curso guarda `capa`: { arquivo, tamanho, createdAt }
//
// Upload: corpo binário cru (image/*) — mesmo desenho dos materiais,
// sem parser multipart. Em produção Vercel, o filesystem do deploy é
// somente leitura; por isso a imagem fica no MongoDB, dentro do curso.
//
// Diferença importante pro PDF: a capa é vitrine, aparece em <img>
// na loja e no painel do aluno. <img> não manda header Authorization,
// então o GET daqui é público. O nome do arquivo é aleatório, e o que
// a capa mostra é material de divulgação — não conteúdo de curso.
// =============================================================
import { Router, raw } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Binary } from 'mongodb';
import { col } from '../db.js';
import { config } from '../config.js';
import { requireAdmin } from '../auth.js';

const router = Router();

const CAPAS_DIR = path.join(config.uploadsRoot, 'capas');
fs.mkdirSync(CAPAS_DIR, { recursive: true });

// Capa é imagem de card: 8 MB já é folgado. Respeita um teto menor
// vindo do .env (MAX_UPLOAD_MB), se houver.
const MAX_CAPA_BYTES = Math.min(config.maxUploadBytes, 8 * 1024 * 1024);
const MAX_CAPA_MB = Math.round(MAX_CAPA_BYTES / (1024 * 1024));

const str = v => (v == null ? '' : String(v));

const TIPOS = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

/** Identifica o formato pelos bytes iniciais — o Content-Type mente. */
function extensaoDaImagem(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp';
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return '.gif';
  return null;
}

/** Caminho absoluto do arquivo, barrando qualquer coisa fora do diretório. */
function caminhoDaCapa(arquivo) {
  const base = path.basename(str(arquivo));
  if (!base || base === '.' || base === '..') return null;
  const alvo = path.join(CAPAS_DIR, base);
  if (!alvo.startsWith(CAPAS_DIR + path.sep)) return null;
  return alvo;
}

/** URL entregue ao front — string vazia quando o curso não tem capa. */
export function capaUrl(cursoDoc) {
  const arquivo = cursoDoc && cursoDoc.capa && cursoDoc.capa.arquivo;
  return arquivo ? `/api/capas/${encodeURIComponent(arquivo)}` : '';
}

/** Cascata: apaga os arquivos de capa dos cursos removidos. */
export async function apagarCapasDeCursos(cursoDocs) {
  const caminhos = [];
  for (const curso of cursoDocs || []) {
    const alvo = curso && curso.capa && curso.capa.arquivo ? caminhoDaCapa(curso.capa.arquivo) : null;
    if (alvo) caminhos.push(alvo);
  }
  await Promise.all(caminhos.map(c => fsp.rm(c, { force: true }).catch(() => {})));
}

// ============ ENVIAR / TROCAR CAPA (admin) ============
router.post(
  '/cursos/:id/capa',
  requireAdmin,
  raw({ type: ['image/*', 'application/octet-stream'], limit: MAX_CAPA_BYTES }),
  async (req, res) => {
    const cursoId = str(req.params.id).trim();
    const corpo = req.body;
    if (!Buffer.isBuffer(corpo) || !corpo.length) {
      return res.status(415).json({ error: 'Envie a imagem no corpo da requisição com Content-Type de imagem.' });
    }

    const ext = extensaoDaImagem(corpo);
    if (!ext) {
      return res.status(400).json({ error: 'Formato não reconhecido. Use JPG, PNG, WebP ou GIF.' });
    }

    const curso = await col.cursos().findOne({ _id: cursoId });
    if (!curso) return res.status(404).json({ error: 'Curso não encontrado.' });

    const arquivo = `capa-${randomUUID().replace(/-/g, '').slice(0, 12)}${ext}`;

    const capa = {
      arquivo,
      tipo: TIPOS[ext],
      tamanho: corpo.length,
      dados: new Binary(corpo),
      createdAt: new Date()
    };
    await col.cursos().updateOne({ _id: cursoId }, { $set: { capa, updatedAt: new Date() } });

    // Compatibilidade com capas antigas gravadas em disco no ambiente local.
    const antiga = curso.capa && curso.capa.arquivo ? caminhoDaCapa(curso.capa.arquivo) : null;
    if (antiga) await fsp.rm(antiga, { force: true }).catch(() => {});

    res.json({ capaUrl: capaUrl({ capa }), tamanho: capa.tamanho });
  }
);

// ============ REMOVER CAPA (admin) ============
router.delete('/cursos/:id/capa', requireAdmin, async (req, res) => {
  const cursoId = str(req.params.id).trim();

  const curso = await col.cursos().findOne({ _id: cursoId });
  if (!curso) return res.status(404).json({ error: 'Curso não encontrado.' });

  await col.cursos().updateOne({ _id: cursoId }, { $unset: { capa: '' }, $set: { updatedAt: new Date() } });

  const alvo = curso.capa && curso.capa.arquivo ? caminhoDaCapa(curso.capa.arquivo) : null;
  if (alvo) await fsp.rm(alvo, { force: true }).catch(() => {});

  res.json({ ok: true });
});

// ============ ENTREGA DA IMAGEM (pública) ============
router.get('/capas/:arquivo', async (req, res) => {
  const arquivo = path.basename(str(req.params.arquivo));
  const curso = arquivo
    ? await col.cursos().findOne({ 'capa.arquivo': arquivo }, { projection: { capa: 1 } })
    : null;

  if (curso && curso.capa && curso.capa.dados) {
    const ext = path.extname(arquivo).toLowerCase();
    const tipo = curso.capa.tipo || TIPOS[ext];
    const dados = curso.capa.dados.buffer
      ? Buffer.from(curso.capa.dados.buffer)
      : Buffer.from(curso.capa.dados);
    if (!tipo || !dados.length) return res.status(404).json({ error: 'Capa não encontrada.' });

    res.setHeader('Content-Type', tipo);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(dados);
  }

  // Fallback local para arquivos de capa antigos.
  const alvo = caminhoDaCapa(arquivo);
  if (!alvo || !fs.existsSync(alvo)) return res.status(404).json({ error: 'Capa não encontrada.' });

  const tipo = TIPOS[path.extname(alvo).toLowerCase()];
  if (!tipo) return res.status(404).json({ error: 'Capa não encontrada.' });

  // Nome do arquivo muda a cada upload, então o cache pode ser longo.
  res.setHeader('Content-Type', tipo);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(alvo);
});

export { MAX_CAPA_BYTES, MAX_CAPA_MB };
export default router;
