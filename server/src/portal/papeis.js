// =============================================================
// COMPLEXO DMC · Portal — papéis (PURO; importado por auth.js)
// PORTAL-API §4.1 · dono: F0a.
//
// Regra (DC-17): `isAdmin` MANDA. `papel:'admin'` gravado sem
// `isAdmin:true` NÃO dá privilégio — o requireAdmin legado continua
// lendo `isAdmin`, e esta função é coerente com ele. Usuário antigo
// sem `papel` é derivado: admin se isAdmin, senão aluno.
// =============================================================

export const PAPEIS = Object.freeze(['aluno', 'professor', 'admin']);

/** Rótulo de interface: "Coordenação" é o nome do admin nas telas. */
export const ROTULOS_PAPEL = Object.freeze({ aluno: 'Aluno', professor: 'Professor', admin: 'Coordenação' });

/**
 * Papel efetivo do usuário.
 * @param {object|null|undefined} user documento de `users` (ou req.user)
 * @returns {'aluno'|'professor'|'admin'|null}
 */
export function papelDe(user) {
  if (!user || typeof user !== 'object') return null;
  if (user.isAdmin === true) return 'admin';
  if (user.papel === 'professor') return 'professor';
  return 'aluno';
}

export const ehAdmin = u => papelDe(u) === 'admin';
export const ehProfessor = u => papelDe(u) === 'professor';
export const ehEquipe = u => ehAdmin(u) || ehProfessor(u);
