// =============================================================
// COMPLEXO DMC · Semente de QA do Portal (contas por papel)
// PORTAL-API §5.3 item 6 · índice §9.1 · dono: F0m.
//
// SÓ para bancos de QA locais. Recusa, ANTES de conectar:
//   - MONGODB_DB ausente ou que não termine em "_qa";
//   - MONGODB_URI que não seja mongodb:// com todos os hosts em 127.0.0.1.
// Nunca toca em complexodmc_local nem em banco remoto.
//
//   cd server
//   MONGODB_DB=complexodmc_portal_f0m_qa node scripts/seed-portal-qa.js            # simulação (padrão)
//   MONGODB_DB=complexodmc_portal_f0m_qa node scripts/seed-portal-qa.js --aplicar  # grava
//   … --aplicar --senha="senha-de-qa-123"   # define/redefine a senha de TODAS as contas de QA
//
// Rode antes `node scripts/seed.js` no MESMO banco (cursos). Idempotente
// (upsert por e-mail, liberação e docência); nunca apaga nada. Contas
// criadas sem --senha recebem uma senha aleatória, mostrada uma vez.
// Dados fictícios (domínio .invalid), marcados com semeadoPor.
// =============================================================
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const MARCA = 'seed-portal-qa';

/** Contas semeadas (e-mails fictícios). `curso`: liberação no 1º curso; `docente`: docência geral nele. */
export const CONTAS_QA = Object.freeze([
  Object.freeze({ email: 'qa-admin@exemplo.invalid', nome: 'Coordenação QA', papel: 'admin', emailVerificado: true }),
  Object.freeze({ email: 'qa-professor@exemplo.invalid', nome: 'Professor QA', papel: 'professor', emailVerificado: true, docente: true }),
  Object.freeze({ email: 'qa-aluno-a@exemplo.invalid', nome: 'Aluno QA A', papel: 'aluno', curso: true }),
  Object.freeze({ email: 'qa-aluno-b@exemplo.invalid', nome: 'Aluno QA B', papel: 'aluno', curso: true }),
  Object.freeze({ email: 'qa-sem-acesso@exemplo.invalid', nome: 'Aluno QA sem acesso', papel: 'aluno' }),
  Object.freeze({ email: 'qa-temporaria@exemplo.invalid', nome: 'Aluno QA com senha temporária', papel: 'aluno', senhaTemporaria: true })
]);

/**
 * Confere o alvo SEM conectar. → { ok:true, uri, db } | { ok:false, motivo }.
 * Só `mongodb://` (nunca +srv) com todos os hosts 127.0.0.1 e banco terminado em `_qa`
 * (e diferente de complexodmc_local, por garantia).
 */
export function conferirAlvoQa({ uri, db } = {}) {
  const banco = typeof db === 'string' ? db.trim() : '';
  if (!banco) return { ok: false, motivo: 'MONGODB_DB é obrigatório (banco de QA terminado em _qa).' };
  if (!/^[A-Za-z0-9_-]+_qa$/.test(banco) || banco === 'complexodmc_local') {
    return { ok: false, motivo: `banco "${banco}" recusado: só bancos de QA terminados em _qa.` };
  }
  const u = typeof uri === 'string' ? uri.trim() : '';
  const m = /^mongodb:\/\/(?:[^@/]*@)?([^/?#]+)(?:[/?#]|$)/.exec(u);
  if (!m) return { ok: false, motivo: 'MONGODB_URI recusada: só mongodb:// local (127.0.0.1).' };
  const hosts = m[1].split(',').map(h => h.trim().replace(/:\d+$/, ''));
  if (!hosts.length || hosts.some(h => h !== '127.0.0.1')) {
    return { ok: false, motivo: 'MONGODB_URI recusada: todos os hosts precisam ser 127.0.0.1.' };
  }
  return { ok: true, uri: u, db: banco };
}

function argumento(nome) {
  const prefixo = `--${nome}=`;
  const i = process.argv.findIndex(a => a.startsWith(prefixo));
  if (i === -1) return '';
  const partes = [process.argv[i].slice(prefixo.length)];
  for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith('--'); j++) partes.push(process.argv[j]);
  return partes.join(' ').trim();
}

function senhaAleatoria() {
  return randomBytes(12).toString('base64url');
}

async function principal() {
  const alvo = conferirAlvoQa({ uri: process.env.MONGODB_URI, db: process.env.MONGODB_DB });
  if (!alvo.ok) {
    console.error(`[seed-portal-qa] ${alvo.motivo} Nada foi feito.`);
    process.exitCode = 2;
    return;
  }
  const aplicar = process.argv.includes('--aplicar');
  const senhaArg = argumento('senha');
  if (senhaArg && Buffer.byteLength(senhaArg, 'utf8') < 8) {
    console.error('[seed-portal-qa] --senha precisa ter pelo menos 8 caracteres.');
    process.exitCode = 1;
    return;
  }

  // Só agora (alvo conferido) conecta — direto no alvo conferido, sem o ensureIndexes do db.js
  // (a simulação não grava nada, nem índice).
  const { MongoClient } = await import('mongodb');
  const { hashSenha } = await import('../src/auth.js');
  const { criarGarantiaIndices, especificacoesRegistradas } = await import('../src/portal/indices.js');

  console.log(`[seed-portal-qa] banco "${alvo.db}" em 127.0.0.1 — ${aplicar ? 'APLICANDO' : 'simulação (use --aplicar para gravar)'}`);
  const conexao = new MongoClient(alvo.uri, { serverSelectionTimeoutMS: 5000 });
  await conexao.connect();
  const db = conexao.db(alvo.db);
  const getDb = () => db;
  const col = {
    users: () => db.collection('users'),
    cursos: () => db.collection('cursos'),
    liberacoes: () => db.collection('liberacoes')
  };
  try {
    const agora = new Date();
    const curso = await col.cursos().find({}, { projection: { _id: 1, titulo: 1 } }).sort({ ordem: 1 }).limit(1).next();
    if (!curso) console.warn('[seed-portal-qa] nenhum curso no banco: rode `node scripts/seed.js` antes. Liberações e docência ficam de fora.');

    if (aplicar) {
      await criarGarantiaIndices({ getDb, log: console }).garantir();
      console.log(`[seed-portal-qa] índices do núcleo do portal garantidos (${especificacoesRegistradas().length}).`);
    }

    const senhasNovas = [];
    for (const conta of CONTAS_QA) {
      const existente = await col.users().findOne({ email: conta.email }, { projection: { _id: 1 } });
      const set = {
        nome: conta.nome,
        papel: conta.papel,
        isAdmin: conta.papel === 'admin', // invariante: papel 'admin' ⇔ isAdmin true, no mesmo $set
        semeadoPor: MARCA,
        updatedAt: agora
      };
      if (conta.emailVerificado) set.emailVerificadoEm = agora;
      let senha = null;
      if (senhaArg) senha = senhaArg;
      else if (!existente) senha = senhaAleatoria();
      if (senha) {
        set.senhaHash = await hashSenha(senha);
        set.senhaAlteradaEm = agora;
      }
      if (conta.senhaTemporaria && senha) {
        set.senhaTemporaria = true;
        set.senhaTemporariaExpiraEm = new Date(agora.getTime() + 72 * 3600 * 1000);
      }
      const acao = existente ? 'atualizar' : 'criar';
      console.log(`  ${acao.padEnd(9)} ${conta.email} (${conta.papel})${conta.curso && curso ? ` · liberação em ${curso._id}` : ''}${conta.docente && curso ? ` · docência geral em ${curso._id}` : ''}`);
      if (!aplicar) continue;

      await col.users().updateOne(
        { email: conta.email },
        { $set: set, $setOnInsert: { email: conta.email, createdAt: agora, sessaoVersao: 0 } },
        { upsert: true }
      );
      if (senha && !senhaArg) senhasNovas.push([conta.email, senha]);
      const user = await col.users().findOne({ email: conta.email }, { projection: { _id: 1 } });
      const userId = String(user._id);
      if (conta.curso && curso) {
        await col.liberacoes().updateOne(
          { userId, cursoId: String(curso._id) },
          { $setOnInsert: { userId, cursoId: String(curso._id), grantedAt: agora, grantedBy: MARCA } },
          { upsert: true }
        );
      }
      if (conta.docente && curso) {
        await getDb().collection('docencias').updateOne(
          { userId, cursoId: String(curso._id), turmaId: null },
          { $setOnInsert: { userId, cursoId: String(curso._id), turmaId: null, criadoEm: agora, criadoPor: MARCA } },
          { upsert: true }
        );
      }
    }

    if (aplicar) {
      if (senhasNovas.length) {
        console.log('[seed-portal-qa] senhas geradas (mostradas só agora; banco de QA):');
        for (const [email, senha] of senhasNovas) console.log(`  ${email}  ${senha}`);
      }
      if (senhaArg) console.log('[seed-portal-qa] todas as contas de QA ficaram com a senha informada em --senha.');
      console.log('[seed-portal-qa] concluído.');
    }
  } finally {
    await conexao.close();
  }
}

const executadoDireto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executadoDireto) {
  principal().catch((err) => {
    console.error('[seed-portal-qa] erro:', err?.message || err);
    process.exitCode = 1;
  });
}
