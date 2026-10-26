// =============================================================
// COMPLEXO DMC · Migração: mascarar valores sensíveis antigos da auditoria
// PORTAL-API §3.3 (mascaramento em `mudancas`) · dono: F0m (achado G2, LGPD).
//
// Por quê: até a correção, `nomeSocial` e `redes.*` entravam em claro em
// `auditoria.mudancas` (de/para). A coleção é só de inserção e sem TTL, então
// o valor sobrevivia à revogação do consentimento, embora a tela diga que o
// dado "é apagado agora". Esta migração troca esses valores por '(alterado)'
// — o mesmo critério de `campoSensivel` — e não mexe em mais nada.
//
//   cd server
//   MONGODB_DB=complexodmc_portal_f0m_qa node scripts/mascarar-auditoria.js            # simulação (padrão)
//   MONGODB_DB=complexodmc_portal_f0m_qa node scripts/mascarar-auditoria.js --aplicar  # grava
//
// Regras: MONGODB_DB obrigatório; simulação por padrão (só lê); idempotente
// (registro já mascarado é pulado); só `mudancas` muda, nada é apagado; com
// algo mascarado, grava o rastro `auditoria.registros_mascarados` (sistema).
// Banco que não termina em `_qa` só com --aplicar E --confirmar-banco=<nome do
// banco> (o banco do Daniel só com autorização dele, índice §3.4).
// =============================================================
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { mascararMudancasLegadas } from '../src/portal/auditoria.js';

async function principal() {
  const banco = (process.env.MONGODB_DB || '').trim();
  const uri = (process.env.MONGODB_URI || '').trim();
  const aplicar = process.argv.includes('--aplicar');
  const confirmacao = (process.argv.find(a => a.startsWith('--confirmar-banco=')) || '').split('=')[1] || '';
  if (!banco) { console.error('[mascarar-auditoria] MONGODB_DB é obrigatório. Nada foi feito.'); process.exitCode = 2; return; }
  if (!uri) { console.error('[mascarar-auditoria] MONGODB_URI ausente. Nada foi feito.'); process.exitCode = 2; return; }
  if (aplicar && !/_qa$/.test(banco) && confirmacao !== banco) {
    console.error(`[mascarar-auditoria] banco "${banco}" não é de QA: para gravar, repita com --confirmar-banco=${banco} (só com autorização do responsável). Nada foi feito.`);
    process.exitCode = 2;
    return;
  }
  const { MongoClient } = await import('mongodb');
  const conexao = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await conexao.connect();
  try {
    const db = conexao.db(banco);
    console.log(`[mascarar-auditoria] banco "${banco}" — ${aplicar ? 'APLICANDO' : 'simulação (use --aplicar para gravar)'}`);
    const r = await mascararMudancasLegadas({ repo: nome => db.collection(nome), aplicar });
    console.log(`[mascarar-auditoria] registros com valor sensível: ${r.candidatos} · entradas: ${r.entradas} · ${aplicar ? `mascarados: ${r.mascarados}` : 'nada gravado'}`);
  } finally {
    await conexao.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  principal().catch(err => { console.error(`[mascarar-auditoria] falhou: ${err?.name || 'Error'}: ${String(err?.message || '').slice(0, 200)}`); process.exitCode = 1; });
}
