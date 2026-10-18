// =============================================================
// COMPLEXO DMC · Portal — limites persistentes (coleção `limites`)
// PORTAL-API §1.6, §4.16 · dono: F0m.
//
// O throttle em memória (throttle.js) é só freio por instância; aqui
// fica o limite que precisa valer ENTRE instâncias da Vercel: falha de
// login, segundo fator, senha atual errada, e-mail por destinatário,
// CPF em uso, IA, exportação. Janela fixa por chave, com TTL no
// `expiraEm`; contagem atômica (findOneAndUpdate + $inc).
//
// Identificador pessoal (e-mail, CPF) NUNCA entra em claro numa chave:
// use cripto.hmacIdentificador(valor); IP entra truncado (/24, /48).
//
// conferirSenhaAtual: ÚNICO caminho para conferir a senha de quem JÁ
// está logado (2FA, troca de senha, encerrar sessões, troca de e-mail,
// assinatura de contrato, reautenticação da coordenação). Contador
// COMPARTILHADO por todas essas rotas.
// =============================================================
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { ErroPortal, MENSAGENS } from './erros.js';
import { MODELOS } from './email.js';

/** Chave por usuário logado para os limites de rota ('u:' + userId). */
export const chaveUsuario = req => 'u:' + String(req.user._id);

/** Contadores da senha de quem já está logado (§4.16): 5 / 15 min E 10 / 24 h. */
export const LIMITES_SENHA_LOGADO = Object.freeze({
  curto: Object.freeze({ prefixo: 'senha-logado:', janelaMs: 15 * 60 * 1000, max: 5 }),
  dia: Object.freeze({ prefixo: 'senha-logado-dia:', janelaMs: 24 * 60 * 60 * 1000, max: 10 })
});

const colecaoDe = repo => repo('limites');

function conferirChave(chave) {
  if (typeof chave !== 'string' || !chave || chave.length > 300) throw new TypeError('limitador: chave inválida.');
  if (/@/.test(chave)) throw new TypeError('limitador: e-mail em claro na chave (use hmacIdentificador).');
}

/**
 * @param {{ repo: (nome: string) => object, agora?: () => Date }} deps
 */
export function criarContadorPersistente({ repo, agora = () => new Date() } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarContadorPersistente: informe repo(nome).');

  function resposta(doc, max, t) {
    const n = Number(doc?.n) || 0;
    const bloqueadoAte = doc?.bloqueadoAte instanceof Date && doc.bloqueadoAte > t ? doc.bloqueadoAte : null;
    const ok = !bloqueadoAte && n <= max;
    const fim = bloqueadoAte && (!doc.expiraEm || bloqueadoAte > doc.expiraEm) ? bloqueadoAte : doc?.expiraEm;
    const retryAfterSeg = ok ? 0 : Math.max(1, Math.ceil(((fim instanceof Date ? fim.getTime() : t.getTime()) - t.getTime()) / 1000));
    return { ok, n, restante: Math.max(0, max - n), retryAfterSeg };
  }

  /** Conta uma ocorrência na janela da chave. → { ok, n, restante, retryAfterSeg }. */
  async function consumir(chave, { janelaMs, max }) {
    conferirChave(chave);
    if (!(janelaMs > 0) || !(max >= 0)) throw new TypeError('limitador: janelaMs e max são obrigatórios.');
    const col = colecaoDe(repo);
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const t = agora();
      let doc;
      try {
        doc = await col.findOneAndUpdate(
          { chave },
          { $inc: { n: 1 }, $setOnInsert: { expiraEm: new Date(t.getTime() + janelaMs), bloqueadoAte: null } },
          { upsert: true, returnDocument: 'after' }
        );
      } catch (err) {
        if (err?.code === 11000) continue; // dois upserts simultâneos: o outro criou; conta de novo
        throw err;
      }
      if (doc && doc.value !== undefined && doc.ok !== undefined) doc = doc.value; // includeResultMetadata
      if (!doc) continue;
      // Janela vencida que o TTL ainda não removeu: reinicia de forma atômica (só um vence a corrida).
      if (doc.expiraEm instanceof Date && doc.expiraEm <= t) {
        const bloqueio = doc.bloqueadoAte instanceof Date && doc.bloqueadoAte > t ? doc.bloqueadoAte : null;
        const novoFim = new Date(Math.max(t.getTime() + janelaMs, bloqueio ? bloqueio.getTime() : 0));
        const r = await col.updateOne(
          { _id: doc._id, expiraEm: doc.expiraEm },
          { $set: { n: 1, expiraEm: novoFim, bloqueadoAte: bloqueio } }
        );
        if (r?.modifiedCount === 1) return resposta({ n: 1, expiraEm: novoFim, bloqueadoAte: bloqueio }, max, t);
        continue;
      }
      return resposta(doc, max, t);
    }
    throw new Error('limitador: não foi possível contar (concorrência).');
  }

  /** → { n, bloqueadoAte, expiraEm } da janela vigente (vencida = 0 e expiraEm null). */
  async function ler(chave) {
    conferirChave(chave);
    const t = agora();
    const doc = await colecaoDe(repo).findOne({ chave }, { projection: { n: 1, expiraEm: 1, bloqueadoAte: 1 } });
    if (!doc) return { n: 0, bloqueadoAte: null, expiraEm: null };
    const vigente = doc.expiraEm instanceof Date && doc.expiraEm > t;
    const bloqueadoAte = doc.bloqueadoAte instanceof Date && doc.bloqueadoAte > t ? doc.bloqueadoAte : null;
    return { n: vigente ? Number(doc.n) || 0 : 0, bloqueadoAte, expiraEm: vigente ? doc.expiraEm : null };
  }

  /** Bloqueia a chave por `ms` (o documento vive pelo menos até o fim do bloqueio). */
  async function bloquear(chave, ms) {
    conferirChave(chave);
    if (!(ms > 0)) throw new TypeError('limitador: duração do bloqueio inválida.');
    const ate = new Date(agora().getTime() + ms);
    await colecaoDe(repo).updateOne(
      { chave },
      { $set: { bloqueadoAte: ate }, $max: { expiraEm: ate }, $setOnInsert: { n: 0 } },
      { upsert: true }
    );
  }

  async function zerar(chave) {
    conferirChave(chave);
    await colecaoDe(repo).deleteOne({ chave });
  }

  return Object.freeze({ consumir, ler, bloquear, zerar });
}

/**
 * Middleware de limite persistente. Estourou → 429 (`codigo`, Retry-After), logado como aviso
 * pelo tratador de erros do portal (`persistente:true`). Banco fora → next(err) → 503.
 * @param {{ consumir: Function }} contador
 * @param {{ janelaMs:number, max:number, chave:(req)=>string, mensagem?:string, codigo?:string }} opcoes
 */
export function limitePersistente(contador, { janelaMs, max, chave, mensagem, codigo = 'limite' } = {}) {
  if (!contador || typeof contador.consumir !== 'function') throw new TypeError('limitePersistente: informe o contador.');
  if (typeof chave !== 'function') throw new TypeError('limitePersistente: informe chave(req).');
  return async function limitePersistenteMiddleware(req, _res, next) {
    try {
      const r = await contador.consumir(chave(req), { janelaMs, max });
      if (r.ok) return next();
      return next(new ErroPortal(429, codigo, mensagem || MENSAGENS[codigo] || MENSAGENS.limite, { retryAfterSeg: r.retryAfterSeg, persistente: true }));
    } catch (err) {
      return next(err);
    }
  };
}

function erroMuitasTentativas(retryAfterSeg) {
  return new ErroPortal(429, 'muitas-tentativas', 'Muitas tentativas. Aguarde alguns minutos e tente de novo.', {
    retryAfterSeg, persistente: true
  });
}

/**
 * Confere a senha de quem JÁ está logado. → true (certa) | false (errada; o chamador responde
 * 400 com o campo dele, nunca 401). Bloqueado → lança 429 `muitas-tentativas` SEM rodar o bcrypt.
 * Na falha que estoura o limite (6ª em 15 min ou 11ª no dia): sessaoVersao++ (derruba as
 * sessões), auditoria `auth.senha_errada_logado`, e-mail `avisoSenhaErradaLogado` e 429.
 * Senha que não é texto → 400 `formato-invalido` (sem contar).
 *
 * @param {object} req requisição com req.user (documento de users com senhaHash)
 * @param {unknown} senha
 * @param {{ contador, auditoria?, email?, repo, checkSenha?, agora?, log? }} deps
 */
export async function conferirSenhaAtual(req, senha, { contador, auditoria = null, email = null, repo, checkSenha = bcrypt.compare, agora = () => new Date(), log = console } = {}) {
  if (!req?.user?._id) throw new TypeError('conferirSenhaAtual: requisição sem usuário.');
  if (!contador || typeof repo !== 'function') throw new TypeError('conferirSenhaAtual: informe contador e repo.');
  if (typeof senha !== 'string') throw new ErroPortal(400, 'formato-invalido');
  const userId = String(req.user._id);
  const { curto, dia } = LIMITES_SENHA_LOGADO;
  const kCurto = curto.prefixo + userId;
  const kDia = dia.prefixo + userId;

  const [lc, ld] = await Promise.all([contador.ler(kCurto), contador.ler(kDia)]);
  const fimDe = l => Math.max(l.bloqueadoAte ? l.bloqueadoAte.getTime() : 0, l.expiraEm ? l.expiraEm.getTime() : 0);
  const presos = [lc.bloqueadoAte || lc.n > curto.max ? lc : null, ld.bloqueadoAte || ld.n > dia.max ? ld : null].filter(Boolean);
  if (presos.length) {
    const ate = Math.max(...presos.map(fimDe));
    throw erroMuitasTentativas(ate ? Math.max(1, Math.ceil((ate - agora().getTime()) / 1000)) : Math.ceil(curto.janelaMs / 1000));
  }

  const hash = typeof req.user.senhaHash === 'string' ? req.user.senhaHash : '';
  const certa = !!hash && senha.length > 0 && Buffer.byteLength(senha, 'utf8') <= 72 && await checkSenha(senha, hash);
  if (certa) return true;

  const [rc, rd] = await Promise.all([
    contador.consumir(kCurto, { janelaMs: curto.janelaMs, max: curto.max }),
    contador.consumir(kDia, { janelaMs: dia.janelaMs, max: dia.max })
  ]);
  const estourouAgora = (rc.n === curto.max + 1) || (rd.n === dia.max + 1);
  if (!rc.ok || !rd.ok) {
    if (estourouAgora) {
      try {
        await repo('users').updateOne({ _id: req.user._id instanceof ObjectId ? req.user._id : new ObjectId(userId) }, { $inc: { sessaoVersao: 1 } });
      } catch (err) {
        try { log.error(`[portal] senha-logado: sessões não encerradas (${err?.name || 'erro'})`); } catch { /* nada */ }
        throw err;
      }
      if (auditoria) {
        await auditoria.registrar({
          acao: 'auth.senha_errada_logado',
          entidade: { tipo: 'usuario', id: userId },
          alvoUserId: userId,
          extra: { janela: rc.n === curto.max + 1 ? '15min' : '24h', tentativas: rc.n === curto.max + 1 ? rc.n : rd.n }
        }, req);
      }
      if (email && req.user.email) {
        email.enviarEmSegundoPlano({ para: req.user.email, ...MODELOS.avisoSenhaErradaLogado({ nome: req.user.nome }) });
      }
    }
    throw erroMuitasTentativas(Math.max(rc.retryAfterSeg || 0, rd.ok ? 0 : rd.retryAfterSeg || 0) || Math.ceil(curto.janelaMs / 1000));
  }
  return false;
}
