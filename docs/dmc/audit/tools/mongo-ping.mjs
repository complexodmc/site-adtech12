// Testa conectividade com o MongoDB usando server/.env SEM imprimir valores.
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
dotenv.config({ path: new URL('../../../../server/.env', import.meta.url).pathname });
const uri = process.env.MONGODB_URI;
if (!uri) { console.log(JSON.stringify({ mongoUriDefinida: false })); process.exit(0); }
const host = (() => { try { return new URL(uri.replace(/^mongodb\+srv/, 'https')).hostname.replace(/^[^.]+/, '***'); } catch { return 'inválida'; } })();
const c = new MongoClient(uri, { serverSelectionTimeoutMS: 12000 });
const t0 = Date.now();
try {
  await c.connect();
  const cols = (await c.db(process.env.MONGODB_DB || 'complexodmc').listCollections().toArray()).map(x => x.name);
  console.log(JSON.stringify({ mongoUriDefinida: true, hostMascarado: host, conectou: true, ms: Date.now() - t0, colecoes: cols, temColecaoLeads: cols.includes('leads') }));
} catch (e) {
  console.log(JSON.stringify({ mongoUriDefinida: true, hostMascarado: host, conectou: false, ms: Date.now() - t0, erro: String(e.message).slice(0, 160) }));
} finally { await c.close().catch(() => {}); }
