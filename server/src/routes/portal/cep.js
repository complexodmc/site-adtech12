// =============================================================
// COMPLEXO DMC · Portal — consulta de CEP pelo SERVIDOR (ViaCEP)
// PORTAL-API §6.3.2 (GET /portal/cep/:cep), §7.8 A10 · dono: F0t.
//
// Ordem: cache em memória (LRU 1.000, 7 dias) → coleção `cache_cep`
// (30 dias; "não encontrado" 1 dia) → https://viacep.com.br/ws/<cep>/json/
// com AbortSignal.timeout(2500). Só o CEP sai do servidor. Falha de rede,
// timeout, HTTP ≠ 200, JSON ou UF inválidos → 503 `cep-indisponivel`
// (não cacheia; a tela segue com preenchimento manual). Endereço no
// exterior não consulta (a tela nem chama).
// =============================================================
import { ErroPortal, MENSAGENS } from '../../portal/erros.js';
import { validarCep, UFS } from '../../portal/validacao.js';
import { registrarIndices } from '../../portal/indices.js';
import { chaveUsuario } from '../../portal/limitador.js';
import { PROVEDORES_PADRAO } from '../../portal/config-portal.js';

export const INDICES_CEP = Object.freeze([
  { colecao: 'cache_cep', chave: { expiraEm: 1 }, opcoes: { name: 'ttl_cep', expireAfterSeconds: 0 } }
]);
registrarIndices(INDICES_CEP);

const DIA = 24 * 60 * 60 * 1000;
export const CEP_TIMEOUT_MS = 2500;
export const CACHE_MEMORIA = Object.freeze({ max: 1000, ttlMs: 7 * DIA });
export const CACHE_BANCO = Object.freeze({ encontradoMs: 30 * DIA, naoEncontradoMs: DIA });

const textoCurto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** LRU simples sobre Map (ordem de inserção). */
export function criarLru({ max = CACHE_MEMORIA.max, ttlMs = CACHE_MEMORIA.ttlMs, agora = () => Date.now() } = {}) {
  const m = new Map();
  return {
    get(k) {
      const e = m.get(k);
      if (!e) return undefined;
      if (e.ate <= agora()) { m.delete(k); return undefined; }
      m.delete(k); m.set(k, e);
      return e.v;
    },
    set(k, v, ttl = ttlMs) {
      m.delete(k);
      m.set(k, { v, ate: agora() + ttl });
      while (m.size > max) m.delete(m.keys().next().value);
    },
    get tamanho() { return m.size; },
    limpar() { m.clear(); }
  };
}

/**
 * @param {{ router, repo, fetchImpl?, urlViaCep?, throttle, agora?, timeoutMs?, log? }} deps
 */
export function criarRotaCep(deps = {}) {
  const {
    router, repo, fetchImpl = globalThis.fetch, urlViaCep = PROVEDORES_PADRAO.viacep, throttle, agora = () => new Date(),
    timeoutMs = CEP_TIMEOUT_MS, log = console
  } = deps;
  if (!router || typeof repo !== 'function' || typeof throttle !== 'function') throw new TypeError('criarRotaCep: informe router, repo e throttle.');
  const memoria = deps.memoria || criarLru({ agora: () => agora().getTime() });
  const base = String(urlViaCep || PROVEDORES_PADRAO.viacep).replace(/\/+$/, '');
  const lim = throttle({ janelaMs: 10 * 60 * 1000, max: 30, chave: chaveUsuario, codigo: 'limite', mensagem: MENSAGENS.limite });

  const naoEncontrado = () => new ErroPortal(404, 'cep-nao-encontrado');
  const indisponivel = () => new ErroPortal(503, 'cep-indisponivel');

  async function consultarProvedor(cep) {
    let resp;
    try {
      resp = await fetchImpl(`${base}/ws/${cep}/json/`, { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      return { erro: 'rede' };
    }
    if (!resp || resp.status !== 200) return { erro: 'http' };
    let j;
    try { j = await resp.json(); } catch { return { erro: 'json' }; }
    if (!j || typeof j !== 'object' || Array.isArray(j)) return { erro: 'json' };
    if (j.erro === true || j.erro === 'true') return { naoEncontrado: true };
    const uf = textoCurto(j.uf, 2).toUpperCase();
    if (!UFS.includes(uf)) return { erro: 'uf' };
    return { dados: { logradouro: textoCurto(j.logradouro, 120), bairro: textoCurto(j.bairro, 80), cidade: textoCurto(j.localidade, 80), uf } };
  }

  router.get('/cep/:cep', lim, async (req, res) => {
    const cep = validarCep(req.params.cep);
    if (!cep) throw new ErroPortal(400, 'validacao', undefined, { campos: { cep: 'CEP inválido (8 números).' } });
    const t = agora();
    const mem = memoria.get(cep);
    if (mem) {
      if (mem.naoEncontrado) throw naoEncontrado();
      return res.json({ cep, ...mem.dados, fonte: 'cache' });
    }
    const salvo = await repo('cache_cep').findOne({ _id: cep });
    if (salvo && salvo.expiraEm > t) {
      if (salvo.naoEncontrado) { memoria.set(cep, { naoEncontrado: true }, CACHE_BANCO.naoEncontradoMs); throw naoEncontrado(); }
      if (salvo.dados) { memoria.set(cep, { dados: salvo.dados }); return res.json({ cep, ...salvo.dados, fonte: 'cache' }); }
    }
    const r = await consultarProvedor(cep);
    if (r.erro) {
      try { (log.warn || log.error).call(log, JSON.stringify({ nivel: 'aviso', evento: 'portal.cep', motivo: r.erro })); } catch { /* nada */ }
      throw indisponivel();
    }
    const gravar = async (doc) => {
      try { await repo('cache_cep').updateOne({ _id: cep }, { $set: doc }, { upsert: true }); } catch { /* cache é melhor esforço */ }
    };
    if (r.naoEncontrado) {
      memoria.set(cep, { naoEncontrado: true }, CACHE_BANCO.naoEncontradoMs);
      await gravar({ dados: null, naoEncontrado: true, consultadoEm: t, expiraEm: new Date(t.getTime() + CACHE_BANCO.naoEncontradoMs) });
      throw naoEncontrado();
    }
    memoria.set(cep, { dados: r.dados });
    await gravar({ dados: r.dados, naoEncontrado: false, consultadoEm: t, expiraEm: new Date(t.getTime() + CACHE_BANCO.encontradoMs) });
    res.json({ cep, ...r.dados, fonte: 'viacep' });
  });

  return router;
}

/** Montagem no agregador (API §5.1). */
export default async function montar(ctx) {
  const c = ctx.comum;
  criarRotaCep({
    router: ctx.rotas.aluno, repo: c.repo, throttle: c.throttle, agora: c.agora, log: c.log,
    urlViaCep: c.configPortal?.urlsProvedor?.viacep
  });
}
