// =============================================================
// COMPLEXO DMC · Migração dos materiais (PDF) das aulas: disco → Mongo
// PORTAL-API §3.2 (aulas.materiais[].arquivoId), §5.3 item 6 · dono: F1a.
//
// Por quê: na Vercel o disco do deploy é somente leitura e efêmero; o
// material legado gravado em server/uploads/materiais não sobrevive. Esta
// migração copia cada PDF para a coleção `arquivos` (Binary, contexto
// 'material') e grava `materiais[].arquivoId` na aula; o download legado
// (GET /api/materiais/:aulaId/:matId) passa a servir do Mongo.
//
//   cd server
//   MONGODB_DB=complexodmc_portal_f1a_qa node scripts/migrar-materiais.js            # simulação (padrão)
//   MONGODB_DB=complexodmc_portal_f1a_qa node scripts/migrar-materiais.js --aplicar  # grava
//
// Regras: MONGODB_DB obrigatório; simulação por padrão (só lê); idempotente
// (material com arquivoId é pulado; corrida → o binário recém-criado é
// descartado); NUNCA apaga nada do disco nem do banco. Banco que não termina
// em `_qa` só com --aplicar E --confirmar-banco=<nome do banco> (o banco do
// Daniel só com autorização dele, índice §3.4).
// =============================================================
import 'dotenv/config';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { ObjectId } from 'mongodb';
import { detectarTipo, criarArquivos } from '../src/portal/arquivos.js';

/** Teto por arquivo: o documento do Mongo tem 16 MB; o PDF vai como Binary com folga. */
export const TETO_BYTES = 15 * 1024 * 1024;

function caminhoSeguro(dir, arquivo) {
  const base = path.basename(String(arquivo || ''));
  if (!base || base === '.' || base === '..') return null;
  const alvo = path.join(dir, base);
  return alvo.startsWith(path.resolve(dir) + path.sep) ? alvo : null;
}

/**
 * Núcleo testável. → relatório { aulas, materiaisArquivo, jaMigrados, migraveis, migrados, semArquivo, invalidos, grandes, corrida }.
 * @param {{ repo: (nome: string) => object, dir: string, aplicar?: boolean, log?: object,
 *   lerArquivo?: (caminho: string) => Promise<Buffer>, arquivos?: object }} deps
 */
export async function migrarMateriais({ repo, dir, aplicar = false, log = console, lerArquivo = p => fsp.readFile(p), arquivos = null } = {}) {
  if (typeof repo !== 'function') throw new TypeError('migrarMateriais: informe repo.');
  if (!dir) throw new TypeError('migrarMateriais: informe o diretório dos materiais.');
  const arqs = arquivos || criarArquivos({ repo });
  const dirAbs = path.resolve(dir);
  const r = { aulas: 0, materiaisArquivo: 0, jaMigrados: 0, migraveis: 0, migrados: 0, semArquivo: 0, invalidos: 0, grandes: 0, corrida: 0 };

  const aulas = await repo('aulas').find({ 'materiais.tipo': 'arquivo' }, { projection: { _id: 1, moduloId: 1, materiais: 1 } }).toArray();
  const modulos = new Map();
  for (const aula of aulas) {
    r.aulas++;
    if (!modulos.has(aula.moduloId)) modulos.set(aula.moduloId, await repo('modulos').findOne({ _id: String(aula.moduloId) }, { projection: { cursoId: 1 } }));
    const cursoId = modulos.get(aula.moduloId)?.cursoId ?? null;
    for (const m of Array.isArray(aula.materiais) ? aula.materiais : []) {
      if (!m || m.tipo !== 'arquivo') continue;
      r.materiaisArquivo++;
      if (m.arquivoId) { r.jaMigrados++; continue; }
      const alvo = caminhoSeguro(dirAbs, m.arquivo);
      let buf = null;
      try { buf = alvo ? await lerArquivo(alvo) : null; } catch { buf = null; }
      if (!buf || !buf.length) { r.semArquivo++; log.log?.(`  sem arquivo   aula ${aula._id} · ${m.id}`); continue; }
      if (detectarTipo(buf) !== 'pdf') { r.invalidos++; log.log?.(`  não é PDF     aula ${aula._id} · ${m.id}`); continue; }
      if (buf.length > TETO_BYTES) { r.grandes++; log.log?.(`  grande demais aula ${aula._id} · ${m.id} (${buf.length} bytes)`); continue; }
      r.migraveis++;
      log.log?.(`  ${aplicar ? 'migrar' : 'migraria'}      aula ${aula._id} · ${m.id} (${buf.length} bytes)`);
      if (!aplicar) continue;
      const salvo = await arqs.salvar({
        contexto: 'material', donoUserId: null,
        ref: { cursoId, moduloId: aula.moduloId, materialId: m.id, entidadeId: aula._id },
        buf, tipo: 'pdf', nomeDownload: m.nome || 'material', por: 'migrar-materiais'
      });
      const u = await repo('aulas').updateOne(
        { _id: aula._id, materiais: { $elemMatch: { id: m.id, arquivoId: { $exists: false } } } },
        { $set: { 'materiais.$.arquivoId': new ObjectId(salvo.id) } }
      );
      if (u && u.matchedCount) r.migrados++;
      else { r.corrida++; await arqs.apagar(salvo.id).catch(() => {}); }
    }
  }
  return r;
}

async function principal() {
  const banco = (process.env.MONGODB_DB || '').trim();
  const uri = (process.env.MONGODB_URI || '').trim();
  const aplicar = process.argv.includes('--aplicar');
  const confirmacao = (process.argv.find(a => a.startsWith('--confirmar-banco=')) || '').split('=')[1] || '';
  if (!banco) { console.error('[migrar-materiais] MONGODB_DB é obrigatório. Nada foi feito.'); process.exitCode = 2; return; }
  if (!uri) { console.error('[migrar-materiais] MONGODB_URI ausente. Nada foi feito.'); process.exitCode = 2; return; }
  if (aplicar && !/_qa$/.test(banco) && confirmacao !== banco) {
    console.error(`[migrar-materiais] banco "${banco}" não é de QA: para gravar, repita com --confirmar-banco=${banco} (só com autorização do responsável). Nada foi feito.`);
    process.exitCode = 2;
    return;
  }
  const dir = process.env.UPLOADS_DIR ? path.join(path.resolve(process.env.UPLOADS_DIR), 'materiais')
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads', 'materiais');
  const { MongoClient } = await import('mongodb');
  const conexao = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await conexao.connect();
  try {
    const db = conexao.db(banco);
    console.log(`[migrar-materiais] banco "${banco}" · pasta ${dir} — ${aplicar ? 'APLICANDO' : 'simulação (use --aplicar para gravar)'}`);
    const r = await migrarMateriais({ repo: nome => db.collection(nome), dir, aplicar });
    console.log(`[migrar-materiais] aulas com PDF: ${r.aulas} · materiais PDF: ${r.materiaisArquivo} · já migrados: ${r.jaMigrados} · ${aplicar ? `migrados: ${r.migrados}` : `migráveis: ${r.migraveis}`} · sem arquivo no disco: ${r.semArquivo} · não-PDF: ${r.invalidos} · acima de 15 MB: ${r.grandes}${r.corrida ? ` · corrida (descartados): ${r.corrida}` : ''}`);
    console.log('[migrar-materiais] nada foi apagado do disco.');
  } finally {
    await conexao.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principal().catch(err => { console.error(`[migrar-materiais] falhou: ${err?.name || 'Error'}: ${String(err?.message || '').slice(0, 200)}`); process.exitCode = 1; });
}
