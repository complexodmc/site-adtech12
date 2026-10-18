// =============================================================
// COMPLEXO DMC · Portal — leitura de perfis (serviços `perfis.*`)
// PORTAL-API §3.3 (perfis), §4.4, §6.3.1 · índice D-37/D-59 · dono: F0m.
//
// Só LÊ `users` e `perfis` (a escrita de `perfis` é da F0t). Dois
// serviços de nome fixo, mais a função pura da completude do cadastro
// (a F0t usa a mesma no GET /portal/me/perfil, para as duas telas
// darem o mesmo "completo"):
//   perfis.publicos(userIds)   → Map<userId, { id, nome, nomeSocial, email, fotoUrl }>
//                                (o que professor e colegas de equipe podem ver; NUNCA CPF/RG/endereço)
//   perfis.identificacao(userId) → { nomeRegistro, documento, email, completo, faltando }
//                                (uso interno: declarações, certificados, contratos, quitação)
// =============================================================
import { ObjectId } from 'mongodb';
import { ID_RE, ehBrasil, normalizarNome } from './validacao.js';

const vazioOuNulo = v => v === undefined || v === null || (typeof v === 'string' && !v.trim());

function precisaDeCpf(perfil) {
  const nac = normalizarNome(perfil?.nacionalidade || '');
  const brasileiro = !nac || nac.startsWith('brasil');
  return brasileiro || ehBrasil(perfil?.endereco?.pais);
}

/**
 * Completude do cadastro (API §6.3.1: obrigatórios para "cadastro completo"). Pura.
 * `faltando` usa os nomes de campo do perfil ('cpf', 'endereco.cep', …).
 * @returns {{ completo:boolean, pct:number, faltando:string[] }}
 */
export function calcularCompletude(perfil, { email = null } = {}) {
  const p = perfil || {};
  const exigidos = [];
  const marcar = (campo, ok) => exigidos.push([campo, !!ok]);

  marcar('nomeRegistro', !vazioOuNulo(p.nomeRegistro));
  if (precisaDeCpf(p)) marcar('cpf', !vazioOuNulo(p.cpf));
  else marcar('passaporte', !vazioOuNulo(p.cpf) || (!vazioOuNulo(p.passaporte?.numero) && !vazioOuNulo(p.passaporte?.paisEmissor)));
  marcar('nascimento', !vazioOuNulo(p.nascimento));
  marcar('nacionalidade', !vazioOuNulo(p.nacionalidade));
  marcar('celular', !vazioOuNulo(p.celular));
  marcar('email', !vazioOuNulo(email));
  const e = p.endereco || null;
  marcar('endereco.pais', !!e && (ehBrasil(e.pais) || !vazioOuNulo(e.pais)));
  if (!e || ehBrasil(e.pais)) {
    for (const c of ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf']) marcar(`endereco.${c}`, !!e && !vazioOuNulo(e[c]));
  } else {
    for (const c of ['codigoPostal', 'logradouro', 'cidade']) marcar(`endereco.${c}`, !vazioOuNulo(e[c]));
  }

  const faltando = exigidos.filter(([, ok]) => !ok).map(([c]) => c);
  const pct = Math.round(((exigidos.length - faltando.length) / exigidos.length) * 100);
  return { completo: faltando.length === 0, pct, faltando };
}

const idsValidos = ids => [...new Set((Array.isArray(ids) ? ids : [ids]).map(v => (v === null || v === undefined ? '' : String(v))).filter(v => ID_RE.test(v)))];

/** URL da foto para a equipe (download autenticado por header; 404 sem vínculo — API §6.2). */
export const fotoUrlDaEquipe = userId => `/api/portal/professor/alunos/${userId}/foto`;

/**
 * @param {{ repo: (nome: string) => object }} deps
 */
export function criarPerfisLeitura({ repo } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarPerfisLeitura: informe repo(nome).');

  /**
   * Visão mínima de pessoas (professor, colegas de equipe): nome de exibição (users.nome, que a
   * F0t mantém = nomeSocial || nomeRegistro), nome social (só existe com consentimento), e-mail
   * e foto. Ids inválidos ou inexistentes ficam de fora do Map.
   */
  async function publicos(userIds) {
    const ids = idsValidos(userIds);
    const mapa = new Map();
    if (!ids.length) return mapa;
    const [users, perfis] = await Promise.all([
      repo('users').find({ _id: { $in: ids.map(id => new ObjectId(id)) } }, { projection: { nome: 1, email: 1, temFoto: 1 } }).toArray(),
      repo('perfis').find({ userId: { $in: ids } }, { projection: { userId: 1, nomeSocial: 1 } }).toArray()
    ]);
    const social = new Map(perfis.map(p => [String(p.userId), typeof p.nomeSocial === 'string' && p.nomeSocial.trim() ? p.nomeSocial : null]));
    for (const u of users) {
      const id = String(u._id);
      const email = typeof u.email === 'string' ? u.email : null;
      mapa.set(id, {
        id,
        nome: (typeof u.nome === 'string' && u.nome.trim()) ? u.nome : (email ? email.split('@')[0] : ''),
        nomeSocial: social.get(id) ?? null,
        email,
        fotoUrl: u.temFoto === true ? fotoUrlDaEquipe(id) : null
      });
    }
    return mapa;
  }

  /**
   * Identificação civil para documentos emitidos (uso interno do servidor; nunca vai inteira
   * a professor). Sem perfil: nomeRegistro null, documento null, completo false.
   * @returns {Promise<{ nomeRegistro:string|null, documento:{ tipo:'cpf'|'passaporte', numero:string }|null,
   *   email:string|null, completo:boolean, faltando:string[] }|null>} null quando a conta não existe
   */
  async function identificacao(userId) {
    const id = idsValidos(userId)[0];
    if (!id) return null;
    const [user, perfil] = await Promise.all([
      repo('users').findOne({ _id: new ObjectId(id) }, { projection: { email: 1 } }),
      repo('perfis').findOne({ userId: id }, { projection: { _id: 0 } })
    ]);
    if (!user) return null;
    const email = typeof user.email === 'string' ? user.email : null;
    const documento = !vazioOuNulo(perfil?.cpf)
      ? { tipo: 'cpf', numero: String(perfil.cpf) }
      : (!vazioOuNulo(perfil?.passaporte?.numero) ? { tipo: 'passaporte', numero: String(perfil.passaporte.numero) } : null);
    const { completo, faltando } = calcularCompletude(perfil, { email });
    return {
      nomeRegistro: !vazioOuNulo(perfil?.nomeRegistro) ? perfil.nomeRegistro : null,
      documento,
      email,
      completo,
      faltando
    };
  }

  return Object.freeze({ publicos, identificacao });
}
