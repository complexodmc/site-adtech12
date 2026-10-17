// =============================================================
// COMPLEXO DMC · /api — certificados de conclusão
//
// Coleção `certificados`:
//   { _id:ObjectId, codigo, userId, cursoId, nomeAluno, tituloCurso,
//     cargaHoraria, totalAulas, emitidoEm }
//
// O certificado congela os dados na emissão (nome do aluno, título e
// carga horária do curso). Se o curso for renomeado depois, o documento
// já emitido continua descrevendo o que o aluno realmente concluiu.
//
// Aula marcada como indisponível ("em breve") fica fora da conta — é a
// mesma regra que o painel do aluno usa pro percentual, senão o curso
// nunca fecharia em 100%.
// =============================================================
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { col } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

const str = v => (v == null ? '' : String(v));

/** Sem I, O, 0 e 1: o código é lido em voz alta e digitado à mão. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function gerarCodigo() {
  const bytes = randomBytes(8);
  const bloco = i => Array.from({ length: 4 }, (_, j) => ALFABETO[bytes[i * 4 + j] % ALFABETO.length]).join('');
  return `DMC-${bloco(0)}-${bloco(1)}`;
}

/** Aulas que contam pro certificado: todas as do curso, menos as "em breve". */
async function aulasElegiveis(cursoId) {
  const modulos = await col.modulos().find({ cursoId }, { projection: { _id: 1 } }).toArray();
  const moduloIds = modulos.map(m => m._id);
  if (!moduloIds.length) return [];
  const aulas = await col.aulas()
    .find({ moduloId: { $in: moduloIds } }, { projection: { _id: 1, disponivel: 1 } })
    .toArray();
  return aulas.filter(a => a.disponivel !== false).map(a => a._id);
}

function certificadoPublico(cert) {
  return {
    id: String(cert._id),
    codigo: cert.codigo,
    cursoId: cert.cursoId,
    tituloCurso: cert.tituloCurso || '',
    nomeAluno: cert.nomeAluno || '',
    cargaHoraria: cert.cargaHoraria || '',
    totalAulas: Number(cert.totalAulas) || 0,
    emitidoEm: cert.emitidoEm instanceof Date ? cert.emitidoEm.toISOString() : cert.emitidoEm
  };
}

// ============ VALIDAÇÃO PÚBLICA ============
// Sem requireAuth de propósito: quem recebe o certificado precisa conferir
// a autenticidade sem ter conta na plataforma. Devolve o mínimo — nada de
// e-mail, id de usuário ou progresso.
router.get('/certificados/validar/:codigo', async (req, res) => {
  const codigo = str(req.params.codigo).trim().toUpperCase();
  const cert = await col.certificados().findOne({ codigo });
  if (!cert) return res.status(404).json({ valido: false, error: 'Certificado não encontrado.' });

  res.json({
    valido: true,
    certificado: {
      codigo: cert.codigo,
      nomeAluno: cert.nomeAluno || '',
      tituloCurso: cert.tituloCurso || '',
      cargaHoraria: cert.cargaHoraria || '',
      emitidoEm: cert.emitidoEm instanceof Date ? cert.emitidoEm.toISOString() : cert.emitidoEm
    }
  });
});

// ============ MEUS CERTIFICADOS ============
router.get('/certificados', requireAuth, async (req, res) => {
  const itens = await col.certificados()
    .find({ userId: String(req.user._id) })
    .sort({ emitidoEm: -1 })
    .toArray();
  res.json({ itens: itens.map(certificadoPublico) });
});

// ============ ELEGIBILIDADE (o que falta pra emitir) ============
router.get('/cursos/:cursoId/certificado', requireAuth, async (req, res) => {
  const cursoId = str(req.params.cursoId).trim();

  const existente = await col.certificados().findOne({ userId: String(req.user._id), cursoId });
  if (existente) return res.json({ emitido: true, certificado: certificadoPublico(existente) });

  const aulaIds = await aulasElegiveis(cursoId);
  const concluidas = aulaIds.length
    ? await col.progresso().countDocuments({ userId: String(req.user._id), aulaId: { $in: aulaIds } })
    : 0;

  res.json({
    emitido: false,
    total: aulaIds.length,
    concluidas,
    faltam: Math.max(0, aulaIds.length - concluidas),
    elegivel: aulaIds.length > 0 && concluidas >= aulaIds.length
  });
});

// ============ EMITIR ============
// Idempotente: chamar duas vezes devolve o mesmo certificado, nunca um segundo.
router.post('/cursos/:cursoId/certificado', requireAuth, async (req, res) => {
  const cursoId = str(req.params.cursoId).trim();
  const userId = String(req.user._id);

  const existente = await col.certificados().findOne({ userId, cursoId });
  if (existente) return res.json({ certificado: certificadoPublico(existente), novo: false });

  const curso = await col.cursos().findOne({ _id: cursoId });
  if (!curso) return res.status(404).json({ error: 'Curso não encontrado.' });

  // Admin enxerga tudo na plataforma, mas certificado é de quem cursou:
  // exige liberação real, inclusive pra admin.
  const lib = await col.liberacoes().findOne({ userId, cursoId });
  if (!lib) return res.status(403).json({ error: 'Você não tem acesso a este curso.' });

  const aulaIds = await aulasElegiveis(cursoId);
  if (!aulaIds.length) {
    return res.status(409).json({ error: 'Este curso ainda não tem aulas disponíveis para conclusão.' });
  }

  const concluidas = await col.progresso().countDocuments({ userId, aulaId: { $in: aulaIds } });
  if (concluidas < aulaIds.length) {
    return res.status(409).json({
      error: `Conclua todas as aulas para emitir o certificado. Faltam ${aulaIds.length - concluidas} de ${aulaIds.length}.`
    });
  }

  const doc = {
    codigo: gerarCodigo(),
    userId,
    cursoId,
    nomeAluno: req.user.nome || req.user.email.split('@')[0],
    tituloCurso: curso.titulo || '',
    cargaHoraria: curso.cargaHoraria || '',
    totalAulas: aulaIds.length,
    emitidoEm: new Date()
  };

  try {
    const { insertedId } = await col.certificados().insertOne(doc);
    doc._id = insertedId;
  } catch (err) {
    // Corrida no índice único: outra requisição emitiu primeiro.
    if (err && err.code === 11000) {
      const jaFeito = await col.certificados().findOne({ userId, cursoId });
      if (jaFeito) return res.json({ certificado: certificadoPublico(jaFeito), novo: false });
    }
    throw err;
  }

  res.status(201).json({ certificado: certificadoPublico(doc), novo: true });
});

export default router;
