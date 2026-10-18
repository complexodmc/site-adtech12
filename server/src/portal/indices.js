// =============================================================
// COMPLEXO DMC · Portal — índices das coleções novas (sem editar db.js)
// PORTAL-API §3.1, §3.3, §4.3, §5.2 · índice §3.4 · dono: F0m.
//
// Cada módulo dono registra as PRÓPRIAS especificações com
// `registrarIndices([...])` (no carregamento ou no `montar(ctx)`); o
// agregador chama `garantir()` por requisição de /api/auth/* e
// /api/portal/*, memoizado POR NOME: cada especificação vira UM
// `createIndex` por processo; uma registrada depois roda na chamada
// seguinte; erro 85/86 (índice já existe com outra forma) só loga e
// segue; erro de rede zera o memo daquela especificação e a próxima
// requisição tenta de novo (o agregador responde 503).
//
// Nomes explícitos e únicos: `uq_*` único, `ix_*` comum, `ttl_*`
// expiração (`expireAfterSeconds`). O registro recusa (erro de
// programação) mesmo nome com outra forma e mesma chave com outro nome
// — os dois virariam erro 85/86 no Mongo de verdade.
//
// O núcleo (F0a/F0m) registra aqui as coleções que escreve: `limites`,
// `auditoria`, `notificacoes`, `arquivos` e `erros_servidor`
// (`notificacoes_estado` só usa o _id). As da F0t (perfis,
// consentimentos, auth_2fa, auth_tokens, cache_cep, docencias e
// `ix_users_papel`) são registradas pelos módulos dela.
// =============================================================
import { resumirErro } from './erros.js';

export const NOME_INDICE_RE = /^(uq|ix|ttl)_[a-z0-9_]+$/;

const registro = new Map(); // nome → especificação congelada

function plano(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof RegExp);
}

function canon(v) {
  if (v instanceof RegExp) return { $regex: v.source, $options: v.flags };
  if (Array.isArray(v)) return v.map(canon);
  if (plano(v)) {
    const o = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = canon(v[k]);
    return o;
  }
  return v;
}

/** Chave em ordem (a ordem dos campos importa num índice composto). */
const chaveTexto = chave => JSON.stringify(Object.entries(chave));
const opcoesTexto = opcoes => JSON.stringify(canon({
  unique: opcoes.unique === true,
  sparse: opcoes.sparse === true,
  expireAfterSeconds: opcoes.expireAfterSeconds ?? null,
  partialFilterExpression: opcoes.partialFilterExpression ?? null
}));
const filtroParcialTexto = opcoes => JSON.stringify(canon(opcoes.partialFilterExpression ?? null));

function congelar(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    for (const v of Object.values(o)) congelar(v);
    Object.freeze(o);
  }
  return o;
}

function normalizar(spec) {
  if (!plano(spec) || typeof spec.colecao !== 'string' || !/^[a-z][a-z0-9_]*$/.test(spec.colecao)) {
    throw new TypeError('registrarIndices: especificação sem `colecao` válida.');
  }
  if (!plano(spec.chave) || !Object.keys(spec.chave).length) throw new TypeError(`registrarIndices: ${spec.colecao} sem \`chave\`.`);
  for (const [campo, dir] of Object.entries(spec.chave)) {
    if (!campo || (dir !== 1 && dir !== -1)) throw new TypeError(`registrarIndices: ${spec.colecao}.${campo} precisa de direção 1 ou -1.`);
  }
  const opcoes = { ...(spec.opcoes || {}) };
  const nome = opcoes.name;
  if (typeof nome !== 'string' || !NOME_INDICE_RE.test(nome)) throw new TypeError(`registrarIndices: nome ausente ou fora do padrão uq_/ix_/ttl_ (${String(nome)}).`);
  if (nome.startsWith('uq_') && opcoes.unique !== true) throw new TypeError(`registrarIndices: ${nome} começa com uq_ e não é único.`);
  if (!nome.startsWith('uq_') && opcoes.unique === true) throw new TypeError(`registrarIndices: ${nome} é único e não começa com uq_.`);
  if (nome.startsWith('ttl_') !== Number.isInteger(opcoes.expireAfterSeconds)) {
    throw new TypeError(`registrarIndices: ${nome} — ttl_ exige expireAfterSeconds inteiro (e só ttl_ o usa).`);
  }
  return congelar({ colecao: spec.colecao, chave: { ...spec.chave }, opcoes: canon(opcoes) });
}

function conflito(mensagem) {
  const e = new Error(mensagem);
  e.codigo = 'indice-conflitante';
  return e;
}

/**
 * Registra especificações `{ colecao, chave, opcoes:{ name, unique?, partialFilterExpression?, expireAfterSeconds? } }`.
 * Idempotente para especificação idêntica; conflito (mesmo nome com outra forma, ou mesma
 * chave com outro nome na mesma coleção) → lança e NADA do lote é registrado.
 */
export function registrarIndices(especificacoes) {
  const lista = Array.isArray(especificacoes) ? especificacoes : [especificacoes];
  const novos = [];
  for (const bruta of lista) {
    const spec = normalizar(bruta);
    const nome = spec.opcoes.name;
    const existente = registro.get(nome) || novos.find(s => s.opcoes.name === nome);
    if (existente) {
      const mesma = existente.colecao === spec.colecao && chaveTexto(existente.chave) === chaveTexto(spec.chave)
        && opcoesTexto(existente.opcoes) === opcoesTexto(spec.opcoes);
      if (!mesma) throw conflito(`Índice ${nome} já registrado com outra forma.`);
      continue;
    }
    for (const s of [...registro.values(), ...novos]) {
      if (s.colecao === spec.colecao && chaveTexto(s.chave) === chaveTexto(spec.chave)
        && filtroParcialTexto(s.opcoes) === filtroParcialTexto(spec.opcoes)) {
        throw conflito(`Índice ${nome} repete a chave de ${s.opcoes.name} em ${spec.colecao}.`);
      }
    }
    novos.push(spec);
  }
  for (const s of novos) registro.set(s.opcoes.name, s);
}

/** Cópia somente-leitura das especificações registradas (ordem de registro). */
export function especificacoesRegistradas() {
  return Object.freeze([...registro.values()]);
}

/** Especificações registradas das coleções pedidas (ex.: auth-extra garante só as dele). */
export function especificacoesDasColecoes(colecoes) {
  const alvo = new Set(colecoes);
  return especificacoesRegistradas().filter(s => alvo.has(s.colecao));
}

/** Índices do núcleo (coleções da F0a e da F0m; PORTAL-API §3.3). */
export const INDICES_NUCLEO = Object.freeze([
  // limites (contador persistente, limitador.js)
  { colecao: 'limites', chave: { chave: 1 }, opcoes: { name: 'uq_limites_chave', unique: true } },
  { colecao: 'limites', chave: { expiraEm: 1 }, opcoes: { name: 'ttl_limites', expireAfterSeconds: 0 } },
  // auditoria (só inserção; sem TTL — retenção é decisão do CEO, API §13)
  { colecao: 'auditoria', chave: { em: -1 }, opcoes: { name: 'ix_aud_em' } },
  { colecao: 'auditoria', chave: { alvoUserId: 1, em: -1 }, opcoes: { name: 'ix_aud_alvo' } },
  { colecao: 'auditoria', chave: { acao: 1, em: -1 }, opcoes: { name: 'ix_aud_acao' } },
  { colecao: 'auditoria', chave: { 'ator.userId': 1, em: -1 }, opcoes: { name: 'ix_aud_ator' } },
  { colecao: 'auditoria', chave: { 'entidade.tipo': 1, 'entidade.id': 1, em: -1 }, opcoes: { name: 'ix_aud_entidade' } },
  { colecao: 'auditoria', chave: { cursoId: 1, em: -1 }, opcoes: { name: 'ix_aud_curso' } },
  // notificações (dedupe por chave; expiração pela retenção)
  { colecao: 'notificacoes', chave: { userId: 1, lida: 1, criadaEm: -1 }, opcoes: { name: 'ix_not_user' } },
  { colecao: 'notificacoes', chave: { userId: 1, chave: 1 }, opcoes: { name: 'uq_not_chave', unique: true, partialFilterExpression: { chave: { $type: 'string' } } } },
  { colecao: 'notificacoes', chave: { expiraEm: 1 }, opcoes: { name: 'ttl_not', expireAfterSeconds: 0 } },
  // arquivos (binários no Mongo)
  { colecao: 'arquivos', chave: { contexto: 1, 'ref.entidadeId': 1 }, opcoes: { name: 'ix_arq_contexto' } },
  { colecao: 'arquivos', chave: { donoUserId: 1, contexto: 1 }, opcoes: { name: 'ix_arq_dono' } },
  { colecao: 'arquivos', chave: { 'ref.moduloId': 1 }, opcoes: { name: 'ix_arq_modulo', partialFilterExpression: { 'ref.moduloId': { $type: 'string' } } } },
  // erros_servidor (F0a, erros.js; TTL de 30 dias pelo próprio expiraEm)
  { colecao: 'erros_servidor', chave: { rota: 1, em: -1 }, opcoes: { name: 'ix_err_rota' } },
  { colecao: 'erros_servidor', chave: { expiraEm: 1 }, opcoes: { name: 'ttl_err', expireAfterSeconds: 0 } }
].map(congelar));

registrarIndices(INDICES_NUCLEO);

/** Erro de forma de índice (já existe com outra definição) — não adianta tentar de novo. */
function ehConflitoDeForma(err) {
  return !!err && (err.code === 85 || err.code === 86 || err.codeName === 'IndexOptionsConflict' || err.codeName === 'IndexKeySpecsConflict');
}

/**
 * Garantia de índices memoizada por nome.
 * @param {{ getDb: () => { collection(nome) }, log?: Console, especificacoes?: object[] }} deps
 *   especificacoes: lista fixa (ex.: auth-extra); sem ela, lê o registro a cada chamada.
 */
export function criarGarantiaIndices({ getDb, log = console, especificacoes = null } = {}) {
  if (typeof getDb !== 'function') throw new TypeError('criarGarantiaIndices: informe getDb.');
  const feitos = new Set();
  const emAndamento = new Map();

  function garantirUm(spec) {
    const nome = spec.opcoes.name;
    if (feitos.has(nome)) return null;
    if (emAndamento.has(nome)) return emAndamento.get(nome);
    const p = (async () => {
      try {
        await getDb().collection(spec.colecao).createIndex(spec.chave, spec.opcoes);
        feitos.add(nome);
      } catch (err) {
        if (!ehConflitoDeForma(err)) throw err;
        feitos.add(nome); // não adianta repetir: a forma no banco é outra (decisão humana)
        const r = resumirErro(err);
        try { log.error(JSON.stringify({ nivel: 'erro', evento: 'portal.indice', indice: nome, colecao: spec.colecao, erroResumido: r })); } catch { /* nada */ }
      } finally {
        emAndamento.delete(nome);
      }
    })();
    emAndamento.set(nome, p);
    return p;
  }

  async function garantir() {
    const specs = especificacoes || especificacoesRegistradas();
    const pendentes = [];
    for (const s of specs) {
      const p = garantirUm(s);
      if (p) pendentes.push(p);
    }
    if (!pendentes.length) return;
    const resultados = await Promise.allSettled(pendentes);
    const falha = resultados.find(r => r.status === 'rejected');
    if (falha) throw falha.reason;
  }

  return {
    garantir,
    middleware(_req, _res, next) {
      garantir().then(() => next(), next);
    },
    /** Nomes já criados (ou aceitos com conflito de forma) nesta instância — diagnóstico. */
    feitos: () => [...feitos]
  };
}
