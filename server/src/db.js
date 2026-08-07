// =============================================================
// COMPLEXO DMC · Conexão MongoDB + índices
// Coleções (espelham o antigo schema Postgres):
//   users      { _id:ObjectId, email, senhaHash, nome, isAdmin, createdAt }
//   cursos     { _id:string,   titulo, ..., beneficios[], ordem, isAtivo }
//   modulos    { _id:string,   cursoId, numero, titulo, resumo, duracao, ordem }
//   aulas      { _id:string,   moduloId, titulo, duracao, videoUrl, ordem }
//   liberacoes { userId, cursoId, grantedAt, grantedBy }
//   progresso  { userId, aulaId, completedAt }
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
  progresso: () => getDb().collection('progresso')
};

async function ensureIndexes() {
  await Promise.all([
    col.users().createIndex({ email: 1 }, { unique: true, name: 'uq_users_email' }),
    col.cursos().createIndex({ ordem: 1 }, { name: 'ix_cursos_ordem' }),
    col.modulos().createIndex({ cursoId: 1, ordem: 1 }, { name: 'ix_modulos_curso_ordem' }),
    col.aulas().createIndex({ moduloId: 1, ordem: 1 }, { name: 'ix_aulas_modulo_ordem' }),
    col.liberacoes().createIndex({ userId: 1, cursoId: 1 }, { unique: true, name: 'uq_liberacoes' }),
    col.liberacoes().createIndex({ cursoId: 1 }, { name: 'ix_liberacoes_curso' }),
    col.progresso().createIndex({ userId: 1, aulaId: 1 }, { unique: true, name: 'uq_progresso' })
  ]);
}
