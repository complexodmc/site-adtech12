// =============================================================
// COMPLEXO DMC · Apoio de teste — emulador do MongoDB em memória
// PORTAL-API §9.1 · DC-76 · dono: F0a. Não casa com o glob
// server/test/*.test.js (fica em server/test/apoio/).
//
// LISTA FECHADA (contrato da fase 0). Fora dela, lança
//   Error('banco-memoria: <op> não suportado')
// — falha clara no teste, nunca resultado silencioso.
//
//   Coleção: find(filtro, { projection, sort, skip, limit }) → cursor
//            (.sort .skip .limit .project .map .toArray .next .close, for await),
//            findOne, countDocuments, distinct, insertOne, insertMany({ ordered }),
//            updateOne, updateMany, findOneAndUpdate({ returnDocument, upsert,
//            projection, sort, includeResultMetadata }), deleteOne, deleteMany,
//            bulkWrite (insertOne, updateOne, updateMany, deleteOne, deleteMany),
//            createIndex.
//   Atualização: $set $setOnInsert $unset $push($each, $slice) $pull $addToSet($each)
//            $inc $max, com operador posicional `$` (ex.: 'codigos.$.usadoEm').
//   Filtro:  igualdade (caminho com ponto, elemento de array, null = ausente),
//            $eq $in $nin $ne $exists $gt $gte $lt $lte $type $regex/$options
//            $or $and $elemMatch.
//   NÃO há aggregate (regra para todas as fatias: KPIs e contagens por grupo
//   são countDocuments ou find com projeção + agregação em JS).
//
// Índices únicos e parciais são SIMULADOS a partir das MESMAS
// especificações de indices.js → E11000 com keyPattern, keyValue e
// "index: <nome>" na mensagem, como o driver. INDICES_LEGADOS (cópia
// nominal dos índices únicos do db.js no LMS) é SEMPRE somado.
//
// Injeção de falha: banco.falhar.<op> = true | n (próximas n) |
//   'colecao' | (colecao, op) => boolean → MongoNetworkError (caminho 503).
// Corrida: banco.portao = Promise (todas as ops esperam) ou
//   banco.portoes.<op> = Promise (só aquela op). Depois do portão a
//   operação roda de forma síncrona (atômica), como no servidor.
// =============================================================
import { ObjectId, Binary } from 'mongodb';

/** Índices ÚNICOS que o db.js cria nas coleções do LMS e que sustentam regra de negócio (DC-76). */
export const INDICES_LEGADOS = Object.freeze([
  Object.freeze({ colecao: 'users', chave: Object.freeze({ email: 1 }), opcoes: Object.freeze({ name: 'uq_users_email', unique: true }) }),
  Object.freeze({ colecao: 'liberacoes', chave: Object.freeze({ userId: 1, cursoId: 1 }), opcoes: Object.freeze({ name: 'uq_liberacoes', unique: true }) }),
  Object.freeze({ colecao: 'progresso', chave: Object.freeze({ userId: 1, aulaId: 1 }), opcoes: Object.freeze({ name: 'uq_progresso', unique: true }) }),
  Object.freeze({ colecao: 'certificados', chave: Object.freeze({ userId: 1, cursoId: 1 }), opcoes: Object.freeze({ name: 'uq_certificados', unique: true }) }),
  Object.freeze({ colecao: 'certificados', chave: Object.freeze({ codigo: 1 }), opcoes: Object.freeze({ name: 'uq_certificados_codigo', unique: true }) })
]);

const naoSuportado = (op) => new Error(`banco-memoria: ${op} não suportado`);

export function erroDeRede(mensagem = 'banco-memoria: falha de rede simulada') {
  const e = new Error(mensagem);
  e.name = 'MongoNetworkError';
  return e;
}

// ---------- tipos ----------
const ehObjectId = v => v instanceof ObjectId || (v && typeof v === 'object' && v._bsontype === 'ObjectId');
const ehBinario = v => v instanceof Binary || Buffer.isBuffer(v) || v instanceof Uint8Array;
const ehEspecial = v => ehObjectId(v) || v instanceof Date || ehBinario(v) || v instanceof RegExp;
const ehPlano = v => v !== null && typeof v === 'object' && !Array.isArray(v) && !ehEspecial(v);
const ehOperadores = v => ehPlano(v) && Object.keys(v).length > 0 && Object.keys(v).every(k => k.startsWith('$'));
const bytesDe = v => (v instanceof Binary ? Buffer.from(v.buffer) : Buffer.from(v));

function clonar(v) {
  if (v === undefined) return null; // o driver serializa undefined como null
  if (v === null || typeof v !== 'object') return v;
  if (ehObjectId(v)) return new ObjectId(v.toHexString());
  if (v instanceof Date) return new Date(v.getTime());
  if (v instanceof Binary) return new Binary(Buffer.from(v.buffer), v.sub_type);
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return new Binary(Buffer.from(v)); // como o driver devolve
  if (v instanceof RegExp) return new RegExp(v.source, v.flags);
  if (Array.isArray(v)) return v.map(clonar);
  const o = {};
  for (const [k, x] of Object.entries(v)) o[k] = clonar(x);
  return o;
}

function iguais(a, b) {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  if (ehObjectId(a) || ehObjectId(b)) return ehObjectId(a) && ehObjectId(b) && a.toHexString() === b.toHexString();
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (ehBinario(a) || ehBinario(b)) return ehBinario(a) && ehBinario(b) && bytesDe(a).equals(bytesDe(b));
  if (a instanceof RegExp || b instanceof RegExp) return a instanceof RegExp && b instanceof RegExp && String(a) === String(b);
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => iguais(x, b[i]));
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => Object.hasOwn(b, k) && iguais(a[k], b[k]));
  }
  return false;
}

function rank(v) {
  if (v === null || v === undefined) return 1;
  if (typeof v === 'number') return 2;
  if (typeof v === 'string') return 3;
  if (Array.isArray(v)) return 5;
  if (ehBinario(v)) return 6;
  if (ehObjectId(v)) return 7;
  if (typeof v === 'boolean') return 8;
  if (v instanceof Date) return 9;
  if (v instanceof RegExp) return 10;
  return 4;
}

function comparar(a, b) {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  switch (ra) {
    case 1: return 0;
    case 2: return a - b;
    case 3: return a < b ? -1 : a > b ? 1 : 0;
    case 5: {
      for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = comparar(a[i], b[i]); if (c) return c; }
      return a.length - b.length;
    }
    case 6: return Buffer.compare(bytesDe(a), bytesDe(b));
    case 7: { const x = a.toHexString(); const y = b.toHexString(); return x < y ? -1 : x > y ? 1 : 0; }
    case 8: return Number(a) - Number(b);
    case 9: return a.getTime() - b.getTime();
    default: { const x = JSON.stringify(a); const y = JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0; }
  }
}

// ---------- caminhos ----------
/** Valores que existem no caminho (expande arrays como o Mongo). */
function valoresNoCaminho(doc, caminho) {
  let atuais = [doc];
  for (const p of caminho.split('.')) {
    const prox = [];
    for (const a of atuais) {
      if (Array.isArray(a)) {
        if (/^\d+$/.test(p) && Number(p) < a.length) prox.push(a[Number(p)]);
        for (const el of a) if (ehPlano(el) && Object.hasOwn(el, p)) prox.push(el[p]);
      } else if (ehPlano(a) && Object.hasOwn(a, p)) prox.push(a[p]);
    }
    atuais = prox;
  }
  return atuais;
}

function obterCaminho(doc, caminho) {
  let a = doc;
  for (const p of caminho.split('.')) {
    if (a === null || a === undefined) return undefined;
    if (Array.isArray(a) && /^\d+$/.test(p)) a = a[Number(p)];
    else if (ehPlano(a)) a = a[p];
    else return undefined;
  }
  return a;
}

function definirCaminho(doc, caminho, valor) {
  const partes = caminho.split('.');
  let a = doc;
  for (let i = 0; i < partes.length - 1; i++) {
    const p = partes[i];
    const prox = Array.isArray(a) && /^\d+$/.test(p) ? a[Number(p)] : a[p];
    if (prox === null || prox === undefined) {
      const novo = {};
      if (Array.isArray(a) && /^\d+$/.test(p)) a[Number(p)] = novo; else a[p] = novo;
      a = novo;
    } else if (typeof prox !== 'object' || ehEspecial(prox)) {
      throw new Error(`banco-memoria: não é possível criar o campo '${caminho}' dentro de um valor escalar`);
    } else a = prox;
  }
  const ultimo = partes[partes.length - 1];
  if (Array.isArray(a) && /^\d+$/.test(ultimo)) {
    const i = Number(ultimo);
    while (a.length < i) a.push(null);
    a[i] = valor;
  } else a[ultimo] = valor;
}

function apagarCaminho(doc, caminho) {
  const partes = caminho.split('.');
  let a = doc;
  for (let i = 0; i < partes.length - 1; i++) {
    const p = partes[i];
    a = Array.isArray(a) && /^\d+$/.test(p) ? a[Number(p)] : a?.[p];
    if (a === null || a === undefined || typeof a !== 'object') return;
  }
  const ultimo = partes[partes.length - 1];
  if (Array.isArray(a) && /^\d+$/.test(ultimo)) a[Number(ultimo)] = null;
  else if (ehPlano(a)) delete a[ultimo];
}

// ---------- filtro ----------
const TIPOS = {
  1: 'double', 2: 'string', 3: 'object', 4: 'array', 5: 'binData', 7: 'objectId', 8: 'bool', 9: 'date', 10: 'null', 11: 'regex', 16: 'int', 18: 'long'
};
function tipoCasa(v, tipo) {
  const t = typeof tipo === 'number' ? TIPOS[tipo] : tipo;
  switch (t) {
    case 'double': return typeof v === 'number';
    case 'number': return typeof v === 'number';
    case 'int': case 'long': return Number.isInteger(v);
    case 'string': return typeof v === 'string';
    case 'object': return ehPlano(v);
    case 'array': return Array.isArray(v);
    case 'binData': return ehBinario(v);
    case 'objectId': return ehObjectId(v);
    case 'bool': return typeof v === 'boolean';
    case 'date': return v instanceof Date;
    case 'null': return v === null;
    case 'regex': return v instanceof RegExp;
    default: throw naoSuportado(`$type ${String(tipo)}`);
  }
}

const expandir = valores => valores.flatMap(v => (Array.isArray(v) ? [v, ...v] : [v]));

function casaIgualdade(valores, q) {
  if (q instanceof RegExp) return expandir(valores).some(v => typeof v === 'string' && new RegExp(q.source, q.flags.replace('g', '')).test(v));
  if (q === null || q === undefined) return valores.length === 0 || expandir(valores).some(v => v === null || v === undefined);
  return valores.some(v => iguais(v, q) || (Array.isArray(v) && v.some(el => iguais(el, q))));
}

function casaCondicao(valores, ops) {
  for (const [op, q] of Object.entries(ops)) {
    switch (op) {
      case '$eq': if (!casaIgualdade(valores, q)) return false; break;
      case '$ne': if (casaIgualdade(valores, q)) return false; break;
      case '$in':
        if (!Array.isArray(q)) throw new Error('banco-memoria: $in exige array');
        if (!q.some(x => casaIgualdade(valores, x))) return false; break;
      case '$nin':
        if (!Array.isArray(q)) throw new Error('banco-memoria: $nin exige array');
        if (q.some(x => casaIgualdade(valores, x))) return false; break;
      case '$exists': if ((valores.length > 0) !== Boolean(q)) return false; break;
      case '$gt': case '$gte': case '$lt': case '$lte': {
        const ok = expandir(valores).some(v => {
          if (v === undefined || rank(v) !== rank(q) || rank(q) === 1) return false;
          const c = comparar(v, q);
          return op === '$gt' ? c > 0 : op === '$gte' ? c >= 0 : op === '$lt' ? c < 0 : c <= 0;
        });
        if (!ok) return false; break;
      }
      case '$type': {
        const tipos = Array.isArray(q) ? q : [q];
        const ok = valores.some(v => tipos.some(t => tipoCasa(v, t) || (Array.isArray(v) && t !== 'array' && t !== 4 && v.some(el => tipoCasa(el, t)))));
        if (!ok) return false; break;
      }
      case '$regex': {
        const re = q instanceof RegExp ? new RegExp(q.source, (ops.$options ?? q.flags).replace('g', '')) : new RegExp(String(q), ops.$options || '');
        if (!expandir(valores).some(v => typeof v === 'string' && re.test(v))) return false; break;
      }
      case '$options': if (!Object.hasOwn(ops, '$regex')) throw new Error('banco-memoria: $options sem $regex'); break;
      case '$elemMatch': {
        const ok = valores.some(v => Array.isArray(v) && v.some(el => (ehOperadores(q) ? casaCondicao([el], q) : ehPlano(el) && casaFiltro(el, q))));
        if (!ok) return false; break;
      }
      default: throw naoSuportado(op);
    }
  }
  return true;
}

function casaFiltro(doc, filtro) {
  if (filtro === null || filtro === undefined) return true;
  if (!ehPlano(filtro)) throw new Error('banco-memoria: filtro precisa ser objeto');
  for (const [k, v] of Object.entries(filtro)) {
    if (k === '$or') {
      if (!Array.isArray(v) || !v.length) throw new Error('banco-memoria: $or exige array não vazio');
      if (!v.some(f => casaFiltro(doc, f))) return false;
    } else if (k === '$and') {
      if (!Array.isArray(v) || !v.length) throw new Error('banco-memoria: $and exige array não vazio');
      if (!v.every(f => casaFiltro(doc, f))) return false;
    } else if (k.startsWith('$')) {
      throw naoSuportado(k);
    } else {
      const valores = valoresNoCaminho(doc, k);
      if (ehPlano(v) && Object.keys(v).some(x => x.startsWith('$'))) {
        if (!ehOperadores(v)) throw new Error(`banco-memoria: mistura de operadores e campos em '${k}'`);
        if (!casaCondicao(valores, v)) return false;
      } else if (!casaIgualdade(valores, v)) return false;
    }
  }
  return true;
}

const OPERADORES_FILTRO = new Set(['$eq', '$ne', '$in', '$nin', '$exists', '$gt', '$gte', '$lt', '$lte', '$type', '$regex', '$options', '$elemMatch']);

/** Confere a lista fechada ANTES de varrer (coleção vazia também acusa operador fora da lista). */
function validarFiltro(filtro) {
  if (filtro === null || filtro === undefined) return;
  if (!ehPlano(filtro)) throw new Error('banco-memoria: filtro precisa ser objeto');
  for (const [k, v] of Object.entries(filtro)) {
    if (k === '$or' || k === '$and') {
      if (!Array.isArray(v) || !v.length) throw new Error(`banco-memoria: ${k} exige array não vazio`);
      v.forEach(validarFiltro);
    } else if (k.startsWith('$')) throw naoSuportado(k);
    else if (ehPlano(v) && Object.keys(v).some(x => x.startsWith('$'))) {
      if (!ehOperadores(v)) throw new Error(`banco-memoria: mistura de operadores e campos em '${k}'`);
      for (const [op, q] of Object.entries(v)) {
        if (!OPERADORES_FILTRO.has(op)) throw naoSuportado(op);
        if ((op === '$in' || op === '$nin') && !Array.isArray(q)) throw new Error(`banco-memoria: ${op} exige array`);
        if (op === '$elemMatch') {
          if (ehOperadores(q)) { for (const op2 of Object.keys(q)) if (!OPERADORES_FILTRO.has(op2)) throw naoSuportado(op2); } else validarFiltro(q);
        }
      }
    }
  }
}

function validarUpdate(update) {
  if (!ehPlano(update) || !Object.keys(update).length || !Object.keys(update).every(k => k.startsWith('$'))) {
    throw naoSuportado('update sem operadores (substituição)');
  }
  for (const op of Object.keys(update)) if (!OPERADORES_UPDATE.has(op)) throw naoSuportado(op);
}

// ---------- projeção ----------
function incluir(origem, destino, partes) {
  const [p, ...resto] = partes;
  if (!ehPlano(origem) || !Object.hasOwn(origem, p)) return;
  const v = origem[p];
  if (!resto.length) { destino[p] = clonar(v); return; }
  if (Array.isArray(v)) {
    if (!Array.isArray(destino[p])) destino[p] = v.map(el => (ehPlano(el) ? {} : undefined)).filter(x => x !== undefined);
    let j = 0;
    for (const el of v) if (ehPlano(el)) incluir(el, destino[p][j++], resto);
  } else if (ehPlano(v)) {
    if (!ehPlano(destino[p])) destino[p] = {};
    incluir(v, destino[p], resto);
  }
}

function projetar(doc, projecao) {
  if (!projecao || !Object.keys(projecao).length) return clonar(doc);
  const entradas = Object.entries(projecao);
  for (const [k, v] of entradas) {
    if (v !== null && typeof v === 'object') throw naoSuportado(`projeção com operador em '${k}'`);
  }
  const semId = entradas.filter(([k]) => k !== '_id');
  const inclui = semId.some(([, v]) => Boolean(v));
  const exclui = semId.some(([, v]) => !v);
  if (inclui && exclui) throw new Error('banco-memoria: projeção mista (inclusão e exclusão)');
  const idFora = Object.hasOwn(projecao, '_id') && !projecao._id;
  if (inclui) {
    const out = {};
    if (!idFora && Object.hasOwn(doc, '_id')) out._id = clonar(doc._id);
    for (const [k] of semId) incluir(doc, out, k.split('.'));
    return out;
  }
  const out = clonar(doc);
  for (const [k] of semId) apagarCaminho(out, k);
  if (idFora) delete out._id;
  return out;
}

// ---------- ordenação ----------
function valorDeOrdenacao(doc, campo, direcao) {
  const valores = valoresNoCaminho(doc, campo);
  if (!valores.length) return null;
  const v = valores[0];
  if (Array.isArray(v) && v.length) return [...v].sort(comparar)[direcao > 0 ? 0 : v.length - 1];
  return v;
}

function ordenar(docs, sort) {
  if (!sort) return docs;
  const pares = Array.isArray(sort) ? sort : Object.entries(sort);
  for (const [, d] of pares) if (d !== 1 && d !== -1 && d !== 'asc' && d !== 'desc') throw naoSuportado(`sort ${String(d)}`);
  const norm = pares.map(([c, d]) => [c, d === 'asc' ? 1 : d === 'desc' ? -1 : d]);
  return [...docs].sort((a, b) => {
    for (const [c, d] of norm) {
      const x = comparar(valorDeOrdenacao(a, c, d), valorDeOrdenacao(b, c, d));
      if (x) return x * d;
    }
    return 0;
  });
}

// ---------- atualização ----------
const OPERADORES_UPDATE = new Set(['$set', '$setOnInsert', '$unset', '$push', '$pull', '$addToSet', '$inc', '$max']);

function condicoesDoPrefixo(filtro, prefixo) {
  const conds = [];
  const visitar = (f) => {
    if (!ehPlano(f)) return;
    for (const [k, v] of Object.entries(f)) {
      if (k === '$and' && Array.isArray(v)) v.forEach(visitar);
      else if (k === prefixo) {
        if (ehOperadores(v) && Object.hasOwn(v, '$elemMatch')) {
          const q = v.$elemMatch;
          conds.push(el => (ehOperadores(q) ? casaCondicao([el], q) : ehPlano(el) && casaFiltro(el, q)));
        } else if (ehOperadores(v)) conds.push(el => casaCondicao([el], v));
        else conds.push(el => iguais(el, v) || (v instanceof RegExp && typeof el === 'string' && v.test(el)));
      } else if (k.startsWith(prefixo + '.')) {
        const sub = k.slice(prefixo.length + 1);
        conds.push(el => ehPlano(el) && casaFiltro(el, { [sub]: v }));
      }
    }
  };
  visitar(filtro);
  return conds;
}

function resolverPosicional(caminho, doc, filtro) {
  const i = caminho.indexOf('.$');
  if (i < 0) return caminho;
  if (!/^\.\$(\.|$)/.test(caminho.slice(i))) throw naoSuportado(`operador posicional em '${caminho}'`);
  const prefixo = caminho.slice(0, i);
  const arr = obterCaminho(doc, prefixo);
  const conds = condicoesDoPrefixo(filtro, prefixo);
  if (!Array.isArray(arr) || !conds.length) throw new Error(`banco-memoria: operador posicional sem correspondência em '${caminho}'`);
  const idx = arr.findIndex(el => conds.every(c => c(el)));
  if (idx < 0) throw new Error(`banco-memoria: operador posicional sem correspondência em '${caminho}'`);
  return prefixo + '.' + idx + caminho.slice(i + 2);
}

function aplicarUpdate(doc, update, filtro, inserindo) {
  if (!ehPlano(update) || !Object.keys(update).length || !Object.keys(update).every(k => k.startsWith('$'))) {
    throw naoSuportado('update sem operadores (substituição)');
  }
  for (const [op, campos] of Object.entries(update)) {
    if (!OPERADORES_UPDATE.has(op)) throw naoSuportado(op);
    if (!ehPlano(campos)) throw new Error(`banco-memoria: ${op} exige objeto`);
    if (op === '$setOnInsert' && !inserindo) continue;
    for (const [caminhoBruto, valor] of Object.entries(campos)) {
      const caminho = resolverPosicional(caminhoBruto, doc, filtro);
      if (caminho === '_id' && op !== '$setOnInsert' && Object.hasOwn(doc, '_id') && !inserindo && !iguais(doc._id, valor)) {
        const e = new Error("Performing an update on the path '_id' would modify the immutable field '_id'");
        e.name = 'MongoServerError'; e.code = 66;
        throw e;
      }
      const atual = obterCaminho(doc, caminho);
      switch (op) {
        case '$set': case '$setOnInsert': definirCaminho(doc, caminho, clonar(valor)); break;
        case '$unset': apagarCaminho(doc, caminho); break;
        case '$inc':
          if (typeof valor !== 'number') throw new Error('banco-memoria: $inc exige número');
          if (atual !== undefined && atual !== null && typeof atual !== 'number') throw new Error(`banco-memoria: $inc em campo não numérico '${caminho}'`);
          definirCaminho(doc, caminho, (atual ?? 0) + valor); break;
        case '$max':
          if (atual === undefined || comparar(valor, atual) > 0) definirCaminho(doc, caminho, clonar(valor)); break;
        case '$push': case '$addToSet': {
          let itens = [valor];
          let fatia = null;
          if (ehPlano(valor) && Object.keys(valor).some(k => k.startsWith('$'))) {
            for (const k of Object.keys(valor)) if (!['$each', ...(op === '$push' ? ['$slice'] : [])].includes(k)) throw naoSuportado(`${op} com ${k}`);
            if (!Array.isArray(valor.$each)) throw new Error(`banco-memoria: ${op}.$each exige array`);
            itens = valor.$each;
            fatia = Object.hasOwn(valor, '$slice') ? valor.$slice : null;
          }
          if (atual !== undefined && atual !== null && !Array.isArray(atual)) throw new Error(`banco-memoria: ${op} em campo que não é array '${caminho}'`);
          const lista = Array.isArray(atual) ? atual : [];
          for (const it of itens) {
            if (op === '$addToSet' && lista.some(x => iguais(x, it))) continue;
            lista.push(clonar(it));
          }
          let final = lista;
          if (fatia !== null) {
            if (!Number.isInteger(fatia)) throw new Error('banco-memoria: $slice exige inteiro');
            final = fatia >= 0 ? lista.slice(0, fatia) : lista.slice(fatia);
          }
          definirCaminho(doc, caminho, final); break;
        }
        case '$pull': {
          if (!Array.isArray(atual)) break;
          const remove = el => (ehOperadores(valor) ? casaCondicao([el], valor) : ehPlano(valor) ? ehPlano(el) && casaFiltro(el, valor) : iguais(el, valor));
          definirCaminho(doc, caminho, atual.filter(el => !remove(el))); break;
        }
        default: throw naoSuportado(op);
      }
    }
  }
  return doc;
}

function docDoUpsert(filtro) {
  const doc = {};
  const visitar = (f) => {
    for (const [k, v] of Object.entries(f || {})) {
      if (k === '$and' && Array.isArray(v)) v.forEach(visitar);
      else if (k.startsWith('$')) continue;
      else if (ehOperadores(v)) { if (Object.hasOwn(v, '$eq')) definirCaminho(doc, k, clonar(v.$eq)); }
      else if (!(v instanceof RegExp)) definirCaminho(doc, k, clonar(v));
    }
  };
  visitar(filtro);
  return doc;
}

// ---------- índices ----------
function nomePadrao(chave) {
  return Object.entries(chave).map(([k, v]) => `${k}_${v}`).join('_');
}

function chaveDoIndice(doc, spec) {
  const campos = Object.keys(spec.chave);
  const valores = campos.map(c => { const vs = valoresNoCaminho(doc, c); return vs.length ? vs[0] : null; });
  const ausentes = campos.every(c => valoresNoCaminho(doc, c).length === 0);
  return { campos, valores, ausentes };
}

function indiceSeAplica(doc, spec) {
  const o = spec.opcoes || {};
  if (o.partialFilterExpression && !casaFiltro(doc, o.partialFilterExpression)) return false;
  if (o.sparse && chaveDoIndice(doc, spec).ausentes) return false;
  return true;
}

function formatarValor(v) {
  if (v === null || v === undefined) return 'null';
  if (ehObjectId(v)) return `ObjectId('${v.toHexString()}')`;
  if (v instanceof Date) return `new Date(${v.getTime()})`;
  return JSON.stringify(v);
}

function erroDuplicado(nomeBanco, nomeCol, spec, doc) {
  const { campos, valores } = chaveDoIndice(doc, spec);
  const keyValue = {};
  campos.forEach((c, i) => { keyValue[c] = clonar(valores[i]); });
  const dup = campos.map((c, i) => `${c}: ${formatarValor(valores[i])}`).join(', ');
  const e = new Error(`E11000 duplicate key error collection: ${nomeBanco}.${nomeCol} index: ${spec.opcoes.name} dup key: { ${dup} }`);
  e.name = 'MongoServerError';
  e.code = 11000;
  e.keyPattern = { ...spec.chave };
  e.keyValue = keyValue;
  e.errorResponse = { code: 11000, errmsg: e.message, keyPattern: { ...spec.chave }, keyValue };
  return e;
}

function mesmasOpcoes(a = {}, b = {}) {
  const chaves = ['unique', 'sparse', 'expireAfterSeconds', 'partialFilterExpression'];
  return chaves.every(k => iguais(a[k] ?? null, b[k] ?? null));
}

// ---------- banco ----------
export function criarBancoMemoria({ indices = [], nome = 'memoria' } = {}) {
  const colecoes = new Map(); // nome → { docs: [], indices: Map(nomeIndice → spec) }
  const contagem = new Map(); // `${colecao}:${op}` → n

  const banco = {
    falhar: {},
    portao: null,
    portoes: {},
    collection(nomeCol) {
      if (typeof nomeCol !== 'string' || !nomeCol) throw new Error('banco-memoria: nome de coleção inválido');
      return objetoColecao(nomeCol);
    },
    /** Quantas vezes `op` foi chamada (numa coleção ou em todas). */
    contagem(op, colecao = null) {
      if (colecao) return contagem.get(`${colecao}:${op}`) || 0;
      let n = 0;
      for (const [k, v] of contagem) if (k.endsWith(`:${op}`)) n += v;
      return n;
    },
    /** Especificações de índice ativas numa coleção. */
    indicesDe(nomeCol) {
      return [...estado(nomeCol).indices.values()].map(s => clonar({ colecao: nomeCol, chave: s.chave, opcoes: s.opcoes }));
    },
    /** Cópia dos documentos (para asserções). */
    documentos(nomeCol) {
      return estado(nomeCol).docs.map(clonar);
    },
    colecoes() {
      return [...colecoes.keys()].filter(n => colecoes.get(n).docs.length > 0);
    },
    /** Simula a remoção dos índices TTL (expireAfterSeconds) até `agora`. */
    expirar(agora = new Date()) {
      let removidos = 0;
      for (const est of colecoes.values()) {
        for (const spec of est.indices.values()) {
          const seg = spec.opcoes?.expireAfterSeconds;
          if (typeof seg !== 'number') continue;
          const campo = Object.keys(spec.chave)[0];
          const antes = est.docs.length;
          est.docs = est.docs.filter(d => {
            const v = obterCaminho(d, campo);
            return !(v instanceof Date) || v.getTime() + seg * 1000 > agora.getTime();
          });
          removidos += antes - est.docs.length;
        }
      }
      return removidos;
    },
    /** Apaga os documentos de todas as coleções (os índices ficam). */
    limpar() {
      for (const est of colecoes.values()) est.docs = [];
    }
  };

  function estado(nomeCol) {
    let est = colecoes.get(nomeCol);
    if (!est) {
      est = { docs: [], indices: new Map() };
      colecoes.set(nomeCol, est);
    }
    return est;
  }

  function registrarSpec(spec) {
    if (!spec || typeof spec.colecao !== 'string' || !ehPlano(spec.chave)) throw new Error('banco-memoria: especificação de índice inválida');
    const opcoes = { ...(spec.opcoes || {}) };
    if (!opcoes.name) opcoes.name = nomePadrao(spec.chave);
    const est = estado(spec.colecao);
    const existente = est.indices.get(opcoes.name);
    if (existente) {
      if (!iguais(existente.chave, spec.chave)) {
        const e = new Error(`An existing index has the same name as the requested index: ${opcoes.name}`);
        e.name = 'MongoServerError'; e.code = 86; e.codeName = 'IndexKeySpecsConflict';
        throw e;
      }
      if (!mesmasOpcoes(existente.opcoes, opcoes)) {
        const e = new Error(`Index already exists with different options: ${opcoes.name}`);
        e.name = 'MongoServerError'; e.code = 85; e.codeName = 'IndexOptionsConflict';
        throw e;
      }
      return opcoes.name;
    }
    for (const s of est.indices.values()) {
      if (iguais(s.chave, spec.chave) && mesmasOpcoes(s.opcoes, opcoes)) {
        const e = new Error(`Index already exists with a different name: ${s.opcoes.name}`);
        e.name = 'MongoServerError'; e.code = 85; e.codeName = 'IndexOptionsConflict';
        throw e;
      }
    }
    const nova = { chave: { ...spec.chave }, opcoes };
    if (opcoes.unique) {
      const docs = est.docs.filter(d => indiceSeAplica(d, nova));
      for (let i = 0; i < docs.length; i++) {
        for (let j = i + 1; j < docs.length; j++) {
          if (iguais(chaveDoIndice(docs[i], nova).valores, chaveDoIndice(docs[j], nova).valores)) throw erroDuplicado(nome, spec.colecao, nova, docs[j]);
        }
      }
    }
    est.indices.set(opcoes.name, nova);
    return opcoes.name;
  }

  for (const spec of [...INDICES_LEGADOS, ...indices]) registrarSpec(spec);

  function conferirUnicos(nomeCol, doc, ignorar) {
    const est = estado(nomeCol);
    for (const spec of est.indices.values()) {
      if (!spec.opcoes.unique || !indiceSeAplica(doc, spec)) continue;
      const alvo = chaveDoIndice(doc, spec).valores;
      for (const outro of est.docs) {
        if (outro === ignorar || !indiceSeAplica(outro, spec)) continue;
        if (iguais(chaveDoIndice(outro, spec).valores, alvo)) throw erroDuplicado(nome, nomeCol, spec, doc);
      }
    }
  }

  async function antes(op, nomeCol) {
    const k = `${nomeCol}:${op}`;
    contagem.set(k, (contagem.get(k) || 0) + 1);
    const portao = banco.portoes?.[op] || banco.portao;
    if (portao) await portao;
    const f = banco.falhar?.[op];
    let falha = false;
    if (f === true) falha = true;
    else if (typeof f === 'number' && f > 0) { falha = true; banco.falhar[op] = f - 1; }
    else if (typeof f === 'string') falha = f === nomeCol;
    else if (typeof f === 'function') falha = Boolean(f(nomeCol, op));
    if (falha) throw erroDeRede();
  }

  function selecionar(nomeCol, filtro, { sort = null, skip = 0, limit = 0 } = {}) {
    validarFiltro(filtro || {});
    let docs = estado(nomeCol).docs.filter(d => casaFiltro(d, filtro || {}));
    docs = ordenar(docs, sort);
    if (skip) docs = docs.slice(skip);
    if (limit) docs = docs.slice(0, Math.abs(limit));
    return docs;
  }

  function inserirUm(nomeCol, original) {
    if (!ehPlano(original)) throw new Error('banco-memoria: documento precisa ser objeto');
    if (!Object.hasOwn(original, '_id') || original._id === undefined) original._id = new ObjectId(); // o driver muta o documento
    const doc = clonar(original);
    conferirUnicos(nomeCol, doc, null);
    estado(nomeCol).docs.push(doc);
    return doc._id;
  }

  function atualizarDocs(nomeCol, filtro, update, { upsert = false, multi = false, sort = null } = {}) {
    validarUpdate(update);
    const est = estado(nomeCol);
    const alvos = multi ? selecionar(nomeCol, filtro) : selecionar(nomeCol, filtro, { sort, limit: 1 });
    if (!alvos.length) {
      if (!upsert) return { matchedCount: 0, modifiedCount: 0, upsertedId: null, antes: null, depois: null };
      const novo = aplicarUpdate(docDoUpsert(filtro), update, filtro, true);
      if (novo._id === undefined || novo._id === null) novo._id = new ObjectId();
      const doc = clonar(novo);
      conferirUnicos(nomeCol, doc, null);
      est.docs.push(doc);
      return { matchedCount: 0, modifiedCount: 0, upsertedId: doc._id, antes: null, depois: doc };
    }
    let modificados = 0;
    let primeiroAntes = null;
    let primeiroDepois = null;
    for (const alvo of alvos) {
      const copia = aplicarUpdate(clonar(alvo), update, filtro, false);
      conferirUnicos(nomeCol, copia, alvo);
      const mudou = !iguais(copia, alvo);
      if (primeiroAntes === null) primeiroAntes = clonar(alvo);
      if (mudou) {
        const i = est.docs.indexOf(alvo);
        est.docs[i] = copia;
        modificados++;
      }
      if (primeiroDepois === null) primeiroDepois = mudou ? copia : alvo;
    }
    return { matchedCount: alvos.length, modifiedCount: modificados, upsertedId: null, antes: primeiroAntes, depois: primeiroDepois };
  }

  function removerDocs(nomeCol, filtro, multi) {
    const est = estado(nomeCol);
    const alvos = multi ? selecionar(nomeCol, filtro) : selecionar(nomeCol, filtro, { limit: 1 });
    const set = new Set(alvos);
    est.docs = est.docs.filter(d => !set.has(d));
    return alvos.length;
  }

  function criarCursor(nomeCol, filtro, opcoes = {}) {
    const estadoCursor = {
      sort: opcoes.sort || null,
      skip: opcoes.skip || 0,
      limit: opcoes.limit || 0,
      projection: opcoes.projection || null,
      transformar: null,
      buffer: null
    };
    const executar = async () => {
      await antes('find', nomeCol);
      const docs = selecionar(nomeCol, filtro, estadoCursor).map(d => projetar(d, estadoCursor.projection));
      return estadoCursor.transformar ? docs.map(estadoCursor.transformar) : docs;
    };
    const cursor = {
      sort(s) { estadoCursor.sort = s; return proxy; },
      skip(n) { estadoCursor.skip = n; return proxy; },
      limit(n) { estadoCursor.limit = n; return proxy; },
      project(p) { estadoCursor.projection = p; return proxy; },
      map(fn) { const anterior = estadoCursor.transformar; estadoCursor.transformar = anterior ? d => fn(anterior(d)) : fn; return proxy; },
      async toArray() { return executar(); },
      async next() {
        if (!estadoCursor.buffer) estadoCursor.buffer = await executar();
        return estadoCursor.buffer.length ? estadoCursor.buffer.shift() : null;
      },
      async close() {},
      async *[Symbol.asyncIterator]() { for (const d of await executar()) yield d; }
    };
    const proxy = new Proxy(cursor, {
      get(alvo, prop) {
        if (typeof prop === 'symbol' || prop in alvo) return alvo[prop];
        if (prop === 'then' || prop === 'toJSON' || prop === 'constructor' || prop === 'inspect') return undefined;
        throw naoSuportado(`cursor.${String(prop)}`);
      }
    });
    return proxy;
  }

  const cacheColecoes = new Map();
  function objetoColecao(nomeCol) {
    if (cacheColecoes.has(nomeCol)) return cacheColecoes.get(nomeCol);
    estado(nomeCol);
    const metodos = {
      collectionName: nomeCol,
      find(filtro = {}, opcoes = {}) {
        return criarCursor(nomeCol, filtro, opcoes);
      },
      async findOne(filtro = {}, opcoes = {}) {
        await antes('findOne', nomeCol);
        const [d] = selecionar(nomeCol, filtro, { sort: opcoes.sort, skip: opcoes.skip, limit: 1 });
        return d ? projetar(d, opcoes.projection) : null;
      },
      async countDocuments(filtro = {}, opcoes = {}) {
        await antes('countDocuments', nomeCol);
        return selecionar(nomeCol, filtro, { skip: opcoes.skip, limit: opcoes.limit }).length;
      },
      async distinct(campo, filtro = {}) {
        await antes('distinct', nomeCol);
        const vistos = [];
        for (const d of selecionar(nomeCol, filtro)) {
          for (const v of valoresNoCaminho(d, campo).flatMap(x => (Array.isArray(x) ? x : [x]))) {
            if (!vistos.some(x => iguais(x, v))) vistos.push(clonar(v));
          }
        }
        return vistos;
      },
      async insertOne(doc) {
        await antes('insertOne', nomeCol);
        const insertedId = inserirUm(nomeCol, doc);
        return { acknowledged: true, insertedId };
      },
      async insertMany(docs, { ordered = true } = {}) {
        await antes('insertMany', nomeCol);
        if (!Array.isArray(docs)) throw new Error('banco-memoria: insertMany exige array');
        const insertedIds = {};
        const writeErrors = [];
        let insertedCount = 0;
        for (let i = 0; i < docs.length; i++) {
          try {
            insertedIds[i] = inserirUm(nomeCol, docs[i]);
            insertedCount++;
          } catch (err) {
            if (err.code !== 11000) throw err;
            writeErrors.push({ index: i, code: 11000, errmsg: err.message, keyPattern: err.keyPattern, keyValue: err.keyValue });
            if (ordered) break;
          }
        }
        if (writeErrors.length) {
          const e = new Error(writeErrors[0].errmsg);
          e.name = 'MongoBulkWriteError';
          e.code = 11000;
          e.writeErrors = writeErrors;
          e.insertedCount = insertedCount;
          e.insertedIds = insertedIds;
          e.result = { insertedCount, insertedIds };
          throw e;
        }
        return { acknowledged: true, insertedCount, insertedIds };
      },
      async updateOne(filtro, update, opcoes = {}) {
        await antes('updateOne', nomeCol);
        const r = atualizarDocs(nomeCol, filtro, update, { upsert: !!opcoes.upsert, multi: false });
        return { acknowledged: true, matchedCount: r.matchedCount, modifiedCount: r.modifiedCount, upsertedId: r.upsertedId, upsertedCount: r.upsertedId ? 1 : 0 };
      },
      async updateMany(filtro, update, opcoes = {}) {
        await antes('updateMany', nomeCol);
        const r = atualizarDocs(nomeCol, filtro, update, { upsert: !!opcoes.upsert, multi: true });
        return { acknowledged: true, matchedCount: r.matchedCount, modifiedCount: r.modifiedCount, upsertedId: r.upsertedId, upsertedCount: r.upsertedId ? 1 : 0 };
      },
      async findOneAndUpdate(filtro, update, opcoes = {}) {
        await antes('findOneAndUpdate', nomeCol);
        const { returnDocument = 'before', upsert = false, projection = null, sort = null, includeResultMetadata = false } = opcoes;
        const r = atualizarDocs(nomeCol, filtro, update, { upsert, multi: false, sort });
        const base = returnDocument === 'after' ? r.depois : r.antes;
        const value = base ? projetar(base, projection) : null;
        if (includeResultMetadata) {
          return { value, ok: 1, lastErrorObject: { n: r.matchedCount || (r.upsertedId ? 1 : 0), updatedExisting: r.matchedCount > 0, ...(r.upsertedId ? { upserted: r.upsertedId } : {}) } };
        }
        return value;
      },
      async deleteOne(filtro = {}) {
        await antes('deleteOne', nomeCol);
        return { acknowledged: true, deletedCount: removerDocs(nomeCol, filtro, false) };
      },
      async deleteMany(filtro = {}) {
        await antes('deleteMany', nomeCol);
        return { acknowledged: true, deletedCount: removerDocs(nomeCol, filtro, true) };
      },
      async bulkWrite(ops, { ordered = true } = {}) {
        await antes('bulkWrite', nomeCol);
        if (!Array.isArray(ops)) throw new Error('banco-memoria: bulkWrite exige array');
        const r = { insertedCount: 0, matchedCount: 0, modifiedCount: 0, deletedCount: 0, upsertedCount: 0, upsertedIds: {}, insertedIds: {} };
        const writeErrors = [];
        ops.forEach((op, i) => {
          if (ordered && writeErrors.length) return;
          const [tipo, corpo] = Object.entries(op || {})[0] || [];
          try {
            switch (tipo) {
              case 'insertOne': r.insertedIds[i] = inserirUm(nomeCol, corpo.document); r.insertedCount++; break;
              case 'updateOne': case 'updateMany': {
                const x = atualizarDocs(nomeCol, corpo.filter, corpo.update, { upsert: !!corpo.upsert, multi: tipo === 'updateMany' });
                r.matchedCount += x.matchedCount; r.modifiedCount += x.modifiedCount;
                if (x.upsertedId) { r.upsertedCount++; r.upsertedIds[i] = x.upsertedId; }
                break;
              }
              case 'deleteOne': case 'deleteMany': r.deletedCount += removerDocs(nomeCol, corpo.filter, tipo === 'deleteMany'); break;
              default: throw naoSuportado(`bulkWrite.${String(tipo)}`);
            }
          } catch (err) {
            if (err.code !== 11000) throw err;
            writeErrors.push({ index: i, code: 11000, errmsg: err.message, keyPattern: err.keyPattern, keyValue: err.keyValue });
          }
        });
        if (writeErrors.length) {
          const e = new Error(writeErrors[0].errmsg);
          e.name = 'MongoBulkWriteError';
          e.code = 11000;
          e.writeErrors = writeErrors;
          e.result = r;
          throw e;
        }
        return { acknowledged: true, ...r };
      },
      async createIndex(chave, opcoes = {}) {
        await antes('createIndex', nomeCol);
        return registrarSpec({ colecao: nomeCol, chave, opcoes });
      }
    };
    const proxy = new Proxy(metodos, {
      get(alvo, prop) {
        if (typeof prop === 'symbol' || prop in alvo) return alvo[prop];
        if (prop === 'then' || prop === 'toJSON' || prop === 'constructor' || prop === 'inspect') return undefined;
        throw naoSuportado(String(prop));
      }
    });
    cacheColecoes.set(nomeCol, proxy);
    return proxy;
  }

  return banco;
}
