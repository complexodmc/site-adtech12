// =============================================================
// COMPLEXO DMC · Cria (ou promove) um administrador
// Equivalente ao antigo database/dev-usuario-teste.sql.
//
//   npm run create-admin -- --email=x@y.com --senha=segredo --nome="Fulano"
//
// Se o e-mail já existir, só promove a admin (e troca a senha
// quando --senha for informado). Rodar de novo é seguro.
// =============================================================
import { connect, close, col } from '../src/db.js';
import { hashSenha } from '../src/auth.js';

function arg(nome) {
  const prefixo = `--${nome}=`;
  const achado = process.argv.find(a => a.startsWith(prefixo));
  return achado ? achado.slice(prefixo.length).trim() : '';
}

const email = arg('email').toLowerCase();
const senha = arg('senha');
const nome = arg('nome');

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Uso: npm run create-admin -- --email=admin@dominio.com --senha=segredo [--nome="Nome"]');
  process.exit(1);
}

await connect();

try {
  const existente = await col.users().findOne({ email });

  if (existente) {
    const set = { isAdmin: true, updatedAt: new Date() };
    if (senha) {
      if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
      set.senhaHash = await hashSenha(senha);
    }
    if (nome) set.nome = nome;

    await col.users().updateOne({ _id: existente._id }, { $set: set });
    console.log(`[admin] ${email} promovido a administrador${senha ? ' (senha atualizada)' : ''}.`);
  } else {
    if (senha.length < 6) throw new Error('Informe --senha com pelo menos 6 caracteres para criar a conta.');
    await col.users().insertOne({
      email,
      senhaHash: await hashSenha(senha),
      nome: nome || email.split('@')[0],
      isAdmin: true,
      createdAt: new Date()
    });
    console.log(`[admin] conta ${email} criada como administrador.`);
  }
} catch (err) {
  console.error('[admin] erro:', err.message);
  process.exitCode = 1;
} finally {
  await close();
}
