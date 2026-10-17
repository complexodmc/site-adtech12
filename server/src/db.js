// =============================================================
// COMPLEXO DMC · Conexão MongoDB + índices
// Coleções (espelham o antigo schema Postgres):
//   users      { _id:ObjectId, email, senhaHash, nome, isAdmin, createdAt }
//   cursos     { _id:string,   titulo, ..., beneficios[], ordem, isAtivo }
//   modulos    { _id:string,   cursoId, numero, titulo, resumo, duracao, ordem }
//   aulas      { _id:string,   moduloId, titulo, duracao, videoUrl, ordem,
//                materiais: [{ id, tipo:'arquivo'|'link', nome, arquivo, url, tamanho }] }
//   liberacoes { userId, cursoId, grantedAt, grantedBy }
//   progresso  { userId, aulaId, completedAt }
//   duvidas    { aulaId, moduloId, cursoId, userId, autorNome, texto,
//                createdAt, resolvida, respostas:[{ id, userId, autorNome, texto, createdAt }] }
//   lives      { _id:string, cursoId, titulo, descricao, inicioEm, duracaoMin, url, plataforma }
//   certificados { codigo, userId, cursoId, nomeAluno, tituloCurso, cargaHoraria, emitidoEm }
//   leads      { nome, email, telefone?, empresa?, perfil, eixo?, mensagem?, curso?, origem,
//                consentimento:{ aceito, em }, status:'novo', createdAt }  (POST /api/contato)
//   parcerias_candidaturas { protocolo, programa, email, dados, fonte, status, historico[],
//                responsavel, consentimento, comunicacoes, retencaoAte, createdAt, updatedAt }
//                (POST /api/parcerias/* — ver routes/parcerias.js)
// =============================================================
import { MongoClient } from 'mongodb';
import { config } from './config.js';

let client = null;
let db = null;

export async function connect() {
  if (db) return db;
  client = new MongoClient(config.mongoUri, {
    // Falha rápido se o IP não estiver liberado no Network Access do Atlas.
    serverSelectionTimeoutMS: 15000,
    retryWrites: true
  });
  await client.connect();
  db = client.db(config.mongoDb);
  await ensureIndexes();
  return db;
}

export async function close() {
  if (client) await client.close();
  client = null;
  db = null;
}

export function getDb() {
  if (!db) throw new Error('MongoDB não conectado — chame connect() antes.');
  return db;
}

export const col = {
  users: () => getDb().collection('users'),
  cursos: () => getDb().collection('cursos'),
  modulos: () => getDb().collection('modulos'),
  aulas: () => getDb().collection('aulas'),
  liberacoes: () => getDb().collection('liberacoes'),
  progresso: () => getDb().collection('progresso'),
  duvidas: () => getDb().collection('duvidas'),
  lives: () => getDb().collection('lives'),
  certificados: () => getDb().collection('certificados'),
  leads: () => getDb().collection('leads'),
  parcerias: () => getDb().collection('parcerias_candidaturas')
};

async function ensureIndexes() {
  await Promise.all([
    col.users().createIndex({ email: 1 }, { unique: true, name: 'uq_users_email' }),
    col.cursos().createIndex({ ordem: 1 }, { name: 'ix_cursos_ordem' }),
    col.modulos().createIndex({ cursoId: 1, ordem: 1 }, { name: 'ix_modulos_curso_ordem' }),
    col.aulas().createIndex({ moduloId: 1, ordem: 1 }, { name: 'ix_aulas_modulo_ordem' }),
    col.liberacoes().createIndex({ userId: 1, cursoId: 1 }, { unique: true, name: 'uq_liberacoes' }),
    col.liberacoes().createIndex({ cursoId: 1 }, { name: 'ix_liberacoes_curso' }),
    col.progresso().createIndex({ userId: 1, aulaId: 1 }, { unique: true, name: 'uq_progresso' }),
    // Listagem da aula: mais recentes primeiro.
    col.duvidas().createIndex({ aulaId: 1, createdAt: -1 }, { name: 'ix_duvidas_aula' }),
    // Fila do painel administrativo (dúvidas em aberto, mais antigas primeiro).
    col.duvidas().createIndex({ resolvida: 1, createdAt: 1 }, { name: 'ix_duvidas_fila' }),
    // Cascata na exclusão de curso/módulo.
    col.duvidas().createIndex({ cursoId: 1 }, { name: 'ix_duvidas_curso' }),
    col.duvidas().createIndex({ moduloId: 1 }, { name: 'ix_duvidas_modulo' }),
    // Agenda de aulas ao vivo, em ordem cronológica.
    col.lives().createIndex({ inicioEm: 1 }, { name: 'ix_lives_inicio' }),
    col.lives().createIndex({ cursoId: 1, inicioEm: 1 }, { name: 'ix_lives_curso' }),
    // Um certificado por aluno/curso — o índice é o que garante a emissão única.
    col.certificados().createIndex({ userId: 1, cursoId: 1 }, { unique: true, name: 'uq_certificados' }),
    col.certificados().createIndex({ codigo: 1 }, { unique: true, name: 'uq_certificados_codigo' }),
    col.certificados().createIndex({ cursoId: 1 }, { name: 'ix_certificados_curso' }),
    // Contatos do site, mais recentes primeiro.
    col.leads().createIndex({ createdAt: -1 }, { name: 'ix_leads_data' }),
    // Candidaturas de parceria: fila do painel, checagem de duplicidade (24 h)
    // e busca por protocolo. Sem índice TTL: a retenção depende do CEO.
    col.parcerias().createIndex({ programa: 1, status: 1, createdAt: -1 }, { name: 'ix_parcerias_fila' }),
    col.parcerias().createIndex({ email: 1, programa: 1, createdAt: -1 }, { name: 'ix_parcerias_email' }),
    col.parcerias().createIndex({ protocolo: 1 }, { unique: true, name: 'uq_parcerias_protocolo' })
  ]);
}
