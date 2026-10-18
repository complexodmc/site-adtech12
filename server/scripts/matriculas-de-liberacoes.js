// =============================================================
// COMPLEXO DMC · Matrículas a partir das liberações (migração)
// PORTAL-API §5.3 item 6, §8.2 · índice §8.1 (F4a), L7 · dono: F4a.
//
// Para cada liberação (userId, cursoId) sem matrícula vigente, aplica o
// passo de §8.2: cria a matrícula MAT-AAAA-XXXXXX (origem 'migracao',
// início = data da liberação, sem notificar o aluno). Mesma regra do
// POST /api/portal/admin/matriculas/sincronizar.
//
//   cd server
//   MONGODB_DB=complexodmc_portal_f4a_qa node scripts/matriculas-de-liberacoes.js            # simulação (padrão)
//   MONGODB_DB=complexodmc_portal_f4a_qa node scripts/matriculas-de-liberacoes.js --aplicar  # grava
//
// Garantias:
//   - simulação por padrão: nada é gravado sem --aplicar (nem índice);
//   - MONGODB_DB obrigatório (o nome do banco nunca é adivinhado);
//   - banco que não termina em "_qa" só com --aplicar --confirmo-banco=<nome exato>
//     (no banco real, só com autorização do Daniel);
//   - idempotente: rodar de novo não cria nada para quem já tem matrícula;
//   - nunca apaga nem altera liberação ou matrícula existente;
//   - cada matrícula criada é registrada na auditoria (ator "sistema").
// =============================================================
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { criarSecretaria } from '../src/portal/secretaria/matriculas.js';
import { INDICES_SECRETARIA } from '../src/portal/secretaria/repositorios.js';
import { criarGarantiaIndices } from '../src/portal/indices.js';
import { criarAuditoria } from '../src/portal/auditoria.js';

export const PREFIXO_LOG = '[matriculas-de-liberacoes]';

/**
 * Confere o alvo SEM conectar. → { ok:true, db, qa:B } | { ok:false, motivo }.
 * @param {{ db?: string, aplicar?: boolean, confirmo?: string|null }} opcoes
 */
export function conferirAlvo({ db, aplicar = false, confirmo = null } = {}) {
  const nome = typeof db === 'string' ? db.trim() : '';
  if (!nome) return { ok: false, motivo: 'defina MONGODB_DB com o nome do banco (obrigatório).' };
  const qa = /_qa$/.test(nome);
  if (aplicar && !qa && confirmo !== nome) {
    return { ok: false, motivo: `o banco "${nome}" não é de QA: para gravar, repita o nome em --confirmo-banco=${nome} (só com autorização do responsável pelo banco).` };
  }
  return { ok: true, db: nome, qa };
}

/**
 * Executa a migração num banco já conectado. → { criadas, jaExistiam, semConta, aplicado }.
 * @param {{ db: { collection(nome): object }, aplicar?: boolean, log?: Console, agora?: () => Date }} opcoes
 */
export async function migrar({ db, aplicar = false, log = console, agora = () => new Date() }) {
  if (!db || typeof db.collection !== 'function') throw new TypeError('migrar: informe db.');
  const repo = nome => db.collection(nome);
  const garantia = aplicar ? criarGarantiaIndices({ getDb: () => db, log, especificacoes: INDICES_SECRETARIA }) : null;
  const secretaria = criarSecretaria({
    repo, auditoria: criarAuditoria({ repo, agora, log }), notificacoes: null, garantia, agora, log
  });
  const r = await secretaria.sincronizar({ aplicar, origem: 'migracao', req: null });
  return { ...r, aplicado: aplicar };
}

function argumento(prefixo) {
  const a = process.argv.find(x => x.startsWith(prefixo));
  return a ? a.slice(prefixo.length) : null;
}

async function principal() {
  const aplicar = process.argv.includes('--aplicar');
  const alvo = conferirAlvo({ db: process.env.MONGODB_DB, aplicar, confirmo: argumento('--confirmo-banco=') });
  if (!alvo.ok) {
    console.error(`${PREFIXO_LOG} recusado: ${alvo.motivo}`);
    process.exitCode = 2;
    return;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(`${PREFIXO_LOG} recusado: defina MONGODB_URI.`);
    process.exitCode = 2;
    return;
  }
  const { MongoClient } = await import('mongodb');
  const conexao = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await conexao.connect();
    const db = conexao.db(alvo.db);
    console.log(`${PREFIXO_LOG} banco "${alvo.db}" · ${aplicar ? 'APLICANDO' : 'simulação (nada é gravado; use --aplicar para gravar)'}`);
    const r = await migrar({ db, aplicar });
    const verbo = aplicar ? 'criadas' : 'seriam criadas';
    console.log(`${PREFIXO_LOG} ${r.criadas} ${verbo} · ${r.jaExistiam} já tinham matrícula · ${r.semConta} liberações sem conta (puladas)`);
  } finally {
    await conexao.close();
  }
}

const executadoDireto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executadoDireto) {
  principal().catch((err) => {
    console.error(`${PREFIXO_LOG} erro:`, err?.message || err);
    process.exitCode = 1;
  });
}
