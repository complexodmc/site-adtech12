// =============================================================
// COMPLEXO DMC · Portal — trilha de auditoria (coleção `auditoria`)
// PORTAL-API §3.3 (auditoria), §3.4, §4.8 · dono: F0m.
//
// - registrar(evento, req): melhor esforço (grava `concluido`; falha só
//   loga e devolve null). Para as ações SEM asterisco de §3.4.
// - executar(evento, req, mutacao): grava `registrado` ANTES; se não
//   gravar → ErroPortal(503, 'auditoria-indisponivel') e a mutação NÃO
//   roda. Depois marca `concluido` ou `falhou` (+ erro ≤ 300) e relança.
//   Para as ações COM asterisco de §3.4.
// - mudancas(antes, depois, campos): [{ campo, de, para }] só do que
//   mudou, com o mascaramento de §3.3 (CPF, passaporte, RG, gênero,
//   etnia, foto, senhas, chaves e segredos → '(alterado)').
//
// Só inserção: nenhuma rota altera ou apaga registro (só estado,
// concluidoEm e erro mudam, uma vez). Ator vem do req (papelDe e IP
// truncado); req null = sistema.
// =============================================================
import { ObjectId } from 'mongodb';
import { papelDe } from './papeis.js';
import { ErroPortal, resumirErro } from './erros.js';
import { truncarIp } from './validacao.js';

export const MASCARA = '(alterado)';
export const ACAO_RE = /^[a-z][a-z0-9_]*\.[a-z0-9][a-z0-9_]*$/;
export const ESTADOS_AUDITORIA = Object.freeze(['registrado', 'concluido', 'falhou']);

// Campo sensível em qualquer nível do caminho ('perfil.cpf', 'rg.numero', 'passaporte', 'segredo2fa'…).
const SENSIVEL_RE = /^(cpf|passaporte.*|rg.*|genero|etnia|foto.*|.*senha.*|.*segredo.*|chave.*|apikey|.*token.*|codigos)$/i;

/** O campo grava '(alterado)' em vez do valor (API §3.3). */
export function campoSensivel(campo) {
  return String(campo ?? '').split('.').some(parte => SENSIVEL_RE.test(parte));
}

function valorDe(obj, caminho) {
  let a = obj;
  for (const p of String(caminho).split('.')) {
    if (a === null || a === undefined || typeof a !== 'object') return undefined;
    a = a[p];
  }
  return a;
}

function normal(v) {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === 'object' && typeof v.toHexString === 'function') return v.toHexString();
  if (Array.isArray(v)) return v.map(normal);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = normal(v[k]);
    return o;
  }
  return v;
}

const iguais = (a, b) => JSON.stringify(normal(a)) === JSON.stringify(normal(b));

/** Mudanças entre dois estados nos campos pedidos (caminhos com ponto), já mascaradas. */
export function calcularMudancas(antes, depois, campos) {
  const lista = Array.isArray(campos) ? campos : [];
  const out = [];
  for (const campo of lista) {
    const de = valorDe(antes, campo);
    const para = valorDe(depois, campo);
    if (iguais(de, para)) continue;
    out.push(campoSensivel(campo) ? { campo, de: MASCARA, para: MASCARA } : { campo, de: normal(de), para: normal(para) });
  }
  return out;
}

function mascararLista(mudancas) {
  if (!Array.isArray(mudancas)) return null;
  return mudancas
    .filter(m => m && typeof m.campo === 'string')
    .map(m => (campoSensivel(m.campo) ? { campo: m.campo, de: MASCARA, para: MASCARA } : { campo: m.campo, de: normal(m.de), para: normal(m.para) }));
}

function atorDe(req) {
  if (!req) return { userId: null, papel: 'sistema', ipTruncado: null };
  const user = req.user;
  return {
    userId: user?._id ? String(user._id) : null,
    papel: user ? papelDe(user) : 'anonimo',
    ipTruncado: truncarIp(req.ip) ?? null
  };
}

function conferirEvento(evento) {
  if (!evento || typeof evento !== 'object') throw new TypeError('auditoria: evento ausente.');
  if (typeof evento.acao !== 'string' || !ACAO_RE.test(evento.acao)) throw new TypeError(`auditoria: acao inválida (${String(evento.acao)}).`);
  const ent = evento.entidade;
  if (!ent || typeof ent.tipo !== 'string' || !ent.tipo || ent.id === undefined || ent.id === null || String(ent.id) === '') {
    throw new TypeError(`auditoria: ${evento.acao} sem entidade { tipo, id }.`);
  }
}

const textoOuNulo = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function extraSeguro(extra) {
  if (extra === undefined || extra === null) return null;
  if (typeof extra !== 'object' || Array.isArray(extra)) return { valor: normal(extra) };
  return normal(extra);
}

/**
 * @param {{ repo: (nome: string) => object, agora?: () => Date, log?: Console }} deps
 */
export function criarAuditoria({ repo, agora = () => new Date(), log = console } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarAuditoria: informe repo(nome).');
  const colecao = () => repo('auditoria');

  function documento(evento, req, estado) {
    const em = agora();
    return {
      em,
      acao: evento.acao,
      ator: atorDe(req),
      alvoUserId: evento.alvoUserId === undefined || evento.alvoUserId === null ? null : String(evento.alvoUserId),
      cursoId: evento.cursoId === undefined || evento.cursoId === null ? null : String(evento.cursoId),
      entidade: { tipo: evento.entidade.tipo, id: String(normal(evento.entidade.id)) },
      mudancas: mascararLista(evento.mudancas),
      motivo: textoOuNulo(evento.motivo, 1000),
      extra: extraSeguro(evento.extra),
      estado,
      concluidoEm: estado === 'concluido' ? em : null,
      erro: null
    };
  }

  function logar(texto, err) {
    try {
      const r = err ? resumirErro(err) : null;
      log.error(JSON.stringify({ nivel: 'erro', evento: 'portal.auditoria', texto, ...(r ? { erroResumido: r } : {}) }));
    } catch { /* nada */ }
  }

  /** Melhor esforço: grava já `concluido`. → id (hex) ou null. Evento malformado também só loga. */
  async function registrar(evento, req = null) {
    try {
      conferirEvento(evento);
      const r = await colecao().insertOne(documento(evento, req, 'concluido'));
      return r?.insertedId ? String(r.insertedId) : null;
    } catch (err) {
      logar(`registro de auditoria não gravado (${evento?.acao ?? '?'})`, err);
      return null;
    }
  }

  async function finalizar(id, estado, err = null) {
    try {
      const set = { estado, concluidoEm: agora() };
      if (err) { const r = resumirErro(err); set.erro = `${r.nome}: ${r.mensagem}`.slice(0, 300); }
      await colecao().updateOne({ _id: id, estado: 'registrado' }, { $set: set });
    } catch (e) {
      logar(`estado da auditoria não atualizado (${estado})`, e);
    }
  }

  /**
   * Registra ANTES e só então executa a mutação. Sem registro, nada muda (503).
   * Evento malformado é erro de programação: lança TypeError sem executar nada.
   */
  async function executar(evento, req, mutacao) {
    conferirEvento(evento);
    if (typeof mutacao !== 'function') throw new TypeError('auditoria.executar: informe a mutação.');
    let id;
    try {
      const r = await colecao().insertOne(documento(evento, req, 'registrado'));
      id = r?.insertedId instanceof ObjectId ? r.insertedId : (r?.insertedId ?? null);
      if (!id) throw new Error('auditoria: inserção sem id');
    } catch (err) {
      throw new ErroPortal(503, 'auditoria-indisponivel', undefined, { causa: err });
    }
    let resultado;
    try {
      resultado = await mutacao();
    } catch (err) {
      await finalizar(id, 'falhou', err);
      throw err;
    }
    await finalizar(id, 'concluido');
    return resultado;
  }

  return Object.freeze({ registrar, executar, mudancas: calcularMudancas });
}
